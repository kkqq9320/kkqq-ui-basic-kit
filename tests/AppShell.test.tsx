// @vitest-environment jsdom
/// <reference types="vite/client" />
// 위 참조는 아래 `*?raw` 임포트의 타입을 준다(vite/client.d.ts의 `declare module
// '*?raw'`) — tests/Dialog.test.tsx:2-12와 같은 이유·같은 idiom.
//
// 가상 키보드가 열리면(useVirtualKeyboard) 포커스된 필드가 그 뒤로 가려지지 않게
// AppShell이 스크롤 호스트(#root)를 옮기는지, 닫히면 원래 자리로 돌아가는지 확인한다.
// bug-keyboard-shift.md가 실측한 근본 원인: #root는 height:100dvh로 고정돼 키보드가
// 열려도 clientHeight가 줄지 않고(안드로이드 기본 resizes-visual, index.html에
// interactive-widget 지정 없음), 브라우저 자신의 scrollIntoView는 그 상태에서 우연히만
// 맞는다 — 그래서 visualViewport로 가려진 만큼을 직접 계산해 scrollTop에 더한다
// (Select.tsx의 scrollSelectedOptionIntoView와 같은 방식). jsdom은
// Element.scrollIntoView를 구현하지 않으므로(tests/Select.test.tsx:228) 이 방식이라야
// 단위 테스트가 성립한다.
//
// `#root`는 한때 `scroll-padding-bottom: 40dvh`도 가지고 있었다(tokens.css) — 이
// 훅이 생기기 전, 키보드 위로 포커스를 세우는 유일한(암묵적) 시도였다. 이 훅이
// 생긴 뒤로는 둘이 같은 일을 각자 하는 이중 보정이 됐고, owner 실기기 트레이스가
// 그 이중 보정의 초과분(268px = 그 순간 visualViewport.height의 40%)을 정확히
// 잡아냈다 — task-scrollpad-report.md 참고. 고침은 그 패딩을 `#root`에서 완전히
// 떼는 것이었다(더 이상 tokens.css에 없다) — 아래 "네이티브 scrollIntoView가
// 뒤늦게..." 테스트가 이 이중 보정 회귀를 잡는다.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ 이 파일의 clamp 테스트 전체에 걸리는 한계 — 한 번만 적어 둔다.
//
// installClampingScrollRoot는 scrollTop에 **접근할 때** clamp한다. 실제 브라우저는
// **레이아웃 시점에** clamp한다 — 아무도 안 읽어도 깎인다. 그래서 이 파일의 clamp
// 테스트들이 실제로 검증하는 명제는 "우리 코드가 나쁜 순간에 scrollTop을 읽지
// 않는다"이지, "clamp가 일어나지 않는다"가 아니다. 후자가 훨씬 강한 명제이고, 이
// 환경에서는 증명할 수 없다. 실제로 C2 핀을 통째로 지우면 새 C2 테스트 하나만
// 빨개지고 기존 C1 테스트들은 초록으로 남는다 — 그것들은 부풀림을 되돌린 "뒤"에
// 읽기 때문이다.
//
// 같은 이유로 C2 핀 테스트는 자기 스텁에 대해 동어반복이다: 스텁이 "인라인 height가
// 100dvh를 이긴다"를 **전제로 깔고**, 바로 그 전제가 검증 대상이다. 그 전제 자체는
// owner 실기기 트레이스(n=1)에만 기대고 있다. 마찬가지로 80ms·120ms라는 두 창구의
// 길이도 여기서는 반증할 수 없다 — 실기기에서만 확인된다.
// ─────────────────────────────────────────────────────────────────────────────

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "../src/surfaces/AppShell";
import tokensCssSource from "../css/tokens.css?raw";
import controlsCssSource from "../css/controls.css?raw";

afterEach(() => {
  // 이 파일에서 가짜 타이머를 쓰는 것은 핀 가드 검사 하나뿐이지만, 안 되돌리면
  // 뒤따르는 검사의 waitFor가 영영 안 돌아 파일 전체가 멈춥니다. cleanup()보다
  // 먼저 부릅니다 — 언마운트가 예약하는 정리도 진짜 타이머 위에서 돌아야 합니다.
  vi.useRealTimers();
  cleanup();
  delete (window as { visualViewport?: unknown }).visualViewport;
  delete (window as { matchMedia?: unknown }).matchMedia;
  // jsdom 기본값으로 되돌린다 — 팬 방식 기기 테스트가 innerHeight를 1059로 덮어쓰므로,
  // 안 되돌리면 뒤따르는 테스트가 그 값을 물려받아 조용히 다른 산수를 하게 된다.
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
  delete (window as { ResizeObserver?: unknown }).ResizeObserver;
  fakeResizeObserverEntries.length = 0;
  freshObservationLog.length = 0;
  document.querySelectorAll("[data-test-root]").forEach((node) => node.remove());
  document.querySelectorAll("[data-test-outside]").forEach((node) => node.remove());
});

type FakeViewport = EventTarget & { offsetTop: number; offsetLeft: number; width: number; height: number };

/** tests/Dialog.test.tsx:14-31의 installFakeVisualViewport를 그대로 미러링한다. */
function installFakeVisualViewport(height: number, width = window.innerWidth) {
  const target = new EventTarget() as FakeViewport;
  target.offsetTop = 0;
  target.offsetLeft = 0;
  target.width = width;
  target.height = height;
  Object.defineProperty(window, "visualViewport", { configurable: true, value: target });
  return {
    /** 키보드가 올라와 아래쪽 covered px를 가린 상태 */
    openKeyboard(covered: number) {
      target.height = height - covered;
      target.dispatchEvent(new Event("resize"));
    },
    closeKeyboard() {
      target.height = height;
      target.dispatchEvent(new Event("resize"));
    },
  };
}

/** tokens.css의 실제 스크롤 호스트(#root)를 흉내 낸다. AppShell은 이 id로 찾는다. */
function renderIntoScrollRoot(ui: ReactElement) {
  const root = document.createElement("div");
  root.id = "root";
  root.setAttribute("data-test-root", "1");
  document.body.appendChild(root);
  render(ui, { container: root });
  return root;
}

/** renderIntoScrollRoot과 같지만 #root 자신을 data-keyboard-keep-visible이 붙은
 * "바깥" 요소 안에 넣는다 — 그 마커가 스크롤 호스트(#root) 경계를 벗어난 조상에
 * 있으면 무시돼야 한다는 걸 검증하는 테스트 전용 헬퍼다(그 조상은 이 훅이 옮기는
 * scrollTop으로 전혀 움직이지 않으므로 기준으로 쓸 수 없다 — src/surfaces/AppShell.tsx의
 * findKeyboardKeepVisibleAncestor 문서 참고). wrapper에 data-test-outside를 붙여
 * afterEach가 #root까지 통째로 치우게 한다. */
function renderIntoScrollRootInsideMarkedWrapper(ui: ReactElement) {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-test-outside", "1");
  wrapper.setAttribute("data-keyboard-keep-visible", "");
  document.body.appendChild(wrapper);
  const root = document.createElement("div");
  root.id = "root";
  root.setAttribute("data-test-root", "1");
  wrapper.appendChild(root);
  render(ui, { container: root });
  return { root, wrapper };
}

/** jsdom은 getBoundingClientRect를 항상 0으로 주므로, bug-keyboard-shift.md가 실측한
 * 좌표를 재현하려면 직접 덮어써야 한다. */
function stubRectBottom(element: HTMLElement, bottom: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top: bottom - 79, left: 0, right: 320, bottom, width: 320, height: 79, x: 0, y: bottom - 79, toJSON() {} }),
  });
}

/** stubRectBottom은 높이를 79(필드 하나)로 고정하지만, data-keyboard-keep-visible
 * 컨테이너는 필드+액션 버튼 줄까지 포함해 그보다 훨씬 클 수 있다 — top도 직접 정할
 * 수 있는 이 일반화 버전을 그런 요소에 쓴다. */
function stubRect(element: HTMLElement, top: number, bottom: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top, left: 0, right: 320, bottom, width: 320, height: bottom - top, x: 0, y: top, toJSON() {} }),
  });
}

/** stubRectBottomFollowingScroll의 일반화 버전 — top도 baseline으로 따로 받는다.
 * data-keyboard-keep-visible 컨테이너처럼 높이가 79 고정이 아닌 요소에, 그리고
 * 보정이 정착된 뒤의 rect를 다시 확인해야 하는 테스트(캡 케이스)에 쓴다. */
function stubRectFollowingScroll(element: HTMLElement, topAtBaseline: number, bottomAtBaseline: number, root: HTMLElement) {
  const baseline = root.scrollTop;
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => {
      const delta = root.scrollTop - baseline;
      const top = topAtBaseline - delta;
      const bottom = bottomAtBaseline - delta;
      return { top, left: 0, right: 320, bottom, width: 320, height: bottom - top, x: 0, y: top, toJSON() {} };
    },
  });
}

/** stubRectBottom과 달리 스크롤에 따라 움직인다 — 실제 브라우저에서는 #root가
 * 스크롤될수록 그 안의 모든 요소가 뷰포트 기준으로 그만큼 위로 올라간다
 * (getBoundingClientRect는 뷰포트 상대 좌표라서). 두 번째 이펙트가 애니메이션
 * 도중에 같은 요소를 다시 측정하는 시나리오(안드로이드 다단계 리사이즈)를 검증할
 * 때는 이 결합이 있어야 실제 산수가 맞는다 — 정적인 stubRectBottom을 쓰면 이미
 * 적용된 스크롤 분을 또 요구하는 이중 계산이 돼 버린다. */
function stubRectBottomFollowingScroll(element: HTMLElement, bottomAtBaseline: number, root: HTMLElement) {
  const baseline = root.scrollTop;
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => {
      const bottom = bottomAtBaseline - (root.scrollTop - baseline);
      return { top: bottom - 79, left: 0, right: 320, bottom, width: 320, height: 79, x: 0, y: bottom - 79, toJSON() {} };
    },
  });
}

function keyboardInsetOf(root: HTMLElement) {
  return (root.querySelector(".app-shell") as HTMLElement).style.getPropertyValue("--keyboard-inset");
}

/** .keyboard-inset-open은 오직 keyboard.open에서만 파생된다(지연 해제 로직과 무관) —
 * 그래서 "닫히는 렌더가 실제로 커밋됐는지"를 지연 해제 값과 상관없이 확인할 수 있는
 * 동기화 지점으로 쓴다. 이게 없으면 closeKeyboard() 직후 동기적으로 읽는 값은 아직
 * React가 커밋하기 전(옛 값)일 수도, 이미 커밋한 뒤(새 값)일 수도 있어 무엇을 재는지
 * 알 수 없다. */
function shellHasKeyboardInsetOpenMarker(root: HTMLElement) {
  return ((root.querySelector(".app-shell") as HTMLElement).className).includes("keyboard-inset-open");
}

/** root.scrollTop에 대한 모든 쓰기를 순서대로 기록한다. jsdom은 scrollTop을 그냥
 * 평범한 프로퍼티로 다루므로(레이아웃이 없어 clamp도 없음) 인스턴스 프로퍼티로
 * 가려서 매 쓰기를 가로챌 수 있다 — 한 번의 순간이동(옛 코드)과 여러 프레임에
 * 걸친 연속 이동(새 코드)을 구분하는 유일한 방법이다. */
function trackScrollTopWrites(root: HTMLElement) {
  let value = root.scrollTop;
  const writes: number[] = [];
  Object.defineProperty(root, "scrollTop", {
    configurable: true,
    get() { return value; },
    set(next: number) { value = next; writes.push(next); },
  });
  return writes;
}

/** prefers-reduced-motion을 흉내 낸다. jsdom은 매치미디어를 구현하지 않으므로
 * (그래서 평소 테스트는 전부 "reduce 아님" 경로를 탄다) 이 헬퍼를 쓴 테스트만
 * 명시적으로 설치한다. */
function installReducedMotionPreference() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() { return true; },
    }),
  });
}

/** jsdom은 ResizeObserver를 구현하지 않는다. AutoGrowTextarea처럼 포커스된 요소
 * 자신의 크기가(뷰포트 리사이즈도 focusin도 아닌 경로로) 바뀔 때 AppShell이 다시
 * 맞추는지 확인하려면, observe()를 기록해 뒀다가 테스트가 직접 콜백을 터뜨릴 수 있는
 * 가짜가 필요하다. installFakeVisualViewport와 같은 자리의 헬퍼다.
 *
 * 실제 ResizeObserver의 두 가지 동작을 반드시 흉내 내야 한다(둘 다 예전 버전에는
 * 없었다 — AppShell.tsx의 재점화 버그가 이 가짜의 구멍 때문에 안 잡혔다):
 * 1. **초기 딜리버리**: 새로 observe()한 대상은 다음 프레임에 반드시 한 번 콜백을
 *    받는다 — lastReportedSize가 아직 unset이라 지금 크기가 무엇이든 "달라진" 것으로
 *    친다. 크기가 실제로 안 바뀌어도 온다.
 * 2. **이미 관찰 중인 대상에 대한 observe()는 멱등**: 새 관찰을 만들지 않고
 *    lastReportedSize도 그대로 둔다 — 그래서 초기 딜리버리도 다시 오지 않는다.
 * disconnect() 후 곧장 observe()를 다시 부르면 (2)의 단락이 사라져 (1)이 매번 새로
 * 발동한다 — AppShell.tsx가 고치기 전까지 걸려 있던 자기재점화 루프가 바로 이 조합이다.
 */
type FakeResizeObserverEntry = { target: Element; callback: ResizeObserverCallback };
const fakeResizeObserverEntries: FakeResizeObserverEntry[] = [];
/** observe()가 "새로"(멱등 스킵이 아니라) 관찰을 시작할 때마다 그 대상을 기록한다 —
 * 자기재점화 루프는 "같은 대상을 매 프레임 새로 관찰한다"로 정확히 관측할 수 있다. */
const freshObservationLog: Element[] = [];

function installFakeResizeObserver() {
  class FakeResizeObserver {
    private callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) { this.callback = callback; }
    observe(target: Element) {
      const alreadyObserving = fakeResizeObserverEntries.some((entry) => entry.target === target && entry.callback === this.callback);
      if (alreadyObserving) return;   // 실제 스펙: 이미 관찰 중인 대상에 다시 observe()해도 새 관찰을 만들지 않는다(멱등).
      const entry = { target, callback: this.callback };
      fakeResizeObserverEntries.push(entry);
      freshObservationLog.push(target);
      // 실제 ResizeObserver는 새로 관찰을 시작한 대상에 다음 프레임에 반드시 한 번
      // 콜백을 쏜다(초기 딜리버리) — lastReportedSize가 unset이라 지금 크기와 항상
      // "다르기" 때문이다. 이걸 기록해 두지 않으면 disconnect()+observe()를 반복하는
      // 코드가 매 프레임 자기 자신을 재점화하는 버그를 이 가짜가 절대 못 잡는다.
      requestAnimationFrame(() => {
        if (fakeResizeObserverEntries.includes(entry)) entry.callback([{ target } as ResizeObserverEntry], {} as ResizeObserver);
      });
    }
    unobserve(target: Element) {
      const at = fakeResizeObserverEntries.findIndex((entry) => entry.target === target && entry.callback === this.callback);
      if (at >= 0) fakeResizeObserverEntries.splice(at, 1);
    }
    disconnect() {
      for (let i = fakeResizeObserverEntries.length - 1; i >= 0; i--) if (fakeResizeObserverEntries[i].callback === this.callback) fakeResizeObserverEntries.splice(i, 1);
    }
  }
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: FakeResizeObserver });
}

/** 지금 target을 관찰 중인 모든 콜백을 터뜨린다 — 실제 크기 변화 없이도(rect 스텁만
 * 바꾼 채로) "레이아웃이 바뀌었다"는 신호만 재현하면 충분하다. */
function fireResizeObserved(target: Element) {
  for (const entry of fakeResizeObserverEntries) if (entry.target === target) entry.callback([{ target } as ResizeObserverEntry], {} as ResizeObserver);
}

/** 실제 브라우저처럼 동작하는 가짜 스크롤 지오메트리를 설치한다: scrollHeight는
 * "기본 콘텐츠 높이 + 지금 --keyboard-inset"에서 유도하고, scrollTop은 읽고 쓸 때마다
 * 그 순간의 최댓값으로 clamp한다. jsdom은 레이아웃이 없어 scrollHeight/clientHeight가
 * 항상 0이고 scrollTop을 clamp하지도 않으므로(제한 없는 평범한 프로퍼티), A2가 고치려는
 * "패딩이 줄면 브라우저가 scrollTop을 새 최댓값으로 clamp한다"는 실제 버그 경로 자체를
 * 재현하려면 이 helper가 필요하다 — getter에서도 clamp해야, 우리 코드가 아무것도 쓰지
 * 않아도(--keyboard-inset만 줄여도) "다음에 읽었을 때 이미 줄어 있더라"는 실제 증상을
 * 그대로 흉내 낼 수 있다. */
// 실측(EXPERIMENT, 아래) 이후: baseContentHeight도 clientHeight도 나중에 바뀔 수 있게 뒀다.
// 콘텐츠 성장(AutoGrowTextarea)뿐 아니라 clientHeight 자체가 나중에 바뀌는 경우(실기기의
// 주소창 접힘 — #root가 100dvh라 키보드와 무관하게 레이아웃 뷰포트가 바뀌면 따라 바뀐다)도
// 재현해야 두 사이클 테스트가 성립한다.
//
// simulateTransitionLag(전체 브랜치 리뷰 Finding 1) — css/page.css:55의
// `.app-shell:not(.keyboard-inset-open):not(.keyboard-inset-holding) .workspace`는
// 두 마커 중 하나라도 없으면 padding-bottom에 400ms 트랜지션을 건다. 그동안 실제
// 브라우저의 scrollHeight는 "지금 커밋된 --keyboard-inset 목표값"이 아니라 "지금
// 화면에 그려진(아직 트랜지션 중일 수 있는) padding"을 반영한다. jsdom은 트랜지션을
// 계산하지 않으므로(레이아웃 엔진이 없다) 이 지연을 그대로는 재현할 수 없다 — 그래서
// 이 옵션이 켜져 있을 때만, "지금 .app-shell의 클래스 목록이 실제로 트랜지션을
// 허용하는 상태인가"를 직접 읽어 흉내 낸다: 두 마커 중 하나라도 있으면(실제로도
// 트랜지션이 안 걸리는 상태) 즉시 목표를 반영하고, 둘 다 없으면(트랜지션이 걸리는
// 상태) 마지막으로 반영됐던(스테일) 값에 머문다. 이 판정 자체가 마커 클래스의
// 유무에 달려 있으므로, 고침(마커 추가) 전에는 항상 스테일 값에 머물러 실제 버그를
// 재현하고, 고침 후에는 즉시 목표를 반영해 회귀를 잡는다 — 스텁이 아니라 이 판정이
// 테스트의 핵심이다.
function installClampingScrollRoot(root: HTMLElement, baseContentHeight: number, clientHeight: number, options: { simulateTransitionLag?: boolean } = {}) {
  const { simulateTransitionLag = false } = options;
  let content = baseContentHeight;
  let visibleHeight = clientHeight;
  /** 인라인 height가 있으면 그게 이긴다. 실제 브라우저에서 `#root{height:100dvh}`
   * (tokens.css:134) 위에 `style="height:...px"`를 얹으면 레이아웃을 정하는 건 dvh가
   * 아니라 인라인이다. 이 모델이 없으면 "닫히는 창구 동안 높이를 붙든다"는 고침이
   * 스텁에는 전혀 보이지 않아, 고침 전후가 똑같이 통과하는 무의미한 테스트가 된다. */
  function inlineHeightPx(): number | null {
    const parsed = parseFloat(root.style.height);
    return Number.isFinite(parsed) ? parsed : null;
  }
  /** clientHeight 게터와 currentMax()가 **반드시 같은 값**을 봐야 한다. 한쪽만 인라인
   * 핀을 반영하면 "높이는 붙들렸는데 상한은 안 붙들린" 실제 브라우저에 없는 상태가
   * 만들어져, 고침이 제대로 걸렸는데도 테스트가 계속 빨갛다(실제로 한 번 그랬다). */
  function effectiveHeight(): number { return inlineHeightPx() ?? visibleHeight; }
  Object.defineProperty(root, "clientHeight", { configurable: true, get: effectiveHeight });
  function shellEl(): HTMLElement | null {
    return root.querySelector(".app-shell") as HTMLElement | null;
  }
  function targetInset(): number {
    return parseFloat(shellEl()?.style.getPropertyValue("--keyboard-inset") || "0") || 0;
  }
  // 실제 css/page.css:55/87과 문자 그대로 같은 조건이어야 한다 — 이 스텁이 판정하는
  // "트랜지션이 걸리는가"가 실제 선택자와 어긋나면 재현이 거짓이 된다.
  function transitionApplies(): boolean {
    const cls = shellEl()?.className || "";
    return !cls.includes("keyboard-inset-open") && !cls.includes("keyboard-inset-holding");
  }
  let renderedInset = targetInset();
  function currentInset(): number {
    if (!simulateTransitionLag || !transitionApplies()) {
      renderedInset = targetInset();   // 트랜지션이 안 걸리는 상태 — 실제 브라우저처럼 즉시 목표를 따라간다.
      return renderedInset;
    }
    return renderedInset;   // 트랜지션이 걸린 상태 — 아직 이전 값에 머문다(최대 400ms 지연 재현).
  }
  function currentMax(): number {
    return Math.max(0, content + currentInset() - effectiveHeight());
  }
  Object.defineProperty(root, "scrollHeight", { configurable: true, get: () => content + currentInset() });
  let raw = 0;
  Object.defineProperty(root, "scrollTop", {
    configurable: true,
    // 실제 브라우저의 clamp는 레이아웃이 줄어드는 순간 scrollTop 자체를 되돌릴 수 없게
    // 바꾼다 — "표시만 줄어들고 내부 값은 그대로"가 아니다. 그래서 읽을 때도 raw 자체를
    // 영구히 깎아야 한다(get에서 min만 반환하고 raw를 그대로 두면, 나중에 currentMax가
    // 다시 커졌을 때 raw의 옛 값이 "부활"해 버린다 — 실제 브라우저에는 없는 아티팩트).
    get() {
      const max = currentMax();
      if (raw > max) raw = max;
      return raw;
    },
    set(next: number) { raw = Math.min(next, currentMax()); },
  });
  return {
    currentMax,
    growContentBy(delta: number) { content += delta; },
    setClientHeight(next: number) { visibleHeight = next; },
  };
}

/** .keyboard-inset-holding은 releaseFloor > 0인 동안(지연 해제 진행 중)에만 붙는다 —
 * shellHasKeyboardInsetOpenMarker와 같은 동기화 idiom. */
function shellHasHoldingMarker(root: HTMLElement) {
  return ((root.querySelector(".app-shell") as HTMLElement).className).includes("keyboard-inset-holding");
}

/** .app-shell의 style 속성(--keyboard-inset)에 대한 모든 "실제 변경"을 순서대로 기록한다 —
 * trackScrollTopWrites와 같은 목적, 대상만 --keyboard-inset이다. React는 이전 렌더와 값이
 * 같으면 그 스타일 프로퍼티를 아예 건드리지 않으므로(diff 후 변경분만 적용), 같은 값으로
 * "유지"만 하는 렌더(예: 닫히는 순간의 hold)는 여기 기록되지 않는다 — 실제로 값이 바뀔
 * 때만 기록되므로, 한 번의 순간이동과 여러 프레임에 걸친 연속적인 변화를 구분할 수 있다.
 * MutationObserver는 jsdom이 실제로 구현하므로(React의 style.setProperty 호출이 곧 style
 * 속성의 직렬화된 값을 바꾼다) React의 내부 쓰기 경로를 직접 몽키패치하지 않고도 관찰이
 * 가능하다. */
function trackKeyboardInsetWrites(root: HTMLElement): number[] {
  const shell = root.querySelector(".app-shell") as HTMLElement;
  const writes: number[] = [];
  const observer = new MutationObserver(() => {
    writes.push(parseFloat(shell.style.getPropertyValue("--keyboard-inset")) || 0);
  });
  observer.observe(shell, { attributes: true, attributeFilter: ["style"] });
  return writes;
}

function Page() {
  return <AppShell sidebar={<div />}>
    <textarea aria-label="메모" />
  </AppShell>;
}

/** Page()와 달리 필드를 액션 버튼 줄과 함께 컨테이너 하나(.memo-group)로 감싼다 —
 * demo/main.tsx의 "메모 + 취소/삭제/저장" 패널과 같은 모양이다. marked가 true면 그
 * 컨테이너에 data-keyboard-keep-visible을 붙인다. marked=false는 "구조는 똑같은데
 * 마커만 없는" 대조군이다 — opt-in이므로 컨테이너로 감싸기만 해서는 아무 효과가
 * 없어야 한다는 걸 증명하는 데 쓴다. */
function PageWithMemoGroup({ marked = true }: { marked?: boolean } = {}) {
  return <AppShell sidebar={<div />}>
    <div className="memo-group" data-keyboard-keep-visible={marked ? "" : undefined}>
      <textarea aria-label="메모" />
      <div className="button-row">
        <button type="button">저장</button>
      </div>
    </div>
  </AppShell>;
}

describe("AppShell: 가상 키보드가 열리면 포커스된 필드가 가려지지 않는다", () => {
  it("필드 아래쪽이 키보드에 가려지면 그만큼(+여유 24px) 스크롤 호스트를 올린다", async () => {
    // bug-keyboard-shift.md 실측(Experiment B): scrollTop 1046, rect.bottom 507,
    // 844 -> 494로 줄면 보정 없이는 507이 494보다 13px 아래로(가려짐) 남는다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);   // 844 -> 494

    // overshoot = rect.bottom(507) - visibleBottom(494) + gap(24) = 37
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));
  });

  it("네이티브 scrollIntoView가 scroll-padding-bottom을 기준으로 뒤늦게 따로 스크롤을 더해도, 이 훅이 요청한 양(reqΔ)만큼만 최종적으로 움직인다 — owner 실기기 트레이스의 이중 보정(over-scroll)", async () => {
    // owner 실기기 트레이스 한 번: `+198ms kb resize rect=877~956 visBot=668 over=312`
    // (이 훅이 요청한 delta, reqΔ=312) → `+648ms ... reqΔ=312 want=928 stNow=1196
    // achΔ=580`. 이 훅은 312만 요청했는데 실제로는 580(268 초과)만큼 움직였다. 268은
    // 우연이 아니다 — 그 순간 visualViewport.height는 668이었고 40%는 267.2다. 브라우저
    // 자신의 scrollIntoView가 `#root`의 `scroll-padding-bottom: 40dvh`(tokens.css)를
    // 기준으로 "따로" 계산해 얹은 몫이 정확히 그만큼이었다는 뜻이다 — 이 훅의 보정과
    // 브라우저의 네이티브 보정이 같은 포커스 이벤트에 각자 반응해 더해지는 이중 보정.
    // 초과분은 이 훅의 400ms 애니메이션이 이미 정착된 "뒤"(트레이스의 +648ms처럼, 이
    // 훅과 무관하게 늦게 온다)에 나타난다 — reqΔ는 st=616(정착 전 원래 값) 기준으로
    // 이미 확정돼 있었다.
    //
    // 첫 번째 불변식(구조적, 이 테스트의 실제 잠금장치): `#root`에 scroll-padding-bottom이
    // 있으면 안 된다. 값을 24px로 줄이는 대안도 검토했지만 기각했다 — 두 주체(이 훅,
    // 브라우저)가 "따로 계산해서 따로 옮기는" 구조 자체는 그대로라 어떤 0이 아닌 값을
    // 둬도 어긋난 나머지가 그대로 더해질 수 있다(요구되는 불변식은 achΔ==reqΔ지 "더
    // 작게"가 아니다). 단위(dvh든 px든)에 상관없이 존재 자체를 잡는다 — 값만 다른
    // 형태로 되돌아와도(예: 200px) 이 assert가 잡는다.
    expect(tokensCssSource.length).toBeGreaterThan(1000);   // .css?raw가 빈 문자열로 목킹되면 아래 .not.toMatch가 공허하게 통과한다 — 이 브랜치에서 실제로 있었던 결함
    expect(tokensCssSource).not.toMatch(/#root\s*\{[^}]*scroll-padding-bottom/);

    // 두 번째 불변식(행동, 예시/설명용 — 잠금장치는 위 assert다): jsdom은
    // scrollIntoView도 scroll-padding도 구현하지 않으므로(레이아웃 엔진이 없다)
    // 브라우저의 몫을 이 테스트가 직접 흉내 낸다 — 이 훅의 어떤 코드 경로도 이 흉내
    // 낸 쓰기를 거치지 않는다(이 훅 자신의 scrollTop 쓰기만 보는 테스트로는 이 버그를
    // 절대 볼 수 없다 — 158개의 기존 테스트가 전부 이 지점을 놓친 이유). 하드코딩한
    // 숫자가 아니라 실제 tokens.css 소스에서 #root의 scroll-padding-bottom 값을 그대로
    // 읽어(Dialog.test.tsx의 dialogCssSource 계약 테스트와 같은 idiom) 그 비율만큼을
    // 흉내 낸다 — 값이 tokens.css에서 사라지면 흉내 낼 몫도 0이 되므로, 고정된 지금은
    // 이 아래 코드가 사실상 no-op(0을 더함)이고 마지막 assert는 위 waitFor가 이미
    // 확인한 것의 재확인이다. **이 dvh 전용 정규식은 값 형태가 바뀌면(예: 200px) 0을
    // 돌려주므로 이 절반은 그 회귀를 못 잡는다 — 그 경우를 잡는 건 위의 구조적
    // assert뿐이다.** 이 절반은 "왜 158개의 기존 테스트가 이 버그를 놓쳤는가"를
    // 재현해 보여주는 용도로 남겨 둔다.
    const scrollPaddingMatch = tokensCssSource.match(/#root\s*\{[^}]*?scroll-padding-bottom:\s*([\d.]+)dvh/);
    const nativeScrollPaddingFraction = scrollPaddingMatch ? parseFloat(scrollPaddingMatch[1]) / 100 : 0;

    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);   // visibleBottom = 494

    const reqDelta = 37;   // rect.bottom(507) - visibleBottom(494) + GAP(24) — 위 첫 테스트와 같은 입력
    await waitFor(() => expect(root.scrollTop).toBe(1046 + reqDelta));   // 이 훅 자신의 보정은 정착했다

    // 네이티브 scrollIntoView 몫을 뒤늦게(트레이스처럼 이 훅의 정착 "이후") 얹는다.
    root.scrollTop += Math.round(nativeScrollPaddingFraction * 494);

    // 불변식: achΔ(실제로 움직인 전체 양)는 reqΔ(이 훅이 요청한 양)와 정확히 같아야
    // 한다 — 더 작아도 안 되지만(가려짐, 이 파일의 다른 테스트들이 잡는다), 더 커도
    // 안 된다(owner가 보는 과도 스크롤, 이 테스트가 잡는다).
    expect(root.scrollTop - 1046).toBe(reqDelta);
  });

  it("실기기 트레이스(rect=566~645, visBot=653)를 재현하면 새 여유만큼 필드 바닥이 실제로 남는다 — 상수가 아니라 결과 간격을 검증한다", async () => {
    // owner 실기기 트레이스: "+931ms rect=566~645 visBot=653 over=0 reqΔ=259 achΔ=274
    // clamp=N". over = rect.bottom(645) - visBot(653) + GAP(옛 8) = 0 — 옛 여유(8px)로는
    // 필드 바닥이 보이는 영역 경계에 정확히 닿는(0px) 자리에서 멈췄다("보정이 실제로
    // 걸린 모든 자리"의 대표 사례). 같은 rect/visBot 조합을 보정 "전" 입력으로 재사용해
    // (follow-scroll 스텁이라 정착 후 rect.bottom을 다시 재므로, 결과가 곧 "실제로 남는
    // 간격"이다) 새 여유에서는 그 간격이 8이 아니라 실제로 얼마나 남는지를 상수(GAP)를
    // 다시 읽는 게 아니라 정착된 기하로 직접 검증한다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    root.scrollTop = 1046;
    stubRectBottomFollowingScroll(textarea, 645, root);   // baseline = 1046

    textarea.focus();
    viewport.openKeyboard(844 - 653);   // visibleBottom = 653, 트레이스와 같은 값

    // overshoot = 645 - 653 + GAP
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    await waitFor(() => {
      const settledBottom = textarea.getBoundingClientRect().bottom;
      expect(653 - settledBottom).toBe(24);   // 결과 간격 자체 — 8이 아니라 24가 실제로 남는다
    });
  });

  it("필드 자신이 보이는 영역보다 크면(AutoGrowTextarea처럼 계속 자라는 경우) 위쪽이 아니라 지금 타이핑 중인 아래쪽(캐럿)이 보이는 쪽을 우선한다 — 위/아래를 동시에 만족시킬 방법이 없다", async () => {
    // 필드가 보이는 영역보다 크면 위/아래 두 경계를 동시에 만족시킬 방법이 물리적으로
    // 없다. AutoGrowTextarea는 사용자가 계속 입력하며 아래로 자라므로(내용만큼 늘어남,
    // 내부 스크롤도 max-height도 없음 — AutoGrowTextarea.tsx) 지금 타이핑 중인 캐럿은
    // 항상 "아래쪽"에 있다 — 그래서 아래쪽(캐럿)이 보이는 쪽을 우선해야 한다.
    //
    // "위쪽을 잃지 않는" 한도를 두는 방안을 먼저 시도했지만(rect.top이 viewport.offsetTop
    // 아래로 못 내려가게 막는 한도), 그 한도가 걸리는 순간 그 뒤로는 field가 아무리 더
    // 자라도(=캐럿이 아무리 아래로 내려가도) maxOvershoot이 0에 고정돼 전혀 스크롤하지
    // 않는다 — 캐럿이 영원히 가려진 채로 남는 회귀였다(이 테스트가 그 회귀를 잡는다).
    // 그래서 이 킷은 한도를 두지 않는다 — 위쪽이 화면 밖으로 밀려나는 대가를 치르더라도
    // 아래쪽(캐럿)은 계속 GAP만큼 보이는 채로 유지된다. 위/아래를 동시에 만족시키는
    // 방법이 없는 이상, 계속 타이핑 중인 사용자에게는 이쪽이 맞는 선택이다.
    installFakeResizeObserver();
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    root.scrollTop = 1046;
    const baseline = root.scrollTop;
    const topAtBaseline = 100;
    let height = 900;   // 열림 후 보이는 영역(444)보다 크다 — top=100, bottom=1000.
    Object.defineProperty(textarea, "getBoundingClientRect", {
      configurable: true,
      value: () => {
        const top = topAtBaseline - (root.scrollTop - baseline);
        const bottom = top + height;
        return { top, left: 0, right: 320, bottom, width: 320, height, x: 0, y: top, toJSON() {} };
      },
    });

    textarea.focus();
    viewport.openKeyboard(400);   // visibleBottom = 444

    // overshoot = (100+900) - 444 + 24 = 580 → top은 100-580=-480까지 밀려난다(받아들인 대가).
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 580));
    expect(textarea.getBoundingClientRect().bottom).toBe(444 - 24);   // 캐럿 쪽은 여전히 GAP만큼 보인다

    // 초기 ResizeObserver 딜리버리가 지나갈 시간을 준다(이 파일의 다른 ResizeObserver
    // 테스트와 같은 이유).
    await new Promise((resolve) => setTimeout(resolve, 150));

    // 사용자가 계속 입력해 필드가 200px 더 자란다 — 캐럿이 그만큼 더 아래로 내려간다.
    height += 200;
    fireResizeObserved(textarea);

    // "위쪽을 잃지 않는" 한도가 있었다면 이 시점엔 이미 maxOvershoot이 0으로 고정돼
    // 있어 여기서부터는 절대 다시 스크롤하지 않는다 — 캐럿이 여기서부터 영원히 가려진
    // 채로 남는다. 한도가 없으므로 여기서도 다시 GAP만큼 보이는 자리로 돌아온다.
    await waitFor(() => expect(textarea.getBoundingClientRect().bottom).toBe(444 - 24));
  });

  it("이미 보이는 영역 안이면 스크롤하지 않는다", async () => {
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 400);   // 축소된 494 안에도 충분히 들어옴
    root.scrollTop = 500;

    textarea.focus();
    viewport.openKeyboard(350);

    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));   // 키보드는 열렸다
    expect(root.scrollTop).toBe(500);   // 그래도 스크롤은 그대로
  });

  describe("data-keyboard-keep-visible — 필드 자신이 아니라 표시된 블록 전체를 키보드 위로 들어올린다", () => {
    it("컨테이너로 감싸기만 하고 마커를 안 붙이면 오늘과 똑같이 필드 자신만 기준으로 삼는다 — opt-in이므로 구조만으로는 켜지지 않는다", async () => {
      const viewport = installFakeVisualViewport(844);
      const root = renderIntoScrollRoot(<PageWithMemoGroup marked={false} />);
      const textarea = screen.getByLabelText("메모");
      const group = root.querySelector(".memo-group") as HTMLElement;
      stubRect(textarea, 380, 459);   // focusedOvershoot = 459-494+24 = -11 → 스크롤 불필요
      stubRect(group, 350, 507);      // 마커가 있었다면 요구했을 값(아래 테스트와 같은 기하) — 대조용
      root.scrollTop = 1046;

      textarea.focus();
      viewport.openKeyboard(350);   // visibleBottom = 494

      await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));   // 키보드는 열렸다
      // **여기서 곧장 단언하면 안 된다.** reposition()은 KEYBOARD_VIEWPORT_SETTLE_MS(80ms)
      // 뒤에 돌고, animateScrollTopBy의 첫 rAF 프레임은 from을 그대로 다시 쓴다. 그래서
      // 기다리지 않으면 "마커를 무시하도록 망가뜨려도" 이 단언이 통과한다 — 리뷰가
      // 뮤테이션 두 가지로 실증했다(마커 탐색을 parentElement 고정으로 바꿔도 통과,
      // overshoot=500을 무조건 먹여도 통과). 이 브랜치의 다섯 번째 "실패할 수 없는 테스트"였다.
      await new Promise((resolve) => { window.setTimeout(resolve, 250); });
      expect(root.scrollTop).toBe(1046);   // 컨테이너 rect는 무시된다 — 필드 자신은 이미 충분히 보인다
    });

    it("마킹된 컨테이너가 있으면 필드 자신이 아니라 그 컨테이너의 아래쪽(액션 버튼 줄)이 키보드를 벗어나는 기준이 된다", async () => {
      const viewport = installFakeVisualViewport(844);
      const root = renderIntoScrollRoot(<PageWithMemoGroup marked />);
      const textarea = screen.getByLabelText("메모");
      const group = root.querySelector(".memo-group") as HTMLElement;
      stubRect(textarea, 380, 459);   // focusedOvershoot = 459-494+24 = -11 → 필드 자신은 이미 충분
      stubRect(group, 350, 507);      // containerOvershoot = 507-494+24 = 37 → 버튼 줄까지 포함하면 부족
      root.scrollTop = 1046;

      textarea.focus();
      viewport.openKeyboard(350);   // visibleBottom = 494

      // overshoot = max(focusedOvershoot(-11), min(containerOvershoot(37), ceiling(380))) = 37
      await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));
    });

    it("마킹된 컨테이너가 보이는 영역보다 크면, 포커스된 필드 자신의 위쪽이 보이는 영역 밖으로 밀려나지 않는 선에서만 들어올린다 — 버튼 줄이 다 안 보이더라도 타이핑 중인 자리는 지킨다", async () => {
      const viewport = installFakeVisualViewport(844);
      const root = renderIntoScrollRoot(<PageWithMemoGroup marked />);
      const textarea = screen.getByLabelText("메모");
      const group = root.querySelector(".memo-group") as HTMLElement;
      root.scrollTop = 1046;
      stubRectFollowingScroll(textarea, 400, 479, root);   // baseline 1046
      stubRectFollowingScroll(group, 200, 900, root);      // 컨테이너가 보이는 영역(494)보다 훨씬 크다

      textarea.focus();
      viewport.openKeyboard(350);   // visibleBottom = 494

      // focusedOvershoot = 479-494+24 = 9, containerOvershoot = 900-494+24 = 430,
      // ceiling = 400-0 = 400 → overshoot = max(9, min(430, 400)) = 400 — 컨테이너가
      // 원하는 430이 아니라 400에서 멈춘다. 그 이상 올리면 필드 자신의 위쪽이 보이는
      // 영역 밖으로 밀려난다.
      await waitFor(() => expect(root.scrollTop).toBe(1046 + 400));

      // 대가: 필드 자신의 위쪽은 정확히 보이는 영역의 top(0)에 닿을 때까지만 밀려나고
      // 그 이상은 밀려나지 않는다 — 컨테이너 아래쪽(버튼 줄)은 여전히 다 보이지 않는다
      // (500 > 494, GAP 24를 더한 518에는 한참 못 미친다).
      expect(textarea.getBoundingClientRect().top).toBe(0);
      expect(group.getBoundingClientRect().bottom).toBe(500);
    });

    it("마킹이 오히려 필드 자신의 최소 요구량보다 덜 스크롤하게 만들지는 않는다 — 필드 자신이 이미 보이는 영역보다 큰 경우에도 마킹 없을 때와 같은 양을 보장한다", async () => {
      const viewport = installFakeVisualViewport(844);
      const root = renderIntoScrollRoot(<PageWithMemoGroup marked />);
      const textarea = screen.getByLabelText("메모");
      const group = root.querySelector(".memo-group") as HTMLElement;
      root.scrollTop = 1046;
      stubRectFollowingScroll(textarea, 30, 600, root);   // 필드 자신이 이미 보이는 영역(494)보다 크다
      stubRectFollowingScroll(group, 10, 900, root);

      textarea.focus();
      viewport.openKeyboard(350);   // visibleBottom = 494

      // focusedOvershoot = 600-494+24 = 130, containerOvershoot = 900-494+24 = 430,
      // ceiling = 30-0 = 30 → min(430,30) = 30. 이 30만 썼다면 필드 자신의 최소
      // 요구량(마킹 안 했다면 130 — 아래 "필드 자신이 보이는 영역보다 크면..." 테스트와
      // 같은 값)보다 덜 스크롤하는 회귀다. max(130,30) = 130이 정답이다.
      await waitFor(() => expect(root.scrollTop).toBe(1046 + 130));
    });

    it("data-keyboard-keep-visible이 스크롤 호스트(#root) 밖의 조상에 있으면 무시한다 — 그 요소는 이 훅이 옮기는 scrollTop으로 전혀 움직이지 않으므로 기준으로 쓸 수 없다", async () => {
      const viewport = installFakeVisualViewport(844);
      const { root, wrapper } = renderIntoScrollRootInsideMarkedWrapper(<Page />);
      stubRect(wrapper, 0, 2000);   // 마커가 있는 바깥 요소 — 새어 들어오면 훨씬 큰 값을 요구하게 된다
      const textarea = screen.getByLabelText("메모");
      stubRect(textarea, 428, 507);   // focusedOvershoot = 507-494+24 = 37
      root.scrollTop = 1046;

      textarea.focus();
      viewport.openKeyboard(350);   // visibleBottom = 494

      // wrapper가 새어 들어왔다면 overshoot = max(37, min(2000-494+24, 428)) = 428이 된다 —
      // 실제로 37이면 wrapper가 (scrollRoot 밖이라) 무시됐다는 뜻이다.
      await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));
    });
  });

  it("키보드가 닫혀도 스크롤 위치를 강제로 되돌리지 않는다(사용자가 요청하지 않은 시점 이동을 만들지 않음)", async () => {
    // 이전 버전은 여기서 열기 전 위치(1046)로 되돌렸다 — 실기기 피드백은 그걸 "시점이
    // 확확 바뀌어서 어지럽다"고 표현했다. iOS 자체도 키보드를 내릴 때 스크롤 위치를
    // 당겨오지 않는다: 사용자가 어디 있었든 그대로 둔다(Apple 인터페이스 원칙 §16.2
    // Agency — 요청하지 않은 이동을 강제하지 않음, §16.4 Familiarity — 플랫폼이 이미
    // 하는 대로). PRINCIPLES.md §9도 "닫히면 되돌린다"를 요구한 적이 없다 — 되돌리기는
    // 이 컴포넌트가 스스로 만든 계약이었고 그 계약 자체가 어지러움의 원인이었다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));   // 패딩은 원래대로 줄어든다
    expect(root.scrollTop).toBe(1046 + 37);   // 그래도 스크롤 위치는 그대로 — 되돌리지 않는다
  });

  it("그 사이 사용자가 직접 스크롤했어도 그 위치 그대로 둔다", async () => {
    // 되돌리기 자체가 없으므로 사용자가 타이핑 중 더 스크롤했든 안 했든 결과는 같다 —
    // 이 테스트는 "얼마나 스크롤했든 닫기가 그 값을 절대 건드리지 않는다"는 걸 큰
    // 폭(+254px)으로 확인한다. 이전에 SCROLL_DRIFT_TOLERANCE(18px)가 가르던 경계
    // 안쪽의 작은 흔들림은 바로 아래 테스트가 따로 확인한다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));

    // 타이핑하며 사용자가 직접 더 스크롤했다.
    root.scrollTop = 1300;

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1300);   // 되돌리지 않았다
  });

  it("이전 SCROLL_DRIFT_TOLERANCE(18px) 문턱 안쪽의 작은 흔들림도 더 이상 되돌리지 않는다", async () => {
    // 되돌리기 메커니즘이 "우회"된 게 아니라 통째로 없다는 걸 보여 주는 가장 확실한
    // 증거: 이 정확한 시나리오(+2px, 옛 18px 문턱 안쪽)는 1dc8b60이 문턱을 넓히면서까지
    // "복원돼야 한다"고 못 박았던 경우다. 지금은 문턱 자체가 없으므로 이 흔들림도
    // 그냥 사용자 스크롤과 똑같이 취급되어 되돌아가지 않는다 — 1046이 아니라 1069여야
    // 이전 메커니즘이 남아 있지 않다는 뜻이다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));   // 1083

    root.scrollTop += 2;   // 옛 문턱(18px) 안쪽의 흔들림 — 예전이라면 "사용자 스크롤 아님"으로 봤다

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1083 + 2);   // 1046이 아니다 — 되돌리는 코드가 아예 없다
  });

  it("닫힌 뒤 같은 필드에 다시 초점을 맞춰 재열림해도 이전 사이클의 흔적이 남지 않는다", async () => {
    // 이전 구현은 restingScrollTop/appliedScrollTop을 ref에 저장해 뒀다가 닫힐 때
    // 참조했다. 그 되돌리기 로직을 통째로 들어냈으니, 재열림이 첫 사이클의 어떤
    // 잔여 상태에도 기대지 않고 "지금" scrollTop 기준으로 다시 계산되는지 확인한다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));   // 1083

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1083);   // 첫 닫기 — 그대로 둔다

    // 같은 필드가 여전히 같은 자리(rect.bottom 507)에 있고 키보드가 다시 350px을
    // 가린다 — overshoot 계산은 지금 scrollTop(1083) 위에 다시 37을 더해야 한다.
    // 그 결과가 1046 기준(1046+37=1083, 즉 변화 없음)으로 나오면 삭제된 ref의
    // "원래 자리"가 어딘가에 여전히 살아 있다는 뜻이다.
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1083 + 37));
  });

  it("다른 필드로 재열림해도 첫 사이클과 독립적으로 계산된다", async () => {
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(
      <AppShell sidebar={<div />}>
        <textarea aria-label="첫째" />
        <textarea aria-label="둘째" />
      </AppShell>,
    );
    const first = screen.getByLabelText("첫째");
    const second = screen.getByLabelText("둘째");
    stubRectBottom(first, 507);
    stubRectBottom(second, 450);   // 첫째보다 덜 가려짐
    root.scrollTop = 1046;

    first.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));   // 1083, 첫째 기준

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1083);   // 되돌리지 않았다

    second.focus();
    viewport.openKeyboard(350);
    // overshoot = 450 - 494 + 24 = -20 → 이미 보이므로 스크롤하지 않는다.
    // 첫째의 되돌리기 값(1046)이나 흔적이 끼어들지 않고 지금 scrollTop(1083)이 그대로 유지된다.
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    expect(root.scrollTop).toBe(1083);
  });

  it("키보드가 열린 채로 다른 편집 요소로 포커스가 옮겨가면 그 요소도 다시 맞춘다", async () => {
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(
      <AppShell sidebar={<div />}>
        <textarea aria-label="첫째" />
        <textarea aria-label="둘째" />
      </AppShell>,
    );
    const first = screen.getByLabelText("첫째");
    const second = screen.getByLabelText("둘째");
    stubRectBottom(first, 507);
    stubRectBottom(second, 600);   // 첫째보다 더 가려짐
    root.scrollTop = 1046;

    first.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));   // 첫째 기준 보정

    // 키보드가 열린 채로(탭 이동 등) 둘째로 포커스가 옮겨간다 — focusin 리스너가 다시 맞춰야 한다.
    second.focus();
    // overshoot = 600 - 494 + 24 = 130, 지금 scrollTop(1083) 기준으로 더한다.
    await waitFor(() => expect(root.scrollTop).toBe(1083 + 130));
  });

  it("#root 밖(다이얼로그 포털 자리)의 포커스는 건드리지 않는다", async () => {
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    root.scrollTop = 700;

    // Dialog.tsx가 document.body에 포털하는 것과 같은 모양: #root의 형제.
    const outside = document.createElement("input");
    outside.setAttribute("aria-label", "다이얼로그 입력");
    outside.setAttribute("data-test-outside", "1");
    document.body.appendChild(outside);
    stubRectBottom(outside, 700);

    outside.focus();
    viewport.openKeyboard(350);

    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));   // 키보드 감지는 전역이라 열린다
    expect(root.scrollTop).toBe(700);   // 그래도 #root는 움직이지 않는다 — contains() 가드
  });

  it(".workspace 하단 패딩에 --keyboard-inset을 반영하고, 닫히면 0으로 되돌린다", async () => {
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    expect(keyboardInsetOf(root)).toBe("0px");

    textarea.focus();
    viewport.openKeyboard(350);
    // inset = window.innerHeight - (viewport.offsetTop(0) + viewport.height(494))
    await waitFor(() => expect(keyboardInsetOf(root)).toBe(`${window.innerHeight - 494}px`));

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
  });

  it("내부 전용 마커 클래스(.keyboard-inset-open)가 --keyboard-inset과 같은 렌더에서 함께 붙고 떨어진다", async () => {
    // css/page.css의 `.app-shell:not(.keyboard-inset-open) .workspace`는 키보드가 진짜
    // 열려 있는 동안(useLayoutEffect가 같은 프레임에서 scrollTop을 미는 동안) 패딩
    // 트랜지션을 꺼서, 아직 늘어나지 않은 레이아웃 때문에 그 scrollTop 증가분이
    // clamp되는 걸 막는다. 이 게이트는 소비 앱이 주는 keyboardOpen prop
    // (.mobile-keyboard-open, 관례상 같은 값이지만 보장되지 않음)이 아니라 AppShell이
    // 내부에서 구독하는 keyboard.open과 반드시 같은 렌더에서 나와야 하므로 별도
    // 클래스다. 이 테스트는 그 계약을 문자열 클래스명으로 고정해, 나중에 className
    // 목록을 리팩터링하다 실수로 합치거나 빠뜨려도 여기서 걸리게 한다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    const shellClass = () => (root.querySelector(".app-shell") as HTMLElement).className;

    expect(shellClass()).not.toContain("keyboard-inset-open");

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(shellClass()).toContain("keyboard-inset-open"));

    viewport.closeKeyboard();
    await waitFor(() => expect(shellClass()).not.toContain("keyboard-inset-open"));
  });

  it("스크롤 보정이 한 번에 순간이동하지 않고 여러 프레임에 걸쳐 연속으로 움직인다", async () => {
    // 실기기 피드백("확확 올라가서 어지럽다")의 원인: ddc316e는 overshoot를 scrollTop에
    // 그대로 더했다 — 인스턴스 프로퍼티로 가로챈 쓰기 횟수가 정확히 1이면 그 순간이동이
    // 그대로 남아 있다는 뜻이다. §3/§4: 논리적 목표치로 한 번에 점프하지 않고, 현재
    // 값에서 목표까지 감쇠형 곡선(§4의 damping 1.0/response 0.4, --motion-reposition의
    // 400ms와 --sidebar-ease를 그대로 재사용)으로 여러 프레임에 걸쳐 도착해야 한다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;
    const writes = trackScrollTopWrites(root);

    textarea.focus();
    viewport.openKeyboard(350);   // overshoot = 507 - 494 + 24 = 37

    await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));
    expect(writes.length).toBeGreaterThan(1);          // 한 번의 대입이 아니다
    expect(writes[writes.length - 1]).toBe(1046 + 37); // 마지막 프레임은 정확히 목표치
  });

  it("prefers-reduced-motion에서는 애니메이션 없이 즉시 옮긴다 (짧게가 아니라 제거)", async () => {
    // §14: reduced motion은 "짧게"가 아니라 이동 자체를 없애는 것. 애니메이션 경로를
    // 아예 안 타야 하므로 쓰기 횟수가 1이어야 한다(§3 위반이 아니다 — 애초에 이동을
    // 만들지 않는 것과, 이동을 만들고 눈에 안 띄게 초고속으로 트는 것은 다르다).
    installReducedMotionPreference();
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;
    const writes = trackScrollTopWrites(root);

    textarea.focus();
    viewport.openKeyboard(350);

    await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));
    expect(writes.length).toBe(1);
  });

  it("애니메이션 도중 다른 필드로 포커스가 옮겨가면 처음 값으로 되돌아가지 않고 지금 진행 중이던 값에서 이어서 움직인다", async () => {
    // §3 Interruptibility: "항상 presentation(현재) 값에서 시작하고, 논리적/목표
    // 값에서 시작하면 안 된다." 진행 중인 애니메이션을 중간에 가로챌 때 1046(맨 처음
    // 값)으로 되돌아가면 그 위반이다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(
      <AppShell sidebar={<div />}>
        <textarea aria-label="첫째" />
        <textarea aria-label="둘째" />
      </AppShell>,
    );
    const first = screen.getByLabelText("첫째");
    const second = screen.getByLabelText("둘째");
    stubRectBottom(first, 507);
    stubRectBottom(second, 600);
    root.scrollTop = 1046;
    const writes = trackScrollTopWrites(root);

    first.focus();
    viewport.openKeyboard(350);   // 목표 1046+37=1083

    // 애니메이션이 목표에 닿기 전, 중간값에 도달할 때까지 기다린다.
    await waitFor(() => {
      expect(root.scrollTop).toBeGreaterThan(1046);
      expect(root.scrollTop).toBeLessThan(1083);
    });
    const interruptFrom = root.scrollTop;   // 지금 진행 중이던 값 (아직 목표 아님)

    second.focus();   // focusin 리스너가 동기적으로 다시 reposition()을 부른다

    // 둘째 기준 overshoot = 600 - 494 + 24 = 130이 "재조준하는 그 순간의 값" 위에 쌓인다.
    // 정확히 interruptFrom + 130으로 단언하지 않는 이유: focusin도 KEYBOARD_VIEWPORT_SETTLE_MS
    // 만큼 기다렸다 재므로, 그 사이 첫 애니메이션이 조금 더 진행한 뒤 그 자리에서 겨냥한다.
    // §3가 실제로 금지하는 건 "맨 처음 값(1046)에서 다시 시작하는 것"이고, 그랬다면 최종값이
    // 1046+130=1176 — interruptFrom+130보다 **작다**. 그래서 이 하한이 그 위반을 정확히 잡는다
    // (아래 프레임별 단조 검사와 함께). 타이밍이 아니라 계약을 단언한다.
    await waitFor(() => expect(root.scrollTop).toBeGreaterThanOrEqual(interruptFrom + 130));
    // 가로챈 뒤로는 그 어떤 프레임도 가로챈 시점(interruptFrom)보다 아래로 되돌아가지
    // 않는다 — 되돌아간다면 논리적 목표가 아니라 "맨 처음" 값에서 다시 시작했다는 뜻.
    const afterInterrupt = writes.slice(writes.indexOf(interruptFrom) + 1);
    for (const value of afterInterrupt) expect(value).toBeGreaterThanOrEqual(interruptFrom - 0.01);
  });

  it("안드로이드 다단계 리사이즈처럼 keyboard.inset이 열린 채로 여러 번 바뀌어도 매번 처음부터 다시 끊기지 않고 지금 값에서 새 목표로 이어간다", async () => {
    // 안드로이드는 키보드가 한 번에 최종 높이로 열리지 않고 여러 단계로 리사이즈될 수
    // 있다 — 그때마다 keyboard.inset이 바뀐다(visualViewport.ts의 useVirtualKeyboard). 두 단계
    // 모두 스크롤이 필요하게(overshoot > 0) 잡아, 1단계 애니메이션이 진행되는 도중에
    // 2단계가 다시 겨냥하는 상황을 실제로 재현한다. 이펙트가 keyboard.inset을
    // 의존성으로 갖고 있으므로 매 단계마다 다시 실행되는데, 그렇다고 "리스너를 통째로
    // 뜯었다 다시 다는" 것과 "진행 중이던 애니메이션을 중간에 처음 값으로 리셋하는"
    // 것은 여전히 없어야 한다 — 그러면 §3가 다시 깨진다("여러 단계로 끊기는" 원래
    // 결함이 형태만 바뀌어 재발).
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    root.scrollTop = 1046;
    stubRectBottomFollowingScroll(textarea, 700, root);   // 스크롤에 결합된 rect — 실제 브라우저와 같은 산수
    const writes = trackScrollTopWrites(root);

    textarea.focus();
    viewport.openKeyboard(200);   // 1단계: 844 -> 644, overshoot = 700-644+24 = 80, 목표 1126

    // 1단계 애니메이션이 목표에 닿기 전, 중간값에 도달할 때까지 기다린다.
    await waitFor(() => {
      expect(root.scrollTop).toBeGreaterThan(1046);
      expect(root.scrollTop).toBeLessThan(1126);
    });
    const midStage1 = root.scrollTop;

    viewport.openKeyboard(350);   // 2단계(최종): 844 -> 494, overshoot = 700-494+24 = 230, 목표 1276

    await waitFor(() => expect(root.scrollTop).toBe(1046 + 230));
    // 1단계 중간값 이후로는 그 어떤 프레임도 그 값 아래로도, 맨 처음(1046)으로도
    // 되돌아가지 않는다 — 새 목표로 이어졌다는 뜻.
    const afterStage1 = writes.slice(writes.indexOf(midStage1) + 1);
    for (const value of afterStage1) expect(value).toBeGreaterThanOrEqual(midStage1 - 0.01);
    // 전체적으로 단조 증가 — 한 번이라도 목표를 지나쳤다가 되돌아오는 오버슈트가
    // 없다(damping 1.0, 오버슈트 없음).
    for (let i = 1; i < writes.length; i++) expect(writes[i]).toBeGreaterThanOrEqual(writes[i - 1] - 0.01);
  });

  it("단일 리사이즈 이벤트로 키보드가 한 번에 열려도(iOS처럼) 가려지지 않는다 — 여러 단계 이론을 배제한다", async () => {
    // bug-keyboard-shift 재조사 A1: "포커스에서 한 번만 측정한다"는 가설을 먼저
    // 반증한다. 이 테스트는 안드로이드 다단계(위 테스트)와 달리 openKeyboard를 딱 한
    // 번만 부른다 — iOS처럼 최종 높이로 한 번에 열리는 경우다. 위쪽 첫 테스트(130줄)도
    // 이미 단일 호출이었지만 이 테스트는 그 사실을 명시적으로 이름 붙여, "여러 단계에
    // 걸친 측정"이 원인이라는 가설이 이미 기존 통과 테스트로 반증됐다는 근거로 보고서에
    // 인용할 수 있게 한다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);   // 단 한 번 — 644 같은 중간 단계 없이 곧장 494로

    await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));
  });

  it("포커스된 요소 자신의 높이가 나중에 바뀌면(자동 확장 textarea 등, 리사이즈도 focusin도 아님) 다시 맞춘다", async () => {
    // A1의 진짜 잔여 원인: AutoGrowTextarea.tsx:20-28의 resize()는 onInput에서 동기적으로
    // textarea.style.height를 바꾸지만, 그건 visualViewport의 resize도 아니고 document의
    // focusin도 아니다 — 지금 useKeyboardScrollCompensation의 두 이펙트 중 어느 쪽도 이
    // 경로를 듣지 않는다. 그래서 첫 측정 이후 포커스된 요소 자신이 자라 그 rect.bottom이
    // visibleBottom 아래로 내려가도 아무도 다시 재라고 하지 않는다 — 키보드 자체는 이미
    // 다 열려 안정된 뒤에 생기는 잔여 은폐다. ResizeObserver로 "지금 포커스된 요소"를
    // 계속 지켜보면, 원인이 무엇이든(자동 확장 textarea든 다른 컴포넌트든) 다시 잰다.
    installFakeResizeObserver();
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    let bottom = 400;   // 처음엔 잘 보임(최종 visibleBottom 494 안)
    Object.defineProperty(textarea, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: bottom - 79, left: 0, right: 320, bottom, width: 320, height: 79, x: 0, y: bottom - 79, toJSON() {} }),
    });
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);   // visibleBottom = 494, 400 < 494라 아직 스크롤 필요 없음
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    expect(root.scrollTop).toBe(1046);

    // 새 가짜 ResizeObserver는 실제 스펙대로 새로 관찰을 시작한 대상에 다음 프레임에
    // 한 번 초기 딜리버리를 보낸다(installFakeResizeObserver 주석 참고) — 그 한 번이
    // 지나가 안정될 시간을 준 뒤에 textarea가 자라는 시나리오로 들어간다. 여기서
    // 기다리지 않으면 그 초기 딜리버리가 아래 fireResizeObserved와 겹쳐, 아직 진행
    // 중인 애니메이션 도중 정적인 rect.bottom(560)을 또 재는 이중 계산이 된다(이 파일
    // stubRectBottomFollowingScroll 주석의 함정과 같은 종류).
    await new Promise((resolve) => setTimeout(resolve, 150));

    // 사용자가 여러 줄을 입력해 textarea가 자라난다(AutoGrowTextarea.resize()와 같은 일) —
    // rect.bottom이 visibleBottom 아래로 내려간다. 이 변화 자체는 리사이즈도 focusin도
    // 아니므로, ResizeObserver 콜백으로만 알 수 있다.
    bottom = 560;
    fireResizeObserved(textarea);

    // overshoot = 560 - 494 + 24 = 90
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 90));
  });

  it("포커스된 요소가 안 바뀌면 매 프레임 ResizeObserver 관찰을 다시 만들지 않는다 — 자기재점화 루프 방지", async () => {
    // Critical merge blocker(전체 브랜치 리뷰): observeFocusedElementSize()는 reposition()이
    // 끝날 때마다 불리는데, 예전 구현은 대상이 안 바뀌어도 매번 disconnect() 후 observe()를
    // 다시 불렀다. disconnect()는 관찰 목록을 통째로 비우므로 그 직후의 observe()는 완전히
    // 새 ResizeObservation을 만들고, 실제 ResizeObserver는 그렇게 새로 관찰을 시작한 대상에
    // 다음 프레임에 반드시 한 번 콜백을 쏜다(installFakeResizeObserver 주석 — lastReportedSize가
    // unset이라 지금 크기가 무엇이든 "달라진" 것으로 친다). 그 콜백이 다시 reposition()을
    // 부르고, reposition()이 다시 무조건 disconnect()+observe()를 하면 "새 관찰 → 초기
    // 딜리버리 → reposition() → 새 관찰"이 실제 크기 변화나 사용자 입력과 무관하게 매 프레임
    // 영원히 반복된다. freshObservationLog로 "같은 대상을 몇 번이나 새로 관찰했는지" 직접 센다
    // — 스펙상 불가피한 최초 1회를 넘어서면 자기재점화가 있다는 뜻이다.
    installFakeResizeObserver();
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);   // 이미 잘 보임(overshoot < 0) — 스크롤 산수와 얽히지 않고 재관찰 횟수만 격리해서 본다
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));

    // 최초 관찰의 실제 초기 딜리버리(스펙 동작, 불가피)가 지나갈 시간을 준다.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const freshCountAfterSettle = freshObservationLog.filter((target) => target === textarea).length;
    // 정확히 1이어야 한다 — 0이면 애초에 관찰 자체가 안 된 것이고(과잉 가드로도 이 테스트를
    // 속여서 통과시킬 수 있다), 2 이상이면 이미 재점화 중이다. toBeLessThanOrEqual(1)이었다면
    // 0도 통과해 "관찰이 아예 안 섰다"는 다른 버그를 놓칠 수 있었다.
    expect(freshCountAfterSettle).toBe(1);

    // 안정된 뒤로도 프레임이 계속 지나가는 동안 더 늘어나지 않아야 한다 — 자기재점화가
    // 있었다면 매 프레임 새로 관찰을 만들어 이 수가 계속 늘어난다.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(freshObservationLog.filter((target) => target === textarea).length).toBe(freshCountAfterSettle);
  });

  it("reduced motion에서 키보드가 열려 보정된 뒤 사용자가 위로 스크롤하면, 다음 프레임에도 그 스크롤이 유지된다(자기재점화로 되돌려지지 않는다)", async () => {
    // Critical merge blocker의 실사용 영향: reduced-motion 경로(animateScrollTopBy)는
    // 매 reposition() 호출마다 scrollTop에 즉시 delta를 더한다. 자기재점화 루프가 있으면
    // 이 즉시 대입이 매 프레임 반복돼, 포커스된 필드가 조금이라도 보정된 뒤로는 사용자가
    // 위로 스크롤해도 다음 프레임에 바로 되돌아간다 — reduced-motion 사용자가 키보드가
    // 열린 동안 아예 위로 스크롤할 수 없게 된다(§14 위반). stubRectBottomFollowingScroll을
    // 쓰는 이유: 정적인 stubRectBottom을 쓰면 최초 초기 딜리버리 시점에 "이미 적용된
    // 보정분"을 또 요구하는 이중 계산이 돼(이 파일 71-76행 주석과 같은 함정) 테스트가
    // 실제 버그와 무관한 이유로도 실패할 수 있다 — 스크롤을 따라가는 rect라야 "사용자가
    // 스스로 움직인 것"과 "코드가 되돌린 것"을 정확히 구분할 수 있다.
    installReducedMotionPreference();
    installFakeResizeObserver();
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    root.scrollTop = 1046;
    stubRectBottomFollowingScroll(textarea, 507, root);   // baseline = 1046

    textarea.focus();
    viewport.openKeyboard(350);   // visibleBottom = 494, overshoot = 507-494+24 = 37 → reduced motion이라 즉시 대입
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));

    // 최초 관찰의 실제 초기 딜리버리가 지나갈 시간을 준다 — follow-scroll rect 덕분에 이
    // 시점엔 overshoot가 이미 0이라(1046+37 위치에서 다시 재도 안 움직인다) 아무 일도
    // 안 일어나야 정상이다. 그 뒤로는 대상이 안 바뀌었으므로 다시는 저절로 안 불려야 한다.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(root.scrollTop).toBe(1046 + 37);   // 아직 사용자가 스크롤하지 않았다 — 정착 확인

    // 사용자가 보정된 지점에서 위로 스크롤한다.
    root.scrollTop = 1046 + 37 - 40;
    const afterUserScroll = root.scrollTop;

    // 자기재점화가 있었다면 이 다음 프레임들에서 되돌렸을 시점이다.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(root.scrollTop).toBe(afterUserScroll);
  });

  it("맨 아래로 스크롤된 채 키보드가 닫히면, 지금 스크롤 위치가 기대고 있는 예약 여백을 그 자리에서 걷어내지 않는다", async () => {
    // A2의 원인: css/page.css의 --keyboard-inset이 0으로 줄면 #root의 scrollHeight가
    // 그만큼 줄고, scrollTop이 그 새 최댓값보다 크면 브라우저가 scrollTop을 새 최댓값으로
    // clamp한다 — 우리가 스크롤을 옮기는 코드가 하나도 없어도 여백을 없앤 것 자체가
    // 화면을 움직인다. 맨 아래로 스크롤한 채 닫으면 이 clamp 폭은 정확히 남아 있던
    // --keyboard-inset과 같다(과거 보고서의 "-400px, 정확히 새 scroll max"). jsdom은
    // 레이아웃이 없어(scrollHeight/clientHeight가 항상 0) 이 clamp 자체가 재현되지
    // 않으므로 installClampingScrollRoot로 실제 브라우저의 clamp 동작을 흉내 낸다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);   // 이미 잘 보임 — reposition()이 따로 스크롤하지 않게
    const BASE_CONTENT_HEIGHT = 2000;
    const CLIENT_HEIGHT = 800;
    installClampingScrollRoot(root, BASE_CONTENT_HEIGHT, CLIENT_HEIGHT);

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    const insetWhileOpen = parseFloat(keyboardInsetOf(root));

    // 사용자가 키보드가 열린 채로 맨 아래까지 스크롤했다 — 지금 예약된 여백을 전부 쓰는 중.
    root.scrollTop = BASE_CONTENT_HEIGHT + insetWhileOpen - CLIENT_HEIGHT;
    const bottomScrollTop = root.scrollTop;

    viewport.closeKeyboard();
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false));   // 닫히는 렌더가 커밋됐다

    // "닫힘 렌더" 자체는 keyboard.open만으로 즉시 마커를 떼지만, 지연 해제 값은 그
    // 렌더 "안의" useLayoutEffect가 다시 계산해 별도 커밋으로 반영된다 — 그래서 최종
    // 값에 안정될 때까지 기다린다. 예전(수정 전)이었다면 이 값이 결국 0으로 안정되고
    // (패딩이 줄어) 새 최댓값(bottomScrollTop - insetWhileOpen)으로 clamp됐다 — 정확히
    // -insetWhileOpen만큼 뚝 떨어진다. 지금 스크롤 위치가 이 여백에 기대고 있으므로
    // 아직 걷어낼 수 없다 — 값이 insetWhileOpen 그대로 안정돼야 한다.
    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(insetWhileOpen));
    expect(root.scrollTop).toBe(bottomScrollTop);
  });

  it("키보드가 닫힌 뒤 사용자가 위로 스크롤해 여백이 더 이상 필요 없어지면, 그만큼씩 걷어내다 결국 0으로 완전히 해제한다(지연 해제)", async () => {
    // §16.2 Agency: 사용자가 스스로 스크롤해서 여백을 벗어나기 전까지는 걷어내지 않는다.
    // 벗어난 만큼만, 벗어난 뒤에 걷어낸다 — "지연 해제"라는 이름의 근거.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);
    const BASE_CONTENT_HEIGHT = 2000;
    const CLIENT_HEIGHT = 800;
    installClampingScrollRoot(root, BASE_CONTENT_HEIGHT, CLIENT_HEIGHT);

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    const insetWhileOpen = parseFloat(keyboardInsetOf(root));
    root.scrollTop = BASE_CONTENT_HEIGHT + insetWhileOpen - CLIENT_HEIGHT;
    const bottomScrollTop = root.scrollTop;

    viewport.closeKeyboard();
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false));   // 닫히는 렌더가 커밋됐다
    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(insetWhileOpen));   // 아직 그대로(위 테스트와 같은 전제) — 안정될 때까지 기다린다

    // 사용자가 위로 100px 스크롤한다 — 이제 그만큼은 걷어내도 안전하다.
    root.scrollTop -= 100;
    root.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(insetWhileOpen - 100));
    expect(root.scrollTop).toBe(bottomScrollTop - 100);   // 그 사이 더 움직이지 않았다 — 걷어낸 만큼이 정확히 안전한 만큼이었다.

    // 완전히 안전한 지점(natural max, 여백이 0이어도 되는 지점)까지 스크롤하면 결국
    // 0으로 완전히 수렴한다 — "지연"이지 "영구 보류"가 아니다.
    root.scrollTop = BASE_CONTENT_HEIGHT - CLIENT_HEIGHT;
    root.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
  });

  it("스크롤 지오메트리를 알 수 없으면(레이아웃 없는 환경 등) 예전처럼 즉시 0으로 돌아간다 — 지연 해제 가드", async () => {
    // clientHeight <= 0(레이아웃이 없거나 스크롤 호스트를 아직 못 찾음)이면 natural max를
    // 계산할 근거가 없으므로, 이 경로는 통째로 건너뛰고 예전 동작(닫히면 즉시 0)으로
    // 떨어져야 한다. 이 테스트는 그 가드를 이름으로 박아 둔다 — 이 파일의 다른 모든
    // 기존 테스트가 지오메트리를 스텁하지 않고도 "닫히면 0px" 를 계속 기대할 수 있는
    // 이유가 바로 이 폴백이다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1046 + 37);   // 되돌리지 않는다(기존 계약) — 그저 즉시 0으로.
  });

  it("naturalMax 스냅샷이 아니라 그 순간 살아있는 지오메트리로 다시 재므로, clientHeight가 스냅샷 이후 바뀌어도(주소창 접힘 등, 키보드와 무관) 닫을 때 clamp가 생기지 않는다 — B1", async () => {
    // 실기기 재현: 예약 여백 스냅샷(naturalMaxScrollRef, 옛 구현)은 keyboard.inset이 바뀔
    // 때만 다시 잰다. #root는 100dvh라 키보드와 무관하게(안드로이드 resizes-visual에서도)
    // 주소창이 스크롤 중 접히면 clientHeight 자체가 커질 수 있다 — 이 변화는 keyboard.inset과
    // 무관하므로 옛 스냅샷은 갱신되지 않는다. naturalMax_stale(옛 clientHeight로 계산) <
    // naturalMax_true(새 clientHeight로 계산)이 되어 floor를 실제보다 작게 계산하고,
    // 브라우저가 그 차이만큼 scrollTop을 clamp한다 — "살짝 아래로 움찔거리며 내려오는" 증상.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);   // 이미 잘 보임 — reposition()이 따로 스크롤하지 않게
    const scrollRoot = installClampingScrollRoot(root, 60000, 750);   // 주소창이 보이는 상태(750)로 시작

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    const insetWhileOpen = parseFloat(keyboardInsetOf(root));

    // 스크롤하는 동안 주소창이 접혀 clientHeight가 커진다 — keyboard.inset은 그대로라
    // naturalMaxScrollRef(옛 구현)는 이 변화를 모른다.
    scrollRoot.setClientHeight(800);
    // 드리프트 이후의 진짜 natural max보다 200px 안쪽(예약 여백을 200만큼 써야 하는
    // 위치)에 둔다 — 콘텐츠(60000)는 넉넉해 절대 천장에 걸리지 않는다.
    const trueNaturalMaxAfterDrift = 60000 - 800;
    root.scrollTop = trueNaturalMaxAfterDrift + 200;
    const bottomScrollTop = root.scrollTop;

    viewport.closeKeyboard();
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false));

    // 옳은 floor는 200(진짜 필요한 만큼) — clientHeight 드리프트를 놓치지 않아야 한다.
    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(200));
    expect(root.scrollTop).toBe(bottomScrollTop);   // 전혀 움직이지 않는다 — "닫을 때 뷰포트는 절대 움직이지 않는다"

    // 사이클 2 — 블러 없이 같은 필드를 다시 탭해 키보드가 다시 열린다(owner 리포트의
    // "다시 탭하면"과 같은 모양). 필드가 다시 가려지도록 rect를 바꿔 진짜 보정이
    // 필요한 상태를 만든다 — B2: 이 보정이 여전히 정상적으로 일어나는지 본다.
    // (콘텐츠를 더 늘려 둔다 — 페이지의 다른 곳에 콘텐츠가 더 있다는 뜻일 뿐, 메모
    // 자신과는 무관하다. 이게 없으면 "사이클 1에서 정확히 필요한 만큼만 예약했다"는
    // 사실 자체가 사이클 2의 여유를 깎아, 진짜 버그가 아니라 이 테스트의 합성 문서
    // 길이가 천장이 되어 버린다.)
    scrollRoot.growContentBy(1000);
    const scrollTopBeforeReopen = root.scrollTop;
    stubRectBottom(textarea, 600);
    viewport.openKeyboard(350);

    // overshoot = 600 - visibleBottom(494) + gap(24) = 130, 지금 위치(scrollTopBeforeReopen) 위에.
    await waitFor(() => expect(root.scrollTop).toBe(scrollTopBeforeReopen + 130));
    expect(parseFloat(keyboardInsetOf(root))).toBe(insetWhileOpen);   // 사이클 1과 똑같은 값으로 다시 예약된다 — 이전 사이클의 흔적 없음
  });

  it("지연 해제 중(releaseFloor > 0) css/page.css:55의 padding 트랜지션이 렌더된 scrollHeight를 목표값보다 뒤처지게 해도, 사용자가 스크롤하지 않은 틱에서는 예약분이 저절로 줄지 않는다 — 전체 브랜치 리뷰 Finding 1(팬텀 붕괴)", async () => {
    // 원인(Finding 1): css/page.css:55는 keyboard-inset-open이 없는 동안(닫힌 뒤)
    // .workspace의 padding-bottom에 400ms 트랜지션을 건다. useReleasableKeyboardInset의
    // recompute()(AppShell.tsx:439-449)는 naturalMax = scrollHeight - current - clientHeight로
    // 계산하는데, current는 "커밋된 목표값"이고 scrollHeight는 "지금 화면에 그려진(트랜지션
    // 중이면 아직 못 따라잡은) padding"이다 — 트랜지션이 걸리는 동안 이 둘이 어긋나
    // naturalMax를 (rendered - target)만큼 과대평가하고, candidate를 그만큼 과소평가한다.
    // 사용자가 전혀 스크롤하지 않아도 'scroll' 이벤트 한 번(브라우저 자신의 clamp 부수
    // 효과 등)이면 예약분이 저절로 줄어든다 — §16.2 Agency 위반. 고침(AppShell.tsx의
    // .keyboard-inset-holding 마커 + css/page.css:55/87)은 releaseFloor > 0인 동안
    // 트랜지션 자체를 꺼서 rendered와 target이 항상 같게 만든다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);   // 이미 잘 보임 — reposition()이 따로 스크롤하지 않게
    const BASE_CONTENT_HEIGHT = 2000;
    const CLIENT_HEIGHT = 800;
    installClampingScrollRoot(root, BASE_CONTENT_HEIGHT, CLIENT_HEIGHT, { simulateTransitionLag: true });

    textarea.focus();
    viewport.openKeyboard(300);
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    const insetWhileOpen = parseFloat(keyboardInsetOf(root));

    // 슬랙 100px을 남긴 채(바닥에서 100px 위) 닫는다 — 닫히는 렌더 자체(B1이 이미 고친
    // 부분, 커밋 전 DOM을 읽으므로 이 트랜지션 버그의 영향을 받지 않는다)가 즉시
    // insetWhileOpen - 100으로 floor를 계산해야 한다.
    root.scrollTop = BASE_CONTENT_HEIGHT + insetWhileOpen - CLIENT_HEIGHT - 100;
    const scrollTopAfterClose = root.scrollTop;

    viewport.closeKeyboard();
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false));
    const floorAfterClose = insetWhileOpen - 100;
    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(floorAfterClose));
    expect(floorAfterClose).toBeGreaterThan(0);   // 전제 확인 — 지연 해제가 실제로 진행 중이어야 이 테스트가 의미 있다.
    expect(shellHasHoldingMarker(root)).toBe(true);   // "final step to 0"이 아닌 동안은 마커가 있어야 트랜지션이 꺼진다.

    // 사용자는 스크롤하지 않았다 — 그런데도 'scroll' 이벤트가 한 번 발생한다(예: 브라우저
    // 자신의 clamp가 dispatch하는 네이티브 scroll, 또는 다른 리스너의 부수 효과). 지금
    // 렌더된 padding이 아직 옛 값(insetWhileOpen)에 머물러 있어도(시뮬레이션), 이 훅은
    // rendered가 아니라 committed target 기준으로 재야 하므로 floor가 그대로여야 한다.
    root.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(parseFloat(keyboardInsetOf(root))).toBe(floorAfterClose);   // 팬텀 붕괴 없음
    expect(root.scrollTop).toBe(scrollTopAfterClose);

    // 이번엔 사용자가 실제로 완전히 안전한 지점(natural max)까지 스크롤한다 — 정상적으로
    // 0까지 완전히 풀려야 하고, 그 "마지막 한 걸음"에서는 마커가 사라져(final step to 0)
    // 다시 트랜지션이 허용돼야 한다(css/page.css:47-54가 원래 의도한 부드러운 축소).
    root.scrollTop = BASE_CONTENT_HEIGHT - CLIENT_HEIGHT;
    root.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(shellHasHoldingMarker(root)).toBe(false);   // floor가 0이면 마커가 없어야 마지막 트랜지션이 걸린다.
  });

  it("지연 해제가 필요 없는 보통 경로(닫자마자 floor가 곧장 0)에서는 마커가 아예 붙지 않는다 — 기존 부드러운 축소 트랜지션이 계속 걸린다", async () => {
    // 위 테스트가 "마커가 있어야 트랜지션이 꺼진다"만 확인하면, ".keyboard-inset-open이
    // 아니기만 하면 무조건 마커를 붙인다" 같은 과도한 구현도 통과해 버린다 — 그러면
    // 지연 해제가 필요 없는 흔한 경로(맨 아래가 아닌 곳에서 닫는 경우, releaseFloor가
    // 곧장 0)에서도 마커가 붙어 css/page.css:47-54가 원래 의도한 부드러운 축소
    // 트랜지션 자체가 통째로 사라진다. 마커는 releaseFloor > 0일 때만 붙어야 한다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 37));
    expect(shellHasHoldingMarker(root)).toBe(false);   // 열려 있는 동안도 당연히 없다(keyboard-inset-open만 있다).

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));   // 지오메트리 가드로 즉시 0(지연 해제 불필요)
    expect(shellHasHoldingMarker(root)).toBe(false);   // floor가 0이므로 마커도 없다 — 트랜지션이 정상적으로 걸린다.
  });

  it("팬이 도는 동안에는 스크롤하지 않고, 뷰포트가 멈춘 뒤의 지오메트리로 한 번만 잰다 — owner 실기기 트레이스 2026-08-04", async () => {
    // 안드로이드는 키보드를 올릴 때 레이아웃을 줄이는 대신 비주얼 뷰포트를 팬한다
    // (트레이스 vpTop 0→329). 팬 자체가 필드를 드러내므로, 팬 전 지오메트리로 재고 곧장
    // 스크롤하면 브라우저와 이중으로 밀어 올린다. 닫을 때 되돌리지 않는 계약(§9) 때문에
    // 그 초과분이 영구히 남아, 열고 닫을 때마다 페이지가 조금씩 위로 밀렸다(실기기
    // st 877→912→936→998에서 수렴). 근거 전체는 src/surfaces/AppShell.tsx의
    // KEYBOARD_VIEWPORT_SETTLE_MS를 쓰는 이펙트 주석에.
    //
    // **이 테스트가 실제로 가르는 것.** 팬만으로 이미 충분해서 킷이 스크롤할 이유가
    // 전혀 없는 배치를 쓴다:
    //   팬 전  visBot = 0   + 653 = 653 → over = 696 - 653 + 24 = +67  (예전 동작은 여기서 움직인다)
    //   팬 후  visBot = 329 + 653 = 982 → over = 696 - 982 + 24 = -262 (움직일 이유가 없다)
    // 그러므로 올바른 최종 스크롤량은 정확히 0이고, 팬 전에 재던 동작은 67이다 — 이 단언은
    // "무엇을 계산하느냐"가 아니라 **언제 재느냐**에만 반응한다. 이 브랜치에서 실패할 수
    // 없는 테스트가 이미 네 번 나왔으므로, 고침을 빼면 실제로 빨개지는지 확인하고 넣었다.
    installReducedMotionPreference();   // 트윈 대신 즉시 대입 — 타이밍이 아니라 "얼마나 갔나"만 본다
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1059 });
    const viewport = installFakeVisualViewport(1060);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottomFollowingScroll(textarea, 696, root);   // 킷이 스크롤하면 rect도 따라 올라간다

    textarea.focus();
    viewport.openKeyboard(407);
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(true));

    // 팬은 실기기처럼 여러 단계로 온다 — 각 단계가 settle 타이머를 다시 건다.
    for (const offsetTop of [14, 112, 268, 329]) {
      (window.visualViewport as unknown as { offsetTop: number }).offsetTop = offsetTop;
      window.visualViewport!.dispatchEvent(new Event("resize"));
      await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(1059 - (offsetTop + 653)));
    }

    await new Promise((resolve) => { window.setTimeout(resolve, 250); });   // settle 창구(80ms)보다 넉넉히

    expect(root.scrollTop).toBe(0);
  });

  it("예약 여백이 0인 팬 방식 기기에서도, 닫히는 한 프레임의 clientHeight 부풀림이 뷰포트를 깎지 못한다 — owner 실기기 트레이스 2026-08-04", async () => {
    // 트레이스가 확정한 값들을 그대로 쓴다(네 사이클, 산술이 ±1px로 일치):
    //   #root는 height:100dvh(tokens.css:134). 닫히는 한 프레임에 dvh가 더 큰 뷰포트
    //   기준으로 재계산돼 clientHeight가 1192로 읽힌다(실제 1060/928). 그 순간 브라우저가
    //   scrollTop <= scrollHeight - 1192를 강제한다:
    //     사이클1 sh=1997 st 835->806  (1997-1192=805, +1은 서브픽셀 반올림)
    //     사이클2 sh=2002 st 875->811  (810)
    //     사이클3 sh=2007 st 878->816  (815)
    //     사이클4 sh=1997 st 758 그대로 (758이 이미 805 아래 — 음성 대조군)
    //
    // C1(아래 테스트)이 이걸 못 잡은 이유가 두 가지다. (1) C1은 --keyboard-inset이 안
    // 바뀌면 scrollHeight도 안 바뀌니 안전하다고 봤지만, max는 scrollHeight-clientHeight라
    // clientHeight만 부풀어도 줄어든다. (2) 예전 스텁은 scrollTop에 접근할 때만 clamp해서
    // C1은 부풀림을 되돌린 "뒤"에 읽는 것으로 통과할 수 있었다 — 실제 브라우저는 읽든 말든
    // 레이아웃 시점에 깎는다(setClientHeight 주석 참고).
    //
    // 예약 여백이 0인 이유도 트레이스에 있다: 안드로이드는 리사이즈가 아니라 비주얼
    // 뷰포트를 팬한다(vpTop 0->407). --keyboard-inset은
    // covered = innerHeight - (offsetTop + height)를 따르므로 키보드가 아직 올라와 있는
    // 동안 0으로 빠지고, lastOpenInsetRef가 붙들 게 남지 않는다. 그래서 "닫힐 때 인셋을
    // 유지한다"(77f28fa)는 이 기기에서 아무것도 유지하지 못한다.
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1059 });
    const viewport = installFakeVisualViewport(1060);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);   // 이미 잘 보인다 — reposition()의 스크롤을 섞지 않고 clamp만 격리한다
    const CH_WHILE_OPEN = 1060;
    const CH_CLOSING_SPIKE = 1192;   // 실측값
    const CONTENT = 1997;            // 실측 scrollHeight(인셋 0)
    const scrollRoot = installClampingScrollRoot(root, CONTENT, CH_WHILE_OPEN);

    textarea.focus();
    viewport.openKeyboard(407);
    (window.visualViewport as unknown as { offsetTop: number }).offsetTop = 407;   // 팬
    window.visualViewport!.dispatchEvent(new Event("resize"));
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(true));
    expect(parseFloat(keyboardInsetOf(root))).toBe(0);   // 팬 때문에 예약이 0 — 이 테스트의 전제

    root.scrollTop = 835;
    expect(root.scrollTop).toBe(835);

    (window.visualViewport as unknown as { offsetTop: number }).offsetTop = 0;
    viewport.closeKeyboard();
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false));   // 닫히는 렌더가 커밋됐다

    scrollRoot.setClientHeight(CH_CLOSING_SPIKE);   // 트레이스의 그 한 프레임(+32ms)

    // 불변식: 킷은 스크롤을 요청한 적이 없다(reqΔ=0). 그러니 achΔ도 0이어야 한다.
    // 고침 전에는 1997-1192=805로 깎여 806이 된다(트레이스 사이클 1과 같은 값).
    expect(root.scrollTop).toBe(835);
  });

  /* 붙든 값으로 재는 순간을 만드는 준비 — 아래 두 검사가 **같은 상황의 서로 다른
   * 사실**을 봅니다(여백이 깎이는가 · scrollTop이 움직이는가). 한 `it`에 몰면 앞의
   * 단언이 먼저 터질 때 뒤가 **실행조차 안 됩니다** — 그러면 뒤의 것은 지켜지는 척만
   * 하는 문장입니다. 그래서 나눕니다.
   *
   * 산수(`naturalMax = scrollHeight - current - clientHeight`에서 `current`가 상쇄되므로
   * 그냥 `BASE_CONTENT - clientHeight`입니다):
   *
   * ```
   * 붙든 값으로 재면    naturalMax = 1997 - 1060 = 937 → 남길 여백 1100 - 937 = 163
   * 진짜 값으로 재면    naturalMax = 1997 - 1200 = 797 → 남길 여백 1100 - 797 = 303
   * ```
   *
   * 붙든 값은 실제보다 **작으므로** naturalMax를 과대평가하고 그만큼 **더 걷어냅니다.** */
  const PIN = { BASE_CONTENT: 1997, PINNED_HEIGHT: 1060, REAL_HEIGHT: 1200, SCROLL_TOP: 1100 };
  const KEPT_IF_MEASURED_RIGHT = PIN.SCROLL_TOP - (PIN.BASE_CONTENT - PIN.REAL_HEIGHT);        // 303
  const STRIPPED_IF_MEASURED_PINNED = PIN.SCROLL_TOP - (PIN.BASE_CONTENT - PIN.PINNED_HEIGHT); // 163

  /** 창구가 열린 채(핀이 걸린 채) 사용자가 위로 스크롤한 **직후 정착까지 끝난** 상태를
   * 만들고 `#root`를 돌려준다. 두 검사가 공유한다. */
  async function scrollDuringPinnedWindow({ reopenOnce = false } = {}) {
    // 🔴 **reduced motion으로 rAF를 통째로 없앱니다.** animateFloorTo가 즉시 대입하므로
    // 관측이 프레임 속도에 안 걸립니다 — 앞선 네 번의 시도가 전부 여기서 흔들렸습니다.
    // 남는 시간축은 정착 타이머 하나뿐이고 그건 가짜 타이머로 잡습니다.
    vi.useFakeTimers();
    installReducedMotionPreference();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: PIN.PINNED_HEIGHT - 1 });
    const viewport = installFakeVisualViewport(PIN.PINNED_HEIGHT);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);
    const scrollStub = installClampingScrollRoot(root, PIN.BASE_CONTENT, PIN.PINNED_HEIGHT);

    act(() => { textarea.focus(); viewport.openKeyboard(407); });
    act(() => { vi.advanceTimersByTime(200); });
    expect(shellHasKeyboardInsetOpenMarker(root)).toBe(true);
    const insetWhileOpen = parseFloat(keyboardInsetOf(root));
    root.scrollTop = scrollStub.currentMax();   // 맨 아래 — 걷어낼 여백이 생기는 자리

    act(() => { viewport.closeKeyboard(); });

    /* 첫 창구가 끝나기 전에 다시 열었다 닫습니다 — 첫 창구의 **정리가 실제로 도는**
     * 자리입니다. 정리가 스크롤 리스너를 안 떼면 그 리스너는 `heightPinned`가 이미
     * `false`인 클로저를 물고 살아남아, **두 번째 창구가 붙들고 있는 동안에도** 잽니다.
     * 새 리스너는 가드에 막히는데 옛 리스너는 안 막히므로, 가드가 우회됩니다. */
    if (reopenOnce) {
      act(() => { viewport.openKeyboard(407); });
      expect(root.style.height).toBe("");   // 전제: 정리가 돌아 핀이 풀렸다
      act(() => { viewport.closeKeyboard(); });
    }

    // 전제 넷 — 하나라도 어긋나면 아래 두 검사가 공허합니다.
    expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false);
    expect(root.style.height).toBe(`${PIN.PINNED_HEIGHT}px`);                    // 붙들려 있다
    expect(parseFloat(keyboardInsetOf(root))).toBe(insetWhileOpen);              // 아직 통째로 남아 있다
    expect(insetWhileOpen).toBeGreaterThan(KEPT_IF_MEASURED_RIGHT);              // 걷어낼 여백이 실제로 있다
    expect(STRIPPED_IF_MEASURED_PINNED).toBeLessThan(KEPT_IF_MEASURED_RIGHT);    // 두 산수가 실제로 갈린다

    // 창구 도중 주소창이 접혀 **실제** 높이가 커집니다. 붙든 인라인 값이 아직 이기므로
    // clientHeight는 여전히 작게 읽힙니다 — 지금 재면 과대평가입니다.
    scrollStub.setClientHeight(PIN.REAL_HEIGHT);
    const writes = trackKeyboardInsetWrites(root);

    /* 사용자가 위로 스크롤합니다. ⚠️ **이벤트만 쏘면 안 됩니다** — 목표가 그대로면
     * recompute가 `next === current`로 즉시 빠져나가 가드를 지워도 초록입니다(실측). */
    act(() => {
      root.scrollTop = PIN.SCROLL_TOP;
      root.dispatchEvent(new Event("scroll"));
    });

    // 정착 타이머(KEYBOARD_INSET_SETTLE_MS = 120ms)가 풀고 **진짜** 지오메트리로 한 번 잽니다.
    act(() => { vi.advanceTimersByTime(200); });
    expect(root.style.height).toBe("");   // 창구가 끝났다

    // MutationObserver의 콜백은 마이크로태스크로 옵니다 — 동기 검사에서는 영영 안
    // 돕니다(처음에 writes가 빈 배열이었습니다). 가짜 타이머는 마이크로태스크를 안
    // 가리므로 await 한 번이면 흘러갑니다.
    await Promise.resolve();
    return { root, writes };
  }

  /* 🔴 **붙들려 있는 동안에는 재지 않습니다** — `recompute`의 `if (heightPinned) return;`.
   * 소스 주석이 *"바로 이 고침이 없애려던 그 이동"* 이라고 적어 둔 자리인데, 그 줄을
   * 지우면 남는 여백이 **303px → 163px**로 깎입니다(변이로 확인).
   *
   * ⚠️ **네 번 실패한 뒤의 다섯 번째입니다**(2026-08-19). 앞의 넷은 전부 *"창구가 도는
   * 동안"* 을 보려 해서 정상 해제(120ms 정착 타이머)와 경합했습니다:
   *
   * ```
   * setTimeout(60)      판별됨 — 그러나 흔들림(rAF가 한 번도 안 도는 실행이 있음)
   * rAF 6프레임 세기     흔들림이 뒤집힘 — 프레임이 느리면 정착 타이머가 먼저 터짐
   * rAF를 직접 돌리기    안정적 — 판별력 0
   * + act()로 감싸기     여전히 판별력 0
   * ```
   *
   * 🟢 **바뀐 것은 관측 시점입니다 — 중간이 아니라 끝을 봅니다.** floor는 절대 다시 안
   * 늘어나므로(`Math.min(current, candidate)`), 창구 안에서 잘못 깎은 몫은 **영구히**
   * 남습니다. 그래서 "언제 보는가"가 결과를 안 바꿉니다. 정상 해제와 변이가 같은
   * 관찰값을 낸다고 적었던 것은 앞선 검사가 `scrollTop = 0`으로 밀어 **양쪽 다 0으로
   * 무너지는 자리**를 골랐기 때문이었습니다 — 중간값에서는 둘이 140px 갈립니다. */
  it("붙들려 있는 동안의 스크롤은 예약 여백을 걷어내지 않는다 — 붙든 값으로 재면 안 된다", async () => {
    const { root, writes } = await scrollDuringPinnedWindow();

    expect(parseFloat(keyboardInsetOf(root))).toBe(KEPT_IF_MEASURED_RIGHT);
    // reduced motion이므로 중간값 없이 딱 한 번 — 1667의 해제 검사와 같은 idiom.
    expect(writes).toEqual([KEPT_IF_MEASURED_RIGHT]);
  });

  /* 위 검사와 **같은 상황의 다른 사실**입니다. 여백을 잘못 깎으면 scrollHeight가 줄고,
   * 그러면 브라우저가 scrollTop을 clamp합니다 — 사용자가 요청한 적 없는 이동(§16.2
   * Agency). 소스 주석이 말하는 *"바로 이 고침이 없애려던 그 이동"* 이 이것입니다.
   * 변이를 심으면 1100 → 960으로 내려갑니다(= 797 + 163, 깎인 floor 기준의 새 상한). */
  it("붙들려 있는 동안의 스크롤이 사용자가 요청하지 않은 이동을 만들지 않는다 — §16.2", async () => {
    const { root } = await scrollDuringPinnedWindow();

    expect(root.scrollTop).toBe(PIN.SCROLL_TOP);
  });

  /* 🔴 **정리가 스크롤 리스너를 안 떼면 위 가드가 우회됩니다**(2026-08-19).
   * 리뷰 배터리가 이 자리(`return () => { scrollRoot.removeEventListener(...) }`)를
   * 0 red로 보고했고 원장은 *"등가로 보임 — 확인 필요"* 로 남겨 두고 있었습니다.
   * **등가가 아닙니다.**
   *
   * 왜: 창구가 끝나기 전에 다시 열면 정리가 돌면서 `unpinHeight()`로 그 클로저의
   * `heightPinned`를 `false`로 만듭니다. 리스너를 안 떼면 그 클로저가 **다음 창구까지**
   * 살아남아, 새 창구가 붙들고 있는 동안에도 **가드에 안 걸린 채** 잽니다. 새 리스너는
   * `heightPinned === true`라 얌전히 빠져나가는데 옛 리스너가 대신 깎습니다.
   *
   * 열고 닫기를 반복할수록 리스너가 쌓입니다 — `recompute`는 이펙트가 돌 때마다 새
   * 클로저라 `addEventListener`의 중복 제거가 안 걸립니다.
   *
   * 🔴 **위 두 검사도 이 변이에 빨개집니다 — 그래도 이 검사를 둡니다.** 재 보니 이유가
   * 있었습니다: 이 이펙트는 `!keyboard.open`이면 도는데 거기엔 **첫 마운트**도 들어갑니다.
   * 그때 붙은 리스너는 `heightPinned`가 처음부터 `false`라, 정리가 안 떼면 첫 창구부터
   * 이미 가드를 우회합니다(위 검사는 다시 열지도 않는데 빨개졌습니다 — 그게 그 증거입니다).
   *
   * 그러면 이 검사는 왜 남기나: 저 경로는 **첫 마운트 리스너에 의존**합니다. 언젠가
   * *"열린 적 없으면 리스너도 안 단다"* 같은 최적화가 들어오면 위 둘은 조용히 이 변이를
   * 놓치고, 이 검사만 남습니다. 같은 결함의 **다른 경로**이지 같은 검사가 아닙니다. */
  it("창구가 다시 열렸다 닫혀도 옛 스크롤 리스너가 남아 가드를 우회하지 않는다", async () => {
    const { root } = await scrollDuringPinnedWindow({ reopenOnce: true });

    expect(parseFloat(keyboardInsetOf(root))).toBe(KEPT_IF_MEASURED_RIGHT);
    expect(root.scrollTop).toBe(PIN.SCROLL_TOP);
  });
  /* 🔴 **정리가 정착 타이머를 안 지우면 옛 타이머가 새 창구의 핀을 먼저 풉니다**
   * (2026-08-19). 배터리가 0 red로 보고했고 원장이 *"해제 창구 한 덩어리로 볼 것"* 으로
   * 미뤄 둔 자리입니다.
   *
   * 창구는 120ms입니다. 그 안에 다시 열었다 닫으면(잘못 닫고 곧장 다시 탭 — 흔한 조작)
   * 창구가 **겹칩니다**. 옛 타이머가 살아 있으면 그것이 먼저 터져 `unpinHeight()`로
   * **새 창구가 붙든 높이를 풀어 버립니다** — 남은 시간 동안 그 창구는 보호 없이
   * 놓입니다. 그 상태에서 스크롤이 오면 바로 위 두 검사가 막는 그 사고가 납니다.
   *
   * 🟢 시간은 전부 가짜 타이머로 잡습니다 — 벽시계가 안 끼어들므로 부하와 무관합니다. */
  it("창구가 다시 열렸다 닫히면 옛 정착 타이머가 새 창구의 핀을 먼저 풀지 않는다", () => {
    vi.useFakeTimers();
    installReducedMotionPreference();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: PIN.PINNED_HEIGHT - 1 });
    const viewport = installFakeVisualViewport(PIN.PINNED_HEIGHT);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);
    const scrollStub = installClampingScrollRoot(root, PIN.BASE_CONTENT, PIN.PINNED_HEIGHT);

    act(() => { textarea.focus(); viewport.openKeyboard(407); });
    act(() => { vi.advanceTimersByTime(200); });
    root.scrollTop = scrollStub.currentMax();

    act(() => { viewport.closeKeyboard(); });                      // 창구 1 — 옛 타이머는 T=120
    expect(root.style.height).toBe(`${PIN.PINNED_HEIGHT}px`);      // 전제: 붙들렸다

    act(() => { vi.advanceTimersByTime(20); });                    // T = 20
    act(() => { viewport.openKeyboard(407); });                    // 정리 — 옛 타이머를 지워야 한다
    act(() => { viewport.closeKeyboard(); });                      // 창구 2 — 새 타이머는 T=140
    expect(root.style.height).toBe(`${PIN.PINNED_HEIGHT}px`);      // 전제: 다시 붙들렸다

    act(() => { vi.advanceTimersByTime(110); });                   // T = 130 — 옛 타이머가 살아 있으면 여기서 터진다
    expect(root.style.height).toBe(`${PIN.PINNED_HEIGHT}px`);      // 🔴 아직 창구 2의 것이다

    // 공허 대조 — 새 타이머는 제때 실제로 풉니다. 이게 없으면 위 단언은 "아무 타이머도
    // 안 도는 상태"에서도 통과합니다.
    act(() => { vi.advanceTimersByTime(20); });                    // T = 150 > 140
    expect(root.style.height).toBe("");
  });

  /* 🔴 **정리가 rAF를 안 끊으면 옛 해제 애니메이션이 새 여백을 덮어씁니다**(2026-08-19).
   * 이것도 배터리가 0 red로 보고한 자리입니다.
   *
   * 해제는 400ms에 걸친 rAF 애니메이션입니다(`animateFloorTo`). 그 도중에 키보드가
   * 다시 열리면 이 사이클은 끝난 것이고, 다시 닫힐 때 여백은 **마지막 열림 인셋으로
   * 통째로** 복원됩니다(렌더 단계 보정). 그런데 옛 프레임 루프가 살아 있으면 그것이
   * 자기 옛 목표를 향해 계속 `setReleaseFloor`를 부릅니다 — 방금 복원한 여백을
   * 프레임마다 깎아 내립니다. 사용자에게는 다시 닫자마자 여백이 스르륵 사라지는 것으로
   * 보이고, 그 자리는 §16.2가 막으려는 "요청하지 않은 이동"입니다.
   *
   * ⚠️ **여기서는 reduced motion을 켜지 않습니다** — 이 검사가 보는 것이 rAF 자체입니다.
   * vitest의 가짜 타이머는 `requestAnimationFrame`도 가립니다(실측). 위 핀 가드 검사들이
   * reduced motion을 쓰는 것과 이유가 반대입니다. */
  it("창구가 다시 열렸다 닫혀도 옛 해제 애니메이션이 복원된 여백을 덮어쓰지 않는다", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: PIN.PINNED_HEIGHT - 1 });
    const viewport = installFakeVisualViewport(PIN.PINNED_HEIGHT);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);
    const scrollStub = installClampingScrollRoot(root, PIN.BASE_CONTENT, PIN.PINNED_HEIGHT);

    act(() => { textarea.focus(); viewport.openKeyboard(407); });
    act(() => { vi.advanceTimersByTime(600); });   // 열림 보정 애니메이션까지 끝냅니다
    const insetWhileOpen = parseFloat(keyboardInsetOf(root));
    root.scrollTop = scrollStub.currentMax();

    act(() => { viewport.closeKeyboard(); });
    // 위로 스크롤해 둡니다 — 정착 타이머의 recompute가 걷어낼 몫을 찾아 애니메이션을
    // 시작합니다. 스크롤 이벤트는 필요 없습니다(정착이 그 순간의 scrollTop을 읽습니다).
    root.scrollTop = PIN.SCROLL_TOP;
    act(() => { vi.advanceTimersByTime(130); });   // 정착(120ms) — 여기서 해제 애니메이션 시작
    act(() => { vi.advanceTimersByTime(100); });   // 애니메이션(400ms)의 한복판

    // 전제 둘 — 애니메이션이 실제로 돌고 있어야 아래가 공허하지 않습니다.
    const midFlight = parseFloat(keyboardInsetOf(root));
    expect(midFlight).toBeLessThan(insetWhileOpen);
    expect(midFlight).toBeGreaterThan(STRIPPED_IF_MEASURED_PINNED);   // 아직 목표에 도착 전

    act(() => { viewport.openKeyboard(407); });    // 정리 — 프레임 루프를 끊어야 한다
    act(() => { viewport.closeKeyboard(); });      // 여백이 마지막 열림 인셋으로 복원된다
    expect(parseFloat(keyboardInsetOf(root))).toBe(insetWhileOpen);   // 전제: 복원됐다

    // 🔴 옛 루프가 살아 있으면 여기서 다시 깎입니다. 새 창구의 정착(120ms) 전이므로
    // 정상 경로에서는 아무것도 안 움직여야 합니다.
    act(() => { vi.advanceTimersByTime(60); });
    expect(parseFloat(keyboardInsetOf(root))).toBe(insetWhileOpen);
  });

  it("붙들어 둔 #root 높이는 창구가 끝나기 전에 다시 열려도 남지 않는다 — 인라인 height 누수", async () => {
    // 리뷰가 커버리지 0으로 실증한 구멍: 이펙트 cleanup의 unpinHeight()를 통째로 지워도
    // 전체 스위트가 초록이었다. 그런데 그게 새면 #root에 인라인 height가 **영구히** 남고,
    // 그때부터 이 스크롤 호스트는 100dvh를 따르지 않는다(인라인이 이긴다) — 주소창이
    // 접히거나 화면을 돌려도 높이가 그대로라, 키보드와 무관한 자리에서 레이아웃이 깨진다.
    // 창구는 120ms뿐이지만 그 안에 다시 여는 건 흔한 조작이다(잘못 닫고 곧장 다시 탭).
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1059 });
    const viewport = installFakeVisualViewport(1060);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);
    installClampingScrollRoot(root, 1997, 1060);

    textarea.focus();
    viewport.openKeyboard(407);
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(true));

    viewport.closeKeyboard();
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false));
    expect(root.style.height).not.toBe("");   // 전제: 지금은 붙들려 있어야 한다(아니면 아래가 공허하다)

    viewport.openKeyboard(407);   // KEYBOARD_INSET_SETTLE_MS(120ms)가 지나기 전에 다시 연다
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(true));

    expect(root.style.height).toBe("");   // cleanup이 풀었다 — 인라인 height가 남지 않는다
  });

  it("맨 아래로 스크롤된 채 닫히는 순간 clientHeight가 실제보다 부풀려 읽혀도(실기기 dvh 재계산 트랜지션) 뷰포트가 움직이지 않는다 — 두 번의 열기/닫기 사이클 모두(C1, owner 실기기 트레이스)", async () => {
    // owner 실기기 트레이스: 메모를 맨 아래로 스크롤한 채 키보드를 열었다 닫으면 뷰포트가
    // 위로 "뚝" 움직인다. 반복하면 또 움직이고, 몇 번 반복하면 결국 예약 여백이 바닥나
    // 재열림 때 필드가 다시 가려진다. 트레이스가 잡은 원인: #root는 height:100dvh라
    // 닫히는 전환 도중 dvh가 잠깐 더 큰 뷰포트 기준으로 재계산되며 clientHeight가
    // 실제보다 부풀려 읽힌다(실측 1192, 22ms 뒤 928로 스스로 바로잡음 — 같은 순간
    // visualViewport.height/window.innerHeight는 이미 정상이었다). 이전 구현("닫히는
    // 순간의 floor" — B1 문서의 항목 1)은 이 순간 scrollRoot.scrollTop을 읽어 naturalMax를
    // 계산했는데, installClampingScrollRoot의 get()이 실제 브라우저의 clamp를 흉내 내므로
    // (clientHeight가 부풀어 있으면 그 자리에서 scrollTop을 새 최댓값으로 깎는다) 그
    // 읽기 자체가 scrollTop을 되돌릴 수 없게 영구히 깎아 버렸다 — 우리 코드가 스크롤을
    // 요청한 적 없는데도(reqΔ=0) 뷰포트가 움직인 것이다(achΔ≠0, owner가 보는 "뚝" 움직임).
    //
    // 이 테스트는 owner가 실제로 보고한 시나리오(맨 아래)를 그대로 재현한다 — 맨 아래에서는
    // 걷어낼 여백이 아예 없으므로("맨 아래로 스크롤된 채..." 테스트, 위 참고) 정상적으로
    // 계산해도 floor는 항상 insetWhileOpen 그대로다. 그러니 여기서 실패한다면 그건 계산이
    // "틀려서"가 아니라, clientHeight가 부풀어 있는 동안 scrollTop을 읽었다는 사실 그
    // 자체가 부수효과로 뷰포트를 움직였기 때문이다 — 그래서 이 테스트는 clientHeight를
    // 되돌린 "뒤"에만 scrollTop을 읽는다(스텁의 read-side clamp가 아니라 실제 코드가
    // 무엇을 했는지를 재기 위해서다).
    //
    // 고침(이 리포트의 C1): 닫히는 렌더는 이 순간 clientHeight를 아예 읽지 않고(scrollTop도
    // 읽지 않는다) 마지막 열림 인셋을 그대로 유지한다 — --keyboard-inset이 안 바뀌므로
    // scrollHeight도 안 바뀌어, clientHeight가 튀어도 clamp가 물리적으로 발생할 여지가
    // 없다. 진짜 floor는 지오메트리가 안정된 뒤 한 번만 잰다(KEYBOARD_INSET_SETTLE_MS).
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);   // 이미 잘 보임 — reposition()이 따로 스크롤하지 않게, 지연 해제 산수만 격리해서 본다
    const CLIENT_HEIGHT_TRUE = 800;
    const CLIENT_HEIGHT_SPIKE = 930;   // 실기기 트레이스의 부풀림 폭(~131px)과 같은 자릿수
    let content = 20000;
    const scrollRoot = installClampingScrollRoot(root, content, CLIENT_HEIGHT_TRUE);

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    const insetWhileOpen = parseFloat(keyboardInsetOf(root));

    // ---- 사이클 1 ---- 맨 아래(SLACK 0) — 예약 여백을 전부 쓰는 중.
    root.scrollTop = content + insetWhileOpen - CLIENT_HEIGHT_TRUE;
    const bottomScrollTop1 = root.scrollTop;

    scrollRoot.setClientHeight(CLIENT_HEIGHT_SPIKE);   // 닫히는 전환 도중 dvh가 부풀려 읽히는 그 프레임
    viewport.closeKeyboard();
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false));   // 닫히는 렌더가 커밋됐다
    scrollRoot.setClientHeight(CLIENT_HEIGHT_TRUE);   // 실기기 트레이스: 22ms 뒤 스스로 바로잡는다 — scrollTop을 읽기 "전"에 되돌린다

    // 맨 아래에서는 걷어낼 여백이 없다 — floor는 처음부터 끝까지 insetWhileOpen 그대로다.
    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(insetWhileOpen));
    // 핵심 불변식(owner가 계속 말하는 그것): clientHeight가 닫는 순간 부풀려 있었어도,
    // 지오메트리가 안정된 뒤에 보면 뷰포트는 조금도 움직이지 않았다. achΔ는 0이다.
    expect(root.scrollTop).toBe(bottomScrollTop1);

    // ---- 사이클 2 ---- (owner 리포트의 "반복하면 또 움직인다") 계속 타이핑하며 콘텐츠가
    // 자란다(B1과 같은 이유로 사이클이 진짜 독립적인지 확인).
    scrollRoot.growContentBy(1000);
    content += 1000;
    viewport.openKeyboard(350);   // 포커스는 유지된 채 다시 연다(블러 없음, owner 리포트의 "다시 탭하면"과 같은 모양)
    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(insetWhileOpen));

    root.scrollTop = content + insetWhileOpen - CLIENT_HEIGHT_TRUE;   // 다시 맨 아래
    const bottomScrollTop2 = root.scrollTop;

    scrollRoot.setClientHeight(CLIENT_HEIGHT_SPIKE);
    viewport.closeKeyboard();
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false));
    scrollRoot.setClientHeight(CLIENT_HEIGHT_TRUE);

    // 사이클 1과 똑같이 안정된다 — 사이클을 거듭해도 예약 여백이 줄어들지 않는다
    // (compounding 없음). 한 사이클만 봤다면 이 "매번 같은 값"이라는 계약은 확인할 수
    // 없었다 — owner 리포트가 명시적으로 요구하는 두 사이클 검증이다.
    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(insetWhileOpen));
    expect(root.scrollTop).toBe(bottomScrollTop2);   // 사이클 2 전체를 통틀어 한 번도 움직이지 않았다
  });

  it("맨 아래가 아니라 정말로 걷어낼 여백이 있을 때는, clientHeight가 닫는 순간 부풀려 읽혀도 안정된(부풀지 않은) 값 기준으로 floor를 계산한다(C1)", async () => {
    // 위 테스트가 "맨 아래(걷어낼 게 없음)"만 확인하면, 걷어낼 여백이 실제로 있는
    // 경우(예: 293/619번째 줄의 "지연 해제" 테스트들)에도 여전히 정상적으로 줄어드는지
    // 확인할 수 없다 — 이 테스트는 그 경로가 살아있는지, 그리고 그 계산이 부풀려진
    // clientHeight가 아니라 안정된 값을 쓰는지를 함께 확인한다.
    //
    // SLACK(정말 필요한 여백을 넘어서는 폭)은 스파이크 폭(D=130)보다 크게 잡는다 —
    // 실기기 트레이스도 같은 모양이다(그 순간 실제로 남아 있던 여유 273px이 스파이크
    // 폭 ~131px보다 커서 "그 자리에서 유지"만으로 clamp를 피할 수 있었다). SLACK이
    // D보다 작은 경우(사실상 맨 아래에 아주 가까운 경우)는 D-SLACK만큼의 clamp가
    // 물리적으로 불가피하다 — clientHeight 스파이크는 우리 코드와 무관하게 실제
    // 레이아웃이 그 순간 그만큼 부풀었다는 뜻이라, 얼마나 남겨 두든 그 프레임의 실제
    // 스크롤 가능 범위 자체가 줄어들기 때문이다(§9 리포트 "하드웨어만 확인 가능" 참고).
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);
    const CLIENT_HEIGHT_TRUE = 800;
    const CLIENT_HEIGHT_SPIKE = 930;   // +130
    const SLACK = 200;   // > 130 — "유지"만으로 clamp를 피할 수 있는 실기기와 같은 관계
    let content = 20000;
    const scrollRoot = installClampingScrollRoot(root, content, CLIENT_HEIGHT_TRUE);

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    const insetWhileOpen = parseFloat(keyboardInsetOf(root));

    // ---- 사이클 1 ----
    root.scrollTop = content + insetWhileOpen - CLIENT_HEIGHT_TRUE - SLACK;
    const bottomScrollTop1 = root.scrollTop;

    scrollRoot.setClientHeight(CLIENT_HEIGHT_SPIKE);
    viewport.closeKeyboard();
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false));
    scrollRoot.setClientHeight(CLIENT_HEIGHT_TRUE);   // 안정된 값으로 되돌린 "뒤"에만 읽는다

    // 안정된 clientHeight(800) 기준으로 계산하면 insetWhileOpen - SLACK이 정답이다.
    // 부풀려진 clientHeight(930)로 계산했다면 다른(더 큰) 값에 멈춰 있었을 것이다.
    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(insetWhileOpen - SLACK));
    expect(root.scrollTop).toBe(bottomScrollTop1);   // 걷어내는 동안에도 뷰포트 자체는 움직이지 않았다

    // ---- 사이클 2 ---- 콘텐츠가 더 자란 채로 반복해도 같은 폭만큼만 걷어낸다(compounding 없음).
    scrollRoot.growContentBy(1000);
    content += 1000;
    viewport.openKeyboard(350);
    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(insetWhileOpen));

    root.scrollTop = content + insetWhileOpen - CLIENT_HEIGHT_TRUE - SLACK;
    const bottomScrollTop2 = root.scrollTop;

    scrollRoot.setClientHeight(CLIENT_HEIGHT_SPIKE);
    viewport.closeKeyboard();
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false));
    scrollRoot.setClientHeight(CLIENT_HEIGHT_TRUE);

    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(insetWhileOpen - SLACK));   // 사이클 1과 똑같은 폭 — 더 깎이지 않는다
    expect(root.scrollTop).toBe(bottomScrollTop2);
  });

  it("닫힌 뒤 예약 여백이 걷힐 때 한 번에 뛰지 않고 여러 프레임에 걸쳐 연속으로 줄어든다 — 다이얼로그 박스와 같은 리듬", async () => {
    // owner: "다이얼로그에 키보드 올라왔다가 내려가면 움직이는 것처럼 그렇게 부드럽게
    // 하고싶어". 77f28fa는 마지막 열림 인셋을 KEYBOARD_INSET_SETTLE_MS만큼 유지했다가
    // recompute()가 계산한 값으로 "한 번에" 뛰었다 — 그 뜀 자체가 owner가 말하는 계단식
    // 움직임이다. 이제는 recompute()가 목표를 계산한 뒤 --motion-reposition(400ms)과
    // --sidebar-ease로 그 값까지 애니메이션한다(스크롤 보정이 이미 하는 것과 같은 곡선).
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);   // 이미 잘 보임 — reposition()이 따로 스크롤하지 않게
    const BASE_CONTENT_HEIGHT = 2000;
    const CLIENT_HEIGHT = 800;
    installClampingScrollRoot(root, BASE_CONTENT_HEIGHT, CLIENT_HEIGHT);

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    const insetWhileOpen = parseFloat(keyboardInsetOf(root));

    // 여유(SLACK)를 남긴 채 닫는다 — floor가 곧장 0으로 스킵되지 않고 실제로 줄어드는
    // 과정을 관찰할 수 있어야 한다.
    const SLACK = 200;
    root.scrollTop = BASE_CONTENT_HEIGHT + insetWhileOpen - CLIENT_HEIGHT - SLACK;
    const writes = trackKeyboardInsetWrites(root);

    viewport.closeKeyboard();
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false));   // 닫히는 렌더가 커밋됐다(hold 시작)

    const target = insetWhileOpen - SLACK;
    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(target));

    expect(writes.length).toBeGreaterThan(1);           // 한 번의 대입이 아니다 — 다이얼로그처럼 연속으로 움직인다
    expect(writes[writes.length - 1]).toBe(target);     // 마지막 프레임은 정확히 목표치
    // 단조 감소 — 다시 늘어나는 프레임이 없다(§16.2: 지연 "해제"이지 재예약이 아니다).
    for (let i = 1; i < writes.length; i++) expect(writes[i]).toBeLessThanOrEqual(writes[i - 1] + 0.01);
  });

  it("prefers-reduced-motion에서는 예약 여백 해제도 애니메이션 없이 즉시 옮긴다(짧게가 아니라 제거)", async () => {
    // §14: reduced motion은 "짧게"가 아니라 이동 자체를 없애는 것 — 스크롤 보정의
    // reduced-motion 테스트와 같은 계약을 예약 여백 해제에도 적용한다.
    installReducedMotionPreference();
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);
    const BASE_CONTENT_HEIGHT = 2000;
    const CLIENT_HEIGHT = 800;
    installClampingScrollRoot(root, BASE_CONTENT_HEIGHT, CLIENT_HEIGHT);

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    const insetWhileOpen = parseFloat(keyboardInsetOf(root));

    const SLACK = 200;
    root.scrollTop = BASE_CONTENT_HEIGHT + insetWhileOpen - CLIENT_HEIGHT - SLACK;
    const writes = trackKeyboardInsetWrites(root);

    viewport.closeKeyboard();
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false));

    const target = insetWhileOpen - SLACK;
    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(target));

    // hold(값 그대로라 mutation 없음) 다음 곧장 목표로 — 중간값 없이 딱 한 번의 실제 변경.
    expect(writes.length).toBe(1);
  });

  it("해제 애니메이션 도중 사용자가 위로 더 스크롤해 목표가 다시 줄어들면, 처음 값으로 되돌아가지 않고 지금 진행 중이던 값에서 새 목표로 이어간다 — §3 Interruptibility", async () => {
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);
    const BASE_CONTENT_HEIGHT = 2000;
    const CLIENT_HEIGHT = 800;
    installClampingScrollRoot(root, BASE_CONTENT_HEIGHT, CLIENT_HEIGHT);

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    const insetWhileOpen = parseFloat(keyboardInsetOf(root));

    // SLACK1은 insetWhileOpen보다 충분히 작게 남겨 둔다 — target1(=insetWhileOpen-SLACK1)과
    // 그 뒤 EXTRA만큼 더 줄어드는 target2가 둘 다 0 밑으로 내려가 Math.max(0, ...) 바닥에
    // 걸리지 않게(그러면 "새 목표로 이어가는지"가 아니라 바닥 클램프만 확인하는 셈이 된다).
    const SLACK1 = 150;
    root.scrollTop = BASE_CONTENT_HEIGHT + insetWhileOpen - CLIENT_HEIGHT - SLACK1;
    const writes = trackKeyboardInsetWrites(root);

    viewport.closeKeyboard();
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false));

    const target1 = insetWhileOpen - SLACK1;
    // 애니메이션이 target1에 닿기 전, 중간값에 도달할 때까지 기다린다. 이 창구는
    // KEYBOARD_INSET_SETTLE_MS(120ms) 이후 400ms 안에 있어야 하므로, 느린 머신에서
    // waitFor의 기본 1000ms 제한에 걸리지 않게 여유 있는 timeout을 명시로 준다(범위
    // 단언 자체는 그대로 — 느슨하게 만드는 게 아니라 기다리는 시간만 늘린다).
    await waitFor(() => {
      const now = parseFloat(keyboardInsetOf(root));
      expect(now).toBeLessThan(insetWhileOpen);
      expect(now).toBeGreaterThan(target1);
    }, { timeout: 3000 });
    const interruptFrom = parseFloat(keyboardInsetOf(root));

    // 사용자가 그 사이 위로 더 스크롤한다 — 더 적은 예약만 있어도 안전해진다.
    const EXTRA = 50;
    root.scrollTop -= EXTRA;
    root.dispatchEvent(new Event("scroll"));

    const target2 = target1 - EXTRA;
    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(target2));

    // 가로챈 뒤로는 그 어떤 프레임도 가로챈 시점(interruptFrom)보다 위로도, 맨 처음
    // (insetWhileOpen)으로도 되돌아가지 않는다 — 논리적 목표가 아니라 "지금" 값에서
    // 이어졌다는 뜻.
    const afterInterrupt = writes.slice(writes.indexOf(interruptFrom) + 1);
    for (const value of afterInterrupt) expect(value).toBeLessThanOrEqual(interruptFrom + 0.01);
    for (let i = 1; i < writes.length; i++) expect(writes[i]).toBeLessThanOrEqual(writes[i - 1] + 0.01);
  });

  it("해제 애니메이션이 진행되는 도중 clientHeight가 스크롤/타이머 이벤트 없이 흔들려도 이미 정해진 목표 자체는 다시 계산되지 않는다", async () => {
    // 이 애니메이션이 스텝(77f28fa)을 연속으로 바꾸면서 넓어진 위험 창구: C1이 고친
    // "닫히는 순간의 clientHeight 스파이크"는 KEYBOARD_INSET_SETTLE_MS(120ms) 동안 이미
    // 가라앉는다고 보고 recompute()의 첫 계산은 안정된 지오메트리를 쓴다(B1/C1 테스트가
    // 이미 고정해 둔 계약) — 그건 이 테스트의 대상이 아니다. 이 테스트가 보는 것은 그
    // "이후", recompute()가 이미 올바른(안정된 지오메트리 기준) 목표를 정하고 그쪽으로
    // 애니메이션하는 도중에, 스크롤/타이머 이벤트 없이 clientHeight가 또 흔들리는
    // 경우다 — recompute()를 다시 부를 계기(scroll 이벤트나 settle 타이머)가 전혀
    // 없으므로, animateFloorTo가 이미 겨냥한 target 자체는 이 흔들림으로 다시 계산되지
    // (더 작은 값으로 바뀌지) 않아야 한다.
    //
    // 이 시점의 실제 root.scrollTop 자체가 물리적으로 clamp될 수 있는지는 별개 문제라
    // 여기서 단언하지 않는다: 실제 브라우저는 scrollTop을 scrollHeight-clientHeight
    // 이하로 항상 강제하므로, 그 순간 남아있던 여유보다 스파이크가 크면(이 애니메이션이
    // 아직 target에 거의 다 왔을 때 캐치되는 경우 등) 그 clamp는 브라우저 자신의
    // 불변식이라 JS로 막을 방법이 없다 — 77f28fa는 이 창구가 1프레임이었고 이
    // 애니메이션은 최대 400ms로 넓힌다는 트레이드오프는 리포트("하드웨어만 확인
    // 가능")에 남긴다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);
    const CLIENT_HEIGHT_TRUE = 800;
    const BASE_CONTENT_HEIGHT = 2000;
    const scrollRoot = installClampingScrollRoot(root, BASE_CONTENT_HEIGHT, CLIENT_HEIGHT_TRUE);

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    const insetWhileOpen = parseFloat(keyboardInsetOf(root));

    const SLACK = 250;
    root.scrollTop = BASE_CONTENT_HEIGHT + insetWhileOpen - CLIENT_HEIGHT_TRUE - SLACK;

    viewport.closeKeyboard();
    await waitFor(() => expect(shellHasKeyboardInsetOpenMarker(root)).toBe(false));

    const target = insetWhileOpen - SLACK;
    // settle recompute()가 target을 향해 애니메이션을 시작해, 아직 도착하지 않은
    // 중간값에 도달할 때까지 기다린다. 위 인터럽트 테스트와 같은 이유로 넉넉한
    // timeout을 명시한다(범위 단언은 그대로 유지 — 느슨해지는 건 대기 시간뿐이다).
    await waitFor(() => {
      const now = parseFloat(keyboardInsetOf(root));
      expect(now).toBeLessThan(insetWhileOpen);
      expect(now).toBeGreaterThan(target);
    }, { timeout: 3000 });

    // 이 시점에 clientHeight가(예: 주소창처럼 키보드와 무관한 이유로) C1과 같은 폭(130)
    // 만큼 잠깐 부풀어 오른다 — scroll/settle 이벤트를 동반하지 않는다.
    scrollRoot.setClientHeight(CLIENT_HEIGHT_TRUE + 130);

    // target 자체는 흔들리지 않고 정확히 처음 계산된 값으로 안정된다 — clientHeight가
    // 흔들렸다는 이유만으로 recompute()가 다시 불려 더 작은(또는 다른) 값으로
    // 재계산되지 않았다는 뜻이다.
    await waitFor(() => expect(parseFloat(keyboardInsetOf(root))).toBe(target));

    scrollRoot.setClientHeight(CLIENT_HEIGHT_TRUE);   // 다음 테스트에 영향이 없도록 원상복구
  });
});

/* 🔴 오너 리포트(2026-08-13): "날짜+시각 필드가 왼쪽 필드 높이랑 똑같애야지 —
 * 이런 거 알아서 설정해 두라고 만든 킷인데 데모에서 이런 걸 안 지키면 어떡해?"
 *
 * `FieldGrid`의 칸들은 같은 행이라 높이가 이미 같습니다(그리드 항목의 기본 `stretch`).
 * 어긋난 것은 **칸 안**입니다 — 라벨 글이 길어 두세 줄이 되면 남는 높이가 컨트롤 **아래**로
 * 가서, 옆 칸과 입력 상자의 세로 위치가 달라집니다. `LAYOUT-PRINCIPLES`가 "줄 끝이 안
 * 맞는다"로 부르는 그 증상이고, **킷이 해 줘야 하는 일**입니다.
 *
 * ⚠️ 픽셀 정렬은 레이아웃이라 jsdom이 못 봅니다 — 여기서는 **그 규칙이 선언돼 있는지**만
 * 봅니다. 실제로 맞는지는 실제 브라우저 실측이 근거이고 PR 본문에 있습니다. */
describe("라벨은 컨트롤을 칸 바닥에 맞춘다 (오너 리포트)", () => {
  it("남는 높이가 글과 컨트롤 사이로 간다", () => {
    expect(controlsCssSource).toContain("label { display: grid; gap: 6px; align-content: space-between;");
  });
});

/* ── 관찰과 타이머의 뒷정리 ─────────────────────────────────────────────────
 *
 * 🔴 **이 파일의 검사가 이 훅을 아주 촘촘히 재는데도 뒷정리는 뚫려 있었습니다**
 * (2026-08-19 실측). `keyboardCompensation.ts`의 정리 동사 **열 중 일곱**이 0 red였고,
 * 아래 셋이 그중 관찰점이 분명한 것들입니다.
 *
 * 위쪽 검사들은 *"키보드가 열렸을 때 무엇이 일어나는가"* 를 재고, 이 셋은 **"안 쓰게
 * 된 뒤에 아무 일도 안 일어나는가"** 를 잽니다 — 축이 다릅니다. 남은 관찰과 타이머는
 * 화면에 한동안 안 보이다가, 필드를 여러 번 옮겨 다닌 뒤 **엉뚱한 요소 크기에 반응해**
 * 스크롤이 튀는 모습으로 나옵니다.
 */
describe("AppShell: 안 쓰게 된 관찰과 타이머는 남지 않는다", () => {
  function TwoFields() {
    return <AppShell sidebar={<div />}>
      <textarea aria-label="메모" />
      <textarea aria-label="비고" />
    </AppShell>;
  }

  /* ⚠️ **`AppShell` 자신도 workspace(`main`)를 관찰합니다**(AppShell.tsx:97) — 다른 관찰자,
   * 다른 콜백입니다. 그래서 **포커스 대상 관찰만** 골라 봅니다. 전부 세면 이 검사가
   * 남의 관찰까지 재게 되고, 실제로 처음에 그래서 빨갰습니다. */
  const focusObservations = () => fakeResizeObserverEntries.map((entry) => entry.target).filter((target) => target.tagName === "TEXTAREA");

  /* 초점이 옮겨 가면 **옛 대상 관찰을 끊어야** 합니다. 안 끊으면 관찰이 쌓여, 더는
   * 보고 있지 않은 필드의 크기 변화가 계속 재조준을 부릅니다(자동 확장 textarea가
   * 여럿인 화면에서 실제로 일어납니다). */
  it("초점이 옮겨 가면 옛 필드 관찰이 남지 않는다", async () => {
    installFakeResizeObserver();
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<TwoFields />);
    const first = screen.getByLabelText("메모");
    const second = screen.getByLabelText("비고");
    stubRectBottom(first, 50);
    stubRectBottom(second, 50);

    first.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    await waitFor(() => expect(focusObservations()).toEqual([first]));   // 전제 — 첫 필드를 실제로 관찰 중

    second.focus();
    await waitFor(() => expect(focusObservations()).toEqual([second]));
  });

  /* 키보드가 닫히면 그 효과의 정리가 돌며 관찰을 끊습니다. 안 끊으면 **키보드가 닫힌
   * 뒤에도** 필드 크기 변화가 재조준을 부릅니다. */
  it("키보드가 닫히면 관찰이 남지 않는다", async () => {
    installFakeResizeObserver();
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 50);

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    await waitFor(() => expect(focusObservations()).toEqual([textarea]));   // 전제

    viewport.closeKeyboard();
    await waitFor(() => expect(focusObservations()).toEqual([]));
  });

  /* `focusin`은 뷰포트가 정착할 때까지 기다렸다 재조준합니다. 그 타이머가 예약된 채
   * 언마운트되면 **죽은 훅이 스크롤을 옮깁니다** — 사용자에게는 화면을 떠난 뒤 스크롤이
   * 한 번 튀는 모습입니다. */
  /* 🔴 **키보드가 닫힐 때 예약된 재조준이 남으면 안 됩니다** — focusin 창구의
   * `clearTimeout(focusSettleTimer)`. 배터리가 0 red로 보고했고, 아래 언마운트 검사가
   * 그 줄을 못 죽이는 이유는 **환경**이었습니다(언마운트 뒤 `document.activeElement`가
   * `body`로 떨어지는데 jsdom에서 `body`의 rect는 전부 0 → `reposition`이 돌아도
   * "움직일 필요 없음"). 그 자리는 그대로 두고, **다른 경로**로 잡습니다.
   *
   * 🟢 **이 이펙트의 의존성은 `[keyboard.open, scrollRootId]`입니다** — 그러니 정리가
   * 실제로 도는 계기는 언마운트 말고 **키보드가 닫힐 때**입니다. 그 경로에서는 초점이
   * 여전히 `#root` 안의 필드에 있으므로 `reposition`의 `contains` 가드를 통과하고,
   * 그 자리의 rect는 이 파일이 이미 스텁으로 쥐고 있습니다 — 환경이 안 가립니다.
   *
   * 무엇이 잘못되는가: 닫힌 **뒤에** 재조준이 돌면 `visibleBottom`이 이미 전체 높이라
   * 킷이 요청한 적 없는 스크롤이 일어납니다(§16.2). 게다가 §9 때문에 닫을 때
   * 되돌리지 않으므로 그 초과분은 **영구히** 남습니다 — 열고 닫을 때마다 페이지가
   * 조금씩 밀립니다. owner 실기기 트레이스가 잡았던 그 증상과 같은 모양입니다.
   *
   * 시간은 가짜 타이머로 잡습니다 — 80ms 창구와 벽시계가 경합하지 않습니다. */
  it("키보드가 닫히면 focusin이 예약해 둔 재조준이 스크롤을 못 옮긴다", () => {
    vi.useFakeTimers();
    installReducedMotionPreference();   // 애니메이션을 걷어내 관측을 프레임에서 떼어냅니다
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 900);   // 한참 아래 — 재조준이 돌면 스크롤이 반드시 움직입니다
    root.scrollTop = 0;

    act(() => { textarea.focus(); viewport.openKeyboard(350); });
    act(() => { vi.advanceTimersByTime(200); });
    const settled = root.scrollTop;
    expect(settled).toBeGreaterThan(0);   // 전제 — 살아 있을 때는 실제로 옮깁니다

    // 기하를 더 아래로 옮겨 둡니다 — 예약된 재조준이 살아 있으면 반드시 한 번 더
    // 움직일 상태입니다.
    stubRectBottom(textarea, 1500);
    act(() => { textarea.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });

    // 정착 창구(KEYBOARD_VIEWPORT_SETTLE_MS = 80ms)가 지나기 **전에** 닫습니다.
    act(() => { viewport.closeKeyboard(); });
    act(() => { vi.advanceTimersByTime(300); });

    expect(root.scrollTop).toBe(settled);
  });
  /* 📌 **같은 창구의 디바운스(`repositionAfterViewportSettles` 안의 `clearTimeout`)는
   * 아직 0 red이고, 지금은 그게 맞습니다**(2026-08-19 실측).
   *
   * 그 줄을 지우면 focusin 둘에 타이머가 둘 생깁니다. 그런데 `reposition`은 부를 때마다
   * **살아 있는 지오메트리를 다시 읽으므로**(rect도 viewport도) 두 번째 실행이 첫 번째를
   * 스스로 바로잡습니다 — 영구히 남는 차이가 없습니다. 디바운스의 값은 *"팬이 도는
   * 도중에 재지 않는다"* 라는 **한때의** 성질이지 최종 상태가 아닙니다.
   *
   * ⚠️ **억지로 갈리게 만들 수는 있습니다 — 그러면 스텁을 재게 됩니다.** `stubRectBottom`은
   * scrollTop과 무관하게 같은 rect를 돌려주므로 두 번째 실행이 같은 overshoot를 또
   * 더합니다(이중 적용). 실제 브라우저에서는 첫 스크롤로 rect가 그만큼 올라가 두 번째가
   * 0을 냅니다. 그런 검사는 킷이 아니라 픽스처를 지킵니다 —
   * `stubRectBottomFollowingScroll`이 이 파일에 따로 있는 이유가 그것입니다.
   *
   * 🔜 **다시 봐야 하는 날:** `reposition`이 지오메트리를 캐시하기 시작하면 자기교정이
   * 사라지고 이 자리는 진짜 구멍이 됩니다. 그때는 위 검사와 같은 방식(가짜 타이머로
   * 창구를 쥐고, 두 focusin 사이에 팬을 끼워 넣기)으로 세울 수 있습니다. */
  it("언마운트 뒤에는 예약된 재조준이 스크롤을 못 옮긴다", async () => {
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 900);   // 한참 아래 — 재조준이 돌면 스크롤이 반드시 움직입니다
    root.scrollTop = 0;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBeGreaterThan(0));   // 전제 — 살아 있을 때는 실제로 옮깁니다

    const settled = root.scrollTop;

    /* 📌 **이 검사는 계약을 지키지만 `clearTimeout` 한 줄을 죽이지는 못합니다**(2026-08-19
     * 실측). 재서 알아낸 이유: 언마운트 뒤 `document.activeElement`가 `body`로 떨어지는데
     * **jsdom에서 `body`의 rect는 전부 0**이라, 타이머가 살아 있어 `reposition`이 돌아도
     * 계산 결과가 "움직일 필요 없음"입니다. `reposition` 안의 `contains` 가드를 지우는
     * 변이도 같은 이유로 0 red입니다 — **환경이 그 경로를 통째로 안 보이게** 합니다.
     *
     * 그래도 남깁니다: 실제 브라우저에서는 그 rect가 0이 아니고, 이 검사는 **사용자가 겪는
     * 계약**(화면을 떠난 뒤 스크롤이 튀지 않는다)을 이름으로 말합니다. 억지로 갈리게
     * 만들려고 바깥 요소에 초점을 옮기는 픽스처를 세우면, 그건 실제로 일어나는 일과
     * 멀어집니다. 아래 한 줄은 기하를 더 아래로 옮겨 두는 것이고, 살아 있는 훅이었다면
     * 반드시 한 번 더 움직였을 상태를 만듭니다. */
    stubRectBottom(textarea, 1500);
    textarea.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));   // 정착 타이머를 예약합니다
    cleanup();                     // 그 타이머가 살아 있는 채로 언마운트
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(root.scrollTop).toBe(settled);
  });
});

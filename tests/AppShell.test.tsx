// @vitest-environment jsdom
//
// 가상 키보드가 열리면(useVirtualKeyboard) 포커스된 필드가 그 뒤로 가려지지 않게
// AppShell이 스크롤 호스트(#root)를 옮기는지, 닫히면 원래 자리로 돌아가는지 확인한다.
// bug-keyboard-shift.md가 실측한 근본 원인: #root는 height:100dvh로 고정돼 키보드가
// 열려도 clientHeight가 줄지 않고(안드로이드 기본 resizes-visual, index.html에
// interactive-widget 지정 없음), scroll-padding-bottom:40dvh(tokens.css)는 실제
// 키보드 높이와 무관한 상수라 scrollIntoView에 맡기면 우연히만 맞는다 — 그래서
// visualViewport로 가려진 만큼을 직접 계산해 scrollTop에 더한다(Select.tsx의
// scrollSelectedOptionIntoView와 같은 방식). jsdom은 Element.scrollIntoView를
// 구현하지 않으므로(tests/Select.test.tsx:228) 이 방식이라야 단위 테스트가 성립한다.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { AppShell } from "../src/AppShell";

afterEach(() => {
  cleanup();
  delete (window as { visualViewport?: unknown }).visualViewport;
  delete (window as { matchMedia?: unknown }).matchMedia;
  delete (window as { ResizeObserver?: unknown }).ResizeObserver;
  fakeResizeObserverEntries.length = 0;
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

/** jsdom은 getBoundingClientRect를 항상 0으로 주므로, bug-keyboard-shift.md가 실측한
 * 좌표를 재현하려면 직접 덮어써야 한다. */
function stubRectBottom(element: HTMLElement, bottom: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top: bottom - 79, left: 0, right: 320, bottom, width: 320, height: 79, x: 0, y: bottom - 79, toJSON() {} }),
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
 * 가짜가 필요하다. installFakeVisualViewport와 같은 자리의 헬퍼다. */
type FakeResizeObserverEntry = { target: Element; callback: ResizeObserverCallback };
const fakeResizeObserverEntries: FakeResizeObserverEntry[] = [];

function installFakeResizeObserver() {
  class FakeResizeObserver {
    private callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) { this.callback = callback; }
    observe(target: Element) { fakeResizeObserverEntries.push({ target, callback: this.callback }); }
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
function installClampingScrollRoot(root: HTMLElement, baseContentHeight: number, clientHeight: number) {
  Object.defineProperty(root, "clientHeight", { configurable: true, get: () => clientHeight });
  function currentInset(): number {
    const shell = root.querySelector(".app-shell") as HTMLElement | null;
    return parseFloat(shell?.style.getPropertyValue("--keyboard-inset") || "0") || 0;
  }
  function currentMax(): number {
    return Math.max(0, baseContentHeight + currentInset() - clientHeight);
  }
  Object.defineProperty(root, "scrollHeight", { configurable: true, get: () => baseContentHeight + currentInset() });
  let raw = 0;
  Object.defineProperty(root, "scrollTop", {
    configurable: true,
    get() { return Math.min(raw, currentMax()); },
    set(next: number) { raw = Math.min(next, currentMax()); },
  });
  return { currentMax };
}

function Page() {
  return <AppShell sidebar={<div />}>
    <textarea aria-label="메모" />
  </AppShell>;
}

describe("AppShell: 가상 키보드가 열리면 포커스된 필드가 가려지지 않는다", () => {
  it("필드 아래쪽이 키보드에 가려지면 그만큼(+여유 8px) 스크롤 호스트를 올린다", async () => {
    // bug-keyboard-shift.md 실측(Experiment B): scrollTop 1046, rect.bottom 507,
    // 844 -> 494로 줄면 보정 없이는 507이 494보다 13px 아래로(가려짐) 남는다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);   // 844 -> 494

    // overshoot = rect.bottom(507) - visibleBottom(494) + gap(8) = 21
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));
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
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));   // 패딩은 원래대로 줄어든다
    expect(root.scrollTop).toBe(1046 + 21);   // 그래도 스크롤 위치는 그대로 — 되돌리지 않는다
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
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));

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
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));   // 1067

    root.scrollTop += 2;   // 옛 문턱(18px) 안쪽의 흔들림 — 예전이라면 "사용자 스크롤 아님"으로 봤다

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1067 + 2);   // 1046이 아니다 — 되돌리는 코드가 아예 없다
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
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));   // 1067

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1067);   // 첫 닫기 — 그대로 둔다

    // 같은 필드가 여전히 같은 자리(rect.bottom 507)에 있고 키보드가 다시 350px을
    // 가린다 — overshoot 계산은 지금 scrollTop(1067) 위에 다시 21을 더해야 한다.
    // 그 결과가 1046 기준(1046+21=1067, 즉 변화 없음)으로 나오면 삭제된 ref의
    // "원래 자리"가 어딘가에 여전히 살아 있다는 뜻이다.
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1067 + 21));
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
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));   // 1067, 첫째 기준

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1067);   // 되돌리지 않았다

    second.focus();
    viewport.openKeyboard(350);
    // overshoot = 450 - 494 + 8 = -36 → 이미 보이므로 스크롤하지 않는다.
    // 첫째의 되돌리기 값(1046)이나 흔적이 끼어들지 않고 지금 scrollTop(1067)이 그대로 유지된다.
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    expect(root.scrollTop).toBe(1067);
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
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));   // 첫째 기준 보정

    // 키보드가 열린 채로(탭 이동 등) 둘째로 포커스가 옮겨간다 — focusin 리스너가 다시 맞춰야 한다.
    second.focus();
    // overshoot = 600 - 494 + 8 = 114, 지금 scrollTop(1067) 기준으로 더한다.
    await waitFor(() => expect(root.scrollTop).toBe(1067 + 114));
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
    viewport.openKeyboard(350);   // overshoot = 507 - 494 + 8 = 21

    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));
    expect(writes.length).toBeGreaterThan(1);          // 한 번의 대입이 아니다
    expect(writes[writes.length - 1]).toBe(1046 + 21); // 마지막 프레임은 정확히 목표치
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

    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));
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
    viewport.openKeyboard(350);   // 목표 1046+21=1067

    // 애니메이션이 목표에 닿기 전, 중간값에 도달할 때까지 기다린다.
    await waitFor(() => {
      expect(root.scrollTop).toBeGreaterThan(1046);
      expect(root.scrollTop).toBeLessThan(1067);
    });
    const interruptFrom = root.scrollTop;   // 지금 진행 중이던 값 (아직 목표 아님)

    second.focus();   // focusin 리스너가 동기적으로 다시 reposition()을 부른다

    // 둘째 기준 overshoot = 600 - 494 + 8 = 114, 지금 값(interruptFrom) 위에 쌓인다.
    await waitFor(() => expect(root.scrollTop).toBe(interruptFrom + 114));
    // 가로챈 뒤로는 그 어떤 프레임도 가로챈 시점(interruptFrom)보다 아래로 되돌아가지
    // 않는다 — 되돌아간다면 논리적 목표가 아니라 "맨 처음" 값에서 다시 시작했다는 뜻.
    const afterInterrupt = writes.slice(writes.indexOf(interruptFrom) + 1);
    for (const value of afterInterrupt) expect(value).toBeGreaterThanOrEqual(interruptFrom - 0.01);
  });

  it("안드로이드 다단계 리사이즈처럼 keyboard.inset이 열린 채로 여러 번 바뀌어도 매번 처음부터 다시 끊기지 않고 지금 값에서 새 목표로 이어간다", async () => {
    // 안드로이드는 키보드가 한 번에 최종 높이로 열리지 않고 여러 단계로 리사이즈될 수
    // 있다 — 그때마다 keyboard.inset이 바뀐다(hooks.ts의 useVirtualKeyboard). 두 단계
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
    viewport.openKeyboard(200);   // 1단계: 844 -> 644, overshoot = 700-644+8 = 64, 목표 1110

    // 1단계 애니메이션이 목표에 닿기 전, 중간값에 도달할 때까지 기다린다.
    await waitFor(() => {
      expect(root.scrollTop).toBeGreaterThan(1046);
      expect(root.scrollTop).toBeLessThan(1110);
    });
    const midStage1 = root.scrollTop;

    viewport.openKeyboard(350);   // 2단계(최종): 844 -> 494, overshoot = 700-494+8 = 214, 목표 1260

    await waitFor(() => expect(root.scrollTop).toBe(1046 + 214));
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

    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));
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

    // 사용자가 여러 줄을 입력해 textarea가 자라난다(AutoGrowTextarea.resize()와 같은 일) —
    // rect.bottom이 visibleBottom 아래로 내려간다. 이 변화 자체는 리사이즈도 focusin도
    // 아니므로, ResizeObserver 콜백으로만 알 수 있다.
    bottom = 560;
    fireResizeObserved(textarea);

    // overshoot = 560 - 494 + 8 = 74
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 74));
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
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1046 + 21);   // 되돌리지 않는다(기존 계약) — 그저 즉시 0으로.
  });
});

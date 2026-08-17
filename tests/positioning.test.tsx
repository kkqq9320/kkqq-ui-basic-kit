// @vitest-environment jsdom

/* `src/positioning.ts` — 이 파일은 배럴로 **공개 API**가 다섯 개 나가는데
 * 테스트가 하나도 없었습니다. 순수 숫자 함수라 가장 검증하기 쉬운 자리인데도 그랬고,
 * 계획서가 실측한 바 `above > below`를 `>=`로, `preventScroll: true`를 평범한 `.focus()`로,
 * `- bottomInset`을 통째로 지워도 전 스위트가 초록이었습니다.
 *
 * ⚠️ **여기서 새는 것이 실제로 두 번 샜습니다.** PR #7(날짜 팝오버)과 #9(Select 포털 메뉴)는
 * **같은 헬퍼를 쓰는 두 컴포넌트가 같은 줄에서 같이 틀린** 것이었고, 543개 스위트가 아무것도
 * 잡지 못했습니다. 배치 산수를 소비자 쪽에서만 간접적으로 건드리면 이런 것이 지나갑니다.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Select } from "../src";
import { captureScrollSnapshot, dropdownViewportSpace, onViewportChange, restoreFocusWithoutScroll, shouldOpenDropdownAbove } from "../src/browser/positioning";

const realScrollingElement = Object.getOwnPropertyDescriptor(Document.prototype, "scrollingElement");

afterEach(() => {
  cleanup();
  delete (window as { visualViewport?: unknown }).visualViewport;
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
  // `document.scrollingElement`를 심은 테스트가 있으므로 원래 접근자를 되돌립니다.
  // 심은 값을 그냥 두면 다음 테스트가 남의 요소를 스크롤 루트로 봅니다.
  delete (document as unknown as Record<string, unknown>).scrollingElement;
  if (realScrollingElement) Object.defineProperty(Document.prototype, "scrollingElement", realScrollingElement);
  // ⚠️ `document.body` 안만 지웁니다. 한때 `getElementById("root")?.remove()`라고 썼는데,
  // scrollingElement 실험이 `<html>`에 id를 달면 **문서 루트를 지웁니다.**
  document.body.replaceChildren();
});

type FakeViewport = EventTarget & { offsetTop: number; offsetLeft: number; width: number; height: number };

/** `tests/Dialog.test.tsx`의 것과 같은 흉내입니다 — 가상 키보드가 보이는 영역을 줄이거나
 *  핀치줌 팬으로 offset만 바뀌는 상황을 만듭니다. */
function installFakeVisualViewport({ height = window.innerHeight, offsetTop = 0, offsetLeft = 0, width = window.innerWidth } = {}) {
  const target = new EventTarget() as FakeViewport;
  target.offsetTop = offsetTop;
  target.offsetLeft = offsetLeft;
  target.width = width;
  target.height = height;
  Object.defineProperty(window, "visualViewport", { configurable: true, value: target });
  return target;
}

/** jsdom은 rect를 항상 0으로 주므로 심습니다 — 이 저장소가 이미 쓰는 방법. */
function triggerAt(top: number, height = 40) {
  const element = document.createElement("button");
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top, bottom: top + height, left: 20, right: 220, width: 200, height, x: 20, y: top, toJSON: () => ({}) }),
  });
  document.body.appendChild(element);
  return element;
}

function setInnerHeight(height: number) {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

describe("dropdownViewportSpace", () => {
  // 위 = 트리거 top − 뷰포트 top − edge(8). 아래 = 뷰포트 바닥 − bottomInset − 트리거 bottom.
  // 뮤테이션: `- edge`를 지우면 108, `- bottomInset`을 지우면 322.
  it("위와 아래 여유를 edge와 bottomInset을 빼고 잰다", () => {
    setInnerHeight(600);
    const space = dropdownViewportSpace(triggerAt(116), 70);

    expect({ above: space.above, below: space.below, edge: space.edge }).toEqual({ above: 108, below: 374, edge: 8 });
  });

  // `bottomInset`의 기본값이 8이라는 것. 위 테스트가 70을 넘기므로 기본값은 미도달이었다.
  it("bottomInset의 기본값은 8이다", () => {
    setInnerHeight(600);

    expect(dropdownViewportSpace(triggerAt(116)).below).toBe(436);
  });

  // **0 클램프.** 트리거가 하단 바 자리보다 아래에 있으면 진짜 아래 공간은 음수인데
  // `Math.max(0, …)`가 0으로 자른다. 이 클램프 자체가 PR 이전 라운드에서 "덜 움직이는"
  // 결함의 원인이었고(`DateWheelPicker`의 `trueBelow` 주석), 여기서 **동작을 고정만** 한다.
  // 뮤테이션: `Math.max(0, …)`를 지우면 -22.
  it("아래 공간이 음수면 0으로 자른다", () => {
    setInnerHeight(600);

    expect(dropdownViewportSpace(triggerAt(552), 70).below).toBe(0);
  });

  // 같은 클램프가 위쪽에도 있다 — 트리거가 뷰포트 top보다 위면 음수가 된다.
  it("위 공간이 음수면 0으로 자른다", () => {
    setInnerHeight(600);

    expect(dropdownViewportSpace(triggerAt(2)).above).toBe(0);
  });

  // **visualViewport가 있으면 그쪽을 읽는다.** 핀치줌·가상 키보드에서 `window.innerHeight`는
  // 안 변하고 `visualViewport.height`/`offsetTop`만 변한다. 뮤테이션: 폴백만 남기면
  // above 292 / below 452(= innerHeight 800 기준)가 되어 둘 다 빨개진다.
  it("visualViewport가 있으면 그 offsetTop과 height로 잰다", () => {
    setInnerHeight(800);
    installFakeVisualViewport({ height: 400, offsetTop: 100 });
    const space = dropdownViewportSpace(triggerAt(300), 20);

    expect({ above: space.above, below: space.below }).toEqual({ above: 192, below: 140 });
  });

  // 폴백 — visualViewport가 없는 환경(데스크톱 사파리 구버전, jsdom)에서 innerHeight를 쓴다.
  it("visualViewport가 없으면 window.innerHeight로 폴백한다", () => {
    setInnerHeight(500);

    expect(dropdownViewportSpace(triggerAt(100), 20).below).toBe(340);
  });

  it("잰 rect를 그대로 함께 돌려준다", () => {
    expect(dropdownViewportSpace(triggerAt(150)).rect.top).toBe(150);
  });
});

describe("shouldOpenDropdownAbove", () => {
  // 아래가 모자라고 위가 더 넓다 — 뒤집는다.
  it("아래가 원하는 높이보다 좁고 위가 더 넓으면 뒤집는다", () => {
    setInnerHeight(600);

    expect(shouldOpenDropdownAbove(triggerAt(400), 300)).toBe(true);
  });

  // 아래가 충분하면 위가 아무리 넓어도 안 뒤집는다.
  it("아래가 충분하면 위가 더 넓어도 뒤집지 않는다", () => {
    setInnerHeight(900);

    expect(shouldOpenDropdownAbove(triggerAt(400), 300)).toBe(false);
  });

  // ⚠️ **동점 분기.** `above > below`를 `>=`로 바꾸면 이 케이스만 뒤집힌다 — 계획서가
  // "지금은 이걸 바꿔도 전 스위트가 초록"이라고 지목한 바로 그 자리다.
  // 트리거 top 300·높이 40, 뷰포트 648, inset 8 → above = 292, below = 648 - 8 - 340 = 300.
  // 동점을 만들려면 above == below여야 하므로 뷰포트를 656으로: below = 656-8-340 = 308.
  // 실제로 맞추기 쉬운 쪽은 아래를 고정하고 위를 맞추는 것이라, 아래 값을 직접 계산해 쓴다.
  it("위와 아래가 정확히 같으면 뒤집지 않는다", () => {
    setInnerHeight(640);
    // top 300, bottom 340 → above = 292, below = 640 - 8 - 340 = 292. 동점.
    const space = dropdownViewportSpace(triggerAt(300));
    expect(space.above).toBe(space.below);   // 동점을 만들었는지부터 확인 — 아니면 아래가 무의미하다

    expect(shouldOpenDropdownAbove(triggerAt(300), 400)).toBe(false);
  });
});

describe("captureScrollSnapshot / restoreFocusWithoutScroll", () => {
  function makeRoot() {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
    return root;
  }

  it("#root와 scrollingElement의 스크롤 위치를 찍는다", () => {
    const root = makeRoot();
    root.scrollTop = 120;
    root.scrollLeft = 30;

    const snapshot = captureScrollSnapshot();

    expect(snapshot.find((entry) => entry.element === root)).toEqual({ element: root, top: 120, left: 30 });
  });

  // 같은 요소가 둘 다에 해당하면 한 번만 담는다(`new Set`).
  // 뮤테이션: `[...new Set(elements)]`에서 Set을 빼면 2가 된다.
  //
  // ⚠️ **`document.scrollingElement`를 심어야 도달합니다.** 이 jsdom에서는 그 값이
  // `undefined`라(실측 — `null`도 아닙니다) 아무것도 안 심으면 후보가 `#root` 하나뿐이라
  // 중복 자체가 생기지 않고, 이 테스트는 Set을 지워도 통과하는 **공허한 1**이 됩니다.
  // 그래서 둘이 **같은 객체**가 되도록 만들어 놓고 셉니다.
  it("#root가 곧 scrollingElement이면 한 번만 담는다", () => {
    const root = makeRoot();
    Object.defineProperty(document, "scrollingElement", { configurable: true, value: root });

    expect(captureScrollSnapshot()).toEqual([{ element: root, top: 0, left: 0 }]);
  });

  // 대조군 — 서로 다른 요소이면 둘 다 담긴다. 위 테스트만 있으면 "항상 1개"라는 틀린
  // 구현(둘째를 아예 안 담는 것)도 통과합니다.
  it("#root와 scrollingElement가 다르면 둘 다 담는다", () => {
    const root = makeRoot();
    const other = document.createElement("div");
    document.body.appendChild(other);
    Object.defineProperty(document, "scrollingElement", { configurable: true, value: other });

    expect(captureScrollSnapshot().map((entry) => entry.element)).toEqual([root, other]);

    other.remove();
  });

  // `#root`가 없는 소비자(킷은 `#root`를 계약으로 못박지만 헬퍼 자신은 견뎌야 한다).
  // 뮤테이션: `.filter(Boolean)` 계열 가드를 빼면 null이 담겨 `restore`가 터진다.
  it("#root가 없으면 그 자리를 걸러낸다", () => {
    expect(captureScrollSnapshot().every((entry) => entry.element)).toBe(true);
  });

  it("이름을 바꿔 부른 스크롤 루트도 찾는다", () => {
    const host = document.createElement("div");
    host.id = "app-shell";
    document.body.appendChild(host);
    host.scrollTop = 44;

    expect(captureScrollSnapshot("app-shell").some((entry) => entry.element === host && entry.top === 44)).toBe(true);

    host.remove();
  });

  // ⚠️ **`preventScroll: true`가 계약이다.** 계획서가 "평범한 `.focus()`로 바꿔도 전
  // 스위트가 초록"이라고 지목한 자리. 인자까지 단정하지 않으면 그 뮤테이션을 못 잡는다.
  it("포커스를 되돌릴 때 preventScroll을 함께 넘긴다", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    const focus = vi.spyOn(button, "focus");

    restoreFocusWithoutScroll(button, []);

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("찍어둔 스크롤 위치를 되돌린다", () => {
    const root = makeRoot();
    root.scrollTop = 200;
    const snapshot = captureScrollSnapshot();
    root.scrollTop = 0;

    restoreFocusWithoutScroll(null, snapshot);

    expect(root.scrollTop).toBe(200);
  });

  it("되돌릴 요소가 null이어도 스크롤 복원은 계속한다", () => {
    const root = makeRoot();
    root.scrollTop = 90;
    const snapshot = captureScrollSnapshot();
    root.scrollTop = 0;

    expect(() => restoreFocusWithoutScroll(null, snapshot)).not.toThrow();
    expect(root.scrollTop).toBe(90);
  });
});

describe("onViewportChange", () => {
  it("window resize에서 부른다", () => {
    const handler = vi.fn();
    const stop = onViewportChange(handler);

    fireEvent(window, new Event("resize"));

    expect(handler).toHaveBeenCalledTimes(1);
    stop();
  });

  // capture 단계로 등록해야 **안쪽 스크롤 컨테이너**의 스크롤도 잡는다. scroll은 버블하지
  // 않으므로 capture가 아니면 document에서 안 보인다.
  // 뮤테이션: `true`를 빼면 이 테스트만 빨개진다.
  it("안쪽 컨테이너의 scroll도 capture로 잡는다", () => {
    const inner = document.createElement("div");
    document.body.appendChild(inner);
    const handler = vi.fn();
    const stop = onViewportChange(handler);

    fireEvent.scroll(inner);

    expect(handler).toHaveBeenCalledTimes(1);
    stop();
    inner.remove();
  });

  it("visualViewport resize에서 부른다", () => {
    const viewport = installFakeVisualViewport();
    const handler = vi.fn();
    const stop = onViewportChange(handler);

    viewport.dispatchEvent(new Event("resize"));

    expect(handler).toHaveBeenCalledTimes(1);
    stop();
  });

  // ⚠️ **이것이 §3의 누락분이다.** 두 컴포넌트가 각각 세 줄만 등록했고 이 하나가 빠져 있었다.
  // `document.addEventListener("scroll", …, true)`는 DOM 트리의 스크롤만 잡고
  // `VisualViewport` 객체의 이벤트는 못 잡는다 — 핀치줌 상태로 패닝하면 `offsetTop`만
  // 바뀌고 resize도 document scroll도 안 나서 좌표가 통째로 낡는다.
  // 저장소 안에 이미 정답이 있었다: `src/visualViewport.ts`의 `useVisualViewportBox`가 resize와
  // scroll을 둘 다 등록하고 `:523`에 이유까지 적어 뒀다.
  it("visualViewport scroll에서 부른다 — 핀치줌 팬의 유일한 신호다", () => {
    const viewport = installFakeVisualViewport();
    const handler = vi.fn();
    const stop = onViewportChange(handler);

    viewport.dispatchEvent(new Event("scroll"));

    expect(handler).toHaveBeenCalledTimes(1);
    stop();
  });

  it("visualViewport가 없는 환경에서도 등록·해제가 터지지 않는다", () => {
    const handler = vi.fn();

    expect(() => onViewportChange(handler)()).not.toThrow();
  });

  it("해제하면 넷 다 더는 부르지 않는다", () => {
    const viewport = installFakeVisualViewport();
    const inner = document.createElement("div");
    document.body.appendChild(inner);
    const handler = vi.fn();

    onViewportChange(handler)();

    fireEvent(window, new Event("resize"));
    fireEvent.scroll(inner);
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));

    expect(handler).not.toHaveBeenCalled();
    inner.remove();
  });

  // **해제는 등록했던 그 viewport 객체에서 뗀다.** 등록 뒤에 `window.visualViewport`가
  // 갈리면(테스트 하니스가 실제로 그렇게 하고, 실브라우저에서도 문서 간 이동에서 일어난다)
  // `window.visualViewport`를 해제 시점에 다시 읽는 구현은 **옛 객체에 리스너를 남깁니다.**
  // 뮤테이션: 클로저에 담은 참조 대신 해제 시점에 `window.visualViewport`를 읽게 하면 빨개진다.
  it("등록 뒤 window.visualViewport가 갈려도 원래 객체에서 뗀다", () => {
    const first = installFakeVisualViewport();
    const handler = vi.fn();
    const stop = onViewportChange(handler);

    installFakeVisualViewport();   // 다른 객체로 교체
    stop();
    first.dispatchEvent(new Event("scroll"));

    expect(handler).not.toHaveBeenCalled();
  });
});

// 헬퍼가 실제로 컴포넌트에 연결됐는지 — 순수 함수 테스트만으로는 두 컴포넌트가 계속
// 세 줄만 등록하고 있어도 초록입니다. 계획서의 수용 기준 그 자체입니다.
describe("소비 컴포넌트가 visualViewport scroll에 반응한다", () => {
  const OPTIONS = [
    { value: "a", label: "첫째" },
    { value: "b", label: "둘째" },
  ];

  it("Select 포털 메뉴가 핀치줌 팬(visualViewport scroll)에 좌표를 다시 잡는다", () => {
    const viewport = installFakeVisualViewport({ offsetLeft: 0 });
    render(<Select ariaLabel="항목" value="a" options={OPTIONS} onChange={() => undefined} portal />);
    const trigger = screen.getByRole("button", { name: "항목" });
    Object.defineProperty(trigger, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 100, bottom: 140, left: 20, right: 220, width: 200, height: 40, x: 20, y: 100, toJSON: () => ({}) }),
    });
    fireEvent.click(trigger);
    const menu = document.querySelector<HTMLElement>(".app-select-menu")!;
    const before = menu.style.left;

    viewport.offsetLeft = 60;   // 확대한 채 옆으로 팬 — resize도 document scroll도 없다
    // `fireEvent`는 DOM 요소용이라 VisualViewport에는 못 씁니다. 직접 dispatch하면 React가
    // 상태를 커밋하지 않은 채로 단정에 닿으므로 `act`로 감쌉니다.
    act(() => { viewport.dispatchEvent(new Event("scroll")); });

    expect(menu.style.left).not.toBe(before);
  });
});

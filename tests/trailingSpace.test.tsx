// @vitest-environment jsdom
/// <reference types="vite/client" />

/* **페이지 끝 여백이 스스로 스크롤을 만들지 않는다 — 그러나 내용이 이미 넘치면 남는다.**
 *
 * 오너 요청(2026-08-12): 1번처럼 여백이 남는 화면은 스크롤할 필요가 없어야 하고,
 * 2번처럼 잘리는 화면은 내려가면 3번처럼 끝에 여백이 있어야 한다.
 * **CSS만으로는 배타적입니다** — 여백은 진짜 공간이라 그 자신이 넘침을 만드는 순환이라,
 * 어떤 고정값도 둘을 동시에 만족시키지 못합니다. 그래서 `AppShell`이 **내용만의 높이**를
 * 재서 표식을 붙이고 `css/page.css`가 그 표식으로 갈라집니다.
 *
 * ⚠️ **이 파일이 존재하는 이유는 브라우저에서 볼 수 없는 배선이 있기 때문입니다.**
 * 실제 크롬에서 `resize` 경로는 확인했지만(레이아웃 탭에서 표식이 `free`로 뒤집힘),
 * **탭이 `hidden`이면 크롬이 렌더링 스텝을 안 돌려 ResizeObserver가 한 건도 배달되지
 * 않습니다** — 제 것과 무관한 새 옵저버조차 초기 배달 0건이었습니다. 그래서 "탭을 옮겨
 * 내용 높이가 바뀌면 다시 잰다"를 실브라우저로는 증명하지 못했고, 여기서 덮습니다.
 * 그것을 "안 된다"로 읽으면 이 저장소가 여러 번 밟은 함정이 됩니다.
 *
 * ⚠️ jsdom은 레이아웃이 없으므로 지오메트리는 전부 스텁입니다. 이 파일이 증명하는 것은
 * **판정과 배선**이지 실제 픽셀이 아닙니다. 픽셀은 실제 크롬 실측이 근거입니다.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppShell } from "../src/AppShell";

/* jsdom은 ResizeObserver를 구현하지 않습니다. `tests/AppShell.test.tsx`의 가짜와 같은
 * 자리이고, **초기 배달을 반드시 흉내 냅니다** — 새로 observe()한 대상은 실제로는
 * 반드시 한 번 콜백을 받습니다. 그걸 빼먹으면 "observe만 하고 아무것도 안 하는" 코드가
 * 이 가짜 아래에서 초록으로 통과합니다. */
type Observation = { target: Element; callback: ResizeObserverCallback };
const observations: Observation[] = [];

class FakeResizeObserver {
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) { this.callback = callback; }
  observe(target: Element) {
    if (observations.some((o) => o.target === target && o.callback === this.callback)) return;
    const entry = { target, callback: this.callback };
    observations.push(entry);
    // 초기 배달.
    entry.callback([{ target } as ResizeObserverEntry], {} as ResizeObserver);
  }
  unobserve(target: Element) {
    const at = observations.findIndex((o) => o.target === target && o.callback === this.callback);
    if (at >= 0) observations.splice(at, 1);
  }
  disconnect() {
    for (let i = observations.length - 1; i >= 0; i -= 1) {
      if (observations[i].callback === this.callback) observations.splice(i, 1);
    }
  }
}

/** 관찰 중인 대상 전부에 콜백을 터뜨립니다 — 실제로 크기가 바뀐 순간. */
const fireResize = () => {
  for (const observation of [...observations]) {
    observation.callback([{ target: observation.target } as ResizeObserverEntry], {} as ResizeObserver);
  }
};

/** 문서 지오메트리와 스페이서 크기를 우리가 정합니다. */
let documentHeight = 0;
let viewportHeight = 0;
let spacerHeight = "0px";

const stubGeometry = () => {
  const root = document.documentElement;
  Object.defineProperty(root, "scrollHeight", { configurable: true, get: () => documentHeight });
  Object.defineProperty(root, "clientHeight", { configurable: true, get: () => viewportHeight });

  const real = window.getComputedStyle.bind(window);
  Object.defineProperty(window, "getComputedStyle", {
    configurable: true,
    writable: true,
    value: (element: Element, pseudo?: string | null) =>
      (pseudo === "::after" ? { height: spacerHeight } : real(element, pseudo)) as CSSStyleDeclaration,
  });
};

const renderShell = () => render(<AppShell sidebar={<nav />}><p>내용</p></AppShell>);
const workspace = () => document.querySelector(".workspace") as HTMLElement;

beforeEach(() => {
  observations.length = 0;
  Object.defineProperty(window, "ResizeObserver", { configurable: true, writable: true, value: FakeResizeObserver });
  stubGeometry();
});

afterEach(cleanup);

describe("끝 여백 판정", () => {
  it("내용만으로 이미 창을 넘으면 여백을 고정한다", () => {
    documentHeight = 1749;   // 내용 1669 + 스페이서 80
    viewportHeight = 1270;
    spacerHeight = "80px";

    renderShell();

    expect(workspace().dataset.trailingSpace).toBe("fixed");
  });

  it("내용이 창에 들어가면 남는 자리만 쓰게 둔다", () => {
    // 실제 크롬 실측값입니다 — 레이아웃 탭에서 내용 1257, 창 1270.
    documentHeight = 1337;   // 내용 1257 + 스페이서 80
    viewportHeight = 1270;
    spacerHeight = "80px";

    renderShell();

    expect(workspace().dataset.trailingSpace).toBe("free");
  });

  /* ⚠️ **이 하나가 이 파일의 존재 이유입니다.** 탭 전환처럼 창 크기가 그대로인 채
   * 내용 높이만 바뀌는 경우는 `resize`가 안 옵니다 — ResizeObserver만이 잡습니다.
   * 그리고 그 경로는 숨은 탭에서 실브라우저로 확인할 수 없었습니다. */
  it("창 크기가 그대로여도 내용 높이가 바뀌면 다시 잰다", () => {
    documentHeight = 1749;
    viewportHeight = 1270;
    spacerHeight = "80px";
    renderShell();
    expect(workspace().dataset.trailingSpace).toBe("fixed");

    // 탭을 옮겨 내용이 짧아졌다. 창은 그대로.
    documentHeight = 1337;
    fireResize();

    expect(workspace().dataset.trailingSpace).toBe("free");
  });

  /* **진동하지 않는 근거.** 판정 기준이 문서 높이가 아니라 `문서 − 스페이서`라서,
   * 스페이서가 얼마를 먹든 같은 답이 나옵니다. 같은 내용(1257)을 스페이서만 달리해
   * 두 번 재고 답이 같은지 봅니다 — 다르면 자기 결과가 판정을 뒤집는 구조입니다. */
  it("스페이서가 얼마를 먹든 같은 내용이면 같은 답이 나온다", () => {
    viewportHeight = 1270;
    documentHeight = 1337;   // 내용 1257 + 스페이서 80
    spacerHeight = "80px";
    renderShell();
    expect(workspace().dataset.trailingSpace).toBe("free");

    // 여백이 "남는 자리"로 바뀌어 13px만 먹는 상태. 내용은 여전히 1257.
    documentHeight = 1270;
    spacerHeight = "13px";
    fireResize();

    expect(workspace().dataset.trailingSpace).toBe("free");
  });

  /* 모바일에서는 `css/page.css`가 스페이서를 `content: none`으로 끄고, 그러면
   * 계산된 height가 `auto`로 옵니다. 그걸 NaN인 채로 빼면 판정이 통째로 무너집니다. */
  it("스페이서가 꺼져 있으면(height가 auto) 0으로 친다", () => {
    documentHeight = 1300;
    viewportHeight = 1270;
    spacerHeight = "auto";

    renderShell();

    expect(workspace().dataset.trailingSpace).toBe("fixed");
  });

  it("작업 영역을 실제로 관찰한다", () => {
    documentHeight = 1300;
    viewportHeight = 1270;
    spacerHeight = "0px";

    renderShell();

    expect(observations.map((o) => o.target)).toEqual([workspace()]);
  });
});

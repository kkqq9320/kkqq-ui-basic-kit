// @vitest-environment jsdom

/* **킷의 모든 `<button>`은 `Pressable`을 지나갑니다.**
 *
 * 🔴 **이 파일이 생긴 이유는 잰 값입니다.** 손으로 그린 `<button>`이 25곳 있었고 같은
 * 것을 각자 정하고 있었습니다 — 그중 **넷은 `type`을 아예 안 적고** 있었고(드롭다운
 * 트리거 셋, 휠 트리거 하나) 폼 안에서 `<button>`의 기본값은 `submit`입니다. 값을
 * 고르는 순간 폼이 날아가는 종류입니다.
 *
 * 손으로 붙이는 한 계속 빠집니다. 그래서 자리를 하나로 모았고, **여기가 그 "하나"를
 * 지킵니다** — 새 `<button>`이 생기면 이름을 짚어 실패합니다.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Pressable } from "../src/controls/Pressable";

afterEach(cleanup);

const sources = import.meta.glob("../src/**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** 주석(블록·줄)을 걷어냅니다. 주석 안의 `<button>` 언급은 마크업이 아닙니다 —
 * 실제로 이 구분을 안 해서 이관 스크립트가 두 곳에서 짝을 어긋나게 셌습니다.
 *
 * ⚠️ **줄 끝에 붙은 `//` 도 걷어야 합니다.** 처음엔 줄 머리의 `//` 만 걷었는데
 * `Select.tsx`의 `event.preventDefault();   // 옵션 <button>의 …` 한 줄이 그대로 남아
 * 이 검사가 **거짓 양성**을 냈습니다. `://`(URL)는 남깁니다. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("킷의 모든 button은 Pressable을 지나간다", () => {
  // 전제 — glob이 0건이면 아래가 공허합니다.
  it("소스를 실제로 읽었다", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(15);
    expect(Object.keys(sources).some((path) => path.endsWith("/Pressable.tsx"))).toBe(true);
  });

  /* 예외는 `Pressable` 자신 하나뿐입니다 — 어딘가는 진짜 `<button>`을 그려야 합니다. */
  it("Pressable 말고는 날 <button>을 그리는 파일이 없다", () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith("/Pressable.tsx"))
      .flatMap(([path, source]) => (code(source).includes("<button") ? [path.replace("../src/", "")] : []));
    expect(offenders).toEqual([]);
  });

  it("Pressable은 실제로 <button>을 그린다 — 위 예외가 공허하지 않다", () => {
    const source = Object.entries(sources).find(([path]) => path.endsWith("/Pressable.tsx"))![1];
    expect(code(source)).toContain("<button");
  });
});

describe("Pressable: 보장", () => {
  it("type은 기본이 button이다 — 폼을 보내지 않는다", () => {
    const { container } = render(<Pressable>보통</Pressable>);
    expect((container.firstElementChild as HTMLButtonElement).getAttribute("type")).toBe("button");
  });

  it("정말 제출 버튼이 필요하면 넘길 수 있다", () => {
    const { container } = render(<Pressable type="submit">보내기</Pressable>);
    expect((container.firstElementChild as HTMLButtonElement).getAttribute("type")).toBe("submit");
  });

  /* 🔴 **옷이 없는 것이 계약입니다.** 여기에 클래스를 하나라도 붙이면 킷의 모든 버튼
   * (액션·탭·세그먼트·사이드바·아이콘 다섯 종)에 딸려 갑니다. `Button` 라운드에서
   * 정확히 그 사고를 냈습니다 — base 기하를 공유했더니 글자 버튼이 끌려갔습니다. */
  it("자기 클래스를 붙이지 않는다 — 앱이 준 것만 남는다", () => {
    const { container } = render(<Pressable className="only-mine">보통</Pressable>);
    expect((container.firstElementChild as HTMLElement).className).toBe("only-mine");
  });

  it("클래스를 안 주면 class 속성이 아예 없다", () => {
    const { container } = render(<Pressable>보통</Pressable>);
    expect((container.firstElementChild as HTMLElement).hasAttribute("class")).toBe(false);
  });

  /* `ref`가 아니라 `buttonRef`인 이유는 컴포넌트 주석에 있습니다 — 함수 컴포넌트의
   * `ref`-as-prop은 React 19 전용인데 킷의 peer는 `>=18`입니다. */
  it("buttonRef로 실제 button 노드가 잡힌다", () => {
    let node: HTMLButtonElement | null = null;
    render(<Pressable buttonRef={(element: HTMLButtonElement | null) => { node = element; }}>보통</Pressable>);
    expect(node).toBeInstanceOf(HTMLButtonElement);
  });

  it("나머지 props는 그대로 간다", () => {
    const { container } = render(<Pressable role="tab" aria-selected tabIndex={-1} disabled>탭</Pressable>);
    const button = container.firstElementChild as HTMLButtonElement;
    expect([button.getAttribute("role"), button.getAttribute("aria-selected"), button.tabIndex, button.disabled]).toEqual(["tab", "true", -1, true]);
  });
});

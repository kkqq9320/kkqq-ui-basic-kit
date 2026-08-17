// @vitest-environment jsdom
/// <reference types="vite/client" />

/* `AutoGrowTextarea`의 마감 — 계획서 Phase 2의 남은 둘.
 *
 * **왜 이 둘인가.** `Select`와 `DateWheelPicker`에는 `disabled`가 있는데 이 컨트롤에만
 * 없어서, 폼 전체를 잠그려는 소비자가 **메모 칸 하나만 살아 있는 "반쯤 잠긴 폼"**을
 * 얻습니다. 그리고 `id`가 없으면 `css/controls.css:14`의 `label`과 `htmlFor`로 묶을
 * 방법이 없어, 라벨을 컨트롤 바깥에 두는 배치가 아예 불가능합니다.
 *
 * **대조군이 붙어 있는 이유.** "비활성이다"만 단언하면 **언제나** 비활성인 구현도
 * 통과합니다. "안 넘기면 활성이다"가 그 구멍을 막습니다. `id`도 같습니다.
 * 이 저장소에서 실패할 수 없는 테스트가 일곱 번 나왔습니다.
 *
 * jest-dom은 이 저장소에 없습니다 — `toBeDisabled` 대신 DOM 속성을 직접 봅니다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AutoGrowTextarea } from "../src/controls/AutoGrowTextarea";
import controlsCssSource from "../css/controls.css?raw";
import selectCssSource from "../css/select.css?raw";

afterEach(cleanup);

const field = () => screen.getByLabelText("메모") as HTMLTextAreaElement;

describe("AutoGrowTextarea: disabled", () => {
  it("disabled를 넘기면 textarea가 비활성이다", () => {
    render(<AutoGrowTextarea value="" onChange={() => undefined} ariaLabel="메모" disabled />);
    expect(field().disabled).toBe(true);
  });

  // 대조군 — 이게 없으면 위 단언은 "언제나 disabled"인 구현도 통과시킵니다.
  it("안 넘기면 활성이다", () => {
    render(<AutoGrowTextarea value="" onChange={() => undefined} ariaLabel="메모" />);
    expect(field().disabled).toBe(false);
  });

  it("활성이면 입력이 onChange를 부른다", () => {
    const onChange = vi.fn();
    render(<AutoGrowTextarea value="" onChange={onChange} ariaLabel="메모" />);
    fireEvent.change(field(), { target: { value: "쳐본다" } });
    expect(onChange).toHaveBeenCalledWith("쳐본다");
  });
});

describe("AutoGrowTextarea: id", () => {
  it("id를 넘기면 그 id가 붙는다", () => {
    render(<AutoGrowTextarea value="" onChange={() => undefined} ariaLabel="메모" id="memo-field" />);
    expect(field().getAttribute("id")).toBe("memo-field");
  });

  // 대조군 — 안 넘겼는데 빈 문자열이 박히거나 하지 않는지.
  it("안 넘기면 id 속성이 없다", () => {
    render(<AutoGrowTextarea value="" onChange={() => undefined} ariaLabel="메모" />);
    expect(field().hasAttribute("id")).toBe(false);
  });

  /* **이게 `id`를 넣는 진짜 이유입니다.** 속성이 붙었다는 것만으로는 쓸모를 증명하지
   * 못합니다 — 바깥 `<label htmlFor>`가 실제로 이 컨트롤을 가리키는지가 요구입니다.
   * `ariaLabel`은 일부러 안 넘깁니다: 넘기면 `aria-label`이 `<label>`을 **이기므로**
   * 이 테스트가 htmlFor 연결이 아니라 aria-label을 확인하는 공허한 것이 됩니다. */
  it("바깥 label과 htmlFor로 묶인다", () => {
    render(<>
      <label htmlFor="memo-field">메모</label>
      <AutoGrowTextarea value="" onChange={() => undefined} id="memo-field" />
    </>);
    expect(field().tagName).toBe("TEXTAREA");
  });
});

describe("AutoGrowTextarea: 비활성 표면", () => {
  // 전제 — `?raw`가 빈 문자열로 목킹되면 아래 계약이 전부 공허하게 통과합니다.
  // tests/AppShell.test.tsx:437이 같은 이유로 같은 가드를 답니다.
  it("CSS 소스를 실제로 읽었다", () => {
    expect(controlsCssSource.length).toBeGreaterThan(500);
    expect(selectCssSource.length).toBeGreaterThan(500);
  });

  /* 값을 **하드코딩하지 않고 유도합니다.** `css/select.css:57`이 "값은 킷의 다른
   * disabled 표면과 같다"고 적어 뒀으므로, 그 문장이 계속 참이 되게 만드는 쪽이
   * 숫자를 한 번 더 적는 것보다 낫습니다 — 킷이 흐리기를 바꾸면 여기가 따라옵니다. */
  const kitDisabledOpacity = /\.app-select-trigger:disabled\s*\{[^}]*opacity:\s*([0-9.]+)/.exec(selectCssSource)?.[1];
  const textareaDisabledRule = () => /textarea:disabled[^{]*\{([^}]*)\}/.exec(controlsCssSource)?.[1];

  it("킷의 비활성 흐리기 값을 select.css에서 읽어낼 수 있다", () => {
    expect(kitDisabledOpacity).toBeDefined();
  });

  it("controls.css에 비활성 textarea 규칙이 있다", () => {
    expect(textareaDisabledRule()).toBeDefined();
  });

  it("비활성 textarea가 킷의 다른 비활성 표면과 같은 흐리기를 쓴다", () => {
    expect(textareaDisabledRule() ?? "").toContain(`opacity: ${kitDisabledOpacity}`);
  });

  it("비활성 textarea의 커서가 not-allowed다", () => {
    expect(textareaDisabledRule() ?? "").toContain("cursor: not-allowed");
  });
});

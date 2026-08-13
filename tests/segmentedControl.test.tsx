// @vitest-environment jsdom
/* 오너 질문(2026-08-13): "이 세그먼트나 버튼은 어디다 만드는 거야? wheelpicker랑 다른
 * 데 아니야? 이건 왜 모듈화 안 돼 있는 것 같지?"
 *
 * 🔴 **맞는 지적입니다.** 값 하나를 몇 개 중에서 고르는 묶음은 킷에 **컴포넌트가 없어서**
 * 데모가 `<button className="secondary-button" aria-pressed>`로 손으로 그리고 있었습니다.
 * 그게 눌림/포커스 겹침의 뿌리이기도 했습니다 — 규칙이 없으니 소비자마다 다시 그립니다.
 *
 * 이 파일이 그 컴포넌트의 계약입니다. **접근성은 라디오 그룹**입니다: 여럿 중 하나를
 * 고르는 것이고, 탭 순서는 묶음 하나(roving tabindex)이며 좌우 화살표로 옮깁니다 —
 * `aria-pressed` 토글 여럿으로 두면 스크린리더에 "누른 버튼 넷"으로 읽혀 **몇 중 몇인지**
 * 가 사라집니다. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "../src/SegmentedControl";
import segmentedCssSource from "../css/segmented.css?raw";

afterEach(cleanup);

const OPTIONS = [
  { value: "24", label: "24시간" },
  { value: "12", label: "12시간" },
] as const;

function Harness({ initial = "24" }: { initial?: string }) {
  const [value, setValue] = useState<string>(initial);
  return <SegmentedControl ariaLabel="시간 표기" value={value} options={[...OPTIONS]} onChange={setValue} />;
}

describe("SegmentedControl — 라디오 그룹", () => {
  it("묶음이 라디오 그룹이고 이름을 갖는다", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "시간 표기" })).toBeTruthy();
  });

  it("고른 것만 checked다", () => {
    render(<Harness />);
    expect(screen.getByRole("radio", { name: "24시간" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "12시간" }).getAttribute("aria-checked")).toBe("false");
  });

  /* 🔴 **탭 정거장은 묶음 하나입니다**(roving tabindex). 넷을 다 tab으로 지나가게 두면
   * 설정 화면 하나에서 Tab을 열 번 넘게 눌러야 합니다 — 이 저장소가 휠의 행에서 이미
   * 같은 이유로 `tabIndex={-1}`을 골랐습니다. */
  it("탭 정거장이 하나다 — 고른 것만 0이고 나머지는 -1", () => {
    render(<Harness />);
    expect(screen.getByRole("radio", { name: "24시간" }).getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("radio", { name: "12시간" }).getAttribute("tabindex")).toBe("-1");
  });

  it("클릭하면 고른 값이 바뀐다", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "12시간" }));
    expect(screen.getByRole("radio", { name: "12시간" }).getAttribute("aria-checked")).toBe("true");
  });

  it("좌우 화살표가 다음/이전으로 옮기고 순환한다", () => {
    render(<Harness />);
    const group = screen.getByRole("radiogroup", { name: "시간 표기" });
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "12시간" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "24시간" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(screen.getByRole("radio", { name: "12시간" }).getAttribute("aria-checked")).toBe("true");
  });

  it("Home과 End가 양 끝으로 간다", () => {
    render(<Harness initial="12" />);
    const group = screen.getByRole("radiogroup", { name: "시간 표기" });
    fireEvent.keyDown(group, { key: "Home" });
    expect(screen.getByRole("radio", { name: "24시간" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(group, { key: "End" });
    expect(screen.getByRole("radio", { name: "12시간" }).getAttribute("aria-checked")).toBe("true");
  });

  it("같은 값을 다시 고르면 onChange를 안 부른다 — 소비자의 dirty 판정을 안 더럽힌다", () => {
    const onChange = vi.fn();
    render(<SegmentedControl ariaLabel="시간 표기" value="24" options={[...OPTIONS]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "24시간" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disabled 옵션은 고를 수 없고 화살표도 건너뛴다", () => {
    const onChange = vi.fn();
    render(<SegmentedControl ariaLabel="줄 수" value="1" onChange={onChange} options={[
      { value: "1", label: "1" }, { value: "2", label: "2", disabled: true }, { value: "3", label: "3" },
    ]} />);
    fireEvent.click(screen.getByRole("radio", { name: "2" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("radiogroup", { name: "줄 수" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("3");
  });

  it("className이 묶음에 붙는다 — 킷의 계약", () => {
    render(<SegmentedControl ariaLabel="시간 표기" value="24" options={[...OPTIONS]} onChange={() => undefined} className="mine" />);
    expect(screen.getByRole("radiogroup", { name: "시간 표기" }).classList.contains("mine")).toBe(true);
  });

  /* 🔴 **고른 칸은 강조색 채움이 아닙니다.** 킷에서 강조색 채움은 일곱 자리가 "행동·위치"로
   * 쓰고 있고(오너 리포트로 겹침이 실제로 났습니다), **고름은 행동이 아니라 값**입니다.
   * 트랙 안에 앉는 칩이라는 구조가 이미 "묶음에서 고른 것"을 말하므로, 색은 **채움이
   * 아니라 색조**로만 씁니다. */
  it("고른 칸이 강조색으로 통째 채워지지 않는다", () => {
    expect(segmentedCssSource).not.toContain("background: var(--accent);");
  });

  it("묶음이 움푹한 트랙이고 고른 칸만 떠 있다", () => {
    expect(segmentedCssSource).toContain(".segmented { display: inline-grid;");
    expect(segmentedCssSource).toContain(".segmented > button[aria-checked=\"true\"]");
  });
});

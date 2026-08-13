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

  /* 🔴 **고른 칸은 색으로 말하지 않습니다 — 자리로 말합니다**(오너 결정 2026-08-13).
   * 강조색 색조를 얹은 판을 한 번 거쳤는데 오너가 **중립색** 쪽을 골랐고, 그게 설계와도
   * 맞습니다: 색으로 말하면 강조색을 쓰는 일곱 자리와 계속 겨루고, 여기서 말해야 하는
   * 것은 "이 묶음에서 지금 이것"이라는 **위치**이지 강조가 아닙니다.
   *
   * 그래서 칩에는 강조색이 **아예 안 들어갑니다**(포커스 링만 예외 — 그건 상태가 아니라
   * 입력 장치가 어디 있는지를 말합니다). 강조색이 다시 새면 이 검사가 빨개집니다. */
  it("고른 칸에 강조색이 안 들어간다 — 포커스 링만 예외", () => {
    const chipRule = /\.segmented > button\[aria-checked="true"\] \{[^}]*\}/.exec(segmentedCssSource)?.[0] ?? "(칩 규칙이 없다)";
    expect(chipRule).not.toContain("--accent");
    expect(chipRule).toContain("background: var(--surface);");
  });

  /* "좀 더 진하게"를 **트랙 쪽에서** 얻은 것이 요점입니다 — 칩을 어둡게 하려면 색을 어느
   * 방향으로 섞을지 정해야 하는데 그 방향이 라이트/다크에서 반대라 한쪽이 반드시
   * 이상해집니다. 트랙만 짙게 하면 선언 하나가 두 테마에서 다 맞습니다. */
  it("트랙이 칩보다 짙다 — 대비는 트랙 쪽에서 만든다", () => {
    expect(segmentedCssSource).toContain("background: color-mix(in srgb, var(--surface-soft) 52%, var(--line));");
  });

  it("묶음이 움푹한 트랙이고 고른 칸만 떠 있다", () => {
    expect(segmentedCssSource).toContain(".segmented { display: inline-grid;");
    expect(segmentedCssSource).toContain(".segmented > button[aria-checked=\"true\"]");
  });
});

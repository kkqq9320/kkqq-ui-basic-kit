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
import tokensCssSource from "../css/tokens.css?raw";

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
  /* 🔴 계약이 한 번 더 좁혀졌습니다(오너 결정 2026-08-13): **바탕은 중립색, 글자는
   * 강조색.** 바탕을 강조색으로 채우거나 색조를 얹으면 강조색을 쓰는 일곱 자리
   * ("이걸 하세요")와 겨루지만, **글자 하나만 강조색인 것은 그 어휘와 안 부딪힙니다.**
   * 그래서 검사도 "강조색이 없어야 한다"가 아니라 **"바탕에 강조색이 없어야 한다"**입니다. */
  it("고른 칸은 바탕이 중립색이고 글자만 강조색이다", () => {
    const chipRule = /\.segmented > button\[aria-checked="true"\] \{[^}]*\}/.exec(segmentedCssSource)?.[0] ?? "(칩 규칙이 없다)";
    expect(chipRule).toContain("background: var(--surface);");
    expect(chipRule).toContain("color: var(--accent-text);");
  });

  /* 🔴 **그림자의 방향이 테마마다 반대여야 합니다**(오너: "light에서 box shadow는 좋은데
   * dark는 좀 부자연스럽네"). 칩과 트랙의 밝기 관계가 테마마다 뒤집히기 때문입니다 —
   * 라이트에서 칩은 트랙보다 밝아 **떠 있고**, 다크에서는 어두워 **파여 있습니다**.
   * 드롭 섀도는 "떠 있다"는 신호라, 파인 것 아래에 깔면 구조와 반대되는 말을 합니다. */
  /* 🔴 **강조색을 글자로 쓰기 시작하면서 대비가 처음 문제가 됐습니다.** 채움으로 쓸 때는
   * 흰 글자를 얹으니 괜찮았는데, 글자색으로 쓰면 어두운 면 위에서 `--accent`가 3.13:1로
   * AA(4.5)에 못 미칩니다(13px/800). 그래서 `--accent-text`라는 **새 이름**을 얻었습니다 —
   * `.error`가 `var(--red)`로 대비가 안 나와 `--danger-text`를 얻은 것과 같은 결정입니다.
   *
   * 이 검사는 그 값을 **실제로 재서** 지킵니다. 값을 되돌리면(예: 다크에서 `--accent`와
   * 같게) 여기가 빨개집니다 — 이 저장소는 조용한 대비 깎기를 한 번 거부한 적이 있습니다. */
  it("고른 칸 글자가 두 테마 모두 AA를 넘는다", () => {
    /* ⚠️ **정규식을 문자열로 조립하지 않습니다.** 이 저장소는 그 방식으로 이스케이프를
     * 세 번 먹었고 그중 하나는 한동안 초록으로 통과했습니다(원장). 인덱스로 자릅니다. */
    const value = (block: string, name: string) => {
      const blockStart = tokensCssSource.indexOf(block);
      if (blockStart < 0) return null;
      const body = tokensCssSource.slice(blockStart, tokensCssSource.indexOf("}", blockStart));
      const at = body.indexOf(`${name}:`);
      if (at < 0) return null;
      return body.slice(at + name.length + 1, body.indexOf(";", at)).trim();
    };
    const luminance = (hex: string) => {
      const channels = [1, 3, 5]
        .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const contrast = (a: string, b: string) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    };
    const light = contrast(value(":root {", "--accent-text")!, value(":root {", "--surface")!);
    const dark = contrast(value('[data-theme="dark"] {', "--accent-text")!, value('[data-theme="dark"] {', "--surface")!);
    // 전제 — 토큰을 못 읽었으면 위가 전부 공허하게 통과합니다.
    expect(value(":root {", "--accent-text")).toMatch(/^#[0-9a-f]{6}$/);
    expect(value('[data-theme="dark"] {', "--accent-text")).toMatch(/^#[0-9a-f]{6}$/);
    expect(light).toBeGreaterThanOrEqual(4.5);
    expect(dark).toBeGreaterThanOrEqual(4.5);
  });

  it("다크에서는 드롭 섀도가 아니라 파임 그림자다", () => {
    expect(segmentedCssSource).toContain('[data-theme="dark"] .segmented > button[aria-checked="true"] { box-shadow: inset');
  });

  it("다크에서 포커스가 파임을 지우지 않는다", () => {
    // 포커스 규칙이 뒤에 오므로, 다크용 짝이 없으면 포커스가 드롭 섀도로 되돌립니다.
    expect(segmentedCssSource).toContain('[data-theme="dark"] .segmented > button[aria-checked="true"]:focus-visible');
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

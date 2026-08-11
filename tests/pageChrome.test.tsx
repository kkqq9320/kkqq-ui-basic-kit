// @vitest-environment jsdom

/* `PanelGrid`·`Panel`이 앱에게 넘긴 조작 손잡이들.
 *
 * CSS 계약(tests/summaryGrid.test.ts)은 **규칙이 있다**까지만 증명합니다. 여기서는
 * **컴포넌트가 그 규칙에 닿는 표시를 실제로 붙이는가**를 봅니다 — 둘 중 하나만 있으면
 * 기능은 조용히 죽습니다(클래스는 붙는데 규칙이 없거나, 규칙은 있는데 안 붙거나).
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Panel, PanelGrid, FieldGrid, SummaryGrid, SummaryCard } from "../src/PageChrome";
import { ThemeColorEditor } from "../src/ThemeColorEditor";

afterEach(cleanup);

describe("PanelGrid: 앱이 정하는 것들", () => {
  it("기본은 자연 높이다 — stretch 표시가 없다", () => {
    const { container } = render(<PanelGrid><Panel>내용</Panel></PanelGrid>);
    expect(container.querySelector(".panel-grid")?.classList.contains("stretch")).toBe(false);
  });

  it("stretch를 켜면 표시가 붙는다", () => {
    const { container } = render(<PanelGrid stretch><Panel>내용</Panel></PanelGrid>);
    expect(container.querySelector(".panel-grid")?.classList.contains("stretch")).toBe(true);
  });

  it("min은 그 통에만 걸린다 — 전역 토큰을 건드리지 않는다", () => {
    const { container } = render(<PanelGrid min="800px"><Panel>내용</Panel></PanelGrid>);
    const grid = container.querySelector(".panel-grid") as HTMLElement;
    expect(grid.style.getPropertyValue("--panel-min")).toBe("800px");
    expect(document.documentElement.style.getPropertyValue("--panel-min")).toBe("");
  });

  // 대조군 — 안 넘기면 인라인 값이 없어야 CSS의 토큰 기본값이 이깁니다.
  it("min을 안 넘기면 인라인 값이 없다", () => {
    const { container } = render(<PanelGrid><Panel>내용</Panel></PanelGrid>);
    expect((container.querySelector(".panel-grid") as HTMLElement).style.getPropertyValue("--panel-min")).toBe("");
  });

  it("패널 순서는 넘긴 순서 그대로다 — 킷이 재배열하지 않는다", () => {
    const { container } = render(<PanelGrid>
      <Panel title="첫째">1</Panel>
      <Panel title="둘째">2</Panel>
      <Panel title="셋째">3</Panel>
    </PanelGrid>);
    expect([...container.querySelectorAll(".panel h2")].map((h) => h.textContent)).toEqual(["첫째", "둘째", "셋째"]);
  });
});

describe("FieldGrid: min", () => {
  it("min이 그 통에만 걸린다", () => {
    const { container } = render(<FieldGrid min="320px"><label>이름</label></FieldGrid>);
    expect((container.querySelector(".field-grid") as HTMLElement).style.getPropertyValue("--field-min")).toBe("320px");
  });

  it("안 넘기면 인라인 값이 없다", () => {
    const { container } = render(<FieldGrid><label>이름</label></FieldGrid>);
    expect((container.querySelector(".field-grid") as HTMLElement).style.getPropertyValue("--field-min")).toBe("");
  });
});

describe("Panel: className", () => {
  /* 이게 없어서 앱은 패널 하나에 높이조차 줄 수 없었습니다. */
  it("넘긴 className이 .panel 옆에 붙는다", () => {
    const { container } = render(<Panel className="tall">내용</Panel>);
    const panel = container.querySelector("section") as HTMLElement;
    expect(panel.classList.contains("panel")).toBe(true);
    expect(panel.classList.contains("tall")).toBe(true);
  });

  // 대조군 — 안 넘겼는데 공백이 남아 `class="panel "`이 되지 않는지.
  it("안 넘기면 .panel 하나뿐이다", () => {
    const { container } = render(<Panel>내용</Panel>);
    expect((container.querySelector("section") as HTMLElement).className).toBe("panel");
  });
});

/* **토큰은 전역이 아니라 상속되는 값입니다.** 조상 어디에 걸어도 그 아래만 바뀌고,
 * 통마다 `min`으로 덮어쓸 수 있습니다. 네 그리드가 **같은 손잡이**를 갖는지 한자리에서
 * 봅니다 — 하나만 빠지면 그게 다음 라운드의 질문이 됩니다(실제로 SummaryGrid가 빠져
 * 있었고 오너가 물었습니다). */
describe("min은 통마다 걸린다 — 네 그리드가 같은 손잡이를 갖는다", () => {
  it.each([
    ["summary-grid", "--summary-card-min", (min: string) => <SummaryGrid min={min}><SummaryCard label="ㄱ" value="1" /></SummaryGrid>],
    ["panel-grid", "--panel-min", (min: string) => <PanelGrid min={min}><Panel>ㄱ</Panel></PanelGrid>],
    ["field-grid", "--field-min", (min: string) => <FieldGrid min={min}><label>ㄱ</label></FieldGrid>],
  ])("%s 는 %s 를 그 통에만 건다", (cls, token, make) => {
    const { container } = render(make("321px"));
    const box = container.querySelector(`.${cls}`) as HTMLElement;
    expect(box.style.getPropertyValue(token)).toBe("321px");
    expect(document.documentElement.style.getPropertyValue(token)).toBe("");
  });

  /* 토큰은 **트랙**을 정하므로 카드마다 다른 폭을 줄 수 없습니다 — 트랙은 다 같은
   * 크기입니다. 한 장만 넓히는 길은 `className` + `grid-column: span 2`뿐이고,
   * 그래서 `SummaryCard`에 className이 있어야 합니다. */
  it("SummaryCard는 className으로 한 장만 다르게 할 수 있다", () => {
    const { container } = render(<SummaryGrid><SummaryCard className="wide" label="합계" value="1" /></SummaryGrid>);
    const card = container.querySelector("article") as HTMLElement;
    expect(card.classList.contains("summary-card")).toBe(true);
    expect(card.classList.contains("wide")).toBe(true);
  });

  it("className을 안 넘기면 군더더기 공백이 안 남는다", () => {
    const { container } = render(<SummaryCard label="ㄱ" value="1" />);
    expect((container.querySelector("article") as HTMLElement).className).toBe("summary-card plain");
  });
});

describe("ThemeColorEditor: 앱이 안쪽을 겨눌 수 있다", () => {
  it("cardMin이 그 편집기에만 걸린다", () => {
    const { container } = render(<ThemeColorEditor theme="dark" cardMin="180px" />);
    const panel = container.querySelector("section.theme-color-panel") as HTMLElement;
    expect(panel.style.getPropertyValue("--color-card-min")).toBe("180px");
    expect(document.documentElement.style.getPropertyValue("--color-card-min")).toBe("");
  });

  /* 편집기가 **자기 패널을 직접 렌더**하므로 바깥에서 감싸도 안쪽에 못 닿습니다.
   * 그래서 카드에 높이를 주려면 이 prop이 있어야 합니다. */
  it("넘긴 className이 편집기 패널에 붙는다", () => {
    const { container } = render(<ThemeColorEditor theme="dark" className="my-editor" />);
    const panel = container.querySelector("section.theme-color-panel") as HTMLElement;
    expect(panel.classList.contains("my-editor")).toBe(true);
    expect(panel.classList.contains("panel")).toBe(true);
  });

  it("안 넘기면 기본 클래스 둘뿐이다", () => {
    const { container } = render(<ThemeColorEditor theme="dark" />);
    expect((container.querySelector("section.theme-color-panel") as HTMLElement).className).toBe("panel theme-color-panel");
  });

  /* **RGB 입력은 처음부터 됐습니다**(normalizeColor). 없던 것은 그걸 아는 방법이었고,
   * 오너가 "rgb도 설정할 수 있어야 되는데"라고 물은 것이 그 증거입니다. 안내가 칸에
   * 붙어 있는지를 못박습니다 — 기능이 있는데 안 보이면 없는 것과 같습니다. */
  /* 오너 요청: 라벨 옆의 읽기 전용 RGB를 빼고, **HEX 위에 RGB 칸**을 둬서 두 줄로.
   * 같은 숫자가 한 카드에 두 번 나오면서 그중 하나만 못 고치는 것이 오해의 원인이었습니다. */
  /* ⚠️ **이름이 요소여야 말줄임이 걸립니다.** CSS는 `strong > :first-child`에 말줄임을
   * 거는데 이름이 **텍스트 노드**였던 동안 그 규칙은 `변경됨` 칩에 걸려 있었고, 이름은
   * 보호를 못 받아 좁은 카드에서 두 줄로 쪼개졌습니다(오너 스크린샷의 "뱃/지").
   * 텍스트 노드는 스타일을 못 받는다는 것이 요점이라, 감쌌는지를 구조로 못박습니다. */
  it("토큰 이름이 요소로 감싸여 있다 — 텍스트 노드면 말줄임이 안 걸린다", () => {
    const { container } = render(<ThemeColorEditor theme="dark" />);
    const strong = container.querySelector(".theme-color-copy strong") as HTMLElement;
    expect(strong.firstElementChild?.tagName).toBe("SPAN");
    expect(strong.firstElementChild?.textContent).toBe("페이지 배경");
  });

  it("입력이 RGB·HEX 두 줄이다", () => {
    const { container } = render(<ThemeColorEditor theme="dark" />);
    const card = container.querySelector(".theme-color-card") as HTMLElement;
    expect([...card.querySelectorAll(".theme-color-entry > small")].map((s) => s.textContent)).toEqual(["RGB", "HEX"]);
  });

  it("라벨 줄에는 토큰 이름만 남고 RGB는 없다", () => {
    const { container } = render(<ThemeColorEditor theme="dark" />);
    const line = container.querySelector(".theme-color-copy small") as HTMLElement;
    expect(line.textContent).toBe("--bg");
    expect(line.textContent).not.toMatch(/\d+,\s*\d+/);
  });

  it("RGB 칸에 넣으면 HEX 칸과 견본이 따라온다", () => {
    const { container } = render(<ThemeColorEditor theme="dark" />);
    const [rgb, hex] = [...container.querySelectorAll(".theme-color-entry input")] as HTMLInputElement[];
    fireEvent.change(rgb, { target: { value: "20, 200, 120" } });
    expect(hex.value).toBe("#14c878");
    expect((container.querySelector(".theme-color-swatch") as HTMLInputElement).value).toBe("#14c878");
  });

  it("HEX 칸에 넣으면 RGB 칸이 따라온다", () => {
    const { container } = render(<ThemeColorEditor theme="dark" />);
    const [rgb, hex] = [...container.querySelectorAll(".theme-color-entry input")] as HTMLInputElement[];
    fireEvent.change(hex, { target: { value: "#ff8800" } });
    expect(rgb.value).toBe("255, 136, 0");
  });

  it("색상 값 칸이 RGB도 받는다고 스스로 알린다", () => {
    const { container } = render(<ThemeColorEditor theme="dark" />);
    const field = container.querySelector(".theme-color-text") as HTMLInputElement;
    expect(field.placeholder).toMatch(/87,\s*91,\s*212/);
    expect(field.title).toMatch(/RGB/i);
  });

  /* placeholder는 **칸이 빈 순간에만** 보이는데 이 칸은 늘 값이 차 있습니다. 그래서
   * 붙박이 표시가 따로 필요합니다 — 이게 없으면 위 두 단언이 통과해도 화면에서는
   * 아무것도 안 보입니다. */
  it("형식 표시가 칸 옆에 늘 붙어 있다", () => {
    const { container } = render(<ThemeColorEditor theme="dark" />);
    const entry = container.querySelector(".theme-color-entry");
    expect(entry?.querySelector("small")?.textContent).toMatch(/RGB/i);
    expect(entry?.querySelector(".theme-color-text")).not.toBeNull();
  });

  /* 오너가 적어 준 네 형식이 **전부** 값으로 들어가는지. 파서 단위 테스트는 이미
   * 있지만(ThemeColorEditor.test.tsx), 그건 함수만 봅니다 — 칸에 넣었을 때 실제로
   * 색이 바뀌는지는 다른 질문이고, 오너가 "넣을 방법이 없다"고 한 것이 그 질문입니다. */
  it.each([
    ["87,11,11", "#570b0b"],
    ["87 111 122", "#576f7a"],
    ["87, 11, 122", "#570b7a"],
    ["rgb(255,255,255)", "#ffffff"],
  ])("칸에 %s 를 넣으면 견본이 %s 가 된다", (typed, expected) => {
    const { container } = render(<ThemeColorEditor theme="dark" />);
    const field = container.querySelector(".theme-color-text") as HTMLInputElement;
    fireEvent.change(field, { target: { value: typed } });
    expect((container.querySelector(".theme-color-swatch") as HTMLInputElement).value).toBe(expected);
  });
});

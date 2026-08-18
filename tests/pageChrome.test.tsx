// @vitest-environment jsdom

/* `PanelGrid`·`Panel`이 앱에게 넘긴 조작 손잡이들.
 *
 * CSS 계약(tests/summaryGrid.test.ts)은 **규칙이 있다**까지만 증명합니다. 여기서는
 * **컴포넌트가 그 규칙에 닿는 표시를 실제로 붙이는가**를 봅니다 — 둘 중 하나만 있으면
 * 기능은 조용히 죽습니다(클래스는 붙는데 규칙이 없거나, 규칙은 있는데 안 붙거나).
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import pageCss from "../css/page.css?raw";
import tabsCss from "../css/tabs.css?raw";
import { Panel, PanelGrid, FieldGrid, SectionHeading, SummaryGrid, SummaryCard } from "../src/surfaces/PageChrome";
import { ThemeColorEditor } from "../src/theme/ThemeColorEditor";

afterEach(cleanup);

/* `SectionHeading`은 `SectionTabs.tsx`에서 여기로 옮겨 왔습니다(PRINCIPLES §15 규칙 4 —
 * 탭이 아니라 §7 배치 스택의 일부입니다). 옮기기 전 이 컴포넌트는 **렌더 테스트가 0개**
 * 였습니다(훑어 확인 — 배럴·소스·데모에만 나옵니다). 컴포넌트와 CSS가 **서로 다른 두
 * 파일**을 건너간 변경이라, 이 파일의 머리말이 적은 그대로 양쪽을 다 봅니다: 표시가
 * 붙는가(렌더), 그 표시에 닿는 규칙이 있는가(CSS). */
describe("SectionHeading: §7의 예약된 설명 줄", () => {
  it("설명을 안 넘겨도 <p>가 남는다 — 자리를 예약하는 것이 계약이다", () => {
    const { container } = render(<SectionHeading title="컨트롤" />);
    const heading = container.querySelector(".settings-section-heading");
    expect(heading?.querySelector("h2")?.textContent).toBe("컨트롤");
    expect(heading?.querySelector("p")).not.toBeNull();
  });

  it("className은 킷 클래스를 덮지 않고 더해진다", () => {
    const { container } = render(<SectionHeading title="컨트롤" className="dense" />);
    expect([...container.firstElementChild!.classList].sort()).toEqual(["dense", "settings-section-heading"]);
  });

  /* 🔴 **이 줄이 CSS 이사를 지킵니다.** 컴포넌트만 옮기고 규칙을 두고 왔거나, 규칙만
   * 옮기고 클래스 이름을 바꿨으면 여기가 빨개집니다. 57px은 §7이 적은 "19px 3줄"입니다. */
  it("예약 높이 규칙이 page.css에 있고 tabs.css에는 없다", () => {
    expect(pageCss).toContain(".settings-section-heading p { min-height: 57px;");
    expect(tabsCss).not.toContain("settings-section-heading");
  });
});

describe("PanelGrid: 앱이 정하는 것들", () => {
  it("기본은 자연 높이다 — stretch 표시가 없다", () => {
    const { container } = render(<PanelGrid><Panel>내용</Panel></PanelGrid>);
    expect(container.querySelector(".panel-grid")?.hasAttribute("data-align")).toBe(false);
  });

  it("stretch를 켜면 표시가 붙는다", () => {
    const { container } = render(<PanelGrid stretch><Panel>내용</Panel></PanelGrid>);
    expect(container.querySelector(".panel-grid")?.getAttribute("data-align")).toBe("stretch");
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

/* **모든 컨테이너에 일반 출구가 있어야 합니다.** 자주 쓰는 것(min·max·justify)은 prop으로
 * 열어 뒀지만, 그리드 셋에 `className`이 없던 동안에는 `align-items`·`gap`·`grid-auto-flow`
 * 같은 것을 앱이 손댈 방법이 아예 없었습니다 — 그래서 필요한 속성이 생길 때마다 킷에
 * prop을 하나씩 더하는 왕복이 났습니다(min → max → justify로 세 번).
 * 여섯을 한 표로 봅니다. **하나만 빠지면 그게 다음 라운드의 질문이 됩니다.** */
describe("여섯 컴포넌트가 모두 className을 받는다", () => {
  it.each([
    ["summary-grid", (c: string) => <SummaryGrid className={c}><SummaryCard label="ㄱ" value="1" /></SummaryGrid>],
    ["panel-grid", (c: string) => <PanelGrid className={c}><Panel>ㄱ</Panel></PanelGrid>],
    ["field-grid", (c: string) => <FieldGrid className={c}><label>ㄱ</label></FieldGrid>],
    ["panel", (c: string) => <Panel className={c}>ㄱ</Panel>],
    ["summary-card", (c: string) => <SummaryCard className={c} label="ㄱ" value="1" />],
  ])("%s 에 앱의 클래스가 붙는다", (base, make) => {
    const { container } = render(make("mine"));
    const el = container.querySelector("." + base) as HTMLElement;
    expect(el, base + " 를 못 찾았습니다").not.toBeNull();
    expect(el.classList.contains("mine")).toBe(true);
  });

  /* 안 넘겼을 때 `class="panel-grid "`처럼 군더더기가 남지 않아야 합니다 —
   * `stretch`와 `className`이 겹치는 PanelGrid가 그 위험이 가장 큽니다. */
  it("PanelGrid는 안 넘기면 기본 클래스만 남는다", () => {
    const { container } = render(<PanelGrid><Panel>ㄱ</Panel></PanelGrid>);
    expect((container.querySelector(".panel-grid") as HTMLElement).className).toBe("panel-grid");
  });

  it("PanelGrid는 stretch와 className을 같이 받는다", () => {
    const { container } = render(<PanelGrid stretch className="mine"><Panel>ㄱ</Panel></PanelGrid>);
    const el = container.querySelector(".panel-grid") as HTMLElement;
    expect(el.getAttribute("data-align")).toBe("stretch");
    expect(el.classList.contains("mine")).toBe(true);
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

  /* 칩은 **이름 옆**입니다(오너가 액션 옆으로 옮겼다가 되돌렸습니다).
   * 그래도 이름이 안 밀리는 것은 이름을 `span`으로 감쌌기 때문입니다 — 텍스트 노드였던
   * 동안에는 말줄임 규칙이 칩에 걸려 있어서 좁은 카드에서 이름이 두 줄로 쪼개졌습니다. */
  it("변경됨 칩은 이름 옆에 있고, 그래도 이름이 한 덩어리로 남는다", () => {
    const { container } = render(<ThemeColorEditor theme="dark" />);
    const hex = container.querySelectorAll(".theme-color-text")[1] as HTMLInputElement;
    fireEvent.change(hex, { target: { value: "#123456" } });
    const chip = container.querySelector(".theme-color-changed");
    expect(chip, "값을 바꿨는데 변경됨 칩이 없습니다").not.toBeNull();
    expect(chip!.closest(".theme-color-copy"), "칩이 이름 묶음 밖에 있습니다").not.toBeNull();
    // 이름은 여전히 요소로 감싸여 있어야 말줄임이 걸립니다.
    const strong = container.querySelector(".theme-color-copy strong") as HTMLElement;
    expect(strong.firstElementChild?.tagName).toBe("SPAN");
    // 좁은 카드에서 이름은 말줄임됩니다 — 잘린 글자를 볼 방법이 있어야 합니다.
    expect(strong.firstElementChild?.getAttribute("title")).toBe("페이지 배경");
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

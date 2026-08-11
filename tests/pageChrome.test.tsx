// @vitest-environment jsdom

/* `PanelGrid`·`Panel`이 앱에게 넘긴 조작 손잡이들.
 *
 * CSS 계약(tests/summaryGrid.test.ts)은 **규칙이 있다**까지만 증명합니다. 여기서는
 * **컴포넌트가 그 규칙에 닿는 표시를 실제로 붙이는가**를 봅니다 — 둘 중 하나만 있으면
 * 기능은 조용히 죽습니다(클래스는 붙는데 규칙이 없거나, 규칙은 있는데 안 붙거나).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Panel, PanelGrid, FieldGrid } from "../src/PageChrome";

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

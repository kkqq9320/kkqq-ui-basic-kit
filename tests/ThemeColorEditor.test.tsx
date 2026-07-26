// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  THEME_TOKENS,
  ThemeColorEditor,
  applyTokenOverrides,
  normalizeColor,
  readTokenOverrides,
  toRgbText,
  writeTokenOverrides,
  type ThemeName,
} from "../src";

const root = document.documentElement;

beforeEach(() => { localStorage.clear(); root.removeAttribute("style"); });
afterEach(() => { cleanup(); localStorage.clear(); root.removeAttribute("style"); vi.useRealTimers(); });

function renderEditor(initialTheme: ThemeName = "dark") {
  function Harness() {
    const [theme, setTheme] = useState<ThemeName>(initialTheme);
    return <>
      <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>테마 전환</button>
      <ThemeColorEditor theme={theme} />
    </>;
  }
  return render(<Harness />);
}

/** 한 토큰의 카드를 색 견본 기준으로 집습니다. */
function card(label: string) {
  const swatch = screen.getByLabelText(`${label} 색상 선택`) as HTMLInputElement;
  const element = swatch.closest(".theme-color-card") as HTMLElement;
  const scope = within(element);
  return {
    element,
    swatch,
    scope,
    undo: () => scope.getByRole("button", { name: `${label} 직전 값으로` }),
    reset: () => scope.getByRole("button", { name: `${label} 기본값으로` }),
    text: () => scope.getByLabelText(`${label} 색상 값`) as HTMLInputElement,
    /** 헥스 입력칸으로 값을 넣습니다. */
    type(value: string) { fireEvent.change(this.text(), { target: { value } }); return this; },
    /** 피커를 끄는 동안 오는 값. 연속이면 Undo 한 칸으로 묶여야 합니다. */
    drag(...values: string[]) { for (const value of values) fireEvent.change(this.swatch, { target: { value } }); return this; },
    /** 포커스가 떠나면 한 번의 조작이 끝난 것입니다. */
    release() { fireEvent.blur(this.swatch); fireEvent.blur(this.text()); return this; },
  };
}

describe("카드", () => {
  it("잠금 없이 견본과 헥스코드가 바로 열려 있다", () => {
    renderEditor();
    const teal = card("강조색");

    expect(teal.swatch.disabled).toBe(false);            // 눌러서 바로 피커가 열린다
    expect(teal.text().value).toBe(teal.swatch.value);   // 헥스코드도 처음부터 보인다
    expect(teal.scope.queryByRole("button", { name: /편집/ })).toBeNull();
  });

  it("카드 자체는 누를 수 없다", () => {
    // 목록을 훑다가 스치듯 눌러 팔레트가 바뀌는 걸 막는다 — 조작 지점은 견본과 입력칸뿐.
    renderEditor();
    for (const element of document.querySelectorAll(".theme-color-card")) {
      expect(element.getAttribute("onclick")).toBeNull();
      expect(element.tagName).toBe("DIV");
      expect(element.closest("label")).toBeNull();   // 라벨로 감싸도 카드 클릭이 견본으로 샌다
    }
  });

  it("토큰마다 카드 하나에 Undo·Reset 두 버튼이 아이콘으로만 있다", () => {
    renderEditor();
    expect(document.querySelectorAll(".theme-color-card")).toHaveLength(THEME_TOKENS.length);
    const teal = card("강조색");
    expect(teal.scope.getAllByRole("button")).toHaveLength(2);
    for (const button of [teal.undo(), teal.reset()]) expect(button.textContent).toBe("");
  });
});

describe("편집", () => {
  it("값을 입력하면 :root에 적용되고 저장된다", () => {
    renderEditor("dark");
    card("강조색").type("#112233");

    expect(root.style.getPropertyValue("--accent")).toBe("#112233");
    expect(JSON.parse(localStorage.getItem("themeColors:dark")!)).toEqual({ "--accent": "#112233" });
  });

  it("견본으로 고른 값도 그대로 적용된다", () => {
    renderEditor("dark");
    card("강조색").drag("#112233");
    expect(root.style.getPropertyValue("--accent")).toBe("#112233");
  });

  it("RGB 표기로도 입력할 수 있다", () => {
    renderEditor("dark");
    card("강조색").type("17, 34, 51");
    expect(root.style.getPropertyValue("--accent")).toBe("#112233");
  });

  it("형식이 아닌 입력은 적용하지 않는다", () => {
    renderEditor("dark");
    card("강조색").type("빨강");

    expect(root.style.getPropertyValue("--accent")).toBe("");
    expect(localStorage.getItem("themeColors:dark")).toBeNull();
  });

  it("바뀐 카드에 표시가 붙는다", () => {
    renderEditor("dark");
    const teal = card("강조색").type("#112233");
    expect(teal.scope.getByText("변경됨")).toBeTruthy();
  });
});

describe("한 번의 조작은 Undo 한 칸", () => {
  it("피커를 끄는 동안 지나간 색은 기록에 남지 않는다", () => {
    renderEditor("dark");
    const teal = card("강조색");
    teal.drag("#111111", "#222222", "#333333", "#444444");

    expect(root.style.getPropertyValue("--accent")).toBe("#444444");
    fireEvent.click(teal.undo());

    expect(root.style.getPropertyValue("--accent")).toBe("");     // 끌기 전으로 한 번에
    expect(teal.undo()).toHaveProperty("disabled", true);       // 잔상이 남아 있지 않다
  });

  it("포커스가 떠나면 다음 조작은 새 칸이 된다", () => {
    renderEditor("dark");
    const teal = card("강조색");
    teal.drag("#111111", "#222222").release();
    teal.drag("#333333");

    fireEvent.click(teal.undo());
    expect(root.style.getPropertyValue("--accent")).toBe("#222222");
    fireEvent.click(teal.undo());
    expect(root.style.getPropertyValue("--accent")).toBe("");
  });

  it("손을 놓고 잠시 쉬어도 새 칸이 된다", () => {
    vi.useFakeTimers();
    renderEditor("dark");
    const teal = card("강조색");
    teal.drag("#111111", "#222222");
    vi.advanceTimersByTime(600);
    teal.drag("#333333");

    fireEvent.click(teal.undo());
    expect(root.style.getPropertyValue("--accent")).toBe("#222222");
  });

  it("다른 카드를 만지면 각자의 칸에 쌓인다", () => {
    renderEditor("dark");
    card("강조색").drag("#111111", "#222222");
    card("페이지 배경").drag("#333333", "#444444");

    fireEvent.click(card("강조색").undo());
    expect(root.style.getPropertyValue("--accent")).toBe("");
    expect(root.style.getPropertyValue("--bg")).toBe("#444444");   // 남의 조작은 건드리지 않는다
  });
});

describe("Undo와 Reset", () => {
  it("Undo는 직전 값으로 한 단계씩 돌아간다", () => {
    renderEditor("dark");
    const teal = card("강조색");
    expect(teal.undo()).toHaveProperty("disabled", true);   // 기록이 없으면 못 누른다

    teal.type("#111111").release().type("#222222");
    expect(root.style.getPropertyValue("--accent")).toBe("#222222");

    fireEvent.click(teal.undo());
    expect(root.style.getPropertyValue("--accent")).toBe("#111111");

    fireEvent.click(teal.undo());
    expect(root.style.getPropertyValue("--accent")).toBe("");   // 처음 기본값까지
    expect(teal.undo()).toHaveProperty("disabled", true);
  });

  it("Reset은 기본값으로 한 번에 가고, 그것도 Undo로 되살릴 수 있다", () => {
    renderEditor("dark");
    const teal = card("강조색").type("#112233");

    fireEvent.click(teal.reset());
    expect(root.style.getPropertyValue("--accent")).toBe("");
    expect(teal.scope.queryByText("변경됨")).toBeNull();

    fireEvent.click(teal.undo());
    expect(root.style.getPropertyValue("--accent")).toBe("#112233");
  });

  it("Reset 다음의 조작은 Reset과 묶이지 않는다", () => {
    renderEditor("dark");
    const teal = card("강조색").drag("#112233");
    fireEvent.click(teal.reset());
    teal.drag("#445566");

    fireEvent.click(teal.undo());
    expect(root.style.getPropertyValue("--accent")).toBe("");         // Reset 직후로
    fireEvent.click(teal.undo());
    expect(root.style.getPropertyValue("--accent")).toBe("#112233");   // 그 전 값으로
  });

  it("바뀌지 않은 카드는 Reset을 누를 수 없다", () => {
    renderEditor();
    expect(card("강조색").reset()).toHaveProperty("disabled", true);
  });

  it("모두 초기화가 개수를 배지로 보여주고 한 번에 지운다", () => {
    renderEditor("dark");
    card("강조색").type("#112233");
    card("페이지 배경").type("#445566");

    const resetAll = screen.getByRole("button", { name: "색상 2개 모두 기본값으로" });
    expect(within(resetAll).getByText("2")).toBeTruthy();
    fireEvent.click(resetAll);

    expect(root.style.getPropertyValue("--accent")).toBe("");
    expect(root.style.getPropertyValue("--bg")).toBe("");
    expect(localStorage.getItem("themeColors:dark")).toBeNull();
    expect(screen.getByRole("button", { name: "모두 기본값으로" })).toHaveProperty("disabled", true);
  });

  it("모두 초기화도 카드마다 Undo로 되살릴 수 있다", () => {
    renderEditor("dark");
    card("강조색").type("#112233");
    fireEvent.click(screen.getByRole("button", { name: "색상 1개 모두 기본값으로" }));

    fireEvent.click(card("강조색").undo());
    expect(root.style.getPropertyValue("--accent")).toBe("#112233");
  });
});

describe("테마", () => {
  it("라이트와 다크의 색을 따로 기억한다", () => {
    renderEditor("dark");
    card("강조색").type("#112233");

    fireEvent.click(screen.getByRole("button", { name: "테마 전환" }));
    card("강조색").type("#445566");

    expect(JSON.parse(localStorage.getItem("themeColors:dark")!)).toEqual({ "--accent": "#112233" });
    expect(JSON.parse(localStorage.getItem("themeColors:light")!)).toEqual({ "--accent": "#445566" });
  });

  it("테마를 바꾸면 Undo 기록이 초기화된다", () => {
    renderEditor("dark");
    card("강조색").type("#112233");

    fireEvent.click(screen.getByRole("button", { name: "테마 전환" }));
    expect(card("강조색").undo()).toHaveProperty("disabled", true);
  });

  it("테마를 바꾸는 사이에 조작이 이어지지 않는다", () => {
    // 세션이 살아 있으면 새 테마의 첫 변경이 기록 없이 삼켜진다.
    renderEditor("dark");
    card("강조색").drag("#112233");
    fireEvent.click(screen.getByRole("button", { name: "테마 전환" }));
    card("강조색").drag("#445566");

    fireEvent.click(card("강조색").undo());
    expect(root.style.getPropertyValue("--accent")).toBe("");
  });

  it("저장된 값을 그대로 다시 보여준다", () => {
    localStorage.setItem("themeColors:dark", JSON.stringify({ "--accent": "#112233" }));
    renderEditor("dark");

    expect(card("강조색").swatch.value).toBe("#112233");
    expect(screen.getByRole("button", { name: "색상 1개 모두 기본값으로" })).toBeTruthy();
  });
});

describe("토큰 저장·적용", () => {
  it("기본값을 복사해 두지 않는다", () => {
    // tokens.css가 유일한 출처다. 표에 값이 생기면 CSS만 바뀌었을 때 조용히 어긋난다.
    for (const token of THEME_TOKENS) expect(Object.keys(token).sort()).toEqual(["description", "label", "name"]);
  });

  it("모르는 토큰과 망가진 값은 무시하고 hex로 정규화한다", () => {
    localStorage.setItem("themeColors:light", JSON.stringify({
      "--accent": "87, 91, 212",
      "--not-a-token": "#ffffff",
      "--muted": "빨강",
      "--bg": 42,
    }));
    expect(readTokenOverrides("light")).toEqual({ "--accent": "#575bd4" });
  });

  it("망가진 JSON이어도 던지지 않는다", () => {
    localStorage.setItem("themeColors:dark", "{{{");
    expect(readTokenOverrides("dark")).toEqual({});
  });

  it("테마를 바꾸면 이전 테마의 색이 남지 않는다", () => {
    writeTokenOverrides("light", { "--accent": "#112233" });
    writeTokenOverrides("dark", { "--bg": "#445566" });

    applyTokenOverrides("light");
    expect(root.style.getPropertyValue("--accent")).toBe("#112233");

    applyTokenOverrides("dark");
    expect(root.style.getPropertyValue("--accent")).toBe("");
    expect(root.style.getPropertyValue("--bg")).toBe("#445566");
  });

  it("색 표기를 6자리 hex로 모은다", () => {
    expect(normalizeColor("#abc")).toBe("#aabbcc");
    expect(normalizeColor("rgb(87, 91, 212)")).toBe("#575bd4");
    expect(normalizeColor("87 91 212")).toBe("#575bd4");
    for (const bad of ["", "빨강", "#12", "rgb(300, 0, 0)", "0,0"]) expect(normalizeColor(bad), bad).toBeNull();
    expect(toRgbText("#575bd4")).toBe("87, 91, 212");
  });
});

describe("groups 확장 (키트 수정 없이 새 색 추가)", () => {
  // 프로젝트가 자기 CSS에 --brand-2를 정의하고 groups에 항목을 더하는 상황.
  const CUSTOM_GROUPS = [
    { title: "브랜드", tokens: [{ name: "--brand-2", label: "브랜드 보조", description: "보조 브랜드 색" }] },
  ];

  it("groups에 더한 커스텀 토큰이 편집·저장·적용된다", () => {
    render(<ThemeColorEditor theme="dark" groups={CUSTOM_GROUPS} />);
    card("브랜드 보조").type("#123456");

    expect(root.style.getPropertyValue("--brand-2")).toBe("#123456");   // :root에 적용
    expect(JSON.parse(localStorage.getItem("themeColors:dark")!)).toEqual({ "--brand-2": "#123456" });   // 저장
  });

  it("저장된 커스텀 토큰을 다시 열면 그대로 보여준다", () => {
    localStorage.setItem("themeColors:dark", JSON.stringify({ "--brand-2": "#abcdef" }));
    render(<ThemeColorEditor theme="dark" groups={CUSTOM_GROUPS} />);
    expect(card("브랜드 보조").swatch.value).toBe("#abcdef");
  });

  it("readTokenOverrides는 넘긴 tokens에 없는 키를 버린다", () => {
    // 기본 목록으로 읽으면 --brand-2는 모르는 토큰이라 버려지고,
    localStorage.setItem("themeColors:dark", JSON.stringify({ "--brand-2": "#123456", "--accent": "#111111" }));
    expect(readTokenOverrides("dark")).toEqual({ "--accent": "#111111" });
    // 확장 목록으로 읽으면 --brand-2도 받는다.
    const tokens = CUSTOM_GROUPS.flatMap((group) => group.tokens);
    expect(readTokenOverrides("dark", tokens)).toEqual({ "--brand-2": "#123456" });
  });

  it("applyTokenOverrides는 넘긴 tokens만 :root에 적용한다", () => {
    const tokens = CUSTOM_GROUPS.flatMap((group) => group.tokens);
    applyTokenOverrides("dark", { "--brand-2": "#123456" }, tokens);
    expect(root.style.getPropertyValue("--brand-2")).toBe("#123456");
  });
});

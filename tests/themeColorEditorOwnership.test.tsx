// @vitest-environment jsdom
/* 앱이 저장소를 소유하는 경로. 로그인해서 서버에서 받아 온 색을 넘기면 편집기는
 * 적용하고 알리기만 하고, 저장은 앱이 한다.
 *
 * ⚠️ 이 저장소에는 jest-dom이 없다 — DOM 속성을 직접 단언한다. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeColorEditor } from "../src/ThemeColorEditor";
import { createThemePalette } from "../src/themePalette";

const BRAND = { name: "--brand-2", label: "브랜드2", description: "앱 색" };
const palette = () => createThemePalette([{ title: "브랜드", tokens: [BRAND] }]);

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("style");
});

describe("앱이 소유할 때", () => {
  it("넘긴 값으로 그린다", () => {
    render(<ThemeColorEditor theme="light" palette={palette()} overrides={{ "--brand-2": "#ff8a3d" }} />);

    expect((screen.getByLabelText("브랜드2 색상 값") as HTMLInputElement).value).toBe("#ff8a3d");
  });

  /* ⚠️ 이것이 이 Task의 목적이다. 서버를 쓰는 앱이 localStorage 쓰기를 당하면 안 된다. */
  it("고쳐도 킷이 저장하지 않는다", () => {
    render(<ThemeColorEditor theme="light" palette={palette()} overrides={{}} />);

    fireEvent.change(screen.getByLabelText("브랜드2 색상 값"), { target: { value: "#ff8a3d" } });

    expect(localStorage.getItem("themeColors:light")).toBe(null);
  });

  it("고치면 화면에는 적용된다", () => {
    render(<ThemeColorEditor theme="light" palette={palette()} overrides={{}} />);

    fireEvent.change(screen.getByLabelText("브랜드2 색상 값"), { target: { value: "#ff8a3d" } });

    expect(document.documentElement.style.getPropertyValue("--brand-2")).toBe("#ff8a3d");
  });

  it("고치면 onChange로 전체 집합을 알린다", () => {
    const onChange = vi.fn();
    render(<ThemeColorEditor theme="light" palette={palette()} overrides={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("브랜드2 색상 값"), { target: { value: "#ff8a3d" } });

    expect(onChange).toHaveBeenLastCalledWith({ "--brand-2": "#ff8a3d" });
  });

  /* 앱이 나중에(로그인 응답이 온 뒤) 값을 바꿔 넘기면 스와치가 따라와야 한다.
   * 이게 없으면 화면 색과 편집기가 서로 다른 말을 한다. */
  it("넘긴 값이 바뀌면 따라온다", () => {
    const view = render(<ThemeColorEditor theme="light" palette={palette()} overrides={{}} />);

    view.rerender(<ThemeColorEditor theme="light" palette={palette()} overrides={{ "--brand-2": "#ff8a3d" }} />);

    expect((screen.getByLabelText("브랜드2 색상 값") as HTMLInputElement).value).toBe("#ff8a3d");
  });

  it("안 넘기면 킷이 그대로 저장한다", () => {
    render(<ThemeColorEditor theme="light" palette={palette()} />);

    fireEvent.change(screen.getByLabelText("브랜드2 색상 값"), { target: { value: "#ff8a3d" } });

    expect(JSON.parse(localStorage.getItem("themeColors:light") ?? "null")).toEqual({ "--brand-2": "#ff8a3d" });
  });
});

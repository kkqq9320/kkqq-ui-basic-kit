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

  /* ⚠️ 이 테스트가 지키는 것은 값이 아니라 **`setLoadedTheme`이 controlled에서도 돈다**는
   * 것입니다. 그 줄을 `if (!controlled)` 안으로 옮기면 loadedTheme이 영원히 뒤처져 바깥
   * 조건이 매 렌더마다 참이 되고, setHistory·setDraft가 계속 불려 "Too many re-renders"가
   * 납니다. 계획서 문구를 문자 그대로 따르면 그 버그가 되므로 여기서 못박습니다. */
  it("controlled에서 테마를 바꿔도 앱이 준 값을 따른다", () => {
    const view = render(<ThemeColorEditor theme="light" palette={palette()} overrides={{ "--brand-2": "#ff8a3d" }} />);

    view.rerender(<ThemeColorEditor theme="dark" palette={palette()} overrides={{ "--brand-2": "#ffa866" }} />);

    expect((screen.getByLabelText("브랜드2 색상 값") as HTMLInputElement).value).toBe("#ffa866");
  });
});

describe("저장 경계", () => {
  it("피커를 끄는 동안은 onCommit이 안 불린다", () => {
    const onCommit = vi.fn();
    render(<ThemeColorEditor theme="light" palette={palette()} overrides={{}} onCommit={onCommit} />);
    const swatch = screen.getByLabelText("브랜드2 색상 선택");

    for (const value of ["#111111", "#222222", "#333333"]) fireEvent.change(swatch, { target: { value } });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("포커스가 떠나면 한 번 불린다", () => {
    const onCommit = vi.fn();
    render(<ThemeColorEditor theme="light" palette={palette()} overrides={{}} onCommit={onCommit} />);
    const swatch = screen.getByLabelText("브랜드2 색상 선택");
    for (const value of ["#111111", "#222222", "#333333"]) fireEvent.change(swatch, { target: { value } });

    fireEvent.blur(swatch);

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("마지막 값으로 불린다", () => {
    const onCommit = vi.fn();
    render(<ThemeColorEditor theme="light" palette={palette()} overrides={{}} onCommit={onCommit} />);
    const swatch = screen.getByLabelText("브랜드2 색상 선택");
    for (const value of ["#111111", "#222222", "#333333"]) fireEvent.change(swatch, { target: { value } });

    fireEvent.blur(swatch);

    expect(onCommit).toHaveBeenLastCalledWith({ "--brand-2": "#333333" });
  });

  /* 모두 초기화도 경계다 — 빈 맵을 안 알리면 앱이 초기화를 저장할 수 없다. */
  it("모두 초기화하면 빈 맵으로 불린다", () => {
    const onCommit = vi.fn();
    render(<ThemeColorEditor theme="light" palette={palette()} overrides={{ "--brand-2": "#ff8a3d" }} onCommit={onCommit} />);

    fireEvent.click(screen.getByLabelText("색상 1개 모두 기본값으로"));

    expect(onCommit).toHaveBeenLastCalledWith({});
  });

  /* ⚠️ 버튼 경로는 자기 변경을 커밋하기 **전에** 이전 세션을 닫는다. 거기서도 알리면
   * 낡은 값으로 한 번 더 불린다. 횟수를 따로 못박는다 — `toHaveBeenLastCalledWith`만
   * 보면 두 번 불려도 통과한다. */
  it("모두 초기화는 한 번만 알린다", () => {
    const onCommit = vi.fn();
    render(<ThemeColorEditor theme="light" palette={palette()} overrides={{ "--brand-2": "#ff8a3d" }} onCommit={onCommit} />);

    fireEvent.click(screen.getByLabelText("색상 1개 모두 기본값으로"));

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  /* 사라지는 컴포넌트의 콜백으로 앱 상태를 건드리게 하면 안 된다. */
  it("언마운트로는 알리지 않는다", () => {
    const onCommit = vi.fn();
    const view = render(<ThemeColorEditor theme="light" palette={palette()} overrides={{}} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText("브랜드2 색상 선택"), { target: { value: "#111111" } });

    view.unmount();

    expect(onCommit).not.toHaveBeenCalled();
  });
});

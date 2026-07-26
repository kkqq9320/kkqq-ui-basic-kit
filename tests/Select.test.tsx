// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Select } from "../src/Select";

afterEach(cleanup);

const OPTIONS = [
  { value: "a", label: "첫째" },
  { value: "b", label: "둘째" },
  { value: "c", label: "셋째", disabled: true },
];

function ControlledSelect({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return <Select ariaLabel="항목" value={value} options={OPTIONS} onChange={setValue} />;
}

function ControlledPortalSelect({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return <Select ariaLabel="항목" value={value} options={OPTIONS} onChange={setValue} portal />;
}

describe("Select", () => {
  it("shows the placeholder until something is selected", () => {
    render(<ControlledSelect />);
    expect(screen.getByRole("button", { name: "항목" }).textContent).toBe("선택하세요");
  });

  it("uses a custom placeholder when supplied", () => {
    render(<Select ariaLabel="Item" value="" options={OPTIONS} onChange={() => undefined} placeholder="Choose one" />);
    expect(screen.getByRole("button", { name: "Item" }).textContent).toBe("Choose one");
  });

  it("opens a listbox, selects an option, and closes", () => {
    render(<ControlledSelect />);
    const trigger = screen.getByRole("button", { name: "항목" });

    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox", { name: "항목" })).toBeTruthy();

    fireEvent.click(screen.getByRole("option", { name: "둘째" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger.textContent).toBe("둘째");
  });

  it("marks the selected option and disables the disabled one", () => {
    render(<ControlledSelect initialValue="a" />);
    fireEvent.click(screen.getByRole("button", { name: "항목" }));

    expect(screen.getByRole("option", { name: "첫째" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: "첫째" }).className).toContain("selected");
    expect(screen.getByRole("option", { name: "셋째" })).toHaveProperty("disabled", true);
  });

  it("closes on Escape and on an outside click", () => {
    render(<ControlledSelect />);
    const trigger = screen.getByRole("button", { name: "항목" });

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not open while disabled", () => {
    render(<Select ariaLabel="항목" value="" options={OPTIONS} onChange={vi.fn()} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "항목" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("renders the menu inside the trigger by default", () => {
    const { container } = render(<ControlledSelect />);
    fireEvent.click(screen.getByRole("button", { name: "항목" }));
    const menu = screen.getByRole("listbox");
    expect(container.querySelector(".app-select")?.contains(menu)).toBe(true);
    expect(menu.className).not.toContain("app-select-menu-portaled");
  });

  it("escapes an overflow-clipping ancestor when portal is set", () => {
    // 사이드바 슬롯처럼 overflow를 자르는 조상 안에 놓인 상황
    const { container } = render(
      <div style={{ overflow: "hidden", height: 60 }}>
        <ControlledPortalSelect />
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "항목" });
    fireEvent.click(trigger);

    const menu = screen.getByRole("listbox");
    expect(container.contains(menu)).toBe(false);      // 잘리는 조상 밖으로 나갔다
    expect(document.body.contains(menu)).toBe(true);
    expect(menu.className).toContain("app-select-menu-portaled");
    expect(menu.style.top).not.toBe("");               // 좌표를 직접 계산해 붙였다
    expect(menu.style.left).not.toBe("");
  });

  it("still selects and closes from a portaled menu", () => {
    render(<ControlledPortalSelect />);
    const trigger = screen.getByRole("button", { name: "항목" });
    fireEvent.click(trigger);

    // 포털 메뉴는 컴포넌트 루트 바깥이라, 바깥클릭 감지가 옵션 클릭을 삼키면 안 된다
    fireEvent.mouseDown(screen.getByRole("option", { name: "둘째" }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "둘째" }));

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger.textContent).toBe("둘째");
  });

  it("adds the alignment class so the centered variant reserves both icon slots", () => {
    const { container } = render(<Select ariaLabel="항목" value="" options={OPTIONS} onChange={vi.fn()} align="center" />);
    expect(container.querySelector(".app-select")?.className).toContain("dropdown-align-center");
  });
});

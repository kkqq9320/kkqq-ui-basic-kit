// @vitest-environment jsdom
//
// 오른쪽 아래 떠 있는 "페이지" 카드. 열린 메뉴가 바깥 조작으로 닫히는지 확인한다.
// (닫힘 로직을 빠뜨리면 메뉴가 화면에 남아 다른 버튼을 가린다.)

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { MobilePageTabs, MobilePageTabsContext, MobileQuickBar, SectionTabs, useMobilePageTabs } from "../src";

afterEach(cleanup);

const TABS = [
  { value: "a", label: "첫째 탭" },
  { value: "b", label: "둘째 탭" },
];

function Harness() {
  const pageTabs = useMobilePageTabs();
  const [tab, setTab] = useState("a");
  return <MobilePageTabsContext.Provider value={pageTabs.context}>
    <div data-testid="outside">바깥 영역</div>
    <SectionTabs ariaLabel="데모 섹션" value={tab} tabs={TABS} onChange={setTab} />
    <MobileQuickBar barRef={pageTabs.quickBarRef} items={[{ id: "menu", label: "메뉴", icon: null, onClick: () => undefined }]} />
    <MobilePageTabs registration={pageTabs.registration} open={pageTabs.open} onToggle={pageTabs.setOpen} floatRef={pageTabs.floatRef} />
  </MobilePageTabsContext.Provider>;
}

function openFloatMenu() {
  render(<Harness />);
  const toggle = screen.getByRole("button", { name: /^페이지 · 데모 섹션/ });
  fireEvent.click(toggle);
  return toggle;
}

describe("MobilePageTabs", () => {
  it("SectionTabs가 등록되면 플로팅 카드가 나타난다", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /^페이지 · 데모 섹션: 첫째 탭/ })).toBeTruthy();
  });

  it("토글로 열고 다시 눌러 닫는다", () => {
    const toggle = openFloatMenu();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("바깥을 누르면 닫힌다", () => {
    const toggle = openFloatMenu();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("Escape로 닫힌다", () => {
    const toggle = openFloatMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("메뉴 안을 누르는 것으로는 닫히지 않는다", () => {
    const toggle = openFloatMenu();
    const option = screen.getAllByRole("tab", { name: "둘째 탭" }).find((el) => el.closest(".mobile-quick-tab-menu"))!;
    fireEvent.pointerDown(option);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("빠른 바를 누르는 것으로도 닫히지 않는다 (한 덩어리로 취급)", () => {
    const toggle = openFloatMenu();
    fireEvent.pointerDown(screen.getByRole("button", { name: "메뉴" }));
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("탭을 고르면 값이 바뀌고 카드가 닫힌다", () => {
    const toggle = openFloatMenu();
    const option = screen.getAllByRole("tab", { name: "둘째 탭" }).find((el) => el.closest(".mobile-quick-tab-menu"))!;
    fireEvent.click(option);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: /^페이지 · 데모 섹션: 둘째 탭/ })).toBeTruthy();
  });
});

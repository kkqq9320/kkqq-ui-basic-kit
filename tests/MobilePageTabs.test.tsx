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
    <MobileQuickBar barRef={pageTabs.quickBarRef} items={[{ id: "menu", label: "메뉴", icon: null, kind: "action", onClick: () => undefined }]} />
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

/* ── §16 ③: 떠 있다 / 펼쳤다는 컨테이너의 축이 싣는다 ───────────────────────
 *
 * 🔴 **여기도 감시자가 0이었습니다** — `.open`·`.mobile-open` 둘 다. 축을 꺼졌을 때도
 * 늘 붙이는 변이가 1690개 전부 초록이었습니다(2026-08-19).
 *
 * ⚠️ 두 축의 **이름이 다릅니다.** 떠 있는 카드는 `data-open`, 옵션 목록을 펴는 접힘은
 * `data-mobile-open`입니다. sidebar의 서랍은 또 `data-mobile-drawer="open"`인데, 그쪽은
 * **밀려 들어오는 서랍**이라 같은 축이 아닙니다 — 이름을 억지로 맞추면 세 컴포넌트가
 * 서로를 끌고 다니게 됩니다. */
describe("떠 있다 / 펼쳤다의 표식 (§16 ③)", () => {
  const floatCard = () => document.querySelector(".mobile-page-tabs-float")!;
  const tabsRoot = () => document.querySelector(".settings-tabs")!;

  it("플로팅 메뉴: 닫혀 있으면 축이 없고, 열면 붙는다", () => {
    const toggle = openFloatMenu();
    expect(floatCard().matches('[data-open="true"]')).toBe(true);
    fireEvent.click(toggle);
    expect(floatCard().getAttribute("data-open")).toBeNull();
  });

  it("모바일 탭 카드: 펴면 축이 붙고, 접으면 사라진다", () => {
    render(<Harness />);
    const card = screen.getByRole("button", { name: /^데모 섹션:/ });
    expect(tabsRoot().getAttribute("data-mobile-open")).toBeNull();
    fireEvent.click(card);
    expect(tabsRoot().matches('[data-mobile-open="true"]')).toBe(true);
    fireEvent.click(card);
    expect(tabsRoot().getAttribute("data-mobile-open")).toBeNull();
  });
});

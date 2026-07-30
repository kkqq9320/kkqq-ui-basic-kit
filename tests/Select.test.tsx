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

  // 실제 휴대폰 트레이스(온스크린 이벤트 추적 패널로 채집): 옵션을 한 번 탭했는데
  // click이 두 번 온다 — 옵션 자신의 click(+120ms, menu=yes) 다음에, mousedown/mouseup
  // 없이 트리거를 겨냥한 click이 24ms 뒤(+144ms, menu=no)에 또 온다. 이미 닫힌 뒤라
  // :165의 무방비 토글이 그걸 "다시 열기"로 읽어 메뉴가 곧바로 재오픈됐다. 이 테스트는
  // 그 순서(옵션 click → 트리거 click, 같은 한 번의 탭)를 그대로 재현한다.
  it("does not let a same-tap phantom click on the trigger reopen the menu after choosing an option", () => {
    render(<ControlledSelect />);
    const trigger = screen.getByRole("button", { name: "항목" });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "둘째" }));
    expect(screen.queryByRole("listbox")).toBeNull();

    // 같은 탭이 만든 두 번째(유령) click — 실기기에서 트리거를 겨냥해 온다.
    fireEvent.click(trigger);

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

  // jsdom은 레이아웃을 계산하지 않아 clientHeight/scrollHeight/offsetTop이 항상 0으로
  // 나옵니다. 이 블록에서만 Element/HTMLElement 프로토타입에 실제 CSS와 같은 값을
  // 흉내 낸 값을 얹어(메뉴 320px 캡, 옵션 34px, 패딩 6px) 진짜 스크롤 계산을 검증하고,
  // 테스트가 끝나면 되돌립니다. 위쪽의 다른 테스트들은 이 스텁 없이 그대로 돕니다.
  describe("scrolls the selected option into view on open", () => {
    const ROW_HEIGHT = 34;
    const MENU_PADDING = 6;
    const MENU_CAP = 320;

    // "연결 안 함" + 최근 거래 50건 — 실제로 데이터 손실을 일으켰던 시나리오(51개 옵션)
    const MANY_OPTIONS = [
      { value: "none", label: "연결 안 함" },
      ...Array.from({ length: 50 }, (_, i) => ({ value: `tx-${i + 1}`, label: `거래 ${i + 1}` })),
    ];

    const originalClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight")!;
    const originalScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight")!;
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
    const originalOffsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop")!;

    function stubMenuLayout(optionCount: number) {
      Object.defineProperty(Element.prototype, "clientHeight", {
        configurable: true,
        get(this: Element) { return this.matches(".app-select-menu") ? MENU_CAP : 0; },
      });
      Object.defineProperty(Element.prototype, "scrollHeight", {
        configurable: true,
        get(this: Element) { return this.matches(".app-select-menu") ? optionCount * ROW_HEIGHT + MENU_PADDING * 2 : 0; },
      });
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get(this: HTMLElement) { return this.matches('[role="option"]') ? ROW_HEIGHT : 0; },
      });
      Object.defineProperty(HTMLElement.prototype, "offsetTop", {
        configurable: true,
        get(this: HTMLElement) {
          if (!this.matches('[role="option"]') || !this.parentElement) return 0;
          return MENU_PADDING + Array.from(this.parentElement.children).indexOf(this) * ROW_HEIGHT;
        },
      });
    }

    afterEach(() => {
      Object.defineProperty(Element.prototype, "clientHeight", originalClientHeight);
      Object.defineProperty(Element.prototype, "scrollHeight", originalScrollHeight);
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
      Object.defineProperty(HTMLElement.prototype, "offsetTop", originalOffsetTop);
    });

    // 51개 중 31번째(index 30, offsetTop 1026)가 선택된, 실제 회귀와 같은 배치.
    // scrollHeight 1746, clientHeight 320 → 가운데 정렬 883 (클램프에 걸리지 않음).
    it("centers a selection that sits far below the fold", () => {
      stubMenuLayout(MANY_OPTIONS.length);
      render(<Select ariaLabel="거래" value="tx-30" options={MANY_OPTIONS} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "거래" }));

      expect(screen.getByRole("listbox").scrollTop).toBe(883);
    });

    // 같은 배치를 portal 모드로. portal은 position이 정해질 때까지 메뉴가 아예
    // 마운트되지 않으므로, 이 케이스가 실제로 이펙트 순서 문제를 잡아냅니다 —
    // 스크롤 로직을 첫 번째 배치 이펙트 안에 뒀다면 메뉴가 없어 조용히 실패합니다.
    it("centers a selection that sits far below the fold in portal mode too", () => {
      stubMenuLayout(MANY_OPTIONS.length);
      render(<Select ariaLabel="거래" value="tx-30" options={MANY_OPTIONS} onChange={vi.fn()} portal />);
      fireEvent.click(screen.getByRole("button", { name: "거래" }));

      expect(screen.getByRole("listbox").scrollTop).toBe(883);
    });

    // index 2 (offsetTop 74~108)는 320px짜리 첫 화면 안에 이미 들어와 있으므로
    // 점프시키지 않습니다 — 안 움직이는 편이 낫습니다.
    it("does not move the menu when the selection is already visible", () => {
      stubMenuLayout(MANY_OPTIONS.length);
      render(<Select ariaLabel="거래" value="tx-2" options={MANY_OPTIONS} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "거래" }));

      expect(screen.getByRole("listbox").scrollTop).toBe(0);
    });

    // 마지막 옵션(index 50, offsetTop 1706)을 그대로 가운데에 놓으면 1563으로
    // scrollHeight(1746)를 넘는 스크롤이 되므로, 목록 끝(1746-320=1426)에서 잘라야 합니다.
    it("clamps centering so it never scrolls past the end of the list", () => {
      stubMenuLayout(MANY_OPTIONS.length);
      render(<Select ariaLabel="거래" value="tx-50" options={MANY_OPTIONS} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "거래" }));

      expect(screen.getByRole("listbox").scrollTop).toBe(1426);
    });

    // value가 어떤 옵션과도 안 맞는 placeholder 상태 — 손대지 않고 맨 위 그대로.
    it("leaves scrollTop at 0 when nothing is selected", () => {
      stubMenuLayout(MANY_OPTIONS.length);
      render(<Select ariaLabel="거래" value="" options={MANY_OPTIONS} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "거래" }));

      expect(screen.getByRole("listbox").scrollTop).toBe(0);
    });

    // scrollIntoView()는 다이얼로그 뒤 페이지까지 스크롤시킬 수 있어 쓰지 않기로
    // 했습니다(positioning.ts의 restoreFocusWithoutScroll과 같은 이유). 나중에 누가
    // 구현을 scrollIntoView()로 바꿔도 이 테스트가 잡아냅니다 — jsdom은 조상 스크롤을
    // 실제로 흉내 내지 못해 그 결과 자체는 검증할 수 없으므로, 대신 이 계약을 봅니다.
    // 이 jsdom 버전은 scrollIntoView를 아예 구현하지 않아(prototype에 없음) vi.spyOn을
    // 못 쓰므로, 직접 mock 함수를 얹었다가 끝나면 지웁니다.
    it("never calls Element.scrollIntoView (would also scroll ancestors)", () => {
      const scrollIntoView = vi.fn();
      Object.defineProperty(Element.prototype, "scrollIntoView", { value: scrollIntoView, configurable: true, writable: true });
      stubMenuLayout(MANY_OPTIONS.length);
      render(<Select ariaLabel="거래" value="tx-30" options={MANY_OPTIONS} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "거래" }));

      expect(scrollIntoView).not.toHaveBeenCalled();
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    });
  });
});

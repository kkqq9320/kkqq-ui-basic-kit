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

/** jsdom은 getBoundingClientRect를 항상 0으로 주므로 직접 덮어써야 한다(tests/AppShell.test.tsx의
 * stubRectBottom과 같은 이유). top을 바꿀 수 있게 해 "트리거가 실제로 화면에서 움직였다"를
 * 흉내 낸다. */
function stubRect(element: HTMLElement, top: number) {
  let currentTop = top;
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top: currentTop, left: 0, right: 100, bottom: currentTop + 40, width: 100, height: 40, x: 0, y: currentTop, toJSON() {} }),
  });
  return { setTop(next: number) { currentTop = next; } };
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

  describe("스크롤로 트리거가 화면에서 멀어지면 닫힌다 (DateWheelPicker와 같은 동작 — §16.4)", () => {
    // DateWheelPicker는 바깥 닫기를 pointerdown으로 판정한다 — 터치가 스크롤로
    // 이어지더라도 반드시 pointerdown(터치 시작)이 먼저 온다. 그래서 "스크롤에
    // 닫힌다"는 실은 "스크롤을 시작하는 순간 우연히 닫히는" pointerdown의 부수
    // 효과였다(실기기·라이브 브라우저 양쪽에서 확인: 데스크톱 wheel-스크롤로는
    // DateWheelPicker가 전혀 닫히지 않고, 아무 스크롤 없이 pointerdown 하나만
    // 쏴도 닫힌다). Select는 바깥 닫기를 mousedown으로 판정하는데, 스크롤로
    // 이어지는 터치는 브라우저가 합성 mousedown/click을 만들지 않으므로 이
    // 부작용이 없어 지금까지 스크롤에 반응하지 않았다.
    //
    // 정렬은 "아무 스크롤이나 닫기"가 아니라 "트리거(앵커)가 실제로 움직였는가"로
    // 판정한다 — 무조건 닫으면 메뉴가 열리는 순간 브라우저가 트리거를 화면 안으로
    // 스스로 스크롤시키는 경우(포커스 이동 등) 열리자마자 스스로 닫혀 버릴 위험이
    // 있다(라이브 브라우저에서 프레임이 그려지지 않아 육안으로는 확인 못 함 — 코드
    // 리뷰로 방어). 트리거 위치가 그대로인 스크롤(메뉴 자신의 스크롤, 무관한 스크롤,
    // 열리는 순간의 side effect)은 닫지 않는다.

    it("트리거가 화면에서 실제로 멀어지는 스크롤에는 닫힌다", () => {
      render(<ControlledSelect />);
      const trigger = screen.getByRole("button", { name: "항목" });
      const rect = stubRect(trigger, 200);
      fireEvent.click(trigger);
      expect(screen.getByRole("listbox")).toBeTruthy();

      rect.setTop(130);   // 페이지가 스크롤되어 트리거가 70px 위로 이동
      fireEvent.scroll(document);

      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("트리거 위치가 그대로인 스크롤(메뉴 자신의 스크롤이나 무관한 스크롤)은 닫지 않는다", () => {
      render(<ControlledSelect />);
      const trigger = screen.getByRole("button", { name: "항목" });
      stubRect(trigger, 200);
      fireEvent.click(trigger);

      fireEvent.scroll(document);   // 트리거는 움직이지 않았다 — 열리는 순간의 side effect까지 방어

      expect(screen.getByRole("listbox")).toBeTruthy();
    });

    it("메뉴 자신의 스크롤(옵션 목록)은 닫지 않는다", () => {
      render(<ControlledSelect />);
      fireEvent.click(screen.getByRole("button", { name: "항목" }));
      const menu = screen.getByRole("listbox");

      fireEvent.scroll(menu);

      expect(screen.getByRole("listbox")).toBeTruthy();
    });

    it("모바일 스크롤 호스트(#root)가 스크롤돼 트리거가 멀어져도 닫힌다 (portal)", () => {
      // tokens.css:101-107 — 모바일에서는 #root가 스크롤 호스트이고 document는
      // 스크롤되지 않는다. scroll은 버블되지 않으므로 document의 capture 리스너가
      // #root의 스크롤도 잡는지(placeMenu의 기존 리스너와 같은 전제) 확인한다.
      const root = document.createElement("div");
      root.id = "root";
      document.body.appendChild(root);
      render(<ControlledPortalSelect />, { container: root });
      const trigger = screen.getByRole("button", { name: "항목" });
      const rect = stubRect(trigger, 300);
      fireEvent.click(trigger);
      expect(screen.getByRole("listbox")).toBeTruthy();

      rect.setTop(40);
      fireEvent.scroll(root);

      expect(screen.queryByRole("listbox")).toBeNull();
      root.remove();
    });
  });
});

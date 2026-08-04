// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Select, scrollActiveOptionIntoView } from "../src/Select";
import selectCssSource from "../css/select.css?raw";
import surfacesCssSource from "../css/surfaces.css?raw";

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

    it("활성 옵션이 아래로 벗어나면 아래쪽 끝에만 맞춘다 — 가운데로 튀지 않는다", () => {
      stubMenuLayout(MANY_OPTIONS.length);
      const menu = document.createElement("div");
      menu.className = "app-select-menu";
      for (const option of MANY_OPTIONS) {
        const button = document.createElement("button");
        button.setAttribute("role", "option");
        menu.appendChild(button);
      }
      document.body.appendChild(menu);
      menu.scrollTop = 0;

      // 인덱스 10은 MENU_CAP 아래에 있다. 가운데 정렬이면 훨씬 크게 움직인다.
      // stubMenuLayout의 offsetTop은 MENU_PADDING + index * ROW_HEIGHT다 —
      // MENU_PADDING을 빼먹으면 6px 어긋난다.
      scrollActiveOptionIntoView(menu as HTMLDivElement, 10);
      const expected = MENU_PADDING + 11 * ROW_HEIGHT - MENU_CAP;   // 6 + 374 - 320 = 60
      expect(menu.scrollTop).toBe(60);
      expect(expected).toBe(60);   // 산술이 상수와 어긋나면 여기서 먼저 걸린다

      menu.remove();
    });

    it("활성 옵션이 이미 보이면 스크롤을 건드리지 않는다", () => {
      stubMenuLayout(MANY_OPTIONS.length);
      const menu = document.createElement("div");
      menu.className = "app-select-menu";
      for (const option of MANY_OPTIONS) {
        const button = document.createElement("button");
        button.setAttribute("role", "option");
        menu.appendChild(button);
      }
      document.body.appendChild(menu);
      menu.scrollTop = 0;

      scrollActiveOptionIntoView(menu as HTMLDivElement, 0);
      expect(menu.scrollTop).toBe(0);

      menu.remove();
    });

    // 방향키 위(Task 4)가 정확히 이 분기(optionTop < menu.scrollTop)에 의존한다.
    // 위 두 테스트는 전부 menu.scrollTop = 0에서 시작하므로 이 분기가 한 번도
    // 실행되지 않는다 — 위쪽 끝에 맞추는 줄을 `menu.scrollTop = optionTop - 100;`으로
    // 바꿔도 전체 테스트가 그대로 통과한다(계측으로 확인). 화면 아래쪽으로 충분히
    // 스크롤한 채로 맨 위(index 0)로 올라가면, offsetTop(=MENU_PADDING=6)에
    // 정확히 맞춰야 한다.
    it("활성 옵션이 위로 벗어나면 위쪽 끝에만 맞춘다", () => {
      stubMenuLayout(MANY_OPTIONS.length);
      const menu = document.createElement("div");
      menu.className = "app-select-menu";
      for (const option of MANY_OPTIONS) {
        const button = document.createElement("button");
        button.setAttribute("role", "option");
        menu.appendChild(button);
      }
      document.body.appendChild(menu);
      menu.scrollTop = 500;   // 목록 아래쪽 — 목록 끝보다는 한참 위, index 0의 offsetTop보다는 한참 아래

      scrollActiveOptionIntoView(menu as HTMLDivElement, 0);
      expect(menu.scrollTop).toBe(6);
      expect(MENU_PADDING).toBe(6);   // 산술이 상수와 어긋나면 여기서 먼저 걸린다

      menu.remove();
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

  describe("메뉴 안에서 시작한 스와이프는 체이닝돼 페이지가 스크롤돼도 닫지 않는다 (DateWheelPicker와 대비되는 owner 리포트)", () => {
    // Owner: 긴 Select가 열린 채로 메뉴 위에 손가락을 대고 아래로 스와이프하면 닫혀
    //버린다 — 스크롤하고 싶었을 뿐인데. 확인된 메커니즘: 메뉴(overflow-y: auto)가
    // 스크롤 끝에 닿거나 애초에 스크롤할 여유가 없으면, 같은 터치 제스처가 조상
    // 스크롤러(document/#root)로 체이닝된다. 그 조상이 실제로 스크롤되면 트리거
    // rect도 움직이므로, 위 블록의 "트리거가 실제로 멀어지는 스크롤에는 닫힌다"
    // 판정이 그대로 걸려 메뉴를 닫아 버린다 — 그 스크롤을 사용자가 "메뉴 안에서"
    // 시작했다는 사실은 event.target(=document/#root)만 봐서는 알 수 없다.
    //
    // 구분 기준은 "이 스크롤의 target이 메뉴인가"가 아니라 "이 제스처가 메뉴
    // 안에서 시작됐는가"다 — 제스처가 메뉴 안에서 시작해 포인터가 아직 떠 있는
    // 동안에는, 그 제스처가 만든 어떤 체이닝된 조상 스크롤도 닫기 판정에서
    // 제외해야 한다. DateWheelPicker의 "스와이프 시작하면 안 닫힌다"는 이 로직이
    // 아니라 pointerdown이 바깥 클릭 판정 자체를 우연히 먼저 타는 부수 효과였다
    // (Select.tsx 주석 참고) — 여기서는 그 사고를 재현하지 않고, 명시적으로
    // "메뉴 안에서 시작된 포인터가 떠 있는 동안"만 억제한다.
    it("포인터가 메뉴 안에서 눌린 채로 체이닝된 페이지 스크롤이 트리거를 움직여도 열려 있는다", () => {
      render(<ControlledSelect />);
      const trigger = screen.getByRole("button", { name: "항목" });
      const rect = stubRect(trigger, 200);
      fireEvent.click(trigger);
      const option = screen.getByRole("option", { name: "첫째" });

      fireEvent.pointerDown(option);   // 제스처가 메뉴 안에서 시작
      rect.setTop(130);                // 체이닝으로 페이지가 스크롤돼 트리거가 70px 위로 이동
      fireEvent.scroll(document);

      expect(screen.getByRole("listbox")).toBeTruthy();   // 닫히지 않는다
    });

    it("포인터를 떼면 억제가 풀려, 이후의 실제 페이지 스크롤은 다시 정상적으로 닫는다", () => {
      // 억제가 제스처 동안만이라는 걸 증명한다 — 영구 억제라면 이 테스트가 실패한다.
      render(<ControlledSelect />);
      const trigger = screen.getByRole("button", { name: "항목" });
      const rect = stubRect(trigger, 200);
      fireEvent.click(trigger);
      const option = screen.getByRole("option", { name: "첫째" });

      fireEvent.pointerDown(option);
      rect.setTop(130);
      fireEvent.scroll(document);
      expect(screen.getByRole("listbox")).toBeTruthy();   // 아직 제스처 중 — 안 닫힘

      fireEvent.pointerUp(option);
      rect.setTop(60);   // 손을 뗀 뒤 별개의 진짜 페이지 스크롤이 트리거를 또 움직인다
      fireEvent.scroll(document);

      expect(screen.queryByRole("listbox")).toBeNull();   // 이번엔 정상적으로 닫힌다
    });

    it("메뉴 밖에서 시작한 포인터는 억제하지 않는다 — 손가락이 메뉴 밖이면 그대로 닫힌다", () => {
      render(<ControlledSelect />);
      const trigger = screen.getByRole("button", { name: "항목" });
      const rect = stubRect(trigger, 200);
      fireEvent.click(trigger);

      fireEvent.pointerDown(document.body);   // 메뉴 밖에서 시작한 포인터
      rect.setTop(130);
      fireEvent.scroll(document);

      expect(screen.queryByRole("listbox")).toBeNull();   // 억제되지 않아 정상적으로 닫힌다
    });
  });

  describe("disabled 옵션은 눈으로 구분된다", () => {
    // jsdom은 CSS 캐스케이드를 계산하지 않으므로(레이아웃 엔진이 없다) 이 계약은
    // 소스 텍스트로 고정한다 — AppShell.test.tsx·Dialog.test.tsx의 같은 idiom.
    // 빈 문자열 가드가 없으면 .css?raw가 ""로 목킹되는 날 이 테스트들이 통째로
    // 공허하게 통과한다(이 저장소에서 실제로 있었던 결함).
    it("disabled 옵션에 시각 처리가 있다", () => {
      expect(selectCssSource.length).toBeGreaterThan(1000);
      expect(selectCssSource).toMatch(/\.app-select-menu button:disabled\s*\{[^}]*opacity:\s*\.55/);
      expect(selectCssSource).toMatch(/\.app-select-menu button:disabled\s*\{[^}]*cursor:\s*not-allowed/);
    });

    // 특이도 함정: .selected 규칙이 (0,4,1)로 :disabled 규칙 (0,2,1)을 이긴다.
    // 값이 disabled 옵션을 가리키면 강조색이 disabled 표시를 덮어써서, 고를 수 없는
    // 항목이 "선택된 항목"처럼 보인다. 특이도를 올려 이기는 대신 .selected가
    // disabled를 아예 매칭하지 않게 한다 — 의미가 맞는 쪽이다.
    it(".selected 규칙이 disabled를 제외한다", () => {
      expect(selectCssSource.length).toBeGreaterThan(1000);
      const selectedRule = selectCssSource.match(/\.app-select-menu button\.selected[^{]*\{/);
      expect(selectedRule).not.toBeNull();
      expect(selectedRule![0]).toMatch(/:not\(:disabled\)/);
    });
  });

  describe("descendant 모드의 .active 하이라이트가 CSS에도 있다 — jsdom은 캐스케이드를 계산하지 않으므로 소스 텍스트로 고정", () => {
    // descendant 모드는 포커스를 옵션으로 옮기지 않으므로 :focus-visible이 옵션에서
    // 절대 맞지 않는다 — .active가 :is(...) 목록에서 빠지면 하이라이트가 조용히
    // 사라진다(런타임 에러도, 실패하는 다른 테스트도 없다). 두 규칙(기본 + reduced
    // motion)을 각각 고정한다 — 위 disabled 블록과 같은 idiom.
    it("호버/포커스 규칙의 :is(...) 목록에 .active가 있다", () => {
      expect(surfacesCssSource.length).toBeGreaterThan(500);
      expect(surfacesCssSource).toMatch(/:where\(\.app-select-menu\) button:is\([^)]*\.active[^)]*\):not\(:disabled\)\s*\{[^}]*transform:\s*scale\(var\(--dropdown-option-hover-scale\)\)/);
    });

    it("prefers-reduced-motion 블록에도 .active가 있다 — 없으면 reduced-motion 사용자에게 transform이 되돌아온다", () => {
      expect(surfacesCssSource.length).toBeGreaterThan(500);
      const reducedMotionBlock = surfacesCssSource.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/);
      expect(reducedMotionBlock).not.toBeNull();
      expect(reducedMotionBlock![0]).toMatch(/:is\([^)]*\.active[^)]*\):not\(:disabled\)\s*\{\s*transform:\s*none;\s*\}/);
    });
  });

  describe("키보드로 조작한다", () => {
    it("닫힌 상태에서 ↓를 누르면 열리고 현재 값이 활성이 된다", () => {
      render(<ControlledSelect initialValue="b" />);
      const trigger = screen.getByRole("button", { name: "항목" });

      fireEvent.keyDown(trigger, { key: "ArrowDown" });

      expect(screen.getByRole("listbox")).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByRole("option", { name: "둘째" }));
    });

    it("선택값이 없으면 첫 선택 가능한 옵션이 활성이 된다", () => {
      render(<ControlledSelect />);
      fireEvent.keyDown(screen.getByRole("button", { name: "항목" }), { key: "ArrowDown" });

      expect(document.activeElement).toBe(screen.getByRole("option", { name: "첫째" }));
    });

    it("↓가 disabled 옵션을 건너뛴다", () => {
      render(<ControlledSelect initialValue="a" />);
      const trigger = screen.getByRole("button", { name: "항목" });
      fireEvent.keyDown(trigger, { key: "ArrowDown" });

      // OPTIONS = a, b, c(disabled). a에서 ↓는 b로.
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
      expect(document.activeElement).toBe(screen.getByRole("option", { name: "둘째" }));

      // b에서 ↓는 c가 disabled라 갈 곳이 없다 — 제자리.
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
      expect(document.activeElement).toBe(screen.getByRole("option", { name: "둘째" }));
    });

    it("Home과 End가 양 끝의 선택 가능한 옵션으로 간다", () => {
      render(<ControlledSelect initialValue="b" />);
      fireEvent.keyDown(screen.getByRole("button", { name: "항목" }), { key: "ArrowDown" });

      fireEvent.keyDown(screen.getByRole("listbox"), { key: "Home" });
      expect(document.activeElement).toBe(screen.getByRole("option", { name: "첫째" }));

      // 마지막(셋째)은 disabled라 End는 둘째로 간다.
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "End" });
      expect(document.activeElement).toBe(screen.getByRole("option", { name: "둘째" }));
    });

    it("Enter가 활성 옵션을 고르고 닫고 포커스를 트리거로 돌려준다", () => {
      render(<ControlledSelect initialValue="a" />);
      const trigger = screen.getByRole("button", { name: "항목" });
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });

      fireEvent.keyDown(screen.getByRole("listbox"), { key: "Enter" });

      expect(screen.queryByRole("listbox")).toBeNull();
      expect(trigger.textContent).toBe("둘째");
    });

    it("Ctrl+↓와 Meta+↓는 무시한다 — 브라우저 단축키를 뺏지 않는다", () => {
      render(<ControlledSelect />);
      const trigger = screen.getByRole("button", { name: "항목" });

      fireEvent.keyDown(trigger, { key: "ArrowDown", ctrlKey: true });
      expect(screen.queryByRole("listbox")).toBeNull();

      fireEvent.keyDown(trigger, { key: "ArrowDown", metaKey: true });
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("Alt+↓는 ↓와 똑같이 연다 — 네이티브 select 습관", () => {
      render(<ControlledSelect />);
      fireEvent.keyDown(screen.getByRole("button", { name: "항목" }), { key: "ArrowDown", altKey: true });

      expect(screen.getByRole("listbox")).toBeTruthy();
    });

    it("선택 가능한 옵션이 없으면 방향키가 아무것도 하지 않는다", () => {
      const allDisabled = [{ value: "a", label: "첫째", disabled: true }];
      render(<Select ariaLabel="항목" value="" options={allDisabled} onChange={() => undefined} />);

      fireEvent.keyDown(screen.getByRole("button", { name: "항목" }), { key: "ArrowDown" });
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    // jsdom은 <button>의 keydown이 click으로 이어지는 브라우저 합성을 재현하지 않으므로,
    // "메뉴가 열린다"는 증상 자체는 여기서 관찰할 수 없다 — 대신 원인인 preventDefault
    // 누락을 직접 관찰한다. 실기기/실브라우저에서는: 선택 가능한 옵션이 하나도 없어
    // initial===null로 handleKeyDown이 일찍 return하면, 막지 않은 Enter keydown이
    // <button>의 네이티브 click으로 바뀌어 트리거의 onClick(setOpen(true))이 대신
    // 메뉴를 열어버린다 — 활성 옵션도 포커스도 없는 죽은 드롭다운. fireEvent 대신 직접
    // KeyboardEvent를 만들어 dispatch해야 event.defaultPrevented를 사후에 읽을 수 있다.
    it("옵션이 전부 disabled면 Enter가 기본 동작을 막는다 — 못 막으면 네이티브 click이 대신 메뉴를 연다", () => {
      const allDisabled = [{ value: "a", label: "첫째", disabled: true }];
      render(<Select ariaLabel="항목" value="" options={allDisabled} onChange={() => undefined} />);
      const trigger = screen.getByRole("button", { name: "항목" });

      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      trigger.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    // 클릭으로 열 때도 키보드로 열 때와 같은 값을 시드해야 네이티브 <select>처럼
    // 방향키가 "지금 선택된 값"에서 이어간다. OPTIONS = a(첫째), b(둘째), c(disabled,셋째).
    // value="b"인 채로 클릭해서 열고 ↑를 누르면 b 바로 앞인 a(첫째)로 가야 한다.
    // 시드가 없으면(activeValue=null) stepEnabledValue가 "활성이 없다"로 보고 ↑를
    // 끝(마지막 선택 가능한 옵션 = b, 둘째)에서 시작시켜 제자리에 머문다 — 고친 코드가
    // 아니면 이 값이 첫째가 아니라 둘째가 된다.
    it("마우스로 열면 현재 선택값에서 방향키가 이어진다 — 네이티브 select처럼", () => {
      render(<ControlledSelect initialValue="b" />);
      const trigger = screen.getByRole("button", { name: "항목" });

      fireEvent.click(trigger);
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowUp" });

      expect(document.activeElement).toBe(screen.getByRole("option", { name: "첫째" }));
    });

    it("Tab은 메뉴를 닫고 포커스를 트리거에 남긴다 — 문서 처음으로 튀지 않게", () => {
      render(<ControlledSelect initialValue="a" />);
      const trigger = screen.getByRole("button", { name: "항목" });
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      expect(document.activeElement).toBe(screen.getByRole("option", { name: "첫째" }));

      fireEvent.keyDown(screen.getByRole("listbox"), { key: "Tab" });

      expect(screen.queryByRole("listbox")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    it("옵션은 tab 순서에서 빠진다 — 활성 하나만 0이고 나머지는 -1", () => {
      // ARIA listbox 계약: 옵션이 개별적으로 tab 순서에 들어가면 안 된다.
      // 이게 깨지면 옵션 50개짜리 Select에서 다음 필드까지 Tab을 50번 눌러야 한다.
      // 여는 것만으로는 활성 옵션과 선택된 옵션이 같은 값(a/첫째)이라, tabIndex가
      // activeValue를 추적하는지 value(선택값)를 추적하는지 구분이 안 된다 — 두 로직이
      // 우연히 같은 카운트를 만든다. ↓를 한 번 더 눌러 활성을 둘째로 옮겨 둘을
      // 갈라놓아야, 0을 든 옵션이 실제로 활성(둘째)인지 확인할 수 있다.
      render(<ControlledSelect initialValue="a" />);
      fireEvent.keyDown(screen.getByRole("button", { name: "항목" }), { key: "ArrowDown" });
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });

      const allOptions = screen.getAllByRole("option");
      const tabIndexes = allOptions.map((option) => option.getAttribute("tabindex"));
      expect(tabIndexes.filter((value) => value === "0")).toHaveLength(1);
      expect(tabIndexes.filter((value) => value === "-1")).toHaveLength(OPTIONS.length - 1);

      // 개수만이 아니라 "누가" 0을 들고 있는지를 요소 동일성으로 확정한다 — 인덱스가
      // 아니라 실제 tabindex="0" 요소를 찾아, 그것이 활성 옵션(둘째)이어야지 선택된
      // 옵션(첫째)이면 안 된다고 못박는다.
      const activeOption = allOptions.find((option) => option.getAttribute("tabindex") === "0");
      expect(activeOption).toBe(screen.getByRole("option", { name: "둘째" }));
    });

    it("Escape는 값을 바꾸지 않고 닫으며 포커스를 트리거로 돌려준다", () => {
      const onChange = vi.fn();
      render(<Select ariaLabel="항목" value="a" options={OPTIONS} onChange={onChange} />);
      const trigger = screen.getByRole("button", { name: "항목" });
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });

      fireEvent.keyDown(document, { key: "Escape" });

      expect(screen.queryByRole("listbox")).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(trigger);
    });

    it("descendant 모드에서는 포커스가 트리거에 남고 aria-activedescendant가 가리킨다", () => {
      render(<Select ariaLabel="항목" value="a" options={OPTIONS} onChange={() => undefined} keyboardActiveMode="descendant" />);
      const trigger = screen.getByRole("button", { name: "항목" });
      trigger.focus();   // 실기기에서는 트리거에 포커스가 있어야 keydown이 도달한다 — fireEvent는 그 전제를 만들지 않는다

      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      fireEvent.keyDown(trigger, { key: "ArrowDown" });

      expect(document.activeElement).toBe(trigger);
      const activeId = trigger.getAttribute("aria-activedescendant");
      expect(activeId).toBeTruthy();
      expect(document.getElementById(activeId!)?.textContent).toBe("둘째");
    });

    it("descendant 모드에서 활성 옵션에 .active 클래스가 붙는다 — :focus-visible이 안 맞으므로", () => {
      render(<Select ariaLabel="항목" value="a" options={OPTIONS} onChange={() => undefined} keyboardActiveMode="descendant" />);
      fireEvent.keyDown(screen.getByRole("button", { name: "항목" }), { key: "ArrowDown" });

      expect(screen.getByRole("option", { name: "첫째" }).className).toContain("active");
    });

    // Escape·Tab·바깥 클릭·앵커 이동 스크롤은 전부 setOpen(false)만 하고 activeValue를
    // null로 되돌리지 않는다(choose()만 그렇게 한다) — 그래서 aria-activedescendant의
    // `&& open` 항이 없으면, 닫힌 뒤에도 activeIndex가 그대로 남아 이미 언마운트된
    // 옵션 id를 계속 가리키게 된다. 이 테스트는 그 가드 하나만 검증한다.
    it("descendant 모드에서 Escape로 닫으면 aria-activedescendant가 사라진다 — 언마운트된 id를 계속 가리키면 안 된다", () => {
      render(<Select ariaLabel="항목" value="a" options={OPTIONS} onChange={() => undefined} keyboardActiveMode="descendant" />);
      const trigger = screen.getByRole("button", { name: "항목" });
      trigger.focus();
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      expect(trigger.getAttribute("aria-activedescendant")).toBeTruthy();   // 열려 있는 동안은 가리킨다

      fireEvent.keyDown(document, { key: "Escape" });

      expect(screen.queryByRole("listbox")).toBeNull();
      expect(trigger.getAttribute("aria-activedescendant")).toBeNull();
    });
  });
});

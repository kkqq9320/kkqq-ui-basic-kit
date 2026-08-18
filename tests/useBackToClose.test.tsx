// @vitest-environment jsdom
//
// 뒤로가기가 뒤 페이지로 가는 대신 팝업을 닫는지. StrictMode에서 팝업이 열리자마자
// 닫혀 버리던 회귀도 여기서 고정한다.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useLayoutEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell, Dialog, Select, Sidebar } from "../src";
import { takeUnlandedBackCountForTest } from "../src/browser/popupDismiss";

const STACK_KEY = "__dsPopupStack";

// history.back()을 파일 전체에서 가로챕니다. 안 그러면 언마운트가 예약한 진짜
// back()이 0ms 뒤 — 즉 다음 테스트 도중 — 에 터져 그 테스트의 다이얼로그를 닫습니다.
//
// 기본 동작은 실제 브라우저의 history.back()을 흉내 낸다: 스택 맨 위를 하나 뽑고 그
// state로 popstate를 쏜다(진짜 자바스크립트에서 back()이 하는 일과 같은 순서). 예전엔
// 이게 순수 no-op이었는데, B1의 release-on-popstate 버그(실제 브라우저 검증으로 잡음 —
// 보고서의 "Fix: scrollRestoration never released" 참고)를 이 no-op은 전혀 잡아내지
// 못했다 — 코드가 popstate "전"에 되돌리든 "후"에 되돌리든 no-op 아래에서는 구분이
// 안 됐기 때문이다. 실제 이벤트 순서를 흉내 내야 그 버그가 되살아나면 테스트가 잡는다.
//
// 주의: 이 파일의 모든 테스트는 이제 이 기본값을 통해 "진짜 내비게이션"을 겪는다 —
// back()을 부르면 정말로 state가 바뀌고 정말로 popstate가 온다. 지금은 이 파일에서
// history.scrollRestoration 스텁을 설치하는 건 B1 describe 블록뿐이고, 그 블록의
// 테스트들은 이 기본 동작을 스스로 재정의해 가며 정확한 타이밍(진짜 시간차, 언마운트
// 등)을 만든다. 앞으로 이 파일에 스텁을 설치하는 테스트를 새로 추가한다면, 이 기본
// backSpy가 실제로 popstate를 쏜다는 것과, 그 popstate가 (스텁이 설치돼 있다면)
// scrollRestoration의 claim/release 리스너도 건드릴 수 있다는 걸 염두에 둬야 한다 —
// 더 이상 부작용 없는 no-op이 아니다.
let backSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.history.replaceState(null, "");
  backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {
    const remaining = stack().slice(0, -1);
    const state = remaining.length ? { [STACK_KEY]: remaining } : null;
    window.history.replaceState(state, "");
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  backSpy.mockRestore();
  // 이 파일의 테스트는 자기가 부른 back()을 반드시 popstate로 착지시켜야 한다.
  // unlandedBackCount는 모듈 스코프라 착지 안 한 값이 **다음 테스트로 넘어가고**, 그
  // 테스트의 "내가 맨 위인가" 판정(popupDismiss.ts의 effective 스택)을 조용히 틀리게 만든다.
  // 실측: back()을 no-op으로 스텁한 테스트가 1을 남겼고 다음 테스트가 1로 시작했다.
  // 조용히 리셋만 하면 그 결함이 영원히 안 보이므로 여기서 터뜨린다 — 이 단언이 깨지면
  // 범인은 방금 끝난 그 테스트다. take*는 읽으면서 0으로 되돌리므로, 실패하더라도
  // 그 뒤 테스트들이 연쇄로 무너지지는 않는다.
  expect(takeUnlandedBackCountForTest()).toBe(0);
});

function stack(): string[] {
  const value = (window.history.state as Record<string, unknown> | null)?.[STACK_KEY];
  return Array.isArray(value) ? (value as string[]) : [];
}

/** 사용자가 뒤로가기를 눌러 표식 하나가 빠진 상태로 돌아온 상황. */
function pressBack() {
  const remaining = stack().slice(0, -1);
  const state = remaining.length ? { [STACK_KEY]: remaining } : null;
  // React 밖에서 온 이벤트라 act로 감싸야 상태 갱신이 바로 반영됩니다.
  act(() => {
    window.history.replaceState(state, "");
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });
}

function Harness({ wrapper: Wrapper = ({ children }: { children: React.ReactNode }) => <>{children}</> }: { wrapper?: React.ComponentType<{ children: React.ReactNode }> }) {
  function Inner() {
    const [open, setOpen] = useState(true);
    return <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="분류 등록">
      <button type="button" onClick={() => setOpen(false)}>닫기</button>
    </Dialog>;
  }
  return <Wrapper><Inner /></Wrapper>;
}

// 모바일 드로어는 킷에서 가장 큰 오버레이인데(position:fixed, z-index 60, 자기 백드롭까지
// 있다) 뒤로가기 계약만 없었다. Dialog·Select·DateWheelPicker 셋은 전부 갖고 있다.
describe("모바일 사이드바 드로어 뒤로가기", () => {
  const BRAND = { title: "테스트" };
  const SECTIONS = [{ items: [{ id: "home", label: "홈" }] }];

  /** 데모와 같은 배선 — Sidebar와 AppShell **둘 다** mobileOpen을 받는다.
   * 표식이 두 번 쌓이는지 보려면 이 구조 그대로 렌더해야 한다. */
  function Drawer({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = useState(true);
    const close = () => { setOpen(false); onClose?.(); };
    return <AppShell mobileOpen={open} onMobileClose={close}
      sidebar={<Sidebar brand={BRAND} sections={SECTIONS} mobileOpen={open} onMobileClose={close} />}>
      <p>본문</p>
    </AppShell>;
  }

  it("드로어가 열려 있으면 history에 표식을 남긴다", () => {
    expect(stack()).toHaveLength(0);
    render(<Drawer />);
    expect(document.querySelector(".sidebar")?.getAttribute("data-mobile-drawer")).toBe("open");
    expect(stack()).toHaveLength(1);
  });

  // 이게 이 묶음의 핵심이다. Sidebar와 AppShell이 **둘 다** mobileOpen을 받으므로
  // 양쪽에 훅을 걸면 한 번 열 때 표식이 두 개 쌓이고, 서랍을 닫는 데 뒤로가기를 두 번
  // 눌러야 한다 — 사용자에게는 첫 번째 뒤로가기가 먹통으로 보인다. B2가 같은 계열의
  // 사고였다. 개수를 세는 대신 "정확히 한 번의 뒤로가기로 닫히는가"까지 본다.
  it("표식은 정확히 하나만 쌓인다 — 뒤로가기 한 번에 닫힌다", () => {
    render(<Drawer />);
    expect(stack()).toHaveLength(1);

    pressBack();
    expect(document.querySelector(".sidebar")?.hasAttribute("data-mobile-drawer")).toBe(false);
    expect(stack()).toHaveLength(0);
  });

  it("뒤로가기를 누르면 페이지가 아니라 드로어가 닫힌다", () => {
    const onClose = vi.fn();
    render(<Drawer onClose={onClose} />);

    pressBack();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".sidebar")?.hasAttribute("data-mobile-drawer")).toBe(false);
  });

  it("오버레이로 직접 닫으면 남긴 표식을 걷어낸다 — 뒤로가기 횟수가 밀리지 않는다", () => {
    vi.useFakeTimers();
    render(<Drawer />);
    expect(stack()).toHaveLength(1);

    // 이름으로는 못 고른다 — AppShell의 백드롭과 Sidebar 자신의 닫기 버튼이 접근성
    // 이름을 공유한다("사이드바 닫기"). 둘 다 같은 일을 하지만 별개의 요소다.
    const overlay = document.querySelector<HTMLElement>(".mobile-sidebar-overlay");
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);
    expect(document.querySelector(".sidebar")?.hasAttribute("data-mobile-drawer")).toBe(false);
    expect(backSpy).not.toHaveBeenCalled();   // 즉시가 아니라 예약된다
    vi.advanceTimersByTime(1);
    expect(backSpy).toHaveBeenCalledOnce();
  });

  it("닫힌 채로 렌더되면 표식을 남기지 않는다 — 대조군", () => {
    render(<AppShell mobileOpen={false} onMobileClose={() => undefined}
      sidebar={<Sidebar brand={BRAND} sections={SECTIONS} mobileOpen={false} onMobileClose={() => undefined} />}>
      <p>본문</p>
    </AppShell>);
    expect(stack()).toHaveLength(0);
  });
});

describe("다이얼로그 뒤로가기", () => {
  it("열리면 history에 표식을 하나 남긴다", () => {
    expect(stack()).toHaveLength(0);
    render(<Harness />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(stack()).toHaveLength(1);
  });

  it("뒤로가기를 누르면 페이지가 아니라 다이얼로그가 닫힌다", () => {
    render(<Harness />);
    expect(screen.getByRole("dialog")).toBeTruthy();

    pressBack();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("StrictMode에서 열자마자 닫히지 않는다", async () => {
    // effect가 mount → cleanup → mount로 두 번 도는 개발 모드 동작.
    // 정리 단계의 history.back()을 즉시 부르면 여기서 다이얼로그가 사라졌다.
    render(<Harness wrapper={StrictMode} />);
    expect(screen.getByRole("dialog")).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole("dialog")).toBeTruthy();
    // 표식은 두 번 쌓이지 않는다
    expect(stack()).toHaveLength(1);
  });

  it("직접 닫으면 남긴 표식을 걷어내 뒤로가기 횟수가 밀리지 않는다", () => {
    vi.useFakeTimers();
    render(<Harness />);
    expect(stack()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(backSpy).not.toHaveBeenCalled();   // 즉시가 아니라 예약된다
    vi.advanceTimersByTime(1);
    expect(backSpy).toHaveBeenCalledOnce();
  });

  it("뒤로가기로 닫혔을 때는 back을 또 부르지 않는다", () => {
    vi.useFakeTimers();
    render(<Harness />);

    pressBack();                    // 이미 history가 한 칸 돌아갔다
    vi.advanceTimersByTime(5);
    expect(backSpy).not.toHaveBeenCalled();
  });

  it("표식을 layout 단계에서 push 한다 (크롬이 뒤로가기에서 건너뛰지 않도록)", () => {
    // 크롬은 사용자 제스처 없이 추가된 history 항목을 뒤로가기에서 건너뜁니다.
    // useEffect는 페인트 이후 별도 태스크라 클릭 제스처 밖이고, useLayoutEffect는
    // 클릭과 같은 태스크 안입니다. 그 차이를 순서로 고정합니다:
    // 다이얼로그 뒤에 놓인 형제의 layout effect보다 push가 먼저여야 합니다.
    const order: string[] = [];
    const pushSpy = vi.spyOn(window.history, "pushState").mockImplementation(function (this: History, ...args) {
      order.push("push");
      return History.prototype.pushState.apply(this, args as Parameters<History["pushState"]>);
    });

    function LayoutProbe() {
      useLayoutEffect(() => { order.push("layout-sibling"); }, []);
      return null;
    }

    render(<>
      <Dialog open onClose={() => undefined} ariaLabel="분류 등록"><span>내용</span></Dialog>
      <LayoutProbe />
    </>);

    expect(order).toContain("push");
    expect(order.indexOf("push")).toBeLessThan(order.indexOf("layout-sibling"));
    pushSpy.mockRestore();
  });

  it("다이얼로그 안에서 드롭다운을 열면 뒤로가기가 드롭다운부터 닫는다", () => {
    // 이게 안 되면 뒤로가기 한 번에 다이얼로그가 통째로 닫혀 입력하던 내용이 날아간다.
    function DialogWithSelect() {
      const [open, setOpen] = useState(true);
      const [value, setValue] = useState("a");
      return <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="분류 등록">
        <Select ariaLabel="통화" value={value} options={[{ value: "a", label: "첫째" }, { value: "b", label: "둘째" }]} onChange={setValue} />
      </Dialog>;
    }
    render(<DialogWithSelect />);
    expect(stack()).toHaveLength(1);                       // 다이얼로그 표식

    fireEvent.click(screen.getByRole("button", { name: "통화" }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(stack()).toHaveLength(2);                       // + 드롭다운 표식

    pressBack();
    expect(screen.queryByRole("listbox")).toBeNull();       // 드롭다운만 닫힘
    expect(screen.getByRole("dialog")).toBeTruthy();        // 다이얼로그는 그대로

    pressBack();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("겹쳐 열면 표식이 쌓이고 뒤로가기가 위에서부터 닫는다", () => {
    function Two() {
      const [first, setFirst] = useState(true);
      const [second, setSecond] = useState(true);
      return <>
        <Dialog open={first} onClose={() => setFirst(false)} ariaLabel="첫째"><span>첫째</span></Dialog>
        <Dialog open={second} onClose={() => setSecond(false)} ariaLabel="둘째"><span>둘째</span></Dialog>
      </>;
    }
    render(<Two />);
    expect(stack()).toHaveLength(2);

    pressBack();
    expect(screen.queryByRole("dialog", { name: "둘째" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "첫째" })).toBeTruthy();

    pressBack();
    expect(screen.queryByRole("dialog", { name: "첫째" })).toBeNull();
  });
});

describe("B1: 킷 팝업이 열린 동안만 scrollRestoration을 manual로 바꾼다", () => {
  // jsdom은 history.scrollRestoration을 구현하지 않는다(`'scrollRestoration' in window.history`가
  // false). 그래서 게터/세터를 직접 흉내 내고, 세터를 스파이로 감싸 킷이 실제로 이 스텁을
  // 통해 값을 읽고 쓰는지 단정한다. Dialog.test.tsx의 installFakeVisualViewport와 같은 패턴.
  function installScrollRestorationStub(initial: ScrollRestoration) {
    let value: ScrollRestoration = initial;
    const setter = vi.fn((next: ScrollRestoration) => { value = next; });
    Object.defineProperty(window.history, "scrollRestoration", {
      configurable: true,
      get: () => value,
      set: setter,
    });
    return { setter, get value() { return value; } };
  }

  afterEach(() => {
    delete (window.history as unknown as { scrollRestoration?: unknown }).scrollRestoration;
  });

  it("팝업이 열려 표식이 push되면 manual이 된다", () => {
    const stub = installScrollRestorationStub("auto");
    render(<Harness />);
    expect(stub.value).toBe("manual");

    // 스택을 비워서 끝낸다 — 안 그러면 unmount가 예약한 실제 back()이 이 테스트 밖에서
    // 터지고, 모듈 스코프의 "누가 잡고 있는지" 상태가 다음 테스트로 새어 나간다.
    pressBack();
    expect(stack()).toHaveLength(0);
  });

  it("마지막 팝업이 버튼으로 닫히면 원래 값(auto)으로 돌아간다", () => {
    vi.useFakeTimers();
    const stub = installScrollRestorationStub("auto");
    render(<Harness />);
    expect(stub.value).toBe("manual");   // 열려 있는 동안은 manual이어야 한다

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    act(() => { vi.advanceTimersByTime(1); });   // 정리 단계의 지연된 back() 실행 시점
    expect(stub.value).toBe("auto");
  });

  it("복원은 back()이 실제로 이전 항목에 착지한(popstate) 뒤에만 일어난다", () => {
    // 실 기기 검증으로 잡은 회귀: history.scrollRestoration은 전역 스위치가 아니라
    // "지금 current인 항목"에 새겨지는 값이다. back()을 부르기 *직전*(아직 지금 항목이
    // current인 시점)에 복원해 버리면, 값은 떠나려는 이 항목에 찍히고 실제로 착지할
    // 이전 항목은 claim 때 새겨진 manual인 채로 영원히 남는다 — 스택은 0으로 비었는데
    // scrollRestoration은 manual에 멈춰 있는 증상으로 나타난다. 값만 비교하면(위 테스트들)
    // 이 버그를 못 잡는다 — 스텁은 "어느 항목에 찍혔는지" 구분할 수 없는 flat 변수라서,
    // 복원이 실제로는 popstate 전에 일어나도 최종 값은 우연히 똑같이 "auto"로 보인다.
    // 그래서 여기서는 값이 아니라 순서를 고정한다: back()이 실제로 항목을 옮기는 신호는
    // popstate뿐이므로, scrollRestoration을 쓰는 시점이 그 popstate "이후"여야 한다.
    vi.useFakeTimers();
    const order: string[] = [];
    let value: ScrollRestoration = "auto";
    Object.defineProperty(window.history, "scrollRestoration", {
      configurable: true,
      get: () => value,
      set: (next: ScrollRestoration) => { order.push(`set:${next}`); value = next; },
    });
    backSpy.mockImplementation(() => {
      const remaining = stack().slice(0, -1);
      const state = remaining.length ? { [STACK_KEY]: remaining } : null;
      order.push("navigate");   // back()이 실제로 이전 항목에 착지하는 순간(popstate 직전)
      window.history.replaceState(state, "");
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
    });

    render(<Harness />);
    order.length = 0;   // claim 이후, 닫기부터의 순서만 본다

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    act(() => { vi.advanceTimersByTime(1); });

    expect(order).toEqual(["navigate", "set:auto"]);
  });

  it("back()과 popstate 사이의 진짜 시간차 동안 다른 팝업이 열리면, 그동안은 복원되지 않는다", () => {
    // 리뷰로 잡은 회귀(Fix 2): { once: true }로 무조건 한 번 반응하는 리스너는 popstate가
    // 오기만 하면 스택이 진짜 비었는지 안 보고 되돌려 버렸다. history.back()은 비동기라
    // 호출과 popstate 도착 사이에 진짜 시간차가 있고, 그 사이 다른 팝업이 열리는 건
    // 터치에서는 흔한 경우지 예외가 아니다(B2와 같은 종류의 경쟁). 이 테스트는 그
    // 시간차를 실제로 만든다: back() 호출과 popstate 디스패치를 분리해서, 그 사이에
    // 두 번째 팝업을 진짜로 연다.
    vi.useFakeTimers();
    const stub = installScrollRestorationStub("auto");

    // back()을 진짜 "비동기"로 흉내 낸다: 호출 즉시 popstate를 쏘지 않고, 나중에
    // fireQueuedPopState()를 명시적으로 불러야만 착지하도록 미룬다. 목적지(state)도
    // 호출 시점이 아니라 착지 시점에 계산한다 — 실제 브라우저에서 back()은 "지금부터
    // 한 칸"이 아니라 "실제로 처리될 때의 current 기준 한 칸"이기 때문에, 그 사이
    // 우리가 pushState를 하면(바로 이 테스트가 재현하는 상황) 목적지가 달라진다.
    let fireQueuedPopState: (() => void) | null = null;
    backSpy.mockImplementation(() => {
      fireQueuedPopState = () => {
        const remaining = stack().slice(0, -1);
        const state = remaining.length ? { [STACK_KEY]: remaining } : null;
        window.history.replaceState(state, "");
        window.dispatchEvent(new PopStateEvent("popstate", { state }));
      };
    });

    function TwoDialogs() {
      const [a, setA] = useState(true);
      const [b, setB] = useState(false);
      return <>
        <Dialog open={a} onClose={() => setA(false)} ariaLabel="첫째">
          <button type="button" onClick={() => setA(false)}>첫째닫기</button>
        </Dialog>
        <button type="button" onClick={() => setB(true)}>둘째열기</button>
        <Dialog open={b} onClose={() => setB(false)} ariaLabel="둘째">
          <button type="button" onClick={() => setB(false)}>둘째닫기</button>
        </Dialog>
      </>;
    }

    render(<TwoDialogs />);
    expect(stub.value).toBe("manual");

    // 첫째를 버튼으로 닫는다 — 정리 단계가 지연된 back()을 예약한다.
    fireEvent.click(screen.getByRole("button", { name: "첫째닫기" }));
    act(() => { vi.advanceTimersByTime(1); });   // 예약된 back()이 "불리는" 시점

    expect(fireQueuedPopState).not.toBeNull();   // back()은 불렸다
    expect(stub.value).toBe("manual");           // 하지만 popstate는 아직 안 왔다 — 진짜 시간차

    // ★ 바로 이 틈에서 둘째를 연다.
    fireEvent.click(screen.getByRole("button", { name: "둘째열기" }));
    expect(screen.getByRole("dialog", { name: "둘째" })).toBeTruthy();
    expect(stub.value).toBe("manual");

    // 이제서야 첫째의 back()이 실제로 착지했다는 popstate가 온다. 착지한 항목의 state는
    // (실제 브라우저처럼) 착지 시점의 스택 기준으로 계산되므로 둘째의 표식을 여전히
    // 담고 있을 수 있다 — 어느 쪽이든 이 시점에 스택이 완전히 빈 게 아니라면 절대로
    // 되돌리면 안 된다는 게 핵심이다.
    act(() => { fireQueuedPopState!(); });

    // 핵심 단정: 고쳐지기 전 코드({once:true}, 무조건 되돌림)는 여기서 stub.value를
    // "auto"로 만들어 버렸다(회귀). 고쳐진 코드는 popstate의 실제 state를 다시 확인해
    // 아직 스택이 안 비었으면 기다려야 한다.
    expect(stub.value).toBe("manual");

    // 착지한 state({stack:[A]})에 둘째의 표식이 없으므로, 둘째는 이 popstate 한 번으로
    // (이미 존재하는 handlePopState 메커니즘을 통해) 화면에서 닫힌다 — B2와 같은 종류의
    // 경쟁이 만드는, 이미 알려진 부수 효과다(다이얼로그가 실제로는 그대로 있어야 하는지는
    // 이 B1 회귀와 별개 문제이고 여기서 다루지 않는다). 첫째의 표식만 "죽은 채" 남는다 —
    // 정확히 87b58b5가 이미 문서화한 "죽은 history 항목" 트레이드오프와 같은 모양이다.
    expect(screen.queryByRole("dialog", { name: "둘째" })).toBeNull();

    // 드레인: 죽은 첫째 표식은 물리적 뒤로가기 한 번으로 소비된다(§10에 이미 문서화된
    // 트레이드오프와 동일한 메커니즘) — 그래야 스택이 완전히 비고, 그제서야 복원된다.
    pressBack();
    expect(stack()).toHaveLength(0);
    expect(stub.value).toBe("auto");
  });

  it("대기 중인 release 리스너는 묻힌 표식 제거(replaceState, popstate 없음)에 영향받지 않는다", () => {
    // 87b58b5의 "묻힌 표식" 경로(맨 위가 아니면 back() 대신 replaceState만 한다)는
    // popstate를 아예 쏘지 않는다. 그 사이 다른 팝업(D)이 "마지막으로 닫히는 중"이라
    // release 리스너가 대기하고 있어도, 이 경로는 그 리스너와 아무 상호작용이 없어야
    // 한다 — 리스너를 건드리지도, 잘못 풀리게 하지도 않는다.
    vi.useFakeTimers();
    const stub = installScrollRestorationStub("auto");

    let fireQueuedPopState: (() => void) | null = null;
    backSpy.mockImplementation(() => {
      fireQueuedPopState = () => {
        const remaining = stack().slice(0, -1);
        const state = remaining.length ? { [STACK_KEY]: remaining } : null;
        window.history.replaceState(state, "");
        window.dispatchEvent(new PopStateEvent("popstate", { state }));
      };
    });

    function Popups() {
      const [d, setD] = useState(true);
      const [a, setA] = useState(false);
      const [b, setB] = useState(false);
      return <>
        <Dialog open={d} onClose={() => setD(false)} ariaLabel="D"><button type="button" onClick={() => setD(false)}>D닫기</button></Dialog>
        <button type="button" onClick={() => setA(true)}>A열기</button>
        <Dialog open={a} onClose={() => setA(false)} ariaLabel="A"><button type="button" onClick={() => setA(false)}>A닫기</button></Dialog>
        <button type="button" onClick={() => setB(true)}>B열기</button>
        <Dialog open={b} onClose={() => setB(false)} ariaLabel="B"><span>B내용</span></Dialog>
      </>;
    }

    render(<Popups />);
    expect(stub.value).toBe("manual");

    // D를 닫아 "마지막 팝업 닫힘" release 리스너를 건다 — popstate는 아직 안 왔다(대기 중).
    fireEvent.click(screen.getByRole("button", { name: "D닫기" }));
    act(() => { vi.advanceTimersByTime(1); });
    expect(fireQueuedPopState).not.toBeNull();
    expect(stub.value).toBe("manual");

    // 이 대기 상태에서 A, B를 연다(스택 = [D, A, B]). A를 버튼으로 닫으면 A는 맨 위(B)가
    // 아니므로 묻힌 표식 경로를 탄다 — replaceState만, popstate는 없다.
    fireEvent.click(screen.getByRole("button", { name: "A열기" }));
    fireEvent.click(screen.getByRole("button", { name: "B열기" }));
    expect(stack()).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "A닫기" }));
    act(() => { vi.advanceTimersByTime(1); });   // A의 정리 단계 — 묻힌 표식이라 replaceState만

    expect(stack()).toHaveLength(2);   // A만 빠졌다
    // 핵심 단정: popstate가 한 번도 안 왔으므로 D의 release 리스너는 아무 영향을 안 받았다.
    expect(stub.value).toBe("manual");

    // 드레인: D의 지연된 back()이 마침내 착지한다. 그 시점의 스택([D,B]) 기준으로 목적지를
    // 계산하므로 [D]에 착지한다 — B는 이 popstate로 화면에서 닫히고(위 테스트와 같은
    // 부수 효과), D의 표식만 죽은 채 남는다.
    act(() => { fireQueuedPopState!(); });
    expect(stub.value).toBe("manual");   // 아직 D 하나 남아 있다

    pressBack();
    expect(stack()).toHaveLength(0);
    expect(stub.value).toBe("auto");
  });

  it("컴포넌트가 popstate 도착 전에 언마운트돼도 release는 정상적으로 일어난다", () => {
    // "popstate가 영영 안 온다"는 실제 브라우저에는 없는 상황이다 — history.back()은
    // 같은 문서 안의 항목 이동이면 반드시 popstate를 쏜다. 진짜로 있을 수 있는 상황은
    // "그 popstate가 오기 전에 리액트 컴포넌트가 사라진다"이다. release 리스너는 리액트
    // effect cleanup이 아니라 모듈 스코프의 순수 window 리스너(scheduleReleaseOnDrain)라
    // 리액트 생애주기와 무관하다 — 그래서 컴포넌트가 통째로 사라진 뒤에 popstate가
    // 뒤늦게 도착해도 정상적으로 동작해야 한다.
    vi.useFakeTimers();
    const stub = installScrollRestorationStub("auto");

    // back()을 지연시켜(fireQueuedPopState) 그 사이에 컴포넌트를 언마운트할 시간을 번다.
    let fireQueuedPopState: (() => void) | null = null;
    backSpy.mockImplementation(() => {
      fireQueuedPopState = () => {
        const remaining = stack().slice(0, -1);
        const state = remaining.length ? { [STACK_KEY]: remaining } : null;
        window.history.replaceState(state, "");
        window.dispatchEvent(new PopStateEvent("popstate", { state }));
      };
    });

    const { unmount } = render(<Harness />);
    expect(stub.value).toBe("manual");

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    act(() => { vi.advanceTimersByTime(1); });   // release 리스너가 걸린다 — popstate는 아직 안 왔다
    expect(fireQueuedPopState).not.toBeNull();
    expect(stub.value).toBe("manual");

    unmount();   // 리액트 트리가 통째로 사라진다. release 리스너는 window에 달려 있어
    // 리액트 생애주기와 무관하므로 그대로 살아 있다. popstate는 여전히 안 왔다.
    expect(stub.value).toBe("manual");

    // popstate가 뒤늦게 (컴포넌트가 이미 사라진 뒤에) 도착한다 — 실제 브라우저라면 이건
    // back()을 부른 이상 반드시 일어난다. 리액트가 없어도 release는 정상 동작해야 한다.
    act(() => { fireQueuedPopState!(); });

    expect(stub.value).toBe("auto");
    expect(stack()).toHaveLength(0);
  });

  it("앱이 이미 manual로 둔 경우에도 manual로 남는다 (auto로 하드코딩하지 않는다)", () => {
    vi.useFakeTimers();
    const stub = installScrollRestorationStub("manual");
    render(<Harness />);
    expect(stub.value).toBe("manual");

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    act(() => { vi.advanceTimersByTime(1); });
    expect(stub.value).toBe("manual");
    // 값이 우연히 그대로인 게 아니라, 킷이 실제로 두 번(설정 + 복원) 썼는지까지 확인한다.
    expect(stub.setter).toHaveBeenCalledTimes(2);
    expect(stub.setter.mock.calls).toEqual([["manual"], ["manual"]]);
  });

  it("겹쳐 열리면 하나만 닫혀도 manual이고, 둘 다 닫혀야 복원된다", () => {
    vi.useFakeTimers();
    // 두 번째 닫기가 첫 번째 닫기 뒤의 실제로 줄어든 스택을 보게 하려면, back()이
    // 스택에서 진짜로 한 칸을 빼고 popstate를 쏘도록 흉내 내야 한다(B2 describe의 선례).
    backSpy.mockImplementation(() => {
      const remaining = stack().slice(0, -1);
      const state = remaining.length ? { [STACK_KEY]: remaining } : null;
      window.history.replaceState(state, "");
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
    });
    const stub = installScrollRestorationStub("auto");

    function Two() {
      const [first, setFirst] = useState(true);
      const [second, setSecond] = useState(true);
      return <>
        <Dialog open={first} onClose={() => setFirst(false)} ariaLabel="첫째">
          <button type="button" onClick={() => setFirst(false)}>첫째닫기</button>
        </Dialog>
        <Dialog open={second} onClose={() => setSecond(false)} ariaLabel="둘째">
          <button type="button" onClick={() => setSecond(false)}>둘째닫기</button>
        </Dialog>
      </>;
    }
    render(<Two />);
    expect(stub.value).toBe("manual");

    fireEvent.click(screen.getByRole("button", { name: "둘째닫기" }));
    act(() => { vi.advanceTimersByTime(1); });
    expect(stub.value).toBe("manual");   // 첫째가 아직 열려 있다

    fireEvent.click(screen.getByRole("button", { name: "첫째닫기" }));
    act(() => { vi.advanceTimersByTime(1); });
    expect(stub.value).toBe("auto");     // 이제 둘 다 닫혔다
  });

  it("물리적 뒤로가기로 스택이 비워질 때도 복원된다", () => {
    const stub = installScrollRestorationStub("auto");
    render(<Harness />);
    expect(stub.value).toBe("manual");

    pressBack();
    expect(stub.value).toBe("auto");
  });

  it("history.scrollRestoration이 없는 환경에서도 죽지 않는다", () => {
    // 스텁을 설치하지 않는다 — jsdom 기본값 그대로(속성 자체가 없다).
    expect("scrollRestoration" in window.history).toBe(false);
    expect(() => render(<Harness />)).not.toThrow();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(() => fireEvent.click(screen.getByRole("button", { name: "닫기" }))).not.toThrow();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("B3: 같은 커밋에서 겹친 팝업 두 개가 함께 닫히는 동시 정리 — 전체 브랜치 리뷰 마지막 Important finding", () => {
  function installScrollRestorationStub(initial: ScrollRestoration) {
    let value: ScrollRestoration = initial;
    const setter = vi.fn((next: ScrollRestoration) => { value = next; });
    Object.defineProperty(window.history, "scrollRestoration", {
      configurable: true,
      get: () => value,
      set: setter,
    });
    return { setter, get value() { return value; } };
  }

  afterEach(() => {
    delete (window.history as unknown as { scrollRestoration?: unknown }).scrollRestoration;
  });

  it("Select의 choose()가 onChange로 감싸는 Dialog까지 같이 닫으면, 두 표식 모두 back()으로 소비되고 scrollRestoration도 결국 auto로 복원된다", () => {
    // 원인: choose()(src/controls/Select.tsx)는 onChange를 부른 뒤 곧바로 setOpen(false)를
    // 부른다. 이 테스트의 onChange는 감싸는 Dialog도 같은 틱에서 닫으므로, Dialog와
    // Select 두 useBackToClose 인스턴스의 정리 effect가 "같은 커밋"에서 함께 도는
    // 동시 정리 상황을 만든다. 각자 window.setTimeout(0)으로 자기 정리를 예약하는데
    // (StrictMode 재마운트 취소용), 두 타이머 모두 같은 macrotask 배치에서 순서대로
    // 실행된다 — React가 자식 effect cleanup을 부모보다 먼저 돌리므로(임시 프로브로
    // 실측 확인) 안쪽(Select)이 항상 먼저 돈다.
    vi.useFakeTimers();
    const stub = installScrollRestorationStub("auto");

    // history.back()을 실제 브라우저처럼 "진짜 비동기"로 흉내 낸다: 호출 즉시
    // popstate를 쏘지 않고 큐에 쌓아 뒀다가, flushOneQueuedPopState()를 명시적으로
    // 불러야만 하나씩 착지한다(B1 describe의 fireQueuedPopState 패턴을 — 이번엔 두
    // 번 겹쳐 불릴 수 있으므로 — 큐로 일반화한 것). 목적지(state)는 호출 시점이
    // 아니라 착지 시점의 스택을 기준으로 계산한다(B1/B2와 동일 관례). 이렇게
    // 지연시켜야만 안쪽(Select)의 back()이 착지하기 전에 바깥(Dialog)의 정리
    // 타이머가 도는 "미착지 구간"이 실제로 생긴다 — 동기 스파이(파일 기본값의
    // backSpy)로는 이 창을 만들 수 없다.
    const queue: Array<() => void> = [];
    backSpy.mockImplementation(() => {
      queue.push(() => {
        const remaining = stack().slice(0, -1);
        const state = remaining.length ? { [STACK_KEY]: remaining } : null;
        window.history.replaceState(state, "");
        window.dispatchEvent(new PopStateEvent("popstate", { state }));
      });
    });
    function flushOneQueuedPopState() {
      const next = queue.shift();
      expect(next).toBeDefined();
      act(() => { next!(); });
    }

    function DialogWithSelect() {
      const [dialogOpen, setDialogOpen] = useState(true);
      const [value, setValue] = useState("a");
      return <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} ariaLabel="분류 등록">
        <Select ariaLabel="통화" value={value} options={[{ value: "a", label: "첫째" }, { value: "b", label: "둘째" }]} onChange={(next) => { setValue(next); setDialogOpen(false); }} />
      </Dialog>;
    }
    render(<DialogWithSelect />);
    expect(stack()).toHaveLength(1);   // 다이얼로그 표식
    expect(stub.value).toBe("manual");

    fireEvent.click(screen.getByRole("button", { name: "통화" }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(stack()).toHaveLength(2);   // + 드롭다운 표식

    // 옵션을 고르면 Select의 choose()가 onChange(다이얼로그도 같이 닫음) 뒤
    // setOpen(false)를 부른다 — Dialog와 Select 둘 다 이 한 번의 클릭으로, 같은
    // 커밋에서 닫힌다.
    fireEvent.click(screen.getByRole("option", { name: "둘째" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => { vi.advanceTimersByTime(1); });   // 두 정리 타이머 모두 실행되는 시점

    // 핵심 단정 1: back()이 "두 번" 불려야 한다 — 표식이 두 개였으니 실제 history
    // 항목도 두 개 소비돼야 한다. 고쳐지기 전 코드는 여기서 정확히 한 번만 부른다
    // (바깥이 안쪽 밑에 묻힌 것으로 착각해 replaceState 경로를 타기 때문이다 —
    // window.history.state가 아직 안쪽의 미착지 back()을 반영하지 못한 옛 값이라
    // 바깥은 자기 위에 안쪽이 있다고 오판한다) — 그러면 바깥 자신의 history 항목이
    // 하나 안 팝힌 채 남아, 나중에 물리적 뒤로가기 한 번이 아무것도 못 닫고
    // 소비된다(§10 위반: 버튼/선택으로 닫았는데 뒤로가기 횟수가 밀린다).
    expect(backSpy).toHaveBeenCalledTimes(2);
    expect(queue).toHaveLength(2);

    flushOneQueuedPopState();   // 안쪽(Select)의 back()이 착지
    expect(stub.value).toBe("manual");   // 아직 바깥 표식이 남아 있다 — 너무 일찍 풀리면 안 된다

    flushOneQueuedPopState();   // 바깥(Dialog)의 back()이 착지

    // 핵심 단정 2: 두 back() 모두 착지한 뒤에는 스택이 완전히 비고 scrollRestoration도
    // 정확히 "auto"로 복원돼야 한다. 고쳐지기 전 코드는 바깥이 replaceState 경로를
    // 타면서 release-on-drain 리스너를 한 번도 걸지 않으므로, 여기서 "manual"에
    // 영원히 멈춘 채로 남는다 — 사용자가 이 항목에 머무는 동안 스크롤 점프 보호
    // 전체가 조용히 죽는다.
    expect(stack()).toHaveLength(0);
    expect(stub.value).toBe("auto");
  });
});

describe("B2: A가 닫히며 B의 표식을 뽑는 문제", () => {
  const optionsX = [{ value: "x", label: "엑스" }];

  function TwoSelects() {
    const [a, setA] = useState("x");
    const [b, setB] = useState("x");
    return <>
      <Select ariaLabel="A" value={a} options={optionsX} onChange={setA} />
      <Select ariaLabel="B" value={b} options={optionsX} onChange={setB} />
    </>;
  }

  it("핵심 회귀: A가 바깥클릭으로 닫히는 사이 B가 열리면, A의 지연된 back()이 B의 표식을 뽑으면 안 된다", () => {
    vi.useFakeTimers();
    // 실제 브라우저의 history.back()을 흉내낸다: 스택 맨 위를 하나 뽑고 그 state로 popstate를
    // 쏜다. 고쳐진 코드라면 자기 표식이 맨 위가 아닐 때 애초에 이 함수를 부르지 않아야 한다.
    backSpy.mockImplementation(() => {
      const remaining = stack().slice(0, -1);
      const state = remaining.length ? { [STACK_KEY]: remaining } : null;
      window.history.replaceState(state, "");
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
    });

    render(<TwoSelects />);
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    expect(screen.getByRole("listbox", { name: "A" })).toBeTruthy();

    // 터치는 mousedown과 click을 거의 동시에(간격 0) 합성한다. B의 트리거를 누르면 A가
    // 바깥클릭으로 먼저 닫히고(정리 단계에서 back()이 예약됨), 이어서 B가 열리며 자기
    // 표식을 push한다 — A의 예약된 back()이 아직 실행되기 전이다.
    fireEvent.mouseDown(screen.getByRole("button", { name: "B" }));
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    expect(screen.queryByRole("listbox", { name: "A" })).toBeNull();   // A는 UI상 이미 닫힘
    expect(screen.getByRole("listbox", { name: "B" })).toBeTruthy();   // B는 열림

    act(() => { vi.advanceTimersByTime(1); });   // A의 지연된 back()이 실행되는 시점

    // 핵심: B가 열린 채로 남아야 한다 (보고된 "열렸다 즉시 닫힌다" 회귀)
    expect(screen.getByRole("listbox", { name: "B" })).toBeTruthy();
    // 메커니즘: 자기 표식이 스택 맨 위가 아니므로 back()을 아예 부르면 안 된다
    expect(backSpy).not.toHaveBeenCalled();
  });

  it("정상 경로 보존: 팝업 하나만 열렸다 버튼으로 닫히면 back()이 여전히 불린다", () => {
    vi.useFakeTimers();
    function OneSelect() {
      const [value, setValue] = useState("x");
      return <Select ariaLabel="단일" value={value} options={optionsX} onChange={setValue} />;
    }
    render(<OneSelect />);
    fireEvent.click(screen.getByRole("button", { name: "단일" }));
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "단일" }));   // 트리거를 다시 눌러 버튼으로 닫는다
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(backSpy).not.toHaveBeenCalled();   // 즉시가 아니라 예약된다

    act(() => { vi.advanceTimersByTime(1); });
    expect(backSpy).toHaveBeenCalledOnce();   // 자기 표식이 유일하게 맨 위이므로 여전히 불려야 한다
  });

  it("죽은 표식 흡수: A를 다시 열고 뒤로가기를 누르면 A가 닫히고 B는 그대로여야 한다", () => {
    vi.useFakeTimers();
    render(<TwoSelects />);

    // 핵심 회귀와 같은 시퀀스로 A를 소리 없이 닫는다.
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "B" }));
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    act(() => { vi.advanceTimersByTime(1); });   // A의 지연된 콜백 — 죽은 표식을 스택에서 지운다(또는 안 지운다)

    // A를 다시 연다. Select는 언마운트되지 않으므로 popupId는 처음과 동일하다.
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    expect(screen.getByRole("listbox", { name: "A" })).toBeTruthy();

    pressBack();

    // 방금 다시 연 A가 닫혀야 한다. 죽은 표식이 스택에 남아 있으면 이 뒤로가기가
    // 엉뚱하게 B를 닫혀버린다 — A는 예전 표식이 여전히 "맨 위"인 것처럼 보여 안 닫힌다.
    expect(screen.queryByRole("listbox", { name: "A" })).toBeNull();
    expect(screen.getByRole("listbox", { name: "B" })).toBeTruthy();
  });
});

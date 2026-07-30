// @vitest-environment jsdom
//
// 뒤로가기가 뒤 페이지로 가는 대신 팝업을 닫는지. StrictMode에서 팝업이 열리자마자
// 닫혀 버리던 회귀도 여기서 고정한다.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useLayoutEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Dialog, Select } from "../src";

const STACK_KEY = "__dsPopupStack";

// history.back()을 파일 전체에서 가로챕니다. 안 그러면 언마운트가 예약한 진짜
// back()이 0ms 뒤 — 즉 다음 테스트 도중 — 에 터져 그 테스트의 다이얼로그를 닫습니다.
let backSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.history.replaceState(null, "");
  backSpy = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
});

afterEach(() => { cleanup(); vi.useRealTimers(); backSpy.mockRestore(); });

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

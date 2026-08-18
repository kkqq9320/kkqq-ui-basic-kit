// @vitest-environment jsdom

/* `src/controls/undoStack.ts` — **한 항목이 한 조작**이라는 규칙 자체를 여기서 잽니다.
 *
 * 🔴 **컴포넌트 검사가 이미 있는데 왜 또 재는가.** `tests/DateWheelPicker.test.tsx`가
 * "휠 한 무리는 항목 하나"와 "Ctrl+Z가 마지막 조작을 되돌린다"를 잽니다. 그것들은
 * **이 스택이 픽커에 제대로 매여 있는가**를 재고, 여기서는 스택 자신의 계약을 잽니다 —
 * 상한 · 연속 중복 · 꼬리 시간 · 객체 안정성. 픽커를 통해서는 밟을 방법이 없거나
 * (50개 상한) 밟더라도 무엇이 틀렸는지 안 보이는 것들입니다.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useUndoStack } from "../src/controls/undoStack";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("undoStack", () => {
  it("쌓은 것을 역순으로 꺼낸다", () => {
    const { result } = renderHook(() => useUndoStack());
    result.current.push("a");
    result.current.push("b");
    expect([result.current.pop(), result.current.pop()]).toEqual(["b", "a"]);
  });

  it("비었으면 undefined를 돌려준다 — 되돌릴 것이 없다는 신호", () => {
    const { result } = renderHook(() => useUndoStack());
    expect(result.current.pop()).toBeUndefined();
  });

  /* 같은 값이 연달아 쌓이면 Ctrl+Z가 **아무 일도 안 하는 것처럼 보입니다** — 한 번
   * 눌러도 화면이 그대로라 사용자는 되돌리기가 고장난 줄 압니다. */
  it("같은 값을 연달아 쌓지 않는다", () => {
    const { result } = renderHook(() => useUndoStack());
    result.current.push("a");
    result.current.push("a");
    result.current.pop();
    expect(result.current.pop()).toBeUndefined();
  });

  it("사이에 다른 값이 끼면 같은 값도 다시 쌓는다 — 중복 제거는 연속일 때만", () => {
    const { result } = renderHook(() => useUndoStack());
    result.current.push("a");
    result.current.push("b");
    result.current.push("a");
    expect([result.current.pop(), result.current.pop(), result.current.pop()]).toEqual(["a", "b", "a"]);
  });

  /* 상한이 없으면 한 페이지에 여러 개 살아 있는 컨트롤이 각자 무한히 쌓습니다. */
  it("상한 50을 넘으면 가장 오래된 것부터 버린다", () => {
    const { result } = renderHook(() => useUndoStack());
    for (let n = 0; n < 51; n += 1) result.current.push(`v${n}`);
    const drained: (string | undefined)[] = [];
    for (let n = 0; n < 51; n += 1) drained.push(result.current.pop());
    expect(drained[49]).toBe("v1");     // 가장 아래에 남은 것
    expect(drained[50]).toBeUndefined(); // v0은 밀려났다
  });

  it("제스처 밖에서는 inGesture가 false다", () => {
    const { result } = renderHook(() => useUndoStack());
    expect(result.current.inGesture).toBe(false);
  });

  it("beginGesture는 제스처가 도는 동안 inGesture를 세운다", () => {
    const { result } = renderHook(() => useUndoStack());
    result.current.beginGesture("start");
    expect(result.current.inGesture).toBe(true);
  });

  it("endGesture가 그것을 내린다", () => {
    const { result } = renderHook(() => useUndoStack());
    result.current.beginGesture("start");
    result.current.endGesture();
    expect(result.current.inGesture).toBe(false);
  });

  /* 🔴 **이것이 이 파일의 이유입니다.** 드래그 서른 노치가 항목 서른 개가 되면
   * Ctrl+Z를 서른 번 눌러야 합니다. */
  it("한 제스처 안에서 beginGesture를 여러 번 불러도 항목은 하나다", () => {
    const { result } = renderHook(() => useUndoStack());
    result.current.beginGesture("start");
    result.current.beginGesture("moved-1");
    result.current.beginGesture("moved-2");
    result.current.pop();
    expect(result.current.pop()).toBeUndefined();
  });

  it("그 하나는 제스처가 **시작할 때**의 값이다 — 중간 값이 아니다", () => {
    const { result } = renderHook(() => useUndoStack());
    result.current.beginGesture("start");
    result.current.beginGesture("moved-1");
    expect(result.current.pop()).toBe("start");
  });

  it("endGesture 뒤의 새 제스처는 다시 쌓는다", () => {
    const { result } = renderHook(() => useUndoStack());
    result.current.beginGesture("first");
    result.current.endGesture();
    result.current.beginGesture("second");
    expect([result.current.pop(), result.current.pop()]).toEqual(["second", "first"]);
  });

  /* 휠에는 `pointerup`이 없습니다 — 끝을 시간으로 봅니다. */
  it("markTick 한 무리는 꼬리 시간이 지나기 전까지 한 제스처다", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUndoStack());
    result.current.markTick("start");
    act(() => { vi.advanceTimersByTime(199); });
    result.current.markTick("moved");
    expect(result.current.inGesture).toBe(true);
  });

  it("그 무리 전체가 항목 하나다", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUndoStack());
    result.current.markTick("start");
    act(() => { vi.advanceTimersByTime(199); });
    result.current.markTick("moved");
    result.current.pop();
    expect(result.current.pop()).toBeUndefined();
  });

  it("꼬리 시간이 지나면 제스처가 끝난다", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUndoStack());
    result.current.markTick("start");
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.inGesture).toBe(false);
  });

  /* 꼬리는 tick마다 **다시 놓입니다.** 안 그러면 첫 tick으로부터 200ms에 무리가
   * 잘려, 오래 굴린 휠이 항목 여럿이 됩니다. */
  it("꼬리는 tick마다 다시 놓인다 — 첫 tick 기준이 아니다", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUndoStack());
    result.current.markTick("start");
    act(() => { vi.advanceTimersByTime(150); });
    result.current.markTick("moved");
    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current.inGesture).toBe(true);
  });

  it("꼬리가 끝난 뒤의 markTick은 새 항목을 쌓는다", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUndoStack());
    result.current.markTick("first");
    act(() => { vi.advanceTimersByTime(200); });
    result.current.markTick("second");
    expect([result.current.pop(), result.current.pop()]).toEqual(["second", "first"]);
  });

  /* 주석이 "한 번만 만들면 된다"고 적고 있습니다. 매 렌더 새 객체면 이 값을 의존성에
   * 넣는 호출부가 생겼을 때 조용히 매 렌더 도는 이펙트가 됩니다. */
  it("돌려주는 객체는 렌더 사이에 같다", () => {
    const { result, rerender } = renderHook(() => useUndoStack());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("쌓은 것이 리렌더를 넘어 남는다", () => {
    const { result, rerender } = renderHook(() => useUndoStack());
    result.current.push("a");
    rerender();
    expect(result.current.pop()).toBe("a");
  });
});

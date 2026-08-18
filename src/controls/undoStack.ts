/* 값 되돌리기 스택 — **한 항목은 한 조작입니다.**
 *
 * 🔴 **`onChange` 한 번이 아닙니다.** 휠 피커는 화살표 한 번, 휠 한 칸, 드래그 한
 * 노치마다 `onChange`를 부릅니다. 그 단위로 쌓으면 서른 칸 끈 드래그가 항목 서른 개가
 * 되고 Ctrl+Z는 한 칸씩 되돌아옵니다 — 사용자가 "되돌리기"라고 부르는 것이 아닙니다.
 *
 * 그래서 **이어지는 제스처는 시작할 때 한 번만** 쌓습니다. 제스처의 경계를 새로 만들지
 * 않는 것이 요점입니다 — 호출부에 이미 있습니다(열의 `onPointerDown`/`onPointerUp`).
 * 그 자리에 `beginGesture`/`endGesture`만 겁니다. **휠만 "뗌"이 없어서** `markTick`이
 * 꼬리 타이머로 끝을 봅니다.
 *
 * ⚠️ 스택은 **되돌리기 전용입니다. 다시 하기(Ctrl+Shift+Z)는 없습니다** — 오너가 요청한
 * 것은 되돌리기 하나이고, 없는 기능을 예약해 두면 소비자 앱이 그 조합을 못 쓰면서
 * 아무도 안 씁니다. 이 결정의 대가는 릴리스 노트에 적혀 있습니다.
 *
 * ⚠️ **꺼낸 값을 어디에 쓰는지는 이 파일이 모릅니다.** `pop()`이 돌려주는 것이 전부이고,
 * 값을 되돌리는 일(그리고 그때 같이 되살릴 세션 상태)은 호출부의 몫입니다 — 휠 피커의
 * 경우 "이번 세션에 지운 적 있음" 표시가 거기 딸려 옵니다. 그것까지 이 파일이 알면
 * 되돌리기 스택이 아니라 휠 피커의 조각이 됩니다.
 */
import { useMemo, useRef } from "react";

/** 스택의 최대 길이. 한 항목이 한 조작이므로 50이면 한 세션에서 사람이 하는 조작을
 *  넉넉히 덮습니다. 무한히 쌓지 않는 이유는 이 스택을 쓰는 컨트롤이 소비자 페이지에
 *  여러 개 살아 있을 수 있어서입니다 — 각자 자기 스택을 듭니다. */
const UNDO_LIMIT = 50;

/** 뗌이 없는 제스처(휠) 한 무리를 한 조작으로 묶는 꼬리 시간. 휠에는 `pointerup`에
 *  해당하는 "뗌"이 없어 경계를 시간으로 볼 수밖에 없습니다 — 드래그·홀드와 달리
 *  여기만 타이머입니다. */
const GESTURE_TAIL_MS = 200;

export type UndoStack = {
  /** 제스처가 아닌 한 번짜리 조작을 쌓습니다. 같은 값을 연달아 쌓지 않습니다. */
  push(previous: string): void;

  /** 지금 제스처가 진행 중인가. 진행 중이면 호출부는 다시 쌓지 않습니다 — 이 판정을
   *  스택이 대신 해 주지 않는 이유는, "쌓을지 말지"가 호출부마다 다르기 때문입니다
   *  (붙여넣기·지우기는 제스처 중이어도 쌓아야 하는 별개의 조작입니다). */
  readonly inGesture: boolean;

  /** 이어지는 제스처의 시작. 처음 한 번만 쌓고, 두 번째부터는 아무 일도 안 합니다. */
  beginGesture(current: string): void;

  /** 제스처의 끝. `pointerup`처럼 명시적인 뗌이 있는 경로가 부릅니다. */
  endGesture(): void;

  /** 뗌이 없는 제스처의 한 칸. 꼬리 시간이 지나면 스스로 끝납니다. */
  markTick(current: string): void;

  /** 마지막 항목을 꺼냅니다. 비었으면 `undefined`. */
  pop(): string | undefined;
};

export function useUndoStack(): UndoStack {
  const stackRef = useRef<string[]>([]);
  const gestureRef = useRef(false);
  const tailRef = useRef<number | null>(null);

  /* 상태는 전부 ref이므로 이 객체는 한 번만 만들면 됩니다. 매 렌더 새로 만들면
   * 이 값을 의존성에 넣는 호출부가 생겼을 때 조용히 매 렌더 도는 이펙트가 됩니다. */
  return useMemo<UndoStack>(() => {
    function push(previous: string) {
      const stack = stackRef.current;
      if (stack[stack.length - 1] === previous) return;   // 같은 값을 두 번 쌓지 않습니다
      stack.push(previous);
      if (stack.length > UNDO_LIMIT) stack.shift();
    }

    function beginGesture(current: string) {
      if (!gestureRef.current) push(current);
      gestureRef.current = true;
    }

    function endGesture() { gestureRef.current = false; }

    return {
      push,
      get inGesture() { return gestureRef.current; },
      beginGesture,
      endGesture,
      /* ⚠️ **언마운트에서 꼬리 타이머를 걷지 않습니다.** 이 타이머가 하는 일은 불리언
       * 하나를 되돌리는 것뿐이라 사라진 컴포넌트에 아무 영향이 없습니다 — 홀드 타이머와
       * 다릅니다(그쪽은 `onChange`를 보내서 §4.2에 걸립니다). 안 걷는 것이 결정입니다. */
      markTick(current: string) {
        beginGesture(current);
        if (tailRef.current !== null) window.clearTimeout(tailRef.current);
        tailRef.current = window.setTimeout(() => { tailRef.current = null; endGesture(); }, GESTURE_TAIL_MS);
      },
      pop() { return stackRef.current.pop(); },
    };
  }, []);
}

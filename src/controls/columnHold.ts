/* 열을 길게 눌러 초기화 — **눌림을 시간으로 재는 장치.**
 *
 * 🔴 **이 파일의 계약은 상태 둘 × 출구 다섯의 격자입니다.**
 *
 * ```
 *                재무장   발동   취소   언마운트   비활성(팝오버 닫힘)
 *   holdRef        ✓       ✓      ✓        ✓            ✓
 *   holdingUnit    ✓       ✓      ✓        ✓            ✓
 * ```
 *
 * **모든 출구가 두 상태를 다 종단으로 몰아야 합니다.** 그게 전부입니다 — 한 칸이라도
 * 비면 결함이 되고, 실제로 **비활성 열이 비어 있었습니다**: 누른 채 Escape나 안드로이드
 * 뒤로가기로 취소하면 팝오버는 닫히고 값도 되돌아가는데 500ms 뒤에 초기화가 발동해
 * **값이 다시 바뀌었습니다**(2026-08-18 고침).
 *
 * ⚠️ **`active`가 왜 인자인가.** 이 파일은 팝오버를 모릅니다 — "지금 이 컨트롤이 제스처를
 * 받는 상태인가"만 압니다. 휠 피커는 거기에 `open`을 넘깁니다. 정리를 취소 함수가 아니라
 * **비활성 자체**에 거는 것이 요점입니다: 닫는 경로가 하나가 아니고(취소, `disabled`가
 * 켜져서 닫히는 것 …) 세는 방식은 셀 때마다 하나씩 빠집니다.
 *
 * ⚠️ **꺼낸 뒤 무엇을 할지는 이 파일이 모릅니다.** `onHold(unit)`이 전부이고, 초기화가
 * 무엇인지·클릭을 삼켜야 하는지는 호출부의 몫입니다.
 */
import { useEffect, useRef, useState } from "react";
import { type WheelUnit } from "../model/wheelModel";

/** 이만큼 누르고 있으면 발동합니다.
 *
 *  🔴 **CSS와 한 벌입니다** — `css/wheel-picker.css`의 `.wheel-column.holding::after`가
 *  `animation: wheel-hold 300ms linear 200ms forwards`(지연 200 + 성장 300 = 500)로
 *  진행 막대를 그립니다. 하나만 바꾸면 **막대가 다 찼는데 안 걸리거나, 걸렸는데 덜 찬 채
 *  사라집니다.** 검사가 CSS 쪽 문자열을 대조합니다.
 *
 *  이력: 오너가 처음 2초로 정했고(2026-08-13), 실기기에서 길다고 판단해 **500ms로
 *  내렸습니다**(오너 리포트 5차). ⚠️ 이 저장소 곳곳의 주석이 아직 "2초"·"2000ms"·"700ms"를
 *  말합니다 — 살아 있는 수는 여기와 CSS 둘뿐이고, 표기 정리는 별도 라운드입니다. */
const HOLD_MS = 500;

/** 이보다 많이 움직이면 누름이 아니라 끌기입니다 — 홀드를 끊습니다.
 *  ⚠️ 이 수는 스와이프의 `SWIPE_SLOP`(18)보다 **훨씬 작아야 합니다.** 홀드는 "가만히
 *  있는 것"이 조건이고, 스와이프 판정을 기다리면 그 사이에 발동해 버립니다. */
const MOVE_TOLERANCE = 4;

export type ColumnHold = {
  /** 지금 눌린 채 대기 중인 열. `.holding` 클래스를 붙일 자리입니다. */
  readonly holdingUnit: WheelUnit | null;

  /** 누름 시작. **살아 있는 홀드는 하나**라 앞선 대기를 먼저 끊습니다. */
  arm(unit: WheelUnit, pointerId: number, y: number): void;

  /** 대기를 끊습니다. 대기 중이 아니면 아무 일도 안 합니다. */
  cancel(): void;

  /** 같은 포인터가 임계보다 많이 움직였으면 끊습니다. 다른 포인터면 무시합니다
   *  — 멀티터치에서 두 번째 손가락의 움직임이 첫 홀드를 죽이면 안 됩니다. */
  cancelIfMoved(pointerId: number, y: number): void;
};

export function useColumnHold({ active, onHold }: { active: boolean; onHold: (unit: WheelUnit) => void }): ColumnHold {
  const holdRef = useRef<{ unit: WheelUnit; pointerId: number; y: number; timer: number } | null>(null);
  /* ⚠️ **누르고 있다는 표시는 상태입니다. `classList.add`가 아닙니다.** 열의 `className`은
   * React가 매 렌더 통째로 다시 쓰므로 직접 붙인 클래스는 다음 렌더에 조용히 사라집니다 —
   * 그리고 `pointerdown` 핸들러가 거의 언제나 렌더를 일으킵니다. 처음에 `classList`로
   * 붙였다가 검사가 잡았습니다. */
  const [holdingUnit, setHoldingUnit] = useState<WheelUnit | null>(null);

  function cancel() {
    const hold = holdRef.current;
    setHoldingUnit(null);
    if (!hold) return;
    window.clearTimeout(hold.timer);
    /* ⚠️ **이 줄은 오늘 관찰 가능한 차이를 안 만듭니다**(실측: 지워도 검사 전부 초록).
     * 그래도 남깁니다 — `holdRef.current`의 뜻이 *"지금 대기 중인 홀드"* 이고 이 줄이 그
     * 뜻을 참으로 만듭니다. 이제 그 뜻은 **이 모듈의 불변식**입니다. */
    holdRef.current = null;
  }

  function arm(unit: WheelUnit, pointerId: number, y: number) {
    /* 🔴 **살아 있는 홀드는 하나입니다.** `holdRef`가 싱글턴이고 `cancel`은 그것만 보므로,
     * 이 줄 없이 두 번째 누름이 덮어쓰면 앞 타이머는 **어떤 취소 경로로도 안 닿습니다** —
     * 두 손가락을 다 뗀 뒤에 발동해 아무도 안 누르는데 값이 바뀝니다. */
    cancel();
    setHoldingUnit(unit);
    const timer = window.setTimeout(() => {
      /* 위 `cancel`의 같은 줄과 같은 이유로 남깁니다 — 발동한 뒤에도 차 있으면
       * *"대기 중인 홀드"* 가 거짓이 됩니다. */
      holdRef.current = null;
      /* ⚠️ **발동하는 순간 표시를 끕니다 — 아직 손을 떼기 전입니다.** 초기화는 손가락이
       * 내려가 있는 채로 일어나므로(그것이 임계의 뜻입니다), 남겨 두면 사용자는 아직
       * 뭔가 진행 중이라고 읽습니다. 손 떼기가 대신 꺼 주긴 하지만 그건 나중입니다. */
      setHoldingUnit(null);
      onHold(unit);
    }, HOLD_MS);
    holdRef.current = { unit, pointerId, y, timer };
  }

  function cancelIfMoved(pointerId: number, y: number) {
    const hold = holdRef.current;
    if (hold && hold.pointerId === pointerId && Math.abs(y - hold.y) > MOVE_TOLERANCE) cancel();
  }

  /* **정리 하나가 출구 둘을 맡습니다** — 언마운트, 그리고 `active`가 바뀌는 순간.
   * React가 다음 이펙트 전에 앞 정리를 돌리므로, `active`가 꺼지면 그 정리가 끊습니다.
   *
   * ⚠️ **의존성 배열이 전부입니다.** 한동안 `[]`이었고, 그래서 언마운트만 맡고 **닫힘은
   * 아무도 안 맡았습니다** — 누른 채 Escape·뒤로가기로 취소하면 값이 되돌아간 뒤 500ms
   * 있다가 초기화가 발동했습니다(2026-08-18 고침).
   *
   * 🔬 처음 고칠 때 본문에 `if (!active) cancel();`을 같이 넣었는데 **변이로 재 보니
   * 잉여였습니다**(지워도 검사 전부 초록) — 앞 정리가 이미 그 일을 합니다. 지웠습니다.
   *
   * 언마운트 쪽은 **사라진 필드에 onChange를 보내는 자리**입니다(설계 스펙 §4.2). */
  useEffect(() => cancel, [active]);

  return { holdingUnit, arm, cancel, cancelIfMoved };
}

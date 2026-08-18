/* 열을 세로로 끌어 값을 굴리는 제스처 — **주인 없던 기록 하나에 주인을 준 파일.**
 *
 * 🔴 **이 파일의 계약은 기록 하나의 수명입니다.**
 *
 * ```
 *   생성 (건너뛸 수 있음)   begin — ± 버튼 위에서 시작한 누름은 아예 안 부릅니다
 *     ↓
 *   갱신                    move — 커밋했으면 기준점을 옮기고, 못 했으면 되돌립니다
 *     ↓
 *   판독 신원               내가 만든 기록인가 — **그리고 아니어도 파기는 합니다**
 *     ↓
 *   파기 (넷)               end(정상) · abort(브라우저가 뺏음) · preempt(홀드가 이김) ·
 *                           그리고 **열 밖 종료**(document 리스너)
 *     ↕
 *   DOM 그림자              .dragging + --wheel-drag-offset — 같은 수명을 React 밖에서 한 벌 더
 * ```
 *
 * 실패 모양이 전부 하나입니다 — **자기가 만들지 않은 기록을 읽은 제스처.** ± 버튼이
 * 거꾸로 가는 것도, 안 끈 열이 구르는 것도 같은 문장입니다.
 *
 * ⚠️ **"다음 `begin`이 어차피 덮어쓴다"에 기대면 안 됩니다** — ± 버튼 위에서 시작한 누름은
 * `startsOnStepControl`에서 걸러져 `begin`이 **안 불립니다.** 생성 자리는 건너뛸 수 있습니다.
 *
 * ⚠️ **클릭 억제는 이 파일의 것이 아닙니다** — 표식은 **열**의 것이고(제스처들은 쓰기만
 * 합니다) 여기서는 `onGesture`/`onGestureEnd`로 알리기만 합니다.
 */
import { useEffect, useRef, type RefObject } from "react";
import { type WheelUnit } from "../model/wheelModel";

/**
 * **탭과 스와이프를 가르는 유일한 수(px).** 이 거리 미만으로 움직였다 놓으면 탭이고
 * (커밋 없음 + 클릭 그대로 통과), 이상이면 스와이프입니다(놓을 때 한 칸 커밋 + 클릭 억제).
 *
 * **두 자리가 이 하나를 씁니다** — `moveSwipe`의 클릭 억제와 `finishSwipe`의 놓을 때 커밋.
 * 두 수가 갈라지면 그 사이가 **죽은 구간**이 됩니다: 커밋도 안 되는데 클릭은 막히는 거리라,
 * 손가락을 그만큼 움직인 사용자에게는 아무 일도 안 일어납니다.
 *
 * ⚠️ **여기를 작게 만들지 마세요.** 한동안 억제 쪽만 2px이었고, **마우스 클릭은 누르고 떼는
 * 사이에 2~3px, 터치 탭은 그보다 더 흔들리는 것이 정상**이라 실사용 클릭이 거의 다 걸렸습니다
 * (오너: "클릭해도 선택 안 되고 열만 활성화된다"; 실측 0px 선택됨 / 3px 안 됨 / 8px 안 됨).
 * 행은 휠 표면 그 자체라 `startsOnStepControl` 같은 대상 기반 예외를 쓸 수 없고, 거리로만
 * 가를 수 있습니다.
 *
 * 터치에서 18px이 충분히 관대한지는 **실기기에서 재야 합니다**(지금 값은 마우스 실측과
 * 놓을 때 커밋 임계값의 일치에서 나왔습니다).
 */
const SWIPE_SLOP = 18;

export type ColumnSwipe = {
  /** 열 위에서 누름이 시작됐다. */
  begin(unit: WheelUnit, pointerId: number, y: number, value: string): void;
  /** 포인터가 움직였다. */
  move(unit: WheelUnit, clientY: number, pointerId: number, buttons: number, column: HTMLElement): void;
  /** **정상 종료** — 손가락이 열 위에서 떨어졌다. */
  end(unit: WheelUnit, clientY: number, pointerId: number, column: HTMLElement): void;
  /** **비정상 종료** — 브라우저가 제스처를 뺏었다. `pointerup`이 안 오므로 `end`가 못 덮습니다. */
  abort(column: HTMLElement): void;
  /** **선점** — 같은 손가락의 다른 제스처(길게 누르기)가 이겼다. 유일하게 제스처 도중입니다. */
  preempt(): void;
};

export type ColumnSwipeOptions = {
  /** 제스처를 받는 상태인가. 꺼지면 열 밖 종료를 듣지 않습니다. */
  active: boolean;
  /** 열들이 사는 컨테이너 — 열 밖에서 끝났을 때 그 열을 다시 찾는 데 씁니다. */
  containerRef: RefObject<HTMLElement | null>;
  /** 한 칸 확정. 못 하면 `null`(경계에 막힘 · 격자가 열보다 큼). */
  commit(sourceValue: string, unit: WheelUnit, amount: number, motion: "wheel" | "none"): string | null;
  /** 이 열의 포인터 시퀀스를 제스처가 차지했다 — 뒤따르는 click을 삼켜 달라. */
  onGesture(): void;
  /** 제스처가 끝났다 — 억제를 놓아 달라. */
  onGestureEnd(): void;
};

/**
 * ± 버튼 위에서 시작한 누름인가. **그렇다면 스와이프가 아닙니다.**
 *
 * 열의 `onPointerDown`은 대상을 안 보고 `swipeRef`를 세웠고, 그래서 ± 버튼을 누른 채
 * 손이 조금만 흔들려도 `moveSwipe`의 `Math.abs(delta) > 2`가 서서 열의
 * `onClickCapture`가 그 클릭을 삼켰습니다. **마우스는 누르고 떼는 사이에 2~3px
 * 흔들리는 게 정상**이라 데스크톱에서 "± 버튼이 안 먹는다"로 나타납니다
 * (오너 리포트, 프레임 단위 재현: 가만히 클릭하면 4회 다 바뀌고 3px 움직이면 안 바뀜).
 *
 * ⚠️ **행 버튼(`.wheel-values button`)은 여기 넣으면 안 됩니다.** 휠 표면 150px이
 * 통째로 그 버튼들이라 스와이프가 죽습니다. ± 버튼만 빼는 근거는 그것이 휠 표면이
 * 아니라 **이산 컨트롤**이라는 것입니다 — 한 번 눌러 한 칸, 끄는 거리가 없습니다.
 */
export function startsOnStepControl(target: EventTarget | null) {
  return target instanceof Element && !!target.closest(".wheel-step");
}

export function useColumnSwipe({ active, containerRef, commit, onGesture, onGestureEnd }: ColumnSwipeOptions): ColumnSwipe {
  const swipeRef = useRef<{ unit: WheelUnit; y: number; pointerId: number; value: string; captured: boolean } | null>(null);

  function clearSwipeVisual(column: HTMLElement) {
    delete column.dataset.dragging;
    column.style.removeProperty("--wheel-drag-offset");
  }

  /* 스와이프는 30px 경계를 넘을 때마다 즉시 한 칸 커밋하고 나머지 거리는 손가락을
   * 계속 따라갑니다. 손을 뗄 때 한꺼번에 여러 칸이 튀는 것을 막습니다.
   *
   * 포인터 캡처는 target이 아니라 currentTarget(컬럼)에 겁니다. 한 칸 커밋될 때마다
   * 값 버튼들이 key 변경으로 다시 마운트되는데, 캡처를 그 버튼(target)에 걸었으면
   * 언마운트되며 캡처가 풀려, 포인터가 picker 밖으로 나가는 순간 move가 끊깁니다.
   * 컬럼은 슬라이드 내내 그대로라 캡처가 유지되고 밖에서도 계속 따라옵니다.
   *
   * **그리고 누를 때가 아니라 슬롭을 넘긴 첫 move에서 겁니다** — 이유는 아래 본문의
   * 해당 자리에 있습니다. 명시적으로 푸는 자리는 없습니다: 캡처는 `pointerup`·
   * `pointercancel`에서 브라우저가 암묵적으로 해제하고, 우리가 안 건 제스처에서
   * 해제를 부를 일도 없어야 하므로 `releasePointerCapture` 호출을 두지 않습니다. */
  function move(unit: WheelUnit, clientY: number, pointerId: number, buttons: number, column: HTMLElement) {
    if (buttons !== 1) return;
    const start = swipeRef.current;
    /* ⚠️ **`Number.isFinite` 둘만 감시자가 없습니다 — 그리고 그게 맞습니다**(2026-08-18 실측:
     * 지워도 검사 1654개 전부 초록). 무해해서 도달 불가인 것이 아니라 **도달 불가라서
     * 무해**합니다: `clientY`는 `MouseEventInit`의 restricted double이라 브라우저도 스크립트도
     * 비유한 값을 실을 수 없습니다(`TypeError: … not a finite floating-point value`).
     * 감시자를 만들면 **브라우저가 만들 수 없는 이벤트를 조립하는 변화 감지기**가 됩니다.
     *
     * 지우지는 마세요 — NaN이 한 번이라도 들어오면 `--wheel-drag-offset: NaNpx`가 되어
     * `translateY(calc(...))` 전체가 무효가 되고 값 컨테이너가 30px 튑니다.
     *
     * ⚠️ **`finishSwipe`의 같은 모양 가드는 성질이 다릅니다** — 그쪽은 비교만 감싸므로 진짜
     * 등가입니다. 한 덩어리로 묶어 판단하지 마세요. */
    if (!start || start.unit !== unit || start.pointerId !== pointerId || !Number.isFinite(start.y) || !Number.isFinite(clientY)) return;
    let delta = clientY - start.y;
    // **여기가 "이 제스처는 탭이 아니라 드래그다"라고 정하는 한 자리입니다.** 클릭 억제와
    // 포인터 캡처가 **같은 판정**을 씁니다.
    //
    // ⚠️ **캡처를 `pointerdown`에서 걸면 안 됩니다.** 캡처는 드래그를 위한 장치인데 누름은
    // 아직 드래그가 아닙니다. 걸어 두면 이후 포인터 이벤트가 **열로 리타겟**되어,
    // `mousedown`은 행에 `mouseup`은 열에 도착하고 브라우저가 `click`을 **공통 조상인 열**에
    // 발생시킵니다 — **행의 `onClick`이 호출될 수가 없습니다.** 오너 실기기 TRACE가 그것을
    // 잡았습니다(pointerdown/mousedown target=button, pointerup/mouseup/click
    // target=section.wheel-column, 그 사이 offset은 59프레임 내내 0px).
    //
    // ⚠️ **대상은 그대로 열(`currentTarget`)입니다. 바꾼 것은 시점뿐입니다.** 행(`target`)에
    // 걸면 한 칸 커밋마다 행이 리마운트되면서 캡처가 풀려, 포인터가 픽커 밖으로 나가는 순간
    // move가 끊깁니다. 휠 표면 150px이 통째로 행 버튼이라 "행은 캡처하지 않는다"는 방식도
    // 같은 이유로 안 됩니다 — 모든 스와이프가 캡처를 잃습니다.
    //
    // 커밋 분기보다 **앞**에 둡니다. 한 프레임에 30px 넘게 뛰면 아래에서 delta가 잔여로
    // 줄어드는데, 판정은 **손가락이 실제로 간 거리**로 해야 합니다.
    if (Math.abs(delta) >= SWIPE_SLOP) {
      onGesture();
      if (!start.captured && typeof column.setPointerCapture === "function") {
        column.setPointerCapture(pointerId);
        start.captured = true;
      }
    }
    if (Math.abs(delta) >= 30) {
      const direction = delta < 0 ? 1 : -1;
      // **드래그 중 커밋은 휠 이동 애니메이션을 재생하지 않습니다.** 손가락이 이미
      // 컨테이너를 끌고 있으므로 210ms 슬라이드는 **두 번째 모션**이고, 둘이 싸웁니다 —
      // 설계 스펙 §6.1이 타이핑에 대해 내린 판단과 같은 근거입니다("타이핑은 휠 이동이
      // 아니다"). 오너 실기기 트레이스(2026-08-10)가 그 싸움을 두 가지로 잡았습니다:
      // 커밋 직후 delta가 0~2px이 되는 프레임에 `.dragging`이 빠지면서 슬라이드가
      // `from`(`translateY(-45px)`, `opacity: .58`)으로 한 프레임 번쩍이고,
      // 리마운트된 액센트 행에서 230ms `wheel-selected-pop`이 매 커밋마다 처음부터
      // 다시 시작합니다 — 커밋 간격이 100~150ms이라 그 팝은 **끝나는 일이 없습니다.**
      //
      // **CSS로 끄지 않고 여기서 안 붙이는 이유:** `.dragging`은 컨테이너만 덮고
      // 자식 버튼은 안 덮지만, 선택자를 버튼까지 넓혀도 같은 구멍이 남습니다 —
      // `.dragging`은 `Math.abs(offset) > 2`로 켜지므로 **커밋 직후 한 프레임 빠지고,
      // 측정된 번쩍임이 정확히 그 프레임입니다.** 그래서 CSS는 그대로 두고
      // `moving-*`을 안 붙입니다.
      //
      // ⚠️ **여기서 안 붙이는 것만으로는 모자랍니다.** 열이 앞선 커밋에서 받은 `moving-*`을
      // 아직 달고 있으면 슬라이드는 여전히 무장돼 있고, `.dragging`이 빠지는 프레임에
      // **리마운트 없이도** 새로 시작합니다. 그래서 스와이프가 **시작될 때** 그 열의 모션을
      // 비웁니다 — `columnMotions.clear`에 측정값이 있습니다.
      const next = commit(start.value, unit, direction, "none");
      if (next) {
        start.value = next;
        start.y += direction > 0 ? -30 : 30;
        onGesture();
        delta = clientY - start.y;
      } else {
        start.y = clientY;
        delta = 0;
      }
    }
    // **화면은 손가락의 절반만 움직입니다**(오너 실기기 판정: "움직이는 px을 반으로").
    // 클램프만 낮추지 않고 감쇠로 하는 이유: 클램프는 그 위 구간을 **정지**시키므로
    // 실기기에서 잰 데드존(최대 102ms)이 오히려 커집니다. 감쇠는 손가락 전 구간을 화면에
    // 대응시켜 그 구간이 아예 없습니다.
    //
    // ⚠️ **트레이드오프를 알고 고른 값입니다.** 값 V의 화면 위치는 `p - 30 + offset`이고
    // 커밋 직전/직후로 재면:
    //
    //     감쇠 없음, 클램프 24   p-6  -> p    6px 점프,  따라오는 거리 24px
    //     감쇠 0.5,  클램프 15   p-15 -> p   15px 점프,  따라오는 거리 15px   ← 지금
    //     감쇠 없음, 클램프 30   p    -> p    점프 없음,  따라오는 거리 30px
    //
    // **따라 내려가는 거리를 줄이면 커밋 순간의 점프가 커집니다.** 셋 중 어느 것도 둘 다
    // 잡지 못합니다. 둘 다 잡는 모델은 하이라이트 교대(액센트를 뷰포트 중앙에 가장 가까운
    // 행에 주는 것)뿐이고, 오너가 실기기 A/B에서 **기각했습니다**("오히려 더 어색하다").
    //
    // 클램프 15는 기하가 아니라 **커밋 경계 30 x 감쇠 0.5**입니다. 커밋이 먼저 일어나므로
    // 보통 경로에서는 물리지 않고, 한 프레임에 30px 넘게 뛸 때만 물립니다. 프리로드가
    // 감당하는 기하 상한(±30, 값 컨테이너 210px - 뷰포트 150px - 기본 translateY -30px)
    // 안쪽이라 뷰포트 끝에 빈 띠가 생기지 않습니다.
    const offset = Math.max(-15, Math.min(15, delta * 0.5));
    if (Math.abs(offset) > 2) column.dataset.dragging = "";
    else delete column.dataset.dragging;
    column.style.setProperty("--wheel-drag-offset", `${offset}px`);
  }

  function end(unit: WheelUnit, clientY: number, pointerId: number, column: HTMLElement) {
    const start = swipeRef.current;
    swipeRef.current = null;
    clearSwipeVisual(column);
    if (!start || start.unit !== unit || start.pointerId !== pointerId) { onGestureEnd(); return; }
    if (Number.isFinite(start.y) && Number.isFinite(clientY)) {
      const delta = clientY - start.y;
      if (Math.abs(delta) >= SWIPE_SLOP) {
        onGesture();
        // 놓을 때의 커밋은 기본값(`"wheel"`)입니다. 손가락이 떠난 뒤의 **이산적인**
        // 착지라 슬라이드가 맞는 모션이고, `clearSwipeVisual`이 `.dragging`을 이미
        // 지웠으므로 정상 재생됩니다 — 위 드래그 중 커밋과 다른 상황입니다.
        commit(start.value, unit, delta > 0 ? -1 : 1, "wheel");
      }
    }
    onGestureEnd();
  }

  /* 🔴 **스와이프의 네 번째 출구 — 시퀀스가 열 밖에서 끝났다.**
   *
   * 나머지 셋(열의 `onPointerUp` · 열의 `onPointerCancel` · 홀드의 선점)은 **전부 시퀀스가
   * 그 열 위에서 끝날 것을 요구합니다.** 마우스에는 암묵 포인터 캡처가 없고 명시 캡처는
   * 세로 `SWIPE_SLOP`을 넘겨야 걸리므로, **가로로 끌어 열 밖에서 떼면** 어느 것도 안 돕니다.
   *
   * 남은 `swipeRef`를 다음 제스처가 읽습니다. 밟는 법과 결과(실측):
   *
   *     열을 누른 채 옆으로 끌어 밖에서 뗀다 → 같은 열의 `다음` 버튼을 누른다
   *       ↳ 연도가 **거꾸로 두 칸** 가고 그 클릭까지 삼켜집니다.
   *
   * ± 버튼의 pointerdown은 `startsOnStepControl`에서 조기 반환하므로 낡은 기록을 **덮어쓰지도
   * 않고**, 뒤이은 pointermove가 그 기록으로 커밋합니다. 그래서 *"다음 `pointerdown`이 어차피
   * 덮어쓴다"* 에 기댈 수 없습니다 — **생성 자리는 건너뛸 수 있습니다.**
   *
   * ⚠️ **열 위에서 끝난 것은 여기서 손대지 않습니다.** 먼저 비우면 `finishSwipe`가 `!start`로
   * 빠져 **놓을 때의 커밋이 사라집니다.** 대상 검사가 그 순서 의존을 없앱니다.
   *
   * ⚠️ 다른 열 위에서 끝난 경우도 여기서 안 잡습니다 — 그 열의 `finishSwipe`가 신원 가드보다
   * **먼저** `swipeRef`를 비우므로 파기는 이미 보장됩니다(그 순서가 계약의 일부입니다). */
  useEffect(() => {
    if (!active) return;
    function abandonSwipe(event: PointerEvent) {
      const start = swipeRef.current;
      if (!start || start.pointerId !== event.pointerId) return;
      if (event.target instanceof Element && event.target.closest(".wheel-column")) return;
      swipeRef.current = null;
      const column = containerRef.current?.querySelector(`.wheel-column[data-unit="${start.unit}"]`);
      if (column instanceof HTMLElement) clearSwipeVisual(column);
      onGestureEnd();
    }
    document.addEventListener("pointerup", abandonSwipe);
    document.addEventListener("pointercancel", abandonSwipe);
    return () => {
      document.removeEventListener("pointerup", abandonSwipe);
      document.removeEventListener("pointercancel", abandonSwipe);
    };
  }, [active]);

  return {
    begin(unit, pointerId, y, value) { swipeRef.current = { unit, y, pointerId, value, captured: false }; },
    move,
    end,
    /* 브라우저가 뺏은 제스처 — 기록과 그림자를 걷고 억제를 놓아 줍니다. 커밋은 없습니다. */
    abort(column) { swipeRef.current = null; clearSwipeVisual(column); onGestureEnd(); },
    /* 홀드가 이겼습니다. 그림자는 홀드 쪽이 자기 일을 하며 남기지 않으므로 기록만 버립니다. */
    preempt() { swipeRef.current = null; },
  };
}
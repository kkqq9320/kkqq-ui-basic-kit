/* 열의 휠 이동 모션 — **"이 열이 방금 움직였다"를 어떻게 그리는가.**
 *
 * 상태 하나(`Record<WheelUnit, ColumnMotion>`)와 그것을 미는 세 가지가 전부입니다:
 * 커밋이 `mark`, 새 드래그의 시작이 `clear`, 팝오버가 닫히는 것이 `stopAll`.
 *
 * ⚠️ **CSS와 짝입니다.** `moving-next`·`moving-previous` 클래스와 값 컨테이너의
 * `key`(`${unit}-${sequence}`)를 호출부가 그립니다 — 이 파일은 무엇을 그릴지만 정합니다.
 */
import { useState } from "react";
import { type WheelUnit } from "../model/wheelModel";

/**
 * **필드 셋이 서로 다른 것을 몰고 있고, 그게 요점입니다.**
 *
 * - `sequence` — 값 컨테이너의 `key`(`${unit}-${sequence}`)를 만듭니다. 바뀌면 행
 *   일곱 개가 **리마운트**되고, 그 리마운트가 슬라이드를 처음부터 재생시킵니다.
 *   뜻은 "값이 바뀌었으니 다시 재생하라"입니다. **커밋할 때만 올립니다.**
 * - `playing` — `moving-*` 클래스를 붙일지입니다. 뜻은 "재생할 슬라이드가 있다"이고,
 *   CSS는 이 클래스로 애니메이션을 **무장**합니다.
 * - `direction` — 어느 쪽 키프레임인지.
 *
 * ⚠️ **`playing`을 따로 두지 않고 `sequence`가 클래스까지 몰게 하면 안 됩니다.**
 * 한동안 className이 `sequence ? moving-${direction} : ""`였고, 그래서 무장을 해제하려면
 * `sequence`를 0으로 되돌려야 했는데 **그것도 key 변경이라 리마운트를 일으켰습니다.**
 * 결과: 스와이프 pointerdown이 행을 갈아치워, mousedown을 받은 노드가 mouseup 전에
 * 사라지고 브라우저가 `click`을 공통 조상으로 리타기팅해 **행 클릭이 죽었습니다**
 * (오너 리포트 "7일 때 9를 눌러도 안 바뀐다"; 무장된 열에서만이라 한 번 걸러 한 번씩).
 * 무장 해제는 클래스만 끄고 key는 그대로 두어야 합니다.
 */
export type ColumnMotion = { sequence: number; direction: "next" | "previous"; playing: boolean };

export type ColumnMotions = {
  /** 이 열이 지금 무엇을 그려야 하는가. */
  of(unit: WheelUnit): ColumnMotion;

  /** 한 칸 커밋했다. `amount`가 0이면 아무 일도 안 합니다 — 안 움직인 것이니까요. */
  mark(unit: WheelUnit, amount: number): void;

  /** 이 열의 무장을 푼다(`sequence`는 그대로). 새 드래그가 시작될 때 부릅니다. */
  clear(unit: WheelUnit): void;

  /** 모든 열의 무장을 푼다. 팝오버가 닫히는 것이 유일한 호출부입니다. */
  stopAll(): void;
};

/* 시·분·초 세 키는 날짜 전용 픽커에서 아무 열도 만들지 않지만, `Record<WheelUnit, …>`가
 * 여섯 키를 다 요구하므로 초기값에 채워 둡니다 — 안 채우면 tsc가 거절합니다. */
const IDLE: ColumnMotion = { sequence: 0, direction: "next", playing: false };

export function useColumnMotions(): ColumnMotions {
  const [motions, setMotions] = useState<Record<WheelUnit, ColumnMotion>>({
    year: IDLE, month: IDLE, day: IDLE, hour: IDLE, minute: IDLE, second: IDLE,
  });

  return {
    of: (unit) => motions[unit],

    mark(unit, amount) {
      if (!amount) return;
      setMotions((current) => ({
        ...current,
        [unit]: { sequence: current[unit].sequence + 1, direction: amount > 0 ? "next" : "previous", playing: true },
      }));
    },

    /**
     * **새 드래그가 시작됐다는 것은 애니메이션할 휠 이동이 없다는 뜻입니다.**
     *
     * `mark`는 sequence를 **올리기만** 하고 아무도 0으로 되돌리지 않습니다. 열의
     * className이 `sequence ? moving-${direction}`이던 시절, 한 번이라도 커밋한 열은 그
     * 클래스를 계속 달고 있었고 — 그 클래스가 210ms 슬라이드를 **무장**시킵니다.
     * `.dragging`이 `animation: none !important`로 무음 처리하지만 그것은
     * `Math.abs(offset) > 2`로 켜지므로 커밋 직후 한 프레임 빠지고, 그 프레임에
     * 애니메이션이 **리마운트 없이** 새로 생겨 `from`을 그립니다. 실브라우저
     * `getAnimations()`로 쟀습니다: `.dragging`을 붙이면 `[]`, 떼면 `currentTime: 0`짜리가
     * 새로 생기며 computed transform이 `matrix(0.975, 0, 0, 0.975, 0, -45)`가 됩니다.
     * 그래서 **두 번째 스와이프부터** 번쩍임이 돌아왔습니다 — 무장시킨 것은 바로 앞
     * 스와이프의 놓을 때 커밋입니다.
     *
     * 여기서 비우면 드래그 내내 `moving-*`이 **아예 안 붙으므로**, `.dragging`이 어떻게
     * 토글되든 만들어질 애니메이션이 없습니다. 놓을 때의 커밋이 다시 무장시키므로
     * **착지 슬라이드는 그대로 남습니다**(대조군이 지킵니다).
     *
     * 이미 꺼져 있으면 같은 객체를 돌려주어 리렌더를 만들지 않습니다.
     *
     * ⚠️ **`playing`만 끕니다. `sequence`는 건드리지 않습니다 — 그게 이 함수의 요점입니다.**
     * 처음 판에서는 `sequence`를 0으로 되돌렸고, className이 `sequence ? …`였으니 그것이
     * 무장 해제 방법이었습니다. 그런데 `sequence`는 값 컨테이너의 key이기도 해서 **무장
     * 해제가 곧 리마운트**였고, pointerdown이 행 일곱 개를 갈아치웠습니다. mousedown을 받은
     * 노드가 mouseup 전에 사라지면 브라우저는 `click`을 공통 조상으로 리타기팅하므로 행의
     * `onClick`이 안 돕니다 — 오너 리포트 "7일 때 9를 눌러도 안 바뀐다"가 그것이고,
     * 무장된 열에서만 그러므로 **한 번 걸러 한 번씩** 실패했습니다(코디네이터 실브라우저
     * 실측: 무장 `isConnected: false` 값 안 바뀜 / 비무장 살아 있고 값 바뀜 / 다시 무장
     * 안 바뀜). 위 `ColumnMotion` 타입 주석에 그 셋의 분업이 적혀 있습니다.
     *
     * **`.dragging`을 제스처 전체에 거는 안을 기각한 이유**(같은 구멍을 겨냥한 다른
     * 후보였습니다): 그쪽은 무장을 **무음 처리만** 하므로 `.dragging`을 떼는 순간
     * 애니메이션이 **다시 만들어집니다** — 번쩍임이 드래그 중에서 **놓는 순간으로 옮겨갈**
     * 뿐입니다(같은 측정: 붙이면 `[]`, 떼면 `currentTime: 0`짜리가 새로 생깁니다).
     * 여기서는 무장 자체를 지우므로 다시 만들어질 것이 없습니다. **진행 중이던 애니메이션을
     * pointerdown에서 끊는 것은 두 안이 같습니다** — 그건 새 제스처가 앞 모션을 대체하는
     * 것이라 맞습니다.
     */
    clear(unit) {
      setMotions((current) => (current[unit].playing ? { ...current, [unit]: { ...current[unit], playing: false } } : current));
    },

    /**
     * **이동 신호는 팝오버가 닫힐 때 꺼집니다.** `mark`는 `playing`을 켜기만 하고, 끄는
     * 것은 스와이프 시작(`clear`)뿐이었습니다. 그래서 ±로 한 칸 옮긴 열은 그 클래스를
     * **세션 내내** 달고 있었고, 팝오버는 닫힐 때 언마운트되므로 **다시 열 때 새 노드에서
     * 슬라이드가 처음부터 재생**됐습니다 — 아무것도 안 움직인 열림에서 "값이 움직였다"가
     * 재생된 것입니다. 오너가 그것을 기능으로 보고 "다른 픽커에도 적용해 달라"고 했는데
     * (진짜 진입 애니메이션은 `css/wheel-picker.css`의 `wheel-enter`가 따로 맡습니다),
     * 신호로서는 거짓말이었습니다.
     *
     * ⚠️ `sequence`는 건드리지 않습니다 — 그것은 값 컨테이너의 key이고, 여기서 0으로
     * 되돌리면 위 `clear` 주석의 리마운트 결함이 그대로 돌아옵니다.
     */
    stopAll() {
      setMotions((current) => (Object.values(current).some((motion) => motion.playing)
        ? {
            year: { ...current.year, playing: false }, month: { ...current.month, playing: false }, day: { ...current.day, playing: false },
            hour: { ...current.hour, playing: false }, minute: { ...current.minute, playing: false }, second: { ...current.second, playing: false },
          }
        : current));
    },
  };
}

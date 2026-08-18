/* 휠의 **이동 계산** — "지금 값에서 이 열을 이만큼 옮기면 무슨 값인가".
 * DOM도 React도 import 하지 않습니다.
 *
 * `controls/WheelPicker.tsx`(2490줄)에서 갈라져 나왔습니다(PRINCIPLES §15 규칙 4).
 * 재 보니 이 조각이 컴포넌트 밖에서 물어오는 것은 **다섯**뿐이고(모델·필드·격자·경계
 * 둘) 전부 **입력**이라 상태를 안 건드립니다 — 그래서 훅이 아니라 순수 모듈입니다.
 * `controls/selectKeyboard.ts`와 같은 수이고 이유도 같습니다: **jsdom 없이 검사되는
 * 것이 이 분리의 요점**입니다. 여기에 DOM 접근을 추가하지 마세요.
 *
 * 경계 비교·클램프는 여전히 **모델이** 합니다(설계 스펙 §6·§12) — 아래 둘은 `min`/`max`/
 * `fields`를 매 호출 다시 안 적어도 되게 하는 래퍼일 뿐입니다.
 */
import type { WheelModel, WheelStep, WheelUnit } from "../model/wheelModel";

/** 이동 계산이 필요로 하는 전부. 컴포넌트가 한 번 묶어 넘깁니다. */
export type WheelShiftContext = {
  model: WheelModel;
  fields: WheelUnit[];
  step?: WheelStep;
  min?: string;
  max?: string;
};

function outOfRange({ model, fields, min, max }: WheelShiftContext, value: string) {
  return model.outOfRange(value, { min, max }, fields);
}

function clampToRange({ model, fields, min, max }: WheelShiftContext, value: string) {
  return model.clampToRange(value, { min, max }, fields);
}

function stepOnce({ model, fields, step }: WheelShiftContext, sourceValue: string, unit: WheelUnit, amount: number) {
  const next = model.normalize(model.shift(sourceValue, unit, amount, fields, step), fields);
  return model.isValid(next, fields) ? next : null;
}

function walkToBound(context: WheelShiftContext, sourceValue: string, unit: WheelUnit, amount: number) {
  const direction = amount > 0 ? 1 : -1;
  let current = sourceValue;
  for (let taken = 0; taken < Math.abs(amount); taken += 1) {
    const raw = stepOnce(context, current, unit, direction);
    if (raw === null) return null;
    if (!outOfRange(context, raw)) { current = raw; continue; }
    // 격자점이 경계 밖입니다. 경계 자신이 아직 안 쓰였으면 거기서 한 칸을 씁니다.
    const bound = clampToRange(context, raw);
    if (bound === current || outOfRange(context, bound)) return null;
    current = bound;
  }
  return current;
}

export function shiftedFrom(context: WheelShiftContext, sourceValue: string, unit: WheelUnit, amount: number) {
  /* 걷는 것은 **격자가 경계를 건너뛸 때만** 뜻이 있습니다. 그래서 셋이 다 참일 때만
   * 걷습니다:
   *   - 격자가 1이 아님 — 1이면 한 칸이 곧 한 단위라 경계를 건너뛸 수 없습니다.
   *   - 옮길 칸이 있음.
   *   - **`min`이나 `max`가 있음** — 경계가 없으면 `outOfRange`가 늘 거짓이라 걷기가
   *     한 번에 세는 것과 **같은 답을 훨씬 비싸게** 냅니다.
   *
   * 🔴 마지막 조건이 성능 조건입니다. 행 하나마다 `|amount|`번 왕복하므로
   * `wheelRowsPerSide=4`면 한 열이 10회에서 **30회**로, 6열이면 렌더당 60회에서
   * 180회로 늡니다. 이 저장소에는 드래그 성능 항목이 이미 열려 있고(55~57fps, 다음
   * 후보가 행 렌더의 반복 파싱) 바로 이 자리입니다. 경계 없는 픽커가 대부분이라
   * 이 한 줄이 그 대부분을 예전 비용으로 되돌립니다.
   *
   * 🔴 **`stride === 1`에서 걸으면 동작이 바뀝니다.** 월을 한 번에 +2 하면
   * `2026-01-31 → 2026-03-31`인데, 한 칸씩 걸으면 중간에 2월 말일로 잘려
   * `2026-03-28`이 됩니다(일이 연·월에 의존하는 §3.1의 그 자리). */
  if (context.model.stepOf(unit, context.step) !== 1 && amount !== 0 && (context.min !== undefined || context.max !== undefined)) {
    return walkToBound(context, sourceValue, unit, amount);
  }
  const next = stepOnce(context, sourceValue, unit, amount);
  if (next === null) return null;
  if (outOfRange(context, next)) return null;
  return next;
}

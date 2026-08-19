/* 경계(min·max) — 값이 안인지, 벗어났으면 어디로 끌어당길지.
 *
 * 경계 문자열은 값보다 짧을 수 있어(연만, 연월만 …) **비교 정밀도를 먼저 맞춥니다** —
 * 그래서 `precisionThrough`·`comparisonPrecision`이 여기 있습니다. 킷 안에서 그 둘을
 * 쓰는 곳은 이 파일뿐이고, `comparisonPrecision`은 그 위에 **배럴이 내보내는 공개 이름**
 */

import type { WheelUnit, UnitParts, ValueFamily } from "../wheelModel";
import { parseValue, serializeValue } from "./serialize";
import { UNIT_LADDER, deepestIndex, familyOf, unitCeiling, unitFloor } from "./units";
/* ---- 경계 비교: min/max를 모델로 -------------------------------------
 *
 * 값 지식이 기계(DateWheelPicker.tsx)에 남아 있던 두 자리 중 하나였습니다
 * (설계 스펙 §1단계 측정·§12) — `rangeKey`·`outOfRange`·`clampToRange`가
 * 원래 기계 안 지역 함수였고, 그때는 날짜 세 단위만 알았습니다. 여기서
 * 시·분·초까지 다루는 여섯 단위로 넓혀 모델로 옮깁니다. **컴포넌트는 아직
 * 이 함수들을 부르지 않습니다** — 그건 다음 단계입니다.
 *
 * 비교 정밀도(§6)는 값 정밀도(계열이 정하는 고정폭, `serialize.ts`의 parseValue/
 * serializeValue의 개념)와 다릅니다 — 픽커가 가진 열 중 최소 단위(사다리에서
 * 가장 깊은 것)가 정합니다.
 */

/** `unit`까지의 접두사 길이. `comparisonPrecision`과 `clampToRange`의 채움이
 *  함께 씁니다. `family`는 비교 대상 문자열의 계열(`familyOf(fields)`)이어야
 *  합니다. */
function precisionThrough(unit: WheelUnit, family: ValueFamily): number {
  if (family === "time") return unit === "second" ? 8 : unit === "minute" ? 5 : 2;
  const dateLen = unit === "day" ? 10 : unit === "month" ? 7 : 4;
  if (family === "date") return dateLen;
  // datetime: 날짜 단위는 그 접두사 그대로, 시각 단위는 "날짜 10 + T + 시각 접두사".
  return unit === "year" || unit === "month" || unit === "day" ? dateLen : 11 + (unit === "second" ? 8 : unit === "minute" ? 5 : 2);
}

/** 비교 정밀도(설계 스펙 §6) — 픽커가 가진 열 중 사다리에서 가장 깊은 단위가
 *  정하는 비교용 문자열 길이. 지금 코드의 `rangeKeyLength`(연·월이면 7,
 *  일까지면 10)를 시·분·초까지 시각으로 연장한 것입니다. */
export function comparisonPrecision(fields: WheelUnit[]): number {
  return precisionThrough(UNIT_LADDER[deepestIndex(fields)], familyOf(fields));
}

/** 경계 문자열이 매치할 수 있는 형식들. `usableBound`와 `clampToRange`의
 *  채움 둘 다 "경계에 무엇이 실제로 주어졌는지"를 여기서 읽습니다 —
 *  `parseValue`와 달리 `fields`의 정밀도와 무관하게 그 계열의 아무
 *  정밀도나(연만·연월·연월일 …) 받습니다. 경계는 값과 달리 짧을 수 있는
 *  것이 §6의 핵심입니다. */
const BOUND_FORMATS: { pattern: RegExp; family: ValueFamily; units: WheelUnit[] }[] = [
  { pattern: /^(\d{4})$/, family: "date", units: ["year"] },
  { pattern: /^(\d{4})-(\d{2})$/, family: "date", units: ["year", "month"] },
  { pattern: /^(\d{4})-(\d{2})-(\d{2})$/, family: "date", units: ["year", "month", "day"] },
  { pattern: /^(\d{2})$/, family: "time", units: ["hour"] },
  { pattern: /^(\d{2}):(\d{2})$/, family: "time", units: ["hour", "minute"] },
  { pattern: /^(\d{2}):(\d{2}):(\d{2})$/, family: "time", units: ["hour", "minute", "second"] },
  { pattern: /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/, family: "datetime", units: ["year", "month", "day", "hour", "minute"] },
  { pattern: /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/, family: "datetime", units: ["year", "month", "day", "hour", "minute", "second"] },
];

/** 경계 문자열을 `UnitParts`로. 형식이 `BOUND_FORMATS`의 어느 것과도 안 맞으면
 *  `null`. 명시되지 않은 단위는 바닥값입니다 — `parseValue`의 눌림과 같은
 *  결입니다(단, 여기서는 "안 준 단위"가 기준이지 "구간 아래"가 기준이
 *  아닙니다 — 경계 문자열 자체가 짧을 수 있어서입니다). */
function matchBound(bound: string): { family: ValueFamily; parts: UnitParts } | null {
  for (const format of BOUND_FORMATS) {
    const match = format.pattern.exec(bound);
    if (!match) continue;
    const parts: UnitParts = {
      year: unitFloor("year"), month: unitFloor("month"), day: unitFloor("day"),
      hour: unitFloor("hour"), minute: unitFloor("minute"), second: unitFloor("second"),
    };
    format.units.forEach((unit, index) => { parts[unit] = Number(match[index + 1]); });
    return { family: format.family, parts };
  }
  return null;
}

/**
 * 쓸 수 없는 경계는 없는 것으로 봅니다(설계 스펙 §6.1) — 경계가 값과 계열이
 * 다르거나 형식이 깨졌으면 `null`. `bound`가 `undefined`여도 `null`(경계
 * 없음과 같은 취급).
 *
 * datetime 계열은 date 모양(연·연월·연월일)과 datetime 모양(분까지·초까지)
 * 둘 다 받습니다 — "월까지만 준 max"(§6.1)가 이 관용을 요구합니다. 시각만
 * 있는 경계는 받지 않습니다 — 날짜 기준이 없는 시각은 datetime 값과 견줄
 * 말이 안 됩니다.
 */
export function usableBound(bound: string | undefined, fields: WheelUnit[]): string | null {
  if (bound === undefined) return null;
  const matched = matchBound(bound);
  if (!matched) return null;
  const family = familyOf(fields);
  const usable = family === "datetime" ? matched.family === "date" || matched.family === "datetime" : matched.family === family;
  return usable ? bound : null;
}

/**
 * `value`가 `bounds`를 벗어나는지(설계 스펙 §6). 거친 쪽(비교 정밀도와 경계
 * 문자열 길이 중 짧은 쪽)에서 비교합니다 — 그래야 "날짜만 준 max"가 그날
 * 전체를 엽니다. 쓸 수 없는 경계는 `usableBound`가 걸러 없는 셈 칩니다.
 */
export function outOfRange(value: string, bounds: { min?: string; max?: string }, fields: WheelUnit[]): boolean {
  const precision = comparisonPrecision(fields);
  const min = usableBound(bounds.min, fields);
  const max = usableBound(bounds.max, fields);
  if (min) {
    const len = Math.min(precision, min.length);
    if (value.slice(0, len) < min.slice(0, len)) return true;
  }
  if (max) {
    const len = Math.min(precision, max.length);
    if (value.slice(0, len) > max.slice(0, len)) return true;
  }
  return false;
}

/**
 * `value`를 `bounds` 안으로 밀어 넣습니다(설계 스펙 §6). `min` 클램프는
 * `parseValue`의 바닥값 정규화와 같은 결로 앉습니다 — 이른 끝이 곧 바닥값이라
 * `matchBound`가 채우는 기본값이 그대로 맞아떨어집니다. `max` 클램프는 별도
 * 경로입니다 — 비교 길이 아래이면서 **픽커의 최소 단위(`fields`에서 가장 깊은
 * 단위) 이상인** 단위만 그 단위의 상한(월·일은 그달의 말일, 시·분·초는
 * 23·59·59)으로 채웁니다(§6.1). 그보다 깊은 단위(픽커의 열이 아닌 단위)는
 * §5가 바닥값으로 고정하는 자리라 채우지 않습니다 — `serializeValue(parts,
 * fields)`가 그 자리를 어차피 눌러 버리므로 채워도 무의미하고, 채운 채로 두면
 * 그 값이 준 `max`보다 큰 문자열이 되어(예: 연·월 픽커에서 `max="2026-07-15"`가
 * `2026-07-31`을 내놓는 것) 클램프가 멱등하지 않게 됩니다. 쓸 수 없는 경계는
 * `usableBound`가 걸러 없는 셈 칩니다.
 */
export function clampToRange(value: string, bounds: { min?: string; max?: string }, fields: WheelUnit[]): string {
  const precision = comparisonPrecision(fields);
  const min = usableBound(bounds.min, fields);
  const max = usableBound(bounds.max, fields);

  const valueParts = parseValue(value, fields);
  const normalized = valueParts ? serializeValue(valueParts, fields) : value;

  if (min) {
    const len = Math.min(precision, min.length);
    if (normalized.slice(0, len) < min.slice(0, len)) return serializeValue(matchBound(min)!.parts, fields);
  }
  if (max) {
    const len = Math.min(precision, max.length);
    if (normalized.slice(0, len) > max.slice(0, len)) {
      const family = familyOf(fields);
      const parts = { ...matchBound(max)!.parts };
      const context = { year: parts.year, month: parts.month };
      const deepest = deepestIndex(fields);
      const relevant: WheelUnit[] =
        family === "date" ? ["year", "month", "day"]
        : family === "time" ? ["hour", "minute", "second"]
        : ["year", "month", "day", "hour", "minute", "second"];
      // 사다리 순서로 채웁니다 — 일의 상한이 연·월(이 루프에서 먼저 채워질 수
      // 있는)에 달려 있어서(§3.1), context가 그 순서로 갱신돼야 합니다.
      for (const unit of relevant) {
        if (UNIT_LADDER.indexOf(unit) > deepest) continue;      // 픽커의 열 밖 — §5가 바닥값으로 고정하는 자리
        if (precisionThrough(unit, family) <= len) continue;    // 비교 길이 안 — 경계가 준 값 그대로
        const ceiling = unitCeiling(unit, context);
        if (ceiling !== null) parts[unit] = ceiling;
        if (unit === "year") context.year = parts.year;
        if (unit === "month") context.month = parts.month;
      }
      // `fields`로 직렬화합니다 — `min` 클램프와 같은 폭입니다. 채움 루프가
      // 이미 픽커의 열 밖은 건드리지 않으므로, 여기서 다시 누르는 것은
      // `parseValue`/`serializeValue`가 늘 하는 정상적인 §5 바닥값 정규화이지
      // 방금 채운 상한을 지우는 게 아닙니다.
      return serializeValue(parts, fields);
    }
  }
  return normalized;
}

/** 남은 최소 단위 기준 비교 길이. 일 있으면 10(YYYY-MM-DD), 월까지면 7(YYYY-MM), 연만이면 4.
 *  연·월 픽커(일 없음)에서 min/max를 "월" 단위로 비교하게 만드는 핵심입니다 —
 *  일이 01로 고정돼도, 예산이 7월 중순부터 시작(min="2026-07-15")하면 7월 전체가 선택 가능해야 합니다. */
export function rangeKeyLength(fields: WheelUnit[]) {
  return fields.includes("day") ? 10 : fields.includes("month") ? 7 : 4;
}

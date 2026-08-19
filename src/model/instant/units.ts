/* 여섯 단위의 사다리, 그리고 그 사다리 위에서만 뜻이 서는 것들 — 격자(step)·자릿수·
 * 상한/하한·계열 판정·말일. 이 폴더의 바닥이라 형제를 하나도 import 하지 않습니다.
 *
 * `DEFAULT_FIELDS`와 `DEFAULT_HOUR_DISPLAY`도 여기 있습니다 — 어느 한 조각의 것이
 * 아니라 **여러 조각이 함께 쓰는 기본값**이라서입니다(display와 paste가 둘 다 씁니다).
 */

import type { WheelUnit, HourDisplay, WheelStep, ValueFamily } from "../wheelModel";
/** 여섯 단위의 순서. 큰 단위부터 작은 단위로. */
export const UNIT_LADDER = ["year", "month", "day", "hour", "minute", "second"] as const satisfies readonly WheelUnit[];

/** `fields`를 받는 값-지식 함수들의 기본값 — 안 넘기면 지금까지와 똑같은 연·월·일
 *  픽커로 동작합니다(Task 3, 설계 스펙 §5). 옵션 인자 하나로 두는 이유는
 *  tests/instantModel.test.ts가 `shiftDateValue`·`withUnitValue`·`dateWheelLabel`·
 *  `validDateValue`·`todayIn`을 fields 없이(3-인자 이하로) 직접 부르는 기존 호출을
 *  그대로 유지하기 때문입니다 — 이 상수가 그 호출들의 암묵적 계약입니다. */
export const DEFAULT_FIELDS: WheelUnit[] = ["year", "month", "day"];

/** 기본은 24시간제 — 안 넘기면 지금까지와 **글자 하나도** 다르지 않습니다. 그래서
 *  오전/오후 문자열이 빈 문자열인 것이 맞습니다: `format: "24"`에서는 읽히지 않습니다. */
export const DEFAULT_HOUR_DISPLAY: HourDisplay = { format: "24", am: "", pm: "" };

/** 그 단위가 시작하는 최소값. 월·일만 1이고 나머지(연·시·분·초)는 0입니다. */
export function unitFloor(unit: WheelUnit) {
  return unit === "month" || unit === "day" ? 1 : 0;
}

/* ---- 격자(step) — 설계 스펙 §8 ------------------------------------------
 *
 * `step`은 **열마다 따로**입니다(`{ minute: 15 }`처럼 필요한 열만). 안 넘긴 열은 1이라
 * 지금까지와 글자 하나 안 바뀝니다.
 *
 * 🔴 **격자의 기준점은 언제나 그 열의 바닥값입니다** — 시·분·초는 0, 월·일은 1.
 * `min`/`max`를 기준으로 삼지 않는 것이 요점입니다: 그러면 같은 `step`을 준 픽커가
 * `min`에 따라 다른 값 집합을 내주고, 소비자가 "15분 단위"라고 말한 것이 지켜지지
 * 않습니다. 경계는 격자를 옮기는 것이 아니라 **격자의 끝을 자르는** 역할만 합니다.
 */

/** 그 열의 격자 간격. **1 미만·정수 아님·유한하지 않음은 전부 1로 떨어집니다** —
 *  소비자가 `0`이나 `-5`를 주면 격자 계산이 0으로 나누거나 무한 루프가 되는데, 던지는
 *  대신 "step 없음"으로 읽는 쪽이 이 킷의 다른 프롭들과 결이 같습니다(잘못된 `fields`도
 *  던지지 않고 그릴 수 있는 것만 그립니다). */
export function stepOf(unit: WheelUnit, step?: WheelStep): number {
  const wanted = step?.[unit];
  if (typeof wanted !== "number" || !Number.isFinite(wanted)) return 1;
  const whole = Math.floor(wanted);
  return whole >= 1 ? whole : 1;
}

/** 격자에 안 얹힌 값을 **아래 격자점으로** 내립니다(스펙 §8: "타이핑이 step 위에 안
 *  떨어지면 내림"). 올림이 아닌 이유는 이 컴포넌트의 기존 규칙과 같습니다 — 사용자가
 *  친 것보다 **큰 값을 만들어 주지 않습니다.** */
export function snapToStep(unit: WheelUnit, amount: number, step?: WheelStep): number {
  const stride = stepOf(unit, step);
  if (stride === 1) return amount;
  const floor = unitFloor(unit);
  // 🔴 **바닥값 아래로는 안 내려갑니다.** `Math.floor`가 음수 쪽으로 내리므로
  // `amount < floor`이면 격자점이 바닥값보다 아래로 나옵니다 — `snapToStep("month", 0,
  // { month: 3 })`이 **-2**였고, `withUnitValue`가 그걸 그대로 직렬화해
  // **`"2026--2-12"`라는 깨진 문자열**을 냈습니다(실측). `instantModel.setUnit`은 공개
  // API이고 `commitTyped`는 `isValid` 검사 없이 `onChange`에 넘기므로, 소비자가 직접
  // 부르면 깨진 값이 앱으로 갑니다. 지금 UI 경로로는 도달하지 않지만(타이핑이 월·일의
  // 0을 막습니다) 계약으로 막아 둡니다.
  return Math.max(floor, floor + Math.floor((amount - floor) / stride) * stride);
}

/** 그 열이 받는 최대 자릿수. 연도만 4자리이고 나머지는 2자리입니다. */
export function unitDigits(unit: WheelUnit) {
  return unit === "year" ? 4 : 2;
}

/**
 * 그 단위에 존재하는 가장 큰 수. 연도는 상한이 없어 `null`입니다.
 *
 * **문맥을 보는 단위는 `day` 하나뿐입니다** — 이 모델 전체에서 유일한 단위 간
 * 의존이고(스펙 §3.1), 그래서 나머지는 `context`를 무시합니다. 둘째 의존이
 * 생기면 모델을 뗄 수 있었던 근거가 사라집니다.
 */
export function unitCeiling(unit: WheelUnit, context: { year: number; month: number }): number | null {
  if (unit === "year") return null;
  if (unit === "month") return 12;
  if (unit === "day") return lastDayOf(context.year, context.month - 1);
  if (unit === "hour") return 23;
  return 59;   // minute, second
}

/* ---- fields: 어느 단위를 쓰는가 ------------------------------------------
 *
 * 위 격자 구역은 여기서 끝납니다. 아래 셋은 **`fields` 배열 자체를 읽는** 것들이고,
 * 그 뒤 `lastDayOf`는 달력 원시입니다.
 *
 * ⚠️ main에서는 이 구역을 "값 형식" 배너가 닫고 있었는데 그 배너가 `serialize.ts`로
 * 갔습니다. 배너는 **뒤따르는 것**에 붙는 글이라, 파일을 가를 때 자기 구역의 절반만
 * 데려가면 남은 절반이 앞 구역에 삼켜집니다. */
/** `fields` 중 사다리에서 가장 아래(깊은) 단위의 인덱스. 이보다 아래인 단위는
 *  값 문자열에도 없고 바닥값으로 눌립니다.
 *
 *  빈 `fields`는 **사다리 전체를 쓴 것처럼** 다룹니다(마지막 인덱스, `second`) —
 *  아무것도 누르지 않는다는 뜻입니다. 가드가 없으면 `Math.max()`(인자 없음)가
 *  `-Infinity`를 돌려주고, 그러면 모든 단위의 인덱스가 그보다 커서 **연도까지
 *  바닥값(0)으로 눌립니다.**
 *
 *  ⚠️ **이건 `normalizeToFields`의 선례가 아니라 새 계약입니다.** 옛
 *  `normalizeToFields("2026-07-15", [])`는 `"2026-01-01"`이었습니다 — 연도는
 *  지키되 월·일은 **항상** 눌렀습니다. 새 규칙은 `"2026-07-15"`로 **아무것도
 *  안 누릅니다.** 공유하는 것은 "연도를 지운다"는 퇴행을 막는 목표뿐이고 월·일
 *  처리는 정반대입니다. 두 경로를 동시에 부르는 호출자는 아직 없습니다
 *  (`normalize`는 3단위 경로, 이쪽은 컴포넌트가 아직 안 씁니다) — **2b에서 둘을
 *  합칠 때 이 차이를 먼저 정하세요.** */
export function deepestIndex(fields: WheelUnit[]) {
  if (fields.length === 0) return UNIT_LADDER.length - 1;
  return Math.max(...fields.map((unit) => UNIT_LADDER.indexOf(unit)));
}

/** `fields`가 날짜 단위·시각 단위 중 어느 쪽을 포함하는지로 계열을 가릅니다.
 *  둘 다 있으면 "datetime", 시각만 있으면 "time", 그 외(날짜만 또는 아무것도
 *  없음)는 "date"입니다. */
export function familyOf(fields: WheelUnit[]): ValueFamily {
  const hasDate = fields.some((unit) => unit === "year" || unit === "month" || unit === "day");
  const hasTime = fields.some((unit) => unit === "hour" || unit === "minute" || unit === "second");
  return hasDate && hasTime ? "datetime" : hasTime ? "time" : "date";
}

/** `fields`가 `UNIT_LADDER`에서 잘라낸 연속 구간인지 — 순서도 사다리를
 *  따라야 합니다. 빈 배열은 구간이 아닙니다. */
export function isContiguous(fields: WheelUnit[]): boolean {
  if (fields.length === 0) return false;
  const first = UNIT_LADDER.indexOf(fields[0]);
  if (first === -1) return false;
  return fields.every((unit, offset) => UNIT_LADDER[first + offset] === unit);
}

/** 연도를 다루면서 0~99를 1900년대로 옮기지 않는 안전한 말일 계산.
 *  `dateMath.ts`의 `shiftDateValue`(±1 이동)도 이 함수를 씁니다 — 그쪽이
 *  한때 `new Date(Date.UTC(year, ...))`로 직접 계산해 같은 0~99 재매핑 함정에
 *  빠졌었습니다(0년을 1900년으로 읽어 윤년 판정이 틀림). 말일 계산은 **이 모델
 *  전체에 하나만** 둡니다 — 그래서 `instant/` 조각 어디에도 두 번째 구현이
 *  없어야 합니다. */
export function lastDayOf(year: number, monthIndex: number) {
  const probe = new Date(0);
  probe.setUTCFullYear(year, monthIndex + 1, 0);
  return probe.getUTCDate();
}

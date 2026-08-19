/* 값 하나를 다른 값으로 — 한 칸 옮기기(`shiftDateValue`), 단위 하나만 바꾸기
 * (`withUnitValue`), 격자에 맞추기(`snapValue`), 오늘로(`todayIn`).
 *
 * 넷은 값 문자열을 받아 값 문자열을 돌려줍니다. `resetTarget`만 예외로 **숫자**를
 * 돌려줍니다 — 되돌릴 목표값이지 값 자체가 아니기 때문입니다.
 */

import type { WheelUnit, WheelStep, UnitParts } from "../wheelModel";
import { parseValue, serializeValue } from "./serialize";
import { DEFAULT_FIELDS, lastDayOf, snapToStep, stepOf, unitCeiling, unitFloor } from "./units";
/** 오전↔오후 한 번에 넘어가기가 시 열에서 몇 칸 이동인가(3단계, 스펙 §7).
 *
 *  🔴 **자리올림 없음 규칙의 유일한 예외가 여기입니다.** 오전↔오후는 독립된 값이
 *  아니라 시(時)라는 한 숫자의 **다른 절반**이라, 그 조작은 곧 시 값을 ±12 옮기는
 *  일입니다. 그래도 열 밖으로는 안 샙니다 — `shiftDateValue`가 시 열 안에서
 *  순환하므로 **날짜는 그대로**입니다(오후 11시 → 오전 11시, 전날이 되지 않습니다).
 *
 *  부호가 있는 이유는 화면입니다: 열은 오전 00…11 다음에 오후 12…23이 오는 24칸이라,
 *  오후로 갈 때는 아래로, 오전으로 되돌릴 때는 위로 도는 것이 눈에 맞습니다. */
/** 열의 행을 길게 눌렀을 때 그 열이 갈 값(오너 리포트 4번, 오너 결정 2026-08-13).
 *
 * **모든 열은 바닥값으로, 연도만 지금 연도로.** 연도에는 바닥이 없어서입니다 — "0년"은
 * 뜻이 없고, 아무 상수나 정하면 그건 값 규칙이 아니라 임의값입니다.
 *
 * 판정이 여기 있는 이유는 §3.2입니다. "연도만 예외"도 "월·일은 1이고 시·분·초는 0"도
 * 전부 값 지식이라 기계가 알면 안 됩니다 — 기계는 이 함수를 부르고 `null`이면
 * 아무것도 안 합니다.
 *
 * `nowValue`는 기계가 `now(timeZone, fields)`로 얻어 넘깁니다. 이 파일은 시간대를
 * 모르고, 알 필요도 없습니다.
 *
 * ⚠️ 길게 누르기를 **행**에 걸기로 한 것은 오너 결정입니다 — ± 버튼에 걸면 그 버튼이
 * 나중에 "꾹 눌러 연속 증감"을 가질 수 없게 되고, 그건 되돌릴 수 없는 문입니다. */
export function resetTarget(unit: WheelUnit, nowValue: string, fields: WheelUnit[]): number | null {
  if (unit !== "year") return unitFloor(unit);
  const parts = parseValue(nowValue, fields);
  return parts ? parts.year : null;
}

/** 값 **전체**를 각 열의 격자로 내립니다. 한 열만 다루는 `snapToStep`과 달리 `fields`의
 *  모든 열을 훑습니다 — `지금` 버튼과 빈 값의 기준값처럼 **여러 열이 한꺼번에 정해지는
 *  자리**가 쓰는 문입니다.
 *
 *  🔴 **이게 없으면 같은 수에 이르는 두 경로가 갈립니다**(오너 결정 2026-08-15):
 *  분 step 15에서 `47`을 **타이핑하면 45로 내려가는데** `지금`을 누르면 03:47이 그대로
 *  확정됐습니다. 격자를 준 소비자는 "이 픽커는 15분 단위만 낸다"고 말한 것이고,
 *  격자 밖 값이 허용되는 예외는 `min`/`max` 끝점 하나뿐입니다.
 *
 *  일은 **내려가기만** 하므로 말일을 넘길 일이 없어 다시 자를 필요가 없습니다. */
export function snapValue(value: string, fields: WheelUnit[] = DEFAULT_FIELDS, step?: WheelStep): string {
  const parts = parseValue(value, fields);
  if (!parts) return value;
  const next = { ...parts };
  for (const unit of fields) next[unit] = snapToStep(unit, parts[unit], step);
  return serializeValue(next, fields);
}

/**
 * 한 열의 값을 **절대값으로** 설정합니다. `shiftDateValue`(±1)와 달리 목적지를
 * 직접 받습니다.
 *
 * 컴포넌트의 계약을 그대로 지킵니다 — 목적지에 없는 날은 **말일로 자르고 다른
 * 열로 자리올림하지 않습니다.** 시·분·초는 `typeDigit`/`flushBuffer`가 이미
 * 범위를 검증해 넘기므로 그대로 앉히기만 합니다 — 일과 달리 그 자체로
 * 검증이 필요한 상한이 없습니다(시는 0~23, 분·초는 0~59로 타이핑 쪽이 이미
 * 막습니다).
 *
 * Task 3부터 `new Date(...)`를 쓰지 않습니다 — parseValue/serializeValue로
 * 값을 드나들어 `fields`의 계열(date/time/datetime) 무엇이든 다룹니다(§5).
 */
export function withUnitValue(value: string, unit: WheelUnit, amount: number, fields: WheelUnit[] = DEFAULT_FIELDS, step?: WheelStep): string {
  const parts = parseValue(value, fields);
  if (!parts) return value;
  // 격자에 안 얹힌 값은 **내립니다**(스펙 §8).
  const next = { ...parts, [unit]: snapToStep(unit, amount, step) };
  if (unit === "day") {
    // 일은 스스로도 상한 검증이 필요합니다 — 타이핑이 다른 달의 말일보다 큰
    // 값을 칠 수 있습니다(4월에 "31"). 연·월과 달리 열 자신이 그 상한을 결정합니다.
    //
    // 🔴 **자른 뒤에 격자로 내립니다 — 순서가 반대면 격자 밖 값이 남습니다.**
    // 여기 한동안 `Math.min(amount, …)`가 있었는데, 그건 위에서 스냅한 값을 버리고
    // **원래 친 수를 다시 쓰는** 것이라 일 열이 `step`을 통째로 무시했습니다(4월에
    // 일 step 5로 `9`를 치면 6이 아니라 9). 오너가 문서의 한 문장을 의심해서 재보다
    // 잡았습니다.
    //
    // 이 순서라야 **말일이 격자 밖일 때도 값이 격자 위에 남습니다.** 스펙 §8은 상한을
    // 끝점으로 넣지 않습니다 — 분 step 7의 열이 `0…56` 다음 바로 `0`으로 순환하지 59를
    // 끼워 넣지 않는 것과 같은 규칙입니다. 2월에 일 step 5면 열이 `1·6·11·16·21·26`이고
    // 여기서 `31`을 쳐도 **26**입니다(28이 아닙니다). 28은 **휠이 내줄 수 없는 값**이라
    // 거기 앉으면 위로 한 칸이 1로 튑니다(실측).
    next.day = snapToStep("day", Math.min(amount, lastDayOf(parts.year, parts.month - 1)), step);
  } else if (unit === "year" || unit === "month") {
    // 일은 연·월에 의존합니다(§3.1의 유일한 단위 간 의존) — 연·월이 바뀌어
    // 일이 더는 유효하지 않으면 목적지 달의 말일로 자릅니다. 여기도 **자른 뒤에**
    // 내립니다(같은 이유). `step`이 없으면 `snapToStep`이 인자를 그대로 돌려주므로
    // 지금까지의 동작과 글자 하나 안 바뀝니다.
    next.day = snapToStep("day", Math.min(parts.day, lastDayOf(next.year, next.month - 1)), step);
  }
  return serializeValue(next, fields);
}

/** 지정한 시간대의 지금을 초 단위까지 UnitParts로.
 *
 * ⚠️ **sv-SE 함정(설계 스펙 §9).** `Intl.DateTimeFormat("sv-SE", {timeZone})`에
 * 시·분·초 옵션을 붙이면 날짜와 시각 사이 구분자가 `T`가 아니라 **공백**입니다
 * (실측: `2026-08-12 03:00:05`). 그 문자열을 파싱해 다시 조립하는 대신,
 * `formatToParts`로 각 조각을 **타입별로** 뽑아 우리가 직접 UnitParts를
 * 조립합니다 — 구분자 문자 자체를 아예 안 봅니다. `hourCycle: "h23"`으로
 * 24시간제를 명시합니다(12시간제·오전/오후는 3단계의 몫입니다).
 */
function nowParts(timeZone: string): UnitParts {
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const read = (type: string) => Number(formatted.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute"), second: read("second") };
}

/**
 * 지정한 시간대의 지금을 `fields`의 계열·정밀도로 문자열화합니다(Task 3 항목 4,
 * 설계 스펙 §9). 기본 `fields`(연·월·일)에서는 예전과 글자 하나까지 같은
 * `YYYY-MM-DD`입니다 — `serializeValue`가 date 계열에서 시·분·초 조각을
 * 그냥 무시하기 때문입니다.
 */
export function todayIn(timeZone: string, fields: WheelUnit[] = DEFAULT_FIELDS): string {
  return serializeValue(nowParts(timeZone), fields);
}

/**
 * 한 열을 ±1 이동합니다. **자리올림이 없습니다** — 연·월·일뿐 아니라 시·분·초도
 * 자기 열 안에서만 돕니다(오전/오후만 예외인 것은 3단계의 몫이고, 설계 스펙 §7이
 * "자리올림 없음 규칙의 유일한 예외"라고 명시합니다).
 *
 * Task 3부터 `new Date(...)`를 쓰지 않습니다 — 연도가 10000 이상이 되면
 * `Date#toISOString()`이 확장 표기(`+010000-07-12`)로 깨지던 함정(설계 스펙 §9의
 * 예전 주석)이 이 경로에서 함께 사라집니다: `serializeValue`의 `pad`는 4자리보다
 * 긴 연도를 자르지 않고 그대로 두므로 `parseValue`의 `\d{4}` 정규식이 그 결과를
 * 그냥 매치 실패로 걸러내고, `shiftedFrom`의 `model.isValid` 가드가 null로
 * 받아냅니다 — 별도 방어 코드가 필요 없습니다.
 */
export function shiftDateValue(value: string, unit: WheelUnit, direction: number, fields: WheelUnit[] = DEFAULT_FIELDS, step?: WheelStep): string {
  const parts = parseValue(value, fields);
  if (!parts) return value;
  const next = { ...parts };
  const stride = stepOf(unit, step);
  const floor = unitFloor(unit);

  /* **격자 위의 몇 번째 칸인가**(설계 스펙 §8). `stride`가 1이면 `index`가 값에서
   * 바닥값을 뺀 것 그대로라 아래 식이 예전 것과 **수학적으로 같습니다** — 그래서
   * `step`을 안 넘기면 동작이 하나도 안 바뀝니다.
   *
   * 🔴 **격자 밖에서 출발하는 경우가 규칙을 가릅니다.** `min`이 격자 밖이면(스펙 §8의
   * `min="03:07"` + 분 step 15) 값이 격자에 안 얹힌 채로 조작이 시작됩니다. 그때
   * "한 칸 위"는 **바로 위 격자점**이고 "한 칸 아래"는 **바로 아래 격자점**입니다 —
   * `값 ± step`이 아닙니다. 그러지 않으면 `03:07`에서 위로 한 칸이 `03:22`가 되어
   * **같은 픽커가 `min`에 따라 다른 시각 집합을 내줍니다**(스펙이 명시적으로 금지). */
  const below = Math.floor((parts[unit] - floor) / stride);
  const onGrid = (parts[unit] - floor) % stride === 0;
  const from = onGrid ? below : (direction > 0 ? below : below + 1);
  const index = from + direction;

  if (unit === "year") {
    // 연도는 상한이 없습니다(§4) — 순환하지 않고 그대로 더합니다.
    next.year = floor + index * stride;
  } else {
    // 월·일·시·분·초는 전부 "바닥값부터 상한까지 순환"이라는 하나의 규칙입니다.
    // unitCeiling이 문맥(day만 연·월을 봅니다, §3.1)을 받아 상한을 내주므로
    // 여기서 단위별 분기가 더 필요 없습니다.
    //
    // **격자가 열을 딱 나누지 못해도 허용합니다**(스펙 §8) — 분 step 7이면 마지막
    // 칸이 56이고 그 다음이 0이라 간격만 4입니다. 금지하면 시 step 5(24를 안 나눔)
    // 같은 흔한 경우가 통째로 막힙니다.
    const ceiling = unitCeiling(unit, parts)!;   // year는 위에서 걸렀으므로 null이 아닙니다
    const count = Math.floor((ceiling - floor) / stride) + 1;
    next[unit] = floor + (((index % count) + count) % count) * stride;
  }
  // 일은 연·월에 의존합니다(§3.1의 유일한 단위 간 의존) — 연·월이 움직여 그
  // 값이 더는 유효하지 않으면 목적지 달의 말일로 자르고, 다른 열로 자리올림하지
  // 않습니다.
  if (unit === "year" || unit === "month") next.day = Math.min(parts.day, lastDayOf(next.year, next.month - 1));
  return serializeValue(next, fields);
}

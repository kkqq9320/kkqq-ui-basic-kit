/* 시점(달력·시계) 값 모델 — 순수 함수만 둡니다. **조각은 `instant/`에 있습니다.**
 *
 * **DOM도 React도 import 하지 않습니다.** jsdom 없이 검사되는 것이 이 분리의
 * 요점이고, src/controls/selectKeyboard.ts와 같은 방식입니다.
 *
 * 이 모듈이 아는 유일한 단위 간 의존은 **일의 상한이 연·월에 달려 있다**는 것뿐입니다
 * (lastDayOf, 윤년). 월의 상한은 12로 상수, 연은 상한이 없습니다. 설계 스펙 §3.1.
 */
import type { WheelModel } from "./wheelModel";
import { resetTarget, shiftDateValue, snapValue, todayIn, withUnitValue } from "./instant/dateMath";
import { dateTriggerParts, dateWheelLabel } from "./instant/display";
import { hourFromTwelve, meridiemOf } from "./instant/meridiem";
import { parsePasted } from "./instant/paste";
import { clampToRange, outOfRange, rangeKeyLength } from "./instant/range";
import { normalizeToFields, parseValue, validDateValue } from "./instant/serialize";
import { flushBuffer, typeDigit } from "./instant/typing";
import { familyOf, stepOf } from "./instant/units";

/* 공개 이름은 전부 여기서 다시 내보냅니다 — 이 파일을 부르는 곳은 조각을 모릅니다. */
export { resetTarget, shiftDateValue, snapValue, todayIn, withUnitValue } from "./instant/dateMath";
export { WHEEL_FILL, dateTriggerParts, dateWheelLabel } from "./instant/display";
export { MERIDIEM_NOTCHES, MERIDIEM_UNIT, hourFromTwelve, meridiemOf, twelveHourText } from "./instant/meridiem";
export { parsePasted } from "./instant/paste";
export { clampToRange, comparisonPrecision, outOfRange, rangeKeyLength, usableBound } from "./instant/range";
export { normalizeToFields, parseValue, serializeValue, validDateValue } from "./instant/serialize";
export { flushBuffer, typeDigit } from "./instant/typing";
export { UNIT_LADDER, familyOf, isContiguous, lastDayOf, snapToStep, stepOf, unitCeiling, unitDigits, unitFloor } from "./instant/units";

/* 기계가 이 객체 하나만 보고 돌게 하는 것이 목적입니다. 기간(duration) 모델이
 * 생기면 같은 모양을 구현하고, 기계는 안 바뀝니다 — 설계 스펙 §3.3·§12.
 *
 * `columns`가 `fields`를 그대로 돌려주는 것은 **지금 단계에서만** 참입니다.
 * 3단계에서 오전/오후 버튼이 붙으면 여기가 갈라집니다. */
export const instantModel: WheelModel = {
  units: ["year", "month", "day"],
  columns: (fields) => fields,
  isValid: validDateValue,
  normalize: normalizeToFields,
  keyLength: rangeKeyLength,
  shift: shiftDateValue,
  setUnit: withUnitValue,
  label: dateWheelLabel,
  triggerParts: dateTriggerParts,
  typeDigit,
  flushBuffer,
  hourFromTwelve,
  seed: todayIn,
  /* 날짜만이면 `오늘`, 시각이 섞이면 `지금`. 이 판정이 `familyOf`를 쓰는 **유일한**
   * 자리로 남았습니다 — 기계는 이제 계열을 아예 안 묻습니다. */
  seedAction: (fields) => (familyOf(fields) === "date" ? "today" : "now"),
  outOfRange,
  clampToRange,
  parts: parseValue,
  meridiem: meridiemOf,
  resetTarget,
  parsePasted,
  stepOf,
  snapValue,
};

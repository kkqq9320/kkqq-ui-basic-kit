/* 값 문자열과 단위별 숫자 사이를 오갑니다 — 이 폴더에서 **정규 형식**(`YYYY-MM-DD`,
 * `HH:mm:ss`, 그 둘을 `T`로 이은 것)을 읽고 쓰는 곳입니다.
 *
 * 사람이 준 아무 글자는 여기가 아니라 `paste.ts`가 봅니다. 화면에 나가는 글자는
 * `display.ts`가 만듭니다 — 여기서 나가는 문자열은 **저장되는 값**뿐입니다.
 */

import type { WheelUnit, UnitParts } from "../wheelModel";
import { DEFAULT_FIELDS, UNIT_LADDER, deepestIndex, familyOf, unitFloor } from "./units";
/* ---- 값 형식: 계열별 파싱과 직렬화 ----------------------------------------
 *
 * 값 문자열의 모양(연-월-일 대 시:분[:초])은 `fields` 자체가 아니라 그것이
 * 가르는 **계열**(`familyOf`)이 정합니다. `fields`가 하는 일은 둘뿐입니다 —
 * 계열을 가르는 것, 그리고 구간 아래를 누르는 경계를 정하는 것.
 *
 * 그 경계는 **사다리 상의 위치**(`UNIT_LADDER` 인덱스)로 비교하지, `fields`에
 * 있고 없고(멤버십)로 비교하지 않습니다. 멤버십으로 비교하면 "구간 **위**의
 * 단위는 값에서 그대로 가져온다"가 깨집니다 — `fields = ["month", "day"]`일
 * 때 `year`는 `fields`의 멤버가 아니지만, `month`보다 사다리 위(왼쪽)에
 * 있으므로 눌리지 않고 원래 값을 그대로 씁니다. 반대로 `fields = ["year",
 * "month"]`일 때 `day`는 `month`보다 사다리 아래(오른쪽)이므로 바닥값으로
 * 눌립니다. 두 규칙 다 "`fields`에서 가장 깊은(사다리 아래쪽) 단위보다 아래면
 * 누른다" 하나의 기준(`deepestIndex`)에서 나옵니다.
 */

export const pad = (n: number, width: number) => String(n).padStart(width, "0");

/**
 * 문자열을 계열별 형식으로 파싱합니다. 형식이 안 맞으면 `null`.
 *
 * 날짜 계열은 언제나 `YYYY-MM-DD`(일까지), 시각 계열은 `fields`에 `second`가
 * 있으면 `HH:MM:SS`, 없으면 `HH:MM`, datetime 계열은 그 둘을 `T`로 이은
 * 모양입니다 — `fields`가 정확히 어느 단위를 담았는지와 무관합니다(연·월만
 * 있어도 문자열은 여전히 일까지).
 *
 * `fields`에서 가장 깊은 단위보다 사다리 아래인 단위는 바닥값으로 누릅니다
 * (예: 시각 계열에 `second`가 없으면 초는 언제나 0). 그 외(문자열에 실제로
 * 있는 단위)는 정규식이 잡아낸 값 그대로 씁니다.
 */
export function parseValue(value: string, fields: WheelUnit[]): UnitParts | null {
  const family = familyOf(fields);
  const withSeconds = fields.includes("second");
  const deepest = deepestIndex(fields);

  const datePattern = "(\\d{4})-(\\d{2})-(\\d{2})";
  const timePattern = withSeconds ? "(\\d{2}):(\\d{2}):(\\d{2})" : "(\\d{2}):(\\d{2})";
  const pattern =
    family === "date" ? new RegExp(`^${datePattern}$`)
    : family === "time" ? new RegExp(`^${timePattern}$`)
    : new RegExp(`^${datePattern}T${timePattern}$`);

  const match = pattern.exec(value);
  if (!match) return null;

  // 문자열에 실제로 있는 값부터 채우고, 없는 단위(다른 계열의 단위)는 바닥값입니다.
  const raw: UnitParts = {
    year: unitFloor("year"), month: unitFloor("month"), day: unitFloor("day"),
    hour: unitFloor("hour"), minute: unitFloor("minute"), second: unitFloor("second"),
  };
  if (family === "date" || family === "datetime") {
    raw.year = Number(match[1]);
    raw.month = Number(match[2]);
    raw.day = Number(match[3]);
  }
  const timeGroupOffset = family === "datetime" ? 3 : 0;
  if (family === "time" || family === "datetime") {
    raw.hour = Number(match[timeGroupOffset + 1]);
    raw.minute = Number(match[timeGroupOffset + 2]);
    if (withSeconds) raw.second = Number(match[timeGroupOffset + 3]);
  }

  const at = (unit: WheelUnit) => (UNIT_LADDER.indexOf(unit) > deepest ? unitFloor(unit) : raw[unit]);
  return { year: at("year"), month: at("month"), day: at("day"), hour: at("hour"), minute: at("minute"), second: at("second") };
}

/**
 * `UnitParts`를 계열별 문자열로 되돌립니다. `fields`는 계열을 가르고(`second`
 * 포함 여부 포함) `deepestIndex`로 구간 아래를 누르는 데만 쓰입니다 — **여기서
 * 다시 누르는 게 아니라 그 경계를 정할 뿐**입니다. 구간 아래를 누르는 일 자체는
 * `parseValue`가 값을 읽을 때 이미 했으므로, 여기서 멤버십(`fields.includes`)
 * 으로 또 누르면 "구간 위는 값에서 그대로 가져온다"가 조용히 깨집니다.
 */
export function serializeValue(parts: UnitParts, fields: WheelUnit[]): string {
  const family = familyOf(fields);
  const withSeconds = fields.includes("second");
  const deepest = deepestIndex(fields);
  const at = (unit: WheelUnit) => (UNIT_LADDER.indexOf(unit) > deepest ? unitFloor(unit) : parts[unit]);

  const date = `${pad(at("year"), 4)}-${pad(at("month"), 2)}-${pad(at("day"), 2)}`;
  const time = `${pad(at("hour"), 2)}:${pad(at("minute"), 2)}${withSeconds ? `:${pad(at("second"), 2)}` : ""}`;
  if (family === "date") return date;
  if (family === "time") return time;
  return `${date}T${time}`;
}

/**
 * `value`가 `fields`의 계열·형식에서 유효한지(Task 3 항목 1, 설계 스펙 §5).
 * `fields`를 안 넘기면 예전 이름 그대로(`/^\d{4}-\d{2}-\d{2}$/`) 연·월·일만
 * 받습니다 — `parseValue`가 date 계열에서 정확히 같은 정규식을 씁니다.
 */
export function validDateValue(value: string, fields: WheelUnit[] = DEFAULT_FIELDS): boolean {
  return parseValue(value, fields) !== null;
}

/**
 * 빠진 열을 바닥값으로 채웁니다(월·일은 01, 시·분·초는 00) — parseValue의 눌림
 * 규칙(§5의 deepestIndex)을 그대로 씁니다. **값 형식은 늘 YYYY-MM-DD가 아니라
 * `fields`의 계열이 정합니다**(Task 3, §5) — 이 함수가 3단위(연·월·일) 전용
 * 문자열 자르기(`value.split("-")`)였던 것이 §3.1이 말하는 "달력을 아는 코드"
 * 세 곳 중 하나는 아니었지만(그 셋은 shiftDateValue/dateWheelLabel/
 * withUnitValue), 시·분·초 fields를 받으면 `"03:00".split("-")`가
 * `["03:00", undefined, undefined]`이 되어 깨진 문자열을 만드는 같은 종류의
 * 함정이었습니다. parseValue/serializeValue로 왕복하면 계열을 몰라도 됩니다.
 *
 * `value`가 이미 `fields` 안에서 유효하지 않으면(형식이 안 맞으면) 그대로
 * 돌려줍니다 — 예전에도 형식을 검증하지 않았으므로 이 자리에서 새로 던지지
 * 않습니다.
 */
export function normalizeToFields(value: string, fields: WheelUnit[]): string {
  const parts = parseValue(value, fields);
  return parts ? serializeValue(parts, fields) : value;
}

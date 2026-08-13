/* 시점(달력·시계) 값 모델 — 순수 함수만 둡니다.
 *
 * **DOM도 React도 import 하지 않습니다.** jsdom 없이 검사되는 것이 이 분리의
 * 요점이고, src/selectKeyboard.ts와 같은 방식입니다.
 *
 * 이 모듈이 아는 유일한 단위 간 의존은 **일의 상한이 연·월에 달려 있다**는 것뿐입니다
 * (lastDayOf, 윤년). 월의 상한은 12로 상수, 연은 상한이 없습니다. 설계 스펙 §3.1.
 */
export type WheelUnit = "year" | "month" | "day" | "hour" | "minute" | "second";
/** 기존 이름. **2b-1부터 `WheelUnit`의 별칭입니다.** 2a에서는 별칭으로 넓히면 컴포넌트의
 *  3키짜리 `Record<DateWheelUnit, …>`(컬럼 모션 상태 등)가 깨져서 "부분집합, 별칭 아님"으로
 *  남겨야 했습니다 — 그때는 컴포넌트를 못 건드리는 제약이 있었습니다. 2b는 컴포넌트를 고칠 수
 *  있으므로 그 자리들을 여섯 단위로 채우고 여기서 별칭으로 통일합니다. `export`는 그대로
 *  유지합니다 — tests/DateWheelPicker.test.tsx와 컴포넌트가 이 이름으로 가져옵니다. */
export type DateWheelUnit = WheelUnit;

/** 여섯 단위의 순서. 큰 단위부터 작은 단위로. */
export const UNIT_LADDER = ["year", "month", "day", "hour", "minute", "second"] as const satisfies readonly WheelUnit[];

/** `fields`를 받는 값-지식 함수들의 기본값 — 안 넘기면 지금까지와 똑같은 연·월·일
 *  픽커로 동작합니다(Task 3, 설계 스펙 §5). 옵션 인자 하나로 두는 이유는
 *  tests/instantModel.test.ts가 `shiftDateValue`·`withUnitValue`·`dateWheelLabel`·
 *  `validDateValue`·`todayIn`을 fields 없이(3-인자 이하로) 직접 부르는 기존 호출을
 *  그대로 유지하기 때문입니다 — 이 상수가 그 호출들의 암묵적 계약입니다. */
const DEFAULT_FIELDS: WheelUnit[] = ["year", "month", "day"];

/** 시(時)를 어떻게 **읽을지** — 24시간제(`15`)인지 12시간제(`오후 03`)인지.
 *  설계 스펙 §7·§11. `src/settings.ts`가 이 이름을 다시 내보내고, 전역 설정 값이
 *  그 타입입니다 — 정의가 여기 있는 이유는 이것이 **값을 읽는 방식**이라 모델의
 *  어휘이고, 모델은 아무것도 import 하지 않기 때문입니다(위 헤더 주석). */
export type HourFormat = "12" | "24";

/** 시 열·시 세그먼트를 그릴 때 필요한 전부. **오전/오후 문자열이 인자로 들어옵니다** —
 *  `weekdays`가 이미 같은 방식이고, 이 모듈은 한국어를 모릅니다. 스펙 §10이
 *  "`AM`/`PM`으로 바꾸면 폭이 달라진다"고 소비자에게 경고하는 것 자체가 **바꿀 수
 *  있어야 한다**는 뜻입니다. */
export type HourDisplay = { format: HourFormat; am: string; pm: string };

/** 기본은 24시간제 — 안 넘기면 지금까지와 **글자 하나도** 다르지 않습니다. 그래서
 *  오전/오후 문자열이 빈 문자열인 것이 맞습니다: `format: "24"`에서는 읽히지 않습니다. */
const DEFAULT_HOUR_DISPLAY: HourDisplay = { format: "24", am: "", pm: "" };

/**
 * 24시간 값 하나를 **12시간제로 읽은 글자**로. 값은 안 바뀝니다 — 스펙 §7의 핵심이
 * "시 열은 24칸 그대로이고 라벨만 바뀐다"입니다.
 *
 * `0 → 12`, `12 → 12`가 이 함수의 전부입니다. `h % 12`만 쓰면 자정과 정오가 둘 다
 * `00`이 되어, 12시간제에 존재하지 않는 시각이 화면에 나옵니다.
 */
export function twelveHourText(hour24: number, display: HourDisplay): string {
  const reading = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour24 < 12 ? display.am : display.pm} ${pad(reading, 2)}`;
}

/** 오전/오후 조작이 **존재하는가**, 그리고 지금 값은 어느 절반인가(3단계, 스펙 §7).
 *
 *  시 열이 없는 픽커에는 이 조작 자체가 없으므로 `null`입니다 — 그래서 존재 여부와
 *  절반 판정을 한 함수가 답합니다. **기계가 `fields.includes("hour")`나
 *  `parts.hour < 12`를 직접 쓰지 않게 하는 것이 목적입니다**: 2b-4의 F-4에서
 *  `hasTimeUnit`이 정확히 그 이유로 `model.family`로 옮겨졌고(§3.2 "기계는 단위가
 *  무엇인지 모릅니다"), 여기가 같은 자리입니다. 정오가 오후의 시작이라는 것도
 *  값 규칙이라 여기 있습니다. */
export function meridiemOf(value: string, fields: WheelUnit[]): "am" | "pm" | null {
  if (!fields.includes("hour")) return null;
  const parts = parseValue(value, fields);
  if (!parts) return null;
  return parts.hour < 12 ? "am" : "pm";
}

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

export const MERIDIEM_NOTCHES = 12;

/** 오전/오후가 움직이는 열. **이름이 모델에 있는 이유는 §3.2입니다** — 기계는 어느
 *  열인지 이 상수로 지목할 뿐, "시가 24칸이다"·"정오가 오후의 시작이다"·"±12다"를
 *  알지 않습니다. 그 셋은 전부 위 함수·상수가 답합니다. */
export const MERIDIEM_UNIT: WheelUnit = "hour";

/** 그 단위가 시작하는 최소값. 월·일만 1이고 나머지(연·시·분·초)는 0입니다. */
export function unitFloor(unit: WheelUnit) {
  return unit === "month" || unit === "day" ? 1 : 0;
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
export type UnitParts = Record<WheelUnit, number>;
export type ValueFamily = "date" | "time" | "datetime";

const pad = (n: number, width: number) => String(n).padStart(width, "0");

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
function deepestIndex(fields: WheelUnit[]) {
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

/* ---- 경계 비교: min/max를 모델로 -------------------------------------
 *
 * 값 지식이 기계(DateWheelPicker.tsx)에 남아 있던 두 자리 중 하나였습니다
 * (설계 스펙 §1단계 측정·§12) — `rangeKey`·`outOfRange`·`clampToRange`가
 * 원래 기계 안 지역 함수였고, 그때는 날짜 세 단위만 알았습니다. 여기서
 * 시·분·초까지 다루는 여섯 단위로 넓혀 모델로 옮깁니다. **컴포넌트는 아직
 * 이 함수들을 부르지 않습니다** — 그건 다음 단계입니다.
 *
 * 비교 정밀도(§6)는 값 정밀도(계열이 정하는 고정폭, 위 parseValue/
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

/** 그 열이 받는 최대 자릿수 — 타이핑 쪽 로컬 이름. `unitDigits`에 위임합니다.
 *  인자는 `WheelUnit`(여섯 단위) — `typeDigit`이 시·분·초로도 부릅니다. */
function maxDigits(unit: WheelUnit) {
  return unitDigits(unit);
}

/** 한 자리만으로 확정되는 최소값 — 두 자리가 시작될 수 없는 첫 숫자.
 *  월 2(13~19가 없음) · 일 4(40~49가 없음) · 시 3(24~29가 없음) · 분·초 6(60~69가 없음). */
function soloFloor(unit: WheelUnit, hourFormat: HourFormat = "24") {
  if (unit === "month") return 2;
  if (unit === "day") return 4;
  // 12시간제에서는 상한이 12라 20~23이 없습니다 — 그래서 2부터 기다릴 이유가
  // 사라집니다(3단계, 스펙 §7). 24시간제는 그대로 3입니다.
  if (unit === "hour") return hourFormat === "12" ? 2 : 3;
  return 6;   // minute, second
}

/** 자릿수 판정용 상한. 문맥이 없으므로 일은 31로 넉넉히 잡고,
 *  말일 자르기는 값 설정 쪽(`withUnitValue`)이 따로 합니다 — 지금과 같은 분담입니다. */
function typingCeiling(unit: WheelUnit, hourFormat: HourFormat = "24") {
  if (unit === "month") return 12;
  if (unit === "day") return 31;
  if (unit === "hour") return hourFormat === "12" ? 12 : 23;
  return 59;   // minute, second
}

/** 타이핑이 받는 최소값. `unitFloor`와 **일부러 다른 함수**입니다 — `unitFloor`는 열의
 *  값 범위(시는 0)이고 이것은 **친 숫자의 범위**입니다. 12시간 읽기에는 0이 없고 12가
 *  그 자리를 대신합니다(3단계, 스펙 §7). `unitFloor`를 건드리면 `shiftDateValue`의
 *  순환까지 12시간제를 알게 되는데, 열은 24칸 그대로여야 합니다. */
function typingFloor(unit: WheelUnit, hourFormat: HourFormat = "24") {
  return unit === "hour" && hourFormat === "12" ? 1 : unitFloor(unit);
}

export type TypingStep = {
  /** 확정 후 남는 버퍼. 확정했으면 빈 문자열입니다. */
  digits: string;
  /** 지금 확정할 값. 아직이면 null. */
  commit: number | null;
  /** 확정 후 다음 열로 갈지. 마지막 열이면 호출부가 무시합니다. */
  advance: boolean;
};

const WAIT = (digits: string): TypingStep => ({ digits, commit: null, advance: false });
const DONE = (commit: number): TypingStep => ({ digits: "", commit, advance: true });

/** 버퍼에 숫자 하나를 더한 결과. `digit`은 "0"~"9" 한 글자여야 합니다.
 *  인자가 `DateWheelUnit`이 아니라 `WheelUnit`인 것은 의도입니다 — 이 함수는 시·분·초로도
 *  불립니다. `DateWheelUnit`(3단위)은 `WheelUnit`의 부분집합이라 기존 호출부는 그대로 통과합니다. */
export function typeDigit(unit: WheelUnit, buffer: string, digit: string, hourFormat: HourFormat = "24"): TypingStep {
  if (unit === "year") {
    const next = buffer + digit;
    return next.length >= maxDigits(unit) ? DONE(Number(next)) : WAIT(next);
  }

  if (buffer === "") {
    // 두 자리가 시작될 수 없는 숫자면 기다릴 이유가 없습니다.
    return Number(digit) >= soloFloor(unit, hourFormat) ? DONE(Number(digit)) : WAIT(digit);
  }

  const combined = Number(buffer + digit);
  // 하한은 typingFloor입니다 — 월·일은 1(0월·0일이 없음), 시·분·초는 0, 다만
  // **12시간제의 시만 1**입니다(12시간 읽기에 0이 없습니다).
  if (combined >= typingFloor(unit, hourFormat) && combined <= typingCeiling(unit, hourFormat)) return DONE(combined);
  // 두 자리 조합이 애초에 존재하지 않는 수입니다(월 13, 일 39, **12시간제의 시 15**).
  // 첫 자리를 버리고 이 숫자를 새 입력의 첫 자리로 다시 읽습니다 — 네이티브가 이렇게
  // 합니다. 스펙 §7이 12시간제의 `15` → `5`를 "월 열이 13에 하는 것과 같다"고 적은 자리입니다.
  return typeDigit(unit, "", digit, hourFormat);
}

/**
 * 열을 떠날 때 버퍼의 해석. 확정할 수 없으면 null(버립니다).
 *
 * 연도의 1~2자리를 2000년대로 읽는 것이 이 함수의 존재 이유입니다 — `26`은
 * 2026년입니다. 과거 연도는 네 자리로 치면 언제나 들어가므로 못 넣는 값은
 * 없습니다.
 *
 * 인자가 `WheelUnit`인 이유는 `typeDigit`과 같습니다 — 시·분·초로도 불립니다.
 */
export function flushBuffer(unit: WheelUnit, buffer: string, hourFormat: HourFormat = "24"): number | null {
  if (!buffer) return null;
  const typed = Number(buffer);
  if (unit === "year") return buffer.length <= 2 ? 2000 + typed : typed;
  // 0월·0일은 없지만 0시·0분·0초는 있습니다. **12시간제의 시만 1부터**이고, 위쪽도
  // 함께 봅니다 — `typeDigit`이 12를 넘는 버퍼를 만들지는 않지만, 이 함수는 버퍼를
  // 받는 입구가 하나 더 있는 것처럼 방어합니다(그게 이 함수의 자리입니다).
  return typed >= typingFloor(unit, hourFormat) && typed <= typingCeiling(unit, hourFormat) ? typed : null;
}

/** 친 숫자를 값으로. **친 것은 12시간 읽기이지 값이 아닙니다**(3단계, 스펙 §7) —
 *  어느 절반인지는 지금 값이 정합니다(오후에 `3`을 치면 15시). `12`가 특별한 이유는
 *  `twelveHourText`의 `0 → 12`와 같습니다: 12시간 읽기에 0이 없어 12가 그 자리를
 *  대신하므로, 되돌릴 때 오전 12는 0시입니다. */
export function hourFromTwelve(reading: number, half: "am" | "pm"): number {
  const base = reading % 12;   // 12 → 0
  return half === "am" ? base : base + 12;
}

/** 연도를 다루면서 0~99를 1900년대로 옮기지 않는 안전한 말일 계산.
 *  shiftDateValue(±1 이동, 이 파일 안)도 이 함수를 씁니다 — 그쪽이
 *  한때 `new Date(Date.UTC(year, ...))`로 직접 계산해 같은 0~99 재매핑 함정에
 *  빠졌었습니다(0년을 1900년으로 읽어 윤년 판정이 틀림). 말일 계산은 이 파일에
 *  하나만 둡니다. */
export function lastDayOf(year: number, monthIndex: number) {
  const probe = new Date(0);
  probe.setUTCFullYear(year, monthIndex + 1, 0);
  return probe.getUTCDate();
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
export function withUnitValue(value: string, unit: DateWheelUnit, amount: number, fields: WheelUnit[] = DEFAULT_FIELDS): string {
  const parts = parseValue(value, fields);
  if (!parts) return value;
  const next = { ...parts, [unit]: amount };
  if (unit === "day") {
    // 일은 스스로도 상한 검증이 필요합니다 — 타이핑이 다른 달의 말일보다 큰
    // 값을 칠 수 있습니다(4월에 "31"). 연·월과 달리 열 자신이 그 상한을 결정합니다.
    next.day = Math.min(amount, lastDayOf(parts.year, parts.month - 1));
  } else if (unit === "year" || unit === "month") {
    // 일은 연·월에 의존합니다(§3.1의 유일한 단위 간 의존) — 연·월이 바뀌어
    // 일이 더는 유효하지 않으면 목적지 달의 말일로 자릅니다.
    next.day = Math.min(parts.day, lastDayOf(next.year, next.month - 1));
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
export function shiftDateValue(value: string, unit: DateWheelUnit, direction: number, fields: WheelUnit[] = DEFAULT_FIELDS): string {
  const parts = parseValue(value, fields);
  if (!parts) return value;
  const next = { ...parts };
  if (unit === "year") {
    // 연도는 상한이 없습니다(§4) — 순환하지 않고 그대로 더합니다.
    next.year = parts.year + direction;
  } else {
    // 월·일·시·분·초는 전부 "바닥값부터 상한까지 순환"이라는 하나의 규칙입니다.
    // unitCeiling이 문맥(day만 연·월을 봅니다, §3.1)을 받아 상한을 내주므로
    // 여기서 단위별 분기가 더 필요 없습니다.
    const ceiling = unitCeiling(unit, parts)!;   // year는 위에서 걸렀으므로 null이 아닙니다
    const floor = unitFloor(unit);
    const size = ceiling - floor + 1;
    next[unit] = ((parts[unit] - floor + direction) % size + size) % size + floor;
  }
  // 일은 연·월에 의존합니다(§3.1의 유일한 단위 간 의존) — 연·월이 움직여 그
  // 값이 더는 유효하지 않으면 목적지 달의 말일로 자르고, 다른 열로 자리올림하지
  // 않습니다.
  if (unit === "year" || unit === "month") next.day = Math.min(parts.day, lastDayOf(next.year, next.month - 1));
  return serializeValue(next, fields);
}

/**
 * `value`가 `fields`의 계열·형식에서 유효한지(Task 3 항목 1, 설계 스펙 §5).
 * `fields`를 안 넘기면 예전 이름 그대로(`/^\d{4}-\d{2}-\d{2}$/`) 연·월·일만
 * 받습니다 — `parseValue`가 date 계열에서 정확히 같은 정규식을 씁니다.
 */
export function validDateValue(value: string, fields: WheelUnit[] = DEFAULT_FIELDS): boolean {
  return parseValue(value, fields) !== null;
}

/** 남은 최소 단위 기준 비교 길이. 일 있으면 10(YYYY-MM-DD), 월까지면 7(YYYY-MM), 연만이면 4.
 *  연·월 픽커(일 없음)에서 min/max를 "월" 단위로 비교하게 만드는 핵심입니다 —
 *  일이 01로 고정돼도, 예산이 7월 중순부터 시작(min="2026-07-15")하면 7월 전체가 선택 가능해야 합니다. */
export function rangeKeyLength(fields: DateWheelUnit[]) {
  return fields.includes("day") ? 10 : fields.includes("month") ? 7 : 4;
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
export function normalizeToFields(value: string, fields: DateWheelUnit[]): string {
  const parts = parseValue(value, fields);
  return parts ? serializeValue(parts, fields) : value;
}

/** year(넉넉한 범위)·month(1~12)·day로 요일 인덱스(0=일요일)를 구합니다.
 *  `lastDayOf`와 같은 이유로 `setUTCFullYear` 3-인자를 씁니다 —
 *  `Date.UTC`/생성자의 숫자 인자는 0~99년을 1900년대로 재매핑합니다. */
function weekdayIndex(year: number, month: number, day: number): number {
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  return probe.getUTCDay();
}

/**
 * 열에 그릴 라벨(Task 3 항목 3). 연·월·일은 지금과 같고(연도 네 자리, 월 두 자리,
 * 일 두 자리 + 요일), **시·분·초는 두 자리 숫자만입니다** — 일 열의 요일 같은
 * 부가 표시가 없습니다.
 */
export function dateWheelLabel(value: string, unit: DateWheelUnit, weekdays: string[], fields: WheelUnit[] = DEFAULT_FIELDS, hour: HourDisplay = DEFAULT_HOUR_DISPLAY): string {
  const parts = parseValue(value, fields);
  if (!parts) return "";
  if (unit === "year") return String(parts.year);
  if (unit === "month") return pad(parts.month, 2);
  if (unit === "day") return `${pad(parts.day, 2)} ${weekdays[weekdayIndex(parts.year, parts.month, parts.day)]}`;
  // 12시간제는 **시 열만** 건드립니다(3단계, 스펙 §7). 분·초는 어느 형식에서도 두 자리
  // 숫자 그대로입니다 — 그리고 시 열의 **칸 수는 여기서 안 바뀝니다.** 이 함수는 한 값을
  // 글자로 옮길 뿐이고, 열이 24칸이라는 것은 `shift`/`unitCeiling`이 정합니다.
  //
  // 🔴 **오전/오후 글자는 여기 안 붙습니다(오너 결정 2026-08-13).** 스펙 §7은 열 라벨을
  // `오후 03`으로 적었고 한 번 그렇게 구현했는데, 실제 화면을 보고 **"휠 안에 오전/오후를
  // 기입하지 마라"**로 정해졌습니다 — 상단 버튼이 이미 어느 절반인지 말합니다. 그래서 열은
  // **12시간 읽기 숫자만** 그립니다. 트리거는 그대로 `오후 03`이고(거기는 값 전체를 한 줄로
  // 읽는 자리라 절반을 빼면 뜻이 사라집니다), 열의 `aria-label`도 기계가 절반을 붙입니다.
  if (unit === "hour" && hour.format === "12") return pad(parts.hour % 12 === 0 ? 12 : parts.hour % 12, 2);
  return pad(parts[unit], 2);   // hour(24시간제), minute, second
}

/**
 * 빈 자리를 채우는 문자 — **U+2012 FIGURE DASH**. 밑줄(`_`)이 아닙니다(설계 스펙 §4.5).
 *
 * **폭이 흔들리지 않는 것이 "자리를 지키는" 표시를 고른 유일한 이유**인데, 밑줄로는 그것이
 * 달성되지 않습니다. `font-variant-numeric: tabular-nums`는 OpenType `tnum`으로 매핑되고
 * `tnum`은 **숫자 글리프에만** 균일 어드밴스를 줍니다 — `_`는 숫자가 아니라 그 치환을 아예
 * 받지 못합니다. 킷이 직접 싣는 `fonts/PretendardVariable.woff2`를 열어 `wght` 축을
 * 인스턴스화해 잰 값입니다(단위: 폰트 units, unitsPerEm 2048):
 *
 *   wght  45 : tabular 숫자 1132 · U+2012 1132 (±0) · `_` 804 (−16.02% em)
 *   wght 400 : tabular 숫자 1258 · U+2012 1258 (±0) · `_` 870 (−18.95% em)
 *   wght 700 : tabular 숫자 1341 · U+2012 1341 (±0) · `_` 933 (−19.92% em)
 *   wght 930 : tabular 숫자 1404 · U+2012 1404 (±0) · `_` 982 (−20.61% em)
 *
 * 15px 기준 빈 자리 하나당 약 2.8px이라, 밑줄이면 연도를 치는 동안 뒤 세그먼트가 5.7px
 * 밀렸다가 돌아옵니다. U+2012는 **축 전 구간에서 tabular 숫자와 정확히 같고**, 이 폰트의
 * cmap에 실제로 들어 있습니다(글리프 `figuredash`) — 없으면 폴백 폰트로 새서 보장이
 * 깨지므로 폰트를 교체하는 소비자는 이 둘을 다시 재야 합니다(`css/fonts.css`).
 *
 * **그래서 `display: inline-block`도 `ch` 고정폭도 필요 없고, 써서도 안 됩니다** — 둘 다
 * 인라인 박스를 원자 박스로 바꿔 바깥 컨테이너의 말줄임 동작까지 건드립니다(스펙 §4.5).
 *
 * 글리프를 그대로 쓰지 않고 코드포인트 이스케이프로 적습니다 — `‒`(U+2012)는 `-`(U+002D)·
 * `–`(U+2013)와 화면에서 구별되지 않아, 눈으로는 못 잡는 조용한 폭 회귀가 됩니다.
 */
export const DATE_WHEEL_FILL = "\u2012";

/** 트리거를 이루는 조각. `unit: null`이 구두점(`. `)이고, 렌더에서 aria-hidden으로 나갑니다. */
export type DateTriggerPart = { unit: DateWheelUnit | null; text: string };

const TRIGGER_DATE_UNITS: WheelUnit[] = ["year", "month", "day"];
const TRIGGER_TIME_UNITS: WheelUnit[] = ["hour", "minute", "second"];

/**
 * 트리거 문구를 **세그먼트와 구두점으로 쪼갭니다**(설계 스펙 §4.5, Task 3 항목 2는
 * §10의 시각 구분자를 더합니다).
 *
 * **조각 텍스트를 순서대로 이으면 예전 `formatDateTrigger`가 만들던 문자열과 글자 하나까지
 * 같습니다(연·월·일 fields에서).** 트리거를 `textContent` 하나로 보는 테스트가 스무 곳
 * 넘게 있고, 그것들이 손대지 않은 채로 계속 참이어야 이 변경이 "표시 구조만 바꿨다"는
 * 뜻이 됩니다. 구두점을 세그먼트에 붙여 넣거나(`"2026. "`) 사이 공백을 CSS 여백으로
 * 옮기면 그 등가성이 조용히 깨집니다.
 *
 * **버퍼는 자리를 지켜 그립니다** — "20" → `20‒‒`, "203" → `203‒`, 월 "1" → `1‒`
 * (채움 문자는 `DATE_WHEEL_FILL`, U+2012), **시각 세그먼트도 마찬가지입니다**(Task 3
 * 항목 2). 친 만큼만 그리는 안(`203. 07. 12.`)은 기각됐습니다: 자릿수가 늘었다 줄었다
 * 하며 필드 폭이 요동치고, 세 자리 `203`이 순간적으로 유효한 연도처럼 읽힙니다.
 *
 * **폭을 지키는 장치가 둘이고 역할이 다릅니다.** `css/date-picker.css`의
 * `.date-wheel-segment`가 거는 `tabular-nums`는 **숫자끼리** 폭을 맞추고(이 폰트에서
 * 비례폭 `1`은 898, `4`는 1278로 크게 다릅니다), `DATE_WHEEL_FILL`은 **빈 자리를 숫자
 * 폭에** 맞춥니다. `tabular-nums`는 숫자 글리프에만 적용되므로 채움 문자를 덮지
 * **않습니다** — 그래서 둘 다 필요하고, 하나만으로는 폭이 흔들립니다.
 *
 * **시각 구분자(Task 3 항목 2, 설계 스펙 §10).** 날짜는 `. `(마침표+공백)로 잇고,
 * 시각은 `:`로 잇습니다. 날짜 부분과 시각 부분
 * 사이는 **날짜의 마지막 세그먼트가 원래 다는 `. `가 곧 그 공백**입니다 —
 * `"2026. 08. 12. 03:00:05"`에서 `12`와 `03` 사이의 `". "`는 "일" 세그먼트가
 * 뒤에 무언가 더 있을 때 다는 구분자이지, 별도로 공백을 끼워 넣는 것이 아닙니다.
 * 날짜만 있으면(시각이 없으면) 마지막 세그먼트 뒤는 공백 없는 `.`뿐입니다 —
 * 예전(연·월·일 전용) 동작과 글자 하나까지 같습니다.
 *
 * **자리 지키기(U+2012 채움)는 시각 세그먼트에도 그대로 적용됩니다** — `segment`가
 * `unit`만 보고 판단하므로 날짜·시각을 가르지 않습니다.
 *
 * `parseValue`로 값을 읽으므로 **`fields`가 정하는 계열(date/time/datetime)
 * 무엇이든** 다룹니다 — 예전처럼 `source.split("-")`로 날짜만 가정하지 않습니다.
 * `source`가 `fields`에서 유효하지 않으면(형식이 안 맞으면) 빈 배열을 돌려줍니다 —
 * 컴포넌트는 이미 유효성을 확인한 값만 이 함수에 넘깁니다(`hasDateValue`/
 * `baseValue`).
 */
export function dateTriggerParts(source: string, fields: DateWheelUnit[], typing: { unit: DateWheelUnit; digits: string } | null, hour: HourDisplay = DEFAULT_HOUR_DISPLAY): DateTriggerPart[] {
  const parsed = parseValue(source, fields);
  if (!parsed) return [];
  const values: UnitParts = parsed;   // 아래 중첩 함수로 좁혀진 타입을 넘기려면 새 바인딩이 필요합니다 — TS는 중첩 함수 클로저까지 좁히지 않습니다.

  /* 12시간제에서 시 세그먼트 앞에 붙는 것(3단계, 스펙 §10). **오전/오후는 시
   * 세그먼트 **안**입니다** — 별도 조각(`unit: null`)으로 쪼개지 않습니다. 구두점이
   * 아니라 **값의 절반**이라, 쪼개면 세그먼트를 클릭했을 때 무엇이 활성이 되는지와
   * 활성 표시가 갈라집니다. 자리 지키기(U+2012)는 **숫자 자리에만** 적용되므로
   * 접두사는 버퍼가 살아 있는 동안에도 그대로 남습니다 — 폭이 그만큼 안 흔들립니다. */
  const meridiemPrefix = (unit: WheelUnit) =>
    unit === "hour" && hour.format === "12" ? `${values.hour < 12 ? hour.am : hour.pm} ` : "";

  function segment(unit: WheelUnit): DateTriggerPart {
    // 자릿수는 unitDigits(unit)에서 읽습니다 — 연도만 4, 나머지(월·일·시·분·초)는
    // 전부 2입니다.
    const digits = unit === "hour" && hour.format === "12"
      ? pad(values.hour % 12 === 0 ? 12 : values.hour % 12, 2)
      : pad(values[unit], unitDigits(unit));
    const shown = typing?.unit === unit && typing.digits ? typing.digits.padEnd(unitDigits(unit), DATE_WHEEL_FILL) : digits;
    return { unit, text: `${meridiemPrefix(unit)}${shown}` };
  }

  const dateFields = fields.filter((unit) => TRIGGER_DATE_UNITS.includes(unit));
  const timeFields = fields.filter((unit) => TRIGGER_TIME_UNITS.includes(unit));

  const parts: DateTriggerPart[] = [];
  dateFields.forEach((unit, index) => {
    parts.push(segment(unit));
    if (index < dateFields.length - 1) parts.push({ unit: null, text: ". " });
  });
  // 날짜 부분의 마지막 구두점 — 시각이 뒤따르면 공백까지 겸하는 ". ", 그것으로
  // 끝이면 공백 없는 "."입니다.
  if (dateFields.length > 0) parts.push({ unit: null, text: timeFields.length > 0 ? ". " : "." });

  timeFields.forEach((unit, index) => {
    parts.push(segment(unit));
    if (index < timeFields.length - 1) parts.push({ unit: null, text: ":" });
  });

  return parts;
}

/* ---- 붙여넣기: 사람이 준 글자를 값으로 --------------------------------
 *
 * `parseValue`는 **이 킷이 쓴 정규 형식만** 읽습니다(`2026-08-14`). 붙여넣기는
 * 사람이 아무 데서나 복사해 온 글자라 그 문을 그대로 쓸 수 없습니다 —
 * `2026. 08. 14.`(우리가 Ctrl+C로 쓰는 것) · `2026-8-14`(자리 안 채운 것) ·
 * `2026/08/14` · `20260814`가 전부 같은 날을 뜻합니다.
 *
 * 🔴 **구분자를 해석하지 않고 숫자 덩어리만 셉니다.** "어느 문자가 구분자인가"를
 * 정하려 들면 로캘마다 길어지는 목록이 되고, 그 목록에 없는 구분자 하나가 **조용한
 * 실패**가 됩니다(붙여넣었는데 아무 일도 안 일어남). 덩어리의 **개수와 순서**만
 * 보면 목록 자체가 필요 없습니다.
 */

/** 붙여넣은 글자 안의 오전/오후. 소비자가 준 라벨을 먼저 보고(우리가 Ctrl+C로 쓴
 *  것이 그 라벨입니다), 없으면 ASCII `AM`/`PM`을 봅니다.
 *
 *  ⚠️ **`pm`을 먼저 봅니다.** 한쪽 라벨이 다른 쪽의 부분 문자열인 경우(소비자가
 *  `"오전"`/`"오전 아님"` 같은 것을 줄 수도 있습니다) 순서가 결과를 가릅니다.
 *  기본 라벨은 빈 문자열이라 `&&`로 거릅니다 — 안 거르면 `"".includes` 가 늘 참이라
 *  **모든 붙여넣기가 오후가 됩니다.** */
function meridiemInText(text: string, hour: HourDisplay): "am" | "pm" | null {
  if (hour.pm && text.includes(hour.pm)) return "pm";
  if (hour.am && text.includes(hour.am)) return "am";
  const upper = text.toUpperCase();
  if (/\bPM\b/.test(upper)) return "pm";
  if (/\bAM\b/.test(upper)) return "am";
  return null;
}

/**
 * 붙여넣은 글자에서 읽어낸 값(정규 형식). 읽을 수 없으면 `null`입니다.
 *
 * 🔴 **읽을 수 없을 때 빈 값이 아니라 `null`입니다.** 컴포넌트는 `null`에 대해
 * **아무것도 하지 않습니다** — 붙여넣기 실패가 값을 지우면 사용자는 되돌릴 것도
 * 없이 잃습니다. "실패하면 그대로 둔다"가 이 함수의 계약입니다.
 *
 * ⚠️ **`clampToRange`를 여기서 부르지 않습니다.** min/max는 소비자가 준 것이고
 * 이 함수는 값 모델의 순수 함수입니다 — 자르는 것은 컴포넌트 몫이고, 실제로
 * 컴포넌트가 붙여넣은 뒤 `clampToRange`를 겁니다.
 */
export function parsePasted(text: string, fields: WheelUnit[], hour: HourDisplay = DEFAULT_HOUR_DISPLAY): string | null {
  const family = familyOf(fields);
  const runs = text.match(/\d+/g) ?? [];
  if (runs.length === 0) return null;

  let digits: number[];
  // 구분자 없이 붙어 있는 한 덩어리(`20260814`)만 자릿수로 가릅니다. 구분자가
  // 있으면 덩어리가 이미 자리를 말해 주므로 폭을 가정하면 안 됩니다 — `2026-8-14`를
  // 폭으로 자르면 `2026`·`81`·`4`가 됩니다.
  if (runs.length === 1 && runs[0].length > (family === "time" ? 2 : 4)) {
    const widths = family === "time" ? [2, 2, 2] : [4, 2, 2, 2, 2, 2];
    const packed = runs[0];
    digits = [];
    let at = 0;
    for (const width of widths) {
      if (at === packed.length) break;
      // 남은 자리가 폭에 못 미치면 어디서 끊을지 알 수 없습니다 — 추측하지 않고 포기합니다.
      if (packed.length - at < width) return null;
      digits.push(Number(packed.slice(at, at + width)));
      at += width;
    }
    if (at !== packed.length) return null;   // 폭을 다 쓰고도 숫자가 남으면 우리 형식이 아닙니다
  } else {
    digits = runs.map(Number);
  }

  // 날짜+시각 글자를 **시각만 있는** 픽커에 붙여넣는 경우. 앞의 세 덩어리가 날짜라고
  // 보고 버립니다 — 안 버리면 연도가 시로 들어가 범위 검사에 걸려 통째로 실패합니다.
  if (family === "time" && digits.length >= 5) digits = digits.slice(3);

  // 시각만 있는 계열은 덩어리가 시·분·초에, 나머지 계열은 연·월·일·시·분·초에
  // **순서대로** 앉습니다. 덩어리가 자리보다 많으면(ISO의 밀리초 `.123` 등) 남는
  // 것은 버립니다.
  const slots: WheelUnit[] = family === "time" ? ["hour", "minute", "second"] : ["year", "month", "day", "hour", "minute", "second"];
  if (digits.length < (family === "time" ? 2 : 3)) return null;

  const parts: UnitParts = {
    year: unitFloor("year"), month: unitFloor("month"), day: unitFloor("day"),
    hour: unitFloor("hour"), minute: unitFloor("minute"), second: unitFloor("second"),
  };
  slots.forEach((unit, index) => { if (index < digits.length) parts[unit] = digits[index]; });

  const half = meridiemInText(text, hour);
  if (half) {
    // 12시간 읽기는 1~12뿐입니다. `오후 15:00`처럼 앞뒤가 안 맞으면 무엇을 뜻하는지
    // 알 수 없으므로 추측하지 않고 포기합니다.
    if (parts.hour < 1 || parts.hour > 12) return null;
    parts.hour = hourFromTwelve(parts.hour, half);
  }

  /* 범위 검사. `lastDayOf`는 **0부터 세는 달**을 받습니다.
   *
   * ⚠️ **날짜 쪽은 시각만 있는 계열에서 보지 않습니다.** 그 계열의 연·월·일은 입력에서
   * 온 것이 아니라 위에서 넣은 **바닥값**이고, `unitFloor("year")`는 0입니다 — 안 가르면
   * `03:30:45` 같은 멀쩡한 시각이 "0년은 범위 밖"에 걸려 통째로 `null`이 됩니다.
   * (실제로 이 검사가 처음에 그렇게 짜여 시각 계열 다섯 개가 한꺼번에 빨개졌습니다.) */
  if (family !== "time") {
    if (parts.year < 1 || parts.year > 9999) return null;
    if (parts.month < 1 || parts.month > 12) return null;
    if (parts.day < 1 || parts.day > lastDayOf(parts.year, parts.month - 1)) return null;
  }
  if (parts.hour > 23 || parts.minute > 59 || parts.second > 59) return null;

  return serializeValue(parts, fields);
}

/** 기계(컴포넌트)가 시점 값 모델에 기대하는 계약. 기간(duration) 모델이 생기면
 *  같은 모양을 구현합니다 — 설계 스펙 §3.3·§12. */
export type WheelModel = {
  units: DateWheelUnit[];                                   // 사다리 순서
  // 그릴 열. 2b-1에서 `WheelUnit`(여섯 단위)까지 넓혔습니다 — 컴포넌트가 이 반환값을
  // 그대로 받습니다(§2b-1). 이 타입은 나중 단계에서 다시 넓어집니다 — 오전/오후는
  // 단위가 아니라서 WheelUnit[]에 담을 수 없습니다(설계 스펙 §7).
  columns(fields: WheelUnit[]): WheelUnit[];
  // fields는 Task 3부터 값 형식을 고릅니다(§5) — 안 넘기면 예전처럼 연·월·일입니다.
  // 옵션인 이유는 위 DEFAULT_FIELDS 주석과 같습니다: tests/instantModel.test.ts가
  // 이 다섯을 fields 없이 직접(그리고 instantModel을 거쳐) 부르는 기존 호출을
  // 그대로 유지합니다.
  isValid(value: string, fields?: WheelUnit[]): boolean;
  normalize(value: string, fields: DateWheelUnit[]): string;
  keyLength(fields: DateWheelUnit[]): number;
  shift(value: string, unit: DateWheelUnit, direction: number, fields?: WheelUnit[]): string;
  setUnit(value: string, unit: DateWheelUnit, amount: number, fields?: WheelUnit[]): string;
  /* `hour`는 3단계에서 붙었습니다(스펙 §7·§10) — 안 넘기면 24시간제로, 지금까지와
   * 글자 하나도 다르지 않습니다. **모델은 전역 설정을 읽지 않습니다**: 기계가
   * 구독해서 읽고 인자로 내려보냅니다(이 파일은 아무것도 import 하지 않습니다). */
  label(value: string, unit: DateWheelUnit, weekdays: string[], fields?: WheelUnit[], hour?: HourDisplay): string;
  triggerParts(source: string, fields: DateWheelUnit[], typing: { unit: DateWheelUnit; digits: string } | null, hour?: HourDisplay): DateTriggerPart[];
  /* `hourFormat`은 3단계에서 붙었습니다(스펙 §7) — 12시간제면 시 열의 타이핑 상한이
   * 12이고, 그때 확정되는 수는 **값이 아니라 12시간 읽기**입니다. 그것을 값으로
   * 되돌리는 것이 `hourFromTwelve`입니다. 안 넘기면 24시간제로, 지금까지와 같습니다. */
  typeDigit(unit: DateWheelUnit, buffer: string, digit: string, hourFormat?: HourFormat): TypingStep;
  flushBuffer(unit: DateWheelUnit, buffer: string, hourFormat?: HourFormat): number | null;
  hourFromTwelve(reading: number, half: "am" | "pm"): number;
  now(timeZone: string, fields?: WheelUnit[]): string;
  // 값 지식 둘이 기계(DateWheelPicker.tsx)에 남아 있었습니다(설계 스펙 §1단계 측정·
  // §12) — min/max 접두 비교(rangeKey/outOfRange/clampToRange)와 commitToday의 값
  // 분해. 여기 셋이 그 둘을 마저 모델로 옮깁니다 — outOfRange/clampToRange는 위
  // 순수 함수 그대로, parts는 parseValue 그대로입니다(설계 스펙 §12, 2b-2).
  outOfRange(value: string, bounds: { min?: string; max?: string }, fields: WheelUnit[]): boolean;
  clampToRange(value: string, bounds: { min?: string; max?: string }, fields: WheelUnit[]): string;
  parts(value: string, fields: WheelUnit[]): UnitParts | null;
  /** `fields`가 날짜/시각/날짜+시각 중 어느 계열인지(설계 스펙 §3.2) — 전체
   *  브랜치 리뷰 F-4(2b-4). 기계(DateWheelPicker.tsx)가 "오늘/지금" 버튼과
   *  팝오버 안내 문구를 고를 때 이걸로 묻습니다. 예전에는 기계가
   *  `fields.some((unit) => unit === "hour" || …)`로 직접 셋을 이름으로
   *  나열했는데, 이건 `familyOf(fields) !== "date"`와 값이 완전히 같은
   *  술어라 §3.2가 금지한 "기계가 단위 이름을 안다"를 그대로 어기고
   *  있었습니다(순수 함수 `familyOf`가 이미 아래서 이 판정을 하고 있었고,
   *  기계는 그걸 다시 손으로 베껴 쓴 것입니다) — 여기로 노출해 기계가
   *  모델에 묻게 합니다. */
  family(fields: WheelUnit[]): ValueFamily;
  /** 오전/오후 조작이 존재하는가 + 지금 어느 절반인가(3단계, 스펙 §7). 시 열이 없으면
   *  `null` — `family`와 같은 이유로 여기 있습니다(기계가 단위 이름을 알지 않게). */
  meridiem(value: string, fields: WheelUnit[]): "am" | "pm" | null;
  /** 행을 길게 눌렀을 때 그 열이 갈 값(오너 리포트 4번). 연도만 "지금", 나머지는 바닥값.
   *  `null`이면 기계는 아무것도 하지 않습니다. */
  resetTarget(unit: WheelUnit, nowValue: string, fields: WheelUnit[]): number | null;
};

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
  now: todayIn,
  outOfRange,
  clampToRange,
  parts: parseValue,
  family: familyOf,
  meridiem: meridiemOf,
  resetTarget,
};

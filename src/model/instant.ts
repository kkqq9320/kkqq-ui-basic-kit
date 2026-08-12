/* 시점(달력·시계) 값 모델 — 순수 함수만 둡니다.
 *
 * **DOM도 React도 import 하지 않습니다.** jsdom 없이 검사되는 것이 이 분리의
 * 요점이고, src/selectKeyboard.ts와 같은 방식입니다.
 *
 * 이 모듈이 아는 유일한 단위 간 의존은 **일의 상한이 연·월에 달려 있다**는 것뿐입니다
 * (lastDayOf, 윤년). 월의 상한은 12로 상수, 연은 상한이 없습니다. 설계 스펙 §3.1.
 */
export type WheelUnit = "year" | "month" | "day" | "hour" | "minute" | "second";
/** 기존 이름. `WheelUnit`의 부분집합입니다 — **별칭이 아닙니다.** 컴포넌트와 기존 테스트가
 *  이 좁은 세 단위 그대로 `Record<DateWheelUnit, …>`를 3키로 채워 쓰므로, 별칭으로 넓히면
 *  그 자리들이 전부 깨집니다(타이핑·확정 함수의 **인자**만 `WheelUnit`으로 넓히고, 반환
 *  타입과 `Record`는 좁게 남겨 두는 것이 이 파일과 컴포넌트가 동시에 컴파일되는 유일한
 *  조합입니다). 좁은 타입을 넓은 인자에 넘기는 건 항상 되므로 기존 호출부는 그대로 통과합니다. */
export type DateWheelUnit = "year" | "month" | "day";

/** 여섯 단위의 순서. 큰 단위부터 작은 단위로. */
export const UNIT_LADDER = ["year", "month", "day", "hour", "minute", "second"] as const satisfies readonly WheelUnit[];

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
 *  값 문자열에도 없고 바닥값으로 눌립니다. */
function deepestIndex(fields: WheelUnit[]) {
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
 * 경로입니다 — 비교 길이 아래의 단위를 그 단위의 상한(월·일은 그달의 말일,
 * 시·분·초는 23·59·59)으로 채웁니다(§6.1). 쓸 수 없는 경계는 `usableBound`가
 * 걸러 없는 셈 칩니다.
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
      const relevant: WheelUnit[] =
        family === "date" ? ["year", "month", "day"]
        : family === "time" ? ["hour", "minute", "second"]
        : ["year", "month", "day", "hour", "minute", "second"];
      // 사다리 순서로 채웁니다 — 일의 상한이 연·월(이 루프에서 먼저 채워질 수
      // 있는)에 달려 있어서(§3.1), context가 그 순서로 갱신돼야 합니다.
      for (const unit of relevant) {
        if (precisionThrough(unit, family) <= len) continue;   // 비교 길이 안 — 경계가 준 값 그대로
        const ceiling = unitCeiling(unit, context);
        if (ceiling !== null) parts[unit] = ceiling;
        if (unit === "year") context.year = parts.year;
        if (unit === "month") context.month = parts.month;
      }
      // **`fields`가 아니라 값의 전체 폭으로 직렬화합니다.** `serializeValue(parts,
      // fields)`를 쓰면 fields의 deepest보다 깊은 자리(예: 연·월 픽커의 일)를
      // 도로 눌러버려 방금 채운 상한이 사라집니다 — §6.1이 "min 클램프와 같은
      // 함수를 쓰지 않는다"고 못박은 이유가 이것입니다. 값 정밀도(§5)가 위쪽
      // 한계라, fields에 없어 값에 존재만 하는 단위도 채움 대상에 들어갑니다.
      const withSeconds = fields.includes("second");
      const valueSpan: WheelUnit[] =
        family === "date" ? ["year", "month", "day"]
        : family === "time" ? (withSeconds ? ["hour", "minute", "second"] : ["hour", "minute"])
        : withSeconds ? ["year", "month", "day", "hour", "minute", "second"] : ["year", "month", "day", "hour", "minute"];
      return serializeValue(parts, valueSpan);
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
function soloFloor(unit: WheelUnit) {
  if (unit === "month") return 2;
  if (unit === "day") return 4;
  if (unit === "hour") return 3;
  return 6;   // minute, second
}

/** 자릿수 판정용 상한. 문맥이 없으므로 일은 31로 넉넉히 잡고,
 *  말일 자르기는 값 설정 쪽(`withUnitValue`)이 따로 합니다 — 지금과 같은 분담입니다. */
function typingCeiling(unit: WheelUnit) {
  if (unit === "month") return 12;
  if (unit === "day") return 31;
  if (unit === "hour") return 23;
  return 59;   // minute, second
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
export function typeDigit(unit: WheelUnit, buffer: string, digit: string): TypingStep {
  if (unit === "year") {
    const next = buffer + digit;
    return next.length >= maxDigits(unit) ? DONE(Number(next)) : WAIT(next);
  }

  if (buffer === "") {
    // 두 자리가 시작될 수 없는 숫자면 기다릴 이유가 없습니다.
    return Number(digit) >= soloFloor(unit) ? DONE(Number(digit)) : WAIT(digit);
  }

  const combined = Number(buffer + digit);
  // 하한은 unitFloor입니다 — 월·일은 1(0월·0일이 없음)이지만 시·분·초는 0(0시가 있음).
  if (combined >= unitFloor(unit) && combined <= typingCeiling(unit)) return DONE(combined);
  // 두 자리 조합이 애초에 존재하지 않는 수입니다(월 13, 일 39). 첫 자리를 버리고
  // 이 숫자를 새 입력의 첫 자리로 다시 읽습니다 — 네이티브가 이렇게 합니다.
  return typeDigit(unit, "", digit);
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
export function flushBuffer(unit: WheelUnit, buffer: string): number | null {
  if (!buffer) return null;
  const typed = Number(buffer);
  if (unit === "year") return buffer.length <= 2 ? 2000 + typed : typed;
  // 0월·0일은 없지만 0시·0분·0초는 있습니다.
  return typed >= unitFloor(unit) ? typed : null;
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
 * 열로 자리올림하지 않습니다.**
 */
export function withUnitValue(value: string, unit: DateWheelUnit, amount: number): string {
  const date = new Date(value + "T00:00:00Z");
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const day = date.getUTCDate();
  if (unit === "year") {
    date.setUTCFullYear(amount, monthIndex, Math.min(day, lastDayOf(amount, monthIndex)));
  } else if (unit === "month") {
    const targetMonth = amount - 1;
    date.setUTCFullYear(year, targetMonth, Math.min(day, lastDayOf(year, targetMonth)));
  } else {
    date.setUTCFullYear(year, monthIndex, Math.min(amount, lastDayOf(year, monthIndex)));
  }
  return date.toISOString().slice(0, 10);
}

/** 지정한 시간대의 오늘을 YYYY-MM-DD로. sv-SE 로케일이 ISO 형식을 내줍니다. */
export function todayIn(timeZone: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date());
}

export function shiftDateValue(value: string, unit: DateWheelUnit, direction: number) {
  const date = new Date(value + "T00:00:00Z");
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  // 말일은 이 파일의 lastDayOf로 구합니다 — new Date(Date.UTC(year, ...))는
  // 0~99년을 1900년대로 재매핑해 연도 0(윤년)을 1900년(평년)으로 잘못 읽습니다.
  if (unit === "day") {
    const lastDay = lastDayOf(year, month);
    const targetDay = ((day - 1 + direction) % lastDay + lastDay) % lastDay + 1;
    date.setUTCFullYear(year, month, targetDay);
  } else if (unit === "year") {
    const targetYear = year + direction;
    const lastDay = lastDayOf(targetYear, month);
    date.setUTCFullYear(targetYear, month, Math.min(day, lastDay));
  } else {
    const targetMonth = ((month + direction) % 12 + 12) % 12;
    const lastDay = lastDayOf(year, targetMonth);
    date.setUTCFullYear(year, targetMonth, Math.min(day, lastDay));
  }
  return date.toISOString().slice(0, 10);
}

export function validDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** 남은 최소 단위 기준 비교 길이. 일 있으면 10(YYYY-MM-DD), 월까지면 7(YYYY-MM), 연만이면 4.
 *  연·월 픽커(일 없음)에서 min/max를 "월" 단위로 비교하게 만드는 핵심입니다 —
 *  일이 01로 고정돼도, 예산이 7월 중순부터 시작(min="2026-07-15")하면 7월 전체가 선택 가능해야 합니다. */
export function rangeKeyLength(fields: DateWheelUnit[]) {
  return fields.includes("day") ? 10 : fields.includes("month") ? 7 : 4;
}

/** 빠진 열을 01로 채웁니다. 월 없으면 월=01, 일 없으면 일=01. 값 형식은 늘 YYYY-MM-DD. */
export function normalizeToFields(value: string, fields: DateWheelUnit[]) {
  const [year, month, day] = value.split("-");
  return `${year}-${fields.includes("month") ? month : "01"}-${fields.includes("day") ? day : "01"}`;
}

export function dateWheelLabel(value: string, unit: DateWheelUnit, weekdays: string[]) {
  const date = new Date(value + "T00:00:00Z");
  if (unit === "year") return String(date.getUTCFullYear());
  if (unit === "month") return String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${String(date.getUTCDate()).padStart(2, "0")} ${weekdays[date.getUTCDay()]}`;
}

/** 세그먼트가 지키는 자릿수. 버퍼가 덜 찼을 때 이 길이까지 아래 문자로 채웁니다. */
export const DATE_WHEEL_SEGMENT_WIDTH: Record<DateWheelUnit, number> = { year: 4, month: 2, day: 2 };

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

/**
 * 트리거 문구를 **세그먼트와 구두점으로 쪼갭니다**(설계 스펙 §4.5).
 *
 * **조각 텍스트를 순서대로 이으면 예전 `formatDateTrigger`가 만들던 문자열과 글자 하나까지
 * 같습니다.** 트리거를 `textContent` 하나로 보는 테스트가 스무 곳 넘게 있고, 그것들이 손대지
 * 않은 채로 계속 참이어야 이 변경이 "표시 구조만 바꿨다"는 뜻이 됩니다. 구두점을 세그먼트에
 * 붙여 넣거나(`"2026. "`) 사이 공백을 CSS 여백으로 옮기면 그 등가성이 조용히 깨집니다.
 *
 * **버퍼는 자리를 지켜 그립니다** — "20" → `20‒‒`, "203" → `203‒`, 월 "1" → `1‒`
 * (채움 문자는 `DATE_WHEEL_FILL`, U+2012). 친 만큼만 그리는 안(`203. 07. 12.`)은
 * 기각됐습니다: 자릿수가 늘었다 줄었다 하며 필드 폭이 요동치고, 세 자리 `203`이 순간적으로
 * 유효한 연도처럼 읽힙니다.
 *
 * **폭을 지키는 장치가 둘이고 역할이 다릅니다.** `css/date-picker.css`의
 * `.date-wheel-segment`가 거는 `tabular-nums`는 **숫자끼리** 폭을 맞추고(이 폰트에서
 * 비례폭 `1`은 898, `4`는 1278로 크게 다릅니다), `DATE_WHEEL_FILL`은 **빈 자리를 숫자
 * 폭에** 맞춥니다. `tabular-nums`는 숫자 글리프에만 적용되므로 채움 문자를 덮지
 * **않습니다** — 그래서 둘 다 필요하고, 하나만으로는 폭이 흔들립니다.
 */
export function dateTriggerParts(source: string, fields: DateWheelUnit[], typing: { unit: DateWheelUnit; digits: string } | null): DateTriggerPart[] {
  const [year, month, day] = source.split("-");
  function segment(unit: DateWheelUnit, text: string): DateTriggerPart {
    return { unit, text: typing?.unit === unit && typing.digits ? typing.digits.padEnd(DATE_WHEEL_SEGMENT_WIDTH[unit], DATE_WHEEL_FILL) : text };
  }
  const parts: DateTriggerPart[] = [segment("year", year)];
  if (!fields.includes("month")) return [...parts, { unit: null, text: "." }];
  parts.push({ unit: null, text: ". " }, segment("month", month));
  if (!fields.includes("day")) return [...parts, { unit: null, text: "." }];
  return [...parts, { unit: null, text: ". " }, segment("day", day), { unit: null, text: "." }];
}

/** 기계(컴포넌트)가 시점 값 모델에 기대하는 계약. 기간(duration) 모델이 생기면
 *  같은 모양을 구현합니다 — 설계 스펙 §3.3·§12. */
export type WheelModel = {
  units: DateWheelUnit[];                                   // 사다리 순서
  // 그릴 열. 이 타입은 3단계에서 넓어집니다 — 오전/오후는 단위가 아니라서
  // DateWheelUnit[]에 담을 수 없습니다(설계 스펙 §7).
  columns(fields: DateWheelUnit[]): DateWheelUnit[];
  isValid(value: string): boolean;
  normalize(value: string, fields: DateWheelUnit[]): string;
  keyLength(fields: DateWheelUnit[]): number;
  shift(value: string, unit: DateWheelUnit, direction: number): string;
  setUnit(value: string, unit: DateWheelUnit, amount: number): string;
  label(value: string, unit: DateWheelUnit, weekdays: string[]): string;
  triggerParts(source: string, fields: DateWheelUnit[], typing: { unit: DateWheelUnit; digits: string } | null): DateTriggerPart[];
  typeDigit(unit: DateWheelUnit, buffer: string, digit: string): TypingStep;
  flushBuffer(unit: DateWheelUnit, buffer: string): number | null;
  now(timeZone: string): string;
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
  now: todayIn,
};

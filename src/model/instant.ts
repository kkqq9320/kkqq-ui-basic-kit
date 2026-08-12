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

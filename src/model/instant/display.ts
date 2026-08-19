/* 휠 라벨과 트리거 조각 — **값을 화면 글자로** 옮깁니다. 값은 안 바꿉니다.
 *
 * 🔴 **12시간 읽기(`0 → 12`)가 이 파일에 두 벌 있습니다** — `dateWheelLabel`(열 라벨)과
 * `dateTriggerParts`(트리거 숫자).
 * `meridiem.ts`의 `twelveHourText`가 같은 규칙의 **세 번째 벌**인데, 재 보니 `src`에서
 * 그 함수를 부르는 곳이 **0**입니다(배럴이 내보내기만 합니다). 갈라짐이 만든 것이 아니라
 * 갈라짐이 드러낸 것이고, 여기서 고치지 않습니다 — 어느 벌을 남길지는 별개 라운드입니다.
 */

import type { WheelUnit, HourDisplay, UnitParts, DateTriggerPart } from "../wheelModel";
import { pad, parseValue } from "./serialize";
import { DEFAULT_FIELDS, DEFAULT_HOUR_DISPLAY, unitDigits } from "./units";
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
export function dateWheelLabel(value: string, unit: WheelUnit, weekdays: string[], fields: WheelUnit[] = DEFAULT_FIELDS, hour: HourDisplay = DEFAULT_HOUR_DISPLAY): string {
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
export const WHEEL_FILL = "\u2012";

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
 * (채움 문자는 `WHEEL_FILL`, U+2012), **시각 세그먼트도 마찬가지입니다**(Task 3
 * 항목 2). 친 만큼만 그리는 안(`203. 07. 12.`)은 기각됐습니다: 자릿수가 늘었다 줄었다
 * 하며 필드 폭이 요동치고, 세 자리 `203`이 순간적으로 유효한 연도처럼 읽힙니다.
 *
 * **폭을 지키는 장치가 둘이고 역할이 다릅니다.** `css/wheel-picker.css`의
 * `.wheel-segment`가 거는 `tabular-nums`는 **숫자끼리** 폭을 맞추고(이 폰트에서
 * 비례폭 `1`은 898, `4`는 1278로 크게 다릅니다), `WHEEL_FILL`은 **빈 자리를 숫자
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
export function dateTriggerParts(source: string, fields: WheelUnit[], typing: { unit: WheelUnit; digits: string } | null, hour: HourDisplay = DEFAULT_HOUR_DISPLAY): DateTriggerPart[] {
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
    const shown = typing?.unit === unit && typing.digits ? typing.digits.padEnd(unitDigits(unit), WHEEL_FILL) : digits;
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

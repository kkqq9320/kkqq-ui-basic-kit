/* 기간(duration) 값 모델 — `WheelModel`의 두 번째 구현.
 *
 * 이 파일도 `instant.ts`처럼 **아무것도 import 하지 않습니다**(타입 제외). DOM도 React도
 * 설정 모듈도 모릅니다 — 기계가 구독해서 인자로 내려보냅니다(설계 스펙 §3.2).
 *
 * ## 기간은 시점과 무엇이 다른가
 *
 * **단위 이름은 같고 뜻이 다릅니다.** 시점의 `month`는 "몇 월"(1~12)이고 기간의 `month`는
 * "몇 개월"(0~)입니다. 그래서 바닥값이 전부 **0**이고(시점은 월·일이 1), 상한 규칙도
 * 다릅니다.
 *
 * ## 오너가 정한 것 (2026-08-15)
 *
 * 1. **단위 여섯** — 연·월·일·시·분·초. ISO 8601의 `P1Y2M3DT4H5M6S`와 같은 구성입니다.
 * 2. **값은 고정폭 `YY:MM:DD:HH:MM:SS`** (17자). `fields`가 무엇이든 **모양이 하나**이고,
 *    안 그리는 열은 0으로 눌립니다 — 시점 모델이 날짜 계열을 항상 `YYYY-MM-DD`로 쓰는 것과
 *    같은 결입니다. 고정폭이어야 하는 이유는 `min`/`max` 비교가 **문자열 접두 슬라이스**라
 *    ISO 8601(`P1Y2M`처럼 길이가 들쭉날쭉)로는 성립하지 않기 때문입니다(설계 스펙 §12).
 * 3. **자리올림 없음. 그리는 열 중 맨 위만 무제한.** 59분에서 +1이면 0분으로 순환하고
 *    시는 그대로입니다. 시·분만 그리면 시가 무제한이라 "90시간 30분"이 됩니다. 시점 모델의
 *    연도 열이 지금도 그렇게 동작하고, ISO 8601도 자리올림을 안 합니다.
 *
 * ⚠️ **하나만 자의적입니다 — 월 아래 일의 상한.** 달은 28~31일이라 "한 달에 며칠"이
 * 정해지지 않습니다. 가장 긴 달을 따라 **0~30**으로 둡니다. 자리올림이 없으므로 이 수가
 * 하는 일은 **휠이 어디서 순환하는가**뿐이고, 45일이 필요하면 월을 안 그리면 됩니다
 * (그때 일이 맨 위라 무제한입니다).
 */
import type { WheelUnit, UnitParts, WheelModel, WheelStep, DateTriggerPart, TypingStep, HourDisplay, ValueFamily } from "./wheelModel";

/** 사다리. 시점과 **같은 순서**입니다 — 큰 단위가 앞. */
const LADDER: WheelUnit[] = ["year", "month", "day", "hour", "minute", "second"];

/** 고정폭. 연만 4자리이고 나머지는 2자리입니다 — 시점의 `unitDigits`와 같은 규칙. */
/** 고정폭. **전부 2자리입니다** — 시점의 연도가 4자리인 것과 여기서 갈립니다.
 *
 * 🔴 처음에 시점을 따라 연을 4자리로 뒀다가 오너가 잡았습니다("설정하기도 불편하다").
 * 기간의 연은 "몇 년"이라 2년을 치려면 `0002`를 **네 번** 눌러야 했습니다. 99년이면
 * 어떤 계약 기간도 덮고, 값도 19자에서 17자로 줄어듭니다. */
const WIDTH: Record<WheelUnit, number> = { year: 2, month: 2, day: 2, hour: 2, minute: 2, second: 2 };

/** 그 단위가 **자기 위 단위 하나에 몇 개 들어가는가.** 맨 위 열에는 안 씁니다(무제한).
 *  `day`의 30은 위 머리말이 적어 둔 유일한 자의적 수입니다. */
const PER_PARENT: Record<WheelUnit, number | null> = { year: null, month: 12, day: 31, hour: 24, minute: 60, second: 60 };

const pad = (n: number, width: number) => String(n).padStart(width, "0");

function deepestIndex(fields: WheelUnit[]): number {
  return fields.reduce((deepest, unit) => Math.max(deepest, LADDER.indexOf(unit)), -1);
}
function topIndex(fields: WheelUnit[]): number {
  return fields.reduce((top, unit) => Math.min(top, LADDER.indexOf(unit)), LADDER.length);
}

const ZERO: UnitParts = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };

/** 값 → 단위별 수. 고정폭이라 정규식 하나면 됩니다. */
export function parseDuration(value: string): UnitParts | null {
  const match = /^(\d{2}):(\d{2}):(\d{2}):(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6]),
  };
}

export function serializeDuration(parts: UnitParts): string {
  return LADDER.map((unit) => pad(parts[unit], WIDTH[unit])).join(":");
}

/** 그 열의 상한. **맨 위 열은 상한이 없습니다**(`null`) — 그게 "자리올림 없음"의 다른
 *  얼굴입니다. 아래 열은 자기 위 단위에 들어가는 개수 - 1. */
export function durationCeiling(unit: WheelUnit, fields: WheelUnit[]): number | null {
  if (LADDER.indexOf(unit) === topIndex(fields)) return null;
  const per = PER_PARENT[unit];
  return per === null ? null : per - 1;
}

/** 기간은 **모든 열의 바닥이 0**입니다 — 0개월도, 0일도 유효한 기간입니다.
 *  시점의 `unitFloor`가 월·일에 1을 주는 것과 여기서 갈립니다. */
export const durationFloor = 0;

function stepOf(unit: WheelUnit, step?: WheelStep): number {
  const wanted = step?.[unit];
  if (typeof wanted !== "number" || !Number.isFinite(wanted)) return 1;
  const whole = Math.floor(wanted);
  return whole >= 1 ? whole : 1;
}

function snapToStep(unit: WheelUnit, amount: number, step?: WheelStep): number {
  const stride = stepOf(unit, step);
  if (stride === 1) return amount;
  return Math.max(0, Math.floor(amount / stride) * stride);
}

/** 그리지 않는 열을 0으로 누릅니다 — 시점의 `normalizeToFields`와 같은 일입니다. */
function normalize(value: string, fields: WheelUnit[]): string {
  const parts = parseDuration(value);
  if (!parts) return value;
  const next = { ...ZERO };
  for (const unit of fields) next[unit] = parts[unit];
  return serializeDuration(next);
}

/** 비교 정밀도 — 그리는 열 중 **가장 깊은** 것까지의 접두 길이. 고정폭이라 단순 합입니다. */
function comparisonPrecision(fields: WheelUnit[]): number {
  const deepest = deepestIndex(fields);
  if (deepest < 0) return 0;
  // 각 칸의 폭 + 그 앞의 콜론들
  return LADDER.slice(0, deepest + 1).reduce((sum, unit) => sum + WIDTH[unit], 0) + deepest;
}

function usableBound(bound: string | undefined): string | null {
  if (!bound) return null;
  return parseDuration(bound) ? bound : null;   // 형식이 안 맞으면 없는 것으로 봅니다(§6.1과 같은 규칙)
}

function outOfRange(value: string, bounds: { min?: string; max?: string }, fields: WheelUnit[]): boolean {
  const length = comparisonPrecision(fields);
  const key = value.slice(0, length);
  const min = usableBound(bounds.min);
  const max = usableBound(bounds.max);
  if (min && key < min.slice(0, length)) return true;
  if (max && key > max.slice(0, length)) return true;
  return false;
}

function clampToRange(value: string, bounds: { min?: string; max?: string }, fields: WheelUnit[]): string {
  const length = comparisonPrecision(fields);
  const key = value.slice(0, length);
  const min = usableBound(bounds.min);
  const max = usableBound(bounds.max);
  if (min && key < min.slice(0, length)) return normalize(min, fields);
  if (max && key > max.slice(0, length)) return normalize(max, fields);
  return value;
}

function shift(value: string, unit: WheelUnit, amount: number, fields: WheelUnit[] = LADDER, step?: WheelStep): string {
  const parts = parseDuration(value);
  if (!parts) return value;
  const stride = stepOf(unit, step);
  const below = Math.floor(parts[unit] / stride);
  const onGrid = parts[unit] % stride === 0;
  const from = onGrid ? below : (amount > 0 ? below : below + 1);
  const index = from + amount;

  const ceiling = durationCeiling(unit, fields);
  const next = { ...parts };
  if (ceiling === null) {
    /* 🔴 **맨 위 열은 순환하지 않고, 0 아래는 "없는 값"입니다.**
     *
     * 여기 한동안 `Math.max(0, …)`가 있었는데 **틀렸습니다** — 기계에 실제로 꽂아 보니
     * 시 열 행이 `["00","00","01","02","03"]`으로 나왔습니다. 0에서 아래 칸이 `—`가
     * 아니라 **또 하나의 00**이 된 것입니다. 클램프는 "못 간다"가 아니라 "제자리"라고
     * 말합니다.
     *
     * 답은 이미 이 저장소에 있습니다 — 시점의 연도 열이 같은 자리에서 같은 일을 합니다.
     * **범위를 벗어나면 형식이 깨진 문자열이 나오고, 기계의 `model.isValid` 가드가
     * 그것을 `null`로 받아 그 행을 `—`로 그리고 비활성화합니다**(설계 스펙 §12가
     * "모델이 null을 주면"이라고 적어 둔 그 자리). 음수는 `padStart`가 못 채워
     * `\d{2}`에 안 맞습니다. */
    next[unit] = index * stride;
  } else {
    const count = Math.floor(ceiling / stride) + 1;
    next[unit] = (((index % count) + count) % count) * stride;
  }
  return serializeDuration(next);
}

function setUnit(value: string, unit: WheelUnit, amount: number, fields: WheelUnit[] = LADDER, step?: WheelStep): string {
  const parts = parseDuration(value);
  if (!parts) return value;
  const ceiling = durationCeiling(unit, fields);
  const capped = ceiling === null ? amount : Math.min(amount, ceiling);
  return serializeDuration({ ...parts, [unit]: snapToStep(unit, Math.max(0, capped), step) });
}

/** 🔴 **두 자리를 다 안 채워도 확정합니다.** 상한이 있는 열에서 첫 자리가 이미 두 자리
 * 수를 만들 수 없으면(분 열에서 `6` → 60분 이상은 없음) 그 자리에서 확정하고 다음 열로
 * 넘어갑니다. 시점의 `typeDigit`이 월 열에서 `2`를 즉시 확정하는 것과 같은 규칙입니다.
 *
 * 안 하면 30분을 넣으려고 `3`을 친 뒤 **`0`을 한 번 더** 쳐야 합니다 — 오너가 지적한
 * "설정하기도 불편하다"의 절반이 이것이었습니다. 상한이 없는 맨 위 열은 두 자리를
 * 다 받습니다(90시간을 칠 수 있어야 하므로).
 */
function typeDigit(unit: WheelUnit, buffer: string, digit: string, _hourFormat?: unknown, fields: WheelUnit[] = LADDER): TypingStep {
  const digits = buffer + digit;
  if (digits.length >= WIDTH[unit]) return { digits: "", commit: Number(digits), advance: true };
  const ceiling = durationCeiling(unit, fields);
  // 첫 자리에 10을 곱한 것이 이미 상한을 넘으면 두 자리가 될 수 없습니다.
  if (ceiling !== null && Number(digits) * 10 > ceiling) return { digits: "", commit: Number(digits), advance: true };
  return { digits, commit: null, advance: false };
}

function flushBuffer(unit: WheelUnit, buffer: string): number | null {
  return buffer === "" ? null : Number(buffer);
}

function label(value: string, unit: WheelUnit): string {
  const parts = parseDuration(value);
  return parts ? pad(parts[unit], WIDTH[unit]) : "";
}

/** 일 위로는 **단위 글자**, 시 아래로는 **콜론**. `02y 03mo 04d 05:06`처럼 읽힙니다.
 *
 * 🔴 처음엔 전부 콜론이었는데 오너가 잡았습니다 — `03:04:00`은 어느 자리가 일인지
 * 알 수가 없습니다. 시점 모델이 날짜를 `. `로, 시각을 `:`로 잇는 것과 같은 판단이고,
 * 기간은 열 조합이 자유로워서(연·월만, 일·시만 …) **자리만으로는 절대 못 읽습니다.**
 *
 * ⚠️ **글자는 ASCII입니다**(`y`·`mo`·`d`). 이 저장소는 `units`의 한국어 누수를 이미
 * 한 번 치렀습니다(v0.8.0의 BREAKING 5) — 트리거에 한국어를 박으면 영어 라벨을 준
 * 소비자가 다시 같은 자리에 걸립니다. 오너가 든 예(`xd`)도 이 모양입니다.
 *
 * ⚠️ **자리는 채웁니다**(`02y`, `2y` 아님). 안 채우면 값이 바뀔 때마다 필드 폭이
 * 요동치고, 치는 동안 버퍼가 자리를 지키는 장치(`DATE_WHEEL_FILL`)도 폭을 전제합니다 —
 * `dateTriggerParts`가 같은 이유로 같은 선택을 했습니다. */
/** 단위 글자. **여섯 전부** 있습니다 — 기간은 열 조합이 자유로워서 자리만으로는 어느
 *  열인지 못 읽습니다(오너 리포트 2026-08-16: `03:04:00`이 안 읽힌다).
 *
 *  ⚠️ **`month`가 `mo`인 이유.** 오너가 `8y 1m`을 제안하면서 `m`이 분과 겹치는 것을
 *  스스로 짚고 "month를 아예 빼는 것도 고려해볼 만하다"고 했습니다. `mo`면 **단위를
 *  잃지 않고** 겹침이 사라집니다 — 오너가 앞서 고른 "여섯 단위"가 그대로 살아남는
 *  쪽입니다(`2년 3개월` 계약 기간이 그 결정의 이유였습니다).
 *
 *  ⚠️ **ASCII입니다.** 이 저장소는 `units`의 한국어 누수를 이미 치렀습니다(v0.8.0
 *  BREAKING 5) — 트리거에 한국어를 박으면 영어 라벨을 준 소비자가 같은 자리에 걸립니다. */
const SUFFIX: Record<WheelUnit, string> = { year: "y", month: "mo", day: "d", hour: "h", minute: "m", second: "s" };

/** 트리거 문구 — `3d 4h 10m`.
 *
 * 🔴 **자리를 안 채웁니다**(`3d`, `03d` 아님). 시점 모델은 채우는데(`2026. 08. 14.`)
 * 이유가 **폭 안정**이었습니다 — 숫자만 있으면 `1`과 `10` 사이에서 필드가 요동칩니다.
 * 기간은 **단위 글자가 각 조각을 붙들어** 읽는 사람이 자리를 세지 않으므로 그 대가가
 * 사라지고, 오너가 두 번 같은 모양(`3d 4h`)으로 적었습니다.
 *
 * 치는 동안에는 버퍼를 그대로 보여 줍니다 — 자리를 안 채우므로 `DATE_WHEEL_FILL`
 * 같은 채움 문자가 필요 없습니다. */
function triggerParts(source: string, fields: WheelUnit[], typing: { unit: WheelUnit; digits: string } | null): DateTriggerPart[] {
  const parts = parseDuration(source);
  if (!parts) return [];
  const all = LADDER.filter((unit) => fields.includes(unit));

  /* 🔴 **꼬리의 0은 안 그립니다**(오너 리포트 2026-08-16: "초가 없고 0m이 제일 마지막값이면
   * 필드에서 안 보였으면 좋겠어"). `3d 4h 0m` → `3d 4h`.
   *
   * ⚠️ **꼬리만입니다 — 가운데는 남깁니다.** `3d 0h 10m`에서 `0h`를 빼면 `3d 10m`이 되는데,
   * 트리거의 조각은 **누르면 그 열이 활성이 되는 자리**이기도 합니다(가는 포인터에서).
   * 가운데를 빼면 그 열을 마우스로 고를 방법이 없어집니다 — 꼬리는 `←`/`→`로 여전히 닿습니다.
   *
   * ⚠️ **치는 중에는 안 뺍니다.** 버퍼가 살아 있는 열은 사용자가 지금 보고 있는 자리라,
   * 0이라고 지우면 치던 것이 눈앞에서 사라집니다.
   *
   * 전부 0이면 **가장 작은 열 하나**를 남깁니다 — 안 그러면 필드가 빈 문자열이 됩니다. */
  let drawn = all;
  if (!typing) {
    let end = all.length;
    while (end > 0 && parts[all[end - 1]] === 0) end -= 1;
    drawn = end === 0 ? all.slice(-1) : all.slice(0, end);
  }

  const out: DateTriggerPart[] = [];
  drawn.forEach((unit, index) => {
    // 단위 글자는 **세그먼트 안**입니다 — 구두점으로 쪼개면 그 글자를 눌렀을 때 어느 열이
    // 활성이 되는지가 갈립니다(오전/오후 접두사가 시 세그먼트 안인 것과 같은 이유).
    const shown = typing?.unit === unit && typing.digits ? typing.digits : String(parts[unit]);
    out.push({ unit, text: shown + SUFFIX[unit] });
    if (index < drawn.length - 1) out.push({ unit: null, text: " " });
  });
  return out;
}

/** 팝오버에서 그 열 뒤에 붙일 기호. 트리거와 **같은 글자**를 씁니다 — 두 곳이 다른 글자를
 *  쓰면 같은 열을 두 이름으로 부르는 것이 됩니다. */
function columnMark(unit: WheelUnit): string {
  return SUFFIX[unit];
}
function parsePasted(text: string, fields: WheelUnit[]): string | null {
  const runs = (text.match(/\d+/g) ?? []).map(Number);
  if (runs.length === 0) return null;
  const drawn = LADDER.filter((unit) => fields.includes(unit));
  if (runs.length < drawn.length) return null;
  const next = { ...ZERO };
  drawn.forEach((unit, index) => { next[unit] = runs[index]; });
  for (const unit of drawn) {
    const ceiling = durationCeiling(unit, fields);
    if (next[unit] < 0) return null;
    if (ceiling !== null && next[unit] > ceiling) return null;
    if (next[unit] >= 10 ** WIDTH[unit]) return null;
  }
  return serializeDuration(next);
}

export const durationModel: WheelModel = {
  units: LADDER,
  columns: (fields) => LADDER.filter((unit) => fields.includes(unit)),
  isValid: (value) => parseDuration(value) !== null,
  normalize,
  keyLength: comparisonPrecision,
  shift,
  setUnit,
  label,
  triggerParts,
  typeDigit,
  flushBuffer,
  outOfRange,
  clampToRange,
  parts: (value) => parseDuration(value),
  parsePasted,
  stepOf,
  columnMark,
  snapValue: (value, fields, step) => {
    const parts = parseDuration(value);
    if (!parts) return value;
    const next = { ...parts };
    for (const unit of fields) next[unit] = snapToStep(unit, parts[unit], step);
    return serializeDuration(next);
  },

  /* ══════════════════════════════════════════════════════════════════════
   * 여기부터가 **계약이 찢어지는 자리**입니다. 억지로 맞추지 않고 표시합니다 —
   * 이 목록이 이번 라운드의 산출물입니다.
   * ════════════════════════════════════════════════════════════════════ */

  /** 🔴 **기간에는 "지금"이 없습니다.** `timeZone`을 받는 시그니처 자체가 시점의 개념입니다.
   *  기계는 이걸 **세 가지 다른 일**에 씁니다:
   *    1. 빈 값으로 열었을 때의 **씨앗값** — 기간에는 "0"이 정답이라 답할 수 있습니다.
   *    2. **`지금` 버튼**이 확정하는 값 — 기간에는 그 버튼 자체가 없어야 합니다.
   *    3. `resetTarget`에 넘기는 **기준값** — 기간은 안 씁니다.
   *  한 멤버가 셋을 겸하고 있어서, 기간은 2번을 거절할 방법이 없습니다. */
  seed: () => serializeDuration(ZERO),

  /** 🔴 **12시간 읽기가 없습니다.** 90시간짜리 기간에 오전/오후가 없습니다. 계약이 이걸
   *  **필수**로 요구해서 안 쓰이는 구현을 둬야 합니다. 선택 멤버여야 합니다. */
  // `hourFromTwelve`는 이제 **선택**이라 안 냅니다 — 기간에 오전/오후가 없습니다.

  /** ⭕ 이건 계약이 이미 열어 뒀습니다 — "시 열이 없으면 null". 기간은 언제나 null입니다. */
  meridiem: () => null,

  /** 🔴 **`ValueFamily`가 `"date" | "time" | "datetime"` 셋뿐이라 기간을 표현할 수
   *  없습니다.** 기계는 이 값으로 **`오늘`/`지금` 버튼의 이름**을 고릅니다(그게 전부입니다).
   *  즉 이 멤버가 실제로 답하는 질문은 "계열이 무엇인가"가 아니라 **"씨앗 버튼을 뭐라고
   *  부르나"**이고, 기간의 답은 **"버튼이 없다"**입니다. `"time"`은 거짓말입니다. */
  /** ⭕ **기간에는 씨앗 버튼이 없습니다.** `null`이면 기계가 버튼을 안 그립니다.
   *  전에는 `family`가 `"time"`이라고 **거짓말**해야 했습니다 — 계약이 묻는 이름
   *  ("계열")과 기계가 실제로 쓰는 용도("버튼 이름")가 달랐기 때문입니다. */
  seedAction: () => null,

  /** 🔴 **시그니처가 `nowValue`를 요구합니다.** 기간은 그 인자를 안 봅니다 — 모든 열의
   *  초기화 목표가 0입니다. 인자를 무시하면 되지만 **계약이 거짓말을 합니다**(시점 모델만
   *  연도에서 그 값을 씁니다). */
  resetTarget: () => 0,
};

/** 계약이 요구하지만 기간에는 뜻이 없어 안 쓰이는 것들. 기계가 부르면 안 되는 자리를
 *  검사가 붙잡을 수 있게 이름으로 내놓습니다. */
export const DURATION_UNSUPPORTED = ["now(지금 버튼)", "hourFromTwelve", "family"] as const;

/** 위 `HourDisplay`는 이 모델이 안 쓰지만, 계약의 `label`·`triggerParts` 시그니처가
 *  선택 인자로 들고 있어 import가 필요합니다 — 그 자체가 계약이 시점에 기운 증거입니다. */
export type { HourDisplay };

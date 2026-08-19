/* 휠 모델의 **계약** — 시점(`instant`)과 기간(`duration`)이 둘 다 구현합니다.
 *
 * `model/instant.ts`에서 갈라져 나왔습니다(PRINCIPLES §15 규칙 4). 그때 그 파일은
 * 1109줄이었고, 2026-08-19에 다시 `model/instant/` 여덟 조각과 배럴로 갈라졌습니다.
 * 🔴 **소비자를 보고 나서야 보인 이음매입니다.** 파일 안만 봤을 때는 시점 모델의
 * 여러 주제(값·격자·범위·타이핑·표시)가 보였는데, `model/duration.ts`가 무엇을
 * 가져가는지 재 보니 **구현이 아니라 타입 여덟 개**뿐이었습니다. 즉 이 파일들은
 * 공통 어휘를 공유하는 것이고, 그 어휘가 두 구현 중 **한쪽 안에** 살고 있었습니다.
 *
 * 여기 있는 것은 전부 타입입니다 — 값도, 함수도, import도 없습니다.
 * `WheelModel`의 `resetTarget`은 **메서드 시그니처**이지 저쪽 함수 참조가 아닙니다.
 */

export type WheelUnit = "year" | "month" | "day" | "hour" | "minute" | "second";
/* 옛 이름 `DateWheelUnit`은 5단계에서 없앴습니다 — `WheelUnit`의 별칭일 뿐이었고,
 * 이 컨트롤이 시각까지 다루게 된 뒤로는 이름이 거짓이었습니다. */

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

export type WheelStep = Partial<Record<WheelUnit, number>>;

export type UnitParts = Record<WheelUnit, number>;
export type ValueFamily = "date" | "time" | "datetime";

export type TypingStep = {
  /** 확정 후 남는 버퍼. 확정했으면 빈 문자열입니다. */
  digits: string;
  /** 지금 확정할 값. 아직이면 null. */
  commit: number | null;
  /** 확정 후 다음 열로 갈지. 마지막 열이면 호출부가 무시합니다. */
  advance: boolean;
};

/** 트리거를 이루는 조각. `unit: null`이 구두점(`. `)이고, 렌더에서 aria-hidden으로 나갑니다. */
export type DateTriggerPart = { unit: WheelUnit | null; text: string };

/** 기계(컴포넌트)가 시점 값 모델에 기대하는 계약. 기간(duration) 모델이 생기면
 *  같은 모양을 구현합니다 — 설계 스펙 §3.3·§12. */
export type WheelModel = {
  units: WheelUnit[];                                   // 사다리 순서
  // 그릴 열. 2b-1에서 `WheelUnit`(여섯 단위)까지 넓혔습니다 — 컴포넌트가 이 반환값을
  // 그대로 받습니다(§2b-1). 이 타입은 나중 단계에서 다시 넓어집니다 — 오전/오후는
  // 단위가 아니라서 WheelUnit[]에 담을 수 없습니다(설계 스펙 §7).
  columns(fields: WheelUnit[]): WheelUnit[];
  // fields는 Task 3부터 값 형식을 고릅니다(§5) — 안 넘기면 예전처럼 연·월·일입니다.
  // 옵션인 이유는 위 DEFAULT_FIELDS 주석과 같습니다: tests/instantModel.test.ts가
  // 이 다섯을 fields 없이 직접(그리고 instantModel을 거쳐) 부르는 기존 호출을
  // 그대로 유지합니다.
  isValid(value: string, fields?: WheelUnit[]): boolean;
  normalize(value: string, fields: WheelUnit[]): string;
  keyLength(fields: WheelUnit[]): number;
  shift(value: string, unit: WheelUnit, direction: number, fields?: WheelUnit[], step?: WheelStep): string;
  setUnit(value: string, unit: WheelUnit, amount: number, fields?: WheelUnit[], step?: WheelStep): string;
  /* `hour`는 3단계에서 붙었습니다(스펙 §7·§10) — 안 넘기면 24시간제로, 지금까지와
   * 글자 하나도 다르지 않습니다. **모델은 전역 설정을 읽지 않습니다**: 기계가
   * 구독해서 읽고 인자로 내려보냅니다(이 파일은 아무것도 import 하지 않습니다). */
  label(value: string, unit: WheelUnit, weekdays: string[], fields?: WheelUnit[], hour?: HourDisplay): string;
  triggerParts(source: string, fields: WheelUnit[], typing: { unit: WheelUnit; digits: string } | null, hour?: HourDisplay): DateTriggerPart[];
  /* `hourFormat`은 3단계에서 붙었습니다(스펙 §7) — 12시간제면 시 열의 타이핑 상한이
   * 12이고, 그때 확정되는 수는 **값이 아니라 12시간 읽기**입니다. 그것을 값으로
   * 되돌리는 것이 `hourFromTwelve`입니다. 안 넘기면 24시간제로, 지금까지와 같습니다. */
  /** ⚠️ **`fields`가 필요한 이유는 기간 모델이 알려 줬습니다.** 그 모델은 상한이 열 조합에
   *  달려 있어(그리는 열 중 맨 위가 무제한) `fields` 없이는 "이 첫 자리로 두 자리가 될 수
   *  있나"를 답할 수 없습니다. 시점 모델은 상한이 문맥과 무관해서 이 인자 없이도 됐고,
   *  그래서 계약이 오랫동안 시점 모양이었습니다 — 두 번째 구현이 드러낸 네 번째 자리입니다. */
  typeDigit(unit: WheelUnit, buffer: string, digit: string, hourFormat?: HourFormat, fields?: WheelUnit[]): TypingStep;
  flushBuffer(unit: WheelUnit, buffer: string, hourFormat?: HourFormat): number | null;
  /** 12시간 읽기를 값으로. **선택입니다** — 기간처럼 오전/오후가 없는 모델은 안 냅니다.
   *  기계는 `meridiem`이 `null`이 아닐 때만 부릅니다. */
  hourFromTwelve?(reading: number, half: "am" | "pm"): number;
  /** **값이 없을 때 쓸 씨앗값.** 모든 모델이 답할 수 있습니다 — 시점은 "지금",
   *  기간은 "0". 빈 값으로 연 픽커의 기준값이자 씨앗 버튼이 확정하는 값입니다.
   *
   *  🔴 이 멤버는 한동안 `now`였습니다. 그 이름이 **세 가지 일을 겸하고** 있었고
   *  (씨앗값 · 씨앗 버튼이 확정하는 값 · `resetTarget`의 기준값), 기간 모델을 실제로
   *  만들어 보니 **기간은 1번만 답할 수 있는데 2번을 거절할 방법이 없었습니다** —
   *  `지금` 버튼이 그대로 떴습니다. 버튼의 유무는 아래 `seedAction`이 답합니다. */
  seed(timeZone: string, fields?: WheelUnit[]): string;
  /** 팝오버 하단의 **씨앗 버튼**을 뭐라 부르나. `null`이면 **버튼 자체를 안 그립니다.**
   *
   *  🔴 이 자리에 한동안 `family(fields): ValueFamily`가 있었는데, 기계가 그 값으로
   *  실제로 하는 일은 **이 버튼과 안내 문구의 이름을 고르는 것뿐**이었습니다. 이름이
   *  답하는 질문("계열이 무엇인가")과 실제 쓰임이 달랐고, 그래서 기간이 `"time"`이라고
   *  거짓말해야 했습니다. 질문을 실제 쓰임대로 고쳐 적으면 기간의 답은 `null`입니다.
   *  `familyOf`는 모델 안에 그대로 있습니다 — 계약에서만 내려왔습니다. */
  seedAction(fields: WheelUnit[]): "today" | "now" | null;
  // 값 지식 둘이 기계(DateWheelPicker.tsx)에 남아 있었습니다(설계 스펙 §1단계 측정·
  // §12) — min/max 접두 비교(rangeKey/outOfRange/clampToRange)와 commitToday의 값
  // 분해. 여기 셋이 그 둘을 마저 모델로 옮깁니다 — outOfRange/clampToRange는 위
  // 순수 함수 그대로, parts는 parseValue 그대로입니다(설계 스펙 §12, 2b-2).
  outOfRange(value: string, bounds: { min?: string; max?: string }, fields: WheelUnit[]): boolean;
  clampToRange(value: string, bounds: { min?: string; max?: string }, fields: WheelUnit[]): string;
  parts(value: string, fields: WheelUnit[]): UnitParts | null;
  /** 오전/오후 조작이 존재하는가 + 지금 어느 절반인가(3단계, 스펙 §7). 시 열이 없으면
   *  `null` — `family`와 같은 이유로 여기 있습니다(기계가 단위 이름을 알지 않게). */
  meridiem(value: string, fields: WheelUnit[]): "am" | "pm" | null;
  /** 행을 길게 눌렀을 때 그 열이 갈 값(오너 리포트 4번). 연도만 "지금", 나머지는 바닥값.
   *  `null`이면 기계는 아무것도 하지 않습니다. */
  resetTarget(unit: WheelUnit, nowValue: string, fields: WheelUnit[]): number | null;
  /** 붙여넣은 글자를 값으로(Ctrl+V). **읽을 수 없으면 `null`이고 기계는 그때 아무것도
   *  하지 않습니다** — 붙여넣기 실패가 값을 지우면 사용자는 되돌릴 것도 없이 잃습니다.
   *  `family`·`meridiem`과 같은 이유로 여기 있습니다: 구분자·자릿수·오전오후를 읽는 것은
   *  전부 **값 지식**이고, 기계가 그걸 알면 §3.2가 금지한 자리로 돌아갑니다. */
  parsePasted(text: string, fields: WheelUnit[], hour?: HourDisplay): string | null;
  /** 그 열의 격자 간격(설계 스펙 §8). 기계가 "이 값이 격자 위인가"를 물을 때 씁니다. */
  stepOf(unit: WheelUnit, step?: WheelStep): number;
  /** 팝오버에서 **그 열 뒤에 붙일 기호**(기간의 `d`·`h`·`m`). `null`이면 안 그립니다.
   *
   *  🔴 시각 열 사이의 `:`와는 **다른 것**입니다. 저건 두 열을 잇는 **구분자**라 열
   *  앞에 오고 CSS가 `data-unit`으로 직접 그립니다. 이건 각 열이 무엇인지 말하는
   *  **단위 표시**라 열 뒤에 옵니다. 기간은 열 조합이 자유로워서(연·월만, 일·시만 …)
   *  **자리만으로는 어느 열인지 못 읽습니다** — 트리거와 같은 이유입니다. */
  columnMark?(unit: WheelUnit, fields: WheelUnit[]): string | null;
  /** 값 전체를 각 열의 격자로 내립니다. `지금` 버튼과 빈 값의 기준값처럼 **여러 열이
   *  한꺼번에 정해지는 자리**가 씁니다 — 없으면 타이핑과 버튼이 같은 수에 다르게 도착합니다. */
  snapValue(value: string, fields: WheelUnit[], step?: WheelStep): string;
};

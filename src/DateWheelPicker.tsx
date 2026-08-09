/* 3열 휠 날짜 선택기 — 원본: frontend/src/components/DateWheelPicker.tsx
 * 필요한 CSS: tokens.css, surfaces.css, date-picker.css
 *
 * 네이티브 <input type="date">를 쓰지 않는 이유: 브라우저마다 캘린더 UI가 달라
 * 디자인을 통일할 수 없고, min/max 처리와 모바일 동작이 제각각이기 때문입니다.
 *
 * 핵심 규칙 — 연/월/일 컬럼은 서로 독립입니다:
 *   · 연도 컬럼은 연도만, 월은 그 해 안에서 1↔12 순환, 일은 그 달 안에서 1↔말일 순환
 *   · 연·월이 바뀌어 일이 유효하지 않게 되면 목적지 달의 말일로 잘라내기만 하고
 *     절대 다른 컬럼으로 자리올림하지 않습니다
 *   · 데스크톱 휠·화살표는 커서가 있는 컬럼만, 모바일 스와이프·키보드는 활성 컬럼만
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type WheelEvent as ReactWheelEvent } from "react";
import { createPortal } from "react-dom";

import { flushBuffer, lastDayOf, typeDigit, withUnitValue } from "./dateWheelTyping";
import { useBackToClose, useEscapeToClose } from "./hooks";
import { dropdownViewportSpace, isPrimaryButton } from "./positioning";

export type DateWheelUnit = "year" | "month" | "day";

/** 기본은 연·월·일 3열. 상수로 둬서 기본값일 때 매 렌더 새 배열이 생기지 않게 합니다. */
const DEFAULT_DATE_WHEEL_FIELDS: DateWheelUnit[] = ["year", "month", "day"];

export type DateWheelLabels = {
  /** 값이 비었을 때 트리거 문구 */
  placeholder: string;
  /** 팝오버 머리말의 조작 안내 */
  hint: string;
  today: string;
  clear: string;
  done: string;
  previous: string;
  next: string;
  /** 팝오버 자체의 접근성 이름에 붙는 접미사 */
  select: string;
  /** 일요일부터 7개 */
  weekdays: string[];
  units: { year: string; month: string; day: string };
};

export const DEFAULT_DATE_WHEEL_LABELS: DateWheelLabels = {
  placeholder: "날짜 선택",
  hint: "휠·스와이프·방향키·숫자 입력 · Ctrl+; 오늘",
  today: "오늘",
  clear: "비우기",
  done: "완료",
  previous: "이전",
  next: "다음",
  select: "선택",
  weekdays: ["일", "월", "화", "수", "목", "금", "토"],
  units: { year: "연도", month: "월", day: "일" },
};

/** 지정한 시간대의 오늘을 YYYY-MM-DD로. sv-SE 로케일이 ISO 형식을 내줍니다. */
export function todayIn(timeZone: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date());
}

function shiftDateValue(value: string, unit: DateWheelUnit, direction: number) {
  const date = new Date(value + "T00:00:00Z");
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  // 말일은 dateWheelTyping.ts의 lastDayOf로 구합니다 — new Date(Date.UTC(year, ...))는
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

/** 양끝 ±3은 보이지 않지만 미리 그려두는 프리로드 행입니다. */
const DATE_WHEEL_OFFSETS = [-3, -2, -1, 0, 1, 2, 3];
type DateWheelMotion = { sequence: number; direction: "next" | "previous" };

function validDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** 남은 최소 단위 기준 비교 길이. 일 있으면 10(YYYY-MM-DD), 월까지면 7(YYYY-MM), 연만이면 4.
 *  연·월 픽커(일 없음)에서 min/max를 "월" 단위로 비교하게 만드는 핵심입니다 —
 *  일이 01로 고정돼도, 예산이 7월 중순부터 시작(min="2026-07-15")하면 7월 전체가 선택 가능해야 합니다. */
function rangeKeyLength(fields: DateWheelUnit[]) {
  return fields.includes("day") ? 10 : fields.includes("month") ? 7 : 4;
}

/** 빠진 열을 01로 채웁니다. 월 없으면 월=01, 일 없으면 일=01. 값 형식은 늘 YYYY-MM-DD. */
function normalizeToFields(value: string, fields: DateWheelUnit[]) {
  const [year, month, day] = value.split("-");
  return `${year}-${fields.includes("month") ? month : "01"}-${fields.includes("day") ? day : "01"}`;
}

function dateWheelLabel(value: string, unit: DateWheelUnit, weekdays: string[]) {
  const date = new Date(value + "T00:00:00Z");
  if (unit === "year") return String(date.getUTCFullYear());
  if (unit === "month") return String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${String(date.getUTCDate()).padStart(2, "0")} ${weekdays[date.getUTCDay()]}`;
}

/** 세그먼트가 지키는 자릿수. 버퍼가 덜 찼을 때 이 길이까지 `_`로 채웁니다. */
const DATE_WHEEL_SEGMENT_WIDTH: Record<DateWheelUnit, number> = { year: 4, month: 2, day: 2 };

/** 트리거를 이루는 조각. `unit: null`이 구두점(`. `)이고, 렌더에서 aria-hidden으로 나갑니다. */
type DateTriggerPart = { unit: DateWheelUnit | null; text: string };

/**
 * 트리거 문구를 **세그먼트와 구두점으로 쪼갭니다**(설계 스펙 §4.5).
 *
 * **조각 텍스트를 순서대로 이으면 예전 `formatDateTrigger`가 만들던 문자열과 글자 하나까지
 * 같습니다.** 트리거를 `textContent` 하나로 보는 테스트가 스무 곳 넘게 있고, 그것들이 손대지
 * 않은 채로 계속 참이어야 이 변경이 "표시 구조만 바꿨다"는 뜻이 됩니다. 구두점을 세그먼트에
 * 붙여 넣거나(`"2026. "`) 사이 공백을 CSS 여백으로 옮기면 그 등가성이 조용히 깨집니다.
 *
 * **버퍼는 자리를 지켜 그립니다** — "20" → `20__`, "203" → `203_`, 월 "1" → `1_`.
 * 친 만큼만 그리는 안(`203. 07. 12.`)은 기각됐습니다: 자릿수가 늘었다 줄었다 하며 필드 폭이
 * 요동치고, 세 자리 `203`이 순간적으로 유효한 연도처럼 읽힙니다. **폭이 흔들리지 않는 것이
 * 이 표시 방식의 유일한 이유**이므로 `css/date-picker.css`의 `.date-wheel-segment`가
 * `tabular-nums`를 겁니다 — 둘 중 하나만 있으면 아무 뜻이 없습니다.
 */
function dateTriggerParts(source: string, fields: DateWheelUnit[], typing: { unit: DateWheelUnit; digits: string } | null): DateTriggerPart[] {
  const [year, month, day] = source.split("-");
  function segment(unit: DateWheelUnit, text: string): DateTriggerPart {
    return { unit, text: typing?.unit === unit && typing.digits ? typing.digits.padEnd(DATE_WHEEL_SEGMENT_WIDTH[unit], "_") : text };
  }
  const parts: DateTriggerPart[] = [segment("year", year)];
  if (!fields.includes("month")) return [...parts, { unit: null, text: "." }];
  parts.push({ unit: null, text: ". " }, segment("month", month));
  if (!fields.includes("day")) return [...parts, { unit: null, text: "." }];
  return [...parts, { unit: null, text: ". " }, segment("day", day), { unit: null, text: "." }];
}

export type DateWheelPickerProps = {
  /** YYYY-MM-DD, 또는 빈 문자열 */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  /** 표시할 열. 기본은 연·월·일 3열. `["year", "month"]`로 주면 연·월 픽커가 됩니다.
   *  빠진 열은 값에서 01로 정규화되고(월 없으면 월=01, 일 없으면 일=01),
   *  min/max 비교도 남은 최소 단위(연·월·일)로만 이뤄집니다. 값 형식은 늘 YYYY-MM-DD. */
  fields?: DateWheelUnit[];
  allowClear?: boolean;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  /** 기본값은 한국어. 필요한 키만 덮어쓰면 됩니다. */
  labels?: Partial<DateWheelLabels>;
  /** "오늘"의 기준 시간대 */
  timeZone?: string;
  /** 모바일에서 하단 고정 바를 피하려고 비워둘 높이 */
  mobileBottomInset?: number;
};

export function DateWheelPicker({ value, onChange, min, max, fields = DEFAULT_DATE_WHEEL_FIELDS, allowClear = false, ariaLabel = "날짜", id, disabled = false, labels: labelOverrides, timeZone = "Asia/Seoul", mobileBottomInset = 78 }: DateWheelPickerProps) {
  const labels = { ...DEFAULT_DATE_WHEEL_LABELS, ...labelOverrides, units: { ...DEFAULT_DATE_WHEEL_LABELS.units, ...labelOverrides?.units } };
  const [open, setOpen] = useState(false);
  // 겹쳐 있으면 가장 안쪽만 닫힙니다 — 다이얼로그 안에서 열렸을 때 다이얼로그까지 닫으면 안 됩니다.
  // Escape는 이 파일 전체에서 "값을 바꾸지 않고 닫기"를 뜻합니다 — flushTyping을
  // 부르지 않고 버퍼만 버립니다. 다른 모든 떠나는 경로(Tab·화살표·Enter)와의
  // 유일한 예외입니다.
  useEscapeToClose(open, () => { setTyping(null); setOpen(false); triggerRef.current?.focus({ preventScroll: true }); });
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [columnMotion, setColumnMotion] = useState<Record<DateWheelUnit, DateWheelMotion>>({
    year: { sequence: 0, direction: "next" },
    month: { sequence: 0, direction: "next" },
    day: { sequence: 0, direction: "next" },
  });
  const [activeUnit, setActiveUnit] = useState<DateWheelUnit>(fields[0] ?? "year");
  // activeUnit은 소비자가 런타임에 fields를 바꿀 수 있어(예: 일간/월간 토글) fields
  // 밖의 열을 계속 가리킬 수 있습니다. 그 원본 상태를 그대로 믿지 않고, 매 렌더
  // fields 안으로 클램프한 값을 씁니다 — 그렇지 않으면 columnRefs.current.get(activeUnit)이
  // undefined가 되어 아래 포커스 이펙트가 조용히 멈추고, 팝오버가 마우스로만 조작
  // 가능해집니다(방향키가 죽습니다).
  const resolvedActiveUnit = fields.includes(activeUnit) ? activeUnit : (fields[0] ?? "year");
  // 지금 치고 있는 열과 그 자릿수. 자릿수가 차면 typeDigit이 곧바로 확정하고 비웁니다.
  // 덜 찬 채로 열을 떠날 때는 경로에 따라 갈립니다:
  //   · 확정(flushTyping/commitAndClose가 해석해 값에 반영하고 비웁니다):
  //     Tab·Shift+Tab·←·→·↑·↓·Enter·완료 버튼.
  //   · 폐기(해석하지 않고 그냥 비웁니다): Escape·휠·포인터(스와이프·행 클릭·컬럼
  //     클릭)·바깥 클릭·뒤로가기 등 그 외의 이유로 팝오버가 닫힐 때.
  // ("팝오버 닫힘은 flushTyping이 처리한다"는 예전 버전의 이 주석은 틀렸었습니다 —
  // 완료 버튼을 뺀 나머지 닫힘 경로(바깥 클릭·뒤로가기)는 커밋하지 않고 그냥
  // 버립니다. 그 안전망은 아래 포커스 이펙트의 `!open` 분기에 있습니다.)
  const [typing, setTyping] = useState<{ unit: DateWheelUnit; digits: string } | null>(null);
  // 완료 피드백(css/surfaces.css .dropdown-value-commit) 커밋 카운터 — commitAndClose에서만,
  // 그것도 확정된 값이 **이 세션이 시작될 때의 값**(sessionStartValueRef, 아래)과 실제로
  // 다를 때만 올립니다. 0에서 시작해 첫 마운트는 애니메이션이 돌지 않고, 화살표·휠·
  // 타이핑 자체(자릿수가 차서 즉시 확정되는 경우 포함)·오늘·비우기 같은 다른 값 변경
  // 경로는 건드리지 않습니다 — 그 경로들은 "완료"가 아니라 매 조작마다 반짝이면 신호가
  // 아니라 소음이 됩니다. 계약은 PRINCIPLES.md §12.
  const [commitPulse, setCommitPulse] = useState(0);
  // 이번 세션에 비우기·Delete로 값을 지운 적이 있는가. commitAndClose의
  // "비어 있으면 baseValue로 채운다" 되살림 분기(아래)를 막는 유일한 용도입니다 — 이게
  // 없으면 "값 없이 처음 연 픽커"와 "방금 막 지운 픽커"를 구분할 수 없어, 완료가 방금
  // 지운 값을 도로 살려냅니다(오너가 실측으로 재현: 오늘 → 비우기 → 완료).
  //
  // 리셋 시점은 sessionStartValueRef와 똑같습니다 — 트리거 focusin과 팝오버 닫힘,
  // **여는 순간에는 절대 리셋하지 않습니다**(설계 스펙 §6.4). 예전에는 여는 순간
  // 리셋했고, 그래서 닫힌 채 Delete로 지운 기억이 ↓로 여는 순간 지워져 완료가 방금
  // 지운 값을 오늘로 되살렸습니다(측정된 결함 — tests의 "세션 수명" 블록이 재현합니다).
  // 지우지 않고 닫았다가 다시 열어 아무것도 안 건드리고 완료를 누르면 원래 의도(휠에
  // 보이는 날짜를 확정)대로 동작해야 하므로, 닫힘에서의 리셋은 그대로 필요합니다.
  const clearedRef = useRef(false);
  // 이 세션이 시작될 때 value가 무엇이었는지 — 세션의 시작은 트리거가 포커스를 얻은
  // 순간과 팝오버가 닫힌 순간입니다(§6.4). commitAndClose의 펄스 조건은 이 값과
  // 비교합니다(커밋 시점의 value가 아니라) — 이 컨트롤은 화살표 한 번, 휠 한 칸마다도
  // onChange를 불러 value를 바로 바꿉니다. 그래서 "커밋 시점 값 vs 그 순간 value"로
  // 비교하면, 화살표로 옮긴 뒤 완료를 눌러도 그 사이 value가 이미 옮겨진 값으로
  // 갱신돼 있어 "안 바뀌었다"고 잘못 읽습니다(오너가 실측: 화살표 → 완료인데 신호가
  // 전혀 안 뜸). 세션이 시작될 때의 값과 비교해야 "세션이 시작된 뒤로 실제로 뭔가
  // 바뀌었는가"를 제대로 묻는 것이 됩니다. Select는 방향키가 onChange를 부르지 않고
  // 고를 때 한 번만 커밋하므로 이 차이가 안 나고, 세션의 시작도 트리거 포커스와 메뉴
  // 열림이 사실상 같은 순간이라 "열린 순간"으로 둡니다 — 두 컨트롤이 여기서만 갈리는
  // 이유는 닫힌 채로도 값이 바뀔 수 있는 쪽이 날짜 피커뿐이기 때문입니다(§6.4).
  const sessionStartValueRef = useRef(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ unit: DateWheelUnit; y: number; pointerId: number; value: string } | null>(null);
  const suppressColumnClickRef = useRef(false);
  const columnRefs = useRef(new Map<DateWheelUnit, HTMLElement>());
  // 이미 이 열에 포커스를 적용했는가 — 아래 포커스 이펙트를 멱등하게 만든다.
  const focusedColumnRef = useRef<DateWheelUnit | null>(null);

  /**
   * 포커스가 팝오버 안에 있을 때만 회수한 뒤 닫습니다. 포커스가 열 안에 있는 채로
   * 팝오버가 언마운트되면 포커스가 body로 떨어지고 다음 Tab이 문서 처음부터
   * 시작합니다(다이얼로그 안이라면 포커스 스코프 밖으로 나갑니다).
   *
   * "포커스가 실제로 안에 있을 때만"인 이유: 우리가 옮긴 포커스만 되돌리고,
   * 사용자가 그 사이 다른 곳을 눌러 옮긴 포커스는 뺏지 않습니다.
   */
  function closeAndReclaimFocus() {
    const popover = popoverRef.current;
    if (popover && document.activeElement && popover.contains(document.activeElement)) {
      triggerRef.current?.focus({ preventScroll: true });
    }
    setOpen(false);
  }

  // 뒤로가기로 닫습니다. 포커스를 팝오버 안으로 옮기므로 회수도 함께 합니다.
  useBackToClose(open, closeAndReclaimFocus);

  // 세션 기준값을 찍는 두 지점 중 하나 — **팝오버가 닫힐 때**입니다(다른 하나는
  // 트리거의 onFocus). 설계 스펙 §6.4의 계약: 기준값은 이 컨트롤이 마지막으로
  // "조용해진" 순간에 찍고, **여는 순간에는 절대 찍지 않습니다.**
  //
  // 예전에는 `if (open)`이었습니다. 닫힌 상태가 조작 가능해지면(Delete·Ctrl+;는 이미
  // 그렇습니다) 그 수명이 틀립니다 — 닫힌 채 지운 기억과 닫힌 채 바뀐 값이 여는 순간
  // 통째로 지워집니다. 그 결함은 재현했고 테스트로 고정돼 있습니다("세션 수명" 블록).
  //
  // **닫힘 리셋이 commitAndClose보다 뒤에 와야 합니다.** commitAndClose가 clearedRef를
  // 읽은 뒤에 지워져야 하는데, 이펙트는 상태 갱신이 커밋된 뒤에 돌므로 자연히 그렇게
  // 됩니다. commitAndClose 안에서 직접 리셋하면 읽기 전에 지워질 수 있습니다.
  //
  // 마운트에서도 한 번 돕니다(open이 false이므로). 그래도 되는 정도가 아니라 그게
  // 맞습니다 — 마운트 직후는 아직 아무 조작도 없었으므로 그 순간의 value가 곧 기준값입니다.
  //
  // **focusout에는 아무것도 하지 않습니다.** 버리고 싶어지지만, 지금은 팝오버를 여는
  // 것 자체가 포커스를 열로 옮기므로(아래 포커스 이펙트) 트리거에서 focusout이 납니다 —
  // 세션 도중에 기준값이 사라집니다. 더 근본적으로 focusout은 "컨트롤을 떠났다"와
  // "컨트롤 안에서 옮겼다"를 구분하지 못하는 이벤트입니다. 찍기만 하고 버리지 않으면
  // 두 상태 모두에서 옳습니다(§6.4).
  //
  // 의존성 배열에 value를 일부러 넣지 않습니다. 넣으면 **닫혀 있는 동안** value가 바뀔
  // 때마다 이 이펙트가 다시 돌고, Delete가 그 자리에서 clearedRef를 도로 false로 지워
  // 위 결함이 그대로 돌아옵니다. 측정했습니다 — `[open, value]`로 바꾸면 "닫힌 채
  // Delete" 테스트가 빨개집니다.
  //
  // **열려 있는 동안은 걱정할 것이 없습니다.** 가드가 `if (open) return;`이라 이펙트가
  // 곧바로 빠져나가므로 세션 도중에 기준값이 덮어써질 수 없습니다. 이 자리에 한동안
  // "열려 있는 동안 화살표로 옮긴 뒤 완료해도 안 바뀌었다고 읽힌다"가 적혀 있었는데,
  // 그건 본문이 `if (open) { … }`이던 시절의 논거이고 가드를 뒤집은 순간 성립할 수 없게
  // 됐습니다(측정: `[open, value]`에서도 화살표→완료 신호는 그대로 뜹니다). 성립할 수
  // 없는 실패 모드를 근거로 남겨 두면 다음 사람이 반증하고 근거 전체를 못 믿게 되므로
  // 지웠습니다.
  useEffect(() => {
    if (open) return;
    clearedRef.current = false;
    sessionStartValueRef.current = value;
  }, [open]);

  // 남은 최소 단위로만 비교합니다(연·월 픽커면 "월" 단위). 함수 선언이라 baseValue보다
  // 아래에 있어도 호출 시점엔 keyLen이 이미 초기화돼 있습니다.
  const keyLen = rangeKeyLength(fields);
  function rangeKey(v: string) { return v.slice(0, keyLen); }
  function outOfRange(v: string) { return (!!min && rangeKey(v) < rangeKey(min)) || (!!max && rangeKey(v) > rangeKey(max)); }
  function clampToRange(v: string) {
    const normalized = normalizeToFields(v, fields);
    if (min && rangeKey(normalized) < rangeKey(min)) return normalizeToFields(min, fields);
    if (max && rangeKey(normalized) > rangeKey(max)) return normalizeToFields(max, fields);
    return normalized;
  }
  const baseValue = clampToRange(validDateValue(value) ? value : todayIn(timeZone));

  // 트리거가 그릴 조각들. null이면 placeholder를 그린다는 뜻입니다.
  //
  // **값이 비어 있어도 버퍼가 있으면 placeholder를 버리고 baseValue 세그먼트를 그립니다**
  // (설계 스펙 §4.5). 팝오버의 휠은 빈 값일 때 이미 baseValue를 그리고 있으므로, 화면 두
  // 곳이 같은 순간에 서로 다른 것을 말하지 않게 하는 것입니다.
  //
  // 값이 유효하지 않은데(빈 값·깨진 값) 버퍼도 없으면 예전 formatDateTrigger와 똑같이
  // placeholder입니다 — 판정도 그때와 같은 validDateValue입니다.
  const hasDateValue = validDateValue(value);
  const triggerParts = hasDateValue || typing ? dateTriggerParts(hasDateValue ? value : baseValue, fields, typing) : null;

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!isPrimaryButton(event)) return;   // 마우스 뒤로/앞으로 버튼은 닫기가 아닙니다
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside, true);
    return () => { document.removeEventListener("pointerdown", closeOutside, true); };
  }, [open]);

  // 컬럼 위에서 휠을 굴릴 때 뒤 페이지가 같이 스크롤되지 않게 막습니다.
  useEffect(() => {
    const popover = popoverRef.current;
    if (!open || !position || !popover) return;
    function preventPageWheel(event: WheelEvent) {
      if (event.target instanceof Element && event.target.closest(".date-wheel-column")) event.preventDefault();
    }
    popover.addEventListener("wheel", preventPageWheel, { passive: false });
    return () => popover.removeEventListener("wheel", preventPageWheel);
  }, [open, position]);

  // 팝오버는 body 포털에 fixed로 놓이므로 좌표를 직접 계산합니다.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setPosition(null); return; }
    function placePicker() {
      if (!triggerRef.current) return;
      const desiredHeight = 318;
      const gap = 6;
      const bottomInset = window.innerWidth <= 760 ? mobileBottomInset : 8;
      const { rect, above, below, edge } = dropdownViewportSpace(triggerRef.current, bottomInset);
      const openAbove = below < desiredHeight && above > below;
      const available = Math.max(230, (openAbove ? above : below) - gap);
      const maxHeight = Math.min(desiredHeight, available);
      const viewportLeft = window.visualViewport?.offsetLeft ?? 0;
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const width = Math.min(Math.max(rect.width, 292), viewportWidth - edge * 2);
      const left = Math.min(Math.max(viewportLeft + edge, rect.left), viewportLeft + viewportWidth - width - edge);
      setPosition({
        top: openAbove ? Math.max(edge, rect.top - maxHeight - gap) : rect.bottom + gap,
        left,
        width,
        maxHeight,
      });
    }
    placePicker();
    window.addEventListener("resize", placePicker);
    document.addEventListener("scroll", placePicker, true);
    window.visualViewport?.addEventListener("resize", placePicker);
    return () => {
      window.removeEventListener("resize", placePicker);
      document.removeEventListener("scroll", placePicker, true);
      window.visualViewport?.removeEventListener("resize", placePicker);
    };
  }, [open, mobileBottomInset]);

  /**
   * 팝오버가 열리면 활성 열에 진짜 포커스를 줍니다.
   *
   * **`position`이 의존성에 있어야 하는 이유:** 팝오버는 좌표가 정해진 뒤에야
   * 마운트됩니다(`open && position &&`). `open`이 켜지는 커밋에는 팝오버가 DOM에
   * 없으므로 그때만 시도하면 포커스가 영영 가지 않습니다.
   *
   * **그런데 `position`만 넣으면 안 됩니다.** 좌표는 스크롤·리사이즈마다 새 객체가
   * 되고, 그때마다 다시 돌면 사용자가 옮겨 둔 포커스를 되끌어옵니다. 그래서 "이미
   * 이 열에 적용했는가"를 ref로 들고 멱등하게 만듭니다.
   *
   * `preventScroll`을 쓰는 이유는 이 파일의 다른 focus 복귀와 같습니다 — 네이티브
   * 포커스 스크롤은 조상 스크롤 컨테이너까지 움직입니다.
   */
  useLayoutEffect(() => {
    // 완료 버튼·바깥 클릭처럼 열을 거치지 않고 팝오버 자체가 닫히는 경로도 있습니다.
    // 닫힘은 "열을 떠난다"의 상위 집합이므로 여기서도 버퍼를 비워, 다음에 열었을 때
    // 지난 버퍼가 남아 있지 않게 합니다. `typing`이 이미 null이면 React가 같은 값의
    // setState를 걸러내 리렌더를 건너뛰므로(bail-out) 무한 렌더로 이어지지 않습니다 —
    // 이 이펙트의 의존성 배열에도 `typing`은 들어 있지 않아, typing을 바꿔도 이
    // 이펙트가 다시 실행되지는 않습니다.
    if (!open) { focusedColumnRef.current = null; setTyping(null); return; }
    if (focusedColumnRef.current === resolvedActiveUnit) return;
    const column = columnRefs.current.get(resolvedActiveUnit);
    if (!column) return;   // 좌표가 아직 없어 마운트 전 — 정해지면 다시 온다
    focusedColumnRef.current = resolvedActiveUnit;
    column.focus({ preventScroll: true });
  }, [open, resolvedActiveUnit, position]);

  function shiftedFrom(sourceValue: string, unit: DateWheelUnit, amount: number) {
    const next = normalizeToFields(shiftDateValue(sourceValue, unit, amount), fields);
    // 연도가 10000 이상(또는 음수)이 되면 Date#toISOString()이 확장 표기
    // (+010000-07-12)로 바뀌고, 그 뒤 slice(0, 10)·normalizeToFields를 거치며
    // "+010000-07-undefined" 같은 깨진 문자열이 된다. validDateValue는 이미
    // 컴포넌트 전체가 "쓸 수 없는 값"의 신호로 쓰는 판정이므로, 여기서도 그대로
    // null을 돌려줍니다 — outOfRange 판정으로는 min/max가 없는 필드에서 이 값을
    // 걸러내지 못합니다.
    if (!validDateValue(next)) return null;
    if (outOfRange(next)) return null;
    return next;
  }

  function shifted(unit: DateWheelUnit, amount: number) {
    return shiftedFrom(baseValue, unit, amount);
  }

  function markColumnMotion(unit: DateWheelUnit, amount: number) {
    if (amount) {
      setColumnMotion((current) => ({
        ...current,
        [unit]: { sequence: current[unit].sequence + 1, direction: amount > 0 ? "next" : "previous" },
      }));
    }
  }

  function commitShift(sourceValue: string, unit: DateWheelUnit, amount: number) {
    const next = shiftedFrom(sourceValue, unit, amount);
    if (!next) return null;
    markColumnMotion(unit, amount);
    onChange(next);
    return next;
  }

  function applyShift(unit: DateWheelUnit, amount: number) {
    commitShift(baseValue, unit, amount);
  }

  /**
   * 타이핑으로 값을 확정합니다. **`commitShift`를 타면 안 됩니다** —
   * 그쪽은 `markColumnMotion`이 열의 sequence를 올리고, 값 컨테이너의 key가
   * `${unit}-${sequence}`라서 행 일곱 개가 통째로 리마운트되며 휠 이동
   * 애니메이션이 재생됩니다. 숫자 하나마다 210ms 전환이 도는 셈입니다.
   * 타이핑은 휠 이동이 아닙니다.
   */
  function commitTyped(unit: DateWheelUnit, amount: number) {
    const next = clampToRange(withUnitValue(baseValue, unit, amount));
    onChange(next);
    return next;
  }

  /**
   * 열을 떠날 때 버퍼를 해석해 확정합니다. 확정할 수 없으면 조용히 버립니다.
   *
   * 반환값(방금 확정한 새 값)을 호출부가 받아 써야 하는 경우가 있습니다 —
   * ArrowUp/ArrowDown처럼 확정 뒤 그 값에서 한 칸 더 움직이는 경로가 그렇습니다.
   * `commitTyped`의 `onChange`는 `baseValue`(이 렌더에서 고정된 값 prop)로 계산한
   * 결과를 넘길 뿐, 그 자리에서 prop을 갱신하지 않습니다. 뒤이어 또 `baseValue`를
   * 읽는 두 번째 `onChange`를 부르면(예: 예전 `applyShift`) 나중 호출이 그대로
   * 값을 덮어써 방금 확정한 값이 사라집니다 — moveSwipe/finishSwipe가 이미
   * `commitShift`에 출발 값을 명시로 넘겨 이 문제를 피하는 것과 같은 이유입니다.
   * `commitAndClose`(Enter·완료 버튼이 공유)도 같은 함정을 피하려고 `value` prop
   * 대신 이 반환값을 씁니다.
   */
  function flushTyping(unit: DateWheelUnit) {
    if (typing?.unit !== unit || !typing.digits) return null;
    const amount = flushBuffer(unit, typing.digits);
    setTyping(null);
    if (amount === null) return null;
    return commitTyped(unit, amount);
  }

  /**
   * Enter와 완료 버튼이 공유하는 닫기 경로입니다. 원래 각자 따로 구현돼 있었는데
   * 완료 버튼 쪽이 flushTyping을 부르지 않아 치던 숫자를 버렸습니다 — 하나로
   * 합쳐 다시 갈라지지 못하게 합니다.
   *
   * 완료 버튼의 onClick에는 unit이 없습니다. 버퍼(`typing`) 자신이 자기 unit을
   * 이미 들고 있으므로 인자로 받지 않고 상태에서 직접 읽습니다 — 버퍼가 없으면
   * 아무것도 확정하지 않습니다.
   *
   * `flushed`가 null이면(버퍼가 없었거나 해석할 수 없었으면) `value`가 비어 있고
   * **이번 세션에 비우기·Delete로 지운 적이 없을 때만** baseValue로 채웁니다. 지운
   * 적이 있으면(clearedRef.current) 이 분기를 건너뛰어, 완료가 방금 지운 값을 되살리지
   * 않습니다 — clearedRef 선언부에 이 결함(오너가 실측: 오늘 → 비우기 → 완료)의 배경이
   * 있습니다. flushed가 있으면 그 onChange가 이미 값을 확정했으므로 여기서 또
   * baseValue로 덮어쓰면 안 됩니다 — `value` prop은 이 렌더의 클로저에 갇혀 있어(리렌더
   * 전) 방금 확정한 값을 반영하지 못한 채 여전히 "비어 있다"고 잘못 읽어 되돌려버립니다.
   * ArrowUp/ArrowDown에서 flushTyping이 이미 겪은 것과 같은 결함입니다.
   */
  function commitAndClose() {
    const flushed = typing ? flushTyping(typing.unit) : null;
    // 이 함수가 최종적으로 확정하는 값. 아래에서 실제로 바뀐 값이 있으면만 갱신합니다 —
    // 아무것도 안 바뀌면(예: 이미 오늘인 값 그대로 완료) committed는 value와 같은
    // 채로 남아 커밋 신호가 켜지지 않습니다.
    let committed = value;
    if (flushed !== null) {
      committed = flushed;
    } else if (!value && !clearedRef.current) {
      onChange(baseValue);
      committed = baseValue;
    }
    // Tab으로 떠나거나 바깥을 클릭해도 값은 남지만, 그건 "완료"를 누른 게 아니므로
    // 여기서만 올립니다 — Enter와 완료 버튼만 이 함수를 거칩니다. 그리고 확정된 값이
    // **이 세션이 시작될 때의 값**(sessionStartValueRef — 트리거가 포커스를 얻었거나
    // 팝오버가 닫힌 마지막 순간의 값)과 실제로 다를 때만 올립니다.
    // 이 순간의 `value`와 비교하면 안 됩니다 — 이 컨트롤은 화살표 한 번, 휠 한 칸마다도
    // onChange로 value를 곧바로 바꾸므로, 완료를 누르는 시점엔 이미 committed와 value가
    // 같아져 있어 "화살표로 옮긴 뒤 완료"가 항상 "안 바뀌었다"로 잘못 읽힙니다(오너가
    // 실측: 화살표 → 완료인데 신호가 전혀 안 뜸). 세션 시작 값과 비교해야 "이번에 연
    // 뒤로 뭔가 바뀌었는가"를 묻는 것이 됩니다. 이미 있던 값 그대로 완료하면(예: 오늘
    // 눌러 이미 오늘인 값을 다시 완료, 또는 아무것도 안 건드리고 완료) 아무 신호도
    // 없는 게 의도입니다 — 오너에게 확인받은 동작이고, 보완하지 않습니다.
    if (committed !== sessionStartValueRef.current) setCommitPulse((n) => n + 1);
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }

  /* 여기서 event.preventDefault()를 부르지 마세요.
   * React는 wheel/touchstart/touchmove를 루트(와 포털 컨테이너)에 passive로
   * 등록하므로 합성 이벤트에서의 preventDefault는 효과가 없고, 콘솔에
   * "Unable to preventDefault inside passive event listener invocation"만 남깁니다.
   * 페이지 스크롤 차단은 위 useEffect의 preventPageWheel(네이티브,
   * { passive: false })이 담당합니다. 이 핸들러는 값 변경만 합니다. */
  function handleWheel(event: ReactWheelEvent, unit: DateWheelUnit) {
    if (!event.deltaY) return;
    // 스펙: 휠은 스와이프·행 클릭과 같은 조작 계열이라 버퍼를 확정하지 않고 버립니다.
    // 안 비우면, 같은 열에서 자릿수 하나만 치고 휠을 굴려 값을 옮긴 뒤 Tab으로
    // 떠날 때 flushTyping이 그 묵은 숫자를 그대로 해석해 휠이 방금 맞춘 값을
    // 조용히 덮어씁니다.
    setTyping(null);
    setActiveUnit(unit);
    applyShift(unit, event.deltaY > 0 ? 1 : -1);
  }

  /** step 방향의 열로 포커스를 옮깁니다. 끝이면 아무것도 하지 않고 false를 돌려줍니다. */
  function moveColumn(unit: DateWheelUnit, step: 1 | -1) {
    const index = fields.indexOf(unit);
    const nextIndex = index + step;
    if (index === -1 || nextIndex < 0 || nextIndex >= fields.length) return false;
    setActiveUnit(fields[nextIndex]);
    return true;
  }

  /**
   * 열림·닫힘 양쪽에서 같게 동작하는 단축키. 여기서만 Ctrl/Meta를 봅니다 —
   * PRINCIPLES §11의 "Ctrl·Meta가 눌린 키는 처리하지 않는다"에 대한 명시적
   * 예외이고, 근거는 그 조항 옆에 적혀 있습니다.
   *
   * 문자가 아니라 `code`로 판정하는 이유: 배열에 따라 `;`가 Shift 조합이 되는
   * 키보드가 있어 `key`로 보면 새는 곳이 생깁니다.
   */
  function handleShortcut(event: ReactKeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.code === "Semicolon") {
      event.preventDefault();
      setTyping(null);
      onChange(clampToRange(todayIn(timeZone)));
      return true;
    }
    if (event.ctrlKey || event.metaKey) return false;
    if (event.key === "Delete" && allowClear) {
      event.preventDefault();
      setTyping(null);
      clearedRef.current = true;   // commitAndClose가 이 값을 baseValue로 되살리지 않도록 기억
      onChange("");
      return true;
    }
    return false;
  }

  function handleColumnKey(event: ReactKeyboardEvent, unit: DateWheelUnit) {
    // handleShortcut이 이 가드보다 반드시 앞에 와야 합니다 — 뒤에 두면 Ctrl+;가
    // 여기 걸려 handleShortcut에 영영 닿지 않습니다.
    if (handleShortcut(event)) return;
    // Ctrl·Meta가 눌린 키는 건드리지 않습니다 — 브라우저·OS 단축키입니다.
    if (event.ctrlKey || event.metaKey) return;
    const key = event.key;

    if (key >= "0" && key <= "9" && key.length === 1) {
      event.preventDefault();
      const buffer = typing?.unit === unit ? typing.digits : "";
      const step = typeDigit(unit, buffer, key);
      if (step.commit !== null) {
        setTyping(null);
        commitTyped(unit, step.commit);
        if (step.advance) moveColumn(unit, 1);
      } else {
        setTyping({ unit, digits: step.digits });
      }
      return;
    }

    if (key === "Backspace") {
      event.preventDefault();
      if (typing?.unit === unit && typing.digits) {
        // 버퍼가 없다는 상태는 항상 null 하나로만 표현합니다 — 빈 문자열 버퍼를
        // 살려두면 읽는 쪽마다 ""를 "없음"으로 따로 알아야 하고, 그 결과가 바로
        // 아래 렌더의 `??`가 빈 문자열을 걸러내지 못해 행이 통째로 비어 버리는 결함입니다.
        const digits = typing.digits.slice(0, -1);
        setTyping(digits ? { unit, digits } : null);
      }
      return;
    }

    if (key === "Enter") {
      // 완료 버튼과 같은 동작 — commitAndClose가 치던 숫자를 먼저 확정한 뒤 닫는다.
      event.preventDefault();
      commitAndClose();
      return;
    }

    if (key === "Tab") {
      // 떠나는 키. 기본 동작(다음 요소로)은 막지 않는다 — 포커스를 트리거로 옮겨
      // 두면 브라우저가 트리거 기준으로 다음 tabbable을 계산한다. keydown은 기본
      // Tab 동작보다 먼저 실행되므로 순서가 보장된다.
      flushTyping(unit);
      if (moveColumn(unit, event.shiftKey ? -1 : 1)) { event.preventDefault(); return; }
      triggerRef.current?.focus({ preventScroll: true });
      setOpen(false);
      return;
    }

    // 방향키는 안에서만 움직인다 — 끝에서는 제자리이고 팝오버를 닫지 않는다.
    if (key === "ArrowRight" || key === "ArrowLeft") {
      event.preventDefault();
      flushTyping(unit);
      moveColumn(unit, key === "ArrowRight" ? 1 : -1);
      return;
    }

    if (key !== "ArrowUp" && key !== "ArrowDown") return;
    event.preventDefault();
    setActiveUnit(unit);
    // 버퍼가 있으면 먼저 확정하고, 그 값에서 이어서 한 칸 움직인다. applyShift는
    // baseValue(이 렌더에서 고정된 옛 값)를 읽으므로 여기서 그대로 쓰면 방금
    // commitTyped가 넘긴 값을 뒤이은 onChange가 덮어써 버퍼 확정이 무효가 된다 —
    // flushTyping의 주석 참고.
    const flushed = flushTyping(unit);
    commitShift(flushed ?? baseValue, unit, key === "ArrowDown" ? 1 : -1);
  }

  /** 닫혀 있을 때 트리거에서 받는 키. 여는 것 하나만 담당합니다. */
  function handleTriggerKeyDown(event: ReactKeyboardEvent) {
    // 비활성 트리거는 포커스를 받을 수 없어 실제 브라우저에서는 키가 오지 않지만,
    // 테스트처럼 이벤트를 직접 디스패치하면 그 관문을 건너뜁니다.
    if (disabled) return;
    // disabled 검사가 handleShortcut보다 앞에 옵니다 — 비활성 필드는 어떤 키에도
    // 반응하지 않는다는 기존 불변식을 Delete/Ctrl+;도 지켜야 합니다.
    if (handleShortcut(event)) return;
    // handleShortcut이 이 가드보다 반드시 앞에 와야 합니다 — 뒤에 두면 Ctrl+;가
    // 여기 걸려 handleShortcut에 영영 닿지 않습니다.
    if (event.ctrlKey || event.metaKey) return;
    if (open) return;
    const key = event.key;
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter" && key !== " ") return;
    // <button>은 Enter를 keydown에서, Space를 keyup에서 click으로 바꿉니다. 막지 않으면
    // 그 click이 트리거의 onClick과 겹쳐 연 직후 곧바로 다시 닫습니다.
    event.preventDefault();
    setActiveUnit(fields[0] ?? "year");
    setOpen(true);
  }

  /* 스와이프는 30px 경계를 넘을 때마다 즉시 한 칸 커밋하고 나머지 거리는 손가락을
   * 계속 따라갑니다. 손을 뗄 때 한꺼번에 여러 칸이 튀는 것을 막습니다.
   *
   * 포인터 캡처는 target이 아니라 currentTarget(컬럼)에 겁니다. 한 칸 커밋될 때마다
   * 값 버튼들이 key 변경으로 다시 마운트되는데, 캡처를 그 버튼(target)에 걸었으면
   * 언마운트되며 캡처가 풀려, 포인터가 picker 밖으로 나가는 순간 move가 끊깁니다.
   * 컬럼은 슬라이드 내내 그대로라 캡처가 유지되고 밖에서도 계속 따라옵니다. */
  function moveSwipe(unit: DateWheelUnit, clientY: number, pointerId: number, buttons: number, column: HTMLElement) {
    if (buttons !== 1) return;
    const start = swipeRef.current;
    if (!start || start.unit !== unit || start.pointerId !== pointerId || !Number.isFinite(start.y) || !Number.isFinite(clientY)) return;
    let delta = clientY - start.y;
    if (Math.abs(delta) >= 30) {
      const direction = delta < 0 ? 1 : -1;
      const next = commitShift(start.value, unit, direction);
      if (next) {
        start.value = next;
        start.y += direction > 0 ? -30 : 30;
        suppressColumnClickRef.current = true;
        delta = clientY - start.y;
      } else {
        start.y = clientY;
        delta = 0;
      }
    }
    if (Math.abs(delta) > 2) suppressColumnClickRef.current = true;
    const offset = Math.max(-24, Math.min(24, delta));
    column.classList.toggle("dragging", Math.abs(offset) > 2);
    column.style.setProperty("--date-wheel-drag-offset", `${offset}px`);
  }

  function clearSwipeVisual(column: HTMLElement) {
    column.classList.remove("dragging");
    column.style.removeProperty("--date-wheel-drag-offset");
  }

  function releaseColumnClickSuppression() {
    if (suppressColumnClickRef.current) requestAnimationFrame(() => { suppressColumnClickRef.current = false; });
  }

  function finishSwipe(unit: DateWheelUnit, clientY: number, pointerId: number, column: HTMLElement) {
    const start = swipeRef.current;
    swipeRef.current = null;
    clearSwipeVisual(column);
    if (!start || start.unit !== unit || start.pointerId !== pointerId) { releaseColumnClickSuppression(); return; }
    if (Number.isFinite(start.y) && Number.isFinite(clientY)) {
      const delta = clientY - start.y;
      if (Math.abs(delta) >= 18) {
        suppressColumnClickRef.current = true;
        commitShift(start.value, unit, delta > 0 ? -1 : 1);
      }
    }
    releaseColumnClickSuppression();
  }

  return <div className={open ? "date-wheel-picker open" : "date-wheel-picker"} ref={rootRef}>
    {/* onFocus는 세션 기준값을 찍는 두 지점 중 나머지 하나입니다(다른 하나는 위의 닫힘
        이펙트) — 설계 스펙 §6.4. React의 onFocus는 native focusin에 대응합니다.

        **반드시 트리거 <button> 자신에 붙습니다. 바깥 rootRef div로 올리면 안 됩니다.**
        focusin은 버블하고, 팝오버는 포털이지만 React 트리에서는 그 div의 자식이라 합성
        이벤트가 그리로 올라갑니다 — div에 붙이면 팝오버를 여는 순간 포커스 이펙트가 열에
        준 focus가 곧바로 이 핸들러를 불러 "여는 순간에는 찍지 않는다"가 조용히 깨집니다
        (뮤테이션으로 실증: 핸들러를 div로 옮기면 "닫힌 채 Delete" 테스트가 빨개집니다).
        버튼에 붙이면 버블이 문제가 되지 않습니다 — 버튼 자신이 포커스를 받고, 그 안의
        <span>·<i>는 포커스를 받을 수 없기 때문입니다. */}
    <div className="date-wheel-trigger-shell"><button id={id} ref={triggerRef} type="button" className="date-wheel-trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onFocus={() => { sessionStartValueRef.current = value; clearedRef.current = false; }} onClick={() => {
      // 마우스로 열 때도 키보드 경로(handleTriggerKeyDown)와 같은 열로 시드합니다 —
      // Select.tsx:449의 마우스-키보드 일치 시딩과 같은 이유입니다. 닫혀 있을 때만
      // (=지금 열려는 참일 때만) 시드해야 닫는 클릭에서 activeUnit을 건드리지 않습니다.
      if (!open) setActiveUnit(fields[0] ?? "year");
      setOpen((current) => !current);
    }} onKeyDown={handleTriggerKeyDown}>{/* 이 <span> 하나가 §12의 확정 신호를 재생하는 자리입니다 — key={commitPulse}가 커밋마다
        이 노드를 리마운트시켜 .dropdown-value-commit 애니메이션을 다시 틀고, css/date-picker.css:20의
        `.date-wheel-trigger > span`이 여기에만 말줄임을 겁니다(자식 결합자 `>` 덕에 세그먼트에는
        안 걸립니다). **key를 세그먼트로 내리지 마세요** — 확정은 날짜 하나에 대한 사건이지
        세그먼트에 대한 사건이 아니라, 세그먼트마다 리마운트되면 조각들이 따로 반짝입니다.
        아래 세그먼트의 key는 위치가 고정된 이름표일 뿐이고 commitPulse와 아무 관계가 없습니다.
        `.placeholder`(:21의 흐린 색)는 **값도 버퍼도 없을 때만** 붙습니다 — 버퍼가 있으면
        placeholder를 버리고 baseValue 세그먼트를 그리기 때문입니다(§4.5). */}
      <span className={[triggerParts ? "" : "placeholder", commitPulse ? "dropdown-value-commit" : ""].filter(Boolean).join(" ")} key={commitPulse}>{triggerParts
        ? triggerParts.map((part, index) => part.unit === null
          ? <span className="date-wheel-punctuation" aria-hidden="true" key={`gap${index}`}>{part.text}</span>
          /* 활성 표시는 resolvedActiveUnit으로 판정합니다(원본 activeUnit이 아니라) — 소비자가
             런타임에 fields를 줄이면 activeUnit이 사라진 열을 계속 가리키고, 그러면 어느
             세그먼트도 활성이 아니게 되어 닫힌 채로 트리거에 활성 표시가 통째로 사라집니다.
             `.active` 클래스 자체는 포커스와 무관하게 붙고, **감추는 일은 CSS가 합니다**
             (`.date-wheel-trigger:focus-within` — §4.5: 포커스 없는 필드에 활성 표시가 남으면
             그 필드가 입력을 받는 중으로 읽힙니다). */
          : <span className={`date-wheel-segment${resolvedActiveUnit === part.unit ? " active" : ""}`} data-unit={part.unit} key={part.unit}>{part.text}</span>)
        : labels.placeholder}</span><i className="date-wheel-trigger-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm2-2v4m10-4v4M3 9h18" /></svg></i></button></div>
    {open && position && createPortal(<div ref={popoverRef} className="date-wheel-popover dropdown-menu-surface" role="dialog" aria-modal="false" aria-label={`${ariaLabel} ${labels.select}`} style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}>
      <div className="date-wheel-heading"><strong>{ariaLabel}</strong><span>{labels.hint}</span></div>
      <div className="date-wheel-columns" data-fields={fields.length}>
        {/* 이 자리의 클램프(resolvedActiveUnit)는 아래 포커스 이펙트의 focus() →
            각 열의 onFocus → setActiveUnit 되먹임에 가려, 이 줄만 되돌리는 뮤테이션으로는
            증명되지 않습니다(직접 확인했습니다) — 이펙트가 클램프된 열에 진짜 focus를
            걸면 그 focus 이벤트가 activeUnit 원본 상태까지 곧바로 따라잡습니다. 그래도
            원칙상 렌더가 fields 밖을 가리키는 상태를 그대로 믿으면 안 되므로 남겨
            둡니다 — 증명은 포커스 이펙트 쪽 테스트가 합니다. */}
        {fields.map((unit) => { const motion = columnMotion[unit]; return <section className={`date-wheel-column${resolvedActiveUnit === unit ? " active" : ""}${motion.sequence ? ` moving-${motion.direction}` : ""}`} aria-label={`${labels.units[unit]} ${dateWheelLabel(baseValue, unit, labels.weekdays)}`} role="group" tabIndex={0} ref={(node) => { if (node) columnRefs.current.set(unit, node); else columnRefs.current.delete(unit); }} onFocus={() => setActiveUnit(unit)} onKeyDown={(event) => handleColumnKey(event, unit)} onWheel={(event) => handleWheel(event, unit)} onPointerDown={(event) => { setTyping(null); if (!isPrimaryButton(event)) return; setActiveUnit(unit); event.currentTarget.focus({ preventScroll: true }); suppressColumnClickRef.current = false; swipeRef.current = { unit, y: event.clientY, pointerId: event.pointerId, value: baseValue }; if (typeof event.currentTarget.setPointerCapture === "function") event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => moveSwipe(unit, event.clientY, event.pointerId, event.buttons, event.currentTarget)} onPointerUp={(event) => finishSwipe(unit, event.clientY, event.pointerId, event.currentTarget)} onPointerCancel={(event) => { swipeRef.current = null; clearSwipeVisual(event.currentTarget); releaseColumnClickSuppression(); }} onClickCapture={(event) => { if (suppressColumnClickRef.current) { event.preventDefault(); event.stopPropagation(); } }} key={unit}>
          <button type="button" className="date-wheel-step" tabIndex={-1} aria-label={`${labels.units[unit]} ${labels.previous}`} disabled={!shifted(unit, -1)} onClick={() => applyShift(unit, -1)}><svg viewBox="0 0 16 16"><path d="m3.5 10 4.5-4 4.5 4" /></svg></button>
          {/* 행은 tab 순서에 들어가지 않습니다 — ↑/↓가 같은 일을 하고, 열당 5개씩이라
              날짜 하나를 지나가는 데 Tab을 15번 눌러야 했습니다. 값이 바뀔 때마다 이
              컨테이너의 key가 바뀌어 행이 통째로 리마운트되므로 포커스를 둘 수도 없습니다. */}
          <div className="date-wheel-viewport"><div className="date-wheel-values" key={`${unit}-${motion.sequence}`}>{DATE_WHEEL_OFFSETS.map((offset) => { const rowValue = shifted(unit, offset); const preloadOnly = Math.abs(offset) === 3; const buffered = offset === 0 && typing?.unit === unit ? typing.digits : null; return <button type="button" className={offset === 0 ? "selected" : ""} disabled={!rowValue} tabIndex={-1} aria-hidden={preloadOnly || undefined} aria-current={offset === 0 ? "date" : undefined} onClick={() => rowValue && applyShift(unit, offset)} key={offset}>{buffered ?? (rowValue ? dateWheelLabel(rowValue, unit, labels.weekdays) : "—")}</button>; })}</div></div>
          <button type="button" className="date-wheel-step" tabIndex={-1} aria-label={`${labels.units[unit]} ${labels.next}`} disabled={!shifted(unit, 1)} onClick={() => applyShift(unit, 1)}><svg viewBox="0 0 16 16"><path d="m3.5 6 4.5 4 4.5-4" /></svg></button>
        </section>; })}
      </div>
      {/* setTyping(null)을 먼저 부르는 이유는 handleShortcut의 Ctrl+;/Delete 분기와 같다 —
          이 버튼들은 그 단축키의 동등물이므로(title에 단축키를 적어 뒀다), 버퍼를 안 지우면
          같은 뜻의 단축키와 버튼이 다르게 굴며, 남은 버퍼가 이 버튼이 방금 설정한 값을
          나중에(예: 다음 Tab) 도로 덮어쓸 수 있다. */}
      <div className="date-wheel-actions"><button type="button" tabIndex={-1} title={`${labels.today} (Ctrl+;)`} aria-keyshortcuts="Control+; Meta+;" onClick={() => { setTyping(null); onChange(clampToRange(todayIn(timeZone))); }}>{labels.today}</button>{allowClear && <button type="button" tabIndex={-1} title={`${labels.clear} (Delete)`} aria-keyshortcuts="Delete" onClick={() => { setTyping(null); clearedRef.current = true; onChange(""); }}>{labels.clear}</button>}<button type="button" tabIndex={-1} className="primary" aria-keyshortcuts="Enter" onClick={commitAndClose}>{labels.done}</button></div>
    </div>, document.body)}
  </div>;
}

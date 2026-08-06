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

import { useBackToClose, useEscapeToClose } from "./hooks";
import { dropdownViewportSpace, isPrimaryButton } from "./positioning";

type DateWheelUnit = "year" | "month" | "day";

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
  hint: "휠 또는 스와이프로 조정",
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
  if (unit === "day") {
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const targetDay = ((day - 1 + direction) % lastDay + lastDay) % lastDay + 1;
    date.setUTCFullYear(year, month, targetDay);
  } else if (unit === "year") {
    const targetYear = year + direction;
    const lastDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
    date.setUTCFullYear(targetYear, month, Math.min(day, lastDay));
  } else {
    const targetMonth = ((month + direction) % 12 + 12) % 12;
    const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
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

function formatDateTrigger(value: string, placeholder: string, fields: DateWheelUnit[]) {
  if (!validDateValue(value)) return placeholder;
  const [year, month, day] = value.split("-");
  if (!fields.includes("month")) return `${year}.`;
  if (!fields.includes("day")) return `${year}. ${month}.`;
  return `${year}. ${month}. ${day}.`;
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
  useEscapeToClose(open, () => { setOpen(false); triggerRef.current?.focus({ preventScroll: true }); });
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [columnMotion, setColumnMotion] = useState<Record<DateWheelUnit, DateWheelMotion>>({
    year: { sequence: 0, direction: "next" },
    month: { sequence: 0, direction: "next" },
    day: { sequence: 0, direction: "next" },
  });
  const [activeUnit, setActiveUnit] = useState<DateWheelUnit>(fields[0] ?? "year");
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
    if (!open) { focusedColumnRef.current = null; return; }
    if (focusedColumnRef.current === activeUnit) return;
    const column = columnRefs.current.get(activeUnit);
    if (!column) return;   // 좌표가 아직 없어 마운트 전 — 정해지면 다시 온다
    focusedColumnRef.current = activeUnit;
    column.focus({ preventScroll: true });
  }, [open, activeUnit, position]);

  function shiftedFrom(sourceValue: string, unit: DateWheelUnit, amount: number) {
    const next = normalizeToFields(shiftDateValue(sourceValue, unit, amount), fields);
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

  /* 여기서 event.preventDefault()를 부르지 마세요.
   * React는 wheel/touchstart/touchmove를 루트(와 포털 컨테이너)에 passive로
   * 등록하므로 합성 이벤트에서의 preventDefault는 효과가 없고, 콘솔에
   * "Unable to preventDefault inside passive event listener invocation"만 남깁니다.
   * 페이지 스크롤 차단은 위 useEffect의 preventPageWheel(네이티브,
   * { passive: false })이 담당합니다. 이 핸들러는 값 변경만 합니다. */
  function handleWheel(event: ReactWheelEvent, unit: DateWheelUnit) {
    if (!event.deltaY) return;
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

  function handleColumnKey(event: ReactKeyboardEvent, unit: DateWheelUnit) {
    if (event.ctrlKey || event.metaKey) return;
    const key = event.key;

    if (key === "Tab") {
      // 떠나는 키. 기본 동작(다음 요소로)은 막지 않는다 — 포커스를 트리거로 옮겨
      // 두면 브라우저가 트리거 기준으로 다음 tabbable을 계산한다. keydown은 기본
      // Tab 동작보다 먼저 실행되므로 순서가 보장된다.
      if (moveColumn(unit, event.shiftKey ? -1 : 1)) { event.preventDefault(); return; }
      triggerRef.current?.focus({ preventScroll: true });
      setOpen(false);
      return;
    }

    // 방향키는 안에서만 움직인다 — 끝에서는 제자리이고 팝오버를 닫지 않는다.
    if (key === "ArrowRight" || key === "ArrowLeft") {
      event.preventDefault();
      moveColumn(unit, key === "ArrowRight" ? 1 : -1);
      return;
    }

    if (key !== "ArrowUp" && key !== "ArrowDown") return;
    event.preventDefault();
    setActiveUnit(unit);
    applyShift(unit, key === "ArrowDown" ? 1 : -1);
  }

  /** 닫혀 있을 때 트리거에서 받는 키. 여는 것 하나만 담당합니다. */
  function handleTriggerKeyDown(event: ReactKeyboardEvent) {
    // 비활성 트리거는 포커스를 받을 수 없어 실제 브라우저에서는 키가 오지 않지만,
    // 테스트처럼 이벤트를 직접 디스패치하면 그 관문을 건너뜁니다.
    if (disabled) return;
    // Ctrl·Meta가 눌린 키는 건드리지 않습니다 — 브라우저·OS 단축키입니다.
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
    <div className="date-wheel-trigger-shell"><button id={id} ref={triggerRef} type="button" className="date-wheel-trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)} onKeyDown={handleTriggerKeyDown}><span className={value ? "" : "placeholder"}>{formatDateTrigger(value, labels.placeholder, fields)}</span><i className="date-wheel-trigger-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm2-2v4m10-4v4M3 9h18" /></svg></i></button></div>
    {open && position && createPortal(<div ref={popoverRef} className="date-wheel-popover dropdown-menu-surface" role="dialog" aria-modal="false" aria-label={`${ariaLabel} ${labels.select}`} style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}>
      <div className="date-wheel-heading"><strong>{ariaLabel}</strong><span>{labels.hint}</span></div>
      <div className="date-wheel-columns" data-fields={fields.length}>
        {fields.map((unit) => { const motion = columnMotion[unit]; return <section className={`date-wheel-column${activeUnit === unit ? " active" : ""}${motion.sequence ? ` moving-${motion.direction}` : ""}`} aria-label={`${labels.units[unit]} ${dateWheelLabel(baseValue, unit, labels.weekdays)}`} role="group" tabIndex={0} ref={(node) => { if (node) columnRefs.current.set(unit, node); else columnRefs.current.delete(unit); }} onFocus={() => setActiveUnit(unit)} onKeyDown={(event) => handleColumnKey(event, unit)} onWheel={(event) => handleWheel(event, unit)} onPointerDown={(event) => { if (!isPrimaryButton(event)) return; setActiveUnit(unit); event.currentTarget.focus({ preventScroll: true }); suppressColumnClickRef.current = false; swipeRef.current = { unit, y: event.clientY, pointerId: event.pointerId, value: baseValue }; if (typeof event.currentTarget.setPointerCapture === "function") event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => moveSwipe(unit, event.clientY, event.pointerId, event.buttons, event.currentTarget)} onPointerUp={(event) => finishSwipe(unit, event.clientY, event.pointerId, event.currentTarget)} onPointerCancel={(event) => { swipeRef.current = null; clearSwipeVisual(event.currentTarget); releaseColumnClickSuppression(); }} onClickCapture={(event) => { if (suppressColumnClickRef.current) { event.preventDefault(); event.stopPropagation(); } }} key={unit}>
          <button type="button" className="date-wheel-step" aria-label={`${labels.units[unit]} ${labels.previous}`} disabled={!shifted(unit, -1)} onClick={() => applyShift(unit, -1)}><svg viewBox="0 0 16 16"><path d="m3.5 10 4.5-4 4.5 4" /></svg></button>
          <div className="date-wheel-viewport"><div className="date-wheel-values" key={`${unit}-${motion.sequence}`}>{DATE_WHEEL_OFFSETS.map((offset) => { const rowValue = shifted(unit, offset); const preloadOnly = Math.abs(offset) === 3; return <button type="button" className={offset === 0 ? "selected" : ""} disabled={!rowValue} tabIndex={preloadOnly ? -1 : 0} aria-hidden={preloadOnly || undefined} aria-current={offset === 0 ? "date" : undefined} onClick={() => rowValue && applyShift(unit, offset)} key={offset}>{rowValue ? dateWheelLabel(rowValue, unit, labels.weekdays) : "—"}</button>; })}</div></div>
          <button type="button" className="date-wheel-step" aria-label={`${labels.units[unit]} ${labels.next}`} disabled={!shifted(unit, 1)} onClick={() => applyShift(unit, 1)}><svg viewBox="0 0 16 16"><path d="m3.5 6 4.5 4 4.5-4" /></svg></button>
        </section>; })}
      </div>
      <div className="date-wheel-actions"><button type="button" onClick={() => onChange(clampToRange(todayIn(timeZone)))}>{labels.today}</button>{allowClear && <button type="button" onClick={() => onChange("")}>{labels.clear}</button>}<button type="button" className="primary" onClick={() => { if (!value) onChange(baseValue); setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true })); }}>{labels.done}</button></div>
    </div>, document.body)}
  </div>;
}

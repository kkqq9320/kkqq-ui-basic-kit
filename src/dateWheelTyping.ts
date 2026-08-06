/* 날짜 피커의 숫자 타이핑 계산 — DOM을 건드리지 않는 순수 함수만 둡니다.
 *
 * "친 숫자가 언제 값이 되는가"는 그 값을 화면에 어떻게 그리든 같은 계산입니다.
 * 여기에 DOM 접근을 추가하지 마세요 — jsdom 없이 테스트되는 것이 이 분리의
 * 요점입니다. src/selectKeyboard.ts와 같은 방식입니다.
 *
 * 시계를 쓰지 않습니다. 버퍼는 자릿수가 차거나(typeDigit) 열을 떠날 때
 * (flushBuffer)만 확정됩니다.
 */
import type { DateWheelUnit } from "./DateWheelPicker";

/** 그 열이 받는 최대 자릿수. */
function maxDigits(unit: DateWheelUnit) {
  return unit === "year" ? 4 : 2;
}

/** 한 자리만으로 확정되는 최소값 — 두 자리가 시작될 수 없는 첫 숫자. */
function soloFloor(unit: DateWheelUnit) {
  return unit === "month" ? 2 : 4;   // 월: 2~9, 일: 4~9
}

/** 그 열에 존재하는 수의 상한. 일의 말일 판정은 withUnitValue가 따로 합니다. */
function unitCeiling(unit: DateWheelUnit) {
  return unit === "month" ? 12 : 31;
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

/** 버퍼에 숫자 하나를 더한 결과. `digit`은 "0"~"9" 한 글자여야 합니다. */
export function typeDigit(unit: DateWheelUnit, buffer: string, digit: string): TypingStep {
  if (unit === "year") {
    const next = buffer + digit;
    return next.length >= maxDigits(unit) ? DONE(Number(next)) : WAIT(next);
  }

  if (buffer === "") {
    // 두 자리가 시작될 수 없는 숫자면 기다릴 이유가 없습니다.
    return Number(digit) >= soloFloor(unit) ? DONE(Number(digit)) : WAIT(digit);
  }

  const combined = Number(buffer + digit);
  if (combined >= 1 && combined <= unitCeiling(unit)) return DONE(combined);
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
 */
export function flushBuffer(unit: DateWheelUnit, buffer: string): number | null {
  if (!buffer) return null;
  const typed = Number(buffer);
  if (unit === "year") return buffer.length <= 2 ? 2000 + typed : typed;
  return typed >= 1 ? typed : null;   // 0월·0일은 없습니다
}

/** 연도를 다루면서 0~99를 1900년대로 옮기지 않는 안전한 말일 계산.
 *  DateWheelPicker.tsx의 shiftDateValue(±1 이동)도 이 함수를 씁니다 — 그쪽이
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

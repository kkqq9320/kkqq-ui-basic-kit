/* 키로 숫자를 찍어 넣는 동안의 상태 기계 — 몇 자리까지 기다렸다가 언제 확정하는가.
 * 값 문자열은 안 건드립니다: 확정된 **숫자 하나**만 돌려주고, 그것을 값에 얹는 것은
 * 부르는 쪽 몫입니다.
 */

import type { WheelUnit, HourFormat, TypingStep } from "../wheelModel";
import { unitDigits, unitFloor } from "./units";
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

const WAIT = (digits: string): TypingStep => ({ digits, commit: null, advance: false });

const DONE = (commit: number): TypingStep => ({ digits: "", commit, advance: true });

/** 버퍼에 숫자 하나를 더한 결과. `digit`은 "0"~"9" 한 글자여야 합니다.
 *  인자가 `WheelUnit`이 아니라 `WheelUnit`인 것은 의도입니다 — 이 함수는 시·분·초로도
 *  불립니다. `WheelUnit`(3단위)은 `WheelUnit`의 부분집합이라 기존 호출부는 그대로 통과합니다. */
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

/* 오전/오후 — 값은 언제나 24시간이고, 여기 있는 것은 **읽고 쓰는 방법**뿐입니다.
 * 스펙 §7의 "시 열은 24칸 그대로이고 라벨만 바뀐다"가 이 파일의 계약입니다.
 *
 * 붙여넣은 글자에서 오전/오후를 알아보는 것은 여기가 아니라 `paste.ts`입니다.
 */

import type { WheelUnit, HourDisplay } from "../wheelModel";
import { pad, parseValue } from "./serialize";

/**
 * 24시간 값 하나를 **12시간 읽기 숫자**로. 값은 안 바뀝니다 — 스펙 §7의 핵심이
 * "시 열은 24칸 그대로이고 라벨만 바뀐다"입니다. `h % 12`만 쓰면 자정과 정오가
 * 둘 다 0이 되므로, 그 두 경계를 12로 읽습니다.
 */
export function twelveHourReading(hour24: number): number {
  return hour24 % 12 === 0 ? 12 : hour24 % 12;
}

/** 오전/오후와 두 자리 읽기를 합친 기존 공개 표시 함수. */
export function twelveHourText(hour24: number, display: HourDisplay): string {
  return `${hour24 < 12 ? display.am : display.pm} ${pad(twelveHourReading(hour24), 2)}`;
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
export const MERIDIEM_NOTCHES = 12;

/** 오전/오후가 움직이는 열. **이름이 모델에 있는 이유는 §3.2입니다** — 기계는 어느
 *  열인지 이 상수로 지목할 뿐, "시가 24칸이다"·"정오가 오후의 시작이다"·"±12다"를
 *  알지 않습니다. 그 셋은 전부 위 함수·상수가 답합니다. */
export const MERIDIEM_UNIT: WheelUnit = "hour";

/** 친 숫자를 값으로. **친 것은 12시간 읽기이지 값이 아닙니다**(3단계, 스펙 §7) —
 *  어느 절반인지는 지금 값이 정합니다(오후에 `3`을 치면 15시). `12`가 특별한 이유는
 *  `twelveHourReading`의 `0 → 12`와 같습니다: 12시간 읽기에 0이 없어 12가 그 자리를
 *  대신하므로, 되돌릴 때 오전 12는 0시입니다. */
export function hourFromTwelve(reading: number, half: "am" | "pm"): number {
  const base = reading % 12;   // 12 → 0
  return half === "am" ? base : base + 12;
}

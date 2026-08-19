/* 사람이 붙여넣은 아무 글자에서 값을 뽑아냅니다 — 정규 형식만 읽는 `serialize.ts`와
 * 반대쪽 끝입니다. 아래 배너가 **왜 구분자를 해석하지 않는가**를 적어 둡니다.
 */

import type { WheelUnit, HourDisplay, UnitParts } from "../wheelModel";
import { hourFromTwelve } from "./meridiem";
import { serializeValue } from "./serialize";
import { DEFAULT_HOUR_DISPLAY, familyOf, lastDayOf, unitFloor } from "./units";
/* ---- 붙여넣기: 사람이 준 글자를 값으로 --------------------------------
 *
 * `parseValue`는 **이 킷이 쓴 정규 형식만** 읽습니다(`2026-08-14`). 붙여넣기는
 * 사람이 아무 데서나 복사해 온 글자라 그 문을 그대로 쓸 수 없습니다 —
 * `2026. 08. 14.`(우리가 Ctrl+C로 쓰는 것) · `2026-8-14`(자리 안 채운 것) ·
 * `2026/08/14` · `20260814`가 전부 같은 날을 뜻합니다.
 *
 * 🔴 **구분자를 해석하지 않고 숫자 덩어리만 셉니다.** "어느 문자가 구분자인가"를
 * 정하려 들면 로캘마다 길어지는 목록이 되고, 그 목록에 없는 구분자 하나가 **조용한
 * 실패**가 됩니다(붙여넣었는데 아무 일도 안 일어남). 덩어리의 **개수와 순서**만
 * 보면 목록 자체가 필요 없습니다.
 */

/** 붙여넣은 글자 안의 오전/오후. 소비자가 준 라벨을 먼저 보고(우리가 Ctrl+C로 쓴
 *  것이 그 라벨입니다), 없으면 ASCII `AM`/`PM`을 봅니다.
 *
 *  ⚠️ **`pm`을 먼저 봅니다.** 한쪽 라벨이 다른 쪽의 부분 문자열인 경우(소비자가
 *  `"오전"`/`"오전 아님"` 같은 것을 줄 수도 있습니다) 순서가 결과를 가릅니다.
 *  기본 라벨은 빈 문자열이라 `&&`로 거릅니다 — 안 거르면 `"".includes` 가 늘 참이라
 *  **모든 붙여넣기가 오후가 됩니다.** */
function meridiemInText(text: string, hour: HourDisplay): "am" | "pm" | null {
  if (hour.pm && text.includes(hour.pm)) return "pm";
  if (hour.am && text.includes(hour.am)) return "am";
  const upper = text.toUpperCase();
  if (/\bPM\b/.test(upper)) return "pm";
  if (/\bAM\b/.test(upper)) return "am";
  return null;
}

/**
 * 붙여넣은 글자에서 읽어낸 값(정규 형식). 읽을 수 없으면 `null`입니다.
 *
 * 🔴 **읽을 수 없을 때 빈 값이 아니라 `null`입니다.** 컴포넌트는 `null`에 대해
 * **아무것도 하지 않습니다** — 붙여넣기 실패가 값을 지우면 사용자는 되돌릴 것도
 * 없이 잃습니다. "실패하면 그대로 둔다"가 이 함수의 계약입니다.
 *
 * ⚠️ **`clampToRange`를 여기서 부르지 않습니다.** min/max는 소비자가 준 것이고
 * 이 함수는 값 모델의 순수 함수입니다 — 자르는 것은 컴포넌트 몫이고, 실제로
 * 컴포넌트가 붙여넣은 뒤 `clampToRange`를 겁니다.
 */
export function parsePasted(text: string, fields: WheelUnit[], hour: HourDisplay = DEFAULT_HOUR_DISPLAY): string | null {
  const family = familyOf(fields);
  const runs = text.match(/\d+/g) ?? [];
  if (runs.length === 0) return null;

  let digits: number[];
  // 구분자 없이 붙어 있는 한 덩어리(`20260814`)만 자릿수로 가릅니다. 구분자가
  // 있으면 덩어리가 이미 자리를 말해 주므로 폭을 가정하면 안 됩니다 — `2026-8-14`를
  // 폭으로 자르면 `2026`·`81`·`4`가 됩니다.
  if (runs.length === 1 && runs[0].length > (family === "time" ? 2 : 4)) {
    const widths = family === "time" ? [2, 2, 2] : [4, 2, 2, 2, 2, 2];
    const packed = runs[0];
    digits = [];
    let at = 0;
    for (const width of widths) {
      if (at === packed.length) break;
      // 남은 자리가 폭에 못 미치면 어디서 끊을지 알 수 없습니다 — 추측하지 않고 포기합니다.
      if (packed.length - at < width) return null;
      digits.push(Number(packed.slice(at, at + width)));
      at += width;
    }
    if (at !== packed.length) return null;   // 폭을 다 쓰고도 숫자가 남으면 우리 형식이 아닙니다
  } else {
    digits = runs.map(Number);
  }

  // 날짜+시각 글자를 **시각만 있는** 픽커에 붙여넣는 경우. 앞의 세 덩어리가 날짜라고
  // 보고 버립니다 — 안 버리면 연도가 시로 들어가 범위 검사에 걸려 통째로 실패합니다.
  if (family === "time" && digits.length >= 5) digits = digits.slice(3);

  // 시각만 있는 계열은 덩어리가 시·분·초에, 나머지 계열은 연·월·일·시·분·초에
  // **순서대로** 앉습니다. 덩어리가 자리보다 많으면(ISO의 밀리초 `.123` 등) 남는
  // 것은 버립니다.
  const slots: WheelUnit[] = family === "time" ? ["hour", "minute", "second"] : ["year", "month", "day", "hour", "minute", "second"];
  if (digits.length < (family === "time" ? 2 : 3)) return null;

  const parts: UnitParts = {
    year: unitFloor("year"), month: unitFloor("month"), day: unitFloor("day"),
    hour: unitFloor("hour"), minute: unitFloor("minute"), second: unitFloor("second"),
  };
  slots.forEach((unit, index) => { if (index < digits.length) parts[unit] = digits[index]; });

  const half = meridiemInText(text, hour);
  if (half) {
    // 12시간 읽기는 1~12뿐입니다. `오후 15:00`처럼 앞뒤가 안 맞으면 무엇을 뜻하는지
    // 알 수 없으므로 추측하지 않고 포기합니다.
    if (parts.hour < 1 || parts.hour > 12) return null;
    parts.hour = hourFromTwelve(parts.hour, half);
  }

  /* 범위 검사. `lastDayOf`는 **0부터 세는 달**을 받습니다.
   *
   * ⚠️ **날짜 쪽은 시각만 있는 계열에서 보지 않습니다.** 그 계열의 연·월·일은 입력에서
   * 온 것이 아니라 위에서 넣은 **바닥값**이고, `unitFloor("year")`는 0입니다 — 안 가르면
   * `03:30:45` 같은 멀쩡한 시각이 "0년은 범위 밖"에 걸려 통째로 `null`이 됩니다.
   * (실제로 이 검사가 처음에 그렇게 짜여 시각 계열 다섯 개가 한꺼번에 빨개졌습니다.) */
  if (family !== "time") {
    if (parts.year < 1 || parts.year > 9999) return null;
    if (parts.month < 1 || parts.month > 12) return null;
    if (parts.day < 1 || parts.day > lastDayOf(parts.year, parts.month - 1)) return null;
  }
  if (parts.hour > 23 || parts.minute > 59 || parts.second > 59) return null;

  return serializeValue(parts, fields);
}

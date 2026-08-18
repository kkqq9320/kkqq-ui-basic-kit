/* 킷 전역 설정.
 *
 * 지금은 `hourFormat` 하나뿐입니다 — 날짜/시각 휠 피커가 시(時)를 24시간제로 읽을지
 * 12시간제(`오후 03`)로 읽을지. 설계 스펙(`docs/design/2026-08-12-wheel-picker-time-design.md`)
 * §11이 이 모듈의 계약을 정합니다.
 *
 * **왜 인스턴스 prop이 아닌가.** 한 화면 안에서 어떤 픽커는 12시간제, 어떤 픽커는
 * 24시간제인 것은 설정이 아니라 사고입니다. 이건 사용자가 자기 앱 전체에 대해 한 번
 * 고르는 종류의 값이라 **전역**입니다. (나중에 인스턴스 prop을 더하는 것은 순수
 * 추가라 breaking이 아닙니다 — 스펙 §15.)
 *
 * **왜 프로바이더가 아닌가.** 이 킷은 지금 필수 프로바이더가 하나도 없고, 새로 만들면
 * **모든 소비자의 앱 루트**를 건드리는 변경이 됩니다(스펙 §11). 모듈 스코프 상태 +
 * 구독이면 컴포넌트가 `useSyncExternalStore` 하나로 읽고, 소비자는 아무것도 안 감쌉니다.
 *
 * ✅ **지속성이 붙었습니다**(2026-08-16, 설계 스펙 §16-3). 한동안 인메모리였던 이유는
 * "킷이 `localStorage`를 어떻게 소유하는가"가 테마 설정 작업에서 정해지는 중이었기
 * 때문입니다 — 먼저 정하면 킷 안에 저장 규약이 두 개 생깁니다. 그 작업이 끝나서
 * **`theme/tokens.ts`의 규약을 그대로 따릅니다**: `namespace:키`, 읽기·쓰기 **둘 다**
 * `try/catch`, 읽은 값은 **믿지 않고 검증**.
 *
 * 🔴 **`try/catch`가 읽기에도 필요한 이유**: 쿠키·사이트 데이터를 전면 차단한
 * 브라우저에서는 `localStorage`에 **접근만 해도** 예외가 납니다(`theme/tokens.ts`가
 * 그 자리를 실제로 밟았습니다 — 색 하나 바꾸면 편집기가 죽었습니다).
 *
 * 🔴 **그리고 이것이 왜 함수를 둘로 가르는가.** `useSyncExternalStore`의 세 번째 인자는
 * **서버 스냅샷**이고, 한동안 `getHourFormat`과 **같은 함수**였습니다 — 지속성이 없어서
 * 서버와 클라이언트가 언제나 같은 기본값이었기 때문입니다. 이제는 다릅니다: 클라이언트
 * 모듈이 뜰 때 저장값을 읽으므로, 같은 함수를 그대로 두면 **서버가 그린 HTML은 기본값인데**
 * **하이드레이션 첫 렌더가 저장값**이 되어 어긋납니다. 그래서 `*ServerSnapshot`을 따로
 * 내놓고, 컴포넌트가 세 번째 인자로 그것을 넘깁니다. */

/* 정의는 모델에 있습니다 — 시(時)를 어떻게 **읽을지**는 값의 어휘라 `model/instant.ts`가
 * 소유하고, 여기서는 다시 내보내기만 합니다. 같은 유니온을 두 파일에 적으면 한쪽이
 * 조용히 어긋납니다(이 저장소가 숫자로 이미 두 번 겪은 자리). **타입 전용 import라
 * 런타임 의존은 0**이고, 모델 쪽의 "아무것도 import 하지 않는다" 계약과도 어긋나지
 * 않습니다 — 방향이 반대입니다. */
export type { HourFormat } from "./model/instant";
import type { HourFormat } from "./model/instant";

/* ---- 저장 ------------------------------------------------------------------
 *
 * `theme/tokens.ts`가 `themeColors:<테마>`를 쓰므로 같은 `namespace:키` 모양입니다.
 * 설정마다 키가 따로인 것은 일부러입니다 — 한 덩어리 JSON으로 묶으면 값 하나가
 * 깨졌을 때 **나머지까지 같이 버리게** 됩니다. */
const HOUR_FORMAT_KEY = "settings:hourFormat";
const ROWS_KEY = "settings:wheelRowsPerSide";

/** 저장소는 **없을 수도, 접근만 해도 던질 수도** 있습니다(서버 렌더, 차단된 브라우저).
 *  둘 다 "저장된 값이 없다"와 같이 취급합니다. */
function readStored(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 저장에 성공하면 `true`. 막혀 있으면 `false`이고 **던지지 않습니다** —
 *  설정을 못 저장하는 것이 설정을 못 바꾸는 이유가 되면 안 됩니다. */
function writeStored(key: string, value: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** 기본값이 `"24"`라서, 앱이 아무것도 안 하면 화면은 지금과 **글자 하나도** 다르지 않습니다. */
const HOUR_FORMAT_DEFAULT: HourFormat = "24";

/* ⚠️ **읽은 값을 믿지 않습니다.** 저장소는 사용자도 다른 탭도 만질 수 있어서
 * `"twelve"`나 `"[]"` 같은 것이 들어 있을 수 있고, 그걸 그대로 쓰면 모델이
 * 12시간제도 24시간제도 아닌 상태로 갑니다. 모르는 값은 **기본값**입니다. */
let hourFormat: HourFormat = readStored(HOUR_FORMAT_KEY) === "12" ? "12" : HOUR_FORMAT_DEFAULT;

const listeners = new Set<() => void>();

export function getHourFormat(): HourFormat {
  return hourFormat;
}

/** `useSyncExternalStore`의 **세 번째 인자** 전용 — 언제나 기본값입니다.
 *  위 파일 머리말의 하이드레이션 설명을 보세요. */
export function getHourFormatServerSnapshot(): HourFormat {
  return HOUR_FORMAT_DEFAULT;
}

export function setHourFormat(next: HourFormat): void {
  // 값이 안 바뀌었으면 아무도 안 깨웁니다 — 이 구독은 `useSyncExternalStore`가 쓰므로
  // 불필요한 알림이 그대로 불필요한 렌더가 됩니다.
  if (next === hourFormat) return;
  hourFormat = next;
  // 저장 실패는 무시합니다 — 값은 이미 바뀌었고 구독자는 알림을 받아야 합니다.
  // 저장이 안 되는 브라우저에서는 이 세션 동안만 유지되는 것이 맞는 동작입니다.
  writeStored(HOUR_FORMAT_KEY, next);
  // 스냅샷을 떠서 돕니다: 구독자가 알림 도중 구독을 해지해도(React가 실제로 그럽니다)
  // 도는 중인 집합이 바뀌지 않게.
  for (const listener of [...listeners]) {
    // 구독자 하나의 사고가 나머지를 못 따라오게 두면 화면 절반만 12시간제가 됩니다.
    try { listener(); } catch { /* 무시 — 알림은 계속 돕니다 */ }
  }
}

/** 구독하고, **해지 함수**를 돌려줍니다. `useSyncExternalStore`의 `subscribe`가 그대로 이 모양입니다. */
export function subscribeHourFormat(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/* ---- 휠에 위아래로 보이는 행 수 ------------------------------------------ */

/** 선택된 값의 **위아래로 각각 몇 줄**을 보여 줄지. 1이면 3줄(위 1 · 선택 · 아래 1),
 *  4면 9줄입니다. 오너 결정(2026-08-13): **기본 1, 최대 4.** */
export type WheelRowsPerSide = 1 | 2 | 3 | 4;

/** 🔴 **기본값이 1인 것은 오너가 실기기에서 정한 것이고, 이 저장소의 "새 축은 기본값이
 *  지금과 같음" 규칙(PRINCIPLES §14)을 의도적으로 깬 자리입니다.** 지금까지는 2였으므로
 *  **핀을 올리는 소비자는 다른 휠을 봅니다** — 미출시 노트에 "눈으로 볼 것"으로 적힙니다. */
const ROWS_DEFAULT: WheelRowsPerSide = 1;

/* ⚠️ 저장값 검증이 시간 형식보다 한 겹 더 필요합니다 — 여기는 **수**라서
 * `"3"`은 살리고 `"0"`·`"9"`·`"2.5"`·`"abc"`는 버려야 합니다. `Number()`가
 * `""`를 0으로, `" 2 "`를 2로 만드는 것까지 감안해 **정확히 1~4의 정수**만 받습니다. */
function parseRows(raw: string | null): WheelRowsPerSide | null {
  if (raw === null) return null;
  const value = Number(raw);
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

let wheelRowsPerSide: WheelRowsPerSide = parseRows(readStored(ROWS_KEY)) ?? ROWS_DEFAULT;

/** ⚠️ **구독자 집합이 설정마다 따로입니다.** 하나로 합치면 시간 형식을 바꿀 때 행 수를
 *  읽는 컴포넌트까지 전부 다시 그립니다 — `useSyncExternalStore`가 이 집합을 그대로
 *  쓰기 때문입니다. 검사가 둘이 서로 간섭하지 않는 것을 고정합니다. */
const rowsListeners = new Set<() => void>();

export function getWheelRowsPerSide(): WheelRowsPerSide {
  return wheelRowsPerSide;
}

/** `useSyncExternalStore`의 **세 번째 인자** 전용 — 언제나 기본값입니다. */
export function getWheelRowsPerSideServerSnapshot(): WheelRowsPerSide {
  return ROWS_DEFAULT;
}

export function setWheelRowsPerSide(next: WheelRowsPerSide): void {
  if (next === wheelRowsPerSide) return;
  wheelRowsPerSide = next;
  writeStored(ROWS_KEY, String(next));
  for (const listener of [...rowsListeners]) {
    try { listener(); } catch { /* 무시 — 알림은 계속 돕니다 */ }
  }
}

export function subscribeWheelRowsPerSide(listener: () => void): () => void {
  rowsListeners.add(listener);
  return () => { rowsListeners.delete(listener); };
}

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
 * ⚠️ **지속성은 여기 없습니다.** 어느 키에 어떤 형식으로 저장하는가는 스펙이 일부러
 * 안 정했습니다 — 진행 중인 테마 설정 작업에서 "킷이 `localStorage`를 어떻게 소유하는가"가
 * 정해지고 있고, 지금 여기서 따로 정하면 **킷 안에 저장 규약이 두 개** 생깁니다.
 * 그래서 이 모듈은 **인메모리**이고, 지속성이 붙을 때 **이 파일 안에서만** 붙습니다 —
 * 컴포넌트는 읽기 함수 하나에만 기대고 있으므로 안 건드립니다.
 * (2026-08-13 재확인: `src/`에서 `localStorage`를 만지는 파일은 `themeTokens.ts`
 *  하나뿐이고, 그 뒤에 들어온 단축키 모듈은 저장소를 아예 안 씁니다. 전제 유효.) */

/* 정의는 모델에 있습니다 — 시(時)를 어떻게 **읽을지**는 값의 어휘라 `model/instant.ts`가
 * 소유하고, 여기서는 다시 내보내기만 합니다. 같은 유니온을 두 파일에 적으면 한쪽이
 * 조용히 어긋납니다(이 저장소가 숫자로 이미 두 번 겪은 자리). **타입 전용 import라
 * 런타임 의존은 0**이고, 모델 쪽의 "아무것도 import 하지 않는다" 계약과도 어긋나지
 * 않습니다 — 방향이 반대입니다. */
export type { HourFormat } from "./model/instant";
import type { HourFormat } from "./model/instant";

/** 기본값이 `"24"`라서, 앱이 아무것도 안 하면 화면은 지금과 **글자 하나도** 다르지 않습니다. */
let hourFormat: HourFormat = "24";

const listeners = new Set<() => void>();

export function getHourFormat(): HourFormat {
  return hourFormat;
}

export function setHourFormat(next: HourFormat): void {
  // 값이 안 바뀌었으면 아무도 안 깨웁니다 — 이 구독은 `useSyncExternalStore`가 쓰므로
  // 불필요한 알림이 그대로 불필요한 렌더가 됩니다.
  if (next === hourFormat) return;
  hourFormat = next;
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

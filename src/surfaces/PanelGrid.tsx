import type { ReactNode } from "react";

import { trackStyle, type GridJustify } from "./gridTracks";

/**
 * 패널 격자 컴포넌트 — 원본: frontend/src/components/PageChrome.tsx
 * 필요한 CSS: tokens.css, page.css
 */

/**
 * 패널 여럿을 **가로로 나란히** 놓습니다. 넓은 화면에서만 갈라지고, 좁아지면 알아서
 * 세로로 쌓입니다(`--panel-min`보다 좁으면 한 열).
 *
 * **어느 패널이 같이 서는지는 앱이 정합니다 — 킷은 통만 줍니다.** 높이가 다른 패널을
 * 나란히 놓으면 짧은 쪽 아래가 비는데, 그게 괜찮은 조합인지는 내용을 아는 쪽만 알 수
 * 있습니다. CSS masonry는 아직 쓸 수 없습니다.
 *
 * ⚠️ **여기는 `auto-fit`입니다. `.summary-grid`의 `auto-fill`과 일부러 다릅니다.**
 * 요약 카드는 **개수가 늘어나는 집합**이라 카드가 제 폭을 지키고 빈 트랙을 남기는 쪽이
 * 맞습니다. 패널은 앱이 "이 둘은 같이 선다"고 **명시한 그룹**이라, 남는 폭을 비워 두면
 * 화면 한쪽이 통째로 빕니다 — 오너가 정확히 그 모습을 기각했습니다(캡 안). 그래서
 * 빈 트랙을 접어 그룹이 줄을 다 쓰게 합니다.
 *
 * **`stretch`를 켜면 한 줄의 패널이 같은 높이가 됩니다.** 기본은 자연 높이라 짧은 패널
 * 아래가 비는데, 그 빈 자리를 **패널 안쪽으로** 옮기는 선택입니다. 어느 쪽이 나은지는
 * 내용에 달렸습니다 — 카드처럼 아래 끝이 맞아야 보기 좋은 조합이면 켜고, 내용 길이가
 * 제각각이면 끄는 편이 낫습니다(켜면 짧은 패널 안에 큰 여백이 생깁니다).
 * 더 세밀하게 잡으려면 `Panel`의 `className`으로 높이를 직접 주세요.
 *
 * **`min`으로 이 자리만 다르게 정할 수 있습니다** — 전역 토큰보다 우선합니다.
 * 좁은 화면부터 갈라도 되는 짧은 패널 쌍과, 넓어야만 갈라지는 표 패널을 한 화면에서
 * 다르게 둘 수 있습니다.
 *
 * ```tsx
 * <PanelGrid min="480px">
 *   <Panel title="드롭다운">…</Panel>
 *   <Panel title="날짜 피커">…</Panel>
 * </PanelGrid>
 * ```
 */
export function PanelGrid({ children, min, max, justify, stretch = false, className = "" }: { children: ReactNode; min?: string; max?: string; justify?: GridJustify; stretch?: boolean; className?: string }) {
  /* 상태는 클래스가 아니라 속성입니다(§16 ②) — `data-align`은 **한 축**이고 값이 하나입니다.
   * ⚠️ 끌 때 `undefined`로 **아예 안 붙입니다**(`""`가 아니라). `Button`의 `size`가 같은
   * 규칙이고 `tests/button.test.tsx`가 그것을 못박고 있습니다 — 빈 값이 붙으면 나중에 맨
   * `[data-align]` 선택자를 쓸 수 없게 됩니다. */
  return <div className={`panel-grid ${className}`.trim()} data-align={stretch ? "stretch" : undefined} style={trackStyle("--panel", min, max, justify)}>{children}</div>;
}

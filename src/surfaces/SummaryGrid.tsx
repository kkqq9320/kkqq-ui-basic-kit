import type { ReactNode } from "react";

import { trackStyle, type GridJustify } from "./gridTracks";

/**
 * 요약 카드 격자 컴포넌트 — 원본: frontend/src/components/PageChrome.tsx
 * 필요한 CSS: tokens.css, page.css
 */

/**
 * `min`은 이 그리드 **하나에만** 걸립니다 — 전역 토큰(`--summary-card-min`)보다 우선합니다.
 * 토큰이 커스텀 프로퍼티라 상속되므로, 조상 어디에 걸어도 그 아래만 바뀝니다.
 * 이 prop은 그 흔한 경우에 CSS를 안 쓰게 해 주는 지름길입니다.
 */
export function SummaryGrid({ children, min, max, justify, className = "" }: { children: ReactNode; min?: string; max?: string; justify?: GridJustify; className?: string }) {
  return <div className={`summary-grid ${className}`.trim()} style={trackStyle("--summary-card", min, max, justify)}>{children}</div>;
}

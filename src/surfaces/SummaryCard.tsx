import type { ReactNode } from "react";

/**
 * 요약 카드 컴포넌트 — 원본: frontend/src/components/PageChrome.tsx
 * 필요한 CSS: tokens.css, page.css
 */

/**
 * tone: "plain" | "teal" | "green" | "orange"
 *
 * **`className`은 카드 하나만 다르게 할 때 씁니다.** 토큰은 그리드의 **트랙**을 정하므로
 * 카드마다 다른 폭을 줄 수 없습니다 — 트랙은 모두 같은 크기입니다. 한 장만 넓히려면
 * 그 카드가 트랙을 **두 칸 차지**하게 하세요:
 *
 * ```tsx
 * <SummaryCard className="wide" label="합계" value="…" />
 * ```
 * ```css
 * .wide { grid-column: span 2; }
 * ```
 *
 * ⚠️ 트랙 수보다 큰 span은 좁은 화면에서 넘칩니다. `span 2`를 쓸 거면 한 열이 되는
 * 폭에서 `grid-column: auto`로 되돌리는 미디어 쿼리를 같이 두세요.
 */
export function SummaryCard({ label, value, tone = "plain", className = "" }: { label: ReactNode; value: ReactNode; tone?: "plain" | "teal" | "green" | "orange"; className?: string }) {
  return <article className={`summary-card ${tone} ${className}`.trim()}><span>{label}</span><strong>{value}</strong></article>;
}

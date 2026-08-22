import type { ReactNode } from "react";

/**
 * 페이지 머리말 컴포넌트 — 원본: frontend/src/components/PageChrome.tsx
 * 필요한 CSS: tokens.css, page.css
 */

/**
 * 앱 셸 콘텐츠 페이지의 첫 요소(PRINCIPLES §7). 세 줄이 각각 최소 높이를 예약하므로
 * 페이지를 옮겨도 제목 위치가 흔들리지 않습니다. eyebrow·제목은 페이지 앵커라
 * 필수이고, description은 값이 없어도 자리는 유지합니다. 제목이 없는 표면이라면
 * 이 컴포넌트가 아니라 Panel이나 Dialog를 쓰세요.
 */
export function PageHeader({ eyebrow, title, description , className = "" }: { eyebrow: ReactNode; title: ReactNode; description?: ReactNode ; className?: string }) {
  return <header className={`page-header ${className}`.trim()}><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></header>;
}

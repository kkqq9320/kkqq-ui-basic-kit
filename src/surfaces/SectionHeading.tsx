import type { ReactNode } from "react";

/**
 * 섹션 제목 컴포넌트 — 원본: frontend/src/components/PageChrome.tsx
 * 필요한 CSS: tokens.css, page.css
 */

/**
 * §7 배치 스택에서 탭 **아래**, 첫 콘텐츠 카드 **위**에 서는 섹션 제목.
 * `PageHeader`와 같은 규칙입니다 — 설명은 optional이지만 자리는 예약합니다(19px 3줄,
 * 최소 57px). 그래서 탭마다 설명 길이가 달라도 첫 카드가 같은 세로 좌표에서 시작합니다.
 *
 * `SectionTabs.tsx`에 있던 것을 옮겼습니다(§15 규칙 4) — **이것은 탭이 아닙니다.**
 * §7이 적어 둔 스택(`PageHeader` → 탭 → `SectionHeading` → `Panel`)에서 이 컴포넌트의
 * 이웃은 탭이 아니라 페이지 뼈대의 나머지 표면입니다.
 */
export function SectionHeading({ title, description, className = "" }: { title: ReactNode; description?: ReactNode; className?: string }) {
  return <div className={`settings-section-heading ${className}`.trim()}><h2>{title}</h2><p>{description}</p></div>;
}

import type { ReactNode } from "react";

/**
 * 페이지 패널 컴포넌트 — 원본: frontend/src/components/PageChrome.tsx
 * 필요한 CSS: tokens.css, page.css
 */

/**
 * 기본은 작업 영역 전체 폭입니다.
 *
 * ⚠️ 여기 한동안 "**더 좁은 컨테이너를 만들지 마세요**"라고 적혀 있었습니다. 그 문장은
 * "본문 안에 임의의 좁은 상자를 끼워 넣지 마라"는 뜻이었는데, 2560 화면에서 패널이
 * 2102px 전폭으로만 쌓이는 결과를 낳았습니다(메모 칸 하나가 2056px). 나란히 놓고 싶으면
 * `PanelGrid`로 묶으세요 — **금지는 "임의로 좁히지 마라"이지 "가로로 놓지 마라"가
 * 아닙니다.**
 *
 * `className`은 앱이 이 패널 하나에 무언가를 걸어야 할 때의 출구입니다(높이 고정,
 * 내용이 넘칠 때의 스크롤 등). **이게 없어서 앱은 패널에 높이조차 줄 수 없었습니다** —
 * `Select`가 진작부터 받고 있던 것과 같은 prop입니다.
 */
export function Panel({ title, hint, actions, className = "", children }: { title?: ReactNode; hint?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`panel ${className}`.trim()}>
    {(title || hint || actions) && <div className="panel-heading"><div>{hint && <small>{hint}</small>}{title && <h2>{title}</h2>}</div>{actions}</div>}
    {children}
  </section>;
}

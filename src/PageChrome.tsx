/* 페이지 뼈대 컴포넌트 — 원본: frontend/src/components/PageChrome.tsx
 * 필요한 CSS: tokens.css, page.css
 */
import { useEffect, useRef, type ReactNode } from "react";

import { isPrimaryButton } from "./positioning";

/**
 * 앱 셸 콘텐츠 페이지의 첫 요소(PRINCIPLES §7). 세 줄이 각각 최소 높이를 예약하므로
 * 페이지를 옮겨도 제목 위치가 흔들리지 않습니다. eyebrow·제목은 페이지 앵커라
 * 필수이고, description은 값이 없어도 자리는 유지합니다. 제목이 없는 표면이라면
 * 이 컴포넌트가 아니라 Panel이나 Dialog를 쓰세요.
 */
export function PageHeader({ eyebrow, title, description }: { eyebrow: ReactNode; title: ReactNode; description?: ReactNode }) {
  return <header className="page-header"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></header>;
}

export function SummaryGrid({ children }: { children: ReactNode }) {
  return <div className="summary-grid">{children}</div>;
}

/** tone: "plain" | "teal" | "green" | "orange" */
export function SummaryCard({ label, value, tone = "plain" }: { label: ReactNode; value: ReactNode; tone?: "plain" | "teal" | "green" | "orange" }) {
  return <article className={`summary-card ${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}

/** 콘텐츠는 작업 영역 전체 폭의 Panel에서 시작합니다. 더 좁은 컨테이너를 만들지 마세요. */
export function Panel({ title, hint, actions, children }: { title?: ReactNode; hint?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return <section className="panel">
    {(title || hint || actions) && <div className="panel-heading"><div>{hint && <small>{hint}</small>}{title && <h2>{title}</h2>}</div>{actions}</div>}
    {children}
  </section>;
}

/**
 * 클릭으로 여는 정보 디스클로저. 바깥 클릭·포커스 이탈·Escape로 닫힙니다.
 * 내용에 .glass-popover를 붙이면 드롭다운과 같은 표면을 씁니다.
 */
export function DismissibleDetails({ className, summary, summaryAriaLabel, summaryTitle, children }: { className: string; summary: ReactNode; summaryAriaLabel?: string; summaryTitle?: string; children: ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: Event) => {
      // 마우스 뒤로/앞으로 버튼은 닫기가 아닙니다 (focusin에는 button이 없으므로 통과)
      if ("button" in event && !isPrimaryButton(event as PointerEvent)) return;
      const target = event.target;
      if (detailsRef.current?.open && target instanceof Node && !detailsRef.current.contains(target)) detailsRef.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && detailsRef.current?.open) detailsRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("focusin", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("focusin", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  return <details className={className} ref={detailsRef}><summary aria-label={summaryAriaLabel} title={summaryTitle}>{summary}</summary>{children}</details>;
}

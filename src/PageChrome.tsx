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
 * ```tsx
 * <PanelGrid>
 *   <Panel title="드롭다운">…</Panel>
 *   <Panel title="날짜 피커">…</Panel>
 * </PanelGrid>
 * ```
 */
export function PanelGrid({ children }: { children: ReactNode }) {
  return <div className="panel-grid">{children}</div>;
}

/**
 * 기본은 작업 영역 전체 폭입니다.
 *
 * ⚠️ 여기 한동안 "**더 좁은 컨테이너를 만들지 마세요**"라고 적혀 있었습니다. 그 문장은
 * "본문 안에 임의의 좁은 상자를 끼워 넣지 마라"는 뜻이었는데, 2560 화면에서 패널이
 * 2102px 전폭으로만 쌓이는 결과를 낳았습니다(메모 칸 하나가 2056px). 나란히 놓고 싶으면
 * 위 `PanelGrid`로 묶으세요 — **금지는 "임의로 좁히지 마라"이지 "가로로 놓지 마라"가
 * 아닙니다.**
 */
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

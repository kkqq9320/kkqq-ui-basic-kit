import { useEffect, useRef, type ReactNode } from "react";

import { isPrimaryButton } from "../browser/pointerButton";

/**
 * 닫을 수 있는 정보 디스클로저 — 원본: frontend/src/components/PageChrome.tsx
 * 기본 CSS는 없습니다. `.glass-popover`를 쓰려면 tokens.css와 surfaces.css가 필요합니다.
 */

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

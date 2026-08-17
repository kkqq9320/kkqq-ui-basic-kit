/* 사이드바 — 원본: frontend/src/App.tsx:452-484의 인라인 JSX를 props 기반으로 재작성
 * 필요한 CSS: tokens.css, sidebar.css
 *
 * 원본은 React Router의 NavLink, 인증 상태, 서버 배지 카운트에 직접 묶여 있었습니다.
 * 여기서는 그 셋을 전부 props로 뽑아냈습니다:
 *   · 라우팅 → item.href(<a>로 렌더) 또는 item.onSelect(<button>으로 렌더) + item.active
 *   · 아이콘 → item.icon (ReactNode). 프로젝트마다 자유롭게 넣습니다.
 *   · 배지  → item.badge (숫자든 문자열이든)
 * 접힘 상태와 모바일 열림 상태는 controlled입니다. localStorage 저장 같은 정책은
 * 쓰는 쪽이 정합니다 (README의 예시 참고).
 */
import type { ReactNode, Ref } from "react";

import { useBackToClose } from "../browser/popupDismiss";

export type SidebarNavItem = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  /** 라벨 옆 카운트 배지. 0이나 빈 값이면 넣지 마세요. */
  badge?: ReactNode;
  active?: boolean;
  /** 주면 <a>로 렌더합니다. 없으면 <button>. */
  href?: string;
  onSelect?: () => void;
  /** 접혔을 때 툴팁. 없으면 label이 문자열일 때 그것을 씁니다. */
  title?: string;
};

export type SidebarNavSection = {
  heading?: string;
  items: SidebarNavItem[];
  /** true면 이 그룹을 사이드바 바닥으로 밀어붙입니다 (보통 "관리" 그룹). */
  pinToBottom?: boolean;
};

export type SidebarFooter = {
  avatar?: ReactNode;
  name: ReactNode;
  subtitle?: ReactNode;
  actions?: Array<{ id: string; label: string; icon: ReactNode; onClick: () => void }>;
};

export type SidebarLabels = { collapse: string; expand: string; close: string };

export const DEFAULT_SIDEBAR_LABELS: SidebarLabels = {
  collapse: "사이드바 접기",
  expand: "사이드바 펼치기",
  close: "사이드바 닫기",
};

export type SidebarProps = {
  /** 앱이 이 컴포넌트를 겨눌 때의 출구. **내보내는 컴포넌트는 전부 이걸 받습니다** —
   *  자주 쓰는 것만 prop으로 열고 나머지는 이걸로 겁니다(PageChrome.tsx의 GridJustify 옆 주석). */
  className?: string;

  brand: { icon?: ReactNode; title: ReactNode };
  sections: SidebarNavSection[];
  /** 브랜드 바로 아래 자유 슬롯 — 작업 공간 전환기, 검색 등. */
  slot?: ReactNode;
  footer?: SidebarFooter;
  collapsed?: boolean;
  /** 없으면 접기 버튼을 렌더하지 않습니다. */
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  labels?: Partial<SidebarLabels>;
};

function NavEntry({ item, onNavigate }: { item: SidebarNavItem; onNavigate?: () => void }) {
  const title = item.title ?? (typeof item.label === "string" ? item.label : undefined);
  const inner = <>{item.icon}<span>{item.label}{item.badge != null && item.badge !== false && <b className="sidebar-nav-count">{item.badge}</b>}</span></>;
  /* 🔴 상태를 **한 번만** 말합니다(PRINCIPLES §16). 예전에는 `aria-current`와
   * `className="active"`가 같은 사실을 두 번 말했고, 둘이 갈리면 화면과 스크린리더가
   * 다른 말을 합니다. CSS가 `[aria-current="page"]`를 직접 칠합니다 — 속성 선택자는
   * 클래스와 명시도가 같아 캐스케이드가 안 흔들립니다. */
  const shared = { title };
  if (item.href) {
    return <a {...shared} href={item.href} aria-current={item.active ? "page" : undefined} onClick={() => { item.onSelect?.(); onNavigate?.(); }}>{inner}</a>;
  }
  return <button {...shared} type="button" aria-current={item.active ? "page" : undefined} onClick={() => { item.onSelect?.(); onNavigate?.(); }}>{inner}</button>;
}

export function Sidebar({ brand, sections, slot, footer, collapsed = false, onToggleCollapse, mobileOpen = false, onMobileClose, labels: labelOverrides, className = "" }: SidebarProps) {
  const labels = { ...DEFAULT_SIDEBAR_LABELS, ...labelOverrides };
  // 모바일 드로어는 화면을 덮는 오버레이이므로 안드로이드 뒤로가기로 닫혀야 합니다 —
  // Dialog·Select·DateWheelPicker가 전부 갖고 있는 계약인데 여기만 없었습니다.
  //
  // **AppShell이 아니라 여기에 있는 이유:** 두 컴포넌트가 모두 `mobileOpen`을 받고
  // 보통 소비자는 양쪽에 같은 상태를 넘깁니다(README의 예시도 그렇습니다). 양쪽에서
  // 부르면 한 번 열 때 표식이 두 개 쌓여, 서랍 하나를 닫는 데 뒤로가기를 두 번 눌러야
  // 합니다 — 사용자에게는 첫 번째가 먹통으로 보입니다. 닫히는 대상 자신인 이쪽에만
  // 두면 `Sidebar`를 `AppShell` 없이 단독으로 써도 계약이 따라옵니다.
  //
  // 데스크톱 폭에서는 서랍을 열 버튼이 CSS로 숨겨지지만(css/sidebar.css:179),
  // 열어둔 채 창을 넓히면 `mobileOpen`이 true로 남을 수 있습니다. 그때도 표식을
  // 밀어 넣습니다 — 뒤로가기 한 번이 보이지 않는 서랍을 닫는 데 쓰이지만, 상태는
  // 실제로 닫힌 것이 맞고, 킷이 CSS 미디어 쿼리를 JS에 복제하지 않아도 됩니다.
  useBackToClose(mobileOpen && onMobileClose !== undefined, () => onMobileClose?.());
  return <aside className={`sidebar${mobileOpen ? " mobile-open" : ""} ${className}`.trim()}>
    <div className="sidebar-brand">
      {brand.icon && <span>{brand.icon}</span>}
      <strong>{brand.title}</strong>
      {onToggleCollapse && <button type="button" className="sidebar-collapse-button" onClick={onToggleCollapse} aria-label={collapsed ? labels.expand : labels.collapse} title={collapsed ? labels.expand : labels.collapse}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={collapsed ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} /></svg>
      </button>}
      {onMobileClose && <button type="button" className="mobile-sidebar-close" onClick={onMobileClose} aria-label={labels.close}>×</button>}
    </div>

    {slot && <div className="sidebar-slot">{slot}</div>}

    {sections.map((section, index) => <nav className={section.pinToBottom ? "sidebar-management-nav" : undefined} key={section.heading ?? index}>
      {section.heading && <span className="sidebar-nav-heading">{section.heading}</span>}
      {section.items.map((item) => <NavEntry item={item} onNavigate={onMobileClose} key={item.id} />)}
    </nav>)}

    {footer && <div className="sidebar-footer">
      {footer.avatar}
      <span className="sidebar-user-copy"><strong>{footer.name}</strong>{footer.subtitle && <small>{footer.subtitle}</small>}</span>
      {footer.actions?.length ? <span className="sidebar-user-actions">
        {footer.actions.map((action) => <button type="button" className="sidebar-icon-button" onClick={action.onClick} aria-label={action.label} title={action.label} key={action.id}>{action.icon}</button>)}
      </span> : null}
    </div>}
  </aside>;
}

export type MobileQuickBarItem = { id: string; label: string; icon: ReactNode; active?: boolean; onClick: () => void; ariaLabel?: string };

/**
 * 모바일 화면 아래 가운데에 떠 있는 빠른 바.
 * CSS 그리드가 64px 3칸으로 고정이라 항목 3개를 전제로 합니다.
 * 보통 [메뉴 열기, 주요 액션, 홈] 조합을 씁니다.
 */
export function MobileQuickBar({ items, ariaLabel = "빠른 메뉴", barRef, className = "" }: { items: MobileQuickBarItem[]; ariaLabel?: string; barRef?: Ref<HTMLElement>; className?: string }) {
  return <nav ref={barRef} className={`mobile-quick-bar ${className}`.trim()} aria-label={ariaLabel}>
    {items.map((item) => <button type="button" className={item.active ? "active" : undefined} onClick={item.onClick} aria-label={item.ariaLabel ?? item.label} key={item.id}>{item.icon}<span>{item.label}</span></button>)}
  </nav>;
}

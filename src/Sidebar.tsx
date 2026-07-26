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
  const shared = { className: item.active ? "active" : undefined, title };
  if (item.href) {
    return <a {...shared} href={item.href} aria-current={item.active ? "page" : undefined} onClick={() => { item.onSelect?.(); onNavigate?.(); }}>{inner}</a>;
  }
  return <button {...shared} type="button" aria-current={item.active ? "page" : undefined} onClick={() => { item.onSelect?.(); onNavigate?.(); }}>{inner}</button>;
}

export function Sidebar({ brand, sections, slot, footer, collapsed = false, onToggleCollapse, mobileOpen = false, onMobileClose, labels: labelOverrides }: SidebarProps) {
  const labels = { ...DEFAULT_SIDEBAR_LABELS, ...labelOverrides };
  return <aside className={mobileOpen ? "sidebar mobile-open" : "sidebar"}>
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
export function MobileQuickBar({ items, ariaLabel = "빠른 메뉴", barRef }: { items: MobileQuickBarItem[]; ariaLabel?: string; barRef?: Ref<HTMLElement> }) {
  return <nav ref={barRef} className="mobile-quick-bar" aria-label={ariaLabel}>
    {items.map((item) => <button type="button" className={item.active ? "active" : undefined} onClick={item.onClick} aria-label={item.ariaLabel ?? item.label} key={item.id}>{item.icon}<span>{item.label}</span></button>)}
  </nav>;
}

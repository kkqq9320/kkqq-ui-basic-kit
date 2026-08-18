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

import { Pressable } from "../controls/Pressable";

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
  return <Pressable {...shared} aria-current={item.active ? "page" : undefined} onClick={() => { item.onSelect?.(); onNavigate?.(); }}>{inner}</Pressable>;
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
  /* 서랍이 열렸다는 것은 **순수 시각 상태**입니다(§16 ③) — 접근성 트리에 대응이 없습니다.
   * 여는 트리거는 이 컴포넌트 밖입니다. 앱의 햄버거일 수도 있고, 킷 안이라면
   * `MobileQuickBar`의 `kind: "disclosure"` 항목입니다 — 펼침 사실은 **거기가**
   * `aria-expanded`로 답니다(2026-08-18). 여기 `<aside>`에 걸 자리는 여전히 없습니다.
   * ⚠️ 닫힐 때 `undefined`로 **아예 안 붙입니다** — 빈 값이 붙으면 나중에 맨
   * `[data-mobile-drawer]` 선택자를 쓸 수 없게 됩니다. */
  return <aside className={`sidebar ${className}`.trim()} data-mobile-drawer={mobileOpen ? "open" : undefined}>
    <div className="sidebar-brand">
      {brand.icon && <span>{brand.icon}</span>}
      <strong>{brand.title}</strong>
      {onToggleCollapse && <Pressable className="sidebar-collapse-button" onClick={onToggleCollapse} aria-label={collapsed ? labels.expand : labels.collapse} title={collapsed ? labels.expand : labels.collapse}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={collapsed ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} /></svg>
      </Pressable>}
      {onMobileClose && <Pressable className="mobile-sidebar-close" onClick={onMobileClose} aria-label={labels.close}>×</Pressable>}
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
        {footer.actions.map((action) => <Pressable className="sidebar-icon-button" onClick={action.onClick} aria-label={action.label} title={action.label} key={action.id}>{action.icon}</Pressable>)}
      </span> : null}
    </div>}
  </aside>;
}

/**
 * **`active`가 무슨 뜻인지는 항목이 말합니다**(§16 ①, 오너 결정 2026-08-18).
 *
 * 🔴 예전에는 셋 다 `className="active"` 하나로 칠했는데, 재 보니 그 클래스가 **한 사실이
 * 아니라 둘**이었습니다. 보통 쓰는 `[메뉴 열기, 주요 액션, 홈]` 조합에서:
 *
 * ```
 * menu   active: mobileOpen            "이 버튼이 서랍을 펼쳤다"   → aria-expanded
 * entry  active: page === "entry"       "지금 이 페이지다"          → aria-current="page"
 * home   active: page === "dashboard"   "지금 이 페이지다"          → aria-current="page"
 * ```
 *
 * 통째로 `aria-current="page"`를 붙이면 "메뉴 열기"에 대해서는 **거짓말**입니다. 그래서
 * 항목이 자기 갈래를 말하고, 킷이 그 갈래에 맞는 속성을 답니다.
 *
 * - `"page"` — 내비게이션. 활성일 때 `aria-current="page"`.
 * - `"disclosure"` — 무언가를 펼치는 버튼. `aria-expanded`를 **접혔을 때도** 답니다
 *   (그것이 펼침 버튼의 계약입니다 — 열 수 있다는 사실 자체를 말해야 합니다).
 * - `"action"` — 그냥 실행. 대응하는 ARIA가 없으므로 **아무것도 안 답니다.**
 *   ⚠️ 그래서 `active: true`여도 **활성 표시가 안 칠해집니다.** 표시가 필요하면
 *   그 항목은 `action`이 아닙니다.
 *
 * **필수입니다.** 기본값을 두면 오너가 방금 답한 질문을 킷이 조용히 다시 답하는 셈입니다.
 */
export type MobileQuickBarKind = "page" | "disclosure" | "action";

export type MobileQuickBarItem = { id: string; label: string; icon: ReactNode; kind: MobileQuickBarKind; active?: boolean; onClick: () => void; ariaLabel?: string };

/**
 * 모바일 화면 아래 가운데에 떠 있는 빠른 바.
 * CSS 그리드가 64px 3칸으로 고정이라 항목 3개를 전제로 합니다.
 * 보통 [메뉴 열기, 주요 액션, 홈] 조합을 씁니다.
 */
export function MobileQuickBar({ items, ariaLabel = "빠른 메뉴", barRef, className = "" }: { items: MobileQuickBarItem[]; ariaLabel?: string; barRef?: Ref<HTMLElement>; className?: string }) {
  return <nav ref={barRef} className={`mobile-quick-bar ${className}`.trim()} aria-label={ariaLabel}>
    {items.map((item) => <Pressable
      aria-current={item.kind === "page" && item.active ? "page" : undefined}
      aria-expanded={item.kind === "disclosure" ? Boolean(item.active) : undefined}
      onClick={item.onClick} aria-label={item.ariaLabel ?? item.label} key={item.id}>{item.icon}<span>{item.label}</span></Pressable>)}
  </nav>;
}

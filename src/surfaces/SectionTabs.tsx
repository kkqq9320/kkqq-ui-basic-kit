/* 섹션 탭 — 원본: frontend/src/components/SectionTabs.tsx
 * 필요한 CSS: tokens.css, tabs.css (클래스 이름은 원본 그대로 .settings-tabs 입니다)
 *
 * 데스크톱은 밑줄형 탭 바, 모바일은 페이지 헤더 오른쪽 위의 현재 탭 카드 하나로
 * 접힙니다. MobilePageTabsProvider 안에 있으면 오른쪽 아래 플로팅 카드에도
 * 자동으로 등록되어 한 손으로 탭을 옮길 수 있습니다.
 */
import { createContext, useContext, useEffect, useRef, useState, type Ref } from "react";

import { Pressable } from "../controls/Pressable";

import { isPrimaryButton } from "../browser/pointerButton";

export type MobilePageTabRegistration = {
  id: string;
  ariaLabel: string;
  currentValue: string;
  currentLabel: string;
  tabs: Array<{ value: string; label: string }>;
  onSelect: (value: string) => void;
};

export const MobilePageTabsContext = createContext<{
  register: (registration: MobilePageTabRegistration) => void;
  unregister: (id: string) => void;
} | null>(null);

export function PageTabsIcon({ className = "" }: { className?: string } = {}) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className || undefined}><rect x="6" y="5" width="12" height="15" rx="2" /><path d="M9 5V4a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2M9 10h6M9 14h6" /></svg>;
}

export type SectionTabsProps<T extends string> = {
  value: T;
  tabs: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
};

export function SectionTabs<T extends string>({ value, tabs, onChange, ariaLabel, className = "" }: SectionTabsProps<T>) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const mobilePageTabsContext = useContext(MobilePageTabsContext);
  const registrationIdRef = useRef(`mobile-page-tabs-${Date.now()}-${Math.random()}`);
  const selectFromMobileBarRef = useRef<(nextValue: string) => void>(() => undefined);
  const currentTab = tabs.find((tab) => tab.value === value) || tabs[0];
  selectFromMobileBarRef.current = (nextValue: string) => {
    setMobileOpen(false);
    onChange(nextValue as T);
  };
  const tabsSignature = tabs.map((tab) => `${tab.value}:${tab.label}`).join("|");
  useEffect(() => {
    if (!mobilePageTabsContext || !currentTab) return;
    const id = registrationIdRef.current;
    mobilePageTabsContext.register({
      id,
      ariaLabel,
      currentValue: value,
      currentLabel: currentTab.label,
      tabs: tabs.map((tab) => ({ value: tab.value, label: tab.label })),
      onSelect: (nextValue) => selectFromMobileBarRef.current(nextValue),
    });
    return () => mobilePageTabsContext.unregister(id);
  }, [ariaLabel, currentTab?.label, mobilePageTabsContext, tabsSignature, value]);
  // 모바일 카드는 바깥 터치·Escape·스크롤 모두에서 닫힙니다.
  useEffect(() => {
    if (!mobileOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!isPrimaryButton(event)) return;   // 마우스 뒤로/앞으로 버튼은 닫기가 아닙니다
      if (!rootRef.current?.contains(event.target as Node)) setMobileOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    function closeOnScroll() {
      setMobileOpen(false);
    }
    const scrollRoot = document.getElementById("root");
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    scrollRoot?.addEventListener("scroll", closeOnScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
      scrollRoot?.removeEventListener("scroll", closeOnScroll);
    };
  }, [mobileOpen]);
  function selectTab(nextValue: T) {
    setMobileOpen(false);
    onChange(nextValue);
  }
  return <div ref={rootRef} className={`settings-tabs ${className}`.trim()} data-mobile-open={mobileOpen ? "" : undefined}>
    <Pressable className="mobile-tab-card" aria-label={`${ariaLabel}: ${currentTab.label}`} aria-haspopup="true" aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)}><span>{currentTab.label}</span><i aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" /></svg></i></Pressable>
    <div className="settings-tab-options" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => <Pressable role="tab" aria-selected={tab.value === value} onClick={() => selectTab(tab.value)} key={tab.value}>{tab.label}</Pressable>)}
    </div>
  </div>;
}

/**
 * 화면 오른쪽 아래에 뜨는 페이지 이동 카드.
 * AppShell의 pageTabs 슬롯에 넣고, 트리 전체를 MobilePageTabsProvider로 감싸세요.
 * 등록된 SectionTabs가 없으면 아무것도 렌더하지 않습니다.
 */
export function MobilePageTabs({ registration, open, onToggle, label = "페이지", floatRef, className = "" }: { className?: string; registration: MobilePageTabRegistration | null; open: boolean; onToggle: (open: boolean) => void; label?: string; floatRef?: Ref<HTMLDivElement> }) {
  // floatRef는 useMobilePageTabs가 만든 것을 그대로 넘겨야 바깥 클릭 닫기가 동작합니다.
  if (!registration) return null;
  return <div ref={floatRef} className={`mobile-page-tabs-float ${className}`.trim()} data-open={open ? "" : undefined}>
    <div className="mobile-quick-tab-menu" role="tablist" aria-label={registration.ariaLabel}>
      {registration.tabs.map((tab) => <Pressable role="tab" aria-selected={tab.value === registration.currentValue} key={tab.value} onClick={() => { registration.onSelect(tab.value); onToggle(false); }}>{tab.label}</Pressable>)}
    </div>
    <Pressable className="mobile-page-tabs-button" aria-label={`${label} · ${registration.ariaLabel}: ${registration.currentLabel}`} aria-haspopup="true" aria-expanded={open} onClick={() => onToggle(!open)}><PageTabsIcon /><span>{label}</span></Pressable>
  </div>;
}

/**
 * SectionTabs가 스스로 등록할 수 있게 해주는 provider + 플로팅 카드 상태.
 *
 * 반환된 `floatRef`를 `MobilePageTabs`에, `quickBarRef`를 `MobileQuickBar`에
 * 넘기세요. 그래야 그 둘 바깥을 누를 때 메뉴가 닫힙니다. 넘기지 않으면
 * 열린 메뉴가 아무 데를 눌러도 닫히지 않습니다.
 */
export function useMobilePageTabs() {
  const [registration, setRegistration] = useState<MobilePageTabRegistration | null>(null);
  const [open, setOpen] = useState(false);
  const floatRef = useRef<HTMLDivElement>(null);
  const quickBarRef = useRef<HTMLElement>(null);
  const contextRef = useRef({
    register: (next: MobilePageTabRegistration) => setRegistration(next),
    unregister: (id: string) => setRegistration((current) => (current?.id === id ? null : current)),
  });

  // 바깥 조작 / Escape / 스크롤로 닫습니다. 떠 있는 카드와 빠른 바는 한 덩어리로
  // 취급해 둘 다 제외해야, 토글 버튼을 누르는 순간 닫혔다 다시 열리지 않습니다.
  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!isPrimaryButton(event)) return;   // 마우스 뒤로/앞으로 버튼은 닫기가 아닙니다
      const target = event.target as Node;
      if (!floatRef.current?.contains(target) && !quickBarRef.current?.contains(target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function closeOnScroll() {
      setOpen(false);
    }
    const scrollRoot = document.getElementById("root");
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    scrollRoot?.addEventListener("scroll", closeOnScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
      scrollRoot?.removeEventListener("scroll", closeOnScroll);
    };
  }, [open]);

  return { registration, open, setOpen, context: contextRef.current, floatRef, quickBarRef };
}

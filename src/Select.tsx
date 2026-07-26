/* 커스텀 드롭다운 — 원본: frontend/src/components/AppSelect.tsx
 * 필요한 CSS: tokens.css, surfaces.css, select.css
 *
 * 네이티브 <select>를 쓰지 않는 이유: OS마다 메뉴 모양이 달라 글래스 표면과
 * 옵션 호버 처리를 통일할 수 없기 때문입니다. 대신 role="listbox"로 접근성을 맞춥니다.
 *
 * portal 모드: 기본은 트리거 안에 absolute로 붙습니다. 조상 중에 overflow를
 * 자르는 요소(사이드바 슬롯, 스크롤 카드, 테이블 래퍼)가 있으면 메뉴가 잘리므로
 * 그럴 때 portal을 켜세요. body에 fixed로 붙고 스크롤·리사이즈를 따라갑니다.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useBackToClose, useEscapeToClose } from "./hooks";
import { captureScrollSnapshot, dropdownViewportSpace, isPrimaryButton, restoreFocusWithoutScroll, shouldOpenDropdownAbove, type ScrollSnapshot } from "./positioning";

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type SelectProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** 스크린 리더용 이름. 필수입니다. */
  ariaLabel: string;
  /** 선택된 값이 없을 때 트리거에 보일 문구. */
  placeholder?: string;
  align?: "left" | "center";
  className?: string;
  disabled?: boolean;
  /** overflow를 자르는 조상 안에 있을 때 켜세요. 메뉴가 body 포털로 나갑니다. */
  portal?: boolean;
  /** portal일 때 모바일에서 하단 고정 바를 피하려고 비워둘 높이. */
  mobileBottomInset?: number;
};

/** 옵션 한 줄 34px + 메뉴 패딩 12px. 메뉴가 아직 없을 때 높이 추정에 씁니다. */
function estimateMenuHeight(optionCount: number) {
  return Math.min(optionCount * 34 + 12, 320);
}

type MenuPosition = { top: number; left: number; width: number; maxHeight: number };

export function Select({ value, options, onChange, ariaLabel, placeholder = "선택하세요", align = "left", className = "", disabled = false, portal = false, mobileBottomInset = 78 }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectionScrollRef = useRef<ScrollSnapshot>([]);
  const selected = options.find((option) => option.value === value);
  // 뒤로가기로 메뉴만 닫습니다. 표식이 스택이라, 다이얼로그 안에서 열린 메뉴는
  // 뒤로가기 한 번에 메뉴만 닫히고 다이얼로그는 남습니다. 이게 없으면 뒤로가기가
  // 다이얼로그를 통째로 닫아 입력하던 내용이 날아갑니다.
  useBackToClose(open, () => setOpen(false));
  // 겹쳐 있으면 가장 안쪽만 닫힙니다 — 다이얼로그 안에서 열렸을 때 다이얼로그까지 닫으면 안 됩니다.
  useEscapeToClose(open, () => { setOpen(false); triggerRef.current?.focus({ preventScroll: true }); });

  // 바깥 클릭 / Escape로 닫기. Escape는 포커스를 트리거로 돌려줍니다.
  // 포털 메뉴는 rootRef 밖에 있으므로 menuRef도 함께 확인해야 옵션 클릭이 죽지 않습니다.
  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: MouseEvent) {
      if (!isPrimaryButton(event)) return;   // 마우스 뒤로/앞으로 버튼은 닫기가 아닙니다
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside, true);
    return () => { document.removeEventListener("mousedown", closeOnOutside, true); };
  }, [open]);

  // 아래 공간이 모자라면 위로 엽니다. 스크롤·리사이즈마다 다시 판단하고,
  // 포털일 때는 좌표까지 다시 계산합니다.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setOpenAbove(false); setPosition(null); return; }
    function placeMenu() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const menuLimit = Math.min(320, window.innerHeight * .55);
      const desiredHeight = Math.min(menuRef.current?.scrollHeight ?? estimateMenuHeight(options.length), menuLimit);
      if (!portal) {
        setOpenAbove(shouldOpenDropdownAbove(trigger, desiredHeight));
        return;
      }
      const gap = 5;
      const bottomInset = window.innerWidth <= 760 ? mobileBottomInset : 8;
      const { rect, above, below, edge } = dropdownViewportSpace(trigger, bottomInset);
      const above_ = below < desiredHeight && above > below;
      const available = Math.max(120, (above_ ? above : below) - gap);
      const maxHeight = Math.min(menuLimit, available);
      const viewportLeft = window.visualViewport?.offsetLeft ?? 0;
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const width = Math.min(rect.width, viewportWidth - edge * 2);
      const left = Math.min(Math.max(viewportLeft + edge, rect.left), viewportLeft + viewportWidth - width - edge);
      setOpenAbove(above_);
      setPosition({ top: above_ ? Math.max(edge, rect.top - maxHeight - gap) : rect.bottom + gap, left, width, maxHeight });
    }
    placeMenu();
    window.addEventListener("resize", placeMenu);
    document.addEventListener("scroll", placeMenu, true);
    window.visualViewport?.addEventListener("resize", placeMenu);
    return () => {
      window.removeEventListener("resize", placeMenu);
      document.removeEventListener("scroll", placeMenu, true);
      window.visualViewport?.removeEventListener("resize", placeMenu);
    };
  }, [open, options.length, portal, mobileBottomInset]);

  function choose(nextValue: string) {
    const scrollSnapshot = selectionScrollRef.current.length ? selectionScrollRef.current : captureScrollSnapshot();
    selectionScrollRef.current = [];
    onChange(nextValue);
    setOpen(false);
    requestAnimationFrame(() => restoreFocusWithoutScroll(triggerRef.current, scrollSnapshot));
  }

  const menu = <div
    ref={menuRef}
    className={`app-select-menu dropdown-menu-surface${portal ? " app-select-menu-portaled" : ""}${portal && openAbove ? " drop-up" : ""}`}
    role="listbox"
    aria-label={ariaLabel}
    style={portal && position ? { top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight } : undefined}
    onPointerDownCapture={() => { selectionScrollRef.current = captureScrollSnapshot(); }}
  >
    {options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "selected" : ""} disabled={option.disabled} key={option.value} onClick={() => choose(option.value)}>{option.label}</button>)}
  </div>;

  return <div className={`app-select dropdown-align-${align} ${open ? "open" : ""} ${openAbove ? "drop-up" : ""} ${className}`.trim()} ref={rootRef}>
    <button ref={triggerRef} type="button" className="app-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}><span>{selected?.label || placeholder}</span><i className="dropdown-chevron" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3.5 6 4.5 4 4.5-4" /></svg></i></button>
    {open && (portal ? (position ? createPortal(menu, document.body) : null) : menu)}
  </div>;
}

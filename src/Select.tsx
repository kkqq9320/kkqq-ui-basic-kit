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

/**
 * 메뉴가 열릴 때 선택된 옵션이 보이도록 **메뉴 자신의 scrollTop만** 옮깁니다.
 * `Element.scrollIntoView()`는 조상 스크롤 컨테이너까지 함께 움직여 다이얼로그
 * 뒤 페이지가 튀므로 쓰지 않습니다 — `restoreFocusWithoutScroll`과 같은 이유입니다.
 *
 * 선택이 없으면(placeholder) 손대지 않습니다. 이미 첫 화면 안에 보이면 점프시키지
 * 않습니다 — 안 움직이는 편이 낫습니다. 그 외에는 옵션이 화면 가운데 오도록 옮기되
 * 목록 끝을 넘어가지 않게 자릅니다. 34px은 추정치라 실제 높이를 잽니다.
 */
function scrollSelectedOptionIntoView(menu: HTMLDivElement) {
  const selectedOption = menu.querySelector<HTMLElement>('[aria-selected="true"]');
  if (!selectedOption) return;
  const menuHeight = menu.clientHeight;
  const optionTop = selectedOption.offsetTop;
  const optionBottom = optionTop + selectedOption.offsetHeight;
  if (optionTop >= menu.scrollTop && optionBottom <= menu.scrollTop + menuHeight) return;
  const maxScrollTop = Math.max(0, menu.scrollHeight - menuHeight);
  const centered = optionTop - (menuHeight - selectedOption.offsetHeight) / 2;
  menu.scrollTop = Math.min(Math.max(0, centered), maxScrollTop);
}

/**
 * 활성 옵션이 메뉴 안에 보이도록 **최소한만** 옮깁니다.
 *
 * `scrollSelectedOptionIntoView`(위)와 다른 점은 **가운데로 맞추지 않는다**는 것입니다.
 * 그쪽은 열 때 한 번 도는 거라 가운데가 자연스럽지만, 방향키는 한 칸씩 움직이므로
 * 매번 가운데로 재정렬하면 목록이 손가락보다 크게 튑니다.
 *
 * `Element.scrollIntoView()`를 쓰지 않는 이유는 `scrollSelectedOptionIntoView`와
 * 같습니다 — 조상 스크롤 컨테이너까지 함께 움직여 다이얼로그 뒤 페이지가 튑니다.
 * `tests/Select.test.tsx`가 이 계약을 고정하고 있습니다.
 *
 * 값이 아니라 **인덱스**를 받는 이유: 옵션은 `options` 순서 그대로 렌더되므로
 * `menu.children[index]`가 정확히 대응합니다. 값으로 찾으면 선택자 이스케이프가
 * 필요하고(`CSS.escape`는 jsdom에 없습니다) 이득이 없습니다.
 */
export function scrollActiveOptionIntoView(menu: HTMLDivElement, activeIndex: number) {
  const option = menu.children[activeIndex] as HTMLElement | undefined;
  if (!option) return;
  const menuHeight = menu.clientHeight;
  const optionTop = option.offsetTop;
  const optionBottom = optionTop + option.offsetHeight;
  if (optionTop < menu.scrollTop) { menu.scrollTop = optionTop; return; }
  if (optionBottom > menu.scrollTop + menuHeight) menu.scrollTop = optionBottom - menuHeight;
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
  const scrolledToSelectionRef = useRef(false);
  // 실기기 트레이스(온스크린 이벤트 추적 패널)로 확인된 유령 click 대응. 논-포털
  // 메뉴에서 옵션을 탭하면, 옵션 자신의 click(menu=yes) 다음에 mousedown/mouseup
  // 없이 트리거를 겨냥한 click이 또 온다(관측 간격 24ms, menu=no — 이미 닫힌 뒤).
  // choose()가 예약한 rAF의 포커스 복원과 맞물려 나오는 것으로 보이며, 그 시점엔
  // 이미 메뉴가 닫혀 있어 :toggle이 "다시 열기"로 읽는다. 트리거 쪽에서 그 다음
  // click 한 번을 "닫는 대신 삼키기"로 처리해 재오픈을 막는다.
  const suppressReopenRef = useRef(false);
  // 메뉴 안에서 시작된(아직 떼지 않은) 포인터 제스처 동안, 그 제스처가 만드는 체이닝된
  // 조상 스크롤이 트리거를 움직여도 닫기 판정에서 제외합니다 — 아래 closeIfAnchorMoved 참고.
  const pointerDownInsideMenuRef = useRef(false);
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

  // 스크롤로 트리거(앵커)가 화면에서 멀어지면 닫습니다 — DateWheelPicker와 같은
  // 모양의 컨트롤인데 지금까지 동작이 달랐습니다(§16.4: 같은 모양은 같은 동작).
  // DateWheelPicker의 "스크롤에 닫힌다"는 실은 바깥 닫기를 pointerdown으로 판정하는
  // 데서 온 부수 효과였습니다 — 터치가 스크롤로 이어지더라도 반드시 pointerdown
  // (터치 시작)이 먼저 오므로, 스크롤을 "시작하는 순간" 우연히 닫힙니다(라이브
  // 브라우저로 확인: 데스크톱 wheel-스크롤로는 전혀 안 닫히고, 스크롤 없이
  // pointerdown 하나만 쏴도 닫힙니다). Select는 바깥 닫기를 mousedown으로 판정하는데
  // 스크롤로 이어지는 터치는 브라우저가 합성 mousedown/click을 만들지 않아 이
  // 부작용이 없었습니다 — 즉 pointerdown이 정답이 아니라 우연이었고, 여기서는 실제
  // 스크롤 판정을 명시적으로 둡니다.
  //
  // "아무 스크롤이나 오면 닫기"로 하지 않고 트리거의 실제 위치(rect)가 열었을 때와
  // 달라졌는지로 판정합니다. 무조건 닫으면, 메뉴가 열리는 순간 브라우저가 트리거를
  // 화면 안으로 스스로 스크롤시키는 경우(예: 포커스 이동에 따른 스크롤) 열리자마자
  // 스스로 닫혀 버릴 수 있습니다 — "앵커가 화면에서 멀어졌다"를 문자 그대로 판정하면
  // 이 문제를 피하면서 §7의 요구("앵커가 스크롤로 멀어진 앵커드 팝업은 남으면 안
  // 된다")도 그대로 만족합니다. 기준선은 메뉴가 열린 시점에 한 번만 잽니다.
  //
  // scroll은 버블되지 않으므로 document에 capture로 붙입니다 — 모바일에서는 #root가
  // 스크롤 호스트라(tokens.css:101-107) 버블 리스너로는 못 잡지만, capture 페이즈는
  // window→document→...→#root(타깃)까지 내려가며 호출되므로 document의 capture
  // 리스너가 #root 스크롤도, 데스크톱 document 스크롤도 모두 잡습니다 — 바로 아래
  // placeMenu 리스너가 이미 같은 전제로 재배치를 하고 있는 것과 같습니다.
  //
  // menuRef 쪽 스크롤(옵션 목록을 손으로 스크롤하거나 열릴 때 선택 항목으로 맞추는
  // 스크롤)은 트리거 rect를 바꾸지 않으므로 이 판정에서 자연히 걸러지지만, 불필요한
  // rect 계산을 피하려고 미리 걸러 둡니다.
  //
  // 그래도 이것만으로는 부족합니다(실기기 피드백: 긴 메뉴 위에서 아래로 스와이프하면
  // 스크롤 대신 메뉴가 닫힌다). 메뉴(overflow-y: auto, css/select.css)가 스크롤 끝에
  // 닿거나 애초에 스크롤할 내용이 짧으면, 같은 터치 제스처가 조상 스크롤러
  // (document/#root)로 체이닝됩니다 — 그 조상이 실제로 스크롤되면 트리거도 실제로
  // 움직이므로 위 판정("트리거가 진짜 멀어졌나")이 정직하게 걸려 닫아 버립니다.
  // event.target(체이닝된 스크롤은 document/#root가 target)만 보는 한 이 경우를
  // "메뉴 자신의 스크롤"과 구분할 수 없습니다 — 그래서 target이 아니라 제스처의
  // 시작점으로 판정합니다: pointerdown이 메뉴 안에서 시작해 아직 pointerup/cancel이
  // 오지 않은 동안에는, 그 사이 일어나는 어떤 앵커 이동도 닫기 판정에서 제외합니다.
  // DateWheelPicker의 "스와이프하면 안 닫힌다"를 그대로 베끼지 않습니다 — 거기는
  // pointerdown이 바깥 클릭 판정 자체를 우연히 먼저 타 버린 부수 효과였고(Select.tsx
  // 상단 주석 및 PRINCIPLES.md 참고 이력), 여기서는 "메뉴 안에서 시작된 제스처가
  // 아직 진행 중"이라는 명시적 조건 하나만 억제 근거로 씁니다 — 바깥 클릭·Escape·
  // 같은 트리거 재클릭·"진짜" 페이지 스크롤(메뉴 밖에서 시작한 손가락)은 전혀
  // 건드리지 않습니다.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) pointerDownInsideMenuRef.current = true;
    }
    function handlePointerUp() { pointerDownInsideMenuRef.current = false; }
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", handlePointerUp, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handlePointerUp, true);
      pointerDownInsideMenuRef.current = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const anchorRect = triggerRef.current.getBoundingClientRect();
    const anchorTop = anchorRect.top;
    const anchorLeft = anchorRect.left;
    function closeIfAnchorMoved(event: Event) {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      if (pointerDownInsideMenuRef.current) return;   // 메뉴 안에서 시작된 제스처가 아직 진행 중 — 체이닝된 조상 스크롤이어도 닫지 않는다
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      if (Math.abs(rect.top - anchorTop) > 1 || Math.abs(rect.left - anchorLeft) > 1) setOpen(false);
    }
    document.addEventListener("scroll", closeIfAnchorMoved, true);
    return () => { document.removeEventListener("scroll", closeIfAnchorMoved, true); };
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

  // 메뉴가 열릴 때 딱 한 번 선택된 옵션으로 스크롤합니다. portal 모드는 position이
  // 정해지기 전엔 메뉴가 DOM에 없으므로(위 이펙트가 커밋된 뒤에야 마운트) position도
  // 의존성에 넣어 다시 시도합니다. scrolledToSelectionRef가 없으면, 열려 있는 동안
  // 스크롤·리사이즈로 position이 재계산될 때마다(포털은 매번 새 객체를 만듭니다)
  // 사용자가 메뉴 안에서 직접 스크롤한 걸 되돌려버립니다.
  useLayoutEffect(() => {
    if (!open) { scrolledToSelectionRef.current = false; return; }
    if (scrolledToSelectionRef.current) return;
    const menu = menuRef.current;
    if (!menu) return;   // portal: position이 아직 없어 메뉴가 마운트되지 않음
    scrolledToSelectionRef.current = true;
    scrollSelectedOptionIntoView(menu);
  }, [open, position]);

  function choose(nextValue: string) {
    const scrollSnapshot = selectionScrollRef.current.length ? selectionScrollRef.current : captureScrollSnapshot();
    selectionScrollRef.current = [];
    onChange(nextValue);
    setOpen(false);
    // 유령 click은 아래 rAF(포커스 복원)와 같은 프레임에서 나오는 것으로 보이므로,
    // 여기서 곧바로 풀면(같은 프레임) 아직 안 왔을 수 있다(실측 24ms). 한 프레임
    // 더 미뤄서 푼다 — 프레임 기준이라 느린 기기에서는 같이 늘어나 여유가 준다.
    // 유령 click이 안 오는 정상 경로(데스크톱, 포털)에서도 이 만료가 있어야
    // suppressReopenRef가 다음 진짜 트리거 클릭까지 눌어붙지 않는다.
    suppressReopenRef.current = true;
    requestAnimationFrame(() => {
      restoreFocusWithoutScroll(triggerRef.current, scrollSnapshot);
      requestAnimationFrame(() => { suppressReopenRef.current = false; });
    });
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
    <button ref={triggerRef} type="button" className="app-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => {
      if (suppressReopenRef.current) { suppressReopenRef.current = false; return; }   // 유령 click 삼키기 — 토글하지 않는다
      setOpen((current) => !current);
    }}><span>{selected?.label || placeholder}</span><i className="dropdown-chevron" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3.5 6 4.5 4 4.5-4" /></svg></i></button>
    {open && (portal ? (position ? createPortal(menu, document.body) : null) : menu)}
  </div>;
}

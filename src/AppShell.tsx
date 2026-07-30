/* 앱 셸 — 원본: frontend/src/App.tsx:450-519의 레이아웃 부분
 * 필요한 CSS: tokens.css, sidebar.css, page.css
 *
 * 데스크톱은 [사이드바 | 작업 영역] 2열 그리드, 모바일은 단일 열 + 오프캔버스 서랍.
 * 상태는 전부 controlled입니다. navHidden/keyboardOpen은 hooks.ts의
 * useScrollDirectionHidden / useVirtualKeyboardOpen을 그대로 넣으면 됩니다.
 */
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { useVirtualKeyboard, type VirtualKeyboard } from "./hooks";

/** 포커스된 요소의 아래쪽과 키보드 사이에 남길 여유(px). 0이면 이론적으로는
 * 맞지만 반올림 오차로 1px씩 걸치는 걸 막습니다. */
const KEYBOARD_SCROLL_GAP = 8;

/**
 * 가상 키보드가 열리면 지금 포커스된 요소가 가려지지 않게 스크롤 호스트(`#root`)를
 * 옮기고, 닫히면 열기 전 위치로 되돌립니다.
 *
 * `useVirtualKeyboard()`가 이미 계산해 둔 `inset`(hooks.ts 참고)은 지금까지 아무도
 * 쓰지 않았습니다. 이걸 쓰는 것만으로는 부족합니다 — 패딩(아래 `style`의
 * `--keyboard-inset`, `page.css`의 `.workspace`가 소비)은 스크롤할 "공간"을
 * 만들 뿐 아무것도 움직이지 않고, 여기서 하는 스크롤 이동은 이미 있던 범위
 * 안에서만 움직여 필드가 페이지 맨 끝 근처면 여전히 못 벗어납니다. 두 개를
 * 같이 해야 실제로 고쳐집니다.
 *
 * `Element.scrollIntoView()`를 쓰지 않습니다. 이 앱의 `#root`는 `height: 100dvh`로
 * 고정되는데, 안드로이드 기본(`resizes-visual`, `index.html`에 `interactive-widget`
 * 지정이 없어 이게 적용됩니다) 키보드는 레이아웃 뷰포트를 줄이지 않으므로 `dvh`도
 * 안 줄어듭니다 — `#root.clientHeight`는 키보드가 떠도 그대로입니다. 그 상태에서
 * `scrollIntoView`가 "보이는지"를 판단하는 기준은 `#root`의 `scroll-padding-bottom:
 * 40dvh`(tokens.css)뿐인데, 이 값은 실제 키보드 높이와 무관한 상수라 우연히 맞아
 * 떨어지는 경우만 동작하고 대부분은 몇 px만 움직이거나 전혀 안 움직입니다(실측:
 * 아래 훅 사용처의 라이브 검증 참고). 그래서 `visualViewport`로 직접 가려진 영역을
 * 계산해 `scrollTop`을 더합니다 — `Select.tsx:41-44`가 메뉴 자신을 스크롤할 때
 * `scrollIntoView` 대신 직접 `scrollTop` 산수를 쓰는 것과 같은 이유이자 같은 방식
 * 입니다(그 파일의 `scrollSelectedOptionIntoView`가 선례). 부수 이득: jsdom은
 * `scrollIntoView`를 구현하지 않으므로(`tests/Select.test.tsx:228` 참고) 이 방식이라야
 * 단위 테스트가 성립합니다.
 *
 * `useLayoutEffect`인 이유: 키보드가 닫혀 패딩이 사라지는 것(렌더)과 스크롤 위치를
 * 되돌리는 것을 같은 커밋에서 끝내 브라우저가 페인트하기 전에 반영합니다.
 * `useEffect`였다면 브라우저가 먼저 (패딩 없이 짧아진 콘텐츠에 맞춰) `scrollTop`을
 * 자체적으로 clamp해 한 번 그리고, 그다음 틱에 우리가 또 되돌려 이중으로 튀어
 * 보일 수 있습니다(`useBackToClose`가 같은 이유로 `useLayoutEffect`를 쓴 것과 같은
 * 논리 — hooks.ts 참고).
 *
 * 사용자가 직접 스크롤한 걸 덮어쓰지 않습니다: 되돌릴 때, 지금 `scrollTop`이 우리가
 * 마지막으로 맞춰 둔 값과 다르면(그 사이 사용자가 직접 스크롤했다는 뜻) 손대지 않고
 * 그대로 둡니다 — 긴 폼에서 타이핑하며 스크롤하는 흔한 경우를 뒤로 튕기지 않기 위해서.
 *
 * 키보드가 열린 채로 포커스가 다른 편집 요소로 옮겨가도(탭 이동 등) 다시 맞추도록
 * 열려 있는 동안은 `focusin`도 듣습니다.
 *
 * 다이얼로그 안의 포커스는 건드리지 않습니다. 다이얼로그는 `document.body`에
 * 포털되어(`Dialog.tsx`) `#root`의 자손이 아니므로 `scrollRoot.contains(focused)`가
 * 자연히 걸러 주고, 다이얼로그 자신의 위치는 이미 `useVisualViewportBox()`로 따로
 * 맞춰져 있습니다(§10, `Dialog.tsx`).
 */
function useKeyboardScrollCompensation(keyboard: VirtualKeyboard, scrollRootId = "root") {
  const restingScrollTop = useRef<number | null>(null);
  const appliedScrollTop = useRef<number | null>(null);

  useLayoutEffect(() => {
    const scrollRoot = document.getElementById(scrollRootId);
    if (!scrollRoot) return;

    if (!keyboard.open) {
      if (restingScrollTop.current !== null) {
        const current = scrollRoot.scrollTop;
        const applied = appliedScrollTop.current;
        if (applied === null || Math.abs(current - applied) < 1) {
          scrollRoot.scrollTop = restingScrollTop.current;
        }
        restingScrollTop.current = null;
        appliedScrollTop.current = null;
      }
      return;
    }

    function reposition() {
      const focused = document.activeElement;
      const viewport = window.visualViewport;
      if (!viewport || !(focused instanceof HTMLElement) || !scrollRoot!.contains(focused)) return;
      if (restingScrollTop.current === null) restingScrollTop.current = scrollRoot!.scrollTop;
      const rect = focused.getBoundingClientRect();
      const visibleBottom = viewport.offsetTop + viewport.height;
      const overshoot = rect.bottom - visibleBottom + KEYBOARD_SCROLL_GAP;
      if (overshoot > 0) scrollRoot!.scrollTop += overshoot;
      appliedScrollTop.current = scrollRoot!.scrollTop;
    }

    reposition();
    document.addEventListener("focusin", reposition);
    return () => document.removeEventListener("focusin", reposition);
  }, [keyboard.open, keyboard.inset, scrollRootId]);
}

export type AppShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
  /** 데스크톱 사이드바 접힘. 모바일에서는 CSS가 무시합니다. */
  collapsed?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  /** true면 떠 있는 하단 바들이 아래로 사라집니다. */
  navHidden?: boolean;
  /** true면 가상 키보드에 가리지 않게 떠 있는 바들을 감춥니다. */
  keyboardOpen?: boolean;
  /** MobileQuickBar */
  quickBar?: ReactNode;
  /** MobilePageTabs */
  pageTabs?: ReactNode;
  overlayLabel?: string;
};

export function AppShell({ sidebar, children, collapsed = false, mobileOpen = false, onMobileClose, navHidden = false, keyboardOpen = false, quickBar, pageTabs, overlayLabel = "사이드바 닫기" }: AppShellProps) {
  const className = ["app-shell", collapsed && "sidebar-collapsed", navHidden && "mobile-nav-hidden", keyboardOpen && "mobile-keyboard-open"].filter(Boolean).join(" ");
  // 소비 앱은 보통 useVirtualKeyboardOpen()(불리언만)으로 keyboardOpen prop을 주므로,
  // 스크롤 보정에 필요한 inset은 여기서 직접 한 번 더 구독합니다 — Dialog.tsx가
  // useVisualViewportBox()를 prop이 아니라 직접 부르는 것과 같은 선례입니다.
  const keyboard = useVirtualKeyboard();
  useKeyboardScrollCompensation(keyboard);
  // .workspace(page.css)가 이 변수를 기존 하단 패딩에 더합니다. 키보드가 닫히면
  // 0으로 돌아가 레이아웃도 원래 폭으로 돌아갑니다.
  const style = { "--keyboard-inset": keyboard.open ? `${keyboard.inset}px` : "0px" } as CSSProperties;
  return <div className={className} style={style}>
    {mobileOpen && onMobileClose && <button type="button" className="mobile-sidebar-overlay" aria-label={overlayLabel} onClick={onMobileClose} />}
    {sidebar}
    <main className="workspace">{children}</main>
    {quickBar}
    {pageTabs}
  </div>;
}

/* 앱 셸 — 원본: frontend/src/App.tsx:450-519의 레이아웃 부분
 * 필요한 CSS: tokens.css, sidebar.css, page.css
 *
 * 데스크톱은 [사이드바 | 작업 영역] 2열 그리드, 모바일은 단일 열 + 오프캔버스 서랍.
 * 상태는 전부 controlled입니다. navHidden/keyboardOpen은 hooks.ts의
 * useScrollDirectionHidden / useVirtualKeyboardOpen을 그대로 넣으면 됩니다.
 */
import { useLayoutEffect, type CSSProperties, type ReactNode } from "react";

import { useVirtualKeyboard, type VirtualKeyboard } from "./hooks";

/** 포커스된 요소의 아래쪽과 키보드 사이에 남길 여유(px). 0이면 이론적으로는
 * 맞지만 반올림 오차로 1px씩 걸치는 걸 막습니다. */
const KEYBOARD_SCROLL_GAP = 8;

/**
 * 가상 키보드가 열리면 지금 포커스된 요소가 가려지지 않게 스크롤 호스트(`#root`)를
 * 옮깁니다.
 *
 * `useVirtualKeyboard()`가 이미 계산해 둔 `inset`(hooks.ts 참고)은 한때 아무도
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
 * **닫힐 때는 아무것도 되돌리지 않습니다.** 이전 버전(`ddc316e`/`1dc8b60`)은 키보드가
 * 열리기 전 `scrollTop`을 기억해 뒀다가 닫히면 그 자리로 강제로 되돌렸습니다(사용자가
 * 그 사이 18px 넘게 스스로 스크롤한 게 아니라면). 실기기 피드백은 이걸 "시점이 확확
 * 바뀌어서 어지럽다"고 표현했습니다 — 정확히 그 되돌리기가 원인이었습니다. 사용자는
 * 이전 스크롤 위치로 돌아가 달라고 요청한 적이 없습니다: 요청하지 않은 이동을 강제하는
 * 건 Apple 인터페이스 원칙 §16.2(Agency)를 어기고, "어지럽다"는 표현 자체가 §14가
 * 말하는 전정기관(vestibular) 반응이지 미학의 문제가 아닙니다. iOS 자신도 키보드를
 * 내릴 때 스크롤 위치를 당겨오지 않습니다 — 사용자가 어디 있었든 그대로 둡니다
 * (§16.4 Familiarity: 플랫폼이 이미 하는 대로). `PRINCIPLES.md` §9는 애초에 "닫히면
 * 되돌린다"를 요구한 적이 없습니다(그 절은 떠 있는 컨트롤의 노출 여부만 다룹니다) —
 * 되돌리기는 이전 수정이 스스로 만든 계약이었고, 그 계약 자체가 어지러움의 원인이었던
 * 셈입니다. 그래서 이번 수정은 되돌리는 코드를 추가하는 대신 통째로 들어냈습니다.
 *
 * 패딩이 사라지면서(`css/page.css`) 콘텐츠가 짧아져 `scrollTop`이 이미 맨 끝
 * 근처였던 경우, 브라우저가 스스로 `scrollTop`을 clamp할 수 있습니다 — 이건 코드가
 * 만드는 이동이 아니라 레이아웃이 줄어든 만큼 따라오는 불가피한 결과라 막을 수
 * 없지만, 유일한 움직임이어야 합니다(우리가 되돌리는 이동을 더 얹지 않으므로 실제로
 * 그렇습니다). `css/page.css`의 `.app-shell:not(.keyboard-inset-open) .workspace`가
 * 그 축소 자체를 부드럽게 만들어(§4 배치 전환: damping 1.0) 한 프레임에 끊기지
 * 않게 합니다 — 단, 키보드가 실제로 열려 있는 동안은 절대 이 트랜지션을 걸면 안
 * 됩니다. 아래 `useLayoutEffect`가 같은 프레임 안에서 곧장 `scrollTop`을 미는데,
 * 패딩이 트랜지션 중이면 그 순간의 레이아웃은 아직 늘어나지 않은 옛 값 기준이라
 * `scrollTop` 증가분이 그대로 clamp돼 버려 포커스 필드가 다시 가려집니다 — 그래서
 * AppShell은 `keyboard.open`에서 파생된 `.keyboard-inset-open` 마커를 붙여 CSS가
 * 그 경우만 걸러내게 합니다(아래 `AppShell` 컴포넌트, `css/page.css` 참고).
 *
 * `useLayoutEffect`인 이유는 이제 열리는 쪽 하나뿐입니다: 포커스된 요소가 키보드
 * 뒤로 잠깐이라도 보이는 프레임 없이, 패딩이 반영되는 것과 같은 커밋에서 스크롤
 * 이동도 끝내야 합니다. `useEffect`라면 그 사이 한 프레임이 가려진 채로 페인트될
 * 수 있습니다.
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
  useLayoutEffect(() => {
    const scrollRoot = document.getElementById(scrollRootId);
    if (!scrollRoot || !keyboard.open) return;

    function reposition() {
      const focused = document.activeElement;
      const viewport = window.visualViewport;
      if (!viewport || !(focused instanceof HTMLElement) || !scrollRoot!.contains(focused)) return;
      const rect = focused.getBoundingClientRect();
      const visibleBottom = viewport.offsetTop + viewport.height;
      const overshoot = rect.bottom - visibleBottom + KEYBOARD_SCROLL_GAP;
      if (overshoot > 0) scrollRoot!.scrollTop += overshoot;
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
  // 소비 앱은 보통 useVirtualKeyboardOpen()(불리언만)으로 keyboardOpen prop을 주므로,
  // 스크롤 보정에 필요한 inset은 여기서 직접 한 번 더 구독합니다 — Dialog.tsx가
  // useVisualViewportBox()를 prop이 아니라 직접 부르는 것과 같은 선례입니다.
  const keyboard = useVirtualKeyboard();
  useKeyboardScrollCompensation(keyboard);
  // keyboard-inset-open은 keyboardOpen prop(.mobile-keyboard-open)과 다른 목적의 별도
  // 마커입니다. keyboardOpen은 소비 앱이 주는 값이라 관례상 keyboard.open과 같을 뿐
  // 보장되지 않는 반면(위 주석), css/page.css가 .workspace의 패딩 트랜지션을 끄는
  // 기준은 반드시 이 컴포넌트 자신의 keyboard.open과 같은 렌더에서 나와야 합니다 —
  // 그래야 위 useKeyboardScrollCompensation이 같은 프레임에서 scrollTop을 미는 동안
  // 패딩이 트랜지션 중이라 아직 못 늘어난 레이아웃에 clamp되는 걸 막을 수 있습니다.
  // 두 마커를 하나로 합치지 마세요 — 합치면 소비 앱이 keyboardOpen을 깜빡 빠뜨리거나
  // 늦게 줄 때 이 가드가 조용히 깨집니다.
  const className = ["app-shell", collapsed && "sidebar-collapsed", navHidden && "mobile-nav-hidden", keyboardOpen && "mobile-keyboard-open", keyboard.open && "keyboard-inset-open"].filter(Boolean).join(" ");
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

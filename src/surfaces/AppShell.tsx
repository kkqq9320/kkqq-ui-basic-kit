/* 앱 셸 — 원본: frontend/src/App.tsx:450-519의 레이아웃 부분
 * 필요한 CSS: tokens.css, sidebar.css, page.css
 *
 * 데스크톱은 [사이드바 | 작업 영역] 2열 그리드, 모바일은 단일 열 + 오프캔버스 서랍.
 * navHidden/keyboardOpen은 scrollDirection.ts의 useScrollDirectionHidden /
 * useVirtualKeyboardOpen을 그대로 넣으면 됩니다.
 *
 * **프롭은 controlled지만 이 컴포넌트가 상태 없이 도는 건 아닙니다.** 한때 여기와
 * README에 "상태는 전부 controlled입니다"라고 적혀 있었는데, 모바일 가상 키보드 보정이
 * 들어오면서 사실이 아니게 됐습니다. 그 보정은 이제
 * `browser/keyboardCompensation.ts`에 있습니다 — 이 셸은 그 훅 둘을 부를 뿐이지만,
 * 뷰포트에 반응하는 그 동작은 소비 앱이 프롭으로 끄거나 대체할 수 없습니다.
 */
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { useKeyboardScrollCompensation, useReleasableKeyboardInset } from "../browser/keyboardCompensation";
import { useVirtualKeyboard } from "../browser/visualViewport";
import { Pressable } from "../controls/Pressable";

export type AppShellProps = {
  /** 앱이 이 컴포넌트를 겨눌 때의 출구. **내보내는 컴포넌트는 전부 이걸 받습니다** —
   *  자주 쓰는 것만 prop으로 열고 나머지는 이걸로 겁니다(PageChrome.tsx의 GridJustify 옆 주석). */
  className?: string;

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
  /** 페이지 **끝 여백**을 어떻게 둘지.
   *
   * - `"adaptive"`(기본) — 여백이 **스스로 스크롤을 만들지 않습니다.** 내용이 화면에
   *   들어가면 남는 자리만 쓰고, 이미 넘치는 페이지에서는 여백을 그대로 둡니다.
   * - `"fixed"` — 언제나 `--workspace-space-bottom`만큼. **이 킷의 예전 동작**입니다.
   *   내용이 화면을 거의 채우면 그 여백만으로 스크롤이 생깁니다.
   *
   * 앱이 페이지 끝 여백에 무언가를 기대고 있다면(직접 띄운 고정 바 자리 등)
   * `"fixed"`로 두세요. 그 경우 재지도, 관찰하지도 않습니다. */
  trailingSpace?: "adaptive" | "fixed";
};

/** 페이지 끝 여백이 **스스로 스크롤을 만들지 않게** 하되, 내용이 이미 넘치는
 * 페이지에서는 그 여백을 그대로 두는 판정. 규칙과 근거는 `css/page.css`의
 * `.workspace::after` 주석에 있습니다.
 *
 * **왜 CSS만으로는 안 되는가.** 여백은 진짜 공간이라 그 자신이 넘침을 만듭니다.
 * "항상 80"과 "절대 스크롤을 안 만듦"은 그 순환 때문에 배타적이고, 어떤 고정값도
 * 두 요구를 동시에 만족시키지 못합니다.
 *
 * **왜 진동하지 않는가.** 판정 기준이 문서 높이가 아니라 **내용만의 높이**입니다.
 * 스페이서가 얼마를 먹든 `내용 = 문서 − 스페이서`는 같은 값이라, 한 번 나온 답이
 * 자기 결과 때문에 뒤집히지 않습니다:
 *
 *   넘침    → 여백 80 고정 → 내용은 여전히 넘침    → 고정 유지
 *   안 넘침 → 남는 자리만  → 내용은 여전히 안 넘침 → 그대로
 *
 * ⚠️ **모바일에서는 아무것도 고르지 않습니다.** `css/page.css`가 그쪽 스페이서를
 * `content: none`으로 꺼서 이 표식이 매치할 규칙이 없습니다. 모바일 하단 패딩은
 * 고정 바 자리와 키보드 보정이 기대는 값이라 성격이 완전히 다릅니다.
 */
function useContentDrivenTrailingSpace(workspaceRef: { current: HTMLElement | null }, mode: "adaptive" | "fixed") {
  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    const view = workspace?.ownerDocument.defaultView;
    if (!workspace || !view) return;

    /* 앱이 이미 정했으면 재지 않습니다 — 관찰도 걸지 않습니다. 판정이 없으니 값이
     * 흔들릴 일도 없고, 끝 여백에 무언가를 기대는 앱이 그 기대를 지킬 수 있습니다. */
    if (mode === "fixed") {
      workspace.dataset.trailingSpace = "fixed";
      return;
    }

    const measure = () => {
      const root = workspace.ownerDocument.documentElement;
      // `content: none`(모바일)이면 height가 "auto"로 와서 NaN이 됩니다.
      const spacer = Number.parseFloat(view.getComputedStyle(workspace, "::after").height);
      const contentHeight = root.scrollHeight - (Number.isFinite(spacer) ? spacer : 0);
      const next = contentHeight > root.clientHeight ? "fixed" : "free";
      if (workspace.dataset.trailingSpace !== next) workspace.dataset.trailingSpace = next;
    };

    measure();

    // 내용 높이는 창 크기 말고도 바뀝니다 — 탭 전환, 폼이 늘어남, 폰트 로드.
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(workspace);
    view.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      view.removeEventListener("resize", measure);
    };
  }, [workspaceRef, mode]);
}

export function AppShell({ sidebar, children, collapsed = false, mobileOpen = false, onMobileClose, navHidden = false, keyboardOpen = false, quickBar, pageTabs, overlayLabel = "사이드바 닫기", className = "", trailingSpace = "adaptive" }: AppShellProps) {
  // 소비 앱은 보통 useVirtualKeyboardOpen()(불리언만)으로 keyboardOpen prop을 주므로,
  // 스크롤 보정에 필요한 inset은 여기서 직접 한 번 더 구독합니다 — Dialog.tsx가
  // useVisualViewportBox()를 prop이 아니라 직접 부르는 것과 같은 선례입니다.
  const keyboard = useVirtualKeyboard();
  useKeyboardScrollCompensation(keyboard);
  // 닫힐 때 --keyboard-inset을 즉시 0으로 떨어뜨리지 않고, 지금 scrollTop이 그 여백에
  // 기대고 있는 동안은 지연 해제한다(useReleasableKeyboardInset 문서 참고, A2).
  const keyboardInset = useReleasableKeyboardInset(keyboard);
  // keyboard-inset-open은 keyboardOpen prop(.mobile-keyboard-open)과 다른 목적의 별도
  // 마커입니다. keyboardOpen은 소비 앱이 주는 값이라 관례상 keyboard.open과 같을 뿐
  // 보장되지 않는 반면(위 주석), css/page.css가 .workspace의 패딩 트랜지션을 끄는
  // 기준은 반드시 이 컴포넌트 자신의 keyboard.open과 같은 렌더에서 나와야 합니다 —
  // 그래야 위 useKeyboardScrollCompensation이 같은 프레임에서 scrollTop을 미는 동안
  // 패딩이 트랜지션 중이라 아직 못 늘어난 레이아웃에 clamp되는 걸 막을 수 있습니다.
  // 두 마커를 하나로 합치지 마세요 — 합치면 소비 앱이 keyboardOpen을 깜빡 빠뜨리거나
  // 늦게 줄 때 이 가드가 조용히 깨집니다.
  //
  // keyboard-inset-holding — 전체 브랜치 리뷰 Finding 1. releaseFloor(keyboardInset,
  // keyboard.open이 꺼진 뒤)가 아직 0보다 큰 동안, 즉 지연 해제가 진행 중인 동안
  // 붙입니다. 이유: css/page.css:55의 padding 트랜지션이 켜져 있으면(마커가 하나도
  // 없으면) --keyboard-inset이 바뀔 때마다 실제로 화면에 그려지는 .workspace의
  // padding-bottom이 최대 400ms 동안 옛 값 쪽에 남습니다. 그런데
  // useReleasableKeyboardInset의 recompute()(위)는 scrollRoot.scrollHeight를 읽어
  // naturalMax = scrollHeight - current - clientHeight를 계산합니다 — scrollHeight는
  // "지금 그려진" 값인데 current는 "이미 커밋된 목표값"이라, 트랜지션이 걸려 있는
  // 동안은 이 둘이 어긋나 naturalMax를 (그려진 값 - 목표값)만큼 과대평가하고
  // candidate를 그만큼 과소평가합니다 — 사용자가 스크롤을 전혀 안 했는데도 예약된
  // 여백이 저절로 줄어드는(§16.2 Agency 위반, 최악의 경우 그 사이클의 예약이 통째로
  // 0으로 무너짐) 결과가 됩니다. 고침은 이 트랜지션이 releaseFloor > 0인 동안은 걸리지
  // 않게 막는 것입니다 — 그러면 rendered(scrollHeight가 반영하는 값)와 committed
  // target(current)이 지연 해제가 끝날 때까지 항상 같아 이 어긋남 자체가 생기지
  // 않습니다. floor가 정확히 0에 도달하는 "마지막 한 걸음"에서는(recompute()가 0으로
  // 낮춘 바로 그 렌더에서) 마커가 함께 사라지므로 css/page.css:47-54가 원래 의도한
  // 부드러운 최종 축소는 그대로 유지됩니다 — 그 시점부터는 recompute()의 scroll
  // 리스너도 스스로 떨어져 나가 더 이상 scrollHeight를 읽지 않으므로(위 useLayoutEffect
  // 참고) 그 마지막 트랜지션 창은 안전합니다. getComputedStyle로 그려진 padding을
  // 직접 읽는 대안(레이아웃을 강제하고 102px+safe-area를 다시 빼야 함)보다 이쪽을
  // 골랐습니다 — keyboard-inset-open과 같은 idiom이라 새 개념이 없고, 매 스크롤
  // 틱마다 강제 리플로우를 만들지 않습니다.
  // 페이지 끝 여백이 스스로 스크롤을 만들지 않게 하는 판정(위 훅 문서 참고).
  const workspaceRef = useRef<HTMLElement | null>(null);
  useContentDrivenTrailingSpace(workspaceRef, trailingSpace);

  const releaseInProgress = !keyboard.open && keyboardInset > 0;
  const shellClassName = ["app-shell", className, collapsed && "sidebar-collapsed", navHidden && "mobile-nav-hidden", keyboardOpen && "mobile-keyboard-open", keyboard.open && "keyboard-inset-open", releaseInProgress && "keyboard-inset-holding"].filter(Boolean).join(" ");
  // .workspace(page.css)가 이 변수를 기존 하단 패딩에 더합니다. 키보드가 닫히면
  // (지금 스크롤 위치가 허락하는 만큼) 0으로 돌아가 레이아웃도 원래 폭으로 돌아갑니다.
  const style = { "--keyboard-inset": `${keyboardInset}px` } as CSSProperties;
  return <div className={shellClassName} style={style}>
    {mobileOpen && onMobileClose && <Pressable className="mobile-sidebar-overlay" aria-label={overlayLabel} onClick={onMobileClose} />}
    {sidebar}
    <main className="workspace" ref={workspaceRef}>{children}</main>
    {quickBar}
    {pageTabs}
  </div>;
}

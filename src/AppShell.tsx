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

/** --motion-reposition(tokens.css)과 같은 값입니다. 스프링 라이브러리 없이 스크롤
 * 오프셋을 직접 애니메이션할 때도 이 킷의 다른 "재배치" 전환과 같은 리듬을 타야
 * 하므로, 토큰이 바뀌면 이 값도 같이 바꾸세요. */
const KEYBOARD_SCROLL_ANIMATION_MS = 400;

/** --sidebar-ease(tokens.css)와 같은 cubic-bezier(.32, .72, 0, 1) — Apple이 실제로
 * 쓰는 재배치 값(damping 1.0, response 0.4)을 오버슈트 없이 흉내 낸 곡선입니다.
 * `scrollTop`은 레이아웃 값이라 CSS `transition`으로 보간되지 않으므로(트랜지션은
 * transform·opacity 등 합성 가능한 속성에만 걸립니다 — §11), 같은 곡선을 여기서
 * 직접 계산합니다. 진행률 t에 대응하는 x를 Newton-Raphson으로 역산하는 방식은
 * WebKit의 UnitBezier·Firefox의 nsSMILKeySpline과 같은 표준 계산입니다(값 자체가
 * 수학 공식이라 라이브러리를 들여오는 게 아닙니다). */
function createCubicBezierEasing(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  function sampleX(t: number) { return ((ax * t + bx) * t + cx) * t; }
  function sampleY(t: number) { return ((ay * t + by) * t + cy) * t; }
  function sampleDerivativeX(t: number) { return (3 * ax * t + 2 * bx) * t + cx; }
  function solveForT(x: number) {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < 1e-5) return t;
      const derivative = sampleDerivativeX(t);
      if (Math.abs(derivative) < 1e-6) break;
      t -= dx / derivative;
    }
    return t;
  }
  return function ease(x: number) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveForT(x));
  };
}

const repositionEase = createCubicBezierEasing(0.32, 0.72, 0, 1);

/** jsdom을 포함해 matchMedia가 없는 환경에서는 "reduce 아님"으로 취급합니다 — 실제
 * 브라우저는 전부 이걸 지원하므로 이 기본값은 테스트 환경만을 위한 것입니다. */
function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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
 * 보정도 "시작"해야 합니다(아래처럼 애니메이션으로 바뀐 뒤에도 시작 시점은 같은
 * 프레임이어야 합니다 — 그래야 다음 프레임부터 곧장 올바른 방향으로 움직입니다).
 * `useEffect`라면 그 사이 한 프레임이 가려진 채로 페인트될 수 있습니다.
 *
 * 키보드가 열린 채로 포커스가 다른 편집 요소로 옮겨가도(탭 이동 등) 다시 맞추도록
 * 열려 있는 동안은 `focusin`도 듣습니다.
 *
 * 다이얼로그 안의 포커스는 건드리지 않습니다. 다이얼로그는 `document.body`에
 * 포털되어(`Dialog.tsx`) `#root`의 자손이 아니므로 `scrollRoot.contains(focused)`가
 * 자연히 걸러 주고, 다이얼로그 자신의 위치는 이미 `useVisualViewportBox()`로 따로
 * 맞춰져 있습니다(§10, `Dialog.tsx`).
 *
 * **스크롤 이동 자체(§3/§4, 실기기 피드백 "확확 올라가서 어지럽다"의 원인):**
 * 예전에는 `scrollRoot.scrollTop += overshoot`로 논리적 목표치에 순간이동했습니다
 * (인스턴스 하나짜리 대입, 한 프레임). 스프링 라이브러리를 새로 들이지 않고도
 * 연속적으로 만들기 위해, 이 킷의 다른 "재배치" 전환과 같은 곡선(damping 1.0,
 * response 0.4 — `--motion-reposition`의 400ms와 `--sidebar-ease`를 그대로 재사용,
 * 위 `repositionEase`)으로 여러 rAF 프레임에 걸쳐 도착하도록 바꿨습니다.
 * `scroll-behavior: smooth`는 쓰지 않습니다 — 브라우저가 고르는 곡선·시간을 우리가
 * 통제할 수 없고, reduced-motion 처리도 브라우저마다 달라 §14를 보장할 수 없습니다.
 *
 * rAF 핸들은 컴포넌트 렌더 사이에도 살아남는 `useRef`에 둡니다(`rafIdRef`) —
 * 이펙트 본문 안의 지역 변수로 두면 이펙트가 다시 실행될 때마다 핸들 자체를
 * 잃어버려 진행 중이던 애니메이션을 추적할 수 없습니다.
 *
 * 아래는 이펙트가 **둘**입니다. 리스너(`focusin`) 수명은 `keyboard.open`(과
 * `scrollRootId`)에만 묶고, 실제 `reposition()` 호출은 `keyboard.inset`까지 포함한
 * 두 번째 이펙트 하나에서만 합니다. 처음엔 이걸 한 이펙트로 합쳐 두 곳 모두에서
 * `reposition()`을 불렀는데, 키보드가 열리는 바로 그 커밋에서 `keyboard.open`과
 * `keyboard.inset`이 함께 바뀌면 두 이펙트가 같은 커밋에서 동시에 실행돼
 * `reposition()`이 두 번 불립니다 — 두 번째 호출 시점엔 첫 번째 호출이 아직 화면에
 * 반영되지 않았으므로(애니메이션은 다음 rAF 프레임에야 움직입니다) 같은 overshoot를
 * 또 계산해 겹쳐 적용하는 이중 적용 버그가 생깁니다(리듀스드모션의 순간이동
 * 경로에서 overshoot가 두 배로 더해지는 것으로 드러났습니다). 그래서 `reposition()`
 * 호출은 의존성 배열에 열림·인셋·scrollRootId를 전부 모은 이펙트 **하나**에만 두어
 * "커밋당 정확히 한 번"을 보장합니다.
 *
 * 리스너를 `keyboard.inset`에도 묶어 매번 뜯었다 다시 달면 다른 문제가 생깁니다:
 * 안드로이드가 키보드를 여러 단계로 리사이즈하며 열 때마다(`keyboard.inset`이 그때마다
 * 바뀝니다) 리스너가 churn하면서, 정리 함수가 매번 진행 중이던 rAF를 끊어 버리고
 * 다시 처음(0%)부터 시작하는 여러 개의 작은 이즈-인이 이어붙은 것처럼 보일 수
 * 있습니다 — 원래 결함("여러 단계로 끊긴다")이 형태만 바뀌어 재발하는 셈입니다.
 * 그래서 리스너의 수명은 `keyboard.open`/`scrollRootId`에만 묶고, `keyboard.inset`
 * 변화는 (리스너를 다시 달지 않고) 두 번째 이펙트가 그냥 `reposition()`을 한 번 더
 * 불러서 처리합니다 — `animateScrollTopBy`가 그 안에서 "지금(presentation)
 * scrollTop"을 새로 읽어 새 목표로 다시 겨냥하므로(§3: 논리적 목표가 아니라 현재
 * 값에서 시작), 진행 중이던 애니메이션이 처음부터 다시 시작되지 않습니다. 리스너
 * 자체를 뜯는(그리고 진행 중이던 rAF를 취소하는) 건 키보드가 실제로 닫히거나
 * (`keyboard.open`이 꺼지거나) 컴포넌트가 사라질 때뿐입니다.
 */
function useKeyboardScrollCompensation(keyboard: VirtualKeyboard, scrollRootId = "root") {
  const rafIdRef = useRef<number | null>(null);

  function cancelPendingScroll() {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }

  /** scrollRoot.scrollTop을 지금 값에서 delta만큼 더한 값까지 애니메이션합니다.
   * 진행 중이던 이전 애니메이션이 있으면 목표가 아니라 "지금(presentation)" 값에서
   * 다시 시작합니다(§3) — cancelPendingScroll이 rAF만 끊고 scrollTop 자체는 그대로
   * 두므로, 바로 아래에서 읽는 from이 그 중간값입니다. */
  function animateScrollTopBy(scrollRoot: HTMLElement, delta: number) {
    cancelPendingScroll();
    if (delta === 0) return;
    if (prefersReducedMotion()) { scrollRoot.scrollTop += delta; return; }
    const from = scrollRoot.scrollTop;
    const to = from + delta;
    let startTime: number | null = null;
    function step(timestamp: number) {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min(1, (timestamp - startTime) / KEYBOARD_SCROLL_ANIMATION_MS);
      scrollRoot.scrollTop = from + (to - from) * repositionEase(progress);
      rafIdRef.current = progress < 1 ? requestAnimationFrame(step) : null;
    }
    rafIdRef.current = requestAnimationFrame(step);
  }

  function reposition() {
    const scrollRoot = document.getElementById(scrollRootId);
    const focused = document.activeElement;
    const viewport = window.visualViewport;
    cancelPendingScroll();
    if (!scrollRoot || !viewport || !(focused instanceof HTMLElement) || !scrollRoot.contains(focused)) return;
    const rect = focused.getBoundingClientRect();
    const visibleBottom = viewport.offsetTop + viewport.height;
    const overshoot = rect.bottom - visibleBottom + KEYBOARD_SCROLL_GAP;
    if (overshoot > 0) animateScrollTopBy(scrollRoot, overshoot);
  }

  // 리스너 수명은 keyboard.open(과 scrollRootId)에만 묶습니다 — reposition() 호출은
  // 여기서 하지 않습니다(아래 두 번째 이펙트가 전담). keyboard.open과 keyboard.inset이
  // 같은 커밋에서 함께 바뀌는 경우(열리는 바로 그 순간이 정확히 이 경우입니다)
  // 이펙트를 둘 다 트리거 조건에 넣으면서 "둘 다 reposition()을 부르면" 한 커밋에
  // 두 번 호출되어 아직 반영 안 된 같은 측정값 위에 겹쳐 적용하는 이중 적용 버그가
  // 생깁니다(리듀스드모션의 순간이동 경로에서 overshoot가 두 번 더해지는 것으로
  // 드러났습니다 — 두 번 다 "지금 scrollTop"이 아직 그대로인 상태에서 같은 overshoot를
  // 또 계산하기 때문입니다). 그래서 reposition() 호출은 오직 하나의 이펙트에서만,
  // 그 이펙트의 의존성 배열에 열림·인셋·scrollRootId를 전부 모아 "커밋당 정확히
  // 한 번"만 부르도록 합니다. 리스너는 열림/scrollRootId가 바뀔 때만 뜯었다 다시
  // 달아, keyboard.inset만 바뀌는 매 단계(안드로이드 다단계 리사이즈)마다 리스너
  // churn과 그로 인한 취소가 일어나지 않게 합니다.
  useLayoutEffect(() => {
    if (!keyboard.open) return;
    document.addEventListener("focusin", reposition);
    return () => {
      document.removeEventListener("focusin", reposition);
      cancelPendingScroll();
    };
  }, [keyboard.open, scrollRootId]);

  // 실제 재계산·재조준은 여기 한 곳에서만 합니다. keyboard.open이 막 열리는 순간이든
  // keyboard.inset만 바뀌는 순간(안드로이드 다단계 리사이즈)이든 이 이펙트 하나가
  // 커밋당 한 번 reposition()을 부릅니다. 진행 중이던 애니메이션이 있으면
  // reposition() 안에서 cancelPendingScroll() 후 지금(presentation) scrollTop을
  // 새로 읽어 새 목표로 다시 겨냥합니다 — 리스너를 다시 달지 않으므로 그 재조준 외에
  // 다른 부수효과는 없습니다.
  useLayoutEffect(() => {
    if (!keyboard.open) return;
    reposition();
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

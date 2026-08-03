/* 앱 셸 — 원본: frontend/src/App.tsx:450-519의 레이아웃 부분
 * 필요한 CSS: tokens.css, sidebar.css, page.css
 *
 * 데스크톱은 [사이드바 | 작업 영역] 2열 그리드, 모바일은 단일 열 + 오프캔버스 서랍.
 * 상태는 전부 controlled입니다. navHidden/keyboardOpen은 hooks.ts의
 * useScrollDirectionHidden / useVirtualKeyboardOpen을 그대로 넣으면 됩니다.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { useVirtualKeyboard, type VirtualKeyboard } from "./hooks";

/** 포커스된 요소의 아래쪽과 키보드 사이에 남길 여유(px).
 *
 * 8이었던 시절, owner 실기기 트레이스로 이 값이 틀렸다는 게 확정됐다 — 보정이 실제로
 * 걸린 모든 케이스가 정확히 "over=0"(필드 바닥이 보이는 영역 경계에서 8px 위)에서
 * 멈췄는데, 실기기에서는 이게 "닿은 것처럼" 보였다(예: "+931ms rect=566~645 visBot=653
 * over=0"). 반대로 보정이 아예 필요 없었던 케이스는 150px 안팎의 여유가 있었다(예:
 * "rect=424~503 visBot=653 over=-142") — owner가 말하던 "애매한 위치"는 사실 위치의
 * 문제가 아니라, "보정이 실제로 걸리는 모든 자리"가 전부 이 여유 하나로 수렴했다는
 * 뜻이다. 150px까지 키울 근거는 없지만(그 코너까지 갈 필요는 없다), 8은 분명히 틀렸다.
 *
 * 24 = 이 여유가 실제로 메워야 하는 세 몫의 합이다.
 * (1) 포커스 아웃라인 3px(controls.css의 `:focus { outline: 3px solid ... }`) —
 *     테두리 박스 "바깥"으로 번지므로 rect.bottom에 안 잡히는 픽셀이다. 필드 자신의
 *     아래 패딩(controls.css의 `padding: 10px 11px`)은 이미 rect.bottom "안"에
 *     포함돼 있으므로(테두리 박스 자체가 패딩까지 포함) 여기 다시 더하지 않는다 —
 *     캐럿은 이미 그 10px만큼 박스 가장자리에서 떨어져 있다.
 * (2) 반올림 오차 1~2px — 원래 8px 자체가 이 몫 하나만 노리고 정해졌던 값이다(옛
 *     주석: "0이면 이론적으로는 맞지만 반올림 오차로 1px씩 걸치는 걸 막습니다").
 * (3) 안드로이드의 입력 제안/악세서리 바가 visualViewport가 보고하는 경계보다 위에
 *     그려져 이 여유를 갉아먹을 수 있는 몫 — 정확한 높이를 알 방법이 없으므로(기기·
 *     키보드·언어마다 다르다) 정밀하게 상쇄하는 대신 "닿아 보인다"는 실기기 피드백이
 *     다시 나오지 않을 정도의 지각적 여유로 20px을 잡는다.
 * 셋을 더하면 3+1+20=24 — 8의 3배지만 150px 코너와는 자릿수가 다르다.
 *
 * 필드마다 실제 padding/line-height를 getComputedStyle로 읽어 유도하는 방안도
 * 고려했지만 채택하지 않았다: 이 킷의 입력 요소는 전부 같은 padding을 쓰고
 * (controls.css:11, input/select/textarea 공통), 정작 필드마다 다른 몫은 (3)
 * 하나뿐인데 그건 OS 쪽 미지수라 필드 스타일을 다시 읽어도 좁혀지지 않는다 — 그래서
 * 상수 하나로 충분하고, 매번 강제로 레이아웃을 읽는 비용을 들일 이유가 없다.
 *
 * 크기 확인: 보정이 필요 없었던 케이스(rect=424~503, visBot=653 → over =
 * 503-653+24 = -126)는 이 값에서도 여전히 음수다 — 새 여유가 "이미 편했던" 자리까지
 * 건드리지 않는다. */
const KEYBOARD_SCROLL_GAP = 24;

/** --motion-reposition(tokens.css)과 같은 값입니다. 스프링 라이브러리 없이 스크롤
 * 오프셋을 직접 애니메이션할 때도 이 킷의 다른 "재배치" 전환과 같은 리듬을 타야
 * 하므로, 토큰이 바뀌면 이 값도 같이 바꾸세요. */
const KEYBOARD_SCROLL_ANIMATION_MS = 400;

/** 키보드가 닫힌 뒤, 예약 여백(floor)을 실제로 처음 계산하기까지 기다리는 시간(ms).
 * #root는 height:100dvh라(tokens.css), 닫히는 전환 도중 dvh가 잠깐 더 큰 뷰포트를
 * 기준으로 재계산되면서 clientHeight가 실제보다 부풀려 읽히는 프레임이 실기기
 * 트레이스로 확인됐습니다(실측 1192px, 22ms 뒤 928px로 스스로 바로잡음 — 같은 순간
 * visualViewport.height/window.innerHeight는 이미 정상이었습니다). 이 값을 곧장 믿고
 * 예약 여백을 줄이면 그 자체로 #root.scrollHeight가 줄어, 브라우저가 scrollTop을
 * 스스로 clamp합니다(요청한 적 없는 이동 — §16.2 위반, useReleasableKeyboardInset의
 * C1 문서 참고). 그래서 닫히는 렌더는 계산하지 않고 마지막 열림 인셋을 그대로
 * 유지하며, 이 시간만큼 기다려 지오메트리가 안정된 뒤에야 실제 floor를 한 번 잰다.
 * 실측 22ms보다 넉넉한 여유를 둔다 — 사용자가 체감할 만큼 길지도 않다(§12의 다른
 * 모션 지속시간과 무관한 값이라 그 절의 duration을 바꾸는 게 아니다). */
const KEYBOARD_INSET_SETTLE_MS = 120;

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
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  /** resizeObserverRef가 지금 실제로 관찰 중인 대상(없으면 null). observeFocusedElementSize가
   * "대상이 안 바뀌었으면 다시 관찰하지 않는다" 가드에 쓴다 — 아래 disconnect() 실행 지점과
   * 항상 같이 null로 되돌려, 이 ref가 "관찰 상태"를 정확히 반영하게 유지한다. */
  const observedElementRef = useRef<Element | null>(null);

  function cancelPendingScroll() {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }

  /** 지금 포커스된 요소를 계속 지켜보다가, 그 요소 "자신의" 박스가 바뀌면(예:
   * AutoGrowTextarea.tsx:20-28의 onInput이 여러 줄 입력에 반응해 textarea.style.height를
   * 늘릴 때) reposition()을 다시 부릅니다.
   *
   * 왜 필요한가 — A1의 잔여 원인: 재조사 결과 "포커스에서 딱 한 번만 잰다"는 가설은
   * 이미 반증됐습니다(AppShell.test.tsx의 단일 리사이즈 테스트와 안드로이드 다단계
   * 테스트가 둘 다 통과합니다 — 아래 두 이펙트가 keyboard.inset이 바뀔 때마다 이미
   * 다시 측정합니다). 진짜 남는 구멍은 그 반대 방향입니다: 포커스된 요소 자신의
   * 크기가 나중에 바뀌는데, 그 변화가 visualViewport의 resize도 document의 focusin도
   * 아닌 경로(textarea 자신의 onInput)로 일어나면, 지금 이 훅의 두 리스너(focusin,
   * keyboard.inset 변화) 중 어느 쪽도 그걸 들을 수 없습니다 — 키보드는 이미 다 열려
   * 안정된 뒤라 아무 이벤트도 다시 안 옵니다. 특정 이벤트 이름에 거는 대신
   * ResizeObserver로 "지금 포커스된 요소" 자체를 지켜보면, 원인이 AutoGrowTextarea든
   * 다른 어떤 크기 변화든 상관없이 다시 잽니다.
   *
   * reposition()이 끝날 때마다 다시 불리므로(관찰 대상이 바뀌었을 수도, 안 바뀌었을
   * 수도 있음), **대상이 바뀌었을 때만** disconnect 후 다시 observe합니다.
   *
   * **왜 무조건 disconnect+observe하면 안 되는가(Critical, 전체 브랜치 리뷰의 머지
   * 블로커) — 이전 버전의 주석은 "disconnect가 항상 먼저 불리므로 매번 새로 만들어도
   * 동작은 같다"고 가정했는데, 이건 틀렸습니다.** 실제 ResizeObserver는 관찰 대상마다
   * lastReportedSize를 들고 있다가, 그 값과 "다른" 크기가 관측된 대상에만 콜백을 쏩니다.
   * disconnect()는 관찰 목록을 통째로 비우므로, 그 직후의 observe()는 완전히 새
   * ResizeObservation을 만들고 lastReportedSize는 unset 상태로 시작합니다 — unset은
   * "무엇과도 다르다"로 취급되어, 크기가 실제로 전혀 안 바뀐 대상도 다음 프레임에
   * 무조건 한 번 콜백을 받습니다(초기 딜리버리, 스펙 동작이지 버그가 아닙니다). 그 콜백은
   * 이 훅의 콜백(`() => reposition()`)이므로 reposition()이 다시 불리고, reposition()은
   * observeFocusedElementSize()를 다시 부릅니다 — 대상이 안 바뀌었는데도 무조건
   * disconnect+observe하면 또 새 관찰이 만들어지고 또 초기 딜리버리가 예약됩니다. 결과:
   * "새 관찰 → 초기 딜리버리 → reposition() → 새 관찰"이 실제 크기 변화나 사용자 입력과
   * 무관하게, ResizeObserver가 켜져 있고 포커스가 유지되는 한 매 프레임 영원히 반복됩니다.
   * reduced-motion 경로(아래 animateScrollTopBy)는 이 재호출마다 scrollTop에 delta를 즉시
   * 대입하므로, 사용자가 위로 스크롤해도 다음 프레임에 그대로 되돌아가 아예 스크롤을 할 수
   * 없어집니다(§14 위반, 실측: AppShell.test.tsx의 reduced-motion 재점화 테스트). 애니메이션
   * 경로에서도 reposition()이 맨 앞에서 부르는 cancelPendingScroll()이 매 프레임 진행 중이던
   * tween을 끊고 다시 겨냥해, 트윈이 한 프레임도 온전히 진행하지 못하고 목표에 영원히
   * 도달하지 못합니다(실측: 같은 파일의 AutoGrowTextarea 테스트가 이 경로로도 재현합니다).
   *
   * **고침: 지금 관찰 중인 대상을 `observedElementRef`에 기억해 뒀다가, 지금
   * `document.activeElement`가 그 대상과 같으면 이미 그 대상을 계속 관찰 중이므로
   * disconnect+observe를 건너뜁니다.** 이러면 대상이 바뀌지 않는 한 실제 브라우저가 최초
   * 1회 보내는 초기 딜리버리(불가피, 막을 필요도 없음 — 그 한 번으로 reposition()이 다시
   * 불려도 관찰 대상은 안 바뀌었으므로 이 가드가 즉시 멈춥니다) 이후로는 다시 관찰을
   * 만들지 않아 재점화가 일어나지 않습니다. AutoGrowTextarea가 나중에 진짜로 커지는
   * 경우는 여전히 잡습니다 — 관찰이 끊긴 적이 없으므로 실제 크기 변화가 오면 브라우저가
   * 정상적으로 콜백을 쏩니다(관찰을 유지하는 것과 "다시 관찰을 만드는 것"은 다른 일이고,
   * 이 훅에 필요한 건 항상 전자였습니다). 포커스가 다른 요소로 옮겨가면(탭 이동 등)
   * 대상이 실제로 달라지므로 그때는 그대로 disconnect+observe로 전환합니다.
   * `observedElementRef`는 이 함수 밖에서 실제로 disconnect()를 부르는 두 곳(아래
   * reposition()의 가드 실패 분기, 첫 번째 이펙트의 cleanup)에서도 함께 null로 되돌려,
   * "더 이상 아무것도 관찰하지 않는" 상태와 "이 대상을 계속 관찰 중"인 상태가 항상 실제
   * 관찰 상태와 맞아떨어지게 합니다.
   *
   * ResizeObserver가 없는 환경(구형 브라우저, 이 킷의 유일한 실사용처인 jsdom 테스트가
   * 직접 흉내 내지 않는 한)에서는 조용히 건너뜁니다 — visualViewport와 같은 선례로
   * feature-detect만 하고 폴리필을 들이지 않습니다.
   */
  function observeFocusedElementSize() {
    if (typeof ResizeObserver === "undefined") return;
    const focused = document.activeElement;
    if (focused === observedElementRef.current) return;   // 이미 이 대상을 관찰 중 — 재점화 방지, 위 문서 참고.
    if (!resizeObserverRef.current) resizeObserverRef.current = new ResizeObserver(() => reposition());
    resizeObserverRef.current.disconnect();
    observedElementRef.current = focused instanceof Element ? focused : null;
    if (focused instanceof Element) resizeObserverRef.current.observe(focused);
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
    if (!scrollRoot || !viewport || !(focused instanceof HTMLElement) || !scrollRoot.contains(focused)) {
      resizeObserverRef.current?.disconnect();   // 지켜볼 대상이 없다 — 이전 대상을 계속 지켜보지 않는다.
      observedElementRef.current = null;   // 실제로 관찰이 끊겼다 — 나중에 같은 대상이 다시 포커스돼도 새로 관찰해야 한다.
      return;
    }
    observeFocusedElementSize();
    const rect = focused.getBoundingClientRect();
    const visibleBottom = viewport.offsetTop + viewport.height;
    const overshoot = rect.bottom - visibleBottom + KEYBOARD_SCROLL_GAP;
    // AutoGrowTextarea 같은 요소는 내부 스크롤도 max-height도 없이 내용만큼 계속
    // 자란다(AutoGrowTextarea.tsx:20-28) — 그래서 필드 자신의 높이가 보이는 영역보다
    // 커질 수 있다. 그 경우 위/아래 두 경계를 동시에 만족시킬 방법이 물리적으로 없다
    // (필드 하나가 보이는 영역 전체보다 크므로). 아래쪽(캐럿 쪽 — 이 컴포넌트는 항상
    // 아래로 자라므로 지금 타이핑 중인 자리는 늘 아래쪽에 있다)을 우선한다: rect.top이
    // 보이는 영역 위로 밀려나는 대가를 치르더라도, overshoot를 그대로(한도 없이)
    // 적용해 rect.bottom은 항상 GAP만큼 보이는 자리에 둔다.
    //
    // "rect.top이 보이는 영역의 top 아래로는 못 내려가게" 한도를 두는 방안을 먼저
    // 시도했었다 — 그런데 그 한도가 한 번이라도 걸리면(필드가 보이는 영역보다 큰 순간)
    // 그 뒤로는 field가 아무리 더 자라도(=캐럿이 아무리 아래로 내려가도) 한도 자체가
    // 0에 고정돼 다시는 스크롤하지 않는 회귀였다 — 캐럿이 영원히 가려진 채로 남는다
    // (AppShell.test.tsx의 "필드 자신이 보이는 영역보다 크면..." 테스트가 계속 자라는
    // 시나리오로 이 회귀를 잡는다). 짧은 필드(흔한 경우)는 rect.bottom만 기준으로
    // 삼아도 rect.top이 애초에 여유 있게 남아 있으므로 이 트레이드오프가 드러나지
    // 않는다.
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
      resizeObserverRef.current?.disconnect();
      observedElementRef.current = null;   // 여기서도 실제로 관찰이 끊긴다 — 위와 같은 이유.
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

/**
 * 키보드가 닫힐 때 예약해 둔 --keyboard-inset을 즉시 걷어내지 않고, 지금 스크롤
 * 위치가 그 여백에 기대고 있는 동안은 유지합니다. `keyboard.open`이면 `keyboard.inset`을
 * 그대로 돌려주고, 닫히면 "지금 안전하게 걷어낼 수 있는 만큼"만 걷어낸 값을 돌려줍니다.
 *
 * A2의 원인(요약 — 전체는 이전 리포트 참고) — `--keyboard-inset`이 줄면 `#root`의
 * scrollHeight가 그만큼 줄고, 지금 scrollTop이 그 새 최댓값보다 크면 **브라우저가
 * scrollTop을 새 최댓값으로 스스로 clamp**합니다. 고침은 되돌리기가 아니라 **해제를
 * 미루는 것**입니다(§16.2 Agency): 지금 scrollTop이 "여백이 하나도 없을 때의
 * 최댓값"(natural max)을 넘어서는 만큼만 계속 예약해 두고, 사용자가 위로 스크롤해
 * 그 초과분이 줄면 그만큼씩 걷어내다 결국 0으로 수렴합니다. 이 **예약 계약 자체**는
 * 유지합니다 — AppShell.test.tsx의 "맨 아래로 스크롤된 채..."와 "...위로 스크롤해
 * 여백이 더 이상 필요 없어지면..."이 이 계약을 못박아 둡니다.
 *
 * **B1(네 번째 라운드) — 계약이 아니라 계산이 문제였습니다.** 이전 구현은 natural
 * max(scrollHeight - keyboard.inset - clientHeight)를 키보드가 열려 있는 동안
 * `keyboard.inset`이 바뀔 때만 ref에 스냅샷해 뒀습니다. 그런데 natural max를 이루는
 * 세 값 중 `clientHeight`는 `keyboard.inset`과 무관하게 바뀔 수 있습니다 — `#root`는
 * 100dvh라, 스크롤하는 동안 주소창이 접히면(안드로이드 resizes-visual에서도 주소창
 * 자체는 레이아웃 뷰포트를 바꿉니다 — 키보드와는 다른 경로) clientHeight가 커집니다.
 * 그 변화는 `keyboard.inset`을 건드리지 않으므로 스냅샷은 갱신되지 않고, 닫힐 때
 * 그 스테일한(더 작은) natural max로 floor를 계산하면 실제로 필요한 값보다 작게
 * 나와 — 그 차이만큼 브라우저가 진짜로 clamp합니다. "메모가 낮고 뷰가 스크롤된
 * 상태에서 닫으면 살짝 움찔거린다"는 정확히 이 폭(보통 수십 px, 주소창 높이 변화
 * 폭)입니다. 이건 이 스냅샷-후-재사용 패턴의 **네 번째** residue입니다(§ "재도출"
 * 참고 — 리포트).
 *
 * **고침: 스냅샷을 캐시하지 않고, 필요한 시점마다 살아있는 지오메트리에서 매번 새로
 * 계산합니다.** natural max를 이루는 입력(scrollHeight, clientHeight)이 언제
 * 바뀔지 미리 알 수 없으므로(주소창, 콘텐츠 성장 등 keyboard.inset과 무관한 경로가
 * 여럿), "언제 다시 재야 하는지"를 추적하는 대신 "쓸 때마다 지금 값을 읽는다"로
 * 바꾸면 이 클래스의 residue 자체가 원천적으로 사라집니다:
 *
 * 1. **닫히는 순간의 floor**: 렌더 단계에서 `scrollRoot.scrollHeight`를 그 자리에서
 *    읽습니다. 이 렌더는 아직 커밋 전이라 DOM은 직전 커밋(키보드가 열려 있던 마지막
 *    상태)을 그대로 보여주므로, 이 읽기는 항상 "패딩이 아직 열림 인셋만큼 있는" 값을
 *    돌려줍니다(트랜지션 문제도 여기서 비켜갑니다 — css/page.css:55의 트랜지션은
 *    `:not(.keyboard-inset-open)`에만 걸리므로 열려 있던 마지막 커밋에는 아직 없습니다).
 *    거기서 "그 열림 인셋"만 빼면 콘텐츠만의 높이가 나옵니다. `keyboard.inset`
 *    상태값은 이 렌더에서 이미 0으로 바뀌어 있으므로(useVirtualKeyboard가 open과
 *    inset을 같은 커밋에서 함께 0으로 되돌립니다), 그 값 대신 `lastOpenInsetRef` —
 *    열려 있는 동안 렌더 본문에서 매번(`if (keyboard.open) ref.current = keyboard.inset`)
 *    갱신해 둔, 마지막으로 실제 열려 있었을 때의 인셋 — 을 씁니다. 이 갱신은
 *    조건부 대입일 뿐 순수하게 현재 props에서 유도되므로(증가/토글이 아님)
 *    StrictMode가 렌더를 두 번 돌려도 같은 결과이고 멱등합니다.
 * 2. **닫힌 뒤 지연 해제 틱마다**: 캐시된 natural max 대신, 그 순간의
 *    `scrollHeight - 지금 floor - clientHeight`를 매 스크롤 이벤트마다 새로 계산합니다.
 *    지금 적용된 floor가 곧 지금 scrollHeight에 반영된 패딩과 같으므로, 이 뺄셈은
 *    콘텐츠만의 높이를 항상 그 순간 기준으로 돌려줍니다 — 콘텐츠가 그 사이 자라거나
 *    clientHeight가 또 바뀌어도 다음 틱은 그 변화를 자동으로 반영합니다. 캐시가
 *    없으므로 "언제 갱신해야 하는지"를 더 이상 걱정할 필요가 없습니다.
 *
 * `naturalMaxScrollRef`는 완전히 삭제했습니다 — 캐시된 숫자가 하나도 남지 않습니다.
 *
 * clientHeight가 0 이하면(jsdom처럼 레이아웃이 없는 환경, 또는 스크롤 호스트를 아직
 * 못 찾음) natural max를 계산할 근거가 없으므로 이 로직을 통째로 건너뛰고 즉시
 * 0으로 돌아갑니다 — 이전 동작(닫히면 바로 0)과 같습니다. 이 가드 덕분에 이 파일의
 * 다른 기존 테스트들은 지오메트리를 스텁하지 않고도 계속 "닫히면 0px"를 기대할 수
 * 있습니다(AppShell.test.tsx의 "스크롤 지오메트리를 알 수 없으면..." 테스트가 이
 * 가드 자체를 이름으로 박아 둡니다).
 *
 * **닫히는 바로 그 렌더에서 floor를 렌더 "단계"(useLayoutEffect가 아니라)에서
 * 계산해야 합니다.** useLayoutEffect에서 계산하면, keyboard.open이 false로 바뀌는
 * 바로 그 렌더는 releaseFloor의 "이전" 값(대개 0)으로 먼저 커밋되고, 그 뒤에야
 * 레이아웃 이펙트가 옳은 값으로 고칩니다. 그 사이 실제로 DOM에 `--keyboard-inset:
 * 0px`가 한 프레임 적용되면(진짜 레이아웃이 있는 브라우저에서), scrollHeight가 그
 * 프레임에 진짜로 줄어 브라우저가 scrollTop을 clamp합니다 — 이 clamp는 실제
 * 부수효과라 나중에 --keyboard-inset을 다시 올려도 되돌릴 수 없습니다
 * (AppShell.test.tsx가 installClampingScrollRoot로 정확히 이 경로를 재현해
 * 잡아냅니다). 그래서 대신 렌더 함수 본문에서 직접 "방금 닫혔다"를 감지해
 * (wasKeyboardOpenRef로 이전 렌더의 open과 비교) 필요하면 그 자리에서 setState를
 * 부릅니다 — React 공식 패턴("Adjusting state when a prop changes")대로, 렌더
 * 중의 setState는 이번 렌더를 커밋하지 않고 새 상태로 즉시 다시 렌더하므로, DOM은
 * 열림(예: 274px)에서 곧장 보정된 닫힘(274px, 안 바뀜)으로만 커밋되고 위험한
 * 중간값(0px)은 한 번도 실제로 적용되지 않습니다.
 *
 * **C1(owner 실기기 트레이스) — "그 자리에서 산다"(위 항목 1)는 원칙 자체가 또 다른
 * residue를 남겼습니다.** `#root`는 `height: 100dvh`라(tokens.css), 키보드가 닫히는
 * 전환 도중 브라우저가 dvh를 잠깐 더 큰 뷰포트 기준으로 재계산하는 프레임이 실기기
 * 트레이스로 확인됩니다 — `clientHeight`가 실제보다 부풀려 읽히고(실측 1192px),
 * 22ms 뒤 스스로 바로잡힙니다(928px). 같은 순간 `visualViewport.height`(928)와
 * `window.innerHeight`(1059)는 이미 정상이었습니다. 문제는 이 부풀려진 값 자체가
 * "너무 커서 계산이 틀린다"는 게 아닙니다 — naturalMax/candidate 식은 clientHeight가
 * 클수록 오히려 *더 많이* 남기는 방향으로 움직입니다(대수적으로 확인됨). 진짜 문제는
 * 이 식이 `scrollRoot.scrollTop`을 **읽는다는 사실 자체**입니다: clientHeight가
 * 부풀어 있는 바로 그 순간 그 읽기가 일어나면(실제 브라우저는 scrollTop을 항상
 * `scrollHeight - clientHeight` 이하로 유지하므로), 그 읽기가 scrollTop을 그 자리에서
 * 새(부풀려진 clientHeight 기준) 최댓값으로 깎아 버립니다 — 우리 코드가 스크롤을
 * 요청한 적이 전혀 없는데도(reqΔ=0) 뷰포트가 움직입니다(achΔ≠0, owner가 보는 "뚝"
 * 움직임). 이후 이 깎인 scrollTop을 그대로 floor 삼아 굳혀 버리면(다시 안 늘리는
 * 계약과 맞물려) 그 손실은 영원히 남고, 사이클을 반복할수록 예약 여백이 계속
 * 깎여나가 결국 필드가 다시 가려집니다(owner 리포트의 "반복하면 또 움직인다").
 *
 * **고침: "그 자리에서 산다"는 원칙은 유지하되, 닫히는 바로 그 렌더에서는 계산하지
 * 않습니다.** 대신 마지막 열림 인셋(`lastOpenInsetRef.current`)을 그대로 유지합니다
 * — `--keyboard-inset`이 이 렌더에서 전혀 안 바뀌므로(직전 커밋과 같은 숫자)
 * `scrollHeight`도 안 바뀌어, `scrollTop`을 읽어도 clamp가 발생할 수조차 없습니다
 * (물리적으로 여지가 없다 — clientHeight가 아무리 튀어도 애초에 줄어든 게 없으니
 * "너무 작아서 깎이는" 상황 자체가 없습니다). 실제(더 작을 수 있는) floor는
 * `KEYBOARD_INSET_SETTLE_MS`만큼 기다려 지오메트리가 안정된 뒤 아래
 * `useLayoutEffect`가 `recompute()`를 한 번 불러 잽니다 — 스크롤 리스너와 같은 계산을
 * 재사용하므로 로직이 두 곳에 따로 있지 않습니다. **"다시 늘리지 않는다" 계약(§16.2)은
 * 그대로입니다** — 여기서 하는 일은 "언제 처음 계산하느냐"를 늦추는 것이지, 이미
 * 걷어낸 값을 되돌리거나 재예약하는 게 아닙니다(AppShell.test.tsx의 C1 테스트가 두
 * 사이클 모두에서 achΔ=0과 "매번 같은 값으로 안정됨"을 확인합니다).
 *
 * **연속적인 해제(owner: "다이얼로그에 키보드 올라왔다가 내려가면 움직이는 것처럼
 * 그렇게 부드럽게 하고싶어").** 위에서 설명한 recompute()는 `77f28fa`까지는 계산한
 * `next`를 `setReleaseFloor(next)`로 그 자리에서 한 번에 대입했다 — hold(마지막 열림
 * 인셋 유지) 다음에 곧장 계단식으로 뛰는 게, 다이얼로그의 백드롭(`Dialog.tsx`가
 * `useVisualViewportBox()`로 얻은 top/height를 `css/dialog.css`가 `--motion-reposition`
 * (400ms)과 `--sidebar-ease`로 트랜지션하는 것)과 비교됐을 때 owner가 말하는 "뚝뚝
 * 끊기는" 그 지점이었다.
 *
 * **CSS 트랜지션이 아니라 JS 트윈을 골랐다.** 다이얼로그는 `top`/`height`를 CSS
 * `transition`으로 보간한다 — 하지만 이 패딩 해제는 그럴 수 없다: `c1479ce`가 이미
 * 실기기 리뷰로 잡은 버그(Finding 1)가 정확히 "이 트랜지션을 켜면 안 되는 이유"다.
 * `.workspace`의 `padding-bottom`이 트랜지션 중이면, `recompute()`가 읽는
 * `scrollRoot.scrollHeight`(지금 화면에 "그려진" 값)가 `current`(방금 커밋한 "목표"
 * 값)보다 최대 400ms 동안 뒤처져, `naturalMax`를 과대평가하고 `candidate`를 과소평가한다
 * — 사용자가 스크롤을 전혀 안 했는데도 예약된 여백이 저절로 줄어든다(§16.2 위반). 그래서
 * `css/page.css`의 트랜지션은 `.keyboard-inset-holding`(아래, releaseFloor > 0인 동안)이
 * 있는 채로는 절대 걸리지 않는다 — 이 함수가 반환하는 값이 실제로 줄어드는 전체 구간
 * 내내 그 마커가 붙어 있으므로, CSS 트랜지션은 이 해제 도중 단 한 번도 걸리지 않는다.
 * 대신 `animateFloorTo`(아래)가 스크롤 보정(`animateScrollTopBy`, 위)과 똑같은 곡선으로
 * 이 숫자 자체를 여러 rAF 프레임에 걸쳐 옮긴다 — 매 프레임 우리가 직접 정한 값을
 * `--keyboard-inset`에 곧장 반영하므로(React state → 다음 커밋의 인라인 스타일), "지금
 * 그려진 값"과 "지금 목표"가 매 프레임 항상 같다. c1479ce가 막으려던 어긋남(rendered ≠
 * target) 자체가 애초에 생기지 않는다 — CSS 트랜지션이 관여하지 않기 때문이다. 트랜지션
 * 쪽 옵션(가드를 없애고 대신 `recompute()`가 `getComputedStyle`로 "실제 그려진" padding을
 * 읽게 하는 방안)도 검토했지만, 매 스크롤 틱마다 강제 리플로우를 만들고(다이얼로그 스크림
 * 주석이 이미 같은 이유로 피한 비용, `css/dialog.css` 참고) 여전히 트랜지션의 곡선·시간을
 * 우리가 100% 통제할 수 없다는 문제가 남아 기각했다.
 *
 * `displayedFloorRef`는 "지금 실제로 반영된"(=지금 그려진) floor를 항상 미러링한다 —
 * `recompute()`가 매번 최신값을 동기적으로 읽어야 하는데(예전의 함수형 setState
 * 업데이터가 하던 일과 같다), 이제는 그 값이 setState 한 번이 아니라 **진행 중인
 * 애니메이션의 매 프레임**에서 바뀔 수 있어 함수형 업데이터만으로는 "지금 애니메이션이
 * 어디까지 왔는지"를 알 수 없다(업데이터는 리액트가 커밋한 마지막 상태만 보지, 같은
 * 렌더 사이클 안에서 여러 번 진행 중인 rAF 프레임 값을 보지 않는다). 렌더 "본문"에서
 * 이 ref를 직접 쓰지 않는다(호이스트 렌더 단계 보정과 달리 이건 매 프레임 애니메이션
 * 진행 상태라 "현재 props에서 유도되는 순수한 값"이 아니다) — 대신 `releaseFloor`
 * state가 바뀔 때마다 `useLayoutEffect`로 커밋 "후"에 동기화한다. `recompute()`는 항상
 * 이펙트(타이머·스크롤 리스너) 안에서만 호출되므로, 그 시점엔 직전의 모든 커밋이 이미
 * 반영돼 있어 이 ref가 "지금 그려진 값"과 어긋나지 않는다.
 *
 * **해제 애니메이션도 스크롤 보정과 같은 이유로 인터럽터블해야 한다(§3).** 사용자가
 * 애니메이션 도중에 더 스크롤하면(예: 260px 걷어내는 중에 추가로 위로 스크롤), 새
 * `recompute()` 호출은 처음(lastOpenInset)이나 이전 목표가 아니라 **지금 화면에 그려진
 * 값**(`displayedFloorRef.current`)에서 새 목표로 다시 겨냥해야 한다 — `animateFloorTo`가
 * 매번 그 값을 `from`으로 읽는 이유다.
 *
 * **clientHeight가 애니메이션 도중 또 흔들리는 경우(넓어진 위험 구간).** C1이 고친
 * "닫히는 순간의 clientHeight 스파이크"는 KEYBOARD_INSET_SETTLE_MS(120ms) 동안 가라앉는다고
 * 보고, 첫 recompute()(settle 타이머)는 그 뒤에야 지오메트리를 읽는다 — 그 보장은 그대로다.
 * 이 애니메이션이 새로 여는 창구는 그 "이후"다: recompute()가 안정된 지오메트리로 이미
 * 옳은 목표를 정한 뒤, 거기 도달하기까지 최대 400ms 동안 또 다른(무관한) clientHeight
 * 변화가 있으면 어떻게 되는가? 이 함수는 그 400ms 동안 스크롤/타이머 이벤트 없이는
 * 지오메트리를 다시 읽지 않는다 — 매 프레임 그저 이미 정해진 두 값(from, to) 사이를
 * 보간할 뿐이라, 우리 코드 스스로 그 순간의 clientHeight를 다시 조회해 잘못된 결론을
 * 내릴 여지가 없다(AppShell.test.tsx의 "clientHeight가 잠깐 부풀어도..." 테스트). 다만
 * 이건 "우리 코드가 추가로 사고를 치지 않는다"는 증명이지 "물리적으로 항상 안전하다"는
 * 증명은 아니다 — 실제 브라우저는 scrollTop을 scrollHeight-clientHeight 이하로 항상
 * 강제하므로, 그 순간 남은 여유(SLACK - 이미 걷어낸 몫)보다 큰 clientHeight 변화가
 * 겹치면 그 물리적 강제 자체는 JS로 막을 수 없다 — 77f28fa는 이 창구가 1프레임이었고
 * 이 애니메이션은 최대 400ms로 넓힌다는 트레이드오프는 리포트에 남긴다.
 */
function useReleasableKeyboardInset(keyboard: VirtualKeyboard, scrollRootId = "root"): number {
  const lastOpenInsetRef = useRef(0);
  const [releaseFloor, setReleaseFloor] = useState(0);
  const wasKeyboardOpenRef = useRef(keyboard.open);
  /** "지금 실제로 반영된" releaseFloor의 미러 — 위 문서 참고. releaseFloor가 커밋될
   * 때마다(아래 useLayoutEffect) 동기화되므로, recompute()는 이 ref를 읽는 것만으로
   * 진행 중인 애니메이션의 "지금" 값을 항상 정확히 안다. */
  const displayedFloorRef = useRef(0);
  const releaseRafIdRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    displayedFloorRef.current = releaseFloor;
  }, [releaseFloor]);

  function cancelReleaseAnimation() {
    if (releaseRafIdRef.current !== null) {
      cancelAnimationFrame(releaseRafIdRef.current);
      releaseRafIdRef.current = null;
    }
  }

  /** displayedFloorRef.current(지금 그려진 값)에서 target까지, 스크롤 보정과 같은
   * 곡선(repositionEase, KEYBOARD_SCROLL_ANIMATION_MS)으로 여러 rAF 프레임에 걸쳐
   * releaseFloor를 옮긴다. 위 함수 문서 참고. */
  function animateFloorTo(target: number) {
    cancelReleaseAnimation();
    const from = displayedFloorRef.current;
    if (from === target) return;
    if (prefersReducedMotion()) { setReleaseFloor(target); return; }
    let startTime: number | null = null;
    function step(timestamp: number) {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min(1, (timestamp - startTime) / KEYBOARD_SCROLL_ANIMATION_MS);
      setReleaseFloor(Math.round(from + (target - from) * repositionEase(progress)));
      releaseRafIdRef.current = progress < 1 ? requestAnimationFrame(step) : null;
    }
    releaseRafIdRef.current = requestAnimationFrame(step);
  }

  // 열려 있는 동안 렌더 본문에서 매번 갱신한다 — 현재 props에서 유도되는 순수한
  // 조건부 대입이라(증가·토글이 아님) StrictMode의 이중 렌더에서도 멱등하다. 이
  // 값이 "마지막으로 진짜 열려 있었을 때의 인셋"이다 — useVirtualKeyboard가
  // keyboard.open을 false로 되돌리는 바로 그 커밋에서 keyboard.inset도 함께 0으로
  // 되돌리므로, 닫히는 렌더 시점엔 keyboard.inset 자체로는 이 값을 더 이상 알 수 없다.
  if (keyboard.open) lastOpenInsetRef.current = keyboard.inset;

  // 렌더 단계 보정 — 위 문서 참고. "방금 닫혔다"일 때만, 이번 렌더가 커밋되기 전에
  // 곧장 반영한다. C1: 여기서는 계산하지 않고 마지막 열림 인셋을 그대로 유지한다 —
  // clientHeight가 이 순간 신뢰할 수 있다는 보장이 없어(위 문서), 곧장 naturalMax를
  // 계산해 줄이면 그 자체로 scrollHeight를 줄여 버려 clientHeight가 튀는 순간과
  // 겹치면 브라우저가 scrollTop을 스스로 clamp한다. 유지하면 --keyboard-inset이 이
  // 렌더에서 전혀 안 바뀌므로 그 물리적 clamp 자체가 발생할 여지가 없다. 지오메트리를
  // 아예 알 수 없는 경우(clientHeight <= 0, 레이아웃 없는 환경)만 예외 — 그때는 나중에
  // 안정을 기다려도 얻을 게 없으므로 예전처럼 즉시 0으로 돌아간다(AppShell.test.tsx의
  // "스크롤 지오메트리를 알 수 없으면..." 테스트가 이 가드를 이름으로 박아 둔다). 이
  // 단계는 값이 안 바뀌는 "유지"이지 애니메이션 대상이 아니므로 setReleaseFloor를
  // 직접 부른다(animateFloorTo가 아니다) — 어차피 from===target이라 애니메이션 함수를
  // 거쳐도 즉시 반환되지만, 렌더 단계에서 rAF를 새로 예약하지 않는다는 걸 명시적으로
  // 드러낸다.
  let inset = releaseFloor;
  if (wasKeyboardOpenRef.current !== keyboard.open) {
    wasKeyboardOpenRef.current = keyboard.open;
    if (!keyboard.open) {
      const scrollRoot = document.getElementById(scrollRootId);
      inset = scrollRoot && scrollRoot.clientHeight > 0 ? lastOpenInsetRef.current : 0;
      if (inset !== releaseFloor) setReleaseFloor(inset);
    }
  }

  // 닫힌 뒤 floor를 실제로 잰다(recompute) — 두 계기로 부른다:
  // 1. 지연 해제(사용자가 위로 스크롤해 여백이 더 이상 필요 없어지면 그만큼씩 걷어낸다):
  //    매 scroll 이벤트마다. 캐시된 natural max가 아니라 그 순간의 "scrollHeight - 지금
  //    floor - clientHeight"를 다시 계산한다 — 지금 적용된 floor가 곧 지금 scrollHeight에
  //    반영된 패딩과 같으므로, 이 뺄셈은 콘텐츠만의 높이를 항상 그 순간 기준으로
  //    돌려준다(B1: 콘텐츠가 자라거나 clientHeight가 또 바뀌어도 다음 틱이 자동으로
  //    반영한다).
  // 2. C1 — settle 타이머: 위에서 유지만 하고 넘어간 "진짜" floor를 여기서 한 번
  //    계산한다. KEYBOARD_INSET_SETTLE_MS만큼 기다리므로(실측 22ms보다 넉넉한 여유),
  //    이 recompute()가 실제로 도는 시점엔 clientHeight가 이미 스스로 바로잡혀 있다.
  // 두 계기 모두 같은 recompute()를 공유한다 — 계산이 두 곳에 따로 있지 않다. 절대
  // 다시 늘리지 않는다(§16.2: 지연 "해제"이지 재예약이 아니다) — settle 타이머도
  // Math.min(current, candidate)을 그대로 쓰므로 이 계약을 벗어나지 않는다. current는
  // 이제 setState의 함수형 업데이터가 아니라 displayedFloorRef.current(지금 그려진
  // 값)에서 읽는다 — 위 함수 문서의 이유. next로 결정된 목표는 그 자리에서 대입하지
  // 않고 animateFloorTo로 여러 프레임에 걸쳐 도착시킨다(연속적인 해제, 위 문서).
  useLayoutEffect(() => {
    if (keyboard.open) return;
    const scrollRoot = document.getElementById(scrollRootId);
    if (!scrollRoot) return;
    function recompute() {
      const current = displayedFloorRef.current;
      if (current === 0) return;
      if (scrollRoot!.clientHeight <= 0) return;   // 지오메트리를 믿을 수 없다 — 손대지 않는다.
      const naturalMax = scrollRoot!.scrollHeight - current - scrollRoot!.clientHeight;
      const candidate = Math.max(0, Math.round(scrollRoot!.scrollTop - naturalMax));
      const next = Math.min(current, candidate);
      if (next === current) return;
      if (next === 0) scrollRoot!.removeEventListener("scroll", recompute);   // 완전히 풀렸다 — 더 들을 필요 없다.
      animateFloorTo(next);
    }
    scrollRoot.addEventListener("scroll", recompute, { passive: true });
    const settleTimer = window.setTimeout(recompute, KEYBOARD_INSET_SETTLE_MS);
    return () => {
      scrollRoot.removeEventListener("scroll", recompute);
      window.clearTimeout(settleTimer);
      cancelReleaseAnimation();
    };
  }, [keyboard.open, scrollRootId]);

  return keyboard.open ? keyboard.inset : inset;
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
  const releaseInProgress = !keyboard.open && keyboardInset > 0;
  const className = ["app-shell", collapsed && "sidebar-collapsed", navHidden && "mobile-nav-hidden", keyboardOpen && "mobile-keyboard-open", keyboard.open && "keyboard-inset-open", releaseInProgress && "keyboard-inset-holding"].filter(Boolean).join(" ");
  // .workspace(page.css)가 이 변수를 기존 하단 패딩에 더합니다. 키보드가 닫히면
  // (지금 스크롤 위치가 허락하는 만큼) 0으로 돌아가 레이아웃도 원래 폭으로 돌아갑니다.
  const style = { "--keyboard-inset": `${keyboardInset}px` } as CSSProperties;
  return <div className={className} style={style}>
    {mobileOpen && onMobileClose && <button type="button" className="mobile-sidebar-overlay" aria-label={overlayLabel} onClick={onMobileClose} />}
    {sidebar}
    <main className="workspace">{children}</main>
    {quickBar}
    {pageTabs}
  </div>;
}

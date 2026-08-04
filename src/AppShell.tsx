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

/** 소비 앱이 "지금 포커스된 필드 하나"가 아니라 그 필드를 포함한 블록 전체(예:
 * 메모 입력 + 그 아래 취소/삭제/저장 버튼 줄)를 가상 키보드 위로 들어올리고 싶을 때
 * 이 블록의 컨테이너에 붙이는 명시적 opt-in 마커입니다. `portal`(Select.tsx)·`floatRef`/
 * `quickBarRef`(MobilePageTabs)·`pinToBottom`(Sidebar)과 같은 계열의 결정입니다 — 이
 * 킷은 소비 앱이 준 markup에서 "이 그룹이 어디서 끝나는가"를 스스로 추론하지 않고,
 * 항상 소비 앱이 직접 표시한 경계만 믿습니다. 추론이 기각된 이유: 어떤 조상 `<div>`가
 * "필드의 액션까지 포함한 그룹의 끝"인지는 클래스 이름도 DOM 깊이도 안정적으로 말해
 * 주지 않습니다(`.button-row`가 그룹 "안"에 있을 수도, 다음 그룹의 시작일 수도
 * 있습니다) — 이 킷이 소유하지 않은 markup의 구조를 짐작하면 소비 앱이 리팩터링할
 * 때마다 조용히 깨지는 코드가 됩니다.
 *
 * `data-*`인 이유: 이 마커가 붙는 요소는 AppShell이 렌더하는 컴포넌트가 아니라
 * `children`으로 들어오는 소비 앱의 평범한 `<div>`입니다 — React prop으로 전달할
 * 통로 자체가 없고(그 컴포넌트를 이 킷이 만들지 않았으므로), DOM에서 직접 읽어야
 * 합니다. 값이 아니라 **존재 자체**가 스위치입니다(다른 예: DateWheelPicker.tsx:338의
 * `data-fields`는 값을 읽지만, 이건 `hasAttribute`만 봅니다 — 그래서
 * `data-keyboard-keep-visible="false"`도 켜진 것으로 취급됩니다. HTML의 boolean
 * 속성 관례(`disabled=""`도 `disabled="false"`도 똑같이 켜짐)와 같은 모양이라
 * README에 이 점을 명시합니다).
 */
const KEYBOARD_KEEP_VISIBLE_ATTR = "data-keyboard-keep-visible";

/** focused에서 시작해(자기 자신은 검사하지 않습니다 — 마커는 "필드 자신"이 아니라
 * "필드를 포함한 더 큰 블록"을 가리키는 용도라, 필드 자신에 붙이는 건 의미가 없습니다)
 * scrollRoot(포함) 안쪽만 거슬러 올라가며 `KEYBOARD_KEEP_VISIBLE_ATTR`이 붙은 가장
 * 가까운 조상을 찾습니다.
 *
 * **scrollRoot 경계 안으로 제한하는 이유(과제가 명시적으로 물은 지점).** 이 훅이
 * 스크롤하는 건 오직 `scrollRoot.scrollTop`뿐입니다 — scrollRoot 밖의 조상에 마커가
 * 있어도 그 요소는 이 스크롤로 전혀 움직이지 않으므로 애초에 기준으로 쓸 수 없습니다
 * (`Dialog.tsx`처럼 `document.body`에 포털된 자리가 대표적 예 — reposition()이 이미
 * `scrollRoot.contains(focused)`로 그런 포커스 자체를 걸러내는 것과 같은 전제를
 * 마커 탐색에도 그대로 씌우는 것뿐입니다). `while (node && scrollRoot.contains(node))`로
 * 순회를 제한하면 이 보장은 "추가 검사"가 아니라 **구조적으로 자동입니다** —
 * focused가 scrollRoot 안에 있는 한(reposition()의 앞선 가드가 이미 확인) focused와
 * scrollRoot 사이의 모든 조상은 정의상 scrollRoot 안에 있으므로, 이 순회는 scrollRoot
 * 자신을 마지막으로 검사한 뒤(scrollRoot 자신에 마커가 있는 경우까지 허용) scrollRoot의
 * 부모에서 멈춥니다. 그래도 이 경계를 명시적으로 코드에 남기는 이유는 방어적
 * 프로그래밍입니다 — scrollRoot를 앞으로 다른 방식(예: ref)으로 얻게 되어 "항상 DOM
 * 조상"이라는 가정이 깨지더라도 이 함수 자신의 계약은 그대로 유지됩니다.
 */
function findKeyboardKeepVisibleAncestor(focused: HTMLElement, scrollRoot: HTMLElement): HTMLElement | null {
  let node = focused.parentElement;
  while (node && scrollRoot.contains(node)) {
    if (node.hasAttribute(KEYBOARD_KEEP_VISIBLE_ATTR)) return node;
    node = node.parentElement;
  }
  return null;
}

/** --motion-reposition(tokens.css)과 같은 값입니다. 스프링 라이브러리 없이 스크롤
 * 오프셋을 직접 애니메이션할 때도 이 킷의 다른 "재배치" 전환과 같은 리듬을 타야
 * 하므로, 토큰이 바뀌면 이 값도 같이 바꾸세요. */
const KEYBOARD_SCROLL_ANIMATION_MS = 400;

/** 키보드가 올라오는 동안 비주얼 뷰포트가 조용해지기를 기다리는 시간(ms). 이 시간
 * 안에 다음 변화가 오면 다시 처음부터 셉니다 — 그래서 실제 발화는 "마지막 변화로부터
 * 이만큼 지난 뒤" 한 번뿐입니다. 자세한 근거는 이 값을 쓰는 이펙트의 주석에. */
const KEYBOARD_VIEWPORT_SETTLE_MS = 80;

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
 * 옮깁니다. 소비 앱이 조상 요소에 `KEYBOARD_KEEP_VISIBLE_ATTR`
 * (`data-keyboard-keep-visible`)을 붙이면, 필드 자신이 아니라 그 조상의 아래쪽까지
 * 함께 들어올립니다(예: 필드 + 그 아래 액션 버튼 줄) — 자세한 이유·한도는 그 상수
 * 문서와 `reposition()` 안 주석을 참고하세요.
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
 * `scrollIntoView`가 "보이는지"를 판단하는 기준은 실제 키보드 높이와 무관하므로
 * 우연히 맞아떨어지는 경우만 동작하고 대부분은 몇 px만 움직이거나 전혀 안 움직입니다
 * (실측: 아래 훅 사용처의 라이브 검증 참고). 그래서 `visualViewport`로 직접 가려진
 * 영역을 계산해 `scrollTop`을 더합니다 — `Select.tsx:41-44`가 메뉴 자신을 스크롤할 때
 * `scrollIntoView` 대신 직접 `scrollTop` 산수를 쓰는 것과 같은 이유이자 같은 방식
 * 입니다(그 파일의 `scrollSelectedOptionIntoView`가 선례). 부수 이득: jsdom은
 * `scrollIntoView`를 구현하지 않으므로(`tests/Select.test.tsx:228` 참고) 이 방식이라야
 * 단위 테스트가 성립합니다.
 *
 * **owner 실기기 트레이스 — 이중 보정(over-scroll).** 위 문단은 "왜 이 훅이
 * `scrollIntoView`를 안 쓰는가"를 설명하지만, 그렇다고 브라우저가 `scrollIntoView`를
 * 안 쓰는 건 아닙니다 — 포커스가 걸리면 브라우저 자신도 독립적으로 "포커스된 요소를
 * 보이게 스크롤"하는 네이티브 동작을 실행합니다. `#root`는 한때(이 훅이 생기기
 * 전부터) `scroll-padding-bottom: 40dvh`를 갖고 있었고(tokens.css), 그 네이티브
 * 스크롤이 "보이는지" 판단하는 기준이 바로 그 패딩이었습니다. 실기기 트레이스 한 번:
 * `+198ms kb resize rect=877~956 visBot=668 over=312`(이 훅이 요청한 delta, reqΔ=312,
 * st=616 기준) → `+648ms ... reqΔ=312 want=928 stNow=1196 achΔ=580`. 이 훅은 312만
 * 요청했는데 실제로는 580(268 초과)만큼 움직였습니다. 268은 우연이 아닙니다 — 그
 * 순간 `visualViewport.height`는 668이었고 40%는 267.2입니다. 이 훅의 스크롤과
 * 브라우저의 네이티브 스크롤이 **같은 포커스 이벤트에 대해 각자 계산해서 각자
 * 옮기니** 둘이 더해집니다. 맨 아래에서는 둘 다 같은 최댓값으로 clamp돼 우연히
 * 겹쳐 보였을 뿐입니다(owner가 "맨 아래에서는 괜찮다"고 한 그 지점).
 *
 * **고침: `scroll-padding-bottom`을 `#root`에서 완전히 뗐습니다(`tokens.css`).**
 * 줄여서 이 훅의 `KEYBOARD_SCROLL_GAP`(24)과 맞추는 방안도 검토했지만 기각했습니다
 * — 두 계산이 값만 비슷해질 뿐 여전히 "따로 계산해서 따로 옮기는" 두 주체이므로,
 * 정확히 같은 순간에 정확히 같은 프레임 기준으로 계산하지 않는 한(할 수 없습니다
 * — 하나는 브라우저 내부, 하나는 이 훅) 어떤 0이 아닌 값을 둬도 어긋난 나머지가
 * 그대로 더해질 수 있습니다. 요구되는 불변식은 "더 작게"가 아니라 "정확히 요청한
 * 만큼"(achΔ==reqΔ)이므로, 두 번째 주체가 소비하는 신호 자체를 없애는 것만이 이
 * 불변식을 보장합니다. 네이티브 스크롤을 "억제"하는 대안(패딩은 남기고 이 훅이
 * 사후에 그 초과분을 되돌리는 방안)도 검토했지만, 트레이스가 보여주듯 브라우저의
 * 스크롤은 이 훅의 애니메이션이 이미 끝난 뒤(수백ms 뒤)에도 올 수 있어 "언제까지
 * 기다렸다 되돌릴지"를 알 방법이 없고, 그 시간 창을 추측으로 정하면 그 뒤엔
 * 사용자가 진짜로 스크롤한 것과 구별할 수 없어(§16.2 Agency) 사용자의 스크롤을
 * 도로 빼앗는 회귀를 만들 위험이 있습니다 — 추측이 아니라 계측(이 트레이스)이
 * 이미 가리키는 고침만 택했습니다.
 *
 * **키보드와 무관한 포커스(Tab 이동, 소비 앱의 프로그램적 `.focus()`, 해시 앵커
 * 이동)에 미치는 영향.** 이 킷은 `scrollIntoView()`를 어디서도 부르지 않으므로
 * (위, `Select.tsx`도 마찬가지), `scroll-padding-bottom`을 실제로 소비하던 건
 * 오직 브라우저 자신의 "포커스된/목표 요소가 안 보이면 스크롤한다"는 내장 동작
 * 뿐이었습니다. 그 내장 동작 자체는 이 패딩이 있든 없든 계속 일어납니다(스펙상
 * 패딩은 그 동작을 켜고 끄는 스위치가 아니라 "얼마나 여유를 두고 세우는가"만
 * 조절합니다 — 이 부분은 이 저장소에서 실측한 사실이 아니라 스펙에서 추론한
 * 것입니다, 아래 "실기기만 확인할 수 있는 것" 참고). 그래서 이 패딩을 떼도 Tab으로
 * 이동한 포커스나 다이얼로그 밖에서 호출되는 `.focus()`가 화면 밖에 있으면 여전히
 * 스크롤되어 보이게 됩니다 — 다만 40% 뷰포트 높이만큼 여유 있게 서는 대신 보이는
 * 영역 가장자리에 딱 붙어 섭니다. 이 여유를 요구하는 테스트나 `PRINCIPLES.md`
 * 조항은(§6, §9 모두 확인) 없었습니다 — git 히스토리로 확인한 바, 이 값은 이 킷이
 * 자체 키보드 보정을 갖추기 전부터 budget 앱 베이스라인에 주석·커밋 메시지 설명
 * 하나 없이 있던 값이었습니다(이게 "이 훅이 생기기 전의 암묵적 시도였다"는 결론의
 * 근거이자 한계입니다 — 원래 의도를 직접 기록한 문서는 어디에도 없어 이건 정황
 * 추론입니다). 그러니 이건 회귀이지만, 문서화되지 않은 여유가 줄어드는 것이지
 * 뭔가 가려지는 게 아닙니다 — 키보드가 열렸을 때 실기기에서 확인된 이중 보정
 * 버그 쪽이 훨씬 크고(268px) 확정적입니다(계측 vs 추론의 무게 차이).
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
    const visibleBottom = viewport.offsetTop + viewport.height;
    const focusedRect = focused.getBoundingClientRect();
    const focusedOvershoot = focusedRect.bottom - visibleBottom + KEYBOARD_SCROLL_GAP;
    // AutoGrowTextarea 같은 요소는 내부 스크롤도 max-height도 없이 내용만큼 계속
    // 자란다(AutoGrowTextarea.tsx:20-28) — 그래서 필드 자신의 높이가 보이는 영역보다
    // 커질 수 있다. 그 경우 위/아래 두 경계를 동시에 만족시킬 방법이 물리적으로 없다
    // (필드 하나가 보이는 영역 전체보다 크므로). 아래쪽(캐럿 쪽 — 이 컴포넌트는 항상
    // 아래로 자라므로 지금 타이핑 중인 자리는 늘 아래쪽에 있다)을 우선한다: rect.top이
    // 보이는 영역 위로 밀려나는 대가를 치르더라도, focusedOvershoot를 그대로(한도
    // 없이) 적용해 rect.bottom은 항상 GAP만큼 보이는 자리에 둔다.
    //
    // "rect.top이 보이는 영역의 top 아래로는 못 내려가게" 한도를 두는 방안을 먼저
    // 시도했었다 — 그런데 그 한도가 한 번이라도 걸리면(필드가 보이는 영역보다 큰 순간)
    // 그 뒤로는 field가 아무리 더 자라도(=캐럿이 아무리 아래로 내려가도) 한도 자체가
    // 0에 고정돼 다시는 스크롤하지 않는 회귀였다 — 캐럿이 영원히 가려진 채로 남는다
    // (AppShell.test.tsx의 "필드 자신이 보이는 영역보다 크면..." 테스트가 계속 자라는
    // 시나리오로 이 회귀를 잡는다). 짧은 필드(흔한 경우)는 rect.bottom만 기준으로
    // 삼아도 rect.top이 애초에 여유 있게 남아 있으므로 이 트레이드오프가 드러나지
    // 않는다. **이 값(focusedOvershoot)은 마커가 있든 없든 최종 요청량의 바닥(floor)
    // 이다** — 마킹이 "포커스된 필드 자신의 최소 요구량보다 덜 스크롤하게" 만들 수는
    // 없다(아래 참고). 마커가 없으면(오늘까지의 유일한 경로) 최종 요청량은 그냥 이
    // 값 그대로다.
    let overshoot = focusedOvershoot;

    // data-keyboard-keep-visible로 표시된 조상이 있으면 그 컨테이너의 아래쪽(예:
    // 필드 아래 취소/삭제/저장 버튼 줄)까지 같이 들어올린다 — KEYBOARD_KEEP_VISIBLE_ATTR
    // 문서(위) 참고. 없으면 이 블록 전체를 건너뛰어 overshoot는 focusedOvershoot 그대로다.
    const keepVisibleAncestor = findKeyboardKeepVisibleAncestor(focused, scrollRoot);
    if (keepVisibleAncestor) {
      const containerRect = keepVisibleAncestor.getBoundingClientRect();
      const containerOvershoot = containerRect.bottom - visibleBottom + KEYBOARD_SCROLL_GAP;
      // 한도(ceiling) — 과제가 명시한 요구사항: 마킹된 블록이 키보드 위 공간보다 크면,
      // 포커스된 필드 "자신의" 위쪽이 보이는 영역 밖으로 밀려나서는 안 된다(타이핑
      // 중인 자리를 아예 못 보는 게 버튼 하나 가려지는 것보다 나쁘다). focusedRect.top을
      // 이 이상 끌어올리면(overshoot를 이 이상 주면) 그 위쪽이 viewport.offsetTop
      // 위로 넘어간다 — 그래서 컨테이너를 위해 "추가로" 요청할 수 있는 몫은 여기까지다.
      const ceiling = Math.max(0, focusedRect.top - viewport.offsetTop);
      // **floor(focusedOvershoot)와 max를 취하는 이유 — 리뷰에서 드러난 사실: 마킹이
      // 상황을 오히려 악화시킬 수 있다.** ceiling으로 자른 컨테이너 몫
      // (min(containerOvershoot, ceiling))을 그대로 최종값으로 쓰면, 필드 자신이 이미
      // 보이는 영역보다 커서 focusedOvershoot가 ceiling보다 큰 경우(AutoGrowTextarea가
      // 자라 이 블록 안에 들어있는 경우가 정확히 이 모양이다) 컨테이너 몫이 필드
      // 자신의 최소 요구량보다 작은 값으로 그 필드를 도로 가둬 버린다 — "마킹 안
      // 했으면 130만큼 스크롤해서 필드 바닥이 보였을 텐데, 마킹했더니 30만 스크롤해서
      // 필드 바닥이 오히려 안 보이게" 되는 회귀다(AppShell.test.tsx의 "마킹이 포커스된
      // 필드 자신의 요구량보다 덜 스크롤하지 않는다" 테스트가 이 경로를 잡는다). 그래서
      // 컨테이너를 위해 정한 값과 focusedOvershoot 중 **더 큰 쪽**을 최종으로 쓴다 —
      // "마킹은 스크롤을 늘릴 수만 있지, 마킹 없이도 보장되던 최소 요구량 아래로 줄일
      // 수는 없다"는 불변식이다. 이 불변식 덕분에 위 AutoGrowTextarea 테스트도 이
      // 블록으로 감싸는 것만으로는 절대 깨지지 않는다.
      overshoot = Math.max(focusedOvershoot, Math.min(containerOvershoot, ceiling));
    }
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
    // **focusin도 같은 창구를 지납니다.** 키보드가 이미 올라와 있는 채로 다른 필드를
    // 탭하면(메모 → 숫자 필드) 안드로이드는 키보드 높이를 바꾸며 다시 팬합니다. 이
    // 리스너가 곧장 reposition()을 부르면 팬 전 지오메트리로 재게 되어, 아래 이펙트에서
    // 없앤 이중 보정이 이 문으로 그대로 살아남습니다 — 닫을 때 되돌리지 않으므로 그
    // 초과분도 영구히 남습니다. 여기를 빼놓으면 아래 주석의 "한 번만 잰다"가 거짓이 됩니다.
    //
    // 처음에는 이걸 넣었다가 §3 인터럽터빌리티 테스트가 깨져서 되돌렸습니다. 다시 보니
    // 깨진 건 계약이 아니라 그 테스트의 **정확한 산술**이었습니다: 재조준이 80ms 늦어지는
    // 동안 진행 중이던 애니메이션이 조금 더 가므로 목표가 `interruptFrom + 130`에서
    // 벗어납니다. §3가 금지하는 "맨 처음 값에서 다시 시작"은 그대로 안 일어나고, 그
    // 테스트의 프레임별 단조 검사도 그대로 통과합니다. 그래서 테스트를 타이밍이 아니라
    // 계약을 단언하도록 바꾸고 이 경로를 살렸습니다.
    let focusSettleTimer = 0;
    function repositionAfterViewportSettles() {
      window.clearTimeout(focusSettleTimer);
      focusSettleTimer = window.setTimeout(reposition, KEYBOARD_VIEWPORT_SETTLE_MS);
    }
    document.addEventListener("focusin", repositionAfterViewportSettles);
    return () => {
      document.removeEventListener("focusin", repositionAfterViewportSettles);
      window.clearTimeout(focusSettleTimer);
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
  // **뷰포트가 멈춘 뒤에 잽니다.** owner 실기기 트레이스 2026-08-04: 안드로이드는 키보드가
  // 올라올 때 레이아웃을 줄이는 대신 비주얼 뷰포트를 팬합니다(vpTop 0→329). 팬은 그
  // 자체로 필드를 드러내는데, 예전에는 이 이펙트가 팬이 시작되기도 전의 지오메트리로
  // over를 재고 곧장 스크롤을 시작해 둘이 겹쳤습니다. 같은 캡처 안에 대조군이 있습니다:
  //   팬이 있던 사이클  over=121에서 출발 → 브라우저가 329 팬 → 최종 over=-243 (목표 0)
  //   팬이 없던 사이클  over=62에서 출발  → 킷이 62 스크롤   → 최종 over=0   (정확)
  // 닫을 때 되돌리지 않는 계약(§9) 때문에 그 초과분은 영구히 남아, 열고 닫을 때마다
  // 페이지가 조금씩 위로 밀렸습니다(st 877→912→936→998에서 수렴).
  //
  // 공식은 이미 팬을 반영합니다(visibleBottom = offsetTop + height) — 틀린 건 **시점**
  // 뿐이었습니다. 그래서 매 팬 단계마다 재지 않고, 뷰포트가 조용해진 뒤 한 번만 잽니다.
  // 팬이 도는 동안 사용자는 브라우저가 필드를 드러내는 걸 이미 보고 있으므로 지연으로
  // 느껴지지 않습니다(owner가 실기기에서 두 동작을 나란히 비교해 이쪽을 골랐습니다).
  // 팬이 없는 기기는 리사이즈가 곧 끝나므로 사실상 예전과 같은 시점입니다.
  useLayoutEffect(() => {
    if (!keyboard.open) return;
    // 트레이스의 팬 단계 간격은 5~25ms, 팬 전체는 ~210ms입니다 — 그 간격은 넘고 팬 종료는
    // 놓치지 않는 값. 매 단계가 이 타이머를 다시 걸어(cleanup) 마지막 단계에서만 발화합니다.
    const settleTimer = window.setTimeout(reposition, KEYBOARD_VIEWPORT_SETTLE_MS);
    return () => window.clearTimeout(settleTimer);
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
  /** 키보드가 열려 있는 동안 마지막으로 관측한 스크롤 호스트의 clientHeight — 아래
   * C2의 핀이 "이 값보다 큰 높이는 절대 붙들지 않는다"는 상한으로 씁니다. 자세한
   * 이유는 그 주석에. */
  const lastOpenClientHeightRef = useRef(0);

  useLayoutEffect(() => {
    if (!keyboard.open) return;
    const scrollRoot = document.getElementById(scrollRootId);
    if (scrollRoot && scrollRoot.clientHeight > 0) lastOpenClientHeightRef.current = scrollRoot.clientHeight;
    // keyboard.inset도 의존성에 넣습니다 — 안드로이드는 키보드를 여러 단계로 올리고,
    // 그 사이 주소창이 접히며 clientHeight가 바뀔 수 있어 열림 순간 한 번만 재면 낡습니다.
  }, [keyboard.open, keyboard.inset, scrollRootId]);

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

    // **C2(owner 실기기 트레이스 2026-08-04) — 인셋을 붙드는 것만으로는 부족합니다.**
    // C1(위)은 "--keyboard-inset이 안 바뀌면 scrollHeight도 안 바뀌니 clamp가 생길
    // 여지가 없다"고 봤습니다. 그 전제가 반쪽이었습니다: 브라우저가 강제하는 상한은
    // `scrollHeight - clientHeight`라, **scrollHeight를 고정해도 clientHeight가 부풀면
    // 상한은 그대로 줄어듭니다.** 트레이스가 네 사이클 전부 ±1px로 확정했습니다 —
    // 닫히는 한 프레임에 clientHeight가 1192로 읽히고(실제 1060/928) scrollTop이
    // 정확히 `scrollHeight - 1192`로 깎입니다(사이클4는 이미 그 아래라 안 움직임 —
    // 음성 대조군). 우리가 스크롤을 요청한 적은 없으므로 §16.2 위반입니다.
    //
    // 그리고 C1의 "마지막 열림 인셋을 유지한다"는 이 기기에서 **유지할 게 없습니다**:
    // 안드로이드는 리사이즈가 아니라 비주얼 뷰포트를 팬하므로(트레이스 vpTop 0→407)
    // covered가 키보드가 올라와 있는 동안 이미 0으로 빠지고, lastOpenInsetRef도 0입니다.
    //
    // **고침: 거짓말하는 값 자체를 그 창구 동안 붙듭니다.** 부풀림의 크기(1192)를
    // 예측할 필요가 없다는 게 이 방식의 요점입니다 — 지금 clientHeight는 아직 옳으므로
    // (트레이스: 닫히는 렌더 +3ms에 1060, 부풀림은 +32ms) 그 값을 인라인 height로 못
    // 박으면 `100dvh`(tokens.css:134)가 재계산돼도 레이아웃이 흔들리지 않습니다.
    // 지금 scrollTop은 지금 clientHeight 기준으로 이미 합법이므로, 그 값을 그대로
    // 고정하는 것은 정의상 새 clamp를 만들 수 없습니다.
    //
    // 푸는 시점은 아래 settle 타이머(120ms)입니다. 풀면 clientHeight가 진짜 값(928)으로
    // 내려가는데, 그건 상한을 **늘리는** 방향이라 그 자체로는 clamp가 날 수 없습니다.
    // 실측 자기교정이 22ms이므로 120ms는 넉넉합니다(77f28fa가 같은 이유로 고른 값).
    // **부푼 값을 붙들지 않도록 known-good과 min을 취합니다.** owner 기기에서는 순서가
    // 유리했습니다 — 닫히는 렌더(+3ms)에는 아직 1060으로 옳았고 부풀림은 +32ms였습니다.
    // 그 순서는 보장되지 않습니다: 이 이펙트가 도는 순간 이미 부풀어 있었다면 그 값을
    // 그대로 못 박아 창구 내내(120ms) 손상을 유지하게 됩니다. 열려 있는 동안 관측한
    // clientHeight를 상한으로 두면 그 경로가 막힙니다. min은 언제나 안전한 방향입니다 —
    // 더 작은 높이는 상한(scrollHeight - clientHeight)을 **키우므로** 그 자체로는 clamp를
    // 만들 수 없습니다. (AppShell.test.tsx의 C1 테스트가 정확히 이 순서, 즉 부풀림이 닫힘보다
    // 먼저 오는 경우를 재현합니다.)
    // **키보드가 한 번도 열린 적 없으면 붙들지 않습니다.** 이 이펙트는 `!keyboard.open`이면
    // 도는데, 거기엔 첫 마운트도 포함됩니다 — 그때는 막을 닫힘 자체가 없습니다. 게다가
    // `#root`의 `height: 100dvh`는 `css/tokens.css:115`의 모바일 미디어 쿼리 **안**이라,
    // 데스크톱의 `#root`에는 높이 규칙이 아예 없습니다. 거기에 인라인 height를 쓰면
    // "부풀림을 막는" 게 아니라 **없던 제약을 새로 만드는** 일이 됩니다. 그래서 열려 있던
    // 적이 있을 때(=knownGood이 잡혔을 때)만 붙듭니다.
    const knownGoodHeight = lastOpenClientHeightRef.current;
    const observedHeight = scrollRoot.clientHeight;
    const pinnedHeight = knownGoodHeight > 0 ? Math.min(observedHeight, knownGoodHeight) : 0;
    let heightPinned = pinnedHeight > 0;
    if (heightPinned) scrollRoot.style.height = `${pinnedHeight}px`;
    function unpinHeight() {
      heightPinned = false;
      scrollRoot!.style.height = "";
    }

    function recompute() {
      // **붙들려 있는 동안에는 재지 않습니다.** 이 함수는 scrollHeight와 clientHeight로
      // naturalMax를 구하는데, clientHeight가 우리가 못 박은 값이면 그건 브라우저의 실제
      // 지오메트리가 아닙니다. 붙든 값이 실제보다 **작을** 때(닫은 직후 사용자가 스크롤해
      // 주소창이 접히면 실제 dvh가 커집니다 — 그리고 그 스크롤이 바로 이 함수를 부릅니다)
      // naturalMax를 과대평가해 안전선보다 많이 걷어내고, 그 결과 scrollHeight가 줄어
      // 브라우저가 scrollTop을 clamp합니다. 바로 이 고침이 없애려던 그 이동입니다.
      // settle 타이머가 unpinHeight() 다음에 이 함수를 부르므로 측정 자체는 안 밀립니다.
      if (heightPinned) return;
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
    // 푼 "다음에" 잰다 — recompute()는 지오메트리가 안정된 진짜 clientHeight를 봐야 하고,
    // 붙들어 둔 값으로 재면 naturalMax를 실제보다 작게 봐 필요 이상으로 남깁니다.
    const settleTimer = window.setTimeout(() => { unpinHeight(); recompute(); }, KEYBOARD_INSET_SETTLE_MS);
    return () => {
      scrollRoot.removeEventListener("scroll", recompute);
      window.clearTimeout(settleTimer);
      unpinHeight();   // 창구가 끝나기 전에 다시 열리거나 언마운트돼도 인라인 height를 남기지 않는다.
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

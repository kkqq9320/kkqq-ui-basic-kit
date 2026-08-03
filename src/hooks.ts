/* 공용 훅 — 원본: frontend/src/lib/hooks.ts:29-50, frontend/src/App.tsx:319-379 */
import { useContext, createContext, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * 겹친 깊이. 팝업이 자기 안에 열릴 것들에게 자기 깊이를 알려 줍니다.
 * Dialog가 Provider를 두고, 그 안의 드롭다운·달력·다이얼로그는 한 겹 더 깊어집니다.
 */
export const PopupDepthContext = createContext(0);

/* 지금 열려 있는 것들. 깊은 쪽이 임자입니다. */
const escapeStack: { id: object; depth: number }[] = [];

/**
 * Escape로 닫되, **겹쳐 있으면 가장 안쪽만** 반응합니다.
 *
 * 각자 document에 리스너를 달면 한 번의 Escape로 열린 게 전부 닫힙니다. 다이얼로그
 * 안에서 드롭다운을 닫으려다 저장하지 않은 편집까지 잃습니다. 리스너는 등록 순서대로
 * 불리므로 안쪽에서 stopImmediatePropagation을 해도 이미 늦습니다 — 이벤트 전파로는
 * 풀 수 없습니다.
 *
 * 등록 순서로도 안 됩니다. React는 자식 effect를 부모보다 **먼저** 실행하므로
 * 나중에 등록되는 쪽은 안쪽이 아니라 바깥쪽입니다. 그래서 순서가 아니라 깊이로
 * 임자를 정합니다.
 */
export function useEscapeToClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const depth = useContext(PopupDepthContext) + 1;
  useEffect(() => {
    if (!open) return;
    const entry = { id: {}, depth };
    escapeStack.push(entry);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // 가장 깊은 것이 임자. 같은 깊이면 나중에 열린 쪽(>=).
      let top = entry;
      for (const other of escapeStack) if (other.depth >= top.depth) top = other;
      if (top !== entry) return;
      closeRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const at = escapeStack.indexOf(entry);
      if (at >= 0) escapeStack.splice(at, 1);
    };
  }, [open, depth]);
}


/** 킷 팝업이 하나라도 열려 있는 동안 앱의 원래 scrollRestoration을 담아 둡니다. null이면
 * 킷이 아직 아무것도 바꾸지 않은 상태(팝업이 없거나, 환경이 이 속성을 지원하지 않음). */
let savedScrollRestoration: ScrollRestoration | null = null;

function scrollRestorationSupported(): boolean {
  return "scrollRestoration" in window.history;
}

/** 표식이 스택에 처음 push될 때만 실제로 바꿉니다. 이미 잡고 있으면 아무것도 안 합니다(멱등). */
function claimScrollRestoration() {
  if (savedScrollRestoration !== null || !scrollRestorationSupported()) return;
  savedScrollRestoration = window.history.scrollRestoration;
  window.history.scrollRestoration = "manual";
}

/** 표식 스택이 완전히 빌 때만 부릅니다. 잡고 있지 않으면 아무것도 안 합니다(멱등). 반드시
 * 되돌릴 대상 항목이 실제로 current가 된 "뒤"에만 불러야 합니다 — 실제 브라우저 검증으로
 * 확인된 이유는 아래 useBackToClose 문서의 B1 항목을 보세요. */
function releaseScrollRestoration() {
  if (savedScrollRestoration === null) return;
  if (scrollRestorationSupported()) window.history.scrollRestoration = savedScrollRestoration;
  savedScrollRestoration = null;
}

/** 마지막 표식이 back()으로 지워지는 걸 기다리는 popstate 리스너. 한 번에 하나만
 * 존재합니다(모듈 스코프) — 대기 중인 게 있으면 새로 걸기 전에 먼저 걷어냅니다. B2와
 * 같은 종류의 경쟁(back() 호출과 popstate 도착 사이의 진짜 시간차 동안 다른 팝업이
 * 열리는 것) 때문에 존재합니다. 자세한 이유는 아래 useBackToClose 문서의 B1 항목. */
let pendingReleaseOnDrain: ((event: PopStateEvent) => void) | null = null;

function cancelPendingReleaseOnDrain() {
  if (!pendingReleaseOnDrain) return;
  window.removeEventListener("popstate", pendingReleaseOnDrain);
  pendingReleaseOnDrain = null;
}

/** back()이 스택을 실제로 비울 "때까지" 기다렸다가만 되돌립니다. { once: true }로 무조건
 * 한 번 반응하면 안 됩니다 — back()과 popstate 사이에 다른 팝업이 열려 표식이 다시
 * 쌓이면, 그 popstate는 아직 스택이 안 빈 상태로 옵니다. 그때 무조건 되돌리면 그 팝업이
 * 열려 있는 동안 scrollRestoration이 auto로 풀려 버립니다(원래 스크롤 점프 버그가
 * 되살아남). readStack은 호출한 쪽(stackKey를 아는 useBackToClose 인스턴스)이 넘겨줍니다. */
function scheduleReleaseOnDrain(readStack: (state: unknown) => string[]) {
  cancelPendingReleaseOnDrain();
  const listener = (event: PopStateEvent) => {
    if (readStack(event.state).length !== 0) return;   // 아직 다른 팝업이 남아 있다 — 계속 기다린다
    window.removeEventListener("popstate", listener);
    pendingReleaseOnDrain = null;
    releaseScrollRestoration();
  };
  pendingReleaseOnDrain = listener;
  window.addEventListener("popstate", listener);
}

/** back()을 불렀지만 아직 popstate로 착지하지 않은 횟수(B3, 아래 useBackToClose 문서
 * 참고). 동시 정리(같은 커밋에서 겹친 팝업 두 개가 함께 닫히는 경우) 때, 정리
 * 타이머들이 각자 window.history.state를 읽어 "내가 맨 위인가"를 판단하는데, 먼저
 * back()을 부른 쪽의 내비게이션이 아직 착지하지 않아(진짜 비동기) 뒤이어 도는
 * 타이머는 여전히 옛 상태를 봅니다. 이 카운터로 "곧 사라질 예정인 맨 위 N개"를 셈에
 * 넣어, 아직 착지 전이라도 그 바로 아래 있던 자기 표식이 사실은 "다음 차례"임을 알 수
 * 있게 합니다. */
let unlandedBackCount = 0;
let unlandedBackListenerInstalled = false;

/** window.history.back()을 부르면서 위 카운터를 관리합니다. popstate가 올 때마다
 * 하나씩 돌려받습니다 — 그 popstate가 이 함수가 부른 것이든 사용자의 물리적
 * 뒤로가기든(실제 내비게이션은 어느 쪽이든 한 칸이므로 구분할 필요가 없습니다),
 * 이미 0이면 그냥 무시합니다. 음수로 새지 않게 하는 이 가드는 방어적인 의미도
 * 있습니다: 테스트가 어떤 back()의 popstate를 끝까지 흘려보내지 않고 끝나도(드물게
 * 있음 — 예: back()을 스텁만 하고 디스패치는 안 하는 테스트), 카운트가 다음 테스트로
 * 새어 나가 엉뚱한 판정을 만들 위험을 최소화합니다. */
function callBackTracked() {
  unlandedBackCount++;
  if (!unlandedBackListenerInstalled) {
    unlandedBackListenerInstalled = true;
    window.addEventListener("popstate", () => {
      if (unlandedBackCount > 0) unlandedBackCount--;
    });
  }
  window.history.back();
}

/**
 * 뒤로가기로 팝업을 닫습니다. 열릴 때 history에 표식을 push 해 두고, popstate에서
 * 그 표식이 사라졌으면 닫습니다. 그래서 뒤로가기가 뒤 페이지로 가는 대신 팝업만
 * 닫습니다. 사용자가 직접 닫았을 때는 정리 단계에서 표식을 걷어내 뒤로가기 횟수가
 * 밀리지 않게 합니다. 여러 겹 쌓아도 되도록 스택으로 관리합니다.
 *
 * 모바일 참고: 키보드가 열려 있으면 첫 뒤로가기는 OS가 키보드를 닫는 데 씁니다
 * (브라우저에 popstate가 오지 않습니다). 팝업은 그다음 뒤로가기에 닫힙니다.
 *
 * useEffect가 아니라 useLayoutEffect인 이유 (크롬에서 뒤로가기가 페이지를 나가던 버그):
 * 크롬은 **사용자 제스처 없이 추가된 history 항목**에 "뒤로가기에서 건너뛰기"
 * 표시를 답니다(history manipulation intervention). useEffect는 페인트 이후 별도
 * 태스크에서 돌기 때문에, 팝업을 연 클릭의 처리 태스크가 이미 끝난 뒤에 push되어
 * 그 표시가 붙었습니다. 그러면 뒤로가기가 우리 항목을 건너뛰고 이전 페이지로
 * 나가버립니다. 증상이 헷갈렸던 이유는 크롬이 **사용자가 아무 데나 다시 클릭하면
 * 그 표시를 해제**하기 때문입니다 — 그래서 "포커스를 뺀 뒤엔 잘 닫힌다"였습니다.
 * useLayoutEffect는 클릭 이벤트와 같은 태스크 안에서 커밋되므로 제스처 안에서
 * push됩니다. 이 훅에서 useEffect로 되돌리지 마세요.
 *
 * StrictMode: 개발 모드에서 effect는 mount → cleanup → mount로 두 번 돕니다.
 * 정리 단계의 history.back()을 즉시 부르면, 다시 mount된 뒤에 popstate가 도착해
 * 팝업이 열리자마자 닫혀 버립니다. 그래서 back()을 타이머로 미루고, 곧바로 다시
 * mount되면 그 타이머를 취소합니다. 표식이 이미 스택에 있으면 다시 push 하지도
 * 않으므로 history가 중복으로 쌓이지 않습니다.
 *
 * 타이머가 실행될 때 자기 표식이 여전히 스택 맨 위인지 다시 확인합니다(B2). 미룬
 * 한 틱 사이 다른 팝업이 열려 위에 쌓일 수 있고, 그때 무조건 back()을 부르면 남의
 * 표식을 뽑아버려 그 팝업이 열리자마자 닫힙니다(모바일에서 트리거를 연타할 때
 * 특히 잘 보임 — mousedown/click이 거의 동시에 합성됩니다). 맨 위가 아니면
 * back()을 건너뜁니다 — 트레이드오프: 묻힌 표식은 뽑을 방법이 없으므로 실제
 * history 항목이 하나 죽은 채 남고, 나중에 뒤로가기 한 번이 아무것도 안 닫고
 * 소비됩니다. 그래도 엉뚱한 팝업을 닫는 것보다는 낫습니다. 표식 자체는 지금
 * 스택 상태에서 걷어내 두어, 이 팝업이 나중에 다시 열릴 때 "이미 표식이 있다"고
 * 착각해 push를 건너뛰지 않게 합니다.
 *
 * B1 — history.scrollRestoration: 실제 back()을 부르는 대가로, 브라우저 기본값
 * "auto"는 우리가 push한 항목에서 벗어날 때 그 직전 지점(팝업을 열기 전)의
 * window.scrollY를 되돌립니다. 데스크톱처럼 document 자체가 스크롤되는 레이아웃에서는
 * 사용자가 팝업을 연 채로 스크롤한 게 통째로 날아가 버립니다(모바일은 #root가 스크롤
 * 호스트라 문서 scrollY가 0에 머물러 증상이 없습니다). 그렇다고 킷이 이 값을 영구히
 * "manual"로 바꿔 버리면 안 됩니다 — scrollRestoration은 앱이 소유한 전역이라, 소비
 * 앱의 진짜 페이지 이동에서도 브라우저 스크롤 복원이 꺼져 버립니다. 그래서 첫 표식이
 * push될 때만 앱의 기존 값을 기억해 두고 "manual"로 바꾸고, 표식 스택이 완전히 빌 때만
 * 그 값으로 되돌립니다 — 킷의 팝업이 하나라도 열려 있는 동안만 manual입니다.
 *
 * 되돌리는 시점이 실제 브라우저에서는 훨씬 더 까다롭습니다(실 기기 검증으로 잡은 회귀,
 * 보고서의 "Fix: scrollRestoration never released" 참고). `history.scrollRestoration`은
 * 전역 스위치가 아니라 **지금 current인 항목에 새겨지는 값**입니다 — 그래서 이 항목이
 * current인 동안에만 읽고 쓸 수 있고, 쓴 값은 그 항목이 나중에 다시 current가 될 때까지
 * 그 항목에 그대로 남습니다. `claimScrollRestoration()`을 `pushState` 직전에 부르는 건
 * 그래서입니다 — 그 순간 아직 current인 이전 항목(예: 원래 페이지)에 "manual"을 새겨
 * 두는 겁니다. 문제는 되돌릴 때: 이 훅이 직접 `back()`을 부르는 경우, `back()`을 부르기
 * **직전**(아직 지금 항목이 current인 시점)에 되돌리면 가야 할 이전 항목이 아니라 지금
 * 떠나려는 이 항목에 값이 찍히고, 정작 이전 항목은 claim 때 새겨진 "manual"인 채로
 * 영원히 남습니다(스택은 0으로 비었는데 `scrollRestoration`은 "manual"에 멈춰 있는
 * 증상으로 관측됩니다). `back()`이 실제로 이전 항목을 current로 만든 뒤에만 되돌려야
 * 하고, 그 완료 신호는 `popstate`뿐입니다. 그래서 스택이 비는 두 경로 모두 되돌리는
 * 지점이 "popstate 핸들러 안"이라는 하나의 규칙으로 통일됩니다: (1) 이 훅이 직접
 * back()을 부르는 경우 — 스택 길이가 1(자기 자신만 남음)일 때만 `scheduleReleaseOnDrain`으로
 * popstate 리스너를 걸어 둡니다. (2) 사용자가 물리적 뒤로가기를 눌러 popstate가 오는
 * 경우 — handlePopState에서 그 이벤트의 state가 이미 빈 스택인지 확인해서, 역시
 * popstate 핸들러 "안에서" 되돌립니다.
 *
 * (1)의 리스너는 **`{ once: true }`로 무조건 한 번 반응하면 안 됩니다** — 리뷰로 잡은
 * 두 번째 회귀입니다. `back()`은 비동기라 호출과 popstate 도착 사이에 진짜 시간차가
 * 있고(B2와 같은 종류의 경쟁 — near-simultaneous 팝업 전환은 터치에서는 흔한 경우지
 * 예외가 아닙니다), 그 사이 다른 팝업이 열려 표식을 다시 쌓을 수 있습니다. 그러면 이
 * back()이 마침내 착지했을 때 오는 popstate는 아직 스택이 안 빈 채로 옵니다 — 그때
 * 무조건 되돌리면 방금 열린 팝업이 떠 있는 동안 scrollRestoration이 풀려 스크롤 점프
 * 버그가 되살아납니다. `scheduleReleaseOnDrain`은 popstate가 올 때마다
 * `readStack(event.state).length === 0`을 다시 확인해, 진짜 0이 될 때까지 리스너를
 * 유지합니다(handlePopState의 재확인과 대칭). 대기 중인 리스너는 모듈 스코프에 하나만
 * 두고(`pendingReleaseOnDrain`), 새로 걸기 전에 이전 것을 먼저 걷어냅니다 — 컴포넌트가
 * popstate 도착 전에 언마운트돼도(더 이상 자기 effect cleanup을 부를 기회가 없어도)
 * 다음 "마지막 팝업이 닫히는" 사이클이 알아서 정리하고, 그때까지는 그냥 계속 기다릴
 * 뿐이라 잘못된 시점에 풀리는 일은 없습니다. 묻힌 표식을 replaceState로 걷어내는
 * 경로(위 주석)는 popstate를 아예 쏘지 않고 스택을 절대 비우지도 않으므로(위에 뭔가
 * 남아 있을 때만 타는 경로) 이 리스너와 아무 상호작용이 없습니다. history.scrollRestoration이
 * 없는 환경(구형·비표준)도 있으므로 항상 존재를 확인한 뒤에만 손댑니다.
 *
 * B3 — 동시 정리(전체 브랜치 리뷰 마지막 Important finding): 같은 커밋에서 겹친 팝업
 * 두 개가 함께 닫히면(예: Select의 `choose()`가 `onChange`로 감싸는 Dialog까지 같이
 * 닫는 경우) "맨 위인지 재확인" 로직(위 B2)이 무너집니다. React는 자식 effect의
 * cleanup을 부모보다 먼저 돌립니다(실측: nested `<Dialog><Select/></Dialog>`에서
 * 안쪽 Select의 정리 타이머가 항상 먼저 돕니다) — 그래서 안쪽(S)의 타이머가 먼저 돌아
 * 자기가 맨 위임을 확인하고 `back()`을 부르지만, 그 `back()`은 비동기라 아직
 * 착지하지 않습니다. 곧이어 바깥(D)의 타이머가 돌 때 `window.history.state`는 여전히
 * 옛 값([D, S])이라, D는 자기가 S 밑에 묻힌 것으로 착각해 진짜 `back()` 대신 "묻힌
 * 표식" replaceState 경로(아래)를 탑니다 — 그런데 그 경로는 **지금 current인 항목**
 * (S가 곧 벗어날 그 항목)만 고치므로, D가 실제로 push했던 항목은 손대지 못한 채 [D]
 * 표식을 영원히 남깁니다. 결과가 두 가지입니다: (1) 두 팝업을 닫았는데 `back()`은
 * 한 번만 불려 실제 history 항목이 하나 안 팝힌 채 남고, 다음 물리적 뒤로가기가
 * 아무것도 못 닫고 소비됩니다 — 사용자가 버튼/선택으로 닫았는데 표식이 안 걷힌
 * 셈이라 §10과 어긋납니다. (2) 그 항목에는 이제 마운트된 팝업 없이 표식만 남고, 이
 * 표식이 있는 한 두 release 경로(위 handlePopState, scheduleReleaseOnDrain)가 절대
 * `length === 0`을 보지 못해 `savedScrollRestoration`이 "manual"에 멈춥니다 — 사용자가
 * 그 항목에 머무는 동안 scrollRestoration 보호 전체가 조용히 죽습니다(영구는 아닙니다
 * — 나중에 진짜 빈 항목에 닿으면 풀립니다. 위 문단 참고).
 *
 * 고친 방법: `unlandedBackCount`(모듈 스코프, `scheduleReleaseOnDrain` 바로 아래) —
 * "`back()`을 불렀지만 아직 popstate로 착지하지 않은 횟수"를 세어, "맨 위인지" 판정을
 * 그 아직 안 착지한 만큼 미리 걷어낸 **effective 스택**에 대고 합니다. S가 `back()`을
 * 부르며 카운트를 1 올리면, 뒤이어 도는 D의 타이머는 `current`([D, S])에서 그 1개를
 * 미리 빼([D]) 자기가 사실은 다음 차례임을 정확히 봅니다 — 그래서 D도 (묻힌 게
 * 아니라) 진짜 `back()`을 부릅니다. 두 `back()` 모두 실제로 착지하면 두 항목 모두
 * 정상적으로 소비되고, `scheduleReleaseOnDrain`을 부르는 조건에서 낡은
 * `current.length === 1` 게이트도 없앴습니다 — effective 스택 계산이 이미 "이 `back()`
 * 까지 합쳐 스택이 빌 것인가"를 정확히 알려주므로, 원래 게이트가 놓치던(자기 걸로
 * 스택이 비지만 아직 남의 pending back()이 하나 더 있는) 경우까지 커버합니다. 여러 번
 * 스케줄해도 `cancelPendingReleaseOnDrain`이 매번 이전 것을 대체하므로 안전합니다
 * (같은 `length === 0` 조건을 기다리는 리스너가 항상 최대 하나만 있습니다).
 *
 * `current`(raw, 착지 여부와 무관)는 묻힌 표식 replaceState 경로에 그대로 남겨
 * 둡니다 — 그 경로가 실제로 손대는 건 지금 current인 항목이지, 아직 안 착지한
 * back()들이 언젠가 도착할 미래의 항목이 아니기 때문입니다.
 *
 * 대안(고려했으나 채택 안 함) — "정리 요청을 큐에 넣고 popstate가 올 때마다 하나씩
 * 소비": 이론적으로 더 일반적입니다(부모가 자식보다 먼저 정리되는 순서도 다룰 수
 * 있음). 하지만 실측(임시 프로브 테스트로 확인)으로 그 순서는 이 킷의 nested
 * Dialog>Select 형태에서 재현되지 않습니다 — React는 같은 커밋 안에서 자식 effect의
 * cleanup을 항상 부모보다 먼저 돌리므로, 안쪽이 항상 먼저 돕니다. 부모(바깥 팝업)가
 * 자식보다 먼저 정리되는 순서는 애초에 부모-자식 포함 관계가 아니라 **형제** 팝업이
 * 겹친 경우에만 일어나는데, 그건 87b58b5가 이미 다루는 "진짜 묻힌 표식"(자기보다
 * 늦게 열린, 자기와 무관한 남이 아직 열려 있는 채로 자기만 닫히는 경우)과 같은
 * 모양이라 이 카운터로 고칠 대상이 아닙니다 — 그 경우 묻힌 표식을 뽑을 방법이 없다는
 * 트레이드오프(죽은 history 항목 하나, 나중에 뒤로가기 한 번이 허공에 소비됨)는
 * 여전히 유효하고 의도된 동작입니다. 큐 방식은 이 코드베이스에 실제로 존재하지 않는
 * 문제(정리 순서 자체를 통제)를 풀려고 새 타이밍(추가 매크로태스크 한 틱)을 들여오는
 * 대가로, 실측으로 확인된 진짜 버그(concurrent nested teardown)는 카운터보다 더 잘
 * 고치지 못합니다 — 그래서 카운터를 골랐습니다.
 */
export function useBackToClose(open: boolean, onClose: () => void, stackKey = "__dsPopupStack") {
  const closeRef = useRef(onClose);
  const popupIdRef = useRef(`ds-popup-${Date.now()}-${Math.random()}`);
  const pendingBackRef = useRef<number | null>(null);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    if (!open) return;
    if (pendingBackRef.current !== null) {
      // StrictMode의 즉시 재마운트. 예약해 둔 back()을 취소하면 표식이 그대로 남습니다.
      window.clearTimeout(pendingBackRef.current);
      pendingBackRef.current = null;
    }
    const popupId = popupIdRef.current;
    function readStack(state: unknown): string[] {
      const stack = (state as Record<string, unknown> | null)?.[stackKey];
      return Array.isArray(stack) ? (stack as string[]) : [];
    }
    if (!readStack(window.history.state).includes(popupId)) {
      claimScrollRestoration();
      window.history.pushState({ ...window.history.state, [stackKey]: [...readStack(window.history.state), popupId] }, "");
      // 새 표식이 쌓이면 unlandedBackCount(B3)를 잊는다. 그 카운트는 "지금 스택의
      // 맨 위 N개가 곧 사라질 예정"이라는 뜻인데, push는 그 위에 전혀 새로운(그
      // 카운트와 무관한) 내용을 얹는다 — 아직 착지 안 한 back()은 착지 "그 순간"의
      // 맨 위를 뽑을 뿐(B2 문서 참고, 착지 시점 기준으로 목적지를 다시 계산), push
      // 이후로는 더 이상 정적으로 셀 수 없다. 그래서 push 이후의 판정은(이미
      // 그랬듯) B2의 "실행 시점에 다시 읽기"에 맡기고, 여기서는 그냥 0으로
      // 되돌린다 — 결과가 부정확한 미래 예측보다는 옛 코드와 동일한(이미 검증된)
      // 재확인 동작이 더 안전하다.
      unlandedBackCount = 0;
    }
    function handlePopState(event: PopStateEvent) {
      if (!readStack(event.state).includes(popupId)) closeRef.current();
      if (readStack(event.state).length === 0) releaseScrollRestoration();
    }
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (!readStack(window.history.state).includes(popupId)) return;
      pendingBackRef.current = window.setTimeout(() => {
        pendingBackRef.current = null;
        // 예약된 사이 다른 팝업이 열려 자기 표식 위에 쌓였을 수 있다(B2). 그때 back()을
        // 부르면 스택 맨 위, 즉 남의 표식을 뽑아버려 그 팝업이 열리자마자 닫힌다. 그러니
        // 지금 다시 스택을 읽어 자기 표식이 여전히 맨 위일 때만 back()을 부른다.
        //
        // "맨 위"는 raw current가 아니라 effective 스택으로 판정한다(B3). 같은 커밋에서
        // 겹친 팝업이 함께 닫히면(예: Select의 choose()가 onChange로 감싸는 Dialog까지
        // 닫는 경우) 안쪽이 먼저 back()을 부르고 아직 착지하지 않은 채로 바깥의 타이머가
        // 돈다 — 그때 raw current는 여전히 옛 값([바깥, 안쪽])이라 바깥은 자기가 안쪽
        // 밑에 묻힌 것으로 착각한다. unlandedBackCount(아직 착지 안 한 back() 수)만큼
        // current 끝에서 미리 걷어내면, 아직 착지 전이라도 바로 아래 있던 자기 표식이
        // 사실은 다음 차례임을 정확히 본다. 카운트가(테스트가 popstate를 끝까지 흘려보내지
        // 않고 끝나는 등으로) current.length보다 커도 clamp해 effective가 음수 길이로
        // 새지 않게 한다.
        const current = readStack(window.history.state);
        const unlanded = Math.min(unlandedBackCount, current.length);
        const effective = unlanded > 0 ? current.slice(0, current.length - unlanded) : current;
        if (effective[effective.length - 1] === popupId) {
          // 여기서 곧바로 releaseScrollRestoration()을 부르면 안 된다 — 실제 브라우저에서
          // 확인된 버그였다: 이 시점엔 아직 "지금 떠나려는" 이 항목이 current이므로, 값을
          // 쓰면 그 항목에 찍히고 만다. 정작 되돌아갈 이전 항목(예: 원래 페이지)은
          // claimScrollRestoration() 때 이미 "manual"로 얼어붙은 채였고, back()이 실제로
          // 그 항목에 착지한 뒤에도 여전히 manual로 남는다. popstate는 그 항목이 진짜
          // current가 된 뒤에만 오므로, 되돌리는 일은 그 popstate 핸들러 안에서 해야 한다.
          //
          // { once: true }로 무조건 한 번 반응하면 또 안 된다 — back()은 비동기라 호출과
          // popstate 도착 사이에 진짜 시간차가 있고, 그 사이 다른 팝업이 열려 표식을 다시
          // 쌓을 수 있다(B2와 같은 종류의 경쟁). 그러면 이 back()이 마침내 착지했을 때 오는
          // popstate는 아직 스택이 비지 않은 채로 온다. 그때 무조건 되돌리면 방금 열린
          // 팝업이 떠 있는 동안 scrollRestoration이 풀려 원래 스크롤 점프 버그가
          // 되살아난다. scheduleReleaseOnDrain은 popstate가 올 때마다 실제 스택 길이를
          // 다시 확인해, 진짜 0이 될 때까지 계속 기다린다.
          //
          // 매번(옛 current.length === 1 게이트 없이) 스케줄한다(B3) — effective 스택이
          // 이미 "이 back()까지 합쳐 스택이 빌 것인가"를 정확히 알려주므로, 옛 게이트가
          // 놓치던 "자기 걸로는 비지만 남의 pending back()이 하나 더 있어야 진짜 빈다"는
          // 경우까지 커버해야 한다. cancelPendingReleaseOnDrain이 매번 이전 리스너를
          // 대체하므로 중복 스케줄은 안전하다.
          scheduleReleaseOnDrain(readStack);
          callBackTracked();
          return;
        }
        // 묻혔다 — back()으로는 못 뽑는다(뽑으면 남의 것이 뽑힌다). 그래서 실제 history
        // 항목은 하나 죽은 채 남는다(나중에 뒤로가기 한 번이 허공에 소비된다 — §10과의
        // 긴장, 보고서 참고). 대신 표식은 지금 스택 상태에서 걷어내, 나중에 이 팝업이
        // 다시 열릴 때 "이미 표식이 있다"고 착각해 push를 건너뛰지 않게 한다.
        //
        // 여기서는 raw current를 그대로 쓴다(effective가 아니다) — 이 replaceState가
        // 실제로 고치는 대상은 "지금 current인 항목"이지, 아직 안 착지한 back()들이
        // 언젠가 도착할 미래의 항목이 아니다.
        if (!current.includes(popupId)) return;
        window.history.replaceState({ ...window.history.state, [stackKey]: current.filter((id) => id !== popupId) }, "");
      }, 0);
    };
  }, [open, stackKey]);
}

/**
 * 아래로 18px 이상 연속 스크롤하면 true. 위로 스크롤하거나 맨 위에 닿으면 false.
 * AppShell의 navHidden에 그대로 넣으면 하단 고정 바가 스크롤에 따라 숨습니다.
 * 방향이 바뀔 때마다 누적 거리를 초기화하므로 미세한 흔들림에는 반응하지 않습니다.
 */
export function useScrollDirectionHidden(scrollRootId = "root") {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const scrollRoot = document.getElementById(scrollRootId);
    if (!scrollRoot) return;
    let previousTop = scrollRoot.scrollTop;
    let direction = 0;
    let distance = 0;
    function handleScroll() {
      const currentTop = scrollRoot!.scrollTop;
      const delta = currentTop - previousTop;
      previousTop = currentTop;
      if (currentTop <= 18) {
        direction = 0;
        distance = 0;
        setHidden(false);
        return;
      }
      if (Math.abs(delta) < 1) return;
      const nextDirection = delta > 0 ? 1 : -1;
      if (nextDirection !== direction) {
        direction = nextDirection;
        distance = 0;
      }
      distance += Math.abs(delta);
      if (distance < 18) return;
      setHidden(direction > 0);
      distance = 0;
    }
    scrollRoot.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollRoot.removeEventListener("scroll", handleScroll);
  }, [scrollRootId]);
  return [hidden, setHidden] as const;
}

export type VisualViewportBox = { top: number; left: number; width: number; height: number };

function readVisualViewportBox(): VisualViewportBox | null {
  const viewport = window.visualViewport;
  if (!viewport) return null;
  return {
    top: Math.round(viewport.offsetTop),
    left: Math.round(viewport.offsetLeft),
    width: Math.round(viewport.width),
    height: Math.round(viewport.height),
  };
}

/**
 * 지금 실제로 보이는 영역의 좌표와 크기. `position: fixed` 요소를 여기에 맞추면
 * 가상 키보드·주소창·핀치줌과 무관하게 항상 보이는 영역 안에 놓입니다.
 *
 * 이게 "키보드가 열렸나?"를 추측하는 것보다 튼튼합니다. 안정 높이 대비 축소량으로
 * 판정하면 주소창이 접히고 펴지는 높이(휴대폰에서 100~140px)가 키보드 임계값과
 * 비슷해 오판합니다. 보이는 영역에 그냥 맞추면 판정이 아예 필요 없습니다.
 *
 * visualViewport가 없는 환경에서는 null을 돌려주고, 그때는 CSS 기본값
 * (레이아웃 뷰포트 전체)이 그대로 쓰입니다.
 *
 * **초기값은 `useState`의 지연 초기화 함수로 렌더 중에 동기적으로 계산합니다.**
 * 예전에는 `useState(null)`로 시작해 `useEffect`(페인트 "이후"에야 도는 패시브
 * 이펙트)에서만 값을 채웠습니다. 키보드가 이미 열려 있는 상태에서 다이얼로그가
 * 새로 마운트되면(예: 필드에 포커스가 있는 채로 다른 버튼을 눌러 다이얼로그를 여는
 * 경우), 그 사이 한 프레임은 `box === null`이라 인라인 스타일이 아예 없는 채로
 * 페인트되어 백드롭이 전체 화면 크기(CSS 기본값)로 한 번 그려졌다가, 그다음 프레임에
 * 실제(줄어든) 크기로 바뀌었습니다 — 다이얼로그의 첫 열림이 "두 번에 걸쳐" 그려지는
 * 결함(§3 Interruptibility 위반: 논리적 목표가 아니라 항상 지금 값에서 시작해야 하는데,
 * 여기서는 "지금 값"조차 첫 프레임에 없었습니다) 중 하나였습니다. 지연 초기화는
 * 커밋(그리고 첫 페인트) 전, 렌더 단계에서 동기적으로 실행되므로 첫 프레임부터 이미
 * 올바른 값을 반환합니다 — 두 번째 렌더도, 그 사이 프레임도 필요 없습니다.
 * (`useEffect`는 여전히 필요합니다 — 마운트 이후의 리사이즈·스크롤을 계속 반영해야
 * 하니까요. 최초 1회 계산만 렌더 단계로 당겨온 것입니다.)
 */
export function useVisualViewportBox(): VisualViewportBox | null {
  const [box, setBox] = useState<VisualViewportBox | null>(readVisualViewportBox);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    function update() {
      const next = readVisualViewportBox();
      setBox((current) => (current && next && current.top === next.top && current.left === next.left && current.width === next.width && current.height === next.height ? current : next));
    }
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return box;
}

export type VirtualKeyboard = {
  open: boolean;
  /** 키보드가 가린 아래쪽 높이(px). fixed 요소가 그만큼 위로 피하면 됩니다. */
  inset: number;
};

/**
 * 가상 키보드가 열렸는지와, 화면 아래쪽을 얼마나 가렸는지를 알려줍니다.
 *
 * 편집 가능한 요소에 포커스가 있고 visualViewport 높이가 안정 상태보다 120px 넘게
 * 줄었을 때만 열린 것으로 봅니다. 높이 변화만 보면 주소창 축소를 키보드로 오인하고,
 * 포커스만 보면 프로그램 포커스(키보드 안 뜸)까지 열린 것으로 칩니다.
 *
 * inset은 레이아웃 뷰포트 기준입니다. 안드로이드 기본값(`resizes-visual`)에서는
 * 키보드가 레이아웃 뷰포트를 줄이지 않으므로 `position: fixed` 요소는 키보드 뒤까지
 * 뻗습니다. 그 차이가 곧 inset이라, 이만큼 아래 패딩을 주면 키보드 바로 위에 붙습니다.
 */
export function useVirtualKeyboard(): VirtualKeyboard {
  const [keyboard, setKeyboard] = useState<VirtualKeyboard>({ open: false, inset: 0 });
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let restingHeight = Math.max(viewport.height, window.innerHeight);
    const editableSelector = "input, textarea, select, [contenteditable='true']";
    function apply(next: VirtualKeyboard) {
      setKeyboard((current) => (current.open === next.open && current.inset === next.inset ? current : next));
    }
    function updateKeyboardState() {
      const focused = document.activeElement instanceof Element && document.activeElement.matches(editableSelector);
      if (!focused) {
        restingHeight = Math.max(restingHeight, viewport!.height, window.innerHeight);
        apply({ open: false, inset: 0 });
        return;
      }
      const open = restingHeight - viewport!.height > 120;
      const covered = window.innerHeight - (viewport!.offsetTop + viewport!.height);
      apply({ open, inset: open ? Math.max(0, Math.round(covered)) : 0 });
    }
    function updateAfterFocus() {
      window.setTimeout(updateKeyboardState, 0);
    }
    viewport.addEventListener("resize", updateKeyboardState);
    // 뷰포트가 스크롤되면 offsetTop이 바뀌므로 inset도 다시 재야 합니다.
    viewport.addEventListener("scroll", updateKeyboardState);
    window.addEventListener("resize", updateKeyboardState);
    document.addEventListener("focusin", updateAfterFocus);
    document.addEventListener("focusout", updateAfterFocus);
    return () => {
      viewport.removeEventListener("resize", updateKeyboardState);
      viewport.removeEventListener("scroll", updateKeyboardState);
      window.removeEventListener("resize", updateKeyboardState);
      document.removeEventListener("focusin", updateAfterFocus);
      document.removeEventListener("focusout", updateAfterFocus);
    };
  }, []);
  return keyboard;
}

/** 열림 여부만 필요할 때. */
export function useVirtualKeyboardOpen() {
  return useVirtualKeyboard().open;
}

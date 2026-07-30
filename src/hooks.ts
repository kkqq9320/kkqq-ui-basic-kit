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
 * back()을 부르는 경우 — 스택 길이가 1(자기 자신만 남음)일 때만, `back()`을 부르기
 * 직전에 한 번만 반응하는 `popstate` 리스너를 걸어 두고, 그 리스너 안에서 되돌립니다.
 * (2) 사용자가 물리적 뒤로가기를 눌러 popstate가 오는 경우 — handlePopState에서 그
 * 이벤트의 state가 이미 빈 스택인지 확인해서, 역시 popstate 핸들러 "안에서" 되돌립니다.
 * 묻힌 표식을 replaceState로 걷어내는 경로(위 주석)는 스택을 절대 비우지 않으므로
 * (위에 뭔가 남아 있을 때만 타는 경로) 여기서는 손대지 않습니다. history.scrollRestoration이
 * 없는 환경(구형·비표준)도 있으므로 항상 존재를 확인한 뒤에만 손댑니다.
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
        const current = readStack(window.history.state);
        if (current[current.length - 1] === popupId) {
          // 여기서 곧바로 releaseScrollRestoration()을 부르면 안 된다 — 실제 브라우저에서
          // 확인된 버그였다: 이 시점엔 아직 "지금 떠나려는" 이 항목이 current이므로, 값을
          // 쓰면 그 항목에 찍히고 만다. 정작 되돌아갈 이전 항목(예: 원래 페이지)은
          // claimScrollRestoration() 때 이미 "manual"로 얼어붙은 채였고, back()이 실제로
          // 그 항목에 착지한 뒤에도 여전히 manual로 남는다. popstate는 그 항목이 진짜
          // current가 된 뒤에만 오므로, 되돌리는 일은 그 popstate 핸들러 안에서 해야 한다.
          if (current.length === 1) window.addEventListener("popstate", releaseScrollRestoration, { once: true });
          window.history.back();
          return;
        }
        // 묻혔다 — back()으로는 못 뽑는다(뽑으면 남의 것이 뽑힌다). 그래서 실제 history
        // 항목은 하나 죽은 채 남는다(나중에 뒤로가기 한 번이 허공에 소비된다 — §10과의
        // 긴장, 보고서 참고). 대신 표식은 지금 스택 상태에서 걷어내, 나중에 이 팝업이
        // 다시 열릴 때 "이미 표식이 있다"고 착각해 push를 건너뛰지 않게 한다.
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
 */
export function useVisualViewportBox(): VisualViewportBox | null {
  const [box, setBox] = useState<VisualViewportBox | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    function update() {
      const next = {
        top: Math.round(viewport!.offsetTop),
        left: Math.round(viewport!.offsetLeft),
        width: Math.round(viewport!.width),
        height: Math.round(viewport!.height),
      };
      setBox((current) => (current && current.top === next.top && current.left === next.left && current.width === next.width && current.height === next.height ? current : next));
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

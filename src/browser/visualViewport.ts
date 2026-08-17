/* `window.visualViewport`를 감싸는 훅들 — 화면에 **실제로 보이는 영역**과, 그것으로
 * 알아내는 가상 키보드.
 *
 * `hooks.ts`에서 갈라져 나왔습니다(PRINCIPLES §15 규칙 4). 둘을 한 파일에 두는 이유는
 * **같은 브라우저 API를 감싸는 형제**이기 때문입니다 — 가상 키보드에는 쓸 수 있는 전용
 * API가 없고 뷰포트 높이 변화로 알아내는 것이 유일한 길입니다. 서로를 호출하지는
 * 않습니다(둘 다 `window.visualViewport`를 직접 읽습니다). 전용 API를 쓸 수 있게 되면
 * 그때 갈라지는 것이 자연스럽습니다.
 */
import { useEffect, useState } from "react";

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

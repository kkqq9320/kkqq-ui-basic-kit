/* 앵커드 팝업 배치 헬퍼 — 원본: frontend/src/components/AppSelect.tsx:5-36
 *
 * 드롭다운·팝오버가 공유합니다. visualViewport를 쓰기 때문에 모바일에서
 * 가상 키보드가 뷰포트를 줄여도 정확한 여유 공간을 계산합니다.
 */

/** 트리거 기준 위/아래 여유 공간. bottomInset은 하단 고정 바 높이 등을 비워둘 때 씁니다. */
export function dropdownViewportSpace(trigger: HTMLElement, bottomInset = 8) {
  const rect = trigger.getBoundingClientRect();
  const viewportTop = window.visualViewport?.offsetTop ?? 0;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const edge = 8;
  return {
    rect,
    edge,
    above: Math.max(0, rect.top - viewportTop - edge),
    below: Math.max(0, viewportTop + viewportHeight - bottomInset - rect.bottom),
  };
}

/** 아래 공간이 부족하고 위가 더 넓을 때만 위로 엽니다. */
export function shouldOpenDropdownAbove(trigger: HTMLElement, desiredHeight: number, bottomInset = 8) {
  const { above, below } = dropdownViewportSpace(trigger, bottomInset);
  return below < desiredHeight && above > below;
}

/**
 * 앵커드 팝업의 좌표를 다시 재야 하는 **모든** 신호를 한 자리에 모읍니다. 해제 함수를
 * 돌려주므로 `useEffect`의 cleanup에 그대로 씁니다.
 *
 * PRINCIPLES §3이 "포털 좌표는 스크롤·리사이즈·visualViewport 변화마다 다시 계산"이라고
 * 적어 뒀는데, `Select`와 `DateWheelPicker`가 각각 **셋만** 등록하고 있었습니다. 빠진 것은
 * **`visualViewport`의 `scroll`**입니다.
 *
 * ⚠️ `document.addEventListener("scroll", …, true)`로는 못 잡습니다 — 그건 DOM 트리의
 * 스크롤이고, `VisualViewport`는 별개의 이벤트 타겟입니다. 그래서 **핀치줌으로 확대한 채
 * 패닝하면** `offsetTop`·`offsetLeft`만 바뀌고 `resize`도 document `scroll`도 나지 않아
 * 좌표가 통째로 낡습니다 — 그런데 `dropdownViewportSpace`와 두 컴포넌트의 `left` 계산이
 * 바로 그 offset을 읽습니다.
 *
 * 정답은 이미 이 저장소 안에 있었습니다: `src/browser/visualViewport.ts`의 `useVisualViewportBox`가
 * `resize`와 `scroll`을 둘 다 등록하고 그 이유까지 적어 뒀습니다("뷰포트가 스크롤되면
 * offsetTop이 바뀌므로 inset도 다시 재야 합니다").
 *
 * **정직한 범위:** 가상 키보드가 열릴 때는 높이도 변해 `resize`가 나므로 그 경로는 이전에도
 * 부분적으로 보정됐습니다. 가드가 정말 없던 구간은 **핀치줌 상태의 팬**입니다.
 *
 * `capture: true`인 이유는 `scroll`이 버블하지 않아서입니다 — 안쪽 스크롤 컨테이너가
 * 움직이는 것은 capture로만 document에서 보입니다.
 */
export function onViewportChange(handler: () => void): () => void {
  // ⚠️ **등록 시점의 객체를 붙듭니다.** 해제할 때 `window.visualViewport`를 다시 읽으면,
  // 그 사이 뷰포트 객체가 갈린 경우 **옛 객체에 리스너가 그대로 남습니다.**
  const viewport = window.visualViewport;
  window.addEventListener("resize", handler);
  document.addEventListener("scroll", handler, true);
  viewport?.addEventListener("resize", handler);
  viewport?.addEventListener("scroll", handler);
  return () => {
    window.removeEventListener("resize", handler);
    document.removeEventListener("scroll", handler, true);
    viewport?.removeEventListener("resize", handler);
    viewport?.removeEventListener("scroll", handler);
  };
}

export type ScrollSnapshot = Array<{ element: Element; top: number; left: number }>;

/**
 * 스크롤 위치를 기록합니다. 모바일에서 옵션을 누르면 브라우저가 포커스를 따라
 * 화면을 움직이는데, 선택 직전에 찍어뒀다가 복원하면 보던 위치가 유지됩니다.
 */
export function captureScrollSnapshot(scrollRootId = "root"): ScrollSnapshot {
  const elements = [document.getElementById(scrollRootId), document.scrollingElement].filter((element): element is Element => Boolean(element));
  return [...new Set(elements)].map((element) => ({ element, top: element.scrollTop, left: element.scrollLeft }));
}

/**
 * 포인터로 트리거를 누를 때 **포커스를 직접 옮깁니다.**
 *
 * **왜 브라우저에 맡기면 안 되는가.** macOS 브라우저는 버튼을 클릭해도 포커스를 주지
 * 않습니다 — 시스템 설정의 "키보드 탐색"이 꺼져 있으면 버튼·링크는 클릭 대상이 되지
 * 포커스 대상이 되지 않는 것이 그 플랫폼의 오랜 관례입니다. 이 킷의 팝업 컨트롤은
 * **키 핸들러를 트리거 하나에만** 걸어 두므로(설계 스펙 §6.2), 포커스가 안 오면
 * 방향키·숫자·Enter·`Ctrl+;`가 **전부** 닿지 않습니다.
 *
 * 오너 실기기 캡처(2026-08-11)가 같은 동작의 두 트레이스로 잡았습니다:
 *   맥     `click target=button.wheel-trigger` → `keydown … tgt=body`  처리됨=N
 *   윈도우 `click target=span`                      → `keydown … tgt=button…` 처리됨=Y
 *
 * ⚠️ **`pointerdown`에서 부르면 안 됩니다 — 3ms만 살아 있습니다.** 첫 판이 그랬고,
 * 두 번째 맥 캡처가 그 이유를 그대로 찍었습니다:
 *
 *     +0ms  pointerdown target=span
 *     +4ms  focusin  foc=button.wheel-trigger   ← 여기서 우리가 줬다
 *     +7ms  mousedown target=span
 *     +9ms  focusout foc=body                        ← mousedown 기본 동작이 도로 걷어간다
 *
 * 맥은 버튼에 포커스를 **안 주는** 것이 아니라 `mousedown`의 기본 동작이 **적극적으로
 * 걷어냅니다.** 그래서 `mousedown`보다 **뒤**에 오는 `click`에서 잡습니다.
 *
 * **`mousedown`을 `preventDefault`하는 표준 해법을 쓰지 않은 이유:** 터치에서 `mousedown`은
 * `touchend` 뒤의 합성 이벤트이고, 그것을 막으면 뒤따르는 `click`이 삼켜지는 브라우저가
 * 있습니다. 이 저장소에는 팝오버 표면에 이미 그 차단이 있고 **"터치 탭으로 버튼이 계속
 * 눌리는가"가 미검증 항목으로 남아 있습니다.** 같은 미검증 가정을 하나 더 만드는 것보다,
 * 위험이 없는 자리에서 잡는 쪽을 골랐습니다. `click`은 마우스·터치 양쪽에서 옵니다.
 *
 * ⚠️ `DateWheelPicker`의 옛 주석이 "`tabIndex={-1}`인 버튼도 클릭하면 포커스를 받습니다"를
 * **사실로 단정**하고 있었고 §6.2의 불변식이 그 위에 서 있었습니다. 그 문장은 Windows
 * 에서만 참이었습니다. **불변식은 전제가 아니라 코드가 지킵니다.**
 *
 * `preventScroll`인 이유는 `restoreFocusWithoutScroll`과 같습니다 — 모바일에서 포커스가
 * 화면을 끌고 갑니다. `currentTarget`을 받으므로 트리거 **안의 세그먼트**를 눌러
 * 이벤트가 버블해 온 경우에도 트리거가 잡힙니다(실제 클릭은 대개 그쪽입니다).
 *
 * 비활성 요소는 포커스를 받을 수 없으므로 여기서 `disabled`를 따로 보지 않습니다 —
 * 그 경우 `focus()`가 DOM 규칙상 아무 일도 하지 않습니다.
 */
export function focusTriggerOnClick(trigger: HTMLElement | null) {
  trigger?.focus({ preventScroll: true });
}

/** 트리거로 포커스를 되돌리되 화면은 움직이지 않습니다. */
export function restoreFocusWithoutScroll(element: HTMLElement | null, snapshot: ScrollSnapshot) {
  element?.focus({ preventScroll: true });
  snapshot.forEach(({ element: scrollElement, top, left }) => {
    scrollElement.scrollTop = top;
    scrollElement.scrollLeft = left;
  });
}

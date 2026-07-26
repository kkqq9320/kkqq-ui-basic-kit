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
 * 이 눌림을 "닫기 제스처"로 볼지 판단합니다. 주 버튼(마우스 왼쪽·터치·펜)만 참입니다.
 *
 * 마우스의 뒤로/앞으로 버튼과 가운데 버튼도 mousedown·pointerdown을 일으킵니다.
 * 그걸 닫기로 처리하면 뒤로가기 버튼 한 번에 두 가지가 겹칩니다: 팝업이 먼저 닫히며
 * 정리 코드가 history 표식을 써버리고, 뒤이어 브라우저의 뒤로가기가 그 표식을 못 찾아
 * 페이지를 나가버립니다. 커서가 팝업 안이었는지 밖이었는지에 따라 결과가 갈려서
 * 진단하기 매우 어렵습니다.
 *
 * button: 0 = 주 버튼, 1 = 가운데, 2 = 오른쪽, 3/4 = 뒤로/앞으로, -1 = 눌림 없음.
 */
export function isPrimaryButton(event: { button?: number }) {
  return (event.button ?? 0) <= 0;
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

/** 트리거로 포커스를 되돌리되 화면은 움직이지 않습니다. */
export function restoreFocusWithoutScroll(element: HTMLElement | null, snapshot: ScrollSnapshot) {
  element?.focus({ preventScroll: true });
  snapshot.forEach(({ element: scrollElement, top, left }) => {
    scrollElement.scrollTop = top;
    scrollElement.scrollLeft = left;
  });
}

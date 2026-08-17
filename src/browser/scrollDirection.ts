/* 아래로 스크롤하면 숨고 위로 스크롤하면 나타나는 바 — 그 판정 하나.
 *
 * `hooks.ts`에서 갈라져 나왔습니다(PRINCIPLES §15 규칙 4). 팝업 닫기와도 뷰포트와도
 * 참조가 없어(실측 0건) 따로 섰습니다. 작은 파일이지만 **잡화점보다 낫습니다** —
 * 파일 이름을 읽고 안에 무엇이 있는지 짐작할 수 있습니다.
 */
import { useEffect, useState } from "react";

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

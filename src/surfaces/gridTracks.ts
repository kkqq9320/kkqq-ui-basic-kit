import type { CSSProperties } from "react";

/**
 * 페이지 격자 트랙 보조 함수 — 원본: frontend/src/components/PageChrome.tsx
 * page.css가 읽는 격자 트랙 CSS 사용자 정의 속성 값을 만듭니다.
 */

/**
 * 통 하나에만 걸리는 트랙 크기. `min`은 "언제 열이 줄어드는가", `max`는 "얼마나 커질 수
 * 있는가"입니다.
 *
 * ⚠️ **`min`만으로는 칸을 줄일 수 없습니다.** 위쪽이 `1fr`이면 트랙이 남는 폭을 나눠
 * 가지므로, 항목이 적을수록 오히려 커집니다 — 2560에서 패널 둘이 `min`을 200으로 내려도
 * 1077px씩 먹었습니다. 줄이려면 `max`를 주세요. 안 주면 지금까지와 같습니다.
 */
export function trackStyle(token: string, min?: string, max?: string, justify?: GridJustify): CSSProperties | undefined {
  if (!min && !max && !justify) return undefined;
  return {
    ...(min ? { [`${token}-min`]: min } : {}),
    ...(max ? { [`${token}-max`]: max } : {}),
    ...(justify ? { [`${token}-justify`]: justify } : {}),
  } as CSSProperties;
}

/**
 * `max`를 주면 트랙이 줄어들고 **남는 폭이 생깁니다.** 그 폭을 줄 어디에 둘지입니다.
 *
 * ⚠️ **`auto-fit`은 항목 수보다 많은 칸을 보여 주지 않습니다.** 패널이 둘이면 아무리 넓은
 * 화면에서도 두 칸이고, `max`는 칸을 늘리는 것이 아니라 **줄이고 남긴** 것입니다
 * (실측 2560: `400px 400px 0px 0px 0px`). 칸을 더 원하면 항목을 더 넣어야 합니다.
 */
export type GridJustify = "normal" | "start" | "center" | "end" | "space-between" | "space-around";

/* **손잡이가 두 갈래인 이유.** 자주 쓰는 것(`min`·`max`·`justify`)은 prop과 토큰으로
 * 열어 두고, 나머지는 `className`으로 앱이 직접 겁니다. 이 그리드들에 `className`이 없던
 * 동안에는 **컨테이너 속성을 앱이 손댈 방법이 아예 없어서**, 필요한 속성이 생길 때마다
 * 킷에 prop을 하나씩 더하는 왕복이 났습니다(min → max → justify로 세 번). `align-items`·
 * `gap`·`grid-auto-flow`처럼 이름이 끝없는 것들은 그 방식으로 못 따라갑니다.
 *
 * ```tsx
 * <PanelGrid className="dense">…</PanelGrid>
 * ```
 * ```css
 * .dense { gap: 8px; align-items: stretch; grid-auto-flow: dense; }
 * ``` */

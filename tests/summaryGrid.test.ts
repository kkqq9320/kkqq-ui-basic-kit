/// <reference types="vite/client" />

/* 요약 그리드가 **한 줄에 들어가는 만큼 채우는지** 지킵니다.
 *
 * 오너 리포트 #2: 2560 화면에서 요약 카드 한 장이 너무 커집니다. 실측 533px —
 * 높이가 118px인 상자가 폭 533px로 납작하게 늘어납니다.
 * **원인은 폭이 남아서가 아니라 열 수가 고정이라서였습니다**(`repeat(4, minmax(0,1fr))`).
 * 카드가 화면을 4등분해서 가져갑니다.
 *
 * ⚠️ **이 파일이 지키는 핵심은 `auto-fill` 대 `auto-fit`입니다 — 한 글자 차이로 규칙이
 * 통째로 무력해집니다.** `auto-fit`은 **빈 트랙을 접어** 남는 폭을 있는 카드들에게 다시
 * 나눠 줍니다. 카드가 4장뿐인 화면에서는 2560에서 도로 4열 533px가 되어, 고치려던 그
 * 모습으로 **정확히 되돌아갑니다.** 그런데 카드가 6·8장으로 늘어나는 화면에서는 두 값이
 * 같아 보이므로, 눈으로 보고 잡을 수 있다고 기대하면 안 됩니다.
 *
 * **한계를 적어 둡니다:** jsdom은 레이아웃을 하지 않으므로 이 파일은 **선언이 그렇게
 * 쓰여 있다**는 것까지만 증명합니다. 실제로 그려지는 폭은 실측으로 봤습니다
 * (2560에서 4열 533px → 8열 259px). themeTokens·license 계약 테스트와 같은 계열입니다.
 */
import { describe, expect, it } from "vitest";

import pageCssSource from "../css/page.css?raw";
import tokensCssSource from "../css/tokens.css?raw";

/** 줄 시작의 `.summary-grid { … }` 규칙 본문. 미디어 쿼리 안의 재정의와 섞이지 않게
 *  줄 시작으로 한정합니다(그쪽은 들여쓰기가 있습니다). */
const gridRule = /^\.summary-grid\s*\{([^}]*)\}/m.exec(pageCssSource)?.[1];
const panelGridRule = /^\.panel-grid\s*\{([^}]*)\}/m.exec(pageCssSource)?.[1];

describe("요약 그리드는 들어가는 만큼 채운다", () => {
  // 전제 — `?raw`가 빈 문자열로 목킹되면 아래가 전부 공허하게 통과합니다.
  it("CSS 소스를 실제로 읽었다", () => {
    expect(pageCssSource.length).toBeGreaterThan(1000);
    expect(tokensCssSource.length).toBeGreaterThan(1000);
  });

  it(".summary-grid 규칙을 찾을 수 있다", () => {
    expect(gridRule).toBeDefined();
  });

  it("카드 최소 폭 토큰이 :root에 정의돼 있다", () => {
    expect(tokensCssSource).toMatch(/--summary-card-min:\s*\d+px/);
  });

  it("열 수를 고정하지 않는다 — repeat(4, …) 시절로 돌아가지 않게", () => {
    expect(gridRule ?? "").not.toMatch(/repeat\(\s*\d/);
  });

  /* **이 단언 하나가 이 파일의 존재 이유입니다.** `auto-fit`으로 바꾸면 빈 트랙이 접혀
   * 카드가 도로 늘어나는데, 카드가 많은 화면에서는 차이가 안 보여 리뷰로도 안 잡힙니다. */
  it("auto-fill이다 — auto-fit이면 빈 트랙이 접혀 카드가 도로 늘어난다", () => {
    expect(gridRule ?? "").toMatch(/repeat\(\s*auto-fill\s*,/);
  });

  it("트랙 최소 폭을 그 토큰에서 가져온다", () => {
    expect(gridRule ?? "").toMatch(/minmax\(\s*var\(--summary-card-min/);
  });

  /* 토큰이 없는 소비자(옛 tokens.css를 쓰거나 직접 재정의한 경우)에서 `minmax()`가
   * 무효가 되면 `grid-template-columns` 선언 자체가 버려지고, 그러면 카드가 한 줄에
   * 통째로 늘어섭니다 — **조용한 실패**라 폴백을 답니다. */
  it("토큰이 없는 소비자를 위해 폴백 값을 둔다", () => {
    expect(gridRule ?? "").toMatch(/var\(--summary-card-min,\s*\d+px\)/);
  });
});

/* 두 그리드가 **일부러 반대**입니다. 그대로 두려면 그 반대됨 자체를 못박아야 합니다 —
 * 안 그러면 다음 사람이 "둘이 다르네, 통일하자"고 한쪽을 바꾸고, 그게 정확히 회귀입니다.
 * 어느 쪽으로 통일하든 하나는 망가집니다:
 *   카드를 auto-fit으로 → 카드 4장이 2560에서 도로 533px
 *   패널을 auto-fill로  → 앱이 둘만 묶은 줄에서 오른쪽 3분의 1이 통째로 빔
 *                         (오너가 캡 안에서 정확히 그 모습을 기각했습니다)
 */
describe("패널 그리드는 앱이 묶은 그룹이 줄을 다 쓰게 한다", () => {
  it(".panel-grid 규칙을 찾을 수 있다", () => {
    expect(panelGridRule).toBeDefined();
  });

  it("패널 최소 폭 토큰이 :root에 정의돼 있다", () => {
    expect(tokensCssSource).toMatch(/--panel-min:\s*\d+px/);
  });

  it("auto-fit이다 — 앱이 명시한 그룹은 남는 폭을 비우지 않는다", () => {
    expect(panelGridRule ?? "").toMatch(/repeat\(\s*auto-fit\s*,/);
  });

  it("트랙 최소 폭을 그 토큰에서 폴백과 함께 가져온다", () => {
    expect(panelGridRule ?? "").toMatch(/minmax\(\s*var\(--panel-min,\s*\d+px\)/);
  });

  /* 없으면 한 줄의 패널이 **가장 큰 패널 높이로 늘어나** 짧은 패널 안쪽에 큰 빈 자리가
   * 생깁니다. 빈 자리는 패널 아래로 나가야 합니다. */
  it("align-items: start로 패널이 서로의 높이에 끌려가지 않는다", () => {
    expect(panelGridRule ?? "").toMatch(/align-items:\s*start/);
  });

  /* `.panel`의 `margin-bottom: 20px`이 살아 있으면 grid gap에 더해져 세로 간격만
   * 두 배가 됩니다 — 가로·세로가 어긋나는데 한쪽만 보면 눈치채기 어렵습니다. */
  it("그리드 안의 패널은 자기 margin-bottom을 끈다", () => {
    expect(pageCssSource).toMatch(/^\.panel-grid\s*>\s*\.panel\s*\{[^}]*margin-bottom:\s*0/m);
  });

  it("두 그리드는 서로 반대다 — 한쪽으로 통일하면 다른 쪽이 깨진다", () => {
    expect(gridRule ?? "").toContain("auto-fill");
    expect(panelGridRule ?? "").toContain("auto-fit");
  });
});

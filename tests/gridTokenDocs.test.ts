/// <reference types="vite/client" />

/* **그리드 토큰 열둘의 기본값이 문서와 소스에서 갈라지면 안 된다.**
 *
 * `CUSTOMIZING.md`가 그리드 세 축(최소·상한·남는 폭)의 기본값을 표로 적습니다. 같은
 * 수치가 `css/tokens.css`에도 있으니 **두 곳에 있는 수치**이고, 이 저장소는 그 모양으로
 * 이미 여러 번 당했습니다 — 참조 개수 주석이 두 번 낡았고, 설치 예시 태그가 한 파일 안에서
 * 두 값을 말했습니다. 그때 얻은 결론이 **"수치는 주석이 아니라 단언에 둔다"**였습니다.
 *
 * ⚠️ **목록을 낱낱이 못박습니다.** "문서에 적힌 것이 소스와 같다"만 보면, 토큰이 새로
 * 생겼는데 문서에 안 적히는 경우를 **공허하게 통과**합니다(빈 교집합도 "다 맞다"가 되니까).
 * 그래서 양쪽에서 뽑은 **집합 자체**를 비교합니다.
 */
import { describe, expect, it } from "vitest";

import customizing from "../CUSTOMIZING.md?raw";
import pageCssSource from "../css/page.css?raw";
import themeEditorCssSource from "../css/theme-editor.css?raw";
import tokensCssSource from "../css/tokens.css?raw";

const GRIDS = ["summary-card", "panel", "field", "color-card"] as const;
const AXES = ["min", "max", "justify"] as const;

/** 소스의 선언값. 주석 안의 예시 숫자에 걸리지 않게 **선언 형태만** 잡습니다. */
const declared = () => {
  const found: Array<[string, string]> = [];
  for (const grid of GRIDS) {
    for (const axis of AXES) {
      const name = `--${grid}-${axis}`;
      const rule = new RegExp(`^\\s*${name}:\\s*([^;]+);`, "m").exec(tokensCssSource);
      if (rule) found.push([name, rule[1].trim()]);
    }
  }
  return found;
};

/** `CUSTOMIZING.md`의 그리드 절에 적힌 `` `--토큰`(값) `` 쌍. 다른 절에도 같은 표기가
 *  있으므로 **그 절만 잘라서** 봅니다 — 안 자르면 컨트롤 높이 토큰까지 딸려 옵니다. */
const documented = () => {
  const start = customizing.indexOf("### 그리드 — 칸 수·칸 폭·남는 폭");
  expect(start).toBeGreaterThan(-1);
  const end = customizing.indexOf("\n### ", start + 1);
  const section = customizing.slice(start, end < 0 ? undefined : end);

  const found: Array<[string, string]> = [];
  const pair = /`(--[a-z-]+)`\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pair.exec(section)) !== null) found.push([match[1], match[2].trim()]);
  return found;
};

describe("그리드 토큰 문서", () => {
  /* 앵커가 깨지면 아래가 통째로 무의미해집니다. 먼저 못박습니다. */
  it("소스에서 열두 개를 전부 뽑아냈다", () => {
    expect(declared()).toHaveLength(12);
  });

  it("문서에서도 열두 개를 뽑아냈다", () => {
    expect(documented()).toHaveLength(12);
  });

  /* ⚠️ 이 단언 하나가 이 파일의 목적입니다. 이름과 값을 **한 벌로** 비교하므로
   * 값이 갈라져도, 토큰이 새로 생겨 문서에 안 적혀도 빨개집니다. */
  it("문서에 적힌 기본값이 소스의 선언과 정확히 같다", () => {
    expect(documented()).toEqual(declared());
  });
});

/* **같은 수치가 세 번째 자리에도 있습니다: `var(--토큰, 폴백)`의 폴백.**
 *
 * 폴백은 `tokens.css`를 안 싣는 소비자에게만 보입니다(README가 폰트를 빼려고 개별 import를
 * 안내하므로 실제로 있는 경로입니다). **그래서 갈라져도 이 저장소에서는 아무도 안 봅니다** —
 * 위 문서 대조도 폴백은 안 봅니다. 실제로 둘이 갈라져 있었습니다:
 * `--panel-min` 토큰 400 / 폴백 640, `--color-card-min` 토큰 240 / 폴백 360.
 *
 * ⚠️ **`justify`는 뺍니다.** 넷 다 `normal`이라 갈라져도 드러나지 않고, 값이 같은 것끼리
 * 비교하는 검사는 순서·짝을 못 가립니다(이 저장소의 "두 값이 같으면 구분 못 한다" 함정). */
const componentCss = { "../css/page.css": pageCssSource, "../css/theme-editor.css": themeEditorCssSource };
const SIZE_AXES = ["min", "max"] as const;

/** CSS에서 쓰인 `var(--그리드-축, 폴백)`의 폴백. 넷 × 둘 = 여덟 개가 나와야 합니다. */
const fallbacks = () => {
  const all = Object.values(componentCss).join("\n");
  const found: Array<[string, string]> = [];
  for (const grid of GRIDS) {
    for (const axis of SIZE_AXES) {
      const name = `--${grid}-${axis}`;
      const use = new RegExp(`var\\(${name},\\s*([^)]+)\\)`).exec(all);
      if (use) found.push([name, use[1].trim()]);
    }
  }
  return found;
};

/** 위 `declared()`에서 크기 축만. 폴백과 짝을 맞추기 위해 같은 순서로 뽑습니다. */
const declaredSizes = () => declared().filter(([name]) => SIZE_AXES.some((axis) => name.endsWith(`-${axis}`)));

describe("var()의 폴백이 토큰 기본값과 같다", () => {
  // 앵커 확인 — 정규식이 하나도 못 잡으면 아래 비교가 빈 배열끼리라 공허합니다.
  it("CSS에서 폴백 여덟 개를 전부 뽑아냈다", () => {
    expect(fallbacks()).toHaveLength(8);
  });

  it("선언에서도 크기 축 여덟 개를 뽑아냈다", () => {
    expect(declaredSizes()).toHaveLength(8);
  });

  it("폴백이 선언과 정확히 같다", () => {
    expect(fallbacks()).toEqual(declaredSizes());
  });
});

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

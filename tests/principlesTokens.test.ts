/// <reference types="vite/client" />

/* **`PRINCIPLES.md` §1이 색에 대해 하는 말이 실제와 같아야 한다.**
 *
 * 그 절은 세 가지를 주장합니다 — `--accent`의 **값**, **상태색 목록**, 그리고 **킷이 안 쓰고
 * 앱에 열어 둔 색**. 셋 다 지금까지 아무도 안 지켰고, 그 사이 실제로 어긋났습니다:
 * `--gold`이 상태색으로 적혀 있는데 킷 CSS의 `var(--gold)` 참조는 **0건**이었습니다
 * (`--deep`도 같습니다). 편집기에서 그 둘을 뺀 뒤로는 읽는 사람에게 더 이상하게 보입니다.
 *
 * 이 저장소의 결론은 늘 같았습니다 — **수치와 목록은 주석이 아니라 단언에 둔다.**
 * `tests/gridTokenDocs.test.ts`(문서 표 ↔ 토큰)와 `tests/motionTokenCopies.test.ts`
 * (소스 상수 ↔ 토큰)의 세 번째 짝입니다.
 *
 * ⚠️ **문장을 다시 쓰면 아래 앵커도 같이 고치세요.** 앵커가 못 잡으면 전제 검사가 먼저
 * 빨개지도록 해 뒀습니다 — 조용히 통과하지 않습니다.
 */
import { describe, expect, it } from "vitest";

import principles from "../PRINCIPLES.md?raw";
import { THEME_TOKEN_GROUPS } from "../src/themeTokens";
import tokensCssSource from "../css/tokens.css?raw";

const cssModules = import.meta.glob("../css/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const allCss = Object.values(cssModules).join("\n");
const exposed = THEME_TOKEN_GROUPS.flatMap((group) => group.tokens).map((token) => token.name);

/** 문서가 `` `--토큰`(`#hex`) `` 꼴로 적어 둔 값. */
const quotedValues = () =>
  [...principles.matchAll(/`(--[a-z-]+)`\(`(#[0-9a-fA-F]{3,8})`\)/g)].map((match) => [match[1], match[2]] as const);

/** `tokens.css`의 라이트 선언값. */
const declared = (name: string) => new RegExp(`^\\s*${name}:\\s*([^;]+);`, "m").exec(tokensCssSource)?.[1].trim();

/** 문서가 `상태색(…)`으로 열거한 이름들. */
const statusColors = () =>
  [...(/상태색\(([^)]+)\)/.exec(principles)?.[1] ?? "").matchAll(/`(--[a-z-]+)`/g)].map((match) => match[1]);

/** 문서가 "킷이 쓰지 않고 앱에 열어 둔 색"이라고 적은 이름들. */
const appOnly = () =>
  [...(/^- (.+)은 킷이 쓰지 않고/m.exec(principles)?.[1] ?? "").matchAll(/`(--[a-z-]+)`/g)].map((match) => match[1]);

const usedInCss = (name: string) => allCss.includes(`var(${name}`);

describe("PRINCIPLES §1의 색 문장은 실제와 같다", () => {
  // 전제 셋 — 앵커가 하나라도 빗나가면 아래가 빈 배열을 도는 **공허한 통과**가 됩니다.
  it("문서에서 값이 적힌 토큰을 뽑아냈다", () => {
    expect(quotedValues().length).toBeGreaterThan(0);
  });

  it("상태색 목록을 뽑아냈다", () => {
    expect(statusColors().length).toBeGreaterThan(0);
  });

  it("앱에 열어 둔 색 목록을 뽑아냈다", () => {
    expect(appOnly().length).toBeGreaterThan(0);
  });

  it("문서에 적힌 값이 tokens.css의 선언과 같다", () => {
    expect(quotedValues().map(([name, hex]) => [name, hex])).toEqual(quotedValues().map(([name]) => [name, declared(name)]));
  });

  /* 이것이 실제로 어긋나 있던 자리입니다 — `--gold`이 상태색으로 적혀 있는데 참조가 0건이었습니다. */
  it("상태색으로 적힌 것은 킷 CSS가 실제로 쓴다", () => {
    expect(statusColors().filter((name) => !usedInCss(name))).toEqual([]);
  });

  it("앱에 열어 둔 색은 킷 CSS가 쓰지 않는다", () => {
    expect(appOnly().filter(usedInCss)).toEqual([]);
  });

  /* 안 쓰는 색을 편집기에 얹으면 고쳐도 화면이 안 바뀝니다 — v0.7.0이 그래서 둘을 뺐습니다.
   * `themeTokens.test.ts`가 반대 방향("노출된 것은 쓰여야 한다")을 지키고, 이 검사는
   * **문서가 앱 몫이라고 말한 색이 편집기에 다시 새어 들어오는 것**을 막습니다. */
  it("앱에 열어 둔 색은 편집기 목록에도 없다", () => {
    expect(appOnly().filter((name) => exposed.includes(name))).toEqual([]);
  });
});

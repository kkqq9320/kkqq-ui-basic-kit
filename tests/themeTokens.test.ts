/// <reference types="vite/client" />

/* 테마 편집기에 노출된 토큰이 **실제로 화면을 움직이는지** 지킵니다.
 *
 * 이 계약이 없어서 생긴 결함: `--orange`가 편집기에 "주황 · 주의"로 노출돼 있는데
 * CSS 어디에서도 `var(--orange)`를 쓰지 않았습니다. 사용자가 그 색을 바꿔도 **아무 일도**
 * **일어나지 않았습니다.** 그리고 정작 유일하게 주황인 요약 카드는 리터럴 세 개
 * (`#975129` `#fff2e8` `#f0d5c2`)와 다크 전용 규칙을 따로 들고 있었습니다.
 *
 * 뿌리는 부주의가 아니라 **토큰 부재**였습니다 — `--accent-soft`·`--green-soft`는 있는데
 * `--orange-soft`가 없어서 리터럴을 쓸 수밖에 없었습니다. 그래서 고침도 "치환"이 아니라
 * 없던 토큰을 만드는 것이었습니다.
 */
import { describe, expect, it } from "vitest";

import { THEME_TOKEN_GROUPS, THEME_TOKENS } from "../src/themeTokens";

const cssModules = import.meta.glob("../css/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const allCss = Object.values(cssModules).join("\n");
const exposed = THEME_TOKEN_GROUPS.flatMap((group) => group.tokens).map((token) => token.name);

/**
 * 아직 `var()` 참조가 0건인 채로 편집기에 남아 있는 토큰. **미결정 항목이고 인계 문서의
 * "미결정 3건"에 같이 적혀 있습니다** — 쓸 자리를 찾을지, 편집기에서 뺄지 정해야 합니다.
 * 여기 적어 두는 이유는 두 가지입니다: 아래 계약을 지금 켤 수 있게 하고, **잊히지 않게**
 * 하는 것. 다음 테스트가 이 목록이 썩는 것도 막습니다.
 */
const UNDECIDED = ["--deep", "--gold"];

describe("편집기에 노출된 토큰은 화면을 움직인다", () => {
  // 전제 확인 — 목록이 비면 아래 계약이 공허하게 통과합니다.
  it("노출된 토큰이 있다", () => {
    expect(exposed.length).toBeGreaterThan(0);
  });

  // **exhaustive 형태입니다.** `filter(...).toEqual([])`가 아니라 안 쓰인 것 전부를
  // 나열해 비교합니다 — 어느 토큰이 죽었는지 실패 메시지가 직접 말합니다.
  it("미결정으로 적어 둔 것 말고는 전부 CSS에서 쓰인다", () => {
    const unused = exposed.filter((name) => !allCss.includes(`var(${name}`));

    expect(unused.sort()).toEqual([...UNDECIDED].sort());
  });

  // **목록이 썩는 것을 막습니다.** 누군가 `--gold`를 쓰기 시작하면 이 테스트가 빨개져서
  // 목록에서 빼게 만듭니다. 이게 없으면 예외 목록이 조용히 거짓이 됩니다.
  it("미결정 목록에 이미 쓰이는 토큰이 남아 있지 않다", () => {
    const nowUsed = UNDECIDED.filter((name) => allCss.includes(`var(${name}`));

    expect(nowUsed).toEqual([]);
  });

  // 노출 목록에 없는 이름을 예외로 적어 두면 그것도 거짓입니다.
  it("미결정 목록의 이름이 전부 실제 노출 토큰이다", () => {
    expect(UNDECIDED.filter((name) => !exposed.includes(name))).toEqual([]);
  });
});

describe("요약 카드 세 변형은 같은 관용구를 쓴다", () => {
  const pageCss = cssModules["../css/page.css"];
  const variants = ["teal", "green", "orange"];

  // 색 리터럴이 하나라도 남으면 그 카드는 테마 편집기가 못 건드립니다.
  // 뮤테이션: `.summary-card.orange`를 옛 리터럴로 되돌리면 빨개집니다.
  it("어느 변형에도 색 리터럴이 없다", () => {
    const withLiteral = variants.filter((name) => {
      const rule = new RegExp(`\\.summary-card\\.${name}\\s*\\{[^}]*\\}`).exec(pageCss)?.[0] ?? "";
      return /#[0-9a-fA-F]{3,8}\b/.test(rule);
    });

    expect(withLiteral).toEqual([]);
  });

  // 각 변형이 자기 토큰 짝(색 + 옅은 배경)을 쓴다는 것. 위 테스트는 "리터럴이 없다"만
  // 보므로, 세 카드가 전부 같은 토큰을 써도 통과합니다 — 여기서 짝을 이름으로 고정합니다.
  it.each([
    ["teal", "--accent"],
    ["green", "--green"],
    ["orange", "--orange"],
  ])("%s 카드는 %s와 그 -soft 짝을 쓴다", (variant, token) => {
    const rule = new RegExp(`\\.summary-card\\.${variant}\\s*\\{[^}]*\\}`).exec(pageCss)?.[0] ?? "";

    expect([rule.includes(`var(${token})`), rule.includes(`var(${token}-soft)`)]).toEqual([true, true]);
  });

  // 다크 전용 규칙이 필요 없어야 합니다 — 토큰이 테마별로 갈리므로. teal·green이 이미
  // 그렇고, orange만 자기 다크 규칙을 들고 있었습니다.
  it("변형마다 따로 두는 다크 규칙이 없다", () => {
    expect(variants.filter((name) => new RegExp(`\\[data-theme="dark"\\][^{]*\\.summary-card\\.${name}`).test(pageCss))).toEqual([]);
  });
});

describe("같은 위험은 같은 빨강이다", () => {
  // `.danger-button`은 처음부터 `var(--red)`였는데 다이얼로그의 위험 버튼만 리터럴
  // `#bd554d`였고 **다크 규칙이 아예 없었습니다.** 그래서 다크에서 대비 3.72로
  // 읽기 어려웠습니다(토큰으로 7.53).
  it.each([
    ["css/controls.css", ".danger-button"],
    ["css/dialog.css", ".dialog-actions .danger"],
  ])("%s의 %s가 --red를 쓴다", (file, selector) => {
    const source = cssModules[`../${file}`];
    const rule = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{[^}]*\\}`).exec(source)?.[0] ?? "";

    expect([rule.includes("var(--red)"), /#[0-9a-fA-F]{3,8}\b/.test(rule)]).toEqual([true, false]);
  });
});

/* 그룹 나누기. 오너 요청으로 **글자를 바탕에서 떼어냈습니다** — 배경을 고르는 일과 그
 * 위 글자를 고르는 일은 다른 판단이고, 대비를 볼 때 글자끼리 나란히 보이는 편이 낫습니다. */
describe("토큰 묶음", () => {
  const titleOf = (name: string) => THEME_TOKEN_GROUPS.find((group) => group.tokens.some((token) => token.name === name))?.title;

  it("글자는 자기 묶음에 있다", () => {
    expect(titleOf("--text")).toBe("글자");
    expect(titleOf("--muted")).toBe("글자");
  });

  it("바탕 묶음에 글자가 섞이지 않는다", () => {
    const 바탕 = THEME_TOKEN_GROUPS.find((group) => group.title === "바탕");
    expect(바탕).toBeDefined();
    expect(바탕!.tokens.map((token) => token.name)).not.toContain("--text");
  });

  /* 뱃지는 편집기에 **없었습니다** — 오너가 화면에서 찾아냈습니다. 토큰만 만들고 목록에
   * 안 올리면 여전히 못 고칩니다. */
  it("뱃지가 편집기 목록에 있다", () => {
    expect(THEME_TOKENS.map((token) => token.name)).toContain("--badge");
  });
});

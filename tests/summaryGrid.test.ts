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
import demoSource from "../demo/main.tsx?raw";
import themeEditorCssSource from "../css/theme-editor.css?raw";
import principlesSource from "../PRINCIPLES.md?raw";

/** 줄 시작의 `.summary-grid { … }` 규칙 본문. 미디어 쿼리 안의 재정의와 섞이지 않게
 *  줄 시작으로 한정합니다(그쪽은 들여쓰기가 있습니다). */
const gridRule = /^\.summary-grid\s*\{([^}]*)\}/m.exec(pageCssSource)?.[1];
const panelGridRule = /^\.panel-grid\s*\{([^}]*)\}/m.exec(pageCssSource)?.[1];
const fieldGridRule = /^\.field-grid\s*\{([^}]*)\}/m.exec(pageCssSource)?.[1];

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

  /* `stretch`는 위 `align-items: start`를 되돌리는 것이라, 규칙이 없으면 prop이 표시를
   * 붙여도 **아무 일도 안 일어납니다** — 화면에서만 조용히 안 먹는 종류입니다. */
  it("stretch 규칙이 있고 align-items를 되돌린다", () => {
    expect(pageCssSource).toMatch(/^\.panel-grid\[data-align="stretch"\]\s*\{[^}]*align-items:\s*stretch/m);
  });

  it("두 그리드는 서로 반대다 — 한쪽으로 통일하면 다른 쪽이 깨진다", () => {
    expect(gridRule ?? "").toContain("auto-fill");
    expect(panelGridRule ?? "").toContain("auto-fit");
  });
});

/* 패널 **안쪽**의 필드 배치. 이게 킷에 없어서 앱은 패널 안을 한 열로만 쓸 수 있었고,
 * 데모만 자기 CSS(`.demo-grid`)로 흉내 내고 있었습니다 — **데모에만 있는 레이아웃은
 * 킷의 기능이 아닙니다.** 오너가 스크린샷으로 지목한 두 자리 중 하나입니다. */
describe("패널 안 필드 배치", () => {
  it(".field-grid 규칙을 찾을 수 있다", () => {
    expect(fieldGridRule).toBeDefined();
  });

  it("필드 최소 폭 토큰이 :root에 정의돼 있다", () => {
    expect(tokensCssSource).toMatch(/--field-min:\s*\d+px/);
  });

  /* `PanelGrid`와 같은 이유입니다 — 폼의 필드는 앱이 넣은 명시적 목록이라 남는 폭을
   * 비워 두면 줄 한쪽이 그냥 빕니다. 카드(`auto-fill`)와는 여전히 반대입니다. */
  it("auto-fit이다", () => {
    expect(fieldGridRule ?? "").toMatch(/repeat\(\s*auto-fit\s*,/);
  });

  it("트랙 최소 폭을 그 토큰에서 폴백과 함께 가져온다", () => {
    expect(fieldGridRule ?? "").toMatch(/minmax\(\s*var\(--field-min,\s*\d+px\)/);
  });

  /* 데모 전용 클래스가 남아 있으면 다음 사람이 그걸 계속 쓰고, 그 레이아웃은 소비 앱에
   * 영영 안 갑니다. 옮긴 뒤 **쓰이지 않는 것**까지 확인합니다. */
  it("데모가 더 이상 자기 .demo-grid를 쓰지 않는다", () => {
    expect(demoSource).not.toContain('className="demo-grid"');
  });
});

/* 색상 편집기의 토큰 목록. **`repeat(2, …)` 2열 고정이라 `.summary-grid`와 같은 결함**
 * 이었습니다 — 카드가 화면을 2등분해서, 2560에서 한 장이 1038px이고 그 안 헥스 칸이
 * `#101119` 일곱 글자에 그 폭을 다 썼습니다. 오너가 "색상 토큰에 내부 색상 선택자는
 * 조절 안 되고 있네"로 잡아냈습니다 — **같은 결함이 킷 안에 하나 더 있었고 이번 라운드가
 * 거기까지 안 갔던 것입니다.** 고침이 같은 모양의 자리를 전부 훑어야 한다는 규칙이
 * (PR #7/#9) 또 값을 했습니다. */
describe("색상 편집기 목록도 들어가는 만큼 채운다", () => {
  const listRule = /^\.theme-color-list\s*\{([^}]*)\}/m.exec(themeEditorCssSource)?.[1];

  it("CSS 소스를 실제로 읽었다", () => {
    expect(themeEditorCssSource.length).toBeGreaterThan(500);
  });

  it(".theme-color-list 규칙을 찾을 수 있다", () => {
    expect(listRule).toBeDefined();
  });

  it("열 수를 고정하지 않는다 — repeat(2, …) 시절로 돌아가지 않게", () => {
    expect(listRule ?? "").not.toMatch(/repeat\(\s*\d/);
  });

  /* 색상 토큰은 앱이 늘릴 수 있는 **집합**이라 카드(요약 카드)와 같은 편입니다 —
   * `auto-fit`이면 토큰이 적은 그룹에서 카드가 도로 늘어납니다. */
  it("auto-fill이다", () => {
    expect(listRule ?? "").toMatch(/repeat\(\s*auto-fill\s*,/);
  });

  it("트랙 최소 폭을 토큰에서 폴백과 함께 가져온다", () => {
    expect(listRule ?? "").toMatch(/minmax\(\s*var\(--color-card-min,\s*\d+px\)/);
  });

  it("카드 최소 폭 토큰이 :root에 정의돼 있다", () => {
    expect(tokensCssSource).toMatch(/--color-card-min:\s*\d+px/);
  });

  /* **값 칸의 왼쪽 끝은 이름 글자와, 오른쪽 끝은 윗줄 액션 버튼과 같아야 합니다**
   * (PRINCIPLES §13). 그 정렬을 숫자로 맞추지 않고 **구조로** 얻습니다 — 입력 줄이
   * `display: contents`로 카드 그리드에 그대로 타고, 표시는 견본과 같은 첫 칸에,
   * 입력칸은 이름·액션이 쓰는 나머지 칸을 그대로 씁니다.
   *
   * 한동안 입력 줄이 **자기 그리드**(`max-content minmax(0,1fr)`, 표시 30px + 간격 8px)를
   * 갖고 있었습니다. 입력칸이 카드 왼쪽에서 38px, 이름 글자는 34+10=44px이라 **6px
   * 어긋났고** 오너가 화면에서 잡았습니다. 34/10을 여기 적어 맞출 수도 있었지만 그건
   * 카드 그리드를 손으로 복제하는 것이라, 카드가 바뀌면 조용히 다시 어긋납니다. */
  it("입력 줄이 카드 그리드에 그대로 탄다 — 자기 그리드를 새로 만들지 않는다", () => {
    const entry = /^\.theme-color-entry\s*\{([^}]*)\}/m.exec(themeEditorCssSource)?.[1] ?? "";
    expect(entry).toMatch(/display:\s*contents/);
    expect(entry).not.toMatch(/grid-template-columns/);
  });

  it("표시는 견본과 같은 첫 칸에 들어간다", () => {
    /* 규칙을 **먼저 뽑고** 봅니다. 통짜 정규식으로 파일 전체를 훑으면, 못 찾았을 때
       "CSS 전체가 안 맞는다"는 메시지만 나와 무엇이 없는지 알 수 없습니다 — 실제로
       이 단언이 그렇게 실패해서 원인을 찾는 데 시간을 썼습니다. */
    const rule = themeEditorCssSource
      .split(/\r?\n/)
      .find((line) => line.trimStart().startsWith(".theme-color-entry > small") && line.includes("grid-column"));
    expect(rule, ".theme-color-entry > small 에 grid-column 규칙이 없습니다").toBeDefined();
    expect(rule).toMatch(/grid-column:\s*1\s*;/);
  });

  it("입력칸은 액션이 끝나는 칸까지 뻗는다 — 그래야 오른쪽 끝이 맞는다", () => {
    expect(themeEditorCssSource).toMatch(/^\.theme-color-text\s*\{[^}]*grid-column:\s*2\s*\/\s*-1/m);
  });
});

/* §13이 실제로 문서에 있는지. 위 규칙들이 "PRINCIPLES §13"을 근거로 대는데 그 절이
 * 없으면 **매달린 참조**가 됩니다 — 이 저장소에서 공개 스펙에 그 일이 한 번 있었습니다. */
describe("가장자리 정렬 원칙이 문서에 있다", () => {
  it("PRINCIPLES에 §13이 있다", () => {
    expect(principlesSource).toMatch(/^## 13\. /m);
  });

  /* §14는 이 라운드에서 오너가 말로 정리해 준 원칙입니다 — "이런 건 킷에서 고정해 두는 게
     아니고 소비하는 앱에서 정의해야 하는 것들". 그 문장이 코드로만 남고 문서에 없으면
     다음 사람이 같은 논쟁을 다시 합니다. */
  it("PRINCIPLES에 §14가 있다", () => {
    expect(principlesSource).toMatch(/^## 14\. /m);
  });
});

/* **`min`만으로는 칸을 줄일 수 없습니다.** `minmax()`의 위쪽이 `1fr`이면 트랙이 남는 폭을
 * 나눠 가지므로, 항목이 적을수록 오히려 커집니다 — 2560에서 패널 둘이 `--panel-min`을
 * 200으로 내려도 1077px씩 먹었고, 오너가 "줄이려면 max-width가 있어야 하는 것 아니냐"고
 * 짚었습니다. 네 그리드가 모두 `--*-min` / `--*-max` 짝을 갖는지 한자리에서 봅니다 —
 * **하나만 빠지면 그게 다음 라운드의 질문이 됩니다**(SummaryGrid의 `min`이 그랬습니다).
 *
 * ⚠️ `max`가 `min`보다 작으면 **`min`이 이깁니다**(CSS `minmax()` 규칙). 실측:
 * `--panel-min: 400px`에 `--panel-max: 380px`를 주면 패널은 400px입니다. 줄이려면
 * `min`도 같이 내려야 합니다. */
describe("네 그리드가 위쪽 한계도 연다", () => {
  const cases: Array<[string, string, string]> = [
    [".summary-grid", "--summary-card", pageCssSource],
    [".panel-grid", "--panel", pageCssSource],
    [".field-grid", "--field", pageCssSource],
    [".theme-color-list", "--color-card", themeEditorCssSource],
  ];

  /* 정규식을 **문자열로 조립하지 않습니다.** 이 세션에서 조립하다 이스케이프가 한 겹 더
     붙어 "리터럴 백슬래시를 찾는" 정규식이 세 번 나왔고, 그중 하나는 한동안 초록으로
     통과하고 있었습니다. 인덱스로 자르는 편이 짧고, 틀릴 자리가 없습니다. */
  const ruleOf = (source: string, selector: string) => {
    const at = source.indexOf(selector + " {");
    if (at === -1) return undefined;
    return source.slice(at, source.indexOf("}", at) + 1);
  };
  const declOf = (token: string) => {
    const at = tokensCssSource.indexOf(token + "-max:");
    if (at === -1) return undefined;
    return tokensCssSource.slice(at, tokensCssSource.indexOf(";", at) + 1).split(" ").join("");
  };

  it.each(cases)("%s 는 %s-max 를 minmax의 위쪽으로 쓴다", (selector, token, source) => {
    const rule = ruleOf(source, selector);
    expect(rule, selector + " 규칙을 못 찾았습니다").toBeDefined();
    expect(rule).toContain("var(" + token + "-max, 1fr)");
  });

  /* 기본값이 `1fr`이어야 **지금까지와 같습니다**. 길이로 박아 두면 이 짝을 넣은 것만으로
     모든 소비자의 화면이 바뀝니다. */
  /* `max`를 주면 트랙이 줄고 **반드시 남는 폭이 생깁니다.** 그 폭을 어디에 둘지가 없으면
     화면은 늘 왼쪽에 몰린 채로만 나옵니다 — 오너 스크린샷이 정확히 그 상태였습니다.
     실측(패널 500px, 2560): 왼쪽 뒤 1154 / 가운데 앞뒤 577 / 양끝 사이 1174 / 오른쪽 앞 1154. */
  it.each(cases)("%s 는 %s-justify 로 남는 폭의 자리를 연다", (selector, token, source) => {
    expect(ruleOf(source, selector)).toContain("justify-content: var(" + token + "-justify, normal)");
  });

  it.each(cases.map(([, token]) => token))("%s-justify 기본값은 normal이다 — 지금까지와 같다", (token) => {
    const at = tokensCssSource.indexOf(token + "-justify:");
    expect(at, token + "-justify 정의를 못 찾았습니다").toBeGreaterThan(-1);
    expect(tokensCssSource.slice(at, tokensCssSource.indexOf(";", at) + 1).split(" ").join("")).toBe(token + "-justify:normal;");
  });

  it.each(cases.map(([, token]) => token))("%s-max 기본값이 :root에 있고 제한 없음이다", (token) => {
    expect(declOf(token), token + "-max 정의를 못 찾았습니다").toBeDefined();
    expect(declOf(token)).toBe(token + "-max:1fr;");
  });
});

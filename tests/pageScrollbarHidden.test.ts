/// <reference types="vite/client" />

/* **페이지 스크롤바는 보이지 않지만, 스크롤은 그대로 된다 — 그리고 그 숨김은
 * 페이지 스크롤 호스트 셋에만 머문다.**
 *
 * 오너 요청(2026-08-12): "스크롤바는 기능은 하는데 그냥 보이지만 않았으면 좋겠다."
 * 킷은 이미 모바일에서 같은 일을 하고 있었고(같은 세 선택자), 이번에 데스크톱까지
 * 넓힙니다. 실제 크롬 실측:
 *
 *   숨기기 전   문서 폭 1274 / 게터 4px 예약 / 넘침 67
 *   숨긴 뒤     문서 폭 1278 / 게터 0        / 넘침 67   ← 넘침은 그대로, 안 그려질 뿐
 *   스크롤      scrollTo(40) → 40, scrollTo(0) → 0      ← 기능은 살아 있음
 *
 * `scrollbar-gutter: stable`은 **같이 빠져야 합니다.** 그 선언의 목적은 "오버플로가
 * 생겨도 문서 폭이 흔들리지 않게"인데, 스크롤바가 폭을 아예 안 먹으면 흔들릴 것이
 * 없고 4px만 영구히 죽습니다(실측으로 그 4px을 돌려받았습니다).
 *
 * ⚠️ **이 파일이 지키는 진짜 계약은 세 번째입니다 — 숨김이 번지지 않는 것.**
 * 예전에 `*`로 전부 숨겨서 Select 메뉴·다이얼로그·사이드바 서랍이 **실제로 스크롤되는데도
 * 스크롤바가 안 보여 "더 있다"가 안 보이는** 결함이 있었습니다(`css/tokens.css`의
 * 사연 주석). 페이지는 잘린 내용 자체가 "더 있다"를 말해 주지만, 안쪽 표면은 그렇지
 * 않습니다. 그래서 대상 선택자를 **낱낱이** 못박습니다.
 *
 * ⚠️ jsdom은 스크롤바를 그리지 않으므로 이 파일은 **선언까지만** 증명합니다
 * (`summaryGrid`·`themeTokens`·`license`와 같은 계열). 위 숫자가 근거입니다.
 */
import { describe, expect, it } from "vitest";

import tokensCssSource from "../css/tokens.css?raw";

/* ⚠️ **주석을 먼저 걷어냅니다.** 첫 판에서 두 검사가 빨갰는데 결함이 아니라 이것
 * 때문이었습니다 — 이 변경을 설명하는 주석 안에 `scrollbar-gutter: stable`이라는
 * **글자**가 들어 있어서 "그 선언이 없다"가 거짓이 됐고, 선택자 파서는 `}`와 `{`
 * 사이를 전부 선택자로 읽어 **주석 문단을 선택자로 삼켰습니다.** 계약 검사는
 * 선언을 봐야지 산문을 보면 안 됩니다. */
const declarationsOnly = tokensCssSource.replace(/\/\*[\s\S]*?\*\//g, "");

/** 모바일 블록 앞부분 = 미디어 쿼리 밖(= 데스크톱에도 걸리는) 영역. */
const mobileBlockAt = declarationsOnly.indexOf("@media (max-width: 760px)");
const globalSection = declarationsOnly.slice(0, mobileBlockAt < 0 ? undefined : mobileBlockAt);

/** `{` 앞의 선택자 목록을 공백 하나로 눌러서 돌려줍니다. */
const selectorsOf = (source: string, declaration: RegExp) => {
  const found: string[] = [];
  const ruleRe = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = ruleRe.exec(source)) !== null) {
    if (declaration.test(match[2])) found.push(match[1].replace(/\s+/g, " ").trim());
  }
  return found;
};

describe("페이지 스크롤바 숨김", () => {
  /* 이 하나가 틀리면 아래 "전역인가" 판정이 통째로 무의미해집니다. 먼저 못박습니다. */
  it("모바일 블록을 찾을 수 있다 — 전역/모바일을 가르는 기준점", () => {
    expect(mobileBlockAt).toBeGreaterThan(-1);
  });

  it("페이지 스크롤 호스트의 스크롤바 숨김이 미디어 쿼리 밖에 있다", () => {
    expect(globalSection).toMatch(/^html,\s*body,\s*#root\s*\{[^}]*scrollbar-width:\s*none/m);
  });

  it("webkit 쪽 숨김도 미디어 쿼리 밖에 있다", () => {
    expect(globalSection).toMatch(/^html::-webkit-scrollbar,[^{]*\{[^}]*display:\s*none/m);
  });

  /* 스크롤바가 폭을 안 먹으면 예약할 것이 없습니다. 남겨 두면 4px이 영구히 죽습니다. */
  it("scrollbar-gutter를 예약하지 않는다", () => {
    expect(declarationsOnly).not.toMatch(/scrollbar-gutter:\s*stable/);
  });

  /* ⚠️ 여기가 핵심입니다. 목록이 늘어나면 — 특히 `*`가 들어오면 — 빨개져야 합니다. */
  it("스크롤바를 숨기는 선택자는 페이지 스크롤 호스트 셋뿐이다", () => {
    expect(selectorsOf(declarationsOnly, /scrollbar-width:\s*none/)).toEqual([
      "html, body, #root",
    ]);
  });

  it("webkit 숨김 선택자도 그 셋뿐이다", () => {
    expect(selectorsOf(declarationsOnly, /display:\s*none/)).toEqual([
      "html::-webkit-scrollbar, body::-webkit-scrollbar, #root::-webkit-scrollbar",
    ]);
  });

  /* 안쪽 표면(Select 메뉴·다이얼로그·사이드바 서랍)은 전역 리셋의 4px thin을 그대로
   * 이어받습니다. 이 줄이 사라지면 숨김을 좁혀 둔 의미가 없어집니다. */
  it("안쪽 표면은 공용 얇은 스크롤바를 그대로 받는다", () => {
    expect(globalSection).toMatch(/^\*\s*\{[^}]*scrollbar-width:\s*thin/m);
  });
});

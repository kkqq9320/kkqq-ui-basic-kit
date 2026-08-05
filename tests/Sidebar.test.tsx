// @vitest-environment jsdom
//
// 사이드바·빠른 바의 CSS 계약. jsdom은 캐스케이드를 계산하지 않으므로(레이아웃 엔진이
// 없다) 소스 텍스트로 고정한다 — Select.test.tsx·Dialog.test.tsx의 같은 idiom.
// 빈 문자열 가드가 없으면 .css?raw가 ""로 목킹되는 날 통째로 공허하게 통과한다.

import { describe, expect, it } from "vitest";

import sidebarCssSource from "../css/sidebar.css?raw";

describe("터치에서 들러붙는 호버", () => {
  // 터치 기기는 탭한 요소에 :hover를 다음 탭까지 붙여둔다. 가드가 없으면 눌렀다 뗀
  // 항목이 계속 강조돼 "지금 선택된 항목"처럼 보인다. 실기기 관측: 서랍을 뒤로가기로
  // 닫은 뒤에도 빠른 바의 메뉴 버튼이 accent로 남아 있었다.
  it("빠른 바 버튼의 :hover가 (hover: hover) 안에 있다", () => {
    expect(sidebarCssSource.length).toBeGreaterThan(1000);
    expect(sidebarCssSource).toMatch(/@media \(hover: hover\) \{\s*\.mobile-quick-bar > button:hover \{/);
  });

  it("사이드바 nav 항목의 :hover 두 규칙이 모두 (hover: hover) 안에 있다", () => {
    expect(sidebarCssSource.length).toBeGreaterThan(1000);
    expect(sidebarCssSource).toMatch(/@media \(hover: hover\) \{\s*\.sidebar nav :is\(a, button\):hover::before \{/);
    expect(sidebarCssSource).toMatch(/@media \(hover: hover\) \{\s*\.sidebar nav :is\(a, button\):hover \{/);
  });

  // 가드를 넣으면서 규칙을 한 블록으로 모으고 싶어지는데, 그러면 소스 순서가 바뀐다.
  // :hover::before(opacity .5)가 .active::before(opacity 1)보다 **앞에** 있어야 활성
  // 항목이 이긴다 — 미디어 쿼리는 특이도를 더하지 않으므로 순서가 유일한 판정 기준이다.
  // 블록을 아래로 옮기면 호버가 활성을 덮어써 활성 표시가 흐려진다. 16f528a가 낸
  // 사고와 같은 계열이라 명시적으로 고정한다.
  it("호버 규칙이 .active 규칙보다 소스에서 앞선다 — 활성 표시가 이겨야 한다", () => {
    const hoverBefore = sidebarCssSource.indexOf(".sidebar nav :is(a, button):hover::before");
    const activeBefore = sidebarCssSource.indexOf(".sidebar nav :is(a, button).active::before");
    expect(hoverBefore).toBeGreaterThan(-1);
    expect(activeBefore).toBeGreaterThan(-1);
    expect(hoverBefore).toBeLessThan(activeBefore);
  });
});

describe("키보드 포커스 표시", () => {
  // 호버 스타일만 있고 포커스 짝이 없으면 Tab으로 왔을 때 킷 스타일 없이 브라우저
  // 기본 링만 뜬다. 바로 아래 .sidebar-icon-button(:156)이 이미 쓰는 짝이다.
  // 포커스는 터치에서 들러붙지 않으므로 (hover: hover) 가드를 씌우면 안 된다 —
  // 씌우면 터치 기기의 외장 키보드 사용자가 포커스 표시를 잃는다.
  it("사이드바 nav 항목에 :focus-visible 짝이 있고 기본 링을 끈다", () => {
    const rule = sidebarCssSource.match(/^\.sidebar nav :is\(a, button\):focus-visible \{[^}]*\}/m);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/color:\s*#fff/);
    expect(rule![0]).toMatch(/outline:\s*none/);
    expect(sidebarCssSource).toMatch(/^\.sidebar nav :is\(a, button\):focus-visible::before \{/m);
  });

  it("빠른 바 버튼에 :focus-visible 짝이 있고 기본 링을 끈다", () => {
    const rule = sidebarCssSource.match(/\.mobile-quick-bar > button:focus-visible \{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/outline:\s*none/);
  });

  // 포커스 규칙이 (hover: hover) 안에 갇히면 터치 기기 + 외장 키보드에서 표시가 사라진다.
  it("포커스 규칙은 (hover: hover) 안에 있으면 안 된다", () => {
    const guarded = sidebarCssSource.match(/@media \(hover: hover\) \{[^}]*\}[^}]*\}/g) ?? [];
    for (const block of guarded) expect(block).not.toMatch(/:focus-visible/);
  });
});

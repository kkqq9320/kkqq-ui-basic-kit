/// <reference types="vite/client" />

/* **작업 영역의 마지막 자식은 아래 여백을 더하지 않는다.**
 *
 * 오너 리포트(2026-08-12 (a)): "넘칠 게 없는데 스크롤바가 선다."
 * 실측(실제 크롬, `clientHeight` 1214, `main` `6c8d830`)으로 **모든 페이지에서 마지막
 * 요소 아래에 100px의 빈 공간**이 붙는 것을 확인했습니다:
 *
 *   컨트롤   마지막 요소 바닥 1669 / 문서 1769 / 넘침 555
 *   레이아웃 마지막 요소 바닥 1257 / 문서 1357 / 넘침 **143**  ← 그중 100이 내용이 아님
 *   색상     마지막 요소 바닥 2364 / 문서 2464 / 넘침 1250
 *
 * 100 = `.workspace`의 `padding-bottom: 80px` **+ 마지막 자식의 `margin-bottom: 20px`**.
 * 뒤엣것이 중복입니다 — 컨테이너가 이미 아래 여백을 패딩으로 갖고 있는데 마지막 블록이
 * 자기 몫을 또 더합니다. 카드가 화면에 다 들어오는 창에서는 **그 20px만으로 스크롤바가
 * 섭니다.** 오너가 고르기를 "중복 20px만 없앤다"(80px 패딩은 유지).
 *
 * ⚠️ **이 파일이 못 보는 것.** jsdom은 레이아웃을 하지 않으므로 여기서는 **선언이
 * 그렇게 쓰여 있다**는 것까지만 증명합니다(이 저장소의 `summaryGrid`·`themeTokens`·
 * `license` 계약 테스트와 같은 계열). 실제로 20px이 걷히는 것은 **실제 크롬에서 실측**
 * 했습니다 — 그 숫자가 근거이고 이 파일은 회귀 방지입니다.
 *
 * 특이도는 이 규칙 편입니다: `.workspace > :last-child`는 (0,2,0),
 * 취소 대상인 `.panel`·`.panel-grid`·`.summary-grid`는 (0,1,0)이라 **순서와 무관하게
 * 이깁니다.** 그래서 "규칙이 어디에 놓였는가"는 검사하지 않습니다.
 */
import { describe, expect, it } from "vitest";

import pageCssSource from "../css/page.css?raw";

/** 줄 시작의 `.workspace > :last-child { … }` 본문. 미디어 쿼리 안의 재정의와 섞이지
 *  않게 줄 시작으로 한정합니다(그쪽은 들여쓰기가 있습니다). */
const lastChildRule = /^\.workspace\s*>\s*:last-child\s*\{([^}]*)\}/m.exec(pageCssSource)?.[1];

/** 선언 하나를 공백 없이. `margin-bottom : 0px` 같은 표기 흔들림을 흡수합니다. */
const squeeze = (css: string) => css.replace(/\s+/g, "");

describe("작업 영역 끝 여백", () => {
  /* 아래 둘은 **일부러 다른 `it`입니다.** 규칙이 통째로 없어지면 첫째가 터지는데,
   * 한 블록에 두면 둘째는 실행조차 안 돼 어떤 뮤테이션으로도 증명되지 않습니다. */
  it("`.workspace > :last-child` 규칙이 있다", () => {
    expect(lastChildRule).toBeDefined();
  });

  it("그 규칙이 아래 여백을 0으로 만든다", () => {
    expect(squeeze(lastChildRule ?? "")).toContain("margin-bottom:0");
  });

  /* ⚠️ **취소할 대상이 실재해야 위 규칙이 뜻을 갖습니다.** 대상이 사라지면 위 둘은
   * 초록인 채 규칙만 남아 아무것도 안 하는 장식이 됩니다. 그래서 값을 **낱낱이**
   * 못박습니다 — 필터형(`filter(...).toEqual([])`)은 매칭 0건에 공허하게 통과합니다. */
  it("작업 영역의 마지막이 될 수 있는 블록들이 실제로 아래 여백을 선언한다", () => {
    const declared = [".summary-grid", ".panel-grid", ".panel"].map((selector) => {
      const escaped = selector.slice(1);
      const body = new RegExp(`^\\.${escaped}\\s*\\{([^}]*)\\}`, "m").exec(pageCssSource)?.[1] ?? "";
      const found = /margin-bottom:\s*([^;]+)/.exec(body)?.[1]?.trim();
      return [selector, found] as const;
    });

    expect(declared).toEqual([
      [".summary-grid", "22px"],
      [".panel-grid", "20px"],
      [".panel", "20px"],
    ]);
  });

  /* 끝 여백은 이제 **패딩이 아니라 스페이서**입니다. 패딩은 진짜 공간이라 그 자신이
   * 넘침을 만들고, 그래서 "볼 것이 없는 스크롤바"가 섰습니다. 아래 넷이 그 설계를
   * 못박습니다. */
  it("`.workspace`의 아래 패딩은 0이다 — 끝 여백을 패딩으로 만들지 않는다", () => {
    const workspace = /^\.workspace\s*\{([^}]*)\}/m.exec(pageCssSource)?.[1] ?? "";
    const padding = /padding:\s*([^;]+)/.exec(workspace)?.[1]?.trim();

    expect(padding).toBe("42px clamp(22px, 5vw, 72px) 0");
  });

  /* `flex-basis: 0`이 요점입니다. 이게 아니면 스페이서가 문서 높이에 그대로 더해져
   * 패딩과 똑같아집니다 — 바꾼 의미가 통째로 사라지는 자리입니다. */
  it("스페이서는 문서 높이를 셀 때 0으로 잡힌다", () => {
    const spacer = /^\.workspace::after\s*\{([^}]*)\}/m.exec(pageCssSource)?.[1] ?? "";

    expect(spacer.replace(/\s+/g, " ")).toContain("flex: 1 1 0");
  });

  it("스페이서의 최대 크기가 토큰으로 열려 있고 기본값이 80px이다", () => {
    const spacer = /^\.workspace::after\s*\{([^}]*)\}/m.exec(pageCssSource)?.[1] ?? "";

    expect(spacer.replace(/\s+/g, " ")).toContain("max-height: var(--workspace-space-bottom, 80px)");
  });

  /* 내용이 이미 넘치는 페이지에서는 여백이 **있어야** 합니다(오너가 3번 이미지로
   * 지목한 요구). 그 경우에만 최소 높이가 박힙니다. */
  it("내용이 이미 넘치면 끝 여백을 그대로 박는다", () => {
    const fixed = /^\.workspace\[data-trailing-space="fixed"\]::after\s*\{([^}]*)\}/m.exec(pageCssSource)?.[1] ?? "";

    expect(fixed.replace(/\s+/g, " ")).toContain("min-height: var(--workspace-space-bottom, 80px)");
  });

  /* ⚠️ 모바일 하단 패딩은 "숨 쉴 공간"이 아니라 **고정 바 자리 + 키보드 보정이 읽는
   * 값**입니다. 스페이서가 거기까지 번지면 `useKeyboardScrollCompensation`의 전제가
   * 흔들립니다. 그래서 모바일에서는 통째로 꺼야 합니다. */
  it("모바일에서는 스페이서를 끈다", () => {
    const mobileAt = pageCssSource.indexOf("@media (max-width: 760px)");
    expect(mobileAt).toBeGreaterThan(-1);

    expect(pageCssSource.slice(mobileAt)).toMatch(/\.workspace::after\s*\{[^}]*content:\s*none/);
  });
});

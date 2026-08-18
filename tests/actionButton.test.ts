/// <reference types="vite/client" />

/* **버튼 옷의 계약.** 종류는 클래스 나열이 아니라 `data-variant` 한 축입니다(PRINCIPLES §16).
 *
 * 🔴 **이 파일이 생긴 이유는 살아 있던 결함입니다.** 예전 모델에서는 행이 자식 버튼을
 * 대신 칠했습니다:
 *
 *     .danger-button                    (0,1,0)
 *     .button-row button:not(.primary)  (0,2,1)   ← 이깁니다
 *
 * 그래서 **행 안의 삭제 버튼은 위험 색을 잃고 secondary로 그려졌습니다.** 데모에서
 * 계산값으로 확인했고(`color: rgb(237,237,245)` = `--text`), `README.md`가 **정확히 그
 * 마크업을 가르치고 있었습니다.** 클래스 나열 모델이 그 사고를 가능하게 한 것입니다 —
 * 각 버튼이 자기 종류를 **말하지 않으니** 문맥이 대신 추측할 수밖에 없었습니다.
 *
 * 같은 집안의 사고가 `wheel-picker.css` 주석에도 기록돼 있습니다((0,2,1)이 (0,2,0)을
 * 이겨 글자가 통째로 사라진 자리). 두 번 났으면 규칙으로 막을 자리입니다.
 */
import { describe, expect, it } from "vitest";

const cssModules = import.meta.glob("../css/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const controls = cssModules["../css/controls.css"];
const markupSources = import.meta.glob("../{src,demo}/**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const allCss = Object.entries(cssModules).filter(([path]) => !path.endsWith("tokens.css")).map(([, source]) => source).join("\n");

const VARIANTS = ["primary", "secondary", "danger", "text"];

/** 주석을 걷어낸 CSS. 주석 안의 예시가 규칙으로 세어지면 안 됩니다. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");

describe("액션 버튼 — 종류는 data-variant 한 축이다", () => {
  // 전제 — 소스를 못 읽으면 아래가 전부 공허합니다.
  it("CSS를 실제로 읽었다", () => {
    expect(controls.length).toBeGreaterThan(2000);
    expect(code(controls)).toContain(".action-button");
  });

  it("네 종류가 전부 정의돼 있다", () => {
    const defined = VARIANTS.filter((variant) => code(controls).includes(`.action-button[data-variant="${variant}"]`));
    expect(defined).toEqual(VARIANTS);
  });

  /* 🔴 **이것이 위 결함을 막는 줄입니다.** 액션 줄은 자기 자식 `button`을 **색으로**
   * 칠하지 않습니다. 칠하는 순간 그 규칙은 자손 선택자라 variant 규칙보다 명시도가
   * 높아지고, 버튼이 자기 종류를 말해도 문맥이 덮어씁니다 — 삭제 버튼이 secondary로
   * 그려지던 것이 정확히 그 모양입니다.
   *
   * ⚠️ **액션 줄 셋으로 좁힙니다.** 처음엔 "어떤 통도"로 썼다가 34건이 잡혔는데, 전부
   * 탭·사이드바 nav·휠 열·드롭다운 옵션이었습니다 — 그것들은 액션 버튼이 아니라
   * **컴포넌트 내부 컨트롤**이고 자기 옷을 갖는 것이 맞습니다. 규칙을 넓게 쓰면 규칙이
   * 아니라 소음이 됩니다.
   *
   * 배치(`display`·`gap`·`margin`·크기)는 통의 일이므로 막지 않습니다 — §2가 조밀 계층을
   * **문맥이 정한다**고 말합니다. 막는 것은 **색**뿐입니다. */
  const ACTION_ROWS = [".action-row", ".dialog-actions", ".wheel-actions"];
  const PAINT = /(^|;|\{)\s*(color|background|background-color|border|border-color)\s*:/;
  it("액션 줄은 자식 button을 색으로 칠하지 않는다", () => {
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(cssModules)) {
      for (const match of code(source).matchAll(/([^{}]*\bbutton\b[^{}]*)\{([^}]*)\}/g)) {
        const selector = match[1].trim();
        if (!ACTION_ROWS.some((row) => selector.includes(row))) continue;
        // `.action-button`을 직접 겨냥한 규칙은 대상이 아닙니다 — 그게 옷 자신입니다.
        if (selector.includes(".action-button")) continue;
        if (PAINT.test(match[2])) offenders.push(`${path.replace("../", "")}: ${selector}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // 전제 — 액션 줄 셋이 CSS에 실제로 있어야 위 검사가 볼 것이 있습니다.
  it("액션 줄 셋이 실제로 존재한다", () => {
    expect(ACTION_ROWS.filter((row) => code(allCss).includes(row))).toEqual(ACTION_ROWS);
  });

  /* 🔴 **`:is()`가 아니라 `:where()`여야 합니다.** `:is()`는 인자 중 가장 높은 명시도를
   * 가져오므로 기하 규칙이 `(0,2,0)`이 되는데, 옛 `.primary`는 `(0,1,0)`이었습니다.
   * 그 한 칸으로 **앱이 `.어떤통 button {…}`으로 걸어 둔 조정이 전부 무력화됩니다** —
   * 데모의 `.layout-switch-buttons button`이 실제로 그렇게 깨져 28px 버튼이 38px이
   * 됐습니다(브라우저에서 재서 발견, 소스만 봐서는 안 보입니다). */
  it("기하 규칙은 :where()로 묶어 명시도를 올리지 않는다", () => {
    const geometry = /\.action-button:(is|where)\(\[data-variant/.exec(code(controls));
    expect(geometry).not.toBeNull();
    expect(geometry![1]).toBe("where");
  });

  /* §2의 두 높이 계층. 값을 글자로 적지 않고 **토큰을 쓰는지**를 봅니다. */
  it("두 높이 계층이 토큰으로 연결돼 있다", () => {
    const compact = /\.action-button\[data-size="compact"\]\s*\{([^}]*)\}/.exec(code(controls))?.[1] ?? "";
    expect(compact).toContain("var(--compact-action-height)");
    expect(compact).toContain("var(--compact-action-min-width)");
    const base = /\.action-button:where\([^)]*\)\s*\{([^}]*)\}/.exec(code(controls))?.[1] ?? "";
    expect(base).toContain("var(--action-height)");
  });

  /* 글자 버튼은 높이 계층 **밖**입니다(§2는 "액션 버튼"의 규칙입니다). base에 기하를
   * 넣었다가 글자 버튼이 굵기 400→700, 높이 23→21px로 딸려 간 적이 있습니다. */
  it("글자 버튼은 칩 기하 묶음에 들어 있지 않다", () => {
    const geometry = /\.action-button:where\(([^)]*)\)/.exec(code(controls))?.[1] ?? "";
    expect(geometry).not.toBe("");
    expect(geometry).not.toContain("text");
    expect(geometry).toContain("primary");
  });

  /* 🔴 **`.page-action-button`이 `.action-button`을 부분 문자열로 포함합니다.**
   *
   * `Button` 라운드의 이관 스크립트가 그것을 몰라서 `className="page-action-button"`을
   * **가운데만 잘라** `className="page-"`로 만들었습니다. `v0.12.0`에 그대로 실려
   * 나갔고, 오너가 화면에서 잡았습니다 — 아이콘이 stroke 대신 검은 채움으로 58px이
   * 됐습니다(규칙이 안 걸리니 SVG 기본값).
   *
   * **아이콘 전용 버튼은 `Button`이 안 덮는다고 문서에 적어 놓고, 스크립트는 그걸
   * 몰랐습니다.** 문서에 적은 경계는 도구가 안 읽습니다. 그래서 여기서 셉니다 —
   * 이 다섯(여섯)은 CSS가 기하를 정해 둔 자리이고, 마크업에서 사라지면 규칙이 죽습니다. */
  const CONTEXT_BUTTONS = ["page-action-button", "sidebar-icon-button", "sidebar-collapse-button", "theme-color-icon-button", "mobile-page-tabs-button", "wheel-step"];
  /* ⚠️ **정직한 범위:** 이 검사는 "그 이름이 코드베이스에서 사라졌는가"를 봅니다.
   * 두 자리 중 **하나만** 잘못되면 다른 하나가 남아 통과합니다(변이로 확인). 그
   * 경우는 아래 "잘린 조각" 검사가 잡습니다 — 둘이 짝입니다. */
  it("문맥별 아이콘 버튼 클래스가 CSS에도 마크업에도 살아 있다", () => {
    const markup = Object.values(markupSources).join(" ");
    expect(markup.length).toBeGreaterThan(5000);
    const missing = CONTEXT_BUTTONS.flatMap((name) => [
      ...(code(allCss).includes(`.${name}`) ? [] : [`${name}: CSS 규칙 없음`]),
      ...(markup.includes(name) ? [] : [`${name}: 마크업에서 안 붙음`]),
    ]);
    expect(missing).toEqual([]);
  });

  /* 위와 같은 사고의 **일반형**: 클래스 이름을 부분 문자열로 수술하면 `"page-"` 같은
   * 잘린 조각이 남습니다. 사람 눈에는 안 띄고 CSS는 조용히 안 걸립니다. */
  it("잘린 클래스 조각이 마크업에 없다", () => {
    const bad: string[] = [];
    for (const [path, source] of Object.entries(markupSources))
      for (const m of code(source).matchAll(/className="([^"]*)"/g))
        for (const cls of m[1].split(/\s+/))
          if (cls && (cls.endsWith("-") || cls.startsWith("-") || cls.includes("--")))
            bad.push(`${path.replace("../", "")}: "${cls}"`);
    expect(bad).toEqual([]);
  });

  /* 옛 이름이 되살아나지 않게 합니다. 죽은 클래스 둘(`file-button`·`link-button`)은
   * 이번에 지웠습니다 — 킷 안에서 아무도 안 썼는데 CSS와 **테스트**가 지키고 있었습니다. */
  it("옛 버튼 클래스가 CSS에 남아 있지 않다", () => {
    const gone = ["primary", "secondary-button", "danger-button", "text-button", "link-button", "file-button", "button-row"];
    const found = gone.filter((name) => new RegExp(`\\.${name}\\b`).test(code(allCss)));
    expect(found).toEqual([]);
  });
});

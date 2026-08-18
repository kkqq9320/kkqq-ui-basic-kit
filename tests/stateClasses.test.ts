/// <reference types="vite/client" />

/* **§16 표의 수를 소스에서 다시 잽니다.**
 *
 * 🔴 이 저장소는 "아무도 다시 안 재는 숫자"로 이미 여러 번 값을 치렀습니다. 이 표에서만
 * 한 세션에 두 번 나왔습니다 — `CHANGELOG.md`가 *"나머지 스물여섯"* 을 말하는 동안 실제
 * 남은 것은 서른하나였고, 표에는 `.dragging` ×1이 **아예 빠져** 있었습니다. 둘 다 손으로
 * 세다 어긋난 것이고, 아무것도 안 빨개졌습니다.
 *
 * 남은 이관(§16의 `.open` 축 · `.active` 축)이 이 수를 또 바꿉니다. 그래서 **표를 같이
 * 고치지 않으면 빨개지게** 합니다.
 *
 * ⚠️ **이 파일이 못 잡는 것:** 표에 **없는** 상태 클래스가 새로 생기는 것. 표에 적힌
 * 이름만 세기 때문입니다. `.dragging`이 빠져 있던 것도 이 파일이 아니라 손으로 세다
 * 나왔습니다. 부품 이름과 상태 클래스를 기계가 가르는 방법이 없어 그렇습니다 —
 * `.wheel-trigger`(부품)와 `.dragging`(상태)은 소스에서 같은 모양입니다.
 * 새 상태 클래스를 만들면 **표에 손으로 적어야 합니다.**
 */
import { describe, expect, it } from "vitest";

import principles from "../PRINCIPLES.md?raw";

const cssModules = import.meta.glob("../css/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** **선택자만 남깁니다.** 날 grep은 `.active`를 여덟 개 세는데 그중 둘이 주석 안의
 *  언급이고, `.entering`은 셋 중 하나, `.editing`은 둘 중 하나가 그렇습니다. 선언
 *  블록도 지웁니다 — 값 안의 점(`.5`, `url(…)`)이 클래스로 읽히면 안 됩니다.
 *
 *  ⚠️ 블록 지우기는 **한 번만** 합니다. `@media`의 바깥 중괄호까지 지우면 그 안의
 *  선택자가 통째로 사라지는데, §16이 남긴 것 중 여럿이 미디어 쿼리 안에 있습니다. */
const selectorText = Object.values(cssModules).join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{[^{}]*\}/g, "{}");

const SECTION_HEADING = "## 16. 상태를 어떻게 적는가";
const TABLE_HEADING = "### 아직 이 규칙을 안 지키는 자리";

/** §16의 그 표 한 절. 다음 `###`까지입니다.
 *
 *  ⚠️ **§16 안으로 먼저 들어간 뒤에 찾습니다.** §15에 **글자까지 똑같은 소제목**이
 *  하나 더 있어서(거기는 파일 자리 이야기입니다), 문서 전체에서 찾으면 그쪽을 뭅니다 —
 *  실제로 그렇게 물었고 아래 전제 검사가 잡았습니다. */
function statesSection(): string {
  const sectionStart = principles.indexOf(SECTION_HEADING);
  if (sectionStart === -1) return "";
  const sectionEnd = principles.indexOf("\n## ", sectionStart + SECTION_HEADING.length);
  const section = principles.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd);

  const start = section.indexOf(TABLE_HEADING);
  if (start === -1) return "";
  const end = section.indexOf("\n### ", start + TABLE_HEADING.length);
  return section.slice(start, end === -1 ? undefined : end);
}

/** 표가 말하는 `` `.이름` ×N `` 쌍. `.moving-*`처럼 별표로 묶은 것은 접두 하나로
 *  여럿을 셉니다(`.moving-next` + `.moving-previous`).
 *
 *  ⚠️ **표 행(`|`로 시작하는 줄)만 봅니다.** 같은 절의 산문도 `` `.dragging` ×1 ``처럼
 *  적고 있어서, 절 전체를 훑으면 같은 것을 두 번 셉니다.
 *
 *  **같은 이름이 여러 행에 나오면 더합니다.** `.active`가 그렇습니다 — 빠른 바의 셋과
 *  휠의 셋은 **갈래가 달라**(① / ③) 행을 나눠 적는데, `css/`에서는 한 이름입니다. */
function claimedCounts(): Array<[string, number]> {
  const rows = statesSection().split("\n").filter((line) => line.startsWith("|"));
  const summed = new Map<string, number>();
  for (const row of rows.join("\n").matchAll(/`\.([\w-]+\*?)`\s*×(\d+)/g)) {
    summed.set(row[1], (summed.get(row[1]) ?? 0) + Number(row[2]));
  }
  return [...summed];
}

/** 그 이름이 `css/`의 선택자에 몇 번 나오는가. 뒤에 글자가 더 붙는 것은 다른
 *  클래스입니다 — `.open`이 `.mobile-open`을 세면 안 됩니다(앞의 `.`이 그것을 막고,
 *  뒤의 `(?![\w-])`가 `.open-thing`을 막습니다). */
function countInCss(name: string): number {
  const body = name.endsWith("*") ? `${name.slice(0, -1)}[\\w-]+` : name;
  return (selectorText.match(new RegExp(`\\.${body}(?![\\w-])`, "g")) ?? []).length;
}

describe("§16 상태 클래스 표는 소스와 맞는다", () => {
  /* 전제 — 표를 못 찾으면(제목이 바뀌면) 아래 비교가 **빈 배열끼리** 통과합니다.
   * 이 저장소가 그 모양의 공허한 초록으로 값을 치른 적이 있습니다. */
  it("전제: 표를 찾아 쌍을 실제로 뽑았다", () => {
    expect(statesSection()).not.toBe("");
    expect(claimedCounts().map(([name]) => name)).toContain("open");
    // ⚠️ 문턱을 **1로** 둡니다. 표는 이관이 진행될수록 줄어들고, 실제로 > 4가 이관 도중
    // 빨개졌습니다(남은 행이 셋). 이 전제가 잡으려는 것은 "행이 몇 개인가"가 아니라
    // **"파싱이 아무것도 못 찾았는가"** 입니다. 위 `toContain("open")`이 특정 행 하나를 따로
    // 못 박고, 합계는 아래 검사가 봅니다.
    // 🔜 표가 **비는 날** 이 파일의 일이 달라집니다 — 그때는 §16의 그 절이 "남은 것 없음"이
    //    되어야 하고, 이 검사들은 그 문장을 지키는 쪽으로 바뀌어야 합니다.
    expect(claimedCounts().length).toBeGreaterThan(0);
  });

  /* **exhaustive 형태입니다** — 이름마다 따로 단언하면 첫 실패에서 멈춰 나머지가 실행조차
   * 안 됩니다. 한 줄로 비교해 **어긋난 자리를 전부** 보여 줍니다. */
  it("표가 말하는 수가 css/에 있는 수와 같다", () => {
    const table = claimedCounts().map(([name, n]) => `.${name} ×${n}`);
    const source = claimedCounts().map(([name]) => `.${name} ×${countInCss(name)}`);
    expect(source).toEqual(table);
  });

  /* 합계도 표 안에 적혀 있습니다. 사본이 아니라 **다른 사실**입니다 — 행을 하나 통째로
   * 지우면 위 검사는 통과하고 이것만 빨개집니다. */
  it("§16이 적은 합계가 실제 합과 같다", () => {
    const stated = /\*\*남은 것은 (\d+)개입니다\*\*/.exec(statesSection());
    expect(stated, "§16에서 '남은 것은 **N개입니다**'를 못 찾음").toBeTruthy();
    const total = claimedCounts().reduce((sum, [name]) => sum + countInCss(name), 0);
    expect(total).toBe(Number(stated![1]));
  });

  /* 나간 것은 **정말로** 나갔는가. §16의 ✅ 문단이 넷을 적고 있습니다 — `.stretch`와
   * `.selected` 둘은 `css/` 어디에도 없어야 하고, sidebar의 `.mobile-open`은 tabs에
   * 같은 이름이 살아 있으므로 그 파일에서만 없어야 합니다. */
  it("나간 것은 css/ 어디에도 안 남아 있다", () => {
    expect([`.stretch ×${countInCss("stretch")}`, `.selected ×${countInCss("selected")}`])
      .toEqual([".stretch ×0", ".selected ×0"]);
  });

  it("sidebar의 서랍 표식은 클래스로 안 남아 있다 — tabs의 같은 이름과 헷갈리지 않게", () => {
    const sidebar = cssModules["../css/sidebar.css"];
    expect(sidebar, "css/sidebar.css를 못 읽음").toBeTruthy();
    expect(sidebar).not.toContain(".mobile-open");
  });
});

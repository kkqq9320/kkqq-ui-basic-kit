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
const TABLE_HEAD_ROW = "| 상태 클래스 | 곳 | 어디로 가야 하는가 |";

/** §16의 상태 클래스 표와 그 아래 설명 한 절.
 *
 *  ⚠️ **§16 안으로 먼저 들어간 뒤에 찾습니다.** §15에 소제목이 글자까지 똑같은 것이
 *  하나 있어서(거기는 파일 자리 이야기입니다), 문서 전체에서 찾으면 그쪽을 뭅니다 —
 *  실제로 그렇게 물었고 전제 검사가 잡았습니다.
 *
 *  ⚠️ **소제목이 아니라 표 머리를 앵커로 씁니다.** 소제목은 남은 개수에 따라 말이
 *  바뀝니다("아직 안 지키는 자리" ↔ "지금은 없습니다") — 실제로 표가 비는 날 그 문구가
 *  바뀌면서 파싱이 절을 통째로 놓쳤고, 이번에도 전제가 잡았습니다. 표 머리는 **표가
 *  있는 한 안 바뀝니다.** */
function statesSection(): string {
  const sectionStart = principles.indexOf(SECTION_HEADING);
  if (sectionStart === -1) return "";
  const sectionEnd = principles.indexOf("\n## ", sectionStart + SECTION_HEADING.length);
  const section = principles.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd);

  const row = section.indexOf(TABLE_HEAD_ROW);
  if (row === -1) return "";
  const end = section.indexOf("\n### ", row);
  return section.slice(row, end === -1 ? undefined : end);
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

/** §16이 **숫자로** 적어 둔 남은 개수. 사본을 만들지 않으려고 문서에서 읽습니다. */
function statedTotal(): number | null {
  const found = /\*\*남은 것은 (\d+)개입니다\*\*/.exec(statesSection());
  return found ? Number(found[1]) : null;
}

describe("§16 상태 클래스 표는 소스와 맞는다", () => {
  /* 전제 — 표를 못 찾으면(제목이 바뀌면) 아래 비교가 **빈 배열끼리** 통과합니다.
   * 이 저장소가 그 모양의 공허한 초록으로 값을 치른 적이 있습니다. */
  /* ✅ **그날이 왔습니다**(2026-08-19) — 표가 비었습니다. 그래서 이 파일의 일이 바뀌었습니다.
   *
   * 전에는 전제가 `claimedCounts().length > 0`이었는데, 그건 **행 개수를 문턱으로 쓴 것**이라
   * 이관이 진행될 때마다 빨개졌습니다(`> 4` → `> 0` → 이제 성립 불가). 지금 전제가 잡는 것은
   * **"절을 찾았고 적힌 수를 읽어냈는가"** 입니다 — 표가 비어도 성립하고, 새 행이 생겨도
   * 성립합니다. */
  it("전제: §16의 그 절을 찾아 적힌 수를 읽어냈다", () => {
    expect(statesSection()).not.toBe("");
    expect(statedTotal()).not.toBeNull();
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
  /* 표가 비면 이 검사는 0 == 0이라 **혼자서는 공허합니다** — 실질 감시자는 아래 "나간
   * 상태 클래스" 쪽입니다. 새 행이 생기는 순간 다시 일합니다. */
  it("§16이 적은 합계가 표를 실제로 센 것과 같다", () => {
    const total = claimedCounts().reduce((sum, [name]) => sum + countInCss(name), 0);
    expect(total).toBe(statedTotal());
  });

  /* 나간 것은 **정말로** 나갔는가. 이름을 하나씩 적는 대신 **한 줄로 비교**합니다 —
   * 따로 단언하면 첫 실패에서 멈춰 나머지가 실행조차 안 됩니다.
   *
   * ⚠️ 이 목록은 §16의 ✅ 문단과 짝입니다. 새 이관이 끝나면 여기 이름을 더하세요 —
   * 위 표 검사는 **표에 적힌 이름**만 보므로, 표에서 지운 이름은 아무도 안 봅니다. */
  it("나간 상태 클래스는 css/ 어디에도 안 남아 있다", () => {
    const gone = ["stretch", "selected", "mobile-open", "open", "active", "entering", "editing", "holding", "dragging", "moving-next", "moving-previous"];
    expect(gone.map((name) => `.${name} ×${countInCss(name)}`)).toEqual(gone.map((name) => `.${name} ×0`));
  });
});

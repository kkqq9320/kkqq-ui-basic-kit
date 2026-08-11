/// <reference types="vite/client" />

/* `LAYOUT-PRINCIPLES.md`는 **킷을 모르는 사람이 통째로 붙여넣어 쓰는 문서**입니다.
 * 다른 AI의 시스템 프롬프트에 들어가거나, 킷이 깔릴 수 없는 프로젝트(남의 프레임워크
 * 위에 얹는 커스텀 컴포넌트 같은)에서 읽힙니다. 그 독자는 이 저장소의 컴포넌트 이름도
 * 토큰 이름도 모릅니다.
 *
 * **자립성은 사람이 지키면 지켜지지 않습니다.** 이 저장소는 이미 두 번 값을 치렀습니다 —
 * 한 소비 프로젝트에 커밋된 2.3MB 사본, 그리고 "저장소는 비공개"라는 거짓을 오래 싣고
 * 있던 스킬. 둘 다 아무도 모르는 채로 갈라져 있었습니다.
 *
 * 그래서 이 파일이 지킵니다:
 *  - 킷 식별자가 새어 들어오면 red (T1·T2)
 *  - px를 **처방으로** 적으면 red (T3). 값은 원칙이 아니라 한 화면의 산물입니다 —
 *    옮겨야 할 것은 나눗셈이지 숫자가 아닙니다. 다만 **실패 기록의 숫자는 과거에 잰
 *    값**이라 남깁니다. 이 구분이 기계적으로 가능한 것은 4줄 형식이 고정이기 때문입니다.
 */
import { describe, expect, it } from "vitest";

import indexSource from "../src/index.ts?raw";
import layoutText from "../LAYOUT-PRINCIPLES.md?raw";
import packageJsonText from "../package.json?raw";
import principlesText from "../PRINCIPLES.md?raw";

/** ```로 둘러싸인 구역을 지웁니다. 예시 코드 안의 px와 토큰 이름은 검사 대상이 아닙니다. */
function withoutCodeFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "");
}

/** `export { A, type B }` 블록에서 이름을 뽑습니다. `type ` 접두는 뗍니다. */
function exportedNames(source: string): string[] {
  const names: string[] = [];
  for (const block of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const raw of block[1].split(",")) {
      const name = raw.trim().replace(/^type\s+/, "");
      if (name) names.push(name);
    }
  }
  return names;
}

const prose = withoutCodeFences(layoutText);
const exported = exportedNames(indexSource);

describe("LAYOUT-PRINCIPLES.md는 킷 없이 읽힌다", () => {
  // 전제 — 파싱이 0건이면 아래 단언들이 **공허하게** 통과합니다.
  it("문서를 실제로 읽어냈다", () => {
    expect(prose.length).toBeGreaterThan(500);
  });

  it("내보내는 이름을 실제로 뽑아냈다", () => {
    expect(exported.length).toBeGreaterThan(30);
  });

  it("컴포넌트 이름이 목록에 있다", () => {
    expect(exported).toContain("PanelGrid");
  });

  it("훅 이름도 목록에 있다", () => {
    expect(exported).toContain("useEscapeToClose");
  });

  /* exhaustive 형태입니다 — 걸린 것을 전부 나열합니다. `some(...)`으로 쓰면 실패가
   * "true"라고만 말하고 어느 줄인지는 안 알려줍니다. */
  it("커스텀 프로퍼티 이름이 없다", () => {
    const found = [...prose.matchAll(/--[a-z][a-z0-9-]*/g)].map((match) => match[0]);
    expect([...new Set(found)]).toEqual([]);
  });

  it("내보내는 이름이 없다", () => {
    const found = exported.filter((name) => new RegExp(`\\b${name}\\b`).test(prose));
    expect(found).toEqual([]);
  });

  it("px를 처방으로 적지 않는다", () => {
    const offenders = prose
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("**실패한 자리**"))
      .filter((line) => /\d+px/.test(line))
      .map((line) => line.trim());
    expect(offenders).toEqual([]);
  });

  it("코드펜스가 짝을 이룬다", () => {
    const fences = layoutText.match(/```/g) ?? [];
    expect(fences.length % 2).toBe(0);
  });

  // 펜스 제거가 산문을 통째로 삼키면 위 검사들이 **공허하게** 통과합니다. 비율로 재면
  // 펜스가 많아진 문서에서 삼킴과 무관하게 빨개지므로, 산문 한 문장이 살아남았는지 봅니다.
  it("펜스 제거가 산문을 삼키지 않았다", () => {
    expect(prose).toContain("한 상자 안에 여러 줄이 쌓이면");
  });
});

describe("LAYOUT-PRINCIPLES.md는 4줄 형식을 지킨다", () => {
  const headings = [...layoutText.matchAll(/^### (\d)\. /gm)].map((match) => Number(match[1]));
  const ruleLines = [...layoutText.matchAll(/^\*\*규칙\*\* — (.+)$/gm)].map((match) => match[1]);
  const failureLines = [...layoutText.matchAll(/^\*\*실패한 자리\*\* — (.+)$/gm)].map((match) => match[1]);

  // 전제 — 절을 못 찾으면 아래가 전부 공허합니다. 그리고 `실패한 자리` 줄이 하나도
  // 없으면 위 describe의 px 검사가 **면제할 것이 없어** 공허하게 엄격해집니다.
  // 단언 하나에 `it` 하나입니다 — 앞이 터지면 뒤는 실행조차 되지 않습니다.
  it("절을 실제로 찾아냈다", () => {
    expect(headings).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("실패 기록 줄을 실제로 찾아냈다", () => {
    expect(failureLines.length).toBeGreaterThanOrEqual(3);
  });

  it("모든 절에 규칙 줄이 있다", () => {
    expect(ruleLines.length).toBe(headings.length);
  });

  it("모든 절에 '내 상자 안'과 '상자 밖이면'이 있다", () => {
    const sections = layoutText.split(/^### \d\. /gm).slice(1);
    const missing = sections
      .map((body, index) => ({ section: index + 1, body }))
      .filter(({ body }) => !body.includes("**내 상자 안**") || !body.includes("**상자 밖이면**"))
      .map(({ section }) => section);
    expect(missing).toEqual([]);
  });

  /* 실패 기록은 **한 줄**입니다. 여러 줄로 쓰면 위 describe의 px 면제 판정이 무너집니다
   * — 둘째 줄부터는 `**실패한 자리**`로 시작하지 않아 처방으로 오인됩니다.
   *
   * ⚠️ **길이로 재면 이 결함을 못 잡습니다.** 캡처 정규식이 `m` 플래그라 `.`가 줄바꿈을
   * 넘지 않아, 손으로 접은 기록은 첫 줄만 짧게 잡히고 둘째 줄은 캡처조차 안 됩니다.
   * 그래서 길이가 아니라 **바로 다음 줄이 이어지는 줄인지**를 봅니다. */
  it("실패 기록 다음 줄이 이어지지 않는다", () => {
    const lines = layoutText.split("\n");
    const wrapped = lines
      .map((line, index) => ({ line, next: lines[index + 1] ?? "" }))
      .filter(({ line }) => line.startsWith("**실패한 자리**"))
      .filter(({ next }) => next.trim() !== "" && !next.startsWith("**") && !next.startsWith("#"))
      .map(({ next }) => next.trim());
    expect(wrapped).toEqual([]);
  });
});

describe("LAYOUT-PRINCIPLES.md가 설치본에 들어간다", () => {
  const manifest = JSON.parse(packageJsonText) as { files: string[]; exports: Record<string, string> };

  // 스킬이 `node_modules/kkqq-ui-basic-kit/LAYOUT-PRINCIPLES.md`를 첫 경로로 찾습니다.
  // `files`에 없으면 스킬이 **없는 파일을 가리키게** 됩니다.
  it("배포 목록에 있다", () => {
    expect(manifest.files).toContain("LAYOUT-PRINCIPLES.md");
  });

  // `PRINCIPLES.md`와 같은 대우입니다 — 소비 코드가 경로로 집어갈 수 있어야 합니다.
  it("exports로 집을 수 있다", () => {
    expect(manifest.exports["./LAYOUT-PRINCIPLES.md"]).toBe("./LAYOUT-PRINCIPLES.md");
  });
});

describe("PRINCIPLES.md의 참조가 실재하는 절을 가리킨다", () => {
  const sectionNumbers = [...layoutText.matchAll(/^### (\d)\. /gm)].map((match) => match[1]);
  const references = [...principlesText.matchAll(/LAYOUT-PRINCIPLES\.md\)\s*§(\d)/g)].map((match) => match[1]);

  /* 전제 — 참조가 0건이면 아래가 공허합니다.
   *
   * 정규식이 잡는 링크는 **다섯**입니다: §2→§4, §7→§5, §8→§7, §13→§1, §14→§6.
   * `(같은 §7)` 꼴의 뒷참조와 맨 위 머리말 링크는 `§N`이 링크 바로 뒤에 붙어 있지 않아
   * 잡히지 않습니다. 임계값은 그 다섯과 **정확히 같게** 둡니다 — 이 검사는 공허 방지 겸
   * **링크 유실 감지**이고, 링크가 하나라도 사라지면 빨개져야 합니다. 그것은 오탐이
   * 아닙니다.
   *
   * ⚠️ 링크를 더하거나 빼면 **이 숫자도 같이 고쳐야 합니다.** 이 주석의 수치가 낡아
   * 거짓이 된 것이 이미 두 번입니다. */
  it("참조를 실제로 찾아냈다", () => {
    expect(references.length).toBeGreaterThanOrEqual(5);
  });

  it("가리키는 절이 전부 존재한다", () => {
    const dangling = [...new Set(references)].filter((number) => !sectionNumbers.includes(number));
    expect(dangling).toEqual([]);
  });
});

describe("PRINCIPLES.md의 요약 줄은 코어 문서의 규칙 줄과 글자가 같다", () => {
  /* §13·§14만 요약을 남깁니다(소유자 결정). 사본을 없애는 대신 **검사되는 사본**으로
   * 만듭니다 — 한쪽만 고치면 여기가 빨개집니다.
   *
   * 정규화는 둘뿐입니다: `**` 제거, 앞뒤 공백 제거. 어투는 정규화하지 않습니다 —
   * 두 문서 모두 합니다체라 애초에 같습니다. */
  const normalize = (line: string) => line.replace(/\*\*/g, "").trim();
  const quoted = [...principlesText.matchAll(/^> \*\*요약:\*\* (.+)$/gm)].map((match) => normalize(match[1]));
  const rules = [...layoutText.matchAll(/^\*\*규칙\*\* — (.+)$/gm)].map((match) => normalize(match[1]));

  // 전제 — 요약이 0건이면 아래가 공허합니다. 단언 하나에 `it` 하나입니다.
  it("요약 줄을 두 개 찾아냈다", () => {
    expect(quoted.length).toBe(2);
  });

  it("규칙 줄을 여덟 개 찾아냈다", () => {
    expect(rules.length).toBe(8);
  });

  /* 부분 문자열이 아니라 **등호**이고, 어느 절과 맞는지까지 고정합니다.
   *
   * `includes`로 두면 요약을 끝에서 잘라 접두사로 만들었을 때 통과하고(브리프가 처음
   * 처방했던 "마침표 하나 지우기"가 정확히 그 경우라 빨개지지 않았습니다), `some`으로
   * 두면 엉뚱한 절의 규칙 줄과 맞아도 통과합니다. 사본이 **검사되는** 사본이려면
   * 그 둘 다 잡아야 합니다. */
  it("§13의 요약이 코어 문서 §1의 규칙 줄과 같다", () => {
    expect(quoted[0]).toBe(rules[0]);
  });

  it("§14의 요약이 코어 문서 §6의 규칙 줄과 같다", () => {
    expect(quoted[1]).toBe(rules[5]);
  });
});

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
});

/// <reference types="vite/client" />

/* **내보내는 컴포넌트는 전부 `className`을 받는다.**
 *
 * 이 라운드에서 같은 모양의 질문이 **네 번** 나왔습니다 — `min`이 없다, `max`가 없다,
 * `justify`가 없다, 그리고 "그럼 그리드도 `className`이 있어야 하는 것 아니냐". 매번
 * 앱에 필요한데 킷만 열 수 있는 손잡이였고, 매번 제가 하나씩 열었습니다.
 * **CSS 속성을 prop으로 하나씩 따라가는 방식은 수렴하지 않습니다.**
 *
 * 그래서 규칙을 하나로 바꿉니다: 자주 쓰는 것(`min`·`max`·`justify`)만 prop과 토큰으로
 * 열고, **나머지 전부는 `className`으로 앱이 직접 겁니다.** 그 규칙이 성립하려면
 * 예외가 없어야 하고, 이 파일이 그것을 지킵니다 — 훑었을 때 스무 개 중 **열 개**가
 * 빠져 있었습니다.
 *
 * 소스를 파싱해 확인합니다. 렌더로 확인하려면 컴포넌트마다 필수 prop 픽스처가 필요하고,
 * 그러면 **새 컴포넌트가 생겼을 때 이 목록에 자동으로 안 들어옵니다** — 빠뜨리는 그
 * 순간을 잡는 것이 이 파일의 목적이라 자동으로 훑는 쪽이어야 합니다.
 * (실제 부착은 `tests/pageChrome.test.tsx`가 렌더로 확인합니다. 둘은 짝입니다:
 *  여기는 "빠짐 없음", 저기는 "실제로 붙음".)
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob("../src/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** `export function Name(...)`의 괄호를 세어 시그니처를 통째로 떼어냅니다. */
function exportedComponents(source: string): Array<{ name: string; signature: string }> {
  const found: Array<{ name: string; signature: string }> = [];
  const pattern = /export function ([A-Z][A-Za-z0-9]*)\s*\(/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    let depth = 0;
    let end = source.length;
    for (let i = pattern.lastIndex - 1; i < source.length; i += 1) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")") {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    found.push({ name: match[1], signature: source.slice(pattern.lastIndex - 1, end + 1) });
  }
  return found;
}

const components = Object.entries(sources).flatMap(([path, source]) =>
  exportedComponents(source).map((component) => ({ ...component, path: path.replace("../src/", "") })),
);

describe("내보내는 컴포넌트는 전부 className을 받는다", () => {
  // 전제 — 파싱이 0건이면 아래 단언이 **공허하게** 통과합니다.
  it("컴포넌트를 실제로 찾아냈다", () => {
    expect(components.length).toBeGreaterThan(15);
    expect(components.map((component) => component.name)).toContain("PanelGrid");
  });

  /* **exhaustive 형태입니다** — 빠진 것을 전부 나열해 비교합니다. `every(...)`로 쓰면
   * 실패가 "false"라고만 말하고 어느 컴포넌트인지는 안 알려줍니다. */
  it("빠진 컴포넌트가 없다", () => {
    const missing = components.filter((component) => !component.signature.includes("className"));
    expect(missing.map((component) => `${component.name} (${component.path})`)).toEqual([]);
  });
});

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

const sources = import.meta.glob("../src/**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

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

/** `export function Name(...)`부터, 함수 본문의 짝 맞는 `{ ... }` 끝까지를 통째로
 * 뗍니다. `exportedComponents`는 시그니처(괄호 안)만 떼는데, 이건 몸통까지 봐야
 * 하는 `NO_OWN_DOM` 검사 전용입니다. */
function componentBody(source: string, name: string): string {
  const marker = `export function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) return "";
  let i = start + marker.length - 1; // '(' 위치
  let depth = 0;
  for (; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) { i += 1; break; }
    }
  }
  const braceStart = source.indexOf("{", i);
  if (braceStart === -1) return "";
  let bodyDepth = 0;
  let end = source.length;
  for (let j = braceStart; j < source.length; j += 1) {
    if (source[j] === "{") bodyDepth += 1;
    else if (source[j] === "}") {
      bodyDepth -= 1;
      if (bodyDepth === 0) { end = j; break; }
    }
  }
  return source.slice(braceStart, end + 1);
}

/** JSX에서 소문자로 시작하는 태그(`<div`, `<span>`, `<input/>`처럼 host 엘리먼트,
 * 즉 자기 DOM 노드)를 찾습니다. 대문자로 시작하는 건 컴포넌트나 컨텍스트
 * (`<Foo>`, `<ShortcutContext.Provider>`)라 자기 DOM이 아닙니다. */
const OWN_DOM_TAG = /<[a-z][\w-]*[\s/>]/;

/* 이 규칙의 근거(위 파일 머리말)는 "CSS 속성을 prop으로 하나씩 따라가는 방식은
 * 수렴하지 않는다" — 즉 **자기 DOM을 렌더하는** 컴포넌트가 대상입니다. 여기 올릴 이름은
 * 자기 DOM 노드가 하나도 없는 컴포넌트뿐입니다(className을 받아도 붙일 자리가 없음).
 * `tests/pageChrome.test.tsx`가 "실제로 붙음"을 렌더로 짝지어 검사하는데, 그 파일은
 * DOM을 렌더하는 컴포넌트만 손으로 골라 import합니다 — 여기 이름을 추가하려면 그 전제
 * (DOM이 없다)가 참인지 먼저 확인하세요.
 *
 * - `ShortcutProvider`(src/shortcuts/ShortcutProvider.tsx): `<Context.Provider>{children}</Context.Provider>`
 *   만 렌더합니다. 감싸는 `<div>`를 추가해 className을 붙일 수는 있지만, 그러면 이 킷을
 *   쓰는 모든 앱에 새 DOM 노드가 하나씩 생깁니다 — 스펙 §8("안 쓰면 영향 0")과 Task 3의
 *   구현을 어기는 변경이라 하지 않습니다. */
const NO_OWN_DOM = new Set(["ShortcutProvider"]);

/* **자기 DOM은 그리는데 자기 클래스가 없는 것.** 위 규칙의 이유는 *"그냥 펼치면 앱이 준
 * 값이 킷의 클래스를 덮는다"* 인데, 덮을 킷 클래스가 **없으면** 그 위험이 없습니다.
 *
 * - `Pressable`(src/controls/Pressable.tsx): 킷의 모든 `<button>`이 지나가는 보장
 *   자리이고 **옷이 없습니다**(옷은 `Button`·탭·사이드바가 각자 입힙니다). className은
 *   `...rest`로 그대로 갑니다. 여기에 클래스를 하나라도 붙이면 킷의 모든 버튼에
 *   딸려 가므로, "클래스가 없다"가 이 컴포넌트의 계약입니다.
 *
 * 주석으로만 적으면 아무도 다시 안 재므로 아래에서 소스로 확인합니다. */
const NO_OWN_CLASS = new Set(["Pressable"]);

describe("내보내는 컴포넌트는 전부 className을 받는다", () => {
  // 전제 — 파싱이 0건이면 아래 단언이 **공허하게** 통과합니다.
  it("컴포넌트를 실제로 찾아냈다", () => {
    expect(components.length).toBeGreaterThan(15);
    expect(components.map((component) => component.name)).toContain("PanelGrid");
  });

  /* **exhaustive 형태입니다** — 빠진 것을 전부 나열해 비교합니다. `every(...)`로 쓰면
   * 실패가 "false"라고만 말하고 어느 컴포넌트인지는 안 알려줍니다. */
  /* **래퍼는 rest 스프레드로 계약을 물려받습니다.** DateWheelPicker·TimeWheelPicker는
   * 자기 DOM을 하나도 안 그리고 기계(WheelPicker)에 rest를 통째로 넘깁니다 — 거기에
   * className을 손으로 다시 적으면 그 자체가 중복이고, 한 글자 빠뜨리면 조용히 안
   * 붙습니다. 그래서 "이름을 적었는가"가 아니라 **"통째로 넘기는가"**를 봅니다.
   *
   * 판정은 셋이 다 참일 때입니다: 시그니처에 rest 파라미터가 있고, 본문이 그것을 펼치고,
   * **자기 DOM 태그가 하나도 없다**(=붙일 자리가 자기한테 없으니 넘기는 것 말고 할 일이
   * 없습니다). 소문자 태그를 그리면서 rest만 펼치는 컴포넌트는 해당 없습니다 — 그때는
   * className을 직접 받아 자기 것과 **합쳐야** 하고, 그냥 펼치면 앱이 준 값이 킷의
   * 클래스를 덮습니다. */
  function inheritsByForwarding(component: { name: string; path: string; signature: string }) {
    const rest = /\.\.\.(\w+)/.exec(component.signature);
    if (!rest) return false;
    const body = componentBody(sources[`../src/${component.path}`], component.name);
    if (!body || OWN_DOM_TAG.test(body)) return false;
    return body.includes(`{...${rest[1]}}`);
  }

  /* 전제 — 이 완화가 **누구에게** 적용되는지 못 박습니다. 0건이면 위 함수가 아무 일도 안
   * 하고 있다는 뜻이고, 그러면 아래 검사는 완화 없이 통과한 것이라 이 완화가 공허합니다. */
  it("rest로 물려받는 래퍼가 실제로 있다", () => {
    const forwarding = components.filter(inheritsByForwarding).map((component) => component.name).sort();
    /* `Button`이 이 목록에 들어온 것은 **의도입니다** — 이제 자기 DOM을 안 그리고
     * `Pressable`에 넘깁니다(그래서 `type="button"` 보장이 한 자리로 모였습니다). */
    expect(forwarding).toEqual(["Button", "DateWheelPicker", "DurationWheelPicker", "TimeWheelPicker"]);
  });

  it("빠진 컴포넌트가 없다", () => {
    const missing = components.filter((component) =>
      !component.signature.includes("className")
      && !NO_OWN_DOM.has(component.name)
      && !NO_OWN_CLASS.has(component.name)
      && !inheritsByForwarding(component));
    expect(missing.map((component) => `${component.name} (${component.path})`)).toEqual([]);
  });

  /* NO_OWN_DOM의 근거("자기 DOM 노드가 없다")가 주석으로만 적혀 있으면 아무도 다시
   * 재지 않습니다 — 이 저장소가 이미 그 모양으로 값을 치른 적이 있습니다("주석에 적은
   * 것은 아무도 다시 재지 않는다"). 그래서 예외로 오른 이름 각각의 소스를 파싱해,
   * 자기 DOM 태그를 실제로 안 그리는지 여기서 다시 잽니다. 나중에 DOM을 그리는
   * 컴포넌트가 예외에 오르면(예: Task 5의 ShortcutSettings — 실제로 DOM을 그리므로
   * 예외 대상이 아닙니다) 여기서 빨개집니다. */
  /* `NO_OWN_CLASS`의 근거("자기 클래스가 없다")도 소스로 다시 잽니다. 누가 `Pressable`에
   * 클래스를 붙이면 여기서 빨개지고, 그게 이 예외가 무효가 되는 순간입니다. */
  it("NO_OWN_CLASS 예외는 실제로 자기 클래스를 붙이지 않는다", () => {
    for (const name of NO_OWN_CLASS) {
      const component = components.find((candidate) => candidate.name === name);
      expect(component, `${name}이 컴포넌트 목록에서 안 잡힘`).toBeTruthy();
      const body = componentBody(sources[`../src/${component!.path}`], name);
      expect(body, `${name}의 함수 본문을 못 찾음`).not.toBe("");
      expect(/className\s*=/.test(body), `${name}이 className을 붙이는데 NO_OWN_CLASS에 올라 있음`).toBe(false);
    }
  });

  it("NO_OWN_DOM 예외는 실제로 자기 DOM 태그를 그리지 않는다", () => {
    for (const name of NO_OWN_DOM) {
      const component = components.find((candidate) => candidate.name === name);
      expect(component, `${name}이 컴포넌트 목록에서 안 잡힘 — 이름을 확인하세요`).toBeTruthy();
      const source = sources[`../src/${component!.path}`];
      const body = componentBody(source, name);
      expect(body, `${name}의 함수 본문을 못 찾음`).not.toBe("");
      expect(OWN_DOM_TAG.test(body), `${name}이 자기 DOM 태그를 그리는데 NO_OWN_DOM에 올라 있음`).toBe(false);
    }
  });
});

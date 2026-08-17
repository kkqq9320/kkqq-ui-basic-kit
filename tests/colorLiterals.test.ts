/// <reference types="vite/client" />

/* **토큰을 거치지 않는 색이 새로 생기지 않게 지킵니다.**
 *
 * 오너 질문: "뱃지 색상은 토큰 설정이 안 된 것 같은데, 이렇게 설정 안 된 게 또 있어?"
 * 세어 보니 뱃지 말고도 **열아홉 곳**이 있었습니다. 뱃지는 고쳤고(`--badge`), 나머지는
 * 아래에 이름으로 적어 둡니다.
 *
 * `tests/themeTokens.test.ts`와 **방향이 반대인 짝**입니다. 그쪽은 "편집기에 노출된
 * 토큰은 CSS가 참조해야 한다"(죽은 토큰 금지), 이쪽은 "CSS의 색은 토큰을 거쳐야 한다"
 * (숨은 리터럴 금지). 둘 다 있어야 양쪽이 안 샙니다.
 *
 * **목록이 썩지 않습니다.** 새 리터럴이 생기면 빨개지고, 목록에 적힌 것을 **고쳐도**
 * 빨개집니다(그때 목록에서 지우면 됩니다). `themeTokens.test.ts`의 `UNDECIDED`가
 * 쓰는 방식과 같습니다.
 *
 * `tokens.css`는 셉니다 — **거기가 리터럴이 있어야 하는 유일한 자리**입니다.
 * `#fff`·`#000`과 세 자리 축약, 그리고 반투명 `rgba()`(그림자·유리 표면)는 팔레트 색이
 * 아니라 효과라서 뺍니다.
 */
import { describe, expect, it } from "vitest";

const cssModules = import.meta.glob("../css/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** 아직 토큰을 안 거치는 색. **줄지 않으면 이 파일은 일을 안 하고 있는 것입니다.** */
const KNOWN: Record<string, string[]> = {
  /* **비었습니다.** 뱃지 하나로 시작해 사이드바 10곳·컨트롤 9곳까지 전부 토큰으로
   * 올라갔습니다(오너 지시). 이 목록이 빈 채로 있는 동안 이 파일은 "새 리터럴 금지"만
   * 하지만, 그게 원래 목적입니다 — 목록이 다시 차면 그건 누군가 색을 토큰 밖에서
   * 정했다는 뜻입니다. */
};

/** 주석과 `tokens.css`(정의부)를 뺀 뒤, 팔레트 색으로 볼 만한 리터럴만 뽑습니다. */
function literalsIn(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...withoutComments.matchAll(/#[0-9a-fA-F]{6}\b/g)]
    .map((match) => match[0].toLowerCase())
    .filter((value) => value !== "#ffffff" && value !== "#000000")
    .sort();
}

const audited = Object.entries(cssModules).filter(([path]) => !path.endsWith("tokens.css"));

describe("CSS의 색은 토큰을 거친다", () => {
  // 전제 — `?raw`가 빈 문자열이면 아래가 전부 공허하게 통과합니다.
  it("CSS 소스를 실제로 읽었다", () => {
    expect(audited.length).toBeGreaterThan(3);
    expect(audited.every(([, source]) => source.length > 200)).toBe(true);
  });

  /* **exhaustive 형태입니다** — `filter(...).toEqual([])`가 아니라 파일별 목록을 통째로
   * 비교합니다. 필터형은 0건에서 공허하게 통과하고, 무엇이 늘었는지도 말해 주지 않습니다
   * (`themeTokens.test.ts`가 같은 이유로 같은 형태를 씁니다). */
  it.each(audited.map(([path]) => path))("%s 에 적어 두지 않은 색 리터럴이 없다", (path) => {
    expect(literalsIn(cssModules[path])).toEqual((KNOWN[path] ?? []).slice().sort());
  });

  /* 뱃지는 오너가 지목해서 이번에 고친 것입니다. **고쳐진 것이 다시 리터럴로 돌아가면**
   * 위 목록 비교가 잡지만, 그 실패 메시지는 "뱃지"라고 말하지 않습니다. 이름으로 한 번 더
   * 못박아 실패가 스스로 설명하게 합니다. */
  it("뱃지 색은 토큰이다", () => {
    expect(cssModules["../css/sidebar.css"]).toMatch(/\.sidebar-nav-count\s*\{[^}]*background:\s*var\(--badge\)/);
    expect(cssModules["../css/tokens.css"]).toMatch(/--badge:\s*#[0-9a-fA-F]{6}/);
  });
});

/* **글자색으로 쓰인 `#fff`·`#000`은 위 검사가 일부러 빼고 있었습니다.**
 *
 * 위 머리말이 그 이유를 적어 뒀습니다 — *"`#fff`·`#000`과 세 자리 축약 … 은 팔레트 색이
 * 아니라 효과라서 뺍니다."* 그림자·유리 표면에서는 맞는 판단이지만, **`color:`로 쓰이면
 * 효과가 아니라 진짜 글자색**입니다. 그 구멍으로 열아홉 곳이 들어와 있었습니다:
 *
 *     강조색 채움 위 글자   일곱 곳  →  `--on-accent`
 *     사이드바의 "지금 여기"  열두 곳  →  `--sidebar-bright`
 *
 * 둘 다 **이름이 없어서** 리터럴이었습니다. 앱이 강조색이나 사이드바 바탕을 밝게 바꾸면
 * 열아홉 곳이 한꺼번에 안 읽히는데 고칠 자리가 없었습니다(`tests/themeTokens.test.ts`의
 * 대비 쌍 검사가 이제 그 짝을 강제합니다).
 */
describe("글자색은 토큰을 거친다", () => {
  /** 아직 이름이 없는 글자색. 위 `KNOWN`과 같은 방식 — 줄지 않으면 이 검사는 일을 안 하는 것입니다. */
  const KNOWN_TEXT: Record<string, number> = {
    /* 모바일 유리 위의 활성 탭 두 곳(`.settings-tabs … button.active`,
     * `.mobile-quick-tab-menu > button.active`). 바탕이 **강조색 채움이 아니라**
     * `color-mix(in srgb, var(--accent) 28%, transparent)` — 흐린 유리 위에 얹힌 28% 틴트라
     * `--on-accent`도 `--sidebar-bright`도 그 뜻이 아닙니다. 이 표면에 역할 이름을 줄지는
     * 아직 안 정했습니다(§16의 "아직 안 지키는 자리"). **몰라서가 아니라 미룬 것**이고,
     * 그 사실이 여기 적혀 있는 것이 요점입니다. */
    "../css/tabs.css": 2,
  };

  const textLiteralsIn = (source: string) =>
    [...source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/color:\s*(#[0-9a-fA-F]{3,8})\b/g)].map((match) => match[1]);

  // 전제 — 정규식이 아무것도 못 잡으면 아래가 전부 공허합니다. 알려진 둘이 실제로 잡혀야 합니다.
  it("글자색 선언을 실제로 읽어냈다", () => {
    expect(Object.values(cssModules).some((source) => /color:\s*var\(--on-accent\)/.test(source))).toBe(true);
    expect(textLiteralsIn(cssModules["../css/tabs.css"]).length).toBe(2);
  });

  it.each(audited.map(([path]) => path))("%s 에 이름 없는 글자색이 없다", (path) => {
    expect(textLiteralsIn(cssModules[path]).length).toBe(KNOWN_TEXT[path] ?? 0);
  });

  /* 이름이 생긴 두 자리를 이름으로 못박습니다 — 위 개수 비교도 잡지만, 그 실패 메시지는
   * "어느 것이 돌아갔는지" 말하지 않습니다. */
  it("강조색 채움 위 글자는 --on-accent다", () => {
    expect(cssModules["../css/controls.css"]).toMatch(/\[data-variant="primary"\] \{[^}]*color:\s*var\(--on-accent\)/);
    expect(cssModules["../css/tokens.css"]).toMatch(/--on-accent:\s*#[0-9a-fA-F]{6}/);
  });

  it("사이드바의 밝은 상태는 --sidebar-bright다", () => {
    expect(cssModules["../css/sidebar.css"]).toMatch(/\.sidebar nav :is\(a, button\)\.active \{[^}]*color:\s*var\(--sidebar-bright\)/);
    expect(cssModules["../css/tokens.css"]).toMatch(/--sidebar-bright:\s*#[0-9a-fA-F]{6}/);
  });
});

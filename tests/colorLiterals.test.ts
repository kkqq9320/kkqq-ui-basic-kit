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
  /* 사이드바가 자기 글자·표면 색을 통째로 들고 있습니다. `--sidebar`(배경)만 토큰이라
   * **배경을 바꿔도 그 위 글자는 안 따라옵니다.** 토큰으로 옮기려면 이름을 몇 개 만들지
   * 부터 정해야 해서(사이드바 글자·흐린 글자·표면·구분선…) 오너 결정으로 남깁니다. */
  "../css/sidebar.css": ["#18192c", "#26273e", "#8585a3", "#8585a3", "#9c9cb8", "#9c9cb8", "#a0a0b9", "#aaaac3", "#cacade", "#dedeee"],
  /* `.error`·`.success`의 라이트·다크 네 쌍과 `.text-button`.
   * **`.error`는 이미 기록된 미결정입니다** — `var(--red)`로 바꾸면 라이트 대비가 정확히
   * 4.50, 다크가 7.61 → 5.67로 떨어지는데 본문이 13px이라 기준이 4.5입니다. 대비를
   * 조용히 깎지 않으려고 남겨 둔 것이고, "옅은 배경 위 작은 글자용" 역할 토큰을 하나 더
   * 만들지 정해야 풀립니다. `.success`도 같은 자리에 있습니다. */
  "../css/controls.css": ["#17665e", "#203b35", "#472a2a", "#9f3f2d", "#a8e3d2", "#aaaaf2", "#e8f6f2", "#ffb5a7", "#fff0ed"],
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

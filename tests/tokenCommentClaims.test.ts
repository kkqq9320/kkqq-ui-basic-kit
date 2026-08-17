/// <reference types="vite/client" />

/* **`tokens.css`의 주석이 "이 토큰은 편집기에 안 내놓는다"고 말하면, 실제로 안 내놓아야 한다.**
 *
 * 실제로 어긋나 있었습니다: `--segmented-track`·`--segmented-chip` 위 주석이 "편집기에는
 * 안 내놓습니다"인데 `src/theme/themeTokens.ts`는 둘 다 내놓고 있었고, 그 위 주석은 정반대로
 * "🔴 **쌍입니다 — 둘을 같이 내놓습니다**(오너 결정 2026-08-13)"였습니다. **한 저장소의 두
 * 파일이 같은 사실을 정면으로 반대로 말한 것**입니다. 결정이 뒤집힐 때 한쪽 주석만 따라간
 * 자리이고, 그 종류는 사람이 다시 안 읽습니다.
 *
 * ⚠️ **일치가 0건이어도 통과합니다 — 그건 공허함이 아니라 "아무도 그런 주장을 안 했다"입니다.**
 * 이 저장소는 "빈 입력으로 만족되는 단언은 테스트가 아니다"를 기록해 두었는데, 그 규칙이
 * 겨냥한 것은 **찾으려던 것을 못 찾고도 초록인 경우**입니다. 여기서 검사 대상은 값이 아니라
 * **주장**이고, 주장이 없으면 지킬 것도 없습니다. 대신 이 파일이 정말 도는지는
 * 뮤테이션으로 확인했습니다(그 문구를 되돌려 놓으면 빨개집니다).
 */
import { describe, expect, it } from "vitest";

import { THEME_TOKEN_GROUPS } from "../src/theme/themeTokens";
import tokensCssSource from "../css/tokens.css?raw";

/** 편집기에 안 내놓는다고 **주장한** 주석. 문구가 바뀌면 여기도 같이 고치세요. */
const CLAIM = "편집기에는 안 내놓습니다";

const exposed = THEME_TOKEN_GROUPS.flatMap((group) => group.tokens).map((token) => token.name);

/** 그 주장 뒤에 처음 나오는 토큰 선언들. 주석은 자기 아래 토큰을 설명하는 자리입니다. */
const claimedHidden = () => {
  const found: string[] = [];
  let at = tokensCssSource.indexOf(CLAIM);
  while (at !== -1) {
    const declaration = /^\s*(--[a-z-]+):/m.exec(tokensCssSource.slice(at));
    if (declaration) found.push(declaration[1]);
    at = tokensCssSource.indexOf(CLAIM, at + CLAIM.length);
  }
  return found;
};

describe("tokens.css의 주석이 편집기 노출을 거짓으로 말하지 않는다", () => {
  it("안 내놓는다고 적힌 토큰은 정말 편집기 목록에 없다", () => {
    expect(claimedHidden().filter((name) => exposed.includes(name))).toEqual([]);
  });
});

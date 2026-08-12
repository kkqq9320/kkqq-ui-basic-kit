/// <reference types="vite/client" />

/* **데모 조작판의 축은 실제로 화면을 움직여야 한다.**
 *
 * 오너가 "요약 카드 배치가 이상하다"고 한 화면을 재다가 잡았습니다: **`남는 폭` 버튼
 * 넷(왼쪽·가운데·양끝·오른쪽)이 아무 일도 하지 않았습니다.** 어느 것을 눌러도
 * `:root`의 `--summary-card-justify`가 `"normal"` 그대로였고, 카드 좌표가 1px도
 * 움직이지 않았습니다(실제 크롬 실측).
 *
 * **킷은 멀쩡했습니다** — 토큰을 손으로 `space-between`으로 박으니 마지막 카드가
 * 1184 → **1210**으로 가서 패널 줄 오른쪽 끝과 정확히 맞았습니다. 죽어 있던 것은
 * 데모의 배선입니다: 토큰을 쓰는 이펙트가 본문에서 `justify`를 읽으면서 의존성
 * 배열에는 `axis`만 적고 있었습니다. 그래서 상태만 바뀌고 토큰은 첫 값에 머물렀습니다.
 *
 * **이 축이 죽어 있었다는 것은 오너가 그 동작을 한 번도 못 봤다는 뜻입니다.**
 * 조작판이 거짓말한 사례가 이 저장소에 이미 여럿이라, 회귀를 검사로 막습니다.
 *
 * ⚠️ **이 파일이 못 보는 것:** 소스가 그렇게 쓰여 있다는 것까지입니다. "버튼을 누르면
 * 카드가 실제로 옮겨간다"는 레이아웃이라 jsdom이 못 봅니다 — 그건 실제 크롬 실측이
 * 근거입니다(위 1184 → 1210).
 */
import { describe, expect, it } from "vitest";

import demoSource from "../demo/main.tsx?raw";

/** `from` 이후 첫 `}, [ … ]);`의 의존성 목록. 문자열로 정규식을 조립하지 않으려고
 *  **인덱스로 자릅니다**(이 저장소가 세 번 밟은 이스케이프 함정). */
const dependenciesAfter = (source: string, from: number) => {
  const open = source.indexOf("}, [", from);
  expect(open).toBeGreaterThan(-1);
  const close = source.indexOf("]", open + 4);
  expect(close).toBeGreaterThan(open);
  return source
    .slice(open + 4, close)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
};

describe("데모 조작판 — 축이 죽어 있지 않다", () => {
  /* 이 앵커가 안 잡히면 아래 판정이 통째로 무의미해집니다. 먼저 못박습니다. */
  it("justify 토큰을 쓰는 자리를 찾을 수 있다", () => {
    expect(demoSource.indexOf('"--summary-card-justify"')).toBeGreaterThan(-1);
  });

  /* ⚠️ 이것이 실제 결함이었습니다. 본문이 `justify`를 읽는데 의존성에 없으면
   * 버튼이 상태만 바꾸고 토큰은 첫 값에 영원히 머뭅니다. */
  it("justify 토큰을 쓰는 이펙트가 justify를 의존성에 적는다", () => {
    const at = demoSource.indexOf('"--summary-card-justify"');

    expect(dependenciesAfter(demoSource, at)).toContain("justify");
  });

  /* 같은 이펙트가 `axis`도 읽습니다 — 한쪽을 고치다 다른 쪽을 떨어뜨리는 것을 막습니다. */
  it("그 이펙트가 axis도 의존성에 적는다", () => {
    const at = demoSource.indexOf('"--summary-card-justify"');

    expect(dependenciesAfter(demoSource, at)).toContain("axis");
  });
});

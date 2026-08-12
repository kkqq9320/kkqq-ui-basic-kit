// @vitest-environment jsdom
/* 저장소가 막힌 환경에서 저장이 앱을 죽이지 않고, 실패를 말해야 한다.
 *
 * 지금 `writeTokenOverrides`는 `try/catch`가 없다 — 읽기는 감싸 놓고 쓰기는 안 감쌌다.
 * 쿠키·사이트 데이터를 전면 차단한 브라우저에서는 `localStorage`에 **접근만 해도**
 * 예외가 나므로, 색 하나를 바꾸는 순간 편집기가 죽는다. */
import { afterEach, describe, expect, it, vi } from "vitest";

import { writeTokenOverrides } from "../src/themeTokens";

afterEach(() => vi.restoreAllMocks());

describe("저장 실패", () => {
  it("저장소가 던져도 예외가 밖으로 나오지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });

    expect(() => writeTokenOverrides("light", { "--accent": "#112233" })).not.toThrow();
  });

  it("저장에 실패하면 false를 돌려준다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });

    expect(writeTokenOverrides("light", { "--accent": "#112233" })).toBe(false);
  });

  it("빈 맵을 지우다 실패해도 false를 돌려준다", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });

    expect(writeTokenOverrides("light", {})).toBe(false);
  });

  it("성공하면 true를 돌려준다", () => {
    expect(writeTokenOverrides("light", { "--accent": "#112233" })).toBe(true);
  });
});

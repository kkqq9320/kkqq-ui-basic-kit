// @vitest-environment jsdom
/* 저장소가 막힌 환경에서 저장이 앱을 죽이지 않고, 실패를 말해야 한다.
 *
 * 지금 `writeTokenOverrides`는 `try/catch`가 없다 — 읽기는 감싸 놓고 쓰기는 안 감쌌다.
 * 쿠키·사이트 데이터를 전면 차단한 브라우저에서는 `localStorage`에 **접근만 해도**
 * 예외가 나므로, 색 하나를 바꾸는 순간 편집기가 죽는다. */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createThemePalette } from "../src/themePalette";
import { THEME_TOKEN_GROUPS, type ThemeTokenGroup } from "../src/themeTokens";
import { writeTokenOverrides } from "../src/themeTokens";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("style");
});

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

/** 앱이 신설한 토큰. 이 계획서의 존재 이유가 이 토큰이 안 사라지게 하는 것이다. */
const APP_GROUP: ThemeTokenGroup = {
  title: "브랜드",
  tokens: [{ name: "--brand-2", label: "브랜드2", description: "앱이 신설한 색" }],
};

describe("팔레트", () => {
  it("만들 때 받은 groups를 그대로 들고 있다", () => {
    const palette = createThemePalette([...THEME_TOKEN_GROUPS, APP_GROUP]);

    expect(palette.groups).toEqual([...THEME_TOKEN_GROUPS, APP_GROUP]);
  });

  it("groups를 평탄화한 tokens를 준다", () => {
    const palette = createThemePalette([APP_GROUP]);

    expect(palette.tokens).toEqual(APP_GROUP.tokens);
  });

  /* ⚠️ 이 하나가 이 Task의 목적이다. 목록을 넘기지 않는 호출은 앱의 토큰을 조용히
   * 버린다(실측: readTokenOverrides("light") → { --accent }만 남음). 팔레트를 지나면
   * 넘길 자리가 없어 그 일이 일어날 수 없다. */
  it("앱이 신설한 토큰을 읽는다", () => {
    localStorage.setItem("themeColors:light", JSON.stringify({ "--accent": "#112233", "--brand-2": "#ff8a3d" }));
    const palette = createThemePalette([...THEME_TOKEN_GROUPS, APP_GROUP]);

    expect(palette.read("light")).toEqual({ "--accent": "#112233", "--brand-2": "#ff8a3d" });
  });

  it("앱이 신설한 토큰을 :root에 적용한다", () => {
    const palette = createThemePalette([...THEME_TOKEN_GROUPS, APP_GROUP]);

    palette.apply("light", { "--brand-2": "#ff8a3d" });

    expect(document.documentElement.style.getPropertyValue("--brand-2")).toBe("#ff8a3d");
  });

  /* 없는 키는 "안 바뀜"이 아니라 "기본값"이다 — 인라인을 지워 CSS가 다시 드러나야 한다.
   * 리셋이 이 경로로 동작하므로, 이게 깨지면 리셋이 안 먹는다. */
  it("맵에 없는 토큰은 인라인 값을 지운다", () => {
    const palette = createThemePalette([...THEME_TOKEN_GROUPS, APP_GROUP]);
    palette.apply("light", { "--brand-2": "#ff8a3d" });
    // ⚠️ 이 줄이 없으면 **공허하다.** 목록을 잊은 apply는 --brand-2를 아예 안 건드리므로
    // 값이 처음부터 ""이고, "지웠다"와 "손댄 적 없다"가 구분되지 않는다.
    expect(document.documentElement.style.getPropertyValue("--brand-2")).toBe("#ff8a3d");

    palette.apply("light", {});

    expect(document.documentElement.style.getPropertyValue("--brand-2")).toBe("");
  });

  it("write는 팔레트를 거쳐도 성공 여부를 돌려준다", () => {
    const palette = createThemePalette([APP_GROUP]);

    expect(palette.write("light", { "--brand-2": "#ff8a3d" })).toBe(true);
  });
});

describe("백업 형식", () => {
  it("저장된 값을 봉투에 담는다", () => {
    localStorage.setItem("themeColors:light", JSON.stringify({ "--brand-2": "#ff8a3d" }));
    localStorage.setItem("themeColors:dark", JSON.stringify({ "--brand-2": "#ffa866" }));
    const palette = createThemePalette([APP_GROUP]);

    expect(palette.serialize()).toEqual({
      version: 1,
      colors: { light: { "--brand-2": "#ff8a3d" }, dark: { "--brand-2": "#ffa866" } },
    });
  });

  /* ⚠️ 인자가 없으면 controlled 앱에서 **빈 백업**이 나온다 — 값이 저장소가 아니라
   * 앱 상태에 있기 때문이다. 백업 기능이 정작 백업이 필요한 앱에서 안 도는 모양이다. */
  it("넘긴 값이 있으면 저장소를 읽지 않는다", () => {
    localStorage.setItem("themeColors:light", JSON.stringify({ "--brand-2": "#000000" }));
    const palette = createThemePalette([APP_GROUP]);

    expect(palette.serialize({ light: { "--brand-2": "#ff8a3d" }, dark: {} })).toEqual({
      version: 1,
      colors: { light: { "--brand-2": "#ff8a3d" }, dark: {} },
    });
  });

  it("왕복하면 같은 값이 나온다", () => {
    const palette = createThemePalette([APP_GROUP]);
    const made = palette.serialize({ light: { "--brand-2": "#ff8a3d" }, dark: {} });

    expect(palette.parse(JSON.parse(JSON.stringify(made)))?.backup).toEqual(made);
  });

  it("모르는 토큰은 버리고 이름을 남긴다", () => {
    const palette = createThemePalette([APP_GROUP]);

    const parsed = palette.parse({ version: 1, colors: { light: { "--brand-2": "#ff8a3d", "--nope": "#123456" }, dark: {} } });

    expect(parsed?.backup.colors.light).toEqual({ "--brand-2": "#ff8a3d" });
  });

  it("버린 이름이 dropped에 담긴다", () => {
    const palette = createThemePalette([APP_GROUP]);

    const parsed = palette.parse({ version: 1, colors: { light: { "--nope": "#123456" }, dark: {} } });

    expect(parsed?.dropped).toEqual(["--nope"]);
  });

  it("색 형식이 아닌 값도 버리고 이름을 남긴다", () => {
    const palette = createThemePalette([APP_GROUP]);

    const parsed = palette.parse({ version: 1, colors: { light: { "--brand-2": "빨강" }, dark: {} } });

    expect(parsed).toEqual({ backup: { version: 1, colors: { light: {}, dark: {} } }, dropped: ["--brand-2"] });
  });

  it("version이 1이 아니면 null이다", () => {
    const palette = createThemePalette([APP_GROUP]);

    expect(palette.parse({ version: 2, colors: { light: {}, dark: {} } })).toBe(null);
  });

  it("봉투 모양이 아니면 null이다", () => {
    const palette = createThemePalette([APP_GROUP]);

    expect([palette.parse("어쩌구"), palette.parse([]), palette.parse({ version: 1 }), palette.parse(null)]).toEqual([null, null, null, null]);
  });

  /* 빈 백업은 "덮어쓴 색이 하나도 없는 정상 백업"이고 복원하면 전부 기본값이 된다.
   * null(= 백업이 아님)과 반드시 구분돼야 한다 — 안 그러면 "모두 초기화"를 복원할 수 없다. */
  it("빈 백업은 null이 아니다", () => {
    const palette = createThemePalette([APP_GROUP]);

    expect(palette.parse({ version: 1, colors: { light: {}, dark: {} } })).toEqual({
      backup: { version: 1, colors: { light: {}, dark: {} } },
      dropped: [],
    });
  });
});

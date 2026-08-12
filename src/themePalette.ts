/* 앱의 토큰 목록을 **한 번만** 묶는 객체.
 *
 * `themeTokens.ts`의 함수들은 전부 `tokens` 인자를 받고 기본값이 킷의 목록입니다.
 * 앱이 자기 토큰을 더하면 **모든 호출부에 그 목록을 다시 넘겨야** 하고, 하나만
 * 빠뜨리면 앱의 색이 말없이 사라집니다(실측: 목록을 안 넘긴 `readTokenOverrides`가
 * `--brand-2`를 버림. 저장소에는 그대로 남아 있어 더 알기 어렵습니다).
 *
 * 팔레트를 지나면 **넘길 자리가 없어** 그 일이 일어날 수 없습니다.
 *
 * 킷 기본 그룹을 자동으로 합치지 않습니다 — 앱이 `[...THEME_TOKEN_GROUPS, ...]`로
 * 명시합니다. 암묵적 병합은 "내 목록에 무엇이 들었는가"를 흐립니다.
 */
import {
  applyTokenOverrides,
  readTokenOverrides,
  writeTokenOverrides,
  type ThemeName,
  type ThemeToken,
  type ThemeTokenGroup,
} from "./themeTokens";

export type ThemePalette = {
  groups: readonly ThemeTokenGroup[];
  tokens: ThemeToken[];
  read(theme: ThemeName): Record<string, string>;
  write(theme: ThemeName, overrides: Record<string, string>): boolean;
  apply(theme: ThemeName, overrides?: Record<string, string>): void;
};

export function createThemePalette(groups: readonly ThemeTokenGroup[]): ThemePalette {
  const tokens = groups.flatMap((group) => group.tokens);
  return {
    groups,
    tokens,
    read: (theme) => readTokenOverrides(theme, tokens),
    write: (theme, overrides) => writeTokenOverrides(theme, overrides),
    apply: (theme, overrides) => applyTokenOverrides(theme, overrides, tokens),
  };
}

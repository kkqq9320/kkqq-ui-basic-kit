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
  normalizeColor,
  readTokenOverrides,
  writeTokenOverrides,
  type ThemeName,
  type ThemeToken,
  type ThemeTokenGroup,
} from "./themeTokens";

const THEMES = ["light", "dark"] as const;

/** 서버·파일로 실어 보낼 봉투. `version`은 형식의 버전이지 킷 버전이 아닙니다. */
export type ThemeColorBackup = {
  version: 1;
  colors: { light: Record<string, string>; dark: Record<string, string> };
};

/** `dropped`에는 **버린 토큰 이름**이 담깁니다. 모르는 이름이거나 색 형식이 아니면
 *  버립니다. 조용히 버리면 사용자는 색이 왜 안 돌아왔는지 알 방법이 없습니다. */
export type ParsedThemeColors = { backup: ThemeColorBackup; dropped: string[] };

export type ThemePalette = {
  groups: readonly ThemeTokenGroup[];
  tokens: ThemeToken[];
  read(theme: ThemeName): Record<string, string>;
  write(theme: ThemeName, overrides: Record<string, string>): boolean;
  apply(theme: ThemeName, overrides?: Record<string, string>): void;
  serialize(colors?: { light?: Record<string, string>; dark?: Record<string, string> }): ThemeColorBackup;
  parse(input: unknown): ParsedThemeColors | null;
  /** 두 테마 값을 저장소엔 둘 다 쓰지만, 화면(`:root`)에는 **넘긴 테마만** 적용합니다.
   *  `:root`는 문서에 하나뿐이라 두 테마를 차례로 적용하면 나중 것이 이겨 앞엣것을
   *  덮습니다 — 실측: 라이트 모드에서 라이트 `{--brand-2:#ff8a3d}` / 다크 `{}`를
   *  복원해도 다크 패스가 마지막에 돌아 `:root`가 `''`로 남았습니다. 그래서 `theme`은
   *  선택 인자가 아니라 필수입니다 — 선택으로 두면 이 버그가 조용히 되살아납니다. */
  applyBackup(backup: ThemeColorBackup, theme: ThemeName): void;
};

/** 봉투의 한 테마 값이 "객체이거나 아예 없거나" 둘 중 하나여야 합니다. 문자열·배열·숫자가
 *  오면 봉투가 아닙니다 — 그걸 조용히 빈 맵으로 바꾸면 `dropped`가 빈 채로 돌아가
 *  "아무것도 안 버렸다"고 거짓말하고, 그 테마는 통째로 기본값이 됩니다. */
const isThemeShaped = (raw: unknown) => raw === undefined || (typeof raw === "object" && raw !== null && !Array.isArray(raw));

function cleanTheme(raw: unknown, known: Set<string>, dropped: string[]): Record<string, string> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const hex = typeof value === "string" ? normalizeColor(value) : null;
    if (known.has(name) && hex) out[name] = hex;
    else dropped.push(name);
  }
  return out;
}

export function createThemePalette(groups: readonly ThemeTokenGroup[]): ThemePalette {
  const tokens = groups.flatMap((group) => group.tokens);
  return {
    groups,
    tokens,
    read: (theme) => readTokenOverrides(theme, tokens),
    write: (theme, overrides) => writeTokenOverrides(theme, overrides),
    apply: (theme, overrides) => applyTokenOverrides(theme, overrides, tokens),
    serialize: (colors) => ({
      version: 1,
      colors: {
        light: colors?.light ?? readTokenOverrides("light", tokens),
        dark: colors?.dark ?? readTokenOverrides("dark", tokens),
      },
    }),
    parse: (input) => {
      if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
      const envelope = input as { version?: unknown; colors?: unknown };
      if (envelope.version !== 1) return null;
      if (typeof envelope.colors !== "object" || envelope.colors === null || Array.isArray(envelope.colors)) return null;
      const source = envelope.colors as Record<string, unknown>;
      if (!isThemeShaped(source.light) || !isThemeShaped(source.dark)) return null;
      const known = new Set(tokens.map((token) => token.name));
      const dropped: string[] = [];
      const colors = {
        light: cleanTheme(source.light, known, dropped),
        dark: cleanTheme(source.dark, known, dropped),
      };
      // 같은 이름이 라이트·다크 양쪽에서 버려지면 dropped에 두 번 들어옵니다 — 그대로
      // 돌려주면 "모르는 색 1개"가 "2개"로 보입니다. 이름 하나당 한 번만 남깁니다.
      return { backup: { version: 1, colors }, dropped: [...new Set(dropped)] };
    },
    applyBackup: (backup, theme) => {
      for (const t of THEMES) {
        const values = backup.colors[t];
        writeTokenOverrides(t, values);
        if (t === theme) applyTokenOverrides(t, values, tokens);
      }
    },
  };
}

/* 사용자가 직접 바꿀 수 있는 색상 토큰.
 *
 * 기본값은 여기 적지 않습니다. tokens.css가 유일한 출처이고 실제 계산된 값을 읽어
 * 씁니다 — 표를 복사해 두면 CSS만 바뀌었을 때 조용히 어긋납니다. 여기 있는 건 어떤
 * 토큰을 노출할지와 사람이 읽을 이름뿐입니다.
 */
export type ThemeName = "light" | "dark";

export type ThemeToken = { name: string; label: string; description: string };
export type ThemeTokenGroup = { title: string; tokens: ThemeToken[] };

export const THEME_TOKEN_GROUPS: ThemeTokenGroup[] = [
  {
    title: "바탕",
    tokens: [
      { name: "--bg", label: "페이지 배경", description: "작업 영역 전체의 바탕" },
      { name: "--surface", label: "카드 배경", description: "패널·다이얼로그·카드" },
      { name: "--surface-soft", label: "보조 배경", description: "카드 안의 옅은 영역" },
      { name: "--input", label: "입력칸 배경", description: "입력·드롭다운·날짜 필드" },
      { name: "--line", label: "테두리", description: "카드와 입력칸의 선" },
    ],
  },
  {
    // 글자를 바탕에서 떼어냅니다 — 배경을 고르는 일과 그 위 글자를 고르는 일은 서로
    // 다른 판단이고, 대비를 볼 때 글자끼리 나란히 보이는 편이 낫습니다(오너 요청).
    title: "글자",
    tokens: [
      { name: "--text", label: "본문 글자", description: "기본 글자색" },
      { name: "--muted", label: "흐린 글자", description: "설명·보조 문구" },
    ],
  },
  {
    title: "강조",
    tokens: [
      { name: "--accent", label: "강조색", description: "선택 상태·주요 버튼·링크" },
      { name: "--accent-soft", label: "강조 배경", description: "선택된 항목의 옅은 배경" },
      { name: "--sidebar", label: "사이드바", description: "왼쪽 메뉴 배경" },
      { name: "--deep", label: "짙은 면", description: "어두운 배경 면" },
    ],
  },
  {
    title: "상태",
    tokens: [
      { name: "--green", label: "초록", description: "성공·양호" },
      { name: "--green-soft", label: "초록 배경", description: "성공 상태의 옅은 배경" },
      { name: "--red", label: "빨강", description: "위험·경고" },
      { name: "--orange", label: "주황", description: "주의" },
      { name: "--orange-soft", label: "주황 배경", description: "주의 상태의 옅은 배경" },
      { name: "--gold", label: "금색", description: "보조 강조" },
      { name: "--badge", label: "뱃지", description: "사이드바 메뉴의 개수 뱃지" },
    ],
  },
];

export const THEME_TOKENS: ThemeToken[] = THEME_TOKEN_GROUPS.flatMap((group) => group.tokens);

const defaultsByTheme = new Map<ThemeName, Record<string, string>>();

/**
 * tokens.css가 정한 기본값을 읽습니다.
 *
 * 두 가지를 잠시 손댔다가 되돌립니다 — 읽기 함수라 부작용이 남으면 안 됩니다:
 *
 * 1. 인라인 덮어쓰기: 기본값을 보려면 걷어내야 합니다. 안 되돌리면 편집 화면이
 *    렌더마다 토큰 기본값을 묻는 탓에 방금 적용한 색이 다음 렌더에서 지워집니다.
 *
 * 2. `data-theme`: **요청한 테마로 잠시 맞춰** 읽습니다. 편집기는 렌더 도중 기본값을
 *    묻는데, 테마를 `data-theme`에 반영하는 effect는 렌더 이후에 돕니다. 그래서 아직
 *    이전 테마가 걸려 있을 때 `theme`의 기본값을 물으면, 이전 테마의 계산값을 이
 *    테마 기본값으로 **캐시**해 버립니다(라이트에서 편집기가 다크 배경색을 보이던
 *    버그). getComputedStyle은 같은 태스크 안에서 동기적으로 재계산되고 페인트는
 *    없으므로 깜빡임도 없습니다.
 */
/*
 * 아래 함수들은 다룰 토큰 목록을 `tokens` 인자로 받고, 기본값은 이 키트의
 * THEME_TOKENS입니다. 소비 프로젝트가 자기 CSS에 새 커스텀 프로퍼티를 정의하고
 * (라이트·다크 둘 다) 자기 THEME_TOKEN_GROUPS(=편집기의 groups)에 항목을 더하면,
 * 그 확장된 목록이 그대로 흘러 편집·저장·적용됩니다 — 키트를 고칠 필요가 없습니다.
 * (편집기는 자기 groups에서 이 목록을 뽑아 넘깁니다. 앱의 테마 적용 effect는
 *  앱 themeTokens의 THEME_TOKENS 기본값을 그대로 씁니다.)
 */
export function readThemeDefaults(theme: ThemeName, tokens: ThemeToken[] = THEME_TOKENS): Record<string, string> {
  // 테마별 캐시를 토큰 단위로 채웁니다(병합식). 그래야 토큰 집합이 커져도 예전
  // 캐시가 새 토큰을 가리지 않습니다.
  const cached = defaultsByTheme.get(theme) ?? {};
  const missing = tokens.filter((token) => !(token.name in cached));
  if (missing.length === 0) return cached;

  const root = document.documentElement;
  const themeBefore = root.dataset.theme;
  root.dataset.theme = theme;
  const inlineBefore = missing.map((token) => [token.name, root.style.getPropertyValue(token.name)] as const);
  for (const [name] of inlineBefore) root.style.removeProperty(name);

  const computed = getComputedStyle(root);
  const read = Object.fromEntries(
    missing.map((token) => [token.name, normalizeColor(computed.getPropertyValue(token.name)) ?? ""]),
  );

  for (const [name, value] of inlineBefore) if (value) root.style.setProperty(name, value);
  if (themeBefore === undefined) delete root.dataset.theme;
  else root.dataset.theme = themeBefore;

  const merged = { ...cached, ...read };
  // 스타일시트가 없는 환경(jsdom)에서는 전부 빈 값이라 캐시하지 않습니다.
  if (Object.values(merged).some(Boolean)) defaultsByTheme.set(theme, merged);
  return merged;
}

export function defaultTokenValue(token: ThemeToken, theme: ThemeName, tokens: ThemeToken[] = THEME_TOKENS) {
  return readThemeDefaults(theme, tokens)[token.name] || "#000000";
}

const storageKey = (theme: ThemeName) => `themeColors:${theme}`;

/** 덮어쓴 값만 담긴 맵. 기본값과 같은 항목은 저장하지 않고, `tokens`에 없는 키는 버립니다. */
export function readTokenOverrides(theme: ThemeName, tokens: ThemeToken[] = THEME_TOKENS): Record<string, string> {
  try {
    const raw = localStorage.getItem(storageKey(theme));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const known = new Set(tokens.map((token) => token.name));
    const entries = Object.entries(parsed).filter(([name, value]) => known.has(name) && typeof value === "string" && normalizeColor(value) !== null);
    return Object.fromEntries(entries.map(([name, value]) => [name, normalizeColor(value as string)!]));
  } catch {
    return {};
  }
}

export function writeTokenOverrides(theme: ThemeName, overrides: Record<string, string>) {
  if (Object.keys(overrides).length === 0) localStorage.removeItem(storageKey(theme));
  else localStorage.setItem(storageKey(theme), JSON.stringify(overrides));
}

/**
 * 덮어쓴 값을 :root에 인라인으로 적용합니다. 덮어쓰지 않은 토큰은 인라인 값을 지워
 * tokens.css의 기본값이 다시 드러나게 합니다 — 테마를 바꿀 때 이전 테마의 값이
 * 남지 않게 하려면 반드시 지워야 합니다.
 */
export function applyTokenOverrides(theme: ThemeName, overrides?: Record<string, string>, tokens: ThemeToken[] = THEME_TOKENS) {
  const resolved = overrides ?? readTokenOverrides(theme, tokens);
  readThemeDefaults(theme, tokens);
  const root = document.documentElement;
  for (const token of tokens) {
    const value = resolved[token.name];
    if (value) root.style.setProperty(token.name, value);
    else root.style.removeProperty(token.name);
  }
}

/**
 * `#abc`, `#aabbcc`, `rgb(1,2,3)`, `1,2,3`, `1 2 3`을 `#aabbcc`로 정규화합니다.
 * 형식이 아니면 null. `<input type="color">`가 6자리 hex만 받으므로 저장도 hex입니다.
 */
export function normalizeColor(input: string): string | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const body = hex[1];
    const full = body.length === 3 ? body.split("").map((character) => character + character).join("") : body;
    return `#${full}`;
  }

  const numbers = text.startsWith("rgb")
    ? /^rgba?\(([^)]+)\)$/.exec(text)?.[1]
    : /^[\d\s,]+$/.test(text) ? text : undefined;
  if (!numbers) return null;

  const parts = numbers.split(/[\s,]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((value) => !Number.isFinite(value) || value < 0 || value > 255)) return null;
  return `#${parts.slice(0, 3).map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

/** `R, G, B` 표시 문자열. */
export function toRgbText(hex: string) {
  const normalized = normalizeColor(hex);
  if (!normalized) return "";
  const [red, green, blue] = [1, 3, 5].map((index) => parseInt(normalized.slice(index, index + 2), 16));
  return `${red}, ${green}, ${blue}`;
}

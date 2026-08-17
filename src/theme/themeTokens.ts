/* 사용자가 직접 바꿀 수 있는 색상 토큰.
 *
 * 기본값은 여기 적지 않습니다. tokens.css가 유일한 출처이고 실제 계산된 값을 읽어
 * 씁니다 — 표를 복사해 두면 CSS만 바뀌었을 때 조용히 어긋납니다. 여기 있는 건 어떤
 * 토큰을 노출할지와 사람이 읽을 이름뿐입니다.
 *
 * ⚠️ **여기 넣는 기준은 "킷 CSS가 그 토큰을 실제로 쓰는가"입니다.** 안 쓰는 토큰을
 * 노출하면 사용자가 색을 고쳐도 화면이 안 바뀝니다 — 그건 결함으로 보입니다.
 * `tests/themeTokens.test.ts`가 예외 없이 그것을 지킵니다.
 * `--deep`·`--gold`가 그래서 빠졌습니다(2026-08-13, 오너 결정). 토큰은 `tokens.css`에
 * 그대로 있으므로 앱이 `var(--deep)`로 쓸 수 있고, 편집까지 하고 싶으면 자기
 * `groups`(또는 `createThemePalette`)에 그 항목을 넣으면 됩니다.
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
      /* 🔴 **쌍입니다 — 둘을 같이 내놓습니다**(오너 결정 2026-08-13).
       * 한동안 이 둘만 편집기에서 빼 뒀는데, 그 위에 얹히는 `--accent-text`는 내놓고
       * 있었습니다. 즉 **대비 쌍의 한쪽만 사용자가 바꿀 수 있는 상태**였습니다 — 글자를
       * 어둡게 바꾸면 칩 위에서 안 읽히는데 바탕을 따라 조정할 방법이 없었습니다.
       *
       * ⚠️ **이 둘은 값보다 관계가 중요합니다** — 칩이 트랙보다 밝아야 "떠 있는" 것으로
       * 읽힙니다(기본값은 16단계). 사용자가 순서를 뒤집으면 그 느낌이 사라지는데, 그건
       * `--accent`를 열어 둔 지금도 이미 같은 종류의 자유입니다. 검사는 **기본값**의
       * 순서와 대비만 지킵니다(`tests/segmentedControl.test.tsx`). */
      { name: "--segmented-track", label: "세그먼트 바탕", description: "선택 묶음의 움푹한 트랙" },
      { name: "--segmented-chip", label: "세그먼트 칩", description: "선택 묶음에서 고른 칸 — 트랙보다 밝아야 떠 보입니다" },
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
      { name: "--accent-text", label: "강조 글자", description: "세그먼트 칩 위의 강조색 글자 — 대비 때문에 다크에서만 밝습니다" },
      { name: "--on-accent", label: "강조색 위 글자", description: "강조색으로 채운 버튼·선택 행 위에 얹히는 글자 — 위의 \"강조 글자\"와 방향이 반대입니다" },
      { name: "--accent-soft", label: "강조 배경", description: "선택된 항목의 옅은 배경" },
      { name: "--link", label: "링크 글자", description: "텍스트 버튼·링크" },
    ],
  },
  {
    /* 사이드바는 라이트에서도 어두운 면이라 이 값들은 두 테마에서 같습니다.
       **여기 오기 전까지는 sidebar.css가 색을 리터럴로 들고 있어서, `--sidebar`를 바꿔도
       그 위 글자는 안 따라왔습니다** — 오너가 화면에서 잡았습니다. */
    title: "사이드바",
    tokens: [
      { name: "--sidebar", label: "사이드바 배경", description: "왼쪽 메뉴 바탕" },
      { name: "--sidebar-bright", label: "사이드바 강조 글자", description: "호버·활성 등 \"지금 여기\" 상태 — 제목보다 한 칸 밝습니다" },
      { name: "--sidebar-strong", label: "사이드바 제목", description: "브랜드 이름" },
      { name: "--sidebar-text", label: "사이드바 글자", description: "메뉴 항목" },
      { name: "--sidebar-muted", label: "사이드바 보조 글자", description: "설명·아이콘 버튼" },
      { name: "--sidebar-dim", label: "사이드바 구역 제목", description: "메뉴 구역 머리말" },
      { name: "--sidebar-surface", label: "사이드바 안 입력칸", description: "사이드바 안 드롭다운 배경" },
      { name: "--sidebar-deep", label: "사이드바 푸터", description: "모바일 사이드바 아래 바탕" },
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
      { name: "--badge", label: "뱃지", description: "사이드바 메뉴의 개수 뱃지" },
      { name: "--on-badge", label: "뱃지 위 글자", description: "개수 뱃지 안의 숫자" },
      /* 메시지 색은 `--red`/`--green`을 그대로 쓰지 않습니다 — 옅은 배경 위 13px 글자라
         기준 대비가 4.5인데 `var(--red)`는 라이트에서 정확히 4.50, 다크에서 5.67까지
         떨어집니다. 그 미결이 이 역할 토큰들로 풀렸습니다(값은 화면 그대로). */
      { name: "--danger-text", label: "오류 글자", description: "오류 메시지 글자" },
      { name: "--danger-surface", label: "오류 배경", description: "오류 메시지 바탕" },
      { name: "--ok-text", label: "성공 글자", description: "성공 메시지 글자" },
      { name: "--ok-surface", label: "성공 배경", description: "성공 메시지 바탕" },
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

/** 저장에 성공하면 `true`. 저장소가 막혀 있으면 `false`이고 **예외를 던지지 않습니다.**
 *
 * 읽기(`readTokenOverrides`)가 이미 `try/catch`인데 쓰기만 안 감싸져 있었습니다.
 * 쿠키·사이트 데이터를 전면 차단한 브라우저에서는 `localStorage`에 **접근만 해도**
 * 예외가 나므로, 그 상태에서 색을 하나 바꾸면 편집기가 죽었습니다. */
export function writeTokenOverrides(theme: ThemeName, overrides: Record<string, string>): boolean {
  try {
    if (Object.keys(overrides).length === 0) localStorage.removeItem(storageKey(theme));
    else localStorage.setItem(storageKey(theme), JSON.stringify(overrides));
    return true;
  } catch {
    return false;
  }
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

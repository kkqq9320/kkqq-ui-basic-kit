/* 색상 토큰 편집기.
 * 필요한 CSS: tokens.css, controls.css, page.css, theme-editor.css
 *
 * 지금 보고 있는 테마의 값을 바꿉니다. 라이트·다크는 따로 저장되므로, 테마가 바뀌면
 * 그 테마의 저장값으로 다시 채워집니다.
 *
 * 색 견본을 누르면 바로 RGB 피커가 열리고, 헥스코드는 늘 보이며 직접 고칠 수 있습니다.
 * 조작 지점은 이 둘뿐입니다 — 카드 자체는 누를 수 없습니다. 카드를 누르면 열리게 하면
 * 목록을 훑다가 스치듯 눌러 팔레트가 바뀝니다.
 *
 * 되돌리기가 둘인 이유:
 *   Undo  직전 값으로 한 단계. 이것도 Reset도 서로를 취소할 수 있습니다.
 *   Reset 스타일시트 기본값으로 한 번에.
 */
import { useEffect, useRef, useState } from "react";

import {
  THEME_TOKEN_GROUPS,
  applyTokenOverrides,
  defaultTokenValue,
  normalizeColor,
  readTokenOverrides,
  toRgbText,
  writeTokenOverrides,
  type ThemeName,
  type ThemeToken,
  type ThemeTokenGroup,
} from "./themeTokens";

/** 이 시간 동안 조용하면 한 번의 조작이 끝난 것으로 봅니다. 피커를 끄는 동안의
 *  간격보다는 넉넉하고, 색을 고르고 다시 잡기까지보다는 짧습니다. */
const EDIT_SESSION_MS = 500;

function UndoIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5-5 5 5 5" /><path d="M4 10h9a6 6 0 0 1 0 12h-3" /></svg>;
}

function ResetIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v5h5" /><path d="M4.5 10a8 8 0 1 1 .5 7" /></svg>;
}

export type ThemeColorEditorProps = {
  theme: ThemeName;
  /** 값이 바뀔 때마다 호출. 저장·적용은 컴포넌트가 이미 끝낸 뒤입니다. */
  onChange?: (overrides: Record<string, string>) => void;
  /* 보여줄 토큰 표. 이름은 tokens.css와 맞아야 하지만 이름표·설명은 프로젝트마다
   * 다릅니다("짙은 면"이 어디 쓰이는지는 그 앱만 압니다). 그래서 컴포넌트는
   * 그대로 쓰고 문구만 갈아 끼울 수 있게 열어 둡니다. */
  groups?: readonly ThemeTokenGroup[];
};

export function ThemeColorEditor({ theme, onChange, groups = THEME_TOKEN_GROUPS }: ThemeColorEditorProps) {
  // groups가 다룰 토큰의 전부입니다. 프로젝트가 groups에 새 토큰을 더하면 읽기·기본값·
  // 적용이 전부 이 목록으로 돌아가, 키트를 안 고쳐도 새 색이 편집·저장·적용됩니다.
  const tokens = groups.flatMap((group) => group.tokens);
  const [overrides, setOverrides] = useState<Record<string, string>>(() => readTokenOverrides(theme, tokens));
  /** 토큰별 직전 값 스택. Undo가 여기서 하나씩 꺼냅니다. */
  const [history, setHistory] = useState<Record<string, string[]>>({});

  /**
   * 헥스 칸에서 **치는 중인 원문**. 한 번에 한 칸만 편집하므로 하나면 충분합니다.
   *
   * ⚠️ **이게 없으면 칸을 지울 수가 없습니다.** 칸이 완전 통제(controlled)라 `value`가
   * 커밋된 색에서만 오는데 `setToken`은 파싱에 실패하면 상태를 안 바꿉니다. 그래서
   * 비우거나 `#12`까지만 친 순간 **React가 옛 값으로 되돌려 그립니다**(실측:
   * `expected '#000000' to be ''`). 견본(`type="color"`)이 멀쩡했던 이유도 같습니다 —
   * 그건 언제나 유효한 `#rrggbb`를 뱉으니 파싱이 실패할 일이 없습니다.
   *
   * **커밋할 때는 지우지 않습니다.** 지우면 `#abc`를 치는 순간 정규화된 `#aabbcc`가
   * 칸에 들어가 커서가 튑니다. 정리는 칸을 떠날 때와 버튼을 누를 때만 합니다.
   */
  const [draft, setDraft] = useState<{ name: string; text: string } | null>(null);

  /* 피커를 끌면 색이 초당 수십 번 바뀝니다. 그걸 그대로 쌓으면 Undo가 끄는 동안의
   * 잔상을 하나씩 되짚게 되므로, 한 번의 조작을 한 칸으로 묶습니다.
   * 세션은 포커스가 떠나거나 잠시 멈추면 끝납니다. */
  const sessionRef = useRef<{ name: string; timer: number } | null>(null);

  function endSession() {
    if (sessionRef.current) window.clearTimeout(sessionRef.current.timer);
    sessionRef.current = null;
  }

  function extendSession(name: string) {
    if (sessionRef.current) window.clearTimeout(sessionRef.current.timer);
    sessionRef.current = { name, timer: window.setTimeout(endSession, EDIT_SESSION_MS) };
  }

  useEffect(() => endSession, []);

  // useState 초기값은 다시 계산되지 않으므로, 테마가 바뀌면 저장값을 다시 읽습니다.
  const [loadedTheme, setLoadedTheme] = useState(theme);
  if (loadedTheme !== theme) {
    setLoadedTheme(theme);
    setOverrides(readTokenOverrides(theme, tokens));
    setHistory({});
    setDraft(null);
    endSession();
  }

  function commit(next: Record<string, string>) {
    setOverrides(next);
    writeTokenOverrides(theme, next);
    applyTokenOverrides(theme, next, tokens);
    onChange?.(next);
  }

  function valueOf(token: ThemeToken, from: Record<string, string> = overrides) {
    return from[token.name] ?? defaultTokenValue(token, theme, tokens);
  }

  /** 기본값과 같으면 저장하지 않는다 — 그래야 기본값이 바뀌면 따라간다. */
  function withValue(token: ThemeToken, hex: string) {
    const next = { ...overrides };
    if (hex === defaultTokenValue(token, theme, tokens)) delete next[token.name];
    else next[token.name] = hex;
    return next;
  }

  function pushHistory(token: ThemeToken, value: string) {
    setHistory((current) => ({ ...current, [token.name]: [...(current[token.name] ?? []), value] }));
  }

  /** 견본·입력칸에서 들어오는 값. 같은 조작이 이어지는 동안은 기록을 남기지 않습니다. */
  function setToken(token: ThemeToken, raw: string) {
    const normalized = normalizeColor(raw);
    // 파싱 안 되는 값은 **적용하지 않습니다.** 여기 한동안 "타이핑을 막지 않습니다"라고
    // 적혀 있었는데 거짓이었습니다 — 칸이 통제 입력이라, 이 return이 곧 타이핑을 막는
    // 동작이었습니다. 지금은 초안(`draft`)이 화면을 맡고 이 함수는 적용만 맡습니다.
    if (!normalized) return;
    const previous = valueOf(token);
    if (normalized === previous) return;
    if (sessionRef.current?.name !== token.name) pushHistory(token, previous);
    extendSession(token.name);
    commit(withValue(token, normalized));
  }

  function undoToken(token: ThemeToken) {
    const stack = history[token.name] ?? [];
    if (!stack.length) return;
    setDraft(null);
    endSession();   // 버튼을 누른 건 별개의 조작이다
    setHistory((current) => ({ ...current, [token.name]: stack.slice(0, -1) }));
    commit(withValue(token, stack[stack.length - 1]));
  }

  function resetToken(token: ThemeToken) {
    const previous = valueOf(token);
    const fallback = defaultTokenValue(token, theme, tokens);
    if (previous === fallback) return;
    setDraft(null);
    endSession();
    pushHistory(token, previous);
    commit(withValue(token, fallback));
  }

  function resetAll() {
    // 지금 값들을 기록해 두면 카드마다 Undo로 되살릴 수 있습니다.
    const changed = Object.keys(overrides);
    if (!changed.length) return;
    setDraft(null);
    endSession();
    setHistory((current) => {
      const next = { ...current };
      for (const name of changed) next[name] = [...(next[name] ?? []), overrides[name]];
      return next;
    });
    commit({});
  }

  const changedCount = Object.keys(overrides).length;
  return <section className="panel theme-color-panel">
    <div className="panel-heading">
      <div><small>COLORS</small><h2>색상</h2></div>
      <button
        type="button"
        className="theme-color-icon-button"
        aria-label={changedCount ? `색상 ${changedCount}개 모두 기본값으로` : "모두 기본값으로"}
        title={changedCount ? `모두 기본값으로 (${changedCount})` : "모두 기본값으로"}
        disabled={changedCount === 0}
        onClick={resetAll}
      ><ResetIcon />{changedCount > 0 && <b>{changedCount}</b>}</button>
    </div>
    <p className="muted-copy">
      지금은 <strong>{theme === "dark" ? "다크" : "라이트"} 모드</strong> 색을 바꾸고 있습니다.
      색 견본을 눌러 고르거나 <code>#575bd4</code> · <code>87, 91, 212</code> 형식으로 입력하세요.
    </p>
    {groups.map((group) => <div className="theme-color-group" key={group.title}>
      <h3>{group.title}</h3>
      <div className="theme-color-list">
        {group.tokens.map((token) => {
          const fallback = defaultTokenValue(token, theme, tokens);
          const value = valueOf(token);
          const changed = Boolean(overrides[token.name]);
          return <div className="theme-color-card" key={token.name}>
            <input
              type="color"
              className="theme-color-swatch"
              value={value}
              aria-label={`${token.label} 색상 선택`}
              title="눌러서 색 고르기"
              /* 견본으로 고르면 초안은 버립니다 — 안 그러면 헥스 칸이 치다 만 글자를
                 계속 보여, 화면의 글자와 실제 색이 갈라진 채로 남습니다. */
              onChange={(event) => { setDraft(null); setToken(token, event.target.value); }}
              onBlur={endSession}
            />
            <span className="theme-color-copy">
              <strong>{token.label}{changed && <em className="theme-color-changed" title={`기본값 ${fallback}`}>변경됨</em>}</strong>
              <small>{token.name} · {toRgbText(value)}</small>
            </span>
            <span className="theme-color-actions">
              <button
                type="button"
                className="theme-color-icon-button"
                aria-label={`${token.label} 직전 값으로`}
                title="직전 값으로"
                disabled={!history[token.name]?.length}
                onClick={() => undoToken(token)}
              ><UndoIcon /></button>
              <button
                type="button"
                className="theme-color-icon-button"
                aria-label={`${token.label} 기본값으로`}
                title={`기본값 ${fallback}`}
                disabled={!changed}
                onClick={() => resetToken(token)}
              ><ResetIcon /></button>
            </span>
            {/* 치는 중에는 초안을, 아니면 커밋된 값을 보입니다 — 초안 없이 커밋된 값만
                걸면 파싱에 실패하는 순간 되돌려 그려져 지울 수가 없습니다(초안 선언부 참고). */}
            <input
              className="theme-color-text"
              value={draft?.name === token.name ? draft.text : value}
              aria-label={`${token.label} 색상 값`}
              spellCheck={false}
              onChange={(event) => { setDraft({ name: token.name, text: event.target.value }); setToken(token, event.target.value); }}
              onBlur={() => { setDraft(null); endSession(); }}
            />
          </div>;
        })}
      </div>
    </div>)}
  </section>;
}

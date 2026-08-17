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
import { useEffect, useRef, useState, type CSSProperties} from "react";

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
import { type ThemePalette } from "./themePalette";

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
  /** 앱의 토큰 목록을 묶은 팔레트. 넘기면 이 편집기의 목록·읽기·쓰기·적용이 전부
   *  팔레트의 것이 됩니다. `groups`와 둘 다 오면 이쪽이 이깁니다.
   *  넘기지 않으면 지금까지와 같습니다. */
  palette?: ThemePalette;
  /** 이 편집기 **하나의** 색상 카드 최소 폭. 전역 `--color-card-min`보다 우선합니다.
   *  `PanelGrid`·`FieldGrid`·`SummaryGrid`의 `min`과 같은 뜻입니다. */
  cardMin?: string;
  /** 색상 카드가 커질 수 있는 최대 폭. 안 주면 남는 폭을 나눠 가집니다(`1fr`) —
   *  **`cardMin`만으로는 카드를 줄일 수 없습니다.** */
  cardMax?: string;
  /** 덮어쓴 색을 **앱이 소유**할 때 넘깁니다. 넘기면 편집기는 **저장하지 않고**
   *  적용과 알림만 합니다 — 로그인해서 서버에서 받아 온 팔레트를 그대로 넘기면 됩니다.
   *  안 넘기면 지금까지와 같습니다(킷이 읽고 씁니다).
   *
   * ⚠️ **이 맵은 그 테마의 덮어쓰기 전체입니다. 패치가 아닙니다** — 없는 키는
   *  "안 바뀜"이 아니라 "기본값"입니다. 앱은 통째로 교체해 저장해야 하고, 병합하면
   *  리셋만 영영 안 먹습니다.
   *
   * ⚠️ **`onChange`가 준 맵을 반드시 이 프롭으로 되먹여야 합니다.** controlled에서는
   *  편집기가 자기 사본을 갖지 않고 매 조작을 이 프롭에서 그대로 계산합니다 — 되먹이지
   *  않으면 화면은 편집기가 손댄 첫 값에 얼어붙고, 그 다음 조작은 그 값을 잊은 맵으로
   *  나옵니다. */
  overrides?: Record<string, string>;
  /** 편집 **세션이 끝날 때** 한 번 불립니다 — 포커스가 떠나거나, 버튼을 누르거나,
   *  500ms 쉬면 끝납니다. 피커를 끄는 동안은 안 불립니다.
   *
   *  `onChange`는 매 변경이라 미리 보기·실시간 적용용이고, 서버로 보내는 것은 이쪽입니다.
   *  경계를 새로 만들지 않고 **Undo가 한 칸을 묶는 그 경계**를 그대로 씁니다 —
   *  사용자가 이미 "한 번의 편집"으로 느끼는 지점입니다.
   *
   * ⚠️ `onChange`와 같은 맵입니다 — 그 테마의 덮어쓰기 **전체**이지 패치가 아닙니다. */
  onCommit?: (overrides: Record<string, string>) => void;
  /** 앱이 이 편집기 안을 겨눌 때의 출구. `Panel`의 것과 같은 뜻입니다.
   *
   * **이게 없어서 앱은 색상 카드에 높이조차 줄 수 없었습니다** — 편집기가 자기 패널을
   * 직접 렌더하므로 바깥에서 감싸도 안쪽에 닿지 못합니다. 카드 폭은 `--color-card-min`
   * 토큰으로 정하고, 높이처럼 토큰이 없는 것은 이 클래스로 겨누세요:
   *
   * ```css
   * .my-editor .theme-color-card { min-height: 96px; }
   * ```
   */
  className?: string;
};

export function ThemeColorEditor({ theme, onChange, palette, groups = THEME_TOKEN_GROUPS, className = "", cardMin, cardMax, overrides, onCommit }: ThemeColorEditorProps) {
  // groups가 다룰 토큰의 전부입니다. 프로젝트가 groups에 새 토큰을 더하면 읽기·기본값·
  // 적용이 전부 이 목록으로 돌아가, 키트를 안 고쳐도 새 색이 편집·저장·적용됩니다.
  // palette가 오면 groups 대신 그쪽을 씁니다 — 둘 다 오면 palette가 이깁니다.
  const activeGroups = palette ? palette.groups : groups;
  const tokens = activeGroups.flatMap((group) => group.tokens);

  /* 읽기·쓰기·적용은 전부 이 셋을 지납니다. 팔레트가 오면 팔레트의 것을, 없으면 킷의 것을
   * 씁니다.
   *
   * ⚠️ 우회해서 킷 함수를 직접 부르는 자리를 만들지 마세요. 지금 팔레트는 킷 함수로 그대로
   * 넘기는 통과 함수라 **당장은 동작이 같아 보이지만**, 앱이 자기 read/write/apply를 가진
   * 팔레트를 넘기는 순간 그 경로만 앱을 건너뜁니다. `tests/ThemeColorEditor.test.tsx`의
   * "편집기는 팔레트의 메서드를 지난다"가 이것을 못박습니다. */
  const readOverrides = (forTheme: ThemeName) => (palette ? palette.read(forTheme) : readTokenOverrides(forTheme, tokens));
  const writeOverrides = (forTheme: ThemeName, next: Record<string, string>) => (palette ? palette.write(forTheme, next) : writeTokenOverrides(forTheme, next));
  const applyOverrides = (forTheme: ThemeName, next: Record<string, string>) => (palette ? palette.apply(forTheme, next) : applyTokenOverrides(forTheme, next, tokens));

  /* overrides가 오면(빈 객체 `{}`도 포함) 앱이 저장소를 소유합니다 — 참 값 검사가 아니라
   * undefined 검사인 이유입니다. `{}`는 "덮어쓰기가 하나도 없다"는 뜻이지 "안 넘겼다"가
   * 아닙니다. controlled일 때는 편집기가 자기 사본을 갖지 않습니다 — 가지면 다음 렌더에서
   * 앱의 값과 갈라집니다. */
  const controlled = overrides !== undefined;
  const [ownOverrides, setOwnOverrides] = useState<Record<string, string>>(() => (controlled ? {} : readOverrides(theme)));
  const current = controlled ? overrides : ownOverrides;
  /** `commit`이 넣는 최신 값. 세션이 끝날 때 `onCommit`에 이 값을 넘깁니다. */
  const latestRef = useRef<Record<string, string>>(current);
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

  /** 세션이 끝나면 "손을 둔" 것이므로 앱에 알립니다.
   *
   * ⚠️ **`notify`가 필요한 이유:** 버튼 경로(Undo·Reset·모두 초기화)는 자기 변경을
   * 커밋하기 **전에** 이전 세션을 닫습니다. 거기서 알리면 **아직 커밋 안 된 낡은 값**으로
   * 한 번, 커밋 뒤에 또 한 번 — 두 번 불립니다. 그리고 언마운트 정리에서 알리면 앱이
   * 사라지는 컴포넌트의 콜백으로 상태를 건드리게 됩니다. 그 둘은 끄고 부릅니다. */
  function endSession(notify = true) {
    const had = sessionRef.current !== null;
    if (sessionRef.current) window.clearTimeout(sessionRef.current.timer);
    sessionRef.current = null;
    if (had && notify) onCommit?.(latestRef.current);
  }

  function extendSession(name: string) {
    if (sessionRef.current) window.clearTimeout(sessionRef.current.timer);
    sessionRef.current = { name, timer: window.setTimeout(() => endSession(), EDIT_SESSION_MS) };
  }

  useEffect(() => () => endSession(false), []);

  // useState 초기값은 다시 계산되지 않으므로, 테마가 바뀌면 저장값을 다시 읽습니다.
  const [loadedTheme, setLoadedTheme] = useState(theme);
  if (loadedTheme !== theme) {
    /* ⚠️ 이 줄은 controlled에서도 **반드시** 돌아야 합니다. 아래 `if (!controlled)` 안으로
     * 옮기면 loadedTheme이 갱신되지 않아 이 조건이 매 렌더마다 참이고, 아래 setHistory·
     * setDraft가 계속 불려 "Too many re-renders"가 납니다. controlled에서 건너뛸 것은
     * 저장소를 다시 읽는 줄 하나뿐입니다. */
    setLoadedTheme(theme);
    // controlled일 때는 앱이 이 테마의 값을 이미 overrides로 넘기고 있습니다 — 저장소를
    // 다시 읽으면 그 값을 덮어써 앱과 갈라집니다. undo 기록·초안·세션은 테마와 함께
    // 사는 것이 아니라 "지금 만지고 있던 것"과 함께 살므로 controlled 여부와 무관하게
    // 리셋합니다.
    if (!controlled) setOwnOverrides(readOverrides(theme));
    setHistory({});
    setDraft(null);
    endSession(false); // 테마 전환이지 편집이 아니다
  }

  function commit(next: Record<string, string>) {
    if (!controlled) {
      setOwnOverrides(next);
      writeOverrides(theme, next);
    }
    applyOverrides(theme, next);
    onChange?.(next);
    latestRef.current = next;
  }

  function valueOf(token: ThemeToken, from: Record<string, string> = current) {
    return from[token.name] ?? defaultTokenValue(token, theme, tokens);
  }

  /** 기본값과 같으면 저장하지 않는다 — 그래야 기본값이 바뀌면 따라간다. */
  function withValue(token: ThemeToken, hex: string) {
    const next = { ...current };
    if (hex === defaultTokenValue(token, theme, tokens)) delete next[token.name];
    else next[token.name] = hex;
    return next;
  }

  function pushHistory(token: ThemeToken, value: string) {
    setHistory((history) => ({ ...history, [token.name]: [...(history[token.name] ?? []), value] }));
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
    endSession(false);   // 버튼을 누른 건 별개의 조작이다 — 자기 커밋 전에 알리지 않는다
    setHistory((current) => ({ ...current, [token.name]: stack.slice(0, -1) }));
    const next = withValue(token, stack[stack.length - 1]);
    commit(next);
    onCommit?.(next);
  }

  function resetToken(token: ThemeToken) {
    const previous = valueOf(token);
    const fallback = defaultTokenValue(token, theme, tokens);
    if (previous === fallback) return;
    setDraft(null);
    endSession(false);
    pushHistory(token, previous);
    const next = withValue(token, fallback);
    commit(next);
    onCommit?.(next);
  }

  function resetAll() {
    // 지금 값들을 기록해 두면 카드마다 Undo로 되살릴 수 있습니다.
    const changed = Object.keys(current);
    if (!changed.length) return;
    setDraft(null);
    endSession(false);
    setHistory((history) => {
      const next = { ...history };
      for (const name of changed) next[name] = [...(next[name] ?? []), current[name]];
      return next;
    });
    commit({});
    onCommit?.({});
  }

  const changedCount = Object.keys(current).length;
  return <section className={`panel theme-color-panel ${className}`.trim()} style={cardMin || cardMax ? ({ ...(cardMin ? { "--color-card-min": cardMin } : {}), ...(cardMax ? { "--color-card-max": cardMax } : {}) } as CSSProperties) : undefined}>
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
    {activeGroups.map((group) => <div className="theme-color-group" key={group.title}>
      <h3>{group.title}</h3>
      <div className="theme-color-list">
        {group.tokens.map((token) => {
          const fallback = defaultTokenValue(token, theme, tokens);
          const value = valueOf(token);
          const changed = Boolean(current[token.name]);
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
              onBlur={() => endSession()}
            />
            <span className="theme-color-copy">
              {/* ⚠️ 이름을 `span`으로 감쌉니다. CSS의 말줄임 규칙이 `strong > :first-child`
                  인데 `{token.label}`은 **텍스트 노드**라 그 선택자에 안 걸렸습니다 —
                  실제로 걸려 있던 것은 `변경됨` 칩이었고, 이름은 보호를 못 받아 좁은
                  카드에서 두 줄로 쪼개졌습니다(오너 스크린샷의 "뱃/지"). */}
              <strong><span title={token.label}>{token.label}</span>{changed && <em className="theme-color-changed" title={`기본값 ${fallback}`}>변경됨</em>}</strong>
              {/* RGB는 아래 칸이 **고칠 수 있는 값**으로 보여 줍니다. 여기 같이 두면 같은
                  숫자가 한 카드에 두 번 나오고, 그중 하나만 못 고쳐 오해를 만듭니다 —
                  오너가 "rgb를 넣을 방법이 없다"고 한 것이 정확히 그 오해였습니다. */}
              <small>{token.name}</small>
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
            {/* **형식 표시는 항상 보여야 합니다.** placeholder는 칸이 빈 순간에만 뜨는데,
                이 칸은 늘 값이 차 있어서 사실상 안 보입니다. 그리고 카드 1행에 읽기 전용
                `--bg · 16, 17, 25`가 있어, 고칠 수 있는 칸은 헥스 전용으로 **보입니다** —
                오너가 "rgb를 넣을 방법이 없다"고 한 것이 그 오해입니다(파서는 처음부터
                `87,11,11`·`87 111 122`·`87, 11, 122`·`rgb(255,255,255)`를 전부 받습니다).
                그래서 칸 옆에 붙박이 표시를 답니다. */}
            {/* **RGB 칸이 위, HEX 칸이 아래.** 둘 다 같은 `setToken`으로 들어가고, 파서가
                형식을 알아서 가립니다 — 칸을 나눈 것은 **어디에 무엇을 붙여넣을지**를
                눈으로 알 수 있게 하려는 것뿐입니다(오너 요청).
                RGB 칸은 값이 바뀌면 늘 `R, G, B`로 되돌아옵니다. 치는 도중에는 초안이
                맡으므로(`draft`) 중간 글자가 튕기지 않습니다 — 헥스 칸과 같은 장치입니다. */}
            <label className="theme-color-entry">
              <small aria-hidden="true">RGB</small>
              <input
                className="theme-color-text"
                value={draft?.name === `${token.name}:rgb` ? draft.text : toRgbText(value)}
                aria-label={`${token.label} RGB 값`}
                placeholder="87, 91, 212"
                title="R, G, B — 87, 91, 212 / 87 91 212 / rgb(87, 91, 212) 다 됩니다"
                spellCheck={false}
                onChange={(event) => { setDraft({ name: `${token.name}:rgb`, text: event.target.value }); setToken(token, event.target.value); }}
                onBlur={() => { setDraft(null); endSession(); }}
              />
            </label>
            <label className="theme-color-entry">
              <small aria-hidden="true">HEX</small>
              <input
              className="theme-color-text"
              value={draft?.name === token.name ? draft.text : value}
              aria-label={`${token.label} 색상 값`}
              /* 이 칸은 **처음부터 RGB를 받았습니다**(`normalizeColor`가 `rgb(…)`·`rgba(…)`·
                 맨숫자 `87, 91, 212`를 전부 파싱합니다). 그런데 그걸 아는 방법이 위 머리말
                 한 줄뿐이라, 카드 열일곱 장을 스크롤한 자리에서는 보이지 않았습니다 —
                 오너가 "rgb도 설정할 수 있어야 되는데"라고 한 것이 그 증거입니다.
                 **기능이 아니라 발견 가능성의 문제였으므로 안내를 쓰는 자리로 옮깁니다.**
                 placeholder는 칸을 비웠을 때만 보이는데, 그 순간이 정확히 형식을 알고
                 싶은 순간입니다. 늘 보이는 쪽은 title이 맡습니다. */
              placeholder="#575bd4"
              title="헥스 — #575bd4 (이 칸도 RGB를 받습니다)"
              spellCheck={false}
              onChange={(event) => { setDraft({ name: token.name, text: event.target.value }); setToken(token, event.target.value); }}
              onBlur={() => { setDraft(null); endSession(); }}
              />
            </label>
          </div>;
        })}
      </div>
    </div>)}
  </section>;
}

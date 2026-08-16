/* 데모 겸 CSS 누락 확인용 페이지. 다른 프로젝트로 복사할 때는 필요 없습니다.
 * 실행: design-system 폴더에서 node_modules/.bin/vite → http://localhost:5273
 */
import { StrictMode, useEffect, useState, useSyncExternalStore, type ReactElement } from "react";
import { createRoot } from "react-dom/client";

import "../css/index.css";
import "./demo.css";
import { EventTracePanel } from "./EventTracePanel";
import { logTraceNote } from "./eventTrace";
import { clearProbeLog, historyProbeEnabled, installHistoryProbe, logProbe, readProbeLog } from "./historyProbe";
import { preservingScroll } from "./preservingScroll";

// React보다 먼저 설치해야 첫 줄이 "페이지 로드"로 남습니다.
installHistoryProbe();
import {
  AppShell,
  AutoGrowTextarea,
  DateWheelPicker,
  TimeWheelPicker,
  DurationWheelPicker,
  Dialog,
  DialogActions,
  DialogHeading,
  MobilePageTabs,
  MobilePageTabsContext,
  MobileQuickBar,
  Panel,
  PanelGrid,
  FieldGrid,
  PageHeader,
  SectionHeading,
  SectionTabs,
  Select,
  Sidebar,
  ThemeColorEditor,
  SummaryCard,
  SummaryGrid,
  useMobilePageTabs,
  useScrollDirectionHidden,
  useVirtualKeyboardOpen,
  THEME_TOKEN_GROUPS,
  createThemePalette,
  BARE_KEY_SCOPE_ATTR,
  ShortcutProvider,
  ShortcutSettings,
  SIDEBAR_TOGGLE_ID,
  createShortcutStorage,
  useShortcutRegistry,
  displayCombo,
  sidebarToggleAction,
  getHourFormat,
  setHourFormat,
  subscribeHourFormat,
  getWheelRowsPerSide,
  setWheelRowsPerSide,
  subscribeWheelRowsPerSide,
  SegmentedControl,
} from "../src";

/** 사이드바 토글의 **앱** 기본 조합. 킷의 기본은 여전히 `null`입니다(단축키 설계 스펙
 * §3.2) — 이 데모(앱)가 `sidebarToggleAction`의 `defaultCombo` 옵션으로 정합니다.
 * `overrides`(또는 아래 `shortcutStorage`)는 사용자가 실제로 바꾼 것만 담습니다(§7.1). */
const SIDEBAR_DEFAULT_COMBO = "Ctrl+Backslash";

/** 단축키 덮어쓰기를 **킷이** localStorage에 저장하게 합니다(Task 7, 스펙 §7).
 * `ShortcutProvider`에 `overrides` 대신 이걸 넘기면 uncontrolled입니다 — 마운트 때
 * 읽고, `ShortcutSettings`가 녹음·지우기를 `registry.setBinding`으로 커밋할 때마다
 * 씁니다. **이전 데모는 `useState`로만 들고 있어 새로고침하면 사라졌습니다** — 이제
 * `localStorage`(`shortcutBindings` 키)에 남습니다. */
const shortcutStorage = createShortcutStorage();

/** 데모가 **자기 앱 색으로** 신설한 토큰. `demo.css`가 라이트·다크를 둘 다 정의하고
 *  `.demo-brand-chip`이 실제로 씁니다 — 안 쓰는 토큰은 편집기에 얹지 않습니다. */
const DEMO_GROUP = {
  title: "데모 앱 색",
  tokens: [{ name: "--demo-brand", label: "데모 브랜드", description: "데모가 신설한 앱 전용 색 — 아래 칩에 쓰입니다" }],
};

/* ⚠️ **이 한 줄이 팔레트의 존재 이유입니다.** 예전 데모는 테마를 바꿀 때
 * `applyTokenOverrides(theme)`를 목록 없이 불렀습니다. 킷 기본 목록만 도는 호출이라
 * `--demo-brand`는 **저장소에 남은 채 화면에서만** 사라집니다. 팔레트를 지나면 목록을
 * 넘길 자리가 아예 없어 그 일이 일어날 수 없습니다. */
const demoPalette = createThemePalette([...THEME_TOKEN_GROUPS, DEMO_GROUP]);

/** 지금 바인딩된 사이드바 조합을 화면 문구용으로 꺼냅니다. `useShortcutRegistry`는
 * `ShortcutProvider`의 **자손**에서만 실제 레지스트리를 봅니다 — `Demo`는 그
 * Provider를 그리는 쪽(부모)이라 `Demo` 본문에서 바로 부르면 기본값(빈 레지스트리,
 * `bindingOf`가 항상 `null`)만 보이므로, 화면에 쓰는 자리마다 이 훅을 쓰는 작은
 * 컴포넌트로 뗍니다. bindingOf는 이미 정규화된 문자열을 돌려주므로(§4), 여기서
 * `normalizeCombo`를 다시 부를 필요가 없습니다 — 우선순위(저장값 vs 기본값)의 정의가
 * `bindingOf` 한 곳에만 있습니다. */
function useSidebarCombo(): string | null {
  return useShortcutRegistry().bindingOf(SIDEBAR_TOGGLE_ID);
}

/** 페이지 머리말 아래의 한 줄짜리 단축키 안내. */
function SidebarComboLine() {
  const combo = useSidebarCombo();
  return <p className="muted-copy">사이드바 접기/펴기 단축키: <strong>{combo ? displayCombo(combo) : "없음"}</strong></p>;
}

/** "단축키" 패널 맨 위 설명문. `storage`(Task 7) 배선을 문장으로도 확인할 수 있게,
 *  지금 바인딩과 그 저장 위치를 실제 값에서 파생시켜 보여 줍니다. */
function ShortcutPanelIntro() {
  const combo = useSidebarCombo();
  return <p className="muted-copy">
    {combo
      ? <>사이드바 접기/펴기가 <strong>{displayCombo(combo)}</strong>에 걸려 있습니다.</>
      : <>사이드바 접기/펴기에 지금 걸린 조합이 <strong>없음</strong>입니다 — 아래에서 새로 녹음해 보세요.</>}{" "}
    킷의 기본값은 여전히 <code>defaultCombo: null</code>이고(설계 스펙 §3.2),
    처음 걸려 있던 조합은 킷이 아니라 <strong>이 데모(앱)</strong>가
    <code>sidebarToggleAction</code>의 <code>defaultCombo</code> 옵션으로
    정했습니다. 아래에서 다시 녹음하거나 지우면 <code>ShortcutProvider</code>의{" "}
    <code>storage</code>(<code>createShortcutStorage()</code>, Task 7)가{" "}
    <code>localStorage</code>(<code>shortcutBindings</code> 키)에 씁니다 —{" "}
    <strong>사용자가 실제로 바꾼 것만</strong> 담기므로(설계 스펙 §7.1) 지우면
    기본값으로 되돌아가지 않고 "조합 없음"이 됩니다. <strong>이제 새로고침해도
    남습니다</strong> — 브라우저의 다른 탭에서 바꿔도 이 탭이 따라옵니다.
  </p>;
}

/** **IME 조합 중에 수식어 단축키가 어떻게 되는가**를 잡는 자리(단축키 설계 스펙 §10 미검증).
 *
 * ⚠️ **에뮬레이션으로는 못 잽니다** — 한/영 전환이 필요합니다. 이 패널은 오너가 실제
 * 키보드에서 한 번 재현하고 트레이스를 그대로 읽어 가라고 있는 것입니다.
 *
 * **질문을 좁혀 둡니다.** 조합(composition)은 텍스트 입력에 포커스가 있을 때만
 * 일어나므로 **맨 키는 규칙 4가 이미 막습니다** — 노출은 규칙 2로 어디서나 걸리는
 * **수식어 조합** 하나뿐입니다. 그래서 물어야 할 것은 둘입니다:
 *
 *   (1) 조합 중 keydown이 `code`를 제대로 달고 오는가  ← 스펙에 적힌 질문
 *   (2) 발사되면 규칙 6의 `preventDefault()`가 **조합 중인 글자를 깨뜨리는가**
 *
 * **(2)는 스펙에 없던 질문입니다.** 그런데 사용자가 치던 "가"가 사라지는 쪽이 (1)보다
 * 아픕니다. 재고 나서 정합니다 — 추측으로 `isComposing` 가드를 먼저 넣지 않습니다. */
function ImeCapturePanel() {
  const combo = useSidebarCombo();
  const [text, setText] = useState("");
  return <Panel title="IME 확인" hint="IME">
    <p className="muted-copy">
      한글 조합 중에 수식어 단축키가 걸리면 어떻게 되는지 잡는 자리입니다.
      지금 사이드바 조합은 <strong>{combo ? displayCombo(combo) : "없음"}</strong>입니다
      {combo ? null : <> — <strong>먼저 위 "단축키" 패널에서 수식어 조합을 하나 녹음하세요.</strong></>}.
    </p>
    <FieldGrid>
      <label>조합할 칸<input
        placeholder="한글로 전환한 뒤 여기에"
        value={text}
        onChange={(event) => setText(event.target.value)}
      /></label>
    </FieldGrid>
    <ol className="muted-copy" style={{ paddingLeft: "1.2em" }}>
      <li>아래 <strong>여기부터</strong>를 누릅니다 — 트레이스에 표시가 하나 남아 그 뒤만 읽으면 됩니다.</li>
      <li><strong>한글로 전환</strong>하고 위 칸에 <strong><code>ㄱ</code> 하나만</strong> 칩니다.
        <strong>확정하지 말고</strong>(Space·Enter 누르지 말고) 멈춥니다.</li>
      <li>그 상태에서 <strong>{combo ? displayCombo(combo) : "그 조합"}</strong>을 누릅니다.</li>
      <li>화면에서 <strong>치던 글자가 살아 있는지</strong> 보고, 사이드바가 접혔는지 봅니다.</li>
      <li>트레이스 패널을 열어 그 keydown 줄의 <code>ime=</code> · <code>code=</code> ·{" "}
        <code>keyCode=</code>를 그대로 가져옵니다.</li>
    </ol>
    <div className="button-row" style={{ marginTop: 16 }}>
      <button type="button" className="secondary-button" onClick={() => logTraceNote("IME 확인 — 여기부터")}>
        여기부터
      </button>
      <button type="button" className="secondary-button" onClick={() => setText("")}>칸 비우기</button>
    </div>
  </Panel>;
}

/** ?debug=1 일 때만 보이는 history 기록판. 콘솔을 열 필요가 없게 하려는 것입니다. */
function HistoryLogPanel() {
  const [lines, setLines] = useState(readProbeLog);
  useEffect(() => {
    const update = () => setLines(readProbeLog());
    window.addEventListener("ds-history-log", update);
    return () => window.removeEventListener("ds-history-log", update);
  }, []);
  return <Panel title="history 기록" hint="DEBUG" actions={<>
    <button type="button" className="secondary-button" onClick={() => { navigator.clipboard?.writeText(lines.join("\n")); }}>복사</button>
    <button type="button" className="secondary-button" onClick={() => { clearProbeLog(); setLines([]); }}>지우기</button>
  </>}>
    <p className="muted-copy">뒤로가기로 페이지를 나갔다 돌아와도 남아 있습니다. 아래 내용을 그대로 붙여 주세요.</p>
    <pre className="demo-log">{lines.length ? lines.join("\n") : "(아직 기록 없음)"}</pre>
  </Panel>;
}

function Glyph({ d }: { d: string[] }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{d.map((path, index) => <path d={path} key={index} />)}</svg>;
}

const ICONS = {
  dashboard: ["M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"],
  entry: ["M12 5v14M5 12h14", "M4 4h16v16H4z"],
  list: ["M5 7h14M5 12h14M5 17h9", "M3 4h18v16H3z"],
  reports: ["M5 19V9M12 19V5M19 19v-7", "M3 21h18"],
  users: ["M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M5 21v-2a7 7 0 0 1 14 0v2"],
  server: ["M4 5h16v6H4zM4 13h16v6H4z", "M8 8h.01M8 16h.01M12 8h5M12 16h5"],
  menu: ["M4 7h16M4 12h16M4 17h16"],
  // 톱니 6개 기어. 극좌표로 생성해 톱니 수·대칭·중심을 실측 검증한 경로.
  gear: ["M9.68 6.25L9.57 2.92L14.43 2.92L14.32 6.25A6.2 6.2 0 0 1 15.82 7.11L18.65 5.35L21.08 9.57L18.14 11.14A6.2 6.2 0 0 1 18.14 12.86L21.08 14.43L18.65 18.65L15.82 16.89A6.2 6.2 0 0 1 14.32 17.75L14.43 21.08L9.57 21.08L9.68 17.75A6.2 6.2 0 0 1 8.18 16.89L5.35 18.65L2.92 14.43L5.86 12.86A6.2 6.2 0 0 1 5.86 11.14L2.92 9.57L5.35 5.35L8.18 7.11A6.2 6.2 0 0 1 9.68 6.25Z", "M12 8.9a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Z"],
  logout: ["M16 17l5-5-5-5", "M21 12H9", "M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"],
  sun: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.93 4.93 6.63 6.63M17.37 17.37l1.7 1.7M19.07 4.93l-1.7 1.7M6.63 17.37l-1.7 1.7"],
  moon: ["M20.4 14.5A8.6 8.6 0 0 1 9.5 3.6 8.6 8.6 0 1 0 20.4 14.5Z"],
};

const TABS = [
  { value: "controls", label: "컨트롤" },
  { value: "layout", label: "레이아웃" },
  { value: "colors", label: "색상" },
] as const;

const SHORT_OPTIONS = [
  { value: "krw", label: "원화 (KRW)" },
  { value: "usd", label: "미국 달러 (USD)" },
  { value: "jpy", label: "일본 엔 (JPY)" },
  { value: "eur", label: "유로 (EUR)", disabled: true },
];

// 고를 수 있는 옵션이 0개인 두 경우. disabled prop 없이도 비활성으로 렌더돼야 합니다.
const ALL_DISABLED_OPTIONS = SHORT_OPTIONS.map((option) => ({ ...option, disabled: true }));

const LONG_OPTIONS = Array.from({ length: 24 }, (_, index) => ({ value: `item-${index}`, label: `${index + 1}번 항목 — 아래 공간이 좁으면 위로 열립니다` }));

// 긴 다이얼로그용 필드 목록. 화면보다 길어야 "넘칠 때" 동작을 볼 수 있고,
// 텍스트 입력이 섞여 있어야 휴대폰에서 키보드를 올려 확인할 수 있습니다.
type LongDialogField = { kind: "text" | "select" | "date" | "memo"; label: string; placeholder?: string; numeric?: boolean };

const LONG_DIALOG_FIELDS: LongDialogField[] = [
  { kind: "text", label: "항목 이름", placeholder: "예: 식비" },
  { kind: "select", label: "통화" },
  { kind: "text", label: "별칭", placeholder: "짧게 부를 이름" },
  { kind: "date", label: "사용 시작일" },
  { kind: "text", label: "표시 순서", placeholder: "숫자", numeric: true },
  { kind: "memo", label: "메모", placeholder: "여러 줄을 입력하면 늘어납니다" },
  { kind: "select", label: "항목 종류" },
  { kind: "text", label: "결제일", placeholder: "1~31", numeric: true },
  { kind: "date", label: "사용 종료일" },
  { kind: "text", label: "목표액", placeholder: "0", numeric: true },
  { kind: "select", label: "연결 자산" },
  { kind: "text", label: "마지막 칸", placeholder: "여기까지 스크롤해서 눌러 보세요" },
];

/** `--summary-card-min` 후보를 **같은 화면에서 즉시** 갈아 끼우는 데모 전용 조작판.
 *
 * 별도 포트로 두 벌을 띄우는 방법도 있었지만 이쪽을 골랐습니다 — 2560에서는 두 창을
 * 나란히 놓으면 각각 1280이 되어 **비교하려는 그 폭이 사라집니다.** 탭을 오가면 스크롤
 * 위치와 테마도 갈립니다.
 *
 * 숫자를 같이 띄웁니다. "카드가 너무 크다"는 감각이 리포트의 출발점이었으므로, 고른
 * 값이 카드를 실제로 몇 px로 만들고 한 줄에 몇 장을 넣는지 보이지 않으면 다음에 또
 * 감으로 돌아갑니다. **캡에서 산술로 유도하지 않고 레이아웃을 다시 잽니다** — 유도하면
 * 패딩과 스크롤바를 빼먹어 그럴듯하게 틀립니다.
 */
/** 조작판의 축들. **버튼 세 개가 아니라 슬라이더인 이유**: 오너가 두 번 연속으로
 *  "더 작아지는 게 안 된다"고 했는데 둘 다 **제가 고른 세 값이 아래로 안 내려간 것**이
 *  원인이었습니다. 고를 값을 미리 찍는 것 자체가 왕복을 만듭니다 — 범위를 열어 둡니다. */
const AXES = [
  { token: "--summary-card-min", label: "요약 카드 min", min: 120, max: 420, initial: 240 },
  { token: "--panel-min", label: "패널 min", min: 200, max: 900, initial: 400 },
  { token: "--field-min", label: "필드 min", min: 140, max: 440, initial: 230 },
  { token: "--color-card-min", label: "색상 카드 min", min: 160, max: 520, initial: 240 },
] as const;

/** 위쪽 한계. **0은 "제한 없음"(`1fr`)** 입니다 — `min`만으로는 칸을 줄일 수 없어서
 *  이 축이 필요합니다(오너 지적). 슬라이더를 왼쪽 끝까지 내리면 지금까지와 같습니다. */
const MAX_AXES = [
  { token: "--summary-card-max", label: "요약 카드 max", min: 0, max: 600, initial: 0 },
  { token: "--panel-max", label: "패널 max", min: 0, max: 1400, initial: 0 },
  { token: "--field-max", label: "필드 max", min: 0, max: 700, initial: 0 },
  { token: "--color-card-max", label: "색상 카드 max", min: 0, max: 700, initial: 0 },
] as const;

/** 확인용 폭. 오너가 스크린샷을 보낸 세 자리 + 넓은 화면. */
/** 남는 폭을 줄 어디에 둘지. `max`를 주면 반드시 남는 폭이 생기므로 짝입니다. */
const JUSTIFY_CHOICES = ["normal", "center", "space-between", "end"] as const;

const WIDTH_PRESETS = [
  { label: "860", width: 860, 볼것: "패널 안 필드가 2열" },
  { label: "1200", width: 1200, 볼것: "날짜 피커 패널이 드롭다운 옆" },
  { label: "1920", width: 1920, 볼것: "패널 3열" },
  { label: "해제", width: 0, 볼것: "실제 창 폭" },
] as const;

/** 옛 규칙(4열 고정 카드 + 전폭 스택 패널)을 **그 자리에서** 덮어씌우는 스타일.
 *  비교를 산술로 유도하지 않고 **레이아웃을 두 번 재려고** 씁니다. */
const OLD_RULES = `
  .summary-grid { grid-template-columns: repeat(4, minmax(0,1fr)) !important; }
  .panel-grid { display: block !important; }
  .panel-grid > .panel { margin-bottom: 20px !important; }
  /* 필드 쪽 "옛 규칙"은 데모가 자기 CSS로 쓰던 240px입니다(킷에는 아무것도 없었으므로
     소비 앱의 옛 모습은 "한 열"입니다 — 여기서는 데모의 옛 모습을 재현합니다).
     이 줄이 없으면 필드 행의 두 열이 언제나 같게 나와, 표가 "안 바뀌었다"고 거짓말합니다. */
  .field-grid { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)) !important; }
  .theme-color-list { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
`;

type Reading = { cardLeftover: number; cardEmptyTail: number; colorCols: number; colorCard: number; colorField: number; cardCols: number; card: number; fieldCols: number; field: number; panelCols: number; panel: number; memo: number };

function LayoutSwitch() {
  const [axis, setAxis] = useState<Record<string, number>>(() => Object.fromEntries([...AXES, ...MAX_AXES].map((a) => [a.token, a.initial])));
  const [now, setNow] = useState<Reading | null>(null);
  const [before, setBefore] = useState<Reading | null>(null);
  const [viewport, setViewport] = useState(0);
  const [justify, setJustify] = useState<(typeof JUSTIFY_CHOICES)[number]>("normal");
  const [fakeWidth, setFakeWidth] = useState(0);
  /* 조작판을 접을 수 있습니다. 이건 화면 왼쪽 아래를 **고정으로** 덮고 있어서, 정작 그
   * 자리를 보려면 치울 방법이 있어야 합니다(오너 요청). 기본은 지금까지대로 펼침이고,
   * 선택은 기억합니다 — 접어 두고 새로 고쳤는데 다시 펴져 있으면 접은 의미가 없습니다. */
  const [open, setOpen] = useState(() => localStorage.getItem("layoutSwitchOpen") !== "false");
  useEffect(() => { localStorage.setItem("layoutSwitchOpen", String(open)); }, [open]);

  useEffect(() => {
    for (const a of AXES) document.documentElement.style.setProperty(a.token, `${axis[a.token]}px`);
    // 0은 "제한 없음" — 길이가 아니라 `1fr`을 넣어야 트랙이 남는 폭을 나눠 가집니다.
    for (const a of MAX_AXES) document.documentElement.style.setProperty(a.token, axis[a.token] ? `${axis[a.token]}px` : "1fr");
    for (const token of ["--summary-card-justify", "--panel-justify", "--field-justify", "--color-card-justify"]) {
      document.documentElement.style.setProperty(token, justify);
    }
    /* ⚠️ **`justify`가 여기 없어서 버튼 넷이 죽어 있었습니다.** 본문은 `justify`를
       읽는데 의존성에 `axis`만 있어, 버튼이 상태만 바꾸고 토큰은 첫 값(`normal`)에
       머물렀습니다 — 어느 것을 눌러도 카드가 1px도 안 움직였습니다(실측).
       **조작판이 있는데 축이 죽어 있으면 "그 축은 효과가 없다"는 오답을 만듭니다.**
       `tests/demoControls.test.ts`가 못박습니다. */
  }, [axis, justify]);

  /* **폭 흉내입니다. 창을 실제로 줄이는 게 아닙니다.** `.app-shell`을 좁혀 작업 영역이
     받는 폭만 그 값으로 만듭니다 — 이 그리드들이 보는 것은 창이 아니라 부모 폭이므로
     레이아웃 판정에는 같습니다.
     ⚠️ **뷰포트 미디어 쿼리는 안 바뀝니다** — `@media (max-width: 760px)`의 모바일
     전환은 실제 창 크기로만 일어납니다. 그래서 프리셋을 전부 800 위로 뒀습니다.
     그 아래를 볼 일이 있으면 **창을 진짜로 줄여야 합니다.** */
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const workspace = document.querySelector<HTMLElement>(".workspace");
    if (!shell || !workspace) return;
    shell.style.maxWidth = fakeWidth ? `${fakeWidth}px` : "";
    /* ⚠️ **패딩까지 흉내 내야 합니다.** `.workspace`의 좌우 패딩은
       `clamp(22px, 5vw, 72px)`이고 `vw`는 **부모가 아니라 실제 창**을 봅니다. 셸만 좁히면
       2560 창에서는 패딩이 72로 남아, 진짜 860 창의 43과 29px씩 어긋납니다.
       실측으로 잡았습니다 — 흉내 860이 필드 **1칸**을 찍는데 진짜 858은 **2칸**이었습니다.
       계산이 아니라 실제 창 측정과 대조해 확인했습니다(아래 `mirrorOk`). */
    const padding = fakeWidth ? Math.min(72, Math.max(22, fakeWidth * 0.05)) : 0;
    workspace.style.paddingLeft = fakeWidth ? `${padding}px` : "";
    workspace.style.paddingRight = fakeWidth ? `${padding}px` : "";
    return () => { shell.style.maxWidth = ""; workspace.style.paddingLeft = ""; workspace.style.paddingRight = ""; };
  }, [fakeWidth]);

  useEffect(() => {
    /* 접혀 있으면 아예 재지 않습니다 — 표를 아무도 안 보는데 400ms마다 옛 규칙을 얹었다
       걷을 이유가 없습니다. **그 주입이 PR #29에서 스크롤 위치를 파괴한 바로 그 동작**
       입니다(문서가 창 높이까지 짧아지는 순간 브라우저가 스크롤을 깎습니다).
       ⚠️ 토큰을 넣는 위 이펙트는 계속 돕니다 — 접었다고 `--*-min`이 풀리면 조작판을
       치우는 것만으로 화면이 바뀌어 무엇을 보고 있었는지 알 수 없게 됩니다. */
    if (!open) return;
    /* ⚠️ **접힌 트랙을 빼고 셉니다.** `auto-fit`은 빈 트랙을 `0px`로 접어 두는데
       `gridTemplateColumns`에는 **그대로 남아 있습니다**(실측: `1077px 1077px 0px`).
       그냥 세면 패널 2장이 나눠 쓰는 줄을 "3칸"이라고 찍습니다 — 조작판이 화면과 다른
       말을 하는 것이고, 이 저장소가 계측기 때문에 여러 번 치른 값입니다. */
    const tracks = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return 0;
      return getComputedStyle(el).gridTemplateColumns.split(" ").filter((track) => track && parseFloat(track) > 0).length;
    };
    const width = (selector: string) => {
      const el = document.querySelector(selector);
      return el ? Math.round(el.getBoundingClientRect().width) : 0;
    };
    /* ⚠️ **`justify`는 트랙 바깥에 남은 폭만 옮깁니다.** 트랙이 `1fr`이면 그 폭이 0이라
       **어떤 값을 골라도 화면이 안 바뀝니다** — 실측으로 `normal`·`start`·`space-between`·
       `space-around`·`space-evenly` 다섯이 좌표까지 완전히 같았습니다. 오너가 같은 자리에서
       세 번 막혔고, 세 번 다 이 숫자가 화면에 없어서였습니다. */
    const leftover = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return 0;
      const style = getComputedStyle(el);
      const sizes = style.gridTemplateColumns.split(" ").map(Number.parseFloat).filter(Number.isFinite);
      if (sizes.length === 0) return 0;
      const gap = Number.parseFloat(style.columnGap) || 0;
      const used = sizes.reduce((total, size) => total + size, 0) + gap * (sizes.length - 1);
      return Math.max(0, Math.round(el.getBoundingClientRect().width - used));
    };
    /** 마지막 줄에 남는 **빈 칸** 수. 오른쪽에 비어 보이는 자리는 "남는 폭"이 아니라
     *  이것이고, `justify`는 여기를 못 건드립니다 — `auto-fill`이 빈 트랙을 접지 않기
     *  때문입니다(그게 넓은 화면에서 카드가 커지는 것을 막는 장치입니다). */
    const emptyTail = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return 0;
      const count = tracks(selector);
      if (count === 0) return 0;
      return (count - (el.children.length % count)) % count;
    };
    const read = (): Reading => ({
      cardLeftover: leftover(".summary-grid"), cardEmptyTail: emptyTail(".summary-grid"),
      colorCols: tracks(".theme-color-list"), colorCard: width(".theme-color-card"), colorField: width(".theme-color-text"),
      cardCols: tracks(".summary-grid"), card: width(".summary-card"),
      fieldCols: tracks(".field-grid"), field: width(".field-grid > label"),
      panelCols: tracks(".panel-grid"), panel: width(".panel-grid > .panel"),
      // 메모 칸이 이 라운드의 최악값이었습니다 — 2560에서 2056px.
      memo: width(".auto-grow-textarea"),
    });

    /* **두 규칙을 같은 프레임에서 잽니다.** 옛 규칙을 얹고 읽으면 그 읽기가 레이아웃을
       강제로 계산시키고, 곧바로 걷어내고 다시 읽습니다. 그 사이에 페인트가 없으므로
       화면은 깜빡이지 않고, "지금 화면에서 정말 달라지는가"에 **숫자로** 답합니다.
       산술로 유도하지 않는 이유는 늘 같습니다 — 패딩·스크롤바·gap을 빼먹습니다.

       ⚠️ **"페인트가 없으니 아무 일도 안 일어난다"는 틀렸습니다.** 페인트와 무관하게
       옛 규칙이 문서를 짧게 만드는 동안 **브라우저가 스크롤 위치를 깎고**, 규칙을
       걷어내도 되돌려 주지 않습니다 — 레이아웃 페이지에서 스크롤한 지 0.4초 안에
       화면이 맨 위로 튀었습니다(오너 리포트 2026-08-12). 그래서 `preservingScroll`로
       감쌉니다. 실측과 근거는 `demo/preservingScroll.ts` 머리말에 있습니다. */
    const measure = () => {
      const { old, fresh } = preservingScroll(() => {
        const style = document.createElement("style");
        style.textContent = OLD_RULES;
        document.head.appendChild(style);
        const withOldRules = read();
        style.remove();
        return { old: withOldRules, fresh: read() };
      });
      // 값이 같으면 **같은 객체를 유지**합니다 — 안 그러면 400ms마다 새 객체가 들어가
      // 데모 전체가 계속 리렌더되고, 그 리렌더가 다시 레이아웃을 흔듭니다.
      const keep = (previous: Reading | null, next: Reading) =>
        previous && (Object.keys(next) as Array<keyof Reading>).every((key) => previous[key] === next[key]) ? previous : next;
      setBefore((previous) => keep(previous, old));
      setNow((previous) => keep(previous, fresh));
      setViewport(window.innerWidth);
    };
    /* ⚠️ **`requestAnimationFrame` 하나에 걸면 안 됩니다.** 브라우저 pane은 rAF를 아예
       돌리지 않아서(이 저장소가 여러 번 확인한 구조적 한계) 조작판이 값 대신 `—`만
       띄웁니다 — **비교하려고 만든 도구가 정작 확인이 필요한 환경에서 눈이 멉니다.**

       그리고 **탭을 옮기면 다시 재야 합니다.** 요약 카드는 `레이아웃` 탭에, 패널은
       `컨트롤` 탭에 있어서 한 번만 재면 다른 탭 값이 영원히 옛것으로 남습니다.
       MutationObserver로 해 봤는데 **탭 전환에 안 걸려서 표가 한 탭씩 뒤처졌습니다**
       (실측). 원인을 더 파는 대신 주기로 다시 잽니다 — 이건 데모 진단 도구이고,
       **영리한 것보다 안 머는 것이 낫습니다.** 400ms면 탭을 누른 뒤 눈에 띄기 전에
       갱신되고, 값이 그대로면 React가 리렌더를 건너뜁니다. */
    measure();
    const timer = window.setInterval(measure, 400);
    window.addEventListener("resize", measure);
    return () => { window.clearInterval(timer); window.removeEventListener("resize", measure); };
    // `open`이 빠지면 접었다 펴도 이펙트가 다시 안 돌아 표가 영원히 `…`입니다.
  }, [axis, justify, fakeWidth, open]);

  const slider = (a: (typeof AXES)[number] | (typeof MAX_AXES)[number]) =>
    <div className="layout-switch-row" key={a.token}>
      <strong>{a.label} <code>{a.token}</code></strong>
      <div className="layout-switch-slider">
        <input
          type="range"
          min={a.min}
          max={a.max}
          step={10}
          value={axis[a.token]}
          aria-label={`${a.label} 최소 폭`}
          onChange={(event) => setAxis((current) => ({ ...current, [a.token]: Number(event.target.value) }))}
        />
        <output>{axis[a.token] ? `${axis[a.token]}px` : "없음"}</output>
      </div>
    </div>;

  /* 지금 탭에 있는 것만 비교합니다 — 다른 탭에 있는 요소는 양쪽 다 0이라 "같다"에
     공짜로 기여합니다. 그걸 세면 아무것도 못 재는 탭에서 "옛 규칙과 같다"가 뜹니다. */
  const measured = now && before
    ? ([["card", now.card, before.card], ["panel", now.panel, before.panel], ["memo", now.memo, before.memo], ["field", now.field, before.field], ["colorCard", now.colorCard, before.colorCard]] as const).filter(([, a]) => a > 0)
    : [];
  const same = measured.length > 0 && measured.every(([, a, b]) => a === b);
  /* 다른 탭에 있어서 못 잰 값은 `—`가 아니라 **어디 있는지**를 말합니다. `—`만 뜨면
     조작판이 고장 난 것처럼 보이는데, 실제로는 그 요소가 이 화면에 없을 뿐입니다. */
  const cell = (cols: number, px: number, where: string) => px ? `${cols ? cols + "칸 " : ""}${px}px` : where;

  return <div className={`layout-switch${open ? "" : " closed"}`}>
    {/* 접힘 머리줄. 접었을 때도 **지금 무엇이 걸려 있는지**는 한 줄로 남깁니다 — 접었다는
        이유로 폭 흉내가 켜진 것을 잊으면, 화면이 왜 그런지 설명할 수 없게 됩니다. */}
    <button
      type="button"
      className="layout-switch-head"
      aria-expanded={open}
      aria-label={open ? "조작판 접기" : "조작판 펴기"}
      onClick={() => setOpen((shown) => !shown)}
    >
      <span>{open ? "▾" : "▸"} 조작판</span>
      {!open && <em>{justify}{fakeWidth ? ` · 흉내 ${fakeWidth}` : ""}</em>}
    </button>
    {open && <>
    {AXES.map(slider)}
    {MAX_AXES.map(slider)}
    <div className="layout-switch-row">
      <strong>남는 폭 <code>--*-justify</code></strong>
      <div className="layout-switch-buttons">
        {JUSTIFY_CHOICES.map((choice) => <button
          key={choice}
          type="button"
          className={choice === justify ? "primary" : "secondary-button"}
          aria-pressed={choice === justify}
          onClick={() => setJustify(choice)}
          title={choice}
        >{choice === "normal" ? "왼쪽" : choice === "center" ? "가운데" : choice === "end" ? "오른쪽" : "양끝"}</button>)}
      </div>
    </div>
    {/* ⚠️ **이 줄이 없어서 오너가 같은 자리에서 세 번 막혔습니다.** 버튼이 어떤 CSS 값을
        넣는지, 그리고 지금 그 축이 옮길 폭이 있기는 한지가 화면 어디에도 없었습니다. */}
    <small className="layout-switch-note">
      지금 <code>--*-justify: {justify}</code>
      {now ? ` · 요약 카드 남는 폭 ${now.cardLeftover}px · 마지막 줄 빈 칸 ${now.cardEmptyTail}개` : " · 재는 중…"}
      {now && now.cardLeftover === 0
        ? " — 남는 폭이 0이라 위 버튼은 어떤 값을 골라도 화면이 안 바뀝니다. 오른쪽에 비어 보이는 자리는 남는 폭이 아니라 빈 칸이고 justify가 못 건드립니다. max를 길이로 줘야 남는 폭이 생깁니다."
        : ""}
    </small>
    <div className="layout-switch-row">
      <strong>폭 흉내 <small>(창은 그대로)</small></strong>
      <div className="layout-switch-buttons">
        {WIDTH_PRESETS.map((preset) => <button
          key={preset.label}
          type="button"
          className={preset.width === fakeWidth ? "primary" : "secondary-button"}
          aria-pressed={preset.width === fakeWidth}
          title={preset.볼것}
          onClick={() => setFakeWidth(preset.width)}
        >{preset.label}</button>)}
      </div>
    </div>
    <table className="layout-switch-table">
      <thead><tr><th>{fakeWidth ? `흉내 ${fakeWidth}` : `화면 ${viewport}`}</th><th>지금</th><th>옛 규칙</th></tr></thead>
      <tbody>
        <tr><td>색상 카드</td><td>{now ? cell(now.colorCols, now.colorCard, "색상 탭") : "…"}</td><td>{before ? cell(before.colorCols, before.colorCard, "") : "…"}</td></tr>
        <tr><td>색상 값칸</td><td>{now ? cell(0, now.colorField, "색상 탭") : "…"}</td><td>{before ? cell(0, before.colorField, "") : "…"}</td></tr>
        <tr><td>요약 카드</td><td>{now ? cell(now.cardCols, now.card, "레이아웃 탭") : "…"}</td><td>{before ? cell(before.cardCols, before.card, "") : "…"}</td></tr>
        <tr><td>패널 안 필드</td><td>{now ? cell(now.fieldCols, now.field, "컨트롤 탭") : "…"}</td><td>{before ? cell(before.fieldCols, before.field, "") : "…"}</td></tr>
        <tr><td>패널</td><td>{now ? cell(now.panelCols, now.panel, "컨트롤 탭") : "…"}</td><td>{before ? cell(before.panelCols, before.panel, "") : "…"}</td></tr>
        <tr><td>메모 칸</td><td>{now ? cell(0, now.memo, "컨트롤 탭") : "…"}</td><td>{before ? cell(0, before.memo, "") : "…"}</td></tr>
      </tbody>
    </table>
    <small>
      {measured.length === 0
        ? "재는 중…"
        : same
          ? "이 화면 폭에서는 옛 규칙과 같습니다 — 의도한 대로입니다. 카드는 1920부터, 패널은 --panel-min 폭부터 갈립니다."
          : "이 화면 폭에서 달라집니다."}
    </small>
    </>}
  </div>;
}

/** 레이아웃 탭의 패널들. **높이를 일부러 다르게** 뒀습니다 — 나란히 놓으면 짧은 쪽
 *  아래가 비는 것이 이 방식의 실제 비용이고, 데모가 그걸 감추면 안 됩니다. */
const LAYOUT_PANELS: Record<string, () => ReactElement> = {
  messages: () => <Panel key="messages" title="패널" hint="PANEL" actions={<button type="button" className="secondary-button">액션</button>}>
    <p className="muted-copy">패널은 기본이 작업 영역 전체 폭입니다. 가로로 나란히 놓고 싶으면 <code>PanelGrid</code>로 묶으세요 — 어느 패널이 같이 설지는 앱이 정합니다.</p>
    <div className="error" style={{ marginTop: 12 }}>오류 메시지 예시입니다.</div>
    <div className="success">성공 메시지 예시입니다.</div>
  </Panel>,
  short: () => <Panel key="short" title="짧은 패널" hint="SHORT">
    <p className="muted-copy">높이가 다른 패널을 나란히 놓으면 짧은 쪽 아래가 빕니다. CSS masonry는 아직 못 쓰므로, 어떤 조합이 괜찮은지는 내용을 아는 앱이 판단합니다.</p>
  </Panel>,
  form: () => <Panel key="form" title="폼이 든 패널" hint="FORM">
    <FieldGrid>
      <label>이름<input placeholder="예: 식비" /></label>
      <label>통화<Select ariaLabel="폼 통화" value="krw" options={SHORT_OPTIONS} onChange={() => undefined} /></label>
      <label>시작일<DateWheelPicker ariaLabel="폼 시작일" value="2026-07-23" onChange={() => undefined} /></label>
    </FieldGrid>
  </Panel>,
};

function Demo() {
  // 기본은 다크. 저장된 선택이 있으면 그게 우선.
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    return saved === "light" || saved === "dark" ? saved : "dark";
  });
  /* 색 설정의 **주인**을 데모에서 바꿔 볼 수 있게 합니다.
   *   꺼짐 — 킷이 `localStorage`에 읽고 씁니다(지금까지의 동작).
   *   켜짐 — 앱(=이 데모)이 소유합니다. `overrides`를 넘기므로 킷은 **저장하지 않고**
   *          적용과 알림만 하며, 값은 아래 `serverColors`에 삽니다(진짜 앱이라면 서버).
   * 켜고 색을 고친 뒤 새로 고치면 사라지는 것이 정상입니다 — 이 데모에는 서버가 없습니다. */
  const [appOwnsColors, setAppOwnsColors] = useState(false);
  const [serverColors, setServerColors] = useState<Record<"light" | "dark", Record<string, string>>>({ light: {}, dark: {} });
  /** `onCommit`이 언제 불렸는지 눈으로 보는 자리. 피커를 끄는 동안은 안 불립니다. */
  const [lastCommit, setLastCommit] = useState("아직 없음");
  const [backupText, setBackupText] = useState("");
  const [restoreNote, setRestoreNote] = useState("");

  // 접힘 상태를 브라우저에 기억해 다음 방문에 그대로 재현합니다. Sidebar는 controlled라
  // 저장은 쓰는 쪽 책임입니다(PRINCIPLES §8).
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("controls");
  const [currency, setCurrency] = useState("krw");
  const [centered, setCentered] = useState("krw");
  const [long, setLong] = useState("item-0");
  const [date, setDate] = useState("2026-07-23");
  const [optionalDate, setOptionalDate] = useState("");
  const [raceDate, setRaceDate] = useState("2026-07-23");
  // Task 3(2b-3)가 시·분·초를 실제로 그리게 만들고 나서 처음 여는 시각 픽커들(2b-4).
  // 값 형식은 fields가 가르는 계열을 그대로 따른다(model/instant.ts의 familyOf) —
  // 시각만이면 "HH:MM", 날짜+시각이면 "YYYY-MM-DDTHH:MM"(초까지면 :SS도 붙는다).
  /** budget의 백업 예약 화면이 지금 `<input type="number">` 둘로 시·분을 받고 있는
   *  자리(docs/design/2026-08-12-wheel-picker-time-design.md §1) — 이 킷으로 옮기면
   *  이 모양이 된다. */
  const [reservationTime, setReservationTime] = useState("18:30");
  // 기간 — 값은 고정폭 YYYY:MM:DD:HH:MM:SS 입니다. 아래 셋이 같은 모델을 다른 fields로 씁니다.
  const [workDuration, setWorkDuration] = useState("0000:00:00:01:30:00");     // 1시간 30분
  const [longDuration, setLongDuration] = useState("0000:00:03:04:00:00");     // 3일 4시간
  const [contractTerm, setContractTerm] = useState("0002:03:00:00:00:00");     // 2년 3개월
  const [meetingAt, setMeetingAt] = useState("2026-07-23T14:30");
  const [loggedAt, setLoggedAt] = useState("2026-07-23T14:30:05");
  /** 6열(연·월·일·시·분·초)을 한 줄로 둘지 두 줄(날짜 줄/시각 줄)로 접을지 —
   *  설계 스펙 §16 미결 1번, 실기기에서만 판단됩니다(2b-4). 기본은 한 줄이고, 이
   *  토글이 켜지면 demo.css의 데모 전용 규칙이 `.wheel-columns[data-fields="6"]`를
   *  3열×2줄로 접습니다. 킷 컴포넌트의 팝오버는 body 포털이라 이 컴포넌트를 감싸는
   *  것으로는 스코프를 못 잡고, 그래서 body 클래스로 토글합니다(아래 useEffect). */
  const [foldSixColumns, setFoldSixColumns] = useState(false);
  /* 오너 리포트 6번 — 휠에 보이는 행을 위아래 2개씩(기본) / 1개씩으로 갈아 끼웁니다.
   * 킷이 토큰 둘로 묶어 둬서 demo.css가 그 둘만 덮어씁니다. 실기기에서 고릅니다. */
  const wheelRows = useSyncExternalStore(subscribeWheelRowsPerSide, getWheelRowsPerSide, getWheelRowsPerSide);
  /* 성능 격리 모드(오너: "안드로이드에서 엄청 버벅대네") — 데모 페이지의 다시 그리기
   * 비용과 킷의 비용을 **가르기 위한** 스위치입니다. 켜고/끄고 같은 스와이프를 재세요. */
  const [isolate, setIsolate] = useState(false);
  /* ON(선택됨) 모양 시안 셋 — 오너가 실기기에서 고릅니다. 킷 기본값은 "반전"이고
   * 나머지 둘은 demo.css가 덮습니다. 정해지면 킷 규칙 하나만 바꾸고 이 실험은 지웁니다. */

  /* 12시간제는 **킷 전역 설정**이라 `useState`로 들고 있으면 안 됩니다(설계 스펙 §11) —
   * 값은 킷 안에 있고 데모는 **구독해서 읽습니다.** 로컬 상태로 흉내 내면 이 화면의
   * 다른 픽커들이 안 따라오는데, 그러면 조작판이 화면과 다른 말을 하는 이 저장소의
   * 단골 결함이 그대로 재현됩니다. 지속성은 아직 없어서 새로고침하면 24로 돌아옵니다. */
  const hourFormat = useSyncExternalStore(subscribeHourFormat, getHourFormat, getHourFormat);
  // 설계 스펙 §7.1이 **미해결로** 적어 둔 경합 — "숫자를 반쯤 친 상태에서 소비자가
  // `disabled`를 켜면 그 숫자가 확정되는가". 아래 카운트다운이 그 순간을 만듭니다.
  const [raceDisabled, setRaceDisabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [memo, setMemo] = useState("");
  const [dialog, setDialog] = useState<"none" | "basic" | "scroll">("none");
  const [panelOrder, setPanelOrder] = useState(["messages", "short", "form"]);
  const [panelStretch, setPanelStretch] = useState(false);
  const [navHidden] = useScrollDirectionHidden();
  const keyboardOpen = useVirtualKeyboardOpen();
  const pageTabs = useMobilePageTabs();

  // 다이얼로그가 열리고 닫힌 시점을 history 기록에 같이 남깁니다.
  useEffect(() => { logProbe(`다이얼로그 = ${dialog}`); }, [dialog]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
    // 테마마다 저장된 색이 다르므로 전환할 때마다 다시 적용합니다.
    // ⚠️ 팔레트를 지납니다 — `applyTokenOverrides(theme)`는 킷 기본 목록만 돌아
    // `--demo-brand`를 화면에서 조용히 떨어뜨립니다(저장소에는 남습니다).
    if (appOwnsColors) demoPalette.apply(theme, serverColors[theme]);
    else demoPalette.apply(theme);
    // ⚠️ 본문에서 읽는 것을 의존성에 다 적습니다. 이 데모는 **정확히 이 자리에서**
    // 한 번 당했습니다 — `justify`를 읽으면서 `axis`만 적어 두어 조작판의 축 하나가
    // 통째로 죽어 있었고, 오너가 그 동작을 한 번도 못 봤습니다(tests/demoControls.test.ts).
  }, [theme, appOwnsColors, serverColors]);

  useEffect(() => { localStorage.setItem("sidebarCollapsed", String(collapsed)); }, [collapsed]);

  // 단축키 덮어쓰기는 이제 `shortcutStorage`(localStorage, 키 `shortcutBindings`)에
  // 삽니다 — Task 7(스펙 §7). `ShortcutProvider`에 `overrides` 대신 `storage`를
  // 넘기면 킷이 마운트 때 읽고 `ShortcutSettings`의 녹음·지우기를 직접 저장합니다.
  // 화면에 쓰는 조합 문자열은 `useSidebarCombo`(= `registry.bindingOf`)에서
  // 파생시킵니다 — 리터럴로 박아 두면 "단축키" 패널에서 재녹음/삭제해도 이 문구들만
  // 낡은 채로 남습니다.

  /* **맨 키 허용 구역을 하나 보여 줍니다**(단축키 스펙 §2.2). `.workspace`가 그 예시입니다 —
     사이드바는 이 요소 밖의 형제라서(`AppShell.tsx`가 `<main className="workspace">`로
     children만 감쌉니다) 여기 붙은 표식은 사이드바 버튼에는 안 걸립니다.
     ⚠️ **여기서만 `querySelector`로 붙입니다 — 실제 앱에서는 이러지 마세요.**
     `.workspace`는 `AppShell`이 그리는 킷 소유 요소라 이 데모가 JSX로 직접 못 건드립니다.
     자기 컨테이너를 직접 렌더하는 보통 앱이라면 그 JSX에 `data-kkqq-shortcut-scope`를
     바로 적으면 됩니다 — 이 훅 흉내가 필요 없습니다. */
  useEffect(() => {
    const workspace = document.querySelector<HTMLElement>(".workspace");
    if (!workspace) return;
    workspace.setAttribute(BARE_KEY_SCOPE_ATTR, "");
    return () => { workspace.removeAttribute(BARE_KEY_SCOPE_ATTR); };
  }, []);

  // 6열 두 줄 접기 토글(2b-4, 설계 스펙 §16 미결 1번) — DateWheelPicker의 팝오버는
  // document.body에 직접 포털되므로(트리거를 감싸는 어떤 데모 래퍼도 실제 DOM에서는
  // 그 팝오버의 조상이 아니다), 이 인스턴스 하나에만 CSS를 스코프할 유일하게 예측
  // 가능한 훅은 body 클래스뿐이다. demo.css가 이 클래스와 팝오버의 aria-label을
  // 함께 조건으로 걸어 정확히 그 픽커의 그리드만 3열×2줄로 접는다.
  useEffect(() => {
    document.body.classList.toggle("wheel-fold-demo", foldSixColumns);
    return () => document.body.classList.remove("wheel-fold-demo");
  }, [foldSixColumns]);

  // 6번은 이제 데모 CSS 흉내가 아니라 **킷 전역 설정**이라, body 클래스가 필요 없습니다.

  useEffect(() => {
    document.body.classList.toggle("demo-isolate", isolate);
    return () => document.body.classList.remove("demo-isolate");
  }, [isolate]);



  // 1초씩 세다 마지막 칸에서 `disabled`를 켭니다. **버튼을 바로 토글하면 안 됩니다** —
  // `DateWheelPicker.tsx:659-665`가 바깥 `pointerdown`에 팝오버를 닫으므로, 누르는 순간
  // 팝오버가 먼저 사라져 만들려던 상태 자체가 없어집니다. 그래서 지연을 둡니다:
  // 누르고 → 팝오버를 열고 → 숫자를 반쯤 치고 → 그동안 타이머가 켭니다.
  useEffect(() => {
    if (countdown === 0) return;
    const id = window.setTimeout(() => {
      if (countdown === 1) { setRaceDisabled(true); logTraceNote("disabled=true 켜짐 (§7.1 경합)"); }
      setCountdown(countdown - 1);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [countdown]);

  const navItem = (id: string, label: string, icon: keyof typeof ICONS, badge?: number) => ({
    id, label, badge, icon: <Glyph d={ICONS[icon]} />, active: page === id, onSelect: () => setPage(id),
  });

  return <MobilePageTabsContext.Provider value={pageTabs.context}>
    {/* Select 터치 버그를 실제 휴대폰에서 진단하기 위한 임시 계측 패널. 기본은 닫혀
        있어 평소 데모 화면에 영향이 없습니다. demo/EventTracePanel.tsx 참고. */}
    <EventTracePanel />
    {/* `--summary-card-min` 후보 비교용 조작판(데모 전용). 오너가 2560 화면에서 값을
        고르면 그 값이 tokens.css의 기본값이 되고 이 조작판은 사라집니다. */}
    <LayoutSwitch />
    {/* **`defaultCombo` 옵션이 요점입니다** — 킷의 기본은 여전히 `null`이고(단축키 스펙
        §3.2), 조합을 정한 것은 이 데모(=앱)이며, 그 자리는 `sidebarToggleAction`의 두 번째
        인자입니다. `sidebarToggleAction`이 주는 것은 안정적인 `id`(`SIDEBAR_TOGGLE_ID`)와
        이름표뿐이고, 접힘 상태를 뒤집는 핸들러는 앱이 넘깁니다 — `Sidebar`가 controlled라
        서입니다. **`overrides` 대신 `storage`를 넘깁니다**(Task 7) — 킷이 uncontrolled로
        직접 저장소를 읽고 씁니다. 사용자가 실제로 바꾼 것만 담깁니다(§7.1)는 그대로이고,
        이제 그 값이 새로고침 뒤에도 남습니다. */}
    <ShortcutProvider
      actions={[sidebarToggleAction(() => setCollapsed((value) => !value), { defaultCombo: SIDEBAR_DEFAULT_COMBO })]}
      storage={shortcutStorage}
    >
      <AppShell
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        navHidden={navHidden}
        keyboardOpen={keyboardOpen}
        sidebar={<Sidebar
          brand={{ icon: <Glyph d={ICONS.dashboard} />, title: "디자인 시스템" }}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          slot={<>
            <small>작업 공간</small>
            {/* 슬롯이 접기 애니메이션 때문에 overflow를 자르므로 portal 필수 */}
            <Select ariaLabel="작업 공간" value={currency} options={SHORT_OPTIONS} onChange={setCurrency} portal />
            <button type="button" className="text-button">+ 새로 만들기</button>
          </>}
          sections={[
            { items: [navItem("dashboard", "대시보드", "dashboard"), navItem("entry", "입력", "entry", 7), navItem("list", "목록", "list")] },
            { heading: "보고서", items: [navItem("reports", "요약", "reports")] },
            // 사용자 화면은 오른쪽 위·사이드바 푸터의 설정 버튼이 담당하므로 메뉴에 두지 않는다
            { heading: "관리", pinToBottom: true, items: [navItem("server", "서버 설정", "server")] },
          ]}
          footer={{
            avatar: <span className="sidebar-user-avatar"><Glyph d={ICONS.users} /></span>,
            name: "홍길동",
            subtitle: "관리자",
            actions: [
              { id: "settings", label: "설정", icon: <Glyph d={ICONS.gear} />, onClick: () => setPage("users") },
              { id: "logout", label: "로그아웃", icon: <Glyph d={ICONS.logout} />, onClick: () => undefined },
            ],
          }}
        />}
        quickBar={<MobileQuickBar barRef={pageTabs.quickBarRef} items={[
          { id: "menu", label: "메뉴", icon: <Glyph d={ICONS.menu} />, active: mobileOpen, onClick: () => setMobileOpen(true) },
          { id: "entry", label: "입력", icon: <Glyph d={ICONS.entry} />, active: page === "entry", onClick: () => setPage("entry") },
          { id: "home", label: "홈", icon: <Glyph d={ICONS.dashboard} />, active: page === "dashboard", onClick: () => setPage("dashboard") },
        ]} />}
        pageTabs={<MobilePageTabs registration={pageTabs.registration} open={pageTabs.open} onToggle={pageTabs.setOpen} floatRef={pageTabs.floatRef} />}
      >
        <div className="page-actions">
          <button type="button" className="page-action-button" onClick={() => setTheme((value) => (value === "light" ? "dark" : "light"))} aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"} title={theme === "dark" ? "라이트 모드" : "다크 모드"}><Glyph d={theme === "dark" ? ICONS.sun : ICONS.moon} /></button>
          <button type="button" className="page-action-button" onClick={() => setPage("users")} aria-label="설정" title="설정"><Glyph d={ICONS.gear} /></button>
        </div>
        <PageHeader eyebrow="DESIGN SYSTEM" title="컴포넌트 데모" description="드롭다운·날짜 피커·사이드바·탭이 한 화면에 모두 있습니다. 브라우저 폭을 760px 아래로 줄이면 모바일 레이아웃으로 바뀝니다." />
        {/* 단축키 예시 하나를 여기서도 문자로 적어 둡니다 — 자세한 설명과 설정 UI는
            "컨트롤" 탭의 "단축키" 패널에 있습니다. 값은 실제 바인딩(`useSidebarCombo`,
            = `registry.bindingOf`)에서 파생시킵니다 — 리터럴이면 아래 패널에서
            재녹음해도 여기는 안 바뀝니다. */}
        <SidebarComboLine />
        <SectionTabs ariaLabel="데모 섹션" value={tab} tabs={TABS as unknown as Array<{ value: string; label: string }>} onChange={(next) => setTab(next as typeof tab)} />
  
        {tab === "controls" && <>
          {historyProbeEnabled() && <HistoryLogPanel />}
          <SectionHeading title="컨트롤" description="입력·드롭다운·날짜는 41px, 표준 액션은 38px, 조밀한 액션은 32px입니다. 같은 문맥의 버튼은 반드시 같은 높이를 씁니다." />
          {/* 앱이 "이 둘은 같이 선다"를 정합니다 — 킷은 통(PanelGrid)만 줍니다.
              좁아지면 알아서 한 열로 쌓이므로 모바일 분기가 따로 없습니다. */}
          <PanelGrid>
            <Panel title="드롭다운" hint="SELECT">
              <FieldGrid>
                <label>왼쪽 정렬 (기본)<Select ariaLabel="통화" value={currency} options={SHORT_OPTIONS} onChange={setCurrency} /></label>
                <label>가운데 정렬<Select ariaLabel="가운데 정렬 통화" align="center" value={centered} options={SHORT_OPTIONS} onChange={setCentered} /></label>
                <label>긴 목록 (위로 열림 확인)<Select ariaLabel="긴 목록" value={long} options={LONG_OPTIONS} onChange={setLong} /></label>
                <label>비활성<Select ariaLabel="비활성 드롭다운" value={currency} options={SHORT_OPTIONS} onChange={setCurrency} disabled /></label>
                {/* 아래 둘은 disabled prop을 주지 않았는데도 비활성으로 보여야 합니다 —
                    고를 수 있는 옵션이 하나도 없으면 컨트롤 자체가 비활성입니다(PRINCIPLES §3).
                    왼쪽의 "비활성"과 나란히 두어 셋이 같아 보이는지 확인하세요. */}
                <label>옵션이 전부 비활성<Select ariaLabel="전부 비활성 드롭다운" value="krw" options={ALL_DISABLED_OPTIONS} onChange={setCurrency} /></label>
                <label>옵션이 없음<Select ariaLabel="빈 드롭다운" value="" options={[]} onChange={setCurrency} /></label>
              </FieldGrid>
            </Panel>
            <Panel title="날짜 피커" hint="DATE WHEEL">
              <FieldGrid>
                <label>필수 날짜<DateWheelPicker ariaLabel="거래 날짜" value={date} onChange={setDate} /></label>
                <label>선택 날짜 (비우기 가능)<DateWheelPicker ariaLabel="종료일" value={optionalDate} onChange={setOptionalDate} allowClear /></label>
                <label>범위 제한 (2026년만)<DateWheelPicker ariaLabel="제한 날짜" value={date} onChange={setDate} min="2026-01-01" max="2026-12-31" /></label>
                <label>연·월만 (fields)<DateWheelPicker ariaLabel="예산 월" value={date} onChange={setDate} fields={["year", "month"]} /></label>
                <label>연도만 (fields)<DateWheelPicker ariaLabel="회계 연도" value={date} onChange={setDate} fields={["year"]} /></label>
                <label>영어 라벨<DateWheelPicker ariaLabel="Date" value={date} onChange={setDate} labels={{ placeholder: "Pick a date", hint: "Scroll, swipe, arrow keys, or type digits · Ctrl+; today", today: "Today", clear: "Clear", done: "Done", previous: "previous", next: "next", select: "picker", weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], units: { year: "Year", month: "Month", day: "Day", hour: "Hour", minute: "Minute", second: "Second" } }} /></label>
                {/* 비활성 예시가 없어서 이 상태를 아무도 본 적이 없었습니다 — 드롭다운의
                    "비활성"과 나란히 놓고 같은 흐리기인지 확인하세요. */}
                <label>비활성<DateWheelPicker ariaLabel="비활성 날짜" value={date} onChange={setDate} disabled /></label>
                {/* 위의 "비활성"은 **처음부터** 비활성이라, 설계 스펙 §7.1이 미해결로 적어 둔
                    경합("숫자를 반쯤 친 상태에서 disabled가 켜지면 그 숫자가 확정되는가")을
                    만들 수가 없습니다. 이건 활성으로 시작해 아래 버튼이 나중에 켭니다. */}
                <label>늦게 비활성 (§7.1)<DateWheelPicker ariaLabel="늦게 비활성 날짜" value={raceDate} onChange={setRaceDate} disabled={raceDisabled} /></label>
              </FieldGrid>
              <div className="button-row" style={{ marginTop: 16 }}>
                <button type="button" className="secondary-button" onClick={() => { setRaceDisabled(false); setCountdown(3); logTraceNote("3초 카운트다운 시작"); }} disabled={countdown > 0}>
                  {countdown > 0 ? `${countdown}초 뒤 비활성…` : "3초 뒤 비활성"}
                </button>
                <button type="button" className="secondary-button" onClick={() => { setCountdown(0); setRaceDisabled(false); logTraceNote("disabled=false 되돌림"); }}>다시 활성</button>
              </div>
              {/* ⚠️ 안내는 **실제로 검증한 재현 절차 그대로** 적습니다. "아무 숫자나 반쯤"이라고
                  적으면 공허한 캡처가 나오고, **트레이스만 봐서는 그걸 가려낼 수 없습니다**:
                  ① 일 세그먼트의 `4`~`9`는 반쯤 친 상태가 아니라 **즉시 확정**됩니다(×10이 31을
                  넘어 둘째 자리를 못 받습니다). ② 확정 결과가 지금 값과 같으면(예: 값이 02인데
                  `2`를 침) 확정이든 폐기든 화면이 같습니다. 둘 다 이 라운드에서 실제로 겪었습니다. */}
              <p className="muted-copy" style={{ marginTop: 8 }}>
                <strong>“늦게 비활성” 확인 순서</strong> — 버튼을 먼저 누릅니다. 팝오버가 열린 뒤에 누르면
                바깥 클릭이라 팝오버가 먼저 닫힙니다.
              </p>
              <ol className="muted-copy" style={{ marginTop: 4, paddingLeft: 20 }}>
                <li><code>3초 뒤 비활성</code>을 누릅니다.</li>
                <li>바로 위 컨트롤을 눌러 팝오버를 엽니다.</li>
                <li><kbd>→</kbd> <kbd>→</kbd>로 <strong>일(day)</strong> 칸까지 간 뒤 <kbd>2</kbd>를 <strong>한 번만</strong> 칩니다.</li>
                <li>트리거가 <code>2‒</code>로 보이는지 확인합니다 — <strong>이게 “반쯤 친 상태”입니다.</strong>
                  바로 두 자리가 되면 확정된 것이니 <code>다시 활성</code>으로 되돌리고 다시 하세요.</li>
                <li>그대로 두면 3초째에 <code>disabled</code>가 켜집니다.</li>
              </ol>
              <p className="muted-copy" style={{ marginTop: 4 }}>
                <strong>볼 것:</strong> 날짜의 “일”이 <strong>02로 바뀌면 확정된 것</strong>, <strong>원래 값 그대로면 버려진 것</strong>입니다.
                어느 쪽이든 TRACE를 복사해 주세요. (Chromium/Windows에서는 <strong>버려짐</strong>으로 측정됐습니다 —
                다른 결과가 나오면 그게 새 정보입니다.)
              </p>
            </Panel>
            {/* Task 3(2b-3)가 시·분·초를 실제로 그리게 만든 뒤 처음 여는 시각 픽커들(2b-4).
                값 형식은 fields가 가르는 계열을 그대로 따릅니다 — model/instant.ts의
                familyOf. */}
            <Panel title="시각 피커" hint="TIME WHEEL" className="demo-time-panel">
              <FieldGrid>
                <label>시각만 — <code>TimeWheelPicker</code> (budget 백업 예약 화면이 지금 &lt;input type=&quot;number&quot;&gt; 둘로 받는 모양)<TimeWheelPicker ariaLabel="예약 시각" value={reservationTime} onChange={(next) => { logTraceNote(`예약 시각 onChange → ${next}`); setReservationTime(next); }} /></label>
                <label>기간 — <code>DurationWheelPicker</code> 기본(시·분). 맨 위 열이 무제한이라 <strong>90시간 30분</strong>도 됩니다<DurationWheelPicker ariaLabel="작업 시간" value={workDuration} onChange={(next) => { logTraceNote(`작업 시간 onChange → ${next}`); setWorkDuration(next); }} /></label>
                <label>기간 — 일·시·분. 여기서는 시가 0~23으로 순환합니다(맨 위가 일이라)<DurationWheelPicker ariaLabel="소요 기간" value={longDuration} onChange={setLongDuration} fields={["day", "hour", "minute"]} /></label>
                <label>기간 — 연·개월. "2년 3개월" 같은 계약 기간<DurationWheelPicker ariaLabel="계약 기간" value={contractTerm} onChange={setContractTerm} fields={["year", "month"]} /></label>
                <label>날짜+시각 (fields)<DateWheelPicker ariaLabel="약속 시각" value={meetingAt} onChange={(next) => { logTraceNote(`약속 시각 onChange → ${next}`); setMeetingAt(next); }} fields={["year", "month", "day", "hour", "minute"]} /></label>
                <label>초까지 — 6열 (fields)<DateWheelPicker ariaLabel="초까지 예약 시각" value={loggedAt} onChange={(next) => { logTraceNote(`초까지 예약 시각 onChange → ${next}`); setLoggedAt(next); }} fields={["year", "month", "day", "hour", "minute", "second"]} /></label>
              </FieldGrid>
              {/* 🔴 **설정 줄 모양입니다. 문장이 적힌 토글이 아닙니다**(오너 리포트
                  2026-08-13 2차: "설정 정의하는 버튼 크기가 작아서 글자들이 다 중복돼서
                  알아볼 수가 없어"). 폰 폭에서 버튼 하나에 문장을 넣으면 줄이 겹칩니다 —
                  라벨은 왼쪽에 두고 버튼에는 **값만** 넣습니다. 이 셋은 전부 킷 전역
                  설정이라, 앱의 설정 화면이 실제로 이 모양이 됩니다. */}
              <div className="demo-settings" style={{ marginTop: 16 }}>
                {/* 🔴 **데모가 더 이상 손으로 안 그립니다** — 오너 질문("이건 왜 모듈화
                    안 돼 있는 것 같지?")의 답이 이것입니다. 값 하나를 몇 개 중에서 고르는
                    묶음은 이제 킷 컴포넌트(`SegmentedControl`)이고, 접근성(라디오 그룹 ·
                    roving tabindex · 화살표)도 거기 들어 있습니다. */}
                <div className="demo-setting-row">
                  <span>시간 표기</span>
                  <SegmentedControl ariaLabel="시간 표기" value={hourFormat} onChange={setHourFormat}
                    options={[{ value: "24", label: "24시간" }, { value: "12", label: "12시간" }]} />
                </div>
                <div className="demo-setting-row">
                  <span>휠에 보이는 줄 (위아래 각)</span>
                  <SegmentedControl ariaLabel="휠에 보이는 줄" value={String(wheelRows)} onChange={(next) => setWheelRowsPerSide(Number(next) as 1 | 2 | 3 | 4)}
                    options={[{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }]} />
                </div>
                <div className="demo-setting-row">
                  <span>성능 격리 (다른 패널 감추기)</span>
                  <SegmentedControl ariaLabel="성능 격리" value={isolate ? "on" : "off"} onChange={(next) => setIsolate(next === "on")}
                    options={[{ value: "off", label: "끔" }, { value: "on", label: "켬" }]} />
                </div>
                <div className="demo-setting-row">
                  <span>6열 배치</span>
                  <SegmentedControl ariaLabel="6열 배치" value={foldSixColumns ? "two" : "one"} onChange={(next) => setFoldSixColumns(next === "two")}
                    options={[{ value: "one", label: "한 줄" }, { value: "two", label: "두 줄" }]} />
                </div>
              </div>
              <p className="muted-copy" style={{ marginTop: 8 }}>
                <strong>실기기 미확인 — 12시간제에서 볼 것 셋</strong>(설계 스펙 §14).
                위 <strong>시간 표기</strong>를 12시간으로 두고 <strong>“날짜+시각”</strong> 픽커를 여세요.
                ① <strong>시 열의 폭</strong> — 라벨이 <code>오후 03</code>으로 다섯 글자가
                되어 열이 좁으면 잘립니다. ② <strong>오전/오후 버튼의 크기와 자리</strong> —
                열 바로 위에 두 칸으로 있습니다(하단 <code>오늘·비우기·완료</code> 줄과
                일부러 다르게 생겼습니다). 엄지로 눌러 보세요.
                ③ <strong>한글 입력 상태에서 <code>a</code>·<code>p</code></strong> — 트리거에
                포커스를 두고 시 자리에서 <code>p</code>를 치면 오후로 넘어가야 합니다.
                IME가 먹는지 아직 아무도 모릅니다.
              </p>
              <p className="muted-copy" style={{ marginTop: 8 }}>
                <strong>실기기 미확인</strong> — 설계 스펙 §16 미결 1번(6열을 폰에서 한 줄로
                둘지, 날짜 줄·시각 줄 두 줄로 접을지). 열당 약 50px이라 스와이프 대상이
                얼마나 좁아지는지가 판단 근거인데 에뮬레이션으로는 알 수 없는 종류라서
                강제로 정하지 않았습니다. 위 “초까지” 픽커를 폰에서 열고 <strong>6열 배치</strong>로 두 모양을
                비교해 주세요.
              </p>
              <p className="muted-copy" style={{ marginTop: 4 }}>
                <strong>두 줄로 접으면 팝오버가 세로로 훨씬 길어져 안이 스크롤될 가능성이
                높습니다</strong>(375px 뷰포트·이 픽커 위치 기준 실측: 한 줄일 때도 이미
                자리가 모자라 227px로 줄어 스크롤되는데, 두 줄로 접으면 필요한 높이가
                309px → 527px로 늘어 스크롤이 훨씬 길어집니다 — §7.0). 완료·지금 버튼은
                팝오버 바닥에 붙어 있어 스크롤과 무관하게 항상 손에 닿습니다. 잘려 보이는
                것 자체가 버그가 아니라 이 트레이드오프입니다.
              </p>
            </Panel>
          </PanelGrid>
          <PanelGrid>
            <Panel title="텍스트와 버튼" hint="CONTROLS">
              {/* data-keyboard-keep-visible: 모바일에서 이 필드에 포커스하면 AppShell이
                  이 블록 전체(메모 + 아래 버튼 줄)의 아래쪽을 키보드 위로 들어올린다 —
                  필드 자신의 아래쪽만 기준으로 삼으면 취소/삭제/저장 버튼이 계속 키보드
                  뒤에 남는다. README.md의 "data-keyboard-keep-visible" 항목 참고. */}
              <div data-keyboard-keep-visible>
                <label>메모 (3줄에서 시작해 자동 확장)<AutoGrowTextarea value={memo} onChange={setMemo} placeholder="여러 줄을 입력해 보세요" maxLength={500} ariaLabel="메모" /></label>
                <div className="button-row" style={{ marginTop: 16 }}>
                  <button type="button" className="secondary-button">취소</button>
                  <button type="button" className="danger-button">삭제</button>
                  <button type="button" className="primary">저장</button>
                </div>
              </div>
            </Panel>
            <Panel title="다이얼로그" hint="DIALOG">
              <p className="muted-copy">백드롭 클릭·Escape로 닫히고, 포커스가 안에 갇히며, 닫히면 열었던 버튼으로 포커스가 돌아옵니다.</p>
              <div className="button-row" style={{ marginTop: 16 }}>
                <button type="button" className="secondary-button" onClick={() => setDialog("scroll")}>긴 다이얼로그</button>
                <button type="button" className="primary" onClick={() => setDialog("basic")}>다이얼로그 열기</button>
              </div>
            </Panel>
          </PanelGrid>
          <PanelGrid>
            {/* 옵트인 모듈입니다 — `ShortcutProvider`를 안 쓰면 리스너가 0개입니다
                (단축키 설계 스펙 §8). 이 패널은 그걸 쓰는 예시이자 `ShortcutSettings`를
                실제로 눌러 볼 수 있는 자리입니다. */}
            <Panel title="단축키" hint="SHORTCUTS">
              <ShortcutPanelIntro />
              <p className="muted-copy">
                <strong>맨 키(수식어 없는 키) 허용 구역을 보려면:</strong> 아래에서 이 조합을
                지우고 수식어 없이 <kbd>\</kbd> 하나만 다시 녹음하세요. ① <code>.workspace</code>
                안의 <strong>버튼</strong>을 클릭해 거기 포커스를 둔 채 <kbd>\</kbd>를 누르면
                동작합니다 — <code>.workspace</code>에 <code>data-kkqq-shortcut-scope</code>가
                붙어 있어서입니다(설계 스펙 §2.2). ② 사이드바의 아무 버튼에 포커스를 둔 채
                누르면 동작하지 않습니다 — 사이드바는 <code>.workspace</code> 밖의 형제라
                표식이 안 걸립니다. ③ 위 메모 칸에 포커스가 있을 때 누르면 그냥 <kbd>\</kbd>가
                입력됩니다 — 타이핑 중에는 맨 키가 규칙 4로 막힙니다. ④ <strong>같은 구역
                안이라도 레이아웃 패널의 슬라이더에 포커스를 두면 동작하지 않습니다</strong> —
                폼 컨트롤은 맨 키를 이미 쓰고 있어서 규칙 9가 양보합니다(§2.6). 안 그러면
                규칙 6의 <code>preventDefault</code>가 슬라이더의 화살표 조작을 죽입니다.
                <strong>Ctrl+\</strong>처럼
                수식어가 붙은 조합은 규칙 2로 어디서나 걸리므로, 이 차이는 맨 키로 바꿔야만
                보입니다.
              </p>
              {/* onChange를 안 넘깁니다 — ShortcutProvider가 storage(shortcutStorage)를
                  받은 uncontrolled이므로, 녹음·지우기는 registry.setBinding을 거쳐
                  localStorage에 바로 저장됩니다(Task 7). */}
              <ShortcutSettings />
            </Panel>
            <ImeCapturePanel />
          </PanelGrid>
        </>}

        {tab === "layout" && <>
          <SectionHeading title="레이아웃" description="설명이 3줄 자리를 예약하므로 탭을 옮겨도 첫 카드가 같은 세로 위치에서 시작합니다." />
          <SummaryGrid>
            <SummaryCard label="기본" value="1,234,000원" />
            <SummaryCard label="강조" value="820,000원" tone="teal" />
            <SummaryCard label="증가" value="+312,000원" tone="green" />
            <SummaryCard label="주의" value="-98,000원" tone="orange" />
          </SummaryGrid>
          {/* **패널 순서는 앱이 정합니다 — 킷은 받은 순서대로 놓을 뿐입니다.**
              여기서는 배열로 렌더해 그것을 눈으로 보이게 했습니다. 실제 앱이라면 이 배열을
              사용자 설정에서 읽어 오면 됩니다(사이드바 접힘·테마와 같은 방식 — PRINCIPLES §8:
              상태는 controlled이고 저장은 쓰는 쪽 책임입니다).
              ⚠️ CSS의 `order`로 옮기지 마세요 — 화면만 바뀌고 **Tab 순서와 읽기 순서는
              그대로**라 둘이 어긋납니다. 배열을 바꾸는 쪽이 맞습니다. */}
          <div className="button-row" style={{ marginBottom: 12 }}>
            <button type="button" className="secondary-button" onClick={() => setPanelOrder((current) => [...current.slice(1), current[0]])}>패널 순서 돌리기</button>
            {/* 세 패널의 높이를 일부러 다르게 뒀으므로 이 버튼 하나로 차이가 그대로 보입니다.
                끄면 각자 제 높이(짧은 쪽 아래가 빔), 켜면 한 줄이 같은 높이(빈 자리가 짧은
                패널 **안쪽**으로 들어감). 없어지는 게 아니라 옮겨갈 뿐입니다. */}
            <button type="button" className={panelStretch ? "primary" : "secondary-button"} aria-pressed={panelStretch} onClick={() => setPanelStretch((value) => !value)}>
              {panelStretch ? "높이 맞춤 켜짐" : "높이 맞춤 꺼짐"}
            </button>
          </div>
          <PanelGrid stretch={panelStretch}>
            {panelOrder.map((id) => LAYOUT_PANELS[id]())}
          </PanelGrid>
        </>}
  
        {tab === "colors" && <>
          <SectionHeading title="색상 토큰" description="모든 컴포넌트 CSS는 이 토큰만 참조합니다. 여기서 바꾸면 화면 전체가 즉시 따라 바뀌고, 라이트·다크는 따로 저장됩니다." />
  
          <Panel title="색을 누가 저장하나" hint="아래 편집기가 이 설정으로 돕니다">
            <p className="demo-owner-note">
              이 편집기는 <code>createThemePalette([...THEME_TOKEN_GROUPS, DEMO_GROUP])</code>로 돕니다 —
              그래서 킷이 모르는 <code>--demo-brand</code> 카드가 <b>데모 앱 색</b> 무리에 함께 나옵니다.
              고쳐 보세요, 이 칩이 따라 바뀝니다: <span className="demo-brand-chip">데모 브랜드</span>
            </p>
            <div className="button-row" style={{ marginBottom: 10 }}>
              <button
                type="button"
                className={appOwnsColors ? "primary" : "secondary-button"}
                aria-pressed={appOwnsColors}
                onClick={() => setAppOwnsColors((owned) => !owned)}
              >
                {appOwnsColors ? "앱이 저장(켜짐)" : "킷이 저장(꺼짐)"}
              </button>
              <button type="button" className="secondary-button" onClick={() => {
                /* 앱이 소유하면 저장소가 아니라 **앱이 가진 값**으로 봉투를 만듭니다 —
                   인자를 빼면 `read`로 저장소를 보므로 controlled 앱에서는 빈 백업이 나옵니다. */
                const backup = appOwnsColors ? demoPalette.serialize(serverColors) : demoPalette.serialize();
                setBackupText(JSON.stringify(backup, null, 2));
                setRestoreNote(`백업을 만들었습니다 — 라이트 ${Object.keys(backup.colors.light).length}개, 다크 ${Object.keys(backup.colors.dark).length}개`);
              }}>백업 만들기</button>
              <button type="button" className="secondary-button" onClick={() => {
                let raw: unknown;
                try { raw = JSON.parse(backupText); } catch { setRestoreNote("JSON이 아닙니다"); return; }
                const parsed = demoPalette.parse(raw);
                if (!parsed) { setRestoreNote("이 파일은 색 백업이 아닙니다(봉투 모양이 아니거나 version이 다름)"); return; }
                /* ⚠️ 소유자에 따라 복원 경로가 갈립니다. `applyBackup`은 **저장까지** 하므로,
                   앱이 소유하는 동안 쓰면 앱 저장소 밖에 사본이 하나 더 생깁니다. */
                if (appOwnsColors) {
                  setServerColors(parsed.backup.colors);
                  demoPalette.apply(theme, parsed.backup.colors[theme]);
                } else {
                  demoPalette.applyBackup(parsed.backup, theme);   // theme은 필수 — :root는 하나뿐입니다
                }
                setRestoreNote(parsed.dropped.length ? `복원했습니다. 모르는 색 ${parsed.dropped.length}개는 뺐습니다: ${parsed.dropped.join(", ")}` : "복원했습니다");
              }}>복원</button>
            </div>
            <p className="demo-owner-note">
              마지막 <code>onCommit</code>: {lastCommit} · {restoreNote || "피커를 끄는 동안은 안 불리고, 손을 떼거나 500ms 쉬면 한 번 불립니다"}
            </p>
            <textarea
              className="demo-backup-box"
              aria-label="색 백업 JSON"
              value={backupText}
              onChange={(event) => setBackupText(event.target.value)}
              placeholder="백업 만들기를 누르면 여기에 봉투가 나옵니다. 값을 고쳐 복원해 보면 모르는 색이 어떻게 걸러지는지 보입니다."
            />
          </Panel>
  
          <ThemeColorEditor
            theme={theme}
            palette={demoPalette}
            overrides={appOwnsColors ? serverColors[theme] : undefined}
            onChange={appOwnsColors ? ((next) => setServerColors((current) => ({ ...current, [theme]: next }))) : undefined}
            onCommit={(next) => setLastCommit(`${Object.keys(next).length}개 색`)}
          />
        </>}
      </AppShell>
    </ShortcutProvider>

    <Dialog open={dialog === "basic"} onClose={() => setDialog("none")} ariaLabel="분류 등록" onSubmit={() => setDialog("none")}>
      <DialogHeading eyebrow="CATEGORY" title="분류 등록" />
      <label>분류 이름<input placeholder="예: 출장비" required /></label>
      <label>메모<AutoGrowTextarea value={memo} onChange={setMemo} maxLength={500} ariaLabel="분류 메모" placeholder="설명을 입력하세요" /></label>
      <DialogActions>
        <button type="button" className="danger" onClick={() => setDialog("none")}>삭제</button>
        <button type="button" onClick={() => setDialog("none")}>취소</button>
        <button className="primary">등록</button>
      </DialogActions>
    </Dialog>

    {/* 화면보다 긴 다이얼로그. 입력칸을 섞어 뒀으니 휴대폰에서 아무 칸이나 눌러
        키보드를 올려 보세요 — 위에 붙은 채 안에서 스크롤되고, 키보드는 계속 보이고,
        액션 줄은 바닥에 붙어 있어야 합니다. 맨 아래 칸까지 스크롤해서 눌러 보면
        키보드가 올라온 상태에서의 스크롤도 확인됩니다. */}
    <Dialog open={dialog === "scroll"} onClose={() => setDialog("none")} ariaLabel="긴 다이얼로그" wide scroll>
      <DialogHeading eyebrow="SETTINGS" title="항목 설정" />
      <p className="muted-copy">입력칸을 눌러 키보드를 올린 채 위아래로 스크롤해 보세요.</p>
      {LONG_DIALOG_FIELDS.map((field, index) => {
        const key = `${field.kind}-${index}`;
        if (field.kind === "select") return <label key={key}>{field.label}<Select ariaLabel={field.label} value={currency} options={SHORT_OPTIONS} onChange={setCurrency} portal /></label>;
        if (field.kind === "date") return <label key={key}>{field.label}<DateWheelPicker ariaLabel={field.label} value={date} onChange={setDate} /></label>;
        if (field.kind === "memo") return <label key={key}>{field.label}<AutoGrowTextarea value={memo} onChange={setMemo} maxLength={500} ariaLabel={field.label} placeholder={field.placeholder} /></label>;
        return <label key={key}>{field.label}<input inputMode={field.numeric ? "numeric" : undefined} placeholder={field.placeholder} /></label>;
      })}
      <DialogActions>
        <button type="button" onClick={() => setDialog("none")}>취소</button>
        <button type="button" className="primary" onClick={() => setDialog("none")}>저장</button>
      </DialogActions>
    </Dialog>
  </MobilePageTabsContext.Provider>;
}

// HMR로 이 모듈이 다시 실행돼도 createRoot를 두 번 부르지 않게 붙잡아 둡니다.
const globalRoot = globalThis as unknown as { __demoRoot?: ReturnType<typeof createRoot> };
globalRoot.__demoRoot ??= createRoot(document.getElementById("root")!);
globalRoot.__demoRoot.render(<StrictMode><Demo /></StrictMode>);

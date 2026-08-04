/* 데모 겸 CSS 누락 확인용 페이지. 다른 프로젝트로 복사할 때는 필요 없습니다.
 * 실행: design-system 폴더에서 node_modules/.bin/vite → http://localhost:5273
 */
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import "../css/index.css";
import "./demo.css";
import { EventTracePanel } from "./EventTracePanel";
import { clearProbeLog, historyProbeEnabled, installHistoryProbe, logProbe, readProbeLog } from "./historyProbe";

// React보다 먼저 설치해야 첫 줄이 "페이지 로드"로 남습니다.
installHistoryProbe();
import {
  AppShell,
  AutoGrowTextarea,
  DateWheelPicker,
  Dialog,
  DialogActions,
  DialogHeading,
  MobilePageTabs,
  MobilePageTabsContext,
  MobileQuickBar,
  Panel,
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
  applyTokenOverrides,
} from "../src";

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

type KeyboardInspectorSnapshot = { focus: string; focusVisible: string; rule: string; background: string };

/** 지금 열려 있는 Select 트리거 하나를 찾는다. 메뉴가 아니라 **트리거**를 기준으로
 * 삼는 이유: 포털 모드 메뉴는 body 맨 끝에 따로 렌더되어 document 순서가 "실제로
 * 열려 있는 것"과 무관하지만, 트리거는 열려 있는 동안만 aria-expanded="true"를
 * 달기 때문에(Select.tsx:404) 자기 상태를 스스로 증명한다. */
function findOpenSelectTrigger(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[aria-haspopup="listbox"][aria-expanded="true"]');
}

/** 트리거의 aria-controls가 그 트리거의 메뉴 id를 가리킨다(Select.tsx:405) — 이걸
 * 따라가면 portal 여부와 무관하게 정확히 그 Select의 메뉴를 얻는다. */
function findOpenSelectMenu(trigger: HTMLElement): HTMLElement | null {
  const menuId = trigger.getAttribute("aria-controls");
  return menuId ? document.getElementById(menuId) : null;
}

/** 활성 옵션을 키트 내부 로직을 베끼지 않고 DOM에 이미 나와 있는 표식으로만 찾는다:
 * roving 변형은 tabindex="0", descendant 변형은 .active 클래스, 혹은 트리거의
 * aria-activedescendant가 가리키는 요소 — Select.tsx가 실제로 쓰는 세 가지 표식 그대로다. */
function findActiveOption(menu: HTMLElement, trigger: HTMLElement): HTMLElement | null {
  const descendantId = trigger.getAttribute("aria-activedescendant");
  if (descendantId) {
    const byId = document.getElementById(descendantId);
    if (byId) return byId;
  }
  return menu.querySelector<HTMLElement>('[tabindex="0"]') ?? menu.querySelector<HTMLElement>(".active");
}

/** :focus-visible과 마찬가지로, 오래된 엔진은 다른 가상클래스도 모르는 채로
 * matches()에서 던질 수 있다. rule= 판정에 쓰는 matches() 호출을 전부 이 헬퍼로
 * 감싸서 "지원 안 함(null)"과 "매칭 안 됨(false)"을 구분한다. */
function matchesSafe(element: Element, selector: string): boolean | null {
  try {
    return element.matches(selector);
  } catch {
    return null;
  }
}

/** activeOption이 실제로 어느 CSS 규칙에 걸려 강조되는지 "이름"으로 판정한다 —
 * 계산된 배경색이 아니라 클래스 소속·가상클래스 매칭이라는 사실 그 자체로.
 *
 * 왜 색 대신 이름인가(Critical 리뷰 항목 (a)): .app-select-menu button의
 * background-color는 var(--motion-fast)(140ms, css/tokens.css:49) 동안
 * 트랜지션한다(css/surfaces.css:22). 이 계측기는 200ms마다 폴링하므로, 표본이 그
 * 140ms 트랜지션 창 안에 들어가면 보간 중인 색을 그대로 붙잡을 수 있다. 게다가
 * Chromium은 보간 도중 직렬화 표기법 자체를 바꾼다 — 정지 상태는
 * color(srgb …), 보간 중에는 oklab(…) — 그래서 실제 상태는 전혀 안 바뀌었는데도
 * in-flight 표본이 정지 표본과 완전히 달라 보일 수 있다.
 *
 * 이게 그냥 이론이 아니라 실제로 오독을 냈다: 이전 리포트의 "roving, ArrowDown
 * 이후 — 더 밝아짐" 관찰값은 oklab(0.307752 0.0121395 -0.0646284 / 0.78)이었는데,
 * 이 값의 밝기(L)와 알파(0.78)는 바로 직전의 "어두운" 판독값
 * color(srgb 0.164706 0.168627 0.313726 / 0.78)과 완전히 같다 — 즉 둘 다 어두운
 * --accent-soft 78%(css/select.css:54)이고, 하나는 그저 트랜지션 t≈0 시점에
 * 잡힌 것뿐이다. 진짜 강조색은 rgb(87, 91, 212)(--accent)이며, 이건 descendant
 * 모드 판독에서만 나타났다. 색만 보고 "더 밝아졌다"고 판단한 것 자체가 오독이었다.
 *
 * 반면 클래스 소속(.active/.selected)과 :focus-visible 매칭 여부는 보간되지
 * 않는다 — 트랜지션 중 어느 순간에 붙잡혀도 항상 그 순간의 진짜 값이다. 그래서
 * rule=이 소유자가 읽어야 할 1차 신호가 된다. */
function computeHighlightRule(activeOption: HTMLElement, focusVisible: string): string {
  const disabled = matchesSafe(activeOption, ":disabled");
  if (disabled === null) return "?";
  if (!disabled) {
    // css/surfaces.css:26의 :is(:hover, :focus-visible, .active):not(:disabled)가
    // css/select.css:54의 옅은 .selected 규칙보다 항상 이긴다(캐스케이드에서 더
    // 뒤에 오고 특이도도 밀리지 않는다) — 그래서 이 셋을 .selected보다 먼저 본다.
    if (focusVisible === "?") return "?";
    if (focusVisible === "true") return "focus-visible";
    if (activeOption.classList.contains("active")) return "active";
    const hover = matchesSafe(activeOption, ":hover");
    if (hover === null) return "?";
    if (hover) return "hover";
    if (activeOption.classList.contains("selected")) return "selected(dim)";
  }
  return "none";
}

/** foc/fv/rule과 활성 옵션 DOM 참조 — 배경색과 달리 보간되지 않으므로 폴링마다
 * 즉시 계산해도 안전하다(computeHighlightRule의 주석 참고). */
function readKeyboardInstantFacts(): { focus: string; focusVisible: string; rule: string; activeOption: HTMLElement | null } {
  const trigger = findOpenSelectTrigger();
  const menu = trigger ? findOpenSelectMenu(trigger) : null;
  if (!trigger || !menu) return { focus: "-", focusVisible: "-", rule: "-", activeOption: null };
  const activeOption = findActiveOption(menu, trigger);

  const activeElement = document.activeElement;
  let focus: string;
  if (activeElement === trigger) focus = "trigger";
  else if (activeOption && activeElement === activeOption) focus = "option";
  else if (activeElement === document.body) focus = "body";
  // 표식이 가리키는 옵션과는 다르지만 포커스가 메뉴 안에 있는 경우 — 표식과 실제
  // 포커스가 어긋났다는 뜻이라 "other"로 뭉개지 않고 따로 알린다. 이게 바로 이
  // 계측기가 잡아내야 할 종류의 드리프트다.
  else if (activeElement && menu.contains(activeElement)) focus = "option*";
  else focus = "other";

  // 오래된 엔진은 :focus-visible 자체를 모르는 가상 클래스로 보고 matches()에서 던진다 — "?"로 보고한다.
  let focusVisible = "-";
  if (activeOption) {
    try {
      focusVisible = String(activeOption.matches(":focus-visible"));
    } catch {
      focusVisible = "?";
    }
  }

  const rule = activeOption ? computeHighlightRule(activeOption, focusVisible) : "-";

  return { focus, focusVisible, rule, activeOption };
}

/** bg= 안정화 상태. foc/fv/rule 조합 또는 활성 옵션 DOM 참조가 마지막으로 바뀐
 * 시점(since)을 들고 있는다. */
type BackgroundStability = { key: string; activeOption: HTMLElement | null; since: number };

// 140ms 트랜지션(css/tokens.css:49의 --motion-fast)을 확실히 넘기는 값 — "적어도
// 200ms 동안 상태 변화 없음"을 요구하면 트랜지션이 끝난 뒤에만 읽게 된다.
const BACKGROUND_SETTLE_MS = 200;

/** 벽시계로 200ms가 지났다는 것과 "트랜지션이 실제로 끝났다"는 것은 별개다 — 탭이
 * 화면에 그려지지 않으면(백그라운드 탭, iOS 저전력 모드, 앱 전환 후 복귀) 렌더링
 * 자체가 멎어 트랜지션 시계가 t=0 근처에 멈춘 채로 벽시계만 흐를 수 있다. 소유자가
 * 이 계측기를 읽는 곳이 바로 폰이므로 이 경우를 놓치면 안 된다. getAnimations()로
 * 이 요소에 아직 진행 중(running)인 CSS 트랜지션이 있는지 직접 물어서 벽시계 판정을
 * 보강한다 — 지원하지 않는 엔진에서는 null(판정 불가)을 반환해 기존 벽시계 판정만
 * 쓰게 한다(구버전 엔진에서 동작을 절대 더 나쁘게 만들지 않기 위해). */
function hasRunningTransition(element: HTMLElement): boolean | null {
  if (typeof element.getAnimations !== "function") return null;
  try {
    return element.getAnimations().some((animation) => animation.playState === "running");
  } catch {
    return null;
  }
}

/** Critical 리뷰 항목 (b): bg=를 지우는 대신 믿을 수 있게 만든다. foc/fv/rule/활성
 * 옵션 중 하나라도 바뀌면 그 순간부터 다시 BACKGROUND_SETTLE_MS를 기다렸다가만
 * getComputedStyle을 읽는다 — 그 전에 읽으면 위 computeHighlightRule 주석에 적은
 * "더 밝아짐" 오독을 그대로 반복하게 된다. 게다가 벽시계만으로는 부족하다는 게 이
 * 수정을 검증하는 과정에서 실제로 드러났다 — 200ms가 지났다고 판단한 뒤에도
 * getComputedStyle이 여전히 rule=focus-visible의 진짜 값(rgb(87, 91, 212))이 아니라
 * 어두운 .selected 값과 같은 L·알파를 가진 oklab(…) 보간값을 계속 돌려준 사례가
 * 있었다(getAnimations()로 확인하니 해당 요소의 트랜지션이 playState="running",
 * currentTime=0에 멈춰 있었다) — 그래서 getAnimations()로 실제 트랜지션 종료
 * 여부까지 같이 확인한다. 안정될 때까지는 값 대신 "…settling"을 보여줘서, 지금
 * 읽고 있는 게 확정된 값인지 트랜지션 중간인지 소유자가 헷갈리지 않게 한다.
 * stability는 폴링 콜백 하나에서만 갱신되는 가변 ref라 여기서 직접 써도 안전하다. */
function readSettledBackground(
  facts: { focus: string; focusVisible: string; rule: string; activeOption: HTMLElement | null },
  stability: { current: BackgroundStability },
): string {
  if (!facts.activeOption) {
    stability.current = { key: "", activeOption: null, since: Date.now() };
    return "-";
  }

  const key = `${facts.focus}|${facts.focusVisible}|${facts.rule}`;
  const now = Date.now();
  const prev = stability.current;
  const changed = prev.key !== key || prev.activeOption !== facts.activeOption;
  const since = changed ? now : prev.since;
  stability.current = { key, activeOption: facts.activeOption, since };

  if (now - since < BACKGROUND_SETTLE_MS) return "…settling";
  // "=== true"인 경우에만 막는다 — null(판정 불가)까지 막으면 구버전 엔진에서
  // bg=가 영영 "…settling"에 머무를 수 있으므로, 모를 때는 기존 벽시계 판정만 믿는다.
  if (hasRunningTransition(facts.activeOption) === true) return "…settling";
  return getComputedStyle(facts.activeOption).backgroundColor; // 안정된 뒤에는 원본 문자열 그대로
}

function readKeyboardInspectorSnapshot(stability: { current: BackgroundStability }): KeyboardInspectorSnapshot {
  const facts = readKeyboardInstantFacts();
  const background = readSettledBackground(facts, stability);
  return { focus: facts.focus, focusVisible: facts.focusVisible, rule: facts.rule, background };
}

/** 키보드 변형 A/B 계측 판독기 — 데모 전용, A/B 스위치 옆에 작게 붙인다.
 *
 * 이게 왜 필요한가: 폰에서는 메뉴를 여는 동작이 항상 탭이고, roving 변형(A)은 그
 * 클릭 핸들러가 실행한 useLayoutEffect 안에서 활성 옵션에 **프로그램적으로**
 * 포커스를 준다(Select.tsx:274-291). Chromium과 WebKit은 스크립트로 준 포커스에는
 * :focus-visible을 잘 안 붙이는 경향이 있어서, 그 결과 A가 실제로는 옅은 .selected
 * 스타일로만 보이고 descendant 변형(B, .active — React가 모달리티와 무관하게 직접
 * 붙이는 클래스)만 또렷하게 보일 수 있다. 이 차이는 두 아키텍처의 본질이 아니라
 * 브라우저 휴리스틱이 만든 착시일 수 있다 — 소유자가 눈으로만 보고 고르면 이 착시를
 * "B가 더 낫다"로 오해할 수 있다. 그래서 눈이 아니라 계측으로 판단하도록, 지금
 * 포커스가 어디 있는지·:focus-visible이 실제로 맞는지·어떤 하이라이트 규칙이 이겨서
 * 실제로 적용됐는지를 그대로 보여준다. 열린 메뉴가 없으면 "-"로 비워 둔다.
 *
 * rule=과 bg=의 역할 분담(Critical 리뷰 수정): bg=는 계산된 배경색을 그대로 보여줘
 * 왔지만, 그 색은 140ms 트랜지션 중간에 캡처되면 실제 상태와 무관하게 다른 값으로
 * 보일 수 있다는 게 밝혀졌다(computeHighlightRule 주석 참고 — 이전 리포트의 "더
 * 밝아짐" 관찰이 바로 이 착시였다). 그래서 이제 rule=이 소유자가 읽어야 할 1차
 * 신호다 — 클래스 소속과 :focus-visible 매칭은 보간되지 않으므로 언제 붙잡혀도
 * 항상 진짜 값이다. bg=는 폐기하지 않고 "안정된 뒤에만" 읽어 rule=을 보강하는
 * 2차 신호로 남긴다(readSettledBackground 참고) — 안정되기 전에는 값 대신
 * "…settling"을 보여준다.
 */
function KeyboardModeInspector() {
  const stabilityRef = useRef<BackgroundStability>({ key: "", activeOption: null, since: Date.now() });
  const [snapshot, setSnapshot] = useState<KeyboardInspectorSnapshot>(() => readKeyboardInspectorSnapshot(stabilityRef));

  useEffect(() => {
    const timer = window.setInterval(() => setSnapshot(readKeyboardInspectorSnapshot(stabilityRef)), 200);
    return () => window.clearInterval(timer);
  }, []);

  return <span style={{ display: "flex", gap: 8, fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", color: "var(--muted)" }}>
    <span>foc={snapshot.focus}</span>
    <span>fv={snapshot.focusVisible}</span>
    <span>rule={snapshot.rule}</span>
    <span>bg={snapshot.background}</span>
  </span>;
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

function Demo() {
  // 기본은 다크. 저장된 선택이 있으면 그게 우선.
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    return saved === "light" || saved === "dark" ? saved : "dark";
  });
  // 접힘 상태를 브라우저에 기억해 다음 방문에 그대로 재현합니다. Sidebar는 controlled라
  // 저장은 쓰는 쪽 책임입니다(PRINCIPLES §8).
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("controls");
  const [currency, setCurrency] = useState("krw");
  const [centered, setCentered] = useState("krw");
  const [long, setLong] = useState("item-0");
  // A/B 비교용 임시 토글 — 소유자가 고르면 이것과 진 변형을 같이 지웁니다.
  const [keyboardActiveMode, setKeyboardActiveMode] = useState<"roving" | "descendant">("roving");
  const [date, setDate] = useState("2026-07-23");
  const [optionalDate, setOptionalDate] = useState("");
  const [memo, setMemo] = useState("");
  const [dialog, setDialog] = useState<"none" | "basic" | "scroll">("none");
  const [navHidden] = useScrollDirectionHidden();
  const keyboardOpen = useVirtualKeyboardOpen();
  const pageTabs = useMobilePageTabs();

  // 다이얼로그가 열리고 닫힌 시점을 history 기록에 같이 남깁니다.
  useEffect(() => { logProbe(`다이얼로그 = ${dialog}`); }, [dialog]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
    applyTokenOverrides(theme);   // 테마마다 저장된 색이 다르므로 전환할 때마다 다시 적용
  }, [theme]);

  useEffect(() => { localStorage.setItem("sidebarCollapsed", String(collapsed)); }, [collapsed]);

  const navItem = (id: string, label: string, icon: keyof typeof ICONS, badge?: number) => ({
    id, label, badge, icon: <Glyph d={ICONS[icon]} />, active: page === id, onSelect: () => setPage(id),
  });

  return <MobilePageTabsContext.Provider value={pageTabs.context}>
    {/* Select 터치 버그를 실제 휴대폰에서 진단하기 위한 임시 계측 패널. 기본은 닫혀
        있어 평소 데모 화면에 영향이 없습니다. demo/EventTracePanel.tsx 참고. */}
    <EventTracePanel />
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
          <Select ariaLabel="작업 공간" value={currency} options={SHORT_OPTIONS} onChange={setCurrency} portal keyboardActiveMode={keyboardActiveMode} />
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
      <SectionTabs ariaLabel="데모 섹션" value={tab} tabs={TABS as unknown as Array<{ value: string; label: string }>} onChange={(next) => setTab(next as typeof tab)} />

      {tab === "controls" && <>
        {historyProbeEnabled() && <HistoryLogPanel />}
        <SectionHeading title="컨트롤" description="입력·드롭다운·날짜는 41px, 표준 액션은 38px, 조밀한 액션은 32px입니다. 같은 문맥의 버튼은 반드시 같은 높이를 씁니다." />
        <Panel title="드롭다운" hint="SELECT">
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 12 }}>키보드 변형</strong>
            <button type="button" onClick={() => setKeyboardActiveMode("roving")} aria-pressed={keyboardActiveMode === "roving"}>A: roving</button>
            <button type="button" onClick={() => setKeyboardActiveMode("descendant")} aria-pressed={keyboardActiveMode === "descendant"}>B: descendant</button>
            <KeyboardModeInspector />
          </div>
          <div className="demo-grid">
            <label>왼쪽 정렬 (기본)<Select ariaLabel="통화" value={currency} options={SHORT_OPTIONS} onChange={setCurrency} keyboardActiveMode={keyboardActiveMode} /></label>
            <label>가운데 정렬<Select ariaLabel="가운데 정렬 통화" align="center" value={centered} options={SHORT_OPTIONS} onChange={setCentered} keyboardActiveMode={keyboardActiveMode} /></label>
            <label>긴 목록 (위로 열림 확인)<Select ariaLabel="긴 목록" value={long} options={LONG_OPTIONS} onChange={setLong} keyboardActiveMode={keyboardActiveMode} /></label>
            <label>비활성<Select ariaLabel="비활성 드롭다운" value={currency} options={SHORT_OPTIONS} onChange={setCurrency} disabled keyboardActiveMode={keyboardActiveMode} /></label>
          </div>
        </Panel>
        <Panel title="날짜 피커" hint="DATE WHEEL">
          <div className="demo-grid">
            <label>필수 날짜<DateWheelPicker ariaLabel="거래 날짜" value={date} onChange={setDate} /></label>
            <label>선택 날짜 (비우기 가능)<DateWheelPicker ariaLabel="종료일" value={optionalDate} onChange={setOptionalDate} allowClear /></label>
            <label>범위 제한 (2026년만)<DateWheelPicker ariaLabel="제한 날짜" value={date} onChange={setDate} min="2026-01-01" max="2026-12-31" /></label>
            <label>연·월만 (fields)<DateWheelPicker ariaLabel="예산 월" value={date} onChange={setDate} fields={["year", "month"]} /></label>
            <label>연도만 (fields)<DateWheelPicker ariaLabel="회계 연도" value={date} onChange={setDate} fields={["year"]} /></label>
            <label>영어 라벨<DateWheelPicker ariaLabel="Date" value={date} onChange={setDate} labels={{ placeholder: "Pick a date", hint: "Scroll or swipe", today: "Today", clear: "Clear", done: "Done", setToday: "set to today", previous: "previous", next: "next", select: "picker", weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], units: { year: "Year", month: "Month", day: "Day" } }} /></label>
          </div>
        </Panel>
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
      </>}

      {tab === "layout" && <>
        <SectionHeading title="레이아웃" description="설명이 3줄 자리를 예약하므로 탭을 옮겨도 첫 카드가 같은 세로 위치에서 시작합니다." />
        <SummaryGrid>
          <SummaryCard label="기본" value="1,234,000원" />
          <SummaryCard label="강조" value="820,000원" tone="teal" />
          <SummaryCard label="증가" value="+312,000원" tone="green" />
          <SummaryCard label="주의" value="-98,000원" tone="orange" />
        </SummaryGrid>
        <Panel title="패널" hint="PANEL" actions={<button type="button" className="secondary-button">액션</button>}>
          <p className="muted-copy">콘텐츠는 작업 영역 전체 폭의 패널에서 시작합니다. 반응형 그리드는 이 부모 폭을 나눠 쓰고, 더 좁은 컨테이너를 새로 만들지 않습니다.</p>
          <div className="error" style={{ marginTop: 12 }}>오류 메시지 예시입니다.</div>
          <div className="success">성공 메시지 예시입니다.</div>
        </Panel>
      </>}

      {tab === "colors" && <>
        <SectionHeading title="색상 토큰" description="모든 컴포넌트 CSS는 이 토큰만 참조합니다. 여기서 바꾸면 화면 전체가 즉시 따라 바뀌고, 라이트·다크는 따로 저장됩니다." />
        <ThemeColorEditor theme={theme} />
      </>}
    </AppShell>

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
        if (field.kind === "select") return <label key={key}>{field.label}<Select ariaLabel={field.label} value={currency} options={SHORT_OPTIONS} onChange={setCurrency} portal keyboardActiveMode={keyboardActiveMode} /></label>;
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

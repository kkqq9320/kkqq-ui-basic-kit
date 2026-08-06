/* 데모 겸 CSS 누락 확인용 페이지. 다른 프로젝트로 복사할 때는 필요 없습니다.
 * 실행: design-system 폴더에서 node_modules/.bin/vite → http://localhost:5273
 */
import { StrictMode, useEffect, useState } from "react";
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
  // 완료 피드백 A/B/D 비교용 임시 토글 — 소유자가 고르면 이것과 진 변형들을
  // css/surfaces.css에서 함께 지웁니다(2aecf7e가 Select 키보드 변형에 했던 것과 같은
  // 패턴). 기본은 소유자가 선호한다고 밝힌 C(값이 올라오며 나타남)입니다.
  const [commitFeedback, setCommitFeedback] = useState<"c" | "a" | "d">("c");
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

  // css/surfaces.css의 html[data-commit-feedback="c"|"a"|"d"] 규칙이 이 속성을 읽습니다.
  useEffect(() => { document.documentElement.dataset.commitFeedback = commitFeedback; }, [commitFeedback]);

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
      <SectionTabs ariaLabel="데모 섹션" value={tab} tabs={TABS as unknown as Array<{ value: string; label: string }>} onChange={(next) => setTab(next as typeof tab)} />

      {tab === "controls" && <>
        {historyProbeEnabled() && <HistoryLogPanel />}
        <SectionHeading title="컨트롤" description="입력·드롭다운·날짜는 41px, 표준 액션은 38px, 조밀한 액션은 32px입니다. 같은 문맥의 버튼은 반드시 같은 높이를 씁니다." />
        {/* 완료 피드백 A/B/D 비교용 임시 패널. 드롭다운과 날짜 피커 둘 다에 적용되므로 두
            Panel보다 위에 한 번만 둡니다. 소유자가 고르면 이 블록 전체와 css/surfaces.css의
            진 변형 규칙들을 함께 지웁니다. */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 12 }}>완료 피드백 (임시 A/B/D)</strong>
          <button type="button" onClick={() => setCommitFeedback("c")} aria-pressed={commitFeedback === "c"}>C: 값이 올라오며 나타남</button>
          <button type="button" onClick={() => setCommitFeedback("a")} aria-pressed={commitFeedback === "a"}>A: 강조색으로 반짝</button>
          <button type="button" onClick={() => setCommitFeedback("d")} aria-pressed={commitFeedback === "d"}>D: 둘 다 (한 타임라인)</button>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>지금: {commitFeedback.toUpperCase()} — 드롭다운을 고르거나 날짜에서 완료를 눌러 확인하세요</span>
        </div>
        <Panel title="드롭다운" hint="SELECT">
          <div className="demo-grid">
            <label>왼쪽 정렬 (기본)<Select ariaLabel="통화" value={currency} options={SHORT_OPTIONS} onChange={setCurrency} /></label>
            <label>가운데 정렬<Select ariaLabel="가운데 정렬 통화" align="center" value={centered} options={SHORT_OPTIONS} onChange={setCentered} /></label>
            <label>긴 목록 (위로 열림 확인)<Select ariaLabel="긴 목록" value={long} options={LONG_OPTIONS} onChange={setLong} /></label>
            <label>비활성<Select ariaLabel="비활성 드롭다운" value={currency} options={SHORT_OPTIONS} onChange={setCurrency} disabled /></label>
            {/* 아래 둘은 disabled prop을 주지 않았는데도 비활성으로 보여야 합니다 —
                고를 수 있는 옵션이 하나도 없으면 컨트롤 자체가 비활성입니다(PRINCIPLES §3).
                왼쪽의 "비활성"과 나란히 두어 셋이 같아 보이는지 확인하세요. */}
            <label>옵션이 전부 비활성<Select ariaLabel="전부 비활성 드롭다운" value="krw" options={ALL_DISABLED_OPTIONS} onChange={setCurrency} /></label>
            <label>옵션이 없음<Select ariaLabel="빈 드롭다운" value="" options={[]} onChange={setCurrency} /></label>
          </div>
        </Panel>
        <Panel title="날짜 피커" hint="DATE WHEEL">
          <div className="demo-grid">
            <label>필수 날짜<DateWheelPicker ariaLabel="거래 날짜" value={date} onChange={setDate} /></label>
            <label>선택 날짜 (비우기 가능)<DateWheelPicker ariaLabel="종료일" value={optionalDate} onChange={setOptionalDate} allowClear /></label>
            <label>범위 제한 (2026년만)<DateWheelPicker ariaLabel="제한 날짜" value={date} onChange={setDate} min="2026-01-01" max="2026-12-31" /></label>
            <label>연·월만 (fields)<DateWheelPicker ariaLabel="예산 월" value={date} onChange={setDate} fields={["year", "month"]} /></label>
            <label>연도만 (fields)<DateWheelPicker ariaLabel="회계 연도" value={date} onChange={setDate} fields={["year"]} /></label>
            <label>영어 라벨<DateWheelPicker ariaLabel="Date" value={date} onChange={setDate} labels={{ placeholder: "Pick a date", hint: "Scroll, swipe, arrow keys, or type digits · Ctrl+; today", today: "Today", clear: "Clear", done: "Done", previous: "previous", next: "next", select: "picker", weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], units: { year: "Year", month: "Month", day: "Day" } }} /></label>
            {/* 비활성 예시가 없어서 이 상태를 아무도 본 적이 없었습니다 — 드롭다운의
                "비활성"과 나란히 놓고 같은 흐리기인지 확인하세요. */}
            <label>비활성<DateWheelPicker ariaLabel="비활성 날짜" value={date} onChange={setDate} disabled /></label>
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

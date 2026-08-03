/* 이벤트 추적 계측기 — 데모 전용 진단 도구입니다. 키트(src/)의 일부가 아니며,
 * Select 동작을 조금도 바꾸지 않습니다: document에 캡처 단계로 리스너만 걸고,
 * 절대 preventDefault/stopPropagation을 부르지 않습니다(전부 passive).
 *
 * 실제 휴대폰에서만 재현되는 버그라 개발자도구를 열 수 없습니다. 그래서 페이지
 * 로드 시점부터 조용히 기록해 뒀다가, 화면 위 패널(EventTracePanel)에서 그대로
 * 읽고 복사할 수 있게 합니다. sessionStorage에는 남기지 않습니다 — 패널을 켜고
 * 그 자리에서 재현하는 용도라 새로고침을 넘어 남을 필요가 없습니다.
 */

export type TraceEntry = { text: string };

// 80은 원래 Select 탭/클릭 진단용으로 충분했지만, 이 파일이 추가하는 kb 트리거+settle
// 줄(뷰포트 이벤트 하나당 최대 2줄, 안드로이드는 스크롤마다도 쏜다)은 그보다 훨씬 빨리
// 링버퍼를 채운다. 버그가 "특정 위치에서" 재현되므로 그 위치로 스크롤하는 과정 자체가
// 탭하기도 전에 80줄을 다 밀어낼 수 있어 400으로 올렸다 — 짧은 문자열 배열이라 비용은
// 무시할 만하다.
const MAX_ENTRIES = 400;
/** 이보다 긴 공백 뒤에 오는 이벤트는 새 "묶음"으로 치고 +0ms부터 다시 셉니다. */
const BURST_GAP_MS = 700;

/** src/AppShell.tsx:14의 KEYBOARD_SCROLL_GAP과 같은 값 — overshoot 공식을 그대로
 * 재현하려면 같은 여유값을 더해야 합니다. */
const KEYBOARD_SCROLL_GAP = 8;
/** src/AppShell.tsx:19의 KEYBOARD_SCROLL_ANIMATION_MS(400ms) + 여유. 리컴포짓 직후
 * 바로 재보면 애니메이션이 진행 중인 프레임을 "모자란다"로 오판할 수 있어, 트윈이
 * 다 끝났을 시점까지 기다렸다가 "실제로 도달한" 위치를 잰다. */
const SETTLE_MS = 450;

let entries: TraceEntry[] = [];
let burstStart: number | null = null;
let lastEventAt: number | null = null;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => fn());
}

/** 패널이 새 항목마다 다시 그리도록 구독합니다. */
export function subscribeEventTrace(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getEventTrace(): TraceEntry[] {
  return entries;
}

export function clearEventTrace() {
  entries = [];
  burstStart = null;
  lastEventAt = null;
  notify();
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** 대상의 태그+클래스를 짧게. 클래스가 여러 개면 점으로 이어 붙입니다. */
function describeTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "(no-element)";
  const tag = target.tagName.toLowerCase();
  const className = typeof target.className === "string" ? target.className.trim() : "";
  if (!className) return tag;
  return `${tag}.${truncate(className.replace(/\s+/g, "."), 40)}`;
}

function popupStackLength(): string {
  const state = window.history.state as { __dsPopupStack?: unknown } | null;
  const stack = state?.__dsPopupStack;
  return Array.isArray(stack) ? String(stack.length) : "n/a";
}

function menuPresent(): "yes" | "no" {
  return document.querySelector(".app-select-menu") ? "yes" : "no";
}

function round(value: number): number {
  return Math.round(value);
}

function cssPixels(value: string): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/* ---- 키보드 보정 계산 재현 ----------------------------------------------------
 * 아래는 src/AppShell.tsx의 reposition()(:269-284)과 src/hooks.ts의
 * useVirtualKeyboard(:476-515)가 "지금 이 순간" 무엇을 봤을지를 DOM에서 다시
 * 읽어 재현한 것입니다 — 훅 내부 상태를 후킹해 읽은 게 절대 아닙니다(데모는
 * src/를 건드리지 않으므로 그럴 수도 없습니다). 그래서:
 *   - keyboard.open/keyboard.inset "킷이 지금 보는 값"은 킷이 실제로 DOM에 반영한
 *     결과(.app-shell의 keyboard-inset-open 클래스, --keyboard-inset 커스텀
 *     프로퍼티)를 읽은 것입니다. useReleasableKeyboardInset(AppShell.tsx:397)이
 *     닫히는 중에는 keyboard.inset이 아니라 "지연 해제 floor"를 돌려주므로,
 *     hold=Y인 동안 css=는 keyboard.inset과 다른 값일 수 있습니다(release 중).
 *   - visibleBottom/overshoot는 AppShell.tsx:281-282와 같은 공식으로 이 함수가
 *     직접 다시 계산한 것이지, 킷이 계산한 값을 읽어온 게 아닙니다.
 * "요청한 스크롤과 실제 달성한 스크롤"을 비교하려고 트리거 시점(now)과 settle
 * 시점(now+450ms) 두 번 이 스냅샷을 찍습니다 — 안드로이드가 키보드를 두 단계로
 * 올릴 때도 각 단계가 각자의 트리거+settle 쌍으로 남습니다.
 */
type KeyboardMathSnapshot = { text: string; scrollTop: number; maxScroll: number; requested: number };

function snapshotKeyboardMath(label: string, target: string | undefined): KeyboardMathSnapshot {
  const shell = document.querySelector(".app-shell");
  const workspace = document.querySelector(".workspace");
  const scrollRoot = document.getElementById("root");
  const viewport = window.visualViewport;
  const focused = document.activeElement;

  const kitOpen = shell?.classList.contains("keyboard-inset-open") ? "Y" : "N";
  const kitHold = shell?.classList.contains("keyboard-inset-holding") ? "Y" : "N";
  const kitInset = shell ? round(cssPixels(getComputedStyle(shell).getPropertyValue("--keyboard-inset"))) : 0;
  const padBottom = workspace ? getComputedStyle(workspace).paddingBottom : "n/a";

  const vpH = viewport ? round(viewport.height) : -1;
  const vpTop = viewport ? round(viewport.offsetTop) : -1;
  const winH = round(window.innerHeight);

  const scrollTop = scrollRoot ? round(scrollRoot.scrollTop) : 0;
  const scrollHeight = scrollRoot ? round(scrollRoot.scrollHeight) : 0;
  const clientHeight = scrollRoot ? round(scrollRoot.clientHeight) : 0;
  const maxScroll = scrollRoot ? Math.max(0, scrollHeight - clientHeight) : 0;

  // reposition()이 실제로 계산하기 전에 걸러내는 것과 같은 조건(AppShell.tsx:274) —
  // 특히 Dialog는 document.body에 포털되어 #root의 자손이 아니므로(:125) 여기서
  // "N"이 뜨면 그게 바로 "킷이 이 필드는 애초에 손대지 않는다"는 뜻입니다.
  const inRoot = scrollRoot && focused ? (scrollRoot.contains(focused) ? "Y" : "N") : "n/a";

  // useVirtualKeyboard(hooks.ts:482,487)가 "열림"을 가르는 첫 조건 — 포커스가 편집
  // 가능한 요소에 있는가. hooks.ts:482의 셀렉터를 그대로 씁니다. edit=N인데 foc=body면
  // "닫힘"의 이유가 높이가 아니라 포커스 자체였다는 뜻이고, edit=Y인데도 op=N이면
  // 높이 축소가 120px 문턱(hooks.ts:493)을 못 넘었다는 뜻 — 둘은 완전히 다른 원인입니다.
  const editable = focused instanceof Element && focused.matches("input, textarea, select, [contenteditable='true']") ? "Y" : "N";

  let rectText = "n/a";
  let visibleBottom: number | null = null;
  let overshoot: number | null = null;
  if (focused instanceof HTMLElement && viewport) {
    const rect = focused.getBoundingClientRect();
    rectText = `${round(rect.top)}~${round(rect.bottom)}`;
    visibleBottom = vpTop + vpH;
    overshoot = rect.bottom - visibleBottom + KEYBOARD_SCROLL_GAP;
  }
  // 반올림한 정수로 고정 — 안 그러면 over=(반올림 표시)와 want(=stBefore+requested,
  // 반올림 전 소수)가 같은 값인데도 서로 다르게 보여 읽는 사람이 혼란스러워진다.
  const requested = overshoot !== null ? Math.max(0, round(overshoot)) : 0;

  const tgt = target ? `  tgt=${target}` : "";
  const text = `kb ${label}${tgt}  foc=${describeTarget(focused)} inRoot=${inRoot} edit=${editable}  op=${kitOpen} hold=${kitHold} css=${kitInset}px`
    + `  vpH=${vpH} vpTop=${vpTop} winH=${winH}  root[st=${scrollTop} sh=${scrollHeight} ch=${clientHeight} max=${maxScroll}]`
    + `  rect=${rectText} visBot=${visibleBottom === null ? "n/a" : round(visibleBottom)} over=${overshoot === null ? "n/a" : round(overshoot)}  padB=${padBottom}`;

  return { text, scrollTop, maxScroll, requested };
}

/** 트리거 시점 스냅샷을 즉시 한 줄 남기고, 450ms 뒤(§ SETTLE_MS) 다시 재서
 * "요청한 스크롤 대비 실제 달성한 스크롤"을 두 번째 줄에 덧붙인다.
 *
 * 안드로이드 두 단계 리사이즈(53ms 간격)처럼 트리거가 겹치면, 이 타이머 하나의
 * achΔ 안에도 "다른" 트리거가 그 사이에 만든 스크롤이 섞여 들어갈 수 있다 — 이걸
 * 막을 방법은 없으므로(각 트리거는 독립적으로 재는 게 맞다) 대신 숨기지 않는다:
 * stBefore(이 트리거가 쟀던 시작점)·want(그 트리거의 목표)·stNow(지금 실제 위치)를
 * 전부 그대로 남겨서, 두 settle 줄의 stBefore가 다른데 stNow가 같다면 "겹쳤다"는
 * 게 숫자로 바로 드러나게 한다.
 *
 * clamp는 반드시 "같은 시점"의 max로 판정한다 — want는 트리거 시점 계산이므로
 * maxAtReq(트리거 시점 max)와 비교해야 맞다. settle 시점의 max(--keyboard-inset이
 * 그 사이 더 커지거나 작아졌으면 다르다)도 max=로 같이 남겨서 범위 자체가
 * 움직였는지 눈으로 비교할 수 있게 한다. clamp=Y인데 stNow가 그 시점 max와
 * 거의 같다면 "스크롤 호스트의 범위에 막혔다"는 뜻이고 — 로그의 다른 어떤
 * 필드도 이걸 대신 말해주지 않는다(과제 요구사항 그대로). clamp=N인데도 achΔ가
 * reqΔ에 못 미치면 "계산은 맞았는데 그 뒤 누가 되돌렸다" 쪽에 가깝고, over 자체가
 * rect/visBot과 안 맞으면 "애초에 잘못 계산됐다" 쪽이다 — 세 갈래를 구분하는
 * 방법은 이 두 줄을 나란히 보는 것뿐이라 갈라놓지 않았다. */
function logKeyboardMath(label: string, target?: string) {
  const before = snapshotKeyboardMath(label, target);
  append(before.text);
  const stBefore = before.scrollTop;
  const want = before.scrollTop + before.requested;
  const maxAtReq = before.maxScroll;
  window.setTimeout(() => {
    const after = snapshotKeyboardMath(`${label}~${SETTLE_MS}`, target);
    const stNow = after.scrollTop;
    const achieved = stNow - stBefore;
    const clamp = before.requested > 0 ? (want > after.maxScroll + 1 ? "Y" : "N") : "n/a";
    append(`${after.text}  reqΔ=${round(before.requested)} stBefore=${stBefore} want=${want} stNow=${stNow} achΔ=${round(achieved)}  maxAtReq=${maxAtReq} max=${after.maxScroll} clamp=${clamp}`);
  }, SETTLE_MS);
}

function append(text: string) {
  const now = performance.now();
  // 새 배열을 만들어 교체합니다(push로 제자리 변경 금지) — React 상태로 그대로 흘려보내는
  // 값이라, 같은 배열을 mutate만 하면 참조가 그대로라 리렌더가 건너뛰일 수 있습니다.
  let next = entries;
  if (burstStart === null || (lastEventAt !== null && now - lastEventAt > BURST_GAP_MS)) {
    burstStart = now;
    next = [...next, { text: "── new burst ──────────" }];
  }
  lastEventAt = now;
  const relative = Math.round(now - (burstStart ?? now));
  next = [...next, { text: `+${relative}ms  ${text}` }];
  entries = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
  notify();
}

const POINTER_LIKE_EVENTS = ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup", "click"] as const;

let installed = false;

/** document/window/visualViewport에 관찰용 리스너를 건다. 한 번만 설치됩니다. */
export function installEventTrace() {
  if (installed) return;
  installed = true;

  for (const type of POINTER_LIKE_EVENTS) {
    document.addEventListener(type, (event) => {
      append(`${type.padEnd(11)} target=${describeTarget(event.target)}  menu=${menuPresent()}`);
    }, { capture: true, passive: true });
  }

  window.addEventListener("popstate", () => {
    append(`popstate    stackLen=${popupStackLength()}  menu=${menuPresent()}`);
  });

  // 포커스 이동 자체 — 기존 패널은 이걸 전혀 찍지 않았다. useVirtualKeyboard(hooks.ts:487)가
  // "편집 가능한 요소에 포커스가 있는가"로 열림 여부를 가르므로, 포커스가 언제·무엇으로
  // 옮겨갔는지를 놓치면 그 판정의 절반을 볼 수 없다. document.activeElement는 focusout
  // 시점에 이미 새 대상으로 넘어가 있을 수 있어(스펙상 그렇다) event.target을 tgt=로
  // 따로 남긴다 — foc=는 항상 "지금" document.activeElement, tgt=는 "이 이벤트가 가리키는" 요소.
  document.addEventListener("focusin", (event) => {
    logKeyboardMath("focusin", describeTarget(event.target));
  }, { passive: true });
  document.addEventListener("focusout", (event) => {
    logKeyboardMath("focusout", describeTarget(event.target));
  }, { passive: true });

  const vv = window.visualViewport;
  if (vv) {
    const onViewportChange = (event: Event) => {
      append(`viewport ${event.type}  height=${Math.round(vv.height)}  offsetTop=${Math.round(vv.offsetTop)}  menu=${menuPresent()}`);
      logKeyboardMath(event.type, undefined);
    };
    vv.addEventListener("resize", onViewportChange);
    vv.addEventListener("scroll", onViewportChange);
  }
}

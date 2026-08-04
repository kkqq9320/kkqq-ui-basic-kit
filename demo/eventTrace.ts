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

/** src/AppShell.tsx의 KEYBOARD_SCROLL_GAP과 같은 값 — overshoot 공식을 그대로
 * 재현하려면 같은 여유값을 더해야 합니다.
 *
 * 킷 쪽이 바뀌면 여기도 같이 바꿔야 합니다. 안 맞으면 이 패널이 찍는 over가 킷의
 * 실제 판단과 어긋난 채 그럴듯해 보여서, 트레이스를 읽는 쪽이 조용히 오독합니다.
 * 8에서 24로 오른 뒤 실제로 그럴 뻔했습니다. */
const KEYBOARD_SCROLL_GAP = 24;

/** src/AppShell.tsx의 KEYBOARD_KEEP_VISIBLE_ATTR과 같은 값 — 마킹된 컨테이너를 찾는
 * 조건(hasAttribute)을 그대로 재현하려면 같은 속성 이름을 봐야 합니다.
 *
 * 킷 쪽이 바뀌면 여기도 같이 바꿔야 합니다 — 안 맞으면 keep=/cap=/over=가 킷의
 * 실제 판단과 어긋난 채 그럴듯해 보여서 트레이스를 읽는 쪽이 조용히 오독합니다.
 * GAP이 8에서 24로 오른 뒤 이 클래스의 드리프트가 실제로 날 뻔했습니다(위
 * KEYBOARD_SCROLL_GAP 주석) — 이 마커는 같은 위험이 재현될 수 있는 두 번째 지점
 * 입니다: 킷이 속성 이름을 바꾸거나 findKeyboardKeepVisibleAncestor의 탐색 조건을
 * 바꾸면, 이 상수만 그대로 남아 이 패널은 계속 "그럴듯한" keep=/over=를 찍으면서도
 * 실제로는 킷과 다른 대상을 보고 있을 수 있습니다. */
const KEYBOARD_KEEP_VISIBLE_ATTR = "data-keyboard-keep-visible";

/** src/AppShell.tsx:19의 KEYBOARD_SCROLL_ANIMATION_MS(400ms) + 여유. 리컴포짓 직후
 * 바로 재보면 애니메이션이 진행 중인 프레임을 "모자란다"로 오판할 수 있어, 트윈이
 * 다 끝났을 시점까지 기다렸다가 "실제로 도달한" 위치를 잰다. */
const SETTLE_MS = 450;

/** 닫힘 해제(useReleasableKeyboardInset)를 프레임 단위로 따라가는 창구의 길이.
 * KEYBOARD_INSET_SETTLE_MS(120) + KEYBOARD_SCROLL_ANIMATION_MS(400)에 스크롤
 * 이벤트가 트윈을 다시 겨냥하는 경우(recompute -> animateFloorTo가 진행 중 트윈을
 * 취소하고 새로 400ms를 잡는다)까지 담기려면 둘의 합보다 넉넉해야 한다. */
const RELEASE_TRACE_MS = 1100;

/** 한 번의 해제에서 남길 수 있는 최대 줄 수 — MAX_ENTRIES(400)를 이 트레이스
 * 하나가 다 밀어내지 않게 하는 상한. 변화가 있는 프레임만 남기므로 보통은 훨씬 적다. */
const RELEASE_TRACE_MAX_LINES = 44;

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
 *   - keep=/cap=는 reposition()이 data-keyboard-keep-visible로 표시된 조상을 찾아
 *     그 컨테이너 아래쪽까지 같이 반영하는 경로(findKeyboardKeepVisibleAncestor,
 *     KEYBOARD_KEEP_VISIBLE_ATTR 참고)를 그대로 재현한 것입니다 — over=는 이제
 *     "포커스된 요소 자신의 rect"가 아니라 "킷이 실제로 겨냥한 대상의 rect"를
 *     기준으로 계산됩니다. keep=는 그 대상(마커가 없으면 self), cap=는 마킹된
 *     컨테이너가 원한 값이 "필드 자신의 위쪽을 지키는 한도"에 걸려 그대로 못 쓰였는지
 *     (Y/N, 마커가 없으면 n/a)를 보여줍니다. 이 절반을 빼놓고 over=만 고치면 마킹
 *     안 된 필드에서는 여전히 맞지만 마킹된 블록·캡이 걸리는 자리에서는 조용히
 *     틀린 값을 찍습니다 — GAP 드리프트와 같은 종류의 오독입니다(위 두 상수 주석).
 * "요청한 스크롤과 실제 달성한 스크롤"을 비교하려고 트리거 시점(now)과 settle
 * 시점(now+450ms) 두 번 이 스냅샷을 찍습니다 — 안드로이드가 키보드를 두 단계로
 * 올릴 때도 각 단계가 각자의 트리거+settle 쌍으로 남습니다.
 */

/** src/AppShell.tsx의 findKeyboardKeepVisibleAncestor를 그대로 재현합니다 —
 * focused에서 시작해(자기 자신은 검사하지 않음) scrollRoot(포함) 안쪽만 거슬러
 * 올라가며 KEYBOARD_KEEP_VISIBLE_ATTR이 붙은 가장 가까운 조상을 찾습니다.
 * scrollRoot 경계를 벗어나면 멈춥니다 — 그 밖의 조상은 이 훅이 옮기는 scrollTop으로
 * 전혀 움직이지 않으므로(Dialog처럼 document.body에 포털된 자리가 대표적 예) 킷도
 * 이 패널도 기준으로 쓸 수 없습니다. */
function findKeepVisibleAncestor(focused: Element, scrollRoot: Element): Element | null {
  let node = focused.parentElement;
  while (node && scrollRoot.contains(node)) {
    if (node.hasAttribute(KEYBOARD_KEEP_VISIBLE_ATTR)) return node;
    node = node.parentElement;
  }
  return null;
}

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
  let keepText = "self";
  let capText = "n/a";
  if (focused instanceof HTMLElement && viewport) {
    const rect = focused.getBoundingClientRect();
    rectText = `${round(rect.top)}~${round(rect.bottom)}`;
    visibleBottom = vpTop + vpH;
    const focusedOvershoot = rect.bottom - visibleBottom + KEYBOARD_SCROLL_GAP;
    overshoot = focusedOvershoot;

    // src/AppShell.tsx의 reposition() 재현(위 findKeepVisibleAncestor 문서 참고):
    // 마킹된 컨테이너가 있으면 그 아래쪽까지 같이 반영하되(overshoot는 커질 수만
    // 있음, focusedOvershoot가 항상 바닥이다), 포커스된 필드 자신의 위쪽이 보이는
    // 영역 밖으로 밀려나지 않는 한도(ceiling) 안에서만 얹는다. 킷 쪽 공식
    // (Math.max(focusedOvershoot, Math.min(containerOvershoot, ceiling)))과 한
    // 글자도 달라서는 안 된다 — 위 KEYBOARD_KEEP_VISIBLE_ATTR 경고 참고.
    const keepVisibleAncestor = scrollRoot ? findKeepVisibleAncestor(focused, scrollRoot) : null;
    if (keepVisibleAncestor) {
      const containerRect = keepVisibleAncestor.getBoundingClientRect();
      const containerOvershoot = containerRect.bottom - visibleBottom + KEYBOARD_SCROLL_GAP;
      const ceiling = Math.max(0, rect.top - vpTop);
      overshoot = Math.max(focusedOvershoot, Math.min(containerOvershoot, ceiling));
      keepText = describeTarget(keepVisibleAncestor);
      capText = containerOvershoot > ceiling ? "Y" : "N";
    }
  }
  // 반올림한 정수로 고정 — 안 그러면 over=(반올림 표시)와 want(=stBefore+requested,
  // 반올림 전 소수)가 같은 값인데도 서로 다르게 보여 읽는 사람이 혼란스러워진다.
  const requested = overshoot !== null ? Math.max(0, round(overshoot)) : 0;

  const tgt = target ? `  tgt=${target}` : "";
  const text = `kb ${label}${tgt}  foc=${describeTarget(focused)} inRoot=${inRoot} edit=${editable}  op=${kitOpen} hold=${kitHold} css=${kitInset}px`
    + `  vpH=${vpH} vpTop=${vpTop} winH=${winH}  root[st=${scrollTop} sh=${scrollHeight} ch=${clientHeight} pin=${pinnedHeightOf(scrollRoot)} max=${maxScroll}]`
    + `  rect=${rectText} visBot=${visibleBottom === null ? "n/a" : round(visibleBottom)} over=${overshoot === null ? "n/a" : round(overshoot)} keep=${keepText} cap=${capText}  padB=${padBottom}`;

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

/** src/AppShell.tsx:154의 prefersReducedMotion()과 같은 판정입니다.
 *
 * **이 한 값이 닫힘 해제의 모양을 통째로 가릅니다** — animateFloorTo(AppShell.tsx:709)와
 * animateScrollTopBy(:400) 둘 다 이게 참이면 트윈을 건너뛰고 목표를 그 자리에서
 * 대입합니다. 안드로이드 "애니메이션 제거"나 개발자 옵션의 애니메이션 배율 0이
 * 여기에 그대로 매핑되므로, 기기 설정 하나로 킷이 멀쩡히 도는데도 모든 게 계단으로
 * 보일 수 있습니다. 패널이 이걸 안 찍으면 그 경우와 "트윈이 돌았는데도 둔탁하다"를
 * 구분할 방법이 없습니다. */
function reduceMotionState(): "Y" | "N" | "?" {
  if (typeof window.matchMedia !== "function") return "?";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "Y" : "N";
}

/** `#root`에 인라인 height가 박혀 있으면 그 값, 없으면 0.
 *
 * **이게 없으면 `ch=`를 오독합니다.** 킷은 닫히는 창구(120ms) 동안 `#root`에 인라인
 * height를 씁니다(`src/AppShell.tsx`의 C2). 인라인 height는 `100dvh`를 이기므로 그
 * 구간의 `clientHeight`는 브라우저의 실제 지오메트리가 아니라 **킷이 못 박은 값**입니다.
 * 즉 이 패널의 `ch=`는 그 구간에서 구조적으로 평평해집니다 — C1/C2 진단의 근거였던
 * 1192 스파이크를 더는 볼 수 없습니다. 표식 없이 그대로 두면 다음 캡처를 읽는 사람이
 * "스파이크가 사라졌다"고 결론 내립니다. 실제로는 가려졌을 뿐입니다.
 * `pin=0`이면 `ch=`는 브라우저 값, `pin>0`이면 `ch=`는 곧 `pin`입니다. */
function pinnedHeightOf(scrollRoot: HTMLElement | null): number {
  if (!scrollRoot) return -1;
  const parsed = parseFloat(scrollRoot.style.height);
  return Number.isFinite(parsed) ? round(parsed) : 0;
}

type ReleaseSample = { t: number; inset: number; pad: number; st: number; sh: number; ch: number; pin: number };

function sampleRelease(): ReleaseSample {
  const shell = document.querySelector(".app-shell");
  const workspace = document.querySelector(".workspace");
  const scrollRoot = document.getElementById("root");
  return {
    t: performance.now(),
    inset: shell ? round(cssPixels(getComputedStyle(shell).getPropertyValue("--keyboard-inset"))) : -1,
    pad: workspace ? round(cssPixels(getComputedStyle(workspace).paddingBottom)) : -1,
    st: scrollRoot ? round(scrollRoot.scrollTop) : -1,
    sh: scrollRoot ? round(scrollRoot.scrollHeight) : -1,
    ch: scrollRoot ? round(scrollRoot.clientHeight) : -1,
    pin: pinnedHeightOf(scrollRoot),
  };
}

let releaseTracing = false;

/** 키보드가 닫히는 순간부터 RELEASE_TRACE_MS 동안 **매 프레임** 지오메트리를 재서,
 * 값이 바뀐 프레임만 한 줄씩 남긴다.
 *
 * **왜 시작·끝 두 점으로는 부족한가.** owner의 보고는 "내려오긴 하는데 둔탁하다"이고,
 * 그건 도착점이 아니라 **궤적의 성질**이다 — 시작·끝만 재면 406->0이라는 같은 결과가
 * 한 프레임에 뛴 경우와 24프레임에 걸쳐 흐른 경우 모두에서 똑같이 찍힌다. 기존
 * logKeyboardMath의 trigger/+450ms 쌍이 정확히 그 두 점짜리라, 이 질문에는 구조적으로
 * 답할 수 없다.
 *
 * 마지막 줄의 **maxΔst가 이 트레이스의 결론**이다: 한 프레임에 움직인 scrollTop의
 * 최댓값이 전체 이동량과 비슷하면 화면은 사실상 한 번에 뛴 것이고(트윈이 안 돌았거나
 * 브라우저 clamp가 트윈보다 앞서 갔다는 뜻), 전체 이동량을 프레임 수로 나눈 값 근처면
 * 트윈은 정상이고 "둔탁"의 원인은 다른 데(예: 120ms 정지 뒤 빠르게 시작하는 곡선의
 * 앞머리, 또는 해제 도중 트윈이 반복 재조준되는 것) 있다.
 *
 * inset과 st를 나란히 두는 이유: 화면을 실제로 움직이는 건 st다. inset이 부드럽게
 * 줄었는데 st가 계단이면 원인은 트윈이 아니라 브라우저의 scrollTop clamp다. */
function startReleaseTrace() {
  if (releaseTracing) return;   // 이미 이번 닫힘을 따라가는 중 — 겹쳐 걸지 않는다.
  releaseTracing = true;

  const first = sampleRelease();
  append(`kbrelease start  reduce=${reduceMotionState()}  inset=${first.inset} pad=${first.pad} st=${first.st} sh=${first.sh} ch=${first.ch} pin=${first.pin}`);

  // 워치독 — rAF는 탭이 백그라운드로 가면 멈춘다. 사용자가 해제 도중 앱을 전환하면
  // 이 플래그가 참인 채로 굳고, 그 뒤의 모든 닫힘이 **아무 줄도 남기지 않은 채**
  // 조용히 무시된다. 한 번의 캡처에서 여러 사이클을 받는 게 이 트레이스의 용도라
  // 그건 그대로 캡처 전체를 버리게 만든다. 벽시계로 창구를 한 번 더 닫아 둔다.
  // aborted를 따로 두는 이유: 워치독이 창구를 닫은 뒤 탭이 돌아오면 멈춰 있던 rAF가
  // 그대로 이어서 깨어난다. 그때 이 실행이 계속 줄을 남기면, 그 사이에 시작된 새 트레이스와
  // 뒤섞여 읽는 쪽이 두 사이클을 하나로 오독한다 — 깨어난 옛 실행은 조용히 끝내야 한다.
  let aborted = false;
  const watchdog = window.setTimeout(() => {
    if (!releaseTracing) return;
    aborted = true;
    releaseTracing = false;
    append("kbrelease abort  rAF가 창구 안에 끝나지 않았다(탭 백그라운드 등) — 다음 닫힘은 정상 기록된다");
  }, RELEASE_TRACE_MS + 600);

  let previous = first;
  let frames = 0;
  let changed = 0;
  let lines = 0;
  let maxFrameInset = 0;
  let maxFrameScroll = 0;

  function frame() {
    if (aborted) return;   // 워치독이 이미 이 실행을 끝냈다 — 깨어나도 아무것도 남기지 않는다.
    const now = sampleRelease();
    frames += 1;
    const dInset = now.inset - previous.inset;
    const dScroll = now.st - previous.st;
    if (dInset !== 0 || dScroll !== 0) {
      changed += 1;
      if (Math.abs(dInset) > Math.abs(maxFrameInset)) maxFrameInset = dInset;
      if (Math.abs(dScroll) > Math.abs(maxFrameScroll)) maxFrameScroll = dScroll;
      if (lines < RELEASE_TRACE_MAX_LINES) {
        lines += 1;
        append(`kbrelease +${round(now.t - first.t)}ms  inset=${now.inset}(${dInset >= 0 ? "+" : ""}${dInset}) pad=${now.pad} st=${now.st}(${dScroll >= 0 ? "+" : ""}${dScroll}) sh=${now.sh} ch=${now.ch} pin=${now.pin}`);
      }
    }
    previous = now;
    if (now.t - first.t < RELEASE_TRACE_MS) {
      requestAnimationFrame(frame);
      return;
    }
    releaseTracing = false;
    window.clearTimeout(watchdog);
    const droppedNote = changed > lines ? `  (${changed - lines}줄 생략)` : "";
    append(
      `kbrelease end  frames=${frames} changed=${changed}  inset ${first.inset}->${now.inset}  st ${first.st}->${now.st} (Δ${now.st - first.st})`
      + `  maxΔinset=${maxFrameInset} maxΔst=${maxFrameScroll}${droppedNote}`,
    );
  }
  requestAnimationFrame(frame);
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

  append(`trace installed  reduce=${reduceMotionState()}  ua=${truncate(navigator.userAgent, 90)}`);

  // 닫힘 해제 트레이스의 방아쇠 — 킷이 스스로 "닫혔다"고 판단한 그 순간에 맞춘다.
  // .app-shell의 keyboard-inset-open은 useVirtualKeyboard의 keyboard.open을 그대로
  // 반영하므로(AppShell이 붙인다), 이걸 보면 hooks.ts의 120px 문턱이나 restingHeight
  // 누적 규칙을 여기서 다시 구현하지 않아도 된다 — 재구현했다면 그게 바로 이 파일이
  // 이미 경고하고 있는 종류의 드리프트 지점이 하나 더 느는 것이다. 있음->없음
  // 전이에서만 건다(반대 방향은 열림이라 해제와 무관).
  let shellKeyboardOpen = false;
  new MutationObserver((records) => {
    for (const record of records) {
      if (!(record.target instanceof Element) || !record.target.classList.contains("app-shell")) continue;
      const open = record.target.classList.contains("keyboard-inset-open");
      if (shellKeyboardOpen && !open) startReleaseTrace();
      shellKeyboardOpen = open;
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });

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

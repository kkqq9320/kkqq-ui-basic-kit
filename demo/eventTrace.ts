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

/** 개창(키보드가 올라오는) 궤적을 프레임 단위로 따라가는 창구의 길이.
 *
 * 이 창구가 담아야 하는 것 = 팬(~210ms, 5~25ms 간격) + 킷의 디바운스
 * (KEYBOARD_VIEWPORT_SETTLE_MS 80ms, 마지막 팬 단계부터 다시 셈) + 트윈
 * (KEYBOARD_SCROLL_ANIMATION_MS 400ms) = 약 690ms. 900은 거기에 ~30% 여유다.
 *
 * **이 파일에 예전에 있던 SETTLE_MS(450)의 최후를 여기 적어 둔다** — 같은 실수를
 * 다시 하지 않기 위해서다. 그 상수는 "트윈 400ms + 여유"라는 근거로 450이었는데,
 * 킷이 80ms 디바운스를 갖게 되면서 트윈은 이벤트+80ms에 시작해 이벤트+480ms에
 * 끝나게 됐다. 그래서 450ms 시점의 트윈 진행률은 (450-80)/400 = 0.925다.
 *
 * 그때 ledger에는 "achΔ가 healthy 사이클에서 ~8% 모자라 보인다"고 적혀 있었지만,
 * 그건 **선형 이징을 가정한 책상 계산**이었다(1-0.925 = 7.5%). 킷의 실제 곡선은
 * repositionEase = cubic-bezier(.32,.72,0,1)이고 `ease(0.925) = 0.999435`이므로
 * 실제 오차는 **0.057%** — 1000px 스크롤에서 0.6px이다. 창구를 480ms로 넓혀도
 * 그만큼밖에 달라지지 않는다.
 *
 * 그리고 8%는 어떤 캡처에서도 관측된 적이 없다: 실기기에 남은 개창 방향 수치는
 * reqΔ=239 achΔ=91, reqΔ=359 achΔ=134로 도달률 38%/37%다. 결함은 창구의 길이가
 * 아니라 **재는 시점**이었고, 그래서 예측(SETTLE_MS 짝)을 통째로 버리고 관찰
 * (startOpenTrace)로 바꿨다 — logKeyboardSnapshot 주석 참고. */
const OPEN_TRACE_MS = 900;

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

/** 데모가 "지금 이 일이 일어났다"를 트레이스에 직접 끼워 넣습니다.
 *
 * 소비자 쪽 상태 변화(예: `disabled`가 켜지는 순간)는 DOM 이벤트가 아니라서 이 패널이
 * 스스로 볼 방법이 없습니다. 그 순간에 표식이 없으면, 캡처를 읽는 쪽은 앞뒤 줄에서
 * **추론**해야 하고 그건 이 프로젝트가 이미 여러 번 대가를 치른 방식입니다. */
export function logTraceNote(note: string) {
  append(`── ${note}`);
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

function snapshotKeyboardMath(label: string, target: string | undefined): string {
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
  const tgt = target ? `  tgt=${target}` : "";
  return `kb ${label}${tgt}  foc=${describeTarget(focused)} inRoot=${inRoot} edit=${editable}  op=${kitOpen} hold=${kitHold} css=${kitInset}px`
    + `  vpH=${vpH} vpTop=${vpTop} winH=${winH}  root[st=${scrollTop} sh=${scrollHeight} ch=${clientHeight} pin=${pinnedHeightOf(scrollRoot)} max=${maxScroll}]`
    + `  rect=${rectText} visBot=${visibleBottom === null ? "n/a" : round(visibleBottom)} over=${overshoot === null ? "n/a" : round(overshoot)} keep=${keepText} cap=${capText}  padB=${padBottom}`;
}

/** 킷이 지금 "열림"으로 보고 있는가 — `.app-shell`의 `keyboard-inset-open`을 그대로
 * 읽는다(snapshotKeyboardMath의 `op=`와 같은 판정). 여기서 hooks.ts의 120px 문턱을
 * 다시 구현하지 않는 이유는 startReleaseTrace 트리거의 주석과 같다 — 재구현하면
 * 드리프트 지점이 하나 더 는다. */
function kitKeyboardOpen(): boolean {
  return document.querySelector(".app-shell")?.classList.contains("keyboard-inset-open") ?? false;
}

/** 지오메트리 스냅샷 **한 줄만** 남긴다.
 *
 * 예전에는 이벤트마다 `reqΔ/want/achΔ/clamp` 짝(트리거 줄 + SETTLE_MS 뒤 줄)을 같이
 * 찍었다. **그 짝은 삭제했다.** 이유:
 *
 * 그 짝은 "킷이 이 순간 이만큼 요청했고 그래서 이만큼 갔다"로 읽히는데, 킷은 이벤트가
 * 온 그 순간에 재지 않는다. KEYBOARD_VIEWPORT_SETTLE_MS(80ms) 디바운스 뒤
 * **마지막 이벤트로부터 80ms 지나 한 번만** 잰다(AppShell.tsx:527 focusin 경로,
 * :563 open/inset 경로 — 매 이벤트가 타이머를 다시 건다). 안드로이드 팬은 5~25ms
 * 간격으로 ~210ms 이어지므로 개창 한 번에:
 *     패널   viewport 이벤트마다 두 줄 → 18~86줄, 각자 다른 reqΔ
 *     킷     reposition() 1회         → 요청은 단 하나
 * 즉 중간 줄들의 reqΔ는 **킷이 한 번도 요청한 적 없는 값**이었고, 팬이 아직 도는 중의
 * 지오메트리로 계산돼 실제보다 컸다. 그래서 achΔ가 한참 못 미쳐 보였다(실기기 캡처:
 * reqΔ=239 achΔ=91, reqΔ=359 achΔ=134 — 도달률 38%/37%). 그 격차는 킷이 못 간 게
 * 아니라 **브라우저의 팬이 이미 처리한 몫**이고, 80ms 디바운스는 정확히 그 이중 보정을
 * 없애려고 넣은 것이다(AppShell.tsx:545-558).
 *
 * 창구 길이를 늘리는 건 답이 아니었다: 트윈이 덜 끝나서 생기는 몫은
 * `1 - ease(0.925) = 0.057%`뿐이다(ledger에 있던 "~8%"는 선형 이징을 가정한 책상
 * 계산이었다 — 위 OPEN_TRACE_MS 주석에 그 산술과 옛 SETTLE_MS의 최후를 적어 뒀다).
 *
 * **그래서 예측을 그만두고 관찰로 바꿨다.** 개창 궤적은 이제 `startOpenTrace`가
 * 프레임 단위로 실제 scrollTop을 따라가 찍는다 — 닫힘 쪽 `startReleaseTrace`와 같은
 * 방식이다. 이건 미러를 **하나 없앤다**: 킷의 디바운스 타이밍을 여기 복제하지 않아도
 * 되고, 이 파일이 이미 세 군데(GAP·마커·pin)에서 경고하는 종류의 드리프트 지점이
 * 늘지 않는다. 이 줄의 `over=`는 여전히 "지금 이 순간이라면 킷이 이렇게 계산할 것"을
 * 보여주므로 팬이 언제 얼마나 돌았는지를 읽는 데 그대로 쓴다. */
function logKeyboardSnapshot(label: string, target?: string) {
  append(snapshotKeyboardMath(label, target));
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

type ReleaseSample = {
  t: number; inset: number; pad: number; st: number; sh: number; ch: number; pin: number;
  /** 개창 방향에서만 찍는다 — 안드로이드의 비주얼 뷰포트 팬이 개창 궤적의 절반이다
   * (vpTop 0→407). 닫힘 줄의 형식은 기기 검증을 거쳤으므로 그대로 두고, 여기에만 쓴다. */
  vpTop: number; vpH: number;
  /** scrollTop의 상한. 궤적이 여기서 멈췄으면 트윈이 아니라 브라우저가 세운 것이다. */
  max: number;
};

function sampleRelease(): ReleaseSample {
  const shell = document.querySelector(".app-shell");
  const workspace = document.querySelector(".workspace");
  const scrollRoot = document.getElementById("root");
  const viewport = window.visualViewport;
  const sh = scrollRoot ? round(scrollRoot.scrollHeight) : -1;
  const ch = scrollRoot ? round(scrollRoot.clientHeight) : -1;
  return {
    t: performance.now(),
    inset: shell ? round(cssPixels(getComputedStyle(shell).getPropertyValue("--keyboard-inset"))) : -1,
    pad: workspace ? round(cssPixels(getComputedStyle(workspace).paddingBottom)) : -1,
    st: scrollRoot ? round(scrollRoot.scrollTop) : -1,
    sh,
    ch,
    pin: pinnedHeightOf(scrollRoot),
    vpTop: viewport ? round(viewport.offsetTop) : -1,
    vpH: viewport ? round(viewport.height) : -1,
    max: scrollRoot ? Math.max(0, sh - ch) : -1,
  };
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}

type FrameTraceStats = { frames: number; changed: number; maxInsetStep: number; maxScrollStep: number; dropped: number };

type FrameTraceSpec = {
  /** 줄 접두사이자 동시 실행 방지 키. */
  name: string;
  windowMs: number;
  startLine: (first: ReleaseSample) => string;
  /** 이 프레임을 "움직인 프레임"으로 셀지. 방향마다 봐야 하는 축이 다르다. */
  moved: (now: ReleaseSample, previous: ReleaseSample) => boolean;
  frameLine: (now: ReleaseSample, previous: ReleaseSample, first: ReleaseSample) => string;
  endLine: (last: ReleaseSample, first: ReleaseSample, stats: FrameTraceStats) => string;
  abortLine: string;
  /** 창구가 정상 종료한 뒤 한 줄 더 남기고 싶을 때(개창의 최종 over= 등). */
  afterEnd?: () => void;
  /** 참이 되면 창구를 기다리지 않고 그 프레임에 정상 종료한다. 남은 프레임을 태우지
   * 않으려는 것뿐이고, **판정 줄을 유효하게 만드는 건 아래 settled 쪽 일이다.** */
  endEarly?: () => boolean;
  /** 첫 변화가 있은 뒤 이만큼 연속으로 아무것도 안 움직이면 궤적이 멎은 것으로 보고
   * settled를 **한 번만** 부른다. 첫 변화 전은 세지 않는다 — 트리거와 실제 움직임
   * 사이에 몇 프레임 비는 게 정상이라(실기기: 첫 변화가 +47ms) 그걸 "멎었다"로
   * 오판하면 판정을 시작 지오메트리로 찍게 된다. */
  settleFrames?: number;
  settled?: (sample: ReleaseSample) => void;
};

/** 같은 이름의 트레이스는 겹쳐 걸지 않는다. 이름이 다르면(개창 vs 닫힘) 겹쳐도 된다 —
 * 900ms 창구가 도는 중에 사용자가 키보드를 닫으면 닫힘 트레이스는 반드시 잡혀야 하고,
 * 줄 접두사가 다르니 섞여도 읽는 쪽이 구분할 수 있다. 플래그 하나를 공유했다면 그
 * 닫힘이 통째로 유실됐을 것이다. */
const activeTraces = new Set<string>();

/** rAF로 창구가 끝날 때까지 매 프레임 지오메트리를 재고, 움직인 프레임만 한 줄씩 남긴다.
 *
 * **왜 시작·끝 두 점으로는 부족한가.** owner의 보고는 "내려오긴 하는데 둔탁하다"였고,
 * 그건 도착점이 아니라 **궤적의 성질**이다 — 시작·끝만 재면 406->0이라는 같은 결과가
 * 한 프레임에 뛴 경우와 24프레임에 걸쳐 흐른 경우 모두에서 똑같이 찍힌다. 예전
 * logKeyboardMath의 trigger/+450ms 쌍이 정확히 그 두 점짜리라 구조적으로 답할 수 없었다.
 *
 * 워치독 — rAF는 탭이 백그라운드로 가면 멈춘다. 사용자가 도중에 앱을 전환하면 이름이
 * 집합에 남은 채로 굳고, 그 뒤의 모든 사이클이 **아무 줄도 남기지 않은 채** 조용히
 * 무시된다. 한 번의 캡처에서 여러 사이클을 받는 게 이 트레이스의 용도라 그건 그대로
 * 캡처 전체를 버리게 만든다. 벽시계로 창구를 한 번 더 닫아 둔다.
 * aborted를 따로 두는 이유: 워치독이 창구를 닫은 뒤 탭이 돌아오면 멈춰 있던 rAF가 그대로
 * 이어서 깨어난다. 그때 이 실행이 계속 줄을 남기면 그 사이 시작된 새 트레이스와 뒤섞여
 * 읽는 쪽이 두 사이클을 하나로 오독한다 — 깨어난 옛 실행은 조용히 끝내야 한다. */
function runFrameTrace(spec: FrameTraceSpec) {
  if (activeTraces.has(spec.name)) return;
  activeTraces.add(spec.name);

  const first = sampleRelease();
  append(spec.startLine(first));

  let aborted = false;
  const watchdog = window.setTimeout(() => {
    if (!activeTraces.has(spec.name)) return;
    aborted = true;
    activeTraces.delete(spec.name);
    append(spec.abortLine);
  }, spec.windowMs + 600);

  let previous = first;
  let frames = 0;
  let changed = 0;
  let lines = 0;
  let maxFrameInset = 0;
  let maxFrameScroll = 0;
  let sawFirstChange = false;
  let stillFrames = 0;
  let settledFired = false;

  function frame() {
    if (aborted) return;   // 워치독이 이미 이 실행을 끝냈다 — 깨어나도 아무것도 남기지 않는다.
    const now = sampleRelease();
    frames += 1;
    if (spec.moved(now, previous)) {
      changed += 1;
      sawFirstChange = true;
      stillFrames = 0;
      const dInset = now.inset - previous.inset;
      const dScroll = now.st - previous.st;
      if (Math.abs(dInset) > Math.abs(maxFrameInset)) maxFrameInset = dInset;
      if (Math.abs(dScroll) > Math.abs(maxFrameScroll)) maxFrameScroll = dScroll;
      if (lines < RELEASE_TRACE_MAX_LINES) {
        lines += 1;
        append(spec.frameLine(now, previous, first));
      }
    } else if (sawFirstChange) {
      stillFrames += 1;
      if (!settledFired && spec.settleFrames !== undefined && stillFrames >= spec.settleFrames) {
        settledFired = true;
        spec.settled?.(now);
      }
    }
    previous = now;
    // endEarly는 창구 검사보다 **먼저** 본다 — 이 프레임이 아직 창구 안이더라도, 주제가
    // 끝났으면(개창 트레이스인데 키보드가 닫혔으면) 여기서 끝내야 end/final이 아직
    // 유효한 지오메트리로 찍힌다. 뒤에 두면 한 프레임 늦어 그 사이 뷰포트가 복원된다.
    if (now.t - first.t < spec.windowMs && !spec.endEarly?.()) {
      requestAnimationFrame(frame);
      return;
    }
    activeTraces.delete(spec.name);
    window.clearTimeout(watchdog);
    append(spec.endLine(now, first, {
      frames, changed, maxInsetStep: maxFrameInset, maxScrollStep: maxFrameScroll, dropped: changed - lines,
    }));
    spec.afterEnd?.();
  }
  requestAnimationFrame(frame);
}

/** 키보드가 **닫히는** 순간부터 RELEASE_TRACE_MS 동안의 궤적.
 *
 * 마지막 줄의 **maxΔst가 이 트레이스의 결론**이다: 한 프레임에 움직인 scrollTop의
 * 최댓값이 전체 이동량과 비슷하면 화면은 사실상 한 번에 뛴 것이고(트윈이 안 돌았거나
 * 브라우저 clamp가 트윈보다 앞서 갔다는 뜻), 전체 이동량을 프레임 수로 나눈 값 근처면
 * 트윈은 정상이고 "둔탁"의 원인은 다른 데(예: 120ms 정지 뒤 빠르게 시작하는 곡선의
 * 앞머리, 또는 해제 도중 트윈이 반복 재조준되는 것) 있다.
 *
 * inset과 st를 나란히 두는 이유: 화면을 실제로 움직이는 건 st다. inset이 부드럽게
 * 줄었는데 st가 계단이면 원인은 트윈이 아니라 브라우저의 scrollTop clamp다.
 *
 * ⚠️ **이 줄들의 형식은 실기기 검증을 거쳤고 handoff 문서와 메모리가 그대로 인용한다
 * (627e7e3의 `maxΔst=0` 4/4). 필드를 빼거나 이름을 바꾸지 말 것** — 공유 러너로 옮기면서도
 * 출력은 한 글자도 바꾸지 않았다. */
function startReleaseTrace() {
  runFrameTrace({
    name: "kbrelease",
    windowMs: RELEASE_TRACE_MS,
    startLine: (f) => `kbrelease start  reduce=${reduceMotionState()}  inset=${f.inset} pad=${f.pad} st=${f.st} sh=${f.sh} ch=${f.ch} pin=${f.pin}`,
    moved: (n, p) => n.inset !== p.inset || n.st !== p.st,
    frameLine: (n, p, first) =>
      `kbrelease +${round(n.t - first.t)}ms  inset=${n.inset}(${signed(n.inset - p.inset)}) pad=${n.pad} st=${n.st}(${signed(n.st - p.st)}) sh=${n.sh} ch=${n.ch} pin=${n.pin}`,
    endLine: (n, first, s) =>
      `kbrelease end  frames=${s.frames} changed=${s.changed}  inset ${first.inset}->${n.inset}  st ${first.st}->${n.st} (Δ${n.st - first.st})`
      + `  maxΔinset=${s.maxInsetStep} maxΔst=${s.maxScrollStep}${s.dropped > 0 ? `  (${s.dropped}줄 생략)` : ""}`,
    abortLine: "kbrelease abort  rAF가 창구 안에 끝나지 않았다(탭 백그라운드 등) — 다음 닫힘은 정상 기록된다",
  });
}

/** 키보드가 **올라오는** 방향의 궤적 — 예전의 reqΔ/achΔ 예측을 대체한다.
 *
 * **왜 예측이 아니라 관찰인가.** 예전 짝은 이벤트 순간의 지오메트리로 "킷이 이만큼
 * 요청했을 것"을 계산했는데, 킷은 그 순간에 재지 않는다(80ms 디바운스 — logKeyboardSnapshot
 * 주석 참고). 그래서 그 숫자들은 킷이 한 번도 요청한 적 없는 값이었다. 킷의 디바운스를
 * 여기 복제하는 대신 **실제로 일어난 일을 본다** — 이 파일이 이미 세 군데(GAP·마커·pin)에서
 * 경고하는 드리프트 지점을 늘리지 않는 쪽이다. 닫힘 트리거가 120px 문턱을 재구현하지 않고
 * `.app-shell`의 클래스를 보는 것과 같은 논리다.
 *
 * **읽는 법 — 세 갈래가 이 한 트레이스로 갈린다:**
 *   `vpTop`이 오르는 동안 `st`가 그대로 → 브라우저가 팬으로 필드를 드러내는 중.
 *     킷은 아직 손대지 않았다(80ms 디바운스가 기다리는 구간이 바로 여기다).
 *   `vpTop`이 멎은 뒤 `st`가 여러 프레임에 걸쳐 흐름 → 트윈이 정상으로 돌았다.
 *     `maxΔst`가 전체 이동량에 가까우면 한 프레임에 뛴 것(reduce=Y이거나 clamp).
 *   `atMax=Y` → 궤적을 세운 건 트윈이 아니라 **브라우저의 상한**이다. 예전 `clamp=`가
 *     예측으로 답하려던 걸 관찰로 답한다.
 * 마지막 `kbopen final` 줄의 `over=`가 **결과 판정**이다: 0 근처면 정확, 음수로 크면
 * 과보정(= ratchet의 증상, 실기기에서 -243이 나왔다), 양수면 아직 가려져 있다.
 *
 * **`reason=refocus`는 잘 안 보인다 — 그게 정상이다.** runFrameTrace는 같은 이름이
 * 이미 돌고 있으면 그냥 돌아가는데, "키보드가 올라온 채로 다른 필드를 탭"하는 건 보통
 * 앞선 개창의 900ms 창구 안에서 일어난다. 그럼 새 트레이스가 시작되지 않고 진행 중인
 * 트레이스가 그 구간을 계속 담는다(잃는 건 없다 — 그 focusin은 자기 지오메트리 줄로
 * 남고, 재조준의 결과는 같은 트레이스의 뒷부분에 그대로 나타난다). 창구 밖에서 탭했을
 * 때만 `reason=refocus`로 새로 시작한다. 이 줄을 못 봤다고 재조준 경로가 안 돈다고
 * 결론 내리지 말 것. */
function startOpenTrace(reason: string) {
  // 창구가 다 돌기 전에 키보드가 닫혔는가. endEarly에서 세우고 endLine이 읽는다 —
  // endLine은 endEarly가 참을 돌려준 뒤에 불리므로 순서는 보장된다.
  let closedEarly = false;
  // 판정 줄(kbopen final)을 열린 상태에서 실제로 찍었는가. 못 찍었으면 afterEnd가
  // 그 사실을 명시한다 — 줄이 그냥 없으면 읽는 쪽이 누락으로 오해한다.
  let finalLogged = false;
  runFrameTrace({
    name: "kbopen",
    windowMs: OPEN_TRACE_MS,
    // 키보드가 닫히면 이 트레이스의 주제는 끝났다. 창구(900ms)를 끝까지 기다리면
    // final이 복원된 뷰포트로 찍혀 over=가 완전히 다른 뜻이 된다(2026-08-04 캡처에서
    // 5개 중 3개가 그랬다). 닫힘 자체는 kbrelease가 따로 받는다.
    endEarly: () => { if (!kitKeyboardOpen()) closedEarly = true; return closedEarly; },
    startLine: (f) => `kbopen start  reason=${reason}  reduce=${reduceMotionState()}  vpTop=${f.vpTop} vpH=${f.vpH}  inset=${f.inset} pad=${f.pad} st=${f.st} sh=${f.sh} ch=${f.ch} pin=${f.pin} max=${f.max}`,
    // 닫힘과 달리 vpTop/vpH도 본다 — 안드로이드에서 개창의 절반은 킷이 아니라 팬이
    // 만들고(vpTop 0→407), st만 보면 그 구간이 통째로 "아무 일도 없음"으로 접힌다.
    moved: (n, p) => n.inset !== p.inset || n.st !== p.st || n.vpTop !== p.vpTop || n.vpH !== p.vpH,
    frameLine: (n, p, first) =>
      `kbopen +${round(n.t - first.t)}ms  vpTop=${n.vpTop}(${signed(n.vpTop - p.vpTop)}) vpH=${n.vpH}(${signed(n.vpH - p.vpH)})`
      + `  inset=${n.inset}(${signed(n.inset - p.inset)}) st=${n.st}(${signed(n.st - p.st)}) sh=${n.sh} ch=${n.ch} pin=${n.pin} max=${n.max}`,
    endLine: (n, first, s) =>
      `kbopen end  frames=${s.frames} changed=${s.changed}  vpTop ${first.vpTop}->${n.vpTop}  inset ${first.inset}->${n.inset}`
      // max=0(스크롤할 게 없는 페이지)에서는 st>=max-1이 항상 참이라 "브라우저 상한에
      // 막혔다"로 읽힌다 — 시도한 적조차 없는데. atMax는 옛 clamp=를 대신하는 필드라
      // 그 오독이 그대로 진단으로 이어진다. 스크롤 여지가 있을 때만 판정한다.
      + `  st ${first.st}->${n.st} (Δ${n.st - first.st})  maxΔst=${s.maxScrollStep}  max=${n.max} atMax=${n.max > 0 ? (n.st >= n.max - 1 ? "Y" : "N") : "n/a"}`
      + `${closedEarly ? "  closedEarly=Y(키보드가 창구 안에 닫혀 여기서 끊음 — final은 열린 상태 값이다)" : ""}`
      + `${s.dropped > 0 ? `  (${s.dropped}줄 생략)` : ""}`,
    abortLine: "kbopen abort  rAF가 창구 안에 끝나지 않았다(탭 백그라운드 등) — 다음 개창은 정상 기록된다",
    // **판정 줄은 창구 끝이 아니라 "궤적이 멎은 순간"에 찍는다.**
    // 2026-08-04 캡처가 이걸 강제했다: 창구는 900ms인데 사용자가 그보다 빨리 키보드를
    // 닫으면, 그 캡처의 5개 중 3개처럼 final이 `op=N vpH=1060`인 채로 `over=-407`을
    // 보여준다 — "과보정됐다"가 아니라 그냥 "키보드가 없다"인데 over=는 이 트레이스의
    // 판정 필드라 그대로 오독이 된다.
    // "킷이 닫혔다고 하면 끊기"로는 안 된다 — 같은 캡처에 순서가 찍혀 있다:
    //     +3960ms viewport resize height=1060   (뷰포트가 먼저 복원되고)
    //     +3962ms kbrelease start               (킷의 닫힘 통지는 그 뒤)
    // 즉 "킷은 열림인데 뷰포트는 아직 키보드 크기"인 순간이 없다. 그래서 닫힘을
    // 기다리지 않고, 팬과 트윈이 다 멎은 그 자리에서(아직 열려 있을 때) 찍는다.
    settleFrames: 5,   // ~80ms. 팬 단계 간격은 5~25ms라 이만큼 조용하면 팬도 트윈도 끝났다.
    settled: () => {
      if (!kitKeyboardOpen()) return;   // 이미 닫혔으면 찍어봐야 복원된 값이다
      finalLogged = true;
      logKeyboardSnapshot("kbopen final");
    },
    afterEnd: () => {
      if (!finalLogged) append("kbopen final 없음 — 궤적이 멎기 전에 키보드가 닫혔다. 이 사이클은 개창 결과를 판정할 수 없다(over=를 찾지 말 것).");
    },
  });
}

/* ── 스와이프 프레임 트레이스 ────────────────────────────────────────────────
 *
 * 오너 리포트(2026-08-10, 실기기): "휠 스와이프 애니메이션이 튀거나 끊긴다."
 * pane에서는 확인이 구조적으로 불가능하다 — rAF가 안 돌고 CSS 전환이 진행되지 않는다.
 *
 * **이 트레이스는 킷 로직을 복제하지 않는다.** 킷의 상수(30px 경계, ±24px 클램프)를
 * 다시 계산하지 않고 DOM에 실제로 찍힌 것만 읽는다 — CSS 변수의 현재 값, 클래스,
 * 그리고 `getAnimations()`. 이 파일의 다른 미러가 드리프트로 값을 치른 적이 있다.
 *
 * 코드를 읽어 나온 후보는 둘이고, 로그가 그 둘을 가른다:
 *
 *   A. 노치 끝의 죽는 구간 — offset은 ±24로 잘리는데 커밋 경계는 30px이라, 손가락이
 *      24→30px를 지나는 동안 화면이 안 움직인다. => 같은 `off=` 값이 **연달아** 찍힌 뒤
 *      0으로 리셋되면 A다. `maxSameOffRun`이 그 지문이다.
 *   B. 애니메이션이 켜졌다 잘림 — 커밋 직후 delta가 0~5px이라 `.dragging`이 한 프레임
 *      빠질 수 있고, 그 프레임에 방금 리마운트된 값 컨테이너에서 210ms 슬라이드가
 *      시작됐다가 다음 프레임의 `animation: none !important`에 잘린다.
 *      => `drag=Y→N→Y`와 함께 `anim`이 0→1→0이고 `at=`이 210에 한참 못 미치면 B다.
 *
 * 둘 다 아니면 로그가 그렇게 말해 줄 것이다. 그때는 이 패널을 더 늘린다. */
type SwipeSample = { off: string; drag: boolean; mv: string; anim: number; trans: number; at: string; gen: number };

let swipeStop: (() => void) | null = null;

function readValuesEl(column: Element): HTMLElement | null {
  return column.querySelector<HTMLElement>(".wheel-values");
}

function sampleSwipe(column: Element, values: HTMLElement, generation: number): SwipeSample {
  const running = typeof values.getAnimations === "function" ? values.getAnimations() : [];
  // 애니메이션과 전환을 나눠 센다 — 이 요소는 `transition: transform 110ms`도 갖고 있어서
  // 합쳐 세면 어느 쪽이 돌았는지 알 수 없다.
  let anim = 0;
  let trans = 0;
  let at = "-";
  for (const a of running) {
    if ((a.constructor?.name ?? "") === "CSSTransition") { trans += 1; continue; }
    anim += 1;
    if (at === "-") at = typeof a.currentTime === "number" ? String(Math.round(a.currentTime)) : String(a.currentTime);
  }
  const cls = column.classList;
  return {
    off: getComputedStyle(values).getPropertyValue("--wheel-drag-offset").trim() || "0px",
    drag: cls.contains("dragging"),
    mv: cls.contains("moving-next") ? "next" : cls.contains("moving-previous") ? "prev" : "-",
    anim, trans, at, gen: generation,
  };
}

/** 포인터를 내린 순간부터 뗄 때까지 매 프레임 샘플링하고, 값이 바뀐 프레임만 남긴다. */
function startSwipeTrace(column: Element) {
  swipeStop?.();
  const started = performance.now();
  let frames = 0;
  let changed = 0;
  let lastKey = "";
  let lastValues = readValuesEl(column);
  let generation = 0;   // 값 컨테이너가 리마운트된 횟수 = 커밋 횟수의 **관측값**
  let plateauMax = 0;   // 같은 off가 연달아 유지된 최대 프레임 수 — 후보 A의 지문
  let plateauRun = 0;
  let lastOff = "";
  let raf = 0;
  let lastFrameAt = 0;
  let worstFrameGap = 0;
  let worstFrameAt = 0;
  let framesOver32 = 0;

  append("swipe start — 매 프레임 샘플링(값이 바뀐 프레임만 남깁니다)");

  const tick = () => {
    /* 🔴 **드래그 중의 프레임 간격** — 오너: "전체적으로 안드로이드에서 엄청 버벅대네."
     * `slide`는 커밋 **뒤** 애니메이션만 봅니다. 손가락이 닿아 있는 동안은 이 루프가
     * 유일한 눈이고, 지금까지는 **총 프레임 수만** 남겼습니다. 캡처에서 손으로 세어 보면
     * 같은 기기가 20fps에서 90fps까지 흔들렸는데, 그 수를 트레이스가 직접 말해야 합니다. */
    const now = performance.now();
    if (lastFrameAt > 0) {
      const gap = now - lastFrameAt;
      if (gap > worstFrameGap) { worstFrameGap = gap; worstFrameAt = frames; }
      if (gap > 32) framesOver32 += 1;
    }
    lastFrameAt = now;
    frames += 1;
    const values = readValuesEl(column);
    if (values) {
      if (values !== lastValues) { generation += 1; lastValues = values; }
      const s = sampleSwipe(column, values, generation);
      if (s.off === lastOff) { plateauRun += 1; if (plateauRun > plateauMax) plateauMax = plateauRun; }
      else { plateauRun = 1; lastOff = s.off; }
      const key = `${s.off}|${s.drag}|${s.mv}|${s.anim}|${s.trans}|${s.gen}`;
      if (key !== lastKey) {
        lastKey = key;
        changed += 1;
        append(`  swipe f${String(frames).padStart(3)} +${Math.round(performance.now() - started)}ms  off=${s.off.padEnd(7)} drag=${s.drag ? "Y" : "N"} mv=${s.mv.padEnd(4)} anim=${s.anim} at=${s.at.padEnd(4)} trans=${s.trans} gen=${s.gen}`);
      }
    }
    if (frames < 600) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  swipeStop = () => {
    cancelAnimationFrame(raf);
    swipeStop = null;
    const held = Math.round(performance.now() - started);
    const fps = held > 0 ? Math.round((frames / held) * 1000) : 0;
    append(`swipe end   frames=${frames} in ${held}ms (~${fps}fps)  🔎최대프레임간격=${Math.round(worstFrameGap)}ms(f${worstFrameAt})  32ms초과=${framesOver32}  changed=${changed} commits(gen)=${generation} maxSameOffRun=${plateauMax}`);
    append("  읽는 법: 드래그 중 fps입니다. 120Hz 기기면 정상이 ~120이고, 60 아래로 내려가면 손끝에서 '버벅'으로 느껴집니다. `slide`(커밋 뒤 애니메이션)와 따로 보세요 — 둘 중 어디가 느린지가 고칠 자리를 가릅니다.");
    append("  읽는 법: 같은 off가 연달아 여러 프레임이면 노치 끝의 죽는 구간(A). drag가 Y→N→Y로 깜빡이며 anim이 0→1→0이고 at이 210에 못 미치면 잘린 애니메이션(B).");
  };
}

/* ── 오너 리포트 2번 전용 프로브: "지금 버튼이 최초 한 번에 안 눌린다" ──────────
 *
 * **가르려는 것 하나뿐입니다: 그 탭에서 `click`이 아예 안 났는가, 났는데 아무 일도
 * 안 일어났는가.** 둘은 고침이 완전히 다릅니다.
 *   · `click` 없음 → 탭이 먹혔다. 후보: 팝오버의 `onMouseDown preventDefault`(터치의
 *     합성 mousedown을 막으면 click이 삼켜질 수 있다 — 이 저장소가 **미검증으로 적어
 *     둔 항목**입니다), 또는 팝오버가 스크롤 컨테이너라 첫 탭이 스크롤 정지에 쓰였다.
 *   · `click` 있음 → 핸들러 쪽 문제. 그때는 데모의 onChange 표식이 같이 찍힙니다.
 *
 * 그래서 **버튼이 그 사이에 움직였는지**와 **팝오버가 스크롤됐는지**를 함께 남깁니다 —
 * 손가락 아래에서 요소가 움직이면 브라우저가 click을 안 만듭니다.
 *
 * ⚠️ 휠 행(`.wheel-values button`)은 대상이 아닙니다. 그건 스와이프 경로라
 * 이미 swipe 트레이스가 봅니다. 여기가 보는 것은 **팝오버의 버튼 줄**입니다. */
/* 🔴 **탭마다 독립된 감시자를 둡니다 — 슬롯 하나로 두면 안 됩니다.**
 * 리포트된 제스처가 바로 **"첫 탭이 안 먹고 두 번째에 된다"**입니다. 슬롯이 하나면
 * 두 번째 탭이 700ms 안에 들어올 때 첫 감시자를 죽이고, **판정이 안 찍히는 것이 하필
 * 실패한 그 탭**이 됩니다 — 성공한 두 번째만 남아 "정상"으로 읽힙니다.
 * 계측기가 재려는 사건을 스스로 지우는 자리라, 슬롯을 없애고 각자 정리하게 둡니다. */
function startTapTrace(button: Element, x: number, y: number) {
  const started = performance.now();
  const popover = button.closest(".wheel-popover");
  const startTop = popover instanceof HTMLElement ? popover.scrollTop : -1;
  const startRect = button.getBoundingClientRect();
  /* 🔴 **매 프레임 재야 합니다 — 시작과 끝만 재면 "움직였다 돌아온" 것이 안 보입니다.**
   * 첫 캡처가 `버튼이동Δy=0`으로 왔는데, 그건 "안 움직였다"가 아니라 **"양 끝에서 같았다"**
   * 입니다. 손가락이 닿아 있는 동안 버튼이 잠깐이라도 움직이면 브라우저는 click을 안
   * 만듭니다 — 그게 지금 남은 1순위 후보이고, 옛 프로브로는 구조적으로 못 봅니다.
   *
   * `elementFromPoint`가 결정적인 필드입니다: **손가락 아래에 아직 그 버튼이 있는가.**
   * 좌표는 pointerdown이 준 것을 그대로 씁니다. */
  /* 🔴 **손가락 자신의 이동** — v2가 못 보던 마지막 필드입니다. v2는 **버튼이** 움직였는지만
   * 봤는데, 브라우저는 **손가락이** 슬롭(보통 8~15px)을 넘게 움직이면 그 탭의 click을 안
   * 만듭니다. 실패한 캡처에서 v2의 세 필드가 전부 N/0으로 나왔으므로, 남은 읽기 둘
   * ("손가락이 끌렸다" / "브라우저가 제스처로 삼켰다")을 가르는 것이 이 값입니다. */
  let fingerDrift = 0;
  const onMove = (event: PointerEvent) => {
    const dx = (event.clientX ?? x) - x;
    const dy = (event.clientY ?? y) - y;
    const moved = Math.round(Math.sqrt(dx * dx + dy * dy));
    if (moved > fingerDrift) fingerDrift = moved;
  };
  document.addEventListener("pointermove", onMove, true);
  let worstShift = 0;
  let leftFinger = false;
  let leftFingerAt = -1;
  let popTopChanges = 0;
  let lastPopTop = popover instanceof HTMLElement ? popover.style.top : "";
  let frames = 0;
  let raf = 0;
  const sample = () => {
    frames += 1;
    const shift = Math.round(button.getBoundingClientRect().top - startRect.top);
    if (Math.abs(shift) > Math.abs(worstShift)) worstShift = shift;
    if (popover instanceof HTMLElement && popover.style.top !== lastPopTop) { popTopChanges += 1; lastPopTop = popover.style.top; }
    const under = document.elementFromPoint(x, y);
    if (!leftFinger && !(under && button.contains(under))) { leftFinger = true; leftFingerAt = Math.round(performance.now() - started); }
    if (performance.now() - started < 700) raf = requestAnimationFrame(sample);
  };
  raf = requestAnimationFrame(sample);
  const label = (button.textContent ?? "").trim().slice(0, 12);
  const where = button.closest(".wheel-actions") ? "액션줄"
    : button.closest(".wheel-meridiem") ? "오전오후"
    : button.classList.contains("wheel-step") ? "±버튼" : "기타";
  let sawClick = false;
  let sawMouseDown = false;
  let mouseDownBlocked = false;

  append(`tap start   "${label}" (${where})  popScrollTop=${startTop} y=${Math.round(startRect.top)}`);

  const onClick = (event: Event) => {
    if (event.target instanceof Node && button.contains(event.target)) sawClick = true;
  };
  const onMouseDown = (event: MouseEvent) => {
    if (!(event.target instanceof Node) || !button.contains(event.target)) return;
    sawMouseDown = true;
    // 버블 끝에서 읽어야 팝오버의 onMouseDown까지 다 돈 결과입니다.
    setTimeout(() => { mouseDownBlocked = event.defaultPrevented; }, 0);
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("mousedown", onMouseDown, true);

  const timer = window.setTimeout(() => {
    cancelAnimationFrame(raf);
    const endTop = popover instanceof HTMLElement ? popover.scrollTop : -1;
    const endRect = button.getBoundingClientRect();
    append(`tap verdict "${label}"  click=${sawClick ? "Y" : "🔴N"}  mousedown=${sawMouseDown ? "Y" : "N"}`
      + ` mousedown막힘=${mouseDownBlocked ? "Y" : "N"}  스크롤Δ=${endTop - startTop}  버튼이동Δy(끝)=${Math.round(endRect.top - startRect.top)}`
      + `  🔎손가락이동=${fingerDrift}px  버튼최대이동=${worstShift}px  손가락밑을떠남=${leftFinger ? `Y(+${leftFingerAt}ms)` : "N"}  팝오버top바뀜=${popTopChanges}회  frames=${frames}`
      + `  +${Math.round(performance.now() - started)}ms`);
    append(sawClick
      ? "  읽는 법: click이 났으므로 탭은 도착했습니다 — 값이 안 바뀌었다면 핸들러 쪽입니다(데모의 ── onChange 표식을 보세요)."
      : "  🔴 읽는 법: click이 아예 안 났습니다. ①손가락이동이 8px을 넘으면 브라우저가 '끌었다'로 보고 click을 안 만든 것입니다(슬롭). ②손가락밑을떠남=Y면 버튼이 손가락 아래에서 사라진 것(리렌더·재배치). ③셋 다 0/N이면 브라우저가 제스처로 삼킨 것입니다.");
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("pointermove", onMove, true);
  }, 700);
  void timer;
}

/* ── 오너 리포트 1번 전용 프로브: "모바일에서 휠 애니메이션이 버벅인다" ──────────
 *
 * 휠 이동은 CSS 애니메이션(`wheel-slide-*` 210ms)이라 스와이프 트레이스가 안 봅니다
 * (그쪽은 손가락이 닿아 있는 동안만 돕니다). 여기서는 **애니메이션이 시작되는 순간**
 * 프레임 샘플링을 켜고, 끝나면 숫자로 판정합니다.
 *
 * **판정은 평균이 아니라 최대 프레임 간격입니다.** 60Hz면 16.7ms가 정상이고, 한 프레임이라도
 * 50ms를 넘으면 눈에 "덜컥"으로 보입니다. 평균만 보면 그 한 프레임이 묻힙니다.
 * 열 개수도 같이 남깁니다 — 3열과 6열은 합성 비용이 두 배고, 그게 1번의 1순위 후보입니다. */
let slideWatch: { stop: () => void } | null = null;

function startSlideTrace(columns: number) {
  if (slideWatch) return;   // 열 여섯이 동시에 애니메이션하면 첫 하나만 잽니다
  const started = performance.now();
  let frames = 0;
  let last = started;
  let worst = 0;
  let worstAt = 0;
  let over32 = 0;
  let raf = 0;

  const tick = () => {
    const now = performance.now();
    const gap = now - last;
    last = now;
    frames += 1;
    if (gap > worst) { worst = gap; worstAt = frames; }
    if (gap > 32) over32 += 1;
    if (now - started < 420) raf = requestAnimationFrame(tick);
    else slideWatch?.stop();
  };
  raf = requestAnimationFrame(tick);

  slideWatch = { stop: () => {
    cancelAnimationFrame(raf);
    slideWatch = null;
    const total = Math.round(performance.now() - started);
    const fps = frames > 0 ? Math.round((frames / total) * 1000) : 0;
    append(`slide end   열=${columns}  frames=${frames} in ${total}ms (~${fps}fps)  최대간격=${Math.round(worst)}ms(f${worstAt})  32ms초과=${over32}`);
    append("  읽는 법: 최대간격이 50ms를 넘으면 그 한 프레임이 '덜컥'입니다. 32ms초과가 여러 개면 전체가 반프레임으로 도는 것입니다. 열 수를 같이 보세요 — 3열과 6열을 각각 재서 비교해야 합니다.");
  } };
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

/* ── 키 이벤트 ───────────────────────────────────────────────────────────────
 *
 * 미해결 항목: macOS에서 `Cmd+;`(오늘로 설정)가 안 듣는다. 코드 경로는 읽어서 확인했고
 * 정상이다 — `DateWheelPicker.tsx`의 `handleShortcut`이 `(ctrlKey || metaKey) && code ===
 * "Semicolon"`을 보고, 그 호출이 "Ctrl·Meta가 눌린 키는 무시" 가드보다 **앞**에 있다
 * (그 순서에는 뮤테이션 증거가 붙어 있다: 뒤로 옮기면 4 red). **읽어서는 더 못 간다.**
 *
 * 남은 후보를 이 로그가 가른다:
 *   줄이 아예 없음        → keydown이 페이지에 도달하지 않는다. OS나 브라우저가 먼저 먹었다.
 *   `code=`가 Semicolon이 아님 → 배열·플랫폼 차이. 킷의 판정 기준을 바꿔야 한다.
 *   `tgt=`가 트리거가 아님   → 키는 왔는데 다른 데로 갔다. React 핸들러는 트리거 위에만 있다.
 *   `처리됨=N`             → 위 셋 다 통과했는데 킷이 손대지 않았다. 그때 다시 판다.
 *
 * ⚠️ **여기서 킷의 판정을 재현하지 않는다.** 이 파일은 이미 세 군데(GAP·마커·pin)에서
 * 미러 드리프트를 경고한다. "Ctrl+;인가"를 여기서 다시 계산하면 그 판정이 틀렸을 때
 * 패널도 같이 틀려서 **틀렸다는 사실 자체가 안 보인다.** 원시 사실만 적는다.
 *
 * ⚠️ **필터를 걸지 않는다.** 이 항목이 지금까지 측정 불가였던 이유가 정확히 그것이다 —
 * `historyProbe.ts`에 keydown 리스너가 **있었는데** `Escape`/`Backspace`/`ArrowLeft`만
 * 통과시키고 `metaKey`는 보지도 않아, `Cmd+;`는 두 겹으로 안 찍혔다. 목록을 늘리는
 * 대신 전부 찍는다. 대신 타이핑이 많으면 링버퍼(MAX_ENTRIES=400)를 빨리 밀어내므로,
 * 키를 볼 캡처에서는 재현 직전에 `지우기`를 한 번 누를 것.
 *
 * `keyCode`도 남긴다 — 안드로이드 소프트 키보드는 조합 중에 `key="Unidentified"`,
 * `keyCode=229`를 보내므로, 그게 보이면 "키가 안 온다"가 아니라 "IME 경로"다. */
function describeModifiers(event: KeyboardEvent): string {
  const held = [event.ctrlKey && "Ctrl", event.metaKey && "Meta", event.altKey && "Alt", event.shiftKey && "Shift"].filter(Boolean);
  return held.length ? held.join("+") : "없음";
}

const KEY_EVENTS = ["keydown", "keyup"] as const;

const POINTER_LIKE_EVENTS = ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup", "click"] as const;

let installed = false;

/** document/window/visualViewport에 관찰용 리스너를 건다. 한 번만 설치됩니다. */
export function installEventTrace() {
  if (installed) return;
  installed = true;

  // 키는 **window의 캡처 단계**에서 받는다 — 스크립트가 볼 수 있는 가장 이른 자리다
  // (캡처는 window → document → … → target 순). document에 걸면 window에서 먹힌 경우를
  // 못 보고, 그건 지금 가르려는 후보 중 하나다.
  for (const type of KEY_EVENTS) {
    window.addEventListener(type, (event) => {
      append(`${type.padEnd(7)} key=${JSON.stringify(event.key)} code=${event.code === "" ? "(빈값)" : event.code} keyCode=${event.keyCode}`
        + `  mods=${describeModifiers(event)}  rep=${event.repeat ? "Y" : "N"} ime=${event.isComposing ? "Y" : "N"}`
        + `  tgt=${describeTarget(event.target)}`);
    }, { capture: true, passive: true });
  }
  // 판정 줄은 **버블 단계의 window**에서 찍는다 — 디스패치의 마지막 자리라, 그 시점의
  // `defaultPrevented`는 트리거의 React 핸들러까지 전부 돈 뒤의 결과다.
  //
  // `queueMicrotask`로 미루면 안 된다: 브라우저가 디스패치하는 이벤트는 리스너 **사이**
  // 마다 마이크로태스크 체크포인트를 돌므로, 캡처 리스너에서 큐에 넣은 것은 대상 리스너가
  // 돌기 **전에** 실행된다 — 언제나 `처리됨=N`이 찍히는 거짓 계측기가 된다.
  //
  // **이 줄이 없으면 그것도 정보다:** 누군가 stopPropagation을 불렀다는 뜻이다.
  // 그래서 조용히 넘기지 않고 캡처 줄과 짝이 맞는지를 읽는 쪽이 보게 둔다.
  window.addEventListener("keydown", (event) => {
    append(`  ↳ 처리됨=${event.defaultPrevented ? "Y (preventDefault 호출됨)" : "N (아무도 안 잡았다)"}`);
  });

  /* 🔴 **클립보드 이벤트 — 비보안 컨텍스트에서 붙여넣기가 되는지를 가르는 자리입니다.**
   *
   * `http://<LAN-IP>:15277`은 보안 컨텍스트가 아니라 `navigator.clipboard`가 아예 없고,
   * 그때 남는 유일한 붙여넣기 경로가 **브라우저가 Ctrl+V의 기본 동작으로 보내는 `paste`
   * 이벤트**입니다. 그런데 휠 피커의 트리거는 `<button>`이라 **편집 가능한 요소가
   * 아니고**, 브라우저가 그런 요소에도 이 이벤트를 보내는지는 브라우저 pane으로 못
   * 잽니다(문서 포커스를 못 잡아 진짜 Ctrl+V를 못 밉니다).
   *
   * 이 줄이 있으면 LAN 주소에서 한 번 눌러 보고 **셋을 가를 수 있습니다**:
   *   줄이 아예 없음        → 이벤트가 안 온다. 이 경로는 없고 다른 답을 찾아야 한다
   *   줄은 있는데 값 그대로 → 이벤트는 왔고 `parsePasted`가 거절했다. 파싱을 고치면 된다
   *   줄도 있고 값도 바뀜   → 동작한다
   *
   * **이 구분이 없으면 "안 된다"는 보고에서 아무것도 못 읽습니다.** */
  for (const type of ["copy", "paste", "cut"] as const) {
    document.addEventListener(type, (event) => {
      const data = (event as ClipboardEvent).clipboardData;
      /* 🔴 **`copy`에서 `getData`는 언제나 빈 문자열입니다 — 실패가 아닙니다.**
       * 복사 이벤트의 `clipboardData`는 **쓰는 자리**이고, 그 시점엔 아직 아무도 안
       * 채웠습니다(브라우저가 기본 동작에서 선택 영역으로 채웁니다). 첫 판이 그걸
       * 그대로 찍어서 `글자=""`가 **복사 실패처럼 읽혔습니다.** 그래서 복사·잘라내기는
       * `getData` 대신 **지금 선택된 글자**를 보여 줍니다 — 그게 실제로 복사될 것입니다. */
      const pasted = type === "paste" ? (data ? data.getData("text") : null) : null;
      const selected = type === "paste" ? null : (window.getSelection()?.toString() ?? "");
      append(`${type.padEnd(11)} tgt=${describeTarget(event.target)}  보안컨텍스트=${window.isSecureContext ? "Y" : "N"}`
        + `  clipboardData=${data ? "있음" : "없음"}`
        + (type === "paste"
          ? `  받은글자=${pasted === null ? "(못 읽음)" : JSON.stringify(pasted)}`
          : `  선택된글자=${JSON.stringify(selected)} (getData는 이 시점에 비어 있는 것이 정상)`));
    }, { capture: true, passive: true });
  }

  for (const type of POINTER_LIKE_EVENTS) {
    document.addEventListener(type, (event) => {
      append(`${type.padEnd(11)} target=${describeTarget(event.target)}  menu=${menuPresent()}`);
      // 날짜 열 위에서 시작한 포인터만 프레임 트레이스를 켠다. 뗄 때(또는 취소될 때) 끈다.
      if (type === "pointerdown" && event.target instanceof Element) {
        const column = event.target.closest(".wheel-column");
        if (column) startSwipeTrace(column);
        // 팝오버 안의 **버튼 줄**을 눌렀을 때만 — 휠 행은 위 swipe 트레이스 담당입니다.
        const button = event.target.closest("button");
        if (button && button.closest(".wheel-popover") && !button.closest(".wheel-values")) {
          const point = event as PointerEvent;
          startTapTrace(button, point.clientX ?? 0, point.clientY ?? 0);
        }
      }
      if (type === "pointerup") swipeStop?.();
    }, { capture: true, passive: true });
  }
  // pointercancel은 POINTER_LIKE_EVENTS에 없다(그 목록은 "탭이 무엇을 만드는가"를 보려고
  // 만든 것이다). 스와이프 트레이스는 취소로도 끝나므로 여기서 따로 받는다 — 안 그러면
  // 손가락이 화면 밖으로 나간 캡처에서 rAF 루프가 600프레임까지 계속 돈다.
  document.addEventListener("pointercancel", () => { swipeStop?.(); }, { capture: true, passive: true });

  /* `touchcancel`은 위 목록에 없습니다(그 목록은 "탭이 무엇을 만드는가"용입니다). 그런데
   * **탭이 먹히는 경로 중 하나가 정확히 이것**이라, 안 보이면 후보를 못 지웁니다. */
  document.addEventListener("touchcancel", (event) => {
    append(`touchcancel target=${describeTarget(event.target)}  🔴 이 탭은 여기서 끝났습니다 — click이 안 나는 이유가 됩니다`);
  }, { capture: true, passive: true });

  /* 휠 이동 애니메이션이 시작되는 순간 프레임 샘플링을 켭니다(오너 리포트 1번).
   * `animationstart`는 버블하므로 document에서 한 번만 받으면 됩니다. 이름으로 걸러
   * 진입(`wheel-enter`)과 선택 팝(`wheel-selected-pop`)은 빼고 **이동만** 봅니다. */
  document.addEventListener("animationstart", (event) => {
    if (!(event instanceof AnimationEvent)) return;
    if (event.animationName !== "wheel-slide-next" && event.animationName !== "wheel-slide-previous") return;
    startSlideTrace(document.querySelectorAll(".wheel-column").length);
  }, { capture: true, passive: true });

  window.addEventListener("popstate", () => {
    append(`popstate    stackLen=${popupStackLength()}  menu=${menuPresent()}`);
  });

  // 포커스 이동 자체 — 기존 패널은 이걸 전혀 찍지 않았다. useVirtualKeyboard(hooks.ts:487)가
  // "편집 가능한 요소에 포커스가 있는가"로 열림 여부를 가르므로, 포커스가 언제·무엇으로
  // 옮겨갔는지를 놓치면 그 판정의 절반을 볼 수 없다. document.activeElement는 focusout
  // 시점에 이미 새 대상으로 넘어가 있을 수 있어(스펙상 그렇다) event.target을 tgt=로
  // 따로 남긴다 — foc=는 항상 "지금" document.activeElement, tgt=는 "이 이벤트가 가리키는" 요소.
  // **킷이 이미 열려 있는 채로** 다른 필드를 탭하면(메모 → 숫자 필드) 킷의 focusin
  // 리스너가 재조준을 건다(AppShell.tsx:529, 역시 80ms 디바운스). 그건 개창과 같은
  // 종류의 궤적이므로 같은 트레이스로 관찰한다. 킷의 focusin 리스너는
  // `if (!keyboard.open) return` 안쪽에서만 등록되므로(:511,529) **닫힌 상태의
  // focusin에는 그 리스너가 아예 달려 있지도 않다** — 그 개창의 실제 보정은 잠시 뒤
  // keyboard.open이 켜지면서 일어나고, 그건 아래 MutationObserver가 거는 트레이스가 잡는다.
  document.addEventListener("focusin", (event) => {
    const target = describeTarget(event.target);
    if (kitKeyboardOpen()) {
      logKeyboardSnapshot("focusin", target);
      startOpenTrace("refocus");
    } else {
      logKeyboardSnapshot("focusin(kb닫힘)", target);
    }
  }, { passive: true });
  // focusout에는 킷에 대응하는 경로가 **하나도 없다** — reposition()을 부르는 곳은
  // focusin 리스너(:529)와 open/inset 이펙트(:563) 둘뿐이고 어느 쪽도 focusout을 듣지
  // 않는다. 그러니 여기 붙던 reqΔ/want/achΔ/clamp는 열림 여부와 무관하게 전부 허구였다.
  // 지오메트리 줄만 남긴다 — 포커스가 언제 어디서 빠졌는지는 여전히 봐야 한다.
  document.addEventListener("focusout", (event) => {
    logKeyboardSnapshot("focusout", describeTarget(event.target));
  }, { passive: true });

  append(`trace installed  reduce=${reduceMotionState()}  ua=${truncate(navigator.userAgent, 90)}`);

  // 두 방향 트레이스의 방아쇠 — 킷이 스스로 "열렸다/닫혔다"고 판단한 그 순간에 맞춘다.
  // .app-shell의 keyboard-inset-open은 useVirtualKeyboard의 keyboard.open을 그대로
  // 반영하므로(AppShell이 붙인다), 이걸 보면 hooks.ts의 120px 문턱이나 restingHeight
  // 누적 규칙을 여기서 다시 구현하지 않아도 된다 — 재구현했다면 그게 바로 이 파일이
  // 이미 경고하고 있는 종류의 드리프트 지점이 하나 더 느는 것이다.
  //
  // 개창 트레이스를 **여기서** 거는 이유: 팬은 이 클래스가 붙는 것과 거의 동시에 시작해
  // ~210ms 이어지고, 킷의 측정은 그 팬이 멎고 80ms 뒤다. 그 전 구간을 통째로 담아야
  // "팬이 얼마나 했고 킷이 얼마나 했나"가 갈린다 — 킷이 재는 순간을 예측해 그 근처만
  // 찍으려 하면 예전 SETTLE_MS 짝과 같은 실수를 반복하게 된다.
  let shellKeyboardOpen = false;
  new MutationObserver((records) => {
    for (const record of records) {
      if (!(record.target instanceof Element) || !record.target.classList.contains("app-shell")) continue;
      const open = record.target.classList.contains("keyboard-inset-open");
      if (!shellKeyboardOpen && open) startOpenTrace("open");
      if (shellKeyboardOpen && !open) startReleaseTrace();
      shellKeyboardOpen = open;
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });

  const vv = window.visualViewport;
  if (vv) {
    // kbopen 트레이스가 도는 동안에는 지오메트리 줄을 접는다 — 그 구간은 프레임 단위로
    // 이미, 더 촘촘히 담기고 있어서 중복이다. 중간 `over=`들은 팬이 도는 중의 값이라
    // 어차피 판정 근거로 쓰면 안 되고(logKeyboardSnapshot 주석), 판정은 트레이스 끝의
    // `kbopen final` 한 줄이 한다. 창구 밖(주소창 접힘 등 키보드와 무관한 뷰포트 변화)
    // 에서는 그대로 남긴다 — 거기선 이 줄이 유일한 기록이다.
    //
    // ⚠️ **이건 링버퍼 절약책이 아니다.** 실측: 팬 한 번(간격 5/15/25ms)에 남는 줄이
    // 이전 129/45/27줄 → 지금 90/62/56줄이다. 즉 촘촘한 간격에서만 줄고 나머지에서는
    // **오히려 늘었다** — 프레임 단위 관찰의 본질적 비용이다(MAX_ENTRIES=400,
    // 프레임 줄은 RELEASE_TRACE_MAX_LINES=44로 상한). 한 캡처에 여러 사이클을 담아야
    // 하면 이 점을 감안할 것.
    const onViewportChange = (event: Event) => {
      // `viewport` 줄도 같이 접는다 — height/offsetTop이 kbopen 줄의 vpH/vpTop과 **같은
      // 값**이라 실기기 캡처에서 매 프레임 두 줄이 나란히 중복됐다:
      //     viewport scroll  height=653  offsetTop=17
      //     kbopen +103ms    vpTop=17(+13) vpH=653(+0) ...
      // 남길 게 없다. menu= 하나가 다른데 그건 이 구간에 쓸 일이 없다(팝업 진단용).
      if (activeTraces.has("kbopen")) return;
      append(`viewport ${event.type}  height=${Math.round(vv.height)}  offsetTop=${Math.round(vv.offsetTop)}  menu=${menuPresent()}`);
      logKeyboardSnapshot(event.type, undefined);
    };
    vv.addEventListener("resize", onViewportChange);
    vv.addEventListener("scroll", onViewportChange);
  }
}

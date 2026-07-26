/* history 계측기 — 데모 전용 진단 도구입니다. 키트(src/)의 일부가 아닙니다.
 *
 * `?debug=1`을 붙여 열면 페이지 로드 시점에 설치됩니다. 콘솔에 아무것도 붙여넣지
 * 않아도 되는 게 요점입니다 — 개발자도구를 클릭하는 것 자체가 포커스와 사용자
 * 제스처 상태를 바꿔서 재현하려는 현상을 흐트러뜨리기 때문입니다.
 *
 * 기록은 sessionStorage에 남으므로 뒤로가기로 페이지를 나갔다가 돌아와도
 * 그대로 남아 있습니다.
 */
const KEY = "ds-history-log";
const LIMIT = 300;

export function historyProbeEnabled() {
  return new URLSearchParams(window.location.search).has("debug");
}

export function readProbeLog(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function clearProbeLog() {
  sessionStorage.removeItem(KEY);
}

function stamp() {
  const now = new Date();
  return `${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}.${String(now.getMilliseconds()).padStart(3, "0")}`;
}

/** 표식 배열을 짧게: 마지막 4자리만 남깁니다. */
function shortStack(state: unknown) {
  const stack = (state as Record<string, unknown> | null)?.__dsPopupStack;
  if (!Array.isArray(stack)) return "없음";
  return stack.length ? stack.map((id) => String(id).slice(-4)).join(",") : "빈배열";
}

function append(line: string) {
  const log = readProbeLog();
  log.push(`${stamp()} ${line}`);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(log.slice(-LIMIT)));
  } catch {
    /* 저장이 막혀 있으면 조용히 넘어갑니다 */
  }
  window.dispatchEvent(new Event("ds-history-log"));
}

/** 데모가 다이얼로그를 열고 닫을 때 직접 남기는 표시. */
export function logProbe(note: string) {
  if (!historyProbeEnabled()) return;
  append(`── ${note}`);
}

let installed = false;

export function installHistoryProbe() {
  if (installed || !historyProbeEnabled()) return;
  installed = true;

  const active = () => (navigator.userActivation ? `제스처=${navigator.userActivation.isActive ? "살아있음" : "없음"}` : "제스처=미지원");
  append(`페이지 로드  len=${window.history.length}  표식=${shortStack(window.history.state)}`);

  const originalPush = window.history.pushState.bind(window.history);
  const originalReplace = window.history.replaceState.bind(window.history);
  const originalBack = window.history.back.bind(window.history);

  window.history.pushState = ((state: unknown, unused: string, url?: string | URL | null) => {
    append(`push  ${active()}  len=${window.history.length}→  표식=${shortStack(state)}`);
    return originalPush(state, unused, url ?? null);
  }) as History["pushState"];

  window.history.replaceState = ((state: unknown, unused: string, url?: string | URL | null) => {
    append(`replace  len=${window.history.length}  표식=${shortStack(state)}`);
    return originalReplace(state, unused, url ?? null);
  }) as History["replaceState"];

  // 우리 정리 코드가 back()을 부르면 여기 찍힙니다. 사용자가 브라우저 버튼을
  // 누른 경우에는 찍히지 않고 popstate만 남으므로 둘을 구분할 수 있습니다.
  window.history.back = (() => {
    append(`history.back() 호출됨 (우리 코드)  len=${window.history.length}`);
    return originalBack();
  }) as History["back"];

  window.addEventListener("popstate", (event) => {
    append(`popstate  ${active()}  len=${window.history.length}  받은표식=${shortStack(event.state)}`);
  });

  window.addEventListener("pageshow", (event) => {
    append(`pageshow  ${(event as PageTransitionEvent).persisted ? "bfcache 복원" : "새로 그림"}`);
  });

  window.addEventListener("pagehide", (event) => {
    append(`pagehide  ${(event as PageTransitionEvent).persisted ? "bfcache로 보관 (페이지 떠남)" : "폐기 (페이지 떠남)"}`);
  });

  // 다이얼로그가 "왜" 닫혔는지 가리기 위한 기록. 뒤로가기로 닫힌 것과
  // 백드롭 클릭·Escape로 닫힌 것은 결과가 완전히 다릅니다.
  window.addEventListener("keydown", (event) => {
    const combo = `${event.altKey ? "Alt+" : ""}${event.ctrlKey ? "Ctrl+" : ""}${event.key}`;
    if (["Escape", "Backspace", "ArrowLeft"].includes(event.key)) append(`keydown ${combo}`);
  }, true);

  document.addEventListener("mousedown", (event) => {
    if (!document.querySelector(".dialog-backdrop")) return;   // 다이얼로그 열렸을 때만
    const target = event.target as Element | null;
    const where = target?.closest?.(".dialog")
      ? "다이얼로그 안 (안 닫힘)"
      : target?.closest?.(".dialog-backdrop")
        ? "백드롭 → 이걸 누르면 다이얼로그가 닫힙니다"
        : `${target?.tagName?.toLowerCase() ?? "?"} (다이얼로그 밖)`;
    append(`mousedown → ${where}`);
  }, true);
}

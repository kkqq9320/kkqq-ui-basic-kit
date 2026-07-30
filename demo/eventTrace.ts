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

const MAX_ENTRIES = 80;
/** 이보다 긴 공백 뒤에 오는 이벤트는 새 "묶음"으로 치고 +0ms부터 다시 셉니다. */
const BURST_GAP_MS = 700;

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

  const vv = window.visualViewport;
  if (vv) {
    const onViewportChange = (event: Event) => {
      append(`viewport ${event.type}  height=${Math.round(vv.height)}  offsetTop=${Math.round(vv.offsetTop)}  menu=${menuPresent()}`);
    };
    vv.addEventListener("resize", onViewportChange);
    vv.addEventListener("scroll", onViewportChange);
  }
}

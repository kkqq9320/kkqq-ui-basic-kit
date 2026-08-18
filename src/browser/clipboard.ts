/* 브라우저 클립보드를 읽고 쓴다 — **비보안 컨텍스트 폴백까지.**
 *
 * ⚠️ **접근은 이 파일 뒤로 격리합니다.** 어느 경로가 실제로 되는지는 **실브라우저에서만**
 * 확정됩니다 — 이 저장소의 계측 환경(브라우저 pane)은 CDP로 합성한 키를 쓰는데 그건
 * 브라우저의 편집 명령을 돌리지 않아서, `copy`/`paste` 이벤트가 안 오는 것이 브라우저의
 * 성질인지 계측기의 한계인지 **가려낼 수 없습니다**(같은 이유로 그 환경에서는
 * `event.code`가 늘 빈 문자열입니다). 그래서 실제로 잰 것만 코드로 굳힙니다:
 * `navigator.clipboard`는 보안 컨텍스트가 아니면 아예 없고, 사용자 제스처 없이 부르면
 * `NotAllowedError`로 거절합니다.
 *
 * 없거나 거절당하면 **조용히 아무것도 하지 않습니다.** 폰에는 Ctrl 키가 없어 이 경로는
 * 데스크톱 전용이고, 데스크톱에서 실패하는 경우는 권한 거절뿐입니다.
 *
 * 🔴 **비보안 컨텍스트 폴백**(2026-08-16). 위 문단이 잰 그대로 —
 * `http://<LAN-IP>:15277`에서는 `navigator.clipboard`가 **아예 없습니다**(실측:
 * `isSecureContext: false`). 즉 API만 쓰면 이 기능은 **정확히 필요한 그 환경에서만**
 * 조용히 아무 일도 안 합니다.
 *
 * `execCommand`는 폐기 예정이지만 **비보안 컨텍스트에서 동작하는 유일한 경로**이고,
 * 이 저장소가 이미 같은 자리에서 같은 폴백을 쓰고 있습니다 — 데모의 TRACE 패널 복사
 * 버튼(`demo/EventTracePanel.tsx`)이 그것이고, 오너가 폰에서 실제로 써 왔습니다.
 * 즉 **추측이 아니라 이 저장소에서 이미 동작이 확인된 패턴**입니다.
 *
 * 📌 **배럴에 없습니다.** 앱이 직접 쓸 만한 물건이지만 요청한 사람이 없고, 공개 이름을
 * 늘리는 것은 릴리스 노트가 필요한 일입니다. 필요해지는 날 `src/index.ts`에 한 줄입니다.
 */

/** 🔴 **`lib.dom`은 `navigator.clipboard`를 언제나 있는 것으로 선언하는데, 실측은**
 *  **반대입니다** — 비보안 컨텍스트에서는 `undefined`입니다(`http://10.1.1.254:15277`에서
 *  잰 값). 그 사실을 타입으로 적어 둡니다. 안 그러면 `if (navigator.clipboard?.readText)`가
 *  `TS2774: This condition will always return true`로 거절당하고, 더 나쁘게는 **읽는
 *  사람이 그 가드를 군더더기로 보고 지웁니다.** */
const clipboardApi = (): Clipboard | undefined => navigator.clipboard as Clipboard | undefined;

/** 복사와 붙여넣기가 **같은 임시 요소**를 씁니다. 다른 것은 `readOnly` 하나인데,
 *  그게 결정적입니다 — **읽기 전용 textarea에는 붙여넣기가 안 됩니다.**
 *
 *  ⚠️ 화면 밖이 아니라 **투명하게 제자리**에 둡니다. `display: none`이나 화면 밖이면
 *  브라우저가 선택을 안 만들어 `execCommand`가 실패하고, 화면 밖으로 밀면 iOS가 거기로
 *  스크롤합니다. */
function makeScratchTextarea(text: string, readOnly: boolean) {
  const scratch = document.createElement("textarea");
  scratch.value = text;
  if (readOnly) scratch.setAttribute("readonly", "");
  scratch.setAttribute("aria-hidden", "true");
  scratch.tabIndex = -1;
  scratch.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;";
  document.body.appendChild(scratch);
  return scratch;
}

/** 클립보드를 **직접 읽을 수 있는가.** 호출부는 이것으로 `preventDefault`를 걸지
 *  말지 정합니다 — 못 읽으면서 막으면 브라우저의 기본 붙여넣기까지 죽습니다
 *  (`catchDefaultPaste` 주석에 그 결함의 실기기 트레이스가 있습니다). */
export function canReadClipboard(): boolean {
  return !!clipboardApi()?.readText;
}

export function writeClipboard(text: string): void {
  const api = clipboardApi();
  if (api?.writeText) {
    void api.writeText(text).catch(() => { /* 권한 거절 — 무시 */ });
    return;
  }
  const active = document.activeElement as HTMLElement | null;
  const scratch = makeScratchTextarea(text, true);
  try {
    /* ⚠️ **`focus()`를 명시로 부릅니다 — `select()`에 맡기지 않습니다.** 데모의 검증된
     * 폴백이 그렇게 하고 있고(`demo/EventTracePanel.tsx`), 엔진마다 `select()`가 포커스를
     * 옮기는지가 다릅니다. 실제로 이것 없이 쓴 첫 판은 **아래 포커스 복원이 검사로
     * 증명될 수 없었습니다** — jsdom의 `select()`는 포커스를 안 옮겨서 부르던 요소가
     * 포커스를 잃은 적이 없었고, `active?.focus?.()`를 지우는 변이가 **0 red**였습니다. */
    scratch.focus();
    scratch.select();
    document.execCommand("copy");
  } catch {
    /* 폴백도 막혔습니다 — 조용히 넘어갑니다. 이 경로에는 알릴 자리가 없습니다. */
  } finally {
    /* ⚠️ **포커스를 반드시 되돌립니다.** 안 그러면 복사 한 번에 키보드 조작이 통째로
     * 죽습니다 — 이 킷의 컨트롤들은 키를 트리거가 받습니다. */
    scratch.remove();
    active?.focus?.();
  }
}

export async function readClipboard(): Promise<string | null> {
  try { return (await clipboardApi()?.readText()) ?? null; } catch { return null; }
}

/**
 * **비보안 컨텍스트용 붙여넣기 경로** — 브라우저가 `Ctrl+V`의 기본 동작으로 하는 일을
 * 쓸 수 있는 임시 textarea로 받아 냅니다. 호출부는 이 함수를 부르는 분기에서
 * **`preventDefault`를 부르면 안 됩니다.**
 *
 * 🔴 **한동안 `preventDefault()`를 조건 없이 불렀고, 그것이 결함이었습니다.** 보안
 * 컨텍스트에서는 우리가 클립보드를 직접 읽으니 기본 동작을 막는 것이 맞습니다. 그런데
 * 비보안 컨텍스트에서는 `navigator.clipboard`가 **아예 없어서** 읽지도 못하면서
 * **브라우저의 기본 붙여넣기까지 막고** 있었습니다. 그러면 `paste` 이벤트 자체가 안
 * 생기므로 **어떤 폴백도 걸 자리가 없습니다.**
 *
 * 오너 실기기 TRACE(2026-08-16, `http://10.1.1.254:15277`)가 그대로 찍었습니다:
 *
 *     keydown key="v" mods=Ctrl  tgt=button.wheel-trigger.editing
 *       ↳ 처리됨=Y (preventDefault 호출됨)
 *     (paste 줄 없음)
 *
 * 같은 캡처에서 `copy`는 줄이 찍혔으므로 **계측기는 멀쩡했고**, `paste`가 없는 것은
 * 이벤트가 실제로 안 왔다는 뜻입니다.
 *
 * 편집 불가 요소(`<button>`)에 `paste`가 오는지에 **기대지 않는 것**이 요점입니다 —
 * textarea는 편집 가능하므로 거기로는 확실히 옵니다.
 *
 * ⚠️ 읽기에는 복사 같은 즉시 폴백이 없습니다 — `execCommand("paste")`는 웹 콘텐츠에서
 * 막혀 있습니다. 그래서 **다음 틱까지 기다렸다가** textarea에 들어온 것을 읽습니다.
 */
export function catchDefaultPaste(deliver: (text: string) => void): void {
  const active = document.activeElement as HTMLElement | null;
  const scratch = makeScratchTextarea("", false);
  scratch.focus();
  window.setTimeout(() => {
    const text = scratch.value;
    scratch.remove();
    active?.focus?.();
    deliver(text);
  }, 0);
}

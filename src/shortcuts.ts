/* 단축키의 순수 로직. **React가 없습니다** — 규칙을 단독으로 빨갛게 만들 수 있도록.
 * 설계 스펙: docs/design/2026-08-12-shortcuts-design.md
 */

export type Combo = { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean; code: string };

/** 표기 순서가 정본입니다(스펙 §4). 이 배열의 순서를 바꾸면 저장된 조합이 전부 다른
 * 문자열이 됩니다 — 바꾸지 마세요. */
const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Meta"] as const;

export function parseCombo(text: string): Combo | null {
  const parts = text.split("+");
  const code = parts.pop();
  if (!code) return null;
  if ((MODIFIER_ORDER as readonly string[]).includes(code)) return null;   // "Ctrl+Shift" — 키가 없다
  const combo: Combo = { ctrl: false, alt: false, shift: false, meta: false, code };
  for (const part of parts) {
    if (part === "Ctrl") combo.ctrl = true;
    else if (part === "Alt") combo.alt = true;
    else if (part === "Shift") combo.shift = true;
    else if (part === "Meta") combo.meta = true;
    else return null;                                                       // 모르는 수식어
  }
  return combo;
}

// MODIFIER_ORDER는 표기용 이름(대문자로 시작)이고 Combo의 필드는 소문자입니다 —
// 이 매핑이 없으면 이름을 그대로 Combo의 키로 못 씁니다.
const MODIFIER_FLAG: Record<(typeof MODIFIER_ORDER)[number], keyof Omit<Combo, "code">> = {
  Ctrl: "ctrl",
  Alt: "alt",
  Shift: "shift",
  Meta: "meta",
};

export function formatCombo(combo: Combo): string {
  const parts: string[] = [];
  for (const name of MODIFIER_ORDER) {
    if (combo[MODIFIER_FLAG[name]]) parts.push(name);
  }
  parts.push(combo.code);
  return parts.join("+");
}

export function normalizeCombo(text: string): string | null {
  const combo = parseCombo(text);
  return combo ? formatCombo(combo) : null;
}

export function comboFromEvent(event: KeyboardEvent): Combo {
  return { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey, code: event.code };
}

export function hasModifier(combo: Combo): boolean {
  return combo.ctrl || combo.alt || combo.shift || combo.meta;
}

/** 앱이 "이 안에서는 맨 키를 body처럼 친다"고 표시하는 속성. 값은 안 봅니다. */
export const BARE_KEY_SCOPE_ATTR = "data-kkqq-shortcut-scope";

/** `Escape`·`Tab`은 조합으로 등록할 수 없습니다(스펙 §6.2, §2.1) — `Shift+Tab`처럼
 * 수식어가 붙어도 `code`가 이 안에 있으면 마찬가지입니다. 킷의 document 리스너 여럿이
 * 이 둘을 `preventDefault` 없이 먹고 있어서, 등록을 허용하면 그 리스너들과 조용히
 * 충돌합니다(예: `Dialog`의 포커스 트랩은 감싸지 않는 평범한 `Tab`에서 `preventDefault`를
 * 안 부르므로, `Shift+Tab`을 액션에 바인딩하면 포커스가 아예 안 나가는 결함이 됩니다).
 *
 * `bindingOf`(`ShortcutProvider.tsx`)와 녹음기(`ShortcutSettings.tsx`) **둘 다** 이
 * 관문을 봐야 합니다 — 전에는 녹음기 안에만 있어서 `defaultCombo`·`overrides`로 들어오는
 * 조합이 그 관문을 그냥 우회했습니다(전체 리뷰 Important 2). 그래서 한 곳(`shortcuts.ts`)에
 * 두고 둘이 같이 가져다 씁니다 — §9의 파일 경계(로직은 `shortcuts.ts`)를 그대로 따릅니다. */
export const UNBINDABLE_CODES: ReadonlySet<string> = new Set(["Escape", "Tab"]);

/** 텍스트를 넣는 자리가 **아닌** input type. 나머지는 전부 타이핑 대상으로 봅니다 —
 * 목록을 뒤집어 두면 새 type이 생겨도 안전한 쪽(양보)으로 떨어집니다. */
const NON_TEXT_INPUT_TYPES = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

/** 브라우저가 네이티브로 처리하면서 **`preventDefault`를 부르지 않는** 편집 조합.
 * 그래서 규칙 1이 이것들을 못 막습니다 — 스펙 §2.3. 이 스펙에서 목록을 쓰는
 * 유일한 자리이고, 빠뜨리면 조합이 두 번 동작해 **눈에 보입니다.** */
const NATIVE_EDIT_CODES = new Set(["KeyA", "KeyC", "KeyV", "KeyX", "KeyZ", "KeyY"]);

function isTypingTarget(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(element.type);
  return false;
}

/* **녹음 중에는 디스패치가 멈춥니다**(스펙 §6.1). 모듈 수준 플래그입니다.
 *
 * ⚠️ **리스너 순서(캡처/버블) + `stopPropagation()`으로 하려다 기각했습니다 — 안 막혀서가
 * 아니라 너무 많이 막혀서입니다.** 녹음기를 document **캡처**에, 디스패처를 document
 * **버블**에 걸고 캡처 쪽에서 `stopPropagation()`을 부르는 설계였습니다. 이건 실제로
 * 디스패처를 막습니다 — `document`가 이벤트의 타깃이라도, 같은 노드의 캡처 패스와
 * 버블 패스는 서로 다른 두 번의 `invoke` 호출이고(캡처가 항상 먼저 끝난 뒤 버블이
 * 시작합니다), `stopPropagation()`은 뒤이은 패스의 `invoke` 진입 자체를 건너뛰게 합니다
 * (jsdom으로 확인 — 캡처 리스너가 `stopPropagation()`을 부르면 같은 document의 버블
 * 리스너는 안 돌고, 안 부르면 둘 다 돕니다). 문제는 디스패처만 막는 게 아니라
 * `document`의 버블 리스너 **전부**를 막는다는 것입니다 — `useEscapeToClose`
 * (`src/hooks.ts`)·`Dialog`·`SectionTabs`·`PageChrome`도 같이 죽어서, 녹음 중 `Escape`로
 * 뒤에 있는 다이얼로그를 못 닫게 됩니다. 게다가 이게 실제로 막는지는 디스패처가
 * `ShortcutProvider.tsx`에서 어느 페이즈에 걸리는가라는, 다른 파일의 선택에 조용히
 * 묶입니다 — 그 파일이 나중에 캡처로 바뀌면 이 설계는 소리 없이 깨집니다.
 *
 * 이 저장소에 **"근거 없는 순서 계약을 주석에 심는 실수가 세 번"**이라고 적혀 있습니다.
 * 그래서 순서/전파가 아니라 플래그입니다 — 어느 리스너가 몇 개 걸려 있든 무관하게
 * 참이어야 하기 때문입니다. 중첩될 일은 없지만 깊이로 세어 두면 해제가 한쪽으로
 * 새지 않습니다. */
let recordingDepth = 0;

export function beginRecording(): void { recordingDepth += 1; }
export function endRecording(): void { recordingDepth = Math.max(0, recordingDepth - 1); }
export function isRecording(): boolean { return recordingDepth > 0; }

/** 킷 컴포넌트가 **이미 쓰는** 조합. `tests/shortcutConflicts.test.ts`가 이 목록을
 * `src/`의 실제 코드와 대조하므로, 컴포넌트가 새 조합을 쓰기 시작하면 빨개집니다.
 * `Ctrl`로 적지만 macOS의 `Cmd`도 같은 자리입니다 — 킷이 둘을 같이 봅니다. */
export const KIT_RESERVED: readonly string[] = ["Ctrl+Semicolon"];

export type Conflict = { combo: string; withActionId?: string; withKit?: boolean };

/** 킷 컴포넌트는 `ctrlKey || metaKey`로 판정합니다(`DateWheelPicker.tsx`의 `handleShortcut`).
 * 그래서 **예약 조합을 비교할 때만** `Meta`를 `Ctrl`과 같은 것으로 봅니다.
 * 이게 없으면 `Cmd+;`가 충돌로 안 잡히고, 사용자는 등록에 성공한 뒤 날짜 선택기가
 * 그 키를 먹는 것을 봅니다 — **맥에서만 나는 결함**입니다.
 *
 * **`Shift`·`Alt`도 같은 이유로 접습니다.** `DateWheelPicker.tsx`의 `handleShortcut`의 실제 가드는
 * `(event.ctrlKey || event.metaKey) && event.code === "Semicolon"`이고 `shiftKey`·
 * `altKey`는 아예 보지 않습니다 — 그 컴포넌트는 `Ctrl+;`뿐 아니라 `Ctrl+Shift+;`·
 * `Ctrl+Alt+;`·`Cmd+Shift+;`도 전부 먹습니다. 접지 않으면 이 조합들의 문자열이
 * `"Ctrl+Semicolon"`과 달라 충돌 검사를 통과하고, 등록에 성공한 뒤 날짜 필드에
 * 포커스가 있을 때 그 키를 누르면 피커가 먼저 `preventDefault()`를 불러 규칙 1에
 * 걸려 앱 액션이 안 불립니다 — **모든 플랫폼에서 재현됩니다.**
 *
 * 즉 **예약 비교는 컴포넌트의 실제 판정보다 넓어야** 안전한 쪽으로 틀립니다.
 * `Ctrl+Shift+;`를 앱이 못 쓰게 되는 것은 의도된 대가입니다 — 실제로 그 컴포넌트가
 * 그 키를 먹으니까요.
 *
 * ⚠️ 액션끼리의 비교(§5.1)에는 쓰지 마세요. 거기서는 `Ctrl+K`와 `Cmd+K`가,
 * `Ctrl+K`와 `Ctrl+Shift+K`가 **다른 조합**이고, 앱이 둘을 따로 걸 수 있어야 합니다. */
function reservedKey(text: string): string | null {
  const combo = parseCombo(text);
  if (!combo) return null;
  return formatCombo({ ...combo, ctrl: combo.ctrl || combo.meta, meta: false, shift: false, alt: false });
}

export function findConflict(
  combo: string,
  actionId: string,
  bindings: Record<string, string | null>,
): Conflict | null {
  const wanted = normalizeCombo(combo);
  if (!wanted) return null;
  const wantedReserved = reservedKey(wanted);
  if (KIT_RESERVED.some((reserved) => reservedKey(reserved) === wantedReserved)) return { combo: wanted, withKit: true };
  for (const [id, bound] of Object.entries(bindings)) {
    if (id === actionId || bound === null) continue;
    if (normalizeCombo(bound) === wanted) return { combo: wanted, withActionId: id };
  }
  return null;
}

/** 킷이 이름을 쥐고 있는 유일한 액션. **핸들러는 앱 것입니다** — `Sidebar`가
 * controlled라 접힘 상태를 킷이 안 들고 있습니다(`Sidebar.tsx:9`). 킷이 주는 것은
 * **안정적인 `id`**뿐이고, 그게 있어야 앱마다 id가 달라져 저장된 덮어쓰기가
 * 갈라지는 일이 없습니다. */
export const SIDEBAR_TOGGLE_ID = "kkqq:sidebar-toggle";

export type SidebarToggleActionOptions = {
  label?: string;
  /** 이 액션의 기본 조합. **기본값은 `null`**입니다 — 킷은 어떤 조합도 대신 정하지
   * 않습니다(스펙 §3.2). §3.2가 막는 것은 "킷이 정하는 것"이지 "앱이 정하는 것"이
   * 아닙니다 — 앱이 이 자리로 기본 조합을 넘기는 것은 §3.2와 어긋나지 않습니다.
   * (전체 리뷰 Important 1 — 전에는 이 자리가 없어서 앱이 기본 조합을 넣을 곳이
   * `overrides`뿐이었고, 그러면 "사용자가 바꾼 것만"이라는 §7.1의 뜻이 앱의 기본값과
   * 섞여 구분이 안 됐습니다.) */
  defaultCombo?: string | null;
};

export function sidebarToggleAction(onFire: () => void, options: SidebarToggleActionOptions = {}) {
  const { label = "사이드바 접기/펴기", defaultCombo = null } = options;
  return { id: SIDEBAR_TOGGLE_ID, label, defaultCombo, onFire };
}

export function shouldTrigger(event: KeyboardEvent): boolean {
  if (isRecording()) return false;                      // 스펙 §6.1
  if (event.repeat) return false;                       // 눌러 둔 키가 액션을 반복하지 않게
  if (event.defaultPrevented) return false;             // 규칙 1
  const combo = comboFromEvent(event);
  const active = document.activeElement;
  const typing = isTypingTarget(active);
  // 규칙 2의 수식어는 Ctrl·Alt·Meta뿐입니다(스펙 §2 규칙 2 — 괄호 안에 Shift가 없습니다).
  // hasModifier()는 그대로 둡니다 — 공개 API이고 tests/shortcutCombo.test.ts가 씁니다
  // (지금 src/ 안에는 이 함수를 쓰는 다른 자리가 없습니다). 여기서만 따로 세는 이유:
  // Shift까지 이 분기로 보내면 Shift 단독 조합이 규칙 4(타이핑 중 차단)를 건너뛰어
  // 버립니다. 두벌식 쌍자음(ㄲㄸㅃㅆㅉ)·ㅒㅖ와 `?`(Shift+Slash)가 전부 Shift 조합이라,
  // 그러면 어떤 <textarea>에서도 그 글자를 못 칩니다.
  if (combo.ctrl || combo.alt || combo.meta) {
    // 규칙 5 — 타이핑 중에만, 그리고 Ctrl/Meta 조합에만 적용됩니다.
    if (typing && (combo.ctrl || combo.meta) && NATIVE_EDIT_CODES.has(combo.code)) return false;
    return true;                                        // 규칙 2
  }
  if (typing) return false;                             // 규칙 4
  if (!active || active === document.body) return true; // 규칙 3
  return active.closest(`[${BARE_KEY_SCOPE_ATTR}]`) !== null;
}

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
 * ⚠️ **리스너 순서로 하려다 틀렸습니다.** 녹음기를 document **캡처**에, 디스패처를
 * document **버블**에 걸고 `stopPropagation()`으로 막으려 했는데, 이벤트가 `document`를
 * 타깃으로 오면 **AT_TARGET에서 둘 다 등록 순서로 돕니다** — `stopPropagation`은 같은
 * 노드의 다른 리스너를 못 막습니다. 그러면 녹음 중에 액션이 같이 돕니다.
 *
 * 이 저장소에 **"근거 없는 순서 계약을 주석에 심는 실수가 세 번"**이라고 적혀 있습니다.
 * 그래서 순서가 아니라 플래그입니다 — 어느 리스너가 먼저 도는지와 무관하게 참입니다.
 * 중첩될 일은 없지만 깊이로 세어 두면 해제가 한쪽으로 새지 않습니다. */
let recordingDepth = 0;

export function beginRecording(): void { recordingDepth += 1; }
export function endRecording(): void { recordingDepth = Math.max(0, recordingDepth - 1); }
export function isRecording(): boolean { return recordingDepth > 0; }

/** 킷 컴포넌트가 **이미 쓰는** 조합. `tests/shortcutConflicts.test.ts`가 이 목록을
 * `src/`의 실제 코드와 대조하므로, 컴포넌트가 새 조합을 쓰기 시작하면 빨개집니다.
 * `Ctrl`로 적지만 macOS의 `Cmd`도 같은 자리입니다 — 킷이 둘을 같이 봅니다. */
export const KIT_RESERVED: readonly string[] = ["Ctrl+Semicolon"];

export type Conflict = { combo: string; withActionId?: string; withKit?: boolean };

/** 킷 컴포넌트는 `ctrlKey || metaKey`로 판정합니다(`DateWheelPicker.tsx:1095`).
 * 그래서 **예약 조합을 비교할 때만** `Meta`를 `Ctrl`과 같은 것으로 봅니다.
 * 이게 없으면 `Cmd+;`가 충돌로 안 잡히고, 사용자는 등록에 성공한 뒤 날짜 선택기가
 * 그 키를 먹는 것을 봅니다 — **맥에서만 나는 결함**입니다.
 * ⚠️ 액션끼리의 비교(§5.1)에는 쓰지 마세요. 거기서는 `Ctrl+K`와 `Cmd+K`가
 * **다른 조합**이고, 앱이 둘을 따로 걸 수 있어야 합니다. */
function reservedKey(text: string): string | null {
  const combo = parseCombo(text);
  if (!combo) return null;
  return formatCombo({ ...combo, ctrl: combo.ctrl || combo.meta, meta: false });
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

export function shouldTrigger(event: KeyboardEvent): boolean {
  if (isRecording()) return false;                      // 스펙 §6.1
  if (event.repeat) return false;                       // 눌러 둔 키가 액션을 반복하지 않게
  if (event.defaultPrevented) return false;             // 규칙 1
  const combo = comboFromEvent(event);
  const active = document.activeElement;
  const typing = isTypingTarget(active);
  // 규칙 2의 수식어는 Ctrl·Alt·Meta뿐입니다(스펙 §2 규칙 2 — 괄호 안에 Shift가 없습니다).
  // hasModifier()는 그대로 둡니다 — 다른 Task가 "이 조합에 수식어가 있나"용으로 씁니다.
  // 여기서만 따로 세는 이유: Shift까지 이 분기로 보내면 Shift 단독 조합이 규칙 4(타이핑
  // 중 차단)를 건너뛰어 버립니다. 두벌식 쌍자음(ㄲㄸㅃㅆㅉ)·ㅒㅖ와 `?`(Shift+Slash)가
  // 전부 Shift 조합이라, 그러면 어떤 <textarea>에서도 그 글자를 못 칩니다.
  if (combo.ctrl || combo.alt || combo.meta) {
    // 규칙 5 — 타이핑 중에만, 그리고 Ctrl/Meta 조합에만 적용됩니다.
    if (typing && (combo.ctrl || combo.meta) && NATIVE_EDIT_CODES.has(combo.code)) return false;
    return true;                                        // 규칙 2
  }
  if (typing) return false;                             // 규칙 4
  if (!active || active === document.body) return true; // 규칙 3
  return active.closest(`[${BARE_KEY_SCOPE_ATTR}]`) !== null;
}

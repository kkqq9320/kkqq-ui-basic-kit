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

export function formatCombo(combo: Combo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push("Ctrl");
  if (combo.alt) parts.push("Alt");
  if (combo.shift) parts.push("Shift");
  if (combo.meta) parts.push("Meta");
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

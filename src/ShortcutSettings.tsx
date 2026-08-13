import { useEffect, useState } from "react";

import { useShortcutRegistry } from "./ShortcutProvider";
import { beginRecording, comboFromEvent, endRecording, findConflict, formatCombo, UNBINDABLE_CODES } from "./shortcuts";

export type ShortcutSettingsProps = {
  /** 있으면 이 함수로 커밋합니다(앱이 소유) — 지금까지의 동작입니다. **없으면**
   *  `registry.setBinding`으로 커밋합니다 — `ShortcutProvider`가 `storage`를 받은
   *  uncontrolled일 때만 실제로 저장됩니다(`setBinding`이 그 조건을 봅니다).
   *
   *  **`onChange`도 없고 `setBinding`도 못 하면**(즉 Provider에 `overrides`도
   *  `storage`도 없으면) 저장할 곳이 어디에도 없다는 뜻입니다. 그 자리에서 조용히
   *  아무 일도 안 하면 사용자는 "녹음했는데 왜 안 남지"를 새로고침 전까지 모릅니다
   *  — 그래서 `console.warn`으로 개발자에게 알립니다(`DateWheelPicker`가 `fields`
   *  오배선을 알리는 것과 같은 선례). 화면에 뜨는 `role="alert"` 안내로는 안 했습니다
   *  — 이건 런타임 상태(조합 충돌 등)가 아니라 **배선 누락**이라 사용자가 아니라
   *  개발자가 고칠 문제이기 때문입니다. 실제 배포에서는 둘 중 하나가 항상 있어야
   *  하므로, 이 경고는 개발 중에만 마주칠 것으로 기대합니다. */
  onChange?(id: string, combo: string | null): void;
  className?: string;
};

/** `code`는 사람이 읽기 나쁩니다. 빠진 항목은 원시 `code`가 그대로 보일 뿐
 * **동작은 안 틀립니다**(스펙 §4) — 설정 화면에서 눈에 띄면 그때 더하면 됩니다. */
const CODE_LABELS: Record<string, string> = { Semicolon: ";", Comma: ",", Period: ".", Slash: "/", Backslash: "\\", Quote: "'", BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Backquote: "`", Space: "Space" };

function labelForCode(code: string): string {
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export function displayCombo(combo: string): string {
  const parts = combo.split("+");
  const code = parts.pop()!;
  return [...parts, labelForCode(code)].join(" + ");
}

const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)/;

export function ShortcutSettings({ onChange, className }: ShortcutSettingsProps) {
  const registry = useShortcutRegistry();
  const [recording, setRecording] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  /** `onChange`(앱 소유)가 있으면 그걸 부르고 끝입니다. 없으면 `registry.setBinding`에
   *  맡깁니다 — Provider가 `storage`로 uncontrolled면 그게 저장까지 하고, 아니면
   *  `false`를 돌려줍니다(위 `ShortcutSettingsProps.onChange` 문서 참고). */
  function commit(id: string, combo: string | null) {
    if (onChange) { onChange(id, combo); return; }
    if (!registry.setBinding(id, combo)) {
      console.warn("ShortcutSettings: 이 조합을 저장할 곳이 없습니다 — onChange를 넘기거나 ShortcutProvider에 storage를 넘기세요.");
    }
  }

  useEffect(() => {
    if (!recording) return;
    // 디스패처를 멈추는 것은 **이 플래그**이지 리스너 순서가 아닙니다 —
    // `shouldTrigger` 위 주석에 왜인지 적혀 있습니다(스펙 §6.1).
    beginRecording();
    function handleKeyDown(event: KeyboardEvent) {
      // Escape·Tab은 preventDefault를 부르지 않습니다 — 스펙 §6.2. Tab은 포커스가
      // 그대로 나가야 "포커스가 나가면 녹음 종료"가 성립하고, Escape는 document의
      // 다른 리스너(다이얼로그 닫기 등)로 그대로 전파돼야 합니다. 이 목록(UNBINDABLE_CODES)은
      // shortcuts.ts에 있습니다 — bindingOf(ShortcutProvider.tsx)도 같은 목록을 봐야
      // defaultCombo·overrides로 들어오는 조합도 똑같이 막힙니다(전체 리뷰 Important 2).
      if (UNBINDABLE_CODES.has(event.code)) { setRecording(null); return; }
      // 규칙 6만 살려 둡니다 — 안 그러면 Ctrl+S를 등록하려다 브라우저 저장
      // 대화상자가 뜹니다(스펙 §6.1).
      event.preventDefault();
      if (MODIFIER_CODES.test(event.code)) return;              // 수식어만 눌린 상태
      // 맨 키도 등록할 수 있습니다(규칙 3이 뜨는 자리를 좁히지, 등록을 막지 않습니다).
      // 충돌 검사는 수식어 조합과 똑같이 겁니다.
      const text = formatCombo(comboFromEvent(event));
      const bindings = Object.fromEntries(registry.actions.map((item) => [item.id, registry.bindingOf(item.id)]));
      const conflict = findConflict(text, recording!, bindings);
      if (conflict?.withKit) { setMessage(`${displayCombo(text)}는 킷의 날짜 선택기가 씁니다`); setRecording(null); return; }
      if (conflict?.withActionId) {
        const other = registry.actions.find((item) => item.id === conflict.withActionId);
        setMessage(`${displayCombo(text)}는 이미 "${other?.label}"가 씁니다`);
        setRecording(null);
        return;
      }
      setMessage(null);
      commit(recording!, text);
      setRecording(null);
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      endRecording();
    };
    // commit은 registry·onChange만 읽으므로 의존성은 그대로입니다 — 이 둘이 바뀌면
    // effect가 다시 걸려 최신 commit을 새로 캡처합니다.
  }, [recording, registry, onChange]);

  return (
    <div className={["kkqq-shortcuts", className].filter(Boolean).join(" ")}>
      {message ? <p className="kkqq-shortcuts__alert" role="alert">{message}</p> : null}
      {/* **이 문장이 스펙 §5.3의 계측기입니다.** 브라우저가 먼저 먹는 조합은 keydown이
          아예 안 옵니다 — 목록으로는 못 잡고, 사용자가 그 자리에서 관측할 수 있습니다.
          이 안내가 없으면 녹음기는 그냥 반응 없는 화면입니다. */}
      {recording ? (
        <p className="kkqq-shortcuts__hint">
          조합을 누르세요. <strong>아무 반응이 없으면 그 조합은 브라우저나 OS가 먼저 씁니다</strong> — 다른 조합을 고르세요.
        </p>
      ) : null}
      <ul className="kkqq-shortcuts__list">
        {registry.actions.map((item) => {
          const bound = registry.bindingOf(item.id);
          return (
            <li className="kkqq-shortcuts__row" key={item.id}>
              <span className="kkqq-shortcuts__label">{item.label}</span>
              <button
                className="kkqq-shortcuts__record secondary-button"
                type="button"
                onClick={() => { setMessage(null); setRecording(item.id); }}
              >
                {recording === item.id ? `${item.label} — 조합을 누르세요` : `${item.label} ${bound ? displayCombo(bound) : "없음"}`}
              </button>
              <button className="kkqq-shortcuts__clear secondary-button" type="button" onClick={() => { setMessage(null); commit(item.id, null); }}>지우기</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

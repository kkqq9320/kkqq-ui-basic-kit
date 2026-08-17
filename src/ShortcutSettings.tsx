import { useEffect, useRef, useState } from "react";

import { useShortcutRegistry } from "./ShortcutProvider";
import { beginRecording, bindingWarning, comboFromEvent, endRecording, findConflict, formatCombo, UNBINDABLE_CODES, unbindableReason, type UnbindableReason } from "./shortcuts";

export type ShortcutSettingsProps = {
  /** 있으면 이 함수로 커밋합니다(앱이 소유) — 지금까지의 동작입니다. **없으면**
   *  `registry.setBinding`으로 커밋합니다 — `ShortcutProvider`가 `storage`를 받은
   *  uncontrolled일 때만 실제로 저장됩니다(`registry.canPersist`가 그 조건을 봅니다).
   *
   *  **`onChange`도 없고 저장할 곳도(`canPersist`) 없으면**(즉 Provider에 `overrides`도
   *  `storage`도 없으면) 저장할 곳이 어디에도 없다는 뜻입니다. 그 자리에서 조용히
   *  아무 일도 안 하면 사용자는 "녹음했는데 왜 안 남지"를 새로고침 전까지 모릅니다
   *  — 그래서 `console.warn`으로 개발자에게 알립니다(`DateWheelPicker`가 `fields`
   *  오배선을 알리는 것과 같은 선례 — `importMetaEnv?.DEV` 가드와 인스턴스별 중복
   *  억제까지 그대로 따릅니다). 화면에 뜨는 `role="alert"` 안내로는 안 했습니다
   *  — 이건 런타임 상태(조합 충돌 등)가 아니라 **배선 누락**이라 사용자가 아니라
   *  개발자가 고칠 문제이기 때문입니다. 실제 배포에서는 둘 중 하나가 항상 있어야
   *  하므로, 이 경고는 개발 중에만 마주칠 것으로 기대합니다.
   *
   *  ⚠️ **배선은 됐는데 `storage.write`가 막힌 경우(프라이빗 모드·용량 초과)는 다른
   *  경로입니다** — `registry.canPersist`는 참인데 `registry.setBinding`이 `false`를
   *  돌려줍니다. 이건 배선 누락이 아니라 **런타임 저장 실패**라 사용자가 알아야 할
   *  일이고(다음에 열면 이 조합이 사라져 있을 수 있음), 그래서 `console.warn`이 아니라
   *  화면의 `role="alert"` 안내로 냅니다(전체 리뷰 Important 2 — 이전에는 `setBinding`의
   *  `false`를 전부 "저장할 곳이 없다"로 번역해, 이미 배선한 앱이 저장소가 막혔을
   *  때도 배선하라는 경고를 받았습니다). */
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

/** 등록 금지의 **문구**는 UI의 것입니다 — `shortcuts.ts`는 이유 코드만 줍니다(§9의
 * 파일 경계). `kit-listener`는 여기 안 씁니다: `Escape`·`Tab`은 그 자리에서 녹음을
 * 조용히 취소하는 것이 계약이라(§6.2 — 포커스가 나가야 하고 `Escape`가 전파돼야
 * 합니다) 이 표에 닿기 전에 걸러집니다. `bindingOf` 쪽에서만 그 이유를 씁니다. */
const UNBINDABLE_COPY: Record<UnbindableReason, (text: string) => string> = {
  "kit-listener": (text) => `${displayCombo(text)}는 등록할 수 없습니다 — 킷이 쓰는 키입니다`,
  activation: (text) => `${displayCombo(text)}는 등록할 수 없습니다 — 포커스한 버튼·링크를 누르는 키입니다`,
  "native-edit": (text) => `${displayCombo(text)}는 등록할 수 없습니다 — 브라우저의 복사·붙여넣기·되돌리기입니다`,
};

export function ShortcutSettings({ onChange, className }: ShortcutSettingsProps) {
  const registry = useShortcutRegistry();
  const [recording, setRecording] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // `DateWheelPicker`의 `fields` 오배선 경고와 같은 선례를 그대로 따릅니다(전체 리뷰
  // Important 2) — `import.meta.env`는 Vite 전용 확장이라 그 자리가 아예 없는
  // 번들러도 있습니다. `?.` 없이 `.DEV`를 읽으면 그 자리에서 `TypeError`를 던지므로
  // (이 킷은 `exports["."]`가 소스를 그대로 내보내 소비자의 번들러를 그대로 탑니다),
  // 옵셔널 체이닝이 "던지지 않는다"는 목적이 실제로 성립하는 데 필수입니다.
  const importMetaEnv = (import.meta as { env?: { DEV?: boolean } }).env;
  // 배선 누락 경고를 인스턴스당 한 번만 냅니다 — 녹음·지우기마다 매번 찍히면 신호가
  // 아니라 소음입니다(`DateWheelPicker`의 `warnedFieldsRef`와 같은 이유). 여기서는
  // 원인이 하나뿐이라(Provider에 overrides도 storage도 없음) fields처럼 시그니처를
  // 따로 둘 필요 없이 불리언 하나로 충분합니다.
  const warnedUnwiredRef = useRef(false);

  /** `onChange`(앱 소유)가 있으면 그걸 부르고 끝입니다. 없으면 `registry.setBinding`에
   *  맡기되, 실패를 두 가지로 구분합니다(전체 리뷰 Important 2) —
   *  `registry.canPersist`가 거짓이면 저장할 곳 자체가 없는 배선 누락(`console.warn`,
   *  개발자용), 참인데 `setBinding`이 실패하면 저장소가 막힌 런타임 문제(화면
   *  `role="alert"` 안내, 사용자용)입니다. 위 `ShortcutSettingsProps.onChange` 문서
   *  참고. */
  function commit(id: string, combo: string | null) {
    if (onChange) { onChange(id, combo); return; }
    if (!registry.canPersist) {
      if (importMetaEnv?.DEV && !warnedUnwiredRef.current) {
        warnedUnwiredRef.current = true;
        console.warn("ShortcutSettings: 이 조합을 저장할 곳이 없습니다 — onChange를 넘기거나 ShortcutProvider에 storage를 넘기세요.");
      }
      return;
    }
    if (!registry.setBinding(id, combo)) {
      setMessage("이 조합을 저장하지 못했습니다 — 브라우저가 저장소를 막았거나 용량이 찼습니다. 이번 방문에서는 계속 쓸 수 있지만 새로고침하면 사라집니다.");
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
      const combo = comboFromEvent(event);
      const text = formatCombo(combo);
      /* §6.2 — 걸 수 없는 조합. `bindingOf`도 같은 관문(`unbindableReason`)을 봅니다.
       * 충돌 검사보다 **먼저** 봅니다: `Ctrl+C`가 어떤 액션과도 안 겹칠 때 "안 겹치니
       * 등록"으로 새면 안 되고, 사용자에게는 "왜 안 되는지"가 충돌 사유보다 먼저 알
       * 정보이기 때문입니다. */
      const blocked = unbindableReason(combo);
      if (blocked) { setMessage(UNBINDABLE_COPY[blocked](text)); setRecording(null); return; }
      const bindings = Object.fromEntries(registry.actions.map((item) => [item.id, registry.bindingOf(item.id)]));
      const conflict = findConflict(text, recording!, bindings);
      if (conflict?.withKit) { setMessage(`${displayCombo(text)}는 킷의 날짜 선택기가 씁니다`); setRecording(null); return; }
      if (conflict?.withActionId) {
        const other = registry.actions.find((item) => item.id === conflict.withActionId);
        setMessage(`${displayCombo(text)}는 이미 "${other?.label}"가 씁니다`);
        setRecording(null);
        return;
      }
      /* 경고는 **막지 않습니다** — 등록은 그대로 하고 한계만 알려 줍니다(스펙 §6.2).
       * `Ctrl+A`가 그 자리입니다: 규칙 5가 텍스트 입력 안에서 양보하므로 거기서는
       * 안 뜹니다. 오너가 "막지 말고 알려주기"로 정한 결과입니다(2026-08-13). */
      const warning = bindingWarning(combo);
      setMessage(warning ? `${displayCombo(text)}는 등록됐지만, 텍스트 입력 안에서는 뜨지 않습니다 — 브라우저의 편집 동작이 먼저입니다` : null);
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
                className="kkqq-shortcuts__record action-button" data-variant="secondary"
                type="button"
                onClick={() => { setMessage(null); setRecording(item.id); }}
              >
                {recording === item.id ? `${item.label} — 조합을 누르세요` : `${item.label} ${bound ? displayCombo(bound) : "없음"}`}
              </button>
              <button className="kkqq-shortcuts__clear action-button" data-variant="secondary" type="button" onClick={() => { setMessage(null); commit(item.id, null); }}>지우기</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

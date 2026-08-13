/* **표기가 하나여야 충돌 검사가 성립합니다.**
 *
 * `"Shift+Ctrl+KeyK"`와 `"Ctrl+Shift+KeyK"`는 같은 조합인데 문자열로는 다릅니다.
 * 정규화가 없으면 §5.1의 전수 비교가 이 둘을 **다른 조합으로 보고 통과시킵니다** —
 * 그러면 사용자가 같은 조합을 두 액션에 걸 수 있습니다.
 *
 * 키 이름이 `event.key`가 아니라 `event.code`인 이유는 자판 배열입니다(스펙 §4).
 * 킷이 이미 그렇게 하고 있습니다 — `DateWheelPicker.tsx`의 `handleShortcut`이 `Ctrl+;`를
 * `event.code === "Semicolon"`으로 봅니다.
 */
import { describe, expect, it } from "vitest";

import { comboFromEvent, formatCombo, hasModifier, normalizeCombo, parseCombo, sidebarToggleAction } from "../src/shortcuts";

describe("조합 표기", () => {
  it("수식어 순서가 Ctrl → Alt → Shift → Meta로 정규화된다", () => {
    expect(normalizeCombo("Shift+Ctrl+KeyK")).toBe("Ctrl+Shift+KeyK");
    expect(normalizeCombo("Meta+Alt+Digit1")).toBe("Alt+Meta+Digit1");
  });

  it("정규화는 멱등이다", () => {
    expect(normalizeCombo("Ctrl+Shift+KeyK")).toBe("Ctrl+Shift+KeyK");
  });

  it("수식어 없는 맨 키도 조합이다", () => {
    expect(normalizeCombo("KeyG")).toBe("KeyG");
    expect(hasModifier(parseCombo("KeyG")!)).toBe(false);
    expect(hasModifier(parseCombo("Ctrl+KeyG")!)).toBe(true);
  });

  it("빈 문자열은 null이다 — 조용히 빈 조합이 되지 않는다", () => {
    expect(parseCombo("")).toBe(null);
  });

  it("수식어 뒤에 키 자리가 비어 있으면 null이다", () => {
    expect(parseCombo("Ctrl+")).toBe(null);
  });

  it("수식어만 있고 키가 없으면 null이다", () => {
    expect(parseCombo("Ctrl+Shift")).toBe(null);
  });

  it("모르는 수식어 이름이면 null이다", () => {
    expect(parseCombo("Nope+KeyK")).toBe(null);
  });

  it("parse와 format이 왕복한다", () => {
    const text = "Ctrl+Alt+Shift+Meta+Semicolon";
    expect(formatCombo(parseCombo(text)!)).toBe(text);
  });

  /* `event.key`가 아니라 `event.code`를 읽는지 못박습니다. 한글 자판에서 갈라지는
   * 자리라 이 단언이 없으면 영어 자판에서만 맞는 구현이 통과합니다. */
  it("이벤트에서 key가 아니라 code를 읽는다", () => {
    const event = { code: "Semicolon", key: "ㅁ", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false } as KeyboardEvent;
    expect(formatCombo(comboFromEvent(event))).toBe("Ctrl+Semicolon");
  });
});

describe("킷이 주는 사이드바 토글", () => {
  it("id가 고정이고 기본 조합이 없다", () => {
    const action = sidebarToggleAction(() => {});
    expect(action.id).toBe("kkqq:sidebar-toggle");
    expect(action.defaultCombo).toBe(null);
  });

  it("핸들러는 앱 것이다 — 넘긴 함수를 그대로 부른다", () => {
    let called = 0;
    sidebarToggleAction(() => { called += 1; }).onFire();
    expect(called).toBe(1);
  });

  /* **전체 리뷰 Important 1.** 전에는 `sidebarToggleAction(onFire, label?)`에
   * 기본 조합을 넘길 자리가 없어서, 앱이 기본 조합을 정하려면 `overrides`를 쓰는
   * 수밖에 없었습니다 — 그러면 "사용자가 바꾼 것만"이라는 스펙 §7.1의 뜻이 앱의
   * 기본값과 섞여 구분이 안 됐습니다. 두 번째 인자를 옵션 객체로 바꿔 이 자리를
   * 열었습니다. §3.2가 막는 것은 "킷이 정하는 것"이지 "앱이 정하는 것"이 아닙니다. */
  describe("options.defaultCombo (전체 리뷰 Important 1)", () => {
    it("options를 안 넘기면 기본 조합이 여전히 null이다", () => {
      expect(sidebarToggleAction(() => {}).defaultCombo).toBe(null);
    });

    it("options에 defaultCombo가 없으면(label만 넘겨도) null이다", () => {
      const action = sidebarToggleAction(() => {}, { label: "사이드바" });
      expect(action.defaultCombo).toBe(null);
    });

    it("options.defaultCombo를 넘기면 그 값을 그대로 쓴다", () => {
      const action = sidebarToggleAction(() => {}, { defaultCombo: "Ctrl+Backslash" });
      expect(action.defaultCombo).toBe("Ctrl+Backslash");
    });

    it("options.label을 넘기면 그 이름표를 쓴다 — 기본 이름표로 안 돌아간다", () => {
      const action = sidebarToggleAction(() => {}, { label: "사이드바", defaultCombo: "Ctrl+Backslash" });
      expect(action.label).toBe("사이드바");
    });
  });
});

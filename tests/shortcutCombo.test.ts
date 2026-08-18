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

import { bindingWarning, comboFromEvent, formatCombo, hasModifier, normalizeCombo, parseCombo, sidebarToggleAction, unbindableReason } from "../src/shortcuts/combo";

/* **등록 금지 관문(스펙 §6.2).** 여기가 정본이고 `bindingOf`와 녹음기가 같이 봅니다.
 *
 * 무엇을 막는지는 **실측에서 나왔습니다**(2026-08-13, 오너 · macOS Safari 26.3 +
 * Windows Chrome 151, 진짜 키보드): `<button>`·`<summary>`에서 `Enter`는
 * `defaultPrevented=false`인 채로 활성화되고, `preventDefault`를 부르면 **죽습니다.**
 * 양쪽 OS 동일. 즉 맨 `Enter`를 액션에 걸면 허용 구역 안에서 버튼이 안 눌립니다.
 * `Ctrl+C`·`V`·`X`·`Z`·`Y`는 §2.3이 이미 양보하는 브라우저 편집 조합입니다.
 *
 * **`Ctrl+A`만 뺐습니다**(오너 결정 2026-08-13) — 텍스트 칸 밖에서 브라우저의 "전체
 * 선택"은 쓸모가 거의 없고 앱이 "행 전체 선택"으로 쓰고 싶어 하는 조합이라서입니다.
 * 대신 경고가 붙습니다. */
function gate(text: string) { return unbindableReason(parseCombo(text)!); }
function warn(text: string) { return bindingWarning(parseCombo(text)!); }

describe("등록 금지 — 활성화 키 (스펙 §6.2)", () => {
  it("맨 Enter는 못 건다", () => {
    expect(gate("Enter")).toBe("activation");
  });

  it("맨 Space는 못 건다", () => {
    expect(gate("Space")).toBe("activation");
  });

  /* Shift는 규칙 2의 수식어가 아닙니다 — Shift만 붙은 조합은 디스패치에서 맨 키와
   * 같은 경로를 타므로 여기서도 같이 막아야 앞뒤가 맞습니다. */
  it("Shift만 붙어도 못 건다 — 규칙 2의 수식어가 아니다", () => {
    expect(gate("Shift+Enter")).toBe("activation");
  });

  // 대조군 — 이게 없으면 "Enter가 들어간 건 다 금지"인 구현으로도 통과합니다.
  it("Ctrl이 붙으면 걸 수 있다", () => {
    expect(gate("Ctrl+Enter")).toBe(null);
  });

  it("Meta가 붙어도 걸 수 있다", () => {
    expect(gate("Meta+Space")).toBe(null);
  });
});

describe("등록 금지 — 브라우저 편집 조합 (스펙 §6.2)", () => {
  // 전수로 한 번에 봅니다 — 하나씩 존재만 확인하면 목록이 줄어도 안 빨개집니다.
  it("Ctrl+Z·Y·C·X·V 다섯이 전부 막힌다", () => {
    const codes = ["Ctrl+KeyZ", "Ctrl+KeyY", "Ctrl+KeyC", "Ctrl+KeyX", "Ctrl+KeyV"];
    expect(Object.fromEntries(codes.map((text) => [text, gate(text)]))).toEqual({
      "Ctrl+KeyZ": "native-edit", "Ctrl+KeyY": "native-edit", "Ctrl+KeyC": "native-edit",
      "Ctrl+KeyX": "native-edit", "Ctrl+KeyV": "native-edit",
    });
  });

  it("맥의 Cmd도 같은 자리다", () => {
    expect(gate("Meta+KeyZ")).toBe("native-edit");
  });

  /* 규칙 5(§2.3)의 판정이 `(ctrl||meta) && 목록`이라 shift·alt를 안 봅니다.
   * 관문이 그보다 좁으면 `Ctrl+Shift+Z`가 등록에 성공한 뒤 텍스트 칸에서 안 뜹니다 —
   * `reservedKey`에서 이미 값을 치른 모양입니다(예약 비교는 실제 판정보다 넓어야 한다). */
  it("Shift가 더 붙어도 막힌다 — 규칙 5와 같은 판정", () => {
    expect(gate("Ctrl+Shift+KeyZ")).toBe("native-edit");
  });

  it("Ctrl+A는 막지 않는다 — 오너 결정", () => {
    expect(gate("Ctrl+KeyA")).toBe(null);
  });

  it("Ctrl+A에는 경고가 붙는다", () => {
    expect(warn("Ctrl+KeyA")).toBe("yields-in-text-input");
  });

  it("맨 KeyA는 경고도 없다 — 규칙 5는 Ctrl/Meta 조합에만 걸린다", () => {
    expect(warn("KeyA")).toBe(null);
  });
});

describe("등록 금지 — 킷 리스너와 겹치는 키는 그대로", () => {
  it("Escape는 못 건다", () => {
    expect(gate("Escape")).toBe("kit-listener");
  });

  it("Shift+Tab도 못 건다", () => {
    expect(gate("Shift+Tab")).toBe("kit-listener");
  });

  // 대조군 둘 — 평범한 조합은 막지도 경고하지도 않습니다.
  it("평범한 조합은 안 막힌다", () => {
    expect(gate("Ctrl+KeyK")).toBe(null);
  });

  it("평범한 조합에는 경고도 없다", () => {
    expect(warn("Ctrl+KeyK")).toBe(null);
  });
});

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

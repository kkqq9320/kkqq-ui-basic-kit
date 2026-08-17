/// <reference types="vite/client" />

/* **예약 목록은 코드에서 파생돼야 합니다**(스펙 §5.2).
 *
 * 손으로 적은 목록은 컴포넌트가 새 조합을 쓰기 시작한 날 조용히 틀립니다. 그래서
 * 아래 둘째 describe가 `src/`를 훑어 실제로 쓰이는 수식어 조합을 세고, `KIT_RESERVED`와
 * **통째로 비교**합니다(필터형은 0건에서 공허하게 통과합니다).
 *
 * 지금 킷이 점유한 조합은 **다섯**입니다(2026-08-14) — 전부 `DateWheelPicker.tsx`의
 * `handleShortcut`이고, `Semicolon`(오늘로)·`KeyC`(복사)·`KeyV`(붙여넣기)·
 * `KeyZ`(되돌리기)·`KeyS`(확정, **팝오버가 열려 있을 때만**)입니다.
 *
 * ⚠️ **예약은 녹음기에서만 막습니다.** `findConflict`를 부르는 자리는 녹음기
 * 하나뿐이고 `bindingOf`는 `unbindableReason`만 봅니다. `Ctrl+C`·`V`·`Z`는 §6.2의
 * `native-edit`이라 두 경로 다 막히지만, **`Ctrl+S`는 `defaultCombo`·`overrides`로
 * 들어오면 그대로 바인딩됩니다**(설계 스펙 §5.2의 표).
 */
import { describe, expect, it } from "vitest";

import { KIT_RESERVED, findConflict } from "../src/shortcuts";

// `.tsx`만 보면 `src/`의 `.ts` 파일(`shortcuts.ts`·`popupDismiss.ts`·`positioning.ts` 등)이
// 이 검사의 시야 밖으로 빠집니다 — §5.2가 막으려는 "조용히 틀린 예약 목록"이 확장자
// 하나 차이로 새는 자리였습니다. `keyConsumers.test.ts`처럼 둘 다 봅니다.
const sources = import.meta.glob("../src/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("액션끼리의 충돌", () => {
  it("같은 조합을 쓰는 다른 액션을 잡는다", () => {
    const conflict = findConflict("Ctrl+KeyB", "toggle", { other: "Ctrl+KeyB" });
    expect(conflict?.withActionId).toBe("other");
  });

  it("자기 자신은 충돌이 아니다", () => {
    expect(findConflict("Ctrl+KeyB", "toggle", { toggle: "Ctrl+KeyB" })).toBe(null);
  });

  it("표기가 달라도 같은 조합이면 잡는다", () => {
    expect(findConflict("Shift+Ctrl+KeyB", "toggle", { other: "Ctrl+Shift+KeyB" })?.withActionId).toBe("other");
  });

  it("조합 없는 액션과는 충돌하지 않는다", () => {
    expect(findConflict("Ctrl+KeyB", "toggle", { other: null })).toBe(null);
  });
});

describe("킷 예약 조합", () => {
  it("킷이 쓰는 조합과의 충돌을 잡는다", () => {
    expect(findConflict("Ctrl+Semicolon", "toggle", {})?.withKit).toBe(true);
  });

  /* ⚠️ **Meta도 같이 잡아야 합니다.** `DateWheelPicker.tsx`의 `handleShortcut`는
   * `(event.ctrlKey || event.metaKey) && code === "Semicolon"`으로 판정합니다 —
   * 즉 `Cmd+;`도 그 컴포넌트가 먹습니다. 문자열로만 비교하면 `Meta+Semicolon`이
   * `Ctrl+Semicolon`과 달라서 **충돌이 안 잡히고, 등록에 성공한 뒤 날짜 선택기가
   * 그 키를 먹습니다.** 맥 사용자에게만 나는 결함이 됩니다. */
  it("Cmd 조합도 같은 예약으로 잡는다", () => {
    expect(findConflict("Meta+Semicolon", "toggle", {})?.withKit).toBe(true);
  });

  // 대조군 — 예약과 무관한 조합은 통과해야 합니다.
  it("예약이 아닌 Meta 조합은 잡지 않는다", () => {
    expect(findConflict("Meta+KeyK", "toggle", {})).toBe(null);
  });

  /* ⚠️ **Shift·Alt도 같이 잡아야 합니다.** `DateWheelPicker.tsx`의 `handleShortcut`의 가드는
   * `(event.ctrlKey || event.metaKey) && event.code === "Semicolon"`이라
   * `shiftKey`·`altKey`를 안 봅니다 — 즉 `Ctrl+Shift+;`·`Ctrl+Alt+;`·`Cmd+Shift+;`도
   * 전부 그 컴포넌트가 먹습니다. 문자열만 비교하면 이 조합들이 `"Ctrl+Semicolon"`과
   * 달라서 충돌이 안 잡히고, 등록에 성공한 뒤 날짜 필드에 포커스가 있을 때 그 키를
   * 누르면 피커가 먼저 `preventDefault()`를 불러 앱 액션이 안 뜹니다 — 모든
   * 플랫폼에서 재현됩니다. */
  it("Ctrl+Shift+Semicolon도 같은 예약으로 잡는다", () => {
    expect(findConflict("Ctrl+Shift+Semicolon", "toggle", {})?.withKit).toBe(true);
  });

  it("Ctrl+Alt+Semicolon도 같은 예약으로 잡는다", () => {
    expect(findConflict("Ctrl+Alt+Semicolon", "toggle", {})?.withKit).toBe(true);
  });

  it("Cmd+Shift+Semicolon도 같은 예약으로 잡는다", () => {
    expect(findConflict("Meta+Shift+Semicolon", "toggle", {})?.withKit).toBe(true);
  });

  // 대조군 — 예약과 무관한 키라면 수식어가 여럿 붙어도 여전히 통과해야 합니다.
  it("예약과 무관한 Ctrl+Shift 조합은 잡지 않는다", () => {
    expect(findConflict("Ctrl+Shift+KeyK", "toggle", {})).toBe(null);
  });

  // 전제 — glob이 비면 아래가 공허하게 통과합니다.
  // 하한 10 = `.tsx`만 셌을 때의 실제 파일 수. `.ts`가 다시 빠지면(글롭 되돌림)
  // 이 값이 10 아래로 안 떨어지지만 딱 10이 되어 아래 부등식이 깨집니다.
  it("src의 소스를 실제로 읽었다", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    expect(Object.values(sources).every((source) => source.length > 200)).toBe(true);
  });

  /* ⚠️ **이 정규식의 한계(전체 리뷰 Minor 7).** `(ctrlKey|metaKey)[\s\S]{0,80}?event\.code
   * === "X"` 꼴은 리터럴 `event.code === "X"` 패턴만 잡고, 그것도 `(ctrlKey|metaKey)`가
   * **먼저** 나오는 순서로만 잡습니다. 그래서 다음은 안 걸립니다:
   * - `event.code === "X" && (event.ctrlKey || event.metaKey)`(순서가 반대)
   * - `code === Semicolon`처럼 변수를 거치거나 switch문으로 분기하는 코드
   * - 80자보다 멀리 떨어진 `ctrlKey`/`event.code`
   * 새 소비자가 이런 모양으로 조합을 점유하면 이 검사는 조용히 그것을 놓치고,
   * `KIT_RESERVED`는 실제보다 좁은 채로 남습니다. */
  function scanUsedCombos(): Set<string> {
    const found = new Set<string>();
    for (const source of Object.values(sources)) {
      const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const match of withoutComments.matchAll(/(ctrlKey|metaKey)[\s\S]{0,80}?event\.code === "([A-Za-z0-9]+)"/g)) {
        found.add(`Ctrl+${match[2]}`);
      }
    }
    return found;
  }

  /* 전제 — 2026-08-14에 붙은 네 조합이 **실제로 소스에서 발견되는지.**
   *
   * 🔴 위 `matchAll`은 매치를 **소비**하므로 가드 하나 안에 `event.code`가 여럿이면
   * **첫 번째만** 잡힙니다. 컴포넌트가 넷을 한 가드로 묶거나 switch로 바꾸는 순간 이
   * 스캔은 조용히 좁아지는데, 아래 집합 비교만 있으면 그때 나오는 것이 "무엇이 왜
   * 빠졌는지 알 수 없는 diff"입니다. 원인을 먼저 짚는 단언을 앞에 둡니다. */
  it("컴포넌트가 새로 먹는 네 조합이 소스에서 실제로 발견된다", () => {
    const found = [...scanUsedCombos()];
    for (const combo of ["Ctrl+KeyC", "Ctrl+KeyV", "Ctrl+KeyZ", "Ctrl+KeyS"]) expect(found).toContain(combo);
  });

  it("예약 목록이 소스에 실제로 쓰인 조합과 일치한다", () => {
    expect([...scanUsedCombos()].sort()).toEqual([...KIT_RESERVED].sort());
  });
});

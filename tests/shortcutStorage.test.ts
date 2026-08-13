// @vitest-environment jsdom
/* 단축키 사용자 덮어쓰기의 저장소. `themePalette.test.ts`와 같은 뼈대를 씁니다 —
 * 저장 실패는 던지지 않고 boolean/{}로 알리고, 왕복 불가능한 값은 이름을 남기고
 * 버립니다.
 *
 * ⚠️ 이 저장소의 규칙: 대조군 없는 단언을 쓰지 않습니다. 그리고 저장소가 막힌 경우는
 * `themePalette.test.ts`처럼 **실제로 던지는 스텁**으로 흉내 냅니다 — `vi.fn()`으로
 * 항상 성공하는 가짜를 쓰면 "막혀도 안 던진다"는 계약을 아예 재지 못합니다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createShortcutStorage } from "../src/shortcutStorage";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("null과 키 없음", () => {
  it("write에 null로 넘긴 값은 read에서도 null로 돌아온다", () => {
    const storage = createShortcutStorage();
    storage.write({ toggle: null });

    expect(storage.read().toggle).toBe(null);
  });

  /* ⚠️ **이게 왕복의 핵심입니다.** null(지움)과 키 없음(기본값)이 섞이면, write에서
   * 안 건드린 액션의 키가 뒤에 남거나 사라져 "무엇을 지웠는지"가 흐려집니다.
   * `toEqual`의 null 처리에 기대는 대신, 실제로 쓴 키 집합을 직접 잽니다 —
   * 뮤테이션(cleanValue의 null 분기 제거)이 이 단언을 실제로 빨갛게 만드는지
   * 아래에서 확인했습니다. */
  it("write({ a: 조합, b: null })의 왕복에서 키 집합이 정확히 a·b 둘뿐이다", () => {
    const storage = createShortcutStorage();
    storage.write({ a: "Ctrl+KeyA", b: null });

    expect(Object.keys(storage.read()).sort()).toEqual(["a", "b"]);
  });

  it("그 왕복에서 a는 정규화된 조합, b는 null이다", () => {
    const storage = createShortcutStorage();
    storage.write({ a: "Ctrl+KeyA", b: null });

    const result = storage.read();
    expect(result.a).toBe("Ctrl+KeyA");
    expect(result.b).toBe(null);
  });

  it("아예 안 쓴 액션은 read에 키 자체가 없다 — 기본값을 쓴다는 뜻", () => {
    const storage = createShortcutStorage();
    storage.write({ a: "Ctrl+KeyA" });

    expect(Object.prototype.hasOwnProperty.call(storage.read(), "never-written")).toBe(false);
  });
});

/* ⚠️ **전체 리뷰 Important 3.** 위 describe는 "빈 맵" 특례만 잽니다 — write가 병합
 * (`{ ...read(), ...next }`)으로 바뀌어도 그 테스트들은 그대로 초록입니다(빈 맵과
 * 병합해도 결과가 빈 맵과 똑같으므로). `write`가 실제로 **통째 교체**인지는 이전
 * 값이 있는 일반 경로에서만 드러납니다. */
describe("write는 통째 교체다 — 패치가 아니다", () => {
  it("write({a}) 뒤 write({b})를 부르면 a는 사라지고 b만 남는다", () => {
    const storage = createShortcutStorage({ key: "test:whole-replace" });
    storage.write({ a: "Ctrl+KeyA" });

    storage.write({ b: "Ctrl+KeyB" });

    expect(storage.read()).toEqual({ b: "Ctrl+KeyB" });
  });
});

describe("빈 맵을 쓰면 키를 지운다", () => {
  it("먼저 값을 쓰고 빈 맵으로 다시 쓰면 저장된 항목 자체가 사라진다", () => {
    const storage = createShortcutStorage({ key: "test:clear" });
    storage.write({ a: "Ctrl+KeyA" });
    expect(localStorage.getItem("test:clear")).not.toBe(null);   // 전제 — 실제로 있었는지 먼저 본다

    storage.write({});

    expect(localStorage.getItem("test:clear")).toBe(null);
  });

  it("빈 맵을 쓴 뒤 read는 빈 맵이다", () => {
    const storage = createShortcutStorage({ key: "test:clear2" });
    storage.write({ a: "Ctrl+KeyA" });

    storage.write({});

    expect(storage.read()).toEqual({});
  });
});

describe("저장 실패 — 실제로 던지는 스텁", () => {
  it("setItem이 던져도 write는 예외를 밖으로 안 낸다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const storage = createShortcutStorage();

    expect(() => storage.write({ a: "Ctrl+KeyA" })).not.toThrow();
  });

  it("setItem이 던지면 write는 false를 돌려준다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const storage = createShortcutStorage();

    expect(storage.write({ a: "Ctrl+KeyA" })).toBe(false);
  });

  it("removeItem이 던지면 빈 맵을 지우다 실패해도 false를 돌려준다", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    const storage = createShortcutStorage();

    expect(storage.write({})).toBe(false);
  });

  it("getItem이 던져도 read는 예외를 밖으로 안 내고 빈 맵을 돌려준다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const storage = createShortcutStorage();

    expect(storage.read()).toEqual({});
  });

  // 대조군 — 막지 않으면 정상적으로 성공한다. 이게 없으면 위 실패 케이스들이
  // "항상 false/빈 맵을 내는 구현"으로도 통과합니다.
  it("대조군 — 막지 않으면 write는 true를 돌려준다", () => {
    const storage = createShortcutStorage();

    expect(storage.write({ a: "Ctrl+KeyA" })).toBe(true);
  });
});

describe("parse", () => {
  it("봉투 모양이 아니면 null이다", () => {
    const storage = createShortcutStorage();

    expect([storage.parse("어쩌구"), storage.parse([]), storage.parse(null), storage.parse({ version: 1 })]).toEqual([null, null, null, null]);
  });

  it("version이 1이 아니면 null이다", () => {
    const storage = createShortcutStorage();

    expect(storage.parse({ version: 2, bindings: {} })).toBe(null);
  });

  it("문자열도 null도 아닌 값은 버리고 이름을 남긴다", () => {
    const storage = createShortcutStorage();

    const parsed = storage.parse({ version: 1, bindings: { toggle: 42 } });

    expect(parsed?.dropped).toEqual(["toggle"]);
  });

  /* "Ctrl+Shift"는 수식어만 있고 키가 없습니다 — `shortcuts.ts`의 `parseCombo`가
   * 명시적으로 거부하는 자리입니다("키가 없다" 주석). 임의의 한글 문자열은 `code`로
   * 그대로 통과해 버리지 *않으므로*(parseCombo가 code 자체의 값은 검증하지 않음),
   * 실제로 거부되는 이 모양을 씁니다. */
  it("normalizeCombo가 거부하는 문자열은 버리고 이름을 남긴다", () => {
    const storage = createShortcutStorage();

    const parsed = storage.parse({ version: 1, bindings: { toggle: "Ctrl+Shift" } });

    expect(parsed?.dropped).toEqual(["toggle"]);
  });

  it("버려진 항목은 backup.bindings에 안 남는다", () => {
    const storage = createShortcutStorage();

    const parsed = storage.parse({ version: 1, bindings: { toggle: 42, ok: "Ctrl+KeyA" } });

    expect(parsed?.backup.bindings).toEqual({ ok: "Ctrl+KeyA" });
  });

  it("표기 순서가 다른 유효한 조합은 정규화돼서 담긴다", () => {
    const storage = createShortcutStorage();

    const parsed = storage.parse({ version: 1, bindings: { toggle: "Shift+Ctrl+KeyK" } });

    expect(parsed?.backup.bindings.toggle).toBe("Ctrl+Shift+KeyK");
  });

  it("null 값은 버리지 않고 그대로 통과한다", () => {
    const storage = createShortcutStorage();

    const parsed = storage.parse({ version: 1, bindings: { toggle: null } });

    expect(parsed).toEqual({ backup: { version: 1, bindings: { toggle: null } }, dropped: [] });
  });

  it("빈 봉투는 null이 아니다 — 덮어쓰기가 하나도 없는 정상 상태다", () => {
    const storage = createShortcutStorage();

    expect(storage.parse({ version: 1, bindings: {} })).toEqual({ backup: { version: 1, bindings: {} }, dropped: [] });
  });
});

describe("직렬화 왕복", () => {
  it("serialize → JSON 왕복 → parse는 같은 backup을 낸다", () => {
    const storage = createShortcutStorage();
    const made = storage.serialize({ a: "Ctrl+KeyA", b: null });

    expect(storage.parse(JSON.parse(JSON.stringify(made)))?.backup).toEqual(made);
  });

  it("인자를 안 주면 저장소를 읽는다", () => {
    const storage = createShortcutStorage();
    storage.write({ a: "Ctrl+KeyA" });

    expect(storage.serialize()).toEqual({ version: 1, bindings: { a: "Ctrl+KeyA" } });
  });

  /* ⚠️ 앱이 저장소를 소유(controlled)하면 값이 저장소가 아니라 앱 상태에 있습니다.
   * 인자를 넘기면 저장소를 안 보고 넘긴 값만으로 봉투를 만듭니다 — 안 그러면
   * controlled 앱에서 백업이 늘 비어 나옵니다(ThemeColorEditor.serialize와 같은 이유). */
  it("넘긴 값이 있으면 저장소를 읽지 않는다", () => {
    const storage = createShortcutStorage();
    storage.write({ a: "저장소에 남아 있는 값이지만 안 보여야 함" });

    expect(storage.serialize({ b: "Ctrl+KeyB" })).toEqual({ version: 1, bindings: { b: "Ctrl+KeyB" } });
  });
});

describe("subscribe — 다른 탭의 변경", () => {
  it("같은 키의 storage 이벤트를 받으면 새 bindings로 부른다", () => {
    const storage = createShortcutStorage({ key: "test:subscribe" });
    const listener = vi.fn();
    storage.subscribe(listener);

    window.dispatchEvent(new StorageEvent("storage", {
      key: "test:subscribe",
      newValue: JSON.stringify({ version: 1, bindings: { a: "Ctrl+KeyA" } }),
    }));

    expect(listener).toHaveBeenCalledWith({ a: "Ctrl+KeyA" });
  });

  it("다른 키의 storage 이벤트는 무시한다", () => {
    const storage = createShortcutStorage({ key: "test:subscribe2" });
    const listener = vi.fn();
    storage.subscribe(listener);

    window.dispatchEvent(new StorageEvent("storage", { key: "other-key", newValue: "{}" }));

    expect(listener).not.toHaveBeenCalled();
  });

  it("다른 탭이 지운 것(newValue=null)은 빈 맵으로 알린다", () => {
    const storage = createShortcutStorage({ key: "test:subscribe3" });
    const listener = vi.fn();
    storage.subscribe(listener);

    window.dispatchEvent(new StorageEvent("storage", { key: "test:subscribe3", newValue: null }));

    expect(listener).toHaveBeenCalledWith({});
  });

  it("해지 함수를 부르면 더 이상 안 불린다", () => {
    const storage = createShortcutStorage({ key: "test:subscribe4" });
    const listener = vi.fn();
    const unsubscribe = storage.subscribe(listener);
    unsubscribe();

    window.dispatchEvent(new StorageEvent("storage", {
      key: "test:subscribe4",
      newValue: JSON.stringify({ version: 1, bindings: { a: "Ctrl+KeyA" } }),
    }));

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("내보내기", () => {
  it("킷의 진입점에서 createShortcutStorage를 집을 수 있다", async () => {
    const entry = await import("../src/index");

    expect(typeof (entry as { createShortcutStorage?: unknown }).createShortcutStorage).toBe("function");
  });
});

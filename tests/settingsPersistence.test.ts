// @vitest-environment jsdom
//
/* 킷 전역 설정의 **지속성**(설계 스펙 §16-3, 2026-08-16).
 *
 * 🔴 **왜 `tests/settings.test.ts`가 아니라 새 파일인가.** 그쪽은 머리말에 "이 파일은
 * jsdom을 요구하지 않습니다"라고 적고 환경을 안 켭니다 — 그래서 거기서는
 * `localStorage`가 **아예 없습니다.** 지속성을 그 파일에 넣으면 모든 검사가
 * `typeof localStorage === "undefined"` 가지만 밟고 **초록으로 통과합니다.**
 * (실제로 지속성을 붙인 직후 기존 1454개가 전부 초록이었습니다 — 그 이유입니다.)
 *
 * 🔴 **모듈 초기화 시점을 재야 해서 `vi.resetModules()` + 동적 import입니다.**
 * 저장값은 모듈이 뜰 때 **한 번** 읽힙니다. 정적 import는 파일당 한 번만 평가되므로,
 * 그걸로는 "저장된 값이 있는 채로 앱이 시작됐다"를 만들 수 없습니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HOUR_KEY = "settings:hourFormat";
const ROWS_KEY = "settings:wheelRowsPerSide";

/** 저장소를 이 상태로 두고 **모듈을 새로 띄웁니다.** 반환값이 그 새 모듈입니다. */
async function bootWith(entries: Record<string, string>) {
  localStorage.clear();
  for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  vi.resetModules();
  return import("../src/settings");
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("설정 지속성 — 저장값을 읽는다", () => {
  // 전제 — 저장된 게 없을 때 기본값이어야 아래 검사들이 "읽었다"를 말할 수 있습니다.
  // 이게 없으면 "12를 읽었다"가 "원래 12였다"와 구별되지 않습니다.
  it("저장된 게 없으면 기본값이다 — 대조군", async () => {
    const s = await bootWith({});
    expect(s.getHourFormat()).toBe("24");
    expect(s.getWheelRowsPerSide()).toBe(1);
  });

  it("저장된 시간 형식을 읽는다", async () => {
    const s = await bootWith({ [HOUR_KEY]: "12" });
    expect(s.getHourFormat()).toBe("12");
  });

  it("저장된 행 수를 읽는다", async () => {
    const s = await bootWith({ [ROWS_KEY]: "3" });
    expect(s.getWheelRowsPerSide()).toBe(3);
  });
});

/* 저장소는 사용자도 다른 탭도 만질 수 있습니다. 모르는 값을 그대로 쓰면 모델이
 * 12시간제도 24시간제도 아닌 상태로 가고, 행 수는 휠이 그릴 수 없는 개수가 됩니다.
 *
 * ⚠️ **한 `it`에 몰지 않습니다** — `expect`는 첫 실패에서 던지므로, 몰아 두면 앞의
 * 하나만 새고 나머지는 **실행조차 안 됩니다.** */
describe("설정 지속성 — 모르는 값은 기본값이다", () => {
  it("시간 형식이 모르는 글자면 24다", async () => {
    const s = await bootWith({ [HOUR_KEY]: "twelve" });
    expect(s.getHourFormat()).toBe("24");
  });

  it("행 수가 0이면 기본값이다 — 범위 아래", async () => {
    const s = await bootWith({ [ROWS_KEY]: "0" });
    expect(s.getWheelRowsPerSide()).toBe(1);
  });

  it("행 수가 9면 기본값이다 — 범위 위", async () => {
    const s = await bootWith({ [ROWS_KEY]: "9" });
    expect(s.getWheelRowsPerSide()).toBe(1);
  });

  it("행 수가 2.5면 기본값이다 — 정수가 아님", async () => {
    const s = await bootWith({ [ROWS_KEY]: "2.5" });
    expect(s.getWheelRowsPerSide()).toBe(1);
  });

  // `Number("")`는 **0**이라 그냥 숫자로 바꾸면 조용히 통과합니다.
  it("행 수가 빈 문자열이면 기본값이다 — Number(\"\")가 0인 함정", async () => {
    const s = await bootWith({ [ROWS_KEY]: "" });
    expect(s.getWheelRowsPerSide()).toBe(1);
  });

  it("행 수가 글자면 기본값이다", async () => {
    const s = await bootWith({ [ROWS_KEY]: "abc" });
    expect(s.getWheelRowsPerSide()).toBe(1);
  });
});

describe("설정 지속성 — 바꾸면 저장한다", () => {
  it("시간 형식을 바꾸면 저장소에 들어간다", async () => {
    const s = await bootWith({});
    s.setHourFormat("12");
    expect(localStorage.getItem(HOUR_KEY)).toBe("12");
  });

  it("행 수를 바꾸면 저장소에 들어간다", async () => {
    const s = await bootWith({});
    s.setWheelRowsPerSide(4);
    expect(localStorage.getItem(ROWS_KEY)).toBe("4");
  });

  // 왕복 — 저장한 값으로 앱이 다시 뜨면 그 값이어야 합니다. 위 둘은 "썼다"만 보고,
  // 앞 describe는 "읽는다"만 봅니다. 이 검사가 둘을 잇습니다(키 이름이 어긋나면
  // 위 둘이 다 초록인데 이것만 빨개집니다).
  it("바꾸고 다시 뜨면 그 값이다 — 왕복", async () => {
    const first = await bootWith({});
    first.setHourFormat("12");
    first.setWheelRowsPerSide(2);
    vi.resetModules();
    const second = await import("../src/settings");
    expect(second.getHourFormat()).toBe("12");
    expect(second.getWheelRowsPerSide()).toBe(2);
  });
});

/* 🔴 **서버 스냅샷은 저장값을 보면 안 됩니다.** `useSyncExternalStore`의 세 번째 인자는
 * 서버 렌더와 **하이드레이션 첫 렌더**에 쓰입니다. 저장값을 돌려주면 서버가 그린 HTML
 * (기본값)과 어긋납니다 — 이 킷이 지속성을 붙이면서 새로 생긴 자리입니다. */
describe("설정 지속성 — 서버 스냅샷은 언제나 기본값이다", () => {
  it("저장값이 있어도 시간 형식 서버 스냅샷은 24다", async () => {
    const s = await bootWith({ [HOUR_KEY]: "12" });
    // 전제 — 클라이언트 쪽은 실제로 저장값을 보고 있습니다. 이게 없으면 둘 다 24라서
    // "서버 스냅샷이 다르다"가 공허하게 통과합니다.
    expect(s.getHourFormat()).toBe("12");
    expect(s.getHourFormatServerSnapshot()).toBe("24");
  });

  it("저장값이 있어도 행 수 서버 스냅샷은 1이다", async () => {
    const s = await bootWith({ [ROWS_KEY]: "3" });
    expect(s.getWheelRowsPerSide()).toBe(3);
    expect(s.getWheelRowsPerSideServerSnapshot()).toBe(1);
  });
});

/* 🔴 쿠키·사이트 데이터를 전면 차단한 브라우저에서는 `localStorage`에 **접근만 해도**
 * 예외가 납니다. `theme/tokens.ts`가 그 자리를 실제로 밟았습니다 — 읽기만 감싸고 쓰기는
 * 안 감싸서, 그 상태에서 색을 하나 바꾸면 편집기가 죽었습니다. 같은 실수를 안 합니다. */
describe("설정 지속성 — 저장소가 막혀 있어도 죽지 않는다", () => {
  it("읽기가 던져도 기본값으로 뜬다", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.resetModules();
    const s = await import("../src/settings");
    expect(s.getHourFormat()).toBe("24");
    expect(s.getWheelRowsPerSide()).toBe(1);
  });

  it("쓰기가 던져도 설정은 바뀌고 예외가 안 샌다", async () => {
    const s = await bootWith({});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => s.setHourFormat("12")).not.toThrow();
    // **값은 바뀌어야 합니다** — 저장을 못 하는 것이 설정을 못 바꾸는 이유가 되면 안 됩니다.
    // `not.toThrow()`만 두면 "아무것도 안 했다"와 구별이 안 됩니다.
    expect(s.getHourFormat()).toBe("12");
  });

  // 구독자도 깨워야 합니다 — 저장 실패가 화면 갱신을 막으면 사용자는 설정이 안 먹는
  // 것으로 봅니다.
  it("쓰기가 던져도 구독자는 알림을 받는다", async () => {
    const s = await bootWith({});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const seen = vi.fn();
    const stop = s.subscribeHourFormat(seen);
    s.setHourFormat("12");
    stop();
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

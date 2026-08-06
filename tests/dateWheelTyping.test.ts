import { describe, expect, it } from "vitest";

import { flushBuffer, typeDigit, withUnitValue } from "../src/dateWheelTyping";

describe("typeDigit — 모호하지 않으면 즉시 확정한다", () => {
  it("월: 2~9는 한 자리로 확정하고 다음 열로", () => {
    expect(typeDigit("month", "", "5")).toEqual({ digits: "", commit: 5, advance: true });
    expect(typeDigit("month", "", "9")).toEqual({ digits: "", commit: 9, advance: true });
  });

  it("월: 0과 1은 두 자리가 될 수 있으므로 기다린다", () => {
    expect(typeDigit("month", "", "1")).toEqual({ digits: "1", commit: null, advance: false });
    expect(typeDigit("month", "", "0")).toEqual({ digits: "0", commit: null, advance: false });
  });

  it("월: 두 번째 자리로 두 자리 월이 완성된다", () => {
    expect(typeDigit("month", "1", "2")).toEqual({ digits: "", commit: 12, advance: true });
    expect(typeDigit("month", "0", "8")).toEqual({ digits: "", commit: 8, advance: true });
  });

  it("월: 없는 조합이면 두 번째 숫자를 새 입력의 첫 자리로 다시 읽는다", () => {
    // 13월은 없다 -> 3월로 읽고 넘어간다. 네이티브 date input이 이렇게 한다.
    expect(typeDigit("month", "1", "3")).toEqual({ digits: "", commit: 3, advance: true });
  });

  // 일의 4가지 경우(단독 확정/단독 대기/두 자리 완성/재해석)는 서로 다른 분기라
  // 한 블록에 두면 앞이 던지는 순간 뒤가 검증되지 않은 채 통과로 잡힌다. 넷을 나눈다.
  it("일: 4는 두 자리가 시작될 수 없으므로 한 자리로 즉시 확정", () => {
    expect(typeDigit("day", "", "4")).toEqual({ digits: "", commit: 4, advance: true });
  });

  it("일: 0~3은 두 자리가 될 수 있으므로 기다린다", () => {
    expect(typeDigit("day", "", "3")).toEqual({ digits: "3", commit: null, advance: false });
  });

  it("일: 두 번째 자리로 두 자리 일이 완성된다", () => {
    expect(typeDigit("day", "3", "1")).toEqual({ digits: "", commit: 31, advance: true });
  });

  it("일: 없는 조합이면 두 번째 숫자를 새 입력의 첫 자리로 다시 읽는다", () => {
    expect(typeDigit("day", "3", "9")).toEqual({ digits: "", commit: 9, advance: true });   // 39일은 없다
  });

  // 연도는 "아직 네 자리 안 참"과 "네 자리 참"이 같은 삼항의 다른 가지라, 한 블록에
  // 있으면 대기 쪽 실패가 확정 쪽을 가리는 뮤테이션이 있다. 둘을 나눈다.
  it("연: 네 자리가 되기 전에는 기다린다", () => {
    expect(typeDigit("year", "", "2")).toEqual({ digits: "2", commit: null, advance: false });
  });

  it("연: 네 자리가 차면 확정한다", () => {
    expect(typeDigit("year", "202", "6")).toEqual({ digits: "", commit: 2026, advance: true });
  });
});

describe("flushBuffer — 열을 떠날 때의 해석", () => {
  it("연: 1~2자리는 2000년대로 읽는다", () => {
    expect(flushBuffer("year", "26")).toBe(2026);
    expect(flushBuffer("year", "31")).toBe(2031);
    expect(flushBuffer("year", "5")).toBe(2005);
  });

  it("연: 3~4자리는 그대로 읽는다", () => {
    expect(flushBuffer("year", "926")).toBe(926);
    expect(flushBuffer("year", "1985")).toBe(1985);
  });

  it("월·일: 친 그대로 읽는다", () => {
    expect(flushBuffer("month", "1")).toBe(1);
    expect(flushBuffer("day", "7")).toBe(7);
  });

  it("월·일: 0은 버린다", () => {
    expect(flushBuffer("month", "0")).toBeNull();
    expect(flushBuffer("day", "0")).toBeNull();
  });

  // 위 "0은 버린다"와는 다른 분기다 — 여긴 값이 아니라 빈 버퍼 자체를 거른다.
  it("연: 빈 버퍼는 버린다", () => {
    expect(flushBuffer("year", "")).toBeNull();
  });
});

describe("withUnitValue — 절대값으로 설정한다", () => {
  it("연을 바꿔도 다른 열로 자리올림하지 않는다", () => {
    expect(withUnitValue("2026-07-12", "year", 2031)).toBe("2031-07-12");
  });

  it("월을 바꾸면 없는 날은 말일로 자른다 — 다음 달로 넘기지 않는다", () => {
    expect(withUnitValue("2026-01-31", "month", 4)).toBe("2026-04-30");
    expect(withUnitValue("2026-01-31", "month", 2)).toBe("2026-02-28");
  });

  it("윤년 2월을 안다", () => {
    expect(withUnitValue("2028-01-31", "month", 2)).toBe("2028-02-29");
  });

  it("그 달에 없는 날을 치면 말일로 자른다", () => {
    expect(withUnitValue("2026-04-10", "day", 31)).toBe("2026-04-30");
  });

  it("세 자리 이하 연도를 1900년대로 잘못 옮기지 않는다", () => {
    // Date.UTC(26, ...)는 1926년이 된다. 그 함정을 밟지 않는지 고정한다.
    expect(withUnitValue("2026-07-12", "year", 926)).toBe("0926-07-12");
  });
});

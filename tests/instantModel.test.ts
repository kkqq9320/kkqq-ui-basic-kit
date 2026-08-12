import { describe, expect, it } from "vitest";

import { flushBuffer, typeDigit, withUnitValue, lastDayOf, shiftDateValue, normalizeToFields, rangeKeyLength, validDateValue, dateTriggerParts, dateWheelLabel, instantModel } from "../src/model/instant";

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

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

  it("월: 0을 두 번 치면 조합값 0을 버리고 빈 버퍼로 다시 읽어 0에서 다시 기다린다", () => {
    // buffer"0"+digit"0" = 0은 combined>=1 하한을 못 넘는다(13월·39일처럼 상한을
    // 넘는 경우와는 다른 가지). 재해석 경로를 타 typeDigit(unit, "", "0")으로
    // 다시 들어가 soloFloor 미만이므로 대기한다.
    expect(typeDigit("month", "0", "0")).toEqual({ digits: "0", commit: null, advance: false });
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

  it("세 자리 연도는 century 보정 없이 자리수 그대로 왕복한다", () => {
    // 926은 Date.UTC의 0~99 재매핑 범위 밖이라 이 값만으로는 그 함정을 검증하지
    // 못한다 — 아래 "0년" 테스트가 그 함정을 겨냥한다. 이 테스트는 3자리 연도가
    // 그대로 들어가는지만 고정한다.
    expect(withUnitValue("2026-07-12", "year", 926)).toBe("0926-07-12");
  });

  it("연을 0으로 바꾸면 Date.UTC가 아니라 목적지 연도로 윤년을 판정한다", () => {
    // Date.UTC(0, ...)는 0~99 재매핑 규칙 때문에 1900년으로 취급된다 — 1900은
    // 100의 배수이지만 400의 배수가 아니라서 평년이다(2월 28일까지). 실제 0년은
    // 400의 배수라 윤년이다(2월 29일까지). setUTCFullYear(0, ...)의 3-인자 호출은
    // 이 재매핑을 하지 않으므로, 윤년 2/29 출발이 목적지 0년에서도 2/29로 남아야
    // 한다 — Date.UTC 기반으로 lastDayOf를 다시 쓰면 2/28로 잘못 잘린다.
    expect(withUnitValue("2028-02-29", "year", 0)).toBe("0000-02-29");
  });

  it("연을 바꿀 때 윤년 판정은 목적지 연도로 한다 — 다른 열로 넘기지 않는다", () => {
    // lastDayOf(amount, ...)가 아니라 실수로 lastDayOf(year, ...)를 쓰면(출발 연도)
    // 윤년인 2028년의 2/29가 평년인 2026년으로 옮겨갈 때 말일로 잘리지 않고
    // 3/1로 자리올림된다 — "다른 열로 넘기지 않는다" 규칙을 정면으로 어긴다.
    expect(withUnitValue("2028-02-29", "year", 2026)).toBe("2026-02-28");
  });
});

describe("모델로 옮겨 온 나머지 함수", () => {
  it("shiftDateValue는 열 안에서만 돌고 자리올림하지 않는다", () => {
    expect(shiftDateValue("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(shiftDateValue("2026-12-15", "month", 1)).toBe("2026-01-15");
    expect(shiftDateValue("2026-01-01", "day", -1)).toBe("2026-01-31");
  });

  it("normalizeToFields는 구간 아래 단위를 01로 누른다", () => {
    expect(normalizeToFields("2026-07-12", ["year", "month"])).toBe("2026-07-01");
    expect(normalizeToFields("2026-07-12", ["year"])).toBe("2026-01-01");
    expect(normalizeToFields("2026-07-12", ["year", "month", "day"])).toBe("2026-07-12");
  });

  it("rangeKeyLength는 남은 최소 단위를 따른다", () => {
    expect(rangeKeyLength(["year", "month", "day"])).toBe(10);
    expect(rangeKeyLength(["year", "month"])).toBe(7);
    expect(rangeKeyLength(["year"])).toBe(4);
  });

  it("validDateValue는 YYYY-MM-DD만 받는다", () => {
    expect(validDateValue("2026-07-12")).toBe(true);
    expect(validDateValue("")).toBe(false);
    expect(validDateValue("+010000-07-12")).toBe(false);
  });

  it("lastDayOf는 0~99년을 1900년대로 옮기지 않는다", () => {
    expect(lastDayOf(2024, 1)).toBe(29);
    expect(lastDayOf(2026, 1)).toBe(28);
    expect(lastDayOf(0, 1)).toBe(29);
  });

  // 월·일이 한 자리일 때 zero-pad가 실제로 적용되는지 — 월은 이 스위트의 fixture가
  // 대부분 "07"·"08"처럼 이미 한 자리라 padStart 유무가 눈에 띄지만, 일은 fixture가
  // 거의 항상 "12"(이미 두 자리)라 padStart를 지워도 결과가 우연히 같다. 그래서
  // 일 쪽은 한 자리 값(5일)으로 따로 고정해야 padStart 유무가 실제로 갈린다.
  it("dateWheelLabel은 한 자리 월을 두 자리로 채운다", () => {
    expect(dateWheelLabel("2026-07-05", "month", WEEKDAYS_KO)).toBe("07");
  });

  it("dateWheelLabel은 한 자리 일을 두 자리로 채운다", () => {
    expect(dateWheelLabel("2026-07-05", "day", WEEKDAYS_KO)).toBe("05 일");
  });

  it("dateTriggerParts의 조각을 이으면 옛 문자열과 같다", () => {
    const parts = dateTriggerParts("2026-07-12", ["year", "month", "day"], null);
    expect(parts.map((part) => part.text).join("")).toBe("2026. 07. 12.");
  });

  it("dateTriggerParts는 버퍼를 자리 지켜 그린다", () => {
    const parts = dateTriggerParts("2026-07-12", ["year", "month", "day"], { unit: "year", digits: "20" });
    expect(parts[0].text).toBe("20\u2012\u2012");
  });
});

describe("instantModel", () => {
  it("사다리 순서를 갖는다", () => {
    expect(instantModel.units).toEqual(["year", "month", "day"]);
  });

  it("지금은 fields를 그대로 열로 쓴다", () => {
    expect(instantModel.columns(["year", "month"])).toEqual(["year", "month"]);
  });

  /* 위임이 실제로 같은 함수를 부르는지 — 이름만 바꿔 놓고 다른 걸 부르면
   * 컴포넌트 테스트가 잡아 주지만, 여기서 잡으면 어느 칸인지 바로 압니다. */
  it("위임한 것들이 같은 답을 낸다", () => {
    expect(instantModel.shift("2026-01-31", "month", 1)).toBe(shiftDateValue("2026-01-31", "month", 1));
    expect(instantModel.normalize("2026-07-12", ["year"])).toBe(normalizeToFields("2026-07-12", ["year"]));
    expect(instantModel.keyLength(["year", "month"])).toBe(rangeKeyLength(["year", "month"]));
    expect(instantModel.isValid("2026-07-12")).toBe(validDateValue("2026-07-12"));
  });
});

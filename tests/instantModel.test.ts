import { describe, expect, it } from "vitest";

import { flushBuffer, typeDigit, withUnitValue, lastDayOf, shiftDateValue, normalizeToFields, rangeKeyLength, validDateValue, dateTriggerParts, dateWheelLabel, instantModel, UNIT_LADDER, unitFloor, unitCeiling, unitDigits, familyOf, parseValue, serializeValue, isContiguous, comparisonPrecision, usableBound, outOfRange, clampToRange, meridiemOf, hourFromTwelve, twelveHourText, resetTarget, parsePasted, stepOf, snapToStep } from "../src/model/instant";
import type { WheelUnit } from "../src/model/instant";

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

describe("단위 사다리", () => {
  it("여섯 단위가 순서대로 있다", () => {
    expect(UNIT_LADDER).toEqual(["year", "month", "day", "hour", "minute", "second"]);
  });

  it("바닥값 — 월·일만 1에서 시작한다", () => {
    expect(UNIT_LADDER.map(unitFloor)).toEqual([0, 1, 1, 0, 0, 0]);
  });

  it("자릿수 — 연도만 넷이다", () => {
    expect(UNIT_LADDER.map(unitDigits)).toEqual([4, 2, 2, 2, 2, 2]);
  });

  it("상한 — 연도만 없고, 일만 문맥을 본다", () => {
    const ctx = { year: 2026, month: 2 };
    expect(unitCeiling("year", ctx)).toBe(null);
    expect(unitCeiling("month", ctx)).toBe(12);
    expect(unitCeiling("day", ctx)).toBe(28);
    expect(unitCeiling("day", { year: 2024, month: 2 })).toBe(29);
    expect(unitCeiling("hour", ctx)).toBe(23);
    expect(unitCeiling("minute", ctx)).toBe(59);
    expect(unitCeiling("second", ctx)).toBe(59);
  });

  /* 이 모델을 뗄 수 있었던 근거가 "단위 간 의존이 하나뿐"이라는 것입니다(스펙 §3.1).
   * 문맥을 무시해도 답이 같은 단위는 그 의존이 없다는 뜻이고, 이 검사가 그것을 고정합니다. */
  it("일 말고는 문맥이 답을 바꾸지 않는다", () => {
    for (const unit of UNIT_LADDER) {
      if (unit === "day") continue;
      expect(unitCeiling(unit, { year: 2024, month: 2 })).toBe(unitCeiling(unit, { year: 1999, month: 11 }));
    }
  });
});

describe("시각 단위 타이핑", () => {
  /* soloFloor — 두 자리가 시작될 수 없는 첫 숫자. 시는 3(24 이상이 없으니 3~9),
   * 분·초는 6(60 이상이 없으니 6~9). 월이 2인 것과 같은 계산입니다. */
  it("시는 3부터 한 자리로 확정된다", () => {
    expect(typeDigit("hour", "", "2")).toEqual({ digits: "2", commit: null, advance: false });
    expect(typeDigit("hour", "", "3")).toEqual({ digits: "", commit: 3, advance: true });
  });

  it("분은 6부터 한 자리로 확정된다", () => {
    expect(typeDigit("minute", "", "5")).toEqual({ digits: "5", commit: null, advance: false });
    expect(typeDigit("minute", "", "6")).toEqual({ digits: "", commit: 6, advance: true });
  });

  it("시 24는 존재하지 않아 첫 자리를 버리고 다시 읽는다", () => {
    // 브리프 원문은 { digits: "4", commit: 4, advance: true }였으나, TypingStep의
    // 계약("확정했으면 digits는 빈 문자열")과 바로 위 일(day)의 동일한 재해석 경로
    // 테스트(day: "3"+"9" -> { digits: "", commit: 9, advance: true })에 어긋나
    // 오타로 보고 이 값으로 고정합니다.
    expect(typeDigit("hour", "2", "4")).toEqual({ digits: "", commit: 4, advance: true });
  });

  it("0시·0분은 있다 — 월·일과 다른 자리", () => {
    expect(typeDigit("hour", "0", "0")).toEqual({ digits: "", commit: 0, advance: true });
    expect(flushBuffer("hour", "0")).toBe(0);
    expect(flushBuffer("month", "0")).toBe(null);
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

const DATE = ["year", "month", "day"] as WheelUnit[];
const HM = ["hour", "minute"] as WheelUnit[];
const HMS = ["hour", "minute", "second"] as WheelUnit[];
const DATETIME = ["year", "month", "day", "hour", "minute"] as WheelUnit[];

describe("계열 판정", () => {
  it("구간이 어디서 시작하고 어디서 끝나는지로 갈린다", () => {
    expect(familyOf(DATE)).toBe("date");
    expect(familyOf(["year", "month"])).toBe("date");
    expect(familyOf(HM)).toBe("time");
    expect(familyOf(["minute", "second"])).toBe("time");
    expect(familyOf(DATETIME)).toBe("datetime");
    expect(familyOf(["day", "hour"])).toBe("datetime");
  });
});

describe("연속 구간", () => {
  it("사다리에서 잘라낸 구간만 받는다", () => {
    expect(isContiguous(DATE)).toBe(true);
    expect(isContiguous(["day", "hour", "minute"])).toBe(true);
    expect(isContiguous(["year", "day"])).toBe(false);
    expect(isContiguous(["day", "year"])).toBe(false);   // 순서도 사다리를 따라야 합니다
    expect(isContiguous([])).toBe(false);
  });
});

describe("값 형식은 계열이 정한다", () => {
  it("날짜 계열은 언제나 일까지", () => {
    const parts = parseValue("2026-08-12", DATE)!;
    expect(serializeValue(parts, DATE)).toBe("2026-08-12");
    expect(serializeValue(parts, ["year", "month"])).toBe("2026-08-01");
  });

  it("시각 계열은 분까지, 초는 fields에 있을 때만", () => {
    expect(serializeValue(parseValue("03:00", HM)!, HM)).toBe("03:00");
    expect(serializeValue(parseValue("03:00:05", HMS)!, HMS)).toBe("03:00:05");
  });

  it("걸치면 T로 잇는다 — 공백이 아닙니다", () => {
    expect(serializeValue(parseValue("2026-08-12T03:00", DATETIME)!, DATETIME)).toBe("2026-08-12T03:00");
  });

  it("구간 위는 값에서 가져오고 아래는 바닥값으로 눌린다", () => {
    const parts = parseValue("2026-08-12T03:45", DATETIME)!;
    expect(serializeValue(parts, ["year", "month", "day"])).toBe("2026-08-12");
    expect(serializeValue(parts, ["month", "day"])).toBe("2026-08-12");   // 연도는 값에서
  });

  it("형식이 안 맞으면 null이다 — 계열이 다른 것도 포함", () => {
    expect(parseValue("", DATE)).toBe(null);
    expect(parseValue("2026-8-12", DATE)).toBe(null);      // 0을 안 붙인 월
    expect(parseValue("2026-08-12", HM)).toBe(null);       // 시각 픽커에 날짜
    expect(parseValue("03:00", DATE)).toBe(null);
    expect(parseValue("+010000-07-12", DATE)).toBe(null);  // 확장 표기
  });

  /* parseValue의 눌림(flooring) 경로 자체를 검사합니다. 위의 검사들은 전부
   * fields가 계열 끝까지(DATE→day, HM→minute) 닿아 있어 눌릴 게 없었습니다 —
   * 그 코드를 지우고 raw를 그대로 반환해도 878개가 전부 통과했습니다. 계열
   * 끝보다 얕은 fields를 줘야 눌림 경로가 실제로 밟힙니다. */
  it("parseValue도 구간 아래를 누른다 — 계열 끝보다 얕은 fields로", () => {
    const parts = parseValue("2026-08-12", ["year", "month"])!;
    expect(parts.day).toBe(1);      // 일이 바닥값으로 눌립니다
    expect(parts.month).toBe(8);    // 구간 안이라 값에서 그대로
  });
});

describe("비교 정밀도", () => {
  it("픽커가 가진 열 중 최소 단위가 정한다", () => {
    expect(comparisonPrecision(["year", "month", "day"])).toBe(10);
    expect(comparisonPrecision(["year", "month"])).toBe(7);
    expect(comparisonPrecision(["year"])).toBe(4);
    expect(comparisonPrecision(["hour", "minute"])).toBe(5);
    expect(comparisonPrecision(["hour", "minute", "second"])).toBe(8);
    expect(comparisonPrecision(["year", "month", "day", "hour", "minute"])).toBe(16);
  });
});

describe("쓸 수 없는 경계는 없는 것으로 본다 (§6.1)", () => {
  it("계열이 다르면 버린다", () => {
    expect(usableBound("2026-08-12", ["hour", "minute"])).toBe(null);
  });

  it("형식이 깨졌으면 버린다", () => {
    expect(usableBound("2026-8-12", ["year", "month", "day"])).toBe(null);
  });

  it("멀쩡하면 그대로", () => {
    expect(usableBound("2026-08-12", ["year", "month", "day"])).toBe("2026-08-12");
    expect(usableBound(undefined, ["year", "month", "day"])).toBe(null);
  });

  /* 그대로 비교하면 무슨 일이 나는지 — 이 검사가 §6.1이 존재하는 이유입니다. */
  it("버리지 않았다면 말이 안 되는 범위가 됐을 것이다", () => {
    const dateBound = "2026-08-12";
    expect("03:00".slice(0, 5) < dateBound.slice(0, 5)).toBe(true);   // 오전 3시가 범위 밖
    expect("23:59".slice(0, 5) < dateBound.slice(0, 5)).toBe(false);  // 밤 11시는 범위 안
  });
});

describe("경계 비교는 거친 쪽에서 (§6)", () => {
  const DT = ["year", "month", "day", "hour", "minute"] as WheelUnit[];

  it("날짜만 준 max는 그날 전체를 연다", () => {
    for (const v of ["2026-08-12T00:00", "2026-08-12T03:00", "2026-08-12T23:59"])
      expect(outOfRange(v, { max: "2026-08-12" }, DT)).toBe(false);
    expect(outOfRange("2026-08-13T00:00", { max: "2026-08-12" }, DT)).toBe(true);
  });

  /* 회귀 대조군 — 1단계 전부터 참이던 동작입니다. 이게 깨지면 소비 프로젝트가 깨집니다. */
  it("연·월 픽커의 min은 월 단위로 견준다", () => {
    expect(outOfRange("2026-07-01", { min: "2026-07-15" }, ["year", "month"])).toBe(false);
    expect(outOfRange("2026-06-01", { min: "2026-07-15" }, ["year", "month"])).toBe(true);
  });

  it("min과 max가 서로 다른 길이여도 각자의 길이로 본다", () => {
    expect(outOfRange("2026-08-12T03:00", { min: "2026-08", max: "2026-08-12T04:00" }, DT)).toBe(false);
  });
});

describe("클램프는 min은 이른 끝, max는 늦은 끝 (§6)", () => {
  const DT = ["year", "month", "day", "hour", "minute"] as WheelUnit[];

  it("max가 거칠면 그날 끝으로 보낸다", () => {
    expect(clampToRange("2026-09-01T10:00", { max: "2026-08-12" }, DT)).toBe("2026-08-12T23:59");
  });

  it("min이 거칠면 그날 시작으로 보낸다", () => {
    expect(clampToRange("2026-07-01T10:00", { min: "2026-08-12" }, DT)).toBe("2026-08-12T00:00");
  });

  it("초까지 있으면 초도 채운다", () => {
    const DTS = ["year", "month", "day", "hour", "minute", "second"] as WheelUnit[];
    expect(clampToRange("2026-09-01T10:00:00", { max: "2026-08-12" }, DTS)).toBe("2026-08-12T23:59:59");
  });

  it("월까지만 준 max는 그달 말일로 — 윤년도", () => {
    expect(clampToRange("2026-05-01", { max: "2026-02" }, ["year", "month", "day"])).toBe("2026-02-28");
    expect(clampToRange("2024-05-01", { max: "2024-02" }, ["year", "month", "day"])).toBe("2024-02-29");
  });

  /* §6.1 예시 표 3번째 줄 — 일이 fields에 없는 픽커(연·월 픽커)는 일이 픽커의
   * 최소 단위(월)보다 깊어 채움 대상이 아닙니다. 값에는 일이 존재하지만(§5,
   * 언제나 YYYY-MM-DD), 그 자리는 §5가 바닥값(01)으로 고정하는 자리라 어떤
   * 비교에도 안 보입니다 — 채워도 `serializeValue(parts, fields)`가 그대로
   * 눌러 버리므로, 채운 채로 두면(전 구현) 준 max("2026-07-15")보다 큰
   * "2026-07-31"이 나와 클램프가 멱등하지 않게 됩니다. */
  it("일 없는 픽커는 일을 채우지 않는다 — §6.1 표 3번째 줄", () => {
    expect(clampToRange("2026-09-01", { max: "2026-07" }, ["year", "month"])).toBe("2026-07-01");
  });

  it("클램프는 멱등하다 — 두 번 해도 같고, 준 경계를 넘지 않는다", () => {
    const fields: WheelUnit[] = ["year", "month"];
    const once = clampToRange("2026-09-01", { max: "2026-07-15" }, fields);
    expect(once).toBe("2026-07-01");
    expect(clampToRange(once, { max: "2026-07-15" }, fields)).toBe(once);
    expect(once <= "2026-07-15").toBe(true);
  });

  /* 전체 브랜치 리뷰 F-3(2b-4) — 연도만(4자) 준 max의 클램프 값을 여기서 처음
   * 긍정적으로 고정한다. `tests/DateWheelPicker.test.tsx`의 "F-1.1 — 거친
   * max(연도만 준 값)는 그 해 전체를 연다"는 값이 "2026-07-12"·max가
   * "2026"이라 **같은 해 안**이고, 검사도 일 라벨·다음/이전 버튼 활성화만
   * 본다 — max를 통째로 무시해도(경계가 아예 없는 것처럼 굴어도) 세 단언이
   * 전부 그대로 통과한다. "거친 max가 그 해를 연다"와 "그 경계가 무시된다"를
   * 그 검사는 구별하지 못하고, 4자리 연도 경계가 실제로 값을 **밀어내는지**를
   * 긍정적으로 고정하는 검사는 저장소에 0건이었다.
   *
   * **뮤테이션으로 실측했다** — `unitCeiling`의 `unit === "month"` 분기가
   * 돌려주는 12를 6으로 바꾸자 이 검사가 기대한 "2026-12-31" 대신
   * "2026-06-30"을 받아 빨개졌다(되돌린 뒤 다시 초록 확인). */
  it("연도만(4자) 준 max는 그 해 마지막 날로 클램프한다 — F-1.1의 모델 쪽 대응", () => {
    expect(clampToRange("2027-01-01", { max: "2026" }, ["year", "month", "day"])).toBe("2026-12-31");
  });
});

/* 전체 브랜치 리뷰 F-2 — 뮤테이션으로 지워도 초록이던 자리 넷을 검사로 막습니다.
 * 각 검사는 대응하는 뮤테이션을 실제로 넣어 빨개지는 것을 본 뒤 되돌린 것입니다. */
describe("clampToRange의 정규화 경로 (F-2.1)", () => {
  /* clampToRange 안의 `const normalized = valueParts ? serializeValue(valueParts,
   * fields) : value;`를 `const normalized = value;`로 바꿔도, 위의 클램프 검사
   * 다섯은 전부 `value`가 이미 정규형이라 초록이었습니다. 여기서는 fields보다
   * 깊은 일(day)이 값에 남아 있는 채로 넘겨(정규화 전이면 그 일이 그대로 살아남고,
   * 경계 안이라 클램프도 안 걸려 정규화 유무가 결과에 직접 드러납니다. */
  it("경계 안이어도 fields 밖 단위는 정규화로 눌린다", () => {
    expect(clampToRange("2026-07-15", {}, ["year", "month"])).toBe("2026-07-01");
  });
});

describe("시각 계열 클램프 (F-2.2)", () => {
  /* time 분기(§6 표의 "시각" 행)를 검사하는 클램프 테스트가 이전엔 0건이었습니다 —
   * family가 "time"일 때의 relevant·unitCeiling 채움을 통째로 지워도 초록이었을
   * 자리입니다. 분이 열인 픽커와 시 전용 픽커는 F-1 수정 후 서로 다른 결과를
   * 내야 하므로(분이 열이면 분까지 채우고, 아니면 안 채웁니다) 둘 다 고정합니다. */
  it("분이 열이면 분까지 상한으로 채운다", () => {
    expect(clampToRange("05:00", { max: "03" }, ["hour", "minute"])).toBe("03:59");
  });

  it("시 전용 픽커는 분을 채우지 않는다", () => {
    expect(clampToRange("05:00", { max: "03" }, ["hour"])).toBe("03:00");
  });
});

describe("min 경계가 fields보다 깊은 경우 (F-2.3)", () => {
  /* max 쪽 사고(F-1)의 대칭형 — min 클램프는 이미 `serializeValue(matchBound(min)!.parts,
   * fields)`로 fields 밖을 정상적으로 누르지만, 그 상호작용을 겨냥한 검사가
   * 없었습니다. min 클램프 반환에서 fields를 예컨대 ["year","month","day"]로
   * 바꿔도(fields 무시) 이 검사 전에는 아무것도 안 빨개졌을 자리입니다. */
  it("연·월 픽커에서 min의 일은 채워지지 않고 눌린다", () => {
    expect(clampToRange("2026-05-01", { min: "2026-07-15" }, ["year", "month"])).toBe("2026-07-01");
  });
});

describe("soloFloor의 second (F-2.4)", () => {
  /* soloFloor(unit)의 minute·second 분기는 `return 6`(공용) 하나뿐이라 second
   * 전용 검사가 없으면 "분은 6부터…" 검사만으로 그 줄이 덮인 것처럼 보입니다.
   * second만 골라 7로 틀리게 해도(분은 그대로 6) 기존 스위트는 전부 초록이었을
   * 자리입니다. */
  it("초는 6부터 한 자리로 확정된다", () => {
    expect(typeDigit("second", "", "6")).toEqual({ digits: "", commit: 6, advance: true });
  });
});

describe("usableBound은 시각 경계를 datetime에서 거절한다 (F-2.5)", () => {
  /* §6.1: "시각만 있는 경계는 받지 않습니다 — 날짜 기준이 없는 시각은 datetime
   * 값과 견줄 말이 안 됩니다." 이 거절 자체를 겨냥한 검사가 없어서, usableBound의
   * datetime 분기가 "time"도 허용하도록 뒤집혀도 초록이었을 자리입니다. */
  it("시각 경계는 datetime 픽커에서 쓸 수 없다", () => {
    expect(usableBound("03:00", ["year", "month", "day", "hour", "minute"])).toBe(null);
  });
});

/* 전체 브랜치 리뷰 F-1.2 — 계열이 다른 경계는 outOfRange/clampToRange 끝까지
 * 무시로 이어져야 한다 (§6.1, 2026-08-13).
 *
 * 2b-2 리뷰가 확인한 divergence 갈래 셋 중 하나. 컴포넌트 수준(tests/
 * DateWheelPicker.test.tsx)이 아니라 여기 두는 이유 — 시각 전용 픽커(fields가
 * hour/minute만)를 재현하려면 시각 열이 실제로 그려져야 하는데, 이 시점(2b-2)의
 * DateWheelPicker는 연·월·일 열만 그린다(시·분·초 열은 2b-3의 몫). `shiftDateValue`가
 * 여전히 `value + "T00:00:00Z"`를 무조건 이어붙이는 상태라, 시각 전용 fields로
 * 팝오버를 실제로 열면 값 형식이 안 맞아 렌더가 깨진다(2b-2 태스크 자체 검사의
 * 주석에 그 RangeError를 기록해 두었다) — 억지로 렌더하는 대신 모델 함수를 직접
 * 부른다.
 *
 * usableBound(F-2.5)는 이미 "계열이 다르면 null"을 단위로 검사하지만, 그 null이
 * outOfRange/clampToRange 끝까지 "제한이 없는 것처럼" 이어지는지는 검사된 적이
 * 없었다 — usableBound 안의 null 반환 자체를 지우고 원래 bound 문자열을 그대로
 * 돌려주도록 바꿔도(뮤테이션으로 직접 넣어 확인) 그 결과가 outOfRange/clampToRange
 * 밖으로 새는지 보는 검사가 없어 초록이었을 자리다. */
describe("계열이 다른 경계는 무시된다 — outOfRange/clampToRange까지 (F-1.2)", () => {
  it("시각 픽커에 날짜 min을 주면 어느 시각도 범위 밖이 아니다", () => {
    const fields: WheelUnit[] = ["hour", "minute"];
    for (const v of ["00:00", "03:00", "12:30", "23:59"])
      expect(outOfRange(v, { min: "2026-08-12" }, fields)).toBe(false);
  });

  it("시각 픽커에 날짜 min을 주면 클램프가 값을 그대로 통과시킨다", () => {
    expect(clampToRange("03:00", { min: "2026-08-12" }, ["hour", "minute"])).toBe("03:00");
  });
});

/* 전체 브랜치 리뷰 F-3 — 빈 fields가 연도까지 지우던 퇴행. deepestIndex([])가
 * -Infinity를 돌려주면 모든 단위가 "구간 아래"로 읽혀 연도도 바닥값(0)으로
 * 눌렸습니다. 옛 normalizeToFields(v, [])는 연도를 지켰으므로 이건 퇴행이었습니다.
 * 결정: 빈 fields는 사다리 전체를 쓴 것처럼 다룹니다 — 아무 단위도 안 누릅니다. */
describe("빈 fields (F-3)", () => {
  it("comparisonPrecision — 사다리 전체를 쓴 것처럼, 날짜 계열 기본값 4", () => {
    expect(comparisonPrecision([])).toBe(4);
  });

  it("parseValue — 사다리 전체를 쓴 것처럼, 아무 단위도 안 누른다(연도 포함)", () => {
    const parts = parseValue("2026-07-15", [])!;
    expect(parts).toEqual({ year: 2026, month: 7, day: 15, hour: 0, minute: 0, second: 0 });
  });

  it("serializeValue — 왕복해도 값이 그대로다", () => {
    expect(serializeValue(parseValue("2026-07-15", [])!, [])).toBe("2026-07-15");
  });

  it("clampToRange — 경계가 없으면 연도를 지우지 않는다", () => {
    expect(clampToRange("2026-07-15", {}, [])).toBe("2026-07-15");
  });
});

// ── 3단계 항목 1·2 — 12시간제는 **라벨만** 바꾼다 (설계 스펙 §7·§10) ─────────
//
// 시 열은 24칸 그대로다. 12칸으로 순환시키면 정오를 영영 못 넘어가서 값에 따라
// 오전/오후가 자동으로 바뀔 수 없다(스펙 §7) — 그래서 이 블록의 검사는 전부
// "같은 값, 다른 글자"이고, 값을 바꾸는 검사가 하나도 없는 것이 요점이다.
//
// 오전/오후 문자열이 인자로 들어오는 이유: 스펙 §10이 "`AM`/`PM`으로 라벨을 바꾸면
// 폭이 달라진다"고 소비자에게 경고한다는 것 자체가 **바꿀 수 있어야 한다**는 뜻이다.
// `weekdays`가 이미 같은 방식으로 들어온다 — 모델은 한국어를 모른다.
const KO_HOUR = { format: "12", am: "오전", pm: "오후" } as const;
const EN_HOUR = { format: "12", am: "AM", pm: "PM" } as const;

describe("dateWheelLabel — 12시간제 (3단계, 오너 결정으로 개정)", () => {
  const F: WheelUnit[] = ["year", "month", "day", "hour", "minute"];

  /* 🔴 **오전/오후 글자는 열에 안 붙습니다(오너 결정 2026-08-13).** 스펙 §7은 열 라벨을
   * `오후 03`으로 적었고 그렇게 구현했는데, 실제 화면을 보고 "휠 안에 오전/오후를 기입하지
   * 말라"로 정해졌습니다 — 상단 버튼이 이미 어느 절반인지 말합니다. 트리거는 그대로입니다
   * (아래 dateTriggerParts 블록). 열은 **12시간 읽기 숫자만** 그립니다. */
  it("대조군: 인자를 안 주면 24시간제 그대로다 — 기존 호출부가 글자 하나도 안 바뀐다", () => {
    expect(dateWheelLabel("2026-08-12T15:00", "hour", WEEKDAYS_KO, F)).toBe("15");
    expect(dateWheelLabel("2026-08-12T00:00", "hour", WEEKDAYS_KO, F)).toBe("00");
  });

  it("대조군: format이 \"24\"면 오전/오후 문자열을 줘도 안 붙는다", () => {
    expect(dateWheelLabel("2026-08-12T15:00", "hour", WEEKDAYS_KO, F, { format: "24", am: "오전", pm: "오후" })).toBe("15");
  });

  it("12시간제 열은 읽기 숫자만이다 — 오전/오후 글자가 안 붙는다", () => {
    expect(dateWheelLabel("2026-08-12T15:00", "hour", WEEKDAYS_KO, F, KO_HOUR)).toBe("03");
    expect(dateWheelLabel("2026-08-12T15:00", "hour", WEEKDAYS_KO, F, EN_HOUR)).toBe("03");
  });

  it("자정도 정오도 12다 — 0을 12로 읽고, 12를 0으로 읽지 않는다", () => {
    expect(dateWheelLabel("2026-08-12T00:00", "hour", WEEKDAYS_KO, F, KO_HOUR)).toBe("12");
    expect(dateWheelLabel("2026-08-12T12:00", "hour", WEEKDAYS_KO, F, KO_HOUR)).toBe("12");
  });

  it("한 자리도 두 자리로 채운다", () => {
    expect(dateWheelLabel("2026-08-12T09:00", "hour", WEEKDAYS_KO, F, KO_HOUR)).toBe("09");
    expect(dateWheelLabel("2026-08-12T23:00", "hour", WEEKDAYS_KO, F, KO_HOUR)).toBe("11");
  });

  it("시가 아닌 열은 12시간제와 무관하다 — 분·초·일은 그대로", () => {
    const G: WheelUnit[] = ["year", "month", "day", "hour", "minute", "second"];
    expect(dateWheelLabel("2026-08-12T15:07:05", "minute", WEEKDAYS_KO, G, KO_HOUR)).toBe("07");
    expect(dateWheelLabel("2026-08-12T15:07:05", "second", WEEKDAYS_KO, G, KO_HOUR)).toBe("05");
    expect(dateWheelLabel("2026-08-12T15:07:05", "day", WEEKDAYS_KO, G, KO_HOUR)).toBe("12 수");
  });

  /* `twelveHourText`는 **트리거가** 씁니다(그리고 열의 접근성 이름을 기계가 조립할 때
   * 같은 규칙을 씁니다). 열에서 빠졌다고 죽은 코드가 아니라는 것을 여기서 못 박습니다 —
   * 안 그러면 다음 사람이 "안 쓰는 함수"로 읽고 지웁니다. */
  it("twelveHourText는 살아 있다 — 트리거가 쓰는 규칙이다", () => {
    expect(twelveHourText(15, KO_HOUR)).toBe("오후 03");
    expect(twelveHourText(0, KO_HOUR)).toBe("오전 12");
    expect(twelveHourText(12, EN_HOUR)).toBe("PM 12");
  });
});

describe("dateTriggerParts — 12시간제 (3단계)", () => {
  const F: WheelUnit[] = ["year", "month", "day", "hour", "minute", "second"];
  const text = (parts: { text: string }[]) => parts.map((part) => part.text).join("");

  it("대조군: 인자를 안 주면 24시간제 그대로다", () => {
    expect(text(dateTriggerParts("2026-08-12T15:00:05", F, null))).toBe("2026. 08. 12. 15:00:05");
  });

  it("시 세그먼트가 오전/오후를 싣는다 — 트리거와 열이 같은 어순(스펙 §10)", () => {
    expect(text(dateTriggerParts("2026-08-12T15:00:05", F, null, KO_HOUR))).toBe("2026. 08. 12. 오후 03:00:05");
  });

  it("오전/오후는 시 세그먼트 안이다 — 별도 조각으로 쪼개지 않는다", () => {
    // 값의 절반이지 구두점이 아니다. 쪼개면 세그먼트 클릭·활성 표시가 갈라진다.
    const hour = dateTriggerParts("2026-08-12T15:00:05", F, null, KO_HOUR).find((part) => part.unit === "hour");
    expect(hour?.text).toBe("오후 03");
  });

  it("자리 지키기(U+2012)는 12시간제에서도 그대로다 — 오전/오후는 남고 숫자만 버퍼가 된다", () => {
    const parts = dateTriggerParts("2026-08-12T15:00:05", F, { unit: "hour", digits: "1" }, KO_HOUR);
    // 채움 문자는 **코드포인트로** 적는다 — U+2012는 `-`(U+002D)·`–`(U+2013)와 화면에서
    // 구별되지 않아, 글리프를 그대로 쓰면 틀린 문자가 눈에 안 띄는 채 통과한다.
    expect(parts.find((part) => part.unit === "hour")?.text).toBe("오후 1\u2012");
  });

  it("시각 전용 값도 같다", () => {
    const G: WheelUnit[] = ["hour", "minute"];
    expect(text(dateTriggerParts("00:30", G, null, KO_HOUR))).toBe("오전 12:30");
  });
});

// ── 3단계 — 오전/오후는 **모델이** 판정한다 (스펙 §7, 2b-4 F-4와 같은 이유) ────
//
// 기계(DateWheelPicker.tsx)가 `fields.includes("hour")`나 `parts.hour < 12`를
// 직접 쓰면 §3.2("기계는 단위가 무엇인지 모릅니다")를 어긴다 — 2b-4에서 `hasTimeUnit`이
// 정확히 그 이유로 `model.family`로 옮겨졌다. 존재 여부와 어느 절반인지를 한 함수가
// 답한다: 시 열이 없는 픽커에는 이 조작 자체가 없다(`null`).
describe("meridiemOf — 오전/오후 판정 (3단계)", () => {
  const F: WheelUnit[] = ["year", "month", "day", "hour", "minute"];

  it("시 열이 없으면 null이다 — 그 픽커에는 이 조작이 존재하지 않는다", () => {
    expect(meridiemOf("2026-08-12", ["year", "month", "day"])).toBe(null);
    expect(meridiemOf("07:30", ["minute", "second"])).toBe(null);
  });

  it("0시부터 11시까지가 오전이다", () => {
    expect(meridiemOf("2026-08-12T00:00", F)).toBe("am");
    expect(meridiemOf("2026-08-12T11:59", F)).toBe("am");
  });

  it("12시부터 23시까지가 오후다 — 정오가 오후의 시작이다", () => {
    expect(meridiemOf("2026-08-12T12:00", F)).toBe("pm");
    expect(meridiemOf("2026-08-12T23:00", F)).toBe("pm");
  });

  it("값을 못 읽으면 null이다", () => {
    expect(meridiemOf("망가진 값", F)).toBe(null);
  });

  it("instantModel을 지나서도 같다 — 기계가 부르는 경로", () => {
    expect(instantModel.meridiem("2026-08-12T15:00", F)).toBe("pm");
  });
});

// ── 3단계 — 12시간제에서는 시 타이핑의 상한이 12다 (스펙 §7) ──────────────────
//
// "시 열의 숫자 타이핑은 기존 규칙 그대로입니다 — 12시간제에서 상한이 12라 `15`는
// 첫 자리를 버리고 `5`로 재해석됩니다. 지금 월 열이 `13`에 하는 것과 같습니다."
// 그리고 친 숫자는 **12시간 읽기**이지 값이 아니다 — 어느 절반인지는 지금 값이 정한다.
describe("typeDigit — 12시간제 시 열 (3단계)", () => {
  it("대조군: 24시간제에서 2는 아직 기다린다(20~23이 있으므로)", () => {
    expect(typeDigit("hour", "", "2")).toEqual({ digits: "2", commit: null, advance: false });
  });

  it("12시간제에서 2는 즉시 확정된다 — 20~23이 없으므로 기다릴 이유가 없다", () => {
    expect(typeDigit("hour", "", "2", "12")).toEqual({ digits: "", commit: 2, advance: true });
  });

  it("1은 두 자리가 될 수 있으므로 기다린다 — 10·11·12", () => {
    expect(typeDigit("hour", "", "1", "12")).toEqual({ digits: "1", commit: null, advance: false });
    expect(typeDigit("hour", "1", "2", "12")).toEqual({ digits: "", commit: 12, advance: true });
  });

  it("대조군: 24시간제에서 15는 그대로 15다", () => {
    expect(typeDigit("hour", "1", "5")).toEqual({ digits: "", commit: 15, advance: true });
  });

  it("12시간제에서 15는 첫 자리를 버리고 5로 다시 읽는다 — 월 열이 13에 하는 것과 같다", () => {
    expect(typeDigit("hour", "1", "5", "12")).toEqual({ digits: "", commit: 5, advance: true });
  });

  it("0시는 12시간제에 없다 — 0으로 시작해도 확정되지 않는다", () => {
    expect(typeDigit("hour", "", "0", "12")).toEqual({ digits: "0", commit: null, advance: false });
    expect(typeDigit("hour", "0", "0", "12")).toEqual({ digits: "0", commit: null, advance: false });
  });

  it("분·초는 12시간제와 무관하다 — 대조군", () => {
    expect(typeDigit("minute", "1", "5", "12")).toEqual({ digits: "", commit: 15, advance: true });
    expect(typeDigit("second", "", "2", "12")).toEqual({ digits: "2", commit: null, advance: false });
  });
});

describe("flushBuffer — 12시간제 시 열 (3단계)", () => {
  it("대조군: 24시간제는 0시를 받는다", () => {
    expect(flushBuffer("hour", "0")).toBe(0);
  });

  it("12시간제는 0시를 안 받는다 — 12시간 읽기에 0이 없다", () => {
    expect(flushBuffer("hour", "0", "12")).toBe(null);
  });

  it("12시간제는 12까지 받고 그 위는 버린다", () => {
    expect(flushBuffer("hour", "12", "12")).toBe(12);
    expect(flushBuffer("hour", "13", "12")).toBe(null);
  });
});

describe("hourFromTwelve — 친 숫자는 읽기이지 값이 아니다 (3단계)", () => {
  it("12는 오전이면 0시, 오후면 12시다", () => {
    expect(hourFromTwelve(12, "am")).toBe(0);
    expect(hourFromTwelve(12, "pm")).toBe(12);
  });

  it("1~11은 오전이면 그대로, 오후면 +12다", () => {
    expect(hourFromTwelve(3, "am")).toBe(3);
    expect(hourFromTwelve(3, "pm")).toBe(15);
    expect(hourFromTwelve(11, "pm")).toBe(23);
  });
});

// ── 오너 리포트 4번 — 길게 눌러 그 열을 초기화 (2026-08-13 오너 결정) ──────────
//
// "초를 0초로 설정하는 기능이 있어야겠다" → 제스처는 **휠의 행을 길게 누르기**(± 버튼이
// 아님 — 그래야 ± 버튼이 나중에 '꾹 눌러 연속 증감'을 가질 수 있다), 임계 2초,
// **모든 열의 바닥값**, 다만 **연도는 바닥이 없으므로 현재 연도**.
//
// 판정이 모델에 있는 이유는 §3.2다: "연도만 예외"도 "월·일은 1이고 시·분·초는 0"도
// 전부 값 지식이라, 기계가 알면 안 된다.
describe("resetTarget — 길게 눌러 초기화할 목적지 (오너 리포트 4번)", () => {
  const F: WheelUnit[] = ["year", "month", "day", "hour", "minute", "second"];
  const NOW = "2031-05-09T07:08:09";

  it("시·분·초는 0이다", () => {
    expect(resetTarget("hour", NOW, F)).toBe(0);
    expect(resetTarget("minute", NOW, F)).toBe(0);
    expect(resetTarget("second", NOW, F)).toBe(0);
  });

  it("월·일은 1이다 — 0월도 0일도 없다", () => {
    expect(resetTarget("month", NOW, F)).toBe(1);
    expect(resetTarget("day", NOW, F)).toBe(1);
  });

  it("연도만 예외다 — 바닥값이 없으므로 지금 연도로 간다(오너 결정)", () => {
    expect(resetTarget("year", NOW, F)).toBe(2031);
  });

  it("연도는 '지금'을 못 읽으면 목적지가 없다", () => {
    // 기계는 이 null을 "아무 일도 안 함"으로 읽는다 — 엉뚱한 연도로 가는 것보다 낫다.
    expect(resetTarget("year", "망가진 값", F)).toBe(null);
  });

  it("연도가 아닌 열은 '지금'과 무관하다 — 대조군", () => {
    expect(resetTarget("second", "망가진 값", F)).toBe(0);
  });

  it("instantModel을 지나서도 같다 — 기계가 부르는 경로", () => {
    expect(instantModel.resetTarget("second", NOW, F)).toBe(0);
    expect(instantModel.resetTarget("year", NOW, F)).toBe(2031);
  });
});

/* parsePasted — 사람이 준 글자를 값으로.
 *
 * 이 함수의 계약은 둘입니다: 우리가 Ctrl+C로 쓴 것을 **되읽을 수 있어야** 하고,
 * 읽을 수 없으면 **빈 값이 아니라 null**이어야 합니다(실패가 값을 지우면 안 됩니다). */
describe("parsePasted — 붙여넣은 글자 읽기", () => {
  const DATE: WheelUnit[] = ["year", "month", "day"];
  const DATETIME: WheelUnit[] = ["year", "month", "day", "hour", "minute", "second"];
  const TIME: WheelUnit[] = ["hour", "minute", "second"];
  const KO12 = { format: "12" as const, am: "오전", pm: "오후" };

  it("정규 형식을 그대로 읽는다", () => {
    expect(parsePasted("2026-08-14", DATE)).toBe("2026-08-14");
  });

  // 🔴 왕복. Ctrl+C가 쓰는 것이 이 모양이므로 이게 깨지면 자기 출력도 못 읽습니다.
  it("우리가 복사한 표시 형식을 되읽는다", () => {
    expect(parsePasted("2026. 08. 14.", DATE)).toBe("2026-08-14");
  });

  it("자리를 안 채운 것도 읽는다", () => {
    expect(parsePasted("2026-8-14", DATE)).toBe("2026-08-14");
  });

  it("구분자가 무엇이든 읽는다 — 목록을 두지 않기 때문", () => {
    expect(parsePasted("2026/08/14", DATE)).toBe("2026-08-14");
    expect(parsePasted("2026년 8월 14일", DATE)).toBe("2026-08-14");
  });

  it("구분자 없이 붙어 있는 것도 읽는다", () => {
    expect(parsePasted("20260814", DATE)).toBe("2026-08-14");
  });

  // 대조군 — 붙은 덩어리는 폭이 딱 맞을 때만입니다. 어디서 끊을지 모르면 포기합니다.
  it("붙어 있는데 폭이 안 맞으면 읽지 않는다", () => {
    expect(parsePasted("2026081", DATE)).toBe(null);
  });

  /* 대조군 둘째 — 위와 **다른 가드**입니다. 위는 "남은 자리가 폭에 못 미침"이고
   * 이건 "폭을 다 썼는데 숫자가 남음"입니다. 위 테스트만 있으면 이 가드를 지워도
   * 0 red입니다(실측). */
  it("붙어 있는데 자릿수가 넘치면 읽지 않는다", () => {
    expect(parsePasted("202608141530455", DATETIME)).toBe(null);
  });

  it("날짜+시각을 날짜만 있는 픽커에 넣으면 날짜만 남는다", () => {
    expect(parsePasted("2026-08-14T15:30:45", DATE)).toBe("2026-08-14");
  });

  it("날짜만 있는 글자를 날짜+시각 픽커에 넣으면 시각은 바닥값", () => {
    expect(parsePasted("2026-08-14", DATETIME)).toBe("2026-08-14T00:00:00");
  });

  it("ISO의 밀리초는 버린다", () => {
    expect(parsePasted("2026-08-14T15:30:45.123Z", DATETIME)).toBe("2026-08-14T15:30:45");
  });

  it("날짜+시각을 시각만 있는 픽커에 넣으면 앞의 날짜 세 덩어리를 버린다", () => {
    expect(parsePasted("2026-08-14T15:30:45", TIME)).toBe("15:30:45");
  });

  it("오후 라벨이 있으면 12시간 읽기로 해석한다", () => {
    expect(parsePasted("오후 03:30:45", TIME, KO12)).toBe("15:30:45");
  });

  it("오전 12는 0시다", () => {
    expect(parsePasted("오전 12:00:00", TIME, KO12)).toBe("00:00:00");
  });

  it("ASCII PM도 읽는다", () => {
    expect(parsePasted("3:30:45 PM", TIME, KO12)).toBe("15:30:45");
  });

  /* 🔴 대조군 — 기본 라벨은 빈 문자열입니다. `hour.pm &&`로 안 거르면
   * `"".includes()`가 늘 참이라 **모든 붙여넣기가 오후**가 됩니다. */
  it("기본 라벨(빈 문자열)은 아무것도 오후로 만들지 않는다", () => {
    expect(parsePasted("03:30:45", TIME)).toBe("03:30:45");
  });

  it("오전/오후와 시가 앞뒤가 안 맞으면 포기한다", () => {
    expect(parsePasted("오후 15:30:45", TIME, KO12)).toBe(null);
  });

  it("숫자가 없으면 null", () => {
    expect(parsePasted("아무 글자", DATE)).toBe(null);
    expect(parsePasted("", DATE)).toBe(null);
  });

  it("덩어리가 모자라면 null", () => {
    expect(parsePasted("2026-08", DATE)).toBe(null);
  });

  it("범위 밖이면 null — 없는 달", () => {
    expect(parsePasted("2026-13-01", DATE)).toBe(null);
  });

  it("범위 밖이면 null — 그 달에 없는 날", () => {
    expect(parsePasted("2026-02-30", DATE)).toBe(null);
  });

  it("범위 밖이면 null — 25시", () => {
    expect(parsePasted("25:00:00", TIME)).toBe(null);
  });

  it("윤년의 2월 29일은 읽는다 — 말일 계산이 실제로 도는지", () => {
    expect(parsePasted("2028-02-29", DATE)).toBe("2028-02-29");
    expect(parsePasted("2026-02-29", DATE)).toBe(null);
  });
});

/* 격자(step) — 설계 스펙 §8.
 *
 * 계약의 핵심은 둘입니다: **격자의 기준점은 언제나 그 열의 바닥값**이고(min이 아님),
 * **step을 안 넘기면 지금까지와 글자 하나 안 바뀐다**는 것. */
describe("stepOf — 격자 간격 읽기", () => {
  it("안 넘기면 1이다", () => {
    expect(stepOf("minute")).toBe(1);
    expect(stepOf("minute", {})).toBe(1);
  });

  it("넘긴 열만 적용된다", () => {
    expect(stepOf("minute", { minute: 15 })).toBe(15);
    expect(stepOf("hour", { minute: 15 })).toBe(1);
  });

  // 0으로 나누거나 무한 루프가 되는 값들. 던지지 않고 "step 없음"으로 읽습니다.
  it("0은 1로 떨어진다", () => { expect(stepOf("minute", { minute: 0 })).toBe(1); });
  it("음수는 1로 떨어진다", () => { expect(stepOf("minute", { minute: -5 })).toBe(1); });
  it("소수는 내림하고, 1 미만이면 1이다", () => {
    expect(stepOf("minute", { minute: 7.9 })).toBe(7);
    expect(stepOf("minute", { minute: 0.5 })).toBe(1);
  });
  it("NaN은 1로 떨어진다", () => { expect(stepOf("minute", { minute: NaN })).toBe(1); });
});

describe("snapToStep — 격자에 안 얹히면 내린다", () => {
  it("격자 위면 그대로", () => { expect(snapToStep("minute", 30, { minute: 15 })).toBe(30); });
  it("사이면 내린다 — 올림이 아니다", () => { expect(snapToStep("minute", 44, { minute: 15 })).toBe(30); });

  // 🔴 기준점이 바닥값입니다. 월·일은 바닥이 1이라 격자가 1,4,7…입니다.
  it("월·일은 바닥값 1에서 격자가 시작한다", () => {
    expect(snapToStep("month", 5, { month: 3 })).toBe(4);
    expect(snapToStep("day", 9, { day: 4 })).toBe(9);
  });

  it("step이 1이면 아무것도 안 바꾼다", () => { expect(snapToStep("minute", 44)).toBe(44); });
});

describe("shiftDateValue — 격자 한 칸씩", () => {
  const DT = ["year", "month", "day", "hour", "minute", "second"] as WheelUnit[];

  it("한 노치가 step 하나다", () => {
    expect(shiftDateValue("2026-07-12T03:30:00", "minute", 1, DT, { minute: 15 })).toBe("2026-07-12T03:45:00");
    expect(shiftDateValue("2026-07-12T03:30:00", "minute", -1, DT, { minute: 15 })).toBe("2026-07-12T03:15:00");
  });

  it("여러 칸도 격자 위에 떨어진다", () => {
    expect(shiftDateValue("2026-07-12T03:00:00", "minute", 3, DT, { minute: 15 })).toBe("2026-07-12T03:45:00");
  });

  /* 🔴 격자 밖에서 출발하는 경우 — min이 격자 밖일 때 실제로 일어납니다.
   * 위로는 **바로 위 격자점**, 아래로는 **바로 아래 격자점**입니다. 값 ± step이면
   * 03:07에서 위가 03:22가 되어 같은 픽커가 min에 따라 다른 시각 집합을 내줍니다. */
  it("격자 밖에서 위로 한 칸은 바로 위 격자점이다", () => {
    expect(shiftDateValue("2026-07-12T03:07:00", "minute", 1, DT, { minute: 15 })).toBe("2026-07-12T03:15:00");
  });

  it("격자 밖에서 아래로 한 칸은 바로 아래 격자점이다", () => {
    expect(shiftDateValue("2026-07-12T03:07:00", "minute", -1, DT, { minute: 15 })).toBe("2026-07-12T03:00:00");
  });

  /* 아래로 두 칸이면 03:00을 지나 **열 안에서 순환**합니다 — 시로 자리올림하지
   * 않는 것이 이 컴포넌트의 기존 규칙이고(열 안에서만 돈다), 격자가 그 규칙을 안 바꿉니다.
   * 처음에 02:45를 기대하는 테스트를 썼다가 이걸로 정정했습니다. */
  it("격자 밖에서 아래로 두 칸이면 열 안에서 순환한다", () => {
    expect(shiftDateValue("2026-07-12T03:07:00", "minute", -2, DT, { minute: 15 })).toBe("2026-07-12T03:45:00");
  });

  /* 격자가 열을 딱 나누지 못해도 허용합니다 — 분 step 7이면 0,7…56 다음이 0이고
   * 마지막 간격만 4입니다. 금지하면 시 step 5(24를 안 나눔)가 통째로 막힙니다. */
  it("격자가 열을 안 나눠도 순환한다 — 마지막 간격만 짧다", () => {
    expect(shiftDateValue("2026-07-12T03:56:00", "minute", 1, DT, { minute: 7 })).toBe("2026-07-12T03:00:00");
  });

  it("아래로 순환하면 마지막 격자점으로 간다", () => {
    expect(shiftDateValue("2026-07-12T03:00:00", "minute", -1, DT, { minute: 7 })).toBe("2026-07-12T03:56:00");
  });

  // 연도는 상한이 없어 순환하지 않습니다.
  it("연도는 순환하지 않고 격자 위로 간다", () => {
    expect(shiftDateValue("2026-07-12", "year", 1, ["year", "month", "day"], { year: 10 })).toBe("2030-07-12");
  });

  // 🔴 대조군 — step을 안 넘기면 예전과 완전히 같아야 합니다.
  it("step이 없으면 예전 동작 그대로다", () => {
    expect(shiftDateValue("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(shiftDateValue("2026-12-15", "month", 1)).toBe("2026-01-15");
    expect(shiftDateValue("2026-01-01", "day", -1)).toBe("2026-01-31");
  });
});

describe("withUnitValue — 타이핑은 격자로 내린다", () => {
  const DT = ["year", "month", "day", "hour", "minute", "second"] as WheelUnit[];

  it("격자에 안 떨어지면 내린다", () => {
    expect(withUnitValue("2026-07-12T03:00:00", "minute", 44, DT, { minute: 15 })).toBe("2026-07-12T03:30:00");
  });

  it("격자 위면 그대로", () => {
    expect(withUnitValue("2026-07-12T03:00:00", "minute", 45, DT, { minute: 15 })).toBe("2026-07-12T03:45:00");
  });

  /* 🔴 **말일은 min/max와 같은 급의 경계라 격자 밖이어도 끝점으로 들어옵니다**(스펙 §8의
   * "경계는 격자 밖이어도 끝점으로"). 일 step 5의 2월 열은 1·6·11·16·21·26 **그리고 28**
   * 입니다. 26으로 더 내리는 안도 있었지만, 그러면 그 달의 마지막 날을 고를 방법이
   * 없어집니다 — min이 격자 밖일 때 min을 못 고르게 되는 것과 같은 결함입니다. */
  it("말일은 격자 밖이어도 끝점으로 남는다", () => {
    expect(withUnitValue("2026-02-10", "day", 31, ["year", "month", "day"], { day: 5 })).toBe("2026-02-28");
  });

  it("step이 없으면 예전 동작 그대로다", () => {
    expect(withUnitValue("2026-04-10", "day", 31)).toBe("2026-04-30");
  });
});

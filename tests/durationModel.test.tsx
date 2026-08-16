// @vitest-environment jsdom
//
// 기간 모델 — `WheelModel`의 두 번째 구현.
//
// 🔴 **이 파일의 절반은 모델 검사가 아니라 계약 검사입니다.** 기간을 만든 이유가
// "계약이 정말 두 번째 모델을 받는가"를 재는 것이었으므로, 모델만 따로 보는 것으로는
// 답이 안 나옵니다 — **진짜 기계에 꽂아서** 그려지는지를 봐야 합니다.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WheelPicker } from "../src/WheelPicker";
import { instantModel } from "../src/model/instant";
import { durationModel, parseDuration, serializeDuration, durationCeiling } from "../src/model/duration";
import type { WheelUnit } from "../src/model/instant";

afterEach(cleanup);

const HM: WheelUnit[] = ["hour", "minute"];
const YMD: WheelUnit[] = ["year", "month", "day"];

const fieldOf = (name: string) =>
  screen.getByRole("button", { name: (n: string) => n === name || n.startsWith(`${name}, `) });
const rowsOf = (unit: string) =>
  [...document.querySelectorAll(`.wheel-column[data-unit="${unit}"] .wheel-values button`)].map((b) => b.textContent);

describe("기간 값 — 고정폭 YYYY:MM:DD:HH:MM:SS", () => {
  it("왕복한다", () => {
    const parts = parseDuration("0002:03:04:05:06:07");
    expect(parts).toEqual({ year: 2, month: 3, day: 4, hour: 5, minute: 6, second: 7 });
    expect(serializeDuration(parts!)).toBe("0002:03:04:05:06:07");
  });

  // 고정폭이라야 min/max 접두 슬라이스 비교가 성립합니다(설계 스펙 §12).
  it("길이가 언제나 19자다", () => {
    expect(serializeDuration({ year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 })).toHaveLength(19);
    expect(serializeDuration({ year: 9999, month: 11, day: 30, hour: 23, minute: 59, second: 59 })).toHaveLength(19);
  });

  it("형식이 안 맞으면 null", () => {
    expect(parseDuration("P1Y2M")).toBe(null);
    expect(parseDuration("01:30")).toBe(null);
  });
});

describe("상한 — 그리는 열 중 맨 위만 무제한 (오너 결정: 자리올림 없음)", () => {
  it("시·분만 그리면 시가 무제한이다", () => {
    expect(durationCeiling("hour", HM)).toBe(null);
    expect(durationCeiling("minute", HM)).toBe(59);
  });

  it("연·월·일을 그리면 연이 무제한이고 월은 11까지다", () => {
    expect(durationCeiling("year", YMD)).toBe(null);
    expect(durationCeiling("month", YMD)).toBe(11);
    expect(durationCeiling("day", YMD)).toBe(30);
  });

  // 같은 열이라도 무엇을 그리느냐에 따라 상한이 달라집니다 — 그게 "맨 위만 무제한"의 뜻입니다.
  it("일만 그리면 일이 무제한이다", () => {
    expect(durationCeiling("day", ["day"])).toBe(null);
    expect(durationCeiling("day", YMD)).toBe(30);
  });
});

describe("이동 — 자리올림하지 않는다", () => {
  it("59분에서 +1은 0분이고 시는 그대로다", () => {
    expect(durationModel.shift("0000:00:00:01:59:00", "minute", 1, HM)).toBe("0000:00:00:01:00:00");
  });

  it("맨 위 열은 순환하지 않고 위로 계속 간다", () => {
    expect(durationModel.shift("0000:00:00:08:00:00", "hour", 1, HM)).toBe("0000:00:00:09:00:00");
  });

  /* 🔴 **"무제한"은 칸 너비까지입니다.** 고정폭과 무제한은 끝에서 부딪히는데, 답은 아래
   * 0과 같습니다 — 넘치면 형식이 깨지고 기계가 `—`로 그립니다. 시가 맨 위면 99시간,
   * 연이 맨 위면 9999년이 천장입니다. 시점 모델의 연도가 10000에서 같은 일을 합니다. */
  it("맨 위 열도 칸 너비를 넘으면 유효하지 않은 값이 된다", () => {
    const over = durationModel.shift("0000:00:00:99:00:00", "hour", 1, HM);
    expect(durationModel.isValid(over, HM)).toBe(false);
  });

  /* 🔴 **0 아래는 "제자리"가 아니라 "없는 값"입니다.** 클램프하면 휠에 `00`이 두 줄
   * 나오고 그건 "못 간다"가 아니라 "제자리"라고 말합니다 — 기계에 꽂아 보고 잡았습니다
   * (아래 렌더 검사가 그 자리를 고정합니다). 형식이 깨진 값을 내면 기계의 `isValid`
   * 가드가 `null`로 받아 그 행을 `—`로 그립니다. */
  it("맨 위 열에서 0 아래로 가면 유효하지 않은 값이 된다", () => {
    const below = durationModel.shift("0000:00:00:00:00:00", "hour", -1, HM);
    expect(durationModel.isValid(below, HM)).toBe(false);
  });
});

describe("바닥값 — 기간은 전부 0에서 시작한다", () => {
  it("월·일도 0이 유효하다 (시점은 1부터)", () => {
    expect(durationModel.isValid("0000:00:00:00:00:00", YMD)).toBe(true);
    expect(parseDuration("0000:00:00:00:00:00")).toEqual({ year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 계약 검사 — **진짜 기계에 꽂아서** 봅니다. 여기가 이 파일의 요점입니다.
 * ════════════════════════════════════════════════════════════════════════ */
describe("계약 — 기계가 기간 모델로도 돈다", () => {
  const renderDuration = (fields: WheelUnit[] = HM, value = "0000:00:00:01:30:00") =>
    render(<WheelPicker model={durationModel} ariaLabel="기간" value={value} onChange={() => undefined} fields={fields} />);

  it("트리거가 기간을 그린다", () => {
    renderDuration();
    expect(fieldOf("기간").textContent).toContain("01:30");
  });

  it("그리는 열이 fields를 따른다", () => {
    renderDuration();
    fireEvent.click(fieldOf("기간"));
    expect([...document.querySelectorAll(".wheel-column")].map((c) => c.getAttribute("data-unit"))).toEqual(["hour", "minute"]);
  });

  it("휠이 돈다", () => {
    renderDuration();
    fireEvent.click(fieldOf("기간"));
    expect(rowsOf("hour")).toEqual(["—", "00", "01", "02", "03"]);
  });

  /* 🔴 위 "0 아래는 없는 값"이 화면에서 실제로 무엇이 되는지 — 이걸 안 보면 모델이
   * 옳은지 알 수 없습니다. 클램프하던 판에서는 여기가 `["00","00","01",…]`였습니다. */
  it("0에서 아래 칸은 —로 비활성된다", () => {
    renderDuration(HM, "0000:00:00:00:30:00");
    fireEvent.click(fieldOf("기간"));
    expect(rowsOf("hour")[0]).toBe("—");
  });
});

/* 계약을 고친 뒤 — 찢어짐 셋이 실제로 닫혔는가.
 *
 * 🔴 이 세 검사가 이번 라운드의 **결과**입니다. 고치기 전에는 셋 다 반대로 나왔습니다
 * (하단 버튼이 `["지금","완료"]`, `family`가 `"time"`이라고 거짓말, `hourFromTwelve`가
 * 안 쓰이는 채로 필수). */
describe("계약 — 기간이 거짓말하지 않아도 되는가", () => {
  const renderDuration = (fields: WheelUnit[] = HM) =>
    render(<WheelPicker model={durationModel} ariaLabel="기간" value="0000:00:00:01:30:00" onChange={() => undefined} fields={fields} />);

  it("씨앗 버튼이 안 그려진다 — 기간에는 '지금'이 없다", () => {
    renderDuration();
    fireEvent.click(fieldOf("기간"));
    expect([...document.querySelectorAll(".wheel-actions button")].map((b) => b.textContent)).toEqual(["완료"]);
  });

  // 대조군 — 시점은 그대로 뜹니다. 버튼을 없애는 것이 아니라 **모델이 정하게** 한 것입니다.
  it("시점 모델에서는 씨앗 버튼이 그대로 뜬다", () => {
    render(<WheelPicker model={instantModel} ariaLabel="날짜" value="2026-08-14" onChange={() => undefined} fields={["year", "month", "day"]} />);
    fireEvent.click(fieldOf("날짜"));
    expect([...document.querySelectorAll(".wheel-actions button")].map((b) => b.textContent)).toEqual(["오늘", "완료"]);
  });

  it("씨앗값은 여전히 답할 수 있다 — 빈 값으로 열면 0", () => {
    render(<WheelPicker model={durationModel} ariaLabel="기간" value="" onChange={() => undefined} fields={HM} />);
    fireEvent.click(fieldOf("기간"));
    // 0에서는 아래 두 칸이 전부 `—`라 인덱스로 짚으면 안 됩니다 — 선택된 행으로 봅니다.
    expect(document.querySelector('.wheel-column[data-unit="hour"] .wheel-values button.selected')?.textContent).toBe("00");
  });

  it("hourFromTwelve를 안 내도 된다 — 계약에서 선택이다", () => {
    expect(durationModel.hourFromTwelve).toBeUndefined();
    expect(instantModel.hourFromTwelve).toBeTypeOf("function");
  });

  it("계열을 묻는 멤버가 계약에서 사라졌다", () => {
    expect("family" in durationModel).toBe(false);
    expect("family" in instantModel).toBe(false);
  });
});

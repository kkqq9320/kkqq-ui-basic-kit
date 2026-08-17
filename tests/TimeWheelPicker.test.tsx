// @vitest-environment jsdom
//
// 5단계에서 생긴 래퍼 둘의 계약입니다. **기능 검사가 아닙니다** — 휠이 어떻게 도는지는
// tests/DateWheelPicker.test.tsx가 이미 1000개 넘게 고정하고 있고, 두 래퍼는 같은 기계를
// 씁니다. 여기서 보는 것은 래퍼가 아는 두 가지뿐입니다: **자기 기본 fields**와
// **자기가 허용하는 구간**(설계 스펙 §3.2·§4).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateWheelPicker } from "../src/controls/DateWheelPicker";
import { TimeWheelPicker } from "../src/controls/TimeWheelPicker";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const fieldOf = (name: string) =>
  screen.getByRole("button", { name: (accessibleName: string) => accessibleName === name || accessibleName.startsWith(`${name}, `) });

const unitsOf = () => [...document.querySelectorAll(".wheel-column")].map((column) => column.getAttribute("data-unit"));

describe("TimeWheelPicker — 시각 쪽 구간의 래퍼", () => {
  it("기본 fields는 시·분이다", () => {
    render(<TimeWheelPicker ariaLabel="시각" value="03:30" onChange={() => undefined} />);
    fireEvent.click(fieldOf("시각"));
    expect(unitsOf()).toEqual(["hour", "minute"]);
  });

  // 네이티브 <input type="time">이 초를 기본으로 안 그리는 것과 같습니다.
  it("초는 fields로 켠다", () => {
    render(<TimeWheelPicker ariaLabel="시각" value="03:30:45" onChange={() => undefined} fields={["hour", "minute", "second"]} />);
    fireEvent.click(fieldOf("시각"));
    expect(unitsOf()).toEqual(["hour", "minute", "second"]);
  });

  it("값 형식은 시각 계열이다", () => {
    render(<TimeWheelPicker ariaLabel="시각" value="03:30" onChange={() => undefined} />);
    expect(fieldOf("시각").textContent).toContain("03:30");
  });

  /* 🔴 래퍼가 아는 두 번째 것 — **자기가 허용하는 구간.** 두 래퍼가 구간을 나눠 가져야
   * 같은 일을 하는 방법이 둘 생기지 않습니다(설계 스펙 §4). 던지지 않고 경고만 냅니다 —
   * 던지면 킷이 소비자 화면을 죽이는 것이라 §6.1의 "무시 + 경고"와 결이 어긋납니다. */
  it("날짜 쪽에서 시작하는 구간을 주면 경고한다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<TimeWheelPicker ariaLabel="시각" value="2026-08-14" onChange={() => undefined} fields={["year", "month", "day"]} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("DateWheelPicker"));
  });

  // 대조군 — 제 구간이면 조용합니다.
  it("시각 쪽 구간에는 경고하지 않는다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<TimeWheelPicker ariaLabel="시각" value="30:45" onChange={() => undefined} fields={["minute", "second"]} />);
    expect(warn).not.toHaveBeenCalled();
  });

  /* 래퍼는 나머지 프롭을 통째로 넘깁니다. 여기서 하나라도 새면 소비자는 "TimeWheelPicker에는
   * 그 프롭이 없다"고 읽게 되는데, 타입은 통과하므로 조용한 실패입니다. */
  it("나머지 프롭을 기계로 그대로 넘긴다", () => {
    const onChange = vi.fn();
    render(<TimeWheelPicker ariaLabel="시각" value="03:00" onChange={onChange} className="내-클래스" step={{ minute: 15 }} />);
    expect(document.querySelector(".wheel-picker")?.className).toContain("내-클래스");
    fireEvent.keyDown(fieldOf("시각"), { key: "ArrowRight" });
    fireEvent.keyDown(fieldOf("시각"), { key: "4" });
    fireEvent.keyDown(fieldOf("시각"), { key: "4" });
    expect(onChange).toHaveBeenLastCalledWith("03:30");   // step 15로 내려감 = 프롭이 닿았다
  });
});

describe("DateWheelPicker — 날짜 쪽 구간의 래퍼", () => {
  it("기본 fields는 연·월·일이다", () => {
    render(<DateWheelPicker ariaLabel="날짜" value="2026-08-14" onChange={() => undefined} />);
    fireEvent.click(fieldOf("날짜"));
    expect(unitsOf()).toEqual(["year", "month", "day"]);
  });

  it("시각 단위를 뒤에 붙이는 것은 이쪽이다 — 시작이 날짜 쪽이면", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<DateWheelPicker ariaLabel="날짜" value="2026-08-14T03:30" onChange={() => undefined} fields={["year", "month", "day", "hour", "minute"]} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("시각 쪽에서 시작하는 구간을 주면 경고한다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<DateWheelPicker ariaLabel="날짜" value="03:30" onChange={() => undefined} fields={["hour", "minute"]} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("TimeWheelPicker"));
  });
});

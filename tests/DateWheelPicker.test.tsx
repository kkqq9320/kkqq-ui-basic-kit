// @vitest-environment jsdom
//
// 원본 frontend/src/components/DateWheelPicker.test.tsx를 그대로 옮겼습니다.
// 접근성 이름이 원본과 100% 같으므로, 이 테스트가 통과하면 추출 과정에서
// 동작이 바뀌지 않았다는 증거가 됩니다. 아래쪽에 props 파라미터화 테스트를 더했습니다.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateWheelPicker } from "../src/DateWheelPicker";
import datePickerCssSource from "../css/date-picker.css?raw";

afterEach(() => { cleanup(); vi.useRealTimers(); });

function ControlledDateWheel({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  return <DateWheelPicker ariaLabel="거래 날짜" value={value} onChange={setValue} />;
}

describe("DateWheelPicker", () => {
  it("팝오버의 오늘 버튼이 시간대 기준 오늘로 설정한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 12, 12));
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-06-01" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "거래 날짜" }));
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(onChange).toHaveBeenCalledWith("2026-07-12");
  });

  it("moves the year, month, and day by one with the step buttons", () => {
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "거래 날짜" }));
    expect(screen.getByRole("group", { name: "연도 2026" }).querySelectorAll(".date-wheel-values button")).toHaveLength(7);

    const yearPrevious = screen.getByRole("button", { name: "연도 이전" });
    fireEvent.pointerDown(yearPrevious, { pointerId: 1, clientY: 10 });
    fireEvent.pointerUp(yearPrevious, { pointerId: 1, clientY: 10 });
    fireEvent.click(yearPrevious);
    expect(onChange).toHaveBeenLastCalledWith("2025-07-12");
    expect(yearPrevious.closest(".date-wheel-column")?.classList.contains("moving-previous")).toBe(true);

    const monthNext = screen.getByRole("button", { name: "월 다음" });
    fireEvent.pointerDown(monthNext, { pointerId: 2, clientY: 10 });
    fireEvent.pointerUp(monthNext, { pointerId: 2, clientY: 10 });
    fireEvent.click(monthNext);
    expect(onChange).toHaveBeenLastCalledWith("2026-08-12");
    expect(monthNext.closest(".date-wheel-column")?.classList.contains("moving-next")).toBe(true);

    const dayNext = screen.getByRole("button", { name: "일 다음" });
    fireEvent.pointerDown(dayNext, { pointerId: 3, clientY: 10 });
    fireEvent.pointerUp(dayNext, { pointerId: 3, clientY: 10 });
    fireEvent.click(dayNext);
    expect(onChange).toHaveBeenLastCalledWith("2026-07-13");
  });

  it("does not change on hover-only pointer movement and activates the pressed column", () => {
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "거래 날짜" }));

    const year = screen.getByRole("group", { name: "연도 2026" });
    const month = screen.getByRole("group", { name: "월 07" });
    fireEvent.pointerMove(year, { pointerId: 10, clientY: 80, buttons: 0 });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(month, { pointerId: 11, clientY: 80, buttons: 1 });
    expect(month.classList.contains("active")).toBe(true);
    expect(year.classList.contains("active")).toBe(false);
    fireEvent.pointerCancel(month, { pointerId: 11 });
  });

  it("cycles month and day inside the selected year and month", () => {
    render(<ControlledDateWheel initialValue="2026-12-31" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("button", { name: "월 다음" }));
    expect(trigger.textContent).toContain("2026. 01. 31.");
    expect(screen.getByRole("group", { name: "연도 2026" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "월 01" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "일 다음" }));
    expect(trigger.textContent).toContain("2026. 01. 01.");
  });

  it("clamps the day to the destination month's last day", () => {
    render(<ControlledDateWheel initialValue="2025-01-31" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "월 다음" }));
    expect(trigger.textContent).toContain("2025. 02. 28.");
  });

  // --- 디자인 시스템에서 추가된 파라미터화 ---

  it("renders English labels when they are supplied", () => {
    const english = {
      placeholder: "Pick a date",
      hint: "Scroll or swipe",
      today: "Today",
      clear: "Clear",
      done: "Done",
      previous: "previous",
      next: "next",
      select: "picker",
      weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      units: { year: "Year", month: "Month", day: "Day" },
    };
    render(<DateWheelPicker ariaLabel="Date" value="" onChange={() => undefined} labels={english} allowClear />);

    const trigger = screen.getByRole("button", { name: "Date" });
    expect(trigger.textContent).toBe("Pick a date");

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Date picker" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Year previous" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Month next" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("accepts a partial label override and keeps Korean defaults for the rest", () => {
    render(<DateWheelPicker ariaLabel="날짜" value="" onChange={() => undefined} labels={{ placeholder: "미정" }} />);
    const trigger = screen.getByRole("button", { name: "날짜" });
    expect(trigger.textContent).toBe("미정");
    // 트리거 안의 달력 아이콘은 장식이다 — 누를 수 있는 요소가 아니고 이름도 없다.
    expect(screen.queryByRole("button", { name: /오늘로 설정/ })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);   // 트리거 하나뿐
    // 아이콘은 트리거 버튼 안에 있어야 한다 — 클릭 타깃이 하나, 죽은 영역이 없다.
    const icon = trigger.querySelector(".date-wheel-trigger-icon");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("완료 버튼으로 닫으면 트리거로 포커스를 되돌리되 스크롤 위치는 건드리지 않는다 (preventScroll)", async () => {
    // 이 focus() 호출에 preventScroll이 빠지면, 데스크톱에서 완료를 눌렀을 때
    // 브라우저가 트리거를 보이게 하려고 페이지를 스크롤해 버린다. positioning.ts:55와
    // 같은 컬럼의 다른 모든 focus 복귀가 지키는 규칙이다.
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "거래 날짜 선택" })).toBeTruthy();

    const focusSpy = vi.spyOn(trigger, "focus");
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    await waitFor(() => expect(focusSpy).toHaveBeenCalled());   // requestAnimationFrame으로 미뤄진다
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("resolves today in the supplied time zone", () => {
    vi.useFakeTimers();
    // 2026-07-12T20:00Z → 서울은 이미 13일, UTC는 아직 12일
    vi.setSystemTime(new Date("2026-07-12T20:00:00Z"));
    const seoul = vi.fn();
    render(<DateWheelPicker ariaLabel="서울" value="2026-01-01" onChange={seoul} />);
    fireEvent.click(screen.getByRole("button", { name: "서울" }));
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(seoul).toHaveBeenCalledWith("2026-07-13");
    cleanup();

    const utc = vi.fn();
    render(<DateWheelPicker ariaLabel="UTC" value="2026-01-01" onChange={utc} timeZone="UTC" />);
    fireEvent.click(screen.getByRole("button", { name: "UTC" }));
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(utc).toHaveBeenCalledWith("2026-07-12");
  });
});

// 연·월 픽커 — fields={["year", "month"]}. 값 형식은 그대로 YYYY-MM-DD(일=01).
describe("DateWheelPicker year-month mode (fields)", () => {
  it("renders only year and month columns and drops the day from the trigger", () => {
    render(<DateWheelPicker ariaLabel="예산 월" value="2026-07-12" fields={["year", "month"]} onChange={() => undefined} />);
    const trigger = screen.getByRole("button", { name: "예산 월" });
    expect(trigger.textContent).toBe("2026. 07.");            // 일 없음

    fireEvent.click(trigger);
    expect(screen.getByRole("group", { name: "연도 2026" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "월 07" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "일 다음" })).toBeNull();   // 일 열이 아예 없음
    const columns = screen.getByRole("dialog", { name: "예산 월 선택" }).querySelector(".date-wheel-columns");
    expect(columns?.getAttribute("data-fields")).toBe("2");
  });

  it("emits a day-01 value when the month changes", () => {
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="예산 월" value="2026-07-12" fields={["year", "month"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "예산 월" }));
    fireEvent.click(screen.getByRole("button", { name: "월 다음" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-08-01");   // 12일이 아니라 01일
  });

  it("keeps a partially-covered month selectable — min compares at month granularity", () => {
    // 예산이 7월 15일부터 시작해도 '7월'은 통째로 선택 가능해야 합니다.
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="예산 월" value="2026-08-01" min="2026-07-15" fields={["year", "month"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "예산 월" }));
    const monthPrevious = screen.getByRole("button", { name: "월 이전" });
    expect(monthPrevious.hasAttribute("disabled")).toBe(false);   // 7월 허용
    fireEvent.click(monthPrevious);
    expect(onChange).toHaveBeenLastCalledWith("2026-07-01");
  });

  it("disables the month before a month-granular min and keeps the min month in range", () => {
    // min이 8월 5일이면: 7월은 막히고, 8월 1일은 min보다 이른 날짜지만 '8월'이라 클램프되지 않습니다.
    render(<DateWheelPicker ariaLabel="예산 월" value="2026-08-01" min="2026-08-05" fields={["year", "month"]} onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "예산 월" }));
    expect(screen.getByRole("group", { name: "월 08" })).toBeTruthy();                        // 8월 그대로
    expect(screen.getByRole("button", { name: "월 이전" }).hasAttribute("disabled")).toBe(true);   // 7월 막힘
  });

  it("팝오버의 오늘 버튼이 연·월 모드에서 일=01로 정규화한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T03:00:00Z"));   // 서울 2026-07-12 정오
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="예산 월" value="2026-05-01" fields={["year", "month"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "예산 월" }));
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(onChange).toHaveBeenCalledWith("2026-07-01");
  });

  it("renders a year-only picker and formats the trigger as the bare year", () => {
    render(<DateWheelPicker ariaLabel="회계 연도" value="2026-07-12" fields={["year"]} onChange={() => undefined} />);
    const trigger = screen.getByRole("button", { name: "회계 연도" });
    expect(trigger.textContent).toBe("2026.");            // 월·일 없음

    fireEvent.click(trigger);
    expect(screen.getByRole("group", { name: "연도 2026" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "월 다음" })).toBeNull();   // 월 열 없음
    expect(screen.queryByRole("button", { name: "일 다음" })).toBeNull();   // 일 열 없음
    const columns = screen.getByRole("dialog", { name: "회계 연도 선택" }).querySelector(".date-wheel-columns");
    expect(columns?.getAttribute("data-fields")).toBe("1");
  });

  it("emits a January-01 value when the year changes in year-only mode", () => {
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="회계 연도" value="2026-07-12" fields={["year"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "회계 연도" }));
    fireEvent.click(screen.getByRole("button", { name: "연도 다음" }));
    expect(onChange).toHaveBeenLastCalledWith("2027-01-01");   // 월·일 모두 01로 정규화
  });

  // jsdom은 캐스케이드를 계산하지 않으므로 소스 텍스트로 고정한다 — Select.test.tsx의 같은 idiom.
  describe("CSS 계약", () => {
    // 포커스 링은 shell이 그린다(:26). 안쪽 버튼의 기본 아웃라인을 끄지 않으면 브라우저가
    // 자기 링을 그 안에 하나 더 그려 두 겹이 된다 — Tab으로 옮겨 다닐 때 드롭다운은
    // 강조색 링 하나, 날짜만 링 두 개가 나왔다. 실기기 관측: "하얀색 링이 보여".
    it("트리거 버튼의 기본 포커스 아웃라인을 끈다 — 링은 shell이 그린다", () => {
      expect(datePickerCssSource.length).toBeGreaterThan(500);
      // shell이 실제로 링을 그리고 있어야 이 규칙이 정당하다 — 둘을 함께 본다.
      // `[^)]*`를 쓰면 안 된다 — 선택자 안의 `:not(:disabled)`가 먼저 `)`로 끝나서
      // `:focus-visible`까지 못 간다. 실제로 그렇게 썼다가 베이스라인에서 걸렸다.
      expect(datePickerCssSource).toMatch(/\.date-wheel-trigger-shell:has\([^{]*:focus-visible[^{]*\{[^}]*outline:\s*var\(--focus-ring\)/);
      const suppressRule = datePickerCssSource.match(/\.date-wheel-trigger:focus-visible[^{]*\{[^}]*\}/);
      expect(suppressRule).not.toBeNull();
      expect(suppressRule![0]).toMatch(/outline:\s*none/);
      // (`.date-wheel-today:focus-visible` 단언은 삭제 — 그 버튼이 없어졌다)
    });

    // :hover는 비활성 요소에도 매칭되므로, 빼지 않으면 흐려진 필드가 마우스만 올려도
    // 강조 테두리로 살아난다.
    it("비활성 필드가 hover에 살아나지 않는다", () => {
      expect(datePickerCssSource).toMatch(/\.date-wheel-trigger-shell:has\(:hover:not\(:disabled\)/);
      expect(datePickerCssSource).toMatch(/\.date-wheel-trigger-shell:has\(\.date-wheel-trigger:disabled\)\s*\{[^}]*opacity:\s*\.55/);
    });
  });
});

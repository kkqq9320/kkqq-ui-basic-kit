// @vitest-environment jsdom
//
// 원본 frontend/src/components/DateWheelPicker.test.tsx를 그대로 옮겼습니다.
// 접근성 이름이 원본과 100% 같으므로, 이 테스트가 통과하면 추출 과정에서
// 동작이 바뀌지 않았다는 증거가 됩니다. 아래쪽에 props 파라미터화 테스트를 더했습니다.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateWheelPicker, type DateWheelUnit } from "../src/DateWheelPicker";
import datePickerCssSource from "../css/date-picker.css?raw";

afterEach(() => { cleanup(); vi.useRealTimers(); });

function ControlledDateWheel({ initialValue, allowClear }: { initialValue: string; allowClear?: boolean }) {
  const [value, setValue] = useState(initialValue);
  return <DateWheelPicker ariaLabel="거래 날짜" value={value} onChange={setValue} allowClear={allowClear} />;
}

// 리뷰 Finding 1 — 소비자가 런타임에 fields를 바꿀 수 있다(일간/월간 토글 등).
// 팝오버가 열린 채로 열이 하나 사라지는 상황을 만드는 헬퍼다.
function DateWheelFieldsShrink() {
  const [fields, setFields] = useState<DateWheelUnit[]>(["year", "month", "day"]);
  return <>
    <button type="button" onClick={() => setFields(["year", "month"])}>일 열 제거</button>
    <DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={() => undefined} fields={fields} />
  </>;
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

describe("DateWheelPicker 키보드 진입", () => {
  it("↓로 열고 포커스가 첫 열에 간다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    trigger.focus();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    // 개수가 아니라 신원으로 확인한다 — 어느 열인지가 계약이다.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("group", { name: "연도 2026" })));
  });

  it("↑ Enter Space로도 열린다", () => {
    for (const key of ["ArrowUp", "Enter", " "]) {
      render(<ControlledDateWheel initialValue="2026-07-12" />);
      const trigger = screen.getByRole("button", { name: "거래 날짜" });
      fireEvent.keyDown(trigger, { key });
      expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeTruthy();
      cleanup();
    }
  });

  it("비활성이면 어느 키로도 열리지 않는다", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={() => undefined} disabled />);
    fireEvent.keyDown(screen.getByRole("button", { name: "거래 날짜" }), { key: "ArrowDown" });
    expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull();
  });

  it("뒤로가기로 닫으면 포커스가 트리거로 돌아온다", async () => {
    // 포커스가 팝오버 안에 있는 채로 열이 언마운트되면 포커스가 body로 떨어지고
    // 다음 Tab이 문서 처음부터 시작한다. Escape·완료는 이미 회수하고 있었다.
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("group", { name: "연도 2026" })));

    fireEvent.popState(window, { state: null });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});

describe("DateWheelPicker 열 이동", () => {
  async function openPicker() {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("group", { name: "연도 2026" })));
    return trigger;
  }

  /** 연도 열에서 →를 두 번 눌러 마지막 열(일)까지 옮겨 놓은 상태를 만든다. */
  async function openPickerAtLastColumn() {
    const trigger = await openPicker();
    const year = screen.getByRole("group", { name: "연도 2026" });
    fireEvent.keyDown(year, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("group", { name: "월 07" })));
    fireEvent.keyDown(screen.getByRole("group", { name: "월 07" }), { key: "ArrowRight" });
    const day = await screen.findByRole("group", { name: /^일 12/ });
    await waitFor(() => expect(document.activeElement).toBe(day));
    return { trigger, day };
  }

  /** 열이 하나뿐인 픽커를 열어 그 열(첫 열이자 마지막 열)에 포커스를 둔다. */
  async function openSoloYearPicker() {
    render(<DateWheelPicker ariaLabel="회계 연도" value="2026-07-12" fields={["year"]} onChange={() => undefined} />);
    const trigger = screen.getByRole("button", { name: "회계 연도" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const year = await screen.findByRole("group", { name: "연도 2026" });
    await waitFor(() => expect(document.activeElement).toBe(year));
    return year;
  }

  it("→와 Tab이 다음 열로 옮긴다", async () => {
    await openPicker();
    const year = screen.getByRole("group", { name: "연도 2026" });

    fireEvent.keyDown(year, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("group", { name: "월 07" })));

    fireEvent.keyDown(screen.getByRole("group", { name: "월 07" }), { key: "Tab" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("group", { name: /^일 12/ })));
  });

  // 아래 세 개는 원래 "마지막 열에서 →는 제자리, Tab은 닫고 나간다" 한 개였다. 팝오버를
  // 경계에서 닫아버리는 뮤테이션은 포커스-정체성 검사와 다이얼로그-열림 검사를 항상
  // 같이 죽인다 — 포커스가 있던 노드가 언마운트되며 activeElement가 같이 떨어지기
  // 때문이다. 한 it 안에서 그 둘을 순서대로 두면 앞 것이 먼저 던져 뒤 것은 한 번도
  // 실행되지 못한 채 "통과"만 한다. 각 assert를 별도 실행으로 쪼갠다.
  it("마지막 열에서 →는 포커스를 그대로 둔다", async () => {
    const { day } = await openPickerAtLastColumn();
    fireEvent.keyDown(day, { key: "ArrowRight" });
    expect(document.activeElement).toBe(day);
  });

  it("마지막 열에서 →는 팝오버를 닫지 않는다", async () => {
    const { day } = await openPickerAtLastColumn();
    fireEvent.keyDown(day, { key: "ArrowRight" });
    expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeTruthy();
  });

  it("마지막 열에서 Tab은 닫고 트리거로 포커스를 넘긴다", async () => {
    const { trigger, day } = await openPickerAtLastColumn();
    // Tab은 떠나는 키 — 닫고 포커스를 트리거로 넘긴다(브라우저가 그 다음을 계산한다)
    fireEvent.keyDown(day, { key: "Tab" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  // 아래 세 개는 원래 "첫 열에서 ←는 제자리, Shift+Tab은 닫고 트리거로" 한 개였다.
  // 위와 같은 이유로 포커스-정체성 검사와 다이얼로그-열림 검사를 분리한다.
  it("첫 열에서 ←는 포커스를 그대로 둔다", async () => {
    await openPicker();
    const year = screen.getByRole("group", { name: "연도 2026" });
    fireEvent.keyDown(year, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(year);
  });

  it("첫 열에서 ←는 팝오버를 닫지 않는다", async () => {
    await openPicker();
    const year = screen.getByRole("group", { name: "연도 2026" });
    fireEvent.keyDown(year, { key: "ArrowLeft" });
    expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeTruthy();
  });

  it("첫 열에서 Shift+Tab은 닫고 트리거로 포커스를 넘긴다", async () => {
    const trigger = await openPicker();
    const year = screen.getByRole("group", { name: "연도 2026" });
    fireEvent.keyDown(year, { key: "Tab", shiftKey: true });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  // 아래 두 개는 원래 "연도만 있는 픽커는 첫 열이 곧 마지막 열이다" 한 개였다. →와
  // ←는 같은 분기(ArrowRight/ArrowLeft)를 타므로 경계-닫힘 뮤테이션은 둘 다 깨뜨리는데,
  // 한 it 안에 순서대로 두면 → 쪽 assert가 먼저 던져 ← 쪽은 실행되지 못한 채 통과한다.
  // 각자 새로 렌더링해서 분리한다.
  it("연도만 있는 픽커에서 →는 제자리다", async () => {
    const year = await openSoloYearPicker();
    fireEvent.keyDown(year, { key: "ArrowRight" });
    expect(document.activeElement).toBe(year);
  });

  it("연도만 있는 픽커에서 ←는 제자리다", async () => {
    const year = await openSoloYearPicker();
    fireEvent.keyDown(year, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(year);
  });

  it("Ctrl이 눌린 방향키는 열을 옮기지 않는다", async () => {
    await openPicker();
    const year = screen.getByRole("group", { name: "연도 2026" });
    fireEvent.keyDown(year, { key: "ArrowRight", ctrlKey: true });
    expect(document.activeElement).toBe(year);
  });
});

describe("DateWheelPicker 리뷰 Finding 1 — activeUnit 시드와 클램프", () => {
  // 트리거의 onClick은 activeUnit을 건드리지 않고 setOpen만 토글했다. 키보드 진입
  // (handleTriggerKeyDown)은 열 때마다 activeUnit을 fields[0]으로 되돌리는데, 마우스
  // 진입은 그러지 않아 두 경로가 갈렸다 — Select.tsx:449가 마우스·키보드를 같은
  // 값으로 시딩하는 것과 같은 이유다. 월 열에 가 있던 채로 닫았다가 마우스로 다시
  // 열면, 시드가 없으면 포커스가 여전히 월로 간다.
  it("마우스로 다시 열면 키보드로 연 것과 같은 첫 열에 포커스가 간다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("group", { name: "연도 2026" })));
    fireEvent.keyDown(screen.getByRole("group", { name: "연도 2026" }), { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("group", { name: "월 07" })));
    fireEvent.keyDown(screen.getByRole("group", { name: "월 07" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());

    fireEvent.click(trigger);   // 마우스로 다시 연다 — activeUnit 상태는 여전히 "month"다

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("group", { name: "연도 2026" })));
  });

  // columnRefs.current.get(activeUnit)이 undefined가 되는 경로 — fields가 열려 있는
  // 동안 줄어들어 activeUnit이 가리키던 열이 통째로 사라진다. jsdom은 포커스된
  // 노드가 DOM에서 제거되면 포커스를 body로 떨어뜨린다(직접 확인했다). 클램프가
  // 포커스 이펙트의 의존성까지 갱신하지 않으면(즉 이펙트가 다시 안 돌면) 포커스는
  // body에 머물고 방향키가 죽는다 — 리뷰가 지적한 "마우스 전용"이 이 상태다.
  //
  // (렌더의 `resolvedActiveUnit === unit`(활성 클래스) 쪽도 처음엔 별도로 테스트를
  // 뒀었다. 그런데 각 열의 `onFocus={() => setActiveUnit(unit)}`가 있어, 이 포커스
  // 이펙트가 클램프된 열에 진짜 focus()를 걸면 그 focus 이벤트가 즉시 activeUnit
  // 원본 상태까지 클램프값으로 되먹임한다 — 그래서 렌더 줄만 되돌리는 뮤테이션은
  // act()가 다 정리된 뒤에는 관찰되지 않는다(직접 뮤테이션해 확인했다). 렌더 줄은
  // 방어적으로 남겨 두되(원칙상 렌더가 fields 밖 상태를 믿으면 안 된다), 독립적으로
  // 증명 가능한 채널은 이 포커스 이펙트 쪽뿐이라 테스트도 여기 하나만 둔다.)
  it("fields가 열린 채로 줄어 activeUnit이 사라진 열을 가리키면 포커스가 남은 첫 열로 돌아온다", async () => {
    render(<DateWheelFieldsShrink />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("group", { name: "연도 2026" })));
    fireEvent.keyDown(screen.getByRole("group", { name: "연도 2026" }), { key: "ArrowRight" });
    const month = await screen.findByRole("group", { name: "월 07" });
    await waitFor(() => expect(document.activeElement).toBe(month));
    fireEvent.keyDown(month, { key: "ArrowRight" });
    const day = await screen.findByRole("group", { name: /^일 12/ });
    await waitFor(() => expect(document.activeElement).toBe(day));

    fireEvent.click(screen.getByRole("button", { name: "일 열 제거" }));

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("group", { name: "연도 2026" })));
  });
});

describe("DateWheelPicker tab 순서", () => {
  async function openPicker() {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const dialog = await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    return dialog;
  }

  it("팝오버 안에서 tab 순서에 있는 것은 열뿐이다", async () => {
    const dialog = await openPicker();

    const stops = [...dialog.querySelectorAll<HTMLElement>('[tabindex="0"], button:not([tabindex="-1"])')];
    // 신원으로 고정한다 — 개수만 맞추면 엉뚱한 요소가 정거장이어도 통과한다.
    expect(stops.map((node) => node.getAttribute("aria-label"))).toEqual([
      "연도 2026", "월 07", "일 12 일",
    ]);
  });

  // 아래 세 개는 원래 "tabindex·title·aria-hidden 확인" 한 개였다. expect()는 첫
  // 실패에서 던지므로, 서로 다른 결함을 겨냥하는 뒤 두 assert는 앞 것이 통과해야만
  // 실행된다 — 이러면 뒤쪽 assert의 킬력을 확인할 수 없다. 각자 분리한다.
  it("단축키가 있는 동작 버튼은 tab 순서 밖이다", async () => {
    await openPicker();
    const today = screen.getByRole("button", { name: "오늘" });
    expect(today.getAttribute("tabindex")).toBe("-1");
  });

  it("오늘 버튼의 title이 단축키를 보여준다", async () => {
    await openPicker();
    const today = screen.getByRole("button", { name: "오늘" });
    expect(today.getAttribute("title")).toContain("Ctrl");
  });

  it("tabIndex={-1}이어도 접근성 트리에는 그대로 있다 — 지운 것이 아니다", async () => {
    await openPicker();
    const today = screen.getByRole("button", { name: "오늘" });
    expect(today.hasAttribute("aria-hidden")).toBe(false);
  });
});

describe("DateWheelPicker 타이핑", () => {
  async function openAt(initialValue: string) {
    render(<ControlledDateWheel initialValue={initialValue} />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    return trigger;
  }

  // 원래 한 테스트였다 — 트리거 문구(값 계산)와 포커스 이동(자동 전진)은 서로 다른
  // 결함이다. expect()는 첫 실패에서 던지므로 함께 두면 뒤쪽 결함의 킬력을 증명할 수
  // 없다. 각자 분리한다.
  it("연도 네 자리를 치면 확정된다", async () => {
    await openAt("2026-07-12");
    const year = screen.getByRole("group", { name: "연도 2026" });
    for (const digit of ["2", "0", "3", "1"]) fireEvent.keyDown(year, { key: digit });

    await waitFor(() => expect(screen.getByRole("button", { name: "거래 날짜" }).textContent).toBe("2031. 07. 12."));
  });

  it("연도 네 자리를 치면 월 열로 넘어간다", async () => {
    await openAt("2026-07-12");
    const year = screen.getByRole("group", { name: "연도 2026" });
    for (const digit of ["2", "0", "3", "1"]) fireEvent.keyDown(year, { key: digit });

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("group", { name: "월 07" })));
  });

  // soloFloor 즉시확정 경로(월 2~9, 일 4~9)도 값 확정과 열 전진이 서로 다른 결함이다 —
  // 위 연도 케이스와 같은 이유로 나눈다.
  it("월에서 5를 치면 곧바로 5월로 확정한다", async () => {
    await openAt("2026-07-12");
    fireEvent.keyDown(screen.getByRole("group", { name: "연도 2026" }), { key: "ArrowRight" });
    const month = await screen.findByRole("group", { name: "월 07" });
    fireEvent.keyDown(month, { key: "5" });

    await waitFor(() => expect(screen.getByRole("button", { name: "거래 날짜" }).textContent).toBe("2026. 05. 12."));
  });

  it("월에서 5를 치면 일 열로 넘어간다", async () => {
    await openAt("2026-07-12");
    fireEvent.keyDown(screen.getByRole("group", { name: "연도 2026" }), { key: "ArrowRight" });
    const month = await screen.findByRole("group", { name: "월 07" });
    fireEvent.keyDown(month, { key: "5" });

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("group", { name: /^일 12/ })));
  });

  it("일에서 9를 치면 곧바로 9일로 확정한다", async () => {
    await openAt("2026-07-12");
    fireEvent.keyDown(screen.getByRole("group", { name: "연도 2026" }), { key: "ArrowRight" });
    const month = await screen.findByRole("group", { name: "월 07" });
    fireEvent.keyDown(month, { key: "ArrowRight" });
    const day = await screen.findByRole("group", { name: /^일 12/ });
    fireEvent.keyDown(day, { key: "9" });

    await waitFor(() => expect(screen.getByRole("button", { name: "거래 날짜" }).textContent).toBe("2026. 07. 09."));
  });

  it("타이핑은 휠 이동 애니메이션을 재생하지 않는다", async () => {
    // markColumnMotion을 타면 숫자 하나마다 행 7개가 리마운트되고 210ms 전환이
    // 재생된다. 값만 확인하면 이 결함을 못 잡으므로 경로 자체를 고정한다.
    await openAt("2026-07-12");
    const year = screen.getByRole("group", { name: "연도 2026" });
    const rowsBefore = year.querySelector(".date-wheel-values");
    for (const digit of ["2", "0", "3", "1"]) fireEvent.keyDown(year, { key: digit });

    await waitFor(() => expect(screen.getByRole("button", { name: "거래 날짜" }).textContent).toBe("2031. 07. 12."));
    const yearAfter = screen.getByRole("group", { name: "연도 2031" });
    expect(yearAfter.querySelector(".date-wheel-values")).toBe(rowsBefore);   // 리마운트되지 않았다
    expect(yearAfter.classList.contains("moving-next")).toBe(false);
  });

  it("Backspace가 버퍼에서 한 자리만 지운다", async () => {
    await openAt("2026-07-12");
    const year = screen.getByRole("group", { name: "연도 2026" });
    fireEvent.keyDown(year, { key: "2" });
    fireEvent.keyDown(year, { key: "0" });
    fireEvent.keyDown(year, { key: "Backspace" });
    fireEvent.keyDown(year, { key: "3" });
    fireEvent.keyDown(year, { key: "1" });
    // "20" -> Backspace -> "2" -> "231"... 네 자리가 아직 아니므로 확정되지 않았다
    expect(screen.getByRole("button", { name: "거래 날짜" }).textContent).toBe("2026. 07. 12.");
    fireEvent.keyDown(year, { key: "9" });   // "2319" 네 자리
    await waitFor(() => expect(screen.getByRole("button", { name: "거래 날짜" }).textContent).toBe("2319. 07. 12."));
  });

  it("한 자리를 치고 Backspace를 누르면 선택 행이 실제 값으로 돌아간다", async () => {
    // 버퍼가 "2" -> Backspace로 ""가 되는 순간, "없음"을 빈 문자열이 아니라 null로
    // 표현해야 한다. 아니면 `buffered ?? (...)`가 빈 문자열을 걸러내지 못해 행이 빈다.
    await openAt("2026-07-12");
    const year = screen.getByRole("group", { name: "연도 2026" });
    fireEvent.keyDown(year, { key: "2" });
    fireEvent.keyDown(year, { key: "Backspace" });
    expect(year.querySelector(".date-wheel-values .selected")?.textContent).toBe("2026");
  });

  it("치는 동안 선택 행에 친 숫자가 그대로 보인다", async () => {
    await openAt("2026-07-12");
    const year = screen.getByRole("group", { name: "연도 2026" });
    fireEvent.keyDown(year, { key: "2" });
    fireEvent.keyDown(year, { key: "0" });
    expect(year.querySelector(".date-wheel-values .selected")?.textContent).toBe("20");
  });
});

describe("DateWheelPicker 리뷰 Finding 2 — §4.3 확정할 때 값을 다루는 규칙", () => {
  // §4.3 — 휠은 범위 밖 행을 "—"로 그리고 ± 버튼을 비활성화해 애초에 누를 수 없는
  // 자리를 만들지만, 타이핑엔 "누를 수 없는 자리"가 없다. min/max 밖을 치면 경계값
  // 으로 자르는 것이 유일하게 가능한 처리다 — commitTyped가 clampToRange를 거치지
  // 않으면 이 경계가 조용히 사라진다(min 없는 값이 그대로 onChange로 나간다).
  it("타이핑한 값이 min 밖이면 경계값으로 자른다", async () => {
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" min="2026-01-01" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "거래 날짜" }));
    const year = screen.getByRole("group", { name: "연도 2026" });
    for (const digit of ["1", "9", "8", "5"]) fireEvent.keyDown(year, { key: digit });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("2026-01-01"));
  });

  // §4.3 — 빠진 열은 01로 채운다는 규칙은 휠·타이핑 모두 같다(새로 만들지 않는다).
  // 연도만 있는 픽커에서 연도를 타이핑해 확정하면 월·일이 각각 01로 정규화된
  // 값이 나가야 한다 — 값 형식은 항상 YYYY-MM-DD다.
  it("연도만 있는 픽커에서 연도를 타이핑하면 월·일이 01로 정규화된다", () => {
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="회계 연도" value="2026-07-12" fields={["year"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "회계 연도" }));
    const year = screen.getByRole("group", { name: "연도 2026" });
    for (const digit of ["2", "0", "3", "1"]) fireEvent.keyDown(year, { key: digit });
    expect(onChange).toHaveBeenLastCalledWith("2031-01-01");
  });
});

describe("DateWheelPicker 리뷰 Finding 3 — shiftDateValue의 말일 계산과 연도 폭주", () => {
  // shiftDateValue의 day/year/month 세 분기가 모두 new Date(Date.UTC(year, ...))로
  // 말일을 구했다. 이 API는 0~99년을 1900년대로 재매핑하므로(ECMA-262), 연도
  // 0(윤년)을 1900년(평년)으로 잘못 읽어 2/29를 2/28로 잘라낸다.
  // dateWheelTyping.ts의 lastDayOf(setUTCFullYear 3-인자 호출)는 이 재매핑을
  // 하지 않는다 — withUnitValue는 이미 이걸 쓰고, shiftDateValue는 몰랐다.
  // 타이핑으로 연도 네 자리를 곧장 쳐 넣을 수 있게 되면서, 예전엔 화살표 수천
  // 번이 필요하던 이 값에 몇 키만으로 닿는다.
  it("연도 0000에서 월을 다음으로 옮기면 윤년 2/29를 안다", () => {
    render(<ControlledDateWheel initialValue="0000-01-29" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "월 다음" }));
    expect(trigger.textContent).toBe("0000. 02. 29.");
  });

  // 연도가 10000 이상이 되면 Date#toISOString()이 확장 ISO 표기
  // (+010000-07-12)로 바뀐다. shiftDateValue의 .slice(0, 10)은 그 표기의 앞
  // 10글자("+010000-07")만 자르고, normalizeToFields가 이걸 "-"로 쪼개면 세
  // 번째 조각(일)이 undefined가 되어 "+010000-07-undefined"가 onChange로
  // 나간다. shiftedFrom이 validDateValue로 이 결과를 걸러내지 않으면, 연도
  // 9999에서 네 자리를 타이핑한 뒤 ↓ 한 번만으로 소비자에게 깨진 문자열이
  // 전달된다. 고친 뒤에는 그 걸음이 그냥 막힌 걸음(no-op)이어야 한다 —
  // §3.4.3처럼 "누를 수 없는 자리"를 만드는 대신, 이미 있는 "쓸 수 없는 값"
  // 신호(shiftedFrom의 null)를 그대로 쓴다.
  it("연도 9999에서 ↓를 누르면 10000으로 새지 않고 값이 그대로다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    fireEvent.click(trigger);
    const year = screen.getByRole("group", { name: "연도 2026" });
    for (const digit of ["9", "9", "9", "9"]) fireEvent.keyDown(year, { key: digit });
    await waitFor(() => expect(trigger.textContent).toBe("9999. 07. 12."));

    fireEvent.keyDown(year, { key: "ArrowDown" });
    expect(trigger.textContent).toBe("9999. 07. 12.");
  });
});

describe("DateWheelPicker 버퍼 확정과 폐기", () => {
  async function openAndType(initialValue: string, keys: string[]) {
    render(<ControlledDateWheel initialValue={initialValue} />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    const year = screen.getByRole("group", { name: /^연도/ });
    for (const key of keys) fireEvent.keyDown(year, { key });
    return { trigger, year };
  }

  it("연도 두 자리만 치고 →를 누르면 2000년대로 확정된다", async () => {
    const { trigger, year } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.keyDown(year, { key: "ArrowRight" });
    await waitFor(() => expect(trigger.textContent).toBe("2031. 07. 12."));
  });

  // 원래 한 테스트였다 — "숫자가 확정된다"(값 계산)와 "팝오버가 닫힌다"(Enter의 새
  // 분기)는 서로 다른 결함이다. expect()는 첫 실패에서 던지므로 함께 두면 뒤쪽
  // 결함의 킬력을 증명할 수 없다. 각자 분리한다.
  //
  // 초기값을 2026이 아니라 2020으로 둔다 — "26"을 쳤을 때 flushBuffer가 2000년대로
  // 읽어 2026이 되는 것이 이 테스트의 요점이다. 초기값이 이미 2026이면 flushTyping
  // 호출을 통째로 지워도(버퍼를 무시해도) 우연히 같은 값이 나와 이 assert가 죽지 않는다.
  it("Enter로 완료하면 치던 숫자가 확정된다", async () => {
    const { trigger, year } = await openAndType("2020-07-12", ["2", "6"]);
    fireEvent.keyDown(year, { key: "Enter" });
    await waitFor(() => expect(trigger.textContent).toBe("2026. 07. 12."));
  });

  it("Enter를 누르면 팝오버가 닫힌다", async () => {
    const { year } = await openAndType("2020-07-12", ["2", "6"]);
    fireEvent.keyDown(year, { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
  });

  // 리뷰 Finding 3 — Enter 분기는 flushTyping으로 확정한 뒤 `if (!value) onChange(baseValue)`를
  // 무조건 불렀다. `value`는 이 렌더의 클로저에 갇혀 있어, flushTyping의 onChange가 이미
  // 값을 확정했어도 핸들러가 도는 동안은 여전히 ""로 읽힌다 — 그래서 방금 확정한 숫자를
  // baseValue(오늘)가 곧바로 덮어썼다. ArrowUp/ArrowDown에서 이미 고친 것과 같은 결함
  // 계열이다(flushTyping의 주석 참고). 위 두 Enter 테스트는 모두 초기값이 있어 `!value`가
  // 항상 거짓이므로 이 경로를 건드리지 못한다 — 빈 값에서 시작하는 케이스가 필요하다.
  it("빈 값에서 Enter로 완료해도 치던 숫자가 살아남는다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 12, 12));   // 서울 기준 2026-07-12 정오 — baseValue의 월·일 출처
    render(<ControlledDateWheel initialValue="" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    fireEvent.click(trigger);
    const year = screen.getByRole("group", { name: /^연도/ });
    fireEvent.keyDown(year, { key: "3" });
    fireEvent.keyDown(year, { key: "1" });
    fireEvent.keyDown(year, { key: "Enter" });
    expect(trigger.textContent).toBe("2031. 07. 12.");
  });

  // 원래 한 테스트였다 — "팝오버가 닫힌다"(사전조건)와 "값을 그대로 둔다"(Task 7의
  // 폐기 결함 표면)는 서로 다르다. Escape의 setOpen(false)는 Task 7 이전부터 있던
  // 동작이라 이 작업 범위의 뮤테이션으로는 앞쪽을 못 죽인다 — 그래도 나눠 둔다.
  it("Escape를 누르면 팝오버가 닫힌다", async () => {
    const { year } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.keyDown(year, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
  });

  it("Escape는 치던 숫자를 버리고 값을 그대로 둔다", async () => {
    // Escape의 뜻은 "값을 바꾸지 않고 닫기"다. 치다 만 숫자를 확정하면 그 뜻과 어긋난다.
    const { trigger, year } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.keyDown(year, { key: "Escape" });
    await waitFor(() => expect(trigger.textContent).toBe("2026. 07. 12."));
  });

  it("↑는 버퍼를 확정한 뒤 그 값에서 한 칸 움직인다", async () => {
    // 이 컴포넌트에서 ArrowUp은 -1이다(handleColumnKey의 ArrowUp/ArrowDown 분기).
    // 버퍼를 무시하고 옛 값에서 움직이면 2025가 되므로 둘이 확실히 갈린다.
    const { trigger, year } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.keyDown(year, { key: "ArrowUp" });
    await waitFor(() => expect(trigger.textContent).toBe("2030. 07. 12."));   // 2031로 확정한 뒤 -1
  });

  it("월의 0 단독은 확정할 수 없으므로 버린다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(screen.getByRole("group", { name: "연도 2026" }), { key: "ArrowRight" });
    const month = await screen.findByRole("group", { name: "월 07" });
    fireEvent.keyDown(month, { key: "0" });
    fireEvent.keyDown(month, { key: "ArrowRight" });
    expect(trigger.textContent).toBe("2026. 07. 12.");
  });

  // 리뷰 Finding 2 — handleWheel은 typing을 건드리지 않았다. 스펙은 휠을 스와이프·행
  // 클릭과 같은 폐기 계열로 명시한다. 안 지키면: 연도에 "3"을 친 채로 같은 열에서
  // 휠을 굴려 값을 옮겨도(2026 -> 2027) 버퍼 "3"은 그대로 남고, Tab으로 떠날 때
  // flushTyping이 그 묵은 "3"을 2003으로 해석해 휠이 방금 맞춘 값을 조용히 덮어쓴다.
  it("휠을 굴리면 치던 숫자를 버린다", async () => {
    const { trigger, year } = await openAndType("2026-07-12", ["3"]);
    fireEvent.wheel(year, { deltaY: 100 });
    fireEvent.keyDown(year, { key: "Tab" });
    await waitFor(() => expect(trigger.textContent).toBe("2027. 07. 12."));
  });

  // 리뷰 Finding 1 — 완료 버튼의 onClick은 flushTyping을 부르지 않아 치던 숫자를
  // 그냥 버렸다. 스펙은 →·←·Tab·Shift+Tab·Enter와 나란히 완료 버튼을 확정 트리거로
  // 명시한다. Enter와 완료가 commitAndClose 하나를 공유하도록 고쳐 다시 갈라지지
  // 못하게 했다. 아래는 원래 한 테스트였다 — "숫자가 확정된다"(값 계산)와 "다시
  // 열어도 버퍼가 안 남는다"(렌더 상태)는 서로 다른 결함이므로 나눈다.
  it("완료 버튼을 누르면 치던 숫자가 확정된다", async () => {
    const { trigger } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(trigger.textContent).toBe("2031. 07. 12."));
  });

  it("완료 버튼으로 확정한 뒤 다시 열면 확정된 값이 보이고 남은 버퍼는 없다", async () => {
    const { trigger } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    // 정확한 이름("연도 2031")으로 찾으면, 확정이 아예 안 됐을 때(연도가 여전히 2026일 때)
    // getByRole이 "못 찾음"으로 던져 버려 아래 .selected 단언까지 못 가고 죽는다 — 그러면
    // 뮤테이션이 이 줄이 아니라 쿼리에서 죽어, 이 단언 자체는 실패해 본 적이 없는 게 된다.
    // 느슨한 정규식으로 찾아, 실패가 항상 .selected 텍스트 비교에서 나게 한다.
    const reopenedYear = screen.getByRole("group", { name: /^연도/ });
    expect(reopenedYear.querySelector(".date-wheel-values .selected")?.textContent).toBe("2031");
  });

  // 완료 버튼이 이제 flushTyping을 거치므로, 완료 테스트만으로는 포커스 이펙트의
  // `!open` 분기(:282)가 버퍼를 비우는지 더 이상 증명하지 못한다 — 완료 경로는
  // commitAndClose 자신이 이미 버퍼를 비운다. 바깥 클릭·뒤로가기는 flushTyping을
  // 전혀 거치지 않는 유일한 닫힘 경로라 :282의 안전망이 실제로 켜지는지는 이걸로만
  // 확인할 수 있다.
  it("바깥을 클릭해 닫으면 남아 있던 버퍼가 사라진다", async () => {
    const { trigger } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.pointerDown(document.body);   // 팝오버 밖에서 시작한 포인터 — closeOutside가 닫는다
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    const reopenedYear = screen.getByRole("group", { name: /^연도/ });
    expect(reopenedYear.querySelector(".date-wheel-values .selected")?.textContent).toBe("2026");
  });

  it("포인터로 컬럼을 누르면 버퍼를 버린다", async () => {
    const { year } = await openAndType("2026-07-12", ["3"]);
    fireEvent.pointerDown(year, { pointerId: 1, clientY: 80, buttons: 1 });
    expect(year.querySelector(".date-wheel-values .selected")?.textContent).toBe("2026");
  });

  // 리뷰 finding — Tab 분기 맨 앞의 flushTyping(unit)이 실제 버퍼를 상대로 실행되는
  // 테스트가 없었다. 기존 유일한 Tab keydown(휠 테스트 안)은 휠이 이미 typing을
  // 비운 뒤라 그 호출이 no-op으로 지나간다. 여기서는 → 테스트와 같은 모양으로,
  // 버퍼를 채운 채로 곧장 Tab을 눌러 flushTyping이 실제로 해석·확정하는지 본다.
  it("Tab이 치던 숫자를 확정한다", async () => {
    const { trigger, year } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.keyDown(year, { key: "Tab" });
    await waitFor(() => expect(trigger.textContent).toBe("2031. 07. 12."));
  });

  // 위 테스트에 얹는다 — Tab은 팝오버를 닫지 않고 다음 열로 초점만 옮기므로,
  // 확정 직후에도 방금 떠난 연도 열이 여전히 화면에 남아 있다. flushTyping이
  // setTyping(null)로 버퍼를 비우지 않으면, 행 렌더의
  // `buffered = offset === 0 && typing?.unit === unit ? typing.digits : null`가
  // unit이 여전히 "year"인 낡은 버퍼를 얹어, 확정된 "2031" 대신 치던 숫자
  // "31"을 그대로 보여준다. trigger.textContent는 `value` prop만 읽으므로 이
  // 결함을 못 잡는다 — 남겨진 열 자신의 선택 행을 봐야 한다. 트리거 문구(값
  // 계산)와 남겨진 열의 렌더(버퍼 정리)는 서로 다른 결함이므로 나눈다. 뮤테이션
  // 이후에도 실패가 이 assert 줄 자체에서 나도록, 새로 role 조회를 하지 않고
  // openAndType이 이미 쥐고 있는 `year` 노드 참조를 그대로 쓴다.
  it("Tab으로 떠난 뒤 남겨진 연도 열은 버퍼가 아니라 확정된 값을 보여준다", async () => {
    const { year } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.keyDown(year, { key: "Tab" });
    expect(year.querySelector(".date-wheel-values .selected")?.textContent).toBe("2031");
  });

  // Shift+Tab은 어떤 테스트에서도 눌린 적이 없었다. 첫 열에서는 이동이 실패해
  // (moveColumn이 false를 돌려줘) 팝오버를 닫아 버리므로, 버퍼 확정만 따로 보려면
  // 이동이 성공하는 둘째 열(월)에서 시작해야 한다. 월의 첫 자리 "1"은 soloFloor(2)
  // 미만이라 곧장 확정되지 않고 버퍼로 남는다(dateWheelTyping.ts의 typeDigit 참고).
  it("Shift+Tab이 치던 숫자를 확정한다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(screen.getByRole("group", { name: "연도 2026" }), { key: "ArrowRight" });
    const month = await screen.findByRole("group", { name: "월 07" });
    fireEvent.keyDown(month, { key: "1" });
    fireEvent.keyDown(month, { key: "Tab", shiftKey: true });
    await waitFor(() => expect(trigger.textContent).toBe("2026. 01. 12."));
  });
});

describe("DateWheelPicker 단축키", () => {
  // 원래 한 테스트였다 — allowClear 케이스와 non-allowClear 케이스는 서로 다른
  // 결함이다(하나는 "지운다"를 증명하고 하나는 "allowClear 없이는 안 지운다"는
  // 게이트를 증명한다). expect()는 첫 실패에서 던지므로 함께 두면 뒤쪽 결함의
  // 킬력을 증명할 수 없다. 각자 분리한다.
  it("Delete가 allowClear일 때 값을 비운다", () => {
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="종료일" value="2026-07-12" onChange={onChange} allowClear />);
    const trigger = screen.getByRole("button", { name: "종료일" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Delete" });
    expect(onChange).toHaveBeenCalledWith("");
  });

  // 주의: 이 테스트는 Delete를 아예 처리하지 않는 구현에서도 우연히 통과한다
  // (onChange가 애초에 안 불리므로). 이 assert 하나만으로는 "allowClear 게이트가
  // 실제로 동작한다"는 것을 증명하지 못한다 — 그 증명은 handleShortcut의 Delete
  // 분기에서 `&& allowClear`를 떼어내는 뮤테이션으로 한다(리포트의 뮤테이션 표 참고).
  it("Delete는 allowClear가 아니면 무시된다", () => {
    const blocked = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={blocked} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "거래 날짜" }), { key: "Delete" });
    expect(blocked).not.toHaveBeenCalled();
  });

  it("비활성이면 Delete도 무시한다", () => {
    // handleShortcut을 disabled 검사보다 앞에 두면(브리프의 "맨 앞"을 문자 그대로
    // 따르면) 비활성 필드도 Delete에 반응하게 된다. 이 저장소의 기존 불변식(비활성은
    // 어떤 키에도 반응하지 않는다 — "비활성이면 어느 키로도 열리지 않는다")과 어긋나므로
    // disabled 검사를 그대로 맨 앞에 두고 handleShortcut을 그다음에 부른다.
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={onChange} allowClear disabled />);
    fireEvent.keyDown(screen.getByRole("button", { name: "거래 날짜" }), { key: "Delete" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Ctrl+; 가 오늘로 설정한다 — 닫혀 있을 때도", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T03:00:00Z"));
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-01-01" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "거래 날짜" }), { key: ";", code: "Semicolon", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("2026-07-12");
  });

  it("Ctrl+; 는 문자가 아니라 키 위치로 판정한다", () => {
    // 배열에 따라 `;`가 Shift 조합이 되는 키보드가 있다.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T03:00:00Z"));
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-01-01" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "거래 날짜" }), { key: "Unidentified", code: "Semicolon", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("2026-07-12");
  });

  // 브리프의 두 테스트는 트리거(닫힘 상태, handleTriggerKeyDown)로만 Ctrl+;를 쏜다.
  // 그런데 스펙 §3은 "닫힘·열림" 둘 다라고 명시하고, Step 4는 handleColumnKey에도
  // 같은 순서 함정이 있다고 콕 짚는다 — handleColumnKey 쪽만 순서가 틀려도 트리거
  // 테스트 두 개는 계속 통과한다. 열 쪽 경로를 직접 쏴서 그 결함도 잡는다.
  it("Ctrl+;는 팝오버가 열려 있을 때 열에서도 동작한다", () => {
    // 이 파일의 다른 가짜 타이머 테스트와 같은 동기 관용구를 쓴다(예: "팝오버의 오늘
    // 버튼이…") — fireEvent.click + 동기 쿼리. await waitFor/findByRole을 가짜
    // 타이머와 섞으면 RTL 버전에 따라 어긋날 수 있다.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T03:00:00Z"));
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-01-01" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "거래 날짜" }));
    const year = screen.getByRole("group", { name: "연도 2026" });
    fireEvent.keyDown(year, { key: ";", code: "Semicolon", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("2026-07-12");
  });

  // 이월 finding(Task 7 끝) — 오늘·비우기 버튼의 onClick은 handleShortcut과 달리
  // setTyping(null)을 안 불러, 같은 뜻의 단축키와 버튼이 다르게 굴었다. 버퍼를 안
  // 지우면 버튼이 방금 설정한 값 위에 옛 버퍼가 화면에 남는다 — 이후 Tab 등으로
  // 그 버퍼가 해석되면 버튼이 방금 맞춘 값을 도로 덮어쓸 수 있다.
  it("오늘 버튼을 누르면 치던 숫자를 버린다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T03:00:00Z"));   // 서울 기준 오늘 = 2026-07-12
    render(<ControlledDateWheel initialValue="2020-01-01" />);
    fireEvent.click(screen.getByRole("button", { name: "거래 날짜" }));
    const year = screen.getByRole("group", { name: "연도 2020" });
    fireEvent.keyDown(year, { key: "3" });   // 버퍼 "3" — 연도는 네 자리라야 확정된다

    fireEvent.click(screen.getByRole("button", { name: "오늘" }));

    // 버퍼가 안 지워지면 이 행은 여전히 버퍼 "3"을 보여준다(buffered ?? ... 가 "3"에서
    // 멈춘다). 지워지면 방금 설정된 값의 연도 "2026"이 보인다.
    expect(year.querySelector(".date-wheel-values .selected")?.textContent).toBe("2026");
  });

  it("비우기 버튼을 누르면 치던 숫자를 버린다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T03:00:00Z"));   // 서울 기준 오늘 = 2026-07-12
    render(<ControlledDateWheel initialValue="2020-01-01" allowClear />);
    fireEvent.click(screen.getByRole("button", { name: "거래 날짜" }));
    const year = screen.getByRole("group", { name: "연도 2020" });
    fireEvent.keyDown(year, { key: "3" });

    fireEvent.click(screen.getByRole("button", { name: "비우기" }));

    // 비우기는 값을 ""로 만들고, baseValue는 값이 비어 있으면 오늘로 대체된다(:203) —
    // 버퍼가 안 지워지면 이 행은 여전히 버퍼 "3"을 보여준다.
    expect(year.querySelector(".date-wheel-values .selected")?.textContent).toBe("2026");
  });

  // labels.hint의 기본값이 타이핑을 포함해 바뀐다(PRINCIPLES §11 문서화 대상) —
  // 소스만 바꾸고 테스트가 없으면 다음 사람이 조용히 되돌려도 아무도 모른다.
  it("팝오버 안내 문구 기본값이 타이핑까지 안내한다", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "거래 날짜" }));
    const heading = screen.getByRole("dialog", { name: "거래 날짜 선택" }).querySelector(".date-wheel-heading span");
    expect(heading?.textContent).toBe("휠·스와이프·방향키·숫자 입력 · Ctrl+; 오늘");
  });

  // 리뷰 Finding 4 — title은 마우스 hover에만 뜬다. 단축키가 필요한 사람(키보드
  // 전용 사용자, 스크린리더 사용자)에게는 title이 안 보인다. aria-keyshortcuts는
  // 이 문제를 위해 만들어진 ARIA 속성이다. 값을 문자열로 고정해, "Control+;"가
  // "Semicolon" 같은 다른 표기로 새지 않게 한다. 버튼 셋이 각자 독립된 결함
  // 표면이므로(하나가 죽어도 나머지의 킬력을 증명할 수 있어야 한다) 나눈다.
  it("오늘 버튼의 aria-keyshortcuts가 고정돼 있다", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "거래 날짜" }));
    expect(screen.getByRole("button", { name: "오늘" }).getAttribute("aria-keyshortcuts")).toBe("Control+; Meta+;");
  });

  it("비우기 버튼의 aria-keyshortcuts가 고정돼 있다", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={() => undefined} allowClear />);
    fireEvent.click(screen.getByRole("button", { name: "거래 날짜" }));
    expect(screen.getByRole("button", { name: "비우기" }).getAttribute("aria-keyshortcuts")).toBe("Delete");
  });

  it("완료 버튼의 aria-keyshortcuts가 고정돼 있다", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "거래 날짜" }));
    expect(screen.getByRole("button", { name: "완료" }).getAttribute("aria-keyshortcuts")).toBe("Enter");
  });
});

// 오너가 A/B/D로 비교하던 완료 피드백(css/surfaces.css .dropdown-value-commit)이 실제
// 동작으로 착지했다. 계약은 PRINCIPLES.md §12 "완료(커밋) 피드백". CSS 쪽 계약(재생
// 내용·reduced-motion)은 tests/Select.test.tsx에 한 번만 있다 — 여기서는 "언제 클래스가
// 붙는가"만 본다.
describe("DateWheelPicker 완료 피드백(커밋 애니메이션)", () => {
  // key={commitPulse}가 커밋마다 트리거 안 span을 리마운트하므로 매번 새로 조회한다 —
  // 커밋 전에 잡아 둔 참조는 떨어져 나간 옛 노드를 계속 가리킨다.
  function hasCommitClass(trigger: HTMLElement) {
    return trigger.querySelector("span")?.classList.contains("dropdown-value-commit") ?? false;
  }

  it("타이핑한 값이 Enter로 확정되면(값이 바뀌면) 커밋 클래스가 붙는다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const year = await screen.findByRole("group", { name: /^연도/ });
    fireEvent.keyDown(year, { key: "3" });
    fireEvent.keyDown(year, { key: "1" });
    fireEvent.keyDown(year, { key: "Enter" });

    await waitFor(() => expect(trigger.textContent).toBe("2031. 07. 12."));
    expect(hasCommitClass(trigger)).toBe(true);
  });

  // 리뷰 아이템 2 — 확정된 값이 세션 시작 값(트리거가 포커스를 얻었거나 팝오버가 닫힌
  // 마지막 순간의 value — 설계 스펙 §6.4)과 같으면
  // (아무것도 안 바꾸고 완료) 신호가 없다. 이 테스트는 세션 시작 값과 커밋 시점 값이
  // 우연히 같은 경우라, sessionStartValueRef가 제대로 채워지는지까지는 증명하지
  // 못한다(둘 다 "2026-07-12"이므로) — 그 증명은 뮤테이션 표의 별도 뮤테이션이 한다.
  it("아무것도 바꾸지 않고 완료하면(값이 그대로면) 커밋 클래스가 붙지 않는다", () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(hasCommitClass(trigger)).toBe(false);
  });

  // "완료"가 아니라 훑는 동작이다 — 이 컨트롤은 화살표 한 번마다도 값을 커밋하므로
  // (commitShift, commitAndClose가 아니다), 매번 반짝이면 신호가 아니라 소음이 된다(§12).
  it("화살표로 값을 옮기면(완료를 누르지 않으면) 커밋 클래스가 붙지 않는다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const year = await screen.findByRole("group", { name: /^연도/ });
    fireEvent.keyDown(year, { key: "ArrowUp" });

    expect(hasCommitClass(trigger)).toBe(false);
  });

  // 오너가 실측으로 잡은 결함(fix round 1) — 화살표는 즉시 onChange를 부르므로, 완료를
  // 누르는 순간엔 이미 value가 화살표로 옮긴 값으로 갱신돼 있다. 커밋 시점 value와
  // 비교했다면 "안 바뀌었다"고 잘못 읽어 이 케이스에서 신호가 영영 안 떴다 — 세션
  // 시작 값(§6.4: 트리거 포커스·팝오버 닫힘에 찍힌다. 이 시퀀스에서는 trigger.focus()가
  // 찍은 값)과 비교해야 잡힌다.
  it("화살표로 값을 옮긴 뒤 완료하면(세션 시작 값과 달라지면) 커밋 클래스가 붙는다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const year = await screen.findByRole("group", { name: /^연도/ });
    fireEvent.keyDown(year, { key: "ArrowUp" });   // commitShift — value가 곧바로 2025-07-12로 바뀐다
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(hasCommitClass(trigger)).toBe(true);
  });

  it("휠을 굴리면 커밋 클래스가 붙지 않는다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const year = await screen.findByRole("group", { name: /^연도/ });
    fireEvent.wheel(year, { deltaY: 100 });

    expect(hasCommitClass(trigger)).toBe(false);
  });
});

// 오너 실측(라이브 데모, allowClear 필드): 오늘 → 비우기 → 완료 순서로 누르면 트리거가
// "2026. 08. 06." → "날짜 선택" → "2026. 08. 06."로, 지운 값이 완료에서 되살아났다.
// 원인은 commitAndClose의 "비어 있으면 baseValue로 채운다" 폴백(:391 부근)이 "처음부터
// 빈 값으로 열었다"와 "방금 지웠다"를 구분하지 못해서다 — main 브랜치에도 있던 결함
// (git show main:src/DateWheelPicker.tsx의 같은 줄), 이 브랜치가 만든 회귀가 아니다.
// 고친 방식은 보수적이다: 비우기는 그대로 팝오버를 닫지 않고, 대신 컴포넌트가 "이번에
// 지웠다"를 기억해(clearedRef) 완료가 그 기억이 있으면 되살림 분기를 건너뛴다.
describe("DateWheelPicker 비우기 뒤 완료가 지운 값을 되살리지 않는다", () => {
  // 단언 하나만 둔다 — expect()는 첫 실패에서 던지므로, 오늘·비우기 단계에도 단언을
  // 끼우면 가드를 제거하는 뮤테이션이 그 앞 줄에서 먼저 죽어 이 시퀀스가 실제로
  // 증명하려는 마지막 단계("완료가 되살리지 않는다")를 못 증명한다 — 이 파일 :732-734가
  // 이미 겪은 함정과 같다.
  it("오늘 → 비우기 → 완료 순서로 눌러도(오너가 실측한 시퀀스) 지운 상태가 유지된다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T03:00:00Z"));   // 서울 기준 오늘 = 2026-08-06
    render(<ControlledDateWheel initialValue="" allowClear />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    fireEvent.click(screen.getByRole("button", { name: "비우기" }));
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(trigger.textContent).toBe("날짜 선택");
  });

  // 비우기 버튼과 나란한 두 번째 지우기 경로. 서로 다른 코드 줄(handleShortcut의 Delete
  // 분기)이 같은 기억을 남기는지 별도로 증명한다 — 뮤테이션 표 참고.
  it("Delete로 지운 경우도 완료가 값을 되살리지 않는다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T03:00:00Z"));
    render(<ControlledDateWheel initialValue="" allowClear />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    fireEvent.keyDown(screen.getByRole("group", { name: /^연도/ }), { key: "Delete" });
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(trigger.textContent).toBe("날짜 선택");
  });

  // "지운 기억"은 다음 세션까지 넘어가면 안 된다 — 그래야 "값 없이 처음 연 픽커에서
  // 완료를 누르면 휠에 보이는 날짜를 확정한다"는 폴백의 원래 의도가 살아남는다.
  //
  // **이 시퀀스의 리셋은 아래 두 번째 열기가 아니라 그 앞의 완료가 닫은 순간에 온다**
  // (설계 스펙 §6.4 — 여는 순간에는 아무것도 리셋하지 않는다). 그래서 이 테스트는 이제
  // 닫힘 쪽 clearedRef 리셋의 유일한 파수꾼이다.
  it("지우고 닫았다가 다시 열어 아무것도 안 건드리고 완료하면, 휠에 보이는 날짜를 다시 확정한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T03:00:00Z"));
    render(<ControlledDateWheel initialValue="" allowClear />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "비우기" }));
    fireEvent.click(screen.getByRole("button", { name: "완료" }));   // 닫힌다 — clearedRef가 true인 채

    fireEvent.click(trigger);   // 다시 연다 — 이 클릭은 아무것도 리셋하지 않는다(위 완료가 이미 했다)
    fireEvent.click(screen.getByRole("button", { name: "완료" }));   // 아무것도 안 건드리고 바로 완료

    expect(trigger.textContent).toBe("2026. 08. 06.");
  });
});

// 설계 스펙 §6.4 — 세션 기준값(sessionStartValueRef·clearedRef)의 수명.
//
// 계약: 기준값은 **트리거가 포커스를 얻을 때(focusin)**와 **팝오버가 닫힐 때** 두
// 지점에서 찍는다. **여는 순간에는 절대 찍지 않는다.** focusout에는 아무것도 하지
// 않는다 — 지금은 팝오버를 여는 것 자체가 포커스를 열로 옮기므로(포커스 이펙트),
// focusout에서 버리면 세션 도중에 기준값이 사라진다.
//
// 이 블록의 테스트는 전부 "닫힌 채 조작 → 열기 → 완료" 순서를 거친다. 팝오버를 먼저
// 여는 fixture로는 결함이 하나도 재현되지 않는다 — 리셋이 옳은 값으로 일어나기 때문이다.
describe("DateWheelPicker 세션 수명", () => {
  // 트리거 문구가 아니라 value 자체를 읽는다 — 되살아난 값이 실패 메시지에 그대로
  // 찍히게 하려는 것이다. 바깥 버튼은 "포커스를 잃었다 되찾는" 경로를 만드는 용도다.
  function ControlledDateWheelValue({ initialValue }: { initialValue: string }) {
    const [value, setValue] = useState(initialValue);
    return <>
      <DateWheelPicker ariaLabel="거래 날짜" value={value} onChange={setValue} allowClear />
      <button type="button">바깥</button>
      <span data-testid="value">{value === "" ? "(빈값)" : value}</span>
    </>;
  }

  // 재현된 결함(스펙 §6.4(2)): 닫힌 채 Delete로 지우면 clearedRef가 true가 되는데,
  // 곧이어 ↓로 열면 open을 보는 리셋 이펙트가 그것을 false로 되돌려, 완료가
  // "값 없이 처음 연 픽커"로 오인하고 지운 값을 baseValue(오늘)로 되살린다.
  //
  // `trigger.focus()`가 반드시 있어야 한다. 실제 키보드 사용자는 트리거에 포커스를 둔
  // 채 Delete를 친다. 포커스가 없으면 팝오버가 열리며 포커스를 열로 가져가도 트리거에서
  // focusout이 나지 않아, **스펙 §6.4가 이름 대고 금지한 focusout 리셋을 넣어도 이
  // 테스트가 초록으로 남는다**(리뷰 뮤테이션 X14로 실측).
  it("닫힌 채 Delete로 지운 값을 완료가 되살리지 않는다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T03:00:00Z"));   // 서울 기준 오늘 = 2026-08-09
    render(<ControlledDateWheelValue initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });

    trigger.focus();                                   // 키보드 사용자의 실제 출발 상태
    fireEvent.keyDown(trigger, { key: "Delete" });      // 닫힌 채 지운다 — clearedRef = true
    fireEvent.keyDown(trigger, { key: "ArrowDown" });   // 연다 — 여기서 리셋되면 안 된다
    fireEvent.keyDown(screen.getByRole("group", { name: /^연도/ }), { key: "Enter" });

    expect(screen.getByTestId("value").textContent).toBe("(빈값)");
  });

  // 대조군 — 지우는 시점만 다르다(열고 나서 비우기). 이건 리셋 이펙트가 이미 돈
  // 뒤에 지우는 경로라 고치기 전에도 통과한다. 이 짝이 있어야 "리셋 시점이 틀렸다"와
  // "clearedRef 자체가 틀렸다"를 구분할 수 있다.
  it("팝오버를 연 뒤 비우기로 지운 값도 완료가 되살리지 않는다 — 대조군", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T03:00:00Z"));
    render(<ControlledDateWheelValue initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });   // 먼저 연다
    fireEvent.click(screen.getByRole("button", { name: "비우기" }));
    fireEvent.keyDown(screen.getByRole("group", { name: /^연도/ }), { key: "Enter" });

    expect(screen.getByTestId("value").textContent).toBe("(빈값)");
  });

  // focusin 쪽 리셋 — 위 두 테스트로는 증명되지 않는다. jsdom에서 fireEvent.click은
  // 포커스를 옮기지 않으므로 기존 테스트들의 리셋은 전부 "닫힘" 쪽에서 온다. 이건
  // 컨트롤을 떠났다 돌아오는 경로라 닫힘이 한 번도 일어나지 않는다.
  it("포커스를 잃었다 되찾으면 '지웠다' 기억이 리셋된다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T03:00:00Z"));
    render(<ControlledDateWheelValue initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Delete" });                   // 닫힌 채 지운다
    screen.getByRole("button", { name: "바깥" }).focus();            // 컨트롤을 떠난다
    trigger.focus();                                                 // 다시 들어온다 — 여기서 리셋
    fireEvent.keyDown(trigger, { key: "ArrowDown" });                // 연다
    fireEvent.click(screen.getByRole("button", { name: "완료" }));   // 아무것도 안 건드리고 완료

    // 새 세션이므로 "값 없이 처음 연 픽커"의 원래 의도대로 휠에 보이는 날짜를 확정한다.
    expect(screen.getByTestId("value").textContent).toBe("2026-08-09");
  });

  // focusin 쪽 기준값 스탬프. 마운트와 닫힘에서도 찍히므로, 그 둘로는 닿지 않는 값을
  // 만들어야 갈린다 — 닫힌 채 Ctrl+;로 value를 바꾸면 마운트 스탬프(2026-07-12)와
  // 지금 value(2026-08-09)가 갈라진다. 재진입이 기준값을 다시 찍어야 "재진입 뒤로는
  // 아무것도 안 바꿨다"가 성립한다.
  //
  // 신호는 classList로 보지 않는다 — 이전 확정의 클래스가 남아 거짓 통과한다.
  // key={commitPulse}가 바뀌면 span이 리마운트되므로 **노드 신원**으로 본다.
  it("포커스를 되찾은 뒤 아무것도 바꾸지 않고 완료하면 확정 신호가 뜨지 않는다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T03:00:00Z"));
    render(<ControlledDateWheelValue initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: ";", code: "Semicolon", ctrlKey: true });   // 닫힌 채 오늘로
    screen.getByRole("button", { name: "바깥" }).focus();
    trigger.focus();                                    // 기준값이 2026-08-09로 다시 찍혀야 한다
    fireEvent.keyDown(trigger, { key: "ArrowDown" });   // 연다
    const before = trigger.querySelector("span");
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(trigger.querySelector("span")).toBe(before);
  });

  // 위 테스트의 **양성** 짝. 스펙 §6.4(1)이 겨냥한 결함 그 자체를 고정한다: 닫힌 채 값을
  // 바꾼 사용자가 열어서 완료했을 때 확정 신호를 보는가.
  //
  // 이게 없으면 **닫힘 스탬프는 그대로 두고 여는 순간 sessionStartValueRef만 찍는**
  // 뮤테이션이 스위트 전체를 통과한다(리뷰 뮤테이션 X2로 실측). 위 음성 테스트는 재진입
  // 스탬프가 이미 열림 스탬프와 같은 값을 만들어 놓아 갈리지 않기 때문이다 — 여기서는
  // 재진입 없이 곧바로 열어야 "여는 순간에는 찍지 않는다"만 남는다.
  //
  // 시간을 고정한다. 오늘이 하필 2026-07-12인 날에는 Ctrl+;가 값을 안 바꿔 신호가 안 뜨고
  // 이 테스트가 그 하루만 빨개진다.
  it("닫힌 채 Ctrl+;로 바꾼 값을 열어서 완료하면 확정 신호가 뜬다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T03:00:00Z"));
    render(<ControlledDateWheelValue initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });

    trigger.focus();                                                             // 기준값 = 2026-07-12
    fireEvent.keyDown(trigger, { key: ";", code: "Semicolon", ctrlKey: true });   // 닫힌 채 오늘로
    const before = trigger.querySelector("span");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });                            // 연다 — 찍으면 안 된다
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(trigger.querySelector("span")).not.toBe(before);
  });

  // 닫힘 쪽 스탬프가 왜 필요한가 — 안 찍으면 한 번 포커스한 동안 두 번째로 완료할 때
  // 아무것도 안 바꿨는데 신호가 뜬다(기준값이 아직 첫 진입 값이라서).
  //
  // 아래 두 테스트는 같은 시퀀스의 두 단계를 각각 본다. 한 블록에 넣으면 첫 단언이
  // 터질 때 두 번째가 실행조차 되지 않아, 정작 증명하려는 "두 번째 완료"를 못 본다.
  //
  // **await·waitFor를 넣지 마라.** commitAndClose는 requestAnimationFrame으로 트리거에
  // 포커스를 되돌리고, 그 focus가 onFocus를 불러 기준값을 다시 찍는다 — 두 완료 사이에
  // rAF가 흐르면 닫힘 스탬프를 지운 뮤테이션이 그 rAF에 구조돼 초록으로 남는다.
  // 동기 블록 안에서는 rAF가 돌지 않는다.
  it("한 번 포커스한 동안 첫 완료에는 확정 신호가 뜬다", () => {
    render(<ControlledDateWheelValue initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const before = trigger.querySelector("span");
    fireEvent.keyDown(screen.getByRole("group", { name: /^연도/ }), { key: "ArrowUp" });   // 2025로
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(trigger.querySelector("span")).not.toBe(before);
  });

  it("한 번 포커스한 동안 두 번째 완료에는 확정 신호가 뜨지 않는다", () => {
    render(<ControlledDateWheelValue initialValue="2026-07-12" />);
    const trigger = screen.getByRole("button", { name: "거래 날짜" });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("group", { name: /^연도/ }), { key: "ArrowUp" });   // 2025로
    fireEvent.click(screen.getByRole("button", { name: "완료" }));   // 1회차 — 값이 바뀌었으므로 신호가 뜬다
    const afterFirst = trigger.querySelector("span");

    // **전제 가드.** 이 테스트의 킬력은 "두 완료 사이에 rAF가 흐르지 않는다"에 통째로
    // 걸려 있다(위 주석). 나중에 누가 await를 하나 끼우면 이 테스트는 조용히 초록으로
    // 남으면서 아무것도 증명하지 않게 되므로, 그 전제가 깨지는 순간 시끄럽게 실패하도록
    // 여기서 못박는다 — 완료 직후 rAF 전에는 포커스가 아직 트리거로 안 돌아와 있다.
    //
    // 단언이 둘이지만 단락 문제가 아니다. 이건 독립된 계약이 아니라 **아래 단언의
    // 전제**이고, 이게 터지면 아래 단언은 어차피 아무 뜻이 없다. 순서도 시퀀스 중간이라
    // 아래 단언은 전제가 성립하는 모든 세계에서 그대로 실행된다.
    expect(document.activeElement).not.toBe(trigger);

    fireEvent.keyDown(trigger, { key: "ArrowDown" });                // 2회차 — 다시 연다
    fireEvent.click(screen.getByRole("button", { name: "완료" }));   // 아무것도 안 건드리고 완료

    expect(trigger.querySelector("span")).toBe(afterFirst);
  });
});

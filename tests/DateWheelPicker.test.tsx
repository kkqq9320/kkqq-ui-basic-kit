// @vitest-environment jsdom
//
// 원본 frontend/src/components/DateWheelPicker.test.tsx를 그대로 옮겼습니다.
// 접근성 이름이 원본과 100% 같으므로, 이 테스트가 통과하면 추출 과정에서
// 동작이 바뀌지 않았다는 증거가 됩니다. 아래쪽에 props 파라미터화 테스트를 더했습니다.

import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateWheelPicker, DEFAULT_DATE_WHEEL_LABELS, type DateWheelLabels, type DateWheelUnit } from "../src/DateWheelPicker";
import { instantModel, type WheelUnit } from "../src/model/instant";
import { setHourFormat } from "../src/settings";
import { Dialog } from "../src/Dialog";
import datePickerCssSource from "../css/date-picker.css?raw";
import tokensCssSource from "../css/tokens.css?raw";

// vi.restoreAllMocks()가 필요합니다 — "지금 버튼이 시각을 가진 값에서도 열 모션을
// 만든다" 검사가 instantModel(모듈 싱글턴)에 vi.spyOn을 건다. 그 안의
// nowSpy.mockRestore()/shiftSpy.mockRestore()는 it 본문 맨 끝 줄이라, 그 위 어느
// expect()든 던지면 건너뛰어져 스파이가 그대로 살아남는다 — instantModel은 파일
// 전체가 공유하는 하나의 객체라 그 뒤 테스트로 샌다(전체 브랜치 리뷰 F-2 지적).
// `hourFormat`은 모듈 스코프 전역이라(설계 스펙 §11) 검사 사이에 샌다 — 3단계
// 블록 하나가 12시간제로 두고 끝나면 그 뒤 스위트 전체가 12시간제로 돈다.
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); setHourFormat("24"); });

/**
 * 트리거가 빈 자리를 채우는 문자 — **U+2012 FIGURE DASH**. 밑줄이 아니다(설계 스펙 §4.5).
 *
 * 코드포인트로 적는다. `‒`(U+2012)는 `-`(U+002D)·`–`(U+2013)와 화면에서 구별되지 않으므로,
 * 글리프를 그대로 쓰면 **틀린 문자가 눈에 안 띈 채 통과**할 수 있다. 순전히 폭 때문에 고른
 * 문자다 — 이 폰트에서 U+2012는 `wght` 축 전 구간에서 tabular 숫자와 어드밴스가 정확히
 * 같고(1132·1258·1341·1404), 밑줄은 16~20% 좁다.
 *
 * 소스의 `DATE_WHEEL_FILL`을 import하지 않고 **따로** 선언한다 — 같은 상수를 공유하면
 * 소스가 밑줄로 되돌아갈 때 테스트가 같이 따라가 아무것도 못 잡는다.
 */
const FILL = "\u2012";

/**
 * 이 컨트롤의 **유일한** 포커스 자리이자 키가 도착하는 유일한 자리다(설계 스펙 §6.2).
 * 열은 더 이상 `tabIndex`도 `onKeyDown`도 갖지 않으므로, 열에 보낸 키는 아무 핸들러에도
 * 닿지 않고 **조용히 사라진다** — 열을 겨냥한 `fireEvent.keyDown`이 남아 있으면 그 테스트는
 * "동작이 옳아서"가 아니라 "아무 일도 안 일어나서" 초록이 된다. 키는 전부 여기로 보낸다.
 *
 * **`ariaLabel`로 찾되 이름 전체와 맞추지 않는다.** 트리거의 접근성 이름이 이제
 * `"거래 날짜, 2026. 07. 12."`처럼 **값을 함께 싣기** 때문이다(설계 스펙 §8) — 완전 일치로
 * 찾으면 값이 바뀔 때마다 쿼리가 깨진다. 이 파일의 트리거 조회는 **전부 이 헬퍼를 지나간다**
 * (49곳을 기계로 옮겼다). 그래서 계약이 또 바뀌어도 고칠 자리가 여기 하나다.
 *
 * ⚠️ **이 헬퍼로는 "이름이 값을 싣는다"가 증명되지 않는다.** 접두사만 보므로 뒤에 무엇이
 * 붙든 — 아무것도 안 붙어도 — 똑같이 찾아낸다. 그 계약은 "트리거 접근성 이름" 블록이 따로
 * 고정한다. 이름을 여기서 완전 일치로 검사하면 안 되는 이유도 같다: 이름이 안 맞아 쿼리가
 * 던지는 것은 **단언 실패가 아니라 쿼리 실패**라, 엉뚱한 테스트가 엉뚱한 줄에서 죽는다.
 */
function fieldOf(name: string) {
  return screen.getByRole("button", { name: (accessibleName: string) => accessibleName === name || accessibleName.startsWith(`${name}, `) });
}

/** 지금 활성인 세그먼트의 unit. 없으면 null.
 *  `.active` 클래스는 포커스와 무관하게 붙는다 — 포커스에 따라 감추는 일은 CSS가 한다
 *  (css/date-picker.css의 `.date-wheel-trigger:focus-within …`). 그래서 이 헬퍼는
 *  "화면에 보이는가"가 아니라 "컴포넌트가 어느 세그먼트를 활성으로 보고 있는가"를 읽는다. */
function activeSegment(): string | null {
  return document.querySelector(".date-wheel-segment.active")?.getAttribute("data-unit") ?? null;
}

/**
 * 포인터 이벤트를 **속성이 실제로 실린 채** 도착하게 보낸다.
 *
 * ⚠️ **이 jsdom에는 `PointerEvent` 생성자가 없다.** 직접 쟀다 —
 * `typeof PointerEvent === "undefined"`이고 `MouseEvent`는 `function`이다. 그래서
 * `fireEvent.pointerDown(el, { pointerId, clientY, buttons })`는 RTL이 `Event`로 폴백해
 * **넘긴 속성을 전부 조용히 버린다**(핸들러에서 읽으면 셋 다 `undefined`다).
 *
 * 그 결과가 이 파일에서 무엇이었는지가 중요하다: `moveSwipe`의 첫 줄이
 * `if (buttons !== 1) return;`이라 **스와이프 본문이 그렇게 보낸 이벤트로는 단 한 번도
 * 실행되지 않았다.** 그래서 스와이프 감시자가 오랫동안 0개였다 — `moveSwipe` 본문과
 * `finishSwipe`의 커밋을 통째로 지워도 스위트가 전부 초록이었다(SEG Task 4 리뷰가 계측).
 *
 * **스와이프 동작을 건드리는 테스트는 반드시 이것을 쓸 것.** `fireEvent.pointerMove(el,
 * { clientY: 60 })`은 좌표가 전달된다고 믿게 만들지만 실제로는 아무 일도 일으키지 않는다.
 * (열 `onPointerDown`의 `setActiveUnit`·`setTyping(null)`은 이벤트 속성을 안 읽으므로
 * 평범한 `fireEvent.pointerDown`으로도 동작한다 — 그쪽 테스트는 그대로 둔다.)
 */
function pointer(type: "pointerDown" | "pointerMove" | "pointerUp", element: Element, props: Record<string, unknown>) {
  const event = createEvent[type](element);
  for (const [key, value] of Object.entries(props)) Object.defineProperty(event, key, { value, configurable: true });
  fireEvent(element, event);
}

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

    fireEvent.click(fieldOf("거래 날짜"));
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(onChange).toHaveBeenCalledWith("2026-07-12");
  });

  // ── `오늘`도 휠 이동이다 ─────────────────────────────────────────────────────
  //
  // 오너: "오늘 버튼 클릭했을 때 선택한 애니메이션이 없이 바뀌어서 어색해."
  // `오늘`은 `onChange`를 직접 불러 `markColumnMotion`을 안 탔으므로 값만 갈렸다.
  //
  // ⚠️ **§12의 "트리거 확정 펄스"와 다른 신호다.** §12는 `오늘`·`비우기`가 트리거의
  // 확정 펄스를 켜지 않는다고 정했고 그건 그대로다. 여기서 말하는 것은 **팝오버 안 휠의**
  // **슬라이드**다. 두 신호는 서로 다른 것을 뜻하고 충돌하지 않는다 — 하나는 "필드에
  // 값이 확정됐다", 다른 하나는 "이 열이 움직였다".
  //
  // 매핑을 **한 단언으로** 본다. 열마다 나눠 단언하면 `expect()`가 단락해 첫 열이 터질 때
  // 나머지가 실행조차 안 되고, 여기서 알고 싶은 것은 정확히 **세 열의 조합**이다
  // (바뀌는 열에만, 방향까지 맞게). 월은 안 바뀌므로 null이어야 한다 — 안 바뀐 열까지
  // 무장시키는 결함이 이 자리에서 잡힌다.
  it("오늘 버튼은 바뀌는 열에만, 방향에 맞는 휠 슬라이드를 붙인다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 12, 12));   // 2026-07-12
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2024-07-05" onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 날짜"));
    const columns = [...document.querySelectorAll(".date-wheel-column")];

    fireEvent.click(screen.getByRole("button", { name: "오늘" }));

    // 연 2024 -> 2026 (앞으로), 월 07 -> 07 (그대로), 일 05 -> 12 (앞으로)
    expect(columns.map((column) => /moving-\w+/.exec(column.className)?.[0] ?? null)).toEqual(["moving-next", null, "moving-next"]);
  });

  // 뒤로 가는 방향도 본다. 앞 테스트만 있으면 방향을 `"next"`로 고정하는 결함이 통과한다.
  it("과거로 가는 오늘도 방향이 맞는다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 12, 12));
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2028-09-30" onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 날짜"));
    const columns = [...document.querySelectorAll(".date-wheel-column")];

    fireEvent.click(screen.getByRole("button", { name: "오늘" }));

    expect(columns.map((column) => /moving-\w+/.exec(column.className)?.[0] ?? null)).toEqual(["moving-previous", "moving-previous", "moving-previous"]);
  });

  // 버튼과 Ctrl+;는 **같은 동작**이어야 한다. 이 킷에서 같은 규칙이 두 곳에 복제됐을 때
  // 갈라지지 않은 적이 없어서(`commitAndClose`가 생긴 이유가 그것이다) 짝으로 고정한다.
  it("Ctrl+;도 같은 슬라이드를 재생한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 12, 12));
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2024-07-05" onChange={() => undefined} />);
    const field = fieldOf("거래 날짜");
    fireEvent.click(field);
    const columns = [...document.querySelectorAll(".date-wheel-column")];

    fireEvent.keyDown(field, { code: "Semicolon", ctrlKey: true });

    expect(columns.map((column) => /moving-\w+/.exec(column.className)?.[0] ?? null)).toEqual(["moving-next", null, "moving-next"]);
  });
  // ── commitToday의 값 분해를 모델로 옮긴다 (2b-2) ────────────────────────────
  //
  // `commitToday`는 `numbersOf = value => value.split("-").map(Number)`와 고정
  // 인덱스 표(`{year:0,month:1,day:2,hour:3,minute:4,second:5}`)로 값을 해독한다.
  // `model.now()`가 시각까지 담은 값을 내주면(2b가 그 쪽으로 가는 길목이다) —
  // 예를 들어 "2026-08-12T03:00" — "-"로 쪼갠 마지막 조각이 "12T03:00"이 되고
  // `Number("12T03:00")`은 NaN이다. `markColumnMotion`의 `if (amount)` 가드가
  // NaN을 거짓으로 걸러 **조용히** 그 열을 움직이지 않는다 — 던지지 않으므로
  // 이 검사가 없으면 아무도 모른다.
  //
  // ⚠️ **fields가 date-only(연·월·일)인 한 이 버그는 재현되지 않는다** —
  // `numbersOf`가 만드는 배열과 고정 인덱스 표가 연·월·일 세 자리에서는 실제로
  // 늘 일치한다(둘 다 "YYYY-MM-DD"를 그 순서로 본다). 버그를 드러내려면 값에
  // 실제로 시각이 섞여야 하고, 그러려면 fields가 시각 단위를 하나 포함해야
  // 한다(계열이 "datetime"이 되어야 값 형식에 `T`가 붙는다).
  //
  // ⚠️ **Task 3(2b-3) 리뷰 F-2 — `model.shift`를 항등함수로 모킹하던 자리를
  // 걷었다.** 2b-2 시점에는 `shiftDateValue`/`dateWheelLabel`이 여전히
  // `value + "T00:00:00Z"`를 무조건 이어붙여서, `baseValue`에 이미 `T`가 있으면
  // "…T03:00T00:00:00Z"라는 깨진 문자열이 되고 `toISOString()`이 RangeError로
  // 던졌다(직접 재현해 확인했었다) — 그래서 `model.shift`를 항등함수로 바꿔 그
  // 경로를 아예 안 타게 막아야 했다. **그 문제의 원인(Date 기반 파싱)이 바로
  // 이 태스크(2b-3)에서 사라졌다** — `shiftDateValue`가 이제 `parseValue`/
  // `serializeValue`로 값을 드나들어 datetime 값에서도 안전하다. 스파이를 남겨
  // 두면 이 검사가 **진짜 `shiftDateValue`를 한 번도 안 밟는** 채로 남는다.
  it("지금 버튼이 시각을 가진 값에서도 열 모션을 만든다", () => {
    let mockedNow = "2024-07-05T03:00";
    const nowSpy = vi.spyOn(instantModel, "now").mockImplementation(() => mockedNow);

    render(<DateWheelPicker ariaLabel="거래 날짜" value="" fields={["year", "month", "day", "hour"]} onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 날짜"));
    const columns = [...document.querySelectorAll(".date-wheel-column")];

    mockedNow = "2026-07-12T04:00";
    // Task 3(2b-3)에서 "오늘" → "지금"으로 바뀌었다 — fields에 시간 열(hour)이
    // 있으면 버튼 라벨이 지금이 된다(설계 스펙 §9, Task 3 항목 4). 이 테스트 제목이
    // 이미 "지금 버튼"이라 적혀 있었던 것이 그 예고였다 — 쿼리만 뒤늦게 따라온다.
    fireEvent.click(screen.getByRole("button", { name: "지금" }));

    // 연 2024->2026(앞으로), 월 07->07(그대로), 일 05->12(앞으로). 시각 열(hour)은
    // Task 3부터 실제로 그려지지만(4번째 .date-wheel-column), 이 검사가 보는 것은
    // 여전히 처음 세 열의 모션뿐이다 — 그 열의 실제 라벨은 아래 "열 라벨" 블록이 고정한다.
    expect(columns.slice(0, 3).map((column) => /moving-\w+/.exec(column.className)?.[0] ?? null)).toEqual(["moving-next", null, "moving-next"]);

    nowSpy.mockRestore();
  });

  it("moves the year, month, and day by one with the step buttons", () => {
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={onChange} />);

    fireEvent.click(fieldOf("거래 날짜"));
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

  // 초판은 이름이 둘("hover만으로는 안 바뀐다" + "누른 열이 활성이 된다")이었고, **앞의 것이
  // 공허 통과였다** — `fireEvent.pointerMove`가 `buttons`를 못 싣는 탓에 가드가 막아서가
  // 아니라 애초에 아무 일도 안 일어나서 초록이었다(`pointer` 헬퍼 주석 참고). 그 계약은
  // 아래 "스와이프" 블록이 진짜로 지키고, 여기서는 킬이 확인된 쪽만 남긴다.
  it("activates the pressed column", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 날짜"));

    const year = screen.getByRole("group", { name: "연도 2026" });
    const month = screen.getByRole("group", { name: "월 07" });
    fireEvent.pointerDown(month, { pointerId: 11, clientY: 80, buttons: 1 });
    expect(month.classList.contains("active")).toBe(true);
    expect(year.classList.contains("active")).toBe(false);
    fireEvent.pointerCancel(month, { pointerId: 11 });
  });

  it("cycles month and day inside the selected year and month", () => {
    render(<ControlledDateWheel initialValue="2026-12-31" />);
    const trigger = fieldOf("거래 날짜");
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
    const trigger = fieldOf("거래 날짜");
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

    const trigger = fieldOf("Date");
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
    const trigger = fieldOf("날짜");
    expect(trigger.textContent).toBe("미정");
    // 트리거 안의 달력 아이콘은 장식이다 — 누를 수 있는 요소가 아니고 이름도 없다.
    expect(screen.queryByRole("button", { name: /오늘로 설정/ })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);   // 트리거 하나뿐
    // 아이콘은 트리거 버튼 안에 있어야 한다 — 클릭 타깃이 하나, 죽은 영역이 없다.
    const icon = trigger.querySelector(".date-wheel-trigger-icon");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  // 초판은 "완료 버튼으로 닫으면 트리거로 포커스를 **되돌리되** 스크롤 위치는 건드리지
  // 않는다(preventScroll)"였고, 그 대상은 `commitAndClose`의
  // `requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }))`였다.
  //
  // **SEG Task 4에서 그 호출이 사라졌다** — 포커스가 팝오버 안에 간 적이 없으므로 되돌릴
  // 것이 없다(설계 스펙 §6.2). 그리고 그 삭제로 `src/DateWheelPicker.tsx`에는
  // `focus({ preventScroll: true })` 호출이 **하나도 남지 않았다**(직접 확인했다). 즉 이
  // 자리의 preventScroll 계약은 지킬 대상이 없어졌다 — 규칙 자체는 이 킷의 다른 focus
  // 복귀(positioning.ts, Select)에서 계속 지켜지고, 그쪽 테스트가 따로 있다.
  //
  // 대신 초판이 최종적으로 보장하려던 상태 — **완료 뒤 포커스는 트리거에 있다** — 를
  // 그대로 고정한다. 이 자리에 blur()나 다른 포커스 이동이 새로 들어오면 여기서 터진다.
  it("완료 버튼으로 닫아도 포커스는 트리거에 그대로 있다", () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("dialog", { name: "거래 날짜 선택" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(document.activeElement).toBe(trigger);
  });

  it("resolves today in the supplied time zone", () => {
    vi.useFakeTimers();
    // 2026-07-12T20:00Z → 서울은 이미 13일, UTC는 아직 12일
    vi.setSystemTime(new Date("2026-07-12T20:00:00Z"));
    const seoul = vi.fn();
    render(<DateWheelPicker ariaLabel="서울" value="2026-01-01" onChange={seoul} />);
    fireEvent.click(fieldOf("서울"));
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(seoul).toHaveBeenCalledWith("2026-07-13");
    cleanup();

    const utc = vi.fn();
    render(<DateWheelPicker ariaLabel="UTC" value="2026-01-01" onChange={utc} timeZone="UTC" />);
    fireEvent.click(fieldOf("UTC"));
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(utc).toHaveBeenCalledWith("2026-07-12");
  });
});

// 연·월 픽커 — fields={["year", "month"]}. 값 형식은 그대로 YYYY-MM-DD(일=01).
describe("DateWheelPicker year-month mode (fields)", () => {
  it("renders only year and month columns and drops the day from the trigger", () => {
    render(<DateWheelPicker ariaLabel="예산 월" value="2026-07-12" fields={["year", "month"]} onChange={() => undefined} />);
    const trigger = fieldOf("예산 월");
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
    fireEvent.click(fieldOf("예산 월"));
    fireEvent.click(screen.getByRole("button", { name: "월 다음" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-08-01");   // 12일이 아니라 01일
  });

  it("keeps a partially-covered month selectable — min compares at month granularity", () => {
    // 예산이 7월 15일부터 시작해도 '7월'은 통째로 선택 가능해야 합니다.
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="예산 월" value="2026-08-01" min="2026-07-15" fields={["year", "month"]} onChange={onChange} />);
    fireEvent.click(fieldOf("예산 월"));
    const monthPrevious = screen.getByRole("button", { name: "월 이전" });
    expect(monthPrevious.hasAttribute("disabled")).toBe(false);   // 7월 허용
    fireEvent.click(monthPrevious);
    expect(onChange).toHaveBeenLastCalledWith("2026-07-01");
  });

  it("disables the month before a month-granular min and keeps the min month in range", () => {
    // min이 8월 5일이면: 7월은 막히고, 8월 1일은 min보다 이른 날짜지만 '8월'이라 클램프되지 않습니다.
    render(<DateWheelPicker ariaLabel="예산 월" value="2026-08-01" min="2026-08-05" fields={["year", "month"]} onChange={() => undefined} />);
    fireEvent.click(fieldOf("예산 월"));
    expect(screen.getByRole("group", { name: "월 08" })).toBeTruthy();                        // 8월 그대로
    expect(screen.getByRole("button", { name: "월 이전" }).hasAttribute("disabled")).toBe(true);   // 7월 막힘
  });

  // ── 2b-2 위임이 §6/§6.1을 실제로 지키는지 (전체 브랜치 리뷰 F-1) ─────────────
  //
  // 2b-2 브리프는 "outOfRange/clampToRange를 모델에 위임하라"와 "동작 변화 0"을
  // 같이 요구했는데, 그 둘은 애초에 같이 성립하지 않았다 — §6/§6.1이 오너 승인으로
  // 정한 규칙이 옛 지역 코드(`v`와 `min`/`max`를 전부 픽커 자신의 `keyLen`으로만
  // 슬라이스해 비교)와 실제로 다르기 때문이다. 옛 코드가 틀렸고 §6/§6.1이 그것을
  // 고친 것이지, 위임이 새 동작을 만든 게 아니다. 아래 두 검사(F-1.1·F-1.3)는 그
  // 갈래를 컴포넌트 수준에서 고정한다 — 세째 갈래(F-1.2, 계열 불일치)는 시각 열이
  // 아직 안 그려져서(2b-3의 몫) tests/instantModel.test.ts에 모델 수준으로 있다.
  it("F-1.1 — 거친 max(연도만 준 값)는 그 해 전체를 연다", () => {
    // max="2026"(4자)을 일 픽커(비교 정밀도 10)에 주면, 옛 지역 코드는 v와 max를
    // 똑같이 keyLen(10)으로 슬라이스했다 — max는 10보다 짧아 안 늘어나므로 그대로
    // "2026"(4자)과 v(10자)를 비교했고, JS 문자열 비교에서 짧은 프리픽스는 항상
    // 작다고 보므로 "2026-07-12" > "2026"이 참이 되어 **2026년 안의 모든 날짜가
    // 범위 밖으로 잘못 판정됐다**(그 클램프 결과 `model.normalize("2026", fields)`가
    // "2026-undefined-undefined"를 만들어 렌더가 크래시하는 것까지 직접 재현해
    // 확인했다). 모델의 outOfRange/clampToRange(§6, 2a-3 오너 승인)는
    // `len = min(precision, bound.length)`로 **경계 자신의 길이**까지만 비교해
    // 이 경우를 바로잡는다 — 일이 그대로 12로 보여야 하고, 이웃 날짜로 이동하는
    // 버튼도 막히면 안 된다.
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" max="2026" onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 날짜"));
    expect(screen.getByRole("group", { name: /^일 12\b/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "일 다음" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "일 이전" }).hasAttribute("disabled")).toBe(false);
  });

  it("F-1.3 — 형식이 깨진 min(월에 0을 안 붙인 오타)은 무시된다", () => {
    // min="2026-8-12"(9자, 오타)를 일 픽커에 주면, 옛 지역 코드는 형식을 전혀
    // 검증하지 않고 그대로 슬라이스해 비교했다 — "2026-12-25"(12월, min보다
    // 한참 뒤)를 min과 비교할 때 "-" 다음 첫 글자가 "1"(12월) vs "8"이라 '1' < '8'로
    // 읽혀 **12월 25일이 min보다 이르다고 잘못 판정됐다**(2027년이 되어서야
    // 풀린다 — 오타 하나가 2026년 전체를 막았다). §6.1(오너 결정, `usableBound`)은
    // 형식이 `BOUND_FORMATS`의 어느 것과도 안 맞는 경계를 **없는 것으로** 본다 —
    // 그래서 새 코드에서는 이 min이 통째로 무시되고 12월 25일이 그대로 선택
    // 가능해야 한다.
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-12-25" min="2026-8-12" onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 날짜"));
    expect(screen.getByRole("group", { name: /^월 12\b/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "월 이전" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "연도 이전" }).hasAttribute("disabled")).toBe(false);
  });

  it("팝오버의 오늘 버튼이 연·월 모드에서 일=01로 정규화한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T03:00:00Z"));   // 서울 2026-07-12 정오
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="예산 월" value="2026-05-01" fields={["year", "month"]} onChange={onChange} />);
    fireEvent.click(fieldOf("예산 월"));
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(onChange).toHaveBeenCalledWith("2026-07-01");
  });

  it("renders a year-only picker and formats the trigger as the bare year", () => {
    render(<DateWheelPicker ariaLabel="회계 연도" value="2026-07-12" fields={["year"]} onChange={() => undefined} />);
    const trigger = fieldOf("회계 연도");
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
    fireEvent.click(fieldOf("회계 연도"));
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

// ⚠️ **이 블록이 생기기 전까지 스와이프는 감시자가 0개였습니다.** `moveSwipe`의 본문과
// `finishSwipe`의 커밋을 통째로 지워도 스위트 390개가 전부 초록이었습니다. 원인은 테스트가
// 아니라 환경입니다 — 이 jsdom에 `PointerEvent` 생성자가 없어 `fireEvent.pointerDown`이
// `clientY`·`pointerId`·`buttons`를 조용히 버리고, `moveSwipe`가 첫 줄에서 언제나 반환했기
// 때문입니다(파일 상단 `pointer` 헬퍼 주석에 계측값이 있습니다).
//
// **SEG Task 4가 만든 구멍이 아닙니다** — `abb991c`에도 글자까지 같은 상태였습니다. 다만
// 스와이프는 이 컨트롤의 모바일 주 조작이라(스펙과 PRINCIPLES가 "휠·스와이프·방향키"를
// 나란히 둡니다) 무방비로 둘 수 없어 여기서 메웁니다.
//
// 아래 넷은 `moveSwipe`·`finishSwipe`의 **서로 다른 가드**를 하나씩 겨냥합니다.
describe("DateWheelPicker 스와이프", () => {
  function openWheel() {
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={onChange} />);
    fireEvent.click(fieldOf("거래 날짜"));
    return { onChange, year: screen.getByRole("group", { name: "연도 2026" }) };
  }

  // 30px 경계를 넘을 때마다 **즉시** 한 칸 커밋한다 — 손을 뗄 때 한꺼번에 여러 칸이 튀는
  // 것을 막는 설계다. 위로 끌면(clientY 감소) 다음 값이다.
  it("30px 넘게 위로 끌면 한 칸 다음으로 커밋한다", () => {
    const { onChange, year } = openWheel();
    pointer("pointerDown", year, { pointerId: 7, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", year, { pointerId: 7, clientY: 60, buttons: 1 });
    expect(onChange).toHaveBeenCalledWith("2027-07-12");
  });

  // 실제로 일어나는 시퀀스다: 누른 채 시작했다가 컨트롤 밖에서 버튼을 떼면 `pointerup`이
  // 안 오고 `buttons: 0`인 `pointermove`만 계속 온다. 그때도 값이 따라 움직이면 "누르지도
  // 않았는데 휠이 돈다"가 된다. 이것이 초판 `:97`이 지킨다고 믿어졌던 계약이다.
  it("버튼을 뗀 채(buttons:0) 같은 거리를 움직이면 값이 안 바뀐다", () => {
    const { onChange, year } = openWheel();
    pointer("pointerDown", year, { pointerId: 7, clientY: 100, buttons: 1, button: 0 });
    onChange.mockClear();
    pointer("pointerMove", year, { pointerId: 7, clientY: 60, buttons: 0 });
    expect(onChange).not.toHaveBeenCalled();
  });

  // 멀티터치 — 한 손가락이 스와이프 중일 때 **다른 손가락**의 move가 도착한다. 그것이 진행
  // 중인 스와이프를 몰면 두 번째 손가락을 얹는 것만으로 값이 튄다. `moveSwipe`의
  // `start.pointerId !== pointerId` 절이 그것을 막는다 — 위 두 테스트와 다른 가드다
  // (`buttons`는 1이고 스와이프도 시작돼 있으므로 앞 두 가드는 통과한다).
  //
  // ⚠️ 같은 `if`의 **`!start` 절**(누르지 않았는데 도착한 move)은 여기서 고정하지 않는다.
  // 그 절을 지우면 `start.y` 읽기가 TypeError를 내는데, **React DEV가 그 예외를 삼켜
  // stderr로만 흘려보내고 테스트는 초록으로 남는다**(직접 확인했다 — 뮤테이션을 돌리면
  // `TypeError: Cannot read properties of null (reading 'y')`가 stderr에 찍히는데
  // 144개가 전부 통과한다). 그 절은 관찰 가능한 감시자를 못 만든다.
  it("스와이프 중에 다른 손가락(pointerId)의 move가 와도 값이 안 바뀐다", () => {
    const { onChange, year } = openWheel();
    pointer("pointerDown", year, { pointerId: 7, clientY: 100, buttons: 1, button: 0 });
    onChange.mockClear();
    pointer("pointerMove", year, { pointerId: 9, clientY: 60, buttons: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  // 손을 뗄 때 30px 경계에 못 미치고 남은 거리가 18px 이상이면 그 방향으로 한 칸 더 간다.
  // 여기서는 100 → 80이므로 커밋 경계(30)는 못 넘고 놓기 경계(18)는 넘는다.
  it("손을 뗄 때 18px 이상 남아 있으면 그 방향으로 한 칸 더 커밋한다", () => {
    const { onChange, year } = openWheel();
    pointer("pointerDown", year, { pointerId: 7, clientY: 100, buttons: 1, button: 0 });
    onChange.mockClear();
    pointer("pointerUp", year, { pointerId: 7, clientY: 80 });
    expect(onChange).toHaveBeenCalledWith("2027-07-12");
  });

  // ── 드래그 중 커밋은 휠 이동 애니메이션을 재생하지 않는다 ─────────────────────
  //
  // 설계 스펙 §6.1이 **타이핑에 대해 이미 내린 판단과 같은 근거**다. `commitShift`는
  // `markColumnMotion`으로 그 열의 sequence를 올리고, 값 컨테이너의 key가
  // `${unit}-${sequence}`라서 행 일곱 개가 통째로 리마운트되며 210ms 슬라이드가
  // 재생된다. **드래그 중에는 손가락이 이미 모션을 주고 있으므로 그 슬라이드는 두 번째
  // 모션이고, 둘이 싸운다.**
  //
  // 오너 실기기 트레이스(2026-08-10, 178프레임/커밋 7회)가 그 싸움을 잡았다: 커밋 직후
  // delta가 0~2px이 되는 프레임에 `.dragging`이 빠지고(`Math.abs(offset) > 2`),
  // 그 한 프레임에 `.dragging { animation: none !important }`가 사라져 방금 리마운트된
  // 컨테이너에서 슬라이드가 **시작**된다. `@keyframes date-wheel-slide-previous`의
  // `from`이 `translateY(-45px) scale(.975) opacity:.58`이고 애니메이션은 저자
  // 선언을 이기므로, 계산된 `translateY(-28.75px)` 대신 `-45px`가 그려진다 —
  // 16px 밖으로, 58% 투명도로 한 프레임. 캡처에서 7번.
  //
  // ⚠️ **jsdom에서는 CSS 애니메이션이 진행하지 않으므로 `getAnimations()`로 볼 수
  // 없다.** 관측 가능한 대리물은 셋이고 아래에서 하나씩 본다 — 값 컨테이너의 리마운트,
  // 슬라이드를 무장시키는 `moving-*` 클래스, 액센트 행 버튼의 리마운트.
  // **셋은 독립된 킬이 아니다**: 전부 "sequence가 안 올랐다"는 한 사실의 서로 다른
  // 소비자라 뮤테이션 하나에 함께 죽는다. 그래도 나눠 두는 이유는 두 가지다 —
  // `expect()`가 단락하므로 한 블록에 넣으면 뒤 단언이 실행조차 되지 않고,
  // 셋이 **서로 다른 CSS 규칙**을 가리키기 때문이다(컨테이너의 slide / 그 slide를
  // 무장시키는 클래스 / 버튼의 `date-wheel-selected-pop`).
  //
  // 기존 테스트 "타이핑은 휠 이동 애니메이션을 재생하지 않는다"가 같은 문제를 이미
  // 같은 모양으로 풀어 두었다.
  it("드래그 중 커밋은 값 컨테이너를 리마운트하지 않는다", () => {
    const { year } = openWheel();
    const rowsBefore = year.querySelector(".date-wheel-values");
    pointer("pointerDown", year, { pointerId: 7, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", year, { pointerId: 7, clientY: 60, buttons: 1 });
    expect(year.querySelector(".date-wheel-values")).toBe(rowsBefore);
  });

  it("드래그 중 커밋은 moving-* 클래스를 붙이지 않는다", () => {
    const { year } = openWheel();
    pointer("pointerDown", year, { pointerId: 7, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", year, { pointerId: 7, clientY: 60, buttons: 1 });
    expect(year.className).not.toMatch(/moving-/);
  });

  // 액센트 행(선택 행)은 `.dragging`이 **덮지 못한다** — 그 규칙은
  // `.date-wheel-column.dragging .date-wheel-values`라 컨테이너의 애니메이션만 끄고,
  // `date-wheel-selected-pop`(230ms, scale .88 → 1.09 → 1)은 그 **자식 버튼**에 걸려
  // 있다. 그래서 드래그 중 리마운트가 나면 팝이 매 커밋마다 처음부터 다시 시작한다 —
  // 100~150ms마다 커밋되는 스와이프에서는 230ms 팝이 **끝나는 일이 없다.**
  // 리마운트가 없어지면 다시 시작할 계기 자체가 사라진다(클래스 토글로는 시작되지 않는다).
  it("드래그 중 커밋은 액센트 행을 리마운트하지 않는다", () => {
    const { year } = openWheel();
    const selectedBefore = year.querySelector(".date-wheel-values button.selected");
    pointer("pointerDown", year, { pointerId: 7, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", year, { pointerId: 7, clientY: 60, buttons: 1 });
    expect(year.querySelector(".date-wheel-values button.selected")).toBe(selectedBefore);
  });

  // ── 새 스와이프는 앞선 모션을 비우고 시작한다 ────────────────────────────────
  //
  // 위 셋은 **sequence가 아직 0인 열**의 드래그만 덮는다. 실브라우저에서 재 보니 그것
  // 으로는 모자랐다 — `markColumnMotion`은 sequence를 **올리기만** 하고 아무도 0으로
  // 되돌리지 않으므로, 한 번이라도 커밋한 열은 `moving-*`을 계속 단다. 그 클래스가
  // 210ms 슬라이드를 **무장**시키고, `.dragging`은 `Math.abs(offset) > 2`로 켜지므로
  // 커밋 직후 한 프레임 빠진다. 그 프레임에 애니메이션이 **리마운트 없이** 새로 생긴다 —
  // `getAnimations()`로 쟀다: `.dragging`을 붙이면 `[]`, 떼면 `currentTime: 0`짜리가
  // 새로 생기고 computed transform이 `matrix(0.975, 0, 0, 0.975, 0, -45)`가 된다
  // (`from` 키프레임, 저자 선언보다 14~16px 위).
  //
  // 그래서 **두 번째 스와이프부터** 번쩍임이 돌아왔다. 무장시킨 것은 바로 앞 스와이프의
  // 놓을 때 커밋이다 — 그건 옳다(이산적 착지). 고침은 **새 스와이프가 시작될 때 그 열의
  // 모션을 비우는 것**이다: 새 드래그가 시작됐다는 것은 애니메이션할 휠 이동이 없다는 뜻이다.
  //
  // ⚠️ 전제("놓을 때의 커밋이 무장시킨다")를 여기서 다시 단언하지 않는다. 바로 아래
  // 대조군이 그것을 지키므로, 전제가 깨지면 이 테스트가 공허 통과하는 대신 **대조군이**
  // **빨개진다.** 한 `it`에 전제와 본단언을 같이 넣으면 `expect()`가 단락해 전제가
  // 터질 때 본단언이 실행조차 되지 않는다.
  it("앞선 착지가 무장시킨 moving-*을 새 스와이프가 비우고 시작한다", () => {
    const { year } = openWheel();
    // 첫 스와이프 — 놓을 때의 커밋이 moving-next를 무장시킨다.
    pointer("pointerDown", year, { pointerId: 7, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerUp", year, { pointerId: 7, clientY: 80 });
    // 두 번째 스와이프가 시작되는 순간. 여기서 비워지지 않으면 이 드래그 내내 슬라이드가
    // 무장된 채라, .dragging이 빠지는 프레임마다 from 키프레임이 번쩍인다.
    pointer("pointerDown", year, { pointerId: 8, clientY: 100, buttons: 1, button: 0 });
    expect(year.className).not.toMatch(/moving-/);
  });

  // ── 화면은 손가락의 절반만 움직인다 ─────────────────────────────────────────
  //
  // 오너 판정(실기기 A/B): "움직이는 px을 반으로 줄이는 게 낫다". **감쇠로 구현한다** —
  // 클램프만 낮추면 실기기에서 잰 데드존(손가락은 가는데 화면이 서 있는 구간, 최대
  // 102ms)이 오히려 커진다. 감쇠는 손가락 전 구간을 화면에 대응시키므로 데드존이 없다.
  //
  // **클램프 15는 기하가 아니라 커밋 경계에서 나온다.** 커밋이 |delta| >= 30에서 먼저
  // 일어나므로 보통 경로의 |offset|은 15 미만이고, 클램프는 **한 프레임에 30px 넘게**
  // 뛰었을 때만 물린다(그때 남는 잔여 delta가 15를 넘을 수 있다). 15는 프리로드가
  // 감당하는 기하 상한 ±30 안쪽이라 빈 띠가 생기지 않는다.
  it("커밋 경계 아래에서 오프셋은 손가락 거리의 절반이다", () => {
    const { year } = openWheel();
    pointer("pointerDown", year, { pointerId: 7, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", year, { pointerId: 7, clientY: 72, buttons: 1 });   // delta -28
    expect(year.style.getPropertyValue("--date-wheel-drag-offset")).toBe("-14px");
  });

  it("한 프레임에 크게 뛰어도 오프셋은 ±15를 넘지 않는다", () => {
    const { year } = openWheel();
    // 100 -> 0. delta -100 -> 한 칸 커밋(start.y가 30만큼 따라옴) -> delta -70 -> 감쇠 -35 -> 클램프.
    pointer("pointerDown", year, { pointerId: 7, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", year, { pointerId: 7, clientY: 0, buttons: 1 });
    expect(year.style.getPropertyValue("--date-wheel-drag-offset")).toBe("-15px");
  });
  // ── 포인터 캡처는 드래그를 위한 장치다. 누름은 아직 드래그가 아니다 ──────────
  //
  // 오너 실기기 TRACE(한 캡처)가 확정한 것:
  //
  //     +0ms   pointerdown target=button                    <- 행 버튼
  //     +4ms   mousedown   target=button                    <- 행 버튼
  //     +352ms pointerup   target=section.date-wheel-column <- 열로 리타겟
  //     +356ms mouseup     target=section.date-wheel-column
  //     +357ms click       target=section.date-wheel-column <- 클릭이 열에 발생
  //
  // `onPointerDown`이 누르자마자 `setPointerCapture`를 걸었고, 캡처가 걸리면 이후 포인터
  // 이벤트가 **열로 리타겟**됩니다. `mousedown`(행)과 `mouseup`(열)의 타깃이 달라지므로
  // 브라우저는 `click`을 **공통 조상인 열**에 발생시키고, **행의 `onClick`은 호출될 수가
  // 없습니다.** 같은 캡처에서 `off=0px`이 59프레임 내내이고 커밋도 0이었으므로 — 오너는
  // 손을 전혀 안 움직였습니다 — **클릭 억제 플래그는 이 결함과 무관합니다.**
  //
  // 고침은 캡처를 **늦게** 거는 것입니다. 캡처는 드래그를 위한 장치인데 누름은 아직
  // 드래그가 아닙니다. 슬롭을 넘긴 첫 `pointermove`에서 걸면 탭에는 캡처가 없어
  // `pointerup`·`click`이 행에 그대로 가고, 드래그에는 그대로 걸려 행이 리마운트돼도 추적이
  // 안 끊기고 포인터가 픽커 밖으로 나가도 계속 따라옵니다.
  //
  // ⚠️ **행을 캡처 대상에서 빼는 방식은 안 됩니다** — 휠 표면 150px이 통째로 행 버튼이라
  // 모든 스와이프가 캡처를 잃습니다. `moveSwipe`의 주석이 "target이 아니라 currentTarget(열)에
  // 건다"고 적어 둔 이유가 그것입니다. 바꾸는 것은 **대상이 아니라 시점**입니다.
  //
  // ⚠️⚠️ **이 테스트들이 증명하는 것과 못 하는 것.**
  // **증명합니다:** 우리가 캡처를 **언제 부르는가**(누를 때가 아니라 슬롭을 넘긴 첫 move에서).
  // **증명하지 못합니다:** 실브라우저에서 클릭이 행에 도달한다는 것. **jsdom에는
  // `setPointerCapture`가 아예 없고**(직접 쟀습니다 — `Element.prototype`에 셋 다 없습니다),
  // 따라서 캡처로 인한 **리타겟이 재현되지 않습니다.** "행 클릭이 값을 바꾼다"류의 테스트는
  // 캡처가 걸려 있든 아니든 jsdom에서 똑같이 통과합니다 — **그래서 이 결함이 지금까지**
  // **한 번도 안 걸렸습니다.** 실기기 확인 항목으로 남습니다.
  // (이 파일 위쪽 `pointer` 헬퍼 주석, `tests/AppShell.test.tsx` 상단 clamp 주석과 같은 종류의
  // 한계입니다.)
  //
  // jsdom에 `setPointerCapture`가 없으므로 열 요소에 직접 심어 호출을 셉니다. 소스가
  // `typeof … === "function"`으로 가드하고 있어, 심지 않으면 아무 일도 안 일어납니다.
  function countCaptures(column: Element) {
    const calls: number[] = [];
    Object.defineProperty(column, "setPointerCapture", { value: (pointerId: number) => calls.push(pointerId), configurable: true });
    return calls;
  }

  it("움직임 없는 탭은 포인터 캡처를 걸지 않는다", () => {
    const { year } = openWheel();
    const calls = countCaptures(year);
    const row = [...year.querySelectorAll(".date-wheel-values button")][4];
    pointer("pointerDown", row, { pointerId: 2, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerUp", row, { pointerId: 2, clientY: 100 });
    expect(calls).toEqual([]);
  });

  // **시점**을 본다. 누를 때 0, 슬롭을 넘긴 move 뒤 1 — 한 단언으로 둘을 함께 보므로
  // 실패 메시지가 "언제 걸렸는지"를 그대로 보여준다(고치기 전에는 [1, 1]이다).
  it("캡처는 누를 때가 아니라 슬롭을 넘긴 첫 move에서 걸린다", () => {
    const { year } = openWheel();
    const calls = countCaptures(year);
    const row = [...year.querySelectorAll(".date-wheel-values button")][4];
    pointer("pointerDown", row, { pointerId: 2, clientY: 100, buttons: 1, button: 0 });
    const afterDown = calls.length;
    pointer("pointerMove", row, { pointerId: 2, clientY: 120, buttons: 1 });
    expect([afterDown, calls.length]).toEqual([0, 1]);
  });

  // 슬롭 아래의 흔들림은 여전히 탭이므로 캡처도 없어야 한다 — 캡처를 "첫 move"에 거는
  // (슬롭을 안 보는) 고침이 위 둘을 통과하는 것을 막는다.
  it("슬롭 아래로 흔들린 move는 캡처를 걸지 않는다", () => {
    const { year } = openWheel();
    const calls = countCaptures(year);
    const row = [...year.querySelectorAll(".date-wheel-values button")][4];
    pointer("pointerDown", row, { pointerId: 2, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", row, { pointerId: 2, clientY: 105, buttons: 1 });
    pointer("pointerMove", row, { pointerId: 2, clientY: 108, buttons: 1 });
    expect(calls).toEqual([]);
  });

  // 프레임마다 다시 걸면 안 된다. 브라우저에서 재캡처는 무해하지만 "한 제스처에 한 번"이
  // 이 장치의 뜻이고, 매 프레임 호출은 그 뜻이 흐려졌다는 신호다.
  it("한 제스처에서 캡처는 한 번만 건다", () => {
    const { year } = openWheel();
    const calls = countCaptures(year);
    const row = [...year.querySelectorAll(".date-wheel-values button")][4];
    pointer("pointerDown", row, { pointerId: 2, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", row, { pointerId: 2, clientY: 120, buttons: 1 });
    pointer("pointerMove", row, { pointerId: 2, clientY: 140, buttons: 1 });
    pointer("pointerMove", row, { pointerId: 2, clientY: 160, buttons: 1 });
    expect(calls).toEqual([2]);
  });
  // ── 탭인가 스와이프인가는 숫자 하나가 정한다 ─────────────────────────────────
  //
  // 오너: "마우스 클릭이나 터치로 클릭해도 선택 안 되고 그냥 열만 활성화된다."
  // 코디네이터가 같은 픽커·같은 행에서 움직임만 바꿔 재현했다:
  //
  //     0px  선택됨 / 3px  안 됨 / 8px  안 됨 / 0px  선택됨
  //
  // `moveSwipe`의 억제 임계값이 **2px**이었다. **마우스 클릭은 누르고 떼는 사이에 2~3px,
  // 터치 탭은 그보다 더 흔들리는 것이 정상**이라 실사용 클릭이 거의 다 걸렸다.
  // ± 버튼은 `startsOnStepControl`로 풀렸지만 **행은 휠 표면 그 자체라 같은 방법을 못 쓴다.**
  //
  // 고침은 그 임계값을 `finishSwipe`의 놓을 때 커밋 임계값과 **같은 수**로 맞추는 것이다.
  // 그러면 숫자 하나가 탭과 스와이프를 가르고 **죽은 구간이 없다:**
  //
  //     |delta| <  18   놓아도 커밋 없음 + 클릭 안 막힘  ->  행이 선택된다 (탭)
  //     |delta| >= 18   놓을 때 한 칸 커밋 + 클릭 막힘   ->  스와이프
  //
  // 한 제스처 안에서 30px 커밋이 난 뒤 delta가 작게 리셋돼도 억제는 유지된다 — 커밋 분기가
  // 자기 자리에서 플래그를 세우고, 그것을 내리는 것은 `releaseColumnClickSuppression`뿐이다
  // (pointerup/cancel의 rAF). 그래서 위 두 줄 사이에 빈틈이 생기지 않는다.
  it("행 위에서 3px 흔들려도 그 행이 선택된다", () => {
    const { onChange, year } = openWheel();
    const row = [...year.querySelectorAll(".date-wheel-values button")][4];   // 오프셋 +1 = 2027
    onChange.mockClear();
    pointer("pointerDown", row, { pointerId: 2, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", row, { pointerId: 2, clientY: 103, buttons: 1 });   // 손떨림
    pointer("pointerUp", row, { pointerId: 2, clientY: 103 });
    fireEvent.click(row);
    expect(onChange).toHaveBeenCalledWith("2027-07-12");
  });

  // 8px도 같은 구간이다. 3px만 고정하면 임계값을 4나 5로 올리는 것도 통과한다 —
  // **오너가 실제로 걸린 거리**를 따로 못 박는다.
  it("행 위에서 8px 흔들려도 그 행이 선택된다", () => {
    const { onChange, year } = openWheel();
    const row = [...year.querySelectorAll(".date-wheel-values button")][4];
    onChange.mockClear();
    pointer("pointerDown", row, { pointerId: 2, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", row, { pointerId: 2, clientY: 108, buttons: 1 });
    pointer("pointerUp", row, { pointerId: 2, clientY: 108 });
    fireEvent.click(row);
    expect(onChange).toHaveBeenCalledWith("2027-07-12");
  });

  // **대조군.** 18px을 넘겨 끌면 그것은 스와이프다 — 놓을 때 한 칸 커밋되고 **그 뒤의 클릭은**
  // **삼켜져야 한다.** 이게 없으면 "억제를 통째로 없앤다"가 위 둘을 통과한다.
  //
  // 호출 목록을 통째로 신원 비교한다: 스와이프 커밋 하나만 있어야 하고, 클릭이 살아 있었다면
  // 행 값(2027)이 뒤에 하나 더 붙어 실패 메시지가 그것을 그대로 보여준다.
  it("18px을 넘겨 끌면 스와이프이고, 뒤따르는 클릭은 삼켜진다", () => {
    const { onChange, year } = openWheel();
    const row = [...year.querySelectorAll(".date-wheel-values button")][4];
    onChange.mockClear();
    pointer("pointerDown", row, { pointerId: 2, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", row, { pointerId: 2, clientY: 120, buttons: 1 });
    pointer("pointerUp", row, { pointerId: 2, clientY: 120 });
    fireEvent.click(row);
    expect(onChange.mock.calls.flat()).toEqual(["2025-07-12"]);
  });
  // **`moveSwipe`의 억제가 실제로 일하는 자리는 여기 하나다.** 뮤테이션으로 확인했다:
  // 그 줄을 통째로 지워도(또는 임계값을 30으로 올려도) 위 셋은 전부 초록이다 — 놓을 때
  // 18px을 넘겨 있으면 `finishSwipe`가 자기 자리에서 플래그를 세우기 때문이다. 그래서
  // 그 줄이 없어도 "끌다가 놓고 클릭"은 막힌다.
  //
  // 안 막히는 것은 **멀리 갔다가 되돌아와서 놓는** 제스처다. 25px 끌었다가 5px 자리로
  // 돌아와 놓으면 `finishSwipe`는 5px만 보고 아무것도 안 한다. 손가락은 휠을 25px 굴렸는데
  // 놓는 순간 그 아래 행이 선택되면, 사용자가 하지도 않은 선택이 된다.
  //
  // 이것이 그 줄의 고유 킬이다. (위 셋만 두면 "억제를 통째로 삭제"가 0 red로 통과한다 —
  // 등가라서가 아니라 **미도달**이었다. 도달하는 제스처를 여기서 쓴다.)
  it("멀리 끌었다가 되돌아와 놓으면, 그것은 여전히 스와이프다", () => {
    const { onChange, year } = openWheel();
    const row = [...year.querySelectorAll(".date-wheel-values button")][4];
    onChange.mockClear();
    pointer("pointerDown", row, { pointerId: 2, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", row, { pointerId: 2, clientY: 125, buttons: 1 });   // 25px — 스와이프다
    pointer("pointerMove", row, { pointerId: 2, clientY: 105, buttons: 1 });   // 되돌아옴
    pointer("pointerUp", row, { pointerId: 2, clientY: 105 });                 // 5px — finishSwipe는 아무것도 안 한다
    fireEvent.click(row);
    expect(onChange).not.toHaveBeenCalled();
  });
  // ── 무장 해제는 행을 갈아치우지 않는다 ──────────────────────────────────────
  //
  // 위 무장 해제는 처음에 `sequence`를 0으로 되돌리는 방식이었고, **그것이 회귀를
  // 만들었다.** 값 컨테이너의 key가 `${unit}-${sequence}`라 0으로 되돌리는 것도
  // key 변경이고, 그래서 pointerdown이 행 일곱 개를 통째로 갈아치웠다. 오너 리포트:
  // **"7로 선택돼 있을 때 9를 클릭해도 선택되게 하고 싶다"** — 기능은 이미 있었고
  // 안 먹던 것이다. 무장된 열에서만, 그래서 **한 번 걸러 한 번씩** 실패했다
  // (커밋할 때마다 열이 다시 무장되므로).
  //
  // ⚠️ **실브라우저와 jsdom이 같은 이유로 빨개지지 않는다. 둘 다 재서 확인했다.**
  // 브라우저에서는 mousedown을 받은 노드가 mouseup 전에 사라지므로 `click`이 행이 아니라
  // **공통 조상**에 발생한다(코디네이터 실측: 무장 상태에서 `isConnected: false`, 값 안 바뀜
  // / 비무장에서는 살아 있고 값 바뀜 / 다시 무장에서 또 안 바뀜). jsdom은 리타기팅을
  // 구현하지 않지만, **떨어져 나간 노드에 보낸 이벤트는 React 루트의 위임 리스너에 닿지
  // 못하므로** 행의 `onClick`이 역시 안 돈다. 기제는 다르고 **뿌리와 관측값은 같다** —
  // 누르고 떼는 사이에 노드가 사라졌다는 것, 그리고 그 행의 `onClick`이 안 돈다는 것.
  //
  // 그래서 **누르기 전에 잡아 둔 노드**를 클릭한다. 다시 조회하면 새 노드를 얻어
  // 통과해 버린다(계측: 새 노드로 클릭하면 값이 바뀐다) — 그게 이 결함이 오랫동안
  // 안 보였을 모양이다.
  it("무장된 열에서, 누른 그 행을 클릭하면 값이 바뀐다", () => {
    const { onChange, year } = openWheel();
    fireEvent.click(screen.getByRole("button", { name: "연도 이전" }));   // 이 열을 무장시킨다
    const row = [...year.querySelectorAll(".date-wheel-values button")][4];   // 오프셋 +1 = 2027
    onChange.mockClear();
    pointer("pointerDown", row, { pointerId: 3, clientY: 100, buttons: 1, button: 0 });
    fireEvent.click(row);
    expect(onChange).toHaveBeenCalledWith("2027-07-12");
  });

  // 위 테스트의 **기제**를 따로 본다. 같은 뮤테이션에 함께 죽지만(독립된 킬이 아니다),
  // 위가 "행 클릭이 산다"는 계약이라면 이것은 **"무장 해제가 key를 안 건드린다"**는 이
  // 고침의 형태 자체다. `sequence`(= "값이 바뀌었으니 슬라이드를 다시 재생하라", 리마운트)와
  // `moving-*`(= "재생할 슬라이드가 있다")는 다른 관심사이고, **무장 해제는 뒤엣것만**
  // **건드려야 한다.**
  //
  // 이 짝의 나머지 반쪽은 위 "앞선 착지가 무장시킨 moving-*을 새 스와이프가 비우고
  // 시작한다"이다 — 그쪽이 "클래스는 꺼진다", 이쪽이 "key는 그대로다"를 지킨다.
  // 둘 중 하나만 두면 무장 해제를 통째로 지우거나 리마운트로 되돌리는 것이 통과한다.
  it("무장 해제는 행 노드를 갈아치우지 않는다", () => {
    const { year } = openWheel();
    fireEvent.click(screen.getByRole("button", { name: "연도 이전" }));
    const row = [...year.querySelectorAll(".date-wheel-values button")][4];
    pointer("pointerDown", row, { pointerId: 3, clientY: 100, buttons: 1, button: 0 });
    expect(row.isConnected).toBe(true);
  });
  // **대조군.** 놓을 때의 커밋(18px 임계값)은 애니메이션을 그대로 둔다 — 손가락이 떠난
  // 뒤의 **이산적인 착지**라 슬라이드가 맞는 모션이고, `clearSwipeVisual`이
  // `.dragging`을 먼저 지우므로 거기서는 정상 재생된다.
  //
  // 이 테스트는 고치기 전에도 초록이다. 그래도 값이 있는 이유는 **과잉 뮤테이션을 죽이기**
  // 때문이다: `commitShift`에서 `markColumnMotion` 호출을 통째로 지우거나 두 스와이프
  // 경로 모두에서 억제하면 위 셋은 여전히 초록인데 이것만 빨개진다. 없으면 "드래그 중에만
  // 껐다"와 "휠 이동 애니메이션을 없앴다"를 구분하지 못한다.
  it("놓을 때의 커밋은 휠 이동 애니메이션을 재생한다", () => {
    const { year } = openWheel();
    pointer("pointerDown", year, { pointerId: 7, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerUp", year, { pointerId: 7, clientY: 80 });
    expect(year.classList.contains("moving-next")).toBe(true);
  });

  // ── ± 버튼 위에서 시작한 누름은 스와이프가 아니다 ────────────────────────────
  //
  // 오너 리포트(데스크톱): "± 버튼이 안 먹을 때가 있다". 코디네이터가 pane에서 프레임
  // 단위로 벌려 재현했다 — **가만히 클릭하면 4회 다 바뀌고, 누른 채 3px 움직이면 안
  // 바뀐다.** `moveSwipe`의 `if (Math.abs(delta) > 2) suppressColumnClickRef.current = true`
  // 가 서고, 열의 `onClickCapture`가 그 클릭을 삼킨다. **마우스는 누르고 떼는 사이에
  // 2~3px 흔들리는 게 정상**이라 데스크톱에서 자주 걸린다.
  //
  // 뿌리는 열의 `onPointerDown`이 **대상을 안 보고** 무조건 `swipeRef`를 세우는 것이다.
  // ± 버튼은 휠 표면이 아니라 **이산 컨트롤**이므로 거기서 시작한 누름은 스와이프가 아니다.
  //
  // ⚠️ **행 버튼(`.date-wheel-values button`)은 같이 빼면 안 된다** — 휠 표면 150px이
  // 통째로 그 버튼들이라 스와이프가 통째로 죽는다. 아래 대조군이 그것을 지킨다.
  //
  // ⚠️ 기존 `moves the year, month, and day by one with the step buttons`는 **안 움직이고**
  // 클릭하므로 이 결함에서 초록이다. 움직임이 있어야 빨개진다 — 그래서 이 테스트가 따로 있다.
  // (`main`에도 글자까지 같은 결함이다. 이 브랜치가 만든 것이 아니다.)
  it("± 버튼을 누른 채 3px 흔들려도 클릭이 살아 있다", () => {
    const { onChange } = openWheel();
    const previous = screen.getByRole("button", { name: "연도 이전" });
    onChange.mockClear();
    pointer("pointerDown", previous, { pointerId: 4, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", previous, { pointerId: 4, clientY: 103, buttons: 1 });   // 손떨림
    pointer("pointerUp", previous, { pointerId: 4, clientY: 103 });
    fireEvent.click(previous);
    expect(onChange).toHaveBeenCalledWith("2025-07-12");
  });

  // **대조군.** 휠 표면(행 버튼) 위에서 시작한 누름은 **여전히 스와이프다.** 위 고침을
  // `.date-wheel-values button`까지 넓히면 이것이 빨개진다 — 150px 표면이 통째로 그
  // 버튼들이라 스와이프가 죽기 때문이다.
  it("행 버튼 위에서 시작해도 스와이프는 그대로 커밋한다", () => {
    const { onChange, year } = openWheel();
    const row = year.querySelector(".date-wheel-values button")!;
    onChange.mockClear();
    pointer("pointerDown", row, { pointerId: 5, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", row, { pointerId: 5, clientY: 60, buttons: 1 });
    expect(onChange).toHaveBeenCalledWith("2027-07-12");
  });
});

describe("DateWheelPicker 키보드 진입", () => {
  it("↓로 열린다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const field = fieldOf("거래 날짜");
    field.focus();

    fireEvent.keyDown(field, { key: "ArrowDown" });

    expect(await screen.findByRole("dialog", { name: "거래 날짜 선택" })).toBeTruthy();
  });

  // 루프 안에서 곧바로 단언하면 실패 메시지가 **어느 키인지 안 알려준다**("expected null to
  // be truthy"). 연 키를 모아 신원으로 비교해, 빠진 키가 실패 메시지에 그대로 찍히게 한다.
  it("↑ Enter Space로도 열린다", () => {
    const opened: string[] = [];
    for (const key of ["ArrowUp", "Enter", " "]) {
      render(<ControlledDateWheel initialValue="2026-07-12" />);
      fireEvent.keyDown(fieldOf("거래 날짜"), { key });
      if (screen.queryByRole("dialog", { name: "거래 날짜 선택" })) opened.push(key);
      cleanup();
    }
    expect(opened).toEqual(["ArrowUp", "Enter", " "]);
  });

  it("비활성이면 어느 키로도 열리지 않는다", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={() => undefined} disabled />);
    fireEvent.keyDown(fieldOf("거래 날짜"), { key: "ArrowDown" });
    expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull();
  });

  it("뒤로가기로 팝오버가 닫힌다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    fireEvent.popState(window, { state: null });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
  });

  // 초판은 "뒤로가기로 닫으면 포커스가 **트리거로 돌아온다**"였다. 돌아올 것이 없어졌다 —
  // 포커스는 애초에 떠난 적이 없다(설계 스펙 §6.2). 그래서 회수가 아니라 **머무름**을 고정한다.
  //
  // 위 테스트와 나눠 둔다. "팝오버가 닫혔다"와 "포커스가 트리거다"는 같은 커밋에서 함께
  // 일어나 서로를 가린다 — 한 it에 두면 앞 단언이 터질 때 뒤 단언은 실행조차 되지 않는다.
  it("뒤로가기로 닫아도 포커스는 트리거에 그대로 있다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    fireEvent.popState(window, { state: null });

    expect(document.activeElement).toBe(field);
  });
});

// 설계 스펙 §6.2의 핵심 불변식을 직접 고정하는 블록이다:
// **이 컨트롤이 키보드를 받는 동안 `document.activeElement`는 언제나 트리거다.**
//
// ⚠️ **이 블록의 mousedown 테스트는 "실브라우저에서 포커스가 안 옮겨간다"를 증명하지
// 못한다.** jsdom은 `mousedown`·`click`의 포커스 부작용을 구현하지 않으므로(직접 확인했다 —
// `fireEvent.click(trigger)`가 포커스를 옮기지 않는 것에 이 파일의 여러 테스트가 이미
// 의존한다), "포커스가 옮겨졌는가"를 물으면 차단이 있든 없든 똑같이 통과한다. 그래서
// 대신 **`preventDefault()`가 불렸는가**를 고정한다 — 실브라우저에서 포커스 이동을 막는
// 것이 정확히 그 기본 동작 취소이기 때문이다. 그 연결고리(취소 → 포커스 유지) 자체는
// 여기서 증명되지 않으므로, 실기기 확인이 필요한 항목으로 스펙 §9에 남아 있다.
// (tests/AppShell.test.tsx 상단의 clamp 주석과 같은 종류의 한계 표시다.)
describe("DateWheelPicker 포커스 불변식 — 키보드를 받는 동안 activeElement는 트리거다", () => {
  function openWithKeyboard() {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    return field;
  }

  it("↓로 열어도 포커스는 트리거에 그대로 있다", () => {
    const field = openWithKeyboard();
    expect(document.activeElement).toBe(field);
  });

  it("세그먼트를 옮겨도 포커스는 트리거에 그대로 있다", () => {
    const field = openWithKeyboard();
    fireEvent.keyDown(field, { key: "ArrowRight" });
    expect(document.activeElement).toBe(field);
  });

  // 클릭 대상은 **실제로 포커스를 받는 요소**여야 한다. 열 `<section>`은 `tabIndex`가
  // 없어 원래 포커스를 안 받으므로, 그걸 고르면 차단을 지워도 아무것도 안 달라진다.
  it("팝오버 행 버튼의 mousedown 기본 동작이 막힌다", () => {
    openWithKeyboard();
    const row = screen.getByRole("dialog", { name: "거래 날짜 선택" }).querySelector<HTMLElement>(".date-wheel-values button")!;
    const event = createEvent.mouseDown(row);
    fireEvent(row, event);
    expect(event.defaultPrevented).toBe(true);
  });

  // 행 버튼과 다른 서브트리(.date-wheel-actions)를 하나 더 본다 — 차단을 팝오버 표면이
  // 아니라 `.date-wheel-columns`에 다는 결함은 위 테스트만으로는 안 잡힌다.
  it("완료 버튼의 mousedown 기본 동작도 막힌다", () => {
    openWithKeyboard();
    const done = screen.getByRole("button", { name: "완료" });
    const event = createEvent.mouseDown(done);
    fireEvent(done, event);
    expect(event.defaultPrevented).toBe(true);
  });

  // 차단이 `click`까지 삼키면 팝오버 안의 모든 버튼이 죽는다 — mousedown의 기본 동작만
  // 막고 click은 그대로 내보내는 것이 이 방법의 요점이다.
  it("mousedown을 막아도 버튼의 click은 그대로 동작한다", () => {
    const field = openWithKeyboard();
    const previous = screen.getByRole("button", { name: "연도 이전" });
    fireEvent.mouseDown(previous);
    fireEvent.click(previous);
    expect(field.textContent).toBe("2025. 07. 12.");
  });
});

// 초판의 이 블록은 "어느 열이 포커스를 쥐고 있는가"로 세그먼트 이동을 읽었다. 열이
// 포커스를 받지 않게 되면서(설계 스펙 §5·§6.2) 그 채널이 사라졌고, 이제 활성 세그먼트를
// `activeSegment()`(트리거의 `.date-wheel-segment.active`)로 읽는다.
describe("DateWheelPicker 세그먼트 이동", () => {
  async function openPicker() {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    return field;
  }

  /** →를 두 번 눌러 마지막 세그먼트(일)를 활성으로 만든다. */
  async function openPickerAtLastSegment() {
    const field = await openPicker();
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "ArrowRight" });
    await waitFor(() => expect(activeSegment()).toBe("day"));
    return field;
  }

  /** 세그먼트가 하나뿐인 픽커를 연다 — 그 하나가 첫 세그먼트이자 마지막 세그먼트다. */
  async function openSoloYearPicker() {
    render(<DateWheelPicker ariaLabel="회계 연도" value="2026-07-12" fields={["year"]} onChange={() => undefined} />);
    const field = fieldOf("회계 연도");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "회계 연도 선택" });
    return field;
  }

  // 초판은 "→와 Tab이 다음 열로 옮긴다" 한 개였다. 스펙 §3에서 **둘의 뜻이 갈라졌다** —
  // 세그먼트를 옮기는 일은 이제 `←`/`→`가 전담하고 `Tab`은 컨트롤을 떠난다.
  it("→가 다음 세그먼트로 옮긴다", async () => {
    const field = await openPicker();
    fireEvent.keyDown(field, { key: "ArrowRight" });
    expect(activeSegment()).toBe("month");
  });

  it("Tab은 세그먼트를 옮기지 않는다", async () => {
    const field = await openPicker();
    fireEvent.keyDown(field, { key: "Tab" });
    expect(activeSegment()).toBe("year");
  });

  // 아래 두 개는 원래 "마지막 열에서 →는 제자리, Tab은 닫고 나간다" 한 개였다. 경계에서
  // 팝오버를 닫아버리는 뮤테이션은 두 검사를 함께 죽이므로 한 it 안에 두면 앞 것이 먼저
  // 던져 뒤 것이 실행조차 되지 않는다.
  it("마지막 세그먼트에서 →는 제자리다", async () => {
    const field = await openPickerAtLastSegment();
    fireEvent.keyDown(field, { key: "ArrowRight" });
    expect(activeSegment()).toBe("day");
  });

  it("마지막 세그먼트에서 →는 팝오버를 닫지 않는다", async () => {
    const field = await openPickerAtLastSegment();
    fireEvent.keyDown(field, { key: "ArrowRight" });
    expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeTruthy();
  });

  // ⚠️ **jsdom은 `Tab` 이동을 구현하지 않는다.** "컨트롤을 떠난다"는 어느 쪽으로 짜든
  // 통과하므로 고정할 수 있는 것은 둘뿐이다 — **`preventDefault()`가 불리지 않았다는 것**과
  // 팝오버가 닫혔다는 것. 초판은 `preventDefault()`가 **불리는** 쪽을 고정하고 있었으므로
  // (`moveColumn`이 성공하면 막았다) 이 단언은 **값이 뒤집힌 것**이지 새로 생긴 것이 아니다.
  // 둘은 서로 다른 결함이라 나눠 둔다.
  //
  // ⚠️ **아래 `defaultPrevented === false` 쌍은 "덧붙임 전용" 감시자다.** 지킬 코드가
  // **없는 것**(`preventDefault()` 호출이 안 일어나는 것)이므로 **삭제 뮤테이션으로는 영영
  // 안 빨개진다** — 지울 줄이 없기 때문이다. `Tab` 분기에 `event.preventDefault()`를
  // **덧붙이는** 뮤테이션에서 2 red가 된다(직접 유도했다). 삭제 뮤테이션만 돌려 보고
  // "감시자가 없다"고 결론내지 말 것.
  it("마지막 세그먼트에서 Tab은 팝오버를 닫는다", async () => {
    const field = await openPickerAtLastSegment();
    fireEvent.keyDown(field, { key: "Tab" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
  });

  it("Tab은 preventDefault를 부르지 않는다 — 기본 동작이 컨트롤을 떠나게 한다", async () => {
    const field = await openPickerAtLastSegment();
    const event = createEvent.keyDown(field, { key: "Tab" });
    fireEvent(field, event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("첫 세그먼트에서 ←는 제자리다", async () => {
    const field = await openPicker();
    fireEvent.keyDown(field, { key: "ArrowLeft" });
    expect(activeSegment()).toBe("year");
  });

  it("첫 세그먼트에서 ←는 팝오버를 닫지 않는다", async () => {
    const field = await openPicker();
    fireEvent.keyDown(field, { key: "ArrowLeft" });
    expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeTruthy();
  });

  // Shift+Tab도 대칭으로 떠난다(스펙 §3). 초판은 첫 열에서만 닫혔고 그 조건이 사라졌다.
  it("첫 세그먼트에서 Shift+Tab은 팝오버를 닫는다", async () => {
    const field = await openPicker();
    fireEvent.keyDown(field, { key: "Tab", shiftKey: true });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
  });

  it("Shift+Tab도 preventDefault를 부르지 않는다", async () => {
    const field = await openPicker();
    const event = createEvent.keyDown(field, { key: "Tab", shiftKey: true });
    fireEvent(field, event);
    expect(event.defaultPrevented).toBe(false);
  });

  // 아래 두 개는 원래 "연도만 있는 픽커는 첫 열이 곧 마지막 열이다" 한 개였다. →와
  // ←는 같은 분기를 타므로 경계-닫힘 뮤테이션은 둘 다 깨뜨리는데, 한 it 안에 순서대로
  // 두면 → 쪽 assert가 먼저 던져 ← 쪽은 실행되지 못한 채 통과한다.
  it("세그먼트가 하나뿐이면 →는 제자리다", async () => {
    const field = await openSoloYearPicker();
    fireEvent.keyDown(field, { key: "ArrowRight" });
    expect(activeSegment()).toBe("year");
  });

  it("세그먼트가 하나뿐이면 ←는 제자리다", async () => {
    const field = await openSoloYearPicker();
    fireEvent.keyDown(field, { key: "ArrowLeft" });
    expect(activeSegment()).toBe("year");
  });

  it("Ctrl이 눌린 방향키는 세그먼트를 옮기지 않는다", async () => {
    const field = await openPicker();
    fireEvent.keyDown(field, { key: "ArrowRight", ctrlKey: true });
    expect(activeSegment()).toBe("year");
  });
});

describe("DateWheelPicker 리뷰 Finding 1 — activeUnit의 수명과 클램프", () => {
  // ⚠️ **이 테스트의 계약이 SEG Task 5에서 뒤집혔다.** 예전 이름은 "마우스로 다시 열면
  // 키보드로 연 것과 같은 첫 세그먼트가 활성이다"였고, 트리거 onClick과 키보드 진입
  // 양쪽에 `setActiveUnit(fields[0] ?? "year")` 시드가 있어 여는 순간 활성이 첫 세그먼트로
  // 되돌아갔다. 닫힌 채로 `←`/`→`가 활성을 옮길 수 있게 되면서(스펙 §3) 그 시드는
  // **옮겨 둔 활성을 여는 순간 조용히 되돌리는 결함**이 됐다 — §6.4(3)이 "두 곳을
  // 제거해야 한다"고 명시한다. 그래서 기대값이 `year`에서 `month`로 뒤집혔다.
  //
  // 이것이 **트리거 onClick 쪽 시드**의 파수꾼이다. 키보드 쪽 시드는 아래 "닫힌 채로
  // 조작한다" 블록의 `→` 뒤 `↓` 테스트가 지킨다 — 하나만 지우면 반쪽이므로 파수꾼도
  // 둘이어야 한다. 여기서 `fireEvent.click(field)`가 겨냥하는 것은 트리거 <button>
  // 자신이라 `data-unit`이 없고, 그래서 새로 생긴 세그먼트 클릭 경로는 no-op이다.
  it("마우스로 다시 열면 옮겨 둔 활성 세그먼트를 유지한 채 열린다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(field, { key: "ArrowRight" });
    await waitFor(() => expect(activeSegment()).toBe("month"));
    fireEvent.keyDown(field, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());

    fireEvent.click(field);   // 마우스로 다시 연다 — activeUnit 상태는 여전히 "month"다

    expect(activeSegment()).toBe("month");
  });

  // fields가 열려 있는 동안 줄어들어 activeUnit이 가리키던 열이 통째로 사라지는 경로.
  //
  // **초판에서 이 테스트가 보던 채널(포커스 이펙트)이 없어졌다.** 대신 이제 클램프를
  // **열의 `.active` 클래스**로 본다 — 초판에서는 각 열의 `onFocus`가 activeUnit 원본
  // 상태까지 되먹임해 렌더 줄만 되돌리는 뮤테이션이 관찰되지 않았는데, 그 되먹임이
  // 사라져 이제는 관찰된다.
  //
  // 아래 "트리거 세그먼트" 블록의 같은 취지 테스트와 **소스 줄이 다르다** — 그쪽은 팝오버를
  // 닫고 트리거 세그먼트의 클램프를 보고, 이쪽은 팝오버가 열린 채 열 렌더의 클램프를 본다.
  it("fields가 열린 채로 줄어 activeUnit이 사라진 열을 가리키면 남은 첫 열이 활성이 된다", async () => {
    render(<DateWheelFieldsShrink />);
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "ArrowRight" });
    await waitFor(() => expect(activeSegment()).toBe("day"));

    fireEvent.click(screen.getByRole("button", { name: "일 열 제거" }));

    expect(screen.getByRole("group", { name: "연도 2026" }).classList.contains("active")).toBe(true);
  });
});

// 설계 스펙 §2·§3 — **(가)안이 처음으로 눈에 보이는 자리다.** 네이티브 `<input type="date">`는
// 달력을 열지 않고 값을 고친다. 이 블록은 그 계약 전체를 닫힌 상태에서 고정한다.
//
// 여기까지 참이던 전제 하나가 사라진다: **"닫힌 채로 버퍼가 생길 방법이 없다."** 그
// 전제 위에 불활성으로 남아 있던 구멍이 둘 있었고(닫힘 `Escape` 미구현, 닫힘 `Tab`이
// 버퍼를 확정하지 않음), 숫자 키가 닫힘으로 올라오는 순간 둘 다 활성화된다.
describe("DateWheelPicker 닫힌 채로 조작한다", () => {
  /** 닫힌 채 키를 받는 출발 상태 — 실사용과 같게 트리거에 포커스를 둔다. */
  function closedField(initialValue = "2026-07-12") {
    render(<ControlledDateWheel initialValue={initialValue} />);
    const field = fieldOf("거래 날짜");
    field.focus();
    return field;
  }

  // 아래 두 개는 원래 하나로 쓸 뻔한 것이다. "값이 확정된다"와 "팝오버가 안 열린다"는
  // 서로 다른 결함이고, expect()는 첫 실패에서 던지므로 함께 두면 뒤쪽의 킬력을 증명할
  // 수 없다 — 특히 숫자 분기를 통째로 지우는 뮤테이션은 값 단언에서 먼저 죽는다.
  it("닫힌 채 숫자 넷을 치면 연도가 확정된다", () => {
    const field = closedField();
    for (const digit of ["2", "0", "3", "1"]) fireEvent.keyDown(field, { key: digit });
    expect(field.textContent).toBe("2031. 07. 12.");
  });

  it("닫힌 채 숫자를 쳐도 팝오버는 열리지 않는다", () => {
    const field = closedField();
    for (const digit of ["2", "0", "3", "1"]) fireEvent.keyDown(field, { key: digit });
    expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull();
  });

  // 버퍼는 닫힌 채로도 트리거가 자리를 지켜 그린다(스펙 §4.5) — 그래서 닫힌 상태에서도
  // "확정 전"과 "확정 후"를 화면으로 구분할 수 있다. 채움 문자는 U+2012(파일 상단 FILL).
  it("닫힌 채 두 자리만 치면 트리거가 자리를 지켜 그린다", () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "2" });
    fireEvent.keyDown(field, { key: "0" });
    expect(field.textContent).toBe(`20${FILL}${FILL}. 07. 12.`);
  });

  it("닫힌 채 Backspace가 버퍼에서 한 자리만 지운다", () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "2" });
    fireEvent.keyDown(field, { key: "0" });
    fireEvent.keyDown(field, { key: "Backspace" });
    expect(field.textContent).toBe(`2${FILL}${FILL}${FILL}. 07. 12.`);
  });

  it("닫힌 채 →가 다음 세그먼트로 옮긴다", () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "ArrowRight" });
    expect(activeSegment()).toBe("month");
  });

  it("닫힌 채 ←가 이전 세그먼트로 되돌린다", () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "ArrowLeft" });
    expect(activeSegment()).toBe("month");
  });

  // 방향키는 안에서만 움직인다(스펙 §2·§3) — 마지막 세그먼트에서 →를 눌러도 컨트롤을
  // 떠나지 않는다. 닫힌 상태에서 이것이 깨지면 증상이 조용하다: 활성 표시가 사라진다.
  it("닫힌 채 마지막 세그먼트에서 →는 제자리다", () => {
    const field = closedField();
    for (let i = 0; i < 3; i++) fireEvent.keyDown(field, { key: "ArrowRight" });
    expect(activeSegment()).toBe("day");
  });

  // 스펙 §3의 **의도된 네이티브 이탈** — 네이티브는 닫힘 ↓가 값 ±1이지만, 이 킷의 모든
  // 팝오버 컨트롤에서 ↓는 여는 키다. 아래 둘은 서로 다른 결함이라 나눈다("연다"를 지우는
  // 뮤테이션과 "값을 안 바꾼다"를 깨뜨리는 뮤테이션이 다르다).
  it("닫힌 채 ↓는 팝오버를 연다", async () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(await screen.findByRole("dialog", { name: "거래 날짜 선택" })).toBeTruthy();
  });

  it("닫힌 채 ↓는 값을 바꾸지 않는다", () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field.textContent).toBe("2026. 07. 12.");
  });

  // 스펙 §4.2 — "치다가 팝오버를 여는 것은 '떠나는' 조작이 아니다." 버퍼를 확정하면
  // 여기서 값이 2003으로 튄다.
  it("닫힌 채 버퍼를 들고 ↓로 열면 버퍼가 살아 있다", () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "3" });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field.textContent).toBe(`3${FILL}${FILL}${FILL}. 07. 12.`);
  });

  // ⚠️ **스펙 §3은 닫힘의 `↓ ↑ Enter Space`를 한 행에 묶고 동작을 "연다" 하나로 적는다.**
  // §4.2의 "떠나는 키" 목록에는 `Enter`·`Space`가 있지만, 그 목록은 그 둘이 실제로 떠나는
  // 상태(열림 = `완료`)를 두고 쓴 것이고 §4.2의 예외 조항 자신이 `↓`/`↑`를 **"= 여는 키"**
  // 라는 범주로 부른다. 두 문장이 함께 참이 되는 읽기는 하나뿐이다 — 닫힘의 여는 키는
  // 넷 다 버퍼를 그대로 들고 연다. 이 테스트가 그 읽기를 고정한다.
  it("닫힌 채 버퍼를 들고 Enter로 열어도 버퍼가 살아 있다", () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "3" });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(field.textContent).toBe(`3${FILL}${FILL}${FILL}. 07. 12.`);
  });

  // **키보드 쪽 activeUnit 시드의 파수꾼**(스펙 §6.4(3)). 시드가 살아 있으면 여는 순간
  // 활성이 연도로 되돌아간다. 트리거 onClick 쪽 시드는 위 "리뷰 Finding 1" 블록이 지킨다 —
  // 두 곳이므로 파수꾼도 둘이다.
  //
  // 스펙 §11의 함정: 활성 세그먼트의 초기값이 첫 세그먼트와 같으므로 `→`로 갈라 놓고
  // **신원**으로 본다.
  it("닫힌 채 →로 옮겨 둔 활성 세그먼트는 ↓로 열어도 유지된다", async () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    expect(activeSegment()).toBe("day");
  });

  // 스펙 §3 — 닫힘 `Tab`도 "버퍼를 확정하고 떠난다"다. **Task 4 리뷰가 찾은 주인 없는
  // 구멍 둘 중 하나**이고, 어느 인계 목록에도 없었다. 여기까지는 닫힌 채 버퍼가 생길 수
  // 없어서 불활성이었다.
  it("닫힌 채 Tab을 누르면 치던 숫자가 확정된다", () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "3" });
    fireEvent.keyDown(field, { key: "1" });
    fireEvent.keyDown(field, { key: "Tab" });
    expect(field.textContent).toBe("2031. 07. 12.");
  });

  // 스펙 §3 — "`Enter`와 `Space`는 **두 상태 모두에서 항상** preventDefault한다." 열림
  // 쪽은 "버퍼 확정과 폐기" 블록이 이미 고정하고 있고, 닫힘 쪽은 지금까지 없었다.
  // jsdom은 <button>의 합성 click을 만들지 않으므로(직접 쟀다 — 그 블록의 주석 참고)
  // 증상으로는 영영 안 잡힌다. `defaultPrevented`를 직접 고정한다.
  it("닫힌 상태의 Enter도 preventDefault를 부른다", () => {
    const field = closedField();
    const event = createEvent.keyDown(field, { key: "Enter" });
    fireEvent(field, event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("닫힌 상태의 Space도 preventDefault를 부른다", () => {
    const field = closedField();
    const event = createEvent.keyDown(field, { key: " " });
    fireEvent(field, event);
    expect(event.defaultPrevented).toBe(true);
  });

  // 스펙 §6.4(3) — 네이티브 날짜 필드가 그렇게 한다. 세그먼트는 <span>이라 클릭이 트리거의
  // onClick으로 그대로 올라가고, 그 전에 `event.target`의 `data-unit`을 읽는다.
  //
  // 아래 둘은 **같은 클릭이 한 커밋에서 함께 일으키는 두 가지**라 서로를 가린다. 한 it에
  // 두면 앞 단언이 터질 때 뒤 단언은 실행조차 되지 않는다.
  function daySegment() {
    return document.querySelector<HTMLElement>('.date-wheel-segment[data-unit="day"]')!;
  }

  it("세그먼트를 클릭하면 그 세그먼트가 활성이 된다", () => {
    closedField();
    fireEvent.click(daySegment());
    expect(activeSegment()).toBe("day");
  });

  // ⚠️ **이름이 계약을 반대로 말하고 있었습니다.** 예전 이름은 "세그먼트를 클릭해도 **열기**
  // **토글**은 그대로 일어난다"였는데, 스펙 §6.4가 다시 쓰이면서 세그먼트 클릭은 **토글이**
  // **아닙니다** — 닫혀 있으면 열고 열려 있으면 그대로 둡니다. 단언은 그대로 옳습니다
  // (닫힌 상태에서는 어느 계약이든 열립니다). 바뀐 것은 **그 단언이 무엇의 증거인가**이고,
  // 옛 이름을 두면 다음 사람이 "세그먼트 클릭은 토글"로 읽습니다.
  //
  // 열린 상태 쪽은 "세그먼트 클릭은 여닫기 토글이 아니다" 블록이 따로 집니다.
  it("닫힌 채로 세그먼트를 클릭하면 열린다", async () => {
    closedField();
    fireEvent.click(daySegment());
    expect(await screen.findByRole("dialog", { name: "거래 날짜 선택" })).toBeTruthy();
  });

  // 구두점·아이콘·여백에는 `data-unit`이 없다 — 그때는 **활성을 안 바꾼다**(스펙 §6.4(3):
  // 클릭에는 "어느 세그먼트"라는 정보가 없으므로 키보드로 옮겨 둔 활성을 조용히 되돌리지
  // 않는다). `→`로 활성을 첫 세그먼트에서 갈라 놓고 본다.
  it("구두점을 클릭하면 활성 세그먼트가 바뀌지 않는다", () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.click(document.querySelector<HTMLElement>(".date-wheel-punctuation")!);
    expect(activeSegment()).toBe("month");
  });

  // ── 닫힘 `Escape` — Task 4 리뷰가 찾은 두 번째 구멍이고, **아예 구현돼 있지 않았다.**
  //    ⚠️ 소스 주석의 "남은 일(SEG Task 5)" 열거가 이것을 빠뜨리고 있었다(§3 표에는 있다).
  //
  //    두 경우를 각각 다른 `it`으로, `Dialog` 안에서 고정한다 — 전파를 정하는 것이 이
  //    조항의 전부라, 위를 받아 줄 것이 없으면 아무것도 관찰되지 않는다.
  //
  //    `closeOnBack={false}`인 이유: `useBackToClose`는 언마운트 정리에서 `setTimeout(0)`으로
  //    `history.back()`을 예약한다. 이 파일은 그 타이머를 흘려보내지 않으므로 켜 두면
  //    다음 테스트로 새어 나간다. Escape 계약에는 필요 없는 기능이다.
  function DateWheelInDialog({ onClose }: { onClose: () => void }) {
    const [value, setValue] = useState("2026-07-12");
    return <Dialog open onClose={onClose} ariaLabel="거래 수정" closeOnBack={false}>
      <DateWheelPicker ariaLabel="거래 날짜" value={value} onChange={setValue} />
    </Dialog>;
  }

  it("닫힌 채 버퍼가 있으면 Escape가 다이얼로그를 닫지 않는다", () => {
    const onClose = vi.fn();
    render(<DateWheelInDialog onClose={onClose} />);
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "3" });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  // ⚠️ **이쪽을 빠뜨리면 날짜 필드에 포커스가 있는 동안 다이얼로그가 Escape로 안 닫힌다.**
  // 스펙 §3이 두 경우를 각각 고정하라고 적어 둔 이유가 이것이다.
  it("닫힌 채 버퍼가 없으면 Escape가 그대로 전파돼 다이얼로그가 닫힌다", () => {
    const onClose = vi.fn();
    render(<DateWheelInDialog onClose={onClose} />);
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  // 위 둘은 `stopPropagation()`과 `if (!typing) return`을 각각 죽인다. **`setTyping(null)`은
  // 어느 쪽으로도 안 죽는다** — 지워도 둘 다 초록이다. 그 줄의 파수꾼이 이것이고, 단언
  // 하나로 "버퍼가 사라졌다"와 "값은 그대로다"(스펙 §4.2: Escape는 버퍼를 버리고 값을
  // 그대로 둔다)를 함께 본다.
  it("닫힌 채 Escape는 치던 숫자를 버리고 값을 그대로 둔다", () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "2" });
    fireEvent.keyDown(field, { key: "0" });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(field.textContent).toBe("2026. 07. 12.");
  });

  // ── 스펙 §6.4(1)의 시나리오. **이 Task가 처음으로 증명 가능하게 만든다** — 닫힌 채
  //    타이핑이 되기 전에는 이 순서를 밟을 수 없었다.
  //
  //    키보드만 쓰는 사용자가(= (가)안이 겨냥한 바로 그 사용자가) 자기가 친 날짜에 대해
  //    확정 신호를 보는가. Task 1이 세션 기준값의 수명을 고치지 않았다면 — 즉 여는 순간
  //    `sessionStartValueRef`를 찍는다면 — 첫 `Enter`가 기준값을 방금 친 2031로 덮어써
  //    두 번째 `Enter`가 "안 바뀌었다"고 읽고 신호가 영영 안 뜬다.
  //
  //    **신호는 노드 신원으로 본다.** `classList`로 보면 이전 확정의 클래스가 남아 거짓
  //    통과한다(08-06에 한 번 밟은 함정). `key={commitPulse}`가 바뀌어 트리거 안 span이
  //    리마운트됐는지를 본다 — 타이핑 자체는 commitPulse를 안 올리므로 `before`는 안전하다.
  it("닫힌 채 타이핑한 값을 Enter로 열어 Enter로 완료하면 확정 신호가 뜬다", () => {
    const field = closedField();
    for (const digit of ["2", "0", "3", "1"]) fireEvent.keyDown(field, { key: digit });
    const before = field.querySelector("span");

    fireEvent.keyDown(field, { key: "Enter" });   // 연다 — 여기서 기준값을 찍으면 안 된다
    fireEvent.keyDown(field, { key: "Enter" });   // 완료

    expect(field.querySelector("span")).not.toBe(before);
  });
});

// 설계 스펙 §4.2 — **버퍼의 수명.** 이 블록이 고정하는 것은 술어 하나다:
//
//   **떠나는 모든 경로는 버퍼 *자신의* unit으로 확정한다 — 활성 세그먼트가 아니라.**
//
// `commitAndClose`가 전부터 그렇게 했고(인자를 안 받고 `typing.unit`을 상태에서 읽음)
// 나머지 확정 경로는 `resolvedActiveUnit`을 넘기고 있었다. 둘이 갈라지는 문이 둘 있었다 —
// **트리거 세그먼트 클릭**과 **소비자의 런타임 `fields` 축소.**
//
// 리뷰가 실측한 시퀀스: 연도에 `3` → 일 세그먼트 클릭 → `↓` `←` `↓` `Enter` →
// **`2003-08-13`으로 확정된다.** 치다 만 `3`이 사라지는 것이 아니라 **살아남아 세션 끝에
// 연도를 2003년으로 만든다.** 같은 상태에서 `Tab`은 §3 계약과 반대로 버리고, `Backspace`는
// no-op이 되고, `←`/`→`는 확정도 폐기도 안 한다 — **증상이 넷이고 원인이 하나다.**
// 오너: **"마우스로 숫자를 누른다고 픽커가 닫히면 안 돼."**
//
// 세그먼트는 `<span>`이라 클릭이 트리거의 `onClick`에 그대로 올라가고, 그 핸들러가 여닫기
// **토글**이었습니다. 그래서 팝오버가 열린 채로 월을 눌러 월로 옮기려던 사람이 **팝오버를**
// **잃었습니다**(코디네이터 실브라우저 실측: open true → false, 활성은 year → month).
//
// 스펙 §6.4가 새 계약입니다: **세그먼트 클릭은 토글이 아닙니다.** 닫혀 있으면 열고, 열려
// 있으면 그대로 둡니다. 트리거의 나머지(여백·달력 아이콘)는 그대로 토글입니다. 가르는 선은
// "세그먼트를 눌렀는가" 하나이고 네이티브와도 같습니다 — 숫자는 캐럿을 옮기고 아이콘이
// 달력을 여닫습니다.
//
// ⚠️ **§4.2의 "세그먼트 클릭 → 버퍼 확정"은 그대로입니다.** 자리를 옮기는 조작이니까요.
// 바뀐 것은 여닫기뿐이고, 그 계약은 아래 "버퍼의 수명" 블록이 계속 지킵니다.
//
// ⚠️ **490개가 초록인 채로 이 결함이 지나갔습니다.** 세그먼트 클릭 뒤 `open`이 어떻게
// 되는지를 **보는 테스트가 하나도 없었기 때문**입니다 — 활성 세그먼트가 옮겨졌는지만 봤고,
// 그건 결함이 있어도 옳게 동작했습니다.
// 오너: **"완료 누르면 날짜에 선택돼 있는 것도 같이 안 보이게."**
//
// 활성 세그먼트 표시가 **포커스**에 걸려 있었습니다. 그런데 §6.2가 "이 컨트롤이 키보드를
// 받는 동안 포커스는 언제나 트리거"라고 정해 두었으므로, `완료`로 확정해 닫아도 포커스는
// 트리거에 그대로이고 **표시가 살아남습니다.** 확정한 뒤의 컨트롤은 **쉬는 중**이지 입력을
// 받는 중이 아닙니다(스펙 §4.5).
//
// 그래서 게이트가 **"편집 중"**으로 바뀝니다. 포커스 게이트는 **그대로 둡니다** — 편집 중은
// 포커스가 있어야 시작되지만, 둘을 다 걸어 두면 어느 하나가 새도 표시가 안 남습니다.
//
// **관측 대상은 트리거의 `editing` 클래스입니다.** `.active`는 컴포넌트가 활성 unit에 계속
// 붙이고(닫힌 채 `←`/`→`로 옮기는 계약이 그것을 씁니다), **감추는 일은 CSS가** 합니다 —
// 그 구조는 `activeSegment()` 헬퍼 주석에 있는 것과 같습니다.
// 오너 지시(실기기): **모바일에서는 날짜 팝오버를 위로 뒤집지 않습니다.** 아래로 열되,
// 아래 공간이 모자라면 **스크롤 호스트를 움직여 자리를 만든 뒤** 아래로 엽니다(스펙 §7.0).
//
// 뒤집힘이 모바일에서 나쁜 이유 둘: 손가락이 필드 아래에 있는데 팝오버가 위에 뜨면 **손이**
// **내용을 가리고**, 같은 필드를 두 번 열 때 **자리가 오락가락**해 조준을 다시 하게 만듭니다.
//
// ⚠️⚠️ **이 블록이 증명하는 것과 못 하는 것.**
// **증명합니다:** 위로 뒤집지 않는다는 것, 그리고 **얼마나 움직이라고 요청했는가**.
// **증명하지 못합니다:** 실제로 그 자리에 떴는가. jsdom은 레이아웃을 하지 않아
// `getBoundingClientRect`가 전부 0이고(그래서 아래 헬퍼가 값을 심습니다), 스크롤을 줘도
// **rect가 따라 움직이지 않습니다.** 실제 배치는 스크롤 뒤 다시 재는 것으로 맞추는데
// (`placePicker`가 scroll 리스너에 물려 있습니다) 그 되먹임이 jsdom에는 없습니다.
// **실기기 확인 항목입니다.**
describe("DateWheelPicker 모바일에서는 아래로 열고 자리를 만든다", () => {
  // jsdom은 rect를 항상 0으로 주므로 심습니다 — tests/AppShell.test.tsx가 쓰는 것과 같은 방법.
  function putTriggerAt(trigger: HTMLElement, top: number, height = 41) {
    Object.defineProperty(trigger, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top, bottom: top + height, left: 16, right: 300, width: 284, height, x: 16, y: top, toJSON: () => ({}) }),
    });
  }
  function setViewport(width: number, height: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  }
  // jsdom에서 document.scrollingElement가 null인 경우가 있어 소스와 같은 폴백을 씁니다.
  const host = () => (document.scrollingElement ?? document.documentElement) as HTMLElement;

  afterEach(() => {
    setViewport(1024, 768);
    host().scrollTop = 0;
    host().style.paddingBottom = "";
  });

  function openAt(top: number) {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");
    putTriggerAt(trigger, top);
    fireEvent.click(trigger);
    return trigger;
  }
  const popover = () => document.querySelector<HTMLElement>(".date-wheel-popover")!;

  // 팝오버는 `position: fixed`에 좌표가 인라인으로 들어갑니다. "아래로 열렸다"는
  // **top이 트리거 아래**(bottom + gap)라는 것으로 봅니다.
  it("모바일에서 아래가 모자라도 위로 뒤집지 않는다", async () => {
    setViewport(390, 780);
    const trigger = openAt(560);   // 아래로 220 - inset밖에 없어 318이 안 들어간다
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(parseFloat(popover().style.top)).toBeGreaterThan(trigger.getBoundingClientRect().top);
  });

  // **필요한 만큼만** 움직입니다. 318 + 6(gap)에서 지금 아래 공간을 뺀 만큼.
  //
  // 아래 공간 = 780(뷰포트) - 78(bottomInset) - 601(트리거 bottom) = 101.
  // 부족분 = 324 - 101 = **223**.
  //
  // ⚠️ 78은 `mobileBottomInset`의 기본값(모바일 하단 바가 차지하는 자리)이고, **모바일에서만**
  // 쓰입니다 — 데스크톱은 8입니다. 그 분기가 곧 이 기능이 재사용하는 모바일 판정이라,
  // 여기 숫자가 8이 아니라 78인 것 자체가 "새 경계를 만들지 않았다"는 증거입니다.
  // (처음엔 8로 계산해 153을 기대했다가 실측 223에 부딪혀 바로잡았습니다.)
  it("모자란 만큼만 스크롤 호스트를 움직인다", async () => {
    setViewport(390, 780);
    openAt(560);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(host().scrollTop).toBe(223);
  });

  // **필드를 화면 위로 밀어내면 안 됩니다.** 트리거가 이미 위쪽(top 40)에 있으면 위로 갈 수
  // 있는 여유는 40 - 8(edge) = 32뿐이고, 부족분이 그보다 커도 32만 움직입니다.
  it("필드가 화면 위로 사라지도록 움직이지는 않는다", async () => {
    setViewport(390, 420);
    openAt(40);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(host().scrollTop).toBe(32);
  });

  // **대조군 — 데스크톱은 그대로입니다.** 뒤집기는 데스크톱에서 여전히 옳습니다(포인터가
  // 내용을 가리지 않고, 화면이 넓어 뒤집혀도 조준이 안 흔들립니다). 경계는 이 파일이 이미
  // 쓰는 모바일 판정(`window.innerWidth <= 760`)을 **재사용**하고 새로 만들지 않습니다.
  // ⚠️ 이 단정은 한동안 `parseFloat(style.top) < trigger.top`이었습니다. **그 형태로는 아무것도**
  // **증명되지 않습니다** — 팝오버가 트리거에서 396px 떨어져 화면 꼭대기(top 8)에 붙어도
  // `8 < 560`이라 통과했고, 실제로 그 결함이 살아 있는 동안 내내 초록이었습니다.
  // 위로 열 때의 앵커가 `bottom`이 된 지금은 **정확한 값**으로 못박습니다: 780 - 560 + 6.
  it("데스크톱에서는 아래가 모자라면 위로 뒤집는다", async () => {
    setViewport(1024, 780);
    openAt(560);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(popover().style.bottom).toBe("226px");
  });

  // ⚠️ **바로 위 테스트는 "위에 있다"만 봅니다 — 그것으로는 아무것도 증명되지 않습니다.**
  // 결함이 완전히 살아 있는 상태에서도 통과합니다: 팝오버가 화면 꼭대기(top 8)에 붙어 버려도
  // `8 < 560`이라 참입니다. 실측(Chromium 1280×1000, 트리거 top 715.4, 데모 `거래 날짜`):
  // `style.top = 8`, `style.maxHeight = 701.4`, 팝오버 실제 높이 310.8 —
  // **아래끝과 트리거 윗변 사이가 396.6px 비었습니다.**
  //
  // 원인은 `top`을 팝오버의 **실제 높이**가 아니라 **위에 남은 공간 전체**(`maxHeight`)에서
  // 빼는 것입니다. `maxHeight`가 `Math.min(desiredHeight, …)`로 318에 묶여 있던 동안에는
  // 그 뺄셈이 우연히 맞았고, `5207c9c`가 그 상한을 없애면서(옳은 변경이었습니다) 같이
  // 무너졌습니다 — 그 커밋은 **아래로 여는 경우만** 검증했습니다.
  //
  // 그래서 "붙어 있다"를 **값으로** 못박고, 앵커를 `bottom`으로 바꿉니다. `bottom`은 팝오버
  // 높이를 몰라도 정해집니다 — 첫 배치는 팝오버가 마운트되기 전이라 실브라우저에서도 높이를
  // 잴 수 없고, jsdom은 레이아웃 자체가 없어 영원히 못 잽니다.
  //
  // 지오메트리는 **오너가 실제로 본 그 배치**입니다(1280×1000, 트리거 top 715):
  // `bottom = 1000 - 715 + 6 = 291`. 고치기 전 이 자리의 실제 값은 `top: 8px` / `bottom: ''`.
  it("위로 뒤집으면 팝오버 아래끝이 트리거 바로 위에 붙는다", async () => {
    setViewport(1280, 1000);
    openAt(715);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(popover().style.bottom).toBe("291px");
  });

  // **`it`을 나눈 이유:** 위 단정이 먼저 터지면 아래는 실행조차 안 되고, 둘은 같은 한 줄
  // (`setPosition`의 인자)이 만드는 서로 다른 증상이라 순서를 바꿔도 서로를 가립니다.
  //
  // 위로 열 때 `top`이 함께 남아 있으면 상자의 높이가 고정된 것처럼 되어, `maxHeight`로
  // 잘리는 순간 아래끝이 다시 트리거에서 떨어집니다.
  it("위로 뒤집으면 top은 비어 있다", async () => {
    setViewport(1280, 1000);
    openAt(715);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(popover().style.top).toBe("");
  });

  // **대조군 — 아래로 열 때는 `bottom`을 쓰지 않습니다.** 이 단정은 고치기 전에도 초록이고
  // 그래서 결함의 증거가 아닙니다. 잡는 것은 **고침이 넘치는 것**입니다: `bottom`을 분기
  // 없이 항상 넣으면 상자가 위아래로 동시에 묶여 `maxHeight`를 무시하고 늘어납니다.
  // (뮤테이션: `setPosition`에서 `openAbove ?` 삼항을 떼고 `bottom`을 무조건 넘기면 빨개집니다.)
  it("아래로 열 때는 bottom을 쓰지 않는다", async () => {
    setViewport(1024, 1200);
    openAt(100);   // 아래로 1092 — 넉넉하므로 뒤집지 않는다
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(popover().style.bottom).toBe("");
  });

  // 그리고 데스크톱에서는 **스크롤을 건드리지 않습니다.**
  it("데스크톱에서는 스크롤 호스트를 움직이지 않는다", async () => {
    setViewport(1024, 780);
    openAt(560);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(host().scrollTop).toBe(0);
  });

  // **자리가 충분하면 아무것도 안 움직입니다** — "모바일이면 무조건 스크롤"이 아닙니다.
  it("모바일이라도 자리가 충분하면 스크롤하지 않는다", async () => {
    setViewport(390, 780);
    openAt(100);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(host().scrollTop).toBe(0);
  });

  // **한 번 요청하면 그 열림 동안은 다시 요청하지 않습니다.** 자리 확보 이펙트의 deps에
  // `position`이 들어 있고 `placePicker`는 스크롤마다 새 객체를 내므로, 가드가 없으면
  // **스크롤할 때마다 또 밀어** 스크롤이 제 꼬리를 뭅니다 — 그리고 사용자가 그 사이 되돌려도
  // 컨트롤이 다시 뺏습니다.
  //
  // 뮤테이션으로 확인했더니 기존 테스트로는 **도달하지 않습니다**(스크롤 이벤트를 아무도
  // 일으키지 않아 이펙트가 두 번 돌 일이 없었습니다). 등가가 아니라 미도달이라 여기서
  // 스크롤을 한 번 일으켜 도달시킵니다.
  it("한 열림 동안 자리 확보는 한 번만 요청한다", async () => {
    setViewport(390, 780);
    openAt(773);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    const afterOpen = host().scrollTop;

    fireEvent.scroll(document);   // placePicker가 다시 돌고 position이 새 객체가 된다

    expect([afterOpen, host().scrollTop]).toEqual([436, 436]);
  });

  // **자리 확보는 열림마다 다시 합니다.** 요청은 열림당 한 번이지만 그 플래그는 닫힐 때
  // 되돌아가야 하고, 안 그러면 **두 번째 열림부터 자리를 안 만듭니다.**
  //
  // 뮤테이션으로 확인했더니 위 테스트들로는 **도달하지 않습니다** — 매번 새로 render 하므로
  // 컴포넌트가 새것이고 ref도 새것입니다. 등가가 아니라 미도달이라, 같은 컴포넌트에서 두 번
  // 여는 경로를 따로 둡니다. (사용자가 그 사이 스크롤을 되돌린 상황을 흉내 내려고 0으로
  // 돌려놓고 다시 엽니다.)
  it("두 번째로 열 때도 자리를 다시 만든다", async () => {
    setViewport(390, 780);
    const trigger = openAt(560);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
    host().scrollTop = 0;

    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(host().scrollTop).toBe(223);
  });

  // ⚠️ **팝오버 스크롤바의 진짜 원인은 자리가 아니라 상한이었습니다.** 제 첫 진단("스크롤
  // 범위가 없어서")은 **틀렸고 코디네이터가 실브라우저 트레이스로 반증했습니다** — 열리는
  // 순간 호스트에 708px이 더 남아 있었고 실제로 324px 스크롤도 됐는데 스크롤바가 났습니다.
  //
  // 실측: 뷰포트 375x812, 트리거가 **화면 위쪽**(top 36)이라 아래가 812px 통째로 비어 있어도
  // `styleMaxHeight 318 / clientHeight 316 / scrollHeight 321`. **자리와 무관하게 항상**
  // **넘칩니다.** `maxHeight = Math.min(desiredHeight, available)`에서 `desiredHeight = 318`이
  // 하드코딩인데 실제 내용은 그보다 큽니다. `main`에도 글자까지 같은 결함입니다.
  //
  // 고침은 `desiredHeight`의 **두 역할을 가르는 것**입니다 — "이만큼 있으면 좋겠다"는 문턱은
  // 남기고, **높이 상한 역할은 뺍니다.** 자리가 넉넉하면 상자는 내용 높이로 잡히고 좁을 때만
  // 잘립니다.
  //
  // 아래 계산: 뷰포트 780 - 78(bottomInset) - 77(트리거 bottom) = 625가 아래 공간이고,
  // `available = max(230, 625 - 6)` = 619입니다. 고치기 전에는 318로 잘렸습니다.
  it("자리가 넉넉하면 팝오버 높이가 상수로 잘리지 않는다", async () => {
    setViewport(390, 780);
    openAt(36);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(popover().style.maxHeight).toBe("619px");
  });

  // 좁을 때는 여전히 잘립니다 — 그때 스크롤바가 나는 것은 옳습니다. 상한을 통째로 없애면
  // (예: maxHeight를 안 걺) 팝오버가 화면 밖으로 자랍니다.
  it("자리가 좁으면 남은 만큼으로 잘린다", async () => {
    setViewport(390, 420);
    openAt(40);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    // 420 - 78 - 81 = 261 -> available = max(230, 261 - 6) = 255
    expect(popover().style.maxHeight).toBe("255px");
  });

  // **끝까지 스크롤해도 모자라는 경우가 남습니다**(뷰포트가 아주 낮거나 트리거 위 여유가
  // 작을 때). 그때는 §7.0대로 `maxHeight`로 줄이는 것이 맞지만, 줄이면 **잘리는 쪽이**
  // **하필 액션 행**입니다 — 그리고 `오늘`·`완료`는 **이 컨트롤을 끝내는 유일한 버튼**입니다.
  //
  // 그래서 액션 행을 팝오버 바닥에 **붙입니다**(sticky). 잘리는 것은 휠 쪽이고 버튼은 언제나
  // 손에 닿습니다. 이 킷은 같은 문제를 `Dialog`에서 이미 같은 방법으로 풀었습니다
  // (`css/dialog.css`의 `.dialog-scroll > .dialog-actions`) — 음수 `bottom`으로 컨테이너
  // 패딩을 상쇄하고, 뒤 내용이 비치지 않게 불투명 배경을 깝니다.
  //
  // ⚠️ jsdom은 레이아웃이 없어 sticky가 **실제로 붙는지**는 볼 수 없습니다. 여기서 보는 것은
  // 규칙의 존재와 값이고, 붙는 모습은 실기기 항목입니다.
  it("액션 행은 팝오버 바닥에 붙는다 — 잘려도 오늘·완료에 닿는다", () => {
    const rule = /\.date-wheel-actions \{[^}]*\}/.exec(datePickerCssSource)?.[0] ?? "(액션 규칙이 없다)";
    expect(rule).toMatch(/position:\s*sticky;[^}]*bottom:\s*-12px/);
  });

  // 붙기만 하고 배경이 없으면 아래로 지나가는 휠이 버튼 위로 비칩니다.
  it("그 행은 불투명 배경을 갖는다", () => {
    const rule = /\.date-wheel-actions \{[^}]*\}/.exec(datePickerCssSource)?.[0] ?? "(액션 규칙이 없다)";
    expect(rule).toMatch(/background:\s*var\(--surface\)/);
  });

  // 오너: **"피커는 괜찮은데 오늘/완료 버튼이 잘려서 스크롤이 되네."**
  //
  // **트리거가 하단 바 자리(bottomInset)보다 아래에 있을 때**입니다. `dropdownViewportSpace`가
  // `below`를 `Math.max(0, …)`로 클램프하므로, 진짜 부족분이 **음수**인데 0으로 읽힙니다.
  // 실브라우저로 갈랐습니다(요청을 가로채 기록):
  //
  //     trueBelow      -78.5      ← 클램프 전
  //     clamped         0
  //     요청한 값     324         = 318 + 6 - 0
  //     옳은 값       402.5       = 318 + 6 - (-78.5)
  //     324를 적용하면 below 246 -> available 239.5, 내용 308 -> **68px 잘림**
  //
  // 즉 **분기는 돌았고 대상도 옳았습니다**(`root`에 `scrollTo({top: 752})`가 실제로 나갔습니다).
  // 틀린 것은 **요청량**이었습니다. 그리고 `desiredHeight`(318)도 실제 내용의 대역일 뿐이라
  // (데모 308, 오너 앱 321) **마운트된 팝오버를 재서 그보다 크면 그쪽을 씁니다.**
  //
  // 계산: 780 - 78(inset) - 814(트리거 bottom) = -112가 진짜 아래 공간이고,
  // 필요량 = max(318, 팝오버 scrollHeight) + 6 = 324(jsdom은 레이아웃이 없어 scrollHeight가 0),
  // 부족분 = 324 - (-112) = **436**. 트리거 위 여유는 773 - 8 = 765라 그대로 436을 요청합니다.
  it("트리거가 하단 바 아래에 있으면 클램프되지 않은 부족분만큼 움직인다", async () => {
    setViewport(390, 780);
    openAt(773);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(host().scrollTop).toBe(436);
  });

  // 아주 좁을 때의 **바닥**. 뮤테이션으로 확인했더니 위 두 테스트로는 도달하지 않습니다
  // (둘 다 남은 자리가 230보다 커서 바닥이 안 걸립니다) — 등가가 아니라 미도달이라,
  // 바닥이 실제로 무는 자리를 따로 만듭니다. 바닥이 없으면 상자가 몇십 px로 줄어
  // 아무것도 못 고릅니다.
  it("자리가 아주 좁아도 최소 높이 아래로는 줄지 않는다", async () => {
    setViewport(390, 300);
    openAt(40);   // 아래 공간 300 - 78 - 81 = 141 -> 바닥이 없으면 135px
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(popover().style.maxHeight).toBe("230px");
  });

  // 뒤집기 **문턱**이 실제로 `desiredHeight`라는 것. 이것도 미도달이었습니다 — 기존 데스크톱
  // 테스트는 아래 공간이 171px이라 문턱이 230이든 318이든 똑같이 뒤집힙니다. 그 사이 값
  // (270)에서만 갈립니다.
  it("데스크톱 뒤집기 문턱은 원하는 높이다 — 최소 높이가 아니다", async () => {
    setViewport(1024, 780);
    openAt(461);   // 아래 공간 780 - 8 - 502 = 270
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    // 뒤집혔다는 관측 대상이 `bottom`으로 바뀌었습니다(위 "아래가 모자라면 위로 뒤집는다"의
    // 주석 참고). 780 - 461 + 6 = 325. 문턱이 230이면 뒤집지 않아 `bottom`이 빈 문자열입니다.
    expect(popover().style.bottom).toBe("325px");
  });

  // 오너 실기기: **아주 아래에 있는 피커를 열면 팝오버에 스크롤바가 생깁니다.**
  // U2가 만든 자리입니다 — 스크롤을 요청해도 **호스트에 더 내려갈 범위가 없으면** 아무 일도
  // 일어나지 않고, 아래 공간이 그대로라 `maxHeight`가 줄면서 `.date-wheel-popover`의
  // `overflow-y: auto`가 스크롤바를 냅니다.
  //
  // **고침: 팝오버가 열려 있는 동안 스크롤 호스트의 범위를 그만큼 늘립니다.** 이 킷이 가상
  // 키보드에서 `padding-bottom`으로 자리를 예약하는 것과 같은 계열입니다. 트리거가 문서
  // 끝에 있어도 필요한 만큼 내려갈 수 있게 됩니다. 원하는 높이를 줄이는 대안은 "열 다섯
  // 줄이 보인다"는 §5 계약을 건드리므로 안 골랐습니다. 위로 뒤집는 것은 §7.0이 금지합니다.
  //
  // ⚠️ **늘렸으면 닫을 때 되돌려야 합니다** — 안 그러면 페이지가 영영 길어집니다.
  // **스크롤 위치는 안 되돌립니다**(§7.0 Agency). 되돌리는 것은 **예약뿐**입니다.
  //
  // ⚠️ jsdom은 레이아웃이 없어 `scrollHeight`·`clientHeight`가 0이므로 "남은 범위"가 언제나
  // 0으로 읽힙니다. 그래서 여기서 보는 것은 **요청한 예약량**이고, "실기기에서 스크롤바가
  // 사라지는가"는 이 블록 맨 위 주석의 한계 그대로 **실기기 항목**입니다.
  it("아래 범위가 모자라면 스크롤 호스트에 그만큼 자리를 예약한다", async () => {
    setViewport(390, 780);
    openAt(560);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(host().style.paddingBottom).toBe("223px");
  });

  it("닫으면 예약을 되돌린다", async () => {
    setViewport(390, 780);
    openAt(560);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());

    expect(host().style.paddingBottom).toBe("");
  });

  // 되돌리는 것은 **예약뿐**입니다. 스크롤 위치까지 되돌리면 사용자의 자리를 뺏습니다.
  it("예약을 되돌려도 스크롤 위치는 그대로다", async () => {
    setViewport(390, 780);
    openAt(560);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    const moved = host().scrollTop;

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());

    expect([moved > 0, host().scrollTop]).toEqual([true, moved]);
  });

  it("데스크톱에서는 자리를 예약하지 않는다", async () => {
    setViewport(1024, 780);
    openAt(560);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(host().style.paddingBottom).toBe("");
  });

  it("모바일이라도 자리가 충분하면 예약하지 않는다", async () => {
    setViewport(390, 780);
    openAt(100);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    expect(host().style.paddingBottom).toBe("");
  });

  // **닫을 때 되돌리지 않습니다.** `apple-design` §16.2 Agency — 그 사이 사용자가 스크롤했을
  // 수도 있고, 컨트롤이 사용자의 자리를 뺏으면 안 됩니다. 이 킷은 같은 판단을 이미
  // 한 번 내렸습니다.
  it("닫아도 스크롤을 되돌리지 않는다", async () => {
    setViewport(390, 780);
    const trigger = openAt(560);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    const moved = host().scrollTop;

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());

    expect([moved > 0, host().scrollTop]).toEqual([true, moved]);
  });
});

// 오너: **"esc로 피커를 닫으면 현재 고르고 있던 상태로 저장돼. esc는 기존값으로 닫고,
// 적용하는 건 space bar랑 enter가 해야 해."**
//
// 스펙의 "`Escape`는 값을 바꾸지 않고 닫는다"는 **오랫동안 거짓이었습니다.** 이 컨트롤은
// 화살표 한 번·휠 한 칸·행 클릭 하나마다 **곧바로 `onChange`를 부르므로**, `Escape`를 누르는
// 시점엔 값이 이미 여러 번 바뀐 뒤입니다. `Escape`가 버리던 것은 **타이핑 버퍼뿐**이었습니다.
//
// 새 계약(스펙 §3): **`Escape`는 팝오버가 열린 순간의 값으로 되돌리고 닫습니다.**
// `Enter`·`Space`·`완료`는 적용하고 닫습니다(그대로).
describe("DateWheelPicker Escape는 열기 직전 값으로 되돌린다", () => {
  function openWith(initialValue = "2026-07-12") {
    const onChange = vi.fn();
    function Controlled() {
      const [value, setValue] = useState(initialValue);
      return <DateWheelPicker ariaLabel="거래 날짜" value={value} onChange={(next) => { onChange(next); setValue(next); }} />;
    }
    render(<Controlled />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();
    return { onChange, trigger };
  }

  it("열고 화살표로 옮긴 뒤 Escape면 열기 직전 값으로 돌아온다", async () => {
    const { trigger } = openWith();
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() => expect(trigger.textContent).toBe("2027. 07. 12."));

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(trigger.textContent).toBe("2026. 07. 12."));
  });

  // 되돌림도 `onChange` 한 번입니다 — 소비자는 중간값들을 이미 받았고, 되돌림은 그
  // 마지막을 정정하는 호출입니다.
  it("되돌림은 onChange 한 번으로 알린다", async () => {
    const { onChange, trigger } = openWith();
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() => expect(trigger.textContent).toBe("2027. 07. 12."));
    onChange.mockClear();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(onChange.mock.calls.flat()).toEqual(["2026-07-12"]));
  });

  // ⚠️ **안 바뀌었으면 부르지 않습니다.** 안 바뀐 값을 다시 보내면 소비자의 dirty 판정이
  // 더러워집니다. 이것이 없으면 "무조건 onChange(열기 직전 값)"으로 고쳐도 위가 통과합니다.
  it("아무것도 안 바꿨으면 Escape는 onChange를 부르지 않는다", async () => {
    const { onChange, trigger } = openWith();
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    onChange.mockClear();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });

  // ⚠️⚠️ **되돌아가는 곳은 "열기 직전"이지 "포커스를 얻었을 때"가 아닙니다.**
  // §12의 확정 신호가 쓰는 `sessionStartValueRef`는 **포커스**에서 찍히므로 수명이 다릅니다
  // (스펙 §3이 "합치려 들지 말라"고 못 박은 자리입니다). 닫힌 채로 2031을 친 뒤 열어서
  // `Escape`를 누르면 2031로 돌아와야 합니다 — 2026이 아니라. **둘을 한 ref로 합치면
  // 여기가 2026을 내놓습니다.**
  it("닫힌 채 타이핑한 뒤 열어서 Escape면, 포커스 시점이 아니라 열기 직전으로 돌아온다", async () => {
    const { trigger } = openWith();
    for (const digit of ["2", "0", "3", "1"]) fireEvent.keyDown(trigger, { key: digit });
    await waitFor(() => expect(trigger.textContent).toBe("2031. 07. 12."));

    fireEvent.keyDown(trigger, { key: "ArrowDown" });   // 닫힌 채로 열린다(§3) — 아직 값은 그대로
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    // 네 자리를 다 치면 활성이 월로 넘어가므로(§4.4 advance) 이 ↓는 **월**을 움직인다.
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() => expect(trigger.textContent).toBe("2031. 08. 12."));

    fireEvent.keyDown(document, { key: "Escape" });

    // 열기 직전은 2031-07-12다. 포커스 시점이었다면 2026-07-12이 나온다.
    await waitFor(() => expect(trigger.textContent).toBe("2031. 07. 12."));
  });

  // **대조군 — 적용하는 쪽은 그대로입니다.**
  it("Enter는 고른 값을 적용하고 닫는다", async () => {
    const { trigger } = openWith();
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() => expect(trigger.textContent).toBe("2027. 07. 12."));

    fireEvent.keyDown(trigger, { key: "Enter" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
    expect(trigger.textContent).toBe("2027. 07. 12.");
  });

  // **뒤로가기도 되돌립니다**(오너 답, 스펙 §3의 표). 폰에는 `Escape`가 없고 이 킷은 이미
  // 뒤로가기를 "가장 안쪽 오버레이를 닫는 키"로 씁니다(`useBackToClose`) — 취소하려는 사람이
  // 폰에서 누를 수 있는 것이 그것뿐이라 **뒤로가기가 모바일의 `Escape`**입니다. 다르게 두면
  // 같은 의도가 기기에 따라 다른 결과를 냅니다.
  it("뒤로가기도 열기 직전 값으로 되돌린다", async () => {
    const { trigger } = openWith();
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() => expect(trigger.textContent).toBe("2027. 07. 12."));

    fireEvent.popState(window, { state: null });

    await waitFor(() => expect(trigger.textContent).toBe("2026. 07. 12."));
  });

  // ⚠️⚠️ **이 표에서 제일 중요한 대조군.** 바깥 클릭은 **적용**합니다 — "취소"가 아니라
  // **"그만 본다"**입니다. 다른 걸 누르러 간 사람에게서 방금 고른 값을 뺏으면, 되돌리기가
  // 없는 이 컨트롤에서는 복구할 방법이 없습니다.
  //
  // **지금 그런 것은 우연이고, 그래서 고정합니다** — 되돌림을 "닫힘 전체"로 넓히는 고침에
  // 바깥 클릭이 딸려 들어가면 이것 말고는 잡을 것이 없습니다.
  it("바깥 클릭은 되돌리지 않는다 — 마지막 값을 적용한다", async () => {
    const { trigger } = openWith();
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() => expect(trigger.textContent).toBe("2027. 07. 12."));

    fireEvent.pointerDown(document.body, { button: 0 });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
    expect(trigger.textContent).toBe("2027. 07. 12.");
  });
});

describe("DateWheelPicker 활성 표시는 편집 중에만", () => {
  function open() {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();
    fireEvent.click(trigger);
    return trigger;
  }
  const editing = (trigger: HTMLElement) => trigger.classList.contains("editing");

  it("팝오버를 열면 편집이 시작된다", async () => {
    const trigger = open();
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    expect(editing(trigger)).toBe(true);
  });

  // 위는 **클릭**으로 엽니다. 키보드로 여는 경로는 코드가 다르고, 뮤테이션으로 확인했더니
  // 위 테스트로는 **도달하지 않습니다**(그 줄의 setEditing을 지워도 전부 초록이었습니다).
  // 등가라서가 아니라 미도달이라, 도달하는 테스트를 따로 둡니다.
  it("키보드로 열어도 편집이 시작된다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    expect(trigger.classList.contains("editing")).toBe(true);
  });

  // **오너가 말한 그것.**
  it("완료로 확정하면 편집이 끝난다", async () => {
    const trigger = open();
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    await waitFor(() => expect(editing(trigger)).toBe(false));
  });

  // `Enter`는 `완료`와 같은 `commitAndClose`를 탄다. 같은 뮤테이션에 함께 죽지만, 이 킷에서
  // 같은 규칙이 두 곳에 복제됐을 때 갈라지지 않은 적이 없어 짝으로 고정한다.
  it("Enter로 확정해도 편집이 끝난다", async () => {
    const trigger = open();
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    fireEvent.keyDown(trigger, { key: "Enter" });

    await waitFor(() => expect(editing(trigger)).toBe(false));
  });

  // **끝났다고 영영 끝난 것이 아닙니다** — 다시 세그먼트를 겨냥한 조작을 하면 돌아옵니다.
  // 이것이 없으면 "확정 뒤 영영 표시 없음"으로 고쳐도 위가 통과합니다.
  it("확정한 뒤 숫자를 치면 편집이 다시 시작된다", async () => {
    const trigger = open();
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(editing(trigger)).toBe(false));

    fireEvent.keyDown(trigger, { key: "2" });

    expect(editing(trigger)).toBe(true);
  });

  it("확정한 뒤 ←/→로 세그먼트를 옮겨도 편집이 다시 시작된다", async () => {
    const trigger = open();
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(editing(trigger)).toBe(false));

    fireEvent.keyDown(trigger, { key: "ArrowRight" });

    expect(editing(trigger)).toBe(true);
  });

  it("포커스를 잃으면 편집이 끝난다", async () => {
    const trigger = open();
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    fireEvent.blur(trigger);

    expect(editing(trigger)).toBe(false);
  });

  // **끝은 경로를 세지 않고 "닫힌다" 자체입니다**(스펙 §4.5). 한동안 끝을
  // `Enter`·`완료`·`Escape`·blur로 **열거**하고 있었고 뒤로가기가 빠져 있었습니다 —
  // 오너가 실기기에서 잡았습니다: **"뒤로가기로 피커를 닫았을 때 활성 세그먼트가 안
  // 없어진다."** 바깥 클릭도 같은 구멍이었습니다. 닫는 경로는 이미 여섯이고 앞으로도
  // 늘어나므로, **세는 방식은 셀 때마다 하나씩 빠집니다.**
  it("뒤로가기로 닫아도 편집이 끝난다", async () => {
    const trigger = open();
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    fireEvent.popState(window, { state: null });

    await waitFor(() => expect(editing(trigger)).toBe(false));
  });

  it("바깥을 눌러 닫아도 편집이 끝난다", async () => {
    const trigger = open();
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    fireEvent.pointerDown(document.body, { button: 0 });

    await waitFor(() => expect(editing(trigger)).toBe(false));
  });

  // ⚠️ **"닫혀 있다"가 아니라 "닫히는 순간"입니다.** 닫힌 채 숫자를 치는 것은 (가)안의
  // 핵심이고(스펙 §3), 그때 편집은 **계속돼야** 합니다. "닫혀 있으면 편집 아님"으로
  // 구현하면 위 둘은 통과하면서 이것이 빨개집니다.
  it("닫힌 채로 숫자를 치면 편집이 계속된다", () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();

    fireEvent.keyDown(trigger, { key: "2" });

    expect([screen.queryByRole("dialog", { name: "거래 날짜 선택" }) === null, editing(trigger)]).toEqual([true, true]);
  });

  // ⚠️ **이 하나는 오너가 말한 범위를 넘습니다.** 오너는 `완료`만 말했고, `Escape`를 끝으로
  // 보는 것은 스펙 §4.5가 명시적으로 "실기기에서 보고 정할 항목"으로 표시해 둔 판단입니다
  // ("값을 바꾸지 않고 떠난다"로 볼 수도, "되돌린 뒤 계속 편집"으로 볼 수도 있습니다).
  // 되돌리기 쉽도록 **테스트를 따로** 두었습니다 — 판단이 뒤집히면 이 it 하나만 지웁니다.
  it("Escape로 닫으면 편집이 끝난다 — 오너 범위 밖, 실기기 판단 항목", async () => {
    const trigger = open();
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(editing(trigger)).toBe(false));
  });

  // **포커스 게이트를 지웠는지 본다.** 게이트가 하나로 줄면 편집 중인 채 포커스를 잃는
  // 경로에서 표시가 남습니다. 규칙은 여전히 **하나**이고 조건이 하나 붙었을 뿐입니다.
  it("규칙은 하나이고, 포커스와 편집 중 둘 다 건다", () => {
    const rules = datePickerCssSource.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+(?=\{)/g) ?? [];
    const painting = rules.map((r) => r.replace(/\s+/g, " ").trim()).filter((r) => /\.date-wheel-segment\.active/.test(r));
    expect(painting).toEqual([".date-wheel-trigger.editing:focus-within .date-wheel-segment.active"]);
  });
});

describe("DateWheelPicker 세그먼트 클릭은 여닫기 토글이 아니다", () => {
  function openState() {
    return screen.queryByRole("dialog", { name: "거래 날짜 선택" }) !== null;
  }
  function segment(unit: string) {
    return document.querySelector<HTMLElement>(`.date-wheel-segment[data-unit="${unit}"]`)!;
  }

  // ⚠️ **"닫지 않는다"를 "아무것도 안 한다"로 구현하면 마우스 사용자가 팝오버를 못 엽니다.**
  // 닫힌 채로 세그먼트를 누르는 것이 마우스로 이 컨트롤에 들어가는 경로입니다.
  it("닫힌 채로 세그먼트를 누르면 열리고, 그 세그먼트가 활성이 된다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    fireEvent.click(segment("month"));

    await waitFor(() => expect(openState()).toBe(true));
    expect(activeSegment()).toBe("month");
  });

  // **이번 결함.** 두 사실을 한 단언으로 본다 — `expect()`가 단락하므로 나눠 쓰면 앞이
  // 터질 때 뒤가 실행조차 안 되고, 여기서 알고 싶은 것은 **"열린 채로 옮겨졌는가"라는 한
  // 쌍**이다. 고치기 전에는 [false, "month"]다 — 옮기기는 옳게 하면서 닫아 버린다.
  it("열린 채로 세그먼트를 누르면 열린 채로 있고, 그 세그먼트가 활성이 된다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    fireEvent.click(fieldOf("거래 날짜"));
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    fireEvent.click(segment("month"));

    expect([openState(), activeSegment()]).toEqual([true, "month"]);
  });

  // **대조군.** 트리거의 세그먼트가 **아닌** 곳(버튼 자신 = 여백·아이콘 자리)은 그대로
  // 토글이다. 이것이 없으면 "세그먼트 클릭이 아무것도 안 한다"는 물론 "트리거 클릭이 절대
  // 안 닫는다"로 고쳐도 위 둘이 통과한다.
  it("세그먼트가 아닌 곳을 누르면 그대로 닫힌다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const field = fieldOf("거래 날짜");
    fireEvent.click(field);
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });

    fireEvent.click(field);

    await waitFor(() => expect(openState()).toBe(false));
  });
});

describe("DateWheelPicker 버퍼의 수명 — 확정은 버퍼 자신의 unit으로", () => {
  function ControlledWithSpy({ initialValue, onChange }: { initialValue: string; onChange: (value: string) => void }) {
    const [value, setValue] = useState(initialValue);
    return <DateWheelPicker ariaLabel="거래 날짜" value={value} onChange={(next) => { onChange(next); setValue(next); }} />;
  }

  function closedField(initialValue = "2026-07-12") {
    render(<ControlledDateWheel initialValue={initialValue} />);
    const field = fieldOf("거래 날짜");
    field.focus();
    return field;
  }

  function segmentOf(unit: string) {
    return document.querySelector<HTMLElement>(`.date-wheel-segment[data-unit="${unit}"]`)!;
  }

  // ── §4.2: **자리를 옮기는 조작은 확정한다** — `→` `←` `Tab`, 그리고 **트리거의 세그먼트를
  //    직접 누르는 것.** 사용자가 "여기로 가겠다"고 했지 "이 값이다"라고 하지 않았으므로,
  //    치던 것은 원래 있던 자리에 남아야 한다.
  //
  // ⚠️ **단언은 클릭 *직후*의 트리거여야 한다.** 시퀀스 끝의 값을 보면 안 된다 —
  // `flushBuffer(year, "3")`은 어느 쪽이든 2003이라, 끝까지 가서 보면 고치기 전에도
  // 통과한다(vacuous). 갈리는 것은 **언제 확정되는가**다: 고치기 전에는 클릭 뒤에도
  // `3‒‒‒`가 남아 있었고(실측), 고친 뒤에는 그 자리에서 `2003`이 된다.
  //
  // **이 테스트가 위 술어의 유일한 도달 가능한 파수꾼이다.** 클릭 시점에는 `activeUnit`이
  // 아직 버퍼의 unit(연도)이므로 `flushTyping(resolvedActiveUnit)`으로 되돌려도 여기서는
  // 옳게 굴지만(= 등가 뮤턴트), `flushTyping(clickedUnit)`(= 누른 세그먼트로 확정)은 unit이
  // 갈려 아무것도 확정하지 않아 빨개진다. 뮤테이션 표에 둘 다 적었다.
  it("닫힌 채 버퍼를 들고 세그먼트를 클릭하면 그 자리에서 확정된다", () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "3" });
    fireEvent.click(segmentOf("day"));
    expect(field.textContent).toBe("2003. 07. 12.");
  });

  // §4.2가 **"열림·닫힘에서 같게 동작해야 합니다"**를 명시한다. 고치기 전에는 갈렸다 —
  // 열림에서는 클릭이 토글로 닫으며 "닫히면 버퍼를 버린다" 레이아웃 이펙트가 버렸고,
  // 닫힘에서는 살아남았다. **그 비대칭은 설계가 아니라 우연이었다.**
  it("열린 채 버퍼를 들고 세그먼트를 클릭해도 같게 확정된다", async () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(field, { key: "3" });
    fireEvent.click(segmentOf("day"));
    expect(field.textContent).toBe("2003. 07. 12.");
  });

  // §4.2: **여는 조작은 아무것도 안 한다 — 버퍼를 들고 간다.** 구두점·아이콘·여백에는
  // `data-unit`이 없어 "자리를 옮기는 조작"이 아니고, 그 클릭이 하는 일은 여는 것뿐이다.
  // 확정 경로를 트리거 클릭 **전체**로 넓히는 과잉 수정을 이 테스트가 막는다.
  it("구두점을 클릭하면 버퍼를 확정하지 않고 그대로 들고 연다", () => {
    const field = closedField();
    fireEvent.keyDown(field, { key: "3" });
    fireEvent.click(document.querySelector<HTMLElement>(".date-wheel-punctuation")!);
    expect(field.textContent).toBe(`3${FILL}${FILL}${FILL}. 07. 12.`);
  });

  // ── 두 번째 문: 소비자가 런타임에 `fields`를 줄이면 버퍼가 **사라진 열에 남는다.**
  //    `activeUnit`에는 `resolvedActiveUnit` 클램프가 있는데 `typing.unit`에는 없었다.
  function ShrinkableInDialog({ onClose, initialValue }: { onClose: () => void; initialValue: string }) {
    const [value, setValue] = useState(initialValue);
    const [fields, setFields] = useState<DateWheelUnit[]>(["year", "month", "day"]);
    return <Dialog open onClose={onClose} ariaLabel="거래 수정" closeOnBack={false}>
      <button type="button" onClick={() => setFields(["year", "month"])}>일 열 제거</button>
      <DateWheelPicker ariaLabel="거래 날짜" value={value} onChange={setValue} fields={fields} />
    </Dialog>;
  }

  /** 일 세그먼트에 버퍼를 만든 뒤 그 열을 통째로 없앤다 — 버퍼가 화면에서 사라진다. */
  function hideBufferByShrinking() {
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "1" });
    fireEvent.click(screen.getByRole("button", { name: "일 열 제거" }));
    field.focus();
    return field;
  }

  // ⚠️ **Task 5 브리프가 "빠뜨리면 안 된다"고 못박은 실패 모드가 다른 문으로 들어온 것이다.**
  // 가드가 `if (!typing)`이라 **상태**를 물었고, 물어야 할 것은 **"사용자가 취소할 것이
  // 화면에 있는가"**였다. 실측: `Escape` 한 번으로 안 닫히고 두 번째에 닫힌다.
  //
  // 기존 `Escape` 테스트 둘(`버퍼가 있으면…` / `없으면…`)은 버퍼가 **보이는** 경우만
  // 고정하므로 이 칸을 잡지 못한다.
  it("사라진 열에 남은 보이지 않는 버퍼는 Escape를 삼키지 않는다", () => {
    const onClose = vi.fn();
    render(<ShrinkableInDialog onClose={onClose} initialValue="2026-07-12" />);
    const field = hideBufferByShrinking();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  // 같은 원인의 두 번째 증상 — `triggerParts`가 `hasDateValue || typing`으로 켜지므로,
  // **보이지 않는 버퍼 하나 때문에 값이 없는 필드가 오늘 날짜를 가진 것처럼 그려졌다**
  // (실측: `"2026. 08."`). 접근성 이름도 그대로 그것을 읽었다.
  it("값이 비었는데 보이지 않는 버퍼만 남으면 placeholder가 그대로다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T03:00:00Z"));
    render(<ShrinkableInDialog onClose={() => undefined} initialValue="" />);
    const field = hideBufferByShrinking();
    expect(field.textContent).toBe("날짜 선택");
  });

  // ── **세 번째 문** — `fields` 축소 **뒤 복원**. Task 6 리뷰가 측정해서 찾았고, 이 Task가
  //    "갈라지는 문이 다 닫혔다"고 **잘못 선언했던** 자리다.
  //
  // 뿌리: `resolvedActiveUnit`이 폴백해도 **`activeUnit`이 동기화되지 않는다.** 숫자 분기는
  // 버퍼를 `setTyping({ unit: resolvedActiveUnit, … })`로 **클램프값**에 매어 두면서
  // `setActiveUnit`은 안 불렀다. 그래서 `fields`가 복원되면 `activeUnit`이 그림자에서 나오며
  // 버퍼와 갈라진다 — 보이는 버퍼는 연도에 있는데 활성 표시는 일에 있는 상태다.
  //
  // **고친 이음매:** 숫자 분기가 열림 `↑`/`↓` 분기와 **같게** 클램프값을 `activeUnit`에
  // 되쓴다. 그쪽은 전부터 `setActiveUnit(unit)`을 불렀다 — 숫자 분기만 빠져 있었으니 새
  // 정책이 아니라 **형제 분기 사이의 불일치를 없앤 것**이다.
  //
  // ⚠️ **"`fields` 축소가 활성을 영구히 옮긴다"로 일반화하지 않았다.** 줄이기만 하고 아무것도
  // 안 치면 활성은 그대로 돌아온다(`resolvedActiveUnit`을 파생값으로 둔 원래 판단, 스펙
  // §6.4(3)). 옮기는 것은 **사용자가 그 세그먼트에 실제로 친 경우**뿐이고 그건 진실이다.
  function ShrinkRestore({ initialValue }: { initialValue: string }) {
    const [value, setValue] = useState(initialValue);
    const [fields, setFields] = useState<DateWheelUnit[]>(["year", "month", "day"]);
    return <>
      <button type="button" onClick={() => setFields(["year", "month"])}>줄이기</button>
      <button type="button" onClick={() => setFields(["year", "month", "day"])}>되돌리기</button>
      <DateWheelPicker ariaLabel="거래 날짜" value={value} onChange={setValue} fields={fields} />
    </>;
  }

  /** 활성을 일로 옮겨 둔 채 그 열을 없앤다 — 활성이 연도로 폴백한 상태를 만든다. */
  function shrunkPastActive() {
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "ArrowRight" });                   // activeUnit = day
    fireEvent.click(screen.getByRole("button", { name: "줄이기" }));    // resolvedActiveUnit -> year
    return field;
  }

  it("사라진 열 대신 폴백 세그먼트에 숫자를 치면 활성 표시도 그 세그먼트로 간다", () => {
    render(<ShrinkRestore initialValue="2026-07-12" />);
    const field = shrunkPastActive();
    fireEvent.keyDown(field, { key: "3" });                             // 연도에 친다
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));

    expect(activeSegment()).toBe("year");
  });

  // 위 테스트의 증상 쪽 짝. 갈라진 상태에서는 다음 숫자가 **활성(일)** 로 가서 치던 `3`이
  // 확정도 폐기도 없이 사라졌다(리뷰 측정: `2026. 07. 05.`). 여기서는 같은 버퍼에 이어져야
  // 한다. 둘을 나눈 이유는 원인(활성 표시)과 증상(다음 숫자의 행선지)이 서로 다른 결함이라서다.
  it("그 뒤 다음 숫자는 같은 버퍼에 이어진다 — 앞 숫자가 사라지지 않는다", () => {
    render(<ShrinkRestore initialValue="2026-07-12" />);
    const field = shrunkPastActive();
    fireEvent.keyDown(field, { key: "3" });
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));

    fireEvent.keyDown(field, { key: "1" });

    expect(field.textContent).toBe(`31${FILL}${FILL}. 07. 12.`);
  });

  // ── `flushTyping`이 조기 `return`을 `setTyping(null)` **뒤로** 옮긴 것 — 이 Task가 새로
  //    만든 계약인데 감시자가 없었다(리뷰 M1). 이 Task 보고서가 "안 그러면 `fields`가 다시
  //    늘 때 묵은 숫자가 되살아납니다"라고 **그 실패를 정확히 서술해 놓고** 테스트를 안 붙였다.
  it("사라진 열의 버퍼는 떠나는 경로에서 청소된다 — fields가 돌아와도 되살아나지 않는다", () => {
    render(<ShrinkRestore initialValue="2026-07-12" />);
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "1" });                             // 일에 버퍼
    fireEvent.click(screen.getByRole("button", { name: "줄이기" }));     // 안 보이게 됨

    fireEvent.keyDown(field, { key: "Tab" });                           // 떠나는 경로 — 청소해야 한다
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));

    expect(field.textContent).toBe("2026. 07. 12.");
  });

  // `Backspace`의 클램프도 감시자가 없었다(리뷰 M2). 계약: **화면에 없는 것은 지울 수 없다** —
  // `Backspace`는 보이는 버퍼를 편집하는 키이지 청소하는 키가 아니다(청소는 위의 떠나는
  // 경로가 한다). 클램프를 되돌리면 안 보이는 버퍼가 여기서 조용히 지워진다.
  it("사라진 열의 버퍼는 Backspace로 지워지지 않는다 — 화면에 없는 것은 지울 수 없다", () => {
    render(<ShrinkRestore initialValue="2026-07-12" />);
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "1" });
    fireEvent.click(screen.getByRole("button", { name: "줄이기" }));

    fireEvent.keyDown(field, { key: "Backspace" });
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));

    expect(field.textContent).toBe(`2026. 07. 1${FILL}.`);
  });

  // ── §4.2: **포커스를 잃을 때도 확정합니다.** 닫힌 채 버퍼가 살 수 있게 되면서 `Tab`이
  //    아니라 **다른 곳을 클릭해서** 떠나는 경로가 생겼고, 조용히 버리면 친 숫자가 이유
  //    없이 사라진다.
  //
  // ⚠️ **팝오버 안 클릭은 `blur`를 만들지 않는다**(Task 4의 `mousedown` 차단) — 그게 이
  // 규칙이 성립하는 이유다. 다만 **jsdom에서는 그 사실을 테스트로 고정할 수 없다**:
  // jsdom은 `mousedown`·`click`의 포커스 부작용을 아예 구현하지 않아, 차단이 있든 없든
  // 팝오버 클릭은 `blur`를 안 만든다. 이 파일의 "포커스 불변식" 블록 상단에 같은 한계가
  // 이미 적혀 있다.
  //
  // ⚠️ **`.focus()`를 `act()`로 감싸야 한다 — 측정해서 알아낸 것이다.** 프로브로 확인한
  // 사실: 바깥 요소에 `.focus()`를 부르면 트리거에서 네이티브 `blur`·`focusout`이 실제로
  // 나고(리스너로 둘 다 관측) React 핸들러도 돈다. **그런데 그 핸들러가 일으킨 리렌더가
  // 동기적으로 flush되지 않아** `textContent`는 여전히 `31‒‒. 07. 12.`로 읽힌다. 이 파일의
  // 다른 `.focus()` 테스트들이 그냥 통과하는 이유는 그쪽이 **ref 변경**(세션 기준값)만 보기
  // 때문이다 — 렌더가 필요 없다. `fireEvent`는 스스로 act로 감싸므로 이 문제가 없다.
  //
  // `fireEvent.focusOut(field)`로 우회하지 않는다 — 그건 포커스를 실제로 옮기지 않고
  // 이벤트만 쏘는 것이라, "다른 곳을 클릭해서 떠난다"는 이 규칙의 전제를 건너뛴다.
  it("다른 곳으로 포커스를 옮기면 치던 숫자가 확정된다", () => {
    render(<><ControlledDateWheel initialValue="2026-07-12" /><button type="button">바깥</button></>);
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "3" });
    fireEvent.keyDown(field, { key: "1" });

    act(() => { screen.getByRole("button", { name: "바깥" }).focus(); });

    expect(field.textContent).toBe("2031. 07. 12.");
  });

  // ── §4.2: **버퍼를 든 채 언마운트되면 버립니다.** 언마운트는 소비자가 필드를 화면에서
  //    치우는 것이고, 그 순간의 `onChange`는 이미 사라진 필드에 대한 값이 된다.
  //    **코드가 아니라 부재로 지켜지는 규칙이라, 테스트가 없으면 다음 사람이 "누수"로 보고
  //    넣는다** — §4.2가 명시적으로 테스트를 요구한 자리다.
  //
  // ⚠️ **호출 횟수가 0인지를 보면 안 된다** — 앞의 타이핑이 이미 불렀다(연도 네 자리에서
  // 한 번). **언마운트 전후로 변하지 않았는지**를 본다.
  //
  // 측정해 둔 전제: **React는 언마운트에서 `onBlur`를 부르지 않는다**(프로브로 확인 —
  // 포커스된 버튼을 언마운트하면 `focus`만 기록되고 `blur`는 없다, `activeElement`는 body로
  // 간다). 그래서 위 `blur` 확정 규칙과 이 폐기 규칙이 충돌하지 않는다. 어느 React 버전이
  // 언마운트에서 `blur`를 부르기 시작하면 **이 테스트가 그것을 잡는다.**
  it("버퍼를 든 채 언마운트되면 확정하지 않고 버린다", () => {
    const onChange = vi.fn();
    const { unmount } = render(<ControlledWithSpy initialValue="2026-07-12" onChange={onChange} />);
    const field = fieldOf("거래 날짜");
    field.focus();
    for (const digit of ["2", "0", "3", "1"]) fireEvent.keyDown(field, { key: digit });   // 확정 1회 — 활성이 월로
    fireEvent.keyDown(field, { key: "1" });   // 월 버퍼 "1" — 10·11·12가 남아 대기, onChange 없음
    const before = onChange.mock.calls.length;

    unmount();

    expect(onChange.mock.calls.length).toBe(before);
  });
});

// 설계 스펙 §3 — "숫자·`Backspace`·방향키도 같이 막습니다(페이지 스크롤과 브라우저 단축키
// 방지)." 열림 쪽은 전부터 감시자가 있었고, **닫힘 쪽 세 칸은 뮤테이션으로 파수꾼이 없다는
// 것이 확인됐다**(리뷰 X2·X3·X7 → 각각 0 red). jsdom은 이 계약의 *증상*을 만들지 못하므로
// `defaultPrevented`를 직접 고정한다.
describe("DateWheelPicker 닫힌 상태의 preventDefault", () => {
  function closedField() {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const field = fieldOf("거래 날짜");
    field.focus();
    return field;
  }

  it("닫힌 상태의 숫자는 preventDefault를 부른다", () => {
    const field = closedField();
    const event = createEvent.keyDown(field, { key: "3" });
    fireEvent(field, event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("닫힌 상태의 →는 preventDefault를 부른다", () => {
    const field = closedField();
    const event = createEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent(field, event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("닫힌 상태의 ↓는 preventDefault를 부른다", () => {
    const field = closedField();
    const event = createEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent(field, event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("DateWheelPicker tab 순서", () => {
  async function openPicker() {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    const dialog = await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    return dialog;
  }

  // 설계 스펙 §5 — **이 컨트롤의 tab 정거장은 트리거 하나이고 팝오버 안에는 0개다.**
  // 초판은 열 셋이 정거장이었다(`Tab`이 열 사이를 걷는 설계였으므로). 그 전제가
  // 사라졌으므로 이 단언은 **값이 뒤집힌 것**이다.
  //
  // 빈 배열을 신원으로 비교한다 — `toHaveLength(0)`이면 "무엇이 정거장인가"를 안 묻고,
  // 실패해도 어느 요소가 새로 들어왔는지 실패 메시지에 안 찍힌다.
  it("팝오버 안에는 tab 정거장이 하나도 없다", async () => {
    const dialog = await openPicker();

    const stops = [...dialog.querySelectorAll<HTMLElement>('[tabindex="0"], button:not([tabindex="-1"])')];
    expect(stops.map((node) => node.getAttribute("aria-label"))).toEqual([]);
  });

  // 위 테스트의 짝 — 정거장이 0개인 것이 "컨트롤이 tab 순서에서 통째로 빠졌다"가 아니라
  // "정거장이 트리거 하나로 모였다"임을 고정한다. 트리거에서 tabIndex를 빼는 결함은
  // 위 테스트로는 안 잡힌다(팝오버 밖이라 세지도 않는다).
  it("트리거는 tab 정거장으로 남는다", async () => {
    await openPicker();
    expect(fieldOf("거래 날짜").getAttribute("tabindex")).toBeNull();
  });

  // 팝오버가 tab 순서에서도 빠지고 포커스도 영영 안 들어가게 되면서, 보조기술이 "무엇이
  // 확장됐는가"에 답할 경로가 `aria-controls` 하나만 남았다. 팝오버는 body 끝 포털이라
  // 포함 관계로도 못 찾는다. Select.tsx가 같은 이유로 같은 연결을 갖고 있다.
  //
  // 신원으로 본다 — `aria-controls`가 **그 다이얼로그를** 가리키는지까지 봐야 한다.
  // 존재만 보면 엉뚱한 id를 가리켜도 통과한다.
  it("열려 있으면 트리거의 aria-controls가 그 팝오버를 가리킨다", async () => {
    const dialog = await openPicker();
    expect(fieldOf("거래 날짜").getAttribute("aria-controls")).toBe(dialog.id);
  });

  it("닫혀 있으면 aria-controls가 없다 — 가리킬 것이 없다", () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    expect(fieldOf("거래 날짜").hasAttribute("aria-controls")).toBe(false);
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
    const field = fieldOf("거래 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    return field;
  }

  // 원래 한 테스트였다 — 트리거 문구(값 계산)와 자동 전진은 서로 다른 결함이다.
  // expect()는 첫 실패에서 던지므로 함께 두면 뒤쪽 결함의 킬력을 증명할 수 없다.
  it("연도 네 자리를 치면 확정된다", async () => {
    const field = await openAt("2026-07-12");
    for (const digit of ["2", "0", "3", "1"]) fireEvent.keyDown(field, { key: digit });

    await waitFor(() => expect(field.textContent).toBe("2031. 07. 12."));
  });

  it("연도 네 자리를 치면 월 세그먼트로 넘어간다", async () => {
    const field = await openAt("2026-07-12");
    for (const digit of ["2", "0", "3", "1"]) fireEvent.keyDown(field, { key: digit });

    await waitFor(() => expect(activeSegment()).toBe("month"));
  });

  // soloFloor 즉시확정 경로(월 2~9, 일 4~9)도 값 확정과 전진이 서로 다른 결함이다 —
  // 위 연도 케이스와 같은 이유로 나눈다.
  it("월에서 5를 치면 곧바로 5월로 확정한다", async () => {
    const field = await openAt("2026-07-12");
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "5" });

    await waitFor(() => expect(field.textContent).toBe("2026. 05. 12."));
  });

  it("월에서 5를 치면 일 세그먼트로 넘어간다", async () => {
    const field = await openAt("2026-07-12");
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "5" });

    await waitFor(() => expect(activeSegment()).toBe("day"));
  });

  it("일에서 9를 치면 곧바로 9일로 확정한다", async () => {
    const field = await openAt("2026-07-12");
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "9" });

    await waitFor(() => expect(field.textContent).toBe("2026. 07. 09."));
  });

  it("타이핑은 휠 이동 애니메이션을 재생하지 않는다", async () => {
    // markColumnMotion을 타면 숫자 하나마다 행 7개가 리마운트되고 210ms 전환이
    // 재생된다. 값만 확인하면 이 결함을 못 잡으므로 경로 자체를 고정한다.
    const field = await openAt("2026-07-12");
    const rowsBefore = screen.getByRole("group", { name: "연도 2026" }).querySelector(".date-wheel-values");
    for (const digit of ["2", "0", "3", "1"]) fireEvent.keyDown(field, { key: digit });

    await waitFor(() => expect(field.textContent).toBe("2031. 07. 12."));
    const yearAfter = screen.getByRole("group", { name: "연도 2031" });
    expect(yearAfter.querySelector(".date-wheel-values")).toBe(rowsBefore);   // 리마운트되지 않았다
    expect(yearAfter.classList.contains("moving-next")).toBe(false);
  });

  it("Backspace가 버퍼에서 한 자리만 지운다", async () => {
    const field = await openAt("2026-07-12");
    fireEvent.keyDown(field, { key: "2" });
    fireEvent.keyDown(field, { key: "0" });
    fireEvent.keyDown(field, { key: "Backspace" });
    fireEvent.keyDown(field, { key: "3" });
    fireEvent.keyDown(field, { key: "1" });
    // "20" -> Backspace -> "2" -> "231". 네 자리가 아직 아니므로 확정되지 않았다.
    //
    // **이 단언의 기대값이 SEG Task 2에서 바뀌었습니다**(설계 스펙 §4.5). 예전에는 트리거가
    // `value` prop만 읽어 확정 전까지 "2026. 07. 12."가 남아 있었는데, 이제 트리거가
    // 세그먼트로 쪼개져 **치던 버퍼를 자리를 지켜** 그립니다. 계약이 약해진 것이 아니라
    // 강해졌습니다 — `231‒`은 "버퍼가 정확히 231이다"와 "아직 확정되지 않았다"를 동시에
    // 보여줍니다(확정됐다면 버퍼가 비고 세그먼트가 확정된 네 자리를 그렸을 것입니다).
    // 채움 문자는 U+2012 FIGURE DASH입니다 — 파일 상단 FILL 상수 주석 참고.
    expect(field.textContent).toBe(`231${FILL}. 07. 12.`);
    fireEvent.keyDown(field, { key: "9" });   // "2319" 네 자리
    await waitFor(() => expect(field.textContent).toBe("2319. 07. 12."));
  });

  it("한 자리를 치고 Backspace를 누르면 선택 행이 실제 값으로 돌아간다", async () => {
    // 버퍼가 "2" -> Backspace로 ""가 되는 순간, "없음"을 빈 문자열이 아니라 null로
    // 표현해야 한다. 아니면 `buffered ?? (...)`가 빈 문자열을 걸러내지 못해 행이 빈다.
    const field = await openAt("2026-07-12");
    fireEvent.keyDown(field, { key: "2" });
    fireEvent.keyDown(field, { key: "Backspace" });
    expect(screen.getByRole("group", { name: "연도 2026" }).querySelector(".date-wheel-values .selected")?.textContent).toBe("2026");
  });

  it("치는 동안 선택 행에 친 숫자가 그대로 보인다", async () => {
    const field = await openAt("2026-07-12");
    fireEvent.keyDown(field, { key: "2" });
    fireEvent.keyDown(field, { key: "0" });
    expect(screen.getByRole("group", { name: "연도 2026" }).querySelector(".date-wheel-values .selected")?.textContent).toBe("20");
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
    const field = fieldOf("거래 날짜");
    fireEvent.click(field);
    for (const digit of ["1", "9", "8", "5"]) fireEvent.keyDown(field, { key: digit });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("2026-01-01"));
  });

  // §4.3 — 빠진 열은 01로 채운다는 규칙은 휠·타이핑 모두 같다(새로 만들지 않는다).
  // 연도만 있는 픽커에서 연도를 타이핑해 확정하면 월·일이 각각 01로 정규화된
  // 값이 나가야 한다 — 값 형식은 항상 YYYY-MM-DD다.
  it("연도만 있는 픽커에서 연도를 타이핑하면 월·일이 01로 정규화된다", () => {
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="회계 연도" value="2026-07-12" fields={["year"]} onChange={onChange} />);
    const field = fieldOf("회계 연도");
    fireEvent.click(field);
    for (const digit of ["2", "0", "3", "1"]) fireEvent.keyDown(field, { key: digit });
    expect(onChange).toHaveBeenLastCalledWith("2031-01-01");
  });
});

describe("DateWheelPicker 리뷰 Finding 3 — shiftDateValue의 말일 계산과 연도 폭주", () => {
  // shiftDateValue의 day/year/month 세 분기가 모두 new Date(Date.UTC(year, ...))로
  // 말일을 구했다. 이 API는 0~99년을 1900년대로 재매핑하므로(ECMA-262), 연도
  // 0(윤년)을 1900년(평년)으로 잘못 읽어 2/29를 2/28로 잘라낸다.
  // src/model/instant.ts의 lastDayOf(setUTCFullYear 3-인자 호출)는 이 재매핑을
  // 하지 않는다 — withUnitValue는 이미 이걸 쓰고, shiftDateValue는 몰랐다.
  // 타이핑으로 연도 네 자리를 곧장 쳐 넣을 수 있게 되면서, 예전엔 화살표 수천
  // 번이 필요하던 이 값에 몇 키만으로 닿는다.
  it("연도 0000에서 월을 다음으로 옮기면 윤년 2/29를 안다", () => {
    render(<ControlledDateWheel initialValue="0000-01-29" />);
    const trigger = fieldOf("거래 날짜");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "월 다음" }));
    expect(trigger.textContent).toBe("0000. 02. 29.");
  });

  // ⚠️ **아래 두 테스트는 원래 하나였고, 그 하나가 두 가지를 동시에 지키고 있었다.**
  // SEG Task 4가 그 둘을 갈라놓았으므로 테스트도 갈라야 한다. 하나로 두고 기대값만
  // 고치면 **연도 10000 오버플로 가드가 아무 소리 없이 사라진다.**
  //
  // 무엇이 갈라졌나: 초판은 키를 **연도 열 요소**로 보냈는데, 연도 네 자리를 다 치면
  // `typeDigit`의 자동 이동이 활성을 **월로** 옮긴다. "키가 도착한 열"과 "활성 열"이
  // 갈려 있어서 `↓`가 연도로 갔고, 그래서 한 테스트가 자동 이동과 오버플로 가드를
  // 둘 다 건드렸다. 키가 트리거로만 오게 된 지금은 `↓`가 **월을 움직인다** — 그리고
  // 그것이 설계 스펙 §4.1상 옳다.
  async function typeYear9999() {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const field = fieldOf("거래 날짜");
    fireEvent.click(field);
    for (const digit of ["9", "9", "9", "9"]) fireEvent.keyDown(field, { key: digit });
    await waitFor(() => expect(field.textContent).toBe("9999. 07. 12."));
    return field;
  }

  // (1) 새 계약 — §4.1의 자동 이동을 고정한다. 네 자리를 다 치면 활성이 월로 갔으므로
  // 그 뒤의 ↓는 월을 움직인다.
  it("연도 네 자리를 친 뒤 ↓는 월을 움직인다", async () => {
    const field = await typeYear9999();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field.textContent).toBe("9999. 08. 12.");
  });

  // (2) **원래 가드.** 연도가 10000 이상이 되면 Date#toISOString()이 확장 ISO 표기
  // (+010000-07-12)로 바뀐다. shiftDateValue의 .slice(0, 10)은 그 표기의 앞 10글자
  // ("+010000-07")만 자르고, normalizeToFields가 이걸 "-"로 쪼개면 세 번째 조각(일)이
  // undefined가 되어 **"+010000-07-undefined"가 그대로 onChange로 나간다.** shiftedFrom이
  // validDateValue로 이 결과를 걸러내지 않으면 소비자에게 깨진 문자열이 전달된다.
  // 고친 뒤에는 그 걸음이 그냥 막힌 걸음(no-op)이어야 한다 — "누를 수 없는 자리"를
  // 새로 만드는 대신 이미 있는 "쓸 수 없는 값" 신호(shiftedFrom의 null)를 그대로 쓴다.
  //
  // **`←`로 연도를 다시 활성으로 되돌리는 줄이 이 테스트의 전부다.** 그게 없으면 ↓가
  // 월을 움직여 위 (1)과 같은 것을 볼 뿐, 연도 경계에는 영영 닿지 않는다.
  it("연도 9999를 다시 활성으로 되돌린 뒤 ↓를 누르면 10000으로 새지 않고 값이 그대로다", async () => {
    const field = await typeYear9999();
    fireEvent.keyDown(field, { key: "ArrowLeft" });   // 활성을 월 → 연도로 되돌린다
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field.textContent).toBe("9999. 07. 12.");
  });
});

describe("DateWheelPicker 버퍼 확정과 폐기", () => {
  async function openAndType(initialValue: string, keys: string[]) {
    render(<ControlledDateWheel initialValue={initialValue} />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    // `year`는 **값 확인용**으로만 쓴다(선택 행의 텍스트). 키는 전부 트리거로 간다.
    const year = screen.getByRole("group", { name: /^연도/ });
    for (const key of keys) fireEvent.keyDown(trigger, { key });
    return { trigger, year };
  }

  it("연도 두 자리만 치고 →를 누르면 2000년대로 확정된다", async () => {
    const { trigger } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
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
    const { trigger } = await openAndType("2020-07-12", ["2", "6"]);
    fireEvent.keyDown(trigger, { key: "Enter" });
    await waitFor(() => expect(trigger.textContent).toBe("2026. 07. 12."));
  });

  it("Enter를 누르면 팝오버가 닫힌다", async () => {
    const { trigger } = await openAndType("2020-07-12", ["2", "6"]);
    fireEvent.keyDown(trigger, { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
  });

  // 설계 스펙 §3 — 열린 상태의 `Space`는 **확정**이다. 초판은 "Space는 여는 키"라는
  // 이유로 열린 상태에서 아무것도 안 했는데, 그러면 포커스를 가진 요소가 Space를 안 먹어
  // **페이지가 스크롤된다.** 드롭다운은 이미 열린 상태에서 Enter·Space가 둘 다 확정이다.
  it("Space로도 완료하면 치던 숫자가 확정된다", async () => {
    const { trigger } = await openAndType("2020-07-12", ["2", "6"]);
    fireEvent.keyDown(trigger, { key: " " });
    await waitFor(() => expect(trigger.textContent).toBe("2026. 07. 12."));
  });

  it("Space를 누르면 팝오버가 닫힌다", async () => {
    const { trigger } = await openAndType("2020-07-12", ["2", "6"]);
    fireEvent.keyDown(trigger, { key: " " });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
  });

  // ⚠️ 아래 두 단언은 **증상이 아니라 `preventDefault()` 자체**를 고정한다. 실브라우저의
  // 결함은 이렇다: 트리거는 `<button>`이고 `<button>`은 Enter를 keydown에서, Space를
  // keyup에서 click으로 바꾼다 — 막지 않으면 우리가 확정하며 닫은 뒤 그 합성 click이
  // 트리거의 onClick(토글)을 불러 **다시 연다.**
  //
  // **그 증상은 jsdom에서 재현되지 않는다.** 설계 스펙 §11과 이 Task의 브리프는 둘 다
  // "jsdom에서도 일어난다"고 적었지만 **틀렸다** — 직접 쟀다(jsdom 26.1.0, 이 저장소의
  // vitest 환경): 포커스를 준 `<button>`에 Enter keydown, Space keydown+keyup을 보내도
  // onClick 호출은 **0회**다. 그래서 "다시 열렸는가"를 보는 테스트는 preventDefault를
  // 지워도 초록으로 남는다(그 뮤테이션을 실제로 돌려 확인했다: 0 red).
  //
  // 증상이 안 잡힌다고 해서 preventDefault가 필요 없다는 뜻은 아니다 — 실브라우저에서는
  // 필요하다(HTML 표준의 `<button>` 활성화 동작). jsdom이 못 보는 것을 "없는 것"으로
  // 옮겨 적지 않고, 대신 계약 자체를 직접 고정한다.
  it("열린 상태의 Enter는 preventDefault를 부른다 — 합성 click이 다시 열지 못하게", async () => {
    const { trigger } = await openAndType("2020-07-12", ["2", "6"]);
    const event = createEvent.keyDown(trigger, { key: "Enter" });
    fireEvent(trigger, event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("열린 상태의 Space도 preventDefault를 부른다", async () => {
    const { trigger } = await openAndType("2020-07-12", ["2", "6"]);
    const event = createEvent.keyDown(trigger, { key: " " });
    fireEvent(trigger, event);
    expect(event.defaultPrevented).toBe(true);
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
    const trigger = fieldOf("거래 날짜");
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "3" });
    fireEvent.keyDown(trigger, { key: "1" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(trigger.textContent).toBe("2031. 07. 12.");
  });

  // 원래 한 테스트였다 — "팝오버가 닫힌다"(사전조건)와 "값을 그대로 둔다"(Task 7의
  // 폐기 결함 표면)는 서로 다르다. Escape의 setOpen(false)는 Task 7 이전부터 있던
  // 동작이라 이 작업 범위의 뮤테이션으로는 앞쪽을 못 죽인다 — 그래도 나눠 둔다.
  it("Escape를 누르면 팝오버가 닫힌다", async () => {
    const { trigger } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.keyDown(trigger, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());
  });

  it("Escape는 치던 숫자를 버리고 값을 그대로 둔다", async () => {
    // Escape의 뜻은 "값을 바꾸지 않고 닫기"다. 치다 만 숫자를 확정하면 그 뜻과 어긋난다.
    const { trigger } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.keyDown(trigger, { key: "Escape" });
    await waitFor(() => expect(trigger.textContent).toBe("2026. 07. 12."));
  });

  it("↑는 버퍼를 확정한 뒤 그 값에서 한 칸 움직인다", async () => {
    // 이 컴포넌트에서 ArrowUp은 -1이다(handleFieldKey의 ArrowUp/ArrowDown 분기).
    // 버퍼를 무시하고 옛 값에서 움직이면 2025가 되므로 둘이 확실히 갈린다.
    const { trigger } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    await waitFor(() => expect(trigger.textContent).toBe("2030. 07. 12."));   // 2031로 확정한 뒤 -1
  });

  it("월의 0 단독은 확정할 수 없으므로 버린다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    fireEvent.keyDown(trigger, { key: "0" });
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    expect(trigger.textContent).toBe("2026. 07. 12.");
  });

  // 리뷰 Finding 2 — handleWheel은 typing을 건드리지 않았다. 스펙은 휠을 스와이프·행
  // 클릭과 같은 폐기 계열로 명시한다. 안 지키면: 연도에 "3"을 친 채로 같은 열에서
  // 휠을 굴려 값을 옮겨도(2026 -> 2027) 버퍼 "3"은 그대로 남고, Tab으로 떠날 때
  // flushTyping이 그 묵은 "3"을 2003으로 해석해 휠이 방금 맞춘 값을 조용히 덮어쓴다.
  it("휠을 굴리면 치던 숫자를 버린다", async () => {
    // 휠은 열이 받는다(onWheel은 열에 남아 있다) — 키만 트리거로 옮겼다.
    const { trigger, year } = await openAndType("2026-07-12", ["3"]);
    fireEvent.wheel(year, { deltaY: 100 });
    fireEvent.keyDown(trigger, { key: "Tab" });
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

  // 완료 버튼이 flushTyping을 거치므로, 완료 테스트만으로는 **"닫히면 버퍼를 버린다" 이펙트**가
  // 버퍼를 비우는지 증명하지 못한다 — 완료 경로는 commitAndClose 자신이 이미 비운다.
  // 바깥 클릭·뒤로가기는 flushTyping을 전혀 거치지 않는 유일한 닫힘 경로라, 그 안전망이
  // 실제로 켜지는지는 이걸로만 확인할 수 있다.
  // (그 이펙트는 예전에 포커스 이펙트의 `!open` 분기 안에 얹혀 있었다. SEG Task 4가 포커스
  //  이펙트를 지우면서 이 부분만 자기 이펙트로 떼어 살렸다.)
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
    const { trigger } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.keyDown(trigger, { key: "Tab" });
    await waitFor(() => expect(trigger.textContent).toBe("2031. 07. 12."));
  });

  // 초판은 이 테스트를 **`Tab`으로** 짰다. `Tab`이 세그먼트를 옮기고 팝오버를 열어 두던
  // 시절에는 "떠난 뒤에도 남아 있는 연도 열"이 있었기 때문이다. 이제 `Tab`은 팝오버를
  // 닫으므로 그 열이 언마운트되어 이 단언이 볼 것이 없어진다 — 같은 결함을 계속 보려면
  // **팝오버를 열어 둔 채 세그먼트를 떠나는 키**, 즉 `→`로 바꿔야 한다(둘 다
  // `flushTyping`을 거치는 같은 경로다).
  //
  // 무엇을 지키나: flushTyping이 setTyping(null)로 버퍼를 비우지 않으면, 행 렌더의
  // `buffered = offset === 0 && typing?.unit === unit ? typing.digits : null`가 unit이
  // 여전히 "year"인 낡은 버퍼를 얹어 확정된 "2031" 대신 치던 숫자 "31"을 보여준다.
  // trigger.textContent는 `value` prop만 읽으므로 이 결함을 못 잡는다 — 떠난 열 자신의
  // 선택 행을 봐야 한다. 뮤테이션 이후에도 실패가 이 assert 줄에서 나도록 새로 role
  // 조회를 하지 않고 openAndType이 쥐고 있는 `year` 노드를 그대로 쓴다.
  it("→로 세그먼트를 떠난 뒤 연도 열은 버퍼가 아니라 확정된 값을 보여준다", async () => {
    const { trigger, year } = await openAndType("2026-07-12", ["3", "1"]);
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    expect(year.querySelector(".date-wheel-values .selected")?.textContent).toBe("2031");
  });

  // Shift+Tab도 확정하고 떠난다(스펙 §3 — Tab과 완전히 대칭이다). 월에서 시작하는
  // 이유는 월의 첫 자리 "1"이 soloFloor(2) 미만이라 곧장 확정되지 않고 버퍼로 남기
  // 때문이다(src/model/instant.ts의 typeDigit 참고) — 연도와 다른 버퍼 모양을 한 번 더
  // 지나간다. (초판이 월에서 시작한 이유였던 "첫 열에서는 이동이 실패해 닫힌다"는
  // 사라졌다. Shift+Tab은 이제 어느 세그먼트에서든 닫는다.)
  it("Shift+Tab이 치던 숫자를 확정한다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    fireEvent.keyDown(trigger, { key: "1" });
    fireEvent.keyDown(trigger, { key: "Tab", shiftKey: true });
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
    const trigger = fieldOf("종료일");
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
    fireEvent.keyDown(fieldOf("거래 날짜"), { key: "Delete" });
    expect(blocked).not.toHaveBeenCalled();
  });

  it("비활성이면 Delete도 무시한다", () => {
    // handleShortcut을 disabled 검사보다 앞에 두면(브리프의 "맨 앞"을 문자 그대로
    // 따르면) 비활성 필드도 Delete에 반응하게 된다. 이 저장소의 기존 불변식(비활성은
    // 어떤 키에도 반응하지 않는다 — "비활성이면 어느 키로도 열리지 않는다")과 어긋나므로
    // disabled 검사를 그대로 맨 앞에 두고 handleShortcut을 그다음에 부른다.
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={onChange} allowClear disabled />);
    fireEvent.keyDown(fieldOf("거래 날짜"), { key: "Delete" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Ctrl+; 가 오늘로 설정한다 — 닫혀 있을 때도", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T03:00:00Z"));
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-01-01" onChange={onChange} />);
    fireEvent.keyDown(fieldOf("거래 날짜"), { key: ";", code: "Semicolon", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("2026-07-12");
  });

  it("Ctrl+; 는 문자가 아니라 키 위치로 판정한다", () => {
    // 배열에 따라 `;`가 Shift 조합이 되는 키보드가 있다.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T03:00:00Z"));
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-01-01" onChange={onChange} />);
    fireEvent.keyDown(fieldOf("거래 날짜"), { key: "Unidentified", code: "Semicolon", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("2026-07-12");
  });

  // 위 두 테스트는 **닫힌** 트리거로만 Ctrl+;를 쏜다. 스펙 §3은 "닫힘·열림" 둘 다라고
  // 명시하고, `handleShortcut`이 `if (!open)` 갈림보다 **앞**에 있어야 한다는 순서 계약이
  // 열린 쪽에서만 드러난다 — 순서가 뒤집혀도 위 두 테스트는 계속 통과한다.
  it("Ctrl+;는 팝오버가 열려 있을 때도 동작한다", () => {
    // 이 파일의 다른 가짜 타이머 테스트와 같은 동기 관용구를 쓴다(예: "팝오버의 오늘
    // 버튼이…") — fireEvent.click + 동기 쿼리. await waitFor/findByRole을 가짜
    // 타이머와 섞으면 RTL 버전에 따라 어긋날 수 있다.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T03:00:00Z"));
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-01-01" onChange={onChange} />);
    const field = fieldOf("거래 날짜");
    fireEvent.click(field);
    expect(screen.getByRole("dialog", { name: "거래 날짜 선택" })).toBeTruthy();   // 열린 상태라는 전제
    fireEvent.keyDown(field, { key: ";", code: "Semicolon", ctrlKey: true });
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
    const field = fieldOf("거래 날짜");
    fireEvent.click(field);
    const year = screen.getByRole("group", { name: "연도 2020" });
    fireEvent.keyDown(field, { key: "3" });   // 버퍼 "3" — 연도는 네 자리라야 확정된다

    fireEvent.click(screen.getByRole("button", { name: "오늘" }));

    // 버퍼가 안 지워지면 이 행은 여전히 버퍼 "3"을 보여준다(buffered ?? ... 가 "3"에서
    // 멈춘다). 지워지면 방금 설정된 값의 연도 "2026"이 보인다.
    expect(year.querySelector(".date-wheel-values .selected")?.textContent).toBe("2026");
  });

  it("비우기 버튼을 누르면 치던 숫자를 버린다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T03:00:00Z"));   // 서울 기준 오늘 = 2026-07-12
    render(<ControlledDateWheel initialValue="2020-01-01" allowClear />);
    const field = fieldOf("거래 날짜");
    fireEvent.click(field);
    const year = screen.getByRole("group", { name: "연도 2020" });
    fireEvent.keyDown(field, { key: "3" });

    fireEvent.click(screen.getByRole("button", { name: "비우기" }));

    // 비우기는 값을 ""로 만들고, baseValue는 값이 비어 있으면 오늘로 대체된다(:203) —
    // 버퍼가 안 지워지면 이 행은 여전히 버퍼 "3"을 보여준다.
    expect(year.querySelector(".date-wheel-values .selected")?.textContent).toBe("2026");
  });

  // labels.hint의 기본값이 타이핑을 포함해 바뀐다(PRINCIPLES §11 문서화 대상) —
  // 소스만 바꾸고 테스트가 없으면 다음 사람이 조용히 되돌려도 아무도 모른다.
  it("팝오버 안내 문구 기본값이 타이핑까지 안내한다", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 날짜"));
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
    fireEvent.click(fieldOf("거래 날짜"));
    expect(screen.getByRole("button", { name: "오늘" }).getAttribute("aria-keyshortcuts")).toBe("Control+; Meta+;");
  });

  it("비우기 버튼의 aria-keyshortcuts가 고정돼 있다", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={() => undefined} allowClear />);
    fireEvent.click(fieldOf("거래 날짜"));
    expect(screen.getByRole("button", { name: "비우기" }).getAttribute("aria-keyshortcuts")).toBe("Delete");
  });

  it("완료 버튼의 aria-keyshortcuts가 고정돼 있다", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 날짜"));
    expect(screen.getByRole("button", { name: "완료" }).getAttribute("aria-keyshortcuts")).toBe("Enter");
  });
});

// "비활성 필드는 어떤 키에도 반응하지 않는다"는 이 저장소의 기존 불변식인데, 그것을
// 지키던 테스트는 전부 **닫힌** 트리거에만 키를 쐈다("비활성이면 어느 키로도 열리지
// 않는다", "비활성이면 Delete도 무시한다"). **열려 있는 동안 disabled가 켜지는** 경우가
// 그 불변식의 나머지 노출면이었고, 그 상태에서 **키는 막히는데 휠·스와이프·± 버튼은
// 여전히 값을 바꿨다** — 반쪽 잠금이다.
//
// **설계 스펙 §7.1이 그 상태 자체를 없앴다: `disabled`가 켜지면 팝오버를 닫는다.**
// 포인터 경로를 하나씩 막는 안은 스펙이 이유와 함께 기각했다(막을 자리가 넷 이상이고,
// 무엇보다 잠긴 필드 위에 조작 가능해 보이는 팝오버가 떠 있는 것 자체가 거짓말이다).
//
// ⚠️ **SEG Task 3이 여기 쓴 두 테스트는 그 상태를 전제로 했으므로 함께 다시 썼다.**
//   · Task 3 #1("팝오버를 닫는 코드는 없다 — 이 상태가 실제로 만들어진다")은 **공허성
//     가드로 남는다.** 가드하는 내용만 뒤집혔다: 이제 확인할 것은 "`disabled` 직전까지
//     팝오버가 실제로 열려 있었다"이고, 그게 없으면 아래 부재 단언이 전부 "애초에 아무것도
//     안 열려서" 초록이 된다. **§7.1 이펙트를 지워도 이 테스트는 초록이다 — 계약이 아니다**
//     (뮤테이션으로 확인했다).
//   · Task 3 #2("그 상태에서 ↓도 값을 바꾸지 않는다")는 **"비활성인 동안 ↓가 팝오버를
//     다시 열지 못한다"로 바뀐다.** `handleFieldKey`의 `if (disabled) return`은 여전히 할
//     일이 있고, 이제 그 일은 다시 열리는 것을 막는 것이다.
//
// ⚠️ **SEG Task 4에서 이 블록의 키 대상이 바뀌었다.** 초판은 키를 **열**로 쐈는데, 열이
// `onKeyDown`을 잃으면서 그 이벤트는 어떤 핸들러에도 닿지 않게 됐다 — 그대로 뒀다면 이
// 테스트는 "`if (disabled) return;`이 막아서"가 아니라 **"아무 데도 안 배선돼서"** 초록이
// 되어, 가드를 통째로 지워도 안 빨개진다(공허한 초록). 트리거로 쏴야 그 가드를 실제로
// 지나간다.
describe("DateWheelPicker 비활성 — 팝오버가 열려 있는 동안 켜지면 닫힌다 (스펙 §7.1)", () => {
  /**
   * 연 다음 `disabled`를 켠다. 트리거 노드는 rerender를 건너서도 같은 노드다.
   *
   * **팝오버 안의 조작 지점은 닫히기 전에 잡아 둔다.** 닫힌 뒤에 `getByRole`로 찾으면
   * 쿼리가 던지는데, 쿼리 실패는 단언 실패가 아니라 **엉뚱한 줄에서 나는 죽음**이다
   * (파일 상단 `fieldOf` 주석과 같은 이유). 잡아 둔 노드로 이벤트를 쏘면 고침 전에는
   * 마운트된 채라 핸들러가 돌고(빨강), 고침 뒤에는 노드가 떨어져 나가 React 루트의
   * 위임 리스너에 닿지 않는다(초록) — **초록의 이유가 "팝오버가 닫혔다" 하나다.**
   */
  function openThenDisable(onChange: (next: string) => void = () => undefined) {
    const view = render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={onChange} />);
    const field = fieldOf("거래 날짜");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    const column = screen.getByRole("group", { name: "연도 2026" });
    const stepNext = screen.getByRole("button", { name: "연도 다음" });
    const disable = () => view.rerender(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={onChange} disabled />);
    return { field, column, stepNext, disable };
  }

  // **[공허성 가드 — 계약이 아니다]** 아래 부재 단언들이 "애초에 아무것도 안 열려서"
  // 초록이 되는 것을 막는다. §7.1의 고침을 통째로 지워도 이 테스트는 초록이다.
  it("[공허성 가드] disabled 직전까지 팝오버는 실제로 열려 있다", () => {
    openThenDisable();
    expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).not.toBeNull();
  });

  it("disabled가 켜지면 팝오버가 사라진다", () => {
    const { disable } = openThenDisable();
    disable();
    expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull();
  });

  // **렌더 조건에 `!disabled`만 얹는 안과 갈리는 자리다.** 그 안은 `open` 상태를 true로
  // 남기므로 트리거가 "펼쳐져 있다"고 계속 말한다 — 가리킬 다이얼로그가 없는데도.
  // (`aria-controls`도 같은 이유로 사라진 id를 가리키게 된다.)
  it("트리거의 aria-expanded가 false로 돌아간다", () => {
    const { field, disable } = openThenDisable();
    disable();
    expect(field.getAttribute("aria-expanded")).toBe("false");
  });

  // 아래 셋이 §7.1이 든 "반쪽 잠금"의 세 경로다. 고침 전에는 셋 다 값을 바꿨다.
  it("휠이 값을 바꾸지 못한다", () => {
    const onChange = vi.fn();
    const { column, disable } = openThenDisable(onChange);
    disable();
    onChange.mockClear();
    fireEvent.wheel(column, { deltaY: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  // `pointer()` 헬퍼를 쓴다 — 이 jsdom에는 `PointerEvent` 생성자가 없어서
  // `fireEvent.pointerMove`로는 `buttons`가 실리지 않고 `moveSwipe`의 첫 가드에서
  // 되돌아 나간다(파일 상단 헬퍼 주석). 그러면 고침 전에도 초록이라 아무것도 못 잡는다.
  it("스와이프가 값을 바꾸지 못한다", () => {
    const onChange = vi.fn();
    const { column, disable } = openThenDisable(onChange);
    disable();
    onChange.mockClear();
    pointer("pointerDown", column, { pointerId: 7, clientY: 100, buttons: 1, button: 0 });
    pointer("pointerMove", column, { pointerId: 7, clientY: 60, buttons: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("± 단계 버튼이 값을 바꾸지 못한다", () => {
    const onChange = vi.fn();
    const { stepNext, disable } = openThenDisable(onChange);
    disable();
    onChange.mockClear();
    fireEvent.click(stepNext);
    expect(onChange).not.toHaveBeenCalled();
  });

  // 위 셋은 잡아 둔 노드로 쏘므로 "그 노드가 죽었다"만 말한다. 이것은 **누를 것이 하나도
  // 안 남았다**를 말한다 — ± 6개, 값 행 21개, 오늘·비우기·완료까지 전부. 남는 버튼은
  // 트리거 하나다(§5: 이 컨트롤의 tab 정거장은 트리거 하나).
  it("팝오버의 조작 지점이 문서에 하나도 남지 않는다", () => {
    const { disable } = openThenDisable();
    disable();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  // §7.1: 닫을 때 값을 확정하지 않는다. 비활성화는 소비자의 조작이지 사용자의 완료가
  // 아니므로, 치던 버퍼는 §4.2의 "확정하지 않는 닫힘"으로 간다 — 버려진다.
  function openTypeThenDisable(onChange: (next: string) => void) {
    const view = render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={onChange} />);
    const field = fieldOf("거래 날짜");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "3" });   // 트리거가 `3‒‒‒. 07. 12.`를 그린다
    view.rerender(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={onChange} disabled />);
    return field;
  }

  it("치던 버퍼가 화면에서 사라진다", () => {
    expect(openTypeThenDisable(() => undefined).textContent).toBe("2026. 07. 12.");
  });

  // 위와 나눠 둔다 — 한 `it`에 묶으면 앞 단언이 터졌을 때 이 단언은 **실행조차 안 된다.**
  it("그 버퍼를 확정하지는 않는다", () => {
    const onChange = vi.fn();
    openTypeThenDisable(onChange);
    expect(onChange).not.toHaveBeenCalled();
  });

  // Task 3 #2의 자리. `handleFieldKey`의 `if (disabled) return`이 없으면 `↓`가
  // `setOpen(true)`를 부르고, §7.1 이펙트는 `[disabled]`만 보므로 다시 안 돈다 —
  // 팝오버가 되살아난다. 그 가드가 지금 지키는 것이 이것이다.
  it("비활성인 동안 ↓는 팝오버를 다시 열지 못한다", () => {
    const { field, disable } = openThenDisable();
    disable();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull();
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
    const trigger = fieldOf("거래 날짜");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(trigger, { key: "3" });
    fireEvent.keyDown(trigger, { key: "1" });
    fireEvent.keyDown(trigger, { key: "Enter" });

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
    const trigger = fieldOf("거래 날짜");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(hasCommitClass(trigger)).toBe(false);
  });

  // "완료"가 아니라 훑는 동작이다 — 이 컨트롤은 화살표 한 번마다도 값을 커밋하므로
  // (commitShift, commitAndClose가 아니다), 매번 반짝이면 신호가 아니라 소음이 된다(§12).
  it("화살표로 값을 옮기면(완료를 누르지 않으면) 커밋 클래스가 붙지 않는다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(trigger, { key: "ArrowUp" });

    expect(hasCommitClass(trigger)).toBe(false);
  });

  // 오너가 실측으로 잡은 결함(fix round 1) — 화살표는 즉시 onChange를 부르므로, 완료를
  // 누르는 순간엔 이미 value가 화살표로 옮긴 값으로 갱신돼 있다. 커밋 시점 value와
  // 비교했다면 "안 바뀌었다"고 잘못 읽어 이 케이스에서 신호가 영영 안 떴다 — 세션
  // 시작 값(§6.4: 트리거 포커스·팝오버 닫힘에 찍힌다. 이 시퀀스에서는 trigger.focus()가
  // 찍은 값)과 비교해야 잡힌다.
  it("화살표로 값을 옮긴 뒤 완료하면(세션 시작 값과 달라지면) 커밋 클래스가 붙는다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(trigger, { key: "ArrowUp" });   // commitShift — value가 곧바로 2025-07-12로 바뀐다
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(hasCommitClass(trigger)).toBe(true);
  });

  it("휠을 굴리면 커밋 클래스가 붙지 않는다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");
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
    const trigger = fieldOf("거래 날짜");

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
    const trigger = fieldOf("거래 날짜");

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    fireEvent.keyDown(trigger, { key: "Delete" });
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
    const trigger = fieldOf("거래 날짜");

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
// 않는다 — focusout은 "컨트롤을 떠났다"와 "컨트롤 안에서 옮겼다"를 구분하지 못하는
// 이벤트다(스펙 §6.4).
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
  // `trigger.focus()`는 실제 키보드 사용자의 출발 상태다 — 트리거에 포커스를 둔 채
  // Delete를 친다. 그리고 그것이 focusin 스탬프를 한 번 태워 이 시퀀스를 실사용 경로와
  // 같게 만든다.
  //
  // ⚠️ **초판 주석은 이 줄이 "focusout 리셋 금지"(스펙 §6.4)의 파수꾼이라고 적고 있었다.**
  // 근거는 "팝오버를 여는 것 자체가 포커스를 열로 가져가 트리거에서 focusout이 난다"였는데,
  // **SEG Task 4가 그 메커니즘을 없앴다** — 이 시퀀스에서는 이제 focusout이 아예 안 난다.
  // 그러므로 이 테스트는 그 조항의 파수꾼이 **아니다.** 파수꾼은 이 블록 끝의 두 테스트
  // ("팝오버가 열린 채 포커스를 잃어도 …")다.
  it("닫힌 채 Delete로 지운 값을 완료가 되살리지 않는다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T03:00:00Z"));   // 서울 기준 오늘 = 2026-08-09
    render(<ControlledDateWheelValue initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");

    trigger.focus();                                   // 키보드 사용자의 실제 출발 상태
    fireEvent.keyDown(trigger, { key: "Delete" });      // 닫힌 채 지운다 — clearedRef = true
    fireEvent.keyDown(trigger, { key: "ArrowDown" });   // 연다 — 여기서 리셋되면 안 된다
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(screen.getByTestId("value").textContent).toBe("(빈값)");
  });

  // 대조군 — 지우는 시점만 다르다(열고 나서 비우기). 이건 리셋 이펙트가 이미 돈
  // 뒤에 지우는 경로라 고치기 전에도 통과한다. 이 짝이 있어야 "리셋 시점이 틀렸다"와
  // "clearedRef 자체가 틀렸다"를 구분할 수 있다.
  it("팝오버를 연 뒤 비우기로 지운 값도 완료가 되살리지 않는다 — 대조군", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T03:00:00Z"));
    render(<ControlledDateWheelValue initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");

    fireEvent.keyDown(trigger, { key: "ArrowDown" });   // 먼저 연다
    fireEvent.click(screen.getByRole("button", { name: "비우기" }));
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(screen.getByTestId("value").textContent).toBe("(빈값)");
  });

  // focusin 쪽 리셋 — 위 두 테스트로는 증명되지 않는다. jsdom에서 fireEvent.click은
  // 포커스를 옮기지 않으므로 기존 테스트들의 리셋은 전부 "닫힘" 쪽에서 온다. 이건
  // 컨트롤을 떠났다 돌아오는 경로라 닫힘이 한 번도 일어나지 않는다.
  it("포커스를 잃었다 되찾으면 '지웠다' 기억이 리셋된다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T03:00:00Z"));
    render(<ControlledDateWheelValue initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");

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
    const trigger = fieldOf("거래 날짜");

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
    const trigger = fieldOf("거래 날짜");

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
  // **초판에는 여기 "await·waitFor를 넣지 마라"는 경고가 있었다.** 근거는 commitAndClose의
  // `requestAnimationFrame` 리포커스가 두 완료 사이에 흐르면 그 focus가 onFocus를 불러
  // 닫힘 스탬프를 지운 뮤테이션을 구조한다는 것이었다. **SEG Task 4에서 그 rAF가
  // 사라졌으므로 그 경고도 사라진다** — 포커스는 이제 트리거를 떠난 적이 없어 되돌릴 것이
  // 없고, 그래서 두 완료 사이에 focusin이 날 길 자체가 없다. 이 테스트의 킬력은 이제
  // 오롯이 닫힘 스탬프에만 걸려 있다.
  it("한 번 포커스한 동안 첫 완료에는 확정 신호가 뜬다", () => {
    render(<ControlledDateWheelValue initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const before = trigger.querySelector("span");
    fireEvent.keyDown(trigger, { key: "ArrowUp" });   // 2025로
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(trigger.querySelector("span")).not.toBe(before);
  });

  it("한 번 포커스한 동안 두 번째 완료에는 확정 신호가 뜨지 않는다", () => {
    render(<ControlledDateWheelValue initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowUp" });   // 2025로
    fireEvent.click(screen.getByRole("button", { name: "완료" }));   // 1회차 — 값이 바뀌었으므로 신호가 뜬다
    const afterFirst = trigger.querySelector("span");

    // **전제 가드 — 값이 뒤집혔다.** 초판은 "완료 직후 rAF 전에는 포커스가 아직 트리거로
    // 안 돌아와 있다"를 못박고 있었다. 이제 포커스는 **처음부터 끝까지 트리거에 있다**
    // (설계 스펙 §6.2). 지키는 것은 그대로다: 이 테스트의 킬력은 "두 완료 사이에 기준값을
    // 다시 찍는 focusin이 없다"에 걸려 있고, 포커스가 트리거를 떠났다 돌아오면 그 전제가
    // 깨진다. 그때 조용히 초록으로 남지 않고 여기서 시끄럽게 터지게 한다.
    //
    // 단언이 둘이지만 단락 문제가 아니다 — 독립된 계약이 아니라 **아래 단언의 전제**이고,
    // 이게 터지면 아래 단언은 어차피 아무 뜻이 없다.
    expect(document.activeElement).toBe(trigger);

    fireEvent.keyDown(trigger, { key: "ArrowDown" });                // 2회차 — 다시 연다
    fireEvent.click(screen.getByRole("button", { name: "완료" }));   // 아무것도 안 건드리고 완료

    expect(trigger.querySelector("span")).toBe(afterFirst);
  });

  // ⚠️ **스펙 §6.4의 "focusout에는 아무것도 하지 않는다"를 지키는 두 파수꾼이다.**
  //
  // Task 4 전에는 이 조항을 위쪽 "닫힌 채 Delete" 테스트가 지켰다. 근거가 "팝오버를 여는
  // 것 자체가 포커스를 열로 옮겨 트리거에서 focusout이 난다"였는데 그 메커니즘이 사라져
  // 조항이 무방비가 됐다(금지된 리셋을 심어도 0 red였다).
  //
  // **다시 지킬 수 있는 창이 있다: 팝오버가 열린 채 포커스만 떠나는 상태.** 실제로 도달
  // 가능하다 — `closeOutside`는 `pointerdown`만 보므로 포커스 이동으로는 팝오버가 닫히지
  // 않고, 완료 클릭은 팝오버 `onMouseDown`의 `preventDefault`(§6.3) 때문에 포커스를 트리거로
  // 되돌리지 않는다. 즉 **`focusin`이 한 번도 다시 나지 않는 창**이다(토스트, 자동 포커스
  // 모달, 소비자의 프로그램적 포커스 이동). focusout에 리셋을 심으면 정확히 여기서 관찰된다.
  //
  // 둘은 같은 창의 **서로 다른 상태**를 본다 — 하나는 `clearedRef`, 하나는
  // `sessionStartValueRef`. 한 it에 넣으면 앞이 터질 때 뒤가 실행되지 않는다.
  it("팝오버가 열린 채 포커스를 잃어도 '지웠다' 기억은 남는다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T03:00:00Z"));
    render(<ControlledDateWheelValue initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Delete" });      // 닫힌 채 지운다 — clearedRef = true
    fireEvent.keyDown(trigger, { key: "ArrowDown" });   // 연다 (포커스는 여전히 트리거)
    screen.getByRole("button", { name: "바깥" }).focus();   // focusout — 팝오버는 열린 채다
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(screen.getByTestId("value").textContent).toBe("(빈값)");
  });

  it("팝오버가 열린 채 포커스를 잃어도 세션 기준값은 갱신되지 않는다", () => {
    render(<ControlledDateWheelValue initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");

    trigger.focus();                                       // 기준값 = 2026-07-12
    fireEvent.keyDown(trigger, { key: "ArrowDown" });      // 연다
    const before = trigger.querySelector("span");
    fireEvent.keyDown(trigger, { key: "ArrowUp" });        // 2025로 — value가 곧바로 바뀐다
    screen.getByRole("button", { name: "바깥" }).focus();   // focusout — 여기서 찍으면 안 된다
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(trigger.querySelector("span")).not.toBe(before);
  });
});

// ⚠️ **SEG Task 4가 깨운 잠재 결함을 고정하는 블록이다.**
//
// `commitAndClose`의 `onChange`는 `setOpen(false)`와 같은 배치에 들어간다. 부모가 그 값을
// **한 렌더 늦게** 반영하면, 닫힘 이펙트가 도는 렌더의 `value`는 아직 확정 **전** 값이라
// 세션 기준값이 옛 값으로 찍힌다. 그러면 **다음 완료가 "아무것도 안 바꿨는데" 확정 신호를
// 낸다** — 증상은 "한 번 반짝임" 하나다.
//
// **Task 4 전에는 도달할 수 없었다.** `commitAndClose`가 `requestAnimationFrame`으로
// 트리거에 포커스를 되돌렸고, 포커스가 팝오버 안에 있다가 돌아오는 그 focus가 두 번째
// focusin을 일으켜 **커밋된 값으로 기준값을 다시 찍었기** 때문이다. Task 1 리뷰어가 이걸
// 회귀로 적었다가 도달성을 재고 철회했다. Task 4가 그 안전망을 없앤다 — 포커스가 트리거에
// 머무르면 그 rAF `focus()`는 no-op이 되고 두 번째 focusin이 안 난다(그래서 rAF 자체를
// 지웠다).
//
// **이 파일의 다른 픽스처는 전부 `useState`로 즉시 반영해서 이 경우를 지나가지 않는다.**
// 그래서 지연 반영 부모를 따로 만든다.
describe("DateWheelPicker 지연 반영 부모 — 닫힘 스탬프는 확정한 값으로 찍는다", () => {
  /** onChange를 **한 렌더 늦게** 반영하는 부모. 리덕스·폼 라이브러리처럼 상태가 컴포넌트
   *  바깥에 있어 dispatch가 곧바로 prop이 되지 않는 소비자를 흉내낸다. */
  function DeferredDateWheel({ initialValue }: { initialValue: string }) {
    const [value, setValue] = useState(initialValue);
    const [pending, setPending] = useState<string | null>(null);
    useEffect(() => {
      if (pending === null) return;
      setValue(pending);
      setPending(null);
    }, [pending]);
    return <DateWheelPicker ariaLabel="거래 날짜" value={value} onChange={setPending} />;
  }

  // 전제 — 부모가 정말로 한 렌더 늦게 반영하는가. 이게 아니면 아래 테스트는 즉시 반영
  // 픽스처와 다를 게 없어 아무것도 증명하지 못한다.
  it("이 부모는 onChange를 한 렌더 늦게 반영한다", async () => {
    render(<DeferredDateWheel initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    for (const digit of ["2", "0", "3", "1"]) fireEvent.keyDown(trigger, { key: digit });
    await waitFor(() => expect(trigger.textContent).toBe("2031. 07. 12."));
  });

  // 본 테스트. 타이핑을 **Enter가 확정**해야 한다 — 그래야 `commitAndClose`의 onChange와
  // `setOpen(false)`가 같은 배치에 들어가 닫힘 스탬프가 확정 전 값을 보게 된다. 연도 두
  // 자리("26")는 버퍼로 남았다가 Enter의 flushTyping에서 확정된다.
  //
  // 신호는 classList로 보지 않는다 — 이전 확정의 클래스가 남아 거짓 통과한다.
  // key={commitPulse}가 바뀌면 span이 리마운트되므로 **노드 신원**으로 본다.
  it("타이핑을 Enter로 확정해 닫은 뒤, 아무것도 안 바꾸고 다시 완료하면 신호가 뜨지 않는다", async () => {
    render(<DeferredDateWheel initialValue="2020-07-12" />);
    const trigger = fieldOf("거래 날짜");

    trigger.focus();                                    // 기준값 = 2020-07-12
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(trigger, { key: "2" });
    fireEvent.keyDown(trigger, { key: "6" });
    fireEvent.keyDown(trigger, { key: "Enter" });       // 확정 — 여기서 닫힘 스탬프가 찍힌다
    await waitFor(() => expect(trigger.textContent).toBe("2026. 07. 12."));
    const afterFirst = trigger.querySelector("span");

    fireEvent.keyDown(trigger, { key: "ArrowDown" });   // 2회차 — 다시 연다
    fireEvent.keyDown(trigger, { key: "Enter" });       // 아무것도 안 건드리고 완료

    expect(trigger.querySelector("span")).toBe(afterFirst);
  });

  // 대조군 — 같은 부모에서 값을 **실제로** 바꾸면 신호는 그대로 떠야 한다. 이게 없으면
  // "닫힘 스탬프를 확정 값으로 찍는다"와 "신호를 아예 죽였다"를 구분하지 못한다.
  it("같은 부모에서 값을 실제로 바꾸고 완료하면 신호가 뜬다", async () => {
    render(<DeferredDateWheel initialValue="2020-07-12" />);
    const trigger = fieldOf("거래 날짜");

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    const before = trigger.querySelector("span");
    fireEvent.keyDown(trigger, { key: "2" });
    fireEvent.keyDown(trigger, { key: "6" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    await waitFor(() => expect(trigger.textContent).toBe("2026. 07. 12."));
    expect(trigger.querySelector("span")).not.toBe(before);
  });
});

// 설계 스펙 §4.5 — 트리거 문구가 **세그먼트로 쪼개진다.** 표시만 바뀌는 Task라 키 계약도
// 포커스도 그대로다: 버퍼를 만들려면 아직 팝오버를 열어 열에 쳐야 한다(Task 4가 옮긴다).
//
// 조각 텍스트를 이으면 예전 formatDateTrigger가 만들던 문자열과 글자 하나까지 같다 —
// 트리거를 textContent 하나로 보는 기존 단언 스무 곳이 그 등가성의 파수꾼이라 여기서
// 다시 세지 않는다. 여기서 새로 고정하는 것은 **구조**(어떤 요소가 어떤 자리를 그리는가)다.
// 설계 스펙 §8 — **트리거의 접근성 이름이 값을 함께 싣는다**: `"거래 날짜, 2026. 07. 12."`.
// 포커스가 트리거를 떠나지 않게 되면서(§6.2) 값을 읽히게 할 자리가 여기밖에 남지 않았다.
// 초판 모델에서는 포커스가 옮겨간 열의 `aria-label="연도 2026"`이 값을 실어 날랐다.
//
// ⚠️ **이 블록이 없으면 이름 계약을 지키는 것이 하나도 없다.** 이 파일의 트리거 조회는 전부
// `fieldOf`를 지나가는데 그것은 **접두사만** 본다 — 값이 통째로 빠져도 49곳이 전부 그대로
// 초록이다. 쿼리가 초록의 이유가 되는 통로이고, 이 라운드에서 이미 두 번 만난 모양이다.
//
// ⚠️ **읽히는 것은 "값"이지 "활성 세그먼트"가 아니다.** 지금 어느 세그먼트를 치고 있는지는
// 여전히 안 읽힌다 — §8의 `aria-activedescendant` 조항은 그대로 살아 있는 구멍이다.
// 이 블록이 그것을 메웠다고 읽지 말 것.
describe("DateWheelPicker 트리거 접근성 이름", () => {
  /**
   * ⚠️ **이 블록은 트리거를 이름으로 찾지 않는다.** 이름이 검사 대상인데 이름으로 찾으면
   * 순환이고, 더 나쁜 것은 **이름이 깨졌을 때 단언이 아니라 쿼리가 던진다**는 것이다 —
   * 실패 메시지가 "무엇이 틀렸는가"가 아니라 "찾을 수 없다"가 되고, 같은 뮤테이션이 이름과
   * 무관한 테스트 수십 개까지 같이 죽여 매핑이 읽히지 않게 된다(실제로 그랬다: 이름에서
   * 레이블 접두사를 떼는 뮤테이션에 142개가 빨개졌다).
   *
   * 닫힌 픽커에는 버튼이 트리거 하나뿐이라 역할만으로 찾을 수 있다. 팝오버를 여는 테스트는
   * **열기 전에** 이 노드를 잡아 둔다.
   */
  function triggerNode() { return screen.getByRole("button"); }

  it("이름이 레이블 뒤에 값을 싣는다", () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    expect(triggerNode().getAttribute("aria-label")).toBe("거래 날짜, 2026. 07. 12.");
  });

  it("값이 바뀌면 이름도 따라 바뀐다", () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const field = triggerNode();
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowDown" });   // 연다
    fireEvent.keyDown(field, { key: "ArrowDown" });   // 활성은 연도 — 2027로

    expect(field.getAttribute("aria-label")).toBe("거래 날짜, 2027. 07. 12.");
  });

  // 값이 없으면 placeholder를 잇는다(§8). 이름을 레이블 하나로 되돌리는 것과 다르다 —
  // 그 경우 "거래 날짜"만 남고, 여기서는 무엇이 비었는지가 읽힌다.
  it("값이 비면 placeholder를 싣는다", () => {
    render(<ControlledDateWheel initialValue="" />);
    expect(triggerNode().getAttribute("aria-label")).toBe("거래 날짜, 날짜 선택");
  });

  // **화면과 이름이 같은 출처에서 나온다는 것**이 조각을 그대로 잇는 방식을 고른 이유다.
  // 버퍼를 치는 동안이 그 둘이 갈라지기 가장 쉬운 순간이라(이름만 `value`를 읽게 만들면
  // 곧바로 갈린다), 여기서 고정한다. 위 세 테스트는 버퍼가 없어 이 결함을 지나가지 못한다.
  //
  // ⚠️ **채움 문자(U+2012)만은 이름에서 뺀다 — 설계 스펙 §8이 그렇게 정했다**(`9014bf5`).
  // 그 문자를 고른 이유는 §4.5에 적혀 있고 **오직 어드밴스 폭 하나**다. 눈으로 보라고 넣은
  // 자리 표시가 귀로도 읽혀야 할 이유가 없고, 빈 자리마다 반복되므로 네 자리 연도를 치는
  // 동안 이름이 정보 없이 길어졌다 짧아진다. **"화면과 갈라질 수 없다"는 원칙은 그대로다** —
  // 같은 출처에서 만들고 **할 말이 없는 문자 하나만** 빼는 것이지 다른 것을 말하는 게 아니다.
  //
  // 그래서 이 단언의 기대값이 `20‒‒`에서 `20`으로 바뀌었다. 실제로 스크린리더가 U+2012를
  // 어떻게 발음하는지(무시/`dash`/`figure dash`)는 실기기 항목이고, **그 답과 무관하게** 뺀다.
  it("치는 동안에도 이름이 화면과 같은 출처를 싣는다 — 채움 문자만 빼고", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const field = triggerNode();   // 열기 전에 잡는다 — 열면 팝오버 버튼이 여럿 생긴다
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(field, { key: "2" });
    fireEvent.keyDown(field, { key: "0" });

    expect(field.getAttribute("aria-label")).toBe("거래 날짜, 20. 07. 12.");
  });

  // 위 테스트의 짝 — **화면 쪽은 그대로 채움 문자를 그려야 한다.** 이름에서 빼는 고침이
  // `dateTriggerParts`나 렌더까지 건드리면 §4.5의 폭 보장이 통째로 죽는데, 위 단언만으로는
  // 그것이 안 잡힌다(둘 다 `20. 07. 12.`가 되어 통과한다).
  it("이름에서 뺐어도 화면은 채움 문자를 그대로 그린다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const field = triggerNode();
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(field, { key: "2" });
    fireEvent.keyDown(field, { key: "0" });

    expect(field.textContent).toBe(`20${FILL}${FILL}. 07. 12.`);
  });

  // 소비자가 준 `ariaLabel`이 접두사로 남는다 — PRINCIPLES §11의 "ariaLabel은 필수"는
  // 그대로다. 없애는 것이 아니라 뒤에 값을 잇는 것이다.
  it("소비자가 준 ariaLabel이 그대로 앞에 남는다", () => {
    render(<DateWheelPicker ariaLabel="종료일" value="2026-07-12" onChange={() => undefined} />);
    expect(triggerNode().getAttribute("aria-label")).toBe("종료일, 2026. 07. 12.");
  });
});

// 오너: "필수 날짜 픽커 열 때 휠들이 애니메이션이 생기면서 열리는데 이거 좋은 것 같은데,
// 다른 픽커들은 적용이 안 돼 있네."
//
// **오너가 좋아한 그것은 기능이 아니라 결함이었습니다.** 새로 로드하면 어느 픽커도 하지
// 않고, ±로 한 칸 옮긴 열만 `moving-*`를 **영원히** 달고 있다가 닫았다 열 때마다
// `date-wheel-slide-previous`를 다시 재생했습니다(코디네이터 실브라우저 측정). 즉
// **"값이 움직였다"는 신호가 아무것도 안 움직인 열림에서 재생**되고 있었고, 그 열만 되고
// 나머지는 안 되던 이유도 그것입니다.
//
// 그래서 둘로 나눕니다 — 거짓 신호를 없애고(아래 첫 테스트), 오너가 원한 **진입**
// 애니메이션을 **모든 열에 균일하게** 따로 만듭니다.
//
// ⚠️ **두 신호는 이름도 대상도 달라야 합니다.** 진입을 슬라이드로 재사용하면 방금 없앤
// 거짓 신호가 그대로 돌아옵니다. 슬라이드는 `.date-wheel-values`(값이 움직였다),
// 진입은 `.date-wheel-column`(팝오버가 열렸다)입니다.
describe("DateWheelPicker 팝오버 진입 애니메이션", () => {
  function openPicker() {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={() => undefined} />);
    const trigger = fieldOf("거래 날짜");
    fireEvent.click(trigger);
    return trigger;
  }
  const columns = () => [...document.querySelectorAll(".date-wheel-column")];

  // 이동 신호는 **그 이동에만** 붙어 있어야 합니다. 세션 내내 남으면 다음 열림이 그것을
  // 물려받아, 아무것도 안 움직였는데 움직였다고 말합니다.
  it("닫았다 열면 지난 이동의 moving-*이 남아 있지 않다", async () => {
    const trigger = openPicker();
    fireEvent.click(screen.getByRole("button", { name: "연도 이전" }));   // 연 열을 무장시킨다

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(document.querySelector(".date-wheel-column")).toBeNull());
    fireEvent.click(trigger);
    await waitFor(() => expect(document.querySelector(".date-wheel-column")).not.toBeNull());

    expect(columns().map((column) => /moving-\w+/.exec(column.className)?.[0] ?? null)).toEqual([null, null, null]);
  });

  // ⚠️ **진입에서 "방향 없음" 계약은 걷혔습니다.** 오너가 뒤집었습니다:
  // **"날짜 피커 열 때 휠이 드르륵 움직이는 것 같은 애니메이션 적용해."**
  // 구르는 진입은 "값이 이쪽으로 움직였다"는 **주장이 아니라 컨트롤이 도착했다는 연출**이라,
  // 금지의 근거였던 "진입에는 방향이 없다"가 성립하지 않습니다.
  //
  // **그러나 지키려던 진짜 계약은 남습니다: 진입과 이동은 서로 구분돼야 한다.** 없으면
  // 잔재가 거짓 신호로 재생되던 그 결함이 형태만 바꿔 돌아옵니다. 네 축으로 갈라 둡니다:
  //
  //   1. **모든 열이 함께** 구른다 (이동은 한 열만) — 눈에 가장 먼저 들어오는 차이
  //   2. 다른 이름 (`date-wheel-enter` / `date-wheel-slide-*`)
  //   3. 다른 **게이트** (`.entering`은 열림 창에만 / `.moving-*`은 값이 움직였을 때)
  //   4. 다른 길이·커브 (320ms 감속+멎음 / 210ms)
  //
  // ⚠️ **대상은 갈라 두지 못했습니다 — 물리적으로 불가능합니다.** 지난 라운드에는 진입이
  // `.date-wheel-column`에 있었는데, CSS 애니메이션은 **선언된 그 요소만** 변형할 수 있고
  // 굴러야 하는 것은 **행**(`.date-wheel-values`)입니다. 열을 세로로 옮기면 ± 버튼과
  // 테두리까지 든 상자가 통째로 미끄러지는 것이지 휠이 구르는 것이 아닙니다.
  //
  // 대상을 나눠 얻으려던 것("커밋마다 진입이 재생되지 않는다")은 **다른 방법으로 지킵니다:**
  // 이동 규칙이 진입 규칙과 **같은 특이도**이고 파일에서 **뒤에** 오므로, 커밋 프레임에서는
  // 이동이 이깁니다. 아래 "이동 규칙이 뒤에 온다"가 그것을 고정합니다.
  it("진입은 값 컨테이너를 굴리고, 열의 entering이 그것을 연다", () => {
    expect(datePickerCssSource).toMatch(/\.date-wheel-column\.entering \.date-wheel-values \{[^}]*animation: date-wheel-enter 280ms/);
  });

  it("진입 키프레임이 있다", () => {
    expect(datePickerCssSource).toMatch(/@keyframes date-wheel-enter/);
  });

  // **이제는 방향이 있어야 합니다.** 없으면 "드르륵"이 아니라 예전의 방향 없는 진입입니다.
  // 전제(키프레임이 있다)는 바로 위 테스트가 집니다.
  it("진입 키프레임은 굴러 내려온다", () => {
    const keyframes = /@keyframes date-wheel-enter\s*\{[\s\S]*?\n\}/.exec(datePickerCssSource)?.[0] ?? "(진입 키프레임이 없다)";
    expect(keyframes).toMatch(/0%\s*\{[^}]*translateY\(-60px\)/);
  });

  // **travel은 프리로드가 감당하는 30px이 상한입니다.** 값 컨테이너 210px(7행), 뷰포트
  // 150px이므로 뷰포트가 보는 구간은 [Y, Y+150]이고 Y는 0~60만 가능합니다. 기본이 -30px
  // 이므로 시작점은 -60px보다 위로 갈 수 없습니다 — 넘기면 뷰포트 끝에 행이 없는 빈 띠가
  // 생깁니다. F1의 드래그 클램프 ±30과 **같은 기하에서 나온 같은 수**입니다.
  it("진입은 -60px에서 시작해 기본 자리 -30px로 멎는다", () => {
    const keyframes = /@keyframes date-wheel-enter\s*\{[\s\S]*?\n\}/.exec(datePickerCssSource)?.[0] ?? "(진입 키프레임이 없다)";
    expect(keyframes).toMatch(/100%\s*\{[^}]*translateY\(-30px\)/);
  });

  // **모든 열이 함께 구릅니다** — 축 1. 규칙은 하나이고, 열마다 다른 것은 **시차뿐**입니다.
  // 시차를 `animation-delay` 규칙으로 따로 주면 그 규칙이 이동 규칙보다 특이도가 높아져
  // 커밋 프레임의 슬라이드에까지 지연이 붙습니다. 커스텀 프로퍼티로 주면 진입 규칙이
  // **하나로 유지**되어 그 문제가 없습니다.
  it("열마다 다른 것은 시차뿐이다", () => {
    expect([
      /\.date-wheel-column:nth-child\(2\) \{[^}]*--date-wheel-enter-delay:\s*([^;]+)/.exec(datePickerCssSource)?.[1]?.trim() ?? null,
      /\.date-wheel-column:nth-child\(3\) \{[^}]*--date-wheel-enter-delay:\s*([^;]+)/.exec(datePickerCssSource)?.[1]?.trim() ?? null,
    ]).toEqual(["40ms", "80ms"]);
  });

  // **이동이 진입을 이겨야 합니다** — 커밋 프레임에서 값 컨테이너가 리마운트되는데, 그때
  // 진입이 다시 재생되면 슬라이드와 겹칩니다. 둘은 특이도가 같으므로(둘 다 (0,3,0))
  // **파일 안의 순서**가 승부를 가릅니다. 이동을 뒤에 둡니다.
  it("이동 규칙이 진입 규칙보다 파일에서 뒤에 온다", () => {
    const enter = datePickerCssSource.indexOf(".date-wheel-column.entering .date-wheel-values");
    const move = datePickerCssSource.indexOf(".date-wheel-column.moving-next .date-wheel-values");
    expect([enter >= 0, move >= 0, enter < move]).toEqual([true, true, true]);
  });

  // PRINCIPLES §12 — reduced-motion에서 **이동을 뺍니다.** 지난 판의 진입에는 이동이 없어
  // 이 조항에 안 걸렸는데, 구르는 진입은 정면으로 대상입니다.
  //
  // ⚠️ 특이도를 맞춰야 합니다. reduced 블록의 맨 앞 `.date-wheel-values`는 (0,1,0)이라
  // 진입 규칙 (0,3,0)을 **못 이깁니다.** 그래서 진입의 선택자를 그대로 목록에 넣습니다 —
  // 이웃한 이동 규칙이 이미 같은 이유로 그렇게 돼 있습니다.
  it("reduced-motion에서 진입의 이동이 제거된다", () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/.exec(datePickerCssSource)?.[0] ?? "(reduced 블록이 없다)";
    expect(reduced).toMatch(/\.date-wheel-column\.entering \.date-wheel-values/);
  });

  // ── DOM: 게이트가 실제로 열리고 닫히는가 ────────────────────────────────────
  //
  // CSS가 옳아도 `.entering`이 안 붙으면 아무 일도 안 일어나고, **안 걷히면** 더 나쁩니다:
  // 스와이프 pointerdown이 `moving-*`을 떼는 순간 값 컨테이너의 animation-name이
  // 이동 → 진입으로 **바뀌면서 진입이 세션 도중에 재생**됩니다. 그래서 창이 닫히는 것까지
  // 고정합니다.
  it("팝오버가 열리면 세 열 모두 entering이 붙는다", () => {
    openPicker();
    expect(columns().map((column) => column.classList.contains("entering"))).toEqual([true, true, true]);
  });

  // 위가 전제입니다 — 클래스가 아예 안 붙으면 이 테스트는 공허 통과합니다.
  it("진입 창이 지나면 entering이 걷힌다", () => {
    vi.useFakeTimers();
    openPicker();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(columns().map((column) => column.classList.contains("entering"))).toEqual([false, false, false]);
  });

  // ── 게이트 창과 CSS 총 길이는 **같은 수여야 합니다** ────────────────────────
  //
  // 진입이 끝나는 시각은 **CSS**에 있고(지속시간 + 마지막 열의 시차), 게이트를 걷는
  // 시각은 **JS 상수**에 있습니다. 서로 모르는 두 파일의 두 숫자입니다.
  //
  // **갈라지면 둘 다 나쁩니다.** 게이트가 짧으면 마지막 열이 멎기 전에 클래스가 빠져
  // **애니메이션이 중간에 잘리고**, 길면 그 초과 구간에서 스와이프 `pointerdown`이
  // `moving-*`을 떼는 순간 animation-name이 이동 → 진입으로 바뀌며 **진입이 세션 도중**
  // **재생**됩니다. 그래서 기대값을 상수로 적지 않고 **CSS에서 유도해** 비교합니다 —
  // 한쪽만 바꾸면 곧바로 빨개집니다.
  //
  // 이 둘은 값을 바꾼 지금도 초록입니다(커플링이 지켜지고 있으므로). 빨개질 수 있다는
  // 것은 뮤테이션으로 확인했습니다 — JS 상수만 줄이면 앞이, 늘리면 뒤가 죽습니다.
  function enterTotalFromCss() {
    const duration = /\.date-wheel-column\.entering \.date-wheel-values \{[^}]*animation: date-wheel-enter (\d+)ms/.exec(datePickerCssSource)?.[1];
    const lastDelay = /\.date-wheel-column:nth-child\(3\) \{[^}]*--date-wheel-enter-delay:\s*(\d+)ms/.exec(datePickerCssSource)?.[1];
    return Number(duration) + Number(lastDelay);
  }

  it("게이트는 마지막 열이 멎기 전에 걷히지 않는다", () => {
    vi.useFakeTimers();
    openPicker();
    act(() => { vi.advanceTimersByTime(enterTotalFromCss() - 30); });
    expect(columns().map((column) => column.classList.contains("entering"))).toEqual([true, true, true]);
  });

  it("게이트는 마지막 열이 멎은 직후 걷힌다", () => {
    vi.useFakeTimers();
    openPicker();
    act(() => { vi.advanceTimersByTime(enterTotalFromCss() + 30); });
    expect(columns().map((column) => column.classList.contains("entering"))).toEqual([false, false, false]);
  });
});

describe("DateWheelPicker 트리거 세그먼트", () => {
  function segmentUnits(trigger: HTMLElement) {
    return [...trigger.querySelectorAll(".date-wheel-segment")].map((element) => element.getAttribute("data-unit"));
  }
  function segmentTexts(trigger: HTMLElement) {
    return [...trigger.querySelectorAll(".date-wheel-segment")].map((element) => element.textContent);
  }
  /** 개수가 아니라 **신원**으로 읽는다 — 어느 자리를 그리는가가 계약이다. */
  function segmentText(trigger: HTMLElement, unit: string) {
    return trigger.querySelector(`.date-wheel-segment[data-unit="${unit}"]`)?.textContent ?? null;
  }
  function container(trigger: HTMLElement) {
    return trigger.querySelector("span")!;
  }

  /** 버퍼를 들고 있는 상태를 만든다. 팝오버를 여는 이유는 버퍼 때문이 아니라 `↑`/`↓`가
   *  상태로 갈리는 것과 무관하게 이 블록의 초판 시퀀스를 그대로 두기 위해서다 — 닫힌 채
   *  타이핑하는 계약은 SEG Task 5가 연다. */
  async function openAndBuffer(initialValue: string, keys: string[]) {
    render(<ControlledDateWheel initialValue={initialValue} />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    for (const key of keys) fireEvent.keyDown(trigger, { key });
    return trigger;
  }

  it("값이 있으면 세그먼트가 연·월·일 셋으로 그려진다", () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    expect(segmentUnits(fieldOf("거래 날짜"))).toEqual(["year", "month", "day"]);
  });

  it("각 세그먼트가 값에서 자기 자리만 그린다", () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    expect(segmentTexts(fieldOf("거래 날짜"))).toEqual(["2026", "07", "12"]);
  });

  // 구두점은 장식이다.
  //
  // **지금 이 순간 스크린리더가 이 점들을 읽고 있는 것은 아니다.** 트리거가 aria-label을
  // 달고 있어 접근성 이름이 내용을 통째로 덮으므로, aria-hidden이 있든 없든 버튼은
  // "거래 날짜"로만 읽힌다. 붙이고 고정하는 이유는 **스펙 §4.5가 명시했기 때문**이다.
  //
  // ⚠️ 여기 "트리거가 aria-label을 놓는 날 내용이 곧바로 이름이 되니까"라고 적었었는데,
  // 그건 **미검증이고 방향이 반대일 수 있다** — 그 날이 오면 aria-hidden이 구분자를
  // 이름에서 빼므로 name-from-contents가 "2026" "07" "12"를 어떻게 잇느냐에 따라 지금보다
  // **덜** 읽히는 이름이 될 수도 있다(요소 경계의 공백 처리는 accname 구현마다 다르다).
  // 재 보기 전에는 미래 근거로 쓰지 않는다. 지금 근거는 스펙 하나로 충분하다.
  //
  // 텍스트와 aria-hidden을 한 문자열로 묶어 단언 하나로 본다(단락 없이 둘 다 본다).
  it("세그먼트 사이 구두점은 aria-hidden 장식이다", () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const punctuation = [...fieldOf("거래 날짜").querySelectorAll(".date-wheel-punctuation")];
    expect(punctuation.map((element) => `${element.textContent}|${element.getAttribute("aria-hidden")}`)).toEqual([". |true", ". |true", ".|true"]);
  });

  // 스펙 §4.5의 (나)안 — 자리를 지킨다. 기각된 (가)안이면 "20"이 나온다.
  //
  // **길이가 아니라 문자열 전체를 신원으로 비교한다.** 그래서 이 단언은 "몇 칸을
  // 채웠는가"와 "**어떤 문자로** 채웠는가"를 함께 고정한다 — 채움 문자를 밑줄로 되돌리는
  // 결함도 여기서 죽는다. 폭이 흔들리지 않는 것이 이 표시 방식의 유일한 이유인데, 밑줄은
  // tabular 치환을 받지 못해 그 이유를 절반만 달성한다(FILL 상수 주석의 실측표).
  it("연도 버퍼가 두 자리면 남은 자리를 FIGURE DASH로 지킨다", async () => {
    const trigger = await openAndBuffer("2026-07-12", ["2", "0"]);
    expect(segmentText(trigger, "year")).toBe(`20${FILL}${FILL}`);
  });

  // 세 자리 — 기각된 (가)안이면 "203"이다. 두 자리 케이스만 있으면 한 칸만 붙이는
  // 구현(digits + FILL)이 살아남는다. 그건 "20"에서 `20‒`가 되어 위 테스트만 죽인다.
  it("연도 버퍼가 세 자리면 한 칸만 남는다", async () => {
    const trigger = await openAndBuffer("2026-07-12", ["2", "0", "3"]);
    expect(segmentText(trigger, "year")).toBe(`203${FILL}`);
  });

  it("연도를 치는 동안 월·일 세그먼트는 그대로다", async () => {
    const trigger = await openAndBuffer("2026-07-12", ["2", "0"]);
    expect([segmentText(trigger, "month"), segmentText(trigger, "day")]).toEqual(["07", "12"]);
  });

  // 월은 두 칸이다. 연도의 네 칸을 그대로 쓰면 `1‒‒‒`가 된다.
  it("월 버퍼는 두 칸만 지킨다 — 연도의 네 칸을 쓰지 않는다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    fireEvent.keyDown(trigger, { key: "1" });
    expect(segmentText(trigger, "month")).toBe(`1${FILL}`);
  });

  it("값도 버퍼도 없으면 placeholder 문구가 나온다", () => {
    render(<ControlledDateWheel initialValue="" />);
    expect(fieldOf("거래 날짜").textContent).toBe("날짜 선택");
  });

  it("값도 버퍼도 없으면 세그먼트가 하나도 없다", () => {
    render(<ControlledDateWheel initialValue="" />);
    expect(segmentUnits(fieldOf("거래 날짜"))).toEqual([]);
  });

  it("값도 버퍼도 없으면 컨테이너에 placeholder 클래스가 붙는다", () => {
    render(<ControlledDateWheel initialValue="" />);
    expect(container(fieldOf("거래 날짜")).classList.contains("placeholder")).toBe(true);
  });

  // 소비자가 형식에 안 맞는 값을 넘기는 경로 — `.superpowers/sdd/final-review-fixes-report.md:268`이
  // 실제로 밟은 자리다(깨진 값이 validDateValue에 걸려 placeholder로 떨어진다).
  //
  // **여기가 예전 코드에서 두 판정이 갈리던 자리다.** 문구는 `!validDateValue(value)`로
  // 정하는데 `.placeholder` 색은 `!value`로 정해서, 값이 비지 않았는데 형식이 깨진 경우
  // placeholder 문구를 그리면서 색은 안 주는 상태가 있었다. 두 판정을 하나로 묶었고,
  // 그 판단이 증명 없이 남지 않도록 여기서 고정한다.
  it("형식이 깨진 값을 받으면 placeholder 문구와 그 색이 함께 나온다", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="abc" onChange={() => undefined} />);
    expect(container(fieldOf("거래 날짜")).classList.contains("placeholder")).toBe(true);
  });

  // 값이 비어 있어도 버퍼가 있으면 placeholder를 버린다 — 그 자리는 이제 숫자가 차지한다.
  it("값이 비어도 버퍼가 있으면 placeholder 클래스가 빠진다", async () => {
    const trigger = await openAndBuffer("", ["2", "0"]);
    expect(container(trigger).classList.contains("placeholder")).toBe(false);
  });

  // 아직 치지 않은 세그먼트는 baseValue(=오늘, min/max로 자름)를 보여준다 — 팝오버의 휠이
  // 빈 값일 때 이미 baseValue를 그리고 있으므로, 화면 두 곳이 같은 것을 말하게 하는 것이다.
  // 문자열 전체를 신원으로 본다: placeholder가 사라진 것, 버퍼가 자리를 지킨 것, 안 친
  // 자리가 baseValue인 것이 한 줄에 다 들어 있다.
  //
  // openAndBuffer를 쓰지 않고 동기로 푼다 — findByRole은 가짜 타이머 아래서 폴링이 돌지
  // 않아 그대로 멈춘다(실측: 5초 타임아웃). 이 파일의 다른 가짜 타이머 테스트들도 같은
  // 이유로 click + 동기 getByRole을 쓴다.
  it("값이 비었는데 숫자를 치면 baseValue 세그먼트가 나온다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T03:00:00Z"));   // 서울 기준 오늘 = 2026-07-12
    render(<ControlledDateWheel initialValue="" />);
    const trigger = fieldOf("거래 날짜");
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "2" });
    fireEvent.keyDown(trigger, { key: "0" });
    expect(trigger.textContent).toBe(`20${FILL}${FILL}. 07. 12.`);
  });

  it("fields가 연도뿐이면 세그먼트도 연도 하나다", () => {
    render(<DateWheelPicker ariaLabel="회계 연도" value="2026-07-12" fields={["year"]} onChange={() => undefined} />);
    expect(segmentUnits(fieldOf("회계 연도"))).toEqual(["year"]);
  });

  // 스펙 §11 — **활성 세그먼트의 초기값이 첫 세그먼트와 같다.** 기본 상태로 검사하면 "활성
  // 세그먼트를 그린다"와 "첫 세그먼트를 그린다"가 구분되지 않으므로, →를 한 번 눌러 둘을
  // 갈라놓고 개수가 아니라 **신원**으로 확인한다.
  it("→로 활성 열을 옮기면 활성 세그먼트도 월로 따라간다", async () => {
    render(<ControlledDateWheel initialValue="2026-07-12" />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    expect(activeSegment()).toBe("month");
  });

  // 소비자가 런타임에 fields를 줄이면(일간/월간 토글) activeUnit이 사라진 열을 계속 가리킨다.
  // 트리거는 resolvedActiveUnit(클램프한 값)으로 그려야 하고, 원본 activeUnit으로 그리면
  // 어느 세그먼트도 활성이 아니게 된다.
  //
  // **팝오버를 닫은 뒤에 fields를 줄인다.** 그래야 이 테스트가 보는 소스 줄이 트리거
  // 세그먼트의 클램프 하나로 좁혀진다 — 열려 있으면 열 렌더의 클램프(위 "리뷰 Finding 1"
  // 블록이 보는 줄)와 겹친다. 닫힘을 waitFor로 못박는 것은 독립된 계약이 아니라 아래
  // 단언의 **전제**이고, 이게 성립하지 않으면 아래 단언은 아무것도 증명하지 못한다.
  it("fields가 줄어 활성 열이 사라지면 트리거는 클램프된 첫 세그먼트를 활성으로 그린다", async () => {
    render(<DateWheelFieldsShrink />);
    const trigger = fieldOf("거래 날짜");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("dialog", { name: "거래 날짜 선택" });
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    fireEvent.keyDown(trigger, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거래 날짜 선택" })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "일 열 제거" }));
    expect(activeSegment()).toBe("year");
  });

  // §12의 확정 신호는 **날짜 하나에 대한 사건**이지 세그먼트에 대한 사건이 아니다. 신호를
  // 재생하는 요소가 정확히 하나이고, 그것이 세그먼트가 아니라 세그먼트 셋을 감싸는
  // 컨테이너라는 것을 단언 하나로 본다 — className에 "date-wheel-segment"가 섞이면 조각이
  // 따로 반짝인다는 뜻이고, 안에 세 세그먼트가 다 들어 있어야 "값 전체"다.
  it("확정 신호는 세그먼트가 아니라 값 전체를 감싸는 컨테이너 하나에 붙는다", async () => {
    const trigger = await openAndBuffer("2026-07-12", ["3", "1"]);
    fireEvent.keyDown(trigger, { key: "Enter" });

    const pulsing = [...trigger.querySelectorAll(".dropdown-value-commit")];
    expect(pulsing.map((element) => [element.className, [...element.querySelectorAll(".date-wheel-segment")].map((segment) => segment.getAttribute("data-unit"))]))
      .toEqual([["dropdown-value-commit", ["year", "month", "day"]]]);
  });

  // **CSS만으로는 알 수 없는 것: 칩과 확정 펄스가 겹치는가.**
  //
  // 세그먼트가 자기 `color`를 선언하면 확정 펄스의 상속이 끊깁니다. 지금 그것이 문제가
  // 되지 않는 이유는 **겹치지 않기 때문**입니다 — 확정하며 닫는 것이 곧 편집의 끝이라,
  // 펄스가 재생되는 그 순간 `.editing`이 이미 빠져 있고 칩은 그려지지 않습니다.
  //
  // **이 하나가 세그먼트 전용 펄스 규칙을 지운 근거 전부입니다.** 여기가 빨개지면 그
  // 규칙(또는 그에 상응하는 것)이 돌아와야 합니다 — 겹치는 순간 반전 칩만 확정 신호에서
  // 조용히 빠지고, **jsdom은 애니메이션을 안 돌리므로 다른 어떤 테스트도 못 잡습니다.**
  it("확정 펄스가 붙는 순간 칩은 그려지지 않는다 — 그래서 상속이 끊기지 않는다", async () => {
    const trigger = await openAndBuffer("2026-07-12", ["3", "1"]);
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect([
      document.querySelector(".dropdown-value-commit") !== null,
      trigger.classList.contains("editing"),
    ]).toEqual([true, false]);
  });

  // jsdom은 캐스케이드를 계산하지 않으므로 소스 텍스트로 고정한다 — 이 파일 위쪽
  // "CSS 계약" 블록과 같은 idiom이다.
  //
  // **이 블록의 네 단언은 전부 소진형(`toEqual`)이다. 존재형·필터형으로 쓰지 마라.**
  // 리뷰가 실측한 구멍이 그 형태였다: "좋은 규칙이 있다"만 보면 규칙을 *지우는* 결함은
  // 잡히지만 규칙을 *덧붙이는* 결함은 통째로 새어 나간다. 실제로 세 단언이 그랬고,
  // 셋 다 브리프·주석이 이름 대고 금지한 해악을 초록으로 통과시켰다:
  //
  //   · `>` 규칙을 그대로 둔 채 `.date-wheel-trigger span { …ellipsis… }`를 **추가**
  //   · 게이트를 통과한 `.active` 규칙에 `font-variant-numeric: normal`을 **추가**
  //   · 선택자 목록이 **두 줄인** `color` 규칙을 **추가**(정규식이 줄바꿈을 못 넘어 0회
  //     매칭 → `filter(...)` → `[]` → **공허 통과**)
  //
  // 그래서 규칙을 파싱해 **선택자 목록 전체**를 신원으로 비교한다. 0회 매칭은 빈 배열이
  // 기대 배열과 달라 시끄럽게 터진다 — `.not.toMatch(...)`처럼 빈 입력에 무조건 통과하는
  // 형태를 이 블록에 들이지 마라.
  describe("CSS 계약", () => {
    /**
     * `date-picker.css`를 규칙 단위로 쪼갠다.
     *
     * **주석을 먼저 걷어낸다.** 이 킷의 주석은 선택자와 선언을 그대로 인용하는 관습이라
     * (바로 이 파일이 그렇다), 안 걷어내면 파서가 주석을 규칙으로 읽어 거짓 통과가 난다.
     *
     * **선택자는 여러 줄일 수 있다.** 줄바꿈을 못 넘는 정규식이 위 구멍의 직접 원인이라
     * 여기서는 `[^{}]`로 넘긴다. 잡은 뒤 공백과 결합자를 정규화해, 줄바꿈이나 `>` 주변
     * 공백 같은 서식 차이로는 안 갈리고 **선택자의 뜻이 달라질 때만** 갈리게 한다.
     *
     * `@media`·`@keyframes`의 prelude는 `[^{}]+\{` 가 중첩 `{`를 못 넘어 매칭에 실패하고
     * 건너뛰어진다. 안쪽 규칙들은 정상적으로 잡힌다.
     */
    function cssRules(source: string) {
      return [...source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
        selector: match[1]
          .replace(/\s+/g, " ")
          .replace(/\s*([>+~])\s*/g, " $1 ")
          .replace(/\s*,\s*/g, ", ")
          .replace(/\s+/g, " ")
          .trim(),
        body: match[2].replace(/\s+/g, " ").trim(),
      }));
    }
    /**
     * `color:` **속성** 선언이 있는가. `background: color-mix(…)`·`border-color:`는 아니다 —
     * 앞에 `-`가 오거나 뒤에 `-`가 오는 경우를 둘 다 걸러낸다.
     *
     * **"이 규칙에 색이 하나도 없다"가 아니라 "상속되는 `color` 속성을 덮지 않는다"를
     * 묻는 것이다.** 지키려는 계약이 그것이기 때문이다 — `dropdown-commit`이 애니메이션하는
     * 것은 `color`뿐이고, 상속이 끊기는 것도 그 속성을 자식이 선언할 때뿐이다.
     * `background`·`border-color` 같은 다른 색 선언은 상속 경로에 아무 영향이 없으므로
     * 일부러 통과시킨다(활성 표시가 바로 그 `background`다).
     */
    function declaresColor(body: string) {
      return /(^|[\s;])color\s*:/.test(body);
    }

    // 말줄임을 선언하는 규칙이 **정확히 하나**이고 그것이 자식 결합자 형태인지 본다.
    // 자손 선택자 규칙을 하나 더 얹으면 목록이 둘이 되어 곧바로 터진다 — 지우는 결함만
    // 잡던 예전 형태가 놓치던 자리다.
    it("말줄임을 선언하는 규칙은 컨테이너를 겨냥한 자식 결합자 하나뿐이다", () => {
      const ellipsis = cssRules(datePickerCssSource).filter((rule) => /text-overflow/.test(rule.body));
      expect(ellipsis.map((rule) => rule.selector)).toEqual([".date-wheel-trigger > span"]);
    });

    // 위 단언은 "말줄임을 거는 규칙이 하나"만 본다. 그 하나가 실제로 세 선언을 다 갖는지는
    // 따로 봐야 한다 — `overflow: hidden`이 빠지면 `text-overflow`는 아무 일도 안 한다.
    it("그 규칙이 말줄임에 필요한 세 선언을 다 갖는다", () => {
      const rule = cssRules(datePickerCssSource).find((candidate) => candidate.selector === ".date-wheel-trigger > span");
      expect(rule?.body ?? "(자식 결합자 규칙이 없다)").toMatch(/overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap/);
    });

    // `tabular-nums`는 **숫자끼리** 폭을 맞춘다(빈 자리는 DATE_WHEEL_FILL이 맡는다 — 아래
    // 버퍼 테스트들이 그쪽을 고정한다). 선언을 지우는 결함뿐 아니라 **더 특이한 규칙에서
    // `normal`로 되돌리는 결함**까지 잡아야 한다: 활성 세그먼트 규칙이 (0,4,0)이라
    // (0,1,0)인 기본 규칙을 이기므로, 거기에 한 줄만 얹으면 **치는 중인 세그먼트만**
    // tabular를 잃는다. 그래서 이 선언을 하는 규칙 전부를 값까지 함께 신원으로 본다.
    it("font-variant-numeric을 선언하는 규칙은 세그먼트 기본 규칙 하나뿐이고 값이 tabular-nums다", () => {
      const declared = cssRules(datePickerCssSource)
        .filter((rule) => /font-variant-numeric/.test(rule.body))
        .map((rule) => [rule.selector, /font-variant-numeric:\s*([^;]+)/.exec(rule.body)?.[1].trim()]);
      expect(declared).toEqual([[".date-wheel-segment", "tabular-nums"]]);
    });

    // 포커스 없는 필드에 활성 표시가 남으면 그 필드가 입력을 받는 중으로 읽힌다(§4.5).
    //
    // ⚠️ **이 테스트가 묻는 것이 바뀌었다. 지키려는 계약은 그대로다.**
    // 예전에는 "`.date-wheel-segment.active`에 매칭되는 규칙이 통틀어 하나"였다. 반전 칩이
    // 들어오면서 그 세그먼트를 겨냥하는 규칙이 하나 더 생겼는데(확정 펄스를 명시로 거는
    // 규칙), **그것은 정지 상태의 그림을 그리지 않는다** — `animation` 하나만 선언한다.
    // 지키려던 것은 규칙 개수가 아니라 **"활성 표시를 그리는 자리가 하나이고 그것이 포커스로
    // 게이트돼 있다"**였으므로, 이제 `background`를 선언하는 규칙으로 좁혀 같은 것을 묻는다.
    // 스펙 §4.5가 이름 대고 금지한 `.date-wheel-picker.open …` 보정은 별도 규칙으로 오든
    // 같은 규칙의 선택자 목록에 끼어 오든 여전히 둘 다 터진다.
    it("활성 세그먼트의 정지 그림을 그리는 규칙은 포커스로 게이트된 하나뿐이다", () => {
      const painting = cssRules(datePickerCssSource)
        .filter((rule) => /\.date-wheel-segment\.active/.test(rule.selector) && /(^|[\s;])background\s*:/.test(rule.body));
      expect(painting.map((rule) => rule.selector)).toEqual([".date-wheel-trigger.editing:focus-within .date-wheel-segment.active"]);
    });

    /** 토큰 블록 하나에서 커스텀 프로퍼티 값을 읽는다. 블록 안에 중첩 규칙이 없다는 전제. */
    function tokenIn(block: string, name: string) {
      const start = tokensCssSource.indexOf(block);
      if (start < 0) return null;
      const body = tokensCssSource.slice(start, tokensCssSource.indexOf("}", start));
      return new RegExp(`${name}:\\s*([^;]+)`).exec(body)?.[1].trim() ?? null;
    }
    /**
     * 선언은 `:root` 한 곳이지만 값이 `var(--text)`처럼 **테마 토큰을 참조**하므로, 실제 색을
     * 보려면 참조를 그 테마 블록에서 한 겹 풀어야 한다. 반전 칩이 두 테마에서 저절로 맞는
     * 이유가 이 참조이고, 그래서 대비를 재려면 여기를 지나야 한다.
     */
    function resolved(block: string, name: string) {
      const raw = tokenIn(":root {", name);
      const reference = /var\((--[\w-]+)\)/.exec(raw ?? "")?.[1];
      return reference ? tokenIn(block, reference) ?? tokenIn(":root {", reference) : raw;
    }
    /** WCAG 2.x 상대 휘도 대비. 알파 없는 hex만 받는다. */
    function contrast(a: string, b: string) {
      const luminance = (hex: string) => {
        const channels = [1, 3, 5]
          .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
          .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    }

    // ── 반전 칩과 확정 펄스 ─────────────────────────────────────────────────
    //
    // 확정 피드백(css/surfaces.css의 `dropdown-commit`)은 **컨테이너의 `color`를**
    // 애니메이션하고, 세그먼트는 그것을 **상속**받아 함께 반짝인다. 세그먼트가 자기
    // `color`를 선언하면 그 상속이 끊겨 그 세그먼트만 신호에서 빠진다.
    //
    // ⚠️ **계약이 두 번 바뀌었다.** 처음엔 "세그먼트는 `color`를 선언하지 않는다"였고(상속이
    // 끊기므로), 반전 칩이 들어오면서 "선언하려면 펄스를 명시로 함께 받아라"가 됐다. 지금은
    // 표시 게이트가 **편집 중**으로 바뀌면서(스펙 §4.5) **칩과 펄스가 겹칠 수가 없어졌다** —
    // 확정하며 닫는 것이 곧 편집의 끝이라, 펄스가 재생되는 순간 칩은 이미 없다.
    //
    // 그래서 명시 펄스 규칙을 지웠고, 계약은 이렇게 남는다: **`color`를 선언하는 규칙은
    // 편집 중으로 게이트된 그 자리 하나뿐이고, 그 자리는 펄스와 겹치지 않는다.** 겹치지
    // 않는다는 것은 소스로 알 수 없으므로 이 블록 바깥의 DOM 테스트가 진다.
    it("세그먼트에 닿는 규칙 둘 중 color를 선언하는 것은 편집 중으로 게이트된 활성 규칙뿐이다", () => {
      const targeted = cssRules(datePickerCssSource).filter((rule) => /\.date-wheel-(segment|punctuation)/.test(rule.selector));
      expect(targeted.map((rule) => [rule.selector, declaresColor(rule.body)])).toEqual([
        [".date-wheel-segment", false],
        [".date-wheel-trigger.editing:focus-within .date-wheel-segment.active", true],
      ]);
    });

    // 지운 것이 되살아나지 않게 못 박는다 — 세그먼트를 겨냥한 `animation` 규칙은 없어야 한다.
    // 되살리려면 먼저 "칩과 펄스가 겹치는가"를 다시 재야 하고, 겹치지 않는 한 그 규칙은
    // 확정과 무관하게 계속 매칭돼 활성 세그먼트가 옮겨질 때마다 accent를 번쩍이게 한다.
    it("세그먼트 전용 확정 펄스 규칙은 없다", () => {
      const animated = cssRules(datePickerCssSource)
        .filter((rule) => /\.date-wheel-segment/.test(rule.selector) && /(^|[\s;])animation/.test(rule.body));
      expect(animated.map((rule) => rule.selector)).toEqual([]);
    });

    // ── 반전 칩의 값 ────────────────────────────────────────────────────────
    //
    // 값이 **규칙이 아니라 토큰에** 있어야 하는 이유는 위 계약과 같은 뿌리다. 테마별로 다른
    // 값을 규칙에 박으면 세그먼트에 매칭되는 규칙이 늘어 위 둘이 함께 깨진다.
    //
    // **그리고 값 자체가 계약이다.** 오너가 실기기에서 세 번 되돌려 보냈다:
    //   accent 20%   라이트 글자/필드 10.35 / 1.32 · 다크 – / 1.20   "어느 세그먼트인지 모르겠다"
    //   accent 55%   라이트 5.91 / 2.31 · 다크 7.63 / 1.75           "글씨가 검정이라 안 보인다"
    //   중성 칩      라이트 5.54 / 2.47 · 다크 5.89 / 2.26           "선택 글씨를 반전시켜 달라"
    //   반전(지금)   라이트 13.66 / 13.66 · 다크 13.33 / 13.33
    // 바닥은 글자 4.5(WCAG AA)와 필드 2.0이고, 2.0은 **알려진 실패값(다크 1.75) 바로 위**다.
    //
    // ⚠️ 반전에서는 글자색 = 필드색이므로 **두 대비가 같은 수가 된다.** 그래도 둘 다 두는
    // 이유는 서로 다른 요구이기 때문이다 — 하나는 "칩 위 글자가 읽히는가", 다른 하나는
    // "칩이 필드에서 도드라지는가"다. 반전을 그만두는 순간 두 수는 갈라진다.
    it("활성 세그먼트의 배경과 글자색은 값을 박지 않고 토큰을 참조한다", () => {
      const rule = cssRules(datePickerCssSource).find((candidate) => candidate.selector === ".date-wheel-trigger.editing:focus-within .date-wheel-segment.active");
      expect([
        /(^|[\s;])background:\s*([^;]+)/.exec(rule?.body ?? "")?.[2].trim() ?? null,
        /(^|[\s;])color:\s*([^;]+)/.exec(rule?.body ?? "")?.[2].trim() ?? null,
      ]).toEqual(["var(--date-segment-active-background)", "var(--date-segment-active-text)"]);
    });

    // **두 토큰은 `:root` 한 곳에만 있다.** 테마 블록마다 복사하지 않는 이유는 값이
    // `var(--text)`·`var(--input)`이기 때문이다 — 그 둘이 이미 테마별로 재정의되므로 선언
    // 하나가 두 테마에서 저절로 맞고, **복사본이 없으니 갈라질 수도 없다.** 반전이란
    // "칩은 글자색, 글자는 필드색"이고 그 문장이 그대로 값이다.
    it("두 토큰은 :root 한 곳에서 테마 토큰을 참조한다", () => {
      expect([
        tokenIn(":root {", "--date-segment-active-background"),
        tokenIn(":root {", "--date-segment-active-text"),
      ]).toEqual(["var(--text)", "var(--input)"]);
    });

    // 테마와 축을 **전부 따로** 본다. `expect()`가 단락하므로 묶으면 앞이 터질 때 뒤가
    // 실행조차 되지 않고, 어느 테마의 어느 축이 무너졌는지가 실패 메시지에 남아야 한다.
    it("라이트에서 칩 위 글자는 AA를 넘는다", () => {
      expect(contrast(resolved(":root {", "--date-segment-active-background")!, resolved(":root {", "--date-segment-active-text")!)).toBeGreaterThanOrEqual(4.5);
    });

    it("라이트에서 칩은 필드와 갈라진다", () => {
      expect(contrast(resolved(":root {", "--date-segment-active-background")!, tokenIn(":root {", "--input")!)).toBeGreaterThanOrEqual(2);
    });

    it("다크에서 칩 위 글자는 AA를 넘는다", () => {
      const dark = '[data-theme="dark"] {';
      expect(contrast(resolved(dark, "--date-segment-active-background")!, resolved(dark, "--date-segment-active-text")!)).toBeGreaterThanOrEqual(4.5);
    });

    it("다크에서 칩은 필드와 갈라진다", () => {
      const dark = '[data-theme="dark"] {';
      expect(contrast(resolved(dark, "--date-segment-active-background")!, tokenIn(dark, "--input")!)).toBeGreaterThanOrEqual(2);
    });
  });
});

// PRINCIPLES §11 — **보이는 머리말과 접근성 이름은 갈라놓을 수 있다.** 292px 머리말에는
// `"날짜"`가 맞고 이름으로는 `"거래 발생 날짜"`가 맞는데, `ariaLabel` 하나가 둘 다이면
// 한쪽을 맞추는 순간 다른 쪽이 망가진다. `heading`이 그 자리이고, 기본값이 `ariaLabel`이라
// 안 넘기면 지금까지와 동일하다.
//
// ⚠️ **`it`을 나눈 이유:** 머리말·팝오버 이름·트리거 이름은 전부 같은 한 값에서 갈라져 나온
// 것이라, 한 블록에 모으면 `heading`이 이름 쪽으로 새는 순간 첫 단정이 터지고 **나머지는
// 실행조차 안 된다** — 정확히 이 저장소가 일곱 번 밟은 자리다.
describe("DateWheelPicker heading — 보이는 머리말과 접근성 이름을 가른다", () => {
  function openWithHeading(heading?: string) {
    render(<DateWheelPicker ariaLabel="거래 발생 날짜" heading={heading} value="2026-07-12" onChange={() => undefined} />);
    const field = fieldOf("거래 발생 날짜");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    return field;
  }
  const headingText = () => document.querySelector<HTMLElement>(".date-wheel-heading strong")!.textContent;

  // 뮤테이션: `heading ?? ariaLabel`을 `ariaLabel`로 되돌리면 `"거래 발생 날짜"`가 나온다.
  it("heading을 넘기면 팝오버 머리말에 그 글자가 보인다", async () => {
    openWithHeading("날짜");
    await screen.findByRole("dialog", { name: "거래 발생 날짜 선택" });

    expect(headingText()).toBe("날짜");
  });

  // 뮤테이션: 팝오버의 `aria-label`을 `heading ?? ariaLabel`로 바꾸면 `"날짜 선택"`이 되어
  // 이 findByRole이 못 찾고 터진다.
  it("heading을 넘겨도 팝오버의 접근성 이름은 ariaLabel이 정한다", async () => {
    openWithHeading("날짜");

    expect(await screen.findByRole("dialog", { name: "거래 발생 날짜 선택" })).toBeTruthy();
  });

  // 트리거 이름은 `${ariaLabel}, ${값}`이다(§11). 뮤테이션: `triggerName`을 `heading`에서
  // 만들게 하면 `"날짜, 2026. 07. 12."`가 되어 빨개진다.
  it("heading을 넘겨도 트리거의 접근성 이름은 ariaLabel이 정한다", async () => {
    const field = openWithHeading("날짜");
    await screen.findByRole("dialog", { name: "거래 발생 날짜 선택" });

    expect(field.getAttribute("aria-label")).toBe("거래 발생 날짜, 2026. 07. 12.");
  });

  // **대조군 — 안 넘기면 지금까지와 같다.** 고침 전에도 초록이므로 결함의 증거가 아니고,
  // 잡는 것은 `heading ?? ariaLabel`이 `heading`으로 무너져 머리말이 비는 것이다.
  it("heading을 안 넘기면 머리말은 ariaLabel 그대로다", async () => {
    openWithHeading();
    await screen.findByRole("dialog", { name: "거래 발생 날짜 선택" });

    expect(headingText()).toBe("거래 발생 날짜");
  });
});

// ════════════════════════════════════════════════════════════════════════
// Task 3 (2b-3) — 시각 단위를 실제로 받는다. 모델(parseValue/serializeValue/
// familyOf/isContiguous/unitCeiling/comparisonPrecision/outOfRange/
// clampToRange)은 2a·2b-2가 이미 준비해 두었다 — 여기서는 컴포넌트가 그것을
// 실제로 쓰게 만든다. 다섯 항목을 브리프 순서대로 고정한다.
// ════════════════════════════════════════════════════════════════════════

// ── 항목 5 — fields가 연속 구간이 아니면 개발 모드에서 경고한다(설계 스펙 §4) ──
//
// 완전히 독립적이라 가장 먼저 고정한다 — isContiguous 자체는 2a-1부터 이미
// 모델에 있고(tests/instantModel.test.ts), 여기서 처음으로 컴포넌트가 그것을
// 실제로 부른다.
describe("DateWheelPicker fields 연속성 — 개발 모드 경고 (Task 3 항목 5)", () => {
  it("연속 구간이 아닌 fields를 주면 console.warn이 불린다", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // year > month > day > hour > minute > second 사다리에서 year와 hour
    // 사이를 건너뛴 조합 — isContiguous(["year","hour"])는 false다.
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" fields={["year", "hour"] as WheelUnit[]} onChange={() => undefined} />);

    expect(warnSpy).toHaveBeenCalled();
  });

  // 전체 브랜치 리뷰 F-4 — 가드가 없으면 이 컴포넌트의 렌더 성격상(조작 하나마다
  // onChange로 리렌더, StrictMode 이중 렌더) 같은 경고가 매번 반복된다. 같은
  // fields로 여러 번 리렌더해도 한 번만 나가는지, 그리고 fields가 "다른" 깨진
  // 값으로 바뀌면 그때는 다시 나가는지(전부 조용해지는 결함을 막기 위해) 둘 다 본다.
  it("같은 fields로 여러 번 리렌더해도 경고는 한 번만, 다른 깨진 fields로 바뀌면 다시 나간다", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { rerender } = render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" fields={["year", "hour"] as WheelUnit[]} onChange={() => undefined} />);
    rerender(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" fields={["year", "hour"] as WheelUnit[]} onChange={() => undefined} />);
    rerender(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-13" fields={["year", "hour"] as WheelUnit[]} onChange={() => undefined} />);

    expect(warnSpy).toHaveBeenCalledTimes(1);

    // fields 시그니처 자체가 바뀌면(다른 종류의 깨진 조합) 새로 경고한다 — "한 번
    // 경고했으면 이 인스턴스는 영원히 조용하다"가 아니라 "같은 시그니처는 한 번"이다.
    rerender(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-13" fields={["month", "second"] as WheelUnit[]} onChange={() => undefined} />);

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  // 대조군 — 기본 fields(연·월·일)는 사다리에서 잘라낸 연속 구간이므로 경고가 없다.
  // 이게 없으면 위 검사가 "매 렌더 무조건 경고한다"는 결함을 못 잡는다.
  it("기본 fields(연·월·일)는 연속 구간이므로 경고하지 않는다 — 대조군", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-12" onChange={() => undefined} />);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ── 항목 1·2 — 값 형식은 fields(계열)를 따르고, 트리거 조각이 시각 구분자를
//    안다(설계 스펙 §5·§10) ──────────────────────────────────────────────
//
// 이 블록은 **팝오버를 열지 않는다** — 트리거는 `value`가 이미 유효하면
// `model.isValid`/`model.triggerParts`만으로 그려지고 `model.shift`·
// `model.label`·`model.now`는 건드리지 않는다(baseValue 계산의 삼항이 유효한
// value 쪽에서 단락한다). 그래서 항목 3(열 라벨)·4(now)보다 먼저, 독립적으로
// 고정할 수 있다.
describe("DateWheelPicker 값 형식은 fields를 따른다 — 트리거 조각 (Task 3 항목 1·2)", () => {
  it("기본 fields(연·월·일)에서는 YYYY-MM-DD 그대로다 — 대조군", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-08-12" onChange={() => undefined} />);
    expect(fieldOf("거래 날짜").textContent).toBe("2026. 08. 12.");
  });

  it("시각 전용 값은 ':'로만 잇고 날짜 부분이 없다", () => {
    render(<DateWheelPicker ariaLabel="출근 시각" value="03:00:05" fields={["hour", "minute", "second"] as WheelUnit[]} onChange={() => undefined} />);
    expect(fieldOf("출근 시각").textContent).toBe("03:00:05");
  });

  it("날짜+시각 값은 날짜엔 '. ', 시각엔 ':', 사이는 공백 하나로 잇는다", () => {
    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T03:00:05" fields={["year", "month", "day", "hour", "minute", "second"] as WheelUnit[]} onChange={() => undefined} />);
    expect(fieldOf("거래 시각").textContent).toBe("2026. 08. 12. 03:00:05");
  });

  it("초 없는 fields면 값도 분까지다 — HH:MM", () => {
    render(<DateWheelPicker ariaLabel="출근 시각" value="03:00" fields={["hour", "minute"] as WheelUnit[]} onChange={() => undefined} />);
    expect(fieldOf("출근 시각").textContent).toBe("03:00");
  });

  // 자리 지키기(U+2012)는 시각 세그먼트에도 그대로 적용된다 — 시 소로플로어가
  // 3이므로("2"는 아직 확정되지 않는다) 버퍼가 살아 있는 채로 렌더된다.
  it("자리 지키기(U+2012)는 시각 세그먼트에도 그대로다", () => {
    render(<DateWheelPicker ariaLabel="출근 시각" value="03:00" fields={["hour", "minute"] as WheelUnit[]} onChange={() => undefined} />);
    const field = fieldOf("출근 시각");
    field.focus();
    fireEvent.keyDown(field, { key: "2" });   // hour soloFloor=3이라 "2"는 확정되지 않고 버퍼로 남는다
    expect(field.textContent).toBe(`2${FILL}:00`);
  });

  // 전체 브랜치 리뷰 F-1 — model.setUnit(=withUnitValue)의 시·분·초 분기가
  // 스위트 전체에서 한 번도 실행되지 않았다. U+2012 검사는 시 소로플로어가
  // 3이라 버퍼에서 안 나가고(위 테스트), 23→0 검사는 ± 버튼이라 shiftDateValue
  // 경로이며, tsc 전용 스텁(`_2b1JsxContextTypingOnly`)은 렌더되지 않는다.
  // 여기서 분 열에 완결되는 두 자리("1"→"5")를 쳐서 typeDigit이 즉시 확정하고
  // commitTyped → model.setUnit(baseValue, "minute", 15, fields)가 실제로
  // 불리는 경로를 고정한다.
  it("분 열에 숫자 두 자리를 완결해 치면 setUnit(withUnitValue)의 시각 분기가 실행된다", () => {
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="출근 시각" value="03:00" fields={["hour", "minute"] as WheelUnit[]} onChange={onChange} />);
    const field = fieldOf("출근 시각");
    field.focus();
    fireEvent.keyDown(field, { key: "ArrowRight" });   // 활성을 시 → 분으로
    fireEvent.keyDown(field, { key: "1" });             // minute soloFloor=6이라 "1"은 아직 확정 안 됨(버퍼)
    fireEvent.keyDown(field, { key: "5" });             // "15" 완결 → 즉시 확정

    expect(onChange).toHaveBeenCalledWith("03:15");
  });
});

// ── 항목 3 — 열 라벨: 시·분·초는 두 자리 숫자만(일 열의 요일 같은 부가 표시
//    없음), DEFAULT_DATE_WHEEL_LABELS.units의 hour/minute/second 채움 ──────
//
// 이 블록은 팝오버를 연다 — 열 렌더는 `model.label`(dateWheelLabel)과
// `shifted()`(model.shift/model.isValid)를 실제로 거치므로 그 둘의 시·분·초
// 지원이 이 블록의 전제다.
describe("DateWheelPicker 열 라벨 — 시·분·초는 두 자리 숫자만 (Task 3 항목 3)", () => {
  it("시·분·초 열의 aria-label과 선택된 행이 두 자리 숫자다", () => {
    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T03:00:05" fields={["year", "month", "day", "hour", "minute", "second"] as WheelUnit[]} onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 시각"));

    const hour = screen.getByRole("group", { name: "시 03" });
    const minute = screen.getByRole("group", { name: "분 00" });
    const second = screen.getByRole("group", { name: "초 05" });
    expect(hour.querySelector(".date-wheel-values button.selected")?.textContent).toBe("03");
    expect(minute.querySelector(".date-wheel-values button.selected")?.textContent).toBe("00");
    expect(second.querySelector(".date-wheel-values button.selected")?.textContent).toBe("05");
  });

  // 대조군 — 일 열은 여전히 요일이 붙는다. 시·분·초만 "두 자리만"이지 날짜
  // 열의 계약을 건드리지 않는다.
  it("일 열은 여전히 요일이 붙는다 — 대조군", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-08-12" onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 날짜"));

    expect(screen.getByRole("group", { name: "일 12 수" })).toBeTruthy();
  });

  // ± 버튼으로 시 열을 옮기면(23→0 순환) 자리올림 없이 그 열 안에서만 돈다 —
  // 월·일이 이미 하던 "자리올림 없음" 규칙이 시·분·초로도 확장된다는 증거.
  //
  // onChange 값만 보면 공허할 수 있다(이 계열에서 이미 겪었다 — 값은 맞는데
  // 모션이 죽어 있던 자리) — 그래서 휠 슬라이드 클래스(moving-*)도 같이 본다.
  it("시 열은 23에서 다음으로 가면 0으로 순환하고 날짜는 그대로다 — 값과 휠 모션 둘 다", () => {
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T23:30" fields={["year", "month", "day", "hour", "minute"] as WheelUnit[]} onChange={onChange} />);
    fireEvent.click(fieldOf("거래 시각"));
    const hourButton = screen.getByRole("button", { name: "시 다음" });
    const hourColumn = hourButton.closest(".date-wheel-column");

    fireEvent.click(hourButton);

    expect(onChange).toHaveBeenCalledWith("2026-08-12T00:30");
    expect(hourColumn?.classList.contains("moving-next")).toBe(true);
  });
});

// ── 항목 4 — model.now가 시각까지(설계 스펙 §9), "지금" 버튼 ────────────────
describe("DateWheelPicker '지금' — 시간 열이 있으면 오늘 버튼이 지금이 된다 (Task 3 항목 4)", () => {
  it("시간 열이 있으면 버튼 라벨이 '지금'이다", () => {
    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T03:00:05" fields={["year", "month", "day", "hour", "minute", "second"] as WheelUnit[]} onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 시각"));

    expect(screen.getByRole("button", { name: "지금" })).toBeTruthy();
  });

  // 대조군 — 시간 열이 없으면 여전히 "오늘"이다.
  it("시간 열이 없으면 여전히 '오늘'이다 — 대조군", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-08-12" onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 날짜"));

    expect(screen.getByRole("button", { name: "오늘" })).toBeTruthy();
  });

  // sv-SE 함정(스펙 §9) — Intl.DateTimeFormat("sv-SE")에 시간을 붙이면 구분자가
  // T가 아니라 공백이 된다. formatToParts로 조각을 뽑아 조립하면 이 문제가
  // 애초에 생기지 않는다 — 그 증거로 초 단위까지 정확한 문자열이 onChange로
  // 나가는 것을 본다(공백이 섞이면 이 값 자체가 다른 문자열이 된다).
  it("지금 버튼은 sv-SE 공백 함정 없이 초 단위까지 조립한다", () => {
    vi.useFakeTimers();
    /* ⚠️ **`new Date(2026, 7, 12, 3, 0, 5)`로 쓰면 안 됩니다** — 그 생성자는 **머신의 로컬
     * 타임존**을 씁니다. 개발 머신(Asia/Seoul)에서는 03:00:05 KST지만 **CI(UTC)에서는
     * 03:00:05 UTC = 12:00:05 KST**가 되어 `T12:00:05`를 받습니다. 실제로 CI가 이걸로
     * 빨개졌습니다(Node 18·19 양쪽, 로컬은 초록).
     *
     * 이 파일의 옛 검사들이 `new Date(2026, 6, 12, 12)`처럼 **정오**를 쓰는 것은 우연이
     * 아닙니다 — 정오는 ±9시간을 움직여도 **날짜가 안 바뀌고**, 그것들은 **날짜만**
     * 단언합니다. 이 검사는 **초까지** 단언하므로 그 안전장치 밖입니다.
     * 시각을 단언하는 검사는 순간을 **UTC로 못박으세요.** */
    vi.setSystemTime(new Date("2026-08-11T18:00:05Z"));   // = Asia/Seoul 2026-08-12 03:00:05
    const onChange = vi.fn();
    render(<DateWheelPicker ariaLabel="거래 시각" value="" fields={["year", "month", "day", "hour", "minute", "second"] as WheelUnit[]} onChange={onChange} />);
    fireEvent.click(fieldOf("거래 시각"));

    fireEvent.click(screen.getByRole("button", { name: "지금" }));

    expect(onChange).toHaveBeenCalledWith("2026-08-12T03:00:05");
  });
});

// 전체 브랜치 리뷰 F-4(2b-4) — "지금/오늘"과 hint/hintNow를 가르는 판정이
// `model.family`(모델의 `familyOf`)를 실제로 지나는지, 손으로 다시 짠 단위
// 이름 나열로 되돌아가지 않았는지 스파이로 고정한다. 위 세 테스트는 "지금이
// 나온다"만 보므로, 그 판정을 기계가 다시 로컬로 손으로 짜도 여전히 통과한다
// — 이 테스트만 "**모델을 실제로 거쳤는가**"를 본다(:197의 `instantModel.now`
// 스파이와 같은 idiom).
describe("DateWheelPicker '지금'/hintNow 판정은 model.family를 거친다 (전체 브랜치 리뷰 F-4)", () => {
  it("시간 열이 있는 fields로 렌더하면 model.family(fields)가 실제로 불린다", () => {
    const familySpy = vi.spyOn(instantModel, "family");
    const fields: WheelUnit[] = ["year", "month", "day", "hour", "minute", "second"];

    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T03:00:05" fields={fields} onChange={() => undefined} />);

    expect(familySpy).toHaveBeenCalledWith(fields);
    familySpy.mockRestore();
  });

  // familySpy가 "datetime"이 아닌 값을 돌려주면(예: 모델이 시각 열도 "date"로
  // 오판) 버튼이 지금이 아니라 오늘로 나와야 한다 — 판정이 실제로 반환값을
  // 쓰고 있는지(호출만 하고 무시하지 않는지)까지 본다.
  it("model.family가 \"date\"를 돌려주면 시간 열이 있어도 버튼은 여전히 '오늘'이다", () => {
    const familySpy = vi.spyOn(instantModel, "family").mockReturnValue("date");
    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T03:00:05" fields={["year", "month", "day", "hour", "minute", "second"] as WheelUnit[]} onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 시각"));

    expect(screen.getByRole("button", { name: "오늘" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "지금" })).toBeNull();
    familySpy.mockRestore();
  });
});

// 2b-1 — 타입을 컴포넌트까지 넓힌다(동작 변화 0). 이 블록은 vitest가 아니라
// `npx tsc --noEmit`이 판정합니다.
//
// ⚠️ 브리프 Step 1이 제안한 `const fields = ["hour","minute"] as const; expect(fields.length)
// .toBe(2)` 형태는 여기 안 넣었습니다 — 실제 `DateWheelPickerProps.fields`(WheelUnit[])와
// 연결되지 않은 독립 배열이라 넓히기 전에도 컴파일되고 vitest도 항상 초록입니다.
//
// ⚠️ 렌더 기반 검사(`it(...)`로 `<DateWheelPicker fields={["hour","minute"]}>`를 실제로
// 마운트하는 버전)도 뺐습니다 — 팝오버를 안 열면 이번에 넓힌 코드 경로(`columns.map`·
// `labels.units[unit]`·`columnMotion[unit]`)를 하나도 안 밟아서, vitest 기준으로는
// 넓히기 전에도 초록이었을 검사였습니다(코디네이터 F-2). 이 태스크의 산출물은 **타입**이고
// 시각 열의 **렌더**는 2b-3의 몫이라 런타임으로는 증명할 방법이 없습니다.
//
// 그래서 아래는 `it()`/`describe()` 없이 모듈 스코프에 그대로 둡니다 — vitest는 이걸
// "테스트"로 세지 않고(그래서 `npx vitest run` 총 개수는 917 그대로입니다) 타입이
// 좁아지거나 넓어지면 `tsc`만 빨개집니다. 두 방향 다 실측으로 확인했습니다(RED 두 번,
// 보고서 참고): (1) `WheelUnit`을 3단위로 좁혔더니 첫 줄에서 `Type '"hour"' is not
// assignable`, (2) `WheelUnit`을 `string`으로 넓혔더니 `@ts-expect-error` 줄에서
// `Unused '@ts-expect-error' directive`.
const _2b1TimeFields: WheelUnit[] = ["hour", "minute"];        // 3단위로 되돌아가면 tsc가 잡습니다
void _2b1TimeFields;
// @ts-expect-error — 사다리에 없는 단위는 여전히 거절돼야 합니다
const _2b1Bogus: WheelUnit[] = ["fortnight"];
void _2b1Bogus;

// JSX 문맥 타이핑도 같은 이유로 여기서 타입만 확인합니다(렌더하지 않습니다) — WheelUnit을
// import하지 않고 리터럴만 JSX에 그대로 넘겨도 통과합니다. 함수는 정의만 되고 절대
// 호출되지 않으므로 런타임 비용도, 팝오버를 열지 않고 넘어가는 데서 오는 위 F-2의 함정도
// 없습니다.
function _2b1JsxContextTypingOnly() {
  return <DateWheelPicker ariaLabel="문맥 타이핑 확인" value="2026-07-12" onChange={() => undefined} fields={["hour", "minute"]} />;
}
void _2b1JsxContextTypingOnly;

// ════════════════════════════════════════════════════════════════════════
// 2b-4 — 열 폭과 데모. Task 3(2b-3)가 시·분·초를 실제로 그리게 만들었는데
// css/date-picker.css의 `data-fields` 그리드 규칙은 1·2만 있었다(3은 기본).
// 6열 픽커를 열면 기본 3열 규칙이 그대로 걸려 마지막 세 열이 다음 줄로 밀린다.
// ════════════════════════════════════════════════════════════════════════

// jsdom은 캐스케이드를 계산하지 않으므로 소스 텍스트에서 규칙을 파싱한다 — 이 파일의
// "CSS 계약" idiom과 같다(:4333의 cssRules와 같은 이유로 별도 헬퍼를 둔다 — 그쪽은
// 세그먼트 규칙 describe에 지역 스코프라 여기서 재사용할 수 없다).
describe("DateWheelPicker data-fields 그리드 — 4·5·6열 (2b-4)", () => {
  /**
   * `.date-wheel-columns`(기본 3열)와 `[data-fields="N"]` 오버라이드만 골라
   * `[선택자, grid-template-columns 값]`으로 정리한다.
   *
   * ⚠️ **처음엔 `.exec()`로 "규칙 하나"만 찾았는데, 그건 첫 매치만 본다 —
   * 파일 뒤에 더 구체적이거나 모순되는 규칙이 하나 더 붙어도 못 잡는다.**
   * 실측으로 확인했다: `.date-wheel-columns[data-fields="6"] { grid-template-columns:
   * repeat(3, …); }`를 파일 끝에 추가해도 그 버전은 초록이었다 — 이 파일 :4306
   * 주석이 이름 댄 함정("규칙을 *덧붙이는* 결함은 안 잡힌다") 그대로였다. 그래서
   * `matchAll`로 **전체 목록**을 모아 `toEqual`로 소진 비교한다 — 모순되는 규칙이
   * 하나 더 붙으면 목록 길이 자체가 달라져 시끄럽게 터진다.
   */
  function columnsGridRules() {
    return [...datePickerCssSource.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((match) => ({ selector: match[1].replace(/\s+/g, " ").trim(), body: match[2] }))
      .filter((rule) => /^\.date-wheel-columns(\[data-fields="\d"\])?$/.test(rule.selector))
      .map((rule) => [rule.selector, /grid-template-columns:\s*([^;]+)/.exec(rule.body)?.[1].trim() ?? null]);
  }

  // 기본 3열 + 기존 1·2 + 신규 4·5·6, 파일에 나온 순서 그대로 소진 비교한다.
  // "규칙이 있다"만 보면 `grid-template-columns: none`처럼 열 수와 무관한 값을
  // 넣어도, 또는 뒤에 모순되는 규칙이 하나 더 붙어도 통과하는 공허 검사가 된다
  // (둘 다 이 파일 :4306 주석이 이름 댄 함정과 같은 종류) — 값과 전체 목록 길이를
  // 함께 고정해 둘 다 막는다.
  it("data-fields 그리드 규칙 전체가 정확히 이 목록이다 — 기본 3열 + 1·2(기존) + 4·5·6(2b-4)", () => {
    expect(columnsGridRules()).toEqual([
      [".date-wheel-columns", "repeat(3, minmax(0, 1fr))"],
      [".date-wheel-columns[data-fields=\"2\"]", "repeat(2, minmax(0, 1fr))"],
      [".date-wheel-columns[data-fields=\"1\"]", "minmax(0, 1fr)"],
      [".date-wheel-columns[data-fields=\"4\"]", "repeat(4, minmax(0, 1fr))"],
      [".date-wheel-columns[data-fields=\"5\"]", "repeat(5, minmax(0, 1fr))"],
      [".date-wheel-columns[data-fields=\"6\"]", "repeat(6, minmax(0, 1fr))"],
    ]);
  });

  // CSS 규칙이 매칭할 실제 DOM이 존재하는지 — data-fields 속성 자체는 `columns.length`를
  // 그대로 반영하므로(컴포넌트 쪽은 이미 동작한다) 6열이 실제로 "6"을 그리는지만 고정한다.
  it("연·월·일·시·분·초 6열이 팝오버에 data-fields=\"6\"으로 그려진다", () => {
    render(<DateWheelPicker ariaLabel="예약 시각" value="2026-07-12T18:30:05" fields={["year", "month", "day", "hour", "minute", "second"]} onChange={() => undefined} />);
    fireEvent.click(fieldOf("예약 시각"));
    const columns = screen.getByRole("dialog", { name: "예약 시각 선택" }).querySelector(".date-wheel-columns");
    expect(columns?.getAttribute("data-fields")).toBe("6");
  });

  it("날짜+시각 5열이 팝오버에 data-fields=\"5\"로 그려진다", () => {
    render(<DateWheelPicker ariaLabel="약속 시각" value="2026-07-12T18:30" fields={["year", "month", "day", "hour", "minute"]} onChange={() => undefined} />);
    fireEvent.click(fieldOf("약속 시각"));
    const columns = screen.getByRole("dialog", { name: "약속 시각 선택" }).querySelector(".date-wheel-columns");
    expect(columns?.getAttribute("data-fields")).toBe("5");
  });
});

// ── labels.hint가 "지금"과 안 맞는 문제 — Task 3(2b-3)에서 넘어온 결함 ──────────
//
// "오늘/지금" 버튼은 이미 fields에 시각 단위가 있으면 "지금"으로 바뀐다(위 "'지금'"
// describe, Task 3 항목 4). 그런데 팝오버 머리말의 안내 문구(`labels.hint`)는
// 그대로 "…Ctrl+; 오늘"이었다 — 버튼과 안내가 서로 다른 말을 한다.
//
// ⚠️ **`now`가 필수 필드로 들어가면서 전체 객체를 만들던 소비자의 컴파일이
// 깨졌다(이미 일어난 일 — DEFAULT_DATE_WHEEL_LABELS 자신이 `DateWheelLabels`로
// 타입된 "전체 객체"이고, `now`를 안 채우면 그 자리에서 tsc가 거절한다).
// `hintNow`는 같은 실수를 반복하지 않는다 — **선택 필드**로 둔다.** 이유: `now`처럼
// 필수로 두면 이미 어딘가(이 킷 안팎에서) `DateWheelLabels`로 완전히 타입된 라벨
// 상수를 만든 모든 소비자가 `hintNow` 없이는 컴파일이 깨진다. `labels` prop 자체는
// `Partial<DateWheelLabels>`라 부분 override는 원래도 영향이 없지만, "완전한 타입의
// 상수"를 만드는 소비자(DEFAULT_DATE_WHEEL_LABELS가 바로 그 모양)는 영향을 받는다 —
// 그 자리를 선택으로 열어 둔다.
describe("DateWheelPicker 팝오버 안내 문구 — 시간 열이 있으면 hintNow를 쓴다 (2b-4)", () => {
  function hintText(ariaLabel: string) {
    return screen.getByRole("dialog", { name: `${ariaLabel} 선택` }).querySelector(".date-wheel-heading span")?.textContent ?? null;
  }

  it("시간 열이 있으면 안내 문구가 hintNow다", () => {
    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T03:00:05" fields={["year", "month", "day", "hour", "minute", "second"]} onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 시각"));
    expect(hintText("거래 시각")).toBe(DEFAULT_DATE_WHEEL_LABELS.hintNow);
    // hintNow와 hint가 실제로 다른 문구여야 이 검사가 의미가 있다 — 같으면 hint
    // 그대로 둬도 통과하는 공허 검사가 된다.
    expect(DEFAULT_DATE_WHEEL_LABELS.hintNow).not.toBe(DEFAULT_DATE_WHEEL_LABELS.hint);
  });

  // 대조군 — 시간 열이 없으면 지금까지처럼 hint 그대로다.
  it("시간 열이 없으면 안내 문구는 여전히 hint다 — 대조군", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-08-12" onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 날짜"));
    expect(hintText("거래 날짜")).toBe(DEFAULT_DATE_WHEEL_LABELS.hint);
  });

  // hintNow가 선택 필드라는 계약의 런타임 쪽 절반 — override가 hint만 주고 hintNow를
  // 생략해도(부분 override, 소비자가 늘 하던 방식) 크래시하거나 빈 문구가 되지
  // 않는다. **`today`/`now`와 정확히 같은 비대칭입니다** — `today`만 override하고
  // `now`를 안 주면 시간 열에서 여전히 기본 `now`("지금")가 나오듯, `hint`만
  // override하고 `hintNow`를 안 주면 시간 열에서는 기본 `hintNow`가 그대로 나옵니다
  // (merge가 `{ ...DEFAULT, ...labelOverrides }`라 override가 안 건드린 키는 DEFAULT
  // 값을 그대로 지니기 때문입니다 — override한 `hint`로 "새는" 것이 아닙니다). 타입
  // 쪽 절반은 아래 tsc 전용 블록이 고정합니다.
  it("override가 hint만 주고 hintNow를 생략하면 — now/today와 같은 비대칭으로 — 기본 hintNow가 그대로 쓰인다", () => {
    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T03:00:05" fields={["year", "month", "day", "hour", "minute", "second"]} onChange={() => undefined} labels={{ hint: "커스텀 안내" }} />);
    fireEvent.click(fieldOf("거래 시각"));
    expect(hintText("거래 시각")).toBe(DEFAULT_DATE_WHEEL_LABELS.hintNow);
  });

  // `?? labels.hint`가 죽은 코드가 아님을 증명한다 — 병합 순서상(`{ ...DEFAULT,
  // ...labelOverrides }`) `labels.hintNow`가 실제로 undefined가 되는 유일한 길은
  // override가 그 키를 **명시적으로** undefined로 주는 것뿐이다(`hintNow?: string`이라
  // 타입도 허용한다). 이 경로가 없으면 hintNow를 선택으로 연 의미가 절반만
  // 지켜진다 — 컴파일은 안 깨지지만 런타임에 그 폴백이 한 번도 실행되지 않는다.
  it("hintNow를 명시적으로 undefined로 override하면 hint로 대체된다 — ?? 경로가 실제로 실행된다", () => {
    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T03:00:05" fields={["year", "month", "day", "hour", "minute", "second"]} onChange={() => undefined} labels={{ hint: "커스텀 안내", hintNow: undefined }} />);
    fireEvent.click(fieldOf("거래 시각"));
    expect(hintText("거래 시각")).toBe("커스텀 안내");
  });
});

// 2b-4 — hintNow가 선택 필드로 남아 있는지를 타입 수준에서 고정한다. 위 "2b-1"
// 블록과 같은 idiom: `it()`/`describe()` 없이 모듈 스코프에 두어 vitest 총 개수를
// 건드리지 않고 `tsc --noEmit`만으로 판정한다. hintNow가 실수로 required가 되면
// 아래 리터럴이 그 필드를 안 채웠으므로 여기서 tsc가 거절한다 — `now`가 이미 그
// 함정에 걸렸던 자리(위 설명)를 되밟지 않는다는 계약을 코드로 못 박는다.
const _hintNowIsOptional: DateWheelLabels = {
  placeholder: "날짜 선택", hint: "안내", today: "오늘", now: "지금", clear: "비우기", done: "완료",
  previous: "이전", next: "다음", select: "선택", weekdays: ["일", "월", "화", "수", "목", "금", "토"],
  units: { year: "연도", month: "월", day: "일" },
  // 3단계: `meridiem`은 **필수**다. 그리는 글자이고, 선택으로 두면 영어로
  // override한 소비자에게 한국어가 새는 자리가 하나 더 생긴다(원장의 `units` 누수와
  // 정확히 같은 모양) — 그 실수를 되풀이하지 않는다는 계약을 여기서 못 박는다.
  meridiem: { am: "오전", pm: "오후" },
  // hintNow 없음 — 필수가 되면 여기서 tsc가 터진다.
};
void _hintNowIsOptional;

// ── 3단계 — 12시간제는 킷 전역 설정이고, 시 열은 24칸 그대로다 (스펙 §7·§10·§11) ──
//
// 이 블록의 검사는 전부 **같은 값, 다른 글자**다. 값을 바꾸는 검사가 하나도 없는
// 것이 요점이다 — 12시간제는 읽는 방식이지 값이 아니다.
const TIME_FIELDS: WheelUnit[] = ["year", "month", "day", "hour", "minute", "second"];

describe("DateWheelPicker 12시간제 (3단계)", () => {
  it("대조군: 기본은 24시간제다 — 설정을 안 건드리면 트리거가 지금과 같다", () => {
    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T15:00:05" fields={TIME_FIELDS} onChange={() => undefined} />);
    expect(fieldOf("거래 시각").textContent).toBe("2026. 08. 12. 15:00:05");
  });

  it("설정이 12면 트리거의 시 세그먼트가 오전/오후를 싣는다", () => {
    setHourFormat("12");
    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T15:00:05" fields={TIME_FIELDS} onChange={() => undefined} />);
    expect(fieldOf("거래 시각").textContent).toBe("2026. 08. 12. 오후 03:00:05");
  });

  /* 🔴 이 검사가 이 태스크의 **공허하지 않은** 부분이다.
   *
   * 위 두 검사만으로는 컴포넌트가 **구독**하는지 알 수 없다 — 렌더 시점에 한 번 읽고
   * 마는 구현도, 지역 상수 `"24"`를 들고 있다가 우연히 맞는 구현도 똑같이 통과한다.
   * 여기서는 **마운트한 뒤에** 설정을 바꾸고 화면이 따라오는지를 본다. `useSyncExternalStore`
   * 없이는 빨개진다. (이 저장소 원장의 "공허한 A/B" 실패 사례와 같은 자리다.) */
  it("마운트한 뒤 설정을 바꾸면 이미 떠 있는 픽커가 따라 바뀐다 — 구독이 실제로 돈다", () => {
    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T15:00:05" fields={TIME_FIELDS} onChange={() => undefined} />);
    expect(fieldOf("거래 시각").textContent).toBe("2026. 08. 12. 15:00:05");

    act(() => setHourFormat("12"));
    expect(fieldOf("거래 시각").textContent).toBe("2026. 08. 12. 오후 03:00:05");

    act(() => setHourFormat("24"));
    expect(fieldOf("거래 시각").textContent).toBe("2026. 08. 12. 15:00:05");
  });

  it("시 열이 24칸 그대로다 — 라벨만 12시간제로 읽힌다", () => {
    // 위·아래 프리로드까지 일곱 행이 연속한 24시간 값을 그대로 읽어야 한다. 12칸으로
    // 순환시켰다면 정오를 넘는 이 구간에서 어긋난다(스펙 §7이 24칸을 고른 이유).
    setHourFormat("12");
    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T11:00:05" fields={TIME_FIELDS} onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 시각"));

    const hour = screen.getByRole("group", { name: "시 오전 11" });
    const rows = [...hour.querySelectorAll(".date-wheel-values button")].map((row) => row.textContent);
    expect(rows).toEqual(["오전 08", "오전 09", "오전 10", "오전 11", "오후 12", "오후 01", "오후 02"]);
  });

  it("분·초 열은 12시간제와 무관하다 — 대조군", () => {
    setHourFormat("12");
    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T15:07:05" fields={TIME_FIELDS} onChange={() => undefined} />);
    fireEvent.click(fieldOf("거래 시각"));

    expect(screen.getByRole("group", { name: "분 07" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "초 05" })).toBeTruthy();
  });

  it("오전/오후 문구를 소비자가 바꿀 수 있다 — 킷이 한국어를 안 박는다", () => {
    setHourFormat("12");
    render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T15:00:05" fields={TIME_FIELDS} onChange={() => undefined} labels={{ meridiem: { am: "AM", pm: "PM" } }} />);
    expect(fieldOf("거래 시각").textContent).toBe("2026. 08. 12. PM 03:00:05");
  });

  /* `meridiem`을 **통째로만** 갈아 끼울 수 있다는 것이 이 검사의 내용이다.
   * `units`처럼 부분 병합(`{ ...DEFAULT.meridiem, ...override.meridiem }`)을 하면,
   * 한쪽만 준 소비자에게 나머지 한쪽이 한국어로 새고 — 그게 이 저장소가 이미 갖고
   * 있는 결함이다. 타입이 둘 다 요구하므로 그 상태 자체가 만들어지지 않는다. */
  it("오전/오후는 통째로 바뀐다 — 한쪽만 한국어로 남는 상태가 없다", () => {
    setHourFormat("12");
    const { rerender } = render(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T03:00:05" fields={TIME_FIELDS} onChange={() => undefined} labels={{ meridiem: { am: "AM", pm: "PM" } }} />);
    expect(fieldOf("거래 시각").textContent).toBe("2026. 08. 12. AM 03:00:05");
    rerender(<DateWheelPicker ariaLabel="거래 시각" value="2026-08-12T15:00:05" fields={TIME_FIELDS} onChange={() => undefined} labels={{ meridiem: { am: "AM", pm: "PM" } }} />);
    expect(fieldOf("거래 시각").textContent).toBe("2026. 08. 12. PM 03:00:05");
  });

  it("시 단위가 없는 픽커는 12시간제에서도 그대로다 — 날짜 전용 대조군", () => {
    setHourFormat("12");
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-08-12" onChange={() => undefined} />);
    expect(fieldOf("거래 날짜").textContent).toBe("2026. 08. 12.");
  });
});

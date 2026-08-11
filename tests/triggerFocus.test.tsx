// @vitest-environment jsdom

/* **마우스로 조작을 시작해도 포커스가 트리거에 온다.**
 *
 * 오너 실기기 캡처(macOS, 2026-08-11)가 잡은 결함입니다. 같은 동작의 두 트레이스:
 *
 *   맥    click target=button.date-wheel-trigger → keydown … tgt=body    처리됨=N
 *   윈도우 click target=span                     → keydown … tgt=button.date-wheel-trigger.editing  처리됨=Y
 *
 * **맥 브라우저는 버튼을 클릭해도 포커스를 주지 않습니다**(macOS의 오랜 관례입니다 —
 * 시스템 설정의 "키보드 탐색"이 꺼져 있으면 버튼·링크는 클릭으로 포커스를 받지 않습니다).
 * 두 컨트롤 다 키 핸들러가 **트리거 하나에만** 걸려 있으므로, 그러면 `Cmd+;`뿐 아니라
 * **방향키·숫자·Enter까지 전부** 닿지 않습니다. 캡처의 `ArrowRight → 처리됨=N`이 그것입니다.
 *
 * ⚠️ **`DateWheelPicker.tsx`의 옛 주석이 이 전제를 사실로 단정하고 있었습니다** —
 * "`tabIndex={-1}`인 버튼도 클릭하면 포커스를 받습니다". 설계 스펙 §6.2의 불변식
 * ("키보드를 받는 동안 activeElement는 언제나 트리거")이 그 위에 서 있었는데, 그 문장은
 * Windows에서만 참이었습니다. 불변식은 **전제가 아니라 코드가** 지켜야 합니다.
 *
 * **jsdom이 이 결함을 그대로 재현합니다** — 여기서도 버튼은 클릭으로 포커스를 받지
 * 않습니다. 그래서 이 파일은 맥 없이도 회귀를 잡습니다. 다만 **jsdom이 맥을 흉내 내는
 * 것이 아니라 우연히 같은 것**이므로, "맥에서 고쳐졌다"는 증거는 아닙니다 —
 * 그건 오너 캡처로만 확인됩니다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DateWheelPicker } from "../src/DateWheelPicker";
import { Select } from "../src/Select";

afterEach(cleanup);

const OPTIONS = [
  { value: "a", label: "첫째" },
  { value: "b", label: "둘째" },
];

/** 트리거(접근성 이름에 값이 붙으므로 접두사로 찾습니다 — DateWheelPicker.test.tsx:48과 같은 방식). */
const byPrefix = (name: string) =>
  screen.getByRole("button", { name: (accessibleName: string) => accessibleName === name || accessibleName.startsWith(`${name}, `) });

describe("DateWheelPicker: 마우스로 눌러도 포커스가 트리거에 온다", () => {
  // 전제 — 렌더 직후 이미 트리거가 포커스돼 있으면 아래 단언이 **공허하게** 통과합니다.
  it("렌더 직후에는 body에 포커스가 있다", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-23" onChange={() => undefined} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("트리거를 누르면 트리거가 활성 요소가 된다", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-23" onChange={() => undefined} />);
    const trigger = byPrefix("거래 날짜");
    fireEvent.pointerDown(trigger);
    expect(document.activeElement).toBe(trigger);
  });

  /* 실제 클릭은 트리거 **안의 세그먼트 span**에 떨어집니다 — 오너 캡처의
   * `pointerdown target=span`이 그것입니다. 이벤트가 버튼까지 버블해 올라오는 경로에서도
   * 포커스가 잡혀야 하므로, 자식에서 쏜 경우를 따로 고정합니다. */
  it("트리거 안의 세그먼트를 눌러도 트리거가 활성 요소가 된다", () => {
    const { container } = render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-23" onChange={() => undefined} />);
    const segment = container.querySelector(".date-wheel-segment");
    expect(segment).not.toBeNull();
    fireEvent.pointerDown(segment!);
    expect(document.activeElement).toBe(byPrefix("거래 날짜"));
  });

  it("비활성이면 포커스를 가져가지 않는다", () => {
    render(<DateWheelPicker ariaLabel="거래 날짜" value="2026-07-23" onChange={() => undefined} disabled />);
    fireEvent.pointerDown(byPrefix("거래 날짜"));
    expect(document.activeElement).toBe(document.body);
  });
});

describe("Select: 마우스로 눌러도 포커스가 트리거에 온다", () => {
  it("렌더 직후에는 body에 포커스가 있다", () => {
    render(<Select ariaLabel="통화" value="a" options={OPTIONS} onChange={() => undefined} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("트리거를 누르면 트리거가 활성 요소가 된다", () => {
    render(<Select ariaLabel="통화" value="a" options={OPTIONS} onChange={() => undefined} />);
    const trigger = screen.getByRole("button", { name: "통화" });
    fireEvent.pointerDown(trigger);
    expect(document.activeElement).toBe(trigger);
  });

  it("비활성이면 포커스를 가져가지 않는다", () => {
    render(<Select ariaLabel="통화" value="a" options={OPTIONS} onChange={() => undefined} disabled />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "통화" }));
    expect(document.activeElement).toBe(document.body);
  });
});

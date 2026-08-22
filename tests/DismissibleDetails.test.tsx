// @vitest-environment jsdom

import { cleanup, createEvent, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DismissibleDetails } from "../src/surfaces/DismissibleDetails";

afterEach(cleanup);

function renderDetails() {
  const result = render(<>
    <button type="button">바깥</button>
    <DismissibleDetails className="info" summary="정보"><span>내용</span></DismissibleDetails>
  </>);
  const details = result.container.querySelector("details") as HTMLDetailsElement;
  const outside = result.getByRole("button", { name: "바깥" });
  details.open = true;
  return { ...result, details, outside };
}

/** jsdom에는 PointerEvent 생성자가 없어 RTL의 pointerDown이 button을 버린다. */
function pointerDown(element: Element, button: number) {
  const event = createEvent.pointerDown(element);
  Object.defineProperty(event, "button", { value: button, configurable: true });
  fireEvent(element, event);
}

describe("DismissibleDetails: 열린 정보 표면의 닫힘 경계", () => {
  it("바깥 주 버튼 pointerdown이면 닫는다", () => {
    const { details, outside } = renderDetails();
    pointerDown(outside, 0);
    expect(details.open).toBe(false);
  });

  it("바깥이어도 주 버튼이 아니면 닫지 않는다", () => {
    const { details, outside } = renderDetails();
    pointerDown(outside, 3);
    expect(details.open).toBe(true);
  });

  it("안쪽 pointerdown은 닫지 않는다", () => {
    const { details, getByText } = renderDetails();
    pointerDown(getByText("내용"), 0);
    expect(details.open).toBe(true);
  });

  it("포커스가 바깥으로 나가면 닫는다", () => {
    const { details, outside } = renderDetails();
    fireEvent.focusIn(outside);
    expect(details.open).toBe(false);
  });

  it("Escape를 누르면 닫는다", () => {
    const { details } = renderDetails();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(details.open).toBe(false);
  });
});

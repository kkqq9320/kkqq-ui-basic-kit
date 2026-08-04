import { describe, expect, it } from "vitest";

import { firstEnabledValue, initialActiveValue, lastEnabledValue, stepEnabledValue } from "../src/selectKeyboard";

/** 가운데가 disabled — 건너뛰기를 한 배열로 양방향 다 검증할 수 있다. */
const OPTIONS = [
  { value: "a", label: "첫째" },
  { value: "b", label: "둘째", disabled: true },
  { value: "c", label: "셋째" },
];

describe("selectKeyboard", () => {
  it("첫/마지막 선택 가능한 값을 찾는다", () => {
    expect(firstEnabledValue(OPTIONS)).toBe("a");
    expect(lastEnabledValue(OPTIONS)).toBe("c");
  });

  it("전부 disabled면 null이다 — 방향키가 아무것도 하지 않을 근거", () => {
    const allDisabled = [{ value: "a", label: "첫째", disabled: true }];
    expect(firstEnabledValue(allDisabled)).toBeNull();
    expect(lastEnabledValue(allDisabled)).toBeNull();
  });

  it("빈 배열도 null이다", () => {
    expect(firstEnabledValue([])).toBeNull();
    expect(stepEnabledValue([], null, 1)).toBeNull();
  });

  it("disabled를 건너뛴다", () => {
    expect(stepEnabledValue(OPTIONS, "a", 1)).toBe("c");
    expect(stepEnabledValue(OPTIONS, "c", -1)).toBe("a");
  });

  it("끝에서 감싸지 않는다 — 제자리다", () => {
    expect(stepEnabledValue(OPTIONS, "c", 1)).toBe("c");
    expect(stepEnabledValue(OPTIONS, "a", -1)).toBe("a");
  });

  it("활성이 없던 상태에서 방향에 맞는 끝에서 시작한다", () => {
    expect(stepEnabledValue(OPTIONS, null, 1)).toBe("a");
    expect(stepEnabledValue(OPTIONS, null, -1)).toBe("c");
  });

  it("열 때의 활성은 현재 값이다", () => {
    expect(initialActiveValue(OPTIONS, "c")).toBe("c");
  });

  it("선택값이 없으면 첫 선택 가능한 값이다", () => {
    expect(initialActiveValue(OPTIONS, "")).toBe("a");
  });

  it("현재 값이 disabled를 가리키면 첫 선택 가능한 값으로 떨어진다", () => {
    expect(initialActiveValue(OPTIONS, "b")).toBe("a");
  });
});

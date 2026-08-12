// @vitest-environment jsdom

/* **리스너는 하나, 그리고 안 쓰면 0개여야 합니다**(스펙 §8).
 *
 * "안 쓰면 영향 0"은 주석에 적으면 아무도 다시 재지 않는 문장이라 여기서 잽니다.
 * 다만 잴 수 있는 것은 **리스너**뿐입니다 — "번들에서 빠진다"는 소비자 번들러의
 * 일이라 이 저장소의 검사가 닿지 않습니다(스펙 §8).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShortcutProvider, type ShortcutAction } from "../src/ShortcutProvider";
import { Select } from "../src/Select";

afterEach(cleanup);

function action(over: Partial<ShortcutAction> = {}): ShortcutAction {
  return { id: "toggle", label: "사이드바 접기", defaultCombo: "Ctrl+KeyB", onFire: () => {}, ...over };
}

function press(init: KeyboardEventInit & { code: string }): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  document.dispatchEvent(event);
  return event;
}

describe("디스패치", () => {
  it("바인딩된 조합이 액션을 부른다", () => {
    const onFire = vi.fn();
    render(<ShortcutProvider actions={[action({ onFire })]} />);
    press({ code: "KeyB", ctrlKey: true });
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("다른 조합은 안 부른다", () => {
    const onFire = vi.fn();
    render(<ShortcutProvider actions={[action({ onFire })]} />);
    press({ code: "KeyC", ctrlKey: true });
    expect(onFire).not.toHaveBeenCalled();
  });

  it("덮어쓰기가 기본 조합을 대신한다", () => {
    const onFire = vi.fn();
    render(<ShortcutProvider actions={[action({ onFire })]} overrides={{ toggle: "Ctrl+KeyJ" }} />);
    press({ code: "KeyB", ctrlKey: true });
    expect(onFire).not.toHaveBeenCalled();
    press({ code: "KeyJ", ctrlKey: true });
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("null 덮어쓰기는 조합을 지운 것이다 — 기본값으로 되돌아가지 않는다", () => {
    const onFire = vi.fn();
    render(<ShortcutProvider actions={[action({ onFire })]} overrides={{ toggle: null }} />);
    press({ code: "KeyB", ctrlKey: true });
    expect(onFire).not.toHaveBeenCalled();
  });

  it("defaultCombo가 null이면 아무 키로도 안 돈다", () => {
    const onFire = vi.fn();
    render(<ShortcutProvider actions={[action({ onFire, defaultCombo: null })]} />);
    press({ code: "KeyB", ctrlKey: true });
    expect(onFire).not.toHaveBeenCalled();
  });
});

describe("규칙 6 — 트리거되면 기본 동작을 막는다", () => {
  it("트리거된 이벤트는 defaultPrevented가 참이다", () => {
    render(<ShortcutProvider actions={[action()]} />);
    expect(press({ code: "KeyB", ctrlKey: true }).defaultPrevented).toBe(true);
  });

  // 대조군 — 이게 없으면 "전부 preventDefault"인 구현으로도 통과합니다.
  it("트리거되지 않은 이벤트는 건드리지 않는다", () => {
    render(<ShortcutProvider actions={[action()]} />);
    expect(press({ code: "KeyC", ctrlKey: true }).defaultPrevented).toBe(false);
  });
});

describe("옵트인 (스펙 §8)", () => {
  it("Provider 없이 킷을 쓰면 document에 keydown 리스너가 안 붙는다", () => {
    const spy = vi.spyOn(document, "addEventListener");
    render(<Select ariaLabel="고르기" value="" onChange={() => {}} options={[{ value: "a", label: "가" }]} />);
    expect(spy.mock.calls.filter(([type]) => type === "keydown")).toEqual([]);
    spy.mockRestore();
  });

  it("Provider를 쓰면 붙고, 언마운트하면 떨어진다", () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const view = render(<ShortcutProvider actions={[action()]} />);
    expect(add.mock.calls.filter(([type]) => type === "keydown").length).toBe(1);
    view.unmount();
    expect(remove.mock.calls.filter(([type]) => type === "keydown").length).toBe(1);
    add.mockRestore();
    remove.mockRestore();
  });
});

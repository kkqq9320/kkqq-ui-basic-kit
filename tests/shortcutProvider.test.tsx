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
import { sidebarToggleAction } from "../src/shortcuts";

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

  /* `tests/shortcutCombo.test.ts`는 `sidebarToggleAction(fn, { defaultCombo })`가
   * 반환하는 **객체의 필드**만 봅니다 — 그 값이 실제로 `Provider`를 거쳐 바인딩되고
   * 트리거되는지는 안 봅니다. 데모(`demo/main.tsx`)가 쓰는 자리가 정확히 이 경로
   * (`options.defaultCombo` → `action.defaultCombo` → `bindingOf` → 디스패치)라서,
   * 여기서 이어 붙여 재는 것이 전체 리뷰 Important 1이 요구한 "새 인자에 대한
   * 테스트"의 일부입니다. */
  it("sidebarToggleAction의 defaultCombo가 실제로 바인딩된다 (전체 리뷰 Important 1)", () => {
    const onFire = vi.fn();
    render(<ShortcutProvider actions={[sidebarToggleAction(onFire, { defaultCombo: "Ctrl+Backslash" })]} />);
    press({ code: "Backslash", ctrlKey: true });
    expect(onFire).toHaveBeenCalledTimes(1);
  });
});

/* id는 저장의 키입니다(스펙 §3.1) — 중복은 프로그래밍 오류지만, 그 상태에서도
 * 동작은 결정적이어야 합니다: 먼저 나온 항목이 이깁니다. */
describe("id 중복 — 먼저 나온 항목이 결정적으로 이긴다", () => {
  it("첫 항목의 조합이 이기고, 그 조합으로 첫 항목의 onFire가 불린다", () => {
    const onFireFirst = vi.fn();
    const onFireSecond = vi.fn();
    render(
      <ShortcutProvider
        actions={[
          action({ id: "dup", defaultCombo: "Ctrl+KeyB", onFire: onFireFirst }),
          action({ id: "dup", defaultCombo: "Ctrl+KeyJ", onFire: onFireSecond }),
        ]}
      />,
    );

    press({ code: "KeyB", ctrlKey: true }); // 첫 항목의 조합
    expect(onFireFirst).toHaveBeenCalledTimes(1);
    expect(onFireSecond).not.toHaveBeenCalled();

    press({ code: "KeyJ", ctrlKey: true }); // 둘째 항목의 조합 — 가려져서 안 돈다
    expect(onFireFirst).toHaveBeenCalledTimes(1);
    expect(onFireSecond).not.toHaveBeenCalled();
  });
});

/* registryRef로 최신값을 본다는 주석이 있지만, 렌더 1회·키 입력 1회짜리 테스트로는
 * 그 안전장치를 증명하지 못합니다 — 핸들러가 registryRef.current 대신 최초 렌더의
 * registry를 그냥 캡처해도 통과하기 때문입니다. 그래서 여기서는 같은 컴포넌트
 * 인스턴스를 rerender로 다시 렌더해 최신 overrides가 실제로 반영되는지 봅니다. */
describe("스테일 클로저 방지 — rerender 후에도 최신 overrides를 본다", () => {
  it("리렌더 후에는 새 조합만 동작하고 옛 조합은 동작하지 않는다", () => {
    const onFire = vi.fn();
    const { rerender } = render(
      <ShortcutProvider actions={[action({ onFire })]} overrides={{ toggle: "Ctrl+KeyJ" }} />,
    );

    press({ code: "KeyJ", ctrlKey: true }); // 첫 렌더의 조합
    expect(onFire).toHaveBeenCalledTimes(1);

    rerender(<ShortcutProvider actions={[action({ onFire })]} overrides={{ toggle: "Ctrl+KeyK" }} />);

    press({ code: "KeyJ", ctrlKey: true }); // 옛 조합 — 더 이상 안 돈다
    expect(onFire).toHaveBeenCalledTimes(1);

    press({ code: "KeyK", ctrlKey: true }); // 새 조합만 돈다
    expect(onFire).toHaveBeenCalledTimes(2);
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

/* **전체 리뷰 Important 2.** `Escape`·`Tab`은 스펙 §6.2에 따라 조합으로 등록할 수
 * 없는데, 그 관문이 전에는 `ShortcutSettings`의 녹음기 안에만 있어서 `defaultCombo`·
 * `overrides`로 들어오는 조합은 그냥 우회했습니다. 구체적 실패: 앱이 `Shift+Tab`을
 * 바인딩하면 `Dialog`의 포커스 트랩(감싸지 않는 평범한 `Tab`에서는 `preventDefault`를
 * 안 부름, 스펙 §2.1)이 규칙 1을 막지 못해 액션이 돌고, 규칙 6의 `preventDefault`가
 * 걸려 포커스가 아예 안 나갑니다. `bindingOf`가 이제 이 둘을 드롭합니다.
 *
 * `Tab`·`Shift+Tab`은 규칙 2의 수식어(Ctrl·Alt·Meta)가 아니라 맨 키/Shift 조합
 * 경로로 판정되므로(`shouldTrigger`), 트리거되려면 포커스가 `document.body`(또는
 * 허용 구역)여야 합니다 — 그래서 각 테스트가 포커스를 먼저 못박습니다. 이걸 안
 * 하면 "표식 없는 요소에 포커스가 있어 규칙 3에 걸려 트리거 안 됨"과 "bindingOf가
 * 드롭해서 트리거 안 됨"을 구분 못 하고, 뮤테이션(드롭 로직 제거)에도 초록으로
 * 남는 공허한 테스트가 됩니다. */
describe("§6.2 — Escape·Tab은 defaultCombo·overrides로도 등록되지 않는다 (전체 리뷰 Important 2)", () => {
  it("defaultCombo가 'Tab'이면 body 포커스에서도 트리거되지 않는다", () => {
    const onFire = vi.fn();
    render(<ShortcutProvider actions={[action({ onFire, defaultCombo: "Tab" })]} />);
    expect(document.activeElement).toBe(document.body);
    press({ code: "Tab" });
    expect(onFire).not.toHaveBeenCalled();
  });

  it("overrides로 들어온 'Shift+Tab'도 트리거되지 않는다", () => {
    const onFire = vi.fn();
    render(<ShortcutProvider actions={[action({ onFire })]} overrides={{ toggle: "Shift+Tab" }} />);
    expect(document.activeElement).toBe(document.body);
    press({ code: "Tab", shiftKey: true });
    expect(onFire).not.toHaveBeenCalled();
  });

  // 대조군 — 이게 없으면 "bindingOf가 뭘 넣어도 항상 null" 같은 구현으로도 위 둘이
  // 통과합니다. 평범한 조합은 여전히 정상 동작해야 합니다.
  it("대조군 — Escape·Tab이 아닌 평범한 조합은 여전히 동작한다", () => {
    const onFire = vi.fn();
    render(<ShortcutProvider actions={[action({ onFire, defaultCombo: "Ctrl+KeyQ" })]} />);
    press({ code: "KeyQ", ctrlKey: true });
    expect(onFire).toHaveBeenCalledTimes(1);
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

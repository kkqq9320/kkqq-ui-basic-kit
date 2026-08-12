// @vitest-environment jsdom
/// <reference types="vite/client" />

/* **녹음기는 설정 UI이면서 계측기입니다**(스펙 §5.3·§6).
 *
 * ⚠️ `Escape`·`Tab`은 조합으로 등록할 수 없습니다. 실측된 이유가 있습니다 —
 * 설정 화면이 `Dialog` 안이면 `hooks.ts:25`의 `useEscapeToClose`가 `Escape`를 받아
 * 다이얼로그를 닫는데, **그 리스너는 `preventDefault`를 안 부릅니다.** 그래서
 * 녹음기는 "아무도 안 먹었다"로 읽고, 다이얼로그가 닫히면서 동시에 등록됩니다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShortcutProvider, type ShortcutAction } from "../src/ShortcutProvider";
import { ShortcutSettings, displayCombo } from "../src/ShortcutSettings";

const cssModules = import.meta.glob("../css/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const SHORTCUT_CSS = cssModules["../css/shortcuts.css"];
const INDEX_CSS = cssModules["../css/index.css"];

afterEach(cleanup);

const ACTIONS: ShortcutAction[] = [
  { id: "toggle", label: "사이드바 접기", defaultCombo: null, onFire: () => {} },
  { id: "backup", label: "백업 페이지로 이동", defaultCombo: "Ctrl+KeyB", onFire: () => {} },
];

function setup(onChange = vi.fn()) {
  render(<ShortcutProvider actions={ACTIONS}><ShortcutSettings onChange={onChange} /></ShortcutProvider>);
  return onChange;
}

/** 녹음 버튼을 눌러 녹음을 시작합니다. */
function record(label: string) {
  const button = screen.getByRole("button", { name: new RegExp(label) });
  fireEvent.click(button);
  return button;
}

describe("목록", () => {
  it("마운트 안 된 화면의 액션도 전부 보여 준다", () => {
    setup();
    expect(screen.getByText("사이드바 접기")).toBeTruthy();
    expect(screen.getByText("백업 페이지로 이동")).toBeTruthy();
  });

  it("code가 아니라 사람이 읽는 이름으로 보여 준다", () => {
    expect(displayCombo("Ctrl+KeyB")).toBe("Ctrl + B");
    expect(displayCombo("Ctrl+Semicolon")).toBe("Ctrl + ;");
  });

  it("이름표가 없는 code는 원시 값 그대로 보인다 — 동작은 안 틀린다", () => {
    expect(displayCombo("Ctrl+F13")).toBe("Ctrl + F13");
  });
});

describe("녹음", () => {
  it("누른 조합이 등록된다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("toggle", "Ctrl+KeyJ");
  });

  it("Escape는 등록되지 않고 녹음을 취소한다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Tab은 등록되지 않는다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "Tab" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("수식어만 누르는 동안에는 등록되지 않는다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "ControlLeft", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("녹음 중에는 기본 동작을 막는다 — Ctrl+S가 저장 대화상자를 열지 않게", () => {
    setup();
    record("사이드바 접기");
    const event = new KeyboardEvent("keydown", { code: "KeyS", ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("충돌", () => {
  it("다른 액션이 쓰는 조합이면 등록하지 않고 알린다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyB", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("백업 페이지로 이동");
  });

  it("킷이 쓰는 조합이면 등록하지 않고 알린다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "Semicolon", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("날짜");
  });
});

/* 스펙 §5.3 — 브라우저가 먼저 먹는 조합은 keydown이 **안 옵니다.** 목록으로는 못 잡고
 * 사용자가 그 자리에서 관측할 수 있는데, **안내가 없으면 그냥 반응 없는 화면**입니다. */
describe("녹음 중 안내가 계측기 노릇을 한다", () => {
  it("녹음을 시작하면 반응이 없을 때 무슨 뜻인지 알려 준다", () => {
    setup();
    expect(screen.queryByText(/브라우저나 OS가 먼저/)).toBe(null);
    record("사이드바 접기");
    expect(screen.getByText(/브라우저나 OS가 먼저/)).toBeTruthy();
  });
});

/* **§6.1의 실제 계약입니다.** 녹음 중에 디스패처가 조용한지는 지금까지 아무것도
 * 확인하지 않고 있었습니다. 대조군(녹음 전)이 있어야 공허하지 않습니다. */
describe("녹음 중에는 디스패처가 조용하다 (스펙 §6.1)", () => {
  it("녹음 중에 바인딩된 조합을 눌러도 액션이 안 불린다", () => {
    const onFire = vi.fn();
    render(
      <ShortcutProvider actions={[{ id: "toggle", label: "사이드바 접기", defaultCombo: "Ctrl+KeyJ", onFire }]}>
        <ShortcutSettings onChange={() => {}} />
      </ShortcutProvider>,
    );

    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });
    expect(onFire).toHaveBeenCalledTimes(1);   // 대조군 — 평소에는 돕니다

    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });
    expect(onFire).toHaveBeenCalledTimes(1);   // 늘지 않아야 합니다

    // 녹음이 끝나면 다시 돕니다 — 플래그가 새지 않는지까지 봅니다.
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });
    expect(onFire).toHaveBeenCalledTimes(2);
  });
});

describe("CSS는 자기 뿌리 밖으로 안 나간다 (스펙 §8)", () => {
  it("shortcuts.css를 실제로 읽었다", () => {
    expect(SHORTCUT_CSS.length).toBeGreaterThan(200);
  });

  it("모든 규칙이 .kkqq-shortcuts 아래에 있다", () => {
    const withoutComments = SHORTCUT_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...withoutComments.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim()).filter(Boolean);
    expect(selectors.filter((selector) => !selector.startsWith(".kkqq-shortcuts"))).toEqual([]);
  });

  it("통번들이 이 파일을 싣는다", () => {
    expect(INDEX_CSS).toContain('@import "./shortcuts.css";');
  });
});

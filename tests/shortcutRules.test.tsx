// @vitest-environment jsdom

/* **트리거 규칙 여덟(스펙 §2).**
 *
 * ⚠️ 규칙 5가 왜 따로 있는지 오해하지 마세요. 규칙 1은 `defaultPrevented`를 보는데,
 * **브라우저의 네이티브 편집 동작은 아무도 `preventDefault`를 안 부릅니다.**
 * `Ctrl+A`는 `defaultPrevented === false`인 채로 전체 선택을 합니다. 규칙 1은
 * 그것을 못 막습니다 — 스펙 §2.3.
 *
 * jsdom은 그 네이티브 동작을 **재현하지 않습니다.** 그래서 이 파일이 재는 것은
 * "네이티브 동작이 실제로 살아남는가"가 아니라 "우리가 트리거를 안 하는가"입니다.
 * 전자는 실브라우저 항목입니다(스펙 §10 미검증 7).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { beginRecording, endRecording, isRecording, shouldTrigger } from "../src/shortcuts";

afterEach(cleanup);

// 녹음 플래그 누수 방지 — 어떤 it이든 beginRecording() 뒤 endRecording()을 못 부르고
// 실패하면(단언이 먼저 터지면) 이 파일의 이후 테스트가 전부 조용히 false를 반환하게
// 됩니다. 매 테스트 뒤 드레인해서 그 새는 자리를 막습니다.
afterEach(() => {
  // 가드 없으면 endRecording이 깨졌을 때 스위트가 빨개지는 대신 동기 스핀으로 멈춘다.
  let guard = 8;
  while (isRecording() && guard-- > 0) endRecording();
});

/** 실제 KeyboardEvent를 만듭니다 — `defaultPrevented`가 진짜여야 규칙 1이 공허하지 않습니다. */
function keydown(init: KeyboardEventInit & { code: string }): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

/* 규칙 8(스펙 §2.5). **실측에서 나온 규칙입니다** — 2026-08-13 Windows Chrome 한글 IME
 * 캡처에서, 조합 중에 `Ctrl+\`를 한 번 누르면 keydown이 **둘** 왔습니다(같은 `code`,
 * 같은 수식어, 하나는 `keyCode=229`/`isComposing=true`). 규칙 8이 없으면 둘 다
 * 발사되어 액션이 두 번 돕니다. */
describe("규칙 8 — IME가 자기 몫으로 보내는 keydown은 트리거하지 않는다", () => {
  it("isComposing이면 안 한다", () => {
    expect(shouldTrigger(keydown({ code: "Backslash", ctrlKey: true, isComposing: true }))).toBe(false);
  });

  // 대조군 — 이게 없으면 "언제나 false"인 구현으로도 통과합니다.
  it("같은 조합이 조합 중이 아니면 한다", () => {
    expect(shouldTrigger(keydown({ code: "Backslash", ctrlKey: true }))).toBe(true);
  });

  /* `isComposing`만으로는 부족합니다 — 안드로이드 소프트 키보드는 조합 중에
   * `keyCode=229`로 보내고, 위 캡처에서도 **조합을 여는 첫 keydown은 `isComposing`이
   * 아직 false**였습니다. `keyCode`는 `KeyboardEventInit`에 없어 따로 심습니다. */
  it("keyCode 229면 isComposing이 거짓이어도 안 한다", () => {
    const event = keydown({ code: "Backslash", ctrlKey: true });
    Object.defineProperty(event, "keyCode", { value: 229 });
    expect(event.isComposing).toBe(false);   // 전제 — isComposing이 아니라 keyCode가 잡는 것
    expect(shouldTrigger(event)).toBe(false);
  });

  // 대조군 — 평범한 keyCode는 통과해야 합니다(229만 걸러야지 전부 걸면 안 됩니다).
  it("keyCode가 229가 아니면 한다", () => {
    const event = keydown({ code: "Backslash", ctrlKey: true });
    Object.defineProperty(event, "keyCode", { value: 220 });
    expect(shouldTrigger(event)).toBe(true);
  });
});

describe("규칙 1 — 컨트롤이 처리했으면 트리거하지 않는다", () => {
  it("defaultPrevented면 안 한다", () => {
    const event = keydown({ code: "KeyK", ctrlKey: true });
    event.preventDefault();
    expect(shouldTrigger(event)).toBe(false);
  });

  // 대조군 — 이게 없으면 위가 "언제나 false"인 구현으로도 통과합니다.
  it("같은 조합이 처리 안 됐으면 한다", () => {
    expect(shouldTrigger(keydown({ code: "KeyK", ctrlKey: true }))).toBe(true);
  });
});

describe("규칙 2·4 — 수식어는 어디서나, 맨 키는 타이핑 중이면 안 된다", () => {
  it("텍스트 입력에 포커스가 있어도 수식어 조합은 트리거된다", () => {
    const { container } = render(<textarea />);
    container.querySelector("textarea")!.focus();
    expect(shouldTrigger(keydown({ code: "KeyS", ctrlKey: true }))).toBe(true);
  });

  it("텍스트 입력에 포커스가 있으면 맨 키는 트리거되지 않는다", () => {
    const { container } = render(<textarea />);
    container.querySelector("textarea")!.focus();
    expect(shouldTrigger(keydown({ code: "KeyG" }))).toBe(false);
  });

  it("체크박스는 타이핑 대상이 아니다", () => {
    const { container } = render(<div data-kkqq-shortcut-scope><input type="checkbox" /></div>);
    const checkbox = container.querySelector("input")!;
    checkbox.focus();
    expect(document.activeElement).toBe(checkbox);
    expect(shouldTrigger(keydown({ code: "KeyG" }))).toBe(true);
  });

  // 규칙 2의 수식어는 Ctrl·Alt·Meta뿐입니다(스펙 §2 규칙 2) — Shift는 없습니다.
  // 두벌식 쌍자음(ㄲㄸㅃㅆㅉ)·ㅒㅖ와 `?`가 전부 Shift 조합이라, Shift 단독이 이
  // 분기로 새면 어떤 <textarea>에서도 그 글자를 못 치게 됩니다.
  it("텍스트 입력에 포커스가 있으면 Shift 단독 조합은 트리거되지 않는다", () => {
    const { container } = render(<textarea />);
    const textarea = container.querySelector("textarea")!;
    textarea.focus();
    expect(document.activeElement).toBe(textarea);
    expect(shouldTrigger(keydown({ code: "KeyR", shiftKey: true }))).toBe(false);
  });

  // 대조군 — 같은 조합이 body 포커스에서는 트리거된다(규칙 3).
  it("같은 Shift 조합이 body 포커스에서는 트리거된다", () => {
    expect(document.activeElement).toBe(document.body);
    expect(shouldTrigger(keydown({ code: "KeyR", shiftKey: true }))).toBe(true);
  });
});

describe("규칙 3 — 맨 키는 body이거나 허용 구역일 때만", () => {
  it("포커스가 body면 트리거된다", () => {
    expect(document.activeElement).toBe(document.body);
    expect(shouldTrigger(keydown({ code: "KeyG" }))).toBe(true);
  });

  it("표식 없는 버튼에 포커스가 있으면 안 된다", () => {
    const { container } = render(<button type="button">누름</button>);
    container.querySelector("button")!.focus();
    expect(shouldTrigger(keydown({ code: "KeyG" }))).toBe(false);
  });

  it("표식 없는 버튼에 포커스가 있으면 Shift 단독 조합도 트리거되지 않는다", () => {
    const { container } = render(<button type="button">누름</button>);
    const button = container.querySelector("button")!;
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(shouldTrigger(keydown({ code: "KeyR", shiftKey: true }))).toBe(false);
  });

  it("허용 구역 안의 버튼이면 된다", () => {
    const { container } = render(<div data-kkqq-shortcut-scope><button type="button">누름</button></div>);
    const button = container.querySelector("button")!;
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(shouldTrigger(keydown({ code: "KeyG" }))).toBe(true);
  });
});

describe("규칙 5 — 타이핑 중에는 네이티브 편집 조합을 양보한다", () => {
  it("textarea 안에서 Ctrl+A는 트리거되지 않는다", () => {
    const { container } = render(<textarea />);
    container.querySelector("textarea")!.focus();
    expect(shouldTrigger(keydown({ code: "KeyA", ctrlKey: true }))).toBe(false);
  });

  // 대조군 — 텍스트 입력 **밖**에서는 같은 조합이 트리거됩니다(스펙 §2.4의 표 둘째 줄).
  it("body에서 Ctrl+A는 트리거된다", () => {
    expect(shouldTrigger(keydown({ code: "KeyA", ctrlKey: true }))).toBe(true);
  });

  it("양보 목록에 없는 조합은 타이핑 중에도 트리거된다", () => {
    const { container } = render(<textarea />);
    container.querySelector("textarea")!.focus();
    expect(shouldTrigger(keydown({ code: "KeyK", ctrlKey: true }))).toBe(true);
  });
});

describe("자동 반복", () => {
  it("눌러 두어 반복되는 키는 트리거하지 않는다", () => {
    expect(shouldTrigger(keydown({ code: "KeyK", ctrlKey: true, repeat: true }))).toBe(false);
  });
});

/* 스펙 §6.1. **리스너 순서에 기대지 않습니다** — 왜인지는 `shouldTrigger` 위 주석에.
 *
 * 세 개의 it으로 쪼갭니다 — 한 it 안에 단언 셋을 순서대로 두면 가운데 단언이
 * 먼저 실패했을 때 세 번째(`endRecording()` 복구 증거)가 아예 실행되지 않고,
 * 그러면 그 복구 경로는 통과도 실패도 아닌 "본 적 없음"이 됩니다. */
describe("녹음 중에는 아무것도 트리거되지 않는다", () => {
  const make = () => keydown({ code: "KeyK", ctrlKey: true });

  it("녹음 전에는 트리거된다", () => {
    expect(shouldTrigger(make())).toBe(true);      // 대조군
  });

  it("녹음을 시작하면 트리거되지 않는다", () => {
    beginRecording();
    expect(shouldTrigger(make())).toBe(false);
  });

  it("endRecording() 뒤에는 다시 트리거된다", () => {
    beginRecording();
    endRecording();
    expect(shouldTrigger(make())).toBe(true);      // 새지 않는다
  });
});

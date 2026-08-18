// @vitest-environment jsdom

/* `src/browser/clipboard.ts` — **이 저장소에서 가장 많이 설명돼 있고 가장 덜 검사되던
 * 코드**입니다. 컴포넌트 안에 있는 동안에는 팝오버를 열고 키를 밀어야만 밟을 수 있었고,
 * 그래서 밟히는 가지가 몇 개뿐이었습니다.
 *
 * `tests/DateWheelPicker.test.tsx`가 이미 화면에서 재는 것: `Ctrl+C`가 `execCommand`로
 * 보이는 그대로를 쓰는 것, 임시 textarea를 안 남기는 것, `execCommand`가 던져도 안 죽는 것.
 * **여기서는 그 아래 — 두 경로의 갈림과 임시 요소의 성질 자체**를 잽니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canReadClipboard, catchDefaultPaste, readClipboard, writeClipboard } from "../src/browser/clipboard";

const scratches = () => [...document.querySelectorAll('textarea[aria-hidden="true"]')] as HTMLTextAreaElement[];

/** `execCommand`를 스텁하고 **불리는 순간의 임시 textarea**를 잡습니다 — 끝난 뒤에는
 *  지워지므로 나중에 보면 늘 없습니다. */
function stubExecCommand() {
  const seen: { value: string; readOnly: boolean }[] = [];
  (document as unknown as { execCommand: (c: string) => boolean }).execCommand = () => {
    for (const scratch of scratches()) seen.push({ value: scratch.value, readOnly: scratch.hasAttribute("readonly") });
    return true;
  };
  return seen;
}

beforeEach(() => { Reflect.deleteProperty(navigator, "clipboard"); });
afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(document, "execCommand");
  for (const leftover of scratches()) leftover.remove();
  document.body.innerHTML = "";
});

function giveClipboard(api: Partial<Clipboard>) {
  Object.defineProperty(navigator, "clipboard", { value: api, configurable: true });
}

describe("canReadClipboard", () => {
  // 전제 — jsdom에는 원래 `navigator.clipboard`가 없습니다. 없으면 아래가 전부 공허합니다.
  it("전제: 이 환경에는 navigator.clipboard가 없다", () => {
    expect(navigator.clipboard).toBeUndefined();
  });

  it("API가 없으면 false", () => {
    expect(canReadClipboard()).toBe(false);
  });

  /* 🔴 **`readText`만 봅니다.** 비보안 컨텍스트가 아니어도 브라우저가 읽기만 안 주는
   * 경우가 있고, 그때 `preventDefault`를 걸면 기본 붙여넣기까지 죽습니다. */
  it("writeText만 있고 readText가 없으면 false", () => {
    giveClipboard({ writeText: async () => {} });
    expect(canReadClipboard()).toBe(false);
  });

  it("readText가 있으면 true", () => {
    giveClipboard({ readText: async () => "" });
    expect(canReadClipboard()).toBe(true);
  });
});

describe("writeClipboard", () => {
  it("API가 있으면 그것으로 쓴다", () => {
    const written: string[] = [];
    giveClipboard({ writeText: async (text: string) => { written.push(text); } });
    writeClipboard("2026. 07. 12.");
    expect(written).toEqual(["2026. 07. 12."]);
  });

  it("API로 썼으면 임시 요소를 안 만든다", () => {
    const seen = stubExecCommand();
    giveClipboard({ writeText: async () => {} });
    writeClipboard("x");
    expect(seen).toEqual([]);
  });

  /* 권한 거절은 `writeText`가 **거부된 프로미스**로 옵니다. 안 삼키면 unhandled
   * rejection이 되어 다른 검사에서 터집니다. */
  it("거절당한 쓰기를 삼킨다", async () => {
    giveClipboard({ writeText: async () => { throw new Error("NotAllowedError"); } });
    expect(() => writeClipboard("x")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  it("API가 없으면 execCommand 폴백으로 그 글자를 쓴다", () => {
    const seen = stubExecCommand();
    writeClipboard("2026. 07. 12.");
    expect(seen.map((s) => s.value)).toEqual(["2026. 07. 12."]);
  });

  /* 🔴 **복사 쪽 임시 요소는 읽기 전용입니다.** 붙여넣기 쪽과 같은 함수로 만드는데
   * 다른 것이 이 하나뿐이고, 그게 결정적입니다 — 읽기 전용 textarea에는 붙여넣기가
   * 안 됩니다. 반대 짝은 아래 `catchDefaultPaste`에 있습니다. */
  it("복사 쪽 임시 요소는 읽기 전용이다", () => {
    const seen = stubExecCommand();
    writeClipboard("x");
    expect(seen.map((s) => s.readOnly)).toEqual([true]);
  });

  it("폴백 뒤에 포커스를 원래 요소로 되돌린다", () => {
    stubExecCommand();
    const before = document.createElement("input");
    document.body.appendChild(before);
    before.focus();
    writeClipboard("x");
    expect(document.activeElement).toBe(before);
  });

  it("execCommand가 던져도 포커스를 되돌리고 임시 요소를 치운다", () => {
    (document as unknown as { execCommand: () => boolean }).execCommand = () => { throw new Error("blocked"); };
    const before = document.createElement("input");
    document.body.appendChild(before);
    before.focus();
    expect(() => writeClipboard("x")).not.toThrow();
    expect([document.activeElement, scratches().length]).toEqual([before, 0]);
  });
});

describe("readClipboard", () => {
  it("API가 없으면 null", async () => {
    expect(await readClipboard()).toBeNull();
  });

  it("읽기가 거절당하면 null — 던지지 않는다", async () => {
    giveClipboard({ readText: async () => { throw new Error("NotAllowedError"); } });
    expect(await readClipboard()).toBeNull();
  });

  it("읽히면 그 글자를 돌려준다", async () => {
    giveClipboard({ readText: async () => "2031. 03. 05." });
    expect(await readClipboard()).toBe("2031. 03. 05.");
  });
});

describe("catchDefaultPaste", () => {
  /* 🔴 **브라우저의 기본 붙여넣기가 여기로 떨어져야 하므로 동기적으로 포커스합니다.**
   * 다음 틱에 포커스하면 이미 늦습니다 — keydown이 끝나는 순간 브라우저가 붙여넣습니다. */
  it("임시 textarea에 곧바로 포커스를 준다", () => {
    vi.useFakeTimers();
    catchDefaultPaste(() => {});
    expect(document.activeElement).toBe(scratches()[0]);
  });

  /* 🔴 위 복사 쪽의 반대 짝입니다. 읽기 전용이면 브라우저가 여기에 못 붙여넣습니다. */
  it("붙여넣기 쪽 임시 요소는 읽기 전용이 아니다", () => {
    vi.useFakeTimers();
    catchDefaultPaste(() => {});
    expect(scratches()[0].hasAttribute("readonly")).toBe(false);
  });

  it("다음 틱에 들어온 글자를 넘겨준다", () => {
    vi.useFakeTimers();
    const got: string[] = [];
    catchDefaultPaste((text) => got.push(text));
    scratches()[0].value = "2031. 03. 05.";   // 브라우저가 기본 동작으로 넣은 셈
    vi.advanceTimersByTime(0);
    expect(got).toEqual(["2031. 03. 05."]);
  });

  it("아무것도 안 들어와도 부르기는 한다 — 판단은 호출부의 몫이다", () => {
    vi.useFakeTimers();
    const got: string[] = [];
    catchDefaultPaste((text) => got.push(text));
    vi.advanceTimersByTime(0);
    expect(got).toEqual([""]);
  });

  it("임시 요소를 남기지 않는다", () => {
    vi.useFakeTimers();
    catchDefaultPaste(() => {});
    vi.advanceTimersByTime(0);
    expect(scratches().length).toBe(0);
  });

  it("포커스를 원래 요소로 되돌린다", () => {
    vi.useFakeTimers();
    const before = document.createElement("input");
    document.body.appendChild(before);
    before.focus();
    catchDefaultPaste(() => {});
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(before);
  });

  /* 글자를 넘기기 **전에** 치우고 포커스를 되돌립니다 — 호출부가 그 자리에서 값을
   * 바꾸며 포커스를 옮길 수 있는데, 뒤에 치우면 그것을 덮어씁니다. */
  it("치우고 되돌린 뒤에 넘겨준다", () => {
    vi.useFakeTimers();
    const before = document.createElement("input");
    document.body.appendChild(before);
    before.focus();
    let stateAtDelivery: [number, boolean] = [-1, false];
    catchDefaultPaste(() => { stateAtDelivery = [scratches().length, document.activeElement === before]; });
    vi.advanceTimersByTime(0);
    expect(stateAtDelivery).toEqual([0, true]);
  });
});

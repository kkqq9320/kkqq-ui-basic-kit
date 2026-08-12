// @vitest-environment jsdom
/// <reference types="vite/client" />

/* **레이아웃을 흔드는 측정이 사용자의 스크롤 위치를 파괴하면 안 된다.**
 *
 * 오너 리포트(2026-08-12 (b)): 레이아웃 페이지에서 "아래로 스크롤하자마자 바로 위로
 * 깜빡이며 올라온다". 원인은 `demo/main.tsx`의 조작판이 **400ms마다** 옛 규칙을 얹었다
 * 걷으면서, 그 사이 문서가 창 높이까지 짧아져 브라우저가 스크롤 위치를 깎는 것이었습니다.
 * 걷어내도 위치는 안 돌아옵니다. 실측은 `demo/preservingScroll.ts`의 머리말에 있습니다.
 *
 * ⚠️ **이 파일이 못 보는 것을 먼저 적습니다.** jsdom은 레이아웃을 하지 않으므로
 * **깎임 자체를 재현할 수 없습니다** — `scrollHeight`가 줄지 않으니 브라우저가 위치를
 * 깎을 일도 없고, 그 상태로 "측정해도 스크롤이 유지된다"를 쓰면 고침을 빼도 **초록으로
 * 통과하는 공허한 테스트**가 됩니다(이 저장소가 다섯 번 실어 보낸 그 계열).
 * 그래서 둘로 나눕니다:
 *   1. **헬퍼의 계약** — 깎임을 스텁으로 **흉내 내서** `preservingScroll`이 되돌리는지.
 *      깎임의 재현이 아니라 "깎였을 때 어떻게 하는가"를 봅니다.
 *   2. **소스 계약** — `main.tsx`의 주입·제거 쌍이 정말 그 헬퍼 **안에서** 일어나는지.
 *      1번만으로는 헬퍼가 존재하기만 하고 안 쓰여도 초록입니다.
 * 실제 깎임과 복원은 **실제 크롬에서 실측**했습니다(87 → 0 → 87). jsdom이 아니라
 * 그쪽이 근거입니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import demoSource from "../demo/main.tsx?raw";
import { preservingScroll } from "../demo/preservingScroll";

/* jsdom의 `window.scrollTo`는 "Not implemented"를 찍는 빈 함수고 `scrollX`/`scrollY`는
 * 언제나 0입니다. 그대로 두면 무엇을 하든 0이라 **어떤 단언도 뜻이 없습니다.**
 * 세 개를 다 갈아 끼워, 브라우저가 위치를 깎는 순간을 우리가 손으로 만들 수 있게 합니다. */
let scrollX = 0;
let scrollY = 0;
let scrollTo: ReturnType<typeof vi.fn>;

/** 브라우저가 문서가 짧아졌다며 위치를 깎는 순간. */
const clampTo = (x: number, y: number) => { scrollX = x; scrollY = y; };

beforeEach(() => {
  scrollX = 0;
  scrollY = 0;
  scrollTo = vi.fn((x: number, y: number) => { scrollX = x; scrollY = y; });
  Object.defineProperty(window, "scrollX", { configurable: true, get: () => scrollX });
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
  Object.defineProperty(window, "scrollTo", { configurable: true, writable: true, value: scrollTo });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("preservingScroll — 측정이 스크롤 위치를 파괴하지 않는다", () => {
  it("측정 도중 브라우저가 위치를 깎으면 원래 자리로 되돌린다", () => {
    clampTo(0, 87);

    preservingScroll(() => { clampTo(0, 0); });

    expect(window.scrollY).toBe(87);
  });

  it("가로 위치도 함께 되돌린다", () => {
    clampTo(31, 87);

    preservingScroll(() => { clampTo(0, 0); });

    expect(window.scrollX).toBe(31);
  });

  it("측정한 값을 그대로 돌려준다", () => {
    clampTo(0, 87);

    const reading = preservingScroll(() => { clampTo(0, 0); return { cardCols: 8 }; });

    expect(reading).toEqual({ cardCols: 8 });
  });

  /* ⚠️ 조건 없이 매번 `scrollTo`를 부르면 400ms마다 진행 중인 부드러운·관성 스크롤을
   * 끊습니다. "안 움직였으면 손대지 않는다"가 계약의 일부입니다. */
  it("위치가 안 움직였으면 scrollTo를 아예 부르지 않는다", () => {
    clampTo(0, 87);

    preservingScroll(() => { /* 레이아웃을 안 흔드는 측정 */ });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  /* 아래 둘은 **일부러 다른 `it`입니다.** 한 블록에 두면 앞 단언이 터지는 순간 뒤엣것은
   * 실행조차 안 돼, 어떤 뮤테이션으로도 증명되지 않습니다(이 저장소의 최대 실패 모드). */
  it("run()이 던지면 그 예외를 삼키지 않는다", () => {
    clampTo(0, 87);

    expect(() => preservingScroll(() => { clampTo(0, 0); throw new Error("측정 실패"); })).toThrow("측정 실패");
  });

  it("run()이 던져도 스크롤은 되돌아온다", () => {
    clampTo(0, 87);

    try { preservingScroll(() => { clampTo(0, 0); throw new Error("측정 실패"); }); } catch { /* 위 테스트가 봅니다 */ }

    expect(window.scrollY).toBe(87);
  });
});

/* 헬퍼가 있기만 하고 안 쓰이면 위 여섯은 전부 초록인 채 결함은 그대로입니다.
 * 아래가 그 구멍을 막습니다. */
describe("demo/main.tsx — 옛 규칙 주입이 preservingScroll 안에서 일어난다", () => {
  /** `from` 이후 첫 여는 괄호부터 짝이 맞는 닫는 괄호까지. 문자열로 정규식을 조립하지
   *  않으려고 **인덱스로 자릅니다**(이 저장소가 세 번 밟은 이스케이프 함정). */
  const sliceCall = (source: string, from: number) => {
    const start = source.indexOf("(", from);
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    for (let i = start; i < source.length; i += 1) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")") {
        depth -= 1;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
    throw new Error("괄호가 안 닫힙니다");
  };

  /* 주입 지점이 하나라는 것을 **먼저** 못박습니다. 둘로 늘면 아래 검사는 한 곳만 보고
   * 초록이 되어, 자기가 반쪽이 된 것을 스스로 말하지 못합니다. */
  it("head에 스타일을 붙이는 곳은 정확히 한 군데다", () => {
    expect(demoSource.match(/document\.head\.appendChild\(/g)).toHaveLength(1);
  });

  it("주입과 제거가 preservingScroll 호출 안에 들어 있다", () => {
    const at = demoSource.indexOf("preservingScroll(");
    expect(at).toBeGreaterThan(-1);

    const call = sliceCall(demoSource, at + "preservingScroll".length);

    expect(call).toContain("document.head.appendChild(");
    expect(call).toContain(".remove()");
  });

  it("헬퍼를 실제로 import 한다", () => {
    expect(demoSource).toMatch(/import \{ preservingScroll \} from "\.\/preservingScroll"/);
  });
});

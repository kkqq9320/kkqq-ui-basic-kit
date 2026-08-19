// @vitest-environment jsdom
//
/* **붙인 리스너는 다 뗀다** — 뷰포트 훅 둘의 뒷정리 계약.
 *
 * 🔴 **이 자리는 감시자가 0이었습니다**(2026-08-19 실측). 브라우저 층의 뒷정리 동사
 * 스물여덟을 하나씩 지워 보니 **열아홉이 0 red**였고, `visualViewport.ts`는 **여덟 중
 * 여덟**이 그랬습니다. 즉 이 파일의 정리 함수를 통째로 지워도 아무것도 안 빨개졌습니다.
 *
 * 새는 리스너가 하는 일: 다이얼로그를 닫은 뒤에도 키보드가 열릴 때마다 죽은 훅이
 * `setState`를 부르고, 뷰포트가 스크롤될 때마다 계산이 돕니다. 화면에는 한동안 안
 * 보이다가 **여러 번 열었다 닫은 뒤** 느려집니다 — 그래서 눈으로는 안 잡힙니다.
 *
 * 🟢 **왜 "해제 뒤 콜백이 안 불린다"로 안 쓰는가.** `positioning.ts`의 감시자는 그
 * 모양이고(검사 하나가 변이 넷을 죽입니다), 그게 더 좋은 모양입니다 — 사용자가 겪는
 * 일에 더 가깝습니다. 그런데 이 둘은 **훅**이라 언마운트 뒤의 `setState`가 아무 데도
 * 안 보입니다(React 18부터 경고도 없습니다). 관찰할 수 있는 것이 리스너 장부뿐입니다.
 *
 * ⚠️ 그래서 이 검사는 "새지 않는다"를 재지 "동작이 옳다"를 재지 않습니다. 동작은
 * `tests/AppShell.test.tsx`의 키보드 블록이 봅니다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { useVirtualKeyboard, useVisualViewportBox } from "../src/browser/visualViewport";

afterEach(cleanup);

type FakeViewport = EventTarget & { offsetTop: number; offsetLeft: number; width: number; height: number };

function installFakeVisualViewport({ height = window.innerHeight, offsetTop = 0, offsetLeft = 0, width = window.innerWidth } = {}) {
  const target = new EventTarget() as FakeViewport;
  target.offsetTop = offsetTop;
  target.offsetLeft = offsetLeft;
  target.width = width;
  target.height = height;
  Object.defineProperty(window, "visualViewport", { configurable: true, value: target });
  return target;
}

/** 세 대상에 붙고 뗀 리스너를 `대상:종류`로 세는 장부.
 *
 *  ⚠️ **원본을 저장해 그대로 통과시킵니다** — 흉내로 갈아치우면 훅이 실제로는 아무
 *  이벤트도 못 받게 되어, "새지 않는다"가 아니라 "애초에 안 붙었다"를 재게 됩니다.
 *  아래 전제 검사가 그 경우를 잡습니다. */
function listenerLedger(targets: Array<[string, EventTarget]>) {
  const live = new Map<string, number>();
  const restore: Array<() => void> = [];

  /* ⚠️ **React 자신의 리스너 하나를 이름으로 뺍니다.** `document:selectionchange`는
   * React가 루트마다 붙이는 것이라 훅의 계약이 아니고, 수명도 루트에 매여 있어
   * 언마운트 순서에 따라 장부가 흔들립니다. **종류 화이트리스트로 뭉뚱그리지 않습니다** —
   * 그러면 예상 못 한 종류의 누수까지 같이 가려집니다. 이 하나만 이름으로 뺍니다. */
  const NOT_OURS = new Set(["document:selectionchange"]);

  type Listen = EventTarget["addEventListener"];

  for (const [label, target] of targets) {
    /* ⚠️ **원본 참조를 되돌립니다 — 지우면 안 됩니다.** jsdom에서 `window.addEventListener`는
     * 프로토타입이 아니라 **자기 속성**이라, `delete`하면 그대로 사라져 다음 검사가
     * `undefined.bind`로 죽습니다(실측). 호출은 묶은 사본으로, 되돌리기는 원본 참조로. */
    const rawAdd = target.addEventListener;
    const rawRemove = target.removeEventListener;
    const add = rawAdd.bind(target) as Listen;
    const remove = rawRemove.bind(target) as Listen;
    restore.push(() => { target.addEventListener = rawAdd; target.removeEventListener = rawRemove; });

    const count = (type: string, delta: number) => {
      const key = `${label}:${type}`;
      if (!NOT_OURS.has(key)) live.set(key, (live.get(key) ?? 0) + delta);
    };
    const wrapped: Record<"add" | "remove", Listen> = {
      add: (type, listener, options) => { count(type, +1); add(type, listener, options); },
      remove: (type, listener, options) => { count(type, -1); remove(type, listener, options); },
    };
    target.addEventListener = wrapped.add;
    target.removeEventListener = wrapped.remove;
  }

  return {
    /** 아직 안 뗀 것들. 정렬해 돌려주므로 실패 메시지가 **어느 것이 남았는지** 말합니다. */
    leaked: () => [...live].filter(([, n]) => n > 0).map(([key, n]) => `${key} ×${n}`).sort(),
    /** 붙은 적이 있는 것들 — 전제용. */
    everAdded: () => [...live.keys()].sort(),
    restore: () => restore.forEach((undo) => undo()),
  };
}

function measure(Component: () => null) {
  const viewport = installFakeVisualViewport({ height: 800 });
  const ledger = listenerLedger([["viewport", viewport], ["window", window], ["document", document]]);
  try {
    const view = render(<Component />);
    const added = ledger.everAdded();
    view.unmount();
    return { added, leaked: ledger.leaked() };
  } finally {
    ledger.restore();
  }
}

const BoxProbe = () => { useVisualViewportBox(); return null; };
const KeyboardProbe = () => { useVirtualKeyboard(); return null; };

describe("뷰포트 훅은 붙인 리스너를 다 뗀다", () => {
  /* 전제 — 훅이 애초에 아무것도 안 붙였으면 `leaked()`는 **빈 배열**이라 아래가
   * 공허하게 통과합니다. 이 저장소가 그 모양의 초록으로 값을 치른 적이 있습니다. */
  it("전제: 두 훅이 실제로 리스너를 붙인다", () => {
    expect([measure(BoxProbe).added, measure(KeyboardProbe).added]).toEqual([
      ["viewport:resize", "viewport:scroll", "window:resize"],
      ["document:focusin", "document:focusout", "viewport:resize", "viewport:scroll", "window:resize"],
    ]);
  });

  it("useVisualViewportBox: 언마운트 뒤 남는 것이 없다", () => {
    expect(measure(BoxProbe).leaked).toEqual([]);
  });

  it("useVirtualKeyboard: 언마운트 뒤 남는 것이 없다", () => {
    expect(measure(KeyboardProbe).leaked).toEqual([]);
  });
});

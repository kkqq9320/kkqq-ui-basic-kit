/* 킷 전역 설정 — 3단계는 `hourFormat` 하나뿐입니다.
 *
 * 설계 스펙 §11이 정한 것: 인스턴스 prop이 아니라 **킷 전역 설정**, 기본 `"24"`,
 * 컴포넌트는 **구독해서 읽습니다**. 정하지 않은 것: 어디에 어떤 형식으로 저장하는가 —
 * 지속성은 테마 설정 작업에 입주하기로 했습니다. 그래서 이 모듈은 **인메모리만**
 * 갖고, `localStorage`도 프로바이더도 없습니다.
 *
 * ⚠️ 이 파일은 jsdom을 요구하지 않습니다(모듈이 DOM을 안 만집니다). 환경 주석이 없는
 * 것은 빠뜨린 게 아닙니다. */
import { afterEach, describe, expect, it, vi } from "vitest";

import { getHourFormat, setHourFormat, subscribeHourFormat, getWheelRowsPerSide, setWheelRowsPerSide, subscribeWheelRowsPerSide } from "../src/settings";

// 모듈 스코프 상태와 구독자 집합은 검사 사이에 샙니다. 둘 다 되돌립니다 —
// 구독자를 안 걷으면 뒤 검사의 `setHourFormat`이 앞 검사의 스파이를 부릅니다.
const started: Array<() => void> = [];
const track = (listener: () => void) => { const stop = subscribeHourFormat(listener); started.push(stop); return stop; };

const trackRows = (listener: () => void) => { const stop = subscribeWheelRowsPerSide(listener); started.push(stop); return stop; };

afterEach(() => {
  while (started.length) started.pop()!();
  setHourFormat("24");
  setWheelRowsPerSide(1);
});

describe("hourFormat 전역 설정", () => {
  it("기본값은 24시간제다 — 아무것도 안 하면 지금과 같아야 한다", () => {
    expect(getHourFormat()).toBe("24");
  });

  it("바꾼 값을 읽어 준다", () => {
    setHourFormat("12");
    expect(getHourFormat()).toBe("12");
  });

  it("구독자가 바뀔 때 알림을 받는다", () => {
    const seen = vi.fn();
    track(seen);
    setHourFormat("12");
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("같은 값으로 다시 넣으면 구독자를 안 부른다", () => {
    // `useSyncExternalStore`가 이 구독을 씁니다 — 값이 안 바뀌었는데 알리면
    // 컴포넌트가 이유 없이 다시 그립니다.
    const seen = vi.fn();
    track(seen);
    setHourFormat("24");
    expect(seen).not.toHaveBeenCalled();
  });

  it("해지한 구독자는 더 안 불린다", () => {
    const seen = vi.fn();
    track(seen)();
    setHourFormat("12");
    expect(seen).not.toHaveBeenCalled();
  });

  /* 구독자 하나의 사고가 나머지를 12시간제에 못 따라오게 두면 안 됩니다.
   * ⚠️ 단언 둘을 한 `it`에 두지 않습니다 — 앞의 것이 터지면 뒤의 것은 **실행조차
   * 안 되고**, 그러면 "다른 구독자가 알림을 받았는가"는 검사된 적이 없는 것이 됩니다.
   * 이 저장소가 이미 밟은 함정이라 블록을 쪼갭니다. */
  it("구독자가 던져도 예외가 setHourFormat 밖으로 안 나온다", () => {
    track(() => { throw new Error("구독자 사고"); });
    expect(() => setHourFormat("12")).not.toThrow();
  });

  it("앞 구독자가 던져도 뒤 구독자는 알림을 받는다", () => {
    const other = vi.fn();
    track(() => { throw new Error("구독자 사고"); });
    track(other);
    try { setHourFormat("12"); } catch { /* 위 검사가 따로 봅니다 */ }
    expect(other).toHaveBeenCalledTimes(1);
  });
});

/* 오너 리포트 6번 — 휠에 위아래로 보이는 행 수(2026-08-13 오너 결정).
 * "설정 페이지에 넣고 사용자가 커스터마이징 할 수 있게. **기본은 1. 최대 4개.**"
 *
 * `hourFormat`과 같은 자리에 삽니다 — 한 화면에서 픽커마다 행 수가 다른 것은 설정이
 * 아니라 사고이고, 사용자가 자기 앱 전체에 대해 한 번 고르는 값입니다. */
describe("wheelRowsPerSide 전역 설정", () => {
  it("기본값은 1이다 — 오너 결정", () => {
    expect(getWheelRowsPerSide()).toBe(1);
  });

  it("1부터 4까지 받는다", () => {
    for (const rows of [1, 2, 3, 4] as const) {
      setWheelRowsPerSide(rows);
      expect(getWheelRowsPerSide()).toBe(rows);
    }
  });

  it("구독자가 바뀔 때 알림을 받는다", () => {
    const seen = vi.fn();
    trackRows(seen);
    setWheelRowsPerSide(3);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("같은 값으로 다시 넣으면 구독자를 안 부른다", () => {
    const seen = vi.fn();
    trackRows(seen);
    setWheelRowsPerSide(1);
    expect(seen).not.toHaveBeenCalled();
  });

  it("hourFormat과 서로 간섭하지 않는다 — 구독이 갈라져 있다", () => {
    const rowsSeen = vi.fn();
    const hourSeen = vi.fn();
    trackRows(rowsSeen);
    track(hourSeen);
    setWheelRowsPerSide(4);
    expect(rowsSeen).toHaveBeenCalledTimes(1);
    expect(hourSeen).not.toHaveBeenCalled();
  });
});

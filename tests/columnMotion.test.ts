// @vitest-environment jsdom

/* `src/controls/columnMotion.ts` — **컴포넌트 검사가 못 밟는 자리만** 잽니다.
 *
 * `tests/DateWheelPicker.test.tsx`가 이미 화면에서 재고 있습니다: 커밋이 `moving-*`을
 * 붙이는 것, 방향이 열 자신의 수를 따르는 것, 새 스와이프가 앞선 무장을 비우는 것,
 * 닫았다 열면 남아 있지 않은 것. **그것들을 여기서 다시 재지 않습니다.**
 *
 * 여기서 재는 것은 화면에 흔적이 없는 둘입니다 — `amount`가 0일 때 아무 일도 안 하는 것,
 * 그리고 **바꿀 것이 없으면 리렌더를 만들지 않는 것**(같은 객체를 돌려주는 것). 뒤엣것은
 * 모듈 주석이 명시적으로 약속하는데, 화면만 보면 리렌더가 한 번 더 돌아도 똑같아 보입니다.
 */
import { describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach } from "vitest";
import { useColumnMotions, type ColumnMotion } from "../src/controls/columnMotion";
import { type WheelUnit } from "../src/model/wheelModel";

/** 상태가 여섯 키를 **손으로 나열한** 레코드라, 검사도 여섯을 다 봐야 합니다. */
const UNITS: WheelUnit[] = ["year", "month", "day", "hour", "minute", "second"];
const OTHERS = UNITS.filter((unit) => unit !== "day");
const IDLE: ColumnMotion = { sequence: 0, direction: "next", playing: false };

afterEach(cleanup);

/** 렌더 횟수까지 세는 하네스 — "리렌더를 만들지 않는다"를 재려면 이것이 필요합니다. */
function mount() {
  const counter = { renders: 0 };
  const { result } = renderHook(() => { counter.renders += 1; return useColumnMotions(); });
  return { result, counter };
}

describe("columnMotion", () => {
  it("처음에는 아무 열도 재생 중이 아니다", () => {
    const { result } = mount();
    expect(result.current.of("year")).toEqual({ sequence: 0, direction: "next", playing: false });
  });

  /* 여섯 키가 초기 객체 하나를 **공유**합니다. 제자리 수정이 들어오면 여섯이 한꺼번에
   * 바뀌므로, 그때 조용히 어긋나는 대신 터지게 얼려 뒀습니다. */
  it("초기 객체는 얼어 있다 — 여섯 열이 그것을 공유한다", () => {
    const { result } = mount();
    expect(UNITS.map((unit) => Object.isFrozen(result.current.of(unit)))).toEqual(UNITS.map(() => true));
  });

  it("mark는 sequence를 올리고 재생을 켠다", () => {
    const { result } = mount();
    act(() => { result.current.mark("year", 1); });
    expect(result.current.of("year")).toEqual({ sequence: 1, direction: "next", playing: true });
  });

  it("방향은 부호가 정한다", () => {
    const { result } = mount();
    act(() => { result.current.mark("year", -1); });
    expect(result.current.of("year").direction).toBe("previous");
  });

  /* 🔴 `commitToday`가 `Math.sign(to - from)`을 넘기므로 **안 움직인 열에는 0이 옵니다.**
   * 그때 sequence가 올라가면 값 컨테이너의 key가 바뀌어 **안 움직인 열이 리마운트**됩니다. */
  it("amount가 0이면 아무 일도 안 한다", () => {
    const { result } = mount();
    act(() => { result.current.mark("year", 0); });
    expect(result.current.of("year")).toEqual({ sequence: 0, direction: "next", playing: false });
  });

  it("amount가 0이면 리렌더도 안 만든다", () => {
    const { result, counter } = mount();
    const before = counter.renders;
    act(() => { result.current.mark("year", 0); });
    expect(counter.renders).toBe(before);
  });

  /* ⚠️ **다섯을 다 봅니다.** 하나만 보면 나머지 넷을 건드리는 변이가 통과합니다 —
   * 이 파일의 상태는 여섯 키를 **손으로 나열한** 레코드라 그게 현실적인 결함입니다. */
  it("한 열을 밀어도 나머지 다섯은 손 안 탄다", () => {
    const { result } = mount();
    act(() => { result.current.mark("day", 1); });
    expect(OTHERS.map((unit) => result.current.of(unit))).toEqual(OTHERS.map(() => IDLE));
  });

  it("여러 번 밀면 sequence가 그만큼 올라간다", () => {
    const { result } = mount();
    act(() => { result.current.mark("day", 1); result.current.mark("day", 1); result.current.mark("day", -1); });
    expect(result.current.of("day").sequence).toBe(3);
  });

  /* ⚠️ **clear는 무장만 풉니다.** sequence를 되돌리면 그것도 key 변경이라 리마운트를
   * 일으키고, 그 리마운트가 행 클릭을 죽였던 결함입니다(타입 주석에 측정값이 있습니다). */
  it("clear는 재생만 끄고 sequence는 건드리지 않는다", () => {
    const { result } = mount();
    act(() => { result.current.mark("year", 1); });
    act(() => { result.current.clear("year"); });
    expect(result.current.of("year")).toEqual({ sequence: 1, direction: "next", playing: false });
  });

  it("이미 꺼져 있는 열을 clear하면 리렌더를 만들지 않는다", () => {
    const { result, counter } = mount();
    const before = counter.renders;
    act(() => { result.current.clear("year"); });
    expect(counter.renders).toBe(before);
  });

  /* ⚠️ **여섯을 다 밉니다.** 앞서 year·month만 밀었더니 "hour·minute·second는 안 끈다"는
   * 변이가 통과했습니다 — 시각 열은 날짜 전용 픽커에서 안 그려지므로 화면 검사도 그
   * 자리를 밟지 않습니다. */
  it("stopAll은 재생 중인 열을 전부 끈다 — 여섯 다", () => {
    const { result } = mount();
    act(() => { for (const unit of UNITS) result.current.mark(unit, 1); });
    act(() => { result.current.stopAll(); });
    expect(UNITS.map((unit) => result.current.of(unit).playing)).toEqual(UNITS.map(() => false));
  });

  it("stopAll도 sequence는 건드리지 않는다 — 여섯 다", () => {
    const { result } = mount();
    act(() => { UNITS.forEach((unit, index) => { for (let n = 0; n <= index; n += 1) result.current.mark(unit, 1); }); });
    act(() => { result.current.stopAll(); });
    expect(UNITS.map((unit) => result.current.of(unit).sequence)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("재생 중인 열이 없으면 stopAll은 리렌더를 만들지 않는다", () => {
    const { result, counter } = mount();
    const before = counter.renders;
    act(() => { result.current.stopAll(); });
    expect(counter.renders).toBe(before);
  });

  it("stopAll 뒤에도 방향은 남는다 — 끈 것은 재생뿐이다", () => {
    const { result } = mount();
    act(() => { result.current.mark("year", -1); });
    act(() => { result.current.stopAll(); });
    expect(result.current.of("year").direction).toBe("previous");
  });
});

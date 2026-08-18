/* `src/controls/wheelShift.ts` — 휠의 이동 계산.
 *
 * 🔴 **이 파일이 이 분리의 요점입니다.** 이 계산은 `WheelPicker`(2490줄) 안에 있어서
 * 지금까지 **렌더를 거쳐야만** 검사할 수 있었습니다 — 팝오버를 열고 포인터를 만들고
 * jsdom을 세운 뒤에야 "월을 +2 하면 무슨 값인가"를 물을 수 있었습니다. 이제 세 줄입니다.
 * `controls/selectKeyboard.ts`가 같은 이유로 먼저 나가 있었고, 그 파일 머리말이
 * *"jsdom 없이 테스트되는 것이 이 분리의 요점"* 이라고 적어 둔 그대로입니다.
 */
import { describe, expect, it } from "vitest";

import { shiftedFrom, type WheelShiftContext } from "../src/controls/wheelShift";
import { instantModel } from "../src/model/instant";

const DATE: WheelShiftContext = { model: instantModel, fields: ["year", "month", "day"] };
const ctx = (extra: Partial<WheelShiftContext> = {}): WheelShiftContext => ({ ...DATE, ...extra });

describe("wheelShift: 한 칸", () => {
  it("격자가 없으면 한 단위씩 움직인다", () => {
    expect(shiftedFrom(ctx(), "2026-03-10", "day", 1)).toBe("2026-03-11");
    expect(shiftedFrom(ctx(), "2026-03-10", "month", -1)).toBe("2026-02-10");
  });

  it("경계 밖으로 나가면 null이다 — 호출부가 그걸로 ± 버튼을 비활성화한다", () => {
    expect(shiftedFrom(ctx({ max: "2026-03-10" }), "2026-03-10", "day", 1)).toBeNull();
    // 대조군 — 같은 값에서 반대 방향은 살아 있어야 위 단언이 "늘 null"이 아니다
    expect(shiftedFrom(ctx({ max: "2026-03-10" }), "2026-03-10", "day", -1)).toBe("2026-03-09");
  });
});

describe("wheelShift: 격자가 경계를 건너뛸 때만 걷는다", () => {
  /* 걷기는 **격자점이 경계를 훌쩍 넘어갈 때** 경계 자신을 한 칸으로 쓰기 위한 것입니다.
   *
   * ⚠️ 이 검사를 두 번 틀리게 썼습니다. (1) `10:30`에서 시작 — 다음 격자점 `10:45`가
   * 아직 경계 안이라 클램프 가지를 **안 탑니다**. (2) `10:45`에서 시작 — **분 열은
   * 독립적으로 감깁니다**(45+15 → `10:00`, 시로 안 넘어감). 결국 값을 **먼저 찍어 보고**
   * 그 값으로 단언을 썼습니다. 이 저장소의 규칙 그대로입니다 — 문서에 동작을 적기 전에
   * 그 동작을 실행해 볼 것. */
  const time = (extra: Partial<WheelShiftContext> = {}): WheelShiftContext =>
    ({ model: instantModel, fields: ["hour", "minute"], step: { minute: 15 }, ...extra });

  it("다음 격자점이 경계 안이면 그냥 격자점으로 간다", () => {
    expect(shiftedFrom(time({ max: "10:50" }), "10:30", "minute", 1)).toBe("10:45");
  });

  it("다음 격자점이 경계를 넘으면 경계 자신에서 멈춘다", () => {
    expect(shiftedFrom(time({ max: "10:20" }), "10:15", "minute", 1)).toBe("10:20");
    expect(shiftedFrom(time({ min: "10:10" }), "10:15", "minute", -1)).toBe("10:10");
  });

  it("경계를 이미 한 번 썼으면 더는 못 간다", () => {
    expect(shiftedFrom(time({ max: "10:20" }), "10:20", "minute", 1)).toBeNull();
    // 대조군 — 반대 방향은 살아 있어야 위가 "늘 null"이 아니다
    expect(shiftedFrom(time({ max: "10:20" }), "10:20", "minute", -1)).toBe("10:15");
  });

  it("경계가 없으면 그냥 격자점으로 간다", () => {
    expect(shiftedFrom(time(), "10:30", "minute", 1)).toBe("10:45");
  });

  /* ⚠️ **여기까지가 이 파일이 증명할 수 있는 것입니다.** 소스의 걷기 조건 셋 중
   * *"`min`이나 `max`가 있음"* 은 **성능** 조건입니다 — 경계가 없으면 걷기와 한 번에
   * 세기가 **같은 답**을 내고 비용만 다릅니다(행마다 |amount|번 왕복). 그래서 그 조건을
   * 지워도 위 단언들은 전부 초록입니다(변이로 확인). 값으로는 못 잡는 자리라, 잡은
   * 척하지 않고 여기 적어 둡니다 — 그 근거는 소스 주석의 실측(4행 → 렌더당 60회에서
   * 180회)에 있습니다. */

  /* 🔴 **소스 주석이 못 박아 둔 함정.** `stride === 1`에서 걸으면 동작이 바뀝니다 —
   * 월을 한 번에 +2 하면 `2026-01-31 → 2026-03-31`인데, 한 칸씩 걸으면 중간에 2월
   * 말일로 잘려 `2026-03-28`이 됩니다(일이 연·월에 의존하는 §3.1의 그 자리).
   * 그래서 걷기 조건에 "격자가 1이 아님"이 들어 있습니다. */
  it("격자가 1이면 여러 칸도 한 번에 센다 — 걸으면 말일에서 잘린다", () => {
    expect(shiftedFrom(ctx({ min: "2020-01-01" }), "2026-01-31", "month", 2)).toBe("2026-03-31");
  });

  // 위 단언이 공허하지 않다는 증거 — 실제로 걸으면 나왔을 값을 적어 둡니다.
  it("한 칸씩 걸었다면 나왔을 값은 다르다", () => {
    const once = shiftedFrom(ctx({ min: "2020-01-01" }), "2026-01-31", "month", 1);
    expect(once).toBe("2026-02-28");
    expect(shiftedFrom(ctx({ min: "2020-01-01" }), once!, "month", 1)).toBe("2026-03-28");
  });
});

/// <reference types="vite/client" />

/* **데모 조작판의 축은 실제로 화면을 움직여야 한다.**
 *
 * 오너가 "요약 카드 배치가 이상하다"고 한 화면을 재다가 잡았습니다: **`남는 폭` 버튼
 * 넷(왼쪽·가운데·양끝·오른쪽)이 아무 일도 하지 않았습니다.** 어느 것을 눌러도
 * `:root`의 `--summary-card-justify`가 `"normal"` 그대로였고, 카드 좌표가 1px도
 * 움직이지 않았습니다(실제 크롬 실측).
 *
 * **킷은 멀쩡했습니다** — 토큰을 손으로 `space-between`으로 박으니 마지막 카드가
 * 1184 → **1210**으로 가서 패널 줄 오른쪽 끝과 정확히 맞았습니다. 죽어 있던 것은
 * 데모의 배선입니다: 토큰을 쓰는 이펙트가 본문에서 `justify`를 읽으면서 의존성
 * 배열에는 `axis`만 적고 있었습니다. 그래서 상태만 바뀌고 토큰은 첫 값에 머물렀습니다.
 *
 * **이 축이 죽어 있었다는 것은 오너가 그 동작을 한 번도 못 봤다는 뜻입니다.**
 * 조작판이 거짓말한 사례가 이 저장소에 이미 여럿이라, 회귀를 검사로 막습니다.
 *
 * ⚠️ **이 파일이 못 보는 것:** 소스가 그렇게 쓰여 있다는 것까지입니다. "버튼을 누르면
 * 카드가 실제로 옮겨간다"는 레이아웃이라 jsdom이 못 봅니다 — 그건 실제 크롬 실측이
 * 근거입니다(위 1184 → 1210).
 */
import { describe, expect, it } from "vitest";

import demoSource from "../demo/main.tsx?raw";

/** `from` 이후 첫 `}, [ … ]);`의 의존성 목록. 문자열로 정규식을 조립하지 않으려고
 *  **인덱스로 자릅니다**(이 저장소가 세 번 밟은 이스케이프 함정). */
const dependenciesAfter = (source: string, from: number) => {
  const open = source.indexOf("}, [", from);
  expect(open).toBeGreaterThan(-1);
  const close = source.indexOf("]", open + 4);
  expect(close).toBeGreaterThan(open);
  return source
    .slice(open + 4, close)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
};

describe("데모 조작판 — 축이 죽어 있지 않다", () => {
  /* 이 앵커가 안 잡히면 아래 판정이 통째로 무의미해집니다. 먼저 못박습니다. */
  it("justify 토큰을 쓰는 자리를 찾을 수 있다", () => {
    expect(demoSource.indexOf('"--summary-card-justify"')).toBeGreaterThan(-1);
  });

  /* ⚠️ 이것이 실제 결함이었습니다. 본문이 `justify`를 읽는데 의존성에 없으면
   * 버튼이 상태만 바꾸고 토큰은 첫 값에 영원히 머뭅니다. */
  it("justify 토큰을 쓰는 이펙트가 justify를 의존성에 적는다", () => {
    const at = demoSource.indexOf('"--summary-card-justify"');

    expect(dependenciesAfter(demoSource, at)).toContain("justify");
  });

  /* 같은 이펙트가 `axis`도 읽습니다 — 한쪽을 고치다 다른 쪽을 떨어뜨리는 것을 막습니다. */
  it("그 이펙트가 axis도 의존성에 적는다", () => {
    const at = demoSource.indexOf('"--summary-card-justify"');

    expect(dependenciesAfter(demoSource, at)).toContain("axis");
  });

});

/* 조작판을 접으면 **재는 일을 멈춥니다** — 접힌 표는 아무도 안 보는데, 400ms마다 옛 규칙을
 * 얹었다 걷는 일은 공짜가 아닙니다(PR #29에서 스크롤 위치를 파괴한 것이 바로 그 주입입니다).
 *
 * ⚠️ **토큰을 넣는 이펙트가 아니라 재는 이펙트만** 멈춥니다. 접었다고 `--*-min`이 풀리면
 * 조작판을 치우는 것만으로 화면이 바뀌어, 무엇을 보고 있었는지 알 수 없게 됩니다.
 * 그래서 앵커도 `justify` 토큰이 아니라 **측정 주기**를 잡습니다. */
describe("데모 조작판 — 접으면 재기를 멈춘다", () => {
  const MEASURE_ANCHOR = "window.setInterval(measure, 400)";

  it("측정 주기를 거는 자리를 찾을 수 있다", () => {
    expect(demoSource.indexOf(MEASURE_ANCHOR)).toBeGreaterThan(-1);
  });

  /* 본문이 `open`을 읽는데 의존성에 없으면, 접었다 폈을 때 이펙트가 다시 안 돌아
   * **표가 영원히 `…`에 머뭅니다** — 이 파일이 이미 한 번 잡은 결함과 같은 모양입니다. */
  it("재는 이펙트가 open을 의존성에 적는다", () => {
    const at = demoSource.indexOf(MEASURE_ANCHOR);

    expect(dependenciesAfter(demoSource, at)).toContain("open");
  });
});

/* 3단계 — `hourFormat` 토글(설계 스펙 §7·§11).
 *
 * 이 축이 죽는 방식은 위 `justify` 사고와 **모양이 다릅니다.** 여기서 나올 결함은
 * 의존성 배열이 아니라 **상태를 어디에 두었나**입니다: 데모가 `useState`로 형식을
 * 들고 자기 버튼 글자만 바꾸면, 화면의 시각 픽커 셋은 24시간제 그대로인데 조작판은
 * "12시간제"라고 말합니다 — 조작판이 화면과 다른 말을 하는, 이 저장소의 단골 결함
 * 그대로입니다. 값은 킷 안에 있고(전역 설정), 데모는 **구독해서** 읽어야 합니다.
 *
 * ⚠️ **이 파일이 못 보는 것:** 소스가 그렇게 쓰여 있다는 것까지입니다. "버튼을 누르면
 * 세 픽커가 전부 바뀐다"는 실제 렌더라 여기서는 못 봅니다 — 그건
 * tests/DateWheelPicker.test.tsx의 "마운트한 뒤 설정을 바꾸면 이미 떠 있는 픽커가
 * 따라 바뀐다"가 컴포넌트 쪽에서 잡습니다. */
describe("데모 조작판 — 12시간제 토글이 킷 전역 설정을 쓴다", () => {
  it("킷의 설정 API 셋을 가져온다", () => {
    expect(demoSource).toContain("getHourFormat");
    expect(demoSource).toContain("setHourFormat");
    expect(demoSource).toContain("subscribeHourFormat");
  });

  it("형식을 구독해서 읽는다 — 데모가 자기 상태로 흉내 내지 않는다", () => {
    expect(demoSource).toContain("useSyncExternalStore(subscribeHourFormat");
  });

  it("데모에 hourFormat을 담는 useState가 없다", () => {
    // 있으면 두 개의 진실이 생기고, 둘이 갈라지는 순간 조작판이 거짓말을 시작합니다.
    const localState = demoSource.split("\n").filter((line) => line.includes("useState") && line.toLowerCase().includes("hourformat"));
    expect(localState).toEqual([]);
  });

  it("토글이 setHourFormat을 실제로 부른다", () => {
    expect(demoSource).toContain("onClick={() => setHourFormat(");
  });
});

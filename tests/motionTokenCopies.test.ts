/// <reference types="vite/client" />

/* **키보드 보정이 손으로 베껴 든 모션 값 둘이 `tokens.css`와 갈라지면 안 된다.**
 *
 * `scrollTop`은 CSS로 트랜지션되지 않아서, 키보드 보정 스크롤은 킷이 rAF로 직접 굴립니다.
 * 그 곡선과 길이는 CSS 쪽 트랜지션과 **같아야** 합니다 — 같은 화면에서 하나는 CSS가,
 * 하나는 JS가 움직이는데 둘의 리듬이 다르면 "뚝뚝 끊긴다"로 보입니다(owner 리포트가 그
 * 자리였습니다). 그래서 400ms와 `cubic-bezier(.32,.72,0,1)`이 **`tokens.css`와 `browser/keyboardCompensation.ts`
 * 두 곳에** 삽니다.
 *
 * 지금 두 값은 일치합니다 — 이 파일은 결함을 고치는 게 아니라 **갈라짐을 막습니다.**
 * 원 리뷰(REVIEW-01ddbb6..004aea6.md)가 "묶는 것이 주석뿐"이라고 지목했고, 이 저장소가
 * 여러 번 확인한 결론은 **수치는 주석이 아니라 단언에 둔다**는 것입니다.
 *
 * ⚠️ 정규식을 문자열로 조립하지 않습니다(이 저장소가 세 번 밟은 이스케이프 함정).
 */
import { describe, expect, it } from "vitest";

import keyboardSource from "../src/browser/keyboardCompensation.ts?raw";
import tokensCssSource from "../css/tokens.css?raw";

/** `--motion-reposition: 400ms;` 의 밀리초. 주석 안의 숫자에 안 걸리게 **선언 형태만** 잡습니다. */
const tokenDuration = () => Number(/^\s*--motion-reposition:\s*(\d+)ms;/m.exec(tokensCssSource)?.[1]);

/** `--sidebar-ease: cubic-bezier(.32, .72, 0, 1);` 의 네 수. */
const tokenEasing = () =>
  /^\s*--sidebar-ease:\s*cubic-bezier\(([^)]+)\);/m
    .exec(tokensCssSource)?.[1]
    .split(",")
    .map((part) => Number(part.trim()));

/** `const KEYBOARD_SCROLL_ANIMATION_MS = 400;` */
const sourceDuration = () => Number(/const KEYBOARD_SCROLL_ANIMATION_MS = (\d+);/.exec(keyboardSource)?.[1]);

/** `createCubicBezierEasing(0.32, 0.72, 0, 1)` — **숫자로 부르는 호출**의 인자 넷.
 *
 * ⚠️ `\(([^)]+)\)`로 느슨하게 잡으면 같은 이름의 **함수 정의**가 먼저 걸려 인자 이름
 * (`x1: number, …`)을 숫자로 바꾸다 `NaN` 넷이 나옵니다(실측). 그리고 아래 전제 검사가
 * 개수만 보고 있었던 탓에 **그 NaN 넷이 전제를 통과했습니다** — 전제는 "몇 개냐"가 아니라
 * "쓸 수 있는 값이냐"를 물어야 합니다. */
const sourceEasing = () =>
  /createCubicBezierEasing\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/
    .exec(keyboardSource)
    ?.slice(1, 5)
    .map(Number);

describe("키보드 보정이 베낀 모션 값은 tokens.css와 같다", () => {
  /* 전제 확인 넷 — 정규식이 하나라도 못 잡으면 아래 비교가 `NaN === NaN`이나
   * `undefined === undefined`가 되어 **공허하게 통과**합니다. 이 저장소가
   * "빈 입력으로 만족되는 단언은 테스트가 아니다"로 여러 번 값을 치른 자리입니다. */
  it("토큰에서 길이를 뽑아냈다", () => {
    expect(tokenDuration()).toBeGreaterThan(0);
  });

  it("소스에서 길이를 뽑아냈다", () => {
    expect(sourceDuration()).toBeGreaterThan(0);
  });

  /* **개수가 아니라 "쓸 수 있는 수인가"를 묻습니다.** 처음엔 `toHaveLength(4)`로 썼다가
   * `NaN` 넷이 그대로 통과하는 것을 봤습니다 — 앵커가 함수 정의를 잡고 있었는데도
   * 전제가 초록이었습니다. */
  it("토큰에서 곡선 네 수를 뽑아냈다", () => {
    expect(tokenEasing()?.every(Number.isFinite) && tokenEasing()?.length === 4).toBe(true);
  });

  it("소스에서 곡선 네 수를 뽑아냈다", () => {
    expect(sourceEasing()?.every(Number.isFinite) && sourceEasing()?.length === 4).toBe(true);
  });

  it("길이가 같다", () => {
    expect(sourceDuration()).toBe(tokenDuration());
  });

  /* `.32`와 `0.32`는 같은 수입니다 — 문자열이 아니라 **수로** 비교합니다. 문자열로 비교하면
   * 표기만 바꿔도 빨개져서, 아무것도 안 바뀐 커밋이 이 검사를 밟습니다. */
  it("곡선이 같다", () => {
    expect(sourceEasing()).toEqual(tokenEasing());
  });
});

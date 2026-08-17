/* `src/browser/pointerButton.ts` — 포인터 버튼 번호 판정.
 *
 * `tests/positioning.test.tsx`에서 그대로 옮겨 왔습니다(PRINCIPLES §15 규칙 4로 함수가
 * 옮겨 갔으므로). jsdom이 필요 없습니다 — 순수 함수라 그 자체가 이 분리의 값입니다.
 */
import { describe, expect, it } from "vitest";

import { isPrimaryButton } from "../src/browser/pointerButton";

describe("isPrimaryButton", () => {
  it("주 버튼과 button 미지정은 참이다", () => {
    expect([isPrimaryButton({ button: 0 }), isPrimaryButton({})]).toEqual([true, true]);
  });

  // 가운데·오른쪽·뒤로·앞으로는 닫기 제스처가 아니다. 뒤로 버튼이 걸리면 팝업이 먼저
  // 닫히며 history 표식을 써버려 브라우저의 뒤로가기가 페이지를 나간다(소스 주석).
  it("가운데·오른쪽·뒤로·앞으로 버튼은 거짓이다", () => {
    expect([1, 2, 3, 4].map((button) => isPrimaryButton({ button }))).toEqual([false, false, false, false]);
  });

  // ⚠️ **characterization.** `-1`(눌림 없음)도 참을 돌려준다 — `<= 0`이라서다.
  // 지금 호출부가 pointerdown/mousedown뿐이라 실제로 도달하지 않지만, 계약이 아니라
  // 구현의 부수 결과이므로 여기 적어 둔다. 바꾸려면 이 테스트를 먼저 뒤집을 것.
  it("button -1(눌림 없음)도 참이다 — 의도가 아니라 <= 0의 부수 결과다", () => {
    expect(isPrimaryButton({ button: -1 })).toBe(true);
  });
});

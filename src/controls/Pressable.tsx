/* 킷의 모든 `<button>`이 지나가는 자리 — **옷은 없고 보장만 있습니다.**
 *
 * 🔴 **왜 필요한가.** 킷에는 손으로 그린 `<button>`이 25개 있었고, 같은 것을 **각자
 * 정하고** 있었습니다. 재 보니 그중 넷은 `type`을 아예 안 적고 있었는데(폼 안에서
 * `<button>`의 기본값은 `submit`입니다) 그 넷이 드롭다운 트리거와 휠 트리거였습니다 —
 * 폼 안에 놓이면 값을 고르는 순간 폼이 날아갑니다.
 *
 * 손으로 붙이는 한 계속 빠집니다. 그래서 자리를 하나로 모읍니다.
 * `tests/pressable.test.tsx`가 **`src/`의 모든 `<button>`이 여기를 지나가는지**를 셉니다.
 *
 * ## 옷을 안 입히는 이유
 *
 * 킷의 버튼은 문맥마다 기하가 다릅니다 — 액션 버튼(38/32px) · 탭(밑줄) · 세그먼트 칸 ·
 * 사이드바 nav · 아이콘 버튼 다섯 종. 여기서 클래스를 하나라도 붙이면 그 전부에
 * 딸려 갑니다. **`Button` 라운드에서 정확히 그 사고를 냈습니다**(base 기하를 공유했더니
 * 글자 버튼이 굵기 400→700, 높이 23→21px로 끌려갔습니다). 옷은 각자, 보장은 여기.
 *
 * ## 여기 들어올 것과 안 들어올 것
 *
 * 🟢 **들어올 것:** 백로그 9번(눌림 피드백)이 **JS로** 풀려야 하는 부분. 휠 픽커의
 * `tapActivation`(브라우저가 click을 안 만들 때 대신 확정)이 지금 그 파일에만 있는데,
 * 그것이 여기 올라올 첫 후보입니다.
 *
 * 🔴 **안 들어올 것: `-webkit-tap-highlight-color`.** 그건 CSS로 풀어야 합니다 —
 * 사이드바 nav는 `href`가 있으면 `<a>`라 이 컴포넌트가 못 덮습니다. 그리고 **지금 끄면
 * 안 됩니다**: 브라우저 기본 하이라이트를 끄고 우리 표시를 안 그리면 눌림 피드백이
 * 통째로 사라집니다. 무엇을 그릴지가 백로그 9번의 결정입니다.
 */
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

export type PressableProps = {
  className?: string;
  children?: ReactNode;
  /**
   * `ref` 대신 이름 붙인 prop입니다 — 킷의 관습이고(`MobilePageTabs`의 `floatRef`),
   * 함수 컴포넌트의 `ref`-as-prop은 **React 19 전용**인데 이 킷의 peer는 `>=18`입니다.
   * `Button`에서 그 문을 열었다가 CI의 React 18 잡이 잡았습니다.
   */
  buttonRef?: Ref<HTMLButtonElement>;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

/**
 * ⚠️ **배럴로 안 내보냅니다.** 지금은 킷 내부의 보장 자리이고, 앱이 필요로 하는 것은
 * 옷을 입은 `Button`입니다. 추측으로 공개 계약을 넓히지 않습니다 — 실제로 앱이 자기
 * 탭 바를 만들면서 이것을 찾을 때 그때 엽니다.
 */
export function Pressable({ type = "button", buttonRef, ...rest }: PressableProps) {
  return <button type={type} ref={buttonRef} {...rest} />;
}

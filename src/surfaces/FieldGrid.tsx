import type { ReactNode } from "react";

import { trackStyle, type GridJustify } from "./gridTracks";

/**
 * 입력 필드 격자 컴포넌트 — 원본: frontend/src/components/PageChrome.tsx
 * 필요한 CSS: tokens.css, page.css
 */

/**
 * 패널 **안쪽**에서 입력 필드를 여러 열로 놓습니다. 들어가는 만큼 열이 생기고,
 * 좁아지면 한 열로 쌓입니다(`--field-min`).
 *
 * **이게 없어서 앱은 패널 안을 한 열로만 쓸 수 있었습니다.** 데모는 자기 CSS
 * (`demo/demo.css`의 `.demo-grid`)로 흉내 내고 있었는데, 그건 배포물에 없어서
 * 소비 앱이 쓸 수가 없었습니다 — **데모에만 있는 레이아웃은 킷의 기능이 아닙니다.**
 *
 * `PanelGrid`와 같은 이유로 `auto-fit`입니다: 폼의 필드는 앱이 넣은 **명시적 목록**이라
 * 남는 폭을 비워 두면 줄 한쪽이 그냥 빕니다.
 *
 * **`min`으로 이 자리만 다르게 정할 수 있습니다.** 토큰(`--field-min`)은 앱 전체의
 * 기본값이고, `min`은 그 한 통에만 걸립니다 — 한 화면 안에서도 "여기는 넓게 두 열,
 * 저기는 촘촘히 네 열"이 갈릴 수 있어야 하기 때문입니다.
 *
 * ```tsx
 * <Panel title="항목">
 *   <FieldGrid min="320px">
 *     <label>이름<input /></label>
 *     <label>통화<Select … /></label>
 *   </FieldGrid>
 * </Panel>
 * ```
 */
export function FieldGrid({ children, min, max, justify, className = "" }: { children: ReactNode; min?: string; max?: string; justify?: GridJustify; className?: string }) {
  return <div className={`field-grid ${className}`.trim()} style={trackStyle("--field", min, max, justify)}>{children}</div>;
}

/* 액션 버튼 — 킷의 유일한 버튼 컴포넌트.
 * 필요한 CSS: tokens.css, controls.css
 *
 * **이 컴포넌트는 옷을 만들지 않습니다.** 옷은 `css/controls.css`에 있고, 여기서 하는
 * 일은 그 옷에 닿는 표시(`.action-button` + `data-variant`)를 붙이는 것과, 손으로
 * 붙일 때 계속 틀리던 것 둘을 기본값으로 못 박는 것입니다:
 *
 *   1. `type="button"` — 킷 안에서만 **열일곱 곳**이 빠져 있었습니다. 폼 안에서
 *      `<button>`의 기본값은 `submit`이라, 취소 버튼이 폼을 보내는 종류의 사고입니다.
 *   2. `className`은 **덮지 않고 합칩니다** — 앱이 자기 클래스를 얹어도 킷 옷이 남습니다
 *      (§14, `tests/classNameContract.test.ts`가 전 컴포넌트에 요구하는 계약).
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** §2의 두 높이 계층. 생략하면 문맥이 정합니다 — 다이얼로그·팝오버 안이면 32px입니다. */
export type ButtonSize = "action" | "compact";

/**
 * 🔴 **한 축에 값 하나입니다**(PRINCIPLES §16). 클래스 나열이던 시절에는
 * `class="primary danger"`가 표현 가능했고, 실제로 그 유연함이 결함을 냈습니다 —
 * 행이 자식 버튼을 대신 칠하면서 삭제 버튼이 위험 색을 잃었습니다.
 *
 * `text`는 나머지 셋과 **모양의 종류가 다릅니다** — 높이 계층 밖이고 글줄 안에 섭니다.
 * 그래서 CSS에서도 칩 기하 묶음에 안 들어가 있습니다.
 */
export type ButtonVariant = "primary" | "secondary" | "danger" | "text";

export type ButtonProps = {
  /** 생략하면 `secondary` — 테두리만 있는 보통 버튼입니다. */
  variant?: ButtonVariant;
  /** 생략하면 문맥이 정합니다(§2). 다이얼로그·휠 팝오버 안은 32px입니다. */
  size?: ButtonSize;
  className?: string;
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

/**
 * ⚠️ **아이콘 전용 버튼은 여기 없습니다.** 재 보니 킷의 아이콘 버튼은 한 물건이 아니라
 * 기하가 다섯으로 갈립니다(38×38 `.page-action-button` · 32×32 `.theme-color-icon-button` ·
 * 28×32 `.sidebar-icon-button` · 28×28 `.sidebar-collapse-button` · 100%×30 `.wheel-step`).
 * 전부 문맥에 매여 있고 색 토큰도 다릅니다 — 하나의 `iconOnly` prop으로 덮으면 계약이
 * 다섯 배로 넓어집니다. **추측으로 넓히지 않습니다**(이 저장소가 두 번 되돌린 자리).
 *
 * ⚠️ `<a>`를 버튼 모양으로 쓰는 `href` 갈래도 일부러 없습니다. 옛 `.link-button`이 그
 * 용도였는데 킷 안에서 **아무도 안 썼습니다**(src 0 · 데모 0 · 문서 0). 필요해지면
 * 그때 실제 쓰임을 보고 엽니다.
 */
export function Button({ variant = "secondary", size, className = "", type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={`action-button ${className}`.trim()} data-variant={variant} data-size={size} {...rest} />;
}

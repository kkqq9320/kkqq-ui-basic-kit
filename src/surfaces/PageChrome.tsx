/* 페이지 뼈대 컴포넌트 — 원본: frontend/src/components/PageChrome.tsx
 * 필요한 CSS: tokens.css, page.css
 */
import { useEffect, useRef, type ReactNode, type CSSProperties} from "react";

import { isPrimaryButton } from "../browser/pointerButton";

/**
 * 앱 셸 콘텐츠 페이지의 첫 요소(PRINCIPLES §7). 세 줄이 각각 최소 높이를 예약하므로
 * 페이지를 옮겨도 제목 위치가 흔들리지 않습니다. eyebrow·제목은 페이지 앵커라
 * 필수이고, description은 값이 없어도 자리는 유지합니다. 제목이 없는 표면이라면
 * 이 컴포넌트가 아니라 Panel이나 Dialog를 쓰세요.
 */
export function PageHeader({ eyebrow, title, description , className = "" }: { eyebrow: ReactNode; title: ReactNode; description?: ReactNode ; className?: string }) {
  return <header className={`page-header ${className}`.trim()}><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></header>;
}

/**
 * §7 배치 스택에서 탭 **아래**, 첫 콘텐츠 카드 **위**에 서는 섹션 제목.
 * `PageHeader`와 같은 규칙입니다 — 설명은 optional이지만 자리는 예약합니다(19px 3줄,
 * 최소 57px). 그래서 탭마다 설명 길이가 달라도 첫 카드가 같은 세로 좌표에서 시작합니다.
 *
 * `SectionTabs.tsx`에 있던 것을 옮겼습니다(§15 규칙 4) — **이것은 탭이 아닙니다.**
 * §7이 적어 둔 스택(`PageHeader` → 탭 → `SectionHeading` → `Panel`)에서 이 컴포넌트의
 * 이웃은 탭이 아니라 이 파일의 나머지입니다.
 */
export function SectionHeading({ title, description, className = "" }: { title: ReactNode; description?: ReactNode; className?: string }) {
  return <div className={`settings-section-heading ${className}`.trim()}><h2>{title}</h2><p>{description}</p></div>;
}

/**
 * 통 하나에만 걸리는 트랙 크기. `min`은 "언제 열이 줄어드는가", `max`는 "얼마나 커질 수
 * 있는가"입니다.
 *
 * ⚠️ **`min`만으로는 칸을 줄일 수 없습니다.** 위쪽이 `1fr`이면 트랙이 남는 폭을 나눠
 * 가지므로, 항목이 적을수록 오히려 커집니다 — 2560에서 패널 둘이 `min`을 200으로 내려도
 * 1077px씩 먹었습니다. 줄이려면 `max`를 주세요. 안 주면 지금까지와 같습니다.
 */
function trackStyle(token: string, min?: string, max?: string, justify?: GridJustify): CSSProperties | undefined {
  if (!min && !max && !justify) return undefined;
  return {
    ...(min ? { [`${token}-min`]: min } : {}),
    ...(max ? { [`${token}-max`]: max } : {}),
    ...(justify ? { [`${token}-justify`]: justify } : {}),
  } as CSSProperties;
}

/**
 * `max`를 주면 트랙이 줄어들고 **남는 폭이 생깁니다.** 그 폭을 줄 어디에 둘지입니다.
 *
 * ⚠️ **`auto-fit`은 항목 수보다 많은 칸을 보여 주지 않습니다.** 패널이 둘이면 아무리 넓은
 * 화면에서도 두 칸이고, `max`는 칸을 늘리는 것이 아니라 **줄이고 남긴** 것입니다
 * (실측 2560: `400px 400px 0px 0px 0px`). 칸을 더 원하면 항목을 더 넣어야 합니다.
 */
export type GridJustify = "normal" | "start" | "center" | "end" | "space-between" | "space-around";

/* **손잡이가 두 갈래인 이유.** 자주 쓰는 것(`min`·`max`·`justify`)은 prop과 토큰으로
 * 열어 두고, 나머지는 `className`으로 앱이 직접 겁니다. 이 그리드들에 `className`이 없던
 * 동안에는 **컨테이너 속성을 앱이 손댈 방법이 아예 없어서**, 필요한 속성이 생길 때마다
 * 킷에 prop을 하나씩 더하는 왕복이 났습니다(min → max → justify로 세 번). `align-items`·
 * `gap`·`grid-auto-flow`처럼 이름이 끝없는 것들은 그 방식으로 못 따라갑니다.
 *
 * ```tsx
 * <PanelGrid className="dense">…</PanelGrid>
 * ```
 * ```css
 * .dense { gap: 8px; align-items: stretch; grid-auto-flow: dense; }
 * ``` */

/**
 * `min`은 이 그리드 **하나에만** 걸립니다 — 전역 토큰(`--summary-card-min`)보다 우선합니다.
 * 토큰이 커스텀 프로퍼티라 상속되므로, 조상 어디에 걸어도 그 아래만 바뀝니다.
 * 이 prop은 그 흔한 경우에 CSS를 안 쓰게 해 주는 지름길입니다.
 */
export function SummaryGrid({ children, min, max, justify, className = "" }: { children: ReactNode; min?: string; max?: string; justify?: GridJustify; className?: string }) {
  return <div className={`summary-grid ${className}`.trim()} style={trackStyle("--summary-card", min, max, justify)}>{children}</div>;
}

/**
 * tone: "plain" | "teal" | "green" | "orange"
 *
 * **`className`은 카드 하나만 다르게 할 때 씁니다.** 토큰은 그리드의 **트랙**을 정하므로
 * 카드마다 다른 폭을 줄 수 없습니다 — 트랙은 모두 같은 크기입니다. 한 장만 넓히려면
 * 그 카드가 트랙을 **두 칸 차지**하게 하세요:
 *
 * ```tsx
 * <SummaryCard className="wide" label="합계" value="…" />
 * ```
 * ```css
 * .wide { grid-column: span 2; }
 * ```
 *
 * ⚠️ 트랙 수보다 큰 span은 좁은 화면에서 넘칩니다. `span 2`를 쓸 거면 한 열이 되는
 * 폭에서 `grid-column: auto`로 되돌리는 미디어 쿼리를 같이 두세요.
 */
export function SummaryCard({ label, value, tone = "plain", className = "" }: { label: ReactNode; value: ReactNode; tone?: "plain" | "teal" | "green" | "orange"; className?: string }) {
  return <article className={`summary-card ${tone} ${className}`.trim()}><span>{label}</span><strong>{value}</strong></article>;
}

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

/**
 * 패널 여럿을 **가로로 나란히** 놓습니다. 넓은 화면에서만 갈라지고, 좁아지면 알아서
 * 세로로 쌓입니다(`--panel-min`보다 좁으면 한 열).
 *
 * **어느 패널이 같이 서는지는 앱이 정합니다 — 킷은 통만 줍니다.** 높이가 다른 패널을
 * 나란히 놓으면 짧은 쪽 아래가 비는데, 그게 괜찮은 조합인지는 내용을 아는 쪽만 알 수
 * 있습니다. CSS masonry는 아직 쓸 수 없습니다.
 *
 * ⚠️ **여기는 `auto-fit`입니다. `.summary-grid`의 `auto-fill`과 일부러 다릅니다.**
 * 요약 카드는 **개수가 늘어나는 집합**이라 카드가 제 폭을 지키고 빈 트랙을 남기는 쪽이
 * 맞습니다. 패널은 앱이 "이 둘은 같이 선다"고 **명시한 그룹**이라, 남는 폭을 비워 두면
 * 화면 한쪽이 통째로 빕니다 — 오너가 정확히 그 모습을 기각했습니다(캡 안). 그래서
 * 빈 트랙을 접어 그룹이 줄을 다 쓰게 합니다.
 *
 * **`stretch`를 켜면 한 줄의 패널이 같은 높이가 됩니다.** 기본은 자연 높이라 짧은 패널
 * 아래가 비는데, 그 빈 자리를 **패널 안쪽으로** 옮기는 선택입니다. 어느 쪽이 나은지는
 * 내용에 달렸습니다 — 카드처럼 아래 끝이 맞아야 보기 좋은 조합이면 켜고, 내용 길이가
 * 제각각이면 끄는 편이 낫습니다(켜면 짧은 패널 안에 큰 여백이 생깁니다).
 * 더 세밀하게 잡으려면 `Panel`의 `className`으로 높이를 직접 주세요.
 *
 * **`min`으로 이 자리만 다르게 정할 수 있습니다** — 전역 토큰보다 우선합니다.
 * 좁은 화면부터 갈라도 되는 짧은 패널 쌍과, 넓어야만 갈라지는 표 패널을 한 화면에서
 * 다르게 둘 수 있습니다.
 *
 * ```tsx
 * <PanelGrid min="480px">
 *   <Panel title="드롭다운">…</Panel>
 *   <Panel title="날짜 피커">…</Panel>
 * </PanelGrid>
 * ```
 */
export function PanelGrid({ children, min, max, justify, stretch = false, className = "" }: { children: ReactNode; min?: string; max?: string; justify?: GridJustify; stretch?: boolean; className?: string }) {
  return <div className={`panel-grid ${stretch ? "stretch" : ""} ${className}`.replace(/ +/g, " ").trim()} style={trackStyle("--panel", min, max, justify)}>{children}</div>;
}

/**
 * 기본은 작업 영역 전체 폭입니다.
 *
 * ⚠️ 여기 한동안 "**더 좁은 컨테이너를 만들지 마세요**"라고 적혀 있었습니다. 그 문장은
 * "본문 안에 임의의 좁은 상자를 끼워 넣지 마라"는 뜻이었는데, 2560 화면에서 패널이
 * 2102px 전폭으로만 쌓이는 결과를 낳았습니다(메모 칸 하나가 2056px). 나란히 놓고 싶으면
 * 위 `PanelGrid`로 묶으세요 — **금지는 "임의로 좁히지 마라"이지 "가로로 놓지 마라"가
 * 아닙니다.**
 *
 * `className`은 앱이 이 패널 하나에 무언가를 걸어야 할 때의 출구입니다(높이 고정,
 * 내용이 넘칠 때의 스크롤 등). **이게 없어서 앱은 패널에 높이조차 줄 수 없었습니다** —
 * `Select`가 진작부터 받고 있던 것과 같은 prop입니다.
 */
export function Panel({ title, hint, actions, className = "", children }: { title?: ReactNode; hint?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`panel ${className}`.trim()}>
    {(title || hint || actions) && <div className="panel-heading"><div>{hint && <small>{hint}</small>}{title && <h2>{title}</h2>}</div>{actions}</div>}
    {children}
  </section>;
}

/**
 * 클릭으로 여는 정보 디스클로저. 바깥 클릭·포커스 이탈·Escape로 닫힙니다.
 * 내용에 .glass-popover를 붙이면 드롭다운과 같은 표면을 씁니다.
 */
export function DismissibleDetails({ className, summary, summaryAriaLabel, summaryTitle, children }: { className: string; summary: ReactNode; summaryAriaLabel?: string; summaryTitle?: string; children: ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: Event) => {
      // 마우스 뒤로/앞으로 버튼은 닫기가 아닙니다 (focusin에는 button이 없으므로 통과)
      if ("button" in event && !isPrimaryButton(event as PointerEvent)) return;
      const target = event.target;
      if (detailsRef.current?.open && target instanceof Node && !detailsRef.current.contains(target)) detailsRef.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && detailsRef.current?.open) detailsRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("focusin", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("focusin", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  return <details className={className} ref={detailsRef}><summary aria-label={summaryAriaLabel} title={summaryTitle}>{summary}</summary>{children}</details>;
}

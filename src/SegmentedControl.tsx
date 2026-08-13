/* 값 하나를 몇 개 중에서 고르는 묶음 — 세그먼트 컨트롤.
 *
 * 🔴 **왜 이제야 생겼는가.** 오너 질문(2026-08-13): "이 세그먼트나 버튼은 어디다 만드는
 * 거야? wheelpicker랑 다른 데 아니야? 이건 왜 모듈화 안 돼 있는 것 같지?" — 맞는
 * 지적이었습니다. 킷에 이 컴포넌트가 **없어서** 데모가
 * `<button className="secondary-button" aria-pressed>`로 손으로 그리고 있었고,
 * 그게 눌림/포커스 겹침의 뿌리이기도 했습니다. **규칙이 없으면 소비자마다 다시 그리고,
 * 그때 기존 상태와 부딪힙니다.**
 *
 * **접근성은 라디오 그룹입니다.** 여럿 중 하나를 고르는 것이므로 `radiogroup` + `radio`
 * 이고, `aria-pressed` 토글 여럿으로 두면 스크린리더에 "누른 버튼 넷"으로 읽혀 **몇 중
 * 몇인지**가 사라집니다. 탭 정거장은 묶음 하나(roving tabindex)이고 화살표로 옮깁니다 —
 * 넷을 다 Tab으로 지나가게 두면 설정 화면 하나에서 Tab을 열 번 넘게 눌러야 하고, 이
 * 저장소는 휠의 행에서 이미 같은 이유로 같은 선택을 했습니다.
 *
 * **킷은 기계이고 값은 앱이 가집니다**(PRINCIPLES §14) — controlled입니다.
 */
import type { ReactNode } from "react";

export type SegmentedOption<T extends string> = {
  value: T;
  /** 칸에 그리는 것. 글자면 그것이 곧 접근성 이름입니다. */
  label: ReactNode;
  disabled?: boolean;
};

export type SegmentedControlProps<T extends string> = {
  /** 묶음 자체의 이름. **필수입니다** — 라디오 그룹은 "무엇을 고르는 묶음인가"가 없으면
   *  스크린리더에서 뜻이 사라지고, 한 화면에 묶음이 둘 이상이면 서로 구별되지 않습니다.
   *  (이 저장소 규칙: 그려지거나 충돌할 수 있는 이름만 필수 — 여기는 충돌합니다.) */
  ariaLabel: string;
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (next: T) => void;
  className?: string;
};

export function SegmentedControl<T extends string>({ ariaLabel, value, options, onChange, className }: SegmentedControlProps<T>) {
  /** 고를 수 있는 칸만. 화살표는 `disabled`를 **건너뜁니다** — 멈춰 서면 사용자가 키보드로
   *  그 뒤를 영영 못 갑니다. */
  const selectable = options.filter((option) => !option.disabled);

  function move(step: number) {
    if (selectable.length === 0) return;
    const at = selectable.findIndex((option) => option.value === value);
    // 못 찾으면(-1) 첫 칸에서 시작합니다 — 소비자가 목록 밖의 값을 들고 있을 수 있습니다.
    const next = at < 0 ? 0 : (at + step + selectable.length) % selectable.length;
    if (selectable[next].value !== value) onChange(selectable[next].value);
  }

  function pick(next: T) {
    // 같은 값을 다시 고르면 알리지 않습니다 — 안 바뀐 값을 보내면 소비자의 dirty 판정이
    // 더러워집니다(이 킷이 DateWheelPicker의 되돌림 경로에서 이미 지키는 규칙입니다).
    if (next !== value) onChange(next);
  }

  return (
    <div
      className={className ? `segmented ${className}` : "segmented"}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;   // 브라우저·OS 단축키
        if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); move(1); return; }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); move(-1); return; }
        if (event.key === "Home") { event.preventDefault(); if (selectable.length) pick(selectable[0].value); return; }
        if (event.key === "End") { event.preventDefault(); if (selectable.length) pick(selectable[selectable.length - 1].value); }
      }}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            type="button"
            key={option.value}
            role="radio"
            aria-checked={checked}
            /* roving tabindex — 고른 칸 하나만 탭 정거장입니다. 아무것도 안 골려 있으면
             * (소비자가 목록 밖의 값을 들고 있으면) 묶음이 통째로 탭에서 빠지므로,
             * 그때는 첫 칸을 정거장으로 둡니다. */
            tabIndex={checked || (!options.some((other) => other.value === value) && option === options[0]) ? 0 : -1}
            disabled={option.disabled}
            onClick={() => !option.disabled && pick(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

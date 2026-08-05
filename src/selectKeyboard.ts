/* Select의 키보드 이동 계산 — DOM을 건드리지 않는 순수 함수만 둡니다.
 *
 * "다음에 어느 값이 활성이 되는가"는 그 활성 상태를 화면에 어떻게 나타내든 같은
 * 계산입니다 — 그래서 표현을 고르기 전에 이 파일이 먼저 있었고, 두 후보가 이걸
 * 공유했습니다(roving tabindex로 확정, PRINCIPLES.md §11). 여기에 DOM 접근을
 * 추가하지 마세요 — 이 파일이 jsdom 없이 테스트되는 것이 이 분리의 요점입니다.
 *
 * 용어: **활성(active)** 은 지금 방향키로 짚고 있는 옵션, **선택 가능한(enabled)** 은
 * disabled가 아닌 옵션입니다.
 */
import type { SelectOption } from "./Select";

function isEnabled(option: SelectOption) {
  return !option.disabled;
}

/** 선택 가능한 첫 옵션의 value. 하나도 없으면 null. */
export function firstEnabledValue(options: SelectOption[]): string | null {
  return options.find(isEnabled)?.value ?? null;
}

/** 선택 가능한 마지막 옵션의 value. 하나도 없으면 null. */
export function lastEnabledValue(options: SelectOption[]): string | null {
  for (let index = options.length - 1; index >= 0; index--) {
    if (isEnabled(options[index])) return options[index].value;
  }
  return null;
}

/**
 * `from` 기준으로 step 방향의 다음 선택 가능한 옵션.
 *
 * **끝에서 감싸지 않습니다** — 네이티브 `<select>`와 같고, APG도 감싸기를 선택사항으로
 * 둡니다. 끝이면 `from`을 그대로 돌려줘 "제자리"가 됩니다.
 *
 * `from`이 목록에 없으면(아직 활성이 없는 상태) 방향에 맞는 끝에서 시작합니다.
 */
export function stepEnabledValue(options: SelectOption[], from: string | null, step: 1 | -1): string | null {
  const startIndex = options.findIndex((option) => option.value === from);
  if (startIndex === -1) return step === 1 ? firstEnabledValue(options) : lastEnabledValue(options);
  for (let index = startIndex + step; index >= 0 && index < options.length; index += step) {
    if (isEnabled(options[index])) return options[index].value;
  }
  return from;
}

/**
 * 메뉴를 열 때 활성이 될 값. 현재 값이 선택 가능하면 그것, 아니면 첫 선택 가능한 옵션.
 *
 * 현재 값이 **disabled를 가리키는 경우**를 별도로 처리하는 이유: 그 값을 활성으로 두면
 * 방향키가 disabled에서 출발하게 되고, 사용자는 "왜 여기서 시작하지"를 겪습니다.
 */
export function initialActiveValue(options: SelectOption[], value: string): string | null {
  const current = options.find((option) => option.value === value);
  if (current && isEnabled(current)) return current.value;
  return firstEnabledValue(options);
}

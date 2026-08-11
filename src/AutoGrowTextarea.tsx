/* 자동 확장 메모 입력 — 원본: frontend/src/components/AutoGrowTextarea.tsx
 * 필요한 CSS: tokens.css, controls.css
 *
 * 3줄에서 시작해 내용만큼 늘어납니다. 내부 스크롤바가 생기지 않습니다.
 */
import { useLayoutEffect, useRef } from "react";

export type AutoGrowTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  ariaLabel?: string;
  /** `Select`·`DateWheelPicker`와 같은 이름·같은 뜻입니다. 이것만 없어서, 폼 전체를
   * 잠그려는 소비자가 **메모 칸 하나만 살아 있는 "반쯤 잠긴 폼"**을 얻었습니다. */
  disabled?: boolean;
  /** 라벨을 컨트롤 **바깥**에 두고 `<label htmlFor>`로 묶을 때 씁니다. `css/controls.css:14`의
   * `label`은 `display: grid`라 감싸는 배치가 기본이고, 그때는 필요 없습니다.
   *
   * ⚠️ 바깥 라벨과 `ariaLabel`을 **같이 넘기지 마세요** — `aria-label`이 `<label>`을
   * 이기므로 화면에 보이는 글자와 읽히는 이름이 갈립니다. 둘 중 하나만 씁니다. */
  id?: string;
};

export function AutoGrowTextarea({ value, onChange, placeholder, maxLength, className = "", ariaLabel, disabled = false, id }: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resize(textarea: HTMLTextAreaElement) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  // 값이 밖에서 바뀐 경우에도 높이를 다시 맞춥니다.
  useLayoutEffect(() => {
    if (textareaRef.current) resize(textareaRef.current);
  }, [value]);

  return <textarea ref={textareaRef} id={id} className={`auto-grow-textarea ${className}`.trim()} rows={3} value={value} maxLength={maxLength} disabled={disabled} aria-label={ariaLabel} onInput={(event) => resize(event.currentTarget)} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />;
}

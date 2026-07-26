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
};

export function AutoGrowTextarea({ value, onChange, placeholder, maxLength, className = "", ariaLabel }: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resize(textarea: HTMLTextAreaElement) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  // 값이 밖에서 바뀐 경우에도 높이를 다시 맞춥니다.
  useLayoutEffect(() => {
    if (textareaRef.current) resize(textareaRef.current);
  }, [value]);

  return <textarea ref={textareaRef} className={`auto-grow-textarea ${className}`.trim()} rows={3} value={value} maxLength={maxLength} aria-label={ariaLabel} onInput={(event) => resize(event.currentTarget)} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />;
}

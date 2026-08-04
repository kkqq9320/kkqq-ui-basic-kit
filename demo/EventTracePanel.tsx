/* 화면 위 이벤트 추적 패널 — 데모 전용. 개발자도구를 열 수 없는 실제 휴대폰에서
 * Select 버그를 진단하려고 넣은 임시 계측 UI입니다. 키트(src/)는 건드리지 않고,
 * eventTrace.ts가 캡처 단계에서 조용히 모아 둔 기록을 읽기만 합니다.
 *
 * 기본은 닫힘 — 오른쪽 아래의 작은 토글을 눌러야 열립니다. 다른 디자인을
 * 살펴보는 동안에는 평소와 똑같이 보여야 하기 때문입니다.
 */
import { useEffect, useRef, useState } from "react";

import { clearEventTrace, getEventTrace, installEventTrace, subscribeEventTrace } from "./eventTrace";

// React보다 먼저, 모듈이 임포트되는 즉시 설치합니다 — 패널을 열기 전에 일어난
// 탭도 놓치지 않도록. 리스너만 걸 뿐 아무것도 바꾸지 않으므로 항상 켜 둬도 안전합니다.
installEventTrace();

/** 복사 결과 표시는 1.5초 뒤 원래 라벨로 돌아갑니다. */
const COPY_FEEDBACK_MS = 1500;

export function EventTracePanel() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState(getEventTrace);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const logRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => subscribeEventTrace(() => setEntries(getEventTrace())), []);

  useEffect(() => {
    if (copied === "idle") return;
    const timer = window.setTimeout(() => setCopied("idle"), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  /** **navigator.clipboard를 믿을 수 없습니다.** 이 패널이 실제로 쓰이는 자리는
   * 폰에서 `http://<LAN-IP>:15274`로 여는 데모인데, 그건 보안 컨텍스트가 아니라
   * (localhost와 https만 해당) 안드로이드 크롬에서 `navigator.clipboard` 자체가
   * undefined입니다 — 즉 클립보드 API만 쓰면 이 버튼은 **정확히 필요한 그 환경에서만**
   * 조용히 아무 일도 안 합니다. execCommand는 폐기 예정이지만 비보안 컨텍스트에서
   * 동작하는 유일한 경로라 폴백으로 남깁니다. 둘 다 실패하면 "실패"를 띄워서,
   * 사용자가 복사됐다고 착각한 채 빈 걸 붙여넣지 않게 합니다. */
  async function copyAll() {
    const textarea = textareaRef.current;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied("done");
        return;
      } catch {
        // 보안 컨텍스트여도 권한 거부로 던질 수 있다 — 아래 폴백으로 계속한다.
      }
    }
    if (textarea) {
      textarea.focus();
      textarea.select();
      try {
        if (document.execCommand("copy")) {
          setCopied("done");
          return;
        }
      } catch {
        // 폴백도 막혔다 — 아래에서 실패로 알린다.
      }
    }
    setCopied("failed");
  }

  useEffect(() => {
    if (!open) return;
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, entries]);

  const text = entries.map((entry) => entry.text).join("\n");

  return <>
    <button
      type="button"
      className="trace-toggle"
      aria-pressed={open}
      onClick={() => setOpen((value) => !value)}
    >{open ? "TRACE ▾" : "TRACE"}</button>
    {open && <div className="trace-panel" role="log" aria-label="이벤트 추적">
      <div className="trace-panel-header">
        <strong>이벤트 추적 ({entries.length})</strong>
        <div className="trace-panel-buttons">
          <button type="button" onClick={copyAll} aria-live="polite">
            {copied === "done" ? "복사됨" : copied === "failed" ? "복사 실패" : "전체 복사"}
          </button>
          <button type="button" onClick={() => clearEventTrace()}>지우기</button>
          <button type="button" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </div>
      <div className="trace-log" ref={logRef}>
        {entries.length ? entries.map((entry, index) => <div key={index}>{entry.text}</div>) : <div>(아직 기록 없음 — 뭔가 눌러 보세요)</div>}
      </div>
      <p className="trace-copy-hint">위 “전체 복사”를 쓰세요 — 안 되면 아래 칸을 눌러 전체 선택 후 복사</p>
      <textarea
        ref={textareaRef}
        className="trace-textarea"
        readOnly
        value={text}
        onFocus={(event) => event.currentTarget.select()}
      />
    </div>}
  </>;
}

/* 모달 다이얼로그 — 원본: frontend/src/styles.css의 .account-edit-* 패턴을
 * 컴포넌트로 정리한 것. 앱에는 마크업이 페이지마다 흩어져 있었습니다.
 * 필요한 CSS: tokens.css, controls.css, dialog.css
 *
 * 앱 대비 추가한 것: body 포털, 포커스 초기화·복원, Tab 가두기.
 * 모달은 뒤 콘텐츠로 포커스가 새면 스크린 리더에서 길을 잃습니다.
 */
import { useContext, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { PopupDepthContext, useBackToClose, useEscapeToClose, useVisualViewportBox } from "./hooks";
import { isPrimaryButton } from "./positioning";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  /** 스크린 리더용 이름. 필수입니다. */
  ariaLabel: string;
  children: ReactNode;
  /** 주면 <form>으로 렌더하고 기본 동작을 막은 뒤 호출합니다. */
  onSubmit?: (event: FormEvent) => void;
  /** 440px → 520px */
  wide?: boolean;
  /** 내용이 길 때: 내부 스크롤 + 액션 바닥 고정 */
  scroll?: boolean;
  /* 세 가지 닫는 길. 되돌릴 수 없는 확인처럼 실수로 닫히면 안 되는 곳은 전부 끕니다 —
   * 그때는 뒤로가기도 가로채지 않습니다. 못 닫을 다이얼로그를 위해 뒤로가기를
   * 삼키면 사용자가 갇힙니다. */
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  closeOnBack?: boolean;
  /** 표면에 덧붙일 변형 클래스 */
  className?: string;
  /** 백드롭에 덧붙일 변형 클래스 (z-index 등 백드롭별로 다른 것). 겹쳐 여는 다이얼로그의
   *  백드롭을 구분하거나 특정 백드롭만 더 위로 올릴 때 씁니다. */
  backdropClassName?: string;
};

export function Dialog({ open, onClose, ariaLabel, children, onSubmit, wide = false, scroll = false, closeOnBackdrop = true, closeOnEscape = true, closeOnBack = true, className = "", backdropClassName = "" }: DialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const depth = useContext(PopupDepthContext) + 1;
  // 백드롭을 "지금 보이는 영역"에 그대로 맞춥니다. 키보드가 열리면 그 영역이
  // 키보드 위까지로 줄어들므로, 다이얼로그는 자동으로 그 안에서 가운데 놓이고
  // (위아래 여백이 생기고) 너무 길면 그 영역을 꽉 채운 채 안에서 스크롤됩니다.
  // "키보드가 열렸나"를 따로 판정할 필요가 없습니다.
  const viewportBox = useVisualViewportBox();
  // 뒤로가기가 뒤 페이지로 가는 대신 다이얼로그를 닫습니다.
  // 모바일에서 키보드가 떠 있으면 첫 뒤로가기는 OS가 키보드를 닫는 데 쓰고,
  // 그다음 뒤로가기에 여기가 반응합니다.
  useBackToClose(open && closeOnBack, onClose);
  // 겹쳐 있으면 가장 안쪽만 닫힙니다. 다이얼로그 안의 드롭다운을 Escape로 닫을 때
  // 다이얼로그까지 같이 닫혀 편집이 날아가지 않게 합니다.
  useEscapeToClose(open && closeOnEscape, onClose);

  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    // 열자마자 첫 입력칸을 잡아 바로 타이핑할 수 있게 합니다. 포커스만으로는
    // 레이아웃이 바뀌지 않습니다 — 위치는 오직 키보드 감지(useVirtualKeyboard)가
    // 결정합니다. autoFocus로 이미 안쪽이 잡혔으면 건드리지 않습니다.
    if (node && !node.contains(document.activeElement)) {
      (node.querySelector<HTMLElement>(FOCUSABLE) ?? node).focus({ preventScroll: true });
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) { event.preventDefault(); node.focus({ preventScroll: true }); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      restoreTo?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  const surfaceClass = ["dialog", wide && "dialog-wide", scroll && "dialog-scroll", className].filter(Boolean).join(" ");
  // 공통 props. mousedown으로 막습니다 — click으로 하면 다이얼로그 안에서 드래그를
  // 시작해 백드롭에서 손을 떼는 것만으로 닫혀 버립니다.
  const surfaceProps = {
    ref: dialogRef as never,
    className: surfaceClass,
    role: "dialog",
    "aria-modal": true,
    "aria-label": ariaLabel,
    tabIndex: -1,
    onMouseDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  };

  return createPortal(
    <div
      className={["dialog-backdrop", backdropClassName].filter(Boolean).join(" ")}
      style={viewportBox ? { top: viewportBox.top, left: viewportBox.left, width: viewportBox.width, height: viewportBox.height } : undefined}
      // 주 버튼(0)만 닫기로 칩니다. 마우스의 뒤로/앞으로·가운데 버튼도 mousedown을
      // 일으키는데, 그것까지 닫기로 처리하면 뒤로가기 버튼 한 번에 두 가지가
      // 동시에 벌어집니다: 백드롭 닫기가 먼저 발동해 정리 코드가 history 표식을
      // 써버리고, 뒤이어 브라우저의 뒤로가기가 그 표식을 못 찾아 페이지를 나갑니다.
      //
      // 포털은 DOM이 아니라 React 트리를 따라 이벤트를 올려 보냅니다. 다이얼로그
      // 안에서 연 다이얼로그의 백드롭 클릭이 바깥 다이얼로그까지 닫지 않도록 막습니다.
      onMouseDown={(event) => {
        event.stopPropagation();
        if (closeOnBackdrop && isPrimaryButton(event)) onClose();
      }}
    >
      {/* 안에서 열릴 드롭다운·달력·다이얼로그는 한 겹 더 깊습니다. Escape는 가장
          깊은 것만 닫습니다 — 드롭다운을 닫으려다 편집이 날아가지 않게. */}
      <PopupDepthContext.Provider value={depth}>
        {onSubmit
          ? <form {...surfaceProps} onSubmit={(event) => { event.preventDefault(); onSubmit(event); }}>{children}</form>
          : <div {...surfaceProps}>{children}</div>}
      </PopupDepthContext.Provider>
    </div>,
    document.body,
  );
}

/** 다이얼로그 머리말: 작은 강조색 eyebrow + 제목. */
export function DialogHeading({ eyebrow, title , className = "" }: { eyebrow?: ReactNode; title: ReactNode ; className?: string }) {
  return <div className={`dialog-heading ${className}`.trim()}>{eyebrow && <small>{eyebrow}</small>}<h2>{title}</h2></div>;
}

/** 다이얼로그 액션 줄. 32px 조밀 버튼을 씁니다. `.primary` / `.danger`를 붙이세요. */
export function DialogActions({ children , className = "" }: { children: ReactNode ; className?: string }) {
  return <div className={`dialog-actions ${className}`.trim()}>{children}</div>;
}

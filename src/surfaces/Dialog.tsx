/* 모달 다이얼로그 — 원본: frontend/src/styles.css의 .account-edit-* 패턴을
 * 컴포넌트로 정리한 것. 앱에는 마크업이 페이지마다 흩어져 있었습니다.
 * 필요한 CSS: tokens.css, controls.css, dialog.css
 *
 * 앱 대비 추가한 것: body 포털, 포커스 초기화·복원, Tab 가두기.
 * 모달은 뒤 콘텐츠로 포커스가 새면 스크린 리더에서 길을 잃습니다.
 */
import { useContext, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { PopupDepthContext, useBackToClose, useEscapeToClose } from "../browser/popupDismiss";
import { useVisualViewportBox } from "../browser/visualViewport";
import { isPrimaryButton } from "../browser/pointerButton";

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
    /* ⚠️ **`?? node` 폴백은 "후보가 없을 때"만 발동합니다 — "후보가 포커스를 못 받을
     * 때"는 아닙니다.** 첫 매치가 `<input type="hidden">`이면 `querySelector`가 그것을
     * 돌려주므로 `??`가 안 타고, `focus()`는 조용히 실패하며, **포커스는 다이얼로그 밖에
     * 그대로 남습니다.** 아래 Tab 감싸기와 같은 맹점이라 같은 방식으로 고칩니다 —
     * 하나씩 넣어 보고, 아무도 못 받으면 컨테이너로 떨어집니다. */
    if (node && !node.contains(document.activeElement)) {
      const candidates = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((item) => !(item instanceof HTMLInputElement && item.type === "hidden"));
      const landed = candidates.some((candidate) => {
        candidate.focus({ preventScroll: true });
        return document.activeElement === candidate;
      });
      if (!landed) node.focus({ preventScroll: true });
    }
    /* 🔴 **`FOCUSABLE`에 걸린다고 포커스를 받는 것이 아닙니다.** 그 선택자는 가시성도
     * 포커스 가능성도 안 봅니다 — `<input type="hidden">`은 `input:not([disabled])`에
     * **글자 그대로 매치되고**(폼 안에 흔합니다), `display:none` 서브트리 안의 버튼·앵커도
     * 그대로 걸립니다. 그런 요소에 `focus()`를 부르면 **예외도 안 던지고 조용히 아무 일도
     * 안 합니다**(이 저장소가 `src/shortcuts/shortcuts.ts`에서 이미 실측해 적어 둔 사실입니다).
     *
     * 그게 왜 결함이었나: 감싸기가 `preventDefault()`를 **먼저** 부르고 `focus()`를 뒤에
     * 불렀습니다. 옮기기가 조용히 실패하면 **기본 이동은 이미 막혔고 대신 갈 곳으로도 못
     * 가서, 그 지점에서 Tab이 죽습니다.** 되돌릴 방법도 없습니다.
     *
     * 그래서 **정하고 나서 막습니다** — 실제로 포커스가 옮겨진 뒤에만 `preventDefault`.
     * 판정은 정적 규칙이 아니라 **넣어 보고 `activeElement`를 확인**합니다. 레이아웃을
     * 아는 판정(`offsetParent === null`)을 쓰면 jsdom에서는 레이아웃이 없어 **언제나
     * 참**이라 검사 환경에서 후보를 전부 배제해 버립니다 — 실측 판정이 두 환경에서 다 맞습니다.
     *
     * ⚠️ **`type="hidden"`만은 목록에서 미리 걷습니다.** 시도조차 무의미하고, 무엇보다
     * `first`/`last`의 **경계 계산**에 들어가면 안 되기 때문입니다 — 숨은 입력이 맨 앞이면
     * `activeElement === first`가 영영 거짓이라 진짜 첫 요소에서 Shift+Tab이 안 걸려
     * **포커스가 모달 밖으로 샙니다.** 그건 아래 폴백으로도 못 고치는 별개의 새는 자리입니다. */
    function focusFirstThatTakes(candidates: HTMLElement[]) {
      for (const candidate of candidates) {
        candidate.focus();
        if (document.activeElement === candidate) return true;
      }
      return false;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((item) => !(item instanceof HTMLInputElement && item.type === "hidden"));
      if (!items.length) { event.preventDefault(); node.focus({ preventScroll: true }); return; }
      const first = items[0];
      const last = items[items.length - 1];
      /* 감쌀 방향의 **끝에서부터** 실제로 받는 요소를 찾습니다 — 첫 후보가 숨어 있으면
       * 그다음이 받습니다. 아무도 못 받으면 **막지 않고** 브라우저에 맡깁니다. */
      if (event.shiftKey && document.activeElement === first) {
        if (focusFirstThatTakes([...items].reverse())) event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        if (focusFirstThatTakes(items)) event.preventDefault();
      }
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

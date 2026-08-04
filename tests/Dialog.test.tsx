// @vitest-environment jsdom
/// <reference types="vite/client" />
// 위 참조는 아래 `*?raw` 임포트의 타입을 준다(vite/client.d.ts의
// `declare module '*?raw'`). CSS 소스 텍스트를 Vite의 `*?raw` 임포트로 그대로
// 읽는다 — vitest의 기본값 `test.css.include: []`(vitest/dist/config.d.ts)는 `.css`
// 요청(`?raw` 포함)을 전부 빈 모듈로 목(mock)하므로, 예전에는 이 파일의 CSS 계약
// 테스트가 항상 빈 문자열만 검사해 절대 실패할 수 없었다(실측: `.json?raw`는 내용을
// 그대로 돌려주는데 `.css?raw`는 어떤 CSS 파일이든 길이 0을 돌려줬다). 이제
// vite.config.ts의 `test.css.include`가 `.css`(와 `?raw` 등 쿼리가 붙은 변형)를 실제
// vite CSS 파이프라인으로 넘기므로, 이 임포트가 진짜 소스 텍스트를 돌려준다 —
// node:fs로 직접 읽던 예전 워크어라운드(와 그걸 위해 선언했던 tests/node-fs.d.ts)는
// 이제 불필요해 함께 지웠다.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dialog, DialogActions, DialogHeading, Select } from "../src";
import dialogCssSource from "../css/dialog.css?raw";

afterEach(() => { cleanup(); delete (window as { visualViewport?: unknown }).visualViewport; });

type FakeViewport = EventTarget & { offsetTop: number; offsetLeft: number; width: number; height: number };

/** 가상 키보드가 보이는 영역을 줄이는 상황을 흉내 냅니다. */
function installFakeVisualViewport(height: number, width = window.innerWidth) {
  const target = new EventTarget() as FakeViewport;
  target.offsetTop = 0;
  target.offsetLeft = 0;
  target.width = width;
  target.height = height;
  Object.defineProperty(window, "visualViewport", { configurable: true, value: target });
  return {
    /** 키보드가 올라와 아래쪽 covered px를 가린 상태 */
    openKeyboard(covered: number) {
      target.height = height - covered;
      target.dispatchEvent(new Event("resize"));
    },
    closeKeyboard() {
      target.height = height;
      target.dispatchEvent(new Event("resize"));
    },
  };
}

function Basic({ onClose = () => undefined, ...rest }: Partial<React.ComponentProps<typeof Dialog>>) {
  return <Dialog open onClose={onClose} ariaLabel="분류 등록" {...rest}>
    <DialogHeading eyebrow="CATEGORY" title="분류 등록" />
    <label>이름<input aria-label="이름" /></label>
    <DialogActions>
      <button type="button" className="danger">삭제</button>
      <button type="button">취소</button>
      <button type="button" className="primary">등록</button>
    </DialogActions>
  </Dialog>;
}

describe("Dialog", () => {
  it("열려야만 렌더되고 body 포털로 나간다", () => {
    const { container, rerender } = render(<div><Dialog open={false} onClose={() => undefined} ariaLabel="X">내용</Dialog></div>);
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(<div><Dialog open onClose={() => undefined} ariaLabel="X">내용</Dialog></div>);
    const dialog = screen.getByRole("dialog", { name: "X" });
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.closest(".dialog-backdrop")?.parentElement).toBe(document.body);
  });

  it("모달 접근성 속성을 갖춘다", () => {
    render(<Basic />);
    const dialog = screen.getByRole("dialog", { name: "분류 등록" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("tabindex")).toBe("-1");
  });

  it("백드롭을 누르면 닫히고 다이얼로그 안을 누르면 닫히지 않는다", () => {
    const onClose = vi.fn();
    render(<Basic onClose={onClose} />);
    const dialog = screen.getByRole("dialog");

    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(dialog.closest(".dialog-backdrop")!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("마우스 보조 버튼(뒤로/앞으로·가운데)으로는 백드롭이 닫히지 않는다", () => {
    // 마우스 뒤로가기 버튼도 mousedown을 일으킵니다. 이걸 닫기로 처리하면 한 번의
    // 뒤로가기에 백드롭 닫기 + 브라우저 뒤로가기가 겹쳐, 정리 코드가 history 표식을
    // 먼저 써버리고 브라우저는 페이지를 나가버립니다.
    const onClose = vi.fn();
    render(<Basic onClose={onClose} />);
    const backdrop = screen.getByRole("dialog").closest(".dialog-backdrop")!;

    for (const button of [1, 2, 3, 4]) {
      fireEvent.mouseDown(backdrop, { button });
      expect(onClose).not.toHaveBeenCalled();
    }

    fireEvent.mouseDown(backdrop, { button: 0 });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closeOnBackdrop=false면 백드롭으로 닫히지 않는다 (Escape는 그대로)", () => {
    const onClose = vi.fn();
    render(<Basic onClose={onClose} closeOnBackdrop={false} />);
    fireEvent.mouseDown(screen.getByRole("dialog").closest(".dialog-backdrop")!);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Escape로 닫힌다", () => {
    const onClose = vi.fn();
    render(<Basic onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closeOnEscape=false면 Escape로도 닫히지 않는다", () => {
    const onClose = vi.fn();
    render(<Basic onClose={onClose} closeOnEscape={false} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closeOnBack=false면 뒤로가기를 가로채지 않는다", () => {
    // 못 닫을 다이얼로그를 위해 뒤로가기를 삼키면 사용자가 갇힌다.
    vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const pushState = vi.spyOn(window.history, "pushState");
    render(<Basic closeOnBack={false} />);
    expect(pushState).not.toHaveBeenCalled();

    cleanup();
    render(<Basic />);
    expect(pushState).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  it("겹쳐 있으면 Escape에 가장 안쪽만 닫힌다", () => {
    // 각자 document에 리스너를 달면 한 번의 Escape로 전부 닫힌다. 안쪽 팝오버를
    // 닫으려던 사용자가 저장하지 않은 편집까지 잃는다.
    vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    const { rerender } = render(<Dialog open onClose={closeOuter} ariaLabel="바깥">
      <input aria-label="이름" />
      <Dialog open onClose={closeInner} ariaLabel="안쪽">칩</Dialog>
    </Dialog>);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeInner).toHaveBeenCalledOnce();
    expect(closeOuter).not.toHaveBeenCalled();

    rerender(<Dialog open onClose={closeOuter} ariaLabel="바깥"><input aria-label="이름" /></Dialog>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeOuter).toHaveBeenCalledOnce();   // 안쪽이 닫히면 그다음은 바깥 차례
    vi.restoreAllMocks();
  });

  it("다이얼로그 안의 드롭다운을 Escape로 닫아도 다이얼로그는 남는다", () => {
    vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} ariaLabel="거래 수정">
      <Select ariaLabel="항목" value="a" onChange={() => undefined}
        options={[{ value: "a", label: "현금" }, { value: "b", label: "예금" }]} />
    </Dialog>);

    fireEvent.click(screen.getByRole("button", { name: /항목/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();     // 드롭다운만 닫히고
    expect(onClose).not.toHaveBeenCalled();               // 다이얼로그는 남는다

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();               // 그다음이 다이얼로그 차례
    vi.restoreAllMocks();
  });

  it("겹쳐 연 다이얼로그의 백드롭이 바깥 다이얼로그까지 닫지 않는다", () => {
    // 포털은 DOM이 아니라 React 트리를 따라 이벤트를 올려 보낸다.
    vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    render(<Dialog open onClose={closeOuter} ariaLabel="바깥">
      <Dialog open onClose={closeInner} ariaLabel="안쪽" className="inner">칩</Dialog>
    </Dialog>);

    fireEvent.mouseDown(screen.getByRole("dialog", { name: "안쪽" }).closest(".dialog-backdrop")!);
    expect(closeInner).toHaveBeenCalledOnce();
    expect(closeOuter).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("열리면 바로 첫 입력칸에 포커스가 간다", () => {
    render(<Basic />);
    expect(document.activeElement).toBe(screen.getByLabelText("이름"));
  });

  it("autoFocus를 준 요소가 있으면 그쪽을 존중한다", () => {
    render(<Dialog open onClose={() => undefined} ariaLabel="검색">
      <input aria-label="검색어" autoFocus />
    </Dialog>);
    expect(document.activeElement).toBe(screen.getByLabelText("검색어"));
  });

  it("닫히면 열기 전 요소로 포커스를 되돌린다", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button type="button" onClick={() => setOpen(true)}>열기</button>
        <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="확인"><button type="button">확인</button></Dialog>
      </>;
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "열기" });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).not.toBe(opener);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(opener);
  });

  it("Tab이 다이얼로그 안에 갇힌다", () => {
    render(<Basic />);
    const dialog = screen.getByRole("dialog");
    const items = [...dialog.querySelectorAll<HTMLElement>("input, button")];
    const first = items[0];
    const last = items[items.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("onSubmit을 주면 form으로 렌더하고 기본 동작을 막는다", () => {
    const onSubmit = vi.fn();
    render(<Dialog open onClose={() => undefined} ariaLabel="저장" onSubmit={onSubmit}>
      <button className="primary">저장</button>
    </Dialog>);
    const dialog = screen.getByRole("dialog");
    expect(dialog.tagName).toBe("FORM");

    const submitEvent = fireEvent.submit(dialog);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(submitEvent).toBe(false);   // preventDefault 되었음
  });

  it("백드롭을 지금 보이는 영역(visualViewport)에 맞춘다", async () => {
    installFakeVisualViewport(window.innerHeight);
    render(<Basic />);
    const backdrop = screen.getByRole("dialog").closest(".dialog-backdrop") as HTMLElement;

    await waitFor(() => expect(backdrop.style.height).toBe(`${window.innerHeight}px`));
    expect(backdrop.style.top).toBe("0px");
    expect(backdrop.style.left).toBe("0px");
    expect(backdrop.style.width).toBe(`${window.innerWidth}px`);
  });

  it("키보드가 올라오면 백드롭이 키보드 위까지로 줄어든다", async () => {
    const viewport = installFakeVisualViewport(window.innerHeight);
    render(<Basic />);
    const backdrop = screen.getByRole("dialog").closest(".dialog-backdrop") as HTMLElement;
    await waitFor(() => expect(backdrop.style.height).toBe(`${window.innerHeight}px`));

    // 다이얼로그는 줄어든 영역 안에서 가운데 놓이므로 위아래 여백이 생기고,
    // 길면 max-height: 100%로 그 영역을 채운 채 안에서 스크롤된다.
    viewport.openKeyboard(300);
    await waitFor(() => expect(backdrop.style.height).toBe(`${window.innerHeight - 300}px`));

    viewport.closeKeyboard();
    await waitFor(() => expect(backdrop.style.height).toBe(`${window.innerHeight}px`));
  });

  it("키보드 판정을 하지 않으므로 포커스와 무관하게 영역만 따라간다", async () => {
    const viewport = installFakeVisualViewport(window.innerHeight);
    render(<Basic />);
    const backdrop = screen.getByRole("dialog").closest(".dialog-backdrop") as HTMLElement;

    (document.activeElement as HTMLElement | null)?.blur();
    viewport.openKeyboard(300);
    await waitFor(() => expect(backdrop.style.height).toBe(`${window.innerHeight - 300}px`));
    // 임계값으로 "키보드인가"를 추측하던 클래스는 더 이상 없다
    expect(backdrop.className).toBe("dialog-backdrop");
  });

  it("visualViewport가 없으면 인라인 좌표 없이 CSS 기본값을 쓴다", () => {
    render(<Basic />);
    const backdrop = screen.getByRole("dialog").closest(".dialog-backdrop") as HTMLElement;
    expect(backdrop.getAttribute("style")).toBeNull();
  });

  it("wide / scroll 변형 클래스를 붙인다", () => {
    const { rerender } = render(<Basic />);
    expect(screen.getByRole("dialog").className).toBe("dialog");

    rerender(<Basic wide scroll />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("dialog-wide");
    expect(dialog.className).toContain("dialog-scroll");
  });

  it("backdropClassName을 백드롭에 덧붙인다", () => {
    // 겹쳐 여는 다이얼로그의 백드롭을 구분하거나 특정 백드롭만 더 위로 올릴 때.
    render(<Basic backdropClassName="entry-help-backdrop" />);
    const backdrop = screen.getByRole("dialog").closest(".dialog-backdrop")!;
    expect(backdrop.className).toBe("dialog-backdrop entry-help-backdrop");
  });

  describe("첫 열림이 두 단계로 그려지지 않는다 (키보드가 이미 열린 상태에서 마운트)", () => {
    // RTL의 render()는 act()로 감싸여 있어 passive effect(useEffect)까지 동기적으로
    // 다 flush해 버린다 — "커밋은 됐지만 아직 useEffect 전" 순간을 관찰할 수 없다.
    // 실제 브라우저에서는 그 사이에 한 프레임이 페인트된다(레이아웃 이펙트는
    // 페인트 전, 패시브 이펙트는 페인트 후). 그 프레임을 재현하려면 React를 직접
    // 쓰고, act() 대신 flushSync로 "커밋까지"만 동기적으로 밀어붙인 다음 실제
    // 마이크로태스크/타이머 한 틱을 흘려보내 passive effect가 그 뒤에 도착하는지
    // 관찰해야 한다.
    afterEach(() => { document.body.innerHTML = ""; });

    function sleep(ms: number) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    it("커밋 직후(패시브 이펙트 이전)부터 이미 올바른 위치다", async () => {
      installFakeVisualViewport(400);
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      flushSync(() => root.render(<Basic />));
      // 레이아웃 이펙트까지는 flushSync 안에서 이미 끝났다. 패시브 이펙트는 아직이다.
      const backdrop = document.querySelector(".dialog-backdrop") as HTMLElement;
      expect(backdrop.style.height).toBe("400px");   // 첫 프레임부터 이미 정확하다

      await sleep(20);   // 패시브 이펙트가 붙어도 값이 바뀌지 않는다(같은 값)
      expect(backdrop.style.height).toBe("400px");

      root.unmount();
    });
  });

  it("dialog.css는 키보드가 열려 있다고 해서 백드롭 재배치 트랜지션을 끄지 않는다 (열림·닫힘 경로가 대칭)", () => {
    // §7 Spatial consistency: "enter and exit along the same path" — 키보드가 닫힐 때
    // 백드롭이 다시 커지는 건 이미 애니메이션되는데, 열릴 때(다이얼로그가 이미 뜬
    // 채로 키보드가 열리는 경우)만 body:has(.keyboard-inset-open)로 트랜지션을 꺼서
    // 순간이동시키면 그 자체가 비대칭이자 실기기가 신고한 "두 단계로 뚝뚝 끊어짐"의
    // 실제 원인이다. jsdom은 실제 CSS cascade/트랜지션을 계산하지 않으므로(레이아웃
    // 엔진이 없다) 이 계약은 소스 텍스트로 고정해 회귀를 잡는다.
    // .css?raw가 빈 문자열로 목킹되면 아래 .not.toMatch는 **아무것도 검증하지 않은 채
    // 통과한다** — 이 브랜치에서 실제로 있었던 결함이다(0726277이 vitest의
    // test.css.include 기본값 때문에 CSS 계약 테스트가 통째로 공허하게 통과하던 걸
    // 고쳤다). 그 인프라 수정은 소스를 진짜로 읽히게 만들었을 뿐, 이 단언 자체를
    // 의미 있게 만들지는 않는다 — 다시 빈 문자열이 되는 날 이 테스트는 조용히 초록으로
    // 돌아간다. AppShell.test.tsx:437과 같은 idiom으로 그 구멍을 막는다.
    // (같은 파일 :372,:390의 계약들은 .match() + .not.toBeNull()이라 스스로 막혀 있다 —
    //  가드가 없던 건 이 한 줄뿐이다.)
    expect(dialogCssSource.length).toBeGreaterThan(1000);
    expect(dialogCssSource).not.toMatch(/keyboard-inset-open\)\s*\.dialog-backdrop\s*\{\s*transition:\s*none/);
  });

  it("백드롭의 실제 커버 영역(::before)은 top/height 트랜지션과 무관하게 항상 뷰포트 전체를 즉시 덮는다 — 전체 브랜치 리뷰 Finding 2(성장 방향 구멍)", () => {
    // 원인(Finding 2): .dialog-backdrop 자신의 top/height는(바로 위 규칙, 46d7277)
    // visualViewport가 커질 때(키보드가 닫히거나 주소창이 늘어날 때) 400ms에 걸쳐
    // 새 값까지 자란다. 그 400ms 동안 실제로 그려진 박스는 아직 다 못 자란 상태라,
    // 새로 드러난 영역이 트랜지션이 끝날 때까지 안 덮인다 — 뒤 페이지가 비치고, 그
    // 자리는 .dialog-backdrop의 mousedown 핸들러가 붙은 영역 밖이라 클릭도 안 먹는다
    // (§10 위반). top/height 트랜지션 자체를 없애면 46d7277이 고친 반대 방향(키보드가
    // "열릴 때") 하드컷이 되돌아오므로 그 트랜지션은 그대로 둔다 — 대신 실제 스크림
    // (틴트+블러)을 이 트랜지션과 무관한, 항상 뷰포트 전체를 즉시 덮는 별도 레이어
    // (::before)로 옮긴다. jsdom은 실제 CSS 트랜지션/레이아웃을 계산하지 않으므로
    // (46d7277의 같은 전례) 이 계약도 소스 텍스트로 고정한다.
    const beforeBlock = dialogCssSource.match(/\.dialog-backdrop::before\s*\{([^}]*)\}/);
    expect(beforeBlock).not.toBeNull();
    const beforeRule = beforeBlock![1];

    // 항상 뷰포트 전체 — top/height가 뭐든 상관없이 고정된 구조적 커버 영역이다.
    expect(beforeRule).toMatch(/position:\s*fixed/);
    expect(beforeRule).toMatch(/inset:\s*0\b/);
    // 트랜지션이 전혀 없어야 한다 — 있으면 이 레이어도 같은 지연을 겪어 구멍이 재발한다.
    expect(beforeRule).not.toMatch(/transition/);
    // §10의 58% 검정 틴트 + 8px 블러가 이 레이어에 있어야, "항상 덮는 영역"과 "실제
    // 스크림"이 같은 곳이 된다 — 틴트만 옮기고 블러를 빠뜨리면 성장 구간에서 블러
    // 없는 틴트만 보이는 구멍이 남는다(§10은 틴트와 블러를 둘 다 공유 계약으로 못박음).
    expect(beforeRule).toMatch(/backdrop-filter:\s*blur\(8px\)/);
    expect(beforeRule).toMatch(/rgba\(10,\s*11,\s*24,\s*\.58\)/);

    // 스크림(배경·블러)을 옮긴 것이지 복제한 게 아니다 — 부모 규칙에 그대로 남아 있으면
    // 다이얼로그가 떠 있는 내내 8px 블러를 두 겹으로 합성하는 비용을 진다(§12: 이
    // 레이어가 실제로 필요한 순간은 400ms 트랜지션 구간뿐이다).
    const baseBlock = dialogCssSource.match(/\.dialog-backdrop\s*\{([^}]*)\}/);
    expect(baseBlock).not.toBeNull();
    expect(baseBlock![1]).not.toMatch(/backdrop-filter/);
  });
});

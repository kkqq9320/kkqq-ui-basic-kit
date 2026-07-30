// @vitest-environment jsdom
//
// 가상 키보드가 열리면(useVirtualKeyboard) 포커스된 필드가 그 뒤로 가려지지 않게
// AppShell이 스크롤 호스트(#root)를 옮기는지, 닫히면 원래 자리로 돌아가는지 확인한다.
// bug-keyboard-shift.md가 실측한 근본 원인: #root는 height:100dvh로 고정돼 키보드가
// 열려도 clientHeight가 줄지 않고(안드로이드 기본 resizes-visual, index.html에
// interactive-widget 지정 없음), scroll-padding-bottom:40dvh(tokens.css)는 실제
// 키보드 높이와 무관한 상수라 scrollIntoView에 맡기면 우연히만 맞는다 — 그래서
// visualViewport로 가려진 만큼을 직접 계산해 scrollTop에 더한다(Select.tsx의
// scrollSelectedOptionIntoView와 같은 방식). jsdom은 Element.scrollIntoView를
// 구현하지 않으므로(tests/Select.test.tsx:228) 이 방식이라야 단위 테스트가 성립한다.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { AppShell } from "../src/AppShell";

afterEach(() => {
  cleanup();
  delete (window as { visualViewport?: unknown }).visualViewport;
  document.querySelectorAll("[data-test-root]").forEach((node) => node.remove());
  document.querySelectorAll("[data-test-outside]").forEach((node) => node.remove());
});

type FakeViewport = EventTarget & { offsetTop: number; offsetLeft: number; width: number; height: number };

/** tests/Dialog.test.tsx:14-31의 installFakeVisualViewport를 그대로 미러링한다. */
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

/** tokens.css의 실제 스크롤 호스트(#root)를 흉내 낸다. AppShell은 이 id로 찾는다. */
function renderIntoScrollRoot(ui: ReactElement) {
  const root = document.createElement("div");
  root.id = "root";
  root.setAttribute("data-test-root", "1");
  document.body.appendChild(root);
  render(ui, { container: root });
  return root;
}

/** jsdom은 getBoundingClientRect를 항상 0으로 주므로, bug-keyboard-shift.md가 실측한
 * 좌표를 재현하려면 직접 덮어써야 한다. */
function stubRectBottom(element: HTMLElement, bottom: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top: bottom - 79, left: 0, right: 320, bottom, width: 320, height: 79, x: 0, y: bottom - 79, toJSON() {} }),
  });
}

function keyboardInsetOf(root: HTMLElement) {
  return (root.querySelector(".app-shell") as HTMLElement).style.getPropertyValue("--keyboard-inset");
}

function Page() {
  return <AppShell sidebar={<div />}>
    <textarea aria-label="메모" />
  </AppShell>;
}

describe("AppShell: 가상 키보드가 열리면 포커스된 필드가 가려지지 않는다", () => {
  it("필드 아래쪽이 키보드에 가려지면 그만큼(+여유 8px) 스크롤 호스트를 올린다", async () => {
    // bug-keyboard-shift.md 실측(Experiment B): scrollTop 1046, rect.bottom 507,
    // 844 -> 494로 줄면 보정 없이는 507이 494보다 13px 아래로(가려짐) 남는다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);   // 844 -> 494

    // overshoot = rect.bottom(507) - visibleBottom(494) + gap(8) = 21
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));
  });

  it("이미 보이는 영역 안이면 스크롤하지 않는다", async () => {
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 400);   // 축소된 494 안에도 충분히 들어옴
    root.scrollTop = 500;

    textarea.focus();
    viewport.openKeyboard(350);

    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));   // 키보드는 열렸다
    expect(root.scrollTop).toBe(500);   // 그래도 스크롤은 그대로
  });

  it("키보드가 닫히면 원래 스크롤 위치로 되돌아간다(점프 없이)", async () => {
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));

    viewport.closeKeyboard();
    await waitFor(() => expect(root.scrollTop).toBe(1046));
    // 패딩도 같이 원래대로 — 레이아웃이 남는 여백 없이 완전히 복귀했는지.
    expect(keyboardInsetOf(root)).toBe("0px");
  });

  it("그 사이 사용자가 직접 스크롤했으면 되돌리지 않는다(사용자 의도를 덮어쓰지 않음)", async () => {
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));

    // 타이핑하며 사용자가 직접 더 스크롤했다 — 우리가 마지막으로 맞춘 값과 달라진다.
    root.scrollTop = 1300;

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1300);   // 되돌리지 않았다
  });

  it("SCROLL_DRIFT_TOLERANCE(18px) 안의 흔들림은 사용자 스크롤로 오판하지 않고 되돌린다", async () => {
    // iOS 러버밴드 관성이나 기기 자체의 스크롤 보정이 우리가 맞춘 직후에도 몇 px를
    // 얹을 수 있다 — 문턱이 1px 수준으로 좁으면 그 흔들림만으로 "사용자가
    // 스크롤했다"고 오판해 정작 되돌려야 할 때 안 되돌리게 된다(§9 요구사항 위반).
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));   // applied = 1067

    root.scrollTop += 2;   // 문턱(18px) 안의 흔들림 — 사용자 의도가 아니다

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1046);   // 그래도 되돌렸다
  });

  it("키보드가 열린 채로 다른 편집 요소로 포커스가 옮겨가면 그 요소도 다시 맞춘다", async () => {
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(
      <AppShell sidebar={<div />}>
        <textarea aria-label="첫째" />
        <textarea aria-label="둘째" />
      </AppShell>,
    );
    const first = screen.getByLabelText("첫째");
    const second = screen.getByLabelText("둘째");
    stubRectBottom(first, 507);
    stubRectBottom(second, 600);   // 첫째보다 더 가려짐
    root.scrollTop = 1046;

    first.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));   // 첫째 기준 보정

    // 키보드가 열린 채로(탭 이동 등) 둘째로 포커스가 옮겨간다 — focusin 리스너가 다시 맞춰야 한다.
    second.focus();
    // overshoot = 600 - 494 + 8 = 114, 지금 scrollTop(1067) 기준으로 더한다.
    await waitFor(() => expect(root.scrollTop).toBe(1067 + 114));
  });

  it("#root 밖(다이얼로그 포털 자리)의 포커스는 건드리지 않는다", async () => {
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    root.scrollTop = 700;

    // Dialog.tsx가 document.body에 포털하는 것과 같은 모양: #root의 형제.
    const outside = document.createElement("input");
    outside.setAttribute("aria-label", "다이얼로그 입력");
    outside.setAttribute("data-test-outside", "1");
    document.body.appendChild(outside);
    stubRectBottom(outside, 700);

    outside.focus();
    viewport.openKeyboard(350);

    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));   // 키보드 감지는 전역이라 열린다
    expect(root.scrollTop).toBe(700);   // 그래도 #root는 움직이지 않는다 — contains() 가드
  });

  it(".workspace 하단 패딩에 --keyboard-inset을 반영하고, 닫히면 0으로 되돌린다", async () => {
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    expect(keyboardInsetOf(root)).toBe("0px");

    textarea.focus();
    viewport.openKeyboard(350);
    // inset = window.innerHeight - (viewport.offsetTop(0) + viewport.height(494))
    await waitFor(() => expect(keyboardInsetOf(root)).toBe(`${window.innerHeight - 494}px`));

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
  });
});

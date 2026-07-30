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

  it("키보드가 닫혀도 스크롤 위치를 강제로 되돌리지 않는다(사용자가 요청하지 않은 시점 이동을 만들지 않음)", async () => {
    // 이전 버전은 여기서 열기 전 위치(1046)로 되돌렸다 — 실기기 피드백은 그걸 "시점이
    // 확확 바뀌어서 어지럽다"고 표현했다. iOS 자체도 키보드를 내릴 때 스크롤 위치를
    // 당겨오지 않는다: 사용자가 어디 있었든 그대로 둔다(Apple 인터페이스 원칙 §16.2
    // Agency — 요청하지 않은 이동을 강제하지 않음, §16.4 Familiarity — 플랫폼이 이미
    // 하는 대로). PRINCIPLES.md §9도 "닫히면 되돌린다"를 요구한 적이 없다 — 되돌리기는
    // 이 컴포넌트가 스스로 만든 계약이었고 그 계약 자체가 어지러움의 원인이었다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));   // 패딩은 원래대로 줄어든다
    expect(root.scrollTop).toBe(1046 + 21);   // 그래도 스크롤 위치는 그대로 — 되돌리지 않는다
  });

  it("그 사이 사용자가 직접 스크롤했어도 그 위치 그대로 둔다", async () => {
    // 되돌리기 자체가 없으므로 사용자가 타이핑 중 더 스크롤했든 안 했든 결과는 같다 —
    // 이 테스트는 "얼마나 스크롤했든 닫기가 그 값을 절대 건드리지 않는다"는 걸 큰
    // 폭(+254px)으로 확인한다. 이전에 SCROLL_DRIFT_TOLERANCE(18px)가 가르던 경계
    // 안쪽의 작은 흔들림은 바로 아래 테스트가 따로 확인한다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));

    // 타이핑하며 사용자가 직접 더 스크롤했다.
    root.scrollTop = 1300;

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1300);   // 되돌리지 않았다
  });

  it("이전 SCROLL_DRIFT_TOLERANCE(18px) 문턱 안쪽의 작은 흔들림도 더 이상 되돌리지 않는다", async () => {
    // 되돌리기 메커니즘이 "우회"된 게 아니라 통째로 없다는 걸 보여 주는 가장 확실한
    // 증거: 이 정확한 시나리오(+2px, 옛 18px 문턱 안쪽)는 1dc8b60이 문턱을 넓히면서까지
    // "복원돼야 한다"고 못 박았던 경우다. 지금은 문턱 자체가 없으므로 이 흔들림도
    // 그냥 사용자 스크롤과 똑같이 취급되어 되돌아가지 않는다 — 1046이 아니라 1069여야
    // 이전 메커니즘이 남아 있지 않다는 뜻이다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));   // 1067

    root.scrollTop += 2;   // 옛 문턱(18px) 안쪽의 흔들림 — 예전이라면 "사용자 스크롤 아님"으로 봤다

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1067 + 2);   // 1046이 아니다 — 되돌리는 코드가 아예 없다
  });

  it("닫힌 뒤 같은 필드에 다시 초점을 맞춰 재열림해도 이전 사이클의 흔적이 남지 않는다", async () => {
    // 이전 구현은 restingScrollTop/appliedScrollTop을 ref에 저장해 뒀다가 닫힐 때
    // 참조했다. 그 되돌리기 로직을 통째로 들어냈으니, 재열림이 첫 사이클의 어떤
    // 잔여 상태에도 기대지 않고 "지금" scrollTop 기준으로 다시 계산되는지 확인한다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    root.scrollTop = 1046;

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));   // 1067

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1067);   // 첫 닫기 — 그대로 둔다

    // 같은 필드가 여전히 같은 자리(rect.bottom 507)에 있고 키보드가 다시 350px을
    // 가린다 — overshoot 계산은 지금 scrollTop(1067) 위에 다시 21을 더해야 한다.
    // 그 결과가 1046 기준(1046+21=1067, 즉 변화 없음)으로 나오면 삭제된 ref의
    // "원래 자리"가 어딘가에 여전히 살아 있다는 뜻이다.
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1067 + 21));
  });

  it("다른 필드로 재열림해도 첫 사이클과 독립적으로 계산된다", async () => {
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
    stubRectBottom(second, 450);   // 첫째보다 덜 가려짐
    root.scrollTop = 1046;

    first.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(root.scrollTop).toBe(1046 + 21));   // 1067, 첫째 기준

    viewport.closeKeyboard();
    await waitFor(() => expect(keyboardInsetOf(root)).toBe("0px"));
    expect(root.scrollTop).toBe(1067);   // 되돌리지 않았다

    second.focus();
    viewport.openKeyboard(350);
    // overshoot = 450 - 494 + 8 = -36 → 이미 보이므로 스크롤하지 않는다.
    // 첫째의 되돌리기 값(1046)이나 흔적이 끼어들지 않고 지금 scrollTop(1067)이 그대로 유지된다.
    await waitFor(() => expect(keyboardInsetOf(root)).not.toBe("0px"));
    expect(root.scrollTop).toBe(1067);
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

  it("내부 전용 마커 클래스(.keyboard-inset-open)가 --keyboard-inset과 같은 렌더에서 함께 붙고 떨어진다", async () => {
    // css/page.css의 `.app-shell:not(.keyboard-inset-open) .workspace`는 키보드가 진짜
    // 열려 있는 동안(useLayoutEffect가 같은 프레임에서 scrollTop을 미는 동안) 패딩
    // 트랜지션을 꺼서, 아직 늘어나지 않은 레이아웃 때문에 그 scrollTop 증가분이
    // clamp되는 걸 막는다. 이 게이트는 소비 앱이 주는 keyboardOpen prop
    // (.mobile-keyboard-open, 관례상 같은 값이지만 보장되지 않음)이 아니라 AppShell이
    // 내부에서 구독하는 keyboard.open과 반드시 같은 렌더에서 나와야 하므로 별도
    // 클래스다. 이 테스트는 그 계약을 문자열 클래스명으로 고정해, 나중에 className
    // 목록을 리팩터링하다 실수로 합치거나 빠뜨려도 여기서 걸리게 한다.
    const viewport = installFakeVisualViewport(844);
    const root = renderIntoScrollRoot(<Page />);
    const textarea = screen.getByLabelText("메모");
    stubRectBottom(textarea, 507);
    const shellClass = () => (root.querySelector(".app-shell") as HTMLElement).className;

    expect(shellClass()).not.toContain("keyboard-inset-open");

    textarea.focus();
    viewport.openKeyboard(350);
    await waitFor(() => expect(shellClass()).toContain("keyboard-inset-open"));

    viewport.closeKeyboard();
    await waitFor(() => expect(shellClass()).not.toContain("keyboard-inset-open"));
  });
});

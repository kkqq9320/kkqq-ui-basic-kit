// @vitest-environment jsdom

/* `Button` — 옷이 아니라 **표시와 기본값**의 계약.
 *
 * CSS 쪽 계약은 `tests/actionButton.test.ts`가 봅니다(규칙이 있는가). 여기는 짝입니다 —
 * **그 규칙에 닿는 표시를 실제로 붙이는가.** 이 저장소는 둘 중 하나만 있으면 기능이
 * 조용히 죽는다는 것을 `pageChrome`/`summaryGrid` 쌍에서 이미 적어 뒀습니다.
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "../src/Button";

afterEach(cleanup);

const at = (container: HTMLElement) => container.firstElementChild as HTMLButtonElement;

describe("Button: 표시", () => {
  it("킷 옷에 닿는 클래스와 종류를 붙인다", () => {
    const { container } = render(<Button variant="danger">삭제</Button>);
    expect(at(container).className).toBe("action-button");
    expect(at(container).dataset.variant).toBe("danger");
  });

  it("종류를 안 주면 secondary다", () => {
    const { container } = render(<Button>보통</Button>);
    expect(at(container).dataset.variant).toBe("secondary");
  });

  /* 🔴 **폼 안에서 `<button>`의 기본값은 `submit`입니다.** 킷 안에서만 열일곱 곳이
   * `type`을 안 적고 있었고, 그중에는 다이얼로그의 취소 버튼도 있었습니다 — 폼 안에
   * 놓이면 취소가 폼을 보냅니다. 손으로 붙이는 한 계속 빠지는 종류라 컴포넌트가 못박습니다. */
  it("type은 기본이 button이다 — 폼을 보내지 않는다", () => {
    const { container } = render(<Button>보통</Button>);
    expect(at(container).getAttribute("type")).toBe("button");
  });

  it("정말 제출 버튼이 필요하면 넘길 수 있다", () => {
    const { container } = render(<Button type="submit">보내기</Button>);
    expect(at(container).getAttribute("type")).toBe("submit");
  });

  /* §2: 계층은 문맥이 정합니다(다이얼로그·팝오버 안이면 32px). 그래서 안 주면 속성이
   * **아예 안 붙어야** 합니다 — `data-size=""`나 `"undefined"`가 붙으면 CSS의
   * `[data-size="compact"]`는 안 맞지만 속성 선택자를 쓰는 다음 규칙이 걸릴 수 있습니다. */
  it("size를 안 주면 data-size 속성이 아예 없다", () => {
    const { container } = render(<Button>보통</Button>);
    expect(at(container).hasAttribute("data-size")).toBe(false);
  });

  it("size를 주면 그대로 붙는다", () => {
    const { container } = render(<Button size="compact">보통</Button>);
    expect(at(container).dataset.size).toBe("compact");
  });

  /* §14 — 앱이 얹은 클래스가 킷 옷을 **덮으면 안 됩니다.** 스프레드로 넘기던 시절에
   * 정확히 그 사고가 났고, `classNameContract.test.ts`가 전 컴포넌트에 요구하는 계약입니다. */
  it("className은 킷 클래스를 덮지 않고 합쳐진다", () => {
    const { container } = render(<Button className="wide">보통</Button>);
    expect([...at(container).classList].sort()).toEqual(["action-button", "wide"]);
  });
});

describe("Button: 나머지는 그대로 통과시킨다", () => {
  /* 🔴 이것이 통해야 `WheelPicker`의 특수한 셋(`tabIndex={-1}` · `aria-keyshortcuts` ·
   * 포인터 핸들러 스프레드)이 계약을 넓히지 않고 들어옵니다. 브리핑은 그 셋 때문에
   * 계약이 넓어질 것을 걱정했는데, **컴파일러가 아니라고 답했습니다.** */
  it("tabIndex·aria·title이 그대로 간다", () => {
    const { container } = render(<Button tabIndex={-1} aria-keyshortcuts="Enter" title="완료">완료</Button>);
    const button = at(container);
    expect([button.tabIndex, button.getAttribute("aria-keyshortcuts"), button.title]).toEqual([-1, "Enter", "완료"]);
  });

  it("onClick과 disabled가 동작한다", () => {
    const onClick = vi.fn();
    const { container, rerender } = render(<Button onClick={onClick}>누르기</Button>);
    fireEvent.click(at(container));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<Button onClick={onClick} disabled>누르기</Button>);
    fireEvent.click(at(container));
    // 대조군이 위 줄입니다 — disabled가 아니었을 때는 실제로 올라갔습니다.
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(at(container).disabled).toBe(true);
  });

  /* 🔴 여기 `ref` 테스트가 있었고 **로컬에서 초록, CI의 React 18 잡에서 빨강**이었습니다.
   * 함수 컴포넌트의 `ref`-as-prop은 React 19 전용인데 킷의 peer는 `>=18`입니다.
   * 계약에서 `ref`를 뺐으므로(그 이유는 `Button.tsx`에) 이 테스트도 없습니다 —
   * 대신 그 사실을 여기 적어 둡니다. 다음 사람이 "왜 ref가 없지"에서 멈추지 않도록. */
});

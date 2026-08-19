// @vitest-environment jsdom
//
/* **아래로 스크롤하면 숨고 위로 스크롤하면 나타나는 바** — 그 판정 하나.
 *
 * 🔴 **이 공개 훅에 동작 검사가 0건이었습니다**(2026-08-19 실측). 배럴로 내보내는데
 * `tests/publicApi.test.ts`의 **이름 목록에만** 있었습니다. 뒷정리 동사 배터리를 돌리다
 * 정리가 0 red인 것을 보고 파고들었더니, 정리만이 아니라 **훅 전체**가 안 잡혀 있었습니다.
 *
 * 계약은 수 둘과 초기화 셋입니다:
 *
 * ```
 * 18px 누적   그만큼 한 방향으로 가야 판정이 바뀝니다 (미세한 흔들림 무시)
 * 1px 미만    아예 무시 — 트랙패드의 관성 꼬리가 방향을 뒤집지 않게
 * 맨 위 18px  무조건 나타납니다. 누적도 방향도 초기화
 * 방향 전환    누적 초기화 — 아래로 17px 가다 위로 틀면 17이 안 남습니다
 * 판정 뒤      누적 초기화 — 다음 18px이 다시 필요합니다
 * ```
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

import { useScrollDirectionHidden } from "../src/browser/scrollDirection";

/** ⚠️ **만든 루트를 반드시 걷습니다.** `cleanup()`은 RTL이 붙인 컨테이너만 치웁니다 —
 *  손으로 `body`에 붙인 `#root`가 남으면 다음 검사가 만든 같은 id를 `getElementById`가
 *  **못 보고 옛것을 돌려줍니다.** 실제로 그래서 검사 넷이 한꺼번에 빨갰습니다(실측). */
const roots: HTMLElement[] = [];
afterEach(() => { cleanup(); roots.splice(0).forEach((root) => root.remove()); });

/** 스크롤 루트를 만들어 붙입니다. jsdom은 레이아웃이 없으므로 `scrollTop`을 직접 씁니다. */
function makeRoot(id: string) {
  const root = document.createElement("div");
  root.id = id;
  document.body.appendChild(root);
  roots.push(root);
  return root;
}

function scrollTo(root: HTMLElement, top: number) {
  root.scrollTop = top;
  act(() => { fireEvent.scroll(root); });
}

/** 훅의 판정을 화면에 드러내는 탐침 — 상태를 직접 못 보므로 텍스트로 읽습니다. */
function probe(rootId = "root") {
  const seen: boolean[] = [];
  const Probe = () => {
    const [hidden] = useScrollDirectionHidden(rootId);
    seen.push(hidden);
    return <span data-testid="hidden">{String(hidden)}</span>;
  };
  return { Probe, hidden: () => seen[seen.length - 1] };
}

describe("useScrollDirectionHidden", () => {
  it("아래로 18px 넘게 가면 숨는다", () => {
    const root = makeRoot("root");
    const { Probe, hidden } = probe();
    render(<Probe />);

    scrollTo(root, 100);   // 맨 위(18) 밖으로, 아래로 100
    expect(hidden()).toBe(true);
  });

  /* 🔴 **임계가 없으면 바가 스크롤마다 깜빡입니다.** 18은 미세한 흔들림과 실제 의도를
   * 가르는 수입니다.
   *
   * ⚠️ **맨 위 구역(≤18) 밖에서 시작해야 합니다.** 안 그러면 "맨 위라서 나타난다"와
   * "누적이 모자라서 안 숨는다"가 **구별되지 않습니다** — 렌더 전에 `scrollTop`을
   * 미리 100으로 두는 이유입니다(효과가 그 값을 시작점으로 잡습니다).
   *
   * 그리고 **둘로 쪼갭니다.** 한 `it` 안에 두면 앞 단언이 터질 때 뒤가 실행조차 안 돼,
   * 어느 쪽이 깨졌는지 모르게 됩니다. */
  it("누적이 18에 못 미치면 안 숨는다 — 임계", () => {
    const root = makeRoot("root");
    root.scrollTop = 100;
    const { Probe, hidden } = probe();
    render(<Probe />);

    scrollTo(root, 110);   // 아래로 10 — 맨 위 밖이고 방향도 맞지만 누적이 모자랍니다
    expect(hidden()).toBe(false);
  });

  it("같은 방향으로 더 가 누적이 18에 닿으면 그때 숨는다 — 대조군", () => {
    const root = makeRoot("root");
    root.scrollTop = 100;
    const { Probe, hidden } = probe();
    render(<Probe />);

    scrollTo(root, 110);   // 누적 10
    scrollTo(root, 120);   // 누적 20 → 판정
    expect(hidden()).toBe(true);
  });

  it("위로 18px 넘게 되돌리면 다시 나타난다", () => {
    const root = makeRoot("root");
    const { Probe, hidden } = probe();
    render(<Probe />);

    scrollTo(root, 200);
    expect(hidden()).toBe(true);
    scrollTo(root, 150);   // 위로 50
    expect(hidden()).toBe(false);
  });

  /* 방향이 바뀌면 누적을 버립니다. 안 버리면 **아래로 17px 가다 위로 2px만 틀어도**
   * 합이 19가 되어 "위로 스크롤"로 판정됩니다. */
  it("방향이 바뀌면 누적을 버린다", () => {
    const root = makeRoot("root");
    const { Probe, hidden } = probe();
    render(<Probe />);

    scrollTo(root, 200);            // 숨음
    expect(hidden()).toBe(true);
    scrollTo(root, 217);            // 아래로 17 — 누적 17
    scrollTo(root, 215);            // 위로 2 — 버리지 않으면 19가 되어 나타남
    expect(hidden()).toBe(true);
  });

  it("맨 위 18px 안에서는 무조건 나타난다", () => {
    const root = makeRoot("root");
    const { Probe, hidden } = probe();
    render(<Probe />);

    scrollTo(root, 500);
    expect(hidden()).toBe(true);
    scrollTo(root, 10);   // 맨 위 근처 — 아래로 갔든 위로 갔든 나타나야 합니다
    expect(hidden()).toBe(false);
  });

  /* 🔴 **뒷정리.** 스크롤 루트가 갈리면 옛 루트의 리스너를 떼야 합니다. 안 떼면 **더는
   * 쓰지 않는 컨테이너의 스크롤이 바를 숨깁니다** — 이 검사가 없을 때 정리를 통째로
   * 지우는 변이가 1705개 전부 초록이었습니다. */
  it("스크롤 루트가 갈리면 옛 루트는 더는 판정을 못 바꾼다", () => {
    const first = makeRoot("first");
    const second = makeRoot("second");
    const seen: boolean[] = [];
    const Probe = ({ rootId }: { rootId: string }) => {
      const [hidden] = useScrollDirectionHidden(rootId);
      seen.push(hidden);
      return null;
    };

    const view = render(<Probe rootId="first" />);
    scrollTo(first, 300);
    expect(seen[seen.length - 1]).toBe(true);   // 전제 — 옛 루트가 실제로 먹히고 있었다

    view.rerender(<Probe rootId="second" />);
    scrollTo(second, 400);
    scrollTo(second, 100);                      // 새 루트로 되돌려 나타나게 만든다
    expect(seen[seen.length - 1]).toBe(false);

    scrollTo(first, 900);                       // 옛 루트를 아무리 굴려도
    expect(seen[seen.length - 1]).toBe(false);  // 판정은 안 바뀐다
  });
});

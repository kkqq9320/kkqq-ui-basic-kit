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

  /* 🔴 **처음 쓴 이 검사는 게이트를 못 쟀습니다.** 500 → 10은 위로 490이라 **평범한
   * 방향 판정만으로도** 나타납니다 — 게이트를 통째로 없애는 변이가 0 red였습니다.
   * 두 원인이 픽스처에서 같은 답을 내면 그 검사는 둘을 못 가릅니다.
   *
   * 가르려면 **누적이 모자란 위쪽 이동이 맨 위 구역에 닿게** 해야 합니다. 게이트가
   * 없으면 10px로는 아무 일도 안 일어나 숨은 채로 남습니다. */
  it("맨 위 18px 안에 닿으면 누적이 모자라도 나타난다 — 게이트", () => {
    const root = makeRoot("root");
    const { Probe, hidden } = probe();
    render(<Probe />);

    scrollTo(root, 25);    // 아래로 25 → 숨음 (맨 위 구역 바로 밖)
    expect(hidden()).toBe(true);
    scrollTo(root, 15);    // 위로 10뿐 — 누적은 모자라지만 맨 위 구역에 닿았습니다
    expect(hidden()).toBe(false);
  });

  /* 게이트는 나타내기만 하는 게 아니라 **누적과 방향도 버립니다.** 안 버리면 맨 위를
   * 지나온 뒤의 첫 짧은 이동이 **옛 누적을 이어받아** 곧바로 판정을 뒤집습니다. */
  it("맨 위를 지나면 누적과 방향을 버린다", () => {
    const root = makeRoot("root");
    root.scrollTop = 100;
    const { Probe, hidden } = probe();
    render(<Probe />);

    scrollTo(root, 110);   // 아래로 10 — 누적 10 (아직 판정 없음)
    scrollTo(root, 15);    // 맨 위 구역: 나타나고, 누적·방향을 버립니다
    expect(hidden()).toBe(false);

    scrollTo(root, 30);    // 아래로 15 — 버렸으면 15뿐이라 모자랍니다
    expect(hidden()).toBe(false);   // 안 버렸으면 10+15=25로 숨어 버립니다
  });

  /* 🔴 **1px 미만은 방향으로도 안 칩니다.** 트랙패드의 관성 꼬리가 0.5px씩 반대로
   * 튀는데, 그것을 방향 전환으로 받으면 **모으던 누적이 매번 버려져** 바가 영영
   * 안 숨습니다. 그래서 게이트가 `setHidden`보다 **앞에** 있습니다.
   *
   * ⚠️ 가르려면 누적이 임계 **직전**일 때 미세하게 튀어야 합니다 — 그냥 0.5px만
   * 밀면 게이트가 있든 없든 아무 일도 안 일어나 구별이 안 됩니다. */
  it("1px 미만의 반대 방향 흔들림은 누적을 안 버린다", () => {
    const root = makeRoot("root");
    root.scrollTop = 100;
    const { Probe, hidden } = probe();
    render(<Probe />);

    scrollTo(root, 117);     // 아래로 17 — 임계 직전
    scrollTo(root, 116.5);   // 위로 0.5 — 무시돼야 합니다
    scrollTo(root, 118.5);   // 아래로 2 → 17+2 = 19 → 숨음
    expect(hidden()).toBe(true);
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
  /* 📌 **`setHidden` 뒤의 `distance = 0`은 관찰 차이가 없습니다**(2026-08-19 실측).
   * 그 줄을 지우는 변이는 0 red인데, **못 잡는 게 아니라 잡을 것이 없습니다**:
   *
   *   판정 뒤 같은 방향으로 더 가면 → 같은 값으로 `setHidden`을 다시 부를 뿐입니다
   *   방향을 바꾸면 → 그 자리에서 어차피 누적을 버립니다
   *
   * 즉 남은 누적이 바꿀 수 있는 것은 **이미 그 값인 상태**뿐입니다. 이 저장소의 규칙대로
   * *등가*와 *못 밟음*을 갈라 적습니다 — 여기 검사를 억지로 만들면 그 검사는 화면에
   * 안 보이는 것을 재게 되고, 나중에 정당한 정리를 막습니다. */
});

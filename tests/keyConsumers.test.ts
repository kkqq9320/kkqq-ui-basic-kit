/// <reference types="vite/client" />

/* **스펙 §2.1의 표가 낡지 않게 지킵니다.**
 *
 * 규칙 1(`defaultPrevented`면 트리거 안 함)이 성립하는 근거는 "킷의 키 소비자 중
 * `preventDefault`를 안 부르는 자리는 document 리스너 넷뿐이고, 그 넷이 먹는 키는
 * `Escape`·`Tab`뿐"이라는 실측입니다. 그 둘은 조합 공간에서 빠져 있습니다(§6.2).
 *
 * **새 소비자가 생기면 여기가 빨개집니다.** 그때 할 일은 목록에 더하는 것이 아니라,
 * 그 소비자가 `preventDefault`를 부르는지 먼저 보는 것입니다.
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob("../src/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** 파일별 "keydown이 결합된 자리" 수 — `addEventListener("keydown", …)`과
 * `onKeyDown={…}`을 합쳐 실제로 센 개수입니다. 두 종류를 같은 뜻(자리 수)으로
 * 세므로, 같은 핸들러를 `onKeyDown`에 두 번 걸면(`Select.tsx`처럼 트리거 버튼과
 * 메뉴에 각각) 그대로 2입니다. **이 숫자가 늘면 §2.1의 표를 다시 재야 합니다.** */
const KNOWN_CONSUMERS: Record<string, number> = {
  "../src/DateWheelPicker.tsx": 1,
  "../src/Select.tsx": 2,
  "../src/Dialog.tsx": 1,
  "../src/hooks.ts": 1,
  "../src/SectionTabs.tsx": 2,
  "../src/PageChrome.tsx": 1,
  "../src/ShortcutProvider.tsx": 1,
  "../src/ShortcutSettings.tsx": 1,
};

function keydownSites(source: string): number {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const listeners = withoutComments.match(/addEventListener\(\s*"keydown"/g)?.length ?? 0;
  const props = withoutComments.match(/onKeyDown=\{/g)?.length ?? 0;
  return listeners + props;   // 둘 다 실제 개수 — 자리가 하나 늘면 이 합도 하나 는다
}

describe("킷의 키 소비자 전수 (스펙 §2.1)", () => {
  // 전제 — glob이 비면 아래가 전부 공허하게 통과합니다.
  it("src의 소스를 실제로 읽었다", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(8);
    expect(Object.values(sources).every((source) => source.length > 100)).toBe(true);
  });

  it("키를 먹는 파일과 그 개수가 적어 둔 것과 같다", () => {
    const found = Object.fromEntries(
      Object.entries(sources).map(([path, source]) => [path, keydownSites(source)]).filter(([, count]) => (count as number) > 0),
    );
    expect(found).toEqual(KNOWN_CONSUMERS);
  });
});

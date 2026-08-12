/// <reference types="vite/client" />

/* **스펙 §2.1의 표가 낡지 않게 지킵니다.**
 *
 * 규칙 1(`defaultPrevented`면 트리거 안 함)이 성립하는 근거는 "킷의 키 소비자 중
 * `preventDefault`를 안 부르는 자리는 document 리스너 넷뿐이고, 그 넷이 먹는 키는
 * `Escape`·`Tab`뿐"이라는 실측입니다. 그 둘은 조합 공간에서 빠져 있습니다(§6.2).
 *
 * **새 소비자가 생기면 여기가 빨개집니다.** 그때 할 일은 목록에 더하는 것이 아니라,
 * 그 소비자가 `preventDefault`를 부르는지 먼저 보는 것입니다.
 *
 * ⚠️ **`ShortcutSettings.tsx`는 아직 없습니다** — Task 5가 만듭니다. 그 파일이 생기면
 * 여기 `KNOWN_CONSUMERS`에 한 줄을 더해야 합니다(그 파일도 키 녹음기라 keydown을
 * 먹을 것이 거의 확실합니다 — §6). 지금은 실측대로 뺐습니다.
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob("../src/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** 파일별 keydown 리스너 수. **이 숫자가 늘면 §2.1의 표를 다시 재야 합니다.** */
const KNOWN_CONSUMERS: Record<string, number> = {
  "../src/DateWheelPicker.tsx": 1,
  "../src/Select.tsx": 1,
  "../src/Dialog.tsx": 1,
  "../src/hooks.ts": 1,
  "../src/SectionTabs.tsx": 2,
  "../src/PageChrome.tsx": 1,
  "../src/ShortcutProvider.tsx": 1,
};

function keydownSites(source: string): number {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const listeners = withoutComments.match(/addEventListener\(\s*"keydown"/g)?.length ?? 0;
  const props = withoutComments.match(/onKeyDown=\{/g)?.length ?? 0;
  return listeners + (props > 0 ? 1 : 0);   // 같은 핸들러를 두 자리에 걸어도 소비자는 하나
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

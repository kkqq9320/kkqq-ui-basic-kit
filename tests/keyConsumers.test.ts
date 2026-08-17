/// <reference types="vite/client" />

/* **스펙 §2.1 표의 '부착 자리' 열이 낡지 않게 지킵니다.**
 *
 * 규칙 1(`defaultPrevented`면 트리거 안 함)이 성립하는 근거는 "킷의 키 소비자 중
 * `preventDefault`를 안 부르는 자리는 document 리스너 다섯뿐이고, 그 다섯이 먹는
 * 키는 `Escape`·`Tab`뿐"이라는 실측입니다. 그 둘은 조합 공간에서 빠져 있습니다(§6.2).
 *
 * **새 파일이 키를 먹기 시작하거나 자리 수가 바뀌면 여기가 빨개집니다.** 그때 할
 * 일은 `KNOWN_CONSUMERS`에 숫자만 맞춰 더하는 것이 아니라, 그 소비자가
 * `preventDefault`를 부르는지 먼저 보고 §2.1 표를 사람이 다시 재는 것입니다.
 *
 * ⚠️ **이 검사가 실제로 재는 것은 개수(파일별 attachment 자리 수)뿐입니다.**
 * `keydownSites()`는 `addEventListener("keydown", …)`·`onKeyDown={…}`가 나온 자리
 * 수만 셉니다 — 그 핸들러가 `preventDefault`를 부르는지, 어떤 키(`event.code`)를
 * 먹는지는 전혀 안 봅니다. 그래서 **기존 파일 안에 분기가 하나 늘어 조용히 새 키를
 * 먹기 시작해도, 자리 수가 그대로면 이 검사는 계속 초록입니다.** §2.1 표의
 * "Ctrl/Meta 조합"·"preventDefault" 두 열이 실제와 같은지는 사람이 소스를 다시
 * 읽어야 확인됩니다 — 이 검사는 "자리 수가 달라졌다"까지만 보장합니다. (전체 리뷰
 * Important 3-가 — §10-1 문구를 이 검사가 실제로 재는 범위로 좁혔습니다.)
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob("../src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** 파일별 "부착 자리" 수 — `addEventListener("keydown", …)`과 `onKeyDown={…}`을
 * 합쳐 실제로 센 개수입니다(§2.1 표의 '부착 자리' 열과 같은 단위). 두 종류를 같은
 * 뜻(자리 수)으로 세므로, 같은 핸들러를 `onKeyDown`에 두 번 걸면(`Select.tsx`처럼
 * 트리거 버튼과 메뉴에 각각) 그대로 2입니다. **이 숫자가 늘면 §2.1의 표를 다시
 * 재야 합니다.** */
const KNOWN_CONSUMERS: Record<string, number> = {
  "../src/controls/WheelPicker.tsx": 1,
  "../src/controls/Select.tsx": 2,
  "../src/surfaces/Dialog.tsx": 1,
  "../src/browser/popupDismiss.ts": 1,
  "../src/surfaces/SectionTabs.tsx": 2,
  "../src/surfaces/PageChrome.tsx": 1,
  "../src/shortcuts/ShortcutProvider.tsx": 1,
  "../src/shortcuts/ShortcutSettings.tsx": 1,
  /* 2026-08-13 추가. **숫자만 맞춘 것이 아니라 §2.1 표를 다시 쟀습니다**(이 파일 위
   * 주석이 요구하는 절차입니다): `SegmentedControl`은 Ctrl·Meta·Alt가 눌리면 즉시
   * 반환하고, 처리한 분기(←·→·↑·↓·Home·End)마다 `preventDefault`를 부릅니다 —
   * 규칙 1이 성립하는 쪽이라 단축키와 겨루지 않습니다. */
  "../src/controls/SegmentedControl.tsx": 1,
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

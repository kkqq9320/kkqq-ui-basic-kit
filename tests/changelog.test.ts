/// <reference types="vite/client" />

/* `CHANGELOG.md`의 맨 위 버전과 `package.json`의 버전이 갈리지 않게 지킵니다.
 *
 * 이 저장소는 태그로 버전을 답니다. 태그·`package.json`·CHANGELOG 셋 중 하나만 안 올리면
 * 소비 프로젝트는 **틀린 것을 보고 판단합니다** — 설치된 패키지의 `version`을 읽거나,
 * CHANGELOG를 보고 "우리는 이미 그 버전"이라고 넘겨짚습니다.
 *
 * 태그 자체는 여기서 못 봅니다(작업 트리에 git 정보가 없습니다). 그래서 이 테스트가
 * 지키는 것은 **파일 둘의 일치**까지이고, 태그는 릴리스 절차에서 `package.json`을 보고
 * 답니다. 그 한계를 적어 둡니다 — 지키지 못하는 것을 지킨다고 하면 안 됩니다.
 */
import { describe, expect, it } from "vitest";

import changelogText from "../CHANGELOG.md?raw";
import packageJsonText from "../package.json?raw";

const packageVersion = (JSON.parse(packageJsonText) as { version: string }).version;
// `## v0.2.0 — 2026-08-11` 꼴의 릴리스 머리말만 고릅니다. 위쪽 설명문의 코드블록에도
// `#v0.2.0`이 나오므로 **줄 시작의 `## v`**로 한정합니다.
const releaseHeadings = [...changelogText.matchAll(/^## v(\d+\.\d+\.\d+)/gm)].map((match) => match[1]);

describe("CHANGELOG와 package.json이 같은 버전을 말한다", () => {
  // 전제 확인 — 릴리스 항목이 하나도 없으면 아래 단정들은 지킬 대상이 없고,
  // "전부 일치했다"가 공허하게 통과합니다.
  it("릴리스 항목이 하나 이상 있다", () => {
    expect(releaseHeadings.length).toBeGreaterThan(0);
  });

  it("맨 위 항목이 package.json의 버전이다", () => {
    expect(releaseHeadings[0]).toBe(packageVersion);
  });

  // 같은 버전을 두 번 적으면 어느 쪽이 진짜인지 알 수 없습니다.
  it("같은 버전이 두 번 나오지 않는다", () => {
    expect(releaseHeadings.length).toBe(new Set(releaseHeadings).size);
  });

  // 이 저장소는 태그로 거는 방식이므로, 소비자가 실제로 칠 명령이 문서에 있어야 합니다.
  it("태그로 거는 설치 명령을 적어 둔다", () => {
    expect(changelogText).toContain(`#v${packageVersion}`);
  });
});

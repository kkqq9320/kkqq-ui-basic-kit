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

/* 릴리스 제목 아래의 "전체 diff" 링크. 오너는 커밋 스무 개를 훑는 대신 이 링크로 릴리스를
 * 통째로 검토합니다 — 즉 이 줄이 빠지면 검토 방법 자체가 없어집니다.
 *
 * 손으로 붙이는 줄은 다음 릴리스에서 잊힙니다. 이 저장소는 같은 실수를 이미 여러 번
 * 했습니다(주석에 적힌 개수가 두 번 낡음). **문서에 "잊지 말자"고 적는 대신 여기서
 * 지킵니다.** 릴리스 절차가 늘어난 것이 아니라, 빠뜨리면 빨개지는 것으로 바꾼 것입니다. */
const releaseSections = changelogText.split(/^## v/m).slice(1).map((body) => `## v${body}`);
const versionOf = (section: string) => section.match(/^## v(\d+\.\d+\.\d+)/)![1];
// 맨 아래(가장 오래된) 릴리스는 비교 대상이 없으므로 짝에서 빠집니다.
const comparePairs = releaseSections.slice(0, -1).map((section, index) => ({
  version: versionOf(section),
  previous: versionOf(releaseSections[index + 1]),
  section,
}));

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

  // **소비자가 설치본 안에서 읽을 수 있어야 합니다.** 버전을 올리기 전에 "무엇이 깨지고
  // 무엇을 눈으로 볼지"를 보는 자리가 여기인데, `files`에 없으면 `node_modules`에
  // 안 들어갑니다. `PRINCIPLES.md`를 함께 싣는 것과 같은 이유입니다 — 계약은 코드가
  // 있는 자리에 있어야 합니다. (킷 스킬이 "CHANGELOG를 읽으세요"라고 안내하므로,
  // 이게 빠지면 스킬이 없는 파일을 가리키게 됩니다.)
  it("CHANGELOG가 배포 목록에 있다", () => {
    expect((JSON.parse(packageJsonText) as { files: string[] }).files).toContain("CHANGELOG.md");
  });
});

describe("릴리스마다 전체 diff 링크가 있다", () => {
  // 전제 확인 — 짝이 하나도 없으면 아래 it.each가 **한 번도 안 돌고** 초록입니다.
  it("비교할 짝이 하나 이상 있다", () => {
    expect(comparePairs.length).toBeGreaterThan(0);
  });

  /* ⚠️ 제목에 `$previous...v$version`처럼 쓰면 vitest가 `$previous...v`를 **속성 경로로**
   * 읽어 `vundefined`가 됩니다(실측). 값을 두 개 이어 붙이지 않습니다. */
  it.each(comparePairs)("v$version 아래에 직전 태그와의 compare 링크가 있다", ({ version, previous, section }) => {
    expect(section).toContain(`/compare/v${previous}...v${version}`);
  });
});

/// <reference types="vite/client" />

/* **배포되는 문서가 가리키는 소스 경로는 실제로 있어야 합니다.**
 *
 * 🔴 `src/`가 폴더로 묶인 뒤(PR #114·#115) **넷이 안 따라왔습니다** — `src/Dialog.tsx`,
 * `src/shortcuts.ts`, `src/SectionTabs.tsx`, `src/positioning.ts`. §15가 *"주석 인용은
 * 폴더까지 붙여 씁니다"* 라고 이미 적어 두고 있는데, **문서 본문은 아무도 안 보고
 * 있었습니다.** 이제 검사가 봅니다 — 다음 재편 때 또 남지 않게.
 */
import { describe, expect, it } from "vitest";

const docs = import.meta.glob("../*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/* ⚠️ **glob 키는 이 파일 기준의 상대 경로입니다.** `../tests/**` 는 이 파일이 `tests/`
 *  안에 있으므로 `./AppShell.test.tsx`로 옵니다 — `../tests/AppShell.test.tsx`가
 *  아닙니다(실측). 처음에 그것을 가정했다가 **실재하는 검사 파일 여섯이 "없음"으로**
 *  나왔습니다. 그래서 묶음마다 접두사를 손으로 붙입니다.
 *
 *  📌 `node:fs`로 파일을 직접 보는 쪽이 짧지만 `@types/node`가 이 저장소에 없어
 *  `tsc`가 막습니다 — 검사 하나 때문에 의존성을 늘리지 않습니다. */
function pathsUnder(prefix: string, keys: string[]): string[] {
  return keys.map((key) => prefix + key.replace(/^\.\.\/[^/]+\//, "").replace(/^\.\//, ""));
}

const existing = new Set<string>([
  ...pathsUnder("src/", Object.keys(import.meta.glob("../src/**/*", { query: "?raw", import: "default", eager: true }))),
  ...pathsUnder("css/", Object.keys(import.meta.glob("../css/**/*", { query: "?raw", import: "default", eager: true }))),
  ...pathsUnder("demo/", Object.keys(import.meta.glob("../demo/**/*", { query: "?raw", import: "default", eager: true }))),
  ...pathsUnder("tests/", Object.keys(import.meta.glob("../tests/**/*", { query: "?raw", import: "default", eager: true }))),
]);

/* 🔴 **`CHANGELOG.md`는 뺍니다 — 그건 역사입니다.** `v0.12.0` 절이 `src/WheelPicker.tsx`를
 * 가리키는 것은 **그때 맞았던 말**이고, 지금 경로로 고치면 그 릴리스에 없던 파일을
 * 가리키게 됩니다. 릴리스 노트는 쓰인 시점의 저장소를 말합니다. */
const HISTORY = new Set(["CHANGELOG.md"]);

/* 실제 참조가 아니라 **나쁜 이름의 가정 예시**. §15가 *"이렇게 바꾸면 안 된다"* 를
 * 보이려고 일부러 없는 이름을 씁니다 — 고치면 그 문단의 뜻이 사라집니다. */
const HYPOTHETICAL = new Set(["tests/storage.test.ts"]);

/** 문서 안에서 백틱으로 감싼 소스 경로.
 *  ⚠️ `tsx`를 `ts`보다 **먼저** 씁니다 — 뒤에 두면 `Foo.tsx`가 `Foo.ts`로 잘려 없는
 *  경로로 보입니다(실측: 오탐 다섯). */
function referencedPaths(text: string): string[] {
  return [...text.matchAll(/`((?:src|css|tests|demo)\/[\w./-]+\.(?:tsx|ts|css|md))`/g)].map((m) => m[1]);
}

describe("배포 문서가 가리키는 소스 경로", () => {
  /* 전제 둘 — 어느 쪽이 비어도 아래가 **공허하게** 통과합니다. */
  it("전제: 문서에서 경로를, 저장소에서 파일을 실제로 찾아냈다", () => {
    const referenced = Object.values(docs).flatMap(referencedPaths);
    expect([referenced.length > 20, existing.has("src/index.ts"), existing.has("tests/publicApi.test.ts")])
      .toEqual([true, true, true]);
  });

  /* **exhaustive 형태입니다** — 하나씩 단언하면 첫 실패에서 멈춰 나머지가 안 보입니다. */
  it("전부 실제로 있는 파일이다", () => {
    const dead: string[] = [];
    for (const [path, text] of Object.entries(docs)) {
      const name = path.replace("../", "");
      if (HISTORY.has(name)) continue;
      for (const target of referencedPaths(text)) {
        if (HYPOTHETICAL.has(target) || existing.has(target)) continue;
        dead.push(`${name} → ${target}`);
      }
    }
    expect([...new Set(dead)].sort()).toEqual([]);
  });

  /* 예외로 올린 이름이 **정말 없는 파일**인지 다시 잽니다. 나중에 그 이름의 파일이
   * 생기면 예외가 무의미해지고, 그때 이 검사가 알려 줍니다. */
  it("가정 예시로 뺀 이름은 실제로 없는 파일이다", () => {
    expect([...HYPOTHETICAL].filter((name) => existing.has(name))).toEqual([]);
  });
});

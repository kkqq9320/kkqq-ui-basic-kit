/// <reference types="vite/client" />

/* **`src/`의 파일 이름 규칙과 의존 방향을 기계가 지킵니다.**
 *
 * 이 저장소는 **대소문자로 종류를 구별하는 관습**을 처음부터 지키고 있었습니다 —
 * 대문자 `.tsx`는 컴포넌트, 소문자 `.ts`는 컴포넌트가 아닌 것(순수 계산·훅·DOM 헬퍼).
 * 🔴 그런데 그 규칙이 **어디에도 적혀 있지 않았고**, 지키는 것은 다음 사람의 눈썰미
 * 뿐이었습니다. 이제 `PRINCIPLES.md` §15에 적혀 있고, 여기가 그것을 잽니다.
 *
 * 규칙을 글로만 적으면 안 되는 이유는 이 저장소가 이미 겪었습니다 — 관습으로만 있던
 * 동안 **거꾸로 가는 화살표가 하나 생겼습니다**: `selectKeyboard.ts`(순수 계산)가
 * `Select.tsx`(컴포넌트)에서 타입을 가져오고 있었습니다. `import type`이라 런타임
 * 비용은 0이었지만, 그 파일의 머리말이 "표현을 고르기 전에 이 파일이 먼저 있었다"고
 * 적어 둔 것과 정면으로 어긋납니다. 눈으로는 몇 달 동안 안 보였습니다.
 */
import { describe, expect, it } from "vitest";

import principles from "../PRINCIPLES.md?raw";

const sources = import.meta.glob("../src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const componentModules = import.meta.glob("../src/**/*.tsx", { eager: true }) as Record<string, Record<string, unknown>>;

type Module = { id: string; file: string; isComponentFile: boolean; source: string; deps: string[] };

/** `../src/a/b.tsx` → `a/b` */
function toId(path: string) {
  return path.replace("../src/", "").replace(/\.tsx?$/, "");
}

/** `a/b`에서 본 `../c` → `c`. 확장자는 붙지 않으므로 id끼리 바로 비교됩니다. */
function resolveFrom(id: string, specifier: string) {
  const base = id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "";
  const parts = (base ? `${base}/${specifier}` : specifier).split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

const modules: Module[] = Object.entries(sources).map(([path, source]) => {
  const id = toId(path);
  const name = id.slice(id.lastIndexOf("/") + 1);
  const deps = [...source.matchAll(/from\s+"(\.[^"]+)"/g)].map((match) => resolveFrom(id, match[1]));
  return { id, file: path.replace("../src/", ""), isComponentFile: /^[A-Z]/.test(name), source, deps };
});

const byId = new Map(modules.map((module) => [module.id, module]));
const internalEdges = modules.flatMap((module) => module.deps.filter((dep) => byId.has(dep)).map((dep) => [module.id, dep] as const));

describe("src/ 파일 이름 규칙과 의존 방향 (PRINCIPLES §15)", () => {
  /* 전제 — glob이 0건이거나 import 정규식이 아무것도 못 잡으면 아래 검사가 전부
   * **공허하게** 통과합니다. `src/`를 통째로 지워도 초록이 됩니다. */
  it("파일과 의존 관계를 실제로 읽어냈다", () => {
    expect(modules.length).toBeGreaterThan(20);
    expect(internalEdges.length).toBeGreaterThan(20);
    expect(modules.map((module) => module.file)).toContain("index.ts");
  });

  /* §15 규칙 1 — 확장자와 첫 글자가 같은 것을 말합니다. `.tsx`는 대문자로 시작하는
   * 컴포넌트 파일, `.ts`는 소문자로 시작하는 모듈. 예외를 두면 그 순간 규칙이 관습으로
   * 돌아갑니다(그 상태가 이 파일이 생긴 이유입니다). */
  it("`.tsx`는 대문자로, `.ts`는 소문자로 시작한다", () => {
    const wrong = modules
      .filter((module) => module.isComponentFile !== module.file.endsWith(".tsx"))
      .map((module) => module.file);
    expect(wrong).toEqual([]);
  });

  /* §15 규칙 4 — 컴포넌트 파일 이름은 그 파일의 대표 컴포넌트를 말합니다. 소스 문자열을
   * 흉내 내지 않고 실제 모듈을 불러, 파일 이름과 같은 런타임 export가 있는지 봅니다.
   * 이름에 해당하는 심볼 없이 서로 무관한 컴포넌트만 모으면 이 검사가 그 파일 이름을
   * 그대로 보고합니다. */
  it("컴포넌트 파일은 파일 이름과 같은 컴포넌트를 내보낸다", () => {
    const entries = Object.entries(componentModules);
    // 전제 — glob이 빈 목록이면 아래 검사가 공허하게 통과합니다.
    expect(entries.length).toBeGreaterThan(10);
    const missing = entries
      .map(([path, exports]) => ({ file: path.replace("../src/", ""), name: /([^/]+)\.tsx$/.exec(path)?.[1], exports }))
      .filter((entry) => !entry.name || !(entry.name in entry.exports))
      .map((entry) => entry.file);
    expect(missing).toEqual([]);
  });

  /* §15 — **폴더 안에서는 접두사를 되풀이하지 않습니다.** 폴더가 이미 말한 것을 파일
   * 이름이 다시 말하면 이름이 아무것도 안 말합니다: `shortcuts/shortcuts.ts`를 열기
   * 전에는 안에 무엇이 있는지 알 수 없었습니다.
   *
   * **컴포넌트 파일은 해당 없습니다** — `shortcuts/ShortcutProvider.tsx`의 `Shortcut`은
   * 되풀이가 아니라 **내보내는 컴포넌트의 이름**이고, 규칙 1이 파일 이름과 공개 이름을
   * 같게 요구합니다. 그래서 소문자 모듈만 봅니다. */
  it("소문자 모듈 이름이 자기 폴더 이름을 되풀이하지 않는다", () => {
    const inFolders = modules.filter((module) => !module.isComponentFile && module.id.includes("/"));
    // 전제 — 폴더 안 소문자 모듈이 없으면 아래가 공허합니다.
    expect(inFolders.length).toBeGreaterThan(5);
    const repeated = inFolders
      .filter((module) => {
        /* 🔴 **경로 조각을 전부 봅니다.** 처음엔 `indexOf("/")`로 **첫 조각만** 봤는데,
         * 두 겹 폴더(`model/instant/`)가 생기자 안쪽 이름(`instant`)에는 아무것도 안
         * 닿았습니다 — `model/instant/instantModel.ts` 같은 것을 통과시킵니다. */
        const segments = module.id.split("/").slice(0, -1);
        const name = module.id.slice(module.id.lastIndexOf("/") + 1);
        return segments.some((folder) => {
          const singular = folder.endsWith("s") ? folder.slice(0, -1) : folder;
          return name.toLowerCase().startsWith(folder.toLowerCase()) || name.toLowerCase().startsWith(singular.toLowerCase());
        });
      })
      .map((module) => module.file);
    expect(repeated).toEqual([]);
  });

  /* §15 규칙 2 — 소문자 모듈은 컴포넌트를 렌더하지 않습니다. JSX가 들어가면 파일이
   * `.tsx`여야 하고, 그러면 규칙 1이 먼저 빨개집니다. 여기서는 "컴포넌트를 내보내는가"를
   * 봅니다 — JSX 없이 `createElement`로 써도 잡히도록 이름 규칙으로 판정합니다. */
  it("소문자 모듈은 대문자 함수(컴포넌트)를 내보내지 않는다", () => {
    const offenders = modules
      .filter((module) => !module.isComponentFile)
      .flatMap((module) => [...module.source.matchAll(/export function ([A-Z]\w*)/g)].map((match) => `${module.file}: ${match[1]}`));
    expect(offenders).toEqual([]);
  });

  /* 🔴 §15 규칙 3 — **방향.** 소문자 모듈이 컴포넌트 파일을 import 하면(타입이라도)
   * 층이 거꾸로 갑니다. 이것이 실제로 일어났던 위반이고, 이 줄이 그 재발을 잡습니다.
   *
   * 예외는 **배럴 하나뿐**입니다 — `index.ts`는 공개 API 목록이라 모든 컴포넌트를 다시
   * 내보내는 것이 그 파일의 일 전부입니다. 아래에서 "정말 다시 내보내기만 하는가"를
   * 따로 재므로, 이 예외를 방패 삼아 로직이 흘러들어오면 그쪽이 빨개집니다. */
  it("소문자 모듈은 컴포넌트 파일을 import 하지 않는다 (배럴 제외)", () => {
    const backwards = internalEdges
      .filter(([from, to]) => from !== "index" && !byId.get(from)!.isComponentFile && byId.get(to)!.isComponentFile)
      .map(([from, to]) => `${from} → ${to}`);
    expect(backwards).toEqual([]);
  });

  /* 위 예외의 근거("배럴은 다시 내보내기만 한다")를 여기서 다시 잽니다 — 주석에만 적힌
   * 근거는 아무도 다시 재지 않는다는 것이 이 저장소의 기록된 규칙입니다. 주석과 빈 줄을
   * 걷어낸 뒤 남는 줄은 전부 `export … from "./…"` 여야 합니다. */
  it("배럴은 다시 내보내기만 한다 — 그래서 위 예외가 성립한다", () => {
    const code = byId.get("index")!.source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//"));
    expect(code.length).toBeGreaterThan(15);
    expect(code.filter((line) => !/^export\s*\{[^}]*\}\s*from\s*"\.\/[^"]+";$/.test(line))).toEqual([]);
  });

  /* §15의 "아직 이 규칙을 안 지키는 자리" 표는 `surfaces/AppShell.tsx (약 1060줄)` 처럼 **크기를**
   * 적습니다. 이 저장소의 기록된 규칙은 *"주석에 적은 숫자는 아무도 다시 재지 않는다 —
   * 단언으로 옮겨라"* 입니다(링크 개수가 한 브랜치 안에서 두 번 낡은 뒤에 생겼습니다).
   *
   * ⚠️ **정확한 숫자로 재면 안 됩니다.** 처음엔 `2485줄`을 그대로 대조하게 썼는데,
   * 이 커밋에서 `WheelPicker`에 import 한 줄을 더하자 곧바로 빨개졌습니다 — 이 표의
   * 주장과 아무 상관이 없는 변경입니다. 그런 가드는 **아무 생각 없이 숫자만 올리는
   * 습관**을 만들고, 그러면 가드가 없는 것과 같아집니다.
   *
   * 그래서 표가 실제로 주장하는 것 — **크기의 자릿수** — 을 잽니다(±5%). 평범한 편집엔
   * 조용하고, 누가 파일을 실제로 쪼개면 빨개집니다. **그때가 표를 고칠 때**입니다. */
  it("§15가 적은 크기가 실제 파일과 같은 자릿수다", () => {
    const claims = [...principles.matchAll(/`([\w/]+\.tsx?)` \(약 (\d+)줄\)/g)].map((match) => ({ file: match[1], claimed: Number(match[2]) }));
    /* 개수로 고정하지 않습니다 — 이 표는 **줄어드는 것이 목적**이라(파일을 쪼갤 때마다
     * 행이 빠집니다) 개수 하한은 곧 거짓말이 됩니다. 실제로 `AppShell`을 쪼개자마자
     * `> 2`가 빨개졌습니다. 대신 **아직 남아 있는 것 하나를 이름으로** 짚습니다 —
     * 그것이 쪼개지면 그때 이 줄을 고치는 것이 맞습니다. */
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.map((claim) => claim.file)).toContain("controls/WheelPicker.tsx");
    // 끝 개행 뒤의 빈 조각은 줄이 아닙니다 — `wc -l`과 같은 셈을 씁니다.
    const lineCount = (source: string | undefined) => (source === undefined ? undefined : source.split("\n").length - (source.endsWith("\n") ? 1 : 0));
    const wrong = claims
      .map((claim) => ({ ...claim, actual: lineCount(sources[`../src/${claim.file}`]) }))
      .filter((claim) => claim.actual === undefined || Math.abs(claim.actual - claim.claimed) > claim.claimed * 0.05)
      .map((claim) => `${claim.file}: 문서 약 ${claim.claimed}줄 / 실제 ${claim.actual}줄`);
    expect(wrong).toEqual([]);
  });

  /* §15 — 배럴은 **목차**입니다. 정리 전 순서는 사실상 임의였고(`themeTokens`가
   * `ThemeColorEditor` 뒤에, `AutoGrowTextarea`가 테마 한가운데에 있었습니다), 그런
   * 파일은 새 항목이 늘 **맨 아래**에 붙어 다시 임의로 돌아갑니다.
   *
   * 묶음 이름과 순서를 여기 고정하므로, 새 항목을 넣는 사람은 **어느 묶음인지 정해야**
   * 합니다. 그것이 이 검사가 사는 이유입니다 — 순서 자체보다, 자리를 정하게 만드는 것. */
  const BARREL_GROUPS = ["컨트롤", "표면·레이아웃", "테마", "단축키", "킷 전역 설정", "브라우저"];

  /* 🔴 **묶음이 곧 폴더입니다.** 목차(배럴)와 파일 트리가 **같은 축**이라는 것이 이
   * 정리의 요점입니다 — 하나만 고치면 둘이 갈라지고, 갈라지는 순간 "어디에 넣지"가
   * 다시 취향 문제가 됩니다. `settings.ts`는 묶음에 파일이 하나뿐이라 폴더를 안
   * 만들었습니다(§15). */
  const GROUP_FOLDER: Record<string, string> = {
    "컨트롤": "controls",
    "표면·레이아웃": "surfaces",
    "테마": "theme",
    "단축키": "shortcuts",
    "킷 전역 설정": "",          // 파일 하나 — 루트에 둡니다
    "브라우저": "browser",
  };

  const barrelPlacement = (() => {
    const headings: string[] = [];
    const placed: Array<{ module: string; group: string | null }> = [];
    let current: string | null = null;
    for (const line of byId.get("index")!.source.split("\n")) {
      const heading = /^\/\* ── (.+?) ── /.exec(line);
      if (heading) {
        current = heading[1];
        headings.push(current);
        continue;
      }
      const exported = /^export .* from "\.\/([^"]+)";$/.exec(line.trim());
      if (exported) placed.push({ module: exported[1], group: current });
    }
    return { headings, placed };
  })();

  // 전제 — 정규식이 헤딩이나 export 줄을 못 잡으면 아래가 전부 공허합니다.
  it("배럴의 묶음 머리말과 export 줄을 실제로 읽어냈다", () => {
    expect(barrelPlacement.headings.length).toBe(BARREL_GROUPS.length);
    expect(barrelPlacement.placed.length).toBeGreaterThan(15);
  });

  it("각 묶음의 export가 그 묶음의 폴더에서만 나온다", () => {
    // 전제 — 짝이 비면 아래가 공허합니다.
    expect(Object.keys(GROUP_FOLDER).sort()).toEqual([...BARREL_GROUPS].sort());
    const wrong = barrelPlacement.placed
      .filter((entry) => entry.group !== null)
      .map((entry) => ({ ...entry, folder: entry.module.includes("/") ? entry.module.slice(0, entry.module.lastIndexOf("/")) : "" }))
      .filter((entry) => entry.folder !== GROUP_FOLDER[entry.group!])
      .map((entry) => `${entry.module} 은 "${entry.group}" 묶음인데 폴더가 ${entry.folder || "(루트)"} 입니다`);
    expect(wrong).toEqual([]);
  });

  /* 폴더 쪽에서도 봅니다 — 배럴이 안 내보내는 파일이 엉뚱한 폴더에 있어도 위 검사는
   * 조용합니다(`selectKeyboard`처럼 비공개 헬퍼가 그렇습니다). */
  it("src의 모든 파일이 정해진 폴더 중 하나에 있다", () => {
    /* `model/instant`은 묶음 폴더가 아니라 **한 모델의 조각들**입니다(2026-08-19에
     * 1004줄을 여덟으로 갈랐습니다). 목록에 이름으로 적습니다 — 와일드카드로 열면
     * `model/` 아래 아무거나 생겨도 조용해지고, 그러면 이 검사가 없는 것과 같습니다. */
    const allowed = new Set([...Object.values(GROUP_FOLDER).filter(Boolean), "model", "model/instant"]);
    const rootAllowed = new Set(["index", "settings"]);
    const wrong = modules
      .filter((module) => (module.id.includes("/") ? !allowed.has(module.id.slice(0, module.id.lastIndexOf("/"))) : !rootAllowed.has(module.id)))
      .map((module) => module.file);
    expect(wrong).toEqual([]);
  });

  it("묶음이 §15가 정한 순서로 나온다", () => {
    expect(barrelPlacement.headings).toEqual(BARREL_GROUPS);
  });

  it("모든 export가 어느 묶음엔가 들어 있고, 빈 묶음이 없다", () => {
    expect(barrelPlacement.placed.filter((entry) => entry.group === null).map((entry) => entry.module)).toEqual([]);
    const empty = BARREL_GROUPS.filter((group) => !barrelPlacement.placed.some((entry) => entry.group === group));
    expect(empty).toEqual([]);
  });

  /* "묶음 안에서는 기계가 래퍼보다 먼저" — 같은 묶음 안에서 A가 B를 import 하면 B가
   * 먼저 나와야 합니다(`WheelPicker` → 래퍼 셋, `themeTokens` → `themePalette` →
   * `ThemeColorEditor`, `shortcuts` → … → `ShortcutSettings`).
   *
   * ⚠️ **묶음을 건너서는 이 규칙을 걸지 않습니다.** 걸면 `Select`가 `hooks`·`positioning`
   * 뒤로 밀려 헬퍼가 목차 맨 앞에 오게 되고, 그것이 바로 이 순서가 거부한 배치입니다
   * (의존 층 순서). 역할 묶음과 의존 순서는 이 지점에서 부딪히고, 부딪히면 역할이 이깁니다. */
  it("같은 묶음 안에서는 의존되는 쪽이 먼저 나온다", () => {
    const index = new Map(barrelPlacement.placed.map((entry, position) => [entry.module, position]));
    const groupOf = new Map(barrelPlacement.placed.map((entry) => [entry.module, entry.group]));
    const wrong = barrelPlacement.placed.flatMap((entry) =>
      (byId.get(entry.module)?.deps ?? [])
        .filter((dep) => groupOf.get(dep) === entry.group && index.get(dep)! > index.get(entry.module)!)
        .map((dep) => `${entry.module}이 ${dep}보다 먼저 나옴 (묶음: ${entry.group})`));
    expect(wrong).toEqual([]);
  });

  /* 순환이 없다는 것은 브리핑이 사람 눈으로 잰 사실입니다. 사람이 잰 것은 낡습니다. */
  it("순환 의존이 없다", () => {
    const cycles: string[] = [];
    const state = new Map<string, "visiting" | "done">();
    function visit(id: string, path: string[]) {
      if (state.get(id) === "done") return;
      if (state.get(id) === "visiting") {
        cycles.push([...path.slice(path.indexOf(id)), id].join(" → "));
        return;
      }
      state.set(id, "visiting");
      for (const dep of byId.get(id)!.deps.filter((dep) => byId.has(dep))) visit(dep, [...path, id]);
      state.set(id, "done");
    }
    for (const module of modules) visit(module.id, []);
    expect(cycles).toEqual([]);
  });
});

/// <reference types="vite/client" />

/* **배럴이 내보내는 이름 전부를 목록으로 못 박습니다.**
 *
 * `src/` 정리 라운드를 시작하면서 만들었습니다. 브리핑이 잰 사실 하나가 이 라운드를
 * 값싸게 만들어 줍니다 — 소비자 둘 다 **배럴만** 쓰고 deep import는 0건입니다. 그러니
 * 파일을 옮기고 이름을 바꿔도 **배럴이 같은 이름을 계속 내보내는 한** 아무도 안 깨집니다.
 *
 * 🔴 그 "한"이 이 파일입니다. 그것이 조건인데 아무도 재고 있지 않았습니다 —
 * `src/index.ts`의 내용을 확인하는 테스트가 **한 개도 없었습니다**(43개 파일을 훑어
 * 확인). 즉 이동 중에 한 이름이 조용히 사라져도 나머지 1500개 검사는 전부 초록입니다.
 * 그 이름을 쓰던 앱만 다음 핀 올리는 날 깨집니다.
 *
 * 이 저장소가 이미 값을 치른 규칙을 그대로 적용한 것입니다 — **주석에 적은 숫자는 아무도
 * 다시 재지 않는다, 단언으로 옮겨라.**
 *
 * ## 두 목록을 따로 두는 이유
 *
 * 값과 타입은 **깨지는 방식이 다릅니다.** 값이 사라지면 앱이 런타임에 죽고, 타입이
 * 사라지면 앱이 컴파일에서 죽습니다. 그리고 타입은 런타임에 존재하지 않으므로
 * `import * as kit`으로는 **보이지 않습니다** — 소스를 읽는 수밖에 없습니다.
 *
 * 그래서 소스를 파싱하고, **파싱 결과가 진짜인지는 런타임 키와 대조해서** 확인합니다
 * (아래 마지막 검사). 파싱만 하면 정규식이 틀렸을 때 조용히 틀린 목록을 지킵니다.
 */
import { describe, expect, it } from "vitest";

import * as kit from "../src/index";
import * as instantBarrel from "../src/model/instant";

/** 조각을 직접 부르는 곳이 있는지 보려면 소스를 전부 읽어야 합니다. */
const allSources = import.meta.glob("../{src,tests,demo}/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const indexSource = Object.values(
  import.meta.glob("../src/index.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>,
)[0];

/** `export { A, type B } from "./X"` 를 이름 단위로 흩뜨립니다. */
function parseBarrel(source: string) {
  const values: string[] = [];
  const types: string[] = [];
  const modules: string[] = [];
  for (const block of source.matchAll(/export\s*\{([^}]*)\}\s*from\s*"\.\/([^"]+)"/g)) {
    modules.push(block[2]);
    for (const raw of block[1].split(",")) {
      const entry = raw.trim();
      if (!entry) continue;
      if (entry.startsWith("type ")) types.push(entry.slice(5).trim());
      else values.push(entry);
    }
  }
  return { values, types, modules };
}

const barrel = parseBarrel(indexSource);

/* 🔴 **이 목록에서 이름을 지우는 것은 소비자 breaking입니다.** 파일을 옮기거나 이름을
 * 바꾸는 것은 공짜지만(위 머리말), 배럴이 내보내는 **공개 이름**을 바꾸는 것은 릴리스
 * 노트에 목록이 필요합니다. 이 검사가 빨개졌는데 의도한 것이라면, CHANGELOG의 BREAKING
 * 항목을 **같은 PR 안에** 적으세요. */
const PUBLIC_VALUES = ["AppShell", "AutoGrowTextarea", "Button", "BARE_KEY_SCOPE_ATTR", "DEFAULT_DURATION_LABELS", "DEFAULT_SIDEBAR_LABELS", "DEFAULT_WHEEL_LABELS", "DateWheelPicker", "Dialog", "DialogActions", "DialogHeading", "DismissibleDetails", "DurationWheelPicker", "FieldGrid", "KIT_RESERVED", "MobilePageTabs", "MobilePageTabsContext", "MobileQuickBar", "PageHeader", "PageTabsIcon", "Panel", "PanelGrid", "PopupDepthContext", "SIDEBAR_TOGGLE_ID", "SectionHeading", "SectionTabs", "SegmentedControl", "Select", "ShortcutProvider", "ShortcutSettings", "Sidebar", "SummaryCard", "SummaryGrid", "THEME_TOKENS", "THEME_TOKEN_GROUPS", "ThemeColorEditor", "TimeWheelPicker", "applyTokenOverrides", "captureScrollSnapshot", "createShortcutStorage", "createThemePalette", "defaultTokenValue", "displayCombo", "dropdownViewportSpace", "findConflict", "formatCombo", "getHourFormat", "getHourFormatServerSnapshot", "getWheelRowsPerSide", "getWheelRowsPerSideServerSnapshot", "isPrimaryButton", "normalizeColor", "normalizeCombo", "onViewportChange", "parseCombo", "readThemeDefaults", "readTokenOverrides", "restoreFocusWithoutScroll", "setHourFormat", "setWheelRowsPerSide", "shouldOpenDropdownAbove", "shouldTrigger", "sidebarToggleAction", "subscribeHourFormat", "subscribeWheelRowsPerSide", "toRgbText", "todayIn", "useBackToClose", "useEscapeToClose", "useMobilePageTabs", "useScrollDirectionHidden", "useShortcutRegistry", "useVirtualKeyboard", "useVirtualKeyboardOpen", "useVisualViewportBox", "writeTokenOverrides"];

const PUBLIC_TYPES = ["AppShellProps", "AutoGrowTextareaProps", "ButtonProps", "ButtonSize", "ButtonVariant", "Combo", "Conflict", "DateWheelPickerProps", "DialogProps", "DurationWheelPickerProps", "GridJustify", "HourFormat", "MobilePageTabRegistration", "MobileQuickBarItem", "MobileQuickBarKind", "ParsedShortcutBindings", "ParsedThemeColors", "ScrollSnapshot", "SectionTabsProps", "SegmentedControlProps", "SegmentedOption", "SelectOption", "SelectProps", "ShortcutAction", "ShortcutBackup", "ShortcutBindings", "ShortcutProviderProps", "ShortcutRegistry", "ShortcutSettingsProps", "ShortcutStorage", "SidebarFooter", "SidebarLabels", "SidebarNavItem", "SidebarNavSection", "SidebarProps", "SidebarToggleActionOptions", "ThemeColorBackup", "ThemeColorEditorProps", "ThemeName", "ThemePalette", "ThemeToken", "ThemeTokenGroup", "TimeWheelPickerProps", "VirtualKeyboard", "VisualViewportBox", "WheelLabels", "WheelPickerProps", "WheelRowsPerSide", "WheelUnit"];

describe("공개 API — 배럴이 내보내는 이름", () => {
  // 전제 — 정규식이 0건을 잡으면 아래 `toEqual`이 빈 배열끼리 비교하며 **공허하게**
  // 통과합니다. 목록을 통째로 지운 배럴도 초록이 됩니다.
  it("배럴을 실제로 파싱했다", () => {
    expect(barrel.values.length + barrel.types.length).toBeGreaterThan(100);
    expect(barrel.modules.length).toBeGreaterThan(15);
  });

  it("내보내는 값 목록이 그대로다", () => {
    expect([...barrel.values].sort()).toEqual([...PUBLIC_VALUES].sort());
  });

  it("내보내는 타입 목록이 그대로다", () => {
    expect([...barrel.types].sort()).toEqual([...PUBLIC_TYPES].sort());
  });

  it("같은 이름을 두 번 내보내지 않는다", () => {
    const all = [...barrel.values, ...barrel.types];
    const duplicated = all.filter((name, index) => all.indexOf(name) !== index);
    expect(duplicated).toEqual([]);
  });

  /* 🔴 **위 두 검사가 소스만 읽는다는 점을 여기서 갚습니다.** 정규식이 틀렸거나, 배럴이
   * 문법적으로는 이름을 적어 놨지만 그 모듈이 실제로는 안 내보내는 경우를 소스 파싱은
   * 못 봅니다. 진짜 import 한 결과와 대조해야 그게 잡힙니다.
   *
   * 타입은 런타임에 없으므로 값만 비교합니다. */
  it("실제로 import 되는 것이 값 목록과 정확히 같다", () => {
    expect(Object.keys(kit).sort()).toEqual([...PUBLIC_VALUES].sort());
  });
});

/* 🔴 **두 번째 배럴 — `src/model/instant.ts`.**
 *
 * 2026-08-19에 그 파일(1004줄)을 `src/model/instant/` 여덟 조각으로 갈랐습니다. 그
 * 이동을 값싸게 만든 것은 **배럴이 남아 부르는 쪽이 조각을 모른다**는 것 하나였습니다 —
 * 배럴을 부르는 **구문 아홉**, **파일 여덟**(`WheelPicker.tsx`가 둘). 파일로 세면
 * `src` 셋 · `tests` 다섯 · `demo` 0이고, **이 파일도 그 여덟에 듭니다.**
 *
 * 그런데 그 조건을 **아무도 재고 있지 않았습니다.** `PRINCIPLES.md` §15는 이 파일이
 * 지킨다고 적고 있었는데, 위의 것들은 전부 `src/index.ts`만 봅니다(`model/instant`가
 * 이 파일에 **0건**이었습니다).
 *
 * ⚠️ **처음엔 여기에 "이름 하나가 조용히 빠져도 전부 초록"이라고 적었는데 거짓이었습니다** —
 * 재 보니 서른다섯이 **전부** 어딘가에서 named import로 묶여 있어(주로
 * `tests/instantModel.test.ts`), 빠지면 그 import이 먼저 터집니다. 그러니 이 묶음이
 * 유일하게 지키는 것은 **반대 방향**입니다: 공개 이름이 **늘어나는 것**. 아무도 안 쓰는
 * 이름을 배럴에 얹어도 다른 검사는 전부 조용합니다. 그리고 빠지는 쪽도, 여기서는
 * *"배럴 목록이 안 맞는다"* 라고 말하지 다른 파일의 import 오류로 말하지 않습니다.
 *
 * 값과 타입을 나누지 않습니다 — 이 배럴은 값만 내보냅니다(타입 계약은
 * `model/wheelModel.ts`가 따로 갖고 있습니다). 그래서 런타임 키 하나로 충분합니다.
 */
/** 정적 `from "…/model/instant/x"`와 동적 `import("…/model/instant/x")` 둘 다.
 *  ⚠️ `g` 플래그를 쓰지 마세요 — `RegExp.test`가 `lastIndex`를 들고 다녀 같은 정규식을
 *  두 번 쓰면 두 번째가 조용히 false를 냅니다. */
const DEEP_IMPORT = /(?:from|import)\s*\(?\s*"[^"]*model\/instant\/[^"]+"/;

describe("model/instant 배럴의 공개 이름", () => {
  const INSTANT_PUBLIC = [
    "MERIDIEM_NOTCHES", "MERIDIEM_UNIT", "UNIT_LADDER", "WHEEL_FILL",
    "clampToRange", "comparisonPrecision", "dateTriggerParts", "dateWheelLabel",
    "familyOf", "flushBuffer", "hourFromTwelve", "instantModel",
    "isContiguous", "lastDayOf", "meridiemOf", "normalizeToFields",
    "outOfRange", "parsePasted", "parseValue", "rangeKeyLength",
    "resetTarget", "serializeValue", "shiftDateValue", "snapToStep",
    "snapValue", "stepOf", "todayIn", "twelveHourText",
    "typeDigit", "unitCeiling", "unitDigits", "unitFloor",
    "usableBound", "validDateValue", "withUnitValue",
  ];

  it("내보내는 이름이 목록과 정확히 같다", () => {
    expect(Object.keys(instantBarrel).sort()).toEqual([...INSTANT_PUBLIC].sort());
  });

  /* ⚠️ **여기 검사가 둘 더 있었는데 둘 다 걷어냈습니다** — 개수 못 박기와 중복 검사.
   * 둘 다 위 `toEqual` **없이는 절대 못 빨개집니다**: 중복을 심으면 목록의 다중집합이
   * 달라져 `toEqual`이 먼저 터집니다(변이로 확인 — 심었더니 둘이 같이 빨갛고, 하나만
   * 빨간 경우가 없었습니다). 못 실패하는 초록은 검사가 아닙니다. */
  /* 🔴 **조각을 직접 부르는 곳이 생기면 이 배럴은 더 이상 안전망이 아닙니다.**
   * 갈라짐이 값쌌던 이유가 "부르는 쪽이 조각을 모른다"였으니, 그 전제를 지킵니다.
   *
   * ⚠️ **정적 `from "…"`만 보면 안 됩니다** — 이 저장소는 `await import("…")`도 씁니다.
   * 둘 다 봅니다. 그리고 **소스를 실제로 읽었는지**를 먼저 단언합니다: glob이 0건이면
   * 아래가 빈 배열끼리 비교하는 공허한 초록이 됩니다(이 저장소가 기록한 형태입니다 —
   * "빈 입력으로 만족되는 단언은 검사가 아니다"). */
  it("소스를 실제로 읽어냈고 정규식이 실제로 문다 — 아래 검사의 전제", () => {
    expect(Object.keys(allSources).length).toBeGreaterThan(80);
    /* 🔴 **양성 대조를 저장소에서 찾을 수는 없습니다** — 지금 조각을 직접 부르는 곳이
     * 0인 것이 곧 아래 검사가 지키려는 상태니까요. 그래서 정규식 자체를 겁니다:
     * 물어야 하는 두 모양은 물고, 배럴을 부르는 정상 import은 안 물어야 합니다. */
    /* ⚠️ 경로를 **이어 붙여** 만듭니다. 통째로 적으면 이 파일 자신이 스캔 코퍼스 안에서
     * deep-import처럼 보이고, 지금 초록인 이유가 "Vite의 glob이 부르는 파일 자신을
     * 빼 준다"는 우연 하나가 됩니다. */
    const deepPath = "../src/model/" + "instant/serialize";
    const barrelPath = "../src/model/" + "instant";
    expect(DEEP_IMPORT.test(`import { pad } from "${deepPath}";`)).toBe(true);
    expect(DEEP_IMPORT.test(`const m = await import("${deepPath}");`)).toBe(true);
    expect(DEEP_IMPORT.test(`import { instantModel } from "${barrelPath}";`)).toBe(false);
  });

  it("배럴 밖에서 조각을 직접 import 하지 않는다", () => {
    const deep = Object.entries(allSources)
      .filter(([path]) => !path.includes("/model/instant"))
      .filter(([, source]) => DEEP_IMPORT.test(source))
      .map(([path]) => path);
    expect(deep).toEqual([]);
  });
});

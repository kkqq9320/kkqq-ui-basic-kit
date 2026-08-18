// @vitest-environment jsdom
//
// 사이드바·빠른 바의 CSS 계약. jsdom은 캐스케이드를 계산하지 않으므로(레이아웃 엔진이
// 없다) 소스 텍스트로 고정한다 — Select.test.tsx·Dialog.test.tsx의 같은 idiom.
// 빈 문자열 가드가 없으면 .css?raw가 ""로 목킹되는 날 통째로 공허하게 통과한다.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { MobileQuickBar, type MobileQuickBarItem } from "../src/surfaces/Sidebar";

import controlsCssSource from "../css/controls.css?raw";
import wheelPickerCssSource from "../css/wheel-picker.css?raw";
import sidebarCssSource from "../css/sidebar.css?raw";
import tabsCssSource from "../css/tabs.css?raw";
import tokensCssSource from "../css/tokens.css?raw";

afterEach(cleanup);

describe("터치에서 들러붙는 호버", () => {
  // 터치 기기는 탭한 요소에 :hover를 다음 탭까지 붙여둔다. 가드가 없으면 눌렀다 뗀
  // 항목이 계속 강조돼 "지금 선택된 항목"처럼 보인다. 실기기 관측: 서랍을 뒤로가기로
  // 닫은 뒤에도 빠른 바의 메뉴 버튼이 accent로 남아 있었다.
  it("빠른 바 버튼의 :hover가 (hover: hover) 안에 있다", () => {
    expect(sidebarCssSource.length).toBeGreaterThan(1000);
    expect(sidebarCssSource).toMatch(/@media \(hover: hover\) \{\s*\.mobile-quick-bar > button:hover \{/);
  });

  it("사이드바 nav 항목의 :hover 두 규칙이 모두 (hover: hover) 안에 있다", () => {
    expect(sidebarCssSource.length).toBeGreaterThan(1000);
    expect(sidebarCssSource).toMatch(/@media \(hover: hover\) \{\s*\.sidebar nav :is\(a, button\):hover::before \{/);
    expect(sidebarCssSource).toMatch(/@media \(hover: hover\) \{\s*\.sidebar nav :is\(a, button\):hover \{/);
  });

  // 가드를 넣으면서 규칙을 한 블록으로 모으고 싶어지는데, 그러면 소스 순서가 바뀐다.
  // :hover::before(opacity .5)가 [aria-current]::before(opacity 1)보다 **앞에** 있어야 활성
  // 항목이 이긴다 — 미디어 쿼리는 특이도를 더하지 않으므로 순서가 유일한 판정 기준이다.
  // 블록을 아래로 옮기면 호버가 활성을 덮어써 활성 표시가 흐려진다. 16f528a가 낸
  // 사고와 같은 계열이라 명시적으로 고정한다.
  it("호버 규칙이 활성 규칙보다 소스에서 앞선다 — 활성 표시가 이겨야 한다", () => {
    const hoverBefore = sidebarCssSource.indexOf(".sidebar nav :is(a, button):hover::before");
    const activeBefore = sidebarCssSource.indexOf('.sidebar nav :is(a, button)[aria-current="page"]::before');
    expect(hoverBefore).toBeGreaterThan(-1);
    expect(activeBefore).toBeGreaterThan(-1);
    expect(hoverBefore).toBeLessThan(activeBefore);
  });
});

describe("모바일 서랍의 표식 (§16 ③)", () => {
  /* 🔴 **JSX가 붙이는 것과 CSS가 칠하는 것이 같아야 합니다.** 서랍 열림은 `.mobile-open`
   * 클래스였다가 `data-mobile-drawer="open"`이 됐는데(2026-08-18), 재 보니 **CSS만 되돌려도
   * 1664개가 전부 초록**이었습니다 — 그 상태에서 서랍은 **영영 안 열립니다.** 동작 검사들은
   * 속성이 붙는 것까지만 보고 무엇이 칠해지는지는 안 봅니다.
   *
   * ⚠️ **이관 자체가 만드는 구멍입니다.** 다음에 `.open`·`.moving-*`을 옮길 때도 **양쪽을
   * 짝으로** 재세요(오전/오후 쪽 짝은 `tests/DateWheelPicker.test.tsx`에 있습니다). */
  it("서랍 열림은 data-mobile-drawer가 칠한다 — JSX가 붙이는 그것이다", () => {
    expect(sidebarCssSource.length).toBeGreaterThan(1000);
    expect(sidebarCssSource).toContain('.sidebar[data-mobile-drawer="open"] { transform: translateX(0); }');
  });

  /* 🔴 **자리가 계약의 일부입니다** — 바로 위 `.sidebar-collapsed .sidebar`도 (0,2,0)이고
   * 같은 `transform`을 씁니다. 명시도가 같으니 **순서로만 갈립니다.** */
  it("그 규칙이 접힘 규칙보다 뒤에 온다 — 명시도가 같아 순서가 유일한 판정이다", () => {
    const drawer = sidebarCssSource.indexOf('.sidebar[data-mobile-drawer="open"]');
    const collapsed = sidebarCssSource.indexOf(".sidebar-collapsed .sidebar {");
    expect([drawer > -1, collapsed > -1, drawer > collapsed]).toEqual([true, true, true]);
  });
});

describe("키보드 포커스 표시", () => {
  // 호버 스타일만 있고 포커스 짝이 없으면 Tab으로 왔을 때 킷 스타일 없이 브라우저
  // 기본 링만 뜬다. 바로 아래 .sidebar-icon-button(:156)이 이미 쓰는 짝이다.
  // 포커스는 터치에서 들러붙지 않으므로 (hover: hover) 가드를 씌우면 안 된다 —
  // 씌우면 터치 기기의 외장 키보드 사용자가 포커스 표시를 잃는다.
  it("사이드바 nav 항목에 :focus-visible 짝이 있고 기본 링을 끈다", () => {
    const rule = sidebarCssSource.match(/^\.sidebar nav :is\(a, button\):focus-visible \{[^}]*\}/m);
    expect(rule).not.toBeNull();
    // 값이 아니라 **뜻**을 단언합니다. `#fff`를 글자 그대로 적어 두던 자리인데, 그때는
    // 그 흰색에 이름이 없었습니다(사다리의 맨 윗칸이 비어 있었습니다). 이제 이름이
    // 있으므로 리터럴로 되돌리면 여기가 빨개집니다.
    expect(rule![0]).toMatch(/color:\s*var\(--sidebar-bright\)/);
    expect(rule![0]).toMatch(/outline:\s*none/);
    expect(sidebarCssSource).toMatch(/^\.sidebar nav :is\(a, button\):focus-visible::before \{/m);
  });

  it("빠른 바 버튼에 :focus-visible 짝이 있고 기본 링을 끈다", () => {
    const rule = sidebarCssSource.match(/\.mobile-quick-bar > button:focus-visible \{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/outline:\s*none/);
  });

  // 포커스 규칙이 (hover: hover) 안에 갇히면 터치 기기 + 외장 키보드에서 표시가 사라진다.
  it("포커스 규칙은 (hover: hover) 안에 있으면 안 된다", () => {
    const guarded = sidebarCssSource.match(/@media \(hover: hover\) \{[^}]*\}[^}]*\}/g) ?? [];
    for (const block of guarded) expect(block).not.toMatch(/:focus-visible/);
  });
});

// 포커스 링을 세 번 따로 고친 뒤에야 전수 조사를 했다. 그때 나온 목록이 이 계약이다 —
// 액션 버튼 전체를 포함해 11개 컨트롤에 규칙이 **아예 없었고**, 있는 것들도 값이
// 갈라져 있었다(입력 16%, 드롭다운·날짜 12%). 목록에서 컨트롤을 빠뜨리는 것이 지금까지의
// 실패 방식이므로 개별 이름으로 고정한다 — 하나가 빠지면 그 이름으로 실패한다.
describe("포커스 링은 토큰 하나가 정한다", () => {
  /* 액션 버튼은 이제 클래스 나열이 아니라 `data-variant` 한 축입니다(§16). 그래서 목록이
   * 둘로 갈립니다 — variant마다 하나, 그리고 자기 클래스를 가진 나머지 컨트롤.
   * `file-button`·`link-button`은 목록에서 **빠졌습니다**: 킷 안에서 아무도 안 쓰는
   * 죽은 클래스였고(src 0 · 데모 0 · 문서 0) 이번에 지웠습니다. 지우기 전까지
   * 이 검사가 **아무것도 아닌 것의 포커스 규칙을 지키고** 있었습니다. */
  const NEEDS_RING_VARIANT = ["primary", "secondary", "danger", "text"];
  const NEEDS_RING = [
    "sidebar-collapse-button", "mobile-sidebar-close", "wheel-step",
    "mobile-page-tabs-button", "mobile-tab-card",
  ];

  it("토큰이 정의돼 있고 3px 강조색이다 — PRINCIPLES §11", () => {
    expect(tokensCssSource.length).toBeGreaterThan(500);
    expect(tokensCssSource).toMatch(/--focus-ring-strength:\s*\d+%/);
    expect(tokensCssSource).toMatch(/--focus-ring:\s*3px solid color-mix\(in srgb, var\(--accent\) var\(--focus-ring-strength\), transparent\)/);
  });

  // 처리는 컨트롤마다 다르다 — 테두리를 가진 버튼은 테두리 색을 바꾸고, .primary는
  // 안쪽 링, 글자 버튼은 밑줄, 어두운 면의 아이콘 버튼은 배경. 링을 덧대는 것은
  // 테두리를 강조색으로 바꾸는 컨트롤에만 남겼다(소유자 결정). 그래서 "어떤 처리인지"가
  // 아니라 **"처리가 있는가"** 를 이름별로 고정한다.
  it.each(NEEDS_RING)("%s에 포커스 처리가 있다", (name) => {
    const all = controlsCssSource + sidebarCssSource + wheelPickerCssSource + tabsCssSource;
    expect(all.length).toBeGreaterThan(4000);
    expect(all).toContain(`.${name}:focus-visible`);
  });

  /* variant는 `:is(...)`로 묶여 있을 수 있으므로(secondary와 danger가 같은 처리라 한 줄입니다)
   * 선택자 전체를 글자로 맞추지 않고 **그 variant를 언급하는 `:focus-visible` 규칙이
   * 있는가**를 봅니다. 하나가 빠지면 그 variant 이름으로 실패합니다. */
  it.each(NEEDS_RING_VARIANT)('data-variant="%s"에 포커스 처리가 있다', (variant) => {
    expect(controlsCssSource.length).toBeGreaterThan(2000);
    expect(controlsCssSource).toMatch(new RegExp(`\[data-variant="${variant}"\][^{]*:focus-visible`));
  });

  // 탭 세 종류는 클래스 하나로 안 잡혀서 위 목록에 못 넣는다(자손 선택자다).
  // 셋 다 base가 **투명 테두리를 자리로 갖고** 있고 .active가 그 색을 채우므로,
  // 포커스는 같은 자리에 더 옅은 색을 채운다 — 크기가 변하지 않아 탭 줄이 안 흔들린다.
  it.each([
    [".settings-tabs button:focus-visible", "border-bottom-color"],
    [".settings-tabs > .settings-tab-options > button:focus-visible", "border-color"],
    [".mobile-quick-tab-menu > button:focus-visible", "border-color"],
  ])("%s가 테두리 색으로 포커스를 말한다", (selector, property) => {
    expect(tabsCssSource).toContain(selector);
    const rule = tabsCssSource.slice(tabsCssSource.indexOf(selector));
    const body = rule.slice(rule.indexOf("{"), rule.indexOf("}") + 1);
    expect(body).toContain(property);
    expect(body).toMatch(/color-mix\(in srgb, var\(--accent\) 45%, transparent\)/);
  });

  // 활성 항목이 포커스보다 진해야 한다. 특이도가 같으므로 소스 순서가 유일한 판정
  // 기준이다 — 사이드바 nav에서 이미 같은 함정을 겪었다.
  it.each([
    ".settings-tabs > .settings-tab-options > button",
    ".mobile-quick-tab-menu > button",
  ])("%s의 포커스 규칙이 활성 규칙보다 앞선다", (base) => {
    const focusAt = tabsCssSource.indexOf(`${base}:focus-visible`);
    const activeAt = tabsCssSource.indexOf(`${base}[aria-selected="true"]`);
    expect(focusAt).toBeGreaterThan(-1);
    expect(activeAt).toBeGreaterThan(-1);
    expect(focusAt).toBeLessThan(activeAt);
  });

  // 기본 링을 끄기만 하고 대체 표시를 안 주면 포커스가 아예 안 보인다 — PRINCIPLES §11이
  // 명시적으로 금지하는 코드다. 예외는 **부모가 대신 그려 주는 경우** 하나뿐이고,
  // 지금 그런 곳은 날짜 필드뿐이다(shell이 :has(:focus-visible)로 링을 그린다).
  // 예외를 정규식에서 조용히 빼지 않고 이름으로 적어 둔다 — 새로 생기면 여기서 실패하고,
  // 그때 "이것도 부모가 그려 주는가"를 사람이 판단하게 된다.
  it("outline: none만 남기고 끝나는 규칙은 부모가 대신 그려 주는 곳뿐이다 — §11", () => {
    const all = controlsCssSource + sidebarCssSource + wheelPickerCssSource + tabsCssSource;
    const bare = (all.match(/[^{}]*:focus-visible[^{]*\{\s*outline:\s*none;\s*\}/g) ?? [])
      .map((rule) => rule.slice(rule.lastIndexOf("*/") + 2).trim());
    expect(bare).toEqual([
      ".wheel-trigger:focus-visible { outline: none; }",
    ]);
    // 그 예외가 성립하려면 부모가 실제로 링을 그려야 한다.
    expect(wheelPickerCssSource).toMatch(/\.wheel-trigger-shell:has\([^{]*:focus-visible[^{]*\{[^}]*outline:\s*var\(--focus-ring\)/);
  });

  // 사이드바 슬롯이 select.css의 강조색 테두리를 덮어쓰고 있었다 — 특이도가 같은데
  // css/index.css가 select.css 다음에 sidebar.css를 임포트해서 나중 것이 이겼다.
  // 그래서 사이드바 안에서만 포커스가 아웃라인 하나로 줄어 눈에 띄게 약했다.
  it("사이드바 슬롯이 드롭다운의 강조색 테두리를 되돌려 준다", () => {
    const rule = sidebarCssSource.match(/\.sidebar-slot \.app-select-trigger:focus-visible[\s\S]*?\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/border-color:\s*var\(--accent\)/);
  });
});

/* ── §16 ①: 빠른 바 항목은 자기 갈래를 말한다 ────────────────────────────────
 *
 * 🔴 **여기는 감시자가 하나도 없던 자리입니다.** `.active`를 재는 검사가 이 저장소에
 * **0건**이었습니다 — 그래서 이관 전후로 킬 행렬을 대조할 수가 없었고, "검사가 초록"이
 * 아무 증거도 안 됩니다. 셋을 새로 씁니다.
 *
 * 이관 검사의 짝은 **셋**입니다(값 행 이관에서 값을 치른 규칙):
 *   ① 붙이는 쪽 — 갈래마다 무엇을 다는가 (그리고 **안 다는가**)
 *   ② 칠하는 쪽 — CSS가 그 속성들을 앵커로 쓰는가
 *   ③ **둘 다** — 렌더된 버튼에 클래스 사본이 없는가. ①·②만으로는 클래스를 되살려도
 *      안 빨개집니다.
 *
 * ⚠️ 가장 놓치기 쉬운 칸은 **`kind: "action"`에 `active: true`** 입니다 — 어떤 기존
 * 검사에서도 물려받을 수 없고, "친절한" 폴백이 조용히 기어들어올 자리입니다. */
describe("빠른 바 항목은 자기 갈래를 말한다 (§16 ①)", () => {
  const ANCHOR = '.mobile-quick-bar > button:is([aria-current="page"], [aria-expanded="true"])';

  function open(items: MobileQuickBarItem[]) {
    render(<MobileQuickBar items={items} />);
  }
  const item = (label: string) => screen.getByRole("button", { name: label });
  const marks = (label: string) => [item(label).getAttribute("aria-current"), item(label).getAttribute("aria-expanded")];

  it("page 항목: 활성이면 aria-current=\"page\", 펼침은 말하지 않는다", () => {
    open([{ id: "home", label: "홈", icon: null, kind: "page", active: true, onClick: () => undefined }]);
    expect(marks("홈")).toEqual(["page", null]);
  });

  /* ⚠️ `null`이지 `""`가 아닙니다 — 빈 값이 붙으면 맨 `[aria-current]` 선택자가
   * 비활성 항목까지 물어 셋 다 칠해집니다. 사이드바의 `data-mobile-drawer` 주석이
   * 같은 이유로 같은 말을 합니다. */
  it("page 항목: 비활성이면 속성 자체가 없다 — 빈 값도 안 남긴다", () => {
    open([{ id: "home", label: "홈", icon: null, kind: "page", active: false, onClick: () => undefined }]);
    expect(marks("홈")).toEqual([null, null]);
  });

  /* 펼침 버튼은 **접혔을 때도** 답니다 — 그것이 계약입니다. "열 수 있다"는 사실 자체를
   * 말해야 하고, 안 달면 스크린리더에는 그냥 버튼입니다. */
  it("disclosure 항목: 접혔을 때도 aria-expanded를 단다", () => {
    open([{ id: "menu", label: "메뉴", icon: null, kind: "disclosure", active: false, onClick: () => undefined }]);
    expect(marks("메뉴")).toEqual([null, "false"]);
  });

  it("disclosure 항목: 펼쳐지면 true다 — 그리고 내비인 척하지 않는다", () => {
    open([{ id: "menu", label: "메뉴", icon: null, kind: "disclosure", active: true, onClick: () => undefined }]);
    expect(marks("메뉴")).toEqual([null, "true"]);
  });

  /* 🔴 **폴백이 기어들어올 자리입니다.** 대응하는 ARIA가 없으므로 아무것도 안 답니다 —
   * `active: true`여도 그렇습니다. 그래서 활성 표시도 안 칠해집니다(위 문서화된 대가). */
  it("action 항목: active여도 아무것도 안 단다", () => {
    open([{ id: "scan", label: "스캔", icon: null, kind: "action", active: true, onClick: () => undefined }]);
    expect(marks("스캔")).toEqual([null, null]);
  });

  it("세 갈래 어디에도 클래스 사본이 없다 — class 속성 자체가 없다", () => {
    open([
      { id: "menu", label: "메뉴", icon: null, kind: "disclosure", active: true, onClick: () => undefined },
      { id: "home", label: "홈", icon: null, kind: "page", active: true, onClick: () => undefined },
      { id: "scan", label: "스캔", icon: null, kind: "action", active: true, onClick: () => undefined },
    ]);
    expect(["메뉴", "홈", "스캔"].map((label) => item(label).getAttribute("class"))).toEqual([null, null, null]);
  });

  it("활성 표시를 칠하는 것은 그 두 속성이다", () => {
    expect(sidebarCssSource.length).toBeGreaterThan(1000);
    expect(sidebarCssSource).toContain(`${ANCHOR} {`);
  });

  /* 칠하는 자리가 셋입니다(본 규칙 · svg 팝 · 축소 모션 예외). 하나씩 박으면 되돌림
   * 하나를 놓치므로 **셋 다 같은 앵커인 것**을 셉니다. */
  it("칠하는 자리 셋이 모두 같은 앵커를 쓴다", () => {
    expect(sidebarCssSource.split(ANCHOR).length - 1).toBe(3);
  });

  it("클래스 사본은 CSS에 안 남아 있다", () => {
    expect(sidebarCssSource).not.toContain("> button.active");
  });
});

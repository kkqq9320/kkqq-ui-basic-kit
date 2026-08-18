// @vitest-environment jsdom
/// <reference types="vite/client" />

/* **녹음기는 설정 UI이면서 계측기입니다**(스펙 §5.3·§6).
 *
 * ⚠️ `Escape`·`Tab`은 조합으로 등록할 수 없습니다. 실측된 이유가 있습니다 —
 * 설정 화면이 `Dialog` 안이면 `popupDismiss.ts`의 `useEscapeToClose`가 `Escape`를 받아
 * 다이얼로그를 닫는데, **그 리스너는 `preventDefault`를 안 부릅니다.** 그래서
 * 녹음기는 "아무도 안 먹었다"로 읽고, 다이얼로그가 닫히면서 동시에 등록됩니다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShortcutProvider, type ShortcutAction } from "../src/shortcuts/ShortcutProvider";
import { ShortcutSettings, displayCombo } from "../src/shortcuts/ShortcutSettings";
import { isRecording } from "../src/shortcuts/combo";
import { createShortcutStorage } from "../src/shortcuts/storage";

const cssModules = import.meta.glob("../css/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const SHORTCUT_CSS = cssModules["../css/shortcuts.css"];
const INDEX_CSS = cssModules["../css/index.css"];

/* cleanup()이 먼저입니다 — 언마운트가 녹음 중이던 effect의 정리(endRecording())를
 * 돌려야 recordingDepth가 이 테스트 몫만큼 정확히 풀립니다. 그다음에야
 * isRecording()이 0으로 돌아왔는지 잴 수 있습니다. 이 가드가 없으면 한 테스트가
 * 녹음을 안 끝낸 채로 남겨도(예: 수식어만 누르고 끝나는 테스트) 다음 테스트로
 * recordingDepth가 새어 나가고, 그 증상은 엉뚱한 assertion에서 늦게 터집니다 —
 * 이 파일의 뮤테이션 4 기록이 그 모양 그대로입니다(task-5-report.md). */
afterEach(() => {
  cleanup();
  expect(isRecording()).toBe(false);
  localStorage.clear();
});

const ACTIONS: ShortcutAction[] = [
  { id: "toggle", label: "사이드바 접기", defaultCombo: null, onFire: () => {} },
  { id: "backup", label: "백업 페이지로 이동", defaultCombo: "Ctrl+KeyB", onFire: () => {} },
];

function setup(onChange = vi.fn()) {
  render(<ShortcutProvider actions={ACTIONS}><ShortcutSettings onChange={onChange} /></ShortcutProvider>);
  return onChange;
}

/** 녹음 버튼을 눌러 녹음을 시작합니다. */
function record(label: string) {
  const button = screen.getByRole("button", { name: new RegExp(label) });
  fireEvent.click(button);
  return button;
}

describe("목록", () => {
  it("마운트 안 된 화면의 액션도 전부 보여 준다", () => {
    setup();
    expect(screen.getByText("사이드바 접기")).toBeTruthy();
    expect(screen.getByText("백업 페이지로 이동")).toBeTruthy();
  });

  it("code가 아니라 사람이 읽는 이름으로 보여 준다", () => {
    expect(displayCombo("Ctrl+KeyB")).toBe("Ctrl + B");
    expect(displayCombo("Ctrl+Semicolon")).toBe("Ctrl + ;");
  });

  it("이름표가 없는 code는 원시 값 그대로 보인다 — 동작은 안 틀린다", () => {
    expect(displayCombo("Ctrl+F13")).toBe("Ctrl + F13");
  });
});

/* `classNameContract.test.ts`는 시그니처에 `className`이 있는지만 봅니다(소스 파싱).
 * **실제로 루트 DOM에 붙는지**는 여기서 렌더로 재야 짝이 맞습니다 — 그 파일의 머리말이
 * "실제 부착은 pageChrome.test.tsx가 렌더로 확인한다"고 적어 둔 것과 같은 이유인데,
 * `ShortcutSettings`는 그 목록에 없었습니다(전체 리뷰 Minor 6). */
describe("className이 실제로 루트에 붙는다", () => {
  it("넘긴 className이 .kkqq-shortcuts 옆에 붙는다", () => {
    const { container } = render(
      <ShortcutProvider actions={ACTIONS}>
        <ShortcutSettings onChange={() => {}} className="app-shortcuts" />
      </ShortcutProvider>,
    );
    const root = container.querySelector(".kkqq-shortcuts") as HTMLElement;
    expect(root.className).toBe("kkqq-shortcuts app-shortcuts");
  });

  it("className을 안 넘기면 군더더기 공백이 안 남는다", () => {
    setup();
    const root = document.querySelector(".kkqq-shortcuts") as HTMLElement;
    expect(root.className).toBe("kkqq-shortcuts");
  });
});

describe("녹음", () => {
  it("누른 조합이 등록된다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("toggle", "Ctrl+KeyJ");
  });

  it("Escape는 등록되지 않고 녹음을 취소한다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Tab은 등록되지 않는다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "Tab" });
    expect(onChange).not.toHaveBeenCalled();
  });

  /* 스펙 §6.2 — 활성화 키와 브라우저 편집 조합도 등록할 수 없습니다(오너 결정
   * 2026-08-13). `Escape`·`Tab`과 달리 **조용히 취소하지 않고 이유를 말합니다** —
   * 사용자가 "왜 안 되지"로 남으면 안 되니까요. */
  it("맨 Enter는 등록되지 않고 이유를 말한다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("맨 Enter를 누르면 이유가 화면에 뜬다", () => {
    setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "Enter" });
    expect(screen.getByRole("alert").textContent).toMatch(/버튼·링크를 누르는 키/);
  });

  it("Ctrl+V는 등록되지 않는다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyV", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Ctrl+V를 누르면 브라우저 편집이라고 말한다", () => {
    setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyV", ctrlKey: true });
    expect(screen.getByRole("alert").textContent).toMatch(/복사·붙여넣기·되돌리기/);
  });

  // 대조군 — 수식어가 붙은 Enter는 정상적인 단축키라 그대로 등록됩니다.
  it("Ctrl+Enter는 등록된다 — 활성화 키 금지는 맨 키에만 걸린다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "Enter", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("toggle", "Ctrl+Enter");
  });

  /* `Ctrl+A`만 막지 않기로 했습니다(오너 결정) — 대신 알려 줍니다. **등록은 됩니다.** */
  it("Ctrl+A는 등록된다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyA", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("toggle", "Ctrl+KeyA");
  });

  it("Ctrl+A를 등록하면 텍스트 입력 안에서는 안 뜬다고 알려 준다", () => {
    setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyA", ctrlKey: true });
    expect(screen.getByRole("alert").textContent).toMatch(/텍스트 입력 안에서는 뜨지 않습니다/);
  });

  // 대조군 — 경고가 붙지 않는 조합은 안내가 아예 안 뜹니다(모든 등록에 뜨면 소음입니다).
  it("평범한 조합을 등록하면 안내가 안 뜬다", () => {
    setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });
    expect(screen.queryByRole("alert")).toBe(null);
  });

  /* 스펙 §6.2 — "포커스가 나가면 녹음 종료"입니다. preventDefault를 부르면 Tab의
   * 기본 동작(포커스 이동) 자체가 막혀서 포커스가 안 나갑니다 — 녹음만 끝나고
   * 그 자리에 그대로 남는 결함. UNRECORDABLE(Escape·Tab)은 preventDefault를
   * 부르지 않아야 합니다. */
  it("Tab을 누르면 preventDefault를 부르지 않는다 — 포커스가 그대로 나가야 한다 (§6.2)", () => {
    setup();
    record("사이드바 접기");
    const event = new KeyboardEvent("keydown", { code: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("대조군 — 등록되는 조합은 여전히 preventDefault를 부른다", () => {
    setup();
    record("사이드바 접기");
    const event = new KeyboardEvent("keydown", { code: "KeyJ", ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("수식어만 누르는 동안에는 등록되지 않는다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "ControlLeft", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("녹음 중에는 기본 동작을 막는다 — Ctrl+S가 저장 대화상자를 열지 않게", () => {
    setup();
    record("사이드바 접기");
    const event = new KeyboardEvent("keydown", { code: "KeyS", ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("충돌", () => {
  it("다른 액션이 쓰는 조합이면 등록하지 않고 알린다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyB", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("백업 페이지로 이동");
  });

  it("킷이 쓰는 조합이면 등록하지 않고 알린다", () => {
    const onChange = setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "Semicolon", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("날짜");
  });

  /* 녹음 버튼은 새로 녹음을 시작할 때 setMessage(null)로 안내를 지우는데, 지우기
   * 버튼의 onClick은 onChange(item.id, null)만 부르고 있었습니다 — 직전 충돌
   * 안내가 화면에 그대로 남는 결함. */
  it("지우기를 누르면 직전 충돌 안내가 사라진다", () => {
    setup();
    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyB", ctrlKey: true }); // 충돌 → 안내 뜸
    expect(screen.getByRole("alert")).toBeTruthy();

    const clearButtons = screen.getAllByRole("button", { name: "지우기" });
    fireEvent.click(clearButtons[0]);
    expect(screen.queryByRole("alert")).toBe(null);
  });
});

/* 스펙 §5.3 — 브라우저가 먼저 먹는 조합은 keydown이 **안 옵니다.** 목록으로는 못 잡고
 * 사용자가 그 자리에서 관측할 수 있는데, **안내가 없으면 그냥 반응 없는 화면**입니다. */
describe("녹음 중 안내가 계측기 노릇을 한다", () => {
  it("녹음을 시작하면 반응이 없을 때 무슨 뜻인지 알려 준다", () => {
    setup();
    expect(screen.queryByText(/브라우저나 OS가 먼저/)).toBe(null);
    record("사이드바 접기");
    expect(screen.getByText(/브라우저나 OS가 먼저/)).toBeTruthy();
  });
});

/* **§6.1의 실제 계약입니다.** 녹음 중에 디스패처가 조용한지는 지금까지 아무것도
 * 확인하지 않고 있었습니다. 대조군(녹음 전)이 있어야 공허하지 않습니다. */
describe("녹음 중에는 디스패처가 조용하다 (스펙 §6.1)", () => {
  it("녹음 중에 바인딩된 조합을 눌러도 액션이 안 불린다", () => {
    const onFire = vi.fn();
    render(
      <ShortcutProvider actions={[{ id: "toggle", label: "사이드바 접기", defaultCombo: "Ctrl+KeyJ", onFire }]}>
        <ShortcutSettings onChange={() => {}} />
      </ShortcutProvider>,
    );

    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });
    expect(onFire).toHaveBeenCalledTimes(1);   // 대조군 — 평소에는 돕니다

    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });
    expect(onFire).toHaveBeenCalledTimes(1);   // 늘지 않아야 합니다

    // 녹음이 끝나면 다시 돕니다 — 플래그가 새지 않는지까지 봅니다.
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });
    expect(onFire).toHaveBeenCalledTimes(2);
  });
});

/* 위 "디스패처가 조용하다" 테스트는 `beginRecording()`을 지워도 빨개지지 않습니다 —
 * 실측했습니다(task-5-report.md의 뮤테이션 기록). 이유: 녹음기는 document **캡처**에,
 * 디스패처는 document **버블**에 걸려 있고, 이벤트가 document를 타깃으로 올 때도
 * 캡처 패스가 버블 패스보다 **항상 먼저** 돕니다 — 등록 순서와 무관합니다. 같은 노드의
 * 캡처 패스와 버블 패스는 브라우저의 디스패치 알고리즘 안에서 **서로 다른 두 번의
 * `invoke` 호출**이고, 캡처 쪽 `invoke`가 통째로 먼저 끝난 뒤에야 버블 쪽 `invoke`가
 * 시작합니다(`src/shortcuts/combo.ts`의 `recordingDepth` 위 주석이 같은 근거를 적어
 * 두었습니다 — 거기서도 jsdom으로 확인했습니다). 그래서 녹음기의 `preventDefault()`가
 * 디스패처의 규칙 1(`defaultPrevented`) 검사보다 먼저 event에 반영되어, `isRecording()`이
 * 거짓이어도 규칙 1이 우연히 같은 결과를 냅니다 — 플래그를 안 재고 규칙 1만 잰
 * 셈입니다. 그래서 `isRecording()`을 **직접** 재서 이 우연한 보호와 분리합니다. */
describe("녹음 플래그 자체를 직접 잰다 — 우연한 보호와 분리 (스펙 §6.1)", () => {
  it("녹음을 시작하면 isRecording()이 참이고, 조합이 등록되면 다시 거짓이다", () => {
    setup();
    expect(isRecording()).toBe(false);
    record("사이드바 접기");
    expect(isRecording()).toBe(true);
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });
    expect(isRecording()).toBe(false);
  });
});

describe("CSS는 자기 뿌리 밖으로 안 나간다 (스펙 §8)", () => {
  it("shortcuts.css를 실제로 읽었다", () => {
    expect(SHORTCUT_CSS.length).toBeGreaterThan(200);
  });

  /* `selector.startsWith(".kkqq-shortcuts")`만으로는 콤마로 묶인 선택자 목록
   * (`.kkqq-shortcuts__row, button { }`)에서 뒤쪽 항목(`button`)이 안 걸립니다 —
   * 문자열 전체가 아니라 콤마로 나눈 각 항목을 따로 검사해야 합니다. */
  it("모든 규칙이 .kkqq-shortcuts 아래에 있다 — 콤마로 묶인 선택자도 각각 검사한다", () => {
    const withoutComments = SHORTCUT_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectorGroups = [...withoutComments.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim()).filter(Boolean);
    const selectors = selectorGroups.flatMap((group) => group.split(",").map((part) => part.trim()));
    expect(selectors.filter((selector) => !selector.startsWith(".kkqq-shortcuts"))).toEqual([]);
  });

  it("통번들이 이 파일을 싣는다", () => {
    expect(INDEX_CSS).toContain('@import "./shortcuts.css";');
  });
});

/* Task 7 — onChange가 선택이 됐습니다. 없으면 registry.setBinding으로 커밋합니다
 * (ShortcutProvider가 storage를 받은 uncontrolled일 때만 실제로 저장됩니다). */
describe("onChange 없이 storage로 커밋한다", () => {
  it("녹음한 조합이 storage에 저장된다", () => {
    const storage = createShortcutStorage({ key: "test:settings-record" });
    render(
      <ShortcutProvider actions={ACTIONS} storage={storage}>
        <ShortcutSettings />
      </ShortcutProvider>,
    );

    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });

    expect(storage.read()).toEqual({ toggle: "Ctrl+KeyJ" });
  });

  it("저장된 값이 화면에도 바로 반영된다 — 버튼 문구가 새 조합으로 바뀐다", () => {
    const storage = createShortcutStorage({ key: "test:settings-record2" });
    render(
      <ShortcutProvider actions={ACTIONS} storage={storage}>
        <ShortcutSettings />
      </ShortcutProvider>,
    );

    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });

    expect(screen.getByRole("button", { name: /사이드바 접기 Ctrl \+ J/ })).toBeTruthy();
  });

  it("지우기도 storage에 반영된다", () => {
    const storage = createShortcutStorage({ key: "test:settings-clear" });
    storage.write({ backup: "Ctrl+KeyB" });
    render(
      <ShortcutProvider actions={ACTIONS} storage={storage}>
        <ShortcutSettings />
      </ShortcutProvider>,
    );

    const clearButtons = screen.getAllByRole("button", { name: "지우기" });
    fireEvent.click(clearButtons[1]); // "백업 페이지로 이동"

    expect(storage.read()).toEqual({ backup: null });
  });

  // 대조군 — onChange가 있으면 여전히 그쪽이 이깁니다(앱이 소유). storage가 있어도
  // 무시됩니다. 이게 없으면 "언제나 registry.setBinding을 부르는" 구현으로도
  // 위 셋이 통과합니다.
  it("대조군 — onChange가 있으면 storage 대신 그걸 부른다", () => {
    const storage = createShortcutStorage({ key: "test:settings-onchange-wins" });
    const onChange = vi.fn();
    render(
      <ShortcutProvider actions={ACTIONS} storage={storage}>
        <ShortcutSettings onChange={onChange} />
      </ShortcutProvider>,
    );

    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });

    expect(onChange).toHaveBeenCalledWith("toggle", "Ctrl+KeyJ");
    expect(storage.read()).toEqual({});
  });
});

/* onChange도 없고 storage도 없으면 저장할 곳이 없습니다 — 조용히 넘어가지 않고
 * console.warn으로 개발자에게 알립니다(ShortcutSettingsProps.onChange 문서 참고). */
describe("onChange도 storage도 없을 때", () => {
  it("조용히 넘어가지 않고 console.warn을 부른다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<ShortcutProvider actions={ACTIONS}><ShortcutSettings /></ShortcutProvider>);

    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("바인딩은 바뀌지 않는다 — 버튼 문구가 그대로다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<ShortcutProvider actions={ACTIONS}><ShortcutSettings /></ShortcutProvider>);

    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });

    expect(screen.getByRole("button", { name: "사이드바 접기 없음" })).toBeTruthy();
    vi.restoreAllMocks();
  });

  // 대조군 — storage가 있으면 같은 조작이 warn 없이 저장된다.
  it("대조군 — storage가 있으면 warn 없이 저장된다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createShortcutStorage({ key: "test:settings-no-warn" });
    render(<ShortcutProvider actions={ACTIONS} storage={storage}><ShortcutSettings /></ShortcutProvider>);

    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  /* ⚠️ **전체 리뷰 Important 2.** `DateWheelPicker`의 `fields` 오배선 경고 선례는
   * `importMetaEnv?.DEV` 가드**와** 인스턴스별 중복 억제 ref를 같이 씁니다 — 같은
   * 원인으로 반복 호출되는 경고가 조작마다(여기서는 녹음마다) 다시 찍히면 신호가
   * 아니라 소음이기 때문입니다(`tests/DateWheelPicker.test.tsx`의 "같은 fields로
   * 여러 번 리렌더해도 경고는 한 번만"이 그 계약을 잽니다). 여기는 그 가드가
   * 없어서, 지금은 배선 안 된 앱이 녹음·지우기를 할 때마다(프로덕션 빌드에서도)
   * 매번 콘솔에 찍힙니다. */
  it("배선 누락 경고는 여러 번 녹음해도 한 번만 뜬다 — DateWheelPicker 선례 (전체 리뷰 Important 2)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<ShortcutProvider actions={ACTIONS}><ShortcutSettings /></ShortcutProvider>);

    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });
    record("백업 페이지로 이동");
    fireEvent.keyDown(document, { code: "KeyK", ctrlKey: true });

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

/* ⚠️ **전체 리뷰 Important 2.** `commit`이 `registry.setBinding`의 `false`를 전부
 * "저장할 곳이 없습니다"로 번역하고 있었습니다. 하지만 `storage`가 있는데
 * `storage.write`가 막힌 경우(프라이빗 모드·용량 초과)는 배선 문제가 아니라
 * **저장소가 막힌 것**이고, 이미 배선한 앱이 배선하라는 잘못된 경고를 받습니다 —
 * 그리고 이 경로는 `setOwnOverrides`가 이미 돌아 화면 상태가 바뀐 뒤이므로
 * "아무것도 안 했다"도 거짓입니다. `registry.canPersist`로 이 둘을 미리 구분합니다. */
describe("storage가 있어도 write가 막히면 (전체 리뷰 Important 2)", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("배선 누락 경고(console.warn)를 내지 않는다 — 배선은 돼 있다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createShortcutStorage({ key: "test:settings-write-blocked" });
    render(<ShortcutProvider actions={ACTIONS} storage={storage}><ShortcutSettings /></ShortcutProvider>);

    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });

    expect(warn).not.toHaveBeenCalled();
  });

  it("배선 누락 안내와는 다른 문구로 저장 실패를 알린다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const storage = createShortcutStorage({ key: "test:settings-write-blocked2" });
    render(<ShortcutProvider actions={ACTIONS} storage={storage}><ShortcutSettings /></ShortcutProvider>);

    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });

    // "저장할 곳이 없습니다"(배선 누락 문구)와는 달라야 합니다 — storage는 있으므로
    // 그 문구가 뜨면 사용자가 잘못 이해합니다.
    const alert = screen.getByRole("alert");
    expect(alert.textContent).not.toContain("저장할 곳이 없습니다");
  });

  // 대조군 — 막지 않으면 평소처럼 storage에 저장되고 실패 안내는 없다.
  it("대조군 — 막지 않으면 실패 안내 없이 저장된다", () => {
    const storage = createShortcutStorage({ key: "test:settings-write-ok" });
    render(<ShortcutProvider actions={ACTIONS} storage={storage}><ShortcutSettings /></ShortcutProvider>);

    record("사이드바 접기");
    fireEvent.keyDown(document, { code: "KeyJ", ctrlKey: true });

    expect(screen.queryByRole("alert")).toBe(null);
    expect(storage.read()).toEqual({ toggle: "Ctrl+KeyJ" });
  });
});

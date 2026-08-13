import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { formatCombo, comboFromEvent, parseCombo, shouldTrigger, UNBINDABLE_CODES } from "./shortcuts";
import { type ShortcutBindings, type ShortcutStorage } from "./shortcutStorage";

export type ShortcutAction = {
  /** 안정적인 식별자. **바뀌면 그 액션의 덮어쓰기가 고아가 됩니다**(스펙 §3.1). */
  id: string;
  label: string;
  /** null = 기본 조합 없음. 킷이 주는 액션은 전부 null입니다(스펙 §3.2). */
  defaultCombo: string | null;
  onFire: () => void;
};

export type ShortcutProviderProps = {
  actions: ShortcutAction[];
  /** 사용자가 바꾼 것만 담습니다. **키가 없음**과 **값이 null**은 다릅니다 —
   * 없으면 기본값을 쓰고, null이면 사용자가 조합을 **지운** 것입니다(스펙 §7.1).
   * 넘기면 **controlled** — 킷은 저장소를 전혀 건드리지 않습니다(아래 `storage`도
   * 완전히 무시됩니다). 앱이 소유합니다. `ThemeColorEditor`의 `overrides`와 같은
   * 경계입니다.
   *
   * 타입은 `ShortcutBindings`와 같습니다(전체 리뷰 Minor 10 — 전에는 이 자리만
   * `Record<string, string | null>`을 직접 적어 같은 모양을 이름 없이 반복했습니다). */
  overrides?: ShortcutBindings;
  /** `overrides` 없이 이것만 넘기면 **uncontrolled** — 킷이 저장소를 직접 읽고
   *  씁니다. 마운트 때 `storage.read()`로 채우고, `storage.subscribe`로 다른
   *  탭·다른 창의 변경을 받고, 아래 `setBinding`이 `storage.write`로 커밋합니다.
   *
   *  `overrides`와 `storage`가 둘 다 없으면(기본값) **지금까지와 같습니다** —
   *  `defaultCombo`만 쓰고 저장소 접근은 0입니다(스펙 §8의 옵트인 보장). */
  storage?: ShortcutStorage;
  children?: ReactNode;
};

export type ShortcutRegistry = {
  actions: ShortcutAction[];
  bindingOf(id: string): string | null;
  /** 사용자가 조합을 바꿀 때(녹음·지우기) `ShortcutSettings`가 부릅니다. controlled
   *  (`overrides` 있음)이거나 `storage`가 없으면 저장할 곳이 없다는 뜻이라 **아무것도
   *  안 하고 `false`를 돌려줍니다** — 그 경우 앱이 `ShortcutSettings`의 `onChange`로
   *  직접 처리해야 합니다. */
  setBinding(id: string, combo: string | null): boolean;
};

const ShortcutContext = createContext<ShortcutRegistry>({ actions: [], bindingOf: () => null, setBinding: () => false });

export function useShortcutRegistry(): ShortcutRegistry {
  return useContext(ShortcutContext);
}

export function ShortcutProvider({ actions, overrides, storage, children }: ShortcutProviderProps) {
  // overrides !== undefined가 controlled의 기준입니다(ThemeColorEditor와 같은 규칙) —
  // 참 값 검사가 아니라 undefined 검사인 이유는 `{}`("바꾼 게 하나도 없다")와
  // "안 넘겼다"를 구분해야 하기 때문입니다.
  const controlled = overrides !== undefined;

  // storage가 있고 uncontrolled일 때만 킷이 자기 사본을 갖습니다. controlled면 앱의
  // overrides를 그대로 쓰고, storage도 없으면 이 상태는 끝까지 빈 채로 남아
  // "지금까지와 같음"(defaultCombo만)이 됩니다 — 이 두 경우엔 저장소를 읽지 않으므로
  // 초기값 계산에서도 storage.read()를 부르면 안 됩니다.
  const [ownOverrides, setOwnOverrides] = useState<ShortcutBindings>(() => (!controlled && storage ? storage.read() : {}));

  // ⚠️ `useState`의 초기화 함수는 **마운트에 한 번만** 돕니다 — controlled 여부나
  // `storage` 참조가 나중에 바뀌는 것은 위 줄로 못 잡습니다. `ThemeColorEditor`의
  // `loadedTheme` 패턴(렌더 중 직전 값과 비교해 바뀌었으면 그 자리에서 다시 읽기)과
  // 같은 자리를 씁니다 — effect로 하면 리렌더 한 번을 낡은 값으로 그린 뒤에야
  // 갱신되어(§7.3처럼 매 렌더 결정되는 것과 어긋남) 화면이 한 프레임 깜빡입니다.
  // (전체 리뷰 Important 4 — 전에는 controlled로 마운트한 뒤 uncontrolled로 바뀌거나
  // storage 참조가 다른 저장소로 바뀌어도 `ownOverrides`가 마운트 당시 값에 갇혀,
  // 저장소에 값이 있어도 전부 `defaultCombo`로 보였고 그 뒤 첫 `setBinding`이 그
  // 저장된 값을 통째로 지웠습니다.)
  const [loadedOwner, setLoadedOwner] = useState<{ controlled: boolean; storage: ShortcutStorage | undefined }>({ controlled, storage });
  if (loadedOwner.controlled !== controlled || loadedOwner.storage !== storage) {
    setLoadedOwner({ controlled, storage });
    // controlled로 바뀌면 다시 안 읽습니다 — ThemeColorEditor의 loadedTheme과 같은
    // 이유로, 앱이 이미 overrides로 값을 넘기고 있는데 저장소를 다시 읽으면 그 값을
    // 덮어써 앱과 갈라집니다. storage가 없어지는 전환도 다시 읽을 곳이 없으므로 건너뜁니다.
    if (!controlled && storage) setOwnOverrides(storage.read());
  }

  // 다른 탭·다른 창의 변경을 받습니다. controlled거나 storage가 없으면 구독하지
  // 않습니다 — §8의 "storage를 안 넘기면 저장소를 안 건드린다"가 이 effect에도
  // 그대로 적용됩니다.
  useEffect(() => {
    if (controlled || !storage) return;
    return storage.subscribe(setOwnOverrides);
  }, [controlled, storage]);

  // controlled면 앱의 overrides, uncontrolled+storage면 킷이 읽어 온 사본, 둘 다
  // 아니면 undefined — bindingOf 안의 hasOwnProperty 검사가 undefined를 "덮어쓰기
  // 없음"으로 다루므로 이 세 번째 경우는 defaultCombo만 쓰던 예전 동작과 같습니다.
  const effectiveOverrides = controlled ? overrides : storage ? ownOverrides : undefined;

  const registry = useMemo<ShortcutRegistry>(() => {
    // id는 저장의 키입니다(스펙 §3.1) — 유일해야 합니다. id 중복은 프로그래밍 오류지만,
    // 그 상태에서도 동작은 결정적이어야 하므로 "먼저 나온 항목이 이긴다"로 못박습니다.
    // 여기서 id → 액션 맵을 딱 한 번만 계산해 두고 bindingOf는 이 맵만 읽습니다.
    // (전에는 bindingOf가 호출될 때마다 actions.find로 다시 훑었는데, 그러면 "같은 id를
    // 다시 조회한다"는 동작이 여러 자리에 흩어져 답이 갈릴 여지가 생깁니다 — 맵으로
    // 한 번에 고정하면 그 구조 자체가 없어집니다.)
    const byId = new Map<string, ShortcutAction>();
    for (const candidate of actions) {
      if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
    }
    function bindingOf(id: string): string | null {
      const action = byId.get(id);
      if (!action) return null;
      const override = effectiveOverrides && Object.prototype.hasOwnProperty.call(effectiveOverrides, id) ? effectiveOverrides[id] : undefined;
      const raw = override === undefined ? action.defaultCombo : override;
      if (raw === null) return null;
      const combo = parseCombo(raw);
      if (!combo) return null;
      // §6.2 — Escape·Tab(Shift+Tab 포함)은 defaultCombo·overrides로 들어와도 바인딩되지
      // 않습니다. 전에는 이 관문이 ShortcutSettings의 녹음기 안에만 있어서 여길 우회할 수
      // 있었고, 그 결과 예를 들어 Shift+Tab을 바인딩하면 Dialog의 포커스 트랩(감싸지 않는
      // 평범한 Tab에서는 preventDefault를 안 부름)과 부딪혀 포커스가 아예 안 나갔습니다
      // (전체 리뷰 Important 2).
      if (UNBINDABLE_CODES.has(combo.code)) return null;
      return formatCombo(combo);
    }
    // ⚠️ 값 검증(정규화·UNBINDABLE_CODES)은 여기(bindingOf)와 녹음기(ShortcutSettings)
    // 딱 두 곳입니다 — §9 파일 경계와 shortcuts.ts의 UNBINDABLE_CODES 주석이 이미
    // "두 소비자가 같은 관문을 봐야 한다"고 못박아 둔 구조입니다. setBinding은 그
    // 위에 저장 배선만 얹으므로 여기서 다시 검증하지 않습니다 — 세 번째 관문을
    // 만들면 셋이 갈릴 여지가 생깁니다.
    function setBinding(id: string, combo: string | null): boolean {
      if (controlled || !storage) return false;
      const next = { ...effectiveOverrides, [id]: combo };
      const ok = storage.write(next);
      // 저장이 막혀도 화면은 반영합니다 — themeTokens/ThemeColorEditor와 같은 관용입니다
      // ("저장이 막혀도 화면에는 적용된다"). 이 탭 안에서는 사용자가 계속 조합을 고를 수
      // 있어야 하고, 실패 신호는 이 함수의 반환값(false)이 이미 전달합니다.
      setOwnOverrides(next);
      return ok;
    }
    return { actions, bindingOf, setBinding };
  }, [actions, effectiveOverrides, controlled, storage]);

  // 리스너를 다시 걸지 않으려고 ref로 최신값을 봅니다 — 액션 배열이 매 렌더 새 참조여도
  // document 리스너는 한 번만 붙습니다.
  const registryRef = useRef(registry);
  registryRef.current = registry;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!shouldTrigger(event)) return;
      const pressed = formatCombo(comboFromEvent(event));
      const current = registryRef.current;
      const hit = current.actions.find((candidate) => current.bindingOf(candidate.id) === pressed);
      if (!hit) return;
      hit.onFire();
      event.preventDefault();   // 규칙 6 — 트리거된 것만 막습니다
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return <ShortcutContext.Provider value={registry}>{children}</ShortcutContext.Provider>;
}

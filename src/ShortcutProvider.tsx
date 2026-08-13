import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

import { formatCombo, comboFromEvent, parseCombo, shouldTrigger, UNBINDABLE_CODES } from "./shortcuts";

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
   * 없으면 기본값을 쓰고, null이면 사용자가 조합을 **지운** 것입니다(스펙 §7.1). */
  overrides?: Record<string, string | null>;
  children?: ReactNode;
};

export type ShortcutRegistry = { actions: ShortcutAction[]; bindingOf(id: string): string | null };

const ShortcutContext = createContext<ShortcutRegistry>({ actions: [], bindingOf: () => null });

export function useShortcutRegistry(): ShortcutRegistry {
  return useContext(ShortcutContext);
}

export function ShortcutProvider({ actions, overrides, children }: ShortcutProviderProps) {
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
      const override = overrides && Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : undefined;
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
    return { actions, bindingOf };
  }, [actions, overrides]);

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

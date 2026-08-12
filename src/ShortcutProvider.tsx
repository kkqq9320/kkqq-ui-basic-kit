import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

import { formatCombo, comboFromEvent, normalizeCombo, shouldTrigger } from "./shortcuts";

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

type Registry = { actions: ShortcutAction[]; bindingOf(id: string): string | null };

const ShortcutContext = createContext<Registry>({ actions: [], bindingOf: () => null });

export function useShortcutRegistry(): Registry {
  return useContext(ShortcutContext);
}

export function ShortcutProvider({ actions, overrides, children }: ShortcutProviderProps) {
  const registry = useMemo<Registry>(() => ({
    actions,
    bindingOf(id) {
      const action = actions.find((candidate) => candidate.id === id);
      if (!action) return null;
      const override = overrides && Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : undefined;
      const raw = override === undefined ? action.defaultCombo : override;
      return raw === null ? null : normalizeCombo(raw);
    },
  }), [actions, overrides]);

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

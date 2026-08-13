import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { formatCombo, comboFromEvent, parseCombo, shouldTrigger, unbindableReason } from "./shortcuts";
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
  /** `setBinding`·`restoreBindings`가 실제로 뭔가를 저장할 자리가 있는지 — uncontrolled
   *  (`overrides` 없음)이고 `storage`가 있을 때만 참입니다.
   *
   *  ⚠️ **`setBinding`의 반환값(`false`)만으로는 "저장할 곳이 없다"(배선 누락)와
   *  "저장이 실패했다"(`storage`는 있는데 `storage.write`가 막힘 — 프라이빗 모드·
   *  용량 초과)를 못 가립니다. 둘 다 `false`를 돌려주기 때문입니다.** `canPersist`를
   *  먼저 보면 그 둘을 구분할 수 있습니다 — `ShortcutSettings`가 이걸로 서로 다른
   *  문구를 냅니다(전체 리뷰 Important 2). */
  canPersist: boolean;
  /** 사용자가 조합을 바꿀 때(녹음·지우기) `ShortcutSettings`가 부릅니다.
   *
   *  - `canPersist`가 거짓이면(controlled이거나 `storage`가 없음) **정말로 아무것도
   *    안 하고** `false`를 돌려줍니다 — 앱이 `ShortcutSettings`의 `onChange`로 직접
   *    처리해야 한다는 뜻입니다.
   *  - `canPersist`가 참인데 `storage.write`가 실패하면(프라이빗 모드·용량 초과)도
   *    `false`를 돌려주지만, 이때는 **이미 화면 상태를 갱신한 뒤**입니다 —
   *    `themeTokens`/`ThemeColorEditor`와 같은 관용으로, 저장이 막혀도 이 탭에서는
   *    계속 조합을 고를 수 있어야 하기 때문입니다. "아무것도 안 하고"는 이 경우
   *    거짓입니다(전체 리뷰 Important 2 — 이전 문서는 두 경우를 구분하지 않았습니다).
   *
   *  ⚠️ **`combo`를 검증하지 않습니다**(전체 리뷰 Minor 9) — 정규화·`UNBINDABLE_CODES`
   *  검사는 `bindingOf`와 녹음기에만 있습니다(위 파일 경계 주석 참고). `bindingOf`는
   *  걸러진 값을 조용히 무효(`null`)로 다루므로, 앱이 `setBinding`으로 비정규 문자열을
   *  직접 넣으면 **그 세션에는 조합이 없다가**, 새로고침해서 `storage.read()`가
   *  `normalizeCombo`를 거쳐 그 값을 걸러 낸 뒤에는 `defaultCombo`가 돌아옵니다 —
   *  같은 저장값이 새로고침 전후로 다르게 보입니다. `ShortcutSettings`의 녹음기를
   *  거치는 정상 경로에서는 애초에 정규화된 값만 들어오므로 이 문제가 없습니다. */
  setBinding(id: string, combo: string | null): boolean;
  /** 백업에서 복원한 맵(`storage.parse(input)?.backup.bindings`)을 통째로 커밋합니다
   *  — `setBinding`을 항목마다 루프로 부르는 대신입니다. 저장(`storage.write`)과 이
   *  탭의 화면 상태를 함께 갱신합니다. `setBinding`과 같은 경계 — controlled이거나
   *  `storage`가 없으면 아무것도 안 하고 `false`를 돌려줍니다(`themePalette
   *  .applyBackup`과 같은 자리, 전체 리뷰 Important 5-나). */
  restoreBindings(bindings: ShortcutBindings): boolean;
};

const ShortcutContext = createContext<ShortcutRegistry>({ actions: [], bindingOf: () => null, canPersist: false, setBinding: () => false, restoreBindings: () => false });

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

  // `setBinding`·`restoreBindings`가 병합 베이스로 씁니다 — `ownOverrides`(state) 대신
  // 이 ref를 보는 이유는 아래 `updateOwnOverrides` 주석에 적어 둡니다(전체 리뷰
  // Important 5-가). `useRef`의 인자는 첫 렌더에서만 쓰이므로 위 `useState` 초기값과
  // 항상 같은 값으로 시작합니다.
  const ownOverridesRef = useRef<ShortcutBindings>(ownOverrides);

  // ⚠️ **`ownOverrides`를 바꾸는 자리는 전부 이 함수를 지나야 합니다** — state만 바꾸고
  // ref를 안 바꾸면 다음 `setBinding` 호출이 낡은 ref를 베이스로 병합해 방금 그 변경을
  // (예: 다른 탭에서 온 `subscribe` 갱신을) 덮어씁니다. `setBinding`은 이 ref를
  // **동기로** 읽고 그 자리에서 `storage.write`를 부르므로, `setOwnOverrides(prev => …)`
  // 갱신 함수 안에 병합 로직을 넣는 방법은 못 씁니다 — React가 그 함수를 지금 당장
  // 부른다는 보장이 없고(StrictMode는 실제로 두 번 부릅니다), `write`의 동기 반환값이
  // 필요합니다. ref는 그 자리에서 바로 갱신되므로 이 문제가 없습니다.
  function updateOwnOverrides(next: ShortcutBindings) {
    ownOverridesRef.current = next;
    setOwnOverrides(next);
  }

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
    if (!controlled && storage) updateOwnOverrides(storage.read());
  }

  // 다른 탭·다른 창의 변경을 받습니다. controlled거나 storage가 없으면 구독하지
  // 않습니다 — §8의 "storage를 안 넘기면 저장소를 안 건드린다"가 이 effect에도
  // 그대로 적용됩니다. `setOwnOverrides`가 아니라 `updateOwnOverrides`를 넘깁니다 —
  // 안 그러면 다른 탭에서 온 갱신이 state는 바꾸면서 `ownOverridesRef`는 낡은 채로
  // 남겨, 그 직후 이 탭에서 `setBinding`을 부르면 다른 탭의 변경을 덮어씁니다.
  useEffect(() => {
    if (controlled || !storage) return;
    return storage.subscribe(updateOwnOverrides);
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
      // §6.2 — 등록 금지 조합은 defaultCombo·overrides로 들어와도 바인딩되지 않습니다.
      // 전에는 이 관문이 ShortcutSettings의 녹음기 안에만 있어서 여길 우회할 수 있었고,
      // 그 결과 예를 들어 Shift+Tab을 바인딩하면 Dialog의 포커스 트랩(감싸지 않는 평범한
      // Tab에서는 preventDefault를 안 부름)과 부딪혀 포커스가 아예 안 나갔습니다
      // (전체 리뷰 Important 2). 이유별 목록은 shortcuts.ts의 unbindableReason에 있습니다 —
      // Escape·Tab(킷 리스너), 맨 Enter·Space(활성화), Ctrl+C/V/X/Z/Y(브라우저 편집).
      if (unbindableReason(combo)) return null;
      return formatCombo(combo);
    }
    // ⚠️ 값 검증(정규화·UNBINDABLE_CODES)은 여기(bindingOf)와 녹음기(ShortcutSettings)
    // 딱 두 곳입니다 — §9 파일 경계와 shortcuts.ts의 UNBINDABLE_CODES 주석이 이미
    // "두 소비자가 같은 관문을 봐야 한다"고 못박아 둔 구조입니다. setBinding은 그
    // 위에 저장 배선만 얹으므로 여기서 다시 검증하지 않습니다 — 세 번째 관문을
    // 만들면 셋이 갈릴 여지가 생깁니다.
    function setBinding(id: string, combo: string | null): boolean {
      if (controlled || !storage) return false;
      // ⚠️ 베이스는 `effectiveOverrides`(렌더 스코프의 클로저)가 아니라
      // `ownOverridesRef.current`입니다(전체 리뷰 Important 5-가). 같은 이벤트
      // 핸들러·act() 안에서(리렌더 없이) `setBinding`을 여러 번 부르면 —
      // `restoreBindings`가 없던 시절엔 백업 복원을 이렇게 루프로 흉내 냈습니다 —
      // `effectiveOverrides`는 그 호출들 내내 이 렌더가 시작할 때의 값에 그대로
      // 고정돼 있어서, 나중 호출이 앞선 호출의 결과를 덮어씁니다. `ownOverridesRef`는
      // `updateOwnOverrides`가 호출 직후 동기로 갱신하므로 그 문제가 없습니다.
      const next = { ...ownOverridesRef.current, [id]: combo };
      const ok = storage.write(next);
      // 저장이 막혀도 화면은 반영합니다 — themeTokens/ThemeColorEditor와 같은 관용입니다
      // ("저장이 막혀도 화면에는 적용된다"). 이 탭 안에서는 사용자가 계속 조합을 고를 수
      // 있어야 하고, 실패 신호는 이 함수의 반환값(false)이 이미 전달합니다.
      updateOwnOverrides(next);
      return ok;
    }
    /** 백업에서 복원한 맵을 통째로 커밋합니다 — `setBinding`을 항목마다 루프로 부르는
     *  대신입니다(그 루프는 위 5-가가 고치기 전엔 마지막 항목만 남았고, 지금도 항목마다
     *  `storage.write`를 반복해 부르는 낭비가 있습니다). `themePalette.applyBackup`과
     *  같은 자리(전체 리뷰 Important 5-나) — 다만 팔레트는 라이트·다크 두 저장소를 따로
     *  갖고 있어 `write`만 하고 `:root` 적용은 넘긴 테마에만 하는 반면, 단축키는 저장소가
     *  하나뿐이라 `write`와 화면 갱신(`updateOwnOverrides`)을 둘 다 이 함수가 합니다 —
     *  `storage.write`만 직접 부르면 저장은 되어도 이 탭의 화면 상태가 낡습니다
     *  (`subscribe`는 설계상 같은 탭 변경을 안 받습니다). `setBinding`과 같은 경계 —
     *  controlled이거나 storage가 없으면 아무것도 안 하고 `false`를 돌려줍니다. */
    function restoreBindings(bindings: ShortcutBindings): boolean {
      if (controlled || !storage) return false;
      const ok = storage.write(bindings);
      updateOwnOverrides(bindings);
      return ok;
    }
    return { actions, bindingOf, canPersist: !controlled && !!storage, setBinding, restoreBindings };
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

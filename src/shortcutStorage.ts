/* 단축키 사용자 덮어쓰기의 저장소. `themePalette.ts`의 모양을 따릅니다 — 저장 실패는
 * 던지지 않고 `boolean`/`{}`로 알리고, 왕복 불가능한 값은 이름을 남기고 버립니다.
 *
 * ⚠️ **`themeTokens.ts`와 저장 모양이 다릅니다.** `writeTokenOverrides`는 저장소에
 * **맨 맵**을 넣고, 버전 붙은 봉투는 `serialize`/`parse`(백업 내보내기 전용)에서만
 * 등장합니다. 여기서는 **저장소 자체**가 봉투입니다(`{ version: 1, bindings: {...} }`)
 * — 설계 스펙 §7이 그렇게 못박았습니다. 맨 맵을 저장하면 나중에 봉투 모양으로
 * 옮길 때 옛 사용자의 저장값을 못 읽는 마이그레이션이 생기므로, 처음부터 봉투로
 * 시작합니다.
 */
import { normalizeCombo } from "./shortcuts";

/** 액션 id → 조합 문자열. **`null`과 "키 없음"은 다릅니다**(설계 스펙 §7.1) —
 *  `null`은 "사용자가 이 액션의 조합을 지웠다", 키가 아예 없는 것은 "기본값
 *  (`defaultCombo`)을 쓴다"입니다. 기본값이 나중에 바뀌어도 지운 적 없는 사용자는
 *  새 기본값을 그대로 받아야 하므로, 이 구분이 왕복(저장→읽기)에서 안 섞여야
 *  합니다. */
export type ShortcutBindings = Record<string, string | null>;

/** 저장·백업에 실어 보낼 봉투. `version`은 이 형식의 버전이지 킷 버전이 아닙니다. */
export type ShortcutBackup = { version: 1; bindings: ShortcutBindings };

/** `dropped`에는 **버린 액션 id**가 담깁니다. 값이 문자열도 `null`도 아니거나,
 *  문자열인데 `normalizeCombo`가 거부하면 버립니다. 조용히 버리면 사용자는 그
 *  단축키가 왜 안 돌아왔는지 알 방법이 없습니다(themePalette.parse와 같은 이유로
 *  같은 모양을 씁니다). */
export type ParsedShortcutBindings = { backup: ShortcutBackup; dropped: string[] };

export type ShortcutStorage = {
  /** 지금 저장된 덮어쓰기. 저장소가 막혔거나 값이 깨졌어도 **던지지 않고** `{}`를
   *  돌려줍니다. */
  read(): ShortcutBindings;
  /** 저장에 성공하면 `true`. 저장소가 막혀 있으면 `false`이고 **예외를 던지지
   *  않습니다.** 빈 맵을 주면 저장된 키 자체를 지웁니다 — 빈 봉투를 남기지
   *  않습니다(themeTokens의 `writeTokenOverrides`와 같은 선례). */
  write(next: ShortcutBindings): boolean;
  /** 다른 탭·다른 창에서 이 저장소가 바뀌면(`storage` 이벤트) 불립니다. **같은 탭
   *  안의 변경으로는 안 불립니다** — 그건 브라우저의 `storage` 이벤트 자체가 다른
   *  document에서 일어난 변경만 알리기 때문입니다(같은 탭의 변경은 호출자가 이미
   *  알고 있으므로 문제가 아닙니다). 다른 키의 이벤트는 무시합니다. 해지 함수를
   *  돌려줍니다. */
  subscribe(listener: (next: ShortcutBindings) => void): () => void;
  /** 봉투를 만듭니다. 인자를 안 주면 저장소를 읽습니다 — 앱이 저장소를 소유(controlled)
   *  하고 있으면 값이 저장소가 아니라 앱 상태에 있으므로, 그때는 넘겨야 빈 백업이
   *  안 나옵니다(ThemeColorEditor.serialize와 같은 이유). */
  serialize(bindings?: ShortcutBindings): ShortcutBackup;
  /** 봉투가 아니면 `null`. 알 수 없는 값은 걸러 `dropped`에 이름을 남깁니다. */
  parse(input: unknown): ParsedShortcutBindings | null;
};

/** `themeTokens.ts`의 `storageKey`(`themeColors:${theme}`)와 같은 관례를 따릅니다 —
 *  킷 네임스페이스 접두어 없이 도메인 이름 그대로입니다. 테마는 라이트/다크 변형이
 *  있어 콜론 뒤에 그 이름이 붙지만, 단축키 덮어쓰기는 변형이 없는 맵 하나뿐이라
 *  접미사가 없습니다. */
const DEFAULT_KEY = "shortcutBindings";

/** 값 하나를 정리합니다. **`null`은 그대로 통과시켜야 합니다** — 여기서 걸러지면
 *  "사용자가 지움"과 "몰라서 버림"이 똑같이 사라져, 왕복(저장→읽기)에서 그 둘을
 *  구분할 수 없습니다(지켜야 하는 것 1번 — 이 한 줄이 그 요구사항의 전부입니다). */
function cleanValue(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return normalizeCombo(value) ?? undefined;
  return undefined;   // 문자열도 null도 아님 — 버립니다
}

function cleanBindings(raw: unknown, dropped: string[]): ShortcutBindings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: ShortcutBindings = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const cleaned = cleanValue(value);
    if (cleaned === undefined) dropped.push(id);
    else out[id] = cleaned;   // cleaned가 null이면 out[id] = null — "지움"이 유지됩니다
  }
  return out;
}

export function createShortcutStorage(options?: { key?: string }): ShortcutStorage {
  const key = options?.key ?? DEFAULT_KEY;

  function parse(input: unknown): ParsedShortcutBindings | null {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    const envelope = input as { version?: unknown; bindings?: unknown };
    if (envelope.version !== 1) return null;
    // bindings는 맵 하나뿐이라(themePalette의 light/dark처럼 여러 테마로 안 나뉩니다)
    // 아예 없는 것도 봉투가 아닌 것으로 봅니다 — themePalette.parse가 colors 컨테이너
    // 자체가 없으면 null을 내는 것과 같은 자리입니다("테마 값이 없으면"이 아니라
    // "colors가 없으면"과 대응).
    if (typeof envelope.bindings !== "object" || envelope.bindings === null || Array.isArray(envelope.bindings)) return null;
    const dropped: string[] = [];
    const bindings = cleanBindings(envelope.bindings, dropped);
    // bindings가 맵 하나뿐이라 같은 id가 두 번 버려질 구조적 여지는 없습니다
    // (Object.entries가 유일한 키만 냅니다) — themePalette.parse는 라이트·다크 양쪽에서
    // 같은 이름이 버려질 수 있어 dedup이 실제로 걸리지만, 여기서는 걸릴 입력을 만들 수
    // 없습니다. 그래도 같은 모양을 유지합니다 — 이 함수가 나중에 여러 소스를 합치는
    // 쪽으로 바뀌어도 이 줄만으로 안전하고, 지금은 **따로 확인할 수 없으므로 이
    // 한 줄 자체에 별도 테스트를 달지 않습니다**(실패할 수 없는 테스트를 만들지
    // 않기 위해서입니다).
    return { backup: { version: 1, bindings }, dropped: [...new Set(dropped)] };
  }

  function read(): ShortcutBindings {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const parsed = parse(JSON.parse(raw));
      return parsed ? parsed.backup.bindings : {};
    } catch {
      return {};
    }
  }

  function write(next: ShortcutBindings): boolean {
    try {
      if (Object.keys(next).length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ version: 1, bindings: next }));
      return true;
    } catch {
      return false;
    }
  }

  function subscribe(listener: (next: ShortcutBindings) => void): () => void {
    function handleStorage(event: StorageEvent) {
      if (event.key !== key) return;   // 다른 키의 이벤트는 무시합니다(지켜야 하는 것 7번)
      if (!event.newValue) { listener({}); return; }   // 다른 탭이 지웠다(빈 맵과 같은 뜻)
      let parsedJson: unknown;
      try { parsedJson = JSON.parse(event.newValue); } catch { listener({}); return; }
      const parsed = parse(parsedJson);
      listener(parsed ? parsed.backup.bindings : {});
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }

  function serialize(bindings?: ShortcutBindings): ShortcutBackup {
    return { version: 1, bindings: bindings ?? read() };
  }

  return { read, write, subscribe, serialize, parse };
}

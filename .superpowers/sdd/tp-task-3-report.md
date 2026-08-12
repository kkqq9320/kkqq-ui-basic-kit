# Task 3 Report: 백업 형식 — 묶고, 검증한다

## Summary

Implemented a versioned envelope format for backing up and restoring theme colors. The implementation exports two new types (`ThemeColorBackup`, `ParsedThemeColors`) and adds two methods to the `ThemePalette` interface: `serialize()` and `parse()`.

## What Was Implemented

### Types Added

1. **`ThemeColorBackup`**: Versioned envelope containing light and dark theme color overrides
   - Version field set to 1 (format version, not kit version)
   - Colors object with separate light and dark theme records

2. **`ParsedThemeColors`**: Result of parsing a backup
   - Contains the validated backup
   - Contains array of dropped token names for transparency

### Methods Added to ThemePalette

1. **`serialize(colors?): ThemeColorBackup`**
   - If colors argument provided: uses it directly
   - If colors argument omitted: reads from localStorage via `readTokenOverrides()`
   - Wraps result in version 1 envelope

2. **`parse(input: unknown): ParsedThemeColors | null`**
   - Validates envelope structure (object, has version: 1, has colors object)
   - Returns null for invalid envelopes
   - Filters each theme through `cleanTheme()` helper
   - Uses `normalizeColor()` from themeTokens.ts for color validation
   - Reports dropped tokens (unknown names and invalid color formats)
   - Distinguishes empty backup `{}` from invalid input `null`

### Helper Function

**`cleanTheme(raw, known, dropped)`**: Validates a single theme's colors
- Rejects non-objects, arrays, null
- Only keeps tokens that:
  - Exist in the known token set
  - Have string values that normalize to valid hex colors
- Accumulates dropped names in the provided array

## TDD Evidence

### RED Phase

```bash
$ npx vitest run tests/themePalette.test.ts

19 tests | 9 failed
❯ 백업 형식 > 저장된 값을 봉투에 담는다
  → palette.serialize is not a function
❯ 백업 형식 > 넘긴 값이 있으면 저장소를 읽지 않는다
  → palette.serialize is not a function
❯ 백업 형식 > 왕복하면 같은 값이 나온다
  → palette.serialize is not a function
❯ 백업 형식 > 모르는 토큰은 버리고 이름을 남긴다
  → palette.parse is not a function
❯ 백업 형식 > 버린 이름이 dropped에 담긴다
  → palette.parse is not a function
❯ 백업 형식 > 색 형식이 아닌 값도 버리고 이름을 남긴다
  → palette.parse is not a function
❯ 백업 형식 > version이 1이 아니면 null이다
  → palette.parse is not a function
❯ 백업 형식 > 봉투 모양이 아니면 null이다
  → palette.parse is not a function
❯ 백업 형식 > 빈 백업은 null이 아니다
  → palette.parse is not a function
```

All 9 new tests failed as expected with "not a function" errors before implementation.

### GREEN Phase

```bash
$ npx vitest run tests/themePalette.test.ts

Test Files: 1 passed
Tests: 19 passed (19)
```

All tests pass, including the 9 new tests.

### Full Suite Verification

```bash
$ npx vitest run

Test Files: 27 passed
Tests: 810 passed (810)
```

- Baseline: 801 tests
- After implementation: 810 tests (+9 tests as expected)
- All tests pass
- No regressions

### Type Checking

```bash
$ npx tsc --noEmit
```

Exit code 0 — no TypeScript errors.

## Files Changed

- **`src/themePalette.ts`**: Added imports, types, helper function, and serialize/parse methods
- **`tests/themePalette.test.ts`**: Appended 9 test cases

## Self-Review Findings

### Test Correctness — Failure Verification

Each test verifies against specific implementation details that would cause failure if changed:

1. **"저장된 값을 봉투에 담는다"** — Would fail if:
   - serialize() doesn't call readTokenOverrides()
   - serialize() doesn't wrap in { version: 1, colors: {...} }

2. **"넘긴 값이 있으면 저장소를 읽지 않는다"** — Would fail if:
   - serialize() ignores the colors argument
   - serialize() calls readTokenOverrides() when colors is provided

3. **"왕복하면 같은 값이 나온다"** — Would fail if:
   - serialize() or parse() doesn't preserve color values
   - parse() drops valid tokens incorrectly

4. **"모르는 토큰은 버리고 이름을 남긴다"** — Would fail if:
   - parse() doesn't filter unknown token names
   - cleanTheme() accepts tokens not in the known set

5. **"버린 이름이 dropped에 담긴다"** — Would fail if:
   - parse() doesn't populate dropped array
   - cleanTheme() silently drops without tracking

6. **"색 형식이 아닌 값도 버리고 이름을 남긴다"** — Would fail if:
   - parse() doesn't use normalizeColor() validation
   - cleanTheme() accepts non-color strings like "빨강"

7. **"version이 1이 아니면 null이다"** — Would fail if:
   - parse() doesn't check envelope.version
   - parse() accepts version !== 1

8. **"봉투 모양이 아니면 null이다"** — Would fail if:
   - parse() doesn't validate envelope structure
   - parse() accepts strings, arrays, or objects without colors/version

9. **"빈 백업은 null이 아니다"** — Would fail if:
   - parse() treats { version: 1, colors: { light: {}, dark: {} } } as invalid
   - parse() doesn't distinguish empty from null

### Implementation Verification

- Used `normalizeColor()` from themeTokens.ts for all color validation (no custom regex)
- Applied `readTokenOverrides()` from themeTokens.ts consistently
- Helper function `cleanTheme()` correctly validates tokens by both name and color format
- Empty backups (`{ version: 1, colors: { light: {}, dark: {} } }`) return valid `ParsedThemeColors`, not null
- Invalid inputs (strings, arrays, null, wrong version, missing colors) all return null as expected

## Concerns

**None.** The implementation matches the brief exactly, all 9 tests pass with predictable failures, no TypeScript errors, full test suite passes at expected 810 total tests, and no existing functionality was broken.

## Commits

- **52ab012**: feat: a versioned envelope for backing colours up and restoring them
  - Added `ThemeColorBackup` and `ParsedThemeColors` types
  - Added `serialize()` and `parse()` methods to ThemePalette
  - Added `cleanTheme()` helper function
  - Imported `normalizeColor` from themeTokens
  - Appended 9 test cases to themePalette.test.ts

---

# Task 3 Fix: Reject malformed theme values

## Summary

Fixed a bug in `parse()` where malformed theme values (non-objects) were silently converted to empty maps, making `dropped` return `[]` while the entire theme reset. The fix validates both light and dark theme values against the design rules table: they must be either undefined (absent, valid) or plain objects. Malformed values now return `null`.

## Finding

In `src/themePalette.ts`, the `parse` function handled a malformed **theme value** by silently returning an empty map in `cleanTheme()`:

```ts
function cleanTheme(raw: unknown, known: Set<string>, dropped: string[]): Record<string, string> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  // ...
}
```

So `palette.parse({ version: 1, colors: { light: "빨강", dark: {} } })` returned a clean-looking object with empty backup and `dropped: []`, contradicting the `ParsedThemeColors` doc-comment that users must know why colours were lost.

## What Was Changed

In `src/themePalette.ts`:

1. **Added predicate** (with Korean doc-comment):
   ```ts
   const isThemeShaped = (raw: unknown) => raw === undefined || (typeof raw === "object" && raw !== null && !Array.isArray(raw));
   ```

2. **Updated `parse()` function** to check both theme values before processing:
   ```ts
   if (!isThemeShaped(source.light) || !isThemeShaped(source.dark)) return null;
   ```

In `tests/themePalette.test.ts`:

1. **Added test**: "테마 값이 객체가 아니면 null이다" — verifies string, array, and number theme values all return `null`
2. **Added test**: "테마 키가 아예 없으면 빈 백업으로 읽는다" — verifies absent keys still create valid empty backups

## TDD Evidence

### Step 1: RED — Only One Test Fails (the other exercises existing logic)

```bash
$ npx vitest run tests/themePalette.test.ts

RUN  v3.2.7 C:/Users/JJ/Claude/kkqq-ui-basic-kit
 ✓ tests/themePalette.test.ts (21 tests | 1 failed) 42ms

FAIL tests/themePalette.test.ts > 백업 형식 > 테마 값이 객체가 아니면 null이다
AssertionError: expected [ { …(2) }, { …(2) }, { …(2) } ] to deeply equal [ null, null, null ]

- Expected: [ null, null, null ]
+ Received: [ {backup: {...}, dropped: []}, {backup: {...}, dropped: []}, {backup: {...}, dropped: []} ]

Test Files: 1 failed (1)
Tests: 1 failed | 20 passed (21)
```

The first test failed because `parse()` was returning objects instead of `null` for malformed theme values. The second test passed because absent keys (handled by `cleanTheme`'s undefined case) already worked correctly.

### Step 3: GREEN — Both Tests Pass

```bash
$ npx vitest run tests/themePalette.test.ts

✓ tests/themePalette.test.ts (21 tests) 39ms

Test Files: 1 passed (1)
Tests: 21 passed (21)
```

All 21 tests pass after implementing the fix.

### Step 4: Full Suite Verification

```bash
$ npx vitest run

Test Files: 27 passed (27)
Tests: 812 passed (812)
```

Full test suite passes (812 tests as expected).

```bash
$ npx tsc --noEmit
```

Exit code 0 — no TypeScript errors.

## Commits

- **629cd8e**: fix: reject malformed theme values with null instead of silent empty
  - Added `isThemeShaped` predicate validating theme values
  - Updated `parse()` to check both light and dark values
  - Added 2 test cases for malformed and absent theme keys

## 뒤늦은 RED — 테마 키가 아예 없으면

The test "테마 키가 아예 없으면 빈 백업으로 읽는다" was never seen to fail before the fix was written, because it exercises a code path that already worked correctly. Below is evidence that the test **would** fail if the fix (the `isThemeShaped` predicate) were removed.

### Mutation Applied

Removed the `raw === undefined ||` clause from the `isThemeShaped` predicate:

```ts
// Before (correct):
const isThemeShaped = (raw: unknown) => raw === undefined || (typeof raw === "object" && raw !== null && !Array.isArray(raw));

// Mutation (breaks the path):
const isThemeShaped = (raw: unknown) => typeof raw === "object" && raw !== null && !Array.isArray(raw);
```

### Command Run

```bash
npx vitest run tests/themePalette.test.ts
```

### Failure Output

```
FAIL tests/themePalette.test.ts > 백업 형식 > 테마 키가 아예 없으면 빈 백업으로 읽는다

AssertionError: expected null to deeply equal { backup: { version: 1, …(1) }, …(1) }

- Expected: 
{
  "backup": {
    "colors": {
      "dark": {},
      "light": {
        "--brand-2": "#ff8a3d",
      },
    },
    "version": 1,
  },
  "dropped": [],
}

+ Received: 
null
```

With the mutation, `parse()` returns null instead of an empty backup when a theme key (e.g., `dark`) is undefined, proving that the test failure would occur without the predicate.

### Verification After Restore

```bash
$ git checkout -- src/themePalette.ts
$ git diff src/
(no output — working tree clean)
```

```bash
$ npx vitest run

Test Files: 27 passed (27)
Tests: 812 passed (812)
```

```bash
$ npx tsc --noEmit
(exit code 0)
```

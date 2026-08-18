/* 공개 API. CSS는 별도로 한 번 import 하세요:
 *
 *   import "design-system/css/index.css";
 *   import { Select, DateWheelPicker, Sidebar } from "design-system/src";
 *
 * 🔴 **이 파일은 목차이고, 그 묶음이 곧 폴더입니다.** 순서는 알파벳도 의존 층도 아닌
 * **역할별 묶음**이고 `src/`의 폴더가 그 묶음과 **하나씩 짝**입니다(컨트롤 →
 * `controls/`, 표면·레이아웃 → `surfaces/` …). 어긋나면 `tests/moduleLayers.test.ts`가
 * 빨개집니다. 규칙과 그 이유는 `PRINCIPLES.md` §15에 있습니다. 새 항목을 맨 아래에 덧붙이지
 * 마세요 — 어느 묶음에 속하는지 정해서 그 안에 넣습니다. `tests/moduleLayers.test.ts`가
 * 묶음 순서와 "묶음 안에서는 기계가 래퍼보다 먼저"를 지킵니다.
 *
 * 여기 적힌 **이름을 바꾸거나 지우는 것은 소비자 breaking**입니다(파일을 옮기는 것은
 * 공짜입니다 — 소비자는 배럴만 씁니다). `tests/publicApi.test.ts`가 목록을 못 박습니다.
 */

/* ── 컨트롤 ── */
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from "./controls/Button";
export { Select, type SelectOption, type SelectProps } from "./controls/Select";
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from "./controls/SegmentedControl";
export { AutoGrowTextarea, type AutoGrowTextareaProps } from "./controls/AutoGrowTextarea";
/* 🔴 기계(`WheelPicker`)는 **일부러 안 내보냅니다.** 래퍼 셋이 구간을 나눠 가지는 것이
 * 설계인데(§4), 기계를 직접 쓸 수 있으면 그 구분이 사라져 같은 일을 하는 방법이 둘이
 * 됩니다. 래퍼들과 그들이 공유하는 타입·기본 라벨만 내놓습니다 — 그래서 이 줄이
 * 래퍼들보다 **먼저** 옵니다(§15: 묶음 안에서는 기계가 래퍼보다 먼저). */
export { DEFAULT_WHEEL_LABELS, todayIn, type WheelLabels, type WheelPickerProps, type WheelUnit } from "./controls/WheelPicker";
export { DateWheelPicker, type DateWheelPickerProps } from "./controls/DateWheelPicker";
export { TimeWheelPicker, type TimeWheelPickerProps } from "./controls/TimeWheelPicker";
export { DurationWheelPicker, DEFAULT_DURATION_LABELS, type DurationWheelPickerProps } from "./controls/DurationWheelPicker";

/* ── 표면·레이아웃 ── 바깥에서 안쪽 순서입니다: 셸 → 사이드바 → 페이지 뼈대 → 탭 →
 * 셸 밖에 서는 표면(§7이 적어 둔 스택과 같은 방향). */
export { AppShell, type AppShellProps } from "./surfaces/AppShell";
export { Sidebar, MobileQuickBar, DEFAULT_SIDEBAR_LABELS, type SidebarProps, type SidebarNavItem, type SidebarNavSection, type SidebarFooter, type SidebarLabels, type MobileQuickBarItem } from "./surfaces/Sidebar";
export { PageHeader, SectionHeading, SummaryGrid, SummaryCard, PanelGrid, Panel, FieldGrid, DismissibleDetails, type GridJustify } from "./surfaces/PageChrome";
export { SectionTabs, MobilePageTabs, MobilePageTabsContext, useMobilePageTabs, PageTabsIcon, type MobilePageTabRegistration, type SectionTabsProps } from "./surfaces/SectionTabs";
export { Dialog, DialogHeading, DialogActions, type DialogProps } from "./surfaces/Dialog";

/* ── 테마 ── */
export { THEME_TOKEN_GROUPS, THEME_TOKENS, applyTokenOverrides, defaultTokenValue, normalizeColor, readThemeDefaults, readTokenOverrides, toRgbText, writeTokenOverrides, type ThemeName, type ThemeToken, type ThemeTokenGroup } from "./theme/tokens";
export { createThemePalette, type ThemePalette, type ThemeColorBackup, type ParsedThemeColors } from "./theme/palette";
export { ThemeColorEditor, type ThemeColorEditorProps } from "./theme/ThemeColorEditor";

/* ── 단축키 ── */
export { BARE_KEY_SCOPE_ATTR, KIT_RESERVED, SIDEBAR_TOGGLE_ID, findConflict, formatCombo, normalizeCombo, parseCombo, shouldTrigger, sidebarToggleAction, type Combo, type Conflict, type SidebarToggleActionOptions } from "./shortcuts/combo";
export { createShortcutStorage, type ShortcutStorage, type ShortcutBindings, type ShortcutBackup, type ParsedShortcutBindings } from "./shortcuts/storage";
export { ShortcutProvider, useShortcutRegistry, type ShortcutAction, type ShortcutProviderProps, type ShortcutRegistry } from "./shortcuts/ShortcutProvider";
export { ShortcutSettings, displayCombo, type ShortcutSettingsProps } from "./shortcuts/ShortcutSettings";

/* ── 킷 전역 설정 ── 앱이 설정 화면을 붙일 자리라 공개 API입니다(설계 스펙 §11). */
export { getHourFormat, getHourFormatServerSnapshot, setHourFormat, subscribeHourFormat, getWheelRowsPerSide, getWheelRowsPerSideServerSnapshot, setWheelRowsPerSide, subscribeWheelRowsPerSide, type HourFormat, type WheelRowsPerSide } from "./settings";

/* ── 브라우저 ── 브라우저가 주는 것(뷰포트·history·포인터·스크롤)을 다루는 훅과
 * 순수 계산. 컴포넌트가 아니라 앱이 직접 씁니다. */
export { PopupDepthContext, useBackToClose, useEscapeToClose } from "./browser/popupDismiss";
export { useScrollDirectionHidden } from "./browser/scrollDirection";
export { useVisualViewportBox, useVirtualKeyboard, useVirtualKeyboardOpen, type VisualViewportBox, type VirtualKeyboard } from "./browser/visualViewport";
export { dropdownViewportSpace, shouldOpenDropdownAbove, onViewportChange, captureScrollSnapshot, restoreFocusWithoutScroll, type ScrollSnapshot } from "./browser/positioning";
export { isPrimaryButton } from "./browser/pointerButton";

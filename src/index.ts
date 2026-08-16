/* 공개 API. CSS는 별도로 한 번 import 하세요:
 *
 *   import "design-system/css/index.css";
 *   import { Select, DateWheelPicker, Sidebar } from "design-system/src";
 */
export { Select, type SelectOption, type SelectProps } from "./Select";
/* 🔴 기계(`WheelPicker`)는 **일부러 안 내보냅니다.** 두 래퍼가 구간을 나눠 가지는 것이
 * 설계인데(§4), 기계를 직접 쓸 수 있으면 그 구분이 사라져 같은 일을 하는 방법이 둘이
 * 됩니다. 래퍼 둘과 그 둘이 공유하는 타입·기본 라벨만 내놓습니다. */
export { DateWheelPicker, type DateWheelPickerProps } from "./DateWheelPicker";
export { TimeWheelPicker, type TimeWheelPickerProps } from "./TimeWheelPicker";
export { DurationWheelPicker, DEFAULT_DURATION_LABELS, type DurationWheelPickerProps } from "./DurationWheelPicker";
export { DEFAULT_WHEEL_LABELS, todayIn, type WheelLabels, type WheelPickerProps, type WheelUnit } from "./WheelPicker";
export { SectionTabs, SectionHeading, MobilePageTabs, MobilePageTabsContext, useMobilePageTabs, PageTabsIcon, type MobilePageTabRegistration, type SectionTabsProps } from "./SectionTabs";
export { Sidebar, MobileQuickBar, DEFAULT_SIDEBAR_LABELS, type SidebarProps, type SidebarNavItem, type SidebarNavSection, type SidebarFooter, type SidebarLabels, type MobileQuickBarItem } from "./Sidebar";
export { AppShell, type AppShellProps } from "./AppShell";
export { Dialog, DialogHeading, DialogActions, type DialogProps } from "./Dialog";
export { ThemeColorEditor, type ThemeColorEditorProps } from "./ThemeColorEditor";
export { THEME_TOKEN_GROUPS, THEME_TOKENS, applyTokenOverrides, defaultTokenValue, normalizeColor, readThemeDefaults, readTokenOverrides, toRgbText, writeTokenOverrides, type ThemeName, type ThemeToken, type ThemeTokenGroup } from "./themeTokens";
export { createThemePalette, type ThemePalette, type ThemeColorBackup, type ParsedThemeColors } from "./themePalette";
export { AutoGrowTextarea, type AutoGrowTextareaProps } from "./AutoGrowTextarea";
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from "./SegmentedControl";
export { PageHeader, SummaryGrid, SummaryCard, PanelGrid, Panel, FieldGrid, DismissibleDetails, type GridJustify } from "./PageChrome";
export { PopupDepthContext, useBackToClose, useEscapeToClose, useScrollDirectionHidden, useVisualViewportBox, useVirtualKeyboard, useVirtualKeyboardOpen, type VisualViewportBox, type VirtualKeyboard } from "./hooks";
export { isPrimaryButton, dropdownViewportSpace, shouldOpenDropdownAbove, onViewportChange, captureScrollSnapshot, restoreFocusWithoutScroll, type ScrollSnapshot } from "./positioning";
export { ShortcutProvider, useShortcutRegistry, type ShortcutAction, type ShortcutProviderProps, type ShortcutRegistry } from "./ShortcutProvider";
export { ShortcutSettings, displayCombo, type ShortcutSettingsProps } from "./ShortcutSettings";
export { BARE_KEY_SCOPE_ATTR, KIT_RESERVED, SIDEBAR_TOGGLE_ID, findConflict, formatCombo, normalizeCombo, parseCombo, shouldTrigger, sidebarToggleAction, type Combo, type Conflict, type SidebarToggleActionOptions } from "./shortcuts";
export { createShortcutStorage, type ShortcutStorage, type ShortcutBindings, type ShortcutBackup, type ParsedShortcutBindings } from "./shortcutStorage";
/* 킷 전역 설정 — 앱이 설정 화면을 붙일 자리라 공개 API입니다(설계 스펙 §11). */
export { getHourFormat, getHourFormatServerSnapshot, setHourFormat, subscribeHourFormat, getWheelRowsPerSide, getWheelRowsPerSideServerSnapshot, setWheelRowsPerSide, subscribeWheelRowsPerSide, type HourFormat, type WheelRowsPerSide } from "./settings";

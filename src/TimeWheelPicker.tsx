/* 시각 쪽 구간을 맡는 **래퍼**입니다. `DateWheelPicker`와 같은 기계를 쓰고, 다른 것은
 * **기본 `fields`와 허용 구간 둘뿐**입니다(설계 스펙 §3.2·§4).
 *
 * 🔴 **기능이 새로 생기는 것이 아닙니다.** v0.8.0부터
 * `<DateWheelPicker fields={["hour","minute"]}>`로 이미 되던 일이고, 이 래퍼는 그것에
 * **정직한 이름**을 주는 것입니다 — 그리고 두 래퍼가 구간을 나눠 가지므로 같은 일을
 * 하는 방법이 둘로 갈리지 않습니다.
 *
 * 기본 `fields`가 `["hour","minute"]`인 것은 네이티브 `<input type="time">`이 초를
 * 기본으로 안 그리는 것과 같습니다 — 초가 필요하면 `["hour","minute","second"]`.
 */
import { WheelPicker, type WheelPickerProps } from "./WheelPicker";
import type { WheelUnit } from "./model/instant";

const TIME_FIELDS: WheelUnit[] = ["hour", "minute"];

/** 시각 쪽에서 시작하는가. 사다리의 뒤 셋 중 하나로 시작하면 이 래퍼의 것입니다. */
const TIME_SIDE: WheelUnit[] = ["hour", "minute", "second"];

export type TimeWheelPickerProps = Omit<WheelPickerProps, "fields"> & {
  /** 그릴 열. **기본은 시·분.** `["hour","minute","second"]`로 초까지, `["minute","second"]`
   *  처럼 더 아래에서 시작하는 구간도 됩니다 — **시작이 시각 쪽이면 이 래퍼의 것**입니다.
   *  날짜가 앞에 붙는 구간은 `DateWheelPicker`. */
  fields?: WheelUnit[];
};

export function TimeWheelPicker({ fields = TIME_FIELDS, ...rest }: TimeWheelPickerProps) {
  // 던지지 않고 개발 모드 경고만 — `DateWheelPicker`와 같은 이유입니다.
  /* ⚠️ `import.meta.env`를 **지역 캐스트로** 읽습니다. 저장소 tsc는 `tests/`의
   * vite/client 참조 덕에 늘 초록이지만 `tests`는 `files`에 없어, 배포되는 `src`만
   * 단독 컴파일하면 `Property env does not exist on type ImportMeta`로 거절됩니다.
   * 기계(`WheelPicker.tsx`)가 같은 이유로 같은 캐스트를 씁니다 — 거기 실측이 적혀
   * 있습니다. 전역 재선언도 vite/client 참조도 안 됩니다. */
  const importMetaEnv = (import.meta as { env?: { DEV?: boolean } }).env;
  if (importMetaEnv?.DEV && fields.length > 0 && !TIME_SIDE.includes(fields[0])) {
    console.warn(`[kkqq-ui-basic-kit] TimeWheelPicker는 시각 쪽에서 시작하는 구간을 그립니다 — fields[0]이 "${fields[0]}"입니다. 날짜가 앞에 붙는 구간은 DateWheelPicker를 쓰세요.`);
  }
  return <WheelPicker fields={fields} {...rest} />;
}

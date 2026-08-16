/* 날짜 쪽 구간을 맡는 **래퍼**입니다. 휠이 어떻게 도는지도, 값이 어떻게 생겼는지도
 * 모릅니다 — 그건 기계(`WheelPicker`)와 모델(`model/instant`)의 몫입니다(설계 스펙 §3.2).
 *
 * 래퍼가 아는 것은 둘뿐입니다: **자기 기본 `fields`**와 **자기가 허용하는 구간.**
 *
 * 🔴 **`TimeWheelPicker`와 구간을 나눠 갖습니다** — 이쪽은 날짜 쪽(`year`·`month`·`day`)
 * 에서 시작하는 구간, 저쪽은 시각 쪽에서 시작하는 구간입니다. 겹치는 조합이 없어서
 * **같은 일을 하는 방법이 둘 생기지 않습니다**(설계 스펙 §4). 기계를 직접 쓰면 그 구분이
 * 사라지므로 `WheelPicker`는 배럴에서 내보내지 않습니다.
 */
import { WheelPicker, type WheelPickerProps } from "./WheelPicker";
import { instantModel, type WheelUnit } from "./model/instant";


const DATE_FIELDS: WheelUnit[] = ["year", "month", "day"];

/** 날짜 쪽에서 시작하는가. 사다리의 앞 셋 중 하나로 시작하면 이 래퍼의 것입니다. */
const DATE_SIDE: WheelUnit[] = ["year", "month", "day"];

export type DateWheelPickerProps = Omit<WheelPickerProps, "fields" | "model"> & {
  /** 그릴 열. **기본은 연·월·일**이라 지금까지의 호출부는 글자 하나 안 바뀝니다.
   *  시각 단위를 뒤에 붙일 수 있습니다(`["year","month","day","hour","minute"]`) —
   *  **시작이 날짜 쪽이면 이 래퍼의 것**입니다. 시각만 필요하면 `TimeWheelPicker`. */
  fields?: WheelUnit[];
};

export function DateWheelPicker({ fields = DATE_FIELDS, ...rest }: DateWheelPickerProps) {
  // 던지지 않고 개발 모드 경고만 냅니다 — 기계의 fields 연속성 검사와 같은 이유입니다.
  /* ⚠️ `import.meta.env`를 **지역 캐스트로** 읽습니다. 저장소 tsc는 `tests/`의
   * vite/client 참조 덕에 늘 초록이지만 `tests`는 `files`에 없어, 배포되는 `src`만
   * 단독 컴파일하면 `Property env does not exist on type ImportMeta`로 거절됩니다.
   * 기계(`WheelPicker.tsx`)가 같은 이유로 같은 캐스트를 씁니다 — 거기 실측이 적혀
   * 있습니다. 전역 재선언도 vite/client 참조도 안 됩니다. */
  const importMetaEnv = (import.meta as { env?: { DEV?: boolean } }).env;
  if (importMetaEnv?.DEV && fields.length > 0 && !DATE_SIDE.includes(fields[0])) {
    console.warn(`[kkqq-ui-basic-kit] DateWheelPicker는 날짜 쪽에서 시작하는 구간을 그립니다 — fields[0]이 "${fields[0]}"입니다. 시각 쪽에서 시작하는 구간은 TimeWheelPicker를 쓰세요.`);
  }
  return <WheelPicker model={instantModel} fields={fields} {...rest} />;
}

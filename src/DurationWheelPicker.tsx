/* 기간(duration)을 고르는 래퍼. `DateWheelPicker`·`TimeWheelPicker`와 **같은 기계**를
 * 쓰고, 다른 것은 **모델**입니다 — 저 둘은 `instantModel`, 이쪽은 `durationModel`.
 *
 * 🔴 **구간을 나눠 갖는 방식이 저 둘과 다릅니다.** 시점 래퍼 둘은 사다리의 앞/뒤로
 * 갈라 겹치지 않게 했는데, 기간은 **값 도메인 자체가 달라서** 겹칠 일이 없습니다 —
 * 같은 `["hour","minute"]`이라도 `TimeWheelPicker`는 "오전 3시 30분"이고 이쪽은
 * "3시간 30분"입니다. 그래서 이 래퍼는 사다리 어디든 연속 구간이면 받습니다.
 *
 * 라벨도 갈립니다. 시점의 `units`는 **자리 이름**("연도"·"월")이고 기간의 것은
 * **세는 이름**("년"·"개월")입니다. 그리고 `오늘`/`지금` 버튼이 없으므로(모델의
 * `seedAction`이 `null`) `today`·`now`·`hintNow`는 안 쓰입니다.
 */
import { WheelPicker, DEFAULT_WHEEL_LABELS, type WheelPickerProps, type WheelLabels } from "./WheelPicker";
import { durationModel } from "./model/duration";
import type { WheelUnit } from "./model/instant";

const DURATION_FIELDS: WheelUnit[] = ["hour", "minute"];

/** 기간의 기본 라벨. 시점의 것에서 **세는 이름**과 안내 문구만 갈아 끼웁니다 — 나머지
 *  (`clear`·`done`·`previous`·`next`·`select`)는 뜻이 같아 그대로 씁니다.
 *
 *  ⚠️ `weekdays`와 `meridiem`은 기간이 **안 쓰는데도** 타입이 요구합니다. `WheelLabels`가
 *  아직 시점 쪽으로 기울어 있다는 뜻이고, 계약 정리의 다음 후보입니다. */
export const DEFAULT_DURATION_LABELS: WheelLabels = {
  ...DEFAULT_WHEEL_LABELS,
  placeholder: "기간 선택",
  hint: "휠·스와이프·방향키·숫자 입력 · 가운데 두 번 탭하면 0으로",
  units: { year: "년", month: "개월", day: "일", hour: "시간", minute: "분", second: "초" },
};

export type DurationWheelPickerProps = Omit<WheelPickerProps, "fields" | "model"> & {
  /** 그릴 열. **기본은 시·분**(`"01:30"` = 1시간 30분). 사다리(연·월·일·시·분·초)에서
   *  잘라낸 연속 구간이면 무엇이든 됩니다 — `["day","hour"]`처럼 가운데를 잘라도 되고,
   *  `["year","month"]`로 "2년 3개월"짜리 계약 기간도 됩니다.
   *
   *  🔴 **그리는 열 중 맨 위가 무제한입니다**(자리올림 없음). `["hour","minute"]`이면
   *  "90시간 30분"이 되고, `["day","hour","minute"]`이면 시가 0~23으로 순환합니다. */
  fields?: WheelUnit[];
};

export function DurationWheelPicker({ fields = DURATION_FIELDS, labels, ...rest }: DurationWheelPickerProps) {
  return <WheelPicker model={durationModel} fields={fields} labels={{ ...DEFAULT_DURATION_LABELS, ...labels }} {...rest} />;
}

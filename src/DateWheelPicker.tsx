/* 3열 휠 날짜 선택기 — 원본: frontend/src/components/DateWheelPicker.tsx
 * 필요한 CSS: tokens.css, surfaces.css, date-picker.css
 *
 * 네이티브 <input type="date">를 쓰지 않는 이유: 브라우저마다 캘린더 UI가 달라
 * 디자인을 통일할 수 없고, min/max 처리와 모바일 동작이 제각각이기 때문입니다.
 *
 * 핵심 규칙 — 연/월/일 컬럼은 서로 독립입니다:
 *   · 연도 컬럼은 연도만, 월은 그 해 안에서 1↔12 순환, 일은 그 달 안에서 1↔말일 순환
 *   · 연·월이 바뀌어 일이 유효하지 않게 되면 목적지 달의 말일로 잘라내기만 하고
 *     절대 다른 컬럼으로 자리올림하지 않습니다
 *   · 데스크톱 휠·화살표는 커서가 있는 컬럼만, 모바일 스와이프·키보드는 활성 컬럼만
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";
import { createPortal } from "react-dom";

import {
  DATE_WHEEL_FILL,
  instantModel,
  type DateWheelUnit,
  type WheelUnit,
} from "./model/instant";
import { useBackToClose, useEscapeToClose } from "./hooks";
import { dropdownViewportSpace, focusTriggerOnClick, isPrimaryButton, onViewportChange } from "./positioning";

/* `todayIn`은 `index.ts`가 내보내고, `DateWheelUnit`은 tests/DateWheelPicker.test.tsx가
 * 이 경로로 가져옵니다. 모델로 옮긴 뒤에도 그 경로를 그대로 유지합니다 — 이 단계는
 * 공개 표면을 하나도 바꾸지 않습니다. */
export { todayIn, type DateWheelUnit } from "./model/instant";

/** 기본은 연·월·일 3열. 상수로 둬서 기본값일 때 매 렌더 새 배열이 생기지 않게 합니다.
 *  타입은 `WheelUnit`(여섯 단위)까지 넓지만 기본값 자체는 그대로 3열입니다 — 시·분·초를
 *  실제로 그리는 것은 아직 이 컴포넌트가 못 합니다(2b-1은 타입만, 2b-3이 붙입니다). */
const DEFAULT_DATE_WHEEL_FIELDS: WheelUnit[] = ["year", "month", "day"];

export type DateWheelLabels = {
  /** 값이 비었을 때 트리거 문구 */
  placeholder: string;
  /** 팝오버 머리말의 조작 안내 */
  hint: string;
  today: string;
  clear: string;
  done: string;
  previous: string;
  next: string;
  /** 팝오버 자체의 접근성 이름에 붙는 접미사 */
  select: string;
  /** 일요일부터 7개 */
  weekdays: string[];
  /** 열의 aria-label 접두사. `year`·`month`·`day`는 늘 그려지므로 필수, `hour`·`minute`·
   *  `second`는 선택입니다 — 2b-1 시점에는 이 컴포넌트가 그 열들을 실제로 그리지 않으므로
   *  (2b-3에서 붙습니다) 필수로 만들면 아직 관련 없는 소비자(예: `labels` override에서
   *  `units`를 연·월·일만 주는 기존 소비자)가 깨집니다. */
  units: { year: string; month: string; day: string; hour?: string; minute?: string; second?: string };
};

export const DEFAULT_DATE_WHEEL_LABELS: DateWheelLabels = {
  placeholder: "날짜 선택",
  hint: "휠·스와이프·방향키·숫자 입력 · Ctrl+; 오늘",
  today: "오늘",
  clear: "비우기",
  done: "완료",
  previous: "이전",
  next: "다음",
  select: "선택",
  weekdays: ["일", "월", "화", "수", "목", "금", "토"],
  // hour·minute·second는 units 타입에서 선택입니다(2b-1, 타입만). 값은 여기서 채우지
  // 않습니다 — 열 라벨은 Task 3의 몫이고, 이 상수는 src/index.ts가 그대로 재-export하는
  // 공개 값이라 값 자체를 바꾸면 "동작 변화 0"과 어긋납니다. 지금은 기본 fields가
  // 연·월·일이라 이 세 키에 도달할 코드 경로가 없으므로 비워 둬도 화면엔 영향이 없습니다.
  units: { year: "연도", month: "월", day: "일" },
};

/** 양끝 ±3은 보이지 않지만 미리 그려두는 프리로드 행입니다. */
const DATE_WHEEL_OFFSETS = [-3, -2, -1, 0, 1, 2, 3];
/**
 * 열의 휠 이동 모션. **필드 셋이 서로 다른 것을 몰고 있고, 그게 요점입니다.**
 *
 * - `sequence` — 값 컨테이너의 `key`(`${unit}-${sequence}`)를 만듭니다. 바뀌면 행
 *   일곱 개가 **리마운트**되고, 그 리마운트가 슬라이드를 처음부터 재생시킵니다.
 *   뜻은 "값이 바뀌었으니 다시 재생하라"입니다. **커밋할 때만 올립니다.**
 * - `playing` — `moving-*` 클래스를 붙일지입니다. 뜻은 "재생할 슬라이드가 있다"이고,
 *   CSS는 이 클래스로 애니메이션을 **무장**합니다.
 * - `direction` — 어느 쪽 키프레임인지.
 *
 * ⚠️ **`playing`을 따로 두지 않고 `sequence`가 클래스까지 몰게 하면 안 됩니다.**
 * 한동안 className이 `sequence ? moving-${direction} : ""`였고, 그래서 무장을 해제하려면
 * `sequence`를 0으로 되돌려야 했는데 **그것도 key 변경이라 리마운트를 일으켰습니다.**
 * 결과: 스와이프 pointerdown이 행을 갈아치워, mousedown을 받은 노드가 mouseup 전에
 * 사라지고 브라우저가 `click`을 공통 조상으로 리타기팅해 **행 클릭이 죽었습니다**
 * (오너 리포트 "7일 때 9를 눌러도 안 바뀐다"; 무장된 열에서만이라 한 번 걸러 한 번씩).
 * 무장 해제는 클래스만 끄고 key는 그대로 두어야 합니다.
 */
/**
 * **탭과 스와이프를 가르는 유일한 수(px).** 이 거리 미만으로 움직였다 놓으면 탭이고
 * (커밋 없음 + 클릭 그대로 통과), 이상이면 스와이프입니다(놓을 때 한 칸 커밋 + 클릭 억제).
 *
 * **두 자리가 이 하나를 씁니다** — `moveSwipe`의 클릭 억제와 `finishSwipe`의 놓을 때 커밋.
 * 두 수가 갈라지면 그 사이가 **죽은 구간**이 됩니다: 커밋도 안 되는데 클릭은 막히는 거리라,
 * 손가락을 그만큼 움직인 사용자에게는 아무 일도 안 일어납니다.
 *
 * ⚠️ **여기를 작게 만들지 마세요.** 한동안 억제 쪽만 2px이었고, **마우스 클릭은 누르고 떼는
 * 사이에 2~3px, 터치 탭은 그보다 더 흔들리는 것이 정상**이라 실사용 클릭이 거의 다 걸렸습니다
 * (오너: "클릭해도 선택 안 되고 열만 활성화된다"; 실측 0px 선택됨 / 3px 안 됨 / 8px 안 됨).
 * 행은 휠 표면 그 자체라 `startsOnStepControl` 같은 대상 기반 예외를 쓸 수 없고, 거리로만
 * 가를 수 있습니다.
 *
 * 터치에서 18px이 충분히 관대한지는 **실기기에서 재야 합니다**(지금 값은 마우스 실측과
 * 놓을 때 커밋 임계값의 일치에서 나왔습니다).
 */
const SWIPE_SLOP = 18;

/**
 * 팝오버 진입 애니메이션이 **다 끝나는** 시각(ms) — 마지막 열의 시차까지 포함합니다
 * (280ms + 40ms x 2). 이 시각에 `entering`을 걷습니다.
 *
 * ⚠️ **이 수는 css/date-picker.css의 지속시간·시차와 같은 수입니다.** 두 파일에 흩어져
 * 있으므로 테스트가 CSS에서 유도해 이 값과 비교합니다 — 한쪽만 바꾸면 빨개집니다.
 * 짧으면 마지막 열이 멎기 전에 애니메이션이 잘리고, 길면 그 초과 구간에서 아래 함정에
 * 걸립니다.
 *
 * ⚠️ **걷는 것이 중요합니다.** 남겨 두면 스와이프 pointerdown이 `moving-*`을 떼는 순간
 * 값 컨테이너의 animation-name이 이동 → 진입으로 **바뀌면서 진입이 세션 도중에**
 * **재생됩니다.** 애니메이션 종료 이벤트로 걷지 않는 이유: `animationend`는 자식의
 * `date-wheel-selected-pop`에서도 버블해 올라오고, `prefers-reduced-motion`에서는
 * 애니메이션이 아예 안 돌아 **영영 안 옵니다.** 시간으로 걷으면 두 경우 다 성립합니다.
 */
const DATE_WHEEL_ENTER_TOTAL_MS = 360;

type DateWheelMotion = { sequence: number; direction: "next" | "previous"; playing: boolean };

export type DateWheelPickerProps = {
  /** 앱이 이 컴포넌트를 겨눌 때의 출구. **내보내는 컴포넌트는 전부 이걸 받습니다** —
   *  자주 쓰는 것만 prop으로 열고 나머지는 이걸로 겁니다(PageChrome.tsx의 GridJustify 옆 주석). */
  className?: string;

  /** YYYY-MM-DD, 또는 빈 문자열 */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  /** 표시할 열. 기본은 연·월·일 3열. `["year", "month"]`로 주면 연·월 픽커가 됩니다.
   *  빠진 열은 값에서 01로 정규화되고(월 없으면 월=01, 일 없으면 일=01),
   *  min/max 비교도 남은 최소 단위(연·월·일)로만 이뤄집니다. 값 형식은 늘 YYYY-MM-DD.
   *
   *  ⚠️ **타입은 `WheelUnit`(연·월·일·시·분·초)까지 받지만, 지금(2b-1) 이 컴포넌트가 실제로
   *  그리는 것은 여전히 연·월·일뿐입니다.** `"hour"` 등을 넘기면 컴파일은 통과해도 동작은
   *  정의돼 있지 않습니다 — 시·분·초를 실제로 받는 것은 2b-3의 몫입니다. */
  fields?: WheelUnit[];
  allowClear?: boolean;
  /** **필수입니다**(PRINCIPLES §11). 스크린리더 때문만이 아니라 **팝오버 머리말로 그대로
   *  그려지기 때문입니다** — 기본값을 두면 한 폼의 날짜 필드가 전부 같은 머리말을 답니다.
   *  트리거의 접근성 이름에서는 이 값 **뒤에 지금 보이는 값이 붙습니다**(§11). */
  ariaLabel: string;
  /** 팝오버 머리말에 **보이는** 글자. 기본은 `ariaLabel`입니다.
   *  292px 머리말에는 `"날짜"`가 맞고 접근성 이름으로는 `"거래 발생 날짜"`가 맞을 때
   *  둘을 갈라놓는 자리입니다. 접근성 이름은 이걸 넘겨도 `ariaLabel` 쪽을 씁니다. */
  heading?: ReactNode;
  id?: string;
  disabled?: boolean;
  /** 기본값은 한국어. 필요한 키만 덮어쓰면 됩니다. */
  labels?: Partial<DateWheelLabels>;
  /** "오늘"의 기준 시간대 */
  timeZone?: string;
  /** 모바일에서 하단 고정 바를 피하려고 비워둘 높이 */
  mobileBottomInset?: number;
};

export function DateWheelPicker({ value, onChange, min, max, fields = DEFAULT_DATE_WHEEL_FIELDS, allowClear = false, ariaLabel, heading, id, disabled = false, labels: labelOverrides, timeZone = "Asia/Seoul", mobileBottomInset = 78, className = "" }: DateWheelPickerProps) {
  const model = instantModel;
  const labels = { ...DEFAULT_DATE_WHEEL_LABELS, ...labelOverrides, units: { ...DEFAULT_DATE_WHEEL_LABELS.units, ...labelOverrides?.units } };
  const [open, setOpen] = useState(false);
  // 겹쳐 있으면 가장 안쪽만 닫힙니다 — 다이얼로그 안에서 열렸을 때 다이얼로그까지 닫으면 안 됩니다.
  // Escape는 이 파일 전체에서 "값을 바꾸지 않고 닫기"를 뜻합니다 — flushTyping을
  // 부르지 않고 버퍼만 버립니다. 다른 모든 떠나는 경로(Tab·화살표·**열림 상태의**
  // Enter·Space·완료·세그먼트 클릭·blur)와의 유일한 예외입니다. (닫힘 상태의 Enter는
  // 떠나는 경로가 아니라 **여는 키**입니다 — 버퍼를 들고 엽니다. 스펙 §3·§4.2.)
  /**
   * `Escape`는 **되돌리고** 닫습니다(스펙 §3, 오너 실기기 지시).
   *
   * "값을 바꾸지 않고 닫는다"는 오랫동안 거짓이었습니다 — 화살표 한 번, 휠 한 칸, 행 클릭
   * 하나마다 곧바로 `onChange`를 부르므로 `Escape` 시점엔 값이 이미 여러 번 바뀐 뒤이고,
   * 여기서 버리던 것은 **타이핑 버퍼뿐**이었습니다.
   *
   * ⚠️ **값이 그대로면 부르지 않습니다.** 안 바뀐 값을 다시 보내면 소비자의 dirty 판정이
   * 더러워집니다. 되돌림은 소비자가 이미 받은 중간값들의 **마지막을 정정하는** 한 번입니다.
   *
   * ⚠️ **뒤로가기·바깥 클릭은 여기 안 들어옵니다.** `Escape`는 "취소"가 분명하지만 그 둘은
   * "그만 본다"에 가깝고, 묶는 것은 별개 판단이라 스펙이 지금 동작(마지막 값 유지)을
   * 그대로 두라고 명시했습니다.
   */
  /**
   * 취소하며 닫습니다 — `Escape`와 뒤로가기가 **공유**합니다(스펙 §3의 표).
   *
   * 각자 구현하면 갈라집니다. 이 파일은 이미 값을 치렀습니다: `Enter`와 `완료`가 따로
   * 닫다가 한쪽이 `flushTyping`을 빠뜨려 치던 숫자를 버렸고, 그래서 `commitAndClose`로
   * 합쳤습니다.
   *
   * ⚠️ **이 함수는 `value`를 클로저에서 읽습니다. 렌더마다 다시 만들어지는 자리에서만**
   * **부르세요.** `useEscapeToClose`·`useBackToClose`는 둘 다 `closeRef.current = onClose`로
   * 매 렌더 갱신하므로 안전합니다. `[open]` deps를 가진 이펙트 안에서 부르면 그 클로저의
   * `value`는 **열린 순간의 값**이라 `openStartValueRef`와 언제나 같고, 되돌림이 조용히
   * 아무것도 안 합니다. (뮤테이션으로 실제로 확인했습니다 — 바깥 클릭 이펙트에 이 함수를
   * 꽂는 뮤테이션이 **0 red**였고, 등가라서가 아니라 그 클로저가 낡아서였습니다.)
   */
  function cancelAndClose() {
    setTyping(null);
    if (openStartValueRef.current !== value) onChange(openStartValueRef.current);
    setOpen(false);
  }
  useEscapeToClose(open, cancelAndClose);
  // 세로 앵커는 **둘 중 하나만** 씁니다 — 아래로 열면 `top`, 위로 뒤집으면 `bottom`.
  // 둘 다 넣으면 상자 높이가 그 둘로 고정되어 `maxHeight`가 무력해집니다. 왜 위쪽이
  // `bottom`이어야 하는지는 `placePicker`의 주석에 있습니다.
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  // 시·분·초 세 키는 아직 아무 열도 만들지 않지만(2b-3에서 붙습니다), Record<WheelUnit, …>가
  // 여섯 키를 다 요구하므로 초기값에 채워 둡니다 — 안 채우면 tsc가 거절합니다(2b-1).
  const [columnMotion, setColumnMotion] = useState<Record<WheelUnit, DateWheelMotion>>({
    year: { sequence: 0, direction: "next", playing: false },
    month: { sequence: 0, direction: "next", playing: false },
    day: { sequence: 0, direction: "next", playing: false },
    hour: { sequence: 0, direction: "next", playing: false },
    minute: { sequence: 0, direction: "next", playing: false },
    second: { sequence: 0, direction: "next", playing: false },
  });
  /**
   * 팝오버가 막 열렸는가. 열 셋이 함께 굴러 들어오는 진입 애니메이션의 **게이트**입니다
   * (css/date-picker.css의 `.date-wheel-column.entering .date-wheel-values`).
   *
   * `useLayoutEffect`인 이유는 **첫 페인트 전에** 클래스가 붙어야 하기 때문입니다.
   * `useEffect`로 붙이면 한 프레임은 제자리로 그려졌다가 다음 프레임에 시작 위치로
   * 튀어 올라간 뒤 굴러 내려옵니다 — 진입이 **역방향 튐**으로 보입니다.
   */
  const [entering, setEntering] = useState(false);
  useLayoutEffect(() => {
    if (!open) { setEntering(false); return; }
    // 열리는 바로 이 전이에서 `Escape`가 되돌아갈 값을 찍습니다. deps가 `[open]`이므로
    // 여기서 읽는 `value`는 **열린 순간의 값**이고, 그것이 정확히 필요한 것입니다.
    openStartValueRef.current = value;
    setEntering(true);
    const timer = window.setTimeout(() => setEntering(false), DATE_WHEEL_ENTER_TOTAL_MS);
    return () => window.clearTimeout(timer);
  }, [open]);
  const [activeUnit, setActiveUnit] = useState<DateWheelUnit>(fields[0] ?? "year");
  // activeUnit은 소비자가 런타임에 fields를 바꿀 수 있어(예: 일간/월간 토글) fields
  // 밖의 열을 계속 가리킬 수 있습니다. 그 원본 상태를 그대로 믿지 않고, 매 렌더
  // fields 안으로 클램프한 값을 씁니다 — 그렇지 않으면 키가 사라진 열에 가서 아무 일도
  // 일어나지 않고, 트리거와 팝오버 어느 쪽에도 활성 표시가 남지 않습니다.
  const resolvedActiveUnit = fields.includes(activeUnit) ? activeUnit : (fields[0] ?? "year");
  // 지금 치고 있는 열과 그 자릿수. 자릿수가 차면 model.typeDigit이 곧바로 확정하고 비웁니다.
  //
  // **덜 찬 채로 버퍼가 어떻게 되는지는 "무엇을 가리킨 조작인가"로 갈립니다**(설계 스펙
  // §4.2). 이 자리에 한동안 "포인터면 버린다"로 적혀 있었는데, **스펙이 그 범주를 명시적으로
  // 기각했습니다** — 드는 예가 전부 팝오버 안 항목이라 트리거 쪽 포인터 경로를 아예 상정하지
  // 않았기 때문입니다. 가르는 것은 입력 장치가 아닙니다:
  //   · **자리를 옮기는 조작 → 확정**: `←`·`→`·`Tab`·`Shift+Tab`, **열림 상태의**
  //     `Enter`·`Space`, `완료` 버튼, **트리거의 세그먼트 클릭**, 그리고 **트리거의 blur**.
  //   · **값을 직접 가리키는 조작 → 폐기**: 휠·스와이프·팝오버의 행 클릭·`오늘`·`비우기`.
  //   · **여는 조작 → 아무것도 안 함(버퍼를 들고 갑니다)**: **닫힘 상태의**
  //     `↓`·`↑`·`Enter`·`Space`, 그리고 세그먼트가 아닌 곳을 눌러 여는 트리거 클릭.
  //   · `Escape`(폐기)와 `Delete`(폐기 + 값 비우기)는 각자 자기 자리에 적혀 있습니다.
  // 그 밖의 이유로 팝오버가 닫히면(바깥 클릭·뒤로가기) 아래 "닫히면 버퍼를 버린다"
  // 이펙트가 안전망으로 비웁니다. **언마운트에서는 flush하지 않습니다** — 사라진 필드에
  // 대한 onChange가 되기 때문이고(§4.2), 코드가 아니라 **부재로** 지켜집니다.
  const [typing, setTyping] = useState<{ unit: DateWheelUnit; digits: string } | null>(null);
  /**
   * **지금 화면에 실제로 보이는 버퍼.** `resolvedActiveUnit`과 정확히 같은 이유의 클램프이고,
   * 없어서 결함이 났습니다: `activeUnit`에는 클램프가 있었는데 `typing.unit`에는 없었습니다.
   *
   * 소비자가 런타임에 `fields`를 줄이면(예: 일간/월간 토글) 버퍼가 **사라진 열에 남습니다.**
   * 어느 세그먼트에도 안 그려지는데 상태로는 살아 있어서, 리뷰가 잰 두 가지가 났습니다:
   *   · 닫힘 `Escape`의 `if (!typing)` 가드가 그 **보이지 않는** 버퍼 때문에 전파를 막아,
   *     `Dialog` 안에서 **첫 Escape가 안 먹고 두 번째에 닫혔습니다.** 가드가 물어야 할 것은
   *     "상태가 있는가"가 아니라 **"사용자가 취소할 것이 화면에 있는가"**입니다.
   *   · 값이 비어 있으면 placeholder 대신 `baseValue` 세그먼트가 그려져(`2026. 08.`),
   *     **값 없는 필드가 값을 가진 것처럼** 보이고 접근성 이름도 그렇게 읽혔습니다.
   *
   * **버퍼를 *읽는* 자리는 전부 이것을 씁니다.** 쓰는 자리(`setTyping`)와 `flushTyping`의
   * 청소는 원본 `typing`을 봅니다 — 보이지 않는 버퍼도 떠나는 경로에서 치워져야 하니까요.
   *
   * `fields`를 의존성으로 하는 이펙트로 지우지 **않습니다.** `fields`는 배열 prop이라
   * 소비자가 인라인 리터럴로 주면 **부모가 리렌더할 때마다** 새 신원이 되고, 그때 그 이펙트가
   * 다시 돌아 버퍼를 죽입니다. 파생값이 이 컴포넌트가 이미 쓰는 패턴입니다.
   *
   * ⚠️ 여기 한동안 "**매 렌더** 돌아 버퍼가 **한 글자도** 살아남지 못한다"고 적혀 있었는데
   * **과장이었습니다 — 리뷰가 쟀습니다.** 확정 없는 타이핑은 `onChange`를 부르지 않아 부모를
   * 리렌더시키지 않으므로, 숫자를 둘 쳐도 그 이펙트는 **0회** 다시 돕니다. 위험 자체는
   * 진짜이고(부모가 다른 state를 들고 있으면 그 리렌더 한 번에 버퍼가 죽습니다) 결론도 그대로
   * 옳습니다 — **근거의 크기만 틀렸습니다.** 이 저장소는 성립하지 않는 근거를 남기면 나머지
   * 근거까지 못 믿게 된다는 기준을 쓰므로 고칩니다.
   */
  const resolvedTyping = typing && fields.includes(typing.unit) ? typing : null;
  // 완료 피드백(css/surfaces.css .dropdown-value-commit) 커밋 카운터 — commitAndClose에서만,
  // 그것도 확정된 값이 **이 세션이 시작될 때의 값**(sessionStartValueRef, 아래)과 실제로
  // 다를 때만 올립니다. 0에서 시작해 첫 마운트는 애니메이션이 돌지 않고, 화살표·휠·
  // 타이핑 자체(자릿수가 차서 즉시 확정되는 경우 포함)·오늘·비우기 같은 다른 값 변경
  // 경로는 건드리지 않습니다 — 그 경로들은 "완료"가 아니라 매 조작마다 반짝이면 신호가
  // 아니라 소음이 됩니다. 계약은 PRINCIPLES.md §12.
  /**
   * **편집 중인가.** 활성 세그먼트 표시의 게이트입니다(스펙 §4.5).
   *
   * 한동안 표시는 **포커스**에만 걸려 있었는데, §6.2가 "이 컨트롤이 키보드를 받는 동안
   * 포커스는 언제나 트리거"라고 정해 두었으므로 `완료`로 확정해 닫아도 포커스가 남아
   * **표시가 살아남았습니다**(오너: "완료 누르면 날짜에 선택돼 있는 것도 같이 안 보이게").
   * 확정한 뒤의 컨트롤은 **쉬는 중**이지 입력을 받는 중이 아닙니다.
   *
   * **시작** — 세그먼트를 겨냥한 조작: 숫자·`Backspace`·`←`/`→`·`↑`/`↓`, 세그먼트 클릭,
   * 팝오버 열기. **끝** — 확정하며 닫기(`Enter`·`완료`), `Escape`, 포커스 상실.
   *
   * ⚠️ **포커스 게이트는 그대로 둡니다.** 편집 중은 포커스가 있어야 시작되지만, 둘을 다
   * 걸어 두면 어느 하나가 새도 표시가 안 남습니다. CSS 규칙은 여전히 **하나**이고
   * 조건이 하나 붙었을 뿐이라 "세그먼트에 매칭되는 규칙은 정확히 하나" 계약은 그대로입니다.
   */
  /**
   * 이번 열림에서 **아래 자리를 이미 요청했는가.** `placePicker`는 scroll·resize마다 다시
   * 도는데, 요청은 **열림당 한 번**이어야 합니다 — 매 프레임 다시 밀면 스크롤이 제 꼬리를
   * 물고, 사용자가 그 사이 스크롤을 되돌려도 컨트롤이 다시 뺏습니다.
   */
  /**
   * **팝오버가 열린 순간의 값.** `Escape`가 되돌아갈 곳입니다(스펙 §3).
   *
   * ⚠️ **`sessionStartValueRef`와 다른 것이고, 합치면 안 됩니다.** 그쪽은 **포커스**를
   * 얻은 순간과 닫히는 순간에 찍혀 §12의 확정 신호("이번 세션에 값이 실제로 바뀌었는가")를
   * 판정합니다. 이쪽은 **열린 순간**에만 찍힙니다.
   *
   * 둘이 갈리는 경로가 실제로 있습니다: 닫힌 채로 숫자를 쳐서 값을 바꾼 뒤(§3) 팝오버를
   * 열고 `Escape`를 누르면, 되돌아갈 곳은 **열기 직전**(친 값)이지 포커스를 얻었을 때가
   * 아닙니다. 하나로 합치는 순간 §12의 신호나 `Escape`의 되돌림 중 하나가 조용히 틀어집니다.
   */
  const openStartValueRef = useRef(value);
  const roomRequestedRef = useRef(false);
  /**
   * 팝오버가 열려 있는 동안 스크롤 호스트에 **늘려 둔 자리**(있으면). 닫을 때 되돌립니다.
   * 안 되돌리면 페이지가 영영 길어집니다. **스크롤 위치는 되돌리지 않습니다**(§7.0 Agency) —
   * 되돌리는 것은 **예약뿐**입니다.
   */
  const reservedRoomRef = useRef<{ host: HTMLElement; previous: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [commitPulse, setCommitPulse] = useState(0);
  // 이번 세션에 비우기·Delete로 값을 지운 적이 있는가. commitAndClose의
  // "비어 있으면 baseValue로 채운다" 되살림 분기(아래)를 막는 유일한 용도입니다 — 이게
  // 없으면 "값 없이 처음 연 픽커"와 "방금 막 지운 픽커"를 구분할 수 없어, 완료가 방금
  // 지운 값을 도로 살려냅니다(오너가 실측으로 재현: 오늘 → 비우기 → 완료).
  //
  // 리셋 시점은 sessionStartValueRef와 똑같습니다 — 트리거 focusin과 팝오버 닫힘,
  // **여는 순간에는 절대 리셋하지 않습니다**(설계 스펙 §6.4). 예전에는 여는 순간
  // 리셋했고, 그래서 닫힌 채 Delete로 지운 기억이 ↓로 여는 순간 지워져 완료가 방금
  // 지운 값을 오늘로 되살렸습니다(측정된 결함 — tests의 "세션 수명" 블록이 재현합니다).
  // 지우지 않고 닫았다가 다시 열어 아무것도 안 건드리고 완료를 누르면 원래 의도(휠에
  // 보이는 날짜를 확정)대로 동작해야 하므로, 닫힘에서의 리셋은 그대로 필요합니다.
  const clearedRef = useRef(false);
  // 이 세션이 시작될 때 value가 무엇이었는지 — 세션의 시작은 트리거가 포커스를 얻은
  // 순간과 팝오버가 닫힌 순간입니다(§6.4). commitAndClose의 펄스 조건은 이 값과
  // 비교합니다(커밋 시점의 value가 아니라) — 이 컨트롤은 화살표 한 번, 휠 한 칸마다도
  // onChange를 불러 value를 바로 바꿉니다. 그래서 "커밋 시점 값 vs 그 순간 value"로
  // 비교하면, 화살표로 옮긴 뒤 완료를 눌러도 그 사이 value가 이미 옮겨진 값으로
  // 갱신돼 있어 "안 바뀌었다"고 잘못 읽습니다(오너가 실측: 화살표 → 완료인데 신호가
  // 전혀 안 뜸). 세션이 시작될 때의 값과 비교해야 "세션이 시작된 뒤로 실제로 뭔가
  // 바뀌었는가"를 제대로 묻는 것이 됩니다. Select는 방향키가 onChange를 부르지 않고
  // 고를 때 한 번만 커밋하므로 이 차이가 안 나고, 세션의 시작도 트리거 포커스와 메뉴
  // 열림이 사실상 같은 순간이라 "열린 순간"으로 둡니다 — 두 컨트롤이 여기서만 갈리는
  // 이유는 닫힌 채로도 값이 바뀔 수 있는 쪽이 날짜 피커뿐이기 때문입니다(§6.4).
  const sessionStartValueRef = useRef(value);
  // 이 닫힘에서 commitAndClose가 **실제로 확정한** 값. 아래 닫힘 이펙트가 기준값을 찍을 때
  // `value` prop보다 이것을 먼저 씁니다.
  //
  // 왜 필요한가: `commitAndClose`의 `onChange`는 `setOpen(false)`와 같은 배치에 들어갑니다.
  // 부모가 그 값을 **한 렌더 늦게** 반영하면(리덕스·폼 라이브러리처럼 상태가 컴포넌트
  // 바깥에 있는 소비자) 이펙트가 도는 렌더의 `value`는 아직 확정 **전** 값이라, 기준값이
  // 옛 값으로 찍히고 다음 완료가 "안 바꿨는데" 확정 신호를 냅니다. tests의 "지연 반영
  // 부모" 블록이 그 시퀀스를 재현합니다.
  //
  // 확정하지 않는 닫힘 경로(바깥 클릭·뒤로가기·Escape)는 이것을 채우지 않으므로 그대로
  // `value`로 찍힙니다.
  //
  // ⚠️ **그 경로들이 "값을 안 바꿨으니 안전하다"는 뜻이 아닙니다** — 확정(commit)을 안 했을
  // 뿐 값은 얼마든지 바뀝니다. `↑`/`↓`·휠·스와이프·± 버튼·`오늘`·`비우기`가 전부
  // `commitAndClose` **밖에서** `onChange`를 부릅니다. 그러므로 지연 반영 부모에서
  // "`↓`로 값 변경 → 바깥 클릭으로 닫기"를 하면 저 경로에서도 기준값이 변경 **전** 값으로
  // 찍힐 수 있습니다. **이것은 기존 결함이고 Task 4의 회귀가 아닙니다** — 그 경로에는
  // 예전에도 rAF 안전망이 없었습니다. 여기서 고치지 않는 이유는 `commitAndClose`처럼
  // "이번 닫힘이 확정한 값"이라고 부를 것이 그 경로에는 없기 때문입니다. 고치려면 기준값을
  // 언제 찍을지를 다시 정해야 하므로 별건입니다.
  const committedOnCloseRef = useRef<string | null>(null);
  // 트리거의 aria-controls가 가리킬 팝오버 id — Select.tsx의 menuId와 같은 이유이고, 이
  // 컨트롤에서는 더 중요합니다. 팝오버는 body 끝 포털이라 트리거와의 포함 관계가 없고,
  // **설계 스펙 §6.2 이후로는 포커스가 그 안에 들어가는 일도 영영 없습니다.** 포커스가
  // 따라 들어가 주던 시절에는 보조기술이 그 경로로 팝오버를 찾을 수 있었지만 이제 그
  // 채널이 없으므로, 이 id가 "무엇이 확장됐는가"에 답하는 **유일한** 연결입니다.
  const popoverId = `${useId()}-popover`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ unit: DateWheelUnit; y: number; pointerId: number; value: string; captured: boolean } | null>(null);
  const suppressColumnClickRef = useRef(false);

  // **뒤로가기도 취소입니다**(스펙 §3의 표, 오너 답). 폰에는 `Escape`가 없고 이 킷은 이미
  // 뒤로가기를 "가장 안쪽 오버레이를 닫는 키"로 씁니다 — 취소하려는 사람이 폰에서 누를 수
  // 있는 것이 그것뿐이라 **뒤로가기가 모바일의 `Escape`**입니다. 다르게 두면 같은 의도가
  // 기기에 따라 다른 결과를 냅니다.
  //
  // ⚠️ **바깥 클릭은 여기 안 들어옵니다** — "취소"가 아니라 "그만 본다"이고, 다른 걸 누르러
  // 간 사람에게서 방금 고른 값을 뺏으면 되돌리기가 없는 이 컨트롤에서 복구할 방법이 없습니다.
  useBackToClose(open, cancelAndClose);

  // 세션 기준값을 찍는 두 지점 중 하나 — **팝오버가 닫힐 때**입니다(다른 하나는
  // 트리거의 onFocus). 설계 스펙 §6.4의 계약: 기준값은 이 컨트롤이 마지막으로
  // "조용해진" 순간에 찍고, **여는 순간에는 절대 찍지 않습니다.**
  //
  // 예전에는 `if (open)`이었습니다. 닫힌 상태가 조작 가능해지면(Delete·Ctrl+;는 이미
  // 그렇습니다) 그 수명이 틀립니다 — 닫힌 채 지운 기억과 닫힌 채 바뀐 값이 여는 순간
  // 통째로 지워집니다. 그 결함은 재현했고 테스트로 고정돼 있습니다("세션 수명" 블록).
  //
  // **닫힘 리셋이 commitAndClose보다 뒤에 와야 합니다.** commitAndClose가 clearedRef를
  // 읽은 뒤에 지워져야 하는데, 이펙트는 상태 갱신이 커밋된 뒤에 돌므로 자연히 그렇게
  // 됩니다. commitAndClose 안에서 직접 리셋하면 읽기 전에 지워질 수 있습니다.
  //
  // 마운트에서도 한 번 돕니다(open이 false이므로). 그래도 되는 정도가 아니라 그게
  // 맞습니다 — 마운트 직후는 아직 아무 조작도 없었으므로 그 순간의 value가 곧 기준값입니다.
  //
  // **focusout에는 아무것도 하지 않습니다.** focusout은 "컨트롤을 떠났다"와 "컨트롤 안에서
  // 옮겼다"를 구분하지 못하는 이벤트입니다. 찍기만 하고 버리지 않으면 두 상태 모두에서
  // 옳습니다(§6.4).
  //
  // 의존성 배열에 value를 일부러 넣지 않습니다. 넣으면 **닫혀 있는 동안** value가 바뀔
  // 때마다 이 이펙트가 다시 돌고, Delete가 그 자리에서 clearedRef를 도로 false로 지워
  // 위 결함이 그대로 돌아옵니다. 측정했습니다 — `[open, value]`로 바꾸면 "닫힌 채
  // Delete" 테스트가 빨개집니다.
  //
  // **열려 있는 동안은 걱정할 것이 없습니다.** 가드가 `if (open) return;`이라 이펙트가
  // 곧바로 빠져나가므로 세션 도중에 기준값이 덮어써질 수 없습니다. 이 자리에 한동안
  // "열려 있는 동안 화살표로 옮긴 뒤 완료해도 안 바뀌었다고 읽힌다"가 적혀 있었는데,
  // 그건 본문이 `if (open) { … }`이던 시절의 논거이고 가드를 뒤집은 순간 성립할 수 없게
  // 됐습니다(측정: `[open, value]`에서도 화살표→완료 신호는 그대로 뜹니다). 성립할 수
  // 없는 실패 모드를 근거로 남겨 두면 다음 사람이 반증하고 근거 전체를 못 믿게 되므로
  // 지웠습니다.
  useEffect(() => {
    if (open) return;
    // **팝오버가 닫히는 것 자체가 편집의 끝입니다**(스펙 §4.5). 경로를 세지 않습니다 —
    // 한동안 `Enter`·`완료`·`Escape`·blur로 **열거**하고 있었고 뒤로가기가 빠졌습니다
    // (오너 실기기: "뒤로가기로 닫으면 활성 세그먼트가 안 없어진다"). 바깥 클릭도 같은
    // 구멍이었습니다. 닫는 경로는 이미 여섯이고 앞으로도 늘어나므로, 세는 방식은 셀
    // 때마다 하나씩 빠집니다.
    //
    // ⚠️ **"닫혀 있다"가 아니라 "닫히는 순간"입니다.** 이 이펙트는 `open`이 바뀔 때만
    // 돌므로, 닫힌 채 숫자를 쳐서 편집이 다시 시작되는 경로(§3)를 건드리지 않습니다.
    setEditing(false);
    clearedRef.current = false;
    sessionStartValueRef.current = committedOnCloseRef.current ?? value;
    committedOnCloseRef.current = null;
    // **이동 신호도 여기서 끕니다.** `markColumnMotion`은 `playing`을 켜기만 하고, 끄는
    // 것은 스와이프 시작(`clearColumnMotion`)뿐이었습니다. 그래서 ±로 한 칸 옮긴 열은
    // 그 클래스를 **세션 내내** 달고 있었고, 팝오버는 닫힐 때 언마운트되므로 **다시 열 때
    // 새 노드에서 슬라이드가 처음부터 재생**됐습니다 — 아무것도 안 움직인 열림에서
    // "값이 움직였다"가 재생된 것입니다. 오너가 그것을 기능으로 보고 "다른 픽커에도
    // 적용해 달라"고 했는데(진짜 진입 애니메이션은 css/date-picker.css의
    // `date-wheel-enter`가 따로 맡습니다), 신호로서는 거짓말이었습니다.
    //
    // `sequence`는 건드리지 않습니다 — 그것은 값 컨테이너의 key이고, 여기서 0으로
    // 되돌리면 R1에서 고친 리마운트 결함이 그대로 돌아옵니다.
    // 여섯 키 다 꺼야 Record<WheelUnit, …>를 채웁니다 — hour·minute·second는 아직 아무
    // 열도 안 켜므로(playing이 될 일이 없음) 사실상 no-op이지만, 타입은 완전한 객체를
    // 요구합니다(2b-1).
    setColumnMotion((current) => (Object.values(current).some((motion) => motion.playing)
      ? {
          year: { ...current.year, playing: false }, month: { ...current.month, playing: false }, day: { ...current.day, playing: false },
          hour: { ...current.hour, playing: false }, minute: { ...current.minute, playing: false }, second: { ...current.second, playing: false },
        }
      : current));
  }, [open]);

  // 팝오버가 닫히면 버퍼를 버립니다. 닫힘은 "세그먼트를 떠난다"의 상위 집합이라, 확정하지
  // 않는 닫힘 경로(바깥 클릭·뒤로가기)가 남긴 버퍼를 여기서 비웁니다 — 다음에 열었을 때
  // 지난 버퍼가 되살아나지 않게. `typing`이 이미 null이면 React가 같은 값의 setState를
  // 걸러내므로(bail-out) 무한 렌더로 이어지지 않습니다.
  //
  // **useLayoutEffect인 이유:** 트리거가 버퍼를 그립니다(§4.5 — 값이 비어도 버퍼가 있으면
  // placeholder 대신 baseValue 세그먼트를 그립니다). 페인트 뒤에 비우면 닫힌 프레임에
  // 지난 버퍼가 한 번 스쳐 보입니다.
  useLayoutEffect(() => { if (!open) setTyping(null); }, [open]);

  /**
   * **`disabled`가 켜지면 팝오버를 닫습니다**(설계 스펙 §7.1).
   *
   * 이 자리가 없던 동안 팝오버는 `disabled`를 전혀 보지 않았고, 그 하나에서 증상이 둘
   * 났습니다. **반쪽 잠금** — 키는 `handleFieldKey`의 첫 가드에 막히는데 **휠·스와이프·±
   * 버튼은 여전히 값을 바꿨습니다**(직접 쟀습니다: 셋 다 `onChange("2027-07-12")`).
   * 그리고 **키보드 막다른 골목** — 브라우저가 비활성이 된 트리거를 blur하는데 팝오버는
   * 열린 채라, 포커스가 `body`로 떨어지고 팝오버 안에는 tab 정거장이 없어(§5) 키보드로
   * 다시 닿을 방법이 없습니다.
   *
   * **포인터 경로를 하나씩 막는 안은 스펙이 이유와 함께 기각했습니다** — 막을 자리가 넷
   * 이상이고, 무엇보다 잠긴 필드 위에 조작 가능해 보이는 팝오버가 떠 있는 것 자체가
   * 거짓말입니다. 여기서 한 번 끊으면 열도 ± 버튼도 값 행도 애초에 존재하지 않습니다.
   *
   * **렌더 조건에 `!disabled`를 얹는 것으로는 부족합니다.** `open`이 true로 남아
   * ① 트리거가 `aria-expanded="true"`로 없는 다이얼로그를 가리키고, ② `[open]`에 묶인
   * 위 버퍼 이펙트가 안 돌아 **치던 버퍼가 살아남습니다** — §7.1이 명시적으로 버리라고 한
   * 그 버퍼입니다. `open`을 실제로 내려야 둘 다 따라옵니다. (두 단언 모두 테스트로
   * 고정돼 있고, "이펙트 대신 렌더 가드" 뮤테이션으로 빨개지는 것을 확인했습니다.)
   *
   * **닫으면서 확정하지 않습니다.** 비활성화는 소비자의 조작이지 사용자의 완료가 아니므로
   * (§12의 "완료"가 아닙니다) `flushTyping()`을 부르지 않고, 버퍼는 위 `[open]` 이펙트가
   * §4.2의 "확정하지 않는 닫힘"으로 버립니다.
   *
   * **의존성이 `[disabled]`뿐인 것은 `handleFieldKey`의 `if (disabled) return`에
   * 기댑니다** — 비활성인 동안 `open`을 다시 true로 만들 수 있는 경로가 그 가드 뒤의
   * `↓`·`↑`·`Enter`·`Space`뿐이고, 트리거의 `onClick`은 버튼이 `disabled`라 도달하지
   * 않기 때문입니다. 추측이 아니라 뮤테이션으로 쟀습니다: 그 가드를 지우면 `↓`가
   * `setOpen(true)`를 부르고 이 이펙트는 다시 안 돌아 **팝오버가 되살아납니다**
   * (tests의 "비활성인 동안 ↓는 팝오버를 다시 열지 못한다"가 빨개집니다).
   *
   * `useEffect`가 아니라 `useLayoutEffect`인 이유는 위 버퍼 이펙트와 같습니다 — 페인트
   * 뒤에 닫으면 잠긴 필드 위에 조작 가능해 보이는 팝오버가 한 프레임 스쳐 보입니다.
   */
  useLayoutEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  // 남은 최소 단위로만 비교합니다(연·월 픽커면 "월" 단위). 함수 선언이라 baseValue보다
  // 아래에 있어도 호출 시점엔 keyLen이 이미 초기화돼 있습니다.
  const keyLen = model.keyLength(fields);
  function rangeKey(v: string) { return v.slice(0, keyLen); }
  function outOfRange(v: string) { return (!!min && rangeKey(v) < rangeKey(min)) || (!!max && rangeKey(v) > rangeKey(max)); }
  function clampToRange(v: string) {
    const normalized = model.normalize(v, fields);
    if (min && rangeKey(normalized) < rangeKey(min)) return model.normalize(min, fields);
    if (max && rangeKey(normalized) > rangeKey(max)) return model.normalize(max, fields);
    return normalized;
  }
  const baseValue = clampToRange(model.isValid(value) ? value : model.now(timeZone));

  // 트리거가 그릴 조각들. null이면 placeholder를 그린다는 뜻입니다.
  //
  // **값이 비어 있어도 버퍼가 있으면 placeholder를 버리고 baseValue 세그먼트를 그립니다**
  // (설계 스펙 §4.5). 팝오버의 휠은 빈 값일 때 이미 baseValue를 그리고 있으므로, 화면 두
  // 곳이 같은 순간에 서로 다른 것을 말하지 않게 하는 것입니다.
  //
  // 값이 유효하지 않은데(빈 값·깨진 값) 버퍼도 없으면 예전 formatDateTrigger와 똑같이
  // placeholder입니다 — 판정도 그때와 같은 validDateValue(model.isValid)입니다.
  const hasDateValue = model.isValid(value);
  const triggerParts = hasDateValue || resolvedTyping ? model.triggerParts(hasDateValue ? value : baseValue, fields, resolvedTyping) : null;

  /**
   * 트리거의 접근성 이름 — **레이블 뒤에 지금 화면에 보이는 값을 잇습니다**
   * (설계 스펙 §8): `"거래 날짜, 2026. 07. 12."`, 값이 없으면 `"거래 날짜, 날짜 선택"`.
   *
   * **왜 필요한가:** 포커스가 트리거에 머무르게 되면서(§6.2) 값을 읽히게 할 자리가 여기밖에
   * 남지 않았습니다. 초판 모델에서는 포커스가 옮겨간 열이 `aria-label="연도 2026"`으로 값을
   * 실어 날랐는데, 그 열에 이제 포커스가 가지 않습니다. `ariaLabel`만 이름으로 쓰면 값이
   * 바뀌어도 **읽히는 것이 하나도 없습니다.**
   *
   * PRINCIPLES §11의 "`ariaLabel`은 필수"와 충돌하지 않습니다 — 없애는 것이 아니라 뒤에
   * 값을 잇는 것입니다.
   *
   * ⚠️ **이것이 읽히게 하는 것은 "값"이지 "활성 세그먼트"가 아닙니다.** 지금 어느 세그먼트를
   * 치고 있는지는 여전히 안 읽힙니다 — §8의 `aria-activedescendant` 조항은 그대로 살아 있는
   * 구멍입니다. 이걸로 그 구멍이 메워졌다고 적지 마세요.
   *
   * 이름은 화면과 **같은 조각(`triggerParts`)에서** 만듭니다. 그래서 둘이 갈라질 수 없고,
   * 그것이 이 방식을 고른 이유입니다 — 이름만 `value`를 읽게 만들면 버퍼를 치는 동안 곧바로
   * 갈립니다.
   *
   * ⚠️ **채움 문자(`DATE_WHEEL_FILL`, U+2012)만은 이름에서 뺍니다 — 설계 스펙 §8.**
   * 그 문자를 고른 이유는 위 상수 주석에 있고 **오직 어드밴스 폭 하나**입니다. 눈으로
   * 보라고 넣은 자리 표시가 귀로도 읽혀야 할 이유가 없고, **빈 자리마다 반복되므로** 네
   * 자리 연도를 치는 동안 이름이 정보 없이 길어졌다 짧아집니다(`2‒‒‒` → `20‒‒` → `203‒`).
   * 빼면 `"거래 날짜, 20. 07. 12."`입니다.
   *
   * **"화면과 갈라질 수 없다"는 원칙은 그대로입니다** — 같은 출처에서 만들고 **할 말이 없는
   * 문자 하나만** 빼는 것이지 다른 것을 말하는 게 아닙니다. 실제로 스크린리더가 U+2012를
   * 어떻게 발음하는지(무시/`dash`/`figure dash` — 구두점 읽기 수준 설정에 따라 갈립니다)는
   * 실기기 항목이고, **그 답과 무관하게 뺍니다.**
   *
   * `split`/`join`을 씁니다 — `replaceAll`은 `lib`가 ES2021 이상이어야 하고, 이 한 줄 때문에
   * 타입 타깃을 올릴 이유가 없습니다.
   */
  const triggerValueText = triggerParts ? triggerParts.map((part) => part.text).join("").split(DATE_WHEEL_FILL).join("") : labels.placeholder;
  const triggerName = `${ariaLabel}, ${triggerValueText}`;

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!isPrimaryButton(event)) return;   // 마우스 뒤로/앞으로 버튼은 닫기가 아닙니다
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside, true);
    return () => { document.removeEventListener("pointerdown", closeOutside, true); };
  }, [open]);

  /**
   * 모바일에서 아래로 열 자리를 만듭니다(스펙 §7.0). **팝오버가 마운트된 뒤에** 돕니다 —
   * 그래야 필요한 높이를 상수로 짐작하지 않고 **실제로 잰 값**으로 정할 수 있습니다.
   *
   * ⚠️ **`below`를 클램프한 값으로 부족분을 계산하면 안 됩니다.** `dropdownViewportSpace`는
   * `below`를 `Math.max(0, …)`로 자르는데, 트리거가 하단 바 자리보다 **아래**에 있으면 진짜
   * 아래 공간은 음수이고 그 음수만큼이 부족분에 더해져야 합니다. 잘린 0을 쓰면 딱 그만큼
   * 덜 움직입니다 — 실측: trueBelow −78.5인데 0으로 읽어 324를 요청했고(옳은 값 402.5),
   * 적용 뒤에도 68px이 잘린 채 남아 `오늘`·`완료`가 잘렸습니다(오너 리포트).
   *
   * ⚠️ **필요한 높이는 상수가 아니라 잰 값입니다.** `desiredHeight`는 **바닥**으로만 씁니다 —
   * 내용 높이는 소비자가 주는 라벨·힌트 텍스트에 따라 달라집니다(데모 308, 오너 앱 321).
   * 팝오버는 잘린 채로도 `scrollHeight`로 제 내용 높이를 알려줍니다.
   *
   * 열림당 한 번입니다. 매번 다시 밀면 스크롤이 제 꼬리를 물고, 사용자가 그 사이 되돌려도
   * 컨트롤이 다시 뺏습니다.
   */
  useLayoutEffect(() => {
    if (!open || !position || roomRequestedRef.current) return;
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;
    roomRequestedRef.current = true;
    if (window.innerWidth > 760) return;   // 데스크톱은 그대로 — 뒤집기가 맡습니다
    const rect = trigger.getBoundingClientRect();
    const viewportTop = window.visualViewport?.offsetTop ?? 0;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const trueBelow = viewportTop + viewportHeight - mobileBottomInset - rect.bottom;
    const needed = Math.max(318, popover.scrollHeight) + 6;
    // **필드를 화면 위로 밀어내지 않습니다.** 위로 갈 수 있는 여유는 트리거 위 여백까지입니다.
    const shift = Math.min(needed - trueBelow, Math.max(0, rect.top - 8));
    if (shift > 0) scrollRoomBy(shift);
  }, [open, position, mobileBottomInset]);

  // 컬럼 위에서 휠을 굴릴 때 뒤 페이지가 같이 스크롤되지 않게 막습니다.
  useEffect(() => {
    const popover = popoverRef.current;
    if (!open || !position || !popover) return;
    function preventPageWheel(event: WheelEvent) {
      if (event.target instanceof Element && event.target.closest(".date-wheel-column")) event.preventDefault();
    }
    popover.addEventListener("wheel", preventPageWheel, { passive: false });
    return () => popover.removeEventListener("wheel", preventPageWheel);
  }, [open, position]);

  // 팝오버는 body 포털에 fixed로 놓이므로 좌표를 직접 계산합니다.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setPosition(null); return; }
    function placePicker() {
      if (!triggerRef.current) return;
      // **문턱입니다. 높이 상한이 아닙니다.** "이만큼 있으면 좋겠다"를 뜻하고 두 곳에서만
      // 쓰입니다 — 데스크톱에서 위로 뒤집을지, 모바일에서 자리를 얼마나 만들지.
      //
      // ⚠️ **이 값을 `maxHeight`에 다시 물리지 마세요.** 한동안 그랬고, 그래서 **자리가**
      // **아무리 넉넉해도** 상자가 318에서 잘려 팝오버에 스크롤바가 났습니다(오너 실기기).
      // 실측: 트리거가 화면 위쪽이라 아래가 812px 통째로 비어 있어도
      // `styleMaxHeight 318 / clientHeight 316 / scrollHeight 321`. **배치와 무관한**
      // **결함**이었고 `main`에도 글자까지 같습니다.
      //
      // 내용 높이는 **고정이 아닙니다.** 잰 구성(데모, 295px 폭): padding 12+12 · 머리말
      // 29.8(한 줄) · 열 212 · 액션 42(padding-top 10 + 버튼 32) = **308**. 오너 앱에서는
      // **321**이었는데, 머리말이 소비자가 주는 라벨·힌트 텍스트라 폭에 따라 줄이 늡니다.
      // 그래서 이 상수는 "모든 소비자의 내용보다 크다"를 보장할 수 없고, **보장할 필요도**
      // **없습니다** — 상한이 아니니까요. 모자라면 자리를 그만큼 덜 만들 뿐이고, 그 경우는
      // 아래 자리 확보가 실제 팝오버 높이를 재서 메웁니다.
      const desiredHeight = 318;
      const gap = 6;
      // 모바일 판정은 **이 파일이 이미 쓰던 그것**입니다(bottomInset이 걸리는 조건).
      // 스펙 §7.0이 "새 경계를 만들지 마세요"라고 못 박은 자리입니다 — 경계가 둘이 되면
      // 어느 폭에서 무엇이 참인지 아무도 못 셉니다.
      const isMobile = window.innerWidth <= 760;
      const bottomInset = isMobile ? mobileBottomInset : 8;
      const { rect, above, below, edge } = dropdownViewportSpace(triggerRef.current, bottomInset);
      // **모바일에서는 위로 뒤집지 않습니다**(스펙 §7.0, 오너 실기기 지시). 손가락이 필드
      // 아래에 있는데 팝오버가 위에 뜨면 **손이 내용을 가리고**, 뒤집힘 자체가 같은 필드를
      // 두 번 열 때 **자리를 오락가락**하게 만들어 조준을 다시 하게 합니다. 데스크톱에서는
      // 뒤집기가 여전히 옳습니다 — 포인터가 내용을 가리지 않고 화면이 넓습니다.
      const openAbove = !isMobile && below < desiredHeight && above > below;
      // 자리 확보는 팝오버가 마운트된 뒤에 합니다 — 아래 `makeRoomForPopover` 이펙트.
      // 상자 높이는 **남은 자리로만** 정합니다. 넉넉하면 내용 높이로 알아서 잡히고(그래서
      // 스크롤바가 없고), 좁을 때만 잘립니다 — 잘릴 때 스크롤바가 나는 것은 옳습니다.
      // `Math.max(230, …)`의 바닥은 그대로 둡니다: 그것마저 없으면 아주 좁은 자리에서
      // 상자가 몇십 px로 줄어 아무것도 못 고릅니다.
      const maxHeight = Math.max(230, (openAbove ? above : below) - gap);
      const viewportLeft = window.visualViewport?.offsetLeft ?? 0;
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const width = Math.min(Math.max(rect.width, 292), viewportWidth - edge * 2);
      const left = Math.min(Math.max(viewportLeft + edge, rect.left), viewportLeft + viewportWidth - width - edge);
      // ⚠️ **위로 뒤집을 때 `top`을 계산하지 마세요.** 그러려면 팝오버의 실제 높이가 필요한데
      // 이 함수는 팝오버가 마운트되기 **전에** 처음 돕니다 — 잴 대상이 아직 없습니다. 한동안
      // 높이 대신 `maxHeight`를 뺐고(`rect.top - maxHeight - gap`), `maxHeight`가
      // `Math.min(desiredHeight, …)`로 318에 묶여 있는 동안에만 그 값이 우연히 맞았습니다.
      // `5207c9c`가 그 상한을 없애면서(내용이 상수보다 커서 잘리던 것을 고친, 옳은 변경입니다)
      // 이 뺄셈이 같이 무너졌습니다 — 그 커밋은 아래로 여는 경우만 확인했습니다.
      //
      // 실측(Chromium 1280×1000, 트리거 top 715.4): `maxHeight` 701.4를 빼면 음수라 `edge`로
      // 잘려 `top = 8`, 팝오버는 높이 310.8로 화면 꼭대기에 붙고 **트리거와 396.6px 벌어졌습니다.**
      //
      // `bottom`은 높이를 몰라도 정해집니다. 그래서 마운트 전에도 정확하고, 잘릴 때도
      // 아래끝이 트리거에 붙은 채로 위쪽만 `maxHeight`에서 멈춥니다. `position: fixed`의
      // `bottom`은 레이아웃 뷰포트 기준이므로 `innerHeight`를 씁니다 — 뒤집기는 데스크톱
      // 전용(`!isMobile`)이라 가상 키보드가 뷰포트를 줄이는 경로와 겹치지 않습니다.
      setPosition({
        ...(openAbove ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
        left,
        width,
        maxHeight,
      });
    }
    placePicker();
    // §3의 네 신호를 한 자리에서 받습니다 — `visualViewport`의 `scroll`(핀치줌 팬)이
    // 여기 세 줄로 손수 등록하던 시절에 빠져 있었습니다. `positioning.ts` 주석 참고.
    const stopViewportWatch = onViewportChange(placePicker);
    return () => {
      stopViewportWatch();
      // 다음 열림에서 다시 잴 수 있게 요청 플래그만 되돌립니다.
      //
      // ⚠️ **스크롤은 되돌리지 않습니다.** `apple-design` §16.2 Agency로 이 저장소가 이미
      // 한 번 내린 결론입니다 — 그 사이 사용자가 스크롤했을 수도 있고, 컨트롤이 사용자의
      // 자리를 뺏으면 안 됩니다. 자리를 만든 것은 사용자가 요청한 조작의 일부였습니다.
      roomRequestedRef.current = false;
      // 늘려 둔 자리는 되돌립니다. 스크롤 위치는 그대로 둡니다(§7.0 Agency).
      const reserved = reservedRoomRef.current;
      if (reserved) { reserved.host.style.paddingBottom = reserved.previous; reservedRoomRef.current = null; }
    };
  }, [open, mobileBottomInset]);

  /**
   * 스크롤 호스트를 `amount`만큼 내려 팝오버가 들어갈 자리를 만듭니다.
   *
   * 호스트는 이 킷이 이미 아는 둘입니다 — 모바일에서 `AppShell`이 스크롤 호스트로 쓰는
   * `#root`, 그리고 문서 자신(`captureScrollSnapshot`이 쓰는 것과 같은 짝입니다).
   * 실제로 스크롤할 수 있는 쪽을 고르고, 판단이 안 되면 앞엣것을 씁니다.
   *
   * **움직인 뒤 다시 재는 일은 여기서 하지 않습니다.** `placePicker`가 이미 document의
   * scroll 이벤트에 물려 있어(capture) 스크롤이 진행되는 동안 계속 다시 돌며 팝오버를
   * 트리거에 붙여 둡니다. 여기서 스크롤 전 좌표로 배치까지 하면 **이중 보정**이 됩니다 —
   * 이 킷이 가상 키보드에서 이미 밟은 함정이고 §9가 "뷰포트가 멎은 뒤 한 번만"으로 푼 것과
   * 같은 종류입니다.
   *
   * 애니메이션은 §12를 따릅니다: 부드럽게 움직이되 `prefers-reduced-motion`이면 즉시
   * 자리만 잡습니다. `scrollTo`가 없는 환경(jsdom)에서는 `scrollTop`을 직접 씁니다 —
   * 그래서 테스트가 **얼마나 움직이라고 요청했는지**까지는 볼 수 있습니다.
   */
  function scrollRoomBy(amount: number) {
    const candidates = [document.getElementById("root"), document.scrollingElement ?? document.documentElement]
      .filter((element): element is HTMLElement => element instanceof HTMLElement);
    const host = candidates.find((element) => element.scrollHeight > element.clientHeight) ?? candidates[0];
    if (!host) return;
    // **범위가 모자라면 늘립니다.** 트리거가 문서 끝에 있으면 스크롤을 요청해도 더 내려갈
    // 곳이 없어 아무 일도 일어나지 않고, 아래 공간이 그대로라 상자가 좁게 잘립니다. 이 킷이
    // 가상 키보드에서 padding-bottom으로 자리를 예약하는 것과 같은 계열입니다.
    //
    // ⚠️ **오너가 리포트한 "팝오버 스크롤바"의 원인은 이것이 아니었습니다.** 그건
    // `maxHeight`가 상수로 잘리던 것이었고(위 `desiredHeight` 주석), 그때 호스트에는 범위가
    // 708px 남아 있었습니다 — **이 분기는 그 캡처에서 아예 돌지 않았습니다.**
    //
    // 그래도 남겨 둡니다: 트리거가 **문서 맨 끝 가까이**(대략 문턱만큼 이내) 있고 호스트에
    // 남은 범위가 그보다 작으면, 스크롤로는 자리를 못 만들고 이것만이 만들 수 있습니다.
    // 마지막 필드가 날짜인 폼이 그렇습니다. **다만 데모 페이지로는 그 배치를 만들지 못해**
    // **실브라우저로 확인하지 못했습니다** — jsdom 테스트가 기제(요청량과 되돌림)만 고정합니다.
    const room = Math.max(0, host.scrollHeight - host.clientHeight - host.scrollTop);
    const shortfall = amount - room;
    if (shortfall > 0 && !reservedRoomRef.current) {
      const previous = host.style.paddingBottom;
      reservedRoomRef.current = { host, previous };
      host.style.paddingBottom = `${(parseFloat(window.getComputedStyle(host).paddingBottom) || 0) + shortfall}px`;
    }
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (smooth && typeof host.scrollTo === "function") host.scrollTo({ top: host.scrollTop + amount, behavior: "smooth" });
    else host.scrollTop += amount;
  }

  function shiftedFrom(sourceValue: string, unit: DateWheelUnit, amount: number) {
    const next = model.normalize(model.shift(sourceValue, unit, amount), fields);
    // 연도가 10000 이상(또는 음수)이 되면 Date#toISOString()이 확장 표기
    // (+010000-07-12)로 바뀌고, 그 뒤 slice(0, 10)·normalizeToFields(model.normalize)를
    // 거치며 "+010000-07-undefined" 같은 깨진 문자열이 된다. validDateValue(model.isValid)는
    // 이미 컴포넌트 전체가 "쓸 수 없는 값"의 신호로 쓰는 판정이므로, 여기서도 그대로
    // null을 돌려줍니다 — outOfRange 판정으로는 min/max가 없는 필드에서 이 값을
    // 걸러내지 못합니다.
    if (!model.isValid(next)) return null;
    if (outOfRange(next)) return null;
    return next;
  }

  function shifted(unit: DateWheelUnit, amount: number) {
    return shiftedFrom(baseValue, unit, amount);
  }

  function markColumnMotion(unit: DateWheelUnit, amount: number) {
    if (amount) {
      setColumnMotion((current) => ({
        ...current,
        [unit]: { sequence: current[unit].sequence + 1, direction: amount > 0 ? "next" : "previous", playing: true },
      }));
    }
  }

  /**
   * 한 칸 확정합니다. `motion`이 `"wheel"`이면 휠 이동 애니메이션까지 재생합니다 —
   * `markColumnMotion`이 열의 sequence를 올리고, 값 컨테이너의 key가
   * `${unit}-${sequence}`라서 행 일곱 개가 리마운트되는 것이 그 트리거입니다.
   * `"none"`이면 값만 확정합니다.
   *
   * **`"none"`을 쓰는 자리는 드래그 중 커밋 하나뿐입니다**(`moveSwipe`). 근거는 그
   * 호출부에 적혀 있습니다.
   */
  /**
   * 스와이프가 시작될 때 그 열의 모션을 비웁니다. **새 드래그가 시작됐다는 것은
   * 애니메이션할 휠 이동이 없다는 뜻입니다.**
   *
   * `markColumnMotion`은 sequence를 **올리기만** 하고 아무도 0으로 되돌리지 않았습니다.
   * 열의 className이 `sequence ? moving-${direction}`이라, 한 번이라도 커밋한 열은 그
   * 클래스를 계속 달고 있었고 — 그 클래스가 210ms 슬라이드를 **무장**시킵니다.
   * `.dragging`이 `animation: none !important`로 무음 처리하지만 그것은
   * `Math.abs(offset) > 2`로 켜지므로 커밋 직후 한 프레임 빠지고, 그 프레임에
   * 애니메이션이 **리마운트 없이** 새로 생겨 `from`을 그립니다. 실브라우저
   * `getAnimations()`로 쟀습니다: `.dragging`을 붙이면 `[]`, 떼면 `currentTime: 0`짜리가
   * 새로 생기며 computed transform이 `matrix(0.975, 0, 0, 0.975, 0, -45)`가 됩니다.
   * 그래서 **두 번째 스와이프부터** 번쩍임이 돌아왔습니다 — 무장시킨 것은 바로 앞
   * 스와이프의 놓을 때 커밋입니다.
   *
   * 여기서 비우면 드래그 내내 `moving-*`이 **아예 안 붙으므로**, `.dragging`이 어떻게
   * 토글되든 만들어질 애니메이션이 없습니다. `finishSwipe`의 놓을 때 커밋이 다시
   * 무장시키므로 **착지 슬라이드는 그대로 남습니다**(대조군이 지킵니다).
   *
   * 이미 꺼져 있으면 같은 객체를 돌려주어 리렌더를 만들지 않습니다.
   *
   * ⚠️ **`playing`만 끕니다. `sequence`는 건드리지 않습니다 — 그게 이 함수의 요점입니다.**
   * 처음 판에서는 `sequence`를 0으로 되돌렸고, className이 `sequence ? …`였으니 그것이
   * 무장 해제 방법이었습니다. 그런데 `sequence`는 값 컨테이너의 key이기도 해서 **무장
   * 해제가 곧 리마운트**였고, pointerdown이 행 일곱 개를 갈아치웠습니다. mousedown을 받은
   * 노드가 mouseup 전에 사라지면 브라우저는 `click`을 공통 조상으로 리타기팅하므로 행의
   * `onClick`이 안 돕니다 — 오너 리포트 "7일 때 9를 눌러도 안 바뀐다"가 그것이고,
   * 무장된 열에서만 그러므로 **한 번 걸러 한 번씩** 실패했습니다(코디네이터 실브라우저
   * 실측: 무장 `isConnected: false` 값 안 바뀜 / 비무장 살아 있고 값 바뀜 / 다시 무장
   * 안 바뀜). `DateWheelMotion` 타입 주석에 그 셋의 분업이 적혀 있습니다.
   *
   * **`.dragging`을 제스처 전체에 거는 안을 기각한 이유**(같은 구멍을 겨냥한 다른
   * 후보였습니다): 그쪽은 무장을 **무음 처리만** 하므로 `clearSwipeVisual`이
   * `.dragging`을 떼는 순간 애니메이션이 **다시 만들어집니다** — 번쩍임이 드래그 중에서
   * **놓는 순간으로 옮겨갈** 뿐입니다(같은 측정: `.dragging`을 붙이면 `[]`, 떼면
   * `currentTime: 0`짜리가 새로 생깁니다). 여기서는 무장 자체를 지우므로 다시 만들어질
   * 것이 없습니다. **진행 중이던 애니메이션을 pointerdown에서 끊는 것은 두 안이 같습니다**
   * — 그건 새 제스처가 앞 모션을 대체하는 것이라 맞습니다.
   */
  function clearColumnMotion(unit: DateWheelUnit) {
    setColumnMotion((current) => (current[unit].playing ? { ...current, [unit]: { ...current[unit], playing: false } } : current));
  }

  function commitShift(sourceValue: string, unit: DateWheelUnit, amount: number, motion: "wheel" | "none" = "wheel") {
    const next = shiftedFrom(sourceValue, unit, amount);
    if (!next) return null;
    if (motion === "wheel") markColumnMotion(unit, amount);
    onChange(next);
    return next;
  }

  /**
   * `오늘`(팝오버 버튼과 `Ctrl+;`가 공유)입니다. **여러 칸을 건너뛰더라도 휠 슬라이드를**
   * **재생합니다** — 오너 리포트: "오늘 버튼 클릭했을 때 선택한 애니메이션이 없이 바뀌어서
   * 어색해". 예전에는 `onChange`를 직접 불러 `markColumnMotion`을 안 탔습니다.
   *
   * ⚠️ **§12의 트리거 확정 펄스와 다른 신호입니다.** §12는 `오늘`·`비우기`가 **트리거의**
   * 확정 펄스를 켜지 않는다고 정했고 그건 그대로입니다. 이것은 **팝오버 안 휠의**
   * 슬라이드입니다. 두 신호는 뜻이 다르고 충돌하지 않습니다 — 하나는 "필드에 값이
   * 확정됐다", 다른 하나는 "이 열이 움직였다".
   *
   * **버튼과 단축키가 이 함수를 공유합니다.** 이 킷에서 같은 규칙이 두 곳에 복제됐을 때
   * 갈라지지 않은 적이 없습니다(`commitAndClose`가 생긴 이유가 그것입니다).
   *
   * 방향은 **그 열 자신의 수가 움직인 방향**입니다. 날짜가 나아가는 방향이 아닙니다 —
   * 예를 들어 12월에서 1월로 가면 월 열은 화면에서 **뒤로** 굴러가므로 `previous`가
   * 맞습니다. 열이 그리는 것이 그 열의 수이기 때문입니다.
   */
  function commitToday() {
    const next = clampToRange(model.now(timeZone));
    const numbersOf = (value: string) => value.split("-").map(Number);
    // hour·minute·second는 UNIT_LADDER 상의 자리(3·4·5)만 채웁니다 — Record<WheelUnit, …>가
    // 여섯 키를 요구해서입니다(2b-1). `fields`에 그 단위가 있으면(타입은 이제 허용합니다)
    // 이 함수 자체는 불립니다 — `numbersOf`가 여전히 날짜 문자열(YYYY-MM-DD)만 쪼개
    // `to[3]`/`from[3]`이 `undefined`이므로 `Math.sign(undefined - undefined)`가 `NaN`이
    // 되고, `markColumnMotion`의 `if (amount)` 가드가 `NaN`을 거짓으로 걸러 조용히
    // no-op이 됩니다(크래시도, 잘못된 방향 애니메이션도 아닙니다). 시각 열을 실제로
    // 커밋하는 것은 2b-3의 몫입니다.
    const index: Record<WheelUnit, number> = { year: 0, month: 1, day: 2, hour: 3, minute: 4, second: 5 };
    const [from, to] = [numbersOf(baseValue), numbersOf(next)];
    for (const unit of fields) markColumnMotion(unit, Math.sign(to[index[unit]] - from[index[unit]]));
    onChange(next);
  }

  function applyShift(unit: DateWheelUnit, amount: number) {
    commitShift(baseValue, unit, amount);
  }

  /**
   * 타이핑으로 값을 확정합니다. **`commitShift`를 타면 안 됩니다** —
   * 그쪽은 `markColumnMotion`이 열의 sequence를 올리고, 값 컨테이너의 key가
   * `${unit}-${sequence}`라서 행 일곱 개가 통째로 리마운트되며 휠 이동
   * 애니메이션이 재생됩니다. 숫자 하나마다 210ms 전환이 도는 셈입니다.
   * 타이핑은 휠 이동이 아닙니다.
   */
  function commitTyped(unit: DateWheelUnit, amount: number) {
    const next = clampToRange(model.setUnit(baseValue, unit, amount));
    onChange(next);
    return next;
  }

  /**
   * 열을 떠날 때 버퍼를 해석해 확정합니다. 확정할 수 없으면 조용히 버립니다.
   *
   * ⚠️ **unit을 인자로 받지 않습니다. 버퍼가 자기 unit을 들고 있으므로 그것으로 확정합니다**
   * (설계 스펙 §4.2). 예전에는 `flushTyping(unit)`이었고 호출부 셋이 전부
   * `resolvedActiveUnit`을 넘겼는데, **그 둘은 갈라질 수 있습니다** — 트리거 세그먼트 클릭,
   * 그리고 소비자의 런타임 `fields` 축소. 갈라지면 인자가 `typing.unit`과 안 맞아 이 함수가
   * **아무것도 안 하고 빠져나가면서 버퍼도 안 비웠고**, 그 하나에서 증상이 넷 났습니다
   * (리뷰 실측): 다음 숫자가 조용히 덮어씀 · `Backspace` no-op · `←`/`→`가 확정도 폐기도
   * 안 함 · `Tab`이 계약과 반대로 버림. 그리고 살아남은 버퍼가 세션 끝의 `완료`에서
   * **`2003-08-13`처럼 엉뚱한 연도로 확정**됐습니다 — 사라지는 것보다 나쁩니다.
   *
   * `commitAndClose`는 **혼자만 처음부터 옳았습니다**(인자 없이 상태에서 읽음). 인자를
   * 없앤 것이 고침의 전부입니다 — **틀리게 넘길 인자가 없으면 갈라질 수도 없습니다.**
   *
   * **버퍼가 있으면 무조건 비웁니다**(해석 가능 여부와 무관). 그래야 `fields` 축소로 생긴
   * **보이지 않는** 버퍼도 떠나는 경로에서 청소됩니다 — 안 그러면 `fields`가 다시 늘 때
   * 묵은 숫자가 되살아납니다. 확정은 `resolvedTyping`(보이는 것)에 대해서만 합니다:
   * 화면에 없는 숫자를 값에 얹으면 그게 바로 위의 `2003` 사고입니다.
   *
   * 반환값(방금 확정한 새 값)을 호출부가 받아 써야 하는 경우가 있습니다 —
   * ArrowUp/ArrowDown처럼 확정 뒤 그 값에서 한 칸 더 움직이는 경로가 그렇습니다.
   * `commitTyped`의 `onChange`는 `baseValue`(이 렌더에서 고정된 값 prop)로 계산한
   * 결과를 넘길 뿐, 그 자리에서 prop을 갱신하지 않습니다. 뒤이어 또 `baseValue`를
   * 읽는 두 번째 `onChange`를 부르면(예: 예전 `applyShift`) 나중 호출이 그대로
   * 값을 덮어써 방금 확정한 값이 사라집니다 — moveSwipe/finishSwipe가 이미
   * `commitShift`에 출발 값을 명시로 넘겨 이 문제를 피하는 것과 같은 이유입니다.
   * `commitAndClose`(Enter·완료 버튼이 공유)도 같은 함정을 피하려고 `value` prop
   * 대신 이 반환값을 씁니다.
   */
  function flushTyping() {
    if (!typing) return null;
    setTyping(null);
    const buffer = resolvedTyping;
    if (!buffer?.digits) return null;
    const amount = model.flushBuffer(buffer.unit, buffer.digits);
    if (amount === null) return null;
    return commitTyped(buffer.unit, amount);
  }

  /**
   * Enter와 완료 버튼이 공유하는 닫기 경로입니다. 원래 각자 따로 구현돼 있었는데
   * 완료 버튼 쪽이 flushTyping을 부르지 않아 치던 숫자를 버렸습니다 — 하나로
   * 합쳐 다시 갈라지지 못하게 합니다.
   *
   * 완료 버튼의 onClick에는 unit이 없습니다. 버퍼(`typing`) 자신이 자기 unit을
   * 이미 들고 있으므로 인자로 받지 않고 상태에서 직접 읽습니다 — 버퍼가 없으면
   * 아무것도 확정하지 않습니다.
   *
   * `flushed`가 null이면(버퍼가 없었거나 해석할 수 없었으면) `value`가 비어 있고
   * **이번 세션에 비우기·Delete로 지운 적이 없을 때만** baseValue로 채웁니다. 지운
   * 적이 있으면(clearedRef.current) 이 분기를 건너뛰어, 완료가 방금 지운 값을 되살리지
   * 않습니다 — clearedRef 선언부에 이 결함(오너가 실측: 오늘 → 비우기 → 완료)의 배경이
   * 있습니다. flushed가 있으면 그 onChange가 이미 값을 확정했으므로 여기서 또
   * baseValue로 덮어쓰면 안 됩니다 — `value` prop은 이 렌더의 클로저에 갇혀 있어(리렌더
   * 전) 방금 확정한 값을 반영하지 못한 채 여전히 "비어 있다"고 잘못 읽어 되돌려버립니다.
   * ArrowUp/ArrowDown에서 flushTyping이 이미 겪은 것과 같은 결함입니다.
   */
  function commitAndClose() {
    const flushed = flushTyping();
    // 이 함수가 최종적으로 확정하는 값. 아래에서 실제로 바뀐 값이 있으면만 갱신합니다 —
    // 아무것도 안 바뀌면(예: 이미 오늘인 값 그대로 완료) committed는 value와 같은
    // 채로 남아 커밋 신호가 켜지지 않습니다.
    let committed = value;
    if (flushed !== null) {
      committed = flushed;
    } else if (!value && !clearedRef.current) {
      onChange(baseValue);
      committed = baseValue;
    }
    // Tab으로 떠나거나 바깥을 클릭해도 값은 남지만, 그건 "완료"를 누른 게 아니므로
    // 여기서만 올립니다 — Enter와 완료 버튼만 이 함수를 거칩니다. 그리고 확정된 값이
    // **이 세션이 시작될 때의 값**(sessionStartValueRef — 트리거가 포커스를 얻었거나
    // 팝오버가 닫힌 마지막 순간의 값)과 실제로 다를 때만 올립니다.
    // 이 순간의 `value`와 비교하면 안 됩니다 — 이 컨트롤은 화살표 한 번, 휠 한 칸마다도
    // onChange로 value를 곧바로 바꾸므로, 완료를 누르는 시점엔 이미 committed와 value가
    // 같아져 있어 "화살표로 옮긴 뒤 완료"가 항상 "안 바뀌었다"로 잘못 읽힙니다(오너가
    // 실측: 화살표 → 완료인데 신호가 전혀 안 뜸). 세션 시작 값과 비교해야 "이번에 연
    // 뒤로 뭔가 바뀌었는가"를 묻는 것이 됩니다. 이미 있던 값 그대로 완료하면(예: 오늘
    // 눌러 이미 오늘인 값을 다시 완료, 또는 아무것도 안 건드리고 완료) 아무 신호도
    // 없는 게 의도입니다 — 오너에게 확인받은 동작이고, 보완하지 않습니다.
    if (committed !== sessionStartValueRef.current) setCommitPulse((n) => n + 1);
    // 닫힘 이펙트가 기준값을 이 값으로 찍게 합니다 — 선언부에 이유가 있습니다.
    committedOnCloseRef.current = committed;
    setOpen(false);
  }

  /* 여기서 event.preventDefault()를 부르지 마세요.
   * React는 wheel/touchstart/touchmove를 루트(와 포털 컨테이너)에 passive로
   * 등록하므로 합성 이벤트에서의 preventDefault는 효과가 없고, 콘솔에
   * "Unable to preventDefault inside passive event listener invocation"만 남깁니다.
   * 페이지 스크롤 차단은 위 useEffect의 preventPageWheel(네이티브,
   * { passive: false })이 담당합니다. 이 핸들러는 값 변경만 합니다. */
  function handleWheel(event: ReactWheelEvent, unit: DateWheelUnit) {
    if (!event.deltaY) return;
    // 스펙: 휠은 스와이프·행 클릭과 같은 조작 계열이라 버퍼를 확정하지 않고 버립니다.
    // 안 비우면, 같은 열에서 자릿수 하나만 치고 휠을 굴려 값을 옮긴 뒤 Tab으로
    // 떠날 때 flushTyping이 그 묵은 숫자를 그대로 해석해 휠이 방금 맞춘 값을
    // 조용히 덮어씁니다.
    setTyping(null);
    setActiveUnit(unit);
    applyShift(unit, event.deltaY > 0 ? 1 : -1);
  }

  /** step 방향의 세그먼트를 활성으로 만듭니다. 끝이면 아무것도 하지 않고 false를 돌려줍니다. */
  function moveColumn(unit: DateWheelUnit, step: 1 | -1) {
    const index = fields.indexOf(unit);
    const nextIndex = index + step;
    if (index === -1 || nextIndex < 0 || nextIndex >= fields.length) return false;
    setActiveUnit(fields[nextIndex]);
    return true;
  }

  /**
   * 열림·닫힘 양쪽에서 같게 동작하는 단축키. 여기서만 Ctrl/Meta를 봅니다 —
   * PRINCIPLES §11의 "Ctrl·Meta가 눌린 키는 처리하지 않는다"에 대한 명시적
   * 예외이고, 근거는 그 조항 옆에 적혀 있습니다.
   *
   * 문자가 아니라 `code`로 판정하는 이유: 배열에 따라 `;`가 Shift 조합이 되는
   * 키보드가 있어 `key`로 보면 새는 곳이 생깁니다.
   */
  function handleShortcut(event: ReactKeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.code === "Semicolon") {
      event.preventDefault();
      setTyping(null);
      commitToday();
      return true;
    }
    if (event.ctrlKey || event.metaKey) return false;
    if (event.key === "Delete" && allowClear) {
      event.preventDefault();
      setTyping(null);
      clearedRef.current = true;   // commitAndClose가 이 값을 baseValue로 되살리지 않도록 기억
      onChange("");
      return true;
    }
    return false;
  }

  /**
   * 이 컨트롤이 받는 **유일한** 키 핸들러이고, 그것을 거는 자리도 **트리거 하나**입니다
   * (설계 스펙 §6.2의 불변식: 이 컨트롤이 키보드를 받는 동안 `document.activeElement`는
   * 언제나 트리거입니다 — 팝오버가 열려 있어도 그렇습니다).
   *
   * 그래서 "키가 도착한 열"이라는 개념이 없고, 움직이는 것은 언제나 `resolvedActiveUnit`
   * 하나입니다. 열이 자기 자신을 넘기던 `unit` 인자가 여기 있었는데, 그 인자는 열도 키를
   * 받던 시절에만 뜻이 있었습니다.
   *
   * 순서에 계약이 **셋** 박혀 있습니다. 바꾸지 마세요 — 셋 다 뮤테이션으로 빨개지는
   * 것을 확인했습니다(괄호 안이 그때 빨개진 개수):
   *   1. `disabled`가 맨 앞 — 비활성 필드는 **어떤 키에도** 반응하지 않습니다.
   *      Delete·Ctrl+;도 예외가 아니라서 `handleShortcut`보다 앞입니다. (1↔2 스왑: 1 red)
   *   2. `handleShortcut`이 Ctrl/Meta 가드보다 **앞** — 뒤에 두면 Ctrl+;가 그 가드에
   *      걸려 `handleShortcut`에 영영 닿지 않습니다. (2↔3 스왑: 4 red)
   *   3. 그 뒤의 Ctrl/Meta 가드 — 나머지 조합키는 브라우저·OS 몫입니다.
   *
   * 여기 한동안 넷째가 있었습니다 — "`handleShortcut`이 아래 `if (!open)` 갈림보다 앞".
   * **SEG Task 5가 그 갈림을 없앴으므로 그 조항도 없어집니다.** 닫힌 상태에서 조기
   * `return`하는 자리가 더 이상 없어서(§3의 "닫힘·열림" 키들이 전부 이 함수 위쪽에
   * 있습니다) 그 순서로 깨질 것이 남아 있지 않습니다. 성립할 수 없는 계약을 남겨 두면
   * 다음 사람이 반증하고 나머지 셋까지 못 믿게 되므로 지웁니다.
   *
   * **`typeDigit`(model.typeDigit)의 자동 이동이 활성 세그먼트를 옮기면 그 다음 키는 옮겨간 세그먼트에
   * 갑니다.** 연도 네 자리를 다 치면 활성이 월로 가고, 그 뒤의 `↓`는 월을 움직입니다 —
   * 설계 스펙 §4.1이 정한 계약입니다. 열도 키를 받던 시절에는 키가 여전히 연도 열로 와서
   * 둘이 갈렸고, 그 부산물을 tests가 붙잡고 있었습니다. 지금은 tests의 "네 자리를 친 뒤
   * ↓는 월을 움직인다"가 이 계약 쪽을 고정하고, 연도 10000 오버플로 가드는 `←`로 연도를
   * 되돌린 뒤 누르는 별도 테스트가 지킵니다.
   */
  function handleFieldKey(event: ReactKeyboardEvent) {
    const unit = resolvedActiveUnit;
    // 이 가드를 지우지 마세요. **이제 이 가드가 위 §7.1 이펙트의 `[disabled]` 의존성을
    // 성립시킵니다** — 그 이펙트는 `disabled`가 바뀔 때만 돌므로, 비활성인 동안 누군가
    // `open`을 다시 true로 만들면 팝오버가 되살아납니다. 그렇게 만들 수 있는 경로가
    // 여기 아래의 `↓`·`↑`·`Enter`·`Space`뿐이고(트리거 `onClick`은 버튼이 `disabled`라
    // 도달하지 않습니다), 이 한 줄이 그 넷을 전부 막습니다. 추측이 아니라 뮤테이션으로
    // 쟀습니다: 이 줄을 지우면 tests의 "비활성인 동안 ↓는 팝오버를 다시 열지 못한다"가
    // 빨개집니다(그 밖에 "비활성이면 어느 키로도 열리지 않는다"·"비활성이면 Delete도
    // 무시한다"까지 셋).
    //
    // 여기 한동안 "팝오버는 `disabled`를 안 봅니다 — 열린 채 `disabled`가 켜져도 아무도
    // 안 닫습니다"라고 적혀 있었습니다. **설계 스펙 §7.1이 그것을 고쳤으므로 그 문장은
    // 이제 거짓입니다.** 같은 문단에 있던 "실브라우저가 그 상태의 트리거에 키를 계속
    // 배달하는가"라는 미측정 항목도 함께 사라집니다 — 그 상태 자체가 없어졌습니다.
    // (비활성이 된 트리거를 브라우저가 blur하는지는 여전히 실기기 항목이고, 이제
    // 트리거의 `onBlur`(`flushTyping`)와 §7.1의 "확정하지 않는 닫힘"이 부딪히는
    // 자리로 옮겨 갔습니다. jsdom에서는 blur가 아예 나지 않는 것을 쟀습니다.)
    if (disabled) return;
    if (handleShortcut(event)) return;
    // Ctrl·Meta가 눌린 키는 건드리지 않습니다 — 브라우저·OS 단축키입니다.
    if (event.ctrlKey || event.metaKey) return;
    const key = event.key;

    // 여기부터 아래 "상태로 갈리는 세 무리"까지는 **닫힘·열림에서 똑같이** 동작합니다
    // (설계 스펙 §3의 "닫힘·열림" 행 전부). `Delete`·`Ctrl+;`는 이미 위 `handleShortcut`이
    // 처리했습니다.
    //
    // 예전에는 이 자리에 `if (!open) { 여는 키만 보고 나머지는 return }`이 있었습니다 —
    // `handleTriggerKeyDown`이 트리거에 걸려 있던 시절의 것이고, 그래서 닫힌 채로는
    // 숫자도 방향키도 `Tab`도 아무것도 안 먹었습니다. **(가)안의 요점이 바로 그것을
    // 없애는 것입니다**(스펙 §2·§3): 네이티브 날짜 필드는 달력을 열지 않고 고칩니다.
    if (key >= "0" && key <= "9" && key.length === 1) {
      event.preventDefault();
      // **클램프값을 activeUnit에 되씁니다.** 열림 `↑`/`↓` 분기가 전부터 하던 것과 같고,
      // 숫자 분기만 빠져 있었습니다 — 그 불일치가 **세 번째 갈라짐의 문**이었습니다(Task 6
      // 리뷰가 측정). 이 분기는 버퍼를 `{ unit, … }`, 즉 **클램프된** 활성 세그먼트에 매어
      // 두는데 `activeUnit` 원본은 그대로 뒀습니다. 그래서:
      //
      //   활성=일 → 소비자가 fields에서 일을 뺌(폴백: 연도) → 연도에 "3"을 침
      //   → 소비자가 fields를 되돌림 ⇒ activeUnit이 그림자에서 나와 다시 일
      //   ⇒ **보이는 버퍼는 연도, 활성 표시는 일.** 다음 숫자가 일로 가서 친 "3"이
      //     확정도 폐기도 없이 사라집니다.
      //
      // ⚠️ **"fields 축소가 활성을 영구히 옮긴다"로 일반화하지 마세요.** 줄이기만 하고 아무것도
      // 안 치면 활성은 그대로 돌아옵니다 — `resolvedActiveUnit`을 파생값으로 둔 판단(스펙
      // §6.4(3))은 그대로입니다. 여기서 옮기는 것은 **사용자가 그 세그먼트에 실제로 친**
      // 경우뿐이고, 그때 "활성은 연도"는 거짓이 아니라 진실입니다.
      //
      // 아래 `moveColumn`(자동 이동)이 뒤에 오므로, 자릿수가 차서 다음 세그먼트로 넘어가는
      // 경우에는 그쪽이 마지막에 이깁니다 — **순서를 바꾸지 마세요. 재고 적습니다:** 이 줄을
      // `moveColumn` **뒤로** 옮기면 3 red입니다(`연도 네 자리를 치면 월 세그먼트로 넘어간다`,
      // `월에서 5를 치면 일 세그먼트로 넘어간다`, `연도 네 자리를 친 뒤 ↓는 월을 움직인다`).
      // 이 파일에서 **근거 없이 적은 순서 계약이 두 번 거짓으로 밝혀졌으므로**(Task 5의
      // `Escape` 스왑, 위 `[fields]` 이펙트 근거) 이번에는 뮤테이션을 먼저 돌렸습니다.
      setActiveUnit(unit);
      setEditing(true);
      const buffer = resolvedTyping?.unit === unit ? resolvedTyping.digits : "";
      const step = model.typeDigit(unit, buffer, key);
      if (step.commit !== null) {
        setTyping(null);
        commitTyped(unit, step.commit);
        if (step.advance) moveColumn(unit, 1);
      } else {
        setTyping({ unit, digits: step.digits });
      }
      return;
    }

    if (key === "Backspace") {
      event.preventDefault();
      setEditing(true);
      if (resolvedTyping?.digits) {
        // 버퍼가 없다는 상태는 항상 null 하나로만 표현합니다 — 빈 문자열 버퍼를
        // 살려두면 읽는 쪽마다 ""를 "없음"으로 따로 알아야 하고, 그 결과가 바로
        // 아래 렌더의 `??`가 빈 문자열을 걸러내지 못해 행이 통째로 비어 버리는 결함입니다.
        const digits = resolvedTyping.digits.slice(0, -1);
        setTyping(digits ? { unit: resolvedTyping.unit, digits } : null);
      }
      return;
    }

    if (key === "Tab") {
      // 떠나는 키다 — 세그먼트를 옮기지 않는다(설계 스펙 §3·§5: 이 컨트롤의 tab 정거장은
      // 트리거 하나다). **preventDefault를 부르지 않는다.** 기본 동작이 다음/이전 요소로
      // 보내고, 포커스는 이미 트리거에 있으므로 브라우저가 트리거 기준으로 다음 tabbable을
      // 계산한다. keydown은 기본 Tab 동작보다 먼저 실행되므로 확정·닫기가 먼저 끝난다.
      //
      // **닫힌 상태에서도 확정한다**(§3은 이 행을 "닫힘·열림"으로 적는다). 예전에는 이
      // 분기가 `!open` 갈림 아래에 있어 닫힌 채로는 아예 닿지 않았고, 그래도 무해했다 —
      // **닫힌 채로 버퍼가 생길 방법이 없었기 때문**이다. SEG Task 5가 숫자 키를 닫힘으로
      // 올리는 순간 그 전제가 사라져, 치다 만 숫자를 들고 Tab으로 떠나면 그 숫자가 이유
      // 없이 사라지는 결함이 된다. `setOpen(false)`는 닫힌 상태에서 no-op이다.
      flushTyping();
      setOpen(false);
      return;
    }

    // 방향키는 안에서만 움직인다 — 끝에서는 제자리이고 팝오버를 닫지 않는다.
    if (key === "ArrowRight" || key === "ArrowLeft") {
      event.preventDefault();
      setEditing(true);
      flushTyping();
      moveColumn(unit, key === "ArrowRight" ? 1 : -1);
      return;
    }

    // ── 여기서부터가 **상태로 갈리는 세 무리**다(설계 스펙 §3). 셋 다 "팝오버가 없으면
    //    할 수 없는 일"이라는 한 가지 이유로 갈린다.

    if (key === "Escape") {
      // **열림은 여기서 처리하지 않는다.** `useEscapeToClose`(hooks.ts)가 document
      // 리스너로 받아 겹친 것 중 가장 깊은 하나만 닫는다 — 다이얼로그 안의 픽커를
      // Escape로 닫아도 다이얼로그가 살아 있는 것이 그 훅 덕이다. 여기서 가로채면
      // (특히 아래 stopPropagation이 걸리면) 그 리스너에 영영 안 닿아 **팝오버가
      // Escape로 안 닫힌다.** tests의 "Escape를 누르면 팝오버가 닫힌다"가 버퍼를 채운
      // 채로 그것을 지킨다 — **이 줄을 지우면** 빨개진다.
      //
      // ⚠️ 여기 한동안 "이 `if`와 아래 `if`의 **순서를 바꾸면** 빨개진다"고 적혀 있었는데
      // **틀렸다 — 스왑은 0 red다**(리뷰가 측정). 두 가드 사이에 부수효과가 없어 **등가
      // 뮤테이션**이기 때문이고, 등가 뮤테이션의 0 red는 "감시자가 없다"가 아니라
      // "뮤테이션이 아무것도 안 바꿨다"는 뜻이다. 실제로 빨개지는 것은 **삭제**다.
      if (open) return;
      // **버퍼가 없으면 아무것도 하지 않고 그대로 흘려보낸다**(§3). 이쪽을 빠뜨리면
      // 날짜 필드에 포커스가 있는 동안 **다이얼로그가 Escape로 안 닫힌다** — 스펙이
      // 두 경우를 각각 테스트로 고정하라고 적어 둔 이유다.
      if (!resolvedTyping) return;
      // 버퍼가 있으면 버리고 전파를 멈춘다. 치던 숫자를 취소하려고 누른 Escape가 폼을
      // 통째로 닫으면 안 된다. React 루트는 document보다 **먼저** 실행되므로 여기서
      // 멈추면 useEscapeToClose의 document 리스너(다이얼로그 것 포함)에 닿지 않는다.
      //
      // preventDefault는 부르지 않는다 — §3이 정한 것은 전파 차단 하나뿐이고,
      // Escape에는 이 컨트롤이 되돌려야 할 기본 동작이 없다.
      event.stopPropagation();
      setTyping(null);
      return;
    }

    if (key !== "Enter" && key !== " " && key !== "ArrowUp" && key !== "ArrowDown") return;
    // Enter·Space: <button>은 Enter를 keydown에서, Space를 keyup에서 click으로 바꾸고,
    // 그 click은 트리거의 onClick(열기/닫기 토글)을 부른다 — 막지 않으면 닫힘에서는 연
    // 직후 다시 닫고, 열림에서는 확정하며 닫은 것을 **다시 연다.** 그래서 §3의 계약은
    // "두 상태 모두에서 항상 preventDefault"다. ⚠️ 열림 쪽 결함은 **jsdom에서 재현되지
    // 않는다** — jsdom 26.1.0은 그 click을 합성하지 않는다(직접 쟀다: Enter keydown·
    // Space keyup 모두 click 0회). 그래서 tests는 증상이 아니라 `defaultPrevented`를
    // 직접 고정한다. ↑·↓도 같이 막는다(페이지 스크롤 방지).
    event.preventDefault();
    // **닫힘 — 넷이 한 행이다**(§3: `닫힘 | ↓ ↑ Enter Space | 연다. 활성 세그먼트는
    // 그대로 둠`). 활성 세그먼트도, 치던 버퍼도 건드리지 않는다: §4.2가 "치다가 팝오버를
    // 여는 것은 '떠나는' 조작이 아니다"라고 적어 둔 그대로다. 그 조항은 `↓`/`↑`를
    // **"= 여는 키"**로 부르며 예로 들었고, 닫힌 상태의 Enter·Space도 정확히 여는 키다.
    // (§4.2 첫 문단의 "떠나는 키" 목록에 Enter·Space가 있지만, 그 목록은 그 둘이 실제로
    // 떠나는 상태 — 열림, 즉 `완료` — 을 두고 쓴 것이다. 두 문장은 이렇게 읽어야 둘 다
    // 참이 된다.)
    //
    // ⚠️ **여기에 `setActiveUnit(fields[0] ?? "year")`를 되살리지 마세요.** 그 시드가
    // 있으면 `→`·`→`로 일에 가 있다가 `↓`로 열 때 활성이 연도로 되돌아간다(스펙 §6.4(3)).
    // 트리거 onClick에도 같은 시드가 있었고, 둘 다 지웠다 — 하나만 지우면 반쪽이다.
    if (!open) { setEditing(true); setOpen(true); return; }
    if (key === "Enter" || key === " ") {
      // 완료 버튼과 같은 동작 — commitAndClose가 치던 숫자를 먼저 확정한 뒤 닫는다.
      commitAndClose();
      return;
    }
    setActiveUnit(unit);
    setEditing(true);
    // 버퍼가 있으면 먼저 확정하고, 그 값에서 이어서 한 칸 움직인다. applyShift는
    // baseValue(이 렌더에서 고정된 옛 값)를 읽으므로 여기서 그대로 쓰면 방금
    // commitTyped가 넘긴 값을 뒤이은 onChange가 덮어써 버퍼 확정이 무효가 된다 —
    // flushTyping의 주석 참고.
    const flushed = flushTyping();
    commitShift(flushed ?? baseValue, unit, key === "ArrowDown" ? 1 : -1);
  }

  /* 스와이프는 30px 경계를 넘을 때마다 즉시 한 칸 커밋하고 나머지 거리는 손가락을
   * 계속 따라갑니다. 손을 뗄 때 한꺼번에 여러 칸이 튀는 것을 막습니다.
   *
   * 포인터 캡처는 target이 아니라 currentTarget(컬럼)에 겁니다. 한 칸 커밋될 때마다
   * 값 버튼들이 key 변경으로 다시 마운트되는데, 캡처를 그 버튼(target)에 걸었으면
   * 언마운트되며 캡처가 풀려, 포인터가 picker 밖으로 나가는 순간 move가 끊깁니다.
   * 컬럼은 슬라이드 내내 그대로라 캡처가 유지되고 밖에서도 계속 따라옵니다.
   *
   * **그리고 누를 때가 아니라 슬롭을 넘긴 첫 move에서 겁니다** — 이유는 아래 본문의
   * 해당 자리에 있습니다. 명시적으로 푸는 자리는 없습니다: 캡처는 `pointerup`·
   * `pointercancel`에서 브라우저가 암묵적으로 해제하고, 우리가 안 건 제스처에서
   * 해제를 부를 일도 없어야 하므로 `releasePointerCapture` 호출을 두지 않습니다. */
  function moveSwipe(unit: DateWheelUnit, clientY: number, pointerId: number, buttons: number, column: HTMLElement) {
    if (buttons !== 1) return;
    const start = swipeRef.current;
    if (!start || start.unit !== unit || start.pointerId !== pointerId || !Number.isFinite(start.y) || !Number.isFinite(clientY)) return;
    let delta = clientY - start.y;
    // **여기가 "이 제스처는 탭이 아니라 드래그다"라고 정하는 한 자리입니다.** 클릭 억제와
    // 포인터 캡처가 **같은 판정**을 씁니다.
    //
    // ⚠️ **캡처를 `pointerdown`에서 걸면 안 됩니다.** 캡처는 드래그를 위한 장치인데 누름은
    // 아직 드래그가 아닙니다. 걸어 두면 이후 포인터 이벤트가 **열로 리타겟**되어,
    // `mousedown`은 행에 `mouseup`은 열에 도착하고 브라우저가 `click`을 **공통 조상인 열**에
    // 발생시킵니다 — **행의 `onClick`이 호출될 수가 없습니다.** 오너 실기기 TRACE가 그것을
    // 잡았습니다(pointerdown/mousedown target=button, pointerup/mouseup/click
    // target=section.date-wheel-column, 그 사이 offset은 59프레임 내내 0px).
    //
    // ⚠️ **대상은 그대로 열(`currentTarget`)입니다. 바꾼 것은 시점뿐입니다.** 행(`target`)에
    // 걸면 한 칸 커밋마다 행이 리마운트되면서 캡처가 풀려, 포인터가 픽커 밖으로 나가는 순간
    // move가 끊깁니다. 휠 표면 150px이 통째로 행 버튼이라 "행은 캡처하지 않는다"는 방식도
    // 같은 이유로 안 됩니다 — 모든 스와이프가 캡처를 잃습니다.
    //
    // 커밋 분기보다 **앞**에 둡니다. 한 프레임에 30px 넘게 뛰면 아래에서 delta가 잔여로
    // 줄어드는데, 판정은 **손가락이 실제로 간 거리**로 해야 합니다.
    if (Math.abs(delta) >= SWIPE_SLOP) {
      suppressColumnClickRef.current = true;
      if (!start.captured && typeof column.setPointerCapture === "function") {
        column.setPointerCapture(pointerId);
        start.captured = true;
      }
    }
    if (Math.abs(delta) >= 30) {
      const direction = delta < 0 ? 1 : -1;
      // **드래그 중 커밋은 휠 이동 애니메이션을 재생하지 않습니다.** 손가락이 이미
      // 컨테이너를 끌고 있으므로 210ms 슬라이드는 **두 번째 모션**이고, 둘이 싸웁니다 —
      // 설계 스펙 §6.1이 타이핑에 대해 내린 판단과 같은 근거입니다("타이핑은 휠 이동이
      // 아니다"). 오너 실기기 트레이스(2026-08-10)가 그 싸움을 두 가지로 잡았습니다:
      // 커밋 직후 delta가 0~2px이 되는 프레임에 `.dragging`이 빠지면서 슬라이드가
      // `from`(`translateY(-45px)`, `opacity: .58`)으로 한 프레임 번쩍이고,
      // 리마운트된 액센트 행에서 230ms `date-wheel-selected-pop`이 매 커밋마다 처음부터
      // 다시 시작합니다 — 커밋 간격이 100~150ms이라 그 팝은 **끝나는 일이 없습니다.**
      //
      // **CSS로 끄지 않고 여기서 안 붙이는 이유:** `.dragging`은 컨테이너만 덮고
      // 자식 버튼은 안 덮지만, 선택자를 버튼까지 넓혀도 같은 구멍이 남습니다 —
      // `.dragging`은 `Math.abs(offset) > 2`로 켜지므로 **커밋 직후 한 프레임 빠지고,
      // 측정된 번쩍임이 정확히 그 프레임입니다.** 그래서 CSS는 그대로 두고
      // `moving-*`을 안 붙입니다.
      //
      // ⚠️ **여기서 안 붙이는 것만으로는 모자랍니다.** 열이 앞선 커밋에서 받은 `moving-*`을
      // 아직 달고 있으면 슬라이드는 여전히 무장돼 있고, `.dragging`이 빠지는 프레임에
      // **리마운트 없이도** 새로 시작합니다. 그래서 스와이프가 **시작될 때** 그 열의 모션을
      // 비웁니다 — `clearColumnMotion`에 측정값이 있습니다.
      const next = commitShift(start.value, unit, direction, "none");
      if (next) {
        start.value = next;
        start.y += direction > 0 ? -30 : 30;
        suppressColumnClickRef.current = true;
        delta = clientY - start.y;
      } else {
        start.y = clientY;
        delta = 0;
      }
    }
    // **화면은 손가락의 절반만 움직입니다**(오너 실기기 판정: "움직이는 px을 반으로").
    // 클램프만 낮추지 않고 감쇠로 하는 이유: 클램프는 그 위 구간을 **정지**시키므로
    // 실기기에서 잰 데드존(최대 102ms)이 오히려 커집니다. 감쇠는 손가락 전 구간을 화면에
    // 대응시켜 그 구간이 아예 없습니다.
    //
    // ⚠️ **트레이드오프를 알고 고른 값입니다.** 값 V의 화면 위치는 `p - 30 + offset`이고
    // 커밋 직전/직후로 재면:
    //
    //     감쇠 없음, 클램프 24   p-6  -> p    6px 점프,  따라오는 거리 24px
    //     감쇠 0.5,  클램프 15   p-15 -> p   15px 점프,  따라오는 거리 15px   ← 지금
    //     감쇠 없음, 클램프 30   p    -> p    점프 없음,  따라오는 거리 30px
    //
    // **따라 내려가는 거리를 줄이면 커밋 순간의 점프가 커집니다.** 셋 중 어느 것도 둘 다
    // 잡지 못합니다. 둘 다 잡는 모델은 하이라이트 교대(액센트를 뷰포트 중앙에 가장 가까운
    // 행에 주는 것)뿐이고, 오너가 실기기 A/B에서 **기각했습니다**("오히려 더 어색하다").
    //
    // 클램프 15는 기하가 아니라 **커밋 경계 30 x 감쇠 0.5**입니다. 커밋이 먼저 일어나므로
    // 보통 경로에서는 물리지 않고, 한 프레임에 30px 넘게 뛸 때만 물립니다. 프리로드가
    // 감당하는 기하 상한(±30, 값 컨테이너 210px - 뷰포트 150px - 기본 translateY -30px)
    // 안쪽이라 뷰포트 끝에 빈 띠가 생기지 않습니다.
    const offset = Math.max(-15, Math.min(15, delta * 0.5));
    column.classList.toggle("dragging", Math.abs(offset) > 2);
    column.style.setProperty("--date-wheel-drag-offset", `${offset}px`);
  }

  /**
   * ± 버튼 위에서 시작한 누름인가. **그렇다면 스와이프가 아닙니다.**
   *
   * 열의 `onPointerDown`은 대상을 안 보고 `swipeRef`를 세웠고, 그래서 ± 버튼을 누른 채
   * 손이 조금만 흔들려도 `moveSwipe`의 `Math.abs(delta) > 2`가 서서 열의
   * `onClickCapture`가 그 클릭을 삼켰습니다. **마우스는 누르고 떼는 사이에 2~3px
   * 흔들리는 게 정상**이라 데스크톱에서 "± 버튼이 안 먹는다"로 나타납니다
   * (오너 리포트, 프레임 단위 재현: 가만히 클릭하면 4회 다 바뀌고 3px 움직이면 안 바뀜).
   *
   * ⚠️ **행 버튼(`.date-wheel-values button`)은 여기 넣으면 안 됩니다.** 휠 표면 150px이
   * 통째로 그 버튼들이라 스와이프가 죽습니다. ± 버튼만 빼는 근거는 그것이 휠 표면이
   * 아니라 **이산 컨트롤**이라는 것입니다 — 한 번 눌러 한 칸, 끄는 거리가 없습니다.
   */
  function startsOnStepControl(target: EventTarget | null) {
    return target instanceof Element && !!target.closest(".date-wheel-step");
  }

  function clearSwipeVisual(column: HTMLElement) {
    column.classList.remove("dragging");
    column.style.removeProperty("--date-wheel-drag-offset");
  }

  function releaseColumnClickSuppression() {
    if (suppressColumnClickRef.current) requestAnimationFrame(() => { suppressColumnClickRef.current = false; });
  }

  function finishSwipe(unit: DateWheelUnit, clientY: number, pointerId: number, column: HTMLElement) {
    const start = swipeRef.current;
    swipeRef.current = null;
    clearSwipeVisual(column);
    if (!start || start.unit !== unit || start.pointerId !== pointerId) { releaseColumnClickSuppression(); return; }
    if (Number.isFinite(start.y) && Number.isFinite(clientY)) {
      const delta = clientY - start.y;
      if (Math.abs(delta) >= SWIPE_SLOP) {
        suppressColumnClickRef.current = true;
        // 놓을 때의 커밋은 기본값(`"wheel"`)입니다. 손가락이 떠난 뒤의 **이산적인**
        // 착지라 슬라이드가 맞는 모션이고, `clearSwipeVisual`이 `.dragging`을 이미
        // 지웠으므로 정상 재생됩니다 — 위 드래그 중 커밋과 다른 상황입니다.
        commitShift(start.value, unit, delta > 0 ? -1 : 1);
      }
    }
    releaseColumnClickSuppression();
  }

  // data-fields와 열 렌더가 같은 목록을 봐야 합니다 — 3단계에서 오전/오후 버튼이
  // 붙어 model.columns(fields)가 fields와 갈라지면, 지역 변수 하나로 묶어 두지 않으면
  // CSS 열 폭을 정하는 data-fields만 옛 값을 씁니다.
  const columns = model.columns(fields);
  return <div className={`date-wheel-picker${open ? " open" : ""} ${className}`.trim()} ref={rootRef}>
    {/* onFocus는 세션 기준값을 찍는 두 지점 중 나머지 하나입니다(다른 하나는 위의 닫힘
        이펙트) — 설계 스펙 §6.4. React의 onFocus는 native focusin에 대응합니다.

        **반드시 트리거 <button> 자신에 붙습니다. 바깥 rootRef div로 올리면 안 됩니다.**
        focusin은 버블하고, 팝오버는 포털이지만 React 트리에서는 그 div의 자식이라 합성
        이벤트가 그리로 올라갑니다. div에 붙이면 이 핸들러가 "트리거가 포커스를 얻었다"가
        아니라 "이 컨트롤 어딘가가 포커스를 얻었다"를 뜻하게 되고, 그것은 세션 도중에
        기준값을 덮어쓰는 사건입니다(§6.4가 focusout에 아무것도 하지 않는 이유와 같습니다).

        ⚠️ **이 자리에 예전에는 "팝오버를 여는 순간 포커스 이펙트가 열에 준 focus가 곧바로
        이 핸들러를 부른다(뮤테이션으로 실증)"고 적혀 있었습니다. SEG Task 4가 그 포커스
        이펙트를 지웠으므로 그 근거도, 그 측정도 더 이상 재현되지 않습니다.** 지금 이것은
        "지금 깨진다"가 아니라 **예방적** 근거입니다 — 팝오버 안 어떤 것도 포커스를 받지
        않게 막아 두었지만(§6.3), 그 차단이 한 겹 뚫리는 날 이 핸들러가 div에 있으면 그때
        조용히 깨집니다. 버튼에 붙이면 버블이 문제가 되지 않습니다 — 버튼 자신이 포커스를
        받고, 그 안의 <span>·<i>는 포커스를 받을 수 없기 때문입니다.

        **`onBlur={() => flushTyping()}`이지 `onBlur={flushTyping}`이 아닙니다.** 후자는
        `FocusEvent`를 인자 0번에 흘려 넣습니다. `flushTyping()`이 인자를 안 받으므로 오늘은
        무해하지만, **이 컴포넌트의 안전성 주장이 "틀리게 넘길 인자가 없다"**인데 그러면 여기
        하나가 넘기고 있는 셈이라, 누군가 시그니처를 되살리는 날 이 자리만 조용히 통과합니다.

        **onBlur는 버퍼를 확정합니다(설계 스펙 §4.2).** 닫힌 채로 버퍼가 살 수 있게 되면서
        `Tab`이 아니라 **다른 곳을 클릭해서** 떠나는 경로가 생겼고, 조용히 버리면 친 숫자가
        이유 없이 사라집니다. 팝오버 안 클릭은 여기 안 걸립니다 — `mousedown` 기본 동작을
        막아 두어(§6.3) 포커스가 트리거를 떠나지 않기 때문이고, **그게 이 규칙이 성립하는
        이유입니다.**

        ⚠️ **언마운트에서는 확정하지 않습니다** — 사라진 필드에 대한 onChange가 되기
        때문입니다(§4.2). 그 규칙은 코드가 아니라 **부재**로 지켜집니다: cleanup에서 flush를
        부르지 않고, **React는 언마운트에서 onBlur를 부르지 않습니다**(프로브로 측정 —
        포커스된 버튼을 언마운트하면 focus만 기록되고 blur는 없으며 activeElement는 body로
        갑니다). 그래서 이 핸들러와 그 규칙이 충돌하지 않습니다. tests의 "버퍼를 든 채
        언마운트되면 확정하지 않고 버린다"가 그 전제까지 함께 지킵니다. */}
    <div className="date-wheel-trigger-shell"><button id={id} ref={triggerRef} type="button" className={editing ? "date-wheel-trigger editing" : "date-wheel-trigger"} aria-label={triggerName} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popoverId : undefined} disabled={disabled} onFocus={() => { sessionStartValueRef.current = value; clearedRef.current = false; }} onBlur={() => { setEditing(false); flushTyping(); }} onClick={(event) => {
      // 맨 앞이어야 합니다 — 아래 어느 갈래로 빠지든 포커스는 트리거에 와야 합니다.
      // 근거는 positioning.ts의 헬퍼 주석(맥은 mousedown에서 포커스를 걷어갑니다).
      focusTriggerOnClick(event.currentTarget);
      // **세그먼트를 직접 누르면 그 세그먼트가 활성이 됩니다**(설계 스펙 §6.4(3)) —
      // 네이티브 날짜 필드가 그렇게 합니다. 세그먼트는 <span>이라 클릭이 여기로 그대로
      // 올라오고, 그 전에 `event.target`의 `data-unit`을 읽습니다. 구두점·아이콘·여백에는
      // 그 속성이 없으므로 **활성을 안 바꿉니다** — 클릭에는 "어느 세그먼트"라는 정보가
      // 없고, 그때는 키보드로 옮겨 둔 활성을 조용히 되돌리지 않는 쪽이 계약입니다(§6.4).
      //
      // ⚠️ 여기 `if (!open) setActiveUnit(fields[0] ?? "year")`가 있었습니다(마우스 진입을
      // 키보드 진입과 같은 열로 시딩). **SEG Task 5가 지웠습니다** — 키보드 쪽 시드와
      // 짝이었고, 닫힌 채로 `←`/`→`가 활성을 옮길 수 있게 된 지금은 둘 다 "옮겨 둔 활성을
      // 여는 순간 되돌리는" 결함입니다. 되살리지 마세요.
      //
      // `fields`로 한 번 거르는 것은 캐스팅을 피하려는 것이기도 하지만, 소비자가 런타임에
      // fields를 줄인 직후의 낡은 DOM을 클릭해도 사라진 열을 가리키지 않게 합니다.
      //
      // **세그먼트 클릭은 버퍼를 확정합니다 — `←`/`→`와 같은 "자리를 옮기는 조작"이기
      // 때문입니다**(설계 스펙 §4.2). 사용자가 "여기로 가겠다"고 했지 "이 값이다"라고 하지
      // 않았으므로, 치던 것은 원래 있던 자리에 남아야 합니다. **열림·닫힘에서 같게
      // 동작해야 합니다** — 고치기 전에는 열림에서만 (토글로 닫히며) 버려졌고 닫힘에서는
      // 살아남았습니다. 그 비대칭은 설계가 아니라 우연이었습니다.
      //
      // ⚠️ **`flushTyping()`이 활성 세그먼트가 아니라 버퍼 자신의 unit으로 확정한다는 것이
      // 바로 여기서 값을 냅니다.** 이 시점의 `activeUnit`은 아직 버퍼의 열입니다(아래
      // `setActiveUnit`은 다음 렌더에 반영됩니다). 그래서 "누른 세그먼트로 확정"을 넣으면
      // unit이 갈려 **아무것도 확정되지 않고 버퍼가 그대로 살아남습니다** — 그게 리뷰가
      // `2003-08-13`으로 잰 결함이었습니다. `flushTyping`에서 인자를 없앤 이유입니다.
      //
      // **구두점·아이콘·여백은 확정하지 않습니다.** `data-unit`이 없으면 자리를 옮기는
      // 조작이 아니라 그냥 **여는 조작**이고, 여는 조작은 버퍼를 들고 갑니다(§4.2).
      const clicked = event.target instanceof Element ? event.target.getAttribute("data-unit") : null;
      const clickedUnit = fields.find((field) => field === clicked);
      if (clickedUnit) {
        flushTyping();
        setActiveUnit(clickedUnit);
        // **세그먼트 클릭은 여닫기 토글이 아닙니다**(스펙 §6.4). 닫혀 있으면 열고, 열려
        // 있으면 **그대로 둡니다.** 세그먼트를 누르는 것은 **어디를 편집할지 고르는 일**이지
        // 컨트롤을 여닫는 일이 아닙니다 — 네이티브 날짜 필드도 숫자는 캐럿을 옮기고 달력
        // 아이콘이 달력을 여닫습니다.
        //
        // 토글이던 동안, 열린 채로 월을 눌러 월로 옮기려던 사용자가 **팝오버를 잃었습니다**
        // (오너: "마우스로 숫자를 누른다고 픽커가 닫히면 안 돼"). 옮기기는 옳게 하면서
        // 닫아 버리는 형태라 **활성 세그먼트만 보는 테스트로는 안 잡혔습니다.**
        //
        // ⚠️ **`return`이지 "아무것도 안 함"이 아닙니다.** 닫힌 채로 세그먼트를 누르면
        // **열어야** 합니다 — 그게 마우스로 이 컨트롤에 들어가는 경로입니다.
        setEditing(true);
        setOpen(true);
        return;
      }
      // 세그먼트가 아닌 곳(여백·달력 아이콘)은 그대로 토글입니다. 가르는 선은 "세그먼트를
      // 눌렀는가" 하나입니다.
      setOpen((current) => { if (!current) setEditing(true); return !current; });
    }} onKeyDown={handleFieldKey}>{/* 이 <span> 하나가 §12의 확정 신호를 재생하는 자리입니다 — key={commitPulse}가 커밋마다
        이 노드를 리마운트시켜 .dropdown-value-commit 애니메이션을 다시 틉니다.
        **key를 세그먼트로 내리지 마세요** — 확정은 날짜 하나에 대한 사건이지 세그먼트에 대한
        사건이 아닙니다. (정확히 말하면 조각이 따로 반짝이게 만드는 것은 key가 아니라 **클래스가
        어디 붙느냐**입니다 — 컨테이너가 리마운트되면 자식은 어차피 전부 새로 만들어집니다.
        아래 세그먼트의 key는 위치가 고정된 이름표일 뿐이고 commitPulse와 아무 관계가 없습니다.)

        말줄임은 css/date-picker.css의 `.date-wheel-trigger > span`이 이 컨테이너에 겁니다.
        **지금 DOM에서는 `>`를 지워도 그림이 바뀌지 않습니다** — 세그먼트는 display를 선언하지
        않은 인라인 박스이고, `overflow`·`text-overflow`·`min-width`는 non-replaced 인라인
        박스에 **적용되지 않습니다**(`white-space: nowrap`은 상속이라 `>`와 무관하게 이미
        걸립니다). 그래도 `>`를 남기는 이유는 누군가 세그먼트를 `inline-block`으로 만드는 날
        — 폭을 고정하려 들면 그렇게 됩니다 — 그때부터 세그먼트마다 말줄임이 걸려 날짜가
        "20…. 0…. 1…."처럼 조각조각 잘리기 때문입니다. 그 날은 오면 안 되지만(§4.5가 금지),
        규칙이 싸므로 남깁니다.

        `.placeholder`(css/date-picker.css의 `.date-wheel-trigger .placeholder`, 흐린 색)는
        **날짜도 버퍼도 없을 때만** 붙습니다 — 버퍼가 있으면 placeholder를 버리고 baseValue
        세그먼트를 그리기 때문입니다(§4.5). 판정은 문구와 같은 validDateValue(model.isValid)입니다. */}
      <span className={[triggerParts ? "" : "placeholder", commitPulse ? "dropdown-value-commit" : ""].filter(Boolean).join(" ")} key={commitPulse}>{triggerParts
        ? triggerParts.map((part, index) => part.unit === null
          ? <span className="date-wheel-punctuation" aria-hidden="true" key={`gap${index}`}>{part.text}</span>
          /* 활성 표시는 resolvedActiveUnit으로 판정합니다(원본 activeUnit이 아니라) — 소비자가
             런타임에 fields를 줄이면 activeUnit이 사라진 열을 계속 가리키고, 그러면 어느
             세그먼트도 활성이 아니게 되어 닫힌 채로 트리거에 활성 표시가 통째로 사라집니다.
             `.active` 클래스 자체는 포커스와 무관하게 붙고, **감추는 일은 CSS가 합니다**
             (`.date-wheel-trigger:focus-within` — §4.5: 포커스 없는 필드에 활성 표시가 남으면
             그 필드가 입력을 받는 중으로 읽힙니다). */
          : <span className={`date-wheel-segment${resolvedActiveUnit === part.unit ? " active" : ""}`} data-unit={part.unit} key={part.unit}>{part.text}</span>)
        : labels.placeholder}</span><i className="date-wheel-trigger-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm2-2v4m10-4v4M3 9h18" /></svg></i></button></div>
    {/* onMouseDown의 기본 동작을 막는 것이 §6.2의 불변식("키보드를 받는 동안
        activeElement는 언제나 트리거")을 **팝오버 쪽에서** 지키는 장치입니다 — 설계 스펙 §6.3.
        포커스 이동과 텍스트 선택이 mousedown의 기본 동작입니다. `click`은 그대로
        발생하므로 안의 모든 버튼(±·행·오늘·비우기·완료)이 계속 동작합니다.
        표준 콤보박스 구현이 쓰는 방법입니다.

        ⚠️ **여기 한동안 "`tabIndex={-1}`인 버튼도 클릭하면 포커스를 받습니다"라고 적혀
        있었고, 그것이 §6.2 불변식의 나머지 절반이었습니다. 그 문장은 Windows에서만
        참입니다.** macOS 브라우저는 버튼을 클릭해도 포커스를 주지 않아서, 맥에서는
        팝오버를 열어도 `activeElement`가 `body`에 남고 **키가 하나도 안 닿았습니다**
        (오너 캡처 2026-08-11: `click target=button.date-wheel-trigger` → `keydown …
        tgt=body` `처리됨=N`). 이 절반은 이제 트리거의 `onPointerDown`이 명시적으로
        지킵니다 — `positioning.ts`의 `focusTriggerOnPointerDown`. **막는 것만으로는
        불변식이 성립하지 않습니다. 옮기는 쪽도 있어야 합니다.**

        ⚠️ **`pointerdown`이 아니라 `mousedown`이어야 합니다.** 스와이프가
        `pointerdown` → `setPointerCapture` → `pointermove` 사슬이고 열은
        `touch-action: none`입니다(css/date-picker.css). `pointerdown`을 막으면 그 사슬을
        건드립니다. `mousedown`은 포인터 이벤트보다 **뒤**에 오고(터치에서는 `touchend`
        뒤의 호환 이벤트) 포인터 캡처는 이미 걸린 뒤입니다.

        ⚠️ PRINCIPLES §5의 passive 함정과는 **다른 자리**입니다 — 그 조항은
        `wheel`·`touchstart`·`touchmove`에 대한 것이고 `mousedown`은 passive로 등록되지
        않으므로 여기서 preventDefault가 실제로 먹습니다. */}
    {open && position && createPortal(<div ref={popoverRef} id={popoverId} className="date-wheel-popover dropdown-menu-surface" role="dialog" aria-modal="false" aria-label={`${ariaLabel} ${labels.select}`} onMouseDown={(event) => event.preventDefault()} style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width, maxHeight: position.maxHeight }}>
      {/* 보이는 머리말만 `heading`으로 갈립니다 — 위 `aria-label`과 `triggerName`은 계속
          `ariaLabel`을 씁니다(§11). 안 넘기면 둘이 같은 값이라 지금까지와 동일합니다. */}
      <div className="date-wheel-heading"><strong>{heading ?? ariaLabel}</strong><span>{labels.hint}</span></div>
      <div className="date-wheel-columns" data-fields={columns.length}>
        {/* 열은 **포커스를 받지 않고 키도 받지 않습니다**(설계 스펙 §5·§6.2) — `tabIndex`가
            없고 `onKeyDown`도 없습니다. 활성 표시는 `resolvedActiveUnit`이 붙이는 `.active`
            클래스 하나로만 그려집니다. css/date-picker.css의 `.date-wheel-column:focus-visible`
            선택자는 **남겨 둡니다** — 지우면 다음에 열을 포커스 가능하게 되돌릴 때 표시가
            조용히 사라집니다(스펙 §5).

            `onPointerDown`의 `setActiveUnit(unit)`이 **포인터 경로가 활성 세그먼트를 따라가는
            유일한 길**입니다(열의 `onFocus`가 하던 일). 지우지 마세요. */}
        {columns.map((unit) => { const motion = columnMotion[unit]; return <section className={`date-wheel-column${resolvedActiveUnit === unit ? " active" : ""}${entering ? " entering" : ""}${motion.playing ? ` moving-${motion.direction}` : ""}`} aria-label={`${labels.units[unit]} ${model.label(baseValue, unit, labels.weekdays)}`} role="group" onWheel={(event) => handleWheel(event, unit)} onPointerDown={(event) => { setTyping(null); if (!isPrimaryButton(event)) return; setActiveUnit(unit); suppressColumnClickRef.current = false; if (startsOnStepControl(event.target)) return; clearColumnMotion(unit); swipeRef.current = { unit, y: event.clientY, pointerId: event.pointerId, value: baseValue, captured: false }; }} onPointerMove={(event) => moveSwipe(unit, event.clientY, event.pointerId, event.buttons, event.currentTarget)} onPointerUp={(event) => finishSwipe(unit, event.clientY, event.pointerId, event.currentTarget)} onPointerCancel={(event) => { swipeRef.current = null; clearSwipeVisual(event.currentTarget); releaseColumnClickSuppression(); }} onClickCapture={(event) => { if (suppressColumnClickRef.current) { event.preventDefault(); event.stopPropagation(); } }} key={unit}>
          <button type="button" className="date-wheel-step" tabIndex={-1} aria-label={`${labels.units[unit]} ${labels.previous}`} disabled={!shifted(unit, -1)} onClick={() => applyShift(unit, -1)}><svg viewBox="0 0 16 16"><path d="m3.5 10 4.5-4 4.5 4" /></svg></button>
          {/* 행은 tab 순서에 들어가지 않습니다 — ↑/↓가 같은 일을 하고, 열당 5개씩이라
              날짜 하나를 지나가는 데 Tab을 15번 눌러야 했습니다. 값이 바뀔 때마다 이
              컨테이너의 key가 바뀌어 행이 통째로 리마운트되므로 포커스를 둘 수도 없습니다. */}
          <div className="date-wheel-viewport"><div className="date-wheel-values" key={`${unit}-${motion.sequence}`}>{DATE_WHEEL_OFFSETS.map((offset) => { const rowValue = shifted(unit, offset); const preloadOnly = Math.abs(offset) === 3; const buffered = offset === 0 && resolvedTyping?.unit === unit ? resolvedTyping.digits : null; return <button type="button" className={offset === 0 ? "selected" : ""} disabled={!rowValue} tabIndex={-1} aria-hidden={preloadOnly || undefined} aria-current={offset === 0 ? "date" : undefined} onClick={() => rowValue && applyShift(unit, offset)} key={offset}>{buffered ?? (rowValue ? model.label(rowValue, unit, labels.weekdays) : "—")}</button>; })}</div></div>
          <button type="button" className="date-wheel-step" tabIndex={-1} aria-label={`${labels.units[unit]} ${labels.next}`} disabled={!shifted(unit, 1)} onClick={() => applyShift(unit, 1)}><svg viewBox="0 0 16 16"><path d="m3.5 6 4.5 4 4.5-4" /></svg></button>
        </section>; })}
      </div>
      {/* setTyping(null)을 먼저 부르는 이유는 handleShortcut의 Ctrl+;/Delete 분기와 같다 —
          이 버튼들은 그 단축키의 동등물이므로(title에 단축키를 적어 뒀다), 버퍼를 안 지우면
          같은 뜻의 단축키와 버튼이 다르게 굴며, 남은 버퍼가 이 버튼이 방금 설정한 값을
          나중에(예: 다음 Tab) 도로 덮어쓸 수 있다. */}
      <div className="date-wheel-actions"><button type="button" tabIndex={-1} title={`${labels.today} (Ctrl+;)`} aria-keyshortcuts="Control+; Meta+;" onClick={() => { setTyping(null); commitToday(); }}>{labels.today}</button>{allowClear && <button type="button" tabIndex={-1} title={`${labels.clear} (Delete)`} aria-keyshortcuts="Delete" onClick={() => { setTyping(null); clearedRef.current = true; onChange(""); }}>{labels.clear}</button>}<button type="button" tabIndex={-1} className="primary" aria-keyshortcuts="Enter" onClick={commitAndClose}>{labels.done}</button></div>
    </div>, document.body)}
  </div>;
}

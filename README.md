# kkqq-ui-basic-kit

React + 순수 CSS로 짠 컴포넌트 모음입니다.
빌드 단계도, 런타임 의존성도 없습니다. 소스를 그대로 내보냅니다.

- 드롭다운 (`Select`)
- 휠 피커 (`DateWheelPicker` · `TimeWheelPicker`) — 같은 기계를 쓰고 구간만 나눠 갖습니다
- 접이식 사이드바 + 앱 셸 + 모바일 빠른 바 (`Sidebar`, `AppShell`, `MobileQuickBar`)
- 모달 다이얼로그 (`Dialog`, `DialogHeading`, `DialogActions`)
- 섹션 탭 (`SectionTabs`)
- 페이지 뼈대 (`PageHeader`, `SummaryCard`, `Panel`)
- 자동 확장 텍스트영역 (`AutoGrowTextarea`)
- 세그먼트 컨트롤 (`SegmentedControl`) — 값 하나를 몇 개 중에서 고르는 묶음
- 색상 토큰 편집기 (`ThemeColorEditor`) — 사용자가 팔레트를 직접 바꿉니다
- 디자인 토큰 + 라이트/다크 테마 + Pretendard Variable (SIL OFL 1.1)
- **[PRINCIPLES.md](PRINCIPLES.md)** — 왜 그렇게 만들었는지에 대한 계약
- **[CUSTOMIZING.md](CUSTOMIZING.md)** — 프로젝트마다 무엇을 프롭·토큰으로 갈아 끼우는지(색·연월 픽커 등)

필요한 것: React 18 이상. 그 외 런타임 의존성 없음.

---

## 설치

**이 저장소는 공개입니다 — 복사하지 말고 그냥 설치하세요.**

```bash
npm i github:kkqq9320/kkqq-ui-basic-kit
```

자격증명이 필요 없으므로 컨테이너·CI·다른 PC 어디서든 그대로 빌드됩니다.
npm 레지스트리에는 올리지 않습니다(`package.json`의 `private: true`) — 설치
경로는 위 GitHub 지정자입니다.

**CSS를 한 번 import 합니다.** (앱 진입점)

```ts
import "kkqq-ui-basic-kit/css/index.css";
```

**컴포넌트를 씁니다.**

```tsx
import { Select, DateWheelPicker, Dialog } from "kkqq-ui-basic-kit";
```

끝입니다. `fonts/`의 폰트는 `css/fonts.css`가 상대 경로로 참조하므로 번들러가
알아서 해시·복사합니다.

> **CSS import에서 타입 에러가 난다면** — `TS2882: Cannot find module or type
> declarations for side-effect import of 'kkqq-ui-basic-kit/css/index.css'` —
> 소비 프로젝트에 `*.css` 앰비언트 선언이 없는 것입니다. `tsconfig.json`에
> `"types": ["vite/client"]`를 넣거나 `declare module "*.css";` 한 줄을 두세요.
> 키트 쪽 문제가 아니라 소비 프로젝트의 타입 설정입니다.

> **Vite에서 확인했습니다.** 새 Vite+React 앱에 설치본을 넣고 dev·`vite build`·
> `tsc --noEmit`이 모두 통과하는 것을 확인했습니다 — `node_modules` 안의 `.tsx`가
> 변환되고, CSS와 폰트가 번들에 실리고, 타입도 `src/`에서 그대로 해석됩니다.
>
> 다만 이 키트는 **소스를 그대로 내보내고 빌드 단계가 없습니다**(`exports`의 `.`이
> `./src/index.ts`를 가리킵니다). `node_modules` 안의 TypeScript를 컴파일하지 않는
> 번들러 — 기본 설정의 Next.js(`transpilePackages` 필요), CRA 등 — 에서는 그 설정을
> 열어 주거나 키트에 빌드 단계를 넣어야 합니다. **그쪽은 확인하지 않았습니다.**

### 키트를 고쳐야 할 때 — 받은 걸 고치지 말고 저장소에서 고칩니다

> ⚠️ **`node_modules/kkqq-ui-basic-kit/`를 직접 고치지 마세요.** 다음 `npm install`
> 이나 `npm ci` 한 번에 **아무 경고 없이 사라집니다.** 흔적도 안 남고
> "어제는 됐는데"만 남습니다.

고칠 일이 생기면 순서는 이렇습니다.

**1. 키트 저장소에서 고칩니다.** 데모(`npm run dev`)와 테스트(`npm test`)가 여기
있으므로, 고친 걸 실제로 확인할 수 있는 자리도 여기뿐입니다. 프로젝트마다 달라야 하는
것은 대부분 프롭·CSS 토큰으로 해결됩니다 — 손대기 전에
[CUSTOMIZING.md](CUSTOMIZING.md)를 먼저 보세요.

**2. 커밋하고 push한 뒤, 릴리스에 태그를 답니다.** 이 저장소는 **버전을 태그로
답니다** — 태그가 붙어야 소비 프로젝트가 걸 자리가 생깁니다.
[CHANGELOG.md](CHANGELOG.md)에 그 규칙과 지금까지의 릴리스가 있습니다.

**3. 소비 프로젝트의 참조를 새 태그로 올립니다.**

```bash
npm i github:kkqq9320/kkqq-ui-basic-kit#v<최신-태그>
```

`<최신-태그>`가 지금 무엇인지는 [CHANGELOG.md](CHANGELOG.md) 맨 위나
[릴리스 목록](https://github.com/kkqq9320/kkqq-ui-basic-kit/releases)을 보세요.
**여기에 번호를 적어 두지 않는 이유**는 이 문서가 릴리스마다 고쳐지지 않아서입니다.

**고침만 자동으로 받고 싶으면 범위로 겁니다.**

```bash
npm i "github:kkqq9320/kkqq-ui-basic-kit#semver:^0.X.0"
```

`X`에는 머무를 minor를 적습니다. 예를 들어 `^0.6.0`은 `>=0.6.0 <0.7.0`입니다 —
이 저장소는 `0.x`에서 **minor 자리가 breaking 자리**이므로, 이 범위는 고침(patch)만
받고 깨지는 변경은 안 받습니다. **npm 레지스트리에 올리지 않아도 됩니다** — npm이
저장소의 태그를 직접 읽습니다.

> ⚠️ **범위 형태는 따옴표로 감싸세요.** `cmd.exe`에서 따옴표 없이 쓰면 `^`가
> **말없이 먹혀서** `#semver:0.6.0`이 됩니다 — 그건 여전히 유효한 지정자라 에러가 안
> 나고, 범위를 걸었다고 생각한 채 **0.6.0 한 버전에 고정**됩니다. 태그 형태(`#v0.6.0`)
> 에는 `^`가 없어 따옴표가 필요 없습니다.

**어느 형태로든 핀을 박아 두는 이유는 같습니다.** 키트가 앞서 나가도 소비 프로젝트가
**자기가 정한 시점에만** 따라갑니다 — 브랜치 이름으로 걸어 두면 남의 커밋이 예고 없이
들어옵니다.

**고치는 동안에는 로컬 링크를 씁니다.** push하고 태그를 달고 핀을 올리는 왕복 없이 —
아직 태그가 안 붙은 고침이라도 — 키트를 고치면 소비 앱에 곧바로 반영됩니다:

```bash
npm i file:../kkqq-ui-basic-kit
```

### ⚠️ 필수 전제: 앱이 `#root`에 마운트돼야 합니다

모바일(760px 이하 또는 coarse 포인터)에서 이 시스템은 문서 스크롤을 끄고
**`#root`를 세로 스크롤 호스트로** 씁니다. 마운트 지점 id가 다르면
**모바일에서 콘텐츠가 스크롤되지 않습니다. 에러는 나지 않습니다.**

다른 id를 쓴다면 세 곳을 함께 바꾸세요:

1. `css/tokens.css` 맨 아래 미디어 쿼리의 `#root` 선택자
2. `src/SectionTabs.tsx`의 `document.getElementById("root")`
3. `Select`가 부르는 `captureScrollSnapshot()` — `src/positioning.ts`의
   `scrollRootId` 기본값. `useScrollDirectionHidden(id)`도 같은 인자를 받습니다.

Next.js App Router처럼 마운트 지점을 직접 정할 수 없는 환경이라면,
`#root` 대신 실제 래퍼 선택자(예: `body > div:first-child`)로 바꾸는 편이 빠릅니다.

### 골라 쓰기

`css/index.css` 대신 필요한 파일만 import 해도 됩니다. 단:

- `tokens.css`는 **항상 먼저** 와야 합니다.
- `select.css`와 `wheel-picker.css`는 `surfaces.css`를 필요로 합니다.
- `tabs.css`의 모바일 배치는 `page.css`의 `.workspace`(`position: relative`)를
  부모로 가정합니다.
- `Button`의 옷은 **`controls.css`** 에 있습니다.
- `SectionHeading`의 스타일은 **`page.css`** 에 있습니다(`tabs.css`가 아닙니다) —
  탭이 아니라 페이지 뼈대의 일부라서입니다(`PRINCIPLES.md` §7·§15).

### 폰트를 바꾸려면

**아무것도 지우지 마세요.** 킷은 `node_modules`에서 오고 거기서 지운 것은 다음
`npm install`에 사라집니다. 그리고 `css/index.css`가 `fonts.css`를 `@import` 하므로
파일이 없어지면 그 경로 자체가 깨집니다.

대신 **`index.css` 대신 개별 파일을 import 하고 `fonts.css`만 뺍니다.** 그다음 자기
`:root`에서 `--font-family-base`를 덮어씁니다 — 나머지는 전부 이 변수를 참조합니다.

```js
import "kkqq-ui-basic-kit/css/tokens.css";    // 항상 먼저
import "kkqq-ui-basic-kit/css/surfaces.css";  // select·date-picker가 이걸 필요로 합니다
import "kkqq-ui-basic-kit/css/controls.css";
import "kkqq-ui-basic-kit/css/dialog.css";
import "kkqq-ui-basic-kit/css/select.css";
import "kkqq-ui-basic-kit/css/wheel-picker.css";
import "kkqq-ui-basic-kit/css/tabs.css";
import "kkqq-ui-basic-kit/css/sidebar.css";
import "kkqq-ui-basic-kit/css/page.css";
import "kkqq-ui-basic-kit/css/theme-editor.css";
import "./my-fonts.css";                      // :root { --font-family-base: ... }
```

**왜 굳이 그러느냐 — 실측**(v0.4.0을 빈 프로젝트에 설치해 `vite build`):

| import 방식 | 번들에 나온 woff2 | CSS |
|---|---|---|
| `css/index.css` 하나 | **2,057,688 B** | 48,391 B |
| 위처럼 개별 import, `fonts.css` 제외 | **없음** | 48,283 B |

`--font-family-base`만 덮어쓰고 `index.css`를 계속 써도 **화면은 맞습니다** —
`@font-face`가 아무도 쓰지 않는 패밀리를 선언할 뿐입니다. 다만 **2.0MB는 그대로
나갑니다.** 번들러는 그 패밀리가 실제로 쓰이는지 보지 않고 `url()`을 따라갑니다.

> **폰트 파일 자체는 어느 쪽이든 설치됩니다.** `package.json`의 `files`에 `fonts`가
> 있어서 패키지에 들어갑니다(`npm pack` 실측: 36파일 · unpacked 2.58MB, 그중
> `fonts/PretendardVariable.woff2`가 2,009KB). **골라서 안 받을 방법은 없습니다.**
> 안 쓰면 `node_modules`에 놓여 있기만 하고 — **브라우저는 요청하지 않고**
> (`@font-face`가 없으니) **빌드 산출물에도 안 들어갑니다.** 디스크만 쓰고
> 사용자에게 전송되는 바이트는 0입니다.

번들되는 건 **Pretendard Variable** 한 벌(`fonts/PretendardVariable.woff2`,
2.0MB)입니다. 가변 폰트라 45~920 굵기가 전부 진짜 글리프로 나옵니다.

#### 폰트를 바꾸면 다시 재야 하는 것 둘

`css/fonts.css`에는 `@font-face` 블록 **하나뿐**이라 그 파일을 안 읽어서 잃는 것은
프리텐다드 자신뿐입니다. 다만 **파일 밖에 두 가지가 이 폰트에 기대고 있습니다.**

**1. 굵기가 진짜로 있어야 합니다.** `tokens.css`가 `font-synthesis: none`이라
브라우저가 **가짜 볼드를 만들지 않습니다.** 킷이 쓰는 굵기는 `45 · 400 · 600 · 700 ·
800`이고, 바꿔 넣은 폰트에 그 글리프가 없으면 **그냥 안 굵어집니다**(에러도 경고도
없습니다). 특히 **45**는 정적 폰트에는 대개 아예 없습니다. 가변 폰트를 쓰면 이 문제가
없어집니다.

**2. `DateWheelPicker`의 빈 자리 채움 문자가 폰트에 의존합니다.** 채움 문자는
**U+2012 FIGURE DASH**이고, 프리텐다드에서 tabular 숫자와 **폭이 정확히 같아서**
고른 것입니다(실측, 단위 = 폰트 units / unitsPerEm 2048):

```
wght  45 : 숫자 1132 · U+2012 1132  (±0)
wght 400 : 숫자 1258 · U+2012 1258  (±0)
wght 700 : 숫자 1341 · U+2012 1341  (±0)
wght 930 : 숫자 1404 · U+2012 1404  (±0)
```

`.wheel-segment`가 거는 `font-variant-numeric: tabular-nums`는 OpenType `tnum`으로
매핑되고 **`tnum`은 숫자 글리프에만** 적용됩니다 — 즉 저 등폭은 CSS가 보장하는 것이
아니라 **그 폰트의 성질**입니다. 바꿔 넣은 폰트가 (a) U+2012을 cmap에 갖고 있지 않으면
그 한 글자만 폴백 폰트로 새고, (b) 갖고 있어도 폭이 다르면 어긋납니다.

**눈으로 보는 법:** 날짜 피커에서 연도를 **한 자리만** 치고 뒤 세그먼트가 좌우로
밀렸다 돌아오는지 보세요. 밀리면 그 폰트에서는 등폭이 성립하지 않는 것입니다
(프리텐다드에서 밑줄 `_`을 쓰면 15px 기준 빈 자리당 약 2.8px, 연도 입력 중 5.7px
밀립니다 — 그래서 밑줄이 아니라 U+2012입니다).

> 라이선스는 SIL Open Font License 1.1(`fonts/OFL.txt`)입니다. 재배포·웹임베딩
> 모두 허용되고, 조건은 그 라이선스 파일을 폰트와 함께 두는 것뿐입니다.
> 위처럼 **import만 안 하는 경우는 해당 없습니다** — 폰트가 번들에 안 실리니
> 재배포하는 것이 없습니다. 킷을 자기 패키지로 **다시 묶어 배포**하면서 폰트를
> 빼실 거면 그때 `OFL.txt`도 같이 빼세요.

---

## 컴포넌트

### Button

```tsx
<Button variant="primary" onClick={save}>저장</Button>
<Button onClick={cancel}>취소</Button>            {/* 생략하면 secondary */}
<Button variant="danger" onClick={remove}>삭제</Button>
<Button variant="text" onClick={add}>+ 새로 만들기</Button>

<div className="action-row">
  <Button onClick={cancel}>취소</Button>
  <Button variant="danger" onClick={remove}>삭제</Button>
  <Button variant="primary" onClick={save}>저장</Button>
</div>
```

**종류는 `variant` 한 축입니다** — `primary` · `secondary`(기본) · `danger` · `text`.
한 축에 값 하나라 뜻 없는 조합이 표현되지 않습니다(PRINCIPLES §16).

- **`type`은 기본이 `"button"`입니다.** 폼 안에서 `<button>`의 기본값은 `submit`이라,
  취소 버튼이 폼을 보내는 사고가 납니다. 정말 제출 버튼이면 `type="submit"`을 주세요.
- **`size`는 안 줘도 됩니다.** §2의 계층은 문맥이 정합니다 — 다이얼로그·휠 팝오버 안이면
  32px입니다. 그 밖에서 조밀하게 쓰려면 `size="compact"`.
- `className`은 킷 클래스를 **덮지 않고 합쳐집니다**(§14). 나머지 props는 그대로
  `<button>`에 갑니다(`disabled`·`aria-*`·`ref`·핸들러).
- 액션 줄은 `className="action-row"`입니다(오른쪽 정렬, 8px 간격).

🔴 **액션 줄은 자식을 칠하지 않습니다.** 예전에는 통이 "행 안의 버튼 중 primary가 아닌
것"을 대신 칠했는데, 그 규칙이 더 구체적이라 **삭제 버튼의 위험 색을 덮어썼습니다.**
이제 각 버튼이 자기 종류를 말합니다 — 줄 안에 날 `<button>`을 넣으면 **브라우저 기본
버튼**이 나옵니다. `DialogActions` 안도 같습니다.

⚠️ **아이콘 전용 버튼은 아직 여기 없습니다.** 킷의 아이콘 버튼은 기하가 다섯으로 갈리고
전부 문맥에 매여 있어(38×38 · 32×32 · 28×32 · 28×28 · 100%×30) 한 prop으로 덮으면 계약이
다섯 배가 됩니다. `<a>`를 버튼 모양으로 쓰는 갈래도 아직 없습니다.

### Select

```tsx
<Select
  ariaLabel="통화"              // 필수
  value={currency}
  options={[{ value: "krw", label: "원화" }, { value: "usd", label: "달러", disabled: true }]}
  onChange={setCurrency}
  placeholder="선택하세요"        // 기본값
  align="left"                   // "left" | "center"
  disabled={false}
  portal={false}                 // 아래 설명 참고
/>
```

아래 공간이 좁으면 자동으로 위로 열립니다. 바깥 클릭·Escape·**뒤로가기**로 닫히고,
선택하면 포커스가 트리거로 돌아가되 **화면은 움직이지 않습니다**(모바일 대응).

**열릴 때 선택된 옵션으로 자동 스크롤됩니다.** 옵션이 많으면(예: 51개짜리 목록) 선택된
항목이 화면 밖에 있을 수 있는데, 그러면 아무것도 선택 안 된 것처럼 보여 사용자가
실수로 선택을 지우게 됩니다. `scrollIntoView()`는 조상 스크롤 컨테이너까지 움직여
다이얼로그 뒤 페이지가 튈 수 있으므로 쓰지 않고, **메뉴 자신의 `scrollTop`만** 옮깁니다.
이미 첫 화면에 보이면 그대로 두고, 안 보이면 화면 가운데로 옮기되 목록 끝을 넘기지
않습니다. 선택이 없으면(placeholder) 손대지 않습니다.

다이얼로그 안에서 열면 뒤로가기가 **드롭다운만** 닫고 다이얼로그는 남깁니다
(표식이 스택이라 위에서부터 닫힘). 이게 없으면 뒤로가기 한 번에 다이얼로그가
통째로 닫혀 입력 내용이 날아갑니다.

#### `portal` — 메뉴가 잘릴 때

기본값에서 메뉴는 트리거 안에 `absolute`로 붙습니다. 조상 중에 **overflow를 자르는
요소**가 있으면 메뉴가 잘립니다. `portal`을 켜면 `document.body`에 `fixed`로 나가고
스크롤·리사이즈·가상 키보드를 따라 좌표를 다시 잡습니다(z-index 450).

이런 자리에서는 **반드시** 켜세요:

- `Sidebar`의 `slot` — 접기 애니메이션 때문에 `overflow: hidden`이고, 모바일에서는
  사이드바 자체가 `overflow-y: auto`입니다
- `overflow: auto`인 스크롤 카드·패널·테이블 래퍼 안
- `transform`이나 `filter`가 걸린 조상 안 (새 스태킹 컨텍스트가 생깁니다)

```tsx
<Sidebar slot={<Select ariaLabel="작업 공간" value={ws} options={list} onChange={setWs} portal />} ... />
```

### DateWheelPicker · TimeWheelPicker

둘은 **같은 기계를 쓰는 래퍼**이고 다른 것은 두 가지뿐입니다 — 기본 `fields`와
허용 구간. `DateWheelPicker`는 **날짜 쪽에서 시작하는** 구간(기본 연·월·일,
`["year","month","day","hour","minute"]`처럼 시각을 뒤에 붙일 수 있습니다),
`TimeWheelPicker`는 **시각 쪽에서 시작하는** 구간(기본 시·분)입니다. 겹치는 조합이
없어서 같은 일을 하는 방법이 둘 생기지 않습니다 — 반대쪽 구간을 주면 개발 모드에서
경고합니다(던지지는 않습니다).

```tsx
<TimeWheelPicker ariaLabel="예약 시각" value={time} onChange={setTime} />
<TimeWheelPicker ariaLabel="알람" value={alarm} onChange={setAlarm} step={{ minute: 15 }} />
```

```tsx
<DateWheelPicker
  ariaLabel="거래 날짜"           // 필수 — 팝오버 머리말로도 그려집니다
  heading="날짜"                  // 선택 — 머리말만 짧게 쓰고 싶을 때
  value={date}                   // "YYYY-MM-DD" 또는 ""
  onChange={setDate}
  min="2026-01-01" max="2026-12-31"
  fields={["year", "month", "day"]}  // 기본값. 표시할 열
  allowClear                     // "비우기" 버튼 노출
  timeZone="Asia/Seoul"          // "오늘"의 기준
  labels={{ placeholder: "Pick a date", /* 필요한 키만 */ }}
/>
```

#### `fields` — 연·월 픽커

`fields`로 열을 줄이면 같은 컴포넌트가 **연·월 픽커**(또는 연도만 픽커)가 됩니다.
네이티브 `<input type="month">`를 따로 쓰지 마세요.

```tsx
<DateWheelPicker ariaLabel="예산 월" value={month} onChange={setMonth} fields={["year", "month"]} />
```

- **값 형식은 그대로 `YYYY-MM-DD`.** 빠진 열은 `01`로 정규화됩니다(일 없으면 일=01,
  월 없으면 월=01). `onChange`는 늘 완전한 ISO 날짜를 냅니다 — `min`/`max`가 전부
  풀 ISO 날짜인 소비 코드와 문자열 비교가 어긋나지 않게 하려는 것입니다.
  월만 필요하면 소비 쪽에서 `value.slice(0, 7)` 하세요.
  (직접 넘긴 값의 일(day)은 사용자가 열을 바꾸기 전까지 그대로 표시·유지되고,
  값을 바꾸는 순간 `01`로 정규화됩니다.)
- **`min`/`max`는 남은 최소 단위로 비교합니다.** 연·월 픽커면 "월" 단위입니다 —
  예산이 `min="2026-07-15"`처럼 월 중간부터 시작해도 **7월 전체가 선택 가능**합니다
  (일을 01로 고정한 채 풀 문자열로 비교하면 7월이 잘못 막힙니다).
- 트리거 문구도 열에 맞춰 짧아집니다(`2026. 07.`). 그리드 트랙 수는 `data-fields`로
  따라오므로 CSS를 새로 짤 필요가 없습니다.

기본 라벨은 한국어입니다. 영어로 쓰려면:

```tsx
labels={{
  placeholder: "Pick a date", hint: "Scroll, swipe, arrow keys, or type digits · Ctrl+; today",
  today: "Today", clear: "Clear", done: "Done",
  previous: "previous", next: "next", select: "picker",
  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  // ⚠️ units는 **여섯을 다 줘야 합니다** — 연·월·일만 그리는 픽커여도 그렇습니다.
  // 이 병합만 키마다 펼쳐지므로 셋만 주면 나머지 셋이 한국어로 남아 열의
  // aria-label로 **스크린리더에 나갑니다**(화면에는 안 보입니다). 타입도 거절합니다.
  units: { year: "Year", month: "Month", day: "Day", hour: "Hour", minute: "Minute", second: "Second" },
}}
```

최상위 키는 **필요한 것만** 주면 됩니다. `weekdays`·`meridiem`·`today`·`now`는 그리지
않는 모델이면 아예 안 줘도 됩니다 — `DurationWheelPicker`가 그렇습니다(씨앗 버튼도
오전/오후도 요일도 없습니다).

#### 키보드

네이티브 `<input type="date">`처럼 동작합니다. **세그먼트는 팝오버의 열이 아니라
트리거에 있습니다** — 연·월·일이 트리거 안에서 각각 자리를 갖고, 숫자를 치면 활성
세그먼트에 들어가며 자릿수가 차면 다음 세그먼트로 저절로 넘어갑니다. **그래서
팝오버를 열지 않고도 값을 고칠 수 있습니다.** 세그먼트 개수는 `fields`에 따라 1~3개로
달라지므로 아래 표는 "연·월·일"이 아니라 **첫 세그먼트 / 마지막 세그먼트**로 규칙을
씁니다.

**키는 언제나 트리거가 받습니다 — 팝오버가 열려 있어도 그렇습니다.** 팝오버 안에는
tab 정거장이 하나도 없고, 이 컨트롤은 폼에서 **정거장 하나**입니다.

| 상태 | 키 | 동작 |
|---|---|---|
| 닫힘·열림 | `0`~`9` | 활성 세그먼트에 입력. 자릿수가 차면 **다음 세그먼트로 저절로** |
| 닫힘·열림 | `Backspace` | 입력 버퍼에서 한 자리 지우기 |
| 닫힘·열림 | `→` | 다음 세그먼트. **마지막에서는 제자리** |
| 닫힘·열림 | `←` | 이전 세그먼트. **첫 번째에서는 제자리** |
| 닫힘·열림 | `Tab` `Shift+Tab` | **버퍼를 확정하고, 열려 있으면 닫고, 컨트롤을 떠남** |
| 닫힘·열림 | `Delete` | 값 전체 비우기. **`allowClear`일 때만** |
| 닫힘·열림 | `Ctrl+;` (macOS `Cmd+;`) | 오늘로 설정 |
| 닫힘 | `↓` `↑` `Enter` `Space` | **연다.** 활성 세그먼트도 치던 버퍼도 그대로 |
| 닫힘 | `Escape` (버퍼 있음) | 버퍼를 버림. **전파를 멈춤** |
| 닫힘 | `Escape` (버퍼 없음) | **아무것도 하지 않고 전파시킴** |
| 열림 | `↑` `↓` | 활성 세그먼트의 값 ±1 |
| 열림 | `Enter` `Space` | **완료** — 값 확정, 닫음 |
| 열림 | `Escape` | 버퍼를 버리고, 값을 바꾸지 않고 닫음 |

드롭다운과 날짜 피커의 `Tab`은 **같습니다** — 둘 다 컨트롤을 떠납니다. 자리를 옮기는
일은 `←`/`→`가 전담합니다(이유는 PRINCIPLES §11). `Home`/`End`는 드롭다운에만
있습니다 — 연도 세그먼트에는 끝이 없어 뜻이 정해지지 않기 때문입니다.

치다 만 숫자는 **자리를 지켜** 그려집니다(`20‒‒. 07. 12.`). 채움 문자는 `‒`(U+2012
FIGURE DASH)이고 밑줄이 아닙니다 — 번들 폰트에서 이 문자의 어드밴스가 tabular 숫자와
정확히 같아서, 치는 동안 뒤 세그먼트가 밀렸다 돌아오지 않습니다. 밑줄(`_`)은 숫자가
아니라 `tabular-nums` 치환을 못 받아 약 19% 좁습니다. **폰트를 갈아끼우면
이 보장이 깨질 수 있습니다**(`css/fonts.css`). 트리거의 접근성 이름은
`"${ariaLabel}, ${보이는 값}"`이고(`"거래 날짜, 2026. 07. 12."`), **채움 문자만
빼고** 읽힙니다(`"거래 날짜, 20. 07. 12."`).

> ⚠️ **닫힌 날짜 필드가 치던 숫자를 들고 있으면 첫 `Escape`를 먹습니다.** 치던 숫자를
> 취소하려고 누른 `Escape`가 폼을 통째로 닫으면 안 되기 때문입니다. 그래서 그 필드에
> 포커스가 있는 동안에는 감싼 다이얼로그가 **첫 `Escape`에 안 닫히고 두 번째에
> 닫힙니다.** 버퍼가 없으면 그대로 흘려보내므로 평소에는 한 번에 닫힙니다.

`disabled`가 켜지면 **열려 있던 팝오버가 닫힙니다.** 잠긴 필드 위에 조작 가능해 보이는
팝오버를 남기지 않으려는 것입니다 — 키만 막으면 휠·스와이프·± 버튼은 계속 값을
바꿉니다. 값은 확정하지 않습니다(비활성화는 사용자의 "완료"가 아닙니다). 다만 **치다
만 숫자가 어떻게 되는지는 아직 미해결입니다** — 실브라우저는 비활성이 된 트리거를
blur하고 이 컨트롤은 `blur`에서 버퍼를 확정하므로, 그 경로가 이기면 버려지는 대신
확정될 수 있습니다. jsdom에서는 그 blur가 나지 않아 판정할 수 없습니다.

`Ctrl+;`는 주요 브라우저에서 비어 있다는 관례에 기댄 단축키입니다. **Windows에서
실기기로 확인했습니다(2026-08-09) — 브라우저가 가져가지 않고 페이지에 도달합니다.
macOS `Cmd+;`도 실기기로 확인했습니다(2026-08-11) — 동작합니다.** 맥에서 안 되던
원인은 조합이 아니라 **포커스**였습니다: 맥 브라우저는 `mousedown`의 기본 동작으로
버튼에서 포커스를 걷어내서, 키가 트리거에 아예 닿지 않고 있었습니다. 그것을 고치자
같은 캡처에서 `Cmd+;`가 바로 동작했습니다(스펙 §6.4).
판정은 `event.code === "Semicolon"`입니다 —
배열에 따라 `;`가 Shift 조합이 되는 키보드가 있어 문자로 보면 새는 곳이 생깁니다.

`labels.hint`(팝오버 머리말의 안내 문구)는 **팝오버 안에만 있습니다.** 위 키들이
이제 닫힌 채로도 동작하므로 그 문구를 트리거 옆으로 내보내는 것을 검토했지만, 폼의
날짜 필드마다 안내 줄이 하나씩 붙는 비용이 커서 그대로 뒀습니다. **닫힌 상태의 키는
한 번 열어 보기 전에는 눈에 띄지 않습니다 — 알려진 구멍입니다.**

### 넓은 화면 배치 — SummaryGrid · PanelGrid · FieldGrid

세 통이 모두 같은 손잡이를 갖습니다. **값은 앱이 정합니다**(PRINCIPLES §14).

```tsx
<SummaryGrid>                        {/* 요약 카드 — 들어가는 만큼 한 줄에 */}
<PanelGrid stretch>                  {/* 패널을 가로로 — 같은 행 높이 맞춤 */}
<FieldGrid>                          {/* 패널 안 입력 필드를 여러 열로 */}
```

| 손잡이 | 뜻 | 토큰(앱 전체) | prop(이 통만) |
|---|---|---|---|
| `min` | 이 폭보다 좁아지면 열이 줄어듭니다 | `--panel-min` | `min="300px"` |
| `max` | 칸이 이보다 커지지 않습니다 | `--panel-max` | `max="500px"` |
| `justify` | `max` 때문에 남는 폭을 어디에 둘지 | `--panel-justify` | `justify="center"` |

요약 카드는 `--summary-card-*`, 필드는 `--field-*`, 색상 편집기 카드는 `--color-card-*`
입니다. 기본값은 `max: 1fr`(제한 없음)·`justify: normal`(왼쪽)이라 **아무것도 안 하면
지금까지와 같습니다.**

⚠️ **`min`만으로는 칸을 줄일 수 없습니다.** `minmax()`의 위쪽이 `1fr`이면 트랙이 남는
폭을 나눠 가지므로 항목이 적을수록 오히려 커집니다 — 2560에서 패널 둘이 `min`을 200으로
내려도 1077px씩 먹습니다. 줄이려면 `max`를 주세요.

⚠️ **`max`가 `min`보다 작으면 `min`이 이깁니다**(CSS `minmax()` 규칙). `--panel-min: 400px`
에 `max="380px"`를 주면 400px입니다.

⚠️ **`auto-fit`은 항목 수보다 많은 칸을 보여 주지 않습니다.** 패널이 둘이면 아무리 넓은
화면에서도 두 칸이고, `max`는 칸을 늘리는 것이 아니라 **줄이고 남긴** 것입니다. 칸을 더
원하면 항목을 더 넣어야 합니다.

**어느 패널이 같이 서는지, 순서, 높이를 맞출지는 앱이 정합니다.** 킷은 통만 줍니다 —
높이가 다른 패널을 나란히 놓으면 짧은 쪽 아래가 비는데, 그게 괜찮은 조합인지는 내용을
아는 쪽만 압니다(CSS masonry는 아직 못 씁니다). 순서는 넘긴 자식 순서 그대로입니다:

```tsx
<PanelGrid>{order.map((id) => PANELS[id]())}</PanelGrid>
```

⚠️ CSS의 `order`로 옮기지 마세요 — 화면만 바뀌고 **Tab 순서와 읽기 순서는 그대로**라
둘이 어긋납니다. 배열을 바꾸는 쪽이 맞습니다.

카드 한 장만 넓히려면 트랙을 두 칸 차지하게 합니다(토큰은 트랙을 정하므로 카드마다
다른 폭을 줄 수 없습니다):

```tsx
<SummaryCard className="wide" label="합계" value="…" />
```
```css
.wide { grid-column: span 2; }
```

### 그 밖의 모든 것 — className

**내보내는 컴포넌트는 예외 없이 `className`을 받습니다**(`tests/classNameContract.test.ts`가
지킵니다). `align-items`·`gap`·`grid-auto-flow`처럼 이름이 끝없는 것들은 prop으로 따라갈
수 없으므로, 자주 쓰는 것만 이름을 주고 나머지는 이 문으로 겁니다.

```tsx
<PanelGrid className="dense">…</PanelGrid>
```
```css
.dense { gap: 8px; align-items: stretch; }
```

### SegmentedControl

값 하나를 몇 개 중에서 고르는 묶음입니다. 설정 화면의 켬/끔, 표기 방식, 단계 선택처럼
**항상 하나가 골라져 있는** 자리에 씁니다.

```tsx
<SegmentedControl
  ariaLabel="시간 표기"          // 필수 — 한 화면에 묶음이 둘 이상이면 서로 구별돼야 합니다
  value={hourFormat}
  onChange={setHourFormat}
  options={[
    { value: "24", label: "24시간" },
    { value: "12", label: "12시간" },
    { value: "auto", label: "자동", disabled: true },
  ]}
/>
```

**접근성은 라디오 그룹입니다** — `radiogroup` + `radio`이고, 탭 정거장은 묶음 하나
(고른 칸만 `tabIndex=0`), `←`/`→`(`↑`/`↓`)로 옮기고 `Home`/`End`로 양 끝입니다.
`disabled` 칸은 화살표가 **건너뜁니다** — 멈춰 서면 그 뒤로 키보드로 못 갑니다.
Ctrl·Meta·Alt가 눌린 키는 전부 양보하므로 앱의 단축키와 겨루지 않습니다.

**같은 값을 다시 고르면 `onChange`를 부르지 않습니다** — 안 바뀐 값을 보내면 소비자의
dirty 판정이 더러워집니다.

⚠️ **고른 칸은 강조색으로 채우지 않습니다.** 이 킷에서 강조색 채움은 `Button`의 `primary`·다이얼로그
확정 등 **"이걸 하세요"**라는 뜻으로 이미 일곱 자리가 씁니다. 고름은 행동이 아니라
값이므로, 움푹한 트랙 위에 뜬 칩 + 강조색 **색조**로 말합니다. 색을 바꾸려면
`.segmented` 아래 선택자를 앱에서 덮으세요.

### AutoGrowTextarea

```tsx
<AutoGrowTextarea
  value={memo}
  onChange={setMemo}
  placeholder="여러 줄을 입력해 보세요"
  maxLength={500}
  ariaLabel="메모"               // 감싸는 label이 있으면 선택입니다 (PRINCIPLES §11)
  disabled={false}
  id="memo-field"                // 라벨을 바깥에 둘 때만
/>
```

3줄에서 시작해 내용만큼 늘어나고 **내부 스크롤바가 생기지 않습니다.** 값이 밖에서
바뀌어도 높이를 다시 맞춥니다.

**이름은 두 방법 중 하나로만 줍니다.** 감싸는 `<label>`(`css/controls.css:14`가
`display: grid`라 이게 기본 배치입니다), 아니면 `id` + 바깥 `<label htmlFor>`.

```tsx
<label>메모<AutoGrowTextarea value={memo} onChange={setMemo} /></label>          {/* 감싸기 */}

<label htmlFor="memo-field">메모</label>                                          {/* 바깥 라벨 */}
<AutoGrowTextarea id="memo-field" value={memo} onChange={setMemo} />
```

⚠️ **바깥 라벨과 `ariaLabel`을 같이 넘기지 마세요** — `aria-label`이 `<label>`을 이기므로
화면에 보이는 글자와 읽히는 이름이 갈립니다.

`disabled`는 `Select`·`DateWheelPicker`와 같은 뜻이고, 흐리기도 킷의 다른 비활성
표면과 같은 값입니다. **한동안 이 컨트롤에만 `disabled`가 없었습니다** — 폼 전체를
잠그면 메모 칸 하나만 살아 있는 "반쯤 잠긴 폼"이 됐습니다.

### AppShell + Sidebar

라우터·인증·API에 의존하지 않습니다. 컴포넌트에 넘기는 값은 controlled입니다.

> 다만 **`AppShell`은 예외적으로 스스로 상태를 갖습니다.** 모바일 가상 키보드 보정
> 때문에 `visualViewport`를 직접 구독하고, 포커스된 필드를 키보드 위로 올리려고
> `#root`를 **직접 스크롤**하며, 키보드가 닫히는 동안에는 `#root`의 height도 잠깐
> 붙듭니다. 프롭으로 끄거나 대체할 수 없습니다. (이 문서는 한동안 "상태는 전부
> controlled"라고 적고 있었는데, 그 보정이 들어온 뒤로 사실이 아니었습니다.)

> 모바일 서랍은 **안드로이드 뒤로가기로 닫힙니다.** 여는 순간 `Sidebar`가 history에
> 표식을 하나 남기고, 뒤로가기가 그걸 소비해 `onMobileClose`를 부릅니다 — 다이얼로그·
> 드롭다운과 같은 방식입니다. 아래 예시처럼 `mobileOpen`을 `AppShell`과 `Sidebar`
> 양쪽에 넘겨도 표식은 **하나만** 쌓입니다(미는 쪽은 `Sidebar`뿐입니다). 서랍을 직접
> 닫으면 그 표식을 걷어내므로 뒤로가기 횟수가 밀리지 않습니다.

```tsx
const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
const [mobileOpen, setMobileOpen] = useState(false);
const [navHidden] = useScrollDirectionHidden();      // 아래로 스크롤하면 하단 바 숨김
const keyboardOpen = useVirtualKeyboardOpen();       // 가상 키보드 감지

useEffect(() => localStorage.setItem("sidebarCollapsed", String(collapsed)), [collapsed]);

<AppShell
  collapsed={collapsed}
  mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)}
  navHidden={navHidden} keyboardOpen={keyboardOpen}
  sidebar={<Sidebar
    brand={{ icon: <Logo />, title: "내 앱" }}
    collapsed={collapsed} onToggleCollapse={() => setCollapsed(v => !v)}
    mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)}
    slot={<Select ariaLabel="작업 공간" value={ws} options={workspaces} onChange={setWs} portal />}
    sections={[
      { items: [{ id: "home", label: "홈", icon: <HomeIcon />, active: page === "home", onSelect: () => setPage("home") }] },
      { heading: "관리", pinToBottom: true, items: [/* ... */] },
    ]}
    footer={{ avatar: <Avatar />, name: "홍길동", subtitle: "관리자",
              actions: [{ id: "logout", label: "로그아웃", icon: <LogoutIcon />, onClick: logout }] }}
  />}
  quickBar={<MobileQuickBar items={[/* 정확히 3개 */]} />}
>
  <PageHeader eyebrow="SECTION" title="제목" description="설명" />
  <Panel title="카드">...</Panel>
</AppShell>
```

**React Router와 함께 쓰려면** nav 항목에 `href`와 `onSelect`를 같이 주거나,
`onSelect: () => navigate("/path")` + `active: pathname === "/path"`로 연결하세요.
`href`를 주면 `<a>`로, 없으면 `<button>`으로 렌더합니다.

`MobileQuickBar`는 CSS 그리드가 64px **3칸 고정**이라 항목 3개를 전제로 합니다.

#### `data-keyboard-keep-visible` — 필드뿐 아니라 그 아래 액션까지 같이 들어올리기

기본값에서 모바일 키보드가 열리면 **지금 포커스된 필드 자신**의 아래쪽만 키보드 위로
스크롤됩니다. 필드 바로 아래 취소/삭제/저장 같은 액션 버튼 줄이 있으면 그 버튼들은
계속 키보드 뒤에 남을 수 있습니다 — 이 킷은 소비 앱이 준 markup에서 "여기까지가 한
그룹"이라고 스스로 추론하지 않으므로(`portal`·`floatRef`/`quickBarRef`·`pinToBottom`과
같은 이유), 필드와 액션을 묶어 같이 들어올리고 싶으면 그 컨테이너에 직접 표시하세요.

```tsx
<div data-keyboard-keep-visible>
  {/* 감싸는 label이 이미 이름을 주므로 ariaLabel은 선택입니다(PRINCIPLES §11) */}
  <label>메모<AutoGrowTextarea value={memo} onChange={setMemo} /></label>
  <div className="action-row">
    <Button>취소</Button>
    <Button variant="danger">삭제</Button>
    <Button variant="primary">저장</Button>
  </div>
</div>
```

**값이 아니라 존재 자체가 스위치입니다** — `hasAttribute`만 확인하므로
`data-keyboard-keep-visible="false"`도 켜진 것으로 취급됩니다(HTML의 `disabled`/`hidden`과
같은 boolean 속성 관례). 끄려면 속성 자체를 렌더하지 마세요.

컨테이너가 키보드 위 공간보다 크면(버튼 줄까지 다 보이기엔 자리가 모자라면) 컨테이너의
아래쪽 전부가 아니라, **포커스된 필드 자신의 위쪽이 보이는 영역 밖으로 밀려나지 않는
선까지만** 들어올립니다 — 타이핑 중인 자리를 아예 못 보게 되는 것이 버튼 한두 개가
가려지는 것보다 나쁩니다. 그래도 이 한도가 필드 자신의 최소 요구량(마킹하지 않았을 때
스크롤되는 양)보다 작아지는 일은 없습니다 — 마킹은 스크롤을 늘릴 수만 있지, 마킹
전보다 덜 스크롤하게 만들지는 않습니다.

마커를 안 붙이면 **이 기능은 켜지지 않습니다** — 완전한 opt-in이고, 컨테이너로 감싸기만
해서는 아무 일도 일어나지 않습니다.

> ⚠️ **이 절이 "이번 릴리스는 아무것도 안 바뀐다"는 뜻은 아닙니다.** 마커와 무관하게
> 키보드 보정 자체가 달라졌습니다: 보정 계산이 비주얼 뷰포트가 멈춘 뒤로 미뤄졌고,
> `#root`의 `scroll-padding-bottom`이 제거됐으며, 키보드가 닫히는 동안 `#root`의
> height를 잠깐 붙듭니다.

**마커는 반드시 필드의 조상에 붙입니다.** 필드 자신에 붙이면 아무 일도 일어나지
않습니다 — 탐색이 `parentElement`에서 시작하기 때문입니다. 그리고 탐색은 스크롤
호스트(`#root`) 안쪽까지만 올라갑니다. **`#root` 바깥 조상에 붙인 마커는 조용히
무시됩니다** — 에러도 경고도 없습니다. 대표적인 경우가 `document.body`로 포털되는
`Dialog` 안입니다. 이 훅이 움직이는 건 `#root.scrollTop`뿐이라, 그 밖의 요소는 애초에
이 스크롤로 움직이지 않으므로 기준으로 쓸 수 없습니다. 다이얼로그 안의 배치는
`PRINCIPLES.md` §10이 따로 규정합니다.

### SectionTabs

```tsx
<SectionTabs ariaLabel="설정 섹션" value={tab} tabs={TABS} onChange={setTab} />
<SectionHeading title="기본 설정" description="설명은 3줄 자리를 예약합니다." />
```

⚠️ **`SectionHeading`은 탭의 일부가 아닙니다.** 여기 같이 적은 것은 화면에서 바로
아래에 서기 때문이고, 컴포넌트는 `PageChrome`에서 나오며 스타일은 `page.css`에
있습니다. 탭이 없는 페이지에서도 그대로 씁니다 — §7 배치 스택
(`PageHeader` → (탭) → `SectionHeading` → `Panel`)의 한 칸입니다.

오른쪽 아래 플로팅 페이지 카드까지 쓰려면 트리를 `MobilePageTabsContext.Provider`로
감싸고 `AppShell`의 `pageTabs` 슬롯에 `MobilePageTabs`를 넣으세요.

```tsx
const pageTabs = useMobilePageTabs();

<MobilePageTabsContext.Provider value={pageTabs.context}>
  <AppShell
    quickBar={<MobileQuickBar barRef={pageTabs.quickBarRef} items={[...]} />}
    pageTabs={<MobilePageTabs registration={pageTabs.registration} open={pageTabs.open}
                onToggle={pageTabs.setOpen} floatRef={pageTabs.floatRef} />}
    ...
```

> ⚠️ `floatRef`와 `quickBarRef`를 **반드시 넘기세요.** 이 둘로 "바깥"을 판정하기
> 때문에, 빠뜨리면 열린 메뉴가 아무 데를 눌러도 닫히지 않고 화면에 남습니다.

전체 예시는 [demo/main.tsx](demo/main.tsx)를 참고하세요.

---

### Dialog

```tsx
<Dialog open={open} onClose={() => setOpen(false)} ariaLabel="분류 등록"
        onSubmit={() => save()}        // 주면 <form>으로 렌더 + preventDefault
        wide scroll                     // 520px / 내부 스크롤 + 액션 바닥 고정
        closeOnBackdrop={false}         // 닫는 길 세 개를 따로 끕니다
        closeOnEscape={false}           // 되돌릴 수 없는 확인이면 셋 다 끄세요
        closeOnBack={false}>
  <DialogHeading eyebrow="CATEGORY" title="분류 등록" />
  <label>이름<input required /></label>
  <DialogActions>
    <Button variant="danger">삭제</Button>
    <Button onClick={() => setOpen(false)}>취소</Button>
    <Button variant="primary" type="submit">등록</Button>
  </DialogActions>
</Dialog>
```

⚠️ **`DialogActions`의 자식은 `<Button>`이어야 합니다.** 이 통은 자리와 크기만 정하고
색·테두리는 안 줍니다(PRINCIPLES §16). 날 `<button>`을 넣으면 브라우저 기본 버튼이
나옵니다 — `v0.12.0` 전에는 통이 대신 칠했습니다.

body 포털에 z-index 200으로 뜹니다. 백드롭 `mousedown`·Escape·**뒤로가기**로
닫히고, 포커스를 안에 가두며(Tab 순환), 닫히면 열기 직전 요소로 포커스를
되돌립니다. 액션은 32px 조밀 계열이고(문맥이 정합니다, §2) `variant="danger"`는 왼쪽 끝으로 밀려
확인 버튼과 멀어집니다.

뒤로가기는 뒤 페이지로 가지 않고 다이얼로그만 닫습니다(`useBackToClose`).
겹쳐 열면 위에서부터 하나씩 닫히고, 버튼으로 닫았을 때는 남긴 history 표식을
걷어내 뒤로가기 횟수가 밀리지 않습니다. **모바일에서 키보드가 떠 있으면 첫
뒤로가기는 OS가 키보드를 닫는 데 쓰므로, 다이얼로그는 그다음 뒤로가기에 닫힙니다.**

**겹쳐 열어도 Escape는 가장 안쪽 하나만 닫습니다.** 다이얼로그 안에서 드롭다운을
Escape로 닫아도 다이얼로그는 남습니다. 직접 만든 팝업을 이 순서에 끼우려면
`useEscapeToClose(open, onClose)`를 쓰세요 — 자기 리스너를 달면 한 번의 Escape로
같이 닫힙니다. 순서는 등록 시점이 아니라 `PopupDepthContext`가 알려 주는
겹친 깊이로 정해집니다.

> **예외 하나 — 그 깊이 스택에 등록조차 안 된 컨트롤이 Escape를 먹을 수 있습니다.**
> `DateWheelPicker`가 **닫힌 채로** 치던 숫자를 들고 있으면 첫 `Escape`를 그 버퍼를
> 버리는 데 쓰고 전파를 멈춥니다(치던 숫자를 취소하려고 누른 키가 폼을 통째로 닫으면
> 안 되므로). 그 필드에 포커스가 있는 동안에는 **다이얼로그가 첫 `Escape`에 안 닫히고
> 두 번째에 닫힙니다.** 버퍼가 없으면 그대로 흘려보내므로 평소에는 한 번에 닫힙니다.
> 깊이 스택이 아니라 트리거의 React `onKeyDown`이 document 리스너보다 먼저 실행되는
> 것으로 정해지는 자리라, 위 문단의 규칙으로는 설명되지 않습니다.

되돌릴 수 없는 확인이라면 `closeOnBackdrop`·`closeOnEscape`·`closeOnBack`을
**셋 다** 끄세요. 뒤 둘을 남겨두면 실수로 닫히고, 반대로 앞 둘만 끄고
`closeOnBack`을 켜두면 뒤로가기가 닫지도 못할 다이얼로그를 위해 삼켜져
사용자가 갇힙니다.

열면 **첫 입력칸에 바로 포커스**가 갑니다. 다른 요소를 잡으려면 그 요소에
`autoFocus`를 주세요 — 이미 안쪽에 포커스가 있으면 건드리지 않습니다.

위치는 **항상 "지금 보이는 영역의 가운데"** 하나로 정해집니다. 컴포넌트가
`useVisualViewportBox()`로 백드롭의 `top/left/width/height`를 `visualViewport`에
맞추므로, 키보드가 올라오면 그 영역이 키보드 위까지로 줄어들 뿐입니다.

| 상황 | 결과 |
|---|---|
| 키보드 없음 | 화면 정중앙 |
| 키보드 있음 + 다이얼로그가 들어감 | 남은 영역의 정중앙 (위아래 여백 생김) |
| 키보드 있음 + 다이얼로그가 더 김 | 위에 붙고 안에서 스크롤, 키보드는 계속 보임 |

"키보드가 열렸는지"를 판정하지 않습니다 — 주소창 접힘/펴짐이 100~140px이라
임계값으로는 키보드와 구분되지 않고, `:has(input:focus)`는 프로그램 포커스만으로도
참이 되기 때문입니다.

> CSS만 떼어 쓰면 백드롭이 레이아웃 뷰포트를 덮습니다. 안드로이드 기본값에서
> 키보드는 레이아웃 뷰포트를 줄이지 않으므로(`100dvh`도 마찬가지), 이 보정은
> 컴포넌트를 함께 써야 동작합니다.

> **다이얼로그 안의 드롭다운에는 `portal`을 켜세요.** 백드롭이 z-index 200이라
> 포털 메뉴(450)만 그 위로 올라옵니다.

도메인 전용이라 의도적으로 뺀 것: 계정 선택 드롭다운, 거래 테이블, 계정 칩 그리드.

### ThemeColorEditor — 색상 토큰 편집기

사용자가 팔레트를 직접 바꾸는 화면입니다. 지금 보고 있는 테마(라이트/다크)의 값을
기본적으로 `localStorage`(`themeColors:light` / `themeColors:dark`)에 따로 저장하고
`:root`에 인라인으로 적용합니다. **기본값은 저장이 브라우저에만 — 코드도 GitHub도
안 건드립니다.** `overrides` 프롭을 넘기면 이 저장을 앱이 가져갈 수 있습니다 —
서버에 붙여 로그인 동기화·백업/복원을 하려면 `palette`·`overrides`·`onCommit`을
쓰세요(자세한 내용은 [CUSTOMIZING.md](CUSTOMIZING.md#색-설정을-앱이-소유하기-서버-저장백업복원)).

```tsx
<ThemeColorEditor theme={theme} />           // 기본 토큰 표
<ThemeColorEditor theme={theme} groups={myGroups} onChange={…} />
```

**문구만 바꾸기**: 토큰의 이름표·설명이 프로젝트마다 다르면 `groups`로 갈아 끼우세요
(이름은 `tokens.css`와 같아야 합니다). 기본값은 `THEME_TOKEN_GROUPS`입니다.

**새 색(토큰)을 더하기 — 키트를 안 고치고**: 편집기는 넘어온 `groups`의 토큰
집합으로 읽기·기본값·저장·적용을 전부 처리합니다. 그래서 소비 프로젝트가:

1. 자기 CSS에 커스텀 프로퍼티를 **라이트·다크 둘 다** 정의하고
   ```css
   :root { --brand-2: #ff8a3d; }
   :root[data-theme="dark"] { --brand-2: #ffa866; }
   ```
2. 어딘가에서 그 토큰을 실제로 쓰고 (`color: var(--brand-2)`),
3. `groups`에 항목 하나를 더하면
   ```tsx
   const groups = [...THEME_TOKEN_GROUPS, { title: "브랜드", tokens: [
     { name: "--brand-2", label: "브랜드 보조", description: "보조 브랜드 색" },
   ] }];
   ```

그 색이 편집기에 뜨고, 사용자가 값을 바꾸면 저장·적용됩니다 — **키트(GitHub) 수정
없이** 색이 늘어납니다. (테마 적용 effect도 같은 목록을 쓰도록 `applyTokenOverrides(
theme, undefined, tokens)`에 그 tokens를 넘기세요. 앱은 자기 `THEME_TOKENS`가 기본값이라
저절로 됩니다.)

> 참고: 색 토큰은 **누군가 `var(--x)`로 써야** 화면에 나타납니다. 어디에 쓸지는
> 코드가 정하므로, 편집기 UI만으로 "쓰이는 새 색"을 만들 수는 없습니다.

### 단축키 — ShortcutProvider · ShortcutSettings

**옵트인입니다.** `ShortcutProvider`를 렌더하지 않는 앱은 `document`에 걸리는
keydown 리스너가 **0개**입니다 — 리스너는 이 컴포넌트의 effect 안에만 삽니다.
`css/index.css`를 그대로 쓰는 앱은 CSS 바이트만 더 받고(`.kkqq-shortcuts` 뿌리
아래), 렌더하지 않으면 그마저 화면에 영향이 없습니다.

```tsx
import { ShortcutProvider, sidebarToggleAction } from "kkqq-ui-basic-kit";

// 사용자가 바꾼 것만 담습니다 — 그래서 시작값이 빈 객체입니다.
const [overrides, setOverrides] = useState<Record<string, string | null>>({});

<ShortcutProvider
  actions={[sidebarToggleAction(() => setCollapsed((value) => !value), { defaultCombo: "Ctrl+Backslash" })]}
  overrides={overrides}
>
  <AppShell>…</AppShell>
</ShortcutProvider>
```

**액션은 앱이 넘깁니다.** 킷이 기본 제공하는 액션은 `sidebarToggleAction(onFire, options?)`
하나뿐이고, 그것도 킷이 쥐는 것은 안정적인 `id`(`SIDEBAR_TOGGLE_ID`)와 이름표뿐입니다
— `Sidebar`는 controlled라 접힘 상태도 토글 함수도 앱 것입니다(`Sidebar`, 접힘 상태는
`localStorage`처럼 쓰는 쪽이 저장). `options`는 `{ label?, defaultCombo? }` 모양입니다.
그 밖의 단축키는 `{ id, label, defaultCombo, onFire }` 모양의 액션을 직접 만들어
`actions` 배열에 넣으세요. `id`는 저장의 키이므로 **바뀌면 그 액션의 덮어쓰기가
고아가 됩니다.**

**`defaultCombo`는 킷이 대신 정해 주지 않습니다 — 항상 `null`이 기본값입니다.**
`sidebarToggleAction`도 `options`를 안 넘기면 `defaultCombo: null`을 반환합니다.
**조합은 앱이 정해야 하고, 그 자리는 `defaultCombo`입니다** — `sidebarToggleAction`이면
`options.defaultCombo`(위 예시), 직접 만든 액션이면 `{ id, label, defaultCombo, onFire }`의
`defaultCombo` 필드입니다. `defaultCombo`도 안 주면 그 액션은 아무 키에도 안 걸립니다
— 안내 없이 켜면 "켰는데 안 되는데요"가 됩니다. 데모(`demo/main.tsx`)의
`Ctrl + \`가 그 예시입니다.

**`overrides`는 앱의 기본값을 담는 자리가 아니라, 사용자가 실제로 바꾼 것만
담는 자리입니다.** 키가 없는 액션은 `defaultCombo`를 그대로 쓰고, 키가 있는데
값이 `null`이면 사용자가 그 조합을 **지운** 것입니다(기본값으로 돌아가지 않습니다).
이 구분이 있어야 "기본 조합을 나중에 바꿨는데 이미 저장한 사용자만 옛 조합에
갇힌다"가 구조적으로 안 생깁니다 — 저장에는 `overrides`만 넣고 `defaultCombo`는
코드에 남겨 두면 됩니다.

사용자가 조합을 직접 바꾸게 하려면 `ShortcutSettings`를 띄우세요 — 녹음기이자
충돌 검사기입니다(같은 조합을 다른 액션에, 또는 킷 컴포넌트가 이미 쓰는 조합에
걸려고 하면 등록을 막고 이유를 보여 줍니다). 위 예시처럼 `overrides`를 `useState`로만
들고 있으면 **새로고침하면 사라집니다** — 남게 하려면 `onChange`로 직접 저장하거나,
아래처럼 킷에게 저장을 맡기세요:

```tsx
<ShortcutSettings
  onChange={(id, combo) => setOverrides((current) => ({ ...current, [id]: combo }))}
/>
```

#### 저장 — 킷이 맡거나(`storage`), 앱이 맡거나(`overrides`)

**둘 다 옵트인입니다.** 아무것도 안 넘기면 지금까지와 같습니다 — `defaultCombo`만
쓰고 저장소는 전혀 안 건드립니다.

**킷이 저장하게 하려면(uncontrolled)** — `overrides` 대신 `storage`를 넘기세요.
그러면 `ShortcutSettings`에 `onChange`를 안 넘겨도 녹음·지우기가 바로 저장됩니다:

```tsx
import { ShortcutProvider, ShortcutSettings, createShortcutStorage, sidebarToggleAction } from "kkqq-ui-basic-kit";

const shortcutStorage = createShortcutStorage();   // localStorage, 키 "shortcutBindings"

<ShortcutProvider
  actions={[sidebarToggleAction(() => setCollapsed((value) => !value), { defaultCombo: "Ctrl+Backslash" })]}
  storage={shortcutStorage}
>
  <AppShell>
    …
    <ShortcutSettings />
  </AppShell>
</ShortcutProvider>
```

킷이 마운트 때 `storage.read()`로 채우고, 녹음·지우기는 `registry.setBinding`을 거쳐
`storage.write`로 저장됩니다. 다른 탭에서 바꾼 값도 `storage.subscribe`로 따라옵니다.

⚠️ **`storage`는 안정적인 참조여야 합니다** — 위 예시처럼 컴포넌트 **밖**에서 한 번만
`createShortcutStorage()`를 부르세요. JSX 안에서 `storage={createShortcutStorage()}`
처럼 매 렌더 새로 만들면, `ShortcutProvider`가 그 참조 변화를 "다른 저장소로
바뀌었다"로 읽어 매 렌더마다 다시 구독합니다(전체 리뷰 Minor 8 — `window`의
`storage` 리스너가 붙었다 떨어졌다를 반복합니다).

**앱이 저장하게 하려면(controlled)** — 위 첫 예시처럼 `overrides`를 넘기세요. 그러면
킷은 **저장소를 전혀 건드리지 않습니다**(`storage`를 같이 넘겨도 완전히 무시됩니다) —
서버 동기화나 다른 저장 방식을 쓰고 싶을 때 이쪽입니다.

⚠️ **`onChange`도 없고 `storage`도 없으면** `ShortcutSettings`에서 녹음해도 저장할
곳이 없어 화면이 안 바뀝니다 — 개발 중이라면 콘솔에 경고가 뜹니다. 배포 전에 둘 중
하나는 반드시 넘기세요.

⚠️ **이것과 "저장소가 막혔다"(프라이빗 모드·용량 초과)는 다른 사건입니다** —
`storage`를 제대로 넘겼는데도 브라우저가 저장을 막으면, `ShortcutSettings`는 위
경고(배선 누락) 대신 화면에 안내를 띄웁니다. 조합은 이번 방문에서는 계속 쓸 수
있지만 새로고침하면 사라집니다. 두 실패를 직접 구분하고 싶으면
`useShortcutRegistry()`가 주는 `registry.canPersist`를 보세요 — uncontrolled고
`storage`가 있을 때만 참입니다.

`createShortcutStorage(options?: { key?: string })`가 저장소를 만듭니다. 백업/복원이
필요하면 `serialize()`/`parse(input)`을 쓰세요 — `ThemeColorEditor`의
`palette.serialize`/`palette.parse`와 같은 모양입니다(버전 붙은 봉투). **킷은 액션
id를 모릅니다**(§3.3 — 액션은 앱의 것이고 킷은 안을 보지 않습니다)**, 그래서
`parse`는 액션 id를 근거로 아무것도 버리지 않습니다.** 버리는 것은 **값**뿐입니다 —
문자열도 `null`도 아니거나, 문자열인데 `normalizeCombo`가 거부하면 그 값의 id를
`dropped`에 남기고 뺍니다(전체 리뷰 Important 1 — 이 문단이 예전에 "모르는 액션
id나 형식에 안 맞는 값은 버리고"라고 적어, 마치 킷이 액션 목록과 대조해 모르는 id를
버리는 것처럼 읽혔습니다. `createShortcutStorage`는 액션 목록을 받는 자리 자체가
없습니다). **`null`과 "키 없음"은 다릅니다** — `null`은 사용자가 그 액션의 조합을
지운 것이고, 키가 아예 없는 것은 `defaultCombo`를 쓴다는 뜻입니다.

**백업을 복원하려면 `registry.restoreBindings(bindings)`를 쓰세요** — `useShortcutRegistry()`로
꺼낸 레지스트리에 있고, `setBinding`과 같은 경계입니다(uncontrolled에서만 동작하고,
controlled거나 `storage`가 없으면 아무것도 안 하고 `false`를 돌려줍니다):

```tsx
const registry = useShortcutRegistry();

const parsed = shortcutStorage.parse(JSON.parse(text));
if (!parsed) return alert("이 파일은 단축키 백업이 아닙니다");
if (parsed.dropped.length) alert(`이 버전이 모르는 조합 ${parsed.dropped.length}개는 뺐습니다`);
registry.restoreBindings(parsed.backup.bindings);   // 저장과 이 탭의 화면 갱신을 함께 합니다
```

⚠️ **`setBinding`을 항목마다 루프로 불러 복원을 흉내 내지 마세요** — 한 번에 여러
항목을 커밋하려면 `restoreBindings`를 쓰세요. 그리고 `shortcutStorage.write(bindings)`를
직접 부르지도 마세요 — 저장은 되지만 이 탭의 화면 상태는 낡습니다(`subscribe`는
다른 탭의 변경만 받습니다). `restoreBindings`는 그 둘을 함께 합니다.

**맨 키(수식어 없는 키) 단축키를 쓰려면 `data-kkqq-shortcut-scope`가 필요합니다.**
수식어(Ctrl·Alt·Meta) 조합은 어디서나 트리거되지만, 맨 키는 기본적으로
`document.activeElement`가 `<body>`일 때만 트리거됩니다. 이 기본값은 **플랫폼마다
다르게 동작합니다** — 버튼을 클릭한 뒤, macOS 브라우저는 포커스를 주지 않는데
Windows는 줍니다. 그래서 그 차이가 한쪽 OS에서만 개발하면 보이지 않습니다.

허용 표식은 이 차이를 없애 주지 않습니다 — 없애는 일을 앱으로 옮길 뿐입니다.
그래서 **버튼 하나하나가 아니라 컨테이너에** 붙이세요(예: 작업 영역 전체를 감싼
`<div>` 하나). 표식이 붙은 요소 안에 포커스가 있으면 그 구역도 `<body>`처럼 쳐서
맨 키가 트리거됩니다. 붙일 자리가 적을수록 잊을 자리가 적습니다.

**구역 안에 `<select>`나 라디오·체크박스·슬라이더가 있어도 괜찮습니다.** 이런 폼
컨트롤에 포커스가 있으면 킷이 맨 키를 양보합니다 — 안 그러면 `<select>`의
타입어헤드나 라디오 화살표가 죽습니다(브라우저는 그걸 처리하면서 `preventDefault`를
안 부르기 때문에 킷이 따로 갈라 냅니다). 텍스트 입력도 마찬가지고, 수식어 조합은
그 안에서도 그대로 트리거됩니다.

⚠️ **`<button>`·링크는 양보하지 않습니다** — 카드 그리드에서 `j`/`k`를 쓰라고 만든
기능이라 거기까지 막으면 쓸 수 없습니다. 대신 **맨 `Enter`·`Space`는 아예 등록할 수
없게** 해 뒀습니다(아래).

**등록할 수 없는 조합이 있습니다.** 녹음기가 이유를 알려 주고, `defaultCombo`·
`overrides`로 코드에서 넣어도 똑같이 무시됩니다:

| 조합 | 왜 |
|---|---|
| `Escape` · `Tab`(`Shift+Tab` 포함) | 킷의 리스너가 씁니다 — 다이얼로그 닫기·포커스 이동 |
| 맨 `Enter` · 맨 `Space` | 포커스한 버튼·링크를 누르는 키입니다. **`Ctrl+Enter`처럼 수식어가 붙으면 걸 수 있습니다** |
| `Ctrl`/`Cmd` + `C` `V` `X` `Z` `Y` | 브라우저의 복사·붙여넣기·잘라내기·되돌리기·다시 실행 |

`Ctrl+A`는 **걸 수 있지만** 텍스트 입력 안에서는 뜨지 않습니다(브라우저의 전체 선택이
먼저입니다) — 녹음기가 그 자리에서 알려 줍니다.

## 클래스 이름 대응

CSS 클래스는 이전 이름을 대체로 유지했습니다. 헷갈릴 만한 것만:

| 컴포넌트 | 루트 클래스 | 비고 |
|---|---|---|
| `Select` | `.app-select` | |
| `SectionTabs` | `.settings-tabs` | 이름은 `settings`지만 범용 섹션 탭입니다 |
| `SectionHeading` | `.settings-section-heading` | 같은 이유로 `settings`. 컴포넌트는 `PageChrome`, 스타일은 `page.css` |
| `Button` | `.action-button` + `data-variant` | 옛 `.primary`·`.secondary-button`·`.danger-button`·`.text-button`을 대체합니다 |
| 액션 줄 | `.action-row` | 옛 `.button-row` |
| `Sidebar` 브랜드 | `.sidebar-brand` | 원본 `.brand`에서 개명 |
| `Sidebar` 상단 슬롯 | `.sidebar-slot` | 원본 `.budget-picker`에서 개명 |
| nav 배지 | `.sidebar-nav-count` | 원본 `.nav-count`에서 개명 |
| nav 그룹 제목 | `.sidebar-nav-heading` | 원본 `.nav-heading`에서 개명 |

개명한 넷은 원본 이름이 너무 일반적이라 다른 프로젝트와 충돌할 위험이 있어서 바꿨습니다.

---

## 개발

클론한 뒤 `npm ci` 하면 됩니다. 이 저장소는 다른 프로젝트에 의존하지 않습니다 —
개발 의존성은 전부 `package.json`과 `package-lock.json`에 있습니다.

```bash
npm ci
```

> 한때 `node_modules`가 소비 앱의 `frontend/node_modules`를 가리키는 **정션**
> 이었고 이 문서도 그렇게 안내했습니다. 그 때문에 키트가 한 번도 독립적으로
> 설치된 적이 없었고, 그 앱의 의존성이 빌드에 섞여 들어왔습니다. 정션은
> 제거됐고, 격리된 클론에서 `npm ci`만으로 전체 테스트가 통과하는 것을 확인했습니다.

```bash
npm run dev         # 데모 → http://localhost:5273
npm test            # vitest
npm run typecheck   # tsc --noEmit
```

`vite.config.ts`, `tsconfig.json`, `index.html`, `demo/`, `tests/`는 **개발용**입니다.
`package.json`의 `files`가 배포 대상을 `css/`, `src/`, `fonts/`와 문서로 한정합니다.

---

## Claude 스킬로 쓰기

Claude가 모든 프로젝트에서 이 원칙을 자동으로 적용하게 하는 트리거 스킬은
**`kkqq9320/claude-skills` 마켓플레이스**에 있습니다. 스킬은 소스를 담지 않고
문서를 가리키기만 합니다 — 원칙의 단일 출처는 이 저장소입니다. 둘 다 못 찾으면
계약을 지어내지 않고 멈춥니다.

스킬은 둘입니다:

- **`kkqq-ui-basic-kit`** — React 프로젝트에 이 킷을 설치해서 쓸 때. `PRINCIPLES.md`와
  `LAYOUT-PRINCIPLES.md` **둘 다** 읽도록 안내합니다. 찾는 순서는
  `node_modules/kkqq-ui-basic-kit/`(설치된 프로젝트) 다음 공개 raw URL
  (`raw.githubusercontent.com`)입니다.
- **`kkqq-layout-principles`** — **킷을 설치할 수 없는 곳**(비-React, 남의
  프레임워크 위에 얹는 화면 — Home Assistant 커스텀 카드 같은)에서 배치·그리드
  규칙만 필요할 때. `LAYOUT-PRINCIPLES.md`를 가리키고, 설치할 것은 없습니다.
  찾는 순서는 **반대**입니다 — 이 스킬을 쓰는 곳은 대개 킷을 설치할 수 없는
  프로젝트라, 공개 raw URL이 먼저이고 `node_modules`는 그다음입니다.

> ℹ️ **마켓플레이스 저장소(`kkqq9320/claude-skills`)는 비공개입니다** — 아래 명령은
> 접근 권한이 있어야 동작합니다(실측: 익명 API 404. 대조군으로 이 킷 저장소는 200).
> **이 킷을 쓰는 데는 필요 없습니다** — 위 "설치"만 따르면 됩니다. 스킬이 가리키는
> `PRINCIPLES.md`·`LAYOUT-PRINCIPLES.md`는 **이 저장소(공개)**에 있습니다.

```bash
claude plugin marketplace add kkqq9320/claude-skills
claude plugin install kkqq-skills@kkqq
```

원칙을 고치려면 이 저장소에서 `PRINCIPLES.md`·`LAYOUT-PRINCIPLES.md`를 고쳐
push 하고, 스킬의 트리거 문구를 고치려면 claude-skills 저장소에서 고칩니다.
둘 다 GitHub로 관리됩니다.

## 출처

대부분의 소스 파일 상단에 원래 있던 위치를 주석으로 남겨 뒀습니다(파일 경로,
일부는 줄 번호까지).

## 검증 상태

- `vitest run` — 전부 통과 (**2026-08-12 기준 758개**).
  숫자를 못 박지 않고 날짜를 붙이는 것은 일부러입니다 — 이 줄은 이미 한 번
  썩었던 자리이고, 정확한 개수는 커밋마다 달라져 **다시 썩습니다.**
  날짜가 붙어 있으면 낡아도 거짓이 아니라 스냅샷으로 읽힙니다.
- ⚠️ **여기 있던 "원본 테스트를 한 글자도 고치지 않고 옮겼다"는 주장은 더 이상**
  **참이 아니라 지웠습니다.** 그 주장은 킷을 처음 추출할 때의 것이고, 이후
  `DateWheelPicker`가 키보드 조작 모델을 다시 설계하면서
  (`docs/design/2026-08-06-date-picker-keyboard-design.md`) **트리거의 접근성 이름
  자체가 바뀌었습니다**(§8 — 이름이 값을 함께 싣습니다). 원본과 이름이 같다는 전제가
  깨졌으므로 원본 테스트가 그대로 통과할 수가 없습니다.

  대조해서 잰 결과(`main`의 `tests/DateWheelPicker.test.tsx` 18개 블록 기준,
  줄바꿈만 맞추고 글자 비교):

  | | 개수 |
  |---|---|
  | 글자 그대로 남음 | **1** (`비활성 필드가 hover에 살아나지 않는다` — CSS 소스 검사라 이름과 무관) |
  | 이름은 같고 본문이 바뀜 | 13 |
  | 이름째 교체됨 | 4 |

  교체된 넷은 계약이 바뀌어서입니다(달력 아이콘이 더 이상 "오늘"을 직접 넣지 않음,
  hover 테스트가 공허 통과라 분할됨 등) — 각각의 이유는 `tests/DateWheelPicker.test.tsx`의
  해당 자리에 적혀 있습니다. **추출 등가성은 이제 이 파일이 증명하는 것이 아니고,
  그 자리를 설계 스펙과 그에 딸린 테스트가 대신합니다.**
- `tsc --noEmit` — 통과 (`src`, `tests`, `demo` 전부).
- 데모 페이지에서 계산된 스타일로 확인: 셸 그리드 238px, 컨트롤 41/38/32px,
  드롭다운 30% 틴트 + 18px 블러, 위로 열림, 셰브런 180° 회전, 피커 30/150/30 열과
  body 포털, 모바일 오프캔버스 `translateX(-105%)`, 빠른 바 216×60,
  탭 카드 열림/닫힘, 다크 모드 전체.
- `portal` 드롭다운: `overflow: hidden`인 사이드바 슬롯 안에서 메뉴가 body로 나가
  `position: fixed`(z-index 450)로 슬롯 밖까지 그려지고, 메뉴 중앙의 hit-test가
  메뉴에 맞는 것(= 잘리지 않음)까지 확인. 본문의 일반 드롭다운은 기존대로
  `absolute` / z-index 80을 유지합니다.
- 사이드바 접기: `width`가 실제로 트랜지션 목록에 올라간 것을 Web Animations API로
  확인(`width:260ms` + 패딩 4방향). 라벨·슬롯·그룹 제목도 `max-width`/`opacity`/
  `height`로 함께 보간됩니다. 238px↔76px 왕복 후 접기 버튼이 정확히 가운데(38px)에
  안착하는 것까지 확인했습니다.
- `Dialog`: 백드롭 z-index 200 / 58% 틴트 / 8px 블러, 다이얼로그 440px(wide 520px),
  액션 32×64px, `.danger`가 `margin-right: auto`로 밀리는 것, `onSubmit` 시 `<form>`
  렌더, 백드롭 mousedown·Escape 닫기, 열 때 포커스 진입 / 닫을 때 원래 버튼으로 복원,
  긴 다이얼로그의 내부 스크롤 + sticky 액션까지 브라우저에서 확인.
  다이얼로그 안 포털 드롭다운은 메뉴(450)가 백드롭(200) 위에 실제로 그려지고
  hit-test에 잡히며, 메뉴를 눌러도 다이얼로그가 닫히지 않는 것을 확인했습니다.
- 마우스 보조 버튼: 백드롭·바깥 클릭 닫기는 주 버튼만 인정합니다. 가드를 빼면
  전용 테스트가 실패하는 것까지 확인했습니다. 실기기 로그에서 마우스 뒤로가기
  버튼이 백드롭 닫기를 발동시켜 표식을 소모하고, 이어진 브라우저 뒤로가기가
  페이지를 나가버리던 회귀를 이걸로 잡았습니다.
- 뒤로가기: 데모(StrictMode)에서 다이얼로그를 열면 history 표식이 1개 쌓이고,
  `history.back()`에 **URL과 페이지는 그대로인 채 다이얼로그만** 닫히며 표식이
  0으로 돌아옵니다. StrictMode 회귀(열자마자 닫힘)는 전용 테스트로 고정했고,
  정리 단계의 `back()`을 즉시 호출로 되돌리면 그 테스트만 실패하는 것까지
  확인했습니다.
- 다이얼로그 모바일 정렬(375×812), 세 경우 모두 브라우저 실측:
  키보드 없음 → 235~577 정중앙. 키보드 300px(영역 512) → 85~427로 **위아래 여백
  85px씩**, 영역 안 정중앙. 긴 다이얼로그 + 키보드 → 12에 붙고 하단 500으로
  **영역(512)을 넘지 않으며** 안에서 스크롤(1127→486), sticky 액션도 영역 안 유지.
  실기기(안드로이드 Chrome)에서 ①키보드 없이 위/아래로 쏠리던 것 ②키보드와 사이가
  벌어지거나 여백 없이 붙던 것을, 임계값 판정을 버리고 잡았습니다.

---

## 라이선스

**소스 코드는 MIT** ([LICENSE](LICENSE)). 자유롭게 쓰고 고치고 재배포하시면 됩니다.

**번들 폰트는 별개입니다.** `fonts/PretendardVariable.woff2`는 SIL Open Font
License 1.1이고 전문은 [fonts/OFL.txt](fonts/OFL.txt)에 있습니다. 재배포·웹임베딩
모두 허용되며, 조건은 그 라이선스 파일을 폰트와 함께 두는 것뿐입니다.
폰트 파일을 빼실 거면 `OFL.txt`도 같이 빼세요.

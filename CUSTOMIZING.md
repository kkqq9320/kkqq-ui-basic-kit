# 프로젝트별 커스터마이징 안내

이 키트는 **의존성으로 설치**해 씁니다 (`npm i "github:kkqq9320/kkqq-ui-basic-kit#vX.Y.Z"`
— 최신 태그는 [CHANGELOG.md](CHANGELOG.md) 맨 위, 설치 전체는
[README 설치](README.md#설치) 참고). 색·연월 픽커처럼 프로젝트마다 달라지는
것들은 대부분 **키트를 고치지 않고** 프롭이나 CSS 토큰만으로 바꿉니다. 이
문서는 "무엇을 어디서 바꾸는가"의 단일 인덱스입니다.

> 아래 1·2층은 **소비 프로젝트 쪽에서** 하는 일입니다. 고쳐야 할 것 같다면
> 그건 3층이고, 그때는 키트 저장소에서 고쳐 push 한 뒤 태그를 올리고 소비
> 프로젝트가 그 태그로 옮겨 따라갑니다. **설치본(`node_modules`)을 직접 고치면
> 다음 `npm install`에 아무 경고 없이 사라집니다.**

커스터마이징 지점은 세 층으로 나뉩니다:

| 층 | 무엇 | 키트 수정 |
|---|---|---|
| **1. 프롭** | 문구·데이터·표시 열·시간대 등 인스턴스마다 다른 것 | ❌ 안 함 |
| **2. CSS 토큰** | 색·폰트·컨트롤 높이·사이드바 폭 등 테마 전역 | ❌ 안 함 (소비 `:root`에 덮어쓰기) |
| **3. 키트 수정** | 마운트 id, 배포 폰트, 빠른 바 칸 수, 없는 프롭/컴포넌트 | ✅ 키트 저장소에서 고쳐 push → 태그 올려 소비 프로젝트가 따라옴 |

> 원칙(왜 이렇게 생겼는가)은 [PRINCIPLES.md](PRINCIPLES.md), 프롭 사용법은
> [README.md](README.md)에 있습니다. 이 문서는 그 둘에 흩어진 "바꾸는 지점"만
> 모읍니다 — 재작성이 아니라 색인입니다.

---

## 1층 — 프롭으로 갈아 끼우기 (키트 수정 없음)

프로젝트마다 달라야 하는 **문구·데이터·표시 방식**은 전부 프롭입니다. 컴포넌트를
포크하거나 마크업을 새로 짜지 마세요 — 프롭으로 안 되는 게 있으면 그건 3층입니다.

### DateWheelPicker (날짜 · 연월 픽커)

| 프롭 | 기본값 | 언제 바꾸나 |
|---|---|---|
| `fields` | `["year","month","day"]` | **연·월 픽커**(`["year","month"]`)나 연도만 픽커. 값은 늘 `YYYY-MM-DD`(빠진 열=01), min/max는 남은 최소 단위로 비교 |
| `labels` | 한국어 | 다른 언어. `placeholder`·`hint`·`today`·`clear`·`done`·`previous`·`next`·`select`·`weekdays[7]`·`units{year,month,day}` 중 **필요한 키만**. `hint`는 팝오버 머리말에만 나옵니다 — 키 조작은 팝오버를 열지 않아도 되므로 그 문구가 조작의 전부를 안내하지는 않습니다 |
| `timeZone` | `"Asia/Seoul"` | "오늘"의 기준 시간대 |
| `min` / `max` | 없음 | 선택 가능 범위(풀 ISO 날짜) |
| `allowClear` | `false` | "비우기" 버튼 노출(선택형 날짜) |
| `ariaLabel` | — (**필수**) | 접근성 이름의 **접두사** — 트리거의 이름은 `"${ariaLabel}, ${보이는 값}"`이라 값이 함께 읽힙니다. 그리고 **팝오버 머리말로도 그려집니다**, 그래서 기본값이 없습니다: 있으면 한 폼의 날짜 필드가 전부 같은 머리말을 답니다 |
| `heading` | `ariaLabel` | 머리말에 **보이는** 글자만 따로. 머리말에는 `"날짜"`, 이름으로는 `"거래 발생 날짜"`처럼 갈라야 할 때 |
| `mobileBottomInset` | `78` | 모바일 하단 고정 바를 피할 높이 |

### Select (드롭다운)

| 프롭 | 기본값 | 언제 바꾸나 |
|---|---|---|
| `ariaLabel` | — (필수) | 접근성 이름 |
| `options` | — | 목록 데이터 `[{value,label,disabled?}]` |
| `placeholder` | `"선택하세요"` | 비었을 때 문구 |
| `align` | `"left"` | `"center"` 가운데 정렬 |
| `portal` | `false` | 잘리는 조상 안(사이드바 슬롯·다이얼로그·스크롤 카드)이면 켜기 |

### Sidebar (사이드바)

| 프롭 | 언제 바꾸나 |
|---|---|
| `brand` | 앱 이름·로고 `{icon, title}` |
| `sections` | 내비 항목 `{id,label,icon,active,onSelect|href,badge}` + 그룹 `heading`·`pinToBottom` |
| `slot` | 상단 슬롯(예: 작업 공간 `Select` — `portal` 켜기) |
| `footer` | `{avatar,name,subtitle,actions}` |
| `labels` | 한국어 → 다른 언어(`collapse`·`expand`·`close`) |
| `collapsed`+`onToggleCollapse` | controlled. **접힘 상태 저장은 쓰는 쪽 책임**(localStorage) |

### AppShell (앱 셸)

| 프롭 | 언제 바꾸나 |
|---|---|
| `trailingSpace` | 페이지 **끝 여백**을 어떻게 둘지. `"adaptive"`(기본) / `"fixed"` |

**기본(`"adaptive"`)은 끝 여백이 스스로 스크롤을 만들지 않습니다.** 내용이 화면에
들어가면 남는 자리만 쓰고, 이미 넘치는 페이지에서는 여백이 그대로 남습니다 —
"볼 것이 없는데 스크롤바만 서는" 화면이 없어집니다.

```tsx
// 예전 동작으로 돌아가기: 언제나 --workspace-space-bottom 만큼
<AppShell trailingSpace="fixed" sidebar={<Sidebar … />}>…</AppShell>
```

**언제 `"fixed"`가 필요한가:** 앱이 페이지 끝 여백에 무언가를 기대고 있을 때입니다 —
직접 띄운 고정 바 자리, 끝에 붙는 플로팅 버튼처럼. `"fixed"`면 킷이 **재지도
관찰하지도 않습니다.**

> ⚠️ **모바일에는 영향이 없습니다.** 그쪽 하단 패딩은 숨 쉴 공간이 아니라 고정 바
> 자리와 키보드 보정이 읽는 값이라 성격이 다르고, 이 장치가 아예 꺼져 있습니다.

### 그 밖의 문구·데이터 프롭

- **SectionTabs**: `ariaLabel`, `tabs`(`[{value,label}]`)
- **PageHeader / SectionHeading**: `eyebrow`, `title`, `description`
- **Panel**: `title`, `hint`, `actions` (전부 optional — 없으면 머리말을 안 그림)
- **MobileQuickBar**: `items`(**정확히 3개**), `barRef`
- **Dialog**: `ariaLabel`(필수·고유), `wide`, `scroll`, `closeOnBackdrop`·`closeOnEscape`·`closeOnBack`
- **ThemeColorEditor**: `theme`, `groups`(토큰 이름표·설명 교체 또는 새 토큰 추가), `onChange`

> ⚠️ `labels`·`groups`처럼 **키가 있는 표를 갈아 끼울 때는 키 이름이 키트 쪽과
> 같아야** 합니다. 로직이 키트 목록으로 돌기 때문에 이름이 어긋나면 에러 없이
> 조용히 동작하지 않습니다. 바꾼 키를 테스트로 묶어 두세요.

---

## 2층 — CSS 토큰 덮어쓰기 (키트 수정 없음)

색·폰트·컨트롤 높이 같은 **테마 전역**은 컴포넌트 CSS가 전부 `css/tokens.css`의
커스텀 프로퍼티만 참조합니다. 그래서 **키트 CSS를 import 한 뒤, 소비 프로젝트의
CSS에서 같은 변수를 다시 정의**하면 그걸로 끝입니다. 라이트·다크 **양쪽 다** 주세요.

```css
/* 진입점: 키트 CSS를 먼저, 내 CSS를 나중에 */
@import "kkqq-ui-basic-kit/css/index.css";

:root                    { --accent: #b3542f; }   /* 라이트 */
:root[data-theme="dark"] { --accent: #e07a4d; }   /* 다크 */
```

바꿀 수 있는 대표 토큰:

| 묶음 | 토큰 |
|---|---|
| 강조·브랜드 | `--accent`, `--accent-soft`, `--deep` |
| 상태색 | `--green`, `--green-soft`, `--orange`, `--red`, `--gold` |
| 표면·선·글자 | `--bg`, `--surface`, `--surface-soft`, `--input`, `--sidebar`, `--line`, `--text`, `--muted` |
| 타이포 | `--font-family-base`, `--font-size-*`(control 13 / nav 14 / section-title 18 / dialog-title 20 / page-title 31 …) |
| 컨트롤 높이 | `--action-height`(38), `--compact-action-height`(32), `--action-min-width`(88), `--compact-action-min-width`(64) |
| 드롭다운 기하 | `--dropdown-inline-padding`(12), `--dropdown-icon-box`(18), `--dropdown-icon-size`(13), `--dropdown-option-hover-*` |
| 사이드바 | `--sidebar-width`(238), `--sidebar-width-collapsed`(76), `--sidebar-motion`, `--sidebar-ease` |
| 스크롤바·모션 | `--scrollbar-size`(4), `--scrollbar-thumb`, `--scrollbar-thumb-hover`, `--motion-fast`(140ms) |
| 날짜 활성 세그먼트 | `--date-segment-active-background`, `--date-segment-active-text` (아래 주의) |

> ⚠️ **날짜 활성 세그먼트 둘은 짝입니다.** 기본값이 `var(--text)`와 `var(--input)`이라
> **반전**(칩은 글자색, 글자는 필드색)이고, 그래서 `--text`·`--input`만 바꿔도 저절로
> 따라옵니다 — 보통은 이 둘을 **건드릴 필요가 없습니다.**
>
> 굳이 바꾼다면 **반드시 둘 다** 바꾸세요. 하나만 덮으면 반전 관계가 깨져 칩 위 글자가
> 안 읽힐 수 있습니다. 킷의 대비 테스트는 **킷 자신의 값만** 검사하므로 소비자가 넣은
> 값에 대해서는 아무것도 보장하지 않습니다. 기준은 킷이 쓰는 것과 같습니다 —
> **칩 위 글자 대비 4.5 이상(WCAG AA), 칩과 `--input` 대비 2.0 이상.**

### 색을 바꾸는 두 갈래

같은 색이라도 목적에 따라 손대는 곳이 다릅니다:

1. **개발자 기본값** — 위처럼 소비 `:root`에 토큰을 다시 정의. 그 프로젝트가
   **처음부터 갖는** 팔레트가 바뀝니다.
2. **사용자 런타임 편집** — `ThemeColorEditor`를 화면에 두면 **최종 사용자**가
   팔레트를 직접 바꿉니다. 값은 브라우저 `localStorage`(`themeColors:light` /
   `themeColors:dark`)에 저장되고 `:root`에 인라인으로 적용됩니다. **코드도 GitHub도
   안 건드립니다.** 두 갈래는 겹쳐 쓰입니다 — 편집기 값이 개발자 기본값 위에 얹힙니다.

### 새 색 토큰을 더하기 (키트 수정 없음)

편집기는 넘어온 `groups`의 토큰 집합만으로 읽기·기본값·저장·적용을 처리합니다. 그래서:

1. 소비 CSS에 커스텀 프로퍼티를 **라이트·다크 둘 다** 정의하고
   ```css
   :root { --brand-2: #ff8a3d; }  :root[data-theme="dark"] { --brand-2: #ffa866; }
   ```
2. 어딘가에서 실제로 쓰고 (`color: var(--brand-2)`),
3. `groups`에 항목을 더하면 (`[...THEME_TOKEN_GROUPS, { title:"브랜드", tokens:[{name:"--brand-2", …}] }]`)

편집기에 그 색이 뜨고 저장·적용됩니다 — 키트를 안 고치고 색이 늘어납니다.
(색 토큰은 누군가 `var(--x)`로 **써야** 화면에 나타납니다. 어디 쓸지는 코드가 정합니다.)

### 폰트 바꾸기

`css/fonts.css` import를 빼고 `--font-family-base`의 첫 항목만 바꾸면 됩니다(나머지
전부 이 변수를 참조). 번들되는 Pretendard Variable은 SIL OFL 1.1이라 그대로 실어
배포해도 되고, 조건은 `fonts/OFL.txt`를 폰트와 함께 두는 것뿐입니다. 시스템 폰트로
갈아탈 거면 `fonts.css`를 아예 안 실으면 됩니다.

### 페이지 끝 여백 크기

| 토큰 | 기본값 | 무엇 |
|---|---|---|
| `--workspace-space-bottom` | `80px` | 페이지 마지막 요소 아래 여백의 **최대** 크기 |

크기만 바꾸는 자리입니다. **동작**(스스로 스크롤을 만들지 않을 것인가)은 위 1층의
`AppShell`의 `trailingSpace` 프롭입니다. 둘은 짝입니다 — `trailingSpace="fixed"`면
이 토큰 값이 언제나 그대로 들어갑니다.

### 페이지 스크롤바 감추기

킷은 **데스크톱에서 페이지 스크롤바를 그립니다.** 감추고 싶으면 앱에서 이렇게 합니다
(스크롤 기능은 그대로 살아 있고, 그려지지만 않습니다):

```css
/* 앱의 CSS. 킷을 고치지 않습니다. */
html { scrollbar-gutter: auto; }        /* 예약하던 4px을 돌려받습니다 */
html, body, #root { scrollbar-width: none; -ms-overflow-style: none; }
html::-webkit-scrollbar,
body::-webkit-scrollbar,
#root::-webkit-scrollbar { display: none; width: 0; height: 0; }
```

> ⚠️ **대상을 `*`로 넓히지 마세요.** Select 메뉴·다이얼로그·날짜 팝오버·사이드바
> 서랍은 안쪽에서 스스로 스크롤하는데, 그것들의 스크롤바까지 감추면 **실제로 더
> 있는데 "더 있다"가 보이지 않습니다.** 페이지는 잘린 내용 자체가 그 신호를 주지만
> 안쪽 표면은 그렇지 않습니다. 이 킷이 실제로 한 번 그렇게 만들었고, 그래서 모바일
> 규칙도 위 셋으로 좁혀져 있습니다(PRINCIPLES §6).

> ⚠️ 감추면 "더 있다"를 알려 주는 것이 **잘린 내용뿐**이 됩니다. 끝이 딱 떨어져
> 보이는 화면에서는 아래에 더 있다는 것을 아무도 모릅니다. 감추기 전에 그 화면들을
> 한 번 보세요.

---

## 3층 — 키트를 고쳐야 하는 것 (경계)

여기부터는 이 저장소에서 고쳐 push 합니다. 소비 앱에 사본을 만들지 마세요 —
사본은 조용히 갈라집니다.

| 항목 | 왜 키트인가 | 대안 |
|---|---|---|
| **마운트 id `#root`** | 모바일에서 문서 대신 `#root`를 스크롤 호스트로 씀. 다른 id면 **에러 없이 스크롤이 죽음** | **가장 쉬운 길: 앱을 `#root`에 마운트.** 못 하면 세 곳(`tokens.css` 미디어쿼리 / `SectionTabs.tsx`의 `getElementById("root")` / `positioning.ts`의 `scrollRootId`)을 함께 바꿈 |
| **배포 폰트 교체** | `fonts/`에 실리는 TTF 자체를 바꾸는 것 | 폰트를 **쓰기만** 바꾸는 거면 2층(`--font-family-base` + fonts.css 제외) |
| **MobileQuickBar 칸 수** | CSS 그리드가 64px **3칸 고정** | 3개 전제를 지키거나, 다른 개수면 `tabs.css` 그리드 수정 |
| **없는 변형 (프롭으로 안 됨)** | 예: 이번 `fields`(연월 픽커), 색상 편집기 `groups` | 컴포넌트에 프롭을 더하고 테스트(`npm test`) 후 push |

> 새 프롭을 더했으면 원본 앱이 자기 CSS 사본을 들고 있는 컴포넌트는 **양쪽 CSS를
> 함께** 고쳐야 합니다. 예: `DateWheelPicker`의 `data-fields` 그리드 규칙은 키트
> `css/date-picker.css`와 앱 `frontend/src/styles.css` 둘 다에 있습니다.

---

## 새 프로젝트에 붙일 때 체크리스트

- [ ] 앱을 **`#root`**에 마운트했는가 (아니면 3곳 수정 — 3층)
- [ ] 진입점에서 `kkqq-ui-basic-kit/css/index.css`를 **먼저** import 하고 내 오버라이드를 나중에
- [ ] 브랜드 색이 다르면 `--accent`(+상태색)를 **라이트·다크 둘 다** 재정의
- [ ] 폰트가 다르면 `fonts.css` 빼고 `--font-family-base` 교체
- [ ] 영어권이면 `DateWheelPicker`·`Sidebar`의 `labels`, `Select`의 `placeholder`를 덮어씀
- [ ] 사이드바 접힘·테마 저장 키(`localStorage`)는 앱이 직접 관리(컴포넌트는 controlled)
- [ ] 최종 사용자에게 팔레트를 열어줄 거면 `ThemeColorEditor`를 배치
- [ ] `labels`·`groups`의 키 이름이 키트와 같은지 테스트로 고정

---

## localStorage 키 소유권

| 키 | 주인 | 비고 |
|---|---|---|
| `themeColors:light` / `themeColors:dark` | **키트** (`ThemeColorEditor`) | 사용자 팔레트 오버라이드 |
| 사이드바 접힘·테마 등 | **앱** | 키트는 controlled — 저장은 앱 책임(예: `sidebarCollapsed`, `theme`) |

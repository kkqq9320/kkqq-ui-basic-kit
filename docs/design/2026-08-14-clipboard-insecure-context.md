# 비보안 컨텍스트의 클립보드 — 실측과 인계

**2026-08-14 · 이 문서는 측정 기록이자 `DateWheelPicker`로 넘기는 인계장입니다.**

오너가 자체 호스팅 앱을 **LAN IP + 평문 http**로 열어 쓰다가 발견했습니다 —
날짜 필드에서 **복사도 붙여넣기도 안 됩니다.** `localhost`에서만 됩니다.

---

## 1. 원인 — 확정

```
origin=http://10.1.1.254:15277   isSecureContext=false   navigator.clipboard=undefined
Windows Chrome 151
```

`navigator.clipboard`가 **아예 `undefined`**입니다(거절이 아니라 부재). 그래서
`src/DateWheelPicker.tsx`의 두 함수가 **아무 일도 안 하고 끝납니다**:

```ts
void navigator.clipboard?.writeText(text).catch(() => {});   // undefined?.writeText → undefined, catch도 안 걸림
try { return (await navigator.clipboard?.readText()) ?? null; } catch { return null; }   // → null
```

🔴 **주석의 근거가 반증됐습니다.** 그 자리에 이렇게 적혀 있습니다:

> *"없거나 거절당하면 **조용히 아무것도 하지 않습니다.** … 데스크톱에서 실패하는
> 경우는 **권한 거절뿐**입니다."*

**"권한 거절뿐"이 아닙니다.** 두 번째 경우가 **비보안 컨텍스트**이고, 자체 호스팅을
IP로 접속하는 환경에서는 오히려 그쪽이 기본입니다. 조용한 실패를 정당화한 전제가
틀렸으므로 **최소한 사용자에게 알려야** 합니다.

## 2. 붙여넣기는 살릴 수 있습니다 — `preventDefault`가 죽이고 있었습니다

같은 페이지에서 세 가지 자리에 포커스를 두고 진짜 키보드로 `Ctrl+V`를 눌렀습니다.
**`event.clipboardData`는 권한도 보안 컨텍스트도 필요 없습니다.**

| 포커스 | `preventDefault` 안 부름 | `preventDefault` 부름 |
|---|---|---|
| `<span tabindex="0">` (**피커 필드와 같은 모양**) | **paste 옴**, 값 `"2026-08-14"` | **안 옴** |
| `<input type="text">` (대조군) | paste 옴 | 안 옴 |
| `<div contenteditable>` (대조군) | paste 옴 | 안 옴 |

**결론 둘:**

1. **편집 가능하지 않은 `<span>`에도 `paste` 이벤트가 옵니다.** 피커 필드의 모양
   그대로입니다 — 즉 원리상 막힌 게 아닙니다.
2. **`keydown`에서 `preventDefault()`를 부르면 `paste`가 아예 안 생깁니다.**
   지금 피커의 `Ctrl+V` 가드가 정확히 그것을 합니다:

   ```ts
   if ((event.ctrlKey || event.metaKey) && event.code === "KeyV") {
     event.preventDefault();   // ← 이 줄이 paste 이벤트를 없앱니다
     …
   }
   ```

⚠️ **구현 주의 — `event.target`을 믿지 마세요.** span 줄의 `paste` 이벤트는
`target`이 span이 아니라 **그 안의 `<b>`**였습니다(가장 깊은 요소). 이벤트는 버블하므로
**필드 요소에 리스너를 걸고 `currentTarget`을 쓰거나** `document.activeElement`로
판정하세요.

## 3. 복사도 살릴 수 있습니다 — `execCommand`가 여기서 동작합니다

같은 비보안 origin에서 `document.execCommand("copy")`(임시 `<textarea>` + `select()`)로
`kkqq-2026-08-14`를 복사한 뒤 **다른 칸에 붙여넣어 실제로 들어간 것을 확인했습니다.**
반환값만 믿지 않고 왕복으로 확인한 값입니다.

폐기 예정 API지만 **비보안 컨텍스트에서는 유일한 길**이고, **이 저장소에 이미 선례가
있습니다** — `demo/EventTracePanel.tsx`가 같은 이유로 같은 방식을 씁니다.

## 4. 그래서 인계 내용

| | 무엇 | 근거 |
|---|---|---|
| 1 | **`Ctrl+V`의 `preventDefault()`를 빼고** `paste` 이벤트에서 `clipboardData.getData("text")`로 읽기 | §2 표 |
| 2 | **복사에 `execCommand` 폴백** — `navigator.clipboard`가 없거나 실패하면 | §3 |
| 3 | **조용한 실패 제거** — 그래도 안 되면 사용자에게 알리기 | §1 |
| 4 | 주석의 *"실패하는 경우는 권한 거절뿐"* 정정 | §1 |

**1번은 순서를 바꾸는 일입니다.** 지금은 `keydown`에서 값을 읽어 넣는데, `paste`
이벤트를 쓰면 **브라우저가 붙여넣기를 시작한 뒤**에 값이 옵니다. `Ctrl+V`
`keydown`에서는 `preventDefault`만 빼고 아무것도 하지 않은 다음, `paste`
핸들러에서 파싱·설정하고 **거기서** `event.preventDefault()`를 부르면(기본 삽입이
일어날 자리가 없더라도 명시적으로) 됩니다.

⚠️ **보안 컨텍스트에서도 이 경로가 더 낫습니다** — `navigator.clipboard.readText()`는
브라우저에 따라 **권한 프롬프트**를 띄우는데, `paste` 이벤트는 사용자의 붙여넣기
제스처 그 자체라 프롬프트가 없습니다. 즉 폴백이 아니라 **주 경로로** 쓸 만합니다.

## 5. 못 쟀거나 안 잰 것

- **`Ctrl+X`(잘라내기)** — 이번에 안 쟀습니다. `cut` 이벤트도 같은 성질일 것으로
  보이지만 **재고 적으세요.**
- **사파리·파이어폭스** — Chrome 151에서만 쟀습니다.
- **모바일** — 폰에는 `Ctrl` 키가 없어 이 경로는 데스크톱 전용입니다(기존 주석의
  이 판단은 그대로 유효합니다).

## 6. 다시 재려면

`.claude/launch.json`의 **`kit-lan`** 항목이 `--host`로 킷을 띄웁니다
(`http://10.1.1.254:15277/`). 프로브 자체는 이 커밋에 안 들어 있습니다 —
필요하면 이 문서의 표를 보고 다시 만들면 됩니다. 재는 자리는 셋뿐입니다:
`isSecureContext` / `paste` 이벤트가 오는가 / `preventDefault`가 그걸 죽이는가.

> **`localhost`로 열면 아무 의미가 없습니다** — 보안 컨텍스트라 `navigator.clipboard`가
> 그냥 있습니다. 반드시 **IP로** 여세요.

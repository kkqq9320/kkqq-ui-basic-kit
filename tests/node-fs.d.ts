// 이 프로젝트는 @types/node를 의존성으로 두지 않는다(순수 브라우저용 킷이라
// package.json의 devDependencies에 없다) — 그래서 "node:fs"/"node:url"을 그냥
// import하면 tsc가 모듈을 찾지 못한다(TS2307). Dialog.test.tsx가 실제
// css/dialog.css 소스 텍스트로 CSS 전용 회귀(트랜지션 존재 여부 등, jsdom은
// 레이아웃 엔진이 없어 트랜지션을 계산하지 않으므로 소스 텍스트 고정이 유일한
// 방법이다)를 잡으려면 파일을 읽어야 하는데, 그 테스트가 실제로 쓰는 표면만
// 여기서 로컬로 선언한다 — 새 의존성을 추가하는 대신, 이 파일이 곧 그 대체다.
// 새 npm 패키지도, vite.config.ts 변경도 아니다.
//
// node:url의 URL을 따로 쓰는 이유: `@vitest-environment jsdom` 아래서는
// 전역 `URL`이 jsdom의 patched 버전이라, `new URL("../css/dialog.css",
// import.meta.url)`처럼 file: 베이스를 명시적으로 줘도 jsdom이 그걸 무시하고
// window.location(jsdom 기본값 http://localhost:3000/) 기준으로 풀어버린다(실측:
// 같은 호출이 http://localhost:3000/css/dialog.css로 resolve됨) — 그 결과로
// readFileSync에 file: 스킴이 아닌 URL이 들어가 "The URL must be of scheme
// file"로 던진다. node:url의 URL은 이 patch의 영향을 받지 않아 file: 베이스를
// 있는 그대로 존중한다.
declare module "node:fs" {
  // 여기서 그냥 `URL`을 쓰면 lib.dom.d.ts의 전역(DOM) URL 타입을 가리켜, 아래
  // node:url의 URL 인스턴스를 구조적으로 거부한다(hash/host/... DOM 전용 필드가
  // 없다는 이유로) — 그래서 node:url의 타입을 명시적으로 끌어와 그것만 받는다.
  import type { URL as NodeURL } from "node:url";
  export function readFileSync(path: NodeURL | string, encoding: "utf8"): string;
}
declare module "node:url" {
  export class URL {
    constructor(input: string, base?: string | URL);
    href: string;
  }
}

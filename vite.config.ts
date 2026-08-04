/* demo/ 실행과 tests/ 실행에만 쓰는 설정입니다.
 * 이 폴더를 다른 프로젝트로 복사할 때는 필요 없습니다 — 그 프로젝트의 빌드가
 * src/*.tsx와 css/*.css를 그대로 처리합니다.
 *
 *   데모:  node_modules/.bin/vite          (http://localhost:5273)
 *   테스트: node_modules/.bin/vitest run
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5273 },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    // 기본값 test.css.include: []는 .css 요청(?raw 포함)을 전부 빈 모듈로 목(mock)한다
    // (vitest/dist/config.d.ts) — 그러면 CSS 소스 텍스트를 문자 그대로 고정해 회귀를
    // 잡는 계약 테스트(예: tests/Dialog.test.tsx의 dialog.css 검사)가 항상 빈 문자열을
    // 검사하게 되어 절대 실패할 수 없다(실측: 이 include 없이는 `.css?raw`가 어떤 CSS
    // 파일이든 길이 0을 돌려준다). 여기서 include로 .css(및 ?raw 등 쿼리가 붙은
    // 변형)를 매칭해 실제 vite CSS 파이프라인이 처리하게 한다 — `\.css$`만으로는 쿼리
    // 문자열이 붙은 `dialog.css?raw` 같은 id를 못 잡으므로 `\?`도 종료 지점으로 허용한다.
    css: { include: [/\.css(\?|$)/] },
  },
});

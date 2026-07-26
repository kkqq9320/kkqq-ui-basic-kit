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
  test: { include: ["tests/**/*.test.{ts,tsx}"] },
});

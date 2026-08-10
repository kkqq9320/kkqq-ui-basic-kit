/// <reference types="vite/client" />

/* 번들 폰트의 라이선스 예외가 **LICENSE 파일 자체에** 남아 있는지 지킵니다.
 *
 * README는 처음부터 정확했습니다("소스 코드는 MIT, 번들 폰트는 별개"). 틀린 것은
 * `LICENSE`였습니다 — 예외 조항 없는 순수 MIT라, 그 파일만 읽는 쪽(자동 라이선스
 * 스캐너, GitHub의 라이선스 판정, `npm`의 메타데이터)에는 **OFL 폰트까지 MIT로**
 * **재배포한다고 주장**하고 있었습니다.
 *
 * 이 저장소가 문서에서 거짓을 배포한 것이 최소 세 번입니다("상태는 전부 controlled",
 * 설치 절, "Escape는 값을 바꾸지 않는다"). 그래서 산문으로 고치고 끝내지 않고 그물을
 * 답니다 — `css/*.css?raw` 계약 테스트와 같은 계열입니다.
 *
 * ⚠️ **요구를 하드코딩하지 않고 실제로 실리는 것에서 유도합니다.** 폰트 목록은
 * `import.meta.glob`으로 읽으므로, 두 번째 폰트를 넣으면 LICENSE가 그것을 이름으로
 * 부르기 전까지 빨개집니다.
 */
import { describe, expect, it } from "vitest";

import licenseText from "../LICENSE?raw";
import packageJsonText from "../package.json?raw";

/** 산문 계약은 **줄바꿈을 접고** 봅니다.
 *
 * ⚠️ 처음엔 원문 그대로 매칭했다가 `/may not be distributed under the name/`이
 * 초록인 트리에서 빨개졌습니다 — 그 문장이 "may not be" 다음에서 줄바꿈되기 때문입니다.
 * 개행을 못 넘는 정규식이 이 저장소에서 이미 세 번 사고를 냈고, 반대 방향으로도
 * 위험합니다: 뜻이 같은 재정렬에 빨개지는 파서는 과적합입니다. 그래서 **의미를 보는
 * 단정은 접힌 텍스트로**, 파일 경로처럼 정확한 토큰은 원문으로 봅니다. */
const licenseProse = licenseText.replace(/\s+/g, " ");
const packageJson = JSON.parse(packageJsonText) as { license: string; files: string[] };
const shippedFonts = Object.keys(import.meta.glob("../fonts/*.woff2")).map((path) => path.replace("../fonts/", ""));

describe("LICENSE는 번들 폰트를 MIT 밖으로 빼 둔다", () => {
  // 전제 확인 — 폰트가 하나도 안 실리면 아래 계약들은 지킬 대상이 없고, 그때
  // "0개를 전부 확인했다"는 공허한 통과가 됩니다.
  it("woff2 폰트가 실제로 실린다", () => {
    expect(shippedFonts.length).toBeGreaterThan(0);
  });

  // **하드코딩이 아니라 실린 목록에서 유도합니다.** 두 번째 폰트를 넣으면 이것이 먼저 빨개집니다.
  it("실리는 폰트를 LICENSE가 하나도 빠짐없이 이름으로 부른다", () => {
    expect(shippedFonts.filter((name) => !licenseText.includes(name))).toEqual([]);
  });

  // **`it`을 나눕니다** — 아래 넷은 같은 문단이 만드는 서로 다른 계약이라, 한 블록에 두면
  // 앞엣것이 터질 때 뒤엣것이 실행조차 안 됩니다.
  it("MIT가 폰트를 덮지 않는다고 명시한다", () => {
    expect(licenseProse).toMatch(/NOT covered by the MIT license/);
  });

  it("어느 라이선스인지 이름과 버전으로 말한다", () => {
    expect(licenseText).toMatch(/SIL Open Font License, Version 1\.1/);
  });

  // 전문이 어디 있는지 가리켜야 합니다 — OFL의 조건이 "라이선스 파일이 폰트와 함께
  // 다닌다"이므로, 그 자리를 안 알려주면 조건을 지키라고만 하고 방법을 안 주는 셈입니다.
  it("전문의 위치를 가리킨다", () => {
    expect(licenseText).toContain("fonts/OFL.txt");
  });

  // Reserved Font Name은 OFL의 실제 조항입니다(수정본을 같은 이름으로 배포 금지).
  //
  // ⚠️ **`/Reserved Font Name/`으로 찾으면 안 됩니다.** 그 문자열은 위 저작권 블록의
  // "with Reserved Font Name Pretendard"에도 있어서, **제약 문단을 통째로 지워도 통과**
  // 합니다(실측: 그 뮤테이션이 0 red였습니다). 한 파일 안에서 같은 말이 두 자리에
  // 서로 다른 일을 하고 있고, 이 테스트의 일은 뒤엣것입니다 — 그래서 **제약 자체의
  // 문장**을 찾습니다.
  it("Reserved Font Name 제약을 적어 둔다", () => {
    expect(licenseProse).toMatch(/may not be distributed under the name/);
  });

  // 저작권 블록의 RFN 표기는 별개 계약입니다(OFL이 요구하는 저작권 고지의 일부).
  // 위 테스트와 갈라 둬야 둘 중 하나가 사라질 때 어느 쪽인지 알 수 있습니다.
  it("저작권 고지에 Reserved Font Name 표기가 남아 있다", () => {
    expect(licenseProse).toMatch(/with Reserved Font Name Pretendard/);
  });
});

describe("패키지 메타데이터가 LICENSE와 같은 말을 한다", () => {
  // `files`에 fonts가 있는데 라이선스 식이 MIT뿐이면 메타데이터가 거짓입니다.
  it("fonts를 싣는다면 라이선스 식에도 OFL이 들어 있다", () => {
    expect(packageJson.files.includes("fonts") && !packageJson.license.includes("OFL")).toBe(false);
  });

  it("라이선스 식이 MIT와 OFL을 둘 다 말한다", () => {
    expect(packageJson.license).toBe("MIT AND OFL-1.1");
  });

  // 전문이 폰트와 함께 다녀야 하므로 `fonts` 디렉터리 통째로 실려야 합니다
  // (`OFL.txt`가 그 안에 있습니다).
  it("fonts 디렉터리가 배포 목록에 있다", () => {
    expect(packageJson.files).toContain("fonts");
  });
});

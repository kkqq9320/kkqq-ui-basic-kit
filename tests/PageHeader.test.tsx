// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PageHeader } from "../src/surfaces/PageHeader";

afterEach(cleanup);

describe("PageHeader: §7의 고정된 페이지 머리말", () => {
  it("설명이 없어도 빈 <p>를 남겨 다음 콘텐츠의 자리를 지킨다", () => {
    const { container } = render(<PageHeader eyebrow="설정" title="화면" />);
    const header = container.querySelector(".page-header") as HTMLElement;
    expect(header.querySelector(".eyebrow")?.textContent).toBe("설정");
    expect(header.querySelector("h1")?.textContent).toBe("화면");
    expect(header.querySelector("p")).not.toBeNull();
  });

  it("앱 className을 기본 page-header 옆에 붙인다", () => {
    const { container } = render(<PageHeader eyebrow="설정" title="화면" className="compact" />);
    expect([...container.firstElementChild!.classList].sort()).toEqual(["compact", "page-header"]);
  });
});

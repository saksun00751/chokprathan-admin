import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { PORTRAITS } from "@/domain/avatar";
import { StaffAvatar } from "./staff-avatar";

describe("office portraits", () => {
  test("draws a different picture for each one", () => {
    const pictures = PORTRAITS.map((p) => renderToStaticMarkup(createElement(StaffAvatar, { id: p.id })));
    expect(new Set(pictures).size).toBe(PORTRAITS.length);
    // Decorative either way: a drawing hidden from screen readers, or an image with empty alt text.
    for (const picture of pictures) expect(picture).toMatch(/^<svg[^>]+aria-hidden="true"|<img[^>]+alt=""/);
  });
});

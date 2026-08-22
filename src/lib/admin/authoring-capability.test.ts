import { describe, expect, it } from "vitest";
import { isKeyboardAuthoringDevice, wideReviewLayoutQuery } from "./authoring-capability";

describe("desktop authoring capability", () => {
  it("tracks the Tailwind md breakpoint in rem units", () => {
    expect(wideReviewLayoutQuery).toBe("(min-width: 48rem)");
  });

  it("accepts a keyboard-oriented desktop device class", () => {
    expect(isKeyboardAuthoringDevice({ platform: "Win32", maxTouchPoints: 0, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe(true);
  });

  it.each([
    { userAgentData: { mobile: true }, userAgent: "Mozilla/5.0" },
    { platform: "MacIntel", maxTouchPoints: 5, userAgent: "Mozilla/5.0 (Macintosh)" },
    { platform: "Linux armv8l", maxTouchPoints: 5, userAgent: "Mozilla/5.0 (Linux; Android 15; Tablet)" },
  ])("rejects a touch-first mobile or tablet device class", (snapshot) => {
    expect(isKeyboardAuthoringDevice(snapshot)).toBe(false);
  });
});

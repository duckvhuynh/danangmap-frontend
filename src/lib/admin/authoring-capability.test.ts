import { afterEach, describe, expect, it, vi } from "vitest";
import {
  desktopAuthoringQuery,
  getDesktopAuthoringCapability,
  isKeyboardAuthoringDevice,
  wideReviewLayoutQuery,
} from "./authoring-capability";

afterEach(() => vi.unstubAllGlobals());

describe("desktop authoring capability", () => {
  it("tracks the Tailwind md breakpoint in rem units", () => {
    expect(wideReviewLayoutQuery).toBe("(min-width: 48rem)");
  });

  it("requires desktop width and precise input for authoring", () => {
    expect(desktopAuthoringQuery).toBe("(min-width: 64rem) and (hover: hover) and (pointer: fine)");
  });

  it.each([390, 768, 1023, 1440])("gates a %i px pointer-fine desktop viewport", (width) => {
    vi.stubGlobal("navigator", { platform: "Win32", maxTouchPoints: 0, userAgent: "Windows" });
    vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query === desktopAuthoringQuery && width >= 1024 }) });
    expect(getDesktopAuthoringCapability()).toBe(width >= 1024);
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

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminSession } from "@/components/admin/admin-session";
import type { AdminPrincipal } from "@/lib/api/admin";
import { RevisionReview } from "./revision-review";

vi.mock("@/components/admin/admin-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/admin/admin-session")>()),
  useAdminSession: vi.fn(),
}));

vi.mock("@/components/admin/review-map-preview", () => ({
  ReviewMapPreview: () => <div aria-label="Map preview deterministic fallback"/>,
}));

const principal: AdminPrincipal = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "publisher@example.gov.vn",
  username: "publisher01",
  displayName: "Publisher 01",
  role: "publisher",
  status: "active",
  mfaEnabled: true,
  mustChangePassword: false,
};

function setCapability(input: { mediaMatches: boolean; userAgent: string; platform: string; maxTouchPoints: number }) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: input.mediaMatches, media: "", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }),
  });
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: input.userAgent });
  Object.defineProperty(navigator, "platform", { configurable: true, value: input.platform });
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: input.maxTouchPoints });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE = "true";
  window.sessionStorage.setItem("danangmap-demo-role", "publisher");
  window.sessionStorage.setItem("danangmap-demo-revision-status", "approved");
  vi.mocked(useAdminSession).mockReturnValue({ principal, csrfToken: "csrf-fixed", refreshCsrf: vi.fn(), clearClientPrincipal: vi.fn() });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  delete process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE;
  vi.clearAllMocks();
});

describe("revision review publication capability", () => {
  it.each([
    ["mobile touch", { mediaMatches: false, userAgent: "Mozilla/5.0 (Linux; Android 15; Mobile)", platform: "Linux armv8l", maxTouchPoints: 5 }],
    ["tablet with a fine pointer", { mediaMatches: true, userAgent: "Mozilla/5.0 (Macintosh; iPad)", platform: "MacIntel", maxTouchPoints: 5 }],
  ] as const)("does not render publish form or action on %s", async (_name, capability) => {
    setCapability(capability);
    render(<RevisionReview revisionId="22222222-2222-4222-8222-222222222222"/>);
    expect(await screen.findByText(/chế độ chỉ đọc/u)).toBeInTheDocument();
    expect(screen.queryByLabelText("Ghi chú công bố")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Công bố revision" })).not.toBeInTheDocument();
  });

  it("renders the synchronous publish action on a keyboard-oriented desktop", async () => {
    setCapability({ mediaMatches: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 });
    render(<RevisionReview revisionId="22222222-2222-4222-8222-222222222222"/>);
    const releaseNote = await screen.findByLabelText("Ghi chú công bố");
    const publish = screen.getByRole("button", { name: "Công bố revision" });
    expect(publish).toBeDisabled();
    fireEvent.change(releaseNote, { target: { value: "Công bố dữ liệu đã được duyệt" } });
    expect(publish).toBeEnabled();
  });
});

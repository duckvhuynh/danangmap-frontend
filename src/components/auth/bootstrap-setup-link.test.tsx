import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootstrapSetupLink } from "./bootstrap-setup-link";
import { getBootstrapStatus } from "@/lib/api/bootstrap";

vi.mock("@/lib/api/bootstrap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/bootstrap")>()),
  getBootstrapStatus: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getBootstrapStatus).mockReset();
});

afterEach(() => cleanup());

describe("login bootstrap discovery", () => {
  it("links to setup only while the backend reports bootstrap available", async () => {
    vi.mocked(getBootstrapStatus).mockResolvedValue({ available: true });
    render(<BootstrapSetupLink />);
    const link = await screen.findByRole("link", { name: "Tạo System Admin" });
    expect(link).toHaveAttribute("href", "/setup");
  });

  it.each([
    ["unavailable", false],
    ["unreachable", true],
  ])("fails closed when bootstrap is %s", async (_name, rejects) => {
    if (rejects) vi.mocked(getBootstrapStatus).mockRejectedValue(new Error("offline"));
    else vi.mocked(getBootstrapStatus).mockResolvedValue({ available: false });
    render(<BootstrapSetupLink />);
    await vi.waitFor(() => expect(getBootstrapStatus).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole("link", { name: "Tạo System Admin" }),
    ).not.toBeInTheDocument();
  });
});

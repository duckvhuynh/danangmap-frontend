import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";
import { login } from "@/lib/api/auth";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/auth")>()),
  login: vi.fn(),
}));

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  vi.mocked(login).mockReset();
});

afterEach(cleanup);

function submit() {
  fireEvent.change(screen.getByLabelText("Tên đăng nhập hoặc email"), {
    target: { value: "system.admin" },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu"), {
    target: { value: "Strong-password-2026!" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
}

describe("LoginForm MFA policy transitions", () => {
  it("opens admin directly for an authenticated session", async () => {
    vi.mocked(login).mockResolvedValue({
      status: "authenticated",
      mfaEnrollmentRequired: false,
      principal: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "admin@danang.gov.vn",
        username: "system.admin",
        displayName: "System Admin",
        role: "system_admin",
        status: "active",
        mfaEnabled: false,
        mustChangePassword: false,
      },
    });
    render(<LoginForm />);
    submit();

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("keeps the MFA challenge route when the server requires it", async () => {
    vi.mocked(login).mockResolvedValue({
      status: "mfa_required",
      mfaEnrollmentRequired: true,
      challengeExpiresAt: "2026-08-28T12:00:00.000Z",
    });
    render(<LoginForm />);
    submit();

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        "/login/mfa?enrollment=required",
      ),
    );
  });
});

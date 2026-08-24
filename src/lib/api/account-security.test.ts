import { describe, expect, it } from "vitest";
import { createDanangMapClient } from "./generated/client";
import {
  changePassword,
  confirmPasswordReset,
  regenerateRecoveryCodes,
  requestPasswordReset,
  revokeAllSessions,
} from "./account-security";

const jsonHeaders = { "content-type": "application/json" };
const envelope = (data: unknown) =>
  JSON.stringify({ data, meta: { requestId: "request-security" } });
const key = "11111111-1111-4111-8111-111111111111";
const principal = {
  id: key,
  email: "editor@danang.gov.vn",
  username: "editor",
  displayName: "Editor",
  role: "editor" as const,
  status: "active" as const,
  mfaEnabled: true,
  mustChangePassword: false,
};

function csrfResponse() {
  return new Response(envelope({ csrfToken: "csrf-security" }), {
    status: 200,
    headers: jsonHeaders,
  });
}

describe("generated account-security boundary", () => {
  it("acquires CSRF and sends typed password change with caller idempotency and credentials", async () => {
    const requests: Request[] = [];
    const client = createDanangMapClient(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.endsWith("/auth/csrf")) return csrfResponse();
      return new Response(
        envelope({
          status: "password_changed",
          sessionsRevoked: 2,
          sessionRotated: true,
          principal,
        }),
        { status: 200, headers: jsonHeaders },
      );
    });

    await expect(
      changePassword(
        {
          currentPassword: "Current-password-2026!",
          newPassword: "New-password-2026!",
          passwordConfirmation: "New-password-2026!",
        },
        key,
        client,
      ),
    ).resolves.toMatchObject({ status: "password_changed", sessionRotated: true });

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/v1/auth/csrf",
      "/api/v1/auth/password/change",
    ]);
    expect(requests.every((request) => request.credentials === "include")).toBe(true);
    expect(requests[1].headers.get("x-csrf-token")).toBe("csrf-security");
    expect(requests[1].headers.get("idempotency-key")).toBe(key);
    expect(await requests[1].clone().json()).toEqual({
      currentPassword: "Current-password-2026!",
      newPassword: "New-password-2026!",
      passwordConfirmation: "New-password-2026!",
    });
  });

  it("keeps reset request generic and sends one caller key without CSRF", async () => {
    const requests: Request[] = [];
    const client = createDanangMapClient(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return new Response(envelope({ status: "accepted" }), {
        status: 202,
        headers: jsonHeaders,
      });
    });

    await expect(requestPasswordReset("editor@danang.gov.vn", key, client)).resolves.toEqual({
      status: "accepted",
    });
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).pathname).toBe("/api/v1/auth/password/reset:request");
    expect(requests[0].credentials).toBe("include");
    expect(requests[0].headers.get("idempotency-key")).toBe(key);
    expect(requests[0].headers.get("x-csrf-token")).toBeNull();
    expect(await requests[0].clone().json()).toEqual({ email: "editor@danang.gov.vn" });
  });

  it("acquires public CSRF for body-only reset token and never places it in the URL", async () => {
    const requests: Request[] = [];
    const resetToken = "reset_token_abcdefghijklmnopqrstuvwxyz123456";
    const client = createDanangMapClient(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.endsWith("/auth/csrf")) return csrfResponse();
      return new Response(
        envelope({ status: "password_reset", loginRequired: true, sessionsRevoked: 3 }),
        { status: 200, headers: jsonHeaders },
      );
    });

    await expect(
      confirmPasswordReset(
        {
          token: resetToken,
          password: "New-password-2026!",
          passwordConfirmation: "New-password-2026!",
        },
        client,
      ),
    ).resolves.toMatchObject({ status: "password_reset", loginRequired: true });
    expect(requests[1].url).not.toContain(resetToken);
    expect(new URL(requests[1].url).pathname).toBe("/api/v1/auth/password/reset:confirm");
    expect(requests[1].headers.get("x-csrf-token")).toBe("csrf-security");
    expect(await requests[1].clone().json()).toEqual({
      token: resetToken,
      password: "New-password-2026!",
      passwordConfirmation: "New-password-2026!",
    });
  });

  it("acquires fresh CSRF and sends revoke-all with a stable caller key", async () => {
    const requests: Request[] = [];
    const client = createDanangMapClient(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.endsWith("/auth/csrf")) return csrfResponse();
      return new Response(
        envelope({
          status: "sessions_revoked",
          revokedCount: 4,
          currentSessionRevoked: true,
          loginRequired: true,
        }),
        { status: 200, headers: jsonHeaders },
      );
    });

    await expect(revokeAllSessions(key, client)).resolves.toMatchObject({
      status: "sessions_revoked",
      currentSessionRevoked: true,
    });
    expect(requests).toHaveLength(2);
    expect(requests[1].headers.get("x-csrf-token")).toBe("csrf-security");
    expect(requests[1].headers.get("idempotency-key")).toBe(key);
    expect(requests.every((request) => request.credentials === "include")).toBe(true);
  });

  it("regenerates exactly ten one-time recovery codes with CSRF and caller idempotency", async () => {
    const requests: Request[] = [];
    const codes = Array.from({ length: 10 }, (_, index) => `ABCD-${String(index).padStart(4, "0")}-EF01-2345-6789`);
    const client = createDanangMapClient(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.endsWith("/auth/csrf")) return csrfResponse();
      return new Response(
        envelope({ status: "recovery_codes_regenerated", recoveryCodes: codes }),
        { status: 200, headers: jsonHeaders },
      );
    });

    await expect(regenerateRecoveryCodes({ password: "Current-password-2026!", mfaCode: "123456" }, key, client)).resolves.toEqual({
      status: "recovery_codes_regenerated",
      recoveryCodes: codes,
    });
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/v1/auth/csrf",
      "/api/v1/auth/mfa/recovery-codes:regenerate",
    ]);
    expect(requests[1].headers.get("x-csrf-token")).toBe("csrf-security");
    expect(requests[1].headers.get("idempotency-key")).toBe(key);
    expect(await requests[1].clone().json()).toEqual({ password: "Current-password-2026!", mfaCode: "123456" });
  });

  it("rejects a malformed recovery-code success without exposing partial data", async () => {
    let calls = 0;
    const client = createDanangMapClient(async () => {
      calls += 1;
      return calls === 1
        ? csrfResponse()
        : new Response(envelope({ status: "recovery_codes_regenerated", recoveryCodes: ["NOT-A-CODE"] }), {
            status: 200,
            headers: jsonHeaders,
          });
    });
    await expect(
      regenerateRecoveryCodes({ password: "Current-password-2026!", mfaCode: "123456" }, key, client),
    ).rejects.toMatchObject({ code: "CONTRACT_INVALID" });
  });

  it("marks only post-dispatch transport failures as ambiguous and preserves explicit status metadata", async () => {
    let calls = 0;
    const changeClient = createDanangMapClient(async () => {
      calls += 1;
      if (calls === 1) return csrfResponse();
      throw new TypeError("connection reset");
    });
    await expect(
      changePassword(
        {
          currentPassword: "Current-password-2026!",
          newPassword: "New-password-2026!",
          passwordConfirmation: "New-password-2026!",
        },
        key,
        changeClient,
      ),
    ).rejects.toMatchObject({ code: "NETWORK_AMBIGUOUS", ambiguous: true });

    const csrfClient = createDanangMapClient(async () => {
      throw new TypeError("offline");
    });
    await expect(
      confirmPasswordReset(
        {
          token: "z".repeat(43),
          password: "New-password-2026!",
          passwordConfirmation: "New-password-2026!",
        },
        csrfClient,
      ),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR", ambiguous: false });

    const rateClient = createDanangMapClient(async () =>
      new Response(
        JSON.stringify({ status: 429, code: "RATE_LIMITED", message: "limited" }),
        { status: 429, headers: { ...jsonHeaders, "retry-after": "30" } },
      ),
    );
    await expect(requestPasswordReset("editor@danang.gov.vn", key, rateClient)).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      retryAfterSeconds: 30,
      ambiguous: false,
    });
  });

  it("rejects malformed success envelopes at the runtime trust boundary", async () => {
    let calls = 0;
    const client = createDanangMapClient(async () => {
      calls += 1;
      return calls === 1
        ? csrfResponse()
        : new Response(envelope({ status: "password_reset", loginRequired: false }), {
            status: 200,
            headers: jsonHeaders,
          });
    });
    await expect(
      confirmPasswordReset(
        {
          token: "z".repeat(43),
          password: "New-password-2026!",
          passwordConfirmation: "New-password-2026!",
        },
        client,
      ),
    ).rejects.toMatchObject({ code: "CONTRACT_INVALID" });
  });
});

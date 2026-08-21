import { afterEach, describe, expect, it, vi } from "vitest";
import { createDanangMapClient } from "./generated/client";
import {
  AuthApiError,
  authErrorMessage,
  confirmMfaEnrollment,
  login,
  parseEnrollmentUri,
  startMfaEnrollment,
  verifyMfa,
} from "./auth";

const headers = { "content-type": "application/json" };
const envelope = (data: unknown) => JSON.stringify({ data, meta: { requestId: "request-1" } });
const principal = { id: "11111111-1111-4111-8111-111111111111", email: "editor@example.gov.vn", username: "editor", displayName: "Editor", role: "editor" as const, status: "active" as const, mfaEnabled: true, mustChangePassword: false };

afterEach(() => vi.unstubAllEnvs());

describe("session authentication transport", () => {
  it("acquires public CSRF then logs in with typed header and credentialed cookies", async () => {
    vi.stubEnv("NEXT_PUBLIC_DANANGMAP_DEMO_MODE", "false");
    const requests: Request[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.endsWith("/auth/csrf")) return new Response(envelope({ csrfToken: "csrf-public" }), { status: 200, headers });
      return new Response(envelope({ status: "mfa_required", mfaEnrollmentRequired: false, challengeExpiresAt: "2026-08-21T01:00:00.000Z" }), { status: 200, headers });
    };

    await expect(login("editor@example.gov.vn", "very-secure-password", createDanangMapClient(fetcher))).resolves.toMatchObject({ status: "mfa_required" });
    expect(requests.map((request) => request.url)).toEqual([
      "http://localhost:4000/api/v1/auth/csrf",
      "http://localhost:4000/api/v1/auth/login",
    ]);
    expect(requests.every((request) => request.credentials === "include")).toBe(true);
    expect(requests[1].headers.get("x-csrf-token")).toBe("csrf-public");
    expect(await requests[1].clone().json()).toEqual({ login: "editor@example.gov.vn", password: "very-secure-password" });
  });

  it("reuses the stable preauth CSRF token before verify, enrollment start and confirmation", async () => {
    vi.stubEnv("NEXT_PUBLIC_DANANGMAP_DEMO_MODE", "false");
    const requests: Request[] = [];
    const stablePreauthCsrf = "P".repeat(32);
    const recoveryCodes = Array.from({ length: 10 }, (_, index) => `ABCD-EF01-2345-6789-${String(index + 1).padStart(4, "0")}`);
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path.endsWith("/auth/csrf")) return new Response(envelope({ csrfToken: stablePreauthCsrf }), { status: 200, headers: { ...headers, "cache-control": "private, no-store" } });
      if (path.endsWith("/mfa/verify")) return new Response(envelope(principal), { status: 200, headers });
      if (path.endsWith("/mfa/enroll/confirm")) return new Response(envelope({ principal, recoveryCodes }), { status: 200, headers });
      return new Response(envelope({ status: "pending", enrollmentUri: "otpauth://totp/DanangMap%3Aeditor?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=DanangMap" }), { status: 200, headers });
    };
    const client = createDanangMapClient(fetcher);

    await verifyMfa("totp", "123456", client);
    await verifyMfa("recovery_code", "ABCD-EF01-2345-6789-0001", client);
    await startMfaEnrollment(client);
    await confirmMfaEnrollment("654321", client);

    const mutations = requests.filter((request) => request.method === "POST");
    expect(mutations.map((request) => request.headers.get("x-csrf-token"))).toEqual(Array(4).fill(stablePreauthCsrf));
    expect(requests.filter((request) => request.url.endsWith("/auth/csrf"))).toHaveLength(4);
    expect(mutations.every((request) => request.credentials === "include")).toBe(true);
    expect(await mutations[0].clone().json()).toEqual({ method: "totp", code: "123456" });
    expect(await mutations[1].clone().json()).toEqual({ method: "recovery_code", code: "ABCD-EF01-2345-6789-0001" });
    expect(await mutations[3].clone().json()).toEqual({ code: "654321" });
  });

  it("marks an enrollment POST network failure as ambiguous and does not hide 429 retry hints", async () => {
    vi.stubEnv("NEXT_PUBLIC_DANANGMAP_DEMO_MODE", "false");
    let calls = 0;
    const ambiguousClient = createDanangMapClient(async () => {
      calls += 1;
      if (calls === 1) return new Response(envelope({ csrfToken: "csrf-1" }), { status: 200, headers });
      throw new TypeError("connection reset");
    });
    await expect(startMfaEnrollment(ambiguousClient)).rejects.toMatchObject({ code: "NETWORK_AMBIGUOUS", ambiguous: true });

    const limitedClient = createDanangMapClient(async (input) => {
      if (String(input).endsWith("/auth/csrf")) return new Response(envelope({ csrfToken: "csrf-2" }), { status: 200, headers });
      return new Response(JSON.stringify({ status: 429, code: "AUTH_MFA_RATE_LIMITED", message: "limited", requestId: "request-rate" }), { status: 429, headers: { "content-type": "application/problem+json", "retry-after": "45" } });
    });
    const error = await verifyMfa("totp", "000000", limitedClient).catch((caught) => caught);
    expect(error).toMatchObject({ status: 429, code: "AUTH_MFA_RATE_LIMITED", retryAfterSeconds: 45 });
    expect(authErrorMessage(error, "verify")).toContain("45 giây");
  });

  it("validates the one-time enrollment URI and exactly ten recovery codes at the trust boundary", async () => {
    expect(parseEnrollmentUri("otpauth://totp/DanangMap%3Aeditor?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=DanangMap")).toMatchObject({ secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", accountLabel: "DanangMap:editor" });
    expect(() => parseEnrollmentUri("otpauth://totp/%E0%A4%A?secret=SHORT&issuer=DanangMap")).toThrow(AuthApiError);

    vi.stubEnv("NEXT_PUBLIC_DANANGMAP_DEMO_MODE", "false");
    const client = createDanangMapClient(async (input) => String(input).endsWith("/auth/csrf")
      ? new Response(envelope({ csrfToken: "csrf" }), { status: 200, headers })
      : new Response(envelope({ principal, recoveryCodes: ["only-one"] }), { status: 200, headers }));
    await expect(confirmMfaEnrollment("123456", client)).rejects.toMatchObject({ code: "CONTRACT_INVALID" });
  });
});

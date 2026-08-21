import { afterEach, describe, expect, it, vi } from "vitest";
import { createDanangMapClient } from "./generated/client";
import { login, verifyMfa } from "./auth";

afterEach(() => vi.unstubAllEnvs());

describe("session authentication transport", () => {
  it("uses the generated full path, login DTO, envelope and credentialed cookies", async () => {
    vi.stubEnv("NEXT_PUBLIC_DANANGMAP_DEMO_MODE", "false");
    const requests: Request[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return new Response(JSON.stringify({ data: { status: "mfa_required", mfaEnrollmentRequired: false, challengeExpiresAt: "2026-08-21T01:00:00.000Z" }, meta: { requestId: "test" } }), { status: 200, headers: { "content-type": "application/json", "set-cookie": "danangmap_preauth=test; HttpOnly" } });
    };
    const result = await login("editor@example.gov.vn", "very-secure-password", createDanangMapClient(fetcher));
    expect(result.status).toBe("mfa_required");
    expect(requests[0].url).toBe("http://localhost:4000/api/v1/auth/login");
    expect(requests[0].credentials).toBe("include");
    expect(await requests[0].clone().json()).toEqual({ login: "editor@example.gov.vn", password: "very-secure-password" });
  });

  it("verifies MFA using the pre-auth cookie policy and unwraps the principal envelope", async () => {
    vi.stubEnv("NEXT_PUBLIC_DANANGMAP_DEMO_MODE", "false");
    let request: Request | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      request = new Request(input, init);
      return new Response(JSON.stringify({ data: { id: "admin-1", role: "editor" }, meta: {} }), { status: 200, headers: { "content-type": "application/json" } });
    };
    await expect(verifyMfa("totp", "123456", createDanangMapClient(fetcher))).resolves.toMatchObject({ id: "admin-1", role: "editor" });
    expect(request?.url).toBe("http://localhost:4000/api/v1/auth/mfa/verify");
    expect(request?.credentials).toBe("include");
    expect(await request?.clone().json()).toEqual({ method: "totp", code: "123456" });
  });
});

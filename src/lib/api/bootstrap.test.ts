import { describe, expect, it } from "vitest";
import { createDanangMapClient } from "./generated/client";
import {
  BootstrapApiError,
  bootstrapErrorMessage,
  bootstrapSystemAdmin,
  getBootstrapStatus,
} from "./bootstrap";

const jsonHeaders = { "content-type": "application/json" };
const envelope = (data: unknown) =>
  JSON.stringify({ data, meta: { requestId: "request-bootstrap" } });
const input = {
  email: "admin@danang.gov.vn",
  username: "system.admin",
  displayName: "Quản trị hệ thống",
  password: "Civic-Map-Ready-2026!",
  passwordConfirmation: "Civic-Map-Ready-2026!",
};

describe("first-admin bootstrap generated-client boundary", () => {
  it("checks only the credentialed boolean status", async () => {
    const requests: Request[] = [];
    const client = createDanangMapClient(async (requestInput, init) => {
      const request = new Request(requestInput, init);
      requests.push(request);
      return new Response(envelope({ available: true }), {
        status: 200,
        headers: { ...jsonHeaders, "cache-control": "no-store" },
      });
    });

    await expect(getBootstrapStatus({}, client)).resolves.toEqual({
      available: true,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      "http://localhost:4000/api/v1/auth/bootstrap/status",
    );
    expect(requests[0].method).toBe("GET");
    expect(requests[0].credentials).toBe("include");
    expect(requests[0].cache).toBe("no-store");
  });

  it("acquires CSRF immediately before a credentialed create and keeps the setup token out of the body", async () => {
    const requests: Request[] = [];
    const client = createDanangMapClient(async (requestInput, init) => {
      const request = new Request(requestInput, init);
      requests.push(request);
      if (request.url.endsWith("/auth/csrf")) {
        return new Response(envelope({ csrfToken: "csrf-bootstrap" }), {
          status: 200,
          headers: jsonHeaders,
        });
      }
      return new Response(
        envelope({
          status: "mfa_required",
          mfaEnrollmentRequired: true,
          challengeExpiresAt: "2026-08-25T15:00:00.000Z",
        }),
        { status: 201, headers: jsonHeaders },
      );
    });

    await expect(
      bootstrapSystemAdmin(input, "T".repeat(43), client),
    ).resolves.toMatchObject({
      status: "mfa_required",
      mfaEnrollmentRequired: true,
    });

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/v1/auth/csrf",
      "/api/v1/auth/bootstrap/system-admin",
    ]);
    expect(requests.every((request) => request.credentials === "include")).toBe(
      true,
    );
    expect(requests[1].headers.get("x-csrf-token")).toBe("csrf-bootstrap");
    expect(requests[1].headers.get("x-initial-admin-bootstrap-token")).toBe(
      "T".repeat(43),
    );
    expect(await requests[1].clone().json()).toEqual(input);
    expect(JSON.stringify(await requests[1].clone().json())).not.toContain(
      "T".repeat(43),
    );
  });

  it("accepts a direct authenticated bootstrap result when MFA is disabled", async () => {
    let calls = 0;
    const principal = {
      id: "11111111-1111-4111-8111-111111111111",
      email: input.email,
      username: input.username,
      displayName: input.displayName,
      role: "system_admin" as const,
      status: "active" as const,
      mfaEnabled: false,
      mustChangePassword: false,
    };
    const client = createDanangMapClient(async () => {
      calls += 1;
      return calls === 1
        ? new Response(envelope({ csrfToken: "csrf" }), {
            status: 200,
            headers: jsonHeaders,
          })
        : new Response(
            envelope({
              status: "authenticated",
              mfaEnrollmentRequired: false,
              principal,
            }),
            { status: 201, headers: jsonHeaders },
          );
    });

    await expect(
      bootstrapSystemAdmin(input, "W".repeat(43), client),
    ).resolves.toEqual({
      status: "authenticated",
      mfaEnrollmentRequired: false,
      principal,
    });
  });

  it("rejects expanded or malformed success envelopes", async () => {
    const invalidStatus = createDanangMapClient(
      async () =>
        new Response(envelope({ available: "yes", userCount: 0 }), {
          status: 200,
          headers: jsonHeaders,
        }),
    );
    await expect(getBootstrapStatus({}, invalidStatus)).rejects.toMatchObject({
      code: "CONTRACT_INVALID",
    });

    let calls = 0;
    const invalidCreate = createDanangMapClient(async () => {
      calls += 1;
      return calls === 1
        ? new Response(envelope({ csrfToken: "csrf" }), {
            status: 200,
            headers: jsonHeaders,
          })
        : new Response(
            envelope({
              status: "mfa_required",
              mfaEnrollmentRequired: false,
              challengeExpiresAt: "tomorrow",
            }),
            { status: 201, headers: jsonHeaders },
          );
    });
    await expect(
      bootstrapSystemAdmin(input, "U".repeat(43), invalidCreate),
    ).rejects.toMatchObject({ code: "CONTRACT_INVALID" });
  });

  it("maps every public operational state without reflecting sensitive backend detail", () => {
    expect(
      bootstrapErrorMessage(
        new BootstrapApiError(401, "BOOTSTRAP_TOKEN_INVALID", "secret detail"),
        "create",
      ),
    ).toContain("Mã khởi tạo không đúng");
    expect(
      bootstrapErrorMessage(
        new BootstrapApiError(409, "BOOTSTRAP_ALREADY_COMPLETED", "detail"),
        "create",
      ),
    ).toContain("đã có tài khoản quản trị");
    expect(
      bootstrapErrorMessage(
        new BootstrapApiError(429, "RATE_LIMITED", "detail", undefined, 30),
        "create",
      ),
    ).toContain("30 giây");
    expect(
      bootstrapErrorMessage(
        new BootstrapApiError(503, "BOOTSTRAP_UNAVAILABLE", "detail"),
        "create",
      ),
    ).toContain("chưa được bật");
    expect(
      bootstrapErrorMessage(
        new BootstrapApiError(422, "BOOTSTRAP_PASSWORD_WEAK", "detail"),
        "create",
      ),
    ).not.toContain("detail");
  });

  it("marks only an in-flight create transport failure as unsafe to retry", async () => {
    let calls = 0;
    const createClient = createDanangMapClient(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(envelope({ csrfToken: "csrf" }), {
          status: 200,
          headers: jsonHeaders,
        });
      }
      throw new TypeError("connection reset");
    });
    await expect(
      bootstrapSystemAdmin(input, "V".repeat(43), createClient),
    ).rejects.toMatchObject({
      code: "NETWORK_AMBIGUOUS",
      ambiguous: true,
    });

    const statusClient = createDanangMapClient(async () => {
      throw new TypeError("offline");
    });
    await expect(getBootstrapStatus({}, statusClient)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      ambiguous: false,
    });
  });
});

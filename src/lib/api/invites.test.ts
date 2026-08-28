import { describe, expect, it } from "vitest";
import { createDanangMapClient } from "./generated/client";
import {
  InviteApiError,
  acceptInvite,
  inspectInvite,
  inviteErrorMessage,
} from "./invites";

const jsonHeaders = { "content-type": "application/json" };
const envelope = (data: unknown) =>
  JSON.stringify({ data, meta: { requestId: "request-invite" } });
const inspection = {
  maskedEmail: "ed***@danang.gov.vn",
  role: "editor" as const,
  expiresAt: "2026-08-22T08:00:00.000Z",
  requiresMfaEnrollment: true as const,
};

describe("public invite generated-client boundary", () => {
  it("inspects with one credentialed POST and no CSRF preflight call", async () => {
    const requests: Request[] = [];
    const client = createDanangMapClient(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return new Response(envelope(inspection), {
        status: 200,
        headers: jsonHeaders,
      });
    });

    await expect(inspectInvite("a".repeat(43), client)).resolves.toEqual(
      inspection,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      "http://localhost:4000/api/v1/auth/invites:inspect",
    );
    expect(requests[0].method).toBe("POST");
    expect(requests[0].credentials).toBe("include");
    expect(requests[0].headers.get("x-csrf-token")).toBeNull();
    expect(await requests[0].clone().json()).toEqual({ token: "a".repeat(43) });
  });

  it("acquires CSRF immediately before accepting with typed body and cookie credentials", async () => {
    const requests: Request[] = [];
    const client = createDanangMapClient(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.endsWith("/auth/csrf")) {
        return new Response(envelope({ csrfToken: "csrf-invite" }), {
          status: 200,
          headers: jsonHeaders,
        });
      }
      return new Response(
        envelope({
          status: "mfa_required",
          mfaEnrollmentRequired: true,
          challengeExpiresAt: "2026-08-21T15:00:00.000Z",
        }),
        { status: 200, headers: jsonHeaders },
      );
    });

    await expect(
      acceptInvite(
        {
          token: "b".repeat(43),
          password: "New-password-2026!",
          passwordConfirmation: "New-password-2026!",
        },
        client,
      ),
    ).resolves.toMatchObject({
      status: "mfa_required",
      mfaEnrollmentRequired: true,
    });

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/v1/auth/csrf",
      "/api/v1/auth/invites:accept",
    ]);
    expect(requests.every((request) => request.credentials === "include")).toBe(
      true,
    );
    expect(requests[1].headers.get("x-csrf-token")).toBe("csrf-invite");
    expect(await requests[1].clone().json()).toEqual({
      token: "b".repeat(43),
      password: "New-password-2026!",
      passwordConfirmation: "New-password-2026!",
    });
  });

  it("validates inspect and accept success envelopes at runtime", async () => {
    const invalidInspection = createDanangMapClient(
      async () =>
        new Response(envelope({ ...inspection, role: "owner" }), {
          status: 200,
          headers: jsonHeaders,
        }),
    );
    await expect(
      inspectInvite("c".repeat(43), invalidInspection),
    ).rejects.toMatchObject({
      code: "CONTRACT_INVALID",
    });

    let calls = 0;
    const invalidAcceptance = createDanangMapClient(async () => {
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
              challengeExpiresAt: "not-a-date",
            }),
            { status: 200, headers: jsonHeaders },
          );
    });
    await expect(
      acceptInvite(
        {
          token: "d".repeat(43),
          password: "New-password-2026!",
          passwordConfirmation: "New-password-2026!",
        },
        invalidAcceptance,
      ),
    ).rejects.toMatchObject({ code: "CONTRACT_INVALID" });
  });

  it("accepts disabled-MFA inspection and direct authenticated acceptance", async () => {
    const disabledInspection = { ...inspection, requiresMfaEnrollment: false };
    await expect(
      inspectInvite(
        "g".repeat(43),
        createDanangMapClient(
          async () =>
            new Response(envelope(disabledInspection), {
              status: 200,
              headers: jsonHeaders,
            }),
        ),
      ),
    ).resolves.toEqual(disabledInspection);

    let calls = 0;
    const principal = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "editor@danang.gov.vn",
      username: "editor",
      displayName: "Editor",
      role: "editor" as const,
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
            { status: 200, headers: jsonHeaders },
          );
    });
    await expect(
      acceptInvite(
        {
          token: "h".repeat(43),
          password: "New-password-2026!",
          passwordConfirmation: "New-password-2026!",
        },
        client,
      ),
    ).resolves.toEqual({
      status: "authenticated",
      mfaEnrollmentRequired: false,
      principal,
    });
  });

  it("keeps invalid invite states generic and exposes explicit operational states", () => {
    const invalidMessages = [400, 404, 410].map((status) =>
      inviteErrorMessage(
        new InviteApiError(
          status,
          "INVITE_INVALID_OR_EXPIRED",
          "backend detail",
        ),
        "inspect",
      ),
    );
    expect(new Set(invalidMessages).size).toBe(1);
    expect(invalidMessages[0]).not.toContain("backend detail");
    expect(
      inviteErrorMessage(
        new InviteApiError(429, "RATE_LIMITED", "limited", undefined, 45),
        "inspect",
      ),
    ).toContain("45 giây");
    expect(
      inviteErrorMessage(
        new InviteApiError(503, "SERVICE_UNAVAILABLE", "down"),
        "inspect",
      ),
    ).toContain("tạm gián đoạn");
    expect(
      inviteErrorMessage(
        new InviteApiError(409, "INVITE_ACCEPTANCE_CONFLICT", "conflict"),
        "accept",
      ),
    ).toContain("xung đột");
  });

  it("marks only an ambiguous accept transport failure as unsafe to retry", async () => {
    let acceptCalls = 0;
    const acceptClient = createDanangMapClient(async () => {
      acceptCalls += 1;
      if (acceptCalls === 1) {
        return new Response(envelope({ csrfToken: "csrf" }), {
          status: 200,
          headers: jsonHeaders,
        });
      }
      throw new TypeError("connection reset");
    });
    const caught = await acceptInvite(
      {
        token: "e".repeat(43),
        password: "New-password-2026!",
        passwordConfirmation: "New-password-2026!",
      },
      acceptClient,
    ).catch((error) => error);
    expect(caught).toMatchObject({
      code: "NETWORK_AMBIGUOUS",
      ambiguous: true,
    });

    const inspectClient = createDanangMapClient(async () => {
      throw new TypeError("offline");
    });
    await expect(
      inspectInvite("f".repeat(43), inspectClient),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      ambiguous: false,
    });
  });
});

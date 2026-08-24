import { describe, expect, it, vi } from "vitest";
import { createDanangMapClient } from "@/lib/api/generated/client";
import {
  createInvite,
  createUser,
  getAdminUser,
  listAdminInvites,
  listUsers,
  requestAdminUserPasswordReset,
  resendAdminInvite,
  resetAdminUserMfa,
  revokeAdminUserSession,
  revokeAllAdminUserSessions,
  revokeInvite,
  updateAdminUser,
} from "@/lib/api/users";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "editor@danang.gov.vn",
  username: "editor01",
  displayName: "Biên tập viên 01",
  role: "editor" as const,
  status: "active" as const,
  mfaEnabled: true,
  mustChangePassword: false,
  disabledAt: null,
  lockedUntil: null,
  lockVersion: 4,
  etag: '"user-11111111-1111-4111-8111-111111111111-v4"',
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  security: { activeSessionCount: 1, latestSessionCreatedAt: "2026-08-24T00:00:00.000Z", recoveryCodesRemaining: 8, pendingInviteCount: 0, pendingPasswordReset: false },
};

const detail = {
  ...user,
  failedLoginCount: 0,
  mfaEnabled: undefined,
  security: undefined,
  mfa: { enabled: true, status: "verified" as const, verifiedAt: "2026-08-20T00:00:00.000Z", recoveryCodesRemaining: 8, recoveryCodesConsumed: 2 },
  sessions: [{ id: "22222222-2222-4222-8222-222222222222", kind: "authenticated" as const, status: "active" as const, createdAt: "2026-08-24T00:00:00.000Z", expiresAt: "2026-08-31T00:00:00.000Z", revokedAt: null, userAgent: "Browser" }],
  invites: [],
  passwordResets: [],
};
delete detail.mfaEnabled;
delete detail.security;

const envelope = (data: unknown, meta: Record<string, unknown> = { requestId: "request-1" }) => JSON.stringify({ data, meta });
const response = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(envelope(data), { status, headers: { "content-type": "application/json", ...headers } });
function mockFetcher(factory: () => Response) {
  return vi.fn(async (...args: Parameters<typeof globalThis.fetch>) => {
    void args;
    return factory();
  });
}
async function requestParts(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : new Request(input, init);
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.clone().json().catch(() => undefined);
  return { url: new URL(request.url), method: request.method, headers: request.headers, credentials: request.credentials, body };
}

describe("generated System Admin users adapter", () => {
  it("passes cursor/search/filter and preserves pagination metadata", async () => {
    const fetcher = mockFetcher(() => response([user], 200));
    const client = createDanangMapClient(fetcher);
    await listUsers({ q: "editor", role: "editor", status: "active", cursor: "opaque:+/=", limit: 25 }, undefined, client);
    const request = await requestParts(fetcher.mock.calls[0][0], fetcher.mock.calls[0][1]);
    expect(request.credentials).toBe("include");
    expect(request.url.pathname).toBe("/api/v1/admin/users");
    expect(Object.fromEntries(request.url.searchParams)).toEqual({ q: "editor", role: "editor", status: "active", cursor: "opaque:+/=", limit: "25" });
  });

  it("returns safe user detail with the strong response ETag", async () => {
    const fetcher = mockFetcher(() => response(detail, 200, { etag: '"user-v5"' }));
    const result = await getAdminUser(user.id, undefined, createDanangMapClient(fetcher));
    expect(result).toEqual({ data: detail, etag: '"user-v5"' });
    const request = await requestParts(fetcher.mock.calls[0][0], fetcher.mock.calls[0][1]);
    expect(request.url.pathname).toBe(`/api/v1/admin/users/${user.id}`);
  });

  it("sends manual creation through generated CSRF and idempotency headers", async () => {
    const fetcher = mockFetcher(() => response(user, 201));
    const client = createDanangMapClient(fetcher);
    const body = { email: user.email, username: user.username, displayName: user.displayName, role: user.role, delivery: "manual" as const, temporaryPassword: "Temporary-123" };
    await createUser(body, "33333333-3333-4333-8333-333333333333", { csrfToken: "csrf-fixed" }, client);
    const request = await requestParts(fetcher.mock.calls[0][0], fetcher.mock.calls[0][1]);
    expect(request.headers.get("x-csrf-token")).toBe("csrf-fixed");
    expect(request.headers.get("idempotency-key")).toBe("33333333-3333-4333-8333-333333333333");
    expect(request.body).toEqual(body);
  });

  it("updates a user with CSRF, idempotency and If-Match", async () => {
    const fetcher = mockFetcher(() => response({ ...detail, displayName: "Tên mới", etag: '"user-v5"' }, 200, { etag: '"user-v5"' }));
    const client = createDanangMapClient(fetcher);
    await updateAdminUser(user.id, { displayName: "Tên mới", unlock: false }, user.etag, "44444444-4444-4444-8444-444444444444", { csrfToken: "csrf-update" }, client);
    const request = await requestParts(fetcher.mock.calls[0][0], fetcher.mock.calls[0][1]);
    expect(request.method).toBe("PATCH");
    expect(request.headers.get("if-match")).toBe(user.etag);
    expect(request.headers.get("x-csrf-token")).toBe("csrf-update");
    expect(request.body).toEqual({ displayName: "Tên mới", unlock: false });
  });

  it("lists, resends and revokes invitations without exposing credentials", async () => {
    const invite = { id: "55555555-5555-4555-8555-555555555555", email: "reviewer@danang.gov.vn", username: "reviewer01", displayName: "Kiểm duyệt viên", role: "reviewer" as const, status: "pending" as const, expiresAt: "2026-08-30T00:00:00.000Z", usedAt: null, revokedAt: null, acceptedUserId: null, supersedesInviteId: null, mailStatus: "sent", lockVersion: 1, etag: '"invite-v1"', createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z" };
    const listFetcher = mockFetcher(() => response([invite], 200));
    await listAdminInvites({ q: "reviewer", status: "pending", role: "reviewer", limit: 25 }, undefined, createDanangMapClient(listFetcher));
    expect((await requestParts(listFetcher.mock.calls[0][0])).url.pathname).toBe("/api/v1/admin/invites");

    const resendFetcher = mockFetcher(() => response({ ...invite, supersedesInviteId: invite.id, mailStatus: "pending", etag: '"invite-v2"' }, 202));
    await resendAdminInvite(invite.id, { reason: "Gửi lại theo yêu cầu", expiresInHours: 72 }, invite.etag, "66666666-6666-4666-8666-666666666666", { csrfToken: "csrf" }, createDanangMapClient(resendFetcher));
    const resendRequest = await requestParts(resendFetcher.mock.calls[0][0]);
    expect(resendRequest.headers.get("if-match")).toBe(invite.etag);
    expect(JSON.stringify(resendRequest.body)).not.toMatch(/token|credential/iu);

    const revokeFetcher = mockFetcher(() => response({ id: invite.id, status: "revoked", revokedAt: "2026-08-25T00:00:00.000Z" }, 200));
    await revokeInvite(invite.id, "77777777-7777-4777-8777-777777777777", { csrfToken: "csrf" }, createDanangMapClient(revokeFetcher));
    expect((await requestParts(revokeFetcher.mock.calls[0][0])).url.pathname).toContain(":revoke");
  });

  it.each([
    ["one session", (client: ReturnType<typeof createDanangMapClient>) => revokeAdminUserSession(user.id, "22222222-2222-4222-8222-222222222222", "Thiết bị không còn dùng", user.etag, "88888888-8888-4888-8888-888888888888", { csrfToken: "csrf" }, client)],
    ["all sessions", (client: ReturnType<typeof createDanangMapClient>) => revokeAllAdminUserSessions(user.id, "Thu hồi theo yêu cầu", user.etag, "99999999-9999-4999-8999-999999999999", { csrfToken: "csrf" }, client)],
    ["MFA", (client: ReturnType<typeof createDanangMapClient>) => resetAdminUserMfa(user.id, "Thiết bị MFA đã mất", user.etag, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { csrfToken: "csrf" }, client)],
    ["password reset", (client: ReturnType<typeof createDanangMapClient>) => requestAdminUserPasswordReset(user.id, "Người dùng yêu cầu", user.etag, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", { csrfToken: "csrf" }, client)],
  ])("protects %s mutation with reason and version headers", async (_label, call) => {
    const fetcher = mockFetcher(() => response({ userId: user.id, status: "sessions_revoked", scope: "all", sessionId: null, revokedCount: 1, etag: '"user-v5"' }, 200));
    await call(createDanangMapClient(fetcher));
    const request = await requestParts(fetcher.mock.calls[0][0]);
    expect(request.headers.get("x-csrf-token")).toBe("csrf");
    expect(request.headers.get("if-match")).toBe(user.etag);
    expect(request.headers.get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(request.body).toHaveProperty("reason");
  });

  it("uses the dedicated invitation creation route", async () => {
    const invite = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", email: "reviewer@danang.gov.vn", role: "reviewer" as const, status: "pending" as const, expiresAt: "2026-08-30T00:00:00.000Z" };
    const fetcher = mockFetcher(() => response(invite, 202));
    const body = { email: invite.email, username: "reviewer01", displayName: "Kiểm duyệt viên", role: invite.role, expiresInHours: 72 };
    await createInvite(body, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", { csrfToken: "csrf-invite" }, createDanangMapClient(fetcher));
    expect((await requestParts(fetcher.mock.calls[0][0])).url.pathname).toBe("/api/v1/admin/invites");
  });

  it.each([401, 403, 409, 412, 422, 428, 429])("preserves an explicit %i problem response", async (status) => {
    const fetcher = mockFetcher(() => new Response(JSON.stringify({ status, code: `USER_${status}`, message: `Chi tiết ${status}`, requestId: `request-${status}` }), { status, headers: { "content-type": "application/problem+json" } }));
    await expect(listUsers({}, undefined, createDanangMapClient(fetcher))).rejects.toMatchObject({ status, code: `USER_${status}`, requestId: `request-${status}` });
  });
});

import { describe, expect, it, vi } from "vitest";
import { createDanangMapClient } from "@/lib/api/generated/client";
import { createInvite, createUser, listUsers } from "@/lib/api/users";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "editor@danang.gov.vn",
  username: "editor01",
  displayName: "Biên tập viên 01",
  role: "editor" as const,
  status: "active" as const,
  mfaEnabled: true,
  mustChangePassword: false,
};

const envelope = (data: unknown, meta: Record<string, unknown> = { requestId: "request-1" }) => JSON.stringify({ data, meta });

function mockFetcher(response: () => Response) {
  return vi.fn(async (...args: Parameters<typeof globalThis.fetch>) => {
    void args;
    return response();
  });
}

async function requestParts(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : new Request(input, init);
  const body = request.method === "GET" ? undefined : await request.clone().json();
  return { url: new URL(request.url), method: request.method, headers: request.headers, credentials: request.credentials, body };
}

describe("generated System Admin users adapter", () => {
  it("lists real users with cookies and preserves pagination metadata", async () => {
    const fetcher = mockFetcher(() => new Response(envelope([user], { requestId: "request-1", nextCursor: null, hasMore: false, limit: 50 }), { status: 200, headers: { "content-type": "application/json" } }));
    const page = await listUsers(undefined, createDanangMapClient(fetcher));
    expect(page).toEqual({ data: [user], meta: { requestId: "request-1", nextCursor: null, hasMore: false, limit: 50 } });
    const request = await requestParts(fetcher.mock.calls[0][0], fetcher.mock.calls[0][1]);
    expect(request.url.pathname).toBe("/api/v1/admin/users");
    expect(request.method).toBe("GET");
    expect(request.credentials).toBe("include");
  });

  it("sends manual creation through the generated headers and body", async () => {
    const fetcher = mockFetcher(() => new Response(envelope(user), { status: 201, headers: { "content-type": "application/json" } }));
    const client = createDanangMapClient(fetcher);
    const body = { email: user.email, username: user.username, displayName: user.displayName, role: user.role, delivery: "manual" as const, temporaryPassword: "Temporary-123" };
    await expect(createUser(body, "11111111-1111-4111-8111-111111111111", { csrfToken: "csrf-fixed" }, client)).resolves.toEqual(user);
    const request = await requestParts(fetcher.mock.calls[0][0], fetcher.mock.calls[0][1]);
    expect(request.url.pathname).toBe("/api/v1/admin/users");
    expect(request.method).toBe("POST");
    expect(request.credentials).toBe("include");
    expect(request.headers.get("x-csrf-token")).toBe("csrf-fixed");
    expect(request.headers.get("idempotency-key")).toBe("11111111-1111-4111-8111-111111111111");
    expect(request.body).toEqual(body);
  });

  it("sends invitations through the dedicated generated endpoint", async () => {
    const invite = { id: "22222222-2222-4222-8222-222222222222", email: "reviewer@danang.gov.vn", role: "reviewer" as const, status: "pending" as const, expiresAt: "2026-08-24T00:00:00.000Z" };
    const fetcher = mockFetcher(() => new Response(envelope(invite), { status: 202, headers: { "content-type": "application/json" } }));
    const client = createDanangMapClient(fetcher);
    const body = { email: invite.email, username: "reviewer01", displayName: "Kiểm duyệt viên 01", role: invite.role, expiresInHours: 72 };
    await expect(createInvite(body, "22222222-2222-4222-8222-222222222222", { csrfToken: "csrf-invite" }, client)).resolves.toEqual(invite);
    const request = await requestParts(fetcher.mock.calls[0][0], fetcher.mock.calls[0][1]);
    expect(request.url.pathname).toBe("/api/v1/admin/invites");
    expect(request.headers.get("x-csrf-token")).toBe("csrf-invite");
    expect(request.headers.get("idempotency-key")).toBe("22222222-2222-4222-8222-222222222222");
    expect(request.body).toEqual(body);
  });

  it.each([401, 403, 409, 422])("preserves an explicit %i problem response", async (status) => {
    const fetcher = mockFetcher(() => new Response(JSON.stringify({ status, code: `USER_${status}`, message: `Chi tiết ${status}`, requestId: `request-${status}` }), { status, headers: { "content-type": "application/problem+json" } }));
    const promise = listUsers(undefined, createDanangMapClient(fetcher));
    await expect(promise).rejects.toMatchObject({ status, code: `USER_${status}`, message: `Chi tiết ${status}`, requestId: `request-${status}` });
  });
});

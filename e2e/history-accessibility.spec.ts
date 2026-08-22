import { expect, test, type Page } from "@playwright/test";

const layerId = "wards";
const revisionId = "22222222-2222-4222-8222-222222222222";
const snapshotId = "55555555-5555-4555-8555-555555555555";
const corsHeaders = {
  "access-control-allow-origin": "http://127.0.0.1:3100",
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,idempotency-key,if-match,x-csrf-token",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-expose-headers": "etag,retry-after",
};

function envelope(data: unknown) {
  return { data, meta: { requestId: "77777777-7777-4777-8777-777777777777" } };
}

async function mockHistoryApi(page: Page) {
  const revision = {
    id: revisionId,
    revisionNo: 3,
    status: "published",
    title: "Ranh giới phường xã",
    supersedesRevisionId: null,
    createdBy: "44444444-4444-4444-8444-444444444444",
    createdByDisplayName: "Editor 01",
    submittedAt: "2026-08-21T02:00:00.000Z",
    approvedAt: "2026-08-21T02:10:00.000Z",
    publishedAt: "2026-08-21T02:20:00.000Z",
    createdAt: "2026-08-21T01:00:00.000Z",
    updatedAt: "2026-08-21T02:20:00.000Z",
    featureCount: 1250,
    participantCount: 3,
    activeSnapshotId: snapshotId,
    activeGeneration: 7,
  };
  const publication = {
    snapshotId,
    layerId,
    revisionId,
    revisionNo: 3,
    status: "published",
    generation: 6,
    progress: 100,
    featureCount: 1250,
    bounds: [108.1, 16, 108.3, 16.2],
    checksum: "sha256:published",
    rollbackOf: null,
    publishedBy: "33333333-3333-4333-8333-333333333333",
    publishedByDisplayName: "Publisher 01",
    publishedAt: "2026-08-21T02:20:00.000Z",
    activatedAt: "2026-08-21T02:20:00.000Z",
    createdAt: "2026-08-21T02:20:00.000Z",
    isActive: false,
    rollbackEligibility: { eligible: true, reasonCode: null },
  };
  const auditEvent = {
    id: "66666666-6666-4666-8666-666666666666",
    actorId: "33333333-3333-4333-8333-333333333333",
    actorRole: "publisher",
    actorDisplayName: "Publisher 01",
    action: "publication.rolled_back",
    resourceType: "layer",
    resourceId: layerId,
    requestId: "77777777-7777-4777-8777-777777777777",
    beforeDigest: null,
    afterDigest: "sha256:after",
    metadata: { generation: 7 },
    occurredAt: "2026-08-21T02:20:00.000Z",
  };

  await page.route(`**/api/v1/admin/layers/${layerId}/history**`, (route) => route.fulfill({
    status: 200,
    headers: { ...corsHeaders, etag: '"history-revisions-v1"' },
    json: envelope({ items: [revision], nextCursor: null, hasMore: false, limit: 25 }),
  }));
  await page.route(`**/api/v1/admin/layers/${layerId}/publications**`, (route) => route.fulfill({
    status: 200,
    headers: { ...corsHeaders, etag: '"history-publications-v1"' },
    json: envelope({ items: [publication], activePointerEtag: '"pointer-v7"', nextCursor: null, hasMore: false, limit: 25 }),
  }));
  await page.route(`**/api/v1/admin/layers/${layerId}/publication-jobs**`, (route) => route.fulfill({
    status: 200,
    headers: { ...corsHeaders, etag: '"publication-jobs-v1"', "retry-after": "2" },
    json: envelope({ items: [], nextCursor: null, hasMore: false, limit: 25 }),
  }));
  await page.route(`**/api/v1/admin/layers/${layerId}/audit-events**`, (route) => route.fulfill({
    status: 200,
    headers: { ...corsHeaders, etag: '"history-audit-v1"' },
    json: envelope({ items: [auditEvent], nextCursor: null, hasMore: false, limit: 25 }),
  }));
  await page.route(`**/api/v1/admin/layers/${layerId}:rollback`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      status: 201,
      headers: { ...corsHeaders, etag: '"pointer-v8"' },
      json: envelope({
        status: "completed",
        publicationId: "88888888-8888-4888-8888-888888888888",
        snapshotId: "88888888-8888-4888-8888-888888888888",
        targetSnapshotId: snapshotId,
        activeRevisionId: revisionId,
        generation: 8,
      }),
    });
  });
}

test("publication history and rollback preserve keyboard focus and spoken status", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Rollback is desktop-only");
  await page.addInitScript(() => window.sessionStorage.setItem("danangmap-demo-role", "publisher"));
  await mockHistoryApi(page);
  await page.goto(`/admin/layers/${layerId}/history`);

  await expect(page.getByRole("main", { name: "Lịch sử Ranh giới phường xã" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Đã tải 1 publication, 1 revision và 1 sự kiện kiểm toán." })).toBeAttached();
  await expect(page.getByRole("table", { name: /Các publication snapshot/u })).toBeVisible();
  const metadata = page.getByLabel(/Metadata đã lọc cho publication\.rolled_back/u);
  await metadata.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel(/Nội dung metadata đã lọc cho publication\.rolled_back/u)).toBeVisible();

  const trigger = page.getByRole("button", { name: "Khôi phục bản này, generation 6" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const reason = page.getByLabel("Lý do khôi phục");
  await expect(reason).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await reason.fill("Khôi phục snapshot đã được đối chiếu");
  const confirmation = page.getByLabel("Nhập KHÔI PHỤC để xác nhận");
  await confirmation.fill("KHÔI PHỤC");
  await confirmation.press("Enter");
  const result = page.getByRole("status").filter({ hasText: "Khôi phục hoàn tất" });
  await expect(result).toContainText("Generation 8 đã được tạo");
  await expect(result).toBeFocused();
});

test("mobile revision review supports roving tabs and focuses workflow feedback", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("desktop"), "Mobile review keyboard regression");
  await page.addInitScript(() => window.sessionStorage.setItem("danangmap-demo-role", "reviewer"));
  await page.goto("/admin/layers/wards/review");

  const mapTab = page.getByRole("tab", { name: "Bản đồ" });
  const changesTab = page.getByRole("tab", { name: "Thay đổi" });
  const commentsTab = page.getByRole("tab", { name: "Nhận xét" });
  await mapTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(changesTab).toBeFocused();
  await expect(changesTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(commentsTab).toBeFocused();
  await expect(commentsTab).toHaveAttribute("aria-selected", "true");

  const comment = page.getByLabel("Bình luận review");
  await expect(comment).toHaveAttribute("aria-describedby", "review-comment-description");
  const approve = page.getByRole("button", { name: "Duyệt thay đổi" });
  await approve.focus();
  await page.keyboard.press("Enter");
  const feedback = page.locator('div[tabindex="-1"]').filter({ hasText: "Đã duyệt revision." });
  await expect(feedback).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Đã duyệt revision." })).toBeVisible();
});

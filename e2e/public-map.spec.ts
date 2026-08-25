import { expect, test } from "@playwright/test";

test("public map remains useful in degraded Mapbox mode", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop list flow");
  await page.route("**/api/v1/public/search**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") ?? "";
    const place = query.toLocaleLowerCase("vi").includes("cầu rồng");
    const remoteFeature = query.toLocaleLowerCase("vi").includes("dữ liệu lớn");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: place ? [{ id: "geo:dragon-bridge", source: "geo_service", kind: "place", title: "Cầu Rồng", subtitle: "Đường Nguyễn Văn Linh, Đà Nẵng", position: { longitude: 108.227, latitude: 16.061 }, layer: null, featureId: null, providerPlaceId: "geo:dragon-bridge", score: 0.98, highlights: ["Cầu Rồng"] }] : remoteFeature ? [{ id: "feature:33333333-3333-4333-8333-333333333333", source: "internal", kind: "feature", title: "Điểm từ lớp dữ liệu lớn", subtitle: "Trụ sở hành chính", position: { longitude: 108.21, latitude: 16.08 }, layer: { slug: "tru-so-hanh-chinh" }, featureId: "33333333-3333-4333-8333-333333333333", providerPlaceId: null, score: 0.97, highlights: ["dữ liệu lớn"] }] : [{ id: "feature:police-one", source: "internal", kind: "feature", title: "Công an phường Hải Châu", subtitle: "Trụ sở công an", position: { longitude: 108.2181, latitude: 16.0598 }, layer: { slug: "tru-so-cong-an" }, featureId: "police-one", providerPlaceId: null, score: 1, highlights: ["Công an"] }],
        meta: { partial: !place, sources: { internal: { status: "ok", count: place ? 0 : 1 }, place: { status: place ? "ok" : "unavailable", count: place ? 1 : 0 } }, warnings: place ? [] : [{ code: "PLACE_UNAVAILABLE", message: "Geo Service unavailable" }], nextCursor: null, requestId: "e2e-search" },
      }),
    });
  });
  await page.route("**/api/v1/public/places/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: "geo:dragon-bridge", name: "Cầu Rồng", address: "Đường Nguyễn Văn Linh, Đà Nẵng", position: null, phone: null, website: null, source: "geo_service" }, meta: { requestId: "e2e-place" } }) }));
  await page.route("**/api/v1/public/layers/tru-so-hanh-chinh/features/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { type: "Feature", id: "33333333-3333-4333-8333-333333333333", geometry: { type: "Point", coordinates: [108.21, 16.08] }, properties: { name: "Điểm từ lớp dữ liệu lớn", address: "Quận Hải Châu" }, geometryKind: "point", radiusM: null, attachments: [], meta: { layerSlug: "tru-so-hanh-chinh", snapshotId: "44444444-4444-4444-8444-444444444444", generation: 1, geometryKind: "point", radiusM: null } }, meta: { requestId: "e2e-feature" } }) }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bản đồ số Đà Nẵng" })).toBeAttached();
  await expect(page.getByText("Chế độ demo · Không phải dữ liệu công bố")).toBeVisible();
  await expect(page.getByTestId("map-degraded")).toBeVisible();
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Bỏ qua bản đồ, đến danh sách dữ liệu" });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  const featureList = page.locator("#public-feature-list");
  await expect(featureList).toBeFocused();
  await expect(featureList).toContainText("5 kết quả");

  await page.getByLabel("Trường lọc").selectOption({ label: "Trụ sở hành chính · Địa chỉ" });
  await page.getByLabel("Giá trị lọc").selectOption("24 Trần Phú, phường Hải Châu");
  await page.getByRole("button", { name: "Áp dụng" }).click();
  await expect(featureList).toContainText("4 kết quả");
  await page.getByRole("button", { name: "Xóa lọc" }).click();
  await expect(featureList).toContainText("5 kết quả");

  await page.getByRole("combobox", { name: "Tìm địa điểm hoặc dữ liệu" }).fill("Công an");
  await expect(page.getByRole("group", { name: "Dữ liệu công bố" })).toBeVisible();
  await expect(page.getByText(/Một nguồn tìm kiếm đang tạm gián đoạn/)).toBeVisible();
  await page.getByRole("combobox", { name: "Tìm địa điểm hoặc dữ liệu" }).press("ArrowDown");
  await page.getByRole("combobox", { name: "Tìm địa điểm hoặc dữ liệu" }).press("Enter");
  await expect(page.getByRole("heading", { name: "Công an phường Hải Châu" })).toBeVisible();
  await expect(page.getByText("5 kết quả")).toBeVisible();

  await page.getByRole("combobox", { name: "Tìm địa điểm hoặc dữ liệu" }).fill("Cầu Rồng");
  await page.getByRole("option", { name: /Cầu Rồng/ }).click();
  await expect(page.getByRole("heading", { name: "Cầu Rồng" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "chưa có tọa độ xác nhận" })).toBeVisible();

  await page.getByRole("combobox", { name: "Tìm địa điểm hoặc dữ liệu" }).fill("dữ liệu lớn");
  await page.getByRole("option", { name: /Điểm từ lớp dữ liệu lớn/ }).click();
  await expect(page.getByRole("heading", { name: "Điểm từ lớp dữ liệu lớn" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Thông tin kết quả" }).getByText("Quận Hải Châu")).toBeVisible();
});

test("mobile public exposes layers and list as touch panels", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("desktop"), "Mobile flow");
  await page.goto("/");
  await page.getByRole("button", { name: "Lớp", exact: true }).click();
  await expect(page.getByRole("region", { name: "Lớp dữ liệu" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ranh giới phường, xã/ })).toBeVisible();
});

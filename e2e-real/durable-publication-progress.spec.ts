import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { devices, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { loginWithMfa, requiredEnv, type RealStackLoginEnvironment } from "./support/auth";

const phaseNames = ["queue", "progress", "crashed", "terminal"] as const;
type ActivationPhase = typeof phaseNames[number];

const configuredPhase = process.env.DANANGMAP_DURABLE_PUBLICATION_PHASE;
const activationEnabled = process.env.DANANGMAP_REAL_STACK === "true"
  && process.env.DANANGMAP_ASYNC_PUBLICATION_ENABLED === "true"
  && configuredPhase !== undefined;

test.skip(
  !activationEnabled,
  "Set DANANGMAP_REAL_STACK=true, DANANGMAP_ASYNC_PUBLICATION_ENABLED=true and the durable publication phase environment to run activation acceptance.",
);

test.setTimeout(300_000);

const publisher: RealStackLoginEnvironment = {
  login: "DANANGMAP_GATE_B_PUBLISHER_LOGIN",
  password: "DANANGMAP_GATE_B_PUBLISHER_PASSWORD",
  totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET",
};

interface ActivationInput {
  schemaVersion: 1;
  runNonce: string;
  layerId: string;
  revisionId: string;
  layerSlug: "durable-publication-activation";
  expectedFeatureTotal: 3;
  baseline: {
    snapshotId: string;
    generation: number;
    activePointerEtag: string;
  };
}

interface PublicObservation {
  catalog: { etag: string; bodySha256: string; snapshotId: string; generation: number };
  layer: { etag: string; bodySha256: string; snapshotId: string; generation: number };
  geoJson: { etag: string; bodySha256: string; generation: number; featureCount: number; containsRunNonce: boolean };
  history: { etag: string; bodySha256: string; activePointerEtag: string; activeSnapshotId: string; activeGeneration: number };
}

interface JobObservation {
  etag: string;
  id: string;
  status: string;
  phase: string;
  attempt: number;
  progress: { completedUnits: number; totalUnits: number | null; percent: number | null };
  result: { snapshotId: string; generation: number } | null;
}

interface PhaseMarker {
  schemaVersion: 1;
  runNonce: string;
  layerId: string;
  revisionId: string;
  jobId: string;
  phase: ActivationPhase;
  timestamp: string;
  observed: {
    api: JobObservation;
    ui: { workspaceEtag: string; statusText: string };
    public: PublicObservation;
  };
}

function record(value: unknown, description = "activation payload"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Durable publication ${description} is not an object.`);
  }
  return value as Record<string, unknown>;
}

function stringField(value: unknown, key: string, description = "activation payload") {
  const field = record(value, description)[key];
  if (typeof field !== "string" || field.length === 0) throw new Error(`Durable publication ${description} is missing ${key}.`);
  return field;
}

function integerField(value: unknown, key: string, description = "activation payload") {
  const field = record(value, description)[key];
  if (typeof field !== "number" || !Number.isInteger(field)) throw new Error(`Durable publication ${description} is missing integer ${key}.`);
  return field;
}

function nullableIntegerField(value: unknown, key: string, description = "activation payload") {
  const field = record(value, description)[key];
  if (field === null) return null;
  if (typeof field !== "number" || !Number.isInteger(field)) throw new Error(`Durable publication ${description} has invalid ${key}.`);
  return field;
}

function envelopeData(value: unknown) {
  return record(value, "API envelope").data;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requirePhase(): ActivationPhase {
  if (!phaseNames.includes(configuredPhase as ActivationPhase)) {
    throw new Error(`DANANGMAP_DURABLE_PUBLICATION_PHASE must be one of ${phaseNames.join(", ")}.`);
  }
  return configuredPhase as ActivationPhase;
}

function requireUuid(value: string, name: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error(`${name} must be a UUID.`);
  }
  return value;
}

async function readActivationInput(phaseDir: string): Promise<ActivationInput> {
  const input = record(JSON.parse(await readFile(join(phaseDir, "input.json"), "utf8")), "input.json");
  const baseline = record(input.baseline, "input baseline");
  const parsed: ActivationInput = {
    schemaVersion: integerField(input, "schemaVersion", "input.json") as 1,
    runNonce: stringField(input, "runNonce", "input.json"),
    layerId: requireUuid(stringField(input, "layerId", "input.json"), "input layerId"),
    revisionId: requireUuid(stringField(input, "revisionId", "input.json"), "input revisionId"),
    layerSlug: stringField(input, "layerSlug", "input.json") as ActivationInput["layerSlug"],
    expectedFeatureTotal: integerField(input, "expectedFeatureTotal", "input.json") as 3,
    baseline: {
      snapshotId: requireUuid(stringField(baseline, "snapshotId", "input baseline"), "baseline snapshotId"),
      generation: integerField(baseline, "generation", "input baseline"),
      activePointerEtag: stringField(baseline, "activePointerEtag", "input baseline"),
    },
  };
  expect(parsed.schemaVersion).toBe(1);
  expect(parsed.runNonce.length).toBeGreaterThanOrEqual(8);
  expect(parsed.layerSlug).toBe("durable-publication-activation");
  expect(parsed.expectedFeatureTotal).toBe(3);
  expect(parsed.baseline.generation).toBeGreaterThanOrEqual(1);
  return parsed;
}

async function readMarker(phaseDir: string, phase: ActivationPhase, input: ActivationInput): Promise<PhaseMarker> {
  const marker = record(JSON.parse(await readFile(join(phaseDir, `${phase}.json`), "utf8")), `${phase}.json`) as unknown as PhaseMarker;
  expect(marker.schemaVersion).toBe(1);
  expect(marker.phase).toBe(phase);
  expect(marker.runNonce).toBe(input.runNonce);
  expect(marker.layerId).toBe(input.layerId);
  expect(marker.revisionId).toBe(input.revisionId);
  requireUuid(marker.jobId, `${phase} jobId`);
  return marker;
}

async function writeMarker(phaseDir: string, marker: PhaseMarker) {
  await mkdir(phaseDir, { recursive: true });
  const destination = join(phaseDir, `${marker.phase}.json`);
  const temporary = join(phaseDir, `.${marker.phase}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(marker, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, destination);
}

async function browserGet(page: Page, path: string) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    const text = await response.text();
    return {
      status: response.status,
      etag: response.headers.get("etag"),
      retryAfter: response.headers.get("retry-after"),
      text,
      body: text ? JSON.parse(text) as unknown : null,
    };
  }, path);
}

function requiredEtag(value: string | null, description: string) {
  expect(value, `${description} must expose an ETag`).toBeTruthy();
  return value!;
}

function jobFromResponse(response: Awaited<ReturnType<typeof browserGet>>): JobObservation {
  expect(response.status).toBe(200);
  const job = record(envelopeData(response.body), "publication job");
  const progress = record(job.progress, "publication job progress");
  const rawResult = job.result;
  return {
    etag: requiredEtag(response.etag, "publication job"),
    id: requireUuid(stringField(job, "id", "publication job"), "job id"),
    status: stringField(job, "status", "publication job"),
    phase: stringField(job, "phase", "publication job"),
    attempt: integerField(job, "attempt", "publication job"),
    progress: {
      completedUnits: integerField(progress, "completedUnits", "publication job progress"),
      totalUnits: nullableIntegerField(progress, "totalUnits", "publication job progress"),
      percent: nullableIntegerField(progress, "percent", "publication job progress"),
    },
    result: rawResult === null
      ? null
      : {
          snapshotId: requireUuid(stringField(rawResult, "snapshotId", "publication result"), "publication result snapshotId"),
          generation: integerField(rawResult, "generation", "publication result"),
        },
  };
}

async function observeJob(page: Page, jobId: string) {
  const response = await browserGet(page, `/api/v1/admin/publication-jobs/${encodeURIComponent(jobId)}`);
  const observed = jobFromResponse(response);
  expect(observed.id).toBe(jobId);
  return observed;
}

async function observePublic(page: Page, input: ActivationInput): Promise<PublicObservation> {
  const catalogResponse = await browserGet(page, "/api/v1/public/layers");
  const layerResponse = await browserGet(page, `/api/v1/public/layers/${encodeURIComponent(input.layerSlug)}`);
  const geoJsonResponse = await browserGet(page, `/api/v1/public/layers/${encodeURIComponent(input.layerSlug)}/features?limit=100`);
  const historyResponse = await browserGet(page, `/api/v1/admin/layers/${encodeURIComponent(input.layerId)}/publications?limit=100`);
  for (const response of [catalogResponse, layerResponse, geoJsonResponse, historyResponse]) expect(response.status).toBe(200);

  const catalog = envelopeData(catalogResponse.body);
  if (!Array.isArray(catalog)) throw new Error("Public catalog is not an array.");
  const catalogLayer = catalog.map((value) => record(value, "public catalog layer")).find((value) => value.slug === input.layerSlug);
  if (!catalogLayer) throw new Error(`Public catalog is missing ${input.layerSlug}.`);
  const layer = record(envelopeData(layerResponse.body), "public layer");
  const geoJson = record(geoJsonResponse.body, "public GeoJSON");
  const geoMeta = record(geoJson.meta, "public GeoJSON meta");
  const features = geoJson.features;
  if (!Array.isArray(features)) throw new Error("Public GeoJSON is missing features.");
  const history = record(envelopeData(historyResponse.body), "publication history");
  const items = history.items;
  if (!Array.isArray(items)) throw new Error("Publication history is missing items.");
  const active = items.map((value) => record(value, "publication history item")).find((value) => value.isActive === true);
  if (!active) throw new Error("Publication history is missing its active pointer target.");

  return {
    catalog: {
      etag: requiredEtag(catalogResponse.etag, "public catalog"),
      bodySha256: sha256(JSON.stringify(catalog)),
      snapshotId: stringField(catalogLayer, "snapshotId", "public catalog layer"),
      generation: integerField(catalogLayer, "generation", "public catalog layer"),
    },
    layer: {
      etag: requiredEtag(layerResponse.etag, "public layer"),
      bodySha256: sha256(JSON.stringify(layer)),
      snapshotId: stringField(layer, "snapshotId", "public layer"),
      generation: integerField(layer, "generation", "public layer"),
    },
    geoJson: {
      etag: requiredEtag(geoJsonResponse.etag, "public GeoJSON"),
      bodySha256: sha256(JSON.stringify(geoJson)),
      generation: integerField(geoMeta, "generation", "public GeoJSON meta"),
      featureCount: features.length,
      containsRunNonce: geoJsonResponse.text.includes(input.runNonce),
    },
    history: {
      etag: requiredEtag(historyResponse.etag, "publication history"),
      bodySha256: sha256(JSON.stringify(history)),
      activePointerEtag: stringField(history, "activePointerEtag", "publication history"),
      activeSnapshotId: stringField(active, "snapshotId", "active publication"),
      activeGeneration: integerField(active, "generation", "active publication"),
    },
  };
}

function assertBaselinePublic(observed: PublicObservation, input: ActivationInput) {
  expect(observed.catalog.snapshotId).toBe(input.baseline.snapshotId);
  expect(observed.layer.snapshotId).toBe(input.baseline.snapshotId);
  expect(observed.catalog.generation).toBe(input.baseline.generation);
  expect(observed.layer.generation).toBe(input.baseline.generation);
  expect(observed.geoJson.generation).toBe(input.baseline.generation);
  expect(observed.history.activeSnapshotId).toBe(input.baseline.snapshotId);
  expect(observed.history.activeGeneration).toBe(input.baseline.generation);
  expect(observed.history.activePointerEtag).toBe(input.baseline.activePointerEtag);
  expect(observed.geoJson.containsRunNonce).toBe(false);
}

function assertPublicUnchanged(current: PublicObservation, baseline: PublicObservation, input: ActivationInput) {
  assertBaselinePublic(current, input);
  expect(current.catalog.etag).toBe(baseline.catalog.etag);
  expect(current.catalog.bodySha256).toBe(baseline.catalog.bodySha256);
  expect(current.layer.etag).toBe(baseline.layer.etag);
  expect(current.layer.bodySha256).toBe(baseline.layer.bodySha256);
  expect(current.geoJson.etag).toBe(baseline.geoJson.etag);
  expect(current.geoJson.bodySha256).toBe(baseline.geoJson.bodySha256);
  expect(current.history.etag).toBe(baseline.history.etag);
  expect(current.history.bodySha256).toBe(baseline.history.bodySha256);
  expect(current.history.activePointerEtag).toBe(baseline.history.activePointerEtag);
}

async function observeUi(page: Page, jobId: string) {
  const region = page.getByRole("region", { name: "Trạng thái yêu cầu công bố" });
  await expect(region).toBeVisible();
  // Keep diagnostic tokens in test evidence, not in the operator interface.
  const jobResponse = await browserGet(page, `/api/v1/admin/publication-jobs/${encodeURIComponent(jobId)}`);
  expect(jobResponse.status).toBe(200);
  const revisionId = stringField(envelopeData(jobResponse.body), "revisionId");
  const workspaceResponse = await browserGet(page, `/api/v1/admin/revisions/${encodeURIComponent(revisionId)}/workspace`);
  expect(workspaceResponse.status).toBe(200);
  const workspaceEtag = requiredEtag(workspaceResponse.etag, "review workspace");
  await expect(page.getByText("Workspace ETag", { exact: true })).not.toBeAttached();
  return { workspaceEtag, statusText: (await region.textContent())?.trim() ?? "" };
}

async function openRecoveredJob(context: BrowserContext, input: ActivationInput, jobId: string) {
  const page = await context.newPage();
  await page.goto(`/admin/layers/${input.layerId}/revisions/${input.revisionId}/review`);
  const observed = await observeUi(page, jobId);
  return { page, observed };
}

async function loginPublisher(browser: Browser, mobile = false) {
  const options = { baseURL: requiredEnv("PLAYWRIGHT_BASE_URL"), ignoreHTTPSErrors: true };
  const context = await browser.newContext(mobile ? { ...devices["Pixel 7"], ...options } : options);
  const page = await context.newPage();
  await loginWithMfa(page, publisher);
  return { context, page };
}

async function queuePhase(browser: Browser, phaseDir: string, input: ActivationInput) {
  const desktop = await loginPublisher(browser);
  const mobile = await loginPublisher(browser, true);
  try {
    const baseline = await observePublic(desktop.page, input);
    assertBaselinePublic(baseline, input);

    await desktop.page.goto(`/admin/layers/${input.layerId}/revisions/${input.revisionId}/review`);
    await desktop.page.getByLabel("Ghi chú công bố").fill(`Activation ${input.runNonce}`);
    const responsePromise = desktop.page.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/revisions/${input.revisionId}:publish`) && response.request().method() === "POST");
    await desktop.page.getByRole("button", { name: "Công bố dữ liệu" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(202);
    expect(record(response.request().postDataJSON(), "publish request").clientIntent).toBe("desktop");
    expect(response.headers().etag).toBeTruthy();
    expect(response.headers().location).toBeTruthy();
    expect(response.headers()["retry-after"]).toBeTruthy();
    const accepted = record(envelopeData(await response.json()), "accepted publication job");
    const jobId = requireUuid(stringField(accepted, "id", "accepted publication job"), "accepted job id");
    expect(accepted.status).toBe("queued");
    expect(accepted.phase).toBe("queued");
    expect(accepted.attempt).toBe(0);
    expect(response.headers().location).toContain(`/api/v1/admin/publication-jobs/${jobId}`);

    const acceptedRegion = desktop.page.getByRole("region", { name: "Trạng thái yêu cầu công bố" });
    await expect(acceptedRegion).toBeVisible();
    expect(await acceptedRegion.evaluate((element) => document.activeElement === element)).toBe(true);
    await desktop.page.reload();
    const afterReload = await observeUi(desktop.page, jobId);
    const secondDesktop = await openRecoveredJob(desktop.context, input, jobId);
    await secondDesktop.page.close();

    await mobile.page.goto(`/admin/layers/${input.layerId}/revisions/${input.revisionId}/review`);
    await observeUi(mobile.page, jobId);
    await expect(mobile.page.getByLabel("Ghi chú công bố")).not.toBeAttached();
    await expect(mobile.page.getByRole("button", { name: /Công bố|Thử công bố/u })).not.toBeAttached();
    await mobile.page.goto(`/admin/layers/${input.layerId}/history`);
    await expect(mobile.page.getByRole("button", { name: /Khôi phục|Thử lại|Công bố/u })).not.toBeAttached();

    const job = await observeJob(desktop.page, jobId);
    expect(job).toMatchObject({ status: "queued", phase: "queued", attempt: 0, progress: { completedUnits: 0, totalUnits: null, percent: null }, result: null });
    const publicAfterQueue = await observePublic(desktop.page, input);
    assertPublicUnchanged(publicAfterQueue, baseline, input);
    await writeMarker(phaseDir, {
      schemaVersion: 1,
      runNonce: input.runNonce,
      layerId: input.layerId,
      revisionId: input.revisionId,
      jobId,
      phase: "queue",
      timestamp: new Date().toISOString(),
      observed: { api: job, ui: afterReload, public: publicAfterQueue },
    });
  } finally {
    await desktop.context.close();
    await mobile.context.close();
  }
}

async function progressPhase(browser: Browser, phaseDir: string, input: ActivationInput) {
  const queued = await readMarker(phaseDir, "queue", input);
  const desktop = await loginPublisher(browser);
  try {
    await expect.poll(async () => {
      const job = await observeJob(desktop.page, queued.jobId);
      if (job.status === "failed") throw new Error(`Publication job failed with a redacted ${job.phase} state.`);
      return `${job.status}:${job.phase}:${job.progress.completedUnits}:${job.progress.totalUnits}:${job.progress.percent}:${job.attempt}`;
    }, { timeout: 150_000, intervals: [250, 500, 1_000] }).toBe("building:scanning_features:1:3:33:1");
    const job = await observeJob(desktop.page, queued.jobId);
    const first = await openRecoveredJob(desktop.context, input, queued.jobId);
    await expect(first.page.getByRole("region", { name: "Trạng thái yêu cầu công bố" })).toContainText("1 trên 3 đối tượng, 33%.");
    await first.page.reload();
    const afterReload = await observeUi(first.page, queued.jobId);
    const second = await openRecoveredJob(desktop.context, input, queued.jobId);
    await expect(second.page.getByRole("region", { name: "Trạng thái yêu cầu công bố" })).toContainText("1 trên 3 đối tượng, 33%.");
    await second.page.close();
    const publicState = await observePublic(desktop.page, input);
    assertPublicUnchanged(publicState, queued.observed.public, input);
    await writeMarker(phaseDir, {
      schemaVersion: 1,
      runNonce: input.runNonce,
      layerId: input.layerId,
      revisionId: input.revisionId,
      jobId: queued.jobId,
      phase: "progress",
      timestamp: new Date().toISOString(),
      observed: { api: job, ui: afterReload, public: publicState },
    });
    await first.page.close();
  } finally {
    await desktop.context.close();
  }
}

async function crashedPhase(browser: Browser, phaseDir: string, input: ActivationInput) {
  const progress = await readMarker(phaseDir, "progress", input);
  const desktop = await loginPublisher(browser);
  try {
    const job = await observeJob(desktop.page, progress.jobId);
    expect(job.status).toBe("building");
    expect(job.phase).toBe("scanning_features");
    expect(job.attempt).toBe(1);
    expect(job.progress).toEqual(progress.observed.api.progress);
    expect(job.result).toBeNull();
    const first = await openRecoveredJob(desktop.context, input, progress.jobId);
    await expect(first.page.getByRole("region", { name: "Trạng thái yêu cầu công bố" })).not.toContainText(/Dữ liệu mới đã hiển thị|không thành công/u);
    await first.page.reload();
    const afterReload = await observeUi(first.page, progress.jobId);
    const second = await openRecoveredJob(desktop.context, input, progress.jobId);
    await expect(second.page.getByRole("region", { name: "Trạng thái yêu cầu công bố" })).toContainText("1 trên 3 đối tượng, 33%.");
    await second.page.close();
    const publicState = await observePublic(desktop.page, input);
    assertPublicUnchanged(publicState, progress.observed.public, input);
    await writeMarker(phaseDir, {
      schemaVersion: 1,
      runNonce: input.runNonce,
      layerId: input.layerId,
      revisionId: input.revisionId,
      jobId: progress.jobId,
      phase: "crashed",
      timestamp: new Date().toISOString(),
      observed: { api: job, ui: afterReload, public: publicState },
    });
    await first.page.close();
  } finally {
    await desktop.context.close();
  }
}

async function terminalPhase(browser: Browser, phaseDir: string, input: ActivationInput) {
  const crashed = await readMarker(phaseDir, "crashed", input);
  const desktop = await loginPublisher(browser);
  try {
    await expect.poll(async () => {
      const job = await observeJob(desktop.page, crashed.jobId);
      if (job.status === "failed") throw new Error(`Publication job failed with a redacted ${job.phase} state.`);
      return job.status;
    }, { timeout: 150_000, intervals: [500, 1_000, 2_000] }).toBe("succeeded");
    const job = await observeJob(desktop.page, crashed.jobId);
    expect(job.phase).toBe("completed");
    expect(job.attempt).toBeGreaterThanOrEqual(2);
    expect(job.progress).toEqual({ completedUnits: 3, totalUnits: 3, percent: 100 });
    expect(job.result).not.toBeNull();
    const result = job.result!;
    expect(result.generation).toBe(input.baseline.generation + 1);

    const recovered = await openRecoveredJob(desktop.context, input, crashed.jobId);
    await expect(recovered.page.getByRole("region", { name: "Trạng thái yêu cầu công bố" })).toContainText("Dữ liệu mới đã hiển thị trên bản đồ.");
    await recovered.page.reload();
    const afterReload = await observeUi(recovered.page, crashed.jobId);
    await expect(recovered.page.getByLabel("Ghi chú công bố")).not.toBeAttached();

    const publicState = await observePublic(desktop.page, input);
    expect(publicState.catalog.snapshotId).toBe(result.snapshotId);
    expect(publicState.layer.snapshotId).toBe(result.snapshotId);
    expect(publicState.history.activeSnapshotId).toBe(result.snapshotId);
    expect(publicState.catalog.generation).toBe(result.generation);
    expect(publicState.layer.generation).toBe(result.generation);
    expect(publicState.geoJson.generation).toBe(result.generation);
    expect(publicState.history.activeGeneration).toBe(result.generation);
    expect(publicState.geoJson.featureCount).toBe(input.expectedFeatureTotal);
    expect(publicState.geoJson.containsRunNonce).toBe(true);
    expect(publicState.catalog.etag).not.toBe(crashed.observed.public.catalog.etag);
    expect(publicState.layer.etag).not.toBe(crashed.observed.public.layer.etag);
    expect(publicState.geoJson.etag).not.toBe(crashed.observed.public.geoJson.etag);
    expect(publicState.history.etag).not.toBe(crashed.observed.public.history.etag);
    expect(publicState.history.bodySha256).not.toBe(crashed.observed.public.history.bodySha256);
    expect(publicState.history.activePointerEtag).not.toBe(crashed.observed.public.history.activePointerEtag);

    const historyResponse = await browserGet(desktop.page, `/api/v1/admin/layers/${input.layerId}/publications?limit=100`);
    const history = record(envelopeData(historyResponse.body), "terminal publication history");
    const historyItems = history.items;
    if (!Array.isArray(historyItems)) throw new Error("Terminal publication history is missing items.");
    expect(historyItems.map((value) => record(value)).filter((item) => item.snapshotId === result.snapshotId && item.generation === result.generation)).toHaveLength(1);

    const jobsResponse = await browserGet(desktop.page, `/api/v1/admin/layers/${input.layerId}/publication-jobs?revisionId=${encodeURIComponent(input.revisionId)}&limit=100`);
    const jobs = record(envelopeData(jobsResponse.body), "terminal publication jobs");
    const jobItems = jobs.items;
    if (!Array.isArray(jobItems)) throw new Error("Terminal publication job list is missing items.");
    expect(jobItems.map((value) => record(value)).filter((item) => item.id === crashed.jobId && record(item.result).snapshotId === result.snapshotId)).toHaveLength(1);

    await writeMarker(phaseDir, {
      schemaVersion: 1,
      runNonce: input.runNonce,
      layerId: input.layerId,
      revisionId: input.revisionId,
      jobId: crashed.jobId,
      phase: "terminal",
      timestamp: new Date().toISOString(),
      observed: { api: job, ui: afterReload, public: publicState },
    });
    await recovered.page.close();
  } finally {
    await desktop.context.close();
  }
}

test("durable publication survives queue, measured progress, SIGKILL and canonical recovery", async ({ browser }) => {
  const phase = requirePhase();
  const phaseDir = requiredEnv("DANANGMAP_DURABLE_PUBLICATION_PHASE_DIR", "durable publication activation");
  const input = await readActivationInput(phaseDir);
  if (phase === "queue") await queuePhase(browser, phaseDir, input);
  if (phase === "progress") await progressPhase(browser, phaseDir, input);
  if (phase === "crashed") await crashedPhase(browser, phaseDir, input);
  if (phase === "terminal") await terminalPhase(browser, phaseDir, input);
});

# Real-stack acceptance

The publication suites run only against the external Docker stack. They never intercept or mock an API route. During the backward-compatible rollout the frontend accepts both valid `202` modes: the documented default-off legacy terminal (`status=completed`, snapshot, generation and optional matching `publicationId`, without durable `Location`/`Retry-After` or a strong job ETag; a generic weak Express ETag is allowed) and explicit durable acceptance (`queued/queued`, with `Location`, strong `ETag` and `Retry-After`). The exact local production activation pair backend `2d4675ec2385abf55fa23ad26914e037456f14cd` and frontend `6e6fe83f7dbf6d5a01c710bb35e670e08b63e1b8` completed two fresh-volume 18/18 runs and received independent GO. The backend default remains `false`, so durable async publication requires explicit opt-in. Remote GitHub cross-stack activation remains fail-closed pending `CROSS_REPO_READ_TOKEN`; the local result is not a remote-gate or Mapbox visual-QA claim.

Run it with:

```powershell
$env:DANANGMAP_REAL_STACK = "true"
$env:DANANGMAP_HISTORY_ENABLED = "true"
$env:DANANGMAP_ASYNC_PUBLICATION_ENABLED = "true"
$env:PLAYWRIGHT_BASE_URL = "https://gateway"
npm run test:e2e:real:history
```

The focused durable-publication gate is host-orchestrated. The browser suite never starts, stops or sends signals to the backend. The host prepares an approved three-feature revision, removes or starts the worker for the requested phase, then invokes the same spec four times:

```powershell
$env:DANANGMAP_REAL_STACK = "true"
$env:DANANGMAP_ASYNC_PUBLICATION_ENABLED = "true"
$env:DANANGMAP_DURABLE_PUBLICATION_PHASE = "queue" # queue | progress | crashed | terminal
$env:DANANGMAP_DURABLE_PUBLICATION_PHASE_DIR = "/phase"
$env:PLAYWRIGHT_BASE_URL = "https://gateway"
npm run test:e2e:real:publication
```

`DANANGMAP_DURABLE_PUBLICATION_PHASE_DIR/input.json` is schema version 1:

```json
{
  "schemaVersion": 1,
  "runNonce": "<unique run nonce embedded in successor feature data>",
  "layerId": "<uuid>",
  "revisionId": "<uuid>",
  "layerSlug": "durable-publication-activation",
  "expectedFeatureTotal": 3,
  "baseline": {
    "snapshotId": "<active snapshot uuid>",
    "generation": 1,
    "activePointerEtag": "<opaque pointer etag>"
  }
}
```

Each invocation writes `/phase/{phase}.json` atomically through a same-directory temporary file and rename. Markers carry the exact `runNonce` and IDs plus observed job ETag/progress, UI workspace ETag/status text, and public catalog/layer/GeoJSON/history ETags and body hashes. Later phases reject markers from another run.

- `queue`: worker absent; the Publisher submits through the real UI and receives exact `queued/queued`, attempt 0. The same server job survives reload and a new desktop tab. A separately authenticated Pixel 7 session can review the job but has no publish, retry or rollback mutation. Public pointer, generation, snapshot, ETags and response hashes remain at baseline.
- `progress`: the host runs a test-configured worker until the exact persisted checkpoint `building/scanning_features`, 1/3, 33%, attempt 1. UI recovery survives reload and a new tab while all public observations remain byte-identical to `queue`.
- `crashed`: after the host sends `SIGKILL`, the browser recovers the same job and measured checkpoint before the canonical worker restarts. It rejects progress regression and any premature terminal claim; public state is still baseline.
- `terminal`: after the host starts the canonical recovery worker, the same job succeeds at attempt 2 or later. Reload recovers the terminal result, exactly one new history generation points to that result, all public surfaces change only now, and the three-feature public GeoJSON contains the exact `runNonce` seeded by the host.

All browser polling is bounded and only reports the backend's redacted failure fields. The application tracker itself remains durable and does not stop because a test poll budget elapsed. No phase uses `page.route`, service/demo mocks, or browser-side shell/Docker control.

The deterministic harness must provide these secret environment variables:

- `DANANGMAP_GATE_B_EDITOR_LOGIN`
- `DANANGMAP_GATE_B_EDITOR_PASSWORD`
- `DANANGMAP_GATE_B_REVIEWER_LOGIN`
- `DANANGMAP_GATE_B_REVIEWER_PASSWORD`
- `DANANGMAP_GATE_B_PUBLISHER_LOGIN`
- `DANANGMAP_GATE_B_PUBLISHER_PASSWORD`
- `DANANGMAP_GATE_B_TOTP_SECRET`
- `DANANGMAP_HISTORY_ROLLBACK_PUBLISHER_LOGIN`
- `DANANGMAP_HISTORY_ROLLBACK_PUBLISHER_PASSWORD`
- `DANANGMAP_HISTORY_SYSTEM_ADMIN_LOGIN`
- `DANANGMAP_HISTORY_SYSTEM_ADMIN_PASSWORD`
- `DANANGMAP_HISTORY_TOTP_SECRET`

Editor, Reviewer, Publisher, rollback Publisher and System Admin must be distinct active accounts. The rollback Publisher must not participate in creating, reviewing or publishing the target revisions, so the suite validates separation of duties instead of bypassing it. Do not commit credentials or TOTP seeds to the frontend repository.

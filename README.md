# DanangMap Frontend

## OpenAPI contract

`openapi/openapi.json` pins the backend contract used by this repository. After a reviewed backend contract change, run `npm run api:sync` from a checkout where `danangmap-backend` is the sibling directory. Normal generation and CI drift checks use `npm run api:generate` and `npm run api:check`; they do not depend on a running backend.

The current pin was synced from backend commit `36f78a83ee82b5f8e471db5b44078a4071c91d36` (OpenAPI SHA-256 `1f0ee28d2ec1aa37cc521bd6c15f96e2d443bfe56dbaa28a505b35359d7e7e68`). Browser requests use the full generated `/api/v1/...` paths, so `NEXT_PUBLIC_API_BASE_URL` is only the API origin (local default `http://localhost:4000`) and must not include `/api/v1`.

For revision configuration reads, an omitted `renderConfig.sourcePolicy` is interpreted as `auto`, matching the backend default. Configuration writes always send the resolved value explicitly and only send style families compatible with the allowed geometry kinds.

Publication UX is backward-compatible during backend-first rollout. A default-off publish `202` may be the documented legacy synchronous terminal (`status=completed`, snapshot, generation and an optional matching `publicationId`); it has no durable `Location`/`Retry-After` or strong job ETag, though Express may add a generic weak response ETag. The screen shows that result without inventing progress and refreshes bundle/history from the server. With async explicitly enabled, `202` must be exact `queued/queued` plus `Location`, strong `ETag` and `Retry-After`. The review screen recovers the authoritative job after reload and tracks its detail with ETag-aware polling, bounded `Retry-After`, and no client-side stop before `succeeded` or `failed`. The history screen reads the server job list on mount and manual refresh; it does not poll that list. Network loss or a rejected non-monotonic representation is shown as a tracking interruption while the last confirmed job remains visible. Local production durable activation is accepted for the exact tested pair backend `2d4675ec2385abf55fa23ad26914e037456f14cd` and frontend `6e6fe83f7dbf6d5a01c710bb35e670e08b63e1b8` after two fresh-volume runs completed 18/18 and independent review returned GO. The backend default remains `false`; durable async publication requires explicit opt-in. Remote GitHub cross-stack activation remains fail-closed pending `CROSS_REPO_READ_TOKEN`. This local acceptance does not clear the attachment, accessibility, Mapbox visual-QA or deployment blockers, and makes no Mapbox visual-QA claim.

Ứng dụng Next.js phục vụ bản đồ công khai tại `/` và khu vực quản trị tại `/admin` cho DanangMap v2.

## Trạng thái

Thiết kế `Direction 1 - Civic Focus (refined)` đã được chọn và vertical slice public/admin đang được triển khai. Design QA bản đồ thật vẫn cần Mapbox public token giới hạn theo URL để chụp đúng trạng thái nguồn.

## Tài liệu nguồn

- [Thiết kế frontend](docs/DESIGN.md)
- [PRD](https://github.com/duckvhuynh/danangmap-backend/blob/main/docs/PRD.md)
- [SRS](https://github.com/duckvhuynh/danangmap-backend/blob/main/docs/SRS.md)
- [API Contract](https://github.com/duckvhuynh/danangmap-backend/blob/main/docs/API-CONTRACT.md)
- [Kế hoạch triển khai](https://github.com/duckvhuynh/danangmap-backend/blob/main/docs/PLANS.md)
- [GitHub Project](https://github.com/users/duckvhuynh/projects/3)

## Quyết định nền

- Một Next.js App Router app cho public map và admin.
- Tailwind CSS, shadcn/ui, Mapbox GL JS, Terra Draw và Dexie.js.
- Trắng và xanh thương hiệu Đà Nẵng, không gradient.
- Backend là source of truth; Dexie chỉ là crash-recovery buffer.
- Admin mobile chỉ xem và review. Authoring và publish yêu cầu desktop.

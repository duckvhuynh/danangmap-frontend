# DanangMap Frontend

## OpenAPI contract

`openapi/openapi.json` pins the backend contract used by this repository. After a reviewed backend contract change, run `npm run api:sync` from a checkout where `danangmap-backend` is the sibling directory. Normal generation and CI drift checks use `npm run api:generate` and `npm run api:check`; they do not depend on a running backend.

The current pin was synced from backend commit `e7643cb50529d537ce433c58aa060b374b62e6c8` (OpenAPI SHA-256 `28e1d66c0eda898d415620cccb36fbd7b1844e17f1895c423961f091abb7570e`). Browser requests use the full generated `/api/v1/...` paths, so `NEXT_PUBLIC_API_BASE_URL` is only the API origin (local default `http://localhost:4000`) and must not include `/api/v1`.

For revision configuration reads, an omitted `renderConfig.sourcePolicy` is interpreted as `auto`, matching the backend default. Configuration writes always send the resolved value explicitly and only send style families compatible with the allowed geometry kinds.

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

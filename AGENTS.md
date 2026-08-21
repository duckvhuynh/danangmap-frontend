# DanangMap Frontend Agent Guide

Đọc theo thứ tự trước khi sửa mã:

1. `docs/DESIGN.md`
2. `../danangmap-backend/docs/PRD.md`
3. `../danangmap-backend/docs/SRS.md`
4. `../danangmap-backend/docs/API-CONTRACT.md`
5. `../danangmap-backend/docs/PLANS.md`

Không scaffold hoặc triển khai UI khi design gate chưa ở trạng thái `SELECTED`. Không tự thêm URL map-state sharing, satellite, Mapbox Geocoding/Directions, MongoDB hoặc mobile authoring.

Frontend chỉ gọi DanangMap API bằng generated OpenAPI client. Mapbox, Terra Draw và Dexie phải nằm trong client islands; không đưa Mapbox instance hoặc geometry payload lớn vào React global state. Dexie không được lưu session token, MFA secret, original import file hoặc attachment binary.

Mọi thay đổi phải có loading, empty, error, permission và conflict states phù hợp; thêm test cùng phạm vi thay đổi và giữ Docker E2E deterministic.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

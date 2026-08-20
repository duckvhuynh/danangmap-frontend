# DanangMap Frontend

Ứng dụng Next.js phục vụ bản đồ công khai tại `/` và khu vực quản trị tại `/admin` cho DanangMap v2.

## Trạng thái

Thiết kế đang ở gate `AWAITING_SELECTION`. Ba hướng visual nằm trong [`docs/visual-directions`](docs/visual-directions); chưa được scaffold hoặc triển khai UI cho tới khi chủ sản phẩm chọn một hướng.

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

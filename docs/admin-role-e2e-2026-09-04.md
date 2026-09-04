# Kiểm thử E2E đầy đủ theo vai trò — 04/09/2026

## Kết quả

Toàn bộ 11 kịch bản trình duyệt trên full stack thật đã đạt trong cùng một lượt chạy sạch: Next.js, NestJS, PostgreSQL/PostGIS, Redis, MinIO, worker công bố, Mailpit TLS và Caddy gateway. Bộ test chạy tuần tự với các browser context tách biệt để mỗi vai trò có cookie riêng.

| Vai trò | Phạm vi đã kiểm tra | Kết quả |
| --- | --- | --- |
| Quản trị hệ thống | Nhập tài khoản, gửi/gửi lại/thu hồi lời mời, quản lý tài khoản và trạng thái, đặt lại mật khẩu/MFA, thu hồi phiên, giới hạn thao tác trên chính mình, tạo lại mã khôi phục | Đạt |
| Biên tập viên | Tạo và cấu hình lớp, trường dữ liệu và kiểu hiển thị, thêm/nhập đối tượng, tệp đính kèm sạch/bị từ chối, gửi duyệt, xử lý xung đột ETag, nhóm/sắp xếp/lưu trữ lớp, giới hạn chỉnh sửa trên mobile | Đạt |
| Kiểm duyệt viên | Mở dữ liệu chờ duyệt, xem so sánh và dữ liệu riêng tư đã lọc, ghi ý kiến, phê duyệt, không có quyền biên tập/công bố/khôi phục, mobile chỉ xem và duyệt | Đạt |
| Người công bố | Chỉ đọc cấu hình, công bố bất đồng bộ, theo dõi công việc đến khi hoàn tất, kiểm tra generation công khai, xem lịch sử và khôi phục phiên bản theo quyền | Đạt |
| Người dùng công khai | Danh mục/lớp/đối tượng cập nhật sau công bố, tệp sạch truy cập được, tệp bị từ chối và trường riêng tư không bị lộ | Đạt |

Kết quả Playwright: **11/11 đạt trong 4,9 phút**. HTML report local nằm tại `danangmap-backend/artifacts/role-e2e-20260904/playwright-report/real-stack/index.html`.

## Các lỗi phát hiện và đã sửa

- Ô mã TOTP giữ lại mã cũ sau lần xác thực sai. Giao diện nay xóa mã sai; helper E2E chọn toàn bộ và nhập lại đủ sáu chữ số trước khi gửi. Anti-replay ở backend được giữ nguyên.
- Các locator trạng thái `Đã duyệt`/`Đã công bố` trước đây tìm trên toàn trang nên trùng badge responsive và trạng thái công việc. Locator nay được giới hạn vào header phiên bản.
- Các ô màu có cả color picker và ô nhập mã màu; test nay chọn đúng textbox bằng accessible name chính xác.
- Kịch bản cũ còn dùng nhãn trước đợt chỉnh nội dung (`Cài đặt bảo mật`, `Bạn có quyền xem cấu hình`, `Sửa cấu hình cần máy tính`). Assertions đã cập nhật theo nội dung hiện hành và vẫn kiểm tra các nút chỉnh sửa không xuất hiện.
- Dòng chờ tải tài khoản còn câu kỹ thuật tiếng Anh. Đã đổi thành `Đang tải danh sách tài khoản...`; trạng thái còn trang tiếp theo đổi thành `còn tài khoản khác`.

## Kiểm chứng bổ sung

- Vitest: 71 files, 491 tests đạt.
- ESLint: đạt, không có warning.
- TypeScript: đạt.
- Generated API contract check: đạt.
- Docker production build của frontend: đạt trong lúc dựng full stack.

## Phương thức và giới hạn

Chỉ dùng API điều khiển trình duyệt và trình duyệt Chromium cô lập trong Docker; không điều khiển chuột, bàn phím hoặc ứng dụng desktop của người dùng. Database/volume dùng cho QA là tạm thời và tách khỏi stack local đang dùng.

Đây là kiểm thử chức năng và phân quyền theo browser journey, không phải tuyên bố đạt toàn bộ WCAG hay kiểm thử trên thiết bị vật lý. Bộ full-stack chuẩn hiện còn một lỗi hạ tầng riêng: source-policy scanner quét cả `durable-editor-sync.spec.ts`, trong khi spec fault-injection này chủ động dùng `route.abort`. Lượt kiểm tra này dùng image chỉ chứa tám spec role thật và thư mục support, vẫn giữ nguyên lệnh cấm route mock cho các spec đó. Cần tách fault-injection suite khỏi canonical no-mock image ở một thay đổi hạ tầng test riêng.

# Rà soát nội dung và giao diện quản trị — 03/09/2026

## Phạm vi và nguyên tắc

Rà soát trang quản trị hiện có, không thiết kế lại thương hiệu. Giữ nền trắng/xanh, Tabler Icons, shadcn, các thao tác bản đồ và hợp đồng API. Không thay backend, phân quyền, MFA policy, dữ liệu đang công bố hoặc các hạng mục M7/M8.

Product Design audit được dùng để chụp và đối chiếu giao diện trước/sau. Hai agent frontend xử lý song song nhóm tài khoản và nhóm lớp dữ liệu; agent QA độc lập thao tác trình duyệt. Review chéo giữ nguyên kiểm tra API, quyền, chống ghi đè và bảo vệ thông tin riêng tư.

## Các cải thiện đã triển khai

- [x] Tổng quan tập trung vào số lớp và công việc cần xử lý; ưu tiên lớp cần chỉnh sửa/duyệt/công bố, không bỏ sót trạng thái trả về chỉnh sửa.
- [x] Thống nhất nhãn vai trò, loại đối tượng, trạng thái và thao tác bằng tiếng Việt.
- [x] Menu mobile truy cập được toàn bộ chức năng theo quyền và đăng xuất.
- [x] Hết phiên đăng nhập có một hướng đi rõ ràng, không dùng lỗi đỏ hoặc mã yêu cầu ở màn hình chính.
- [x] Bảo mật tài khoản không chứa thẻ thông tin hạ tầng, API URL, token hoặc trạng thái giả; nhãn xác thực hai bước phản ánh cấu hình thực.
- [x] Danh sách lớp ưu tiên tìm và mở lớp; quản lý nhóm và cấu hình nâng cao được thu gọn.
- [x] Cấu hình lớp có lựa chọn biểu tượng và hướng dẫn trường dữ liệu; import dùng tên bước và thông báo lỗi dễ hiểu.
- [x] Trạng thái lưu phân biệt bản nháp trên thiết bị với dữ liệu đã lưu lên hệ thống; không báo đã lưu khi còn thay đổi.
- [x] Chặn vẽ/sửa trên màn hình dưới 1024px kể cả thiết bị có chuột; vẫn cho mở chế độ xem/duyệt.
- [x] Duyệt/lịch sử dùng “phiên bản”, “lần công bố”, “khôi phục”; không bày UUID, ETag hoặc mã công việc.
- [x] So sánh dữ liệu hiển thị tên đối tượng và trường; tọa độ chi tiết chỉ mở khi cần. Thông tin riêng tư vẫn bị lọc.
- [x] Nhật ký có tên thao tác dễ hiểu; mã tham chiếu chỉ nằm trong phần hỗ trợ thu gọn.
- [x] Hộp thoại tài khoản không bị kéo rộng bởi nội dung dài; thiết bị và trạng thái thư được diễn giải.
- [x] Cập nhật regression tests và locator của các bộ E2E hiện có theo giao diện mới.

## Kiểm chứng tự động

- Vitest: 71 suites, 486 tests đạt tại lần chạy toàn bộ 21:19 ngày 03/09/2026.
- ESLint, TypeScript, generated API contract check: đạt.
- Docker production build: đạt; frontend chạy non-root (UID 1001), health endpoint trả `ok`.
- Backend hiện hữu: PostgreSQL, Redis, MinIO và migrations sẵn sàng. Geo service và mail báo degraded từ môi trường local; không thay cấu hình trong đợt này.
- Không chạy Playwright CLI ngoài trình duyệt được hỗ trợ. Bộ E2E hiện có được cập nhật và kiểm tra kiểu/lint; không đồng nghĩa toàn bộ các kịch bản đó đã chạy lại.

## Kiểm thử thao tác thực

Môi trường: frontend Docker tại `http://localhost:3000`, backend thật tại `http://localhost:4000`, xác thực hai bước tắt. Baseline chụp bằng trình duyệt trong app; sau khi kết nối này mất, kiểm tra lại bằng Brave qua công cụ trình duyệt được hỗ trợ.

Chỉ dùng lớp thử riêng `qa-admin-ux-20260903`. Không xóa lớp cũ, thay bảo mật tài khoản hoặc công bố dữ liệu thử.

| Bước | Nội dung | Kết quả |
| --- | --- | --- |
| 1 | Hết phiên → đăng nhập → tổng quan | Đạt trên bản mới |
| 2 | Danh sách lớp → tạo lớp → cấu hình | Baseline đạt; đang kiểm tra lại |
| 3 | Vẽ/sửa → kiểm tra thiếu tên → lưu → tải lại | Đạt: vẽ, kiểm tra thiếu tên, lưu, tải lại và khôi phục bản nháp chưa lưu |
| 4 | Nhập tệp → đối chiếu → áp dụng | Chưa hoàn tất: hộp thoại chọn tệp Brave không được công cụ nhận diện |
| 5 | Gửi duyệt → yêu cầu chỉnh sửa/phê duyệt | Gửi duyệt đạt; kiểm tra chặn tự duyệt đạt. Phê duyệt thành công chưa chạy vì cần người duyệt khác |
| 6 | Lịch sử, so sánh, nhật ký | Đang kiểm tra lại |
| 7 | Người dùng, chi tiết tài khoản, bảo mật | Đang kiểm tra lại; không thực hiện thao tác đổi bảo mật |
| 8 | Mobile: chặn edit, xem/duyệt, menu, đăng xuất | Đang kiểm tra lại |

Ảnh và ghi chép của cùng đợt kiểm tra: `artifacts/admin-ux-20260903/` trong workspace (cạnh hai repo), gồm `before/` và `after/`. Đây là bằng chứng local, không phải URL công khai.

## Giới hạn

Không tuyên bố đạt toàn bộ WCAG từ ảnh. Kiểm tra bàn phím, focus và aria có regression tests; đọc màn hình, zoom 200% và các loại thiết bị thực cần đợt kiểm tra riêng. Upload thực qua hộp thoại tệp chưa hoàn tất; không thay bằng thao tác API để gắn nhãn E2E đã đạt. Mail mời/khôi phục và công bố dữ liệu thật không nằm trong thao tác trình duyệt của đợt này.

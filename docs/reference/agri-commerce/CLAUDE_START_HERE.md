# Bắt đầu ở đây — prompt và thứ tự đọc cho Claude Code

Bộ này là tài liệu bàn giao để bắt đầu triển khai, chưa chứa ứng dụng đã code. Giải nén vào
`docs/reference/agri-commerce/` trong project, hoặc thư mục riêng trước khi mở project.

## Thứ tự đọc

1. `ECOMMERCE_FOUNDATION.md`: ý tưởng, phạm vi pilot, kiến trúc, dữ liệu, quyền và acceptance criteria.
2. `cocoon-design-language.md`: các đặc trưng thiết kế đã quan sát và cách chuyển sang nông sản.
3. `cocoon-reference/README.md` rồi mở ảnh 01, 06, 08, 09, 10, 11; xem các ảnh khác để hiểu toàn bộ mẫu đã chụp.

## Prompt dùng ngay

```
Bạn đang triển khai nền tảng AI tạo gian hàng thương mại điện tử, khởi đầu với nông sản. Hãy đọc toàn bộ tài liệu trong docs/reference/agri-commerce trước khi code và mở các screenshot được chỉ dẫn. Nếu tôi đặt tài liệu ở đường dẫn khác, dùng đường dẫn thực tế tôi cung cấp.

Tầm nhìn: người bán chụp/tải ảnh sản phẩm, AI gợi ý sản phẩm và hỏi thông tin thiếu, tạo gian hàng riêng có nội dung và thiết kế đẹp, người bán duyệt rồi publish. Trải nghiệm tạo/sửa bằng hội thoại giống Lovable. Đây là nền nhiều doanh nghiệp dùng chung, với mỗi gian hàng có dữ liệu và thương hiệu riêng. Khách hàng pilot là Nông sản Thịnh Phát. Học ngôn ngữ thiết kế Cocoon qua screenshot, dùng tài sản và thông tin thật của Thịnh Phát.

Trước hết kiểm tra repo, AGENTS.md, package manager, schema, stack và các tích hợp hiện có. Giữ convention của repo. Nếu repo chưa có ứng dụng, đề xuất scaffold phù hợp rồi xây foundation local. Không ghi đè project khác, không tự deploy production, không tạo tài khoản trả phí hay tích hợp giả.

Kiến trúc mặc định khi chưa có ràng buộc repo: Next.js + TypeScript, Supabase Postgres/Auth/Storage, multi-tenant modular monolith, renderer theo section schema/theme tokens, durable AI jobs và worker. Kiểm tra tài liệu chính thức và phiên bản tương thích tại thời điểm cài, lưu lockfile. AI tạo dữ liệu/cấu hình được validate và duyệt, không chạy mã tùy ý do người bán hoặc model sinh ra.

Pilot ưu tiên RFQ/hỏi giá → báo giá có phiên bản → chấp nhận → đơn hàng có snapshot, vì website Thịnh Phát đang có nhiều giá “Liên hệ”. Mỗi RFQ/order thuộc một seller. Chưa làm checkout nhiều seller, payout, gateway hay logistics khi chưa được chọn và cấu hình. Có thể ghi nhận thanh toán/giao hàng thủ công với audit, không giả trạng thái thành công.

Hãy báo ngắn gọn những gì tìm thấy trong repo, các lựa chọn cần thiết và kế hoạch. Sau đó triển khai foundation theo từng bước có thể review:
1. Tenant/membership, auth, catalog/variant/asset; migrations, constraints, RLS, storage policies và hai tenant demo.
2. Storefront renderer, public catalog/product, draft/preview/publish version, thiết kế lấy cảm hứng Cocoon và responsive mobile.
3. Upload → queue/worker → provider adapter → typed AI draft → bổ sung dữ kiện → duyệt/publish.
4. RFQ → quote version → idempotent acceptance → order snapshot.

Nếu API key chưa có, dùng mock adapter gắn nhãn rõ và giữ interface để chuyển sang provider thật; không gọi mock là AI thật. Seed demo phải ghi rõ demo, không bịa giá, trọng lượng, xuất xứ, chứng nhận hay công suất cho Thịnh Phát. Seller xác nhận giá, origin, quy cách, MOQ, bảo quản và vùng giao trước xuất bản.

Ưu tiên kiểm thử tenant isolation ở DB/API/storage/cache, draft-public separation, job retry, số lượng decimal/đơn vị, quote expiry/version/concurrent accept và order snapshot. Service-role không ở client; mọi privileged path phải kiểm tra tenant. Không dùng tenant_id do client gửi làm authorization. Mọi child relation thuộc tenant phải có ràng buộc ngăn cross-tenant reference.

GEO hiểu là khả năng đọc/index và thông tin có cấu trúc, có nguồn: SSR, canonical, sitemap published, Product/Organization/Breadcrumb JSON-LD hợp lệ. Giá liên hệ không sinh Offer giá 0, không bịa rating/GTIN/certification, không cam kết AI search sẽ đề xuất sản phẩm.

Mỗi bước hãy làm một luồng hoàn chỉnh có lưu dữ liệu và kiểm thử, báo file đã sửa, cách chạy, kết quả kiểm tra và phần chưa kết nối thật. Đừng chỉ tạo mock dashboard. Khi cần quyết định kinh doanh chưa có dữ liệu, ghi giả định và hỏi đúng câu ảnh hưởng đến bước tiếp theo, tiếp tục các phần không phụ thuộc.
```

## Kết quả mong đợi từ lượt triển khai đầu tiên

Tenant foundation và catalog có hai tenant test, trang storefront đầu tiên, schema/version cho draft-public,
migration/RLS được kiểm tra, hướng dẫn chạy local và danh sách biến môi trường dưới dạng tên biến không chứa
secret. Claude cần nêu rõ phần nào đã chạy, phần nào chỉ scaffold, phần nào đang dùng mock.

Không phải mọi module trong tài liệu nền đều phải được code ngay lượt đầu. Thực hiện tuần tự theo gate và giữ
mục tiêu cuối là luồng AI tạo gian hàng rồi bán hàng, tránh biến pilot thành một website tĩnh riêng cho Thịnh Phát.

# 0002 — Trợ lý người bán: ảnh → AI → phiếu sản phẩm

Ngày: 13/10/2026. Trạng thái: áp dụng cho bước 3.

## Quyết định

1. **Đăng nhập**: Supabase Auth (email + mật khẩu) qua `@supabase/ssr`. Server xác minh bằng `auth.getClaims()`
   rồi chạy truy vấn với `withActor`, nên RLS quyết định quyền. Local không có Supabase: `DEV_AUTH=1` cho phép chọn
   người dùng seed; tắt khi production hoặc khi đã cấu hình Supabase Auth.
2. **Ảnh**: kiểm tra định dạng từ nội dung file bằng `sharp`, xoay theo EXIF, thu về tối đa 2000 px, mã hóa lại WebP.
   Việc mã hóa lại bỏ toàn bộ metadata, kể cả GPS. Ảnh gốc lưu private (`tenant-private`). Khi người bán duyệt, ảnh
   được chép sang `tenant-public` bằng service role sau khi kiểm tra membership và vai trò.
3. **Hàng đợi**: bảng `ai_jobs` thay vì Supabase Queues, để mọi thứ chạy được trên Postgres local và trong test.
   Job được nhận bằng `for update skip locked` và giữ bằng lease 180 giây. Lần thử lại dùng backoff 20 s × 3ⁿ (tối đa
   10 phút). Sau 3 lần, job chuyển sang `dead`. Mọi lệnh ghi kết quả đều kèm số lần thử, nên worker hết lease không
   ghi đè được kết quả mới. Khóa idempotent là tenant + hash ảnh đã mã hóa lại + phiên bản schema.
   `enqueue_product_analysis` lấy tenant từ chính ảnh, không nhận tenant từ client.
4. **Chạy job không cần worker riêng**: `after()` sau khi tải ảnh, khi trình duyệt hỏi trạng thái mà job đang chạy
   được, và cron mỗi ngày (`CRON_SECRET`). Có thể thêm worker chạy liên tục sau này mà không phải đổi schema.
5. **Chống bịa**: `sanitizeDraft` luôn xóa xuất xứ, giá, khối lượng, MOQ, hạn dùng mà AI đưa ra. Hàm này cũng bỏ
   HTML, link, bằng chứng trỏ tới ảnh ngoài lượt phân tích, và các cụm khẳng định cần giấy tờ (hữu cơ, VietGAP, 100%,
   "nhất", địa danh). Các cụm bị bỏ được liệt kê để người bán biết. Chữ trong ảnh được coi là dữ liệu, không phải
   chỉ dẫn cho AI.
6. **Phiếu sản phẩm**: 10 câu theo thứ tự khách sỉ xem hàng: tên → nhóm → sơ chế → xuất xứ → đơn vị/gói → MOQ → giá →
   bảo quản → hạn dùng → mô tả. Gợi ý của AI chỉ điền sẵn vào ô, gắn nhãn "AI gợi ý", và người bán phải bấm xác nhận.
   Các dữ kiện quan trọng được ghi vào `product_evidence` dạng `seller_statement`, kèm người xác nhận.
7. **Bố cục học từ Cocoon**: thêm `category_rows` và `faq` vào danh sách khối cho phép. Khối hỏi đáp sinh JSON-LD
   FAQPage và được đưa vào dữ liệu của chatbot. Gian hàng không xuất bản được khi còn chữ "[Chờ … xác nhận]".

## Việc còn mở

- Chưa có preview bản nháp, chưa có màn hình sửa sản phẩm đã tạo, chưa có RFQ.
- Model trên stali.vn phải nhận được ảnh. Nếu không, job sẽ báo lỗi và trợ lý vẫn hỏi đủ 10 câu mà không có gợi ý.

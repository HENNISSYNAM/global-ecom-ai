# Deploy lên Vercel

Ứng dụng là Next.js chuẩn. `vercel.json` chỉ khai báo một cron mỗi ngày gọi `/api/cron/ai-jobs` để quét lại các lượt phân tích ảnh bị dở.

## Điều kiện trước khi deploy

Trang gian hàng đọc dữ liệu từ Postgres ở mỗi request. **Không có database thật thì deploy vẫn build được nhưng mọi
trang gian hàng sẽ lỗi.** Cần một Postgres (khuyên dùng Supabase project riêng cho sàn) đã chạy các migration trong
`supabase/migrations/`. Không chạy `tests/db/supabase-shim.sql` trên Supabase.

## Trạng thái project Supabase `oagpgunqdzogbrpveeqg`

- Đã áp các migration trong `supabase/migrations/` (kể cả thu hồi quyền chạy hàm mặc định của `anon`).
- Đã nạp dữ liệu demo: 4 người dùng demo (không đăng nhập được), 2 doanh nghiệp, 8 sản phẩm, duyệt 2 sản phẩm demo,
  tạo 2 gian hàng.
- **Còn lại:** chạy một lần `supabase/finish-demo-storefronts.sql` trong SQL Editor để gán bố cục và xuất bản gian hàng
  demo. Trước bước này `/s/vuon-mau-demo` sẽ trả 404.

## Các bước

1. vercel.com → **Add New… → Project** → chọn repo `HENNISSYNAM/global-ecom-ai` → Framework: Next.js (tự nhận).
2. **Environment Variables** (Production và Preview):

   | Biến | Giá trị |
   | --- | --- |
   | `DATABASE_URL` | Chuỗi kết nối pooler của Supabase (Transaction mode, port 6543) |
   | `SITE_URL` | Tên miền chính thức, ví dụ `https://<project>.vercel.app` |
   | `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Nhà cung cấp AI kiểu OpenAI-compatible (nếu dùng) |
   | `ANTHROPIC_API_KEY` | Chỉ khi dùng Claude thay cho nhóm `AI_*` |
   | `AI_VISION_MODEL` | Không bắt buộc: model đọc ảnh trên cùng gateway (mặc định dùng `AI_MODEL`, model đó phải nhận ảnh) |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://oagpgunqdzogbrpveeqg.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key của project (công khai được, dùng cho đăng nhập) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Secret/service role key: **chỉ phía server**, dùng để lưu và chép ảnh |
   | `CRON_SECRET` | Chuỗi ngẫu nhiên dài; Vercel Cron gửi kèm khi gọi `/api/cron/ai-jobs` |

   Chỉ hai biến `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` được có tiền tố `NEXT_PUBLIC_`. Không đặt
   `DEV_AUTH` trên Vercel. Không dán key vào code hay chat.
3. **Supabase Auth** → URL Configuration: Site URL = tên miền Vercel; thêm `https://<tên-miền>/ban-hang` vào Redirect
   URLs (link xác nhận email trỏ về đây).
4. **Deploy**. Mỗi lần push lên `main` Vercel deploy production; mỗi PR có bản preview.
5. Kiểm tra sau deploy: đăng ký tại `/dang-nhap`, tạo cửa hàng, gửi ảnh cho trợ lý ở `/ban-hang`; `/s/<slug>` của một gian hàng đã xuất bản, `/sitemap.xml`, `/robots.txt`, và mở “Hỏi đáp”
   xem câu trả lời có dòng “chưa dùng AI” không (có nghĩa là biến AI chưa được đặt đúng).

## Giới hạn hiện tại

- Rate limit của chat lưu trong bộ nhớ từng instance serverless, chưa dùng chung giữa các instance.
- Hàng đợi phân tích ảnh chạy ngay sau khi tải ảnh (`after()`), khi trình duyệt hỏi trạng thái, và qua cron mỗi
  ngày. Không cần worker riêng; Vercel gói Hobby chỉ cho cron một lần/ngày.
- Request tải ảnh lên Vercel tối đa khoảng 4,5 MB. Trình duyệt thu nhỏ ảnh về 1600 px trước khi gửi. Ảnh HEIC trên
  trình duyệt không đọc được HEIC sẽ được gửi nguyên kích thước.
- Chưa có trang xem trước (preview) bản nháp. Biểu mẫu hỏi giá (RFQ) chưa làm.

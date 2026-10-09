# Deploy lên Vercel

Ứng dụng là Next.js chuẩn; Vercel tự nhận cấu hình, không cần `vercel.json`.

## Điều kiện trước khi deploy

Trang gian hàng đọc dữ liệu từ Postgres ở mỗi request. **Không có database thật thì deploy vẫn build được nhưng mọi
trang gian hàng sẽ lỗi.** Cần một Postgres (khuyên dùng Supabase project riêng cho sàn) đã chạy các migration trong
`supabase/migrations/`. Không chạy `tests/db/supabase-shim.sql` trên Supabase.

## Các bước

1. vercel.com → **Add New… → Project** → chọn repo `HENNISSYNAM/global-ecom-ai` → Framework: Next.js (tự nhận).
2. **Environment Variables** (Production và Preview):

   | Biến | Giá trị |
   | --- | --- |
   | `DATABASE_URL` | Chuỗi kết nối pooler của Supabase (Transaction mode, port 6543) |
   | `SITE_URL` | Tên miền chính thức, ví dụ `https://<project>.vercel.app` |
   | `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Nhà cung cấp AI kiểu OpenAI-compatible (nếu dùng) |
   | `ANTHROPIC_API_KEY` | Chỉ khi dùng Claude thay cho nhóm `AI_*` |
   | `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase (để hiển thị ảnh công khai) |

   Không đặt key nào dưới dạng `NEXT_PUBLIC_*` trừ URL Supabase. Không dán key vào code hay chat.
3. **Deploy**. Mỗi lần push lên `main` Vercel deploy production; mỗi PR có bản preview.
4. Kiểm tra sau deploy: `/s/<slug>` của một gian hàng đã xuất bản, `/sitemap.xml`, `/robots.txt`, và mở “Hỏi đáp”
   xem câu trả lời có dòng “chưa dùng AI” không (có nghĩa là biến AI chưa được đặt đúng).

## Giới hạn hiện tại

- Rate limit của chat lưu trong bộ nhớ từng instance serverless, chưa dùng chung giữa các instance.
- Chưa có đăng nhập người bán; dữ liệu demo nạp bằng `supabase/seed.sql` (chỉ dùng cho môi trường thử).

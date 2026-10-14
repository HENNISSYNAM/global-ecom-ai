# 0001 — Foundation: data access, isolation and draft/public separation

Ngày: 08/10/2026. Trạng thái: áp dụng cho bước 1–2.

## Bối cảnh

Repo mới, chưa có ứng dụng. Tài liệu nền đề xuất Next.js + TypeScript + Supabase, multi-tenant modular monolith.
Môi trường phát triển hiện tại không kéo được image Docker của Supabase, nên không chạy được `supabase start`.

## Quyết định

1. **Stack**: Next.js 16.3 (App Router), React 19.2, TypeScript 6.0, zod 4, `postgres` (porsager) 3.4, Vitest 5.
   Chọn bản đã phát hành ít nhất vài ngày, không lấy bản ra trong ngày. npm + lockfile.
2. **Truy cập dữ liệu phía server qua Postgres trực tiếp, RLS vẫn áp dụng**: mỗi request mở transaction,
   `set local role anon|authenticated` và đặt `request.jwt.claims` như PostgREST làm. Cùng một đường truy cập chạy
   được cả với Postgres local và Supabase (qua pooler, `prepare: false`). Kết nối chủ (bypass RLS) chỉ dùng qua
   `withPrivileged` và phải tự kiểm tra tenant.
3. **Shim Supabase cho local/test** (`tests/db/supabase-shim.sql`): roles, `auth.users`, `auth.uid()`,
   `storage.buckets/objects`, `storage.foldername()`. Migrations giữ đúng định dạng Supabase để áp lên project thật.
   Rủi ro: hành vi shim có thể lệch Supabase; cần chạy lại bộ test trên Supabase branch trước go-live.
4. **Cô lập tenant**: RLS mọi bảng, grant theo cột (vd. không client nào sửa được `status`, `tenant_id`), FK
   ghép `(tenant_id, id)`, trigger chặn đổi `tenant_id`, hàm `private.*` security definer cho kiểm tra membership.
   Tenant bị `suspended` mất quyền truy cập. Hàm đặc quyền trả cùng một lỗi cho "không tồn tại" và "không phải của bạn".
5. **Draft/public**: mỗi storefront có 1 draft (có `revision` cho optimistic concurrency). Publish sao chép draft +
   snapshot catalog đã duyệt vào một version bất biến và trỏ `published_version_id`. Trang công khai chỉ đọc version
   đó, nên sửa draft hay sửa catalog không đổi trang công khai cho tới lần publish sau; rollback trả cả bố cục lẫn
   nội dung. Sửa trường người mua thấy, biến thể hoặc giá của sản phẩm đã duyệt sẽ đưa sản phẩm về draft.
6. **Cổng duyệt sản phẩm**: `approve_product` chỉ duyệt khi có xuất xứ, sơ chế, bảo quản, ít nhất một quy cách và
   một offer hiệu lực (giá cố định hoặc "cần báo giá"); nếu thiếu trả danh sách trường cần hỏi người bán.
7. **Cache**: trang công khai `force-dynamic` (render mỗi request). Khi thêm cache, key phải gồm tenant +
   published version + locale.

## Hệ quả / việc còn mở

- Đăng nhập người bán (Supabase Auth) và console chưa nối: chưa có cách lấy `userId` thật từ request. Bước tiếp
  theo cần `@supabase/ssr` để xác thực JWT phía server rồi gọi `withActor`.
- Preview draft (có auth, noindex) chưa có.
- Ảnh: chưa có luồng upload; `publicAssetUrl` trả `null` khi chưa cấu hình Supabase, renderer hiện placeholder ghi rõ.

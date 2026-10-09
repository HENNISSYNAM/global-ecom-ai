# global-ecom-ai

Nền tảng giúp cơ sở nông sản Việt tạo và quản lý gian hàng riêng bằng ảnh và hội thoại. Mỗi doanh nghiệp có dữ
liệu, thương hiệu và đường dẫn riêng trên cùng một hệ thống. Khách hàng pilot: Nông sản Thịnh Phát.

Tài liệu nền: [`docs/reference/agri-commerce/`](docs/reference/agri-commerce/README.md) ·
Quyết định kỹ thuật: [`docs/decisions/`](docs/decisions/).

## Trạng thái

| Bước | Trạng thái |
| --- | --- |
| 1. Tenant, membership, catalog, asset, RLS, storage policies, 2 tenant demo | Đã làm, có kiểm thử trên Postgres thật |
| 2. Storefront renderer, trang công khai, draft/publish/rollback, JSON-LD, sitemap | Trang công khai + publish đã chạy; **chưa có console/preview cho người bán** |
| 3. Upload → job/worker → AI draft | Chưa làm |
| 4. RFQ → báo giá → đơn hàng | Chưa làm (nút hỏi giá hiện ghi rõ là chưa nhận yêu cầu) |
| Chatbot hỏi đáp trên gian hàng | Đã làm: chỉ trả lời từ bản đã xuất bản. Dùng nhà cung cấp kiểu OpenAI-compatible (`AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`) hoặc Claude (`ANTHROPIC_API_KEY`); chưa cấu hình thì trả lời tự động theo từ khóa, ghi rõ "chưa dùng AI" |
| Nhập dữ liệu từ website người bán | Công cụ đã có và đã test với website giả; **chưa chạy với nongsanthinhphat.com** vì môi trường chặn tên miền |

## Nhập dữ liệu từ website có sẵn

```bash
npm run import:site -- https://nongsanthinhphat.com/ --max-pages 60
```

Kết quả nằm ở `data/imports/<host>/<thời gian>/` (không commit): `crawl.json`, ảnh trong `images/`, và `REVIEW.md` liệt
kê sản phẩm phát hiện. Đây là tư liệu chờ người bán xác nhận; công cụ không ghi gì vào database và không xuất bản.
Chỉ dùng với website của người bán khi họ đồng ý.

## Chạy local

Cần Node 22+ và PostgreSQL 16 chạy ở localhost (không cần Docker/Supabase cho phần hiện tại).

```bash
npm install
# tạo role local một lần, ví dụ: createuser --superuser agri && psql -c "alter role agri password 'agri'"
cp .env.example .env.local   # đặt DATABASE_URL=postgres://agri:agri@localhost:5432/agri_dev, SITE_URL=http://localhost:3000
npm run db:reset             # tạo lại DB local: shim Supabase + migrations + seed demo
npm run dev                  # http://localhost:3000/s/vuon-mau-demo
```

Kiểm tra:

```bash
npm run typecheck
npm test        # tự tạo DB agri_test (đổi bằng TEST_DATABASE_URL)
npm run build
```

`npm run db:reset` và test chỉ chạy với host localhost.

## Deploy

Xem [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Biến môi trường

Xem [`.env.example`](.env.example): `DATABASE_URL`, `SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (chỉ server/worker), `ANTHROPIC_API_KEY` (bước 3).

## Cấu trúc

```
supabase/migrations/   schema, ràng buộc, RLS, hàm publish/approve, storage policies
supabase/seed.sql      2 tenant demo (Vườn Mẫu DEMO; Thịnh Phát chỉ có tên sản phẩm, ở trạng thái nháp)
src/modules/           storefront (sections, theme, draft, public read), catalog (định dạng), seo (JSON-LD)
src/components/        renderer gian hàng
src/app/               /s/[storeSlug], /s/[storeSlug]/san-pham/[productSlug], sitemap, robots
tests/                 integration (RLS, storage, publish) + unit; tests/db/supabase-shim.sql chỉ dùng local
```

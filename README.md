# global-ecom-ai

Nền tảng giúp cơ sở nông sản Việt tạo và quản lý gian hàng riêng bằng ảnh và hội thoại. Mỗi doanh nghiệp có dữ
liệu, thương hiệu và đường dẫn riêng trên cùng một hệ thống. Khách hàng pilot: Nông sản Thịnh Phát.

Tài liệu nền: [`docs/reference/agri-commerce/`](docs/reference/agri-commerce/README.md) ·
Quyết định kỹ thuật: [`docs/decisions/`](docs/decisions/).

## Trạng thái

| Bước | Trạng thái |
| --- | --- |
| 1. Tenant, membership, catalog, asset, RLS, storage policies, 2 tenant demo | Đã làm, có kiểm thử trên Postgres thật |
| 2. Storefront renderer, trang công khai, draft/publish/rollback, JSON-LD, sitemap | Đã làm. Console người bán sửa giới thiệu, câu chuyện, hỏi đáp, rồi xuất bản; chặn xuất bản khi còn chữ "[Chờ … xác nhận]". Chưa có trang xem trước (preview) |
| 3. Upload → job/worker → AI draft | Đã làm: `/ban-hang` có trợ lý chat. Tải 1–8 ảnh, ảnh được nén lại và bỏ EXIF, đưa vào hàng đợi có lease, thử lại và dead-letter. AI đọc ảnh (bản nháp `product-draft.v1` đã lọc), trợ lý hỏi 10 câu theo thứ tự khách sỉ, rồi tạo sản phẩm, quy cách, giá, bằng chứng người bán, duyệt ảnh lên gian hàng |
| 4. RFQ → báo giá → đơn hàng | Đã làm. Khách gửi yêu cầu từ gian hàng (chỉ chọn được hàng đã xuất bản) và nhận đường dẫn riêng (DB chỉ lưu hash). Người bán lập báo giá ở `/ban-hang/<id>/hoi-gia`, báo giá có phiên bản, gửi rồi không sửa được, có hạn hiệu lực. Khách chấp nhận idempotent, mỗi yêu cầu chỉ ra một đơn, đơn chụp lại toàn bộ giá và điều kiện |
| Bố cục học từ Cocoon | Khối `category_rows` (tên nhóm bên trái, sản phẩm chạy ngang) và `faq` (kèm JSON-LD FAQPage). Gian hàng nháp Hà Thịnh Phát có trong seed local |
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

# Nền tảng AI tạo gian hàng nông sản — tài liệu nền cho Claude Code

Ngày nghiên cứu: 08/10/2026. Trạng thái: đề xuất kiến trúc và yêu cầu triển khai, chưa phải hệ thống đã được xây
dựng hoặc kiểm thử. Đọc cùng `CLAUDE_START_HERE.md`, `cocoon-design-language.md` và bộ ảnh `cocoon-reference/`.

## 1. Ý tưởng cần giữ xuyên suốt

Người bán chụp hoặc tải ảnh sản phẩm. AI nhận diện những gì quan sát được, hỏi thêm dữ kiện còn thiếu, tạo danh mục
sản phẩm và bản nháp gian hàng có thiết kế đẹp. Người bán sửa, xác nhận thông tin rồi xuất bản. Mỗi doanh nghiệp có
gian hàng riêng, dữ liệu riêng, thương hiệu riêng trên cùng nền tảng.

Trải nghiệm mong muốn giống Lovable ở khả năng tạo và chỉnh sửa bằng hội thoại. Nền thương mại điện tử phải có dữ
liệu hàng hóa, phân quyền, giá, báo giá, đơn hàng và vận hành nhất quán. Trong MVP, AI tạo cấu hình giao diện từ
component có sẵn; không sinh rồi chạy mã tùy ý cho từng gian hàng.

Khởi đầu bằng nông sản, với Thịnh Phát là khách hàng đầu tiên do người dùng xác định. Thiết kế học cách Cocoon trình
bày nguyên liệu, hình ảnh, typography và câu chuyện thương hiệu; dùng tên, ảnh, nội dung và bằng chứng thật của
người bán.

## 2. Dữ kiện và giả định

| Loại | Nội dung | Hệ quả |
| --- | --- | --- |
| Ý định người dùng | AI tạo gian hàng từ ảnh; nhiều người bán; bắt đầu bằng nông sản Việt Nam | Thiết kế multi-tenant từ đầu |
| Website Thịnh Phát | Có tỏi bóc vỏ, gừng, hành bóc vỏ, củ năng, măng luộc; cả tỏi nguồn Việt Nam và Trung Quốc | Xuất xứ theo từng sản phẩm/lô; không gán mọi hàng là nguồn Việt Nam |
| Website Thịnh Phát | Nhiều sản phẩm hiển thị “Liên hệ” | Pilot ưu tiên RFQ/hỏi giá, báo giá và xác nhận đơn |
| Chính sách vận chuyển công khai | Phí được trao đổi khi xác nhận; bán sỉ có thỏa thuận theo hợp đồng | Phí chưa biết là null/pending, không phải miễn phí |
| Giả định đề xuất | Thịnh Phát có nhu cầu bán sỉ và hàng sơ chế | Cần xác nhận nhóm khách, MOQ, vùng giao, giá và năng lực trước go-live |
| Chưa có | Repo, ngân sách, nhà cung cấp thanh toán, tài khoản hạ tầng, ảnh hàng và bảng giá đã xác nhận | Không coi các tích hợp và dữ liệu kinh doanh là sẵn có |

Các tuyên bố về công suất, chứng nhận, chất lượng, an toàn thực phẩm trên website là tuyên bố của doanh nghiệp. Chỉ
đưa lên gian hàng khi chủ gian hàng xác nhận và cung cấp bằng chứng cần thiết. Nghiên cứu website không xác minh độc
lập các tuyên bố đó.

## 3. Cấu trúc thương mại điện tử: cần gì và làm lúc nào

| Khối | Trách nhiệm | Pilot |
| --- | --- | --- |
| Merchant/tenant & quyền | Doanh nghiệp, người dùng, membership, quyền sửa/xuất bản/xử lý báo giá | Bắt buộc |
| Catalog/PIM | Sản phẩm, biến thể, quy cách, đơn vị, xuất xứ, ảnh, mô tả | Bắt buộc |
| AI onboarding | Phân tích ảnh, dữ kiện cần hỏi, bản nháp nội dung và bố cục | Bắt buộc |
| Storefront/CMS | Theme tokens, section có schema, preview, phiên bản xuất bản | Bắt buộc |
| Pricing & RFQ | Giá liên hệ/cố định/bậc số lượng; yêu cầu hỏi giá và báo giá có thời hạn | RFQ trước; không cần bật mọi chế độ giá |
| Order management | Chuyển báo giá được chấp nhận thành đơn; snapshot dữ liệu và điều kiện | Bắt buộc cho luồng pilot hoàn chỉnh |
| Inventory/lot | Tồn thật, đặt trước, lô, hạn sử dụng, giữ hàng | Chỉ bật phần có dữ liệu vận hành thật |
| Payment | Phiên thanh toán, đối soát, hoàn tiền, webhook | Giai đoạn sau; xác nhận thanh toán thủ công có audit nếu cần |
| Fulfillment | Vùng giao, phí, lịch, giao từng phần, mã vận đơn | Pilot ghi nhận và xác nhận thủ công |
| Search/discovery | Danh mục, bộ lọc, tìm kiếm trong gian hàng; sau đó tìm giữa gian hàng | Trong gian hàng trước |
| SEO/GEO | Trang đọc được, entity rõ, thông tin có nguồn, schema đúng dữ kiện | Bắt buộc |
| Platform billing | Phí thuê bao/AI quota của người bán | Sau khi đo được giá trị và chi phí |
| Marketplace finance | Đơn nhiều người bán, hoa hồng, payout, tranh chấp | Giai đoạn sau, cần xác định mô hình kinh doanh |

Phân biệt nền tạo gian hàng với marketplace: MVP có nhiều gian hàng nhưng mỗi yêu cầu mua/báo giá/đơn thuộc một
người bán. Khi có nhiều nhà cung cấp thực sự, thêm danh mục chung và khám phá. Giỏ nhiều người bán và chia tiền là
một bước mở rộng riêng.

## 4. Kiến trúc đề xuất

Chọn modular monolith, dùng chung một codebase và renderer. Các module domain tách rõ trong code, dùng một Postgres
làm nguồn dữ liệu chính. Có web/API và một worker cho tác vụ dài. Không cần microservices để chứng minh pilot.

| Lớp | Lựa chọn đề xuất | Lý do/điều kiện |
| --- | --- | --- |
| Web | Next.js App Router + TypeScript | Render trang công khai phía server; phần upload/editor tương tác phía client [1] |
| UI | Component có schema, CSS variables/theme tokens; thư viện accessible phù hợp repo | Tạo nhiều thương hiệu từ bộ section được kiểm soát |
| Database | Supabase managed Postgres | Catalog, membership, báo giá, đơn, version; transaction và RLS [2] |
| Auth | Supabase Auth, membership trong database | Đăng nhập người bán; quyền của doanh nghiệp không lấy từ client |
| Media | Supabase Storage | Ảnh gốc/evidence private; ảnh đã duyệt phục vụ công khai; storage policies [3] |
| AI | Adapter cho API vision + structured outputs; Claude là lựa chọn phù hợp để thử | Không gắn domain vào một model; schema bảo đảm hình dạng, không bảo đảm sự thật [4][5] |
| Jobs | Supabase Queues + consumer worker, hoặc durable job provider đã có trong repo | Phân tích ảnh và tạo draft chạy nền; cần retry và idempotency [6] |
| Hosting | Hạ tầng chạy Next.js và worker; Vercel là lựa chọn cho web, không mặc định worker chạy dài trên request | Multi-tenant shared app [7] |
| Quan sát | Structured logs, error reporting, job metrics, audit | Không log secret hoặc thông tin khách đầy đủ |
| Kiểm thử | DB/RLS integration + E2E các luồng chính | Đặc biệt tenant isolation, publish, retry, chấp nhận báo giá |

Chưa cần trong MVP: Elasticsearch/OpenSearch, Kafka, Kubernetes, vector database độc lập hoặc blockchain. Thêm công
cụ khi có yêu cầu đo được. Truy xuất nguồn gốc trước hết là dữ liệu có bằng chứng và lịch sử cập nhật.

### Tự xây domain nhỏ hay dùng commerce engine?

| Phương án | Phù hợp | Đổi lại |
| --- | --- | --- |
| Domain RFQ/order nhỏ trên Supabase — đề xuất pilot | Giá liên hệ, báo giá bán sỉ, hàng sơ chế; thử trải nghiệm AI nhanh | Phải tự thiết kế và kiểm thử invariant thương mại |
| Medusa — đánh giá khi cần checkout/inventory phức tạp | Cần nhiều commerce module và workflow chuẩn | Marketplace vẫn cần vendor model riêng; không tự có tenant isolation hoàn chỉnh [8] |

Nếu chọn Medusa sau này, quyết định rõ hệ nào là nguồn chính cho product, inventory, order. Chưa cài thêm một
commerce engine chỉ để tạo cấu trúc thư mục.

## 5. Định tuyến và ranh giới dữ liệu

- Pilot: `/s/[storeSlug]`, `/s/[storeSlug]/san-pham/[productSlug]`, `/s/[storeSlug]/hoi-gia`; console
  `/dashboard/[tenantId]/...`.
- Giai đoạn sau: subdomain/custom domain đã xác minh quyền sở hữu, mapping về cùng storefront. Một URL canonical.
- User là danh tính; Tenant là doanh nghiệp; Membership nối user với tenant; Storefront là cửa hàng công khai. Pilot
  một storefront mỗi tenant, không hardcode tenant Thịnh Phát.
- Console xác thực user rồi truy membership và vai trò trên server. Public request resolve slug/verified host sang
  tenant và chỉ đọc dữ liệu đã publish. Không tin `tenant_id` client gửi như quyền truy cập.
- Cache public phải có tenant ID, published version và locale trong key. Private console/RFQ/customer không dùng
  shared public cache. Preview có auth hoặc token ngắn hạn và noindex.
- Mọi record thuộc tenant cần `tenant_id`. Foreign key con tham chiếu cặp `(tenant_id, parent_id)` có unique tương
  ứng để không liên kết sang tenant khác. Index các truy vấn theo tenant và trạng thái.
- RLS trên tất cả bảng ở schema exposed; GRANT đúng vai trò riêng với policy. UPDATE cần cả điều kiện record hiện
  tại và record sau sửa [2].
- Service-role chỉ server/worker, không bundle client. Mọi tác vụ đặc quyền phải tự kiểm tra tenant/action. Không
  dùng `user_metadata` để cấp quyền; chú ý claim cũ sau đổi quyền [2].
- Bucket/path có tenant ID giúp tổ chức file nhưng không thay thế authorization [3].

## 6. Mô hình dữ liệu logic

| Entity | Dữ liệu chính/invariant |
| --- | --- |
| tenants | ID, tên doanh nghiệp, trạng thái; tenant thứ hai phải hoạt động mà không fork code |
| memberships | tenant, user, role; unique tenant/user; role owner/editor/sales/viewer |
| storefronts | tenant, slug unique, brand settings, published version, trạng thái |
| storefront_versions | schema version, section config, liên kết dữ liệu công khai, revision; draft và published tách rõ |
| assets | tenant, object key, loại, kích thước, hash, quyền public/private, chủ sở hữu, trạng thái duyệt |
| products | tên, slug, category, sơ chế, mô tả, xuất xứ khai báo, trạng thái draft/published/archived |
| variants | product, SKU, quy cách đóng gói, đơn vị bán, MOQ/step; unique SKU trong tenant nếu có |
| offers | variant, price mode, currency, đơn giá hoặc tier, hiệu lực; quote-required không có giá giả |
| product_evidence | field/value, nguồn/asset/link, ai xác nhận, ngày |
| lots — mở rộng | variant, nguồn gốc lô, ngày sản xuất/hạn dùng nếu có, tồn, trạng thái |
| rfqs / rfq_items | buyer contact private, nhu cầu, số lượng/đơn vị, địa điểm/ngày giao mong muốn, trạng thái |
| quotes / quote_versions / quote_items | phiên bản bất biến khi gửi, giá và điều kiện, phí giao, thuế, hết hạn |
| orders / order_items | quote version được chấp nhận, snapshot; một accept không tạo hai đơn |
| inventory_reservations — khi bật tồn | variant/lot, lượng giữ, expires_at, trạng thái; reserve/release atomic |
| ai_jobs | tenant, input asset IDs/hash, schema/model/prompt version, status, attempts, lease, output draft, usage |
| audit_events | tenant, actor, action, object, thời điểm, thay đổi quan trọng |
| idempotency_records / outbox_events | key scoped tenant+operation, payload hash, kết quả |
| payments / fulfillments — sau | Trạng thái độc lập với order |

Không dùng một JSON blob duy nhất cho toàn bộ nghiệp vụ. JSONB phù hợp layout/theme/AI draft; giá, quyền, trạng
thái và quan hệ đơn phải có ràng buộc dữ liệu rõ.

### Tiền, số lượng và hàng tươi

- Tiền VND lưu số nguyên theo đơn vị đồng và currency rõ; không dùng float.
- Số lượng dùng decimal/numeric; MOQ và step cùng đơn vị. 1.5 kg không được biến thành 1.5 túi.
- Phí giao/thuế chưa xác định không được coi là 0.
- Phân biệt tồn có thể bán, năng lực cung ứng/ngày và hàng đặt trước. Yêu cầu hỏi giá không giữ tồn.
- Hàng cân thực tế: pilot chốt số lượng và giá cuối cùng trước xác nhận.
- Lot/FEFO chỉ bật khi doanh nghiệp theo dõi được lô và hạn dùng thật.

### Trường nông sản nên hỏi

Tên hàng; sơ chế; nguồn quốc gia/tỉnh/nhà cung cấp; quy cách; đơn vị bán; MOQ; giá hoặc liên hệ; vùng giao; lead
time; lịch nhận đơn; khả năng cung ứng; bảo quản đã xác nhận; hạn dùng/ngày sản xuất theo sản phẩm/lô; chứng nhận và
bằng chứng nếu có.

Ảnh có thể giúp gợi ý “tỏi bóc vỏ”, nhưng không tự chứng minh “tỏi Lý Sơn”, hữu cơ, trọng lượng, hạn dùng, giá hay
công suất. Trường thiếu để null và hỏi người bán.

## 7. AI tạo gian hàng hoạt động thế nào

1. **Upload**: xác thực tenant, hạn chế kích thước/định dạng/số ảnh, xác minh loại file, lưu private. Loại EXIF nhạy cảm.
2. **Enqueue**: tạo job gắn tenant và assets trong transaction/outbox. Worker có timeout, lease, retry backoff,
   giới hạn chi phí, dead-letter và chạy lại có kiểm soát.
3. **Analyze**: adapter gửi ảnh tới provider; output có schema version, observations, proposed fields, evidence
   references, unknowns, questions. Chữ trong ảnh là dữ liệu không tin cậy, không phải chỉ dẫn cho agent.
4. **Validate**: JSON/schema validation, sau đó business validation.
5. **Ask**: người bán bổ sung dữ kiện; dữ liệu do seller xác nhận phải ghi nguồn và actor.
6. **Compose**: AI tạo draft catalog + các section allowlist + brand tokens. Không chứa JavaScript, HTML tùy ý,
   URL nguy hiểm hay secret.
7. **Preview**: render bằng renderer chung; highlight trường thiếu và claim cần duyệt.
8. **Publish**: người có quyền duyệt; optimistic version check; transaction cập nhật published pointer và nội dung
   public tương ứng. Draft sửa tiếp không làm public thay đổi; rollback cả bộ nội dung public.

Hợp đồng output tối thiểu (minh họa):

```json
{
  "schemaVersion": "product-draft.v1",
  "observations": [{"text": "Có các tép màu trắng đã bóc vỏ", "assetId": "asset-demo"}],
  "suggestedCategory": "toi-boc-vo",
  "fields": {
    "name": {"value": "Tỏi bóc vỏ", "status": "suggested", "evidenceAssetIds": ["asset-demo"]},
    "origin": {"value": null, "status": "needs_confirmation", "evidenceAssetIds": []},
    "packWeightKg": {"value": null, "status": "needs_confirmation", "evidenceAssetIds": []},
    "priceVnd": {"value": null, "status": "needs_confirmation", "evidenceAssetIds": []}
  },
  "questions": ["Nguồn tỏi ở đâu?", "Bán theo kg hay túi?", "Giá cố định hay cần hỏi giá?"]
}
```

Provider adapter có các thao tác domain như `analyzeProductImages`, `composeStoreDraft`, `reviseStoreDraft`. Chọn
một queue cho pilot. Worker phải thực sự được chạy và có recovery. Commit output idempotent, job key có
tenant/input hash/schema version, kết quả cũ không ghi đè draft mới [6].

## 8. Luồng bán hàng cho Thịnh Phát

Buyer: mở gian hàng → xem sản phẩm/nguồn gốc/quy cách → thêm các mặt hàng trong cùng gian hàng vào yêu cầu → nhập
số lượng và nhu cầu giao → gửi hỏi giá → nhận link báo giá riêng → chấp nhận báo giá còn hiệu lực → nhận xác nhận đơn.

Seller: xem RFQ → hỏi lại nếu thiếu → tạo báo giá có phiên bản → xác nhận giá/phí/điều kiện → gửi hoặc sao chép
link → người mua chấp nhận → xử lý đơn → cập nhật giao hàng/thanh toán thủ công khi có bằng chứng.

- RFQ: submitted → needs_information → quoted → closed/cancelled.
- Quote version: draft → sent → accepted/expired/superseded.
- Order: confirmed → processing → fulfilled/completed hoặc cancelled. Payment và fulfillment là trạng thái riêng.
- Chấp nhận báo giá trong một transaction, unique theo quote version và idempotency key.
- Khách không cần account để gửi RFQ trong pilot. Public API có rate limit/validation; RFQ không có anonymous SELECT.
- Chưa có tích hợp email/Zalo thì nút giao link phải nói đúng hành vi (“Sao chép link”).

## 9. Thanh toán, webhook và vận chuyển — chuẩn bị chỗ mở rộng

Chưa chọn nhà cung cấp thanh toán. Hosted checkout; tạo phiên payment phía server với idempotency key [9]; verify
webhook, persist event, xử lý duplicate/out-of-order [10]; return URL không chứng minh thanh toán. Shipping adapter
tách quote phí, tạo vận đơn, tracking. Marketplace payout/hoa hồng/KYC/thuế nghiên cứu riêng.

## 10. GEO/SEO thực tế

- SSR các trang danh mục/sản phẩm/giới thiệu; title/meta, URL ổn định, canonical, sitemap chỉ trang published,
  robots và HTTP status đúng.
- Nội dung hiển thị rõ doanh nghiệp, sản phẩm, xuất xứ, quy cách, đơn vị bán, MOQ, trạng thái giá, vùng giao, ngày
  cập nhật; FAQ dựa trên dữ kiện thật.
- JSON-LD Organization, BreadcrumbList, Product theo dữ liệu hiển thị. Offer chỉ khi có giá thật. Không đặt giá 0
  cho “Liên hệ”; không bịa GTIN, đánh giá, chứng nhận, tồn hay shipping miễn phí [11].
- Google nêu nền SEO hiện có vẫn áp dụng cho AI features, không đòi schema đặc biệt riêng [12].

## 11. Thiết kế từ Cocoon sang nông sản

- Nền kem, chữ nâu đen, điểm nhấn vàng ấm; serif cho câu chuyện/heading, sans dễ đọc cho dữ liệu và navigation.
- Hero có ảnh nguyên liệu lớn, bố cục editorial hai cột.
- Catalog dễ quét: hình thật, sơ chế, quy cách, xuất xứ đã xác nhận, CTA hỏi giá. Mobile tránh typography quá lớn.
- Product detail có gallery, thông tin giao dịch và câu chuyện/bằng chứng.
- Trust section dùng bằng chứng của Thịnh Phát đã được duyệt. Không chép logo/ảnh/copy/chứng nhận của Cocoon.
- Console/editor ưu tiên rõ dữ liệu, trạng thái và thao tác.

## 12. Thứ tự triển khai và điều kiện hoàn thành

| Bước | Deliverable | Gate trước bước tiếp |
| --- | --- | --- |
| 0. Đọc repo | AGENTS, package manager, stack, schema; dependency inventory và kế hoạch | Không ghi đè project hiện có |
| 1. Foundation | Auth, tenant/membership, catalog/media, migration/RLS; hai tenant test; domain services | User A không đọc/sửa dữ liệu, ảnh private hoặc reference của B |
| 2. Storefront | Renderer section schema + design tokens, public routes, draft/preview/publish | Preview không index; public chỉ đổi sau publish; version conflict được xử lý |
| 3. AI | Upload → durable job/worker → typed draft → hỏi thông tin → review | Thiếu API key thì mock adapter có nhãn rõ; retry không tạo/sửa trùng |
| 4. RFQ/order | Yêu cầu nhiều mặt hàng cùng seller → quote version → accept → order snapshot | Expired/superseded quote không tạo đơn; double submit chỉ một đơn |
| 5. Pilot | Nội dung/ảnh Thịnh Phát được xác nhận, mobile, accessibility, metadata/schema, audit/metrics | Smoke test luồng thật |

### Kiểm thử có giá trị

- Hai tenant: không truy cập chéo qua database/API, ID thay trong request, FK, storage và cache; viewer không
  publish; editor không tự cấp quyền; membership bị thu hồi được xử lý.
- Anonymous chỉ đọc bản công khai; không thấy ảnh gốc private, evidence private, buyer contact, AI draft hoặc RFQ.
- AI trả JSON hợp lệ nhưng bịa origin/price vẫn bị chặn; provider timeout/retry không ghi đè version mới.
- Publish đồng thời có conflict rõ; rollback trả cả layout lẫn nội dung public nhất quán.
- RFQ với 1.5 kg giữ chính xác số lượng; MOQ/step sai bị từ chối; phí chưa biết không hiển thị miễn phí.
- Quote hết hạn hoặc đã thay version không accept được; hai accept đồng thời tạo một order; thay giá catalog không
  đổi order snapshot.
- Desktop/mobile, keyboard, drawer focus, form errors, upload progress; ảnh có kích thước hợp lý và alt thật.

## 13. Đo lường và câu hỏi còn mở

Đo thời gian tạo draft, tỷ lệ sửa field AI, tỷ lệ publish, upload lỗi, RFQ gửi, quote được chấp nhận, job retry và
chi phí AI mỗi gian hàng.

Cần xác nhận trước go-live: nhóm người mua chính; bảng hàng/quy cách/MOQ; giá liên hệ hay giá bậc; nguồn
origin/evidence; vùng giao và lead time; tồn thật hay capacity; ai duyệt/gửi báo giá; đơn vị pháp lý/chính sách
thật; tên sản phẩm nền tảng; mô hình thu phí và ngân sách.

## 14. Nguồn

1. Next.js Server/Client Components: https://nextjs.org/docs/app/getting-started/server-and-client-components
2. Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
3. Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
4. Claude vision: https://platform.claude.com/docs/en/build-with-claude/vision
5. Claude structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
6. Supabase Queues: https://supabase.com/docs/guides/queues
7. Vercel platforms architecture: https://vercel.com/docs/platforms
8. Medusa marketplace recipe: https://docs.medusajs.com/resources/recipes/marketplace
9. Stripe idempotent requests: https://docs.stripe.com/api/idempotent_requests
10. Stripe webhooks: https://docs.stripe.com/webhooks
11. Google Product merchant listings: https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
12. Google Search AI features: https://developers.google.com/search/docs/appearance/ai-features

Khách hàng: https://nongsanthinhphat.com/gioi-thieu · https://nongsanthinhphat.com/ ·
https://nongsanthinhphat.com/chinh-sach-van-chuyen-va-giao-nhan

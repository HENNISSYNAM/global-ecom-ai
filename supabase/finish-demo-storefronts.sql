-- One-off: finish the demo storefronts on the hosted project (oagpgunqdzogbrpveeqg).
-- Run once in Supabase Dashboard -> SQL Editor. Schema, demo tenants, products, approvals and empty storefronts
-- were already applied; this sets the draft layouts and publishes the fictional demo store only.
-- Thịnh Phát stays an unpublished draft.

update public.storefront_versions set sections = '[
  {"type": "announcement", "id": "thong-bao", "text": "Gian hàng minh họa: dữ liệu dùng để kiểm thử bố cục"},
  {"type": "hero_split", "id": "mo-dau", "eyebrow": "Nông sản đóng gói", "titleLead": "Từ vườn mẫu", "titleEmphasis": "đến gian bếp", "body": "Khối mở đầu chia đôi: ảnh nguyên liệu lớn một bên, câu chuyện ngắn và một hành động rõ ràng bên còn lại.", "cta": {"label": "Xem sản phẩm", "target": "catalog"}, "imageSide": "left"},
  {"type": "product_rail", "id": "san-pham", "title": "Sản phẩm của vườn", "intro": "Chỉ hiển thị sản phẩm người bán đã duyệt. Giá cố định hiện rõ theo đơn vị; hàng cần báo giá ghi Liên hệ."},
  {"type": "story_panel", "id": "cau-chuyen", "eyebrow": "Câu chuyện nguồn hàng", "title": "Ai làm ra, đến từ đâu", "body": "Khối này dành cho câu chuyện cơ sở có tư liệu thật: người làm, nơi trồng, cách sơ chế. Với gian hàng thật, AI chỉ viết khi người bán đã cung cấp và xác nhận nội dung."},
  {"type": "fact_list", "id": "so-che", "variant": "process", "title": "Quy trình (minh họa)", "items": [{"title": "Thu nhận", "body": "Nguyên liệu được kiểm tra khi nhập (nội dung minh họa)."}, {"title": "Sơ chế", "body": "Làm sạch, phân loại, đóng gói theo quy cách (nội dung minh họa)."}]},
  {"type": "fact_list", "id": "giao-hang", "variant": "delivery", "title": "Đặt và giao hàng", "items": [{"title": "Phí giao", "body": "Người bán báo phí khi xác nhận đơn; chưa báo phí không có nghĩa là miễn phí."}, {"title": "Số lượng tối thiểu", "body": "Ghi theo từng quy cách trên trang sản phẩm."}]},
  {"type": "rfq_cta", "id": "hoi-gia", "title": "Cần số lượng lớn?", "body": "Gửi danh sách hàng, số lượng và nơi nhận; người bán xác nhận giá và phí giao trước khi chốt đơn.", "buttonLabel": "Gửi yêu cầu báo giá"}
]'
where storefront_id = (select id from public.storefronts where slug = 'vuon-mau-demo') and kind = 'draft';

update public.storefront_versions set
  brand = '{"businessName": "Nông sản Thịnh Phát", "website": "https://nongsanthinhphat.com"}',
  sections = '[
    {"type": "hero_split", "id": "mo-dau", "eyebrow": "[Chờ xác nhận: nhóm hàng chính]", "titleLead": "Nông sản sơ chế", "titleEmphasis": "cho bếp và nhà hàng", "body": "[Chờ Thịnh Phát xác nhận: giá trị cung ứng, khu vực giao, nhóm khách]", "cta": {"label": "Xem sản phẩm", "target": "catalog"}, "imageSide": "left"},
    {"type": "product_rail", "id": "san-pham", "title": "Sản phẩm"},
    {"type": "fact_list", "id": "giao-hang", "variant": "delivery", "title": "Đặt và giao hàng", "items": [{"title": "Phí vận chuyển", "body": "Thông báo khi nhân viên xác nhận đơn; khách sỉ thỏa thuận theo hợp đồng (theo chính sách công khai, chờ xác nhận lại)."}]},
    {"type": "rfq_cta", "id": "hoi-gia", "title": "Yêu cầu báo giá sỉ", "buttonLabel": "Gửi yêu cầu báo giá"}
  ]'
where storefront_id = (select id from public.storefronts where slug = 'nong-san-thinh-phat') and kind = 'draft';

-- Publish as the demo owner so the role check and audit trail behave like a real request.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', false);
select public.publish_storefront(
  (select id from public.storefronts where slug = 'vuon-mau-demo'),
  (select v.revision from public.storefront_versions v join public.storefronts s on s.id = v.storefront_id
   where s.slug = 'vuon-mau-demo' and v.kind = 'draft'));
select set_config('request.jwt.claims', '', false);

-- Expect: vuon-mau-demo | live | 1 | 2   and   nong-san-thinh-phat | draft | (null) | (null)
select s.slug, s.status, v.version_no, jsonb_array_length(v.catalog -> 'products') as products
from public.storefronts s left join public.storefront_versions v on v.id = s.published_version_id
order by s.slug;

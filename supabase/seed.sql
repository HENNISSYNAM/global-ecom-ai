-- LOCAL/DEMO SEED. Three tenants used for development and isolation tests.
--
-- Tenant A "Vườn Mẫu (DEMO)" is entirely fictional: product names, prices and quantities are illustrative and
-- the storefront shows a demo banner and is excluded from search indexes.
--
-- Tenant B "Nông sản Thịnh Phát" only holds product NAMES listed on nongsanthinhphat.com. No price, weight,
-- origin, certification, capacity or story has been confirmed by the business, so every product stays in draft,
-- those fields are null, and the storefront is not published.

-- Demo users (Supabase Auth creates these in a real project).
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner-a@demo.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'editor-a@demo.test'),
  ('00000000-0000-4000-8000-0000000000a3', 'viewer-a@demo.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'owner-b@demo.test');

insert into public.tenants (id, name, is_demo) values
  ('1a000000-0000-4000-8000-000000000001', 'Vườn Mẫu (DEMO)', true),
  ('1b000000-0000-4000-8000-000000000001', 'Nông sản Thịnh Phát', true);

insert into public.memberships (tenant_id, user_id, role) values
  ('1a000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'owner'),
  ('1a000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2', 'editor'),
  ('1a000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a3', 'viewer'),
  ('1b000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'owner');

-- ---------------------------------------------------------------------------------------------- Tenant A (fictional)

insert into public.products (id, tenant_id, slug, name, category, processing, summary, description, origin_country,
  origin_region, storage_instructions, shelf_life_note, created_by) values
  ('2a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001', 'hat-dieu-rang-muoi-demo',
   'Hạt điều rang muối (DEMO)', 'hat', 'Rang muối, đóng túi',
   'Sản phẩm minh họa cho gian hàng demo.',
   'Đây là dữ liệu minh họa để kiểm tra bố cục gian hàng. Không phải sản phẩm đang bán.',
   'VN', 'Tỉnh mẫu (demo)', 'Nơi khô ráo, thoáng mát, tránh ánh nắng trực tiếp (nội dung minh họa).',
   'Ghi trên bao bì (nội dung minh họa)', '00000000-0000-4000-8000-0000000000a1'),
  ('2a000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000001', 'tra-xanh-say-demo',
   'Trà xanh sấy khô (DEMO)', 'tra', 'Sấy khô, đóng bao',
   'Bán theo kg, giá theo báo giá (minh họa).',
   'Dữ liệu minh họa: sản phẩm bán theo kg với số lượng lẻ đến 0,5 kg để kiểm tra đơn vị và số thập phân.',
   'VN', 'Tỉnh mẫu (demo)', 'Bảo quản kín, nơi khô (nội dung minh họa).', null,
   '00000000-0000-4000-8000-0000000000a1'),
  ('2a000000-0000-4000-8000-000000000003', '1a000000-0000-4000-8000-000000000001', 'tieu-den-demo',
   'Tiêu đen hạt (DEMO, bản nháp)', 'gia-vi', null, null, null, null, null, null, null,
   '00000000-0000-4000-8000-0000000000a2');

insert into public.variants (id, tenant_id, product_id, sku, pack_description, sale_unit, pack_net_weight_kg,
  min_order_qty, order_step_qty, position) values
  ('3a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001',
   'DEMO-DIEU-500', 'Túi 500 g', 'bag', 0.500, 10, 1, 0),
  ('3a000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000002',
   'DEMO-TRA-KG', 'Bao lớn, cân theo kg', 'kg', null, 1.5, 0.5, 0);

insert into public.offers (tenant_id, variant_id, price_mode, unit_price_minor, created_by) values
  ('1a000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000001', 'fixed', 125000, '00000000-0000-4000-8000-0000000000a1'),
  ('1a000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000002', 'quote_required', null, '00000000-0000-4000-8000-0000000000a1');

insert into public.product_evidence (tenant_id, product_id, field, value, source_type, is_public, confirmed_by) values
  ('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 'origin',
   'Người bán demo khai báo xuất xứ (dữ liệu minh họa)', 'seller_statement', true, '00000000-0000-4000-8000-0000000000a1');

-- Commands below run "as" the demo owner so audit rows and role checks behave like real requests.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', false);

select public.approve_product('2a000000-0000-4000-8000-000000000001');
select public.approve_product('2a000000-0000-4000-8000-000000000002');
-- Product 3 stays a draft: it must not appear on the public storefront.

select public.create_storefront('1a000000-0000-4000-8000-000000000001', 'vuon-mau-demo', 'Vườn Mẫu (DEMO)');

update public.storefront_versions set
  theme = '{
    "preset": "editorial-kem",
    "colors": {"background": "#FEFBF4", "surface": "#F3ECDC", "foreground": "#1F1C17", "muted": "#55504A",
               "accent": "#C5A25D", "line": "#E7E5DF", "inverseBackground": "#1F1C17", "inverseForeground": "#FEFBF4"},
    "fonts": {"display": "vollkorn", "condensed": "barlow-condensed", "action": "barlow-semi-condensed", "body": "nunito"}
  }',
  brand = '{"businessName": "Vườn Mẫu (DEMO)", "tagline": "Gian hàng minh họa cho nền tảng — không phải doanh nghiệp thật.", "isDemo": true}',
  sections = '[
    {"type": "announcement", "id": "thong-bao", "text": "Gian hàng minh họa: dữ liệu dùng để kiểm thử bố cục"},
    {"type": "hero_split", "id": "mo-dau", "eyebrow": "Nông sản đóng gói", "titleLead": "Từ vườn mẫu", "titleEmphasis": "đến gian bếp",
     "body": "Khối mở đầu chia đôi: ảnh nguyên liệu lớn một bên, câu chuyện ngắn và một hành động rõ ràng bên còn lại.",
     "cta": {"label": "Xem sản phẩm", "target": "catalog"}, "imageSide": "left"},
    {"type": "product_rail", "id": "san-pham", "title": "Sản phẩm của vườn",
     "intro": "Chỉ hiển thị sản phẩm người bán đã duyệt. Giá cố định hiện rõ theo đơn vị; hàng cần báo giá ghi Liên hệ."},
    {"type": "story_panel", "id": "cau-chuyen", "eyebrow": "Câu chuyện nguồn hàng", "title": "Ai làm ra, đến từ đâu",
     "body": "Khối này dành cho câu chuyện cơ sở có tư liệu thật: người làm, nơi trồng, cách sơ chế.\nVới gian hàng thật, AI chỉ viết khi người bán đã cung cấp và xác nhận nội dung."},
    {"type": "fact_list", "id": "so-che", "variant": "process", "title": "Quy trình (minh họa)",
     "items": [{"title": "Thu nhận", "body": "Nguyên liệu được kiểm tra khi nhập (nội dung minh họa)."},
               {"title": "Sơ chế", "body": "Làm sạch, phân loại, đóng gói theo quy cách (nội dung minh họa)."}]},
    {"type": "fact_list", "id": "giao-hang", "variant": "delivery", "title": "Đặt và giao hàng",
     "items": [{"title": "Phí giao", "body": "Người bán báo phí khi xác nhận đơn; chưa báo phí không có nghĩa là miễn phí."},
               {"title": "Số lượng tối thiểu", "body": "Ghi theo từng quy cách trên trang sản phẩm."}]},
    {"type": "rfq_cta", "id": "hoi-gia", "title": "Cần số lượng lớn?",
     "body": "Gửi danh sách hàng, số lượng và nơi nhận; người bán xác nhận giá và phí giao trước khi chốt đơn.",
     "buttonLabel": "Gửi yêu cầu báo giá"}
  ]'
where storefront_id = (select id from public.storefronts where slug = 'vuon-mau-demo') and kind = 'draft';

select public.publish_storefront(
  (select id from public.storefronts where slug = 'vuon-mau-demo'),
  (select v.revision from public.storefront_versions v join public.storefronts s on s.id = v.storefront_id
   where s.slug = 'vuon-mau-demo' and v.kind = 'draft')
);

-- ----------------------------------------------------------------------------- Tenant B (Thịnh Phát, unconfirmed)

insert into public.products (id, tenant_id, slug, name, created_by) values
  ('2b000000-0000-4000-8000-000000000001', '1b000000-0000-4000-8000-000000000001', 'toi-boc-vo', 'Tỏi bóc vỏ', '00000000-0000-4000-8000-0000000000b1'),
  ('2b000000-0000-4000-8000-000000000002', '1b000000-0000-4000-8000-000000000001', 'hanh-boc-vo', 'Hành bóc vỏ', '00000000-0000-4000-8000-0000000000b1'),
  ('2b000000-0000-4000-8000-000000000003', '1b000000-0000-4000-8000-000000000001', 'gung-got-vo', 'Gừng gọt vỏ', '00000000-0000-4000-8000-0000000000b1'),
  ('2b000000-0000-4000-8000-000000000004', '1b000000-0000-4000-8000-000000000001', 'cu-nang', 'Củ năng', '00000000-0000-4000-8000-0000000000b1'),
  ('2b000000-0000-4000-8000-000000000005', '1b000000-0000-4000-8000-000000000001', 'mang-luoc', 'Măng luộc', '00000000-0000-4000-8000-0000000000b1');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', false);

select public.create_storefront('1b000000-0000-4000-8000-000000000001', 'nong-san-thinh-phat', 'Nông sản Thịnh Phát');

-- Draft layout following the proposed Thịnh Phát page order. Bracketed text marks content the business must supply.
update public.storefront_versions set
  brand = '{"businessName": "Nông sản Thịnh Phát", "website": "https://nongsanthinhphat.com"}',
  sections = '[
    {"type": "hero_split", "id": "mo-dau", "eyebrow": "[Chờ xác nhận: nhóm hàng chính]", "titleLead": "Nông sản sơ chế",
     "titleEmphasis": "cho bếp và nhà hàng", "body": "[Chờ Thịnh Phát xác nhận: giá trị cung ứng, khu vực giao, nhóm khách]",
     "cta": {"label": "Xem sản phẩm", "target": "catalog"}, "imageSide": "left"},
    {"type": "product_rail", "id": "san-pham", "title": "Sản phẩm"},
    {"type": "fact_list", "id": "giao-hang", "variant": "delivery", "title": "Đặt và giao hàng",
     "items": [{"title": "Phí vận chuyển", "body": "Thông báo khi nhân viên xác nhận đơn; khách sỉ thỏa thuận theo hợp đồng (theo chính sách công khai, chờ xác nhận lại)."}]},
    {"type": "rfq_cta", "id": "hoi-gia", "title": "Yêu cầu báo giá sỉ", "buttonLabel": "Gửi yêu cầu báo giá"}
  ]'
where storefront_id = (select id from public.storefronts where slug = 'nong-san-thinh-phat') and kind = 'draft';

select set_config('request.jwt.claims', '', false);

-- ----------------------------------------------------------------------------- Tenant C (Hà Thịnh Phát, unconfirmed)
--
-- Local draft only. No public facts about Hà Thịnh Phát were found (website unreachable from the build environment,
-- no matching business listing for garlic/produce), so the layout follows the Cocoon-inspired structure and every
-- business-specific text is a bracketed note. The publish guard refuses to publish while such notes remain.

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000d1', 'owner-htp@demo.test');
insert into public.tenants (id, name, is_demo) values ('1c000000-0000-4000-8000-000000000001', 'Hà Thịnh Phát', true);
insert into public.memberships (tenant_id, user_id, role) values
  ('1c000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000d1', 'owner');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', false);
select public.create_storefront('1c000000-0000-4000-8000-000000000001', 'ha-thinh-phat', 'Hà Thịnh Phát');

update public.storefront_versions set
  brand = '{"businessName": "Hà Thịnh Phát"}',
  sections = '[
    {"type": "announcement", "id": "thong-bao", "text": "[Chờ Hà Thịnh Phát xác nhận: khu vực giao và giờ nhận đơn]"},
    {"type": "hero_split", "id": "mo-dau", "eyebrow": "[Chờ xác nhận: nhóm hàng chính · khu vực]", "titleLead": "Tỏi và gia vị",
     "titleEmphasis": "sơ chế sẵn", "body": "[Chờ Hà Thịnh Phát xác nhận: nguồn hàng, cách sơ chế, nhóm khách phục vụ]",
     "cta": {"label": "Xem nhóm hàng", "target": "catalog"}, "imageSide": "left"},
    {"type": "category_rows", "id": "nhom-hang", "title": "Nhóm hàng",
     "intro": "Mỗi nhóm một hàng: chọn quy cách, xem xuất xứ và đơn tối thiểu trên từng sản phẩm."},
    {"type": "story_panel", "id": "cau-chuyen", "eyebrow": "Câu chuyện", "title": "[Chờ xác nhận: tên cơ sở và người làm]",
     "body": "[Chờ Hà Thịnh Phát cung cấp: thành lập khi nào, ở đâu, sơ chế thế nào, ảnh xưởng thật]"},
    {"type": "fact_list", "id": "quy-trinh", "variant": "process", "title": "Từ củ tươi đến túi hàng",
     "items": [{"title": "Nhập hàng", "body": "[Chờ xác nhận: nguồn và cách chọn nguyên liệu]"},
               {"title": "Sơ chế", "body": "[Chờ xác nhận: bóc/gọt, rửa, phân loại]"},
               {"title": "Đóng gói", "body": "[Chờ xác nhận: quy cách túi/thùng, ngày đóng gói]"}]},
    {"type": "fact_list", "id": "giao-hang", "variant": "delivery", "title": "Đặt và giao hàng",
     "items": [{"title": "Đơn tối thiểu", "body": "Ghi theo từng quy cách trên trang sản phẩm."},
               {"title": "Phí giao", "body": "[Chờ xác nhận: cách tính phí giao]"}]},
    {"type": "faq", "id": "hoi-dap", "title": "Câu hỏi thường gặp",
     "items": [{"question": "Có xuất hóa đơn VAT không?", "answer": "[Chờ Hà Thịnh Phát xác nhận]"},
               {"question": "Hàng giữ được bao lâu?", "answer": "[Chờ xác nhận theo từng sản phẩm]"}]},
    {"type": "rfq_cta", "id": "hoi-gia", "title": "Cần báo giá sỉ?",
     "body": "Gửi mặt hàng, quy cách, số lượng, nơi giao và ngày cần — người bán xác nhận giá và phí giao.",
     "buttonLabel": "Gửi yêu cầu báo giá"}
  ]'
where storefront_id = (select id from public.storefronts where slug = 'ha-thinh-phat') and kind = 'draft';

select set_config('request.jwt.claims', '', false);

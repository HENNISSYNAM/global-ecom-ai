# Khảo sát Nông sản Thịnh Phát — dữ liệu, điểm yếu, việc cần cải thiện

Ngày: 13/10/2026. Trạng thái: **dữ liệu chưa được Thịnh Phát xác nhận**. Không đưa lên gian hàng cho tới khi doanh
nghiệp duyệt từng mục.

## Cách thu thập và giới hạn

- Môi trường làm việc chặn truy cập trực tiếp `nongsanthinhphat.com` và các trang danh bạ, nên **chưa tải được ảnh**
  và chưa đọc được nguyên văn trang `/gioi-thieu`. Dữ liệu dưới đây lấy từ đoạn trích của công cụ tìm kiếm (các trang
  đã được lập chỉ mục) và trang danh bạ doanh nghiệp. Mỗi mục đều cần đối chiếu lại với website và với chủ doanh nghiệp.
- Khi mở được tên miền, chạy `npm run import:site -- https://nongsanthinhphat.com/` để lấy đầy đủ ảnh, trang và
  sản phẩm vào gói duyệt (`data/imports/...`).

## Dữ liệu thu được

| Nội dung | Thông tin | Nguồn |
| --- | --- | --- |
| Pháp nhân | Công ty TNHH Sản Xuất Kinh Doanh Thịnh Phát | Danh bạ Trang Vàng |
| Địa chỉ | Phường Tân Chánh Hiệp, Quận 12, TP.HCM | Danh bạ (chưa đối chiếu GPKD) |
| Thành lập | 2018 | Danh bạ (chưa đối chiếu) |
| Email | thinhphatcompany4.0@gmail.com | Danh bạ |
| Điện thoại | 0933590598, 0942831510, 0987647393 — **ba số khác nhau ở các trang khác nhau** | Website + danh bạ |
| Sản phẩm | Tỏi bóc vỏ (có loại đóng túi), hành bóc vỏ (hành củ, hành tím, hành tây), gừng gọt vỏ, củ năng gọt vỏ (có hút chân không), củ sắn gọt vỏ, riềng bóc vỏ, măng luộc / măng sợi luộc (có ghi xuất khẩu), hành phi | Website |
| Nguồn tỏi | Kinh Môn (Hải Dương), Trung Quốc, tỏi cô đơn (solo), Lý Sơn | Trang chủ |
| Giá công khai | Tỏi bóc vỏ sỉ "Giá: 50.000đ", gừng gọt vỏ "55.000đ" — **không ghi đơn vị**; nhiều mục ghi "Liên hệ" | Trang chủ |
| Kênh bán | Bán sỉ số lượng lớn, TP.HCM và khu vực phía Nam; nhận gia công số lượng lớn | Website |
| Vận chuyển | Phí giao thông báo khi nhân viên xác nhận đơn; khách sỉ thỏa thuận theo hợp đồng | Trang chính sách (theo tài liệu nền) |
| Tuyên bố chất lượng | Không ngâm nước tăng khối lượng; dây chuyền máy hiện đại; nhân sự được đào tạo VSATTP; tiêu chí VSATTP cho hành phi | Website + danh bạ — **tuyên bố của doanh nghiệp, chưa có giấy tờ** |
| Nghành phụ | Gia vị (gừng, nghệ, quế, hồi, sả), cà phê | Danh bạ |

Lưu ý nhận diện: có một đơn vị khác là **Công ty TNHH SX KD Hà Thịnh Phát** (toihtp.com, 132 Trần Thị Năm, Trung Mỹ
Tây) bán đúng nhóm hàng tương tự, và một danh bạ dùng cùng mã hồ sơ với chữ "Hà Thịnh Phát". Cần hỏi Thịnh Phát hai
đơn vị có liên quan không, để tránh nhầm thương hiệu và nhầm số điện thoại.

## Điểm yếu (theo mức ảnh hưởng tới đơn hàng)

1. **Thông tin liên hệ không thống nhất.** Ba số điện thoại khác nhau, email Gmail thay vì email tên miền. Khách sỉ
   gọi nhầm số hoặc nghi ngờ độ tin cậy → mất đơn.
2. **Giá không có đơn vị và quy cách.** "50.000đ" không rõ là /kg, /túi hay giá từ bao nhiêu kg. Khách phải gọi hỏi
   lại; dễ tranh cãi khi báo giá thật khác con số trên web.
3. **Thiếu thông tin để đặt hàng sỉ:** số lượng tối thiểu, quy cách túi (bao nhiêu kg, hút chân không hay không),
   hạn dùng và điều kiện bảo quản của hàng đã bóc/gọt, thời gian giao, khu vực giao cụ thể, cách thanh toán/công nợ.
4. **Xuất xứ lẫn trong một sản phẩm.** Tỏi Kinh Môn, Lý Sơn, Trung Quốc, tỏi solo được nêu chung; khách không chọn được
   theo nguồn và giá. Với nền tảng định vị nông sản Việt, đây là rủi ro uy tín nếu không tách rõ.
5. **Danh mục trùng lặp.** Nhiều trang gần giống nhau cho cùng mặt hàng ("Tỏi bóc vỏ", "Tỏi bóc vỏ đóng túi", "Bán
   tỏi, hành tách sẵn vỏ…", ba trang củ năng). Khách khó so sánh; các trang tự cạnh tranh nhau trên Google.
6. **Tiêu đề nhồi từ khóa** ("Củ năng gọt vỏ củ năng Đà Lạt giá rẻ với số lượng lớn tại HCM") — đọc thiếu chuyên
   nghiệp với khách doanh nghiệp.
7. **Tuyên bố chất lượng không có bằng chứng.** "Không ngâm nước", "đạt VSATTP", "dây chuyền hiện đại" chưa kèm giấy
   chứng nhận cơ sở đủ điều kiện ATTP, ảnh xưởng hay quy trình.
8. **Không có quy trình mua hàng hiển thị:** khách không biết gửi yêu cầu thế nào, bao lâu có báo giá, có lấy mẫu thử
   được không.

## Việc cần cải thiện (đưa vào gian hàng trên nền tảng)

| Việc | Cách làm trên nền tảng | Cần Thịnh Phát cung cấp |
| --- | --- | --- |
| Một số hotline/Zalo chính | Trường `phone` trong thông tin thương hiệu, hiển thị ở header, footer, nút liên hệ, chatbot | Số chính thức + giờ nhận đơn |
| Giá rõ đơn vị | Mỗi quy cách có đơn vị bán (kg/túi/thùng), giá cố định hoặc "cần báo giá"; không có giá trơ | Bảng giá theo quy cách, bậc số lượng nếu có |
| Tách sản phẩm theo xuất xứ | Mỗi nguồn tỏi là một sản phẩm/biến thể riêng có xuất xứ riêng | Danh sách nguồn đang bán thật |
| Quy cách đặt hàng | Số lượng tối thiểu, bước đặt, khối lượng túi trên từng biến thể | MOQ, quy cách túi, hút chân không |
| Bảo quản & hạn dùng | Trường bảo quản/hạn dùng trên trang sản phẩm | Nhiệt độ bảo quản, số ngày dùng tốt sau sơ chế |
| Gộp danh mục | 6–8 sản phẩm gốc thay cho nhiều trang trùng | Xác nhận danh mục đang bán |
| Bằng chứng | Mục "Căn cứ người bán cung cấp" chỉ hiện khi có tài liệu | Giấy chứng nhận ATTP, ảnh xưởng, quy trình |
| Quy trình mua | Khối "Đặt và giao hàng" + chatbot thu thập yêu cầu + (sắp có) biểu mẫu hỏi giá | Thời gian phản hồi báo giá, mẫu thử, thanh toán |

## Câu hỏi cần hỏi Thịnh Phát (ưu tiên)

1. Số điện thoại/Zalo nhận đơn chính thức là số nào? Giờ nhận đơn?
2. Nhóm khách chính: nhà hàng, bếp ăn công nghiệp, đại lý chợ, nhà máy, hay xuất khẩu?
3. Với từng mặt hàng: quy cách túi, MOQ, giá theo bậc (hoặc chỉ báo giá), xuất xứ đang bán.
4. Hàng bóc/gọt bảo quản ở nhiệt độ nào, dùng tốt trong bao nhiêu ngày? Có giao lạnh không?
5. Khu vực và thời gian giao; phí giao tính thế nào; có giao trong ngày không?
6. Thanh toán: trả trước, COD, hay công nợ cho khách quen? Có xuất hóa đơn VAT không?
7. Có giấy chứng nhận cơ sở đủ điều kiện ATTP hoặc tài liệu chứng minh "không ngâm nước" không?
8. Có cho lấy mẫu thử không? Có nhận gia công theo yêu cầu (quy cách, đóng gói riêng) không?
9. Quan hệ với Hà Thịnh Phát (toihtp.com)?

## Nguồn

- https://nongsanthinhphat.com/ · /toi-boc-vo · /toi-boc-vo-dong-tui · /ban-toi-hanh-tach-san-vo-toi-boc-san-hanh-boc ·
  /ban-hanh-tach-san-vo-nhan-gia-cong-so-luong-lon · /ban-si-cu-nang-got-san-tai-khu-vuc-phia-nam ·
  /cu-nang-tuoi-got-san-hut-chan-khong · /cu-nang-got-ban-si-cu-nang-got-san-tai-hcm (qua kết quả tìm kiếm)
- https://trangvangvietnam.com/listings/1187947590/nong-san-thinh-phat-cong-ty-tnhh-san-xuat-kinh-doanh-thinh-phat.html
- https://www.yellowpages.vn/lgs/1187947590/cong-ty-tnhh-san-xuat-kinh-doanh-ha-thinh-phat.html
- https://www.yellowpages.vn/pdetail/1187947590/g%E1%BB%ABng_g%E1%BB%8Dt_v%E1%BB%8F.html
- https://toihtp.com/toi-lot-vo-san-htp (đơn vị tên gần giống, cần xác minh)

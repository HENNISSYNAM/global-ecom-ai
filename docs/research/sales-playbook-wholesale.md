# Quy trình bán sỉ nông sản sơ chế — kịch bản cho người bán và chatbot

Áp dụng trước hết cho Thịnh Phát (tỏi, hành, gừng, củ năng, măng đã sơ chế, bán sỉ tại TP.HCM và phía Nam). Đây là
quy trình đề xuất dựa trên cách bán sỉ phổ biến của ngành; các con số (thời gian báo giá, điều kiện thanh toán…) là
**chỗ để người bán điền**, không phải cam kết có sẵn.

## 1. Khách sỉ là ai và họ cần gì

| Nhóm khách | Điều họ quan tâm nhất | Câu hỏi thường gặp |
| --- | --- | --- |
| Nhà hàng, quán ăn | Hàng đều, giao đúng giờ, lượng vừa (vài kg/ngày) | Giao sáng sớm không? Đặt hôm nay mai có không? |
| Bếp ăn công nghiệp, suất ăn | Giá ổn định theo tháng, số lượng lớn, giấy tờ ATTP | Có hợp đồng tháng? Có giấy chứng nhận? Xuất VAT? |
| Đại lý, sạp chợ đầu mối | Giá theo bậc, biên lợi nhuận, hàng để được bao lâu | Giá từ 50 kg? Hàng giữ được mấy ngày? |
| Nhà máy chế biến | Quy cách đồng đều, khối lượng lớn, lịch giao cố định | Nhận gia công theo quy cách riêng? |
| Xuất khẩu | Xuất xứ, chứng từ, đóng gói theo yêu cầu | Có chứng nhận gì? Đóng thùng thế nào? |

## 2. Năm thông tin bắt buộc trước khi báo giá

1. **Mặt hàng và loại** (vd. tỏi bóc vỏ — nguồn Kinh Môn hay Lý Sơn; hành tím hay hành tây).
2. **Quy cách và đơn vị** (kg rời, túi bao nhiêu kg, hút chân không hay không).
3. **Số lượng và tần suất** (một lần hay hằng ngày/tuần — quyết định giá bậc và hợp đồng).
4. **Nơi giao và thời điểm cần** (quận/tỉnh, ngày, khung giờ).
5. **Loại khách và người liên hệ** (tên, số điện thoại/Zalo, có cần hóa đơn VAT).

Thiếu một trong năm điều này thì báo giá dễ sai và phải hỏi lại.

## 3. Quy trình từ hỏi giá đến đặt lại

1. **Tiếp nhận** (website, chatbot, Zalo, điện thoại) → ghi đủ 5 thông tin trên.
2. **Báo giá** trong [__ giờ] làm việc: giá theo quy cách, phí giao (hoặc "báo khi xác nhận"), thời hạn báo giá,
   điều kiện thanh toán. Báo giá đã gửi không sửa; đổi giá thì gửi phiên bản mới.
3. **Mẫu thử** (nếu người bán cho phép) cho khách mới số lượng lớn.
4. **Chốt đơn**: khách chấp nhận báo giá còn hiệu lực → tạo đơn, chụp lại giá và điều kiện tại thời điểm chốt.
5. **Giao hàng**: xác nhận số lượng thực giao (hàng cân), biên bản/ảnh giao nhận.
6. **Thanh toán**: [trả trước / khi nhận / công nợ __ ngày cho khách quen] — người bán quyết định.
7. **Chăm sóc và đặt lại**: khách đặt định kỳ được nhắc theo lịch; đơn mới bắt đầu từ danh sách lần trước.

## 4. Mẫu chào hàng (người bán điền phần trong ngoặc)

> Chào anh/chị [tên], [tên cơ sở] gửi báo giá [mặt hàng]:
> - Quy cách: [túi __ kg hút chân không]; xuất xứ: [__]
> - Giá: [__ đ/kg] cho đơn từ [__ kg]; [__ đ/kg] từ [__ kg]
> - Giao: [khu vực], [thời gian]; phí giao: [__ / báo khi xác nhận]
> - Bảo quản: [__ °C], dùng tốt trong [__ ngày]
> - Thanh toán: [__]. Báo giá có hiệu lực đến [ngày].
> Anh/chị cần mẫu thử hoặc điều chỉnh quy cách, cứ nhắn lại ạ.

Nguyên tắc: không dùng "giá rẻ nhất", "100% sạch", "chuẩn VietGAP/hữu cơ" nếu không có giấy tờ; không hứa giao lạnh
hay giao trong ngày nếu chưa xác nhận năng lực.

## 5. Xử lý tình huống thường gặp

| Khách nói | Cách đáp đúng |
| --- | --- |
| "Giá bao nhiêu?" (chưa có thông tin) | Hỏi mặt hàng, quy cách, số lượng, nơi giao trước; giá phụ thuộc các yếu tố đó |
| "Rẻ hơn được không?" | Nêu giá theo bậc số lượng (nếu người bán có); không tự giảm giá |
| "Hàng có ngâm nước không?" | Chỉ trả lời "không" nếu người bán đã xác nhận và có căn cứ; nếu chưa, chuyển người bán |
| "Giao trong hôm nay được không?" | Chỉ trả lời theo khu vực/giờ đã công bố; còn lại chuyển người bán |
| "Hàng không đúng như đặt" | Ghi nhận, xin ảnh/số lượng, chuyển người bán xử lý theo chính sách đổi trả (nếu đã công bố) |

## 6. Cách chatbot áp dụng (đã cài vào `src/modules/assistant/context.ts`)

- Trả lời câu hỏi về sản phẩm chỉ từ dữ liệu đã xuất bản.
- Khi khách có ý định mua/hỏi giá: hỏi lần lượt các thông tin còn thiếu trong 5 thông tin bắt buộc, **mỗi lần một
  hai câu**, không hỏi lại điều khách đã nói.
- Khi đã đủ: tóm tắt yêu cầu thành một khối "Yêu cầu báo giá" để khách gửi người bán (hoặc, khi có biểu mẫu hỏi giá,
  điền vào biểu mẫu). Nói rõ người bán sẽ xác nhận giá, phí giao và thời gian.
- Không báo giá chưa công bố, không giảm giá, không xác nhận đơn, không hứa thời gian giao.

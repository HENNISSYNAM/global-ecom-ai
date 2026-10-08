# Ngôn ngữ thiết kế Cocoon và ứng dụng cho nền tảng gian hàng nông sản

Ngày khảo sát: 08/10/2026. Website: https://cocoonvietnam.com/

## 1. Phạm vi và độ chắc chắn

Đã xem giao diện desktop thực tế và đọc nội dung/kiểu hiển thị của trang chủ, menu sản phẩm, trang danh mục Chăm
Sóc Da, trang Dầu gội bồ kết 500ml, giỏ hàng trống, trang Câu chuyện thương hiệu, trang Tìm hiểu nguyên liệu và
trang Bài viết. Đã đọc kiểu hiển thị của footer và nhóm đăng ký thông tin.

Các số màu, tên font và kích thước bên dưới là mẫu đo từ giao diện đang hiển thị, không phải bộ token nội bộ do
Cocoon cung cấp. Một số ảnh tải chậm rồi xuất hiện; không coi trạng thái chưa tải xong là thiết kế chủ đích. Chưa
kiểm tra màn hình điện thoại, toàn bộ checkout, đăng nhập, trạng thái lỗi biểu mẫu hay mọi trang chiến dịch. Chưa
có cơ sở để kết luận đã kiểm toán toàn bộ website.

Trang Tìm hiểu nguyên liệu riêng hiện hiển thị “Đang cập nhật...”. Phân tích nguyên liệu dựa vào khối trên trang
chủ và nội dung trang sản phẩm.

## 2. Ý tưởng thiết kế cốt lõi

Cocoon trình bày sản phẩm trong một không gian thương hiệu có tính biên tập: ảnh chiếm diện tích lớn; tiêu đề tạo
nhịp và cảm xúc; nội dung thực dụng giúp người mua quyết định. Ba lớp phối hợp gồm bản sắc Việt qua nguyên liệu,
hình ảnh sản phẩm được chăm chút và thông tin mua hàng rõ ràng.

Nền kem và chữ nâu đen giữ sự liên tục khi ảnh chiến dịch đổi màu. Nhận diện đến từ sự nhất quán của nền, hệ chữ,
khoảng trống, tỉ lệ ảnh và cấu trúc nội dung; không phụ thuộc vào việc mọi banner cùng một màu.

## 3. Màu sắc đã đo

| Vai trò quan sát được | Giá trị | Cách sử dụng |
| --- | --- | --- |
| Nền kem chính | `#FEFBF4` | Thanh điều hướng, nhiều vùng nội dung và bảng trượt |
| Nâu đen | `#1F1C17` | Chữ chính, nút tối, thanh thông báo đầu trang và phần thông tin doanh nghiệp |
| Vàng đất | `#C5A25D` | Một số chi tiết nhấn và chữ ở nút liên hệ nổi |
| Xám đậm | `#414548` | Một số nội dung/giá trị màu mặc định trong phần tử đã đo |
| Màu đường phân cách | `#E7E5DF` | Giá trị đường viền xuất hiện ở phần tử được lấy mẫu |

Màu ảnh chiến dịch: banner bồ kết quan sát có nền đỏ nâu; nội dung về tái sử dụng bao bì có xanh lá mạnh. Đây là
màu theo chiến dịch, chưa đo thành token chung. Không suy ra mọi ảnh nền xanh đều là màu thương hiệu nền tảng.

Ứng dụng đề xuất: dùng nền kem, chữ tối và màu nhấn tiết chế cho một mẫu gian hàng. Mỗi người bán vẫn có màu nhận
diện riêng. Giá, số lượng, tình trạng hàng và điều kiện giao cần đủ tương phản để đọc dễ.

## 4. Hệ chữ đã đo

| Nhóm chữ | Font quan sát | Vai trò |
| --- | --- | --- |
| Tiêu đề giàu cảm xúc | Vollkorn | Tên chiến dịch, tiêu đề câu chuyện, tên nhóm hàng, tên sản phẩm ở trang chi tiết |
| Chữ hẹp để nhấn | Barlow Condensed | Nhãn viết hoa, phần chữ nhấn trong tiêu đề phối hợp |
| Nút hành động | Barlow Semi Condensed | Một số nút lớn như Xem ngay |
| Nội dung và điều hướng | Nunito | Mô tả, menu, tên sản phẩm trên thẻ và thông tin thực dụng |
| Bộ biểu tượng | cocoon | Font biểu tượng riêng được thấy trong kiểu hiển thị; không xem là font văn bản |

Các mẫu desktop: menu 16px; thông báo đầu trang 14px; tiêu đề banner 68px; nhãn banner 36px; tiêu đề khối trang
chủ khoảng 68–80px; tiêu đề nhóm hàng 48px; tên sản phẩm trang chi tiết 30px/32px; tên sản phẩm trên thẻ
16px/22px; nội dung câu chuyện 16px/24px. Kích thước này gắn với trang và màn hình đã quan sát, không phải quy
định cho mọi thiết bị.

Một dấu hiệu nổi bật là phối chữ serif nghiêng ở phần dẫn với chữ hẹp viết hoa ở phần nhấn. Nhịp chữ khác nhau
giúp tiêu đề mang cảm xúc mà vẫn có trọng tâm. Khi áp dụng, chỉ dùng viết hoa cho nhãn ngắn, không kéo dài thành
đoạn văn. Mọi font phải thử với dấu tiếng Việt và tên sản phẩm dài.

## 5. Bố cục và khoảng trống

- Thanh thông báo tối nằm trên thanh điều hướng nền kem. Logo đặt giữa, nhóm khám phá nằm bên trái, nhóm tài
  khoản/liên hệ/giỏ hàng nằm bên phải.
- Thanh đầu trang vẫn xuất hiện khi xem các phần dưới của trang chủ trong phiên khảo sát.
- Banner mở đầu dùng hai vùng lớn: hình/video ở một bên, tiêu đề–mô tả–nút ở bên còn lại. Bản desktop quan sát
  gần chia đôi.
- Trang chủ thay đổi nhịp giữa banner rộng, khối giới thiệu, nội dung tin cậy, sản phẩm, nguyên liệu và bài viết.
- Khối triết lý dùng một bảng nội dung kem đặt trên ảnh nguyên liệu lớn. Ảnh cung cấp không khí; bảng nội dung
  tạo vùng đọc rõ.
- Danh mục quan sát trình bày từng nhóm hàng thành một hàng: tên nhóm bên trái và sản phẩm dạng băng chuyền bên phải.
- Trang chi tiết đặt thư viện ảnh lớn bên trái và thông tin mua bên phải.
- Trang câu chuyện thương hiệu có nhãn/tiêu đề bên trái và cột văn bản dài bên phải.

Khoảng trống là thành phần của thiết kế: tạo vùng riêng cho tiêu đề và ảnh, hạn chế việc mọi ô đều có viền hoặc
bóng đổ. Các cấu trúc chia cột khác nhau vẫn liên kết nhờ cùng nền và hệ chữ.

## 6. Ngôn ngữ hình ảnh

Ba dạng ảnh đáng học:

1. Ảnh sản phẩm cho mua hàng: hình rõ, bố cục nhất quán, dễ nhận diện bao bì.
2. Ảnh chiến dịch: kết hợp sản phẩm với nguyên liệu, màu và ánh sáng tạo không khí.
3. Ảnh kể chuyện: nguyên liệu, địa phương và hoạt động thương hiệu làm nền cho nội dung.

Trang bồ kết quan sát có nhiều ảnh trong thư viện, bao gồm sản phẩm đi cùng nguyên liệu và các hình trình bày
thông tin. Trên trang chủ có nguyên liệu được dùng như chủ thể thị giác lớn. Nhiều phần nhấn cảm giác tự nhiên
bằng chất liệu nhìn thấy được thay vì chỉ dùng một biểu tượng chiếc lá.

Đề xuất cho Thịnh Phát: chuẩn bị ảnh nguyên liệu nguyên dạng, thành phẩm sơ chế, quy cách đóng gói và quy trình
thực tế. Đầu vào một ảnh có thể tạo bản nháp; muốn có chiều sâu tương tự cần thêm tư liệu. Khi cải thiện ảnh, giữ
đặc điểm thật của sản phẩm; ảnh mua hàng phải thể hiện đúng hàng được giao.

## 7. Thành phần giao diện và tương tác

| Thành phần | Quan sát | Nguyên tắc có thể học |
| --- | --- | --- |
| Nút chiến dịch | Nút chữ nhật rộng, chữ hẹp, mũi tên bên phải; một mẫu đo 400×70px, bo 4px | Mỗi khối có một hành động dễ nhận ra |
| Nút liên hệ nổi | Dạng viên thuốc, nền kem, chữ vàng đất | Một lối hỗ trợ xuyên suốt trang |
| Menu sản phẩm | Bảng trượt từ bên trái, chữ lớn, nhóm sản phẩm và nhóm nhu cầu | Giảm tải cho thanh điều hướng |
| Giỏ hàng | Bảng trượt từ bên phải, nền phía sau tối đi | Giữ ngữ cảnh trang đang xem |
| Giỏ trống | Có giải thích và nút tiếp tục mua sắm | Trạng thái trống cũng dẫn tới hành động tiếp theo |
| Banner | Có chấm chọn, nội dung/hình thay đổi; banner quan sát có video | Chuyển động tập trung vào hình ảnh và chuyển trạng thái |
| Thư viện ảnh | Có điều khiển ảnh trước/sau | Cho phép xem sản phẩm sâu hơn mà không đổi trang |
| Phân cách thông tin | Các đường mảnh chia nhóm thông tin | Thay nhiều hộp trang trí bằng cấu trúc đọc rõ |

Chưa đo chính xác thời lượng chuyển động/easing; chưa kiểm tra trạng thái hover bằng thao tác chuyên biệt. Không
suy đoán hiệu ứng parallax, 3D hay hệ animation chung.

## 8. Thẻ sản phẩm và trang chi tiết

Thẻ sản phẩm có cấu trúc ít lớp: ảnh, tên, lợi ích ngắn, giá, thông tin đã bán và điều khiển thêm hàng. Các con số
là website hiển thị; nghiên cứu này không xác minh doanh số hay tồn kho thực tế.

Trang chi tiết được khảo sát kết nối thông tin thương mại với nội dung giải thích: tên và giá; mô tả; nhóm đặc
điểm; đối tượng phù hợp; thành phần; hành động thêm hàng; câu chuyện nguyên liệu; hướng dẫn sử dụng; thuộc tính và
xuất xứ; đánh giá; hỗ trợ.

Bài học là bố trí theo câu hỏi của người mua: đây là gì, có phù hợp không, có gì bên trong, dùng thế nào, có căn
cứ gì và mua ở đâu. Với Thịnh Phát, đổi các trường đó thành loại nông sản, xuất xứ, mức sơ chế, đơn vị bán, quy
cách, điều kiện bảo quản, hạn sử dụng được xác nhận, số lượng tối thiểu, khu vực và ngày giao. Đây là cấu trúc đề
xuất, chưa phải dữ liệu được khách hàng duyệt.

## 9. Giọng văn và kể chuyện

Từ nội dung đã đọc, giọng thương hiệu thường kết nối nguyên liệu gần gũi với địa phương và trải nghiệm con người.
Phần mua hàng cụ thể hơn, chia thông tin theo vai trò. Tên một số dòng sản phẩm có địa danh, giúp người đọc nhận
ra nguồn nguyên liệu đang được nhắc tới.

Phương pháp học cho nông sản: dùng tên và xuất xứ thật; giải thích cách sơ chế; cho thấy người làm và cơ sở; nêu
thông tin giúp khách mua đúng. Các câu chuyện truyền thống/vùng trồng chỉ viết khi có tư liệu. Không chuyển chứng
nhận hay tuyên bố của Cocoon thành tuyên bố của Thịnh Phát.

## 10. Hệ thống xây dựng niềm tin

Trang chủ có khối chứng nhận với biểu tượng và nội dung giải thích. Trang sản phẩm có nhóm thuộc tính và nội dung
giải thích riêng. Footer có các nhóm hỗ trợ, chính sách và thông tin doanh nghiệp. Thiết kế đặt căn cứ tin cậy ở
nhiều thời điểm của hành trình, không dồn tất cả vào trang giới thiệu.

Ứng dụng đề xuất: hồ sơ cơ sở, ảnh quy trình, tài liệu được khách hàng cung cấp, điều kiện giao và xử lý hàng
không đúng yêu cầu. Chỉ hiển thị huy hiệu có căn cứ và đúng phạm vi áp dụng.

## 11. Học để tạo nền tảng gian hàng bằng AI

| Lớp | Thành phần đề xuất |
| --- | --- |
| Thương hiệu người bán | Logo, tên, màu nhấn, tư liệu và câu chuyện đã xác nhận |
| Quy tắc trình bày | Nền, hệ chữ, tỉ lệ ảnh, khoảng cách, nút và đường phân cách |
| Bố cục | Banner chia đôi; nhóm sản phẩm; câu chuyện nguồn gốc; quy trình; tài liệu; yêu cầu báo giá |
| Dữ liệu bán hàng | Sản phẩm, quy cách, giá/điều kiện báo giá, khả năng cung ứng, giao hàng |
| Hành động | Xem sản phẩm, yêu cầu báo giá, gửi yêu cầu mua, đặt lại |

AI chọn mẫu và sắp xếp nội dung dựa trên thông tin được xác nhận. Khi thiếu ảnh/tài liệu/câu chuyện, ẩn phần đó
hoặc để ở bản nháp cần bổ sung. Không tạo con số bán hàng, nguồn gốc hay chứng nhận để lấp đầy bố cục.

GEO là lớp dữ liệu và khả năng công cụ tìm kiếm đọc hiểu; không được suy ra từ việc giao diện trông đẹp. Nội dung
chính nên là văn bản thực, thuộc tính sản phẩm có cấu trúc và thống nhất với dữ liệu hiển thị.

## 12. Mẫu đầu cho Thịnh Phát — đề xuất

Thứ tự trang chủ: nhận diện và điều hướng → ảnh sản phẩm/quy trình thật kèm giá trị cung ứng được xác nhận → các
nhóm hàng → giới thiệu sơ chế và đóng gói → nguồn gốc từng dòng → điều kiện đặt/giao hàng → biểu mẫu yêu cầu báo
giá → thông tin và chính sách.

Trang sản phẩm: ảnh hàng thật → tên, loại, xuất xứ → đơn vị và quy cách → số lượng cần mua → nơi/ngày nhận → giá
được xác nhận hoặc yêu cầu báo giá → bảo quản, hạn sử dụng và tài liệu hỗ trợ.

Mẫu màu và hệ chữ có thể lấy cảm hứng từ nền kem, chữ tối, tiêu đề serif và ảnh nguyên liệu lớn. Chọn màu nhấn của
Thịnh Phát sau khi kiểm tra logo và hướng thương hiệu khách hàng chốt. Nền tảng đa người bán cần cho phép mỗi cửa
hàng có bản sắc riêng.

## 13. Những phần cần kiểm tra khi triển khai

- Giao diện 360–430px: tên nông sản dài, chữ có dấu, nút và biểu mẫu báo giá.
- Hình ảnh tải chậm: vùng giữ chỗ không làm danh mục vỡ bố cục.
- Giá có đơn vị và điều kiện rõ; dữ liệu chưa được duyệt không xuất bản.
- Ảnh, chữ và nút không che nhau; có thao tác bàn phím phù hợp.
- Biểu mẫu thể hiện rõ yêu cầu mua đang chờ người bán xác nhận.
- Giao diện đẹp vẫn phải cho khách tìm nhanh quy cách, xuất xứ và lịch giao.

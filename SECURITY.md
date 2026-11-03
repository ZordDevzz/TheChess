# Chính sách Bảo mật (Security Policy)

## Phiên bản được Hỗ trợ

Dự án TheChess cam kết theo dõi và xử lý các vấn đề bảo mật trên các phiên bản đang được duy trì tích cực.

| Phiên bản | Trạng thái hỗ trợ |
| :--- | :--- |
| 1.x (nhánh `master`) | :white_check_mark: Được hỗ trợ |
| < 1.0 | :x: Không hỗ trợ |

## Báo cáo Lỗ hổng Bảo mật

Nếu bạn phát hiện ra một lỗ hổng bảo mật tiềm ẩn trong TheChess, vui lòng không mở công khai Issue trên GitHub nhằm bảo vệ người dùng của dự án. Thay vào đó, hãy thực hiện theo quy trình sau:

1. **Gửi báo cáo riêng tư**: Gửi thông tin chi tiết về lỗ hổng tới địa chỉ thư điện tử: `dev@thechess.local` hoặc sử dụng tính năng **Private Vulnerability Reporting** trên thẻ Security của kho chứa GitHub.
2. **Nội dung báo cáo**:
   - Mô tả ngắn gọn về bản chất của lỗ hổng.
   - Các bước tái hiện (reproduction steps) hoặc Proof of Concept (PoC) tối thiểu.
   - Đánh giá sơ bộ về phạm vi ảnh hưởng (ví dụ: rò rỉ dữ liệu, giả mạo quyền truy cập, từ chối dịch vụ DoS).
   - Đề xuất giải pháp khắc phục (nếu có).

## Cam kết Phản hồi

- **Xác nhận**: Đội ngũ duy trì sẽ xác nhận đã tiếp nhận báo cáo trong vòng 48 giờ làm việc.
- **Đánh giá & Khắc phục**: Sau khi xác thực lỗ hổng, chúng tôi sẽ tiến hành phát triển bản vá trên nhánh bảo mật nội bộ và thông báo tiến độ tới người báo cáo.
- **Công bố**: Khi bản vá được kiểm thử đầy đủ và phát hành phiên bản mới, thông tin lỗ hổng và lời cảm ơn người báo cáo sẽ được công bố chính thức theo nguyên tắc Tiết lộ có trách nhiệm (Responsible Disclosure).

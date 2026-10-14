# Tích hợp sửa G0/1a/1b vào source BE — 15/10/2026

Trạng thái: đang kiểm chứng trong lượt tích hợp của Codex theo ủy quyền trực tiếp của Owner.
Base HEAD `a8ba88f`; source sản phẩm đã nhận bản sửa từ prototype lượt 3 (`db69477`, diff
`ac30175f389c2c18b590a562a07df91b5d35e156e0f0ed7600de1505e7047e70`).
Không phải PR đã merge và không tự phê duyệt ADR/spec hoặc nghiệm thu thay dev/Owner.

## Phạm vi

N-1/R-02/N-2/N-5/C-1, R-15/R-12, R-03/N-3/N-6, R-14/R-09, R-13 và tài liệu liên quan.
Không implement 1c/G2 hoặc dịch EN–VI. Giữ nguyên dependency/config/tài liệu đang sửa của phiên khác.

## Kiểm chứng

- SHA-256 của sáu artifact lượt 3 khớp chỉ mục; JSON mutation đã lưu ghi 22 killed, 0 lỗi khác.
- Test readiness mới đã chạy trên source cũ: fail đúng vì trả `ServiceUnavailableException` thiếu mã riêng.
- Sau tích hợp, 5 suite unit chọn lọc: 108/108 đạt.
- Gate đầy đủ, PostgreSQL integration, Docker, HTTP/worker/SMTP và D1/D4: đang chạy; cập nhật kết quả khi hoàn tất.

## Điều chỉnh khi tích hợp

Thông báo CLI khi gặp lỗi không còn hứa “nothing was written”: nếu mất phản hồi COMMIT, kết quả có thể chưa
xác định từ phía client. Hướng dẫn kiểm trạng thái cài đặt trước khi thử lại, không tự retry thao tác ghi.

## Giới hạn và Git

Source đã thay đổi trong checkout BE thật; chưa commit/push. Các quyết định Proposed và điều kiện dev review
giữ nguyên; ủy quyền thực hiện của Owner không được ghi thành review/phê duyệt của một dev khác.
R-10/R-11 thuộc G2. Bằng chứng prototype cũ được giữ nguyên, không thay bằng kết quả lượt tích hợp.

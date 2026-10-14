# Đặc tả sửa lỗi G0, lát 1a và 1b

## Trạng thái và nguồn

- Phạm vi: sửa các finding sau review G0/1a/1b, không thêm nghiệp vụ mới.
- Base đã review lại: `dev` tại `a8ba88f`.
- Bản implement: nhánh `fix/g0-g1-remediation-2026-10-15`, commit `a0cf5f1`.
- Trạng thái: đã implement và kiểm chứng bằng AI; chưa merge, chưa được dev khác review hoặc nghiệm thu.
- Báo cáo duy nhất: [review G0/G1](../../../reviews/g0-g1-remediation-2026-10-15/README.md).
- ADR-0011 và ADR-0012 vẫn `Proposed`.

## Phạm vi sửa

### An toàn giao dịch và lỗi CSDL

- Query quá thời gian phải kết thúc request trong thời gian hữu hạn và trả lỗi availability phù hợp.
- Client có query timeout phải bị loại khỏi pool; transaction còn dở không được quay lại pool để request sau commit nhầm.
- Pool do ứng dụng sở hữu phải được đóng khi shutdown. `idle_in_transaction_session_timeout` là lớp phòng vệ bổ sung.
- Lỗi kết nối PostgreSQL tạm thời đã nhận diện trả HTTP 503; lỗi lập trình hoặc dạng query không hỗ trợ không được che thành 503.
- Không tự retry thao tác ghi khi mất phản hồi ở `COMMIT`, vì kết quả phía client có thể chưa xác định.

### API và truy vấn

- `/me` trả 503 `SERVICE_UNAVAILABLE` khi CSDL lỗi sau bước xác thực.
- Readiness trả 503 `SERVICE_UNAVAILABLE` khi PostgreSQL không sẵn sàng.
- Danh sách ứng viên loại tài khoản đã tồn tại trước khi giới hạn kết quả; tìm `%`, `_` và `\` theo ký tự thật.
- Page và count của danh sách tài khoản đọc trong cùng snapshot.
- Luồng redeem kiểm tra định dạng token và tra cứu token trước phép băm mật khẩu tốn chi phí.

### Cấu hình và CLI

- CLI cài đặt chỉ yêu cầu `DATABASE_URL` và không tải secret của API/worker.
- API và worker vẫn từ chối khởi động khi thiếu cấu hình bảo mật bắt buộc.
- Module khác không được import repository hoặc password hasher riêng của `identity-access`; giao tiếp qua facade đã công bố.

### Quyết định Owner giữ nguyên

- R-06: chỉ lần đăng nhập sai làm tăng bộ đếm thất bại; lượt đang xử lý hoặc thành công không tính là thất bại.
- R-07: rate limit toàn cục được tính riêng theo từng route trên mỗi IP.
- R-13: sửa trong đợt remediation này; CLI dùng cấu hình tối thiểu riêng.

## Ngoài phạm vi

- R-10/R-11 về JobTitle và I-2 thuộc G2.
- Đổi/đặt lại mật khẩu 1c, tra cứu Audit Trail, chuyển giao/khôi phục Super Admin và vai suy ra.
- Dịch nội dung EN–VI.
- PgBouncer, HA failover, mạng blackhole, tải lớn và SMTP nhà cung cấp thật.

## Tiêu chí hoàn thành

1. Test tái hiện N-1 chứng minh request 503 không để lại phần ghi được commit về sau.
2. Request khi CSDL treo kết thúc trong ngưỡng cấu hình và dịch vụ phục hồi không cần restart.
3. `/me`, readiness, candidates, snapshot list/count, redeem và CLI đạt các hành vi trên.
4. Gate source, E2E, integration PostgreSQL role thường, OpenAPI, audit và Docker đạt trên revision bàn giao.
5. Dev khác review code/spec/plan; PR được merge theo quy trình của dự án.

Chi tiết kết quả chạy và giới hạn còn lại nằm trong báo cáo review duy nhất được dẫn ở trên.

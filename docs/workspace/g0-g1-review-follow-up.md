# G0/G1 — bàn giao sau review 14/10/2026

Baseline BE: `64073c4`, đã merge [PR #4](https://github.com/SEP490-FALL2026/BE-dev/pull/4).
Nguồn: [S-2026-10-12b](sources.md), Docs `0e0bb83` (12/12 hash khớp).
[Báo cáo AI review](../reviews/backend-g0-g1-review-2026-10-14.md) và
[runner/bằng chứng](../reviews/backend-g0-g1-review-2026-10-14/README.md) là kết quả của baseline này.
Giữ nguyên báo cáo gốc; ghi commit sửa, PR và kết quả kiểm lại ở phần tiếp nhận bên dưới.

Tệp này ghi việc còn lại và hai quyết định Owner trả lời trực tiếp ngày 14/10/2026.
Không phải phê duyệt toàn bộ spec/plan/ADR hoặc nghiệm thu. Tiến độ lát nằm tại [roadmap](../roadmap.md).

## Quyết định Owner và yêu cầu kiểm chứng

| Finding                   | Hướng đã chốt ngày 14/10/2026                                                                                                                                                       | Dev cần làm và bằng chứng                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-06 — throttle đăng nhập | Giữ spec: chỉ lần đăng nhập sai làm tăng bộ đếm thất bại. Không tính lượt đang xử lý hoặc thành công là thất bại. Chống quá tải riêng, nếu cần, phải được thiết kế và review riêng. | Sửa logic hiện tại; test đăng nhập đúng đồng thời không bị bộ đếm thất bại chặn, sai đủ ngưỡng vẫn bị chặn, ca trộn đúng/sai và đua cập nhật. Cô lập global rate limit khi kiểm throttle theo email. |
| R-07 — global rate limit  | Giữ hành vi theo **từng route trên mỗi IP**, dùng bộ nhớ của từng process; không đổi thành một hạn mức gộp cho mọi route.                                                           | Test cùng IP/cùng route chia sẻ hạn mức, cùng IP/khác route có bộ đếm riêng, IP khác độc lập; public/auth routes vẫn chịu giới hạn. Kiểm cấu hình trusted proxy khi áp dụng.                         |

ADR-0011/0012 vẫn **Proposed**. Hai lựa chọn trên không tự duyệt TTL, chính sách Origin,
thiết kế còn mở hay toàn bộ ADR. [Spec 1a](items/us-01-bootstrap-login-session/spec.md) giữ các ô review chưa hoàn tất.

## Thứ tự sửa và đóng finding

| Ưu tiên           | Finding / việc cần xử lý                      | Điều kiện kiểm lại                                                                                                                            |
| ----------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| P2                | R-01 — generate trước lint trong `pnpm check` | Clone/checkout sạch, chưa có generated client, install frozen rồi chạy `pnpm check` trực tiếp; kiểm CI. Generate thủ công chỉ là workaround.  |
| P2                | R-02 — request treo khi DB bị pause           | Thiết kế timeout phía client; HTTP kết thúc trong ngưỡng đã thống nhất, trả lỗi availability đúng contract; tự phục hồi khi DB hoạt động lại. |
| P2                | R-03 — candidates bỏ sót sau 200 Employee đầu | Test hơn 200 Employee, 200 người đầu đã có tài khoản, người hợp lệ phía sau vẫn được trả về đúng lọc/sort/limit.                              |
| P3                | R-04 — `sid` không phải UUID                  | Token ký đúng nhưng claim không hợp lệ trả 401; không biến lỗi token thành 503 hoặc ghi một error log cho mỗi token sai.                      |
| P3                | R-05 — lời mời của Employee đã nghỉ việc      | Dev review điều kiện gửi và hiển thị `usable`; test worker/detail/redeem với trạng thái nghỉ việc.                                            |
| P3                | R-06, R-07                                    | Theo hai quyết định và bộ ca kiểm chứng ở trên.                                                                                               |
| P3                | R-08 — test bảo vệ người giữ SUPER_ADMIN      | Test tầng service với actor khác target; bỏ kiểm tra bảo vệ phải làm test thất bại.                                                           |
| Cần dev phân loại | R-09, R-12→R-16 và nit trong báo cáo          | Đọc từng finding, sửa hoặc ghi lý do/giới hạn và Owner/dev xác nhận hoãn. Không bỏ qua vì unit test xanh.                                     |
| Trước G2          | R-10, R-11 — JobTitle và I-2                  | Pin nguồn mới, refine spec G0/G2, giải quyết câu hỏi liên quan rồi lập migration/test plan. Không sửa migration đã merge.                     |

Tài liệu đã đồng bộ sự kiện merge, phạm vi API/worker, hướng dẫn local/container, nguồn snapshot
và hai quyết định Owner. Path filter CI còn `.env.example` đã xóa: giao dev xử lý cùng R-01;
đợt cập nhật tài liệu này không sửa workflow hoặc source sản phẩm.

## Bằng chứng hiện có và giới hạn

Theo báo cáo AI tại `64073c4`: 223 unit, 28 E2E, 147 integration đạt; PostgreSQL 17.11,
role không superuser; 16/16 operation HTTP được gọi, 117 PASS / 2 FAIL; 5/6 mutation bị bắt.
`pnpm check` chỉ đạt sau khi generate client trước (R-01). Các số này không phải lần chạy lại
của đợt sửa tài liệu và không chứng minh các finding đã được sửa.

Còn thiếu: dev khác review spec/plan/code, quyết định Accepted cho ADR-0011/0012,
bootstrap tương tác bằng tay trên PowerShell, SMTP có TLS và khả năng gửi tới nhà cung cấp thật.
Linux PTY trong review dùng terminal thật với input tự động; không ghi thành thử tay bởi người.

## Sau sửa lỗi: G1 còn lại

Lập/review spec và plan cho lát 1c đổi/đặt lại mật khẩu, tra cứu Audit Trail và các phần còn lại
theo roadmap trước khi code. Chuyển giao/khôi phục Super Admin và vai suy ra có phụ thuộc G2;
không yêu cầu hoàn tất toàn bộ G1 trước khi bắt đầu phần G2 đã đủ điều kiện.

## Tiếp nhận kết quả sửa

- [ ] Dev cập nhật từng finding với commit/PR, kết quả test mới và giới hạn; finding hoãn có lý do và xác nhận.
- [ ] Chạy gate theo CONTRIBUTING; kiểm lại trên PostgreSQL/SMTP/HTTP thật cho phần sửa tương ứng.
- [ ] Dev khác ghi review spec/plan/code và revision; lead ghi quyết định ADR thực tế.
- [ ] Owner/dev ghi nghiệm thu đúng phạm vi, revision và môi trường; cập nhật roadmap theo sự kiện thật.

Khi commit/push gói tài liệu này, đưa kèm báo cáo và thư mục runner/bằng chứng đã lọc secret
(hiện chưa được track) để các link bàn giao tồn tại trên checkout của dev.

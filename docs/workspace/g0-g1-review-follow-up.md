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

## Kết quả sửa R-01 → R-08 (14/10/2026, chưa commit, chưa PR)

Làm trên nhánh `Bao_Dev`, từ baseline `7a2557b` (đã chứa báo cáo review). Mỗi finding có test viết trước và
đã thấy fail đúng lý do trước khi sửa. Đây là kết quả chạy của người sửa, **không** phải review của dev khác
và không đóng nghiệm thu; commit/PR sẽ ghi vào bảng sau khi có.

| Finding | Thay đổi                                                                                                                                                                                                                                                                      | Bằng chứng                                                                                                                                                                                                                                   | Giới hạn                                                                                                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01    | `pnpm check` chạy `prisma:validate` + `prisma:generate` trước `lint`; bỏ `.env.example` khỏi path filter CI                                                                                                                                                                   | `scripts/verify/check-script-order.test.mjs`; clone sạch, `pnpm install --frozen-lockfile` rồi `pnpm check` trực tiếp: exit 0                                                                                                                | Chưa xem lịch sử Actions của CI thật                                                                                                                                                               |
| R-02    | Hai biến mới `DB_CONNECT_TIMEOUT_MS` (3 000) / `DB_QUERY_TIMEOUT_MS` (8 000, phải > `DB_STATEMENT_TIMEOUT_MS`) vào pool `pg`; `toTransientError` nhận lỗi driver (`Query read timeout`, `Connection terminated…`, mã socket) ⟹ 503; route quản trị tài khoản ánh xạ cùng cách | `database-unavailable.integration-spec.ts` (proxy TCP chặn byte: kết thúc < 5 s, tự phục hồi), `transient-error.spec.ts`, `account-management.http-errors.spec.ts`, `env-schema.spec.ts`                                                     | Mô phỏng bằng proxy TCP, chưa thử `docker pause` thật. `MeService` vẫn chưa ánh xạ lỗi DB riêng (R-15 chưa xử lý)                                                                                  |
| R-03    | `listCandidates` duyệt keyset theo `employeeCode` (trang 200, tối đa 25 trang) đến khi đủ 20 người chưa có tài khoản                                                                                                                                                          | `account-candidates.integration-spec.ts`: 200 người đầu có tài khoản, 30 người phía sau chưa có ⟹ trả đúng 20 theo mã                                                                                                                        | Tổ chức hơn 5 000 nhân viên có tài khoản liền nhau ở đầu danh sách vẫn có thể thiếu kết quả khi không tìm kiếm                                                                                     |
| R-04    | `sub`/`sid` phải là UUID, sai ⟹ 401; verifier chỉ trả 503 khi lỗi nhận ra là tạm thời, lỗi khác giữ nguyên (500 + log)                                                                                                                                                        | `token.service.spec.ts`, `jwt-access-token.verifier.spec.ts`                                                                                                                                                                                 | Việc đổi lỗi DB không nhận ra từ 503 sang 500 là thay đổi hành vi, cần dev xác nhận                                                                                                                |
| R-05    | Worker và `invitation.usable` ở chi tiết tài khoản coi link của Employee đã nghỉ việc là không dùng được                                                                                                                                                                      | Test R-05 trong `account-management-http.integration-spec.ts`                                                                                                                                                                                | Chưa có API G6 thật; trạng thái nghỉ việc đặt bằng SQL. Thư đã `SENT` trước đó không thu hồi được                                                                                                  |
| R-06    | Bộ đếm chỉ tăng sau khi kiểm mật khẩu thất bại, một câu lệnh nguyên tử; bỏ bước đếm trước khi băm                                                                                                                                                                             | 4 test mới trong `auth-http.integration-spec.ts` (sai song song đếm đúng một lần, đúng song song không chặn nhau, ca trộn, xóa bộ đếm khi đăng nhập đúng); test cũ "tối đa 5 lượt được kiểm" được thay                                       | **Đánh đổi:** loạt đoán sai đồng thời không còn bị chặn ở 5 lượt trước khi kiểm; chỉ còn giới hạn chung theo route và IP. Chống quá tải riêng cần thiết kế và review riêng (theo quyết định Owner) |
| R-07    | Không đổi hành vi; thêm test xác nhận và đồng bộ mô tả                                                                                                                                                                                                                        | `test/e2e/rate-limit.e2e-spec.ts` (cùng IP/cùng route chung hạn mức, khác route riêng, IP khác độc lập, route public/auth vẫn bị giới hạn, `TRUST_PROXY_HOPS=0` bỏ qua `X-Forwarded-For`); đột biến đổi khóa thành chỉ theo IP bị 2 test bắt | Bộ nhớ từng process, chưa phân tán                                                                                                                                                                 |
| R-08    | Test tầng service: `lock` người giữ `SUPER_ADMIN` từ tài khoản khác bị từ chối, không đổi dữ liệu                                                                                                                                                                             | Test R-08 trong `account-management-http.integration-spec.ts`; bỏ dòng kiểm ở `lock` ⟹ test fail (đã chạy), khôi phục ⟹ pass                                                                                                                 | —                                                                                                                                                                                                  |

R-09, R-12 → R-16 và nit chưa xử lý; R-10, R-11 làm trước G2.

## Tiếp nhận kết quả sửa

- [ ] Dev cập nhật từng finding với commit/PR, kết quả test mới và giới hạn; finding hoãn có lý do và xác nhận.
- [ ] Chạy gate theo CONTRIBUTING; kiểm lại trên PostgreSQL/SMTP/HTTP thật cho phần sửa tương ứng.
- [ ] Dev khác ghi review spec/plan/code và revision; lead ghi quyết định ADR thực tế.
- [ ] Owner/dev ghi nghiệm thu đúng phạm vi, revision và môi trường; cập nhật roadmap theo sự kiện thật.

Khi commit/push gói tài liệu này, đưa kèm báo cáo và thư mục runner/bằng chứng đã lọc secret
(hiện chưa được track) để các link bàn giao tồn tại trên checkout của dev.

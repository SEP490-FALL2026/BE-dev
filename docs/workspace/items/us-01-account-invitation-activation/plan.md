# Plan: Tài khoản từ Employee, lời mời, kích hoạt, khóa và vai gán (lát 1b)

- [Spec](spec.md); revision đã review: chưa review.
- Implement: chưa phân công (người hoặc AI); reviewer: chưa phân công.
- Triển khai: not-started. PR: chưa có.

## Trước khi code

Chỉ bắt đầu khi mọi ô ở mục _Sẵn sàng bàn giao_ của [spec](spec.md) đã đánh dấu — gồm: lát 1a đã merge (hoặc nhánh nền thống nhất); spec/plan này được dev khác review ở revision cụ thể; thư viện SMTP và SMTP local (câu R-5) đã chốt trong ADR Proposed — **không** chọn ở bước code.

Đọc AGENTS.md, CONTRIBUTING.md, ARCHITECTURE.md, rules database/security/API, test guide. Đối chiếu code thật của lát 1a (guard, khai báo quyền, verifier, transaction runner, audit, bảng danh tính, giao thức khóa đã hiện thực) với giả định của spec; lệch thì cập nhật spec và review lại phần ảnh hưởng trước khi code phần đó.

## Các bước nhỏ

- [ ] **Bước 1 — Outbox và SMTP local.** Cài **đúng** thư viện SMTP ghi trong ADR, chạy audit dependency. Module `notifications` (EmailOutbox, mã hóa payload, facade `enqueueEmail(tx, …)`), đăng ký vào `WorkerModule` + job lặp BullMQ làm dispatcher (nhận dòng bằng `SKIP LOCKED` + lease, đọc lại token trước khi gửi, cập nhật kết quả có điều kiện), service SMTP bắt thư cho Compose local theo câu R-5, biến môi trường mới trong `env-schema.ts`/`.env.example`. Kiểm chứng: unit mã hóa/giải mã có AAD; integration nhận dòng bằng `SKIP LOCKED`, thử lại, `FAILED`, `CANCELLED` khi token đã thu hồi, xóa ciphertext.
- [ ] **Bước 2 — Token hành động; migration `<ts>_account_invitation`.** AccountActionToken + migration duy nhất của lát: partial unique token dùng được (không điều kiện thời gian), unique thư mỗi token, partial unique `FINANCE` có `revoked_at IS NULL`, trigger tổ hợp cấm. Sinh/băm/thu hồi token trong `identity-access`. Kiểm chứng: integration một token dùng được mỗi (tài khoản, mục đích), gửi lại thu hồi token cũ kể cả đã hết hạn, chèn grant `FINANCE` thứ hai bị từ chối kể cả khi người giữ `INVITED`/`LOCKED`, trigger tổ hợp cấm.
- [ ] **Bước 3 — Tạo tài khoản và gợi ý ứng viên.** `GET /account-candidates` (facade organization), `POST /app-users`, `GET /app-users`, `GET /app-users/{id}`; khóa Employee `FOR SHARE` qua facade; kiểm vai, Finance tối đa một (`QĐ-67e`), tổ hợp cấm; audit. Kiểm chứng: e2e mã lỗi/403; integration unique và đồng thời.
- [ ] **Bước 4 — Lời mời và kích hoạt.** `POST /app-users/{id}/invitations`, `POST /auth/invitations/redeem`; redeem khóa **AppUser trước token**; chính sách mật khẩu dùng chung với khởi tạo và kiểm trước khi tra token. Kiểm chứng: integration hết hạn/đã dùng/bị thay/đồng thời; gửi lại ↔ gửi lại; đăng nhập sau kích hoạt bằng route lát 1a.
- [ ] **Bước 5 — Khóa, mở, gán/thu hồi vai.** Bốn route quản trị, thu hồi token/phiên/thư khi khóa theo đúng thứ tự giao thức, kiểm _chính mình_ và người giữ `SUPER_ADMIN`. Kiểm chứng: integration HTTP (harness của lát 1a) request kế tiếp bị từ chối, dùng controller thăm dò chỉ có trong module test cho vai IT/Employee; unit policy tổ hợp cấm và người giữ `SUPER_ADMIN`; **concurrency** (harness, cả hai thứ tự commit): redeem ↔ khóa, đăng nhập ↔ khóa, refresh ↔ khóa, cấp `FINANCE` đồng thời, N vòng thứ tự ngẫu nhiên không `40P01`.
- [ ] **Bước 6 — Hợp đồng và tài liệu.** API manifest, `pnpm openapi:export` + review diff, cập nhật allowlist public, ARCHITECTURE (module notifications, worker dispatcher), security/API rules nếu đổi (mã 503 chung). Ghi kết quả thực chạy, cập nhật roadmap.

Rollback/migration: như lát 1a — migration của lát chỉ sửa/tạo lại khi mới áp lên database tạm của PR; đã merge hoặc áp lên môi trường dùng chung thì chỉ sửa bằng migration mới; không reset database dùng chung. Thư đã gửi không thu hồi được; thu hồi token là biện pháp khắc phục.

## Kiểm chứng và bàn giao

| Lệnh / kiểm tra AC                                                                                     | Revision / môi trường                  | Kết quả thực chạy | Giới hạn / việc còn lại                                    |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------- | ----------------- | ---------------------------------------------------------- |
| `pnpm check`                                                                                           | —                                      | chưa chạy         | —                                                          |
| `pnpm test:e2e`                                                                                        | —                                      | chưa chạy         | stub không chứng minh SMTP/constraint                      |
| `pnpm test:integration`                                                                                | PostgreSQL riêng + SMTP giả lập cục bộ | chưa chạy         | gồm ca concurrency; không chứng minh nhà cung cấp thư thật |
| `pnpm openapi:export` + diff                                                                           | —                                      | chưa chạy         | —                                                          |
| Thử tay: tạo tài khoản IT → nhận thư local → kích hoạt → đăng nhập → khóa → request kế tiếp bị từ chối | local                                  | chưa chạy         | không ghi token/mật khẩu vào bằng chứng                    |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Dev khác review code; spec phản ánh thay đổi đã thống nhất.
- [ ] Cập nhật roadmap/PR; merged và accepted chỉ ghi sau sự kiện thật.

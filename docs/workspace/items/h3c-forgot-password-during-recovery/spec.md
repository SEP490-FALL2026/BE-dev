# Spec: H3c — quên mật khẩu khi đang khôi phục thông tin đăng nhập

- Phụ trách: AI theo giao việc Owner (Prompt 08, 18/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner, từ lát H3c của
  [foundation-remediation-handoff-2026-10-18](../foundation-remediation-handoff-2026-10-18/spec.md) và claim
  `US-01-10` AC-10 còn thiếu bằng chứng ở [us-01-09-super-admin-transfer-recovery](../us-01-09-super-admin-transfer-recovery/spec.md).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (US v0.15 — `US-01-10` AC-3, AC-4, AC-9, AC-10; `US-01-09` AC-9, AC-11), BE `bd05007` (`dev`)
  cộng H2a/04B/H2b/H3a/06B/H3b chưa commit.
- Nhóm roadmap: G1 — chỉ là planning container, không phải phạm vi của hạng mục này.
- [Kế hoạch](plan.md).

## Business outcome

Khi Super Admin đang chờ khôi phục thông tin đăng nhập ngoài ứng dụng, một yêu cầu quên mật khẩu cho email của tài khoản
đó vẫn nhận đúng phản hồi chung, nhưng không có thư đặt lại nào được gửi và liên kết khôi phục đã phát vẫn dùng được.
Người ngoài không phá được thủ tục khôi phục (thay liên kết khôi phục bằng một liên kết tới hộp thư đã mất) và không biết
được tài khoản đang được khôi phục. Kiểm được bằng `POST /api/v1/auth/password-reset-requests` rồi
`POST /api/v1/auth/password-resets` với liên kết khôi phục.

## Primary Story/AC

| Story      | AC                                                                                             | Coverage | Phần còn lại thuộc |
| ---------- | ---------------------------------------------------------------------------------------------- | -------- | ------------------ |
| `US-01-10` | AC-10 — cùng phản hồi chung như AC-3, không thư đặt lại; liên kết khôi phục hợp lệ vẫn áp AC-4 | full     | —                  |

Secondary (hồi quy, không đổi): `US-01-10` AC-3 (phản hồi chung, thư chỉ cho ca đủ điều kiện), AC-4 (đặt lại qua liên
kết), AC-9 (không lộ trong audit/log); `US-01-09` AC-9 (liên kết khôi phục), AC-11 (ticket chờ bị thay thế).

## Supporting references

- Audit nền tảng 18/10/2026: claim `US-01-10` AC-10 chưa có hàng nghiệm thu/test (lát H3, Q4).
- [us-01-password-self-service](../us-01-password-self-service/spec.md) (forgot/reset), [us-01-09](../us-01-09-super-admin-transfer-recovery/spec.md)
  (recovery ticket, liên kết khôi phục là action token `RESET_PASSWORD` có `recoveryTicketId`).
- [API contract](../../../rules/api-contract.md), [security và jobs](../../../rules/security-jobs.md) (không log email/token).

## Explicit out of scope

- H4/H5 refactor (folder, controller, repository, lỗi, capability), H6–H8, ops/database, G3–G10.
- H1/H2/H3a/H3b, token format/TTL, refresh token, rate limit, thứ tự guard/filter/pipe.
- Đổi recovery workflow, enum `RecoveryMode`/`RecoveryStatus`, CLI `ops:recover`, đổi login email, chuyển giao Super Admin.
- Schema, migration, Redis, package; FE/Mobile; repo Docs.

## Dependencies and blockers

- H3b `verified` local (nền cây làm việc). Không blocker nghiệp vụ: AC-10 có ở Docs `9416fe0`.
- Consumer: không đổi HTTP contract ⟹ không cần regenerate client.

## Ownership: module, data, API

- Module: `identity-access` — `auth/password-reset.service.ts` (quyết định trong giao dịch), `recovery.repo.ts` (truy vấn
  hẹp ticket chờ; `RecoveryRepo` đã được inject vào `PasswordResetService`, không thêm phụ thuộc mới).
- Dữ liệu: không đổi schema. API: không đổi; `openapi.json` phải byte-identical với baseline H3b.

## Behavior and design

**Ticket chặn yêu cầu quên mật khẩu** — mọi điều kiện cùng đúng:

| Điều kiện    | Giá trị                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Organization | `organizationId` = tổ chức của tài khoản                                                                     |
| Đối tượng    | `targetAppUserId` = tài khoản có email được yêu cầu                                                          |
| Mode         | `RESET_CREDENTIALS`                                                                                          |
| Status       | đang chờ: `PENDING` hoặc `AWAITING_ACTIVATION` — cùng tập "đang chờ" mà `RecoveryRepo.pendingForTarget` dùng |

Căn cứ code: ticket `RESET_CREDENTIALS` được tạo `PENDING` (`openAndLock`) và đặt lại `PENDING` khi phát liên kết
(`recovery.service.ts`), kết thúc `COMPLETED` (mở liên kết) hoặc `SUPERSEDED` (ticket mới cùng tài khoản).
`AWAITING_ACTIVATION` chỉ được đặt cho `TRANSFER_ROLE`; với `RESET_CREDENTIALS` nó không đạt được hiện nay, nhưng vẫn tính
là đang chờ để hai truy vấn dùng chung một định nghĩa. `COMPLETED`, `SUPERSEDED`, mode khác (`UNLOCK`, `TRANSFER_ROLE`),
tài khoản khác hoặc tổ chức khác **không** chặn. Ticket chờ mà liên kết đã hết hạn vẫn chặn — người vận hành chạy lại
ticket để phát liên kết mới (`US-01-09` AC-11).

**HTTP — trước và sau giống nhau:** `POST /api/v1/auth/password-reset-requests` `{ email }` ⟹ 202
`{ success: true, message: "AUTH.PASSWORD_RESET_REQUESTED", data: { requested: true } }` cho mọi email; không route,
mã lỗi, field hay header mới.

**Side effect khi có ticket chặn:**

| Dữ liệu                                                       | Trước H3c (lỗi)                                   | Sau H3c    |
| ------------------------------------------------------------- | ------------------------------------------------- | ---------- |
| Action token của liên kết khôi phục                           | bị thu hồi `SUPERSEDED`                           | không đổi  |
| Token `RESET_PASSWORD` mới                                    | tạo một                                           | không tạo  |
| Outbox thư khôi phục                                          | bị hủy `CANCELLED` nếu chưa gửi                   | không đổi  |
| Outbox thư `PASSWORD_RESET` mới                               | thêm một, tới login email (hộp thư có thể đã mất) | không thêm |
| Audit `APP_USER.PASSWORD_RESET_REQUESTED`                     | thêm một                                          | không thêm |
| Recovery ticket, credential, session, account, Employee, role | không đổi                                         | không đổi  |

Không có ticket chặn: hành vi quên mật khẩu hiện hành giữ nguyên (giới hạn mỗi giờ, thay token cũ, outbox, audit, phản
hồi chung, điều kiện của worker). Đặt mật khẩu qua liên kết khôi phục giữ nguyên (`US-01-10` AC-4).

**Giao dịch và thứ tự khóa:** khôi phục khóa Employee `FOR SHARE` → AppUser `FOR UPDATE` → ticket, rồi thu hồi token,
phát liên kết, commit. Quên mật khẩu khóa AppUser `FOR UPDATE` → đọc lại tài khoản/Employee → **kiểm ticket chờ** → giới
hạn mỗi giờ → thu hồi/tạo token, outbox, audit. Khóa AppUser tuần tự hóa hai thao tác: quên mật khẩu chờ khôi phục commit
rồi mới đọc ticket (READ COMMITTED, câu lệnh mới thấy dữ liệu đã commit) ⟹ không chen vào giữa. Ngược lại, quên mật khẩu
commit trước thì khôi phục thu hồi mọi token dùng được của tài khoản như hiện hành. Không thêm khóa, Redis hay migration.
Nhánh bị chặn kết thúc giao dịch không ghi gì — như nhánh vượt giới hạn mỗi giờ — và không log.

## Test matrix

| AC / rủi ro            | Tình huống                                                                                                                       | Cấp test    | Kết quả mong đợi                                                                                                                            | Bằng chứng sau implement |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| AC-10 — ca chính       | ticket `PENDING` có liên kết + thư; quên mật khẩu bằng email khác hoa/thường, có khoảng trắng                                    | integration | 202 body chung; token, outbox, ticket, credential, session, account, Employee, role không đổi; không audit; log không có email/ticket/token | plan                     |
| AC-10 → AC-4           | sau yêu cầu bị chặn, mở liên kết khôi phục                                                                                       | integration | 200; ticket `COMPLETED`; không phiên nào; vai/khóa/Employee không đổi; đăng nhập bằng mật khẩu mới được                                     | plan                     |
| Ticket không chặn      | `COMPLETED`; `SUPERSEDED` + `COMPLETED`; `UNLOCK` `PENDING`; `TRANSFER_ROLE` `AWAITING_ACTIVATION`; tài khoản khác; tổ chức khác | integration | quên mật khẩu phát liên kết như AC-3: token mới không có ticket, thư `PASSWORD_RESET`, một audit                                            | plan                     |
| Race                   | khôi phục giữ khóa, ghi ticket chờ, commit trong khi quên mật khẩu đang chờ khóa AppUser                                         | integration | 202; không token/thư/audit mới                                                                                                              | plan                     |
| Hồi quy AC-3/AC-4/AC-9 | suite `password-self-service-http`, `super-admin-recovery`                                                                       | integration | không đổi                                                                                                                                   | plan                     |
| Contract               | `pnpm openapi:export`                                                                                                            | artifact    | giống hệt từng byte                                                                                                                         | plan                     |

## Definition of Done

- [x] Test đỏ trước trên code hiện tại, xanh sau fix; bằng chứng ở plan.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên cây cuối; `openapi.json` không đổi.
- [x] Handoff Task 6, roadmap, claim AC-10 ở `us-01-09` cập nhật theo bằng chứng; không viết lại lịch sử.
- [x] Không tăng legacy ledger kiến trúc; không log email/ticket/token.

## Changes and acceptance

- 18/10/2026: tạo hạng mục, thiết kế `ready`; test đỏ xác nhận lỗi (yêu cầu quên mật khẩu thay liên kết khôi phục), sửa và
  `verified` local (bằng chứng ở [plan](plan.md)). Chưa commit, chưa PR, remote CI chưa chạy, chưa Owner review, chưa nghiệm
  thu.
- 19/10/2026: implementation ở commit `5aac33f` trên `dev` = `origin/dev` (Owner push trực tiếp 19/10/2026, không PR).
  Remote CI chưa có bằng chứng, chưa Owner review, chưa nghiệm thu.

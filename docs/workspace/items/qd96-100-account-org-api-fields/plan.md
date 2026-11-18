# Plan: qd96-100-account-org-api-fields

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent C-SPEC-P).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. **Mức FE-tonight: B.**

## Before coding

Đọc README `identity-access`, `organization`, `personnel`; các file ở _Supporting references_ của spec; `test/support/api-accounts.ts`
(harness tạo tài khoản có thể đang gửi `loginEmail`). Kiểm `qd96-100-people-read-scope` đã merge. Không migration. Quick set như #1 +
`pnpm test:http && pnpm openapi:export && pnpm test:e2e`.

## Tasks

### Task 1: tài khoản — enum vai input, bỏ `loginEmail`, thêm `role`

- Files: `identity-access/accounts/account-management.dto.ts`, `accounts/app-users/account-invitation.service.ts`, `app-users.controller.ts`, `account-query.service.ts`, `access/me.dto.ts`, `access/me.service.ts`, `account.http-errors.ts`; harness `test/support/api-accounts.ts` và test mà `pnpm typecheck` báo.
- Depends on: `qd96-100-people-read-scope`.
- Acceptance: dòng L-461, L-462, L-465.
- Verify: quick set; `pnpm test:http`; e2e đăng nhập/tạo tài khoản.

### Task 2: tổ chức — `jobTitle`, `kind` Cost Center

- Files: `organization/employee/employee.dto.ts`, `organization/cost-center/cost-center.dto.ts`, `cost-center.service.ts` (ghi `UNIT`), `cost-center.controller.ts`.
- Depends on: none.
- Acceptance: dòng L-463, L-464.
- Verify: quick set; HTTP theo file.

### Task 3: `successor` thừa bị từ chối

- Files: `personnel/transfer/transfer-guard.service.ts`, `transfer.policy.ts` (+ spec), `offboarding/offboarding.policy.ts` (+ spec), `*.http-errors.ts`.
- Depends on: none.
- Acceptance: dòng L-466.
- Verify: quick set; HTTP điều chuyển + nghỉ việc.

### Task 4: thông báo _chuyển đến_ theo `employeeCode`

- Files: `personnel/notice/notice.dto.ts`, `notice.service.ts`, `notice.policy.ts` (+ spec), `notice.http-errors.ts`, `organization/public/organization-read.api.ts` (`findEmployeeByCode`) + repo.
- Depends on: none.
- Acceptance: hai dòng L-512.
- Verify: quick set; HTTP `personnelNoticeSend`; `pnpm openapi:export` (diff toàn hạng mục chỉ các op ở bảng spec).

### Checkpoint

Sau Task 4: quick set + `test:http` + e2e xanh; tự review; gửi FE danh sách đổi hợp đồng.

## Verification and handoff

| Lệnh / kiểm tra AC                                   | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ---------------------------------------------------- | --------------------- | ----------------- | ----------------------- |
| quick set, `test:http`, `test:e2e`, `openapi:export` | chưa chạy             | —                 | full suite do Owner     |

- [ ] Mọi dòng test matrix có bằng chứng.
- [ ] README/spec khớp; FE được báo.
- [ ] Giao Owner review trên revision cụ thể.

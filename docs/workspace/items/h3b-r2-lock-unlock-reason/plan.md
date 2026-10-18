# Plan: H3b — R-2, lý do bắt buộc khi khóa và mở khóa AppUser

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `bd05007` cộng H2a/04B/H2b/H3a/06B chưa commit.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local 18/10/2026; bằng chứng chạy trên cây làm việc chưa commit trên `bd05007`). Revision:
  commit `5aac33f` trên `dev` = `origin/dev` (Owner push trực tiếp 19/10/2026, không PR); remote CI chưa có bằng chứng.

## Before coding

Đã đọc AGENTS.md, CONTRIBUTING.md, ARCHITECTURE.md, rule `api-contract`, `security-jobs`, `module-structure`,
`documentation`, mẫu workspace, test guide, audit (F-01, Q4), H3b của handoff, R-2/Bước 2–3 của remediation, spec/plan
1b, và đối chiếu Docs `9416fe0` (chỉ đọc): `QĐ-81a` → `QĐ-81c`, `QĐ-77c`, `US-01-01` AC-6/7/20. Cây lúc bắt đầu:
`bd05007` cộng 50 mục chưa commit (hash chụp đầu lượt); `openapi.json` sha256 `04f24d24…` (H2b). Caller HTTP của
lock/unlock: `account-management-http`, `account-concurrency`, `approval-roles-http`, `audit-query-http`,
`password-self-service-http`, `password-self-service-concurrency`, `super-admin-transfer-http`; gọi service trực tiếp:
`account-management-http` (R-08). Recovery CLI dùng `RecoveryService.unlock` riêng — không đổi.

## Tasks

### Task 1: test đỏ

- Files: `test/integration/account-management-http.integration-spec.ts`, `test/e2e/api-inventory.e2e-spec.ts`,
  `src/modules/identity-access/dto/account-management.dto.spec.ts` (mới).
- Depends on: none.
- Acceptance: 422 khi thiếu/không hợp lệ (trạng thái, audit không đổi); audit có `reason` đã trim và before/after;
  idempotent vẫn đòi body; OpenAPI khai body bắt buộc. Đỏ trên code hiện tại vì operation chưa đọc body.
- Verify: integration `account-management-http`, e2e `api-inventory`, unit schema → đỏ đúng lý do.

### Task 2: schema, controller, service

- Files: `dto/account-management.dto.ts`, `accounts/app-users.controller.ts`, `accounts/account-status.service.ts`.
- Depends on: Task 1.
- Acceptance: `AccountStatusChangeBodyDto`; `reason` bắt buộc tới service; audit ghi `reason`; 422 mô tả lý do.
- Verify: test Task 1 xanh; `pnpm openapi:export`, review diff.

### Task 3: cập nhật caller và tài liệu

- Files: mọi suite gọi lock/unlock; plan/spec này, roadmap, items index, remediation R-2, handoff Task 5, ghi chú 1b.
- Depends on: Task 2.
- Acceptance: không lời gọi lock/unlock nào thiếu body; trạng thái theo bằng chứng; ba metadata R-2 khép.
- Verify: quét caller; `pnpm rules:check`, `pnpm rules:format`.

### Checkpoint

Sau Task 3: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng; tự review toàn bộ diff.

## Verification and handoff

Môi trường: Windows, cây làm việc chưa commit trên `bd05007` (H2a/04B/H2b/H3a/06B + H3b), 18/10/2026. Integration dùng
PostgreSQL 17 (`postgres:17-alpine`) trong container dùng một lần, role `LOGIN NOSUPERUSER CREATEDB NOCREATEROLE`, cổng
loopback riêng; container đã xóa, không chạm database dùng chung. `test/support/api-coverage-manifest.ts` không đổi vì
không thêm/bỏ operation.

| Lệnh / kiểm tra AC                                             | Revision / môi trường       | Kết quả thực chạy                                                                                                                                                                                      | Giới hạn / việc còn lại                     |
| -------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Đỏ trước: unit `account-management.dto.spec`                   | trước fix                   | 9 fail: schema chưa tồn tại                                                                                                                                                                            | —                                           |
| Đỏ trước: e2e `api-inventory`                                  | trước fix                   | 1 fail: `requestBody` của lock/unlock là `undefined`; 20 pass                                                                                                                                          | —                                           |
| Đỏ trước: integration `account-management-http`                | trước fix, PostgreSQL riêng | 4 fail: bảy body không dùng được nhận 200 thay vì 422 (lock và unlock); audit thiếu `reason`; gọi lại không body nhận 200; 37 pass (gồm caller đã thêm lý do)                                          | —                                           |
| Unit `account-management.dto.spec`                             | sau fix                     | 9 pass                                                                                                                                                                                                 | —                                           |
| e2e `api-inventory`                                            | sau fix                     | 21 pass                                                                                                                                                                                                | —                                           |
| Integration 7 suite có caller lock/unlock                      | sau fix, PostgreSQL riêng   | 129 pass (`account-management-http`, `account-concurrency`, `approval-roles-http`, `audit-query-http`, `password-self-service-http`, `password-self-service-concurrency`, `super-admin-transfer-http`) | —                                           |
| `pnpm openapi:export`                                          | cây cuối                    | sha256 `04f24d24…` → `14fd428b…`; diff chỉ: `requestBody` bắt buộc của `appUserLock`/`appUserUnlock`, mô tả 422 của hai operation, schema `AccountStatusChangeBodyDto`                                 | client FE/Mobile regenerate sau merge       |
| `pnpm check` (lần 1)                                           | cây trước khi đăng ký item  | exit 1: `h3b-r2-lock-unlock-reason` chưa đăng ký ở items index                                                                                                                                         | đăng ký item, chạy lại                      |
| `pnpm check`                                                   | cây cuối                    | exit 0; unit 54 suite, 562 test; rules 0 lỗi                                                                                                                                                           | —                                           |
| `pnpm test:e2e`                                                | cây cuối                    | 14 suite, 274 test pass                                                                                                                                                                                | —                                           |
| `pnpm test:integration`                                        | cây cuối, PostgreSQL riêng  | 46 suite, 592 test pass                                                                                                                                                                                | remote CI chưa chạy                         |
| Quét caller `/lock`, `/unlock`, `appUserLock`, `appUserUnlock` | cây cuối                    | mọi lời gọi HTTP trong `test/` gửi body, trừ các ca cố ý gửi body không hợp lệ để nhận 422; một lời gọi service trực tiếp (R-08) có lý do; Recovery CLI dùng `RecoveryService.unlock`, không đổi       | —                                           |
| Consumer FE-web `ac63c61`, Mobile `d81f653` (chỉ đọc)          | 18/10/2026                  | không caller, không client sinh cho hai operation                                                                                                                                                      | client sinh sau merge phải gửi `{ reason }` |

**Audit Trail đủ, không migration:** `after` JSON của sự kiện hiện có giữ `status` (và số phiên/lời mời bị thu hồi khi
khóa) cùng `reason` đã trim; `before.status`; người thực hiện, vai, thời điểm, correlation nằm ở envelope
(`actor_app_user_id`, `actor_roles`, `occurred_at`, `correlation_id`). Integration khẳng định đúng toàn bộ `before`/`after`
và actor, và `GET /api/v1/audit-events` trả `after.reason`. Không cần cột/bảng mới.

**Consumer handoff:** `POST /api/v1/app-users/{id}/lock` và `/unlock` giờ bắt buộc body `{ "reason": "..." }` — breaking
với client gửi body rỗng. Lúc kiểm không có consumer trong FE-web/Mobile; khi tích hợp, client gửi lý do hoặc tham chiếu
người dùng nhập và regenerate từ `openapi.json` sau merge.

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có.
- [x] Diff cuối đã tự review; remediation, handoff, roadmap và ghi chú contract 1b cập nhật.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật. Còn chờ: remote CI, Owner review, FE/Mobile regenerate client và gửi `{ reason }`.

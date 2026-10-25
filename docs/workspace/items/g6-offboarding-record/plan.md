# Plan: hồ sơ nghỉ việc: bàn giao, nghỉ đột ngột, danh sách quyền đang giữ và checklist `BM-08`

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (24/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (24/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, uncommitted). PR: chưa có.

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, [module structure](../../../rules/module-structure.md), [database rules](../../../rules/database-business.md), spec của bốn hạng mục phụ thuộc (`g6-transfer-record`, `g6-long-leave`, `g6-revocation-by-grant-kind`, `g6-handover-confirmation`) cùng `g6-transfer-tool-review`, và mã `identity-access/accounts` (`account-policy.ts` `employeeHasNotLeft`, `app-users.controller.ts`, `account-query.service.ts`) ở BE `7920ee5`. Đối chiếu: chưa có mã nào ghi `status = TERMINATED`; `GET /app-users` chưa lọc theo trạng thái nhân viên; hàm đọc giai đoạn trưởng phòng và hàm hủy chỉ định chưa hiệu lực do `g6-transfer-record` thêm. Hạng mục lớn nên chia ba phase có checkpoint. Migration (`20261024180000`, `20261024180100`) là task riêng đi trước mã dùng chúng.

## Tasks

### Phase 1: ghi hồ sơ và chuyển `LEFT`

### Task 1: thiết kế `ready` (xong)

- Files: `spec.md`, `plan.md`, `docs/roadmap.md` (scope map G6 do người tích hợp dán)
- Depends on: none
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: migration (xong)

- Files: `prisma/migrations/20261024180000_personnel_offboarding_cases/migration.sql`, `prisma/migrations/20261024180100_identity_app_user_employee_left/migration.sql`, `prisma/models/personnel.prisma`, `prisma/models/identity-access.prisma`, `prisma/models/organization.prisma` (quan hệ ngược), `src/architecture-boundaries.spec.ts` (model owner)
- Depends on: Task 1, `g6-transfer-record`, `g6-long-leave`
- Acceptance: enum và bảng hồ sơ với `CHECK` đồng bộ trạng thái, unique một phần một hồ sơ sống mỗi nhân viên, bảng thay đổi chỉ thêm; cột `employee_left_on` ghi một lần
- Verify: nhóm test _what the database refuses_ (`23505`, `23514`, `55000`) xanh; `pnpm prisma:validate`; `migrate diff --exit-code` = 0 trên CSDL kiểm thử riêng

### Task 3: quy tắc thuần (xong)

- Files: `src/modules/personnel/offboarding/offboarding.policy.ts` (+ spec)
- Depends on: Task 1
- Acceptance: trạng thái cho phép, ngày cuối cho từng chế độ, đếm số lượng, bốn bước `BM-08`, điều kiện đóng hồ sơ; mã lý do ngữ nghĩa
- Verify: unit test đủ bảng ca xanh; `policy-ownership.spec.ts` xanh

### Task 4: hàm của `organization` và `identity-access` (xong)

- Files: `organization/organization-history.service.ts`, `organization/employee/employee-departure.repo.ts`, `employee-directory.service.ts`, `identity-access/identity-access.service.ts`, `accounts/account-directory.service.ts`, `accounts/app-user.repo.ts`, `dto/account-management.dto.ts`
- Depends on: Task 2
- Acceptance: `scheduleDepartureEnd`, `cancelDepartureEnd` (đổi ngày = hủy rồi ghi lại), `markEmployeeLeft`; `markEmployeeLeft` của identity; `GET /app-users` lọc `employeeLeft` (lọc `status` đã có)
- Verify: tích hợp của các hàm qua `offboarding-*`; hồi quy `organization`, `account-list-and-redeem`, `account-management-http` xanh

### Task 5: ghi hồ sơ, chuyển `LEFT`, hiệu ứng (xong)

- Files: `offboarding.service.ts`, `offboarding-left.service.ts`, `offboarding-periods.service.ts`, `offboarding-handover.service.ts`, `offboarding-frame.service.ts`, `offboarding-audit.service.ts`, `offboarding.repo.ts`, `offboarding-blocker.registry.ts`, `personnel.module.ts`, `transfer-change.service.ts`, `transfer-guard.service.ts`, `transfer-review.listener.ts`
- Depends on: Task 3, Task 4, `g6-handover-confirmation`
- Acceptance: ghi có kế hoạch và đột ngột, trưởng phòng đi cùng, hủy điều chuyển chờ trong cùng thao tác, kỳ nghỉ dài kết thúc, việc xác nhận mở với `dueOn` đúng, cảnh báo Business Owner, chuyển `LEFT` chặn tài khoản theo trạng thái, phiên rà soát công cụ còn mở được đóng; AC-1, AC-2, AC-8→AC-10, AC-18, AC-19, AC-23, AC-29, `US-03-03` AC-6, `US-03-01` AC-21
- Verify: integration PostgreSQL của các AC đó xanh (`offboarding-record`, `offboarding-departure`, `offboarding-self`)

### Checkpoint 1

Xong: gate xanh trên cây làm việc, tự review diff theo AC.

### Phase 2: quyền đang giữ, thu hồi hàng loạt, checklist, đóng hồ sơ

### Task 6: đọc quyền và checklist (xong)

- Files: `offboarding-view.service.ts`, `offboarding.mapper.ts`, `offboarding-list.repo.ts`, `licensing.service.ts` (thêm `countPersonalSeatsOf`, `getHandoverDutiesOf`; đọc `listPersonalSeatsOf`, `listTerminatingAccess` đã có)
- Depends on: Task 5
- Acceptance: danh sách quyền phân trang kèm lưu ý, việc xác nhận, tác vụ; checklist bốn bước; `blockers` và `warnings` từ registry; AC-1, AC-16, AC-20, AC-21
- Verify: integration + test đếm câu lệnh không phụ thuộc số dòng xanh (`offboarding-integrity`)

### Task 7: thu hồi hàng loạt, khóa tài khoản, đóng hồ sơ (xong)

- Files: `offboarding-revocation.service.ts`, `offboarding.controller.ts`, `offboarding.dto.ts`, `offboarding.http-errors.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 6
- Acceptance: `revocations` kiểm `count`, lý do và khóa tài khoản rồi mở thu hồi trong một transaction; `account-lock` ghi một lần; `closure` đúng điều kiện; AC-3→AC-6, AC-20
- Verify: integration PostgreSQL và e2e của các AC đó xanh; `pnpm openapi:export` không lệch

### Checkpoint 2

Xong: gate xanh; tự review diff theo AC; giao diện `offboarding-blocker.registry.ts` ghi ở spec cho `g6-service-account-handover` và `g6-leaver-role-and-workspace-duties`.

### Phase 3: đổi ngày cuối và hủy

### Task 8: đổi ngày cuối, hủy, API còn lại (xong)

- Files: `offboarding-change.service.ts`, `offboarding.controller.ts`, `offboarding.dto.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 5
- Acceptance: đổi ngày cuối (chỉ định trưởng phòng dời và kiểm lại, hạn xác nhận tính lại), hủy (trả giai đoạn, hủy chỉ định, hủy việc xác nhận, trả trạng thái làm việc), danh sách và chi tiết; AC-7, AC-14, AC-15, AC-22, AC-26
- Verify: integration PostgreSQL và e2e của các AC đó xanh; `pnpm openapi:export` không lệch

### Task 9: tài liệu và hồi quy (xong)

- Files: `ARCHITECTURE.md`, `AGENTS.md`, `docs/rules/security-jobs.md`, `test/README.md`, `spec.md`/`plan.md` của hạng mục, ghi chú cho hạng mục anh em và FE trong spec
- Depends on: Task 8
- Acceptance: tài liệu mô tả đúng hồ sơ nghỉ việc, hai nguồn chặn đóng hồ sơ và điểm gọi; FE được báo về `GET /app-users` thêm lọc
- Verify: `pnpm rules:check`, `pnpm rules:format` → xanh; `pnpm check`, `pnpm test:e2e` xanh; tích hợp: các suite của hạng mục và hồi quy các vùng đã chạm (không chạy toàn bộ tích hợp: người tích hợp chạy một lần ở cuối G6)

### Checkpoint 3

Xong: gate đầy đủ xanh trên revision cuối (cây làm việc local, chưa commit); tự review diff theo spec và AC.

## Verification and handoff

Chạy từ gốc BE theo [CONTRIBUTING](../../../../CONTRIBUTING.md) và [test guide](../../../../test/README.md): `pnpm check`, `pnpm test:e2e`, tích hợp (CSDL riêng, từng suite), `pnpm openapi:export`.

| Lệnh / kiểm tra AC                                                         | Revision / môi trường                                                                                                                                      | Kết quả thực chạy                                                                                                                                                                                                                                                            | Giới hạn / việc còn lại                                                                                                                                                            |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm prisma:validate` | cây làm việc local, chưa commit (BE `7920ee5` cộng thay đổi G5/G6 chưa commit)                                                                             | xanh                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                  |
| `pnpm exec jest --runInBand`                                               | như trên                                                                                                                                                   | 190 suite, 2942 ca xanh (mới: `offboarding.policy.spec.ts` 44 ca; cổng kiến trúc, `policy-ownership`, `module-graph`, `api-collection-contract` xanh)                                                                                                                        | —                                                                                                                                                                                  |
| `pnpm openapi:export` rồi `pnpm test:e2e`                                  | như trên, 265 thao tác                                                                                                                                     | 37 suite, 956 ca xanh (mới: `offboarding-cases.e2e-spec.ts`; kiểm kê 265; `openapi-export.e2e-spec.ts` xanh sau khi `cli-process.ts` tắt gỡ kiểu native của Node 24)                                                                                                         | `pnpm openapi:export` trên Node 24.0.x cần `NODE_OPTIONS=--no-experimental-strip-types` (xem spec, mục môi trường)                                                                 |
| Tích hợp của hạng mục (PostgreSQL thật, CSDL riêng)                        | như trên                                                                                                                                                   | 5 suite, 37 ca xanh: `offboarding-record` (13), `-change` (9), `-departure` (8), `-self` (2), `-integrity` (5)                                                                                                                                                               | test viết sau mã, không đỏ-trước                                                                                                                                                   |
| Tích hợp hồi quy                                                           | như trên                                                                                                                                                   | 28 suite, 339 ca xanh (gồm 5 suite của hạng mục): `department-transfer-*`, `transfer-review-*`, `long-leave-*`, `handover-duty-*`, `provisioning-revocation-*`, `organization`, `account-list-and-redeem`, `account-management-http`, `organization-identity-read-contracts` | không chạy toàn bộ tích hợp: chỉ các vùng đã chạm (organization, identity-access, licensing handover và revocation read, personnel); người tích hợp chạy toàn bộ một lần ở cuối G6 |
| Drift migration                                                            | CSDL tạm trong container test, `prisma migrate deploy` rồi `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`, rồi xóa CSDL tạm | không lệch (`No difference detected`)                                                                                                                                                                                                                                        | —                                                                                                                                                                                  |
| `pnpm build`, `pnpm test:discovery`                                        | như trên                                                                                                                                                   | xanh (`pnpm build` thoát 0; `pnpm test:discovery`: 190 unit, 37 e2e, 197 tích hợp)                                                                                                                                                                                           | —                                                                                                                                                                                  |
| `pnpm rules:check`, `pnpm rules:format`                                    | như trên                                                                                                                                                   | xanh (`rules:check`: 273 file, 0 lỗi; `rules:format` xanh); `pnpm check` đầy đủ thoát 0                                                                                                                                                                                      | —                                                                                                                                                                                  |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối (mục _Như đã xây và khác biệt_ của spec); chưa có peer review.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (`docs/rules/security-jobs.md`, ARCHITECTURE.md, `test/README.md`, AGENTS.md); phần chưa kiểm chứng ghi rõ trong spec.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

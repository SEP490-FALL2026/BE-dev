# Plan: nghỉ dài và quay lại có căn cứ

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (24/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (24/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, uncommitted). PR: chưa có.

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, [module structure](../../../rules/module-structure.md), [database rules](../../../rules/database-business.md), spec của `g6-transfer-record` (nền `personnel`, `work_state`, chính sách căn cứ) và mã `organization/employee` ở BE `7920ee5`. Đối chiếu: cột `employees.work_state` và `setEmployeeWorkState` do `g6-transfer-record` thêm; hàm `PersonnelService` chưa có. Migration `20261024170000_personnel_employee_leaves` là task riêng đi trước mã dùng nó.

## Tasks

### Task 1: thiết kế `ready` (xong)

- Files: `spec.md`, `plan.md`, `docs/roadmap.md` (scope map G6 do người tích hợp dán)
- Depends on: none
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu (xong)

- Files: `prisma/migrations/20261024170000_personnel_employee_leaves/migration.sql`, `prisma/models/personnel.prisma`, `src/architecture-boundaries.spec.ts` (model owner)
- Depends on: Task 1, `g6-transfer-record`
- Acceptance: ba enum, `employee_leaves` với unique một phần cho kỳ `ACTIVE` và `CHECK` ngày/trạng thái, `employee_leave_changes` chỉ thêm, không cột lý do nghỉ
- Verify: nhóm test _what the database refuses_ (`23505`, `23514`, `55000`) xanh; `pnpm prisma:validate`; `migrate diff --exit-code` = 0 trên CSDL kiểm thử riêng

### Task 3: quy tắc thuần (xong)

- Files: `src/modules/personnel/leave/leave.policy.ts` (+ spec)
- Depends on: Task 1
- Acceptance: ngày bắt đầu, ngày dự kiến, căn cứ (tái dùng `grounds.policy`), quay lại đúng hay khác ngày đã duyệt, quá hạn; mã lý do ngữ nghĩa
- Verify: unit test đủ bảng ca xanh; `policy-ownership.spec.ts` xanh

### Task 4: dịch vụ và sweeper (xong)

- Files: `personnel/leave/leave.service.ts`, `leave.repo.ts`, `leave-return.sweeper.ts`, `personnel/personnel.service.ts`, `personnel.module.ts`, `src/module-graph.spec.ts` (`PUBLIC_CONTRACT_EXPORTS` khi có consumer)
- Depends on: Task 2, Task 3
- Acceptance: `start`, `changeReturnDate`, `confirmReturn`, `endForDeparture`, `resumeAfterCancelledDeparture`, `getLeaveIntervals`; một transaction mỗi lệnh dưới khóa nhân viên; nhắc quá hạn một lần mỗi ngày đã duyệt; trạng thái không bao giờ tự đổi
- Verify: integration PostgreSQL của AC-4, AC-5, AC-7, AC-8 và hai hàm cho nghỉ việc xanh

### Task 5: API và wire nhân viên (xong)

- Files: `leave.controller.ts`, `leave.dto.ts`, `leave.http-errors.ts`, `leave.mapper.ts`, `organization/employee/employee.dto.ts`, `employees.controller.ts` (thêm `workState`), `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 4
- Acceptance: sáu route `IT_ADMIN`, `403` cho vai khác, body strict từ chối trường lạ, `workState` ở danh sách và chi tiết nhân viên, danh sách phân trang và đếm câu lệnh không phụ thuộc số dòng
- Verify: e2e kiểm kê và `403` xanh; `pnpm openapi:export` không lệch; test hồi quy `employees` xanh

### Checkpoint (xong, kết quả ở bảng dưới)

Gate xanh trên cây làm việc (`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên CSDL riêng), tự review diff theo AC; báo cho FE trường `workState` mới và cho `g6-offboarding-record` hai hàm nội module.

## Verification and handoff

Chạy từ gốc BE theo [CONTRIBUTING](../../../../CONTRIBUTING.md) và [test guide](../../../../test/README.md): `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` (CSDL riêng), `pnpm openapi:export`.

| Lệnh / kiểm tra AC                                                         | Revision / môi trường                                                                                                                                      | Kết quả thực chạy                                                                                                                                                                                                                                                                                                              | Giới hạn / việc còn lại                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm prisma:validate` | cây làm việc local, chưa commit (BE `7920ee5` cộng thay đổi G5/G6 chưa commit)                                                                             | xanh                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                                                                                                        |
| `pnpm exec jest --runInBand`                                               | như trên                                                                                                                                                   | 189 suite, 2898 ca xanh (mới: `leave.policy.spec.ts` 31 ca; cổng kiến trúc, `policy-ownership`, `module-graph`, `api-collection-contract` xanh)                                                                                                                                                                                | —                                                                                                                                                                                                                                                                        |
| `pnpm openapi:export` rồi `pnpm test:e2e`                                  | như trên, 254 thao tác                                                                                                                                     | 36 suite, 923 ca xanh (mới: `long-leaves.e2e-spec.ts`; kiểm kê 254)                                                                                                                                                                                                                                                            | —                                                                                                                                                                                                                                                                        |
| Tích hợp của hạng mục (PostgreSQL thật, CSDL riêng)                        | như trên                                                                                                                                                   | 3 suite, 44 ca xanh: `long-leave-start` (20), `long-leave-return` (13), `long-leave-integrity` (11)                                                                                                                                                                                                                            | `AC-1`→`AC-3` chờ rule G7; `AC-6` ở `g6-offboarding-record` (hai hàm đã test độc lập)                                                                                                                                                                                    |
| Tích hợp hồi quy                                                           | như trên                                                                                                                                                   | 10 suite, 204 ca xanh: `department-transfer-record`, `-change`, `-integrity`, `departments-http`, `employee-manual-http`, `employee-maintenance-http`, `organization-identity-read-contracts`, `transfer-review-open`, `organization`, `handover-duty-departure` (ba test sửa danh sách khóa của phản hồi vì thêm `workState`) | chạy theo vùng chạm (`departments-http`, `employee-manual-http`, `employee-maintenance-http`, `organization-identity-read-contracts`, `department-transfer-*`, `transfer-review-open`, `organization`); không chạy toàn bộ tích hợp, người tích hợp chạy một lần cuối G6 |
| Drift migration                                                            | CSDL tạm trong container test, `prisma migrate deploy` rồi `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`, rồi xóa CSDL tạm | không lệch (`No difference detected`)                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                        |
| `pnpm build`, `pnpm test:discovery`                                        | như trên                                                                                                                                                   | xanh (`pnpm build` thoát 0; `pnpm test:discovery`: 189 unit, 36 e2e, 192 tích hợp)                                                                                                                                                                                                                                             | —                                                                                                                                                                                                                                                                        |
| `pnpm rules:check`, `pnpm rules:format`                                    | như trên                                                                                                                                                   | xanh (`rules:check`: 273 file, 0 lỗi; `rules:format` xanh)                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                        |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối (mục _Như đã xây và khác biệt_ của spec); chưa có peer review.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (`docs/rules/security-jobs.md`, ARCHITECTURE.md, `test/README.md`, AGENTS.md); phần chưa kiểm chứng ghi rõ trong spec.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

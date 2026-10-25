# Plan: báo lỗi SaaS cho quyền của mình và IT Admin xử lý phiếu `BM-11`

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (24/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (24/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, uncommitted). PR: chưa có.

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, [module structure](../../../rules/module-structure.md), [API contract](../../../rules/api-contract.md), [database rules](../../../rules/database-business.md), mã `licensing/assignment`, `licensing/provisioning` (đọc Assignment và tác vụ cấp), `organization.service.ts` (`getItAdminInCharge`), `identity-access.service.ts` (`findUsableItAdminEmployeeIds`) và `operating-parameters/parameter-definitions.ts` ở BE `7920ee5`. Đối chiếu: chưa có bảng phiếu; hàm ngày làm việc do `g6-transfer-record` hoặc `g5-step-sla-and-alerts` tạo; BE chưa có trạng thái tác vụ _chờ chấp nhận_. Hạng mục độc lập với các hạng mục nhân sự khác của G6. Migration `20261025000000_licensing_saas_issues` (tên tạm `20261024089500` phải xếp sau `20261024230000`) là task riêng đi trước mã dùng nó.

## Tasks

### Task 1: thiết kế `ready` (xong)

- Files: `spec.md`, `plan.md`, `docs/roadmap.md` (scope map G6 do người tích hợp dán)
- Depends on: none
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu và tham số (xong)

- Files: `prisma/migrations/20261025000000_licensing_saas_issues/migration.sql`, `prisma/models/licensing.prisma`, `src/modules/operating-parameters/parameter-definitions.ts`, `parameter-definitions.spec.ts`, `PRISMA_MODEL_OWNER` ở `architecture-boundaries.spec.ts`, `operating-parameters-http.integration-spec.ts` (18 → 20 tham số)
- Depends on: Task 1
- Acceptance: bốn enum, `saas_issues` với `CHECK` theo trạng thái (kết quả, phiếu gốc, đóng), `saas_issue_entries` chỉ thêm; hai khóa tham số `SAAS_ISSUE_RESPONSE_WORKING_DAYS`, `SAAS_ISSUE_REOPEN_WORKING_DAYS`
- Verify: nhóm test _what the database refuses_ (`23514`, `55000`) xanh; test định nghĩa tham số xanh; `pnpm prisma:validate`; `migrate diff --exit-code` = 0 trên CSDL kiểm thử riêng

### Task 3: quy tắc thuần (xong)

- Files: `src/modules/licensing/saas-issue/saas-issue.policy.ts` (+ spec)
- Depends on: Task 1
- Acceptance: Assignment báo được, đồ thị trạng thái, trường bắt buộc, cửa sổ mở lại, người được giao (IT Admin phụ trách rồi dự phòng); mã lý do ngữ nghĩa
- Verify: unit test đủ bảng ca xanh; `policy-ownership.spec.ts` xanh

### Task 4: gửi, bổ sung, mở lại (xong)

- Files: `saas-issue.service.ts`, `saas-issue.repo.ts`, `saas-issue-facts.repo.ts`, `saas-issue-calendar.service.ts`, `saas-issue-view.service.ts`, `licensing.module.ts`, `findFirstUsableItAdminEmployeeId` ở ba lớp của `identity-access`
- Depends on: Task 2, Task 3
- Acceptance: gửi cho Assignment của chính mình (không lộ sự tồn tại), giao đúng một IT Admin, hạn phản hồi chốt lúc tạo, bổ sung đưa `WAITING_REPORTER` về `IN_PROGRESS`, mở lại trong hạn; AC-1→AC-4, AC-6, AC-7 của `US-07-10`
- Verify: integration PostgreSQL của các AC đó xanh

### Task 5: xử lý, trùng, sweeper và API (xong)

- Files: `saas-issue-handling.service.ts`, `saas-issue-sweep.service.ts`, `saas-issue.sweeper.ts`, `saas-issues.controller.ts`, `saas-issue.dto.ts`, `saas-issue.http-errors.ts`, `saas-issue.mapper.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts` (286 → 295), `openapi.json`, `test/e2e/saas-issues.e2e-spec.ts`
- Depends on: Task 4
- Acceptance: chuyển trạng thái đúng đồ thị với kết quả và mã ticket ghi tay, không nhãn đã gửi ticket, tham chiếu luồng khác không tự kích hoạt, đánh dấu trùng, xử lý thay có audit, nhắc quá hạn một lần, đóng tự động; `403` và `404` đúng vai; mô tả OpenAPI chỉ web; AC-5, AC-8, AC-9 của `US-07-10` và AC-1→AC-9 của `US-07-11`
- Verify: integration PostgreSQL và e2e của các AC đó xanh; `pnpm openapi:export` không lệch; test đếm câu lệnh xanh

### Checkpoint (xong)

Gate xanh trên cây làm việc (`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên CSDL riêng), tự review diff theo AC; FE được báo chín route mới và hai tham số (ghi ở mục _Như đã xây và khác biệt_ của spec).

## Verification and handoff

Chạy từ gốc BE theo [CONTRIBUTING](../../../../CONTRIBUTING.md) và [test guide](../../../../test/README.md): `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` (CSDL riêng), `pnpm openapi:export`.

| Lệnh / kiểm tra AC                                                                                                                        | Revision / môi trường                                                                                                                                      | Kết quả thực chạy                                                                                                                                                                                                                                                                                                 | Giới hạn / việc còn lại                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm typecheck`, `pnpm lint`                                                                                                             | cây làm việc local, chưa commit (BE `7920ee5` cộng thay đổi G5/G6 chưa commit)                                                                             | xanh                                                                                                                                                                                                                                                                                                              | —                                                               |
| `pnpm exec jest --runInBand`                                                                                                              | như trên                                                                                                                                                   | 197 suite, 3091 ca xanh (mới: `saas-issue.policy.spec.ts` 32 ca; cổng kiến trúc, `module-graph`, `policy-ownership`, `api-collection-contract` xanh)                                                                                                                                                              | —                                                               |
| `pnpm openapi:export` rồi `pnpm test:e2e`                                                                                                 | như trên, 295 thao tác                                                                                                                                     | 43 suite, 1103 ca xanh; mới: `saas-issues.e2e-spec.ts` 42 ca (`401`, `403` theo vai, `422`, không route cho mobile, mô tả _web client only_); kiểm kê 295; `openapi-export` và `api-inventory` xanh                                                                                                               | `US-07-10` AC-8 kiểm ở tích hợp vì cần CSDL                     |
| Tích hợp của hạng mục (PostgreSQL thật, CSDL riêng)                                                                                       | như trên                                                                                                                                                   | 3 suite, 42 ca xanh: `saas-issue-submit` (13), `saas-issue-handling` (13), `saas-issue-integrity` (16)                                                                                                                                                                                                            | test viết cùng mã, không đỏ-trước; chưa có test đồng thời riêng |
| Tích hợp hồi quy                                                                                                                          | như trên, chạy sau sửa mã cuối                                                                                                                             | 12 suite, 224 ca xanh (cùng 3 suite trên là 15 suite, 266 ca): `operating-parameters-http` (20 tham số), `account-management-http`, `approval-roles-http`, `auth-http`, `license-assignment-http`, `assignment-expiry-*`, `personnel-notice-*`, `organization-identity-read-contracts`, `provisioning-queue-http` | chưa chạy toàn bộ tích hợp (người tích hợp chạy sau)            |
| Drift migration                                                                                                                           | CSDL tạm trong container test, `prisma migrate deploy` rồi `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`, rồi xóa CSDL tạm | không lệch (`No difference detected`)                                                                                                                                                                                                                                                                             | —                                                               |
| `pnpm prisma:validate`                                                                                                                    | như trên                                                                                                                                                   | xanh                                                                                                                                                                                                                                                                                                              | —                                                               |
| `pnpm rules:check`, `pnpm rules:test`, `pnpm rules:format`, `pnpm format:check`, `pnpm test:scripts`, `pnpm test:discovery`, `pnpm build` | như trên                                                                                                                                                   | xanh (`rules:check`: 273 file, 0 lỗi; `rules:test` 38 ca; `test:discovery`: 197 unit, 43 e2e, 211 tích hợp; `pnpm build` thoát 0)                                                                                                                                                                                 | —                                                               |

- [x] AC trong scope có bằng chứng (bảng test của spec); lỗi đã xử lý hoặc ghi blocker (tệp minh chứng, hộp thông báo và `OQ-31` ngoài phạm vi).
- [x] Spec/plan/test design phản ánh đúng implementation cuối (mục _Như đã xây và khác biệt_ của spec); chưa có peer review.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (`docs/rules/security-jobs.md`, `ARCHITECTURE.md`, `AGENTS.md`, `test/README.md`); phần chưa kiểm chứng ghi rõ trong spec.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

# Plan: chuyển người chịu trách nhiệm tài khoản dịch vụ trước điều chuyển hoặc nghỉ việc

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (24/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (24/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, uncommitted). PR: chưa có.

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, [module structure](../../../rules/module-structure.md), [database rules](../../../rules/database-business.md), mã `licensing/assignment` (`assignment.service.ts` `changeResponsible`, `assignment.policy.ts` `assertResponsibleChange`, `assignments.controller.ts`) và spec của `g6-transfer-record`, `g6-offboarding-record`, `g6-long-leave`, `g6-handover-confirmation`, `g5-service-account-request` (mục _Như đã xây và khác biệt_) ở BE `7920ee5`. Đối chiếu: đổi người hiện chỉ kiểm người mới `ACTIVE` và cùng phòng sở hữu, chưa biết `work_state` hay hạn của hồ sơ; comment trong `assignment.policy.ts` đã ghi chuyển sang phòng khác là quyết định của G6; `assignment.service.ts` đã đúng 400 dòng; `PersonnelFileDeadlines` chưa được xây; registry nguồn chặn của hồ sơ nghỉ việc còn rỗng. Hai hạng mục phụ thuộc đã xong. Migration `20261024190000`, `20261024190100` là task riêng đi trước mã dùng chúng.

## Tasks

### Task 1: thiết kế `ready` (xong)

- Files: `spec.md`, `plan.md`, `docs/roadmap.md` (scope map G6 do người tích hợp dán)
- Depends on: none
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu (xong)

- Files: `prisma/migrations/20261024190000_licensing_service_account_moves/migration.sql`, `prisma/migrations/20261024190100_personnel_transfer_closure/migration.sql`, `prisma/models/licensing.prisma`, `prisma/models/personnel.prisma`, `prisma/models/organization.prisma` (quan hệ ngược), `test/gates/architecture-boundaries.gate-spec.ts` (`PRISMA_MODEL_OWNER`)
- Depends on: Task 1, `g6-transfer-record`
- Acceptance: `service_account_moves` với unique một phần `PENDING` và `CHECK` trạng thái, `service_account_duty_notices` unique, cột đóng của điều chuyển chỉ khi `EFFECTIVE`
- Verify: nhóm test _what the database refuses_ (`23505`, `23514`, `55000`, `23001`) xanh (`service-account-integrity`); `pnpm prisma:validate`; `migrate diff --exit-code` = 0 trên CSDL kiểm thử riêng

### Task 3: quy tắc thuần (xong)

- Files: `licensing/assignment/assignment.policy.ts` (+ spec), `licensing/assignment/service-account-move.policy.ts` (+ spec), `service-account.errors.ts`, `licensing.errors.ts` (thêm `HANDING_OVER`)
- Depends on: Task 1
- Acceptance: người mới hợp lệ (trạng thái làm việc, phòng), hạn theo hồ sơ, điều kiện đề xuất và người xác nhận chuyển phòng; mã lý do ngữ nghĩa
- Verify: unit test đủ bảng ca xanh; `policy-ownership.spec.ts` xanh

### Task 4: đổi người và việc còn treo (xong)

- Files: `assignment-responsible.service.ts` (mới: `changeResponsible` chuyển khỏi `assignment.service.ts`, `succeed`, `lockHolder`), `assignment.repo.ts`, `service-account-duty.service.ts`, `service-account-duty.repo.ts`, `service-account-duty.sweeper.ts`, `registered-responsible-deadline.service.ts`, `licensing.service.ts`, `licensing-service-account.types.ts`, `personnel/service-account/*` (hook, nguồn chặn, `PersonnelFileDeadlines` + repo)
- Depends on: Task 2, Task 3, `g6-offboarding-record`
- Acceptance: đổi người từ chối người đang bàn giao và ràng buộc hạn; `listServiceAccountDuties`; hook nhắc; nguồn chặn đóng hồ sơ nghỉ việc; sweeper quá hạn một lần
- Verify: integration PostgreSQL của AC-1, AC-4→AC-7 và `US-03-01` AC-9, `US-03-04` AC-17 xanh (`service-account-duty`)

### Task 5: chuyển phòng có xác nhận và đóng điều chuyển (xong)

- Files: `service-account-move.service.ts`, `service-account-move.repo.ts`, `service-account-move-view.service.ts`, `service-account-moves.controller.ts`, `service-account-duties.controller.ts`, `assignments.controller.ts` (route đề xuất), `service-account.dto.ts`, `service-account.http-errors.ts`, `personnel/transfer/transfer-closure.service.ts`, `transfers.controller.ts`, `transfer.*` (cột đóng), `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 4
- Acceptance: đề xuất chờ không động Assignment; xác nhận bởi trưởng phòng hoặc approver dự phòng kết thúc dòng cũ và mở dòng mới ở phòng nhận; không gọi `budgets`; đóng điều chuyển theo điều kiện; danh sách phân trang; AC-9, AC-10
- Verify: integration PostgreSQL (`service-account-move`) và e2e (`service-account-handover.e2e-spec.ts`) xanh; `pnpm openapi:export` không lệch; test đếm câu lệnh xanh

### Task 6: tài liệu và hồi quy (xong)

- Files: `ARCHITECTURE.md`, `AGENTS.md`, `docs/rules/security-jobs.md`, `test/README.md`, `spec.md`/`plan.md` của hạng mục, `docs/roadmap.md`, `docs/workspace/items/README.md`, ghi chú cho `g6-offboarding-record`, `g6-transfer-record`, `g6-leaver-role-and-workspace-duties`, `g5-service-account-request`
- Depends on: Task 5
- Acceptance: tài liệu mô tả đúng đổi người, chuyển phòng, việc treo, nguồn chặn và điểm gọi; FE được báo ở spec
- Verify: `pnpm rules:check`, `pnpm rules:format` → xanh; `pnpm check`, `pnpm test:e2e` xanh; tích hợp: các suite của hạng mục và hồi quy các vùng đã chạm (không chạy toàn bộ tích hợp: người tích hợp chạy một lần ở cuối G6)

### Checkpoint

Xong: gate đầy đủ xanh trên cây làm việc local (chưa commit); tự review diff theo AC; FE được báo các route mới và lỗi mới của đổi người (spec, mục _Cho hạng mục sau_).

## Verification and handoff

Chạy từ gốc BE theo [CONTRIBUTING](../../../../CONTRIBUTING.md) và [test guide](../../../../test/README.md): `pnpm check`, `pnpm test:e2e`, tích hợp (CSDL riêng, từng suite), `pnpm openapi:export`.

| Lệnh / kiểm tra AC                                                         | Revision / môi trường                                                                                                                                      | Kết quả thực chạy                                                                                                                                                                                                                                                                                                                                                    | Giới hạn / việc còn lại                                                                                                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm prisma:validate` | cây làm việc local, chưa commit (BE `7920ee5` cộng thay đổi G5/G6 chưa commit)                                                                             | xanh                                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                                                                                 |
| `pnpm exec jest --runInBand`                                               | như trên                                                                                                                                                   | 191 suite, 2958 ca xanh (mới: `service-account-move.policy.spec.ts` 12 ca và 4 ca thêm ở `assignment.policy.spec.ts`; cổng kiến trúc, `policy-ownership`, `module-graph`, `api-collection-contract` xanh)                                                                                                                                                            | —                                                                                                                                                                 |
| `pnpm openapi:export` rồi `pnpm test:e2e`                                  | như trên, 271 thao tác                                                                                                                                     | 38 suite, 986 ca xanh (mới: `service-account-handover.e2e-spec.ts` 30 ca; kiểm kê 271; `openapi-export.e2e-spec.ts` và `api-inventory.e2e-spec.ts` xanh)                                                                                                                                                                                                             | `pnpm openapi:export` trên Node 24.0.x cần `NODE_OPTIONS=--no-experimental-strip-types` (xem spec của `g6-offboarding-record`, mục môi trường)                    |
| Tích hợp của hạng mục (PostgreSQL thật, CSDL riêng)                        | như trên                                                                                                                                                   | 3 suite, 25 ca xanh: `service-account-duty` (11), `service-account-move` (8), `service-account-integrity` (6)                                                                                                                                                                                                                                                        | test viết sau mã, không đỏ-trước                                                                                                                                  |
| Tích hợp hồi quy                                                           | như trên                                                                                                                                                   | 40 suite, 464 ca xanh (gồm 3 suite của hạng mục): `license-assignment-*`, `unit-only-cost-attribution`, `seat-baseline-*`, `department-transfer-*`, `offboarding-*`, `handover-duty-*`, `long-leave-*`, `transfer-review-*`, `provisioning-revocation-*`, `assignment-writes`, `department-tools-http`, `licensing-assignment-read-contracts`, `access-request-http` | không chạy toàn bộ tích hợp: chỉ các vùng đã chạm (licensing assignment, personnel transfer/offboarding, handover); người tích hợp chạy toàn bộ một lần ở cuối G6 |
| Drift migration                                                            | CSDL tạm trong container test, `prisma migrate deploy` rồi `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`, rồi xóa CSDL tạm | không lệch (`No difference detected`)                                                                                                                                                                                                                                                                                                                                | —                                                                                                                                                                 |
| `pnpm build`, `pnpm test:discovery`                                        | như trên                                                                                                                                                   | xanh (`pnpm build` thoát 0; `pnpm test:discovery`: 191 unit, 38 e2e, 200 tích hợp; `pnpm test:scripts`, `pnpm rules:test` xanh)                                                                                                                                                                                                                                      | —                                                                                                                                                                 |
| `pnpm rules:check`, `pnpm rules:format`                                    | như trên                                                                                                                                                   | xanh (`rules:check`: 273 file, 0 lỗi; `rules:format` xanh)                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                 |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối (mục _Như đã xây và khác biệt_ của spec); chưa có peer review.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (`docs/rules/security-jobs.md`, ARCHITECTURE.md, `test/README.md`, AGENTS.md); phần chưa kiểm chứng ghi rõ trong spec.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

# Plan: qd103-budget-cycle-ceilings

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `d9c46552`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W2, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `verified` (kiểm local 08/11/2026, chat code; commit cục bộ, chưa push). PR: chưa có.

## Before coding

Đọc `src/modules/budgets/README.md` (thứ tự khóa), `docs/rules/module-structure.md`, `docs/rules/database-business.md`,
`docs/rules/api-contract.md`, `docs/guides/seed.md`. Xem cách `operating-parameters` khai tham số
(`parameter-definitions.policy.ts`) và bước ngân sách của seed (`src/cli/seed/steps/finance.steps.ts:117-172`).

## Design review

Audit thiết kế bằng subagent chỉ-đọc 08/11/2026: hạng mục này có 1 Cao (DA2-30 chéo), 7 TB (DA2-02, 03, 04, 05, 06, 08,
31 chéo), 1 Thấp (DA2-07) + luật bỏ sót 3 ⟹ đã sửa hết: DA2-02 (`first_published_at`, bỏ phát hành không chặn nộp — tạm
chọn), DA2-03 (tập phòng, `CEILINGS_INCOMPLETE`), DA2-04 (audit trước/sau, người nhận theo QT 4.1, phát hành lại chỉ báo
phòng đổi), DA2-05 + luật 3 (năm đã qua chỉ đọc), DA2-06 (thứ tự khóa kỳ → proposal → version → năm), DA2-07 (quyền theo
khóa), DA2-08 (test quyền/bỏ phát hành/resubmit), DA2-30 (Task 4 seed), DA2-31 (Verify đúng file, manifest). Finding không
sửa: không có. Riêng DA2-04 vế _báo Người duyệt chi khi mở kỳ_: theo QT 4.1 (thắng US) không báo — ghi câu tạm chọn.

## Tasks

### Task 1: migration hai bảng kỳ và trần

- Files: `prisma/models/budgets.prisma`, `prisma/migrations/<ts>_budget_cycles/migration.sql` (CHECK hạn, CHECK tổng, FK,
  unique, quyền runtime role), `test/integration/budgets/budget-cycle-constraints.integration-spec.ts` (mới).
- Depends on: none.
- Acceptance: bảng, ràng buộc như spec (gồm `first_published_at`, `published_total_minor`); quyền runtime theo mẫu
  migration gần đây; DB từ chối hạn duyệt < hạn nộp và `total_minor` sai.
- Verify: `pnpm db:migrate:deploy` trên DB test; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/budgets/budget-cycle-constraints.integration-spec.ts`.

### Task 2: capability `budgets/cycle/` — mở, sửa, chia trần, phát hành, đọc

- Files: `src/modules/budgets/cycle/*` (controller, dto, `cycle.service.ts`, `cycle.policy.ts` + spec, repo), `budgets.module.ts`,
  lỗi + http-errors, notifier mã mới (`notifications/public/notifications.types.ts`, `notifications/inbox/inbox.policy.ts`),
  README `budgets`, `test/support/api-coverage-manifest.ts`, `test/support/budget-harness.ts` (helper mở + phát hành kỳ),
  `test/http/budgets/budget-cycles.http-spec.ts` (mới), `test/integration/budgets/budget-cycle-publish.integration-spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: test matrix R-I03, AC-10, quyền đọc, R-I04, QT 4.3, AC-8, AC-15, AC-1, B7, concurrency.
- Verify: `pnpm exec jest src/modules/budgets/cycle`; `pnpm test:http -- test/http/budgets/budget-cycles.http-spec.ts`;
  `pnpm test:integration -- test/integration/budgets/budget-cycle-publish.integration-spec.ts`.

### Task 3: nộp `BM-10` cần kỳ đã từng phát hành; quyền theo khóa tham số; test hiện có

- Files: `budgets/proposal/proposal-sender.service.ts` (+ spec), `operating-parameters/{operating-parameters.controller.ts,
parameter-change.service.ts, parameter-definitions.policy.ts}` (+ spec), `test/support/builders/budget.builder.ts`; fixture
  có kỳ đã phát hành trong `test/integration/requests/{budget-proposals,budget-proposal-succession,budget-versions,
budget-decisions}.integration-spec.ts`, `test/flows/mf4-budget.flow-spec.ts`, `test/e2e/{budget-version,
department-without-head-journey}.e2e-spec.ts` (dùng helper của harness, không đổi khẳng định).
- Depends on: Task 2.
- Acceptance: test matrix Q-02, L1-19; test hiện có xanh, không nới khẳng định.
- Verify: `pnpm exec jest src/modules/budgets/proposal src/modules/operating-parameters`;
  `pnpm test:integration -- test/integration/requests/budget-proposals.integration-spec.ts test/integration/requests/budget-proposal-succession.integration-spec.ts test/integration/requests/budget-versions.integration-spec.ts test/integration/requests/budget-decisions.integration-spec.ts test/integration/operating-parameters/operating-parameters-http.integration-spec.ts`;
  `pnpm test:flows -- test/flows/mf4-budget.flow-spec.ts`;
  `pnpm test:e2e -- test/e2e/budget-version.e2e-spec.ts test/e2e/department-without-head-journey.e2e-spec.ts`.

### Task 4: seed `ops:seed` tối thiểu (DA2-30)

- Files: `src/cli/seed/steps/finance.steps.ts` (bước mở kỳ + PUT Trần + phát hành cho năm hiện tại và năm sau, chạy lại
  idempotent: kỳ có rồi thì bỏ qua), `src/cli/seed/fixture/shared-demo-v3/finance.ts` (Trần năm, Trần phòng, dự phòng kho),
  `src/cli/seed/fixture/shared-demo-v3.spec.ts`, `docs/guides/seed.md` (bước mới + hướng dẫn DB có dữ liệu cũ).
- Depends on: Task 3.
- Acceptance: test matrix _seed_; Trần năm đủ lớn để kiểm B4 của sibling không chặn dữ liệu demo.
- Verify: `pnpm exec jest src/cli/seed`;
  `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts`.

### Checkpoint

Kiểm tra nhanh tracker §4.5; `openapi:export` thêm 6 operation. Tự review diff.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                 | Revision / môi trường                                             | Kết quả thực chạy                                                                                                                      | Giới hạn / việc còn lại                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm exec jest src/modules/budgets/cycle src/cli/seed` (`cycle.policy.spec` 8 test: R-I04, QT 4.3, B7, người nhận thông báo)                                                                      | `feat/qd103-108-mf145` trên `aa1e56c1` + diff W2 `cycle-ceilings` | 116 test seed + policy xanh                                                                                                            | —                                                                                        |
| `pnpm test:integration -- test/integration/budgets/budget-cycle-constraints` (Task 1)                                                                                                              | PostgreSQL 17 riêng                                               | 6 test xanh                                                                                                                            | —                                                                                        |
| `pnpm test:integration -- test/integration/budgets/budget-cycle-publish` (R-I03, AC-10, quyền đọc, R-I04, QT 4.3, AC-8, AC-15, AC-1, B7, Q-02, L1-19)                                              | như trên                                                          | 13 test xanh                                                                                                                           | song song publish/PUT: chỉ kiểm tuần tự (khóa `FOR UPDATE` của kỳ), **chưa có test đua** |
| `pnpm test:integration` budgets + requests + operating-parameters + organization + installation/seed + notifications + identity-access + catalog/shared-pool + licensing/subscription-renewal-pool | như trên                                                          | 202 file: 194 xanh, 8 đỏ do tải (`TransientDatabaseError` 503, "template"); chạy lại riêng 8 file `--maxWorkers=3`: 8/8 xanh (55 test) | —                                                                                        |
| `pnpm test:integration -- test/integration/installation/seed` (seed trên DB sạch, chạy lại không đổi)                                                                                              | như trên                                                          | 4 file / 16 test xanh                                                                                                                  | —                                                                                        |
| `pnpm test:http` platform, budgets, operating-parameters, catalog, data-import                                                                                                                     | như trên                                                          | xanh (operating-parameters 37 test gồm ca Finance 403 và khóa Finance)                                                                 | —                                                                                        |
| `pnpm test:e2e`                                                                                                                                                                                    | như trên                                                          | 11 file / 50 test xanh                                                                                                                 | —                                                                                        |
| `pnpm test:flows -- mf1-request-contract mf4-budget`                                                                                                                                               | như trên                                                          | 2 file / 18 test xanh                                                                                                                  | các flow khác chưa chạy                                                                  |
| typecheck, lint, `arch:check`, `arch:docs:check`, `rules:check`, `test:gates`                                                                                                                      | như trên                                                          | xanh (gates 16 file / 330 test; cập nhật chủ model, mã thông báo, catalog mã lỗi, ngoại lệ presentation, manifest)                     | —                                                                                        |
| `pnpm openapi:export`                                                                                                                                                                              | như trên                                                          | thêm 6 operation, lỗi mới, mã thông báo; `openapi.json` đã sinh lại                                                                    | —                                                                                        |

- [x] AC trong scope có bằng chứng (trừ đua đồng thời — xem dòng trên).
- [x] Spec/plan phản ánh implementation cuối.
- [x] `pnpm check`, `test:integration:serial`, `test:scripts` và toàn bộ suite CHƯA chạy.

### Lệch so với thiết kế

1. Hai bảng không khai quan hệ Prisma tới Organization/Employee/Department (chỉ FK SQL).
2. Thêm `OrganizationReadApi.getActiveDepartmentIds(tx?)`; `ceilingDepartments` ở `CycleService` (chưa có hàm riêng ở `cycle.policy`).
3. `budgetCycleList` phân trang, trả bản tóm tắt không kèm chia Trần; `budgetCycleGet` trả `ceilings` dạng bản đồ theo `departmentId` — để khỏi thêm ngoại lệ vào sổ collection/mảng lồng đã đóng băng.
4. Người nhận `BUDGET_CYCLE_OPENED`: trưởng phòng hiện tại của từng phòng trong tập; `eventKey` kèm id người nhận.
5. Quyền theo khóa tham số: `owner?` ở định nghĩa; `PUT`/`GET`/history cho cả Super Admin và Finance, service/controller kiểm theo `owner`; Finance gọi khóa của Super Admin ⟹ 403, đọc danh sách chỉ thấy khóa Finance.
6. Seed: bước `budget.cycles` (mở, chia đều Trần cho mọi phòng đang hoạt động đọc qua `/departments`, phát hành) trước `budget.year`; fixture `cycle` mới.
7. Test harness: `BudgetHarness.start` phát hành sẵn kỳ cho 4 năm bằng SQL (`publishedCycle`); các spec khác không đổi khẳng định.
8. `docs/generated/module-graph.md` sinh lại.

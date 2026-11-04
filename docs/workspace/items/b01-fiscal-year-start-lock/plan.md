# Plan: b01-fiscal-year-start-lock — khóa đổi tháng bắt đầu năm tài chính khi đã có phiên bản ngân sách

- [Spec](spec.md); revision đầu vào: Docs `d6d868c`, BE `6eb12d1`.
- Phụ trách: AI implementer (Dev B `B-01`). Thiết kế ban đầu bởi: AI implementer theo DEV-B/README audit 31/10/2026.
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `in-progress` (code và test của hạng mục xong; chưa `verified` vì còn bước của coordinator ở cuối bảng
  Verification). PR: chưa có (thay đổi chưa commit, cùng cây làm việc với ba hạng mục song song của Dev B).

## Before coding

- Đã đọc AGENTS.md, rules `api-contract`, `module-structure`, `database-business`, `security-jobs`, `work-item-sizing`,
  ADR-0019; `US-01-04` (EP-01, Docs `d6d868c`: AC-8, bảng tham số, Postconditions); spec khung `g2-downstream-integration`;
  source `operating-parameters.*`, `budget-year-lock.repo.ts`, `version-creation.service.ts`, `organization.extension-points.ts`
  (mẫu `Contributions`), cổng `extension-wiring` và `module-graph`.
- Hiện trạng trước khi sửa: **chưa có khóa nào**. `OperatingParametersApi.set` đổi `FISCAL_YEAR_START_MONTH` không hỏi ai;
  `VersionCreationService` đọc tháng **ngoài** transaction (`BudgetFactsService.fiscalYearStartMonth`). Chỉ có khóa năm ngân sách
  theo (Cost Center, năm), không phục vụ bất biến toàn cục này.
- Môi trường: PostgreSQL Docker `slm-test-db` (127.0.0.1:55432), mỗi file integration một database riêng; không `.env`, không DB dev.
  Không migration.
- Dependency: không.

## Tasks

### Task 1: điểm mở và guard trong operating-parameters

- Files: `src/modules/operating-parameters/public/operating-parameters.extension-points.ts`, `operating-parameters.errors.ts`,
  `operating-parameters.http-errors.ts`, `operating-parameters.controller.ts`, `operating-parameters.repo.ts` (`holdKey`),
  `public/operating-parameters.api.ts` (`holdValue`; bỏ `set`), `parameter-change.service.ts` (mới, nhận `set`),
  `parameter-definitions.policy.ts` (`effectiveValues`), `operating-parameters.module.ts`, `operating-parameters-http.module.ts`,
  `test/support/openapi-example-route-codes-operating-parameters.ts`, `src/modules/operating-parameters/README.md`.
- Depends on: none.
- Acceptance: `set` hỏi reader của đúng key sau bước "cùng giá trị thì không ghi" và trước mọi lệnh ghi; lý do → 409
  `PARAMETER.LOCKED`; không truy vấn bảng budgets, không import tầng trên; graph worker/CLI không cần ngoại lệ `extension-wiring`.
- Verify: `pnpm exec jest src/modules/operating-parameters` → xanh; `pnpm exec eslint`, `pnpm arch:check` → xanh.

### Task 2: reader của budgets và đọc tháng trong transaction tạo phiên bản

- Files: `src/modules/budgets/version/fiscal-year-start-lock.listener.ts`, `…listener.spec.ts`,
  `src/modules/budgets/budget/version.repo.ts` (`anyExists`), `budget-facts.service.ts` (`holdFiscalYearStartMonth`),
  `src/modules/budgets/version/version-creation.service.ts`, `budgets.module.ts`, `src/modules/budgets/README.md`.
- Depends on: Task 1.
- Acceptance: reader trả `BUDGET_VERSION_EXISTS` khi có bất kỳ `budget_versions`; `createFromProposal` lấy khóa chia sẻ của key
  đầu transaction và đọc tháng trong đó; không đổi lỗi/hành vi thành công khác của tạo phiên bản.
- Verify: `pnpm exec jest src/modules/budgets`; integration `budget-lifecycle-guards`, `budget-version-history` vẫn xanh.

### Task 3: test tái hiện trên PostgreSQL thật

- Files: `test/integration/budgets/fiscal-year-start-lock.integration-spec.ts`,
  `…-race-creation-first.integration-spec.ts`, `…-race-change-first.integration-spec.ts`,
  `test/support/fiscal-year-start-lock-harness.ts`.
- Depends on: Task 1, Task 2.
- Acceptance: theo ma trận trong spec; hai thứ tự race tách file vì phiên bản không xóa được (`budget_version_decisions` append-only).
  Thứ tự cố định bằng khóa dòng giữ ở kết nối riêng + `waitForLockWaiters`, không `sleep`.
- Verify: từng file `jest --config ./test/config/jest.integration.cjs --runInBand <file>` với `TEST_DATABASE_ADMIN_URL` của
  `slm-test-db`.

### Checkpoint

Sau Task 3: unit, lint, format, `arch:check`, gates liên quan, integration của hạng mục; tự review diff theo spec.

## Verification and handoff

Revision: BE `6eb12d1` + cây làm việc chưa commit, Node 24 (`NODE_OPTIONS=--no-experimental-strip-types`), Docker PostgreSQL 17.

| Lệnh / kiểm tra AC                                                                                                     | Kết quả thực chạy                                                                                                                                                                                                                                                                                                                                                    | Giới hạn / việc còn lại                                               |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm exec jest` (toàn bộ unit, gồm `parameter-lock.spec.ts` 8 test, `fiscal-year-start-lock.listener.spec.ts` 3 test) | 291 suite, 4069 test đạt                                                                                                                                                                                                                                                                                                                                             | gồm cả file đang sửa của hạng mục song song                           |
| `pnpm exec eslint` (operating-parameters, budgets, test/integration/budgets, harness, manifest)                        | đạt                                                                                                                                                                                                                                                                                                                                                                  | —                                                                     |
| `pnpm arch:check`                                                                                                      | đạt, 0 vi phạm                                                                                                                                                                                                                                                                                                                                                       | —                                                                     |
| `pnpm exec tsc --noEmit`                                                                                               | file của hạng mục không lỗi; lỗi còn lại ở `src/modules/requests` và `test/integration/requests` (hạng mục B-02/B-03/B-04 đang sửa)                                                                                                                                                                                                                                  | chạy lại trên cây tích hợp                                            |
| gates `extension-wiring`, `module-layout`, `capability-graph`, `architecture-boundaries`, `lint-debt`                  | đạt                                                                                                                                                                                                                                                                                                                                                                  | —                                                                     |
| gate `module-graph` (R10)                                                                                              | **đỏ có chủ đích** khi chưa thêm `'OperatingParametersModule: ParameterLockContributions'` vào `PUBLIC_CONTRACT_EXPORTS`; với dòng đó trên bản sao tạm của gate: 37/37 đạt                                                                                                                                                                                           | coordinator thêm một dòng vào `test/gates/module-graph.gate-spec.ts`  |
| integration `fiscal-year-start-lock` (7 test)                                                                          | 7/7 đạt                                                                                                                                                                                                                                                                                                                                                              | —                                                                     |
| integration `fiscal-year-start-lock-race-creation-first` (1 test)                                                      | 1/1 đạt                                                                                                                                                                                                                                                                                                                                                              | —                                                                     |
| integration `fiscal-year-start-lock-race-change-first` (1 test)                                                        | 1/1 đạt                                                                                                                                                                                                                                                                                                                                                              | —                                                                     |
| đột biến A: tạo phiên bản đọc tháng bằng `getValue` (không khóa chia sẻ)                                               | `race-creation-first` đỏ (đổi tháng không chờ: "Fewer than 2 backends reached a lock wait")                                                                                                                                                                                                                                                                          | đã khôi phục mã                                                       |
| đột biến B: reader luôn trả "tự do"                                                                                    | `fiscal-year-start-lock` đỏ 4/7 (không 409, giá trị/audit đổi)                                                                                                                                                                                                                                                                                                       | đã khôi phục mã                                                       |
| hồi quy: integration `operating-parameters-http` (25), `budget-lifecycle-guards` (15), `budget-version-history` (12)   | đạt                                                                                                                                                                                                                                                                                                                                                                  | không chạy toàn bộ integration (coordinator chạy cuối)                |
| `pnpm test:http` thư mục `operating-parameters` (34); thư mục `platform`                                               | `operating-parameters` 34/34 đạt; `platform` 6 test đỏ: `api-inventory`, `openapi-presentation`, `openapi-export`, `openapi-response-examples` — các chênh lệch nêu route/operation của hạng mục song song (`assessmentQueueList`, `meAccessRequestList`) và `openapi.json` chưa xuất lại; không có chênh lệch riêng của `operatingParameterSet` ở bảng mã lỗi route | coordinator xuất lại `openapi.json` sau khi gộp                       |
| `pnpm openapi:export`, `pnpm arch:routes`, `pnpm arch:graph`, `pnpm arch:docs:check`, drift migration                  | **chưa chạy** (thuộc coordinator)                                                                                                                                                                                                                                                                                                                                    | thêm mã 409 vào `operatingParameterSet`; điểm mở mới vào module-graph |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; module card cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; roadmap, `openapi.json`, artefact sinh và gate `module-graph` do coordinator; PR chưa có.

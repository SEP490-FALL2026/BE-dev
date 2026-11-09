# Plan: qd103-calendar-fiscal-year

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `b9854ef5`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W1, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `verified` (kiểm local 08/11/2026, chat code; commit cục bộ, chưa push). PR: chưa có.

## Before coding

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/database-business.md`, `docs/rules/operational-commands.md` (seed). Grep
danh sách nơi gọi: `grep -rln "fiscalYearOf\|fiscalYearEndOf\|fiscalYearStartMonth\|FISCAL_YEAR_START_MONTH\|effectiveEndOf\|termLimitOf\|endsBy" src test`.

## Design review

Audit thiết kế bằng subagent chỉ-đọc (cổng tracker §3, chạy bù), 08/11/2026: **ĐẠT** — chỉ 5 finding Thấp (DA1-14…DA1-18),
đã sửa: thêm file khóa tham số/test race vào Task 3, lịch sử key đã bỏ trả 404, câu đóng _mọi_ giá trị + `RAISE NOTICE`,
test migration tự động, thứ tự làm trước `qd103-shared-pool-subscription`.

## Tasks

### Task 1: migration đóng giá trị tham số cũ

- Files: `prisma/migrations/<ts>_drop_fiscal_year_start_month/migration.sql`.
- Depends on: none.
- Acceptance: dòng `parameter_values` key `FISCAL_YEAR_START_MONTH` còn mở bị đóng; không xóa dòng.
- Verify: `pnpm prisma migrate deploy` trên DB test theo `test/README.md` → thành công; truy vấn kiểm `valid_to` không null.

### Task 2: primitive năm dương lịch và thời hạn không cắt

- Files: `src/core/fiscal-year.ts`, `src/core/term-limit.ts` (+ spec).
- Depends on: none.
- Acceptance: test matrix dòng R-I01, R-D03; `TermLimit` không còn `endsBy`.
- Verify: `pnpm exec jest src/core/fiscal-year.spec.ts src/core/term-limit.spec.ts` → đỏ trước (kỳ vọng mới), xanh sau.

### Task 3: bỏ tham số và listener khóa, cập nhật mọi nơi gọi

- Files: `operating-parameters/parameter-definitions.policy.ts` (+ spec, `parameter-lock.spec.ts`), xóa
  `budgets/version/fiscal-year-start-lock.listener*.ts`, `test/support/fiscal-year-start-lock-harness.ts`, `test/integration/budgets/fiscal-year-start-lock{,-race-change-first,-race-creation-first}.integration-spec.ts`,
  `operating-parameters/public/operating-parameters.extension-points.ts` (`holdValue`/`lockKey`/`holdKey`, lỗi `PARAMETER.LOCKED` nếu không còn key dùng),
  `requests/draft/request-drafts.controller.ts` (mô tả `endsBy`), `test/gates/module-graph.gate-spec.ts` nếu đồ thị đổi, `budgets.module.ts`;
  nơi gọi ở `budgets/*`, `requests/*`, `licensing/provisioning/tasks/*`, `src/cli/seed/seed-calendar.ts`, `seed-run.ts`; lỗi
  `access-request.errors.ts`, `group-request.errors.ts` (+ http-errors, DTO ví dụ).
- Depends on: Task 2.
- Acceptance: grep DoD rỗng; test HTTP tham số (key không còn).
- Verify: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`; jest theo file đã đổi; `pnpm test:integration` cho
  `test/integration/operating-parameters/operating-parameters-http.integration-spec.ts`,
  `test/integration/requests/access-request-pricing.integration-spec.ts`, `test/integration/licensing/renewal-request.integration-spec.ts`,
  `test/integration/licensing/provisioning-grant-http.integration-spec.ts`, `test/integration/requests/group-request-edge.integration-spec.ts`.

### Checkpoint

Kiểm tra nhanh tracker §4.5: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`,
`pnpm openapi:export` (drift chỉ là key/ví dụ đã ghi). Tự review diff theo spec.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                             | Revision / môi trường                                  | Kết quả thực chạy                                                                                                                                                             | Giới hạn / việc còn lại                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec jest src/core/fiscal-year.spec.ts src/core/term-limit.spec.ts` (R-I01, R-D03)                                                                                                                                                                                       | nhánh `feat/qd103-108-mf145` trên `b9854ef5` + diff W1 | 2 file, 12 test xanh                                                                                                                                                          | —                                                                                                                              |
| `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`                                                                                                                                                                                                           | như trên                                               | xanh (arch: 1809 module, 0 vi phạm; rules: 0 lỗi)                                                                                                                             | —                                                                                                                              |
| `pnpm test:gates`                                                                                                                                                                                                                                                              | như trên                                               | 16 file / 330 test xanh (đã cập nhật `module-graph` gate và registry ngoại lệ collection)                                                                                     | —                                                                                                                              |
| `pnpm openapi:export`                                                                                                                                                                                                                                                          | như trên                                               | drift chỉ ở `operatingParameterSet` (bỏ 409 `PARAMETER.LOCKED`), `accessRequestDraftSubmit`/`groupRequestSubmit` (bỏ `endsBy`), `PreviewResponseDto`, `GroupCheckResponseDto` | `openapi.json` đã sinh lại                                                                                                     |
| `pnpm arch:graph`                                                                                                                                                                                                                                                              | như trên                                               | `docs/generated/module-graph.md` sinh lại (bỏ extension point khóa tham số)                                                                                                   | —                                                                                                                              |
| jest theo thư mục: `src/core src/modules/{catalog,budgets,operating-parameters,requests,licensing} src/cli`                                                                                                                                                                    | như trên                                               | 165 file / 2412 test xanh                                                                                                                                                     | một lượt `pnpm exec jest` đầy đủ đã chạy sớm trong W1 (375 file / 4885 xanh) trước phần thuê bao — **không** phải `pnpm check` |
| `pnpm test:integration` (PostgreSQL 17 riêng, `127.0.0.1:55432`): `operating-parameters-http` (27 test, gồm migration đóng giá trị mở + `…/FISCAL_YEAR_START_MONTH/history` 404), `access-request-pricing`, `renewal-request`, `provisioning-grant-http`, `group-request-edge` | như trên                                               | xanh                                                                                                                                                                          | —                                                                                                                              |
| `pnpm test:integration` theo thư mục `catalog licensing data-import operating-parameters` + 2 file requests                                                                                                                                                                    | như trên (sau khi chuyển nhóm `pool/`)                 | 88 file / 1044 test xanh                                                                                                                                                      | —                                                                                                                              |
| `pnpm test:http` `catalog data-import operating-parameters platform`; `pnpm test:e2e`                                                                                                                                                                                          | như trên                                               | http 27 file xanh; e2e 11 file / 50 test xanh                                                                                                                                 | —                                                                                                                              |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan phản ánh implementation cuối.
- [x] Diff cuối đã tự review; `pnpm check`, `test:flows`, `test:integration:serial`, `test:scripts` và toàn bộ suite CHƯA chạy (ghi rõ).

### Lệch so với thiết kế

- Gỡ cả extension point khóa tham số (`operating-parameters.extension-points.ts`, `holdValue`/`lockKey`/`holdKey`, lỗi `ParameterLockedError`, mã 409 `PARAMETER.LOCKED`, `parameter-lock.spec.ts`) — đúng spec §7: không còn key nào dùng.
- `VersionRepo.anyExists` bỏ (chỉ listener khóa dùng).
- `VersionAccessService.begin` trả `void` (không còn tháng bắt đầu để trả).
- `RequestFactsService.termCheck` không còn đọc catalog (`allowsMidTermReduction` thôi dùng cho thời hạn), trở thành hàm đồng bộ.
- `RenewalSeatFactsService.isFlexible` bỏ (không còn nơi gọi).

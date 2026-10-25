# Plan: thông báo biến động nhân sự của trưởng phòng và IT Admin xác minh, ghi sự kiện kèm căn cứ

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (24/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (24/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, uncommitted). PR: chưa có.

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, [module structure](../../../rules/module-structure.md), [API contract](../../../rules/api-contract.md), spec của `g6-transfer-record`, `g6-long-leave`, `g6-offboarding-record` (các biến thể `recordInTx`, `startInTx`), và mã `operating-parameters/parameter-definitions.ts` ở BE `7920ee5`. Đối chiếu: chưa có bảng thông báo; `getItAdminInCharge` đã có ở `organization`; vai `MANAGER` suy ra từ giai đoạn trưởng phòng. Ba hạng mục sự kiện phải xong trước. Migration `20261024230000_personnel_notices` (tên tạm ban đầu `089000`) là task riêng đi trước mã dùng nó.

## Tasks

### Task 1: thiết kế `ready` (xong)

- Files: `spec.md`, `plan.md`, `docs/roadmap.md` (scope map G6 do người tích hợp dán)
- Depends on: none
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu và tham số (xong)

- Files: `prisma/migrations/20261024230000_personnel_notices/migration.sql`, `prisma/models/personnel.prisma` (và hai khóa ngoại ngược ở `organization.prisma`), `src/modules/operating-parameters/parameter-definitions.ts`, `parameter-definitions.spec.ts`, `PRISMA_MODEL_OWNER` ở `architecture-boundaries.spec.ts`
- Depends on: Task 1, `g6-transfer-record`, `g6-long-leave`, `g6-offboarding-record`
- Acceptance: sequence mã, ba enum, `personnel_notices` (unique một phần thông báo chờ, `CHECK` trạng thái), `personnel_notice_verifications` chỉ thêm, cột `notice_id` unique ở ba bảng sự kiện; khóa tham số `PERSONNEL_NOTICE_REVIEW_WORKING_DAYS`
- Verify: nhóm test _what the database refuses_ (`23505`, `23514`, `55000`) xanh; test định nghĩa tham số xanh; `pnpm prisma:validate`; `migrate diff --exit-code` = 0 trên CSDL kiểm thử riêng

### Task 3: quy tắc thuần (xong)

- Files: `src/modules/personnel/notice/notice.policy.ts` (+ spec)
- Depends on: Task 1
- Acceptance: ai gửi loại nào, trường bắt buộc, trùng thông báo chờ, căn cứ không phải mã thông báo, vòng đời; mã lý do ngữ nghĩa
- Verify: unit test đủ bảng ca xanh; `policy-ownership.spec.ts` xanh

### Task 4: gửi, rút, hàng đợi (xong)

- Files: `personnel/notice/notice.service.ts`, `notice-query.service.ts`, `notice.repo.ts`, `notice-overdue.service.ts`, `notice-overdue.sweeper.ts`, `notice.mapper.ts`, `personnel.module.ts`
- Depends on: Task 2, Task 3
- Acceptance: gửi theo đúng vai và phòng, mã `BM09-…`, IT Admin phụ trách mặc định, hạn chốt lúc tạo, rút, nhắc quá hạn một lần, thông báo không đụng dữ liệu nhân sự; AC-1→AC-9 của `US-03-10`
- Verify: integration PostgreSQL của các AC đó xanh

### Task 5: từ chối, ghi, gắn và API (xong)

- Files: `notice-handling.service.ts`, `notice-recorder.registry.ts`, `notice.controller.ts`, `notice.dto.ts`, `notice.http-errors.ts`, `transfer/transfer-notice.recorder.ts`, `leave/leave-notice.recorder.ts`, `offboarding/offboarding-notice.recorder.ts`, `noticeId` ở `transfer.service.ts`, `leave.service.ts`, `offboarding.service.ts` và ba repo, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`, `test/e2e/personnel-notices.e2e-spec.ts`
- Depends on: Task 4
- Acceptance: từ chối có lý do, ghi đường A trong một transaction với bản ghi xác minh và căn cứ, lỗi quy tắc sự kiện làm lùi cả lệnh, gắn sự kiện đang có, đường B không tạo thông báo; `403` đúng vai; AC-1→AC-9 của `US-03-11`
- Verify: integration PostgreSQL và e2e của các AC đó xanh; `pnpm openapi:export` không lệch; test đếm câu lệnh xanh

### Checkpoint (xong)

Gate xanh trên cây làm việc (`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên CSDL riêng), tự review diff theo AC; FE được báo bảy route mới và mã thông báo (ghi ở mục _Như đã xây và khác biệt_ của spec).

## Verification and handoff

Chạy từ gốc BE theo [CONTRIBUTING](../../../../CONTRIBUTING.md) và [test guide](../../../../test/README.md): `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` (CSDL riêng), `pnpm openapi:export`.

| Lệnh / kiểm tra AC                                                                                                                        | Revision / môi trường                                                                                                                                      | Kết quả thực chạy                                                                                                                                                                                                                                                                                                                                     | Giới hạn / việc còn lại                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`, `pnpm lint`                                                                                                             | cây làm việc local, chưa commit (BE `7920ee5` cộng thay đổi G5/G6 chưa commit)                                                                             | xanh                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                 |
| `pnpm exec jest --runInBand`                                                                                                              | như trên                                                                                                                                                   | 196 suite, 3067 ca xanh (mới: `notice.policy.spec.ts` 38 ca; cổng kiến trúc, `module-graph`, `policy-ownership`, `api-collection-contract` xanh)                                                                                                                                                                                                      | —                                                                                                                                                                                 |
| `pnpm openapi:export` rồi `pnpm test:e2e`                                                                                                 | như trên, 286 thao tác                                                                                                                                     | 42 suite, 1061 ca xanh; mới: `personnel-notices.e2e-spec.ts` 29 ca (`401`, `403` theo vai, `422`); kiểm kê 286; `openapi-export` và `api-inventory` xanh                                                                                                                                                                                              | `pnpm openapi:export` trên Node 24 cần `NODE_OPTIONS=--no-experimental-strip-types`                                                                                               |
| Tích hợp của hạng mục (PostgreSQL thật, CSDL riêng)                                                                                       | như trên                                                                                                                                                   | 3 suite, 50 ca xanh: `personnel-notice-send` (24), `personnel-notice-record` (20), `personnel-notice-integrity` (6)                                                                                                                                                                                                                                   | test viết cùng mã, không đỏ-trước; chưa có test đồng thời riêng cho hai IT Admin ghi cùng một thông báo                                                                           |
| Tích hợp hồi quy                                                                                                                          | như trên, chạy sau sửa mã cuối                                                                                                                             | 20 suite, 247 ca xanh (cùng 3 suite trên, điều chuyển `department-transfer-*`, nghỉ dài `long-leave-*`, nghỉ việc `offboarding-*`, `transfer-review-*`, `leaver-request-closure`, `operating-parameters-http`); thêm 6 suite, 58 ca xanh: `inspect`, `dev-seed`, `recovery-cli`, `organization-identity-read-contracts`, `department-transfer-record` | hai ca cũ được sửa cho khớp (số tham số 17 → 18; `long-leave-start` không còn cấm mọi bảng tên `verification`); không chạy toàn bộ tích hợp, người điều phối chạy một lần cuối G6 |
| Drift migration                                                                                                                           | CSDL tạm trong container test, `prisma migrate deploy` rồi `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`, rồi xóa CSDL tạm | không lệch (`No difference detected`); lần đầu lệch khóa ngoại `target_department_id` (mặc định Prisma là `SetNull`), đã thêm `onDelete: Restrict` ở schema cho khớp migration                                                                                                                                                                        | —                                                                                                                                                                                 |
| `pnpm prisma:validate`                                                                                                                    | như trên                                                                                                                                                   | xanh                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                 |
| `pnpm rules:check`, `pnpm rules:test`, `pnpm rules:format`, `pnpm format:check`, `pnpm test:scripts`, `pnpm test:discovery`, `pnpm build` | như trên                                                                                                                                                   | xanh (`rules:check`: 273 file, 0 lỗi; `rules:test` 30 ca; `test:discovery`: 196 unit, 42 e2e, 208 tích hợp; `pnpm build` thoát 0)                                                                                                                                                                                                                     | —                                                                                                                                                                                 |

- [x] AC trong scope có bằng chứng (bảng test của spec); lỗi đã xử lý hoặc ghi blocker (hộp thông báo chờ `g4-notification-delivery`).
- [x] Spec/plan/test design phản ánh đúng implementation cuối (mục _Như đã xây và khác biệt_ của spec); chưa có peer review.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (`docs/rules/security-jobs.md`, `ARCHITECTURE.md`, `AGENTS.md`, `test/README.md`); phần chưa kiểm chứng ghi rõ trong spec.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

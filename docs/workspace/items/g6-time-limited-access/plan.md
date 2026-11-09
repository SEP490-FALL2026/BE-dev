# Plan: quyền có thời hạn: nhắc trước hạn, hàng đợi IT và thu hồi khi hết hạn

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (24/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (24/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, uncommitted). PR: chưa có.

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, [module structure](../../../rules/module-structure.md), [database rules](../../../rules/database-business.md), spec của `g6-revocation-by-grant-kind` và `g6-handover-confirmation`, mã `licensing/assignment` và migration `20261020190100_licensing_assignments` (trigger `INV-07`) và mẫu sweeper `catalog/contract/document-expiry.job.ts` ở BE `7920ee5`. Đối chiếu: `expected_end_date` đã có ở `license_assignments`; chưa có hàng đợi hết hạn, chưa có nhắc, chưa có cổng đọc gia hạn; `g5-return-and-renewal-requests` còn khung nên cổng đọc gia hạn dùng bản giả ở test. Hai hạng mục phụ thuộc phải xong trước. Migration `20261024088000_licensing_expiry_reminders` (tạm thời) là task riêng đi trước mã dùng nó.

## Tasks

### Task 1: thiết kế `ready` (xong)

- Files: `spec.md`, `plan.md`, `docs/roadmap.md` (scope map G6 do người tích hợp dán)
- Depends on: none
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu (xong)

- Files: `prisma/migrations/20261024220000_licensing_expiry_reminders/migration.sql`, `prisma/models/licensing.prisma`
- Depends on: Task 1, `g6-revocation-by-grant-kind`
- Acceptance: enum đối tượng nhắc, bảng nhắc unique `(assignment_id, expected_end_date, audience)`, chỉ thêm
- Verify: nhóm test _what the database refuses_ (`23505`, `55000`) xanh; `pnpm prisma:validate`; `migrate diff --exit-code` = 0 trên CSDL kiểm thử riêng

### Task 3: quy tắc thuần (xong)

- Files: `src/modules/licensing/expiry/expiry.policy.ts` (+ spec)
- Depends on: Task 1
- Acceptance: hết hạn khi `hôm nay > expected_end_date`, cửa sổ nhắc 7 ngày, nợ quá 7 ngày, gia hạn nào còn tính, trạng thái hàng đợi, chuỗi tháng liên tiếp; mã lý do ngữ nghĩa
- Verify: unit test đủ bảng ca xanh; `policy-ownership.spec.ts` xanh

### Task 4: nhắc và sweeper (xong)

- Files: `expiry/expiry-reminder.service.ts`, `expiry-reminder.sweeper.ts`, `expiry-reminder.repo.ts`, `licensing.module.ts`
- Depends on: Task 2, Task 3
- Acceptance: tối đa ba dòng nhắc idempotent mỗi `(Assignment, ngày kết thúc)`, không dòng cho trưởng phòng khi phòng thiếu trưởng phòng, audit mang hai lựa chọn
- Verify: integration PostgreSQL của AC-1, AC-10 xanh

### Task 5: hàng đợi, mở thu hồi, cổng đọc gia hạn (xong)

- Files: `expiry/expiry-queue.service.ts`, `expiry-queue.repo.ts`, `expiry.controller.ts`, `expiry.dto.ts`, `expiry.http-errors.ts`, `licensing-renewal.types.ts` (`RenewalHold.pendingRenewalsOf`), `registered-renewal-hold.service.ts`, `requests/renewal-request` (`pendingOf`), `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 4, `g6-handover-confirmation`
- Acceptance: hàng đợi suy ra khi đọc với cờ nợ và trạng thái, `409` khi chưa hết hạn hay còn gia hạn chờ, mở thu hồi nguồn `TIME_LIMITED_EXPIRY` đúng, thất bại giữ Assignment, danh sách nhắc cho người nhận; AC-2, AC-6→AC-11
- Verify: integration PostgreSQL và e2e của các AC đó xanh; `pnpm openapi:export` không lệch; test đếm câu lệnh xanh

### Checkpoint (xong)

Gate xanh trên cây làm việc (`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên CSDL riêng), tự review diff theo AC; ghi cho `g5-return-and-renewal-requests` điểm gọi `RenewalHold.pendingRenewalsOf` (đã làm, không có `registerRenewalRequestReader` hay `getContinuousTermMonths`) và việc kết thúc Assignment cũ khi duyệt gia hạn (g5 đã làm).

## Verification and handoff

Chạy từ gốc BE theo [CONTRIBUTING](../../../../CONTRIBUTING.md) và [test guide](../../../../test/README.md): `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` (CSDL riêng), `pnpm openapi:export`.

| Lệnh / kiểm tra AC                                                                                | Revision / môi trường                                                                                                                                      | Kết quả thực chạy                                                                                                                                                                   | Giới hạn / việc còn lại                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`, `pnpm lint`                                                                     | cây làm việc local, chưa commit (BE `7920ee5` cộng thay đổi G5/G6 chưa commit)                                                                             | xanh                                                                                                                                                                                | —                                                                                                                                                                                  |
| `pnpm exec jest --runInBand`                                                                      | như trên                                                                                                                                                   | 195 suite, 3029 ca xanh (mới: `expiry.policy.spec.ts`; cổng kiến trúc, `module-graph`, `policy-ownership`, `api-collection-contract` xanh)                                          | —                                                                                                                                                                                  |
| `pnpm openapi:export` rồi `pnpm test:e2e`                                                         | như trên, 279 thao tác                                                                                                                                     | 41 suite, 1032 ca xanh; mới: `assignment-expiry.e2e-spec.ts` 17 ca (`401`, `403` cho Finance, trưởng phòng, Employee, `422`); kiểm kê 279; `openapi-export` và `api-inventory` xanh | `pnpm openapi:export` trên Node 24 cần `NODE_OPTIONS=--no-experimental-strip-types`; lần chạy đầu có một suite đỏ là test mới của hạng mục (401 viết sai), đã sửa và chạy lại xanh |
| Tích hợp của hạng mục (PostgreSQL thật, CSDL riêng)                                               | như trên                                                                                                                                                   | 2 suite, 21 ca xanh: `assignment-expiry-reminders` (9), `assignment-expiry-queue` (12)                                                                                              | test viết cùng mã, không đỏ-trước; không giả được đồng hồ `businessToday` (xem spec)                                                                                               |
| Tích hợp hồi quy                                                                                  | như trên, chạy sau sửa cuối                                                                                                                                | 4 suite, 63 ca xanh: `renewal-request`, `return-request`, `handover-duty-sources`, `provisioning-revocation-open` (cùng lần chạy với hai suite của hạng mục: 6 suite, 84 ca)        | không chạy toàn bộ tích hợp: chỉ các vùng đã chạm (cổng gia hạn `RenewalHold`, cổng thu hồi và bàn giao); bản chạy toàn bộ do người tích hợp chạy một lần ở cuối G6                |
| Drift migration                                                                                   | CSDL tạm trong container test, `prisma migrate deploy` rồi `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`, rồi xóa CSDL tạm | không lệch (`No difference detected`); lần đầu lệch tên hai chỉ mục (PostgreSQL cắt tên 63 ký tự), đã đổi tên trong migration cho khớp Prisma                                       | —                                                                                                                                                                                  |
| `pnpm prisma:validate`                                                                            | như trên                                                                                                                                                   | xanh                                                                                                                                                                                | —                                                                                                                                                                                  |
| `pnpm rules:check`, `pnpm rules:format`, `pnpm format:check`, `pnpm test:discovery`, `pnpm build` | như trên                                                                                                                                                   | xanh (`rules:check`: 273 file, 0 lỗi; `rules:format` và `format:check` xanh; `test:discovery`: 41 e2e, 205 tích hợp; `pnpm build` thoát 0)                                          | —                                                                                                                                                                                  |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (AC-3 bảng điều khiển chờ G8; AC-5 ở g5; nhắc trong hộp thông báo chờ `g4-notification-delivery`).
- [x] Spec/plan/test design phản ánh đúng implementation cuối (mục _Như đã xây và khác biệt_ của spec); chưa có peer review.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (`docs/rules/security-jobs.md`, `ARCHITECTURE.md`, `AGENTS.md`, `test/README.md`); phần chưa kiểm chứng ghi rõ trong spec.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

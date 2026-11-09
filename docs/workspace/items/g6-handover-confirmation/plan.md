# Plan: xác nhận bàn giao dữ liệu theo từng công cụ và bảng người xác nhận theo ca thu hồi

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (24/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (24/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, uncommitted). PR: chưa có.

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, [module structure](../../../rules/module-structure.md), [database rules](../../../rules/database-business.md) và mã `licensing/provisioning` (nhất là `RevocationHook` do `g6-revocation-by-grant-kind` thêm), `organization.service.ts` (`getDepartmentHeads`, `getItAdminInCharge`) ở BE `7920ee5`. Đối chiếu: `Plan.revocationNote`, `Plan.dataLossOnRemoval` đã có ở catalog; các tham số `HANDOVER_SHORT_DEADLINE_WORKING_DAYS`, `ABRUPT_DEPARTURE_HOLD_WORKING_DAYS` đã có trong `parameter-definitions.ts`; hàm ngày làm việc do `g6-transfer-record` thêm. Hai hạng mục đó phải xong trước. Migration `20261024082000_licensing_handover_duties` (tạm thời) là task riêng đi trước mã dùng nó.

## Tasks

### Task 1: thiết kế `ready`

- Status: `done`
- Files: `spec.md`, `plan.md`, `docs/roadmap.md` (scope map G6 do người tích hợp dán)
- Depends on: none
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu

- Status: `done`: tên thật `20261024150000_licensing_handover_duties` (thêm enum `HandoverConfirmedRole`, bỏ cột `requires_confirmation`, trigger đóng băng cả dòng đã xác nhận hoặc hủy); `handover-duty-constraints` xanh (`23505`, `23514`, `55000`), không drift.
- Files: `prisma/migrations/20261024082000_licensing_handover_duties/migration.sql`, `prisma/models/licensing.prisma`
- Depends on: Task 1, `g6-revocation-by-grant-kind`
- Acceptance: hai enum và bảng `handover_duties` với `CHECK` nhóm cột xác nhận, unique một phần cho dòng chưa xác nhận, trigger ghi một lần
- Verify: nhóm test _what the database refuses_ (`23505`, `23514`, `55000`) xanh; `pnpm prisma:validate`; `migrate diff --exit-code` = 0 trên CSDL kiểm thử riêng

### Task 3: bảng người xác nhận (chính sách thuần)

- Status: `done`: `handover-confirmer.policy.ts` và spec 33 ca (đủ 12 nguồn × mất dữ liệu, ca chồng lấn, hạn, người suy ra); lỗi riêng ở `handover/handover.errors.ts` thay cho `licensing.errors.ts` (đã 384 dòng) và kiểu public ở `licensing-handover.types.ts`; chính sách không dùng chung liên module nên không vào `PUBLIC_ROOT_POLICY_FILES`.
- Files: `src/modules/licensing/handover/handover-confirmer.policy.ts` (+ spec), `licensing.errors.ts`, `licensing.types.ts`
- Depends on: Task 1
- Acceptance: hàm trả vai, người hoặc `NO_HEAD`/`NO_SUCCESSOR`, cần xác nhận không, giá trị cho phép, hạn, cho mọi dòng 1→14 của bảng và ca chồng lấn; mã lý do ngữ nghĩa
- Verify: unit test đủ bảng ca xanh; `policy-ownership.spec.ts` xanh

### Task 4: dịch vụ mở, xác nhận, cổng giữ gỡ

- Status: `done` với khác biệt (xem spec): tách thành `handover-issue`, `handover`, `handover-confirmation`, `handover-view`, `handover-overdue`, `handover-revocation.hook` và hai repo; `RevocationHook.onOpened` thêm `actor`, `now`; hai hàm mới của `OrganizationHistoryService`.
- Files: `handover/handover.service.ts`, `handover.repo.ts`, `handover-view.service.ts`, `handover-duty.sweeper.ts`, `licensing.service.ts`, `licensing.module.ts`
- Depends on: Task 2, Task 3
- Acceptance: `openHandoverDuties`, `reconcile`, `cancelByCase`, `confirm` (vai tại thời điểm, ghi muộn), hook `onOpened`/`beforeWork`/`afterWork` (dùng lại xác nhận hợp lệ, đổi vai khi có ghost seat, giữ gỡ tới hạn, cờ), sweeper nhắc một lần
- Verify: integration PostgreSQL của AC-1→AC-10, AC-13, AC-16 (ma trận test) xanh

### Task 5: API

- Status: `done`: ba route, kiểm kê 244, e2e `handover-duties` (401, 422), ca `403`/`404`/`409` ở tích hợp; `HANDOVER.CONFIRMATION_PENDING` đi qua ánh xạ chung nên không sửa `provisioning.http-errors.ts`.
- Files: `handover/handover-duties.controller.ts`, `handover.dto.ts`, `handover.http-errors.ts`, `provisioning.http-errors.ts` (`HANDOVER.CONFIRMATION_PENDING`), `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 4
- Acceptance: ba route, người xác nhận chỉ thấy việc của mình, `IT_ADMIN` xem tất cả, `403` đúng ca, `409` giữ gỡ ở route tác vụ thu hồi
- Verify: e2e kiểm kê và `403` xanh; `pnpm openapi:export` không lệch; test đếm câu lệnh của danh sách

### Checkpoint

- Status: `done`: ghi cho `g6-offboarding-record`, `g6-transfer-tool-review`, `g6-time-limited-access` ở spec của từng hạng mục và ở phần _Cho hạng mục sau_ của spec này.

Gate xanh trên cây làm việc (`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên CSDL riêng), tự review diff theo AC; ghi cho `g6-offboarding-record`, `g6-transfer-tool-review`, `g6-time-limited-access` chữ ký `openHandoverDuties` và quy ước `dueOn`.

## Verification and handoff

Chạy từ gốc BE theo [CONTRIBUTING](../../../../CONTRIBUTING.md) và [test guide](../../../../test/README.md): `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` (CSDL riêng), `pnpm openapi:export`.

| Lệnh / kiểm tra AC                                           | Revision / môi trường                                                                                                                                                    | Kết quả thực chạy                                                                                                                                                                                                                                                                                                                                                                                                                                       | Giới hạn / việc còn lại                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                             | cây làm việc local, chưa commit (BE `7920ee5` cộng thay đổi G5/G6 chưa commit)                                                                                           | xanh                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                                                                                                                    |
| `pnpm lint`, `pnpm format:check`                             | như trên                                                                                                                                                                 | xanh                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                                                                                                                    |
| `pnpm exec jest --runInBand`                                 | như trên                                                                                                                                                                 | 187 suite, 2843 ca xanh (mới: `handover-confirmer.policy.spec.ts` 33 ca; cổng kiến trúc, `policy-ownership`, `api-collection-contract` xanh)                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                    |
| `pnpm openapi:export` rồi `pnpm test:e2e`                    | như trên, 244 thao tác                                                                                                                                                   | 34 suite, 882 ca xanh (mới: `handover-duties.e2e-spec.ts`; kiểm kê 244); `openapi.json` không lệch sau xuất lần hai                                                                                                                                                                                                                                                                                                                                     | một lần chạy đầu toàn bộ bị `app.e2e-spec.ts` quá 5 giây ở hai ca dựng `AppModule` nhiều lần khi máy đang bận; chạy lại cùng cây, không đổi mã: xanh |
| Tích hợp của hạng mục (PostgreSQL thật, CSDL riêng)          | như trên                                                                                                                                                                 | 5 suite, 41 ca xanh: `handover-duty-constraints` (6), `-departure` (7), `-successor` (5), `-sources` (19), `-read` (4)                                                                                                                                                                                                                                                                                                                                  | `US-07-09` AC-24 chờ quyết định gia hạn G8; các ca nguồn G5/G7/G8/G9 mới kiểm qua cổng bằng test, chưa có luồng thật                                 |
| Tích hợp hồi quy (14 suite, 230 ca)                          | như trên                                                                                                                                                                 | xanh: `provisioning-revocation-open`, `-complete`, `-read-contracts`, `-constraints` (hook đổi chữ ký, tám ca đổi nguồn), `return-request`, `-handover`, `-conditions`, `return-renewal-constraints` (hook của hoàn trả cùng hook mới), `department-transfer-record`, `-change`, `-integrity`, `departments-http` (hai hàm mới đọc giai đoạn trưởng phòng), `provisioning-queue-http`, `provisioning-failure-http` (claim và đóng thất bại đi qua hook) | không chạy toàn bộ tích hợp: người điều phối chạy một lần cuối G6                                                                                    |
| Drift migration                                              | CSDL tạm trong container test, `prisma migrate deploy` migration mới rồi `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`, rồi xóa CSDL tạm | không lệch (`No difference detected`)                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                    |
| `pnpm prisma:validate`, `pnpm build`, `pnpm test:discovery`  | như trên                                                                                                                                                                 | xanh (187 unit, 34 e2e, 185 tích hợp)                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                    |
| `pnpm rules:check`, `pnpm rules:format`, `pnpm format:check` | như trên                                                                                                                                                                 | xanh (`rules:check`: 273 tệp, 1940 liên kết, 0 lỗi; `rules:test` và `test:scripts` xanh)                                                                                                                                                                                                                                                                                                                                                                | —                                                                                                                                                    |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối (mục _Như đã xây và khác biệt_ của spec); chưa có peer review.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (`docs/rules/security-jobs.md`, ARCHITECTURE.md, `test/README.md`, AGENTS.md); phần chưa kiểm chứng ghi rõ trong spec.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

# Plan: thu hồi seat theo kiểu cấp và nhả chỗ sau khi tài khoản thật bị xóa

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (24/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (24/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, [module structure](../../../rules/module-structure.md), [database rules](../../../rules/database-business.md) và mã hiện có của `licensing/provisioning` (`ProvisioningTaskFrame`, `ProvisioningDecisionService`, `ProvisioningTaskRepo`, `ProvisioningCancellationService`) ở BE `7920ee5`. Đối chiếu: enum `ProvisioningTaskKind` đã có `REVOKE` nhưng chưa có mã nào tạo hay hoàn tất tác vụ đó; `request_id` đang `NOT NULL`; unique `(assignment_id, kind)` đang chặn tác vụ thu hồi mới sau thất bại. Hạng mục này đi trước `g5-return-and-renewal-requests`. Migration là task riêng đi trước mã dùng nó; dùng tên `20261024080000_licensing_revocation_tasks` (giữ nguyên: sau migration cuối `20261024060100`). Khi làm, hạng mục tách thêm ba file vì giới hạn 400 dòng (`provisioning-task.record.ts`, `provisioning-task.wire.ts`, `assignment-end.service.ts`) và đặt hai route mới ở `revocation-tasks.controller.ts`; khối `revocation` không mang mảng lý do vì mảng lồng mới cần quyết định Owner (xem spec).

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`, `docs/roadmap.md` (scope map G6 do người tích hợp dán)
- Depends on: none
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu

- Files: `prisma/migrations/20261024080000_licensing_revocation_tasks/migration.sql`, `prisma/models/licensing.prisma`, `src/architecture-boundaries.spec.ts` (nếu cần model owner)
- Depends on: Task 1
- Acceptance: ba enum mới; `request_id` nullable với `CHECK` gắn với `kind`; cột thu hồi và `CHECK` đồng bộ trạng thái; unique một phần thay unique `(assignment_id, kind)`; bảng `provisioning_task_reasons` bất biến
- Verify: nhóm test _what the database refuses_ (`23514`, `23505`, `55000`) xanh; `pnpm prisma:validate`; `migrate diff --exit-code` = 0 trên CSDL kiểm thử riêng

### Task 3: quy tắc thuần

- Files: `src/modules/licensing/provisioning/revocation.policy.ts` (+ spec), `licensing.errors.ts`, `licensing.types.ts`
- Depends on: Task 1
- Acceptance: nguồn hợp lệ, kiểu cấp được phép, completion hợp lệ theo kiểu, mốc kết thúc K1, quy tắc tự thu hồi; mọi lý do là mã ngữ nghĩa
- Verify: unit test của policy xanh (bảng ca ở ma trận test); `policy-ownership.spec.ts` xanh

### Task 4: đọc catalog và repo

- Files: `catalog.service.ts`, `catalog/plan/plan-lookup.service.ts`, `catalog.types.ts`, `provisioning-task.repo.ts`, `assignment.repo.ts`
- Depends on: Task 2
- Acceptance: `getPlanRevocationInfo` theo lô (một câu lệnh); repo đọc/ghi cột thu hồi và lý do; `listPersonalSeatsOf`, `listTerminatingAccess` theo lô
- Verify: integration test của repo; test đếm câu lệnh không phụ thuộc số dòng

### Task 5: mở thu hồi và hoàn tất

- Files: `revocation.service.ts`, `provisioning-task-frame.service.ts`, `provisioning-decision.service.ts`, `provisioning.policy.ts`, `provisioning-task-view.service.ts`, `licensing.service.ts`, `licensing.module.ts`
- Depends on: Task 3, Task 4
- Acceptance: `openRevocation` idempotent và một tác vụ nhiều lý do; hoàn tất K1/K2/K5 nhả/giữ seat đúng; `access-cut`; `retry`, `handOff`, `closeFailed` của tác vụ `REVOKE` không đụng Assignment; hook đăng ký được
- Verify: test integration PostgreSQL của AC-1→AC-5, AC-8, AC-11, AC-12, AC-15, AC-17, AC-19 xanh

### Task 6: API

- Files: `revocation-tasks.controller.ts`, `provisioning-tasks.controller.ts`, `provisioning-task.wire.ts`, `provisioning.dto.ts`, `provisioning.http-errors.ts`, `test/e2e/provisioning.e2e-spec.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 5
- Acceptance: hai route mới, `complete` của `REVOKE` trả `409`, khối `revocation` ở tác vụ; không route tạo tác vụ thu hồi; `403` cho vai không phải IT Admin
- Verify: e2e `api-inventory` và test `403` xanh; `pnpm openapi:export` không lệch; `pnpm exec jest src` xanh

### Checkpoint

Gate chạy xanh trên cây làm việc (bảng dưới), tự review diff theo spec và AC. Điểm gọi cho `g5-return-and-renewal-requests`: `LicensingService.openRevocation(tx, actor, { assignmentId, source, decision, context?, now? })` trong transaction của Request hoàn trả (trả `{ taskId, created, reasonAdded, status }`; lỗi `RevocationRefusedError`, `AssignmentNotOpenError`, `ProvisioningAnotherItAdminNeededError`, mã HTTP do `provisioning.http-errors.ts` ánh xạ). Điểm gọi cho `g6-handover-confirmation`: `LicensingService.registerRevocationHook({ onOpened, beforeWork, afterWork })`; `beforeWork` ném lỗi thì nhận/hoàn tất bị từ chối và rollback (lỗi cần `*.http-errors.ts` của chính hạng mục đó để thành mã HTTP).

## Verification and handoff

Chạy từ gốc BE theo [CONTRIBUTING](../../../../CONTRIBUTING.md) và [test guide](../../../../test/README.md): `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` (CSDL riêng), `pnpm openapi:export`.

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                                                           | Revision / môi trường                           | Kết quả thực chạy                                                                                                                                                                                                                                           | Giới hạn / việc còn lại                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec tsc --noEmit`; `pnpm lint`; `pnpm exec prettier --check` trên `src`, `test`, `AGENTS.md`, `ARCHITECTURE.md`                                                                                                                                                                                                                       | cây làm việc chưa commit, BE `7920ee5`, Windows | sạch                                                                                                                                                                                                                                                        | —                                                                                                                                                                       |
| `pnpm exec jest` (unit, gồm kiến trúc, hợp đồng, OpenAPI, `revocation.policy.spec`)                                                                                                                                                                                                                                                          | như trên                                        | 161 suite, 2401 ca xanh                                                                                                                                                                                                                                     | —                                                                                                                                                                       |
| `pnpm openapi:export`; e2e `jest.e2e.cjs` đầy đủ (gồm `api-inventory` 213 thao tác, `openapi-export`, `provisioning`)                                                                                                                                                                                                                        | như trên                                        | 32 suite, 850 ca xanh                                                                                                                                                                                                                                       | —                                                                                                                                                                       |
| integration mới: `provisioning-revocation-constraints` (20), `-open` (15), `-complete` (18), `-read-contracts` (12)                                                                                                                                                                                                                          | PostgreSQL 17 Docker (`slm-g1g2-test-db`)       | 65 ca xanh                                                                                                                                                                                                                                                  | không có bước đỏ-trước với mã cũ (hạng mục mới); K3/K4 chỉ kiểm ở unit/SQL                                                                                              |
| integration liên quan (`provisioning`, `license-*`, `seat-*`, `licensing-*`, `access-request-withdrawal`, `application-retirement`, `assignment-writes`, `department-tools`, `service-account-request`, `standard-toolset`, `spend-commitment-lifecycle`, `access-request-internal-path`, `catalog-*`, `employee-import-seats`, `unit-only`) | như trên                                        | 40 suite, 460 ca: 459 xanh, 1 đỏ do test cũ chèn tác vụ `REVOKE` kèm `request_id`; đã sửa test (`provisioning-decision-http`, 13 ca xanh lại); `provisioning-task-constraints` đổi kỳ vọng `23502` thành `23514` (migration bỏ `NOT NULL` của `request_id`) | các suite khác của `access-request-*`, `budget-*`, `spend-*`, `org*`, `employee*` không chạy lại vì không chạm bảng của chúng; lượt tích hợp toàn bộ chạy ở mốc cuối G6 |
| kiểm tra drift: áp mọi migration vào CSDL rỗng, `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`                                                                                                                                                                                                                | như trên                                        | exit 0                                                                                                                                                                                                                                                      | —                                                                                                                                                                       |
| `pnpm rules:check`, `pnpm rules:format`, `pnpm test:discovery`                                                                                                                                                                                                                                                                               | như trên                                        | sạch; 161 unit, 32 e2e, 151 integration                                                                                                                                                                                                                     | —                                                                                                                                                                       |

Giới hạn còn lại: K3 và K4 (`AC-6`, `AC-7`) chờ `g4-device-dependent-features`; vế `G2` của `AC-12`, `AC-15` chờ `g6-downstream-integration`; hook chưa có consumer thật (chỉ kiểm bằng hook thử); hủy truy cập thực tế ở nhà cung cấp do người làm, hệ thống chỉ ghi bằng chứng.

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

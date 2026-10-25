# Plan: hoàn trả seat và gia hạn quyền có thời hạn

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (23/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule, và mã của hai hạng mục mẫu (`g5-request-withdrawal`, `g5-service-account-request`) cùng **`g6-revocation-by-grant-kind`, đã xong sau khi spec này được viết**: thực tế có cổng `LicensingService.openRevocation`, `RevocationHook`, hoàn tất theo kiểu cấp, `request_id` của tác vụ thu hồi rỗng và cột `revocation_source` với các `CHECK` đã có. Phần _Đối chiếu với `g6-revocation-by-grant-kind`_ của spec ghi từng chỗ khác bản thiết kế đầu (không có `RevocationRequestGate` hay `createRevocationTask`; hook thay cho cổng, nhiều hook cùng đăng ký; nối phiếu với tác vụ bằng `revocation_task_id` và `reference_kind = RETURN_REQUEST`). Trước khi đổi trigger `license_assignment_reject_change` đã `grep expected_end_date`: chỉ hai test cũ (`license-assignment-constraints`, `provisioning-failure-constraints`) đổi ngày, từ rỗng, và vẫn xanh. Ba migration `20261024090000`, `20261024090100`, `20261024090200` (sau migration cuối `20261024080000` của g6); giá trị enum `RENEWAL` ở migration riêng. Khi làm, ba tệp vượt 400 dòng được tách (`licensing-renewal.types.ts`, `renewal-request-trail.ts`, ma trận test chia năm suite).

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`
- Depends on: các hạng mục ở _Dependencies and blockers_ của spec
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test; quyết định của người phụ trách được gắn nhãn chưa phải của Owner
- Verify: `pnpm rules:check` và `pnpm rules:format` → xanh

### Task 2: dữ liệu

- Files: migration `20261024090000_requests_return_renewal_values`, `20261024090100_requests_return_and_renewal`, `20261024090200_licensing_assignment_renewal`, `prisma/models/requests.prisma`, `prisma/models/licensing.prisma`, `prisma/models/organization.prisma`, `prisma/models/catalog.prisma` (các quan hệ ngược), `src/architecture-boundaries.spec.ts` (chủ sở hữu hai bảng mới)
- Depends on: Task 1
- Acceptance: phiếu hoàn trả đồng bộ trạng thái, bàn giao, nguồn và người xác nhận, tối đa một phiếu chờ cho một Assignment, không xóa, không đổi điều đã nói lúc gửi; chi tiết gia hạn bất biến và ràng buộc hoãn _đúng một dòng chi tiết cho Request `RENEWAL`_; Assignment nguồn `REQUEST` được có `predecessor_id`; `expected_end_date` đã có giá trị thì không đổi; giá trị enum thêm bằng migration riêng
- Verify: `return-renewal-constraints` (10 ca, khẳng định cả tên ràng buộc) xanh; `license-assignment-constraints` và `provisioning-failure-constraints` xanh; `migrate deploy` rồi `migrate diff --exit-code` = 0

### Task 3: quy tắc thuần

- Files: `return-request/return-request.policy.ts`, `return-request/handover.policy.ts`, `renewal-request/renewal-request.policy.ts`, `access-request/grant.policy.ts` và spec của từng tệp
- Depends on: Task 1
- Acceptance: ai trả cho ai và điều kiện Assignment; ngày làm việc thứ N, hạn và quá hạn bàn giao; ai gia hạn, quyền nào gia hạn được, trước hay sau hạn, số tháng làm tròn lên, ngày kết thúc mới; Request gia hạn không bao giờ cấp được
- Verify: unit của bốn policy xanh (mọi ca ở dòng _Quy tắc thuần_ của ma trận)

### Task 4: licensing: hook, gia hạn, cổng giữ

- Files: `licensing.types.ts`, `licensing-renewal.types.ts`, `licensing.errors.ts`, `licensing.service.ts`, `licensing.module.ts`, `provisioning/registered-revocation-hook.service.ts`, `provisioning/provisioning-decision.service.ts`, `provisioning/provisioning.service.ts`, `provisioning/revocation-completion.service.ts`, `provisioning/provisioning-cancellation.service.ts`, `provisioning/provisioning.http-errors.ts`, `assignment/assignment-facts.repo.ts`, `assignment/assignment-renewal.service.ts`, `assignment/registered-renewal-hold.service.ts`
- Depends on: Task 2, Task 3
- Acceptance: nhiều hook cùng đăng ký (cùng tên thì thay) và hook báo kết cục của tác vụ thu hồi, kể cả đóng thất bại; lỗi của hook thành `409` với mã của nó; `renewAssignment` nối bản ghi mà số seat mỗi ngày không đổi, từ chối khi Assignment đã đổi, đang bị thu hồi hay đã kết thúc; cổng chưa đăng ký thì không có seat nào bị giữ; tác vụ cấp không đổi hành vi
- Verify: `provisioning-*`, `license-*`, `provisioning-revocation-*` hồi quy xanh; `registered-revocation-hook.service.spec.ts` xanh

### Task 5: hoàn trả: service, hook, API

- Files: `return-request/return-request.service.ts`, `return-request-query.service.ts`, `return-request.repo.ts`, `return-revocation.hook.ts`, `return-request.errors.ts`, `return-request.dto.ts`, `return-requests.controller.ts`, `return-request.http-errors.ts`, `access-request/withdrawal.service.ts`, `access-request.errors.ts`, `access-request.http-errors.ts` (`GRANT_COMPLETED` mang `assignmentId`), `requests.module.ts`, `test/support/api-coverage-manifest.ts`, `test/e2e/api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 4
- Acceptance: gửi phiếu trong một transaction gồm tác vụ `REVOKE`, phiếu, audit; xác nhận bàn giao đúng người; hook chặn hoàn tất khi chưa xác nhận, ghi `COMPLETED` (có cờ) hay `FAILED`; mọi từ chối của spec; thân gửi đúng một `assignmentId`
- Verify: `return-request`, `return-request-handover`, `return-request-conditions` xanh trên PostgreSQL riêng; e2e kiểm kê và OpenAPI xanh

### Checkpoint 1: nửa hoàn trả

Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh; hồi quy cấp phát, rút và thu hồi của g6 không đổi; tự review diff theo AC-1→AC-10.

### Task 6: gia hạn: service, áp dụng, cổng giữ, API

- Files: `renewal-request/renewal-request.service.ts`, `renewal-request-trail.ts`, `renewal-apply.service.ts`, `renewal-request.repo.ts`, `renewal-hold.reader.ts`, `renewal-request.errors.ts`, `renewal-request.dto.ts`, `renewal-requests.controller.ts`, `renewal-request.http-errors.ts`, `access-request/access-request.service.ts` (`submitWithin`, `SubmitOptions`), `access-request.types.ts`, `access-request.repo.ts`, `access-request-query.service.ts`, `access-request.wire.ts`, `access-request.dto.ts` (`RENEWAL`, khối `renewal`), `need-decision.service.ts`, `spend/spend-decision.service.ts`, `requests.module.ts`, `src/architecture-structure.spec.ts` (năm contract nội module), `test/support/api-coverage-manifest.ts`, `test/e2e/api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 4, Task 5
- Acceptance: gửi trước hạn (người giữ và trưởng phòng) và sau hạn (Request mới); duyệt xong thì ghi bản ghi mới trong cùng transaction và Request `COMPLETED`, không chờ IT; áp dụng không được thì `FAILED` và giải phóng cam kết; xác nhận quá 12 tháng theo tổng liên tiếp; Request gia hạn không bao giờ cấp được; luồng Request cấp thường không đổi; cổng `RenewalHold` đúng theo trạng thái Request
- Verify: `renewal-request` (19 ca) xanh; hồi quy `access-request-*`, `spend-*`, `budget-*` xanh; e2e kiểm kê và OpenAPI xanh

### Checkpoint 2: cả hạng mục

Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên cây làm việc; tự review diff theo spec và từng AC; roadmap, spec, `ARCHITECTURE.md`, `AGENTS.md` đã cập nhật; báo FE các trường và lỗi mới (xem Definition of Done của spec).

## Verification and handoff

Chạy ngày 24/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                                                                                                                     | Revision / môi trường | Kết quả thực chạy                                                                                                                                                                                   | Giới hạn / việc còn lại                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `return-request` (10), `return-request-handover` (5), `return-request-conditions` (7), `renewal-request` (19), `return-renewal-constraints` (10), chạy từng suite      | PostgreSQL 17 Docker  | 51 ca xanh                                                                                                                                                                                          | không có bước đỏ-trước với mã cũ (hạng mục mới); không giả được đồng hồ, ca quyết định muộn kiểm bằng facade với `now` tương lai                                                                                         |
| unit mới: `return-request.policy.spec`, `handover.policy.spec`, `renewal-request.policy.spec`, `registered-revocation-hook.service.spec`, ca mới ở `grant.policy.spec` | như trên              | xanh                                                                                                                                                                                                | —                                                                                                                                                                                                                        |
| `tsc --noEmit`, `pnpm lint`, `prettier --check` (src, test, prisma/models, AGENTS, ARCHITECTURE, roadmap, docs/workspace)                                              | như trên              | sạch                                                                                                                                                                                                | —                                                                                                                                                                                                                        |
| `pnpm exec jest` (unit, gồm kiến trúc, hợp đồng, OpenAPI)                                                                                                              | như trên              | 165 suite, 2435 ca xanh                                                                                                                                                                             | —                                                                                                                                                                                                                        |
| `pnpm openapi:export` rồi e2e `jest.e2e.cjs` đầy đủ (gồm `api-inventory` 218 thao tác, `openapi-export`)                                                               | như trên              | 32 suite, 850 ca xanh; chạy lại `api-inventory` và `openapi-export` sau lần xuất cuối: 25 ca xanh                                                                                                   | —                                                                                                                                                                                                                        |
| toàn bộ tích hợp `jest.integration.cjs --runInBand` (156 suite)                                                                                                        | như trên              | 152 suite xanh, 1 bỏ qua, 3 đỏ: `service-account-request` (một ca đếm giá trị enum `AccessRequestType`, đã sửa thêm `RENEWAL`, chạy lại xanh), `installation` và `installation-minimal-env` (12 ca) | hai suite `installation*` đỏ **từ trước hạng mục này**: bước dọn của chúng `TRUNCATE … CASCADE` chạm `approval_records` có trigger chặn `TRUNCATE` (đến từ migration G5 `20261023110100`); không thuộc phạm vi, chưa sửa |
| kiểm tra drift: áp mọi migration vào CSDL rỗng rồi `prisma migrate diff --exit-code`; `prisma validate`                                                                | như trên              | exit 0                                                                                                                                                                                              | —                                                                                                                                                                                                                        |
| `pnpm rules:check`, `pnpm rules:format`, `pnpm test:discovery`                                                                                                         | như trên              | sạch; unit 165, e2e 32, tích hợp 156                                                                                                                                                                | —                                                                                                                                                                                                                        |

Giới hạn còn lại: thông báo _thu hồi sắp thực hiện_ (`g5-request-status-notifications`), vế _lời mời chưa chấp nhận_ của việc rút, K3/K4 (`g4-device-dependent-features`), lịch nghỉ lễ cho hạn bàn giao (`g5-step-sla-and-alerts`), trưởng phòng gia hạn sau hạn, bộ lọc `kind` ở hàng đợi; ca _quyết định muộn hơn ngày kết thúc_ không kiểm được qua HTTP vì không giả được đồng hồ. Môi trường kiểm thử có sẵn nhiều CSDL `slm_*_test` còn sót từ các lượt chạy bị ngắt trước đó (không xóa theo wildcard).

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (`ARCHITECTURE.md`, `AGENTS.md`); phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

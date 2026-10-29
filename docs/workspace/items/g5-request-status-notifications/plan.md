# Plan: thông báo trạng thái Request và đo thời gian từng bước

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (23/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, uncommitted), 24/10/2026. PR: chưa có (chưa commit, theo yêu cầu không tự commit hay push). Owner review: chưa.

## Before coding

Đọc spec và đối chiếu code ở revision đầu vào. Repo đã có outbox thư (`email_outbox`, `EmailDispatcher`, ba mẫu thư vòng đời tài khoản), `AuditService.record`, audit event cho mọi chuyển trạng thái của Request (kể cả `ACCESS_REQUEST.WITHDRAWN`, `WITHDRAWAL_REQUESTED`, `PROVISIONING_TASK.CANCELLED`, `BUDGET_COMMITMENT.RELEASED` do `g5-request-withdrawal` và `g5-commitment-lifecycle` ghi), các mốc bước (`created_at`, `decided_at`) và vòng thăm dò PostgreSQL của worker. Repo **chưa** có: hộp thông báo trong ứng dụng (đây là điều kiện chặn của `g4-notification-delivery`), đường đọc audit cho consumer hệ thống, thời điểm tác vụ cấp hoàn tất trên Request, và đồ thị worker cho `requests`. Hạng mục chia hai phase để mở khóa hai hạng mục anh em sớm: **Phase 1** (Task 2 → 5) làm hộp thư và cửa `NotificationsService.notifyInApp`, không đụng `requests`; sau checkpoint đó `g5-step-sla-and-alerts` Task 6, `g5-step-reassignment-and-controlled-wait` Task 7 và `g4-notification-delivery` có thể bắt đầu. **Phase 2** (Task 6 → 11) làm nguồn sự kiện chiếu từ Audit Trail và số đo; Task 10 chờ `g5-step-sla-and-alerts` Task 3 (cột `spend_queued_at`). Vòng `RequestWorkLoop` và `requests-work-facade.module.ts` dùng chung với hai hạng mục anh em: hạng mục nào làm trước tạo, hạng mục sau thêm lời gọi.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md` (và `roadmap.md`, do người tích hợp cập nhật)
- Depends on: hạng mục phụ thuộc
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu hộp thư (Phase 1)

- Trạng thái: xong, đã kiểm (24/10/2026, local, chưa commit); bằng chứng ở bảng cuối.
- Files: migration `20261024110000_notifications_in_app_inbox` (số thứ tự đã đổi cho đứng sau `20261024100100`), `prisma/models/notifications.prisma`, `architecture-boundaries.spec.ts` (`PRISMA_MODEL_OWNER`)
- Depends on: Task 1
- Acceptance: `in_app_notifications` với duy nhất `(recipient_employee_id, event_key)`, các `CHECK` của mã, `params` và chủ thể, trigger chỉ cho đặt `read_at` một lần và chặn `DELETE`, `TRUNCATE`
- Verify: nhóm _what the database refuses_ của `in-app-notifications-constraints` xanh; `migrate diff --exit-code` = 0

### Task 3: quy tắc thuần của hộp thư (Phase 1)

- Trạng thái: xong, đã kiểm (24/10/2026, local, chưa commit); bằng chứng ở bảng cuối.
- Files: `src/modules/notifications/public/notifications.types.ts`, `src/modules/notifications/inbox/inbox.policy.ts` (+ spec)
- Depends on: Task 1
- Acceptance: bảng mã đóng (mã của ba hạng mục), tham số chỉ gồm chuỗi, số, boolean, rỗng, không khóa cấm, không quá 4 096 byte, khóa duy nhất không quá 200 ký tự; từ chối mã lạ
- Verify: ít nhất 10 ca chính sách xanh

### Task 4: hộp thư và cửa `notifyInApp` (Phase 1)

- Trạng thái: xong, đã kiểm (24/10/2026, local, chưa commit); bằng chứng ở bảng cuối.
- Files: `inbox/in-app-notification.repo.ts`, `inbox/inbox.service.ts`, `inbox/inbox.errors.ts`, `notifications.service.ts`, `notifications.module.ts`, `architecture-structure.spec.ts` (hợp đồng nội module), `in-app-notifications.integration-spec.ts`
- Depends on: Task 2, Task 3
- Acceptance: `notifyInApp(tx, input)` ghi trong transaction của người gọi và hoàn tác cùng nó, trả `false` khi cặp người nhận và khóa đã có; liệt kê, đếm chưa đọc, đánh dấu đã đọc một lần, đọc hết; không có đường đọc hộp thư của người khác; `EmailTemplate` và `email_outbox` không đổi
- Verify: nhóm dịch vụ hộp thư xanh; hồi quy `password-self-service-mail` và `account-invitation` xanh

### Task 5: API hộp thư (Phase 1)

- Trạng thái: xong, đã kiểm (24/10/2026, local, chưa commit); bằng chứng ở bảng cuối.
- Files: `inbox/inbox.controller.ts`, `inbox/inbox.dto.ts`, `inbox/inbox.http-errors.ts`, `src/modules/notifications/notifications-http.module.ts`, `src/app/app.module.ts`, `module-graph.spec.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `api-collection-contract.spec.ts` (nếu cần), `openapi.json`
- Depends on: Task 4
- Acceptance: bốn thao tác `notificationList`, `notificationUnreadCount`, `notificationMarkRead`, `notificationMarkAllRead`; mỗi route khai `@AuthenticatedOnly()`; chỉ hộp thư của chính người gọi; `404 NOTIFICATION.NOT_FOUND`; thứ tự có khóa phụ, biên trang 50, số câu lệnh không phụ thuộc số dòng; worker không mount controller
- Verify: nhóm API hộp thư xanh; e2e kiểm kê và OpenAPI xanh; `jest src` xanh

### Checkpoint Phase 1

Đã đạt (24/10/2026, local): hộp thư và `notifyInApp` xanh; các kế hoạch anh em đã ghi điều kiện. Gate chạy xanh trên cây làm việc, tự review diff; ghi vào kế hoạch của `g5-step-sla-and-alerts`, `g5-step-reassignment-and-controlled-wait` và `g4-notification-delivery` rằng điều kiện hộp thông báo đã có. Phase 2 bắt đầu sau điểm này.

### Task 6: dữ liệu nguồn sự kiện và mốc cấp (Phase 2)

- Trạng thái: xong, đã kiểm (24/10/2026, local, chưa commit); bằng chứng ở bảng cuối.
- Files: migration `20261024110100_requests_status_projection`, `requests.prisma`, `architecture-boundaries.spec.ts` (`PRISMA_MODEL_OWNER`)
- Depends on: Task 1
- Acceptance: `request_status_cursor` có đúng một dòng khởi tạo ở `now()`; `access_requests.grant_completed_at` rỗng được, dữ liệu cũ `COMPLETED` được gán `updated_at`
- Verify: nhóm _what the database refuses_ của `request-status-constraints` xanh; `migrate diff --exit-code` = 0

### Task 7: quy tắc thuần của thông báo và số đo (Phase 2)

- Trạng thái: xong, đã kiểm (24/10/2026, local, chưa commit); bằng chứng ở bảng cuối.
- Files: `src/modules/requests/status/request-status.policy.ts` (+ spec), `src/modules/requests/status/request-timing.policy.ts` (+ spec)
- Depends on: Task 1
- Acceptance: mười sáu dòng của bảng sự kiện → ý định (người nhận, mã, tham số, khóa), loại người gây ra sự kiện, khử trùng, người thụ hưởng khác chỉ nhận kết cục, không bao giờ Người duyệt chi cho kết cục trước bước chi; các đoạn thời gian, `approvedAt`, `countedInKpi`, `medianSeconds`; bảng khóa tham số cho phép của từng mã
- Verify: ít nhất 26 ca chính sách xanh; test hợp đồng nội dung xanh

### Task 8: cửa đọc audit cho consumer hệ thống (Phase 2)

- Trạng thái: xong, đã kiểm (24/10/2026, local, chưa commit); bằng chứng ở bảng cuối.
- Files: `src/modules/audit/public/audit.api.ts`, `audit.types.ts`, `audit.repo.ts`, `audit.service.spec.ts`, `test/integration` (đọc theo con trỏ)
- Depends on: Task 1
- Acceptance: `readSince(cursor, { upTo, actions, limit })` trả theo `(occurred_at, id)` tăng dần, chỉ các `action` yêu cầu, không vượt `upTo`, con trỏ rỗng đọc từ đầu; không lộ qua HTTP; không đổi bảng
- Verify: ca tích hợp đọc theo con trỏ xanh; `jest src` (kiến trúc) xanh

### Task 9: bộ chiếu thông báo và worker (Phase 2)

- Trạng thái: xong, đã kiểm (24/10/2026, local, chưa commit); bằng chứng ở bảng cuối.
- Files: `status/request-status.repo.ts`, `status/request-status-recipients.service.ts`, `status/request-status-facts.service.ts`, `status/status-rules.*.ts`, `status/status-cursor.repo.ts`, `status/request-status-projector.service.ts`, `src/modules/requests/public/request-status-projector.api.ts`, `src/modules/requests/requests-work-facade.module.ts`, `src/worker/request-work.job.ts` (+ spec), `module-graph.spec.ts`, `architecture-boundaries.spec.ts`, `architecture-structure.spec.ts`, `request-status-notifications.integration-spec.ts`
- Depends on: Task 4, Task 6, Task 7, Task 8
- Acceptance: một lượt khóa con trỏ `SKIP LOCKED`, đọc cửa sổ đủ cũ (`DB_TRANSACTION_TIMEOUT_MS` + 5 giây), ghi thông báo, dời con trỏ trong một transaction; chiếu lại không sinh trùng; hai worker song song không trùng; sự kiện commit muộn trong độ trễ không mất; sự kiện hỏng bị bỏ qua có cảnh báo; không dòng `email_outbox`; nếu hạng mục anh em đã tạo `RequestWorkLoop` và module facade thì thêm lời gọi
- Verify: nhóm AC-1, AC-2, AC-4 → AC-12 và nhóm _chống trùng, đồng thời_, _sự kiện hỏng_, _vế thông báo của rút_ xanh; `worker/request-work.job.spec.ts` xanh

### Task 10: số đo thời gian và route (Phase 2)

- Trạng thái: xong, đã kiểm (24/10/2026, local, chưa commit); bằng chứng ở bảng cuối.
- Files: `status/request-timing.repo.ts`, `status/request-timing.service.ts`, `status/request-timings.controller.ts`, `status/request-timing.dto.ts`, `access-request/access-request-grant.gate.ts`, `access-request/access-request.repo.ts` (ghi `grant_completed_at`), `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`, `request-timings.integration-spec.ts`
- Depends on: Task 6, Task 7. Điều kiện `g5-step-sla-and-alerts` Task 3 (`spend_queued_at`) **không còn**: đoạn `QUEUE_WAIT` suy từ dữ liệu có sẵn (xem spec, _Điều thực sự đã làm khác_); khi cột có, `request-timing.repo.ts` đọc nó thay cho phép suy ra
- Acceptance: cổng cấp phát ghi `grant_completed_at` cùng transaction với `COMPLETED`; `GET /access-requests/{id}/timings` đúng `approvalSeconds`, `grantSeconds`, `totalSeconds`, các đoạn và `countedInKpi`; người xem được Request theo `canViewRequest`, vai khác `404`; Request chưa có tác vụ `COMPLETED` không tính
- Verify: nhóm AC-1, AC-6, AC-11 và _quyền số đo_ xanh; e2e kiểm kê và OpenAPI xanh; `jest src` xanh; hồi quy `access-request`, `grant`, `provisioning` xanh

### Task 11: hồi quy và tài liệu vận hành (Phase 2)

- Trạng thái: xong, đã kiểm (24/10/2026, local, chưa commit); bằng chứng ở bảng cuối.
- Files: `ARCHITECTURE.md` (hàng `notifications`, `audit`, `requests`, worker), `docs/rules/security-jobs.md`, `test/README.md` (nếu có harness mới), `docs/roadmap.md` và `docs/workspace/items/g4-notification-delivery/spec.md` (do người tích hợp cập nhật điều kiện mở khóa)
- Depends on: Task 9, Task 10
- Acceptance: tài liệu mô tả hộp thư, cửa `notifyInApp`, bộ chiếu audit, độ trễ và cách chạy một lượt `project` bằng tay để kiểm; bảng nghiệm thu của spec có bằng chứng; phần chưa kiểm chứng (`AC-9`, `AC-12` đầu cuối) ghi rõ
- Verify: `pnpm rules:check` và `pnpm rules:format` → xanh; `pnpm check`

### Checkpoint Phase 2

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 24/10/2026 trên cây làm việc chưa commit (không có revision git để ghi), Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`, cổng 55432).

| Lệnh / kiểm tra AC                                                                                                                                                                  | Revision / môi trường | Kết quả thực chạy                                                                                                            | Giới hạn / việc còn lại                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `in-app-notifications.integration-spec`                                                                                                                                             | PostgreSQL 17 Docker  | 23 ca xanh                                                                                                                   | —                                                                                                |
| `request-status-notifications.integration-spec`                                                                                                                                     | như trên              | 17 ca xanh                                                                                                                   | `AC-12` đầu cuối chờ G6                                                                          |
| `request-status-projection.integration-spec`                                                                                                                                        | như trên              | 17 ca xanh                                                                                                                   | `AC-9` dùng audit event tổng hợp (chưa có `g5-group-requests`)                                   |
| `request-timings.integration-spec`                                                                                                                                                  | như trên              | 6 ca xanh (chạy riêng 3 lần liên tiếp sau sửa)                                                                               | `QUEUE_WAIT` suy từ dữ liệu có sẵn; chưa đọc `spend_queued_at`                                   |
| `jest` trên `inbox`, `status`, `audit`, `request-work.loop.spec`                                                                                                                    | như trên              | 8 suite, 112 ca xanh                                                                                                         | —                                                                                                |
| `pnpm exec jest --runInBand` (unit, gồm kiến trúc, hợp đồng, OpenAPI)                                                                                                               | như trên              | 174 suite, 2584 ca xanh                                                                                                      | —                                                                                                |
| `pnpm exec jest --config ./test/config/jest.integration.cjs --runInBand` (toàn bộ, gồm hồi quy access-request, grant, provisioning, password-self-service-mail, account-invitation) | như trên              | 162 suite xanh, 2382 ca xanh (1 suite tùy chọn kho đối tượng thật và 4 ca bỏ qua)                                            | chạy trước sửa làm tròn của `request-timing.policy`; sau đó chỉ chạy lại suite `request-timings` |
| `pnpm openapi:export`, `pnpm test:e2e` (toàn bộ, gồm `api-inventory` 224 thao tác và `openapi-export`)                                                                              | như trên              | 32 suite, 850 ca xanh                                                                                                        | —                                                                                                |
| `migrate deploy` trên CSDL tạm rồi `migrate diff --from-config-datasource --to-schema prisma --exit-code`                                                                           | như trên              | `No difference detected`, thoát 0; CSDL tạm đã xóa                                                                           | —                                                                                                |
| `pnpm typecheck`, `pnpm lint`, `pnpm prisma:validate`, `pnpm test:discovery`                                                                                                        | như trên              | sạch                                                                                                                         | —                                                                                                |
| `pnpm rules:check`, `pnpm rules:format`                                                                                                                                             | như trên              | xanh sau khi sửa tài liệu (`rules:check` 0 lỗi, `rules:test` 38 ca, `format:check`, `test:scripts` 30 ca, `pnpm build` xanh) | —                                                                                                |

Phát hiện khi kiểm: ca `request-timings` _has a segment…_ lệch một giây khi chạy riêng (`totalSeconds` làm tròn một lần, hai phần làm tròn riêng); sửa ở `request-timing.policy.ts` (tổng của hai phần) kèm ca đơn vị đã đỏ trước khi sửa.

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (`AC-12` đầu cuối chờ G6; `AC-9` đầu cuối chờ `g5-group-requests`).
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có. Các test viết cùng lúc với code, chưa có bằng chứng đỏ-trước (trừ ca làm tròn).
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

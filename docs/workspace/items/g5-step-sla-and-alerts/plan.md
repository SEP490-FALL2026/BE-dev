# Plan: SLA từng bước: nhắc, thông báo và cảnh báo nghẽn, không đổi người, không tự duyệt

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (23/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, uncommitted). PR: chưa có (chưa commit, theo yêu cầu không tự commit hay push).

## Before coding

Đọc spec và đối chiếu code ở revision đầu vào. Repo đã có các bước (`access_request_steps` với `sla_working_days` chụp lúc tạo), tham số `APPROVAL_SLA_WORKING_DAYS` và `SPEND_SUBMISSION_WAIT_WORKING_DAYS`, ngày không làm việc (`NonWorkingDatesService`), vòng thăm dò PostgreSQL của worker (`EmailDispatchLoop`) và câu hỏi Finance (`budget_information_requests`). Repo **chưa** có: phép tính ngày làm việc (chỉ có `isNonWorking(date)`), thời điểm Request vào hàng đợi trình, hộp thông báo trong ứng dụng, tham số ngưỡng backlog, tra Super Admin qua facade và đồ thị worker cho `requests`. Task 6 chờ **Phase 1 của `g5-request-status-notifications`** (hộp thông báo và `NotificationsService.notifyInApp`) `verified`; các Task 2 → 5 không chờ và có thể làm trước. Hai hạng mục anh em dùng chung vòng `RequestWorkLoop` và `requests-work-facade.module.ts`: hạng mục nào làm trước tạo, hạng mục sau thêm lời gọi (Task 8). Phase 1 làm Task 2 → 9; Phase 2 chỉ là nhắc Finance (Task 10, Task 11).

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md` (và `roadmap.md`, do người tích hợp cập nhật)
- Depends on: hạng mục phụ thuộc
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh
- Kết quả: xong (24/10/2026).

### Task 2: lõi ngày làm việc và tham số (Phase 1)

- Files: `src/core/working-days.ts` (+ spec; tệp dùng chung với `g6-transfer-record`: nếu đã có thì chỉ thêm hàm), `src/modules/operating-parameters/parameter-definitions.policy.ts`, `operating-parameters.service.ts`, `operating-parameters.repo.ts`, test tham số hiện có (danh sách thêm một khóa)
- Depends on: Task 1
- Acceptance: `isWorkingDay`, `addWorkingDays`, `workingDaysBetween`, `wallClockAt`, `slaDueAt` đúng cho cuối tuần, ngày nghỉ liền kề, tạo vào thứ Bảy, múi giờ có giờ mùa hè; `BACKLOG_ALERT_THRESHOLD` (1–500, mặc định 10) có trong danh sách tham số với Audit trước/sau; `getValueAt` trả giá trị hiệu lực tại thời điểm (trước và sau lần đổi, khóa chưa có dòng thì mặc định); `getNonWorkingDates` trả tập ngày
- Verify: `working-days.spec.ts` (ít nhất 16 ca của hạng mục này, cộng ca đã có của G6) xanh; nhóm integration `operating-parameters` xanh
- Kết quả: xong. `src/core/working-days.ts` chưa có (G6 chưa vào) nên tạo ở đây: `isWorkingDay`, `addWorkingDays`, `subtractWorkingDays`, `workingDaysBetween`, `wallClockAt`, `instantAtWallClock`, `slaDueAt`; `working-days.spec.ts` 27 ca xanh (cuối tuần, ngày nghỉ liền kề, tạo thứ Bảy, giờ mùa hè New York). `BACKLOG_ALERT_THRESHOLD` (1–500, mặc định 10), `OperatingParametersService.getValueAt`, `getValuesAt` (một lần đọc cho cả trang), `getNonWorkingDates`; `operating-parameters-http` thêm hai ca (Audit trước/sau, giá trị hiệu lực trước và sau lần đổi, tập ngày) và số tham số 16 → 17.

### Task 3: dữ liệu (Phase 1)

- Files: migration `20261024040000_requests_step_sla_clock`, `20261024040100_requests_step_sla_reminders`, `20261024040200_requests_congestion_incidents`, `requests.prisma`, `organization.prisma` (quan hệ ngược của `Employee`), `architecture-boundaries.spec.ts` (`PRISMA_MODEL_OWNER`)
- Depends on: Task 1
- Acceptance: `spend_queued_at` do trigger đặt khi vào hàng đợi, giữ khi rời, đặt lại khi vào lần nữa; nhắc và người nhận chỉ ghi thêm (`23001`), duy nhất mỗi đối tượng mỗi ngày và mỗi `sequence` (`23505`), `step_kind` đúng loại (`23514`); sự cố chỉ ghi thêm, mô tả không rỗng và ≤ 1 000 ký tự; dòng đang ở hàng đợi được gán `spend_queued_at` từ `updated_at` trước khi có trigger
- Verify: nhóm _what the database refuses_ của `step-sla-constraints` xanh; `migrate diff --exit-code` = 0
- Kết quả: xong. Ba migration `20261024120000_requests_step_sla_clock`, `20261024120100_requests_step_sla_reminders`, `20261024120200_requests_congestion_incidents` (tên cuối, sau `20261024110100`); hai enum mới nằm cùng migration với bảng dùng chúng (không `ADD VALUE`); trigger `access_requests_queue_clock` không thay hàm cũ nào. `step-sla-constraints.integration-spec` 10 ca xanh; `migrate deploy` trên CSDL rỗng rồi `migrate diff --exit-code`: không khác biệt. `PRISMA_MODEL_OWNER` có ba model mới.

### Task 4: quy tắc thuần của nhắc

- Files: `src/modules/requests/sla/step-sla.policy.ts` (+ spec)
- Depends on: Task 2
- Acceptance: hạn, tuổi, quá hạn chưa, nhắc hôm nay chưa (một nhắc mỗi ngày làm việc), người nhận cho người giữ là nhân viên, trưởng phòng, Người duyệt chi, approver dự phòng, Finance; thiếu cấp trên, bước chưa ai giữ, người giữ đã nghỉ việc ⟹ Super Admin; câu hỏi Finance mở thêm `FINANCE_QUESTION`; không bao giờ trả người nhận hai lần
- Verify: ít nhất 14 ca chính sách xanh
- Kết quả: xong. `sla/step-sla.policy.ts` + `step-sla.policy.spec.ts` 28 ca xanh. Thêm `SlaCalendar`, `standingOf`, `isReminderDue`, `superiorOf`, `recipientsOf`, `queueRecipientsOf`, `noticeCodeOf`, `noticeParamsOf`, `isBacklog`; khóa tham số thông báo của sáu mã đã sửa ở `inbox.policy.ts` (và ca của nó).

### Task 5: tra Super Admin qua facade

- Files: `src/modules/identity-access/public/identity-access.api.ts`, `accounts/app-user.repo.ts`, test tích hợp tài khoản
- Depends on: Task 1
- Acceptance: `findUsableSuperAdminEmployeeId` trả nhân viên của tài khoản Super Admin dùng được (đã kích hoạt, không khóa), `null` khi không có
- Verify: ca tích hợp mới xanh; kiểm tra kiến trúc (`jest src`) xanh
- Kết quả: `IdentityAccessService.findUsableSuperAdminEmployeeId` đã có từ trước; thêm ca tích hợp ở `step-sla-finance-question.integration-spec` (tìm được, `null` khi tài khoản bị khóa, nhắc vẫn ghi và không gửi ai khác).

### Task 6: lượt quét các bước (Phase 1)

- Files: `sla/sla-subject.repo.ts`, `sla/sla-reminder.repo.ts`, `sla/step-sla.service.ts`, `test/support/request-harness.ts` (dựng bước ở thời điểm cho trước), `step-sla.integration-spec.ts`, `architecture-structure.spec.ts`
- Depends on: Task 3, Task 4, Task 5, **`g5-request-status-notifications` Phase 1 `verified`** (đã `verified` local 24/10/2026: `NotificationsService.notifyInApp(tx, input)` có, bảng mã đóng đã chứa mã của hạng mục này với khóa tham số đoán sẵn ở `inbox.policy.ts` để sửa cùng thay đổi; nếu muốn giao qua audit event `STEP_REMINDED` thay vì gọi cửa trực tiếp, thêm một bảng luật cạnh `status-rules.*.ts` như mục _Cách mở rộng_ của [spec](../g5-request-status-notifications/spec.md); `IdentityAccessService.findUsableSuperAdminEmployeeId` đã có nên Task 5 chỉ còn kiểm)
- Acceptance: mỗi đối tượng quá hạn được nhắc tối đa một lần mỗi ngày làm việc, trong một transaction cùng người nhận, thông báo trong hộp và Audit `ACCESS_REQUEST.STEP_REMINDED`; lượt quét không ghi vào `access_requests`, `access_request_steps`, `approval_records`, `spend_decisions`; khóa `SKIP LOCKED` và ràng buộc duy nhất giữ đúng một nhắc khi hai lượt chạy song song; ngày không làm việc không nhắc
- Verify: nhóm AC-1 → AC-6, AC-8 → AC-10, _đồng thời_, _đã nghỉ việc_, _đã đóng_ xanh; `step-sla-constraints` xanh
- Kết quả: xong. `sla-subject.repo.ts` (chỉ đọc, khóa `FOR UPDATE SKIP LOCKED`), `sla-reminder.repo.ts`, `reminder-writer.service.ts`, `sla-recipient-facts.service.ts`, `step-sla.service.ts`; `test/support/sla-harness.ts`; `step-sla.integration-spec` 15 ca xanh (gồm hai lượt song song và một thông báo lỗi giữa chừng hoàn tác cả nhắc). Các test dùng ngày đếm từ một thứ Sáu cách ba tuần vì dữ liệu tổ chức (trưởng phòng, nơi xếp chỗ) có hiệu lực từ ngày ghi và nhắc hỏi ai là ai vào ngày của lượt quét.

### Task 7: hàng đợi trình (Phase 1)

- Files: `sla/step-sla.service.ts` (nhánh hàng đợi), `sla/sla-queue-age.service.ts` (hợp đồng nội module cho `spend`, đăng ký ở `INTRA_MODULE_CONTRACTS` kèm lý do), `spend/spend-queue.service.ts`, `spend/spend-request.repo.ts`, `spend/spend-submission.dto.ts`, `architecture-structure.spec.ts`, `openapi.json`
- Depends on: Task 6
- Acceptance: Request ở hàng đợi quá hạn (hạn lấy từ tham số hiệu lực lúc vào hàng đợi) nhắc trưởng phòng kèm tuổi chờ, không tạo bước hay lô; trưởng phòng đã nghỉ việc ⟹ Super Admin; `spendQueueList` thêm `queuedAt`, `waitedWorkingDays`, `overdue`, `reminders` mà không đổi trường cũ
- Verify: nhóm AC-11 xanh; hồi quy `spend-queue` và `spend-batches` xanh
- Kết quả: xong. `sla/sla-queue-age.service.ts` (hợp đồng nội module đăng ký, đọc bốn lệnh cho cả trang), `spend-queue.service.ts`, `spend-request.repo.ts`, `spend-submission.dto.ts`, `openapi.json`; `reminders` là số lần nhắc (không phải mảng, để không thêm mảng lồng nhau vào kho `NESTED_ARRAYS`). `step-sla-queue.integration-spec` 5 ca xanh; `spend-*` của bộ tích hợp đầy đủ xanh.

### Task 8: worker (Phase 1)

- Files: `src/modules/requests/public/step-sla-sweep.api.ts`, `src/modules/requests/requests-work-facade.module.ts`, `src/modules/requests/requests.module.ts`, `src/worker/request-work.job.ts` (+ spec), `src/worker/worker.module.ts`, `src/infrastructure/config/env-schema.ts` (+ spec), `.env.example`, `module-graph.spec.ts`, `architecture-boundaries.spec.ts`, `ARCHITECTURE.md`, `docs/rules/security-jobs.md`
- Depends on: Task 6, Task 7
- Acceptance: worker chạy `StepSlaSweepService.sweep` theo `REQUEST_WORK_INTERVAL_MS`, một lượt không chồng lượt trước, dừng đúng khi tắt, lỗi chỉ ghi tên; đồ thị worker không import `CatalogModule` hay kho tệp; hợp đồng gốc đăng ký đủ ở `PUBLIC_ROOT_CONTRACT_FILES` và `PUBLIC_CONTRACT_EXPORTS`; nếu hạng mục anh em đã tạo vòng thì thêm lời gọi chứ không tạo vòng thứ hai
- Verify: `worker/request-work.job.spec.ts` xanh; `jest src` (kiến trúc, đồ thị module, cấu hình) xanh; ca tích hợp chạy `sweep` qua đồ thị `RequestsWorkFacadeModule`
- Kết quả: xong. `RequestWorkLoop` và `RequestsWorkFacadeModule` do `g5-step-reassignment-and-controlled-wait` tạo trước nên chỉ thêm lời gọi `StepSlaSweepService.sweep` (một ca unit mới về thứ tự và lỗi chỉ ghi tên, `request-work.loop.spec` 7 ca); `REQUEST_WORK_INTERVAL_MS` đã có. Hợp đồng gốc `step-sla-sweep.service.ts` đăng ký ở `PUBLIC_ROOT_CONTRACT_FILES` của cả hai spec kiến trúc; `SlaQueueAgeService` và `CongestionRepo` khai một lần ở `RequestsWorkFacadeModule` rồi xuất ra (khai ở cả hai module vi phạm cổng một provider một module), có ca ở `module-graph.spec`. Các ca tích hợp gọi `StepSlaSweepService` qua đồ thị API; đồ thị worker chỉ kiểm bằng `module-graph.spec` (không import `CatalogModule`, không controller), chưa khởi động tiến trình worker thật.

### Task 9: bảng nghẽn, cảnh báo backlog, sự cố, API (Phase 1)

- Files: `sla/congestion.repo.ts`, `sla/backlog-alert.service.ts`, `sla/congestion.service.ts`, `sla/congestion.controller.ts`, `sla/congestion.dto.ts`, `sla/congestion.errors.ts`, `sla/congestion.http-errors.ts`, `step-sla-sweep.service.ts` (thêm lời gọi cảnh báo backlog), `requests-work-facade.module.ts`, `requests.module.ts`, `module-graph.spec.ts` (ghim `CongestionRepo` khai ở hai module), `step-congestion.integration-spec.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `api-collection-contract.spec.ts` (nếu cần đăng ký biên), `openapi.json`, các route quyết định chưa chặn `SUPER_ADMIN` (nếu `AC-3` lộ ra)
- Depends on: Task 6
- Acceptance: cảnh báo backlog một lần mỗi người mỗi ngày làm việc khi số bước `PENDING` lớn hơn ngưỡng; bốn thao tác mới; Super Admin gọi mọi route quyết định đều bị từ chối; ghi sự cố không đổi người giữ
- Verify: `step-congestion` xanh; e2e kiểm kê và OpenAPI xanh; `jest src` xanh; hồi quy `access-request`, `spend`, `budget` xanh
- Kết quả: xong. `congestion.repo.ts`, `backlog-alert.service.ts`, `congestion.service.ts`, `congestion.controller.ts`, `congestion.dto.ts`, `congestion.errors.ts`, `congestion.http-errors.ts`; bốn thao tác mới, kiểm kê `api-inventory` 224 → 228; `lastRemindedOn` là chuỗi thường vì kiểu `date` của zod sinh một mẫu regex ngoài danh sách mẫu nghiệp vụ của cổng OpenAPI. `step-congestion.integration-spec` 11 ca xanh; không route quyết định nào cần thêm chốt chặn vai (Super Admin bị từ chối 403 hay 404 ở cả bốn). Ngưỡng của test đặt 3 (không 10) để dựng ít Request: quy tắc _lớn hơn_ có thêm ở policy.

### Checkpoint Phase 1

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC; Phase 2 chỉ bắt đầu sau điểm này.

### Task 10: nhắc Finance cho câu hỏi còn mở (Phase 2)

- Files: `sla/step-sla.service.ts`, `sla/sla-subject.repo.ts` (đọc câu hỏi `OPEN` của bước chi), `step-sla.integration-spec.ts`
- Depends on: Task 6 (và `g5-finance-information-request` đã `verified`)
- Acceptance: bước chi quá SLA có câu hỏi `OPEN` ⟹ nhắc đầu có thêm Finance (`FINANCE_QUESTION`) khác người giữ; câu hỏi đã trả lời hay đóng thì không; không Finance dùng được thì bỏ qua; không đổi câu hỏi hay câu trả lời
- Verify: ca `US-06-02` AC-3 xanh; hồi quy `budget-information` xanh
- Kết quả: xong. Đọc câu hỏi `OPEN` cũ nhất của bước chi (`SlaSubjectRepo.openFinanceQuestion`), thêm `FINANCE_QUESTION` ở nhắc đầu và các nhắc sau khi câu hỏi còn mở; `step-sla-finance-question.integration-spec` 6 ca xanh; `spend-finance-information` xanh trong bộ tích hợp đầy đủ.

### Task 11: hồi quy và tài liệu vận hành (Phase 2)

- Files: `ARCHITECTURE.md` (hàng `requests`, worker, biến môi trường), `docs/rules/security-jobs.md`, `.env.example`, `test/README.md` (nếu có harness mới), `docs/roadmap.md` (do người tích hợp)
- Depends on: Task 9, Task 10
- Acceptance: tài liệu mô tả vòng `RequestWorkLoop`, biến `REQUEST_WORK_INTERVAL_MS` và cách chạy một lượt `sweep` bằng tay để kiểm; bảng nghiệm thu của spec có bằng chứng
- Verify: `pnpm rules:check` và `pnpm rules:format` → xanh; `pnpm check`
- Kết quả: xong. `ARCHITECTURE.md` (hàng Requests, bố cục `sla/`, đoạn worker), `docs/rules/security-jobs.md`, `test/README.md`, `docs/roadmap.md`, chỉ mục hạng mục; `.env.example` và `env-schema` không đổi (biến đã có). Chạy một lượt bằng tay: `StepSlaSweepService.sweep(now)` qua `sla-harness.ts` (`sweepAt`).

### Checkpoint Phase 2

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 24/10/2026 trên cây làm việc chưa commit, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                                                                                                                                                         | Revision / môi trường | Kết quả thực chạy                                                                              | Giới hạn / việc còn lại                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `step-sla.integration-spec`                                                                                                                                                                                | PostgreSQL 17 Docker  | 15 ca xanh                                                                                     | ngày test đếm từ một thứ Sáu cách ba tuần; chưa chạy tiến trình worker thật                                           |
| `step-sla-queue.integration-spec`                                                                                                                                                                          | như trên              | 5 ca xanh                                                                                      | —                                                                                                                     |
| `step-sla-finance-question.integration-spec`                                                                                                                                                               | như trên              | 6 ca xanh                                                                                      | —                                                                                                                     |
| `step-congestion.integration-spec`                                                                                                                                                                         | như trên              | 11 ca xanh                                                                                     | ngưỡng đặt 3, không 10; bảng nghẽn tính tuổi theo đồng hồ hiện tại nên test chỉ kiểm tuổi của bước bắt đầu từ tháng 9 |
| `step-sla-constraints.integration-spec`                                                                                                                                                                    | như trên              | 10 ca xanh                                                                                     | —                                                                                                                     |
| `working-days.spec`, `step-sla.policy.spec`, `request-work.loop.spec`                                                                                                                                      | như trên              | 27, 28, 7 ca xanh                                                                              | —                                                                                                                     |
| `pnpm exec jest --runInBand` (unit, gồm kiến trúc, đồ thị module, hợp đồng, OpenAPI)                                                                                                                       | như trên              | 176 suite, 2644 ca xanh                                                                        | —                                                                                                                     |
| `pnpm test:integration` (toàn bộ, gồm hồi quy `request-status-*`, `in-app-notifications`, `step-reassignment*`, `controlled-wait`, `access-request-*`, `spend-*`, `budget-*`, `operating-parameters-http`) | như trên              | 167 suite, 2431 ca xanh (1 suite tùy chọn về kho đối tượng thật và 4 ca bỏ qua), exit 0        | —                                                                                                                     |
| `pnpm openapi:export`, `pnpm test:e2e` (toàn bộ e2e, gồm `api-inventory` 228 thao tác và `openapi-export`)                                                                                                 | như trên              | 32 suite, 850 ca xanh                                                                          | —                                                                                                                     |
| `migrate deploy` trên CSDL tạm rồi `migrate diff --from-config-datasource --to-schema prisma --exit-code`; `pnpm prisma:validate`                                                                          | như trên              | không khác biệt; schema hợp lệ                                                                 | CSDL tạm đã xóa                                                                                                       |
| `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:discovery`                                                                                                                                         | như trên              | sạch; build exit 0; discovery 176 unit, 32 e2e, 168 tích hợp                                   | —                                                                                                                     |
| `pnpm rules:check`, `pnpm rules:format`, `pnpm rules:test`, `pnpm format:check`, `pnpm test:scripts`                                                                                                       | như trên              | xanh (273 file, 1923 liên kết, 0 lỗi; `rules:test` 38 ca, `test:scripts` 30 ca; prettier sạch) | —                                                                                                                     |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker. Vế chưa làm: bước _quyết định khoản chi chưa có căn cứ_ (`US-05-09` AC-7) thuộc `g3-downstream-finance-integration`; ca đầu cuối _đổi Người duyệt chi_ (`US-05-10` AC-5) chạy ở `g5-step-reassignment-and-controlled-wait`.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có. Các test viết sau khi code (chưa có bằng chứng đỏ-trước); `request-timing.repo.ts` vẫn suy `QUEUE_WAIT` từ dữ liệu có sẵn, chưa đọc `spend_queued_at` (để không đổi một hạng mục đã `verified`).
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

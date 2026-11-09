# Plan: xác định lại người được giao khi dữ liệu tổ chức đổi và chờ có kiểm soát

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (23/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự commit hay push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với cây làm việc ngày 24/10/2026, sau khi `g5-request-withdrawal`, `g5-service-account-request`, `g6-revocation-by-grant-kind` và `g5-return-and-renewal-requests` đã vào. Repo có các hàm định tuyến thuần (`routeNeedStep`, `routeSpendStep`, `routeFinanceReview`), `RoutingFactsService` (đã lọc người nghỉ việc ở bước nhu cầu), các bước chờ (`WAITING` với `waiting_reason`, Request `WAITING_CONTROLLED`), lệnh gán và gỡ trưởng phòng và mẫu người nghe đăng ký lúc khởi động (`BudgetsService.registerChangeListener`). Repo **chưa** có và hạng mục đã dựng: hợp đồng báo thay đổi tổ chức (`g6-transfer-record` còn `not-started`, nên tạo đúng chữ ký của nó cùng một bên phát tối thiểu) và vai, chỗ đổi người giữ một bước đang mở, cảnh báo lúc vào chờ, hàng đợi chờ có kiểm soát, lượt quét, `RequestWorkLoop` và `requests-work-facade.module.ts` (`g5-step-sla-and-alerts` chưa làm); `SpendRoutingService.openSpend` giao bước chi cho người nghỉ việc vì không lọc (đã sửa). **Chưa có và không dựng:** hộp thông báo và `NotificationsService.notifyInApp` (Phase 1 của `g5-request-status-notifications` còn `not-started`), nên Task 7 ghi cảnh báo nhưng không gửi vào hộp thư. Request `RENEWAL` và Request tài khoản dịch vụ đi qua cùng bước nhu cầu; Request tài khoản dịch vụ giữ phòng đã gửi (`QĐ-86c`). Bước nhu cầu xác nhận khi gửi thay là bước `APPROVED` nên không bị chạm.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md` (và `roadmap.md`, do người tích hợp cập nhật)
- Depends on: hạng mục phụ thuộc
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh
- Kết quả: xong; `pnpm rules:check` xanh (0 lỗi).

### Task 2: dữ liệu

- Files: migration `20261024041000_requests_step_waiting_since`, `20261024041100_requests_controlled_wait_alerts`, `requests.prisma`, `organization.prisma` (quan hệ ngược của `Employee`, `Department`), `architecture-boundaries.spec.ts` (`PRISMA_MODEL_OWNER`)
- Depends on: Task 1
- Acceptance: `waiting_since` do trigger đặt khi vào `WAITING` và xóa khi rời, `CHECK` đồng bộ với trạng thái, dòng cũ đang chờ được gán `created_at`; cảnh báo duy nhất mỗi đợt chờ (`23505`) và chỉ ghi thêm (`23001`); `access_request_steps_holder_check` vẫn đúng khi chuyển giữ ↔ chờ
- Verify: nhóm _what the database refuses_ của `step-reassignment-constraints` xanh; `migrate diff --exit-code` = 0
- Kết quả: xong. `20261024100000_requests_step_waiting_since` và `20261024100100_requests_controlled_wait_alerts`; `step-reassignment-constraints` 8 ca xanh; `migrate diff --exit-code` = 0 (cột thật, `CHECK`, trigger, `23505`, `23001`; dòng cũ đang chờ được gán `created_at` trong migration, không có test riêng cho bước dữ liệu cũ).

### Task 3: quy tắc thuần

- Files: `src/modules/requests/reassignment/reassignment.policy.ts` (+ spec)
- Depends on: Task 1
- Acceptance: bảng loại bước × sự kiện, bước đang chờ luôn được thử giao lại, `KEEP`/`ASSIGN`/`WAIT`, người đích là bên liên quan không được giao, gợi ý cấu hình cho từng lý do chờ; danh sách sự kiện là bảng đóng
- Verify: ít nhất 24 ca chính sách xanh
- Kết quả: xong. `reassignment.policy.ts`; 48 ca xanh.

### Task 4: hợp đồng người nghe phía `organization`

- Files: `src/modules/organization/public/organization.types.ts`, `organization.service.ts`, `department/department-head.service.ts` (+ spec), `module-graph.spec.ts`, `architecture-structure.spec.ts`
- Depends on: Task 1 (và `g6-transfer-record` nếu đã implement: khi đó chỉ thêm loại `EMPLOYEE_LEFT`, không tạo lại kiểu)
- Acceptance: `OrganizationChange`, `OrganizationChangeListener` và `registerChangeListener` đúng như spec `g6-transfer-record` (nếu chưa có thì tạo đúng chữ ký đó cùng một bên phát tối thiểu trong `organization`, để G6 xây bảng thông báo và tác vụ quét lên trên); thêm loại `EMPLOYEE_LEFT`; người nghe chạy trong transaction của thay đổi gốc theo thứ tự đăng ký và một người nghe ném lỗi thì thay đổi đó hoàn tác; `assign` và `vacate` trưởng phòng hiệu lực hôm nay phát `HEAD_PERIOD_END` và `HEAD_PERIOD_START` trong transaction của chúng; không import `requests`
- Verify: ca tích hợp người nghe giả xanh; nhóm `department` hiện có xanh; `jest src` (kiến trúc) xanh
- Kết quả: xong, khác kế hoạch ở chỗ `g6-transfer-record` chưa có nên hạng mục tạo `OrganizationChange`, sổ người nghe, `registerChangeListener`, `emitChange` và bên phát cho `assign`/`vacate` hiệu lực hôm nay (kể cả giai đoạn mở rồi hủy trong ngày). Thêm tham số `tx` tùy chọn cho bốn hàm đọc của facade để người nghe đọc dữ liệu của transaction gốc; `organization.service.ts` ở 399 dòng. Unit: 4 ca sổ, 4 ca bên phát; tích hợp: người nghe thật và người nghe ném lỗi.

### Task 5: hợp đồng người nghe phía `identity-access`

- Files: `src/modules/identity-access/public/identity-access.types.ts`, `identity-access.service.ts`, `approval-roles/approval-role.service.ts`, `accounts/role-grant.service.ts` (+ spec), `module-graph.spec.ts`
- Depends on: Task 1
- Acceptance: `ApprovalRoleChange`, `ApprovalRoleChangeListener`, `registerApprovalRoleListener`; gán, gỡ ba vai duyệt và cấp, thu vai `FINANCE` phát trong transaction của chính lệnh với `id`, người cũ, người mới; registry là provider đơn nhất dùng chung API và worker
- Verify: ca tích hợp người nghe giả xanh; nhóm `approval-roles` và `role-grant` hiện có xanh
- Kết quả: xong. Phát từ `ApprovalRoleService.set` và từ `RoleGrantService.grantRole`/`revokeRole` cho `FINANCE` (một chỗ phủ cả lệnh cấp, cấp lúc mời và thu vai, nên không sửa `account-status.service.ts`); sổ là provider của `IdentityAccessFacadeModule`. Unit: 2 ca sổ.

### Task 6: xác định lại phía `requests`

- Files: `reassignment/step-target.service.ts`, `reassignment/step-reassignment.repo.ts`, `reassignment/step-reassignment.service.ts`, `reassignment/organization-change.listener.ts`, `reassignment/approval-role.listener.ts`, `requests.module.ts` (đăng ký lúc khởi động), `spend/spend-routing.service.ts` (lọc người nghỉ việc), `architecture-structure.spec.ts` (hợp đồng nội module), `step-reassignment.integration-spec.ts`
- Depends on: Task 2, Task 3, Task 4, Task 5
- Acceptance: bốn sự kiện của `FR-3.16` đổi đúng bước, `created_at` không đổi, `policy` không bị ghi, Audit `STEP_REDETERMINED`, `STEP_WAITING`, `STEP_ASSIGNED_FROM_WAIT` đủ nguồn, người cũ, người mới; Request khóa theo id tăng; trạng thái Request theo bước; `samePersonAsSpend` tính lại; bước chi và tác vụ cấp không bị chạm khi đổi phòng; `openSpend` và `openReview` không giao người đã nghỉ việc
- Verify: nhóm AC-1 → AC-9 của `US-05-12`, _cửa và người nghe_, _idempotent_, _sửa lỗi `openSpend`_ xanh; hồi quy `spend-routing`, `spend-budget-check` xanh
- Kết quả: xong. `step-reassignment.integration-spec` 17 ca xanh (nhóm `US-05-12`, người nghe, đồng thời, idempotent); sửa `openSpend` có ca ở `controlled-wait`; hồi quy `spend-*`, `access-request-*`: xem bảng bên dưới.

### Task 7: chờ có kiểm soát: cảnh báo

- Files: `reassignment/controlled-wait.repo.ts`, `reassignment/controlled-wait-alert.service.ts`, `step-reassignment.integration-spec.ts`, `controlled-wait.integration-spec.ts`
- Depends on: Task 6, **`g5-request-status-notifications` Phase 1 `verified`**, `IdentityAccessService.findUsableSuperAdminEmployeeId` (Task 5 của `g5-step-sla-and-alerts`; nếu chưa có, làm ở đây với cùng chữ ký)
- Acceptance: mỗi đợt chờ có đúng một cảnh báo (thông báo `CONTROLLED_WAIT_ALERT` cho Super Admin, thêm IT Admin phụ trách khi phòng thiếu cả trưởng phòng lẫn approver dự phòng, Audit `STEP_WAIT_ALERTED`) trong cùng transaction với việc chuyển giữ → chờ; bước chờ từ lúc tạo được cảnh báo ở lượt quét kế; giao tiếp thì cờ gỡ, SLA không đặt lại
- Verify: nhóm AC-1 → AC-9 của `US-05-11` xanh
- Kết quả: xong **một phần**. Cảnh báo (hàng `controlled_wait_alerts` và audit `STEP_WAIT_ALERTED` nêu người nhận theo vai) ghi một lần cho mỗi đợt chờ, trong transaction của sự kiện khi bước chuyển giữ → chờ và ở lượt quét kế cho bước chờ từ lúc tạo; giao tiếp thì cờ gỡ, hạn không đặt lại. **Chưa làm:** thông báo vào hộp thư của Super Admin và IT Admin (hộp thư chưa có, Phase 1 của `g5-request-status-notifications`); không cần `findUsableSuperAdminEmployeeId`. `controlled-wait.integration-spec` 10 ca xanh. **Cập nhật 24/10/2026:** `g5-request-status-notifications` đã giao phần còn lại: bộ chiếu của worker đọc `STEP_WAIT_ALERTED` và đưa `CONTROLLED_WAIT_ALERT` vào hộp thư của Super Admin (và IT Admin phụ trách khi sự kiện nêu), đọc `STEP_WAITING`, `STEP_ASSIGNED_FROM_WAIT`, `STEP_REDETERMINED` cho người yêu cầu và người giữ mới; `IdentityAccessService.findUsableSuperAdminEmployeeId` do hạng mục đó thêm với đúng chữ ký này.

### Task 8: lượt quét ngày hiệu lực và bước chờ

- Files: `src/modules/requests/public/step-redetermination-sweep.api.ts`, `src/modules/requests/requests-work-facade.module.ts`, `src/worker/request-work.job.ts` (+ spec), `src/worker/worker.module.ts`, `module-graph.spec.ts`, `architecture-boundaries.spec.ts`, `ARCHITECTURE.md`
- Depends on: Task 6, Task 7
- Acceptance: lượt quét thử giao lại mọi bước đang chờ và tạo cảnh báo còn thiếu, xác định lại bước do người đã nghỉ việc giữ, và một lần mỗi ngày nhặt sự kiện tới ngày hiệu lực; không ghi gì khi dữ liệu không đổi; từng Request một transaction; hai worker song song không trùng; nếu hạng mục anh em đã tạo `RequestWorkLoop` và module facade thì thêm lời gọi, không tạo thứ hai
- Verify: ca ngày hiệu lực (phòng và trưởng phòng ghi cho ngày mai) xanh; `worker/request-work.job.spec.ts` xanh; `jest src` xanh
- Kết quả: xong. `StepRedeterminationSweepService`, `RequestWorkLoop` (4 ca unit), `REQUEST_WORK_INTERVAL_MS` (ca unit ở `env-schema.spec`), `RequestsWorkFacadeModule` (hạng mục anh em chưa tạo nên tạo ở đây); ca ngày hiệu lực (ngày mai không đổi, đến ngày thì đổi) xanh. Hai worker song song chưa có test riêng.

### Task 9: API, hồi quy, tài liệu

- Files: `reassignment/controlled-wait.controller.ts`, `reassignment/controlled-wait.dto.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `api-collection-contract.spec.ts` (nếu cần), `openapi.json`, `ARCHITECTURE.md` (hàng `organization`, `identity-access`, `requests`), `docs/roadmap.md` (do người tích hợp)
- Depends on: Task 7
- Acceptance: `GET /controlled-waits` đúng phạm vi vai, thứ tự có khóa phụ, số câu lệnh không phụ thuộc số dòng, không số tiền hay mã kiểm tra; tài liệu mô tả hai hợp đồng người nghe và loại sự kiện `EMPLOYEE_LEFT` mà `g6-offboarding-record` phải phát
- Verify: `controlled-wait` xanh; e2e kiểm kê và OpenAPI xanh; `jest src` xanh; hồi quy `access-request`, `spend`, `budget`, `department`, `approval-roles` xanh; `pnpm rules:check` và `pnpm rules:format` → xanh
- Kết quả: xong. `GET /controlled-waits`, `api-coverage-manifest`, kiểm kê 218 → 219, `openapi.json`, `ARCHITECTURE.md` (Requests, `organization/`, `identity-access/`, worker), `.env.example`, roadmap và chỉ mục hạng mục; ghi chú một dòng ở spec của `g6-transfer-record`.

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 24/10/2026 trên cây làm việc chưa commit, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                                                         | Revision / môi trường | Kết quả thực chạy                                                               | Giới hạn / việc còn lại                                                                  |
| ---------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `step-reassignment-constraints.integration-spec`                                                           | PostgreSQL 17 Docker  | 8 ca xanh                                                                       | —                                                                                        |
| `step-reassignment.integration-spec`                                                                       | như trên              | 17 ca xanh                                                                      | Request tạo thay (`US-05-12` AC-9) chưa có test riêng; hai worker song song chưa có test |
| `controlled-wait.integration-spec`                                                                         | như trên              | 10 ca xanh                                                                      | thông báo vào hộp thư chưa làm (chưa có hộp thư)                                         |
| `reassignment.policy.spec.ts`                                                                              | như trên              | 48 ca xanh                                                                      | —                                                                                        |
| `pnpm exec jest` (unit, gồm kiến trúc, hợp đồng, OpenAPI)                                                  | như trên              | 170 suite, 2498 ca xanh                                                         | —                                                                                        |
| `pnpm exec jest --config ./test/config/jest.integration.cjs --runInBand` (toàn bộ)                         | như trên              | 158 suite, 2319 ca xanh (1 suite tùy chọn về kho đối tượng thật và 4 ca bỏ qua) | —                                                                                        |
| `pnpm openapi:export`, `pnpm test:e2e` (toàn bộ e2e, gồm `api-inventory` 219 thao tác và `openapi-export`) | như trên              | 32 suite, 850 ca xanh                                                           | —                                                                                        |
| `migrate deploy` trên CSDL rỗng, `migrate diff --exit-code`                                                | như trên              | không khác biệt                                                                 | —                                                                                        |
| `tsc --noEmit`, `pnpm lint`, `prettier --check`                                                            | như trên              | sạch                                                                            | —                                                                                        |
| `pnpm rules:check`, `pnpm rules:format`, `pnpm test:discovery`                                             | như trên              | xanh                                                                            | —                                                                                        |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (thông báo vào hộp thư: blocker là Phase 1 của `g5-request-status-notifications`).
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có. Các test viết sau khi code, chưa có bằng chứng đỏ-trước.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

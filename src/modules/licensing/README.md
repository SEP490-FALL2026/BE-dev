# licensing

Mục đích: quyền dùng phần mềm của người — assignment ghế, đóng seat baseline, hàng đợi provisioning (grant và thu
hồi), bàn giao trước khi thu hồi, quyền hết hạn, kho license key, báo lỗi SaaS, danh sách quyền của chính Employee và
gia hạn subscription (đề xuất, quyết định, kết quả, mốc cảnh báo, sự cố tự gia hạn). Story chính: US-02-05, US-03-05,
US-03-06, US-03-08, US-03-09, US-04-12, US-05-14, US-07-01, US-07-02, US-07-04, US-07-05, US-07-09 → US-07-11,
US-11-01 → US-11-05 (một phần, xem `docs/workspace/items/a06-*`); phần đọc "Phần mềm của tôi" của US-12-15 AC-2 và
US-16-01 AC-1; số đếm cho trang tổng quan theo vai (US-12-15 AC-2, AC-3, AC-4).
Tầng: T4 (`scripts/arch/tiers.cjs`). Phụ thuộc: catalog, organization, identity-access, operating-parameters, audit,
notifications, finance (đơn vị tiền của tiết kiệm gia hạn). Được dùng bởi: requests, personnel, data-import, onboarding,
dashboards; gốc `src/app/app.module.ts`.

## Public API (`public/`)

- Facade, mỗi facade ≤ 8 phụ thuộc, tên method không đổi; consumer inject facade sở hữu method (module export các facade này):
  - `LicensingApi` ([public/licensing.api.ts](public/licensing.api.ts)) — thu hồi, task grant, ghế của người:
    - `openRevocation` — cửa duy nhất mở thu hồi một ghế cá nhân, cho mọi nguồn (trả ghế, nghỉ việc, hết hạn…); tham số
      tùy chọn `timing { dueOn?, notBefore? }` (mốc không-trước, ân hạn do MF-5 truyền) và `notice { holder: true }` (báo
      người giữ `REVOCATION_UPCOMING`, một lần theo `(source, referenceId)`); không truyền ⟹ hành vi như cũ.
    - `withdrawRevocationReason` — nguồn gỡ lý do của chính mình: còn lý do khác ⟹ `CONTINUES`; hết lý do ⟹ tác vụ
      `CANCELLED` (`NO_LONGER_APPLIES`, ghế không đổi), riêng tác vụ `IN_PROGRESS` chỉ hủy khi
      `cancelInProgressClaimedBy` đúng người nhận, ngược lại `IT_ADMIN_TO_CLOSE`; gọi lại ⟹ `NOT_FOUND`/`ALREADY_ENDED`.
    - `lockGrantOfRequest`, `completedGrantOfRequest`, `cancelGrantOfRequest` — task grant của một request;
      `recordProvisioningFailure` — ghi lần thử connector lỗi (US-07-04).
    - `listPersonalSeatsOf`, `countPersonalSeatsOf`, `getSeatsHeldInPlans`, `listTerminatingAccess`,
      `listRevocationsOpenedFor` — đọc ghế của người; `selfExecutionMode` — IT Admin có được làm việc cho chính mình
      không (`QĐ-77m`).
    - `pageHeldSoftwareOf` — phần mềm người đó đang giữ hôm nay (ghế cá nhân đã bắt đầu, chưa hỏng/hủy/hết), một trang và
      tổng, cùng snapshot `RepeatableRead`, 3 câu lệnh dù bao nhiêu ghế; trưởng phòng đọc một thành viên
      (`personnel/department-member`).
  - `LicensingUsageApi` ([public/licensing-usage.api.ts](public/licensing-usage.api.ts)) — ghế đọc cho usage nhà cung cấp
    (`qd103-vendor-usage-import`): `listAssignmentIntervals` (các khoảng giữ ghế của một ứng dụng hoặc vài plan trong `[from, to]`, kèm
    `chainRootId` và `usableOn` theo `QĐ-77n` — mắt xích đầu của chuỗi gia hạn; 3 câu lệnh dù bao nhiêu ghế),
    `findHoldersByAccountIdentifiers` (người giữ hoặc từng giữ ghế dưới một định danh tài khoản), `listCurrentHolders` (người đang giữ
    ghế một ứng dụng, người nhận thông báo theo dõi). Chỉ đọc; `usage` là bên gọi.
  - `LicensingHandoverApi` ([public/licensing-handover.api.ts](public/licensing-handover.api.ts)) — bàn giao:
    `openHandoverDuties`, `reconcileHandoverDuties`, `cancelHandoverDuties`, `getHandoverDutiesOf`.
  - `LicensingRenewalApi` ([public/licensing-renewal.api.ts](public/licensing-renewal.api.ts)) — trả ghế và gia hạn
    (US-05-14): `getAssignmentFacts`, `renewAssignment`, `hasPendingRenewal`.
  - `LicensingOpenGrantsApi` ([public/licensing-open-grants.api.ts](public/licensing-open-grants.api.ts)) —
    `listOpenGrantTasksOfBeneficiary`, `listHeldSeatsOfRequests` (seat của Request còn giữ ngày `on`, đi theo chuỗi `predecessor_id` — `HANDOVER`,
    gia hạn quyền, `RENEWAL_CARRY` — tới bản ghi đang chạy, từ grant của Request hoặc bản ghi Request nêu; trả phòng sở hữu hiện tại và các bản
    ghi sau gốc; là thứ khoản 01/01 đếm, `BR-MF1-09e`).
  - `LicensingServiceAccountApi` ([public/licensing-service-account.api.ts](public/licensing-service-account.api.ts)) —
    `listServiceAccountDuties`, `remindServiceAccountDuties` (nhắc IT Admin phụ trách phòng sở hữu vào hộp thông báo, gọi từ
    hook hồ sơ của personnel).
  - `LicensingDashboardApi` ([public/licensing-dashboard.api.ts](public/licensing-dashboard.api.ts)) — số đếm cho trang tổng
    quan theo vai (dashboards): `employeeFacts`, `departmentFacts`, `itAdminFacts`; type ở `licensing-dashboard.types.ts`.
  - `LicensingSeatBaselineApi` ([public/licensing-seat-baseline.api.ts](public/licensing-seat-baseline.api.ts)) — seat
    baseline (data-import, onboarding): `seatTargetRef`, `resolveBaselineTarget`, `lockBaselineTarget`, `baselineFacts`,
    `createBaselineAssignments`, `getBaselineProgress`, `openSeatHolders`.
- `public/licensing.types.ts` — input/output của facade; `public/licensing-*.types.ts` — type theo nhóm việc.
- `public/licensing.errors.ts` — lỗi nghiệp vụ (`SeatBaselineClosedError`, `RevocationRefusedError`, `Provisioning*`…).
- `public/licensing.extension-points.ts` — bảy point dưới đây, contract và union sự kiện `RevocationEvent`.
- `public/licensing-subscription-renewal.types.ts` — contract của hai point gia hạn: `RenewalFinancialReader`
  (snapshot tiền của người quyết) và `RenewalUsageReader` (bằng chứng sử dụng từng ghế).

## Bảng sở hữu

- `license_assignments`, `seat_baseline_states`, `provisioning_tasks`, `provisioning_task_reasons`, `handover_duties`,
  `service_account_duty_notices`, `assignment_expiry_reminders`, `assignment_renewal_windows`, `license_keys`, `license_key_reveal_windows`,
  `saas_issues`, `saas_issue_entries`, `saas_issue_counters`, `subscription_renewals`,
  `subscription_renewal_released_seats`, `subscription_deadline_events` (`prisma/models/licensing.prisma`).

## Extension point

- Mở `GrantRequestGateHook` (`licensing.grant-request-gate`, Hook) — requests
  `access-request/grant/access-request-grant.listener.ts`.
- Mở `RevocationListeners` (`licensing.revocation`, Listeners) — licensing `handover/handover-revocation.listener.ts`,
  requests `return-request/return-revocation.listener.ts`. Moment: `OPENED`, `BEFORE_WORK`, `AFTER_WORK`, `CLOSED_FAILED`,
  `REASON_WITHDRAWN { task, withdrawn, remaining, cancelled }` (bàn giao tính lại duty từ `remaining`; return bỏ qua).
- Mở `RenewalHoldHook` (`licensing.renewal-hold`, Hook) — requests `renewal-request/renewal-hold.listener.ts`.
- Mở `ResponsibleDeadlineHook` (`licensing.responsible-deadline`, Hook) — personnel
  `service-account/personnel-file-deadlines.listener.ts`.
- Bind `SeatBaselinePhaseHook` (catalog, `catalog.seat-baseline-phase`) — `seat-baseline/seat-baseline-phase.listener.ts`.
- Mở `SeatBaselineClosedListeners` (`licensing.seat-baseline-closed`, Listeners) — personnel
  `transfer-review/post-setup-review.listener.ts`.
- Mở `RenewalFinancialContributions` (`licensing.renewal-financial-snapshot`, Contributions) — chưa có bên thêm: module
  sở hữu ngân sách/chi phí (requests/budgets) thêm reader; chưa có thì snapshot đóng băng ghi `NOT_CONNECTED`, không 0.
- Mở `RenewalUsageContributions` (`licensing.renewal-usage-evidence`, Contributions) — chưa có bên thêm: chủ evidence
  usage (G7) thêm reader; chưa có thì gia hạn nói `usage NOT_AVAILABLE` và xếp ghế không dùng dữ liệu sử dụng.
- Gia hạn không còn listener chờ Người duyệt chi (`QĐ-94d`(2)): người xác nhận là trưởng phòng của phòng sở hữu thuê bao vào ngày
  quyết; phòng chưa có trưởng phòng ⟹ hồ sơ `waitingReason = NO_HEAD`, Super Admin nhận một `CONTROLLED_WAIT_ALERT` lúc đề xuất.
- Đăng ký vào: `catalog.seat-occupancy` — `assignment/assignment-seat-occupancy.listener.ts`;
  `organization.department-service-account-reader` — `assignment/assignment-service-account.listener.ts`;
  `organization.department-use-readers` — `provisioning/department-use/department-open-work.listener.ts`.

## Hướng phụ thuộc giữa capability (R6)

Không vòng (`pnpm arch:capabilities --module licensing`, gate `capability-graph`). Từ thấp lên cao: `assignment`,
`license-key`, `saas-issue`, `device-binding` → `provisioning`, `seat-baseline` → `department-tools`, `handover` → `expiry` →
`my-software`, `subscription-renewal` (đọc ghế, mở thu hồi qua `RevocationService`, không capability nào import nó) →
`dashboard-facts`. Cạnh
ngược là vòng:
dịch vụ nào đọc cả ghế lẫn thu hồi thì đứng trên cả hai (như `department-tools/`), không import ngược xuống.

## Capability → file chính

- `assignment/` — assignment ghế, đổi người phụ trách service account, ghế của subscription;
  `assignments.controller.ts`, `subscription-seats.controller.ts`; `AssignmentService`, `AssignmentResponsibleService`.
  Con: `service-account-duty/` (US-03-08), `renewal/` (US-05-14).
- `department-tools/` — công cụ phòng ban đang dùng (US-03-06); `department-tools.controller.ts`; `DepartmentToolsService`.
  Đọc ghế của `assignment/` và việc thu hồi của `provisioning/` nên đứng trên cả hai.
- `seat-baseline/` — xem/đóng baseline ghế (US-02-05 AC-6); `seat-baseline.controller.ts`; `SeatBaselineService`.
- `provisioning/` — task grant và thu hồi; `revocation.service.ts` (mở thu hồi) với `RevocationTaskFactory`,
  `RevocationRecorder`, `revocation-open.policy.ts`; `provisioning.policy.ts`. Con: `tasks/`
  (`provisioning-tasks.controller.ts`; grant: `ProvisioningGrantService` → `ProvisioningGrantPlanner` (xét trước khóa) +
  `ProvisioningGrantWriter` (ghi trong transaction), `provisioning-grant.policy.ts`; `ProvisioningService` giữ danh sách,
  claim, hoàn tất, báo lỗi; `ProvisioningDecisionService`), `revocation-completion/`
  (`revocation-tasks.controller.ts`), `grant-cancellation/`, `open-grants/`, `department-use/`.
- `handover/` — xác nhận bàn giao dữ liệu trước khi thu hồi (US-03-09, US-07-09); `handover-duties.controller.ts`;
  `HandoverService`, `HandoverConfirmationService`; `handover-duty.job.ts` nhắc quá hạn mỗi giờ. Người nghỉ việc không phòng
  (`departmentId` null, `D-S18`): `requirementOf` bỏ nguồn `DEPARTURE`/`ABRUPT_DEPARTURE`, nên không có nghĩa vụ trưởng phòng ở
  `open` lẫn `openFromTask` và tác vụ thu hồi không bị giữ; nguồn khác (IT, trả về) giữ nguyên.
- `expiry/` — quyền đã hết hạn, nhắc trước 7 ngày (US-03-05); `expiry.controller.ts`; `expiry-reminder.job.ts`.
  Cửa sổ Request tiếp tục (BR-MF1-08a): `expiry-renewal-window.job.ts` mỗi giờ ghi `assignment_renewal_windows` (số ngày lúc mở, bất biến)
  và báo người giữ + trưởng phòng một lần (`RENEWAL_WINDOW_OPENED`). Tác vụ `EXTEND` (`provisioning/tasks/provisioning-extension.service.ts`,
  mở qua `LicensingRenewalApi.openExtension`) hoàn tất ⟹ `GrantRequestGate.reportExtended`.
- `license-key/` — kho key của mua đứt K4 (US-04-12); `license-keys.controller.ts`; `LicenseKeyService`.
- `my-software/` — "Phần mềm của tôi" (US-12-15 AC-2, US-16-01 AC-1): `my-software.controller.ts`
  (`GET /me/software-rights`, mọi tài khoản đã đăng nhập (`QĐ-95d`), chỉ quyền cá nhân của chính người gọi), `MySoftwareService`, `MySoftwareRepo`;
  trạng thái theo ngày nghiệp vụ ở `my-software.policy.ts`. Không đọc khóa K4, giá, Cost Center hay định danh tài khoản.
- `device-binding/` — contract sổ thiết bị G7 cho K4 (`DeviceRegistryPort`) và luật thuần gán/gỡ/giới hạn khóa theo thiết
  bị; **chưa dùng ở đâu, chưa bind**: sổ thiết bị của Owner chưa có, chỉ có contract test với mock
  (`device-binding.policy.spec.ts`, stand-in `test/support/device-registry-contract-double.ts`). Không import capability nào.
- `dashboard-facts/` — số đếm mà trang tổng quan theo vai đọc (US-12-15 AC-2, AC-3, AC-4), mỗi số bằng tổng của danh sách
  hiện có cùng phạm vi: quyền và quyền sắp hết của Employee (dùng luật của `my-software.policy.ts`), báo lỗi SaaS, ghế phòng ban
  (qua `AssignmentDepartmentRepo`), task cấp/thu hồi và báo lỗi IT Admin phụ trách, key trong kho. `DashboardFactsService`,
  `DashboardFactsRepo`; chỉ trả số, không dòng, giá, key hay định danh.
- `saas-issue/` — báo lỗi quyền SaaS (BM-11, US-07-10, US-07-11); `saas-issues.controller.ts`; `SaasIssueService`,
  `SaasIssueHandlingService`; `saas-issue.job.ts`.
- `subscription-renewal/` — gia hạn subscription theo kỳ (EP-11): `subscription-renewals.controller.ts`
  (`/subscription-renewals*`, `/subscription-deadline-events`); nhóm `proposal/` (IT Admin đề xuất, kèm danh sách ghế thu hồi),
  `decision/` (trưởng phòng sở hữu xác nhận `CONFIRM` đề xuất đúng như đã lập, mở thu hồi; Finance chỉ đọc; đọc theo vai ở
  `subscription-renewal-view.service.ts` + `readScopeOf`), `outcome/` (IT Admin ghi kết quả, kỳ mới nối chuỗi qua `SubscriptionPeriodApi`, chuyển ghế
  `RENEWAL_CARRY`, tiết kiệm `QĐ-66w`), `alerts/` (mốc T−15/T−7, chất lượng dữ liệu), `deadline/` (cờ thực hiện trễ, sự cố tự gia
  hạn/đánh dấu hết hạn); `subscription-renewal.job.ts` chạy mỗi giờ qua `SubscriptionRenewalSweepService`; xếp ghế ở
  `subscription-renewal-ranking.policy.ts`. Quyết định không tạo khoản cam kết ngân sách (`QĐ-62s`). Cột JSON
  `subscription_renewals.decision_snapshot` đi qua codec `subscription-renewal-decision-snapshot.json.ts` (spec cạnh file); audit và thông báo
  của một quyết định ghi ở `decision/renewal-decision-trail.service.ts`.
- Gốc module (dùng chung nhiều capability): `licensing-audit-event.mapper.ts`, `licensing.http-errors.ts`;
  `licensing-alerts.policy.ts` + `licensing-alerts.service.ts` (`LicensingAlerts`) — cảnh báo license `FR-5.14` vào hộp thông báo
  (dòng 3 T−7 ở `expiry/`, dòng 12 bàn giao ở `handover/handover-alert.service.ts`, dòng 13 tài khoản dịch vụ ở
  `assignment/service-account-duty/`, dòng 38 `K1` của người nghỉ ở `provisioning/revocation-completion/`; hạng mục
  `a03-license-inbox-alerts`).

## Kho dùng chung (`shared-pool/`, L0)

- Capability không controller, không import capability licensing nào (đọc bảng bằng SQL), chỉ `CatalogApi`; `provisioning` và `public/LicensingPoolStockApi` dùng nó.
  Seat của mọi thuê bao K2/K4 cùng plan là một kho cho mọi phòng (`QĐ-103d`): cấp không kiểm phòng sở hữu, Assignment cá nhân ghi `owning_department_id` =
  phòng người nhận lúc cấp (tài khoản dịch vụ giữ phòng của tài khoản). `stockOf`: `free` = Σ (`purchased_quantity` − đỉnh số Assignment trên mỗi ngày từ hôm nay
  trở đi, đếm như trigger `license_assignments_seat_capacity`: Assignment `valid_from` tương lai, kể cả seat mang sang kỳ ghi trước ngày bắt đầu, chiếm chỗ
  từ ngày đầu của nó) trên thuê bao cấp được (không gồm `DRAFT`; kỳ đang chạy và kỳ kế tiếp chưa bắt đầu/còn nháp là một kho); `inRevocation` =
  Assignment chưa kết thúc có tác vụ thu hồi chưa đóng.
- `provisioningTaskGrant`: `subscriptionId` tùy chọn (không có ⟹ `chooseSubscription`: thuê bao chính, ưu tiên cái còn chỗ Trống; K5 không được có);
  có mà không thuộc `getGrantableSubscriptions` của gói hôm nay (kỳ đã hết, hoặc kỳ kế tiếp đã chạy) ⟹ 422 `PROVISIONING.SUBSCRIPTION_NOT_GRANTABLE`.
  `purchase?: { reason? }` chỉ K2/K4 (K khác ⟹ 422 `PURCHASE_NOT_APPLICABLE`): còn Trống ⟹ 409 `PURCHASE_NOT_ALLOWED` (audit
  `PROVISIONING_TASK.PURCHASE_REFUSED` ghi ở transaction riêng sau rollback); hết kho + còn seat đang thu hồi + thiếu lý do ⟹ 422
  `PURCHASE_REASON_REQUIRED`; ngược lại `CatalogApi.addPoolSeat` (+1 seat/lần) rồi ghi Assignment, task có `purchase_kind` (`POOL_TOP_UP`/`KEY_PURCHASE`).
  Không `purchase` mà thuê bao hết chỗ ⟹ 409 `LICENSE_ASSIGNMENT.SEAT_CAPACITY` kèm `details.freeSeatsInPool`. K1 không thuộc kho: mỗi lần cấp tự +1 số lượng
  trong cùng transaction, không cổng phòng sở hữu (S1-04), và tác vụ ghi `purchase_kind = K1_SUBSCRIPTION` (dấu đã mua cho hóa đơn `SBF-19`).
- _Tránh được_ (`BR-MF1-09c`): hoàn tất tác vụ cấp K2/K4 không mua ⟹ `recordAvoided` một dòng (idempotent theo tác vụ), theo tiền báo cáo (giá đã quy
  đổi lúc ghi giá; K4 = giá mua của thuê bao `PERPETUAL`); `reportOutcome(..., facts)` báo `fromPool`,
  `provisioningType`, `grantedOn`, `assignmentId` cho `requests` (audit `GRANT_COMPLETED.after.fromPool`).
- `grantQueueList` (module `requests`) đọc `stock { kind, free, inRevocation }` qua `LicensingPoolStockApi.getStockOfPlans` (số lần đọc cố định, không N+1).
- Thu hồi hoàn tất phát `RevocationTaskFacts.completed` (`grantRequestId` qua chuỗi `predecessor_id` — `assignment-chain.repo.ts`, `provisioningType`, `endedOn`,
  `paidThroughOn`, `sources`) để module cam kết giải phóng theo ngày (`public/seat-month-cost.policy.ts`: RV-07, M-10). Phần ghi vào cam kết thuộc `budgets`/`requests`, chưa nối.
- Thứ tự khóa của grant: request → thuê bao `FOR UPDATE` → plan `FOR SHARE` → người; đếm `free` không khóa thuê bao khác của plan.

## Bất biến quan trọng

- Assignment không bao giờ bị xóa; chỉ đổi khi kết thúc, failed hoặc cancelled, ngày dự kiến kết thúc đã đặt thì không
  sửa — đổi là gia hạn, bản ghi mới (trigger `license_assignment_reject_change`). Một người không giữ hai ghế cá nhân
  chồng thời gian trên cùng subscription/plan (`license_assignments_personal_no_overlap`, INV-02).
- Thu hồi chỉ mở qua `openRevocation`, trong transaction của nguồn; ghế được trả khi task hoàn tất; gọi lại cùng nguồn
  và reference không đổi gì.
- Mốc thu hồi (`BR-MF5-04`): mỗi lý do giữ `due_on`/`not_before` của nơi gọi; tác vụ giữ mốc suy ra từ các lý do còn hiệu
  lực — **lý do không mốc thắng ân hạn** (một lý do không `not_before` ⟹ tác vụ không mốc, R-J08), ngược lại `MIN`.
  `claim` và `revocation-completion` trước `not_before` ⟹ 409 `PROVISIONING_TASK.NOT_BEFORE` (`details.notBefore`).
- **Lý do đã gỡ không được đọc ở đâu** (chỉ `listAllOf` cho lịch sử trên thẻ tác vụ): `find`, `listOf`, `countOf`,
  `listRevocationsOpenedFor`, `listPersonalSeatsOf` (đang thu hồi), bàn giao đều lọc `withdrawn_at IS NULL`; index
  duy nhất lý do là partial `WHERE withdrawn_at IS NULL` nên mở lại cùng `(source, reference)` trên cùng tác vụ được.
- Thứ tự khóa: task grant trước request (`lockGrantOfRequest`); đích ghế subscription `FOR UPDATE`, plan nội bộ
  `FOR SHARE`; `createBaselineAssignments` giữ baseline state `FOR SHARE` nên việc đóng baseline phải chờ. Đóng
  baseline là vĩnh viễn (không route mở lại); sau đó assignment chỉ đến từ request.
- `RevocationListeners` chạy theo thứ tự thêm (handover của licensing trước return của requests), dừng ở listener đầu
  tiên ném lỗi; thứ tự được ghim trong `provisioning-revocation-read-contracts.integration-spec.ts`.
- Gia hạn: một case mỗi kỳ subscription; đề xuất, quyết định, kết quả mỗi phần ghi một lần rồi đóng băng (trigger
  `subscription_renewals_guard`); kỳ mới nối chuỗi tối đa một (`subscriptions_renewed_from_id_key`); ghế chỉ chuyển khi số
  ghế giữ ở ngày đầu kỳ mới ≤ số mua; khóa: case → subscription cũ `FOR UPDATE` → ghế. Không bao giờ tạo commitment.
- License key mã hóa AES-256-GCM, id hàng và key id là dữ liệu xác thực (`license-key-cipher.service.ts`); chỉ IT
  Admin, không route xóa hay xuất key.

## Test

- Unit: `src/modules/licensing/**/*.spec.ts`; HTTP: `test/http/licensing/`; integration: `test/integration/licensing/`.

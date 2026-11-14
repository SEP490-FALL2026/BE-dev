# licensing

Mục đích: quyền dùng phần mềm của người — assignment ghế, đóng seat baseline, hàng đợi provisioning (grant và thu
hồi), quyền hết hạn, kho license key, báo lỗi SaaS, danh sách quyền của chính Employee và
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
      Tham số tùy chọn `operator` (thủ tục có kiểm soát): audit ghi `OPERATOR` thay vì tài khoản đứng thế.
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
  - `LicensingRenewalApi` ([public/licensing-renewal.api.ts](public/licensing-renewal.api.ts)) — trả ghế và gia hạn
    (US-05-14): `getAssignmentFacts`, `renewAssignment`, `hasPendingRenewal`.
  - `LicensingOpenGrantsApi` ([public/licensing-open-grants.api.ts](public/licensing-open-grants.api.ts)) —
    `listOpenGrantTasksOfBeneficiary`, `listHeldSeatsOfRequests` (seat của Request còn giữ ngày `on`, đi theo chuỗi `predecessor_id` — `HANDOVER`,
    gia hạn quyền, `RENEWAL_CARRY` — tới bản ghi đang chạy, từ grant của Request hoặc bản ghi Request nêu; trả phòng sở hữu hiện tại và các bản
    ghi sau gốc; là thứ khoản 01/01 đếm, `BR-MF1-09e`).
  - `LicensingDashboardApi` ([public/licensing-dashboard.api.ts](public/licensing-dashboard.api.ts)) — số đếm cho trang tổng
    quan theo vai (dashboards): `employeeFacts`, `departmentFacts`, `itAdminFacts`; type ở `licensing-dashboard.types.ts`.
  - `LicensingSeatBaselineApi` ([public/licensing-seat-baseline.api.ts](public/licensing-seat-baseline.api.ts)) — seat
    baseline (data-import, onboarding): `seatTargetRef`, `resolveBaselineTarget`, `lockBaselineTarget`, `baselineFacts`,
    `createBaselineAssignments`, `getBaselineProgress`, `openSeatHolders`.
  - `LicensingDepartmentToolsApi` ([public/licensing-department-tools.api.ts](public/licensing-department-tools.api.ts)) — danh sách phần mềm của phòng
    (DS.4, `QĐ-111c`; một facade riêng vì `LicensingApi` đã 8 phụ thuộc): `addDepartmentSoftwareFromCatalogLink(tx, actor, { departmentId, applicationId, planId, note? })` →
    `{ entryId, added }` cho tick "thêm vào danh sách phòng" của `POST /access-requests/{id}/catalog-link` (SPEC FE IN-1; `requests` gọi trong transaction của nó, ở
    gói IN-1). Idempotent: chỗ đã có ⟹ `added: false`, không Audit, không làm hỏng transaction của người gọi; ngoài danh mục ⟹ `DepartmentSoftwareNotInCatalogError`,
    phòng không có ⟹ `ToolsDepartmentNotFoundError` (cả hai ở `licensing.errors.ts`). Không xét lại phạm vi IT Admin: người gọi đã xét trên Request; type ở `licensing-department-tools.types.ts`.
- `public/licensing.types.ts` — input/output của facade; `public/licensing-*.types.ts` — type theo nhóm việc.
- `public/licensing.errors.ts` — lỗi nghiệp vụ (`SeatBaselineClosedError`, `RevocationRefusedError`, `Provisioning*`…).
- `public/licensing.extension-points.ts` — bảy point dưới đây, contract và union sự kiện `RevocationEvent`.
- `public/licensing-subscription-renewal.types.ts` — contract của hai point gia hạn: `RenewalFinancialReader`
  (snapshot tiền của người quyết) và `RenewalUsageReader` (bằng chứng sử dụng từng ghế).

## Bảng sở hữu

- `license_assignments`, `seat_baseline_states`, `provisioning_tasks`, `provisioning_task_reasons`, `handover_duties` (không còn ghi từ `QĐ-110g`; bảng giữ tới đợt dọn),
  `service_account_duty_notices` (không còn ghi từ `QĐ-110m`; bảng giữ tới đợt dọn), `assignment_expiry_reminders`, `assignment_renewal_windows`, `license_keys`, `license_key_reveal_windows`,
  `saas_issues`, `saas_issue_entries`, `saas_issue_counters`, `subscription_renewals`,
  `subscription_renewal_released_seats`, `subscription_deadline_events` (`prisma/models/licensing.prisma`).

## Extension point

- Mở `GrantRequestGateHook` (`licensing.grant-request-gate`, Hook) — requests
  `access-request/grant/access-request-grant.listener.ts`.
- Mở `RevocationListeners` (`licensing.revocation`, Listeners) — requests `return-request/return-revocation.listener.ts`
  (và các listener khác của requests/optimization bind). Moment: `OPENED`, `BEFORE_WORK`, `AFTER_WORK`, `CLOSED_FAILED`,
  `REASON_WITHDRAWN { task, withdrawn, remaining, cancelled }` (return bỏ qua). Không còn listener bàn giao (`QĐ-110g`).
- Mở `RenewalHoldHook` (`licensing.renewal-hold`, Hook) — requests `renewal-request/renewal-hold.listener.ts`.
- Bind `SeatBaselinePhaseHook` (catalog, `catalog.seat-baseline-phase`) — `seat-baseline/seat-baseline-phase.listener.ts`.
- Mở `SeatBaselineClosedListeners` (`licensing.seat-baseline-closed`, Listeners) — chưa có bên đăng ký (bên duy nhất, rà soát sau thiết lập của
  personnel, đã gỡ ở MF3-A; từ `QĐ-103d` danh sách người giữ ghế phòng khác luôn rỗng).
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
`license-key`, `saas-issue` → `provisioning`, `seat-baseline` → `department-tools`, `expiry` →
`my-software`, `subscription-renewal` (đọc ghế, mở thu hồi qua `RevocationService`, không capability nào import nó) →
`dashboard-facts`. Cạnh
ngược là vòng:
dịch vụ nào đọc cả ghế lẫn thu hồi thì đứng trên cả hai (như `department-tools/`), không import ngược xuống.

## Capability → file chính

- `assignment/` — assignment ghế (đọc danh sách) và ghế của subscription; `assignments.controller.ts`,
  `subscription-seats.controller.ts`; `AssignmentService`. Con: `renewal/` (US-05-14). Không còn tài khoản dịch vụ (`QĐ-110m`): các dòng
  `kind = 'SERVICE'` cũ chỉ còn là lịch sử (hoặc đợi chuyển, xem `…_licensing_service_accounts_converted`).
- `machine-account/` — cờ _dùng cho tài khoản máy_ trên seat cá nhân của IT Admin (`QĐ-110m`, R-9): `POST /license-assignments/{id}/machine-account`;
  `machine-account.controller.ts`, `MachineAccountService`, `machine-account.policy.ts` (thuần: loại seat, đang mở, người giữ là IT Admin dùng
  được). Seat có cờ không tính vào INV-02; bật cờ cần lý do; tắt cờ khi trùng seat cá nhân cùng thuê bao ⟹ 409 `MACHINE_ACCOUNT_OVERLAP`.
- `department-tools/` — công cụ phòng ban đang dùng (US-03-06); `department-tools.controller.ts`; `DepartmentToolsService`.
  Đọc ghế của `assignment/` và việc thu hồi của `provisioning/` nên đứng trên cả hai.
  **Danh sách phần mềm của phòng** (DS, `QĐ-110s`, `QĐ-110t`, `QĐ-111c`, SPEC P16–P18; chỉ hướng dẫn, không tự cấp): bảng `department_software_entries`
  (một dòng cho mỗi (phòng, ứng dụng, gói); unique `NULLS NOT DISTINCT` nên "ứng dụng không gói" chỉ một lần) và `department_software_proposals` (lịch sử đề xuất,
  partial unique một đề xuất `PENDING` cho mỗi chỗ). `department-software.controller.ts`: `GET /departments/{id}/software-list`
  (thành viên phòng, trưởng phòng, mọi IT Admin, Super Admin), `POST …/software-list/changes { add ≤ 50, remove ≤ 50 }` (chỉ IT Admin phụ trách phòng theo phạm vi
  `US-01-11`), `GET /me/department-software-list` (phòng của chính người gọi). `DepartmentSoftwareChangesService` gỡ rồi thêm trong một transaction,
  khóa phòng `FOR SHARE`, `insertEntries` là `ON CONFLICT DO NOTHING` nên trùng ⟹ 409 `DEPARTMENT_SOFTWARE.ALREADY_LISTED` và không ghi gì; ngoài danh mục
  (ứng dụng không có/đã ngừng, gói không thuộc ứng dụng) ⟹ 422 `NOT_IN_CATALOG`; mục không thuộc phòng ⟹ 404 `ENTRY_NOT_FOUND`. Quyền và luật ở
  `department-software.policy.ts` (thuần, có spec); `DepartmentSoftwareAccessService` gom dữ kiện; `DepartmentSoftwareViewService` đặt tên
  (một lần đọc catalog cho cả trang); mọi SQL ở `department-software.repo.ts`. Thứ tự: mới thêm trước rồi `id`. Tên file tiền tố `department-software-` để
  tách khỏi `tools-in-use`.
  **Đề xuất** (DS.3, P18): `department-software-proposals.controller.ts` — `POST /department-software-proposals` (`@RequireRoles('MANAGER')`, phòng = phòng người đó
  đang làm trưởng, thân không nêu phòng; chỉ chỗ trong danh mục ⟹ 422 `NOT_IN_CATALOG`; đã có trong danh sách ⟹ 409 `ALREADY_LISTED`; đã có đề xuất mở ⟹ 409
  `PROPOSAL_ALREADY_OPEN` do partial unique), `GET` (IT Admin theo phạm vi phòng, trưởng phòng theo phòng mình; ngoài phạm vi ⟹ trang rỗng),
  `POST …/{id}/acceptance` (thêm vào danh sách ngay, một lần; đã có do IT thêm tay ⟹ lấy dòng đó) và `…/rejection { reason }` (`@RequireRoles('IT_ADMIN')`; đề xuất của phòng
  mình không phụ trách ⟹ 404; đã quyết ⟹ 409 `PROPOSAL_NOT_PENDING`; hai người quyết cùng lúc ⟹ `UPDATE … WHERE state = 'PENDING'` chỉ một thắng).
  `DepartmentSoftwareProposalService` (một transaction mỗi bước: Audit + thông báo), `DepartmentSoftwareNotice` (`DEPARTMENT_SOFTWARE_PROPOSED` tới IT phụ trách, hoặc mọi IT Admin dùng
  được khi chưa có; `DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED` tới trưởng phòng đã đề xuất, kèm lý do khi từ chối).
- `seat-baseline/` — xem/đóng baseline ghế (US-02-05 AC-6); `seat-baseline.controller.ts`; `SeatBaselineService`.
- `provisioning/` — task grant và thu hồi; `revocation.service.ts` (mở thu hồi) với `RevocationTaskFactory`,
  `RevocationRecorder`, `revocation-open.policy.ts`; `provisioning.policy.ts`. Con: `tasks/`
  (`provisioning-tasks.controller.ts`; grant: `ProvisioningGrantService` → `ProvisioningGrantPlanner` (xét trước khóa) +
  `ProvisioningGrantWriter` (ghi trong transaction; Request xin lại trong ân hạn điều chuyển có `replacesAssignmentId` ⟹ `AssignmentService.endReplacedByGrant` kết thúc quyền cũ cùng thuê bao
  `valid_until` = ngày cấp trước khi chèn quyền mới, R-49; cấp hỏng/hủy ⟹ `giveBackReplaced` mở lại; `LicensingApi.listRegrantedAssignments`), `provisioning-grant.policy.ts`; `ProvisioningService` giữ danh sách,
  claim, hoàn tất, báo lỗi; `ProvisioningDecisionService`), `revocation-completion/`
  (`revocation-tasks.controller.ts`), `grant-cancellation/`, `open-grants/`, `department-use/`, `k1-checklist/` (checklist thu hồi `K1`,
  `QĐ-111az`: biến thể `DEPARTURE` 6 mục / `STILL_EMPLOYED` 2 mục suy từ các lý do còn đứng, kiểm đủ tick + bằng chứng + `doneAt` không giảm theo
  `order`; cột `provisioning_tasks.k1_checklist`, codec `provisioning-k1-checklist.json.ts`; `RevocationAftermath.keepChecklist` gọi lúc hoàn tất).
- `expiry/` — quyền đã hết hạn, nhắc trước 7 ngày (US-03-05); `expiry.controller.ts`; `expiry-reminder.job.ts`.
  Cửa sổ Request tiếp tục (BR-MF1-08a): `expiry-renewal-window.job.ts` mỗi giờ ghi `assignment_renewal_windows` (số ngày lúc mở, bất biến)
  và báo người giữ + trưởng phòng một lần (`RENEWAL_WINDOW_OPENED`). Tác vụ `EXTEND` (`provisioning/tasks/provisioning-extension.service.ts`,
  mở qua `LicensingRenewalApi.openExtension`) hoàn tất ⟹ `GrantRequestGate.reportExtended`.
- `license-key/` — kho key của mua đứt K4 (US-04-12) và kho khóa dùng chung (`QĐ-103d`); `license-keys.controller.ts`; `LicenseKeyService`
  (nhập, liệt kê, xem đầy đủ, rút khỏi kho `licenseKeyWithdraw`), `LicenseKeyAssignmentService` (gán khóa khi hoàn tất cấp K4, lấy lại khi thu hồi).
- `my-software/` — "Phần mềm của tôi" (US-12-15 AC-2, US-16-01 AC-1): `my-software.controller.ts`
  (`GET /me/software-rights`, mọi tài khoản đã đăng nhập (`QĐ-95d`), chỉ quyền cá nhân của chính người gọi), `MySoftwareService`, `MySoftwareRepo`;
  trạng thái theo ngày nghiệp vụ ở `my-software.policy.ts`. Không đọc khóa K4, giá, Cost Center hay định danh tài khoản.
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
  (dòng 3 T−7 ở `expiry/`, dòng 12 bàn giao đã bỏ theo `QĐ-110g`, dòng 13 tài khoản dịch vụ đã bỏ theo `QĐ-110m`, dòng 38 `K1` của
  người nghỉ ở `provisioning/revocation-completion/`; hạng mục `a03-license-inbox-alerts`).

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
- Kho khóa K4 (`BR-MF1-09`, `QĐ-103d`, `QĐ-103v`, Q-10 B): khóa chỉ có hai trạng thái `IN_STORE`/`ASSIGNED` (gắn đúng một Assignment cùng thuê bao); rút
  khỏi kho là hành động có lý do (`withdrawn_*`), khóa vẫn `IN_STORE`, không đếm, không cấp, không xem đầy đủ, không hoàn tác (trigger `license_key_guard`).
  `free` của gói K4 = min(seat Trống, khóa Trống chưa rút − tác vụ cấp K4 đang mở chưa gắn khóa) mỗi thuê bao. Hoàn tất cấp K4 bắt buộc `licenseKeyId`
  (khóa mua thêm phải nhập trước); thu hồi K4 hoàn tất bằng `KEY_DEACTIVATED`, khóa về kho Trống hoặc về kho và rút ngay (`keyDisposition: WITHDRAW` + lý do).
  Thứ tự khóa: cấp = task → thuê bao → khóa → Assignment; thu hồi = task → thuê bao → Assignment → khóa; rút = thuê bao → khóa (cùng khóa thuê bao trước
  nên không vòng). `requests` giải phóng toàn bộ cam kết của Request K4 cấp từ kho (`GRANTED_FROM_POOL`); thu hồi K4 không đổi cam kết (giá một lần).
  Chưa làm: gắn thiết bị công ty đã đăng ký (`deviceId`, `DeviceRegistryHook`).
- `grantQueueList` (module `requests`) đọc `stock { kind, free, inRevocation }` qua `LicensingPoolStockApi.getStockOfPlans` (số lần đọc cố định, không N+1).
- Thu hồi hoàn tất phát `RevocationTaskFacts.completed` (`grantRequestId` qua chuỗi `predecessor_id` — `assignment-chain.repo.ts`, `provisioningType`, `endedOn`,
  `paidThroughOn`, `sources`) để module cam kết giải phóng theo ngày (`public/seat-month-cost.policy.ts`: RV-07, M-10). Phần ghi vào cam kết thuộc `budgets`/`requests`, chưa nối.
- Thứ tự khóa của grant: request → thuê bao `FOR UPDATE` → plan `FOR SHARE` → người; đếm `free` không khóa thuê bao khác của plan.

## Bất biến quan trọng

- Assignment không bao giờ bị xóa; chỉ đổi khi kết thúc, failed hoặc cancelled, ngày dự kiến kết thúc đã đặt thì không
  sửa — đổi là gia hạn, bản ghi mới (trigger `license_assignment_reject_change`). Một người không giữ hai ghế cá nhân
  chồng thời gian trên cùng subscription/plan (`license_assignments_personal_no_overlap`, INV-02), trừ seat có cờ _tài khoản máy_
  (`is_machine_account`, R-9: `WHERE kind = 'PERSONAL' AND NOT is_machine_account`; cờ ⇔ `machine_account_note`).
  Cùng người, cùng định danh trên cùng subscription vi phạm cả hai ràng buộc loại trừ (`…personal_no_overlap`, `…identifier_no_overlap`); DB báo ràng buộc **tạo trước**, nên `personal_no_overlap` phải cũ hơn `identifier_no_overlap` (mã `OVERLAP`, không phải `IDENTIFIER_IN_USE`): drop/add một ràng buộc thì drop/add lại ràng buộc kia sau nó (migration `20261113000600`; test `license-assignment-constraints` ghim thứ tự).
- Thu hồi chỉ mở qua `openRevocation`, trong transaction của nguồn; ghế được trả khi task hoàn tất; gọi lại cùng nguồn
  và reference không đổi gì.
- Mốc thu hồi (`BR-MF5-04`): mỗi lý do giữ `due_on`/`not_before` của nơi gọi; tác vụ giữ mốc suy ra từ các lý do còn hiệu
  lực — **lý do không mốc thắng ân hạn** (một lý do không `not_before` ⟹ tác vụ không mốc, R-J08), ngược lại `MIN`.
  `claim` và `revocation-completion` trước `not_before` ⟹ 409 `PROVISIONING_TASK.NOT_BEFORE` (`details.notBefore`).
- Hoàn tất thu hồi `K1` (`QĐ-111az`, P25): body phải có `k1Checklist { items[{ code, done, doneAt }], evidence? }` của đúng biến thể thẻ nêu
  (`GET /provisioning-tasks/{id}` → `k1Checklist { variant, items[{ code, label, order, doneAt }] }`; server quyết biến thể: có lý do `DEPARTURE`/`ABRUPT_DEPARTURE`
  ⟹ `DEPARTURE`). Thiếu mục/tick/thời điểm/bằng chứng ⟹ 422 `REVOCATION.K1_CHECKLIST_INCOMPLETE`; `doneAt` giảm theo `order` (vd khóa hộp thư trước đăng xuất
  mọi phiên) ⟹ 422 `K1_CHECKLIST_OUT_OF_ORDER`; mục ngoài biến thể, trùng, hoặc `k1Checklist` cho loại ghế khác ⟹ `COMPLETION_NOT_ALLOWED`. Hệ thống không điều
  khiển Google/M365. Checklist ghi cùng transaction hoàn tất (trước khi tác vụ `COMPLETED`); sự kiện `AFTER_WORK` mang `completed.k1Checklist { variant, doneCodes }`
  để listener của `personnel` đọc `MAILBOX_LOCKED`. **Khóa hộp thư (mục 6) chỉ thuộc tác vụ thu hồi `K1` sống cuối cùng của người đó** (R-1, S17, P28):
  khi người đó còn tác vụ thu hồi `K1` khác chưa `COMPLETED`/`CANCELLED`/`CLOSED_FAILED` (kể cả `FAILED`), thẻ chỉ có 5 mục và gửi mục 6 ⟹ `COMPLETION_NOT_ALLOWED`;
  tác vụ cuối có 6 mục và `doneCodes` chứa `MAILBOX_LOCKED` chỉ khi đã tick. Hai tác vụ của một người hoàn tất cùng lúc được xét lần lượt bằng khóa advisory
  theo người (`k1-checklist:<employeeId>`, lấy sau khóa task và khóa ghế): đúng một tác vụ là cuối.
- **Lý do đã gỡ không được đọc ở đâu** (chỉ `listAllOf` cho lịch sử trên thẻ tác vụ): `find`, `listOf`, `countOf`,
  `listRevocationsOpenedFor`, `listPersonalSeatsOf` (đang thu hồi) đều lọc `withdrawn_at IS NULL`; index
  duy nhất lý do là partial `WHERE withdrawn_at IS NULL` nên mở lại cùng `(source, reference)` trên cùng tác vụ được.
- Thứ tự khóa: task grant trước request (`lockGrantOfRequest`); đích ghế subscription `FOR UPDATE`, plan nội bộ
  `FOR SHARE`; `createBaselineAssignments` giữ baseline state `FOR SHARE` nên việc đóng baseline phải chờ. Đóng
  baseline là vĩnh viễn (không route mở lại); sau đó assignment chỉ đến từ request.
- `RevocationListeners` chạy theo thứ tự thêm (seat-release, return, ghost seat của các module khác), dừng ở listener đầu
  tiên ném lỗi; thứ tự được ghim trong `provisioning-revocation-read-contracts.integration-spec.ts`.
- Gia hạn: một case mỗi kỳ subscription; đề xuất, quyết định, kết quả mỗi phần ghi một lần rồi đóng băng (trigger
  `subscription_renewals_guard`); kỳ mới nối chuỗi tối đa một (`subscriptions_renewed_from_id_key`); ghế chỉ chuyển khi số
  ghế giữ ở ngày đầu kỳ mới ≤ số mua; khóa: case → subscription cũ `FOR UPDATE` → ghế. Không bao giờ tạo commitment.
- License key mã hóa AES-256-GCM, id hàng và key id là dữ liệu xác thực (`license-key-cipher.service.ts`); chỉ IT
  Admin, không route xóa hay xuất key.

## Test

- Unit: `src/modules/licensing/**/*.spec.ts`; HTTP: `test/http/licensing/`; integration: `test/integration/licensing/`.

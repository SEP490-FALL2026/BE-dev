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
      tùy chọn `timing { dueOn?, notBefore? }` (mốc không-trước, ân hạn do MF-5 truyền), `notice { holder: true }` (báo
      người giữ `REVOCATION_UPCOMING`, một lần theo `(source, referenceId)`) và `noReopenAfterFailure` (khi `true`, không mở mới nếu đã có tác vụ `CLOSED_FAILED` cùng `(source, referenceId)`); không truyền ⟹ hành vi như cũ.
    - `withdrawRevocationReason` — nguồn gỡ lý do của chính mình: còn lý do khác ⟹ `CONTINUES`; hết lý do ⟹ tác vụ
      `CANCELLED` (`NO_LONGER_APPLIES`, ghế không đổi), riêng tác vụ `IN_PROGRESS` chỉ hủy khi
      `cancelInProgressClaimedBy` đúng người nhận, ngược lại `IT_ADMIN_TO_CLOSE`; gọi lại ⟹ `NOT_FOUND`/`ALREADY_ENDED`.
      Tham số tùy chọn `operator` (thủ tục có kiểm soát): audit ghi `OPERATOR` thay vì tài khoản đứng thế.
    - `lockGrantOfRequest`, `completedGrantOfRequest`, `cancelGrantOfRequest` — task grant của một request;
      `recordProvisioningFailure` — ghi lần thử connector lỗi (US-07-04).
    - `listPersonalSeatsOf`, `countPersonalSeatsOf`, `getSeatsHeldInPlans(…, tx?)`, `listTerminatingAccess`,
      `listRevocationsOpenedFor`, `listTransferIdsWithFailedRevocation`, `listRightChainsOf` — đọc ghế của người và tác vụ thu hồi điều chuyển đóng thất bại; `selfExecutionMode` — đánh dấu tự thực hiện khi acting IT Admin làm tác vụ cho chính mình (cho phép, ghi `selfExecuted` và báo Super Admin một lần); `recordAvoidedCost` — ghi nhận tiết kiệm tránh chi từ kho một lần theo tác vụ cấp; `recordRealisedSaving` — ghi nhận tiết kiệm thực tế gia hạn một lần khi Finance xác nhận hóa đơn đầu kỳ mới (hoặc đóng case sai lệch).
  - `LicensingSeatMonthApi` ([public/licensing-seat-month.api.ts](public/licensing-seat-month.api.ts)) — facade cho `budgets`: `getSeatsOfMonth`, `getSeatsInForceOn` (seat `K2` còn hiệu lực tại ngày `day` cho `runningUncommitted`), `getUnrequestedK1SeatsInForceOn` (quyền `K1` không Request kèm giá tham chiếu tháng VND của gói), `getPriorLineTargets` (mục tiêu dòng đã khóa của kỳ trước ở `subscription_line_targets` cho nhãn `(1)`), `getNextPeriodQuantities`.
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
    `listOpenGrantTasksOfBeneficiary`, `listGrantExecutionsOfRequests` (tác vụ cấp chưa hủy của từng người trong Request, mới nhất trước: hàng cấp của IT Admin), `listHeldSeatsOfRequests` (seat của Request còn giữ ngày `on`, đi theo chuỗi `predecessor_id` — `HANDOVER`,
    gia hạn quyền, `RENEWAL_CARRY` — tới bản ghi đang chạy, từ grant của Request hoặc bản ghi Request nêu; trả phòng sở hữu hiện tại và các bản
    ghi sau gốc; là thứ khoản 01/01 đếm, `BR-MF1-09e`).
  - `LicensingDashboardApi` ([public/licensing-dashboard.api.ts](public/licensing-dashboard.api.ts)) — số đếm cho trang tổng
    quan theo vai (dashboards): `employeeFacts`, `departmentFacts`, `itAdminFacts`; type ở `licensing-dashboard.types.ts`.
  - `LicensingSeatBaselineApi` ([public/licensing-seat-baseline.api.ts](public/licensing-seat-baseline.api.ts)) — seat
    baseline (data-import, onboarding, devices): `seatTargetRef`, `resolveBaselineTarget`, `lockBaselineTarget`, `baselineFacts`,
    `createBaselineAssignments`, `getBaselineProgress`, `openSeatHolders`, `holdInitializationOpen(tx)` (giữ hàng trạng thái baseline
    `FOR SHARE` ở tầng `0b`, trả `true` khi pha khởi tạo còn mở).
  - `LicensingDeviceActivationApi` ([public/licensing-device-activation.api.ts](public/licensing-device-activation.api.ts)) — kích
    hoạt phần mềm gắn thiết bị (`DEVICE_KEY`/`DEVICE_BUNDLED`, gọi bởi `devices` trong transaction đã giữ khóa máy): `open`,
    `openByKey`, `close`, `move`, `closeAllOfDevice`, `find`, `openOfDevice`, `hasKeyActivationHistory`, `page`. Lỗi ở
    `public/licensing-device-activation.errors.ts`.
  - `LicensingDepartmentToolsApi` ([public/licensing-department-tools.api.ts](public/licensing-department-tools.api.ts)) — danh sách phần mềm của phòng
    (DS.4, `QĐ-111c`; một facade riêng vì `LicensingApi` đã 8 phụ thuộc): `addDepartmentSoftwareFromCatalogLink(tx, actor, { departmentId, applicationId, planId, note? })` →
    `{ entryId, added }` cho tick "thêm vào danh sách phòng" của `POST /access-requests/{id}/catalog-link` (SPEC FE IN-1; `requests` gọi trong transaction của nó, ở
    gói IN-1). Idempotent: chỗ đã có ⟹ `added: false`, không Audit, không làm hỏng transaction của người gọi; ngoài danh mục ⟹ `DepartmentSoftwareNotInCatalogError`,
    phòng không có ⟹ `ToolsDepartmentNotFoundError` (cả hai ở `licensing.errors.ts`). Không xét lại phạm vi IT Admin: người gọi đã xét trên Request; type ở `licensing-department-tools.api.ts`.
- `public/licensing.types.ts` — input/output của facade; `public/licensing-*.types.ts` — type theo nhóm việc.
- `public/licensing.errors.ts` — lỗi nghiệp vụ (`SeatBaselineClosedError`, `RevocationRefusedError`, `Provisioning*`…).
- `public/licensing.extension-points.ts` — bảy point dưới đây, contract và union sự kiện `RevocationEvent`.
- `public/licensing-renewal.types.ts` — contract gia hạn seat và hai point gia hạn thuê bao: `RenewalFinancialReader`
  (snapshot tiền của người quyết) và `RenewalUsageReader` (bằng chứng sử dụng từng ghế).

## Bảng sở hữu

- `subscription_line_targets` (mục tiêu dòng thuê bao chốt tại hạn chót), `seat_purchases` được ghi qua `SeatLedgerApi` của `catalog`; `license_assignments`, `device_activations`, `seat_baseline_states`, `provisioning_tasks`, `provisioning_task_reasons`, `handover_duties` (không còn ghi từ `QĐ-110g`; bảng giữ tới đợt dọn),
  `service_account_duty_notices` (không còn ghi từ `QĐ-110m`; bảng giữ tới đợt dọn), `assignment_expiry_reminders`, `assignment_renewal_windows`, `license_keys` (gồm `license_lot_id`, `cost_borne`, `max_activations`, `initial_activations_used`), `license_key_reveal_windows`,
  `saas_issues`, `saas_issue_entries`, `saas_issue_counters`, `subscription_renewals` (kèm `auto_recorded`, `minimum_total_*`, `realised_savings_recorded_at/invoice_id`),
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
- Đăng ký vào: `catalog.seat-occupancy` — `assignment/occupancy/assignment-seat-occupancy.listener.ts`;
  `organization.department-service-account-reader` — `assignment/assignment-service-account.listener.ts`;
  `organization.department-use-readers` — `provisioning/department-use/department-open-work.listener.ts`.
- Đăng ký vào (thêm): `license-key/license-key-template.listener.ts` góp định nghĩa cột của lô khóa vào `ImportTemplateContributions` của `policies` (file mẫu `license-keys`).

## Hướng phụ thuộc giữa capability (R6)

Không vòng (`pnpm arch:capabilities --module licensing`, gate `capability-graph`). Từ thấp lên cao: `assignment`,
`seat-baseline`, `saas-issue` → `license-key` → `device-activation`, `provisioning` → `department-tools`, `expiry`,
`stock-summary` → `my-software`, `subscription-renewal` (đọc ghế, mở thu hồi qua `RevocationService`, không capability nào import nó) →
`dashboard-facts`. Cạnh
ngược là vòng:
dịch vụ nào đọc cả ghế lẫn thu hồi thì đứng trên cả hai (như `department-tools/`), không import ngược xuống.

## Capability → file chính

- `assignment/` — assignment ghế (đọc danh sách) và ghế của subscription; `assignments.controller.ts`,
  `subscription-seats.controller.ts`; `AssignmentService`. `GET /license-assignments` (IT Admin, `QĐ-111n`/`QĐ-111p`): lọc `subscriptionId`, `planId`,
  `employeeId`, `activeOnly=true` (quyền đang giữ hôm nay: chưa kết thúc, chưa hỏng/hủy, kể cả quyền bắt đầu sau; một câu `HOLDING` như đếm ghế) — danh sách người giữ của
  một thuê bao, mỗi khóa `K4` đã cấp là một dòng người giữ (không có route `holders` riêng); mỗi dòng có `plan.logoUrl` và `revocation { taskId, status, claimableNow } | null` =
  tác vụ thu hồi đang mở của quyền đó (`AssignmentRevocationRepo.openOf`: chưa `COMPLETED`/`CLOSED_FAILED`/`CANCELLED`, cùng nghĩa với số ghế đang thu hồi; một câu cho
  cả trang), `claimableNow` = `notBefore` đã tới (`revocationOf`, `assignment.policy.ts`). FE bật "Thu hồi" chỉ khi `revocation` khác null; hoàn tất qua
  `POST /provisioning-tasks/{id}/revocation-completion` (K4 kèm `keyDisposition`). Con: `renewal/` (US-05-14). Không còn tài khoản dịch vụ (`QĐ-110m`): các dòng
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
  mình không phụ trách ⟹ 404; chính người đã đề xuất (nay giữ vai IT Admin) không quyết đề xuất của mình ⟹ 403 `OWN_PROPOSAL` (`SoD-4`, `decidedByRefusal`); đã quyết ⟹ 409 `PROPOSAL_NOT_PENDING`; hai người quyết cùng lúc ⟹ `UPDATE … WHERE state = 'PENDING'` chỉ một thắng).
  `DepartmentSoftwareProposalService` (một transaction mỗi bước: Audit + thông báo; chỉ acting IT Admin của phòng mới sửa danh sách
  hoặc quyết định đề xuất), `DepartmentSoftwareNotice` (`DEPARTMENT_SOFTWARE_PROPOSED` tới acting IT Admins của phòng, không có thì
  fallback Super Admin; `DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED` tới trưởng phòng đã đề xuất, kèm lý do khi từ chối).
- `seat-baseline/` — xem/đóng baseline ghế (US-02-05 AC-6); `seat-baseline.controller.ts`; `SeatBaselineService` (gồm
  `holdInitializationOpen` khóa tầng `0b` `FOR SHARE`).
- `stock-summary/` — `GET /stock-summary` (IT Admin): kho đếm theo kiểu cấp, một dòng cho mỗi gói (`K2`/`K4`; bỏ dòng `HOLDERS` của `K1`). `stock.kind`
  `SEATS` (K2: `purchased`, `assigned`, `free`, `revoking`, đọc theo sổ dòng khi đã mở sổ), `KEYS` (K4 `ACCOUNT`: đếm khóa trên các lô `license_lots`), `LICENSES` (K4 `DEVICE_KEY`: `purchased`, `occupied`, `free` theo tổng lượt kích hoạt trên lô). `mine=true` giữ gói có thuê bao/lô mình phụ trách và chỉ đếm các bản ghi đó; không lọc theo phòng (`FR-1.12`). `stock-summary.policy.ts` thuần.
- `device-activation/` — kích hoạt phần mềm gắn thiết bị (`DEVICE_KEY` và `DEVICE_BUNDLED`, không controller riêng, expose qua
  `LicensingDeviceActivationApi`): `DeviceActivationService` (mở/mở theo khóa, kiểm trần lượt và cờ `overActivationCap`),
  `DeviceActivationCloseService` (gỡ, chuyển máy, đóng tất cả khi ngừng dùng/hủy máy), `DeviceActivationQueryService`,
  `device-activation.repo.ts`. Thứ tự khóa: máy (`2b`, do `devices` giữ) → lô (`6a`) → gói (`7`) → khóa (`7b`) → kích hoạt (`8`).
- `seat-purchase/` — route mua thêm seat theo dòng (`POST /subscription-lines/{id}/purchases`, `seat-purchases.controller.ts`, `SeatPurchaseRouteService`): kiểm đủ 5 bước (line phục vụ ngày mua `K2` `FIXED` `ACTIVE`, ngày mua trong kỳ & tháng mở, mọi tác vụ cấp thuộc danh sách và nhân viên đã bắt đầu, người gọi là acting IT Admin của phòng từng người thụ hưởng ⟹ ngoài phạm vi trả `403 SEAT_PURCHASE.NOT_IN_CHARGE`, không còn kho trống tại ngày mua `409 SEAT_PURCHASE.STOCK_AVAILABLE`), hỗ trợ nhảy bậc (`TIER_STEP`, cộng `tierStepSeats` vào `minimum_seats`) và đổi loại seat (`replacesFromLineId`, ghi `REDUCE -1` + `TOP_UP +1`), gọi `SeatLedgerApi.buyForItems` / `recordTierStep` dưới khóa kỳ (`6`) → dòng (`6c`), gửi `SUBSCRIPTION_SEATS_BOUGHT` / `SEAT_LEDGER_VENDOR_RECORDED`. Nhắc quá hạn nộp hóa đơn lần mua (`SeatPurchaseInvoiceDueService` trong lượt giờ `SubscriptionRenewalSweepService`) phát `SEAT_PURCHASE_INVOICE_OVERDUE` khi `invoice_due_on < today` và chưa có hóa đơn mở.
- `license-lot/` — tạo lô license của gói `K4` (`POST /license-lots`, IT Admin): `license-lot-create.service.ts` mở giao dịch khóa tác vụ cấp phát (`3a`) cho `purpose = REQUEST` (kiểm tra trạng thái mở, gói và acting IT Admin của phòng người nhận ⟹ `403 LICENSE_LOT.NOT_IN_CHARGE`, `422 LICENSE_LOT.REQUEST_REQUIRED`) rồi gọi `LicenseLotApi.createLot` của catalog (khóa workspace `5b` → gói `7`, kiểm cổng ≥ 2 admin workspace khi có trang quản trị). Nhập khóa vào lô nằm ở `license-key/` (`license-lot-keys.controller.ts`, `POST /license-lots/{id}/keys`, chỉ IT Admin phụ trách lô; gói `ACCOUNT` không vượt số license, `DEVICE_KEY` không giới hạn; `cost_borne = true` khi `purpose !== 'REQUEST'`). Route cũ `licenseKeyImport` vẫn nhận id lô (id lô = id thuê bao sinh ra nó).
- `license-key/` — kho key của mua đứt K4 (US-04-12) và kho khóa dùng chung (`QĐ-103d`): `license-keys.controller.ts`; `LicenseKeyService`, `LicenseLotKeyImportService`
  (nhập kèm `maxActivations`/`initialActivationsUsed`, nâng trần `PATCH /license-keys/{id}` với `expectedUpdatedAt`, rút khỏi kho `licenseKeyWithdraw`), `LicenseKeyAssignmentService` (gán khóa khi hoàn tất cấp K4 `ACCOUNT` trên lô đã khóa `6a → 7 → 7b → 8`, chuyển `cost_borne` từ `false` sang `true` khi cấp cho Request khác và báo kết cục về ngân sách, thu hồi trả về kho / rút). Tầng khóa: `0b` (khi có `initialActivationsUsed > 0`) → `6a` (`license_lots`) → `7` (`plans`) → `7b` (`license_keys`).
- `provisioning/` — task grant và thu hồi; bỏ hàng việc chung `GENERAL` (`scope=GENERAL` ⟹ 422, `inGeneralQueue` đổi thành
  `awaitingItAdmin` và `actingItAdmins`), chỉ acting IT Admin của phòng người thụ hưởng (hoặc người được chỉ định cho việc chưa xếp
  phòng qua `itAdminsActingForUnplacedWork`, ghi `bySubstitute: true` trong Audit và tự đóng chỉ định khi tác vụ đóng) mới thao tác
  được (403 `PROVISIONING.NOT_IN_CHARGE`); chặn cấp quyền cá nhân cho gói gắn thiết bị (`409 PROVISIONING.PLAN_BOUND_TO_DEVICE`);
  tự thực hiện không còn bị chặn `ANOTHER_IT_ADMIN_NEEDED` (ghi `selfExecuted: true` và báo Super Admin `IT_ADMIN_SELF_EXECUTED`).
  `revocation.service.ts` (mở thu hồi) với `RevocationTaskFactory`,
  `RevocationRecorder`, `revocation-open.policy.ts`; `provisioning.policy.ts`. Con: `tasks/`
  (`provisioning-tasks.controller.ts`; grant: `ProvisioningGrantService` → `ProvisioningGrantPlanner` (xét trước khóa) +
  `ProvisioningGrantWriter` (ghi trong transaction; Request xin lại trong ân hạn điều chuyển có `replacesAssignmentId` ⟹ `AssignmentService.endReplacedByGrant` kết thúc quyền cũ cùng thuê bao
  `valid_until` = ngày cấp trước khi chèn quyền mới, R-49; cấp hỏng/hủy ⟹ `giveBackReplaced` mở lại; `LicensingApi.listRegrantedAssignments`), `provisioning-grant.policy.ts`; `ProvisioningService` giữ danh sách,
  claim, hoàn tất, báo lỗi; `ProvisioningDecisionService`; người bấm "Cấp" tự nhận tác vụ ngay trong giao dịch cấp (`IN_PROGRESS`, sự kiện `CLAIMED` sau `CREATED`, QĐ-111m); bấm lại hoặc IT khác bấm cho cùng Request và người trả về tác vụ đã có (`takenBy`, không cấp lần hai); `public/licensing-grant-execution.policy.ts` nói nút nào bật ở mỗi trạng thái tác vụ), `revocation-completion/`
  (`revocation-tasks.controller.ts`), `grant-cancellation/`, `open-grants/`, `department-use/`, `k1-checklist/` (checklist `K1`,
  `QĐ-111az`: thu hồi — biến thể `DEPARTURE` 6 mục / `STILL_EMPLOYED` 2 mục suy từ các lý do còn đứng; cấp — biến thể `GRANT` 2 mục; kiểm đủ tick + bằng chứng + `doneAt` không giảm theo
  `order`; cột `provisioning_tasks.k1_checklist`, codec `provisioning-k1-checklist.json.ts`; `RevocationAftermath.keepChecklist` và `ProvisioningGrantCompletion` gọi lúc hoàn tất).
- `expiry/` — quyền đã hết hạn, nhắc trước 7 ngày (US-03-05); `expiry.controller.ts`; `expiry-reminder.job.ts` (không nhắc quyền có Request tiếp tục
  đã duyệt đang chờ IT kéo dài: ngày kết thúc sắp dời, R-27). Đầu ngày sau ngày kết thúc `expiry-revocation.job.ts` mở tác vụ thu hồi
  `TIME_LIMITED_EXPIRY` do hệ thống tạo (`SystemActor`, `created_by_system`) qua cổng `RevocationService.open`: một lần cho mỗi quyền (khóa là dòng
  lý do của tác vụ), bỏ qua quyền đang có Request tiếp tục chờ (R-13), IT Admin vẫn mở sớm được ở `POST /assignment-expiry-queue/{id}/revocation`.
  Cửa sổ Request tiếp tục (BR-MF1-08a): `expiry-renewal-window.job.ts` mỗi giờ ghi `assignment_renewal_windows` (số ngày lúc mở, bất biến)
  và báo người giữ + trưởng phòng một lần (`RENEWAL_WINDOW_OPENED`). Tác vụ `EXTEND` (`provisioning/tasks/provisioning-extension.service.ts`,
  mở qua `LicensingRenewalApi.openExtension`) hoàn tất ⟹ `GrantRequestGate.reportExtended`.
- `license-lot/` — tạo lô license của gói `K4` (`POST /license-lots`, IT Admin, W3-24): `license-lot-create.service.ts` gọi `LicenseLotApi.createLot` của catalog; lô cho Request (`purpose REQUEST`) đối chiếu task cấp phát còn mở của gói đó (`ProvisioningTaskRepo.findGrantOf`) và người gọi phải là IT Admin phụ trách phòng của người nhận (`ProvisioningTaskFrame.requireActingItAdmin`) — `LICENSE_LOT.NOT_IN_CHARGE`, `LICENSE_LOT.REQUEST_REQUIRED`. Nhập khóa vào lô nằm ở `license-key/` (`license-lot-keys.controller.ts`, `POST /license-lots/{id}/keys`, chỉ IT Admin phụ trách lô; K-A6: gói gắn tài khoản không quá số license, khóa gắn máy không giới hạn; `cost_borne` = đúng khi lô không mua cho Request). Route cũ `licenseKeyImport` vẫn nhận id lô (id lô = id thuê bao sinh ra nó).
- `license-key/` — kho key của mua đứt K4 (US-04-12) và kho khóa dùng chung (`QĐ-103d`): `license-keys.controller.ts`; `LicenseKeyService`
  (nhập kèm `maxActivations`/`initialActivationsUsed` áp cho cả lần nhập, `license-key-import-settings.service.ts`; nâng trần
  `PATCH /license-keys/{id}` với `expectedUpdatedAt` (`licenseKeyUpdate`); liệt kê trả thêm `maxActivations`, `activationsUsed`,
  `openActivations`, `capReached`, `updatedAt` và `summary.keyBinding/occupied/free`, không lộ `initial_activations_used`; xem đầy
  đủ; rút khỏi kho `licenseKeyWithdraw`), `LicenseKeyAssignmentService` (gán khóa khi hoàn tất cấp K4 `ACCOUNT`, lấy lại khi thu
  hồi). Tầng khóa: `0b` (khi có `initialActivationsUsed > 0`) → `6` (`subscriptions`) → `7b` (`license_keys`).
- `my-software/` — "Phần mềm của tôi" (US-12-15 AC-2, US-16-01 AC-1): `my-software.controller.ts`
  (`GET /me/software-rights`, mọi tài khoản đã đăng nhập (`QĐ-95d`), chỉ quyền cá nhân của chính người gọi), `MySoftwareService`, `MySoftwareRepo`;
  trạng thái theo ngày nghiệp vụ ở `my-software.policy.ts`. Không đọc khóa K4, giá, Cost Center hay định danh tài khoản.
- `dashboard-facts/` — số đếm mà trang tổng quan theo vai đọc (US-12-15 AC-2, AC-3, AC-4), mỗi số bằng tổng của danh sách
  hiện có cùng phạm vi: quyền và quyền sắp hết của Employee (dùng luật của `my-software.policy.ts`), báo lỗi SaaS, ghế phòng ban
  (qua `AssignmentDepartmentRepo`), task cấp/thu hồi và báo lỗi IT Admin phụ trách, key trong kho. `DashboardFactsService`,
  `DashboardFactsRepo`; chỉ trả số, không dòng, giá, key hay định danh.
- `saas-issue/` — báo lỗi quyền SaaS (BM-11, US-07-10, US-07-11); `saas-issues.controller.ts`; `SaasIssueService`,
  `SaasIssueHandlingService` (chỉ acting IT Admin của phòng người báo mới chuyển trạng thái/đánh dấu trùng, ngoài ⟹ 403
  `SAAS_ISSUE.NOT_IN_CHARGE`; khi gửi phiếu cho phòng chưa có acting IT Admin, bỏ fallback IT đầu tiên và bỏ 409 `NO_IT_ADMIN` —
  tạo phiếu `NEW` với `assignedItAdmin = null` và gửi `SAAS_ISSUE_AWAITING_ASSIGNEE` tới Super Admin); `saas-issue.job.ts` →
  `saas-issue-sweep.service.ts`. `saas-issue-notifier.service.ts` ghi thông báo trong transaction của thay đổi (đúng một lần cho mỗi
  thay đổi): `SAAS_ISSUE_SUBMITTED` cho IT Admin được giao khi gửi phiếu (không báo nếu chính họ gửi), `SAAS_ISSUE_AWAITING_ASSIGNEE`
  cho Super Admin khi chưa có acting IT Admin; `SAAS_ISSUE_RESPONSE_OVERDUE` cho IT Admin được giao, một lần, khi lượt quét thấy quá
  hạn phản hồi đầu tiên; `SAAS_ISSUE_STATE_CHANGED` cho bên còn lại — người báo khi IT Admin đổi trạng thái, IT Admin được giao khi
  người báo trả lời hoặc mở lại, người báo khi lượt quét tự đóng phiếu hết hạn mở lại (`REOPEN_WINDOW_LAPSED`) — không báo người tự
  làm. Tham số chỉ gồm id, mã phiếu và từ trạng thái; không có nội dung người báo hay IT Admin viết, trưởng phòng không được báo.
- Quyền cá nhân của gói `K1`: không còn thuê bao `K1` mới (`subscription_id = null`); quyền `K1` mang `license_assignments.personal_commitment_months` (`1` hoặc `12`) và `billing_anchor_on` (bất biến qua trigger `license_assignments_k1_terms`). Gói `K1` cam kết năm cố định 12 tháng (cấp mới, tiếp tục, kiểm tra hợp đồng ngắn); khi thu hồi thường/điều chuyển, phần đã trả tới `paidThroughOn` không giải phóng (còn điều chuyển tách phần tháng cuốn còn lại sang phòng mới qua `budgets`). Thuê bao `K1` cũ đã đóng (`subscriptions.closed_at`, `closed_reason = K1_WITHOUT_SUBSCRIPTION`); quyền cũ giữ `subscription_id`. `assignment-record.mapper.ts` giữ cột đọc và ánh xạ của `AssignmentRepo`.
- `subscription-renewal/` — điều chỉnh/gia hạn thuê bao kho `K2` theo kỳ và theo dòng (`EP-11`, `SBF-20`):
  - `lines/` (`SubscriptionRenewalLinesService`, `SubscriptionRenewalLinesFactsService`, `SubscriptionRenewalAutoService`, `subscription-line-target.repo.ts` ghi `subscription_line_targets`, `subscription-renewal-auto.repo.ts` ghi `auto_recorded`, `minimum_total_*`): tính `need`/`target`/`shortfall` từng dòng (gồm `R-LATE` sau hạn chót của gói cam kết 12 tháng: không giảm dưới `seatsAtDeadline`), khóa mục tiêu lúc qua hạn chót (`lockedBy: 'SYSTEM'`), tự ghi gia hạn `UNCONFIRMED` + `AUTO_RENEWAL_INCIDENT` nếu `autoRenew = true` hoặc đóng dòng `ENDED` nếu `autoRenew = false`, mở kỳ mới với `lines[]` (`renewedFromLineId`) và đóng dòng kỳ cũ `RENEWED` tại `startDate - 1`.
  - `kpi/` (`KpiMissedAdjustmentService`, `SubscriptionRenewalKpiService`, `kpi-missed-adjustment.policy.ts`): tính `KPI-4` cộng dần theo sổ ngày (`K2` `FIXED`; `MEMBERS` luôn `0`) từ mục tiêu đã chốt của kỳ trước; `KPI-3` tính mẫu số từ tổng sổ cuối kỳ (`kpi3DenominatorOfLines`).
  - `savings/` (`RenewalSavingsService`, `renewal-savings.policy.ts`, `renewal-savings.repo.ts`): `RenewalOutcomeService` để `realisedSavings: null` lúc IT Admin ghi kết quả gia hạn; `LicensingApi.recordRealisedSaving` chỉ ghi một lần khi Finance xác nhận hóa đơn đầu tiên của kỳ mới (hoặc đóng case `SBF-11a` từ hóa đơn đó); tự gia hạn không ghi.
  - `alerts/` (`WorkspaceAdminAlertService`, `RenewalAlertsService`): trong lượt giờ `SubscriptionRenewalSweepService`, phát `WORKSPACE_ADMIN_NOT_WORKING` một lần mỗi `(workspace, admin)`, kiểm tra quá hạn hóa đơn lần mua (`SeatPurchaseInvoiceDueService`), gửi cảnh báo điểm điều chỉnh / cảnh báo đỏ / chất lượng dữ liệu.
  - `subscription-renewals.controller.ts` nhận `lines[]` trên `subscriptionRenewalPropose` (bắt buộc cho kỳ nhiều dòng: `422 SUBSCRIPTION_RENEWAL.LINES_REQUIRED`) và trả `nextPeriod.lines[]` ở kết quả; chỉ IT Admin phụ trách thuê bao còn dùng được mới ghi kết quả (`403 SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE`). `subscription-renewal.job.ts` chạy mỗi giờ qua `SubscriptionRenewalSweepService`. Cột JSON `subscription_renewals.decision_snapshot` đi qua codec `subscription-renewal-decision-snapshot.json.ts`.
- Gốc module (dùng chung nhiều capability): `licensing-audit-event.mapper.ts`, `licensing.http-errors.ts`;
  `licensing-alerts.policy.ts` + `licensing-alerts.service.ts` (`LicensingAlerts`) — cảnh báo license `FR-5.14` vào hộp thông báo
  (dòng 3 T−7 ở `expiry/`, dòng 12 bàn giao đã bỏ theo `QĐ-110g`, dòng 13 tài khoản dịch vụ đã bỏ theo `QĐ-110m`, dòng 38 `K1` của
  người nghỉ ở `provisioning/revocation-completion/`; hạng mục `a03-license-inbox-alerts`).

## Kho dùng chung và cấp phát (`shared-pool/`, L0)

- Capability không controller, không import capability licensing nào (đọc bảng bằng SQL), chỉ gọi `CatalogApi`, `SeatLedgerApi`, `LicenseLotApi`, `LicenseLotStockApi`; `provisioning` và `public/LicensingPoolStockApi` dùng nó.
- `K2` (thuê bao nhiều dòng, sổ số seat): `chooseLine` chọn dòng còn phục vụ (kể cả dòng `RENEWED` tới `closedOn`), ưu tiên dòng còn chỗ Trống rồi `createdAt, id`. Khi hết kho (`free === 0`) và lệnh cấp có `purchase`: không còn gọi `addPoolSeat`; nếu là quyền `FIXED` thì gọi `SeatLedgerApi.buyForItems` (`TOP_UP +1`, giữ mua cho kỳ sau nếu ngày bắt đầu kỳ sau đã tới `carryOrBuy` và ghi trên dòng kỳ sau). Nếu là `K2 MEMBERS`: cấp phát ghi `MEMBER TOP_UP +1` (bù các dòng `MEMBER REDUCE` tương lai trước khi chèn quyền), thu hồi hoàn tất ghi `MEMBER REDUCE -1` có hiệu lực tại ngày thanh toán kế tiếp (`revocation-aftermath.service.ts`).
- `K4` (lô khóa): `chooseAccountLot` qua `LicenseLotStockApi` ưu tiên lô `REQUEST` của chính Request, giữ đủ license cho người thụ hưởng đang mở (`409 LICENSE_LOT.RESERVED_FOR_REQUEST` khi hết license dư), ném `409 LICENSE_ASSIGNMENT.SEAT_CAPACITY` nếu hết kho. Hoàn tất cấp `K4 ACCOUNT` bắt buộc `licenseKeyId`, khóa `6a → 7 → 7b → 8`, cập nhật `cost_borne` và báo kết cục về `requests`/`budgets`. Thu hồi `K4` hoàn tất trả khóa về kho hoặc rút (`keyDisposition: WITHDRAW`). `K4 DEVICE_KEY`/`DEVICE_BUNDLED` gắn trực tiếp vào máy qua `device-activation/`.
- `K1` (không thuê bao): `ProvisioningGrantWriter` không đụng `subscriptions`/`SeatLedgerApi`; ghi thẳng quyền cá nhân với `subscriptionId = null`, `personalCommitmentMonths` (`1 | 12`) và `billingAnchorOn`.
- _Tránh được_ (`BR-MF1-09c`): hoàn tất tác vụ cấp `K2`/`K4` không mua ⟹ `GrantSettlementService` tính số tiết kiệm tránh chi (bỏ qua dòng giá trong `shared-pool.policy.ts`) và gọi `LicensingApi.recordAvoidedCost` (`months = null`, một lần theo tác vụ).
- `grantQueueList` (module `requests`) đọc `stock { kind, free, inRevocation }` qua `LicensingPoolStockApi.getStockOfPlans` (số lần đọc cố định, không N+1).
- Thu hồi hoàn tất phát `RevocationTaskFacts.completed` (`grantRequestId`, `grantedStartDate`, `grantedEndDate`, `provisioningType`, `personalCommitmentMonths`, `billingAnchorOn`, `endedOn`, `paidThroughOn`, `sources`) để `requests` giải phóng cam kết và tách phân bổ `K1` năm khi điều chuyển. `LicensingApi.listRightChainsOf` trả cùng thông tin chuỗi cho điều chuyển.
- Thứ tự khóa của grant: `employee` `FOR SHARE` (`1`) → tác vụ cấp (`3a`) / thu hồi sống bị thay (`3b`) → request (`4`) → kỳ thuê bao (`6`) + dòng (`6c`) cho `K2` hoặc lô (`6a`) cho `K4` → plan `FOR SHARE` (`7`) → khóa (`7b`) → assignment (`8`). Khi cấp lại quyền trong ân hạn điều chuyển mà tác vụ thu hồi `QUEUED` chỉ mang lý do `TRANSFER`, `ProvisioningReplacementService` rút lý do để hủy tác vụ trước khi kết thúc quyền cũ; còn lý do khác hoặc tác vụ `IN_PROGRESS`/`FAILED`/`COMPLETED` thì từ chối `422 LICENSE_ASSIGNMENT.OVERLAP`.

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
- Hoàn tất cấp `K1` (`QĐ-111az`, R-19, `US-07-01` AC-7; K1-GR): cùng nhóm `k1-checklist/`, biến thể `GRANT` hai mục `COMPANY_EMAIL_REGISTERED` → `NO_PERSONAL_DEVICE_MFA`
  (đăng ký bằng email công ty của chính người dùng; không bật MFA bằng thiết bị cá nhân). `POST /provisioning-tasks/{id}/complete` của tác vụ `GRANT` loại `K1` đòi
  `k1Checklist { items[{ code, done, doneAt }], evidence? }` (bằng chứng trong checklist hoặc `evidence` ngoài): thiếu mục/tick/thời điểm/bằng chứng hoặc không gửi ⟹ 422
  `PROVISIONING.K1_CHECKLIST_INCOMPLETE`, `doneAt` giảm theo `order` ⟹ `K1_CHECKLIST_OUT_OF_ORDER`, mục ngoài biến thể/trùng, hoặc `k1Checklist` cho loại ghế khác
  hay tác vụ `EXTEND` ⟹ `K1_CHECKLIST_NOT_ALLOWED` (hai mã đầu mang `details { variant, codes }`). Cùng hàm xét `judgeChecklist` với thu hồi; ghi vào cột `k1_checklist`
  trong giao dịch hoàn tất, trước khi tác vụ `COMPLETED` (CHECK nới thành `REVOKE` hoặc `GRANT`, migration `20261113004100`). Thẻ trả `k1Checklist { variant: GRANT, items }`
  từ lúc IT bấm "Cấp" cho tới khi tác vụ kết thúc, cái đã tick khi `COMPLETED`.
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

## Từ vựng

| Từ (UI/tài liệu)    | Tên ở code/wire                   | Nghĩa duy nhất                                                                |
| ------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| Gói                 | `Plan`, `plan`                    | Bậc và loại seat của một ứng dụng.                                            |
| Thuê bao            | `Subscription`                    | Cam kết có kỳ của một workspace; mỗi kỳ là một bản ghi.                       |
| Kho                 | (không có bảng)                   | Seat hoặc license **Trống** cấp được ngay.                                    |
| Lô khóa             | `LicenseLot`, `licenseLot`        | Khoản mua đứt `K4`; không gọi là thuê bao.                                    |
| Gói tháng / gói năm | `commitmentTermMonths` `1` / `12` | Kỳ cam kết (không phải chu kỳ trả).                                           |
| Giá tháng           | `monthlyUnitPrice`                | VND chưa thuế, một seat một tháng (`K1`/`K2`); với `K4` là _giá một license_. |
| Người phụ trách     | `responsibleItAdmin`              | IT Admin trả lời cho thuê bao/workspace/lô; chỉ Super Admin đổi.              |

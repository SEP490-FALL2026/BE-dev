# catalog

Mục đích: danh mục phần mềm dùng chung — từ điển vendor, ứng dụng và IT Admin phụ trách, nhóm chức năng, plan và điều khoản
của plan, subscription/mua đứt, hợp đồng và file đính kèm. Story chính: US-04-01 → US-04-07, US-04-11, US-12-09 (route
hồ sơ thuế vendor); US-05-20 (đăng ký phần mềm nội bộ, gọi qua facade). Tầng: T4 (`scripts/arch/tiers.cjs`). Phụ thuộc:
audit, organization, identity-access, finance, operating-parameters. Được dùng bởi: licensing, budgets, requests,
personnel, onboarding, data-import (chỉ type), installation (`CatalogBootstrapApi`); gốc `src/app/app.module.ts`.

## Public API (`public/`)

- `CatalogPricingApi` (`public/catalog-pricing.api.ts`) — `getPlanPrice` chỉ đọc, cùng nguồn giá với `CatalogApi`.
  `CatalogPricingFacadeModule` dùng chung với worker: không controller, storage hay listener vòng đời.

- `CatalogBootstrapApi` (`public/catalog-bootstrap.api.ts`, Nest module `catalog-bootstrap-facade.module.ts`: không controller, storage hay listener) — `seedStandardFunctionalGroups(tx, organizationId)`: ghi
  bảy nhóm chức năng chuẩn của một tổ chức lúc cài đặt (`QĐ-111bf`), trong transaction của bên gọi; nhóm đã có giữ nguyên, trả số nhóm đã ghi. Dùng bởi `installation` (`InstallationApi.install`); ngoài ra không ghi gì của catalog.
- `public/subscription-line-price.policy.ts` — `servingLineOf`, `servingMonthlyPriceMinor`: the price of a seat of a plan on a period is the price of the line that serves the plan (the live one, otherwise the one closed last; a line taken away never serves), the columns of the period only when it has no line; the baseline, the running uncommitted cost and the ceiling of a pool invoice read it.
- `public/catalog-duplicate.policy.ts` — `duplicateOf`: mục danh mục đã là phần mềm đó theo tên chuẩn hóa (hoa thường, dấu, khoảng trắng bỏ qua) hoặc tên miền (host đã chuẩn hóa, tên xét trước,
  `QĐ-111b`); hàm thuần, một luật cho lệnh tạo ứng dụng (`application-intake/`) và cho cửa case B của `requests` (qua `findCatalogEntryOfSoftware`); đăng ký trong `PUBLIC_ROOT_POLICY_FILES` vì cả hai bên dùng.
- `CatalogApi` ([public/catalog.api.ts](public/catalog.api.ts)) — facade cho module khác:
  - `findSeatTarget`, `findPlanSeatTargets`, `lockSeatTarget` — đích ghế: một kỳ/dòng thuê bao `K2` (kèm `subscriptionLineId`, khóa kỳ tầng `6` → dòng tầng `6c` → gói tầng `7`), một lô `K4` (kèm `licenseLotId`, khóa lô tầng `6a` → gói tầng `7`), hoặc một plan nội bộ `K5`; quyền `K1` không còn thuê bao.
  - `findCatalogEntryOfSoftware(tx, { name, homepageUrl })` — mục danh mục đã là phần mềm đó theo tên chuẩn hóa hoặc tên miền (cùng quy tắc `duplicateOf` với lệnh tạo ứng dụng) kèm
    tối đa 20 gói; cửa case B của `requests` (`QĐ-111b`). `getCatalogEntry(tx, applicationId, planName?)` — một ứng dụng với gói của nó và gói trùng tên đã hỏi (đề xuất rút gọn, `QĐ-111a`).
  - `getCollectorApplications(ids, tx?)` — ứng dụng một allowlist của collector cần xét: tên, kiểu, `logoUrl`, cờ ứng dụng liên lạc (**suy từ nhóm _Liên lạc_**, `QĐ-111e`, không còn cờ riêng; không bao giờ báo cáo, `QĐ-62o`) và đã retired chưa.
  - `getPlanSummaries`, `getPlanRevocationInfo`, `getSimilarPlanIds`, `getPlanVendorId`, `getPlanVendorIds` (nhiều plan trong một lần đọc), `getPlanResponsibleItAdminId` — đọc
    plan.
  - `getPlanPrice(planId, tx?)` — giá của plan từ thuê bao/dòng chính (`pickPriceSource`: cờ `is_primary_for_plan` cũ hoặc dòng đang phục vụ/giá tháng cao nhất; đọc trực tiếp `monthly_unit_price_minor` một lần quy đổi khi ghi), trả `{ kind: RECURRING | ONE_TIME,
unitPrice, reportingUnitPrice, monthlyUnitPriceMinor, billingCycle }`. Kỳ đã có kỳ kế tiếp vẫn định giá khi kỳ kế
    tiếp còn `DRAFT` (F-012). `getPlanPrice(planId, tx, on)` — giá hiệu lực ngày `on`: ưu tiên kỳ/dòng chạy ngày đó; không kỳ nào chạy ngày đó thì như không có `on` (khoản 01/01).
    **Giá tham chiếu của gói (`QĐ-113a`)**: không thuê bao nào định giá được gói thì dùng `plans.reference_price_minor/_currency` (VND chưa thuế; `K1`/`K2` = giá một
    seat một tháng, kèm `referenceCommitmentMonths` `1 | 12`, `K4` = giá một khóa, `K5` không có); kết quả thêm `source: SUBSCRIPTION | PLAN_REFERENCE`. Thiếu cả hai ⟹ `null`
    (`NO_PRICED_SUBSCRIPTION`). `CatalogPricingApi.getPlanPrice` (facade worker, `catalog-pricing-facade.module.ts`) đi cùng đường `SubscriptionPriceService.priceOfPlan`. `adoptPlanQuotePrice(actor, planId, price, tx)` — case B: báo giá đã duyệt (quy về giá tháng, làm tròn nửa ra xa 0) thành giá tham chiếu của gói `K1`/`K2` chưa có giá khi IT gắn Request vào gói; không ghi đè, không chép cho `K4`.
  - `getGrantableSubscriptions(planId, today, tx?)` / `getGrantableSubscriptionsOfPlans` (nhiều plan, một lần đọc) — kỳ/dòng thuê bao `K2` `ACTIVE` còn hiệu lực hôm nay (kể cả dòng đã đóng `RENEWED` khi `today <= closedOn`) chưa bị kỳ kế tiếp `ACTIVE` đã bắt đầu thay; `getSubscriptionPrice`.
  - `getStockPlans({ today, responsibleItAdminEmployeeId?, planId?, skip, take })` — một trang gói `K2`/`K4` theo ứng dụng rồi gói (không còn `K1`): `K2` đọc các kỳ/dòng cấp được hôm nay, `K4` đọc các lô `license_lots` (id lô = id thuê bao cũ với lô chuyển đổi), nền của `GET /stock-summary` của `licensing` (`QĐ-111n`).
  - `getApplicationsOwnedBy`, `getWorkspaceDutiesOf` — thứ một phòng ban/người đang giữ (`getWorkspaceDutiesOf` đọc theo workspace).
  - `registerInternalSoftware` — đăng ký phần mềm nội bộ trong transaction của bên gọi (US-05-20).
  - `getVendorName`, `getOnboardingFacts` — tên vendor; số ứng dụng/plan/subscription cho checklist onboarding.
- `SeatLedgerApi` ([public/seat-ledger.api.ts](public/seat-ledger.api.ts)) — facade cho `subscription_lines`, `seat_changes` và `seat_purchases` (dùng bởi `licensing`, `requests`, `budgets`): đường ghi duy nhất vào sổ seat qua `openLines`, `buyForItems` (mua thêm cho tác vụ cấp, mở kỳ sau nếu giữ cho kỳ sau), `recordVendor` (`VENDOR_RECORD`), `recordTierStep` (nhảy bậc `minimum_seats`), `openNextPeriod`, `recordMember` (`MEMBERS` `+1`/`-1`); đọc `seatsOnDays`, `findWithPurchaseContext`, `findLineWithPeriodByPlan`, `futureMemberChanges`, `linesOfIds`/`linesOfSubscription`/`linesOfSubscriptions`, `existingTopUpItems`, `topUpPurchaseIdsOfRequest`, `findSeatPurchase`/`listAwaitingInvoicePurchases`/`ofSubscriptionMonthNoInvoice`, `notifySeatsBought`, `notifyVendorRecorded`, và khóa kỳ → dòng `lockPeriodsAndLines`/`lockPeriodAndLine`.
- `WorkspaceApi` ([public/workspace.api.ts](public/workspace.api.ts)) — đọc workspace thuộc nhà cung cấp: `adminsOf`, `workingAdminCount`, `responsibleOf`, `defaultWorkspaceOfVendor`.
- `LicenseLotApi` ([public/license-lot.api.ts](public/license-lot.api.ts)) — tạo, đọc và khóa lô license `K4`: `createLot` (gọi từ `licensing` khi tạo lô `REQUEST` hoặc tạo lô tự do), `lockLot` (lô `FOR UPDATE` tầng `6a` → gói `FOR SHARE` tầng `7`), `idsOfLots`, `findLot`, `findLotOfRequest`, `findLotsByIds`, `setInvoiceActual` (ghi một lần số tiền hóa đơn thực tế).
- `LicenseLotStockApi` ([public/license-lot-stock.api.ts](public/license-lot-stock.api.ts)) — đọc tồn kho và chọn lô `K4` `ACCOUNT`: `accountLotCandidates`, `chooseAccountLot` (ưu tiên lô `REQUEST` của chính Request, giữ phần cho người thụ hưởng đang mở, ném `409 LICENSE_LOT.RESERVED_FOR_REQUEST` khi hết license dư), `listAccountVacancies` (cho quy tắc `G1`), `newestFreeLotUnitPrice` (giá tham chiếu Request `K4` từ lô còn trống mới nhất).
- `CatalogContractApi` ([public/catalog-contract.api.ts](public/catalog-contract.api.ts)) — `getApplicationIds(contractId)`: ứng dụng của các thuê bao `K2` đang liên kết hợp đồng, mỗi ứng dụng một lần (tối đa `CONTRACT_APPLICATIONS_READ_MAX` = 1 000, chỉ để chặn đọc), `null` khi không có hợp đồng, rỗng khi chưa liên kết thuê bao nào. Dùng bởi `usage` cho `GET /contracts/{id}/usage-sources` (`US-04-13` AC-15); catalog không đọc `usage` (T4 < T6).
- `SubscriptionPeriodApi` ([public/subscription-period.api.ts](public/subscription-period.api.ts)) — kỳ subscription cho gia hạn và chi phí (`licensing`, `budgets`, `requests`): `getPeriods`, `getPurchaseFacts` (kèm `monthlyUnitPriceMinor`, `startDate`, `endExclusive`, `seatCounting`, `minimumSeatsTotal`), `adjustmentWindowsOf`, `earliestReducibleOn`, `getResponsibleSubscriptionIds`, `lockPeriod`, `listAdjustmentSubjects`, `listPaymentSchedules`, `recordNextPeriod` (nhận `lines[]` khi nối kỳ, đóng dòng cũ `RENEWED` tại `startDate - 1`), `closeExpiredLines` (đóng dòng `ENDED`), `linesOfSubscription`/`linesOfSubscriptions`.
- `CatalogPlanTermsApi` ([public/catalog-plan-terms.api.ts](public/catalog-plan-terms.api.ts)) — `installLimitOf(planId, tx?)`: giới
  hạn số máy cài đặt tối đa theo điều khoản gói (tách khỏi `CatalogApi` để giữ ≤ 8 phụ thuộc và tránh vòng `plan → plan-terms →
subscription → plan`; `licensing/license-key` và `licensing/device-activation` gọi).
- `CatalogResponsibilityApi` ([public/catalog-responsibility.api.ts](public/catalog-responsibility.api.ts)) — IT Admin phụ trách (`QĐ-111g`, R-8, R-26) cho bàn giao của IT Admin rời: `countResponsibilitiesOf` (số thuê bao + ứng dụng + workspace + lô mỗi người phụ trách), `transferResponsibilities(tx, actor, from, to)` đổi MỌI thuê bao, ứng dụng, workspace và lô sang IT Admin khác trong transaction của bên gọi, một Audit mỗi thứ; `usableSubscriptionItAdminsOfPlan`, `countWorkspacesBelowMinimum`, `workspacesWithNotWorkingAdmins`, `vendorAdminRolesOf` (một mục mỗi workspace), `countPlansBelowVendorAdminMinimum`. Lỗi `public/catalog-responsibility.errors.ts` (`ResponsibilityHandoverRefusedError`), kiểu `public/catalog-responsibility.types.ts`.
- `public/catalog.types.ts` — `SeatTarget` (kèm `keyBinding`), `SeatTargetRef`, `StockPlan` (kèm `keyBinding`), `PlanSummary`,
  `PlanRevocationInfo`, `WorkspaceDuty`…
- `public/catalog.extension-points.ts` — `SeatOccupancyHook` và contract `SeatOccupancyReader`; `SeatBaselinePhaseHook` (`catalog.seat-baseline-phase`) và `SeatBaselinePhase`.

## Bảng sở hữu

- Vendor: `vendors`, `vendor_groups`, `vendor_service_lines`, `vendor_dictionary_proposals`.
- Ứng dụng: `applications`, `application_business_owners`, `application_retirement_confirmations`, `functional_groups`.
- Plan: `plans`, `plan_workspace_profiles`, `plan_workspace_admins` (dữ liệu cũ, thôi là nguồn từ M4), `plan_terms`, `plan_term_opinions`.
- Dòng thuê bao và sổ seat: `subscription_lines` (một dòng mỗi kỳ và gói `K2`; unique một phần theo `(workspace_id, plan_id)` trên dòng chưa đóng; `ledger_opened_on` NULL = không có sổ), `seat_purchases` (mã `MUA-` + 6 số từ `seat_purchase_code_seq`, bất biến), `seat_changes` (sổ chỉ ghi thêm; trigger `seat_changes_check_row`, `seat_changes_check_capacity`, `seat_changes_append_only`). `license_assignment_check_capacity` khóa dòng và đọc sổ khi sổ đã mở, kỳ không có dòng giữ luật cũ.
- Workspace của nhà cung cấp: `workspaces`, `workspace_admins`. `subscriptions.workspace_id` (trigger `subscriptions_workspace_vendor`: hãng của workspace = hãng của gói), `seat_counting` (`FIXED`/`MEMBERS`), `minimum_seats_total`, `invoiced_later`.
- Lô khóa `K4`: `license_lots` (unique một lô `REQUEST` mỗi Request, `invoice_actual_minor`, `legacy_subscription_id`).
- Subscription: `subscriptions` (`monthly_unit_price_minor`, `closed_at`, `closed_reason`). Hợp đồng: `contracts`, `contract_subscriptions` (chỉ nhận `K2` từ đợt 3), `document_attachments`.
- Nguồn: `prisma/models/catalog.prisma`; hồ sơ thuế vendor (`VendorTaxProfile*`) thuộc `finance`.

## Extension point

- Mở: `SeatOccupancyHook` (`catalog.seat-occupancy`, Hook) — bên bind: licensing
  `assignment/occupancy/assignment-seat-occupancy.listener.ts` (`seatsOfSubscriptions`: ghế và ghế đang thu hồi của cả trang thuê bao trong một câu; dòng `GET /subscriptions` K2 có `seats`, `EXPIRED` chỉ khi còn ghế). Chưa bind thì `get()` ném lỗi, không để rule đi qua.
- Mở: `SeatBaselinePhaseHook` (`catalog.seat-baseline-phase`, Hook) — bên bind: licensing `seat-baseline/seat-baseline-phase.listener.ts`; cho
  biết baseline đã đóng chưa để chặn trùng thuê bao K2/K4. Chưa bind ⟹ coi như đã đóng (chặn).
- Không còn đăng ký vào `organization.department-use-readers`: thuê bao không có phòng đứng tên (`QĐ-113g`) nên không chặn việc ngừng phòng.
- Đăng ký vào `notifications.name-sources` (`NotificationNameContributions`, tên `catalog.names`) — `requestable-software/catalog-notification-names.listener.ts`, khai ở `catalog.module.ts`:
  APPLICATION (tên ứng dụng), PLAN và SUBSCRIPTION (`<Ứng dụng> – <Gói>`, hàm `applicationPlanName` ở `plan/plan.policy.ts`), mỗi kind một truy vấn theo lô ở repo chủ bảng (`ApplicationRepo.namesOf`,
  `PlanRepo.namesOf`, `SubscriptionRepo.labelsOf(ids, tx, applicationPlanName)`; mặc định `labelsOf` vẫn là `<Ứng dụng> / <Gói>` cho phần "đang dùng" của phòng ban). Đặt ở `requestable-software` vì capability này đã đọc
  cả ba bảng (không thêm cạnh capability; `subscription/` đã đủ 25 file, `catalog-entry` không import `plan`).

## Hướng phụ thuộc giữa capability (R6)

Không vòng (`pnpm arch:capabilities --module catalog`, gate `capability-graph`). Từ thấp lên cao: `vendor-dictionary` →
`vendor`, `functional-group` → `catalog-entry` → `plan` → `subscription` → `plan-terms`; `application-retirement`,
`application-intake`, `internal-software-registration` và `requestable-software` đứng trên `catalog-entry`, `plan` (và `subscription`). Một cạnh ngược mới là vòng: chuyển
file thuần xuống tầng thấp, hoặc đưa dịch vụ điều phối lên capability mới theo tên use case.

## Capability → file chính

- `vendor-dictionary/` — từ điển vendor dùng chung, gợi ý/chuẩn hóa, đề xuất (US-04-07);
  `vendor-dictionary.controller.ts`; `VendorDictionaryService`, `VendorRecognitionService`, `VendorProposalService`.
- `vendor/` — danh sách vendor, hồ sơ thuế và ước tính thuế (US-12-09, dữ liệu qua `FinanceApi`);
  `vendors.controller.ts`; `VendorQueryService`, `VendorTaxService`.
- `catalog-entry/` — ứng dụng (US-04-01; `logoUrl` là một link `https://` ≤ 500 ký tự, CHECK ở DB, `null` khi sửa là xóa — đọc cùng câu truy vấn ở danh sách/chi tiết ứng dụng, `requestable-software`, gói và, qua `CatalogApi`, ở `licensing`: phần mềm của tôi, danh sách phần mềm của phòng), IT Admin phụ trách (`QĐ-111g`: người tạo, đọc `responsibleItAdmin`/`needsResponsible`), gợi ý K2 (`k2-recommendation.policy.ts`);
  `applications.controller.ts`; `ApplicationService` (phần kiểm trước khi ghi ở
  `ApplicationWriteGuards`, phần đổi trạng thái là hàm thuần trong `application-state.policy.ts`). Gốc của module: `plan/` và
  `subscription/` đọc ứng dụng qua `ApplicationFactsService`; ứng dụng muốn biết plan của mình để gợi ý K2 thì khai
  `application-plans.types.ts` (`ApplicationPlans`) và `plan/plan-facts.service.ts` trả lời, `catalog.module.ts` nối hai bên.
- `plan/` (X-IT.4): cờ `plans.has_admin_console` (chỉ gói `K4`, `plan-vendor-admins.policy.ts`: `needsVendorAdmins` = `K2` hoặc `K4` có cờ, `assertAdminConsoleApplicable`); hồ sơ workspace (`PUT /plans/{id}/workspace-profile`) chỉ cho gói cần admin, thêm `ownerAccountEmail`/`adminNote`, `primaryOwner` + `members` ≥ 2 IT Admin khác nhau đang làm việc (`PLAN.VENDOR_ADMINS_INVALID`).
- `application-intake/` — một lệnh tạo ứng dụng kèm gói đầu (`POST /applications`, `QĐ-111f`): `application-intake.controller.ts`; `ApplicationIntakeService` ghi cả hai trong một transaction (gói bị luật từ chối thì không để lại ứng dụng);
  kiểu ứng dụng suy từ kiểu cấp của gói (`application-intake.policy.ts`: K5 ⟹ `INTERNAL`, còn lại `SAAS`), mô hình giá do `PlanService` suy (B-5), nhóm chức năng không nêu ⟹ _Khác_; kiểm trùng bằng `duplicateOf` chạy dưới
  `pg_advisory_xact_lock` theo tổ chức (409 `APPLICATION.DUPLICATE` kèm mục đã có). Đứng trên `catalog-entry/` và `plan/`.
- `application-responsibility/` — chuyển IT Admin phụ trách ứng dụng (`POST /applications/{id}/responsibility-transfer`, khóa dòng ứng dụng,
  chỉ `SUPER_ADMIN` — IT Admin gọi ⟹ 403 `APPLICATION.RESPONSIBILITY_NOT_YOURS`; `QĐ-111g`, R-26); `application-responsibility.policy.ts` quyết ai chuyển cho ai.
  `responsibility-handover.service.ts` (+ `.policy.ts`) chuyển MỘT LẦN mọi thuê bao và ứng dụng của một IT Admin (facade `CatalogResponsibilityApi`).
- `application-retirement/` — retire ứng dụng (IT Admin quyết, không ai xác nhận; chặn bởi assignment/subscription); đọc ứng dụng,
  plan và subscription nên đứng trên cả ba; controller, dto, policy, repo, `ApplicationRetirementService`.
- `internal-software-registration/` — đăng ký phần mềm nội bộ: tạo ứng dụng và plan trong một transaction; đứng trên
  `catalog-entry/` và `plan/`; `InternalSoftwareRegistrationService` (facade `CatalogApi` gọi).
- `requestable-software/` — danh mục cho người gửi Request chọn phần mềm/gói trước khi xem trước (`US-05-01` main flow,
  `a01-employee-catalog-selector`): `GET /requestable-applications[/{id}]`, `GET /requestable-plans[/{id}]`, mọi người đăng
  nhập; projection riêng, không dùng DTO quản trị. Ẩn ứng dụng retired/không có gói/loại ngoài baseline và chỉ gồm gói
  `keyBinding IS NULL OR ACCOUNT` (hằng `REQUESTABLE_PLAN`, loại gói `DEVICE_KEY`/`DEVICE_BUNDLED`); mỗi dòng nêu
  `canSubmit` (cổng Cost Center như preview) và trạng thái giá (`SubscriptionFactsService.pricedCyclesOfPlans`, không lộ số
  tiền); gói không có thuê bao có giá nhưng có giá tham chiếu (`QĐ-113a`) vẫn tính là "định giá được" (`referenceCycleOf`: `K1`/`K2` theo tháng, `K4` một lần). `RequestableSoftwareService`, `requestable-software.policy.ts`, repo chỉ `select` trường được phép.
- `functional-group/` — nhóm chức năng (BR-06.9); `functional-groups.controller.ts`; `FunctionalGroupService`.
- `plan/` — plan của ứng dụng, workspace profile K2 (US-04-02); `plans.controller.ts`; `PlanService`,
  `PlanWorkspaceService`.
  Kiểu gắn khóa `plans.key_binding` (`ACCOUNT`/`DEVICE_KEY`/`DEVICE_BUNDLED`, gói `K4` mặc định `ACCOUNT`) ghi qua `plan.repo.ts`;
  đổi kiểu gắn bị chặn bởi ba lý do của `PLAN.IN_USE_BLOCKS_CHANGE` (đã có thuê bao/ghế/kích hoạt thiết bị); `planList` hỗ trợ lọc
  `keyBinding`.
  Giá tham chiếu (`QĐ-113a`): `referencePrice { amount, currency }` không bắt buộc ở `POST/PATCH /plans` và gói đầu của `POST /applications` (`null` xóa khi sửa); chỉ `K1`/`K2`/`K4`,
  chỉ VND (`PLAN.REFERENCE_PRICE_NOT_VND`, `PLAN.REFERENCE_PRICE_NOT_APPLICABLE`); CHECK ở bảng (`plans_reference_price_whole/_valid`). Đổi kiểu sang `K5` hoặc giữa
  `K1`/`K2` và `K4` ⟹ xóa giá (nhập lại; audit `PLAN.UPDATED` giữ giá cũ); `K1`↔`K2` giữ. Requestable-software không lộ số (chỉ trạng thái giá).
- `license-lot/` — lô license của gói `K4`: `license-lot.repo.ts` (một người ghi `license_lots`, khóa lô tầng `6a`); lô sinh từ thuê bao `PERPETUAL` có **cùng id** thuê bao, khóa của nó giữ `license_lot_id` + `cost_borne`. DB giữ: gói `K4` không `DEVICE_BUNDLED`, workspace cùng hãng (bắt buộc khi gói có trang quản trị và đủ ≥ 2 admin làm việc ở workspace sau khi đóng baseline), mục đích hợp `key_binding` (`REQUEST` cho `ACCOUNT`, `STOCK` cho `ACCOUNT` hoặc `DEVICE_KEY`, `REPLACEMENT` cho cả hai), hợp đồng cùng hãng, một lô `REQUEST` mỗi Request, `license_lots_capacity` (khóa `ASSIGNED` không vượt `license_count`). `LicenseLotStockService` tính tồn thực có thể cấp (`grantable = min(free, keysInStore - openTasksWithoutKey)`), ưu tiên lô `REQUEST` của chính Request và kiểm tra `F11` (`409 LICENSE_LOT.RESERVED_FOR_REQUEST`), cung cấp giá tham chiếu Request `K4` từ lô còn trống mới nhất và danh sách lô `ACCOUNT` còn trống cho quy tắc `G1`. Route: `GET /license-lots`, `GET /license-lots/{id}`, `PATCH /license-lots/{id}` (IT Admin phụ trách: hợp đồng + lý do, ghi chú, giá khi chưa phát khóa và chưa chốt hóa đơn; `expectedUpdatedAt`), `POST /license-lots/{id}/responsible-it-admin` (chỉ Super Admin). Tạo lô (`POST /license-lots`) và nhập khóa vào lô (`POST /license-lots/{id}/keys`) nằm ở `licensing`.
- `subscription-line/` — dòng của kỳ thuê bao và sổ số seat:
  - `SubscriptionLineService`, `subscription-line.repo.ts` (khóa dòng tầng `6c`), `seat-change-query.service.ts`: `POST /subscriptions/{id}/lines` (thêm dòng cho kỳ, kiểm trùng `(workspace, plan)` dưới khóa N5), `PATCH /subscription-lines/{id}` (chỉ sửa giá/tối thiểu theo bậc/ghi chú; chặn sửa số lượng trực tiếp bằng `422 SUBSCRIPTION_LINE.QUANTITY_VIA_PURCHASE`, chặn dòng đã đóng `409 SUBSCRIPTION_LINE.CLOSED`), `GET /subscription-lines/{id}/seat-changes` (xem sổ biến động theo ngày hiệu lực).
  - `ledger/` (`SeatLedgerService`, `seat-ledger.repo.ts`): 4 cửa ghi sổ (`ADJUSTMENT` / `GRANT` / `VENDOR_RECORD` / `MEMBER`), tính `seatsOnDays`, chặn ngày hiệu lực ở tháng lịch đã đóng (`effectiveOn < ngày 1 tháng hiện tại` ⟹ `422 SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH`; **giới hạn**: không có đường sửa ngược tháng đã tính, phần chênh lệch nếu ghi muộn sang tháng kế sẽ rơi vào _Chênh lệch hóa đơn kho_ khi xác nhận hóa đơn), chặn giảm dưới số ghế đang chiếm (`409 SEAT_LEDGER.BELOW_OCCUPANCY`).
  - `purchase/` (`SeatPurchaseService`, `seat-purchase.repo.ts`, `seat-purchase.policy.ts`): ghi lần mua `MUA-xxxxxx`, tính hạn nộp hóa đơn (5 ngày làm việc / `NONE` / +95 ngày), giữ phần mua thêm cho kỳ kế tiếp nếu giữ cho kỳ sau, phát thông báo `SUBSCRIPTION_SEATS_BOUGHT` / `SEAT_LEDGER_VENDOR_RECORDED`.
  - `correction/` (`SubscriptionLineCorrectionService`, `subscription-line-seats.controller.ts`): `POST /subscription-lines/{id}/seat-corrections` (ghi theo nhà cung cấp `VENDOR_RECORD` kèm cờ `outOfProcess` cho `FIXED` khi không có căn cứ) và `POST /subscription-lines/{id}/seat-reductions` (giảm giữa kỳ `REDUCE`, kiểm `allowsMidTermReduction` và giới hạn tổng giảm không vượt tổng mua trong kỳ).
- `workspace/` — workspace công ty giữ ở một nhà cung cấp: `workspaces.controller.ts` (sáu route: `workspaceList`, `workspaceGet` đọc cho `IT_ADMIN`/`FINANCE`/`SUPER_ADMIN`; `workspaceCreate` mọi IT Admin, người tạo là người phụ trách; `workspaceUpdate`, `workspaceAdminsSet` chỉ IT phụ trách, `expectedUpdatedAt` bắt buộc; `workspaceResponsibleItAdminChange` chỉ `SUPER_ADMIN`); `WorkspaceService`, `WorkspaceAdminsService` (≥ 2 IT Admin khác nhau, chủ chính là OWNER trong danh sách), `WorkspaceResponsibleService`, `WorkspaceViewService` (tên, admin còn làm việc, cờ). Audit: `WORKSPACE.CREATED`, `WORKSPACE.UPDATED`, `WORKSPACE.ADMINS_SET`, `WORKSPACE.RESPONSIBLE_CHANGED`. Khóa: `employees` `FOR SHARE` (tầng `1`) → `workspaces` `FOR UPDATE` (tầng `5b`). Hồ sơ của gói đọc qua workspace của hãng của gói; route cũ `planWorkspaceProfileSet` ghi vào workspace đó. `WorkspaceForSubscriptionService` và `retryOnWorkspaceMove` khóa workspace trước kỳ và gói khi khai/hoàn tất/đổi thuê bao. `transferResponsibilities` (SBF-16) chuyển cả workspace và lô (`WORKSPACE.RESPONSIBLE_TRANSFERRED`, `LICENSE_LOT.RESPONSIBLE_TRANSFERRED`). Facade `WorkspaceApi` (`public/workspace.api.ts`): `adminsOf`, `workingAdminCount`, `responsibleOf`, `defaultWorkspaceOfVendor`.
- `plan-terms/` — điều khoản, cảnh báo review (US-04-11; ý kiến Business Owner đã gỡ, `QĐ-111g`); `plan-terms.controller.ts`;
  `PlanTermsService`.
- `subscription/` — subscription kỳ `K2` (US-04-03, US-04-05), đích ghế, giá; `subscriptions.controller.ts`: `subscriptionCreate` nhận `lines[]` (XOR `planId`), `workspaceId`, `seatCounting`, `minimumSeatsTotal`, `invoicedLater`, `monthlyUnitPrice` (chỉ `MONTHLY`/`ANNUAL`; từ chối khai mới `K1` bằng `422 SUBSCRIPTION.K1_HAS_NO_SUBSCRIPTION`, `PERPETUAL` bằng `422 SUBSCRIPTION.PERPETUAL_IS_LICENSE_LOT`, `DEVICE_BUNDLED` bằng `422 SUBSCRIPTION.PLAN_HAS_NO_SUBSCRIPTION`); `subscriptionUpdate` từ chối sửa tay `purchasedQuantity` (`409 SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER`) và `isPrimaryForPlan: true` (`422 SUBSCRIPTION.PRIMARY_RETIRED`), đồng bộ giá dòng khi kích hoạt nháp; con `responsible/` (`POST /subscriptions/{id}/responsible-it-admin`, chỉ `SUPER_ADMIN`; với thuê bao `PERPETUAL` đã thành lô thì ghi trực tiếp vào lô cùng id và audit `LICENSE_LOT.RESPONSIBLE_CHANGED`). `SubscriptionService`, `SubscriptionChangeService`, `SeatTargetService` (`lockSeatTarget` khóa `6 -> 6c -> 7` cho `K2`, `6a -> 7` cho `K4`). Cổng ≥ 2 admin đọc từ workspace của thuê bao; chặn trùng `(workspace_id, plan_id)` cho thuê bao sống ở mọi giai đoạn (`409 SUBSCRIPTION.DUPLICATE_PLAN`, bỏ `SHOULD_MERGE`).
- `contract/` — hợp đồng (nhà cung cấp, số, hiệu lực từ/đến — để trống là vô thời hạn —, ghi chú; không có loại hợp đồng,
  US-04-13, `QĐ-111t`) và file riêng tư trong object storage (US-04-04). `contracts.controller.ts` (danh sách, tạo, sửa kèm
  lý do, chi tiết), `contract-subscriptions.controller.ts` (liên kết và bỏ liên kết thuê bao), `documents.controller.ts`;
  `ContractService` (ghi), `ContractQueryService` (danh sách phân trang và chi tiết, mỗi mảng ≤ 100 kèm cờ `truncated`),
  `ContractSubscriptionService`, `DocumentService`; `document-expiry.job.ts` chạy mỗi giờ (DB-13). Trạng thái suy ra từ ngày
  hôm nay (`contractStatusOf`, `INCOMPLETE` cho hợp đồng cũ chỉ có tên), không lưu. `contract-fields.policy.ts` giữ trường,
  trạng thái và luật liên kết: chỉ thuê bao `K2`/`K4` cùng nhà cung cấp, mỗi thuê bao tối đa một hợp đồng (unique index và
  trigger `contract_subscriptions_check` giữ lần chót); nhà cung cấp không đổi khi còn thuê bao liên kết. Nguồn usage của ứng
  dụng không đọc ở đây (catalog T4 không đọc usage T6): chi tiết trả `applicationIds`.
- Gốc module: `catalog-audit-event.mapper.ts` (sự kiện Audit Trail, mọi capability dùng).

## Bất biến quan trọng

- Không route nào xóa vendor, nhóm chức năng, plan, subscription hay hợp đồng (JSDoc các controller).
- Thuê bao kho dùng chung (`QĐ-103e`, `QĐ-103v`(4), `QĐ-104d`(3)): `commitment_term_months` (1 hoặc 12; `PERPETUAL` không có),
  `responsible_it_admin_employee_id`, `vendor_minimum_seats` (> 0), `is_primary_for_plan` (unique partial theo
  `(organization_id, plan_id)`). Ghi `TERM` thành `ACTIVE` cần kỳ cam kết và IT Admin phụ trách (`assertPoolTerms`,
  `assertResponsibleNamed`): thiếu ⟹ 422 `COMMITMENT_TERM_REQUIRED` / `RESPONSIBLE_REQUIRED`; plan `K1` chỉ kỳ 1 + `MONTHLY`
  (`K1_MONTHLY_ONLY`); kỳ 1 + `ANNUAL` bị chặn (`BILLING_LONGER_THAN_COMMITMENT`). Ghi mới chỉ nhận chu kỳ `MONTHLY`/`ANNUAL`
  (`BILLING_CYCLE_UNSUPPORTED`); enum DB `BillingCycle` dùng chung với `requests` nên giữ nguyên, dữ liệu cũ
  `QUARTERLY`/`OTHER` đọc được kèm cảnh báo `BILLING_CYCLE_LEGACY`, thiếu người phụ trách kèm `RESPONSIBLE_MISSING`. Dữ liệu cũ
  không bị luật mới chặn khi ghi trường khác. Người phụ trách kiểm bằng `findUsableItAdminEmployeeIds` + nhân viên đang
  `WORKING`, đọc không khóa (một vai bị thu ngay sau kiểm tra không bị chặn). Cờ thuê bao chính: `PATCH isPrimaryForPlan` khóa
  `plans FOR UPDATE`, gỡ cờ ở thuê bao khác cùng gói rồi đặt; chỉ thuê bao `ACTIVE` chưa có kỳ kế tiếp
  (`PRIMARY_NOT_ELIGIBLE`); unique index chặn đua còn lại (409 `PRIMARY_CONFLICT`). Kỳ gia hạn kế thừa kỳ cam kết, người phụ
  trách, mức tối thiểu và cờ chính (`SubscriptionPeriodService.recordNext`). Thuê bao không có phòng sở hữu (`QĐ-113g`): cột `owner_department_id` đã bỏ, `POST /subscriptions` từ chối `ownerDepartmentId`.
  Chặn trùng (R-E02, `QĐ-104k`(3)), chỉ plan `K2`/`K4`: thuê bao "đang sống" khác của cùng plan = `DRAFT`, hoặc `ACTIVE` chưa có kỳ kế tiếp và (`PERPETUAL` hoặc
  không có `end_date` hoặc `end_date` ≥ hôm nay). Có ≥ 1: baseline chưa đóng ⟹ cho ghi, đọc trả `warnings` có `SHOULD_MERGE` + `mergeCandidateIds`
  (ở mọi giai đoạn); đã đóng (hoặc hook chưa bind) ⟹ 409 `SUBSCRIPTION.DUPLICATE_PLAN` (`details.subscriptionIds`). Kỳ gia hạn không là trùng.
  Khóa: `declareIn` khóa `plans FOR UPDATE` TRƯỚC (chưa có dòng thuê bao để khóa); `complete` khóa thuê bao `FOR UPDATE` → `plans FOR UPDATE`. Mọi
  ghi khác giữ thứ tự thuê bao → plan. F-012: `recordNext` chỉ chuyển cờ chính sang kỳ mới khi kỳ mới ghi `ACTIVE`; kỳ `DRAFT` để cờ ở kỳ cũ và
  `subscriptionComplete` chuyển cờ trong cùng transaction.
  Thứ tự khóa của `PATCH isPrimaryForPlan` và `complete` nối kỳ: khóa tập ứng viên thuê bao (`lockPrimaryCandidates`, gồm primary hiện tại + chính nó + `renewedFromId` theo `id`) → `plans FOR UPDATE` → cập nhật. Nhờ khóa đủ tập thuê bao trước `plans`, không còn deadlock ngược chiều với luồng giữ thuê bao rồi khóa plan.
- Chuỗi kỳ: `subscriptions.renewed_from_id` đặt một lần lúc tạo, cùng plan/phòng sở hữu, kỳ TERM, bắt đầu sau kỳ cũ (trigger
  `subscriptions_renewal_chain`); một kỳ có tối đa một kỳ nối tiếp (unique).
- Số lượng subscription không thấp hơn số ghế đang chiếm (`assertQuantityNotBelowOccupied`, `seat-guard.policy.ts`);
  retire ứng dụng chỉ khi không còn assignment/subscription chặn
  (`application-retirement/application-retirement.service.ts`). Cả hai đọc ghế qua `SeatOccupancyHook`.
- Điểm điều chỉnh (QĐ-111o, `subscription/obligation/subscription-obligation.policy.ts` `adjustmentPointOf`/`expiryReading`): gói tháng mở 7 ngày trước ngày thanh toán (ngày gia hạn, thiếu thì ngày kết thúc), gói năm 30 ngày trước hạn chót báo hủy (khai, suy từ số ngày báo trước, thiếu cả hai thì ngày gia hạn khi tự gia hạn, hoặc ngày kết thúc); mua một lần không có điểm. `GET /subscriptions?expiry=SOON|EXPIRED` tìm trong thuê bao `ACTIVE` kiểu `TERM` chưa có kỳ nối tiếp bằng policy rồi mới phân trang; `EXPIRED` chỉ khi còn ghế; `mine=true` lọc theo IT Admin phụ trách.
- `lockSeatTarget`: thuê bao `K2` khóa kỳ (`6`) → dòng (`6c`) → gói (`7`), lô `K4` khóa lô (`6a`) → gói (`7`), plan nội bộ khóa `plans` `FOR SHARE` (`seat-target.service.ts`).
- Luồng đổi/thêm trên thuê bao đã biết kỳ nhưng cần khóa workspace trước kỳ (`subscriptionUpdate` đổi `workspaceId`, hoàn tất nháp, `subscriptionLineAdd`) đọc `workspace_id` không khóa → khóa workspace theo `id` tăng dần (`5b`) → khóa kỳ (`6`) → kiểm tra lại `workspace_id`, nếu lệch thì rollback và thử lại (`retryOnWorkspaceMove`).
- Thay đổi thuê bao/dòng KHÔNG hỏi Cost Center của phòng nào (`QĐ-113g`): chi phí theo người giữ quyền (`K1` qua Request và hóa đơn của người đó, `K2` theo seat-tháng, `K4` theo lô). Cost Center của phòng người xin vẫn là điều kiện của Request trả phí (`QĐ-87g`, ở `requests`).

## Test

- Unit: `src/modules/catalog/**/*.spec.ts`; HTTP: `test/http/catalog/`; integration: `test/integration/catalog/`.

## Từ vựng

| Từ (UI/tài liệu)    | Tên ở code/wire                        | Nghĩa duy nhất                                                                |
| ------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| Gói                 | `Plan`, `plan`                         | Bậc và loại seat của một ứng dụng (ví dụ: _Claude Team — Standard_).          |
| Workspace           | `Workspace`, `workspace`               | Tài khoản tổ chức tại hãng, thuộc một nhà cung cấp.                           |
| Thuê bao            | `Subscription`                         | Cam kết có kỳ của một workspace; mỗi kỳ là một bản ghi.                       |
| Dòng thuê bao       | `SubscriptionLine`, `subscriptionLine` | Một gói trong một kỳ thuê bao, có giá tháng và sổ số seat.                    |
| Sổ số seat          | `SeatChange`, `seatChanges`            | Bản ghi chỉ ghi thêm; số seat của dòng là tổng `delta` tới một ngày.          |
| Lần mua             | `SeatPurchase`, `seatPurchase`         | Một lần mua `n` seat; một hóa đơn _Mua thêm seat_ gắn đúng một lần mua.       |
| Kho                 | (không có bảng)                        | Seat hoặc license **Trống** cấp được ngay.                                    |
| Lô khóa             | `LicenseLot`, `licenseLot`             | Khoản mua đứt `K4`; không gọi là thuê bao.                                    |
| Gói tháng / gói năm | `commitmentTermMonths` `1` / `12`      | Kỳ cam kết (không phải chu kỳ trả).                                           |
| Giá tháng           | `monthlyUnitPrice`                     | VND chưa thuế, một seat một tháng (`K1`/`K2`); với `K4` là _giá một license_. |
| Người phụ trách     | `responsibleItAdmin`                   | IT Admin trả lời cho thuê bao/workspace/lô; chỉ Super Admin đổi.              |

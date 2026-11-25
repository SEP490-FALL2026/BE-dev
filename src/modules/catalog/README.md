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
- `public/catalog-duplicate.policy.ts` — `duplicateOf`: mục danh mục đã là phần mềm đó theo tên chuẩn hóa (hoa thường, dấu, khoảng trắng bỏ qua) hoặc tên miền (host đã chuẩn hóa, tên xét trước,
  `QĐ-111b`); hàm thuần, một luật cho lệnh tạo ứng dụng (`application-intake/`) và cho cửa case B của `requests` (qua `findCatalogEntryOfSoftware`); đăng ký trong `PUBLIC_ROOT_POLICY_FILES` vì cả hai bên dùng.
- `CatalogApi` ([public/catalog.api.ts](public/catalog.api.ts)) — facade cho module khác:
  - `findSeatTarget`, `findPlanSeatTargets`, `lockSeatTarget` — đích ghế (một subscription hoặc một plan nội bộ).
  - `findCatalogEntryOfSoftware(tx, { name, homepageUrl })` — mục danh mục đã là phần mềm đó theo tên chuẩn hóa hoặc tên miền (cùng quy tắc `duplicateOf` với lệnh tạo ứng dụng) kèm
    tối đa 20 gói; cửa case B của `requests` (`QĐ-111b`). `getCatalogEntry(tx, applicationId, planName?)` — một ứng dụng với gói của nó và gói trùng tên đã hỏi (đề xuất rút gọn, `QĐ-111a`).
  - `getCollectorApplications(ids, tx?)` — ứng dụng một allowlist của collector cần xét: tên, kiểu, `logoUrl`, cờ ứng dụng liên lạc (**suy từ nhóm _Liên lạc_**, `QĐ-111e`, không còn cờ riêng; không bao giờ báo cáo, `QĐ-62o`) và đã retired chưa.
  - `getPlanSummaries`, `getPlanRevocationInfo`, `getSimilarPlanIds`, `getPlanVendorId`, `getPlanVendorIds` (nhiều plan trong một lần đọc), `getPlanResponsibleItAdminId` — đọc
    plan.
  - `getPlanPrice(planId, tx?)` — giá của plan từ thuê bao chính (`pickPriceSource`: cờ `is_primary_for_plan`, không có thì giá tháng quy đổi
    (`price_reporting_minor`) cao nhất, hòa thì `start_date` cũ hơn rồi `id`), không theo phòng (S1-02, `BR-MF1-07`); trả `{ kind: RECURRING | ONE_TIME,
unitPrice, reportingUnitPrice, billingCycle }`, thuê bao `PERPETUAL` có giá ⟹ `ONE_TIME` (khóa `K4`). Kỳ đã có kỳ kế tiếp vẫn định giá khi kỳ kế
    tiếp còn `DRAFT` (F-012). `getPlanPrice(planId, tx, on)` — giá hiệu lực ngày `on`: ưu tiên kỳ thuê bao chạy ngày đó (đã bắt
    đầu, chưa kết thúc, chưa có kỳ kế tiếp bắt đầu trước/đúng ngày đó); không kỳ nào chạy ngày đó thì như không có `on` (khoản 01/01, `BR-MF1-09e`).
    **Giá tham chiếu của gói (`QĐ-113a`)**: không thuê bao nào định giá được gói thì dùng `plans.reference_price_minor/_currency` (VND chưa thuế; `K1`/`K2` = giá một
    seat một tháng ⟹ `RECURRING` + `MONTHLY`, `K4` = giá một khóa ⟹ `ONE_TIME`; `K5` không có); kết quả thêm `source: SUBSCRIPTION | PLAN_REFERENCE`. Thiếu cả hai ⟹ `null`
    như cũ (`NO_PRICED_SUBSCRIPTION`). Giá tham chiếu **không** dùng cho chi phí theo seat, điểm điều chỉnh, đối chiếu hóa đơn. `CatalogPricingApi.getPlanPrice` (facade worker,
    `catalog-pricing-facade.module.ts`) đi cùng đường `SubscriptionPriceService.priceOfPlan`. `adoptPlanQuotePrice(actor, planId, price, tx)` — case B: báo giá đã duyệt (quy về
    giá tháng, làm tròn lên tới đồng) thành giá tham chiếu của gói `K1`/`K2` chưa có giá khi IT gắn Request vào gói; không ghi đè, không chép cho `K4`.
  - `getGrantableSubscriptions(planId, today, tx?)` / `getGrantableSubscriptionsOfPlans` (nhiều plan, một lần đọc) — thuê bao `ACTIVE` còn hiệu lực hôm
    nay, chưa bị kỳ kế tiếp `ACTIVE` đã bắt đầu thay (kỳ đang chạy và kỳ kế tiếp ghi trước ngày bắt đầu cùng là kho; bản `DRAFT` không cấp được), thứ tự:
    thuê bao chính trước, rồi giá tháng quy đổi cao nhất (`orderBySourcePreference`); `getSubscriptionPrice` (kèm giá quy đổi; `PERPETUAL` ⟹ `ONE_TIME`).
  - `getStockPlans({ today, responsibleItAdminEmployeeId?, planId?, skip, take })` — một trang gói K1/K2/K4 theo ứng dụng rồi gói, mỗi gói kèm các thuê bao
    cấp được hôm nay (cùng nghĩa `getGrantableSubscriptions`; gói không có thuê bao nào bị bỏ, có `responsibleItAdminEmployeeId` thì chỉ thuê bao của IT Admin đó
    được tính) và tổng cho cùng bộ lọc, một snapshot: nền của `GET /stock-summary` của `licensing` (`QĐ-111n`). SQL ở `SubscriptionGrantingRepo.pageStockPlans`.
  - `addPoolSeat(tx, actor, subscriptionId)` — +1 `purchased_quantity` của thuê bao `ACTIVE` đang bị bên gọi khóa (`lockSeatTarget`), gói năm tăng giữa
    kỳ được, không hỏi Cost Center của phòng sở hữu; dùng khi `provisioningTaskGrant` có `purchase` mà kho hết và khi cấp `K1` (mỗi lần cấp tự +1).
  - `getApplicationsOwnedBy`, `getWorkspaceDutiesOf` — thứ một phòng ban/người đang giữ.
  - `registerInternalSoftware` — đăng ký phần mềm nội bộ trong transaction của bên gọi (US-05-20).
  - `getVendorName`, `getOnboardingFacts` — tên vendor; số ứng dụng/plan/subscription cho checklist onboarding.
- `CatalogContractApi` ([public/catalog-contract.api.ts](public/catalog-contract.api.ts)) — `getApplicationIds(contractId)`: ứng dụng của các thuê bao đang liên kết hợp đồng, mỗi ứng dụng một lần (tối đa `CONTRACT_APPLICATIONS_READ_MAX` = 1 000, chỉ để chặn đọc), `null` khi không có hợp đồng, rỗng khi chưa liên kết thuê bao nào. Dùng bởi `usage` cho `GET /contracts/{id}/usage-sources` (`US-04-13` AC-15); catalog không đọc `usage` (T4 < T6).
- `SubscriptionPeriodApi` ([public/subscription-period.api.ts](public/subscription-period.api.ts)) — kỳ subscription cho gia hạn
  (licensing): `getPeriods` (cả thuê bao kho; kèm `adjustment` điểm điều chỉnh), `lockPeriod`, `listAdjustmentSubjects` (K2 đang chạy kỳ, chưa nối tiếp, tối đa 500), `recordNextPeriod` (kỳ mới nối chuỗi `renewed_from_id`, một
  lần), `getRenewalAlertRecipient`, `listPaymentSchedules` (PI-2: chu kỳ, ngày thanh toán và IT Admin phụ trách của mọi thuê bao đang chạy kỳ, cho cờ kỳ chưa có hóa đơn của `requests`); lỗi `public/subscription-period.errors.ts`, kiểu `public/subscription-period.types.ts`.
- `CatalogPlanTermsApi` ([public/catalog-plan-terms.api.ts](public/catalog-plan-terms.api.ts)) — `installLimitOf(planId, tx?)`: giới
  hạn số máy cài đặt tối đa theo điều khoản gói (tách khỏi `CatalogApi` để giữ ≤ 8 phụ thuộc và tránh vòng `plan → plan-terms →
subscription → plan`; `licensing/license-key` và `licensing/device-activation` gọi).
- `CatalogResponsibilityApi` ([public/catalog-responsibility.api.ts](public/catalog-responsibility.api.ts)) — IT Admin phụ trách (`QĐ-111g`, R-8, R-26) cho bàn giao của IT Admin rời: `countResponsibilitiesOf` (số thuê bao + ứng dụng mỗi người phụ trách), `transferResponsibilities(tx, actor, from, to)` đổi MỌI thuê bao và ứng dụng sang IT Admin khác trong transaction của bên gọi, một Audit mỗi thứ; `usableSubscriptionItAdminsOfPlan` đọc IT phụ trách thuê bao active của gói cho cảnh báo `VENDOR_ADMINS_BELOW_MINIMUM`; lỗi `public/catalog-responsibility.errors.ts` (`ResponsibilityHandoverRefusedError`: cùng một người / đích không phải IT Admin đang làm việc), kiểu `public/catalog-responsibility.types.ts`.
- `public/catalog.types.ts` — `SeatTarget` (kèm `keyBinding`), `SeatTargetRef`, `StockPlan` (kèm `keyBinding`), `PlanSummary`,
  `PlanRevocationInfo`, `WorkspaceDuty`…
- `public/catalog.extension-points.ts` — `SeatOccupancyHook` và contract `SeatOccupancyReader`; `SeatBaselinePhaseHook` (`catalog.seat-baseline-phase`) và `SeatBaselinePhase`.

## Bảng sở hữu

- Vendor: `vendors`, `vendor_groups`, `vendor_service_lines`, `vendor_dictionary_proposals`.
- Ứng dụng: `applications`, `application_business_owners`, `application_retirement_confirmations`, `functional_groups`.
- Plan: `plans`, `plan_workspace_profiles`, `plan_workspace_admins` (dữ liệu cũ, thôi là nguồn từ M4), `plan_terms`, `plan_term_opinions`.
- Dòng thuê bao và sổ seat (W3-15, M5): `subscription_lines` (một dòng mỗi kỳ và gói `K2`; unique một phần (workspace, gói) khi chưa đóng; `ledger_opened_on` NULL = không có sổ), `seat_purchases` (mã `MUA-` + 6 số từ `seat_purchase_code_seq`, bất biến), `seat_changes` (sổ chỉ ghi thêm; trigger `seat_changes_check_row`, `seat_changes_check_capacity`, `seat_changes_append_only`). `license_assignment_check_capacity` khóa dòng và đọc sổ khi sổ đã mở, kỳ không có dòng giữ luật cũ.
- Workspace của nhà cung cấp: `workspaces`, `workspace_admins` (W3-10). `subscriptions.workspace_id` (trigger `subscriptions_workspace_vendor`: hãng của workspace = hãng của gói), `seat_counting` (`FIXED`/`MEMBERS`), `minimum_seats_total`, `invoiced_later` (W3-11).
- Subscription: `subscriptions`. Hợp đồng: `contracts`, `contract_subscriptions`, `document_attachments`.
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
- `subscription-line/` — dòng của kỳ thuê bao và sổ seat (W3-15): `subscription-line.repo.ts` (một người ghi `subscription_lines`, khóa dòng tầng 6a), nhóm `ledger/` (`seat-ledger.repo.ts`, một người ghi `seat_changes`; lỗi `SeatLedgerBelowOccupancyError`, `SeatLedgerItemGrantedError`, `SeatLedgerClosedError`) và `purchase/` (`seat-purchase.repo.ts`, một người ghi `seat_purchases`, rút mã từ sequence). Chưa có route: dịch vụ ghi đến ở P15/P16.
- `workspace/` — workspace công ty giữ ở một nhà cung cấp (W3-10, `QĐ-115c`): `workspaces.controller.ts` (sáu route: `workspaceList`, `workspaceGet`
  đọc cho `IT_ADMIN`/`FINANCE`/`SUPER_ADMIN`; `workspaceCreate` mọi IT Admin, người tạo là người phụ trách; `workspaceUpdate`, `workspaceAdminsSet` chỉ IT phụ trách,
  `expectedUpdatedAt` bắt buộc; `workspaceResponsibleItAdminChange` chỉ `SUPER_ADMIN`); `WorkspaceService`, `WorkspaceAdminsService` (≥ 2 IT Admin khác nhau, chủ chính
  là OWNER trong danh sách), `WorkspaceResponsibleService`, `WorkspaceViewService` (tên, admin còn làm việc, cờ); `workspace.policy.ts` là hàm thuần. Audit:
  `WORKSPACE.CREATED`, `WORKSPACE.UPDATED`, `WORKSPACE.ADMINS_SET`, `WORKSPACE.RESPONSIBLE_CHANGED`. Khóa: workspace `FOR UPDATE` (tầng 5b). Hồ sơ của gói (`planGet.workspaceProfile`, cổng ≥ 2 admin, `VendorAdminRole`, `workspaceDutiesOf`) đọc workspace của hãng của gói (một workspace ⟹ nó; nhiều ⟹ workspace có thuê bao sống của gói, không có ⟹ tạo sớm nhất); route cũ `planWorkspaceProfileSet` ghi vào workspace đó qua `WorkspaceAdminsService`/`WorkspaceService` (mã lỗi cũ giữ; `409 PLAN.WORKSPACE_AMBIGUOUS`, `422 PLAN.WORKSPACE_VENDOR_REQUIRED`, `403 WORKSPACE.NOT_RESPONSIBLE`). Khai/hoàn tất/đổi thuê bao khóa workspace trước kỳ và gói (`WorkspaceForSubscriptionService`, `retryOnWorkspaceMove`). `transferResponsibilities` (SBF-16) chuyển cả workspace (`WORKSPACE.RESPONSIBLE_TRANSFERRED`). Facade `WorkspaceApi`
  (`public/workspace.api.ts`): `adminsOf`, `workingAdminCount`, `responsibleOf`, `defaultWorkspaceOfVendor`.
- `plan-terms/` — điều khoản, cảnh báo review (US-04-11; ý kiến Business Owner đã gỡ, `QĐ-111g`); `plan-terms.controller.ts`;
  `PlanTermsService`.
- `subscription/` — subscription và mua đứt (US-04-03, US-04-05), đích ghế, giá; `subscriptions.controller.ts` (`subscriptionCreate` từ
  chối gói `DEVICE_BUNDLED` bằng 422 `SUBSCRIPTION.PLAN_HAS_NO_SUBSCRIPTION`; `subscriptionUpdate` không còn nhận
  `responsibleItAdminEmployeeId`); con `responsible/` (`POST /subscriptions/{id}/responsible-it-admin`,
  `subscriptionResponsibleItAdminChange`, chỉ `SUPER_ADMIN`, audit `SUBSCRIPTION.RESPONSIBLE_CHANGED`);
  `SubscriptionService`, `SubscriptionChangeService` (đổi subscription; kiểm trước khi ghi ở `SubscriptionChangeGuard`),
  `SeatTargetService`, `seat-guard.policy.ts` (số lượng không dưới ghế đang chiếm); `nextStateOf`, `subscriptionStatusOf`,
  `sameUnitPrice`, `isStaleEdit` là hàm thuần trong `subscription.policy.ts`.
  Khóa lạc quan & đổi số seat: `PATCH /subscriptions/:id` bắt buộc `expectedUpdatedAt` khi gửi `purchasedQuantity` (`422 SUBSCRIPTION.VERSION_REQUIRED` nếu thiếu); trong giao dịch đã khóa `FOR UPDATE`, khác `updated_at` hiện tại (độ chính xác ms) thì `409 SUBSCRIPTION.STALE` + `details.currentUpdatedAt`, không ghi gì. Với thuê bao `K2` đang `ACTIVE`, giảm `purchasedQuantity` khi kỳ cam kết đang lưu 12 tháng và `allowsMidTermReduction = false` trả `409 SUBSCRIPTION.MID_TERM_REDUCTION_NOT_ALLOWED`; tăng `purchasedQuantity` bắt buộc `quantityChangeReason` (`422 SUBSCRIPTION.QUANTITY_REASON_REQUIRED`) và ghi vào audit `SUBSCRIPTION.UPDATED`. Mọi đường ghi dòng `subscriptions` đều bump `updated_at`: Prisma `@updatedAt` (kể cả `addPoolSeat` cho cấp K1/K2/K4 và gia hạn) và SQL thô `reassignResponsible` (`updated_at = now()`); gia hạn/thu hồi ghế không có đường SQL thô nào khác. Thu hồi/kết thúc cấp phát không giảm `purchased_quantity`. Cổng ≥ 2 admin của thuê bao `K2`/`K4` có trang quản trị đếm số IT Admin còn làm việc (`workingAdminsAmong`) và chỉ chặn khi pha baseline ghế đã đóng.
  `SubscriptionPoolRulesService` giữ các luật kho dùng chung mà policy thuần không biết (ai được phụ trách thuê bao).
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
- `lockSeatTarget`: subscription `FOR UPDATE`, plan nội bộ `FOR SHARE` tới hết transaction (`seat-target.service.ts`).
- Thay đổi thuê bao (PATCH, `addPoolSeat`) KHÔNG hỏi Cost Center của phòng nào (`QĐ-113g`): chi phí theo người giữ quyền (`K1` qua Request và hóa đơn của người đó,
  `K2`/`K4` theo seat-tháng, `QĐ-103d`(2)). Cost Center của phòng người xin vẫn là điều kiện của Request trả phí (`QĐ-87g`, ở `requests`).

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

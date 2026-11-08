# catalog

Mục đích: danh mục phần mềm dùng chung — từ điển vendor, ứng dụng và Business Owner, nhóm chức năng, plan và điều khoản
của plan, subscription/mua đứt, hợp đồng và file đính kèm. Story chính: US-04-01 → US-04-07, US-04-11, US-12-09 (route
hồ sơ thuế vendor); US-05-20 (đăng ký phần mềm nội bộ, gọi qua facade). Tầng: T4 (`scripts/arch/tiers.cjs`). Phụ thuộc:
audit, organization, identity-access, finance, operating-parameters. Được dùng bởi: licensing, budgets, requests,
personnel, onboarding, data-import (chỉ type); gốc `src/app/app.module.ts` và lệnh `src/cli/assign-subscription-owner/`.

## Public API (`public/`)

- `CatalogApi` ([public/catalog.api.ts](public/catalog.api.ts)) — facade cho module khác:
  - `findSeatTarget`, `findPlanSeatTargets`, `lockSeatTarget` — đích ghế (một subscription hoặc một plan nội bộ).
  - `getPlanSummaries`, `getPlanRevocationInfo`, `getSimilarPlanIds`, `getPlanVendorId`, `getPlanVendorIds` (nhiều plan trong một lần đọc), `getPlanBusinessOwnerId` — đọc
    plan.
  - `getPlanPrice` — đơn giá plan cho một phòng ban, chỉ từ subscription phòng ban đó sở hữu.
  - `getSubscriptionIdsOwnedBy`, `getApplicationsOwnedBy`, `getWorkspaceDutiesOf` — thứ một phòng ban/người đang giữ.
  - `registerInternalSoftware` — đăng ký phần mềm nội bộ trong transaction của bên gọi (US-05-20).
  - `getVendorName`, `getOnboardingFacts` — tên vendor; số ứng dụng/plan/subscription cho checklist onboarding.
- `SubscriptionPeriodApi` ([public/subscription-period.api.ts](public/subscription-period.api.ts)) — kỳ subscription cho gia hạn
  (licensing): `getPeriods`, `lockPeriod`, `listRenewalSubjects`, `recordNextPeriod` (kỳ mới nối chuỗi `renewed_from_id`, một
  lần), `getRenewalAlertRecipient`; lỗi `public/subscription-period.errors.ts`, kiểu `public/subscription-period.types.ts`.
- `SubscriptionOwnerAssignmentApi` (`public/subscription-owner-assignment.api.ts`) — `assign`: gán phòng ban sở hữu cho
  một subscription (`pnpm ops:assign-subscription-owner`).
- `public/subscription-owner-assignment.errors.ts` — `AssignmentRefusedError`;
  `public/subscription-owner-assignment.types.ts` — `AssignmentCommand`, `AssignmentResult`.
- `public/catalog.types.ts` — `SeatTarget`, `SeatTargetRef`, `PlanSummary`, `PlanRevocationInfo`, `WorkspaceDuty`…
- `public/catalog.extension-points.ts` — `SeatOccupancyHook` và contract `SeatOccupancyReader`.

## Bảng sở hữu

- Vendor: `vendors`, `vendor_groups`, `vendor_service_lines`, `vendor_dictionary_proposals`.
- Ứng dụng: `applications`, `application_business_owners`, `application_retirement_confirmations`, `functional_groups`.
- Plan: `plans`, `plan_workspace_profiles`, `plan_workspace_admins`, `plan_terms`, `plan_term_opinions`.
- Subscription: `subscriptions`, `subscription_owner_assignments`. Hợp đồng: `contracts`, `document_attachments`.
- Nguồn: `prisma/models/catalog.prisma`; hồ sơ thuế vendor (`VendorTaxProfile*`) thuộc `finance`.

## Extension point

- Mở: `SeatOccupancyHook` (`catalog.seat-occupancy`, Hook) — bên bind: licensing
  `assignment/assignment-seat-occupancy.listener.ts`. Chưa bind thì `get()` ném lỗi, không để rule đi qua.
- Đăng ký vào: `organization.department-use-readers` (`DepartmentUseContributions`, tên `catalog.subscriptions`) —
  `subscription/subscription-department-use.listener.ts`.

## Hướng phụ thuộc giữa capability (R6)

Không vòng (`pnpm arch:capabilities --module catalog`, gate `capability-graph`). Từ thấp lên cao: `vendor-dictionary` →
`vendor`, `functional-group` → `catalog-entry` → `plan` → `subscription` → `plan-terms`; `application-retirement`,
`internal-software-registration` và `requestable-software` đứng trên `catalog-entry`, `plan` (và `subscription`). Một cạnh ngược mới là vòng: chuyển
file thuần xuống tầng thấp, hoặc đưa dịch vụ điều phối lên capability mới theo tên use case.

## Capability → file chính

- `vendor-dictionary/` — từ điển vendor dùng chung, gợi ý/chuẩn hóa, đề xuất (US-04-07);
  `vendor-dictionary.controller.ts`; `VendorDictionaryService`, `VendorRecognitionService`, `VendorProposalService`.
- `vendor/` — danh sách vendor, hồ sơ thuế và ước tính thuế (US-12-09, dữ liệu qua `FinanceApi`);
  `vendors.controller.ts`; `VendorQueryService`, `VendorTaxService`.
- `catalog-entry/` — ứng dụng (US-04-01), Business Owner (US-04-06), gợi ý K2 (`k2-recommendation.policy.ts`);
  `applications.controller.ts`, `application-owners.controller.ts`; `ApplicationService` (phần kiểm trước khi ghi ở
  `ApplicationWriteGuards`, phần đổi trạng thái là hàm thuần trong `application-state.policy.ts`). Gốc của module: `plan/` và
  `subscription/` đọc ứng dụng qua `ApplicationFactsService`; ứng dụng muốn biết plan của mình để gợi ý K2 thì khai
  `application-plans.types.ts` (`ApplicationPlans`) và `plan/plan-facts.service.ts` trả lời, `catalog.module.ts` nối hai bên.
- `application-retirement/` — retire ứng dụng (xác nhận của Business Owner, chặn bởi assignment/subscription); đọc ứng dụng,
  plan và subscription nên đứng trên cả ba; controller, dto, policy, repo, `ApplicationRetirementService`.
- `internal-software-registration/` — đăng ký phần mềm nội bộ: tạo ứng dụng và plan trong một transaction; đứng trên
  `catalog-entry/` và `plan/`; `InternalSoftwareRegistrationService` (facade `CatalogApi` gọi).
- `requestable-software/` — danh mục cho người gửi Request chọn phần mềm/gói trước khi xem trước (`US-05-01` main flow,
  `a01-employee-catalog-selector`): `GET /requestable-applications[/{id}]`, `GET /requestable-plans[/{id}]`, mọi người đăng
  nhập; projection riêng, không dùng DTO quản trị. Ẩn ứng dụng retired/không có gói/loại ngoài baseline; mỗi dòng nêu
  `canSubmit` (cổng Cost Center như preview) và trạng thái giá (`SubscriptionFactsService.pricedCyclesOfPlans`, không lộ số
  tiền). `RequestableSoftwareService`, `requestable-software.policy.ts`, repo chỉ `select` trường được phép.
- `functional-group/` — nhóm chức năng (BR-06.9); `functional-groups.controller.ts`; `FunctionalGroupService`.
- `plan/` — plan của ứng dụng, workspace profile K2 (US-04-02); `plans.controller.ts`; `PlanService`,
  `PlanWorkspaceService`.
- `plan-terms/` — điều khoản, ý kiến Business Owner, cảnh báo review (US-04-11); `plan-terms.controller.ts`;
  `PlanTermsService`.
- `subscription/` — subscription và mua đứt (US-04-03, US-04-05), đích ghế, giá; `subscriptions.controller.ts`;
  `SubscriptionService`, `SubscriptionChangeService` (đổi subscription; kiểm trước khi ghi ở `SubscriptionChangeGuard`),
  `SeatTargetService`, `seat-guard.policy.ts` (số lượng không dưới ghế đang chiếm); `nextStateOf`, `subscriptionStatusOf`,
  `sameUnitPrice` là hàm thuần trong `subscription.policy.ts`.
  `SubscriptionPoolRulesService` giữ các luật kho dùng chung mà policy thuần không biết (ai được phụ trách thuê bao).
- `contract/` — hợp đồng và file riêng tư trong object storage (US-04-04); `contracts.controller.ts`,
  `documents.controller.ts`; `ContractService`, `DocumentService`; `document-expiry.job.ts` chạy mỗi giờ (DB-13).
- `subscription-owner-assignment/` — repo và Nest module riêng của lệnh CLI (`subscription-owner-assignment-cli.module.ts`); service nằm ở `public/`.
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
  trách, mức tối thiểu và cờ chính (`SubscriptionPeriodService.recordNext`). Cột phòng sở hữu và chặn trùng (ứng dụng, gói) chưa
  đổi: W4/W5.
  Thứ tự khóa của `PATCH isPrimaryForPlan`: dòng thuê bao → `plans FOR UPDATE` → gỡ cờ ở thuê bao khác. Một ghi khác đang giữ
  dòng thuê bao đang là chính và chờ plan có thể gây deadlock (`40P01` ⟹ 503 thử lại được, không phải 409): chấp nhận ở W1.
- Chuỗi kỳ: `subscriptions.renewed_from_id` đặt một lần lúc tạo, cùng plan/phòng sở hữu, kỳ TERM, bắt đầu sau kỳ cũ (trigger
  `subscriptions_renewal_chain`); một kỳ có tối đa một kỳ nối tiếp (unique).
- Số lượng subscription không thấp hơn số ghế đang chiếm (`assertQuantityNotBelowOccupied`, `seat-guard.policy.ts`);
  retire ứng dụng chỉ khi Business Owner đã xác nhận và không còn assignment/subscription chặn
  (`application-retirement/application-retirement.service.ts`). Cả hai đọc ghế qua `SeatOccupancyHook`.
- `lockSeatTarget`: subscription `FOR UPDATE`, plan nội bộ `FOR SHARE` tới hết transaction (`seat-target.service.ts`).
- Thay đổi tạo/tăng/kéo dài khoản phải trả cần phòng ban sở hữu có Cost Center đang dùng (F26,
  `FINANCE.SETUP_INCOMPLETE`, `subscription.service.ts`).
- Gán phòng ban sở hữu: một transaction, khóa subscription, audit actor `OPERATOR`; chạy lại cùng lệnh trả
  `ALREADY_ASSIGNED` (`subscription-owner-assignment.api.ts`).

## Test

- Unit: `src/modules/catalog/**/*.spec.ts`; HTTP: `test/http/catalog/`; integration: `test/integration/catalog/`.

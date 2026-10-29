# catalog

Mục đích: danh mục phần mềm dùng chung — từ điển vendor, ứng dụng và Business Owner, nhóm chức năng, plan và điều khoản
của plan, subscription/mua đứt, hợp đồng và file đính kèm. Story chính: US-04-01 → US-04-07, US-04-11, US-12-09 (route
hồ sơ thuế vendor); US-05-20 (đăng ký phần mềm nội bộ, gọi qua facade). Tầng: T4 (`scripts/arch/tiers.cjs`). Phụ thuộc:
audit, organization, identity-access, finance, operating-parameters. Được dùng bởi: licensing, budgets, requests,
personnel, onboarding, data-import (chỉ type); gốc `src/app/app.module.ts` và lệnh `src/cli/assign-subscription-owner/`.

## Public API (`public/`)

- `CatalogApi` ([public/catalog.api.ts](public/catalog.api.ts)) — facade cho module khác:
  - `findSeatTarget`, `findPlanSeatTargets`, `lockSeatTarget` — đích ghế (một subscription hoặc một plan nội bộ).
  - `getPlanSummaries`, `getPlanRevocationInfo`, `getSimilarPlanIds`, `getPlanVendorId`, `getPlanBusinessOwnerId` — đọc
    plan.
  - `getPlanPrice` — đơn giá plan cho một phòng ban, chỉ từ subscription phòng ban đó sở hữu.
  - `getSubscriptionIdsOwnedBy`, `getApplicationsOwnedBy`, `getWorkspaceDutiesOf` — thứ một phòng ban/người đang giữ.
  - `registerInternalSoftware` — đăng ký phần mềm nội bộ trong transaction của bên gọi (US-05-20).
  - `getVendorName`, `getOnboardingFacts` — tên vendor; số ứng dụng/plan/subscription cho checklist onboarding.
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

## Capability → file chính

- `vendor-dictionary/` — từ điển vendor dùng chung, gợi ý/chuẩn hóa, đề xuất (US-04-07);
  `vendor-dictionary.controller.ts`; `VendorDictionaryService`, `VendorRecognitionService`, `VendorProposalService`.
- `vendor/` — danh sách vendor, hồ sơ thuế và ước tính thuế (US-12-09, dữ liệu qua `FinanceApi`);
  `vendors.controller.ts`; `VendorQueryService`, `VendorTaxService`.
- `catalog-entry/` — ứng dụng (US-04-01), Business Owner (US-04-06), retire, phần mềm nội bộ;
  `applications.controller.ts`, `application-owners.controller.ts`; use case `retirement/` (controller, dto, policy,
  repo, service); `ApplicationService`, `ApplicationRetirementService`.
- `functional-group/` — nhóm chức năng (BR-06.9); `functional-groups.controller.ts`; `FunctionalGroupService`.
- `plan/` — plan của ứng dụng, workspace profile K2 (US-04-02); `plans.controller.ts`; `PlanService`,
  `PlanWorkspaceService`.
- `plan-terms/` — điều khoản, ý kiến Business Owner, cảnh báo review (US-04-11); `plan-terms.controller.ts`;
  `PlanTermsService`.
- `subscription/` — subscription và mua đứt (US-04-03, US-04-05), đích ghế, giá; `subscriptions.controller.ts`;
  `SubscriptionService`, `SeatTargetService`, `seat-guard.policy.ts`.
- `contract/` — hợp đồng và file riêng tư trong object storage (US-04-04); `contracts.controller.ts`,
  `documents.controller.ts`; `ContractService`, `DocumentService`; `document-expiry.job.ts` chạy mỗi giờ (DB-13).
- `subscription-owner-assignment/` — repo và Nest module riêng của lệnh CLI; service nằm ở `public/`.
- `mappers/` — `catalog-audit-event.mapper.ts` (sự kiện Audit Trail của module).

## Bất biến quan trọng

- Không route nào xóa vendor, nhóm chức năng, plan, subscription hay hợp đồng (JSDoc các controller).
- Số lượng subscription không thấp hơn số ghế đang chiếm (`assertQuantityNotBelowOccupied`, `seat-guard.policy.ts`);
  retire ứng dụng chỉ khi Business Owner đã xác nhận và không còn assignment/subscription chặn
  (`catalog-entry/retirement/application-retirement.service.ts`). Cả hai đọc ghế qua `SeatOccupancyHook`.
- `lockSeatTarget`: subscription `FOR UPDATE`, plan nội bộ `FOR SHARE` tới hết transaction (`seat-target.service.ts`).
- Thay đổi tạo/tăng/kéo dài khoản phải trả cần phòng ban sở hữu có Cost Center đang dùng (F26,
  `FINANCE.SETUP_INCOMPLETE`, `subscription.service.ts`).
- Gán phòng ban sở hữu: một transaction, khóa subscription, audit actor `OPERATOR`; chạy lại cùng lệnh trả
  `ALREADY_ASSIGNED` (`subscription-owner-assignment.api.ts`).

## Test

- Unit: `src/modules/catalog/**/*.spec.ts`; HTTP: `test/http/catalog/`; integration: `test/integration/catalog/`.

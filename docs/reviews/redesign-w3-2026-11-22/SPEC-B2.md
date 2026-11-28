# SPEC-B2 — Workspace thuộc nhà cung cấp (bản 2, 24/11/2026)

Phần của [SPEC.md](SPEC.md). **Phụ thuộc:** B1 đã ở nhánh gộp (W3-02 cho giá). **Tự đứng được:** mỗi kỳ thuê bao vẫn một gói; B2
thêm thực thể Workspace, gắn thuê bao vào workspace, dời cổng ≥ 2 admin, chặn trùng (workspace, gói). Migration: M4. `file:line` tính từ
`src/modules/`, đọc trên `int/redesign-w2` `8a4c8b70`, đối chiếu lại `origin/dev` `70543271` ở [DELTA-W2-FINAL.md](DELTA-W2-FINAL.md).

**Quyền (QĐ-118d/f/l, áp cho mọi route B2):** người tạo workspace là **người phụ trách ban đầu**; **chỉ Super Admin** đổi người phụ trách
(route riêng, mẫu `subscriptionResponsibleItAdminChange` của đợt 2 —
`catalog/subscription/responsible/subscription-responsible.controller.ts:29-60`, thân `{ employeeId, reason }`); sửa hồ sơ/admin của
workspace **chỉ IT phụ trách workspace** (không làm thay). Đọc: mọi `IT_ADMIN`, `FINANCE`, `SUPER_ADMIN` (danh mục cấp tổ chức, không
theo phòng).

---

## W3-10

**Thực thể Workspace: admin, IT phụ trách, route, chuyển dữ liệu, mọi nơi đọc hồ sơ cũ.**

- **Nguồn:** `QĐ-115c` (workspace thuộc **nhà cung cấp**; hồ sơ — email tài khoản công ty sở hữu, danh sách admin ≥ 2 IT Admin, ghi chú —
  chuyển từ gói sang workspace), `QĐ-116o` (một IT phụ trách mỗi workspace, chuyển cùng `SBF-16`), `QĐ-118f`, `QĐ-118l`, C-7, W1c §1.2.
- **Hiện trạng:** hồ sơ gắn **gói**: `plan_workspace_profiles` PK `plan_id` (cột: `primary_owner_employee_id` NOT NULL, `owner_limit`,
  `admin_limit`, `owner_transfer_procedure`, `emergency_*`, `owner_account_email`, `admin_note`), `plan_workspace_admins` PK (`plan_id`,
  `employee_id`) (`prisma/models/catalog.prisma:294-331`); route `PUT /plans/{id}/workspace-profile` (`catalog/plan/plans.controller.ts:194-196`,
  `catalog/plan/plan-workspace.service.ts`); lưu bắt ≥ 2 người khác nhau (`catalog/plan/plan-vendor-admins.policy.ts:26-30`
  `assertVendorAdminsEnough` ⟹ 422 `PLAN.VENDOR_ADMINS_INVALID`); trigger chỉ `K2`/`K3`/`K4`
  (`prisma/migrations/20261113002500_catalog_plan_workspace_vendor_admins/migration.sql`). **Nơi đọc hồ sơ theo gói (B2-R5):**
  `PlanRepo.findProfile` (`catalog/plan/plan.repo.ts:429`), `findIdsNeedingVendorAdminsInUse` (`:442`), `findProfilesOf` (`:456`),
  `findWorkspaceDuties` (`:467`); `PlanFactsService.vendorAdminsOf` (`catalog/plan/plan-facts.service.ts:102`), `workspaceDutiesOf` (`:167`);
  `VendorAdminMinimumService.countPlansBelowMinimum` (`catalog/plan/vendor-admin-minimum.service.ts:20-33`); `VendorAdminRolesService`
  (`catalog/plan/vendor-admin-roles.service.ts:29`); `CatalogApi.workspaceDutiesOf` (`catalog/public/catalog.api.ts:94`);
  `CatalogResponsibilityApi.vendorAdminRolesOf` (`catalog/public/catalog-responsibility.api.ts:40`) với kiểu `VendorAdminRole { planId, … }`
  (`catalog/public/catalog-responsibility.types.ts:11-18`), dùng ở `personnel/departure-deadline/departure-impact.service.ts:52`,
  `personnel/transfer-grace/transfer-impact.service.ts:65`, `personnel/it-handover/it-handover-milestone.service.ts:42-44`. Chuyển phụ trách:
  `catalog/application-responsibility/responsibility-handover.service.ts:66-67` (ứng dụng + thuê bao).
- **Mô hình (M4):**

  | Bảng `workspaces`                                                                                                                                                                     | Kiểu                          | Ràng buộc                                                  | Ai nhập / đổi gì                                                   |
  | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
  | `id`, `organization_id`                                                                                                                                                               | uuid                          | PK; FK                                                     | —                                                                  |
  | `vendor_id`                                                                                                                                                                           | uuid **NOT NULL**             | FK `vendors`                                               | IT Admin lúc tạo; không đổi                                        |
  | `name`, `normalized_name`                                                                                                                                                             | text                          | unique (`organization_id`, `vendor_id`, `normalized_name`) | IT phụ trách                                                       |
  | `owner_account_email`                                                                                                                                                                 | text NULL                     | dạng email                                                 | IT phụ trách; thiếu ⟹ cờ (`QĐ-110u`)                               |
  | `primary_owner_employee_id`                                                                                                                                                           | uuid NULL                     | FK `employees`; phải nằm trong `workspace_admins`          | IT phụ trách                                                       |
  | `responsible_it_admin_employee_id`                                                                                                                                                    | uuid NULL                     | FK `employees`                                             | = người tạo; **chỉ Super Admin** đổi; `NULL` ⟹ cờ `NO_RESPONSIBLE` |
  | `owner_limit`, `admin_limit`, `owner_transfer_procedure`, `emergency_identity`, `emergency_occupies_seat`, `emergency_holder_employee_id`, `emergency_last_reviewed_on`, `admin_note` | như `plan_workspace_profiles` | như cũ (`QĐ-77d`)                                          | IT phụ trách                                                       |
  | `created_at`, `updated_at`                                                                                                                                                            | timestamptz                   | —                                                          | `updated_at` = phiên bản (`expectedUpdatedAt`)                     |

  `workspace_admins` (`workspace_id`, `employee_id`, `role` `WorkspaceRole` OWNER \| ADMIN), PK (`workspace_id`, `employee_id`),
  `ON DELETE CASCADE` theo workspace.

- **Chuyển dữ liệu (M4, backfill):**
  1. **Khối kiểm trước** (dừng `RAISE`, B2-R16 mở rộng):
     - ứng dụng có gói `K2` (có hay không có hồ sơ) hoặc `K4` có trang quản trị mà `applications.vendor_id IS NULL`;
     - **mọi** hồ sơ `plan_workspace_profiles` (gói `K2`, `K3`, `K4`) mà ứng dụng của gói không có nhà cung cấp.

     Câu cho Owner chạy trên DB demo:
     `SELECT a.id, a.name, p.id AS plan_id, p.provisioning_type FROM applications a JOIN plans p ON p.application_id = a.id WHERE a.vendor_id IS NULL AND (p.provisioning_type = 'K2' OR (p.provisioning_type = 'K4' AND p.has_admin_console) OR EXISTS (SELECT 1 FROM plan_workspace_profiles w WHERE w.plan_id = p.id));`

  2. **Một workspace mỗi nhà cung cấp** có ít nhất một hồ sơ gói hoặc một thuê bao `K2`: tên `"<tên nhà cung cấp>"`; `admins` = hợp các
     `plan_workspace_admins` của mọi gói của hãng (vai `OWNER` nếu là OWNER ở bất kỳ gói nào); `primary_owner` = của hồ sơ tạo sớm nhất;
     `owner_account_email`, trường khẩn cấp, `admin_note` = của hồ sơ tạo sớm nhất có giá trị (nhiều `admin_note` khác nhau ⟹ nối bằng
     xuống dòng theo thứ tự tạo); `responsible_it_admin` = IT phụ trách của thuê bao `K2` sống tạo sớm nhất của hãng (không có ⟹ `NULL`, cờ).
     **Tự chốt** — demo chưa có hãng nào hai workspace; IT tách sau (W3-11 đổi `workspaceId`).
  3. `plan_workspace_profiles`, `plan_workspace_admins` **giữ nguyên** (dữ liệu cũ, thôi là nguồn).
- **Hành vi đúng — route:**

  | Method | Path                                    | `operationId`                       | Vai · phạm vi                               | Body                                                                                                       | 200/201                     | Lỗi                                                                                                                                                              |
  | ------ | --------------------------------------- | ----------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | GET    | `/workspaces`                           | `workspaceList`                     | IT_ADMIN, FINANCE, SUPER_ADMIN · cả tổ chức | query `vendorId?`, `flag?`, `page`, `pageSize` ≤ 100                                                       | trang `WorkspaceSummaryDto` | 422 `VALIDATION_ERROR`                                                                                                                                           |
  | GET    | `/workspaces/{id}`                      | `workspaceGet`                      | IT_ADMIN, FINANCE, SUPER_ADMIN · cả tổ chức | —                                                                                                          | `WorkspaceDetailDto`        | 404 `WORKSPACE.NOT_FOUND`                                                                                                                                        |
  | POST   | `/workspaces`                           | `workspaceCreate`                   | IT_ADMIN · mọi IT; người tạo = phụ trách    | `vendorId`, `name`, `ownerAccountEmail?`, `adminNote?` (**không** nhận người phụ trách — B2-R3)            | 201 detail                  | 404 `VENDOR.NOT_FOUND`; 409 `WORKSPACE.NAME_TAKEN`                                                                                                               |
  | PATCH  | `/workspaces/{id}`                      | `workspaceUpdate`                   | IT_ADMIN · chỉ IT phụ trách workspace       | `name?`, `ownerAccountEmail?`, `adminNote?`, trường khẩn cấp, `expectedUpdatedAt` (**bắt buộc**)           | detail                      | 403 `WORKSPACE.NOT_RESPONSIBLE`; 404; 409 `WORKSPACE.STALE`, `WORKSPACE.NAME_TAKEN`; 422 `VALIDATION_ERROR`                                                      |
  | PUT    | `/workspaces/{id}/admins`               | `workspaceAdminsSet`                | IT_ADMIN · chỉ IT phụ trách workspace       | `admins[{ employeeId, role }]` (`maxItems` 20, không trùng), `primaryOwnerEmployeeId`, `expectedUpdatedAt` | detail                      | 403 `WORKSPACE.NOT_RESPONSIBLE`; 404; 409 `WORKSPACE.STALE`; 422 `WORKSPACE.ADMIN_NOT_IT_ADMIN`, `WORKSPACE.PRIMARY_OWNER_NOT_ADMIN`, `WORKSPACE.ADMINS_TOO_FEW` |
  | POST   | `/workspaces/{id}/responsible-it-admin` | `workspaceResponsibleItAdminChange` | SUPER_ADMIN                                 | `employeeId`, `reason` (1–500)                                                                             | 200 detail + `changed`      | 403 (không phải Super Admin); 404; 422 `WORKSPACE.RESPONSIBLE_NOT_IT_ADMIN` (không phải IT Admin đang làm việc), `VALIDATION_ERROR`                              |
  - `WorkspaceSummaryDto`: `id`, `vendor { id, name }`, `name`, `adminCount`, `workingAdminCount`, `flags[]` (`ADMINS_BELOW_MINIMUM`,
    `NO_OWNER_EMAIL`, `NO_RESPONSIBLE`), `responsibleItAdmin { employeeId, name }?`, `subscriptionCount`. Detail = summary + `admins[]`
    (`maxItems` 20, mục `NESTED_ARRAYS` nguồn `maxItems` của schema), mỗi admin `{ employeeId, name, role, flags[] }` (`ADMIN_NOT_WORKING`),
    `primaryOwner`, `ownerAccountEmail`, trường khẩn cấp, `adminNote`, `updatedAt`. Thứ tự danh sách: `vendor.normalized_name, normalized_name,
id`; đếm + trang cùng snapshot (`API-LIST-DETAIL.1`).
  - Admin phải là tài khoản vai `IT_ADMIN`; lưu bắt **≥ 2 người khác nhau** (giữ luật lưu hiện có của hồ sơ gói — B2-R16; ít hơn ⟹ 422
    `WORKSPACE.ADMINS_TOO_FEW`, `details { given, minimum: 2 }`); "đang làm việc" không bắt lúc ghi — cờ tính khi đọc (`QĐ-117e`).
  - Đổi người phụ trách: route Super Admin (một khóa: workspace FU, tầng 5b) **hoặc** `SBF-16` (`transferResponsibilities` chuyển **cả**
    workspace của người đi cùng tx, cùng audit — `QĐ-116o`). `changed = false` khi người được chỉ định đã là người phụ trách (không ghi).
  - Audit: `WORKSPACE.CREATED`, `WORKSPACE.UPDATED`, `WORKSPACE.ADMINS_SET`, `WORKSPACE.RESPONSIBLE_CHANGED` (actor, from, to, reason),
    `WORKSPACE.RESPONSIBLE_TRANSFERRED` (SBF-16).

- **Nơi đọc hồ sơ cũ chuyển sang workspace (B2-R5)** — cùng gói P9a, giữ chữ ký facade:
  - `PlanRepo.findProfile`/`findProfilesOf` ⟹ đọc workspace của **hãng của gói** (một workspace ⟹ nó; nhiều ⟹ workspace có thuê bao sống
    của gói, không có ⟹ workspace tạo sớm nhất); `findIdsNeedingVendorAdminsInUse` giữ nghĩa (gói cần admin có thuê bao đang dùng);
    `findWorkspaceDuties` ⟹ `workspace_admins`.
  - `PlanFactsService.vendorAdminsOf`, `workspaceDutiesOf`; `VendorAdminMinimumService` đếm **workspace** dưới mức (tên hàm giữ, nghĩa đổi
    trong comment); `VendorAdminRolesService`.
  - `VendorAdminRole` (kiểu nội bộ, không ra wire): **thêm** `workspaceId`, `workspaceName`, `vendorId`, `responsibleItAdminEmployeeId`;
    một mục **mỗi workspace**; `planId`/`planName`/`applicationId`/`applicationName` giữ = gói đầu tiên (theo tên, `id`) có thuê bao sống
    trong workspace (tương thích người gọi của personnel tới P10). Wire `impactPreview.vendorAdminRoles: string[]`
    (`personnel/impact-preview/impact-preview.dto.ts:59`) nay là **tên workspace** — không đổi schema.
  - `CatalogApi.workspaceDutiesOf` giữ chữ ký.
- **Nơi ghi:** capability mới `catalog/workspace/` (`workspaces.controller.ts`, `workspace.dto.ts`, `workspace.service.ts`,
  `workspace-admins.service.ts`, `workspace-responsible.service.ts`, `workspace.policy.ts`, `workspace.repo.ts`, `workspace.mapper.ts`,
  `workspace.errors.ts`, `workspace.http-errors.ts` + spec); facade `catalog/public/workspace.api.ts` (`WorkspaceApi`: `workspaceOfSubscription`,
  `adminsOf`, `workingAdminCount`, `responsibleOf`, `defaultWorkspaceOfVendor`). Khóa: workspace FU (tầng 5b).
- **Tiêu chí chấp nhận:**
  1. DB demo có hồ sơ _Claude Team — Standard_ (Khoa OWNER, Nam ADMIN) và _— Premium_ (Khoa OWNER, Nam OWNER) cùng hãng Anthropic ⟹ sau
     M4: **một** workspace "Anthropic", admin {Khoa OWNER, Nam OWNER} (OWNER ở bất kỳ gói nào ⟹ OWNER; admin chỉ là IT Admin); `admin_note` của hồ sơ Standard.
  2. Hồ sơ của gói `K3` mà ứng dụng không có nhà cung cấp ⟹ M4 dừng, thông điệp nêu `plan_id`.
  3. `POST /workspaces` hai lần cùng (hãng, tên khác hoa/thường) ⟹ lần hai 409 `WORKSPACE.NAME_TAKEN`; body có `responsibleItAdminEmployeeId`
     ⟹ 422 `VALIDATION_ERROR` (Zod strict); người tạo là `responsibleItAdmin`.
  4. `PATCH` thiếu `expectedUpdatedAt` ⟹ 422; sai ⟹ 409 `WORKSPACE.STALE`; Nam (không phụ trách) `PATCH` ⟹ 403 `WORKSPACE.NOT_RESPONSIBLE`.
  5. `PUT …/admins` với một người vai `FINANCE` ⟹ 422 `WORKSPACE.ADMIN_NOT_IT_ADMIN`; một người ⟹ 422 `WORKSPACE.ADMINS_TOO_FEW`.
  6. Super Admin đổi phụ trách Khoa → Nam kèm lý do ⟹ 200, `changed: true`, audit `WORKSPACE.RESPONSIBLE_CHANGED`; gọi lại ⟹ `changed: false`;
     Khoa gọi route ⟹ 403; chỉ định người vai `FINANCE` ⟹ 422 `WORKSPACE.RESPONSIBLE_NOT_IT_ADMIN`.
  7. Khoa nghỉ việc, Super Admin chuyển phụ trách sang Nam (`SBF-16`) ⟹ thuê bao **và** workspace Khoa phụ trách đổi sang Nam trong một tx.
  8. `vendorAdminRolesOf(Nam)` ⟹ một mục workspace "Anthropic" (không phải hai mục theo gói).
- **Test:** unit `workspace.policy.spec.ts`, `workspace.service.spec.ts`, `workspace-admins.service.spec.ts`,
  `workspace-responsible.service.spec.ts` (lỗi khẳng định mã); http `test/http/catalog/workspaces.http-spec.ts` (sáu route, 403/409/422);
  integration `test/integration/catalog/workspace-migration.integration-spec.ts` (ca 1, 2).

---

## W3-11

**Thuê bao thuộc workspace; cách tính seat, mức tối thiểu tổng, cờ _Hãng xuất hóa đơn sau_.**

- **Nguồn:** `QĐ-115c` (thuê bao thuộc workspace; gói phải cùng hãng với workspace — C2), `QĐ-115g` (_Mua cố định_ / _Theo thành viên
  đang có_; theo thành viên chỉ cam kết 1 tháng — C4; không điểm điều chỉnh, không `KPI-4`), `KHO-04`, `KHO-11`/`QĐ-117m`, `KHO-14`, C5.
- **Hiện trạng:** thuê bao không có workspace, cách tính seat, tối thiểu tổng, cờ xuất hóa đơn sau; có `vendorMinimumSeats`
  (`prisma/models/catalog.prisma:376`); luật kỳ `assertPoolTerms` (`catalog/subscription/pool/subscription-pool.policy.ts:71`).
- **Mô hình (M4):** `subscriptions.workspace_id UUID NULL` FK `workspaces`; `seat_counting TEXT NOT NULL DEFAULT 'FIXED'` CHECK
  `IN ('FIXED','MEMBERS')`; `minimum_seats_total INT NULL` CHECK `> 0`; `invoiced_later BOOLEAN NOT NULL DEFAULT false`. CHECK
  `subscriptions_members_monthly`: `seat_counting <> 'MEMBERS' OR commitment_term_months = 1`. CHECK `subscriptions_members_payment_day`:
  `seat_counting <> 'MEMBERS' OR status <> 'ACTIVE' OR renewal_date IS NOT NULL` (ngày thanh toán của thuê bao theo thành viên đọc từ lưới
  tháng của `renewal_date` — B2-R14; không thêm cột). Trigger `subscriptions_workspace_vendor`: `workspace_id` không `NULL` ⟹ vendor của
  workspace = vendor của ứng dụng của gói (C2). Không đặt CHECK bắt `workspace_id` ở DB (dữ liệu cũ) — kiểm ở ứng dụng cho ghi mới.
  Backfill: thuê bao `K2` (và `K4` có trang quản trị) ⟹ workspace của hãng (W3-10). `vendor_minimum_seats` giữ ở B2 (B3 chuyển xuống dòng).
- **Hành vi đúng:**
  - `subscriptionCreate` (thêm trường): `workspaceId?`, `seatCounting?` (mặc định `FIXED`), `minimumSeatsTotal?`, `invoicedLater?`.
    **Không gửi `workspaceId` cho `K2` (B2-R10):** hãng có **đúng một** workspace ⟹ dùng nó; **không có** ⟹ tạo workspace tên = tên hãng
    (người tạo = phụ trách, cùng hàm của W3-13); **≥ 2** ⟹ 422 `SUBSCRIPTION.WORKSPACE_REQUIRED` (`details.workspaceIds`). Gói khác hãng ⟹
    422 `SUBSCRIPTION.WORKSPACE_VENDOR_MISMATCH`. `MEMBERS` + cam kết 12 ⟹ 422 `SUBSCRIPTION.MEMBERS_MONTHLY_ONLY`; `MEMBERS` `ACTIVE` không
    `renewalDate` ⟹ 422 `SUBSCRIPTION.MEMBERS_PAYMENT_DAY_REQUIRED`.
  - `subscriptionUpdate`: thêm `workspaceId?` (workspace khác **cùng hãng**, không vi phạm trùng — W3-14), `minimumSeatsTotal?`,
    `invoicedLater?`; `seatCounting` **không** đổi sau `ACTIVE` (422 `SUBSCRIPTION.SEAT_COUNTING_FIXED`) — **Tự chốt**.
  - `subscriptionGet`/`List`: thêm `workspace { id, name }`, `seatCounting`, `minimumSeatsTotal`, `invoicedLater`; lọc `workspaceId?`.
  - **Theo thành viên:** `hasAdjustmentPoint` = `K2` **và** không nội bộ **và** `FIXED`
    (`catalog/subscription/obligation/subscription-obligation.policy.ts:123-126`) ⟹ sweeper gia hạn không tạo điểm điều chỉnh, `KPI-4` không
    đếm. Sổ tự `±1` ở B3 (W3-19).
- **Tiêu chí chấp nhận:**
  1. Khai Claude Team Standard vào workspace "Anthropic" ⟹ 201; khai Jira (Atlassian) vào "Anthropic" ⟹ 422 `SUBSCRIPTION.WORKSPACE_VENDOR_MISMATCH`.
  2. FE cũ khai Claude Premium **không** `workspaceId`, Anthropic có một workspace ⟹ 201 vào "Anthropic"; thêm workspace "Anthropic EU" rồi
     khai lại không `workspaceId` ⟹ 422 `SUBSCRIPTION.WORKSPACE_REQUIRED` (`workspaceIds` 2 mục); hãng mới chưa workspace ⟹ 201, workspace mới
     tên hãng, phụ trách = người khai.
  3. Slack Pro `MEMBERS` cam kết 1, `renewalDate` ngày 05 ⟹ 409 `SUBSCRIPTION_RENEWAL.NOT_RENEWABLE` kèm `details.reason = 'MEMBER_COUNTED'` (theo chốt Owner 26/11 D-14, đổi từ 201 `adjustment: null`);
     `MEMBERS` cam kết 12 ⟹ 422; `MEMBERS` không `renewalDate` ⟹ 422 `SUBSCRIPTION.MEMBERS_PAYMENT_DAY_REQUIRED`.
  4. Thuê bao cũ sau M4 có `workspace` của hãng; `seatCounting = FIXED`; `invoicedLater = false`.
- **Test:** unit `subscription-pool.policy.spec.ts` (C4, payment day), `subscription-obligation.policy.spec.ts` (`hasAdjustmentPoint`);
  http `test/http/catalog/subscriptions.http-spec.ts` (trường, mặc định workspace — P9b) và `test/http/catalog/subscription-workspace.http-spec.ts`
  (luật C4, payment day — P10).

---

## W3-12

**Cổng ≥ 2 admin trên workspace; một thông báo khi admin thôi làm việc.**

- **Nguồn:** `QĐ-114ae`, `QĐ-110k`, `QĐ-110u` (khai mới chặn; kỳ gia hạn và thuê bao có từ trước chỉ cờ; `SBF-16` không chặn), `QĐ-117e`
  (khởi tạo: cho nhập, bật cờ; khai thuê bao **thứ hai** trong workspace đang có < 2 IT Admin đang làm việc ⟹ chặn; nhập lô `K4` của gói có
  trang quản trị coi như khai; admin đổi vai/bị khóa ⟹ **cảnh báo** IT phụ trách workspace), Owner Q-D (một thông báo; IT phụ trách không
  dùng được ⟹ Super Admin).
- **Hiện trạng:** cổng trên gói, đếm IT Admin còn làm việc (`catalog/subscription/pool/subscription-pool.service.ts:135-160`
  `assertVendorAdmins` → `PlanFactsService.workingAdminsAmong`, `catalog/plan/plan-facts.service.ts:87`); nghỉ việc báo
  `VENDOR_ADMINS_BELOW_MINIMUM` theo gói cho IT phụ trách thuê bao (`personnel/event-notice/personnel-notifier.service.ts:387-414`
  `vendorAdminsGone`, gọi từ `personnel/it-handover/it-handover-milestone.service.ts:42-44`); đổi vai/khóa không báo.
- **Hành vi đúng:**

  ```text
  workingAdmins(W) = số admin của W đang là IT_ADMIN, tài khoản dùng được, nhân sự chưa nghỉ   (workingAdminsAmong, giữ)
  khai mới / hoàn tất bản nháp thuê bao K2 (và lô K4 của gói có trang quản trị — W3-24) vào W:
      pha khởi tạo đang mở (SeatBaselinePhaseHook)          ⟹ cho, cờ vendorAdminsBelowMinimum
      workingAdmins(W) < 2                                  ⟹ 422 SUBSCRIPTION.VENDOR_ADMINS_REQUIRED (lô: LICENSE_LOT.VENDOR_ADMINS_REQUIRED)
  ghi kết quả gia hạn (kỳ mới), sửa điều khoản, thuê bao cũ  ⟹ không chặn, cờ khi < 2
  đọc workspace/thuê bao: flags ADMINS_BELOW_MINIMUM nếu workingAdmins < 2; ADMIN_NOT_WORKING cho từng admin đổi vai/khóa/nghỉ
  thông báo (Q-D, B2-R8): mỗi (workspace W, admin E) mà E thôi làm việc (nghỉ việc tới mốc, đổi vai khỏi IT_ADMIN, tài khoản bị khóa)
      ⟹ ĐÚNG MỘT thông báo WORKSPACE_ADMIN_NOT_WORKING, event key WORKSPACE_ADMIN_NOT_WORKING:<W>:<E>
      người nhận: IT phụ trách W nếu dùng được và khác E; không ⟹ Super Admin dùng được (luật R1, SPEC §8.1)
      nguồn: (a) đường nghỉ việc hiện có (it-handover-milestone → personnel-notifier, đổi sang workspace và mã mới);
             (b) lượt giờ của SubscriptionRenewalSweeper quét workspace có admin ADMIN_NOT_WORKING (bắt đổi vai/khóa; key chống lặp)
  ```

  - Gói cần admin: `needsVendorAdmins` (`catalog/plan/plan-vendor-admins.policy.ts:17-19`, giữ). Mã cũ `VENDOR_ADMINS_BELOW_MINIMUM` thôi
    ghi mới (giữ trong bảng mã cho dòng cũ).
  - `itAdminDashboardGet` thêm `workspacesBelowVendorAdminMinimum` (đếm qua `CatalogResponsibilityApi.countWorkspacesBelowMinimum` — P9);
    `plansBelowVendorAdminMinimum` giữ (`dashboards/progress/dashboard-progress.policy.ts:38-71`).

- **Tiêu chí chấp nhận:**

  | Ca                                                             | Kết quả                                                          |
  | -------------------------------------------------------------- | ---------------------------------------------------------------- |
  | Workspace có Khoa, Nam (đang làm việc); khai thuê bao mới      | 201                                                              |
  | Nam bị khóa tài khoản; khai thuê bao **thứ hai** vào workspace | 422 `SUBSCRIPTION.VENDOR_ADMINS_REQUIRED`                        |
  | như trên, pha khởi tạo đang mở                                 | 201, cờ `vendorAdminsBelowMinimum`                               |
  | như trên, ghi kết quả gia hạn của thuê bao đang chạy           | ghi được, cờ trên kỳ mới                                         |
  | `workspaceGet` khi Nam bị khóa                                 | `flags` gồm `ADMINS_BELOW_MINIMUM`; Nam mang `ADMIN_NOT_WORKING` |
  | Nam bị khóa, Khoa phụ trách; lượt giờ chạy 3 lần               | **một** `WORKSPACE_ADMIN_NOT_WORKING` cho Khoa                   |
  | Khoa (phụ trách) đổi vai sang FINANCE                          | một thông báo cho **Super Admin** (Khoa không còn dùng được)     |
  | Nam nghỉ việc tới mốc (đường nghỉ việc) rồi lượt giờ chạy      | một thông báo (cùng key), không hai                              |

- **Test:** unit `subscription-pool.policy.spec.ts`/`subscription-pool.service.spec.ts` (cổng), `personnel-notifier.service.spec.ts`
  (người nhận), `subscription-renewal-sweep.service.spec.ts` (một lần); integration
  `test/integration/catalog/workspace-admin-gate.integration-spec.ts`.

---

## W3-13

**Route cũ `planWorkspaceProfileSet` vẫn chạy, ghi vào workspace.**

- **Nguồn:** CUT-6 (route cũ giữ, không `deprecated`), `QĐ-115c`.
- **Hiện trạng:** `PUT /plans/{id}/workspace-profile` ghi `plan_workspace_profiles` (`catalog/plan/plan-workspace.service.ts:113`).
- **Hành vi đúng:** route giữ đường dẫn, thân, response. Service: tìm workspace của hãng của gói (một ⟹ dùng; không có ⟹ tạo tên = tên hãng,
  người gọi = phụ trách; **nhiều** ⟹ 409 `PLAN.WORKSPACE_AMBIGUOUS` kèm `details.workspaceIds`); ứng dụng của gói không có nhà cung cấp ⟹
  422 `PLAN.WORKSPACE_VENDOR_REQUIRED` (B2-R16); rồi ghi admin/hồ sơ vào workspace qua **cùng** service của W3-10 (không chép logic). Quyền:
  workspace đã có người phụ trách khác người gọi ⟹ 403 `WORKSPACE.NOT_RESPONSIBLE` (cùng luật `workspaceAdminsSet`). `planGet` trả
  `workspaceProfile` đọc từ workspace đó. Không ghi `plan_workspace_profiles` nữa.
- **Tiêu chí chấp nhận:** Khoa (phụ trách) gọi route cũ cho gói Standard ⟹ `workspaceGet` "Anthropic" thấy admin mới; gói Premium cùng hãng
  thấy cùng hồ sơ; hãng có hai workspace ⟹ 409 `PLAN.WORKSPACE_AMBIGUOUS`; Nam gọi ⟹ 403; gói `K3` ứng dụng nội bộ không hãng ⟹ 422
  `PLAN.WORKSPACE_VENDOR_REQUIRED`.
- **Test:** unit `plan-workspace.service.spec.ts`; http `test/http/catalog/plans.http-spec.ts`.

---

## W3-14

**Trùng (workspace, gói) bị chặn mọi lúc, kể cả bước khởi tạo.**

- **Nguồn:** `QĐ-116ag`, `QĐ-104k`(3), A-Q5.
- **Hiện trạng:** `assertNoLiveDuplicate` chỉ ở ứng dụng, theo **gói**; pha khởi tạo cho ghi kèm `SHOULD_MERGE`
  (`catalog/subscription/pool/subscription-pool.service.ts:178-200`, gọi ở `catalog/subscription/subscription.service.ts:195, :262`); không
  ràng buộc DB.
- **Hành vi đúng (B2, trước khi có dòng):** "sống" giữ `isLiveSubscription` (`subscription-pool.policy.ts:233`); trùng = một thuê bao sống
  khác **cùng workspace, cùng gói** (kỳ gia hạn của chính nó không tính). Khai/hoàn tất/đổi `workspaceId` gặp trùng ⟹ 409
  `SUBSCRIPTION.DUPLICATE_PLAN` (**nghĩa đổi**: theo workspace) **cả khi pha khởi tạo đang mở** (bỏ `SHOULD_MERGE`). Hai workspace khác nhau
  cùng gói ⟹ được. Ràng buộc DB ở B3 (unique dòng — W3-15). **Khóa (B2-R6):** khai/hoàn tất/đổi `workspaceId` khóa workspace **FU** (tầng
  5b; đổi `workspaceId` khóa cả hai workspace trong một câu `ORDER BY id`) **trước** gói FU/FS (7) — hai lần khai cùng workspace xếp hàng.
  Phần khóa do làn `tech` thêm ở P9b (`subscription.service.ts`, `subscription-change.service.ts`), luật trùng ở P10.
  **Quy trình khi luồng đã biết kỳ (N5)** — `subscriptionUpdate` (`changeIn` hôm nay khóa kỳ trước), hoàn tất bản nháp, `subscriptionLineAdd`:
  (1) đọc `workspace_id` của kỳ **không khóa**; (2) khóa workspace (cùng workspace mới nếu đổi) FU trong một câu `ORDER BY id`; (3) khóa kỳ FU (6);
  (4) đọc lại `workspace_id` dưới khóa — khác bước 1 ⟹ rollback và thử lại (tối đa 3 lần, rồi 409 `SUBSCRIPTION.STALE`). Không luồng nào khóa
  workspace **sau** kỳ. Integration: `subscriptionUpdate` đổi `workspaceId` ‖ khai thuê bao vào workspace đích, barrier, lặp 20, không `40P01`.
- **Tiêu chí chấp nhận:** "Anthropic" đã có Standard sống ⟹ khai Standard thứ hai (kể cả lúc khởi tạo) ⟹ 409; khai Standard vào "Anthropic EU"
  ⟹ 201; hai request khai đồng thời cùng workspace (integration, barrier, lặp 20) ⟹ một 201, một 409, không `40P01`.
- **Test:** unit `subscription-pool.service.spec.ts`; integration `test/integration/catalog/subscription-duplicate-workspace.integration-spec.ts`.

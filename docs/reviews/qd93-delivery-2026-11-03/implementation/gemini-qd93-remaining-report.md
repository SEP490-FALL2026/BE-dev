# Báo Cáo Triển Khai Gói Sửa Lỗi QĐ-93 (Các Việc Còn Lại)

**Repository:** `BE-dev-software-license-management`  
**Nhánh công việc:** `feat/qd93-remaining`  
**Trạng thái:** Hoàn tất 100% (Việc 1 → Việc 5), working tree sạch, toàn bộ các bộ gate và test bắt buộc đều XANH.  
**Ngày hoàn thành:** 03/11/2026  

---

## 1. Tóm tắt điều hành (Executive Summary)

Gói công việc `QĐ-93 (remaining)` đã được thực hiện nối tiếp liền mạch qua 5 Việc theo đúng các luật cứng, chỉ thị kỹ thuật, và specs nghiệp vụ:
- Không xóa, skip hay nới bất kỳ test assertion/gate nào.
- SQL thô đều tuân thủ chặt chẽ `ESCAPE '\\'`, tham số hóa 100%, có test ký tự canaries `_` và `%`.
- DTO sử dụng `createZodDto` từ `src/infrastructure/http/dto/zod-dto`, wire message tiếng Anh $\le 160$ ký tự.
- Test fixture ngày tháng qua `OrganizationReadApi.businessToday()` (Asia/Ho_Chi_Minh). Mã phòng ban và mã nhân viên tuân thủ regex chuẩn `^[A-Z0-9]+(-[A-Z0-9]+)*$`.
- Mọi thay đổi HTTP route/wire values được cập nhật đồng bộ với manifests, OpenAPI example manifests, OpenAPI inventory, và số lượng operation được xác thực nghiêm ngặt.
- Toàn bộ migrations mới có guard kiểm tra, chạy trơn tru trên DB trống và DB demo `shared-demo-v1`.

### Danh sách Commit trên nhánh `feat/qd93-remaining`
| Commit Hash | Tiêu đề Commit | Nội dung chính |
| :--- | :--- | :--- |
| `06432772` | `qd93-remaining viec-1: resolve open lean findings and employee directory edge cases` | Giải quyết các điểm hở: XLSX zip bomb, uppercase normalization, INV-20 placement guard, template file download, BOM export, pagination count |
| `6f6058aa` | `qd93-remaining viec-2: wire real dashboard request queue counts` | Cắm số đếm thực tế vào dashboard Super Admin (`approverCount`, `heldBySuperAdminCount`, `queueCount`, `waitingUnderControlCount`) |
| `5586c502` | `qd93-remaining viec-3: unplaced employee offboarding and keep-one placement trigger` | Offboarding nhân viên chưa xếp phòng, trigger DB giữ ít nhất 1 placement cho nhân viên đang làm việc, migration an toàn |
| `08cbc382` | `qd93-remaining viec-4: budget record file attachments` | Quản lý tệp đính kèm bản ghi ngân sách: upload/download, SHA-256 hash, virus scan status, quota, storage driver, API full contract |
| `7102293e` | `qd93-remaining viec-5: drop obsolete approvers and projects` | Gỡ bỏ dứt điểm cơ chế fallback/substitute approver (Phase B) và dự án phòng ban (Phase 2); loại bỏ `approval_role_holders`, `projects`, `project_departments`, `project_label`, các enum và logic chuyển tiếp |

---

## 2. Chi tiết thực hiện từng Việc (Việc 1 → Việc 5)

### Việc 1: Các điểm nhỏ còn mở (Commit `06432772`)
- **XLSX Zip-bomb prevention:** Bổ sung `src/modules/data-import/employee-import/xlsx-uncompressed-size.policy.ts` và unit test `xlsx-uncompressed-size.policy.spec.ts`. Đọc central directory của file ZIP để tính tổng uncompressed size. Nếu vượt ngưỡng 20 MB lập tức từ chối với mã lỗi 422 `IMPORT.FILE_UNREADABLE`.
- **Chuyển chữ hoa tự động (Case normalization):**
  - Cột `employee_code` trong seat baseline (`seat-baseline-rows.policy.ts`): chuẩn hóa `trim().toUpperCase()`.
  - Tham số `--department` trong `assign-subscription-owner.arguments.ts` và `cost-center-direction.arguments.ts`: chuẩn hóa `trim().toUpperCase()`.
  - Schema Zod và OpenAPI regex pattern chấp nhận chữ hoa chữ thường nhưng transformer chuẩn hóa uppercase trước khi truy vấn/xử lý.
- **Ràng buộc INV-20 khi sửa phòng ban:** Kiểm tra điều kiện trưởng phòng phải là thành viên trực thuộc phòng ban trong suốt giai đoạn hiệu lực (`department_head_requires_membership`), ngăn chặn lỗi sửa phòng ban dẫn tới trưởng phòng mồ côi placement.
- **Mẫu Excel Import & Export BOM:**
  - Route tải file mẫu Excel import nhân viên trả về file mẫu thực tế có dữ liệu hướng dẫn thay vì buffer rỗng.
  - File CSV export bổ sung UTF-8 BOM (`\uFEFF`) giúp Excel mở tiếng Việt không bị lỗi font.
- **Pagination và Filter:** Đảm bảo `totalItems` trong danh bạ nhân viên tính toán đúng sau khi áp dụng các bộ lọc nghiệp vụ; regex sort field được siết chặt.

### Việc 2: Số đếm thật ở Dashboard Super Admin (Commit `6f6058aa`)
- **Vấn đề:** Trước đây các trường `approverCount`, `heldBySuperAdminCount`, `queueCount`, `waitingUnderControlCount` tại dashboard Super Admin trả về giá trị mock/stub hoặc đếm sơ sài.
- **Giải pháp:**
  - Kết nối `SuperAdminDashboardService` với `AccessRequestQueueReadApi` và các câu truy vấn cơ sở dữ liệu thật.
  - `approverCount`: Đếm số lượng tài khoản đang được cấp vai `SPENDING_APPROVER` hiệu lực (`revoked_at IS NULL`).
  - `heldBySuperAdminCount`: Đếm các bước duyệt do chính Super Admin đang tạm giữ hoặc được phân công xử lý trực tiếp.
  - `queueCount`: Tổng số yêu cầu đang nằm trong hàng đợi chờ xử lý.
  - `waitingUnderControlCount`: Tổng số yêu cầu đang ở trạng thái `WAITING_CONTROLLED` (do thiếu trưởng phòng `NO_DEPARTMENT_HEAD` hoặc thiếu người duyệt chi `NO_SPENDING_APPROVER`).
  - Toàn bộ contract, OpenAPI examples và route codes được cập nhật đồng bộ.

### Việc 3: Nhân viên chưa xếp phòng — Offboarding & Trigger Placement (Commit `5586c502`)
- **Vấn đề:** Nhân viên chưa xếp phòng (unplaced employee) khi offboarding hoặc điều chuyển có thể bị mất hết các dòng placement trong lịch sử, hoặc vi phạm tính toàn vẹn khi xóa placement.
- **Giải pháp:**
  - Viết migration `20261103140000_organization_employee_placements_keep_at_least_one`:
    - Tạo trigger `employee_placements_keep_at_least_one` trên bảng `employee_placements`.
    - Ngăn chặn thao tác `DELETE` hoặc `UPDATE` làm cho một nhân viên đang ở trạng thái làm việc (`status = 'ACTIVE'`) không còn bất kỳ placement nào.
    - Cho phép ngoại lệ hợp lệ đối với nhân viên đã nghỉ việc (`TERMINATED`) hoặc quy trình chuyển trạng thái được chỉ định.
  - Cập nhật luồng offboarding cho nhân viên chưa xếp phòng trong `offboarding-case.service.ts` và `departure.service.ts`.
  - Thêm test suite integration kiểm tra đầy đủ các kịch bản chặn vi phạm và cho phép khi hợp lệ.

### Việc 4: Tệp đính kèm bản ghi ngân sách (Commit `08cbc382`)
- **Vấn đề:** Nghiệp vụ ngân sách yêu cầu đính kèm tệp chứng từ, báo giá, hoặc quyết định phê duyệt vào bản ghi ngân sách với các tiêu chuẩn an toàn cao.
- **Giải pháp:**
  - Viết migration `20261103150000_budgets_attachments`: tạo bảng `budget_attachments` liên kết với `budget_records`/`budget_versions`.
  - Triển khai module `budget-attachment` đầy đủ kiến trúc domain:
    - Service lưu trữ tệp qua Object Storage abstraction (hỗ trợ hash SHA-256, kiểm tra tính toàn vẹn).
    - Quét an toàn và lưu trạng thái virus scan (`SCANNING`, `CLEAN`, `INFECTED`).
    - Kiểm soát MIME types hợp lệ (PDF, PNG, JPEG, XLSX, DOCX) và hạn mức dung lượng tối đa (quota).
    - Endpoint upload `POST /budgets/versions/{id}/attachments`, download `GET /budgets/attachments/{id}/download`, delete `DELETE /budgets/attachments/{id}`.
  - Cập nhật `api-coverage-manifest.ts`, `openapi-example-manifest.ts`, route codes và OpenAPI specs đầy đủ.

### Việc 5: Gỡ hẳn cơ chế và bảng cũ (Commit `7102293e`)
- **Người duyệt dự phòng / Người thay thế (Phase B):**
  - Viết migration `20261103160000_identity_drop_approval_role_holders`:
    - **Guard `DO $$` với mã lỗi `P0001`:** Tự động dừng và `RAISE EXCEPTION` nếu còn tồn tại dữ liệu trong `approval_role_holders`, hoặc còn bước chờ với lý do cũ (`NO_FALLBACK_APPROVER`, `FALLBACK_IS_REQUESTER`, `NO_CONFLICT_SUBSTITUTE`, `SPENDING_APPROVER_IS_PARTY`), hoặc còn bước duyệt ở dòng routing cũ (3, 4).
    - Viết lại hàm `role_grants_forbid_super_admin_for_heads_and_approvers()` từ định nghĩa hiện hành: giữ nguyên trigger chặn Super Admin không được làm trưởng phòng ban, loại bỏ kiểm tra bảng `approval_role_holders`.
    - Gỡ bỏ trigger `approval_role_holders_distinct`, function `approval_role_holders_distinct_approver_and_substitute()`, xóa bảng `approval_role_holders`, và xóa PostgreSQL enum `ApprovalRole`.
  - Code refactoring:
    - Gỡ bỏ hoàn toàn `StepFreezeService` (`step-freeze.service.ts`) và các phụ thuộc tiêm vào các service quyết định duyệt.
    - Loại bỏ nhánh `QD93_CONVERSION`, `legacy`, `REWAIT`, các lý do cũ và mã lỗi `STEP_AWAITING_CONVERSION`.
    - Gỡ bỏ `everHeldSpendingApproverAmong` khỏi `IdentityAccessApi`, `RoleGrantService`, `RoleGrantRepo`.
    - Giữ nguyên enum value `SPENDING_APPROVER_PARTY` và logic phán định đối tượng không hợp lệ đã ổn định từ Phase A.
- **Dự án phòng ban (Phase 2):**
  - Viết migration `20261103160100_requests_drop_project_label`: Làm sạch khóa `projectLabel` trong JSON policy của bản nháp (`DRAFT`), sau đó `ALTER TABLE access_requests DROP COLUMN project_label`.
  - Viết migration `20261103160200_organization_drop_projects`: Drop bảng `project_departments`, bảng `projects`, và drop type `ProjectStatus`.
  - Prisma Schema: Gỡ bỏ models `Project`, `ProjectDepartment`, enum `ProjectStatus`, cột `projectLabel`, các quan hệ `Organization.projects`, `Department.projects`, `Employee.approvalRoles`.
  - Codec bản nháp: Duy trì `RETIRED_DRAFT_BODY_KEYS = ['projectLabel']` theo đúng yêu cầu để tương thích ngược.

---

## 3. Danh sách Migrations mới theo đúng thứ tự thời gian

| Thứ tự | Tên thư mục Migration | Mục đích & Ràng buộc an toàn |
| :---: | :--- | :--- |
| 1 | `20261103140000_organization_employee_placements_keep_at_least_one` | Thêm trigger đảm bảo nhân viên đang hoạt động luôn có tối thiểu 1 vị trí phòng ban (Việc 3) |
| 2 | `20261103150000_budgets_attachments` | Tạo bảng `budget_attachments` cho chứng từ và tệp đính kèm ngân sách (Việc 4) |
| 3 | `20261103160000_identity_drop_approval_role_holders` | **Guard P0001**: Drop bảng `approval_role_holders`, drop type `ApprovalRole`, viết lại trigger bảo vệ Super Admin vs Trưởng phòng (Việc 5) |
| 4 | `20261103160100_requests_drop_project_label` | Làm sạch JSON draft, drop cột `project_label` khỏi `access_requests` (Việc 5) |
| 5 | `20261103160200_organization_drop_projects` | Drop bảng `project_departments`, `projects` và type `ProjectStatus` (Việc 5) |

---

## 4. Bảng ánh xạ "Test cũ → Test mới" (Test Mapping Matrix)

Bảng dưới đây ghi nhận đầy đủ việc thay thế, chuyển đổi hoặc loại bỏ các test case theo đặc tả nghiệp vụ:

| # | Test cũ (File : Tên test) | Trạng thái | Test mới / Giải pháp thay thế (File : Tên test) | Lý do nghiệp vụ |
| :---: | :--- | :---: | :--- | :--- |
| 1 | `need-decision.policy.spec.ts`:<br>`refuses a decision on a legacy step: it is frozen until the conversion` | **XÓA** | Không còn khái niệm bước đóng băng chờ conversion. Bước duyệt xử lý trực tiếp theo rule chuẩn. | Cơ chế đóng băng và conversion đã được gỡ bỏ hoàn toàn ở Phase B. |
| 2 | `need-decision.policy.spec.ts`:<br>`names no decider role for a legacy row 3 or 4` | **THAY** | `need-decision.policy.spec.ts`:<br>`has no role for a row that gives the step to nobody` (kiểm tra rows 3, 4, 8 đều ném exception) | Nhánh `null` của `deciderRoleOf` bị gỡ bỏ, các row không hợp lệ đều báo lỗi. |
| 3 | `spend-decision.policy.spec.ts`:<br>`refuses a decision on a legacy step: held by a substitute...` | **XÓA** | `spend-decision.policy.spec.ts`:<br>`checkSpendDecider` chỉ kiểm tra actor và assignee chuẩn, không còn tham số `stepAwaitsConversion`. | Người duyệt chi và bước chi không còn phụ thuộc vai thay thế. |
| 4 | `group-line-decision.policy.spec.ts`:<br>`a legacy step, frozen until the conversion` | **XÓA** | Dòng nhóm không còn kiểm tra `stepAwaitsConversion`. | Cơ chế chuyển đổi dòng nhóm cũ đã kết thúc. |
| 5 | `reassignment.policy.spec.ts`:<br>`keeps a legacy step frozen for every trigger but the conversion` | **XÓA** | `reassignment.policy.spec.ts`:<br>`keeps waiting when the table still gives nobody` | Bỏ trigger `QD93_CONVERSION` và flag `legacy`. |
| 6 | `reassignment.policy.spec.ts`:<br>`which steps are of the old rule (isLegacyStep)` | **XÓA** | Bỏ toàn bộ block test `isLegacyStep` và type `LegacyCandidate`. | Hàm `isLegacyStep` đã bị xóa khỏi codebase. |
| 7 | `role-grant-constraints.integration-spec.ts`:<br>`refuses the Super Admin role for someone who holds an approval role...` | **THAY** | `drop-approval-role-holders-migration.integration-spec.ts`:<br>`drops approval_role_holders and type when clean, and trigger still forbids Super Admin from heading a department` | Bảng `approval_role_holders` đã bị xóa; trigger mới chỉ còn chặn Super Admin làm trưởng phòng. |
| 8 | `installation-bootstrap-facts.integration-spec.ts`, `installation.integration-spec.ts`:<br>Kiểm tra số đếm `approval_holders: 0` | **SỬA** | Xóa câu query đếm từ bảng `approval_role_holders` trong fixture fact checks. | Bảng `approval_role_holders` không còn tồn tại trong schema. |
| 9 | `access-request-constraints.integration-spec.ts`:<br>Kiểm tra CHECK nhãn dự án rỗng và `project_label: null` | **SỬA** | Bỏ `project_label` khỏi fixture insert và schema tests. | Cột `project_label` đã được drop hoàn toàn khỏi database. |
| 10 | `my-requests-read.integration-spec.ts`:<br>Regex liệt kê các cột chứa `project_label` | **SỬA** | Xóa `\|project_label` khỏi biểu thức chính quy. | Cột `project_label` không còn tồn tại. |
| 11 | — *(Test migration mới)* | **MỚI** | `test/integration/identity-access/drop-approval-role-holders-migration.integration-spec.ts`:<br>1. Guard dừng P0001 khi còn dòng chặn.<br>2. Deploy thành công khi sạch và trigger vẫn chặn Super Admin làm trưởng phòng. | Đáp ứng chính xác yêu cầu của Việc 5. |
| 12 | — *(Test migration mới)* | **MỚI** | `test/integration/organization/projects-drop-migration.integration-spec.ts`:<br>Deploy xóa `projects`, `project_departments`, enum `ProjectStatus`, giữ nguyên phòng ban. | Đáp ứng Task 2.2 của plan dự án. |
| 13 | — *(Test migration mới)* | **MỚI** | `test/integration/requests/access-request-project-label-drop-migration.integration-spec.ts`:<br>Deploy drop cột `project_label`, làm sạch key `projectLabel` trong JSON draft policy. | Đáp ứng Task 2.1 của plan dự án. |

---

## 5. Danh mục Kiểm tra Xác minh (Verification Checklist)

Tất cả các lệnh kiểm tra theo quy trình chuẩn đều đã được chạy trực tiếp trên máy và ghi nhận kết quả:

| Lệnh kiểm tra | Mục đích kiểm tra | Kết quả | Ghi chú |
| :--- | :--- | :---: | :--- |
| `pnpm prisma:validate` | Kiểm tra tính hợp lệ của Prisma schema | **PASS (exit 0)** | "The schemas at prisma are valid 🚀" |
| `pnpm typecheck` | Kiểm tra toàn bộ kiểu TypeScript (`tsc --noEmit`) | **PASS (exit 0)** | 0 lỗi compilation |
| `pnpm lint` | Kiểm tra ESLint trên toàn bộ codebase | **PASS (exit 0)** | 0 problems |
| `pnpm format:check` | Kiểm tra tuân thủ định dạng Prettier | **PASS (exit 0)** | "All matched files use Prettier code style!" |
| `pnpm arch:check` | Kiểm tra kiến trúc module boundary (`depcruise`) | **PASS (exit 0)** | 1,640 modules cruised, 0 violations |
| `pnpm rules:check` | Kiểm tra liên kết và quy tắc tài liệu | **PASS (exit 0)** | 411 files, 3,367 links, 0 errors |
| `pnpm arch:docs:check` | Kiểm tra đồng bộ `module-graph.md` và `routes.md` | **PASS (exit 0)** | Không có drift |
| `pnpm openapi:export` | Xuất spec OpenAPI và kiểm tra drift | **PASS (exit 0)** | Spec đồng bộ hoàn hảo |
| `pnpm test:gates` | Kiểm tra 16 static gates | **PASS (exit 0)** | 16/16 suites passed (327 tests) |
| `pnpm test:http` | Chạy toàn bộ test suites HTTP contract | **PASS (exit 0)** | **62/62 suites passed (1,507 tests)** |
| `pnpm test:integration` (theo file) | Kiểm tra các file migration mới và file bị ảnh hưởng | **PASS (exit 0)** | Toàn bộ 6/6 test suites integration được chỉ định đều xanh |

---

## 6. Kết luận & Sẵn sàng bàn giao

- Toàn bộ 5 Việc của gói sửa lỗi `QĐ-93` đã hoàn thành trọn vẹn, đúng thứ tự, bảo toàn các cam kết chất lượng nghiêm ngặt nhất.
- Không có bất kỳ commit nào được push lên remote hay merge vào nhánh chính; repo `Docs` hoàn toàn nguyên vẹn không bị sửa đổi.
- Nhánh `feat/qd93-remaining` ở trạng thái hoàn hảo, sẵn sàng cho audit độc lập của Claude.


# Spec: Danh bạ nhân viên toàn công ty của Super Admin (`US-02-02` AC-22, AC-24→AC-26)

- Phụ trách: chưa phân công (người/AI nhận implement sở hữu cả thiết kế, test và bằng chứng).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (gói `QĐ-93`, 01/11/2026).
- Thiết kế: `draft`. Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec.
- Nguồn: Docs `69e8a3d` (BRD v3.58 `FR-2.1`, `FR-2.2`, `INV-20`; User Stories regenerated — 143 Story / 1 586 AC: `US-02-02`
  AC-22, AC-24, AC-25, AC-26, TS-17, TS-19→TS-21; quyết định `QĐ-87a`, `QĐ-41c`, `QĐ-93g`(4)), BE `1a77ffe8`. Finding
  `API-GAP-04` từ `Docs/Figma UI-UX/API-Integration/changes/CHANGELOG.md` (Docs `69e8a3d`, dòng 133).
- Bổ sung sau pin: D-S17…D-S26 (Docs chưa commit) — Owner 01/11/2026; lát này áp `D-S25` (một định nghĩa _chưa xếp
  phòng_: không có dòng placement nào, dùng chung với `qd93-unplaced-employee-first-placement`), `D-S26` (quyền chạy test) và
  thứ tự merge của đợt sửa sau audit.
- Nhóm roadmap: G2 — chỉ là planning container, không phải phạm vi (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này Super Admin liệt kê, tìm (mã nhân viên, họ tên không phân biệt hoa thường và dấu tiếng Việt, email công việc, đúng
mã định danh) và lọc (phòng hiện hành, _chưa xếp phòng_, trạng thái làm việc, loại nhân sự, có tài khoản) mọi nhân viên của
công ty có phân trang, và mở một hồ sơ đầy đủ (trường chính thức, phòng hiện hành và lịch sử xếp phòng, trạng thái nghỉ
dài/bàn giao/nghỉ việc, tóm tắt tài khoản và vai gán trực tiếp); mọi vai khác bị từ chối. Danh sách thành viên phòng
`GET /departments/{id}/employees` có thêm `employeeId` (`API-GAP-04`) — kiểm bằng HTTP contract, integration (gồm đếm câu
lệnh) và gate API-LIST-DETAIL.1.

## Sizing decision

- Container: G2 (nhóm giao việc, không phải ranh giới hạng mục) và gói quyết định `QĐ-93` (01/11/2026).
- Mode: `single-story`.
- Outcome and owner: đọc danh bạ nhân viên của Super Admin; capability mới `organization/employee-directory`, mở rộng
  extension point `EmployeeAccountsHook` (bên bind: `identity-access`).
- Boundaries: chỉ đọc; một snapshot `RepeatableRead` cho trang + đếm; hai route `GET` mới, một trường thêm ở
  `departmentMemberList`; chỉ `SUPER_ADMIN`; không bảng, không migration, không job.
- Not larger: tạo hồ sơ không phòng/xếp phòng lần đầu và **định nghĩa** _chưa xếp phòng_
  (`qd93-unplaced-employee-first-placement`), sửa hồ sơ (đã có), chi tiết nghỉ dài/bàn giao (route personnel hiện có) không
  thuộc đây.
- Not smaller: list và detail là một cặp theo API-LIST-DETAIL.1 (summary/detail, cùng quyền, cùng test matrix); AC-22 là bộ
  lọc của chính danh sách này.
- Siblings: `qd93-unplaced-employee-first-placement` (sở hữu vị từ _chưa xếp phòng_ dùng chung — lát này chỉ gọi lại),
  `qd93-remove-hr-basis-org-writes`, `qd93-direct-manager-spending-approver-roles` (enum vai sáu giá trị),
  `qd93-remove-department-projects` (đổi tên file integration thành viên phòng).
- Scope map: [G2](../../../roadmap.md#work-item-decomposition-g2).

## Primary Story/AC

| Story    | AC                 | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                                             |
| -------- | ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-02-02 | AC-22, AC-24→AC-26 | partial  | AC-2, AC-7, AC-14 vế không chọn phòng, AC-20, AC-21: `qd93-unplaced-employee-first-placement`; AC-1, AC-10, AC-13, AC-16, AC-19: `qd93-remove-hr-basis-org-writes`; AC-14 vế mã, AC-23: `qd93-code-format-xlsx-employee-import`; vế đã giao trước `QĐ-93`: `g2-employee-intake-by-super-admin` |

Bốn AC sở hữu trọn ở đây; dòng `partial` chỉ vì các AC khác của Story thuộc hạng mục khác.

## Supporting references

- `FR-2.1` (_quản lý danh sách nhân viên_), `QĐ-87a` (Super Admin sở hữu hồ sơ), `QĐ-41c` (bản đọc riêng của Finance, trưởng
  phòng), `QĐ-87b`(4) (IT Admin chỉ đọc kỹ thuật tối thiểu), `US-01-02` AC-7, `US-01-11` AC-10, `US-04-09` AC-6, `US-14-01`
  (các bản đọc riêng giữ nguyên — `US-02-02` AC-26 vế sau).
- `D-S25` (Owner 01/11/2026): _chưa xếp phòng_ ⟺ không có dòng `employee_placements` nào (hiện hành hay tương lai); người có
  placement đầu tiên bắt đầu ở tương lai là thành viên phòng đó về tính hợp lệ của Request; bộ lọc `unplaced=true` của danh
  bạ dùng **cùng** vị từ, do `qd93-unplaced-employee-first-placement` sở hữu (`EmployeeRepo.unplacedAmong` / mảnh SQL dùng
  chung). Câu "`E302` không còn trong bộ lọc này từ ngày hiệu lực" của `US-02-02` AC-22 (Docs `69e8a3d`) được `D-S25` thay:
  không còn từ lúc ghi xếp phòng lần đầu (Docs chưa commit sẽ viết lại).
- `API-GAP-04` (CHANGELOG API-Integration Docs `69e8a3d`): `departmentMemberList` trả mã và tên, không trả `employeeId`, trong
  khi `departmentHeadAssign` cần `employeeId`; khuyến nghị thêm `employeeId` (additive) — làm ở lát này.
- [api-contract API-LIST-DETAIL.1](../../../rules/api-contract.md#collection-và-detail-api-list-detail1) (quy tắc 5: projection
  trực tiếp, list không đọc cột/quan hệ chỉ detail cần; quy tắc 6: số câu lệnh hằng số, không câu nào đọc bảng chỉ detail
  cần); registry `test/support/api-collection-registry*.ts`; harness `test/support/query-count.ts`.
- `docs/rules/security-jobs.md` (guard đọc phiên, tài khoản, nhân viên trong CSDL ở mọi request — các câu này nằm ngoài cửa
  sổ đếm); tiền lệ cửa sổ đếm `test/integration/licensing/licensing-assignment-read-contracts.integration-spec.ts:69-73`.
- `docs/rules/module-structure.md` (organization không import identity-access — dùng extension point; tên service đọc
  `-query`).

## Explicit out of scope

- Ghi bất cứ gì (danh bạ chỉ đọc — AC-24 vế cuối).
- Ngày bắt đầu/ngày quay lại của nghỉ dài, ngày làm việc cuối, việc bàn giao: thuộc `personnel` (tầng trên `organization`);
  detail chỉ trả `workState`/`status`, FE mở `GET /long-leaves?employeeId=` và `GET /offboarding-cases?employeeId=` (đã có,
  Super Admin đọc được) (Owner duyệt 01/11/2026 — OQ-1).
- Xuất danh bạ ra tệp; sắp xếp tùy chọn ngoài thứ tự cố định.
- Gộp các bản đọc riêng của vai khác (Finance theo Cost Center, trưởng phòng, IT Admin) vào route này.
- Định nghĩa hay câu SQL _chưa xếp phòng_ riêng: lát này không viết — gọi lại vị từ của `qd93-unplaced-employee-first-placement`.

## Dependencies and blockers

- Thứ tự merge (Owner 01/11/2026, đợt sửa sau audit; mỗi lần một lát, rebase lên `dev` trước khi merge): W4, **sau**
  `qd93-unplaced-employee-first-placement` (A–D) — lát đó sở hữu vị từ _chưa xếp phòng_ (`D-S25`) mà bộ lọc `unplaced` gọi
  lại, route tạo hồ sơ không phòng và `first-placements` dùng để dựng dữ liệu test. Chuỗi trước đó đã merge:
  `qd93-remove-hr-basis-org-writes` (W1), `qd93-direct-manager-spending-approver-roles` và `qd93-remove-department-projects`
  phase 1 (W2), `qd93-remove-fallback-substitute-approvers` phase A (W3).
- Lát vai đã merge ⟹ `AppRole` có sáu giá trị: enum `account.roles` và `ROLE_GRANTS` phải khớp (Registry).
  `qd93-remove-department-projects` phase 1 đã đổi tên `department-manager-and-projects-http.integration-spec.ts` thành
  `department-manager-http.integration-spec.ts` (Task 5 dùng tên mới).
- `test/http/platform/openapi-presentation.http-spec.ts:254` (306 ở `1a77ffe8`) bị ba lát sửa (dự án −4, chưa xếp phòng +1,
  lát này +2): tính lại từ số trên `dev` lúc rebase.
- Không blocker khác. OQ-1 → OQ-3 đã được Owner duyệt 01/11/2026 đúng như spec ghi; wire chốt theo đó.

## Ownership: module, data, API

- Capability mới `src/modules/organization/employee-directory/` (≤ 10 file): `employee-directory.controller.ts`,
  `employee-directory.dto.ts`, `employee-directory-query.service.ts`, `employee-directory.repo.ts`,
  `employee-directory.mapper.ts` (+ spec), `employee-directory-search.policy.ts` (+ spec: phân loại `q`, gập dấu, escape
  `LIKE`), `employee-directory.types.ts`. Đăng ký controller/provider ở `organization-http.module.ts`. Repo đọc vị từ _chưa
  xếp phòng_ từ `organization/employee/` (hàm/mảnh SQL của lát chưa xếp phòng) — cùng module, không qua facade.
- Extension point: `organization/public/organization.extension-points.ts` — `EmployeeAccounts` thêm ba method:
  `findEmployeeIdsWithAccount()` (có sẵn ở `AccountRecordService`, đưa lên hook), `summarizeAccounts(employeeIds)` cho list
  (**một** câu, chỉ `app_users`: `id`, `status`, `activationState`, `employeeLeft` theo `employee_id`; không `role_grants`) và
  `describeAccount(employeeId)` cho detail (**một** câu `app_users` + `role_grants` còn hiệu lực, không khóa — khác
  `inspectEmployeeAccount` vốn khóa `FOR SHARE`); bên bind `identity-access/accounts/employee-accounts.listener.ts`; hiện thực ở
  `identity-access/accounts/account-record.service.ts` (+ repo `app-user.repo.ts`/`role-grant.repo.ts`). Gate
  `extension-wiring`: hook đã bind ở graph API, không graph mới.
- `API-GAP-04`: `organization/department/department.repo.ts` (`readMembers` chọn `e.id`), `department.types.ts`
  (`DepartmentMemberRecord.employeeId`), `department-management/department.dto.ts` (`memberPageSchema` thêm `employeeId`).
- Bảng đọc: `employees`, `employee_placements`, `departments` (organization); `app_users` (list và detail), `role_grants`
  (chỉ detail) — identity-access, qua hook. Không ghi.
- API mới: `employeeList` `GET /api/v1/employees`, `employeeGet` `GET /api/v1/employees/{id}`. Đổi additive:
  `departmentMemberList` item thêm `employeeId`.

## Behavior and design

### `GET /api/v1/employees` (SUPER_ADMIN)

- Query (`z.strictObject` — khóa lạ ⟹ 422): `q` (trim, ≤ 100), `departmentId` (uuid), `unplaced` (`'true'|'false'`),
  `workState` (`WORKING|ON_LONG_LEAVE|HANDING_OVER|LEFT`), `employmentType` (`STAFF|CONTRACTOR|FREELANCER|INTERN`),
  `hasAccount` (`'true'|'false'`), `page` (≥ 1, mặc định 1), `pageSize` (1–100, mặc định 20). Cờ boolean theo mẫu
  `z.enum(['true','false']).transform(…)` hiện có. Mọi bộ lọc kết hợp AND; `departmentId` + `unplaced=true` ⟹ trang rỗng (không
  lỗi). Trang sau trang cuối ⟹ `items: []`, `totalItems` đúng.
- `q`: là UUID (không phân biệt hoa thường) ⟹ chỉ khớp `e.id`; ngược lại khớp **một trong**: `upper(employee_code)` chứa
  `upper(q)`; `normalized_work_email` (đã chữ thường, `prisma/models/organization.prisma:275`) chứa `lower(q)` — khi `q` là một
  địa chỉ email hợp lệ thì dùng `normalizeEmail(q)` (`src/core/email.ts`, bỏ `+tag` như mọi phép so danh tính, `FR-7.6`);
  họ tên gập dấu chứa `q` gập dấu. Gập dấu (Owner duyệt 01/11/2026 — OQ-3): JS `searchKey(q)` rồi `đ → d`; SQL
  `lower(translate(normalize(e.full_name, NFC), <bảng chữ có dấu hoa + thường + Đđ>, <chữ không dấu>))` và gộp khoảng trắng —
  một hằng SQL duy nhất trong repo, có test cặp JS ↔ SQL trên danh sách tên mẫu. Ký tự `%`, `_`, `\` của `q` được escape
  (`ESCAPE '\'`) như `employee.repo.ts:55-58` — tìm đúng nghĩa đen. Không cột mới, không extension `unaccent` (Owner duyệt
  01/11/2026 — OQ-3; quét tuần tự đủ cho số nhân viên một công ty — xem lại khi > 10 000). Đã loại: cột/chỉ mục tìm kiếm mới,
  extension `unaccent`; `lower(work_email)` (cột không chỉ mục, không chuẩn hóa như phép so danh tính).
- Ghi chú: `src/core/search-key.ts` hiện không gập `đ`; lát này **không** sửa hàm core (catalog đã lưu giá trị bằng nó), chỉ
  gập thêm ở policy của danh bạ.
- `departmentId`: placement **đang hiệu lực hôm nay** thuộc phòng đó:
  `valid_from <= hôm nay AND (valid_to IS NULL OR valid_to > hôm nay)` — `valid_to` là ngày **loại trừ** (ngày đầu tiên
  không còn thuộc phòng), như `department.repo.ts:350-351`.
- `unplaced=true`: vị từ dùng chung của `qd93-unplaced-employee-first-placement` (`D-S25`: không có dòng `employee_placements`
  nào); `false`: phủ định của cùng vị từ. Lát này không viết câu `NOT EXISTS` riêng (gate review: `rg` không thấy câu SQL
  _chưa xếp phòng_ thứ hai). Người có placement đầu tiên bắt đầu ngày mai: `unplaced: false`, `department: null` (chưa hiệu
  lực hôm nay), detail có placement tương lai.
- `hasAccount`: tập id nhân viên có tài khoản lấy qua hook (`findEmployeeIdsWithAccount`, một câu, **trước** snapshot),
  truyền một tham số `uuid[]` (tiền lệ `account-candidates`).
- Summary projection (schema riêng `EmployeeSummaryDto`), không mảng lồng: `id`, `employeeCode`, `fullName`, `workEmail`,
  `employmentType`, `status` (`ACTIVE|TERMINATED`), `workState`, `hireDate`, `jobTitle`, `department: {id, code, name} | null`
  (phòng hiện hành hôm nay — cùng tên trường với `EmployeeResponseDto` của `qd93-unplaced-employee-first-placement`; đã loại
  `currentDepartment`), `unplaced: boolean` (cùng tên với `EmployeeResponseDto`),
  `account: { id, status, activationState, employeeLeft } | null` (`id` là AppUser để FE mở `/app-users/{id}`; không có
  `roles` ở list).
- Phân trang `page`/`pageSize` có `maximum` 100; thứ tự tất định `ORDER BY e.employee_code, e.id`; câu trang (đọc trước) và
  câu đếm trong **một** transaction `RepeatableRead` (`organization`); tóm tắt tài khoản của đúng các id của trang đọc sau qua
  hook (một câu, ngoài snapshot — trạng thái tài khoản có thể mới hơn trang; chấp nhận, ghi ở mô tả route).
- Response `{ items, pagination: { page, pageSize, totalItems, totalPages } }` qua `pageOf`; message `EMPLOYEE.LISTED`.

### `GET /api/v1/employees/{id}` (SUPER_ADMIN)

- Param dùng lại `employeeIdParamSchema` (`organization/employee/employee.dto.ts:71`, `z.strictObject({ id: z.uuid() })`);
  không có ⟹ 404 `EMPLOYEE.NOT_FOUND` (ví dụ `ORGANIZATION_ERROR_EXAMPLES.EMPLOYEE_NOT_FOUND` hiện có), không lộ gì.
- Detail `EmployeeDetailDto = summary.extend({ … })`: thêm
  `placements: [{ department: {id, code, name}, validFrom, validTo: string | null }]` (mới nhất trước, kể cả placement bắt
  đầu tương lai; `validTo` loại trừ — ngày đầu tiên không còn thuộc phòng, đúng câu "tới trước 01/06" của AC-25; tối đa
  `EMPLOYEE_PLACEMENT_HISTORY_LIMIT = 50`, đọc `limit + 1` rồi `cutHistory`), `placementsHasMore: boolean`, và `account` mở
  rộng thành `{ id, status, activationState, employeeLeft, roles: AppRoleName[] } | null` — `roles` là vai gán trực tiếp còn
  hiệu lực (`describeAccount`). Enum `roles` khai trong DTO của
  organization đủ sáu giá trị `SUPER_ADMIN|IT_ADMIN|FINANCE|EMPLOYEE|MANAGER|SPENDING_APPROVER` (Owner duyệt 01/11/2026 —
  OQ-2); lát vai đã merge trước nên dữ liệu có thể mang cả sáu.
- Trạng thái nghỉ dài/bàn giao/nghỉ việc: `workState` (`ON_LONG_LEAVE`, `HANDING_OVER`, `LEFT`) + `status`; chi tiết ngày
  qua route personnel (OQ-1, Owner duyệt 01/11/2026).
- Message `EMPLOYEE.FETCHED`.

### Đếm câu lệnh (API-LIST-DETAIL.1 quy tắc 6)

- `QueryCounter` ghi mọi câu của request, gồm câu guard (phiên, tài khoản, nhân viên, vai — `docs/rules/security-jobs.md`) và
  `businessToday()`. **Cửa sổ đếm** (tiền lệ `licensing-assignment-read-contracts.integration-spec.ts:69-73`):
  `dataStatements(...)` (bỏ `BEGIN/COMMIT/SET`) **từ câu đầu tiên chạm `employee_placements`** tới hết request. Câu đầu tiên
  của route list (câu trang, có JOIN placement hiện hành) và của route detail (nhân viên + phòng hiện hành) đều chạm bảng này;
  guard của Super Admin không chạm (hiện đúng — `departmentMemberList` có đúng 2 câu chạm bảng này ở
  `organization-identity-read-contracts.integration-spec.ts:155`; kiểm lại trên `dev` khi implement). Service gọi
  `businessToday()` và câu `hasAccount` trước câu trang, nên cả hai nằm **trước** cửa sổ.
- List: cửa sổ = **3** câu (trang, đếm, `summarizeAccounts`) cả khi có hay không `hasAccount`; không câu nào trong cửa sổ chạm
  `role_grants`, `employee_leaves`, `offboarding_cases`, `audit_events`. Với `hasAccount`: tổng câu dữ liệu của cả request =
  tổng của cùng request không `hasAccount` + 1 (câu `findEmployeeIdsWithAccount` trên `app_users`, trước cửa sổ). Trang và
  đếm cùng snapshot (`oneSnapshot`).
- Detail: cửa sổ = **3** câu (nhân viên + phòng hiện hành, lịch sử placement, `describeAccount`); 404 ⟹ cửa sổ = 1.
- Hai cỡ dữ liệu: list trên 5 và 60 nhân viên, detail trên 1 và 40 placement ⟹ tổng câu dữ liệu của cả request bằng nhau
  (guard giống nhau vì cùng người gọi).

### Registry API-LIST-DETAIL.1

- `employeeList` tuân thủ (schema summary riêng, `pageSize` có `maximum`) ⟹ không cần mục registry.
- `employeeGet` có hai mảng lồng ⟹ hai mục `NESTED_ARRAYS` `bounded` trong `test/support/api-collection-registry-nested.ts`
  (đang 367/400 dòng; nếu vượt thì tách tệp theo mẫu `-first-half`): `employeeGet#placements` (`maxItems: 50`, source nêu
  `EMPLOYEE_PLACEMENT_HISTORY_LIMIT`), `employeeGet#account.roles` (`maxItems: 6`, source `ROLE_GRANTS`). Hằng `ROLE_GRANTS`
  (`test/support/api-collection-registry.ts:124`) ở `1a77ffe8` nói "AppRole has 4 values": sau lát vai chuỗi phải nói sáu giá
  trị; lúc implement đọc lại trên `dev` — còn "4 values" ⟹ dừng và báo (sửa chuỗi kéo theo `maxItems: 4` của các khóa vai khác
  là việc của lát vai, không làm ở đây).
- Hai sự kiện `boundedNested(…, 'LD-14', 'employee-directory-read', …, 'added', <ngày thật>)` trong
  `api-collection-registry-events.ts` (tiền lệ `transferReviewGet#unfinishedRequests`). `boundedNested`
  (`api-collection-registry-events.ts:29-45`) đang ghi cứng `date: '2026-10-23'`: thêm tham số `date` cuối, mặc định
  `'2026-10-23'` cho các sự kiện cũ, hai sự kiện mới truyền ngày thật.

### Quyền và lỗi

- `@RequireRoles('SUPER_ADMIN')` ở class; Finance, Manager, IT Admin, Employee, không vai, `SPENDING_APPROVER` ⟹ 403
  `AUTHORIZATION.FORBIDDEN`; 401/503 chung; 422 `VALIDATION_ERROR` cho query/param sai. Mô tả 403 theo luật lời của route đọc
  (`openapi-read-wording`): "Only the Super Admin reads the company-wide employee directory." Các bản đọc riêng của vai khác
  không đổi (AC-26).

### `API-GAP-04` — `departmentMemberList`

- Item thêm `employeeId` (uuid) đứng đầu; các trường khác giữ nguyên. Additive: client cũ bỏ qua trường mới. Test ghim khóa
  (`organization-identity-read-contracts`, `department-manager-http` — tên sau `qd93-remove-department-projects` phase 1,
  `department-contract-http`) cập nhật; số câu lệnh không đổi (chỉ thêm cột).

### Concurrency, migration, jobs

Chỉ đọc; không khóa ghi; không migration (không cột tìm kiếm mới; nếu implement phát sinh migration thì theo luật timestamp:
timestamp thật khi tạo, đổi lại cho đứng sau migration mới nhất trên `dev` trước merge, thêm vào
`scripts/verify/merged-migrations.txt`); không job.

## Test matrix

| AC / rủi ro               | Tình huống (gồm từ chối, edge case)                                                                                                                                                    | Cấp test              | Kết quả mong đợi                                                                                                                                                       | Bằng chứng sau implement |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `US-02-02` AC-24          | dữ liệu AC-24: `E1` (`NV-0001`, _Nguyễn Văn A_, `P-DES`, có tài khoản), `E4` nghỉ dài không tài khoản, `E7` đã nghỉ việc từ `P-OPS`, `E302` chưa xếp phòng có tài khoản chưa kích hoạt | integration           | danh sách có cả bốn; mỗi dòng đủ trường summary; `E302` `unplaced: true`, `E7` `department: null`, `unplaced: false`                                                   | planned                  |
| `US-02-02` AC-24          | `q` = `nguyen van a`, `NGUYỄN văn A`, `nv-0001`, `a.nguyen@congty.vn`, `a.nguyen+x@congty.vn`, id của `E1` (thường và VIẾT HOA); tên có `Đ` tìm bằng `d`                               | integration           | có `E1`; tìm `dang` thấy _Đặng_                                                                                                                                        | planned                  |
| `US-02-02` AC-24          | `q` không khớp ai; `q` = `50%`, `a_b` (có nhân viên tên chứa `50x`, `aXb` và một người chứa đúng `50%`)                                                                                | integration           | trang rỗng `totalItems: 0`; `%`/`_` khớp nghĩa đen — chỉ người chứa đúng chuỗi                                                                                         | planned                  |
| `US-02-02` AC-24          | lọc `departmentId=P-DES` + `hasAccount=true`; `workState=ON_LONG_LEAVE`; `workState=HANDING_OVER`; `employmentType`; kết hợp; `departmentId` viết hoa                                  | integration           | đúng tập (`P-DES` + có tài khoản ⟹ chỉ `E1`); `totalItems`, `totalPages` khớp; UUID viết hoa cùng kết quả                                                              | planned                  |
| `US-02-02` AC-24          | người rời `P-OPS` với `valid_to` = hôm nay; người vào `P-DES` từ hôm nay                                                                                                               | integration           | `departmentId=P-OPS` không có người rời (`valid_to` loại trừ); `P-DES` có người vào                                                                                    | planned                  |
| `US-02-02` AC-22          | `E302`, `E303` tạo qua `POST /employees` không phòng; `E1`, `E7`; `departmentId=P-DES` + `unplaced=true`                                                                               | integration           | `unplaced=true` đúng `E302`, `E303`; kết hợp với `departmentId` ⟹ trang rỗng, không lỗi                                                                                | planned                  |
| `US-02-02` AC-22, `D-S25` | `POST /employees/{E302}/first-placements` từ ngày mai                                                                                                                                  | integration           | ngay sau khi ghi: `E302` không còn trong `unplaced=true`, `department: null`, detail có placement tương lai; cùng tập với `OrganizationReadApi.getUnplacedEmployeeIds` | planned                  |
| `US-02-02` AC-24          | trang 2 cỡ 50 trên 120 nhân viên; hai lần đọc giữa có ghi đồng thời; trang 4 (sau trang cuối)                                                                                          | integration           | đúng 50 dòng kế tiếp theo `employee_code, id`; trang và đếm cùng snapshot; trang 4 `items: []`, `totalItems: 120`                                                      | planned                  |
| API-LIST-DETAIL.1         | đếm câu lệnh (cửa sổ từ câu đầu chạm `employee_placements`) list có/không `hasAccount` trên 5 và 60 nhân viên; detail trên 1 và 40 placement                                           | integration           | list 3 câu, detail 3 câu (404: 1); có `hasAccount` ⟹ tổng +1; tổng bằng nhau trên hai cỡ; không câu list nào chạm `role_grants` hay bảng personnel                     | planned                  |
| `US-02-02` AC-25          | mở `E1` đã điều chuyển `P-OPS` → `P-DES` từ 01/06, tài khoản `IT_ADMIN`, `EMPLOYEE`                                                                                                    | integration           | trường chính thức; `department` `P-DES`; `placements` hai giai đoạn mới nhất trước, `P-OPS` `validTo` = 01/06; `account.roles` hai vai                                 | planned                  |
| `US-02-02` AC-25          | mở `E302` chưa xếp phòng; id không tồn tại; id không phải UUID; id viết hoa                                                                                                            | integration/http      | `unplaced: true`, `placements: []`; 404 `EMPLOYEE.NOT_FOUND`; 422 `VALIDATION_ERROR`; viết hoa ⟹ 200 cùng hồ sơ                                                        | planned                  |
| `US-02-02` AC-25          | nhân viên có 51 placement                                                                                                                                                              | integration           | 50 dòng, `placementsHasMore: true`                                                                                                                                     | planned                  |
| validation                | `page=0`, `pageSize=0`, `pageSize=101`, khóa query lạ (`sort=x`), `q` 101 ký tự, `departmentId=abc`, `workState=X`, `unplaced=yes`                                                     | http                  | 422 `VALIDATION_ERROR` mỗi ca, không gọi service                                                                                                                       | planned                  |
| `US-02-02` AC-26          | Finance, Manager, IT Admin, Employee, không vai, `SPENDING_APPROVER` gọi list và detail                                                                                                | http                  | 403; không dữ liệu                                                                                                                                                     | planned                  |
| `US-02-02` AC-26 vế sau   | Finance `GET /cost-centers/{id}/employees`, trưởng phòng `GET /departments/{id}/employees`, IT Admin `technical-members`, Employee `/me`                                               | integration           | vẫn dùng được (test hiện có chạy lại theo file)                                                                                                                        | planned                  |
| `API-GAP-04`              | `GET /departments/{id}/employees`                                                                                                                                                      | integration           | mỗi item có `employeeId` đúng; khóa còn lại không đổi                                                                                                                  | planned                  |
| rủi ro OpenAPI            | inventory, ví dụ, lời route đọc, registry                                                                                                                                              | gate/http             | `api-inventory`, `openapi-response-examples`, `openapi-read-wording`, `api-collection-contract` xanh                                                                   | planned                  |
| rủi ro hook               | graph API thiếu bên bind; hook trả rỗng; `summarizeAccounts` cho 1 và 50 id                                                                                                            | gate/unit/integration | `extension-wiring` xanh; mapper xử lý nhân viên không tài khoản (`account: null`); một câu, chỉ `app_users`                                                            | planned                  |

## Definition of Done

- [ ] Bốn AC có test đỏ-trước/xanh-sau ở cấp phù hợp; `API-GAP-04` có test.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; `pnpm test:http` theo file,
      `pnpm openapi:export`, `pnpm test:gates` (registry), integration theo file đã sửa (danh sách ở plan) trên database
      riêng; toàn bộ `pnpm test:integration` chỉ khi Owner cho (`D-S26`).
- [ ] Spec/plan/roadmap phản ánh implementation cuối; FE được báo hai route mới và trường `employeeId`.
- [ ] Không tăng legacy ledger kiến trúc; capability mới không vòng; extension point ghi ở module card `organization` và
      `identity-access`; không câu SQL _chưa xếp phòng_ thứ hai.

## Changes and acceptance

01/11/2026: lập theo giao việc Owner (gói `QĐ-93`, hạng mục 11). Chưa code, chưa review, chưa nghiệm thu.

Quyết định kỹ thuật (Owner duyệt 01/11/2026): OQ-1 — detail chỉ trả `workState`/`status`, ngày nghỉ dài/nghỉ việc lấy ở
route personnel hiện có; OQ-2 — khai sẵn sáu giá trị vai trong enum `account.roles`; OQ-3 — gập dấu tại câu truy vấn (không
cột/chỉ mục mới) cho quy mô hiện tại.

Dòng scope map đã có ở [G2](../../../roadmap.md#work-item-decomposition-g2): `US-02-02` AC-22, AC-24→AC-26 `full` lát này
(AC mới).

- 01/11/2026 — Owner duyệt các đề xuất kỹ thuật (OQ-1 → OQ-3); thiết kế vẫn draft chờ Owner review toàn spec.
- 01/11/2026 — sửa theo audit độc lập (thiết kế vẫn `draft`): M1 list chỉ đọc `app_users` (`summarizeAccounts`), vai chỉ ở
  detail (`describeAccount`), khẳng định không câu list nào chạm `role_grants`; M2 định nghĩa cửa sổ đếm câu lệnh, vị trí câu
  `hasAccount`, hai cỡ dữ liệu; M3 + `D-S25` dùng lại vị từ _chưa xếp phòng_ của `qd93-unplaced-employee-first-placement`
  (không có placement nào), merge sau lát đó, bỏ câu SQL riêng và ca dựng bằng SQL; L3 `maxItems: 6` với chuỗi `ROLE_GRANTS`
  đúng, `boundedNested` nhận ngày; L4 thêm ca biên (không khớp, kết hợp lọc rỗng, trang sau cuối, `page`/`pageSize` 0, khóa
  lạ, `q` 101, `departmentId` sai, UUID viết hoa, `%`/`_`), `validTo` loại trừ, `normalized_work_email`,
  `employeeIdParamSchema`, tên trường `department` theo `EmployeeResponseDto`.

# Spec: qd96-100-account-org-api-fields — dọn trường API tài khoản và tổ chức; thông báo _chuyển đến_ theo mã nhân viên

- Phụ trách: AI theo giao việc Owner (05/11/2026).
- Thiết kế ban đầu bởi: AI (agent C-SPEC-P) theo giao việc Owner (05/11/2026); ledger L-461→L-466, L-512; Owner **Q-10**(1a), **Q-10**(2a).
- Thiết kế: `draft`. Owner review: chưa review.
- **Mức FE-tonight: `B`** — không bước nào của 5 flow cần (tạo/đổi vai tài khoản, Cost Center, thông báo _chuyển đến_ là đường phụ của
  MF-3 3.1 — Super Admin ghi điều chuyển trực tiếp vẫn chạy). FE **không** sửa form tài khoản/Cost Center/thông báo chuyển đến tối nay để
  khỏi code hai lần; `successor` thừa vẫn bị bỏ qua lặng lẽ tới khi B xong (ghi rõ cho demo).
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-8.6`, `FR-2.9`; US 0.15 — `US-03-10` AC-4 (hồi quy); `QĐ-95a`→`QĐ-95c`, `QĐ-93e`, `QĐ-100ag`, `QĐ-87e`, `QĐ-52b`, `QĐ-86b`, `QĐ-76d`(1), `QĐ-41c`(2)), BE `3e4553b9`.
- Nhóm roadmap: bó finding `qd96-100-alignment` (track P) — không thuộc nhóm G (vệ sinh hợp đồng API).
- [Kế hoạch](plan.md).

## Business outcome

Input tài khoản và tổ chức chỉ nhận trường người gọi có trách nhiệm cung cấp: tạo tài khoản không còn vai Super Admin/Người duyệt
chi và không còn `loginEmail` (luôn email công ty, chưa có thì từ chối mời); đổi vai không còn `SUPER_ADMIN`; `jobTitle` ≤ 255 ở DTO;
Cost Center không nhận `kind`; `/me` và tài khoản trả `role` đơn; `successor` gửi thừa bị từ chối; trưởng phòng nhận gửi thông báo
_chuyển đến_ bằng `employeeCode` khớp chính xác, server tự lấy phòng đích và trả mã + họ tên. Kiểm bằng HTTP contract.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (track P) — chỉ là container.
- Mode: `technical-enabler`.
- Outcome and owner: hợp đồng đầu vào/đầu ra của `identity-access/accounts`, `identity-access/access`, `organization/{employee,cost-center}`, `personnel/{transfer,notice}` khớp mô hình một vai và tối thiểu hóa trường.
- Boundaries: DTO, policy nhỏ, một facade đọc theo mã (`OrganizationReadApi.findEmployeeByCode`); không migration; không route mới.
- Not larger: trường catalog/licensing là `qd96-100-catalog-licensing-api-fields`; căn cứ/lý do là #24.
- Not smaller: cùng loại thay đổi (gỡ/đổi trường theo QĐ đã chốt), gom để FE sinh lại client một lần.
- Siblings: `qd96-100-people-read-scope` (trước), `qd96-100-manager-employee-detail` (sau).
- Scope map: n/a — bó finding ngoài nhóm G.

## Primary Story/AC

| Story | AC                        | Coverage | Phần còn lại thuộc                                                                                               |
| ----- | ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| —     | L-461→L-466, L-512 (Q-10) | n/a      | gỡ chặn `qd96-100-manager-employee-detail`, sinh lại client FE ở CP-2 (L-981, L-984) và tài liệu API-Integration |

## Supporting references

- Q-10(1a): bỏ `loginEmail`, luôn dùng email công ty; chưa có ⟹ từ chối mời (buộc tạo hộp thư công ty trước — `QĐ-100ag` cho mời trước ngày vào).
- Q-10(2a): thông báo _chuyển đến_ nhận `employeeCode` khớp chính xác; server trả mã + họ tên để xác nhận; phòng đích = phòng người gửi đang làm trưởng.
- Hồi quy: `US-03-10` AC-4 (nay dùng được thật), `US-01-01` AC-23 (tạo tài khoản mặc định `EMPLOYEE`), `US-01-03` (đổi vai).
- Code ở `3e4553b9`: `account-management.dto.ts:11-19` (`requestedRoleSchema = appRoleSchema` đủ 6 vai, `loginEmail` tùy chọn); `account-invitation.service.ts:72-74` (`loginEmail ?? workEmail`); `employee.dto.ts:60` (`jobTitle` max 1000) vs `employee-placement.policy.ts:11` (255); `cost-center.dto.ts:13,22` (`kind`); `me.dto.ts:18`, `account-management.dto.ts:63` (`roles[]`); `transfer-guard.service.ts:71` (`successor` bị bỏ qua khi không phải trưởng phòng — dùng chung cho điều chuyển và nghỉ việc); `notice.dto.ts:30-36`, `notice.policy.ts:51-63` (`employeeId` + `targetDepartmentId` cho _chuyển đến_).

## Explicit out of scope

- Lệnh vận hành `reset-credentials --new-login-email` (giữ — Super Admin là ca riêng, `QĐ-93e`).
- Kiểm tên miền email công ty (phương án 1b — không chọn).
- Gỡ `roles[]` khỏi response: giữ (deprecated, đúng một phần tử) tới CP-2.

## Dependencies and blockers

- `qd96-100-people-read-scope` merge trước (cùng `notice.*`). Không migration.

## Ownership: module, data, API

| operationId                                                                  | Trường                                             | Đổi                                                                                                                                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appUserCreate`                                                              | `role`                                             | enum `IT_ADMIN, FINANCE, MANAGER, EMPLOYEE` (mặc định `EMPLOYEE`)                                                                                        |
| `appUserCreate`                                                              | `loginEmail`                                       | **bỏ** (strict ⟹ 422); email đăng nhập = `workEmail` của hồ sơ; không có ⟹ 422 `APP_USER.LOGIN_EMAIL_REQUIRED` (giữ mã, đổi mô tả _work email required_) |
| `appUserChangeRole`                                                          | `role`                                             | bỏ `SUPER_ADMIN` (giữ `SPENDING_APPROVER`)                                                                                                               |
| `meGet`, `appUserGet`, `appUserList`                                         | `role`                                             | **thêm** `role: AppRole` (non-null); `roles[]` giữ deprecated                                                                                            |
| `employeeCreate`, `employeeUpdate` (và cột file import nếu cùng schema)      | `jobTitle`                                         | `max(JOB_TITLE_MAX_LENGTH)` = 255                                                                                                                        |
| `costCenterCreate`                                                           | `kind`                                             | **bỏ** (server ghi `UNIT`)                                                                                                                               |
| `costCenterList`                                                             | query `kind`                                       | **bỏ**                                                                                                                                                   |
| `departmentTransferRecord/Reschedule`, `offboardingCaseRecord/ChangeLastDay` | `successor`                                        | người rời/chuyển **không** làm trưởng phòng mà gửi `successor` ⟹ 422 `<MODULE>.SUCCESSOR_NOT_EXPECTED`                                                   |
| `personnelNoticeSend`                                                        | `employeeId`, `employeeCode`, `targetDepartmentId` | kind `DEPARTMENT_TRANSFER_IN`: bắt buộc `employeeCode`, cấm `employeeId` và `targetDepartmentId`; kind khác: như cũ (`employeeId`, không `employeeCode`) |

## Behavior and design

1. **Thông báo chuyển đến.** DTO: `employeeId` và `employeeCode` (trim, 1–50) cùng tùy chọn, `superRefine` theo `kind`. Service: tìm người gửi đang làm trưởng phòng ⟹ phòng đích; `OrganizationReadApi.findEmployeeByCode(code)` khớp **chính xác** cột `employee_code` sau trim (không tìm gần đúng, không liệt kê). Không có, hoặc `TERMINATED` ⟹ 422 `PERSONNEL_NOTICE.EMPLOYEE_NOT_FOUND` (cùng một mã cho hai ca để không lộ ai đã nghỉ); đã thuộc phòng đích ⟹ `KIND_NOT_ALLOWED` như cũ. Response hiện có đã chứa `employee { id, employeeCode, fullName }` — đó là phần _xác nhận_; người gửi sai người thì rút (`personnelNoticeWithdraw`). Audit giữ như cũ.
2. **Tạo tài khoản**: đọc `workEmail` sau khóa employee như hiện có (`account-invitation.service.ts:69-74`), bỏ nhánh `input.loginEmail`.
3. **`successor` thừa**: `transfer-guard.service.ts` `successorFacts` trả cờ `unexpected` khi `!required && chosen !== undefined`; policy điều chuyển và nghỉ việc từ chối trước khi ghi. `successor: { kind: 'NONE' }` khi không cần cũng bị từ chối (gửi thừa).
4. Không đổi hành vi đọc nào khác; `role` lấy từ grant hiệu lực duy nhất (`QĐ-95a`).

## Test matrix

| AC / rủi ro           | Tình huống (gồm từ chối, edge case)                                                                                                | Cấp test | Kết quả mong đợi                                                                                 | Bằng chứng sau implement |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ | ------------------------ |
| L-461                 | Tạo tài khoản `role=SUPER_ADMIN` / `SPENDING_APPROVER`; đổi vai `SUPER_ADMIN`                                                      | HTTP     | 422 `VALIDATION_ERROR`                                                                           | planned                  |
| L-462                 | Tạo tài khoản có `loginEmail`; hồ sơ không `workEmail`; có `workEmail`                                                             | HTTP     | 422 / 422 `LOGIN_EMAIL_REQUIRED` / 201, email đăng nhập = `workEmail`                            | planned                  |
| L-463                 | `jobTitle` 256 ký tự (gồm ký tự nhiều byte)                                                                                        | HTTP     | 422 ở DTO                                                                                        | planned                  |
| L-464                 | `costCenterCreate` có `kind`; list có `kind`                                                                                       | HTTP     | 422; tạo không `kind` ⟹ `UNIT`                                                                   | planned                  |
| L-465                 | `meGet`, `appUserGet`, `appUserList`                                                                                               | HTTP     | `role` = phần tử duy nhất của `roles`                                                            | planned                  |
| L-466                 | Điều chuyển/nghỉ việc người không làm trưởng phòng kèm `successor`                                                                 | HTTP     | 422 `SUCCESSOR_NOT_EXPECTED`; trưởng phòng thiếu `successor` như cũ                              | planned                  |
| L-512 / US-03-10 AC-4 | `H2` (P-FIN) gửi _chuyển đến_ bằng `NV-0012`                                                                                       | HTTP     | 201, phòng đích P-FIN, response có mã + họ tên                                                   | planned                  |
| L-512                 | Mã không có / người đã nghỉ / người đã ở P-FIN / gửi kèm `employeeId` hoặc `targetDepartmentId` / người gửi không làm trưởng phòng | HTTP     | 422 `EMPLOYEE_NOT_FOUND` (hai ca đầu cùng mã) / `KIND_NOT_ALLOWED` / 422 / `NOT_DEPARTMENT_HEAD` | planned                  |

## Definition of Done

- [ ] Mọi dòng test matrix đỏ-trước/xanh-sau; quick set, `test:http`, `openapi:export`, `test:e2e` (đăng nhập/tạo tài khoản) xanh.
- [ ] README `identity-access`, `organization`, `personnel` cập nhật; FE được báo (form tạo tài khoản, Cost Center, thông báo chuyển đến).

## Changes and acceptance

- 05/11/2026: tạo spec (`draft`). Chưa nghiệm thu.
- 05/11/2026 — chỉnh 05/11 theo review main flow: mức FE-tonight **B**, không đổi thiết kế.
- 05/11/2026 (điều phối viên, gỡ lỗi `rules:check`): dòng `n/a` nêu hạng mục phía sau `qd96-100-manager-employee-detail`. Không đổi thiết kế.

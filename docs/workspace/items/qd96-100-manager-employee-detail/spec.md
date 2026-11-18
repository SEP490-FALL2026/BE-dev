# Spec: qd96-100-manager-employee-detail — trưởng phòng xem chi tiết một nhân viên trong phòng

- Phụ trách: AI theo giao việc Owner (05/11/2026).
- Thiết kế ban đầu bởi: AI (agent C-SPEC-P) theo yêu cầu trực tiếp của Owner (QUESTIONS.md mục D, dòng _Mới_, 05/11/2026).
- Thiết kế: `draft`. Owner review: chưa review.
- **Mức FE-tonight: `A`** (Owner nâng từ `B` 05/11/2026 tối) — không phải bước của 5 main flow; độc lập (3 GET mới, không migration).
  Contract ở bảng dưới là contract cuối cùng cho FE (màn chi tiết nhân viên của trưởng phòng).
- Owner chốt 05/11/2026 (OQ-29-1 = B): một GET chi tiết + hai subresource có phân trang `…/{employeeId}/software-rights`, `…/{employeeId}/open-requests` — thay cho một GET gộp, để đúng API-LIST-DETAIL.1 (số quyền/Request của một người không có business maximum).
- Nguồn: Docs `3d73a7f` (`QĐ-41c`(2), `QĐ-87b`(4), `QĐ-95a`; rule `docs/rules/api-contract.md` API-LIST-DETAIL.1), BE `3e4553b9`.
- Nhóm roadmap: bó finding `qd96-100-alignment` (track P, mục 6 của ITEMS) — không thuộc nhóm G (Docs ở pin chưa có Story).
- [Kế hoạch](plan.md).

## Business outcome

Trưởng phòng đang làm trưởng phòng `P` hôm nay mở được hồ sơ một nhân viên đang ở `P`: đúng các trường `QĐ-41c`(2), các quyền
phần mềm người đó đang giữ (phần mềm, gói, ngày cấp, ngày kết thúc) và các Request đang mở của người đó trong `P`; không có email,
loại hợp đồng hay số tiền. Kiểm bằng HTTP contract theo vai và test đếm câu lệnh.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (track P) — chỉ là container.
- Mode: `technical-enabler`.
- Outcome and owner: bản đọc _chi tiết nhân viên cho trưởng phòng_; capability mới `personnel/department-member` (T6 — đọc được `organization`, `licensing`, `requests` qua facade; `organization` ở T2 không đọc được hai module trên).
- Boundaries: 3 operation `GET` mới, 2 phương thức facade đọc mới (`licensing`, `requests`); không bảng, không migration, không ghi.
- Not larger: danh sách thành viên (`departmentMemberList`) và phép chiếu của nó là `qd96-100-people-read-scope`.
- Not smaller: hồ sơ, quyền đang giữ và Request mở là một màn của một người, cùng một kiểm phạm vi.
- Siblings: `qd96-100-people-read-scope`, `qd96-100-account-org-api-fields` (trước).
- Scope map: n/a — bó finding ngoài nhóm G.

## Primary Story/AC

| Story | AC              | Coverage | Phần còn lại thuộc                                                                                                  |
| ----- | --------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| —     | OWNER-05-11-#29 | n/a      | gỡ chặn màn chi tiết nhân viên của trưởng phòng ở FE (L-981); khi Docs thêm Story/AC thì chuyển sang `single-story` |

## Supporting references

- Owner (05/11/2026): `GET /departments/{id}/employees/{employeeId}` cho trưởng phòng — trường `QĐ-41c`(2) + quyền phần mềm đang giữ + Request đang mở của người đó trong phòng; không email, loại hợp đồng, tài chính.
- `QĐ-41c`(2): `id`, mã, họ tên, trạng thái lưu trữ nguyên giá trị, có email công việc hay không, ngày bắt đầu hiện hành; không cờ bàn giao, không ngày nghỉ việc.
- Code ở `3e4553b9`: `departmentMemberList` + kiểm trưởng phòng `memberReadVerdict` (`organization/department-management/department-query.service.ts:115-133`); quyền cá nhân `LicensingApi.listPersonalSeatsOf` (không phân trang, trả cả `grantReason`, `revocationNote` — `licensing/public/licensing.types.ts:308-324`); Request mở `RequestsApi.listOpenOfBeneficiary` (phân trang, không lọc phòng — `requests/public/requests.api.ts:20-26`; `access_requests.department_id` có ở `prisma/models/requests.prisma:150`); mẫu đọc chéo ở `personnel/offboarding/open-requests/open-requests.service.ts`.

## Explicit out of scope

- Super Admin, IT Admin, Finance dùng route này (họ có bản đọc riêng). Lịch sử quyền đã kết thúc, tài khoản dịch vụ người đó chịu trách nhiệm, chi phí.
- Thao tác từ màn này (thu hồi, rà soát) — đi qua route hiện có.

## Dependencies and blockers

- `qd96-100-account-org-api-fields` merge trước (thứ tự track P; không phụ thuộc kỹ thuật). Không migration.

## Ownership: module, data, API

- Capability mới `personnel/department-member/` (`department-member.controller.ts`, `.service.ts`, `.dto.ts`, `.policy.ts`, `.errors.ts`, `.http-errors.ts`); không repo (chỉ facade).
- Facade mới: `LicensingApi.pageHeldSoftwareOf(employeeId, onDate, page)` → `{ items: { assignmentId, applicationName, planName, grantedOn, endsOn }[], total }` (chỉ Assignment cá nhân đang hiệu lực `effectiveFrom ≤ onDate`, thứ tự `effective_from, id`, projection ở SQL); `RequestsApi.listOpenOfBeneficiary(employeeId, page, tx, { departmentId })` (tham số lọc tùy chọn — đổi tương thích).
- Đọc tổ chức: `OrganizationReadApi.getHeadedDepartment`, `getEmployeePlacement`, `getEmployee`.

| operationId                         | Route                                                                   | Response `data`                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `departmentMemberGet`               | `GET /api/v1/departments/{id}/employees/{employeeId}`                   | `{ employeeId, employeeCode, fullName, status, hasWorkEmail, memberSince, heldSoftwareCount, openRequestCount }` |
| `departmentMemberSoftwareRightList` | `GET …/{employeeId}/software-rights?page&pageSize` (≤ 100, mặc định 20) | `items[{ assignmentId, applicationName, planName, grantedOn, endsOn \| null }]`, `pagination`                    |
| `departmentMemberOpenRequestList`   | `GET …/{employeeId}/open-requests?page&pageSize` (≤ 100)                | `items[{ requestId, type, state, applicationName \| null, planName \| null, submittedAt, group }]`, `pagination` |

## Behavior and design

1. **Quyền** (`@RequireRoles('MANAGER')`): người gọi phải là trưởng phòng của `{id}` hôm nay, khác ⟹ 403 `DEPARTMENT_MEMBER.OUT_OF_SCOPE`; phòng không có ⟹ 404 `NOT_FOUND`; `{employeeId}` không có kỳ xếp phòng ở `{id}` hôm nay ⟹ 404 `DEPARTMENT_MEMBER.NOT_FOUND` (không phân biệt _không tồn tại_ với _ở phòng khác_). Trưởng phòng xem chính mình: cho phép (thành viên phòng).
2. **Chiếu dữ liệu**: không `workEmail`, `employmentType`, `jobTitle`, `workState`, giá, số tiền, `grantReason`, `revocationNote`, người yêu cầu. `status` nguyên giá trị (`ACTIVE`/`TERMINATED`).
3. **Đếm câu lệnh**: detail = hằng (2 đếm theo lô); mỗi subresource = hằng theo cỡ trang (đếm + trang cùng snapshot `RepeatableRead`, tên ứng dụng/gói gom theo lô). Thứ tự: phần mềm `grantedOn, assignmentId`; Request `submittedAt, requestId` (như `listOpenOfBeneficiary`).
4. Gate collection: hai subresource khai summary schema riêng, `pageSize.maximum = 100`; detail không có mảng lồng.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                                                 | Cấp test                  | Kết quả mong đợi                                                                                     | Bằng chứng sau implement                                                                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #29         | `H1` (trưởng P-DES) xem `E1` ở P-DES có Figma, Slack và 1 Request mở ở P-DES + 1 Request ở phòng cũ | HTTP                      | detail đủ trường `QĐ-41c`(2), `heldSoftwareCount=2`, `openRequestCount=1`; subresource trả đúng dòng | verified-local: `test/integration/personnel/department-member-read.integration-spec.ts` (3 test đầu; cả file 20/20 xanh)                                                                         |
| #29         | Response không có `workEmail`, `employmentType`, tiền, `workState`                                  | HTTP (schema strict)      | không có trường                                                                                      | verified-local: cùng file (khóa đúng tập key, không khớp `workEmail`/`employmentType`/`workState`/`jobTitle`; DTO `z.strictObject`)                                                              |
| Quyền       | `H2` (trưởng P-FIN) xem `E1`; `E1` (Employee) gọi; Super Admin gọi                                  | HTTP                      | 403 `OUT_OF_SCOPE` / 403 / 403                                                                       | verified-local: integration (cả 3 route; thêm IT Admin, Finance, Người duyệt chi) + `test/http/personnel/department-members.http-spec.ts` (401, 403 theo 6 vai)                                  |
| Quyền       | `E1` đã chuyển khỏi P-DES hôm qua; mã không tồn tại                                                 | HTTP                      | 404 `DEPARTMENT_MEMBER.NOT_FOUND` cùng mã                                                            | verified-local: integration (đã chuyển đi, không tồn tại, người phòng khác: cùng `code` + `message`; phòng không có cũng 404 cùng mã)                                                            |
| Biên        | `pageSize=101`                                                                                      | HTTP                      | 422                                                                                                  | verified-local: http-spec (7 ca 422) + integration                                                                                                                                               |
| Query       | subresource ở 2 cỡ dữ liệu                                                                          | integration + query-count | số câu lệnh hằng, không đọc cột chỉ detail cần                                                       | verified-local: integration (detail, software-rights, open-requests: số câu lệnh bằng nhau giữa 2 seat/1 request và 5 seat/3 request; câu lệnh đọc `license_assignments` không có cột của người) |
| Hồi quy     | `listOpenOfBeneficiary` không `departmentId` (MF-2)                                                 | integration               | như cũ                                                                                               | verified-local: test facade trong cùng file (2 request khi không lọc, 1 khi lọc) + `leaver-request-closure`, `leaver-request-closure-group`, `transfer-review-read` xanh (17 test)               |

## Definition of Done

- [x] Mọi dòng test matrix có bằng chứng (bảng trên); gate collection xanh (`api-collection-contract`); `typecheck`, `lint` file đã chạm, `arch:check`, `arch:routes`, `test:gates` (15/16 file; 1 đỏ không thuộc hạng mục này), `test:http` platform + personnel (3 đỏ không thuộc hạng mục này, xem _Changes and acceptance_), `openapi:export` (không đổi vì đã có 3 operation) xanh.
- [x] README `personnel` (capability mới, hướng phụ thuộc R6), `licensing`, `requests` (facade) cập nhật.

## Changes and acceptance

- 05/11/2026: tạo spec (`draft`). Owner chốt OQ-29-1 = B cùng ngày (đổi tên subresource thành `software-rights`, bỏ mục câu hỏi mở). Chưa nghiệm thu.
- 05/11/2026 — chỉnh 05/11 theo review main flow: mức FE-tonight **B** (nâng A nếu Owner cần cho demo), không đổi thiết kế.
- 05/11/2026 (tối) — Owner nâng lên mức **A**; implement xong, `verified` (local, chưa commit) trên nhánh `feat/qd96-100-alignment`. Chưa nghiệm thu.
  Code: `personnel/department-member/` (controller, `department-member-query.service.ts`, policy + spec, dto, errors, http-errors);
  `LicensingApi.pageHeldSoftwareOf` (`RevocationReadRepo.heldPage`, `RevocationViewService.heldSoftwareOf`);
  `RequestsApi.listOpenOfBeneficiary(…, tx, { departmentId })` (`OpenRequestRepo`/`OpenRequestService`). Không migration.
  Lệch/giải thích: (1) `grantedOn` = `validFrom` của Assignment (khác `grantedOn` của _my-software_, vốn null khi ngày chưa thực tế) vì contract bắt buộc
  một ngày; (2) _phòng không có_ trả cùng mã `DEPARTMENT_MEMBER.NOT_FOUND` với _người không ở phòng_ (spec ghi `NOT_FOUND`); (3) `memberSince` đọc qua
  `OrganizationHistoryApi.getPlacementInForce` trong một transaction đọc (cần `validFrom`, `getEmployeePlacement` chỉ trả phòng); (4) phần đếm của detail dùng
  `take: 0` trên hai facade nên Request mở vẫn đọc tên người gửi/gói của trang rỗng (số câu lệnh không đổi theo cỡ dữ liệu).
  Test đỏ ngoài hạng mục thấy khi chạy (không sửa, thuộc chat khác): `test:gates` `architecture-boundaries` (model `DeviceEnrollmentCode` chưa có chủ), `test:http`
  `openapi-read-wording` + `openapi-request-rules` (route `device*`). Con số `toHaveLength(…)` của `openapi-presentation.http-spec.ts` đổi 319 → 322 (đúng 3 operation của hạng mục này).

## Open questions

- Mã lỗi của _phòng không có_: spec ghi `NOT_FOUND` không kèm tiền tố. Đã chọn `DEPARTMENT_MEMBER.NOT_FOUND` (cùng mã với _người không ở phòng_). Nếu Owner muốn `DEPARTMENT.NOT_FOUND` như `GET /departments/{id}`, đổi một dòng trong `department-member.http-errors.ts`.

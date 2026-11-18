# Spec: qd96-100-people-read-scope — IT Admin và trưởng phòng chỉ đọc phần tối thiểu về con người

- Phụ trách: AI theo giao việc Owner (05/11/2026).
- Thiết kế ban đầu bởi: AI (agent C-SPEC-P) theo giao việc Owner (05/11/2026); ledger L-417, L-418, L-419; S-12.
- Thiết kế: `draft`. Owner review: chưa review.
- **Mức FE-tonight: `B`** — chỉ thu hẹp response (trường thành `null` theo vai), không chặn bước nào của 5 flow; FE nên khai các trường
  này nullable ngay khi sinh client để không vỡ khi B xong.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `BM-09` BRD:1456, `BM-04` (IT Admin không xem căn cứ), `FR-2.14`, `FR-8.10(e)`; `QĐ-41c`(2), `QĐ-76d`(4), `QĐ-76e`, `QĐ-80e`, `QĐ-87b`(4)), BE `3e4553b9`.
- Nhóm roadmap: bó finding `qd96-100-alignment` (track P) — không thuộc nhóm G (hardening tối thiểu hóa dữ liệu).
- [Kế hoạch](plan.md).

## Business outcome

Sáu response đang lộ dữ liệu nhân sự vượt vai được thu hẹp: IT Admin chỉ thấy thông báo _nghỉ đột ngột_ trong phạm vi phụ trách với
người, loại, ngày dự kiến (không `note`, `sender`, `rejectReason`, xác minh); không thấy `priorWorkState` của hồ sơ nghỉ việc, cờ
`overdueReturn` của nghỉ dài, `workState`/`lastWorkingDay` của người giữ vai Super Admin; trưởng phòng không thấy `workState` (cờ bàn
giao/nghỉ dài) ở danh sách thành viên. Super Admin đọc như cũ. Kiểm bằng HTTP contract theo từng vai.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (track P) — chỉ là container.
- Mode: `technical-enabler`.
- Outcome and owner: phép chiếu theo vai của các bản đọc nhân sự; capability `personnel/{notice,offboarding,leave,role-duties}`, `organization/department-management`.
- Boundaries: chỉ mapper/query/controller của 6 operation đọc; không bảng, không migration, không route mới.
- Not larger: chi tiết nhân viên cho trưởng phòng là `qd96-100-manager-employee-detail`.
- Not smaller: cùng một quy tắc (`QĐ-87b`(4), `QĐ-41c`(2)) áp lên các bản đọc; tách theo endpoint chỉ thêm thủ tục.
- Siblings: `qd96-100-personnel-grounds-and-reasons` (trước), `qd96-100-account-org-api-fields` (sau).
- Scope map: n/a — bó finding ngoài nhóm G.

## Primary Story/AC

| Story | AC                  | Coverage | Phần còn lại thuộc                                                                                            |
| ----- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| —     | L-417, L-418, L-419 | n/a      | gỡ chặn sinh lại client FE ở CP-2 (L-981) và `qd96-100-manager-employee-detail` (cùng phép chiếu `QĐ-41c`(2)) |

## Supporting references

- S-12: giữ `note` của `BM-09` (giấy tờ người gửi biết); **IT Admin không đọc** `note`, `sender`, `rejectReason`.
- `QĐ-76d`(4): IT Admin chỉ nhận cảnh báo ưu tiên cao khi _nghỉ đột ngột_ (chuẩn bị thu hồi).
- Code ở `3e4553b9`: `personnelNoticeList/Get` cho `IT_ADMIN` (`notice/notice.controller.ts:117,146`), chi tiết trả `note`, `sender`, `rejectReason`, `verification` (`notice.mapper.ts:43-60`), lọc ở `notice-query.service.ts:87`; `priorWorkState` trả cho mọi vai (`offboarding/offboarding.mapper.ts:109`); `overdueReturn` + lọc cho IT Admin (`leave/long-leaves.controller.ts:116-121`); `workState` ở `departmentMemberList` (`organization/department-management/department.dto.ts:121-131`); `superAdminWatchGet` cho `IT_ADMIN` (`role-duties/super-admin-watch.controller.ts:21`, schema `role-duties.dto.ts:17-31`).

## Explicit out of scope

- Thu hẹp nữa cho `MANAGER` ở `personnelNoticeGet` (người gửi đọc thông báo của mình — đúng `BM-09`).
- Đổi route hay tách schema riêng cho từng vai (giữ một schema, trường _nullable_ theo vai — cách đã dùng ở `offboarding.mapper.ts` với cờ `full`).

## Dependencies and blockers

- Không. Không migration. Đứng sau #24 chỉ vì cùng file `offboarding.mapper.ts`/`notice.*`.

## Ownership: module, data, API

| operationId                                                         | Vai bị thu hẹp | Đổi                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `personnelNoticeList`, `personnelNoticeGet`                         | `IT_ADMIN`     | chỉ thông báo có nhịp chặn ngay (`kind = ABRUPT_DEPARTURE` **hoặc** `kind = DEPARTURE` với `event.accessBlockMode = BLOCK_NOW` — R-27) trong phòng phụ trách/đứng thay; loại khác ⟹ list không có, get ⟹ 404; `note`, `sender`, `rejectReason`, `verification`, `defaultItAdminEmployeeId` = `null`; lọc `kind` khác ⟹ trang rỗng |
| `transferReviewList`, `transferReviewGet`, `transferReviewItemList` | `IT_ADMIN`     | chỉ rà soát của phòng IT Admin phụ trách/đứng thay (`getItAdminScope` như `transfer/transfer-query.service.ts:95-103`); hiện `scopeOf` trả `ALL` (`transfer-review/transfer-review-view.service.ts:161`); ngoài phạm vi ⟹ list không có, get/items 404 `NOT_FOUND` (D7)                                                           |
| `offboardingCaseList`, `offboardingCaseGet`                         | `IT_ADMIN`     | `priorWorkState` = `null` (schema `.nullable()`)                                                                                                                                                                                                                                                                                  |
| `longLeaveList`, `longLeaveGet`                                     | `IT_ADMIN`     | `overdueReturn` = `null`; query `overdueReturn` ⟹ 403 `FORBIDDEN` (không bỏ qua lặng lẽ)                                                                                                                                                                                                                                          |
| `departmentMemberList`                                              | `MANAGER`      | `workState` = `null` (Super Admin vẫn thấy)                                                                                                                                                                                                                                                                                       |
| `superAdminWatchGet`                                                | `IT_ADMIN`     | `holder.workState`, `holder.lastWorkingDay` = `null`; giữ `status`, `reasons`                                                                                                                                                                                                                                                     |

## Behavior and design

1. Một hàm thuần mỗi capability, dạng `projectFor(role, wire)`; mapper hiện có nhận vai người gọi (đã có `full` ở offboarding). Không đọc cột rồi bỏ: query của IT Admin cho thông báo lọc `kind` ở SQL (`notice-query.service.ts`), số câu lệnh giữ nguyên.
2. Trường đổi sang `.nullable()` trong schema là đổi hợp đồng mở rộng (client cũ đọc được kiểu `string` thì nay có thể `null`) — báo FE (L-984).
3. Kiểm phạm vi phòng của IT Admin dùng hàm hiện có của notice (phụ trách/đứng thay).

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                         | Cấp test                  | Kết quả mong đợi                                                            | Bằng chứng sau implement |
| ----------- | --------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------- | ------------------------ |
| L-418       | IT Admin list thông báo có cả `DEPARTURE`, `LONG_LEAVE`, `ABRUPT_DEPARTURE` | HTTP                      | chỉ `ABRUPT_DEPARTURE` phòng phụ trách, `note`/`sender`/`rejectReason` null | planned                  |
| L-418       | IT Admin get thông báo `LONG_LEAVE`                                         | HTTP                      | 404                                                                         | planned                  |
| L-418       | Super Admin, trưởng phòng gửi                                               | HTTP                      | như cũ                                                                      | planned                  |
| L-417       | IT Admin get hồ sơ nghỉ việc người từng nghỉ dài                            | HTTP                      | `priorWorkState: null`; Super Admin thấy `ON_LONG_LEAVE`                    | planned                  |
| L-419       | IT Admin list nghỉ dài; với `overdueReturn=true`                            | HTTP                      | `overdueReturn: null`; 403                                                  | planned                  |
| L-419       | Trưởng phòng list thành viên có người đang bàn giao                         | HTTP                      | `workState: null`; Super Admin thấy `HANDING_OVER`                          | planned                  |
| L-419       | IT Admin đọc giám sát Super Admin                                           | HTTP                      | `workState`, `lastWorkingDay` null                                          | planned                  |
| Query       | list thông báo của IT Admin, hai cỡ dữ liệu                                 | integration + query-count | số câu lệnh hằng                                                            | planned                  |

## Definition of Done

- [ ] Mọi dòng test matrix đỏ-trước/xanh-sau; quick set, `test:http`, `openapi:export` (diff 9 op đọc) xanh.
- [ ] README `personnel`, `organization` ghi phép chiếu theo vai; FE được báo trường nullable.

## Changes and acceptance

- 05/11/2026: tạo spec (`draft`). Chưa nghiệm thu.
- 05/11/2026 — chỉnh 05/11 theo review main flow: mức FE-tonight **B**; áp C-REVIEW R-27 (IT Admin thấy cả thông báo `DEPARTURE` nhịp
  `BLOCK_NOW` của #3).
- 05/11/2026 (chỉnh 05/11 theo review main flow — vòng FIELDS): D7 — IT Admin đọc rà soát điều chuyển theo phòng phụ trách (cùng hàm với `department-transfers`);
  mức **B**, plan Task 4.

# Spec: trưởng phòng mới rà soát công cụ ngoài bộ chuẩn sau điều chuyển

- Phụ trách: AI theo giao việc của người dùng (24/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (24/10/2026).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G6 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Khi một điều chuyển đổi phòng có hiệu lực, hệ thống so quyền người mới chuyển đến với bộ công cụ chuẩn của phòng nhận: tất cả trong bộ thì giữ hết, có công cụ ngoài bộ thì mở một phiên rà soát cho trưởng phòng mới trong 5 ngày làm việc để quyết từng công cụ (_còn cần_, _không còn cần_, _cần công cụ mới_); quá hạn chỉ nhắc và cảnh báo, không bao giờ tự thu hồi, giao lại hay quyết thay; _không còn cần_ mở thu hồi nguồn _sau điều chuyển_ cho IT Admin. Kiểm bằng ca E1 chuyển vào `P-FIN` giữ Excel, Jira và Figma.

## Sizing decision

- Container: G6 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: phiên rà soát công cụ ngoài bộ chuẩn của trưởng phòng mới và nguồn thu hồi _sau điều chuyển_; capability `personnel/transfer-review`.
- Boundaries: một transaction mỗi lệnh trên `transfer_reviews`, `transfer_review_items` và (khi _không còn cần_) tác vụ thu hồi qua cổng của `licensing`; chỉ trưởng phòng hiệu lực của phòng nhận quyết; IT Admin chỉ đọc; không đổi giai đoạn hay Assignment.
- Not larger: ghi điều chuyển, người chịu trách nhiệm tài khoản dịch vụ, xác nhận bàn giao dữ liệu và thực thi thu hồi đã có hạng mục riêng; hạng mục này chỉ mở phiên khi nhận sự kiện và ghi quyết định.
- Not smaller: phiên rà soát và nguồn thu hồi _sau điều chuyển_ cùng một quyết định _không còn cần_, cùng một bản ghi, cùng một người quyết; tách ra không kiểm được riêng.
- Siblings: `g6-transfer-record`, `g6-revocation-by-grant-kind`, `g6-handover-confirmation`, `g6-downstream-integration`, `g3-downstream-finance-integration`.
- Scope map: [G6](../../../roadmap.md#work-item-decomposition-g6).

## Primary Story/AC

| Story    | AC                     | Coverage | Phần còn lại thuộc                                                                                                                                                                                         |
| -------- | ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-03-07 | AC-1→AC-9, AC-11→AC-15 | partial  | AC-10: `g3-downstream-finance-integration`; vế chi phí tính vào Cost Center của phòng nhận ở AC-3: `g6-downstream-integration`                                                                             |
| US-07-05 | AC-9                   | partial  | AC-1→AC-5, AC-8, AC-11, AC-12, AC-15, AC-17→AC-19: `g6-revocation-by-grant-kind`; AC-13, AC-16: `g6-handover-confirmation`; AC-6, AC-7: `g4-device-dependent-features`; AC-10: `g6-downstream-integration` |

## Supporting references

`FR-3.8`, `FR-3.18`, `FR-2.4`, `QĐ-50b`, `QĐ-55b`, `QĐ-56a`, `QĐ-62c`, `QĐ-62f`, `QĐ-62p`(3), `QĐ-66p`, `QĐ-77k`; `OQ-A-17` (a→d, mặc định của spec bên dưới, chưa phải Owner chọn); `US-03-01`, `US-04-10`, `US-01-04` (`TRANSFER_REVIEW_WORKING_DAYS` đã có), `US-12-13`.

## Explicit out of scope

- Ghi điều chuyển, giai đoạn thành viên và xác định lại bước nhu cầu: `g6-transfer-record` (phát sự kiện), `g5-step-reassignment-and-controlled-wait`.
- Bước xác nhận bàn giao dữ liệu của trưởng phòng mới và hạn ngắn (`AC-4`, `AC-14` vế cổng): `g6-handover-confirmation` làm bước xác nhận; hạng mục này chỉ mở thu hồi nguồn `TRANSFER_REVIEW` và để hook của hạng mục đó mở việc.
- Thực thi thu hồi, K5 thu hồi ngoài hệ thống kèm bằng chứng, seat trống: `g6-revocation-by-grant-kind`.
- Chi phí chia theo ngày trong lúc chờ quyết (`AC-10`, vế chi phí của `AC-3`, `QĐ-55b`, `US-12-13`): G8. Ở đây chỉ bảo đảm quyền giữ nguyên và Cost Center suy ra từ phòng theo ngày.
- Nhận định bằng usage và ghost seat (`EP-10`), gợi ý AI (`QĐ-52e`); tự tạo Request cho _cần công cụ mới_ (`AC-5`: nhân viên tự gửi theo luồng thường, `g5-request-submission-and-routing`).
- Cấu hình bộ công cụ chuẩn: `g3-standard-toolset`.

## Dependencies and blockers

`g6-transfer-record` (sự kiện `PLACEMENT_START`, hàm ngày làm việc), `g6-revocation-by-grant-kind` (`openRevocation`, `listPersonalSeatsOf`), `g6-handover-confirmation` (mở bước xác nhận theo hook; chưa có thì `AC-4`, `AC-14` kiểm phần mở thu hồi, bước xác nhận kiểm ở hạng mục đó), `g3-standard-toolset` (bộ chuẩn theo phòng và chức vụ), `g2-department-profile`, `g2-operating-parameters` (`TRANSFER_REVIEW_WORKING_DAYS`). Không có blocker ngoài; câu `OQ-A-17` áp mặc định của spec, chưa phải Owner chọn. Một migration.

**Ghi chú 24/10/2026 (`g6-transfer-record` đã implement, `verified` ở local):** `OrganizationService.registerChangeListener` nhận `PLACEMENT_START` của điều chuyển: ngày hôm nay phát ngay trong transaction của lệnh ghi, ngày tới do `OrganizationChangeSweeper` (mỗi giờ, đồ thị API) phát đúng một lần; điều chuyển chỉ đổi chức vụ cũng phát với `fromDepartmentId === toDepartmentId` nên người nghe đổi phòng phải bỏ qua. Đăng ký listener trong `onModuleInit` của module nghe; listener phải idempotent theo `change.id` (là id dòng `organization_change_announcements`).

## Ownership: module, data, API

- **Module `personnel`, capability `transfer-review/`:** `transfer-review.policy.ts` (thuần: công cụ nào ngoài bộ, hạn, ai quyết, quyết định nào cho phép), `transfer-review.service.ts` (mở phiên khi nhận sự kiện, ghi quyết định, đóng phiên), `transfer-review.listener.ts` (đăng ký `OrganizationChangeListener` ở `onModuleInit`), `transfer-review.repo.ts`, `transfer-review.controller.ts`, `transfer-review.sweeper.ts` (nhắc quá hạn một lần), DTO, lỗi HTTP, mapper.
- **Module `catalog`:** `CatalogService.getStandardToolsetPlanIds(departmentId, jobTitleId, tx?)` (thêm mới, chỉ đọc: tập gói của bộ chuẩn, rỗng khi cặp chưa có bộ).
- **Module `licensing`:** dùng `listPersonalSeatsOf` và `openRevocation` (từ `g6-revocation-by-grant-kind`).
- **Dữ liệu (một migration `20261024160000_personnel_transfer_reviews`):** enum `TransferReviewStatus` (`OPEN`, `COMPLETED`, `SUPERSEDED`), `TransferReviewDecision` (`PENDING`, `STILL_NEEDED`, `NOT_NEEDED`, `NEEDS_NEW_TOOL`); `transfer_reviews` (`id`, `organization_id`, `employee_id`, `transfer_id` null, `placement_id` unique, `department_id`, `job_title_id`, `effective_on`, `due_on`, `status`, `opened_at`, `completed_at`, `overdue_noticed_at`); `transfer_review_items` (`review_id`, `assignment_id`, `plan_id`, `position`, `decision`, `decided_by_employee_id`, `decided_at`, `new_tool_note`, `revocation_task_id` null; khóa chính `(review_id, assignment_id)`); `CHECK` đồng bộ quyết định với người/lúc quyết, ghi một lần (trigger cấm đổi quyết định đã ghi).
- **API (thêm 4):** `GET /transfer-reviews` (`transferReviewList`), `GET /transfer-reviews/{id}` (`transferReviewGet`), `GET /transfer-reviews/{id}/items` (`transferReviewItemList`), `POST /transfer-reviews/{id}/decisions` (`transferReviewDecide`); đều `@AuthenticatedOnly()` rồi kiểm ở use case (trưởng phòng quyết; `IT_ADMIN` chỉ đọc).
- **Audit:** `TRANSFER_REVIEW.OPENED`, `TRANSFER_REVIEW.DECIDED`, `TRANSFER_REVIEW.COMPLETED`, `TRANSFER_REVIEW.OVERDUE`, `TRANSFER_REVIEW.SUPERSEDED`.

## Behavior and design

**Mở phiên (`AC-1`, `AC-2`, `AC-8`, `AC-10`).** Listener nhận `PLACEMENT_START` có `fromDepartmentId` khác `toDepartmentId` (đổi chức vụ cùng phòng không phát đổi phòng nên không mở phiên, `AC-8`: quyền giữ nguyên, bộ chuẩn mới chỉ áp cho yêu cầu mới). Trong transaction của thay đổi: đọc các Assignment cá nhân còn mở của người đó (`listPersonalSeatsOf(employeeId, effectiveOn)`, bỏ Assignment dịch vụ), đọc `getStandardToolsetPlanIds(toDepartmentId, toJobTitleId)` rồi xếp công cụ **ngoài bộ** theo `plan_id` (quyết định thiết kế do người phụ trách chọn, chưa phải quyết định của Owner: cùng ứng dụng khác gói thì ngoài bộ — `OQ-A-17`(d)). Không có công cụ ngoài bộ thì không tạo phiên và trưởng phòng không có việc (`AC-1`); bộ chuẩn rỗng hoặc cặp chưa có bộ thì mọi công cụ là ngoài bộ (hệ quả `US-03-01` AC-17). Có thì tạo một phiên (unique theo `placement_id` nên sự kiện lặp không tạo hai phiên): `due_on = addWorkingDays(effectiveOn, TRANSFER_REVIEW_WORKING_DAYS)` — ngày hiệu lực không tính, tức hiệu lực thứ Sáu 16/10 với 5 ngày thì hạn thứ Sáu 23/10 (`OQ-A-17`(b), mặc định của spec); mỗi công cụ ngoài bộ một dòng `PENDING`; công cụ trong bộ giữ, không dòng, không tác vụ thu hồi nào được tạo (`AC-2`). Phiên cũ còn `OPEN` của cùng nhân viên thành `SUPERSEDED` khi có điều chuyển đổi phòng mới. Quyền Figma giữ nguyên tới khi trưởng phòng quyết (`AC-2`, `AC-10`).

**Ai quyết (`AC-7`, `AC-9`).** Người quyết suy ra khi đọc và khi quyết là trưởng phòng hiệu lực **hôm nay** của phòng nhận (`getDepartmentHeads`). Trưởng phòng cũ, IT Admin, approver dự phòng, Finance và bất kỳ ai khác nhận `403 TRANSFER_REVIEW.NOT_REVIEWER`, phiên không đổi. Phòng nhận chưa có trưởng phòng: phiên **chờ**, không giao ai (`waitingReason = NO_HEAD`, approver dự phòng không nhận); IT Admin và Super Admin thấy `departmentWarningList` sẵn có kèm phiên đang chờ; khi `H6` được gán ngày 14/10 thì phiên mở cho `H6` mà `due_on` vẫn tính từ ngày hiệu lực 12/10 (`AC-7`, `QĐ-62c`, không đặt lại).

**Quyết từng công cụ (`AC-3`→`AC-6`, `AC-11`, `AC-13`, `AC-14`).** `POST …/decisions { assignmentId, decision, newToolNote? }`, một transaction, phiên khóa `FOR UPDATE`: quyết định ghi một lần (`409 DECISION_ALREADY_RECORDED`, mặc định của spec cho câu "đổi được quyết định không" — `OQ-A-17`(b)); phiên phải `OPEN` (`409 NOT_OPEN`) và nhân viên chưa nghỉ việc (`409 EMPLOYEE_LEFT`, các quyền còn lại đi theo danh sách thu hồi của hồ sơ nghỉ việc).

- `STILL_NEEDED` (`AC-3`): quyền giữ nguyên, công cụ thôi nằm trong rà soát, audit ghi người quyết, lựa chọn, thời điểm; chi phí về Cost Center của phòng nhận do G8 tính theo ngày từ ngày hiệu lực.
- `NOT_NEEDED` (`AC-4`, `AC-11`, `AC-14`, `US-07-05` AC-9): gọi `LicensingService.openRevocation` với nguồn `TRANSFER_REVIEW`, người quyết là trưởng phòng mới (`decidedRole = DEPARTMENT_HEAD`) và `context.departmentId` của phòng nhận; lưu `revocation_task_id`. Gói có lưu ý mất dữ liệu: hook của `g6-handover-confirmation` mở bước xác nhận cho **trưởng phòng mới** (không phải IT Admin, không phải trưởng phòng cũ) và việc gỡ giữ tới khi xác nhận hoặc hết hạn ngắn rồi đi tiếp có cờ; gói không có lưu ý mất dữ liệu chỉ **hiện** lưu ý và tác vụ tới IT Admin ngay. Phần mềm nội bộ K5: tác vụ thu hồi thủ công, IT thu hồi ngoài hệ thống rồi xác nhận kèm bằng chứng, không thuê bao hay hóa đơn nào đổi. K3, K4: `409 REVOCATION_NOT_SUPPORTED`, quyết định không ghi. Chưa quyết thì **không** có tác vụ thu hồi nào (`US-07-05` AC-9).
- `NEEDS_NEW_TOOL` (`AC-5`): ghi nhu cầu (và `newToolNote` ≤ 500 ký tự), **không** tự tạo Request hay cấp quyền; nhân viên tự gửi yêu cầu theo luồng thường và Request đi qua bước nhu cầu của trưởng phòng. Quyền hiện có giữ nguyên trong lúc chờ (`OQ-A-17`(c), mặc định của spec).
- Khi mọi công cụ đã quyết (`AC-13`: quyết hai trong ba thì công cụ thứ ba còn mở, cùng hạn), phiên `COMPLETED` với `completed_at`.

**Quá hạn (`AC-6`, `AC-12`).** `due_on < hôm nay` mà phiên còn `OPEN`: danh sách có cờ `overdue` kèm số ngày quá hạn; mỗi giờ `TransferReviewSweeper` ghi `overdue_noticed_at` và audit `TRANSFER_REVIEW.OVERDUE` đúng một lần (điểm gọi: nhắc trưởng phòng và cảnh báo IT Admin phụ trách phòng nhận, cho `g4-notification-delivery`). Quá hạn **chỉ** nhắc và cảnh báo: không tự thu hồi, không giao lại, không tự quyết, phiên vẫn mở và trưởng phòng quyết được sau đó. Cảnh báo cho phòng chưa có trưởng phòng ở hạn (`OQ-A-17`(a)): chỉ cảnh báo _thiếu trưởng phòng_ sẵn có, không thêm cảnh báo quá hạn cho IT Admin khi phiên đang chờ — mặc định của spec, chưa phải Owner chọn.

**Đọc.** `GET /transfer-reviews`: người gọi là trưởng phòng thấy phiên của phòng mình quản lý hiện nay; `IT_ADMIN` thấy tất cả chỉ xem; lọc `status`, `overdue`, `departmentId`, `employeeId`; dòng tóm tắt (nhân viên mã/tên, phòng nhận, `effectiveOn`, `dueOn`, `status`, số công cụ còn chờ, `waitingReason`, `overdue`); phân trang `page`/`pageSize` (tối đa 100), thứ tự `due_on`, `id`. Chi tiết `GET …/{id}`; dòng công cụ là subresource phân trang `GET …/{id}/items` (công cụ, gói, kiểu cấp, lý do cấp ban đầu lấy từ `reason` của Assignment, quyết định). Trưởng phòng không thấy usage thô hay hoạt động (chỉ lý do cấp; usage summary là G7). Số câu lệnh không phụ thuộc số dòng (gom gói và nhân viên theo lô).

**Lỗi.** `TRANSFER_REVIEW.NOT_FOUND` `404` (cả với người không liên quan), `.NOT_REVIEWER` `403`, `.ITEM_NOT_FOUND` `404`, `.DECISION_ALREADY_RECORDED` `409`, `.NOT_OPEN` `409`, `.EMPLOYEE_LEFT` `409`, `.REVOCATION_NOT_SUPPORTED` `409`; `VALIDATION_ERROR` `422` cho quyết định lạ.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):** bốn mặc định cho `OQ-A-17` nêu trên (cảnh báo khi thiếu trưởng phòng, cách đếm 5 ngày không tính ngày hiệu lực và quyết định ghi một lần, quyền giữ nguyên khi chọn _cần công cụ mới_, gói khác của cùng ứng dụng là ngoài bộ); phiên cũ thành `SUPERSEDED` khi có điều chuyển đổi phòng mới; không quyết được khi nhân viên đã nghỉ việc.

## Test matrix

| AC / rủi ro      | Tình huống (gồm từ chối, edge case)                                       | Cấp test                 | Kết quả mong đợi                                                                                            | Bằng chứng sau implement                                                       |
| ---------------- | ------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| US-03-07 AC-1    | E1 vào `P-FIN`, giữ đúng Excel và Jira thuộc bộ chuẩn, sự kiện phát       | integration              | không phiên, `H2` không việc, hai quyền giữ                                                                 | `transfer-review-open` xanh (24/10/2026)                                       |
| US-03-07 AC-2    | thêm Figma ngoài bộ; hiệu lực 16/10                                       | integration              | phiên cho `H2` chỉ với Figma, `due_on` = 5 ngày làm việc sau hiệu lực, không tác vụ thu hồi, Excel/Jira giữ | `transfer-review-open` (hôm nay và ngày tới qua sweep) xanh                    |
| US-03-07 AC-3    | `H2` chọn `STILL_NEEDED`                                                  | integration              | quyền nguyên, dòng đã quyết, audit người/lựa chọn/lúc; phiên hoàn tất khi hết dòng                          | `transfer-review-decide` xanh                                                  |
| US-03-07 AC-4    | Figma gói K2 có lưu ý mất dữ liệu, `NOT_NEEDED`; quá hạn ngắn             | integration              | tác vụ nguồn `TRANSFER_REVIEW`, bước xác nhận cho `H2` (không IT Admin), quá hạn đi tiếp có cờ              | `transfer-review-decide` xanh (hạn ngắn đi tiếp có cờ)                         |
| US-03-07 AC-5    | `NEEDS_NEW_TOOL`                                                          | integration              | ghi nhu cầu, không Request, không cấp quyền                                                                 | `transfer-review-decide` xanh                                                  |
| US-03-07 AC-6    | quá 5 ngày làm việc chưa quyết                                            | integration              | `overdue`, audit `OVERDUE` một lần, quyền giữ, không thu hồi/giao lại/quyết; quyết sau đó được              | `transfer-review-decide` xanh                                                  |
| US-03-07 AC-7    | `P-OPS` chưa có trưởng phòng; gán `H6` ngày 14/10                         | integration              | `NO_HEAD`, không giao approver dự phòng; `H6` nhận, hạn tính từ 12/10                                       | `transfer-review-open`, `transfer-review-decide` xanh                          |
| US-03-07 AC-8    | `Designer` → `Senior Designer` cùng `P-DES`                               | integration              | không phiên, quyền giữ                                                                                      | `transfer-review-open` xanh                                                    |
| US-03-07 AC-9    | `H1` (cũ), IT Admin, approver dự phòng quyết                              | e2e                      | `403 NOT_REVIEWER`, phiên không đổi                                                                         | `transfer-review-decide` (HTTP, PostgreSQL) + `transfer-reviews.e2e-spec` xanh |
| US-03-07 AC-11   | K5 _Cổng báo cáo nội bộ_ ngoài bộ, `NOT_NEEDED`                           | integration              | tác vụ thu hồi thủ công, không thuê bao/hóa đơn đổi                                                         | `transfer-review-decide` xanh                                                  |
| US-03-07 AC-12   | phiên quá hạn, IT Admin mở danh sách                                      | integration              | mục quá hạn kèm nhân viên, phòng nhận, công cụ còn mở, ngày quá hạn; audit nhắc                             | `transfer-review-decide`, `transfer-review-read` xanh                          |
| US-03-07 AC-13   | ba công cụ, quyết hai                                                     | integration              | công cụ thứ ba còn mở cùng hạn; quyết nốt thì `COMPLETED`                                                   | `transfer-review-decide` xanh                                                  |
| US-03-07 AC-14   | gói Canva có lưu ý không mất dữ liệu, và gói không có lưu ý, `NOT_NEEDED` | integration              | chỉ hiện lưu ý, không bước xác nhận, không cờ, tác vụ tới IT Admin ngay                                     | `transfer-review-decide` xanh                                                  |
| US-07-05 AC-9    | trước khi `H1` quyết; sau khi chọn `NOT_NEEDED`                           | integration              | chưa quyết không tác vụ nào; sau đó tác vụ có nguồn quyết định của trưởng phòng mới                         | `transfer-review-decide` xanh                                                  |
| Điều chuyển tiếp | điều chuyển thứ hai khi phiên cũ còn `OPEN`; nhân viên đã `LEFT`          | integration              | phiên cũ `SUPERSEDED`; quyết bị `409 EMPLOYEE_LEFT`                                                         | `transfer-review-open`, `transfer-review-decide` xanh                          |
| Idempotent       | sự kiện `PLACEMENT_START` phát hai lần                                    | integration + PostgreSQL | một phiên (unique `placement_id`)                                                                           | `transfer-review-open`, `transfer-review-constraints` xanh                     |
| Toàn vẹn dữ liệu | sửa quyết định đã ghi; quyết định thiếu người/lúc                         | integration PostgreSQL   | `55000`, `23514`                                                                                            | `transfer-review-constraints` xanh                                             |
| Quy tắc thuần    | công cụ ngoài bộ (gói khác cùng ứng dụng, bộ rỗng), hạn, ai quyết         | unit                     | bảng ca đầy đủ                                                                                              | `transfer-review.policy.spec.ts` 24 ca xanh                                    |
| Collection       | `GET /transfer-reviews` và `…/items` hai cỡ dữ liệu                       | integration              | số câu lệnh hằng số, thứ tự ổn định                                                                         | `transfer-review-read` xanh                                                    |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

24/10/2026: thiết kế `ready`, chưa implement (người phụ trách: AI theo giao việc của người dùng). Các quyết định chưa phải của Owner nằm ở mục _Quyết định thiết kế do người phụ trách chọn_ (bốn mặc định cho `OQ-A-17`). Chưa code, chưa review, chưa nghiệm thu.

24/10/2026: `g6-handover-confirmation` đã xong (`verified` local). Mở nguồn `TRANSFER_REVIEW` qua `openRevocation` với `context.departmentId` = phòng nhận: hook mở dòng cho trưởng phòng hiệu lực hôm nay của phòng đó (không phải trưởng phòng cũ), hạn là hạn ngắn `HANDOVER_SHORT_DEADLINE_WORKING_DAYS`, chỉ với gói mất dữ liệu. Không cần gọi `openHandoverDuties`. Chi tiết ở [spec](../g6-handover-confirmation/spec.md#như-đã-xây-và-khác-biệt).

## Như đã xây và khác biệt

Cập nhật 24/10/2026 bởi người phụ trách (AI theo giao việc của người dùng). Chưa Owner review; các quyết định dưới đây là của người phụ trách.

**API (bốn thao tác, kiểm kê 244 → 248):** `GET /transfer-reviews` (`transferReviewList`), `GET /transfer-reviews/{id}` (`transferReviewGet`), `GET /transfer-reviews/{id}/items` (`transferReviewItemList`), `POST /transfer-reviews/{id}/decisions` (`transferReviewDecide`, trả `201` kèm phiên và dòng vừa quyết). Cả bốn `@AuthenticatedOnly()`; thông báo thành công `TRANSFER_REVIEW.LISTED|RETRIEVED|ITEMS_LISTED|DECIDED`. Mã lỗi: `TRANSFER_REVIEW.NOT_FOUND` (404; khi đọc cả với người không liên quan), `NOT_REVIEWER` (403, mọi người không phải trưởng phòng hiệu lực hôm nay của phòng nhận, kể cả trưởng phòng cũ, IT Admin, Finance, chính nhân viên), `ITEM_NOT_FOUND` (404), `DECISION_ALREADY_RECORDED`, `NOT_OPEN`, `EMPLOYEE_LEFT`, `REVOCATION_NOT_SUPPORTED` (409, `details.provisioningType`), thêm `SEAT_NOT_OPEN` (409: Assignment đã kết thúc hay sắp kết thúc từ lúc mở phiên, nên không còn gì để gỡ); `422 VALIDATION_ERROR` cho quyết định lạ (kể cả `PENDING`), ghi chú không đi với quyết định, ghi chú trống hoặc quá 500 ký tự.

**Migration:** `20261024160000_personnel_transfer_reviews` (không phải tên tạm `083000`). Khác thiết kế: dòng công cụ có thêm cột `grant_reason` (chụp `reason` của Assignment lúc mở phiên, vì trưởng phòng đọc lý do cấp để quyết); `CHECK` giữ quyết định, người quyết, lúc quyết, ghi chú (chỉ `NEEDS_NEW_TOOL`, không trống, tối đa 500 ký tự) và tác vụ thu hồi (có đúng khi `NOT_NEEDED`) đi cùng nhau; trigger cấm sửa dòng đã quyết, đổi seat, gói, vị trí hay lý do cấp của dòng, cấm xóa dòng và phiên, cấm đổi nhân viên, phòng, hạn, ngày hiệu lực của phiên và cấm mở lại phiên đã kết thúc (mã `55000`). `plan_id` của dòng không có khóa ngoại riêng (đã đi theo Assignment). `transfer_id` có thể rỗng: điều chuyển cho hôm nay được ghi **sau** giai đoạn mở phiên (cùng transaction) nên lúc mở phiên chưa có dòng điều chuyển; đọc chi tiết tra lại qua `opens_placement_id`.

**Mã (module `personnel`, capability `transfer-review/`):** `transfer-review.policy.ts` (thuần: công cụ ngoài bộ theo `plan_id`, hạn bằng `addWorkingDays` của `core`, quá hạn, ai quyết, ghi chú), `transfer-review.service.ts` (mở phiên và đóng phiên cũ, chạy trong transaction của thay đổi), `transfer-review.listener.ts` (đăng ký `registerChangeListener` ở `onModuleInit`, đứng sau listener đánh dấu `EFFECTIVE`), `transfer-review-decision.service.ts` (một transaction, khóa phiên `FOR UPDATE`), `transfer-review-view.service.ts`, `transfer-review-overdue.service.ts` + `transfer-review.sweeper.ts`, `transfer-review.repo.ts` (người ghi duy nhất) và `transfer-review-list.repo.ts` (chỉ đọc), DTO, lỗi, ánh xạ HTTP, mapper, controller. Không đăng ký thêm contract nội module hay public. `PersonnelModule` nay import `LicensingModule` và `OperatingParametersModule`. Thêm `CatalogService.getStandardToolsetPlanIds` (một câu lệnh, rỗng khi cặp chưa có bộ) và `PersonalSeat.grantReason` (`LicensingService.listPersonalSeatsOf`). `TransferReview` và `TransferReviewItem` thuộc `personnel` ở `PRISMA_MODEL_OWNER`.

**Khác với thiết kế:**

- **Chỉ mở phiên khi có công cụ ngoài bộ, và chỉ với seat chưa có tác vụ thu hồi đang sống** (seat đang được gỡ vì nguồn khác không phải công cụ trưởng phòng mới phải trả lời). Người vào phòng lần đầu (`fromDepartmentId` rỗng) và người đã nghỉ (`status` khác `ACTIVE` hay `workState = LEFT`) không có phiên.
- **Phiên cũ `SUPERSEDED` ở mọi lần đổi phòng của người đó**, kể cả khi lần đổi phòng mới không mở phiên mới (không có công cụ ngoài bộ).
- **Người quyết đọc từ `getDepartmentHeads` ở ngày hôm nay** cả khi quyết lẫn khi đọc; `canDecide` và `reviewer` có trên wire. Người đọc: IT Admin thấy tất cả, trưởng phòng hiệu lực thấy phiên của phòng mình, người đã quyết một dòng vẫn đọc được phiên đó sau khi phòng có trưởng phòng mới; ai khác nhận danh sách rỗng và `404` khi đọc từng phiên.
- **Quá hạn:** số ngày quá hạn là ngày lịch (`overdueDays`), cờ `overdue` tính theo hôm nay. `TransferReviewSweeper` bỏ qua phiên của phòng chưa có trưởng phòng (`OQ-A-17` (a): chỉ cảnh báo thiếu trưởng phòng sẵn có) và nhắc ở lượt sau khi phòng có trưởng phòng mà phiên còn quá hạn; một lượt xét tối đa 200 phiên theo hạn cũ nhất, nên đủ 200 phiên chờ không trưởng phòng ở đầu hàng sẽ che các phiên sau (giới hạn, chưa có ca thật). Nhắc và cảnh báo chỉ là audit `TRANSFER_REVIEW.OVERDUE` (`actorKind = SYSTEM`); kênh thông báo là việc của `g4-notification-delivery`.
- **`NOT_NEEDED`:** `openRevocation` với `referenceKind = TRANSFER_REVIEW`, `referenceId` là id phiên, `decidedRole = DEPARTMENT_HEAD`, `context.departmentId` là phòng nhận; hook của `g6-handover-confirmation` mở bước xác nhận cho trưởng phòng mới chỉ với gói mất dữ liệu. K3, K4 trả `409 REVOCATION_NOT_SUPPORTED` và quyết định không ghi.
- **Chi tiết không có mảng**: dòng công cụ là subresource phân trang; danh sách và chi tiết chỉ có số đếm (`totalItems`, `pendingItems`). Số câu lệnh không đổi theo cỡ trang (test hai cỡ cho danh sách, chi tiết và dòng).
- **Audit**: `TRANSFER_REVIEW.OPENED|SUPERSEDED|OVERDUE` do hệ thống ghi (`correlationId` là id thay đổi tổ chức hoặc id phiên), `DECIDED|COMPLETED` ghi người quyết.

**Chưa xây / giới hạn:** chi phí theo ngày về Cost Center của phòng nhận và vế `US-03-07` AC-10 (G8); gợi ý theo usage (`EP-10`); tự tạo Request cho _cần công cụ mới_ (nhân viên tự gửi); chưa có ca bước xác nhận bàn giao đổi người sau khi quyết (trưởng phòng đổi giữa chừng đã có test cho quyền đọc ở `transfer-review-read`). Bốn mặc định `OQ-A-17` vẫn chưa phải Owner chọn.

**Cho hạng mục sau:** `g6-offboarding-record`: người nghỉ việc có phiên `OPEN` thì quyết bị `409 EMPLOYEE_LEFT` nhưng phiên vẫn `OPEN` và sweeper vẫn nhắc quá hạn; nếu muốn bỏ nhắc cần một lệnh đóng phiên theo nghỉ việc (chưa có). `g6-downstream-integration` đọc `transfer_reviews.status` và `due_on` nếu cần báo cáo chi phí chờ quyết. FE: bốn thao tác mới; `waitingReason`, `canDecide`, `overdue` và `overdueDays` có sẵn trên dòng danh sách.

25/10/2026: `g6-offboarding-record` đã xong (`verified` local): khi người rời đi (`EMPLOYEE_LEFT`), `TransferReviewListener` chuyển phiên `OPEN` của người đó sang `SUPERSEDED` (audit `TRANSFER_REVIEW.SUPERSEDED`), nên `TransferReviewSweeper` không còn nhắc quá hạn cho người đã nghỉ; không cần lệnh đóng phiên riêng.

## Mở lại theo baseline `769bb64` (Prompt 03, 26/10/2026)

- Audit G0–G6 trên Docs `769bb64` ↔ BE `7c28e75` mở lại hạng mục này: F42, F43 — rà soát mọi quyền; `STILL_NEEDED` → Request mới, seat cũ thành `G1`.
- Remediation duy nhất: [g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md) ([impact matrix](../g0-g6-final-business-baseline-remediation/impact-matrix.md#3-findings)). AC liên quan không còn được coi là thỏa nguồn hiện hành cho tới khi remediation xong; trạng thái triển khai ở roadmap. Phần đã ghi phía trên là lịch sử, giữ nguyên.
- _27/10/2026 (Prompt 04, Task 0.1 của `g0-g6-final-business-baseline-remediation`, F60 — re-pin scope map [G6](../../../roadmap.md#work-item-decomposition-g6) Docs `e0cb5a0`, BE `7c28e75`):_ nhận thêm `US-03-07` AC-15 (F42, F43 — mục 4 nêu hạng mục này) ([impact matrix mục 9](../g0-g6-final-business-baseline-remediation/impact-matrix.md#9-phụ-lục-delta-user-stories-72e1480--769bb64)). Phần đã ghi phía trên là lịch sử, giữ nguyên.

# Spec: nghỉ dài và quay lại có căn cứ

- Phụ trách: AI theo giao việc của người dùng (24/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (24/10/2026).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G6 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

IT Admin đánh dấu nhân viên _nghỉ dài_ kèm ngày dự kiến quay lại và căn cứ có thẩm quyền, gia hạn hay đổi ngày khi có căn cứ mới, xác nhận quay lại (đúng ngày đã duyệt thì không cần văn bản mới), và quá ngày dự kiến chỉ nhắc chứ không tự đổi trạng thái; mọi lần ghi giữ lịch sử và không lưu lý do nghỉ hay dữ liệu y tế. Hạng mục cũng cung cấp cho các luồng sau (nghỉ việc, rule G3/G4 của G7) khoảng thời gian nghỉ của từng người. Kiểm bằng ca E1 nghỉ dài từ 01/06 với ngày quay lại 01/09.

## Sizing decision

- Container: G6 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: vòng đời nghỉ dài của nhân viên; capability `personnel/leave`.
- Boundaries: một transaction mỗi lệnh trên `employee_leaves`, `employee_leave_changes`, trạng thái làm việc của nhân viên (qua `organization`) và Audit; chỉ `IT_ADMIN`; không đổi phòng, trưởng phòng, quyền hay Request.
- Not larger: tác động lên khuyến nghị thu hồi và cổng lọc 3 thuộc bộ rule của G7; chuyển nghỉ dài sang bàn giao thuộc hồ sơ nghỉ việc; hạng mục này dừng ở dữ liệu nghỉ dài và các lệnh của nó.
- Not smaller: bắt đầu, gia hạn và quay lại cùng sửa một kỳ nghỉ và cùng lịch sử ngày đã duyệt; tách ra sẽ nhân đôi test về căn cứ và ngày.
- Siblings: `g6-offboarding-record`, `g6-downstream-integration`, `g6-hr-notices-and-verification`, `g6-transfer-record`.
- Scope map: [G6](../../../roadmap.md#work-item-decomposition-g6).

## Primary Story/AC

| Story    | AC                     | Coverage | Phần còn lại thuộc                                                    |
| -------- | ---------------------- | -------- | --------------------------------------------------------------------- |
| US-03-03 | AC-4, AC-5, AC-7, AC-8 | partial  | AC-1→AC-3: `g6-downstream-integration`; AC-6: `g6-offboarding-record` |

## Supporting references

`FR-2.14` (căn cứ, quay lại sau nghỉ dài), `FR-4.9` điều kiện 3, `BR-04.1`→`BR-04.3`, `OQ-04`, `GĐ-7`, `QĐ-76c`, `QĐ-77a`, `QĐ-77b`, `QĐ-77j`, `QĐ-80`, `QĐ-80b`, `QĐ-80c`, `WF-06` (`d_date`, `a_evid`, `a_ext`), BRD 5.12.3 `Employee`; `US-03-11`, `US-10-02`, `US-10-03`.

## Explicit out of scope

- Loại khỏi đánh giá, tạm dừng khuyến nghị và không tính khoảng nghỉ vào số ngày không hoạt động (`AC-1`→`AC-3`): thuộc rule `G3`/`G4` của G7 (`US-10-02`, `US-10-03`); hạng mục này cung cấp `PersonnelService.getLeaveIntervals` để rule đọc. Chủ tạm là `g6-downstream-integration`.
- Chuyển nghỉ dài sang _đang bàn giao_ hay _đã nghỉ việc_ và hủy bàn giao quay về nghỉ dài (`AC-6`, `US-03-04` AC-26): `g6-offboarding-record`, dùng các hàm `endForDeparture` và `resumeAfterCancelledDeparture` do hạng mục này cung cấp.
- Ghi từ thông báo của trưởng phòng và bản ghi xác minh (`US-03-11`): `g6-hr-notices-and-verification`; ghi trực tiếp văn bản (đường B) không có bản ghi xác minh.
- Nguồn dữ liệu nghỉ phép tự động, tích hợp HRM; lưu lý do nghỉ hay dữ liệu y tế (cấm).
- Nhắc trong hộp thông báo: điểm gọi là audit event (xem dưới) cho `g4-notification-delivery`.

## Dependencies and blockers

`g6-transfer-record` (module `personnel`, cột `work_state` và hàm `setEmployeeWorkState`, chính sách căn cứ `grounds`, quy tắc tự ghi), `g2-employee-intake-by-super-admin` (hồ sơ nhân viên). Không có blocker ngoài. Một migration.

## Ownership: module, data, API

- **Module `personnel`, capability `leave/`:** `leave.policy.ts` (thuần: ngày, căn cứ, quay lại đúng hay khác ngày đã duyệt, quá hạn), `leave.service.ts` (`start`, `changeReturnDate`, `confirmReturn`, và hai hàm cho nghỉ việc), `leave.repo.ts`, `leave.controller.ts`, `leave-return.sweeper.ts`, DTO, lỗi HTTP, mapper. Facade root `personnel.service.ts` (`PersonnelService.getLeaveIntervals`) thêm vào `PUBLIC_CONTRACT_EXPORTS` của `module-graph.spec.ts` khi có consumer.
- **Module `organization`:** dùng `setEmployeeWorkState` (từ `g6-transfer-record`); `employees` wire thêm trường chỉ đọc `workState` ở danh sách và chi tiết (task riêng, đổi OpenAPI).
- **Dữ liệu (một migration `20261024170000_personnel_employee_leaves`):** enum `EmployeeLeaveStatus` (`ACTIVE`, `ENDED`), `EmployeeLeaveEndKind` (`RETURNED`, `DEPARTURE_STARTED`), `EmployeeLeaveChangeKind` (`STARTED`, `RETURN_DATE_CHANGED`, `RETURNED`, `ENDED_FOR_DEPARTURE`, `RESUMED`); `employee_leaves` (`id`, `organization_id`, `employee_id`, `started_on`, `approved_return_on`, `status`, `ended_on`, `end_kind`, `resumes_leave_id` null, `grounds_type`, `grounds_reference`, `grounds_issuer`, `grounds_issued_on` — căn cứ của ngày đã duyệt hiện hành, `started_by_app_user_id`, `started_at`, `self_executed`, `return_overdue_noticed_for` null; unique một phần `(employee_id)` khi `ACTIVE`; `CHECK` `approved_return_on > started_on`, đồng bộ `status` với `ended_on`/`end_kind`); `employee_leave_changes` (`leave_id`, `kind`, `old_return_on`, `new_return_on`, `returned_on`, căn cứ, `on_schedule`, `recorded_by_app_user_id`, `recorded_at`, `self_executed`; chỉ thêm). Không cột nào lưu lý do nghỉ.
- **API (thêm 6):** `POST /long-leaves` (`longLeaveStart`), `GET /long-leaves` (`longLeaveList`), `GET /long-leaves/{id}` (`longLeaveGet`), `GET /long-leaves/{id}/changes` (`longLeaveChangeList`), `POST /long-leaves/{id}/return-date-changes` (`longLeaveChangeReturnDate`), `POST /long-leaves/{id}/returns` (`longLeaveConfirmReturn`); tất cả `IT_ADMIN`.
- **Audit:** `LONG_LEAVE.STARTED`, `LONG_LEAVE.RETURN_DATE_CHANGED`, `LONG_LEAVE.RETURNED`, `LONG_LEAVE.RETURN_OVERDUE` (một lần, điểm gọi nhắc IT Admin), `PERSONNEL.SELF_EXECUTED`.

## Behavior and design

**Bắt đầu nghỉ dài (`AC-5`).** `POST /long-leaves { employeeId, startedOn, approvedReturnOn, grounds }`. Chính sách thuần, theo thứ tự: nhân viên tồn tại, chưa nghỉ việc và `work_state = WORKING` (`409 EMPLOYEE_NOT_WORKING`; đang nghỉ dài rồi: `409 ALREADY_ON_LEAVE`); `startedOn` không trước ngày vào làm và không sau hôm nay — quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner): nghỉ dài ghi khi nó đã bắt đầu, vì Story không cho ngày bắt đầu tương lai và không có tác vụ nền đổi trạng thái; `approvedReturnOn` sau `startedOn`; căn cứ đủ loại, số hiệu hoặc mã tệp, người ban hành hoặc chấp thuận, ngày (`QĐ-77a`): thiếu thì `422 GROUNDS_REQUIRED`/`GROUNDS_INCOMPLETE` và trạng thái không đổi; số hiệu trùng mã thông báo `BM09-…` thì `422 GROUNDS_IS_NOTICE` (_thông báo không phải căn cứ_); body là `z.strictObject`, trường lạ như `reason` hay `medical` bị `422 VALIDATION_ERROR` (không lưu lý do nghỉ); IT Admin ghi cho chính mình khi còn IT Admin khác thì từ chối (`SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN`, cùng quy tắc `SoD-5` của `g6-transfer-record`). Thành công, một transaction: khóa nhân viên, tạo `employee_leaves` `ACTIVE`, `work_state = ON_LONG_LEAVE`, dòng `STARTED` và audit kèm căn cứ. Không tạo bản ghi xác minh (chỉ ghi từ thông báo mới có, `QĐ-77b`).

**Gia hạn và đổi ngày dự kiến (`AC-8`).** `POST …/return-date-changes { newApprovedReturnOn, grounds }`: kỳ nghỉ phải `ACTIVE`; ngày mới khác ngày đã duyệt, sau `startedOn` và không trước hôm nay (`RETURN_DATE_IN_PAST`); **căn cứ có thẩm quyền mới bắt buộc**, thiếu thì `422` và vẫn _nghỉ dài_. Thành công: ngày đã duyệt và căn cứ hiện hành thành giá trị mới, giá trị cũ giữ ở `employee_leave_changes`, trạng thái vẫn _nghỉ dài_, và nhắc quá hạn (`AC-4`) tính theo ngày mới.

**Quay lại (`AC-7`, `AC-8`).** `POST …/returns { returnedOn, grounds? }`, `returnedOn` từ `startedOn` tới hôm nay. Đúng ngày đã duyệt: **không** cần văn bản mới; IT Admin xác nhận, Audit ghi người và thời điểm, `on_schedule = true`, và không bản ghi xác minh nào được tạo (`AC-7`). Khác ngày đã duyệt (sớm hay muộn): bắt buộc căn cứ mới, thiếu thì từ chối và vẫn _nghỉ dài_ (`AC-8`); đủ căn cứ thì nhân viên về `WORKING` từ ngày đó. Cả hai: kỳ nghỉ thành `ENDED` (`end_kind = RETURNED`), `work_state = WORKING`, vào lại phạm vi đánh giá của rule G7; thời gian nghỉ không trừ vào gì ở đây (rule G7 đọc khoảng).

**Quá ngày dự kiến chỉ nhắc (`AC-4`).** Kỳ nghỉ `ACTIVE` có `approved_return_on < hôm nay` là _quá hạn quay lại_: danh sách có cờ `overdueReturn` và `GET /long-leaves?overdueReturn=true` là danh sách nhắc cho IT Admin; mỗi giờ `LeaveReturnSweeper` ghi `return_overdue_noticed_for = approved_return_on` và audit `LONG_LEAVE.RETURN_OVERDUE` đúng một lần cho mỗi ngày đã duyệt (gia hạn rồi lại quá hạn thì nhắc lại). Trạng thái **không bao giờ** tự đổi theo ngày.

**Hai hàm cho hồ sơ nghỉ việc (`AC-6`, chỉ dùng trong module).** `endForDeparture(tx, employeeId, endedOn)`: nếu có kỳ nghỉ `ACTIVE` thì kết thúc nó (`DEPARTURE_STARTED`, `ended_on`) và ghi dòng `ENDED_FOR_DEPARTURE`; `resumeAfterCancelledDeparture(tx, employeeId, today)`: nếu kỳ nghỉ vừa bị kết thúc vì bàn giao có `approved_return_on` ≥ hôm nay thì mở kỳ mới `ACTIVE` (`resumes_leave_id` trỏ kỳ cũ, `approved_return_on` giữ, dòng `RESUMED`) và trả `ON_LONG_LEAVE`, ngược lại trả `WORKING` (`US-03-04` AC-26). Khoảng bàn giao không nằm trong kỳ nghỉ nào nên không bị tính là nghỉ. `start` cũng có biến thể `startInTx` (nhận `tx` và `noticeId` tùy chọn) để `g6-hr-notices-and-verification` ghi từ thông báo.

**Điểm gọi cho module khác.** `PersonnelService.getLeaveIntervals(employeeIds, from, to)` trả `[{ employeeId, startedOn, endedOn | null }]` theo lô (một câu lệnh), cho rule `G3`/`G4` và tính ngày không hoạt động của G7; không có khuyến nghị nào được đổi ở đây. Wire `employees` thêm `workState` chỉ đọc.

**API.** `GET /long-leaves` là collection: dòng tóm tắt (nhân viên mã/tên, `status`, `startedOn`, `approvedReturnOn`, `overdueReturn`), lọc `status`, `employeeId`, `overdueReturn`, `page`/`pageSize` (tối đa 100), thứ tự `approved_return_on`, `id`; chi tiết thêm căn cứ hiện hành; lịch sử là subresource phân trang. Lỗi: `LONG_LEAVE.NOT_FOUND` `404`, `.EMPLOYEE_NOT_FOUND` `404`, `.EMPLOYEE_NOT_WORKING` `409`, `.ALREADY_ON_LEAVE` `409`, `.NOT_ACTIVE` `409`, `.START_DATE_INVALID` `422`, `.RETURN_DATE_INVALID` `422`, `.RETURN_DATE_IN_PAST` `422`, `.GROUNDS_REQUIRED`/`.GROUNDS_INCOMPLETE`/`.GROUNDS_IS_NOTICE` `422`, `.SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN` `409`.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):** không cho ngày bắt đầu tương lai; kỳ nghỉ mới khi hủy bàn giao thay vì mở lại dòng đã kết thúc (giữ lịch sử); `PersonnelService.getLeaveIntervals` là hợp đồng cho G7; quy tắc tự ghi áp cho cả nghỉ dài dù hai Story không nêu.

## Test matrix

| AC / rủi ro       | Tình huống (gồm từ chối, edge case)                                                                            | Cấp test               | Kết quả mong đợi                                                                                                                   | Bằng chứng sau implement                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-03-03 AC-4     | ngày dự kiến 31/08 đã qua, sweeper chạy 02/09 hai lần                                                          | integration            | cờ `overdueReturn`, audit `RETURN_OVERDUE` một lần, trạng thái vẫn nghỉ dài; gia hạn rồi quá hạn lại → nhắc lại                    | `long-leave-return.integration-spec.ts` (nhắc một lần, nhắc lại sau khi đổi ngày, trạng thái không đổi); `leave.policy.spec.ts`                                                    |
| US-03-03 AC-5     | căn cứ trống; chỉ mã `BM09-…`; đơn nghỉ dài đã chấp thuận đủ bốn trường; thêm trường `reason`; IT Admin tự ghi | integration + e2e      | từ chối, trạng thái không đổi; `GROUNDS_IS_NOTICE`; ghi được, căn cứ vào Audit, không bản ghi xác minh; `422`; theo quy tắc tự ghi | `long-leave-start.integration-spec.ts` (căn cứ trống, thiếu một phần, `BM09-…`, `reason`/`medical`/`diagnosis`, tự ghi, không bản ghi xác minh); `long-leaves.e2e-spec.ts` (`422`) |
| US-03-03 AC-7     | nghỉ theo đơn ghi quay lại 01/09, E1 về 01/09 không văn bản mới                                                | integration            | về `WORKING`, `on_schedule`, Audit ghi `A1` và thời điểm, không bản ghi xác minh                                                   | `long-leave-return.integration-spec.ts` (đúng ngày không văn bản, kể cả khi gửi căn cứ sai; Audit ghi `actor_app_user_id`)                                                         |
| US-03-03 AC-8     | gia hạn tới 30/09 không/ có căn cứ; về sớm 20/08 và về muộn 05/09 không/ có căn cứ                             | integration            | không căn cứ: từ chối, vẫn nghỉ dài; có căn cứ: ngày đã duyệt thành 30/09 hoặc về `WORKING` từ ngày đó; nhắc theo 30/09            | `long-leave-return.integration-spec.ts` (gia hạn, về sớm, về muộn: không/có căn cứ; ngày và căn cứ cũ trong nhật ký)                                                               |
| Trạng thái        | bắt đầu khi đang nghỉ, đang bàn giao, đã nghỉ việc; ngày bắt đầu tương lai hoặc trước ngày vào làm             | integration            | `409`/`422` đúng mã, không dòng nào ghi                                                                                            | `long-leave-start.integration-spec.ts` (đang nghỉ, đang bàn giao, đã nghỉ việc, không tồn tại, hai lệnh đồng thời; ngày tương lai, trước ngày vào làm, ngày về không sau ngày đi)  |
| Hàm cho nghỉ việc | `endForDeparture` khi đang nghỉ; `resumeAfterCancelledDeparture` trước và sau ngày quay lại cũ                 | integration            | kỳ cũ `ENDED`; trước ngày: kỳ mới `ACTIVE` giữ ngày; sau ngày: `WORKING`, không kỳ mới                                             | `long-leave-integrity.integration-spec.ts` (`endForDeparture`; `resumeAfterCancelledDeparture` trước, đúng và sau ngày quay lại cũ; hỏi hai lần không mở hai kỳ)                   |
| Hợp đồng đọc      | `getLeaveIntervals` nhiều người                                                                                | integration            | đúng khoảng, một câu lệnh                                                                                                          | `long-leave-integrity.integration-spec.ts` (một câu lệnh, nhiều người, kỳ đã kết thúc, ngoài khoảng)                                                                               |
| Toàn vẹn dữ liệu  | hai kỳ `ACTIVE` một người; `approved_return_on` ≤ `started_on`; sửa/xóa dòng lịch sử                           | integration PostgreSQL | `23505`, `23514`, `55000`                                                                                                          | `long-leave-integrity.integration-spec.ts` (`23505`, `23514`, `55000`; không cột nào có thể giữ lý do nghỉ)                                                                        |
| Quyền             | Finance, trưởng phòng, Employee, Super Admin gọi mọi lệnh                                                      | e2e                    | `403`                                                                                                                              | `long-leaves.e2e-spec.ts` (sáu route × Super Admin, Finance, Employee, không vai, trưởng phòng, người duyệt chi: `403`; không token: `401`)                                        |
| Quy tắc thuần     | ngày, căn cứ, đúng/khác ngày đã duyệt, quá hạn                                                                 | unit                   | bảng ca đầy đủ                                                                                                                     | `leave.policy.spec.ts` (31 ca)                                                                                                                                                     |
| Collection        | `GET /long-leaves` hai cỡ dữ liệu                                                                              | integration            | số câu lệnh hằng số, thứ tự ổn định                                                                                                | `long-leave-integrity.integration-spec.ts` (số câu lệnh bằng nhau ở 3 và 12 dòng, thứ tự `approved_return_on`, `id`)                                                               |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

24/10/2026: thiết kế `ready`. 24/10/2026: implement xong ở cây làm việc cục bộ, chưa commit (người phụ trách: AI theo giao việc của người dùng); gate ghi ở [plan](plan.md). Các quyết định chưa phải của Owner nằm ở mục _Quyết định thiết kế do người phụ trách chọn_ và _Như đã xây và khác biệt_. Chưa Owner review, chưa nghiệm thu.

25/10/2026: `g6-hr-notices-and-verification` đã xong (`verified` local). `LeaveService.startInTx` nhận thêm `noticeId` (cột `employee_leaves.notice_id`, unique) và `LeaveNoticeRecorder` đăng ký nó với `NoticeRecorderRegistry`; nghỉ dài ghi thẳng từ văn bản vẫn không có thông báo. Chi tiết ở [spec](../g6-hr-notices-and-verification/spec.md#như-đã-xây-và-khác-biệt).

## Như đã xây và khác biệt

Cập nhật 24/10/2026 bởi người phụ trách (AI theo giao việc của người dùng). Chưa Owner review; các quyết định dưới đây là của người phụ trách.

**API (sáu thao tác, kiểm kê 248 → 254):** `POST /long-leaves` (201, `longLeaveStart`), `GET /long-leaves`, `GET /long-leaves/{id}`, `GET /long-leaves/{id}/changes`, `POST /long-leaves/{id}/return-date-changes` và `POST /long-leaves/{id}/returns` (200). Chỉ `IT_ADMIN`. Thông báo thành công `LONG_LEAVE.STARTED|LISTED|RETRIEVED|CHANGES_LISTED|RETURN_DATE_CHANGED|RETURNED`. Danh sách là collection không mảng lồng; chi tiết trả căn cứ hiện hành; lịch sử là subresource phân trang. `GET /long-leaves?overdueReturn=true` là danh sách nhắc.

**Migration:** `20261024170000_personnel_employee_leaves` (không phải tên tạm `084000` trong thiết kế). Trigger `employee_leaves_guard` chỉ cho đổi ngày đã duyệt cùng căn cứ, dấu nhắc và bước kết thúc khi `ACTIVE`; dòng `ENDED` và `DELETE`/`TRUNCATE` bị từ chối `55000`; `employee_leave_changes` chỉ thêm (`55000`). Các `CHECK` giữ: ngày về sau ngày đi (`23514`), `status` khớp `ended_on`/`end_kind`, căn cứ không rỗng, căn cứ ở nhật ký đủ bộ hoặc vắng, mỗi loại dòng nhật ký có đúng các cột của nó (về lệch ngày thì bắt buộc có căn cứ).

**Khác với thiết kế:**

- **Không có `EMPLOYEE_LEFT`:** người đã nghỉ việc hay đang bàn giao đều là `409 EMPLOYEE_NOT_WORKING` (kèm `details.workState`), đúng danh sách mã lỗi của thiết kế.
- **Kỳ nghỉ mới khi hủy bàn giao chỉ mở khi `approved_return_on` _sau_ hôm nay** (thiết kế viết `≥`): `CHECK approved_return_on > started_on` không cho kỳ bắt đầu hôm nay có ngày về hôm nay; người hủy bàn giao đúng ngày dự kiến về coi như đã về, nên về `WORKING`. `resumeAfterCancelledDeparture` hỏi lần hai khi người đã có kỳ `ACTIVE` thì trả `ON_LONG_LEAVE` mà không mở thêm.
- **`endForDeparture(tx, recordedByAppUserId, employeeId, endedOn)` và `resumeAfterCancelledDeparture(tx, recordedByAppUserId, employeeId, today)` có thêm tham số tài khoản ghi** (cột `recorded_by_app_user_id` của nhật ký không rỗng), và nằm ở `LeaveDepartureService` (`leave-departure.service.ts`), không ở `LeaveService`. Cả hai không đổi `work_state` (hồ sơ nghỉ việc đặt `HANDING_OVER`/`WORKING`/`ON_LONG_LEAVE` theo kết quả) và không tự khóa nhân viên (người gọi giữ khóa `FOR UPDATE` theo giao thức). Khi hạng mục nghỉ việc gọi từ `personnel/offboarding/`, nó phải thêm `leave/leave-departure.service.ts` vào `INTRA_MODULE_CONTRACTS` của `architecture-structure.spec.ts` (hiện chưa có consumer nên chưa liệt kê).
- **`startInTx(tx, actor, input)` không nhận `noticeId`:** chưa có bản ghi xác minh để gắn; `g6-hr-notices-and-verification` thêm khi cần.
- **`PersonnelService.getLeaveIntervals(employeeIds, from, to)` đã có và đã nằm trong `PUBLIC_CONTRACT_EXPORTS`** (kèm `PersonnelModule` export nó) dù chưa có consumer trong repo, vì G7 đọc nó. Một câu lệnh. Nghĩa khoảng: người nghỉ từ `startedOn` đến _trước_ `endedOn` (ngày quay lại hoặc ngày bắt đầu bàn giao); `endedOn` rỗng khi còn nghỉ; trả mọi kỳ chạm `[from, to]`, rule tự cắt. `LeaveInterval` ở `personnel.types.ts` (root) để facade không phải mở file riêng của `leave/`; `leave-query.service.ts` vào `INTRA_MODULE_CONTRACTS`.
- **`employees` wire:** không có route danh sách hay chi tiết nhân viên; `workState` chỉ đọc được thêm vào `GET /departments/{id}/employees` (IT Admin và trưởng phòng của phòng đó thấy, không lộ lý do nghỉ vì không lưu), phản hồi `POST /employees` (luôn `WORKING`) và `PATCH /employees/{id}`. Ba test hiện có kiểm đúng danh sách khóa của phản hồi đã cập nhật (`departments-http`, `employee-manual-http`, `organization-identity-read-contracts`).
- **Sweeper chạy trong `PersonnelModule`** (như `TransferReviewSweeper`), không thêm module HTTP riêng.
- **Hook `PersonnelFileHooks` không được gọi:** loại file hiện có là `TRANSFER` và `OFFBOARDING`; nghỉ dài không phải hồ sơ có ngày hiệu lực mà các luồng khác (chủ tài khoản dịch vụ) cần theo.
- **Quy tắc tự ghi** áp cho cả ba lệnh: IT Admin ghi cho chính mình khi còn IT Admin khác thì `409 SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN`; là người duy nhất thì ghi được và có `PERSONNEL.SELF_EXECUTED` mỗi lệnh. Về đúng ngày đã duyệt bỏ qua `grounds` gửi kèm (không kiểm, không lưu).

**Chưa kiểm chứng / giới hạn:** `AC-1`→`AC-3` chờ rule G7 (`g6-downstream-integration`); `AC-6` ở `g6-offboarding-record` (hai hàm đã có và đã test độc lập, chưa có người gọi). Thông báo cho IT Admin về quá hạn chỉ là sự kiện audit `LONG_LEAVE.RETURN_OVERDUE` (kênh hộp thông báo là việc của `g4-notification-delivery`). Chưa có test cho nhiều phiên bản chạy sweeper song song (dấu nhắc và sự kiện cùng một transaction, câu lệnh `UPDATE … WHERE … IS DISTINCT FROM` cho phép đúng một bên thắng). Một kỳ nghỉ `ACTIVE` mà `work_state` không phải `ON_LONG_LEAVE` (ai đó sửa thẳng cột) không được phát hiện: dịch vụ đặt `WORKING` khi quay lại bất kể.

**Cho hạng mục sau:** `g6-offboarding-record` gọi hai hàm của `LeaveDepartureService` (xem trên) và đặt `work_state`; `g6-hr-notices-and-verification` gọi `LeaveService.startInTx`; `g6-downstream-integration` và rule G7 gọi `PersonnelService.getLeaveIntervals`. FE: sáu thao tác mới và trường `workState` (danh sách thành viên phòng, tạo và sửa nhân viên).

25/10/2026: `g6-offboarding-record` đã xong (`verified` local): hồ sơ nghỉ việc gọi `LeaveDepartureService.endForDeparture` (ngày ghi) và `resumeAfterCancelledDeparture` (khi hủy) trong transaction của mình, nên `AC-6` của `US-03-03` đã có test; `leave/leave-departure.service.ts` đã vào `INTRA_MODULE_CONTRACTS`. Chi tiết ở [spec](../g6-offboarding-record/spec.md#như-đã-xây-và-khác-biệt).

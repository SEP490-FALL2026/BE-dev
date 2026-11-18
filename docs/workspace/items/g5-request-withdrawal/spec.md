# Spec: người yêu cầu rút Request đang chờ

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Người yêu cầu rút Request khi còn chờ hoặc khi tác vụ cấp chưa thực thi; tác vụ chờ bị hủy, quyền nhả chỗ, Request kết thúc đã rút chứ không thất bại; rút khi tác vụ lỗi hoặc chờ chấp nhận đi qua chờ IT đóng. Kiểm bằng ca E1 rút R1.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: Người yêu cầu rút Request đang chờ.
- Boundaries: Một transaction đổi trạng thái Request, bước và tác vụ; chỉ người yêu cầu; người thụ hưởng của Request tạo thay không rút.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: `g3-downstream-finance-integration`, `g4-request-and-transfer-integration`, `g5-commitment-lifecycle`, `g5-finance-information-request`, `g5-it-assessment-of-new-software`, `g5-manager-need-decision`, `g5-request-submission-and-routing`, `g5-return-and-renewal-requests`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                                        | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                       |
| -------- | ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-05-08 | AC-1, AC-3, AC-4, AC-6→AC-9, AC-11, AC-12 | partial  | AC-2: `g5-finance-information-request`; AC-5: `g5-commitment-lifecycle`; AC-10: `g3-downstream-finance-integration`                                                                                                                                                      |
| US-01-12 | AC-5                                      | partial  | AC-1: `g5-request-submission-and-routing`; AC-2: `g5-it-assessment-of-new-software`; AC-3: `g5-return-and-renewal-requests`; AC-4, AC-8, AC-9: `g4-request-and-transfer-integration`; AC-6, AC-7: `g5-manager-need-decision`; AC-10: `g3-downstream-finance-integration` |
| US-06-14 | AC-14                                     | partial  | AC-1→AC-5, AC-7→AC-13, AC-15: `g5-spend-submission-batches`; AC-6: `g5-group-requests`                                                                                                                                                                                   |

## Supporting references

`OI-06`, `QĐ-77f`, `QĐ-77g`, `QĐ-82n`, `QĐ-83a`, `QĐ-84g`.

## Explicit out of scope

- Thông báo cho người đang giữ bước, Finance, IT Admin và người thụ hưởng: `g5-request-status-notifications` đọc các audit event `ACCESS_REQUEST.WITHDRAWN` và `ACCESS_REQUEST.WITHDRAWAL_REQUESTED` do hạng mục này ghi.
- Trạng thái _chờ chấp nhận_ của tác vụ connector và việc đối soát đổi rút thành hoàn trả (`US-05-08` AC-9 vế lời mời, AC-11): BE chưa có trạng thái đó (`US-07-03` là `RESEARCH-DEPENDENT`); hạng mục này làm vế tác vụ _lỗi_ và để chỗ nối ở cổng cấp phát.
- Giải phóng _một phần_ theo chứng từ mua đã có hiệu lực (`US-05-08` AC-10, AC-5 vế đã mua): chứng từ mua và hóa đơn thuộc G3/G8; ở đây mọi phần cam kết còn giữ được giải phóng (`releaseForRequest` không có `amounts`).
- Hoàn trả quyền đã cấp xong (`US-05-13`): `g5-return-and-renewal-requests`.
- Mọi AC của các Story trên mà bảng Primary không liệt kê: chủ của chúng ở cột _Phần còn lại thuộc_ và ở scope map G5.

## Dependencies and blockers

`g5-request-submission-and-routing`, `g4-provisioning-queue-manual`, `g4-provisioning-failure-handling`, `g5-commitment-lifecycle` (`BudgetsService.releaseForRequest`, lý do `REQUEST_WITHDRAWN`), `g5-finance-information-request` (`BudgetInformationService.closeOpen`), `g5-spend-submission-batches` (rời lô). Không có blocker ngoài. Hai migration.

## Ownership: module, data, API

- **Module `requests`, capability `access-request`:** `withdrawal.policy.ts` (thuần: ai rút, khi nào, lý do từ chối), `WithdrawalService` (một transaction, khóa tác vụ cấp trước khi khóa Request), `access-request.types.ts` (các kiểu của Request tách khỏi repo để file không vượt giới hạn; không re-export), `AccessRequestRepo.setWithdrawal`, `AccessRequestGrantGate.isWithdrawing` và `reportCancelled`.
- **Module `requests`, capability `spend`:** `SpendStepRepo.closeAllOpen` (đóng mọi bước còn mở), `SpendBatchRepo.markLeft` với lý do `REQUEST_WITHDRAWN`; dùng `BudgetInformationService.closeOpen`.
- **Module `licensing`:** `ProvisioningCancellationService` (hủy tác vụ chưa ai làm cùng assignment), `AssignmentService.cancel` (cùng đường với `closeFailed` qua `endWithoutSeat`), `ProvisioningDecisionService.cancel`, `ProvisioningTaskRepo.lockGrantOfRequest` và `markCancelled`, `AssignmentRepo.markCancelled`, facade `LicensingService.lockGrantOfRequest` và `cancelGrantOfRequest`; cổng `GrantRequestGate` thêm `isWithdrawing`, `reportCancelled`.
- **Dữ liệu:** `20261024030000_requests_withdrawal_values` (giá trị enum `AWAITING_IT_CLOSE`, `WITHDRAWN`, `CANCELLED`, `REQUEST_WITHDRAWN`) và `20261024030100_requests_withdrawal`: bốn cột rút của `access_requests` với `CHECK` đồng bộ với trạng thái; cột `cancelled_at` của `license_assignments` (kỳ rỗng như assignment thất bại, không bao giờ vừa thất bại vừa hủy, trigger bất biến mở rộng); nhánh `CANCELLED` của `provisioning_tasks_status_columns`, tác vụ hủy là cuối cùng và chỉ vào từ `QUEUED`, `RETRY_SCHEDULED`, `FAILED`.
- **API (207 → 209):** `POST /access-requests/{id}/withdraw` (`reason` tùy chọn với người yêu cầu, bắt buộc với trưởng phòng), `POST /provisioning-tasks/{id}/cancel` (IT Admin). Request thêm trường `withdrawal` và hai trạng thái; bước nhu cầu có thể là `CLOSED`; assignment thêm `cancelledAt`; tác vụ thêm trạng thái `CANCELLED`; mục lô thêm lý do rời `REQUEST_WITHDRAWN`.
- **Audit:** `ACCESS_REQUEST.WITHDRAWN`, `ACCESS_REQUEST.WITHDRAWAL_REQUESTED`, `PROVISIONING_TASK.CANCELLED`, `LICENSE_ASSIGNMENT.CANCELLED`.

## Behavior and design

**Ai rút (`AC-4`, `AC-8`, `US-06-14` AC-14).** Người yêu cầu (người tạo): bất kể bước nào còn chờ, lý do tùy chọn. Người thụ hưởng của Request do trưởng phòng tạo thay không rút (`403 NOT_REQUESTER`; người của Request thì đọc được, người ngoài nhận `404`). Trưởng phòng của phòng rút với lý do bắt buộc chỉ khi Request đang ở ba chặng trưởng phòng phải xử lý: Finance trả về, chờ phiên bản ngân sách, hoặc dừng vì mã dữ liệu (`RETURNED_BY_FINANCE`, `WAITING_BUDGET`, `BLOCKED` của `SpendStatusService`); thiếu lý do là `422 REASON_REQUIRED`, ở chặng khác là `403`. IT Admin đọc mọi Request nhưng không rút thay.

**Trạng thái và tác vụ (`AC-1`, `AC-3`, `AC-5`, `AC-6`, `AC-9`).** Request kết thúc `WITHDRAWN` (không phải `REJECTED`, `FAILED`) trong một transaction: mọi bước còn mở (nhu cầu, đánh giá IT, Finance rà soát, chi) thành `CLOSED`; câu hỏi Finance còn mở đóng với lý do `REQUEST_WITHDRAWN`; mục lô trình duyệt chi rời lô và ghi người, thời điểm (`AC-12`), các Request khác của lô không đổi; khoản cam kết còn giữ được giải phóng; Request chờ có kiểm soát cũng rút được. Với Request đang `EXECUTING`, kết cục theo tác vụ cấp: _chưa ai làm_ (`QUEUED`, `RETRY_SCHEDULED`) bị hủy cùng assignment (kỳ rỗng, chỗ nhả ngay, không bao giờ _thất bại_); _đang làm_ (`IN_PROGRESS`) bị từ chối `409 GRANT_RUNNING`, không đổi gì; _đã xong_ là `COMPLETED` nên `409 GRANT_COMPLETED` hướng sang hoàn trả; _lỗi_ (`FAILED`) đưa Request sang `AWAITING_IT_CLOSE`, tác vụ, chỗ và cam kết giữ nguyên.

**Chờ IT đóng (`AC-9`).** Trong `AWAITING_IT_CLOSE` IT Admin chỉ còn một quyết định: `POST /provisioning-tasks/{id}/cancel`. Thử lại, giao tay và đóng thất bại bị từ chối `409 WITHDRAWAL_PENDING` để việc rút không bao giờ thành _thất bại_; người yêu cầu rút lần hai nhận `409 WITHDRAWAL_PENDING`. Hủy đóng tác vụ `CANCELLED` (lý do `REQUESTER_WITHDREW`), assignment thành đã hủy, Request `WITHDRAWN` với `withdrawnAt`, cam kết còn giữ được giải phóng, mọi thứ cùng transaction; hủy một tác vụ không phải của Request đã rút là `409 NO_WITHDRAWAL`.

**Khóa.** Tác vụ cấp được khóa trước Request, cùng thứ tự với quyết định của IT Admin (tác vụ → Request → thuê bao → assignment), nên rút và đóng đồng thời xếp hàng thay vì kẹt vòng.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Hai trạng thái Request mới `WITHDRAWN` và `AWAITING_IT_CLOSE`; trạng thái `CANCELLED` (IT hủy vì người thụ hưởng nghỉ việc, `QĐ-77f`) thuộc G6.
- Chặng trưởng phòng được rút lấy từ `SpendStatusService` (đúng ba chặng nguồn nêu), không thêm trạng thái.
- Phần cam kết giải phóng là mọi phần còn giữ, vì chứng từ mua chưa có (G3/G8); khi có, người gọi truyền `amounts` cho phần chưa chi.
- Việc đổi rút thành hoàn trả khi tài khoản đã kích hoạt (`AC-11`) và bước thu lại lời mời để chỗ nối ở cổng cấp phát (`isWithdrawing`, `reportCancelled`); chưa làm vì BE chưa có trạng thái _chờ chấp nhận_.

## Test matrix

| AC / rủi ro      | Tình huống (gồm từ chối, edge case)                                                  | Cấp test                 | Kết quả mong đợi                                                                                                       | Bằng chứng sau implement |
| ---------------- | ------------------------------------------------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| US-05-08 AC-1    | người yêu cầu rút khi chờ bước nhu cầu, có và không có lý do; rút lần hai            | integration + PostgreSQL | `WITHDRAWN`, bước `CLOSED`, người/lúc/lý do được giữ, Audit; lần hai `409 ALREADY_ENDED`                               | xem plan                 |
| US-05-08 AC-2    | câu hỏi Finance đang mở khi rút                                                      | integration              | câu hỏi `CLOSED` lý do `REQUEST_WITHDRAWN`, bước chi `CLOSED`                                                          | xem plan                 |
| US-05-08 AC-3    | tác vụ đang làm; tác vụ đã xong                                                      | integration              | `409 GRANT_RUNNING`, `409 GRANT_COMPLETED`; Request, tác vụ, cam kết không đổi                                         | xem plan                 |
| US-05-08 AC-4    | người ngoài; IT Admin                                                                | integration              | `404`; `403 NOT_REQUESTER`; Request không đổi                                                                          | xem plan                 |
| US-05-08 AC-5    | Request đã duyệt chi chưa cấp; tác vụ chưa ai làm                                    | integration + PostgreSQL | cam kết `RELEASED` ngay; tác vụ `CANCELLED`, assignment kỳ rỗng, chỗ nhả, không `GRANT_FAILED`; tác vụ hiện ở hàng đợi | xem plan                 |
| US-05-08 AC-6    | Request chờ có kiểm soát vì không có người duyệt                                     | integration              | `WITHDRAWN`, không bước nào còn mở                                                                                     | xem plan                 |
| US-05-08 AC-8    | trưởng phòng tạo thay; người thụ hưởng rút; trưởng phòng rút                         | integration              | `403 NOT_REQUESTER`; `WITHDRAWN`                                                                                       | xem plan                 |
| US-05-08 AC-9    | tác vụ lỗi, rút, thử các quyết định khác, IT hủy; hủy tác vụ của Request chưa rút    | integration + PostgreSQL | `AWAITING_IT_CLOSE` giữ cam kết và chỗ; `409`; sau hủy `WITHDRAWN`, cam kết `RELEASED`, chỗ nhả; `409 NO_WITHDRAWAL`   | xem plan                 |
| US-05-08 AC-12   | hai Request cùng lô, rút một                                                         | integration              | mục rời lô lý do `REQUEST_WITHDRAWN`, có lúc; Request kia nguyên                                                       | xem plan                 |
| US-06-14 AC-14   | trưởng phòng rút Request bị dữ liệu chặn, không lý do, lý do trống, ở chặng khác     | integration              | `422 REASON_REQUIRED`; `422 VALIDATION_ERROR`; `WITHDRAWN`; chặng chờ người duyệt `403`                                | xem plan                 |
| Toàn vẹn dữ liệu | cột rút lệch trạng thái; tác vụ hủy lúc đang làm hay đã xong; assignment hủy hai lần | integration PostgreSQL   | `23514`, `55000` (tác vụ và assignment hủy là cuối cùng, không đổi, không xóa)                                         | xem plan                 |
| Quy tắc thuần    | ai rút ở từng trạng thái, trưởng phòng ở từng chặng                                  | unit                     | 9 ca                                                                                                                   | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

24/10/2026: thiết kế `ready`, implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Rút Request ở mọi bước còn chờ, hủy tác vụ chưa ai làm cùng assignment, đường chờ IT đóng khi tác vụ lỗi; vế _chờ chấp nhận_ của connector (AC-9, AC-11) chưa làm vì BE chưa có trạng thái đó. Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.

24/10/2026 (sau `g5-group-requests`): `POST /access-requests/{id}/withdraw` trên Request nhóm giao `GroupWithdrawalService` (rút mọi dòng chưa kết thúc theo cùng quy tắc, khóa tác vụ của từng người trước Request); cổng cấp phát và các cửa hủy của licensing nhận thêm `employeeId`.

25/10/2026 (sau `g6-leaver-request-closure`): phần kết thúc dùng chung của `WithdrawalService` (đóng bước, đóng câu hỏi Finance, rời lô, giải phóng cam kết) nay nằm ở `RequestEndService.close`, không đổi hành vi và API (18 ca `access-request-withdrawal` giữ nguyên); `ProvisioningCancellationService.cancelForWithdrawal` nhận thêm `cause`/`evidence` và `GrantCancellation` có thêm `EVIDENCE_REQUIRED`; `CANCELLED` được coi như `WITHDRAWN` ở mọi nơi liệt kê trạng thái kết thúc.

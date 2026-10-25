# Spec: trưởng phòng duyệt hoặc từ chối bước nhu cầu và bản ghi phê duyệt điện tử

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — từ bản đồ phân rã G5 và BRD/US đã pin.
- Thiết kế: `ready`. Owner review: chưa review; ADR-0015 vẫn `Proposed`.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — `US-05-04`, `US-01-12`; `QĐ-52c`, `QĐ-53a`, `QĐ-66k`), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Người đang giữ bước nhu cầu (trưởng phòng, Người duyệt chi hoặc approver dự phòng theo bảng định tuyến) duyệt hoặc từ chối bước đó, từ chối bắt buộc có lý do và duyệt thời hạn trên 12 tháng phải kèm xác nhận tường minh. Mỗi quyết định thành một bản ghi phê duyệt điện tử không sửa được cùng một dòng Audit Trail; Request sang bước kế tiếp của nhánh đã chốt hoặc kết thúc _bị từ chối_ mà không bước duyệt chi hay khoản cam kết nào. Kiểm bằng `POST /access-requests/{id}/need-decision` rồi `GET`.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: Người giữ bước nhu cầu quyết bước đó và quyết định thành bản ghi phê duyệt điện tử; capability `access-request` của `requests`.
- Boundaries: một transaction khóa Request, đổi trạng thái bước và Request, ghi `approval_records` và một sự kiện audit; API `POST /access-requests/{id}/need-decision`; chỉ người đang giữ bước; không có bước duyệt chi, ngân sách, cam kết hay cấp phát.
- Not larger: xem seat cùng nhóm và cờ ngoài bộ chuẩn (`g5-manager-request-review-view`), dòng kế hoạch, ngày dự kiến và hàng đợi trình (`g5-spend-submission-batches`) và quyết theo từng người của yêu cầu nhóm (`g5-group-requests`) là việc đọc hoặc dữ liệu khác, mỗi nơi một bộ test riêng.
- Not smaller: quyết định, trạng thái hai tầng (bước và Request) và bản ghi phê duyệt chỉ có nghĩa cùng một transaction; một Story `US-01-12` chỉ góp hai AC về bản ghi nên đi cùng, không có kết quả kiểm chứng riêng.
- Siblings: `g3-downstream-finance-integration`, `g4-request-and-transfer-integration`, `g5-group-requests`, `g5-it-assessment-of-new-software`, `g5-manager-request-review-view`, `g5-request-submission-and-routing`, `g5-request-withdrawal`, `g5-return-and-renewal-requests`, `g5-spend-submission-batches`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                                | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                              |
| -------- | --------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-01-12 | AC-6, AC-7                        | partial  | AC-1: `g5-request-submission-and-routing`; AC-2: `g5-it-assessment-of-new-software`; AC-3: `g5-return-and-renewal-requests`; AC-4, AC-8, AC-9: `g4-request-and-transfer-integration`; AC-5: `g5-request-withdrawal`; AC-10: `g3-downstream-finance-integration` |
| US-05-04 | AC-1, AC-2, AC-4→AC-6, AC-8→AC-10 | partial  | AC-3, AC-7: `g5-manager-request-review-view`; AC-11→AC-13, AC-15, AC-16: `g5-spend-submission-batches`; AC-14: `g5-group-requests`                                                                                                                              |

## Supporting references

`US-05-03` (bảng định tuyến — ai giữ bước), `US-05-01` AC-4 (nêu trước thời hạn trên 12 tháng), `US-06-14` (hàng đợi trình duyệt chi), `US-06-01` (bản ghi của bước duyệt chi, có snapshot); `FR-3.7`, `FR-3.11`, `FR-3.18`; `BR-07.4`, `BR-07.5`, `BR-13.4`; `SoD-4`, `INV-05`, `INV-08`; `QĐ-53a`, `QĐ-52c`, `QĐ-66k`; `OI-07a`.

## Explicit out of scope

- Hiển thị seat cùng nhóm chức năng và cờ _ngoài bộ chuẩn_: `g5-manager-request-review-view`. Bước này vẫn quyết được khi chưa có phần hiển thị.
- Gắn dòng kế hoạch hay _ngoài kế hoạch_, xác nhận _còn nhu cầu_ của dòng quá hạn, sửa ngày dự kiến phát sinh khoản chi, quyền xem dòng kế hoạch, hàng đợi trình: `g5-spend-submission-batches`. **Hệ quả đã ghi:** tới khi hạng mục đó giao, duyệt nhu cầu của Request trả phí chưa đòi gắn dòng kế hoạch (chưa có dòng kế hoạch nào để gắn) và đưa Request vào trạng thái `AWAITING_SPEND_SUBMISSION`, chưa vào hàng đợi trình thật.
- Quyết theo từng người thụ hưởng của yêu cầu nhóm: `g5-group-requests`.
- Tạo bước duyệt chi, kiểm tra ngân sách, Finance rà soát, khoản cam kết: các hạng mục `g5-budget-*`, `g5-spend-*`, `g5-commitment-*`.
- Thông báo kết quả cho người yêu cầu: `g5-request-status-notifications`. Quyết định ở đây chỉ ghi dữ liệu và audit.
- Tạo tác vụ cấp phát cho nhánh (a) sau khi duyệt: `g5-internal-software-path`.
- Sửa hồ sơ `BM-01` sau khi bước đã quyết, hồ sơ bổ sung (`US-01-12` AC-5): `g5-request-withdrawal`.

## Dependencies and blockers

`g5-request-submission-and-routing` (Request và bước nhu cầu) — đã `verified` local. Không có blocker ngoài. Hai migration mới đi trước code dùng chúng: thêm giá trị enum (một migration riêng, vì PostgreSQL không cho dùng giá trị enum mới trong cùng transaction thêm nó) rồi bảng, cột và ràng buộc.

## Ownership: module, data, API

- **Module:** `requests`, capability `access-request/` (không thêm capability: cùng aggregate và ranh giới transaction với hạng mục trước). Quyết định là một use case riêng `need-decision.service.ts`; chính sách thuần `need-decision.policy.ts`.
- **Đọc qua facade:** `OrganizationService` (tên người, phòng), như hạng mục trước; không thêm facade mới.
- **Dữ liệu:** thêm giá trị `AWAITING_EXECUTION`, `AWAITING_SPEND_SUBMISSION`, `REJECTED` cho `AccessRequestState` và `APPROVED`, `REJECTED` cho `AccessRequestStepState`; cột `access_request_steps.decided_at`; bảng mới `approval_records` (một bản ghi cho một bước, `UNIQUE (step_id)`; quyết định, người quyết, **vai tại thời điểm quyết** — `MANAGER`, `SPENDING_APPROVER` hoặc `FALLBACK_APPROVER` —, phòng, lý do, lý do xác nhận thời hạn, thời điểm). **Bản ghi không sửa được ở tầng CSDL**: trigger từ chối `UPDATE`, `DELETE` và `TRUNCATE` như `audit_events` (`US-05-04` AC-9, `INV-05`). Ràng buộc CHECK thay thế `access_request_steps_holder_check`: bước đã quyết vẫn có người giữ, thời điểm được giao và `decided_at`; bước chưa quyết không có `decided_at`; từ chối bắt buộc lý do không trống.
- **API:** `POST /api/v1/access-requests/{id}/need-decision` (`accessRequestNeedDecide`, 200 `ACCESS_REQUEST.NEED_DECIDED`), `@AuthenticatedOnly()`. `GET /access-requests/{id}` thêm trường `needDecision` (một object hoặc null, không mảng) và mở rộng enum trạng thái; không đổi trường cũ.

## Behavior and design

**Quyết (`POST .../need-decision`).** Body (`strictObject`): `decision` (`APPROVE` | `REJECT`), `reason` (tùy chọn, 1–1000, cắt khoảng trắng), `termConfirmation` (tùy chọn, `{ reason }` 1–1000). Từ chối **bắt buộc** `reason`; `termConfirmation` chỉ đi với duyệt; mọi trường lạ — kể cả `signature` hay `certificate` — bị `VALIDATION_ERROR` 422 (`US-01-12` AC-7: không có chữ ký số). Duyệt không bắt buộc lý do (`BR-07.5`).

Trong một `TransactionRunner.run`: (1) khóa Request `FOR UPDATE` (hai lần quyết đồng thời xếp hàng, lần sau thấy bước đã quyết); (2) không tồn tại hoặc người gọi không có phần trong Request ⟹ 404 `ACCESS_REQUEST.NOT_FOUND`; (3) người gọi là người yêu cầu hoặc người thụ hưởng ⟹ 403 `ACCESS_REQUEST.OWN_REQUEST` (`SoD-4`, kể cả khi vai cho phép duyệt — AC-8); (4) người gọi không phải người đang giữ bước ⟹ 403 `ACCESS_REQUEST.NOT_THE_ASSIGNEE` và bước không đổi (AC-4); (5) bước không còn chờ (đã quyết, hoặc Request đang chờ có kiểm soát vì chưa có người) ⟹ 409 `ACCESS_REQUEST.STEP_NOT_PENDING`; (6) duyệt mà `termMonths` > 12 và thiếu `termConfirmation` ⟹ 422 `ACCESS_REQUEST.TERM_CONFIRMATION_REQUIRED` (AC-6, `OI-07a`); (7) ghi.

**Hệ quả của quyết.** Từ chối: bước `REJECTED`, Request `REJECTED`; không bước duyệt chi, không khoản cam kết (AC-2, AC-5). Duyệt: bước `APPROVED`; Request sang `AWAITING_EXECUTION` (nhánh nội bộ không phí: IT thực hiện thủ công) hoặc `AWAITING_SPEND_SUBMISSION` (nhánh trả phí: chờ trưởng phòng trình, chưa bước nào giao Người duyệt chi); **không thêm bước** khi thời hạn dài (AC-6). Người giữ bước nhu cầu là Người duyệt chi hay approver dự phòng chịu cùng quy tắc (AC-8).

**Bản ghi phê duyệt điện tử (`US-05-04` AC-9, `US-01-12` AC-6).** Mỗi quyết định ghi một dòng `approval_records` gồm người quyết, vai tại thời điểm đó suy từ hàng định tuyến đã chốt (hàng 1 ⟹ `MANAGER`, hàng 2 ⟹ `SPENDING_APPROVER`, hàng 3–4 ⟹ `FALLBACK_APPROVER`), phòng, quyết định, lý do và thời điểm. Bước duyệt chi (hạng mục sau) thêm bản ghi của nó cùng bảng, kèm snapshot. Cùng transaction có một sự kiện audit `ACCESS_REQUEST.NEED_APPROVED` hoặc `ACCESS_REQUEST.NEED_REJECTED` ghi người được giao và người quyết thực tế (AC-1); không ghi lý do nghiệp vụ vào audit. Sửa sai bằng sự kiện audit mới, không sửa bản ghi.

**Đọc.** `needDecision` của `GET` gồm quyết định, người quyết, vai, lý do, lý do xác nhận thời hạn, thời điểm; do mọi người xem được Request đọc (người yêu cầu thấy lý do bị từ chối), không có thêm quyền.

**Kênh.** API không phân biệt web hay mobile (`US-05-04` AC-10, `US-01-12`): cùng quy tắc, cùng bản ghi.

**Migration và tương thích.** Hai migration mới, không sửa migration của hạng mục trước; không có down migration (`DB-05`: `ALTER TYPE ... ADD VALUE`). Request đã gửi ở trạng thái `PENDING` quyết được bình thường. FE chưa có consumer.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):** (a) người không có phần trong Request nhận 404, người có phần nhưng không giữ bước nhận 403; (b) tên trạng thái `AWAITING_EXECUTION`, `AWAITING_SPEND_SUBMISSION`, `REJECTED` — BRD chỉ mô tả vòng đời, không đặt tên; (c) vai tại thời điểm suy từ hàng định tuyến chứ không đọc lại vai hiện hành, vì vai có thể đổi sau khi gửi; (d) một Request đang chờ có kiểm soát chưa quyết được cho tới khi hạng mục giao lại bước chạy.

## Test matrix

| AC / rủi ro                   | Tình huống (gồm từ chối, edge case)                                                                          | Cấp test                        | Kết quả mong đợi                                                                                                      | Bằng chứng sau implement |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| US-05-04 AC-1                 | Trưởng phòng duyệt Request nội bộ và Request trả phí                                                         | integration HTTP + CSDL         | bước `APPROVED`; Request `AWAITING_EXECUTION` / `AWAITING_SPEND_SUBMISSION`; audit ghi người được giao và người quyết | xem plan                 |
| US-05-04 AC-2, AC-5           | Từ chối không lý do; từ chối có lý do trên nhánh trả phí                                                     | integration                     | 422 và không đổi gì; `REJECTED`, không bước hay cam kết nào, lý do đọc lại được                                       | xem plan                 |
| US-05-04 AC-4                 | Trưởng phòng phòng khác; IT Admin; người yêu cầu                                                             | integration                     | 404 (không có phần); 403 `NOT_THE_ASSIGNEE`; 403 `OWN_REQUEST`; bước không đổi                                        | xem plan                 |
| US-05-04 AC-6                 | Thời hạn 18 tháng: duyệt thiếu xác nhận, có xác nhận; thời hạn 12 tháng không cần                            | unit (chính sách) + integration | 422 `TERM_CONFIRMATION_REQUIRED`; có xác nhận đi tiếp không thêm bước; 12 tháng đi tiếp                               | xem plan                 |
| US-05-04 AC-8                 | Trưởng phòng tự gửi: chính họ cố quyết; Người duyệt chi quyết với cùng quy tắc                               | integration                     | 403 `OWN_REQUEST`; Người duyệt chi duyệt và phải xác nhận thời hạn dài                                                | xem plan                 |
| US-05-04 AC-9, US-01-12 AC-6  | Bản ghi sau duyệt và sau từ chối; `UPDATE`, `DELETE`, `TRUNCATE` bản ghi                                     | integration (SQL thuần)         | đủ người quyết, vai, phòng, quyết định, lý do, thời điểm; CSDL từ chối sửa và xóa (`restrict_violation`)              | xem plan                 |
| US-05-04 AC-10, US-01-12 AC-7 | Gọi từ client khác; thêm `signature` hay `certificate`                                                       | integration                     | cùng kết quả; 422                                                                                                     | xem plan                 |
| Quyết lại, đồng thời          | Hai lần quyết cùng bước; Request chờ có kiểm soát                                                            | integration                     | lần sau 409 `STEP_NOT_PENDING`; bản ghi duy nhất (`UNIQUE (step_id)`)                                                 | xem plan                 |
| Nguyên tử                     | Sự kiện audit ném lỗi                                                                                        | integration                     | 500 và Request, bước, bản ghi không đổi                                                                               | xem plan                 |
| Ràng buộc CSDL                | Bước đã quyết thiếu `decided_at`; bước chưa quyết có `decided_at`; từ chối không lý do; hai bản ghi một bước | integration (SQL thuần)         | `23514` hoặc `23505`                                                                                                  | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: thiết kế `ready`. Bản đồ phân rã G5 đổi hai chỗ khi thiết kế hạng mục này: `US-01-12` AC-5 chuyển sang `g5-request-withdrawal` (cơ chế hồ sơ bổ sung cần cho rút và trình lại), `US-05-04` AC-3 và AC-7 tách thành hạng mục chỉ đọc `g5-manager-request-review-view`. Chưa implement, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.

24/10/2026 (sau `g5-group-requests`): `US-05-04` AC-14 đã làm ở `g5-group-requests` (`POST /access-requests/{id}/line-need-decisions`); `POST .../need-decision` trả `409 ACCESS_REQUEST.GROUP_USES_LINES` với Request nhóm; phần chọn dòng kế hoạch tách thành `NeedSpendService` dùng chung; `deciderRoleOf` nhận hàng 5 và 9.

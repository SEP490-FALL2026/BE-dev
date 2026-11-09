# Spec: trưởng phòng tạo Request thay cho nhân viên trong phòng

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Trưởng phòng gửi yêu cầu thay cho người trong phòng (kể cả người mới chưa tới ngày vào) trong một lần: mỗi người và mỗi công cụ là một Request riêng, cùng một mã lô, có người yêu cầu là trưởng phòng và người thụ hưởng là nhân viên, mỗi Request một nhánh và số tiền riêng. Bước nhu cầu ghi _đã xác nhận_ ngay lúc gửi (người xác nhận là trưởng phòng, người thụ hưởng, thời điểm; `routing_row = 5`), không ai phải xác nhận lại; Request có chi phí nằm ngay trong hàng đợi trình duyệt chi của trưởng phòng và Người duyệt chi chưa có bước nào, Request nội bộ đi thẳng tới IT. Chỉ trưởng phòng của đúng phòng gửi được; người ngoài phòng, người thiếu email công việc, thực tập sinh/nhà thầu thiếu ngày kết thúc và công cụ ngoài bộ chuẩn thiếu lý do đều bị từ chối, và lỗi của một người hay một công cụ khiến cả lần gửi không tạo gì. Phần của trưởng phòng khi họ nằm trong danh sách đi theo bảng định tuyến như Request của chính họ. Người duyệt chi là người thụ hưởng hay là trưởng phòng gửi thì bước chi giao người thay thế. IT Admin đọc hàng đợi chờ cấp phát, gộp theo người. Kiểm bằng 15 ca tích hợp và 16 ca chính sách thuần.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: Trưởng phòng tạo Request thay cho nhân viên trong phòng.
- Boundaries: Cùng bảng Request; thêm người tạo thay; chỉ trưởng phòng của phòng người thụ hưởng; Request có chi phí vào hàng đợi trình.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: `g5-group-requests`, `g5-request-submission-and-routing`, `g5-spend-approval-decision`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Size exception

- Cohesion: Một outcome: trưởng phòng tạo Request thay người khác trong phòng; mỗi Story chỉ góp phần dành riêng cho việc tạo thay (hồ sơ của người tạo, bước nhu cầu đã xác nhận, người thụ hưởng ngoài phòng bị từ chối, bước chi giao người thay thế khi Người duyệt chi là người thụ hưởng).
- Why not split: Mọi AC dùng chung một đường tạo Request và cùng một bộ test tạo thay; tách theo Story chỉ lặp lại đường đó và không kiểm chứng được riêng.
- Checkpoints: Phase 1 tạo thay và bước nhu cầu đã xác nhận; Phase 2 người thụ hưởng, hàng đợi trình và bước chi giao đúng người; mỗi phase kết thúc bằng gate xanh.
- Maximum scope: Chỉ AC nêu ở bảng Primary; không thêm yêu cầu nhóm (hạng mục group), không thêm quyết định của Người duyệt chi (hạng mục spend).
- Accepted by: AI theo giao việc của người dùng, 23/10/2026 — chờ Owner xác nhận, chưa phải Owner duyệt.

## Primary Story/AC

| Story    | AC               | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                                                               |
| -------- | ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-03-02 | AC-1, AC-3→AC-14 | partial  | AC-15: vế Người duyệt chi `qd93-remove-fallback-substitute-approvers`, vế _chưa xếp phòng_ `qd93-unplaced-employee-first-placement`                                                                                                                                                                              |
| US-05-03 | AC-6, AC-7       | partial  | AC-1, AC-2, AC-9→AC-13: `g5-request-submission-and-routing`; AC-4, AC-15: `qd93-remove-fallback-substitute-approvers` (AC-15 vế _chưa xếp phòng_: `qd93-unplaced-employee-first-placement`); AC-8, AC-14: `g5-group-requests`                                                                                    |
| US-05-02 | AC-5             | partial  | AC-3, AC-6, AC-7, AC-9, AC-10, AC-12: `g5-request-submission-and-routing`; AC-1, AC-4, AC-11: `g5-request-amount-and-payment-schedule`; AC-2: `g5-group-requests`; AC-8: `g5-it-assessment-of-new-software`; AC-13: `qd93-remove-fallback-substitute-approvers`; AC-14: `qd93-unplaced-employee-first-placement` |

## Supporting references

`FR-3.2`, `QĐ-62a`, `QĐ-66ak`, `QĐ-82m` C.

## Explicit out of scope

- Chọn dòng kế hoạch, gửi lô trình duyệt chi và quyết của Người duyệt chi: đã có ở `g5-spend-submission-batches`, `g5-spend-approval-decision`; hạng mục này chỉ làm Request đi vào đó đúng.
- Nhiều người thụ hưởng trong _một_ Request và rút một người (`US-05-17`, `US-05-03` AC-8, AC-14, `US-05-02` AC-2): `g5-group-requests`. Ở đây mỗi (người, công cụ) là một Request.
- Màn tạo thay ở ứng dụng (bộ công cụ chuẩn hiện trước, danh sách nhân viên hiện cả người chưa tới ngày vào): BE có `GET /standard-toolsets/...` và `GET /departments/{id}/employees`; thứ tự hiển thị thuộc giao diện.
- Cấp phát từ hàng đợi và tác vụ (`US-07-01`): đã có ở nhóm cấp phát; ở đây chỉ đọc hàng đợi.
- Mọi AC của các Story trên mà bảng Primary không liệt kê: chủ của chúng ở cột _Phần còn lại thuộc_ và ở scope map G5.

## Dependencies and blockers

`g5-request-submission-and-routing` (gửi, định tuyến), `g5-manager-need-decision` (bước nhu cầu, người ghi quyết), `g5-spend-submission-batches` và `g5-spend-approval-decision` (đường đi sau khi xác nhận). Không có blocker ngoài. Một migration.

## Ownership: module, data, API

- **Module `requests`, capability `access-request/`:** `delegated-request.policy.ts` (thuần: ai gửi cho ai, cần gì), `delegated-request.service.ts` (một transaction, tất cả hoặc không), `delegated-requests.controller.ts`, `delegated-request.dto.ts`, `grant-queue.repo.ts` và `grant-queue.service.ts` (đọc hàng đợi chờ cấp phát). `RequestAssessmentService.assess` nhận thêm người gửi để định tuyến từ họ trong khi toolset, phòng và seat đọc theo người thụ hưởng. `GrantRequestAnswer` mang `expectedEndDate`, `ProvisioningService.grant` lấy làm ngày kết thúc seat khi IT Admin không nêu ngày khác.
- **Dữ liệu:** `20261024020000_requests_delegated_requests`: `access_requests.delegated_batch_id` (mã lô, có chỉ mục) và `expected_end_date`. Người xác nhận nằm ở bản ghi phê duyệt điện tử có sẵn (`routing_row = 5`, vai `MANAGER`).
- **API (205 → 207):** `POST /delegated-requests` (trưởng phòng gửi, 201, trả mã lô và các Request); `GET /grant-queue` (IT Admin, lọc theo người, gộp theo người). Wire của Request thêm `delegatedBatchId` và `expectedEndDate`.
- **Audit:** `ACCESS_REQUEST.SUBMITTED` (kèm `delegated`, mã lô), `ACCESS_REQUEST.NEED_STEP_ROUTED` (hàng 5) và `ACCESS_REQUEST.NEED_APPROVED` (`delegated`) cho từng Request.

## Behavior and design

**Ai gửi cho ai (`AC-5`, `AC-11`, `US-05-03` AC-7).** Người gọi phải là trưởng phòng của phòng mình hôm nay (403 `NOT_HEAD`); mỗi người thụ hưởng phải thuộc đúng phòng đó (422 `OUTSIDE_DEPARTMENT`, kể cả người không có trong hệ thống), còn làm việc (409 `BENEFICIARY_NOT_ACTIVE`) và có email công việc (422 `EMAIL_REQUIRED`, `AC-3`). Người mới thuộc phòng từ lúc hồ sơ được ghi vào phòng, không cần đợi ngày vào (`AC-12`, `QĐ-66ak`). Thực tập sinh, nhà thầu và cộng tác viên cần `expectedEndDate` không sớm hơn ngày sớm nhất quyền có thể bắt đầu (422 `END_DATE_REQUIRED`, `END_DATE_TOO_EARLY`, `AC-10`); mọi Request của lần gửi mang ngày đó. Kỳ hạn quá 12 tháng cần lời xác nhận (`OI-07a`).

**Mỗi Request riêng (`AC-1`, `AC-9`, `US-05-02` AC-5).** Với mỗi người và mỗi công cụ: đánh giá theo phòng, toolset và seat của người thụ hưởng và định tuyến từ người gửi; người đã giữ seat của công cụ đó thì cả lần gửi bị từ chối (409 `ALREADY_HOLDS_ACCESS`); công cụ ngoài bộ chuẩn thiếu lý do thì 422 `OUTSIDE_STANDARD_REASON_REQUIRED`, có lý do thì Request gắn cờ _ngoài bộ chuẩn_ (`AC-7`). Nhánh và số tiền tính riêng cho từng Request (nội bộ `INTERNAL_FREE`, trả phí `PAID_IN_CATALOG`).

**Xác nhận bằng việc gửi (`AC-1`, `US-05-03` AC-6).** Với người khác trưởng phòng, bước nhu cầu được ghi `APPROVED` ngay lúc tạo: người giữ bước là trưởng phòng, hàng 5, bản ghi phê duyệt do trưởng phòng ký với vai `MANAGER` kèm thời điểm và xác nhận kỳ hạn dài nếu có. Request chuyển sang `AWAITING_SPEND_SUBMISSION` (trả phí) hay `AWAITING_EXECUTION` (nội bộ). Không có bước nhu cầu nào chờ ai.

**Đi tiếp (`AC-13`, `US-06-08` AC-2, AC-9).** Request trả phí nằm trong hàng đợi của trưởng phòng với `AWAITING_SPEND_SUBMISSION`; Người duyệt chi không có bước nào cho tới khi trưởng phòng gắn dòng hay _ngoài kế hoạch_ và trình. Khi Người duyệt chi là người yêu cầu hay người thụ hưởng, bước chi giao người thay thế (đường của hạng mục duyệt chi) và họ không quyết được.

**Phần của trưởng phòng (`AC-8`).** Khi trưởng phòng nằm trong danh sách, Request của họ tạo với người yêu cầu và người thụ hưởng là họ, không có xác nhận, bước nhu cầu theo bảng định tuyến hàng 2 hay 3; phần của người khác vẫn xác nhận bằng việc gửi.

**Hàng đợi cấp phát (`AC-6`).** `GET /grant-queue` trả các Request ở `AWAITING_EXECUTION` có công cụ, xếp theo người thụ hưởng rồi theo lúc gửi nên việc của một người nằm cạnh nhau; lọc theo người; chỉ IT Admin đọc. Người chưa tới ngày vào thì lệnh cấp phát bị từ chối (đường có sẵn `BENEFICIARY_NOT_STARTED`) nên quyền không bắt đầu sớm hơn ngày vào (`AC-4`).

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Cả lần gửi là một transaction: một người hay công cụ không hợp lệ thì không Request nào được tạo, kèm người gây lỗi ở `details`.
- Mã lô là giá trị trên Request, không có bảng lô; tối đa 50 Request mỗi lần gửi.
- Quyền chỉ bắt đầu từ ngày vào bằng cách chưa cấp trước ngày đó, chưa đặt trước ngày hiệu lực trong tương lai (BE chưa có Assignment hiệu lực tương lai).
- Hàng đợi cấp phát gộp theo mã người thụ hưởng (cạnh nhau), chưa xếp theo tên vì bảng nhân viên thuộc `organization`.
- Ngày kết thúc cho người không phải nhân viên chính thức được lưu ở Request và làm mặc định cho seat; IT Admin vẫn nêu ngày khác khi cấp.

## Test matrix

| AC / rủi ro                         | Tình huống (gồm từ chối, edge case)                                                                  | Cấp test                 | Kết quả mong đợi                                                                                                                              | Bằng chứng sau implement |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| US-03-02 AC-1, AC-9, US-05-03 AC-6  | trưởng phòng gửi hai công cụ trả phí và một nội bộ cho N1                                            | integration + PostgreSQL | 3 Request cùng mã lô; người yêu cầu/thụ hưởng tách; bước nhu cầu `APPROVED` hàng 5, người ký và vai; mỗi nhánh và số tiền; không bước nào chờ | xem plan                 |
| US-05-02 AC-5                       | Audit của một Request                                                                                | integration              | `SUBMITTED`, `NEED_STEP_ROUTED`, `NEED_APPROVED`; người yêu cầu và người thụ hưởng khác nhau                                                  | xem plan                 |
| US-03-02 AC-13                      | Request trả phí và nội bộ                                                                            | integration              | trả phí trong hàng đợi trình của trưởng phòng, không có bước chi; nội bộ trong hàng đợi IT                                                    | xem plan                 |
| US-03-02 AC-6                       | hai người, hai công cụ nội bộ mỗi người                                                              | integration              | việc của một người nằm cạnh nhau; lọc theo người; vai khác 403                                                                                | xem plan                 |
| US-03-02 AC-11, AC-5, US-05-03 AC-7 | nhân viên thường, IT Admin, trưởng phòng khác phòng; người khác phòng trong danh sách                | integration              | 403 `NOT_HEAD`; 422 `OUTSIDE_DEPARTMENT`; không Request nào kể cả người hợp lệ đứng trước                                                     | xem plan                 |
| US-03-02 AC-3                       | N2 chưa có email                                                                                     | integration              | 422 `EMAIL_REQUIRED`, không Request                                                                                                           | xem plan                 |
| US-03-02 AC-7                       | công cụ ngoài bộ chuẩn không lý do, có lý do                                                         | integration              | 422; có cờ _ngoài bộ chuẩn_ và lý do                                                                                                          | xem plan                 |
| US-03-02 AC-10                      | thực tập sinh không ngày, ngày quá sớm, có ngày; cấp phát                                            | integration              | 422 hai mã; Request mang ngày; seat có `expected_end_date` đó                                                                                 | xem plan                 |
| US-03-02 AC-4, AC-12                | N1 vào làm sau 10 ngày                                                                               | integration              | N1 có trong danh sách phòng, gửi được; cấp trước ngày vào bị từ chối, đúng ngày vào cấp được, `valid_from ≥ hire_date`                        | xem plan                 |
| US-03-02 AC-8                       | trưởng phòng và N1 cùng được chọn                                                                    | integration              | phần trưởng phòng `PENDING` hàng 2 giao Người duyệt chi, không bản ghi phê duyệt; phần N1 xác nhận hàng 5; cùng mã lô                         | xem plan                 |
| US-06-08 AC-2                       | Người duyệt chi là người thụ hưởng                                                                   | integration              | bước chi giao người thay thế; người thụ hưởng không quyết được (403)                                                                          | xem plan                 |
| US-06-08 AC-9                       | Người duyệt chi là trưởng phòng gửi cho E7                                                           | integration              | bước nhu cầu xác nhận bởi họ; bước chi giao người thay thế; họ 403 và 404 ở bảng                                                              | xem plan                 |
| Đầu vào                             | người đã rời, không tồn tại, công cụ không tồn tại, trống, trùng, kỳ hạn 0, lý do trống, trường thừa | integration              | 409, 422, 404                                                                                                                                 | xem plan                 |
| Quy tắc thuần                       | ai gửi cho ai, email, ngày kết thúc, phần của trưởng phòng                                           | unit                     | 16 ca                                                                                                                                         | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Trưởng phòng gửi yêu cầu thay cho người trong phòng; bước nhu cầu xác nhận bằng việc gửi; hàng đợi chờ cấp phát cho IT Admin gộp theo người; ngày kết thúc của người không phải nhân viên chính thức thành ngày kết thúc seat. Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.

24/10/2026 (sau `g5-group-requests`): quy tắc người thụ hưởng tách ra `beneficiary-eligibility.policy.ts` dùng chung với Request nhóm; `checkDelegation` giữ nguyên kết quả.

01/11/2026 — `QĐ-93` (Docs `69e8a3d`): `US-06-08` `RETIRED` (`QĐ-93d`) — AC-2, AC-9 bỏ khỏi bảng (khóa lịch sử `not affected` ở scope map G5); AC mới `US-03-02` AC-15 thuộc `qd93-remove-fallback-substitute-approvers` và `qd93-unplaced-employee-first-placement`, dòng `US-03-02` đổi sang `partial`; `US-05-03` AC-3, AC-5 bỏ, AC-4 chuyển sang `qd93-remove-fallback-substitute-approvers` (cột cuối).

## Mở lại theo baseline `769bb64` (Prompt 03, 26/10/2026)

- Audit G0–G6 trên Docs `769bb64` ↔ BE `7c28e75` mở lại hạng mục này: F04, F27 — bỏ _ngoài bộ chuẩn_; cổng tài chính.
- Remediation duy nhất: [g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md) ([impact matrix](../g0-g6-final-business-baseline-remediation/impact-matrix.md#3-findings)). AC liên quan không còn được coi là thỏa nguồn hiện hành cho tới khi remediation xong; trạng thái triển khai ở roadmap. Phần đã ghi phía trên là lịch sử, giữ nguyên.
- _27/10/2026 (Prompt 04, Task 0.1 của `g0-g6-final-business-baseline-remediation`, F60 — re-pin scope map [G5](../../../roadmap.md#work-item-decomposition-g5) Docs `e0cb5a0`, BE `7c28e75`):_ nhận thêm `US-03-02` AC-14 (F27 — cổng cấu hình tài chính khi trưởng phòng gửi thay; mục 9 không có cột chủ đề xuất, gán theo hạng mục đang chủ Story — chờ xác nhận) ([impact matrix mục 9](../g0-g6-final-business-baseline-remediation/impact-matrix.md#9-phụ-lục-delta-user-stories-72e1480--769bb64)). Phần đã ghi phía trên là lịch sử, giữ nguyên.

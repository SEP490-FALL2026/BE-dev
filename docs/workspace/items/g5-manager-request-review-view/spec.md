# Spec: trưởng phòng xem yêu cầu kèm seat cùng nhóm chức năng và cờ ngoài bộ chuẩn

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Trưởng phòng được giao bước nhu cầu xem yêu cầu kèm các seat người thụ hưởng đang giữ ở phần mềm cùng nhóm chức năng và cờ _ngoài bộ chuẩn_ cùng lý do, để quyết nhu cầu và thấy công cụ trùng trước khi tiêu tiền. Kiểm bằng đọc yêu cầu và danh sách seat tương tự; chỉ đọc, không đổi dữ liệu.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: Trưởng phòng xem yêu cầu kèm seat cùng nhóm chức năng và cờ ngoài bộ chuẩn; capability `access-request` của `requests`.
- Boundaries: chỉ đọc; đọc seat đang giữ qua facade `licensing` và nhóm chức năng, bộ công cụ chuẩn qua facade `catalog`; chỉ người giữ bước nhu cầu đọc; không ghi dữ liệu.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: `g5-group-requests`, `g5-manager-need-decision`, `g5-spend-submission-batches`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC         | Coverage | Phần còn lại thuộc                                                                                                                                  |
| -------- | ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-05-04 | AC-3       | partial  | AC-1, AC-2, AC-4→AC-6, AC-8→AC-10: `g5-manager-need-decision`; AC-11→AC-13, AC-15, AC-16: `g5-spend-submission-batches`; AC-14: `g5-group-requests` |

## Supporting references

`US-04-10` (bộ công cụ chuẩn), `FR-3.18`, `BR-06.9`, `OI-14e`.

## Explicit out of scope

- Duyệt hay từ chối bước nhu cầu: `g5-manager-need-decision`. Xem seat và cờ chỉ đọc, không quyết gì.
- Gắn dòng kế hoạch, ngày dự kiến, hàng đợi trình, quyền xem dòng kế hoạch (`US-05-04` AC-11→AC-13, AC-15, AC-16): `g5-spend-submission-batches`.
- Quyết theo từng người của yêu cầu nhóm (`AC-14`): `g5-group-requests`. Danh sách seat tương tự ở đây đọc **một** người thụ hưởng; yêu cầu nhóm sẽ thêm tham số chọn người.
- Chặn Request khi người đó đã có đúng quyền ấy (`US-05-01` AC-2): `g5-request-preview`.
- AI tóm tắt, màn hình mobile.

## Dependencies and blockers

`g5-request-submission-and-routing`, `g5-manager-need-decision` (đã `verified` local), `g3-standard-toolset`, `g4-seat-baseline-import`. Không có blocker ngoài. Một migration thêm cột `access_requests.outside_standard`. Hướng phụ thuộc mới: `requests → licensing` (`RequestsModule` import `LicensingModule`); `licensing` không import `requests`, và cổng cấp phát sẽ nối bằng đăng ký ngược khi `g4-request-and-transfer-integration` được giao, không bằng import.

## Ownership: module, data, API

- **Module:** `requests`, capability `access-request/` (thêm `similar-seats.service.ts`).
- **Hợp đồng đọc mới, chỉ đọc:** `CatalogService.isPlanInStandardToolset` (bộ công cụ chuẩn hiện hành của phòng × chức vụ có gói không) và `CatalogService.getSimilarPlanIds` (gói của các ứng dụng khác cùng nhóm chức năng, tối đa 500, theo id); `LicensingService.getSeatsHeldInPlans` (một trang seat cá nhân người đó đang giữ hôm nay trong các gói đó và tổng, một snapshot `RepeatableRead`). Không đổi hành vi hiện có.
- **Dữ liệu:** cột `access_requests.outside_standard` (boolean, mặc định false), chụp lúc gửi vì _bộ mới chỉ áp cho yêu cầu mới_ (`US-04-10` AC-5). Ghi duy nhất ở `AccessRequestRepo`.
- **API:** `GET /api/v1/access-requests/{id}` thêm trường `outsideStandard`; `GET /api/v1/access-requests/{id}/similar-seats?page&pageSize` (`accessRequestSimilarSeatList`, 200 `ACCESS_REQUEST.SIMILAR_SEATS_LISTED`) là collection phân trang (`pageSize` ≤ 100, thứ tự `validFrom, id`), mỗi dòng có `assignmentId`, `plan`, `accountIdentifier`, `heldSince`; không mảng lồng.

## Behavior and design

**Cờ ngoài bộ chuẩn (AC-7).** Khi gửi, hệ thống lấy phòng và chức vụ của người gửi ngày gửi và hỏi `catalog` gói có trong bộ công cụ chuẩn của cặp đó không; **không có bộ chuẩn thì là ngoài bộ**. Kết quả lưu vào Request và hiện ở `GET` cùng `outsideStandardReason` của người gửi. Cờ chỉ là thông tin cho người quyết: không chặn duyệt hay từ chối (đã có test trưởng phòng duyệt một Request ngoài bộ). Việc bắt người gửi nhập lý do khi ngoài bộ (`FR-3.18`) thuộc `g5-request-preview`.

**Seat cùng nhóm chức năng (AC-3).** `catalog` trả các gói của ứng dụng _khác_ trong cùng nhóm với ứng dụng của gói được xin (không nhóm ⟹ rỗng); `licensing` trả trang seat cá nhân người thụ hưởng đang giữ hôm nay trong các gói đó (`valid_from ≤ hôm nay`, chưa kết thúc, chưa thất bại); `requests` gắn tên gói và ứng dụng bằng một lần gọi `getPlanSummaries` cho cả trang. Số câu lệnh không đổi theo số seat (test đếm câu lệnh hai cỡ dữ liệu). Chỉ **người đang giữ bước nhu cầu** đọc được: người có phần trong Request nhưng không giữ bước nhận 403 `ACCESS_REQUEST.NOT_THE_ASSIGNEE`, người không có phần nhận 404, không token 401.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):** (a) _cùng nhóm chức năng_ là cùng `functional_group_id` của ứng dụng, không cùng ứng dụng khác gói; (b) trần 500 gói tương tự là chặn kỹ thuật, không phải quy tắc BRD; (c) không có bộ chuẩn nghĩa là ngoài bộ, vì BRD chỉ nói công cụ _thuộc_ bộ chuẩn mới không mang cờ.

## Test matrix

| AC / rủi ro         | Tình huống (gồm từ chối, edge case)                                                                     | Cấp test                             | Kết quả mong đợi                                                      | Bằng chứng sau implement |
| ------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- | ------------------------ |
| US-05-04 AC-7       | gói ngoài bộ chuẩn kèm lý do; gói trong bộ; bộ đổi sau khi gửi; trưởng phòng vẫn duyệt Request ngoài bộ | integration HTTP + PostgreSQL        | `outsideStandard` đúng, cố định lúc gửi, lý do hiện, không chặn duyệt | xem plan                 |
| US-05-04 AC-3       | người thụ hưởng giữ seat trong hai công cụ cùng nhóm và một công cụ nhóm khác                           | integration                          | chỉ hai seat cùng nhóm, cũ trước, không seat nhóm khác                | xem plan                 |
| Phân trang, biên    | `pageSize` 1 và 101; ứng dụng không có nhóm                                                             | integration                          | trang đúng, `totalPages` đúng, 422; danh sách rỗng khi không nhóm     | xem plan                 |
| Quyền               | người gửi, IT Admin, Finance, không token                                                               | integration                          | 403 `NOT_THE_ASSIGNEE`, 403, 404, 401                                 | xem plan                 |
| `API-LIST-DETAIL.1` | 2 và 10 seat                                                                                            | integration (đếm câu lệnh qua relay) | số câu lệnh bằng nhau; trang 10 dòng                                  | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.

24/10/2026 (sau `g5-group-requests`): `GET /access-requests/{id}/similar-seats` nhận thêm `employeeId`, bắt buộc với Request nhóm (người đó phải là một dòng của bước mà người gọi giữ; thiếu là `422 ACCESS_REQUEST.EMPLOYEE_REQUIRED`).

## Mở lại theo baseline `769bb64` (Prompt 03, 26/10/2026)

- Audit G0–G6 trên Docs `769bb64` ↔ BE `7c28e75` mở lại hạng mục này: F04 — bỏ cờ _ngoài bộ chuẩn_.
- Remediation duy nhất: [g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md) ([impact matrix](../g0-g6-final-business-baseline-remediation/impact-matrix.md#3-findings)). AC liên quan không còn được coi là thỏa nguồn hiện hành cho tới khi remediation xong; trạng thái triển khai ở roadmap. Phần đã ghi phía trên là lịch sử, giữ nguyên.
- _27/10/2026 (Prompt 04, Task 0.1 của `g0-g6-final-business-baseline-remediation`, F60 — re-pin scope map [G5](../../../roadmap.md#work-item-decomposition-g5) Docs `e0cb5a0`, BE `7c28e75`):_ `US-05-04` AC-7 đã bỏ (cờ _ngoài bộ chuẩn_, F04); còn AC-3 ([impact matrix mục 9](../g0-g6-final-business-baseline-remediation/impact-matrix.md#9-phụ-lục-delta-user-stories-72e1480--769bb64)). Phần đã ghi phía trên là lịch sử, giữ nguyên.

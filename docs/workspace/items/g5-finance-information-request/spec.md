# Spec: Người duyệt chi hỏi Finance thông tin ngân sách và Finance trả lời

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Người duyệt chi (hay người thay thế khi họ là một bên) đang giữ bước duyệt chi có thể hỏi Finance một câu về ngân sách; Finance nhận câu hỏi trong hàng đợi của mình, trả lời bằng _Trong hạn mức_, _Vượt hạn mức_ hay _Chưa có ngân sách_ kèm ghi chú, và Người duyệt chi đọc câu trả lời ngay bên cạnh snapshot. Câu hỏi chỉ là ý kiến: bước vẫn giao cho người hỏi, đồng hồ SLA của bước không dừng và không đặt lại, quyết định không bị chặn kể cả khi Finance vắng hay chưa trả lời, và câu trả lời không sửa snapshot, không duyệt thay. Finance là một bên của Request hay chính là người duyệt chi của Request thì không trả lời được (`SoD-8`). Trả lời sau khi đã duyệt vẫn được lưu và quyết định giữ nguyên; câu hỏi đóng khi Request bị rút hoặc bước chi quay về không có quyết định, và khi đã đóng thì không trả lời được. Thời gian Finance trả lời tính riêng trên từng câu hỏi (`responseSeconds`), không cộng vào thời gian chờ của bước. Kiểm bằng 17 ca tích hợp và 14 ca chính sách thuần.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: Người duyệt chi hỏi Finance thông tin ngân sách và Finance trả lời.
- Boundaries: Một transaction ghi câu hỏi hoặc câu trả lời; bảng `budget_information_requests`; chỉ web; SoD-8.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: `g3-downstream-finance-integration`, `g5-commitment-lifecycle`, `g5-request-withdrawal`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC   | Coverage | Phần còn lại thuộc                                                                                                                              |
| -------- | ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| US-05-08 | AC-2 | partial  | AC-1, AC-3, AC-4, AC-6→AC-9, AC-11, AC-12: `g5-request-withdrawal`; AC-5: `g5-commitment-lifecycle`; AC-10: `g3-downstream-finance-integration` |

_Re-pin 11/11/2026 ([C3](../../../reviews/mf2-mf3-2026-11-10/C3-SCOPE-MAP-REPIN.md)):_ bỏ khỏi bảng `US-06-02` AC-1, AC-2, AC-4, AC-5, AC-7 (partial); `US-06-03` AC-1→AC-7 (full) — Story `RETIRED` ở Docs `5bb2e6a` (`US-06-02` `QĐ-29b`, `QĐ-97c`, `US-06-03` `QĐ-29b`, `QĐ-97c`); code đã merge là lịch sử, khóa ở scope map là `not affected`. Còn một Story nên `Mode` đổi `single-story`.

## Supporting references

`FR-3.14`, `SoD-8`, `QĐ-29b`, `QĐ-82m` A.

## Explicit out of scope

- Nhắc Finance trả lời và nhắc người duyệt khi quá SLA (`US-06-02` AC-3): cần tác vụ SLA nền, thuộc `g5-step-sla-and-alerts`, đọc các câu hỏi còn `OPEN` ở đây.
- Trạng thái _đã rút_ và thao tác rút Request (`US-05-08` AC-1, AC-3 trở đi): `g5-request-withdrawal`, gọi `BudgetInformationService.closeOpen` trong transaction rút; hạng mục này đã làm và kiểm vế đóng câu hỏi.
- Tổng hợp _thời gian Finance phản hồi_ thành chỉ số báo cáo quy trình (`US-12`): dữ liệu ở đây, báo cáo thuộc nhóm báo cáo.
- Hỏi trên ứng dụng mobile (`US-06-02` AC-7): BE không có khái niệm kênh; chỉ có thao tác web.
- Mọi AC của các Story trên mà bảng Primary không liệt kê: chủ của chúng ở cột _Phần còn lại thuộc_ và ở scope map G5.

## Dependencies and blockers

`g5-spend-approval-decision` (bước chi, người giữ bước, quyết định). Không có blocker ngoài. Một migration.

## Ownership: module, data, API

- **Module `requests`, capability `spend/`:** `budget-information.policy.ts` (thuần: ai hỏi, ai trả lời), `budget-information.service.ts` (hỏi, trả lời, `closeOpen` cho rút và bước quay về), `budget-information.repo.ts`, `budget-information-view.service.ts`, `budget-information.controller.ts`, `budget-information.dto.ts`. `SpendDecisionService` đóng các câu hỏi còn mở khi bước chi quay về không quyết (`STEP_CLOSED`); bảng của Người duyệt chi thêm `latestBudgetInformation`.
- **Dữ liệu:** `20261024000000_requests_budget_information`: bảng `budget_information_requests` (Request, bước, người hỏi, câu hỏi, lúc hỏi, trạng thái `OPEN`/`ANSWERED`/`CLOSED`, câu trả lời, ghi chú, người trả lời, lúc trả lời, lý do đóng); `CHECK` về hình dạng từng trạng thái và độ dài; chỉ mục duy nhất một phần: một câu hỏi mở cho một bước; trigger giữ câu hỏi nguyên như đã hỏi, chỉ chuyển từ `OPEN` sang trạng thái cuối một lần, không xóa (`INV-05`).
- **API (199 → 203):** `POST /access-requests/{id}/budget-information-requests` (người giữ bước hỏi, 201); `GET /access-requests/{id}/budget-information-requests` (Finance và người giữ bước đọc các câu hỏi của Request); `GET /budget-information-requests` (hàng đợi của Finance, lọc theo trạng thái); `POST /budget-information-requests/{id}/answer` (Finance trả lời). `GET /access-requests/{id}/spend-approval` thêm `latestBudgetInformation` (một đối tượng, không thêm mảng lồng).
- **Audit:** `BUDGET_INFORMATION.ASKED`, `.ANSWERED`, `.CLOSED`.

## Behavior and design

**Hỏi (`US-06-02` AC-1, AC-2).** Chỉ người đang giữ bước chi ở trạng thái chờ hỏi được (403 `NOT_THE_ASSIGNEE`; một bên của Request 403 `OWN_REQUEST`); Request không có bước chi mở hay bước đã quyết là 409 `NO_SPEND_STEP` / `STEP_NOT_PENDING`. Câu hỏi 1–2000 ký tự, bước có một câu hỏi mở thì hỏi tiếp bị 409 `ALREADY_OPEN`. Hỏi chỉ ghi một dòng và một sự kiện Audit: không đụng bước (người giữ, `created_at`, `assigned_at`, trạng thái đều nguyên), không đụng Request và không chặn quyết định.

**Trả lời (`US-06-03` AC-1→AC-3, AC-5).** Finance trả lời bằng một trong ba giá trị và ghi chú tùy chọn (≤ 2000 ký tự); giá trị khác hay trường thừa là 422. Câu trả lời nằm bên cạnh snapshot ở bảng của Người duyệt chi và không đổi snapshot, bảng năm hay bước. Trả lời sau khi đã duyệt vẫn lưu, quyết định giữ nguyên. Hai lần trả lời cùng lúc xếp hàng: Request bị khóa trước, câu hỏi sau, thứ tự khóa giống mọi thao tác đóng câu hỏi nên không chờ nhau; lần sau thấy câu hỏi đã kết thúc (409 `NOT_OPEN`).

**`SoD-8` (`US-06-03` AC-4).** Finance là người yêu cầu hay người thụ hưởng thì 403 `OWN_REQUEST`; Finance giữ bước chi của Request hay đang giữ vai Người duyệt chi thì 403 `SOD_APPROVER`. Người không phải Finance không liệt kê hay trả lời được (403).

**Đóng (`US-06-02` AC-4, `US-06-03` AC-6, `US-05-08` AC-2).** `closeOpen` đóng mọi câu hỏi còn mở của Request với lý do `REQUEST_WITHDRAWN` (hạng mục rút gọi) hay `STEP_CLOSED` (bước chi quay về không quyết, cùng transaction). Câu hỏi đã trả lời giữ nguyên. Trả lời câu hỏi đã đóng là 409 `NOT_OPEN`.

**Đo riêng (`US-06-02` AC-5).** Mỗi câu trả lời hiện `responseSeconds` = lúc trả lời trừ lúc hỏi; bước chi không có trường nào đổi theo nó nên thời gian chờ của bước không cộng thời gian này.

**Finance vắng (`US-06-03` AC-7).** Không ai trả lời thay: câu hỏi hiện _chưa trả lời_ (`OPEN`, `answer: null`) ở bảng của Người duyệt chi, quyết định không bị chặn, bước vẫn tính SLA bình thường. Nhắc Finance theo SLA riêng thuộc `g5-step-sla-and-alerts`.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Mỗi bước có tối đa một câu hỏi mở; câu tiếp chỉ hỏi sau khi Finance trả lời (hay câu hỏi đóng).
- Câu hỏi không bị đóng chỉ vì Người duyệt chi quyết: Finance trả lời muộn vẫn được (`AC-5`); chỉ rút hay bước quay về mới đóng.
- Finance giữ cả vai Người duyệt chi bị từ chối dù bước chi giao người khác (vai hiện tại được tính, không chỉ người giữ bước).
- Bảng của Người duyệt chi chỉ hiện câu hỏi gần nhất để không thêm mảng lồng vào hợp đồng; danh sách đầy đủ ở `GET /access-requests/{id}/budget-information-requests`.
- Người thay thế đọc và hỏi trên bước họ giữ; Người duyệt chi bị thay thế không thấy bước nên không thấy câu hỏi.

## Test matrix

| AC / rủi ro                                 | Tình huống (gồm từ chối, edge case)                                                                                                                     | Cấp test                 | Kết quả mong đợi                                                                                             | Bằng chứng sau implement |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------ |
| US-06-02 AC-1                               | Người duyệt chi hỏi, bước đang chờ                                                                                                                      | integration + PostgreSQL | câu hỏi mở; Finance thấy trong hàng đợi; bước, `created_at`, `assigned_at`, trạng thái nguyên; Audit một lần | xem plan                 |
| US-06-02 AC-2                               | quyết định khi câu hỏi mở; Finance chưa trả lời (US-06-03 AC-7)                                                                                         | integration              | duyệt được; câu hỏi vẫn `OPEN`, không ai trả lời thay                                                        | xem plan                 |
| US-06-02 AC-1                               | Finance, trưởng phòng, IT, Employee, người thay thế hỏi; thân rỗng, rỗng, quá dài, trường thừa; hỏi lần hai; không bước chi; đã quyết; Request không có | integration              | 403 `NOT_THE_ASSIGNEE`; 422; 409 `ALREADY_OPEN`, `NO_SPEND_STEP`; 404                                        | xem plan                 |
| US-06-03 AC-1, AC-2                         | Finance trả lời _Vượt hạn mức_ kèm ghi chú                                                                                                              | integration              | bảng người duyệt đọc câu trả lời; bước còn chờ; bảng năm và bước không đổi                                   | xem plan                 |
| US-06-03 AC-3                               | giá trị ngoài ba giá trị, thiếu, ghi chú quá dài, trường quyết định                                                                                     | integration              | 422, câu hỏi còn mở; ba giá trị hợp lệ lưu                                                                   | xem plan                 |
| US-06-03 AC-5                               | Finance trả lời sau khi đã duyệt                                                                                                                        | integration              | lưu; Request vẫn chờ IT; quyết định `APPROVED`                                                               | xem plan                 |
| US-06-02 AC-5                               | câu hỏi hỏi cách 6 giờ                                                                                                                                  | integration              | `responseSeconds` ≈ 21600; bước nguyên                                                                       | xem plan                 |
| US-06-03 AC-1                               | người khác liệt kê hay trả lời; câu hỏi không có; trạng thái lọc sai                                                                                    | integration              | 403, 404, 422                                                                                                | xem plan                 |
| US-06-03 AC-4                               | Finance giữ vai Người duyệt chi; Finance giữ bước chi                                                                                                   | integration              | 403 `SOD_APPROVER`, câu hỏi còn mở                                                                           | xem plan                 |
| US-06-02 AC-4, US-06-03 AC-6, US-05-08 AC-2 | Request rút (đóng bằng `closeOpen`); bước quay về không quyết                                                                                           | integration              | `CLOSED` `REQUEST_WITHDRAWN` / `STEP_CLOSED`; trả lời 409 `NOT_OPEN`; câu đã trả lời nguyên                  | xem plan                 |
| US-06-02 AC-1                               | danh sách câu hỏi của Request; bảng người duyệt                                                                                                         | integration              | Finance và người giữ bước đọc, oldest first; `latestBudgetInformation`; người khác 404                       | xem plan                 |
| Toàn vẹn dữ liệu                            | hai câu hỏi mở một bước, câu hỏi trống, trạng thái nửa vời, sửa, xóa, TRUNCATE, sửa `asked_at`                                                          | integration PostgreSQL   | `23505`, `23514`, `23001`                                                                                    | xem plan                 |
| Quy tắc thuần                               | ai hỏi, ai trả lời                                                                                                                                      | unit                     | 14 ca                                                                                                        | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Scope map chuyển `US-06-02` AC-3 sang `g5-step-sla-and-alerts`. Hạng mục rút phải gọi `BudgetInformationService.closeOpen` trong transaction rút. Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.

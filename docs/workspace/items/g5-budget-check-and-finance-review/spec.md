# Spec: kiểm tra ngân sách tự động, định tuyến ngoại lệ và Finance rà soát trước Người duyệt chi

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Khi một Request có chi phí được trình, hệ thống kiểm ngân sách của Cost Center theo **từng năm** có kỳ ràng buộc và gắn mã kết quả. Vấn đề dữ liệu (năm đã kết thúc, báo giá hết hiệu lực) giữ Request ở trưởng phòng và không tạo bước nào; ngoại lệ hoặc giá trị cao đi qua Finance rà soát trước; đủ điều kiện thì Người duyệt chi có bước ngay. Finance kết thúc rà soát bằng nhận định kèm hướng xử lý, trả về trưởng phòng hoặc yêu cầu lập ngân sách; không kết cục nào duyệt hay từ chối Request. Dời khoảng mua của dòng quá hạn, hay duyệt phiên bản ngân sách mà Request chờ, làm Request được kiểm lại như một lần kiểm tra mới. Trưởng phòng chỉ đọc Request nằm ở đâu và vì sao dừng, không bao giờ một con số ngân sách. Kiểm bằng 112 ca tích hợp (ca R2, R4, R5 của bản đồ), 24 ca chính sách thuần và 41 ca ràng buộc CSDL.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: Kiểm tra ngân sách tự động, định tuyến ngoại lệ và Finance rà soát trước Người duyệt chi.
- Boundaries: Kiểm tra thuần theo phiên bản hiện hành; một transaction tạo kết quả và bước rà soát; không tự duyệt; Finance không duyệt hay từ chối.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: none.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC         | Coverage | Phần còn lại thuộc                                                                                                                                                                                             |
| -------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-06-12 | AC-1→AC-19 | full     | —                                                                                                                                                                                                              |
| US-06-13 | AC-1→AC-13 | full     | —                                                                                                                                                                                                              |
| US-06-09 | AC-17      | partial  | AC-1, AC-3, AC-5→AC-8, AC-11, AC-13→AC-16, AC-18→AC-20, AC-22, AC-23: `g5-budget-proposal-and-review`; AC-2, AC-4, AC-9: `g5-commitment-creation`; AC-10, AC-21: `g5-budget-version-decision`; AC-12: `g3-downstream-finance-integration` |

## Supporting references

`FR-3.20`, `QĐ-82b`, `QĐ-82c`, `QĐ-82d`, `QĐ-82n`, `QĐ-84c`.

## Explicit out of scope

- Trình Request, lô trình, hàng đợi của trưởng phòng, gắn dòng kế hoạch, xác nhận còn nhu cầu và chọn _ngoài kế hoạch_ (`US-06-14`, `US-05-04` AC-11→AC-16): `g5-spend-submission-batches`. Ở đây phép kiểm chạy trong transaction của người gọi với Request đã khóa, đúng như việc trình sẽ gọi; test gọi nó như vậy và đặt dòng kế hoạch, cờ _ngoài kế hoạch_ bằng SQL, ghi rõ như vậy. Các cột trên `access_requests` để lưu chúng nằm ở migration này vì phép kiểm cần đọc.
- Quyết định của Người duyệt chi: snapshot chụp lúc quyết, override, tính lại khi duyệt, bản ghi phê duyệt mang nhận định của Finance, đóng bước chi không kèm quyết định (`US-06-01` AC-1→AC-3, AC-5, AC-16, AC-18): `g5-spend-approval-decision`. Ở đây bước chi được tạo đúng người giữ (kể cả người thay thế khi xung đột) và Người duyệt chi đọc được phép kiểm và nhận định ở hồ sơ.
- Tạo khoản cam kết khi duyệt: `g5-commitment-creation`. Câu hỏi tùy chọn của Người duyệt chi cho Finance (`US-06-02`): `g5-finance-information-request`.
- Rút Request: đóng bước rà soát khi rút (`US-06-13` AC-7) là việc của `g5-request-withdrawal`; ở đây trạng thái bước _đã đóng_ có sẵn, ra khỏi hàng đợi của Finance và không kết thúc được (409), và test dùng đúng trạng thái đó.
- Báo Super Admin khi chưa có Finance (`US-05-11`) và thay người giữ bước: `g5-step-reassignment-and-controlled-wait`; kênh thông báo đẩy cho Finance và trưởng phòng (`US-06-13` AC-9): `g5-request-status-notifications`. Ở đây "báo" là Finance thấy ở hàng đợi và trưởng phòng đọc `spend` ở Request.
- Quyết định gia hạn đến hạn và snapshot năm của ngày gia hạn (`US-06-12` AC-12 vế sau): `g5-return-and-renewal-requests` và `G6`. Vế _khoản đã trả năm trước không trừ năm này_ và _không tự tạo Request hay cam kết_ được kiểm ở đây.

## Dependencies and blockers

`g5-budget-proposal-and-review` (phiên bản, dòng và dời khoảng mua), `g5-budget-version-decision` (phiên bản hiện hành, khoản cam kết đã gắn), `g5-request-amount-and-payment-schedule` (lịch thanh toán và kỳ ràng buộc). Không có blocker ngoài. Ba migration. `requests` thêm phụ thuộc vào facade `budgets`; `budgets` không import `requests` (đăng ký listener khi module khởi động, như cổng cấp phát của `licensing`), ghi ở [ADR-0015](../../../decisions/0015-requests-context.md) và [ADR-0016](../../../decisions/0016-budgets-context.md).

## Ownership: module, data, API

- **Module `requests`, capability mới `spend/`:** `budget-check.policy.ts` (phán đoán thuần), `spend-routing.policy.ts` (ai giữ bước), `finance-review.policy.ts` (kết cục nào hợp lệ), `budget-check.service.ts` (đọc giá, thuế, tỷ giá, ngân sách), `spend-routing.service.ts` (kiểm rồi đặt Request vào đúng chỗ), `finance-review.service.ts`, `spend-budget.listener.ts`, `spend-status.service.ts`, `spend-view.service.ts`, các repo, `finance-reviews.controller.ts`. `access-request/` nhận cột dòng kế hoạch và cờ trên bản ghi Request, trạng thái mới và `spend` ở view.
- **Module `budgets`:** facade `budgets.service.ts` (`yearFacts`, `planLine`, `registerChangeListener`) và `budgets.types.ts`; `budget-facts.repo.ts`, `budget-change-listeners.ts` ở sau facade; quyết phiên bản và dời khoảng mua báo cho listener trong transaction của chúng. Sửa khoảng trống của hạng mục dựng phiên bản: **ngưỡng giá trị cao còn là số tiền tuyệt đối** (`high_value_amount_minor`), và bảng ngân sách thêm cột `spent` (khoản cam kết đã thành chi phí).
- **`identity-access`:** `findUsableFinanceEmployeeId` ở facade: người giữ vai Finance có tài khoản dùng được.
- **Dữ liệu:** `20261023200000_budgets_high_value_amount`; `20261023210000_requests_spend_states` (hai loại bước, hai trạng thái bước, ba trạng thái Request); `20261023210100_requests_budget_checks`: `request_budget_checks` và `request_budget_check_years` (mỗi lần kiểm một dòng, mỗi năm một dòng, số liệu chụp bằng tiền tệ báo cáo, không bao giờ đổi), `request_finance_reviews` (kết cục, nhận định, hướng, lý do, người, thời điểm; không bao giờ đổi), cột dòng kế hoạch và cờ trên `access_requests`, cột `no_independent_review`, chỉ mục duy nhất một phần _một bước rà soát và một bước chi đang mở cho một Request_, ràng buộc `holder_check` mở rộng cho bước _đã hoàn tất_ và _đã đóng_.
- **API (181 → 186):** `GET /finance-reviews` (hàng đợi, chỉ Finance); `GET` và `POST /access-requests/{id}/finance-review` (đọc, kết thúc rà soát); `GET /access-requests/{id}/budget-check` và `GET /access-requests/{id}/budget-check/years` (phép kiểm mới nhất và từng năm của nó). Phép kiểm đọc được bởi Finance và bởi người giữ bước chi của chính Request; người khác nhận 404. `GET /access-requests/{id}` thêm `spend`, `offPlan`, `planLineAttached`.

## Behavior and design

**Chạy phép kiểm.** `SpendRoutingService.route` chạy trong transaction của người gọi, Request đã khóa: kiểm, ghi một dòng kiểm (cùng các dòng theo năm), mở bước và đổi trạng thái cùng nhau, một sự kiện audit `ACCESS_REQUEST.BUDGET_CHECKED`. Người gọi là việc trình (hạng mục sau), Finance dời khoảng mua và việc duyệt phiên bản; không có route nào cho người dùng chạy phép kiểm tùy ý. Mỗi lần chạy là dòng mới, các lần trước giữ nguyên (`INV-05`).

**Phép kiểm** (`budget-check.policy.ts`). Chỉ các kỳ thanh toán _ràng buộc_ được kiểm, gom theo năm của kỳ (`QĐ-84a`); kỳ dự báo không có mã và không cộng vào tổng ràng buộc (`AC-18`). Chi phí của một năm là khoản thanh toán của năm cộng thuế không được khấu trừ ước tính (`QĐ-60a`), đổi sang tiền tệ báo cáo theo tỷ giá đúng ngày kiểm, sau đó mới so với ngân sách. Mỗi năm được xét riêng, không bao giờ so tổng nhiều năm với _còn lại_ của một năm (`AC-15`, `AC-16`). _Còn lại_ = ngân sách hiện hành − khoản cam kết đang giữ đã gắn − khoản đã thành chi phí (`FR-5.8`); khoản của năm khác không liên quan (`AC-12`). Mã của một năm, lấy mã nặng nhất: `NO_ACTIVE_BUDGET` (chưa có phiên bản hiện hành, không phải 0), `INSUFFICIENT_BUDGET` (chi phí lớn hơn còn lại), `HIGH_VALUE` (chi phí quá tỷ lệ phần trăm của còn lại, hoặc quá số tiền tuyệt đối của phiên bản), `BUDGET_OK`. Hai mã dữ liệu là của cả Request: `CLOSED_OR_EXPIRED_BUDGET_PERIOD` (năm của kỳ đã kết thúc; năm đó không được xét) và `STALE_COST_EVIDENCE` (báo giá của đánh giá đã hết hiệu lực); `PLAN_LINE_OVERDUE` khi khoảng mua của dòng đã gắn đã qua. Cờ _ngoài kế hoạch_ chỉ ghi lại, không thành ngoại lệ (`AC-10`).

**Đi đâu.** Có mã dữ liệu: **không đi đâu** — Request ở lại hàng đợi của trưởng phòng, không bước nào được tạo, kể cả khi còn mã khác (`AC-7` đến `AC-9`). Ngoài ra, có ngoại lệ, giá trị cao hoặc dòng quá hạn: bước Finance rà soát, **chưa** có bước chi (`INF-12`). Còn lại: bước chi. Không trường hợp nào hệ thống duyệt hay từ chối (`AC-14`).

**Người giữ bước.** Rà soát: người giữ vai Finance có tài khoản dùng được. Nếu Finance là người thụ hưởng hay người gửi thì không có bước rà soát, bước chi đi thẳng với cờ _không có rà soát độc lập_ (`US-06-13` AC-5); nếu không có Finance dùng được thì bước ở trạng thái chờ với lý do `NO_FINANCE_REVIEWER` và Request chờ có kiểm soát, không giao cho ai khác (`AC-6`). Bước chi: Người duyệt chi; khi họ là người gửi hoặc người thụ hưởng thì người thay thế khi xung đột, và nếu không có người thay thế hợp lệ hay không ai giữ vai thì bước chờ với lý do `NO_CONFLICT_SUBSTITUTE` hay `NO_SPENDING_APPROVER`; một người giữ cả bước nhu cầu và bước chi thì cả hai mang cờ _cùng người_ (`US-05-03` AC-9).

**Kết thúc rà soát** (`finance-review.service.ts`). Chỉ Finance. Ba kết cục, mỗi kết cục có đủ trường hoặc không lưu (`AC-3`, 422): _nhận định_ (nội dung và hướng `RECOMMEND_APPROVE`, `RECOMMEND_OVERRIDE`, `RECOMMEND_REJECT`; hướng từ chối **không** kết thúc Request, `AC-2`), bước chi được tạo ngay sau đó với nhận định ở hồ sơ (`AC-1`, `AC-12`); _trả về trưởng phòng_ kèm lý do; _cần sửa ngân sách_ kèm lý do, chỉ cho năm chưa có ngân sách và khi phòng có trưởng phòng để nộp đề xuất (`AC-11`). Nhận định bị từ chối (409 `PLAN_LINE_NOT_UPDATED`) khi dòng kế hoạch còn quá hạn. Rà soát chỉ kết thúc một lần: hai lần kết thúc cùng lúc, một lần thành công, một lần 409 `REVIEW_NOT_OPEN`. Kết cục không bao giờ đổi (ràng buộc `shape_check` và trigger).

**Khi ngân sách đổi.** Finance dời khoảng mua của dòng một Request đang được rà soát vì dòng quá hạn: bước rà soát kết thúc với kết cục `LINE_UPDATED` (lý do của lần dời, người, thời điểm) và phép kiểm chạy lại như lần kiểm tra mới; vẫn là ngoại lệ thì một bước rà soát **mới** được mở, ổn thì bước chi (`AC-4`). Phiên bản của năm Request đang chờ được duyệt: phép kiểm chạy lại cho các Request chờ ngân sách của Cost Center đó (`AC-11`); bị từ chối hay yêu cầu sửa: Finance có bước rà soát mới trên từng Request, và chọn trả về hoặc nhận định. Request của Cost Center hay dòng khác không bị đụng.

**Ai đọc gì.** Trưởng phòng và người yêu cầu đọc `spend` ở Request: `NOT_SUBMITTED`, `BLOCKED` kèm một trong hai mã dữ liệu, `RETURNED_BY_FINANCE` kèm lý do của Finance, hoặc đang chờ rà soát, chờ ngân sách, chờ quyết; không con số, không _còn lại_, không mã kiểm tra (`INF-06`). Finance đọc hàng đợi và phép kiểm; Người duyệt chi đọc phép kiểm và nhận định khi và chỉ khi giữ bước chi của Request đó.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Request không có giá hoặc không có tỷ giá đúng ngày thì **không kiểm được**: không dòng kiểm, không bước, Request giữ nguyên (`PRICE_MISSING`, `RATE_MISSING`). Đây không phải mã thứ tám của phép kiểm: việc trình sẽ báo lý do này cho người trình.
- Dòng quá hạn khi `windowTo` của dòng ở phiên bản hiện hành đứng trước ngày nghiệp vụ. _Chưa mua_ chưa được kiểm, vì chưa có nguồn nào cho biết một dòng đã được mua; nó sẽ được tính khi khoản cam kết có liên kết tới dòng.
- Request gắn dòng của phiên bản đã bị thay vẫn đọc dòng cùng vị trí của phiên bản hiện hành (phiên bản sửa đổi giữ thứ tự dòng).
- Kết cục _cần sửa ngân sách_ còn mở lại được sau khi phiên bản bị từ chối: Finance chọn lại bằng một bước rà soát mới, không phải sửa bước cũ.
- Một Request không kiểm được sau khi dời dòng hay duyệt phiên bản quay về hàng đợi của trưởng phòng, nơi phép kiểm chạy lại khi trình.

## Test matrix

| AC / rủi ro                      | Tình huống (gồm từ chối, edge case)                                                                                                      | Cấp test                                     | Kết quả mong đợi                                                                                                         | Bằng chứng sau implement |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| US-06-12 AC-1, AC-14             | 15tr trên 100tr − 40 chi − 20 giữ; không bao giờ duyệt                                                                                   | integration + PostgreSQL                     | `BUDGET_OK`, bước chi giao Người duyệt chi, không bước rà soát, chỉ có bản ghi duyệt của bước nhu cầu                    | xem plan                 |
| US-06-12 AC-2, AC-3              | 25tr (62,5%); 22tr trên ngưỡng tuyệt đối 20tr                                                                                            | integration                                  | `HIGH_VALUE`, bước rà soát cho Finance, chưa bước chi; Người duyệt chi 404                                               | xem plan                 |
| US-06-12 AC-4, AC-5              | 45tr trên còn lại 40tr; Cost Center chưa có phiên bản                                                                                    | integration                                  | `INSUFFICIENT_BUDGET` đi Finance; `NO_ACTIVE_BUDGET` không có số liệu ngân sách                                          | xem plan                 |
| US-06-12 AC-6                    | dòng đã gắn có khoảng mua đã qua; dòng chưa qua                                                                                          | integration                                  | `PLAN_LINE_OVERDUE` đi Finance dù đủ tiền; dòng chưa qua thì không                                                       | xem plan                 |
| US-06-12 AC-7, AC-8, AC-9        | năm đã kết thúc; báo giá hết hiệu lực; cả hai mã                                                                                         | integration                                  | `BLOCKED`, không bước nào, trưởng phòng đọc lý do không số; cả hai mã được ghi, mã dữ liệu trước                         | xem plan                 |
| US-06-12 AC-10, AC-11, AC-12     | _ngoài kế hoạch_; kỳ ở năm sau; chi năm trước; cam kết đã giải phóng                                                                     | integration                                  | cờ chỉ là thông tin; năm sau `NO_ACTIVE_BUDGET`, năm này nguyên; không đếm sai                                           | xem plan                 |
| US-06-12 AC-13, AC-17            | Request chưa có giá; thiếu tỷ giá                                                                                                        | integration                                  | không kiểm được, không dòng kiểm, không bước; có giá thì kiểm được                                                       | xem plan                 |
| US-06-12 AC-15, AC-16, AC-18     | kỳ ở hai năm; ngưỡng từng năm; kỳ dự báo                                                                                                 | integration                                  | từng năm một lát, 4,8 tr ràng buộc không so với một năm; kỳ dự báo không có mã                                           | xem plan                 |
| QĐ-60a                           | thuế không được khấu trừ                                                                                                                 | integration                                  | chi phí 21tr cho khoản 20tr; khoản chỉ có thuế khấu trừ vẫn 20tr                                                         | xem plan                 |
| US-06-13 AC-1, AC-2, AC-8, AC-12 | nhận định với từng hướng; Finance gọi duyệt hay từ chối                                                                                  | integration                                  | bước chi sau nhận định, kết quả kiểm tra giữ nguyên, hướng từ chối không kết thúc Request; Người duyệt chi đọc nhận định | xem plan                 |
| US-06-13 AC-3                    | thiếu kết cục, nhận định, hướng, lý do; trường thừa                                                                                      | integration                                  | 422, không dòng nào, bước vẫn mở                                                                                         | xem plan                 |
| US-06-13 AC-4                    | dòng quá hạn: nhận định; dời khoảng mua; vẫn ngoại lệ; trả về; dòng khác                                                                 | integration                                  | 409; bước kết thúc `LINE_UPDATED`, kiểm lại, bước chi hay bước rà soát mới; trả về về trưởng phòng; dòng khác không đụng | xem plan                 |
| US-06-13 AC-5, AC-6, AC-7        | Finance là người thụ hưởng; không có Finance; bước đã đóng                                                                               | integration                                  | không rà soát và cờ; chờ `NO_FINANCE_REVIEWER`, Finance về thì nhận; ra khỏi hàng đợi, 409                               | xem plan                 |
| US-06-13 AC-9                    | hàng đợi; trưởng phòng đọc                                                                                                               | integration                                  | Finance thấy mã đầu, trưởng phòng không thấy số, mã, còn lại                                                             | xem plan                 |
| US-06-13 AC-10                   | trả về, bớt người, trình lại; vẫn vượt                                                                                                   | integration                                  | về trưởng phòng kèm lý do, kiểm lại toàn bộ, bước chi hoặc rà soát mới, lịch sử giữ đủ                                   | xem plan                 |
| US-06-13 AC-11                   | cần sửa ngân sách; duyệt, từ chối, yêu cầu sửa phiên bản; năm đã có ngân sách; phòng không có trưởng phòng                               | integration                                  | chờ ngân sách, kiểm lại khi duyệt, Finance có bước mới khi từ chối; 409 hai trường hợp                                   | xem plan                 |
| US-06-01 (người giữ bước chi)    | Người duyệt chi là người gửi hay thụ hưởng; vắng người; cùng người hai bước                                                              | integration                                  | người thay thế; chờ với lý do; hai bước cùng cờ                                                                          | xem plan                 |
| Quyền                            | trưởng phòng, người yêu cầu, Người duyệt chi, IT Admin                                                                                   | integration                                  | 403 hoặc 404, không đọc không kết thúc                                                                                   | xem plan                 |
| Toàn vẹn dữ liệu                 | kiểm sai tuyến, năm sai hình, kết cục thiếu trường, bước đã hoàn tất hay đã đóng, hai bước mở, dòng kế hoạch nửa vời, ngưỡng tuyệt đối 0 | integration PostgreSQL (`spend-constraints`) | `23514`, `23505`, `23001` (41 ca)                                                                                        | xem plan                 |
| Ngưỡng tuyệt đối của phiên bản   | tạo, sửa, bỏ, sửa đổi giữ hay thay; 0, âm, tiền tệ khác                                                                                  | integration (`budget-version-threshold`)     | 7 ca                                                                                                                     | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Phép kiểm chạy trong transaction của người gọi vì chưa có route trình (`g5-spend-submission-batches`); test gọi nó như việc trình sẽ gọi và đặt dòng kế hoạch, cờ _ngoài kế hoạch_ bằng SQL. Rà soát bị rút (`US-06-13` AC-7) kiểm bằng trạng thái bước _đã đóng_, việc đóng khi rút thuộc `g5-request-withdrawal`. Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.

## Mở lại theo baseline `769bb64` (Prompt 03, 26/10/2026)

- Audit G0–G6 trên Docs `769bb64` ↔ BE `7c28e75` mở lại hạng mục này: F27, F31, F32, F33 — cổng trước kiểm tra; khóa (Cost Center, năm); `SoD-8`; _cần sửa ngân sách_.
- Remediation duy nhất: [g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md) ([impact matrix](../g0-g6-final-business-baseline-remediation/impact-matrix.md#3-findings)). AC liên quan không còn được coi là thỏa nguồn hiện hành cho tới khi remediation xong; trạng thái triển khai ở roadmap. Phần đã ghi phía trên là lịch sử, giữ nguyên.
- _26/10/2026 (Prompt 03, delta Docs `769bb64..e0cb5a0` — Owner pin `e0cb5a0`, `QĐ-91`, `QĐ-92`):_ P03-D08 đóng theo nguồn (BRD v3.57 `FR-3.20`, `QĐ-92d`(2), `US-06-13` AC-13) — F33 là implementation gap: _cần sửa ngân sách_ chọn được cho `INSUFFICIENT_BUDGET` khi phòng có trưởng phòng, kiểm lại mọi Request đang chờ phiên bản; thêm F65 (Request giữ chờ khi phiên bản bị từ chối/hết hiệu lực, Finance chuyển (i)/(iii) khi đang chờ) và F67 (thông báo dòng 41, 47, 48). Mở lại `US-06-13` AC-9, AC-11; AC mới `US-06-13` AC-13 ([impact matrix mục 3.8](../g0-g6-final-business-baseline-remediation/impact-matrix.md#38-delta-docs-769bb64e0cb5a0-qđ-91-qđ-92)).
- _27/10/2026 (Prompt 04, Task 0.1 của `g0-g6-final-business-baseline-remediation`, F60 — re-pin scope map [G5](../../../roadmap.md#work-item-decomposition-g5) Docs `e0cb5a0`, BE `7c28e75`):_ nhận thêm `US-06-13` AC-13 (mục 9.1 — Request chờ phiên bản khi phòng chưa có trưởng phòng, F33, F65) và `US-06-12` AC-19 (F27; mục 9 không có cột chủ đề xuất — gán theo hạng mục đang chủ Story, chờ xác nhận) ([impact matrix mục 9](../g0-g6-final-business-baseline-remediation/impact-matrix.md#9-phụ-lục-delta-user-stories-72e1480--769bb64), [mục 9.1](../g0-g6-final-business-baseline-remediation/impact-matrix.md#91-delta-user-stories-769bb64--e0cb5a0)). Phần đã ghi phía trên là lịch sử, giữ nguyên.

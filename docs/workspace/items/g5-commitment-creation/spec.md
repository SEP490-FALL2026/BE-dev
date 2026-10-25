# Spec: hệ thống tự tạo khoản cam kết khi duyệt chi, kể cả khi chưa có ngân sách

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Khi Người duyệt chi duyệt một Request, hệ thống tự giữ một khoản cam kết cho mỗi năm tài chính có kỳ thanh toán ràng buộc, ngay trong transaction của quyết định, không có việc nào của Finance để ghi nhận hay xác nhận. Khoản cam kết mang chi phí thực chịu (giá cộng thuế không được khấu trừ, GTGT được khấu trừ không tính), truy về Request nguồn và về phép kiểm là snapshot của quyết định; _còn lại_ của Cost Center giảm ngay. Năm chưa có ngân sách vẫn có khoản cam kết, chờ ngân sách (lý do _chưa có ngân sách_), không chặn cấp phát và không tạo ngân sách 0; khi phiên bản của năm đó được duyệt thì khoản chờ được gắn vào. Từ chối, năm chỉ là dự báo và các năm dịch vụ sau một lần trả trước không tạo khoản nào. Mỗi cặp (Request, năm) một khoản, do CSDL bảo đảm kể cả khi hai lần duyệt đến cùng lúc. Kiểm bằng 14 ca tích hợp.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: Hệ thống tự tạo khoản cam kết khi duyệt chi, kể cả khi chưa có ngân sách.
- Boundaries: Cùng transaction với quyết định duyệt chi; chỉ mục duy nhất (Request, năm tài chính) ở CSDL; bảng `budget_commitments`.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: `g3-downstream-finance-integration`, `g5-budget-proposal-and-review`, `g5-budget-version-decision`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                          | Coverage | Phần còn lại thuộc                                                                                                                                          |
| -------- | --------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-06-04 | AC-1→AC-3, AC-5, AC-7→AC-13 | full     | —                                                                                                                                                           |
| US-06-07 | AC-1, AC-2, AC-5, AC-7      | partial  | AC-3, AC-4, AC-6: `g5-budget-version-decision` (đã làm)                                                                                                     |
| US-06-09 | AC-2, AC-4, AC-9            | partial  | AC-1, AC-3, AC-5→AC-8, AC-11, AC-13→AC-18: `g5-budget-proposal-and-review`; AC-10: `g5-budget-version-decision`; AC-12: `g3-downstream-finance-integration` |

## Supporting references

`INV-16`, `INV-18`, `FR-5.8`, `QĐ-82m` B, `QĐ-84b`.

## Explicit out of scope

- Vòng đời sau khi giữ: giải phóng khi từ chối, rút, thu hồi hay hết hạn, chuyển thành chi phí khi cấp phát thành công, gia hạn và trả lại (`g5-commitment-lifecycle`; `US-06-06`).
- Đề xuất ngân sách của trưởng phòng và màn rà soát của Finance (`g5-budget-proposal-and-review`); gắn khoản chờ khi phiên bản được duyệt đã có ở `g5-budget-version-decision` và được dùng lại ở đây.
- Đẩy sang hệ thống tài chính hạ nguồn (`US-06-09` AC-12, `g3-downstream-finance-integration`).
- Mọi AC của các Story trên mà bảng Primary không liệt kê: chủ của chúng ở cột _Phần còn lại thuộc_ và ở scope map G5.

## Dependencies and blockers

`g5-spend-approval-decision` (quyết định duyệt và snapshot), `g5-budget-version-decision` (gắn khoản chờ khi phiên bản được duyệt), `g5-budget-check-and-finance-review` (phép kiểm theo năm). Không có blocker ngoài. Một migration.

## Ownership: module, data, API

- **Module `budgets`:** `CommitmentService` (giữ: một khoản mỗi năm, kiểm trùng, Audit `BUDGET_COMMITMENT.CREATED`; trang danh sách cho Finance), `CommitmentRepo` (`hold`, `yearsHeldBy`, `existsFor`, `totals`, `page`), `BudgetCommitmentsController` (`GET /budget-commitments`, chỉ Finance). Facade `BudgetsService.holdForRequest(tx, actor, input)` và `requestHoldsCommitment(requestId)`; `budgets` không import `requests`.
- **Module `requests`:** `SpendDecisionService` gọi `holdForRequest` trong transaction của quyết định duyệt, với các năm có kỳ ràng buộc trong snapshot của phép kiểm; `AccessRequestQueryService` cho Finance đọc Request đang có khoản cam kết (`US-06-09` AC-2).
- **Dữ liệu:** `20261023240000_budgets_commitments_of_requests`: cột `snapshot_check_id`, khóa ngoại `request_id` → `access_requests` và `snapshot_check_id` → `request_budget_checks` (`ON DELETE RESTRICT`). Chỉ mục duy nhất (Request, năm) và ràng buộc trạng thái đã có từ `g5-budget-version-decision`.
- **API (198 → 199):** `GET /budget-commitments?attached&year&costCenterId&requestId&page&pageSize`, Finance. Không đổi hợp đồng khác.

## Behavior and design

**Giữ khoản cam kết (`US-06-04` AC-1, AC-5, AC-10→AC-13).** Khi duyệt, `SpendDecisionService` lấy các năm có kỳ ràng buộc từ snapshot của phép kiểm vừa chạy lại và gọi `holdForRequest`: mỗi năm một khoản _Đang giữ_, số tiền là chi phí thực chịu của năm đó theo tỷ giá ngày kiểm (giá cộng thuế không được khấu trừ; GTGT được khấu trừ chỉ hiện ở cột riêng của bảng duyệt). Khoản gắn với phiên bản hiện hành của Cost Center và năm; _còn lại_ = tổng trừ khoản đang giữ đã gắn trừ khoản đã thành chi phí nên giảm ngay (60tr − 41tr = 19tr trong ca R1). Request một năm tính trọn vào năm của ngày chi; Request nhiều năm có một khoản mỗi năm; kỳ chỉ là dự báo không có khoản; trả trước một lần có một khoản và không có khoản cho các năm dịch vụ sau nó.

**Không có việc Finance (`AC-2`).** Hàng đợi rà soát của Finance không có Request vừa duyệt và không có bước Finance nào; IT Admin cấp phát được ngay (phần mềm trả phí phải kèm gói, như mọi cấp phát).

**Một khoản mỗi năm (`AC-3`).** `CommitmentService` từ chối năm đã giữ (`BudgetCommitmentExistsError`) và chỉ mục duy nhất của CSDL là chốt cuối: hai lần duyệt cùng lúc chỉ giữ một lần, vì Request bị khóa lúc quyết và lần sau thấy bước đã đóng.

**Từ chối và lô (`AC-8`, `AC-9`).** Từ chối không giữ khoản nào và không tạo việc cho IT. Quyết định trong lô giữ khoản riêng cho từng Request và không có khoản cho lô.

**Chưa có ngân sách (`US-06-04` AC-7, `US-06-07` AC-1, AC-2, AC-5, AC-7).** Năm không có phiên bản hiện hành vẫn có khoản cam kết, `attached = false` và lý do `NO_BUDGET`; khoản không chặn cấp phát, không tạo ngân sách 0 và không đổi bảng ngân sách; khi phiên bản của năm đó được duyệt (`g5-budget-version-decision`) thì khoản được gắn và tính vào _còn lại_. Danh sách của Finance lọc `attached=false` là đầu vào cho đề xuất của năm sau.

**Đọc và truy nguồn (`US-06-09` AC-2, AC-4, AC-9).** `GET /budget-commitments` (Finance; lọc `attached`, năm, Cost Center, Request) trả mỗi khoản với Request, Cost Center, năm, số tiền, trạng thái và việc đã gắn hay chưa. Finance mở được Request đang có khoản cam kết và không mở Request khác ngoài vai của họ. Khóa ngoại ở CSDL bảo đảm không có khoản nào không có Request. Snapshot lưu cùng quyết định không đổi khi phiên bản ngân sách sửa đổi sau (bản ghi không bao giờ đổi, `INV-05`); khoản giữ `snapshot_check_id` để truy ngược.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Số tiền khoản cam kết lấy từ chi phí của snapshot (tỷ giá của ngày kiểm), không tính lại sau đó; tỷ giá đổi về sau không làm khoản đổi.
- Khoản cam kết khóa ngoại sang `access_requests` ở CSDL, còn mã của `budgets` chỉ nhận id qua facade.
- Khoản cam kết chỉ nhận các năm có kỳ ràng buộc trong snapshot; quyết định không có năm nào (không có kỳ ràng buộc) không giữ khoản nào.

## Test matrix

| AC / rủi ro                                    | Tình huống (gồm từ chối, edge case)                                    | Cấp test                 | Kết quả mong đợi                                                                                                   | Bằng chứng sau implement |
| ---------------------------------------------- | ---------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| US-06-04 AC-1, AC-5                            | giá 20tr, GTGT 2tr được khấu trừ, thuế 1tr không được                  | integration + PostgreSQL | một khoản 21tr, _Đang giữ_, gắn phiên bản, snapshot đúng; còn lại 40tr → 19tr; Audit một lần                       | xem plan                 |
| US-06-04 AC-2                                  | hàng đợi Finance, việc cấp phát của IT                                 | integration              | không việc Finance; cấp phát được ngay                                                                             | xem plan                 |
| US-06-04 AC-3                                  | giữ lần hai cùng năm; hai lần duyệt cùng lúc                           | integration + PostgreSQL | từ chối bằng lỗi dịch vụ và `23505`; chỉ một khoản                                                                 | xem plan                 |
| US-06-04 AC-8                                  | từ chối                                                                | integration              | không khoản; cấp phát 409                                                                                          | xem plan                 |
| US-06-04 AC-9                                  | lô R6 12tr, R7 8tr duyệt cùng nhau                                     | integration              | hai khoản riêng, không khoản cho lô                                                                                | xem plan                 |
| US-06-04 AC-10                                 | ngày chi đầu năm sau, mọi kỳ trong năm đó                              | integration              | một khoản trọn vào năm đó, năm duyệt không đổi                                                                     | xem plan                 |
| US-06-04 AC-11                                 | hai năm, năm sau chưa có ngân sách                                     | integration              | hai khoản; khoản năm sau chờ (`NO_BUDGET`)                                                                         | xem plan                 |
| US-06-04 AC-12                                 | kỳ thứ hai chỉ là dự báo                                               | integration              | một khoản cho năm ràng buộc                                                                                        | xem plan                 |
| US-06-04 AC-13                                 | trả trước một lần cho 24 tháng                                         | integration              | một khoản trọn, không khoản cho năm sau                                                                            | xem plan                 |
| US-06-04 AC-7, US-06-07 AC-1, AC-2, AC-5, AC-7 | duyệt bằng override khi chưa có ngân sách; sau đó phiên bản được duyệt | integration              | khoản chờ có lý do, nằm trong danh sách Finance, không chặn cấp phát, không ngân sách 0; được gắn khi có phiên bản | xem plan                 |
| US-06-09 AC-2                                  | Finance mở Request có khoản; Request khác                              | integration              | mở được; Request không có khoản thì không                                                                          | xem plan                 |
| US-06-09 AC-4                                  | khoản của Request không có; danh sách của vai khác                     | integration PostgreSQL   | `23503`; 403                                                                                                       | xem plan                 |
| US-06-09 AC-9                                  | phiên bản sửa đổi được duyệt sau quyết định                            | integration              | snapshot giữ số cũ                                                                                                 | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Khoản cam kết do quyết định duyệt chi giữ trong cùng transaction, mỗi năm có kỳ ràng buộc một khoản, chờ ngân sách nếu chưa có. Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.

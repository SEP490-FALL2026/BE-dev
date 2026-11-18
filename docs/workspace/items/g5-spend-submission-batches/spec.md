# Spec: trưởng phòng gắn dòng kế hoạch và trình Request cần duyệt chi theo lô

> `US-06-14` AC-8 as first written (the spend step goes straight on when nobody submits) is superseded by [QĐ-93c](../qd93-remove-fallback-substitute-approvers/spec.md).

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Trưởng phòng giữ hàng đợi các Request có chi phí đã được duyệt nhu cầu của phòng mình, gắn từng Request vào dòng của kế hoạch ngân sách hoặc nói rõ _ngoài kế hoạch_, rồi trình một hay nhiều Request trong một lô. Lô chỉ là vỏ bọc: ai trình, lúc nào, gồm Request nào; mỗi Request giữ bước, trạng thái và lý do riêng. Mỗi mục được kiểm ngân sách riêng (`US-06-12`): đủ điều kiện thì Người duyệt chi có bước ngay với SLA tính từ lúc trình, cần rà soát thì tới Finance trước, còn vướng dữ liệu hay chưa gắn dòng thì ở lại hàng đợi kèm lý do mà không kéo cả lô. Request nào không ai trình được (nhu cầu do approver dự phòng hay Người duyệt chi quyết) được kiểm ngay và có bước chi thẳng. Sau khi gửi, ngày dự kiến phát sinh khoản chi chỉ đổi bằng hồ sơ bổ sung có lý do, giữ trước/sau. Kiểm bằng 72 ca tích hợp (23 ca của lô, 13 của hồ sơ bổ sung, 17 của quyết định nhu cầu, 19 của ràng buộc) và 16 ca chính sách thuần.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: Trưởng phòng gắn dòng kế hoạch và trình Request cần duyệt chi theo lô.
- Boundaries: Một transaction trình lô; bảng `spend_submission_batches`; chỉ trưởng phòng có hiệu lực; hàng đợi không là bước duyệt.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: `g5-group-requests`, `g5-manager-need-decision`, `g5-request-submission-and-routing`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                           | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                  |
| -------- | ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-06-14 | AC-1→AC-5, AC-9→AC-13, AC-15 | partial  | AC-6 và vế bỏ người thụ hưởng của AC-13: `g5-group-requests`; AC-8, AC-16: `qd93-remove-fallback-substitute-approvers`; AC-14: `g5-request-withdrawal`                                                                                                              |
| US-05-04 | AC-11→AC-13, AC-15, AC-16    | partial  | AC-1→AC-10: `g5-manager-need-decision`; AC-14: `g5-group-requests`                                                                                                                                                                                                  |
| US-05-03 | AC-9                         | partial  | AC-1, AC-2, AC-10→AC-13: `g5-request-submission-and-routing`; AC-4, AC-15: `qd93-remove-fallback-substitute-approvers` (AC-15 vế _chưa xếp phòng_: `qd93-unplaced-employee-first-placement`); AC-6, AC-7: `g5-delegated-requests`; AC-8, AC-14: `g5-group-requests` |

## Supporting references

`FR-3.21`, `QĐ-82j`, `QĐ-82l`, `QĐ-82m` `INF-10`, `INF-13`.

## Explicit out of scope

- Trưởng phòng **rút** Request ở hàng đợi, kèm lý do (`US-06-14` AC-14): cần trạng thái _Đã rút_, thuộc `g5-request-withdrawal`; chuyển chủ trong scope map. Ở đây Request ở lại hàng đợi, không có route rút.
- Yêu cầu theo nhóm có chi phí và dòng của chính trưởng phòng (`US-06-14` AC-6), bỏ người thụ hưởng khỏi hồ sơ bổ sung (AC-13, vế bỏ `E5`): một Request ở đây có đúng một người thụ hưởng; thuộc `g5-group-requests`. Hồ sơ bổ sung hiện đổi được ngày và giá tính lại theo ngày; số người sẽ thêm vào cùng bản ghi.
- Tạo Request thay người khác và vào hàng đợi ngay (`US-06-14` AC-5 vế đầu, `US-05-03` AC-6, AC-7): `g5-delegated-requests`. Vế gắn dòng trước khi trình dùng được cho mọi Request trong hàng đợi.
- Quyết định của Người duyệt chi, đọc lô ở bước duyệt hàng loạt (`US-06-01` AC-19, AC-20): `g5-spend-approval-decision`; ở đây lô đọc được và người giữ bước thấy phần của mình.
- Hiển thị trên mobile không có thao tác tạo hay trình lô (`US-06-14` AC-10 vế sau): BE không có khái niệm kênh, nên việc ẩn thao tác là việc của ứng dụng; BE chỉ ghi rằng vai quyết định ai trình được.
- Thông báo đẩy khi một mục dừng hoặc được trả về: `g5-request-status-notifications`; ở đây trưởng phòng đọc ở hàng đợi.

## Dependencies and blockers

`g5-budget-check-and-finance-review` (phép kiểm và định tuyến), `g5-manager-need-decision` (quyết định bước nhu cầu), `g5-request-amount-and-payment-schedule` (giá và lịch thanh toán), `g5-budget-proposal-and-review` (dòng kế hoạch của phiên bản hiện hành). Không có blocker ngoài. Một migration. Sửa hợp đồng của `POST /access-requests/{id}/need-decision` (thêm `spend`); đã ghi ở OpenAPI cho FE.

## Ownership: module, data, API

- **Module `requests`, capability `spend/`:** `spend-submission.policy.ts` (thuần: chọn dòng, cổng trình, vào hàng đợi hay vào thẳng, hồ sơ bổ sung), `plan-line.service.ts` và `plan-line-route.service.ts` (gắn dòng, gợi ý), `spend-entry.service.ts` (kiểm ngay khi không ai trình được), `spend-queue.service.ts`, `spend-batch.service.ts` và `spend-batch-view.service.ts`, `supplement.service.ts`, các repo, `spend-submission.controller.ts`. `access-request/` thêm `repricing.service.ts` (giá cho ngày khác, dùng giá danh mục hoặc báo giá), `spend` trong quyết định nhu cầu, và `NeedDecisionService` gọi cổng vào hàng đợi; `AssessmentService` gọi nó khi hoàn tất đánh giá.
- **Module `budgets`:** facade `BudgetsService` thêm `currentLine`, `currentLines` (đọc dòng của kế hoạch hiện hành).
- **Dữ liệu (`20261023220000_requests_spend_batches`):** `spend_batches` (người trình, phòng, thời điểm; không bao giờ đổi), `spend_batch_items` (kết quả của từng mục, lý do dừng, ghi nhận _ra khỏi lô_ đúng một lần; không xóa), `request_supplements` (ngày, năm ngân sách và số tiền trước/sau, lý do, người, thời điểm; không bao giờ đổi). Ràng buộc: mục dừng có lý do thuộc một danh sách, mục đã gửi không có; ra khỏi lô có cả lý do lẫn thời điểm và chỉ mục đã gửi mới ra khỏi lô; hồ sơ bổ sung phải đổi ngày.
- **API (186 → 194):** `GET /spend-queue`; `POST /spend-batches`, `GET /spend-batches/{id}` và `/items`; `PUT /access-requests/{id}/plan-line` và `GET /access-requests/{id}/plan-line-suggestions`; `POST` và `GET /access-requests/{id}/supplements`. `POST /access-requests/{id}/need-decision` nhận thêm `spend` (dòng hoặc ngoài kế hoạch, ngày). Chỉ trưởng phòng dùng hàng đợi, lô, dòng và hồ sơ bổ sung; Employee, Finance, IT Admin, Super Admin nhận 403.

## Behavior and design

**Hàng đợi (`US-05-04` AC-11).** Request có chi phí đã duyệt nhu cầu ở trạng thái `AWAITING_SPEND_SUBMISSION` và nằm ở hàng đợi của trưởng phòng _của phòng đó_; Người duyệt chi chưa có bước nào của nó (`US-06-14` AC-2, `INF-12`). Mỗi dòng nói Request là gì, giá, ngày, năm ngân sách, đã gắn dòng hay ngoài kế hoạch, sẵn sàng trình chưa, và, nếu dừng hay bị Finance trả về, vì sao: **không** có con số ngân sách, _còn lại_ hay mã kiểm tra (`INF-06`).

**Gắn dòng (`AC-12`, `AC-13`, `AC-15`).** Trưởng phòng duyệt nhu cầu của Request có chi phí phải chọn một dòng của kế hoạch hiện hành của Cost Center, năm của ngày chi, hoặc _ngoài kế hoạch_; không chọn thì không lưu quyết định (422 `PLAN_LINE_REQUIRED`), chọn cả hai thì 422, dòng không có thì 422 `LINE_NOT_FOUND`. Dòng có khoảng mua đã qua chỉ được giữ khi trưởng phòng xác nhận _còn nhu cầu_ (422 `STILL_NEEDED_REQUIRED`), và phép kiểm sẽ báo `PLAN_LINE_OVERDUE`. _Ngoài kế hoạch_ là cờ thông tin, không thành ngoại lệ. Gợi ý là các dòng cùng gói với Request, kèm cả các dòng khác; trưởng phòng chỉ đọc kế hoạch phòng mình: gói, tiền, khoảng mua, đã quá hạn chưa. Người không phải trưởng phòng giữ bước (approver dự phòng, Người duyệt chi thay) không chọn dòng: có `spend` thì 422 `SPEND_NOT_APPLICABLE`. Request chưa gắn dòng (vào hàng đợi bằng đường khác, hay bị gỡ dòng sau hồ sơ bổ sung) gắn bằng `PUT .../plan-line` khi còn ở hàng đợi.

**Ngày dự kiến (`US-05-04` AC-16).** Khi duyệt nhu cầu, trưởng phòng có thể sửa ngày dự kiến phát sinh khoản chi: Request được tính lại giá cho ngày đó, năm ngân sách đổi theo, dòng được chọn so với kế hoạch của năm mới, Audit Trail ghi trước/sau. Giá của phần mềm chưa có trong danh mục chưa có, nên chỉ ngày và năm đổi.

**Trình lô (`US-06-14` AC-1, AC-4, AC-11).** Một lô từ một đến 50 Request, không trùng, của phòng trưởng phòng đang đứng đầu và đang ở hàng đợi; Request không phải của họ trả 404 như không tồn tại, Request không còn ở hàng đợi trả 409 `NOT_IN_QUEUE`, và cả hai từ chối cả lệnh, không ghi gì. Không có lịch gom: trình được ngay lúc Request vào hàng đợi. Mỗi mục được xét riêng, theo thứ tự đã chọn, trong một transaction: thiếu dòng hay _ngoài kế hoạch_ thì dừng với `PLAN_LINE_REQUIRED` (chưa kiểm); còn lại chạy phép kiểm của hạng mục trước. Mục có mã dữ liệu (`STALE_COST_EVIDENCE`, `CLOSED_OR_EXPIRED_BUDGET_PERIOD`) hay không kiểm được (`PRICE_MISSING`, `RATE_MISSING`) dừng, ở lại hàng đợi với lý do, không bước nào được tạo và không kéo cả lô (`AC-9`); mục cần Finance rà soát vào bước Finance và bước chi tạo sau (`AC-12`); mục còn lại có bước chi ngay, SLA từ lúc trình (`AC-1`). Audit Trail ghi một sự kiện cho lô: ai, các Request, bao nhiêu mục mỗi loại.

**Lô là vỏ bọc (`AC-3`).** Lô chỉ có người trình, phòng, thời điểm, số mục, và mỗi mục ghi kết quả của nó, lý do dừng, có _ra khỏi lô_ không và vì sao, cùng trạng thái hiện tại của Request; không có trạng thái quyết định hay khoản cam kết. Request được Finance trả về ra khỏi lô cũ (`RETURNED_BY_FINANCE`, `AC-13`); mục có Người duyệt chi là người thụ hưởng giao người thay thế và ra khỏi lô của Người duyệt chi (`CONFLICT_OF_INTEREST`, `AC-7`): người giữ bước chỉ thấy các mục họ giữ. Lô đọc được bởi trưởng phòng đã trình và bởi người giữ bước chi của một mục; người khác 404.

**Không ai trình được (`AC-8`).** Nhu cầu do approver dự phòng quyết, do Người duyệt chi quyết (kể cả với tư cách trưởng phòng của phòng), thì Request không vào hàng đợi: phép kiểm chạy ngay trong transaction của quyết định (hay của việc hoàn tất đánh giá, với phần mềm chưa có trong danh mục), bước chi hay bước Finance tạo thẳng. Vì vậy cờ _cùng người_ ở bước nhu cầu và bước chi do `routeSpendStep` ghi cả hai. Nếu lúc đó Request chưa kiểm được (chưa có giá, thiếu tỷ giá) nó ở nguyên và chưa có ai kích hoạt lại; ghi ở mục giới hạn.

**Hồ sơ bổ sung (`AC-13`, `AC-15`, `US-05-04` AC-16).** Sau khi gửi, đổi ngày dự kiến chỉ bằng hồ sơ bổ sung của trưởng phòng, có lý do bắt buộc, cho Request đang ở lại hàng đợi (Finance trả về hay dừng vì dữ liệu): Request được tính lại giá cho ngày mới, năm ngân sách theo ngày, và hồ sơ giữ ngày, năm, số tiền trước/sau, người, thời điểm; Request gốc không bị sửa. Đổi năm thì dòng đã gắn của năm cũ bị gỡ và trưởng phòng gắn lại trước khi trình. Lần trình sau chạy lại toàn bộ phép kiểm trên ngân sách năm mới và định tuyến theo kết quả mới; các lần kiểm cũ giữ nguyên. Không có thao tác override cho năm đã đóng. Hồ sơ không đổi được ngày khi Request đang được rà soát hay chờ quyết (409 `NOT_IN_QUEUE`), khi không đổi gì, hay khi báo giá làm ngày thanh toán đầu cố định (409 `NO_CHANGE`).

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Một Request là một mục: vắng lô nhiều người thụ hưởng, nên hồ sơ bổ sung đổi ngày chứ chưa bớt người.
- Mục dừng vẫn nằm trong lô với kết quả `STOPPED` và lý do, không bị bỏ khỏi lô: lô ghi trung thực những gì trưởng phòng đã bấm.
- Lệnh trình không trả lỗi khi _mọi_ mục đều dừng: lô vẫn tạo và mỗi mục nói vì sao; lỗi cả lệnh chỉ dành cho Request không thuộc về trưởng phòng, không còn ở hàng đợi hay trùng.
- Năm đổi thì dòng bị gỡ, không tự gắn lại vào dòng cùng vị trí của năm mới.
- `readyToSubmit` chỉ nói đã gắn dòng hoặc ngoài kế hoạch và đã có giá; không nói phép kiểm sẽ ra gì.

## Test matrix

| AC / rủi ro                | Tình huống (gồm từ chối, edge case)                                       | Cấp test                                           | Kết quả mong đợi                                                                         | Bằng chứng sau implement |
| -------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------ |
| US-05-04 AC-11             | duyệt nhu cầu; Người duyệt chi mở hàng đợi                                | integration + PostgreSQL                           | Request ở hàng đợi của trưởng phòng; Người duyệt chi 404, không bước chi, 403 ở hàng đợi | xem plan                 |
| US-05-04 AC-12             | gợi ý; chọn dòng, ngoài kế hoạch, không chọn, cả hai, dòng không có       | integration                                        | gợi ý có cờ `suggested` và không số ngân sách; 422 và quyết định không lưu               | xem plan                 |
| US-05-04 AC-13             | dòng quá hạn; chưa và đã xác nhận còn nhu cầu                             | integration                                        | 422 `STILL_NEEDED_REQUIRED`; có xác nhận thì lưu và phép kiểm `PLAN_LINE_OVERDUE`        | xem plan                 |
| US-05-04 AC-15             | trưởng phòng đọc dòng; phòng khác, Employee                               | integration                                        | không thấy còn lại, mã kiểm tra; 404 và 403                                              | xem plan                 |
| US-05-04 AC-16             | sửa ngày khi duyệt; sang năm chưa có dòng                                 | integration                                        | giá, năm, trước/sau trong Audit; 422 và hoàn tác                                         | xem plan                 |
| US-05-04 AC-16 (sau trình) | đổi ngày khi đang quyết; cùng ngày; thiếu lý do                           | integration                                        | 409 `NOT_IN_QUEUE`, 409 `NO_CHANGE`, 422                                                 | xem plan                 |
| US-05-03 AC-9              | một người giữ cả bước nhu cầu và bước chi                                 | integration                                        | hai bước cùng cờ                                                                         | xem plan                 |
| Toàn vẹn dữ liệu           | mục, lô, hồ sơ bổ sung: thiếu lý do, ra khỏi lô hai lần, đổi kết quả, xóa | integration PostgreSQL (`spend-batch-constraints`) | `23514`, `23505`, `23001`, `23503` (19 ca)                                               | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Scope map chuyển `US-06-14` AC-14 sang `g5-request-withdrawal`, AC-6 sang `g5-group-requests` và vế bỏ người thụ hưởng của AC-13 sang `g5-group-requests`. Quyết định nhu cầu của trưởng phòng có chi phí giờ cần chọn dòng hay _ngoài kế hoạch_ (hợp đồng đổi, báo FE). Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.

24/10/2026 (sau `g5-group-requests`): `US-06-14` AC-6 và vế bỏ người thụ hưởng của AC-13 đã làm ở `g5-group-requests`: hàng đợi trình và hồ sơ bổ sung nhận Request nhóm (`beneficiary` null và `lineCount` ở hàng đợi, `dropEmployeeIds` và `droppedCount` ở hồ sơ bổ sung); cờ _cùng người_ đặt theo người được giao của từng bước nhu cầu.

01/11/2026 — `QĐ-93` (Docs `69e8a3d`): `US-06-14` AC-8 (viết lại theo `QĐ-93c`: chờ trưởng phòng mới, không tạo thẳng bước chi) chuyển sang `qd93-remove-fallback-substitute-approvers`; AC-7 bỏ; AC mới `US-06-14` AC-16 thuộc hạng mục `QĐ-93` ở cột cuối.

## Mở lại theo baseline `769bb64` (Prompt 03, 26/10/2026)

- Audit G0–G6 trên Docs `769bb64` ↔ BE `7c28e75` mở lại hạng mục này: F27 — cổng tài chính cho lô trình duyệt chi.
- Remediation duy nhất: [g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md) ([impact matrix](../g0-g6-final-business-baseline-remediation/impact-matrix.md#3-findings)). AC liên quan không còn được coi là thỏa nguồn hiện hành cho tới khi remediation xong; trạng thái triển khai ở roadmap. Phần đã ghi phía trên là lịch sử, giữ nguyên.

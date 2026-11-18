# Spec: Người duyệt chi quyết định trên snapshot ngân sách, kể cả quyết trong lô

> The substitute who decides in a conflict of interest (`US-06-08`) is superseded by [QĐ-93c](../qd93-remove-fallback-substitute-approvers/spec.md): the spending approver alone decides the spend step, nobody takes their place.

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Người duyệt chi mở bước duyệt chi của một Request, thấy nhu cầu trưởng phòng đã xác nhận, chi phí thực chịu kèm GTGT được khấu trừ ở cột riêng, kết luận của IT với phần mềm mới, nhận định của Finance, và bảng theo từng năm: ngân sách, đang giữ, thực chi, còn lại, đang chờ duyệt, tính ngay lúc mở. Họ duyệt hoặc từ chối (kèm lý do) từng Request hay cả nhóm Request của một lô. Phép kiểm ngân sách được chạy lại đúng lúc quyết và quyết định dựa trên kết quả đó, chính là snapshot lưu cùng bản ghi phê duyệt điện tử và không đổi khi ngân sách đổi sau. Duyệt Request thiếu tiền hoặc chưa có ngân sách chỉ lưu được bằng override có lý do nêu đúng các năm; Request vừa thành ngoại lệ chưa ai rà soát quay về Finance, Request vướng dữ liệu quay về trưởng phòng, và bước chi đóng không kèm quyết định. Khi Người duyệt chi là một bên của Request (hay của đề xuất ngân sách) thì người thay thế quyết. Kiểm bằng 45 ca tích hợp và 14 ca chính sách thuần.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: Người duyệt chi quyết định trên snapshot ngân sách, kể cả quyết trong lô.
- Boundaries: Một transaction ghi quyết định, snapshot và bản ghi phê duyệt; chỉ Người duyệt chi hoặc người thay thế; Finance và IT không duyệt chi.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: `g5-commitment-lifecycle`, `g5-group-requests`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                                   | Coverage | Phần còn lại thuộc                                                             |
| -------- | ------------------------------------ | -------- | ------------------------------------------------------------------------------ |
| US-06-01 | AC-1→AC-10, AC-12→AC-14, AC-16→AC-21 | partial  | AC-15: `g5-group-requests`; AC-22: `qd93-remove-fallback-substitute-approvers` |

## Supporting references

`FR-3.4`, `FR-3.15`, `SoD-7`, `QĐ-28c`, `QĐ-82d`, `QĐ-84c`.

## Explicit out of scope

- **Khoản cam kết** được tạo khi duyệt (`US-06-01` AC-3, AC-5, AC-16, AC-19, AC-21 vế _tạo khoản cam kết_; `US-06-04`): `g5-commitment-creation`. Ở đây duyệt ghi bản ghi, snapshot và override, chuyển Request tới bước IT (`AWAITING_EXECUTION`); chỗ nối là một lệnh trong cùng transaction của việc ghi quyết định, hạng mục sau thêm vào.
- Yêu cầu theo nhóm có chi phí: quyết theo từng người, một khoản cam kết mỗi năm (`US-06-01` AC-15, `US-05-17` AC-9), và Người duyệt chi có tên trong một dòng của nhóm (`US-06-08` AC-10): `g5-group-requests`; ở đây một Request có đúng một người thụ hưởng.
- Trưởng phòng hay Người duyệt chi _tạo thay_ người khác (`US-06-08` AC-2, AC-9): `g5-delegated-requests`; quy tắc giao bước (người thay thế khi người thụ hưởng là Người duyệt chi) đã được kiểm với người thụ hưởng đổi bằng SQL.
- Câu hỏi tùy chọn của Người duyệt chi cho Finance (`US-06-02`; `US-06-01` AC-6 _không chờ câu hỏi_): `g5-finance-information-request`; chưa có câu hỏi nào nên không có gì chặn.
- Duyệt trên ứng dụng mobile, từng mục không hàng loạt (`US-06-01` AC-13): BE không có khái niệm kênh; luật AC-3, AC-4, AC-5, AC-8, AC-12, AC-16 đến AC-18 áp cho mọi kênh vì cùng một route.
- Loại mục _đã rút_ khỏi thao tác hàng loạt (`US-06-01` AC-19): việc rút thuộc `g5-request-withdrawal`; ở đây mục không còn bước chi (đóng) bị bỏ qua với lý do `NO_SPEND_STEP`, đúng trạng thái việc rút sẽ để lại.
- Báo người yêu cầu khi bị từ chối (`US-06-01` AC-4): `g5-request-status-notifications`; ở đây người yêu cầu đọc `spend.refusalReason` ở Request.
- Cấu hình người thay thế (`US-06-08` AC-8): đã có ở `US-01-03`, kiểm lại ở đây.

## Dependencies and blockers

`g5-budget-check-and-finance-review` (phép kiểm, bước Finance, bước chi), `g5-spend-submission-batches` (lô, người giữ bước), `g5-budget-version-decision` (quyết phiên bản, mở rộng cho người thay thế). Không có blocker ngoài. Ba migration. Thêm `hướng đọc ngân sách`: `BudgetSupportService` cho người thay thế đọc phiên bản.

## Ownership: module, data, API

- **Module `requests`, capability `spend/`:** `spend-decision.policy.ts` (thuần: ai quyết, duyệt được khi nào), `spend-decision.service.ts` (khóa Request, kiểm lại, ghi), `spend-decision.repo.ts`, `spend-batch-decision.service.ts` (quyết trong lô), `spend-approval-view.service.ts` và `spend-approvals.controller.ts` (hàng đợi và bảng của Người duyệt chi). `BudgetCheckService` tách `compute` (tính, không lưu) khỏi `run` (tính và lưu); bảng năm của phép kiểm thêm _đang chờ duyệt_.
- **Module `budgets`:** `VersionDecisionService` cho người thay thế quyết phiên bản khi Người duyệt chi đã nộp đề xuất đứng sau phiên bản (`US-06-08` AC-11); `BudgetSupportService` cho người thay thế đọc phiên bản và đề xuất.
- **Dữ liệu:** `20261023230000_requests_spend_decision_values` (giá trị `SPEND_DECISION` của kích hoạt kiểm và `CONFLICT_SUBSTITUTE` của vai quyết); `20261023230100_requests_spend_decisions` (cột `pending_minor` của bảng năm; bảng `spend_decisions`: bước, snapshot, override và các năm được override, người quyết; không bao giờ đổi); `20261023230200_budgets_substitute_decides_versions` (bản ghi quyết phiên bản chấp nhận vai người thay thế).
- **API (194 → 198):** `GET /spend-approvals` (bước chi đang chờ của người gọi); `GET` và `POST /access-requests/{id}/spend-approval` (bảng của bước, quyết định); `POST /spend-batches/{id}/decisions` (quyết trong lô). Bảng năm ở `GET /access-requests/{id}/budget-check/years` thêm `pending` và `overridden`; `GET /access-requests/{id}` thêm `spend.refusalReason`.

## Behavior and design

**Bảng của Người duyệt chi (`AC-1`, `AC-3`, `AC-9`, `AC-10`, `AC-14`).** Hàng đợi chỉ có các bước chi đang mở giao đúng người gọi: Request còn chờ Finance rà soát không có bước nên không ở đó, và Người duyệt chi không duyệt hay từ chối được nó (`AC-17`). Bảng của một bước: nhu cầu trưởng phòng đã xác nhận (người, lúc), Request, cờ _cùng người_ và _không có rà soát độc lập_, chi phí ước tính kèm GTGT được khấu trừ và phần thuế không được khấu trừ, với phần mềm mới thì mức kiểm soát, rủi ro và công cụ trùng chức năng của IT mà Người duyệt chi không sửa được. Bảng năm của phép kiểm, _khi bước còn mở_, tính ngay lúc đọc để thấy số còn lại và số đang chờ như lúc này; sau khi quyết, bảng năm là snapshot đã lưu. _Đang chờ duyệt_ của một năm là chi phí của các Request khác cùng Cost Center đang giữ bước chi, theo chính kết quả kiểm của chúng và chỉ cùng năm (`AC-9`).

**Ai quyết (`AC-8`, `US-06-08`).** Chỉ người được giao bước: Người duyệt chi, hay người thay thế khi Người duyệt chi là người yêu cầu hoặc người thụ hưởng, và nếu người thay thế cũng là một bên hay không có thì bước chờ có kiểm soát (`AC-3`, `AC-6`). Finance, trưởng phòng, IT Admin nhận 403 `NOT_THE_ASSIGNEE`; người yêu cầu hay người thụ hưởng 403 `OWN_REQUEST` dù giữ vai gì; Người duyệt chi bị thay thế không thấy bước (`AC-5`). Bản ghi mang vai _Người duyệt chi_ hay _người thay thế_.

**Kiểm lại lúc quyết (`AC-2`, `AC-12`, `AC-18`).** Request bị khóa, phép kiểm chạy lại (kích hoạt `SPEND_DECISION`) và quyết định dựa trên kết quả đó, chính là snapshot lưu cùng bản ghi. Duyệt: mã dữ liệu (`STALE_COST_EVIDENCE`, `CLOSED_OR_EXPIRED_BUDGET_PERIOD`) ⟹ không lưu, bước chi đóng không kèm quyết định, Request về hàng đợi trình, 409 `RECHECKED_RETURNED_TO_HEAD`; thành ngoại lệ hay giá trị cao mà Finance chưa rà soát (hay dòng quá hạn) ⟹ không lưu, bước đóng, bước Finance mở lại, 409 `RECHECKED_NEEDS_FINANCE_REVIEW`; hai việc này được lưu lại để lần kiểm và lần đóng còn trong lịch sử. _Đã rà soát_ là có nhận định `ASSESSED` có trước bước chi, hay Finance là một bên nên không ai rà soát được.

**Override (`AC-3`, `AC-5`, `AC-16`, `AC-21`).** Năm thiếu tiền hay chưa có ngân sách chỉ duyệt được kèm `override: { reason, years }` nêu **đúng** các năm cần: thiếu thì 422 `OVERRIDE_REQUIRED` (kèm các năm), nêu năm khác 422 `OVERRIDE_MISMATCH`, đưa override khi không có gì để chấp nhận 422 `OVERRIDE_NOT_NEEDED`, lý do trống 422. Giá trị cao có đủ tiền thì không cần override. Bản ghi giữ lý do, các năm, snapshot cả hai năm; bảng năm đánh dấu `overridden`. Không override nào chấp nhận mã dữ liệu.

**Từ chối (`AC-4`).** Cần lý do (422 nếu thiếu hay trống); Request kết thúc _bị từ chối_, người yêu cầu đọc `spend.refusalReason`, không có bước nào tiếp theo; snapshot vẫn được lưu nếu kiểm được.

**Sau khi duyệt.** Request chuyển tới IT (`AWAITING_EXECUTION`); với phần mềm chưa có trong danh mục thì cấp phát vẫn bị cổng từ chối (`NOT_IN_CATALOG`) cho tới khi IT đăng ký và gắn gói. Khoản cam kết do hạng mục sau tạo trong chính transaction này.

**Quyết trong lô (`AC-19`, `AC-20`).** Người đang giữ bước của ít nhất một mục của lô chọn các Request để duyệt hay từ chối hàng loạt, tối đa 50, đúng thứ tự đã chọn; mỗi mục có kiểm lại, snapshot, bản ghi riêng và không mục nào kéo mục khác. Mục không thuộc lô, đã không còn bước chi (đã đóng, hay còn chờ Finance), cần override (không bao giờ cho trong lô), hay vừa bị kiểm lại đưa về thì bị bỏ qua kèm lý do. Từ chối hàng loạt dùng một lý do cho từng mục. Lô không có quyết định hay khoản cam kết riêng; các mục còn lại vẫn thuộc lô.

**Người thay thế cho phiên bản ngân sách (`US-06-08` AC-11).** Khi Người duyệt chi là người đã nộp đề xuất đứng sau một phiên bản, họ không quyết được (403 `BUDGET.CONFLICT_OF_INTEREST`) mà người thay thế quyết, đọc được phiên bản và đề xuất, và bản ghi quyết ghi vai; không có người thay thế thì phiên bản chờ. Phiên bản của đề xuất khác vẫn do Người duyệt chi quyết và người thay thế không quyết được.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Hai điều kiện của việc quay về nhau: dữ liệu hỏng thì về trưởng phòng và không override được; ngoại lệ chưa rà soát thì về Finance. Request đã rà soát mà số thay đổi tiếp vẫn duyệt được bằng override theo số mới.
- Bảng năm tính lại khi bước còn mở, nhưng _bước chi đã mở không bị đóng_ chỉ vì số đổi: chỉ lúc quyết mới đóng.
- Từ chối vẫn kiểm lại để có snapshot; Request không kiểm được vẫn từ chối được, không snapshot.
- Quyết trong lô không cho override: Request cần override duyệt riêng từng cái.
- _Đã rà soát_ theo thời điểm: nhận định có trước khi bước chi tạo; một lần trả về hay sửa dòng sau đó cần nhận định mới.

## Test matrix

| AC / rủi ro               | Tình huống (gồm từ chối, edge case)                                                 | Cấp test                                              | Kết quả mong đợi                                                                                          | Bằng chứng sau implement |
| ------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------ |
| US-06-01 AC-1, AC-9       | mở hàng đợi và bảng; Request khác cùng và khác Cost Center, năm                     | integration + PostgreSQL                              | nhu cầu, 100·20·40·40, đang chờ 15tr; chỉ cùng Cost Center và năm                                         | xem plan                 |
| US-06-01 AC-14            | giá trước thuế 20tr, GTGT 2tr, thuế không khấu trừ 1tr                              | integration                                           | chi phí 21tr, GTGT ở cột riêng, đang chờ tính 21tr                                                        | xem plan                 |
| US-06-01 AC-2, AC-12      | duyệt; ngân sách đổi sau                                                            | integration + PostgreSQL                              | bản ghi vai và snapshot; bảng năm không đổi; kích hoạt `SPEND_DECISION`                                   | xem plan                 |
| US-06-01 AC-4             | từ chối thiếu lý do, trống, có lý do                                                | integration                                           | 422; bị từ chối, người yêu cầu đọc lý do                                                                  | xem plan                 |
| US-06-01 AC-5, AC-16      | thiếu tiền: không override, trống, sai năm, đúng                                    | integration                                           | 422 kèm năm; lưu lý do và năm; còn lại giữ −5tr                                                           | xem plan                 |
| US-06-01 AC-3             | chưa có ngân sách                                                                   | integration                                           | _chưa có ngân sách_ không phải 0; override đúng năm                                                       | xem plan                 |
| US-06-01 AC-21            | hai năm, năm sau chưa có ngân sách                                                  | integration                                           | override nêu năm sau; bảng năm đánh dấu                                                                   | xem plan                 |
| US-06-01 AC-7             | một người giữ hai bước                                                              | integration                                           | hai bản ghi, hai cờ                                                                                       | xem plan                 |
| US-06-01 AC-8             | Finance, trưởng phòng, IT, Employee, người yêu cầu                                  | integration                                           | 403 `NOT_THE_ASSIGNEE`, `OWN_REQUEST`; 404 ở bảng                                                         | xem plan                 |
| US-06-01 AC-10            | phần mềm mới mức _Một phần_                                                         | integration                                           | mức, rủi ro, kết luận; không sửa được                                                                     | xem plan                 |
| US-06-01 AC-17            | giá trị cao đang rà soát                                                            | integration                                           | không bước chi, không trong hàng đợi, sau rà soát duyệt không override                                    | xem plan                 |
| US-06-01 AC-18            | thành ngoại lệ chưa rà soát; báo giá hết hiệu lực; override không cứu dữ liệu       | integration                                           | 409, bước đóng, Finance hay trưởng phòng; không bản ghi                                                   | xem plan                 |
| US-06-01 AC-19, AC-20     | lô: mục không bước, rà soát, cần override, bị đưa về, không thuộc lô; từ chối chung | integration                                           | từng mục có kết quả riêng; lô không đổi; một lý do                                                        | xem plan                 |
| US-06-08 AC-1, AC-5, AC-7 | Người duyệt chi là người yêu cầu                                                    | integration                                           | bước giao người thay thế, cờ trong Audit; Người duyệt chi 403 và không thấy bước                          | xem plan                 |
| US-06-08 AC-3, AC-4, AC-6 | không có, cũng là một bên, không là một bên                                         | integration                                           | chờ có kiểm soát; chờ có kiểm soát; Người duyệt chi giữ                                                   | xem plan                 |
| US-06-08 AC-8             | người thay thế là Người duyệt chi                                                   | integration                                           | 422 `SUBSTITUTE_MUST_DIFFER`                                                                              | xem plan                 |
| US-06-08 AC-11            | phiên bản của đề xuất do Người duyệt chi nộp                                        | integration                                           | 403 `CONFLICT_OF_INTEREST`; người thay thế đọc và quyết, bản ghi ghi vai; không có người thay thế thì chờ | xem plan                 |
| Toàn vẹn dữ liệu          | snapshot thiếu, override nửa vời, hai quyết định một bước, sửa và xóa, vai bản ghi  | integration PostgreSQL (`spend-decision-constraints`) | `23514`, `23505`, `23001`, `23503` (10 ca)                                                                | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Scope map chuyển `US-06-01` AC-15, `US-06-08` AC-10 và `US-05-17` AC-9 sang `g5-group-requests`, `US-06-08` AC-2, AC-9 sang `g5-delegated-requests`. Duyệt chưa tạo khoản cam kết: `g5-commitment-creation` thêm vào đúng chỗ ghi quyết định. Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.

24/10/2026 (sau `g5-group-requests`): `US-06-01` AC-15, `US-06-08` AC-10 và `US-05-17` AC-9 đã làm ở `g5-group-requests` (`POST /access-requests/{id}/line-spend-decisions`); `POST .../spend-approval` và quyết cả lô trả `409 ACCESS_REQUEST.GROUP_USES_LINES` hay bỏ qua với lý do `GROUP_NEEDS_LINES` cho Request nhóm; phần giữ cam kết và đóng bước về trưởng phòng dùng chung `SpendEffectsService`.

01/11/2026 — `QĐ-93` (Docs `69e8a3d`): `US-06-08` `RETIRED` (`QĐ-93d`) — AC-1, AC-3→AC-8, AC-11 bỏ khỏi bảng (khóa lịch sử `not affected` ở scope map G5; nhánh người thay thế khi xung đột gỡ ở `qd93-remove-fallback-substitute-approvers`); AC mới `US-06-01` AC-22 thuộc `qd93-remove-fallback-substitute-approvers`. Bảng chỉ còn một primary Story nên `Mode` ở `## Sizing decision` đổi `grouped-stories` → `single-story` (yêu cầu của `pnpm rules:check`); phần còn lại của mục đó giữ nguyên làm lịch sử.

## Mở lại theo baseline `769bb64` (Prompt 03, 26/10/2026)

- Audit G0–G6 trên Docs `769bb64` ↔ BE `7c28e75` mở lại hạng mục này: F31, F32 — tuần tự hóa (Cost Center, năm); `SoD-8`.
- Remediation duy nhất: [g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md) ([impact matrix](../g0-g6-final-business-baseline-remediation/impact-matrix.md#3-findings)). AC liên quan không còn được coi là thỏa nguồn hiện hành cho tới khi remediation xong; trạng thái triển khai ở roadmap. Phần đã ghi phía trên là lịch sử, giữ nguyên.

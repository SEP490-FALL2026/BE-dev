# Spec: Người duyệt chi quyết định phiên bản ngân sách và gắn ngược khoản cam kết

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Người duyệt chi quyết phiên bản ngân sách mà Finance đã gửi: duyệt thì nó thành ngân sách hiện hành của Cost Center và năm, thay phiên bản đang hiện hành, và kéo theo các khoản cam kết của đúng Cost Center và năm đó đang chờ ngân sách; từ chối hoặc yêu cầu sửa thì kèm lý do bắt buộc và năm vẫn chưa có ngân sách. Chỉ người đang giữ vai Người duyệt chi quyết, không bao giờ trên phiên bản do chính họ lập hay gửi, và không ai sửa được một con số ở bước này. Quyết định ghi thành bản ghi phê duyệt điện tử không bao giờ đổi. Người duyệt chi đọc phiên bản kèm đề xuất gốc, nhận xét và lý do của Finance, tổng trước và sau; bảng của Finance cho thấy ngân sách, phần đã cam kết và còn lại, kể cả khi âm. Kiểm bằng 25 ca tích hợp của quyết định, 14 ca ràng buộc CSDL và 10 ca chính sách.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: Người duyệt chi quyết định phiên bản ngân sách và gắn ngược khoản cam kết.
- Boundaries: Một transaction duyệt và gắn ngược; chỉ mục duy nhất có điều kiện cho INV-21; chỉ Người duyệt chi hoặc người thay thế khi xung đột.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: `g3-downstream-finance-integration`, `g5-budget-proposal-and-review`, `g5-commitment-creation`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC               | Coverage | Phần còn lại thuộc                                                                                                                                                 |
| -------- | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-06-07 | AC-3, AC-4, AC-6 | partial  | AC-1, AC-2, AC-5, AC-7: `g5-commitment-creation`                                                                                                                   |
| US-06-09 | AC-10            | partial  | AC-1, AC-3, AC-5→AC-8, AC-11, AC-13→AC-18: `g5-budget-proposal-and-review`; AC-2, AC-4, AC-9: `g5-commitment-creation`; AC-12: `g3-downstream-finance-integration` |
| US-06-11 | AC-1→AC-9        | full     | —                                                                                                                                                                  |

## Supporting references

`INV-18`, `INV-21`, `SoD-8`, `QĐ-82a`, `QĐ-82f`.

## Explicit out of scope

- Tạo khoản cam kết khi Người duyệt chi duyệt Request (`US-06-04`), danh sách khoản chưa gắn của Finance, truy về Request, cột thực chi (`US-06-07` AC-1, AC-2, AC-5, AC-7; `US-06-09` AC-2, AC-4): `g5-commitment-creation`. Ở đây bảng `budget_commitments` có đúng những gì việc gắn cần, và test đặt khoản chờ bằng SQL, ghi rõ như vậy.
- Giải phóng, chuyển thành chi phí và các trạng thái khác của khoản cam kết: `g5-commitment-lifecycle`.
- Thông báo đẩy cho Finance và trưởng phòng khi bị từ chối (`US-06-11` AC-3): `g5-request-status-notifications` làm kênh; ở đây người đó đọc được lý do ở hồ sơ (Finance ở phiên bản, trưởng phòng ở `latestRefusal` của ngân sách của phòng).
- Kiểm tra ngân sách của Request dùng phiên bản hiện hành, Finance rà soát, ảnh chụp lúc quyết Request: `g5-budget-check-and-finance-review`, `g5-spend-approval-decision`.
- Tài liệu căn cứ đính kèm (`US-06-11` AC-2): chưa có kho tài liệu cho ngân sách, như ở `g5-budget-proposal-and-review`.

## Dependencies and blockers

`g5-budget-proposal-and-review` (phiên bản, đề xuất), `g2-approval-roles` (vai Người duyệt chi). Không có blocker ngoài. Một migration (bản ghi quyết định, khoản cam kết tối thiểu). `budgets` thêm phụ thuộc đọc `identity-access` qua facade (`getApprovalRoleHolders`), ghi ở [ADR-0016](../../../decisions/0016-budgets-context.md).

## Ownership: module, data, API

- **Module:** `budgets`, capability `budget/`: `version-decision.service.ts`, `decision.repo.ts`, `commitment.repo.ts`, `budget.policy.ts` (`checkVersionDecision`), và các view của phiên bản, ngân sách của phòng, bảng Finance mở rộng. Phiên bản và đề xuất được đọc bởi Finance **và** Người duyệt chi (kiểm tra bằng vai nắm giữ, không bằng vai truy cập); đề xuất cũng đọc được bởi Người duyệt chi. Các route đọc dòng, thay đổi và nạp file tách sang `budget-version-lines.controller.ts` để file controller không vượt ngưỡng.
- **Dữ liệu:** migration `20261023190000_budgets_decisions_and_commitments`. `budget_version_decisions` (quyết định `APPROVED`, `REJECTED`, `CHANGES_REQUESTED`; người, vai cố định `SPENDING_APPROVER`, lý do, tổng của phiên bản và tổng của phiên bản hiện hành bị thay, thời điểm; trigger chặn sửa, xóa và cắt bảng, `INV-05`). `budget_commitments` (`request_id` chỉ là giá trị, `UNIQUE (request_id, year)` cho `INV-16`; gắn vào phiên bản kèm thời điểm, hoặc chưa gắn với lý do `NO_BUDGET`, không nửa vời).
- **API:** `POST /budget-versions/{id}/decision` (body chặt: `decision` là `APPROVE`, `REJECT` hoặc `REQUEST_CHANGES`, `reason`). Các `GET` của phiên bản mở cho Người duyệt chi; phiên bản trả thêm `previousTotal` và `decision`; bảng `GET /budgets` thêm `committed`, `remaining`, `overCommitted`; `GET /budgets/mine` thêm `latestRefusal`. Op count 180 → 181.

## Behavior and design

**Ai quyết (`AC-7`, `AC-8`).** Chỉ người đang giữ vai Người duyệt chi (403 `BUDGET.NOT_SPENDING_APPROVER` cho trưởng phòng, IT Admin, Finance không giữ vai, Super Admin); người đó không quyết phiên bản họ lập hay gửi (403 `BUDGET.OWN_VERSION`, thử bằng cách đặt vai cho một người Finance), và chỉ phiên bản đã gửi (409 `BUDGET.VERSION_NOT_SENT` cho nháp và phiên bản đã quyết). Lý do đầu tiên là cái được báo. Không có route nào cho người duyệt sửa số, dòng hay gửi (`AC-5`); số trong thân quyết định bị 422.

**Duyệt (`AC-1`, `AC-6`).** Trong một transaction, khóa phiên bản: phiên bản đang hiện hành của Cost Center và năm thành `SUPERSEDED`, phiên bản này thành `APPROVED`, ghi bản ghi quyết định (kèm tổng trước và sau) và audit; sau đó gắn các khoản cam kết `HELD` chưa gắn của **đúng Cost Center và năm này**, mỗi khoản một sự kiện audit hệ thống `BUDGET_COMMITMENT.ATTACHED`. Phiên bản bị thay không sửa được nữa (409), và chỉ mục duy nhất một phần bảo đảm đúng một phiên bản hiện hành (`INV-21`). Hai quyết định đồng thời xếp hàng ở khóa: một 200, một 409.

**Từ chối và yêu cầu sửa (`AC-3`, `AC-4`).** Cả hai cần lý do, thiếu thì 422 và không ghi gì. Từ chối: phiên bản `REJECTED`, năm vẫn chưa có ngân sách; nếu là phiên bản đầu thì đề xuất được trả về trưởng phòng với lý do đó (`RETURNED`) để họ sửa và nộp lại, thay vì kẹt vĩnh viễn ở `REVIEWED`; trưởng phòng đọc lý do ở `latestRefusal`. Yêu cầu sửa: phiên bản `CHANGES_REQUESTED`, quay về Finance để sửa và gửi lại; mọi quyết định giữ trong lịch sử của phiên bản.

**Khoản cam kết chờ ngân sách (`US-06-07` AC-3, AC-4, AC-6; `US-06-11` AC-9).** Khi một phiên bản được duyệt, khoản chờ của Cost Center và năm đó được gắn; khoản của năm khác hay Cost Center khác không bao giờ được gắn. Khi phiên bản mới chỉ đang chờ, bị yêu cầu sửa hay bị từ chối, khoản vẫn chưa gắn và bảng không có dòng cho năm đó. Phiên bản sửa đổi được duyệt không gỡ hay tính hai lần khoản đã gắn: _còn lại_ tính lại trên tổng mới. Còn lại có thể âm kèm cờ `overCommitted` (`−10tr` trong ví dụ). Không có ngân sách giữ chỗ hạn mức 0 nào được tạo cho khoản chờ (`US-06-07` AC-5 chỉ có khoản chờ, không có phiên bản).

**Cái người duyệt đọc (`US-06-11` AC-2, `US-06-09` AC-10).** Phiên bản kèm Cost Center, năm, tổng, `previousTotal` của phiên bản hiện hành mà bản sửa đổi thay, lý do, và `decision` mới nhất; dòng kèm nhận xét và lý do chỉnh của Finance; đề xuất gốc và dòng của nó đọc được cạnh. Hàng đợi của họ là danh sách phiên bản lọc `state=SENT`.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Bảng `budget_commitments` tối thiểu nằm ở đây vì việc gắn cần nó trước khi hạng mục tạo cam kết được giao; hạng mục đó thêm cột và logic, không đổi những gì đã có.
- Từ chối phiên bản đầu trả đề xuất về trưởng phòng thay vì để nguyên `REVIEWED`.
- Người duyệt chi đọc phiên bản bằng vai nắm giữ, không bằng vai truy cập, vì vai này không có trong token.
- "Báo" Finance và trưởng phòng là đọc được lý do (kéo) cho tới khi kênh thông báo có.
- _Còn lại_ ở bảng là tổng trừ phần đang giữ đã gắn; thực chi cộng thêm khi các hạng mục sau có.

## Test matrix

| AC / rủi ro                   | Tình huống (gồm từ chối, edge case)                                                                          | Cấp test                                      | Kết quả mong đợi                                                                                         | Bằng chứng sau implement |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------ |
| US-06-11 AC-1                 | Duyệt phiên bản đã gửi                                                                                       | integration HTTP + PostgreSQL                 | `APPROVED`, ngân sách hiện hành của phòng 80tr, bản ghi quyết định (người, vai, quyết định, tổng), audit | xem plan                 |
| US-06-11 AC-1                 | Duyệt lần hai; hai người cùng lúc; phiên bản nháp                                                            | integration                                   | 409 `VERSION_NOT_SENT`; một 200 một 409; 409                                                             | xem plan                 |
| US-06-11 AC-2, US-06-09 AC-10 | Người duyệt đọc phiên bản, dòng có nhận xét, đề xuất gốc, hàng đợi; bản sửa đổi                              | integration                                   | thấy 40tr kèm nhận xét và đề xuất gốc 50tr; thấy tổng trước 80tr, sau 100tr và lý do                     | xem plan                 |
| US-06-11 AC-3                 | Từ chối thiếu lý do, lý do trống, có lý do                                                                   | integration                                   | 422; `REJECTED`, năm chưa có ngân sách, trưởng phòng đọc lý do, đề xuất `RETURNED` nộp lại được          | xem plan                 |
| US-06-11 AC-4                 | Yêu cầu sửa thiếu lý do và có lý do; Finance sửa, gửi lại; duyệt                                             | integration                                   | `CHANGES_REQUESTED`; 70tr sau khi sửa; hai quyết định trong lịch sử                                      | xem plan                 |
| US-06-11 AC-5                 | Người duyệt sửa số, dòng, lập sửa đổi; số trong quyết định                                                   | integration                                   | 403; 422                                                                                                 | xem plan                 |
| US-06-11 AC-6                 | Duyệt bản sửa đổi; sửa phiên bản bị thay                                                                     | integration + PostgreSQL                      | bản cũ `SUPERSEDED`, đúng một `APPROVED`; 409; bản ghi có tổng trước và sau                              | xem plan                 |
| US-06-11 AC-7                 | Người giữ vai cũng là người lập và gửi                                                                       | integration + unit                            | 403 `OWN_VERSION`                                                                                        | xem plan                 |
| US-06-11 AC-8                 | Trưởng phòng, IT Admin, Finance, Super Admin                                                                 | integration                                   | 403 `NOT_SPENDING_APPROVER`; phiên bản không đổi                                                         | xem plan                 |
| US-06-11 AC-9, US-06-07 AC-3  | Khoản 30tr của năm chưa có ngân sách; duyệt phiên bản 20tr                                                   | integration                                   | khoản gắn, một sự kiện audit, còn lại −10tr, `overCommitted`                                             | xem plan                 |
| US-06-07 AC-4                 | Khoản năm trước, khoản Cost Center khác khi duyệt năm sau                                                    | integration                                   | không gắn; khoản đúng năm gắn                                                                            | xem plan                 |
| US-06-07 AC-6                 | Phiên bản chờ, bị yêu cầu sửa, bị từ chối                                                                    | integration                                   | khoản vẫn chưa gắn; bảng không có dòng cho năm đó                                                        | xem plan                 |
| Toàn vẹn dữ liệu              | Quyết định sai lý do, vai, tổng; sửa, xóa, cắt bảng bản ghi; khoản gắn nửa vời, một khoản mỗi yêu cầu và năm | integration PostgreSQL (`budget-constraints`) | `23514`, `23001`, `23505`, `23503` (14 ca)                                                               | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Các test cần khoản cam kết chờ ngân sách đặt chúng bằng SQL vì việc tạo khoản thuộc `g5-commitment-creation`. `makeCurrent` của harness (đặt `APPROVED` bằng SQL) vẫn dùng ở các suite của `g5-budget-proposal-and-review`; suite quyết định dùng đường thật. Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.

# Spec: trưởng phòng nộp đề xuất ngân sách năm và Finance lập phiên bản rà soát

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Trưởng phòng nộp đề xuất ngân sách phần mềm của phòng cho một năm tài chính chưa kết thúc, mỗi dòng nêu rõ mua gì, bao nhiêu, mua khoảng nào, dùng bao lâu và lặp thế nào; Finance dựng từ đó phiên bản rà soát (số cơ sở, dự phòng, ngưỡng giá trị cao, phân kỳ quý chỉ để dự báo, nhận xét và lý do cho từng dòng) và gửi cho Người duyệt chi; đề xuất gốc không bị ghi đè. Đề xuất rút được cho tới khi Finance gửi phiên bản làm từ nó, Finance trả lại kèm lý do, trưởng phòng sửa và nộp lại thành đề xuất mới giữ bản cũ trong lịch sử. Phiên bản hiện hành chỉ đổi bằng phiên bản sửa đổi có lý do; khoảng mua của dòng hiện hành dời được kèm lý do và lịch sử, còn số tiền thì không. Trưởng phòng đọc ngân sách của phòng mình (đề xuất, tổng, các dòng) mà không thấy còn lại hay số liệu phòng khác. Kiểm bằng 95 ca tích hợp, 24 ca chính sách và 37 ca ràng buộc CSDL.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: Trưởng phòng nộp đề xuất ngân sách năm và Finance lập phiên bản rà soát.
- Boundaries: Một transaction mỗi thao tác đề xuất/phiên bản; bảng `budget_proposals`, `budget_versions`, `budget_lines`; chỉ trưởng phòng và Finance; không duyệt.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: `g3-downstream-finance-integration`, `g5-budget-version-decision`, `g5-commitment-creation`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                                        | Coverage | Phần còn lại thuộc                                                                                                                                                                                        |
| -------- | ----------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-06-09 | AC-1, AC-3, AC-5→AC-8, AC-11, AC-13→AC-18 | partial  | AC-17 (vế chạy lại kiểm tra ngân sách): `g5-budget-check-and-finance-review`; AC-2, AC-4, AC-9: `g5-commitment-creation`; AC-10: `g5-budget-version-decision`; AC-12: `g3-downstream-finance-integration` |
| US-06-10 | AC-1→AC-9                                 | full     | —                                                                                                                                                                                                         |

## Supporting references

`FR-5.15`, `QĐ-82a`, `QĐ-82d`, `QĐ-82l`, `QĐ-85`, `QĐ-86b`.

## Explicit out of scope

- Người duyệt chi quyết phiên bản (duyệt, từ chối, yêu cầu sửa, người lập không duyệt, gắn cam kết ngược): `g5-budget-version-decision`. Ở đây phiên bản dừng ở `SENT`; các test cần một ngân sách hiện hành đặt trạng thái `APPROVED` bằng SQL, và ghi rõ như vậy.
- Kiểm tra ngân sách lúc trình, Finance rà soát, cờ giá trị cao, `PLAN_LINE_OVERDUE`, kết quả cho Request (`US-06-12`, `US-06-13`) và việc chạy lại kiểm tra khi dời khoảng mua của dòng (`US-06-09` AC-17 vế sau): `g5-budget-check-and-finance-review`. Ở đây dòng chỉ mang khoảng mua và cờ quá hạn dẫn xuất.
- Gắn Request vào dòng kế hoạch, hàng đợi trình duyệt chi: `g5-spend-submission-batches`.
- Cột _còn lại_, thực chi, cam kết đang giữ, truy về Request, không cam kết mồ côi (`US-06-09` AC-2, AC-4, AC-9): `g5-commitment-creation`. Cột GTGT và chi phí thực chịu từ hóa đơn (AC-12): `g3-downstream-finance-integration`.
- Tệp báo giá đính kèm đề xuất (`US-06-10` AC-1 "kèm báo giá"): chưa có kho tài liệu cho ngân sách; mỗi dòng mang ngày hiệu lực của báo giá và ghi chú. Ghi nhận là giới hạn.
- Báo cáo đã phát hành và nhãn _điều chỉnh kỳ trước_ (`US-06-09` AC-11 vế báo cáo): `US-12-14`, G9. Ở đây chỉ từ chối phiên bản cho năm đã kết thúc.

## Dependencies and blockers

`g2-department-profile`, `g2-cost-center-catalogue` (Cost Center `Unit` và trưởng phòng), `g2-operating-parameters` (`FISCAL_YEAR_START_MONTH`), `g2-money-and-exchange-rates` (tiền tệ báo cáo). Không có blocker ngoài. Một migration (bảng, chỉ mục duy nhất một phần, ràng buộc); [ADR-0016](../../../decisions/0016-budgets-context.md) mở module `budgets`.

## Ownership: module, data, API

- **Module:** `budgets` mới, capability `budget/`: `budget.policy.ts` (hàm thuần), `proposal.service.ts`, `version.service.ts` (phiên bản), `version-line.service.ts` (dòng của phiên bản), `line-import.service.ts`, `budget-view.service.ts` (nhìn của trưởng phòng và bảng Finance), `version-view.service.ts`, `budget-support.service.ts` (năm tài chính, tiền tệ báo cáo, Cost Center của trưởng phòng, định dạng), `proposal.repo.ts`, `version.repo.ts`, `version-line.repo.ts`, DTO, lỗi, ba controller. Đọc `organization`, `finance`, `operating-parameters`, `audit` qua facade, không export gì.
- **Dữ liệu:** migration `20261023180000_budgets_proposals_and_versions`. `budget_proposals` (trạng thái `SUBMITTED`, `WITHDRAWN`, `RETURNED`, `REVIEWED`; liên kết `previous_proposal_id`), `budget_proposal_lines` (dòng không bao giờ sửa), `budget_versions` (loại `INITIAL`, `REVISION`; trạng thái `DRAFT`, `SENT`, `APPROVED`, `REJECTED`, `CHANGES_REQUESTED`, `SUPERSEDED`; cơ sở, dự phòng, tổng bằng tổng hai số, ngưỡng, bốn quý hoặc không quý nào), `budget_version_lines` (dòng gốc mà nó chỉnh, nhận xét, lý do chỉnh), `budget_version_line_changes` (lịch sử dời khoảng mua). Chỉ mục duy nhất một phần: một đề xuất chờ hay đang rà soát, một phiên bản hiện hành, một phiên bản đang xử lý cho mỗi Cost Center và năm (`INV-21`).
- **API (22 route):** `POST /budget-proposals`, `GET /budget-proposals`, `GET /budget-proposals/{id}`, `GET /budget-proposals/{id}/lines`, `POST /budget-proposals/{id}/withdrawal`, `.../return`, `.../resubmission`; `POST /budget-versions`, `POST /budget-versions/revisions`, `GET /budget-versions`, `GET /budget-versions/{id}`, `GET .../lines`, `PUT /budget-versions/{id}`, `PUT .../lines/{position}`, `POST .../lines`, `PUT .../lines/{position}/window`, `GET .../lines/{position}/changes`, `POST .../submission`, `POST .../imports` (CSV); `GET /budgets/mine`, `GET /budgets/mine/lines`, `GET /budgets`. Danh sách trả bản tóm tắt nhỏ hơn bản chi tiết theo hợp đồng danh sách, dòng là danh sách phân trang riêng. Op count 158 → 180.

## Behavior and design

**Đề xuất (`US-06-10`).** Chỉ trưởng phòng của phòng đó, cho Cost Center `Unit` của chính phòng (403 `NOT_YOUR_COST_CENTER`; Employee, IT Admin, Finance, Super Admin bị 403 theo vai), năm chưa kết thúc kể cả năm đang chạy (422 `YEAR_ENDED`), mọi dòng bằng tiền tệ báo cáo và không âm (`CURRENCY_NOT_REPORTING`). Mỗi dòng phải nêu khoảng mua, kỳ dịch vụ và chu kỳ lặp (`QĐ-82d`): thiếu thì 422 `PROPOSAL_INCOMPLETE` kèm từng dòng và các trường thiếu, cùng lúc cho mọi dòng; khoảng mua đảo ngược là `WINDOW_BACKWARDS`. Một Cost Center và năm chỉ có một đề xuất chờ hoặc đang rà soát (409 `PROPOSAL_ALREADY_OPEN`).

**Rút, trả lại, nộp lại (`AC-4`, `AC-5`, `AC-6`).** Rút chỉ khi còn `SUBMITTED` (sau khi Finance gửi phiên bản làm từ nó, đề xuất thành `REVIEWED` và rút là 409). Finance trả lại kèm lý do bắt buộc. Nộp lại là `POST .../resubmission` trên đề xuất `RETURNED`, tạo đề xuất mới `SUBMITTED` trỏ về cũ; cũ giữ nguyên với dòng của nó. Không có route nào sửa đề xuất hay dòng của nó; trưởng phòng khác nhận 404, Employee 403.

**Phiên bản của Finance (`US-06-09`).** Phiên bản đầu dựng từ đề xuất đang chờ (409 nếu đề xuất không còn chờ, đã có phiên bản hiện hành hay đang xử lý): cơ sở, dự phòng, ngưỡng giá trị cao, bốn quý hoặc không quý nào, và dòng của đề xuất được sao sang phiên bản kèm số thứ tự dòng gốc. Phiên bản sửa đổi dựng từ phiên bản hiện hành (409 `NO_CURRENT_BUDGET` nếu chưa có, 422 `YEAR_ENDED` cho năm đã kết thúc); số liệu và dòng lấy từ phiên bản hiện hành, và phiên bản hiện hành giữ nguyên tới khi được duyệt. Quý chỉ là dự báo: bốn quý cộng đúng tổng hoặc không lưu (422 `QUARTERS_MISMATCH`), không có trường nào để đặt hạn mức cho quý hay tháng. Dòng được chỉnh kèm nhận xét; chỉnh những gì đề xuất đã nêu cần lý do (`ADJUSTMENT_REASON_REQUIRED`), đề xuất gốc không đổi. Gửi: phiên bản sửa đổi phải có lý do (422 `REVISION_REASON_REQUIRED`), năm chưa kết thúc, đề xuất nguồn còn `SUBMITTED` hoặc `REVIEWED`; sau gửi phiên bản khóa với Finance (409 `VERSION_NOT_EDITABLE`).

**Nạp dòng từ file (`AC-3`).** Một file CSV vào phiên bản nháp hoặc đã được trả về Finance: từng dòng của file được xét riêng (Cost Center không tồn tại hoặc không phải của phiên bản, tiền, ngày, khoảng, kỳ dịch vụ, chu kỳ, số seat), dòng đúng vào bản nháp, dòng sai báo theo số dòng và mã (tối đa 50 mã), file không đọc được hay thiếu cột thì từ chối cả file. Bản nháp không phải ngân sách của ai cho tới khi được duyệt.

**Phiên bản hiện hành (`AC-17`).** Dời khoảng mua của một dòng của phiên bản hiện hành cần lý do và ghi lịch sử (trước, sau, lý do, người, thời điểm); đổi số tiền, kể cả chỉ cập nhật giá, là 409 `REVISION_REQUIRED` và phải qua phiên bản sửa đổi. Không có chuyển tiếp tự động giữa các năm (`AC-16`): năm sau không có ngân sách hiện hành dù năm trước còn dư.

**Cái trưởng phòng đọc (`AC-5`, `US-06-10` AC-7).** `GET /budgets/mine`: Cost Center, năm, `ACTIVE` hay `NO_ACTIVE_BUDGET`, tổng, số phiên bản và đề xuất đứng sau nó; `GET /budgets/mine/lines`: dòng của phiên bản hiện hành (mô tả, số tiền, khoảng, cờ quá hạn), không kèm nhận xét hay lý do của Finance. Không có còn lại, kết quả kiểm tra, phòng khác hay số toàn công ty; bảng toàn công ty `GET /budgets` chỉ Finance. Dòng không phải hạn mức: xác nhận nhu cầu của Request thứ sáu không bị dòng chặn (test).

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Module `budgets` riêng ([ADR-0016](../../../decisions/0016-budgets-context.md)) thay vì nhét vào `finance`, vì finance chưa có khái niệm đề xuất hay phiên bản và vòng đời khác nhau.
- Ngân sách chỉ bằng tiền tệ báo cáo; tiền tệ khác bị từ chối thay vì quy đổi.
- Nộp lại là đề xuất mới trỏ về cũ; mỗi lần nộp là một bản không đổi.
- Số tiền của dòng không bao giờ đổi tại chỗ; chỉ khoảng mua dời được, có lý do.
- Danh sách đề xuất và phiên bản trả bản tóm tắt; bản đầy đủ nằm ở route chi tiết.
- Phiên bản đầu chỉ dựng được từ đề xuất đang chờ: Finance không lập ngân sách cho phòng chưa có trưởng phòng (`AC-18`).

## Test matrix

| AC / rủi ro                   | Tình huống (gồm từ chối, edge case)                                                                      | Cấp test                                      | Kết quả mong đợi                                                                          | Bằng chứng sau implement |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------ |
| US-06-10 AC-1                 | Trưởng phòng nộp hai dòng Figma 50tr, Miro 20tr; Finance xem hàng đợi                                    | integration HTTP + PostgreSQL                 | `SUBMITTED`, tổng 70tr, Finance thấy; audit                                               | xem plan                 |
| US-06-10 AC-2                 | Dòng thiếu khoảng mua, kỳ dịch vụ, chu kỳ; dòng đảo ngược; tiền tệ khác; số âm; không dòng               | integration                                   | 422 nêu dòng và trường; không ghi gì                                                      | xem plan                 |
| US-06-10 AC-3                 | Trưởng phòng khác phòng; Employee; người không phòng; Finance; IT Admin; Cost Center không tồn tại       | integration                                   | 403 `NOT_YOUR_COST_CENTER` hoặc theo vai; 404                                             | xem plan                 |
| US-06-10 AC-4                 | Rút trước và sau khi Finance gửi phiên bản; trưởng phòng khác                                            | integration                                   | `WITHDRAWN` và Finance không còn việc; 409; 404                                           | xem plan                 |
| US-06-10 AC-5, US-06-09 AC-15 | Trả lại không lý do, có lý do; sửa và nộp lại; lịch sử                                                   | integration                                   | 422; `RETURNED`; đề xuất mới trỏ về cũ, cũ giữ dòng                                       | xem plan                 |
| US-06-10 AC-6                 | Sửa tại chỗ; nộp lại khi chưa bị trả lại                                                                 | integration                                   | 404 (không có route); 409                                                                 | xem plan                 |
| US-06-10 AC-7, US-06-09 AC-5  | Trưởng phòng đọc ngân sách phòng mình sau khi có phiên bản hiện hành; phòng khác; bảng công ty           | integration                                   | tổng 80tr và dòng, không còn lại; chỉ phòng mình; 403 cho bảng                            | xem plan                 |
| US-06-10 AC-8                 | Xác nhận nhu cầu Request vượt số seat của dòng                                                           | integration                                   | không bị chặn                                                                             | xem plan                 |
| US-06-10 AC-9                 | Năm đang chạy; năm đã kết thúc                                                                           | integration + unit                            | 201; 422 `YEAR_ENDED`                                                                     | xem plan                 |
| US-06-09 AC-1, AC-14          | Dựng phiên bản từ đề xuất, chỉnh dòng 8 seat 40tr, gửi                                                   | integration                                   | dòng gốc giữ 10 seat 50tr; phiên bản ghi 40tr kèm nhận xét; đề xuất `REVIEWED`            | xem plan                 |
| US-06-09 AC-3                 | File có dòng Cost Center `CC-Z`, số sai, khoảng đảo, chu kỳ sai; file hỏng                               | integration                                   | dòng đúng vào bản nháp, dòng sai báo theo số dòng; 422 cho file; ngân sách chưa hiện hành | xem plan                 |
| US-06-09 AC-6                 | Quý 75 trên tổng 80; không có trường hạn mức theo quý                                                    | integration + unit                            | 422 `QUARTERS_MISMATCH`; 422                                                              | xem plan                 |
| US-06-09 AC-7, AC-8           | Phiên bản sửa đổi 80 trên hiện hành 100; gửi không lý do                                                 | integration                                   | hiện hành vẫn 100 sau khi gửi; 422 `REVISION_REASON_REQUIRED`                             | xem plan                 |
| US-06-09 AC-11, AC-16, AC-18  | Sửa đổi cho năm đã kết thúc; năm sau không có ngân sách; Finance lập đề xuất, phiên bản không có đề xuất | integration                                   | 422; `NO_ACTIVE_BUDGET`, 409; 403, 422, 404                                               | xem plan                 |
| US-06-09 AC-13                | Trưởng phòng, IT Admin, Người duyệt chi, Super Admin dựng, sửa, gửi, đọc phiên bản                       | integration                                   | 403 tất cả; phiên bản không đổi                                                           | xem plan                 |
| US-06-09 AC-17                | Dời khoảng mua có lý do, không lý do, đảo; đổi số tiền; phiên bản không hiện hành                        | integration + unit                            | lịch sử trước/sau; 422; 409 `REVISION_REQUIRED`; 409                                      | xem plan                 |
| `INV-21`, toàn vẹn            | Hai phiên bản đang xử lý, hai hiện hành, tổng ≠ cơ sở + dự phòng, quý không cộng, nguồn sai, lý do trống | integration PostgreSQL (`budget-constraints`) | `23505`, `23514`, `23503` (37 ca)                                                         | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Mở module `budgets` ([ADR-0016](../../../decisions/0016-budgets-context.md), Proposed). `US-06-09` AC-17 chỉ làm vế dời khoảng mua và lịch sử; vế chạy lại kiểm tra ngân sách thuộc `g5-budget-check-and-finance-review` (`partial` trong bản đồ G5). Các test cần ngân sách hiện hành đặt trạng thái `APPROVED` bằng SQL vì quyết định của Người duyệt chi thuộc `g5-budget-version-decision`. Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.

## Mở lại theo baseline `769bb64` (Prompt 03, 26/10/2026)

- Audit G0–G6 trên Docs `769bb64` ↔ BE `7c28e75` mở lại hạng mục này: F27, F36, F37 — cổng tài chính cho `BM-10`; bản nháp phiên bản kẹt; `planId` lạ → 500.
- Remediation duy nhất: [g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md) ([impact matrix](../g0-g6-final-business-baseline-remediation/impact-matrix.md#3-findings)). AC liên quan không còn được coi là thỏa nguồn hiện hành cho tới khi remediation xong; trạng thái triển khai ở roadmap. Phần đã ghi phía trên là lịch sử, giữ nguyên.
- _26/10/2026 (Prompt 03, delta Docs `769bb64..e0cb5a0` — Owner pin `e0cb5a0`, `QĐ-91`, `QĐ-92`):_ thêm F62, F63, F64, F66, F67 và làm lại F36 theo `QĐ-91a` — đóng cuối năm cho đề xuất chưa dùng; đề xuất giữ _đã dùng lập phiên bản_ khi phiên bản bị từ chối, Finance lập lại từ cùng đề xuất, trưởng phòng nộp đề xuất mới trỏ về đề xuất trước; không khởi tạo phiên bản sửa đổi khi phòng chưa có trưởng phòng; lịch sử sửa phiên bản trước/sau; thông báo dòng 18, 40, 53 → 55; bản nháp của đề xuất rút/trả lại giữ `DRAFT` và tách (không `CANCELLED`). AC mới đề xuất giao hạng mục này: `US-06-09` AC-20, AC-22, AC-23, `US-06-10` AC-11 → AC-13 ([impact matrix mục 3.8, 9.1](../g0-g6-final-business-baseline-remediation/impact-matrix.md#38-delta-docs-769bb64e0cb5a0-qđ-91-qđ-92)).

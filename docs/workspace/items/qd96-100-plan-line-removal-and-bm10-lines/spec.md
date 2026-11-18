# Spec: qd96-100-plan-line-removal-and-bm10-lines — Request không gắn dòng kế hoạch; dòng BM-10 gọn

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement tiếp quản spec/plan và evidence.
- Thiết kế ban đầu bởi: AI theo quyết định Owner 05/11/2026 (phiên, chưa GVHD/mentor xác nhận) — `QĐ-101n`, thay toàn bộ
  `QĐ-101m`; thay hạng mục `qd96-100-plan-line-auto-match` (tạo cùng ngày, chưa ai implement — đã xóa).
- Thiết kế: `ready`. Owner review: chưa review. Peer review: chưa có. **Đợt 1** — bước 12b của
  SPEC-PLAN-DOT-1 (nhật ký review đã xóa 11/11/2026 — xem git history).
- Nguồn: Docs `5dad7b6` + sửa chưa commit 05/11/2026 (`QĐ-101n`; BRD 4.3 `FR-3.3`, `FR-3.20`, `FR-3.21`, `FR-5.15`(1)(2)(5)(6), `BM-10`; US —
  `US-05-04` AC-12, AC-15; `US-06-10` AC-1, AC-2; `US-06-12` AC-10 bỏ; `US-06-14` AC-5; `US-16-02` AC-9 — tham chiếu), BE `808318a4`.
- Nhóm roadmap: G5 — chỉ là planning container (xem `## Sizing decision`). [Kế hoạch](plan.md).

## Business outcome

Kiểm soát ngân sách chỉ ở số tổng của phòng (Cost Center `Unit` × năm). Request trả phí không bao giờ nối với dòng kế hoạch: không
input chọn dòng, không tự khớp, không output dòng/_ngoài kế hoạch_. Dòng `BM-10` và dòng phiên bản chỉ còn gói (tùy chọn) hoặc mô
tả, số seat (tùy chọn), số tiền của năm, ghi chú. Kiểm bằng http 422/404 + integration.

## Sizing decision

- Container: bó `qd96-100-alignment` (Owner 05/11/2026), Story G5.
- Mode: `split-story`.
- Outcome and owner: một luật (`QĐ-101n`) gỡ capability `requests/plan-line` và thu gọn hình dòng ở `budgets`.
- Boundaries: DTO/route `requests` (quyết nhu cầu, trình lô, view chi) và `budgets` (đề xuất, dòng phiên bản, import); một
  migration nới `NOT NULL`; seed/fixture.
- Not larger: ba kết quả kiểm tra (`qd96-100-budget-check-three-outcomes`), gỡ đường Finance rà soát, drop cột (dọn sau), loại
  dòng/ZBB/ưu tiên B4 (H1, hoãn — không đổi).
- Not smaller: gỡ input mà giữ output/khớp thì FE vẫn phải hiện thứ không còn nghĩa; gỡ dòng ở Request mà giữ khoảng mua ở
  `BM-10` thì còn ô nhập không ai dùng.
- Siblings: `qd96-100-request-year-without-spend-date` (#8, object `spend`), `qd96-100-remove-budget-revision-and-high-value`
  (#10, route dời khoảng mua), `qd96-100-annual-budget-reserve-and-floor` (#11, tiền `{amount}`), `qd96-100-head-group-request-queue`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC           | Coverage | Phần còn lại thuộc                                                                          |
| -------- | ------------ | -------- | ------------------------------------------------------------------------------------------- |
| US-05-04 | AC-12, AC-13 | partial  | AC-12 vế gợi ý/chọn dòng cũ: `g5-spend-submission-batches`; ở đây gỡ hẳn (AC-13 `(bỏ)`)     |
| US-05-04 | AC-15        | partial  | quyền xem số ngân sách: `qd96-100-budget-visibility-qd100p`; ở đây hình dòng                |
| US-06-10 | AC-1, AC-2   | partial  | vòng đời đề xuất: `g5-budget-proposal-and-review`; ở đây trường của dòng                    |
| US-06-12 | AC-10        | partial  | AC `(bỏ)` ở Docs; cờ `offPlan` gỡ ở đây; ba kết quả: `qd96-100-budget-check-three-outcomes` |
| US-06-14 | AC-5         | partial  | hàng đợi ngay: `qd96-100-head-group-request-queue`; ở đây trình không có dòng               |

## Size exception

- Cohesion: 4 Story chính, một luật (`QĐ-101n`) cắt ngang một contract — dòng kế hoạch trên Request (`US-05-04`, `US-06-12`,
  `US-06-14`) và hình dòng `BM-10` (`US-06-10`).
- Why not split: tách thì FE đổi cùng màn hai lần tối nay và hai hạng mục cùng sửa `budget-check.service.ts`, `budget.dto.ts`.
- Checkpoints: sau mỗi Task của plan (migration + `budgets`; gỡ `plan-line`; contract HTTP; seed) chạy quick gates + test theo file.
- Maximum scope: chỉ gỡ/thu gọn đã liệt kê ở mục 1; không drop cột, không đổi ba kết quả kiểm tra, không đụng loại dòng/ZBB.
- Accepted by: Owner 05/11/2026 (giao việc `QĐ-101n`, Đợt 1 bước 12b) — chờ Owner review spec.

## Supporting references

`US-16-02` AC-9 (mobile, cùng contract web — `a08-mobile-approver-flows` chỉ đổi test/tài liệu); `QĐ-101n`, `QĐ-82a`, `QĐ-82d`, `QĐ-82l(5)`, `QĐ-97c`, `QĐ-100p` (sửa tại chỗ bởi `QĐ-101n`); `QĐ-94g` B4 (không đổi); `US-06-09`
Dữ liệu nghiệp vụ (dòng phiên bản cùng dạng); quyết định cũ PLAN-LINE-DECISION (nhật ký review đã xóa 11/11/2026 — xem git history).

## Explicit out of scope

`spend.expectedSpendOn` (#8); route `…/lines/{position}/window`, `…/changes`, bảng `budget_version_line_changes` (#10); drop
cột (`access_requests.plan_line_*`, `off_plan`, `request_budget_checks.plan_line_overdue`, `off_plan`, cột khoảng mua của dòng) →
lượt dọn sau; tài liệu FE `Docs/Figma UI-UX/API-Integration`, sơ đồ, ERD, tài liệu quy trình.

## Dependencies and blockers

Sau #10 Task 1 (không còn ai đọc/ghi khoảng mua qua route dời) và #11 (hình tiền `{amount}` của dòng). Nếu #8 Task 2 đã merge:
gỡ hẳn key `spend`; nếu chưa: `spend` chỉ còn `{expectedSpendOn?}` và #8 gỡ nốt. Không chặn bởi ai khác.

## Ownership: module, data, API

- `requests` — **xóa** `plan-line/` (cả capability), `spend-submission/plan-line-route.service.ts`, handler
  `accessRequestPlanLineSet`/`…SuggestionList`; gỡ `planLineChoiceFields`, `oneChoice`, `PLAN_LINE_CHOICE_DESCRIPTION`,
  `planLineBodySchema`, `PlanLineBodyDto`, `PlanLineResponseDto`, `planLineStateSchema`, `suggestionSchema`, `judgePlanLineChoice`,
  `PlanLineChoice`, `submissionStop`, `supplementDropsPlanLine`, `AccessRequestPlanLineRefusedError`, `planLineRequiredOf`,
  `SpendInput.planLine`; `budget-check.service.ts` thôi đọc dòng.
- `budgets` — `budget.dto.ts` (`lineBody`, `linePatchSchema`, `proposalLineSchema`, `versionLineSchema`), `budget.policy.ts` (gỡ
  `missingLineFields`, `incompleteLines`, `backwardLines`, `isOverdue`, trường khoảng mua của `LineDraft`/`LineFields`/`copiedLineOf`),
  `proposal.repo.ts`, `version-line.repo.ts`, `proposal-sender.service.ts`, `version-line.service.ts`, `line-import.service.ts`,
  `version-view.service.ts`, `proposal-view.service.ts`, `version-history.policy.ts`; `BudgetsApi.planLine`, repo `planLine`,
  `currentLine`, danh sách gợi ý, `PlanLineFacts`, `PlanLineSummary`; lỗi `BudgetProposalIncompleteError`, `BudgetWindowBackwardsError`.
- Data: một migration (mục 4). API: bảng mục 1.

## Behavior and design

1. **API trước → sau** (mọi body `z.strictObject` ⟹ field bỏ gửi lên là 422 `VALIDATION_ERROR`, không ghi gì).

| Operation                                                                                                               | Trước                                                                                                                                                                  | Sau                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accessRequestNeedDecide`, `accessRequestLineNeedDecide`                                                                | `spend {planLine{position, stillNeeded?}} \| {offPlan:true}`, thiếu ⟹ 422                                                                                              | `spend.planLine`, `spend.offPlan` ⟹ 422; duyệt không điều kiện về dòng                                                                                                 |
| `accessRequestPlanLineSet` `PUT /access-requests/{id}/plan-line`                                                        | chọn dòng                                                                                                                                                              | **gỡ** ⟹ 404                                                                                                                                                           |
| `accessRequestPlanLineSuggestionList` `GET /access-requests/{id}/plan-line-suggestions`                                 | gợi ý dòng                                                                                                                                                             | **gỡ** ⟹ 404                                                                                                                                                           |
| `accessRequestGet`, `spendQueueList`, `spendApprovalList`, `spendApprovalGet`, `budgetCheckGet`, `financeReview*` (out) | `offPlan`, `planLineAttached`, `planLineOverdue`                                                                                                                       | **bỏ** cả ba; không có `planLine`                                                                                                                                      |
| `needDecisionList` (out)                                                                                                | `planLineRequired`                                                                                                                                                     | **bỏ**                                                                                                                                                                 |
| `spendQueueList.readyToSubmit`                                                                                          | có giá **và** đã chọn dòng/_ngoài kế hoạch_                                                                                                                            | có giá                                                                                                                                                                 |
| mã `primaryCode`/`codes` (`spendApproval*`, `budgetCheckGet`, `financeReview*`)                                         | có `PLAN_LINE_OVERDUE`                                                                                                                                                 | **bỏ** khỏi enum                                                                                                                                                       |
| `spendBatchItemList.stopReason`                                                                                         | `PLAN_LINE_REQUIRED`                                                                                                                                                   | enum giữ để đọc lô cũ; không ghi mới                                                                                                                                   |
| `budgetProposalSubmit`, `…Resubmit`, `budgetVersionLineAdd` `lines[]`                                                   | `{description, planId?, seats?, amount, windowFrom?, windowTo?, servicePeriodMonths?, repeatCycle?, quoteValidUntil?, note?}`                                          | `{planId?, description?, seats?, amount, note?}`; 5 trường ⟹ 422                                                                                                       |
| `budgetVersionLineUpdate` `PUT …/lines/{position}`                                                                      | patch gồm 5 trường trên                                                                                                                                                | `{description?, planId?, seats?, amount?, financeComment?, adjustmentReason?}`; 5 trường ⟹ 422                                                                         |
| `budgetVersionImport` (CSV)                                                                                             | bắt buộc `window_from`, `window_to`, `service_period_months`, `repeat_cycle`                                                                                           | bắt buộc `cost_center_code`, `description`, `amount`; tùy chọn `seats`, `note`; header có 1 trong 5 cột cũ ⟹ 422 `BUDGET.IMPORT_FILE_INVALID` reason `RETIRED_COLUMNS` |
| dòng đề xuất/phiên bản (out: `budgetProposalGet`, `budgetVersionLineList`, …)                                           | `windowFrom`, `windowTo`, `servicePeriodMonths`, `repeatCycle`, `quoteValidUntil`, `overdue`                                                                           | **bỏ** 6 trường                                                                                                                                                        |
| lỗi                                                                                                                     | `BUDGET.PROPOSAL_INCOMPLETE`, `BUDGET.WINDOW_BACKWARDS`, `ACCESS_REQUEST.PLAN_LINE_REQUIRED`, `…LINE_NOT_FOUND`/`STILL_NEEDED_REQUIRED`, `SPEND.PLAN_LINE_NOT_UPDATED` | **bỏ** (không còn nguyên nhân)                                                                                                                                         |

2. **Dòng sau sửa:** `planId` (uuid, tùy chọn — gói trong danh mục, không tồn tại ⟹ lỗi `BudgetPlanNotFoundError` sẵn có),
   `description` (1..200, tùy chọn), `seats` (1..100000, tùy chọn), `amount {amount}` (bắt buộc, ≥ 0, đồng tiền báo cáo — #11),
   `note` (1..1000, tùy chọn). Refine: có `planId` **hoặc** `description` ⟹ thiếu cả hai: 422 `VALIDATION_ERROR` path `description`.
   Có `planId` mà không `description` ⟹ BE ghi `description = "<ứng dụng> · <gói>"` (cột giữ `NOT NULL`, output `description: string`).
   Import luôn bắt `description` (file không có `plan_id`). Phiên bản lập từ đề xuất chép đúng các trường còn lại.
3. **Request:** duyệt nhu cầu, trình lô, hồ sơ bổ sung, duyệt chi không đọc/ghi dòng. `BudgetCheckService` ghi
   `plan_line_overdue = false`, `off_plan = false`; `CheckCode` bỏ `PLAN_LINE_OVERDUE`; `spend-decision.policy` và
   `finance-review.policy` bỏ vế `planLineOverdue`. Mapper bỏ qua giá trị cũ của các cột này (check cũ có `true` không còn hiện).
4. **Migration (forward):** `ALTER TABLE budget_proposal_lines` và `budget_version_lines` `ALTER COLUMN window_from, window_to,
service_period_months, repeat_cycle DROP NOT NULL` (`quote_valid_until` đã nullable). CHECK `*_window_check`, `*_service_check`
   giữ (NULL qua). Prisma: 4 field thành optional. BE ghi `NULL`, không đọc; dữ liệu cũ giữ, không hiện. Không đổi bảng
   `access_requests`/`request_budget_checks` (cột thành cột chết — ghi danh sách dọn sau, R-28). Timestamp theo R-19 (đặt lúc merge).
5. **Quyền:** không đổi phạm vi đọc; chỉ bớt field.

## Test matrix

| AC / rủi ro             | Tình huống                                                                    | Cấp test    | Kết quả mong đợi                                                                          | Bằng chứng |
| ----------------------- | ----------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- | ---------- |
| US-05-04 AC-12 input    | `spend.planLine`, `spend.planLine.stillNeeded`, `spend.offPlan` × 2 operation | http        | 6 × 422 `VALIDATION_ERROR`, đếm bảng không đổi                                            | planned    |
| Route gỡ                | `PUT …/plan-line`, `GET …/plan-line-suggestions`                              | http        | 404                                                                                       | planned    |
| AC-12 output            | `accessRequestGet`, `spendQueueList`, `spendApprovalGet`, `needDecisionList`  | http        | không có `offPlan`, `planLineAttached`, `planLineOverdue`, `planLineRequired`, `planLine` | planned    |
| US-06-14 AC-5           | trình lô Request chưa từng chọn dòng                                          | integration | không `STOPPED`; check ghi `off_plan=false`                                               | planned    |
| US-06-12 AC-10 bỏ       | hai Request cùng số tiền, phòng có/không có dòng cùng gói                     | integration | `route`, mã, số giống hệt                                                                 | planned    |
| US-06-10 AC-2 bỏ trường | 5 trường × (`Submit`, `Resubmit`, `LineAdd`) + 5 × `LineUpdate`               | http        | 20 × 422, không ghi                                                                       | planned    |
| US-06-10 AC-1/AC-2 hình | dòng chỉ mô tả + số tiền; chỉ `planId`; thiếu cả hai; thiếu `amount`          | http + int. | 201; 201 với `description` = tên gói; 422; 422                                            | planned    |
| Import                  | CSV không cột cũ; CSV có `window_from`                                        | integration | dòng được thêm; 422 `RETIRED_COLUMNS`                                                     | planned    |
| Migration               | dòng đề xuất/phiên bản có 4 cột `NULL`                                        | integration | DB nhận; CHECK cũ vẫn bắt `window_to < window_from`                                       | planned    |

## Definition of Done

- [ ] `rg "planLineChoice|oneChoice|stillNeeded|plan-line|PlanLine|planLineAttached|planLineRequired|planLineOverdue|windowFrom|servicePeriodMonths|repeatCycle" src/modules test`
      chỉ còn chỗ ghi chú lý do hoặc enum đọc lô cũ (`PLAN_LINE_REQUIRED`); `quoteValidUntil` chỉ còn ở đánh giá của IT.
- [ ] Quick gates + test theo file xanh; `pnpm openapi:export`; manifest `api-coverage`, `openapi-example*` bỏ 2 route và ví dụ lỗi.
- [ ] FE nhận bảng mục 1–2 (FIELD-CHANGES-DOT-1 bước 12b); spec/plan khớp implementation; không tăng legacy ledger.

## Changes and acceptance

05/11/2026: bản đầu (`ready`, Đợt 1) theo `QĐ-101n`, thay `qd96-100-plan-line-auto-match` (`QĐ-101m`, cùng ngày, đã xóa —
không implement). Chốt: không có output `planLine`/`offPlan`; dòng `BM-10` 5 trường; migration chỉ nới `NOT NULL`. Chưa nghiệm thu.

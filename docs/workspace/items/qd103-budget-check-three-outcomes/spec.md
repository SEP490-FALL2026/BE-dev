# Spec: qd103-budget-check-three-outcomes — kiểm tra ngân sách ba kết quả, xác nhận dùng dự phòng; bỏ Finance rà soát, hỏi Finance, override

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (subagent thiết kế W3), đợt W3 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `draft` (sửa theo audit thiết kế W3, chờ cổng thiết kế). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-3.20` bảng ba kết quả, _Số tiền được kiểm_ (dòng 686) + _Kiểm tra lại lúc duyệt chi_
  (dòng 703), `FR-3.21`, `FR-3.14`(1)(3), `FR-3.13`, `FR-3.4`, `FR-3.8`, `BR-MF1-06`, `BR-MF1-07`; `QĐ-97c`, `QĐ-97f`, `QĐ-97g`,
  `QĐ-100j`, `QĐ-100u`, `QĐ-100w`, `QĐ-103r`, `QĐ-104c`(1), `QĐ-104d`(1); QT v1.7 mục 1.4–1.7, A.4), BE `1cd81101`. Ledger: L2-13,
  L2-14, L2-16, L1-23 (+ dòng mới đề nghị cho người nhận nhắc SLA bước nhu cầu); luật R-B05, R-B06 (vế lô), R-B07. Câu TẠM CHỌN:
  Q-26 (dữ liệu Finance rà soát cũ); dùng Q-29 (số tiền 0 của Request tiếp tục).
- Nhóm roadmap: G5 (từ re-pin scope map 11/11/2026) — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Khi trưởng phòng trình lô (sau sibling single-step: cả khi gửi Request một bước), hệ thống **tính lại số tiền theo ngày kiểm**
rồi kiểm **giá gốc** trên phiên bản đã duyệt của (Cost Center, năm hiện hành) với **số cơ sở** và **dự phòng**, trừ thực chi, cam
kết đang giữ và Request đang chờ duyệt chi, ra **một** trong ba kết quả: _trong số cơ sở_ ⟹ bước Người duyệt chi ngay; _dùng dự
phòng_ ⟹ trưởng phòng xác nhận kèm một dòng lý do rồi mới có bước; _bị chặn_ ⟹ không bước, báo người yêu cầu + trưởng phòng. Lúc
duyệt kiểm lại; _bị chặn_ hoặc _dự phòng chưa xác nhận_ ⟹ **không lưu duyệt**, trả về trưởng phòng, báo hai người. Bước nhu cầu quá
SLA nhắc người giữ + người yêu cầu (`QĐ-100j`). **Không còn** Finance rà soát, hỏi Finance, chờ ngân sách, override, giá trị cao.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục); bó finding `qd103-108-alignment` (đợt W3). Trước re-pin 11/11/2026 là ngoài nhóm.
- Mode: `grouped-stories`.
- Outcome and owner: `requests/spend` (policy + service kiểm), capability mới `requests/reserve-confirmation` (xác nhận dự
  phòng, không controller) và `requests/spend-effects` (giữ cam kết, trả về — thay `budget-information/`), `requests/spend-approval`
  (quyết định), `requests/spend-approval-view`, `requests/spend-submission` (route xác nhận), `requests/status` (thông báo),
  `requests/sla` (người nhận nhắc); `budgets/budget` (`yearFacts` thêm số cơ sở/dự phòng), `budgets/public` (gỡ `BudgetChangeListeners`).
- Boundaries: 2 migration; 1 operation mới (`spendReserveConfirm`); gỡ 7 operation; đổi DTO của 8 operation; một bảng mới; 2 capability mới.
- Not larger: Request một bước (kiểm khi gửi, tự quyết dự phòng, trả về người yêu cầu) ở `qd103-request-single-step-routing`;
  một khoản cam kết năm hiện hành ở `qd103-commitment-current-year`; cờ GH-3 trên snapshot ở `qd103-request-limits-gh`;
  `K2` seat-tháng trong thực chi (`QĐ-103r`) ở W5 `qd103-seat-month-cost-pool-line`.
- Not smaller: ba kết quả, xác nhận dự phòng và kiểm lại lúc duyệt là một luật trên cùng snapshot; gỡ nhánh Finance cùng lúc vì
  kết quả `FINANCE_REVIEW` không còn tồn tại trong policy mới (để lại thì code chết, test sai nghĩa).
- Siblings: `qd103-request-amount-and-term` (trước), `qd103-commitment-current-year`, `qd103-request-single-step-routing` (sau).
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                                                                    | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                                                                        |
| -------- | --------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-06-01 | AC-2, AC-3, AC-9, AC-18, AC-21→AC-24, AC-28                           | partial  | AC còn lại và vế chung theo scope map: `g5-spend-approval-decision`, `qd103-request-amount-and-term`, `g5-group-requests`, `qd93-remove-fallback-substitute-approvers`, `qd96-100-remove-spend-override`, `qd96-100-request-year-without-spend-date`, `qd103-request-single-step-routing`, `qd103-grant-from-shared-pool` |
| US-06-12 | AC-1, AC-4, AC-5, AC-8, AC-9, AC-11, AC-14, AC-20, AC-23, AC-25→AC-28 | partial  | AC còn lại và vế chung theo scope map: `g5-budget-check-and-finance-review`, `qd96-100-plan-line-removal-and-bm10-lines`, `qd96-100-request-year-without-spend-date`, `qd96-100-request-term-limit`, `qd103-seat-month-cost-pool-line`, `qd103-request-single-step-routing`                                               |
| US-06-16 | AC-1→AC-6, AC-8, AC-9                                                 | partial  | AC còn lại và vế chung theo scope map: `qd103-request-single-step-routing`                                                                                                                                                                                                                                                |

## Supporting references

`US-06-12` AC-1, AC-4, AC-5, AC-8, AC-9, AC-11, AC-14, AC-20, AC-23, AC-25→AC-28; `US-06-01` AC-2, AC-3, AC-9, AC-18, AC-21→AC-24,
AC-28; `US-06-14` AC-9, AC-12, AC-13; `US-06-16` AC-1→AC-6, AC-8, AC-9. Spec cũ `qd96-100-budget-check-three-outcomes`,
`-reserve-confirmation`, `-remove-finance-review-path`, `-remove-spend-override`, `-spend-notifications` chỉ đọc tham khảo.

_Re-pin 11/11/2026 ([C3](../../../reviews/mf2-mf3-2026-11-10/C3-SCOPE-MAP-REPIN.md)):_ trước là `technical-enabler`, dòng `n/a` của bảng Primary: L2-13, L2-14, L2-16, L1-23 — gỡ chặn `qd103-commitment-current-year`, `qd103-request-single-step-routing`, W8 `qd103-api-docs-regression`. Bảng Primary claim AC của tối đa ba Story chính lấy từ danh sách trên, chỉ AC đang dùng ở Docs `5bb2e6a` (số AC của EP-05/EP-06/EP-12 không đổi giữa `9c7f386` và `5bb2e6a`); khóa khác của danh sách trên giữ chủ hiện có hoặc là `deferred` tới hạng mục này trong scope map. Claim theo spec và commit đã merge (PR #36), chưa đối chiếu từng AC trên code.

## Explicit out of scope

- Kiểm khi **gửi** và tự quyết dự phòng của Request một bước — sibling single-step. Thực chi `K2` seat-tháng (`QĐ-103r`) — W5.
- `budgetMine` — W2 `qd103-budget-views`. Drop bảng `request_finance_reviews`, `budget_information_requests` — giữ chỉ đọc (Q-26).

## Dependencies and blockers

`qd103-request-amount-and-term` (số tiền một năm, tính lại trong `run`). **Sau commit W2** `qd103-budget-cycle-ceilings`,
`qd103-budget-proposal-lines-cleanup` (`base_minor`/`reserve_minor`; gỡ cả `spend-budget.listener.ts`), `qd103-budget-views` (cùng _Request đang chờ_).

## Ownership: module, data, API

- Migration 1 `<ts>_budget_check_outcomes` (chỉ thêm): enum `BudgetCheckOutcome {WITHIN_BASE, USES_RESERVE, BLOCKED}`;
  `request_budget_checks.outcome BudgetCheckOutcome NULL` (dòng cũ null), `block_reasons text[] NOT NULL DEFAULT '{}'`
  CHECK ⊆ `{OVER_RESERVE, NO_APPROVED_BUDGET, PRICE_EXPIRED}`, `over_base_by_minor`, `over_by_minor bigint NULL`;
  `request_budget_check_years.base_minor`, `reserve_minor`, `remaining_base_minor`, `remaining_with_reserve_minor bigint NULL`;
  `BudgetCheckTrigger` + `RESERVE_CONFIRMATION`; `SpendBatchItemOutcome` + `AWAITING_RESERVE_CONFIRMATION`; bảng
  `request_reserve_confirmations` (`id`, `organization_id`, `request_id` FK, `check_id` FK UNIQUE, `spend_step_id` FK UNIQUE,
  `reason text` CHECK 1–300 ký tự sau trim, không xuống dòng, `confirmed_by_employee_id` FK, `confirmed_at timestamptz`),
  trigger bất biến như `spend_decisions` (INV-05), quyền runtime role theo mẫu migration gần nhất.
- Migration 2 `<ts>_finance_review_retired` (dữ liệu, Q-26): Request `AWAITING_FINANCE_REVIEW`/`AWAITING_BUDGET` ⟹
  `AWAITING_SPEND_SUBMISSION`; bước `FINANCE_REVIEW` mở ⟹ `CLOSED`; câu hỏi `budget_information_requests` `OPEN` ⟹ `CLOSED`
  (`STEP_CLOSED`); thêm CHECK `access_requests.state NOT IN ('AWAITING_FINANCE_REVIEW','AWAITING_BUDGET')`. Giá trị enum giữ trong
  DB và Prisma (ghi chú _legacy, CHECK cấm_), không tái tạo enum. Request của trưởng phòng tự gửi (dòng 2) bị đưa về hàng đợi
  của chính trưởng phòng ở đây; migration B của `qd103-request-single-step-routing` bắt đúng ca này (Q-24, DA3-15).
- Gỡ capability `finance-review/`, `budget-information/`, `budget-questions/`; `spend/finance-review.repo.ts`,
  `step-routing/spend-routing.policy.ts` (`routeFinanceReview`); `status/rules/status-rules-finance.policy.ts` thay bằng luật
  kiểm tra ngân sách; README `requests` (bảng tầng — lệnh `pnpm arch:capabilities --module requests`, bảng sở hữu, extension point).
- **Capability mới (DA3-07, `module-structure.md:56-66`: phần capability khác gọi là capability, không phải nhóm):**
  `reserve-confirmation/` (`.service.ts`, `.policy.ts` + spec, `.repo.ts`; `spend-submission` và `spend-approval` gọi; không controller,
  không import hai bên đó); `spend-effects/spend-effects.service.ts` (từ `budget-information/`, giữ `hold`, `sendBack`). L1/L2, không vòng.
- `budgets/public/budgets.types.ts` `YearBudgetFacts` + `baseMinor`, `reserveMinor` (`budget/budget-facts.repo.ts`); gỡ
  `BudgetChangeListeners` (không còn listener) cùng các lời gọi phát ở `version/version-decision-judge.service.ts`,
  `version-decision-writer.service.ts`, `year-end/year-end.service.ts`.
- Operation **gỡ** (7): `financeReviewList`, `financeReviewGet`, `financeReviewComplete`, `budgetInformationAsk`,
  `budgetInformationOfRequest`, `budgetInformationList`, `budgetInformationAnswer`.
- Operation **mới**: `spendReserveConfirm` POST `/api/v1/access-requests/{id}/reserve-confirmation` body `{ reason }` — chỉ
  trưởng phòng hiện hành của phòng Request (`MANAGER` đang giữ phòng); người thụ hưởng không xác nhận (QT 1.6).
- Operation **đổi**: `spendBatchSubmit`/`Get`/`ItemList` (outcome `AWAITING_RESERVE_CONFIRMATION`, `stopReason` mới), `spendQueueList`
  (stage `RESERVE_CONFIRMATION`, `overBaseBy`; bỏ `RETURNED_BY_FINANCE`, `financeReturnReason`), `spendApprovalList`/`Get` (`outcome`,
  `budgetSnapshot`, `annualVendorAmount`; bỏ `latestBudgetInformation`, `noIndependentReview`), `spendApprovalDecide`/`spendBatchDecide`/
  `spendApprovalLineDecide` (bỏ `override`), `accessRequestGet` (`spend.stage`, `blockedReasons[]`, `overBy`; state bỏ 2 giá trị),
  `budgetCheckGet`/`budgetCheckYearList` (outcome, số mới).

## Behavior and design

1. **Policy** `checkBudget({ costMinor, budget, pendingMinor, priceExpired })` (`spend/budget-check.policy.ts`, viết lại):
   `remainingBase = base − spent − held − pending`; `remainingWithReserve = base + reserve − spent − held − pending` (được âm).
   Không có phiên bản `APPROVED` của (Cost Center, năm hiện hành) ⟹ `NO_APPROVED_BUDGET`; báo giá `validUntil < hôm nay` ⟹
   `PRICE_EXPIRED`; `cost > remainingWithReserve` ⟹ `OVER_RESERVE` (`overBy`). Có lý do chặn ⟹ `BLOCKED` (ghi **đủ** lý do,
   `US-06-12` AC-9); không thì `cost ≤ remainingBase` ⟹ `WITHIN_BASE`, còn lại ⟹ `USES_RESERVE` (`overBaseBy`). Biên: `cost =
remainingBase` ⟹ trong số cơ sở; `cost = remainingWithReserve` ⟹ dùng dự phòng; +1 ⟹ chặn. `cost = 0` (Request tiếp tục có
   kỳ mới ở năm sau, Q-29) không xét vượt: chỉ có thể `BLOCKED` vì `NO_APPROVED_BUDGET`/`PRICE_EXPIRED`, còn lại `WITHIN_BASE`. Năm
   luôn là `request.budgetYear` **sau khi `run` tính lại theo ngày kiểm** (sibling, DA3-01) = năm hiện hành ⟹ không cần mã _năm đã
   đóng_ của L1 (DA3-20). `BudgetYearCode` ghi tương ứng (`BUDGET_OK`/`INSUFFICIENT_BUDGET`/`NO_ACTIVE_BUDGET`); `route` =
   `BLOCKED` hoặc `SPEND_APPROVAL`; không còn `HIGH_VALUE`, `FINANCE_REVIEW`, `period_closed`.
2. **Trình lô** (`SpendRoutingService.route`, trigger `SUBMISSION`, tính lại theo ngày trình): `WITHIN_BASE` ⟹ mở bước `SPEND_APPROVAL` (giao Người duyệt
   chi hoặc chờ `NO_SPENDING_APPROVER`); `USES_RESERVE` ⟹ ở lại `AWAITING_SPEND_SUBMISSION`, item `AWAITING_RESERVE_CONFIRMATION`,
   báo trưởng phòng (`REQUEST_RESERVE_CONFIRMATION_NEEDED`, phần vượt); `BLOCKED` ⟹ ở lại hàng đợi, item `STOPPED` +
   `stopReason`, báo người yêu cầu + trưởng phòng (`REQUEST_BUDGET_BLOCKED`, lý do, `overBy`), `PRICE_EXPIRED` báo thêm IT Admin
   giữ bước thẩm định; **không** báo Finance. Mục chặn không kéo cả lô (`US-06-14` AC-9).
3. **Xác nhận dự phòng** (`spendReserveConfirm`): khóa Request `FOR UPDATE`; điều kiện: state `AWAITING_SPEND_SUBMISSION`, kiểm
   tra `SUBMISSION`/`RESERVE_CONFIRMATION` gần nhất là `USES_RESERVE` và chưa có bước chi mở ⟹ ngược lại 409
   `SPEND.RESERVE_NOT_PENDING`; không phải trưởng phòng hiện hành của phòng ⟹ 403 `SPEND.NOT_HEAD`; trưởng phòng là người thụ
   hưởng ⟹ 403 `SPEND.RESERVE_CONFIRMER_IS_BENEFICIARY`; lý do thiếu/rỗng/xuống dòng/> 300 ⟹ 422 `VALIDATION_ERROR`. Chạy lại
   kiểm tra (trigger `RESERVE_CONFIRMATION`, số tiền tính lại theo ngày xác nhận, snapshot lúc xác nhận): `USES_RESERVE` ⟹ mở bước chi rồi ghi xác nhận (check,
   bước, lý do, người, thời điểm) — SLA tính từ lúc này; `WITHIN_BASE` ⟹ mở bước, không ghi xác nhận; `BLOCKED` ⟹ không mở
   bước, 200 kèm kết quả. Sửa (hồ sơ bổ sung) rồi trình lại ⟹ kiểm tra mới, xác nhận cũ không còn tác dụng (gắn bước cũ).
4. **Kiểm lại lúc duyệt** (`judgeApproval` viết lại; dùng cho cá nhân và `group-spend-decision.service.ts`): trigger
   `SPEND_DECISION`, `run` tính lại số tiền theo ngày duyệt. `BLOCKED` ⟹ không lưu, bước `CLOSED`, Request về `AWAITING_SPEND_SUBMISSION`,
   kết quả 409 `SPEND.RECHECKED_RETURNED_TO_HEAD` `details.reasons`; `USES_RESERVE` mà không có xác nhận gắn **bước chi đang mở**
   ⟹ như trên, `details.reasons = ['RESERVE_UNCONFIRMED']`. Cả hai ca **báo người yêu cầu + trưởng phòng** (mã mới
   `REQUEST_RETURNED_AT_DECISION`, lý do, phần vượt; BRD dòng 703, `US-06-16` AC-6 — DA3-06); `spendBatchDecide` báo từng mục bị
   trả. Còn lại ⟹ lưu duyệt (snapshot = kiểm tra này, cờ `usesReserve` + lý do xác nhận vào quyết định/audit). `override` trong
   body ⟹ 422 `VALIDATION_ERROR`. Request đang quyết không trừ chính nó ở _đang chờ_ (`exceptRequestId` — giữ).
5. **Snapshot** (`spendApprovalGet`): `budgetSnapshot { year, base, reserve, spent, committed, pending, remainingBase,
remainingWithReserve, outcome, overBaseBy, reserveConfirmation | null, computedAt }` tính lúc mở (không khóa) và
   `decisionSnapshotCheckId` sau khi quyết; `annualVendorAmount` = giá năm × người khi `ANNUAL` và gói chưa có thuê bao `ACTIVE`
   (W3: `NEW_SOFTWARE` có báo giá năm; W4 mở rộng). Người yêu cầu + trưởng phòng thấy `outcome`, `blockedReasons`, phần vượt của
   **Request đó** (`accessRequestGet.spend`, `US-06-12` AC-26); Finance không có bước, không nhận thông báo.
6. **Gỡ Finance:** mọi nhánh mở `FINANCE_REVIEW`, `AWAITING_BUDGET`, `reopenReview`, `routeAfterOpinionWhileWaiting`,
   `refuseReviewer` (`SoD-8` hết đối tượng), `BudgetInformationService.closeOpen` ở `request-end`/`group-resolution-ending`/
   `sendBack`; route cũ trả 404 (route không tồn tại). `SpendDecisionRefusedError` bỏ `OVERRIDE_*`, `NOT_CHECKABLE` giữ.
   **Nhắc SLA** (`sla/step-sla.policy.ts:132-155`): bỏ người nhận `FINANCE_QUESTION`; bước `NEED` quá hạn nhắc người giữ **và người
   yêu cầu**, không nhắc cấp trên (`QĐ-100j`, `QĐ-52c`); bước khác và ca không người giữ (Super Admin) giữ nguyên.
7. **Khóa:** Request `FOR UPDATE` → tính lại → khóa năm (Cost Center, năm) → đọc số → ghi kiểm tra/bước/xác nhận/quyết định trong
   một transaction. Hai xác nhận song song: cái sau 409 `RESERVE_NOT_PENDING`. Hai duyệt cùng Cost Center: khóa năm tuần tự hóa.
8. **Dữ liệu cũ/seed:** kiểm tra cũ (`outcome` null): view suy từ `code` cũ (`BUDGET_OK` ⟹ `WITHIN_BASE`, còn lại ⟹ `BLOCKED`).
   Seed: `R9` (`target: AWAITING_FINANCE_REVIEW`, `shared-demo-v3/requests.ts`) đổi `AWAITING_SPEND_SUBMISSION`; bỏ giá trị đó khỏi
   `DemoRequestTarget` và `scenario-path.ts:10,16`; ngân sách demo đủ để `R1`, `R2`, `R10`, `R11` _trong số cơ sở_.

## Test matrix

| AC / rủi ro   | Tình huống (gồm từ chối, edge case)                                              | Cấp test                | Kết quả mong đợi                                                                                                                                                 | Bằng chứng sau implement |
| ------------- | -------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| R-B05         | cơ sở 100, dự phòng 10, chi 40, cam kết 20, chờ 15; Request 25 / 26 / 35 / 36    | unit                    | `WITHIN_BASE` / `USES_RESERVE` overBaseBy 1 / `USES_RESERVE` / `BLOCKED OVER_RESERVE` overBy 1                                                                   |                          |
| AC-5          | không có phiên bản đã duyệt; chỉ có phiên bản `SENT`                             | unit + integration      | `BLOCKED NO_APPROVED_BUDGET`                                                                                                                                     |                          |
| AC-8, AC-9    | báo giá hết hạn + vượt dự phòng                                                  | unit                    | `BLOCKED` hai lý do                                                                                                                                              |                          |
| FR-5.8a       | còn lại đã âm, Request 1                                                         | unit                    | `BLOCKED OVER_RESERVE`                                                                                                                                           |                          |
| Q-29          | còn lại âm, Request tiếp tục số tiền 0; 0 khi chưa có phiên bản đã duyệt         | unit                    | `WITHIN_BASE`; `BLOCKED NO_APPROVED_BUDGET`                                                                                                                      |                          |
| DA3-01        | trình 28/11 (`USES_RESERVE` 2 tháng), xác nhận 02/12                             | integration             | kiểm `RESERVE_CONFIRMATION` với 1 tháng, `REPRICED`                                                                                                              |                          |
| US-06-14 AC-9 | lô 3 mục: trong cơ sở, dự phòng, chặn                                            | integration             | 1 bước chi; 1 `AWAITING_RESERVE_CONFIRMATION`; 1 `STOPPED`; thông báo đúng người, Finance không                                                                  |                          |
| US-06-16 AC-1 | trưởng phòng xác nhận kèm lý do                                                  | http + integration      | bước chi mở, SLA từ lúc xác nhận, xác nhận gắn bước                                                                                                              |                          |
| US-06-16 AC-1 | thiếu lý do; lý do 301 ký tự; có xuống dòng                                      | http                    | 422                                                                                                                                                              |                          |
| quyền         | IT Admin / Finance / Employee / trưởng phòng khác / Người duyệt chi gọi xác nhận | http                    | 403                                                                                                                                                              |                          |
| QT 1.6        | trưởng phòng là người thụ hưởng (Request nhóm không chứa — dữ liệu cũ)           | integration             | 403 `RESERVE_CONFIRMER_IS_BENEFICIARY`                                                                                                                           |                          |
| trạng thái    | xác nhận Request `WITHIN_BASE`/đã có bước/đã rút                                 | http                    | 409 `RESERVE_NOT_PENDING`                                                                                                                                        |                          |
| xác nhận lại  | lúc xác nhận số đổi thành chặn                                                   | integration             | 200, không bước, kết quả `BLOCKED`                                                                                                                               |                          |
| US-06-16 AC-3 | bổ sung bỏ người sau khi xác nhận, trình lại                                     | integration             | kiểm tra mới; xác nhận cũ không áp                                                                                                                               |                          |
| AC-18         | duyệt khi kiểm lại `BLOCKED`                                                     | integration             | không lưu, bước `CLOSED`, về hàng đợi, 409 `RECHECKED_RETURNED_TO_HEAD`; người nhận `REQUEST_RETURNED_AT_DECISION` = người yêu cầu + trưởng phòng, không Finance |                          |
| AC-18         | duyệt khi kiểm lại `USES_RESERVE`, bước mở từ `WITHIN_BASE`                      | integration             | 409 reasons `RESERVE_UNCONFIRMED`; cùng hai người nhận                                                                                                           |                          |
| AC-24         | duyệt `USES_RESERVE` đã xác nhận                                                 | integration             | lưu duyệt, quyết định mang cờ + lý do                                                                                                                            |                          |
| AC-23         | body có `override`                                                               | http                    | 422 `VALIDATION_ERROR`                                                                                                                                           |                          |
| L2-14         | 7 route Finance/hỏi Finance                                                      | http                    | 404                                                                                                                                                              |                          |
| lô hàng loạt  | `spendBatchDecide` 3 mục, 1 thành chặn                                           | integration             | 2 lưu, 1 về hàng đợi, thông báo trả về cho mục đó                                                                                                                |                          |
| QĐ-100j       | bước nhu cầu quá SLA; bước chi quá SLA                                           | unit + integration      | nhắc `H1` + người yêu cầu, không cấp trên; bước chi giữ người nhận cũ                                                                                            |                          |
| nhóm          | duyệt dòng nhóm khi kiểm lại `USES_RESERVE` chưa xác nhận                        | integration             | không lưu, về hàng đợi                                                                                                                                           |                          |
| L2-16         | `spendApprovalGet` gói năm đề xuất mới                                           | http + integration      | snapshot đủ số, `annualVendorAmount` = giá năm × người                                                                                                           |                          |
| AC-9          | đang chờ gồm Request có bước chi mở cùng Cost Center, trừ chính nó               | integration             | số khớp tính tay                                                                                                                                                 |                          |
| concurrency   | hai xác nhận song song; hai duyệt cùng Cost Center làm vượt                      | integration             | một 409; cái sau thành chặn                                                                                                                                      |                          |
| L1-23         | phiên bản được duyệt sau khi có Request bị chặn                                  | integration             | không tự chạy lại (trình lại mới kiểm)                                                                                                                           |                          |
| dữ liệu cũ    | Request `AWAITING_FINANCE_REVIEW` trước migration 2                              | integration (migration) | về hàng đợi, bước Finance `CLOSED`, CHECK chặn ghi lại                                                                                                           |                          |
| seed          | `ops:seed` DB sạch, chạy lại                                                     | integration             | xanh, `R9` ở hàng đợi                                                                                                                                            |                          |

## Definition of Done

- [ ] Test matrix xanh; `openapi.json` gỡ 7 operation, thêm `spendReserveConfirm`; `api-coverage-manifest.ts` khớp.
- [ ] README `requests` (bảng tầng do lệnh tính, bảng sở hữu, extension point) và README `budgets` (gỡ `BudgetChangeListeners`).
- [ ] Test của tính năng bị gỡ xóa có lý do trong plan; thay bằng test phủ định (404, 422 `override`).
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

08/11/2026: tạo ở W3 (bản nháp trong scratch, chờ cổng thiết kế). Chưa nghiệm thu.
08/11/2026: sửa theo audit thiết kế W3 (`design-audit-w3.md`): tính lại ở mọi lần kiểm gồm xác nhận dự phòng (DA3-01), báo người
yêu cầu + trưởng phòng khi trả về lúc duyệt (DA3-06), `reserve-confirmation/`, `spend-effects/` thành capability (DA3-07), lý do không
có mã _năm đã đóng_ (DA3-20); thêm luật bỏ sót nhắc SLA bước nhu cầu (`QĐ-100j`) và số tiền 0 của Q-29. Chưa nghiệm thu.

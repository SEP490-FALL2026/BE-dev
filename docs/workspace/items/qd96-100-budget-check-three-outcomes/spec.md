# Spec: qd96-100-budget-check-three-outcomes — kiểm tra ngân sách ba kết quả lúc trình và lúc duyệt

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement tiếp quản spec/plan và evidence.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-B) theo [tracker qd96-100](../../../reviews/qd96-100-alignment-2026-11-05/README.md),
  `LEDGER.md` L-101, L-102, L-103, L-104, L-109, L-111, L-118; quyết định Owner ở `QUESTIONS.md` mục D (Q-02 B).
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-3.20`, `FR-3.21`; US 05/11/2026 — `US-06-12`, `US-06-01`, `US-06-14`; `QĐ-97c`, `QĐ-97d`,
  `QĐ-97g`, `QĐ-98a`(4), `QĐ-98m`, `QĐ-82l`(1)(5)(10)(12), `QĐ-30b`), BE `3e4553b9`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Khi trưởng phòng trình lô và khi Người duyệt chi duyệt (một mục, hàng loạt hay theo dòng), **một** hàm kiểm tra trả đúng
một trong ba kết quả _trong số cơ sở · dùng dự phòng · bị chặn_, trên giá gốc chưa thuế, sau khi trừ Request khác đang chờ duyệt
chi; phần năm sau chưa có ngân sách đã duyệt là _cam kết chuyển tiếp_ không kiểm. Không còn lối `DIRECT`, không còn rẽ sang
Finance, không còn `PLAN_LINE_OVERDUE`. Kiểm lại lúc duyệt mà thành _bị chặn_ hoặc _dùng dự phòng chưa xác nhận_ thì không lưu,
trả về trưởng phòng. Kiểm được bằng unit policy và integration trên PostgreSQL.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (giao việc Owner 05/11/2026), Story thuộc G5 — container, không phải ranh giới.
- Mode: `split-story`.
- Outcome and owner: một policy thuần + hai điểm gọi (trình lô, duyệt chi) dùng cùng hàm; capability `requests/spend` sở hữu,
  `budgets/public` cấp số liệu năm.
- Boundaries: transaction trình lô và transaction quyết định duyệt chi (đã khóa Request + năm ngân sách); bảng
  `request_budget_checks`, `request_budget_check_years`; API `spendBatchSubmit`, `spendApprovalDecide`, `spendBatchDecide`,
  `spendApprovalLineDecide`, `spendQueueList`, `budgetCheckGet`, `budgetCheckYearList` (đổi giá trị enum response).
- Not larger: xác nhận dùng dự phòng (wire `reserveConfirmations`) là hợp đồng riêng của `qd96-100-reserve-confirmation`; gỡ
  route/bảng Finance, override, giá trị cao là ba hạng mục gỡ sau.
- Not smaller: tách lúc trình khỏi lúc duyệt sẽ có giai đoạn hai điểm phán khác nhau (ITEMS #6).
- Siblings: `qd96-100-reserve-confirmation`, `qd96-100-budget-visibility-qd100p`, `qd96-100-remove-finance-review-path`,
  `qd96-100-remove-spend-override`, `qd96-100-remove-budget-revision-and-high-value`, `qd96-100-request-year-without-spend-date`,
  `qd96-100-spend-notifications`, `qd96-100-request-term-limit`, `qd96-100-seat-transfer-and-reuse` (hoãn H2).
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5) — map còn pin Docs `69e8a3d`; điều phối viên re-pin `3d73a7f`
  khi đăng ký.

## Primary Story/AC

| Story    | AC                                                                            | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                                                                                         |
| -------- | ----------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-06-12 | AC-1, AC-4, AC-5, AC-8, AC-9, AC-10, AC-14, AC-15, AC-19, AC-20, AC-23, AC-24 | partial  | AC-26: `qd96-100-budget-visibility-qd100p`; AC-25: `qd96-100-remove-finance-review-path`; AC-11: `qd96-100-request-year-without-spend-date`; AC-18: `qd96-100-request-term-limit` (đề xuất, xem dưới); AC-21, AC-22: `qd96-100-seat-transfer-and-reuse` (hoãn H2); AC-12, AC-13, AC-17: `g5-budget-check-and-finance-review` (giữ hành vi) |
| US-06-01 | AC-3, AC-9, AC-14, AC-18, AC-19, AC-21                                        | partial  | AC-1, AC-24: `qd96-100-reserve-confirmation`; AC-23: `qd96-100-remove-spend-override`; AC-25: `qd96-100-request-year-without-spend-date`; AC-7: `qd96-100-head-group-request-queue` (đề xuất, xem dưới); còn lại: `g5-spend-approval-decision`                                                                                             |
| US-06-14 | AC-8, AC-9                                                                    | partial  | AC-12, AC-13: `qd96-100-reserve-confirmation`; AC-6: `qd96-100-head-group-request-queue`; AC-5: `qd96-100-head-group-request-queue` (đề xuất); AC-18: chờ mentor (L-990); AC-17: `qd96-100-seat-transfer-and-reuse` (hoãn H2); còn lại: `g5-spend-submission-batches`                                                                      |

AC-20 ở đây là vế _phán dùng dự phòng và nằm lại hàng_; thao tác xác nhận là `US-06-16` (chủ `qd96-100-reserve-confirmation`).
Vế _được báo_ trong AC-4, AC-5, AC-8, AC-20, AC-23 do `qd96-100-spend-notifications` hiện thực (`US-12-15` AC-30); hạng mục này chỉ
ghi Audit event mà rule thông báo đọc, với `detail` theo bảng _Hợp đồng Audit_ ở mục Behavior (C-REVIEW R-13). `US-06-12` AC-18
thuộc `qd96-100-request-term-limit`; `US-06-01` AC-7, `US-06-14` AC-5 và AC-6 thuộc `qd96-100-head-group-request-queue` (đã claim —
ghi chú cũ đã xóa theo R-16d).

## Supporting references

- `QĐ-97c` (công thức và ba kết quả), `QĐ-82l(1)` (còn lại trừ Request đang chờ), `QĐ-97d` (giá gốc), `QĐ-98a(4)`/`QĐ-98m`
  (cam kết chuyển tiếp; năm sau đã duyệt thì kiểm, lấy kết quả xấu hơn), `QĐ-97g`/`QĐ-82l(12)` (kiểm lại lúc duyệt theo thứ tự).
- `QĐ-82l(10)`: chỉ một lần trình của trưởng phòng ⟹ bỏ `entryFor`/`DIRECT`. `QĐ-82l(5)` + LEDGER K-1: bỏ `PLAN_LINE_OVERDUE`,
  **giữ** `stillNeeded`.
- Spec cũ: [g5-budget-check-and-finance-review](../g5-budget-check-and-finance-review/spec.md) (_superseded_ ở phần định tuyến).

## Explicit out of scope

- Trường `reserveConfirmations`, bản ghi xác nhận, snapshot cho Người duyệt chi, rút ở stage mới → `qd96-100-reserve-confirmation`.
- Gỡ module `finance-review`, `budget-information`, `AWAITING_*`, SoD-8 người rà soát → `qd96-100-remove-finance-review-path`.
- Gỡ trường `override`, cột `override_*` → `qd96-100-remove-spend-override` (ở đây chỉ: gửi `override` ⟹ 422 cũ `OVERRIDE_NOT_NEEDED`).
- Bỏ cột `high_value_*` → `qd96-100-remove-budget-revision-and-high-value` (ở đây chỉ ngừng đọc).
- Năm tạm tính/tính lại, bỏ `expectedSpendOn` → `qd96-100-request-year-without-spend-date` (ở đây năm vẫn theo lịch trả hiện có).
- Phần tiền mới khi có seat trống (`QĐ-99d`) → hoãn H2. Thông báo → `qd96-100-spend-notifications`. Seed → `qd96-100-seed-demo-v3`.

## Dependencies and blockers

- Không chặn bởi hạng mục khác; Q-02 B đã chốt. Migration của hạng mục là migration **đầu tiên** của Track B.
- Từ lúc merge tới khi có `qd96-100-reserve-confirmation`, mục _dùng dự phòng_ nằm lại hàng đợi mà chưa có thao tác xác nhận —
  Owner nên merge hai hạng mục này cùng CP-1 (ghi ở plan).
- Đụng file của Track R: `group-request-submission/group-request.service.ts` (#19) khi gỡ `SpendEntryService`.

## Ownership: module, data, API

- `requests/spend`: `budget-check.policy.ts` (**chủ** hợp đồng bên dưới), `budget-check.service.ts`, `spend-routing.service.ts`,
  `spend-decision.policy.ts`, `spend-status.service.ts`, `spend-submission.policy.ts` (gỡ `entryFor`), `spend-entry.service.ts`
  (xóa). `spend-approval/*`, `group-line-decisions/group-spend-decision.service.ts`, `spend-submission/spend-batch.service.ts`.
- `budgets/public`: `YearBudgetFacts` thêm `baseMinor`, `reserveMinor`; thêm `carryForwardTotal(costCenterId, year, tx)` (tổng
  cam kết `HELD` chưa gắn của năm) — hạng mục khác dùng lại (#7 snapshot, #14 sàn).
- Contract chung (các hạng mục khác chỉ tham chiếu):

```ts
export type YearOutcome = 'WITHIN_BASE' | 'NEEDS_RESERVE' | 'OVER_RESERVE' | 'NO_ACTIVE_BUDGET' | 'CARRY_FORWARD';
export type BlockedReason =
  'OVER_RESERVE' | 'NO_ACTIVE_BUDGET' | 'STALE_COST_EVIDENCE' | 'CLOSED_OR_EXPIRED_BUDGET_PERIOD';
export type CheckOutcome = 'WITHIN_BASE' | 'NEEDS_RESERVE' | 'BLOCKED';
export function checkBudget(input: CheckInput): CheckResult; // years[], outcome, blockedReasons[], route
export function routeOf(
  result: CheckResult,
  reserveConfirmed: boolean,
): 'BLOCKED' | 'RESERVE_CONFIRMATION' | 'SPEND_APPROVAL';
export function judgeApproval(
  check: CheckResult,
  reserveConfirmed: boolean,
):
  | { kind: 'OK' }
  | { kind: 'RETURN_TO_HEAD'; reason: 'BLOCKED' | 'RESERVE_CONFIRMATION_REQUIRED'; blockedReasons: BlockedReason[] };
```

## Behavior and design

1. **Một năm** (thuần, `judgeYear`): `remaining = base + reserve − held − spent − pending`, `remainingBase = remaining − reserve`.
   Năm đã đóng ⟹ `code = null` + lý do `CLOSED_OR_EXPIRED_BUDGET_PERIOD` (giữ tới #16). Năm > năm hiện hành và chưa có phiên bản
   ⟹ `CARRY_FORWARD` (không phán). Năm hiện hành chưa có phiên bản ⟹ `NO_ACTIVE_BUDGET`. Còn lại: `cost ≤ remainingBase` ⟹
   `WITHIN_BASE`; `cost ≤ remaining` ⟹ `NEEDS_RESERVE` (`overBaseMinor = cost − remainingBase`); ngược lại `OVER_RESERVE`
   (`overReserveMinor = cost − remaining`). Năm sau đã có phiên bản thì phán như năm hiện hành (`QĐ-98m`).
2. **Cả Request:** `outcome` = xấu nhất (`WITHIN_BASE` < `NEEDS_RESERVE` < `BLOCKED`); báo giá hết hiệu lực ⟹ `BLOCKED`.
   `blockedReasons` theo thứ tự: dữ liệu trước (`STALE_COST_EVIDENCE`, `CLOSED_…`), rồi `NO_ACTIVE_BUDGET`, `OVER_RESERVE`.
3. **Số tiền** = phần `binding` của lịch trả theo **giá gốc**; bỏ `estimateTaxMany` khỏi `costs()` (`budget-check.service.ts:189-205`).
   Cam kết tạo lúc duyệt lấy từ năm của snapshot (`spend-effects.service.ts:74-76`), nên cũng theo giá gốc; năm `CARRY_FORWARD`
   vẫn tạo cam kết chưa gắn (`commitment.repo.ts:80-82`).
4. **Trình lô** (`spend-batch.service.ts:96-120`): `route` = `routeOf(result, false)`; `SPEND_APPROVAL` mở bước như cũ;
   `BLOCKED`/`RESERVE_CONFIRMATION` giữ `AWAITING_SPEND_SUBMISSION`, mục `STOPPED` với `stopReason` = lý do chặn đầu tiên hoặc
   `RESERVE_CONFIRMATION_REQUIRED` (cột `stop_reason` là text). Không còn `SENT_TO_FINANCE` được ghi.
5. **Duyệt** (`spend-decision.service.ts:94-129`, `group-spend-decision.service.ts`, `spend-batch-decision.service.ts`): chạy lại
   check (trigger `SPEND_DECISION`, loại chính Request khỏi `pending` như `budget-check.repo.ts:166`), `judgeApproval(check,
false)`; `RETURN_TO_HEAD` ⟹ `sendBack` (đóng bước `CLOSED`, về `AWAITING_SPEND_SUBMISSION`, Audit `SPEND_STEP_CLOSED` với
   `reason`), trả 409 `SPEND.RECHECKED_RETURNED_TO_HEAD` `details {reason, blockedReasons}`; hàng loạt trả `result.reason`
   `RECHECKED_RETURNED_TO_HEAD` hoặc mới `RECHECKED_NEEDS_RESERVE_CONFIRMATION`. Không còn nhánh `NEEDS_REVIEW`; `effects.reviewed`
   không được gọi. Body có `override` ⟹ 422 `SPEND.OVERRIDE_NOT_NEEDED` (tạm, tới #12).
6. **Stage hàng đợi** (`spend-status.service.ts:22-44`, suy từ check mới nhất): `BLOCKED` (kèm `blockedReason` mở rộng),
   `RESERVE_CONFIRMATION_REQUIRED`, `RETURNED_AT_DECISION` (check mới nhất có trigger `SPEND_DECISION`). `RETURNED_BY_FINANCE`
   giữ đọc tới #11.
7. **Lối vào:** xóa `entryFor`/`SpendEntryService`; mọi Request có chi phí vào hàng đợi trình của trưởng phòng (`QĐ-82l(10)`).
8. **Wire mã năm** (`budgetCheck*`, `spendApprovalGet`): `WITHIN_BASE | NEEDS_RESERVE | OVER_RESERVE | NO_ACTIVE_BUDGET |
CARRY_FORWARD`, kèm `overBase`, `overReserve`; dòng lịch sử `BUDGET_OK`/`HIGH_VALUE` đọc thành `WITHIN_BASE`,
   `INSUFFICIENT_BUDGET` thành `OVER_RESERVE` (một hàm ánh xạ). `PLAN_LINE_OVERDUE` bỏ khỏi wire; cột `plan_line_overdue` ghi `false`.
9. **Khóa và đồng thời:** giữ `lockBudgetYears` theo thứ tự năm tăng dần trước khi đọc số (`budget-check.service.ts:61`); duyệt
   hàng loạt kiểm lần lượt trong cùng transaction nên mục sau thấy cam kết của mục trước (`QĐ-82l(12)`).
10. **Migration — hai file** (C-REVIEW R-01; timestamp đặt lúc merge, lớn hơn migration cuối đã có; số toàn cục M02, M03):
    - **M02** `<ts>_requests_budget_check_values`: chỉ `ALTER TYPE "BudgetYearCode" ADD VALUE` `WITHIN_BASE`, `NEEDS_RESERVE`,
      `OVER_RESERVE`, `CARRY_FORWARD`; `ALTER TYPE "BudgetCheckRoute" ADD VALUE 'RESERVE_CONFIRMATION'` (giá trị mới không dùng
      được trong CHECK cùng migration — tiền lệ `20261023230000_requests_spend_decision_values`).
    - **M03** `<ts+1>_requests_budget_check_three_outcomes`: `request_budget_check_years` thêm `base_minor`, `reserve_minor`
      `BIGINT NULL`; `DROP/ADD request_budget_check_years_shape_check` (định nghĩa gốc `20261023210100_requests_budget_checks/
migration.sql:96-100`): `CARRY_FORWARD` cùng hình với `NO_ACTIVE_BUDGET` (không số ngân sách); `WITHIN_BASE`, `NEEDS_RESERVE`,
      `OVER_RESERVE` cùng hình với `BUDGET_OK` **và** `base_minor`, `reserve_minor` NOT NULL; mã cũ giữ nhánh cũ để đọc lịch sử.
      Thay `request_budget_checks_blocked_check` (`:74-76`) bằng ràng buộc một chiều
      `NOT ("stale_cost_evidence" OR "period_closed") OR "route" = 'BLOCKED'` (route `BLOCKED` nay có thể vì `OVER_RESERVE`/
      `NO_ACTIVE_BUDGET`). `request_budget_checks_overdue_check` giữ (cột `plan_line_overdue` luôn `false` — cột chết, R-28, để
      lượt dọn sau).
      Giá trị cũ `BUDGET_OK`, `HIGH_VALUE`, `INSUFFICIENT_BUDGET`, route `FINANCE_REVIEW` để lại, có test chặn ghi mới. **DB-05:**
      `ADD VALUE` không hoàn tác — ngoại lệ ghi ở đây theo Q-02 B.
11. **Hợp đồng Audit** (chủ: hạng mục này; `qd96-100-reserve-confirmation`, `qd96-100-spend-notifications` chỉ đọc — R-13):

    | Event                                                 | `detail`                                                                                                                                                                                                                                                                               |
    | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `ACCESS_REQUEST.BUDGET_CHECKED`                       | `checkId`, `trigger` (`SUBMISSION`/`SPEND_DECISION`), `outcome` (`WITHIN_BASE`/`NEEDS_RESERVE`/`BLOCKED`), `blockedReasons[]`, `years[{year, code, overBase, overReserve}]` (chuỗi thập phân hoặc `null`), `currency`, `reserveConfirmed: boolean` (ghi bởi #7; trước #7 luôn `false`) |
    | `ACCESS_REQUEST.SPEND_STEP_CLOSED` (trả về lúc duyệt) | `stepId`, `reason` (`BLOCKED`/`RESERVE_CONFIRMATION_REQUIRED`), `blockedReasons[]`, `overBase`, `overReserve` (tổng các năm, chuỗi hoặc `null`), `currency`, `checkId`                                                                                                                 |

### Phần A — FE nối tối nay (chỉnh 05/11 theo review main flow F06, F08 vế lối vào, F09 vế `DIRECT`)

**Mức FE-tonight: A — toàn bộ mục 1→11 ở trên.** Không tách B: hàm phán, hai điểm gọi và wire là một hợp đồng; FE màn hàng đợi
trình, kết quả trình lô, duyệt chi đều đọc nó. Contract FE code theo (prefix `/api/v1`; ngoài bảng này giữ nguyên):

| Operation (vai)                                                                                                                                       | Hiện tại (BE `808318a4`)                                                                                                                                                                 | Sau sửa                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `budgetCheckGet` `GET /access-requests/{id}/budget-check` (Finance, người giữ bước chi, trưởng phòng phòng Request, người yêu cầu — phạm vi đọc ở #8) | `check.route` `BLOCKED/FINANCE_REVIEW/SPEND_APPROVAL`, `primaryCode`, `planLineOverdue`, `noIndependentReview`                                                                           | thêm `outcome` `WITHIN_BASE \| NEEDS_RESERVE \| BLOCKED`, `blockedReasons[]` (`STALE_COST_EVIDENCE`, `CLOSED_OR_EXPIRED_BUDGET_PERIOD`, `NO_ACTIVE_BUDGET`, `OVER_RESERVE`), `reserveConfirmed`; **bỏ** `route`, `primaryCode`, `planLineOverdue`, `noIndependentReview`; `trigger` chỉ ghi mới `SUBMISSION`/`SPEND_DECISION`                                                                               |
| `budgetCheckYearList` `GET …/budget-check/years`                                                                                                      | năm: `code` `BUDGET_OK/HIGH_VALUE/INSUFFICIENT_BUDGET/NO_ACTIVE_BUDGET`, `budget`, `held`, `spent`, `remaining` (chưa trừ chờ), `pending` (chỉ để xem), `shareBasisPoints`, `overridden` | `code` `WITHIN_BASE \| NEEDS_RESERVE \| OVER_RESERVE \| NO_ACTIVE_BUDGET \| CARRY_FORWARD \| null` (năm đã đóng); `cost` (giá gốc chưa thuế), `base`, `reserve`, `held`, `spent`, `pending`, `remainingBase`, `remaining` (= base+reserve−held−spent−pending), `overBase`, `overReserve` (`money \| null`); **bỏ** `budget`, `shareBasisPoints`, `overridden`                                               |
| `spendQueueList` `GET /spend-queue` (trưởng phòng)                                                                                                    | `stage` `NOT_SUBMITTED/BLOCKED/RETURNED_BY_FINANCE`; `blockedReason` 2 giá trị dữ liệu                                                                                                   | `stage` `NOT_SUBMITTED \| BLOCKED \| RESERVE_CONFIRMATION_REQUIRED \| RETURNED_AT_DECISION`; `blockedReason` 4 giá trị như `blockedReasons`; `overBase`, `overReserve` (#7); `expectedSpendOn`, `financeReturnReason` bỏ (#16, #11)                                                                                                                                                                         |
| `spendBatchSubmit` `POST /spend-batches` (trưởng phòng)                                                                                               | body `{requestIds}`; item `outcome` `SENT_TO_APPROVER/SENT_TO_FINANCE/STOPPED`                                                                                                           | body `{requestIds, reserveConfirmations?}` (#7); item `outcome` `SENT_TO_APPROVER \| STOPPED`; `stopReason` thêm `NO_ACTIVE_BUDGET`, `OVER_RESERVE`, `RESERVE_CONFIRMATION_REQUIRED`; `leftReason` thêm `RETURNED_AT_DECISION`, bỏ `RETURNED_BY_FINANCE`, `CONFLICT_OF_INTEREST`                                                                                                                            |
| `spendApprovalDecide` `POST …/{id}/spend-approval`, `spendApprovalLineDecide`, `spendBatchDecide` (Người duyệt chi)                                   | kiểm lại có thể ra `NEEDS_REVIEW` → Finance; `override`                                                                                                                                  | kiểm lại ⟹ lưu, hoặc **409 `SPEND.RECHECKED_RETURNED_TO_HEAD`** `details {reason: 'BLOCKED' \| 'RESERVE_CONFIRMATION_REQUIRED', blockedReasons}`; hàng loạt: `result.reason` `RECHECKED_RETURNED_TO_HEAD` (bị chặn) \| `RECHECKED_NEEDS_RESERVE_CONFIRMATION`; bỏ `REVIEWER_IS_APPROVER`, `OVERRIDE_REQUIRED`, `RECHECKED_NEEDS_FINANCE_REVIEW`; `override` ⟹ 422 (`qd96-100-remove-spend-override` phần A) |
| `accessRequestGet`, `meAccessRequestList` (người yêu cầu; `my-requests.dto.ts:47` dùng lại enum của `access-request.dto.ts:256-265`)                  | `spend.stage` có `RETURNED_BY_FINANCE`, `WAITING_FINANCE_REVIEW`, `WAITING_BUDGET`; `blockedReason` 2 mã dữ liệu                                                                         | `stage` thêm `RESERVE_CONFIRMATION_REQUIRED`, `RETURNED_AT_DECISION` (3 giá trị Finance chỉ còn đọc tới #11); `blockedReason` 4 mã như `blockedReasons`; thêm `spend.overReserve: money \| null` (số vượt khi `OVER_RESERVE` — `QĐ-97c` báo người yêu cầu "vượt bao nhiêu"; không số ngân sách nào khác) — delta D1                                                                                         |
| `spendApprovalList`, `spendApprovalGet` (Người duyệt chi)                                                                                             | `primaryCode` 7 mã gồm `HIGH_VALUE`, `INSUFFICIENT_BUDGET`, `PLAN_LINE_OVERDUE` (`spend-approval.dto.ts:93-101,122`)                                                                     | thay bằng `outcome: 'WITHIN_BASE' \| 'NEEDS_RESERVE'` của check mới nhất (Request bị chặn không tới bước này); thay luôn cờ `usesReserve` dự kiến ở #7 — delta D2                                                                                                                                                                                                                                           |

Người dùng nhập: chỉ `requestIds`, `reserveConfirmations`, `decision`, `reason`. BE tự tính mọi số ở bảng trên — FE không gửi
`amount`, `budgetYear`, `pending`, `stage`. Logic tối thiểu **thật**: `remaining` trừ Request khác có bước chi mở
(`budget-check.repo.ts:157-174` `pendingFor`, đã loại chính Request), giá gốc (bỏ thuế), ba kết quả, lối `DIRECT` gỡ, kiểm lại
lúc duyệt trả về trưởng phòng. Phụ thuộc trong phần A: `request-year-without-spend-date` phần A (neo giá lúc trình/duyệt) chạy
trước điểm gọi `checkBudget`; `reserve-confirmation` phần A cung cấp `reserveConfirmed`.

## Test matrix

| AC / rủi ro                  | Tình huống                                                                      | Cấp test           | Kết quả mong đợi                                                                                            | Bằng chứng sau implement |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------ |
| `US-06-12` AC-1              | 100/10, chi 40, giữ 20, chờ 15; trình 20tr                                      | unit + integration | `WITHIN_BASE`, mở bước chi                                                                                  | planned                  |
| AC-20 (vế phán)              | trình 30tr                                                                      | unit               | `NEEDS_RESERVE`, `overBase` 5tr, `STOPPED` `RESERVE_CONFIRMATION_REQUIRED`                                  | planned                  |
| AC-4                         | trình 45tr                                                                      | unit + integration | `BLOCKED` `OVER_RESERVE`, `overReserve` 10tr, không bước, không Finance                                     | planned                  |
| AC-5, AC-19, `US-06-01` AC-3 | CC chưa có phiên bản năm hiện hành                                              | integration        | `BLOCKED` `NO_ACTIVE_BUDGET`, không cam kết                                                                 | planned                  |
| AC-8, AC-9                   | báo giá hết hạn + vượt dự phòng                                                 | unit               | hai lý do, dữ liệu trước                                                                                    | planned                  |
| AC-10                        | ~~`offPlan` đủ số~~ — bỏ theo `QĐ-101n` (không viết ca này)                     | unit               | `WITHIN_BASE`, cờ thông tin                                                                                 | planned                  |
| `QĐ-82l(1)`                  | Request khác có bước chi mở                                                     | integration        | `pending` bị trừ; Request đang duyệt không tự trừ                                                           | planned                  |
| `QĐ-97d`                     | nhà cung cấp có hồ sơ thuế                                                      | integration        | số kiểm và cam kết = giá gốc                                                                                | planned                  |
| AC-15                        | qua năm, năm sau chưa duyệt                                                     | unit + integration | năm sau `CARRY_FORWARD`, cam kết chưa gắn                                                                   | planned                  |
| AC-24                        | năm sau đã duyệt, thiếu 800 USD                                                 | unit               | `BLOCKED`, nêu năm 2027                                                                                     | planned                  |
| AC-23, `US-06-01` AC-18      | kiểm lại thành `NEEDS_RESERVE` / `BLOCKED`                                      | integration        | không lưu, bước `CLOSED`, 409 `RECHECKED_RETURNED_TO_HEAD`                                                  | planned                  |
| `US-06-01` AC-19             | hàng loạt hai mục cùng CC                                                       | integration        | mục sau thấy cam kết mục trước                                                                              | planned                  |
| `US-06-14` AC-8              | nhu cầu do Người duyệt chi quyết                                                | integration        | vào hàng đợi, không tạo thẳng bước chi                                                                      | planned                  |
| AC-14                        | mọi kết quả                                                                     | integration        | không có quyết định tự động, không bước Finance                                                             | planned                  |
| Q-02 B                       | sau check mới                                                                   | integration        | không ghi `BUDGET_OK`/`HIGH_VALUE`/`INSUFFICIENT_BUDGET`/`FINANCE_REVIEW`                                   | planned                  |
| Hồi quy                      | `override` trong body                                                           | http               | 422 (`VALIDATION_ERROR` nếu `remove-spend-override` phần A đã merge, ngược lại `SPEND.OVERRIDE_NOT_NEEDED`) | planned                  |
| R-01 (DB)                    | ghi năm với cả 5 mã mới; check `BLOCKED` vì `OVER_RESERVE` (không stale/closed) | integration        | CHECK nhận; check stale nhưng route khác `BLOCKED` vẫn bị từ chối                                           | planned                  |
| R-13                         | `BUDGET_CHECKED`, `SPEND_STEP_CLOSED` sau trình/kiểm lại                        | integration        | `detail` đúng bảng mục 11                                                                                   | planned                  |
| F06 pending                  | R-A (40tr) có bước chi mở; R-B trình 30tr, base còn 50tr, dự phòng 10tr         | integration        | R-B `NEEDS_RESERVE` `overBase` 20tr (pending trừ); duyệt R-B không trừ chính nó                             | planned                  |
| D1, D2                       | người yêu cầu `GET` Request bị chặn `OVER_RESERVE`; Người duyệt chi list        | http               | `stage BLOCKED`, `blockedReason OVER_RESERVE`, `overReserve` đúng; list có `outcome`, không `primaryCode`   | planned                  |

## Definition of Done

- [ ] Mọi AC đã claim có test đỏ-trước/xanh-sau; vế thông báo ghi chuyển `qd96-100-spend-notifications`.
- [ ] Quick gates (typecheck, lint, arch, rules, gates, `openapi:export`) xanh + test theo file; full suite do Owner ở audit.
- [ ] Spec/plan phản ánh implementation; đổi enum response đã báo FE (L-981).
- [ ] Không tăng legacy ledger kiến trúc.

## Changes and acceptance

05/11/2026: bản đầu (`draft`). Chưa nghiệm thu.
05/11/2026 (chỉnh 05/11 theo review main flow: F06, F09 vế `DIRECT`): mức FE-tonight **A**; đổi tên mã `USES_RESERVE` →
`NEEDS_RESERVE` (khớp review Docs/V2-SPEND-API, áp cho mọi spec liên quan); thêm bảng contract FE; sửa C-REVIEW R-01 (tách M02/M03,
viết lại 2 CHECK), R-13 (hợp đồng Audit), R-16d (xóa ghi chú cũ), R-28 (ghi cột chết). Vẫn `draft`.
05/11/2026 (chỉnh 05/11 theo review main flow — vòng FIELDS): Owner 05/11 chốt tên mã **`NEEDS_RESERVE`** ở mọi nơi (không `USES_RESERVE`) và
xếp hạng mục vào **Đợt 2** (logic tiền) — FE code theo bảng Phần A, chưa chạy thật ở Đợt 1. Áp delta FIELDS-MF1-MF4 D1 (enum
`spend.stage`/`blockedReason` + `overReserve` của `accessRequestGet`/`meAccessRequestList`) và D2 (`primaryCode` → `outcome` ở
`spendApprovalList/Get`). Vẫn `draft`.
05/11/2026 (`QĐ-101m`): input dòng kế hoạch (`spend.planLine`, `spend.offPlan`, `stillNeeded`, `PUT …/plan-line`, `GET …/plan-line-suggestions`) bị gỡ ở [`qd96-100-plan-line-removal-and-bm10-lines`](../qd96-100-plan-line-removal-and-bm10-lines/spec.md) (Đợt 1); `offPlan`/`planLine` là output BE tự khớp, chỉ thông tin. Từ Đợt 1 `planLineOverdue` luôn `false`; hạng mục này vẫn gỡ field/mã khỏi wire ở Đợt 2. Không viết lại phần khác.
05/11/2026 (`QĐ-101n`, thay `QĐ-101m`): Request không bao giờ gắn dòng kế hoạch (không tự khớp, không output `planLine`/`offPlan`) và dòng BM-10/phiên bản bỏ khoảng mua, kỳ dịch vụ, chu kỳ lặp, ngày hiệu lực báo giá — gỡ ở [`qd96-100-plan-line-removal-and-bm10-lines`](../qd96-100-plan-line-removal-and-bm10-lines/spec.md) (Đợt 1); `qd96-100-plan-line-auto-match` đã xóa. Từ Đợt 1 hạng mục đó gỡ `planLineOverdue`, mã `PLAN_LINE_OVERDUE`, `offPlan` khỏi wire và ghi `plan_line_overdue=false`; ở đây không còn phần wire này. Không viết lại phần khác.

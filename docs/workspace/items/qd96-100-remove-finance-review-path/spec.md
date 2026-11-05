# Spec: qd96-100-remove-finance-review-path — Finance không còn nằm trên đường Request

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement tiếp quản spec/plan và evidence.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-B) theo [tracker qd96-100](../../../reviews/qd96-100-alignment-2026-11-05/README.md),
  `LEDGER.md` L-121, L-122, L-123, L-127; quyết định Owner Q-02 B (`QUESTIONS.md` mục D).
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-3.8`, `FR-3.20`; US 05/11/2026 — `US-06-12` AC-25; `US-06-13`, `US-06-02`, `US-06-03`
  `RETIRED`; `QĐ-97c`, `QĐ-29b`, `QĐ-22`, `QĐ-57a`), BE `3e4553b9`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Không còn thao tác, trạng thái, bước, SLA, thông báo hay bảng nào của *Finance rà soát*, *hỏi Finance* và *chờ ngân sách*:
7 endpoint bị gỡ, Request đang treo được một migration tiến đưa về hàng đợi trình với stage *cần kiểm lại*, bước Finance đang
mở được đóng và ghi Audit. Kiểm được bằng grep sạch, gate OpenAPI, integration migration và HTTP 404 cho route cũ.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (giao việc Owner 05/11/2026), Story thuộc G5.
- Mode: `split-story`.
- Outcome and owner: gỡ có kiểm tra một khái niệm đã bỏ (`QĐ-97c`); capability `requests` (finance-review, budget-information,
  budget-questions, spend, sla, status), `budgets/public` (extension point), `notifications`.
- Boundaries: migration dữ liệu treo + drop bảng; 7 operation HTTP; listener `BudgetChangeListeners`; SLA kind; 6 mã thông báo.
- Not larger: override và giá trị cao/phiên bản sửa đổi là hai hạng mục gỡ tiếp theo (bảng và màn hình khác).
- Not smaller: tách theo bảng để lại route mồ côi (ITEMS #11).
- Siblings: `qd96-100-budget-check-three-outcomes`, `qd96-100-reserve-confirmation`, `qd96-100-remove-spend-override`,
  `qd96-100-sla-reminder-recipients` (cùng sửa `step-sla.policy.ts`).
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC | Coverage | Phần còn lại thuộc |
| -------- | -- | -------- | ------------------ |
| US-06-12 | AC-25 | partial | xem bảng của `qd96-100-budget-check-three-outcomes`; vế override: `qd96-100-remove-spend-override`; vế ngưỡng giá trị cao: `qd96-100-remove-budget-revision-and-high-value` |

AC-25 nói ba khái niệm; hạng mục này là **chủ** AC và chạy kiểm tra cuối (không còn operation nào của ba khái niệm) sau khi hai
hạng mục gỡ kia merge — test AC-25 đặt ở hạng mục này, mở rộng lúc #12, #13 xong.

## Supporting references

- `US-06-13`, `US-06-02`, `US-06-03`, `US-06-05` `RETIRED` (Docs `3d73a7f`). `FR-3.8`: không có loại bước Finance rà soát.
- `QĐ-29b`: Người duyệt chi không còn bước hỏi Finance; `SoD-8` chỉ còn cho phiên bản ngân sách.
- Q-02 B: migration tiến, giữ giá trị enum, test chặn ghi mới, ngoại lệ DB-05 ghi ở spec.

## Explicit out of scope

- Đọc kết quả kiểm tra (`budgetCheckGet/YearList`) — **giữ**, đã dời ở `qd96-100-budget-visibility-qd100p`.
- Cột `spend_decisions.override_*`, `bySubstitute` → `qd96-100-remove-spend-override`.
- Sự kiện `PLAN_LINE_MOVED` (dời khoảng mua) → `qd96-100-remove-budget-revision-and-high-value`.
- Vai SLA `SUPERIOR`, `REQUESTER` → `qd96-100-sla-reminder-recipients` (Track R).
- Dữ liệu demo → `qd96-100-seed-demo-v3`. Theo Q-R1 (QUESTIONS mục D) fixture được **đổi tên v2 → v3**; vì hạng mục này nay là
  phần B, việc đổi tên dời lên `qd96-100-seed-demo-v3` phần A (Task 0) và R9 mới (*bị chặn*) đã có ở đó. Ở đây chỉ còn kiểm seed
  không còn đích `AWAITING_FINANCE_REVIEW` (`src/cli/seed/steps/scenario-path.ts:10,16`, `fixture/demo-fixture.types.ts:87`).
- FE xóa màn hình Finance rà soát (L-981, ngoài BE).

## Dependencies and blockers

- Cần #6 (không còn route `FINANCE_REVIEW`), #7 (stage mới, rút), #8 (đọc check đã rời `finance-review/`).
- Đụng `requests/sla/step-sla.policy.ts` cùng `qd96-100-sla-reminder-recipients`: hạng mục merge sau rebase, không sửa đè.
- Migration thứ ba của Track B.

## Ownership: module, data, API

- Xóa: `requests/finance-review/**` (sau khi #8 dời đọc check), `requests/budget-information/**` trừ `spend-effects.service.ts`
  (chuyển trước sang `requests/spend/`), `requests/budget-questions/**`, `requests/spend/finance-review.repo.ts`,
  `requests/step-routing` hàm `routeFinanceReview`.
- Sửa: `spend-routing.service.ts:127-240` (`openReview`, `reopenReview`, `openSpendAfterReview`, `routeAfterOpinionWhileWaiting`),
  `spend-status.service.ts` (stage `WAITING_FINANCE_REVIEW`, `WAITING_BUDGET`, `RETURNED_BY_FINANCE`), `spend-effects`
  (`refuseReviewer`, `reviewed`, `information.closeOpen`), `withdrawal.policy.ts:20`, `my-requests.policy.ts:20,92,116`,
  `grant.policy.ts:75`, `group-resolution.service.ts:20`, `spend-request.repo.ts:20`, `controlled-wait.dto.ts:20`,
  `sla/step-sla.policy.ts:17,21,153,183-186,235` + `congestion.dto`, `status/rules/status-rules-finance.policy.ts` (xóa),
  `status-rules-withdrawal.policy.ts:66-86` (L-127), `budgets/public/budgets.extension-points.ts` (bỏ `LOCK_WAITING`,
  `VERSION_APPROVED/REFUSED/EXPIRED`), `budgets/version/version-decision-judge.service.ts:60-63`, `year-end.service.ts:85`,
  `notifications/public/notifications.types.ts`, `notifications/inbox/inbox.policy.ts`.
- 7 operation gỡ: `financeReviewList`, `financeReviewGet`, `financeReviewComplete`, `budgetInformationAsk`,
  `budgetInformationRequestList`, `budgetInformationList`, `budgetInformationAnswer` (path ở `docs/generated/routes.md:187-189,205-208`).
- Response bỏ: `spendApprovalGet.latestBudgetInformation`, `noIndependentReview` (bước và tóm tắt), `batchItem.outcome`
  `SENT_TO_FINANCE`, `leftReason` `RETURNED_BY_FINANCE`, stage `WAITING_FINANCE_REVIEW/WAITING_BUDGET/RETURNED_BY_FINANCE`,
  `financeReturnReason`, `result.reason` `REVIEWER_IS_APPROVER`/`RECHECKED_NEEDS_FINANCE_REVIEW`, `requestState`
  `AWAITING_FINANCE_REVIEW/AWAITING_BUDGET`, `waitingReason` `NO_FINANCE_REVIEWER`, `stepKind` `FINANCE_REVIEW`.

## Behavior and design

1. **Migration** `<ts>_requests_retire_finance_path` (timestamp lúc implement, sau migration #7), một transaction:
   (a) bước `FINANCE_REVIEW` `PENDING`/`WAITING` → `CLOSED` (cùng cột kết thúc như `SpendStepRepo.end`);
   (b) Request `AWAITING_FINANCE_REVIEW`, `AWAITING_BUDGET`, hoặc `WAITING_CONTROLLED` chỉ vì bước Finance → `AWAITING_SPEND_SUBMISSION`;
   (c) một `audit_events` `SYSTEM` `ACCESS_REQUEST.FINANCE_PATH_RETIRED` mỗi Request (before/after state, id bước đã đóng) theo
   mẫu `20261029100600_budget_lifecycle_structure/migration.sql:106`;
   (d) `DROP TABLE request_finance_reviews, budget_information_requests` cùng enum chỉ chúng dùng (`FinanceReviewOutcome`,
   `FinanceDirection`, `BudgetInformationState/Answer/CloseReason`) — DROP không kích trigger INV-05.
   Giá trị `AWAITING_FINANCE_REVIEW`, `AWAITING_BUDGET`, `FINANCE_REVIEW` (step kind, route), `FINANCE_QUESTION`,
   `RETURNED_BY_FINANCE`, `SENT_TO_FINANCE`, trigger `BUDGET_VERSION_APPROVED`/`FINANCE_OUTCOME_WHILE_WAITING` **để lại**,
   test chặn ghi mới. **DB-05:** drop bảng có dữ liệu là không hoàn tác — ngoại lệ theo Q-02 B; khôi phục bằng backup trước deploy.
2. **Stage *cần kiểm lại*:** Request ở hàng đợi có check mới nhất route cũ `FINANCE_REVIEW` ⟹ stage `RECHECK_REQUIRED`
   (wire mới), `readyToSubmit` theo luật hiện có; trưởng phòng trình lại thì #6 kiểm lại toàn bộ. Rút được ở stage này.
3. **Thông báo:** gỡ phát `REQUEST_FINANCE_REVIEW_OPENED`, `REQUEST_RETURNED_BY_FINANCE`, `REQUEST_AWAITING_BUDGET`,
   `REQUEST_BUDGET_VERSION_ENDED`, `FINANCE_QUESTION_REMINDER`, `COMMITMENT_RELEASED_BY_WITHDRAWAL` (L-127, ngoài danh mục). Mã
   chuyển vào danh sách *chỉ đọc* để thông báo cũ trong hộp vẫn hiển thị; test chặn phát mới.
4. **SLA:** bỏ `FINANCE_REVIEW` khỏi `SLA_STEP_KINDS` và `congestion.dto`; bỏ nhánh vai `FINANCE_QUESTION`.
5. **SoD-8 người rà soát:** gỡ `refuseReviewer` (không còn người rà soát); `SoD-8` cho phiên bản ngân sách giữ nguyên.
6. Route cũ trả 404 chuẩn của Nest (không giữ stub). Không áp dụng: job mới, khóa mới.

### Mức FE-tonight (chỉnh 05/11 theo review main flow F06/F08 vế Finance)

**B.** Từ khi `qd96-100-budget-check-three-outcomes` phần A merge, không Request nào còn được định tuyến tới Finance, nên 7 route
bị gỡ ở đây đã là đường chết; contract FE cuối = **các route đó không tồn tại**. FE tối nay **không** nối `financeReviewList/Get/
Complete`, `budgetInformation*`, và không xử lý stage `RETURNED_BY_FINANCE`, `RECHECK_REQUIRED` (DB demo drop và seed lại — Q-R1 —
nên không có Request treo; `RECHECK_REQUIRED` chỉ để migration dữ liệu thật). Không phải BLOCKER cho bước MF-1 nào.

## Test matrix

| AC / rủi ro | Tình huống | Cấp test | Kết quả mong đợi | Bằng chứng sau implement |
| --- | --- | --- | --- | --- |
| `US-06-12` AC-25 | Finance/Người duyệt chi gọi 7 route cũ | http | 404; OpenAPI không còn `operationId` | planned |
| AC-25 | quét OpenAPI sau #12, #13 | gates | không `override`, `highValue*`, `revision`, `finance-review`, `budget-information` | planned |
| Q-02 B | DB có R ở `AWAITING_FINANCE_REVIEW` + bước mở, R' ở `AWAITING_BUDGET` | integration (migration) | cả hai `AWAITING_SPEND_SUBMISSION`, bước `CLOSED`, 2 Audit, bảng drop | planned |
| Stage | R sau migration | http | `stage = RECHECK_REQUIRED`; trình lại ⟹ check mới | planned |
| Ghi mới | mọi đường ghi state/route/kind | integration | không ghi giá trị cũ | planned |
| L-127 | rút Request có cam kết | integration | không thông báo Finance/IT | planned |
| SLA | quét SLA | unit | không có kind `FINANCE_REVIEW`, vai `FINANCE_QUESTION` | planned |
| Hộp thư | thông báo cũ mã đã gỡ | http | vẫn đọc được | planned |

## Definition of Done

- [ ] Grep `src/` sạch `finance-review`, `budgetInformation`, `AWAITING_BUDGET`, `RETURNED_BY_FINANCE` (trừ enum Prisma để lại + test chặn).
- [ ] Quick gates + test theo file xanh; migration chạy trên CSDL có dữ liệu treo (integration).
- [ ] OpenAPI, `docs/generated/routes.md` sinh lại; FE được báo 7 route bị gỡ (CP-2).
- [ ] Không tăng legacy ledger; spec/plan phản ánh implementation.

## Changes and acceptance

05/11/2026: bản đầu (`draft`). Chưa nghiệm thu.
05/11/2026 (chỉnh 05/11 theo review main flow): mức FE-tonight **B** (route chết sau `budget-check-three-outcomes` phần A); đổi
tên fixture v2 → v3 dời sang `qd96-100-seed-demo-v3` phần A. Vẫn `draft`.

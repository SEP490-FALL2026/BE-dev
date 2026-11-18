# REVIEW-R1 — tài liệu API FE (MF-1 · MF-4/SBF-11 · SBF-19/11a/08/07a + chính sách)

Reviewer R1 độc lập, 16/11/2026. Code đối chiếu: `D:\FPT\FALL2026\Code\be-verify` (detached `1f7ffa19`, chỉ đọc).
Tài liệu: `D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\`.

Skill đã đọc/dùng:
- `agent-skills:code-review-and-quality`: quy trình review (process skill).
- `superpowers:verification-before-completion`: kiểm trước khi kết luận.

Không có domain skill riêng cho tài liệu API nên dùng hai skill trên. Phần MF-4 và phần mua/đối soát/chính sách do hai fork
của reviewer làm song song với cùng brief; reviewer không kiểm lại từng dòng của hai fork. Kết quả của hai fork ghi ở mục B và C.

Số dòng trong bảng là số dòng của file **trước khi sửa**. Mọi sửa nằm trong `tools/annotations/<file>` và `flows/<file>` của phạm vi.
Không sửa `reference/`, `roles/`, README, conventions, `changes/`, `demo/`, `shared-stock-grant.md` hay glossary.

## A. MF-1 (access-requests, requests-new-software…, group-requests, spend-and-finance-review, request-operations; 4 flow)

| # | file:dòng | Sai gì | Đúng theo code | Sửa |
|---|---|---|---|---|
| A1 | `tools/annotations/access-requests.md:65` | Nói "đóng vì nghỉ việc/điều chuyển ⟹ `REQUEST_CANCELLED`" cho mọi lần đóng. Không nêu luật "người gây ra sự kiện không nhận thông báo". Không nói Request một bước không có `REQUEST_SUBMITTED`. Thiếu `REQUEST_IT_REJECTED`. | IT Admin đóng ⟹ `REQUEST_CANCELLED`. Hệ thống tự đóng ⟹ `REQUEST_CANCELLED_BENEFICIARY_GONE` (`status/rules/status-rule.policy.ts` `goneNotice`). Người gây ra sự kiện bị loại (`request-status-rules.policy.ts` `plan()`, `includeActor`). `NEED_STEP_ROUTED` với outcome `NOT_REQUIRED` không có mục trong `STAGE_BY_OUTCOME` (`status-rules-progress.policy.ts:12-16,30-31`). | Đã sửa |
| A2 | `access-requests.md:117` (`accessRequestDraftSubmit`) | Thứ tự cổng ghi là "Cost Center trước, rồi Thời gian dùng, GH-1, GH-2". | Thứ tự thật: người gửi hợp lệ → `NO_DEPARTMENT` → gói/ứng dụng → Cost Center → đã giữ ghế → `TERM_*` → `OPEN_REQUEST_EXISTS`/GH-2 (`request-intake/access-request.service.ts:83-112`, `access-request/request-facts.service.ts:assess`). | Đã sửa |
| A3 | `access-requests.md:142` (`accessRequestSubmit`) | Ngụ ý Request một bước cũng có `REQUEST_SUBMITTED`. | Request một bước không có `REQUEST_SUBMITTED`. Nếu có tiền: `STEP_ASSIGNED` cho Người duyệt chi hoặc `REQUEST_BUDGET_BLOCKED`. Nếu nội bộ: không có thông báo nào (`status-rules-budget-check.policy.ts:17-27`; `NO_NEED_APPROVER` không có luật thông báo). | Đã sửa |
| A4 | `access-requests.md:195` (`accessRequestNeedDecide`) | Ghi 409 `STEP_NOT_PENDING` cho trường hợp "đang chờ người giữ". | Bước đang chờ không có người giữ (`assignee = null`) ⟹ 403 `NOT_THE_ASSIGNEE`. Đã thêm thứ tự kiểm 404 → `GROUP_USES_LINES` → `OWN_REQUEST` → `NOT_THE_ASSIGNEE` → `STEP_NOT_PENDING` (`access-request/need-decision.policy.ts:27-38`, `need-decision/need-decision.service.ts:85-101`). | Đã sửa |
| A5 | `access-requests.md:240` (`accessRequestCancelForDeparture`) | Ghi `REQUEST_CANCELLED` gửi cho "người gửi/thụ hưởng (trừ người đóng) **và Finance**". | IT Admin đóng ghi `reasonKind = BENEFICIARY_LEFT/TRANSFERRED`, nên `goneNotice` trả null và Finance không nhận (`status-rules-outcome.policy.ts:181-193`). Thêm hai điểm còn thiếu: Request nhóm chỉ còn một người thì đóng dòng đó; đóng vì điều chuyển chỉ cho `type = GRANT` (`cancellation/departure-cancellation.service.ts:67-69`, `cancellation.policy.ts:checkTransferCancellation`). | Đã sửa |
| A6 | `access-requests.md:337` (`departmentAccessRequestList`) | 403 `AUTHORIZATION.FORBIDDEN` cho "không phải trưởng phòng hôm nay". | `AUTHORIZATION.FORBIDDEN` chỉ khi không có vai `MANAGER`. Có vai nhưng không làm trưởng phòng `{id}` hôm nay ⟹ 403 `ACCESS_REQUEST_HISTORY.OUT_OF_SCOPE` (`request-history/request-history.service.ts:47-51`). | Đã sửa |
| A7 | `requests-new-software-and-service-accounts.md:17` | Thông báo không nêu hai trường hợp im lặng. | Trưởng phòng tự gửi đề xuất: không có `REQUEST_SUBMITTED`, IT Admin không nhận `STEP_ASSIGNED` (`ASSESSMENT_REQUESTED` không có luật). Người gửi gửi lại sau _Trả về_ của IT: `RESUBMITTED` không có luật nên không báo ai. | Đã sửa |
| A8 | `requests-new-software….md:72` (`accessRequestAssessmentComplete`) | Ghi thứ tự "điều kiện hoàn tất ⟹ checklist ⟹ ghi". | Checklist được chấm trước `TERM_NOT_FIT_KIND` và trước lỗi báo giá `QUOTE_NOT_IN_FORCE`/`AMOUNT_TOO_LARGE` (`assessment/assessment-completion.service.ts:52-68`). | Đã sửa |
| A9 | `requests-new-software….md:122` (`accessRequestInternalRegister`) | Ghi "có `spend.quote` ⟹ chờ trưởng phòng trình lô" cho mọi trường hợp. | Request một bước được kiểm ngân sách ngay (`assessment/internal-registration.service.ts:95-108`). | Đã sửa |
| A10 | `spend-and-finance-review.md:5`, `:25` | Ghi kiểm ngân sách chạy cả "khi phiên bản ngân sách được duyệt" và `trigger = BUDGET_VERSION_APPROVED` là trigger hiện hành. | `CheckTrigger` chỉ gồm `SUBMISSION`, `SPEND_DECISION`, `RESERVE_CONFIRMATION`. `BUDGET_VERSION_APPROVED` chỉ còn ở dữ liệu cũ (`spend/budget-check.repo.ts:12-16`, `budget-check/budget-check.dto.ts:36`). | Đã sửa |
| A11 | `spend-and-finance-review.md:21` | Ghi `REQUEST_RESERVE_CONFIRMATION_NEEDED` tới trưởng phòng; `REQUEST_BUDGET_BLOCKED` tới trưởng phòng; IT Admin được báo khi `PRICE_MISSING`. | Mọi lần kiểm qua trưởng phòng đều do chính trưởng phòng gây ra (trình lô, xác nhận), mà người gây ra sự kiện không nhận. Vì vậy `REQUEST_RESERVE_CONFIRMATION_NEEDED` thực tế không tới ai, và trưởng phòng không nhận phần `BLOCKED` của mình. Mục trình lô bị `PRICE_MISSING` không ghi audit nên không có thông báo nào (`spend/spend-routing.service.ts:96-117`). | Đã sửa |
| A12 | `spend-and-finance-review.md:47` (`spendBatchSubmit`) | Ghi `IGNORED` chỉ là "mục không dùng dự phòng". `stopReason` không nói chỉ lấy lý do đầu. | `IGNORED` cũng dùng khi trưởng phòng là người thụ hưởng: mục vào `AWAITING_RESERVE_CONFIRMATION`. `stopReason` chỉ lấy `blockReasons[0]` (`spend-submission/spend-batch.service.ts:185-205`). | Đã sửa |
| A13 | `spend-and-finance-review.md:115` (`accessRequestSupplementAdd`) | Ghi `SPEND.NOT_HEAD` cho mọi người không phải trưởng phòng hiện tại. | Trưởng phòng của phòng khác nhận 404 `ACCESS_REQUEST.NOT_FOUND`. `SPEND.NOT_HEAD` chỉ khi người gọi hôm nay không làm trưởng phòng phòng nào (`spend-submission/supplement.service.ts:31-34`, `spend-head.service.ts:12-18`). | Đã sửa |
| A14 | `spend-and-finance-review.md:144` (`spendApprovalDecide`) | Thiếu nhánh `APPROVE` khi chưa định giá được. | Qua trưởng phòng ⟹ 409 `SPEND.NOT_CHECKABLE`. Một bước ⟹ trả về người gửi, 409 `RECHECKED_RETURNED_TO_REQUESTER` `reasons [PRICE_MISSING]`. `REJECT` cũng kiểm lại nhưng không bị trả về (`spend-approval/spend-decision.service.ts:decideOn/approve/returnMissing`). | Đã sửa |
| A15 | `request-operations.md:3`, `:9`, `:11` | Ghi "Request ở `WAITING_CONTROLLED`" cho cả bước IT đánh giá. Ghi `CONTROLLED_WAIT_ALERT` theo từng bước nhưng không nói ai nhận và khi nào. | Bước IT chờ (`NO_IT_ADMIN_IN_CHARGE`): Request vẫn `AWAITING_IT_ASSESSMENT`, mọi IT Admin làm được (`assessment/assessment-step.repo.ts:44-58`, `reassignment.policy.ts requestStateFor`). Alert chỉ gửi Super Admin (`alertRecipientsOf()`), một lần mỗi đợt chờ, do lượt quét tạo (`reassignment/step-reassignment.service.ts:176-179`, `public/step-redetermination-sweep.api.ts`). | Đã sửa |
| A16 | `flows/paid-access-request.md:39`, `:41`, `:71`, `:72`, `:144` | Mermaid và bảng ghi trưởng phòng nhận `REQUEST_RESERVE_CONFIRMATION_NEEDED`/`REQUEST_BUDGET_BLOCKED` khi tự trình lô. | Như A11: trưởng phòng đọc `results[]`; người xin nhận `REQUEST_BUDGET_BLOCKED`. | Đã sửa |
| A17 | `flows/paid-access-request.md:147` | Ghi `PRICE_MISSING` khi trình lô thì "IT Admin phụ trách cũng được báo". | Không có thông báo. Chỉ `PRICE_EXPIRED`, hoặc Request một bước thiếu giá (`ONE_STEP_PRICE_MISSING`), mới báo IT Admin. | Đã sửa |
| A18 | `flows/paid-access-request.md:127-128` | Ghi người xin nhận `REQUEST_WAITING_CONTROLLED` lúc gửi vào phòng không có trưởng phòng; Super Admin nhận `DEPARTMENT_WITHOUT_HEAD` theo Request. | Lúc gửi, người xin nhận `REQUEST_SUBMITTED` với `stage = WAITING_CONTROLLED`. `STEP_WAITING` chỉ phát khi bước đang có người giữ chuyển sang chờ (`step-reassignment.service.ts:262-289`). `CONTROLLED_WAIT_ALERT` tới ở lượt quét kế tiếp. `DEPARTMENT_WITHOUT_HEAD` phát lúc phòng mất trưởng phòng. | Đã sửa |
| A19 | `flows/new-software-request.md:30`, `:34`, `:37` | Bước 1 không nói trưởng phòng tự gửi thì im lặng. Bước 4b ghi "có phí ⟹ luồng chi" (mơ hồ). Bước 4d' không nói IT Admin không được báo. | Như A7 và A9. | Đã sửa |
| A20 | `flows/internal-free-request.md:34` | Không nói Request một bước không có thông báo. | Như A3. | Đã sửa |

Đã đối chiếu và thấy **khớp code** (không sửa):
- Bảng `termMonths` theo kiểu gói, `TERM_*`, schema không chặn 0/13 (`core/term-limit.ts`).
- GH-1/GH-2: `OPEN_LIMIT_REACHED` 422 với `resetsOn`; miễn trừ `TRANSFER_GRACE`/`ROLE_ENDED` (`request-limits.policy.ts`).
- Định tuyến 5 trường hợp (`routing.policy.ts`), phạm vi đọc (`canReadRequest`/`canViewRequest`).
- Luật rút: người gửi, hoặc trưởng phòng khi `BLOCKED`/`RESERVE_CONFIRMATION`, kèm lý do; mã và trạng thái.
- Gửi lại ba nhánh (`request-resubmission.service.ts`).
- Ba kết quả kiểm ngân sách và công thức "còn lại" = cơ sở − đã chi − đang giữ − đang chờ (+ dự phòng) (`spend/budget-check.policy.ts:judgeYear`).
- Không duyệt vượt; checklist chấm trước khi kiểm lại; checklist lô một lần; `RETURN` lô trả cả nhóm.
- Nhóm: 2..10/100 người, lý do dòng, thứ tự từ chối, `RETURN` tất cả hoặc không ai.
- Checklist: câu `SYSTEM` gửi `NO` ⟹ `INCOMPLETE` (`policies/checklist/checklist.policy.ts:53`).
- Renewal: cửa sổ 422, hai `outcome`, `EXTEND`, `RENEWAL_NOT_APPLIED` → `FAILED` và trả cam kết.

**Thống kê MF-1:**
- 65 operation trong 5 nhóm.
- Route ghi: 29/29. 25 route kiểm sâu tới service/policy/http-errors. 4 route (`returnRequestSubmit`, `accessRequestAssessmentSave`, `accessRequestAssessmentReject`, `accessRequestLineCloseForDeparture`) chỉ kiểm mã lỗi và DTO.
- Route đọc: 14/36 (> ⅓), gồm `accessRequestGet`, `accessRequestList`, `departmentAccessRequestList`, `meAccessRequestList`, `needDecisionList`, `accessRequestAssessmentGet`, `budgetCheckGet`, `spendQueueList`, `spendApprovalList`, `controlledWaitList`, `stepCongestionList`, `accessRequestEventList`, `accessRequestAuditFlagList`, `accessRequestLineList`.
- Flow: 4/4 (paid 28 dòng bước/bảng, internal 4, new-software 9, renewal 5).

## B. MF-4 + SBF-11 (budgets, budget-in-year; flows annual-budget, finance-screens, in-year-budget-review) — fork R1-B

| # | file:dòng | Sai gì | Đúng theo code | Sửa |
|---|---|---|---|---|
| B1 | `tools/annotations/budgets.md:3` | Ghi gửi `currency` khác ⟹ 422 `BUDGET.CURRENCY_NOT_REPORTING`. | Object tiền của body chỉ nhận `amount`, nên gửi `currency` (kể cả `"VND"`) ⟹ 422 `VALIDATION_ERROR`. Mã `CURRENCY_NOT_REPORTING` không bao giờ trả qua HTTP (`cycle/cycle.dto.ts:7`, `budget/budget.dto.ts:10`, `adjustment/budget-adjustment.dto.ts:7`). | Đã sửa |
| B2 | `budget-in-year.md:3`, `:96` | Cùng lỗi B1, ở `budgetAdjustmentCreate`. | Như B1. | Đã sửa |
| B3 | `budget-in-year.md:23` | Công thức "Σ `amount` + `unallocated` + `withoutCostCenter` = đã trả" cộng `withoutCostCenter` hai lần. | `allocated` (đã gồm `costCenter = null`) + `unallocated` = `paid` (`seat-month/seat-month.repo.ts:210-214`). | Đã sửa |
| B4 | `budget-in-year.md:13`; `flows/in-year-budget-review.md:79` | Ghi "chưa phân bổ = … − Σ ngân sách hiệu lực". | Trừ (cơ sở + dự phòng) của phiên bản mới nhất mỗi Cost Center ở `SENT`/`CHANGES_REQUESTED`/`APPROVED`. Chỉ phiên bản `APPROVED` cộng điều chỉnh (`budget/budget-facts.repo.ts:91-106`). | Đã sửa |
| B5 | `budget-in-year.md:71` (`budgetReviewLineExplain`) | Ghi Finance nhận 403 `BUDGET.NOT_YOUR_COST_CENTER`. | Route chỉ cho `MANAGER`, nên Finance nhận 403 `AUTHORIZATION.FORBIDDEN` (`review/budget-review-explanation.controller.ts:28`). | Đã sửa |
| B6 | `budget-in-year.md:122` (`budgetAdjustmentDecide`) | Ghi `NOT_SPENDING_APPROVER` cho người không giữ vai. | Không có vai ⟹ `AUTHORIZATION.FORBIDDEN`. `NOT_SPENDING_APPROVER` chỉ khi người giữ vai không còn dùng được. | Đã sửa |
| B7 | `flows/in-year-budget-review.md:91` | Dòng `TRANSFER`/`COST_CENTER_CHANGE` chỉ liệt kê `OVER_REMAINING`. | `NO_BUDGET` và `OVER_BASE` được kiểm trước (`budget-adjustment.policy.ts judgeAdjustment`). | Đã sửa |
| B8 | `budgets.md:13`; `flows/annual-budget.md:156` | Ghi chỉ Finance nhận `BUDGET_VERSION_CLOSED_UNAPPROVED`. | Phiên bản đang `SENT` lúc đóng năm thì Người duyệt chi cũng nhận (`budget-notifier.service.ts`). | Đã sửa |
| B9 | `budgets.md:80` (`budgetCycleUpdate`) | Ghi "gửi đúng giá trị đang có thì không ghi gì" mà không nêu ngoại lệ. | Kỳ `LOCKED` trả 409 `BUDGET_CYCLE.LOCKED` ngay (`cycle/cycle.policy.ts planCycleChange`). | Đã sửa |
| B10 | `budgets.md:347` (`budgetAttachmentComplete`) | Thiếu 403. | 403 khi người khai báo đã mất vai (`budget-attachment-completion.service.ts:98-109`). | Đã sửa |
| B11 | `budgets.md:331` | Ghi `LIMIT_REACHED` chỉ khi đủ "20 tệp mỗi phiên bản". | Cũng xảy ra khi người gọi có 20 tệp chưa gắn (`budget-attachment-declaration.service.ts:49-54`). | Đã sửa |
| B12 | `flows/annual-budget.md:162` | Ghi "sau 01/01 mọi route ghi năm cũ ⟹ `BUDGET.YEAR_ENDED`". | Route kỳ trả `BUDGET.CYCLE_YEAR_PAST`; điều chỉnh `PENDING` vẫn từ chối được. | Đã sửa |
| B13 | `flows/finance-screens.md:3` | Ghi "chỉ Finance gọi được". | Người duyệt chi đọc được `budgetSummary`, `budgetTable`, các route đọc kỳ, đề xuất, phiên bản và điều chỉnh (guard ở `budgets.controller.ts:87,112` và các controller khác). | Đã sửa |

**Thống kê MF-4:** route ghi 25/25; route đọc 21/22; flow 3/3 (B1–B7, 1–14, màn 1/2/4/5).
`--check` nhóm sạch, chỉ còn báo stale.

## C. SBF-19/11a/08/07a + chính sách (purchases-reconciliation, policies-templates; 3 flow) — fork R1-C

| # | file:dòng | Sai gì | Đúng theo code | Sửa |
|---|---|---|---|---|
| C1 | `tools/annotations/purchases-reconciliation.md:216` (`vendorAccountDiscrepancyList`) | Ghi sắp theo `lastSeenAt`. | Sắp `firstSeenAt desc, id asc` (`usage/vendor-account-review/vendor-account-review.repo.ts:135`). | Đã sửa |
| C2 | `purchases-reconciliation.md:261` (`outOfProcessCaseClose`) | Thiếu 422 `OUT_OF_PROCESS_CASE.AMOUNT_INVALID`; điều kiện `TOO_MANY` sai. | `TOO_MANY` = tệp đã gắn + tệp mới > 20, chỉ khi ghi tiền. `amount ≤ 0` ⟹ `MONEY_OUT_OF_RANGE` (`out-of-process-case-closure.service.ts`). | Đã sửa |
| C3 | `purchases-reconciliation.md:154` (`purchaseInvoiceMissingPeriodList`) | Không nói kỳ `K1`/thuê bao lấy từ đâu. | `K1`: Request `GRANT`/`GROUP_GRANT` `COMPLETED`, `termMonths` 1–9, cấp trong 9 tháng (`purchase-invoice.repo.ts:202-218`). Thuê bao: `MONTHLY`/`QUARTERLY`/`ANNUAL`. | Đã sửa |
| C4 | `flows/purchase-invoice.md:46` | Ghi `FAILED`/`AWAITING_IT_CLOSE` chỉ nhận hóa đơn cho `K1`. | Mọi kiểu cấp đều nhận; chỉ `K1` đổ vào dòng _Chưa phân bổ_ (`purchase-invoice-plan.service.ts:36,52-53,158-161`). | Đã sửa |
| C5 | `flows/reconciliation.md:76` | Thiếu một lệch BRD. | `SBF-07a` (`QĐ-103m`) nói báo người dùng và trưởng phòng; BE không gửi thông báo nào. | Đã thêm |
| C6 | `policies-templates.md:67` | Các route nháp thiếu 404 `POLICY.NOT_FOUND`. | `library-draft.service.ts`, `library-publish.service.ts`, `library.http-errors.ts:21`. | Đã sửa |

**Thống kê cụm C:** route ghi 12/12; route đọc 14/14; flow 3/3. `flows/policies-checklist.md` không có lỗi.

## D. Glossary sai nghĩa (không sửa; điều phối gộp vào pending)

| Khóa | Hiện ghi | Đúng |
|---|---|---|
| `budget-in-year:poolLines[].withoutCostCenter` | "không nằm trong `unallocated`" | Thêm: **đã nằm trong `allocated`**, FE không cộng thêm. |
| `purchases-reconciliation:items[].lastSeenAt` | "danh sách sắp xếp theo field này" | Bỏ vế đó: danh sách sắp theo `firstSeenAt` giảm dần. |

## E. Lệch code ↔ BRD/QĐ (mới thấy ở R1)

- `SBF-07a`: BRD nói báo người dùng và trưởng phòng; BE không gửi thông báo (đã ghi ở `flows/reconciliation.md`).
- Các lệch tài liệu đã ghi đều khớp code. Gồm: `BR-MF1-07` (lô có _Không_ vẫn `REJECT` một phần), nhóm ≤ 100 khi trưởng phòng gửi, `FR-11.2`, `budgetVersionSend` không chặn kỳ `OPEN`, `budgetAdjustmentCreate` chỉ khi kỳ `LOCKED`, và các lệch `SBF-19`/`SBF-08`/`SBF-11a`.

## F. Nghi lỗi BE mới

1. **(Thấp, contract)** Mô tả contract của `accessRequestCancelForDeparture` nói "Finance are told". Code chỉ báo Finance khi hệ thống tự đóng (`goneNotice`); IT Admin đóng tay thì Finance không nhận dù có cam kết được trả về.
2. **(Thấp)** `REQUEST_RESERVE_CONFIRMATION_NEEDED` là mã chết với code hiện tại. Mọi lần kiểm `VIA_HEAD` đều do chính trưởng phòng gây ra, mà người gây ra bị loại khỏi người nhận. Hoặc bỏ mã, hoặc phát khi có trigger không phải trưởng phòng.
3. **(Thấp)** Không có thông báo cho IT Admin khi:
   - trưởng phòng tự gửi đề xuất phần mềm mới: `ASSESSMENT_REQUESTED` không có luật;
   - người gửi gửi lại sau _Trả về_ của IT, hoặc sau _Trả về_ ở bước nhu cầu: `RESUBMITTED` không có luật.

   Ngoài ra, mục trình lô dừng vì `PRICE_MISSING` không báo IT Admin, dù luật thông báo có xét `PRICE_MISSING` (`status-rules-budget-check.policy.ts:51`). Lý do: không có audit `BUDGET_CHECKED` khi lần kiểm không chạy được. Chưa đối chiếu nguyên văn BRD.
4. **(Thấp)** `BUDGET.CURRENCY_NOT_REPORTING` vẫn có trong ví dụ lỗi của contract nhưng không route nào trả được.
5. **(Thấp/TB)** Kỳ chưa có hóa đơn của `K1` chỉ tính theo `termMonths` của Request cấp mới. Tháng thêm do Request tiếp tục (`RENEWAL`) không bao giờ hiện cờ, trái `QĐ-111x` (`purchase-invoice.repo.ts:209-214`).
6. **(Thấp, OpenAPI)** `purchaseInvoicePreview`/`Submit` có thể trả 409 `PURCHASE_INVOICE.NO_PLACE` nhưng controller không khai mã này.
7. **(Thấp)** `policyList`: `totalItems` đếm cả chính sách chưa xuất bản trong khi `items` đã lọc bỏ.
8. **(Ghi nhận)** `budgetCommitmentList`/`seatMonthChargeList` chỉ cho trưởng phòng hiệu lực hôm nay; `budgetMine`/`budgetCycleBaseline` cho cả người được gán chưa tới ngày hiệu lực.

## G. Kiểm `--check`

`node tools/build-api-docs.mjs --be D:/FPT/FALL2026/Code/be-verify --check` chạy lúc kết thúc: 35 dòng, exit 1.
- Phần thuộc phạm vi chỉ là "stale" của 8 file `reference/` có annotation vừa sửa (chờ điều phối sinh lại).
- Còn lại là anchor hỏng trong `roles/finance.md`, phần của A7.
- Không có link hỏng, thiếu chú thích hay field chưa có nghĩa phát sinh từ các sửa của R1.

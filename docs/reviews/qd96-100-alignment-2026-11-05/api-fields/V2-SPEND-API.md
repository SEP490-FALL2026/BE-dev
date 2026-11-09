# V2-SPEND-API — Việc 2: rà trường API ngân sách, duyệt chi, tham số, tỷ giá

> Agent V2-SPEND-API · 05/11/2026 · read-only, không chạy test, không git. Pin: Docs `3d73a7f`, BE `3e4553b9`.
> Phạm vi tag: `finance-reviews` (5) · `spend-submission` (8) · `spend-approvals` (4) · `budget-information` (4) · `budget-proposals` (7) · `budget-versions` (14) · `budgets` (13) · `budget-commitments` (3) · `operating-parameters` (9) · `exchange-rates` (2) · `currencies` (1) = **70 operation, 34 ghi, 36 GET**.

## 1. Skill, nguồn đã đọc, operation đã rà

**Skill Preflight**

| Skill | Loại | Mục đích |
| --- | --- | --- |
| `doubt-driven-development` | process | Mỗi kết luận BỎ/SERVER TÍNH phải có QĐ/FR và `file:dòng`. Đang chạy trong subagent nên không mở được reviewer có ngữ cảnh mới; dùng **bản tự chất vấn giảm cấp** (skill cho phép), nên các kết luận lớn đã được đối chiếu lại với code. Bỏ qua cross-model vì đây là ngữ cảnh không tương tác. |
| `api-and-interface-design` | domain | Tách input/output, dùng trường server tính thay cho client gửi, enum/discriminated union, đổi bổ sung trước khi xóa |
| `security-and-hardening` | domain | Phạm vi dữ liệu theo vai (`QĐ-100p`), client gửi số tiền/năm mà server tin |
| `code-review-and-quality` | review | Đọc logic, mức nghiêm trọng, đề xuất sửa nhỏ nhất |
| `superpowers:verification-before-completion` | verification | Kiểm lại số operation/trường với `inventory.md` và DTO trước khi kết luận |

**Đã đọc**
- Tracker `README.md` và `api-fields/inventory.md` (các tag được giao).
- `Docs/Decisions/project-decisions.md`: mục 3.8 (dòng 360–418), 3.10 (453–475), các QĐ chi của 3.5 (274–323) và 3.11 (`QĐ-100t…100ai`).
- BRD 4.0: `FR-3.14`, `FR-3.20`, `FR-3.21`, `FR-5.1`→`FR-5.8b`, `FR-5.13`, `FR-5.15`, `FR-5.16`, `FR-8.2`.
- `EP-06.md`: `US-06-09`, `US-06-10`, `US-06-14`, `US-06-16` (đọc AC).
- BE: `budgets/**` (dto, proposal, version, commitment, budget-view, attachment), `requests/{finance-review, spend, spend-submission, spend-approval, spend-approval-view, budget-information, budget-questions, plan-line}`, `requests/access-request/pricing.policy.ts`, `finance/{exchange-rate,currency}`, `operating-parameters/**`, `prisma/models/{budgets,requests}.prisma` (chỉ cột).
- FE: `FE-web/app/features/dashboard/{finance,approvals,manager}`; `Docs/Figma UI-UX/API-Integration/{flows,roles,reference}` (grep).

**Chưa đọc:** sơ đồ `MF-4…md` và *Quy trình và chính sách theo main flow.md* (BRD, QĐ và US đã đủ để kết luận). Chưa đọc hết `line-import.service.ts`, `year-end/*` và `budget-notifier`, chưa đọc test. Không mở client FE sinh tự động, chỉ grep trong feature.

**Danh sách operation đã rà**

| Tag | Ghi (đã rà trường) | GET đã rà query/response |
| --- | --- | --- |
| finance-reviews | `financeReviewComplete` | `financeReviewList`, `financeReviewGet`, `budgetCheckGet`, `budgetCheckYearList` |
| spend-submission | `spendBatchSubmit`, `accessRequestPlanLineSet`, `accessRequestSupplementAdd` | `spendQueueList`, `spendBatchGet`, `spendBatchItemList`, `accessRequestPlanLineSuggestionList`, `accessRequestSupplementList` |
| spend-approvals | `spendApprovalDecide`, `spendBatchDecide` | `spendApprovalList`, `spendApprovalGet` |
| budget-information | `budgetInformationAsk`, `budgetInformationAnswer` | `budgetInformationOfRequest`, `budgetInformationList` |
| budget-proposals | `budgetProposalSubmit`, `budgetProposalWithdraw`, `budgetProposalReturn`, `budgetProposalResubmit` | `budgetProposalList`, `budgetProposalGet`, `budgetProposalLineList` |
| budget-versions | `budgetVersionCreate`, `budgetVersionRevise`, `budgetVersionUpdate`, `budgetVersionSend`, `budgetVersionDecide`, `budgetVersionLineAdd`, `budgetVersionLineUpdate`, `budgetVersionLineWindow`, `budgetVersionImport` | `budgetVersionList`, `budgetVersionHistoryList`, `budgetVersionGet`, `budgetVersionLineList`, `budgetVersionLineChangeList` |
| budgets | `budgetVersionAttachmentDeclare`, `budgetProposalAttachmentDeclare`, `budgetAttachmentComplete`, `budgetVersionAttachmentRemove`, `budgetAttachmentDiscard`, `budgetAttachmentLink` | `budgetMine`, `budgetMineLineList`, `budgetMineVersionList`, `budgetTable`, `budgetVersionAttachmentList`, `budgetProposalAttachmentList`, `budgetAttachmentMineList` |
| budget-commitments | `budgetCommitmentRelease` | `budgetCommitmentList`, `budgetCommitmentReleases` |
| operating-parameters | `operatingParameterSet`, `nonWorkingDateAdd`, `nonWorkingDateRename`, `nonWorkingDateRemove`, `reportingCurrencySet` | `operatingParameterList`, `operatingParameterHistory`, `nonWorkingDateList`, `reportingCurrencyGet` |
| exchange-rates | `exchangeRateRecord` | `exchangeRateList` |
| currencies | — | `currencyList` |

**Tổng kết trường input (body/path của 34 operation ghi, 114 trường):** **GIỮ 76** · **BỎ 27** · **SERVER TÍNH 6** · **ĐỔI 4** · **CHUYỂN BƯỚC 1** (vai). Ngoài ra **THIẾU 7 nhóm trường** mà nghiệp vụ bắt buộc nhưng API chưa có (mục 2.11), và **6 operation BỎ nguyên** (`financeReviewComplete`, `budgetInformationAsk`, `budgetInformationAnswer`, `budgetVersionRevise`, `budgetVersionLineWindow` cùng hai GET đi kèm).

Ký hiệu căn cứ: `PD:<dòng>` = `Docs/Decisions/project-decisions.md`; `BRD FR-x` = BRD 4.0; `US-06-xx AC-n` = `Docs/BE-UserStory/epics/EP-06.md`. Đường dẫn code tính từ `src/modules/`.

---

## 2. Theo từng operation ghi

### 2.1 `financeReviewComplete` — `POST /access-requests/{id}/finance-review`

- **Vai theo QĐ:** không vai nào. Bước Finance rà soát đã bỏ: `QĐ-97c` (PD:400), `QĐ-82b` (PD:368), `QĐ-29b` (PD:362), `US-06-13` `RETIRED`.
- **Guard thật:** `@RequireRoles('FINANCE')` (`requests/finance-review/finance-reviews.controller.ts:104-106`).
- **Flow:** MF-1, bước kiểm tra ngân sách. Trong BE đây là nhánh rẽ sang Finance khi gặp `HIGH_VALUE`/`INSUFFICIENT`/`NO_ACTIVE_BUDGET`/`PLAN_LINE_OVERDUE` (`spend/budget-check.policy.ts:140-148`). Nhánh này không còn trong nghiệp vụ.

| Trường | Vai có trách nhiệm? | Logic dùng ở đâu | Server suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `outcome` (ASSESSED/RETURN_TO_HEAD/NEEDS_BUDGET) | Không — Finance không nằm trên đường Request | `finance-review.dto.ts:23-47` → `finance-review-writer.service.ts` → bảng `RequestFinanceReview` | — | Không | **BỎ** | `QĐ-97c` PD:400, `QĐ-82m`(B) PD:379, `FR-3.20` | `finance/budget-check/components/finance-review-form.tsx` |
| `opinion` | Không | lưu `RequestFinanceReview.opinion`; Người duyệt chi đọc (`spend-finance-panel.tsx`) | — | Không | **BỎ** | như trên | như trên, kèm `approvals/queue/components/spend-finance-panel.tsx` |
| `direction` (RECOMMEND_APPROVE/**OVERRIDE**/REJECT) | Không — override đã bỏ | lưu, hiện cho Người duyệt chi | — | Không | **BỎ** | `QĐ-82d` PD:369, `QĐ-97c` | như trên |
| `reason` | Không | lưu | — | Không | **BỎ** | như trên | như trên |

GET đi kèm `financeReviewList` và `financeReviewGet`: **BỎ**. `budgetCheckGet` và `budgetCheckYearList` **GIỮ, đổi tag và hình dạng**, xem mục 4.

### 2.2 `spendBatchSubmit` — `POST /spend-batches`

- **Vai:** trưởng phòng có hiệu lực của phòng (`QĐ-82j` PD:306, `FR-3.21`). Guard `MANAGER` cộng kiểm `departmentId` (`spend-submission/spend-batch.service.ts:47-58`) — **khớp**.
- **Flow:** MF-1, bước trình lô → kiểm tra ngân sách ba kết quả.

| Trường | Vai có trách nhiệm? | Logic | Server suy ra? | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- |
| `requestIds[]` | Có — trưởng phòng chọn mục nào vào lô | `spend-batch.service.ts:51-58` khóa và kiểm queue/phòng; `sendOn` 101-120 | Không | **GIỮ** | `FR-3.21` | Manager `manager-weekly-batch-view.tsx` vẫn là **mock**, chưa gọi API |
| *(chưa có)* `reserveConfirmations[] {requestId, reason}` | Có — trưởng phòng xác nhận dùng dự phòng **từng mục, cùng thao tác, một dòng lý do mỗi mục** | Không có trong code (grep `reserve` ở `requests/` không ra kết quả) | Không | **THIẾU** (xem Q2) | `FR-3.21` gạch 2, `QĐ-100u` PD:492, `QĐ-97f`, `US-06-14` AC-12, `US-06-16` AC-1 | Chưa có màn hình |

Response `batchItem` (`spend/spend-submission.dto.ts:114-133`):
- `outcome: SENT_TO_FINANCE` → **BỎ**. Thêm `NEEDS_RESERVE_CONFIRMATION`.
- `stopReason` → thêm `OVER_RESERVE`, `NO_ACTIVE_BUDGET` kèm `overBy` (số tiền vượt). Theo `QĐ-97c`, trưởng phòng được thấy phần vượt.
- `leftReason: RETURNED_BY_FINANCE` → **BỎ**. `CONFLICT_OF_INTEREST` không còn xảy ra theo `QĐ-93d`; giữ để đọc lịch sử hoặc bỏ, tùy Q5.

### 2.3 `accessRequestPlanLineSet` — `PUT /access-requests/{id}/plan-line`

- **Vai:** trưởng phòng gắn dòng kế hoạch hoặc chọn *ngoài kế hoạch*. Việc gắn **chỉ là thông tin** (`QĐ-82l(5)` PD:375, `FR-5.15`(5)). Guard `MANAGER` — khớp.

| Trường | Vai có trách nhiệm? | Logic | Server suy ra? | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- |
| `planLine.position` | Có | `plan-line/plan-line.service.ts:37-45` đọc dòng của version hiện hành theo `request.pricing.budgetYear` | Server **gợi ý** (`accessRequestPlanLineSuggestionList`) nhưng trưởng phòng chọn | **GIỮ** | `QĐ-82l(5)` | Manager mock. Need-decision dùng chung schema (`approvals/need/components/need-decision-form.tsx:95`) |
| `planLine.stillNeeded` | Không — khái niệm *dòng quá hạn* đã bỏ | `spend/spend-submission.policy.ts:23-32`: dòng quá khoảng mua mà thiếu `stillNeeded` thì bị **từ chối 409**. Cờ được lưu `AccessRequest.planLineConfirmed` | — | **BỎ** | `QĐ-82d(4)` PD:369 (*dòng quá hạn bỏ, gắn dòng chỉ là thông tin*), `US-06-09` AC-17 (bỏ) | `need-decision-form.tsx:35,95,210-213` (checkbox `stillNeeded`) |
| `offPlan: true` | Có | `oneChoice` (`access-request/access-request.dto.ts:27-51`) | Không | **GIỮ** (tùy chọn: đổi sang `{kind:'LINE',position}\|{kind:'OFF_PLAN'}`) | `QĐ-82l(5)` | — |

Response: `planLineState.stillNeeded` **BỎ**. Gợi ý `suggestion.overdue` **GIỮ**, đổi nghĩa thành nhãn *quá khoảng mua* (chỉ thông tin, `FR-5.15`(5)).

### 2.4 `accessRequestSupplementAdd` — `POST /access-requests/{id}/supplements`

- **Vai:** trưởng phòng lập hồ sơ bổ sung cho Request bị chặn hoặc chờ dự phòng: giảm số lượng, người thụ hưởng (chỉ bỏ bớt), thời hạn, dòng kế hoạch (`FR-3.21` gạch 5, `US-06-16`, `FR-11.2`). Guard `MANAGER` — khớp.

| Trường | Vai có trách nhiệm? | Logic | Server suy ra? | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- |
| `expectedSpendOn` | **Không** — không còn *ngày dự kiến chi* | `spend/spend-submission.dto.ts:35-36` → `supplement-pricing.service.ts` reprice theo ngày mới, kéo theo **năm ngân sách và lịch trả** (`access-request/pricing.policy.ts:60-77`) | **Có**: năm tạm tính theo ngày trình, tính lại theo ngày duyệt chi | **BỎ** | `QĐ-98a` PD:403, `QĐ-100n` PD:415, `US-06-14` AC-15 (bỏ) | Manager mock. API doc `flows/paid-access-request.md:60` còn nói *"Năm ngân sách theo `expectedSpendOn`"* |
| `dropEmployeeIds[]` | Có (Request nhóm chỉ bỏ bớt người) | `supplement.service.ts` → `GroupSupplementService.withoutPeople`, reprice | Không | **GIỮ** | `QĐ-93d(2)`, `US-06-14` AC-16 | — |
| `reason` | Có | lưu `RequestSupplement.reason` | Không | **GIỮ** | `FR-11.2` | — |
| *(chưa có)* `termMonths` (giảm thời hạn) | Có | — | Không | **THIẾU** (Q3) | `FR-3.21` gạch 5, `US-06-16` (*sửa: giảm số lượng, thời hạn, số người*) | — |

Response `supplementSchema`: cặp `expectedSpendOn {before,after}` và `budgetYear {before,after}` **BỎ** (năm không còn đổi theo ngày do client chọn). Giữ `amount {before,after}`, `droppedCount`. Thêm `termMonths {before,after}`.

### 2.5 `spendApprovalDecide` — `POST /access-requests/{id}/spend-approval`

- **Vai:** Người duyệt chi được giao bước, không phải bên của Request (`QĐ-22`, `FR-3.15`). Kiểm ở service (`spend/spend-decision.policy.ts:16-33`) — khớp.
- **Flow:** MF-1, bước duyệt chi, kiểm lại ngân sách lúc duyệt (`QĐ-97g` PD:402).

| Trường | Vai có trách nhiệm? | Logic | Server suy ra? | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- |
| `decision` (APPROVE/REJECT) | Có | `spend-decision.service.ts` → `spendDecisionRecordOf` | Không | **GIỮ** | `FR-3.21` | `approvals/queue/components/spend-decision-form.tsx` |
| `reason` (bắt buộc khi REJECT, cấm khi APPROVE) | Có | lưu `SpendDecision.reason` | Không | **GIỮ** | `FR-3.21`, `QĐ-53a` | như trên |
| `override.reason` | **Không** — override đã bỏ | `spend-decision.policy.ts:57-80`: năm `INSUFFICIENT_BUDGET`/`NO_ACTIVE_BUDGET` **được duyệt vượt** nếu có override. Lưu `SpendDecision.overrideReason` | — | **BỎ** | `QĐ-97c` PD:400 (*không còn override*), `FR-3.20` (*Request bị chặn không tới Người duyệt chi*), `US-06-16` AC-8 | `spend-decision-form.tsx:45-47,131-145,208-209` |
| `override.years[]` | **Không** — client phải gõ lại đúng những năm server đã biết (`OVERRIDE_MISMATCH`) | `spend-decision.policy.ts:72-80`, lưu `SpendDecision.overrideYears` | Có (thừa ngay cả theo luật cũ) | **BỎ** | như trên | như trên |

### 2.6 `spendBatchDecide` — `POST /spend-batches/{id}/decisions`

| Trường | Vai có trách nhiệm? | Logic | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- |
| `decision` | Có (Người duyệt chi) | `spend-approval/spend-batch-decision.service.ts`, kiểm lại từng mục theo thứ tự | **GIỮ** | `FR-3.21`, `QĐ-82l(12)` | `approvals/queue/components/spend-batch-decision.tsx` |
| `requestIds[]` | Có | như trên | **GIỮ** | `FR-3.21` | như trên |
| `reason` (lý do chung khi từ chối) | Có | lưu cho từng bước | **GIỮ** | `FR-3.21` (*một lý do chung*) | như trên |

Response `result.reason` (`spend-approval-view/spend-approval.dto.ts:181-205`):
- **BỎ** `REVIEWER_IS_APPROVER`, `OVERRIDE_REQUIRED`, `RECHECKED_NEEDS_FINANCE_REVIEW`.
- **Thêm** `RECHECKED_NEEDS_RESERVE_CONFIRMATION`. `RECHECKED_RETURNED_TO_HEAD` dùng cho ca *bị chặn* (`QĐ-97g`).
- `GROUP_NEEDS_LINES` giữ (`QĐ-66m`).

### 2.7 `budgetInformationAsk` / `budgetInformationAnswer`

- **Vai theo QĐ:** không ai. *"Người duyệt chi không còn bước hỏi Finance"* (`QĐ-29b` PD:362); `US-06-02`/`US-06-03` đã `RETIRED`.

| Op · trường | Logic | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- |
| Ask · `question` | `requests/budget-information/*`, bảng `BudgetInformationRequest`, controller `budget-questions/budget-information.controller.ts:47-141` | **BỎ** | `QĐ-29b`, `FR-3.20` (*không có Người duyệt chi hỏi Finance*) | `approvals/queue/components/spend-finance-panel.tsx:92-137` |
| Answer · `answer` (WITHIN_LIMIT/OVER_LIMIT/NO_BUDGET) | như trên | **BỎ** | như trên | `finance/budget-questions/**` |
| Answer · `note` | như trên | **BỎ** | như trên | như trên |

GET `budgetInformationOfRequest`, `budgetInformationList` cũng **BỎ**. Ngoài ra bỏ `spendApprovalGet.latestBudgetInformation` (`spend-approval.dto.ts:177-178`).

### 2.8 `budgetProposalSubmit` / `budgetProposalResubmit` — BM-10 của trưởng phòng (MF-4 B4)

- **Vai:** trưởng phòng có hiệu lực, chỉ cho Cost Center `Unit` của phòng mình (`QĐ-82a` PD:367, `FR-5.15`(1)). Guard `MANAGER` cộng `requireHeadedCostCenter` (`budgets/proposal/proposal-sender.service.ts:56-58`) — khớp.
- DTO: `budgets/budget/budget.dto.ts:19-51`.

| Trường | Vai có trách nhiệm? | Logic | Server suy ra? | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- |
| `costCenterId` (chỉ submit) | Không cần — trưởng phòng chỉ lập cho phòng mình | `proposal-sender.service.ts:56-58`: server tự lấy `own`, rồi chỉ **so** với giá trị client gửi và trả 403 nếu khác. Không dùng vào việc gì khác | **Có**: `headedCostCenter` trả đúng một Cost Center | **SERVER TÍNH** (bỏ khỏi body, hoặc để optional chỉ để khẳng định) | `FR-5.15`(1), `US-06-10` AC-3 | Manager `manager-annual-budget-view.tsx` là **mock** (form chỉ có ngày và tệp) |
| `year` (chỉ submit) | Có — đề xuất cho năm nào (năm đang chạy hoặc năm sau) | `yearIsOpen` (`proposal-sender.service.ts:59`) | Không | **GIỮ** | `US-06-10` AC-9 | — |
| `lines[].description` | Có (phần mềm mới chưa có trong danh mục) | lưu `BudgetProposalLine` | Không | **GIỮ** | `FR-5.15`(1) | — |
| `lines[].planId` | Có (phần mềm/gói trong danh mục) | `requirePlans` (`:62`), lưu | Không | **GIỮ** | như trên | — |
| `lines[].seats` | Có (số lượng) | chỉ lưu, không dùng để tính tiền | Không | **GIỮ** | như trên | — |
| `lines[].amount.amount` | Có — chi phí ước tính theo giá gốc | `facts.money` (`:137`), cộng tổng | Một phần — có thể gợi ý từ giá gói × seat (Q4) | **GIỮ** (phụ thuộc Q4) | `FR-5.15`(1), `QĐ-97d` | — |
| `lines[].amount.currency` | Không — **bắt buộc bằng đồng tiền báo cáo**, khác thì 422 `BUDGET.CURRENCY_NOT_REPORTING`. Trưởng phòng **không có API nào** đọc đồng tiền báo cáo (`reportingCurrencyGet` chỉ cho Super Admin, `currencyList` chỉ cho Finance/IT) | `facts.money(line.amount, reporting)` | **Có** | **SERVER TÍNH** | `FR-1.6`, `QĐ-42c` | — |
| `lines[].windowFrom` / `windowTo` | Có (khoảng mua/gia hạn dự kiến) | `incompleteLines`/`backwardLines` (`:111-124`) | Không | **GIỮ** (optional trong schema để trả lỗi theo dòng, `US-06-10` AC-2) | `QĐ-82d` PD:369 | — |
| `lines[].servicePeriodMonths` | Có (kỳ dịch vụ) | như trên | Không | **GIỮ** | như trên | — |
| `lines[].repeatCycle` | Có (chu kỳ lặp) | như trên | Không | **GIỮ** (Q6 về giá trị `QUARTERLY`) | `FR-5.15`(1): *một lần · tháng · năm* | — |
| `lines[].quoteValidUntil` | Có (ngày hiệu lực của bằng chứng giá, khi có) | lưu | Không | **GIỮ** | `QĐ-82d` | — |
| `lines[].note` | Có (= *giả định*) | lưu | Không | **GIỮ** (tùy chọn: đổi tên thành `assumption` cho rõ nghĩa) | `FR-5.15`(1) | — |
| `attachmentIds[]` | Có | `ProposalAttachmentBinder.bind` (`:91-93`) | Không | **GIỮ** | `QĐ-93j` PD:395 | — |
| *(chưa có)* `lines[].lineType` Renew/Change/New/Cancel | Có, **bắt buộc** | — | Không | **THIẾU** | `QĐ-94g` B4 PD:396, `US-06-10` AC-17 | — |
| *(chưa có)* `lines[].zbbJustification {purpose, alternatives, impactIfNot, usageMetric}` | Có, bắt buộc theo ngưỡng; **server tính** khi nào bắt buộc (dòng New, `KPI-3` < 70 %, đơn giá tăng > 10 %) | — | Điều kiện bắt buộc: server tính | **THIẾU** | `US-06-10` AC-18, `FR-8.2` (tham số Finance) | — |
| *(chưa có)* `lines[].priorityRank` | Có | — | Không | **THIẾU** | `US-06-10` AC-19 | — |

Cờ *vượt chỉ tiêu* (`US-06-10` AC-20) phải do **server tính** từ chỉ tiêu B3, không do client gửi. Hiện BE chưa có phong bì/chỉ tiêu (`US-06-15`), xem mục 5.

Resubmit dùng cùng `lines[]` và `attachmentIds`; kết luận như bảng trên. Withdraw không có body: **GIỮ**.

### 2.9 `budgetProposalReturn` — Finance trả đề xuất

| Trường | Logic | Kết luận | Căn cứ |
| --- | --- | --- | --- |
| `reason` (bắt buộc) | `proposal.service.ts:112-139` | **GIỮ** | `QĐ-91a`, `QĐ-100v` PD:493 (trả đề xuất khi gói vượt phong bì) |

### 2.10 Nhóm `budget-versions` (Finance lập phiên bản, Người duyệt chi quyết — MF-4 B5/B6)

Guard: Finance cho mọi thao tác lập/sửa (`facts.requireFinance`); decide kiểm Người duyệt chi cộng `SoD-8` (`version/version-decision-judge.service.ts:36-69`) — **khớp**.

**`budgetVersionCreate`** (`budget.dto.ts:79-98`, `version/version-creation.service.ts`, `version-figures.service.ts:23-47`)

| Trường | Vai có trách nhiệm? | Logic | Server suy ra? | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- |
| `proposalId` | Có | `versionSourceOf` | Không | **GIỮ** | `QĐ-92d(3)` | `finance/annual-budget/components/budget-proposal-detail.tsx` |
| `base` | Có (Finance) — nhưng **không liên hệ gì** với tổng các dòng của phiên bản | chỉ lưu và dùng làm tổng (`version.repo.ts:142`) | Có thể = Σ dòng đã điều chỉnh (Q1) | **GIỮ** (phụ thuộc Q1) | `FR-5.15`(2), `US-06-09` AC-1 | `budget-version-form.tsx` |
| `base.currency`, `reserve.currency`, `quarters.*.currency` | Không — luôn bằng `proposal.currency` | `facts.money(x, currency)` | Có | **SERVER TÍNH** | `FR-1.6` | — |
| `reserve` (bắt buộc) | Một phần — **mặc định 10 % số cơ sở là tham số do Finance cấu hình**, Finance chỉ sửa khi khác mặc định và kèm lý do | Lưu thẳng, không có mặc định. FE gửi `reserve: '0'` (`budget-proposal-detail.tsx:55`) | **Có** (= tham số % × base) | **ĐỔI** → optional, vắng thì server lấy mặc định | `QĐ-100h` PD:413, `QĐ-100k` PD:414, `US-06-09` AC-30 | `budget-version-form.tsx:29,93-100` |
| `highValuePercent` (bắt buộc) | **Không** — ngưỡng giá trị cao đã bỏ | lưu `BudgetVersion.highValuePercent`, dùng ở `budget-check.policy.ts:120-124` để rẽ sang Finance | — | **BỎ** | `QĐ-97c` (*không còn ngưỡng giá trị cao*), `FR-5.15`(2) | `budget-version-form.tsx:30,69,104-114`; `budget-proposal-detail.tsx:56` mặc định 10 |
| `highValueAmount` | Không | như trên | — | **BỎ** | như trên | `budget-version-form.tsx:31,70,116-121` |
| `quarters` | Có (phân kỳ quý tùy chọn, tổng bằng năm) | `quartersMatch` | Không | **GIỮ** | `FR-5.15`(2), `US-06-09` AC-6 | như trên |
| *(chưa có)* `reserveReason` | Có — bắt buộc khi dự phòng ≠ mặc định | — | Điều kiện bắt buộc: server tính | **THIẾU** | `QĐ-100h`, `US-06-09` AC-30 | — |

**`budgetVersionRevise`** — **BỎ nguyên operation**, gồm 8 trường `costCenterId`, `year`, `base`, `reserve`, `highValuePercent`, `highValueAmount`, `quarters`, `reason`. Căn cứ: `QĐ-97b` PD:399 (*không có phiên bản sửa đổi trong năm*), `QĐ-82a`, `US-06-09` AC-7…10 (bỏ), AC-31. Code: `version/version-revision.service.ts`, `budget.dto.ts:100-109`. FE: tìm không thấy màn hình gọi.

**`budgetVersionUpdate`** (`budget.dto.ts:110-121`, `version-figures.service.ts:50-66`)

| Trường | Kết luận | Ghi chú/căn cứ |
| --- | --- | --- |
| `base`, `reserve`, `quarters` | **GIỮ** | Sửa trong `DRAFT`/`CHANGES_REQUESTED` (`QĐ-91d`) |
| `highValuePercent`, `highValueAmount` | **BỎ** | `QĐ-97c` |
| `reason` | **ĐỔI** → `reserveReason` | Hiện là *lý do của phiên bản sửa đổi*, `REVISION` thì bắt buộc khác null (`version-figures.service.ts:51`). Revision đã bỏ, nên lý do duy nhất còn cần là lý do dự phòng khác mặc định (`QĐ-100h`). Lý do sửa sau *yêu cầu sửa* đã nằm trong lịch sử phiên bản (`QĐ-91d`) |

**`budgetVersionSend`** (không có body) — **GIỮ**. Cần thêm kiểm *thiếu `reserveReason` khi dự phòng ≠ mặc định* trước khi gửi (`US-06-09` AC-30) và cảnh báo *số cơ sở < tổng cam kết chuyển tiếp* (AC-32).

**`budgetVersionDecide`** (`budget.dto.ts:57-77`)

| Trường | Kết luận | Căn cứ |
| --- | --- | --- |
| `decision` APPROVE/REJECT/REQUEST_CHANGES | **GIỮ** | `FR-5.15`(3), `QĐ-91d` |
| `reason` (bắt buộc khi REJECT/REQUEST_CHANGES, cấm khi APPROVE) | **GIỮ** | như trên |

Lỗ hổng logic: APPROVE **không kiểm** *số cơ sở ≥ tổng cam kết chuyển tiếp* (`QĐ-98b` PD:404, `QĐ-91b`, `US-06-11` AC-15). `version-decision-judge.service.ts:36-69` không có kiểm này; grep `carry|floor` ở `budgets/` không ra kết quả.

**`budgetVersionLineAdd`** (`addLinesBodySchema`, cùng `lineBody`): các trường dòng **GIỮ**, `amount.currency` **SERVER TÍNH**. Finance thêm dòng là hợp lệ (import và nhập dòng của Finance theo `QĐ-93j`); khoản ưu tiên do lãnh đạo giao thì theo B2/B3.

**`budgetVersionLineUpdate`** (`linePatchSchema`, `budget.dto.ts:122-138`; `version/version-line.service.ts`)

| Trường | Kết luận | Căn cứ |
| --- | --- | --- |
| `description`, `planId`, `seats`, `amount.amount`, `windowFrom`, `windowTo`, `servicePeriodMonths`, `repeatCycle`, `quoteValidUntil` | **GIỮ** — Finance điều chỉnh dòng trong phiên bản chưa duyệt; dòng đề xuất gốc giữ nguyên | `US-06-09` AC-14 |
| `financeComment` | **GIỮ** — nhận xét điều chỉnh | `FR-5.15`(2) |
| `adjustmentReason` | **GIỮ** — bắt buộc khi đổi dòng gốc từ đề xuất (`version-line.service.ts`, `BudgetReasonRequiredError('ADJUSTMENT')`) | `QĐ-82a`, `US-06-09` AC-14 |
| `amount.currency` | **SERVER TÍNH** | như trên |

**`budgetVersionLineWindow`** — **BỎ nguyên operation** (`windowFrom`, `windowTo`, `amount`, `reason`). Dời khoảng mua của dòng trong ngân sách **đã duyệt**: `version/version-window.service.ts:45-60` chỉ cho `state === 'APPROVED'`, và trường `amount` tồn tại chỉ để bị từ chối (`budget.dto.ts:140`). Căn cứ: `QĐ-82l(5)` (*không dời khoảng mua*), `QĐ-97b`, `US-06-09` AC-17 (bỏ), AC-31. FE: `finance/annual-budget/components/budget-line-window-form.tsx`, `budget-line-history.tsx`. GET `budgetVersionLineChangeList` cũng **BỎ** (bảng `BudgetVersionLineChange`).

**`budgetVersionImport`** · `file` — **GIỮ** (`QĐ-93j`, `US-06-09` AC-3).

### 2.11 Nhóm `budgets` — đính kèm tài liệu (QĐ-93j)

| Op | Trường | Kết luận | Ghi chú |
| --- | --- | --- | --- |
| `budgetVersionAttachmentDeclare` (FINANCE), `budgetProposalAttachmentDeclare` (MANAGER) | `fileName`, `contentType` | **GIỮ** | Mẫu presigned upload; nội dung được kiểm lại bằng `UploadInspection` (`budgets/attachment/budget-attachment-completion.service.ts:106-117`) |
| như trên | `sizeBytes` | **ĐỔI** `min(0)` → `min(1)` | Request cho phép 0 nhưng response khai `positive()` (`budget-attachment.dto.ts:3-6` so với 21) |
| `budgetAttachmentComplete`, `budgetVersionAttachmentRemove`, `budgetAttachmentDiscard`, `budgetAttachmentLink` | chỉ có path | **GIỮ** | Vai khớp `QĐ-93j(3)` |

**Bảng tổng hợp các trường THIẾU (7 nhóm):**
1. `reserveConfirmations[]`, hoặc endpoint xác nhận dự phòng có `reason`.
2. `supplement.termMonths`.
3. `lines[].lineType`.
4. `lines[].zbbJustification`.
5. `lines[].priorityRank`.
6. `version.reserveReason`.
7. Tham số `BUDGET_RESERVE_DEFAULT_PERCENT` và hai ngưỡng ZBB (mục 2.13).

### 2.12 `budgetCommitmentRelease` — Finance giải phóng phần dư

| Trường | Logic | Kết luận | Căn cứ |
| --- | --- | --- | --- |
| `reason` | `budgets/commitment/commitment.service.ts:71-80`; chỉ khi Request đã kết thúc (`requests/spend/commitment-release.listener.ts`) | **GIỮ** | `QĐ-83a`, `QĐ-84g` PD:383, `FR-5.8`(2)(3) |

### 2.13 `operating-parameters`, `reporting-currency`

| Op | Trường | Vai theo QĐ | Guard | Kết luận | Căn cứ |
| --- | --- | --- | --- | --- | --- |
| `operatingParameterSet` | path `key` | Super Admin, **trừ tham số của Finance** | `SUPER_ADMIN` (`operating-parameters.controller.ts:118-120`) | **GIỮ** | `FR-8.2` |
| như trên | `value` (`z.unknown()`, OpenAPI hiện `?`) | — | — | **ĐỔI**: khai `oneOf integer \| string enum \| integer[]` trong OpenAPI, giữ kiểm theo từng key | API-design: kiểu tường minh |
| như trên | *(vai cho key Finance)* | **Finance** cấu hình `dự phòng mặc định %` và ngưỡng ZBB (`KPI-3` < 70 %, đơn giá tăng > 10 %) | không key nào tồn tại (`parameter-definitions.policy.ts:78-304`) | **CHUYỂN BƯỚC (vai)** + **THIẾU key**. Đề xuất nhỏ nhất: thêm `owner: 'FINANCE'` vào definition, cho `FINANCE` PUT/GET các key mình sở hữu, Super Admin vẫn đọc | `QĐ-100k` PD:414, `FR-8.2` *"Tham số của Finance … không phải Super Admin"*, `US-06-09` AC-30 |
| `nonWorkingDateAdd` | `date`, `reason` (= tên ngày nghỉ; service đã trim, kiểm rỗng ở `non-working-dates.service.ts:128-131`) | Super Admin | khớp | **GIỮ** | Lịch SLA (`FR-8.2`) |
| `nonWorkingDateRename` | `reason` | như trên | khớp | **GIỮ** | — |
| `nonWorkingDateRemove` | path `date` | như trên | khớp | **GIỮ** | — |
| `reportingCurrencySet` | `currency` | Super Admin | khớp | **GIỮ** | `QĐ-42c` PD:462 |

`FISCAL_YEAR_START_MONTH` (Super Admin, khóa khi đã có phiên bản) khớp `QĐ-82l(23)`.

### 2.14 `exchangeRateRecord` — Finance ghi tỷ giá

| Trường | Kết luận | Căn cứ |
| --- | --- | --- |
| `currency`, `rateDate`, `rate` (chuỗi thập phân) | **GIỮ** | `FR-1.6`, `FR-5.6`, `QĐ-42b`; guard `FINANCE` khớp |

---

## 3. Nghi vấn logic (client gửi mà server tin; luật sai; vai sai)

| # | Nghi vấn | Bằng chứng | Căn cứ đúng | Mức |
| --- | --- | --- | --- | --- |
| L1 | **Kiểm tra ngân sách vẫn theo mô hình cũ.** (a) So với **tổng** (cơ sở + dự phòng), không có hai mức *trong số cơ sở / dùng dự phòng*. (b) `HIGH_VALUE`, `INSUFFICIENT_BUDGET`, `NO_ACTIVE_BUDGET`, `PLAN_LINE_OVERDUE` → `FINANCE_REVIEW`. (c) Người duyệt chi được **override để duyệt vượt ngân sách**. Hệ quả: Request vượt cả dự phòng vẫn được duyệt và tạo cam kết | `requests/spend/budget-check.policy.ts:117-148`; `spend/spend-decision.policy.ts:57-80`; `spend-submission/spend-batch.service.ts:101-120` | `QĐ-97c` PD:400, `QĐ-97f`, `QĐ-97g`, `FR-3.20` | **Critical** (nghiệp vụ, demo) |
| L2 | **Năm ngân sách và lịch trả do client quyết** qua `expectedSpendOn` (Employee/need-decision/supplement). Chọn ngày sang năm sau thì kiểm theo năm khác hoặc né năm đã cạn | `access-request/pricing.policy.ts:60-77`; `access-request/request-facts.service.ts:192`; `spend-submission/supplement-pricing.service.ts` | `QĐ-98a` PD:403 (thời hạn tính từ ngày duyệt chi), `QĐ-100n` PD:415 (năm tạm tính theo ngày trình, tính lại khi duyệt) | **Critical** |
| L3 | **Cộng thuế ước tính không được khấu trừ vào số tiền kiểm.** Số được kiểm lớn hơn giá gốc nên có thể chặn sai | `spend/budget-check.service.ts:186-205` (`estimateTaxMany` → `estimatedCostMinor`) | `QĐ-97d` PD:401, `FR-5.13`(2) (*không cộng thuế ước tính*) | High |
| L4 | **Phần còn lại không trừ Request đang chờ duyệt chi**: `pendingMinor` chỉ để hiển thị. Hai Request song song đều thấy "còn đủ" | `budget-check.policy.ts:117` (`remaining = total − held − spent`) | `QĐ-82b` PD:368, `QĐ-82l(1)` PD:372, `FR-3.20` | High |
| L5 | **Dự phòng nhập tự do, không có mặc định 10 % hay lý do.** FE gửi 0. Duyệt phiên bản không kiểm sàn cam kết chuyển tiếp | `budgets/version/version-figures.service.ts:35-36`; FE `budget-proposal-detail.tsx:55`; `version-decision-judge.service.ts:36-69` | `QĐ-100h`, `QĐ-100k`, `QĐ-98b`, `US-06-09` AC-30/32 | High |
| L6 | **Phần năm sau khi năm sau chưa có ngân sách bị coi là `NO_ACTIVE_BUDGET`** (→ Finance/override) thay vì là cam kết chuyển tiếp không kiểm | `budget-check.service.ts:86-91,125` (mọi năm binding đều kiểm); `budget-check.policy.ts:99-110` | `QĐ-98a`, `QĐ-82l(3)`, `FR-5.8b`(1) | High |
| L7 | **Ngân sách đã duyệt vẫn đổi được giữa năm** qua `budgetVersionRevise` và `budgetVersionLineWindow`; còn trạng thái `SUPERSEDED` | `version-revision.service.ts`, `version-window.service.ts:57` | `QĐ-97b` PD:399 | High |
| L8 | **Không có phần chi phí tăng thêm khi có seat trống** (`QĐ-99d`), không có nhánh *phần tiền mới = 0* (`QĐ-99l`). Server luôn tính đơn giá × số người × số kỳ | `pricing.policy.ts:62-90`; grep `avoided\|incremental` không có kết quả | `QĐ-99c`, `QĐ-99d`, `QĐ-99l` | High (A1/A3) |
| L9 | **`stillNeeded` chặn việc gắn dòng kế hoạch quá khoảng mua (409)**, và `PLAN_LINE_OVERDUE` rẽ sang Finance, trong khi gắn dòng chỉ là thông tin | `spend-submission.policy.ts:23-32`; `budget-check.policy.ts:141-147` | `QĐ-82d(4)`, `QĐ-82l(5)` | Medium |
| L10 | **`proposal.costCenterId` client gửi chỉ để bị so; `amount.currency` bắt buộc bằng đồng tiền báo cáo mà trưởng phòng không đọc được.** Form BM-10 thật sẽ vấp 422 nếu đoán sai tiền tệ | `proposal-sender.service.ts:56-58,137`; `reporting-currency.controller.ts:52` (chỉ Super Admin) | `FR-5.15`(1) | Medium |
| L11 | **Không có thao tác xác nhận dùng dự phòng** cho trưởng phòng; không có cờ/lý do *dùng dự phòng* trên bước duyệt chi | `spend-submission.dto.ts:24-31`; `spend-approval.dto.ts:101-123` | `QĐ-100u`, `FR-3.21`, `US-06-16` | High |
| L12 | Response `noIndependentReview` và `REVIEWER_IS_APPROVER` mô hình hóa SoD giữa Finance rà soát và Người duyệt chi. Nay `SoD-8` chỉ áp cho phiên bản ngân sách | `spend-approval.dto.ts:120-121,198`; `finance-review.dto.ts:103-104` | `QĐ-29b` (*`SoD-8` chỉ còn áp cho phiên bản ngân sách*) | Low |

## 4. Response: thiếu phạm vi hoặc thừa trường của khái niệm đã bỏ

Không thấy response nào **lộ** số ngân sách vượt phạm vi vai: `SpendViewService.requireReader` chỉ cho Finance hoặc người giữ bước (`requests/finance-review/spend-view.service.ts:132-138`); `ProposalViewService` lọc theo Cost Center (`budgets/proposal/proposal-view.service.ts:64-73`); lô chỉ người trình hoặc người duyệt đọc. Vấn đề ngược lại là **thiếu dữ liệu** mà `QĐ-100p` yêu cầu, cộng nhiều trường của khái niệm đã bỏ.

| Response | Trường | Kết luận | Căn cứ |
| --- | --- | --- | --- |
| `budgetMine` (`budget.dto.ts:311-321`, comment *"never what is left"*) | thiếu `base`, `reserve`, `held`, `spent`, `remainingWithinBase`, `remainingWithReserve`, `carryForward` | **THIẾU** | `QĐ-100p` PD:416, `US-06-10` AC-7, `FR-5.15`(6) |
| `budgetMineVersionList` (`:336-342`) | thiếu `total` (số tiền) | **THIẾU** | `QĐ-100p` (*kèm số tiền*), `QĐ-93j(3)` |
| `spendQueueList` (`spend-submission.dto.ts:73-104`) | `stage: RETURNED_BY_FINANCE`, `financeReturnReason`, `expectedSpendOn` | **BỎ** | `QĐ-97c`, `QĐ-98a` |
| như trên | thêm `stage: RESERVE_CONFIRMATION_REQUIRED \| RETURNED_AT_DECISION`, `blockedReason` thêm `OVER_RESERVE`/`NO_ACTIVE_BUDGET`, `overBaseBy`, `overReserveBy` | **THIẾU** | `QĐ-97c`, `QĐ-100p`, `US-06-16` |
| `budgetCheckGet` / `budgetCheckYearList` (`finance-review.dto.ts:86-155`) | `route: FINANCE_REVIEW`; `trigger: PLAN_LINE_MOVED, FINANCE_OUTCOME_WHILE_WAITING`; `planLineOverdue`; `noIndependentReview`; mã `HIGH_VALUE`/`PLAN_LINE_OVERDUE`; `shareBasisPoints`; `year.overridden` | **BỎ** | `QĐ-97c`, `QĐ-82d(4)` |
| như trên | `budget` → tách `base`/`reserve`; thêm `remainingWithinBase`, `remainingWithReserve`, `result` (`WITHIN_BASE`/`NEEDS_RESERVE`/`BLOCKED`), `reserveConfirmation {by, at, reason}`, phần `carryForward` | **THIẾU** | `FR-3.14`(1), `FR-3.20` |
| như trên — vai đọc | hiện chỉ Finance và người giữ bước | **THIẾU vai**: người yêu cầu (kết quả, lý do, phần vượt **của Request**) và trưởng phòng (đủ số của phòng) | `FR-3.20` (*Người yêu cầu và trưởng phòng thấy kết quả…*), `QĐ-100p` |
| `spendApprovalGet`/`List` (`spend-approval.dto.ts:94-179`) | `decision.overrideReason`, `decision.bySubstitute`, `noIndependentReview`, `latestBudgetInformation`, `request.expectedSpendOn`, mã `HIGH_VALUE`/`PLAN_LINE_OVERDUE` | **BỎ** | `QĐ-97c`, `QĐ-93d`, `QĐ-29b`, `QĐ-98a` |
| như trên | thêm `reserveUsed` + `reserveReason` cạnh cờ; snapshot cơ sở/dự phòng | **THIẾU** | `QĐ-100u`, `FR-3.14`(1) |
| `budgetVersionGet`/`List` (`budget.dto.ts:235-287`) | `kind` (`REVISION`), `basedOnVersionId`, `previousTotal`, `highValuePercent`, `highValueAmount`, `reason` (lý do revision), trạng thái `SUPERSEDED` (cả trong query `state`) | **BỎ** | `QĐ-97b`, `QĐ-97c` |
| như trên | thêm `reserveReason`, `reserveDefaultPercent`, `carryForwardTotal`, `belowCarryForward` | **THIẾU** | `QĐ-100h`, `QĐ-98b` |
| `budgetVersionLineList` · `overdue` | **GIỮ** với nghĩa nhãn *quá khoảng mua* | `FR-5.15`(5) |
| `budgetTable` (Finance) | thiếu tách `base`/`reserve`, `carryForward`, `pending`. Người duyệt chi không đọc được bảng (theo `FR-5.15`(6) *Finance và Người duyệt chi thấy toàn bộ*) | **THIẾU** | `FR-5.15`(6), `FR-5.16`(4) |
| `budgetCommitmentList` · `unattachedReason: NO_BUDGET` | **GIỮ** (đây là cam kết chuyển tiếp chưa gắn) | `QĐ-30b`, `FR-5.8b` |

## 5. Operation thiếu (ghi để B-LEDGER gộp với A1)

- Phong bì và chỉ tiêu phòng (B2/B3), gói baseline B1 và gói tổng hợp B5/B6 (`US-06-15`, `FR-5.16`): BE chưa có operation nào.
- Xác nhận dùng dự phòng (Q2).
- Trưởng phòng rút Request trong hàng đợi kèm lý do (`US-06-14` AC-14): thuộc phạm vi V1/A2, cần kiểm có hay chưa.
- `spendApprovalLineDecide` (tag `group-requests`, V1) cũng có `override` (inventory dòng 1684-1686; FE `spend-decision-form.tsx:140`) → **BỎ**, cùng căn cứ mục 2.5.
- Need-decision `spend.expectedSpendOn` và `spend.planLine.stillNeeded` (V1, inventory dòng 107-109, 1667-1669) → **BỎ**, cùng căn cứ mục 2.3/2.4.

## 6. Câu hỏi cho Owner (mỗi câu một trường/nhóm trường)

**Q1 — `budgetVersion.base`: Finance nhập tự do hay server tính từ dòng?**
- *Bối cảnh:* Hiện `base` là số Finance gõ, không liên hệ với các dòng phiên bản mà Finance đã điều chỉnh có lý do. Ví dụ: đề xuất 70tr (Figma 50tr + Miro 20tr); Finance chỉnh Figma xuống 40tr ⟹ Σ dòng = 60tr, nhưng có thể nhập `base` = 55tr và không ai thấy lệch. BRD muốn *"truy ngược vì sao 100tr thành 130tr"* (`FR-5.15`, *Lý do*).
- *Thực tế:* phần mềm ngân sách thường cộng ngân sách từ budget line. Coupa nạp ngân sách theo dòng (`Amount`) và tính *remaining* trên dòng ([Coupa budget line import](https://compass.coupa.com/en-us/products/product-documentation/integration-docs/coupa-core-flat-files-(csv)/flat-file-(csv)-import/budget-line-import)). Nhận định này mang tính khái quát, chưa kiểm chứng ở Adaptive Planning hay Vertice.
- *Phương án:*
  - **A.** Giữ nhập tự do, response hiện `linesTotal` và độ lệch. Ít sửa nhất, nhưng vẫn có thể lệch.
  - **B.** `base` = Σ dòng của phiên bản, server tính, bỏ khỏi input. Truy vết trọn vẹn; muốn đổi `base` thì sửa dòng (có lý do).
  - **C.** Nhập tự do nhưng phải bằng Σ dòng, lệch thì 422 khi gửi. An toàn nhưng nhập hai lần.
- *Khuyến nghị:* **B**. Phụ thuộc: mục 2.10 (`base`), L5.

**Q2 — Hình dạng API xác nhận dùng dự phòng (`reserveConfirmations` / endpoint riêng)**
- *Bối cảnh:* `FR-3.21` nói xác nhận *"từng mục trong cùng thao tác"* trình lô, nhưng trưởng phòng chỉ biết mục nào cần dự phòng **sau** khi hệ thống kiểm. `US-06-16` AC-6 còn có ca Request bị trả về lúc duyệt rồi trưởng phòng xác nhận, không trình lại cả lô.
- *Thực tế:* SAP Availability Control có nhiều mức dung sai — cảnh báo, cảnh báo kèm mail, lỗi chặn ([SAP Help — Tolerance Limits](https://help.sap.com/saphelp_46c/helpdata/en/06/0ea837a703934de10000009b38f8cf/content.htm)). Infor SunSystems cho phép tới *còn lại + dung sai* ([Infor budget checking](https://docs.infor.com/ss/6.3.x/en-us/ssolh/fav1467045032921.html)). Mức dung sai giống *dự phòng*; ở các hệ đó, việc chấp nhận vượt diễn ra ở bước xử lý riêng của người có trách nhiệm.
- *Phương án:*
  - **A.** Chỉ endpoint riêng `POST /access-requests/{id}/reserve-confirmation {reason}` cho Request đang `RESERVE_CONFIRMATION_REQUIRED`. Đơn giản, phủ cả ca trả về lúc duyệt.
  - **B.** Chỉ `spendBatchSubmit.reserveConfirmations[{requestId, reason}]` xác nhận trước. FE phải xem trước kết quả kiểm; không phủ ca trả về.
  - **C.** Cả hai: batch nhận xác nhận trước (chỉ áp nếu kết quả là dự phòng), cộng endpoint riêng.
- *Khuyến nghị:* **A** cho MVP. **C** nếu FE muốn đúng câu chữ *"cùng thao tác"*. Phụ thuộc: mục 2.2, L11.

**Q3 — Trường của hồ sơ bổ sung `accessRequestSupplementAdd`**
- *Bối cảnh:* `FR-3.21` liệt kê *"giảm số lượng, sửa phạm vi, người thụ hưởng, thời hạn hoặc dòng kế hoạch"*; `US-06-16` liệt kê *"giảm số lượng, thời hạn, số người"*. Hiện API chỉ có `expectedSpendOn` (phải bỏ) và `dropEmployeeIds`. Chưa rõ *sửa phạm vi* có gồm đổi sang gói rẻ hơn hay không; đổi gói không thuộc MVP (`QĐ-90d`).
- *Phương án:*
  - **A.** `dropEmployeeIds` + `termMonths` (chỉ giảm) + `reason`; dòng kế hoạch đổi qua `accessRequestPlanLineSet`.
  - **B.** Như A, thêm `planId` (đổi sang gói khác cùng ứng dụng). Mở luồng đổi gói vốn không thuộc MVP.
  - **C.** Chỉ `dropEmployeeIds`. Không đáp ứng *giảm thời hạn*.
- *Khuyến nghị:* **A**. Phụ thuộc: mục 2.4.

**Q4 — `lines[].amount` của BM-10: trưởng phòng nhập hay server tính/gợi ý?**
- *Bối cảnh:* Dòng có `planId` + `seats` + `servicePeriodMonths` thì server biết đơn giá gói, nên tính được ước lượng. Dòng phần mềm mới thì không. Ví dụ: Figma Org 10 seat × 12 tháng × 45 USD; trưởng phòng gõ 50tr, server tính ra 47tr.
- *Thực tế:* các nền tảng SaaS management (Vertice, Zylo) dựng baseline gia hạn từ dữ liệu hợp đồng để người dùng sửa. Đây là hiểu biết chung, **chưa kiểm chứng nguồn** trong lượt này.
- *Phương án:*
  - **A.** Giữ nhập tay (hiện tại).
  - **B.** Server tính khi có `planId` và bỏ khỏi input; chỉ nhập cho phần mềm mới. Mất khả năng ghi giá đàm phán dự kiến.
  - **C.** Server trả `suggestedAmount` (theo giá gói × seat × kỳ) trong response/preview, trưởng phòng vẫn nhập, response gắn cờ lệch.
- *Khuyến nghị:* **C**. Phụ thuộc: mục 2.8.

**Q5 — Dữ liệu cũ của khái niệm đã bỏ (phiên bản `REVISION`/`SUPERSEDED`, `RequestFinanceReview`, `BudgetInformationRequest`, `SpendDecision.override*`, `BudgetVersionLineChange`, `planLineConfirmed`, `expectedSpendOn`)**
- *Bối cảnh:* Bỏ endpoint thì bảng, cột và enum vẫn còn trong DB và seed/demo. Ví dụ: seed có phiên bản sửa đổi `SUPERSEDED` hoặc Request đang `AWAITING_FINANCE_REVIEW` thì sau khi đổi code sẽ kẹt trạng thái.
- *Phương án:*
  - **A.** Migration xóa cột/bảng/enum và reset seed. Sạch, phù hợp vì chưa có dữ liệu thật.
  - **B.** Giữ cột chỉ đọc làm lịch sử, ẩn khỏi API mới. An toàn nhưng còn nợ.
  - **C.** Chuyển trạng thái treo (`AWAITING_FINANCE_REVIEW` → về hàng đợi trưởng phòng), rồi xóa ở lượt sau.
- *Khuyến nghị:* **A**, kèm bước C trong cùng migration cho Request đang treo. Phụ thuộc: mục 2.1, 2.5, 2.7, 2.10, mục 7.

**Q6 — `repeatCycle` có giữ giá trị `QUARTERLY`?**
- *Bối cảnh:* BRD `FR-5.15`(1) ghi chu kỳ lặp *"một lần · tháng · năm"*; BE có thêm `QUARTERLY` và catalog cũng có chu kỳ quý (`access-request.dto.ts:150`).
- *Phương án:*
  - **A.** Giữ `QUARTERLY`, BRD bổ sung *quý*.
  - **B.** Bỏ `QUARTERLY` cho khớp BRD.
- *Khuyến nghị:* **A**. Rủi ro thấp, nhất quán với catalog. Phụ thuộc: mục 2.8, 2.10.

*Không hỏi các điểm sau vì tài liệu đã rõ:* năm của Request (`QĐ-100n`), bỏ override/Finance rà soát/hỏi Finance/ngưỡng giá trị cao/phiên bản sửa đổi, vai Finance cho tham số dự phòng (`QĐ-100k`), quyền xem của trưởng phòng (`QĐ-100p`), không cộng thuế ước tính (`FR-5.13`(2)), `costCenterId` server tính (trưởng phòng chỉ đứng đầu một phòng — `headedCostCenter`).

## 7. Rủi ro / ghi chú cho pha spec

- **Migration:**
  - `prisma/models/budgets.prisma:122-141`: `kind`, `basedOnVersionId`, `highValuePercent`, `highValueAmountMinor`, `reason`; enum `SUPERSEDED`; bảng `BudgetVersionLineChange` (208-216).
  - `prisma/models/requests.prisma`: `AccessRequest.expectedSpendOn` (161), `planLineConfirmed` (174); state `AWAITING_FINANCE_REVIEW` (51); step `FINANCE_REVIEW` (88); code `HIGH_VALUE` (558); `RequestFinanceReview` (630); `SpendDecision.overrideReason/overrideYears` (756-758); `RequestSupplement.before/afterExpectedSpendOn` (716-717); `BudgetInformationRequest` (774).
  - Thêm cột: `BudgetVersion.reserveReason`; bản ghi xác nhận dự phòng (người, thời điểm, snapshot, lý do) gắn với bước/kiểm; dòng BM-10 `lineType`, `priorityRank`, `zbb*`.
- **Thứ tự sửa đề xuất:**
  1. Logic kiểm ngân sách (L1, L3, L4, L6) cộng nguồn năm (L2).
  2. Xác nhận dự phòng (L11).
  3. Gỡ endpoint Finance rà soát/hỏi Finance/override/revision/window.
  4. Dự phòng mặc định và tham số Finance (L5).
  5. Response theo `QĐ-100p`.
- Mục 1 đụng `access-request/pricing.policy.ts`, vốn dùng chung với V1/A2 (need-decision, Request intake); cần phối hợp.
- **FE bị ảnh hưởng thật** (đang gọi API):
  - `finance/budget-check/**` và `finance/budget-questions/**`: xóa.
  - `finance/annual-budget/components/{budget-version-form, budget-proposal-detail, budget-line-window-form, budget-line-history}.tsx`.
  - `approvals/queue/components/{spend-decision-form, spend-finance-panel}.tsx`.
  - `approvals/annual-budget/components/{approval-annual-budget-detail, approval-annual-budget-history}.tsx` (`highValue*`).
  - `approvals/need/components/need-decision-form.tsx` (`expectedSpendOn`, `stillNeeded`; V1).
  - Màn hình Manager (`annual-budget`, `weekly-batch`) đang **mock**, nên đổi API không làm vỡ.
- **Tài liệu FE cần cập nhật:** `Docs/Figma UI-UX/API-Integration/{flows/paid-access-request.md, roles/finance.md, roles/spending-approver.md, roles/manager.md, reference/spend-and-finance-review.md, reference/budgets.md}`.
- **Test bị ảnh hưởng (chưa chạy, chỉ dự kiến):** spec của `budget-check.policy`, `spend-decision.policy`, `spend-submission.policy`, `version-*`, `finance-review/*`, `budget-information/*`; integration `test/integration/budgets/`. FE: `finance-spend-api.test.tsx`, `finance-questions-api.test.tsx`, `batch-api.test.tsx`, `annual-budget-api.test.tsx`.
- **Seed/demo:** cần kịch bản đủ 3 kết quả (trong số cơ sở / dùng dự phòng có lý do / bị chặn), phiên bản có dự phòng mặc định 10 %, và một cam kết chuyển tiếp làm sàn.

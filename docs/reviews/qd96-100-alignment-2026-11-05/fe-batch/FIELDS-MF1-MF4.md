# FIELDS-MF1-MF4 — input/output từng API của MF-1 và MF-4 theo vai (05/11/2026)

> Read-only. BE HEAD `808318a4` (working tree `src/` không đổi so với HEAD; `git diff 3e4553b9 808318a4` không chạm DTO/controller
> `requests`/`budgets`/`licensing`, chỉ thêm `requests-ai-source.api.ts` + refactor `spend-step.repo.ts` ⟹ dòng của V1/V2 buổi sáng còn đúng,
> đã đọc lại các DTO bên dưới). Spec `qd96-100-*` đọc lúc **14:01–14:11** (đang được agent khác sửa; spec có file ≠ đã implement).

**Skill đã đọc/dùng:** `agent-skills:spec-driven-development` (process — tách vấn đề/contract/AC khi so spec), `agent-skills:api-and-interface-design`
(domain — tách input/output, field server tự tính, strict 422), `agent-skills:code-review-and-quality` (review — đọc DTO→controller→service/policy, xếp
mức), `superpowers:verification-before-completion` (mọi kết luận có `file:dòng` đã mở; số đếm lấy bằng grep trên chính file này).

**Nguồn nghiệp vụ:** sổ QĐ §3.5, §3.8, `QĐ-100t…100ai`, `QĐ-101` (chỉ MF-5/hợp đồng, không đổi MF-1/MF-4); QUESTIONS mục B (S-01, S-14…S-17,
S-19, S-23) + mục D (Q-01 B, Q-03 a1–d1, Q-08 C); review Docs `README.md` (F01–F24) + `CURRENT-API-INPUTS.md`. `QĐ-100l`/`QĐ-100ah` chờ mentor ⟹ giữ
hành vi hiện tại (trưởng phòng vẫn tự gửi Request cá nhân, preview `HEAD_ASKS_FOR_SELF`).

**Quy ước.** Tiền tố đường dẫn: `R/`=`src/modules/requests/`, `B/`=`src/modules/budgets/`, `L/`=`src/modules/licensing/`. Vai: E Employee, H trưởng phòng
hiện hành của phòng Request, SA Người duyệt chi, IT IT Admin, FIN Finance, SAD Super Admin. Verdict: **KEEP-in** (người dùng nhập đúng vai/bước) ·
**KEEP-tech** (định danh/khóa/phân trang, giải thích ngắn) · **DROP-derive** (BE tự suy/tính) · **DROP-obsolete** (luật đã bỏ) · **WRONG-ROLE** ·
**WRONG-STEP** · **RESHAPE** (đổi kiểu/khoảng/tên) · **ADD** (thiếu, phải thêm — không tính là field hiện có). Mọi DTO là `z.strictObject` ⟹ field bỏ gửi lên
phải ra 422 `VALIDATION_ERROR`. Header chung: chỉ `Authorization: Bearer` — **KEEP-tech**, vai/`employeeId`/phòng đều lấy từ token; không op nào
MF-1/MF-4 có `Idempotency-Key`/`previewVersion`, chống trùng dựa trạng thái (`STEP_NOT_PENDING`, `NOT_IN_QUEUE`).

Phạm vi: **119 operation** = 65 MF-1 (mục MF-1 của `CURRENT-API-INPUTS.md`) + 37 MF-4 + 17 hỗ trợ của bảng bước MF-1 (requestable ×4, provisioning ×10,
`seat-usage`, `license-assignments` GET, `me/software-rights`).

## 1. MF-1 — gửi Request (bước 1.1)

| Op | Field | Ai biết/cung cấp | BE suy/tính/kiểm thay? | Verdict | Bằng chứng | Căn cứ |
| --- | --- | --- | --- | --- | --- | --- |
| `accessRequestSubmit` POST /access-requests | `planId` | E (chính người cần, QĐ-100t; H tự xin giữ tạm QĐ-100l) chọn từ requestable | kiểm gói/nhánh/giá | KEEP-in | `R/access-request/access-request.dto.ts:17` | FR-3.2, BM-01 |
| 〃 | `businessReason` | E | — | KEEP-in | `:18` | BM-01 |
| 〃 | `termMonths` | E (thời gian cần) | hiện 1..120 (`:9,19`) | RESHAPE 1..12 + luật linh hoạt ≤ 31/12 (422) | `:9,19` | QĐ-98a, QĐ-99g |
| 〃 | `expectedSpendOn` | không ai | BE **tin** ngày này chọn năm + lịch trả | DROP-obsolete | `:21`; `R/access-request/request-facts.service.ts:246`; `pricing.policy.ts:60,72` | QĐ-98a, QĐ-100n, QĐ-82e |
| `accessRequestPreview` POST …/preview | `planId`, `termMonths`, `expectedSpendOn` | E | như trên | KEEP-in · RESHAPE · DROP-obsolete | `R/request-submission/request-preview.dto.ts:11-15` | như trên |
| `groupRequestCheck`/`groupRequestSubmit` POST /group-requests[/check] | `planId` | E/H | chỉ K2 trả phí | KEEP-in | `R/group-request/group-request.dto.ts:29` | QĐ-82h |
| 〃 | `lines[]` (số dòng) | E/H | DTO `min(1)`, không luật ≥2 | RESHAPE (≥2 người khác nhau, 422 `TOO_FEW_LINES`) | `:30-33` | QĐ-100t, QĐ-100aa, S-01 |
| 〃 | `lines[].employeeId` | E/H chọn từ `groupRequestCandidateList` | kiểm cùng phòng/đủ điều kiện | KEEP-in | `:31`; candidate chỉ tên+email `:80` | QĐ-82l(18) |
| 〃 | `lines[].expectedEndDate` | người gửi **không** biết hợp đồng đồng nghiệp | BE bắt cho CONTRACTOR/INTERN (lộ loại HĐ), chuyển thẳng vào Assignment | DROP-derive (ngày duyệt chi + term −1, min ngày hết HĐ do SAD ghi) | `:31`; `R/group-request/beneficiary-eligibility.policy.ts:45-49`; `R/grant/grant.policy.ts:117` | Q-03 a1+b1+c1, QĐ-98a |
| 〃 | `businessReason` | E/H | — | KEEP-in | `:34` | BM-01 |
| 〃 | `termMonths` | E/H | 1..120 | RESHAPE 1..12 | `:35` | QĐ-98a |
| 〃 | `expectedSpendOn` | không ai | dùng chọn năm | DROP-obsolete | `:36` | QĐ-98a, QĐ-100n |
| 〃 | `termConfirmation.reason` | không còn nghĩa | — | DROP-obsolete | `:37` | QĐ-98a (trần 12) |
| `accessRequestRenewalSubmit` POST …/renewals | (người gửi) | chỉ người giữ quyền | policy cho H gửi hộ 1 người + tự áp | WRONG-ROLE (403 `NOT_HOLDER`) | `R/renewal-request/renewal-request.policy.ts:39-50`; `renewal-request-writer.service.ts:93-99` | QĐ-100t, QĐ-62h |
| 〃 | `assignmentId` | người giữ | khóa seat/kiểm chủ | KEEP-tech (định danh quyền đang giữ) | `renewal-request.dto.ts:16` | FR-3.22 |
| 〃 | `newExpectedEndDate` | người giữ biết "dùng thêm bao lâu", không phải ngày | term = monthsBetween; trần 120 | RESHAPE → `extensionMonths` 1..12; ngày mới BE tính từ `previousEnd+1` | `:17`; writer `:58-60` | QĐ-98a(1), S-02 |
| 〃 | `businessReason` | người giữ | — | KEEP-in | `:18` | BM-01 |
| 〃 | `expectedSpendOn` · `termConfirmation` | không ai | lịch trả từ ngày client | DROP-obsolete ×2 | `:20,21`; writer `:61-71` | QĐ-98a |
| `accessRequestPropose` POST …/proposals (BM-02) | `softwareName`, `homepageUrl`, `purpose`, `dataDescription`, `expectedUsers` | E | `expectedUsers` chỉ để IT xem, giá theo người thụ hưởng | KEEP-in ×5 | `R/assessment/assessment.dto.ts:31-38` | BM-02, FR-3.4(c) |
| 〃 | `termMonths` / `expectedSpendOn` | E / không ai | — | RESHAPE 1..12 / DROP-obsolete | `:39` / `:40` | QĐ-98a |
| `accessRequestServiceAccountSubmit` | `planId`, `purpose`, `expectedIdentifier`, `businessReason` | E chịu trách nhiệm | người chịu trách nhiệm = người gửi (BE) | KEEP-in ×4 | `R/service-account-request/service-account-request.dto.ts:15-18` | QĐ-77h, QĐ-75c |
| 〃 | `termMonths` / `expectedSpendOn` | E / không ai | — | RESHAPE 1..12 / DROP-obsolete | `:19` / `:21` | QĐ-98a |
| `accessRequestDraftSave` POST …/drafts | `kind` | người soạn | chọn schema | KEEP-tech (discriminator 3 biến thể) | `R/draft/request-draft.dto.ts:16-20` | QĐ-87g |
| 〃 | trường từng biến thể | — | — | theo op gốc (3 biến thể ở trên); codec nháp cũ phải bỏ khóa đã DROP | `:17-19` | — |
| `accessRequestDraftSubmit` / `…DraftDelete` | `path.id`; body `{}` | người soạn | gửi lại nội dung đã lưu, chạy lại mọi cổng | KEEP-tech | `:29` | — |
| `delegatedRequestSend` POST /delegated-requests | `beneficiaryEmployeeIds`, `items[].planId`, `items[].expectedSpendOn`, `businessReason`, `termMonths`, `expectedEndDate`, `termConfirmation.reason` | không còn vai (gửi thay 1 người bị cấm) | — | DROP-obsolete ×7 (gỡ route) | `R/delegated-request/delegated-request.dto.ts:17-56` | QĐ-100t (thay vế gửi thay QĐ-99a/62a) |

## 2. MF-1 — nhu cầu, dòng kế hoạch (1.2) và đánh giá IT (1.3)

| Op | Field | Ai | BE thay? | Verdict | Bằng chứng | Căn cứ |
| --- | --- | --- | --- | --- | --- | --- |
| `accessRequestNeedDecide` POST …/{id}/need-decision | `path.id` | H được giao (SA cho phần của H — QĐ-100l) | `NOT_THE_ASSIGNEE`, `OWN_REQUEST` | KEEP-tech | `R/access-request/need-decision.policy.ts:39-48` | QĐ-52c |
| 〃 | `decision` · `reason` | H | REJECT bắt lý do | KEEP-in ×2 | `access-request.dto.ts:60-61,77-79` | QĐ-53a |
| 〃 | `termConfirmation.reason` | — | `TERM_CONFIRMATION_REQUIRED` >12 | DROP-obsolete | `:62` | QĐ-98a |
| 〃 | `spend.planLine.position` | H chọn từ `…/plan-line-suggestions` (FE không gõ số) | BE tra `(version, position)`; không có id dòng riêng | KEEP-tech (khóa dòng phiên bản) | `:30`; `R/plan-line/plan-line.service.ts:40-43` | QĐ-82l(5) |
| 〃 | `spend.planLine.stillNeeded` | H | chặn 409 nếu dòng quá khoảng mua mà thiếu cờ | KEEP-in (S-23; chỉ bỏ `PLAN_LINE_OVERDUE` khỏi kết quả kiểm) | `:32`; `R/spend/spend-submission.policy.ts:29` | FR-3.3, US-05-04 AC-13 |
| 〃 | `spend.offPlan` | H | cờ thông tin | KEEP-in | `:35` | QĐ-82l(5) |
| 〃 | `spend.expectedSpendOn` | không ai | đổi giá + năm, audit `EXPECTED_SPEND_DATE_CHANGED` | DROP-obsolete | `:70`; `R/assessment/need-spend.service.ts:44-68` | QĐ-98a, QĐ-100n |
| `accessRequestLineNeedDecide` POST …/line-need-decisions | `lines[].employeeId` | H (SA cho dòng của H) | — | KEEP-tech (khóa dòng) | `R/group-request/group-decision.dto.ts:18,39` | QĐ-82h, QĐ-100ai |
| 〃 | `lines[].decision` · `lines[].reason` | H | REJECT bắt lý do | KEEP-in ×2 | `:19-28` | US-05-04 AC-14 |
| 〃 | `termConfirmation.reason` | — | — | DROP-obsolete | `:40` | QĐ-98a |
| 〃 | `spend.planLine.position` / `.stillNeeded` / `spend.offPlan` | chỉ H (role MANAGER) | `need-decision.policy.ts:125` | KEEP-tech / KEEP-in / KEEP-in | `:41-48` | QĐ-82l(5) |
| 〃 | `spend.expectedSpendOn` | không ai | — | DROP-obsolete | `:44` | QĐ-98a |
| `accessRequestPlanLineSet` PUT …/plan-line | `planLine.position` · `planLine.stillNeeded` · `offPlan` | H hiện hành (BE suy phòng) | `SpendHeadService.departmentOf` | KEEP-tech · KEEP-in · KEEP-in | `R/spend/spend-submission.dto.ts:19-22`; `R/spend-submission/spend-head.service.ts:12-18` | QĐ-82l(5), S-14 |
| `accessRequestAssessmentSave` PUT …/assessment | `classification`, `vendorId`, `vendorName`, `plannedPlanName`, `provisioningType`, `adminConsole`, `memberExport`, `sso`, `termsSummary`, `memberUsageMethod`, `grantRevokeMethod`, `dataSensitivity`, `opinion{status,note}`, `equivalentPlanId`, `proposedBusinessOwnerEmployeeId`, `controlLevel`, `controlRiskNote` | IT (không Request của chính mình) | — | KEEP-in ×17 | `assessment.dto.ts:60-80` | QĐ-53c, FR-3.19 |
| 〃 | `quote{unitPrice, billingCycle, validFrom, validUntil, commitmentMonths, paymentFrequency, firstPaymentOn}` | IT (bằng chứng giá NCC) | `firstPaymentOn` fallback = `expectedSpendOn` | KEEP-in (đổi fallback → ngày duyệt chi; `commitmentMonths`/`paymentFrequency` cũng là nguồn xác định "linh hoạt" cho luật 31/12) | `:46-54,81`; `R/assessment/quote-pricing.policy.ts:74` | QĐ-97d, QĐ-99g, FR-3.20 |
| `…AssessmentReject` | `kind`, `reason`, `alternativePlanId`, `alternativeNote` | IT | — | KEEP-in ×4 | `:98-103` | QĐ-53c, QĐ-66l |
| `…InternalRegister` | `businessOwnerEmployeeId`, `softwareName`, `dataSensitivity`, `spend.quote` | IT | — | KEEP-in ×4 | `:109-114` | QĐ-50a |
| `…CatalogLink` | `planId` | IT | — | KEEP-in | `:91` | US-05-06 AC-8 |
| `…AssessmentComplete` | `path.id` | IT | — | KEEP-tech | — | — |
| `accessRequestServiceAccountReview` | `decision`, `reason` | IT khác (không tự xét) | — | KEEP-in ×2 | `service-account-request.dto.ts:25-38` | QĐ-75c |

## 3. MF-1 — trình lô, dự phòng, bổ sung (1.4–1.6) và duyệt chi (1.7)

| Op | Field | Ai | BE thay? | Verdict | Bằng chứng | Căn cứ |
| --- | --- | --- | --- | --- | --- | --- |
| `spendBatchSubmit` POST /spend-batches | `requestIds[]` | H hiện hành chọn mục trong hàng | kiểm cùng phòng/đang trong hàng; tiền/còn lại BE tính | KEEP-in | `spend-submission.dto.ts:24-31`; `R/spend-submission/spend-batch.service.ts:47-58` | QĐ-82j |
| 〃 | `reserveConfirmations[{requestId, reason}]` | H (một dòng lý do/mục) | chưa có; kiểm "vượt base còn trong reserve" do BE | **ADD** | không có trong `:24-31` | QĐ-97f, QĐ-100u, S-15 |
| `accessRequestSupplementAdd` POST …/supplements | `expectedSpendOn` | không ai | reprice năm/lịch | DROP-obsolete | `:36` | QĐ-98a |
| 〃 | `dropEmployeeIds[]` | H (chỉ bớt người nhóm) | reprice | KEEP-in | `:38-44` | QĐ-97f |
| 〃 | `reason` | H | — | KEEP-in | `:45` | FR-11.2 |
| 〃 | `termMonths` (chỉ giảm) | H | chưa có | **ADD** | — | QĐ-97f, S-16 |
| `spendApprovalDecide` POST …/spend-approval | `decision` · `reason` | SA giữ bước | kiểm lại ngân sách lúc duyệt | KEEP-in ×2 | `R/spend-approval-view/spend-approval.dto.ts:19-22` | QĐ-97g |
| 〃 | `override.reason` · `override.years[]` | không ai (years thậm chí phải gõ lại đúng năm BE biết) | `judgeApproval` cho duyệt vượt | DROP-obsolete ×2 | `:23-33`; `R/spend/spend-decision.policy.ts:58-80` | QĐ-97c |
| `spendApprovalLineDecide` POST …/line-spend-decisions | `lines[].employeeId` / `decision` / `reason` | SA | — | KEEP-tech / KEEP-in ×2 | `group-decision.dto.ts:73-75` | QĐ-66m |
| 〃 | `override.reason` · `override.years` | không ai | — | DROP-obsolete ×2 | `:76-86` | QĐ-97c |
| `spendBatchDecide` POST /spend-batches/{id}/decisions | `decision`, `requestIds`, `reason` | SA | kiểm lại từng mục theo thứ tự | KEEP-in ×3 | `spend-approval.dto.ts:57-78` | QĐ-82l(12) |
| `financeReviewComplete` POST …/finance-review | `outcome`, `opinion`, `direction`, `reason` | không vai (Finance rời đường Request) | — | DROP-obsolete ×4 (gỡ op) | `R/finance-review/finance-review.dto.ts:23-48`; controller `:104-105` | QĐ-97c, QĐ-29b |
| `budgetInformationAsk` / `…Answer` | `question` / `answer`, `note` | không vai | — | DROP-obsolete ×3 (gỡ op) | `R/budget-information/budget-information.dto.ts` | QĐ-29b |

## 4. MF-1 — rút/hủy/hoàn trả và IT cấp (1.9–1.10)

| Op | Field | Ai | BE thay? | Verdict | Bằng chứng | Căn cứ |
| --- | --- | --- | --- | --- | --- | --- |
| `accessRequestWithdraw` | `reason` (bắt buộc với H) | người yêu cầu/thụ hưởng; H ở chặng mình | — | KEEP-in | `access-request.dto.ts:311` | QĐ-82l(15), QĐ-77g |
| `accessRequestLineWithdraw` | `path.employeeId` / `reason` | như trên | — | KEEP-tech / KEEP-in | `group-decision.dto.ts:8` (withdrawBodySchema) | QĐ-82l(15) |
| `accessRequestCancelForDeparture` / `…LineCloseForDeparture` | `cause`, `note`, `evidence` | IT | BE kiểm thật đã nghỉ/đã chuyển | KEEP-in ×3 (mỗi op) | `R/cancellation/cancellation.dto.ts:16-35`; `cancellation.policy.ts:28` | QĐ-90b |
| `returnRequestSubmit` (BM-03) | `assignmentId` · `reason` | người giữ / H (không còn nhu cầu) | — | KEEP-tech · KEEP-in | `R/return-request/return-request.dto.ts:19-20` | BM-03 |
| 〃 | `fromRequestId` | không cần | chỉ nhận khi = `grantRequestId` của seat | DROP-derive | `:21`; `return-request.policy.ts:75` | (vệ sinh API) |
| `returnRequestHandoverConfirm` | `path.id` | người nhận bàn giao | — | KEEP-tech | — | QĐ-63a |
| `provisioningTaskGrant` POST /provisioning-tasks | `requestId` | IT (từ `grant-queue`) | đã duyệt đủ bước | KEEP-tech | `L/provisioning/provisioning.dto.ts:17` | QĐ-22 |
| 〃 | `subscriptionId` | IT chọn nguồn seat | hiện chặn thuê bao phòng khác | KEEP-in (mở cùng gói phòng khác + `seatSource` BE ghi — H2 hoãn) | `:18`; `L/assignment/assignment.service.ts:225` | S-19, QĐ-99e, QĐ-100y |
| 〃 | `accountIdentifier` | IT (alias cùng tên miền công ty) | mặc định email công việc, kiểm tên miền | KEEP-in (optional) | `:19`; `provisioning.policy.ts:124-128` | QĐ-54c |
| 〃 | `expectedEndDate` | IT **không** có thẩm quyền | writer `input ?? claimed` ⟹ IT ghi đè ngày đã duyệt | DROP-derive (422) | `:20`; `L/provisioning/tasks/provisioning-grant-writer.service.ts:78` | Q-03 c1, S-17, QĐ-98a |
| 〃 | `responsibleEmployeeId` | IT (chỉ tài khoản dịch vụ) | cùng phòng | KEEP-in | `:22` | QĐ-75c, Q-03 d1 |
| 〃 | `beneficiaryEmployeeId` | IT (dòng nhóm) | — | KEEP-tech (khóa dòng) | `:24` | QĐ-66m |
| `…/complete` · `…/report-failure` · `…/close-failed` | `evidence` · `reason` · `reason` | IT | policy bắt evidence (Manual) / lý do đóng | KEEP-in ×3 | `:26-30` | QĐ-90a, QĐ-62i |
| `…/claim`, `…/retry`, `…/hand-off` (`{}`), `…/cancel` | `path.id` | IT | — | KEEP-tech ×4 | `:29` | QĐ-62i, QĐ-77g |
| `stepCongestionIncidentRecord` | `holderEmployeeId`, `description` | SAD | — | KEEP-in ×2 | `R/sla/congestion.dto.ts:16-19` | QĐ-27 |

## 5. MF-1 — GET (query/path)

| Op (vai) | Query/path | Verdict |
| --- | --- | --- |
| `accessRequestGet`, `…Timings`, `…AssessmentGet`, `spendBatchGet`, `spendApprovalGet`, `returnRequestGet`, `budgetCheckGet`, `requestable-*/{id}` ×2, `provisioningTaskGet` | `path.id` | KEEP-tech ×10 |
| `accessRequestDraftList`, `spendQueueList`, `spendApprovalList`, `assessmentQueueList`, `controlledWaitList`, `stepCongestionList`, `…IncidentList` | `page`, `pageSize` | KEEP-tech ×7 |
| `accessRequestLineList`, `spendBatchItemList`, `…PlanLineSuggestionList`, `…SupplementList`, `budgetCheckYearList` | `path.id` + phân trang | KEEP-tech ×5 |
| `accessRequestSimilarSeatList` (H) | `employeeId` (dòng nhóm) | KEEP-tech |
| `grantQueueList` (IT) · `stepCongestionStepList` (SAD) · `groupRequestCandidateList` (E/H) | `beneficiaryEmployeeId` · `holderEmployeeId` · `q` | KEEP-tech ×3 (bộ lọc) |
| `needDecisionList` (H/SA) | `type` GRANT/SERVICE_ACCOUNT/RENEWAL/GROUP_GRANT | KEEP-tech (mở rộng khi có loại `QĐ-100ab/ac/ad`) |
| `meAccessRequestList` (mọi người) | `view`, `state`, `type`, `from`, `to` | KEEP-tech |
| `returnRequestList` | `state`, `assignmentId` | KEEP-tech |
| `requestableApplicationList` / `requestablePlanList` (E) | `search`, `kind`, `functionalGroupId` / `applicationId` | KEEP-tech |
| `provisioningTaskList` (IT) · `licenseAssignmentList` (IT) · `meSoftwareRights` | `channel,status,scope` · `subscriptionId,planId,employeeId,source,kind` · `view` | KEEP-tech |
| `subscriptionSeatUsage` (IT) | `path.id` | KEEP-tech |
| `financeReviewList`, `financeReviewGet`, `budgetInformationOfRequest`, `budgetInformationList` | `state`, `path.id`, phân trang | DROP-obsolete ×4 (gỡ op) |

## 6. MF-4 — ngân sách năm

| Op | Field | Ai | BE thay? | Verdict | Bằng chứng | Căn cứ |
| --- | --- | --- | --- | --- | --- | --- |
| `budgetProposalSubmit` POST /budget-proposals (BM-10) | `costCenterId` | H chỉ lập cho phòng mình | BE lấy `own` rồi chỉ so (403 nếu khác) | DROP-derive | `B/budget/budget.dto.ts:33`; `B/proposal/proposal-sender.service.ts:56-58` | QĐ-82a, FR-5.15(1) |
| 〃 | `year` | H (năm đang chạy/năm sau) | `yearIsOpen` | KEEP-in | `:34` | US-06-10 AC-9 |
| 〃 + `budgetProposalResubmit` + `budgetVersionLineAdd` | `lines[].description`, `planId`, `seats`, `amount.amount`, `windowFrom`, `windowTo`, `servicePeriodMonths`, `repeatCycle`, `quoteValidUntil`, `note` | H (Finance khi thêm dòng phiên bản) | `amount` là **dự toán**, khác giá Request | KEEP-in ×10 (×3 op) | `:19-30`, `:43-51`, `:139` | QĐ-82a, QĐ-82d |
| 〃 | `lines[].amount.currency` | H không đọc được đồng tiền báo cáo | bắt = đồng tiền báo cáo (422) | DROP-derive (×3 op) | `:8,23`; `proposal-sender.service.ts:137` | QĐ-42c |
| 〃 | `attachmentIds[]` | H (sau upload) | gắn file đã complete | KEEP-tech | `:36-41` | QĐ-93j |
| 〃 | `lines[].lineType`, `priorityRank`, `zbbJustification` | H | — | **ADD** (hoãn, Q-01(3)) | — | QĐ-94g B4 |
| `budgetProposalReturn` | `reason` | FIN | — | KEEP-in | `:52` | QĐ-91a, QĐ-100v |
| `budgetProposalWithdraw` | `path.id` | H | — | KEEP-tech | — | QĐ-91a |
| `budgetVersionCreate` POST /budget-versions | `proposalId` | FIN | — | KEEP-tech | `:92` | QĐ-92d(3) |
| 〃 | `base.amount` | FIN | — | KEEP-in | `:93` | QĐ-82a |
| 〃 | `reserve.amount` | FIN chỉ khi khác mặc định | không có mặc định, FE gửi 0 | RESHAPE (optional; vắng = round(%chụp × base)) | `:94`; `B/version/version-figures.service.ts:35-36` | QĐ-100h, QĐ-100k, S-03 |
| 〃 | `base/reserve/quarters.*.currency` | — | luôn = tiền đề xuất | DROP-derive | `:80-88` | FR-1.6 |
| 〃 | `highValuePercent` · `highValueAmount` | không ai | rẽ Finance ở kiểm ngân sách | DROP-obsolete ×2 | `:95-96`; `R/spend/budget-check.policy.ts:117-121` | QĐ-97c |
| 〃 | `quarters.q1..q4.amount` | FIN (phân kỳ, tùy chọn) | tổng = năm | KEEP-in | `:97` | FR-5.15(2) |
| 〃 | `reserveReason` | FIN khi khác mặc định | — | **ADD** | — | QĐ-100h |
| `budgetVersionUpdate` PUT /budget-versions/{id} (chưa duyệt) | `base`, `quarters` | FIN | khóa sau duyệt | KEEP-in ×2 | `:110-121` | QĐ-91d |
| 〃 | `reserve` | FIN | — | RESHAPE (như create) | `:113` | QĐ-100h |
| 〃 | `highValuePercent`, `highValueAmount` | — | — | DROP-obsolete ×2 | `:114-115` | QĐ-97c |
| 〃 | `reason` (lý do revision) | — | bắt khi `REVISION` | RENAME → `reserveReason` | `:117` | QĐ-97b, QĐ-100h |
| `budgetVersionRevise` POST …/revisions | `costCenterId`, `year`, `base`, `reserve`, `highValuePercent`, `highValueAmount`, `quarters`, `reason` | không ai | — | DROP-obsolete ×8 (gỡ op) | `:100-109` | QĐ-97b |
| `budgetVersionSend` | `path.id` | FIN | thêm kiểm `reserveReason`, sàn | KEEP-tech | — | QĐ-91a, QĐ-98b |
| `budgetVersionDecide` | `decision` · `reason` | SA (SoD-8) | thiếu kiểm base ≥ cam kết chuyển tiếp | KEEP-in ×2 | `:57-77`; `version-decision-judge.service.ts:36-69` | QĐ-91b, QĐ-98b |
| `budgetVersionLineUpdate` PUT …/lines/{position} | `path.position` | FIN | khóa dòng phiên bản | KEEP-tech | `:122` | — |
| 〃 | `description`, `planId`, `seats`, `amount.amount`, `windowFrom`, `windowTo`, `servicePeriodMonths`, `repeatCycle`, `quoteValidUntil`, `financeComment`, `adjustmentReason` | FIN (phiên bản chưa duyệt) | `adjustmentReason` bắt khi đổi dòng gốc | KEEP-in ×11 | `:122-138` | QĐ-82a, QĐ-91d |
| 〃 | `amount.currency` | — | — | DROP-derive | `:127` | QĐ-42c |
| `budgetVersionLineWindow` PUT …/window | `windowFrom`, `windowTo`, `amount`, `reason` | không ai (dời khoảng mua ngân sách đã duyệt) | — | DROP-obsolete ×4 (gỡ op) | `:141-151` | QĐ-82l(5), QĐ-97b |
| `budgetVersionImport` | `file` (multipart) | FIN | import dòng | KEEP-in | controller `version/budget-version-lines.controller.ts:288-289` | QĐ-93j |
| `budgetCommitmentRelease` | `reason` | FIN | chỉ khi Request đã kết thúc | KEEP-in | `B/commitment/commitment.dto.ts` | QĐ-83a, QĐ-84g |
| `budgetProposalAttachmentDeclare` (H) / `budgetVersionAttachmentDeclare` (FIN) | `fileName`, `contentType` · `sizeBytes` | H/FIN | `UploadInspection` kiểm lại | KEEP-in ×2 · RESHAPE `min(1)` (×2 op) | `B/attachment/budget-attachment.dto.ts:6-9` | QĐ-93j |
| `budgetAttachmentComplete`, `…Discard`, `…Link`, `budgetVersionAttachmentRemove` | `path.id` (+`attachmentId`) | H/FIN theo quyền | — | KEEP-tech ×4 | upload/read controllers | QĐ-93j(3) |
| GET `budgetProposalList` · `budgetVersionList` | `state`, `year`, phân trang | — | — | KEEP-tech; `budgetVersionList.state=SUPERSEDED` DROP-obsolete | `:157-160`; versionList query | QĐ-97b |
| GET `budgetProposalGet/Lines`, `budgetVersionGet/History/Lines`, `…AttachmentList` ×2, `budgetCommitmentReleases` | `path.id` + phân trang | — | — | KEEP-tech ×8 | — | — |
| GET `budgetMine`, `…/lines`, `…/versions` (H) · `budgetTable` (FIN) · `budgetAttachmentMineList` | `year` (+ phân trang) | — | — | KEEP-tech ×5 | `B/budget-view/budgets.controller.ts:50,67,84,100` | QĐ-100p |
| GET `budgetCommitmentList` (FIN) | `attached`, `year`, `costCenterId`, `requestId` | FIN | — | KEEP-tech | `B/commitment/budget-commitments.controller.ts:53` | FR-5.8 |
| GET `budgetVersionLineChangeList` | `path.id`, `position` | — | — | DROP-obsolete (gỡ cùng window) | `budget-version-lines.controller.ts:268-269` | QĐ-97b |

## 7. Response — dễ nhầm là input, lộ phạm vi, hoặc lỗi thời

**Không phải input (FE không làm ô nhập):** `amount`, `pricing.*`, `budgetYear`, `lineCount`, `stage`, `readyToSubmit`, `blockedReason`, `queuedAt`,
`waitedWorkingDays`, `overdue`, `reminders` (`spend-submission.dto.ts:74-104`); `suggestion.position/overdue/suggested` (`:136-147` — dùng để chọn,
không gõ); `renewal.previousExpectedEndDate/newExpectedEndDate/consecutiveMonths` (`access-request.dto.ts:239-247`); `expectedEndDate` (Request/dòng/
Assignment — sau sửa là ngày BE tính); `costEstimate.*` (thuế ước tính, chỉ hiển thị — `:134-144`); `check.lineCount/amountPerPerson`
(`group-request.dto.ts:66-70`); BM-10 `total`; `budgetMine.total`.

**Lỗi thời (bỏ khỏi output):**

| Response | Field | Bằng chứng | Căn cứ |
| --- | --- | --- | --- |
| `accessRequestGet`, `meAccessRequestList` | `state` `AWAITING_FINANCE_REVIEW`/`AWAITING_BUDGET`; `spend.stage` `RETURNED_BY_FINANCE`/`WAITING_FINANCE_REVIEW`/`WAITING_BUDGET`; `spend.financeReturnReason`; `expectedSpendOn`; `delegatedBatchId`; `needDecision.termConfirmationReason`; `deciderRole FALLBACK_APPROVER` | `access-request.dto.ts:124,126,163-164,213,256-266,272` | QĐ-97c, QĐ-98a, QĐ-100t, QĐ-93c |
| 〃 (thiếu) | `spend.stage` chưa có `RESERVE_CONFIRMATION_REQUIRED`/`RETURNED_AT_DECISION`; `blockedReason` chỉ 2 mã dữ liệu, thiếu `NO_ACTIVE_BUDGET`/`OVER_RESERVE` + số vượt cho người yêu cầu | `:265`; cùng `SpendStatusService` (`R/request-view/access-request-query.service.ts:134`) | QĐ-97c ("báo người yêu cầu lý do kèm số tiền vượt") |
| `accessRequestPreview` | `requirements.termConfirmationByHead`, `possibleExtraSteps[FINANCE_REVIEW]`, `expectedSpendOn` | `request-preview.dto.ts:46,64,73-75`; service `:67,78` | QĐ-98a, QĐ-97c |
| `groupRequestCheck` | lý do dòng `END_DATE_REQUIRED`/`END_DATE_TOO_EARLY` — **lộ** đồng nghiệp là nhà thầu/thực tập | `group-request.dto.ts:45-46` | QĐ-82l(18) |
| `accessRequestLineList` | dòng của người khác có `cost`, `share`, `expectedEndDate`, lý do từ chối — **lộ** với E gửi nhóm | `:110-119` | QĐ-82l(18) |
| `spendQueueList` | `expectedSpendOn`, `stage RETURNED_BY_FINANCE`, `financeReturnReason` | `spend-submission.dto.ts:70,84,88` | QĐ-97c, QĐ-98a |
| `spendBatchItemList` | `outcome SENT_TO_FINANCE`; `leftReason RETURNED_BY_FINANCE`/`CONFLICT_OF_INTEREST` | `:117,128` | QĐ-97c, QĐ-93d |
| `accessRequestSupplementList/Add` | `expectedSpendOn{before,after}`, `budgetYear{before,after}` | `:154-155` | QĐ-98a |
| `accessRequestPlanLineSet` | `planLine.stillNeeded` giữ (S-23) — **không** bỏ | `:166` | FR-3.3 |
| `spendApprovalList/Get` | `primaryCode` `HIGH_VALUE`/`INSUFFICIENT_BUDGET`/`PLAN_LINE_OVERDUE`; `noIndependentReview`; `decision.overrideReason`/`bySubstitute`; `request.expectedSpendOn`; `latestBudgetInformation` | `spend-approval.dto.ts:93-101,122,126,136,140,163,176,191` | QĐ-97c, QĐ-29b, QĐ-93d |
| `spendBatchDecide` | `result.reason` `REVIEWER_IS_APPROVER`/`OVERRIDE_REQUIRED`/`RECHECKED_NEEDS_FINANCE_REVIEW` | `:206,209,211` | QĐ-97c |
| `budgetCheckGet/YearList` | `route FINANCE_REVIEW`, `trigger PLAN_LINE_MOVED/FINANCE_OUTCOME_WHILE_WAITING`, `planLineOverdue`, `noIndependentReview`, `code HIGH_VALUE`, `shareBasisPoints`, `overridden`; `remaining` chưa trừ `pending` | `finance-review.dto.ts:90-105,145-155`; `budget-check.policy.ts:113` | QĐ-97c, QĐ-82l(1) |
| `budgetVersionGet/List` | `kind REVISION`, `SUPERSEDED`, `basedOnVersionId`, `previousTotal`, `highValuePercent/Amount`, `reason` (revision) | `budget.dto.ts:240-254,282-283` | QĐ-97b, QĐ-97c |
| `budgetMineVersionList` | `state SUPERSEDED` | `:340` | QĐ-97b |

**Phạm vi đọc:** không thấy response lộ số phòng khác/toàn công ty: version chỉ FIN/SA (`B/budget/budget-facts.service.ts:109-113`), đề xuất lọc
theo Cost Center (`B/proposal/proposal-view.service.ts:62-73`), `budgetTable`/commitment chỉ FIN. Thiếu ngược lại: `budgetMine` không có
base/reserve/held/spent/remaining (`budget.dto.ts:312-321`, QĐ-100p); `budgetCheck*` chỉ FIN + người giữ bước chi, H và người yêu cầu bị loại
(`R/finance-review/spend-view.service.ts:132-136`, QĐ-97c/100p); `budgetTable` SA không đọc được (QĐ-94g B6). Nhỏ: `budgetMineLineList` dùng
`versionLineSchema` nên H thấy `financeComment`/`adjustmentReason` (`:300-301`) — không vượt phòng, nhưng ngoài danh sách QĐ-100p.

## 8. Spec deltas (đọc 14:01–14:11) và phần không spec nào phủ

**Đồng ý với spec** (không lặp): `expectedSpendOn` mọi DTO + supplement (`request-year-without-spend-date`); `termMonths` 1..12/`termConfirmation`/
`termLimit` (`request-term-limit`); `lines[].expectedEndDate`, `provisioningTaskGrant.expectedEndDate`, thu hẹp `accessRequestLineList`
(`approved-end-date`, `request-sender-rules`); gỡ `/delegated-requests`, renewal chỉ người giữ, `TOO_FEW_LINES`, `fromRequestId`, `delegatedBatchId`
(`request-sender-rules`); `extensionMonths` (`renewal-chaining-and-window`); `reserveConfirmations`, supplement `termMonths`, `possibleExtraSteps`
(`reserve-confirmation`); `override` (`remove-spend-override`); 7 op Finance/hỏi Finance (`remove-finance-review-path`); `stillNeeded` giữ, S-14
(`budget-check-three-outcomes`, `request-year-without-spend-date`); `costCenterId`/`currency`, `reserve?`/`reserveReason`, sàn chuyển tiếp
(`annual-budget-reserve-and-floor`); revision/window/high-value (`remove-budget-revision-and-high-value`); `budgetMine*` (`budget-visibility-qd100p`).
Kết luận V2 buổi sáng "`stillNeeded` BỎ" **không** dùng (S-23 thắng).

| # | Slug | Op · field | Spec nói | Nên là | Lý do |
| --- | --- | --- | --- | --- | --- |
| D1 | `budget-check-three-outcomes` | `accessRequestGet`/`meAccessRequestList` · `spend.stage`, `spend.blockedReason` | chỉ đổi enum ở `spendQueueList` | đổi cả enum `access-request.dto.ts:256-265` (+ `my-requests` DTO): thêm `RESERVE_CONFIRMATION_REQUIRED`, `RETURNED_AT_DECISION`, `blockedReason` 4 mã + `overBy` của Request | cùng `SpendStatusService`; DTO strict sẽ 500/không khớp nếu chỉ sửa service; QĐ-97c báo người yêu cầu lý do + số vượt |
| D2 | `budget-check-three-outcomes` | `spendApprovalList` · `primaryCode` (`spend-approval.dto.ts:93-101,122`) | không có dòng contract | thay bằng `outcome` `WITHIN_BASE \| NEEDS_RESERVE` (+ `usesReserve` đã có ở `reserve-confirmation`) | còn `HIGH_VALUE`/`PLAN_LINE_OVERDUE` trên màn SA |
| D3 | `reserve-confirmation` | `accessRequestSupplementAdd` · vai | "trưởng phòng; người yêu cầu theo luật hiện có" | chỉ H hiện hành (đúng code `spend-submission.controller.ts:228`) | QĐ-97f: trưởng phòng sửa/rút; tránh mở quyền cho E |
| D4 | `annual-budget-reserve-and-floor` | `budgetVersionLineAdd.lines[].amount`, `budgetVersionLineUpdate.amount` · `currency` | liệt kê `budgetVersion*`/`budgetProposal*` chung | ghi tên 2 op dòng + `linePatchSchema:127` vào bảng contract | AI implement dễ chỉ sửa `versionFigures` |
| D5 | `remove-budget-revision-and-high-value` | `budgetVersionList`/`budgetMineVersionList` · query/response `state=SUPERSEDED` | bỏ khỏi enum **đầu ra** | bỏ cả enum **query** (`versionListQuerySchema`) | query còn lọc trạng thái không còn sinh |
| D6 | `budget-visibility-qd100p` | `budgetMineLineList` | không nhắc | quyết rõ: giữ hay ẩn `financeComment`/`adjustmentReason` cho H | QĐ-100p chỉ liệt kê gói, số tiền, khoảng mua |
| D7 | `budget-visibility-qd100p` | `budgetTable` · vai SA | không nhắc (Finance giữ) | SA đọc được (hoặc ghi rõ hoãn) | FR-5.15(6), QĐ-94g B6 |

**Op/field MF-1/MF-4 không spec nào phủ:** (a) Request tiếp tục **nhóm** (`QĐ-100ab`), Request hợp thức hóa của H (`QĐ-100ac`), Request tăng cấp
thuê bao (`QĐ-100ad`) — `request-sender-rules:47` trỏ `qd96-100-new-request-types` (hoãn H4) nhưng **thư mục không tồn tại**; (b) chuyển seat cùng gói
phòng khác kèm chi phí/`seatSource` ở `provisioningTaskGrant.subscriptionId` (`QĐ-99e/99m/100y`, H2 hoãn — hiện `assignment.service.ts:225` chặn);
(c) BM-10 `lineType`/`priorityRank`/`zbbJustification` và B0–B3 (lịch, baseline, phong bì, chỉ tiêu) — hoãn theo Q-01(3); (d) giữ chỗ seat khi trình
(`QĐ-99d`); (e) GET không có thay đổi contract cần spec: requestable ×4, `similar-seats`, `seat-usage`, `license-assignments`, `me/software-rights`,
`assessment-queue`, `controlled-waits`, `step-congestion` ×4, `timings`, `return-requests` GET, attachments, commitments.

## 9. Đếm

Cách đếm: field body/path của **op ghi**, nhân theo số op khi một hàng gộp nhiều op (vd. `lines[]` BM-10 ×3 op, nhóm check/submit ×2);
`quote{…}` = 7 field; path id của op ghi chỉ đếm khi là input duy nhất; GET đếm theo **op** (query chỉ lọc/phân trang).

| Nhóm | Op ghi | KEEP-in | KEEP-tech | DROP-derive | DROP-obsolete | RESHAPE | RENAME | ADD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| §1 gửi Request | 11 | 18 | 4 | 2 | 17 | 9 | — | — |
| §2 nhu cầu/đánh giá | 9 | 45 | 6 | — | 4 | — | — | — |
| §3 trình/duyệt chi | 8 | 10 | 1 | — | 12 | — | — | 2 |
| §4 rút/hoàn trả/cấp | 15 | 17 | 9 | 2 | — | — | — | — |
| §6 MF-4 | 20 | 55 | 10 | 6 | 16 | 4 | 1 | 4 |
| **Tổng (63 op ghi)** | 63 | **145** | **30** | **10** | **49** | **13** | **1** | **6** |

248 field input hiện có (không tính ADD) + **WRONG-ROLE 1** (người gửi Request tiếp tục là H cho 1 người), **WRONG-STEP 0**. GET: **56 op** — 51
KEEP-tech, 5 DROP-obsolete (`financeReviewList/Get`, `budgetInformationOfRequest/List`, `budgetVersionLineChangeList`) + 1 giá trị query
DROP-obsolete (`state=SUPERSEDED`). Gỡ hẳn **11 op** = 6 ghi (`delegatedRequestSend`, `financeReviewComplete`, `budgetInformationAsk/Answer`,
`budgetVersionRevise`, `budgetVersionLineWindow`) + 5 GET. Tổng 63 + 56 = 119 op.

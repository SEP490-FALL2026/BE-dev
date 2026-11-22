# budgets

Mục đích: ngân sách theo Cost Center và năm tài chính — đề xuất của trưởng phòng, các version Finance dựng và spending
approver quyết định, commitment mà request giữ trên ngân sách, hóa đơn Finance ghi để commitment thành thực chi, đóng năm
tài chính đã hết. Story chính: US-06-04, US-06-06, US-06-07, US-06-08, US-06-09, US-06-10, US-06-11, US-06-12, US-12-01,
US-12-02 (ADR-0016).
Tầng: T5 (`scripts/arch/tiers.cjs`). Phụ thuộc: organization, finance, catalog, identity-access, operating-parameters,
audit, notifications. Được dùng bởi: requests; gốc `src/app/app.module.ts`.

## Public API (`public/`)

- `BudgetsReadApi` (`public/budgets-read.api.ts`) — `yearFacts` chỉ đọc, cùng `BudgetFactsRepo` với `BudgetsApi`.
  `BudgetsReadFacadeModule` dùng cho kiểm ngân sách trong worker, không controller hoặc listener vòng đời.
- `LocalDemoBudgetCycleApi` (`public/local-demo-budget-cycle.api.ts`) — `setSubmissionDeadline` qua `BudgetsLocalSeedFacadeModule` cho đồ thị lệnh seed (khóa tạm kỳ để gửi phiên bản qua API rồi trả lại hạn nộp).

- `BudgetsApi` ([public/budgets.api.ts](public/budgets.api.ts)) — những gì request đọc và giữ; không hàm nào sửa
  ngân sách:
  - `yearFacts` — ngân sách hiện hành của từng năm cho một Cost Center (năm chưa có ngân sách thì vắng mặt).
  - `holdForRequest` — request giữ số tiền mỗi năm, trong transaction của quyết định duyệt (US-06-04).
  - `releaseForRequest` — trả phần request còn giữ về ngân sách khi request kết thúc/rút bớt (US-06-06); có `reference` thì mỗi khoản chỉ
    trả một lần cho cùng lý do + tham chiếu (giải phóng theo ngày `REVOKED`/`LATE_GRANT`, ghi `reason_text`).
  - `lockSeatCommitments` — khóa `FOR UPDATE` các khoản còn `HELD` của các request từ năm đang mở (theo thứ tự request, năm), trả
    `origin`, `seat_monthly_minor`, phần còn giữ: `requests/grant/seat-release.service.ts` tính phần giải phóng theo ngày (RV-07, M-10).
  - `holdYearStart`, `listRequestsHoldingYear` — khoản cam kết ngày 01/01 (`FR-5.8`(6), `QĐ-109a`): job của `requests` giữ một khoản cho mỗi Request
    có quyền `K1`/`K2` đang chạy hoặc đã duyệt chi chưa cấp; chỉ Request mới có khoản, không có khoản theo Assignment.
  - `requestHoldsCommitment` — request có giữ commitment không, điều kiện để Finance đọc nó (US-06-09 AC-2).
  - `committedByRequests` — số tiền mỗi commitment của một loạt request, một lần đọc (danh sách lô chi của Finance).
  - `heldByRequests` — số còn giữ (chưa chi, chưa trả) của các commitment `HELD` của một loạt request, một lần đọc không khóa (xem trước việc hủy Request của người nghỉ, MF2-B.3).
- `public/budgets.types.ts` — input/output của facade (`YearBudgetFacts`, `PlanLineFacts`, `CommitmentHoldInput`…).
- `public/budgets.extension-points.ts` — ba point dưới đây, contract `BudgetChangeListener`,
  `CommitmentReleaseGuard`, `CommitmentRequestFacts` (+ `CommitmentRequestView`) và hàm `budgetChangeHandler`.

## Bảng sở hữu

- `budget_proposals`, `budget_proposal_lines`, `budget_versions`, `budget_version_lines`,
  `budget_version_line_changes` (còn trong DB, không còn code ghi), `budget_version_decisions`, `budget_version_history`, `budget_commitments`,
  `budget_commitment_releases` (`budget_commitments.origin` = `APPROVAL` hoặc `YEAR_START`; `seat_monthly_minor` giá tháng một seat, quy tiền báo cáo, làm tròn lên, ghi lúc duyệt chi và lúc ghi khoản 01/01; null = khoản cũ, không giải phóng theo ngày), `invoices`, `budget_attachments`, `budget_threshold_alerts` (RV-2: cảnh báo 80/100 % đã báo, mỗi dòng là một lần vượt, unique Cost Center + năm + ngưỡng + `episode`), `budget_adjustments` (AD-1: bản ghi điều chỉnh ngân sách trong năm, một bảng bốn loại; trigger không cho sửa điều gì đã đề nghị, chỉ quyết một lần, không xóa) (`prisma/models/budgets.prisma`). Kiểm ngân sách của request
  (`request_budget_checks`…) thuộc `requests`.

## Extension point

- Mở `PendingSpendContributions` (`budgets.pending-spend`, Contributions): số tiền các Request đang chờ duyệt chi theo lô (Cost Center, năm) — requests `spend/pending-spend.listener.ts` cấp (định nghĩa ở `requests/spend`, không ở `BudgetsApi`). `BudgetChangeListeners` đã gỡ (không còn Request chờ phiên bản ngân sách).
- Mở `CommitmentReleaseGuardHook` (`budgets.commitment-release-guard`, Hook) — requests
  `spend/commitment-release.listener.ts`. Chưa bind thì nhả phần dư thất bại thay vì cho qua.
- Mở `CommitmentRequestFactsHook` (`budgets.commitment-request-facts`, Hook) — requests `spend/commitment-request-facts.listener.ts`:
  đọc **theo lô** (`factsOf(requestIds[])`) phần mềm, plan, người gửi, số người thụ hưởng, ngày duyệt chi và **nhà cung cấp** của các
  request đứng sau một trang commitment; dùng cho `request` trên dòng danh sách và để suy `vendorId` của hóa đơn. Chưa bind thì đọc
  danh sách commitment và ghi hóa đơn đều thất bại, không đoán.
- Đăng ký vào `identity-access.approval-role-change-listeners` và `organization.change-listeners` —
  `version/spending-approver-wait.listener.ts`: Super Admin nhận một `CONTROLLED_WAIT_ALERT` (`subject` `BUDGET_VERSION`) mỗi
  đoạn chờ — khi gửi lúc chưa có người giữ vai, khi vai bị thu hồi, khi người giữ vai nghỉ việc (QĐ-93c, D-S16).
- Đăng ký vào: `organization.change-listeners` (`budgets.head-change`) —
  `proposal/budget-head-change.listener.ts`; `organization.cost-center-use-readers` (`budgets.commitments`) —
  `commitment/budget-cost-center-use.listener.ts`. Năm ngân sách là năm dương lịch: không còn tham số tháng bắt đầu
  năm tài chính, không còn extension point khóa tham số (`QĐ-104e`(1)).
- Đăng ký vào (thêm): `proposal/budget-proposal-template.listener.ts` góp biểu mẫu `BM-10` vào `ImportTemplateContributions` của `policies` (file mẫu `budget-proposal`, không parse).

## Capability và file chính

Một lõi `budget/` và sáu capability cùng cấp với nó. Lõi giữ repo, policy, dto, lỗi và notifier dùng chung (`proposal.repo.ts`,
`version.repo.ts`, `commitment.repo.ts`, `budget-year-lock.repo.ts`, `budget-facts.repo.ts`, `budget.policy.ts`,
`budget-notifier.service.ts`, `version-view.service.ts`, `budget.dto.ts`); lõi không import capability nào, mỗi capability chỉ
import lõi (`pnpm arch:capabilities --module budgets`).

- `seat-month/` — seat-tháng `K2` (SM-1, `QĐ-103k`, `QĐ-111bg`): `seat-month.policy.ts` (chia theo ngày, làm tròn nửa ra xa 0, phần dư dồn đoạn cuối) và `seat-month-plan.policy.ts`
  (phòng chịu và phần cam kết bị tiêu), `SeatMonthService` (tính một tháng), `SeatMonthSubscriptionService` (một thuê bao, một transaction; khóa tháng, hàng cam kết, rồi khóa năm),
  `SeatMonthSweeper` mỗi giờ cho thuê bao chưa có dấu `seat_month_runs` của tháng đã kết thúc (một thuê bao lỗi không mất các thuê bao sau; tháng tính lại theo yêu cầu thì tính mọi thuê bao, phần đã tiêu cam kết mà dòng không còn tiêu thì trả lại qua bảng bù trừ append-only `budget_commitment_seat_month_reversals`, `SM1-06`); `GET /seat-month-charges` (`SeatMonthChargesController`, Finance và trưởng phòng của Cost Center mình) kèm dòng kho. Cam kết chỉ
  bị tiêu thêm, không bao giờ hoàn lại (trigger `budget_commitments_guard`), nên tính lại một tháng giữ phần đã tiêu.
- `adjustment/` — điều chỉnh ngân sách trong năm (AD-1, `QĐ-111ag`, `QĐ-111bh`, C-1): `budget-adjustment.policy.ts` (hàm thuần: hình dạng bốn loại `SUPPLEMENT`/`TRANSFER`/`RETURN`/`CEILING_REDUCTION`, phần chưa phân bổ = Trần năm − Dự phòng kho − Σ ngân sách hiệu lực, sàn của _Trả lại_ và phòng nguồn của _Chuyển_ = dự kiến cuối năm của RV-1, `COST_CENTER_CHANGE` miễn sàn nhưng chuyển tối đa phần còn lại = hiệu lực − đã dùng, FIX-AD1) và `BudgetAdjustmentRepo` (mọi SQL của bảng). Ba route (`BudgetAdjustmentController`): `POST /budget-adjustments` (Finance lập, kỳ của năm phải đã KHÓA: kỳ còn nhận đề xuất ⟹ 409 `CYCLE_NOT_LOCKED`; Cost Center nhận phải còn dùng, và nếu chưa có phiên bản thì không có đề xuất BM-10 chờ hay phiên bản đang xử lý, FIX-AD1), `GET /budget-adjustments` (phân trang; Finance và Người duyệt chi đọc hết, trưởng phòng đọc phần chạm Cost Center phòng mình), `POST /budget-adjustments/{id}/decision` (chỉ Người duyệt chi, một lần, không phải người lập; kiểm lại mọi điều kiện lúc duyệt qua `BudgetAdjustmentJudgeService`; duyệt đổi ngân sách qua `BudgetAdjustmentApplyService`: _Giảm Trần năm_ hạ `annual_ceiling_minor` của kỳ, Cost Center nhận tiền mà chưa có phiên bản được tạo phiên bản `ADJUSTMENT` đã duyệt qua `version/version-adjustment-creation.service.ts`, R-48). **Thứ tự khóa (D11):** `budget_cycles ... FOR UPDATE` TRƯỚC (`BudgetAdjustmentLockService`), rồi khóa năm của từng Cost Center theo id tăng dần. Dự kiến cuối năm của sàn đọc qua `BudgetReviewFiguresService.forecastsOf` (công thức của RV-1, không viết lại). **Ngân sách hiệu lực** (`effectiveBudget` ở `GET /budgets`, `/budgets/summary`, `/budgets/mine` và từng năm của `GET /access-requests/{id}/budget-check`; `base/reserve/total` vẫn là số của phiên bản, mốc giữ nguyên; còn lại, `overBudget`, kiểm Request đều tính trên hiệu lực; SQL của bảng ở `budget-view/budget-view.repo.ts` cộng cùng quy tắc `created_version_id`) = cơ sở của phiên bản + điều chỉnh đã duyệt (`adjustmentDeltasOf` ở `budget/budget.policy.ts`; `BudgetFactsRepo.yearFacts/approvedOfYear/approvedOfCostCenters/allocatedOfYear`), dự phòng giữ nguyên.
- `review/` — chốt số tháng và rà soát quý (RV-1, RV-3, `QĐ-111ae`, `QĐ-111ah`): `POST/GET /budget-review-periods`, `POST …/signature` (Finance), ảnh chụp bất biến của từng Cost Center. **Giải trình ở kỳ quý (RV-3):** kỳ `QUARTER` (tháng 3/6/9) mở ở `AWAITING_EXPLANATIONS` với `explanations_due_on` = ngày làm việc thứ 5 kể từ lúc chốt (ngày chốt là ngày 1, quy tắc cố định); dòng Vàng/Đỏ/Dưới mức có `explanation_status = PENDING`, còn lại `NOT_REQUIRED`; ngay lúc chốt, trong transaction ghi kỳ (`BudgetReviewPeriodWriterService.write`), `BudgetReviewExplanationReminderService.request` gửi `BUDGET_REVIEW_EXPLANATION_REQUESTED` (kỳ, Cost Center, ngày hạn, đèn; không số tiền) cho trưởng phòng của từng dòng `PENDING`, khóa `review:<kỳ>:<Cost Center>:open` (US-12-21 AC-4). `PUT /budget-review-periods/{id}/lines/{costCenterId}/explanation` (`BudgetReviewExplanationController`, `MANAGER`): chỉ trưởng phòng của phòng chứa Cost Center (403 `BUDGET.NOT_YOUR_COST_CENTER`), kỳ phải còn chờ (409 `NOT_AWAITING_EXPLANATIONS`), dòng phải đã bị hỏi (422 `EXPLANATION_NOT_REQUIRED`), ghi lại được đến khi Finance ký, quá hạn không bị từ chối; đủ bốn mục (nguyên nhân, một lần hay kéo dài, hành động, nhu cầu tới cuối năm gồm số tiền ≥ 0 và ghi chú), thiếu số tiền ⟹ 422 và CHECK `budget_review_lines_explanation_amount_check` (US-12-21 AC-5, FIX-RV23 RV3-03). Finance ký lúc nào cũng được: dòng còn `PENDING` thành `UNEXPLAINED` trong cùng transaction với chữ ký (`BudgetReviewSignatureService.closeUnanswered`); phòng chưa có trưởng phòng LÚC MỞ KỲ thì dòng là `NO_HEAD` ngay từ đầu (không ai được hỏi, không nhắc, kỳ không chờ, R-17, US-12-21 AC-12, FIX-RV23 RV3-04), trưởng phòng gán sau không đổi điều đó. Nhắc (B-7): `BudgetReviewExplanationReminderService.remind` trong lượt giờ của `BudgetReviewSweeper`, đúng ngày hạn rồi mỗi Thứ Hai, khóa `review:<kỳ>:<Cost Center>:<ngày>`. Trigger `budget_review_lines_explanation_guard` chỉ cho cột giải trình đổi khi kỳ còn `AWAITING_EXPLANATIONS` và dòng đã bị hỏi; cột số của ảnh chụp và trigger của RV-1 giữ nguyên. Kỳ quý đóng trước RV-3 (`SNAPSHOT`) vẫn ký thẳng được, các dòng của nó `NOT_REQUIRED`.
- `threshold/` — cảnh báo 80 % và 100 % số cơ sở (RV-2, `QĐ-111af`, R-5, R-28): `threshold.policy.ts` (hàm thuần `crossedThresholds`: báo khi `trước < t × cơ sở ≤ sau`, hằng số 80 và 100), `ThresholdAlertService` (`watch` khóa năm của Cost Center và đọc đã dùng = thực chi + cam kết còn giữ qua `CommitmentRepo.totals`, `settle` đọc lại và so với cơ sở hiệu lực của `BudgetFactsRepo.approvedOfCostCenters`; điều chỉnh đổi cơ sở không tự báo, vượt lại theo cơ sở mới báo lại), `ThresholdRepo` (`numbered` đọc `episode` cuối dưới khóa năm; `INSERT … ON CONFLICT DO NOTHING` qua `skipDuplicates`, chỉ báo dòng vừa ghi) và `ThresholdNotifierService` (`BUDGET_THRESHOLD_REACHED` cho trưởng phòng và Finance, khóa sự kiện theo Cost Center, năm, ngưỡng, `episode`: đã dùng tụt dưới ngưỡng rồi vượt lại thì báo lại). Không có route. Nối quanh: giữ cam kết và khoản 01/01 (`commitment/commitment.service.ts`), hóa đơn mua và chi ngoài quy trình (`invoice/*-recorder.service.ts`), seat-tháng (`seat-month/seat-month-subscription.service.ts`), phiên bản tạo bởi điều chỉnh (`adjustment/budget-adjustment-apply.service.ts`, R-48) và duyệt phiên bản thường gắn cam kết chờ ngân sách (`version/version-decision-writer.service.ts`, FIX-RV23 RV2-02: cùng sự kiện, cùng kết quả). Capability L1: chỉ import lõi `budget/`, nên `commitment`, `invoice`, `seat-month`, `adjustment` gọi được mà không vòng với `review` (`review` → `seat-month`).
- `proposal/` — đề xuất của trưởng phòng: gửi, rút, Finance trả về, gửi lại (US-06-10); `budget-proposals.controller.ts`;
  `ProposalService`, `ProposalViewService`, `ProposalSender`. **`BM-10`** (`QĐ-111ab`) = `{ costCenterId?, year, requestedAmount, note?,
attachmentIds[1..10] }`, không có dòng (`requestedAmount` lưu ở `total_minor`, `note` 1–1000 ký tự, CHECK `budget_proposals_note_check`);
  bảng `budget_proposal_lines` giữ cho đề xuất cũ, không ghi nữa. Gửi, gửi lại, rút chỉ khi kỳ năm đang mở; Finance trả về chỉ trước hạn nộp
  (`proposalWorkRefusal` ở `cycle/cycle.policy.ts`: nháp/không có kỳ ⟹ 409 `BUDGET_CYCLE.NOT_OPEN`, từ ngày sau hạn nộp ⟹ 409
  `BUDGET_CYCLE.LOCKED`).
- `version/` — phiên bản: tạo, sửa số, gửi duyệt, quyết định, lịch sử (US-06-09, US-06-11); `budget-versions.controller.ts`;
  `VersionService`, `VersionDecisionService` (`VersionDecisionJudge` + `VersionDecisionWriter`; `decision` nhận `checklist` của bước `4.7`, `QĐ-111ap`: _Không_ khóa `APPROVE`, `RETURN` lấy lý do từ các mục _Không_ khi không gõ; `APPROVE` kiểm lại Trần năm trừ dự phòng kho, mục `4.7-02`, trước khi duyệt: 409 `BUDGET_VERSION.OVER_CEILING`), `VersionCreationService`,
  `VersionBaselineCreationService`, `VersionFigures`, `VersionTrail`, `VersionAccessService`. Một số cho cả năm, không dòng (`QĐ-111ac`,
  B-6): `base` bỏ trống ⟹ điền số chạy sang của Cost Center (`CarriedOverContributions`, `requests` bind bằng một lần chạy thử khoản 01/01; không ai bind ⟹ 0), dự phòng là
  `reservePercent` (mặc định `BUDGET_RESERVE_DEFAULT_PERCENT`) hoặc `reserve` (số tiền); dự phòng khác mặc định của tổ chức (đọc lúc gửi), dù
  chọn bằng tỷ lệ hay số tiền, cần `reserveReason` khi gửi (422 `BUDGET.RESERVE_REASON_REQUIRED`); lưu nháp không chặn; gửi cần ≥ 1 tệp (422 `BUDGET_VERSION.ATTACHMENT_REQUIRED`) và tổng mọi Cost Center ≤ Trần năm − Dự phòng kho (409
  `BUDGET_VERSION.OVER_CEILING`, `details.overBy`). Đọc phiên bản có `carriedOverNextYear`, `belowCarriedOver` (cờ đỏ: cơ sở + dự phòng < số chạy sang, `C-09`) và `carriedOverShortfall` (phần thiếu, 0 khi đủ),
  `noProposalSubmitted` (origin `BASELINE_NO_PROPOSAL`: phòng không nộp tới hạn hoặc tạo sau hạn, `QĐ-111bb`). Quyết định chỉ `APPROVE` |
  `RETURN` (lý do bắt buộc ⟹ `CHANGES_REQUESTED`, `QĐ-111ad`); `REJECTED` chỉ còn ở dữ liệu cũ. Không còn `REVISION`, `SUPERSEDED`, dời
  khoảng mua (`QĐ-97b`); bảng `budget_version_lines` và các mục lịch sử dòng cũ chỉ còn để đọc. Quyết định và nhả cam kết là hàm thuần trong
  `budget/budget.policy.ts`.
- `cycle/` — kỳ lập ngân sách của một năm (`QĐ-111z`, `US-06-15`): ba trạng thái **Nháp / Mở / Khóa** (`cycleStateOf` ở `cycle.policy.ts`, suy từ
  `opened_at` và hạn nộp, không lưu cột trạng thái). Finance tạo kỳ nháp (hạn nộp, hạn duyệt, Trần năm, Dự phòng kho dùng chung, ưu tiên), sửa
  và xóa nháp tự do, **mở** kỳ (`POST /budget-cycles/{year}/opening`: hạn nộp không được ở quá khứ, 422 `BUDGET_CYCLE.DEADLINE_PASSED`) rồi trưởng
  phòng nộp `BM-10`; kỳ mở dời hạn nộp (về hôm nay hoặc sau), đổi Trần năm hoặc Dự phòng kho đều **bắt buộc lý do** và lưu trước/sau; hạn quyết
  và ưu tiên đổi tự do. Từ **ngày sau** hạn nộp kỳ khóa và không nhận thay đổi nào (409 `BUDGET_CYCLE.LOCKED`); chỉ kỳ nháp xóa được (409
  `BUDGET_CYCLE.NOT_DRAFT`), mở lần hai ⟹ 409 `BUDGET_CYCLE.ALREADY_OPEN`. Không còn Trần của từng phòng và không còn bước phát hành: một số
  cho cả năm là Trần năm, Dự phòng kho nằm ở mức kỳ, ngân sách phòng là cơ sở + dự phòng của phiên bản. Tám operation: `budgetCycleCreate/List/Get/
Update/Delete/Open`, `budgetCycleBaseline`, `budgetCyclePackage`. Bảng `budget_cycles` (`budget_department_ceilings` và các cột `published_*` còn
  trong DB, không còn code ghi); `CycleService`, `CycleRepo`, `cycle.policy.ts` (`cycleStateOf`, `proposalWorkRefusal`, `windowOf`, `cycleAcceptsWork`).
  Năm đã qua chỉ đọc. **Cửa sổ tạo phòng** (R-16, `department-creation-window.listener.ts`): kỳ năm sau còn nháp, hoặc chưa có trong khi tổ chức đã có kỳ khác ⟹ cửa sổ đóng;
  kỳ mở mà chưa có phiên bản nào được gửi ⟹ mở (phòng mới có hiệu lực 01/01 năm sau); đã gửi phiên bản đầu ⟹ đóng; chưa có kỳ nào ⟹ như lúc cài đặt. **Nhắc hạn** (`R-I05`, `QĐ-108e`):
  `CycleDeadlineSweeper` (mỗi giờ, trong tiến trình API) gọi `CycleDeadlineService.run`; `deadlineDuties` (policy) nói hôm nay kỳ nợ gì: qua hạn nộp
  ⟹ trưởng phòng chưa nộp `BUDGET_PROPOSAL_DEADLINE_REMINDER`, Finance và Super Admin `BUDGET_NO_HEAD_AT_DEADLINE` (phòng không có trưởng phòng và
  cũng chưa có kế nhiệm), Finance `BUDGET_SUBMISSION_DEADLINE_PASSED`; qua hạn duyệt ⟹ Người duyệt chi và Finance `BUDGET_DECISION_DEADLINE_REMINDER`;
  trước hạn nộp ⟹ Finance `BUDGET_COST_CENTER_SETUP_DUE` một lần cho mỗi (kỳ, phòng) thiếu Cost Center. Khóa sự kiện chứa kỳ và ngày hạn: chạy lại
  không ghi thêm, dời hạn thì nhắc lại. `BudgetHeadChangeListener` báo trưởng phòng mới `BUDGET_BASELINE_VERSION_HEAD_ASSIGNED` khi phòng có phiên
  bản `BASELINE_NO_HEAD` còn dở. Thông báo: `BUDGET_CYCLE_OPENED` (trưởng phòng, kèm mẫu `BM-10`; Người duyệt chi không nhận theo QT 4.1) khi mở kỳ,
  `BUDGET_CYCLE_DEADLINE_MOVED` khi dời hạn nộp; `BUDGET_DEPARTMENT_CEILING_PUBLISHED` không còn được phát (hàng cũ vẫn đọc). Tập phòng của kỳ:
  `OrganizationReadApi.getActiveDepartmentIds(year, tx)` (phòng đang hoạt động và hiệu lực trong năm đó). **Kiểm Trần năm khi gửi phiên bản** (`R-I06`,
  `QĐ-103i`): `VersionAccessService.requireWithinAnnualCeiling` cộng, với mỗi Cost Center của năm, phiên bản MỚI NHẤT (theo `number`) trong
  `SENT`/`CHANGES_REQUESTED`/`APPROVED` (Q-22; `DRAFT`, `REJECTED`, `EXPIRED` và bản đã tách không tính; DB chỉ cho bản tách ở `DRAFT`/`EXPIRED`),
  phiên bản đang gửi thay bản cùng Cost Center, và từ chối khi tổng (cơ sở + dự phòng) vượt `Trần năm − Dự phòng kho`: 409 `BUDGET_VERSION.OVER_CEILING`
  (`details.overBy`, `details.availableMinor`); kỳ không có hoặc còn nháp ⟹ 409 `BUDGET_CYCLE.NOT_OPEN`; khác đồng tiền ⟹ 409
  `BUDGET.CYCLE_CURRENCY_MISMATCH`. Thứ tự khóa thực tế của `send`: grant Người duyệt chi `FOR SHARE` → kỳ `FOR UPDATE` → đề xuất → phiên bản →
  năm. Vì kỳ khóa trước `lockEditable`, một phiên bản không gửi được (`APPROVED`) của năm không có kỳ hoặc kỳ chưa mở nhận 409 `BUDGET_CYCLE.NOT_OPEN`
  thay vì `VERSION_NOT_EDITABLE` (năm đã kết thúc vẫn báo `YEAR_ENDED`). Đổi `base` của bản nháp đòi `baseReason` (422 `BUDGET.BASE_REASON_REQUIRED`;
  "đổi" = khác giá trị đang có, `baseReason` gửi kèm mà không đổi số thì bị bỏ qua), lý do hiện ở lịch sử mỗi lần đổi số. **Trưởng phòng theo năm**
  (`QĐ-106k`, R-I05): `BudgetFactsService.headedUnitsFor/pickHeadedUnit/headedCostCenters` gồm phòng đang làm trưởng phòng và phòng chưa hiệu lực mà
  nhiệm kỳ của người đó bắt đầu đúng ngày hiệu lực; có hai đơn vị cho một năm thì `costCenterId` bắt buộc (422 `BUDGET.COST_CENTER_REQUIRED`). Các route
  B3 (`budgetProposalSubmit/Resubmit/Withdraw`, `budgetMine*`, đính kèm) dùng `RequireRolesOrGrants(['MANAGER'], ['MANAGER'])`: guard chỉ kiểm có grant,
  việc thật do service xét theo đơn vị; vai `MANAGER` của token KHÔNG mở rộng. Người nhận thông báo của phòng chưa hiệu lực là người sắp làm trưởng phòng
  (`currentHeadOf`). **Thứ tự khóa** của `budgets`: kỳ → proposal → version → năm; nộp/nộp lại đọc kỳ `FOR SHARE` ở `ProposalSender.requireOpenCycle`; nộp
  lại đọc và kiểm sở hữu đề xuất không khóa, khóa kỳ trước, rồi mới khóa đề xuất (`ownedLocked`), nên không còn ngoại lệ thứ tự; mọi đường mới khóa kỳ
  `FOR UPDATE` phải đứng đầu thứ tự này. **Vận hành dữ liệu cũ**: môi trường có đề xuất mà chưa có kỳ thì nộp `BM-10` bị 409 `BUDGET_CYCLE.NOT_OPEN` tới khi
  Finance mở kỳ năm hiện tại/năm sau (xem `docs/guides/seed.md` cho dữ liệu demo); kỳ đã có từ trước migration `20261113100400` giữ `opened_at` nên đọc là kỳ Mở (Khóa sau hạn nộp), kể cả kỳ chưa từng phát hành.
- Số liệu nền B1 (`budgetCycleBaseline`, `cycle/baseline.service.ts`, `QĐ-103k`): `basis: HOLDER_DEPARTMENT` — seat đang giữ
  (`LicensingApi.countSeatsByHolderOfSubscriptions`) tính về **phòng hiện tại của người giữ** (`OrganizationReadApi.getOwningUnits`), mọi thuê
  bao `ACTIVE` (kể cả thuê bao kho không có phòng sở hữu); seat Trống của `K2`/`K4` vào dòng công ty `sharedPoolUnallocated`
  (`SHARED_POOL_UNALLOCATED`, chỉ khi đọc cả công ty); mỗi dòng phần mềm có `kpi3` của gói. Mỗi phòng có thêm `carriedOverNextYear` (số chạy sang,
  `CarriedOverContributions`), `belowCarriedOver`, `carriedOverShortfall` và `noProposalSubmitted` (`cycle/baseline-flags.service.ts`). Phiên bản từ số
  liệu nền (`source: BASELINE`, origin `BASELINE_NO_PROPOSAL`) không còn dòng nào: chỉ một số cho cả năm, cơ sở điền sẵn bằng số chạy sang; phiên bản cũ
  `BASELINE_NO_HEAD` chỉ còn để đọc. Người giữ không thuộc phòng nào: seat tính là đã giữ, không vào phòng nào.
- Gói tổng hợp B4 (`budgetCyclePackage`, `cycle/package.service.ts`): mỗi phòng trả `headStatus` (`HAS_HEAD`/`HEAD_TO_COME`/`NO_HEAD`),
  `baselineAllowed` + `baselineRefusal` (cùng `baselineVersionRefusal` với phiên bản `BASELINE`, C4-13), `proposal` (`id`, `total` = số tiền đề nghị,
  `state`) và `version` (`id`, `base`, `reserve`, `total`, `state`, `origin`); không còn Trần phòng đã phát hành và không còn dòng đề xuất. Chỉ phòng
  không có trưởng phòng hôm nay mới hỏi thêm "có người sắp làm trưởng phòng không" (song song).
- `commitment/` — commitment của request, Finance xem (lọc `state`, kèm request, `invoiced`, `invoiceCount`, `hasDiscrepancy`) và nhả phần dư
  (US-06-06, US-06-07, US-12-01); `budget-commitments.controller.ts`; `CommitmentService`. `GET /budget-commitments` đọc được bởi Finance và trưởng phòng (trưởng phòng chỉ thấy Cost Center của phòng mình; Cost Center khác là trang rỗng, D8) và có `longTerm=true` (RV-3, `QĐ-111aj`, US-12-21 AC-8): chỉ cam kết còn giữ (`HELD`) của `year` bắt buộc kèm theo (năm của kỳ đang xem; thiếu ⟹ 422), bất kể ngày lập, cho màn rà soát quý (FIX-RV23 RV3-02, D-104); màn đó không có thao tác thu hồi, thời hạn Request không bị rút.
- `invoice/` — Finance đọc hóa đơn của một commitment (US-12-02, `C-16`): `GET /budget-commitments/{id}/invoices`
  (`budget-invoices.controller.ts`; `InvoiceService`), kèm `servicePeriodMonth` (từ `invoices.service_month`), `label` và `paymentSource` của hóa
  đơn mua đứng sau (điểm mở rộng `PurchaseInvoiceFactsHook`, `requests` bind); dòng cũ hoặc dòng không từ hóa đơn mua trả `null`. Finance không
  ghi hóa đơn tay nữa (PI-1.7, B6): hóa đơn chỉ vào `invoices` qua `BudgetsApi.recordPurchaseInvoice` (`PurchaseInvoiceRecorderService`) khi Finance
  ký hóa đơn mua của IT Admin. Quy tắc thuần ở `budget/invoice.policy.ts` (`planInvoice`, `bookPurchaseInvoice`), SQL ở `budget/invoice.repo.ts`.
- `budget-view/` — trưởng phòng đọc đủ số ngân sách phòng mình (cơ sở, dự phòng, cam kết, thực chi, chờ duyệt chi, hai mức còn lại),
  hai hạn và trạng thái của kỳ (Nháp/Mở/Khóa); không còn Trần phòng. Danh sách phiên bản đã gửi vẫn ở `budgetMineVersionList`. Finance và Người duyệt chi đọc bảng
  reference budget hoặc dòng `NO_BUDGET` có cam kết, `priorPeriodAdjustment` theo mốc 01/01 năm sau trong timezone tổ chức, và ô tổng
  toàn công ty `GET /budgets/summary?year=` (cộng theo từng đồng tiền, có Trần năm/dự phòng kho, `lastInvoiceRecordedAt`).
  `BudgetViewService` giữ đọc phòng mình; `BudgetTableViewService`, `BudgetViewRepo` đọc bảng/tổng; `BudgetViewNumbersService`
  gom số theo lô qua `PendingSpendContributions` cùng nguồn với kiểm ngân sách, gồm cam kết chưa attached khi đọc view.
- `year-end/` — đóng ngân sách của năm đã hết (F62, `QĐ-91c`); `year-end.job.ts` chạy mỗi giờ trong tiến
  trình API (ADR-0018), `year-end.service.ts`.
  Cũng ở đây: nhắc chưa có ngân sách năm sau (`QĐ-111am`, B-4) — `next-year-reminder.policy.ts` (ngày 01/12 rồi mỗi Thứ Hai tới khi có phiên bản được duyệt: tháng 12 nhắc năm sau, từ 01/01 nhắc năm đang chạy),
  `next-year-reminder.service.ts` (nhắc Finance + Người duyệt chi, mỗi Cost Center chưa có phiên bản được duyệt, khóa `nextYearBudget:<costCenterId>:<ngày>`),
  `next-year-reminder.job.ts` (chạy mỗi giờ trong tiến trình API, ADR-0018).
- `attachment/` — tài liệu đính kèm của đề xuất và phiên bản ngân sách: khai báo, hoàn tất tải lên, kiểm tra chữ ký tệp (`UploadInspection`), gỡ khỏi phiên bản, danh sách và liên kết tải về có thời hạn (US-06-09, US-06-10, QĐ-93j); `budget-attachment-uploads.controller.ts`, `budget-attachment-reads.controller.ts`; `BudgetAttachmentDeclarationService`, `BudgetAttachmentCompletionService`, `BudgetAttachmentRemovalService`, `BudgetAttachmentDiscardService`, `BudgetAttachmentQueryService`, `BudgetAttachmentLinkService`, `ProposalAttachmentBinder`, `BudgetAttachmentRepo`, `budget-attachment.policy.ts`. `BudgetAttachmentExpirySweeper` chạy mỗi giờ quét tệp quá hạn (`BudgetAttachmentExpiryService`).

## Bất biến quan trọng

- Thứ tự khóa cố định: hàng proposal → hàng version của Cost Center và năm (theo id) → khóa năm, nhiều năm thì năm
  sớm trước; transaction của request khóa hàng request trước rồi mới khóa năm (`budget-year-lock.repo.ts`, F31). Khai báo tài liệu khóa advisory theo uploader; đính kèm khóa dòng tệp theo id tăng dần.
- Tài liệu đính kèm của đề xuất gắn trong transaction gửi đề xuất và bất biến sau đó. Tài liệu phiên bản chỉ sửa được khi phiên bản ở `DRAFT` hoặc `CHANGES_REQUESTED` chưa detached.
- Một request giữ tối đa một commitment mỗi năm (`@@unique([requestId, year])`, `BudgetCommitmentExistsError`).
- Một commitment giữ `amount − released − applied` (`heldOf`); `applied` là phần giá chưa thuế mà hóa đơn đã làm thành chi phí. Hết giữ mà
  `applied > 0` ⟹ `EXPENSED` (không bao giờ về `HELD`), mà chưa chi ⟹ `RELEASED`; `applied` không giảm (trigger `budget_commitments_guard`).
- Hóa đơn: chi phí thực = giá chưa thuế + thuế không khấu trừ; thuế khấu trừ ghi riêng, không phải chi phí. Ghi trong giao dịch ký của Finance, khóa
  dòng commitment của Request (`lockOfRequest`), khóa năm chỉ cho thực chi không cam kết và **không bao giờ bị chặn vì vượt ngân sách** (`C-08`). Chống trùng `(organization,
vendor, number)`; bảng `invoices` chỉ ghi thêm (trigger + quyền runtime `INSERT, SELECT`).
- Giải phóng (hủy/rút/thất bại) khóa các dòng commitment của Request theo thứ tự năm (`CommitmentRepo.lockOfRequest`, cùng thứ tự với `lockById`) rồi mới đọc, nên xếp hàng sau hóa đơn đang ghi thay vì đọc cũ. Phần chia cho từng người của Request nhóm vượt `held` chỉ giải phóng `held` (phần đã chi không quay về); dòng đã `EXPENSED` bị bỏ qua, dòng `RELEASED` vẫn `NOT_HELD`. Gắn commitment chờ ngân sách vào phiên bản chỉ gắn dòng còn `HELD`.
- `spent` của một Cost Center và năm = Σ chi phí thực của hóa đơn thuộc commitment của chính Cost Center và năm đó (kể cả commitment chưa gắn
  phiên bản) + hóa đơn không commitment ghi thẳng vào Cost Center đó theo năm của tháng dịch vụ (PI-1 `COST_CENTER`, ca ngoài quy trình RC-2); hóa đơn
  gắn thuê bao kho (mọi hóa đơn `K2`, kể cả nối Request: `QĐ-104c`(3)) và ca `UNALLOCATED` không vào `spent` của phòng nào; phòng chịu `K2` bằng **seat-tháng** (`seat_month_charges`, SM-1, MG-03 = A):
  `InvoiceRepo.spentOf` cộng cả `amount_minor` của các dòng seat-tháng có Cost Center theo năm của tháng, nên `yearFacts.spentMinor` (kiểm FR-3.20, snapshot Người duyệt chi),
  bảng/summary ngân sách và `spentThisYear` đều thấy chúng một lần. Tổng thực chi công ty (`companySpent` ở summary) cộng cả hóa đơn kho; dòng _Chưa phân bổ — kho_ = hóa đơn kho −
  seat-tháng (`sharedPoolUnallocated`, so với `sharedPoolReserve` ở `sharedPoolOverReserve`), không lưu. Một Cost Center chỉ có chi không commitment ở một năm vẫn có dòng ở bảng
  và tổng (`BudgetViewRepo` `pairs`, trạng thái `NO_BUDGET`). `held` chỉ tính commitment `HELD` đã gắn phiên bản (`CommitmentRepo.totals`, dùng chung cho bảng, ô tổng và kiểm tra ngân sách).
- Proposal đã gửi không sửa tại chỗ; quyết định version là bản ghi không đổi và không quyết định sau khi năm tài
  chính đã hết (`BUDGET.YEAR_ENDED`, `version-decision.service.ts`).
- Chỉ Finance dựng version; chỉ spending approver quyết định, không ai thay (QĐ-93c, US-06-11 AC-12): chưa ai giữ vai thì
  phiên bản chờ với `waitingReason` `NO_SPENDING_APPROVER`; phiên bản của đề xuất do chính approver gửi (dữ liệu cũ) không ai
  quyết, 403 `BUDGET.CONFLICT_OF_INTEREST` (`budget.policy.ts`). Gửi phiên bản đọc grant `FOR SHARE` (M6).

## Test

- Unit: `src/modules/budgets/**/*.spec.ts`; HTTP: `test/http/budgets/`; integration: `test/integration/budgets/` (hóa đơn:
  `budget-invoices`, `budget-summary`, `budget-commitment-list`), `test/integration/_serial/database-runtime-role-invoice-write` (vai runtime),
  migration: `test/integration/platform/finance-invoices-upgrade`.

- Cam kết (BR-MF1-07d, FR-5.8a, INV-16): duyệt chi giữ **đúng một** khoản cho năm hiện hành, trên phiên bản `APPROVED`; `commitment-hold.policy.ts` từ chối `MORE_THAN_ONE_YEAR`, `NOT_CURRENT_YEAR`, `NOT_POSITIVE`, `NO_APPROVED_BUDGET` (409 `BUDGET.COMMITMENT_NOT_HOLDABLE`). Số tiền 0 không giữ khoản. Khoản năm sau / `NO_BUDGET` ghi trước giữ nguyên (Q-27). Khoản 01/01 do `CommitmentService.holdYearStart` ghi (`origin = YEAR_START`, không `snapshot_check_id`, không kiểm ngân sách): bỏ qua (Request, năm) đã có khoản (UNIQUE INV-16), năm chưa có phiên bản `APPROVED` ⟹ `unattached_reason = 'NO_BUDGET'` rồi `attachWaiting` gắn khi phiên bản được duyệt (`FR-5.8a`, ngoại lệ duy nhất); phiên bản `APPROVED` khác tiền tệ của khoản ⟹ không ghi, trả `refused` `CURRENCY_MISMATCH` (số tiền do job quy về tiền tệ báo cáo); thứ tự khóa Request → khóa năm (job `requests/year-start-commitments`).

- Thực chi của ca ngoài quy trình (`SBF-07a`, RC-2, R-45): `BudgetsApi.recordOutOfProcessSpend` (`invoice/out-of-process-spend-recorder.service.ts`) ghi MỘT dòng `invoices` (số `OOP-<caseId>`, VND, không cam kết, `out_of_process_case_id`, tháng ghi nhận) cho Cost Center chịu hoặc chưa phân bổ (`cost_center_id` rỗng); khóa năm ngân sách của Cost Center như thực chi không cam kết; không bao giờ từ chối vì vượt ngân sách (`C-08`). Người gọi là `usage` khi đóng ca `RECORD_SPENT`.

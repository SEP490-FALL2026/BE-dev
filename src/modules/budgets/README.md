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

- `BudgetsApi` ([public/budgets.api.ts](public/budgets.api.ts)) — những gì request đọc và giữ; không hàm nào sửa
  ngân sách:
  - `yearFacts` — ngân sách hiện hành của từng năm cho một Cost Center (năm chưa có ngân sách thì vắng mặt).
  - `planLine`, `currentLine`, `currentLines` — dòng kế hoạch mà request nêu, đọc từ version hiện hành.
  - `holdForRequest` — request giữ số tiền mỗi năm, trong transaction của quyết định duyệt (US-06-04).
  - `releaseForRequest` — trả phần request còn giữ về ngân sách khi request kết thúc/rút bớt (US-06-06).
  - `holdYearStart`, `listRequestsHoldingYear` — khoản cam kết ngày 01/01 (`FR-5.8`(6), `QĐ-109a`): job của `requests` giữ một khoản cho mỗi Request
    có quyền `K1`/`K2` đang chạy hoặc đã duyệt chi chưa cấp; chỉ Request mới có khoản, không có khoản theo Assignment.
  - `requestHoldsCommitment` — request có giữ commitment không, điều kiện để Finance đọc nó (US-06-09 AC-2).
  - `committedByRequests` — số tiền mỗi commitment của một loạt request, một lần đọc (danh sách lô chi của Finance).
- `public/budgets.types.ts` — input/output của facade (`YearBudgetFacts`, `PlanLineFacts`, `CommitmentHoldInput`…).
- `public/budgets.extension-points.ts` — ba point dưới đây, contract `BudgetChangeListener`,
  `CommitmentReleaseGuard`, `CommitmentRequestFacts` (+ `CommitmentRequestView`) và hàm `budgetChangeHandler`.

## Bảng sở hữu

- `budget_proposals`, `budget_proposal_lines`, `budget_versions`, `budget_version_lines`,
  `budget_version_line_changes` (còn trong DB, không còn code ghi), `budget_version_decisions`, `budget_version_history`, `budget_commitments`,
  `budget_commitment_releases` (`budget_commitments.origin` = `APPROVAL` hoặc `YEAR_START`; `seat_monthly_minor` giá tháng một seat lúc ghi khoản 01/01), `invoices`, `budget_attachments` (`prisma/models/budgets.prisma`). Kiểm ngân sách của request
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
  `budget/spending-approver-wait.listener.ts`: Super Admin nhận một `CONTROLLED_WAIT_ALERT` (`subject` `BUDGET_VERSION`) mỗi
  đoạn chờ — khi gửi lúc chưa có người giữ vai, khi vai bị thu hồi, khi người giữ vai nghỉ việc (QĐ-93c, D-S16).
- Đăng ký vào: `organization.change-listeners` (`budgets.head-change`) —
  `proposal/budget-head-change.listener.ts`; `organization.cost-center-use-readers` (`budgets.commitments`) —
  `commitment/budget-cost-center-use.listener.ts`. Năm ngân sách là năm dương lịch: không còn tham số tháng bắt đầu
  năm tài chính, không còn extension point khóa tham số (`QĐ-104e`(1)).

## Capability và file chính

Một lõi `budget/` và sáu capability cùng cấp với nó. Lõi giữ repo, policy, dto, lỗi và notifier dùng chung (`proposal.repo.ts`,
`version.repo.ts`, `commitment.repo.ts`, `budget-year-lock.repo.ts`, `budget-facts.repo.ts`, `budget.policy.ts`,
`budget-notifier.service.ts`, `version-view.service.ts`, `budget.dto.ts`); lõi không import capability nào, mỗi capability chỉ
import lõi (`pnpm arch:capabilities --module budgets`).

- `proposal/` — đề xuất của trưởng phòng: gửi, rút, Finance trả lời, gửi lại (US-06-10);
  `budget-proposals.controller.ts`; `ProposalService`, `ProposalViewService`, `ProposalSender`. **Dòng `BM-10`** (SPEC MF4-B, `QĐ-101n`,
  `QĐ-94l`, `QĐ-109c/d`): mỗi dòng có `lineType` (`RENEW`/`CHANGE`/`NEW`/`CANCEL`), `priorityRank` thật do client gửi (duy nhất trong đề xuất,
  ≥ 1; trùng ⟹ 422 `BUDGET.PRIORITY_RANK_INVALID`, `details.positions`), `zbb { purpose, alternatives, consequenceIfNot, usageIndicator }` (mỗi
  chuỗi 1–1000) và `overCeiling` do **server** tính lúc nộp. Luật thuần ở `proposal/proposal-line-rules.policy.ts`
  (`duplicateRankPositions`, `zbbMissingPositions`, `overCeilingParts`, `overCeilingNoteMissing`, `countedTotalOf`); `ProposalLineJudge`
  gom đầu vào thật cho luật (tham số `BUDGET_ZBB_*` của Finance, giá tháng hiện hành của gói `M-17`, Trần đã phát hành). `zbb` bắt buộc ở dòng
  `NEW` (422 `BUDGET.ZBB_REQUIRED`), ở dòng `RENEW`/`CHANGE` có `KPI-3` của **gói của dòng** dưới ngưỡng (`QĐ-109d`; `KPI-3` chưa có nguồn
  nên `kpi3ByPlan` rỗng, W6), và ở dòng không phải `CANCEL` có đơn giá tăng quá ngưỡng so với giá tháng quy đổi của gói (chỉ gói định kỳ,
  cùng đồng tiền báo cáo). Cờ vượt (`overCeiling` = phần vượt) tính theo **Trần đã phát hành** `published_total_minor` (S4-01), cộng dồn theo
  hạng; dòng có cờ thiếu `note` ⟹ 422 `BUDGET.OVER_CEILING_NOTE_REQUIRED`; phòng chưa có Trần đã phát hành ⟹ không cờ; không bao giờ chặn
  vì vượt. Dòng `CANCEL` chỉ hiển thị số tiền: **không** cộng vào tổng đề xuất, tổng gói B4 hay cờ vượt (`QĐ-109c`). Phòng chưa có Cost
  Center không có nháp `BM-10` ở BE (C4-12, TẠM CHỌN: FE giữ nháp cục bộ).
- `version/` — version: tạo, sửa dòng, import file dòng, gửi duyệt, quyết định, lịch sử (US-06-09, US-06-11);
  `budget-versions.controller.ts`, `budget-version-lines.controller.ts`; `VersionService`, `VersionLineService`,
  `VersionDecisionService`, `LineImportService`. `VersionDecisionService` điều phối `VersionDecisionJudge` (xAct) và
  `VersionDecisionWriter` (ghi); các bước còn lại tách theo việc: `VersionCreationService`, `VersionBaselineCreationService`,
  `VersionFigures`, `VersionTrail`, `VersionAccessService` (khóa và kiểm lỗi). Không còn phiên bản sửa đổi (`REVISION`), trạng thái
  `SUPERSEDED` hay dời khoảng mua (`QĐ-97b`, `QĐ-104e`(1)); DB chặn `SUPERSEDED` bằng `budget_versions_no_superseded`, chặn `REVISION`/`based_on_version_id` bằng `budget_versions_initial_only`
  (`NOT VALID`), và trigger `*_retired_columns` từ chối ghi giá trị mới vào cột đã gỡ (`reason`, `high_value_*` của phiên bản; `window_*`,
  `service_period_months`, `repeat_cycle`, `quote_valid_until` của dòng) — dòng cũ giữ giá trị và vẫn sửa được cột khác; `budget_version_line_changes`
  không nhận dòng mới; `line_type` không có mặc định (RV-15). Wire `budgetVersionGet/List` không còn `kind`, `state` không còn `SUPERSEDED`. Dòng phiên bản mang
  `lineType`, `zbb`, `priorityRank` sao từ dòng đề xuất (kèm `overCeiling` của dòng đề xuất nó điều chỉnh, để Người duyệt chi đọc ở B5 — chỉ khi dòng phiên bản còn đúng dòng đề xuất: có
  `adjustmentReason` hoặc là `CANCEL` thì không cờ, `versionLineOverCeiling`);
  Finance thêm dòng phải có `lineType` (hạng và `zbb` tùy chọn), sửa dòng giữ nguyên `zbb`/hạng khi không gửi (`null` để bỏ), đổi `lineType`
  của dòng từ đề xuất cần `adjustmentReason`; file import có cột `line_type` (mỗi dòng thiếu/sai ⟹ báo `LINE_TYPE_INVALID` theo dòng) và
  `priority_rank` tùy chọn. Phiên bản `BASELINE_NO_HEAD` dùng `lineType`: chi phí trong năm của thuê bao (kể cả các tháng còn chạy trước ngày
  dừng đã đặt) ⟹ `RENEW` (các kỳ cùng gói gộp một dòng; cơ sở = số liệu nền), phần tiết kiệm của thuê bao đã đặt chấm dứt (các tháng sau tháng
  dừng, cả năm nếu dừng trước năm) ⟹ `CANCEL` (hiển thị, không cộng vào cơ sở) (C4-14, `baselineLinesOf`, `cancelledCost`). Quyết định và nhả cam kết là hàm thuần trong
  `budget/budget.policy.ts`.
- `cycle/` — kỳ lập ngân sách của một năm (`QĐ-103i`, `US-06-15`): Finance mở kỳ (hạn nộp, hạn duyệt, Trần ngân sách phần mềm năm, ưu tiên), đổi Trần năm kèm lý do, chia Trần của phòng (ba thành phần, kèm diễn giải) cho mọi phòng đang hoạt động cùng Dự phòng kho dùng chung, rồi phát hành; Người duyệt chi và Finance đọc. Sáu operation: `budgetCycleOpen/List/Get/Update`, `budgetDepartmentCeilingsSet`, `budgetCyclePublish`. Bảng `budget_cycles`, `budget_department_ceilings`; `CycleService`, `CycleRepo`, `cycle.policy.ts` (`judgePublish`, `departmentsToTell`, `cycleAcceptsWork`). Năm đã qua chỉ đọc; sửa Trần năm hoặc chia lại **bỏ phát hành** (`published_at` NULL) nhưng giữ `first_published_at`, nên trưởng phòng vẫn nộp `BM-10` (điều kiện là `cycleAcceptsWork`, câu tạm chọn W2). Phát hành bị chặn vẫn ghi Audit Trail (mã + chênh lệch). **Nhắc hạn** (`R-I05`, `QĐ-108e`): `CycleDeadlineSweeper` (mỗi giờ, trong tiến trình API) gọi `CycleDeadlineService.run`; `deadlineDuties` (policy) nói hôm nay kỳ nợ gì: qua hạn nộp ⟹ trưởng phòng chưa nộp `BUDGET_PROPOSAL_DEADLINE_REMINDER`, Finance và Super Admin `BUDGET_NO_HEAD_AT_DEADLINE` (phòng không có trưởng phòng và cũng chưa có kế nhiệm), Finance `BUDGET_SUBMISSION_DEADLINE_PASSED`; qua hạn duyệt ⟹ Người duyệt chi và Finance `BUDGET_DECISION_DEADLINE_REMINDER`; trước hạn nộp ⟹ Finance `BUDGET_COST_CENTER_SETUP_DUE` một lần cho mỗi (kỳ, phòng) thiếu Cost Center. Khóa sự kiện chứa kỳ và ngày hạn: chạy lại không ghi thêm, dời hạn thì nhắc lại. `BudgetHeadChangeListener` báo trưởng phòng mới `BUDGET_BASELINE_VERSION_HEAD_ASSIGNED` khi phòng có phiên bản `BASELINE_NO_HEAD` còn dở. Thông báo `BUDGET_CYCLE_OPENED` (trưởng phòng; Người duyệt chi không nhận theo QT 4.1) và `BUDGET_DEPARTMENT_CEILING_PUBLISHED` (chỉ phòng đổi tổng). Tập phòng chia Trần: `OrganizationReadApi.getActiveDepartmentIds(year, tx)` (phòng đang hoạt động và hiệu lực trong năm đó). **Kiểm B4 khi gửi phiên bản** (`R-I06`, `QĐ-103i`): `VersionAccessService.requireWithinAnnualCeiling` cộng, với mỗi Cost Center của năm, phiên bản MỚI NHẤT (theo `number`) trong `SENT`/`CHANGES_REQUESTED`/`APPROVED` (Q-22; `DRAFT`, `REJECTED`, `EXPIRED` và bản đã tách không tính; DB chỉ cho bản tách ở `DRAFT`/`EXPIRED`), phiên bản đang gửi thay bản cùng Cost Center, và từ chối khi tổng (cơ sở + dự phòng) vượt `Trần năm − Dự phòng kho`: 409 `BUDGET.OVER_ANNUAL_CEILING`; kỳ chưa từng phát hành ⟹ 409 `CYCLE_NOT_PUBLISHED`; khác đồng tiền ⟹ 409 `CYCLE_CURRENCY_MISMATCH`. Thứ tự khóa thực tế của `send`: grant Người duyệt chi `FOR SHARE` → kỳ `FOR UPDATE` → đề xuất → phiên bản → năm. Vì kỳ khóa trước `lockEditable`, một phiên bản không gửi được (`APPROVED`, `REVISION`) của năm không có kỳ hoặc kỳ chưa phát hành nhận 409 `CYCLE_NOT_PUBLISHED` thay vì `VERSION_NOT_EDITABLE` (năm đã kết thúc vẫn báo `YEAR_ENDED`). Đổi `base` của bản nháp đòi `baseReason` (422 `BUDGET.BASE_REASON_REQUIRED`; "đổi" = khác giá trị đang có, `baseReason` gửi kèm mà không đổi số thì bị bỏ qua), lý do hiện ở lịch sử mỗi lần đổi số. **Trưởng phòng theo năm** (`QĐ-106k`, R-I05): `BudgetFactsService.headedUnitsFor/pickHeadedUnit/headedCostCenters` gồm phòng đang làm trưởng phòng và phòng chưa hiệu lực mà nhiệm kỳ của người đó bắt đầu đúng ngày hiệu lực; có hai đơn vị cho một năm thì `costCenterId` bắt buộc (422 `BUDGET.COST_CENTER_REQUIRED`). Các route B3 (`budgetProposalSubmit/Resubmit/Withdraw`, `budgetMine*`, đính kèm) dùng `RequireRolesOrGrants(['MANAGER'], ['MANAGER'])`: guard chỉ kiểm có grant, việc thật do service xét theo đơn vị; vai `MANAGER` của token KHÔNG mở rộng. Người nhận thông báo của phòng chưa hiệu lực là người sắp làm trưởng phòng (`currentHeadOf`). **Thứ tự khóa** của `budgets`: kỳ → proposal → version → năm; nộp/nộp lại đọc kỳ `FOR SHARE` ở `ProposalSender.requirePublishedCycle`; nộp lại đọc và kiểm sở hữu đề xuất không khóa, khóa kỳ trước, rồi mới khóa đề xuất (`ownedLocked`), nên không còn ngoại lệ thứ tự; mọi đường mới khóa kỳ `FOR UPDATE` phải đứng đầu thứ tự này. Diễn giải của Trần phòng **bắt buộc khi phát hành** (QT 4.3; thiếu ⟹ `BUDGET.CEILINGS_INCOMPLETE` với `details.explanationMissingDepartmentIds`); chỉ đổi diễn giải thì không bỏ phát hành, chỉ đổi số mới bỏ. **Vận hành dữ liệu cũ**: môi trường có đề xuất mà chưa có kỳ thì nộp `BM-10` bị 409 `BUDGET.CYCLE_NOT_PUBLISHED` tới khi Finance mở và phát hành kỳ năm hiện tại/năm sau (xem `docs/guides/seed.md` cho dữ liệu demo).
- Gói tổng hợp B4 (`budgetCyclePackage`, `cycle/package.service.ts`): mỗi phòng trả thêm `publishedCeiling`, `headStatus`
  (`HAS_HEAD`/`HEAD_TO_COME`/`NO_HEAD`), `baselineAllowed` + `baselineRefusal` (cùng `baselineVersionRefusal` với phiên bản `BASELINE`, C4-13) và
  `proposal.lines[]` (`position`, `lineType`, `priorityRank`, `amount`, `overCeiling`) sắp theo hạng; `proposal.total` và `proposalsTotal` không cộng
  dòng `CANCEL`. Chỉ phòng không có trưởng phòng hôm nay mới hỏi thêm "có người sắp làm trưởng phòng không" (song song).
- `commitment/` — commitment của request, Finance xem (lọc `state`, kèm request, `invoiced`, `invoiceCount`, `hasDiscrepancy`) và nhả phần dư
  (US-06-06, US-06-07, US-12-01); `budget-commitments.controller.ts`; `CommitmentService`.
- `invoice/` — Finance ghi và đọc hóa đơn của một commitment (US-12-02, `C-16`): `POST/GET /budget-commitments/{id}/invoices`;
  `budget-invoices.controller.ts`; `InvoiceService`. Quy tắc thuần ở `budget/invoice.policy.ts` (`planInvoice`), SQL ở
  `budget/invoice.repo.ts`.
- `budget-view/` — trưởng phòng đọc đủ số ngân sách phòng mình (cơ sở, dự phòng, cam kết, thực chi, chờ duyệt chi, hai mức còn lại),
  Trần phòng đang phát hành và hạn kỳ; danh sách phiên bản đã gửi vẫn ở `budgetMineVersionList`. Finance và Người duyệt chi đọc bảng
  reference budget hoặc dòng `NO_BUDGET` có cam kết, `priorPeriodAdjustment` theo mốc 01/01 năm sau trong timezone tổ chức, và ô tổng
  toàn công ty `GET /budgets/summary?year=` (cộng theo từng đồng tiền, có Trần năm/dự phòng kho, `lastInvoiceRecordedAt`).
  `BudgetViewService` giữ đọc phòng mình; `BudgetTableViewService`, `BudgetViewRepo` đọc bảng/tổng; `BudgetViewNumbersService`
  gom số theo lô qua `PendingSpendContributions` cùng nguồn với kiểm ngân sách, gồm cam kết chưa attached khi đọc view.
- `year-end/` — đóng ngân sách của năm đã hết (F62, `QĐ-91c`); `year-end.job.ts` chạy mỗi giờ trong tiến
  trình API (ADR-0018), `year-end.service.ts`.
- `attachment/` — tài liệu đính kèm của đề xuất và phiên bản ngân sách: khai báo, hoàn tất tải lên, kiểm tra chữ ký tệp (`UploadInspection`), gỡ khỏi phiên bản, danh sách và liên kết tải về có thời hạn (US-06-09, US-06-10, QĐ-93j); `budget-attachment-uploads.controller.ts`, `budget-attachment-reads.controller.ts`; `BudgetAttachmentDeclarationService`, `BudgetAttachmentCompletionService`, `BudgetAttachmentRemovalService`, `BudgetAttachmentDiscardService`, `BudgetAttachmentQueryService`, `BudgetAttachmentLinkService`, `ProposalAttachmentBinder`, `BudgetAttachmentRepo`, `budget-attachment.policy.ts`. `BudgetAttachmentExpirySweeper` chạy mỗi giờ quét tệp quá hạn (`BudgetAttachmentExpiryService`).

## Bất biến quan trọng

- Thứ tự khóa cố định: hàng proposal → hàng version của Cost Center và năm (theo id) → khóa năm, nhiều năm thì năm
  sớm trước; transaction của request khóa hàng request trước rồi mới khóa năm (`budget-year-lock.repo.ts`, F31). Khai báo tài liệu khóa advisory theo uploader; đính kèm khóa dòng tệp theo id tăng dần.
- Tài liệu đính kèm của đề xuất gắn trong transaction gửi đề xuất và bất biến sau đó. Tài liệu phiên bản chỉ sửa được khi phiên bản ở `DRAFT` hoặc `CHANGES_REQUESTED` chưa detached.
- Một request giữ tối đa một commitment mỗi năm (`@@unique([requestId, year])`, `BudgetCommitmentExistsError`).
- Một commitment giữ `amount − released − applied` (`heldOf`); `applied` là phần giá chưa thuế mà hóa đơn đã làm thành chi phí. Hết giữ mà
  `applied > 0` ⟹ `EXPENSED` (không bao giờ về `HELD`), mà chưa chi ⟹ `RELEASED`; `applied` không giảm (trigger `budget_commitments_guard`).
- Hóa đơn: chi phí thực = giá chưa thuế + thuế không khấu trừ; thuế khấu trừ ghi riêng, không phải chi phí. Ghi trong một giao dịch, khóa dòng
  commitment (`lockById`), không khóa năm ngân sách và **không bao giờ bị chặn vì vượt ngân sách** (`C-08`). Chống trùng `(organization,
vendor, number)`; bảng `invoices` chỉ ghi thêm (trigger + quyền runtime `INSERT, SELECT`).
- Giải phóng (hủy/rút/thất bại) khóa các dòng commitment của Request theo thứ tự năm (`CommitmentRepo.lockOfRequest`, cùng thứ tự với `lockById`) rồi mới đọc, nên xếp hàng sau hóa đơn đang ghi thay vì đọc cũ. Phần chia cho từng người của Request nhóm vượt `held` chỉ giải phóng `held` (phần đã chi không quay về); dòng đã `EXPENSED` bị bỏ qua, dòng `RELEASED` vẫn `NOT_HELD`. Gắn commitment chờ ngân sách vào phiên bản chỉ gắn dòng còn `HELD`.
- `spent` của một Cost Center và năm = Σ chi phí thực của hóa đơn thuộc commitment của chính Cost Center và năm đó, kể cả commitment chưa gắn
  phiên bản; `held` chỉ tính commitment `HELD` đã gắn phiên bản (`CommitmentRepo.totals`, dùng chung cho bảng, ô tổng và kiểm tra ngân sách).
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

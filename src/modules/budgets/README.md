# budgets

Mục đích: ngân sách theo Cost Center và năm tài chính — đề xuất của trưởng phòng, các version Finance dựng và spending
approver quyết định, commitment mà request giữ trên ngân sách, hóa đơn Finance ghi để commitment thành thực chi, đóng năm
tài chính đã hết. Story chính: US-06-04, US-06-06, US-06-07, US-06-08, US-06-09, US-06-10, US-06-11, US-06-12, US-12-01,
US-12-02 (ADR-0016).
Tầng: T5 (`scripts/arch/tiers.cjs`). Phụ thuộc: organization, finance, catalog, identity-access, operating-parameters,
audit, notifications. Được dùng bởi: requests; gốc `src/app/app.module.ts`.

## Public API (`public/`)

- `BudgetsApi` ([public/budgets.api.ts](public/budgets.api.ts)) — những gì request đọc và giữ; không hàm nào sửa
  ngân sách:
  - `yearFacts` — ngân sách hiện hành của từng năm cho một Cost Center (năm chưa có ngân sách thì vắng mặt).
  - `planLine`, `currentLine`, `currentLines` — dòng kế hoạch mà request nêu, đọc từ version hiện hành.
  - `holdForRequest` — request giữ số tiền mỗi năm, trong transaction của quyết định duyệt (US-06-04).
  - `releaseForRequest` — trả phần request còn giữ về ngân sách khi request kết thúc/rút bớt (US-06-06).
  - `requestHoldsCommitment` — request có giữ commitment không, điều kiện để Finance đọc nó (US-06-09 AC-2).
  - `committedByRequests` — số tiền mỗi commitment của một loạt request, một lần đọc (danh sách lô chi của Finance).
- `public/budgets.types.ts` — input/output của facade (`YearBudgetFacts`, `PlanLineFacts`, `CommitmentHoldInput`…).
- `public/budgets.extension-points.ts` — ba point dưới đây, contract `BudgetChangeListener`,
  `CommitmentReleaseGuard`, `CommitmentRequestFacts` (+ `CommitmentRequestView`) và hàm `budgetChangeHandler`.

## Bảng sở hữu

- `budget_proposals`, `budget_proposal_lines`, `budget_versions`, `budget_version_lines`,
  `budget_version_line_changes`, `budget_version_decisions`, `budget_version_history`, `budget_commitments`,
  `budget_commitment_releases`, `invoices`, `budget_attachments` (`prisma/models/budgets.prisma`). Kiểm ngân sách của request
  (`request_budget_checks`…) thuộc `requests`.

## Extension point

- Mở `BudgetChangeListeners` (`budgets.change-listeners`, Listeners; `LOCK_WAITING`, `VERSION_APPROVED`,
  `VERSION_REFUSED`, `VERSION_EXPIRED`, `PLAN_LINE_MOVED`) — requests `finance-review/spend-budget.listener.ts`.
  Phát từ `version-decision.service.ts`, `version-line.service.ts`, `year-end.service.ts`.
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
  `budget-proposals.controller.ts`; `ProposalService`, `ProposalViewService`, `ProposalSender`.
- `version/` — version: tạo, sửa dòng, import file dòng, gửi duyệt, quyết định, lịch sử (US-06-09, US-06-11);
  `budget-versions.controller.ts`, `budget-version-lines.controller.ts`; `VersionService`, `VersionLineService`,
  `VersionDecisionService`, `LineImportService`. `VersionDecisionService` điều phối `VersionDecisionJudge` (xAct) và
  `VersionDecisionWriter` (ghi); các bước còn lại tách theo việc: `VersionCreationService`, `VersionRevisionService`,
  `VersionWindowService`, `VersionFigures`, `VersionTrail`, `VersionLineMovedNotifier`, `VersionAccessService` (khóa và
  kiểm lỗi). Quyết định, nhả cam kết và đổi dòng là hàm thuần trong `budget/budget.policy.ts`.
- `cycle/` — kỳ lập ngân sách của một năm (`QĐ-103i`, `US-06-15`): Finance mở kỳ (hạn nộp, hạn duyệt, Trần ngân sách phần mềm năm, ưu tiên), đổi Trần năm kèm lý do, chia Trần của phòng (ba thành phần, kèm diễn giải) cho mọi phòng đang hoạt động cùng Dự phòng kho dùng chung, rồi phát hành; Người duyệt chi và Finance đọc. Sáu operation: `budgetCycleOpen/List/Get/Update`, `budgetDepartmentCeilingsSet`, `budgetCyclePublish`. Bảng `budget_cycles`, `budget_department_ceilings`; `CycleService`, `CycleRepo`, `cycle.policy.ts` (`judgePublish`, `departmentsToTell`, `cycleAcceptsWork`). Năm đã qua chỉ đọc; sửa Trần năm hoặc chia lại **bỏ phát hành** (`published_at` NULL) nhưng giữ `first_published_at`, nên trưởng phòng vẫn nộp `BM-10` (điều kiện là `cycleAcceptsWork`, câu tạm chọn W2). Phát hành bị chặn vẫn ghi Audit Trail (mã + chênh lệch). Thông báo `BUDGET_CYCLE_OPENED` (trưởng phòng; Người duyệt chi không nhận theo QT 4.1) và `BUDGET_DEPARTMENT_CEILING_PUBLISHED` (chỉ phòng đổi tổng). Tập phòng chia Trần: `OrganizationReadApi.getActiveDepartmentIds` (hạng mục `department-effective-year` thêm điều kiện ngày hiệu lực). **Thứ tự khóa** của `budgets`: kỳ → proposal → version → năm; nộp/nộp lại đọc kỳ `FOR SHARE` ở `ProposalSender.requirePublishedCycle`; nộp lại đọc và kiểm sở hữu đề xuất không khóa, khóa kỳ trước, rồi mới khóa đề xuất (`ownedLocked`), nên không còn ngoại lệ thứ tự; mọi đường mới khóa kỳ `FOR UPDATE` phải đứng đầu thứ tự này. Diễn giải của Trần phòng **bắt buộc khi phát hành** (QT 4.3; thiếu ⟹ `BUDGET.CEILINGS_INCOMPLETE` với `details.explanationMissingDepartmentIds`); chỉ đổi diễn giải thì không bỏ phát hành, chỉ đổi số mới bỏ. **Vận hành dữ liệu cũ**: môi trường có đề xuất mà chưa có kỳ thì nộp `BM-10` bị 409 `BUDGET.CYCLE_NOT_PUBLISHED` tới khi Finance mở và phát hành kỳ năm hiện tại/năm sau (xem `docs/guides/seed.md` cho dữ liệu demo).
- `commitment/` — commitment của request, Finance xem (lọc `state`, kèm request, `invoiced`, `invoiceCount`, `hasDiscrepancy`) và nhả phần dư
  (US-06-06, US-06-07, US-12-01); `budget-commitments.controller.ts`; `CommitmentService`.
- `invoice/` — Finance ghi và đọc hóa đơn của một commitment (US-12-02, `C-16`): `POST/GET /budget-commitments/{id}/invoices`;
  `budget-invoices.controller.ts`; `InvoiceService`. Quy tắc thuần ở `budget/invoice.policy.ts` (`planInvoice`), SQL ở
  `budget/invoice.repo.ts`.
- `budget-view/` — trưởng phòng đọc ngân sách phòng mình và danh sách phiên bản đã gửi (`budgetMineVersionList`), Finance đọc bảng mọi version hiện hành
  (`base`, `reserve`, `total`, `committed`, `spent`, `remaining`) và **ô tổng toàn công ty** `GET /budgets/summary?year=` (cộng theo từng
  đồng tiền, `totals` là map theo mã đồng tiền, kèm `lastInvoiceRecordedAt`); `budgets.controller.ts`; `BudgetViewService`.
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
- `BudgetChangeListeners` chạy trong transaction của thay đổi, listener nào lỗi thì thay đổi bị rollback;
  `LOCK_WAITING` phát trước khi lấy khóa năm.

## Test

- Unit: `src/modules/budgets/**/*.spec.ts`; HTTP: `test/http/budgets/`; integration: `test/integration/budgets/` (hóa đơn:
  `budget-invoices`, `budget-summary`, `budget-commitment-list`), `test/integration/_serial/database-runtime-role-invoice-write` (vai runtime),
  migration: `test/integration/platform/finance-invoices-upgrade`.

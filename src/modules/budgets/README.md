# budgets

Mục đích: ngân sách theo Cost Center và năm tài chính — đề xuất của trưởng phòng, các version Finance dựng và spending
approver quyết định, commitment mà request giữ trên ngân sách, đóng năm tài chính đã hết. Story chính: US-06-04,
US-06-06, US-06-07, US-06-08, US-06-09, US-06-10, US-06-11, US-06-12 (ADR-0016).
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
- `public/budgets.types.ts` — input/output của facade (`YearBudgetFacts`, `PlanLineFacts`, `CommitmentHoldInput`…).
- `public/budgets.extension-points.ts` — hai point dưới đây, contract `BudgetChangeListener`,
  `CommitmentReleaseGuard` và hàm `budgetChangeHandler`.

## Bảng sở hữu

- `budget_proposals`, `budget_proposal_lines`, `budget_versions`, `budget_version_lines`,
  `budget_version_line_changes`, `budget_version_decisions`, `budget_version_history`, `budget_commitments`,
  `budget_commitment_releases` (`prisma/models/budgets.prisma`). Kiểm ngân sách của request
  (`request_budget_checks`…) thuộc `requests`.

## Extension point

- Mở `BudgetChangeListeners` (`budgets.change-listeners`, Listeners; `LOCK_WAITING`, `VERSION_APPROVED`,
  `VERSION_REFUSED`, `VERSION_EXPIRED`, `PLAN_LINE_MOVED`) — requests `finance-review/spend-budget.listener.ts`.
  Phát từ `version-decision.service.ts`, `version-line.service.ts`, `year-end.service.ts`.
- Mở `CommitmentReleaseGuardHook` (`budgets.commitment-release-guard`, Hook) — requests
  `spend/commitment-release.listener.ts`. Chưa bind thì nhả phần dư thất bại thay vì cho qua.
- Đăng ký vào: `organization.change-listeners` (`budgets.head-change`) —
  `proposal/budget-head-change.listener.ts`; `organization.cost-center-use-readers` (`budgets.commitments`) —
  `commitment/budget-cost-center-use.listener.ts`.

## Capability → file chính

Một lõi `budget/` và năm capability cùng cấp với nó. Lõi giữ repo, policy, dto, lỗi và notifier dùng chung (`proposal.repo.ts`,
`version.repo.ts`, `commitment.repo.ts`, `budget-year-lock.repo.ts`, `budget-facts.repo.ts`, `budget.policy.ts`,
`budget-notifier.service.ts`, `version-view.service.ts`, `budget.dto.ts`); lõi không import capability nào, mỗi capability chỉ
import lõi (`pnpm arch:capabilities --module budgets`: năm cạnh, không vòng).

- `proposal/` — đề xuất của trưởng phòng: gửi, rút, Finance trả lại, gửi lại (US-06-10);
  `budget-proposals.controller.ts`; `ProposalService`, `ProposalViewService`.
- `version/` — version: tạo, sửa dòng, import file dòng, gửi duyệt, quyết định, lịch sử (US-06-09, US-06-11);
  `budget-versions.controller.ts`, `budget-version-lines.controller.ts`; `VersionService`, `VersionLineService`,
  `VersionDecisionService`, `LineImportService`. `VersionDecisionService` điều phối `VersionDecisionJudge` (xét) và
  `VersionDecisionWriter` (ghi); các bước còn lại tách theo việc: `VersionCreationService`, `VersionRevisionService`,
  `VersionWindowService`, `VersionFigures`, `VersionTrail`, `VersionLineMovedNotifier`, `VersionAccessService` (khóa và
  kiểm lại). Quyết định, nhả cam kết và đổi dòng là hàm thuần trong `budget/budget.policy.ts`.
- `commitment/` — commitment của request, Finance xem và nhả phần dư (US-06-06, US-06-07);
  `budget-commitments.controller.ts`; `CommitmentService`.
- `budget-view/` — trưởng phòng đọc ngân sách phòng mình, Finance đọc bảng mọi version hiện hành;
  `budgets.controller.ts`; `BudgetViewService`.
- `year-end/` — đóng ngân sách của năm đã hết (F62, `QĐ-91c`); `year-end.job.ts` chạy mỗi giờ trong tiến
  trình API (ADR-0018), `year-end.service.ts`.

## Bất biến quan trọng

- Thứ tự khóa cố định: hàng proposal → hàng version của Cost Center và năm (theo id) → khóa năm, nhiều năm thì năm
  sớm trước; transaction của request khóa hàng request trước rồi mới khóa năm (`budget-year-lock.repo.ts`, F31).
- Một request giữ tối đa một commitment mỗi năm (`@@unique([requestId, year])`, `BudgetCommitmentExistsError`).
- Proposal đã gửi không sửa tại chỗ; quyết định version là bản ghi không đổi và không quyết định sau khi năm tài
  chính đã hết (`BUDGET.YEAR_ENDED`, `version-decision.service.ts`).
- Chỉ Finance dựng version; người quyết định là spending approver hoặc người thay khi approver gửi proposal đó
  (`budget.policy.ts`, US-06-08 AC-11).
- `BudgetChangeListeners` chạy trong transaction của thay đổi, listener ném lỗi thì thay đổi bị rollback;
  `LOCK_WAITING` phát trước khi lấy khóa năm.

## Test

- Unit: `src/modules/budgets/**/*.spec.ts`; HTTP: chưa có `test/http/budgets/`; integration:
  `test/integration/budgets/`.

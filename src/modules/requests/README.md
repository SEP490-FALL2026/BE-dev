# requests

Mục đích: request xin quyền dùng phần mềm và các bước quyết định nó — nhu cầu, thẩm định phần mềm mới, chi tiêu
(Finance, spending approver, batch), grant; cùng request nhóm, trả ghế, gia hạn, service account, trạng thái, SLA và
chuyển bước khi tổ chức đổi (ADR-0015). Story chính: US-05-01 → US-05-04, US-05-06, US-05-08 → US-05-15, US-05-17,
US-05-18, US-05-20, US-05-21, US-06-01 → US-06-03, US-06-12 → US-06-14; US-03-02 (gửi thay), US-03-04 (nghỉ việc).
Tầng: T5 (`scripts/arch/tiers.cjs`). Phụ thuộc: budgets, licensing, catalog, organization, identity-access, finance,
operating-parameters, audit, notifications. Được dùng bởi: personnel, dashboards; gốc `src/app/app.module.ts`,
`src/worker/worker.module.ts`, `src/worker/request-work.job.ts`. Nest module: `requests.module.ts` (API, mọi
controller) và `requests-work-facade.module.ts` (phần worker chạy, API dùng chung: chuyển bước, SLA, trạng thái).

## Public API (`public/`)

- `RequestsDashboardApi` ([public/requests-dashboard.api.ts](public/requests-dashboard.api.ts)) — `openRequestsSentBy` (số Request đang mở người đó đã gửi, mọi vai; Super Admin thường 0), `needDecisionsHeldBy` (số bước nhu cầu đang chờ mình quyết); dashboards gọi (US-12-15 AC-2, AC-3).
- `RequestsApi` ([public/requests.api.ts](public/requests.api.ts)) — `listOpenOfBeneficiary`: request còn mở của một
  người, hiện cạnh hồ sơ nghỉ việc (US-03-04 AC-24); personnel gọi. Tham số `filter.departmentId` (tùy chọn) chỉ giữ request
  gửi từ phòng đó — trưởng phòng đọc một thành viên (`personnel/department-member`); không có `filter` thì như cũ.
- `RequestsAiSourceApi` ([public/requests-ai-source.api.ts](public/requests-ai-source.api.ts)) — `openStepsHeldBy`: bước nhu
  cầu và bước duyệt chi đang chờ một người (cùng bộ lọc với hai hàng đợi `need-decision-queue` và hàng đợi của người duyệt chi),
  sớm giao trước, lý do đầy đủ cắt 1000 ký tự; `stillHeldBy`: bước nào còn mở và còn giao người đó. Nguồn của tóm tắt AI (US-15-05).
- Worker gọi (`src/worker/request-work.job.ts`): `StepRedeterminationSweepApi.sweep` — lưới an toàn chuyển bước
  (US-05-11, US-05-12); `StepSlaSweepApi.sweep` — nhắc bước trễ, báo tồn đọng (US-05-09, US-05-10);
  `RequestStatusProjectorApi.project` — chiếu audit event của request thành thông báo inbox (US-05-15). File:
  `public/step-redetermination-sweep.api.ts`, `public/step-sla-sweep.api.ts`, `public/request-status-projector.api.ts`.
- `public/requests.types.ts` — `OpenRequestOfBeneficiary`, `AiSourceStep`; `public/requests.extension-points.ts` —
  `RequestOutcomeListeners`, `RequestOutcomeEvent`.

## Bảng sở hữu

- Request: `access_requests`, `access_request_beneficiaries`, `access_request_steps`, `approval_records`,
  `access_request_proposals`, `access_request_assessments`, `access_request_service_accounts`,
  `access_request_renewals`, `return_requests`. Nhóm: `access_request_lines`, `access_request_line_decisions`,
  `access_request_line_amounts`.
- Chi tiêu: `request_budget_checks`, `request_budget_check_years`, `request_finance_reviews`, `spend_batches`,
  `spend_batch_items`, `spend_decisions`, `request_supplements`, `request_supplement_drops`,
  `budget_information_requests`.
- Trạng thái/SLA: `controlled_wait_alerts`, `step_sla_reminders`, `step_sla_reminder_recipients`,
  `congestion_incidents`, `request_status_cursor` (`prisma/models/requests.prisma`).
- Khoản cam kết 01/01: `year_start_commitment_runs` (dấu chạy của tổ chức và năm, `resume_after_id` = Request cuối lô đã xử lý, số đếm cộng dồn
  theo lô; migration đánh dấu năm trước năm triển khai đã xong, nên lượt đầu là của năm triển khai, kể cả triển khai sau 01/01).

## Extension point

- Mở: `RequestOutcomeListeners` (`requests.outcome`, Listeners) — personnel
  `transfer-review/transfer-review-outcome.listener.ts`; phát qua `outcome/request-outcome.service.ts`.
- Đăng ký vào licensing: `licensing.grant-request-gate` ← `grant/access-request-grant.listener.ts`;
  `licensing.revocation` ← `return-request/return-revocation.listener.ts`; `licensing.renewal-hold` ←
  `renewal-request/renewal-hold.listener.ts`.
- Đăng ký vào organization: `organization.department-use-readers`, `organization.cost-center-use-readers` ←
  `access-request/open-request/*-open-requests.listener.ts`; `organization.change-listeners` ←
  `reassignment/organization-change.listener.ts`. Vào identity-access: `identity-access.approval-role-change-listeners`
  ← `reassignment/approval-role.listener.ts` (hai listener chuyển bước nằm trong `RequestsWorkFacadeModule`). Chỉ còn
  một vai phê duyệt, `SPENDING_APPROVER` (grant): không approver dự phòng, không người thay thế (QĐ-93c).
- Đăng ký vào budgets: `budgets.pending-spend` (Contributions `PendingSpendContributions`) ← `spend/pending-spend.listener.ts` (định nghĩa duy nhất của _Request đang chờ duyệt chi_, RV-10);
  `budgets.commitment-release-guard` ← `spend/commitment-release.listener.ts`; `budgets.commitment-request-facts` ←
  `spend/commitment-request-facts.listener.ts` (request, plan, người gửi, nhà cung cấp của một trang commitment, đọc theo lô).

## Tầng trong module

Đồ thị capability → capability của `requests` **không có vòng** (R6; `pnpm arch:capabilities --module requests`, gate
`capability-graph`): 39 capability, 117 cạnh. Cạnh đi từ tầng cao xuống tầng thấp hoặc ngang tầng, không vòng. **Cột tầng do lệnh tính** từ
cùng đồ thị gate dùng, không viết tay, và `scripts/verify/capability-graph.test.mjs` đọc bảng này so với lệnh (lệch thì test đỏ): có
controller thì L3; còn lại, không import capability nào thì L0, chỉ import L0 thì L1, import ít nhất một L1 hoặc L2 thì L2.

**Sửa bảng ngày 31/10/2026 (Phase 6.2 của `be-readability-debuggability-followup`).** Bảng cũ (duyệt kỹ thuật P09) xếp `spend` và
`plan-line` vào L1 "lõi nhánh" và `status` riêng một dòng chú thích; đồ thị cho thấy `spend` import `step-routing` và `plan-line`
import `spend`, nên theo luật tầng chúng là L2, và `status` (không controller, không cạnh) là L0. Sửa bảng, không sửa lệnh. Owner xác nhận bảng này 31/10/2026.

| Tầng | Capability                                                                                                                                                                                                                                                                                                                                                                                                                    | Quy tắc                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| L0   | `access-request` (lõi: bản ghi, repo, policy, types, errors, định tuyến, giá, `assessment-read.repo`, `withdrawal.policy`), `outcome`; `status` (cô lập: không import, không ai import, không controller; lệnh in `L0 (cô lập)`)                                                                                                                                                                                              | không import capability nào của `requests` (gate)     |
| L1   | lõi nhánh, không controller: `step-routing`, `request-draft`, `renewal-apply`, `repricing`                                                                                                                                                                                                                                                                                                                                    | chỉ import L0                                         |
| L2   | dịch vụ dùng chung, không controller: `spend`, `request-intake`, `request-view`, `assessment`, `reserve-confirmation`, `spend-effects`, `group-request`, `grant`, `request-end`, `spend-approval-view`                                                                                                                                                                                                                        | import ít nhất một L1 hoặc L2, không vòng             |
| L3   | use case lá, có controller: `proposal-review`, `budget-check`, `group-line-decisions`, `need-decision`, `need-decision-queue`, `my-requests`, `assessment-queue`, `withdraw`, `spend-submission`, `spend-approval`, `request-submission`, `cancellation`, `reassignment`, `return-request`, `timing`, `grant-queue`, `renewal-request`, `service-account-request`, `group-request-submission`, `line-closure`, `draft`, `sla` | không ai import lên, trừ năm ngoại lệ dưới đây (gate) |

**Số đo (30/10/2026).** Từ 24 capability, 82 cạnh, một vòng 19 capability → 36 capability, 111 cạnh, không vòng (sau khi tích hợp code dev A ngày 31/10/2026: 39 capability, 118 cạnh, thêm `need-decision-queue`, `my-requests`, `assessment-queue`, cả ba là L3 chỉ đọc, không ai import lên). Cạnh không tính cạnh
vào `access-request` (29): 82; không tính thêm cạnh vào `outcome` (10): 72; không tính thêm cạnh vào `spend` (15): 57. **Mục tiêu "cạnh ≤ 50"
của spec không đạt**, và không đạt được nếu giữ giới hạn 25 file mỗi thư mục: mọi use case đọc lõi (29 cạnh), mỗi capability tách ra để
thư mục không quá 25 file thêm cạnh. Tiêu chí thay thế (Owner 31/10/2026: chấp nhận cho Task 4.3): không vòng; L0 không import capability; không thư mục nào quá 25
file; capability có controller không bị import trừ danh sách ngoại lệ có lý do. Cả bốn là gate.

**Ngoại lệ** (capability có controller mà capability khác import; danh sách trong gate `capability-graph`, chỉ được ngắn đi):

- `draft`: hub `request-submission/access-requests.controller.ts` đọc bản nháp của người gọi theo id (`request-draft.service`,
  `request-draft.dto`); `reassignment` xử lý bản nháp khi người rời tổ chức (`request-draft-departure.service`): cả hai là use case của draft.
- `group-request-submission`, `service-account-request`: nộp một bản nháp chạy use case của hai capability này từ
  `draft/request-draft-submit.service.ts`.
- `line-closure`: `cancellation/departure-cancellation.service.ts` đóng các dòng nhóm của người đã nghỉ bằng service và policy của nó.
- `sla`: hàng đợi chi hiện tuổi của việc đang chờ qua `sla-queue-age.service`, service này đọc repo nhắc và policy SLA của `sla`.

**Một chiều, bằng cách nào.** Cạnh ngược gỡ bằng bốn cách: đưa kiểu/hằng xuống file của tầng thấp nhất cần chúng (`CancellationRefusal`,
`DelegationRefusal`, `ENDED_STATES`, `SpendStage`, `AskRefusal`/`AnswerRefusal`/`ReviewRefusal` ở `spend.errors.ts`, kiểu bản ghi thẩm định
`assessment-record.types.ts`); chuyển file về capability sở hữu; tách controller ra capability lá đặt tên theo use case; đưa dịch vụ điều
phối lên tầng trên. `*.errors.ts` không import policy của capability khác (gate). Không đổi hành vi, route, mã lỗi, thứ tự khóa và
transaction; thứ tự controller trong `requests.module.ts` giữ để `openapi.json` đúng byte.

**`AccessRequestView` ở `request-view/` (L2).** View ghép trạng thái chi (`spend-status.service`) nên không ở L0 được; mười
controller dùng nó import `request-view/`. `assessment-read.repo.ts` ở L0 là phần đọc bản ghi thẩm định mà lõi, `spend` và `request-view`
cùng cần; phần ghi nằm ở `assessment/assessment.repo.ts`.

## Capability → file chính

39 capability ngang hàng (ADR-0019, `OD-A5`), tầng ở bảng trên. **`access-request/` là lõi chung** (`docs/rules/module-structure.md`).

- **Lõi và dùng chung (không controller)**
  - `access-request/` — `access-request.repo.ts` (writer duy nhất của `access_requests`, `access_request_beneficiaries`,
    `access_request_steps`), `assessment-read.repo.ts`, `routing.policy.ts` + `routing-facts.service.ts` (định tuyến bước nhu cầu),
    `pricing.policy.ts` (`requestAmountOf`: giá tháng của thuê bao chính × số tháng còn lại của năm của `asOf`, tháng đầu/cuối tính đủ; `K4` = giá mua;
    Request tiếp tục có kỳ mới năm sau ⟹ 0 + `nextYearAmount`, QĐ-109b; mốc `asOf` theo QĐ-109e: gửi = tạm tính, mỗi lần `BudgetCheckService.run`
    tính lại và ghi `ACCESS_REQUEST.REPRICED`), `request-facts.service.ts` (đọc mọi sự kiện mà một request được xét bởi: phòng ban, kế hoạch, giá, người
    giữ ghế, định tuyến; trước đây `request-assessment.service`), `need-decision.policy.ts`, `withdrawal.policy.ts`. Con:
    `open-request/`.
  - `outcome/` — `RequestOutcomeService`: mọi service kết thúc request phát `requests.outcome` qua đây.
  - `request-view/` — `AccessRequestView`: `access-request-query.service.ts`, `access-request.mapper.ts`, `pricing-view.service.ts`.
  - `request-intake/` — `AccessRequestService`: gửi một request cá nhân (draft, gia hạn và controller cùng gọi).
  - `request-draft/` — kho bản nháp: `request-draft.repo.ts`, `request-draft.policy.ts`.
  - `request-end/` — `RequestEndService`: kết thúc request, trả cam kết ngân sách (cancellation, withdraw dùng).
  - `grant/` — `access-request-grant.listener.ts`, `grant.policy.ts`: cổng grant của licensing (`licensing.grant-request-gate`).
- **Chi tiêu**
  - `spend/` — lõi chi tiêu: `budget-check.service.ts`, `spend-routing.service.ts`, `spend-entry.service.ts`, `spend-status.service.ts`,
    `spend-decision.policy.ts`, `line-allocation.policy.ts`, repo của kiểm tra, review, batch, bước và quyết định chi.
  - `step-routing/` — người nhận bước: `step-target.service.ts`, `reassignment.policy.ts`, `step-reassignment.repo.ts`,
    `spend-routing.policy.ts`. Request không gắn dòng kế hoạch (QĐ-101n).
  - `reserve-confirmation/` — xác nhận dùng dự phòng (BR-MF1-06h): `ReserveConfirmationService` (endpoint riêng và trong lô), repo `request_reserve_confirmations` (bất biến, gắn kiểm tra + bước chi); `spend-effects/` — `SpendEffectsService`: giữ **một** khoản cam kết năm hiện hành (số tiền 0 ⟹ không giữ, audit `NO_CURRENT_YEAR_COMMITMENT`) và trả về trưởng phòng khi kiểm lại lúc duyệt (`SPEND_RETURNED_AT_DECISION`); `budget-check/` — `budgetCheckGet`, `budgetCheckYearList` (chuyển từ `finance-review/`, giữ operationId; D-1). Không còn Finance rà soát / hỏi Finance / override / giá trị cao (QĐ-97c).
  - Kiểm tra ngân sách ba kết quả (`spend/budget-check.policy.ts`): `WITHIN_BASE` ⟹ bước chi ngay; `USES_RESERVE` ⟹ ở lại hàng đợi trưởng phòng tới khi xác nhận kèm một dòng lý do (1–500 ký tự); `BLOCKED` (`OVER_RESERVE`, `NO_APPROVED_BUDGET`, `PRICE_EXPIRED` — chỉ xét báo giá, mô hình chưa có hạn giá gói) ⟹ báo người yêu cầu + trưởng phòng. Kiểm theo Cost Center hiện hành của phòng; lúc duyệt Cost Center khác lần kiểm trước ⟹ `NO_APPROVED_BUDGET` (M-12/RV-09, khoản cũ ở Cost Center cũ). Request số tiền năm hiện tại 0 không bị chặn vì còn lại âm (A5-2). _Đang chờ duyệt chi_: kết quả trong số cơ sở hoặc dùng dự phòng (kể cả chưa xác nhận), chưa quyết, không tính bị chặn.
  - `spend-submission/` (hàng đợi chi, batch, bổ sung; US-06-12, US-06-14; bổ sung chia ba:
    `supplement-pricing`, `supplement-recorder`, `supplement-query`; **Finance chỉ đọc**: `GET /spend-batches` do `spend-batch-list.service.ts` — mỗi lô kèm
    `approvedCount`, `pendingCount`, `approvedAmounts` theo đồng tiền, tiền lấy từ `BudgetsApi.committedByRequests` một lần cho cả trang —
    và Finance đọc chi tiết/items mọi lô ở `spend-batch-view.service.ts`), `spend-approval/` (spending approver quyết định; US-06-01;
    `spend-approvals.controller.ts`, `spend-decision.service.ts` điều phối `spend-decision-recorder.service.ts`),
    `spend-approval-view/` (thẻ của approver: `spend-approval-queue.service.ts` hàng đợi, `spend-approval-view.service.ts` chi tiết,
    `spend-approval.mapper.ts` dựng wire, `spend-approval.dto.ts`, dùng cả cho request nhóm).
- **Request cá nhân**
  - `request-submission/` — controller `access-requests.controller.ts` (gửi, xem, đọc: US-05-01 → US-05-03) và xem trước
    (`RequestPreviewService`). Hai route của bước nhu cầu nằm ở `need-decision/` (`need-decision.controller.ts`,
    `similar-seats.controller.ts`, US-05-04; `NeedDecisionService` quyết định, `NeedDecisionEffects` làm những gì theo sau trong
    cùng transaction) và route rút ở `withdraw/` (`withdrawal.controller.ts`, US-05-08; `WithdrawalPreconditions` đọc, khóa và kiểm
    lại, `WithdrawalWriter` ghi, `withdrawal.policy.ts` ở L0); ba controller khai báo
    ngay sau hub trong `requests.module.ts` để thứ tự path của API không đổi.
  - `draft/` — bản nháp: lưu, liệt kê, gửi, xóa; `request-drafts.controller.ts`; `RequestDraftService`.
  - `repricing/` — tính lại số tiền của Request theo ngày (QĐ-109e): `RepricingService` (giá thuê bao chính hoặc báo giá của IT Admin, tính theo `asOf`), `quote-pricing.policy.ts` (số tiền từ báo giá); `spend`, `spend-submission`, `group-request`, `assessment` gọi, không import capability nào ngoài lõi `access-request`.
  - `assessment/` — thẩm định phần mềm ngoài catalog, đăng ký nội bộ, nối plan (US-05-06, US-05-18, US-05-20);
    `AssessmentQueryService` (đọc), `AssessmentService` (lưu), `AssessmentCompletionService`, `AssessmentRejectionService`, qua cổng chung
    `AssessmentGate` (khóa đề xuất, người thẩm định, bước của IT Admin); `ProposalService`,
    `need-spend.service.ts`, `internal-registration.service.ts` (đăng ký nội bộ; `internalRegistrationBasis`, `registeredShapeOf`,
    `actsForAssignee` ở `assessment.policy.ts`); `proposal-review/` — `proposals.controller.ts`.
  - `grant-queue/` — hàng đợi cấp của IT Admin (US-03-02; gửi thay một người đã gỡ, QĐ-96); `cancellation/` — IT Admin đóng request của người đã nghỉ (US-03-04).
  - Ba danh sách đọc theo vai, chỉ đọc, không khóa, không ghi (L3): `my-requests/` — `GET /me/access-requests`, Request tôi đã gửi, mọi tài khoản (`QĐ-95d`; `my-requests.service.ts`,
    `my-requests.repo.ts`, `my-requests-facts.repo.ts`); `need-decision-queue/` — `GET /need-decisions`, bước chờ quyết nhu cầu của người đang được giao
    (`need-decision-queue.service.ts`, `.repo.ts`, `.mapper.ts`); `assessment-queue/` — `GET /assessment-queue`, việc thẩm định của IT Admin trong phạm vi phụ trách
    (`assessment-queue.service.ts`, `.repo.ts`, `.mapper.ts`). `my-requests` và `need-decision-queue` đọc cột `policy` qua `requestPolicyJson` (không ép kiểu).
- **Request nhóm** (US-05-17)
  - `group-request/` — lõi nhóm: dòng từng người, phân bổ tiền, quyết định theo dòng, rút dòng, grant nhóm,
    `beneficiary-eligibility.policy.ts`; `group-line-decisions/` — `group-lines.controller.ts` và các service quyết định theo dòng (bước nhu cầu: `GroupNeedPreconditions`,
    `GroupNeedVerdictWriter`, `GroupNeedDecisionService`; quyết định chi theo dòng: `GroupSpendHold` giữ cam kết, `GroupSpendReport`
    báo cáo; `group-line-decision.policy.ts` ở `group-request/`). Rút dòng chia ba: `GroupLineWithdrawer` (ghi), `GroupWithdrawalAftermath` (hệ quả),
    `GroupResolutionEnding` (kết thúc request khi dòng cuối xong); policy thuần ở `group-withdrawal.policy.ts` và
    `group-resolution.policy.ts`.
  - `group-request-submission/` — kiểm tra, gửi, ứng viên; `group-requests.controller.ts`; `GroupRequestWriter` ghi request và dòng,
    `group-need-routing.policy.ts` chọn người xét nhu cầu; `line-closure/` — đóng dòng của người đã nghỉ (`GroupLineCloser`).
- **Trả ghế, gia hạn, service account**
  - `return-request/` (US-05-13; mọi vai trừ Super Admin, `ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST`; `ReturnSeatGate` xét ghế trả, `ReturnHandoverService` mở bàn giao; `return-request.policy.ts`),
    `renewal-request/` (US-05-14; `renewal-requests.controller.ts`; `RenewalRequestWriter` ghi, `renewal-request-submission.mapper.ts`
    dựng dòng và audit) với `renewal-apply/`
    (`renewal-apply.service.ts`, `renewal-request.repo.ts`: áp gia hạn khi được duyệt), `service-account-request/` (US-05-21).
- **Trạng thái, SLA, chuyển bước**
  - `status/` — chiếu audit event của request thành thông báo inbox (US-05-15); nhóm `rules/` là bảng luật sự kiện → thông báo.
  - `timing/` (thời gian từng bước, KPI-2), `sla/` (nhắc bước trễ, tồn đọng, nghẽn; US-05-09, US-05-10),
    `reassignment/` (chuyển bước khi tổ chức hoặc vai trò đổi, chờ có kiểm soát; US-05-11, US-05-12).

**Tìm X ở đâu**

| Cần tìm                                             | Ở đâu                                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Request được đọc ra thế nào (`AccessRequestView`)   | `request-view/access-request-query.service.ts`                                                           |
| Request được gửi thế nào                            | `request-intake/access-request.service.ts` (cá nhân), `group-request-submission/` (nhóm)                 |
| Bước nhu cầu: quyết định, ghế tương tự, rút         | `need-decision/`, `withdraw/` (controller cạnh service)                                                  |
| Kiểm tra ngân sách của một request                  | `spend/budget-check.service.ts`                                                                          |
| Khoản cam kết tự tạo ngày 01/01 (job, luật số tiền) | `year-start-commitments/` (`*.service.ts` điều phối, `*-batch.service.ts` một lô, `*.policy.ts` số tiền) |
| Ai giữ một bước, chuyển bước                        | `access-request/routing.policy.ts`, `step-routing/`, `reassignment/`                                     |
| Kết thúc request và phát `requests.outcome`         | `outcome/request-outcome.service.ts`, `request-end/request-end.service.ts`                               |
| Lý do từ chối của spend, hủy, ủy quyền              | `spend/spend.errors.ts`, `access-request/access-request.types.ts` (kiểu lý do)                           |
| Route của một use case                              | `docs/generated/routes.md` (sinh từ code)                                                                |

## Bất biến quan trọng

- Nhánh, chuỗi bước và SLA cố định lúc gửi; phòng ban và Unit Cost Center là cái hiệu lực vào ngày gửi (US-05-02
  AC-3, AC-7; chú thích `prisma/models/requests.prisma`). Quyết định theo dòng không bao giờ sửa hay xóa (INV-05).
- Bước nhu cầu không bao giờ giao cho chính người xin (`SoD-4`, `INV-08`); không ai chọn tay người giữ bước
  (`access-request/routing.policy.ts`). Bước nhu cầu chỉ giao cho trưởng phòng hoặc Người duyệt chi (dòng 1, 2, 5, 9); phòng
  chưa có trưởng phòng thì bước **chờ có kiểm soát** `NO_DEPARTMENT_HEAD` (dòng 4, Super Admin nhận cảnh báo) và được giao khi
  Super Admin gán trưởng phòng, tuổi bước không đặt lại (`REWAIT`/`ASSIGN` ở `step-routing/reassignment.policy.ts`).
- Bước chi chỉ giao cho Người duyệt chi (`step-routing/spend-routing.policy.ts`): không ai thay khi họ là bên của Request
  (Request đó không tồn tại: hợp đồng D-S21, `REQUEST_PARTY.INELIGIBLE` 422) hay vắng; chưa có người giữ vai thì chờ
  `NO_SPENDING_APPROVER`. Mở bước chi khóa dòng grant `FOR SHARE` trước khi đọc (M6). Bước cũ do approver dự phòng/người thay thế
  giữ không còn là trường hợp riêng: không đóng băng, không `STEP_AWAITING_CONVERSION`; migration gỡ `approval_role_holders` dừng
  `P0001` và nêu dòng nếu DB còn dữ liệu cũ (Request có Người duyệt chi là bên, bước dòng 3/4 hay lý do chờ cũ, bước chi do người
  chưa từng có grant giữ). Bước chờ đổi lý do (`REWAIT`) chỉ ghi `waiting_reason`, giữ `waiting_since`.
- Thứ tự khóa: task grant (`LicensingApi.lockGrantOfRequest`) rồi request (`request-end/request-end.service.ts`); hàng request
  rồi khóa năm ngân sách (`budgets/budget/budget-year-lock.repo.ts`).
- Khoản 01/01 (`year-start-commitments/`, `BudgetsApi.holdYearStart`): `YearStartCommitmentsSweeper` mỗi giờ trong tiến trình API (ADR-0018); lượt đầu
  của năm sau 00:00 giờ tổ chức giữ cho mỗi Request trả phí `K1`/`K2` đang chạy hoặc đã duyệt chi chưa cấp một khoản của năm mới (giá tháng của
  gói hiệu lực ngày 01/01 × số tháng của năm, mỗi seat, quy về tiền tệ báo cáo bằng `FinanceApi.snapshotMoney` tỷ giá 01/01, không có thì tỷ giá
  ngày chạy, không có nữa ⟹ bỏ qua `NO_RATE`), rồi ghi dấu `year_start_commitment_runs`; lượt sau trong năm không đọc gì. Seat đi theo chuỗi
  `predecessor_id` tới bản ghi đang chạy; Cost Center của phòng sở hữu bản ghi đó (tài khoản dịch vụ bàn giao sang phòng khác ⟹ phòng mới). Request
  gia hạn (`RENEWAL`) giữ khoản của bản ghi kế tiếp nó tạo; Request cấp ban đầu không giữ phần đã được gia hạn. Mỗi bước (mở, mỗi lô) một
  transaction, trước hết `pg_try_advisory_xact_lock` theo (tổ chức, năm) — instance khác đang giữ thì bỏ lượt (`BUSY`); trong lô: khóa hàng Request
  `FOR UPDATE` theo id, đọc grant (không khóa), tổ chức `FOR SHARE` khi quy đổi, rồi khóa năm của Cost Center theo id — cùng thứ tự với mọi ghi ngân
  sách. Lượt lỗi giữa chừng: lượt sau đi tiếp sau `resume_after_id`, không ghi lại audit bỏ qua. Tổ chức chưa có dấu: lượt đầu chỉ đánh dấu khi chưa
  có Request gửi trước năm đó; có dấu cũ nhưng thiếu năm trước ⟹ log cảnh báo. Chạy tay: `YearStartCommitmentsService.run(now)`. Chỉ Request có
  khoản; quyền không có Request thì không (QĐ-109a).
- Mọi kết thúc request phát `requests.outcome` trong cùng transaction; listener ném lỗi thì kết thúc bị hoàn tác.
- Sweep chuyển bước: mỗi request một transaction, khóa theo id, chỉ ghi khi bảng định tuyến chỉ ra người khác người
  đang giữ; sweep SLA chỉ ghi nhắc, thông báo và audit, không đổi bước hay request (`public/*-sweep.api.ts`).

## Test

- Unit: `src/modules/requests/**/*.spec.ts`; HTTP: `test/http/requests/`; integration: `test/integration/requests/`.
- Codec của cột JSON (`.json.ts`, [database rules](../../../docs/rules/database-business.md)): `access-request/access-request.json.ts` giữ `policy`
  (`payment_schedule` không còn ghi hay đọc — một số tiền một năm, QĐ-109; cột còn đó, trigger chặn ghi mới), nên spec của nó nằm trong
  `access-request/access-request.policy.spec.ts` (thư mục đã đủ 25 file); `request-draft/request-draft-policy.json.ts` (`policy` của bản nháp) có spec cạnh file.

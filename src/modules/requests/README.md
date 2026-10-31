# requests

Mục đích: request xin quyền dùng phần mềm và các bước quyết định nó — nhu cầu, thẩm định phần mềm mới, chi tiêu
(Finance, spending approver, batch), grant; cùng request nhóm, trả ghế, gia hạn, service account, trạng thái, SLA và
chuyển bước khi tổ chức đổi (ADR-0015). Story chính: US-05-01 → US-05-04, US-05-06, US-05-08 → US-05-15, US-05-17,
US-05-18, US-05-20, US-05-21, US-06-01 → US-06-03, US-06-12 → US-06-14; US-03-02 (gửi thay), US-03-04 (nghỉ việc).
Tầng: T5 (`scripts/arch/tiers.cjs`). Phụ thuộc: budgets, licensing, catalog, organization, identity-access, finance,
operating-parameters, audit, notifications. Được dùng bởi: personnel; gốc `src/app/app.module.ts`,
`src/worker/worker.module.ts`, `src/worker/request-work.job.ts`. Nest module: `requests.module.ts` (API, mọi
controller) và `requests-work-facade.module.ts` (phần worker chạy, API dùng chung: chuyển bước, SLA, trạng thái).

## Public API (`public/`)

- `RequestsApi` ([public/requests.api.ts](public/requests.api.ts)) — `listOpenOfBeneficiary`: request còn mở của một
  người, hiện cạnh hồ sơ nghỉ việc (US-03-04 AC-24); personnel gọi.
- Worker gọi (`src/worker/request-work.job.ts`): `StepRedeterminationSweepApi.sweep` — lưới an toàn chuyển bước
  (US-05-11, US-05-12); `StepSlaSweepApi.sweep` — nhắc bước trễ, báo tồn đọng (US-05-09, US-05-10);
  `RequestStatusProjectorApi.project` — chiếu audit event của request thành thông báo inbox (US-05-15). File:
  `public/step-redetermination-sweep.api.ts`, `public/step-sla-sweep.api.ts`, `public/request-status-projector.api.ts`.
- `public/requests.types.ts` — `OpenRequestOfBeneficiary`; `public/requests.extension-points.ts` —
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

## Extension point

- Mở: `RequestOutcomeListeners` (`requests.outcome`, Listeners) — personnel
  `transfer-review/transfer-review-outcome.listener.ts`; phát qua `outcome/request-outcome.service.ts`.
- Đăng ký vào licensing: `licensing.grant-request-gate` ← `grant/access-request-grant.listener.ts`;
  `licensing.revocation` ← `return-request/return-revocation.listener.ts`; `licensing.renewal-hold` ←
  `renewal-request/renewal-hold.listener.ts`.
- Đăng ký vào organization: `organization.department-use-readers`, `organization.cost-center-use-readers` ←
  `access-request/open-request/*-open-requests.listener.ts`; `organization.change-listeners` ←
  `reassignment/organization-change.listener.ts`. Vào identity-access: `identity-access.approval-role-change-listeners`
  ← `reassignment/approval-role.listener.ts` (hai listener chuyển bước nằm trong `RequestsWorkFacadeModule`).
- Đăng ký vào budgets: `budgets.change-listeners` ← `finance-review/spend-budget.listener.ts`;
  `budgets.commitment-release-guard` ← `spend/commitment-release.listener.ts`.

## Tầng trong module

Đồ thị capability → capability của `requests` **không có vòng** (R6; `pnpm arch:capabilities --module requests`, gate
`capability-graph`): 39 capability, 118 cạnh. Cạnh đi từ tầng cao xuống tầng thấp hoặc ngang tầng, không vòng. Bảng tầng này duyệt kỹ
thuật P09, chưa có Owner review.

| Tầng | Capability                                                                                                                                                                                                                                                                                                                                                                                      | Quy tắc                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| L0   | `access-request` (lõi: bản ghi, repo, policy, types, errors, định tuyến, giá, `assessment-read.repo`, `withdrawal.policy`), `outcome`                                                                                                                                                                                                                                                           | không import capability nào của `requests` (gate)     |
| L1   | lõi nhánh, không controller: `spend`, `step-routing`, `request-draft`, `renewal-apply`, `plan-line`                                                                                                                                                                                                                                                                                             | chỉ import L0 và nhau, không vòng                     |
| L2   | dịch vụ dùng chung, không controller: `request-intake`, `request-view`, `assessment`, `budget-information`, `group-request`, `grant`, `request-end`, `spend-approval-view`                                                                                                                                                                                                                      | import L0, L1 và L2 thấp hơn                          |
| L3   | use case lá, có controller: `proposal-review`, `budget-questions`, `group-line-decisions`, `need-decision`, `need-decision-queue`, `my-requests`, `assessment-queue`, `withdraw`, `finance-review`, `spend-submission`, `spend-approval`, `request-submission`, `cancellation`, `reassignment`, `return-request`, `timing`, `delegated-request`, `renewal-request`, `service-account-request`, `group-request-submission`, `line-closure`, `draft`, `sla` | không ai import lên, trừ năm ngoại lệ dưới đây (gate) |

`status` không controller và không import hay bị import capability nào của `requests`.

**Số đo (30/10/2026).** Từ 24 capability, 82 cạnh, một vòng 19 capability → 36 capability, 111 cạnh, không vòng. Cạnh không tính cạnh
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
    `pricing.policy.ts`, `request-facts.service.ts` (đọc mọi sự kiện mà một request được xét bởi: phòng ban, kế hoạch, giá, người
    giữ ghế, định tuyến; trước đây `request-assessment.service`), `need-decision.policy.ts`, `withdrawal.policy.ts`. Con:
    `open-request/`.
  - `outcome/` — `RequestOutcomeService`: mọi service kết thúc request phát `requests.outcome` qua đây.
  - `request-view/` — `AccessRequestView`: `access-request-query.service.ts`, `access-request.mapper.ts`, `pricing-view.service.ts`.
  - `request-intake/` — `AccessRequestService`: gửi một request cá nhân (draft, gia hạn và controller cùng gọi).
  - `request-draft/` — kho bản nháp: `request-draft.repo.ts`, `request-draft.policy.ts`.
  - `request-end/` — `RequestEndService`: kết thúc request, trả cam kết ngân sách, đóng câu hỏi Finance (cancellation, withdraw dùng).
  - `grant/` — `access-request-grant.listener.ts`, `grant.policy.ts`: cổng grant của licensing (`licensing.grant-request-gate`).
- **Chi tiêu**
  - `spend/` — lõi chi tiêu: `budget-check.service.ts`, `spend-routing.service.ts`, `spend-entry.service.ts`, `spend-status.service.ts`,
    `spend-decision.policy.ts`, `line-allocation.policy.ts`, repo của kiểm tra, review, batch, bước và quyết định chi.
  - `step-routing/` — người nhận bước: `step-target.service.ts`, `reassignment.policy.ts`, `step-reassignment.repo.ts`,
    `spend-routing.policy.ts`. `plan-line/` — `PlanLineService` (chọn dòng kế hoạch ngân sách, US-05-04 AC-12).
  - `budget-information/` — hỏi–đáp Finance (US-06-02, US-06-03): `BudgetInformationService`, `spend-effects.service.ts`;
    `budget-questions/` — `budget-information.controller.ts`.
  - `finance-review/` (US-06-13; `finance-reviews.controller.ts`; ghi ở `finance-review-writer.service.ts`, nhiều năm ở
    `spend-years-view.service.ts`), `spend-submission/` (hàng đợi chi, batch, bổ sung; US-06-12, US-06-14; bổ sung chia ba:
    `supplement-pricing`, `supplement-recorder`, `supplement-read`), `spend-approval/` (spending approver quyết định; US-06-01;
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
  - `assessment/` — thẩm định phần mềm ngoài catalog, đăng ký nội bộ, nối plan, tính lại giá (US-05-06, US-05-18, US-05-20);
    `AssessmentReader` (đọc), `AssessmentService` (lưu), `AssessmentCompletionService`, `AssessmentRejectionService`, qua cổng chung
    `AssessmentGate` (khóa đề xuất, người thẩm định, bước của IT Admin); `ProposalService`, `RepricingService`,
    `need-spend.service.ts`, `internal-registration.service.ts` (đăng ký nội bộ; `internalRegistrationBasis`, `registeredShapeOf`,
    `actsForAssignee` ở `assessment.policy.ts`); `proposal-review/` — `proposals.controller.ts`.
  - `delegated-request/` — gửi thay, hàng đợi grant (US-03-02; `delegated-request-submission.mapper.ts` dựng dòng và audit); `cancellation/` — IT Admin đóng request của người đã nghỉ (US-03-04).
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
  - `return-request/` (US-05-13; `ReturnSeatGate` xét ghế trả, `ReturnHandoverService` mở bàn giao; `return-request.policy.ts`),
    `renewal-request/` (US-05-14; `renewal-requests.controller.ts`; `RenewalRequestWriter` ghi, `renewal-request-submission.mapper.ts`
    dựng dòng và audit) với `renewal-apply/`
    (`renewal-apply.service.ts`, `renewal-request.repo.ts`: áp gia hạn khi được duyệt), `service-account-request/` (US-05-21).
- **Trạng thái, SLA, chuyển bước**
  - `status/` — chiếu audit event của request thành thông báo inbox (US-05-15); nhóm `rules/` là bảng luật sự kiện → thông báo.
  - `timing/` (thời gian từng bước, KPI-2), `sla/` (nhắc bước trễ, tồn đọng, nghẽn; US-05-09, US-05-10),
    `reassignment/` (chuyển bước khi tổ chức hoặc vai trò đổi, chờ có kiểm soát; US-05-11, US-05-12).

**Tìm X ở đâu**

| Cần tìm                                           | Ở đâu                                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Request được đọc ra thế nào (`AccessRequestView`) | `request-view/access-request-query.service.ts`                                           |
| Request được gửi thế nào                          | `request-intake/access-request.service.ts` (cá nhân), `group-request-submission/` (nhóm) |
| Bước nhu cầu: quyết định, ghế tương tự, rút       | `need-decision/`, `withdraw/` (controller cạnh service)                                  |
| Kiểm tra ngân sách của một request                | `spend/budget-check.service.ts`                                                          |
| Ai giữ một bước, chuyển bước                      | `access-request/routing.policy.ts`, `step-routing/`, `reassignment/`                     |
| Kết thúc request và phát `requests.outcome`       | `outcome/request-outcome.service.ts`, `request-end/request-end.service.ts`               |
| Lý do từ chối của spend, hủy, ủy quyền            | `spend/spend.errors.ts`, `access-request/access-request.types.ts` (kiểu lý do)           |
| Route của một use case                            | `docs/generated/routes.md` (sinh từ code)                                                |

## Bất biến quan trọng

- Nhánh, chuỗi bước và SLA cố định lúc gửi; phòng ban và Unit Cost Center là cái hiệu lực vào ngày gửi (US-05-02
  AC-3, AC-7; chú thích `prisma/models/requests.prisma`). Quyết định theo dòng không bao giờ sửa hay xóa (INV-05).
- Bước nhu cầu không bao giờ giao cho chính người xin (`SoD-4`, `INV-08`); không ai chọn tay người giữ bước
  (`access-request/routing.policy.ts`).
- Thứ tự khóa: task grant (`LicensingApi.lockGrantOfRequest`) rồi request (`request-end/request-end.service.ts`); hàng request
  rồi khóa năm ngân sách (`budgets/budget/budget-year-lock.repo.ts`).
- Mọi kết thúc request phát `requests.outcome` trong cùng transaction; listener ném lỗi thì kết thúc bị hoàn tác.
- Sweep chuyển bước: mỗi request một transaction, khóa theo id, chỉ ghi khi bảng định tuyến chỉ ra người khác người
  đang giữ; sweep SLA chỉ ghi nhắc, thông báo và audit, không đổi bước hay request (`public/*-sweep.api.ts`).

## Test

- Unit: `src/modules/requests/**/*.spec.ts`; HTTP: `test/http/requests/`; integration: `test/integration/requests/`.

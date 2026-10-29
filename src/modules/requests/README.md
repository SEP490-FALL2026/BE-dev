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
- Đăng ký vào licensing: `licensing.grant-request-gate` ← `access-request/grant/access-request-grant.listener.ts`;
  `licensing.revocation` ← `return-request/return-revocation.listener.ts`; `licensing.renewal-hold` ←
  `renewal-request/renewal-hold.listener.ts`.
- Đăng ký vào organization: `organization.department-use-readers`, `organization.cost-center-use-readers` ←
  `access-request/open-request/*-open-requests.listener.ts`; `organization.change-listeners` ←
  `reassignment/organization-change.listener.ts`. Vào identity-access: `identity-access.approval-role-change-listeners`
  ← `reassignment/approval-role.listener.ts` (hai listener chuyển bước nằm trong `RequestsWorkFacadeModule`).
- Đăng ký vào budgets: `budgets.change-listeners` ← `finance-review/spend-budget.listener.ts`;
  `budgets.commitment-release-guard` ← `spend/commitment-release.listener.ts`.

## Capability → file chính

23 capability ngang hàng (ADR-0019, `OD-A5`). **`access-request/` là lõi chung** mà mọi capability khác import
(`docs/rules/module-structure.md`); `spend/` và `group-request/` là lõi thứ cấp của nhánh chi tiêu và nhánh nhóm.

- **Lõi access-request**
  - `access-request/` — `access-request.repo.ts` (writer duy nhất của `access_requests`,
    `access_request_beneficiaries`, `access_request_steps`), `routing.policy.ts` + `routing-facts.service.ts`
    (định tuyến bước nhu cầu), `pricing.policy.ts`, `request-end.service.ts`, `access-request-query.service.ts`.
    Con: `grant/`, `open-request/`.
  - `request-submission/` — gửi, xem trước, đọc (US-05-01 → US-05-03); `access-requests.controller.ts`;
    `AccessRequestService`, `RequestPreviewService`.
  - `need-decision/` (US-05-04; `NeedDecisionService`, `SimilarSeatsService`) và `withdraw/` (US-05-08;
    `WithdrawalService`) — route của cả hai ở `access-requests.controller.ts`.
  - `draft/` — bản nháp: lưu, liệt kê, gửi, xóa; `request-drafts.controller.ts`; `RequestDraftService`.
  - `assessment/` — thẩm định phần mềm ngoài catalog, đăng ký nội bộ, nối plan (US-05-06, US-05-18, US-05-20);
    `proposals.controller.ts`; `ProposalService`, `AssessmentService`.
  - `delegated-request/` — gửi thay, hàng đợi grant (US-03-02); `delegated-requests.controller.ts`.
  - `cancellation/` — IT Admin đóng request của người đã nghỉ (US-03-04); `cancellation.controller.ts`.
  - `outcome/` — `RequestOutcomeService`: mọi service kết thúc request phát `requests.outcome` qua đây.
- **Chi tiêu**
  - `spend/` — lõi chi tiêu, không controller: `budget-check.service.ts`, `spend-routing.service.ts`,
    `spend-decision.policy.ts`, `spend-effects.service.ts`.
  - `finance-review/` — Finance review, kiểm ngân sách (US-06-13); `finance-reviews.controller.ts`;
    `FinanceReviewService`, `SpendViewService`.
  - `spend-submission/` — hàng đợi chi, batch, dòng kế hoạch, bổ sung (US-06-12, US-06-14);
    `spend-submission.controller.ts`; `SpendBatchService`, `PlanLineRouteService`, `SupplementService`.
  - `spend-approval/` — spending approver quyết định request hoặc batch (US-06-01); `spend-approvals.controller.ts`.
  - `budget-information/` — approver hỏi Finance về ngân sách (US-06-02, US-06-03);
    `budget-information.controller.ts`.
- **Request nhóm** (US-05-17)
  - `group-request/` — lõi nhóm: dòng từng người, phân bổ tiền, quyết định theo dòng, rút dòng, grant nhóm
    (`request-line.repo.ts`, `group-resolution.service.ts`, `group-grant.service.ts`); con `lines/`
    (`group-lines.controller.ts`).
  - `group-request-submission/` — kiểm tra, gửi, ứng viên; `group-requests.controller.ts`; `GroupRequestService`.
  - `line-closure/` — đóng dòng của người đã nghỉ; `group-line-closure.controller.ts`.
- **Trả ghế, gia hạn, service account**
  - `return-request/` — trả ghế, xác nhận bàn giao (US-05-13); `return-requests.controller.ts`.
  - `renewal-request/` — gia hạn quyền có hạn (US-05-14); `renewal-requests.controller.ts`.
  - `service-account-request/` — xin service account, review ranh giới (US-05-21);
    `service-account-requests.controller.ts`.
- **Trạng thái, SLA, chuyển bước**
  - `status/` — chiếu audit event của request thành thông báo inbox (US-05-15): `RequestStatusProjection` →
    `RequestStatusFactsService`, `RequestStatusRecipientsService`; nhóm `rules/` là bảng luật sự kiện → thông báo, gọi
    qua `rules/request-status-rules.policy.ts` (các file `status-rules-*.policy.ts` là phần riêng của nhóm).
  - `timing/` — thời gian từng bước của một request (US-05-15, KPI-2); `request-timings.controller.ts`;
    `RequestTimingService`.
  - `sla/` — nhắc bước trễ, tồn đọng, sự cố nghẽn (US-05-09, US-05-10); `congestion.controller.ts`.
  - `reassignment/` — chuyển bước khi tổ chức hoặc vai trò đổi, chờ có kiểm soát (US-05-11, US-05-12);
    `controlled-wait.controller.ts`; `StepReassignmentService`.

## Bất biến quan trọng

- Nhánh, chuỗi bước và SLA cố định lúc gửi; phòng ban và Unit Cost Center là cái hiệu lực vào ngày gửi (US-05-02
  AC-3, AC-7; chú thích `prisma/models/requests.prisma`). Quyết định theo dòng không bao giờ sửa hay xóa (INV-05).
- Bước nhu cầu không bao giờ giao cho chính người xin (`SoD-4`, `INV-08`); không ai chọn tay người giữ bước
  (`access-request/routing.policy.ts`).
- Thứ tự khóa: task grant (`LicensingApi.lockGrantOfRequest`) rồi request (`request-end.service.ts`); hàng request
  rồi khóa năm ngân sách (`budgets/budget/budget-year-lock.repo.ts`).
- Mọi kết thúc request phát `requests.outcome` trong cùng transaction; listener ném lỗi thì kết thúc bị hoàn tác.
- Sweep chuyển bước: mỗi request một transaction, khóa theo id, chỉ ghi khi bảng định tuyến chỉ ra người khác người
  đang giữ; sweep SLA chỉ ghi nhắc, thông báo và audit, không đổi bước hay request (`public/*-sweep.api.ts`).

## Test

- Unit: `src/modules/requests/**/*.spec.ts`; HTTP: `test/http/requests/`; integration: `test/integration/requests/`.

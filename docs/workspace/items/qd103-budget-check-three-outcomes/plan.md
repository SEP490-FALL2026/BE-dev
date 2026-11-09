# Plan: qd103-budget-check-three-outcomes

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `1cd81101` + commit của `qd103-request-amount-and-term` + commit W2.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W3, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **ba lượt** — Phase 1 (Task 1–3, Checkpoint 1), Phase 2 (Task 4–6, Checkpoint 2), Phase 3 (Task 7–8, Checkpoint 3).

## Before coding

Đọc README `requests` (tầng capability, ngoại lệ gate `capability-graph`, giới hạn 25 file — `spend/` đầy, không thêm file vào
`spend/`; phần mới mà capability khác gọi là **capability** `reserve-confirmation/`, `spend-effects/`, không phải nhóm của `spend/`),
README `budgets` (extension point), `docs/rules/module-structure.md` (luật nhóm, từ vựng file), `docs/rules/api-contract.md` (gỡ
operation, ví dụ OpenAPI). Đối chiếu code:
`spend/budget-check.policy.ts:15-162`, `spend/budget-check.service.ts:51-176`, `spend/spend-routing.service.ts:46-273`,
`spend/spend-decision.policy.ts:35-81`, `spend-approval/spend-decision.service.ts:110-146`,
`budget-information/spend-effects.service.ts:35-105`, `finance-review/spend-budget.listener.ts`, `spend/spend-status.service.ts`,
`spend-submission/spend-queue.service.ts`, `status/rules/status-rules-finance.policy.ts`, `budgets/budget/budget-facts.repo.ts`.
Danh sách nơi còn đọc trạng thái/bước Finance: `grep -rln "FINANCE_REVIEW\|AWAITING_BUDGET\|financeReview" src/modules`
(37 file ở `1cd81101`, gồm `notifications/inbox/inbox.policy.ts`, `my-requests/*`, `timing/*`, `sla/step-sla.policy.ts`).

## Design review

Audit thiết kế bằng subagent chỉ-đọc 08/11/2026: 1 Cao, 2 Trung bình, 1 Thấp ⟹ đã sửa (DA3-01 kiểm ở mọi trigger dùng số tính
lại trong `run`, gồm `RESERVE_CONFIRMATION`; DA3-06 thông báo `REQUEST_RETURNED_AT_DECISION` cho người yêu cầu + trưởng phòng;
DA3-07 `spend/reserve/`, `spend/decision/` → capability `reserve-confirmation/`, `spend-effects/`, thêm `arch:capabilities` ở
Checkpoint 1; DA3-20 ghi lý do không có mã _năm đã đóng_); thêm luật bỏ sót nhắc SLA bước nhu cầu (`QĐ-100j`) vào Task 5 vì cùng
file `sla/step-sla.policy.ts`; liên quan DA3-15 (migration 2 đưa Request dòng 2 về hàng đợi trưởng phòng) ghi ở spec, sửa ở
single-step; không sửa: không có.

## Tasks

### Phase 1 — schema và luật

### Task 1: migration chỉ thêm (outcome, số mới, xác nhận dự phòng)

- Files: `prisma/models/requests.prisma`, `prisma/migrations/<ts>_budget_check_outcomes/migration.sql` (enum, cột, bảng
  `request_reserve_confirmations`, trigger bất biến, quyền runtime role), `test/integration/requests/spend-constraints.integration-spec.ts`
  (ca mới: lý do rỗng/301/xuống dòng bị DB từ chối, sửa/xóa xác nhận bị trigger từ chối, hai xác nhận một bước bị UNIQUE).
- Depends on: none (trong hạng mục).
- Acceptance: DB đúng spec _Ownership_ migration 1.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/requests/spend-constraints.integration-spec.ts`.

### Task 2: `yearFacts` có số cơ sở/dự phòng; policy ba kết quả

- Files: `budgets/budget/budget-facts.repo.ts`, `budgets/public/budgets.types.ts`, `requests/spend/budget-check.policy.ts`
  (+ `budget-check.policy.spec.ts` viết lại), `requests/spend/budget-check.service.ts`, `requests/spend/budget-check.repo.ts`
  (ghi cột mới, `toYear` đọc cột mới + suy dòng cũ).
- Depends on: Task 1.
- Acceptance: test matrix R-B05, AC-5, AC-8/AC-9, FR-5.8a ở unit; integration đọc số đúng.
- Verify: `pnpm exec jest src/modules/requests/spend/budget-check.policy.spec.ts src/modules/budgets/budget`;
  `pnpm test:integration -- test/integration/requests/spend-budget-check.integration-spec.ts test/integration/requests/spend-budget-check-years.integration-spec.ts`.

### Task 3: trình lô, xác nhận dự phòng (`spendReserveConfirm`), kiểm lại lúc duyệt không override

- Files: `requests/spend/spend-routing.service.ts`, capability mới `requests/reserve-confirmation/`
  (`reserve-confirmation.service.ts`, `reserve-confirmation.repo.ts`, `reserve-confirmation.policy.ts` + spec),
  `requests/requests.module.ts` (provider), `requests/spend-submission/spend-submission.controller.ts` (route mới) +
  `spend-batch.service.ts`, `requests/spend/spend-submission.dto.ts`, `requests/spend/spend-decision.policy.ts` (+ spec),
  `requests/spend-approval/spend-decision.service.ts`, `spend-decision-recorder.service.ts`, `spend-batch-decision.service.ts`,
  `requests/group-line-decisions/group-spend-decision.service.ts`, `requests/spend/spend.errors.ts` + `spend.http-errors.ts`,
  `requests/spend-approval/spend-approvals.controller.ts` (bỏ `override` khỏi body/ví dụ), `test/support/api-coverage-manifest.ts`,
  `test/support/openapi-example-route-codes-requests-spend.ts`, `test/http/requests/reserve-confirmation.http-spec.ts` (mới),
  `test/integration/requests/spend-reserve-confirmation.integration-spec.ts` (mới).
- Depends on: Task 2.
- Acceptance: test matrix US-06-14 AC-9, US-06-16 AC-1/AC-3, quyền, QT 1.6, trạng thái, xác nhận lại, DA3-01 (xác nhận khác
  tháng trình), AC-18 (2 ca, phần trạng thái/409; người nhận ở Task 7), AC-24, AC-23, lô hàng loạt, nhóm, concurrency.
- Verify: `pnpm exec jest src/modules/requests/spend src/modules/requests/spend-approval src/modules/requests/group-line-decisions`;
  `pnpm test:http -- test/http/requests/reserve-confirmation.http-spec.ts`;
  `pnpm test:integration -- test/integration/requests/spend-reserve-confirmation.integration-spec.ts test/integration/requests/spend-approval.integration-spec.ts test/integration/requests/spend-approval-batch.integration-spec.ts test/integration/requests/spend-batches.integration-spec.ts test/integration/requests/group-request-spend.integration-spec.ts test/integration/requests/spend-decision-constraints.integration-spec.ts test/integration/requests/spend-budget-year-lock.integration-spec.ts`.

### Checkpoint 1

Kiểm tra nhanh tracker §4.5; `pnpm arch:capabilities --module requests` (capability `reserve-confirmation` L1/L2, không vòng,
không bị import ngoài `spend-submission`/`spend-approval`); `openapi:export` có `spendReserveConfirm`, chưa gỡ route Finance. Tự
review theo spec mục 1–4, 7. Hết lượt 1.

### Phase 2 — gỡ đường Finance

### Task 4: migration dữ liệu Finance cũ (Q-26)

- Files: `prisma/migrations/<ts>_finance_review_retired/migration.sql`, `prisma/models/requests.prisma` (ghi chú legacy),
  `test/integration/requests/finance-review-retired-migration.integration-spec.ts` (mới, theo mẫu
  `access-request-project-label-drop-migration.integration-spec.ts` + `test/support/migration-history.ts`).
- Depends on: Checkpoint 1.
- Acceptance: test matrix _dữ liệu cũ_.
- Verify: `pnpm db:migrate:deploy`;
  `pnpm test:integration -- test/integration/requests/finance-review-retired-migration.integration-spec.ts`.

### Task 5: gỡ capability Finance rà soát / hỏi Finance và extension point ngân sách

- Files: xóa `requests/finance-review/`, `requests/budget-information/` (chuyển `spend-effects.service.ts` sang capability mới
  `requests/spend-effects/spend-effects.service.ts` — `spend-approval` và `group-line-decisions` cùng dùng; giữ `hold`, `sendBack`,
  bỏ `reviewed`, `refuseReviewer`), `requests/budget-questions/`, `requests/sla/step-sla.policy.ts` (+ spec: bỏ `FINANCE_QUESTION`;
  bước `NEED` nhắc người giữ + người yêu cầu, không cấp trên — `QĐ-100j`),
  `requests/spend/finance-review.repo.ts`, `routeFinanceReview` ở `step-routing/spend-routing.policy.ts`; sửa
  `requests.module.ts` (thứ tự controller giữ cho phần còn lại), `request-end/request-end.service.ts`,
  `group-request/group-resolution-ending.service.ts`, `spend/spend-status.service.ts`, `spend-submission/spend-queue.service.ts`,
  `step-routing/reassignment.policy.ts` (`NO_FINANCE_REVIEWER`, `FINANCE_REVIEW` kind),
  `timing/request-timing.policy.ts` + dto, `my-requests/*`, `reassignment/controlled-wait.dto.ts`,
  `request-submission/request-preview.*`, `notifications/public/notifications.types.ts`, `notifications/inbox/inbox.policy.ts`;
  `budgets/public/budgets.extension-points.ts` (gỡ `BudgetChangeListeners`), `budgets/budgets.module.ts`,
  `budgets/version/version-decision-judge.service.ts`, `version-decision-writer.service.ts`, `budgets/year-end/year-end.service.ts`;
  README `requests` (bảng tầng: chạy `pnpm arch:capabilities --module requests`, chép đúng), README `budgets`.
- Depends on: Task 4.
- Acceptance: test matrix L2-14 (7 route 404), L1-23, QĐ-100j (unit); `pnpm arch:check` xanh (không vòng, không thư mục > 25 file).
- Verify: `pnpm exec jest src/modules/requests src/modules/budgets src/modules/notifications`; `pnpm arch:check`;
  `pnpm arch:capabilities --module requests`;
  `pnpm test:scripts` (bảng tầng README); `pnpm test:http -- test/http/requests/finance-routes-removed.http-spec.ts` (mới: 7 route 404).

### Task 6: test của tính năng bị gỡ

- Files: xóa (tính năng không còn theo `QĐ-97c`/`FR-3.20`): `test/http/requests/finance-reviews.http-spec.ts`,
  `test/integration/requests/spend-finance-review.integration-spec.ts`, `spend-finance-information.integration-spec.ts`,
  `spend-awaiting-budget.integration-spec.ts`, `spend-reviewer-separation.integration-spec.ts`, `request-finance-notices.integration-spec.ts`,
  `test/integration/identity-access/step-sla-finance-question.integration-spec.ts`; sửa phần Finance trong
  `spend-review-flows.integration-spec.ts`, `self-service-every-role.integration-spec.ts`, `request-timings.integration-spec.ts`,
  `controlled-wait.integration-spec.ts`, `step-reassignment.integration-spec.ts`, `step-sla-constraints.integration-spec.ts`,
  `test/integration/notifications/step-sla.integration-spec.ts`, `test/support/spend-harness.ts`, `test/support/request-harness.ts`.
  Ghi danh sách xóa + lý do vào _Verification_.
- Depends on: Task 5.
- Acceptance: không còn test gọi route/trạng thái đã gỡ; không nới khẳng định của phần còn lại; test matrix QĐ-100j (integration,
  `step-sla.integration-spec.ts`: người nhận của bước nhu cầu đổi theo luật, không phải nới).
- Verify: `pnpm test:discovery`; `pnpm test:integration -- test/integration/requests/spend-review-flows.integration-spec.ts test/integration/requests/self-service-every-role.integration-spec.ts test/integration/requests/request-timings.integration-spec.ts test/integration/requests/controlled-wait.integration-spec.ts test/integration/requests/step-reassignment.integration-spec.ts test/integration/requests/step-sla-constraints.integration-spec.ts test/integration/notifications/step-sla.integration-spec.ts`.

### Checkpoint 2

Kiểm tra nhanh tracker §4.5; `openapi:export` đã gỡ 7 operation; `pnpm rules:check`. Hết lượt 2.

### Phase 3 — hiển thị, thông báo, seed

### Task 7: snapshot Người duyệt chi, hàng đợi, chi tiết Request, thông báo

- Files: `spend-approval-view/spend-approval.dto.ts`, `spend-approval.mapper.ts` (+ spec), `spend-approval-view.service.ts`,
  `spend-approval-queue.service.ts`, `access-request/access-request.dto.ts` (`spend`), `request-view/*`,
  `spend/spend-submission.dto.ts` (queue/batch), `status/rules/status-rules-budget-check.policy.ts` (mới, thay finance) + spec,
  `status/rules/request-status-rules.policy.ts`, `notifications/public/notifications.types.ts` (mã `REQUEST_BUDGET_BLOCKED`,
  `REQUEST_RESERVE_CONFIRMATION_NEEDED`, `REQUEST_RETURNED_AT_DECISION`), `notifications/inbox/inbox.policy.ts`.
- Depends on: Checkpoint 2.
- Acceptance: test matrix L2-16, AC-9, AC-26 (ai thấy gì), AC-18 (người nhận khi trả về lúc duyệt), lô hàng loạt (thông báo),
  thông báo ở Task 3 có người nhận đúng.
- Verify: `pnpm exec jest src/modules/requests/spend-approval-view src/modules/requests/status`;
  `pnpm test:integration -- test/integration/requests/request-status-notifications.integration-spec.ts test/integration/requests/mobile-spend-approval.integration-spec.ts test/integration/audit/request-status-projection.integration-spec.ts`;
  `pnpm test:http -- test/http/requests/spend-batch-list.http-spec.ts test/http/requests/my-requests.http-spec.ts`.

### Task 8: seed tối thiểu, flow, e2e

- Files: `src/cli/seed/fixture/shared-demo-v3/requests.ts` (`R9`), `src/cli/seed/fixture/demo-fixture.types.ts`,
  `src/cli/seed/steps/scenario-path.ts` (+ spec), `src/cli/seed/fixture/shared-demo-v3.spec.ts`, `docs/guides/seed.md`;
  `test/flows/mf1-request-contract.flow-spec.ts` (ca override ⟹ 422 schema), `test/flows/mf4-budget.flow-spec.ts`,
  `test/e2e/paid-request-to-seat.e2e-spec.ts`, `test/e2e/mobile-approver-journey.e2e-spec.ts` (bỏ `noIndependentReview`).
- Depends on: Task 7.
- Acceptance: test matrix _seed_; flow/e2e MF-1, MF-4 xanh.
- Verify: `pnpm exec jest src/cli/seed`;
  `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts`;
  `pnpm test:flows -- test/flows/mf1-request-contract.flow-spec.ts test/flows/mf4-budget.flow-spec.ts`;
  `pnpm test:e2e -- test/e2e/paid-request-to-seat.e2e-spec.ts test/e2e/mobile-approver-journey.e2e-spec.ts`.

### Checkpoint 3

Kiểm tra nhanh tracker §4.5; tự review diff toàn hạng mục theo spec; ghi _Verification_. Hết lượt 3.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng; danh sách test bị xóa kèm lý do.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).

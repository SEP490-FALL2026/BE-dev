# Plan: qd103-role-dashboards-digest

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `bc10bd1c` (đọc ở `46b6a94e`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W8, subagent số 3, 08–09/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **không giao** — gói **W8b**, `blocked` tới khi Owner chọn (Q-160: cả ba phase, chỉ Phase 2 hai thông báo ngân sách, hoặc để sau).
  Khi mở: Phase 1 trang tổng quan (Task 1–3), Phase 2 hai thông báo ngân sách (Task 4–5), Phase 3 bản tóm tắt (Task 6–8). Ước ~50 file, 0
  migration. Làm **sau** W8 `qd103-mf5-followups` (cùng controller điểm điều chỉnh).

## Before coding

Đọc `src/modules/dashboards/README.md` (bất biến mục, một vai một trang), `section/dashboard-section.policy.ts`, `manager/manager-dashboard.service.ts`
(mẫu), `docs/rules/api-contract.md` (lỗi, handoff), `docs/rules/module-structure.md` (≤ 25 file — `budgets/budget/` đã 24: chỉ sửa file có sẵn),
`scripts/arch/tiers.cjs` (`dashboards` trên cùng; sau W6 là T8; `requests → budgets` cùng tầng được phép), `budgets/year-end/year-end.job.ts` (mẫu
sweeper, ADR-0018), `notifications/README.md` (mã đóng, `PARAM_KEYS_BY_CODE`, `eventKey`). Đối chiếu tên operation nguồn trong `openapi.json` sau W2–W5
và W8 (`purchaseInvoiceDueList`) (mỗi `sourceOperationId` phải tồn tại — test ở Task 3). W2–W5 chưa PASS: dừng, báo chat review.

## Design review

- Thiết kế: `blocked` — đã sửa theo cổng thiết kế W8 (09/11/2026); chờ Owner chọn gói W8b (Q-160). Không giao code.

| Finding | Mức  | Kết luận                                                                                                                            | Sửa ở                                     |
| ------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| DA8-17  | TB   | Đúng — bảng `spending_approver_digests` không có route đọc; chống trùng đã có ở thông báo (`prisma/models/notifications.prisma:55`) | spec _Ownership_, mục 5, Q-152; Task 6, 8 |
| DA8-22  | Thấp | Đúng — BRD 5.5.4 chỉ nêu _tiết kiệm thực_ ⟹ `realisedSavingList` (W5)                                                               | spec mục 2                                |
| DA8-13  | TB   | Đúng — mảng lồng của hai trang (nếu có ngoài khung `section`) đăng ký `NESTED_ARRAYS` + sự kiện                                     | spec _Gói W8b_; Task 3                    |
| DA8-21  | Thấp | Đúng — Sizing mỗi trường một dòng                                                                                                   | spec                                      |
| DA8-01  | Cao  | Đúng — trang tổng quan `US-12-15` ngoài 2 hạng mục Owner giao; có nguồn BRD rõ ⟹ W8b, không bỏ                                      | spec _Gói W8b_                            |

## Tasks

### Phase 1 — trang tổng quan

### Task 1: khung vai + đếm qua facade

- Files: `src/modules/dashboards/section/dashboard-section.policy.ts` (+ spec: `DashboardRole`, `countedOnly`), `section/dashboard-section.dto.ts`
  (mô tả `COUNTED` có thể không nguồn), `src/modules/budgets/public/budgets-dashboard.api.ts` (mới), `budgets.module.ts` (export),
  `src/modules/requests/public/requests-dashboard.api.ts` (`spendDecisionsHeldBy`, `overdueHeadSteps`), repo đếm tương ứng (số câu lệnh hằng).
- Depends on: W2–W5 PASS.
- Acceptance: mỗi hàm đếm bằng tổng của route nguồn cùng phạm vi; `countedOnly` chỉ cho `overdueHeadSteps`.
- Verify: `pnpm exec jest src/modules/dashboards/section src/modules/budgets/public src/modules/requests/public`; `pnpm arch:check`.

### Task 2: `financeDashboardGet`, `spendingApproverDashboardGet`; sửa trang trưởng phòng

- Files: `src/modules/dashboards/finance/finance-dashboard.{controller,dto,service,service.spec}.ts`, `spending-approver/spending-approver-dashboard.{controller,dto,service,service.spec}.ts`,
  `manager/manager-dashboard.{service,dto,service.spec}.ts`, `dashboards.module.ts`, `README.md`.
- Depends on: Task 1.
- Acceptance: spec _Behavior_ 1–4; test matrix AC-5, AC-5 phủ định, AC-6, AC-6 chỉ xem, B#46.
- Verify: `pnpm exec jest src/modules/dashboards`; `pnpm arch:capabilities --module dashboards`.

### Task 3: quyền đọc điểm điều chỉnh (Q-151); HTTP + integration; handoff OpenAPI

- Files: controller + dto `licensing/subscription-adjustment/` (W5: `SPENDING_APPROVER` đọc, lọc `redAlert`), `test/http/dashboards/dashboards.http-spec.ts`,
  `test/integration/dashboards/role-dashboards-finance.integration-spec.ts` (mới: so từng số `COUNTED` với route nguồn; mọi `sourceOperationId` có trong
  OpenAPI), `test/integration/dashboards/dashboards-http.integration-spec.ts`, http spec điểm điều chỉnh của W5, `test/support/api-coverage-manifest.ts`,
  `test/support/openapi-example-manifest.ts`.
- Depends on: Task 2.
- Acceptance: test matrix _quyền (phủ định)_, Q-151, hồi quy dashboards.
- Verify: `pnpm test:http -- test/http/dashboards/dashboards.http-spec.ts`;
  `pnpm test:integration -- test/integration/dashboards/role-dashboards-finance.integration-spec.ts test/integration/dashboards/dashboards-http.integration-spec.ts`;
  `pnpm openapi:export`; `pnpm test:gates`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5; `openapi:export` diff chỉ ở `dashboards*`, `subscriptionAdjustment*`. Mục `savings` trỏ `realisedSavingList` (W5 — DA8-22).
Ghi _Verification_.

### Phase 2 — thông báo ngân sách

### Task 4: `BUDGET_NEW_YEAR_NO_BUDGET`

- Files: `src/modules/notifications/public/notifications.types.ts`, `inbox/inbox.policy.ts` (+ spec khóa), `src/modules/budgets/public/budgets.api.ts`
  (`announceYearStartNoBudget`), `budget/budget-notifier.service.ts` (+ spec), `budget/commitment.repo.ts` (gom `NO_BUDGET` theo Cost Center),
  `src/modules/requests/year-start-commitments/year-start-commitments.service.ts` (gọi khi `completed_at`), test
  `test/integration/budgets/budget-new-year-no-budget.integration-spec.ts` (mới).
- Depends on: Checkpoint A; W4 `qd103-new-year-auto-commitments` PASS.
- Acceptance: test matrix B#22, B#22 lặp.
- Verify: `pnpm exec jest src/modules/notifications/inbox src/modules/budgets/budget`;
  `pnpm test:integration -- test/integration/budgets/budget-new-year-no-budget.integration-spec.ts test/integration/notifications/in-app-notifications.integration-spec.ts`.

### Task 5: `BUDGET_OVER_RESERVE`

- Files: `notifications.types.ts`, `inbox.policy.ts`, `budget/budget-notifier.service.ts`, `purchase-invoice/purchase-invoice-decision.service.ts` (W4),
  test `test/integration/budgets/budget-over-reserve.integration-spec.ts` (mới).
- Depends on: Task 4.
- Acceptance: test matrix B#29, B#29 phủ định; transaction xác nhận rollback thì không có thông báo.
- Verify: `pnpm test:integration -- test/integration/budgets/budget-over-reserve.integration-spec.ts`; `pnpm exec jest src/modules/budgets`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; tự review spec mục 6–7. Ghi _Verification_.

### Phase 3 — bản tóm tắt Người duyệt chi

### Task 6: tham số kỳ bản tóm tắt

- Files: `src/modules/operating-parameters/parameter-definitions.policy.ts` (+ spec). **Không** migration (DA8-17).
- Depends on: Checkpoint B.
- Acceptance: `operatingParameterList` có `SPENDING_APPROVER_DIGEST_PERIOD` mặc định `MONTHLY`; giá trị lạ ⟹ 422 `VALIDATION_ERROR`.
- Verify: `pnpm exec jest src/modules/operating-parameters`;
  `pnpm test:integration -- test/integration/operating-parameters/operating-parameters-http.integration-spec.ts`.

### Task 7: facade số của kỳ

- Files: `src/modules/licensing/public/licensing.api.ts` (`adjustmentDigestFacts`) + repo trong `licensing/subscription-adjustment/`,
  `src/modules/budgets/public/budgets.api.ts` (`digestFigures`) + repo đọc `realised_savings`, còn lại năm.
- Depends on: Task 6.
- Acceptance: số đếm theo `[from, to]` đúng biên (đầu, cuối kỳ, múi giờ tổ chức); số câu lệnh hằng (`test/support/query-count.ts`).
- Verify: `pnpm exec jest src/modules/licensing/subscription-adjustment src/modules/budgets`; `pnpm arch:check`.

### Task 8: job `spending-digest` + mã `SPENDING_APPROVER_MONTHLY_DIGEST`

- Files: `src/modules/requests/spending-digest/` (job + spec, service, policy + spec — không repo bảng, không codec; khóa kỳ qua
  `AuditApi.lastEventOfResources`),
  `notifications.types.ts`, `inbox.policy.ts`, test `test/integration/requests/spending-digest.integration-spec.ts` (mới).
- Depends on: Task 7.
- Acceptance: test matrix AC-28 tóm tắt, idempotent, tham số kỳ, không Người duyệt chi, _DA8-17 không bảng_.
- Verify: `pnpm exec jest src/modules/requests/spending-digest src/modules/notifications/inbox`;
  `pnpm test:integration -- test/integration/requests/spending-digest.integration-spec.ts`; `pnpm arch:capabilities --module requests`.

### Checkpoint C (hết lượt 3)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export`); tự review
spec mục 5; README `requests`, `budgets`, `notifications`, `dashboards` khớp. Ghi _Verification_.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).

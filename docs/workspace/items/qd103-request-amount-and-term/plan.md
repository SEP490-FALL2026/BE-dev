# Plan: qd103-request-amount-and-term

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `1cd81101`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W3, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **hai lượt** — Phase 1 (Task 1–3, dừng ở Checkpoint A), Phase 2 (Task 4–6, dừng ở Checkpoint B).

## Before coding

Đọc `src/modules/requests/README.md` (bất biến, thứ tự khóa _hàng request rồi khóa năm_, giới hạn 25 file/thư mục —
`access-request/`, `spend/`, `group-request/` đã đủ 25), `docs/rules/module-structure.md` (nhóm chỉ qua điểm vào
`<…>-<nhóm>.service.ts`; ngoài capability chỉ Nest module/`public/` thấy nhóm), `docs/rules/database-business.md`,
`docs/rules/api-contract.md`. Đối chiếu code ở `1cd81101`: `access-request/pricing.policy.ts:58-91`,
`access-request/request-facts.service.ts:113-155,221-278`, `spend/budget-check.service.ts:51-198`, `spend/line-allocation.policy.ts:40-85`,
`grant/grant.policy.ts:40-75`, `licensing/provisioning/tasks/provisioning-grant-writer.service.ts:113-128`,
`renewal-request/renewal-request-writer.service.ts:53-63`, `renewal-request/renewal-request.service.ts:56-131`,
`service-account-request/service-account-request.dto.ts:18`, `group-request/group-request.dto.ts:27-35`,
`group-request/beneficiary-eligibility.policy.ts:24-33`, `spend-submission/supplement-*.ts`. Kiểm `package.json` cho lệnh test.

## Design review

Audit thiết kế bằng subagent chỉ-đọc 08/11/2026: 3 Cao, 3 Trung bình, 0 Thấp ⟹ đã sửa (DA3-01 tính lại ở mọi lần kiểm trong
`BudgetCheckService.run`; DA3-02 Q-29 đổi: kỳ mới ở năm sau ⟹ 0 tháng năm hiện hành; DA3-03 Request nhóm `expectedEndDate` +
`TERM_REQUIRED`; DA3-04 thêm writer/redirect Request tiếp tục và DTO tài khoản dịch vụ, test 600 và tài khoản dịch vụ; DA3-05 Request
cũ `price_kind` null đọc giá hiện hành; DA3-07 phần của hạng mục: `spend/pricing/` → nhóm `spend/repricing/` chỉ `spend` gọi) và
câu Q-23 (đổi sang ngày kết thúc theo QT 1.1, `US-05-23` AC-2/AC-9); không sửa: không có.

## Tasks

### Phase 1 — schema, hàm số tiền, gửi cá nhân

### Task 1: migration số tiền và thời hạn

- Files: `prisma/models/requests.prisma` (`AccessRequest.termMonths Int?`, `amountMonths`, `priceKind`, chú thích `expectedEndDate`;
  `RequestSupplement` cột ngày nullable + `beforeExpectedEndDate`/`afterExpectedEndDate`),
  `prisma/migrations/<ts>_request_amount_and_term/migration.sql` (CHECK `amount_months` 0–12, `price_kind`),
  `test/integration/requests/access-request-constraints.integration-spec.ts` (thêm ca).
- Depends on: none.
- Acceptance: DB nhận `term_months` null, `amount_months` 0; từ chối `amount_months` 13, `price_kind` lạ; supplement không ngày chi ghi được.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/requests/access-request-constraints.integration-spec.ts`.

### Task 2: hàm số tiền + giá `ONE_TIME` của catalog

- Files: `src/modules/requests/access-request/pricing.policy.ts` (+ `pricing.policy.spec.ts`), `access-request/access-request.types.ts`
  (`PricingRecord`: thêm `kind`, `months`; bỏ `schedule`/`expectedSpendOn` khỏi giá mới), `access-request/access-request.json.ts` (đọc
  `payment_schedule` cũ, không ghi mới), `src/modules/catalog/subscription/subscription-facts.service.ts` + `subscription.repo.ts`
  (`priceOfPlan` trả `{ kind, unitPrice, billingCycle }`; `PERPETUAL` `ACTIVE` có giá ⟹ `ONE_TIME`), `catalog/public/catalog.api.ts`.
- Depends on: Task 1.
- Acceptance: test matrix R-B01 (3 dòng), QĐ-106d, Q-23 (3 ca), Q-29 (phần hàm: kỳ mới năm sau ⟹ 0) ở cấp unit.
- Verify: `pnpm exec jest src/modules/requests/access-request/pricing.policy.spec.ts src/modules/catalog/subscription`.

### Task 3: gửi cá nhân, xem trước, đề xuất, bản nháp dùng hàm mới; `expectedEndDate`; cấp theo ngày kết thúc

- Files: `access-request/request-facts.service.ts` (`assess`, `priceFor`, `termRequired`, khoảng ngày kết thúc),
  `access-request/access-request.dto.ts` (`submitBodySchema.expectedEndDate`, `pricingSchema`, `requestSchema.termMonths` nullable),
  `access-request/access-request.errors.ts`, `access-request/access-request.http-errors.ts` (`TERM_REQUIRED`, `END_DATE_OUT_OF_RANGE`
  422 + ví dụ), `request-intake/access-request-submission.mapper.ts` (+ spec; ghi `expectedEndDate`, `amountMonths`, `priceKind`),
  `request-view/pricing-view.service.ts`, `access-request/access-request-pricing.mapper.ts`, `assessment/assessment.dto.ts`,
  `assessment/quote-pricing.policy.ts` (+ spec), `request-draft/request-draft.repo.ts`, `request-draft/request-draft-policy.json.ts`,
  `grant/grant.policy.ts` (+ spec), `licensing/public/licensing.types.ts`, `licensing/provisioning/tasks/provisioning-grant-writer.service.ts`.
- Depends on: Task 2.
- Acceptance: test matrix R-D01 (2 dòng), FR-2.8, AC-9, QĐ-106b, L2-12 (DTO).
- Verify: `pnpm exec jest src/modules/requests/access-request src/modules/requests/assessment src/modules/requests/grant src/modules/requests/request-draft src/modules/requests/request-intake`;
  `pnpm test:integration -- test/integration/requests/access-request-pricing.integration-spec.ts test/integration/requests/request-price-source.integration-spec.ts test/integration/requests/access-request-preview.integration-spec.ts test/integration/requests/access-request-new-software.integration-spec.ts test/integration/requests/request-amount-term.integration-spec.ts`
  (file cuối mới); `pnpm test:http -- test/http/requests/dot-1-removed-fields.http-spec.ts test/http/requests/request-drafts.http-spec.ts`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`,
`pnpm openapi:export` — diff chỉ ở các trường spec nêu). Tự review diff theo spec mục 1, 3, 7, 9. Ghi _Verification_; lượt 2 bắt
đầu từ commit của lượt 1.

### Phase 2 — nhóm, tiếp tục, tài khoản dịch vụ, tính lại, bổ sung

### Task 4: Request nhóm, tài khoản dịch vụ, Request tiếp tục dùng hàm mới

- Files: `group-request/group-request.dto.ts` (`expectedEndDate?`, bỏ `termLimit`/`termBeyondLimit`, `LINE_REASONS` + `TERM_REQUIRED`),
  `group-request/group-request.policy.ts` (+ spec; dòng không chính thức thiếu ngày kết thúc), `group-request/group-request.http-errors.ts`,
  `group-request-submission/group-request.service.ts`, `group-request-submission/group-request-writer.service.ts` (chép ngày kết thúc vào
  dòng), `service-account-request/service-account-request.dto.ts` + `service-account-request.service.ts` (bỏ `termMonths`),
  `renewal-request/renewal-request-writer.service.ts` (`from`/`endDate` thay `expectedSpendOn`), `renewal-request/renewal-request.service.ts`
  (`redirect`: `expectedEndDate`).
- Depends on: Checkpoint A.
- Acceptance: test matrix FR-2.8 nhóm (2 ca), tiếp tục (600), Q-29 (phần gửi: 0 tháng), tài khoản dịch vụ.
- Verify: `pnpm exec jest src/modules/requests/group-request src/modules/requests/group-request-submission src/modules/requests/renewal-request src/modules/requests/service-account-request`;
  `pnpm test:integration -- test/integration/requests/group-request-submit.integration-spec.ts test/integration/requests/group-request-constraints.integration-spec.ts test/integration/requests/service-account-request.integration-spec.ts test/integration/licensing/renewal-request.integration-spec.ts`.

### Task 5: tính lại ở mọi lần kiểm; kiểm một năm theo giá gốc; hồ sơ bổ sung giảm thời hạn

- Files: `spend/repricing/spend-repricing.service.ts` (mới, điểm vào nhóm) + `spend-repricing.service.spec.ts`,
  `spend/budget-check.service.ts` (gọi `reprice` đầu `run`; một năm; bỏ `costs()` thuế), `spend/line-allocation.policy.ts` (+ spec; bỏ
  `scaleSchedule`), `spend/spend-submission.policy.ts` (`checkSupplement`, `supplementChangeOf`), `spend/spend-submission.dto.ts`
  (`supplementBodySchema`), `spend-submission/supplement-pricing.service.ts`, `spend-submission/supplement-recorder.service.ts`,
  `requests.module.ts` (provider). Test: `test/integration/requests/spend-budget-check.integration-spec.ts`,
  `spend-budget-check-years.integration-spec.ts`, `spend-approval.integration-spec.ts`, `spend-batches.integration-spec.ts`,
  `spend-supplements.integration-spec.ts`, `group-request-spend.integration-spec.ts`, `group-request-supplement.integration-spec.ts`.
- Depends on: Task 4.
- Acceptance: test matrix QĐ-106a (2 dòng), DA3-01 (trình lô 05/01; dòng xác nhận dự phòng để sibling budget-check phủ), Q-29 (duyệt
  05/01), FR-3.2 thuế, L2-38 (2 dòng), nhóm, DA3-05.
- Verify: `pnpm exec jest src/modules/requests/spend src/modules/requests/spend-approval src/modules/requests/group-line-decisions`;
  `pnpm test:integration -- test/integration/requests/spend-budget-check.integration-spec.ts test/integration/requests/spend-budget-check-years.integration-spec.ts test/integration/requests/spend-approval.integration-spec.ts test/integration/requests/spend-batches.integration-spec.ts test/integration/requests/spend-supplements.integration-spec.ts test/integration/requests/group-request-spend.integration-spec.ts test/integration/requests/group-request-supplement.integration-spec.ts`;
  `pnpm arch:check` (nhóm `spend/repricing/` chỉ được `spend` gọi qua điểm vào).

### Task 6: flow/e2e và seed

- Files: `test/flows/mf1-request-contract.flow-spec.ts`, `test/flows/mf1-group-request.flow-spec.ts`,
  `test/e2e/paid-request-to-seat.e2e-spec.ts` (số tiền theo tháng còn lại, bỏ trường lịch); `src/cli/seed/steps/request.steps.ts`,
  `src/cli/seed/fixture/shared-demo-v3/requests.ts` (`termMonths` → `expectedEndDate`), `src/cli/seed/fixture/shared-demo-v3.spec.ts`.
- Depends on: Task 5.
- Acceptance: flow/e2e MF-1 xanh với số tiền mới; test matrix _seed_.
- Verify: `pnpm test:flows -- test/flows/mf1-request-contract.flow-spec.ts test/flows/mf1-group-request.flow-spec.ts`;
  `pnpm test:e2e -- test/e2e/paid-request-to-seat.e2e-spec.ts`; `pnpm exec jest src/cli/seed`;
  `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; README `requests`/`catalog` cập nhật; tự review diff theo spec mục 2, 4, 5, 6, 8, 10; ghi _Verification_.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).

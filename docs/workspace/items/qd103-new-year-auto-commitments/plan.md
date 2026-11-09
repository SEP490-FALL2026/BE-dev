# Plan: qd103-new-year-auto-commitments

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `5fd5f594` (sau commit `qd103-purchase-invoice-sbf19` Phase 3; W2, W3 PASS).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W4, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `verified` (gói 4, 09/11/2026, nhánh `feat/qd103-108-mf145`; chưa review, chưa merge `dev`). PR: chưa có.
- Giao code: **hai lượt** — Phase 1 budgets (Task 1–3, Checkpoint A), Phase 2 nguồn + job (Task 4–6, Checkpoint B). Ước ~40 file.

## Delta gói 4 (MF1-C, 09/11/2026) — thắng mọi chỗ khác của spec/plan này

Nguồn: [SPEC](../../../reviews/mf1-mf4-reaudit-2026-11-09/SPEC.md) §4 MF1-C, §4b RV-01/RV-03/RV-19/RV-22, `QĐ-109a`. Đã làm ở BE (commit gói 4):

- **Chỉ Request có khoản.** Bỏ: khoản theo Assignment không Request (Q-01 B), `request_id` nullable, `assignment_id`, CHECK/UNIQUE theo Assignment, đổi
  `budgetCommitmentList`/`budgetCommitmentRelease`, mở rộng listener thu hồi cho khoản theo Assignment (**Task 1–3 cũ chỉ còn phần migration/`holdYearStart`
  rút gọn**), `assignment-chain.repo.ts`, `lockOpenSeats`, `getPlanPrice(…, on)` (giá của gói nay không theo phòng và không theo ngày: giá thuê bao chính
  hiện tại — lượt trễ vẫn cùng giá vì chạy trong ngày), `createdAt` của tổ chức (Q-48 thay bằng _chưa từng có dấu chạy năm nào_ ⟹ chỉ đánh dấu năm đầu).
- **Nguồn** = Request `GRANT`/`SERVICE_ACCOUNT`/`GROUP_GRANT` trả phí (`PAID_IN_CATALOG`/`NEW_SOFTWARE`) ở trạng thái `AWAITING_EXECUTION`/`EXECUTING`/`COMPLETED`
  (đọc lúc chạy, dưới khóa hàng), gói `K1`/`K2`; seat = người chưa cấp (Request một người đang chờ IT, dòng nhóm `APPROVED`) + grant còn giữ ngày 01/01
  (`LicensingOpenGrantsApi.listHeldSeatsOfRequests`: không `failed`/`cancelled`, `valid_until` null hoặc sau 01/01, `expected_end_date` null hoặc từ 01/01).
  `ROLE_BASED`/`K4` đọc mặc định: không có cột nên không có seat theo vai; `K4` bị loại theo loại gói. **RV-03** (Request tiếp tục đã duyệt chưa kéo dài) để gói 11.
- **Số tiền** = `requestAmountOf` với `checkDate = 01/01/Y` cho từng nhóm seat cùng ngày kết thúc (tháng kết thúc tính đủ), cộng lại; `seat_monthly_minor` = giá tháng
  làm tròn lên (cột mới, gói 9 dùng lại). Không giá / giá một lần ⟹ bỏ mục, audit `YEAR_START_SKIPPED` `NO_PRICE`; phòng không Cost Center ⟹ `NO_COST_CENTER`.
- **Thứ tự khóa** (xem comment `year-start-commitments-batch.service.ts`): hàng Request (`FOR UPDATE` theo id, lô ≤ 100) → đọc grant không khóa → khóa năm (Cost Center theo id)
  trong `BudgetsApi.holdYearStart`. Không leader: hai instance chạy cùng lúc an toàn nhờ UNIQUE (Request, năm) + kiểm dưới khóa hàng; lượt hoàn tất dấu chạy báo audit một lần.
- **Dấu chạy** `year_start_commitment_runs` (khóa `(organization_id, year)`): migration đánh dấu năm triển khai đã xong cho tổ chức đang có.

## Before coding

Đọc `src/modules/budgets/README.md` (invariants cam kết :82-90, `@@unique` (Request, năm), year lock :79-80), `src/modules/requests/README.md`
(lock order :194-195), `src/modules/budgets/public/budgets.extension-points.ts:38-43` (thứ tự _hàng Request trước, rồi năm_),
`docs/decisions/0018-sweepers-stay-in-the-api-process.md`, `docs/rules/security-jobs.md:69-131`, `docs/rules/database-business.md` (đổi NOT NULL ⟹ rà mọi
chỗ đọc `requestId` của khoản: `rg -n "requestId" src/modules/budgets`), `docs/rules/module-structure.md` (R6: đọc nguồn ở `licensing/assignment`, dùng hàm
chuỗi `assignment-chain.repo.ts` của sibling; không thêm cạnh `assignment → provisioning`). Đối chiếu `budgets/budget/commitment.repo.ts:39-109`,
`budgets/year-end/year-end.job.ts:6-16`, `budgets/commitment/commitment-revocation.listener.ts` (sibling), `requests/spend/commitment-request-facts.listener.ts`,
`catalog/subscription/subscription-facts.service.ts` (`priceOfPlan`), `organization/public/organization-read.api.ts:167`.

## Design review

Audit `design-audit-w4.md` (08/11/2026) — hạng mục này: 0 Cao · 5 TB · 1 Thấp.

| Finding                                                                            | Mức  | Kết quả                                                                                | Sửa ở                           |
| ---------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------- | ------------------------------- |
| DA4-35 Request/Assignment kết thúc sau 01/01 vẫn có khoản; không khóa hàng Request | TB   | đã sửa — mỗi lô khóa Request → kiểm lại → `lockOpenSeats` `FOR SHARE` → năm            | spec _Behavior_ 7; Task 5, 6    |
| DA4-36 hàm chuỗi trong `licensing/assignment` gọi sibling ở `provisioning` (vòng)  | TB   | đã sửa — hàm đặt ở `licensing/assignment/assignment-chain.repo.ts` từ hạng mục release | spec _Ownership_; Task 4        |
| DA4-37 nguồn B không loại `K4`; Q-47 giá ngày chạy                                 | TB   | đã sửa — nguồn B chỉ `K1`/`K2`; Q-47 → B (giá hiệu lực 01/01)                          | spec _Behavior_ 3, 5; Task 4, 5 |
| DA4-38 thiếu AC-2, AC-8, tài khoản dịch vụ, audit chạy lại                         | TB   | đã sửa — luật _Request của khoản_; 3 dòng test; audit `YEAR_START_RUN`                 | spec _Behavior_ 1, 2; Task 5, 6 |
| DA4-17 đường dẫn test `requests/spend-*`                                           | TB   | đã sửa — `test/integration/budgets/`                                                   | Task 2                          |
| DA4-39 quan hệ với đóng năm                                                        | Thấp | đã sửa — một câu ở _Out of scope_                                                      | spec                            |

Không sửa: không có. Ghi chú Q-01 của audit (chuỗi `HANDOVER` thường có Request) đã đưa vào _Behavior_ 2.

## Tasks

### Phase 1 — budgets: nguồn gốc khoản, khoản theo Assignment, ghi khoản 01/01

### Task 1: migration `year_start_commitments`

- Files: `prisma/migrations/<ts>_year_start_commitments/migration.sql` (cột, CHECK, UNIQUE partial, bảng dấu chạy, chèn dấu năm hiện hành),
  `prisma/models/budgets.prisma` (`CommitmentOrigin`, `BudgetCommitment.requestId String?`, `assignmentId`), `prisma/models/requests.prisma`
  (`YearStartCommitmentRun`), `test/integration/budgets/year-start-commitments-migration.integration-spec.ts` (mới).
- Depends on: `qd103-commitment-release-on-revocation` (`seat_monthly_minor`), `qd103-role-based-access` (cột Assignment).
- Acceptance: test matrix _migration + seed_; tổ chức có sẵn có dấu năm hiện hành `completed_at`.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/budgets/year-start-commitments-migration.integration-spec.ts test/integration/budgets/budget-constraints.integration-spec.ts`.

### Task 2: `requestId` nullable ở mọi nơi đọc khoản; danh sách + `origin`; Finance phần dư

- Files: `src/modules/budgets/budget/commitment.repo.ts` (`page` :272, `totals` :310), `budgets/commitment/commitment.service.ts` (`page` :217,
  `releaseRemainder` :85), `commitment/commitment.dto.ts`, `commitment/budget-commitments.controller.ts`, `budgets/public/budgets.extension-points.ts`
  (`CommitmentReleaseGuard`), `src/modules/requests/spend/commitment-release.listener.ts` (binder hiện có; khoản không Request do budgets hỏi licensing),
  `budgets/invoice/invoice.service.ts` (`factsOf` khoản không Request ⟹ nhà cung cấp qua plan của Assignment), `src/modules/licensing/public/licensing.api.ts`
  (`assignmentFactsOf`); test `test/integration/budgets/budget-commitment-list.integration-spec.ts`, `test/http/budgets/budget-commitments.http-spec.ts`.
- Depends on: Task 1.
- Acceptance: test matrix _API_, _Finance phần dư_; danh sách hiển thị khoản không Request.
- Verify: `pnpm exec jest src/modules/budgets`; `pnpm typecheck`;
  `pnpm test:integration -- test/integration/budgets/budget-commitment-list.integration-spec.ts test/integration/budgets/spend-commitments.integration-spec.ts`;
  `pnpm test:http -- test/http/budgets/budget-commitments.http-spec.ts`.

### Task 3: `BudgetsApi.holdYearStart` + listener giải phóng theo Assignment

- Files: `budgets/public/budgets.api.ts`, `budgets/public/budgets.types.ts`, `budgets/budget/commitment.repo.ts` (`holdYearStart`),
  `budgets/commitment/commitment.service.ts`, `budgets/commitment/commitment-revocation.listener.ts`, `budgets/README.md`;
  test `test/integration/budgets/year-start-hold.integration-spec.ts` (mới), thêm ca vào `test/integration/budgets/commitment-release-on-revocation.integration-spec.ts`.
- Depends on: Task 2.
- Acceptance: test matrix _chưa có ngân sách_, Q-27 điều kiện 1 (vế `ON CONFLICT`), _giải phóng theo Assignment_.
- Verify: `pnpm exec jest src/modules/budgets/commitment`;
  `pnpm test:integration -- test/integration/budgets/year-start-hold.integration-spec.ts test/integration/budgets/commitment-release-on-revocation.integration-spec.ts`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` —
diff chỉ `budgetCommitmentList`/`Release`). Tự review spec mục 7–8. Ghi _Verification_.

### Phase 2 — nguồn, giá 01/01, sweeper

### Task 4: đọc nguồn từ licensing; giá hiệu lực theo ngày; ngày tạo tổ chức

- Files: `src/modules/licensing/public/licensing.api.ts` (`listRunningPaidSeatsOn`, `lockOpenSeats`), `licensing/public/licensing.types.ts`,
  `licensing/assignment/assignment.repo.ts` (đọc tập Assignment mở, dùng `assignment-chain.repo.ts`), `src/modules/catalog/public/catalog.api.ts`
  (`getPlanPrice(…, on?)`), `catalog/subscription/subscription-facts.service.ts`, `catalog/subscription/subscription.repo.ts`,
  `src/modules/organization/public/organization-read.api.ts` (+ `organization.types.ts` nếu cần `createdAt`); test
  `test/integration/licensing/licensing-assignment-read-contracts.integration-spec.ts`, `test/integration/requests/request-price-source.integration-spec.ts` (ca `on`).
- Depends on: Checkpoint A.
- Acceptance: đúng tập Assignment mở ngày 01/01 kèm trường spec _Ownership_; `lockOpenSeats` bỏ Assignment đã kết thúc; giá theo kỳ hiệu lực ngày `on`;
  `pnpm arch:capabilities --module licensing` không có cạnh `assignment → provisioning`.
- Verify: `pnpm exec jest src/modules/licensing/assignment src/modules/catalog/subscription`;
  `pnpm test:integration -- test/integration/licensing/licensing-assignment-read-contracts.integration-spec.ts test/integration/requests/request-price-source.integration-spec.ts`;
  `pnpm arch:capabilities --module licensing`.

### Task 5: policy + service chọn nguồn, Request của khoản, số tiền, Cost Center, khóa lô

- Files: `src/modules/requests/year-start-commitments/year-start-commitments.policy.ts` (+ spec), `year-start-commitments.repo.ts` (khóa hàng Request
  `FOR UPDATE ORDER BY id`), `year-start-commitments.service.ts`, `requests/requests.module.ts`; test
  `test/integration/requests/year-start-commitments.integration-spec.ts` (mới).
- Depends on: Task 4.
- Acceptance: test matrix AC-1, AC-2, có thời hạn, Q-01 B, tài khoản dịch vụ, R-C03, loại trừ, AC-8, Q-27, Q-29 B', Q-47 B, thiếu giá/CC, cost center.
- Verify: `pnpm exec jest src/modules/requests/year-start-commitments`;
  `pnpm test:integration -- test/integration/requests/year-start-commitments.integration-spec.ts`.

### Task 6: sweeper + dấu chạy + audit lượt chạy + README + seed

- Files: `requests/year-start-commitments/year-start-commitments.job.ts` (+ spec), `requests/requests.module.ts`, `requests/README.md`,
  `docs/rules/security-jobs.md`; test thêm ca vào `test/integration/requests/year-start-commitments.integration-spec.ts` (idempotent + AC-7, chạy trễ, đua, Q-48).
- Depends on: Task 5.
- Acceptance: test matrix _idempotent + AC-7_, _chạy trễ_, _đua_, Q-48, _migration + seed_.
- Verify: `pnpm exec jest src/modules/requests/year-start-commitments`;
  `pnpm test:integration -- test/integration/requests/year-start-commitments.integration-spec.ts test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts`;
  `pnpm test:flows -- test/flows/mf4-budget.flow-spec.ts`; `pnpm arch:check`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; tự review spec mục 1–7, 9; ghi _Verification_. Seed: tổ chức seed tạo trong năm hiện tại ⟹ không có khoản 01/01
(Q-48) — không có task seed; W7 dựng demo.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).

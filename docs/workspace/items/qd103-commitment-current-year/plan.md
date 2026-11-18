# Plan: qd103-commitment-current-year

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `1cd81101` + commit của `qd103-request-amount-and-term`,
  `qd103-budget-check-three-outcomes`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W3, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **một lượt** (3 task, ~15 file).

## Before coding

Đọc README `budgets` (thứ tự khóa năm), `src/modules/budgets/commitment/commitment.service.ts:170-200`,
`src/modules/budgets/budget/commitment.repo.ts:55-115`, `budget/budget.errors.ts:77-85`, `budget/budget.http-errors.ts:80-95,225-235`,
`src/modules/requests/group-line-decisions/group-spend-decision.service.ts:33,74-80` (một lần quyết mọi dòng),
`group-line-decisions/group-spend-hold.service.ts:32`, `spend-approval/spend-decision-recorder.service.ts:84-89` (Request tiếp tục),
nơi gọi `holdForRequest` (`grep -rn "holdForRequest" src/modules`). `docs/rules/module-structure.md` (file mới
`commitment-hold.policy.ts` ở cấp capability `budgets/commitment/`, hậu tố `.policy.ts`). Không migration.

## Design review

Audit thiết kế bằng subagent chỉ-đọc 08/11/2026: 1 Cao, 1 Trung bình, 1 Thấp ⟹ đã sửa (DA3-02 qua Q-29 mới: kỳ mới năm sau ⟹ số
tiền 0, không gọi `hold`, duyệt tháng 12 không 409, thêm test kết thúc 31/12; DA3-12 Request nhóm một lần quyết một khoản, thay dòng
test _dòng thứ 3 năm sau_; DA3-21 cờ dự phòng suy từ `snapshot_check_id`); không sửa: không có.

## Tasks

### Task 1: `hold` chỉ nhận một mục dương của năm hiện hành, trên phiên bản đã duyệt

- Files: `src/modules/budgets/commitment/commitment.service.ts`, `src/modules/budgets/budget/commitment.repo.ts`,
  `src/modules/budgets/budget/budget.errors.ts`, `src/modules/budgets/budget/budget.http-errors.ts` (409
  `BUDGET.COMMITMENT_NOT_HOLDABLE` + ví dụ), `src/modules/budgets/public/budgets.api.ts`, `src/modules/budgets/public/budgets.types.ts`
  (chú thích), `src/modules/budgets/commitment/commitment-hold.policy.ts` (mới, pure) + `commitment-hold.policy.spec.ts`,
  `test/integration/budgets/commitment-current-year.integration-spec.ts` (mới).
- Depends on: none (trong hạng mục; sau hai sibling).
- Acceptance: test matrix FR-5.8a (2 ca), INV-16 (hai mục; số tiền 0).
- Verify: `pnpm exec jest src/modules/budgets/commitment src/modules/budgets/budget`;
  `pnpm test:integration -- test/integration/budgets/commitment-current-year.integration-spec.ts`.

### Task 2: requests đưa một mục (hoặc không gọi khi số tiền 0); test duyệt chi

- Files: `src/modules/requests/spend-effects/spend-effects.service.ts` (do budget-check tạo), `src/modules/requests/group-line-decisions/group-spend-hold.service.ts`;
  test cập nhật: `test/integration/budgets/spend-commitments.integration-spec.ts`, `test/integration/requests/spend-approval.integration-spec.ts`,
  `test/integration/requests/group-request-spend.integration-spec.ts`, `test/integration/requests/group-request-invoiced-release.integration-spec.ts`,
  `test/integration/licensing/renewal-request.integration-spec.ts` (Request tiếp tục kết thúc 31/12, vắt năm),
  `test/http/budgets/budget-commitments.http-spec.ts` (khoản một năm).
- Depends on: Task 1.
- Acceptance: test matrix R-C01, R-C03, QĐ-106a, DA3-02 (2 ca), tiếp tục vắt năm, DA3-12 (2 ca), DA3-21, AC-5, dữ liệu cũ, INV-16 trùng.
- Verify: `pnpm exec jest src/modules/requests/spend-effects src/modules/requests/group-line-decisions`;
  `pnpm test:integration -- test/integration/budgets/spend-commitments.integration-spec.ts test/integration/requests/spend-approval.integration-spec.ts test/integration/requests/group-request-spend.integration-spec.ts test/integration/requests/group-request-invoiced-release.integration-spec.ts test/integration/licensing/renewal-request.integration-spec.ts`;
  `pnpm test:http -- test/http/budgets/budget-commitments.http-spec.ts`.

### Task 3: README và seed

- Files: `src/modules/budgets/README.md` (luật một khoản, số tiền 0, Q-27, hai điều kiện cho W4), `src/modules/requests/README.md`
  (dòng `spend-effects`). Seed: không đổi dữ liệu (fixture duyệt trong năm hiện hành); chỉ chạy kiểm.
- Depends on: Task 2.
- Acceptance: test matrix _một bước_ để lại cho `qd103-request-single-step-routing` (ghi trong Verification là phủ ở hạng mục đó);
  `ops:seed` vẫn xanh.
- Verify: `pnpm rules:check`;
  `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts`;
  `pnpm test:flows -- test/flows/mf1-request-contract.flow-spec.ts test/flows/mf4-budget.flow-spec.ts`.

### Checkpoint

Kiểm tra nhanh tracker §4.5; `openapi:export` chỉ thêm ví dụ lỗi (nếu có). Tự review diff. Ghi _Verification_ và nhắc chat review
thêm điều kiện W4 vào ledger (spec mục 7).

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).

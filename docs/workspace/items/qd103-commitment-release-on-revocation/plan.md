# Plan: qd103-commitment-release-on-revocation

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `5fd5f594` (sau commit `qd103-k4-key-pool` Phase 2; W2, W3 đã PASS).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W4, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **một lượt**, 4 task, ~25 file.

## Before coding

Đọc `src/modules/budgets/README.md` (lock order :79-80, invariants cam kết :82-90), `src/modules/licensing/README.md` (listener thu hồi :53-72,
thứ tự listener :140-141), `src/core/extension/listeners.ts:1-27` (listener ném ⟹ rollback cả transaction; chạy theo thứ tự `add`),
`docs/decisions/0019-module-tiers-and-public-api.md` (`budgets` T5 import `licensing/public` T4), `docs/rules/module-structure.md` (25 file/thư mục:
`requests/spend` đủ 25 — chỉ sửa file có sẵn; R6 không vòng — hàm chuỗi ở `licensing/assignment`). Đối chiếu: `licensing/public/licensing.extension-points.ts:55-94`,
`provisioning/revocation-completion/revocation-completion.service.ts:48-66`, `provisioning/revocation.policy.ts:129-182`, `budgets/budget/commitment.repo.ts:72-202`,
`requests/return-request/return-revocation.listener.ts` (chỉ ném ở `BEFORE_WORK`), `requests/renewal-apply/renewal-request.repo.ts`, W3 `requests/spend-effects/spend-effects.service.ts`.

## Design review

Audit `design-audit-w4.md` (08/11/2026) — hạng mục này: 0 Cao · 5 TB · 1 Thấp, cộng phần DA4-36 (TB, ghi ở `qd103-new-year-auto-commitments`).

| Finding                                                                | Mức  | Kết quả                                                                                    | Sửa ở                        |
| ---------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------ | ---------------------------- |
| DA4-13 `K1` dùng `endedOn − 1` ⟹ giải phóng thừa với `CUT`, lệch tháng | TB   | đã sửa — `paidThroughOn` vào `RevocationTaskFacts`; `K1` dùng nó                           | spec _Behavior_ 3; Task 3, 4 |
| DA4-14 Request tiếp tục dùng chung `expectedEndDate`                   | TB   | đã sửa — `coveringRequests` trả khoảng phủ của từng Request                                | spec _Behavior_ 4; Task 3    |
| DA4-15 ghim thứ tự `licensing → requests → budgets` sai cơ chế         | TB   | đã sửa — không phụ thuộc thứ tự với `return-request`; test chỉ ghim handover trước         | spec _Behavior_ 7; Task 4    |
| DA4-16 `requests/spend` đủ 25 file                                     | TB   | đã sửa — repo ở `renewal-apply/renewal-request.repo.ts`, binder sửa file có sẵn            | spec _Ownership_; Task 3     |
| DA4-17 đường dẫn test `requests/spend-*`                               | TB   | đã sửa — `test/integration/budgets/`                                                       | Task 2, 4                    |
| DA4-18 Q-39 bỏ quyền có thời hạn; Q-05 ghi lại                         | Thấp | đã sửa — `coveredMonths` tới tháng `coverEndOn`; Q-05 ghi QUESTIONS (việc của chat review) | spec _Behavior_ 4–5          |
| DA4-36 (phần chung) hàm chuỗi `predecessor_id`                         | TB   | đã sửa — đặt ở `licensing/assignment/assignment-chain.repo.ts` ngay hạng mục này           | spec _Ownership_; Task 3     |

Không sửa: không có.

## Tasks

### Task 1: migration lý do + giá một seat

- Files: `prisma/migrations/<ts>_commitment_release_on_revocation/migration.sql`, `prisma/models/budgets.prisma` (`CommitmentReleaseReason`,
  `BudgetCommitment.seatMonthlyMinor`), `test/integration/budgets/budget-constraints.integration-spec.ts` (ca CHECK).
- Depends on: `qd103-k4-key-pool` (cùng enum `CommitmentReleaseReason`).
- Acceptance: test matrix _migration + seed_ (phần DB); CHECK từ chối `seat_monthly_minor = 0`.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/budgets/budget-constraints.integration-spec.ts`.

### Task 2: giữ khoản ghi giá một seat

- Files: `src/modules/budgets/public/budgets.types.ts`, `budgets/budget/commitment.repo.ts`, `budgets/commitment/commitment.service.ts`,
  `src/modules/requests/spend-effects/spend-effects.service.ts` (+ spec; tên theo W3 — W3 chưa đổi thì `requests/budget-information/spend-effects.service.ts:57-79`),
  `requests/group-request/group-grant.service.ts` (nếu giữ khoản nhóm ở đây).
- Depends on: Task 1.
- Acceptance: test matrix _hold ghi giá seat_.
- Verify: `pnpm exec jest src/modules/budgets/commitment src/modules/requests/spend-effects`;
  `pnpm test:integration -- test/integration/budgets/spend-commitments.integration-spec.ts test/integration/requests/group-request-spend.integration-spec.ts`.

### Task 3: dữ kiện thu hồi + hàm chuỗi + hook `coveringRequests`

- Files: `src/modules/licensing/public/licensing.types.ts`, `licensing/assignment/assignment-chain.repo.ts` (mới), `licensing/licensing.module.ts`,
  `licensing/provisioning/revocation-completion/revocation-completion.service.ts`, `licensing/provisioning/provisioning-task.types.ts`,
  `src/modules/budgets/public/budgets.extension-points.ts`, `src/modules/requests/spend/commitment-request-facts.listener.ts` (+ spec),
  `src/modules/requests/renewal-apply/renewal-request.repo.ts`, `licensing/README.md`; test `test/integration/licensing/provisioning-revocation-read-contracts.integration-spec.ts`,
  `test/integration/requests/commitment-request-facts.integration-spec.ts`.
- Depends on: Task 2.
- Acceptance: `AFTER_WORK` `COMPLETED` mang `grantRequestId` (cả `RENEWAL_CARRY`, `HANDOVER`), `endedOn`, `paidThroughOn`, `sources`; hook trả Request
  cấp + tiếp tục kèm `coverFromOn`/`coverEndOn`; không file mới trong `requests/spend`.
- Verify: `pnpm exec jest src/modules/licensing/provisioning src/modules/requests/spend`;
  `pnpm test:integration -- test/integration/licensing/provisioning-revocation-read-contracts.integration-spec.ts test/integration/requests/commitment-request-facts.integration-spec.ts`;
  `pnpm arch:capabilities --module licensing`; `pnpm arch:capabilities --module requests`.

### Task 4: listener `budgets.commitment-release` + policy + hồi quy nơi gọi

- Files: `src/modules/budgets/commitment/commitment-revocation.policy.ts` (+ spec), `commitment/commitment-revocation.listener.ts`,
  `commitment/commitment.service.ts`, `budgets.module.ts`, `budgets/README.md`; test `test/integration/budgets/commitment-release-on-revocation.integration-spec.ts` (mới),
  cập nhật ghim thứ tự trong `test/integration/licensing/provisioning-revocation-read-contracts.integration-spec.ts`.
- Depends on: Task 3.
- Acceptance: test matrix AC-21, Q-05 A, `FR-5.8`(5)(a), `K1`, nhóm, cap, Q-39, phủ định (2 dòng), R-J08 (3 dòng), chuỗi Assignment, Request
  tiếp tục, thứ tự listener, lỗi DB.
- Verify: `pnpm exec jest src/modules/budgets/commitment`;
  `pnpm test:integration -- test/integration/budgets/commitment-release-on-revocation.integration-spec.ts test/integration/licensing/provisioning-revocation-complete.integration-spec.ts test/integration/licensing/provisioning-revocation-read-contracts.integration-spec.ts test/integration/personnel/offboarding-departure.integration-spec.ts test/integration/requests/return-request.integration-spec.ts test/integration/budgets/spend-commitment-lifecycle.integration-spec.ts test/integration/installation/seed.integration-spec.ts`;
  `pnpm test:e2e -- test/e2e/offboarding-revocation.e2e-spec.ts test/e2e/department-transfer-review.e2e-spec.ts`;
  `pnpm test:flows -- test/flows/mf2-offboarding.flow-spec.ts test/flows/mf3-transfer.flow-spec.ts test/flows/mf5-rightsizing.flow-spec.ts`; `pnpm arch:check`.

### Checkpoint (hết lượt)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`,
`pnpm openapi:export` — diff chỉ ở enum lý do + `seatMonthly`). Tự review theo spec mục 1–9; kiểm listener không ném ở nhánh nghiệp vụ.
Seed: không có task seed (thu hồi hoàn tất có cam kết không có trong fixture) — `seed.integration-spec.ts` ở Task 4 là bằng chứng.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).

# Plan: qd96-100-annual-budget-reserve-and-floor

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9` + #6 → #13 của Track B.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (C-SPEC-B).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc `AGENTS.md`, `docs/rules/api-contract.md`, `docs/rules/database-business.md`, README `budgets`, `operating-parameters`.
Kiểm `budget_version_history` có giữ `reason` cũ không (quyết định cách drop ở Task 1).

## Tasks

FE-tonight (chỉnh 05/11 theo review main flow): **phần A** = Task 1 (M15a), Task 2a, Task 3, Task 4, Task 5; **phần B** = Task 2b
(vai sở hữu tham số) và Task 6 (M15b). Phụ thuộc phần A: `remove-budget-revision-and-high-value` phần A (cùng `budget.dto.ts`,
merge trước); riêng Task 4 cần `budget-check-three-outcomes` phần A (`carryForwardTotal`).

### Đợt 1 — chốt contract (điều phối viên 05/11/2026, làn R bước R8)

Owner 05/11 xếp phần A vào Đợt 3; điều phối viên kéo **vế DTO/contract** lên **Đợt 1** (sau R6 `remove-budget-revision-and-high-value`)
để FE không phải sửa form ngân sách hai lần. **Đợt 1** = Task 1 (M15a, chỉ thêm cột/nới CHECK — cần để lưu `reserveReason` và tỷ lệ
chụp), Task 2a (khóa tham số, Super Admin đặt), Task 3, Task 5. **Đợt 3** = Task 4 (sàn 409 `BUDGET.BASE_BELOW_CARRY_FORWARD`,
`carryForward` ở response, nhãn `CARRY_FORWARD`) — chờ `carryForwardTotal` của #6 (Đợt 2); `carryForward` là field response **thêm
mới** ở Đợt 3, FE coi là tùy chọn. **B** = Task 2b, Task 6.

| Task | Operation                                         | Request sau (Đợt 1)                                                         | Response sau                                              | Test 422                                                                           |
| ---- | ------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 5    | `budgetProposalSubmit`                            | `{year, lines[{…, amount {amount}}], attachmentIds?}` — bỏ `costCenterId`   | giữ `currency` (đồng tiền báo cáo); Cost Center do server | `costCenterId`; `amount.currency`                                                  |
| 5    | `budgetProposalResubmit`                          | `lines[].amount {amount}`                                                   | như trên                                                  | `amount.currency`                                                                  |
| 5    | `budgetVersionLineAdd`, `budgetVersionLineUpdate` | `amount {amount}`                                                           | như trên                                                  | `amount.currency`                                                                  |
| 3, 5 | `budgetVersionCreate`                             | `{proposalId, base {amount}, reserve? {amount}, reserveReason?, quarters?}` | + `reservePercent`, `defaultReserve`, `reserveReason`     | `base.currency`; `reserve.currency`                                                |
| 3, 5 | `budgetVersionUpdate`                             | `{base?, reserve?, reserveReason?, quarters?}` (tiền `{amount}`)            | như trên                                                  | `currency` ở mọi ô tiền                                                            |
| 3    | `budgetVersionSend`                               | —                                                                           | —                                                         | `reserve ≠ round(%chụp × base)` không lý do ⟹ 422 `BUDGET.RESERVE_REASON_REQUIRED` |
| 5    | `budgetProposalAttachmentDeclare`                 | `sizeBytes ≥ 1`                                                             | —                                                         | `sizeBytes = 0`                                                                    |

`reserve` vắng ⟹ `round(10 % × base)` (tỷ lệ chụp từ `BUDGET_RESERVE_DEFAULT_PERCENT`, mặc định 10). Seed: Task 5 sửa tối thiểu
fixture `shared-demo-v3/finance.ts` + step để `ops:seed` vẫn chạy (bỏ `currency`, `costCenterId`); dữ liệu v3 đầy đủ vẫn ở #28 Task 2.

### Task 1: migration M15a — tỷ lệ chụp, `reserve_reason`, nới CHECK nhãn cam kết (R-05)

- Files: `prisma/migrations/<ts>_budgets_reserve_default/migration.sql` (timestamp đặt lúc merge),
  `prisma/models/budgets.prisma`.
- Depends on: `qd96-100-remove-budget-revision-and-high-value` phần A.
- Acceptance: spec mục 8 (M15a): chỉ thêm cột + `DROP/ADD attachment_check`; không UPDATE `budget_commitments`; không drop `reason`.
- Verify: `pnpm prisma validate`; `pnpm test:gates -- migration-order`.

### Task 2a (Đợt 1): khóa `BUDGET_RESERVE_DEFAULT_PERCENT` (Super Admin đặt)

- Files: `operating-parameters/parameter-definitions.policy.ts` (+ spec).
- Depends on: none.
- Acceptance: khóa nhóm `BUDGET`, int 0..100, mặc định 10; đặt qua `operatingParameterSet` hiện có (Super Admin).
- Verify: `pnpm test -- parameter-definitions.policy`.

### Task 2b (phần B): tham số do Finance sở hữu

- Files: `operating-parameters/parameter-definitions.policy.ts` (+ spec), `operating-parameters.controller.ts`,
  `parameter-change.service.ts`, `operating-parameters.errors.ts`, `operating-parameters.http-errors.ts`.
- Depends on: Task 2a.
- Acceptance: L-815 vế vai sở hữu (`ownerRole = FINANCE`, 403 `PARAMETER.NOT_OWNER`).
- Verify: `pnpm test -- parameter-definitions.policy`; `pnpm test:http` file operating-parameters.

### Checkpoint

`pnpm typecheck`, `pnpm lint`.

### Task 3 (Đợt 1): dự phòng mặc định và lý do khi gửi

- Files: `budgets/version/version-figures.service.ts`, `version-creation.service.ts`, `version.service.ts`, `version-view.service.ts`,
  `budgets/budget/budget.dto.ts`, `version.repo.ts`, `budget.errors.ts`, `budget.http-errors.ts`.
- Depends on: Task 1, Task 2a.
- Acceptance: `US-06-09` AC-30, S-03; response `reservePercent`, `defaultReserve`, `reserveReason`; 422 ở bảng _Đợt 1_.
- Verify: `pnpm test:http` file budget-versions; integration đổi tham số sau khi lập.

### Task 4 (Đợt 3): sàn cam kết chuyển tiếp

- Files: `budgets/version/version-decision-judge.service.ts`, `version-view.service.ts`, `budget/commitment.repo.ts`,
  `budget.errors.ts`, `budget.http-errors.ts`.
- Depends on: Task 1; `qd96-100-budget-check-three-outcomes` phần A (`carryForwardTotal`, Đợt 2).
- Acceptance: `US-06-11` AC-15, `US-06-09` AC-32, L-307.
- Verify: `pnpm test:integration -- spend-commitments spend-commitment-lifecycle` + ca sàn mới.

### Task 5 (Đợt 1): trường server tự tính và `sizeBytes`

- Files: `budgets/budget/budget.dto.ts` (money input), `proposal/proposal-sender.service.ts`, `budget-proposals.controller.ts`,
  `attachment/budget-attachment.dto.ts`; `test/support` ví dụ OpenAPI liên quan; seed tối thiểu
  `src/cli/seed/fixture/shared-demo-v3/finance.ts`, `steps/finance.steps.ts`.
- Depends on: Task 3.
- Acceptance: L-309, L-310; test 422 ở bảng _Đợt 1_; `ops:seed` không gửi `currency`/`costCenterId`.
- Verify: `pnpm test:http` file budget-proposals, budget-attachments; `pnpm openapi:export`.

### Task 6 (phần B): migration M15b — drop `budget_versions.reason` (R-20)

- Files: `prisma/migrations/<ts>_budgets_drop_version_reason/migration.sql`, `prisma/models/budgets.prisma`.
- Depends on: Task 3, Task 5 (không còn code đọc/ghi `reason`); sau Đợt 3.
- Acceptance: spec mục 8 (M15b); lý do revision cũ còn ở `budget_version_history` hoặc Audit `SYSTEM`.
- Verify: `pnpm prisma validate`; `pnpm test:gates -- migration-order`; integration migration.

### Checkpoint

Quick gates đủ bộ (`typecheck`, `lint`, `arch:check`, `rules:check`, `test:gates`, `openapi:export`).

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại                    |
| ------------------ | --------------------- | ----------------- | ------------------------------------------ |
| planned            | —                     | —                 | full suite do Owner ở audit; seed v3 ở #28 |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối; FE được báo.
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi trạng thái sau đúng sự kiện thật.

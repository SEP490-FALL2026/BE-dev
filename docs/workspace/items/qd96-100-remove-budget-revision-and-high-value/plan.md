# Plan: qd96-100-remove-budget-revision-and-high-value

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9` + #6, #7, #8, #11, #12 của Track B.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (C-SPEC-B).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc `AGENTS.md`, `docs/rules/database-business.md`, README `budgets`. `rg "highValue|high_value|revision|Revision|window|LineChange|BudgetChangeListeners|SUPERSEDED|basedOnVersionId" src/modules/budgets src/cli/seed test`.

## Tasks

FE-tonight (chỉnh 05/11 theo review main flow): **phần A** = Task 1 trừ vế gỡ extension point, Task 2 và migration expand
**M-A13** (`high_value_percent DROP NOT NULL`, spec mục _Phần A_); **phần B** = vế extension point của Task 1 (sau
`remove-finance-review-path`) và Task 3 (kèm CHECK R-09). Seed: sửa `fixture/shared-demo-v3/finance.ts` (fixture đã đổi tên ở
`qd96-100-seed-demo-v3` phần A, Task 0), không sửa v2.

### Đợt 1 — chốt contract (Owner 05/11/2026)

Đợt 1 = Task 1 (trừ vế extension point), Task 2, M-A13. Cầu nối vì #6 ở Đợt 2: `budget-check.policy.ts:24,117-121` đổi
`highValuePercent: number | null`, `NULL` ⟹ không phát `HIGH_VALUE` (xóa hẳn ở #6). Tiền giữ `{amount, currency}`, `reserve` bắt
buộc tới khi #14 vế DTO merge (Đợt 1, làn R bước R8 ngay sau hạng mục này — điều phối viên 05/11).

| Task | Operation                                                                       | Request sau                              | Response sau                                                                  | Test 422 field bỏ                                        |
| ---- | ------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1    | `budgetVersionRevise`, `budgetVersionLineWindow`, `budgetVersionLineChangeList` | gỡ route                                 | 404                                                                           | — (op bỏ)                                                |
| 2    | `budgetVersionCreate`                                                           | `{proposalId, base, reserve, quarters?}` | bỏ `highValuePercent`, `highValueAmount`, `basedOnVersionId`, `previousTotal` | `highValuePercent`, `highValueAmount` (2 test)           |
| 2    | `budgetVersionUpdate`                                                           | `{base?, reserve?, quarters?}`           | như trên                                                                      | `highValuePercent`, `highValueAmount`, `reason` (3 test) |
| 2    | `budgetVersionList` query (D5)                                                  | `state` không còn `SUPERSEDED`           | —                                                                             | `?state=SUPERSEDED` (1 test)                             |
| 2    | `budgetVersionGet/List`, `budgetMineVersionList`                                | —                                        | `kind` dòng mới chỉ `INITIAL`                                                 | —                                                        |

### Task 1: gỡ phiên bản sửa đổi, dời khoảng mua, extension point

- Files: xóa `version-revision.service.ts`, `version-window.service.ts`, `version-line-moved.service.ts`,
  `public/budgets.extension-points.ts`; sửa controller/module/judge/writer/year-end theo spec; test liên quan
  (`budget-version*` http/integration).
- Depends on: phần A: `qd96-100-budget-check-three-outcomes` phần A (check không đọc ngưỡng); phần B: `qd96-100-remove-spend-override`,
  `qd96-100-remove-finance-review-path`.
- Acceptance: 3 route 404; (phần B) không còn `listeners.emit`.
- Verify: `pnpm typecheck`, `pnpm arch:check`, `pnpm test:http` file budget-versions.

### Task 2: gỡ ngưỡng giá trị cao và trường revision khỏi DTO/repo/view

- Files: `budget/budget.dto.ts`, `version-figures.service.ts`, `version.repo.ts`, `version-view.service.ts`,
  `version-history.policy.ts` (+ spec), `budget-facts.repo.ts`, `public/budgets.types.ts`, `budget.policy.ts`, `decision.repo.ts`;
  seed tối thiểu `src/cli/seed/fixture/demo-fixture.types.ts`, `steps/finance.steps.ts`, `fixture/shared-demo-v3/finance.ts`;
  migration M-A13 `prisma/migrations/<ts>_budgets_high_value_optional/migration.sql` + `prisma/models/budgets.prisma` (`Int?`).
- Depends on: Task 1.
- Acceptance: L-124; body có `highValuePercent` ⟹ 422.
- Verify: `pnpm test -- version-history.policy budget.policy`; `pnpm test:http` file budget-versions.

### Checkpoint

Quick gates (`typecheck`, `lint`, `arch:check`).

### Task 3: migration đóng phiên bản sửa đổi dở + drop bảng/cột

- Files: `prisma/migrations/<ts>_budgets_retire_revision_and_high_value/migration.sql` (timestamp lúc implement, sau migration #12),
  `prisma/models/budgets.prisma`.
- Depends on: Task 2.
- Acceptance: spec mục 3 (a)–(c).
- Verify: integration migration mới (dựng `REVISION` `SENT` + line change); `pnpm test:gates -- migration-order`.

### Checkpoint

Quick gates đủ bộ + `pnpm openapi:export`, `pnpm arch:docs:check`; mở rộng test AC-25 của #11. **CP-2.**

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại     |
| ------------------ | --------------------- | ----------------- | --------------------------- |
| planned            | —                     | —                 | full suite do Owner ở audit |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối; FE được báo.
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi trạng thái sau đúng sự kiện thật.

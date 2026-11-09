# Plan: qd96-100-remove-spend-override

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9` + #6, #7, #8, #11 của Track B.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (C-SPEC-B).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc `AGENTS.md`, `docs/rules/database-business.md`. `rg "override|bySubstitute|CONFLICT_OF_INTEREST|FALLBACK_APPROVER|CONFLICT_SUBSTITUTE" src/modules/requests test`
để có danh sách cuối. Không chạm `licensing/subscription-renewal`, `personnel`, `budgets` (SoD-8 phiên bản).

## Tasks

FE-tonight (chỉnh 05/11 theo review main flow): **phần A** = Task 1, **phần B** = Task 2.

### Đợt 1 — chốt contract (Owner 05/11/2026)

Đợt 1 = vế _trường_ của Task 1 (DTO, ghi, response); policy gọi `judgeApproval(..., override = null)`. Không chờ #6 (Đợt 2):
tới lúc đó năm `INSUFFICIENT_BUDGET`/`NO_ACTIVE_BUDGET` ở bước duyệt ra verdict `OVERRIDE_REQUIRED` hiện có — không duyệt vượt
được, đúng `QĐ-97c`. Dọn các verdict `OVERRIDE_*` khỏi `spend-decision.policy.ts:44-80` làm cùng #6 Task 4 (Đợt 2).

| Task | Operation                                                       | Request sau                                  | Response sau                                                                                                                           | Test 422 field bỏ   |
| ---- | --------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 1    | `spendApprovalDecide`                                           | `{decision: 'APPROVE' \| 'REJECT', reason?}` | bỏ `decision.overrideReason`, `decision.bySubstitute`                                                                                  | `override` (1 test) |
| 1    | `spendApprovalLineDecide`                                       | `{lines[{employeeId, decision, reason?}]}`   | như trên                                                                                                                               | `override` (1 test) |
| 1    | `spendBatchDecide`                                              | không đổi                                    | `result.reason` còn `OVERRIDE_REQUIRED` tới Đợt 2                                                                                      | —                   |
| 1    | `spendApprovalGet`, `spendBatchItemList`, `budgetCheckYearList` | —                                            | bỏ `overrideReason`, `bySubstitute`, năm `overridden`, `leftReason CONFLICT_OF_INTEREST`; `deciderRole` `MANAGER \| SPENDING_APPROVER` | — (output)          |

### Task 1: gỡ `override` khỏi body, policy, ghi và response

- Files: theo spec mục _Ownership_ (DTO, policy, repo, service, controller, mapper, errors) + test HTTP/integration liên quan
  (`spend-approval`, `spend-decision-constraints`, `group-request-spend`).
- Depends on: vế trường — none (Đợt 1); vế dọn verdict `OVERRIDE_*` — `qd96-100-budget-check-three-outcomes` phần A. Không chờ `remove-finance-review-path`:
  phần A chỉ gỡ trường, không đụng file `spend-years-view` của Finance (vế đó làm cùng Task 2).
- Acceptance: AC-23; response không còn trường đã bỏ; ánh xạ giá trị lịch sử một hàm.
- Verify: `pnpm test -- spend-decision.policy spend-approval.mapper`; `pnpm test:http` file spend-approval;
  `pnpm test:integration -- spend-approval spend-decision-constraints group-request-spend`.

### Task 2: migration lưu bằng chứng + drop cột

- Files: `prisma/migrations/<ts>_requests_drop_spend_override/migration.sql` (timestamp lúc implement, sau migration #11),
  `prisma/models/requests.prisma` (`SpendDecision`).
- Depends on: Task 1 (code không còn đọc/ghi cột).
- Acceptance: spec mục 4.
- Verify: integration migration (dựng `spend_decisions` có override trước migration); `pnpm test:gates -- migration-order`.

### Checkpoint

Quick gates đủ bộ (`typecheck`, `lint`, `arch:check`, `rules:check`, `test:gates`, `openapi:export`); bổ sung ca `override` vào
test AC-25 của `qd96-100-remove-finance-review-path`.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại     |
| ------------------ | --------------------- | ----------------- | --------------------------- |
| planned            | —                     | —                 | full suite do Owner ở audit |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối; FE được báo.
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi trạng thái sau đúng sự kiện thật.

# Plan: qd96-100-request-year-without-spend-date

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9` + #6 → #14 (Track B) và `qd96-100-request-term-limit` (Track R).
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (C-SPEC-B).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc `AGENTS.md`, `docs/rules/database-business.md` (JSON codec), `docs/rules/api-contract.md`. Xác nhận #15 đã merge trên branch
(cùng DTO). `rg -l expectedSpendOn src test` để chốt danh sách file.

## Tasks

FE-tonight (chỉnh 05/11 theo review main flow): **phần A** = Task 1, Task 2, Task 3 trừ vế lệch dòng kế hoạch (S-14); **phần B** =
Task 4 (migration). Vế S-14 của Task 3 **đã bỏ theo `QĐ-101n`** (Request không gắn dòng kế hoạch; capability `plan-line` gỡ ở
`qd96-100-plan-line-removal-and-bm10-lines`, Đợt 1). Phần A không chờ #14: phụ thuộc thật chỉ là `request-term-limit` (cùng DTO,
`effectiveTermOf`). Không động tới `renewal-request` (R-14).

### Đợt 1 — chốt contract (Owner 05/11/2026)

Đợt 1 = **Task 1 + Task 2** (V1 §2 chỉ ghi Task 2; Task 2 phụ thuộc Task 1 — bỏ field mà không có neo server là mock; Task 1 ở
dạng neo = hôm nay giữ hành vi). Task 3 (reprice lúc trình/duyệt) đi **Đợt 2** cùng #6. Từ Đợt 1 tới #7 (Đợt 2) Request cá nhân
bị chặn chỉ còn rút (hồ sơ bổ sung chưa có `termMonths`).

| Task | Operation                                                                                                                                                                                 | Request sau                                                                                         | Response sau                           | Test 422 field bỏ                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------- |
| 1    | (nội bộ) `priceRequest({anchorOn})`, neo = hôm nay                                                                                                                                        | —                                                                                                   | —                                      | —                                              |
| 2    | `accessRequestSubmit`, `accessRequestPreview`, `groupRequestSubmit`, `groupRequestCheck`, `accessRequestDraftSave` (3 nhánh), `accessRequestServiceAccountSubmit`, `accessRequestPropose` | bỏ `expectedSpendOn` (field còn lại theo spec _Phần A_)                                             | `budgetYear` tạm tính theo hôm nay     | `expectedSpendOn` (9 test: 1/op, nháp 3 nhánh) |
| 2    | `accessRequestNeedDecide`, `accessRequestLineNeedDecide`                                                                                                                                  | `{decision, reason?}` (`spend.planLine`/`offPlan` bỏ ở `qd96-100-plan-line-removal-and-bm10-lines`) | —                                      | `spend.expectedSpendOn` (2 test)               |
| 2    | `accessRequestSupplementAdd`                                                                                                                                                              | `{dropEmployeeIds, reason}` (`termMonths?` thêm ở #7, Đợt 2)                                        | bỏ `expectedSpendOn {before, after}`   | `expectedSpendOn` (1 test)                     |
| 2    | `accessRequestGet`, `meAccessRequestList`, `spendQueueList`, `spendApprovalGet`, preview                                                                                                  | —                                                                                                   | bỏ `expectedSpendOn`, giữ `budgetYear` | — (output)                                     |

### Task 1: pricing neo theo ngày do server đặt (giữ hành vi khi neo = hôm nay)

- Files: `access-request/pricing.policy.ts` (+ spec), `request-facts.service.ts`, `access-request-pricing.mapper.ts`,
  `access-request-record.mapper.ts`, `access-request.types.ts`, `assessment/repricing.service.ts`, `assessment-pricing.service.ts`,
  `quote-pricing.policy.ts`.
- Depends on: `qd96-100-request-term-limit` (phần A). Thứ tự migration của Task 4 (phần B) vẫn sau migration của #14.
- Acceptance: `priceRequest({ anchorOn })`; Request mới neo hôm nay.
- Verify: `pnpm test -- pricing.policy quote-pricing.policy`.

### Task 2: bỏ trường ở mọi DTO ghi và response

- Files: DTO + mapper + service ở spec mục _Ownership_ (input, response), draft codec, seed `src/cli/seed/steps/request.steps.ts`.
- Depends on: Task 1.
- Acceptance: L-105, L-106, L-219 (vế response); bản nháp cũ đọc được.
- Verify: `pnpm typecheck`; `pnpm test:http` file access-requests, group-requests, renewal, service-account, preview, supplements.

### Checkpoint

Quick gates (`typecheck`, `lint`, `arch:check`).

### Task 3 (Đợt 2): reprice lúc trình lô và lúc duyệt (vế lệch dòng kế hoạch S-14 đã bỏ theo `QĐ-101n`)

- Files: `spend-submission/spend-batch.service.ts`, `spend/spend-routing.service.ts`, `spend-approval/spend-decision.service.ts`,
  `spend-batch-decision.service.ts`, `group-line-decisions/group-spend-decision.service.ts`, `spend/spend-submission.policy.ts`
  (`spend-submission/plan-line-route.service.ts`, `plan-line/` đã xóa ở `qd96-100-plan-line-removal-and-bm10-lines`).
- Depends on: Task 2.
- Acceptance: `US-06-12` AC-11, `US-06-01` AC-25 (S-14 đã bỏ theo `QĐ-101n` — không viết ca test S-14).
- Verify: `pnpm test:integration -- spend-batches spend-approval spend-budget-check-years` + ca qua năm mới.

### Task 4: migration đổi tên cột neo, drop cột ngày/năm của hồ sơ bổ sung

- Files: `prisma/migrations/<ts>_requests_pricing_anchor_without_spend_date/migration.sql` (timestamp lúc implement, sau migration #14),
  `prisma/models/requests.prisma`.
- Depends on: Task 3 (code không còn đọc cột cũ).
- Acceptance: spec mục 7.
- Verify: `pnpm prisma validate`; integration migration; `pnpm test:gates -- migration-order`.

### Checkpoint

Quick gates đủ bộ + `pnpm openapi:export`. **CP-2** (cùng #11, #12, #13).

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại                  |
| ------------------ | --------------------- | ----------------- | ---------------------------------------- |
| planned            | —                     | —                 | full suite + `test:e2e` do Owner ở audit |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối; FE được báo.
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi trạng thái sau đúng sự kiện thật.

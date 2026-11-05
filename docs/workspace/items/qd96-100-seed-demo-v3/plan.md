# Plan: qd96-100-seed-demo-v3

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent C-SPEC-SEED).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, chưa commit, 06/11/2026) cho Task 0 và phần làm sạch/ngân sách hai năm của Đợt 1; phần A1, Task 4–6 còn `not-started`. PR: chưa có. Cỡ: L ≈ 20h (≈ 14h trong ITEMS, cộng MF-2/MF-3 và Request nhóm/tiếp tục).

## Before coding

- (chỉnh 05/11 theo review main flow) **Phần A** đi theo hàng đợi FE-tonight: Task 0 đầu hàng đợi; Task 1, 2 và phần R1–R13 của
  Task 3 sau các phần A của MF-1/MF-4 (`request-sender-rules`, `request-term-limit`, `request-year-without-spend-date`,
  `budget-check-three-outcomes`, `reserve-confirmation`, `head-group-request-queue`, `approved-end-date`, `renewal-chaining-and-window`,
  `remove-budget-revision-and-high-value`, `annual-budget-reserve-and-floor`). **Phần B** (R14–R16, Task 4–6) làm cuối, khi hạng
  mục mà kịch bản dựa vào đã merge (ghi SHA). Không dựng tạm theo contract cũ.
- Đọc `AGENTS.md`, `docs/rules/operational-commands.md`, `docs/guides/seed.md`. Đối chiếu `openapi.json` cuối: body ngân sách (#14),
  `costCenterCreate` không `kind`, `planCreate` không `sharingPolicy` (#26, #27), `contractEndDate` (#20), Request nhóm và gắn dòng
  kế hoạch (#19), `extensionMonths` (#21), stage ở `spendQueueList` (#6), `accessBlockMode` + căn cứ (#3, #24), `transferReviewDecide`
  (#17), body cấp quyền K1.
- Chỉ quick gates + test theo file; full suite do Owner ở CP-4.

## Tasks

**Đợt (Owner 05/11/2026):** **Đợt 1** = Task 0 (đổi tên fixture v2 → v3, đầu hàng đợi) — không đổi contract HTTP nên không có
test 422. Task 1, 2 và R1–R13 của Task 3 (A1) đi **Đợt 3**, sau các phần A còn lại.

### Phase 0 — phần A0 (đầu hàng đợi)

### Task 0: đổi tên fixture v2 → v3 (Q-R1)

- Files: đổi thư mục `fixture/shared-demo-v2/` → `fixture/shared-demo-v3/`, `shared-demo-v2.spec.ts` → `shared-demo-v3.spec.ts`,
  `id`, mặc định CLI (`seed.arguments.ts`), README fixture (bỏ câu _immutable after shared deployment_).
- Depends on: none (merge trước mọi phần A khác để chúng chỉ sửa v3).
- Acceptance: `pnpm ops:seed plan` mặc định v3; nội dung dữ liệu chưa đổi.
- Verify: `pnpm exec jest src/cli/seed/seed.arguments.spec.ts src/cli/seed/fixture`.

### Phase 1 — phát hành v3, dọn khái niệm đã bỏ (phần A1)

### Task 1: fixture v3 thay v2, lịch một năm, từ chối DB của fixture khác

- Files: `fixture/shared-demo-v3/*` (đã đổi tên ở Task 0), `fixture/demo-fixture.types.ts`, `seed-steps.ts`, `seed.arguments.ts`,
  `seed-run.ts`, `seed-calendar.ts` + spec tương ứng.
- Depends on: phần A của các hạng mục MF-1/MF-4 nêu ở _Before coding_.
- Acceptance: mặc định `shared-demo-v3`; v2 trả `Unknown fixture`; Audit có `DEMO_DATASET:` của fixture khác ⟹ refused; lịch bỏ
  `spendDay`/năm sau; kiểu dữ liệu bỏ `AWAITING_FINANCE_REVIEW`, `highValuePercent`, `reserve`.
- Verify: `pnpm exec jest src/cli/seed/seed.arguments.spec.ts src/cli/seed/seed-run.spec.ts src/cli/seed/seed-calendar.spec.ts`.

### Task 2: ngân sách đã duyệt 6 phòng, dự phòng 10 % do server tính

- Files: `fixture/shared-demo-v3/finance.ts`, `steps/finance.steps.ts`, `fixture/shared-demo-v3.spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: theo bảng ở spec mục 3; body theo #14; DES không có ngân sách; unit kiểm `reserve = 10 %` và bất đẳng thức của
  R10/R12 (đơn giá × người so với cơ sở, cơ sở + dự phòng).
- Verify: `pnpm exec jest src/cli/seed/fixture/shared-demo-v3.spec.ts`.

### Checkpoint 1

`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates` xanh; tự review diff theo spec mục 1–3.

### Phase 2 — kịch bản mới

### Task 3: Request nhóm, tiếp tục, đích có stage, nhà thầu

- Files: `fixture/shared-demo-v3/{organization,requests}.ts`, `steps/{request,scenario-path,organization}.steps.ts`,
  `steps/scenario-path.spec.ts`.
- Depends on: Task 2.
- Acceptance: phần A: R1–R13 theo spec mục 5–6; phần B: R14–R16, 29 người, 27 tài khoản, `contractEndInDays` cho người không phải
  `STAFF` (mục 4).
- Verify: `pnpm exec jest src/cli/seed/steps/scenario-path.spec.ts src/cli/seed/fixture/shared-demo-v3.spec.ts`.

### Task 4 (phần B): MF-2, MF-3

- Files: `steps/personnel.steps.ts` (mới), `fixture/shared-demo-v3/personnel.ts` (mới), `seed-steps.ts`, `demo-run.types.ts` (nếu cần id mới).
- Depends on: Task 3 (cần seat từ R11); OQ-28-1 Owner đã trả lời _chỉ demo bằng tay_ — **không** có step đổi tham số hạn rà soát.
- Acceptance: OFF1–3, MOV1–2 theo spec mục 7–8 (MOV1 hạn mặc định); chạy lại ⟹ `present`.
- Verify: unit của step thuần (nếu có) + Task 6.

### Checkpoint 2

Quick gates xanh; `pnpm exec jest src/cli/seed` xanh; tự review diff theo spec mục 4–10.

### Phase 3 — tài liệu và bằng chứng

### Task 5: README fixture và hướng dẫn

- Files: `fixture/shared-demo-v3/README.md`, `docs/guides/seed.md` (fixture, _Lịch và giới hạn_, runbook reset một lần, checklist),
  `docs/guides/huong-dan-dev-moi.md`.
- Depends on: Task 4.
- Acceptance: README khớp fixture (`shared-demo-v3.spec.ts` đọc bảng); có _diễn biến theo ngày_ và _ranh giới MF-5_.
- Verify: `pnpm rules:format` rồi `pnpm rules:check`; jest fixture spec.

### Task 6: integration seed trên PostgreSQL

- Files: `test/integration/installation/seed.integration-spec.ts`, `seed-rerun.integration-spec.ts`,
  `seed-calendar.integration-spec.ts`; thay `seed-next-year.integration-spec.ts` bằng ca seed ngày 31/12;
  `_serial/seed-check-runtime.integration-spec.ts` nếu đếm người/tài khoản.
- Depends on: Task 5.
- Acceptance: các dòng integration của test matrix.
- Verify: `pnpm test:integration -- test/integration/installation/seed` và
  `pnpm test:integration:serial -- test/integration/_serial/seed-check-runtime` (database riêng theo test guide).

### Checkpoint 3 (CP-4)

Giao Owner SHA cuối + báo cáo test theo file; Owner chạy full suite, deploy, chạy runbook reset VPS (spec) và ghi kết quả thật
vào nhật ký vận hành của `docs/guides/seed.md`.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại                |
| ------------------ | --------------------- | ----------------- | -------------------------------------- |
| unit `src/cli/seed`; integration `test/integration/installation/seed*`; `pnpm seed:local` vào DB trống | cây chưa commit, `feat/qd96-100-alignment`, PostgreSQL `slm-test-db` | 98/98; 17/17; thoát 0, 24 bước ĐÃ GHI | full suite + reset VPS do Owner (CP-4); A1 Đợt 3 |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối; diff đã tự review.
- [ ] Runbook đã cập nhật; phần chưa kiểm chứng trên VPS ghi rõ.
- [ ] Giao Owner review trên revision cụ thể.

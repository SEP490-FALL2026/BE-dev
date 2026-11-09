# Plan: e2e-main-flows-suite — một suite E2E cho 5 main flow

- [Spec](spec.md) · [Test plan](test-plan.md); revision đầu vào: Docs `3d73a7f` (+ thay đổi chưa commit 05/11/2026), BE
  `808318a4` (branch `feat/qd96-100-alignment`).
- Phụ trách: AI/dev được Owner giao. Thiết kế ban đầu bởi: AI (lượt "FE nối 5 main flow", 05/11/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, chưa commit, nhánh `feat/qd96-100-alignment`, 05/11/2026 tối; Task 1–2 và kịch bản `@D1`; Task 3–8 còn lại chờ hạng mục). PR: chưa có. Cỡ ước: harness ≈ 6h; kịch bản ≈ 1–2h mỗi batch hạng mục.

## Before coding

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `test/README.md`, `test/support/README.md`, `scripts/verify/runners.mjs`,
`test/config/jest.e2e.cjs`, `test/config/integration-global-setup.ts`, `test/support/{http-test-app,disposable-database,
migrated-template,api-accounts,status-harness,renewal-harness,pretend-today}.ts`, `test/integration/installation/seed.integration-spec.ts`
và `seed-calendar.integration-spec.ts` (mẫu `runSeed` + giả `Date`). Mỗi lần bật một batch: đọc spec + plan của từng hạng mục
trong batch, đối chiếu route/field/mã lỗi ở `openapi.json` mới; **không** đổi kỳ vọng kịch bản cho khớp code — lệch thì ghi ở
`## Changes and acceptance` của spec này và báo hạng mục chủ. Không chạy full suite (Owner chạy lúc audit); chỉ lệnh ở bảng
dưới. Không mock bước nghiệp vụ; BLOCKER không có `it.skip`.

## Tasks

### Phase 1 — runner và harness (B0)

### Task 1: runner `flows`, lệnh, global setup có mẫu đã seed

- Files: `package.json` (`"test:flows": "jest --config ./test/config/jest.flows.cjs --runInBand"`), `test/config/jest.flows.cjs`,
  `test/config/flows-global-setup.ts`, `test/config/flows-global-teardown.ts`, `test/support/flows/flow-world.ts`,
  `scripts/verify/runners.mjs` (runner `flows`: roots `test/flows`, suffix `.flow-spec.ts`, `needs: ['PostgreSQL on localhost (one seeded template per run, a clone per file; runs in band)']`).
- Depends on: none.
- Acceptance: global setup migrate mẫu, clone, cài installation, `runSeed` fixture mặc định (`apply`, `LOCAL_TEST`) không
  `conflict`, lưu tên mẫu seeded; teardown xóa; thiếu `TEST_DATABASE_ADMIN_URL` ⟹ dừng rõ, không tạo DB. `FlowWorld.open()`
  clone mẫu seeded, `createHttpTestApp({ database, providerOverrides: <mọi *Sweeper/*.job của AppModule ⟹ {}> })`; liệt kê
  trigger đọc `now()` (grep `prisma/migrations`) vào comment của `flow-clock.ts` (luật CR-1).
- Verify: `pnpm test:discovery` → runner `flows` liệt kê đúng; `pnpm typecheck`; `pnpm lint`.

### Task 2: đăng nhập theo vai, đồng hồ, facts

- Files: `test/support/flows/{flow-actors,flow-clock,flow-facts,flow-calls}.ts`, `test/flows/f0-auth-roles.flow-spec.ts`,
  `test/support/README.md`, `test/README.md`.
- Depends on: Task 1.
- Acceptance: `FlowActors` (login/refresh/re-login theo mã `DS1-*`); `FlowClock` (giả riêng `Date`, `jumpTo`/`jumpWorkingDays`
  chỉ tiến, `sweep(name)` gọi service với `now`; bảng tên ⟹ service: `projection` `RequestStatusProjectorApi.project`, `sla`
  `StepSlaSweepApi.sweep`, `redetermination`, `expiry` `ExpiryReminderService.noticeDue`, `transferReview`, `handover`,
  `noticeOverdue`, `leave`, `renewal` `SubscriptionRenewalSweepService.sweep`; thêm `offboardingBlock`, `revocationOverdue`
  khi #1/#2 có service); `FlowFacts` chỉ `SELECT` (đếm bảng, trạng thái, thông báo, Audit); `FlowCalls` gom body theo contract
  sau sửa (một chỗ đổi khi hạng mục đổi body). Không assertion/hook trong `test/support`. F0-01 xanh.
- Verify: `pnpm test:flows -- test/flows/f0-auth-roles` → pass; `pnpm test:gates -- test/gates/test-support-structure`.

### Checkpoint

`pnpm test:flows -- -t "@B0"` xanh trên HEAD; số đo thời gian của `reports/test-timings/flows.json` ghi vào bảng dưới.

### Phase 2 — kịch bản theo batch (bật khi item của batch đã merge vào branch)

### Task 3: MF-1 (F1-01…F1-11)

- Files: `test/flows/mf1-request-approval.flow-spec.ts` (F1-01…F1-07), `test/flows/mf1-group-renewal.flow-spec.ts` (F1-08…F1-11).
- Depends on: Task 2; từng bước theo cột `Item` (#4 #5 #6 #7 #8 #11 #12 #13 #15 #16 #19 #20 #21 #22).
- Acceptance: các bước có tag ≤ batch đã có chạy xanh; `FlowWorld.controlledBudget()` dựng phòng `FLW` + ngân sách `1,5p/1p`
  qua API (SA, FIN1, CEO) ở D0; F1-07/F1-09/F1-10 kiểm đúng mốc.
- Verify: `pnpm test:flows -- test/flows/mf1 -t "@B[0-<k>]"` → pass; đếm `it` khớp test-plan.

### Task 4: MF-2 (F2-01…F2-07)

- Files: `test/flows/mf2-offboarding.flow-spec.ts`.
- Depends on: Task 2; #1 #2 #3 #24 (sweeper `offboardingBlock`, `revocationOverdue` có service nhận `now`).
- Acceptance: không gọi `departure` mà DEV2 mất đăng nhập ở lwd+1, còn đăng nhập ở lwd; hủy sau mốc giữ chặn, gỡ lý do; mọi
  ghi sau khi nhảy tuân CR-1.
- Verify: `pnpm test:flows -- test/flows/mf2 -t "@B[0-<k>]"` → pass.

### Task 5: MF-3 (F3-01…F3-05)

- Files: `test/flows/mf3-transfer.flow-spec.ts`.
- Depends on: Task 2; #1 #6 #17 #18.
- Acceptance: thu hồi mặc định đúng `max(dueOn, noticed + 2 wd)`, actor `SYSTEM`; Request thay thế liên kết và vào hàng đợi
  trình của trưởng phòng mới.
- Verify: `pnpm test:flows -- test/flows/mf3 -t "@B[0-<k>]"` → pass.

### Task 6: MF-4 (F4-01…F4-03)

- Files: `test/flows/mf4-budget.flow-spec.ts`.
- Depends on: Task 2; #6 #8 #13 #14; `FakeObjectStorage` qua `providerOverrides` (chỉ bytes tệp).
- Acceptance: dự phòng 10 % do server tính, lý do khi lệch, sàn chuyển tiếp 409; route revision 404.
- Verify: `pnpm test:flows -- test/flows/mf4 -t "@B[0-<k>]"` → pass.

### Checkpoint

Sau mỗi batch B1/B2/B3: chạy `pnpm test:flows -- -t "@B[0-<k>]"`, ghi kết quả vào bảng; bước đỏ ⟹ báo hạng mục chủ, không
nới kỳ vọng.

### Phase 3 — dữ liệu v3 và MF-5

### Task 7: F1-12 (bản ghi v3) và chuyển seed mặc định

- Files: `test/flows/mf1-seed-v3.flow-spec.ts`.
- Depends on: `qd96-100-seed-demo-v3` (#28) merge; fixture mặc định của `DEMO_FIXTURES` là v3.
- Acceptance: R9/R10/R12/R13/R15/R16 ở đúng trạng thái và đi tiếp được như test-plan; các file khác không đổi kỳ vọng.
- Verify: `pnpm test:flows -- -t "@B[0-4]"` → pass.

### Task 8: MF-5 (F5-01, F5-02; F5-03 khi hết BLOCKER)

- Files: `test/flows/mf5-rightsizing.flow-spec.ts`.
- Depends on: #9 `qd96-100-subscription-owner-confirmation`, #10 (chat MF-5), `g7-vendor-usage-import-identity`,
  `g7-g1-g2-recommendations`, S4b (chưa spec).
- Acceptance: F5-01 mốc ND mỗi mốc một lần; F5-02 khi #9 merge; F5-03 viết khi API tồn tại — trước đó giữ trong test-plan mục 8 là BLOCKER.
- Verify: `pnpm test:flows -- test/flows/mf5` → pass.

### Checkpoint

`pnpm test:flows` toàn bộ xanh trên revision cuối của branch; bảng BLOCKER còn lại gửi Owner.

## Verification and handoff

Lệnh từ gốc BE, DB theo `test/README.md` (`TEST_DATABASE_ADMIN_URL` trỏ `slm-test-db`): `pnpm test:flows` (theo batch),
`pnpm test:discovery`, `pnpm test:gates`, `pnpm lint`, `pnpm typecheck`; tài liệu: `pnpm rules:check`, `pnpm rules:format`.

| Lệnh / kiểm tra AC                                                                          | Revision / môi trường                                                            | Kết quả thực chạy                                                                                            | Giới hạn / việc còn lại                               |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `pnpm test:flows -- -t "@D1"`                                                               | cây làm việc chưa commit, `feat/qd96-100-alignment`, PostgreSQL 17 `slm-test-db` | 5 file, 34 test xanh, ~60 s (seed ~30 s)                                                                     | kịch bản còn lại chờ B1/B2/B3, chat bước 2→5, chat G7 |
| `pnpm test:flows` không có `TEST_DATABASE_ADMIN_URL`                                        | như trên                                                                         | dừng ở global setup, thông báo rõ, không tạo database                                                        | —                                                     |
| `pnpm test:discovery`                                                                       | như trên                                                                         | `flows 5 spec file(s)`, mọi spec thuộc đúng một runner                                                       | —                                                     |
| `pnpm test:gates`                                                                           | như trên                                                                         | 329/330; đỏ 1 ca `module-layout` do `offboarding.policy.spec.ts` 416 dòng (chat bước 2→5), không thuộc suite | —                                                     |
| `eslint`, `prettier --check` trên `test/flows`, `test/support/flows`, `test/config/flows-*` | như trên                                                                         | sạch                                                                                                         | —                                                     |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.

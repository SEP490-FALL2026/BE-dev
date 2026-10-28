# Plan: thiết kế lại các tầng test và pipeline CI của BE

- [Spec](spec.md); revision đầu vào: Docs `578f442`, BE `c49a7dd`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo yêu cầu Owner (28/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Owner đã chốt `OD-T1` → `OD-T5` ngày 28/10/2026 (cả năm theo đề xuất của spec). Đọc `test/README.md`, `test/config/*.cjs`, `test/support/http-test-app.ts`,
`test/support/disposable-database.ts`, `scripts/verify/runners.mjs`, `.github/workflows/ci.yml`. PostgreSQL local theo
`test/README.md` (role thường `CREATEDB`, không superuser).

## Tasks

### Phase T0 — đo nền

### Task T0.1: reporter thời gian

- Files: `test/support/timing-reporter.cjs`, `test/config/jest.*.cjs`, `scripts/verify/test-timings.mjs`.
- Depends on: none.
- Acceptance: mỗi lần chạy ghi `reports/test-timings/<runner>.json` (file, thời gian, số test) và tóm tắt top 20 chậm nhất;
  harness integration ghi thêm pha clone DB / boot app / fixture.
- Verify: chạy một file mỗi runner, JSON có đủ trường; `pnpm check` xanh.

### Task T0.2: số liệu nền

- Files: `plan.md` (bảng Verification).
- Depends on: Task T0.1.
- Acceptance: thời gian toàn bộ unit, HTTP, integration trên máy dev và một lần trên CI (workflow_dispatch), danh sách số test
  từng file làm mốc so sánh "không mất test".
- Verify: bảng số liệu có revision và môi trường.

### Checkpoint

Có số liệu thật thay cho ước lượng từ log cũ; Owner xem lại mục tiêu trong spec nếu số đo khác xa.

### Phase T1 — HTTP contract

### Task T1.1: harness một app mỗi file

- Files: `test/support/http-contract-app.ts`, `test/config/jest.http.cjs`, `scripts/verify/runners.mjs`, `package.json`.
- Depends on: Phase T0, `OD-T1`.
- Acceptance: `createHttpContractApp`, `bearer(principal)`, verifier đọc danh tính từ token; script `test:http`.
- Verify: unit của verifier (token hợp lệ, sai tiền tố, `unavailable`).

### Task T1.2: chuyển 45 file

- Files: `test/e2e/*.e2e-spec.ts` → `test/http/<module>/*.http-spec.ts`.
- Depends on: Task T1.1.
- Acceptance: không file nào dựng app trong `it`/`beforeEach`; số test và tên test giữ nguyên (so với T0.2).
- Verify: `pnpm test:http` xanh, ≤ 3 phút ở máy dev; script so sánh danh sách test → không mất test.

### Task T1.3: gate chống tái phát

- Files: `scripts/verify/verify-test-discovery.mjs`.
- Depends on: Task T1.2.
- Acceptance: gate đỏ khi `createTestingModule`/`createHttpContractApp` nằm trong `it`, `test`, `beforeEach` ở `test/http`.
- Verify: thêm thử một vi phạm → đỏ; gỡ → xanh.

### Checkpoint

HTTP contract nhanh và ổn định; bật job `http-contract` trên CI (Task T3.1 có thể làm sớm cho phần này).

### Phase T2 — integration

### Task T2.1: tách nhóm chạy riêng và mở song song

- Files: `test/config/jest.integration.cjs`, `test/config/jest.integration-serial.cjs`, `test/integration/_serial/**`,
  `scripts/verify/runners.mjs`, `package.json`.
- Depends on: Phase T0.
- Acceptance: file tạo role cluster, ghi `process.env`, CLI dùng tài nguyên chung nằm trong `_serial`; phần còn lại chạy
  `--maxWorkers`.
- Verify: chạy toàn bộ 3 lần liên tiếp, không flaky; thời gian giảm so với T0.2.

### Task T2.2: context không HTTP và builder dữ liệu

- Files: `test/support/integration-context.ts`, `test/support/builders/*.builder.ts`, 20 file chậm nhất theo T0.
- Depends on: Task T2.1.
- Acceptance: 20 file chậm nhất dựng fixture qua builder; HTTP chỉ còn ở file kiểm route.
- Verify: test các file đó xanh, số test giữ nguyên, thời gian từng file giảm.

### Task T2.3: hasher rẻ ngoài suite xác thực

- Files: `test/support/fast-password-hasher.ts`, harness integration.
- Depends on: `OD-T3`.
- Acceptance: override mặc định trong harness; suite `identity-access` tắt override.
- Verify: suite xác thực vẫn dùng tham số production (assertion trên options); thời gian integration giảm.

### Task T2.4: sắp theo module

- Files: `test/integration/**` → `test/integration/<module>/**`.
- Depends on: Task T2.1.
- Acceptance: mỗi file nằm dưới module nó chứng minh; file liên module nằm dưới module đứng tầng cao hơn.
- Verify: `pnpm test:discovery` xanh; số file không đổi.

### Checkpoint

Integration đầy đủ ≤ 15 phút trên một runner 2 vCPU (`workflow_dispatch`).

### Phase T3 — CI phân tầng

### Task T3.1: job `http-contract`, `integration-affected`, `integration`

- Files: `.github/workflows/ci.yml`, `scripts/ci/affected-modules.mjs`.
- Depends on: Phase T1, Phase T2, `OD-T2`, `OD-T5`.
- Acceptance: theo sơ đồ pipeline trong spec; `deploy` needs các job test; timeout theo từng job; gỡ hai bước `if: ${{ false }}`.
- Verify: một push thử lên nhánh tạm: các job chạy đúng điều kiện; cố ý làm đỏ một integration → `deploy` không chạy.

### Task T3.2: workflow nightly

- Files: `.github/workflows/nightly.yml`.
- Depends on: Task T3.1.
- Acceptance: lịch hằng đêm trên `dev`: integration đầy đủ, e2e smoke, `test:mutation`, đính kèm báo cáo thời gian.
- Verify: chạy `workflow_dispatch` một lần xanh.

### Phase T4 — E2E smoke

### Task T4.1: 8–12 hành trình

- Files: `test/e2e/*.e2e-spec.ts` (mới), `test/config/jest.e2e.cjs`.
- Depends on: Phase T2 (builder), `OD-T1`.
- Acceptance: các hành trình liệt kê trong spec; mỗi file một hành trình.
- Verify: `pnpm test:e2e` xanh ≤ 5 phút.

### Phase T5 — unit và tài liệu

### Task T5.1: unit song song, tách gate

- Files: `package.json` (jest config), `src/*.spec.ts` → `*.gate.spec.ts` hoặc project `gates`.
- Depends on: none.
- Acceptance: `pnpm test` không còn `--runInBand`; `pnpm test:gates` chạy riêng, vẫn nằm trong `pnpm check`.
- Verify: `pnpm check` xanh; số test không đổi.

### Task T5.2: viết lại `test/README.md`

- Files: `test/README.md`, `CONTRIBUTING.md`.
- Depends on: Phase T1–T4.
- Acceptance: ≤ 200 dòng: năm tầng, khi nào dùng tầng nào, lệnh, cách chạy một file, cách thêm builder.
- Verify: `pnpm rules:check`, `pnpm rules:format` xanh.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] Mọi điều trong `## Definition of Done` của spec có bằng chứng; số liệu trước/sau ghi ở bảng trên.
- [ ] Spec/plan cập nhật theo implementation cuối.

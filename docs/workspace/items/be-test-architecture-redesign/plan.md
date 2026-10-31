# Plan: thiết kế lại các tầng test và pipeline CI của BE

- [Spec](spec.md); revision đầu vào: Docs `578f442`, BE `c49a7dd`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo yêu cầu Owner (28/10/2026).
- Owner review: một phần — 29/10/2026 Owner chấp nhận devDependency trực tiếp `jest-environment-node` và miễn P7 (trung vị
  integration ≤ 4 s/file), P8 (mọi `beforeAll` khai timeout ≤ 60 s) cho checkpoint này: `owner-waived /
not-required-for-this-checkpoint`, không phải đã đạt
  ([nghiệm thu](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md), _Quyết định Owner_ O4, O5). Peer
  review: tùy chọn.
- Triển khai: `in-progress` — làm local 29/10/2026 trên BE `dee61eb`, chưa commit, chưa có PR; CI mới chưa chạy trên GitHub
  (`UNVERIFIED` cho tới push đầu tiên). Checkpoint 29/10/2026: `local-ready-for-owner-review` /
  `remote-verification-pending` — bước GitHub ở nghiệm thu mục 8. Kết quả và sai khác: mục _Kết quả triển khai_.

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

Integration đầy đủ ≤ 15 phút trên một runner 2 vCPU (`workflow_dispatch`): mục tiêu của thiết kế đầu, **không đạt**. Đo trên
GitHub 30–31 phút (run `40923299529`, `40945441332`); mục tiêu thay bằng số đo theo `OD-R8` = B ([spec](spec.md#ngân-sách-thời-gian-ci-31102026-od-r8--b)).

### Phase T3 — CI phân tầng

### Task T3.1: job `http-contract`, `integration-affected`, `integration`

- Files: `.github/workflows/ci.yml`, `scripts/ci/affected-modules.mjs`.
- Depends on: Phase T1, Phase T2, `OD-T2`, `OD-T5`.
- Acceptance: theo sơ đồ pipeline trong spec; `deploy` needs các job test; timeout theo từng job (quy tắc p95 đo được + 50 %, spec _Ngân sách thời gian CI_); gỡ hai bước `if: ${{ false }}`.
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

## Kết quả triển khai (29/10/2026)

| Task    | Trạng thái                  | Ghi chú / sai khác so với spec                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0.1    | xong                        | `test/config/timing-reporter.cjs` gắn vào mọi runner → `reports/test-timings/<runner>.json` + 10 file chậm nhất; thời gian từng pha clone/boot vẫn ở `TEST_MIGRATION_TIMINGS_FILE` có sẵn. Bổ sung 29/10/2026: runner integration/timing/`_serial`/E2E dùng `test/config/timing-environment.cjs` (devDependency `jest-environment-node`) đo từng `beforeAll` theo sự kiện hook của jest-circus → `beforeAllSeconds`, `beforeAllHooks` mỗi file và tóm tắt `beforeAll` p50/p90/p99/max                                                                                                                                                                         |
| T0.2    | xong, có giới hạn           | Mốc trên máy dev (16 nhân), bảng Verification. Lượt integration tuần tự của bản cũ chạy song song với các agent khác và qua một lần máy ngủ: chỉ dùng được số test/đỏ và trung vị, không dùng tổng thời gian                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| T1.1    | xong                        | `test/support/http-contract-app.ts`: `createHttpContractApp`, `bearer`, `principal`, `UNAVAILABLE_TOKEN`; `pnpm test:http` song song                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| T1.2    | xong                        | 45 file → `test/http/<module>/*.http-spec.ts`; số test mỗi file giữ nguyên (1 238); 9 test đỏ sẵn ở mốc đã sửa: 7 là lỗi của test (dựng app sai vai sau QĐ-87), 2 do văn bản OpenAPI của sản phẩm quá dài                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| T1.3    | xong                        | `scripts/verify/http-app-placement.mjs` trong `pnpm test:discovery`, có node:test; thử vi phạm → đỏ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| T2.1    | xong                        | `jest.integration.cjs` song song + `jest.integration-serial.cjs` cho `test/integration/_serial/` (8 file role cluster/superuser). File ghi `process.env` không cần chạy riêng: Jest cấp mỗi file một bản sao `process.env`. Barrier khóa (`waitForLockWaiters` và 11 truy vấn `pg_locks`) chỉ đếm lock của database của chính file — trước đó đếm cả cluster nên chạy song song làm nhả barrier sớm. 7 file mà kết quả phụ thuộc giới hạn thời gian ngắn đổi sang `*.timing-spec.ts`, chạy tuần tự sau lượt song song (`jest.integration-timing.cjs`, `pnpm test:integration:timing`, bước riêng trên CI và nightly); gate `parallel-safety` chặn ở file khác |
| T2.2    | xong                        | `test/support/builders/` (tài khoản, tổ chức, catalog, ngân sách, seat) gọi đúng service của route; 14 file dựng tiền đề qua harness: 523 s → 196 s (−62 %), 20 file chậm nhất 775 s → 400 s (−48 %), 289 → 289 test; 6 file migration/CLI giữ nguyên ([nghiệm thu §6](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md))                                                                                                                                                                                                                                                                                                                |
| T2.3    | xong                        | `test/support/fast-password-hasher.ts`; chọn mặc định bởi `test/config/integration-setup.cjs` theo đường dẫn file; `identity-access` giữ tham số production                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| T2.4    | xong                        | 269 file → `test/integration/<module>/` (+ `platform/`, `_serial/`), theo route file gọi và module tầng cao nhất nó import                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| T3.1    | xong, chưa chạy trên GitHub | `ci.yml`: `quality`, `http-contract`, `integration` (module bị ảnh hưởng trên `dev`/PR qua `scripts/ci/affected-modules.mjs`, đầy đủ trên `main`), `e2e-smoke` (`main`), `deploy` needs cả bốn; composite action `setup`, `test-database`. Bộ chọn: `.github/actions/**`, `scripts/build/**`, `nest-cli.json` ⇒ chạy tất cả + serial (test đỏ với bản cũ, xanh với bản mới)                                                                                                                                                                                                                                                                                   |
| T3.2    | xong, chưa chạy             | `nightly.yml`: integration đầy đủ + serial + E2E, mutation (có PostgreSQL vì probe là integration)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| T4.1    | xong                        | 8 hành trình, 36 test (`test/e2e/`); 36,7 s khi máy rảnh                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| T5.1    | xong                        | `pnpm test` bỏ `--runInBand`; gate tách `pnpm test:gates`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| T5.2    | xong                        | `test/README.md` 116 dòng; danh mục harness và cơ chế database sang `test/support/README.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `OD-T4` | thử xong, không áp dụng     | `@swc/jest` theo tài liệu NestJS, mọi runner xanh; nhanh hơn ~5 % (cache lạnh, 2 worker) < 30 % → giữ `ts-jest`, đã gỡ dependency ([nghiệm thu §6](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md))                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Ổn định khi chạy song song (lượt đầu 8 worker: 88/261 file đỏ vì hạ tầng, không vì hành vi; sau ba sửa dưới: 1 đỏ có sẵn):
tạo/xóa database của harness chờ tối đa 30 s thay vì 5 s (`harnessAdminClient`); suite CLI chạy `dist/cli.js` khi
`TEST_CLI_RUNTIME=dist` (CI build một lần) thay vì ts-node biên dịch lại cả graph mỗi lần gọi; server test tắt `fsync`,
`synchronous_commit`, `full_page_writes` (composite action `test-database`, lệnh `docker run` trong `test/README.md`).
Ba lượt liên tiếp (P4, [nghiệm thu §5](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md)) cần thêm: app test và `testConfig` chờ kết nối/bắt đầu
transaction 15 s, truy vấn 30 s (giới hạn production chỉ ở suite chứng minh nó); file đo thời gian chạy tuần tự;
`project()` của harness dùng đồng hồ muộn hơn giữa Node và PostgreSQL; `maxWorkers: '50%'` mặc định cho máy dev.

### Ngân sách thời gian CI (31/10/2026)

Task 7.6 của `be-architecture-readability-hardening`, `OD-R8` = B. Chỉ tài liệu; không đổi workflow.

| Đại lượng                 | Giá trị                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| P5, mục tiêu thiết kế đầu | ≤ 15 phút: **không đạt**, không còn là mục tiêu                                                               |
| Job `integration` đo được | 1 886 s (`25d5244`, run `40923299529`) và 1 825 s (`f498c74`, run `40945441332`); song song 1 676 s / 1 624 s |
| Quy tắc `timeout-minutes` | p95 đo được + 50 %, làm tròn lên phút (thay "gấp đôi mục tiêu")                                               |
| Quy tắc cho kết quả trên  | ≈ 47–48 phút; `ci.yml` đặt 40 (Owner 30/10/2026): Owner quyết; chỉ hai mẫu                                    |
| Phải đo lại               | sau Task 7.4 (6 file integration → 20, nhiều database hơn)                                                    |
| P7, P8                    | `owner-waived / not-required-for-this-checkpoint`                                                             |
| Trạng thái CI             | `remote-verification-pending`                                                                                 |

Số đo gốc và cách đọc: [nghiệm thu mục 11](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md#11-bằng-chứng-github-đọc-được-prompt-09-30102026); quy tắc đầy đủ ở spec.

## Verification and handoff

| Lệnh / kiểm tra AC                         | Revision / môi trường                                                                | Kết quả thực chạy                                                                                                                                                                                                                                                                                                                                                                                                                                        | Giới hạn / việc còn lại                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                                       | cây làm việc trên `dee61eb`, Windows 11, 16 nhân, PostgreSQL 17 docker (`fsync=off`) | Trước: 3 905 test (gồm 229 gate) 74,5 s `--runInBand`. Sau: 3 683 test 34–42 s song song + gate 205 test                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                                                      |
| HTTP contract                              | như trên                                                                             | Trước (`test/e2e`): 45 file, 1 238 test, 9 đỏ, 394 s tuần tự. Sau (`test/http`): 46 file, 1 240/1 240, 43–61 s song song                                                                                                                                                                                                                                                                                                                                 | CI 2 vCPU chưa đo                                                                                                                      |
| Integration                                | như trên                                                                             | Trước (tuần tự, đo song song với agent khác và qua một lần máy ngủ): 269 file, 3 465 test, 10 test đỏ (phần lớn hết hạn chờ dọn DB), trung vị 12 s/file. Sau: 254 file song song 6 worker 500–619 s, trung vị 9,3–11,9 s/file; 7 file `*.timing-spec.ts` 28/28 tuần tự ~50 s; `_serial` 8 file 59/59 ~55 s; P4 xanh: 3 lượt liên tiếp ở lần thử 7 ([nghiệm thu §5](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md))               | Tổng thời gian trước không dùng được làm mốc; ≤ 15 phút trên CI 2 vCPU chưa đo; DoD trung vị ≤ 4 s/file và `beforeAll` ≤ 60 s chưa đạt |
| E2E smoke                                  | như trên                                                                             | 8 file, 36/36, 30–55 s                                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                      |
| `pnpm test:discovery`, `pnpm test:scripts` | như trên                                                                             | xanh; 7 runner (thêm `integration-timing`); script 213/213 (gồm `affected-modules`, `http-app-placement`, `test-layout`)                                                                                                                                                                                                                                                                                                                                 | —                                                                                                                                      |
| CI `ci.yml`, `nightly.yml`                 | YAML parse + prettier                                                                | hợp lệ                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Chưa chạy trên GitHub: `UNVERIFIED` tới push đầu tiên                                                                                  |
| Đo `beforeAll` (T0.1 bổ sung)              | như trên, 29/10/2026                                                                 | Probe ngoài repo, 2 worker: hook lồng đo đúng (1,21 s, 2 hook), `beforeEach` không tính, hook quá hạn ghi 0,8 s, file không hook không có trường, file hook cũ bị bỏ qua và dọn. Runner thật: `test/integration/audit/audit.integration-spec.ts` + `audit-query-http.integration-spec.ts` 22/22, `beforeAll` 0,47 s và 25,33 s (cache `ts-jest` lạnh)                                                                                                    | Số trên CI 2 vCPU chờ artifact ([nghiệm thu §8](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md))                |
| Mô phỏng `ci.yml` nhánh thử deploy gate    | như trên, 29/10/2026                                                                 | Ba chỗ sửa của nghiệm thu §8 bước 2: parse YAML, prettier xanh, job `deploy` thật không đổi (gate `deployment-roles` vẫn khớp), job giả cùng `needs`, không `uses`/`secrets`                                                                                                                                                                                                                                                                             | Chạy thật trên GitHub do Owner                                                                                                         |
| Checkpoint sau sắp lại capability          | như trên, 29/10/2026 (lượt 3)                                                        | `pnpm check` exit 0 (unit 3 683/3 683, gate 205/205); `pnpm test:http` 1 240/1 240; integration bị ảnh hưởng 16 file 241/241 và E2E `paid-request-to-seat` 6/6 — chi tiết ở [plan kiến trúc](../be-architecture-boundaries-restructure/plan.md#verification-and-handoff). Báo cáo timing của lượt integration đó có `beforeAll` đo thật: p50 21,9 s, p99 26,4 s trên 16 file (máy dev, cache ts-jest lạnh) — dữ liệu, không phải tiêu chí (P8 được miễn) | Bộ đầy đủ chạy trên CI của Owner                                                                                                       |

- [ ] Mọi điều trong `## Definition of Done` của spec có bằng chứng; số liệu trước/sau ghi ở bảng trên.
      Trung vị ≤ 4 s/file và `beforeAll` ≤ 60 s: `owner-waived / not-required-for-this-checkpoint` (Owner 29/10/2026),
      không phải đã đạt — hiện trạng 9,3–11,9 s/file, 242 hook khai timeout 90–300 s. P5: mục tiêu 15 phút không đạt, thay bằng số
      đo 30–31 phút (`OD-R8` = B, mục _Ngân sách thời gian CI_). Chưa: các mục CI còn lại (chờ lượt chạy của Owner).
- [ ] Spec/plan cập nhật theo implementation cuối.

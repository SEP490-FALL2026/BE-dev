# Plan: tóm tắt AI hàng đợi duyệt của chính mình — phía BE (`US-15-05`)

- [Spec](spec.md); revision đầu vào: Docs `9165b29`, BE `6e7bb09` (nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc của người dùng (04/11/2026). Thiết kế ban đầu bởi: AI (D1–D10 của bản thiết kế contract BE–AI,
  P1–P7 của plan `AI-dev/docs/plans/2026-11-04-be-integration.md`).
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `verified` (local, cây chưa commit, 04/11/2026; giới hạn ở `## Verification and handoff`; gate toàn bộ chưa
  xanh — chưa có một lần `pnpm test:integration` xanh trọn). PR: chưa có (không commit/push theo giao việc).

## Before coding

Đã đọc AGENTS.md, `docs/rules/*` (module-structure, api-contract, operational-commands), tầng ADR-0019, test guide, bản thiết
kế contract BE–AI, contract Python `AI-dev/src/ai_service/contract.py`, bộ kiểm `AI-dev/eval/validators.py`, source
`requests` (`need-decision-queue`, `spend`), `operating-parameters`, mẫu `object-storage` (kiểm cấu hình khi mount) và mẫu lệnh
`assign-subscription-owner`. DB test: Docker `slm-test-db` (127.0.0.1:55432); không dùng dịch vụ PostgreSQL của Windows. Môi
trường: Node 24 làm hai test `openapi-export` (spawn exporter) đỏ; `openapi.json` sinh bằng
`node --no-experimental-strip-types --no-turbo-fast-api-calls node_modules/ts-node/dist/bin.js scripts/dev/export-openapi.ts`.
Bản sao `.claude/worktrees/*` làm `pnpm test` và `pnpm test:discovery` đỏ (không thuộc cây thật).

## Tasks

Các task chạy tuần tự, mỗi task có review riêng trước task sau; số thứ tự theo plan gốc (Task 7 chạy trước Task 6 để tài liệu
ghi theo bằng chứng thật).

### Task 1: schema và công tắc

- Files: `prisma/models/ai-assist.prisma`, `prisma/migrations/20261104100000_ai_assist_invocations/migration.sql`,
  `src/modules/operating-parameters/parameter-definitions.policy.ts` (+ spec), `test/integration/ai-assist/ai-invocations-schema.integration-spec.ts`,
  `test/support/api-collection-registry-exceptions.ts` (biên danh sách tham số 20 → 22)
- Depends on: none
- Acceptance: hai bảng, unique index một phần `ai_invocations_active_per_revision`; `AI_ENABLED`,
  `AI_ACCESS_REQUEST_SUMMARY_ENABLED` (`enum` `ON`/`OFF`, nhóm `AI`, mặc định `OFF`); route `PUT /operating-parameters/{key}`
  không đổi
- Verify: integration `ai-assist` + `operating-parameters` 61 đạt; `pnpm test:gates` 328 đạt

### Task 2: facade nguồn của `requests`

- Files: `src/modules/requests/public/requests-ai-source.api.ts`, `requests.types.ts`, `requests.module.ts`,
  `need-decision-queue/need-decision-queue.repo.ts`, `spend/spend-step.repo.ts`, `requests/README.md`,
  `test/integration/requests/requests-ai-source.integration-spec.ts`
- Depends on: none
- Acceptance: bước nhu cầu và bước duyệt chi đang mở của một nhân viên, lý do đủ (cắt 1000), `assignedAt`; kiểm "bước còn
  mở và còn giao người đó"
- Verify: integration 15/15; hồi quy 6 suite `requests` 74/74; gates 328/328

### Task 3: lõi `ai-assist` (không HTTP)

- Files: `src/modules/ai-assist/ai-service/*`, `invocation/*`, `queue-summary/*` (trừ controller/DTO), `ai-assist.module.ts`,
  `src/infrastructure/config/env-schema.ts`, `env-example.spec.ts`, `.env.example`, `test/support/ai-assist-fakes.ts`
- Depends on: Task 1, Task 2
- Acceptance: client contract v1 (bearer, `X-Request-Id`, một hạn chung, một lần thử lại), ngữ cảnh mờ tối đa 20 bước, bộ
  kiểm đầu ra (D4), chạy nền, đọc lại nguồn khi xem (P5), chống trùng (P1), kẹt 150 s (P2), audit không nội dung
- Verify: `pnpm exec jest src/modules/ai-assist` 145/145; integration `ai-assist` 22/22; gates 328/328; cổng TS của bộ kiểm
  không khác bản Python trên 4 300 ca ngẫu nhiên

### Task 4: route HTTP tóm tắt

- Files: `queue-summary.controller.ts`, `queue-summary.dto.ts`, `queue-summary.http-errors.ts`, `ai-assist-http.module.ts`,
  `src/app/app.module.ts`, `scripts/arch/tiers.cjs`, `src/modules/ai-assist/README.md`, `test/http/ai-assist/queue-summary.http-spec.ts`,
  manifest/registry ở `test/support/`, `openapi.json`, `docs/generated/*`, `ARCHITECTURE.md`, `docs/rules/module-structure.md`
- Depends on: Task 3
- Acceptance: ba operation `aiAccessRequestSummarySource`, `aiAccessRequestSummaryCreate`, `aiAccessRequestSummaryGet` với
  mã lỗi ở spec; wire dùng `lines`; mục registry lồng `aiAccessRequestSummaryGet#lines`
- Verify: `pnpm test:http` 1547/1549 (2 đỏ môi trường `openapi-export`); `test/http/ai-assist` 39/39; gates 328/328

### Task 5: đọc nội dung (Super Admin) và `ops:ai-purge`

- Files: `src/modules/ai-assist/invocation-content/*`, `invocation/invocation-content.repo.ts`,
  `invocation/invocation-audit-event.mapper.ts`, `public/ai-purge.*`, `purge/ai-assist-purge-cli.module.ts`,
  `src/cli/ai-purge/*`, `src/cli/commands.ts`, `package.json`, `docs/rules/operational-commands.md`, ba file gate
  (`extension-wiring`, `module-graph`, `operational-commands`), `test/support/process-graphs.ts`,
  `test/integration/ai-assist/invocation-content-http.integration-spec.ts`, `ai-purge-cli.integration-spec.ts`,
  `test/http/ai-assist/invocation-content.http-spec.ts`
- Depends on: Task 4
- Acceptance: `aiInvocationContentGet` chỉ Super Admin, audit mỗi lần đọc; purge chạy khô mặc định, `--apply` cần
  `--operator`, không xóa lần gọi `PENDING`/`RUNNING`, giữ `ai_invocations`; `GET` của lần gọi đã purge ⇒ 404
- Verify: integration `ai-assist` 42/42 (CLI qua `dist/cli.js`); unit 1269; `test/http/ai-assist` 56/56; gates 330/330

### Task 7: kiểm chứng tích hợp theo AC và cổng toàn bộ

- Files: `test/support/fake-ai-service.ts`, `test/support/ai-summary-harness.ts`,
  `test/integration/ai-assist/queue-summary.integration-spec.ts`, `queue-summary-approver.integration-spec.ts`,
  `queue-summary-failures.integration-spec.ts`
- Depends on: Task 5
- Acceptance: AC-1→AC-9, AC-11→AC-15 theo bảng test của spec; không đổi code sản phẩm
- Verify: integration `ai-assist` 80/80 lúc đó (84/84 sau fix round); bẻ có chủ đích hai lần (11/23 và 14/38 đỏ: lõi tóm tắt,
  công tắc, người giữ bước, bộ kiểm) và ba lần ở fix round (quét kẹt 1/18, ngưỡng kẹt 1/18, `catch` unique 1 test) rồi khôi
  phục; dedupe, 409, 404 người khác, audit đọc nội dung, purge chưa bẻ ở Task 7 (làm ở fix pass)

### Fix pass sau final review toàn nhánh

- Files: `queue-summary/queue-summary-output.policy.ts` (+ spec), `AI-dev/eval/validators.py`, `AI-dev/tests/test_validators.py`,
  `invocation/invocation-content.repo.ts`, `invocation/invocation.types.ts`, `public/ai-purge.api.ts`, `queue-summary.dto.ts`
  (chú thích), `ai-service/ai-service-environment.policy.ts` (+ spec), `.env.example` (chú thích),
  `queue-summary.service.spec.ts`, `test/integration/ai-assist/queue-summary.integration-spec.ts`,
  `ai-purge-cli.integration-spec.ts`, spec/plan này, `docs/roadmap.md` (dòng AC-13), `docs/workspace/items/README.md`
- Depends on: Task 1–7
- Acceptance: I-1 lời khuyên theo dạng câu và bản bỏ dấu bị loại ở cả TS và Python, mô tả thường vẫn qua; I-2 purge chuyển
  `COMPLETED` sang `STALE`, `POST` cùng revision tạo lần gọi mới; I-3 production chặn `http://` tới máy khác; I-4 bẻ có chủ
  đích dedupe, 409, 404 người khác, audit đọc nội dung, purge và ghi số thật
- Verify: mỗi fix có test đỏ trước (I-1 20 ca TS và 20 ca Python; I-2 2 test integration; I-3 5 test unit); integration
  `ai-assist` 85/85; unit `ai-assist` 212/212; pytest AI-dev 232/232; số đột biến ở spec `## Test matrix`

### Task 6: tài liệu hạng mục và roadmap

- Files: `docs/workspace/items/ai-assist-queue-summary-be/spec.md`, `plan.md`, `docs/workspace/items/README.md`,
  `docs/roadmap.md` (G10), `src/modules/ai-assist/README.md`, `test/support/api-collection-registry-nested.ts`,
  `test/support/api-collection-registry-events.ts` (chủ của mục `aiAccessRequestSummaryGet#lines` đổi từ thư mục tạm
  `api-list-detail-contract-remediation` sang hạng mục này)
- Depends on: Task 7
- Acceptance: spec/plan theo mẫu và sizing; scope map G10 có `US-15-05` với từng AC; số `Active` khớp bảng
- Verify: `pnpm rules:check` → 0 lỗi; `pnpm rules:format` → sạch; gate `api-collection-contract` xanh

### Checkpoint

Sau mỗi task: review riêng của task (đọc `git diff` của cây làm việc), gate liên quan chạy xanh trước task sau.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                         | Revision / môi trường                                         | Kết quả thực chạy                                                                                                         | Giới hạn / việc còn lại                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec jest --config ./test/config/jest.integration.cjs test/integration/ai-assist`                                    | cây chưa commit trên `6e7bb09`, Windows, Docker `slm-test-db` | 85/85 đạt, 7 suite (fix pass; Task 7: 80/80, fix round 84/84)                                                             | AC-10 không có test (`not affected`); AC-4 theo cấu trúc; AC-13 chưa kiểm `US-11-07`, `US-13-06` (chưa có trong BE); AC-14 dạng điều chỉnh |
| `pnpm check`                                                                                                               | như trên                                                      | dừng ở `pnpm test`: 6 suite đỏ, đều là bản sao `.claude/worktrees/*`; cây thật 355 suite, 0 đỏ; các bước trước đó xanh    | chạy lại sau khi dọn `.claude/worktrees`                                                                                                   |
| `pnpm test:gates`                                                                                                          | như trên                                                      | 16 suite, 330/330 (Task 7)                                                                                                | —                                                                                                                                          |
| `pnpm test:http`                                                                                                           | như trên                                                      | 1564/1566; 2 đỏ là `openapi-export` spawn trên Node 24                                                                    | chạy lại trên Node 22                                                                                                                      |
| `pnpm test:e2e`                                                                                                            | như trên                                                      | 11 suite, 51/51                                                                                                           | —                                                                                                                                          |
| `pnpm test:integration` (toàn bộ, một lần)                                                                                 | như trên                                                      | 3828 đạt, 149 đỏ do tải (lỗi DB thoáng qua, hook quá hạn); chạy lại 17 file đỏ: 16 đạt, 1 đỏ                              | `super-admin-event-cli` "refused successor" đỏ cả trên `6e7bb09` sạch (lỗi có sẵn); chưa có một lần xanh trọn                              |
| `pnpm test:integration:serial`                                                                                             | như trên                                                      | 11 suite, 92/92                                                                                                           | —                                                                                                                                          |
| Drift migration (`prisma migrate deploy` + `migrate diff --exit-code` trên DB tạm)                                         | như trên                                                      | 141 migration, không khác biệt                                                                                            | —                                                                                                                                          |
| Sinh lại `openapi.json`                                                                                                    | như trên, Node 24 với cờ ở `## Before coding`                 | trùng byte với cây làm việc (316 operation)                                                                               | `pnpm openapi:export` trên Node 24 đỏ (môi trường)                                                                                         |
| Smoke với dịch vụ AI thật `AI_RUNNER=stub`                                                                                 | `AI-dev/.venv`, spec tạm (đã xóa)                             | hai tóm tắt `COMPLETED`, dòng chi phí `21000000 VND` do BE chèn; contract khớp hai chiều                                  | chưa smoke qua BE dev với tài khoản demo và model thật; chưa đo tài nguyên                                                                 |
| `pnpm rules:check`, `pnpm rules:format`, gate `api-collection-contract` (Task 6)                                           | như trên + tài liệu Task 6                                    | `rules:check` 422 file, 0 lỗi; `rules:format` sạch (sau `prettier --write` 4 file); gate 34/34; `pnpm test:gates` 330/330 | —                                                                                                                                          |
| Fix pass: `pnpm exec jest src/modules/ai-assist`; `test/http/ai-assist`; `tsc --noEmit`; eslint, prettier trên file đã sửa | như trên                                                      | 212/212; 56/56; sạch; sạch                                                                                                | —                                                                                                                                          |
| Fix pass, AI-dev: `pytest`, `ruff check`, `ruff format --check`; eval bộ dữ liệu đóng băng với `FakeRunner`                | `AI-dev/.venv`, không cần máy chủ llama                       | 232 đạt; sạch; queue/finance `perfect` 1.0/1.0/1.0 trước và sau, runner chép lý do không đổi số liệu                      | eval với model thật chưa chạy lại                                                                                                          |
| Fix pass: so sánh vi sai bộ kiểm TS/Python (kịch bản tạm, không nằm trong repo)                                            | ts-node `--transpile-only`, `AI-dev/.venv`                    | 0 khác biệt trên 2 × 6 080 ca (gồm mọi ca thăm dò của review)                                                             | không phải test thường trực                                                                                                                |
| Fix pass: bẻ có chủ đích 8 lần, mỗi lần chạy cả thư mục integration `ai-assist`                                            | như trên                                                      | xem spec `## Test matrix`; mọi file khôi phục, checksum khớp                                                              | —                                                                                                                                          |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan phản ánh đúng implementation; không có peer review.
- [ ] Diff cuối đã tự review; runbook xóa sớm nội dung AI trong bản sao lưu chưa viết; log không chứa prompt/response chỉ
      kiểm ở mức unit.
- [ ] Giao Owner review trên revision cụ thể (chưa commit); các quyết định ở spec `## Quyết định chờ người dùng và Owner`
      chưa được xác nhận.

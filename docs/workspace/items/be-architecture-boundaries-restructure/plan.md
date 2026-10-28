# Plan: tái cấu trúc ranh giới modular monolith cho người đọc

- [Spec](spec.md); revision đầu vào: Docs `578f442`, BE `c49a7dd`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo yêu cầu Owner (28/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. Mọi phase chặn tới khi script bootstrap (phiên khác) được commit; Phase 2 trở đi
  chặn thêm bởi `be-test-architecture-redesign` (Phase T1–T3).

## Before coding

Owner đã chốt `OD-A1` → `OD-A6` ngày 28/10/2026 (cả sáu theo đề xuất của spec; `OD-A1` đổi cùng ngày: dừng giao tính năng
tới khi refactor xong). Owner chốt `OD-A7`, `OD-A8` (Phase 1b) theo đề xuất cùng ngày. Đọc `docs/rules/module-structure.md`, ADR-0001/0003/0013/0015–0018 và
module card mẫu. Mỗi phase bắt đầu từ `dev` sạch; `git status` không còn thay đổi của phiên bootstrap.

## Tasks

### Phase 0 — đo và công cụ (không đổi code nghiệp vụ)

### Task 0.1: công cụ phụ thuộc và sơ đồ

- Files: `package.json`, `.dependency-cruiser.cjs`, `scripts/arch/graph.mjs`, `docs/generated/module-graph.svg`.
- Depends on: `OD-A3`.
- Acceptance: `pnpm arch:check` chạy ở chế độ báo cáo (chưa chặn), liệt kê vi phạm hiện tại theo rule tầng/cửa công khai;
  `pnpm arch:graph` sinh sơ đồ module.
- Verify: `pnpm arch:check` → báo cáo khớp số liệu audit (1 cặp hai chiều, cạnh vượt tầng = 0); `pnpm check` xanh.

### Task 0.2: bản đồ route → file

- Files: `scripts/arch/routes.mjs`, `docs/generated/routes.md`.
- Depends on: none.
- Acceptance: mỗi operation OpenAPI có một dòng `METHOD path → controller → service`.
- Verify: số dòng = số operation trong `openapi.json` (296 lúc audit).

### Checkpoint

`pnpm check` xanh; chưa file nào trong `src/modules` đổi.

### Phase 1 — quy ước và cơ chế dùng chung

### Task 1.1: rule mới và tài liệu ngắn

- Files: `docs/rules/module-structure.md`, `ARCHITECTURE.md`, `AGENTS.md`, `docs/decisions/0019-module-tiers-and-public-api.md`.
- Depends on: `OD-A2`, `OD-A4`, `OD-A6`.
- Acceptance: rule mô tả tầng, layout, từ vựng 14 hậu tố, giới hạn ESLint; ARCHITECTURE ≤ 250 dòng, AGENTS ≤ 80 dòng.
- Verify: `pnpm rules:check`, `pnpm rules:format` xanh; đếm dòng.

### Task 1.2: `Hook` và `Listeners` trong core

- Files: `src/core/extension/hook.ts`, `src/core/extension/listeners.ts`, spec tương ứng.
- Depends on: Task 1.1.
- Acceptance: bind hai lần ném lỗi; `get()` khi chưa bind ném lỗi có tên; listener chạy tuần tự trong `tx` truyền vào.
- Verify: `pnpm test -- src/core/extension` xanh.

### Task 1.3: ESLint độ phức tạp ở chế độ cảnh báo

- Files: `eslint.config.mjs`.
- Depends on: Task 1.1.
- Acceptance: rule `max-lines`, `max-lines-per-function`, `complexity`, `max-params`, `max-depth` bật mức `warn`; báo cáo số
  vi phạm hiện tại lưu vào plan này.
- Verify: `pnpm lint` xanh (chỉ warning).

### Checkpoint

Rule mới được Owner duyệt; gate vẫn ở chế độ báo cáo.

### Phase 1b — gốc `src/` (D11)

### Task 1b.1: tách ghép API và worker

- Files: `src/app.module.ts`, `src/bootstrap.ts` (+ spec) → `src/app/`; `src/worker.module.ts`, `src/*.loop.ts` (+ spec) →
  `src/worker/` (`*.job.ts`); `main.ts`, `worker.ts`, `scripts/dev/export-openapi.ts`, import ở `test/**`.
- Depends on: Phase 1, script bootstrap đã commit.
- Acceptance: `main.ts`, `worker.ts` vẫn ở gốc; `dist/main.js`, `dist/worker.js` không đổi; chỉ di chuyển/đổi tên.
- Verify: `pnpm build` → có `dist/main.js`, `dist/worker.js`; `pnpm openapi:export` không diff; `pnpm check` xanh.

### Task 1b.2: một điểm vào CLI, khung chung và alias

- Files: `src/cli.ts`, `src/cli/commands.ts`, `src/cli/run-command.ts`, `src/cli/<lệnh>/**` (9 lệnh, từ `src/*-cli*.ts` và
  `*.arguments.ts`/CLI module trong `src/modules/*`), `src/infrastructure/cli/` (gộp vào `run-command.ts`),
  `scripts/build/emit-cli-aliases.mjs`, script `build` trong `package.json`.
- Depends on: Task 1b.1, `OD-A7`.
- Acceptance: `node dist/cli.js <lệnh>` và mọi `node dist/<tên>-cli.js` cũ cho cùng output, cùng exit code; `pnpm ops:*` giữ
  tên; `Dockerfile`, compose, `scripts/ops/*.sh` không sửa.
- Verify: test CLI hiện có (integration `cli-process`) xanh không sửa assertion; `pnpm test:scripts` xanh; so `--help` của 9 lệnh
  trước/sau giống byte.

### Task 1b.3: gate tĩnh sang `test/gates/`

- Files: 10 `src/*.spec.ts` gate → `test/gates/*.gate-spec.ts`, `test/config/jest.gates.cjs`, `scripts/verify/runners.mjs`,
  `package.json` (`test:gates`, `check`).
- Depends on: Task 1b.2, `OD-A8`.
- Acceptance: `pnpm test` chỉ còn unit; `pnpm test:gates` chạy đủ 10 gate, nằm trong `pnpm check`; số test gate không đổi.
- Verify: chèn thử một vi phạm cho mỗi gate → đỏ; `pnpm test:discovery` xanh.

### Task 1b.4: `src/README.md`

- Files: `src/README.md`, link từ `README.md`, `ARCHITECTURE.md`.
- Depends on: Task 1b.3.
- Acceptance: ≤ 60 dòng; ba tiến trình, file bắt đầu, cách tìm code của route và của lệnh, test ở đâu.
- Verify: `pnpm rules:check`, `pnpm rules:format` xanh; một dev chưa đọc code làm theo README tìm được file của 3 route và 2
  lệnh.

### Checkpoint

Gốc `src/` theo cây đích của spec; `pnpm check` xanh; image mới chạy được `scripts/ops/deploy-release.sh` không sửa.

### Phase 2 — module lá và cặp hai chiều (chặn bởi test redesign T1–T3)

### Task 2.1: audit, notifications, finance, operating-parameters

- Files: `src/modules/{audit,notifications,finance,operating-parameters}/**`, import ở module dùng chúng.
- Depends on: Phase 1, `be-test-architecture-redesign` Phase T3.
- Acceptance: layout mới, `public/`, module card; chỉ di chuyển/đổi tên.
- Verify: `pnpm check`; `pnpm test:integration` phần module; `pnpm openapi:export` không diff; số test không giảm.

### Task 2.2: organization + identity-access, gỡ vòng D5

- Files: `src/modules/{organization,identity-access}/**`.
- Depends on: Task 2.1.
- Acceptance: `organization` không import `identity-access`; bốn chỗ dùng chuyển sang `Hook` do `organization` khai báo.
- Verify: `pnpm arch:check` không còn cặp hai chiều; integration của department/head/account xanh.

### Checkpoint

Bật `arch:check` ở chế độ chặn cho các module đã chuyển.

### Phase 3 — tài sản, quy trình, vòng đời

### Task 3.1: catalog, licensing (thay `Registered*` của licensing)

- Files: `src/modules/{catalog,licensing}/**`, nơi đăng ký ở `requests`, `personnel`, `data-import`.
- Depends on: Phase 2.
- Acceptance: không còn `RegisteredGrantRequestGate`, `RefusingGrantRequestGate`, `RegisteredRevocationHook`…; dùng `Hook`/`Listeners`.
- Verify: như Task 2.1; test khởi động thiếu bind đỏ.

### Task 3.2: budgets, data-import

- Files: `src/modules/{budgets,data-import}/**`.
- Depends on: Task 3.1.
- Acceptance: layout mới, module card.
- Verify: như Task 2.1.

### Task 3.3: personnel, onboarding, installation

- Files: `src/modules/{personnel,onboarding,installation}/**`.
- Depends on: Task 3.2.
- Acceptance: layout mới; listener đăng ký vào `requests` qua `Listeners`.
- Verify: như Task 2.1.

### Checkpoint

Mọi module trừ `requests` ở layout mới; ESLint complexity chuyển `error` cho các module này.

### Phase 4 — requests theo từng capability

### Task 4.1: access-request thành use case folder

- Files: `src/modules/requests/access-request/**`, `src/modules/requests/public/**`.
- Depends on: Phase 3.
- Acceptance: không thư mục > 25 file; facade tách `RequestsApi`.
- Verify: như Task 2.1.

### Task 4.2: spend, group-request và các capability còn lại

- Files: `src/modules/requests/**`.
- Depends on: Task 4.1.
- Acceptance: như Task 4.1; `SpendApi` trong `public/`; đo lại cạnh `spend ↔ access-request` cho `OD-A5`.
- Verify: như Task 2.1.

### Phase 5 — dọn gate cũ

### Task 5.1: bỏ spec gate cấu trúc tự viết

- Files: `src/architecture-structure.spec.ts`, `src/architecture-boundaries.spec.ts`, `src/module-graph.spec.ts`,
  `rules-check.config.json`.
- Depends on: Phase 4.
- Acceptance: mọi rule cũ có tương đương trong dependency-cruiser/ESLint (bảng đối chiếu trong PR); spec gate cấu trúc ≤ 1 500 dòng.
- Verify: chèn thử một vi phạm mỗi rule → gate đỏ; gỡ → xanh.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] Mọi điều trong `## Definition of Done` của spec có bằng chứng.
- [ ] Spec/plan cập nhật theo implementation cuối; Owner duyệt bước "10 route ngẫu nhiên".

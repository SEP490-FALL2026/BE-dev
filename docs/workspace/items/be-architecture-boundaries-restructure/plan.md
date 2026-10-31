# Plan: tái cấu trúc ranh giới modular monolith cho người đọc

- [Spec](spec.md); revision đầu vào: Docs `578f442`, BE `c49a7dd`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo yêu cầu Owner (28/10/2026).
- Owner review: một phần — 29/10/2026 Owner chấp nhận S5 (capability trong cùng module import nhau), S12 (`COPY
scripts/build` ở stage build), S13 (ba văn bản OpenAPI) và devDependency `jest-environment-node`
  ([nghiệm thu](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md), _Quyết định Owner_). ADR-0019:
  `Proposed, chấp nhận một phần`. Chưa review: quy tắc nhóm chức năng (mục _Cấu trúc bên trong capability_). Peer review:
  tùy chọn.
- Triển khai: `in-progress` — làm local 29/10/2026 trên BE `dee61eb` (script bootstrap đã commit), chưa commit, chưa có PR.
  Owner cho chạy test và dùng subagent ngày 29/10/2026. Checkpoint 29/10/2026: `local-ready-for-owner-review` /
  `remote-verification-pending`. Kết quả và sai khác so với spec: mục _Kết quả triển khai_.

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

- Files: `src/app/app.module.ts`, `src/app/configure-application.ts` (+ spec) → `src/app/`; `src/worker/worker.module.ts`, `src/*.loop.ts` (+ spec) →
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

- Files: `test/gates/architecture-structure.gate-spec.ts`, `test/gates/architecture-boundaries.gate-spec.ts`, `test/gates/module-graph.gate-spec.ts`,
  `rules-check.config.json`.
- Depends on: Phase 4.
- Acceptance: mọi rule cũ có tương đương trong dependency-cruiser/ESLint (bảng đối chiếu trong PR); spec gate cấu trúc ≤ 1 500 dòng.
- Verify: chèn thử một vi phạm mỗi rule → gate đỏ; gỡ → xanh.

## Kết quả triển khai (29/10/2026)

Các phase không chạy tuần tự như trên: Owner bỏ ràng buộc "Phase 2 sau T1–T3" bằng cách cho làm hết trong một đợt, nên
lưới an toàn là chạy lại toàn bộ test sau khi chuyển (bảng Verification).

| Task     | Trạng thái                   | Ghi chú / sai khác so với spec                                                                                                                                                                                                                                                                                                                                                                            |
| -------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1      | xong                         | `.dependency-cruiser.cjs` + `scripts/arch/tiers.cjs`; sơ đồ là Mermaid `docs/generated/module-graph.md` (không cần Graphviz) thay cho SVG; `pnpm arch:graph`, `--check` trong `pnpm check`                                                                                                                                                                                                                |
| 0.2      | xong                         | `pnpm arch:routes` → `docs/generated/routes.md`, 287/287 operation có controller → handler → service                                                                                                                                                                                                                                                                                                      |
| 1.1      | xong                         | `docs/rules/module-structure.md` viết lại; ADR-0019 (Proposed); `ARCHITECTURE.md` 118 dòng, `AGENTS.md` 69 dòng (prose ≤ 120 ký tự); chi tiết runtime cũ chuyển sang `docs/guides/runtime-details.md`                                                                                                                                                                                                     |
| 1.2      | xong                         | `Hook` là provider Nest (một instance mỗi app — hằng số cấp module làm app thứ hai trong cùng tiến trình test ném "already bound"); thêm `whenUnbound` khai tại chỗ và kiểu thứ ba `Contributions<T>` cho điểm trả về giá trị                                                                                                                                                                             |
| 1.3      | xong, mức `warn` + trần tổng | 272 cảnh báo: sửa 21 (`src/cli`, `src/infrastructure`, `src/core`, hai policy data-import), miễn có lý do 22 (`*.http-errors.ts`), giữ 229 với `--max-warnings 229` — chỉ chặn **tổng** số cảnh báo vượt 229, không chặn từng hàm; "PR chạm hàm vượt ngưỡng làm nó nhỏ lại" là quy ước review; danh sách ưu tiên ở [nghiệm thu §4](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md) |
| 1b.1     | xong                         | `app/app.module.ts`, `app/configure-application.ts` (giữ một file 74 dòng thay vì tách hai), `worker/*.job.ts`                                                                                                                                                                                                                                                                                            |
| 1b.2     | xong                         | `src/cli.ts`, `cli/commands.ts`, `cli/run-command.ts`, 9 `cli/<lệnh>/`; alias sinh lúc build; 30 ca × stdout/stderr/exit qua alias và `cli.js`: 180/180 giống byte. **Sai khác:** `Dockerfile` thêm `COPY scripts/build` cho bước build (đường chạy không đổi)                                                                                                                                            |
| 1b.3     | xong                         | 10 gate → `test/gates/*.gate-spec.ts`, `pnpm test:gates` trong `pnpm check`                                                                                                                                                                                                                                                                                                                               |
| 1b.4     | xong                         | `src/README.md`                                                                                                                                                                                                                                                                                                                                                                                           |
| 2.1–4.2  | xong trong một đợt           | bảng ánh xạ 1 101 file do subagent lập theo quy tắc chung, áp bằng codemod (import, `import()`, chuỗi đường dẫn, link Markdown); 475 file đổi chỗ; 28 facade `XService` → `XApi`; `requests`: 13 thư mục use case bị capability khác dùng được nâng thành capability (`requests` có 23 capability, mỗi thư mục ≤ 25 file)                                                                                 |
| 2.2 (D5) | xong                         | `EmployeeAccountsHook` do `organization` mở, `identity-access` bind; `organization` không còn import `identity-access`                                                                                                                                                                                                                                                                                    |
| 3.1      | xong                         | ~20 lớp `Registered*`/`Refusing*`/registry → 19 điểm `Hook`/`Listeners`/`Contributions`; không điểm nào cần `whenUnbound`; thứ tự listener giữ nguyên, ghim bằng test                                                                                                                                                                                                                                     |
| 5.1      | xong                         | `architecture-structure` (1 321 dòng) xóa, thay bằng `module-layout.gate-spec.ts` (23 test, gồm H8-RV-01 khôi phục) + `parallel-safety.gate-spec.ts` (7 test); `architecture-boundaries` 842 → 559 dòng; đối chiếu rule cũ → mới ở [nghiệm thu §2](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md)                                                                                 |

Quyết định thiết kế thêm trong lúc làm (ghi ở ADR-0019, rule module structure): file hiện thực điểm mở của module khác dùng
hậu tố `.listener.ts`; `*.module.ts` cũng là cửa hợp lệ; spec unit được nhìn vào trong module khác; capability trong cùng
module được import nhau; `*.extension-points.ts` được khai nhiều provider. Quy tắc "chỉ thư mục use case là riêng tư" được
thay bằng quy tắc nhóm chức năng (mục dưới).

Sửa kèm (lỗi có sẵn, phát hiện khi bật lại test HTTP — không thuộc refactor): summary OpenAPI 73 ký tự và hai message lỗi
quá 160 ký tự (`EMPLOYEE.SELF_CHANGE_FORBIDDEN` vẫn nêu lệnh vận hành theo F11; mã lỗi không đổi) → `openapi.json` đổi 5 dòng.

## Cấu trúc bên trong capability (29/10/2026)

Mục tiêu Owner: mở một capability là thấy các nhóm chức năng, không phải một danh sách file dài. Khảo sát 79 capability
(số file, service, route, thư mục con); sửa nơi một service gánh nhiều use case hoặc hai chức năng không liên quan chung
một thư mục. Chỉ dời file, tách service theo nhóm và sửa import: không đổi API/DTO, `operationId`, status, mã lỗi, quyền,
transaction, thứ tự khóa, idempotency, dữ liệu ghi, audit, thông báo, Prisma, migration hay đường chạy API/worker/CLI.

| Capability                    | Trước                                                                                                                                                                                                                            | Sau                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-import/employee-import` | 24 file một cấp. `EmployeeImportService` 397 dòng gánh upload, xem, liệt kê dòng, làm mới, hủy, xác nhận và đọc cho onboarding; `employee-import-rows.policy.ts` 411 dòng trộn hình dạng dòng (repo, lỗi cần) với luật chấm dòng | Cấp capability 12 file: controller (điểm vào HTTP, điều phối sang hai nhóm), dto, lỗi, http-errors, `employee-import.policy.ts` (chỉ Super Admin), repo, `employee-import.types.ts`, `employee-import-row.types.ts` (cột, ô, kết quả một dòng), hai mapper. `row-validation/` 6: luật thuần + `EmployeeImportRowValidationService` (tra cứu tổ chức, hồ sơ của chính người nhập, phòng chưa có trưởng — trước là hàm riêng của service lớn và `employee-import-own-record.ts`) + 4 spec. `preview/` 6: `EmployeeImportPreviewService` 193 dòng, đọc file, hàng đợi rà soát + 3 spec. `confirmation/` 2: `EmployeeImportConfirmationService` 214 dòng + spec |
| `requests/status`             | 23 file: chiếu audit event thành thông báo (17) và thời gian từng bước (6) — hai chức năng không dùng chung file nào, ghép ở hai Nest module khác nhau (`requests-work-facade.module.ts`, `requests.module.ts`)                  | `requests/status/` 6 file (projector, facts, recipients, hai repo, types) + `rules/` 11 (điểm vào `request-status-rules.policy.ts`, đổi tên từ `request-status.policy.ts`; 7 file bảng luật và 3 spec là phần riêng của nhóm). `requests/timing/` 6 file: capability riêng (controller, dto, policy + spec, repo, service), không đổi nội dung                                                                                                                                                                                                                                                                                                              |

Giữ nguyên, có lý do:

| Capability                                                                                                                                                                 | Lý do                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-import/seat-baseline-import` (13)                                                                                                                                    | Cùng mẫu upload → preview → xác nhận nhưng một service 352 dòng gắn kết và mỗi vai một file; chia nhóm chỉ thêm thư mục 1–2 file, danh sách không ngắn đi                                         |
| `organization/department` (24)                                                                                                                                             | Tên file đã nói chức năng (`department-head.*`, `department-use.*`, `department-query`, `department-directory`); repo trưởng phòng dùng chung với directory, tách cụm trưởng phòng chỉ dời 4 file |
| `requests/access-request` (25), `requests/spend` (24)                                                                                                                      | Lõi chung của các capability khác của `requests`; file đặt theo chức năng (`budget-check`, `spend-routing`, `spend-decision`…) và dùng chéo repo — tách chỉ đổi chỗ (nghiệm thu §7)               |
| `catalog/subscription` (22), `identity-access/auth` (20), `personnel/transfer-review` (21)                                                                                 | Nhiều service, mỗi service một use case đặt tên theo chức năng; không có service nhiều trách nhiệm                                                                                                |
| `requests/group-request`, `personnel/offboarding`, `identity-access/accounts`, `licensing/provisioning`, `licensing/assignment`, `budgets/budget`, `catalog/catalog-entry` | Đã có nhóm con từ đợt trước; phần còn lại ở cấp capability là lõi chung                                                                                                                           |
| 60 capability còn lại (≤ 17 file)                                                                                                                                          | Danh sách ngắn, mỗi vai một file                                                                                                                                                                  |

**Quy tắc và gate.** Quy tắc cũ "thư mục use case chỉ được Nest module và facade `public/` import" chặn controller của
capability điều phối sang nhóm và chặn hai nhóm dùng chung phần chấm dòng. Thay bằng quy tắc nhóm chức năng: mỗi nhóm có
điểm vào là file `<…>-<nhóm>.service.ts`, `.policy.ts` hoặc `.types.ts`; trong capability mọi file và nhóm anh em chỉ gọi
điểm vào; phần còn lại của nhóm riêng tư; ngoài capability chỉ Nest module và `public/` thấy nhóm; `no-circular` giữ nguyên.
dependency-cruiser: `use-case-is-private`, `use-case-not-sibling` → `group-is-private`, `group-entry-from-capability`,
`group-entry-from-sibling` (chỉ nới phần điểm vào; mọi import trước đây bị chặn vẫn bị chặn trừ import vào điểm vào). Đã
sửa đồng bộ: `docs/rules/module-structure.md`, ADR-0019 mục 3, `AGENTS.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md` (bỏ câu
nhắc gate `architecture-structure` + ledger đã xóa), chú thích gate `module-layout`. Module card: `data-import`,
`requests`. Tham chiếu đường dẫn: registry `policy-ownership`, nguồn `reviewQueue` trong `api-collection-contract`,
chú thích `organization/public/employee-placement.policy.ts`; `docs/generated/routes.md`, `module-graph.md` sinh lại.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                  | Revision / môi trường                                                                            | Kết quả thực chạy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Giới hạn / việc còn lại                                                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm check`                                                                        | cây làm việc trên `dee61eb`, Windows 11, 16 nhân, PostgreSQL 17 docker (`fsync=off`), 29/10/2026 | exit 0 (486 s): rules 0 lỗi (317 file), lint 0 lỗi / 229 cảnh báo (trần tổng `--max-warnings 229`), unit 3 683/3 683, gate 205/205, `arch:check` 0 vi phạm (1 287 module), `arch:docs:check`, script 213/213, discovery, build + 9 alias. Sau đó chỉ đổi file test/tài liệu: chạy lại gate, script, rules, format, lint, typecheck, discovery                                                                                                                                                                                                      | —                                                                                      |
| `pnpm arch:check`                                                                   | như trên                                                                                         | 0 vi phạm; trước refactor 772 (712 cửa `public/`, 51 composition root, 7 D5, 2 vòng)                                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                      |
| `pnpm openapi:export` + `git diff openapi.json`                                     | như trên                                                                                         | Chỉ 5 dòng: 3 văn bản sửa có chủ đích (summary 73 ký tự, 2 message > 160 ký tự)                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Hợp đồng HTTP khác giữ nguyên byte                                                     |
| CLI: 30 ca × stdout/stderr/exit, qua `dist/<tên>-cli.js` và `dist/cli.js`           | như trên, sau `pnpm build`                                                                       | 180/180 giống byte so với trước refactor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Chưa chạy `deploy-release.sh` trên VPS với image mới                                   |
| `pnpm test:http`                                                                    | như trên                                                                                         | 46 file, 1 240/1 240 (gồm `extension-points.http-spec.ts`: mọi `Hook` đã bind, tên điểm không trùng)                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                      |
| `pnpm test:integration` (6 worker, `TEST_CLI_RUNTIME=dist`) + `:timing` + `:serial` | như trên                                                                                         | Ba lượt liên tiếp trên cây cuối: 3 375/3 379 + 28/28 + 59/59 mỗi lượt, 4 skip (object storage thật), database không rò; 1 đỏ có sẵn ở mốc `dee61eb` (`final-release-upgrade`, lỗi thời so với F91) đã sửa ([nghiệm thu §5](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md))                                                                                                                                                                                                                                                 | —                                                                                      |
| Gate test: 229 → 205                                                                | như trên                                                                                         | `architecture-structure` 47 xóa → `module-layout` 23 + dependency-cruiser; `architecture-boundaries` 27 → 15 (cửa import sang dependency-cruiser); `policy-ownership` 8 → 7; `operational-commands` 11 → 15; `parallel-safety` mới 9                                                                                                                                                                                                                                                                                                               | —                                                                                      |
| Cấu trúc bên trong capability: giữ hành vi                                          | cây làm việc trên `dee61eb`, lượt checkpoint 29/10/2026                                          | So AST thân method của `EmployeeImportService` (HEAD) với ba service mới: mọi method giống sau khi chuẩn hóa tên hàm đã chuyển (`evaluate`→`judge`, `withoutHead`→`departmentsWithoutHead`, `readOwnRecord`→`ownRecord`); `confirm` khác một dấu phẩy cuối mảng do prettier, sau đó lấy hồ sơ người nhập vào biến trước lời gọi để hàm ≤ 60 dòng (cùng thứ tự gọi). File `status/rules/`, `timing/` chỉ đổi chỗ và đường dẫn import. Spec harness của import (thứ tự gọi cộng tác viên, transaction, audit) không đổi assertion: 14 suite, 283/283 | —                                                                                      |
| Luật nhóm chức năng (dependency-cruiser)                                            | như trên                                                                                         | Cây thật 0 vi phạm. Probe tạm (đã xóa): import file riêng của nhóm từ capability, từ nhóm anh em và từ capability khác → đúng 3 lỗi `group-entry-from-capability`, `group-entry-from-sibling`, `group-is-private`; import vào điểm vào của nhóm qua                                                                                                                                                                                                                                                                                                | —                                                                                      |
| `pnpm check`                                                                        | như trên                                                                                         | exit 0 (1 009 s): rules 0 lỗi (317 file, 2 656 link), lint 0 lỗi / 229 cảnh báo, typecheck, unit 251 suite 3 683/3 683, gate 205/205, `arch:check` 0 vi phạm (1 289 module), `arch:docs:check`, script 213 đạt / 2 skip theo nền tảng Windows, discovery, build + 9 alias. Lượt đầu đỏ ở `rules:check` (link của spec H8 tới spec đã đổi tên) và lượt hai đỏ ở lint (230 > 229: `confirm` 63 dòng sau prettier) — đã sửa, chạy lại đủ                                                                                                              | —                                                                                      |
| `pnpm test:http`                                                                    | như trên                                                                                         | 46 file, 1 240/1 240 (gồm `openapi-export` so đúng byte và `security-upgrade-regression` override `EmployeeImportPreviewService`)                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                      |
| Integration bị ảnh hưởng (runner mới, PostgreSQL 17 tạm, `TEST_CLI_RUNTIME=dist`)   | như trên                                                                                         | 16 file, 241/241: `test/integration/data-import/` (4), `audit/request-status-projection`, `requests/` (`request-status-notifications`, `request-timings`, `request-finance-notices`, `group-request-edge`, `finance-setup-gate`, `spend-awaiting-budget`, `spend-budget-year-lock`), `notifications/` (2), `licensing/final-vocabulary-compatibility`, `onboarding/onboarding-http`. E2E `paid-request-to-seat` 6/6                                                                                                                                | Không chạy lại integration đầy đủ (ba lượt P4 đã có); bộ đầy đủ chạy trên CI của Owner |
| Hợp đồng, schema, tài nguyên                                                        | như trên                                                                                         | `pnpm openapi:export`: `openapi.json` giống từng byte bản đầu lượt; `prisma/` 139 file cùng hash; không còn database `slm_*`, container tạm và probe đã gỡ; `routes.md` chỉ đổi tên service/đường dẫn file, `module-graph.md` chỉ đổi số cạnh cấp file (`data_import → audit` 5→6, `→ organization` 8→9)                                                                                                                                                                                                                                           | —                                                                                      |

- [ ] Mọi điều trong `## Definition of Done` của spec có bằng chứng.
- [ ] Spec/plan cập nhật theo implementation cuối; Owner duyệt bước "10 route ngẫu nhiên".

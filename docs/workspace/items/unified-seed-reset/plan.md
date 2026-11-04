# Plan: unified-seed-reset

- [Spec](spec.md); revision đầu vào: Docs `0125072` + `QĐ-95`, BE `d7b8fe8d` + `qd95-one-role-per-account` đã merge.
- Phụ trách: chưa giao. Thiết kế ban đầu bởi: AI theo giao việc của Owner (04/11/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc `docs/rules/operational-commands.md` (+ gate), `docs/rules/{module-structure,database-business,security-jobs}.md`,
`docs/decisions/0019-module-tiers-and-public-api.md` (R1, dòng 50), `docs/guides/{demo-dataset,bootstrap-installation,containers}.md`,
`src/cli/demo-dataset/**`, `src/cli/bootstrap/**`, `src/cli/dev-seed/**`, `src/cli/commands.ts`, `src/cli/run-command.ts`,
`scripts/build/emit-cli-aliases.mjs`, `src/modules/installation/**`, `scripts/ops/{demo-dataset.sh,bootstrap-installation.sh,deploy-release.sh,postgres-backup-retention.sh}`,
`scripts/verify/{demo-dataset,bootstrap-installation,deploy-release,backup-retention}*.test.mjs` (mẫu test wrapper bằng docker giả),
`docker-compose.prod.yml`, `test/integration/installation/*`, mục _Owner decisions_ của spec. Không chạy `prisma migrate reset` thật
(Prisma chặn agent AI; lượt thật do Owner).

- Quick set = `pnpm typecheck && pnpm lint && pnpm test && pnpm arch:check && pnpm rules:check && pnpm test:gates && pnpm test:scripts`.
- Integration theo file: `pnpm test:integration -- <file…>`; role cluster: `pnpm test:integration:serial` (database theo
  `test/README.md`).
- Mỗi task để gate, typecheck và `rules:check` xanh: đổi gate, đường dẫn và link trong **cùng** task với file mà chúng nhắc tới.

## Tasks

### Phase A — một lệnh `seed`, giữ hành vi

### Task 1: đổi `demo-dataset` thành `seed`; xóa wrapper cũ; ghi ngoại lệ `OD-A7`

- Files:
  - Di chuyển: `git mv src/cli/demo-dataset src/cli/seed` (mọi `demo-dataset*.ts` → `seed*.ts`, gồm `seed.command.ts`,
    `seed.arguments.ts` — gate rule 2 `operational-commands.gate-spec.ts:166-177` đòi đúng tên), fixture v2 chia vào
    `src/cli/seed/fixture/shared-demo-v2/{organization,catalog,finance,requests,extras,index}.ts` + `README.md` (khung) — dữ liệu
    giữ nguyên; `git mv src/modules/installation/demo-dataset src/modules/installation/seed`, `seed-cli.module.ts` (`SeedCliModule`).
  - Bảng lệnh/script: `src/cli/commands.ts` (dòng `seed`, alias `seed-cli`), `package.json` (`ops:seed`; bỏ `ops:demo-dataset`),
    khóa apply `seed:<fixture>:apply`.
  - Gate/test: `operational-commands.gate-spec.ts` (`COMMAND_FOLDERS` dòng 26 → `modules/installation/seed`, `COMMAND_ONLY_FILES`
    dòng 42, `ALIAS_CALLERS` dòng 55-66 bỏ hai script cũ), `module-graph.gate-spec.ts:29`, `extension-wiring.gate-spec.ts:55,111,160`
    (đổi tên graph, giữ số mục), `test/support/process-graphs.ts:7`, `test/integration/installation/demo-dataset*.integration-spec.ts`
    → `seed*.integration-spec.ts` (import mới), spec unit trong `src/cli/seed`.
  - Xóa: `scripts/ops/demo-dataset.sh`, `scripts/ops/demo-dataset-local.mjs`, `scripts/verify/demo-dataset*.test.mjs`,
    `.env.demo-dataset.example`, `.env.demo-dataset-local.example` (+ dòng `.gitignore:54-55`).
  - Tài liệu tối thiểu để link và gate xanh: `docs/guides/seed.md` (khung: lệnh `seed`, wrapper "Task 6/7"), thêm vào
    `rules-check.config.json` và `rules:format`; `docs/guides/demo-dataset.md` thành trang ngắn trỏ sang `seed.md` (không còn
    `dist/demo-dataset-cli.js`); `docs/rules/operational-commands.md` (câu `OD-A7` dòng 8-11: ngoại lệ có lý do của `OD-S3`; dòng
    40 bảng lệnh; link ở dòng 92-93), `docs/decisions/0019-module-tiers-and-public-api.md` (ghi chú cạnh dòng 50),
    `scripts/README.md:21-27`, `docs/README.md:24`, `src/modules/installation/README.md`.
- Depends on: `qd95-one-role-per-account` merge.
- Acceptance: `seed plan|apply` hành vi như `demo-dataset` trước đó trên `shared-demo-v2`; `node dist/cli.js demo-dataset` báo lệnh
  lạ; không còn alias `demo-dataset-cli`.
- Verify: quick set; `pnpm build` (alias `dist/seed-cli.js` có, `dist/demo-dataset-cli.js` không); `pnpm test:integration --
test/integration/installation`.

### Task 2: `check`, mật khẩu kiểm trước, bootstrap trong `apply`, khóa trước khi đọc

- Files: `src/cli/seed/seed.arguments.ts` (+ spec: mode `check`, `--operator-reference` thay `--operator`, bỏ `--organization`,
  `--allow-bootstrap`, `--help` dòng đầu `SEED_PROTOCOL 1`), `seed.command.ts`, `seed-run.ts`, `seed-secrets.ts`,
  `fixture/shared-demo-v2/installation.ts`, `src/modules/installation/public/installation-inspection.api.ts` (`seedCheck`),
  `inspect/inspection-facts.policy.ts` (+ spec: `seedStateOf`), `public/demo-accounts.api.ts` (`seedState`, khóa trước),
  `src/modules/identity-access/public/password.policy.ts` (mới), `src/modules/audit/public/audit.api.ts` và repo của nó
  (`firstAfterField`, kèm spec).
- Depends on: Task 1.
- Acceptance: các dòng `check`, `check runtime role`, mật khẩu, `apply từ trống`, tổ chức khác/dở, đồng thời của test matrix.
- Verify: quick set; `pnpm test:integration -- test/integration/installation`; `pnpm test:integration:serial` (case runtime role
  với `NODE_ENV=production`, gồm `NOT_MIGRATED`).

### Task 3: lịch cả năm, nhánh năm sau

- Files: `src/cli/seed/seed-calendar.ts` (+ spec, thay `demo-dataset-calendar.ts`), `steps/request.steps.ts` (`spendDay`, dòng
  76, 84-89), `steps/finance.steps.ts` (`budgets`/`budgetTurn`/`propose` nhận `year`, dòng 82-184), `seed-run.ts`
  (`forceNextFiscalYear` chỉ khi `NODE_ENV=test`), integration lịch (`seed-calendar.integration-spec.ts`).
- Depends on: Task 2.
- Acceptance: bỏ `LAST_APPLY_DAY`; giữ khóa năm và năm tài chính tháng 1; nhánh năm sau lập ngân sách Y+1 cho ENG, MKT, SAL, R1/R2
  tới đích. Policy nào từ chối ngân sách/ngày chi năm sau (trái `budget.policy.ts:73-74`) ⟹ dừng, báo Owner, không đổi policy.
- Verify: unit hàm ngày (các ngày của spec); `pnpm test:integration -- test/integration/installation/seed-calendar.integration-spec.ts`
  (ngày thật và `forceNextFiscalYear`).

### Checkpoint A

Quick set + integration `installation` + `:serial` xanh.

### Phase B — dataset đúng quyết định hiện hành, bỏ `dev:seed`

### Task 4: rà soát và sửa toàn bộ dataset; README fixture

- Files: `src/cli/seed/fixture/shared-demo-v2/*.ts`, `fixture/shared-demo-v2/README.md`, unit test bảng tài khoản, integration seed.
- Depends on: Task 3.
- Acceptance: bảng _Rà soát dataset_ dưới đây đủ mọi bản ghi; mọi vi phạm đã sửa; README mô tả mục đích từng bản ghi, bảng tài khoản,
  phòng gốc `DS1-ADMIN` và Super Admin, ứng viên dữ liệu sau (gồm thuê bao trong cửa sổ cảnh báo gia hạn — `OD-S6`), giới hạn
  đã biết của nhánh năm sau và sự kiện mốc đã qua khi seed tháng 12.
- Verify: unit bảng tài khoản; integration dòng "dataset đúng quyết định".

Bảng _Rà soát dataset_ (điền khi làm Task 4):

| Bản ghi fixture | Quy tắc hiện hành | Hiện trạng | Sửa |
| --------------- | ----------------- | ---------- | --- |

### Task 5: xóa hẳn `dev:seed`

- Files: xóa `src/cli/dev-seed/**`, `src/modules/installation/dev-seed/**`, `src/modules/installation/public/dev-seed.*`,
  `test/integration/installation/dev-seed*.integration-spec.ts`; `src/cli/commands.ts` (bỏ dòng), `package.json` (bỏ `dev:seed`);
  gate `operational-commands.gate-spec.ts` (bỏ `modules/installation/dev-seed` ở `COMMAND_FOLDERS` dòng 25, file dòng 41, test
  rule 2 dòng 179-196 viết lại thành "không file nào dưới `src/cli/**`, `src/modules/installation/**` chứa `migrate reset`,
  `DROP DATABASE` hay `dropdb`" — chốt local chuyển sang wrapper ở Task 6 —, bỏ nhánh `dev-seed` của `scriptOf` dòng 273), `module-graph.gate-spec.ts:28`, `extension-wiring.gate-spec.ts:54,110,160` (bỏ
  `DevSeedCliModule`), `test/support/process-graphs.ts:8`, policy-ownership gate nếu nêu; `organization`: bỏ `readLocalSeedFixture`
  (`organization-read.api.ts:261-270`), `LocalSeedFixtureFacts` (`organization.types.ts:226`), chuyển `toBrief` sang
  `organization-brief.mapper.ts` (sửa import ở `organization-history.api.ts:8`, `organization-read.api.ts:9`) rồi xóa
  `organization-local-seed-fixture.mapper.ts`; `eslint-suppressions.json:101,111`; README `installation`, `organization`,
  `identity-access`, `test/support/README.md:278-279`, `README.md`, `docs/rules/operational-commands.md` (rule 2), `docs/guides/containers.md:111`.
- Depends on: Task 4.
- Acceptance: không còn `DevSeedApi`/`DevSeedCliModule`/`dev:seed`; mục ngoại lệ extension-wiring chỉ bớt graph `DevSeedCliModule`.
- Verify: quick set; `pnpm lint:prune` nếu ESLint báo suppression thừa; `pnpm build`.

### Checkpoint B

Quick set + gates + integration `installation` xanh.

### Phase C — wrapper, rule, tài liệu

### Task 6: wrapper local `pnpm seed:local`

- Files: `scripts/dev/seed-local.mjs`, `scripts/dev/local-database-host.mjs`, `scripts/verify/seed-local.test.mjs`,
  `scripts/verify/local-database-host.test.mjs`, `.env.seed.local.example`, `.gitignore` (`!.env.seed.local.example`),
  `scripts/README.md`, `package.json` (`seed:local`), `test/gates/operational-commands.gate-spec.ts` (test rule 2 thêm: trong
  `scripts/dev/seed-local.mjs` lời gọi kiểm chốt `NODE_ENV` + host loopback đứng trước lời gọi `spawn(` đầu tiên).
- Depends on: Phase B.
- Acceptance: các dòng "chốt local", "xác nhận local", "an toàn local" của test matrix (prisma/node/HTTP giả); không đặt hay chuyển
  biến consent của Prisma.
- Verify: `pnpm test:scripts`. Lượt thật: Owner chạy và ghi vào bảng dưới.

### Task 7: wrapper VPS `scripts/ops/seed.sh`, retention

- Files: `scripts/ops/seed.sh`, `scripts/verify/seed.test.mjs` (docker giả ghi thứ tự lệnh), `.env.seed.example`, `.gitignore`
  (`!.env.seed.example`), `scripts/ops/postgres-backup-retention.sh`, `scripts/verify/backup-retention.test.mjs`,
  `operational-commands.gate-spec.ts` (`ALIAS_CALLERS` thêm `scripts/ops/seed.sh` nếu nó nêu `dist/<alias>`; nó gọi
  `node dist/cli.js seed`).
- Depends on: Task 6.
- Acceptance: các dòng "VPS wrapper", "VPS nhánh", "retention" của test matrix.
- Verify: `bash -n scripts/ops/seed.sh`; `pnpm test:scripts`; `pnpm test:gates`.

### Task 8: rule và tài liệu

- Files: theo mục _Rule và tài liệu_ của spec — `docs/guides/seed.md` đầy đủ (hai đường local/VPS, `scp seed.sh`, deploy CI/CD trong
  lúc seed dừng exit 2, runbook dựng lại VPS một lần), rule 2 và rule reset của `operational-commands.md`, `database-business.md:11`,
  `containers.md:404`, `ARCHITECTURE.md:26,28`, `AGENTS.md:30` (nếu cần), `module-structure.md:172-178`, `README.md`,
  `docs/guides/huong-dan-dev-moi.md`, `docs/guides/bootstrap-installation.md`, `src/modules/identity-access/README.md`.
- Depends on: Task 7.
- Acceptance: không còn hướng dẫn `dev:seed`/`ops:demo-dataset`/"no command resets a database"; `seed.md` đủ hai đường và runbook.
- Verify: `pnpm rules:check`, `pnpm rules:format`, `pnpm test:gates`.

### Task 9: tài liệu demo cho FE ở Docs

- Files: Docs `Figma UI-UX/API-Integration/demo/{README,accounts,scenarios}.md` (repo Docs, không commit).
- Depends on: Task 4; Owner đã seed VPS.
- Acceptance: tài khoản, vai, phòng, kịch bản khớp `fixture/shared-demo-v2/README.md`; bỏ mô tả cũ (`quan.ly` vừa IT Admin vừa
  trưởng phòng…).
- Verify: đọc diff; kiểm link các trang demo.

### Checkpoint C

Quick set + gates + script tests xanh; Owner chạy full suite một lần, `seed:local` thật và runbook VPS.

## Verification and handoff

| Lệnh / kiểm tra AC                      | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| --------------------------------------- | --------------------- | ----------------- | ----------------------- |
| Quick set + gates + script tests        | —                     | chưa chạy         | —                       |
| Integration seed (theo file, `_serial`) | —                     | chưa chạy         | —                       |
| `seed:local` thật trên máy dev          | —                     | chưa chạy         | Owner chạy              |
| Runbook VPS + `seed.sh` có reset        | —                     | chưa chạy         | Owner chạy              |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan/guide phản ánh implementation cuối.
- [ ] Giao Owner review; cập nhật roadmap.

### Owner clarification before implementation

- 04/11/2026 chat: Owner chose to KEEP --allow-bootstrap per spec. Task 2 Files parenthesis saying to remove it is superseded by this clarification. Both wrappers pass the explicit flag; direct apply on EMPTY still requires it. Record this discrepancy in the implementation report.

- Owner also approved correcting only the historical calendar link target at spec.md:63 after the folder move (outside Changes and acceptance); displayed historical label retained. Restored the legacy guide anchor in the redirect page so older specs still resolve.

### Task 1 evidence

- Renamed command/graph and imports to seed, removed old wrappers/templates and aliases from command table, split unchanged v2 fixture into organization/catalog/finance/requests/extras/index. Updated apply lock prefix at its owner DemoAccountsApi (necessary companion to the command move).
- typecheck passed; seed unit: 10 suites / 81 tests; gates: 16 suites / 327 tests passed. arch:check passed. rules:check initially found the moved calendar link and legacy guide anchor; Owner approved link correction, anchor restored.
- Build passed; dist/seed-cli.js exists and dist/demo-dataset-cli.js does not. Full lint and script tests running; integration files renamed and updated, not run.

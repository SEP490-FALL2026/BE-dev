# Plan: dataset demo của VPS dùng chung — fixture có phiên bản, lệnh `ops:demo-dataset` qua API, wrapper và runbook

- [Spec](spec.md); revision đầu vào: Docs `578f442`, BE `3dffadd` (cây cuối nằm trên `25d5244`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner (30/10/2026).
- Owner review: chưa review. Peer review: chưa có (tùy chọn).
- Triển khai: `verified` local (30/10/2026, cây làm việc chưa commit, nhánh `dev`), gồm Task 5–6 sau review Prompt 08:
  `local-ready-for-owner-review`. PR: chưa có. Chưa SSH, chưa chạy trên VPS (cả hai cách).

## Before coding

Đọc [operational commands](../../../rules/operational-commands.md), [bootstrap-installation](../../../guides/bootstrap-installation.md),
`scripts/ops/bootstrap-installation.sh`, `src/cli/dev-seed/`, `LocalDemoAccountApi`, [test guide](../../../../test/README.md).
Không đổi chốt local của `dev:seed`; không route, migration hay CI mới.

## Tasks

### Task 1: tài khoản demo cho cài đặt đang chạy

- Files: `src/modules/installation/demo-dataset/demo-dataset.module.ts`, `public/demo-accounts.{api,types}.ts`,
  `public/installation.errors.ts`, chú thích `LocalDemoAccountApi` và local seed facade, `test/gates/module-graph.gate-spec.ts`.
- Depends on: none.
- Acceptance: đồ thị riêng của lệnh; hash trước transaction, kế hoạch đọc lại trong transaction; Audit `OPERATOR`; không
  đổi tài khoản đã có.
- Verify: `pnpm test:gates` (module-graph); integration ở Task 3.

### Task 2: lệnh `demo-dataset` và fixture `shared-demo-v1`

- Files: `src/cli/demo-dataset/**` (tham số, stdin, client HTTP, runner, báo cáo, fixture, bước), `src/cli/commands.ts`,
  `package.json`, `test/gates/operational-commands.gate-spec.ts`.
- Depends on: Task 1.
- Acceptance: `plan`/`apply`, chứng minh đích, trạng thái bước và mã thoát như spec; bí mật chỉ qua stdin.
- Verify: unit `src/cli/demo-dataset/**/*.spec.ts`; `pnpm test:gates`.

### Task 3: integration với API thật trên PostgreSQL cô lập

- Files: `test/integration/installation/demo-dataset.integration-spec.ts`.
- Depends on: Task 2.
- Acceptance: từ chối không ghi; `plan` không ghi; dừng giữa chừng rồi tiếp; 9 trạng thái; chạy lại exit 2; xung đột
  không ghi đè.
- Verify: jest integration (lệnh ở bảng dưới) trên container PostgreSQL riêng, dọn container sau khi chạy.

### Task 4: wrapper, mẫu cấu hình và runbook

- Files: `scripts/ops/demo-dataset.sh`, `.env.demo-dataset.example`, `.gitignore`, `scripts/verify/demo-dataset.test.mjs`,
  `docs/guides/demo-dataset.md`, `docs/rules/operational-commands.md`, README liên quan, `rules-check.config.json`.
- Depends on: Task 2.
- Acceptance: image từ `releases/current-image`, mật khẩu chỉ qua stdin, từ chối trước Docker, mã thoát giữ nguyên;
  runbook đủ điều kiện, copy, config, xem trước → nạp → kiểm tra, chạy lại, DB role.
- Verify: `pnpm test:scripts`; `pnpm rules:check`, `pnpm rules:format`.

### Task 5: sửa sau review Prompt 08 (vận hành an toàn)

- Files: `src/infrastructure/database/session-advisory-lock.ts`, `public/demo-accounts.{api,types}.ts` (`holdApplyLock`,
  `timeZone`), `demo-dataset/demo-dataset.module.ts` (+ `RuntimeDatabaseRoleModule`), `src/cli/demo-dataset/`
  (`demo-dataset-run.ts`, `demo-dataset-calendar.ts`, `demo-step-kit.ts`, `demo-dataset-runner.ts`, tham số, các bước so
  khớp), unit `demo-dataset-calendar.spec.ts`, `demo-step-kit.spec.ts`, integration `demo-dataset.integration-spec.ts`,
  `demo-dataset-calendar.integration-spec.ts`, runbook.
- Depends on: Task 2–4.
- Acceptance: lượt `apply` thứ hai bị từ chối khi khóa đang giữ, không khóa treo sau lỗi; `apply` chỉ 01/01–30/11, sang
  năm thì cả hai mode từ chối, năm tính theo múi giờ tổ chức; bản ghi đã có lệch fixture ⟹ `conflict` không ghi đè;
  danh sách vượt `MAX_PAGES` ⟹ `conflict`; lời `plan` nói đúng việc ghi phiên đăng nhập; production chỉ chạy bằng
  runtime role.
- Verify: unit `src/cli/demo-dataset`; integration hai suite ở bảng dưới (ngày giả lập bằng fake `Date`).

### Task 6: cách B — chạy từ máy Windows qua SSH tunnel

- Files: `scripts/ops/demo-dataset-local.mjs`, `.env.demo-dataset-local.example`, `.gitignore`,
  `scripts/verify/demo-dataset-local.test.mjs`, `test/gates/operational-commands.gate-spec.ts` (alias caller),
  `scripts/README.md`, `docs/rules/operational-commands.md`, runbook mục 4.
- Depends on: Task 5.
- Acceptance: kiểm file riêng/bản build/commit đang deploy/tương thích `prisma/` + `openapi.json` trước tunnel (exit 3);
  tunnel chỉ `127.0.0.1`; mật khẩu Super Admin/demo qua stdin, mật khẩu DB chỉ trong env tiến trình con; luôn đóng
  tunnel; mã thoát giữ nguyên. Không SSH thật trong test.
- Verify: `node --test scripts/verify/demo-dataset-local.test.mjs`, `pnpm test:scripts`; smoke từ chối tham số không SSH.

### Checkpoint

`pnpm check` xanh trên cây cuối; integration của Task 3 và Task 5 xanh; `node dist/demo-dataset-cli.js --help` chạy sau
build; không còn container test.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                | Revision / môi trường                                                                                                                                                                 | Kết quả thực chạy                                                                                                                                                                                                                                                                                                                                                                                                                 | Giới hạn / việc còn lại                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEST_DATABASE_ADMIN_URL=<container riêng 127.0.0.1:47432> node node_modules/jest/bin/jest.js --config ./test/config/jest.integration.cjs test/integration/installation/demo-dataset` (Task 3, Task 5; khớp cả `demo-dataset.integration-spec.ts` và `demo-dataset-calendar.integration-spec.ts`) | cây cuối chưa commit trên `25d5244`, 30/10/2026, sau `pnpm check`; PostgreSQL `postgres:17-alpine` dùng một lần, không DB dev, không VPS; `TEMP`/`TMP` là thư mục riêng của lượt chạy | xanh 10/10, 38,0 giây: 7 ca (từ chối không ghi; `plan` không ghi; khóa từ chối lượt thứ hai, đếm khóa 1 → 0; dừng sau 20 lần ghi rồi tiếp tới R1→R9, 0 khóa sau lỗi; chạy lại exit 2, 14 hash Argon2id, 14 Audit; hồ sơ thuế bị sửa ⟹ chỉ `finance.tax-profile` `conflict`; `DS1-OPS` đổi tên ⟹ `conflict`/`blocked`) + 3 ca lịch với `Date` giả (30/11 tới R1→R9; 01/12 `apply` exit 3, `plan` đọc; 04/01 năm sau cả hai exit 3) | Container (`docker rm -f -v`) và thư mục tạm đã xóa. Mỗi tiến trình jest in một `DeprecationWarning` của `pg` ("client already executing a query") — stack chỉ tới query interpreter của Prisma 7.9.1 trong transaction (`Array.map`), không qua mã của hạng mục; có từ lượt chạy đầu, chưa xử lý |
| `pnpm check` (rules, format, Prisma, lint, typecheck, unit, gates, arch, arch docs, scripts, discovery, build)                                                                                                                                                                                    | cây cuối trên `25d5244`, 30/10/2026, Windows + Git Bash; gồm cả hạng mục `be-architecture-readability-hardening` đang làm dở của luồng khác trong cùng cây (không sửa)                | exit 0, 8 phút 4 giây: rules 0 lỗi (322 tệp, 2 715 link), `rules:test` 38/38; lint 0 lỗi, 229 cảnh báo (trần 229, không cảnh báo nào ở tệp của hạng mục); unit 258 suite / 3 744 test; gates 11 suite / 207 test; scripts 235 (233 pass, 2 skip Linux-only của bootstrap), gồm `demo-dataset.sh` và `demo-dataset-local.mjs`; discovery đạt; build sinh 10 alias                                                                  | Lượt trước (trước review) đỏ ở `arch:docs:check`, đã sửa bằng `pnpm arch:graph`. Giữa lượt, `rules:check` từng đỏ vì hạng mục của luồng khác thiếu `plan.md`; luồng đó đã thêm trước lượt cuối                                                                                                    |
| Unit đỏ-trước/xanh-sau: `businessYearOf` (năm của lượt nạp đầu theo múi giờ tổ chức)                                                                                                                                                                                                              | cây làm việc                                                                                                                                                                          | đỏ (hàm chưa có) → xanh 6/6 `demo-dataset-calendar.spec.ts`                                                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                 |
| `node dist/demo-dataset-cli.js --help`                                                                                                                                                                                                                                                            | sau build của `pnpm check`                                                                                                                                                            | in usage, exit 0                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                 |
| `node scripts/ops/demo-dataset-local.mjs` với `--mode wipe`, file riêng không có, file nằm trong repository không bị ignore                                                                                                                                                                       | cây cuối, không mạng                                                                                                                                                                  | exit 3 cả ba, từ chối trước SSH                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                                                                                                                                                                 |
| Chạy trên VPS dùng chung (cách A và B)                                                                                                                                                                                                                                                            | —                                                                                                                                                                                     | **chưa chạy**, chưa SSH                                                                                                                                                                                                                                                                                                                                                                                                           | Owner theo [runbook](../../../guides/demo-dataset.md): A — commit → CI/CD → copy wrapper/mẫu → `plan` → `apply` → kiểm tra; B — build local → file riêng → `plan` → `apply` → kiểm tra                                                                                                            |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (VPS chưa chạy: bước của Owner).
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có (tùy chọn).
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.

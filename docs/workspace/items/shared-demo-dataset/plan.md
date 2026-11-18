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

### Task 7: chẩn đoán và sửa lỗi kết nối của lệnh trên VPS (31/10/2026)

- Bối cảnh (bằng chứng của Owner, `Prompts/…/CURRENT-HANDOFF.md`): lượt `apply` chạy lại 30/10 in
  `warning: A database connection was retired …` + `The demo dataset run failed: Error` (exit 1); lượt `plan` 30/10 và
  31/10 in `The API at --api-url cannot be reached`; lượt `plan` có instrument sau đó đọc đủ 24 bước. Báo cáo của các lượt
  lỗi không giữ dòng lỗi vì wrapper chỉ `tee` stdout.
- Nguyên nhân đã chứng minh (lượt `retired` + `Error`): chỉ một truy vấn Prisma **ngoài** `TransactionRunner` gặp
  `query_timeout` của pg mới cho đúng hai dòng đó — pool retire kết nối, pg ném `Error("Query read timeout")` trần,
  lệnh chỉ in tên lỗi. Ngoài các bước, truy vấn duy nhất như vậy là kiểm runtime role lúc khởi động
  (`RuntimeDatabaseRoleGuard`, chỉ production). Tái hiện bằng proxy TCP ngừng trả lời giữa CLI build thật và PostgreSQL
  local: production ⟹ đúng hai dòng; cùng điều kiện trong `TransactionRunner` (development) ⟹ `TransientDatabaseError`,
  khác chữ ký.
- Điều kiện trên VPS (đọc qua SSH 31/10/2026, chỉ lệnh đọc — không `plan`/`apply`, không đọc file env riêng): máy GCE
  **`e2-micro`** (2 vCPU chia sẻ, 958 MiB RAM), một `PersistentDisk` 30 GB, swap file 10 GB trên cùng đĩa (đang dùng
  ~460 MB; `slm-worker` 71 MB và `slm-api` 43 MB đang nằm trong swap). PSI I/O `full` lúc nhàn ~12 %, tổng ~13,3 giờ nghẽn
  I/O toàn phần từ khi boot (25 ngày); chỉ chạy một `node -e` trong container API đẩy `full avg10` lên 41 % và lần gọi
  `/health/live` đầu mất 818 ms (sau đó 4–10 ms). Log PostgreSQL: checkpoint 30/10 05:24:12, **26 giây sau khi lượt lỗi
  bắt đầu (05:23:46)**, ghi 9 buffer mất 11,9 s (tổng 13,4 s) — các checkpoint 9 buffer khác ~0,8 s. `DB_QUERY_TIMEOUT_MS`
  mặc định 8 000 ms. Kết luận: khởi động một tiến trình Node (container one-off + đồ thị Nest + Prisma) trên host này gây
  nghẽn I/O/swap đủ để truy vấn đầu tiên quá 8 s; trigger là **môi trường**, không phải bug của code; lỗi code là cách báo
  (`Error` trần, báo cáo rỗng), đã sửa. Không có OOM; kernel log không đọc được bằng user `deploy`.
- Lỗi thật thứ hai cùng chữ ký (`apply`): `finally { await lock.release() }` — nhả khóa lỗi (kết nối khóa đã đứt) thay
  kết quả/lỗi thật của lượt chạy bằng `Error` trần và báo cáo không in. Đỏ-trước: test nhận `Error` thay vì lỗi thật.
- `cannot be reached`: client nuốt `cause` của fetch nên không biết là sai cổng, DNS, reset hay timeout. **Không phải sai
  cổng**: `slm-api` có `PORT=4000`; `.env.demo-dataset` sửa lần cuối 29/10 20:01Z (chỉ đọc metadata) và wrapper 30/10
  04:48Z — trước mọi lượt, nên các lượt thành công (04:52, 04:56, 05:16, 31/10 11:35) và các lượt lỗi (30/10 05:37, 31/10
  11:29) dùng cùng URL. 31/10 API khởi động 10:59:12Z, lượt lỗi 11:29:24Z: không trùng deploy. Giả thuyết còn lại (cùng
  điều kiện host: API nằm một phần trong swap sau lúc nhàn, đăng nhập Argon2id 19 MiB + container one-off khởi động cùng
  lúc) **chưa chứng minh** — client cũ không ghi `kind`; image mới ghi `kind=TIMEOUT|NETWORK` + code. Wrapper mặc định
  `http://slm-api:3000` khác cổng thật nhưng không phải nguyên nhân ở đây (file riêng đặt URL); không đổi cổng mặc định.
- Báo cáo của ba lượt lỗi trên VPS đều **0 byte** (`ls` 31/10), xác nhận lỗ hổng chỉ `tee` stdout.
- Files: trong `src/cli/demo-dataset/`: `demo-failure.ts` (mới), `demo-api-client.ts`, `demo-dataset-run.ts`,
  `demo-dataset-runner.ts`, `demo-dataset.command.ts` và spec; `src/infrastructure/database/transaction-runner.ts`
  (`pgConnectivityMessage`); `src/modules/installation/public/demo-accounts.api.ts` + `demo-accounts.api.spec.ts` (mới);
  `scripts/ops/demo-dataset.sh`, `scripts/verify/demo-dataset.test.mjs`; runbook mục 3.3, 4.1, 5.
- Depends on: Task 5 (khóa apply), Task 4 (wrapper).
- Acceptance: dòng lỗi ngoài bước có phase, thời gian phase/lượt, loại, code/SQLSTATE, `retryable`, thông điệp pg cố
  định — không URL/thông điệp gốc/stack/mật khẩu; bước lỗi không in thông điệp gốc; API không tới được nêu request,
  `kind=NETWORK|TIMEOUT`, code trong danh sách cho phép, `elapsedMs`, không địa chỉ; nhả khóa lỗi chỉ là `warning:`, không
  thay báo cáo/lỗi thật; báo cáo wrapper giữ stderr, dòng đầu ghi image + API đích + nguồn, dòng cuối mã thoát + giây.
  Không tăng timeout, không retry mới, không đổi cổng.
- Verify: unit `src/cli/demo-dataset`; `node --test scripts/verify/demo-dataset.test.mjs`; `pnpm check`; thí nghiệm proxy
  trước/sau trên `dist`.
- Quyết định hạ tầng của Owner (31/10/2026): chạy lệnh theo **cách B** — tiến trình Node chạy ở máy local, VPS chỉ còn
  API và PostgreSQL; không tăng timeout, không nâng máy ở bước này. Cách B dùng bản build local nên đã mang sửa đổi của
  Task 7 mà không cần deploy image mới.
- Chuẩn bị cách B đã làm (31/10): object commit deploy `c14c06a` lấy từ `WDP301-FA26-GR8/BE` bằng `git fetch <url> <sha>`
  (không thêm remote, không đổi nhánh/working tree; `origin` không có commit này); `prisma/` + `openapi.json` của cây làm
  việc giống hệt `c14c06a`; API HTTPS công khai của VPS trả `/health/live` 200 từ máy local (~0,8 s); file riêng
  local đã điền các trường không bí mật; wrapper từ chối trước SSH khi thiếu trường (exit 3). Cây làm việc local khác
  `c14c06a` 336 tệp `src` (WIP của luồng khác + Task 7): lệnh in-process chỉ ghi tài khoản demo còn thiếu — chạy lại khi
  đủ cả thì không ghi in-process.
- Lỗi thứ ba, chỉ ở cách B (đã chứng minh, đã sửa): `plan` sau khi có đủ mật khẩu dừng ở `org.accounts` với
  `TransientDatabaseError code=P2028` (dòng chẩn đoán mới). `DemoAccountsApi.describe` đọc 14 tài khoản trong **một**
  transaction, ~4 truy vấn tuần tự mỗi tài khoản; RTT máy local ↔ VPS us-central1 ~245 ms (đo `curl time_connect`) ⟹
  ~60 vòng ≈ 15 s > `DB_TRANSACTION_TIMEOUT_MS` 10 s. Thí nghiệm với pool/adapter của BE qua proxy trễ 245 ms tới PostgreSQL
  local: 1 transaction × 58 truy vấn ⟹ P2028 "expired transaction … 10000 ms" sau 10,5 s; cùng 58 truy vấn chia transaction 4
  truy vấn ⟹ đạt (25,9 s). Sửa: `describe` (chỉ đọc) xét mỗi tài khoản trong một transaction ngắn của riêng nó; đường ghi
  `create` giữ nguyên việc xét lại trong transaction ghi. Không đổi timeout. Giới hạn còn lại: tạo **nhiều** tài khoản demo
  một lượt qua cách B (transaction ghi xét lại + ghi mọi tài khoản thiếu) vẫn có thể quá 10 s qua tunnel — dataset hiện đã có
  đủ tài khoản nên lượt chạy lại không ghi in-process; gộp truy vấn là việc sau nếu cần nạp mới qua cách B.
- Còn mở: `apply` chạy lại phải exit `2` — Owner chạy (lệnh ghi bị chặn với agent).

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

| Task 7 đỏ-trước/xanh-sau: `pnpm test -- src/cli/demo-dataset` (spec mới `demo-failure`, `demo-dataset-run`; thêm ca ở `demo-api-client`, `demo-dataset-runner`) | cây làm việc trên `bbbbe81`, 31/10/2026, Windows | đỏ 9 ca (module chưa có; nhả khóa lỗi trả `Error` thay `DemoApiUnreachableError`; refusal thiếu request/kind/code; phase `start`) → xanh; `src/cli` + `src/infrastructure/{database,observability}` 35 suite / 453 test | Ca timeout ban đầu đỏ vì `DOMException` không là `Error` trong realm của Jest: so theo `name` |
| Task 7: `node --test scripts/verify/demo-dataset.test.mjs` | cây làm việc | đỏ 2 ca mới (báo cáo chỉ có stdout) → xanh 12/12 | `docker` giả; không VPS |
| Task 7 thí nghiệm: proxy TCP ngừng trả lời từ truy vấn đầu, `node dist/cli.js demo-dataset plan` với `DB_QUERY_TIMEOUT_MS=400` (scratchpad, không commit) | `dist` trước và sau sửa; PostgreSQL 17 local, database không có cài đặt, không ghi | trước: production `warning … retired` + `failed: Error` (exit 1); development `failed: TransientDatabaseError`. Sau: `failed in phase startup after 805 ms (run 808 ms): Error retryable=true pg="Query read timeout"`; development `phase installation-facts … TransientDatabaseError … pg="Query read timeout"` | Tái hiện cơ chế, không tái hiện điều kiện của VPS lúc 30/10 05:23Z; database local không có cài đặt nên không chạy tới bước/khóa |
| Task 7: `pnpm check` | cây làm việc trên `bbbbe81` gồm WIP của luồng khác (không sửa) | exit 0: rules 0 lỗi; unit 298 suite / 4 191 test; gates 16 / 325; arch 0 vi phạm; scripts 256 pass, 2 skip; discovery; build 10 alias | Chạy trước khi sửa tài liệu Task 7; tài liệu kiểm lại bằng `rules:check`/`rules:format` |
| Task 7 đọc VPS qua SSH (user deploy, chỉ lệnh đọc): `docker ps/inspect/stats`, `printenv PORT` và các `DB_*_TIMEOUT_MS`, `ls` báo cáo, `docker logs` PostgreSQL/API theo cửa sổ lỗi, `/proc/pressure/*`, `VmSwap`, `stat` (metadata) file riêng, metadata GCE, `GET /health/live` ×5 trong container API | production `c14c06a`, 31/10/2026 13:36Z | xem đoạn "Điều kiện trên VPS" và "`cannot be reached`" ở Task 7 | Không `plan`/`apply`, không đọc nội dung file env riêng, không đổi gì; `docker events` không còn giữ sự kiện 30/10; kernel log cần nhóm `adm` |
| Task 7 cách B: `node scripts/ops/demo-dataset-local.mjs --config <file riêng> --mode plan` | cây làm việc (gồm WIP của luồng khác, build lại 31/10 ~21:00 sau khi luồng đó sửa 28 tệp; unit 34 suite / 365 test của đồ thị lệnh xanh) → production `c14c06a` | lượt 1 exit 3 "build cũ hơn mã nguồn"; lượt 2: tương thích đạt, tunnel mở/đóng, database đọc được (tổ chức, tiền tệ, Super Admin), API HTTPS trả lời; **exit 3: API từ chối mật khẩu Super Admin (401)**, không ghi gì | Không thử lại (tránh throttle/khóa); chờ Owner xác nhận mật khẩu Super Admin trong file riêng. Lỗi kết nối không tái diễn ở lượt này |
| Task 7 cách B, `plan` lượt 3 (mật khẩu Super Admin đã sửa) | như trên → `c14c06a` | `org.departments`, `org.employees` `ĐÃ CÓ`; **`org.accounts` LỖI `TransientDatabaseError code=P2028 retryable=true cause=PrismaClientKnownRequestError`**, exit 1, tunnel đóng | Dẫn tới sửa `DemoAccountsApi.describe` (đoạn "Lỗi thứ ba") |
| Đỏ-trước/xanh-sau `demo-accounts.api.spec.ts` | cây làm việc | đỏ: cả 14 tài khoản trong 1 transaction (`[14]`) → xanh 2/2; `src/modules/installation` + `src/cli/demo-dataset` 23 suite / 221 test; eslint + `tsc --noEmit` sạch | — |
| Integration `test/integration/installation/demo-dataset` (2 suite) | cây làm việc; PostgreSQL 17 local, role `app` CREATEDB không superuser, database tạm của harness (Docker tắt) | xanh **10/10**, 18,8 s; danh sách database trước/sau giống hệt | Không phải server dành riêng cho test như hướng dẫn (Docker tắt); không đụng `software_license_management` |
| Task 7 cách B, `plan` lượt 4 (sau sửa, build lại) | cây làm việc → production `c14c06a`, 31/10/2026 ~21:30 (+07) | **24/24 `ĐÃ CÓ`, exit 0**, tunnel mở/đóng; không lỗi kết nối, không P2028 | `plan` ghi phiên đăng nhập + Audit, không ghi bản ghi dataset |
| Task 7 `apply` chạy lại (phải exit `2`) — Owner chạy (agent bị chặn lệnh ghi) | cùng bản build và file riêng → production `c14c06a`, 31/10/2026 (ảnh terminal của Owner) | **`Tổng: ĐÃ CÓ 24 — mã thoát 2`**, `SSH tunnel closed.` — không còn gì để ghi; tiêu chí "chạy lại dataset không đổi exit 2" đạt | Bằng chứng qua cách B với bản build local chưa commit; cách A (wrapper trên VPS) chưa chạy lại; `demo-dataset-reports/` Owner đã thêm vào `.gitignore` |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (VPS chưa chạy: bước của Owner).
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có (tùy chọn).
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.

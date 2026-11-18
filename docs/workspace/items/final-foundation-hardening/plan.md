# Plan: Final Foundation Hardening — OpenAPI, test support, auth, PostgreSQL adapter, public contracts

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `bf9db0d`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: Owner (finding CP-0, audit nền tảng, tracker; Prompt 24).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local 20/10/2026, cây làm việc chưa commit trên `bf9db0d`).
  Revision: commit `3a3db73` trên `dev` = `origin/dev` (Owner commit/push trực tiếp, không PR); remote CI chưa có
  bằng chứng. PR: chưa có.

## Before coding

Preflight 20/10/2026: `dev` = `origin/dev` = `bf9db0d`, ahead/behind `0/0`, cây sạch. `bf9db0d` (Owner) so với
`188c9e0`: đúng 87 path (48 thêm, 39 sửa) của Prompt 23, gồm `readLocalSeedFixture`, `getOnboardingFacts(tx)` và năm spec
của mục 8. Docs `main` `9416fe0`: `CI-CD/deployment.md` (Prompt 23) và hai tệp Draw.io có sẵn còn dirty, không thuộc lát
này.

Inventory trước khi sửa:

- `openapi.json` SHA-256 `14fd428bf3ee…`, inventory 61 dòng; 0 node `format`+`pattern`, 0 `const`; bốn pattern nghiệp vụ.
- DTO: login `password` 256, reset `newPassword` 1024, đổi `currentPassword` 256 / `newPassword` 256; policy 12–128.
- `extractBearerToken`: `/^Bearer ([^\s]+)$/` (phân biệt hoa thường).
- `pg` 8.23.0, `pg-pool` 3.14.0 (lockfile), `@prisma/adapter-pg` 7.9.1; khai báo `pg: ^8.23.0`. Unit `pg-pool.spec.ts` in hai
  `DeprecationWarning` của pg (custom `Promise` ở constructor; `client.query()` khi client đang chạy query). Integration
  import nhân sự + seed (46 test) với `--trace-deprecation`: 0 cảnh báo.
- `test/support`: 13 tệp, lớn nhất 322 dòng; chỉ có dương tính giả (SuperTest `.expect`, regex `.test`, method `it()`).
- Tệp nhiều `@Injectable`: `identity-access.service.ts` (3), `notifications.service.ts` (2).

## Tasks

### Phase A — OpenAPI

### Task 1: CP0-09, CP0-10, OPENAPI-EXPORT.1

- Files: `test/http/platform/api-inventory.http-spec.ts`, `src/infrastructure/http/openapi-presentation.ts` + spec,
  `scripts/dev/export-openapi.ts`, `scripts/dev/export-environment.ts`, `test/support/cli-process.ts`, process test.
- Depends on: none
- Acceptance: theo spec; `openapi.json` byte-identical sau phase.
- Verify: unit/e2e/process, đột biến, export.

### Checkpoint A

- **CP0-10** (test trước): 4 ca mới (`const` ở parameter/header/components và mọi vị trí subschema; property tên `const`;
  example/examples/default/giá trị enum/`x-*` giữ nguyên; bất biến + idempotent) → **2 đỏ trên code cũ** (property tên
  `const`, giá trị ví dụ). Sửa: walker theo ngữ cảnh (`walkDocument` tìm schema, `walkSchema` chỉ đổi keyword trên node
  schema, giá trị chép nguyên). Xanh 11/11. Đột biến: giá trị bị diễn giải như schema → 11 đỏ; khôi phục nguyên văn code cũ →
  2 đỏ; tên property coi như keyword → 4 đỏ.
- **CP0-09**: e2e kỳ vọng bằng literal (ba regex generator, bốn pattern nghiệp vụ), ca riêng ghim generator vẫn sinh đúng
  ba regex; không còn import `isRedundantFormatPattern` trong `test/`. Đột biến làm sạch (đảo phép so; bỏ date-time có
  offset khỏi danh sách) → e2e đỏ (82 "pattern next to format uuid/date-time"). Một lần đột biến đầu (`&& false`) không
  biên dịch, không tính; một lần chạy tay sao lưu nhầm vào `/tmp` để tệp bị đột biến ~1 phút — khôi phục từ `/tmp`, SHA-256
  khớp `7d33bbd20069` trước khi đi tiếp.
- **OPENAPI-EXPORT.1**: `scripts/dev/export-environment.ts` (bốn giá trị E3 sinh trong bộ nhớ, thư mục làm việc tạm rỗng nên
  không đọc `.env`, khôi phục trong `finally`), export không đặt `NODE_ENV`, ghi đường dẫn tuyệt đối, Prettier resolve
  theo `openapi.json` của repo. Process test (`test/http/platform/openapi-export.http-spec.ts`, qua `runScript` của
  `test/support/cli-process.ts`): không E3, không `NODE_ENV`, `.env` mồi trong cwd → exit 0, stdout/stderr rỗng, tài liệu
  byte-identical, không lộ giá trị. Đột biến bỏ injection / bỏ thư mục tạm → đỏ.
- **Phát hiện ở bước dọn tài nguyên cuối** (một thư mục `slm-openapi-export-*` rỗng còn sót): khi graph API không khởi động
  được, Nest mặc định gọi `process.exit` nên `finally` (khôi phục env, xoá thư mục tạm) và thông báo một dòng bị bỏ qua.
  Tái hiện bằng `PORT=not-a-port` (exit 1, stderr rỗng, thư mục sót). Test trước: ca thứ hai của process test (thư mục tạm
  riêng qua `TMPDIR`/`TEMP`/`TMP` — `runScript` nay cho `environment` ghi đè các biến cơ bản) → đỏ (stderr rỗng). Sửa
  `abortOnError: false` → xanh 2/2. Đột biến về mặc định → đỏ; bỏ `rmSync` trong `finally` → đỏ. Ba thư mục rỗng sót (gốc,
  tái hiện, đột biến) xoá theo tên chính xác.
- `openapi.json` byte-identical (`14fd428bf3ee…`) sau phase A.

### Phase B — TEST-HARDEN.1

### Task 2: gate test support

- Files: `test/gates/test-support-structure.gate-spec.ts`, `test/README.md`, `docs/rules/module-structure.md`.
- Depends on: Task 1
- Acceptance: theo spec; hành vi support không đổi.
- Verify: gate, đột biến tổng hợp, discovery, suite dùng harness.

### Checkpoint B

Gate `test/gates/test-support-structure.gate-spec.ts` 19/19 (parser TypeScript; binding cục bộ không phải global; SuperTest `.expect`,
`RegExp#test`, method `it`, chuỗi, chú thích được cho phép; mẫu sai và lách sai bị từ chối). Lần đầu một dương tính giả
(`return test` của binding phá cấu trúc) → thêm theo dõi binding cục bộ, xanh. Đột biến trên tệp support thật
(`describe`, import `@jest/globals`, bí danh `it`, 412 dòng) → đều đỏ, khôi phục cùng SHA-256. `pnpm test:discovery` sạch;
data-import + gate 10 suite/238.

### Phase C — auth

### Task 3: AUTH.1, AUTH.2

- Files: `bearer-token.ts` + spec, e2e xác thực, `auth.dto.ts`, test DTO, integration đổi mật khẩu, `openapi.json`.
- Depends on: Task 2
- Acceptance: theo spec; diff OpenAPI duy nhất là `maxLength` 256 → 1024.
- Verify: unit/integration/e2e/OpenAPI.

### Checkpoint C

- **AUTH.1** (test trước): 3 ca scheme `bearer`/`BEARER`/`BeArEr` đỏ trên regex cũ; 16 ca từ chối (scheme khác, thiếu token,
  hai dấu cách, tab, xuống dòng, khoảng trắng đầu/cuối, NBSP) giữ. Sửa `/^bearer ([^\s]+)$/i`. Unit 19/19; e2e
  `AUTH.1` (verifier nhận đúng token, 401 `AUTHENTICATION_REQUIRED` và 0 lần verify cho header sai). Đột biến regex phân
  biệt hoa thường → unit 3 đỏ, e2e đỏ.
- **AUTH.2** (test trước): DTO spec (đổi mật khẩu 1024 nhận/1025 từ chối; `currentPassword` 256; login 256; reset 1024) →
  đỏ ở 257/1024; integration (129/257/1024 ⟹ `AUTH.PASSWORD_POLICY_VIOLATION`, 1025 ⟹ `VALIDATION_ERROR`, credential không
  đổi, phiên còn) → đỏ ở 257. Sửa `.max(1024)`. DTO 12/12, integration 29/29. Đột biến về 256 → unit và integration đỏ.
- **OpenAPI**: diff duy nhất `ChangePasswordBodyDto.newPassword.maxLength` 256 → 1024; inventory operation/status/security
  giống hệt. Tác động client: FE/Mobile sinh client từ `openapi.json` cần tái sinh (chỉ ràng buộc độ dài); không sửa repo client.

### Phase D — INF.1

### Task 4: adapter PostgreSQL

- Files: `pg-pool.ts`, `pg-pool.spec.ts`, test hợp đồng nâng cấp.
- Depends on: Task 3
- Acceptance: theo spec; 0 cảnh báo deprecation.
- Verify: unit/integration database, process không cảnh báo.

### Checkpoint D

- Nguồn cảnh báo (pg 8.23, pg-pool 3.14): `Passing a custom Promise…` do constructor gọi `super()` trước khi từ chối cấu hình;
  `Calling client.query() when the client is already executing…` do hai ca spec xếp hàng query đồng thời trên một client
  (fixture). Production không dựa vào xếp hàng: integration import nhân sự + seed (46) và adapter (13) với
  `--trace-deprecation`/`--throw-deprecation` 0 cảnh báo.
- Sửa: kiểm `pipeline`/`Promise` trước `super()`; hai ca spec chạy tuần tự (cùng khẳng định: retire một lần, config dùng
  lại được). Unit adapter 27/27, 0 cảnh báo.
- Phụ thuộc: không pin. Bằng chứng: CI và hai lần install của Dockerfile dùng `--frozen-lockfile`, pg khai `pg-pool: ^3.14.0`,
  nên phiên bản mới chỉ vào qua thay đổi lockfile được review. Hợp đồng nâng cấp: `pg-pool-upgrade-contract.spec.ts` (pg-pool
  emit `release` trước khi quyết giữ client và bỏ client đang `_ending`; `Client.end()` đặt `_ending`;
  `getTransactionStatus()` công khai) cùng integration I1/I11.
- Chốt chặn: `scripts/verify/pg-deprecation.test.mjs` (trong `pnpm test:scripts`) chạy spec adapter với
  `--throw-deprecation`; đột biến kiểm sau `super()` / xếp hàng lại → đỏ.
- Lần chạy integration đầy đủ đầu tiên (`--trace-deprecation`) còn **một** cảnh báo xếp hàng query: fixture có sẵn
  `password-self-service-http.integration-spec.ts` (`Promise.all` ba `mailFor` trên một client `ctx.sql`), không phải
  code production. Sửa: tra tuần tự; chạy lại toàn bộ integration (bảng cuối).

### Phase E — ROOT-HARDEN.1

### Task 5: một hợp đồng injectable công khai mỗi tệp

- Files: `notifications/public/email-delivery.api.ts`, `notifications.service.ts`, `notifications.module.ts`,
  `worker/email-dispatch.job.ts`; `identity-access/public/identity-access-inspection.api.ts`, `local-demo-account.service.ts`,
  `identity-access.service.ts`, hai facade module, consumer ở `installation`; gate.
- Depends on: Task 4
- Acceptance: theo spec; hành vi gửi thư và đồ thị module không đổi.
- Verify: notifications, worker loop, ba gate kiến trúc, đột biến.

### Checkpoint E

- Gate (test trước) đỏ đúng hai tệp: `identity-access.service.ts` (3 injectable, Prompt 23) và `notifications.service.ts`
  (2, Prompt 22). Tách nguyên văn: `notifications/public/email-delivery.api.ts`, `identity-access/public/identity-access-inspection.api.ts`,
  `identity-access/public/local-demo-account.api.ts` (+ đổi tên spec tương ứng); consumer: vòng gửi thư, `inspect/`, `dev-seed/`.
- Đăng ký chính xác `PUBLIC_ROOT_CONTRACT_FILES` (boundaries + structure, ca kiểm hai danh sách bằng nhau); mỗi mục phải tồn
  tại, có đúng một injectable và consumer ngoài module; không tệp module nào re-export.
- Đột biến: gộp lại hai injectable → đỏ; bỏ mục đăng ký → 3 đỏ; allowlist chung `*.service.ts` → đỏ; barrel re-export
  `EmailDispatcher` → **lần đầu sống sót** (98 xanh), thêm gate cấm re-export, chạy lại → đỏ.
- Unit + gate 42 suite/479; integration worker-mail-loop, email-outbox, inspect, seed 5 suite/35.

### Phase F — tài liệu và gate cuối

### Task 6: metadata và full gate

- Files: rule/test guide/ARCHITECTURE/roadmap/items index/plan Prompt 23 (pin `bf9db0d`)/tracker.
- Depends on: Task 5
- Acceptance: full gate xanh, kiểm kê tài nguyên 0.
- Verify: mục dưới.

## Verification and handoff

Môi trường: Windows 11, Git Bash, Node v24.0.1, pnpm 11.1.3, Docker; PostgreSQL 17-alpine container riêng
`slm-p24-test-db` (`127.0.0.1:55442`, ghi ledger trước khi tạo); cây làm việc chưa commit trên `bf9db0d`.

| Lệnh / kiểm tra AC                                 | Revision / môi trường                                          | Kết quả thực chạy                                                                                                                                                                                                               | Giới hạn / việc còn lại          |
| -------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Checkpoint A → E                                   | cây làm việc                                                   | xanh; số liệu và đột biến ở từng checkpoint                                                                                                                                                                                     | —                                |
| `pnpm check`                                       | cây cuối                                                       | exit 0: rules 113 tệp/1009 link, `rules:test` 38/38, Prettier, Prisma, ESLint, `tsc`, unit 101 suite/1330, `test:scripts` 20/20 (gồm chốt chặn pg), discovery (unit 101, e2e 15, integration 50), build; 0 `DeprecationWarning` | —                                |
| `pnpm test:e2e`                                    | cây cuối                                                       | 15 suite/278; 0 `DeprecationWarning`                                                                                                                                                                                            | —                                |
| `pnpm test:integration`                            | cây cuối, PostgreSQL riêng, `NODE_OPTIONS=--trace-deprecation` | 50 suite/661, 438 s; 0 `DeprecationWarning` (sau khi sửa fixture, Checkpoint D), 0 `42501`, 0 database/backend sót                                                                                                              | —                                |
| `pnpm openapi:export`                              | cây cuối                                                       | diff duy nhất `ChangePasswordBodyDto.newPassword.maxLength` 256 → 1024; inventory operation/status/security giống hệt                                                                                                           | client FE/Mobile cần tái sinh    |
| Phụ thuộc                                          | `package.json`, `pnpm-lock.yaml`                               | không đổi; không pin (Checkpoint D)                                                                                                                                                                                             | —                                |
| Quét zero-hit                                      | cây cuối                                                       | 0 `isRedundantFormatPattern` trong `test/`; đổi `const` chỉ trong `walkSchema`; 0 `NODE_ENV` trong script export; 0 regex `Bearer` phân biệt hoa thường; gate test support và injectable xanh; tài liệu không còn câu cũ        | —                                |
| Remote CI checkpoint trước                         | `gh run list` (chỉ đọc)                                        | Backend CI `success` trên `bf9db0d` (Prompt 23), `188c9e0`, `895b729`                                                                                                                                                           | cây này chưa push nên chưa có CI |
| `rules:format`, `format:check`, `git diff --check` | cây cuối                                                       | sạch                                                                                                                                                                                                                            | —                                |

- [x] Hành vi trong scope có bằng chứng.
- [x] Spec/plan/test design phản ánh implementation cuối.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

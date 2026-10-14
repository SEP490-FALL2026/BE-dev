# Plan: sửa G0/1a/1b sau re-review

- [Spec](spec.md); revision tài liệu đã review: chưa review (draft 14/10/2026, lượt 2). [Research](research.md) ·
  [Test plan](test-plan.md) · [Prototype](prototype/README.md) · [Evidence](prototype/evidence/README.md).
- Implement: Claude theo ủy quyền của Owner (15/10/2026); reviewer: một dev khác (**chưa review**).
- Triển khai: **đã implement** ở nhánh `fix/g0-g1-remediation-2026-10-15`, PR về `dev`. Kết quả kiểm chứng
  và giới hạn: [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md).
- Prototype ([diff](prototype/remediation.prototype.diff), [README](prototype/README.md)) là lịch sử nghiên cứu: test đỏ/xanh
  của lượt 1–3 dẫn từ đó. Mã sản phẩm trong nhánh sửa khớp prototype lượt 3 (khác: lời nhắn lỗi của CLI khi `COMMIT`
  mất phản hồi, test candidates cỡ CI, test CLI spawn, sửa test T6/stray/spy, rule kiến trúc). Các hộp bên dưới đánh dấu
  phần đã có trong nhánh; hộp ở mục _Kiểm chứng và bàn giao_ (review của dev, cập nhật roadmap theo sự kiện thật) chưa.

## Đã làm trong phiên research (không phải implement)

- [x] Lượt 1: tái hiện N-1/R-15 trên `a8ba88f` với API build thật, PostgreSQL 17 thật, relay và `docker pause`; đọc mã
      pg 8.23.0, pg-pool 3.14.0, adapter-pg 7.9.1/7.10.0, Prisma 7.9.1; prototype bước 1–4.
- [x] Lượt 2 (khép review C-1→C-5): hợp đồng client nội bộ + release guard; R-13; runner mutation có control run và phân
      loại; README tái dựng prototype + checksum; runbook rollback + [SQL kiểm tra hư hại](n1-consistency-check.sql);
      gate container/CLI/audit đúng lockfile. Kết quả ở [evidence](prototype/evidence/README.md) và mục _Kiểm chứng_.

## Trước khi code

- Đọc `AGENTS.md`, `CONTRIBUTING.md`, [database rules](../../../rules/database-business.md),
  [API contract](../../../rules/api-contract.md), `test/README.md`, spec này và research.
- Đối chiếu revision: gói viết cho `a8ba88f`. Nếu `dev` đã đổi file trong các bước dưới, đối chiếu trước khi áp.
- **Không** gộp thay đổi `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml` của hạng mục dịch nội dung vào PR
  remediation; nhánh PR tạo từ `dev`, không từ working tree đang có dependency dịch.
- Môi trường: PostgreSQL 17 riêng theo [test guide](../../../../test/README.md) (role `NOSUPERUSER CREATEDB`);
  Docker cho runner live. Không dùng `PostgreSQL_Local`/DB dùng chung.
- **Bẫy đã gặp:** test kiến trúc `keeps raw SQL inside the module that owns the table` quét **mọi chữ** trong file có
  `$queryRaw` — một comment chứa tên bảng của module khác (ví dụ `employees` trong `identity-access.repo.ts`) làm test đỏ.
- Đề xuất cập nhật roadmap (không tự sửa `docs/roadmap.md` đang dirty): thêm dòng hạng mục
  _Sửa sau re-review G0/1a/1b_ trỏ tới spec này, phụ thuộc: chặn bắt đầu code 1c.

## Các bước nhỏ

Thứ tự theo dependency. Mỗi bước một PR (bước 2 có thể gộp với 1 nếu reviewer muốn). Viết test trước, thấy đỏ đúng lý
do trên code hiện tại, rồi sửa. ID test theo [test plan](test-plan.md).

### Bước 1 — N-1, R-02, N-2, N-5 (PR 1, **chặn** mọi bước code transaction mới)

Files: tạo `src/infrastructure/database/pg-pool.ts`, `pg-pool.spec.ts`, `test/support/pg-relay.ts`,
`test/integration/database-stall.integration-spec.ts`, `test/integration/pg-pool.integration-spec.ts`; sửa
`src/infrastructure/database/prisma.service.ts`, `transaction-runner.ts`, `transient-error.spec.ts`,
`src/infrastructure/config/env-schema.ts`, `env-schema.spec.ts`, `env-config.ts`, `test/support/test-config.ts`,
`test/integration/database-unavailable.integration-spec.ts`.

- [x] 1.1 `test/support/pg-relay.ts`: relay có `pause()/resume()` và `holdWhen(pattern)/releaseHeld()/holding` giữ
      **một** kết nối từ câu có SQL text khớp. Phân tích mọi chunk từ đầu luồng (StartupMessage không có byte loại;
      SSLRequest/GSSENCRequest 80877103/80877104), chỉ đọc text của message `P` và `Q`. Bản đầy đủ trong prototype diff.
- [x] 1.2 Test đỏ T1–T6 `database-stall` (relay, `DB_QUERY_TIMEOUT_MS = 2000`, `DB_CONNECT_TIMEOUT_MS = 1000`,
      `DB_TRANSACTION_TIMEOUT_MS = 4000`, `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS = 120000` để backstop không che lỗi client;
      bảng riêng `stall_probe`, `stall_log`). Ca N-1 (T2): giữ `UPDATE stall_probe` trong `runner.run`, nhả, 6 vòng
      traffic; assert **trước** `{ value: 0, paired: 0 }` và 0 `idle in transaction`, **sau đó** mới assert thời gian.
      Trên `a8ba88f` phải đỏ ở `value: 1`.
- [x] 1.3 Test đỏ T17 `pg-pool.spec` (U1–U10) và T18 `pg-pool.integration-spec` (I1, I3, I7, I9, I10, I11) theo hợp đồng
      dưới đây; viết trước `pg-pool.ts`.
- [x] 1.4 `pg-pool.ts` — client nội bộ theo hợp đồng (bản đầy đủ: prototype diff; nghiên cứu: research mục 2.6):

```ts
export class UnsupportedQueryFormError extends TypeError {}

export class RetireOnTimeoutClient extends Client {
  // Nhận đúng: query(text | config [, values]) -> Promise; query(text | config, [values | undefined,] cb).
  // Callback theo luật pg: đối số 3 nếu là hàm, ngược lại đối số 2.
  // Từ chối đồng bộ (UnsupportedQueryFormError, không gửi, không end): Submittable, config.callback,
  // hai callback; constructor với pipeline: true hoặc Promise tùy biến.
  // Khi kết cục là `Query read timeout`: retire() rồi trả/ném lại đúng đối tượng lỗi gốc.
  retire(): void {
    if (this.retired) return; // hai timeout -> một end()
    this.retired = true;
    try {
      void this.end().catch(() => undefined);
    } catch {
      /* bỏ kết nối dù sao */
    }
    try {
      this.onRetired();
    } catch {
      /* hook không chặn end(), không thay lỗi */
    }
  }
}

export function createPostgresPool(config: PoolConfig, hooks: { onRetire?: () => void } = {}): Pool {
  // PooledClient extends RetireOnTimeoutClient, onRetired -> hooks.onRetire
  const pool = new Pool({ ...config, Client: PooledClient });
  // Release guard: pg-pool 3.14 emit 'release' trước khi kiểm _ending (index.js:389-392).
  pool.on('release', (error, client) => {
    try {
      if (!error && client.getTransactionStatus() !== 'I') (client as RetireOnTimeoutClient).retire();
    } catch {
      /* không phá release */
    }
  });
  return pool;
}
```

- [x] 1.5 `PrismaService` tạo pool bằng `createPostgresPool` (tùy chọn hiện có cộng `idle_in_transaction_session_timeout`),
      `new PrismaPg(pool, { disposeExternalPool: true })`, log `warn` một dòng khi loại kết nối (không SQL/tham số).
- [x] 1.6 Cấu hình: `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` tùy chọn (`1 000…600 000`); không đặt ⟹
      `max(20 000, DB_TRANSACTION_TIMEOUT_MS + 10 000)`; đặt ⟹ phải `> DB_TRANSACTION_TIMEOUT_MS`, sai ⟹ không khởi
      động. Thêm vào `EnvironmentVariables`, `test/support/test-config.ts`. Unit T8: mặc định 20 000; tx 30 000 không đặt
      idle ⟹ 40 000; idle 10 000 với tx 10 000 bị từ chối.
- [x] 1.7 `transaction-runner.ts` `PG_CONNECTIVITY_MESSAGES` thêm `'Connection terminated'`,
      `'Client was closed and is not queryable'`, `'Client has encountered a connection error and is not queryable'`;
      unit T7. `UnsupportedQueryFormError` **không** là lỗi tạm thời.
- [x] 1.8 Chuyển `database-unavailable.integration-spec.ts` sang `PgRelay` chung (không đổi assertion). Prototype lượt 3
      đã làm: xóa lớp `PausableRelay` riêng, 4/4 test xanh trước và sau; PR 1 làm lại theo diff.
- [x] 1.9 Tài liệu N-4 phần CSDL: ADR-0011 (vẫn Proposed) câu "stalled DB requests … were fixed" ⟹ R-02 cần thêm bản
      sửa N-1; spec 1a bảng cấu hình thêm biến idle và "kết nối có câu bị timeout bị loại khỏi pool";
      [hướng dẫn container](../../../guides/containers.md) thêm biến mới.
- Kiểm chứng bước 1: gate _Kiểm chứng_ dưới đây; mutation M-N1a/b, M-N2, M-N5, M-IDLE, M-DISP, M-C1a…e, M-R13c;
  `r02-db-outage.mjs P A A2 B C D D4 E` ⟹ 0 FAIL, D1-0/D4-0 ≈ query timeout.

### Bước 2 — R-15, R-12 (PR 2, sau bước 1 vì dùng `PgRelay`)

Files: `src/modules/identity-access/account-management.http-errors.ts`, `me.controller.ts`, tạo `me.controller.spec.ts`;
`src/infrastructure/health/health.controller.ts`, `health.controller.spec.ts`; `test/support/http-test-app.ts`;
tạo `test/integration/me-unavailable.integration-spec.ts`.

- [x] 2.1 Test đỏ T9, T10, T11 (readiness: Terminus 503 ⟹ `ApiException` 503 `SERVICE_UNAVAILABLE`; `TypeError` giữ
      nguyên — ca "leaves any other failure to the global filter" là ca bắt mutation M-R12).
- [x] 2.2 `toUnavailableApiException(error): ApiException | undefined`; `toAccountApiException` kết thúc bằng
      `return toUnavailableApiException(error) ?? error;`; `MeController.get`:

```ts
async get(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<MeView> {
  try {
    return await this.me.get(principal);
  } catch (error) {
    // The guard already read the database; it can still stop answering before MeService does (R-15).
    throw toUnavailableApiException(error) ?? error;
  }
}
```

- [x] 2.3 `HealthController.getReadiness`: chỉ bắt `ServiceUnavailableException` ⟹
      `new ApiException(HttpStatus.SERVICE_UNAVAILABLE, { code: 'SERVICE_UNAVAILABLE', message: 'A required dependency is unavailable.' })`.
- [x] 2.4 Spec 1a bảng route `/me`: thêm 503 `SERVICE_UNAVAILABLE` khi CSDL lỗi sau guard (N-4).
- Kiểm chứng: gate; `pnpm openapi:export` không drift (503 đã khai); runner `r02-db-outage.mjs A M` ⟹ A-5
  `503/SERVICE_UNAVAILABLE`, M-2 PASS.

### Bước 3 — R-03, N-3, N-6, nit (PR 3, độc lập bước 1–2)

Files: `src/modules/identity-access/account-management.service.ts`, `identity-access.repo.ts`;
`src/modules/organization/organization.service.ts`, `organization.repo.ts`;
`test/integration/account-candidates.integration-spec.ts`.

- [x] 3.1 Test đỏ T12, T13, T22 (oracle SQL như [prototype](prototype/candidates-scale.integration-spec.ts)): khối
      4 981 và 5 001 người có tài khoản đứng trước ⟹ bằng oracle; ranh giới 20/21; `Z_1` chỉ khớp `Z_1`; `%` không khớp
      ai; `Y\1` chỉ khớp `Y\1` (không khớp `Y1`). Ca 50 000 không vào CI (đã đo ở prototype, xem research mục 4); test sản phẩm: `test/integration/account-candidates-boundaries.integration-spec.ts` (tới 6 000).
- [x] 3.2 `IdentityAccessRepo.findEmployeeIdsWithAccount()`; xóa `findAccountEmployeeIds`. Comment không chứa tên bảng
      `employees` (bẫy test kiến trúc).
- [x] 3.3 `OrganizationRepo.searchActiveEmployees(search, onDate, limit, excludeEmployeeIds)` một `$queryRaw`:

```sql
SELECT e.id, e.employee_code, e.full_name, e.work_email, placement.department
  FROM employees e
  LEFT JOIN LATERAL (
    SELECT d.name AS department
      FROM employee_placements p JOIN departments d ON d.id = p.department_id
     WHERE p.employee_id = e.id AND p.valid_from <= ${day}::date
       AND (p.valid_to IS NULL OR p.valid_to > ${day}::date)
     ORDER BY p.valid_from DESC LIMIT 1
  ) placement ON true
 WHERE e.status = 'ACTIVE'
   AND e.id <> ALL (${[...excludeEmployeeIds]}::uuid[])
   AND (${pattern}::text IS NULL OR e.employee_code ILIKE ${pattern}
        OR e.full_name ILIKE ${pattern} OR e.work_email ILIKE ${pattern})
 ORDER BY e.employee_code, e.id
 LIMIT ${limit}
```

`day = fromDateColumn(onDate)`; `pattern = term ? '%' + escapeLikePattern(term) + '%' : null` với
`escapeLikePattern = (t) => t.replace(/[\\%_]/g, (c) => '\\' + c)` (escape cả `\` — ký tự escape mặc định của
`LIKE`). Không dùng Prisma `notIn` (một bind param mỗi id, lỗi từ ~32 766 id — research mục 4). Chi phí tuyến tính
theo số tài khoản; 50 000 là mức đã đo.

- [x] 3.4 `OrganizationService.searchActiveEmployees(..., excludeEmployeeIds: readonly string[] = [])`;
      `listCandidates` = `findEmployeeIdsWithAccount()` rồi `searchActiveEmployees(search, today, 20, ids)`; xóa
      `CANDIDATE_PAGE_SIZE`, `CANDIDATE_MAX_PAGES`, vòng lặp.
- [x] 3.5 Nit: `organization.repo.ts` import `isUniqueViolation` từ `../../infrastructure/database/unique-violation`.
- [x] 3.6 Spec 1b dòng 145: thay "200 nhân viên đầu" bằng thiết kế mới và chi phí.
- Kiểm chứng: gate; mutation M-R3x/y/w/z.

### Bước 4 — R-14, R-09 (PR 4, sau bước 1 vì dùng `PgRelay`)

Files: `src/modules/identity-access/identity-access.repo.ts`, `account-management.service.ts`;
tạo `test/integration/account-list-and-redeem.integration-spec.ts`.

- [x] 4.1 Test đỏ T14 (relay giữ `/^SELECT COUNT\(\*\)/i`, chèn 1 tài khoản, nhả ⟹ `totalItems === items.length`;
      trên `a8ba88f`: 6 ≠ 5) và T15 (redeem `not-a-token`, `'x'.repeat(43)` ⟹ 400 `AUTH.INVITATION_INVALID`,
      `PasswordHasher.hash` không được gọi).
- [x] 4.2 `listAccountRecords`: `prisma.$transaction(async (tx) => { findMany; count }, { isolationLevel: 'RepeatableRead' })`.
- [x] 4.3 `redeemInvitation`: `hasher.hash(password)` xuống **sau** `findActionTokenOwner`/kiểm `appUserId`; cập nhật dòng
      _Kích hoạt (redeem)_ spec 1b.
- Kiểm chứng: gate (gồm `account-concurrency`); mutation M-R14, M-R09.

### Bước 5 — R-13 (PR 5, sau PR 1 vì dùng `DatabaseEnvironmentVariables` gồm biến idle)

Files: `src/infrastructure/config/env-schema.ts`, `env-schema.spec.ts`, `env-config.ts`, tạo
`installation-configuration.module.ts`; `src/infrastructure/database/prisma.service.ts`, `transaction-runner.ts` (chỉ
kiểu `ConfigService`); tạo `src/modules/identity-access/identity-access-facade.module.ts`, sửa `identity-access.module.ts`;
`src/modules/installation/installation.module.ts`; `src/installation-cli.ts`; `src/architecture-boundaries.spec.ts`;
tạo `test/integration/installation-minimal-env.integration-spec.ts`; `ARCHITECTURE.md`, `docs/guides/containers.md`.

- [x] 5.1 Test đỏ T19 (validator CLI nhận `NODE_ENV=production` + `DATABASE_URL`; validator đầy đủ với cùng env báo thiếu
      secret), T20 (đồ thị import của `installation-cli.ts` không tới `configuration.module.ts`,
      `identity-access.module.ts`, `notifications/**`, `@nestjs/jwt`), T21 (context cài đặt với env tối thiểu: thành công,
      chạy lại `AlreadyInstalled`, lỗi giữa chừng không để lại gì).
- [x] 5.2 `databaseKeys` dùng chung; `validateInstallationEnvironment(input): DatabaseEnvironmentVariables`;
      `EnvironmentValidationError`; kiểm thứ tự timeout dùng chung cho hai validator. Không thêm secret mặc định nào.
- [x] 5.3 `InstallationConfigurationModule` (tệp riêng) và `IdentityAccessFacadeModule` (repo, `PasswordHasher`,
      `IdentityAccessService`); `IdentityAccessModule` import facade; `InstallationModule` import facade +
      `InstallationConfigurationModule`.
- [x] 5.4 `installation-cli.ts` import `InstallationModule` động sau `--help`; lỗi validate ⟹ exit 1 có thông điệp,
      không stack trace; mã thoát 0/1/2/130 giữ nguyên. API/worker giữ `ConfigurationModule` đầy đủ.
- [x] 5.5 `docs/guides/containers.md`: CLI chỉ cần `DATABASE_URL` (+ `DB_*` tùy chọn); ví dụ không dùng `--env-file` của
      API. `ARCHITECTURE.md`: ranh giới facade.
- Kiểm chứng: gate; L6 (PTY trên image với env tối thiểu), L7 (API/worker cùng env exit ≠ 0); mutation M-R13a/b.

### Bước 6 — tài liệu còn lại của N-4 (cùng PR cuối hoặc PR riêng)

- [x] Tệp [follow-up](../../g0-g1-review-follow-up.md): tiêu đề "chưa commit, chưa PR" ⟹ `cbd8b5c`, PR #6; trỏ re-review
      và gói này. Không sửa báo cáo review lịch sử.
- [x] README/ARCHITECTURE (CONTRIBUTING không có câu cần sửa): câu R-02 "đã sửa" ⟹ "đã sửa ở `<revision>` sau N-1"; hướng dẫn SMTP:
      `SMTP_TLS=false` vẫn nâng STARTTLS nếu máy chủ hỗ trợ.
- [ ] `docs/workspace/sources.md`: bỏ "theo dõi `OQ-A-26`" khi pin nguồn G2 (thuộc G2, chỉ nhắc ở đây).

### Hoãn có đề xuất

| Finding    | Tác động                   | Lý do hoãn                                  | Người / điều kiện xử lý         |
| ---------- | -------------------------- | ------------------------------------------- | ------------------------------- |
| R-10, R-11 | JobTitle/I-2 cho import G2 | Thuộc thiết kế G2 với `QĐ-68`, `QĐ-70a/b/c` | Dev phụ trách G2, trước code G2 |

R-13 không còn hoãn (Owner 14/10/2026). R-06/R-07 giữ nguyên theo quyết định Owner, không phải finding mở.

## Rollback

Theo [spec — rollback](spec.md#tương-thích-quan-sát-triển-khai-rollback): lớp artifact A/B/C, sàn rollback là digest
artifact C đầu tiên; không phục vụ ghi bằng artifact A — biện pháp bảo đảm duy nhất là dừng mọi writer (API + worker về 0
sau khi drain, không chạy CLI, dừng job ghi), chặn ingress một mình không đủ; kết quả `COMMIT` chưa xác định ⟹ đọc
lại trước khi thử lại, chạy [`n1-consistency-check.sql`](n1-consistency-check.sql) trên mọi DB đã chạy `cbd8b5c`/`a8ba88f`.
Rollback triển khai không hoàn tác dữ liệu; rollback transaction là việc của từng request.

## Kiểm chứng và bàn giao

Gate cho **mỗi** PR, chạy trên checkout sạch của nhánh PR (không phải working tree có dependency dịch):

| #   | Lệnh / kiểm tra                                                                                                                            | Ghi chú                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| G1  | `pnpm install --frozen-lockfile && pnpm check`                                                                                             | lint, format, typecheck, unit, build |
| G2  | `TEST_DATABASE_ADMIN_URL=<CREATEDB riêng> pnpm test:integration`; `pnpm test:e2e`                                                          | PG 17 riêng                          |
| G3  | `pnpm openapi:export` rồi `git diff --exit-code` file contract                                                                             | không drift                          |
| G4  | `pnpm audit --prod --audit-level high` trên lockfile của nhánh PR; ghi sha256 lockfile                                                     | không trên working tree dịch         |
| G5  | `docker build`; `docker compose config -q`                                                                                                 | image runtime                        |
| G6  | Container API/worker với env đầy đủ + biến mới; tx 30 000 không đặt idle ⟹ khởi động; idle ≤ tx ⟹ exit ≠ 0                                 | L9                                   |
| G7  | CLI trên image với chỉ `DATABASE_URL`: PTY notty/`--password`/mismatch/weak/Ctrl+C/success/rerun; API/worker cùng env exit ≠ 0             | L6, L7 (PR 5)                        |
| G8  | [`live-smoke-remediation.mjs`](prototype/live-smoke-remediation.mjs) ba lượt tuần tự, mỗi lượt reset DB: 16 operation + worker + SMTP sink | L5                                   |
| G9  | `r02-db-outage.mjs P A A2 B C D D4 E M` (đặt `R02_PORT` nếu Windows giữ cổng)                                                              | L1–L4                                |
| G10 | `node prototype/mutate-prototype.mjs` với định nghĩa cập nhật cho mã PR: control xanh, mọi mutation `KILLED`                               | test plan                            |

Kết quả prototype (clone riêng, **không** phải PR) — chi tiết và hash ở [evidence](prototype/evidence/README.md):

| Kiểm tra                                              | Revision / môi trường                                      | Kết quả                                                                                                                                                                     | Giới hạn                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Lượt 1: check, integration, e2e, live, r02            | clone `a8ba88f` + diff lượt 1                              | xem [final-regression](prototype/evidence/final-regression.txt)                                                                                                             | Mutation "11/11" chỉ còn giá trị lịch sử                                    |
| Lượt 2: G1–G10                                        | clone `d32b523` (`a8ba88f` + toàn bộ prototype)            | G1–G7, G9 xanh; G8 131/1, 131/1, 132/0; G10 21 killed + 1 infra-error — [evidence lượt 2](prototype/evidence/README.md#lượt-2)                                              | Không phải PR; plan 1.8 chưa làm; G8 chưa ổn định (race runner, giả thuyết) |
| Lượt 3: check, integration, e2e, mutation, live ×3    | snapshot `db69477`, cây `99ce604` (lượt 2 + 2 commit test) | unit 318, integration 201/201, e2e 33/33; mutation 22/22 killed, 0 infra-error; live 132/0 ×3 — [evidence lượt 3](prototype/evidence/README.md#lượt-3)                      | Không phải PR; R-02/Docker/audit/OpenAPI dẫn lượt 2 vì runtime không đổi    |
| Lượt 4: nhánh sản phẩm, commit `e147782` (clone sạch) | Windows Node 24 + Linux Node 22, PG 17.11                  | check 321, e2e 33, integration 203; mutation 26/26 killed; live 132/0 ×3; D1/D4 26/0; Docker, CLI PTY, fail closed — [evidence lượt 4](prototype/evidence/README.md#lượt-4) | GitHub Actions chưa chạy; chưa dev review                                   |
| Dev review, CI của PR                                 | PR về `dev`                                                | chưa có                                                                                                                                                                     | Dev điền                                                                    |

Số 260/33/159 và live 132/0 là baseline re-review tại `a8ba88f`, không phải kết quả của PR.

- [ ] AC trong spec có bằng chứng trên revision PR; lỗi đã xử lý hoặc ghi blocker.
- [ ] Dev khác review code; spec phản ánh thay đổi đã thống nhất.
- [ ] Cập nhật roadmap/PR theo sự kiện thật; merged ≠ accepted.

## Đối chiếu review gói kế hoạch (C-1→C-5)

| Gap | Yêu cầu review                                                                                                                                    | Đã làm trong gói                                                                                                                                                                    | Bằng chứng                                                                                                                                   | Còn lại                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| C-1 | Hợp đồng wrapper, fail closed, test mọi dạng, retire idempotent, hook lỗi, release guard                                                          | Research 2.6, spec _Kết nối CSDL_, bước 1.3–1.4; T17/T18; mutation M-C1a…e                                                                                                          | [evidence lượt 3](prototype/evidence/README.md#lượt-3)                                                                                       | Dev review hợp đồng; test lại khi nâng pg/pg-pool                                                  |
| C-2 | Runner mutation áp đúng một lần, phân loại, control xanh, restore + hash, README tái dựng, chạy lại trên artifact cuối                            | [`mutate-prototype.mjs`](prototype/mutate-prototype.mjs); T6 tự đóng pool nó sở hữu; [README](prototype/README.md) có bước snapshot local trước mutation, đã làm lại trên clone mới | [evidence lượt 3](prototype/evidence/README.md#lượt-3): 22/22 killed, 0 infra-error; cây khớp                                                | **Khép trong prototype.** PR phải cập nhật định nghĩa mutation theo mã PR                          |
| C-3 | Runbook rollback, artifact an toàn hoặc dừng ghi, deploy vs transaction rollback                                                                  | Spec _Rollback_ (dừng mọi writer: API + worker về 0 sau drain, không CLI; ingress một mình không đủ), mục _Rollback_ ở trên, [SQL](n1-consistency-check.sql) (L8)                   | `evidence/run2-rg2001/n1-consistency-sql.txt`                                                                                                | Người vận hành ghi digest sàn khi có artifact C                                                    |
| C-4 | R-13 sửa, CLI env tối thiểu, API/worker fail closed, test CLI thật                                                                                | Bước 5; T19–T21, L6, L7                                                                                                                                                             | [evidence lượt 2](prototype/evidence/README.md#lượt-2) (runtime lượt 3 giống hệt)                                                            | Dev review ranh giới facade (export repo/hasher cho module identity dùng chung instance)           |
| C-5 | Gate đầy đủ (Docker, container, Compose, audit đúng lockfile, checkout sạch, OpenAPI, HTTP/SMTP live), sửa tham chiếu R-12, ghi rõ việc chưa chạy | Bảng gate G1–G10; runner live mới có deadline + timeline; spec disposition R-12 → bước 2                                                                                            | Lượt 2 (Docker, container, CLI, audit, OpenAPI, R-02 26/0) + [evidence lượt 3](prototype/evidence/README.md#lượt-3) (G8 132/0 ×3, G10 22/22) | **Khép trong prototype.** GitHub Actions, PgBouncer/HA, SMTP thật chưa kiểm; PR chạy lại đủ G1–G10 |

## Điều kiện bắt đầu lát kế tiếp

- **1c đổi/đặt lại mật khẩu — bắt đầu code khi:** PR 1 (N-1) đã merge ở revision xác định và D1/D4 chạy lại PASS trên
  revision đó; R-02 giữ thời gian kết thúc có giới hạn; PR 2 (R-15) merge hoặc được dev chấp nhận hoãn có lý do; spec/plan
  1c riêng được dev khác review. Bài học cho spec 1c: đổi credential + thu hồi phiên/token + audit trong **một**
  `TransactionRunner.run`; băm ngoài transaction và **sau** khi tra token (R-09); test stall giữa transaction như
  `database-stall`. Thiết kế 1c có thể bắt đầu ngay.
- **Tra cứu Audit Trail:** thiết kế ngay (chỉ đọc). Code sau PR 1 để dữ liệu audit của các workflow ghi đáng tin.
- **G2:** thiết kế khi Docs có commit chia sẻ cho BRD 3.38/`QĐ-70` và pin snapshot mới; refine JobTitle (R-10), I-2
  (R-11, `QĐ-70c`), `US-02-07`. Code G2 sau PR 1 và PR 3 và spec/plan/migration G2 được review.
- **Chuyển giao/khôi phục Super Admin, vai suy ra:** chờ phần G2 tương ứng; test service-level R-08 đã có.
- **CLI production (R-13):** runbook vận hành CLI dùng env tối thiểu sau PR 5.
- Không cần hoàn tất toàn bộ G1 trước phần G2 đã đủ điều kiện; không gói nào được coi là production-ready.

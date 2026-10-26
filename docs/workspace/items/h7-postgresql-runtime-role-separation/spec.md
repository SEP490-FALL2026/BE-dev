# Spec: tách vai PostgreSQL bootstrap / deploy / runtime (H7 — `F-15`, `DB-04`, `Q9`)

- Phụ trách: AI theo giao việc (Prompt 01 của `Prompts/BE-stabilization-and-g0-g6-review-2026-10-25/`, 25/10/2026).
- Thiết kế ban đầu bởi: Owner — `Q9` (18/10/2026: runtime role riêng không superuser, migration/deploy role riêng, kiểm trên
  môi trường cô lập) và Prompt 01 (25/10/2026); AI chốt thiết kế chi tiết.
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (pin hiện hành của [sources](../../sources.md); hạng mục không đọc hay đổi nghiệp vụ, không
  Story/AC), BE `3aa0857` (`dev = origin/dev`, cây sạch; `eacdbfa` = checkpoint Prompt 26A + 00A, cộng `3aa0857` của Owner
  chỉ sửa hai workflow CI/CD).
- Nhóm roadmap: xuyên module — `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · Nguồn finding: [audit nền tảng `F-15`/`Q9`](../../../reviews/be-foundation-audit-2026-10-18/README.md),
  [hậu merge G0→G4 `DB-04`](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md),
  [handoff H7](../foundation-remediation-handoff-2026-10-18/plan.md#task-20-hạng-mục-h7--role-postgresql).

## Business outcome

Sau lát này API và worker production đăng nhập PostgreSQL bằng một **runtime role** chỉ có quyền DML trên bảng của ứng dụng;
migration, preflight và sao lưu chạy bằng **deploy role** sở hữu schema nhưng không phải superuser; tài khoản superuser của
cluster (`POSTGRES_USER`) chỉ dùng để khởi tạo/sửa vai. Superuser hay owner không thể lọt vào API/worker: tiến trình từ chối
khởi động. Kiểm được bằng truy vấn catalog và thao tác bị từ chối trên PostgreSQL 17 cô lập, không chỉ bằng việc app chạy.

## Sizing decision

- Container: H7 của [handoff 18/10/2026](../foundation-remediation-handoff-2026-10-18/spec.md) — `F-15`, `DB-04`, quyết định
  Owner `Q9`, mở lại ngày 25/10/2026 (`H7-DEC-01`).
- Mode: `technical-enabler`.
- Outcome and owner: danh tính PostgreSQL của từng tiến trình và quyền tối thiểu của nó; sở hữu
  `src/infrastructure/database/roles/` (lệnh `ops:db-roles`), kiểm tra danh tính khi khởi động của API/worker,
  `docker-compose.prod.yml`, `.github/workflows/deploy.yml` và runbook ở [containers](../../../guides/containers.md).
- Boundaries: không đổi route, DTO, status, mã lỗi, OpenAPI, Prisma model hay migration đã có; không đổi hành vi nghiệp vụ.
  Quyền được cấp bằng lệnh provisioning có thể review lại, **không** bằng migration (migration không biết tên vai và phải chạy
  được trên database của integration harness, nơi không có vai nào).
- Not larger: không merge G5/G6, không review G0–G6, không Prompt 27, không deploy VPS thật, không đổi local Compose/dev seed,
  không thêm vai backup riêng (deploy role đủ cho `pg_dump`, xem _Ma trận lệnh_), không RLS.
- Not smaller: wiring Compose, pipeline deploy, provisioning và kiểm tra khởi động phải đổi cùng lúc — đổi một phần thì hoặc API
  vẫn là superuser, hoặc deploy gãy vì migration/preflight còn chạy bằng URL của API.
- Siblings: none.
- Scope map: n/a

## Primary Story/AC

| Story | AC                          | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                    |
| ----- | --------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | `F-15`, `DB-04`, `Q9`, `H7` | n/a      | gỡ chặn review merge G5/G6 ([g4-request-and-transfer-integration](../g4-request-and-transfer-integration/spec.md), Prompt 02: code mới chạy được bằng runtime role, migration mới không nêu tên vai); rollout thật trên VPS do Owner làm theo runbook |

## Supporting references

- `INV-05` (Audit Trail chỉ ghi thêm) — trigger `audit_events_no_update_delete`/`audit_events_no_truncate` của migration
  `20261012091936_audit_foundation`. Superuser hay owner tắt được trigger (`session_replication_role`, `DISABLE TRIGGER`);
  runtime role thì không.
- [ADR-0005](../../../decisions/0005-database-constraints-outside-prisma.md) (ràng buộc ở CSDL), [DB-05 sao lưu trước
  migration](../delivery-gate-hardening/spec.md), [P28-01 preflight](../g0-g4-checkpoint-fix-forward/spec.md),
  [operational commands](../../../rules/operational-commands.md).

## Explicit out of scope

- Rollout trên VPS thật, đổi `.env` thật, xoay mật khẩu thật: Owner làm theo runbook ở containers.md.
- Vai backup/read-only riêng, vai cho ứng dụng khác trên cùng cluster, PgBouncer/pooler, RLS, TLS tới PostgreSQL.
- Repo FE/Mobile, Docs authoritative, G5/G6, Prompt 27.

## Dependencies and blockers

- Không cần migration mới: quyền không thuộc schema; quyền sở hữu đối tượng cũ được chuyển bằng lệnh provisioning.
- Rollout cần thao tác tay của Owner **trước** khi merge vào `main` (job deploy chạy tự động sau CI trên `main` từ `3aa0857`):
  thiếu biến vai trong `.env` hay thiếu `.env.app` thì deploy dừng ở bước kiểm tra đầu, file live và container đang chạy không
  bị đụng (Prompt 01A: ứng viên nằm ở `releases/<sha>/`, file live chỉ bị thay sau mọi bước trước recreate).

## Mô hình đe dọa

| Mối đe dọa                                                                           | Hệ quả trước H7                                                                                                  | Biện pháp                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lỗi injection/logic trong API/worker chạy câu lệnh tùy ý                             | Superuser: đọc/ghi file server, `COPY … TO PROGRAM`, tạo role, tắt trigger bất biến (`INV-05`), đọc mọi database | Runtime role chỉ DML trên bảng ứng dụng; không DDL, không quyền cluster, không sở hữu đối tượng                                                            |
| Lộ biến môi trường của container API/worker (log, `docker inspect`, dump tiến trình) | Lộ mật khẩu superuser cluster (`env_file: .env` mang `POSTGRES_PASSWORD`)                                        | API/worker nhận `.env.app` không chứa thông tin quản trị CSDL; ứng dụng từ chối khởi động khi thấy biến quản trị                                           |
| Cấu hình sai đưa URL quản trị vào API/worker                                         | Không ai phát hiện                                                                                               | Khởi động production kiểm danh tính bằng catalog: superuser, owner, có membership, thuộc tính nâng cao, `session_replication_role` khác `origin` ⟹ từ chối |
| Migration/preflight/backup vô tình dùng URL runtime hoặc superuser                   | Một URL cho mọi bước                                                                                             | Service `migrate`/`backup` chỉ nhận deploy role; không fallback (`:?` của Compose, `env('DATABASE_URL')` của Prisma)                                       |
| Runtime sửa lịch sử migration                                                        | Có quyền                                                                                                         | Runtime không có quyền nào trên `_prisma_migrations`                                                                                                       |
| Hàm `SECURITY DEFINER` của owner chạy được bởi runtime (leo thang)                   | —                                                                                                                | Kiểm tra provisioning báo lỗi nếu schema `public` có hàm `SECURITY DEFINER`                                                                                |
| Mật khẩu vai lộ qua log server khi lệnh lỗi                                          | —                                                                                                                | Provisioning gửi verifier SCRAM-SHA-256 tính phía client; mật khẩu thô không rời tiến trình, lệnh không in URL/mật khẩu                                    |

## Ma trận vai

| Vai                              | Biến                                                | Thuộc tính                                                                              | Sở hữu / quyền                                                                                                                                                                                             |
| -------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap (cluster admin)        | `POSTGRES_USER`/`POSTGRES_PASSWORD` (đã có)         | superuser do image tạo                                                                  | chỉ dùng cho `ops:db-roles provision`, khôi phục bản sao lưu, sửa vai                                                                                                                                      |
| Deploy (`slm_deploy` mặc định)   | `DATABASE_DEPLOY_USER`/`DATABASE_DEPLOY_PASSWORD`   | `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, không membership | owner database ứng dụng (⟹ owner schema `public` qua `pg_database_owner`) và mọi bảng/hàm/kiểu trong `public`; tạo extension trusted (`btree_gist`)                                                        |
| Runtime (`slm_runtime` mặc định) | `DATABASE_RUNTIME_USER`/`DATABASE_RUNTIME_PASSWORD` | như deploy, không membership, không role setting                                        | `CONNECT` database; `USAGE` schema `public`; `SELECT, INSERT, UPDATE, DELETE` mọi bảng `public` trừ: `_prisma_migrations` (không gì), `audit_events` (`SELECT, INSERT`); `USAGE` sequence; không sở hữu gì |

PUBLIC mất `CONNECT`/`TEMPORARY` trên database ứng dụng và `USAGE` trên schema `public`; quyền `EXECUTE` mặc định của hàm giữ
nguyên (trigger và `pg_advisory_xact_lock`, `set_config` cần nó). Default privileges `FOR ROLE <deploy> IN SCHEMA public` cấp DML
cho runtime trên bảng mới và `USAGE` trên sequence mới, nên migration kế tiếp không làm gãy runtime; `ops:db-roles reconcile`
sau mỗi migration thu lại phần ngoại lệ (`_prisma_migrations`, `audit_events`).

## Ma trận lệnh và đường đi thông tin đăng nhập

Kiểm kê từ code (`$queryRaw`/`$executeRaw`, `FOR UPDATE`/`FOR SHARE`, `pg_advisory_xact_lock`, `set_config`, trigger của 47
migration) và từ wiring hiện tại (`docker-compose.prod.yml`, `deploy.yml`).

| Lệnh                           | Trước H7                                                                     | Sau H7                                                                                                       | Quyền thật sự cần                                          |
| ------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Khởi tạo/sửa vai               | không có                                                                     | `ops:db-roles provision` trong service `db-admin` (profile `admin`), bootstrap                               | `CREATE/ALTER ROLE`, đổi owner, GRANT                      |
| Sao lưu trước migration        | `pg_dump -U "$POSTGRES_USER"` trong container `postgres` (socket, superuser) | `pg_dump` trong service `backup` (image `postgres:17-alpine`, profile `deploy`), deploy role qua TCP + SCRAM | đọc mọi bảng (owner)                                       |
| Preflight (`ops:preflight`)    | `run api` ⟹ URL của API (superuser)                                          | `run migrate` ⟹ deploy role, phiên chỉ đọc                                                                   | đọc `_prisma_migrations` và bảng                           |
| `prisma migrate deploy`        | `run api` (superuser)                                                        | `run migrate` (deploy)                                                                                       | DDL của owner, `CREATE EXTENSION` trusted                  |
| Đối soát quyền sau migration   | không có                                                                     | `ops:db-roles reconcile` trong `run migrate`                                                                 | GRANT/REVOKE trên đối tượng mình sở hữu                    |
| API                            | superuser                                                                    | runtime                                                                                                      | DML, khóa dòng (cần `UPDATE`), advisory lock, `set_config` |
| Worker                         | superuser                                                                    | runtime                                                                                                      | DML trên outbox                                            |
| `ops:inspect`                  | tùy người chạy                                                               | `run migrate` (deploy, phiên chỉ đọc)                                                                        | đọc `_prisma_migrations` — runtime không có quyền này      |
| `ops:bootstrap`, `ops:recover` | tùy người chạy                                                               | `run api` (runtime)                                                                                          | DML, advisory lock                                         |
| `dev:seed`                     | local                                                                        | không đổi (chỉ loopback, `NODE_ENV` development/test)                                                        | —                                                          |
| Khôi phục bản sao lưu          | bootstrap                                                                    | bootstrap, rồi `provision` lại cho database khôi phục                                                        | `createdb`, `pg_restore`                                   |
| Integration harness            | `ci_integration` (`CREATEDB`)                                                | không đổi; suite H7 dùng thêm `TEST_DATABASE_BOOTSTRAP_URL` (superuser của server test cô lập)               | test-admin, không phải quyền runtime                       |

## Ownership: module, data, API

- Hạ tầng, không module nghiệp vụ: `src/infrastructure/database/roles/` (chỉ lệnh `ops:db-roles` tới được — thư mục chỉ-lệnh
  của `operational-commands.spec.ts`), `src/infrastructure/database/database-role-judgement.ts` (phán định thuần, dùng chung
  với kiểm tra khởi động), `src/infrastructure/database/runtime-role.{guard,module}.ts` (chỉ `AppModule`/`WorkerModule`
  import), entry `src/database-roles-cli.ts`.
- Dữ liệu: không bảng, không migration, không Prisma model mới. Lệnh đọc catalog PostgreSQL và đổi vai, owner, ACL, default
  privileges; không đụng dữ liệu nghiệp vụ, không Audit Trail (quản trị vai không phải hành động nghiệp vụ).
- API: không route, DTO, status, mã lỗi hay OpenAPI nào đổi. Lệnh mới ngoài HTTP: `pnpm ops:db-roles`.
- Không Nest submodule nghiệp vụ mới; `RuntimeDatabaseRoleModule` là module hạ tầng có vòng đời riêng (điều kiện 2 của
  [module structure](../../../rules/module-structure.md#khi-nào-folder-trở-thành-nest-submodule)).

## Behavior and design

### Lệnh `pnpm ops:db-roles` (`src/database-roles-cli.ts`)

- `provision` — nối bằng `DATABASE_BOOTSTRAP_URL` (phải là superuser), đọc tên vai và mật khẩu từ `DATABASE_DEPLOY_URL`,
  `DATABASE_RUNTIME_URL`. Bộ ba được kiểm như một tập: cùng host/cổng/database, ba tên vai khác nhau và hợp lệ (không `pg_`),
  mật khẩu deploy/runtime ≥ 32 ký tự ASCII in được, khác nhau và khác mật khẩu bootstrap, URL không có query/fragment. Một
  transaction (`lock_timeout` có hạn): tạo hoặc chỉnh vai về đúng thuộc tính, đặt mật khẩu bằng verifier SCRAM, chuyển owner
  database và mọi bảng/view/sequence/hàm/kiểu của `public` (trừ thành viên extension) sang deploy, rồi đối soát quyền như
  `reconcile`, rồi kiểm tra; kiểm tra còn lỗi ⟹ `ROLLBACK`. Từ chối (exit 2, không đổi gì): bootstrap không phải superuser, vai
  đã tồn tại mang thuộc tính nâng cao, vai có membership (cả hai chiều) hay role setting. Chạy lại là idempotent (đặt lại mật
  khẩu = xoay mật khẩu).
- `reconcile` — nối bằng `DATABASE_URL` của deploy role, `DATABASE_RUNTIME_ROLE` là tên runtime role. Kiểm người gọi là owner
  database và không phải superuser; cấp lại quyền đối tượng/default privileges và thu ngoại lệ trong một transaction; rồi kiểm
  tra. Đối tượng `public` không thuộc deploy role (ví dụ ai đó migrate bằng superuser) ⟹ exit 2, phải chạy `provision`.
- `verify` — như `reconcile` nhưng phiên chỉ đọc, không đổi gì; dùng cho runbook.
- Báo cáo chỉ in tên vai, số đối tượng, mã finding; không in URL hay mật khẩu. Exit: 0 xong/nhất quán · 1 lỗi (env, kết nối,
  SQL) · 2 bị từ chối/không nhất quán.

Kiểm tra (dùng chung cho cả ba lệnh, hàm thuần trên facts đọc từ catalog): thuộc tính và membership của hai vai; deploy là owner
database; không đối tượng `public` nào thuộc vai khác; quyền **hiệu lực** của runtime trên từng bảng đúng bằng tập mong đợi
(`has_table_privilege`, gồm cả PUBLIC); sequence chỉ `USAGE`; schema `USAGE` không `CREATE`; database `CONNECT` không
`CREATE`/`TEMPORARY`; default privileges của deploy role đủ; không hàm `SECURITY DEFINER` trong `public`.

### Kiểm tra danh tính khi API/worker khởi động

`RuntimeDatabaseRoleModule` (chỉ `AppModule` và `WorkerModule` import) chạy ở `onModuleInit` — trước mọi
`onApplicationBootstrap` (vòng gửi thư, sweeper) — khi `NODE_ENV=production`: đọc catalog cho `current_user` và từ chối khởi
động nếu là superuser, có `CREATEDB`/`CREATEROLE`/`REPLICATION`/`BYPASSRLS`, có membership, sở hữu database hay bất kỳ đối tượng
nào, hoặc `session_replication_role` khác `origin`. Ngoài production không chạy (integration harness nối bằng owner của database
tạm). Lệnh vận hành không import module này: preflight/inspect/migrate chạy bằng deploy role có chủ đích.

`validateEnvironment` (API, worker, `ops:recover`) ở production từ chối khi môi trường có `POSTGRES_PASSWORD`,
`DATABASE_BOOTSTRAP_URL`, `DATABASE_DEPLOY_URL` hoặc `DATABASE_DEPLOY_PASSWORD` (chỉ nêu tên biến).

### Compose production và pipeline deploy

- `.env` (cạnh compose, Compose đọc để nội suy) giữ `POSTGRES_*`, `DATABASE_DEPLOY_*`, `DATABASE_RUNTIME_*`, `DOMAIN`, `PORT`;
  `.env.app` (mới) giữ cấu hình ứng dụng; API/worker dùng `env_file: .env.app` và `DATABASE_URL` dựng từ biến runtime. Mật khẩu
  bắt buộc (`${…:?}`): thiếu một biến thì mọi lệnh Compose dừng trước khi làm gì.
- Service mới, đều có profile nên `up` không chạy: `migrate` (`deploy`, image API, `DATABASE_URL` deploy +
  `DATABASE_RUNTIME_ROLE`, không `env_file`), `backup` (`deploy`, `postgres:17-alpine`, `PG*` của deploy role), `db-admin`
  (`admin`, image API, ba URL, lệnh `provision`).
- `deploy.yml` (Prompt 01A H7-OPS-02, Prompt 01B H7-OPS-RV-02) có hai chế độ: `publish-only` (thủ công, mặc định) build và
  push `<image>:<full sha>` của đúng commit, không job nào chạm VPS; `deploy` (sau CI trên `main` hoặc thủ công) push cùng
  image, copy ứng viên — compose, Caddyfile, `scripts/ops/deploy-release.sh` — vào `<app dir>/releases/<sha>/`, chạy script
  đó với image bất biến, và **chỉ sau khi script thành công** bước cuối của job mới gắn `latest` (`docker buildx imagetools
create` từ tag commit). Build không gắn `latest` ở chế độ nào; job `deploy` có `concurrency` (`production-deploy`, không
  hủy lượt đang chạy) — chỉ xếp hàng các job của workflow, không biết lệnh chạy tay trên host. `latest` = release cuối cùng
  deploy thành công.
- Khóa host (H7-OPS-RV-07): ngay sau khi kiểm tham số — trước mọi lần đọc tệp của host, chiếm attempt hay gọi Docker —
  script mở `releases/.deploy.lock` trên fd 9 và lấy `flock -n` (không chờ), giữ tới khi script và mọi lệnh nó khởi chạy
  kết thúc: qua readiness, marker `releases/current-attempt` và toàn bộ đường khôi phục. Exit, lỗi, signal hay mất SSH ⟹
  kernel tự nhả; không có bước dọn khóa cũ, không suy luận từ PID; tệp khóa ở lại không chứng minh gì và không bao giờ bị
  xóa (xóa thì lượt sau khóa một tệp mới trong khi lượt đang chạy giữ tệp cũ). Deploy thứ hai — workflow hay tay, release
  /attempt bất kỳ — exit 2 trước mọi lệnh Docker, không chiếm attempt, không đổi gì; thông báo nêu điều người giữ tự ghi
  (pid, release, attempt, thời điểm: một dòng cố định ghi qua chính fd đã khóa, không mở lại đường dẫn, không credential).
  Thiếu `flock` (util-linux), tệp khóa là symlink/không phải tệp thường hoặc không mở được ⟹ exit 2. Workflow giữ
  `concurrency`; job bị từ chối thì lỗi, `latest` không đổi.
- Script (01A + 01B): tiền điều kiện (`.env`, `.env.app` có mặt và sạch biến CSDL) → `config --quiet` của ứng viên với
  `.env`/`.env.app` live → `caddy validate` Caddyfile **của ứng viên** (H7-OPS-RV-01: mount `${CADDYFILE_PATH:-./Caddyfile}`,
  script đặt `CADDYFILE_PATH` = `releases/<sha>/Caddyfile` cho mọi lệnh ứng viên, = file live cho lệnh live; output của Caddy
  bỏ đi vì log có thể mang giá trị env) → pull → `up --no-recreate postgres` → sao lưu qua `backup` → preflight, migrate,
  `reconcile` qua `migrate` của ứng viên. Lỗi tới đây: release live và container giữ nguyên.
- Release state (H7-OPS-RV-02) = cặp `docker-compose.prod.yml` + `Caddyfile` live và `releases/current-image`. Mỗi lượt deploy
  là một **attempt** do caller đặt (`--attempt`, workflow: `<run id>-<run attempt>`; H7-OPS-RV-05): script chiếm
  `releases/<sha>/attempts/<id>/` bằng một `mkdir` trước mọi lệnh Docker, từ chối id đã có, không bao giờ ghi lại hay xóa
  attempt cũ. Trước promote, trạng thái cũ (cả `releases/current-attempt` nếu có) được giữ ở
  `releases/<sha>/attempts/<id>/replaced/` và image trước được ghi nhận (`current-image`, hoặc image của container `api` —
  chạy hay dừng — trên host deploy trước khi có tệp này); mỗi tệp đổi bằng một rename; rồi recreate `api`/`worker`/`caddy`.
- Readiness (H7-OPS-RV-04): `up -d` exit 0 chưa phải thành công. Trong hạn 120 s (thăm dò mỗi 2 s) phải có một lần nhìn mà
  mỗi service `api`/`worker`/`caddy` có đúng một container, `running`, không restarting; `api`/`worker` chạy đúng
  `$API_IMAGE`; sha256 `/etc/caddy/Caddyfile` trong Caddy bằng `Caddyfile` live; `/<API_PREFIX>/v1/health/ready` gọi từ trong
  container API trả 2xx (endpoint thật, không đổi). Sau đó quan sát 20 s: mọi lần nhìn cùng container id, cùng restart
  count, vẫn ready. Ba giá trị có tùy chọn (`--ready-timeout`, `--stability-window`, `--poll-interval`, có giới hạn trên);
  workflow dùng mặc định. Mỗi lệnh Docker của lần nhìn có `timeout`.
- Lỗi sau khi promote bắt đầu (rename, recreate, readiness, ghi marker): đưa trạng thái cũ về trọn (không bao giờ nửa cũ
  nửa mới); nếu container mới đã được tạo thì thử **một** lần (tối đa 300 s) recreate bằng image trước; rồi kiểm release
  trước **đúng như** release mới. Luôn exit 1, in hai kết luận riêng: `RESULT: release … FAILED while <bước>` và `RECOVERY:`
  _ready_ / _FAILED_ / _not possible_ — lệnh khôi phục exit 0 mà release cũ không ready thì vẫn là `RECOVERY: FAILED`.
  Không rollback migration: database giữ migration, dump trước migrate là đường về của dữ liệu.
- Khi nào đổi: `releases/current-image` đổi lúc promote (trước recreate), lỗi thì được đưa về; `releases/current-attempt`
  (marker attempt thành công, nội dung `releases/<sha>/attempts/<id>`) chỉ đổi **sau** readiness, bằng một rename, và chỉ
  attempt mà `replaced/` của nó là release trước release live (deploy lại chính release đang live giữ marker cũ); ghi lỗi
  ⟹ coi là release lỗi và khôi phục như trên. `latest` đổi cuối cùng, ở bước workflow sau khi script exit 0.
- Lần rollout H7 đầu (H7-OPS-RV-06): `--first-rollout-env <tệp>` chỉ nhận một tệp thường, không symlink, nằm **trực tiếp**
  trong thư mục ứng dụng, khác `.env`/`.env.app`, và chỉ khi chưa có `releases/current-image` (chưa có release nào của
  script này); sai ⟹ exit 2 trước mọi lệnh Docker. Lỗi sau khi promote bắt đầu: giữ `.env` của H7 thành
  `.env.h7-<attempt>` (0600, cạnh nó, không bao giờ trong `releases/`), đặt tệp đó về `.env` bằng một rename (0600) **trước**
  khi recreate image cũ (kể cả khi lỗi ở rename: api/worker cũ đã bị runbook dừng), rồi kiểm release cũ. Thành công ⟹ `.env`
  và `.env.app` mới giữ nguyên. Lỗi trước promote: không đụng `.env`, script nói rõ và chỉ đường tay trong runbook.
- Dọn (H7-OPS-RV-03): script và workflow không xóa image, volume, container hay orphan (bỏ `docker image prune -f` và
  `--remove-orphans`); dọn là việc tay, theo tên chính xác (container/volume `slm-redis` cũ, image release cũ). Không
  `set -x`, không in credential.

### Cài mới, chuyển tiếp, xoay mật khẩu, rollback

- **Cài mới:** `up postgres` → `provision` (bootstrap) → migrate + `reconcile` (deploy) → API/worker (runtime) → `ops:bootstrap`
  (runtime, qua `run api`).
- **Hệ thống đang chạy** (đối tượng thuộc bootstrap): sao lưu → dừng API/worker → `provision` (chuyển owner, cấp quyền, một
  transaction) → `verify` → deploy bản H7. Không giả định volume mới; dữ liệu và `_prisma_migrations` giữ nguyên.
- **Xoay mật khẩu:** sửa `DATABASE_*_PASSWORD` trong `.env` → `provision` → recreate API/worker (deploy role dùng ở lần deploy
  sau).
- **Rollback cấu hình** (không rollback migration): deploy lại image và Compose trước H7 — nối bằng bootstrap như cũ, vẫn chạy
  vì superuser bỏ qua mọi quyền; vai và quyền sở hữu mới không cản. Gỡ hẳn vai (tùy chọn) bằng `REASSIGN OWNED BY <deploy> TO
<bootstrap>; DROP OWNED BY <deploy>; DROP OWNED BY <runtime>;` trong database ứng dụng rồi `DROP ROLE` cả hai; `provision`
  chạy lại được sau đó.

Lệnh, biến và runbook đầy đủ: [containers](../../../guides/containers.md#postgresql-roles-h7).

### Prompt 01A — môi trường test, setup migration, rollout an toàn

- **H7-VRF-01.** `ConfigModule` đọc `.env` theo cwd rồi chép mọi key thiếu vào `process.env`; một `.env` của dev (SMTP, URL
  test-admin) đổi được kết quả integration. Ranh giới chung: `NODE_ENV=test` ⟹ `ignoreEnvFile` cho cả hai bộ option của
  `env-config.ts`, `prisma.config.ts` không nạp dotenv; ngoài test giữ nguyên `import 'dotenv/config'` (kể cả
  `DOTENV_CONFIG_PATH`). Suite SMTP giả dùng `test/support/fake-smtp.ts` (đủ sáu biến), khôi phục `process.env`.
- **H7-RUN-01.** Mỗi suite từng chạy một Prisma CLI đầy đủ (≈ 119 lần mỗi lượt, 545 s ≈ 41 % thời gian, p50 4,1 s, max 9,5 s;
  một lần quá 60 s ở Prompt 01). Đo pha (kết nối, khởi động, lịch sử, áp, thoát, đóng pipe) bác giả thuyết engine giữ pipe
  (thoát → đóng 0 ms ở 119/119). Sửa: một deploy cho cả lượt vào database mẫu (`globalSetup`), mỗi suite nhận bản sao
  `CREATE DATABASE … TEMPLATE` khi database còn nguyên như lúc provision (không đối tượng ngoài marker, không session); còn
  lại đi CLI (`test/support/migration-deploy.ts`: tiến trình riêng, giới hạn 60 s giữ nguyên, lỗi nêu pha, không còn tiến trình
  hay session sau khi dừng). Không tăng giới hạn, không retry.
- **H7-OPS-02.** Xem _Compose production và pipeline deploy_ ở trên; runbook ghim `<IMAGE>:<SHA>`, giữ `.env.pre-h7` và image
  đang chạy để quay lại khi bước deploy lỗi lúc API/worker đang dừng. (Lịch sử Prompt 01: workflow chép đè Compose live lên
  host trước preflight — 01A đóng bằng ứng viên `releases/<sha>/`.)
- **H7-INC-01 (sự cố trong lượt chẩn đoán; lỗi code đã sửa ở 01A, tác động triage ở 01B).** Một bản sửa trung gian của
  `prisma.config.ts` (gọi `config()` của dotenv,
  bỏ qua `DOTENV_CONFIG_PATH`) làm ca _migrate thiếu `DATABASE_URL`_ của suite diễn tập — tiến trình con production chạy ở gốc
  repo — nạp `.env` thật của dev và `prisma migrate deploy` exit 0 trên database mà `DATABASE_URL` của `.env` đó trỏ tới (trên
  máy có PostgreSQL native lắng nghe `127.0.0.1:5432`; `.env` không được đọc nên database đó **chưa xác minh**). Sửa:
  `DOTENV_CONFIG_PATH` được tôn trọng lại; regression unit đỏ-trước; ca đó nay chạy từ thư mục rỗng với `--config` tuyệt đối
  và khẳng định không có dòng lịch sử migration nào. Tác động: xem _Prompt 01B_.

### Prompt 01B — triage sự cố, Caddy ứng viên, trạng thái release, dọn chính xác

- **H7-INC-01 — triage read-only (25/10/2026).** Kiểm tra tạm (ngoài repo) đọc `DATABASE_URL` của `.env` trong bộ nhớ, chỉ nhận
  PostgreSQL ở đúng `localhost`/`127.0.0.1`, không query/fragment, rồi mở phiên `default_transaction_read_only=on` + `BEGIN READ
ONLY`; chỉ đọc danh tính (che bằng hash), phiên bản, trạng thái recovery, catalog và `_prisma_migrations` (tên, checksum,
  thời điểm, số bước; không đọc `logs`, không đọc dòng nghiệp vụ). Ghi thử `CREATE TEMP TABLE` trong cùng phiên bị
  PostgreSQL từ chối `25006`. Kết quả: PostgreSQL 17.7 native, không recovery, vai không phải superuser; 47/47 migration
  khớp tên và checksum với thư mục đã commit (44 dạng CRLF của cây Windows, 3 LF), không thiếu/thừa/lỗi/rollback; 40
  migration xong ngày 22/10/2026, **7 migration được áp lúc 12:28:47Z 25/10/2026** — trong cửa sổ của bản `prisma.config.ts`
  lỗi (12:20:28Z–12:50:45Z) — `20261022100000` → `20261023110000`. Phân loại **`APPLIED_EXPECTED_MIGRATIONS`**. Tác động theo
  SQL đã commit (không đọc dữ liệu): ba migration chỉ đổi trigger/hàm/bảng mới rỗng; `20261022100000` đổi kiểu
  `reporting_currency` + FK (có guard); `20261022130000` thêm giá trị enum `EXPIRED` (không đảo được) và backfill
  `final_object_key`; `20261022120000` chuyển assignment SERVICE từ Cost Center COMPANY sang Unit, **xóa Cost Center COMPANY
  không còn tham chiếu** (guard chứng minh) và bỏ giá trị enum `COMPANY`; `20261023100000` có thể sửa owner SERVICE kèm dòng
  `audit_events` SYSTEM. Không rollback, không sửa dữ liệu. **Owner disposition 25/10/2026: chấp nhận** database dev ở trạng
  thái này (cùng migration đã commit mà lần migrate kế của dev cũng áp) và cho làm tiếp 01B. Đóng bằng quyết định Owner, không
  phải `NO_OP`.
- **H7-OPS-RV-01.** Với `--project-directory <app dir>`, mount `./Caddyfile` của Compose ứng viên trỏ Caddyfile live (đo trên
  Compose thật); Caddyfile ứng viên chưa từng được kiểm. Sửa: mount `${CADDYFILE_PATH:-./Caddyfile}` + `caddy validate` của ứng
  viên trước sao lưu (xem trên).
- **H7-OPS-RV-02.** `latest` đổi lúc build, trước khi biết deploy thành công; rename/recreate lỗi để lại cặp tệp lẫn lộn và
  `current-image` sai. Sửa: `latest` sau deploy thành công, release state ba tệp + khôi phục (xem trên).
- **H7-OPS-RV-03.** `docker image prune -f` và `--remove-orphans` (xóa `slm-redis` cũ ngoài scope H7). Sửa: bỏ cả hai; gate cấm
  prune, `--remove-orphans`, `docker rm/rmi/... rm` và `rm` theo pattern trong đường deploy và runbook H7.

### Prompt 01C — readiness, rollback evidence theo attempt, environment của lần rollout đầu

- **H7-OPS-RV-04 (required, nâng từ Medium).** Script 01B coi `up -d` exit 0 là thành công: smoke 01B thấy release
  crash-loop vẫn được promote, ghi `current-image` và gắn `latest`. Sửa: kiểm readiness/ổn định có hạn sau recreate và sau
  khôi phục (xem _Compose production và pipeline deploy_); hết hạn, không 2xx, sai image, thiếu/thừa container, container
  bị thay hay restart ⟹ cùng đường khôi phục như recreate lỗi, exit khác 0, workflow không gắn `latest`.
- **H7-OPS-RV-05.** 01B xóa rồi ghi lại `releases/<sha>/replaced/` mỗi lượt: deploy lại cùng SHA xóa bằng chứng rollback của
  lượt trước, runbook không biết khôi phục từ bản nào. Sửa: thư mục theo attempt bất biến + marker `releases/current-attempt`;
  rollback trong runbook đọc marker và dùng đúng `releases/<sha>/attempts/<id>/replaced/`. scp-action không đặt `rm` (mặc định
  `false`; `overwrite` chỉ là cờ `tar --overwrite`, đã đối chiếu `action.yml` của `v0.1.7`), nên `attempts/` không bị xóa khi
  copy lại ứng viên.
- **H7-OPS-RV-06.** 01B khôi phục Compose/Caddy/image cũ nhưng chạy image trước H7 bằng `.env` mới (thiếu cấu hình ứng dụng
  đã chuyển sang `.env.app`), nên container cũ không lên cho tới khi Owner chép `.env.pre-h7` bằng tay. Sửa: tùy chọn
  `--first-rollout-env` (xem trên); runbook bước 7 truyền `--attempt <ATTEMPT> --first-rollout-env .env.pre-h7`, workflow
  không bao giờ truyền.

### Prompt 01D — khóa deploy phía host

- **H7-OPS-RV-07.** `concurrency` của GitHub chỉ serialize các job của workflow; lần rollout H7 đầu bắt buộc chạy script
  bằng tay trên VPS và operator nào cũng gọi được script trực tiếp. Script 01C không có khóa phía host: hai attempt khác id
  cùng sao lưu/migrate/promote/khôi phục được, còn kiểm container id trong readiness chỉ **phát hiện** một số race (còn cửa
  sổ sau lần nhìn cuối, trước khi ghi marker). Sửa: khóa host (xem _Compose production và pipeline deploy_). Runbook mô tả
  exit 2, lệnh kiểm không phá khóa `flock -n <APP_DIR>/releases/.deploy.lock true`, không xóa tệp khóa, giữ khóa trong shell
  khi khôi phục/rollback bằng tay, và giới hạn của khóa: bước 1–6 của runbook là thao tác tay ngoài script, còn workflow
  deploy của `main` trước H7 không có khóa ⟹ từ bước 1 tới bước 8 không merge/push `main`, không chạy workflow chế độ
  `deploy`.

### Prompt 02 — harness Windows đợi hết tiến trình của lượt (`H7-TEST-RV-08`)

- **Nguyên nhân (đo trực tiếp, 26/10/2026).** Test spawn launcher `bin/bash.exe` của Git; `spawnSync` trả về và sự kiện
  `exit` đến khi launcher thoát, trong khi tiến trình msys mà script khởi động có thể còn sống: `docker` giả dưới `timeout`
  nằm trong nhóm tiến trình riêng, ngoài tầm dừng-nhóm, và còn giữ tệp của thư mục tạm (tệp script `bin/docker` mà bash đang
  đọc, tệp output của lượt). Thí nghiệm: một con cháu ở nhóm của `timeout` sống thêm 2 s thì `spawnSync` vẫn trả sau ~80 ms;
  afterEach xóa thư mục khi tiến trình đó còn giữ tệp ⟹ `EPERM`.
- **Sửa (chỉ harness).** Mỗi lượt có thêm một pipe ở fd 3 (`TREE`), không ai đọc/ghi: mọi tiến trình của lượt — bất kể nhóm
  tiến trình hay output đi đâu — giữ một handle kế thừa của nó, nên pipe chỉ đóng khi tiến trình cuối của lượt kết thúc.
  `deploy()` (`spawnSync` đợi mọi pipe đóng), `finish()` và afterEach đợi tín hiệu đó (có hạn 60 s; quá hạn thì test đỏ với
  danh tính lượt, không kill hay xóa gì) **trước** khi xóa đúng thư mục của lượt; dừng lượt vẫn theo đúng PGID/PID đã ghi.
  Retry của `rmSync` giữ nguyên (không tăng), không nuốt `EPERM`, không sleep cố định. `deploy-release.sh`, workflow,
  Compose, ngữ nghĩa khóa production và runbook trùng byte.

## Test matrix

| Rủi ro                              | Tình huống                                                                                                                                                                                                                                          | Cấp test                                           | Kỳ vọng                                                                                                                | Bằng chứng |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- |
| Wiring cũ                           | Compose/deploy cho API/worker/migrate/backup dùng biến nào                                                                                                                                                                                          | unit gate (`deployment-roles.spec.ts`)             | đỏ trên `3aa0857`, xanh sau sửa                                                                                        | xem plan   |
| Thuộc tính, membership              | sau `provision`                                                                                                                                                                                                                                     | integration (PG 17)                                | đúng ma trận; không membership                                                                                         | xem plan   |
| Mọi migration chạy bằng deploy role | database rỗng                                                                                                                                                                                                                                       | integration                                        | 47 migration, `btree_gist`, ràng buộc loại trừ, trigger                                                                | xem plan   |
| Runtime bị từ chối                  | tạo database/schema/bảng/bảng tạm/extension/role, đổi owner, `DISABLE TRIGGER`, `session_replication_role`, `SET ROLE`, `pg_terminate_backend`, `pg_read_file`, `pg_reload_conf`, `COPY TO PROGRAM`, đọc `_prisma_migrations`, schema/database khác | integration                                        | SQLSTATE `42501`; `GRANT` của runtime không đổi ACL                                                                    | xem plan   |
| Runtime dùng được                   | DML, khóa dòng, advisory lock, bảng/sequence của migration giả lập tương lai                                                                                                                                                                        | integration                                        | thành công                                                                                                             | xem plan   |
| `INV-05`                            | runtime `UPDATE/DELETE/TRUNCATE audit_events`; deploy `UPDATE`                                                                                                                                                                                      | integration                                        | `42501`; trigger từ chối owner                                                                                         | xem plan   |
| API/worker                          | seed, đăng nhập, refresh, tạo tài khoản + audit, worker gửi thư — bằng runtime                                                                                                                                                                      | integration                                        | thành công                                                                                                             | xem plan   |
| Kiểm tra khởi động                  | runtime / deploy / bootstrap / runtime có membership                                                                                                                                                                                                | integration + unit                                 | chấp nhận / từ chối kèm lý do                                                                                          | xem plan   |
| Fail closed                         | provision thiếu/sai URL, bootstrap không phải superuser, vai có sẵn đặc quyền, membership; preflight/migrate thiếu/sai URL                                                                                                                          | integration (tiến trình con)                       | exit ≠ 0, không thay đổi, không in bí mật, không fallback                                                              | xem plan   |
| Idempotent                          | `provision`/`reconcile` lần hai                                                                                                                                                                                                                     | integration                                        | snapshot ACL/owner không đổi                                                                                           | xem plan   |
| Nâng cấp có dữ liệu                 | dữ liệu dưới wiring cũ → `provision` → deploy → runtime; rollback cấu hình; gỡ vai rồi provision lại                                                                                                                                                | integration                                        | số dòng và hash từng bảng, `_prisma_migrations` giữ nguyên                                                             | xem plan   |
| Test đọc `.env` (H7-VRF-01)         | `.env` thù địch ở cwd; thiếu URL test-admin; production thiếu `DATABASE_URL` với `DOTENV_CONFIG_PATH` không file                                                                                                                                    | unit + integration                                 | config test không đổi, `process.env` sạch; harness từ chối; Prisma config báo thiếu                                    | xem plan   |
| Setup migration (H7-RUN-01)         | bản sao mẫu so với deploy CLI; deploy treo qua relay; database đã dùng trước migrate                                                                                                                                                                | integration                                        | cùng lịch sử + catalog, 0 tiến trình Prisma; dừng đúng giới hạn, nêu pha, 0 tiến trình/session/database; đi CLI        | xem plan   |
| Rollout (H7-OPS-02)                 | `publish-only` không chạm VPS; ứng viên trước file live; lỗi ở mỗi bước trước recreate                                                                                                                                                              | unit gate + script (`docker` giả) + smoke Docker   | 0 SSH/SCP; file live giữ nguyên, không recreate; promote sau `reconcile`                                               | xem plan   |
| Caddy ứng viên (H7-OPS-RV-01)       | Caddyfile ứng viên hỏng, live hợp lệ; live hỏng, ứng viên hợp lệ                                                                                                                                                                                    | script (`docker` giả) + gate + smoke Docker        | dừng trước sao lưu, live giữ nguyên; kiểm đúng tệp ứng viên; không in env                                              | xem plan   |
| Release state (H7-OPS-RV-02)        | lỗi rename thứ nhất/thứ hai/`current-image`, recreate lỗi (khôi phục được / không); host mới; `latest`                                                                                                                                              | script (`docker`, `mv` giả) + gate + smoke         | ba tệp toàn cũ hoặc toàn mới; container về image trước; `latest` chỉ sau deploy thành công                             | xem plan   |
| Dọn chính xác (H7-OPS-RV-03)        | deploy thành công/lỗi có orphan                                                                                                                                                                                                                     | script + gate + smoke (orphan thật)                | không prune, không `--remove-orphans`, orphan và image cũ còn nguyên                                                   | xem plan   |
| Readiness (H7-OPS-RV-04)            | API không 2xx, sai image, worker crash-loop/restarting, Caddy exited/mount Caddyfile khác, container bị thay, thiếu/thừa container; khôi phục cũng không ready; hết hạn                                                                             | script (`docker` giả) + gate + smoke Docker        | exit 1, release trước về và được kiểm, `RESULT`/`RECOVERY` riêng; có hạn, không chờ mãi; `latest` không đổi            | xem plan   |
| Attempt (H7-OPS-RV-05)              | lần đầu của SHA; thử lại bằng attempt mới; dùng lại attempt id; rollback sau hai attempt; deploy lại release đang live; ghi marker lỗi                                                                                                              | script + gate + smoke Docker                       | attempt cũ trùng byte; id trùng bị từ chối trước Docker; marker chỉ sau readiness; rollback từ đúng attempt            | xem plan   |
| Environment rollout đầu (RV-06)     | image cũ hỏng với `.env` mới; release mới không ready; không có tùy chọn; lỗi rename; thành công; lỗi trước promote; nguồn không an toàn                                                                                                            | script + gate + smoke Docker (ranh giới thật)      | `.env` cũ về trước recreate, image cũ ready; thành công giữ env mới; không secret trong `releases/`/log                | xem plan   |
| Khóa host (H7-OPS-RV-07)            | lượt giữ dừng ở barrier sau khóa (trước thay đổi, trong readiness, ở marker, trong khôi phục), lượt khác release/attempt; lượt giữ bị kết thúc cưỡng bức; hai thư mục app; thiếu `flock`, tệp khóa là thư mục/symlink                               | script (barrier) + gate + smoke Linux `flock` thật | lượt sau exit 2 ngay, 0 lệnh Docker, không attempt, host trùng byte; xong/bị giết thì lượt kế lấy được, không dọn khóa | xem plan   |
| Dọn harness (H7-TEST-RV-08)         | một tiến trình của lượt ở nhóm `timeout` sống quá script ~2 s, qua `deploy()` và qua `start()`/`finish()`; ba lượt liên tiếp bảy ca khóa host, mỗi lượt `TEMP` riêng                                                                                | script (harness) từ PowerShell                     | đỏ trên harness cũ; xanh sau sửa; 0 tiến trình, 0 thư mục `slm-deploy-release-*` sót                                   | xem plan   |
| Sự cố `H7-INC-01`                   | database của `.env` dev, phiên read-only                                                                                                                                                                                                            | triage (ngoài repo)                                | phân loại có bằng chứng, ghi thử bị từ chối, không in URL                                                              | xem plan   |
| Image production                    | smoke Compose production: provision, backup, preflight, migrate, reconcile, API/worker bằng runtime; API bằng deploy/bootstrap bị từ chối                                                                                                           | smoke thủ công                                     | như trên; dọn sạch                                                                                                     | xem plan   |

## Definition of Done

- [ ] Test đỏ-trước/xanh-sau cho wiring và cho provisioning/kiểm tra khởi động.
- [ ] `pnpm check`, `pnpm test:e2e`, toàn bộ `pnpm test:integration` trên PostgreSQL cô lập, OpenAPI export trùng byte.
- [ ] Smoke image production và diễn tập nâng cấp; dọn 0 tài nguyên sót.
- [ ] containers.md (runbook), operational-commands, database rules, `.env.example`, test README, roadmap, tracker cập nhật.
- [ ] Không đổi route/OpenAPI/nghiệp vụ (bằng chứng hash).

## Changes and acceptance

Prompt 02 (26/10/2026, sau Owner commit H7 `471de5e` và merge G5/G6 `0da8f56`): `H7-TEST-RV-08` — harness đợi hết tiến trình
của lượt bằng pipe fd 3 trước khi xóa thư mục tạm (xem _Prompt 02_ ở trên và plan). Chỉ
`scripts/verify/deploy-release.test.mjs` đổi; script host, workflow, Compose, runbook trùng byte. `H7-OPS-01` vẫn mở.

Prompt 01D (26/10/2026): H7-OPS-RV-07 — khóa host `releases/.deploy.lock` cho mọi lượt `deploy-release.sh` (workflow và
runbook bước 7), xem _Prompt 01D_ ở trên và plan. Không đổi mã sản phẩm, Prisma, vai CSDL, harness integration hay môi
trường test (chỉ script host và test của nó, gate, comment workflow, runbook, tài liệu); `H7-OPS-01` vẫn mở.

Prompt 01C (25/10/2026): H7-OPS-RV-04 (nâng thành required), RV-05, RV-06 — xem _Prompt 01C_ ở trên và plan. Mô hình vai,
cô lập môi trường test, harness database mẫu, disposition `H7-INC-01` giữ nguyên; không đổi mã sản phẩm, Prisma, vai CSDL,
harness integration hay môi trường test (chỉ script host, workflow deploy, gate, runbook, tài liệu).

Prompt 01B (25/10/2026): triage `H7-INC-01` = `APPLIED_EXPECTED_MIGRATIONS`, Owner chấp nhận; H7-OPS-RV-01/02/03 đóng local.
Mô hình vai, cô lập môi trường test và harness database mẫu giữ nguyên (hai lượt full integration của 01A còn hiệu lực:
01B không đổi mã sản phẩm, Prisma, vai CSDL, harness hay môi trường test).

Prompt 01A (25/10/2026): correction trong cùng hạng mục — H7-VRF-01, H7-RUN-01, H7-OPS-02, sự cố H7-INC-01; mô hình vai, ma
trận quyền, default privileges, guard và redaction giữ nguyên. Chưa nghiệm thu. Quyết định cần Owner xem: ghi ở plan
(_Owner review_).

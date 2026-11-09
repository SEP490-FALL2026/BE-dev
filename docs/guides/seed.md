# Seed demo local và VPS

Một lệnh Nest `seed` dùng [fixture shared-demo-v3](../../src/cli/seed/fixture/shared-demo-v3/README.md). Nó có thể bootstrap tổ chức demo rồi ghi dữ liệu qua HTTP API bằng đúng vai. Reset chỉ nằm ở hai wrapper; không có endpoint seed và CI/CD không tự seed.

Các lệnh cũ `dev-seed`, `demo-dataset` và alias đã bỏ theo OD-S3. Cài đặt thật cho khách hàng vẫn dùng [bootstrap](bootstrap-installation.md).

## Hợp đồng CLI

```text
node dist/cli.js seed <check|plan|apply> --environment LOCAL_TEST|SHARED
  [--fixture shared-demo-v3] [--api-url <origin>]
  [--operator-reference <reference>] [--allow-bootstrap] [--super-admin-email <email>] [--secrets-stdin] [--json]
```

`--help` bắt đầu bằng `SEED_PROTOCOL 1`. Không có cờ xóa database trong CLI.

- `check` không cần API URL hay mật khẩu. Khi có `--secrets-stdin`, kiểm hai mật khẩu trước mọi đọc DB; không băm và không ghi. Dùng graph chỉ đọc, không đọc `_prisma_migrations`, nên chạy được bằng runtime role production.
- `plan` cần API URL, operator reference và stdin; đọc hiện trạng, có đăng nhập/đăng xuất nên có audit phiên.
- `apply` lấy khóa `seed:<fixture>:apply` trước khi đọc trạng thái. DB `EMPTY` chỉ được bootstrap khi có `--allow-bootstrap`, và chỉ sau khi `GET <api-url>/api/v1/health/ready` trả lời được: API không sẵn sàng thì exit 3, chưa ghi gì. Một từ chối **sau** khi bootstrap đã ghi tổ chức trả exit 1 (không phải 3) vì database đã đổi. Tổ chức hoàn chỉnh đúng fixture thì chạy tiếp; tổ chức khác hoặc dở dang bị từ chối. Không ghi đè bản ghi đã bị sửa khác fixture.

Stdin gồm đúng hai dòng, UTF-8 và LF:

```text
SUPER_ADMIN_PASSWORD=<mật khẩu do Owner chọn>
DEMO_ACCOUNT_PASSWORD=<mật khẩu do Owner chọn>
```

Không đưa mật khẩu vào argv. Chính sách Super Admin là policy credential hiện hành: 12–128 ký tự sau NFC, không trùng email đăng nhập. Mật khẩu demo dài 12–128 ký tự. Sai mật khẩu/định dạng trả `REFUSED<TAB>SECRETS<TAB><lý do>`, exit 3 và không có dòng `STATE`.

`check` trả giao thức TAB cố định. Dòng `SECRETS` in **trước** khi mở graph, nên vẫn có khi graph lỗi (exit 1); wrapper chỉ cho
reset sau một `check` exit 1 khi dòng này là `ok`:

```text
SECRETS<TAB>ok|not-checked
STATE<TAB>NOT_MIGRATED|EMPTY|INSTALLED|INCOMPLETE
ORGANIZATION<TAB><tên hoặc ->
FIXTURE_ORGANIZATION<TAB>yes|no
ENVIRONMENT<TAB>SHARED|LOCAL_TEST|UNKNOWN
COUNTS<TAB>departments=<n><TAB>accounts=<n>
```

Tên tổ chức được loại TAB/CR/LF khi in. `ENVIRONMENT` đọc từ audit bootstrap cũ nhất; thiếu/không nhận diện được thì `UNKNOWN`. Số phòng là số phòng active, không đếm nhân viên.

| Mã thoát | Ý nghĩa                                                          |
| -------- | ---------------------------------------------------------------- |
| 0        | `check`: EMPTY; `plan`: đã lập kế hoạch; `apply`: đã ghi         |
| 2        | `check`: INSTALLED/INCOMPLETE; `apply`: không còn gì cần ghi     |
| 3        | Bị từ chối trước khi ghi; `check` cũng dùng 3 cho NOT_MIGRATED   |
| 4        | Dataset xung đột hoặc có bước bị chặn                            |
| 1        | Lỗi, hoặc từ chối sau khi bootstrap đã ghi; xem các bước đã xong |

## Local trên Windows, Linux hoặc macOS

1. Copy [.env.seed.local.example](../../.env.seed.local.example) thành `.env.seed.local` ở gốc repo. Điền `DATABASE_URL` của DB local do bạn sở hữu, hai mật khẩu seed và mọi secret development bắt buộc của API/worker được liệt kê trong template. Không commit file này.
2. Bắt buộc `NODE_ENV=development`; không nhận `test` vì ứng dụng có cơ chế chọn DB test riêng. URL phải parse ra `localhost`, IPv4 127.0.0.0/8 hoặc `::1`; query ghi đè host bị từ chối. `PORT` mặc định 3000, timeout ready mặc định 120 giây.
3. Dừng `pnpm start:dev` và `pnpm start:worker`. Wrapper từ chối nếu cổng API đang trả lời, để watch không xóa/ghi lại `dist` trong lúc seed.
4. Chạy:

```powershell
pnpm seed:local
```

Wrapper build khi `dist/cli.js` thiếu/cũ hơn `src` hoặc `prisma`, chạy `check` với hai mật khẩu qua pipe, rồi hiện tên database, host, cổng, tổ chức, môi trường và số đếm nếu đã có dữ liệu:

- Enter: thoát 0, không đổi dữ liệu.
- Gõ đúng tên database: reset schema bằng Prisma, áp migration rồi seed lại.
- `c`: chạy tiếp, chỉ khi `INSTALLED` và đúng tổ chức fixture.
- Database đã cài (`INSTALLED`/`INCOMPLETE`) mà `ENVIRONMENT` khác `LOCAL_TEST` (`SHARED` hay `UNKNOWN`): từ chối cả reset lẫn chạy
  tiếp, exit 3. URL loopback vẫn có thể là tunnel SSH tới database dùng chung.
- Check lỗi không đọc được schema (exit 1): chỉ cho reset có xác nhận, và chỉ khi dòng `SECRETS` là `ok`; không cho chạy tiếp.
- Mật khẩu sai/định dạng sai: in dòng `REFUSED` của `check` (không chứa mật khẩu), exit 3.
- EMPTY/NOT_MIGRATED: không cần reset; luôn áp migration trước apply.

Tự động hóa có thể dùng `--continue` hoặc `--confirm-reset <tên database>` (nhận cả `pnpm seed:local -- --continue`); không có cờ bỏ qua các chốt. Wrapper khởi động API/worker riêng, chờ ready, gọi `seed apply --allow-bootstrap`, rồi dừng các tiến trình của nó cả khi lỗi hoặc nhận tín hiệu (Ctrl+C: exit 130). Lệnh con nào lỗi thì wrapper in tên bước và mã thoát; stderr của tiến trình con hiện thẳng ra terminal. Môi trường con dùng file cấu hình tường minh và `DOTENV_CONFIG_PATH`; biến consent Prisma, hai mật khẩu seed và `SEED_READY_TIMEOUT_SECONDS` bị loại khỏi môi trường con (mật khẩu chỉ đi qua stdin).

**Owner chạy lượt reset thật.** Phiên implement chỉ chạy test giả; chưa chứng minh một lượt reset local thực tế.

## VPS demo đã có release mới

Owner copy script từ checkout **đúng commit đang deploy**, vì CD chỉ chép Compose, Caddyfile và deploy-release:

```bash
scp scripts/ops/seed.sh .env.seed.example <demo-host>:/opt/slm/backend/
```

Trên VPS, copy template thành `.env.seed`, điền operator reference và hai mật khẩu, đặt quyền 600. `SEED_SUPER_ADMIN_EMAIL`
(tùy chọn, Owner 04/11/2026) là email đăng nhập và email công việc của Super Admin mà lượt bootstrap tạo trên DB trống; để
trống thì dùng `system.admin@saoviet.example` của fixture. Mật khẩu Super Admin phải khác email này. DB đã cài giữ nguyên
Super Admin đang có (đổi email sau đó: `ops:recover reset-credentials --new-login-email`). Wrapper local đọc cùng khóa từ
`.env.seed.local`. `SEED_ALLOW_RESET=false` là mặc định; chỉ đổi thành `true` khi Owner chủ động cho phép reset DB demo. Script đọc file như dữ liệu, không `source` hay thực thi giá trị.

```bash
chmod 600 /opt/slm/backend/.env.seed
bash /opt/slm/backend/seed.sh --app-dir /opt/slm/backend --config /opt/slm/backend/.env.seed
```

`PORT` và `POSTGRES_DB` lấy từ `.env` của app-dir, và `POSTGRES_DB` phải trùng giá trị container `postgres` đang chạy (lệch thì exit 3: tạo lại container trước); image bất biến lấy từ dòng đầu của `releases/current-image` (thiếu/symlink thì exit 3). Mọi Compose call dùng đúng project-directory và Compose file ở app-dir. Mọi `run` có `-T`; lệnh không đọc stdin nhận `</dev/null`; mật khẩu chỉ qua stdin.

Script giữ `flock -n` trên `releases/.deploy.lock` suốt lượt, mở file như [deploy-release.sh](../../scripts/ops/deploy-release.sh) (file thường, không qua symlink, không xóa nội dung) và ghi một dòng người giữ khóa. Seed gặp khóa đang giữ thoát 3 và in dòng người giữ. **Một deploy CI/CD tới trong lúc seed sẽ dừng exit 2 tại khóa deploy của nó**; chờ seed xong rồi chạy lại deploy.

Trước khi hỏi reset, script kiểm protocol và mật khẩu. Quy tắc chọn Enter/database/`c` như local; VPS reset cần cả `SEED_ALLOW_RESET=true` và đúng tên `POSTGRES_DB`; `check` exit 1 chỉ cho reset khi dòng `SECRETS` là `ok`. Chạy tiếp không cần reset opt-in, nhưng không nhận tổ chức khác, INCOMPLETE hay một cài đặt không ghi `ENVIRONMENT=SHARED`. NOT_MIGRATED chạy migrate deploy, reconcile, tạo lại API/worker (`up -d --force-recreate`) và chờ ready trước apply, không đòi reset opt-in.

Thứ tự reset:

1. Dump custom bằng deploy role vào `backups/postgres/slm-pre-reseed-<UTC>.dump.partial`; dump rỗng hoặc `pg_restore --list` lỗi thì dừng, chưa xóa gì. Kiểm đạt mới bỏ hậu tố `.partial`.
2. Dừng API và worker.
3. Dùng cluster account trong container PostgreSQL để DROP/CREATE đúng database.
4. Provision bằng `db-admin`.
5. Áp migration bằng image hiện hành và deploy role.
6. Reconcile PostgreSQL roles.
7. Khởi động API/worker và chờ ready trong container (mặc định 180 giây, đổi bằng `--ready-timeout`).
8. Chạy seed apply bằng runtime role; in/lưu báo cáo trong `seed-reports/<UTC>-apply.txt`, owner-only: dòng đầu ghi giờ, image, database và phase; sau đó stdout lẫn stderr của apply; dòng cuối `exit <mã>`.

Lỗi (kể cả Ctrl+C/`SIGTERM`) sau khi bắt đầu DROP và trước khi API ready: API/worker bị dừng và script in phase đã xong cùng lệnh phục hồi dump; file `.partial` dở dang bị xóa. Reset đã xong (API ready) mà `apply` lỗi thì không in lệnh phục hồi: dịch vụ vẫn chạy, xem báo cáo rồi chạy lại với `--continue`. Không tự thử lại thao tác ghi. Apply giữ mã thoát 0/2/3/4/1. Script không xóa backup nào; retention giữ 10 bản mới nhất **mỗi loại** pre-migrate/pre-reseed và mọi bản dưới 30 ngày, bỏ qua tên lạ và `.partial`.

## Dựng lại VPS một lần trước release QĐ-95 — Owner thực hiện

DB demo cũ có tài khoản nhiều vai: migration một vai (`20261104120000_identity_one_role_per_account`) dừng lại khi gặp chúng, nên
deploy release QĐ-95 lên DB cũ sẽ đỏ. Thứ tự bắt buộc: **dọn DB bằng image cũ → deploy release mới → seed**. Không dùng `seed.sh`
mới với image cũ (image cũ không có `SEED_PROTOCOL 1`).

### Bước 1 — Dọn DB dưới image cũ đang chạy

Sau khi Owner commit quyết định ở repo Docs. Trên VPS, tại app-dir. `set -euo pipefail` làm một lệnh lỗi đóng luôn phiên SSH
tương tác: đó là chủ đích (dừng ngay khi lỗi). Kiểm tra sau bước này thì mở phiên mới hoặc gõ `set +euo pipefail`.

```bash
set -euo pipefail; umask 077
cd /opt/slm/backend
exec 9<>releases/.deploy.lock; flock -n 9   # giữ khóa deploy tới hết bước 1
export API_IMAGE="$(head -n 1 releases/current-image)"
compose() { docker compose --project-directory "$PWD" -f "$PWD/docker-compose.prod.yml" "$@"; }
```

Tùy chọn, khi cần giữ dữ liệu cũ: dump trước khi xóa (bỏ qua được nếu chủ động bỏ dữ liệu cũ; khi đó không phục hồi được).

```bash
DUMP="$PWD/backups/postgres/slm-pre-reseed-$(date -u +%Y%m%dT%H%M%SZ).dump"
mkdir -p backups/postgres
test ! -e "$DUMP" && test ! -e "$DUMP.partial"
compose run --rm --no-deps -T backup pg_dump --format=custom --no-owner --no-privileges > "$DUMP.partial"
test -s "$DUMP.partial"
compose run --rm --no-deps -T backup pg_restore --list < "$DUMP.partial" > /dev/null
mv -- "$DUMP.partial" "$DUMP"
```

Xóa, dựng lại và khởi động:

```bash
compose stop api worker
compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""'
compose run --rm -T db-admin
compose run --rm --no-deps -T migrate node node_modules/prisma/build/index.js migrate deploy
compose run --rm --no-deps -T migrate node dist/database-roles-cli.js reconcile
compose up -d api worker
```

Đầu ra đúng: `DROP DATABASE`, `CREATE DATABASE`; `ops:db-roles provision: DONE` (owner đổi sang deploy role, `findings: none`);
`All migrations have been successfully applied` với migration cuối **không** phải `…_identity_one_role_per_account` (đó là
image cũ); `ops:db-roles reconcile: DONE`, `findings: none`; postgres `Healthy`, api/worker `Started`.

Kiểm ready (container `Started` chưa phải API sẵn sàng) và DB trống, rồi mới nhả khóa:

```bash
compose exec -T api node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||3000)+"/"+(process.env.API_PREFIX||"api")+"/v1/health/ready").then(r=>{console.log(r.status);process.exit(r.ok?0:1)},e=>{console.log(e.message);process.exit(1)})'
compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from organizations"'
flock -u 9; exec 9>&-
```

Mong đợi `200` và `0`. Không ra `200`: xem `compose logs --tail=100 api`, giữ khóa tới khi sửa xong.

### Bước 2 — Deploy release QĐ-95 qua CI/CD

Merge vào `main` như thường lệ, chờ CI xanh và workflow deploy xong. DB trống mang lịch sử migration của release cũ nên preflight
không chặn; deploy áp migration một vai lên DB trống. Deploy gặp khóa đang giữ thì dừng exit 2: nhả khóa ở bước 1 rồi chạy lại.

### Bước 3 — Seed bằng `seed.sh` của release vừa deploy

Trên máy Owner, từ checkout **đúng commit vừa deploy** (CD không chép script này):

```bash
scp scripts/ops/seed.sh .env.seed.example <demo-host>:/opt/slm/backend/
```

Trên VPS (phiên Bash thường, không cần `set -e`):

```bash
cd /opt/slm/backend
cp .env.seed.example .env.seed && chmod 600 .env.seed
# điền SEED_OPERATOR_REFERENCE, SEED_SUPER_ADMIN_PASSWORD, SEED_DEMO_ACCOUNT_PASSWORD (12–128 ký tự);
# SEED_SUPER_ADMIN_EMAIL (tùy chọn) = email đăng nhập Super Admin, trống thì dùng email của fixture;
# SEED_ALLOW_RESET=true nếu muốn các lần sau reset bằng script
bash /opt/slm/backend/seed.sh --app-dir /opt/slm/backend --config /opt/slm/backend/.env.seed
```

DB `EMPTY` nên script không hỏi gì: kiểm protocol và mật khẩu, bootstrap tổ chức `Công ty Cổ phần Công nghệ Sao Việt` (phòng gốc `ADMIN`, Super Admin
theo `SEED_SUPER_ADMIN_EMAIL`, trống thì `system.admin@saoviet.example`) rồi nạp dataset qua API. Exit `0` là xong; `2` là không còn gì cần ghi; `3` bị từ chối trước khi ghi
(đọc dòng `refused:`); `4` xung đột dataset; `1` lỗi. Báo cáo: `seed-reports/<UTC>-apply.txt` (dòng đầu, toàn bộ output, dòng
`exit <mã>`).

### Bước 4 — Kiểm tra sau seed

- Đăng nhập Super Admin (`SEED_SUPER_ADMIN_EMAIL`, hoặc `system.admin@saoviet.example` khi để trống) bằng
  `SEED_SUPER_ADMIN_PASSWORD`; `/me.roles` = `["SUPER_ADMIN"]`.
- Đăng nhập vài tài khoản demo bằng `SEED_DEMO_ACCOUNT_PASSWORD` (email, vai, phòng ở [README fixture](../../src/cli/seed/fixture/shared-demo-v3/README.md));
  mỗi tài khoản có đúng một vai.
- Chạy lại bước 3 với `--continue`: exit `2` (không ghi thêm).

Lỗi ở bước nào: giữ nguyên trạng thái, gửi output và file trong `seed-reports/`; không tự xóa DB lần nữa trước khi xem nguyên nhân.

### Các lần sau

Chỉ cần bước 3 với `SEED_ALLOW_RESET=true`: script in tên DB và số đếm, hỏi gõ đúng tên database để xóa (`c` chạy tiếp, Enter thoát)
hoặc dùng `--confirm-reset <POSTGRES_DB>` để chạy không hỏi; luôn dump vào `backups/postgres/` trước khi xóa. Bước 1 không cần lặp lại.

### Phục hồi khi có dump

Lỗi sau DROP/CREATE mà có dump: giữ dịch vụ dừng, giữ dump, sửa nguyên nhân trước. Phục hồi theo cùng image/Compose project: dựng
lại database và provision, rồi dùng service backup (deploy role):

```bash
compose run --rm --no-deps -T backup sh -c 'pg_restore --exit-on-error --no-owner --no-privileges --dbname "$PGDATABASE"' < "$DUMP"
compose run --rm --no-deps -T migrate node dist/database-roles-cli.js reconcile
compose up -d api worker
```

Kiểm ready và dữ liệu phục hồi trước khi nhả khóa. Không gọi migrate deploy lên DB rỗng trước khi restore schema từ dump.

## Lịch và giới hạn dataset

Seed được mọi ngày, nhưng năm tài chính phải bắt đầu tháng 1. ENG/MKT/SAL luôn có ngân sách đã duyệt của năm hiện tại và năm sau (qua luồng đề xuất → phiên bản → Người duyệt chi), nên Request 1–12 tháng bắt đầu hôm nay đi thẳng tới duyệt chi; Thiết kế không có ngân sách nào, để R9 nằm ở hàng đợi của trưởng phòng và bị chặn (NO_APPROVED_BUDGET) khi trình lô. Dataset đã được nạp ở năm khác bị từ chối; dùng wrapper và chọn reset.

Phòng Công nghệ thông tin không có ngân sách nào cho năm sau mà chỉ có **đề xuất ngân sách năm sau đang chờ Finance** (bước `budget.next-year`, màn đề xuất của Finance). Ba hóa đơn do Finance ghi qua `POST /budget-commitments/{id}/invoices` (bước `finance.invoices`) trên cam kết của R1, R10 (Marketing) và R11 (Kinh doanh): một khớp (`MATCHED`), một chỉ lệch thuế (`TAX_ONLY`), một cao hơn cam kết (`PRICE_QUANTITY_EXCEPTION`); số hóa đơn là `SV-HD1`..`SV-HD3` nên chạy lại không ghi thêm. R1 cấp từ thuê bao năm hiện tại. Seed cuối tháng 11/tháng 12 có thể tạo sự kiện gia hạn cho mốc đã qua. Không cam kết luôn có thuê bao trong cửa sổ cảnh báo 15/7 ngày (OD-S6). Mục đích từng bản ghi, bảng tài khoản, ứng viên dữ liệu tương lai và cách mở rộng nằm trong README fixture.

## Bằng chứng và việc Owner còn phải chạy

Script tests dùng Prisma/node/HTTP hoặc Docker giả; chúng kiểm quyết định, thứ tự và bảo mật đầu vào, không chứng minh vận hành VPS thật. Integration (`test/integration/installation/seed*.integration-spec.ts`, `_serial/seed-check-runtime`) chạy `check`/`plan`/`apply` thật trên PostgreSQL và API thật.

Nhật ký vận hành VPS demo:

| Ngày       | Bước                    | Kết quả                                                                                                                                                                                                                |
| ---------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 04/11/2026 | 1 — dọn DB, image cũ    | Không dump (Owner bỏ dữ liệu cũ). DROP/CREATE, provision `DONE` (owner → `slm_deploy`, findings none), 140 migration tới `20261103160200_organization_drop_projects`, reconcile `DONE`, api/worker `Started`, nhả khóa |
| 04/11/2026 | 2 — deploy QĐ-95        | Đang chờ CI/CD                                                                                                                                                                                                         |
| —          | 3, 4 — seed và kiểm tra | Chờ                                                                                                                                                                                                                    |

Lượt `seed:local` có reset thật và Task 9 tài liệu demo ở repo Docs vẫn **chờ Owner**.

**Kỳ lập ngân sách (bước `budget.cycles`).** Trước ngân sách năm, Finance mở kỳ của năm hiện tại và năm sau, chia Trần năm (`cycle` trong `fixture/shared-demo-v3/finance.ts`: Trần năm, dự phòng kho, Trần mỗi phòng) cho mọi phòng đang hoạt động rồi phát hành (`QĐ-103i`): trưởng phòng chỉ nộp `BM-10` khi kỳ đã từng phát hành. Chạy lại không ghi thêm khi kỳ đã phát hành. Trên một database đã có đề xuất ngân sách nhưng chưa có kỳ, nộp đề xuất mới bị 409 `BUDGET.CYCLE_NOT_PUBLISHED` cho tới khi chạy seed (hoặc Finance mở và phát hành kỳ bằng API).

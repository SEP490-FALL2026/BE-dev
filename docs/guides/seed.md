# Seed demo local và VPS

Một lệnh Nest `seed` dùng [fixture shared-demo-v2](../../src/cli/seed/fixture/shared-demo-v2/README.md). Nó có thể bootstrap tổ chức demo rồi ghi dữ liệu qua HTTP API bằng đúng vai. Reset chỉ nằm ở hai wrapper; không có endpoint seed và CI/CD không tự seed.

Các lệnh cũ `dev-seed`, `demo-dataset` và alias đã bỏ theo OD-S3. Cài đặt thật cho khách hàng vẫn dùng [bootstrap](bootstrap-installation.md).

## Hợp đồng CLI

```text
node dist/cli.js seed <check|plan|apply> --environment LOCAL_TEST|SHARED
  [--fixture shared-demo-v2] [--api-url <origin>]
  [--operator-reference <reference>] [--allow-bootstrap] [--secrets-stdin] [--json]
```

`--help` bắt đầu bằng `SEED_PROTOCOL 1`. Không có cờ xóa database trong CLI.

- `check` không cần API URL hay mật khẩu. Khi có `--secrets-stdin`, kiểm hai mật khẩu trước mọi đọc DB; không băm và không ghi. Dùng graph chỉ đọc, không đọc `_prisma_migrations`, nên chạy được bằng runtime role production.
- `plan` cần API URL, operator reference và stdin; đọc hiện trạng, có đăng nhập/đăng xuất nên có audit phiên.
- `apply` lấy khóa `seed:<fixture>:apply` trước khi đọc trạng thái. DB `EMPTY` chỉ được bootstrap khi có `--allow-bootstrap`. Tổ chức hoàn chỉnh đúng fixture thì chạy tiếp; tổ chức khác hoặc dở dang bị từ chối. Không ghi đè bản ghi đã bị sửa khác fixture.

Stdin gồm đúng hai dòng, UTF-8 và LF:

```text
SUPER_ADMIN_PASSWORD=<mật khẩu do Owner chọn>
DEMO_ACCOUNT_PASSWORD=<mật khẩu do Owner chọn>
```

Không đưa mật khẩu vào argv. Chính sách Super Admin là policy credential hiện hành: 12–128 ký tự sau NFC, không trùng email đăng nhập. Mật khẩu demo dài 12–128 ký tự. Sai mật khẩu/định dạng trả `REFUSED<TAB>SECRETS<TAB><lý do>`, exit 3 và không có dòng `STATE`.

`check` trả giao thức TAB cố định:

```text
STATE<TAB>NOT_MIGRATED|EMPTY|INSTALLED|INCOMPLETE
ORGANIZATION<TAB><tên hoặc ->
FIXTURE_ORGANIZATION<TAB>yes|no
ENVIRONMENT<TAB>SHARED|LOCAL_TEST|UNKNOWN
COUNTS<TAB>departments=<n><TAB>accounts=<n>
SECRETS<TAB>ok|not-checked
```

Tên tổ chức được loại TAB/CR/LF khi in. `ENVIRONMENT` đọc từ audit bootstrap cũ nhất; thiếu/không nhận diện được thì `UNKNOWN`. Số phòng là số phòng active, không đếm nhân viên.

| Mã thoát | Ý nghĩa                                                        |
| -------- | -------------------------------------------------------------- |
| 0        | `check`: EMPTY; `plan`: đã lập kế hoạch; `apply`: đã ghi       |
| 2        | `check`: INSTALLED/INCOMPLETE; `apply`: không còn gì cần ghi   |
| 3        | Bị từ chối trước khi ghi; `check` cũng dùng 3 cho NOT_MIGRATED |
| 4        | Dataset xung đột hoặc có bước bị chặn                          |
| 1        | Lỗi; xem các bước đã xong trước khi chạy lại                   |

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
- Gõ đúng tên database: reset schema bằng Prisma, áp migration rồi seed lại. `ENVIRONMENT=SHARED` luôn bị từ chối reset local.
- `c`: chạy tiếp, chỉ khi `INSTALLED` và đúng tổ chức fixture.
- Check lỗi không đọc được schema: chỉ cho reset có xác nhận, không cho chạy tiếp.
- EMPTY/NOT_MIGRATED: không cần reset; luôn áp migration trước apply.

Tự động hóa có thể dùng `--continue` hoặc `--confirm-reset <tên database>`; không có cờ bỏ qua các chốt. Wrapper khởi động API/worker riêng, chờ ready, gọi `seed apply --allow-bootstrap`, rồi dừng các tiến trình của nó cả khi lỗi hoặc nhận tín hiệu. Môi trường con dùng file cấu hình tường minh và `DOTENV_CONFIG_PATH`; biến consent Prisma bị loại bỏ, không được wrapper đặt hay chuyển tiếp.

**Owner chạy lượt reset thật.** Phiên implement chỉ chạy test giả; chưa chứng minh một lượt reset local thực tế.

## VPS demo đã có release mới

Owner copy script từ checkout **đúng commit đang deploy**, vì CD chỉ chép Compose, Caddyfile và deploy-release:

```bash
scp scripts/ops/seed.sh .env.seed.example <demo-host>:/opt/slm/backend/
```

Trên VPS, copy template thành `.env.seed`, điền operator reference và hai mật khẩu, đặt quyền 600. `SEED_ALLOW_RESET=false` là mặc định; chỉ đổi thành `true` khi Owner chủ động cho phép reset DB demo. Script đọc file như dữ liệu, không `source` hay thực thi giá trị.

```bash
chmod 600 /opt/slm/backend/.env.seed
bash /opt/slm/backend/seed.sh --app-dir /opt/slm/backend --config /opt/slm/backend/.env.seed
```

`PORT` và `POSTGRES_DB` lấy từ `.env` của app-dir; image bất biến lấy từ `releases/current-image`. Mọi Compose call dùng đúng project-directory và Compose file ở app-dir. Mọi `run` có `-T`; mật khẩu chỉ qua stdin.

Script giữ `flock -n` trên `releases/.deploy.lock` suốt lượt. Seed gặp khóa đang giữ thoát 3. **Một deploy CI/CD tới trong lúc seed sẽ dừng exit 2 tại khóa deploy của nó**; chờ seed xong rồi chạy lại deploy.

Trước khi hỏi reset, script kiểm protocol và mật khẩu. Quy tắc chọn Enter/database/`c` như local; VPS reset cần cả `SEED_ALLOW_RESET=true` và đúng tên `POSTGRES_DB`. Chạy tiếp không cần reset opt-in, nhưng không nhận tổ chức khác hay INCOMPLETE. NOT_MIGRATED chạy migrate deploy trước apply, không đòi reset opt-in.

Thứ tự reset:

1. Dump custom bằng deploy role vào `backups/postgres/slm-pre-reseed-<UTC>.dump.partial`; dump rỗng hoặc `pg_restore --list` lỗi thì dừng, chưa xóa gì. Kiểm đạt mới bỏ hậu tố `.partial`.
2. Dừng API và worker.
3. Dùng cluster account trong container PostgreSQL để DROP/CREATE đúng database.
4. Provision bằng `db-admin`.
5. Áp migration bằng image hiện hành và deploy role.
6. Reconcile PostgreSQL roles.
7. Khởi động API/worker và chờ ready trong container (mặc định 180 giây, đổi bằng `--ready-timeout`).
8. Chạy seed apply bằng runtime role; in/lưu báo cáo trong `seed-reports/<UTC>-apply.txt`, owner-only.

Lỗi sau recreation: exit 1, API/worker bị dừng và script in phase đã xong cùng lệnh phục hồi dump. Không tự thử lại thao tác ghi. Apply giữ mã thoát 0/2/3/4/1. Script không xóa backup nào; retention giữ 10 bản mới nhất **mỗi loại** pre-migrate/pre-reseed và mọi bản dưới 30 ngày, bỏ qua tên lạ và `.partial`.

## Dựng lại VPS một lần trước release QĐ-95 — Owner thực hiện

DB demo cũ nhiều vai sẽ bị migration một vai chặn. Thực hiện dưới **image cũ đang chạy**, sau khi Owner commit các quyết định Docs/rule. Không dùng script seed mới với image cũ chưa có protocol.

Trên VPS, tại app-dir, đặt shell Bash có `set -euo pipefail`, `umask 077`; giữ khóa tới hết giai đoạn dưới:

```bash
cd /opt/slm/backend
exec 9>releases/.deploy.lock
flock -n 9
export API_IMAGE="$(cat releases/current-image)"
compose() { docker compose --project-directory "$PWD" -f "$PWD/docker-compose.prod.yml" "$@"; }
DUMP="$PWD/backups/postgres/slm-pre-reseed-$(date -u +%Y%m%dT%H%M%SZ).dump"
mkdir -p backups/postgres
test ! -e "$DUMP" && test ! -e "$DUMP.partial"
compose run --rm --no-deps -T backup pg_dump --format=custom --no-owner --no-privileges > "$DUMP.partial"
test -s "$DUMP.partial"
compose run --rm --no-deps -T backup pg_restore --list < "$DUMP.partial" > /dev/null
mv -- "$DUMP.partial" "$DUMP"
compose stop api worker
compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""'
compose run --rm -T db-admin
compose run --rm --no-deps -T migrate node node_modules/prisma/build/index.js migrate deploy
compose run --rm --no-deps -T migrate node dist/database-roles-cli.js reconcile
compose up -d api worker
```

Kiểm ready bằng probe trong container như [deploy-release.sh](../../scripts/ops/deploy-release.sh), không chỉ kiểm container đang chạy. Chỉ khi ready mới nhả khóa (`flock -u 9; exec 9>&-`). Sau đó để CI/CD deploy release QĐ-95 bình thường: DB trống có lịch sử migration của release cũ, nên deploy không bị chặn vì mất history. Copy `seed.sh` từ checkout release mới, tạo `.env.seed` và chạy script: EMPTY sẽ bootstrap và nạp dataset. Từ lần sau dùng chính `seed.sh` có reset.

Nếu có lỗi sau DROP/CREATE: giữ dịch vụ dừng, giữ dump, sửa nguyên nhân trước khi quyết định chạy tiếp hoặc phục hồi. Phục hồi theo cùng image/Compose project: dựng lại database và provision, rồi dùng service backup (deploy role):

```bash
compose run --rm --no-deps -T backup sh -c 'pg_restore --exit-on-error --no-owner --no-privileges --dbname "$PGDATABASE"' < "$DUMP"
compose run --rm --no-deps -T migrate node dist/database-roles-cli.js reconcile
compose up -d api worker
```

Kiểm ready và dữ liệu phục hồi trước khi nhả khóa. Không gọi migrate deploy lên DB rỗng trước khi restore schema từ dump.

## Lịch và giới hạn dataset

Seed được mọi ngày, nhưng năm tài chính phải bắt đầu tháng 1. Các Request trả phí dùng chung ngày chi; khi kỳ dịch vụ của R1/R2 vượt cuối năm, ngày chi là ngày làm việc đầu năm sau và ENG/MKT/SAL có cả hai năm ngân sách. Dataset đã được nạp ở năm khác bị từ chối; dùng wrapper và chọn reset.

R1 ở nhánh năm sau vẫn cấp từ thuê bao năm hiện tại, hết hạn 31/12. Seed cuối tháng 11/tháng 12 có thể tạo sự kiện gia hạn cho mốc đã qua. Không cam kết luôn có thuê bao trong cửa sổ cảnh báo 15/7 ngày (OD-S6). Mục đích từng bản ghi, bảng tài khoản, ứng viên dữ liệu tương lai và cách mở rộng nằm trong README fixture.

## Bằng chứng và việc Owner còn phải chạy

Script tests dùng Prisma/node/HTTP hoặc Docker giả; chúng kiểm quyết định, thứ tự và bảo mật đầu vào, không chứng minh vận hành VPS thật. Integration/e2e được viết và chờ phiên review. Lượt `seed:local` có reset thật, runbook VPS và Task 9 tài liệu demo ở repo Docs đều **chờ Owner**; chưa ghi nhận một lượt seed VPS thành công trong phiên implement này.

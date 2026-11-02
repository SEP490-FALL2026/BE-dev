# Nạp dataset demo vào VPS dùng chung

Hướng dẫn vận hành cho `pnpm ops:demo-dataset` (`node dist/demo-dataset-cli.js`) trên **VPS dùng chung của dự án môn
học**, sau khi đã [bootstrap tổ chức và Super Admin](bootstrap-installation.md). Thiết kế và bằng chứng: hạng mục
[shared-demo-dataset](../workspace/items/shared-demo-dataset/spec.md). Có hai cách chạy, cùng một lệnh và cùng kết quả:

| Cách                      | Chạy ở đâu                                                                      | Cần gì                                                                                  | Khi nào dùng                          |
| ------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------- |
| A. Trên VPS               | `scripts/ops/demo-dataset.sh` trên host, lệnh trong image đang chạy             | Image mới chứa lệnh (commit → CI/CD → deploy)                                           | Sau khi hạng mục đã vào image         |
| B. Từ máy local (Windows) | `scripts/ops/demo-dataset-local.mjs` trên máy operator, lệnh từ bản build local | Checkout có `prisma/` và `openapi.json` **giống hệt** commit đang deploy; SSH bằng khóa | Muốn nạp ngay, không chờ commit/CI/CD |

Cả hai: `plan` → `apply` → kiểm tra → bàn giao tài khoản cho FE riêng tư. Không chạy trong CI/CD, không chạy lúc khởi động,
không có endpoint seed, không dùng `dev:seed`, không thay image API/worker, không mở cổng PostgreSQL ra ngoài.

## 1. Lệnh làm gì và không làm gì

- Dữ liệu là **fixture có phiên bản** trong mã nguồn: [`shared-demo-v1`](../../src/cli/demo-dataset/fixture/shared-demo-v1.ts)
  — 6 phòng `DS1-*`, 16 nhân viên (14 có tài khoản), Cost Center, 4 ứng dụng/4 gói/4 thuê bao, ngân sách năm của
  phòng Kỹ thuật, 9 Request ở 9 trạng thái, một bản nháp, một phiếu báo lỗi SaaS, một thông báo BM-09. Toàn bộ là dữ
  liệu giả; email dùng miền `ds1.slm-demo.example` (miền `.example` dành cho ví dụ, không thư nào tới người thật).
  Mô tả cho FE: Docs `Figma UI-UX/API-Integration/demo/`.
- **Mọi bản ghi được ghi qua HTTP API đang chạy**, bằng đúng vai mà nghiệp vụ quy định (Super Admin tạo phòng/nhân
  viên/trưởng phòng/vai trò phê duyệt; Finance tạo Cost Center và lập ngân sách; IT Admin khai danh mục và cấp ghế;
  trưởng phòng duyệt nhu cầu và trình lô; Người duyệt chi duyệt chi; nhân viên gửi Request). Mọi validation, chuyển
  trạng thái, khoản cam kết và Audit Trail là của ứng dụng; lệnh không chèn trạng thái bằng SQL.
- **Ngoại lệ duy nhất là tài khoản đăng nhập của người demo**: lời mời sẽ gửi email tới hộp thư không tồn tại, nên lệnh
  tạo tài khoản đã kích hoạt qua hợp đồng tài khoản demo có sẵn (cùng hợp đồng với `pnpm dev:seed`: một vai trực tiếp
  `EMPLOYEE`/`IT_ADMIN`/`FINANCE`, không bao giờ `SUPER_ADMIN`; vai trực tiếp khác được cấp ở bước riêng), mật khẩu hash bằng Argon2id của
  `IdentityAccessApi.prepareCredential`, và ghi Audit Trail `DEMO_DATASET.ACCOUNT_CREATED` với
  `operatorReference = DEMO_DATASET:<fixture>:<tham chiếu operator>`. Phần này chạy bằng **runtime role** của API: với
  `NODE_ENV=production` lệnh kiểm vai PostgreSQL trước mọi việc và dừng nếu là superuser, owner hay deploy role.
- **Giới hạn của tài khoản `FINANCE` (Owner 30/10/2026):** cấp vai `FINANCE` phát thay đổi vai trò phê duyệt mà graph của lệnh
  không có listener của `requests` trả lời, nên một step đang chờ Finance **không** được thử lại (đường API thì thử lại); trên
  database dataset nhắm tới chưa có step nào chờ Finance.
- **Trước khi ghi**, lệnh chứng minh đúng đích: database có tổ chức đúng tên `DEMO_ORGANIZATION_NAME`, tiền tệ báo cáo
  là `VND`, và API ở URL đã cho phục vụ đúng database đó (Super Admin đăng nhập qua API phải là người giữ vai mà
  database ghi). Sai bất kỳ điều nào: từ chối (exit 3), không ghi bản ghi nào của dataset.
- **Một `apply` mỗi lúc** trên một database: `apply` giữ khóa advisory của fixture trên một kết nối riêng suốt lượt chạy;
  lượt thứ hai bị từ chối (exit 3) khi khóa đang bị giữ. Khóa nhả khi lượt kết thúc — kể cả khi lỗi, và PostgreSQL tự nhả
  khi tiến trình chết nên không có khóa treo. Khóa theo database, không theo máy: cách A và B cùng tôn trọng nó. Deploy
  trong lúc `apply` làm API khởi động lại: lượt chạy dừng với exit 1, chạy lại `apply` sau deploy để đi tiếp.
- **Lịch**: kịch bản sống trong một năm tài chính (thuê bao 01/01–31/12, ngân sách năm lập từ hôm nay, R1/R2 trả tiền một
  tuần sau lượt chạy). Vì vậy `apply` chỉ ghi từ **01/01 tới 30/11** (theo ngày nghiệp vụ của tổ chức); `plan` đọc mọi
  ngày của năm đó. Khi đã sang năm khác năm nạp lần đầu (đọc từ Audit Trail), cả `plan` và `apply` từ chối — năm mới cần
  fixture phiên bản mới. Năm tài chính phải bắt đầu tháng 1 (`FISCAL_YEAR_START_MONTH = 1`), không thì từ chối.
- **Không xóa, reset, truncate hay ghi đè.** Chạy lại thì đọc những gì đã có rồi chỉ ghi phần còn thiếu. Một mã/tên/vai mà
  dữ liệu ngoài dataset đang giữ, hoặc **một bản ghi của dataset đã bị sửa khác fixture**, là **xung đột**: bước đó không
  ghi, bước phụ thuộc bị chặn, phần độc lập vẫn chạy (exit 4). Những gì được so:

  | Bản ghi                                             | Nhận ra bằng                                | So với fixture (khác ⟹ xung đột)                                         |
  | --------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
  | Phòng                                               | mã `DS1-*`                                  | tên, đang hoạt động                                                      |
  | Nhân viên                                           | mã                                          | là thành viên đúng phòng, họ tên                                         |
  | Tài khoản                                           | nhân viên                                   | email đăng nhập, vai trực tiếp (hợp đồng tài khoản demo)                 |
  | Trưởng phòng, IT Admin phụ trách, vai trò phê duyệt | phòng/vai                                   | người giữ                                                                |
  | Ứng dụng                                            | tên + nhà cung cấp                          | Business Owner                                                           |
  | Gói                                                 | tên trong ứng dụng                          | kiểu cấp, mô hình giá, mức kiểm soát, mất dữ liệu khi gỡ, chia sẻ        |
  | Thuê bao                                            | gói + phòng sở hữu                          | số lượng, đơn giá và tiền tệ, chu kỳ, ngày đầu/cuối kỳ, thời hạn báo hủy |
  | Cost Center                                         | mã                                          | phòng gắn                                                                |
  | Hồ sơ thuế nhà cung cấp                             | nhà cung cấp                                | nhóm thuế                                                                |
  | Request R1→R9                                       | Audit Trail của người gửi + thẻ `[DS1-Rn]`  | gói; trạng thái phải đi được tới đích theo kịch bản                      |
  | Phiếu báo lỗi, thông báo BM-09                      | thẻ `[DS1-ISSUE]`/`[DS1-NOTICE]` ở nội dung | —                                                                        |

  Được **dùng lại có chủ đích**: ngân sách năm hiện hành `APPROVED` của `DS1-CC-ENG` dù ở phiên bản nào (Finance được sửa
  ngân sách khi demo); bản nháp `INDIVIDUAL` cùng gói của `DS1-DEV3` (route bản nháp không trả nội dung để so); mật khẩu
  của tài khoản demo đã có (không bao giờ đặt lại — lệnh báo xung đột nếu mật khẩu demo không đăng nhập được).

- Danh sách quá dài để đọc hết (quá 50 trang × 100) thì bước đó báo **xung đột**, không bao giờ coi là "chưa có" rồi gửi
  thêm.
- **Không có transaction bao trùm**: mỗi lời gọi API commit riêng. Lỗi giữa chừng thì báo cáo nêu bước đã xong; sửa
  nguyên nhân rồi chạy lại, lệnh tiếp tục từ chỗ dừng (không tạo bản sao).
- `plan` **không ghi bản ghi nào của dataset**, nhưng để đọc qua API nó đăng nhập (Super Admin, tài khoản demo đã có): việc
  đó ghi rồi kết thúc phiên đăng nhập, refresh token và Audit đăng nhập/đăng xuất. Database **không** giữ nguyên từng byte.

## 2. Điều kiện chung

1. VPS đã deploy, đã bootstrap, `ops:inspect` exit `0`, đăng nhập Super Admin được. **Không** reset database.
2. Biết mật khẩu Super Admin. Chọn **một mật khẩu demo** 12–128 ký tự cho mọi tài khoản demo; lần chạy lại phải dùng
   đúng mật khẩu đó.
3. Ngày nghiệp vụ từ 01/01 tới 30/11 cho `apply` (mục 1, Lịch).
4. Không ai khác đang `apply` cùng fixture (khóa sẽ từ chối lượt thứ hai), và tránh lúc đang deploy.

## 3. Cách A — chạy trên VPS bằng image mới

### 3.1. Image và wrapper

Image đang chạy phải **có lệnh `demo-dataset`**: Owner commit/push, chờ CI/CD deploy xong (`releases/current-image` trỏ
tới image mới). Script trên host **không** bổ sung được lệnh cho image cũ: wrapper hỏi `demo-dataset-cli.js --help` của
image đang chạy và từ chối (exit 3) nếu chưa có. CD chỉ chuyển Compose, Caddyfile và script deploy; từ checkout **đúng
revision của image**, tại gốc repo BE:

```sh
scp scripts/ops/demo-dataset.sh .env.demo-dataset.example deploy@YOUR_VPS_HOST:/opt/slm/backend/
```

Trên VPS (đổi `/opt/slm/backend` nếu khác), đưa script và template về LF (không chạm file thật có mật khẩu):

```sh
cd /opt/slm/backend
sed -i 's/\r$//' demo-dataset.sh .env.demo-dataset.example
```

### 3.2. File riêng

```sh
(umask 077; set -C; cat .env.demo-dataset.example > .env.demo-dataset)
chmod 600 .env.demo-dataset
nano .env.demo-dataset
```

| Biến                        | Bắt buộc                      | Ý nghĩa                                                                                           |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `DEMO_FIXTURE`              | có (`shared-demo-v1`)         | Phiên bản dataset.                                                                                |
| `DEMO_ORGANIZATION_NAME`    | có                            | Tên tổ chức đã bootstrap, đúng từng ký tự (lệnh từ chối database khác).                           |
| `DEMO_OPERATOR_REFERENCE`   | có                            | Tham chiếu ticket/phê duyệt, ghi vào Audit Trail. Không phải mật khẩu.                            |
| `DEMO_SUPER_ADMIN_PASSWORD` | có                            | Mật khẩu Super Admin, để lệnh ghi dữ liệu tổ chức qua API và đọc Audit Trail.                     |
| `DEMO_ACCOUNT_PASSWORD`     | có                            | Mật khẩu chung của mọi tài khoản demo (12–128 ký tự). Bàn giao riêng cho FE.                      |
| `DEMO_API_URL`              | không (`http://slm-api:3000`) | API nhìn từ container một lần trong mạng Compose (tên container + `PORT` của `.env`). Chỉ origin. |

File được đọc như dữ liệu (không `source`/`eval`); quyền phải `600`, owner là user chạy wrapper; không CRLF. Hai mật
khẩu đi qua **stdin** của lệnh (pipe từ builtin), không bao giờ vào argv, biến môi trường Docker, log hay báo cáo.

### 3.3. Xem trước, nạp

```sh
bash demo-dataset.sh --app-dir /opt/slm/backend --config /opt/slm/backend/.env.demo-dataset --mode plan
bash demo-dataset.sh --app-dir /opt/slm/backend --config /opt/slm/backend/.env.demo-dataset --mode apply
```

Wrapper chạy `docker compose run --rm --no-deps -T api node dist/demo-dataset-cli.js <mode> … --environment=SHARED
--secrets-stdin` với đúng image của `releases/current-image` (không bao giờ `latest`), bằng **runtime role** của service
`api` (H7 giữ nguyên), trong mạng Compose để gọi API trực tiếp. Báo cáo (không mật khẩu/token) được lưu tại
`/opt/slm/backend/demo-dataset/<UTC>-<fixture>-<mode>.txt`; dòng đầu ghi mode, image, **API đích kèm nguồn** (`from
DEMO_API_URL` hay `default: DEMO_API_URL is not set` — mặc định là `http://slm-api:3000`, nên khi API chạy cổng khác,
ví dụ `PORT=4000`, phải đặt `DEMO_API_URL`), dòng cuối ghi mã thoát và số giây; báo cáo giữ cả stderr của lệnh (dòng
`refused:`/`warning:`/lỗi), trước 31/10/2026 chỉ giữ stdout nên báo cáo của lượt lỗi trống. Kiểm tra:
[mục 5](#5-kiểm-tra-và-mã-thoát).

## 4. Cách B — chạy từ máy local (Windows) qua SSH tunnel

Không cần image mới: lệnh chạy từ bản build trên máy operator. Lời gọi HTTP đi tới **API HTTPS công khai** của VPS; phần
trong tiến trình (tài khoản demo, kiểm đích) nối PostgreSQL của VPS qua **SSH tunnel** chỉ mở ở `127.0.0.1` trên máy
local — PostgreSQL vẫn không công bố cổng nào trên VPS, tunnel đi tới IP của container `slm-postgres` trong mạng Docker.

### 4.1. Chuẩn bị máy

- Node.js và pnpm theo `package.json`, Git, OpenSSH client (Windows 10/11 có sẵn `ssh.exe`).
- SSH vào VPS **bằng khóa hoặc agent, không hỏi mật khẩu** (wrapper dùng `BatchMode=yes`); user SSH chạy được `docker`
  (như user deploy) và đọc được `<app dir>/releases/current-image`.
- Checkout BE ở commit có hạng mục này, **và** `prisma/` cùng `openapi.json` giống hệt commit đang deploy. Wrapper tự
  kiểm (mục 4.3); nếu khác, deploy trước (cách A) hoặc chờ. Commit đang deploy do CD build từ repository
  `WDP301-FA26-GR8/BE`, có thể không có ở `origin` của checkout (`SEP490-FALL2026/BE-dev`): lấy đúng object đó mà không
  thêm remote hay đổi nhánh bằng `git fetch git@github.com:WDP301-FA26-GR8/BE.git <sha của releases/current-image>`.
- Trên VPS `e2-micro` (958 MiB RAM, swap trên cùng đĩa) đây là cách được chọn (Owner, 31/10/2026): container one-off của
  cách A khởi động Node ngay trên host và đã làm truy vấn đầu quá `DB_QUERY_TIMEOUT_MS` (plan của hạng mục, Task 7).
- Build: tại gốc repo BE, `pnpm install --frozen-lockfile` rồi `pnpm build`. Wrapper từ chối bản build cũ hơn mã nguồn.

### 4.2. File riêng (ngoài repository)

Lấy giá trị database từ VPS — trong `/opt/slm/backend/.env`: `POSTGRES_DB`, `DATABASE_RUNTIME_USER` (mặc định
`slm_runtime`), `DATABASE_RUNTIME_PASSWORD`. Chỉ chép **ba giá trị** đó bằng tay; không chép file `.env` về máy, không dùng
`DATABASE_DEPLOY_*` hay `POSTGRES_USER` (lệnh từ chối vai đó). Trong PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\slm-demo" | Out-Null
Copy-Item .env.demo-dataset-local.example "$env:USERPROFILE\slm-demo\.env.demo-dataset-local"
icacls "$env:USERPROFILE\slm-demo\.env.demo-dataset-local" /inheritance:r /grant:r "${env:USERNAME}:(R,W)"
notepad "$env:USERPROFILE\slm-demo\.env.demo-dataset-local"
```

| Biến                                                                                                                      | Bắt buộc                | Ý nghĩa                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `DEMO_FIXTURE`, `DEMO_ORGANIZATION_NAME`, `DEMO_OPERATOR_REFERENCE`, `DEMO_SUPER_ADMIN_PASSWORD`, `DEMO_ACCOUNT_PASSWORD` | có                      | Như cách A.                                                                                           |
| `DEMO_API_URL`                                                                                                            | có                      | Origin HTTPS công khai của API, ví dụ `https://api.example.com` (http chỉ cho loopback khi diễn tập). |
| `DEMO_SSH_TARGET`                                                                                                         | có                      | `user@host` của VPS.                                                                                  |
| `DEMO_REMOTE_APP_DIR`                                                                                                     | có (`/opt/slm/backend`) | Thư mục deploy trên VPS (để đọc `releases/current-image`).                                            |
| `DEMO_DATABASE_NAME`, `DEMO_DATABASE_USER`, `DEMO_DATABASE_PASSWORD`                                                      | có                      | Database và **runtime role** (mục trên).                                                              |
| `DEMO_SSH_PORT`, `DEMO_SSH_IDENTITY_FILE`, `DEMO_POSTGRES_CONTAINER`, `DEMO_LOCAL_PORT`, `DEMO_REPORT_DIR`                | không                   | `22`, khóa mặc định của SSH, `slm-postgres`, `15432`, `demo-dataset-reports` cạnh file riêng.         |

File đọc như dữ liệu (LF hoặc CRLF). Wrapper **từ chối** file nằm trong một repository Git mà không bị ignore hoặc đã
được track. Mật khẩu Super Admin và mật khẩu demo đi qua **stdin**; mật khẩu database chỉ nằm trong `DATABASE_URL` ở biến
môi trường của **một** tiến trình con. Không mật khẩu nào vào argv, log hay báo cáo lưu lại.

### 4.3. Xem trước, nạp, đóng tunnel

Tại gốc repo BE (PowerShell hoặc Git Bash):

```powershell
node scripts/ops/demo-dataset-local.mjs --config "$env:USERPROFILE\slm-demo\.env.demo-dataset-local" --mode plan
node scripts/ops/demo-dataset-local.mjs --config "$env:USERPROFILE\slm-demo\.env.demo-dataset-local" --mode apply
```

Mỗi lượt wrapper làm theo thứ tự, dừng ở bước đầu tiên không đạt (exit 3, chưa mở tunnel, chưa chạy lệnh):

1. đọc và kiểm file riêng; kiểm `dist/demo-dataset-cli.js` có và mới hơn mã nguồn;
2. SSH đọc `releases/current-image` → commit của image (phải là tag bất biến 40 ký tự);
3. **kiểm tương thích**: checkout có commit đó (`git fetch` nếu chưa), và `prisma/`, `openapi.json` của cây làm việc (kể
   cả thay đổi chưa commit và migration chưa track) giống hệt commit đó — tức schema database và contract HTTP mà lệnh
   dựa vào là của bản đang chạy;
4. SSH lấy IP của container PostgreSQL, mở `ssh -N -L 127.0.0.1:<DEMO_LOCAL_PORT>:<IP>:5432` (cổng local phải trống) và
   chờ cổng sẵn sàng;
5. chạy `node dist/demo-dataset-cli.js <mode> … --environment=SHARED --secrets-stdin` với `NODE_ENV=production`,
   `DATABASE_URL` trỏ vào đầu tunnel, thư mục làm việc không có `.env` (để không đọc nhầm `.env` dev của repo);
6. **luôn đóng tunnel** khi xong, lỗi hay bị từ chối, rồi kiểm cổng local đã đóng; in `SSH tunnel closed.`

Báo cáo (không mật khẩu) lưu ở `DEMO_REPORT_DIR`: `<UTC>-<fixture>-<mode>-local.txt`. Nếu cửa sổ bị đóng giữa chừng và
nghi tunnel còn mở: `Test-NetConnection 127.0.0.1 -Port 15432` phải `False`; nếu còn, dừng tiến trình `ssh` tương ứng
(`Get-Process ssh`). Kiểm tra dữ liệu: mục 5.

## 5. Kiểm tra và mã thoát

- `plan` lần đầu: phần lớn bước là `SẼ GHI`/`CHỜ`. Sau `apply`: chạy lại `apply` phải ra **exit `2`** (không còn gì để
  ghi); `plan` phải toàn `ĐÃ CÓ`.
- Đăng nhập FE (hoặc Swagger UI nếu bật) bằng một tài khoản demo, ví dụ `dung.pham@ds1.slm-demo.example`, và đối chiếu
  bảng kịch bản ở Docs `Figma UI-UX/API-Integration/demo/scenarios.md`. Chỉ dùng API đọc để kiểm tra; không gọi API ghi
  để "thử" trên VPS ngoài kịch bản.
- Ghi lại: ngày nạp, commit của image, đường dẫn báo cáo — vào Docs `demo/README.md` (Trạng thái nạp) và plan của hạng mục.

| Mã thoát | Ý nghĩa                                                                                          | Làm gì                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `0`      | `apply`: đã ghi và mọi bước đạt; `plan`: đã lập kế hoạch                                         | `plan` → đọc báo cáo rồi `apply`; `apply` → kiểm tra như trên.                                                                        |
| `2`      | `apply`: mọi bước đã có, không ghi gì                                                            | Không cần làm gì.                                                                                                                     |
| `4`      | Có bước **xung đột** hoặc **bị chặn**; bước khác đã chạy                                         | Đọc dòng `XUNG ĐỘT`: dữ liệu ngoài dataset đang giữ chỗ, hoặc bản ghi của dataset đã bị sửa — quyết định thủ công, lệnh không ghi đè. |
| `3`      | Từ chối trước khi ghi (cấu hình, image, tương thích, lịch, khóa, sai tổ chức/API/mật khẩu)       | Sửa theo thông báo; chưa có bản ghi nào của dataset thay đổi.                                                                         |
| `1`      | Lỗi giữa chừng (API không tới được, lỗi 5xx, tunnel đứt, vai PostgreSQL không phải runtime role) | Báo cáo nêu bước đã xong; sửa nguyên nhân rồi chạy lại `apply`, lệnh đi tiếp. Lỗi database kèm `code=…`/`pg="…"`: xem dưới bảng.      |

Lỗi database ở mã thoát `1` kèm nguyên nhân bằng mã, không URL, không giá trị: `code=P2028` — một transaction của lệnh quá
`DB_TRANSACTION_TIMEOUT_MS` (đường tới PostgreSQL chậm hoặc host quá tải); `pg="Query read timeout"`, thường đi sau dòng
`warning: A database connection was retired …` — một câu lệnh không được trả lời trong `DB_QUERY_TIMEOUT_MS` (tunnel/mạng
khựng, host bỏ đói tiến trình, hay DDL lúc deploy); `code=ECONNRESET` hoặc `pg="Connection terminated …"` — kết nối bị cắt;
`code=P2010 sqlState=57014` — `statement_timeout` phía server. Chạy lại `apply` khi đường đã ổn; đối chiếu chi tiết:
[A-04 operator verification](../workspace/items/a04-seed-rerun-diagnosis/operator-verification.md).

**Đọc dòng lỗi.** Lỗi ngoài các bước in một dòng
`The demo dataset run failed in phase <phase> after <ms> ms (run <ms> ms): <loại> [code=…] [sqlState=…] retryable=… [cause=…] [pg="…"]`
— không URL, không thông điệp gốc của lỗi, không stack, không mật khẩu. `pg="…"` chỉ là thông điệp cố định của
node-postgres cho lỗi kết nối (`Query read timeout`, `Connection terminated unexpectedly`, …).

| Phase                | Đang làm gì                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `secrets`            | đọc hai mật khẩu từ stdin                                                                          |
| `startup`            | mở đồ thị lệnh; ở production chạy truy vấn đầu tiên kiểm runtime role, **ngoài** transaction       |
| `installation-facts` | đọc tổ chức, ngày, Super Admin trong database                                                      |
| `apply-lock`         | (`apply`) lấy khóa advisory trên kết nối riêng                                                     |
| `api-proof`          | đăng nhập Super Admin qua API và đối chiếu `/me`                                                   |
| `calendar`           | đọc tham số năm tài chính và Audit Trail qua API                                                   |
| `steps`              | các bước của dataset                                                                               |
| `lock-release`       | (`apply`) nhả khóa; lỗi ở đây chỉ in `warning:`, **không** thay báo cáo hay mã thoát của lượt chạy |

`warning: A database connection was retired …` rồi `phase startup … Error retryable=true pg="Query read timeout"` nghĩa
là database (hoặc đường mạng tới nó, hoặc tiến trình bị nghẽn CPU) không trả lời truy vấn kiểm vai trong
`DB_QUERY_TIMEOUT_MS`: chưa có gì được ghi; kiểm tình trạng PostgreSQL/host rồi chạy lại, **không** tăng timeout để
che. API không tới được in `(<METHOD> <path> kind=NETWORK|TIMEOUT [code=ECONNREFUSED|ENOTFOUND|…] elapsedMs=…)`:
`NETWORK` + `ECONNREFUSED` = sai cổng hoặc API chưa nghe; `ENOTFOUND`/`EAI_AGAIN` = tên máy; `TIMEOUT` = API nhận
kết nối nhưng không trả lời trong 30 giây.

## 6. Bàn giao cho FE

Chỉ bàn giao **alias tài khoản và vai** (bảng ở Docs `API-Integration/demo/accounts.md`) và mật khẩu demo qua kênh riêng.
Không đưa tài khoản Super Admin cho FE. Dataset cố ý để **seat baseline mở** (để FE thử import và đóng baseline); vì
vậy yêu cầu tài khoản dịch vụ trả `409 SERVICE_ACCOUNT_REQUEST.BASELINE_NOT_CLOSED` tới khi IT Admin đóng baseline
(thao tác vĩnh viễn, `POST /api/v1/seat-baseline/close`). Dataset không có hồ sơ điều chuyển hay nghỉ việc: thiếu dữ liệu
mẫu cho các màn đó **không** có nghĩa API của chúng chưa có.

## 7. Giới hạn đã biết

- Bằng chứng hiện có: test tích hợp trên PostgreSQL cô lập với API thật (plan không ghi, apply tới đủ trạng thái, chạy lại
  không trùng, dừng giữa chừng rồi chạy tiếp, xung đột không ghi đè, khóa từ chối lượt thứ hai và không treo, lịch ở
  30/11, 01/12 và sang năm với ngày giả lập), test wrapper cách A với `docker` giả và cách B với SSH/Git/lệnh giả.
  **Chưa có bằng chứng chạy trên VPS** (cả hai cách) cho tới khi operator chạy và lưu báo cáo.
- Dataset không gỡ được bằng lệnh (không có cleanup): dữ liệu demo là bản ghi nghiệp vụ thật của cài đặt, giữ Audit
  Trail; muốn môi trường sạch thì cài đặt lại theo quyết định riêng của Owner.
- Khóa nằm trên một kết nối PostgreSQL: nếu kết nối đó đứt (tunnel đứt ở cách B) khóa nhả trong khi lượt chạy có thể chưa
  biết; lượt chạy vẫn đi tiếp và báo cáo giữ nguyên (nhả khóa không ném lỗi, A-04). Không chạy hai operator cùng lúc.
- Tài khoản demo được mô tả và ghi **mỗi tài khoản một transaction ngắn** (A-04): việc của một transaction không tăng theo
  cỡ fixture, nên chịu được đường tới PostgreSQL chậm (đã kiểm ở khứ hồi 100 và 200 ms với ngân sách 10 s). Lượt dừng giữa
  bước này giữ các tài khoản đã ghi (mỗi cái đủ credential, vai, Audit); chạy lại đọc chúng là đã có.
- Cách B tin vào `releases/current-image` để biết bản đang chạy; nếu ai đó đổi container ngoài quy trình deploy, phép kiểm
  tương thích không thấy.
- Các phần G7–G10 (usage, khuyến nghị ghost seat, gia hạn/chi phí/hóa đơn, đối soát, AI, mobile) không có trong dataset.

# Bootstrap tổ chức và Super Admin trên VPS

Hướng dẫn vận hành một lần sau khi deploy lên **database mới đã chạy migration**. Script
[`bootstrap-installation.sh`](../../scripts/ops/bootstrap-installation.sh) đọc cấu hình từ `.env.bootstrap` rồi gọi CLI
của đúng image đang deploy. CLI tạo tổ chức, một phòng đầu tiên và tài khoản Super Admin; không tạo dataset demo.

Với DB demo local/VPS, dùng [seed hợp nhất](seed.md): wrapper kiểm trạng thái, xác nhận reset hoặc chạy tiếp, và bootstrap khi DB trống. Hướng dẫn này vẫn dành cho cài đặt thật, giữ nguyên database qua deploy.

Luồng: **commit/push → CI/CD xanh → copy wrapper và template → điền cấu hình → bootstrap → inspect/preflight → đăng nhập**.
CI/CD tạo schema và chạy BE; nó không tự tạo tổ chức hoặc Super Admin. Xem
[runbook container và H7](containers.md#postgresql-roles-h7) nếu cần chuẩn bị hạ tầng/cấu hình trước deploy.

## Các file trên VPS dùng để làm gì?

Ví dụ thư mục ứng dụng là `/opt/slm/backend` (đổi đường dẫn trong các lệnh nếu VPS khác):

```text
/opt/slm/backend/
├── .env
├── .env.app
├── .env.bootstrap
├── .env.bootstrap.example
├── bootstrap-installation.sh
├── docker-compose.prod.yml
├── Caddyfile
├── releases/
│   ├── current-image
│   ├── current-attempt
│   └── <commit-sha>/
└── backups/
    └── postgres/
```

| File/thư mục                           | Vai trò và cách có trên VPS                                                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env`                                 | Cấu hình Compose và các danh tính PostgreSQL; operator chuẩn bị, CD dùng lại. Không phải file bootstrap tổ chức.                                                |
| `.env.app`                             | Cấu hình API/worker như JWT, SMTP; operator chuẩn bị. Không chứa các biến quản trị/URL database; Compose cấp URL runtime.                                       |
| `.env.bootstrap`                       | Thông tin tổ chức/phòng/Super Admin và mật khẩu cho lần cài đầu. Tạo riêng trên VPS, chỉ owner đọc, không commit hay đưa vào image/CI.                          |
| `.env.bootstrap.example`               | Template rỗng trong repo, copy thủ công lên VPS; dùng để tạo file thật, không chứa credential dùng được. Có thể giữ để tham khảo.                               |
| `bootstrap-installation.sh`            | Wrapper chạy thủ công sau CD xanh; copy lên VPS từ cùng revision với image có mode mới. Không tự chạy trong CD.                                                 |
| `docker-compose.prod.yml`, `Caddyfile` | Cấu hình live của release; CD chuyển bản ứng viên lên và promote sau các bước tiền điều kiện.                                                                   |
| `releases/`                            | Image/attempt hiện hành, ứng viên theo SHA, script deploy, khóa host và bằng chứng phục hồi. Không phải thư mục tạm để xóa sau deploy.                          |
| `backups/postgres/`                    | Bản sao lưu trước migration, do quy trình deploy quản lý; bảo vệ theo [quy tắc backup](containers.md#the-pre-migrate-dump-is-a-protected-operational-document). |

Vì vậy VPS **không chỉ có bốn file env/script**. Database và chứng chỉ Caddy còn nằm trong Docker volumes do
[Compose production](../../docker-compose.prod.yml) quản lý. Code chạy bên trong Docker image; VPS không bắt buộc giữ
toàn bộ checkout `src/` để vận hành theo CD này.

## 1. Deploy image có hỗ trợ đọc mật khẩu qua stdin

Commit/push phần CLI và wrapper, chờ CI/CD của revision đó xanh. Image phải có `--password-stdin`; chỉ copy script mới
không bổ sung được mode này vào một image cũ. Script đọc `releases/current-image`, kiểm `installation-cli.js --help`
và từ chối image chưa hỗ trợ trước khi gửi mật khẩu. Không dùng tag `latest` thay cho image đã được ghi nhận.

**Giữ nguyên database đã tạo; không reset lại để cập nhật image.** Chạy khi CD đã kết thúc, không có deploy song song:
wrapper không giữ khóa host của script deploy. VPS chỉ cần Bash 4+ và Docker Compose, không cần cài Node/pnpm trên host.

## 2. Copy wrapper và template lên VPS

CD hiện chỉ chuyển Compose, Caddyfile và script deploy. Hai file bootstrap phải được copy riêng.
Từ máy có checkout đúng revision, tại gốc repo BE (thay `YOUR_VPS_HOST` bằng host/SSH alias đang dùng):

```sh
scp scripts/ops/bootstrap-installation.sh .env.bootstrap.example deploy@YOUR_VPS_HOST:/opt/slm/backend/
```

Trong terminal SSH của VPS, chạy bằng user sẽ sở hữu file cấu hình (ví dụ `deploy`):

```sh
cd /opt/slm/backend
sed -i 's/\r$//' bootstrap-installation.sh .env.bootstrap.example
```

Lệnh `sed` đưa **script và template** được copy từ Windows về LF; không đọc hay sửa file cấu hình thật có mật khẩu.
Script được gọi bằng `bash` nên không cần bật quyền executable riêng.

## 3. Tạo và điền cấu hình riêng

Chỉ tạo file ở lần đầu. Lệnh sau từ chối ghi đè nếu `.env.bootstrap` đã tồn tại; khi đó giữ file đó và bỏ qua lệnh tạo:

```sh
(umask 077; set -C; cat .env.bootstrap.example > .env.bootstrap)
chmod 600 .env.bootstrap
nano .env.bootstrap
```

Điền các khóa có sẵn trong template; không tạo mật khẩu mặc định:

- Tổ chức: `BOOTSTRAP_TIMEZONE`, `BOOTSTRAP_ORGANIZATION_NAME`.
- Phòng đầu tiên: `BOOTSTRAP_DEPARTMENT_CODE`, `BOOTSTRAP_DEPARTMENT_NAME`.
- Người giữ Super Admin: `BOOTSTRAP_ADMIN_CODE`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`,
  `BOOTSTRAP_ADMIN_HIRE_DATE`, `BOOTSTRAP_ADMIN_PASSWORD`.
- Căn cứ vận hành được ghi audit: `BOOTSTRAP_OPERATOR_REFERENCE`.
- Tùy chọn: `BOOTSTRAP_CURRENCY` (mặc định VND), `BOOTSTRAP_LOGIN_EMAIL` (mặc định email công việc),
  `BOOTSTRAP_ADMIN_TYPE` (mặc định STAFF). Môi trường do wrapper cố định là `SHARED`.

Múi giờ tổ chức không thay đổi được sau cài đặt; ngày vào làm theo `YYYY-MM-DD`, không ở tương lai. Dùng giá trị thực,
không placeholder. Mật khẩu do người giữ vai chọn, tuân theo chính sách hiện có (12–128 ký tự, không phải email).

### 3.1. Giải thích từng biến bootstrap

`.env.production.bootstrap` dùng cùng danh sách biến với `.env.bootstrap`; tên file không làm đổi hành vi. Khi dùng
tên này trên VPS, truyền đúng đường dẫn cho `--config`, ví dụ `/opt/slm/backend/.env.production.bootstrap`, và áp dụng
cùng quyền `600`. Bảng dưới mô tả [template rỗng](../../.env.bootstrap.example), không chứa dữ liệu hay mật khẩu thật.

| Biến                           | Bắt buộc / mặc định                    | Dùng để làm gì?                                                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BOOTSTRAP_TIMEZONE`           | Bắt buộc                               | Múi giờ IANA của tổ chức, ví dụ `Asia/Ho_Chi_Minh`; dùng cho ngày nghiệp vụ và kiểm ngày vào làm. Không đổi được sau cài đặt; không phải cấu hình đổi timezone của container/PostgreSQL.                                                            |
| `BOOTSTRAP_ORGANIZATION_NAME`  | Bắt buộc                               | Tên tổ chức được tạo trong hệ thống; không phải domain, tên database hay tên Docker project.                                                                                                                                                        |
| `BOOTSTRAP_DEPARTMENT_CODE`    | Bắt buộc                               | Mã phòng ban đầu tiên, nơi đặt hồ sơ nhân viên Super Admin. Dùng định dạng mã của `QĐ-93i`: chữ in hoa/số, nối bằng `-`, 2–20 ký tự (ví dụ `HQ`, `P-BGD`).                                                                                          |
| `BOOTSTRAP_DEPARTMENT_NAME`    | Bắt buộc                               | Tên hiển thị của phòng ban đầu tiên. Bootstrap chưa tạo Cost Center, trưởng phòng hoặc IT Admin phụ trách cho phòng này.                                                                                                                            |
| `BOOTSTRAP_ADMIN_CODE`         | Bắt buộc                               | Mã nhân viên của người giữ Super Admin, định dạng `QĐ-93i` như mã phòng nhưng 3–20 ký tự (ví dụ `SA-001`). Không phải tên đăng nhập; hệ thống đăng nhập bằng email.                                                                                 |
| `BOOTSTRAP_ADMIN_NAME`         | Bắt buộc                               | Họ tên của người giữ Super Admin, lưu trong hồ sơ nhân viên.                                                                                                                                                                                        |
| `BOOTSTRAP_ADMIN_EMAIL`        | Bắt buộc                               | Email công việc trong hồ sơ nhân viên; cũng là email đăng nhập nếu không chỉ định `BOOTSTRAP_LOGIN_EMAIL`. Đây không phải tài khoản/mật khẩu SMTP.                                                                                                  |
| `BOOTSTRAP_ADMIN_HIRE_DATE`    | Bắt buộc                               | Ngày vào làm của nhân viên, định dạng `YYYY-MM-DD`, là ngày hợp lệ và không sau ngày hiện tại theo múi giờ tổ chức. Không phải ngày hết hạn tài khoản.                                                                                              |
| `BOOTSTRAP_OPERATOR_REFERENCE` | Bắt buộc                               | Mã/tham chiếu ticket hoặc phê duyệt cho thao tác cài đặt, được ghi vào Audit Trail để truy vết operator. Không phải mật khẩu, token hoặc tài khoản mới; tối đa 100 ký tự sau trim.                                                                  |
| `BOOTSTRAP_ADMIN_PASSWORD`     | Bắt buộc                               | Mật khẩu đăng nhập ban đầu của Super Admin. Nhập mật khẩu gốc, không tự hash trước; CLI kiểm chính sách rồi hash trước khi ghi DB. Từ 12–128 ký tự sau chuẩn hóa Unicode NFC, không bằng email đăng nhập; giữ khoảng trắng và phân biệt hoa/thường. |
| `BOOTSTRAP_CURRENCY`           | Tùy chọn; `VND`                        | Đồng tiền báo cáo của tổ chức; mã 3 chữ hoa và phải có trong danh mục tiền tệ của bản cài đặt. Không tự tạo tỷ giá hoặc dữ liệu ngân sách.                                                                                                          |
| `BOOTSTRAP_LOGIN_EMAIL`        | Tùy chọn; dùng `BOOTSTRAP_ADMIN_EMAIL` | Email dùng để đăng nhập tài khoản Super Admin. Có thể khác email công việc; nếu điền thì đăng nhập bằng giá trị này, không phải mã nhân viên.                                                                                                       |
| `BOOTSTRAP_ADMIN_TYPE`         | Tùy chọn; `STAFF`                      | Loại nhân sự: `STAFF`, `CONTRACTOR`, `FREELANCER` hoặc `INTERN`. Không phải role/phân quyền; tài khoản do bootstrap tạo vẫn giữ vai `SUPER_ADMIN`.                                                                                                  |

Các biến bắt buộc không được rỗng; biến tùy chọn để rỗng sẽ dùng mặc định CLI. Wrapper cố định môi trường `SHARED`;
không thêm khóa như `BOOTSTRAP_ENVIRONMENT` vào file này. Thay các giá trị sau khi đã cài đặt không cập nhật hồ sơ, tổ chức hay mật khẩu
trong DB; bootstrap chạy lại trả trạng thái đã cài, không ghi đè.

### 3.2. Mật khẩu được lưu ở đâu và có hash không?

**Có. Mật khẩu tài khoản ứng dụng, bao gồm Super Admin do bootstrap tạo, được hash bằng Argon2id trước khi lưu DB.**
Wrapper chỉ vận chuyển mật khẩu gốc qua stdin, không tự hash và không ghi trực tiếp vào DB. Luồng hiện tại:

1. Wrapper đọc `BOOTSTRAP_ADMIN_PASSWORD` từ file riêng và gửi qua stdin cho `installation-cli.js --password-stdin`.
2. CLI gọi `InstallationService.install`; service gọi `IdentityAccessService.prepareCredential` trước khi mở transaction.
3. `CredentialService` kiểm chính sách; `PasswordHasher` chuẩn hóa Unicode NFC và hash bằng Argon2id.
4. Service tạo Super Admin và chuyển **hash** tới `CredentialRepo`; DB lưu trong `password_credentials.hash`, kèm
   `hash_policy_version`. Khi đăng nhập, hệ thống dùng hàm verify để so mật khẩu nhập vào với hash, không giải mã hash.

Nguồn đối chiếu: [installation service](../../src/modules/installation/public/installation.api.ts),
[identity facade](../../src/modules/identity-access/public/identity-access.api.ts),
[credential service](../../src/modules/identity-access/credentials/credential.service.ts),
[password hasher](../../src/modules/identity-access/credentials/password-hasher.service.ts),
[credential repository](../../src/modules/identity-access/credentials/credential.repo.ts),
[Prisma model](../../prisma/models/identity-access.prisma) và
[kiểm mật khẩu khi đăng nhập](../../src/modules/identity-access/auth/login.service.ts).

**File env riêng vẫn chứa mật khẩu gốc dạng văn bản.** Hash trong DB không mã hóa file `.env.bootstrap` hoặc
`.env.production.bootstrap`. Giữ quyền `600`, không commit/copy vào image/log; sau khi dùng có thể bỏ dòng mật khẩu
hoặc xóa file theo lựa chọn operator. Không điền hash vào biến password: nếu làm vậy hệ thống coi chuỗi hash là mật
khẩu mới và hash nó thêm lần nữa. Quy tắc trên nói về mật khẩu tài khoản ứng dụng; không có nghĩa mọi secret SMTP,
PostgreSQL hoặc khóa JWT trong các file env khác đều được xử lý bởi `PasswordHasher` này.

Kiểm quyền/chủ sở hữu mà không in nội dung file:

```sh
stat -c '%a %U' .env.bootstrap
```

Kết quả cần là `600` và user đang chạy wrapper; script từ chối symlink, file của user khác và quyền group/others.
Giữ file riêng trên VPS, được Git bỏ qua và `.dockerignore` loại khỏi image; không gửi nội dung file vào chat/log/artifact.

## 4. Chạy bootstrap

```sh
bash bootstrap-installation.sh \
  --app-dir /opt/slm/backend \
  --config /opt/slm/backend/.env.bootstrap
```

Wrapper tự lấy thông tin và mật khẩu từ file; không hỏi mật khẩu tương tác trong mode này. Nó dùng service `api`
với runtime role qua `docker compose run --rm --no-deps -T`, gửi đúng một dòng mật khẩu qua stdin từ builtin shell.
Mật khẩu không đi vào argv, Docker env, Compose interpolation, image metadata, log/audit hay file tạm; tracing tắt
trước khi đọc cấu hình. Không dùng `source`, `eval`, biến môi trường kế thừa hay mật khẩu fallback.

| Mã thoát          | Ý nghĩa / xử lý                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `0`               | Đã tạo tổ chức, phòng đầu tiên và Super Admin. Tiếp tục bước kiểm tra dưới đây.                             |
| `2`               | Đã cài trước đó, không thay đổi gì. Inspect trạng thái hiện có; không reset hoặc ghi đè tài khoản.          |
| `3`               | Wrapper từ chối trước khi chạy lệnh cài đặt: kiểm cấu hình, quyền file, image hoặc `--help` theo thông báo. |
| `130`             | Lệnh bị hủy. Kiểm trạng thái trước khi thao tác tiếp.                                                       |
| `1` hoặc lỗi khác | Cài đặt lỗi; không mặc định rằng chưa ghi gì, vì phản hồi COMMIT có thể bị mất. Inspect trước khi chạy lại. |

Service, validation, transaction và Audit Trail là của CLI cũ, không có đường seed/SQL riêng.
Gọi trực tiếp CLI không có `--password-stdin` vẫn dùng hai prompt mật khẩu ẩn như trước.

## 5. Kiểm tra cài đặt và đăng nhập

Sau bootstrap, tại cùng thư mục VPS:

```sh
export API_IMAGE="$(head -n 1 releases/current-image)"
docker compose -f docker-compose.prod.yml run --rm --no-deps migrate node dist/inspect-cli.js
docker compose -f docker-compose.prod.yml run --rm --no-deps migrate node dist/migration-preflight-cli.js
```

`inspect` cần exit `0` (installed and consistent), preflight cần `READY`/exit `0`; hai lệnh đọc chạy bằng deploy role.
Sau đó đăng nhập bằng email và mật khẩu Super Admin vừa cấu hình. CD/readiness xanh chỉ chứng minh tiến trình và kết
nối CSDL, không thay thế bằng chứng tổ chức/tài khoản đã khởi tạo. Ghi revision/image, CI/CD và kết quả thực tế vào
bảng theo target của [Task 1.2b action 9](../workspace/items/g0-g6-final-business-baseline-remediation/plan.md#task-12b-mốc-gán--owneroperator-gán-từng-thuê-bao-f02).

Sau cài đặt, phòng đầu tiên chưa có Cost Center, trưởng phòng hoặc IT Admin phụ trách; thiết lập tiếp qua các luồng
nghiệp vụ của ứng dụng. Vai được cấp trực tiếp (`QĐ-93a`): Super Admin cấp `MANAGER` cho một người **trước** khi gán
người đó làm trưởng phòng, và cấp `SPENDING_APPROVER` cho Người duyệt chi; tới khi có người giữ vai này, Request trả phí
và phiên bản ngân sách đã gửi chờ có kiểm soát (`NO_SPENDING_APPROVER`). Dataset nhân viên/demo là việc riêng, sau bootstrap: [seed](seed.md).

## Những lần deploy sau và lưu cấu hình

Giữ nguyên database thì không bootstrap lại, dù deploy image mới. Thay mật khẩu trong `.env.bootstrap` sau cài đặt
không đổi mật khẩu tài khoản đã tạo; dùng luồng đổi/khôi phục mật khẩu hiện có.

Có thể giữ `.env.bootstrap` được bảo vệ để phục vụ việc cài mới có chủ ý sau này, hoặc bỏ dòng mật khẩu/xóa file khi
không còn cần (operator quyết định). Wrapper không tự sửa/xóa file; template rỗng có thể giữ lại. Không cần làm lại
CI/CD chỉ vì chỉnh cấu hình bootstrap trước lần cài đầu; image đã hỗ trợ mode mới là đủ.

## Cú pháp file cấu hình

- Một `NAME=VALUE` mỗi dòng, không dấu cách quanh `=`, không `export`, không comment sau giá trị. Chỉ dòng bắt đầu bằng
  `#` là comment; dòng trống được bỏ qua. Dùng LF; CRLF/NUL bị từ chối.
- Giá trị sau dấu `=` đầu tiên được giữ nguyên, không mở rộng `$variable`, backtick, `$(command)` hay escape; không trim.
  Bỏ đúng một cặp nháy ngoài cùng nếu khớp. Ví dụ `'  edge spaces  '` giữ khoảng trắng; nháy mở không đóng bị từ chối.
- Unicode, dấu cách và ký tự shell được truyền như dữ liệu. Tên khóa lạ, trùng, thiếu hoặc giá trị bắt buộc rỗng bị từ
  chối trước Docker; giá trị tùy chọn rỗng dùng mặc định CLI. Domain CLI kiểm giá trị và chính sách mật khẩu trước ghi.
- Stdin mode của CLI nhận một bản ghi UTF-8: mật khẩu + một LF rồi EOF, tối đa 1024 byte, 10 giây; không CR, dòng thứ hai
  hay ký tự điều khiển. Wrapper tự tạo đúng bản ghi này, không cần operator viết pipe chứa mật khẩu.

## Phạm vi kiểm chứng

[`bootstrap-installation.test.mjs`](../../scripts/verify/bootstrap-installation.test.mjs) dùng Docker giả để kiểm argv,
stdin, kiểm cấu hình và mã thoát. Unit của CLI kiểm parser/chọn nguồn/đọc mật khẩu. Chúng không chứng minh cài đặt trên
VPS; bằng chứng vận hành là kết quả thật ở bước 5. Hướng dẫn này không xác nhận server nào đã bootstrap thành công.

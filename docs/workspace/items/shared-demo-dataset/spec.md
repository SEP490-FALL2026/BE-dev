# Spec: dataset demo của VPS dùng chung — fixture có phiên bản, lệnh `ops:demo-dataset` qua API, wrapper và runbook

- Phụ trách: AI theo giao việc Owner (30/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (đầu việc B của yêu cầu 30/10/2026: dữ liệu demo + hướng dẫn nạp VPS).
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `578f442` (nghiệp vụ hiện hành; hạng mục không thêm hay đổi nghiệp vụ), BE `25d5244` (bắt đầu trên
  `3dffadd`; `25d5244` là commit CI/test harness của luồng khác, không chạm file của hạng mục này).
- Nhóm roadmap: xuyên module — hạng mục là `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Vận hành: [demo-dataset](../../../guides/demo-dataset.md).

## Business outcome

Sau lát này operator nạp được một dataset demo có phiên bản (`shared-demo-v1`) vào VPS dùng chung đã bootstrap, chỉ qua
API đang chạy và đúng vai nghiệp vụ: xem trước không ghi, chạy lại không tạo trùng, lỗi giữa chừng thì chạy tiếp được, dữ
liệu ngoài dataset không bị ghi đè; FE nhận alias tài khoản + mật khẩu riêng để kiểm thử 9 trạng thái Request và các màn
liên quan. Hai đường chạy cùng một lệnh: (A) wrapper trên VPS với image mới, (B) từ máy local (Windows) bằng bản build
local, API HTTPS của VPS và SSH tunnel tới PostgreSQL, chỉ khi schema/contract của checkout giống hệt bản đang deploy.
Kiểm bằng integration test với API thật trên PostgreSQL cô lập và test của hai wrapper; nạp thật trên VPS là bước của
Owner theo runbook.

## Sizing decision

- Container: yêu cầu trực tiếp của Owner 30/10/2026 (đầu việc B: bộ dữ liệu demo, công cụ và hướng dẫn nạp VPS).
- Mode: `technical-enabler`.
- Outcome and owner: dataset demo nạp an toàn vào cài đặt đang chạy; lệnh `src/cli/demo-dataset/`, capability
  `installation/demo-dataset` (tài khoản demo qua `DemoAccountsApi`), wrapper `scripts/ops/demo-dataset.sh` (cách A) và
  `scripts/ops/demo-dataset-local.mjs` (cách B).
- Boundaries: không migration, bảng, route hay contract HTTP mới; dữ liệu nghiệp vụ chỉ ghi qua route HTTP hiện có;
  ghi trong tiến trình chỉ là tài khoản demo, một transaction mỗi lượt, qua hợp đồng `LocalDemoAccountApi` có sẵn; mọi
  ghi có Audit Trail; quyền là quyền của vai đăng nhập.
- Not larger: tài liệu API cho FE nằm ở repo Docs (`Figma UI-UX/API-Integration`), không phải hạng mục BE; nạp thật,
  bàn giao tài khoản và phiên bản dữ liệu sau là việc riêng.
- Not smaller: fixture, lệnh, wrapper và runbook phục vụ cùng một thao tác của operator; thiếu một phần thì không nạp
  được an toàn trên VPS.
- Siblings: none.
- Scope map: n/a

## Primary Story/AC

| Story | AC               | Coverage | Phần còn lại thuộc                                                                                                   |
| ----- | ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| —     | `DEMO-DATASET.1` | n/a      | gỡ chặn `shared-demo-dataset-vps-load` (tên dự kiến): Owner nạp theo runbook, lưu báo cáo, bàn giao tài khoản cho FE |

`DEMO-DATASET.1` = các yêu cầu B của Owner: fixture giả có phiên bản và quan hệ nhất quán; bảng kịch bản; `plan`/`apply`;
chứng minh đúng đích; từ chối xung đột khóa nghiệp vụ; chạy lại không trùng; tiếp tục sau lỗi; không cleanup phá hủy;
mật khẩu qua file riêng hoặc stdin, hash bằng service có sẵn; runbook image/copy/config/preview/apply/verify/DB role; test
tích hợp trên PostgreSQL cô lập. Review Prompt 08 (30/10) bổ sung: một `apply` mỗi lúc (khóa), cửa sổ lịch hoặc từ chối,
mô tả đúng việc `plan` ghi phiên đăng nhập, bản ghi đã có lệch fixture là xung đột, danh sách vượt giới hạn đọc là xung
đột; và yêu cầu Owner cùng ngày: đường chạy từ máy Windows (bản build local, API HTTPS, SSH tunnel, kiểm tương thích bản
đang deploy, runtime role, mật khẩu ngoài argv/log/Git).

## Supporting references

[Operational commands](../../../rules/operational-commands.md) (8 quy tắc, nhất là 3, 5, 6, 8);
[bootstrap-installation](../../../guides/bootstrap-installation.md) (mẫu wrapper, `.env` riêng, stdin);
[installation-local-data-h6-1-h6-2](../installation-local-data-h6-1-h6-2/spec.md) (hợp đồng tài khoản demo H6.2);
[containers](../../../guides/containers.md#postgresql-roles-h7) (vai runtime/deploy H7);
[ADR-0019](../../../decisions/0019-module-tiers-and-public-api.md) (tầng module, `public/`).

## Explicit out of scope

- Dữ liệu cho phần chưa hiện thực G7–G10 (usage, khuyến nghị ghost seat, gia hạn/chi phí/hóa đơn, đối soát, AI, mobile).
- Đóng seat baseline (vĩnh viễn) và yêu cầu tài khoản dịch vụ: dataset cố ý để baseline mở.
- Gỡ/cleanup dataset, endpoint seed/reset, tự seed lúc khởi động, migrate hay CI/CD; mọi thay đổi của `dev:seed` và ba
  chốt local của nó.
- Chạy thật trên VPS bằng cả hai cách, SSH tới VPS thật, commit/push/deploy (Owner).
- Mở cổng PostgreSQL công khai, thay image API/worker, dùng `dev:seed` cho VPS.
- Hồ sơ điều chuyển/nghỉ việc trong dataset (API có; dataset chỉ không có dữ liệu mẫu cho các màn đó).

## Dependencies and blockers

- Cách A: image chứa lệnh — Owner commit → CI/CD deploy (`releases/current-image` mới). Wrapper từ chối image cũ (exit 3).
- Cách B: checkout chứa lệnh, `prisma/` và `openapi.json` giống hệt commit của `releases/current-image`; SSH bằng khóa
  với user chạy được `docker`; ba giá trị runtime role từ `.env` của VPS chép tay vào file riêng.
- VPS đã bootstrap, `ops:inspect` exit 0, tiền tệ báo cáo `VND`; ngày nghiệp vụ 01/01–30/11 cho `apply`. Không blocker
  kỹ thuật khác.

## Ownership: module, data, API

- `installation`: thư mục `demo-dataset/` (`DemoDatasetModule`, đồ thị riêng của lệnh, nạp `RuntimeDatabaseRoleModule`),
  `public/demo-accounts.api.ts` (`DemoAccountsApi`: `inspect`, `findEmployees`, `describe`, `create`, `holdApplyLock`),
  `public/demo-accounts.types.ts`,
  `DemoAccountsChangedError` trong `public/installation.errors.ts`. Đọc qua `OrganizationApi`, `IdentityAccessApi`; ghi
  qua `LocalDemoAccountApi` (identity-access, local seed facade) và `AuditApi`. Không query bảng của module khác.
- Infrastructure: `src/infrastructure/database/session-advisory-lock.ts` (`trySessionAdvisoryLock`: khóa advisory phiên
  trên một kết nối `pg` riêng, nhả idempotent).
- CLI: `src/cli/demo-dataset/` (lệnh, tham số, stdin, client HTTP, runner, báo cáo, lịch, fixture, bước), một dòng ở
  `src/cli/commands.ts` (alias `dist/demo-dataset-cli.js`), `pnpm ops:demo-dataset`.
- Host: `scripts/ops/demo-dataset.sh`, `.env.demo-dataset.example` (cách A); `scripts/ops/demo-dataset-local.mjs`,
  `.env.demo-dataset-local.example` (cách B); mẫu rỗng, `.gitignore` cho phép đúng hai mẫu.
- Gate: `module-graph` (đồ thị chỉ lệnh nạp, export công khai), `operational-commands` (thư mục lệnh, alias caller).
- HTTP: không thêm/đổi route; `openapi.json` không đổi.

## Behavior and design

**Thứ tự và vai.** Tổ chức (Super Admin: phòng `DS1-*` không IT Admin → nhân viên → tài khoản demo trong tiến trình → IT
Admin phụ trách → trưởng phòng → vai trò phê duyệt) → Cost Center (Finance) → danh mục (IT Admin của `DS1-ITO`: ứng dụng,
gói, thuê bao) → hồ sơ thuế → ngân sách năm của `DS1-ENG` (trưởng phòng đề xuất → Finance lập phiên bản → gửi → Người
duyệt chi duyệt) → 9 Request (nhân viên gửi; trưởng phòng duyệt/từ chối/trình lô; Người duyệt chi; IT Admin cấp) → bản
nháp, phiếu báo lỗi SaaS, thông báo BM-09. Mỗi bước đọc trạng thái trước rồi chỉ ghi phần thiếu.

**Nhận lại dữ liệu đã có.** Phòng/nhân viên/Cost Center theo mã; ứng dụng theo tên + Business Owner là người của fixture;
Request theo Audit Trail `ACCESS_REQUEST.SUBMITTED` của người yêu cầu và thẻ `[DS1-Rn]` ở đầu `businessReason` hoặc
`proposal.purpose`; phiếu báo lỗi/thông báo theo thẻ `[DS1-ISSUE]`/`[DS1-NOTICE]`; đường đi tới trạng thái đích theo
bảng `nextScenarioAction` (`steps/scenario-path.ts`). Bản ghi nhận ra được còn phải **khớp fixture** ở các trường mà
route trả về (họ tên nhân viên, gói và thuê bao, phòng của Cost Center, nhóm thuế, gói của Request…; bảng đầy đủ ở
[runbook](../../../guides/demo-dataset.md#1-lệnh-làm-gì-và-không-làm-gì)); lệch ⟹ `conflict`, không ghi đè, không coi là
`present`. Dùng lại có chủ đích (ghi trong runbook): ngân sách `APPROVED` ở mọi phiên bản, bản nháp cùng gói, mật khẩu
demo đã có. Danh sách đọc tối đa `MAX_PAGES` = 50 trang; dài hơn ⟹ `DemoInventoryIncompleteError` ⟹ `conflict`, không
bao giờ coi là "chưa có" rồi gửi thêm.

**Một `apply` mỗi lúc.** Sau khi đọc dữ kiện cài đặt, `apply` lấy `DemoAccountsApi.holdApplyLock(fixture)`:
`pg_try_advisory_lock(hashtextextended('demo-dataset:<fixture>:apply', 0))` trên một kết nối riêng (không transaction mở
trong lúc gọi HTTP). Không lấy được ⟹ exit 3, chưa ghi gì. Khóa nhả trong `finally` và PostgreSQL tự nhả khi kết nối
đóng (tiến trình chết, tunnel đứt). Khóa theo database nên cách A và B loại trừ nhau. `plan` không lấy khóa.

**Lịch** (`demo-dataset-calendar.ts`, ngày nghiệp vụ của tổ chức). Năm tài chính phải bắt đầu tháng 1. Năm của dataset
là năm nghiệp vụ (múi giờ tổ chức, không phải UTC) của lượt nạp đầu trong Audit Trail: khác năm hiện tại ⟹ cả `plan` và
`apply` từ chối;
`apply` sau 30/11 ⟹ từ chối (R1/R2 trả tiền một tuần sau, kỳ cuối không được rơi sang năm sau). Từ chối là exit 3, trước
mọi lần ghi.

**Vai PostgreSQL.** Đồ thị lệnh nạp `RuntimeDatabaseRoleModule`; với `NODE_ENV=production` guard của nó dừng tiến trình
nếu vai đang nối là superuser, owner hay deploy role — như API và worker.

**Cách B** (`scripts/ops/demo-dataset-local.mjs`). Theo thứ tự, dừng ở bước đầu không đạt (exit 3, chưa mở tunnel): file
riêng đọc như dữ liệu và không commit được; `dist/` có lệnh, mới hơn `src/`; SSH `BatchMode` đọc
`releases/current-image` (tag 40 hex); checkout có commit đó và `git diff <sha> -- prisma openapi.json` rỗng, không
migration chưa track; IP container PostgreSQL qua `docker inspect`; `ssh -N -o ExitOnForwardFailure=yes -L
127.0.0.1:<port>:<ip>:5432`; lệnh chạy với `NODE_ENV=production`, `DATABASE_URL` của runtime role chỉ trong env tiến
trình con, thư mục làm việc không có `.env`, mật khẩu Super Admin/demo qua stdin; luôn đóng tunnel; mã thoát giữ nguyên.

**Trạng thái bước.** `present`/`done`/`planned`; `waiting` (phụ thuộc mới chỉ được lập kế hoạch); `conflict` (dữ liệu
ngoài dataset giữ mã/tên/vai, hoặc API trả 4xx nghiệp vụ — không ghi đè); `blocked` (phụ thuộc xung đột); `failed`
(không tới được API, 5xx, lỗi khác — dừng cả lượt vì không biết đã ghi gì). Mã thoát: 0 đã ghi/đã lập kế hoạch · 2 không
còn gì để ghi · 4 có xung đột/bị chặn · 3 từ chối trước khi ghi · 1 lỗi giữa chừng.

**Chứng minh đích trước khi ghi.** Database có đúng một tổ chức tên `--organization`, tiền tệ báo cáo bằng của fixture, có
người giữ `SUPER_ADMIN`; Super Admin đăng nhập qua `--api-url` được và `/me` trả đúng `appUserId` đó. Sai ⟹ exit 3.

**Bí mật.** Hai mật khẩu chỉ qua stdin (`SUPER_ADMIN_PASSWORD=`, `DEMO_ACCOUNT_PASSWORD=`, LF, ≤ 2048 byte, 10 giây,
không TTY); mật khẩu demo 12–128 ký tự, hash Argon2id bằng `IdentityAccessApi.prepareCredential`; không vào argv, env
Docker, log, báo cáo hay Audit. Token chỉ trong bộ nhớ; mọi phiên được đăng xuất ở cuối lượt.

**HTTP.** 429 thử lại mọi method, 503 chỉ GET; chờ `Retry-After` (≤ 65 giây) hoặc backoff; 401 đăng nhập lại một lần.

**Giới hạn đã biết.** (1) `plan` không ghi bản ghi nào của dataset nhưng đăng nhập để đọc: ghi rồi kết thúc phiên,
refresh token và Audit đăng nhập/đăng xuất. (2) Seat baseline để mở ⟹ yêu cầu tài khoản dịch vụ trả
`409 SERVICE_ACCOUNT_REQUEST.BASELINE_NOT_CLOSED`. (3) Khóa nằm trên một kết nối: kết nối đứt thì khóa nhả trong khi lượt
chạy chỉ biết ở lời gọi database kế tiếp. (4) Cách B tin `releases/current-image`; container đổi ngoài quy trình deploy
thì phép kiểm tương thích không thấy. (5) Route không trả mọi trường (ví dụ nội dung bản nháp): phần không so được ghi
là dùng lại có chủ đích. (6) Không gỡ được bằng lệnh. (7) Không có dữ liệu mẫu điều chuyển/nghỉ việc.

Migration, job, storage: không áp dụng (không đổi schema, không job, không tệp).

## Test matrix

| AC / rủi ro                    | Tình huống (gồm từ chối, edge case)                                                                | Cấp test    | Kết quả mong đợi                                                                   | Bằng chứng sau implement                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- | -------------------------------------------- |
| Đúng đích                      | sai tổ chức, sai mật khẩu Super Admin, fixture lạ, API không tới được                              | integration | exit 3, số dòng nghiệp vụ không đổi                                                | xem [plan](plan.md#verification-and-handoff) |
| `plan` không ghi               | cài đặt trống                                                                                      | integration | `SẼ GHI`/`CHỜ`, không đổi bảng nghiệp vụ                                           | xem plan                                     |
| Tiếp tục sau lỗi + trạng thái  | API mất sau 20 lần ghi, rồi `apply` lại                                                            | integration | exit 1 rồi exit 0; R1→R9 đúng 9 trạng thái đích                                    | xem plan                                     |
| Chạy lại, hash, Audit          | `apply` lần nữa                                                                                    | integration | exit 2, không đổi dòng; 14 hash Argon2id; 14 Audit `OPERATOR`; không trùng Request | xem plan                                     |
| Xung đột không ghi đè          | `DS1-OPS` bị đổi tên tay                                                                           | integration | exit 4, phòng `conflict`, nhân viên `blocked`, tên giữ nguyên                      | xem plan                                     |
| Bản ghi của dataset bị sửa     | Finance đổi nhóm thuế của hồ sơ thuế dataset sau `apply`                                           | integration | exit 4, chỉ `finance.tax-profile` `conflict`, số dòng và nhóm giữ nguyên           | xem plan                                     |
| Một `apply` mỗi lúc            | kết nối khác đang giữ khóa của fixture; lượt lỗi giữa chừng                                        | integration | exit 3, không ghi; khóa đếm 1 khi giữ, 0 sau từ chối và sau lỗi                    | xem plan                                     |
| Lịch                           | ngày giả lập 30/11, 01/12, 04/01 năm sau; năm tài chính không bắt đầu tháng 1                      | integration | 30/11 tới R1→R9; 01/12 `apply` exit 3, `plan` đọc; sang năm cả hai exit 3          | xem plan                                     |
| Năm của lượt nạp đầu           | sự kiện Audit lúc 01/01 sớm ở múi giờ đông UTC (UTC còn 31/12) và ngược lại                        | unit        | năm theo múi giờ tổ chức, không theo UTC                                           | xem plan                                     |
| Danh sách vượt giới hạn        | danh sách dài hơn `MAX_PAGES`                                                                      | unit        | `DemoInventoryIncompleteError`, bước `conflict`, không gửi thêm                    | xem plan                                     |
| Cách B (local, SSH tunnel)     | thứ tự kiểm, mật khẩu chỉ ở stdin/env con, tunnel đóng cả khi lỗi, schema/contract lệch, tag lỏng  | script test | đúng argv; exit 3 trước tunnel; không lộ mật khẩu; mẫu rỗng khớp tập khóa          | xem plan                                     |
| Tham số, stdin, runner, client | đối số lạ/URL có path, bản ghi stdin thiếu LF/CR/trùng/TTY/quá cỡ, 429/503/401, phân loại bước     | unit        | từ chối không lộ giá trị; đúng trạng thái và mã thoát                              | xem plan                                     |
| Wrapper                        | tham số, image bất biến, mật khẩu chỉ ở stdin, mã thoát, cấu hình sai, mode lỏng, image thiếu lệnh | script test | đúng argv; từ chối trước Docker; không lộ mật khẩu                                 | xem plan                                     |
| Ranh giới đồ thị               | module lệnh không tới được từ API/worker; export công khai                                         | gate        | `module-graph`, `operational-commands` xanh                                        | xem plan                                     |

Planned khác passed. Bằng chứng ghi lệnh, revision và môi trường, không chứa secret hay token.

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — không áp dụng
      (`n/a`); hành vi của `DEMO-DATASET.1` có test ở bảng trên.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

30/10/2026: lập và hiện thực theo yêu cầu Owner (đầu việc B). Chưa commit, chưa chạy trên VPS, chưa Owner review, chưa
nghiệm thu: không có gì là `accepted`.

30/10/2026 (review Prompt 08 + yêu cầu Owner cùng ngày): khóa `apply`, lịch, so khớp bản ghi đã có, giới hạn danh sách,
mô tả `plan`, runtime role cho lệnh; thêm cách B từ máy Windows qua SSH tunnel. Vẫn chưa commit, chưa SSH, chưa chạy
trên VPS; trạng thái `local-ready-for-owner-review`.

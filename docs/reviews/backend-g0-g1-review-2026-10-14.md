# Review và kiểm chứng backend G0 / G1 — 14/10/2026

Reviewer: trợ lý AI (Claude) theo prompt review độc lập của Owner. **Đây không phải phê duyệt** spec/plan/ADR và
không thay xác nhận của một dev khác (quy trình [workspace](../workspace/README.md)). Không sửa source sản phẩm,
contract, migration, Docs; không commit/push. Runner và bằng chứng đã lọc nằm ở
[backend-g0-g1-review-2026-10-14/](backend-g0-g1-review-2026-10-14/README.md).

## 1. Kết luận

- **Code thực tế đã có:** G0 (modules `organization`, `audit`, `identity-access`, `notifications`, `installation`,
  `TransactionRunner`, 4 migration mới), lát 1a (CLI khởi tạo, Argon2id, JWT + refresh xoay vòng/phát hiện phát
  lại, login/refresh/logout, `/me`, guard khai báo quyền) và lát 1b (tạo tài khoản từ Employee, lời mời/kích hoạt,
  khóa/mở, gán/thu hồi vai, Finance một người, outbox mã hóa + worker SMTP). 16 operation HTTP. Phần còn lại của G1
  (đổi/đặt lại mật khẩu, tra cứu Audit Trail, chuyển giao/khôi phục Super Admin, vai suy ra) **chưa có code** — không
  phải regression.
- **Kiểm chứng kỹ thuật:** gate repo xanh (223 unit, 28 E2E, 147 integration trên PostgreSQL 17.11 với role không
  superuser, OpenAPI không drift, audit 0 lỗ hổng, Docker build), **trừ** `pnpm check` fail trên checkout sạch do thứ tự
  lint/generate (R-01). Live: khởi tạo qua PTY thật (Linux), API + worker là hai tiến trình build thật, SMTP sink thật,
  **16/16 operation** được gọi qua HTTP — 117 PASS / 2 FAIL (R-03, R-04); phase phụ thêm 3 vấn đề (R-02, R-07, ghi chú
  SIGTERM). 5/6 mutation bị test bắt. Ba finding P2, không có P0/P1.
- **Còn thiếu để nghiệm thu:** chưa dev nào review spec/plan/code; ADR-0011, ADR-0012 vẫn Proposed; plan 1a bước 8
  chưa xong; chưa thử TTY tương tác bởi người trên PowerShell; chưa có TLS SMTP/deliverability thật; tài liệu lệch
  (mục 8). Test xanh không làm ADR Accepted và không thay xác nhận của dev.

## 2. Revision và trạng thái

| Repo       | Trạng thái lúc review (14/10/2026 11:57 +07)                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BE         | `dev` = `origin/dev`, HEAD `64073c47ff59` (merge PR #4 từ `Bao_Dev`; `53605ef` 13/10 _finish G0, G1, wait dev review_; `1c890a5` 12/10 _spec 1, 2_). Working tree sạch lúc bắt đầu. Phạm vi diff `a065070..HEAD`: 134 tệp, +11 348 / −478 |
| Docs       | HEAD `0e0bb83`, 56 mục chưa commit lúc bắt đầu, **57** lúc 12:48 (BRD/Phạm vi đổi trong khi review, do phiên khác). Giữ nguyên toàn bộ                                                                                                    |
| FE         | `feat/merge-main` `ac63c61` — không thuộc phạm vi review                                                                                                                                                                                  |
| Môi trường | Windows 11, Node 24.0.1 (`engines >=22 <25`), pnpm 11.1.3 (= `packageManager`), Docker Desktop 29.1.2 (linux/amd64), PostgreSQL `postgres:17-alpine` 17.11, Redis 8.10.2, MinIO `RELEASE.2025-10-15T17-29-55Z` (build từ `infra/minio`)   |

Sau review: thêm **chỉ** tệp này và thư mục `backend-g0-g1-review-2026-10-14/` (untracked); `src/generated/` (đã ignore)
được sinh lại; `node_modules` nhận 8 gói còn thiếu qua `pnpm install --frozen-lockfile`. Xem mục 11.

## 3. Phạm vi đã đọc

- BE: `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `README.md`; `docs/rules/*`; `test/README.md`,
  `scripts/README.md`, `.github/workflows/ci.yml`, `Dockerfile`, `compose.yaml`, `package.json`, `pnpm-workspace.yaml`;
  roadmap, workspace README, sources; **đủ** spec/plan ba hạng mục (+ `research.md` lát 1a); ADR-0001→0005, 0011, 0012.
  Source đọc hết: mọi tệp `src/` thêm/sửa trong diff (controller → DTO → guard → service → repo → migration →
  audit/outbox, `app.module.ts`, `worker.module.ts`, entry point API/worker/CLI), test support; danh sách test từng suite.
- Docs (theo `Docs/AGENTS.md`, `rules/README.md`, `rules/context.md`): sổ quyết định `QĐ-39`, `41`, `44`, `46`, `47`,
  `52`, `66`, `67`, `68`; BRD `FR-8.1`, `8.3`, `8.6`→`8.11`, `FR-9.8`, `INV-05/15/20`; nguồn US `src/EP-01.md`
  (`US-01-01`, `US-01-06`, `US-01-10`), delta `src/EP-02.md`; Phạm vi (đã nạp trong phiên).
- Skill đã nạp: `superpowers:using-superpowers`, `code-review-and-quality`, `security-and-hardening`,
  `engineering:testing-strategy`, `superpowers:verification-before-completion`, `superpowers:systematic-debugging`
  (khi gate fail và khi ca SIGTERM bất thường). Không viết regression test vào repo nên không áp dụng TDD.

## 4. Nguồn yêu cầu và delta

Hash SHA-256 chuẩn hóa LF, không BOM ([evidence/docs-hashes.txt](backend-g0-g1-review-2026-10-14/evidence/docs-hashes.txt),
đo 12:48):

| Tệp                                        | Snapshot `S-2026-10-12b` ở `sources.md` | `0e0bb83`      | Working tree                           |
| ------------------------------------------ | --------------------------------------- | -------------- | -------------------------------------- |
| `BE-UserStory/epics/EP-01.md`              | `197d561a…bac69`                        | **khớp**       | **khớp**                               |
| `BE-UserStory/src/EP-01.md`                | `bbb22ccc…5097b`                        | **khớp**       | **khớp**                               |
| 10 tệp còn lại (BRD, Phạm vi, QĐ, US, ERD) | như `sources.md`                        | **khớp cả 10** | khác (BRD `3bddc8a2…`, QĐ `e1d28864…`) |

- **`S-2026-10-12b` đã được commit nguyên vẹn ở Docs `0e0bb83`** — `sources.md` (dòng 17) vẫn ghi "`982ea92` + thay đổi
  chưa commit"; điều kiện "người nhận truy cập được nguồn" của ba spec thực tế đã thỏa ở commit này (cần dev xác nhận).
- Delta working tree so với snapshot: BRD **3.37** (`FR-2.13` mới, `FR-2.1`, `FR-9.7`), Phạm vi **1.25**, `QĐ-68a`→`68f`,
  `US-02-07` mới, `US-02-02`/`02-03` sửa. **Không** đổi định nghĩa các yêu cầu ba spec dẫn: 12 dòng định nghĩa
  `FR-8.1/8.3/8.6–8.11`, `FR-9.8`, `INV-05/15/20` có cùng hash với `0e0bb83`; EP-01 không đổi. Không có lý do coi spec
  vô hiệu.
- Delta **có liên quan** tới G0: (a) `QĐ-68a/b/d` — một danh mục chức vụ, khớp tên bỏ qua hoa/thường **và khoảng trắng
  thừa**, có trạng thái ngừng dùng → R-10; (b) `QĐ-68f` nhắc lại `QĐ-66ak` (đã có từ 11/10, **trước** snapshot): thành viên
  phòng tính từ lúc ghi hồ sơ, quyền từ ngày vào; `OQ-A-26` cho ngày vào đã qua → I-2 của spec nền cần review lại trước
  G2 (R-11). `QĐ-68f` ghi rõ câu "từ ngày vào" của lệnh khởi tạo **không đổi** → lát 1a không bị ảnh hưởng.

## 5. Phạm vi thực tế

| Hạng mục   | Code                                                                                                                                                                 | Thiết kế / phê duyệt                                                | Đánh giá                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| G0         | 5 module, `TransactionRunner` (RC, `set_config` 3 s/5 s, Prisma 10 s/2 s, map SQLSTATE), migration audit/organization/identity, architecture test owner map 16 model | spec/plan **draft**, chưa dev review                                | Enabler đủ cho 1a/1b; trigger coverage I-2 hoãn G6 đúng phạm vi; JobTitle thiếu `status` (R-10) |
| G1 — 1a    | CLI `ops:bootstrap`, login/refresh/logout, `/me`, 3 guard, audit chỉ ghi thêm                                                                                        | draft; plan bước 8 chưa xong; ADR-0011 Proposed                     | Hành vi khớp spec trừ throttle (R-06); TTY Linux thật đã kiểm, PowerShell người dùng chưa       |
| G1 — 1b    | `/account-candidates`, `/app-users*`, redeem, outbox AES-256-GCM, `EmailDispatchLoop` (worker, không Redis)                                                          | draft; ADR-0012 Proposed; plan còn ghi "chưa commit/PR" dù đã merge | Hành vi khớp AC trong lát trừ R-03, R-05                                                        |
| G1 còn lại | Không có route/service: đổi/đặt lại mật khẩu (1c), tra cứu Audit Trail, `US-01-09`, vai Manager/Người duyệt chi suy ra                                               | roadmap `not-started`                                               | Chưa implement — không phải regression; `/me` trả `derived: []` có chủ đích                     |

Catalog: source/test giữ làm mẫu, không mount (`GET /catalog-applications` → 404 live H-3, E2E inventory).

## 6. Ma trận AC / bất biến → source → test → live

Ký hiệu live: mã check trong [live-smoke-results.json](backend-g0-g1-review-2026-10-14/evidence/live-smoke-results.json)
và [phase2-results.txt](backend-g0-g1-review-2026-10-14/evidence/phase2-results.txt).

| US/AC hoặc bất biến                    | Source chính                                                         | Test của repo                                                                     | Live (review)                                              | Kết quả / giới hạn                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `US-01-01` AC-19, `QĐ-67a/b`, `FR-9.8` | `installation.service.ts`, `installation-cli.ts`, `hidden-prompt.ts` | `installation.integration-spec` (6)                                               | PTY: notty/`--password`/mismatch/weak/Ctrl+C/success/rerun | Đạt; đúng dữ liệu QĐ-67a; exit 0/1/2/130; mật khẩu không vào transcript                                                                     |
| AC-1, AC-9, `US-01-10` AC-1            | `account-management.service.ts` `createAccount`, `redeemInvitation`  | `account-management-http` (30)                                                    | C-4, C-6, C-7, M-1…R-8                                     | Đạt; redeem không tự đăng nhập                                                                                                              |
| AC-2, AC-7, AC-16, AC-17 (vai gán)     | `grantRole`, `revokeRole`, `roles.policy.ts`, verifier               | `account-management-http`                                                         | G-1…G-4, G-8, K-6                                          | Đạt; vai đọc lại mỗi request; 0 vai → `selfServiceOnly`                                                                                     |
| AC-3                                   | `@RequireRoles('SUPER_ADMIN')`, `authorization.guard.ts`             | e2e `app`, `account-management-http`                                              | Z-1, Z-2                                                   | Đạt (M5 bị bắt)                                                                                                                             |
| AC-4, AC-12, AC-13, AC-14, AC-15       | `account-policy.ts`, migration `role_grants_*`, trigger tổ hợp       | `account-policy.spec`, `role-grant-constraints`, `account-invitation-constraints` | G-5.*, G-6, K-7                                            | Đạt; nhánh "không khóa người giữ SUPER_ADMIN" ở service không có test (R-08)                                                                |
| AC-5, AC-8                             | `createAccount` (khóa Employee `FOR SHARE`), unique                  | `account-management-http`, đồng thời                                              | C-5, D-6, X-4                                              | Đạt                                                                                                                                         |
| AC-6, `US-01-10` AC-6                  | `lock`, verifier mỗi request                                         | `auth-http` (fixture), `account-management-http`                                  | K-1…K-5, X-5                                               | Đạt; LOCKED/TERMINATED từ request kế tiếp                                                                                                   |
| AC-10, AC-11                           | `auth.service.ts` `login`                                            | `auth-http`                                                                       | A-3, C-6                                                   | Đạt; ba biến thể cùng body                                                                                                                  |
| AC-18, `QĐ-67e`                        | `financeIsHeld`, `role_grants_one_finance`                           | constraints + HTTP + đồng thời                                                    | F-1…F-4                                                    | Đạt; INVITED/LOCKED chiếm vị trí; 0 Finance được phép                                                                                       |
| `US-01-10` AC-2                        | `resendInvitation`, `account_action_tokens_one_usable`               | HTTP, đồng thời                                                                   | I-2…I-4, K-8, O-5                                          | Đạt                                                                                                                                         |
| `US-01-10` AC-7 (trừ vế đặt lại)       | `reserveAttempt`, `recordLoginFailure`                               | `auth-http` (4 ca throttle)                                                       | T-1…T-7                                                    | Đạt theo AC; lệch thuật toán so với spec (R-06)                                                                                             |
| `US-01-10` AC-8, AC-9                  | inventory, `AuditService` từ chối khóa bí mật                        | e2e inventory, `auth-http`, `account-management-http`                             | Y-1, Y-3, Y-6, M-3                                         | Đạt: 62 bí mật quan sát được không có trong audit/log                                                                                       |
| `US-01-06` AC-1…AC-3                   | `audit.repo.ts`, trigger append-only                                 | `audit.integration-spec`                                                          | C-7, Y-4, B-1, B-2                                         | Đạt; lỗi chèn có kiểm soát → rollback cả nghiệp vụ, audit, outbox                                                                           |
| I-1 (`INV-15`)                         | các model                                                            | —                                                                                 | —                                                          | Một phần: `app_users.employee_id`, `departments.cost_center_id` unique không có khóa tổ chức đứng đầu (UUID toàn cục nên không sai dữ liệu) |
| I-2 (`INV-20`)                         | `createEmployeeWithPlacement`, EXCLUDE `btree_gist`                  | `organization`, `placement-coverage`                                              | bootstrap: 2 placement mở từ ngày vào                      | Đạt trong 1a/1b; câu chữ I-2 cần review theo `QĐ-66ak` (R-11)                                                                               |
| I-3, I-4, I-5, I-8                     | migration organization/identity/invitation                           | `organization`, `role-grant-constraints`                                          | F-4, C-5                                                   | Đạt                                                                                                                                         |
| I-6, I-9                               | `markActivated`, verifier                                            | HTTP                                                                              | C-6, K-2, X-5                                              | Đạt (M1, M3 bị bắt)                                                                                                                         |
| Giao thức khóa                         | repo `lockAppUser`, `lockEmployee`                                   | `auth-concurrency`, `account-concurrency`, `transaction-runner`                   | P-1 (55P03 → 503), F-4                                     | Đạt; không thấy 40P01                                                                                                                       |

## 7. Ma trận route (16 operation)

Đối chiếu khớp: controller, `test/support/api-coverage-manifest.ts`, `openapi.json` (sinh lại, không drift).

| Operation                                   | Live — mã check                                     | Ghi chú                                             |
| ------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `GET /health/live`                          | H-1, W-3, RL-1                                      | Public; helmet có CSP/HSTS/nosniff                  |
| `GET /health/ready`                         | H-1, H-2, DB-1, DB-3                                | 503 dùng mã `INTERNAL_SERVER_ERROR` (R-12)          |
| `POST /auth/login`                          | A-3…A-5, T-1…T-7, P-1, DB-3, PR-2                   | Cookie dev/production đúng thuộc tính               |
| `POST /auth/refresh`                        | S-1, S-2, S-6, S-7, K-2, K-5, W-2, DB-3             | Phát lại thu hồi phiên + audit đã commit dù trả 401 |
| `POST /auth/logout`                         | S-3, S-4, S-7, DB-3                                 | 204 idempotent; 503 giữ cookie; Bearer bị bỏ qua    |
| `POST /auth/invitations/redeem`             | R-1…R-5, I-4, K-8, X-3, O-5                         | Policy trước token; lỗi chung 400                   |
| `GET /me`                                   | A-1, A-6, G-2…G-4, V-*, X-5                         | V-1b: `sid` không phải UUID → 503 (R-04)            |
| `GET /account-candidates`                   | C-1…C-3, C-8, C-9, X-4, Z-1                         | C-8 fail (R-03)                                     |
| `POST /app-users`                           | C-4, C-5, I-1, G-5.create*, D-1, D-4, D-6, B-1, Z-1 |                                                     |
| `GET /app-users`                            | A-2, L-1…L-5, Z-1                                   | `page=999999999` → 200 rỗng                         |
| `GET /app-users/{id}`                       | L-6, L-7, G-8, O-2, X-1                             |                                                     |
| `POST /app-users/{id}/invitations`          | I-2, I-5, K-8, X-4, O-3, O-5                        |                                                     |
| `POST /app-users/{id}/lock`                 | K-1…K-4, K-7, K-8, B-2, P-1, Z-1                    |                                                     |
| `POST /app-users/{id}/unlock`               | K-5, K-7, P-2                                       |                                                     |
| `POST /app-users/{id}/role-grants`          | G-1, G-5.*, G-7, F-1, F-2, F-4                      |                                                     |
| `DELETE /app-users/{id}/role-grants/{role}` | G-3, G-4, G-5.revoke*, F-3                          |                                                     |

## 8. Findings

Mức: P0 chặn/mất dữ liệu/lỗ hổng nghiêm trọng · P1 sai hành vi chính · P2 sai hợp đồng/khả dụng có tác động thật ·
P3 nhỏ, tiềm ẩn hoặc lệch tài liệu. **Không có P0/P1.**

### 8.1. Đã xác nhận bằng chạy thật

**R-01 (P2, gate, có từ baseline) — `pnpm check` fail trên checkout sạch.** [package.json:41](../../package.json):
`lint` chạy **trước** `prisma:generate`, nhưng lint có type-check dùng `src/generated` (đã ignore). Kỳ vọng:
CONTRIBUTING "`pnpm check` gồm sinh Prisma client trước typecheck…", CI bước "Run local quality gate". Bằng chứng: clone
sạch `64073c4` + `pnpm install --frozen-lockfile` → `pnpm lint` exit 1 (**464 problems**, 454 lỗi); sau
`pnpm prisma:generate` → exit 0. Trên máy review, client cũ (07/10, chỉ có catalog) làm `pnpm check` lần đầu fail
(302 lỗi). Thứ tự có từ `c82a5d1` (20/08) — không phải regression của 1a/1b, nhưng con số "`pnpm check` exit 0" trong plan
chỉ đúng khi client vừa sinh; suy ra job CI `quality` sẽ đỏ ở bước này (chưa xem được lịch sử Actions — `gh` chưa đăng
nhập). Hướng sửa: chuyển `pnpm prisma:validate && pnpm prisma:generate` lên trước `pnpm lint` (một dòng, cần PR).

**R-02 (P2, khả dụng) — Request treo vô hạn khi kết nối PostgreSQL treo.** [prisma.service.ts:12-19](../../src/infrastructure/database/prisma.service.ts):
pool `pg` không đặt `connectionTimeoutMillis`/`query_timeout` (mặc định `undefined`/`false`); `statement_timeout`
chỉ đặt trong `TransactionRunner`, và không có tác dụng khi server không trả lời. Kỳ vọng: [api-contract](../rules/api-contract.md)
"unreachable database is 503 … never 401", spec nền quy tắc 6 "Mất kết nối ⟹ 503". Bằng chứng (DB-1): `docker pause`
PostgreSQL → `/me`, login, refresh, `GET /app-users` **không trả lời sau 25 s** (client timeout); readiness 503 sau
1,5 s. Đối chứng (DB-3): `docker stop` → cả 6 route 503 đúng mã trong ~20 ms, API tự phục hồi (DB-4). Tác động: mất
mạng tới DB hoặc DB treo làm mọi request kể cả guard treo, giữ kết nối pool. Hướng sửa: đặt timeout kết nối/truy vấn
phía client cho adapter (ví dụ `connectionTimeoutMillis`, `query_timeout` hoặc `statement_timeout` qua `options`),
ánh xạ lỗi timeout sang `TransientDatabaseError`, thêm test integration với proxy TCP ngừng chuyển tiếp.

**R-03 (P2, chức năng) — `GET /account-candidates` bỏ sót ứng viên hợp lệ.**
[account-management.service.ts:113-116](../../src/modules/identity-access/account-management.service.ts) lấy 200 Employee
`ACTIVE` đầu tiên theo `employeeCode` ([organization.repo.ts:168](../../src/modules/organization/organization.repo.ts)),
rồi mới loại người đã có tài khoản và cắt 20. Kỳ vọng: spec 1b — "Employee không _đã nghỉ việc_, chưa có tài khoản",
tối đa 20. Bằng chứng (C-8, fixture SQL): 200 Employee mã `FXA-*` đã có tài khoản + 3 Employee `FXZ-*` chưa có →
**0 kết quả**; `?search=FXZ` → 3 (C-9). Người viết đã ghi giới hạn này ở spec 1b _Quyết định khi implement_ chờ reviewer
xác nhận — kết quả cho thấy nó vi phạm hợp đồng ngay với tổ chức ~200 người. Hướng sửa: lặp trang có giới hạn (keyset)
cho tới khi đủ 20 hoặc hết, hoặc facade `organization` nhận danh sách loại trừ do `identity-access` cung cấp; thêm
integration > 200 bản ghi.

**R-04 (P3) — Token chữ ký đúng nhưng `sid` không phải UUID → 503 thay vì 401, kèm log error.**
[token.service.ts:40](../../src/modules/identity-access/token.service.ts) chỉ kiểm kiểu string;
[jwt-access-token.verifier.ts:32-38](../../src/modules/identity-access/jwt-access-token.verifier.ts) biến **mọi** lỗi DB
(kể cả lỗi dữ liệu Prisma do UUID sai) thành `TokenVerificationUnavailableError`. Bằng chứng V-1: 503
`TOKEN_VERIFICATION_UNAVAILABLE`, log "Access token verification is unavailable". Đối chứng: `sid` UUID không tồn tại,
`sub` lệch, `sid` số, hết hạn, sai aud/iss, HS512, `none`, khóa khác → đều 401. Chỉ xảy ra khi có khóa ký (lỗi phát hành
hoặc lộ khóa) nên rủi ro thấp; nhưng sai hợp đồng và mở đường log error theo từng request. Hướng sửa: kiểm `sub`/`sid`
là UUID trong `verifyAccessToken`; chỉ ánh xạ 503 khi `toTransientError` nhận ra lỗi tạm thời.

**R-05 (P3, tiềm ẩn tới G6) — Thư mời vẫn gửi cho nhân viên đã nghỉ; chi tiết báo `usable: true`.**
[identity-access.repo.ts:446-465](../../src/modules/identity-access/identity-access.repo.ts) (`isTokenRedeemable`) và
[account-management.service.ts:553](../../src/modules/identity-access/account-management.service.ts) không xét trạng thái
Employee. Bằng chứng (fixture `TERMINATED`, chưa có API G6): X-1 `usable: true`; X-2 worker gửi thư `SENT` cho người đã
nghỉ; redeem vẫn bị chặn 400 (X-3), tạo/gửi lại bị chặn 409 (X-4). Spec 1b đã ghi là Minor hoãn. Hướng sửa: callback
đọc trạng thái Employee qua facade `organization`, hoặc G6 thu hồi token khi chuyển _đã nghỉ việc_.

**R-06 (P3, lệch spec) — Throttle đăng nhập đếm mọi lần thử trước khi băm.**
[auth.service.ts:65-73](../../src/modules/identity-access/auth.service.ts); spec 1a mục _Đăng nhập_ bước 1–3 (chỉ thất bại
mới tăng bộ đếm). Comment repo [identity-access.repo.ts:243](../../src/modules/identity-access/identity-access.repo.ts) vẫn
nói "Counts one failure". Bằng chứng: T-5 12 lần sai đồng thời → đúng 5 lần được kiểm, 7 × 429 (điểm mạnh so với bản spec);
T-6 **7 lần đăng nhập đúng đồng thời → 5 × 200, 2 × 429**; T-1/T-2/T-4 khớp AC-7. Lần đăng nhập đúng bị 503 (P-1) cũng để
lại +1. Lệch chưa được ghi ở spec/plan/ADR-0011. Hướng sửa: Owner/dev quyết giữ thiết kế (cập nhật spec 1a, ADR-0011 mục 6,
comment repo) hay đổi; không phải lỗi bảo mật.

**R-07 (P3, tài liệu/hành vi) — Rate limit toàn cục là theo (IP, route), không theo IP.** `@nestjs/throttler` 6.5.0 sinh
khóa `class-handler-name-IP`. Bằng chứng RL-1/RL-2 (giới hạn 10): `/health/live` bị 429 ở request 11, `logout` và `/me` vẫn
chạy. Spec 1a ghi "theo IP"; tổng hạn mức thực là 120/phút **mỗi route**. Hướng sửa: ghi rõ ở ARCHITECTURE/spec hoặc đặt
`generateKey` theo IP nếu muốn giới hạn chung.

**R-08 (P3, coverage) — Mutation M2 sống:** xóa kiểm "không khóa người giữ `SUPER_ADMIN`" ở
[account-management.service.ts:241](../../src/modules/identity-access/account-management.service.ts) không làm test nào
fail (unit 17, integration 30). Qua HTTP nhánh này chưa tới được (kiểm _chính mình_ chặn trước), nhưng sẽ tới được khi có
đường gọi khác (`US-01-09`). Hướng sửa: test service-level cho `lock` với người giữ `SUPER_ADMIN` là tài khoản khác.

**R-12 (P3) — Readiness 503 dùng mã `INTERNAL_SERVER_ERROR`** (filter `codeForStatus` cho mọi status ≥ 500;
DB-1, DB-3). Nên có mã khả dụng riêng (ví dụ `SERVICE_UNAVAILABLE`) để client/ops không đọc nhầm là lỗi lập trình.

**R-16 (P3, tài liệu triển khai) — Role migration cần quyền `CREATE` trên database ngay từ migration đầu.** Thử role không
có quyền này: `20261007000000_catalog_foundation` fail `42501` ở `CREATE SCHEMA IF NOT EXISTS "public"` (rollback sạch).
ADR-0011 chỉ nhắc quyền này cho `btree_gist`. Đã kiểm: role `NOSUPERUSER CREATEDB` sở hữu DB áp đủ 5 migration, `btree_gist`
do chính role đó sở hữu.

### 8.2. Lập luận tĩnh (chưa đo/tái hiện)

- **R-09 (P3)** — Redeem băm Argon2id (19 MiB, t=2) **trước** khi kiểm hình dạng/chủ token
  ([account-management.service.ts:366-375](../../src/modules/identity-access/account-management.service.ts)): mỗi request
  public tốn một lần băm, chỉ bị chặn bởi throttle 120/phút/IP cho route này. Spec chỉ đòi băm ngoài giao dịch. Đề xuất:
  policy → hình dạng → tra chủ → băm → giao dịch. Chưa chạy thử tải.
- **R-10 (P3, delta `QĐ-68`)** — `normalizedName` của chức vụ chỉ `trim().normalize('NFC').toLowerCase()`
  ([organization.repo.ts:67](../../src/modules/organization/organization.repo.ts)), không gộp khoảng trắng giữa; JobTitle
  không có `status` (spec nền Logical ghi `name, status`; `QĐ-68d` cần ngừng dùng). Hiện chỉ một bản ghi do khởi tạo tạo;
  cần migration ở lát G2 đầu tiên dùng danh mục.
- **R-11 (P3, delta spec)** — I-2 "`validFrom` giai đoạn đầu = `hireDate`" lệch `QĐ-66ak`/`QĐ-68f` cho người nhập ở G2;
  `OQ-A-26` còn mở. Không ảnh hưởng lệnh khởi tạo.
- **R-13 (P3)** — CLI khởi tạo import `IdentityAccessModule` → `JwtModule`, `NotificationsModule`
  ([installation.module.ts:11](../../src/modules/installation/installation.module.ts)): ở production người chạy lệnh phải
  có cả secret JWT, khóa outbox, cấu hình SMTP dù lệnh không dùng.
- **R-14 (P3)** — `GET /app-users` đọc page và count bằng hai truy vấn song song ngoài snapshot
  ([identity-access.repo.ts:310](../../src/modules/identity-access/identity-access.repo.ts)); catalog dùng RepeatableRead
  theo [database rules](../rules/database-business.md). Chấp nhận được cho màn quản trị, nên ghi rõ.
- **R-15 (P3)** — `MeService` không ánh xạ lỗi DB thành 503 (lỗi xảy ra giữa guard và service → 500).
- Nit: `isUniqueViolation` lặp ở [organization.repo.ts:25](../../src/modules/organization/organization.repo.ts) và
  `infrastructure/database/unique-violation.ts`.

### 8.3. Ghi nhận, không phải lỗi

- Access token sau refresh **trùng** token cũ nếu phát hành cùng giây (HS256 tất định, không `jti`) — S-1b; refresh token
  vẫn xoay và phát lại bị bắt (S-2).
- Giao hàng **at-least-once** đúng như ADR-0012: worker bị kill khi đang chờ SMTP → sau lease 60 s gửi lại, người nhận
  có 2 thư (O-7). Hai worker đồng thời: mỗi người đúng 1 thư (O-6). Gửi lại khi thư cũ đang `SENDING`: thư cũ vẫn tới
  nhưng liên kết bị từ chối (O-5).
- SIGTERM: worker trong image chờ lượt gửi đang dở, ghi `SENT`, thoát 0 sau 6,0 s (sink cùng Docker network). Lượt đầu
  dùng `host.docker.internal` bị `ETIMEDOUT` từ phía mạng Docker Desktop — kết quả đó không dùng để đánh giá sản phẩm.
  Worker rảnh dừng trong 451 ms, exit 0.
- Không kiểm `Origin` cho `refresh`/`logout`: cookie hợp lệ + `Origin: http://evil.example` → 200 (W-2). Đây là quyết định
  còn mở ở spec 1a (`SameSite=Strict` là phòng vệ phía trình duyệt), không tự đổi.
- JSON sai cú pháp → 400 `HTTP_BAD_REQUEST` (lỗi body parser), không phải 422 (D-2).
- Audit chỉ ghi thêm bằng trigger (Y-4: DELETE → `23001`); role sở hữu bảng vẫn có thể gỡ trigger — theo ADR-0005,
  credential API production không nên là chủ migration (chưa kiểm môi trường dùng chung nào).
- Image MinIO build từ `infra/minio` chỉ chạy khi `/data` là volume (không volume → `file access denied`); compose đã dùng
  volume.

### 8.4. Tài liệu lệch so với code (docs drift, không phải bug runtime)

| Vị trí                                                                                                                                                        | Lệch                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ARCHITECTURE.md:12-19](../../ARCHITECTURE.md)                                                                                                                | Bảng foundation: auth "Bearer guard, verifier port"/"chưa có tài khoản, JWT…", catalog "List/get/create", database "chỉ catalog" — phần sau của tệp đã mô tả đúng |
| [README.md:7](../../README.md), dòng 16, dòng 32                                                                                                              | Ghi chưa có tạo tài khoản/lời mời; bảo copy `.env.example` (đã xóa); worker "chưa có processor"                                                                   |
| [ADR-0011:3](../decisions/0011-internal-authentication-and-sessions.md)                                                                                       | "Proposed … Not implemented" — đã implement (chưa review)                                                                                                         |
| [ADR-0002:18](../decisions/0002-zod-http-contract-and-auth-defaults.md), [ADR-0004:12](../decisions/0004-error-contract-availability-and-request-id-trust.md) | Đã thêm ghi chú cập nhật trong khi ADR-0011 còn Proposed; ADR-0011 hẹn thêm khi Accepted                                                                          |
| [database-business.md:22-23](../rules/database-business.md)                                                                                                   | "Baseline chưa có transaction runner chung" — đã có `TransactionRunner`                                                                                           |
| [security-jobs.md:6-7](../rules/security-jobs.md)                                                                                                             | "invitations, activation, locking … are later slices" — đã có ở 1b                                                                                                |
| Plan [1a:5](../workspace/items/us-01-bootstrap-login-session/plan.md), [1b:5](../workspace/items/us-01-account-invitation-activation/plan.md)                 | "chưa commit, chưa review, chưa PR" — đã merge qua PR #4 (`64073c4`); roadmap dòng 12-14 "chưa có PR"                                                             |
| [sources.md:17](../workspace/sources.md)                                                                                                                      | Snapshot ghi nền `982ea92` + chưa commit — 12 tệp đã khớp nguyên vẹn ở `0e0bb83`                                                                                  |
| [test/README.md:61](../../test/README.md)                                                                                                                     | `insertAccountFixture` "cho tới khi lát 1b có API" — 1b đã có API                                                                                                 |
| [ci.yml:15, 49](../../.github/workflows/ci.yml)                                                                                                               | Path filter còn `.env.example`                                                                                                                                    |
| Spec 1a _Đăng nhập_; spec nền Logical JobTitle; I-2                                                                                                           | R-06, R-10, R-11                                                                                                                                                  |

## 9. Lệnh, môi trường, kết quả

| Lệnh / kiểm tra                                                       | Môi trường                                                           | Exit      | Số đếm / kết quả                                                                                                                                                              |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                      | BE `64073c4`                                                         | 0         | thêm 8 gói còn thiếu ở `node_modules`; không `ERR_PNPM_IGNORED_BUILDS`; tree sạch                                                                                             |
| `pnpm check` (lần 1)                                                  | client sinh ngày 07/10                                               | 1         | lint 302 lỗi, 9 cảnh báo (R-01)                                                                                                                                               |
| `pnpm lint` trên clone sạch, trước / sau `prisma:generate`            | clone `64073c4`                                                      | 1 / 0     | 464 problems / 0                                                                                                                                                              |
| `pnpm check` (sau `prisma:generate`)                                  | Windows                                                              | 0         | rules 38 tệp/184 link; rules:test 14/14; **unit 28 suite, 223/223**; scripts 8/8; discovery; build                                                                            |
| `pnpm test:e2e`                                                       | stub boundary                                                        | 0         | 3 suite, **28/28**                                                                                                                                                            |
| `pnpm test:integration`                                               | `postgres:17-alpine` 17.11, role `review_admin` NOSUPERUSER CREATEDB | 0         | 15 suite, **147/147**; không sót database tạm                                                                                                                                 |
| `pnpm openapi:export`; `git diff --exit-code -- openapi.json`         |                                                                      | 0; 0      | 16 operation, không drift                                                                                                                                                     |
| `pnpm audit --prod --audit-level high`                                | registry 14/10                                                       | 0         | No known vulnerabilities                                                                                                                                                      |
| `docker compose config --quiet`                                       |                                                                      | 0         |                                                                                                                                                                               |
| `docker build -t saas-sentry-be-review:64073c4 .`                     | Docker 29.1.2                                                        | 0         | user `node` (uid 1000); `@node-rs/argon2-linux-x64-gnu` băm được; có `dist/main.js`, `worker.js`, `installation-cli.js`; production thiếu biến → dừng với lỗi validation      |
| `prisma migrate deploy` DB rỗng / không quyền CREATE / lỗi giữa chừng | role không superuser                                                 | 0 / 1 / 1 | 5/5 migration; `42501` rollback sạch; lỗi ở lệnh thứ 3 của migration organization → enum đã tạo trong cùng migration biến mất, 2 migration trước giữ; DB không rỗng → `P3005` |
| Khởi tạo qua PTY (`script`, image runtime, Debian)                    | Linux PTY thật, input nạp tự động                                    | —         | notty 1, `--password` 1, mismatch 1, weak 1, Ctrl+C 130 + `echo` khôi phục, success 0, rerun 2                                                                                |
| `live-smoke.mjs`                                                      | `dist/main.js` + `dist/worker.js` + SMTP sink                        | 1         | **117 PASS / 2 FAIL / 12 INFO**, 143 s, 18 thư                                                                                                                                |
| `phase2.mjs` A, B, P, S, D; `sig-test.mjs`                            | như trên + Docker worker                                             | —         | RL-1 ✓; PR-1…3 ✓; DB-1b ✗ (R-02); DB-2…4 ✓; SIGTERM graceful ✓ (sink cùng mạng)                                                                                               |
| `mutate.mjs` (clone cô lập)                                           |                                                                      | —         | M1, M4, M5, M6 bị bắt; M3 bị bắt bởi `auth-http`; **M2 sống** (R-08); khôi phục byte-đúng                                                                                     |
| Redis `PING` / MinIO + adapter `dist`                                 | `redis:8-alpine`, MinIO review                                       | —         | PONG có xác thực, NOAUTH khi không; PUT/GET ký 200, hết hạn 403, không ký 403, xóa → 404                                                                                      |

Số người viết ghi trước (217 unit, 28 E2E, 146 integration trên PostgreSQL 18) khác số đo lại (223, 28, 147) — không ép
khớp; khác biệt là số test, không phải kết quả.

## 10. Mock, fixture, giới hạn

- **Fixture SQL** chỉ trên database của review, cho dữ liệu chưa có API: Employee khác (G2), `TERMINATED` (G6),
  205 Employee + 200 tài khoản cho R-03, hết hạn phiên (idle/absolute), `next_attempt_at = now()` để bỏ qua backoff 30 s,
  trigger audit chèn lỗi cho B-1/B-2 (đã gỡ). Fixture **không** chứng minh G2/G6.
- Token giả có chữ ký đúng do reviewer ký bằng khóa của profile smoke (V-*).
- **Chưa chạy / chưa chứng minh:** TTY tương tác bởi người trên PowerShell/Windows (phiên không có console); TLS SMTP,
  deliverability nhà cung cấp, UI `/activate` của FE; production TLS end-to-end (profile production chạy HTTP localhost);
  pooler/PgBouncer; tải/hiệu năng Argon2; lịch sử CI GitHub; Redis/BullMQ (worker không dùng; production vẫn bắt
  `REDIS_PASSWORD`, `OBJECT_STORAGE_ENDPOINT` HTTPS khi khởi động dù API/worker không dùng).

## 11. Đề xuất sửa theo thứ tự

1. R-01 — đổi thứ tự `check` (một dòng) để CI và checkout sạch xanh thật.
2. R-02 — timeout kết nối/truy vấn phía client + test.
3. R-03 — candidates không bỏ sót + test > 200.
4. R-04, R-05, R-08 — kiểm UUID claim, trạng thái Employee khi gửi thư, test service-level.
5. Quyết định R-06, R-07 (giữ hay đổi) và cập nhật spec/ADR; R-09, R-12, R-13 khi chạm tới.
6. Đồng bộ tài liệu mục 8.4; `sources.md` ghi `0e0bb83`; đánh giá delta `QĐ-68` (R-10, R-11) trước G2.
7. Dev khác review spec/plan/ADR-0011/0012 và code; lead quyết Accepted; thử TTY tay trên PowerShell.

## 12. Dọn dẹp và trạng thái cuối

Tài nguyên do phiên này tạo (nhãn `review=slm-g0g1-r121213`): container PostgreSQL 17, Redis, MinIO, network, volume
MinIO, database tạm, tiến trình node, clone cô lập và scratch — được dọn sau khi kiểm nhãn/tên. Không đụng container
`redis-6696` và service `PostgreSQL_Local` có sẵn trên máy, không đọc/sửa `.env`. Hai image do review build
(`saas-sentry-be-review:64073c4`, `slm-review-minio:2025-10-15`) đã xóa; image nền đã pull (`postgres:17-alpine`,
`redis:8-alpine`) giữ lại. `openapi.json` sau `openapi:export` giống nội dung commit (`git diff --exit-code` = 0), chỉ khác
line ending của checkout, nên được khôi phục bằng `git checkout -- openapi.json`. `git status` cuối ở BE (HEAD `64073c4`)
chỉ có tệp/thư mục review mới (untracked); Docs (`0e0bb83`) giữ nguyên 57 mục của người khác; FE không đổi.

Tái chạy: theo [README runner](backend-g0-g1-review-2026-10-14/README.md); gate repo:
`pnpm prisma:generate && pnpm check`, `pnpm test:e2e`, `TEST_DATABASE_ADMIN_URL=<local CREATEDB> pnpm test:integration`,
`pnpm openapi:export && git diff --exit-code -- openapi.json`, `pnpm audit --prod --audit-level high`,
`docker compose config --quiet`, `docker build -t saas-sentry-be-review:<revision> .`.

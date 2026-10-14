# Re-review và kiểm chứng lại backend G0 / G1 sau sửa lỗi — 14/10/2026

Reviewer: trợ lý AI (Claude) theo prompt `PROMPT_CLAUDE_REVERIFY_BE_G0_G1_AFTER_FIX_2026-10-14.md` của Owner.
**Đây không phải phê duyệt** spec/plan/ADR, không thay review của dev khác và không phải nghiệm thu. Không sửa source
sản phẩm, contract, migration, Docs hay `docs/roadmap.md` đang sửa dở; không commit/push. Runner và bằng chứng đã lọc ở
[backend-g0-g1-rereview-after-fix-2026-10-14/](backend-g0-g1-rereview-after-fix-2026-10-14/README.md). Báo cáo gốc
[backend-g0-g1-review-2026-10-14.md](backend-g0-g1-review-2026-10-14.md) giữ nguyên.

## 1. Kết luận cho Owner

- **Đã tự kiểm được:** bản sửa `cbd8b5c` (merge `a8ba88f`, PR #6) đóng đúng phạm vi R-01, R-04, R-05, R-06, R-07, R-08 —
  kiểm lại độc lập trên clone sạch, PostgreSQL 17.11 thật (role `NOSUPERUSER CREATEDB`), API + worker build thật,
  SMTP sink thật và 16 mutation có mục tiêu (14 bị bắt). Gate: `pnpm check` chạy thẳng trên checkout sạch exit 0;
  unit **260/260** (32 suite), E2E **33/33** (4 suite), integration **159/159** (17 suite), OpenAPI không drift
  (16 operation), audit 0 lỗ hổng, Compose hợp lệ, Docker build exit 0. Live smoke **132 PASS / 0 FAIL / 9 INFO**,
  đủ 16 operation qua HTTP.
- **Lỗi mới nghiêm trọng (N-1, P1, đã tái hiện bằng `docker pause` thật):** cơ chế `query_timeout` thêm cho R-02 trả
  kết nối **đang dở transaction** về pool. Khi CSDL ngừng trả lời giữa một transaction lâu hơn 8 s rồi chạy lại,
  request được báo 503 nhưng phần đã gửi của transaction đó **được commit sau** bởi request khác dùng lại kết nối.
  Đã thấy: tài khoản bị `LOCKED` mà **không** có audit `APP_USER.LOCKED`, lời mời **chưa** bị thu hồi, outbox chưa
  hủy — vi phạm `US-01-06` AC-3 (nghiệp vụ, audit, outbox cùng thành công hoặc cùng rollback). Đây là hồi quy do
  bản sửa R-02 tạo ra; trước sửa, request treo (R-02) chứ không thấy commit nửa vời.
- **Chưa đóng:** R-02 chỉ sửa một phần (hết treo, tự phục hồi, mã lỗi đúng — nhưng có N-1, test không ghim
  `query_timeout`); R-03 sửa một phần (đúng tới 4 980 người có tài khoản đứng trước; vượt mức đó trả **thiếu hoặc
  rỗng mà không báo**, nguồn không có giới hạn quy mô được phê duyệt); R-09, R-12, R-13, R-14, R-15 (đã tái hiện:
  `/me` → 500 sau 8 s), nit còn nguyên; R-10, R-11 hoãn tới G2 có căn cứ.
- **Bắt đầu được:** thiết kế 1c, Audit Trail query và thiết kế G2 có thể bắt đầu ngay (mục 9). **Triển khai** phần
  nào có transaction ghi (1c, G2) nên chờ N-1 được sửa và kiểm lại; nghiệm thu kỹ thuật G0/1a/1b hiện **blocked**
  bởi N-1, R-15 và việc chưa có review của dev/ADR vẫn Proposed.

## 2. Revision, trạng thái và nguồn

| Mốc                          | Kết quả kiểm lúc chạy (14/10/2026, bắt đầu 14:50 +07)                                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BE                           | `dev` = `origin/dev` = `a8ba88fd8158` (merge PR #6 từ `Bao_Dev`; commit sửa `cbd8b5c` _fix G0, G1_, tác giả HoaiBao200104, 14:41 +07). Khớp bảng định vị của prompt                                                                     |
| Phạm vi diff                 | `480b890..a8ba88f`: 33 tệp, +852/−81 (đọc toàn bộ: source, test, config, CI, docs). So với `64073c4` để xác định lỗi cũ/hồi quy                                                                                                         |
| Chưa commit (của người khác) | Chỉ `docs/roadmap.md` (delta nguồn BRD 3.38/QĐ-70, +`US-02-07`, `US-15-01` Retired): SHA-256 `ee1c068e…c45` lúc đầu và lúc cuối — **không đổi**; không ảnh hưởng runtime. Prettier + rules check của working tree sạch (đọc, không ghi) |
| Đánh giá                     | Mọi gate/live chạy trên **clone sạch tại `a8ba88f`** (không có generated client/dist/node_modules chép từ workspace) → kết luận là của HEAD tái lập; working tree không có source khác HEAD                                             |
| Docs                         | HEAD `0e0bb83`, **76** mục chưa commit (do phiên khác); giữ nguyên                                                                                                                                                                      |
| Môi trường                   | Windows 11, Node 24.0.1, pnpm 11.1.3, Docker Desktop 29.1.2, `postgres:17-alpine` 17.11 (UTC, `en_US.utf8`), pg 8.23.0, `@prisma/adapter-pg`/Prisma 7.9.1                                                                               |

**Nguồn pin `S-2026-10-12b`:** 12/12 hash (LF, không BOM) khớp `sources.md` tại Docs `0e0bb83` (= HEAD Docs)
([evidence/docs-hashes.txt](backend-g0-g1-rereview-after-fix-2026-10-14/evidence/docs-hashes.txt)). Working tree khác ở
10 tệp, giống ở `epics/EP-01.md` và `src/EP-01.md`. Working tree là BRD **v3.38**, Phạm vi **v1.26**, sổ quyết định tới
**`QĐ-70`** — chưa commit nên chưa có commit tái lập; hash nội dung đã ghi.

**Delta liên quan:** 12 định nghĩa yêu cầu G0/1a/1b dẫn (`FR-8.1`, `8.3`, `8.6`→`8.11`, `FR-9.8`, `INV-05/15/20`) có
cùng hash ở `0e0bb83` và working tree ([evidence](backend-g0-g1-rereview-after-fix-2026-10-14/evidence/requirement-definitions-delta.txt))
→ không có lý do coi spec G0/1a/1b vô hiệu. `QĐ-68`/`QĐ-70a/b` chỉ tác động G2 (R-10). `QĐ-70c` **khép `OQ-A-26`**:
thành viên phòng từ lúc ghi hồ sơ, quyền từ ngày vào, nhập lịch sử phòng từ ngày vào đã qua là thay đổi tương lai,
**không** blocker; ngoại lệ khởi tạo `QĐ-67a` không mở rộng sang import/nhập thường (R-11). `QĐ-69` (`US-15-01`
Retired, AI chỉ `US-15-05/06`) chỉ đổi đếm G10 trong roadmap (7 → 6); BE chưa có code AI nên không có tác động runtime.

**Đã đọc:** BE `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `README.md`, `test/README.md`, `scripts/README.md`,
rules liên quan (`security-jobs`, `api-contract`, `database-business` qua báo cáo gốc), `docs/workspace/sources.md`,
roadmap (kể cả delta chưa commit), follow-up, báo cáo gốc + README/runner cũ, spec 1a/1b/nền (phần liên quan),
ADR-0011; source theo đường request: `auth.service`, `token.service`, `jwt-access-token.verifier`, `me.service`,
`account-management.service`, `identity-access.repo`, `organization.repo/service`, `transaction-runner`,
`prisma.service`, `env-schema`, `http-exception.filter`, `health.controller`, `email-dispatcher`, `mail-transport`,
`rate-limit.options`, `security.module`, `bootstrap`, `installation.module`; và mã thư viện quyết định hành vi:
pg 8.23.0 `client.js` (`query_timeout`), pg-pool 3.14.0 `_release`, adapter-pg 7.9.1 (`convertDriverError`,
`PgTransaction.commit/rollback`, `startTransaction`), Prisma 7.9.1 `TransactionManager`. Docs: `AGENTS.md`/rules
(phiên trước), sổ quyết định `QĐ-68`→`QĐ-70`, BRD 7.1.

**Skill đã nạp:** `using-superpowers`, `code-review-and-quality`, `security-and-hardening`,
`engineering:testing-strategy`, `superpowers:verification-before-completion`. Khi runner của chính review lỗi đã điều tra
nguyên nhân (mục 6) nhưng không nạp `systematic-debugging`/TDD vì không sửa và không thêm test sản phẩm.

## 3. Ma trận đóng finding R-01 → R-16 và nit

Trạng thái: `fixed-and-reverified` · `partially-fixed` · `still-open` · `not-reproduced` · `deferred-with-evidence`
· `unverified`. "Test người sửa" chỉ là bằng chứng phụ; kết luận dựa trên lần chạy của re-review.

| Finding                              | Kỳ vọng                                                                                          | Sửa (commit)                                                                                                                                                                                                                                                              | Re-review đã chạy · expected/actual                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Kết luận / giới hạn                                                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-01** clean checkout              | `pnpm check` chạy thẳng trên checkout sạch                                                       | `package.json:41` validate+generate trước lint; bỏ `.env.example` khỏi path filter CI; `check-script-order.test.mjs` (`cbd8b5c`)                                                                                                                                          | Clone `--no-local` tại `a8ba88f`, không generated/dist/node_modules → `pnpm install --frozen-lockfile` exit 0 (19 s) → `pnpm check` **exit 0** (157 s), log cho thấy `prisma generate` trước `eslint`. Mutation R1 (đảo lại thứ tự) bị test script bắt                                                                                                                                                                                                                                             | **fixed-and-reverified** (local). Chưa xem lịch sử GitHub Actions (`gh` chưa đăng nhập)                                                                                                                                                                        |
| **R-02** treo khi DB không trả lời   | Request kết thúc trong ngưỡng, 503 đúng hợp đồng, tự phục hồi, không hỏng dữ liệu                | `DB_CONNECT_TIMEOUT_MS` 3 000 / `DB_QUERY_TIMEOUT_MS` 8 000 / `keepAlive` ở [prisma.service.ts:22-25](../../src/infrastructure/database/prisma.service.ts); nhận diện lỗi driver ở [transaction-runner.ts:52-68](../../src/infrastructure/database/transaction-runner.ts) | `docker pause` thật, pool nóng (A-0): `/me` 503 8,0 s, login 503 8,0 s, refresh/list/candidates/lock/logout 503 3,0 s, ready 503 1,5 s; pool lạnh (B-0) 503 3,1 s; reset giữa request (C-1) 503 1,5 s; `docker stop` (C-2) mọi route 503 < 50 ms; tự phục hồi không restart, không unhandled rejection. Ghi 503 trong pause không để lại ghi nửa vời (A-8), không phát lại sai refresh (A-9). **Nhưng** câu lệnh treo giữa transaction > 8 s ⟹ **N-1**. Mutation R2b (bỏ `query_timeout`) **sống** | **partially-fixed** — hết treo vô hạn; có hồi quy P1 N-1; test của người sửa không ghim đường query timeout (N-2); R-15 còn                                                                                                                                    |
| **R-03** candidates bỏ sót           | Trả đúng 20 Employee đầu (theo mã) chưa có tài khoản, mọi quy mô nguồn cho phép                  | Keyset theo `employeeCode`, trang 200, tối đa 25 trang ([account-management.service.ts:89-140](../../src/modules/identity-access/account-management.service.ts))                                                                                                          | Runner so API với oracle SQL ([evidence](backend-g0-g1-rereview-after-fix-2026-10-14/evidence/r03-candidates-scale.json)): khối đầu 0/199/200/201/399/400/401/4 979/4 980 → **khớp**; 4 981 → 19/20; 4 999 → 1; 5 000/5 001/6 000 → **0** (oracle 20); `search=B-00` khớp; `search=-0` (khớp cả khối đầu) → 0. Thời gian ~250 ms ở 25 trang. Live C-8: 3 ứng viên sau 200 người có tài khoản → đủ. Mutation R3a bị bắt, R3b (cursor lệch) **sống**                                                 | **partially-fixed** — đúng tới ~5 000; vượt ngưỡng trả 200 thiếu/rỗng **không báo cắt**. Nguồn chỉ có BRD 7.1 "≥ 100 người dùng đồng thời trong dữ liệu demo/MVP", **không** có giới hạn số nhân viên được phê duyệt; spec 1b dòng 145 vẫn mô tả cách cũ (N-4) |
| **R-04** claim JWT                   | Claim sai ⟹ 401 không log error; DB unavailable ⟹ 503; lỗi lập trình ⟹ 500                       | `sub`/`sid` phải là UUID ([token.service.ts:16-47](../../src/modules/identity-access/token.service.ts)); verifier chỉ 503 khi `toTransientError` nhận ra                                                                                                                  | Live: 19 token ký đúng nhưng sai (sid thiếu/null/số/mảng/không UUID/UUID không gạch, sub thiếu/không UUID/số/không tồn tại/lệch, hết hạn, aud/iss sai, HS512, `none`, khóa khác, rác) → **401** `INVALID_ACCESS_TOKEN`, **0** dòng log error (V-4); DB pause/stop → 503 `TOKEN_VERIFICATION_UNAVAILABLE`; bảng `auth_sessions` bị đổi tên (lỗi không tạm thời) → **500** + 1 log error (E-1). Mutation R4a/R4b bị unit bắt (integration không bắt R4a)                                             | **fixed-and-reverified**. Đổi lỗi DB không nhận ra từ 503 → 500 là thay đổi hành vi follow-up ghi "cần dev xác nhận" — vẫn cần xác nhận đó                                                                                                                     |
| **R-05** thư mời Employee đã nghỉ    | Không gửi, `usable=false`, redeem từ chối                                                        | Callback dispatcher và detail hỏi trạng thái Employee qua facade `organization` ([account-management.service.ts:448-462, 583-590](../../src/modules/identity-access/account-management.service.ts))                                                                       | API + worker hai tiến trình, SMTP sink thật, fixture `TERMINATED` bằng SQL: X-1 `usable=false`; X-2 **không** gửi, outbox `CANCELLED`, ciphertext xóa; X-3 redeem 400; X-4 gửi lại/tạo 409; O-1…O-7 (retry, FAILED, gửi lại, worker dừng, supersede, hai worker, kill khi SENDING) không hồi quy. Mutation R5a/R5b bị bắt                                                                                                                                                                          | **fixed-and-reverified**. Giới hạn: chưa có API G6; đổi trạng thái giữa lúc hỏi và lúc gửi SMTP vẫn có thể gửi thư — link vẫn bị redeem từ chối; thư đã `SENT` không thu hồi được                                                                              |
| **R-06** throttle (Owner chốt)       | Chỉ lần sai tăng bộ đếm; đúng đồng thời không chặn nhau                                          | Bỏ `reserveAttempt`, `recordFailure` sau khi kiểm thất bại ([auth.service.ts:65-83](../../src/modules/identity-access/auth.service.ts))                                                                                                                                   | Live: T-1/T-2/T-4 (AC-7: lần 6 đúng mật khẩu 429, `AppUser.status` không đổi, hết chặn đăng nhập lại); T-5 12 lần sai **đồng thời thật** → 12 × 401, `failure_count` = 12, block đặt, đúng mật khẩu sau đó 429; T-6 7 lần đúng đồng thời → 7 × 200, không có dòng throttle; T-7 bộ đếm 4 + 1 đúng + 2 sai → 200, 401, 401. Integration 4 ca mới xanh. Mutation R6a (không đếm), R6b (đếm trước khi băm — hành vi cũ), R6c (thành công không xóa) đều bị bắt                                        | **fixed-and-reverified** theo quyết định Owner. Đánh đổi đã đo: loạt đoán sai đồng thời **không** bị cắt ở 5 (T-5: cả 12 được băm); chỉ global limiter 120/phút/route/IP giới hạn — đúng như Owner chấp nhận; chống quá tải riêng cần thiết kế/review riêng    |
| **R-07** global limiter (Owner chốt) | Theo route + IP, bộ nhớ process; public/auth không bypass; XFF không spoof khi không trust proxy | Không đổi code; `test/e2e/rate-limit.e2e-spec.ts` dựng `AppModule` + `configureApplication` như `main.ts`                                                                                                                                                                 | E2E 5 ca xanh trong gate. Mutation R7a (`generateKey` theo IP) bị 2 test bắt; R7b (`trust proxy` = true) bị 1 test bắt. Mã throttler/bootstrap không nằm trong diff `64073c4..a8ba88f` nên kết quả live RL-1/RL-2 của review gốc còn áp dụng                                                                                                                                                                                                                                                       | **fixed-and-reverified** (tài liệu + test). Chưa chạy lại RL live trong phiên này; limiter vẫn theo process, chưa phân tán                                                                                                                                     |
| **R-08** test người giữ SUPER_ADMIN  | Bỏ kiểm bảo vệ ⟹ test fail                                                                       | Test service-level actor khác target (`account-management-http.integration-spec.ts`)                                                                                                                                                                                      | Mutation R8 (= M2 cũ) **bị bắt** (integration 2 fail); test kiểm không đổi trạng thái/audit. Không thêm route giả mạo actor                                                                                                                                                                                                                                                                                                                                                                        | **fixed-and-reverified**                                                                                                                                                                                                                                       |
| **R-09** Argon2 trước tra token      | Không để route public tốn băm vô ích                                                             | Không sửa                                                                                                                                                                                                                                                                 | Đo trên API build ([evidence](backend-g0-g1-rereview-after-fix-2026-10-14/evidence/r09-redeem-cost.json)): token sai hình dạng vẫn băm (~9 ms), token không tồn tại ~13 ms; 30 request đồng thời p50 160 ms, `/health/live` trong loạt 4 ms                                                                                                                                                                                                                                                        | **still-open** (P3, tác động khả dụng thấp trên máy đo). Đề xuất hoãn có điều kiện: xử lý cùng thiết kế 1c (đặt lại mật khẩu cùng mẫu policy → shape → tra chủ → băm)                                                                                          |
| **R-10** JobTitle (`QĐ-68`)          | `status`, chuẩn hóa gộp khoảng trắng                                                             | Không sửa (đúng kế hoạch)                                                                                                                                                                                                                                                 | Static: [organization.repo.ts:67](../../src/modules/organization/organization.repo.ts) chỉ `trim().normalize('NFC').toLowerCase()`; model `JobTitle` không có `status`. Nguồn mới `QĐ-68a/b/d`, `QĐ-70a/b` (Docs chưa commit)                                                                                                                                                                                                                                                                      | **deferred-with-evidence** — chủ: dev thiết kế G2; điều kiện đóng: pin snapshot mới, migration + test ở lát G2 đầu tiên dùng danh mục chức vụ. Không chặn 1c                                                                                                   |
| **R-11** I-2 (`QĐ-66ak`/`68f`/`70c`) | Spec nền phản ánh nguồn                                                                          | Không sửa                                                                                                                                                                                                                                                                 | Static: spec nền dòng 11, 92 vẫn "`validFrom` giai đoạn đầu = `hireDate`" và nhắc theo dõi `OQ-A-26`; `QĐ-70c` (Docs chưa commit) đã khép `OQ-A-26`, không blocker                                                                                                                                                                                                                                                                                                                                 | **deferred-with-evidence** — chủ: dev G2; điều kiện: khi pin nguồn G2, sửa I-2 cho người nhập (thành viên từ lúc ghi, quyền từ ngày vào), giữ ngoại lệ bootstrap; bỏ "theo dõi `OQ-A-26`" ở spec nền/`sources.md`. Không chặn 1c                               |
| **R-12** readiness 503 code          | Mã availability riêng                                                                            | Không sửa                                                                                                                                                                                                                                                                 | Live A-5/B-0/C-2: readiness 503 `INTERNAL_SERVER_ERROR` ([http-exception.filter.ts:98-104](../../src/infrastructure/http/filters/http-exception.filter.ts))                                                                                                                                                                                                                                                                                                                                        | **still-open** (P3). Nên sửa trước khi FE/ops dựa vào mã                                                                                                                                                                                                       |
| **R-13** CLI kéo module thừa         | CLI chỉ cần cấu hình nó dùng                                                                     | Không sửa                                                                                                                                                                                                                                                                 | Static: [installation.module.ts:11](../../src/modules/installation/installation.module.ts) vẫn import `IdentityAccessModule`. Chưa chạy lại profile production cho CLI                                                                                                                                                                                                                                                                                                                             | **still-open** (P3), chưa có lý do hoãn được ghi                                                                                                                                                                                                               |
| **R-14** page/count không snapshot   | Ghi rõ hoặc dùng snapshot                                                                        | Không sửa                                                                                                                                                                                                                                                                 | Static: [identity-access.repo.ts:310](../../src/modules/identity-access/identity-access.repo.ts) `Promise.all` hai truy vấn                                                                                                                                                                                                                                                                                                                                                                        | **still-open** (P3). Chấp nhận được cho màn quản trị nếu spec/rules ghi rõ; chưa ghi                                                                                                                                                                           |
| **R-15** `/me` lỗi DB sau guard      | 503                                                                                              | Không sửa                                                                                                                                                                                                                                                                 | **Tái hiện đúng boundary** (M-1): relay chỉ giữ truy vấn `login_email` của `MeService` (guard đã qua) → **500 `INTERNAL_SERVER_ERROR` sau 8,0 s**. Tách khỏi ca DB lỗi ngay ở verifier (A/B/C → 503 `TOKEN_VERIFICATION_UNAVAILABLE`)                                                                                                                                                                                                                                                              | **still-open**, nay là **confirmed** (P3 → nên sửa cùng N-1)                                                                                                                                                                                                   |
| **R-16** quyền migration role        | Tài liệu nêu quyền `CREATE`                                                                      | ADR-0011 ghi quyền `CREATE` cho `CREATE SCHEMA` và `btree_gist` (dòng 98-100)                                                                                                                                                                                             | Migrate thành công bằng role `NOSUPERUSER CREATEDB` sở hữu DB (gate integration, live DB). Không thử lại nhánh thiếu quyền                                                                                                                                                                                                                                                                                                                                                                         | **fixed-and-reverified** (tài liệu); kiểm môi trường dùng chung vẫn là việc khi triển khai                                                                                                                                                                     |
| **Nit** `isUniqueViolation` trùng    | Dùng helper chung                                                                                | Không sửa                                                                                                                                                                                                                                                                 | Static: còn ở `organization.repo.ts:25` và `infrastructure/database/unique-violation.ts:5`                                                                                                                                                                                                                                                                                                                                                                                                         | **still-open** (nit)                                                                                                                                                                                                                                           |

## 4. Finding mới

Mức: P1 sai hành vi chính/toàn vẹn dữ liệu · P2 sai hợp đồng có tác động · P3 nhỏ/tiềm ẩn/tài liệu.

### 4.1. Đã xác nhận bằng chạy thật

**N-1 (P1, toàn vẹn dữ liệu, hồi quy do bản sửa R-02) — Kết nối dở transaction quay về pool sau `Query read timeout`;
phần đã gửi của transaction bị commit bởi request sau.**

- **Vị trí:** [prisma.service.ts:22-23](../../src/infrastructure/database/prisma.service.ts) bật `query_timeout`;
  [transaction-runner.ts:107-120](../../src/infrastructure/database/transaction-runner.ts) dùng interactive transaction.
  Cơ chế ở thư viện (đã đọc mã): pg 8.23.0 `client.js:706-730` — khi hết `query_timeout` ở chế độ thường, client
  **không** hủy/đóng kết nối; câu đang chạy vẫn "active", câu xếp sau (ví dụ `ROLLBACK`) bị bỏ khỏi hàng đợi.
  adapter-pg 7.9.1 `PgTransaction.commit()/rollback()` gọi `client.release()` **không kèm lỗi**; Prisma 7.9.1
  `TransactionManager` luôn gọi `rollback()` (release) trong `finally` kể cả khi `ROLLBACK` lỗi → pg-pool giữ lại
  kết nối (`_release` chỉ hủy khi có `err`).
- **Trigger:** CSDL ngừng trả lời giữa một câu lệnh trong transaction lâu hơn `DB_QUERY_TIMEOUT_MS` (8 s) rồi hoạt động
  lại — container bị pause, failover, mất đường mạng tạm thời.
- **Kỳ vọng:** `US-01-06` AC-3 / spec nền quy tắc 6 — lỗi CSDL ⟹ rollback toàn bộ (nghiệp vụ, audit, outbox) và 503.
- **Thực tế:** request nhận 503 sau ~16 s (8 s câu treo + 8 s `ROLLBACK` không tới), kết nối ở trạng thái
  `idle in transaction` được cấp lại. Request kế tiếp dùng kết nối đó chạy `BEGIN` (PostgreSQL chỉ cảnh báo "already
  in progress") … `COMMIT` — commit luôn câu `UPDATE` treo của request trước.
  - D1 (relay giữ đúng câu `UPDATE "public"."app_users"` của lock 20 s): ngay sau đó 1 backend `idle in transaction`
    (pid 42, `wrote=true`); sau 12 `GET /me` + lock/unlock tài khoản khác + 12 `GET /app-users`, nạn nhân **committed
    `LOCKED`, 0 audit `APP_USER.LOCKED`**. Trace SQL của kết nối: `UPDATE` treo ở 0,00 s → không có `ROLLBACK` → được
    dùng lại ở 17,04 s → `BEGIN` 17,20 s … `COMMIT` 17,22 s
    ([evidence/r02-d1-connection-sql.txt](backend-g0-g1-rereview-after-fix-2026-10-14/evidence/r02-d1-connection-sql.txt)).
  - D4 (**`docker pause` thật** đúng lúc lock gửi `UPDATE`, unpause sau 20 s): 503 sau 16,1 s; sau traffic thường nạn
    nhân `LOCKED`, **0 audit**, **1 lời mời vẫn dùng được** (không thu hồi), outbox không hủy.
  - Lock lại cùng tài khoản sau đó trả 200 và **không** ghi audit (đã `LOCKED`) — audit thiếu vĩnh viễn (D1-5).
- **Tác động:** hành động bảo mật có hiệu lực nhưng không có Audit Trail; trạng thái nửa vời (khóa nhưng lời mời
  còn sống); quản trị viên được báo thất bại. Trong lúc chờ được dùng lại, kết nối giữ khóa dòng `FOR UPDATE`.
  Áp dụng cho mọi transaction đi qua `TransactionRunner` (login, refresh, tạo/khóa/gán vai, redeem, worker claim).
- **Đối chứng đã đạt:** treo trước khi transaction mở (`BEGIN` giữ 4 s, D3) → 503 2,0 s, transaction đến muộn bị
  Prisma rollback, không còn gì mở; treo ở `COMMIT` (D2) → client 503 nhưng commit đầy đủ (status + audit khớp) —
  "kết quả commit chưa xác định", retry lock idempotent (200, không audit thứ hai); pause khi request đang chờ ở guard
  (A2) → chờ và thành công.
- **Trước bản sửa (`64073c4`)** — _giả thuyết, chưa chạy lại_: không có `query_timeout` nên request treo (R-02) và
  `ROLLBACK` của Prisma chỉ chờ sau câu treo; chưa thấy cơ chế commit nửa vời.
- **Hướng sửa (để dev thiết kế, không tự sửa):** không bao giờ trả lại pool một client có câu bị timeout/lỗi kết nối
  (đánh dấu client khi `Query read timeout` rồi hủy socket khi release, hoặc bọc pool/adapter để `release(err)`);
  cân nhắc `idle_in_transaction_session_timeout` phía server làm lưới an toàn (không đủ một mình); test tái hiện bằng
  relay giữ một câu giữa transaction, assert không còn `idle in transaction` và không commit nửa vời. Báo upstream
  Prisma adapter-pg nếu xác nhận. Không đề xuất retry ghi mù quáng: D2 cho thấy 503 có thể đi kèm commit thành công.

**N-2 (P3, coverage) — Test R-02 không ghim đường `query_timeout`.** Mutation R2b (xóa `query_timeout`) **sống**:
`database-unavailable.integration-spec.ts` xanh vì mỗi ca kết thúc nhờ `maxWait` (2 s) hoặc connect timeout của kết nối
mới, không nhờ query timeout; R2a chỉ unit bắt. Live A-0 cho thấy chính `query_timeout` cắt `/me`/login ở 8,0 s trên
pool nóng, nên hành vi thật đúng nhưng test không bảo vệ. Cần ca "pool nóng, câu lệnh không trả lời" và ca N-1.

**N-3 (P3, coverage) — Không test ứng viên đúng ở ranh giới trang.** Mutation R3b (cursor lùi một dòng → trang chồng
nhau) **sống**; dữ liệu test có dòng ranh giới đều đã có tài khoản nên trùng lặp không lộ.

**N-4 (P3, tài liệu lệch sau sửa).**

| Vị trí                                                                                                               | Lệch                                                                                              |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [spec 1b dòng 145](../workspace/items/us-01-account-invitation-activation/spec.md)                                   | Vẫn mô tả "tìm trong 200 nhân viên đầu…"; code đã là keyset tối đa 5 000, còn giới hạn R-03       |
| [follow-up dòng 57](../workspace/g0-g1-review-follow-up.md)                                                          | Tiêu đề "chưa commit, chưa PR" — đã ở `cbd8b5c`, PR #6                                            |
| [ADR-0011 dòng 113-115](../decisions/0011-internal-authentication-and-sessions.md), ARCHITECTURE/README/CONTRIBUTING | "stalled DB requests … were fixed" — dựa trên test người sửa; re-review thấy N-1, R-15 còn mở     |
| `docs/roadmap.md` (đang sửa, chưa commit) và [sources.md](../workspace/sources.md)                                   | Còn "theo dõi `OQ-A-26`" trong khi `QĐ-70c` (Docs chưa commit) đã khép; cập nhật khi pin nguồn G2 |

**Ghi nhận (không phải lỗi):**

- Khi CSDL chết, route có xác thực trả 503 `TOKEN_VERIFICATION_UNAVAILABLE` (guard chạy trước service), không phải
  `SERVICE_UNAVAILABLE` — đúng hợp đồng; FE nên coi cả hai là lỗi tạm thời có thể thử lại.
- Trong `docker pause`, request đầu dùng kết nối nóng dừng ở 8,0 s, các request đồng thời khác dừng ở 3,0 s (connect
  timeout khi mở kết nối mới) — ngưỡng thật phụ thuộc đường đi request.
- SMTP STARTTLS ([evidence](backend-g0-g1-rereview-after-fix-2026-10-14/evidence/smtp-tls-outbox.txt), sink cục bộ, CA và
  chứng chỉ `localhost` chỉ của phiên): `SMTP_TLS=true` + CA tin cậy → `SENT`; chứng chỉ không tin cậy → không gửi,
  `ESOCKET`, chờ thử lại; máy chủ không có STARTTLS → `FAILED SMTP_500`, không gửi plaintext; `SMTP_TLS=false` mà máy
  chủ có STARTTLS → nodemailer tự nâng cấp (`SENT`), chứng chỉ không tin cậy thì **không** gửi (`ESOCKET`). Tức
  `SMTP_TLS=false` không có nghĩa "chỉ plaintext" — cần ghi ở hướng dẫn vận hành. Chưa kiểm cổng 465/TLS ngầm, nhà
  cung cấp thật hay deliverability.
- SIGTERM worker trong image khi SMTP đang chờ trả lời (sink cùng Docker network): chờ lượt gửi, `SENT` 1 lần thử,
  exit 0 sau 4,2 s ([evidence](backend-g0-g1-rereview-after-fix-2026-10-14/evidence/sigterm-worker.json)).

### 4.2. Lập luận tĩnh (chưa tái hiện)

- **N-5 (P3, giả thuyết):** `PG_CONNECTIVITY_MESSAGES` không có các thông điệp pg `Client has encountered a connection
error and is not queryable`, `Client was closed and is not queryable` (`client.js:747-758`) → nếu xuất hiện sẽ là 500
  thay vì 503. Không gặp trong các lần chạy. Nhận diện theo chuỗi thông điệp của thư viện cũng giòn khi nâng pg —
  nên có test hợp đồng khi nâng phiên bản.
- `query_timeout` phía client không hủy câu lệnh ở server; truy vấn ngoài `TransactionRunner` không có
  `statement_timeout` nên server có thể chạy tiếp sau khi client đã 503 (tốn tài nguyên, không sai dữ liệu với đọc).

## 5. Lệnh, môi trường và kết quả

Tài nguyên phiên có nhãn `review=slm-g0g1-rr1454`; container `slm-rr-pg-rr1454` (`postgres:17-alpine` 17.11), role
`rr_admin` `NOSUPERUSER CREATEDB NOCREATEROLE` sở hữu DB live/PTY; secret sinh ngẫu nhiên, không đọc `.env` thật.

| Lệnh / kiểm tra                                            | Môi trường                                    | Exit / thời gian               | Kết quả                                                                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `git clone --no-local` + checkout `a8ba88f`                | `%TEMP%\slmrr-rr1454\clone`                   | 0                              | không generated/dist/node_modules                                                                                                          |
| `pnpm install --frozen-lockfile`                           | clone sạch                                    | 0 / 19 s                       |                                                                                                                                            |
| `pnpm check` (trực tiếp, không generate trước)             | clone sạch                                    | **0** / 157 s                  | rules 39 tệp/222 link/0 lỗi; rules:test 14/14; unit **32 suite, 260/260**; scripts 10/10; discovery; build                                 |
| `pnpm test:e2e`                                            | stub boundary                                 | 0 / 20 s                       | **4 suite, 33/33**                                                                                                                         |
| `TEST_DATABASE_ADMIN_URL=… pnpm test:integration`          | PG 17.11, `rr_admin` NOSUPERUSER CREATEDB     | 0 / 86 s                       | **17 suite, 159/159**; không sót database tạm                                                                                              |
| `pnpm openapi:export`; so `openapi.json` (bỏ qua CRLF)     |                                               | 0; 0                           | 16 operation, không drift nội dung                                                                                                         |
| `pnpm audit --prod --audit-level high`                     | registry 14/10                                | 0                              | No known vulnerabilities                                                                                                                   |
| `docker compose config --quiet`                            |                                               | 0                              |                                                                                                                                            |
| `docker build -t saas-sentry-be-rereview:a8ba88f .`        | Docker 29.1.2                                 | 0 / 118 s                      | user `node` uid 1000; Argon2 native băm được trong image                                                                                   |
| Bootstrap PTY Linux (`script`, image runtime)              | input nạp tự động                             | —                              | notty 1, `--password` 1, mismatch 1, weak 1, Ctrl+C **130** + echo khôi phục, success 0, rerun **2**; mật khẩu không vào transcript        |
| `live-smoke.mjs` (đã thích ứng)                            | `dist/main.js` + `dist/worker.js` + SMTP sink | 0 / 152 s                      | **132 PASS / 0 FAIL / 9 INFO**, 17 thư, 16/16 operation                                                                                    |
| `r02-db-outage.mjs` P                                      | Prisma thật qua relay                         | —                              | hình dạng lỗi: `Query read timeout`/`Connection terminated…` là `Error` thường; ECONNREFUSED → `P1001`; cột sai → `P2010` (không tạm thời) |
| `r02-db-outage.mjs` A A2 B C D E M                         | API build, `docker pause/stop`, relay         | 1 / 69 s                       | 21 PASS / **3 FAIL** (D1-2, D1-4 = N-1; M-2 = R-15) / 14 INFO                                                                              |
| `r02-db-outage.mjs` D4                                     | `docker pause` thật giữa transaction          | 1 / 23 s                       | **FAIL D4-2** (N-1)                                                                                                                        |
| `rr-candidates-scale.integration-spec.ts` (chép vào clone) | harness integration, PG thật                  | 0                              | 16/16 ca chạy; khớp oracle tới 4 980, lệch từ 4 981                                                                                        |
| `mutate.mjs`                                               | clone riêng `mclone`                          | —                              | **14/16 bị bắt**; sống: R2b, R3b; khôi phục byte-đúng 16/16; `mclone` sạch                                                                 |
| `smtp-tls.mjs`                                             | sink `smtp-server` + CA phiên                 | runner treo khi đóng sink cuối | kết quả đọc từ outbox (mục 4.1)                                                                                                            |
| `sig-test.mjs`                                             | worker + sink trong Docker network            | —                              | exit 0, `SENT`, 4,2 s                                                                                                                      |
| `r09-redeem-cost.mjs`                                      | API build                                     | 0                              | mục 3 R-09                                                                                                                                 |

**Coverage HTTP:** 16/16 operation của `openapi.json` được gọi qua HTTP thật (live smoke, cùng bảng route của báo cáo
gốc mục 7); R-02 phủ thêm `/me`, login, refresh, logout, list, candidates, lock, readiness khi CSDL hỏng.

**So với kết quả người sửa:** follow-up ghi test mới và "clone sạch exit 0" — re-review chạy lại độc lập và xác nhận
R-01; với R-02 test của người sửa (relay, < 5 s) đúng nhưng không chứng minh `query_timeout` (N-2) và không phát hiện
N-1. Không dùng số 223/28/147 hay 117/2 cũ.

**Mock/fixture/giới hạn:** Employee khác và `TERMINATED` bằng SQL (chưa có API G2/G6); relay TCP do review viết để
dừng đúng một câu lệnh (D1–D3, C-1, M-1), có đối chứng `docker pause` thật (A, B, D4); PTY Linux với input tự động —
**chưa** có thử tay trên PowerShell; SMTP sink cục bộ (không nhà cung cấp thật); không đo tải tổng thể; không
pooler/PgBouncer; không xem được GitHub Actions/PR (`gh` chưa đăng nhập).

## 6. Sự cố của chính runner (không phải lỗi sản phẩm)

- Lần chạy R-02 đầu: client quan sát của runner không có listener `error`, `docker stop` (57P01) làm runner crash
  trước `finally` → container ở trạng thái dừng; đã khởi động lại container của phiên, sửa runner, chạy lại toàn bộ.
  Hai kỳ vọng ban đầu (A-3, C-1) sai vì guard trả `TOKEN_VERIFICATION_UNAVAILABLE` trước service — đã sửa kỳ vọng
  theo hợp đồng, C-1 đổi trigger sang câu `COUNT` để đi qua service.
- Runner R-03 lần đầu sai kiểu enum `EmployeeStatus` (lỗi SQL fixture); sửa cast rồi chạy lại.
- `smtp-tls.mjs` treo khi đóng sink sau ca cuối; đã dừng đúng PID của runner, kết quả lấy từ `email_outbox`.
- Container được `docker start` lại nên cổng host đổi; runner đọc lại cổng qua `docker port`.

## 7. Review của con người

- Owner cho biết đã có dev BE khác review và sửa. Bằng chứng tìm được: commit sửa `cbd8b5c` (tác giả HoaiBao200104),
  merge `a8ba88f` _Merge pull request #6 … Bao_Dev_ do tài khoản Bảo Phi tạo trên GitHub. Follow-up tự ghi đây là
  "kết quả chạy của người sửa, **không** phải review của dev khác". Không mở được PR #6 (gh chưa đăng nhập) nên
  **Owner xác nhận có review; chưa đối chiếu được phạm vi/revision** của review đó.
- Spec/plan G0/1a/1b vẫn draft; ADR-0011, ADR-0012 vẫn **Proposed**; mục "Tiếp nhận kết quả sửa" của follow-up chưa
  có ô nào được đánh dấu. Re-review này không phê duyệt spec/ADR và không nghiệm thu.

## 8. Việc cần làm

**Sửa ngay (trước nghiệm thu và trước code transaction mới):**

1. **N-1** — không trả lại pool kết nối có câu bị timeout/lỗi kết nối; test relay giữa transaction (không còn
   `idle in transaction`, không commit nửa vời) + chạy lại D1/D4 của runner này.
2. **N-2** — test pool nóng + câu không trả lời ghim `query_timeout`.
3. **R-15** — `MeService` ánh xạ lỗi tạm thời → 503 (cùng helper `toTransientError`).
4. **R-03** — Owner/dev chốt quy mô hỗ trợ; nếu giữ trần 5 000 thì ghi vào spec/ADR và trả tín hiệu bị cắt (hoặc
   thiết kế truy vấn loại trừ không phá ownership), thêm test ranh giới trang (N-3); sửa spec 1b dòng 145 (N-4).

**Có thể hoãn có căn cứ (ghi chủ và điều kiện):** R-09 (cùng thiết kế 1c), R-12 (trước khi FE/ops dựa vào mã),
R-13 (trước triển khai production CLI), R-14 (ghi rõ chấp nhận ở spec), nit, N-5; R-10/R-11 tới G2. Tài liệu N-4
cập nhật cùng PR sửa N-1.

**Dev xác nhận:** đổi lỗi DB không nhận ra trong verifier từ 503 → 500 (R-04); trade-off throttle (R-06) đã có quyết
định Owner. Lead quyết ADR-0011/0012; Owner/dev ghi nghiệm thu đúng phạm vi.

## 9. Readiness theo phạm vi

| Phạm vi                                       | Bắt đầu thiết kế                                                                                                                                                                                                  | Bắt đầu implement                                                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nghiệm thu kỹ thuật G0/1a/1b (đã triển khai)  | —                                                                                                                                                                                                                 | **blocked** — N-1 (P1) và R-15 phải sửa và kiểm lại; còn cần review dev khác, quyết định ADR-0011/0012, thử tay PowerShell; R-03 cần chốt quy mô |
| 1c đổi/đặt lại mật khẩu                       | **ready** — spec/plan nên đưa vào bài học N-1 (transaction đổi credential + thu hồi phiên + audit) và thứ tự băm R-09                                                                                             | **conditional** — sau khi N-1 sửa/merge và spec/plan 1c được dev review                                                                          |
| Audit Trail query                             | **ready** (chỉ đọc; nguồn `US-01-06`)                                                                                                                                                                             | **conditional** — spec/plan review; dữ liệu audit chỉ tin được khi N-1 đã sửa                                                                    |
| Thiết kế G2 (nguồn mới, JobTitle, I-2)        | **conditional** — Docs BRD 3.38/Scope 1.26/QĐ-70 phải được commit và pin snapshot mới (hiện 76 mục chưa commit); R-10 theo `QĐ-68`/`QĐ-70a/b`, R-11 theo `QĐ-70c`; thêm `US-02-07`; cân nhắc R-03 cho tổ chức lớn | **blocked** — chờ N-1, snapshot pin, spec/plan G2 + migration/test plan được dev review                                                          |
| Chuyển giao/khôi phục Super Admin, vai suy ra | **conditional** — dựa trên `US-01-09`/`FR-8.10` và thực thể G2 (trưởng phòng, Người duyệt chi); test service-level R-08 đã có                                                                                     | **blocked** — chờ phần G2 tương ứng (`US-01-03`, phòng/trưởng phòng) và N-1                                                                      |

Không có phạm vi nào được coi là production-ready; không chặn toàn bộ G vì một lỗi không liên quan — thiết kế 1c,
Audit Trail và G2 có thể làm song song với việc sửa N-1.

## 10. Dọn dẹp và trạng thái cuối

Xem [README runner](backend-g0-g1-rereview-after-fix-2026-10-14/README.md) mục _Dọn dẹp_ và
[evidence/99-end-state.txt](backend-g0-g1-rereview-after-fix-2026-10-14/evidence/99-end-state.txt).

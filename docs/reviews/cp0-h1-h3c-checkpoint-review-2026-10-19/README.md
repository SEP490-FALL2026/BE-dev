# CP-0A — review và chuẩn bị checkpoint H1 → H4.0, 19/10/2026

Lượt review cuối **chỉ đọc** trước checkpoint, theo Prompt 10A. Không sửa product code, test, OpenAPI, Prisma, migration,
config, package, rule, roadmap, spec/plan, ADR hay báo cáo cũ; không `git add`/commit/push/PR. Lát GATE.1, DOC.1, H4,
H5, H6, H8 và G3 → G10 chưa bắt đầu.

- Manifest 70 đường dẫn: [file-manifest.md](file-manifest.md).
- Báo cáo trước: [audit nền tảng 18/10](../be-foundation-audit-2026-10-18/README.md),
  [audit H4.0 + quyết định 09B](../be-full-src-architecture-audit-2026-10-19/README.md).

## 1. Kết luận

**`READY` cho checkpoint**, kèm điều kiện thực hiện ở CP-0B (mục 5): add tường minh đủ 70 đường dẫn, so lại hash trước
commit, commit trên nhánh riêng và chờ remote CI. Không có finding `blocker` hay `high`. Hai finding `medium` là rủi ro
**kế hoạch commit** (không phải lỗi code); các finding còn lại `low`/`note`, không chặn.

| Gate (cây cuối, không tự sửa tệp)                 | Kết quả                                                                                                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm openapi:export`                             | exit 0; `openapi.json` byte-identical `14fd428b…` (artifact deterministic, khớp nguồn)                                                                          |
| `pnpm check`                                      | exit 0 — rules 87 tệp/704 link/0 lỗi; rules test 18/18; format; Prisma; lint; typecheck; unit **54 suite / 562 test**; scripts 19/19; discovery 54/14/46; build |
| `pnpm test:e2e`                                   | exit 0 — **14 suite / 274 test**                                                                                                                                |
| `pnpm test:integration` (PostgreSQL 17.11 cô lập) | exit 0 — **46 suite / 597 test**, 299,6 s; 0 database còn sót                                                                                                   |
| `git diff --check`                                | exit 0 (chỉ cảnh báo LF→CRLF có sẵn của 4 tệp LF)                                                                                                               |
| Status/hash cuối                                  | 70 đường dẫn, 70/70 hash không đổi sau toàn bộ gate; chỉ thêm hai tệp báo cáo này                                                                               |
| U-01 (teardown `42501`)                           | **không tái hiện trong CP-0A** — xem mục 4                                                                                                                      |

Số test trùng khớp bằng chứng H3c đã ghi (unit 562, e2e 274, integration 597/46), nên các claim `verified` local của
H2a → H3c vẫn đúng với cây hiện tại.

## 2. Baseline

| Thuộc tính           | Giá trị                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Repo / branch / HEAD | BE `dev` / `bd05007561f6…` (`feat: update auth`)                                                                         |
| Upstream             | `origin/dev`; **ahead 4, behind 0** — `7c95e7d`, `186ad5f` (merge PR #12), `e06f9ea`, `bd05007` đều **chưa push**        |
| Working tree         | đầu và cuối lượt **70** = 52 tracked + 18 untracked; `git diff --stat`: 52 tệp, +1 850/−1 300                            |
| `openapi.json`       | `14fd428bf3eee2bf…` đầu lượt, sau export và cuối lượt                                                                    |
| Docs nghiệp vụ       | `9416fe0` (chỉ đọc); repo Docs có 2 đường dẫn dirty từ trước (`.drawio` sơ đồ ngữ cảnh và `.bkp`, 18/10 16:04), ngoài BE |
| Môi trường           | Windows 11, Git Bash, pnpm 11.1.3, Docker 29.1.2, PostgreSQL `postgres:17-alpine` (17.11) trên `127.0.0.1:55442`         |

**Phạm vi thật của checkpoint khác cách gọi "H1 → H3c":** H1/H1B đã nằm trong commit local `bd05007`; Prompt 01/02 nằm
trong `e06f9ea` (phần tài liệu 02B/02C nằm cả trong `bd05007`). Cây dirty chỉ chứa **H2a/04B, H2b, H3a/06B, H3b, H3c và
báo cáo H4.0/09B**. Push checkpoint sẽ đưa cả bốn commit local lên remote — vì vậy H1 được review lại trên `git show
bd05007` trong lượt này.

## 3. Review theo lát

Ba subagent chỉ đọc quét song song (H1/bảo mật; OpenAPI + contract H3a/H3b; H3c + inventory/tài liệu). Agent chính kiểm
lại mọi số liệu và finding dùng dưới đây bằng diff/tệp thật; các đếm OpenAPI được tính lại bằng script đọc-chỉ so
`HEAD:openapi.json` với cây.

| Lát      | Đã kiểm                                                                                                                                                                                                                                                                                                                                     | Kết quả                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| H1/H1B   | `refreshExpiresAt` lấy đúng biến `idleExpiresAt` đã ghi vào DB ở login (`login.service.ts`) và refresh (`session.service.ts:90-110`), cột `Timestamptz(3)`; rotate/replay/expired/logout idempotent/concurrent refresh (Q2) có test; không token/secret trong log/audit/example; tài liệu body-transport khớp code; ADR-0011 vẫn `Proposed` | đúng; CP0-03, CP0-04, CP0-05 |
| H2a/04B  | 60 operation trước/sau, 0 đổi `operationId`; **52 protected / 8 public**, 8 public đúng là 8 handler `@Public()`; pattern 170 → 40, 130 bị bỏ đều là regex uuid/date-time cạnh `format` tương ứng, `format` giữ 131; 14 example đều placeholder; transform không mutate input                                                               | đúng; CP0-09, CP0-10         |
| H2b      | 4 message đúng route (`APP_USER.LISTED/RETRIEVED`, `HEALTH.LIVENESS_CHECKED/READINESS_CHECKED`); 429 có trên 60/60 operation và throttle thật sự toàn cục (`ThrottlerGuard` là `APP_GUARD` đầu, không `SkipThrottle`); 5 422 mới đều có test runtime; không mất 401/403/503 nào                                                             | đúng; ghi chú N-2            |
| H3a/R-1  | `organization.http-errors.ts` chỉ bỏ `sharedAccounts`; status 409, mã, message, `members`/`totalMembers`/`openWork` giữ; service chỉ đổi chú thích nên transaction/audit/idempotency không đổi; test kiểm đúng ba khóa                                                                                                                      | đúng                         |
| H3b/R-2  | lock và unlock dùng chung `z.strictObject({ reason: trim().min(1).max(1000) })`; 422 trước service nên không ghi gì; audit `after.reason`; lặp lại không ghi sự kiện thứ hai; recovery CLI (`QĐ-81c`) không đổi; OpenAPI `requestBody.required`; tài liệu ghi tác động FE/Mobile                                                            | đúng; ghi chú N-3            |
| H3c      | chặn đúng tổ chức + tài khoản + `RESET_CREDENTIALS` + `PENDING`/`AWAITING_ACTIVATION` (`recovery.repo.ts:45`, `:133-145`); kiểm sau khóa AppUser `FOR UPDATE` và trước mọi side effect (`password-reset.service.ts:85-90`); 202 generic; link recovery còn dùng được; race test ép thứ tự thật bằng khóa giữ ở client riêng                 | đúng; CP0-06 → CP0-08        |
| H4.0/09B | chỉ báo cáo/tracker; E1–E9 và 70 = 52 + 18 nhất quán; backlog ghi là đề xuất, không là implementation/accepted                                                                                                                                                                                                                              | đúng; CP0-03 (một dòng H1)   |

## 4. Cross-slice và U-01

- **Contract chỉ đổi ở chỗ đã duyệt.** So `HEAD:openapi.json` với cây: không thêm/bớt route, method, `operationId`, tag
  hay mã response; thay đổi duy nhất là `security` ×52 (H2a), summary ×60 (H2a), 429 ×56 thêm (H2b), 422 ×5 thêm (H2b),
  `requestBody` của `POST /app-users/{id}/lock` và `/unlock` (H3b), schema `AccountStatusChangeBodyDto` (H3b), cleanup
  `const`/pattern/example (H2a). Hai thay đổi wire không thấy trong OpenAPI: 4 message (H2b) và `details` 409 (H3a).
- **OpenAPI thấy DTO H3b và metadata H2:** `app/configure-application.ts` nối `cleanupOpenApiDoc` → `toOpenApi30Presentation` →
  `withGlobalRateLimitResponse`; Swagger UI, `export-openapi.ts` và hai e2e đều đi qua `createOpenApiDocument`.
- **Response auth sau H1 không bị H2 làm lệch:** đổi của H2 trên `auth.dto.ts` chỉ là `.meta` description/example; 5
  trường session vẫn `required`.
- **Lock order:** forgot-password chỉ khóa AppUser; recovery khóa Employee SHARE → AppUser UPDATE → ticket; account-status
  khóa AppUser trước. Không thứ tự khóa mới, không đường deadlock mới. Transaction READ COMMITTED.
- **Fixture dùng chung:** không tệp `test/support/**` nào dirty; không Prisma/migration/package/config/script dirty.
- **Secret/PII:** không chuỗi giống JWT, khóa, mật khẩu thật trong 8 229 dòng diff + untracked; example là placeholder.
- **Phạm vi nghiệp vụ:** AI Gateway, OTel, Desktop Agent, tài khoản dùng chung chỉ xuất hiện trong tài liệu dưới dạng
  "đã loại/không hỗ trợ"; không code nào đưa lại.

**U-01 — teardown PostgreSQL `42501`: không tái hiện trong CP-0A.** Lần integration đầy đủ duy nhất của lượt này (46
suite, `--runInBand`, container mới, role `LOGIN NOSUPERUSER CREATEDB`) exit 0; log không có `42501`, không có lỗi drop
database; sau lượt chạy cluster còn 0 database ngoài `postgres`/`template*`. Container do lượt này tạo
(`slm-cp0a-test-db`) đã xóa. Không kết luận nguyên nhân hay "đã giải quyết"; tiếp tục theo dõi ở remote CI.

## 5. Finding

Không `blocker`, không `high`.

| Mã     | Mức    | Finding (bằng chứng)                                                                                                                                                                                                                                                              | Đề xuất sửa hẹp                                                                                                          |
| ------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| CP0-01 | medium | 19 tệp có hunk của từ 2 lát (manifest, cột Lát có `+`); `app/configure-application.ts:61-67` lồng H2a và H2b trong **một biểu thức**; `openapi.json` cộng dồn H2a+H2b+H3b. Commit theo lát cần tái dựng trạng thái trung gian chưa từng được kiểm — rủi ro hơn lợi ích                            | Một commit checkpoint cho H2a → H3c (mục 6); lịch sử theo lát giữ bằng spec/plan/bằng chứng từng item                    |
| CP0-02 | medium | 18 đường dẫn untracked (4 test + 2 source trong `src`, 10 tài liệu item, 2 báo cáo H4.0) chỉ vào commit nếu add tường minh; báo cáo H4.0 không được liên kết từ `roadmap.md`, `items/README.md` hay handoff plan (`grep` = 0)                                                     | CP-0B dùng danh sách add tường minh (mục 6) và đối chiếu `git status` sau add; liên kết báo cáo H4.0 ở bước pin metadata |
| CP0-03 | low    | Metadata trạng thái H1 lệch: `h1-auth-session-refresh-expiry/plan.md:6`, `:53`, `:75`, `spec.md:137` và `roadmap.md:39` ghi "chưa commit trên `e06f9ea`", nhưng H1 ở commit local `bd05007`; báo cáo H4.0 (mục 1, dòng Working tree) và tracker gọi cây dirty là "chuỗi H1 → H3c" | Sửa trong lượt pin metadata sau commit (CP-0B), cùng lúc ghi hash commit/PR thật; không phải lỗi code                    |
| CP0-04 | low    | Chú thích `session.service.ts:125-126` nói token "already-revoked or expired" là no-op, nhưng code chỉ xét trạng thái **session** (`:136-145`): token đã xoay/hết hạn của một session còn mở vẫn kết thúc session — đúng ý `us-01-bootstrap-login-session/spec.md:81`, ADR-0011   | Sửa chú thích (không đổi hành vi) ở lát auth kế tiếp (AUTH.1 hoặc H5.0)                                                  |
| CP0-05 | low    | `auth-concurrency.integration-spec.ts:158-161` đếm `SESSION.REVOKED` toàn bảng với `>= 1`; một revoke từ test khác cùng database cũng thỏa. Hành vi Q2 vẫn được khẳng định đúng qua `/me` 401                                                                                     | Lọc theo `resource_id` của session và kỳ vọng đúng 1                                                                     |
| CP0-06 | low    | `super-admin-recovery.integration-spec.ts:28-32` chờ `EXISTS (... pg_locks WHERE NOT granted)` toàn cluster, không gắn với client giữ khóa; an toàn hiện tại nhờ `--runInBand` trên container riêng                                                                               | Dùng `pg_blocking_pids(pid) @> ARRAY[<holder pid>]`                                                                      |
| CP0-07 | low    | Test H3c chèn ticket (`:626-650` và các ca `:516`, `:573`) không dọn — các ca phụ thuộc thứ tự chạy                                                                                                                                                                               | Dọn/supersede trong `finally` hoặc fixture riêng mỗi ca                                                                  |
| CP0-08 | low    | Spec H3c (`spec.md:68-70`) nêu hai ca **chặn** chưa có test: `RESET_CREDENTIALS` + `AWAITING_ACTIVATION`; ticket chờ có link đã hết hạn                                                                                                                                           | Thêm hai ca `insertTicket`                                                                                               |
| CP0-09 | low    | `test/http/platform/api-inventory.http-spec.ts:262` dùng chính `isRedundantFormatPattern` của code được test: nếu nestjs-zod đổi regex sinh ra, cleanup ngừng mà test vẫn xanh (chỉ diff `openapi.json` lộ ra)                                                                               | Khẳng định thêm: không node `format` uuid/date-time nào còn `pattern` ngoài allowlist                                    |
| CP0-10 | low    | `openapi-presentation.ts:38-41` đổi **mọi** khóa tên `const` thành `enum`, kể cả tên property hay key trong example; hôm nay không ảnh hưởng (chỉ một `const` là keyword)                                                                                                         | Bỏ qua con của `properties`/`example`, hoặc ghi giới hạn                                                                 |

Ghi chú (không cần sửa trước checkpoint):

- **N-1** H1: `token.service.ts:33-36` tính `expiresAt` của access token sau `signAsync`, có thể muộn hơn `exp` thật tới
  ~1 s (có từ trước H1); `refreshExpiresAt` không bị.
- **N-2** H2b: bốn message mới là thay đổi wire không hiện trong OpenAPI (chỉ pattern chung); đã ghi ở plan H2b. Grep
  `Code/FE-web`, `Code/Mobile` không thấy dùng `COMMON.SUCCESS`, `sharedAccounts` hay route lock/health.
- **N-3** H3b: lock/unlock **bắt buộc body** — client cũ không gửi body nhận 422 (đúng `QĐ-81`). Contract tài liệu chặt
  hơn runtime ở `reason` (OpenAPI `maxLength: 1000` trên chuỗi thô, runtime trim trước) — hướng an toàn.
- **N-4** H2a: OpenAPI giờ lỏng hơn runtime ở uuid (runtime chỉ nhận RFC v1–8) và date-time response luôn `Z`; mô tả 401
  của đổi mật khẩu bỏ chi tiết "locked account, departed employee" (runtime không đổi); tính deterministic không có test
  áp transform hai lần (export CP-0A byte-identical là bằng chứng thực tế).
- **N-5** H3c: yêu cầu bị chặn làm ít việc hơn yêu cầu phát link nên trả nhanh hơn chút (cùng dạng nhánh giới hạn mỗi giờ
  đã chấp nhận ở Q-6); `pendingForTarget` (`recovery.repo.ts:117`) không lọc `organizationId` như query mới (vô hại với
  một tổ chức); ticket `PENDING` chặn tự phục vụ tới khi người vận hành chạy lại (đúng `US-01-09` AC-11).
- **N-6** Lịch sử commit: `bd05007` ("feat: update auth") gộp H1/H1B với tài liệu 02B/02C; `e06f9ea` ("feat: review and
  fix base") gộp Prompt 01 → 02C. Viết lại cần rebase tương tác — không đề xuất; mô tả trong PR body thay thế.
- **N-7** ADR-0011, ADR-0012 vẫn `Proposed`; ADR-0011 chưa ghi một dòng về thay đổi luồng quên mật khẩu của H3c (tùy
  chọn). `us-01-bootstrap-login-session/spec.md:228` còn mục mở "tên cookie" đã lỗi thời.
- **N-8** Cảnh báo deprecation `pg` trong unit test là F-30 đã biết (INF.1). Handoff plan header nói Task 1–6 đã tạo item
  nhưng chỉ Task 4–6 có ghi chú tạo.

## 6. Kế hoạch checkpoint (CP-0B — chưa chạy lệnh nào)

**Khuyến nghị: nhánh riêng + ba commit theo nhóm tệp (không partial staging) + một PR vào `dev`.**

| Commit | Title (đề xuất)                                                                                   | Nội dung                                                                                                                                                   | Phụ thuộc | Gate                                                         |
| ------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------ |
| C1     | `feat(api): checkpoint H2a–H3c — OpenAPI presentation, 422/429, lock reason, recovery-safe reset` | 68 đường dẫn (52 tracked + 16 untracked): mọi `src`, `test`, `openapi.json`, 10 tài liệu item H2a → H3c và tài liệu dùng chung (manifest, cột Commit `C1`) | `bd05007` | gate CP-0A trên đúng các byte này (hash manifest); remote CI |
| C2     | `docs(review): full-src architecture audit H4.0 and Owner decisions E1–E9`                        | 2 báo cáo H4.0/09B (chỉ tài liệu, tách sạch theo tệp)                                                                                                      | C1        | prettier/link (đã chạy ở 09B)                                |
| C3     | `docs: pin checkpoint revisions` — **làm sau khi có hash C1/C2**                                  | Sửa CP0-03 (trạng thái H1, cụm "H1 → H3c"), ghi hash/PR thật vào roadmap/plan, liên kết báo cáo H4.0 (CP0-02)                                              | C1, C2    | `pnpm rules:check`, `pnpm rules:format`                      |
| C4     | (tùy Owner) `docs(review): CP-0A checkpoint review`                                               | 2 tệp báo cáo này                                                                                                                                          | C2        | prettier/link                                                |

Vì sao **một** commit cho H2a → H3c: CP0-01 — 19 tệp chồng hunk, một biểu thức lồng hai lát, artifact cộng dồn; tách sẽ
tạo các trạng thái trung gian chưa từng chạy gate. Lịch sử vẫn review được theo lát qua spec/plan/bằng chứng của từng
item (đều nằm trong C1) và manifest này. Tách C1/C2/C4 theo **tệp**, không cần `git add -p`.

Lệnh dự kiến cho CP-0B (**chưa chạy**; Owner duyệt trước):

```bash
# 0. Kiểm lại cây đúng các byte đã review
git status --porcelain=v1 -uall | wc -l                     # phải là 70 (72 nếu tính 2 tệp CP-0A)
sha256sum openapi.json                                      # phải là 14fd428b…
# 1. Nhánh riêng giữ nguyên working tree
git switch -c checkpoint/cp0-h2a-h3c
# 2. C1 — add tường minh: 52 tracked + 16 untracked của item/src (trừ 2 báo cáo H4.0)
git add -u
git add docs/workspace/items/h2a-openapi-presentation docs/workspace/items/h2b-openapi-wire-messages \
  docs/workspace/items/h3a-r1-department-in-use-details docs/workspace/items/h3b-r2-lock-unlock-reason \
  docs/workspace/items/h3c-forgot-password-during-recovery \
  src/infrastructure/http/openapi-presentation.ts src/infrastructure/http/openapi-presentation.spec.ts \
  src/infrastructure/http/openapi-rate-limit.ts src/infrastructure/http/openapi-rate-limit.spec.ts \
  src/infrastructure/security/decorators/access.decorators.spec.ts \
  src/modules/identity-access/dto/account-management.dto.spec.ts
git status --porcelain=v1 -uall                             # chỉ còn ?? của 2 báo cáo H4.0 (+ CP-0A)
git commit                                                  # message C1 bên dưới
# 3. C2
git add docs/reviews/be-full-src-architecture-audit-2026-10-19
git commit -m "docs(review): full-src architecture audit H4.0 and Owner decisions E1–E9"
# 4. (sau C3/C4 nếu Owner muốn) push và PR
git push -u origin checkpoint/cp0-h2a-h3c
gh pr create --base dev --head checkpoint/cp0-h2a-h3c --title "<PR title>" --body-file <pr-body.md>
```

Ghi chú lệnh: `git add -u` chỉ lấy 52 tệp tracked đã đổi (manifest mục Tracked); Git sẽ cảnh báo LF→CRLF trên 4 tệp LF
— không đổi nội dung đã review. Nhánh mới chứa cả bốn commit local chưa push (`7c95e7d`, `186ad5f`, `e06f9ea`,
`bd05007`). Local `dev` vẫn trỏ `bd05007`; sau khi PR merge, đồng bộ `dev` với `origin/dev` theo quy trình nhóm (không
reset trong CP-0B).

**PR dự thảo**

- Title: `Foundation checkpoint: audit rules, H1 auth expiry, H2 OpenAPI, H3 remediations (R-1, R-2, AC-10)`
- Body:
  - _Nội dung:_ Prompt 01 → 02C (`e06f9ea`: foundation audit, rule kiến trúc, gate, template); H1/H1B (`bd05007`:
    `refreshExpiresAt`, tài liệu body-transport); H2a/04B, H2b (OpenAPI security/summary/example, message cụ thể, 422/429);
    H3a/R-1 (`QĐ-75`), H3b/R-2 (`QĐ-81`), H3c (`US-01-10` AC-10); báo cáo H4.0 + quyết định Owner E1–E9.
  - _Validation local (CP-0A, 19/10/2026):_ `pnpm check` (unit 562), e2e 274, integration 597/46 suite trên PostgreSQL
    17 cô lập, `openapi:export` byte-identical `14fd428b…`.
  - _Breaking cho client:_ lock/unlock bắt buộc body `{ reason }`; 409 `DEPARTMENT.IN_USE` bỏ `details.sharedAccounts`;
    bốn message mới (`APP_USER.LISTED`, `APP_USER.RETRIEVED`, `HEALTH.LIVENESS_CHECKED`, `HEALTH.READINESS_CHECKED`); thêm
    `refreshExpiresAt` (bổ sung). FE-web/Mobile regenerate client từ `openapi.json` của revision merge.
  - _Known limitations:_ remote CI chưa có; ADR-0011/0012 `Proposed`; không Owner acceptance; CP0-03 → CP0-10 mở; U-01
    không tái hiện ở CP-0A nhưng chưa có nguyên nhân.
  - Kết bằng dòng attribution theo quy ước của repo.

**Tác động FE/Mobile:** thay `FE-web/openapi/openapi.yaml` (cũ, 11/08) bằng `openapi.json` của revision đã merge rồi
chạy Orval; gửi `{ reason }` cho lock/unlock; dùng single-flight refresh (Q2) và `refreshExpiresAt`; client sinh ra sẽ
có bearer security trên 52 operation. Grep FE/Mobile hiện không thấy dùng route/trường bị đổi.

**Pin revision sau commit:** ghi hash C1/C2, số PR và kết quả remote CI vào roadmap, plan H1 → H3c và tracker (C3); Docs
nghiệp vụ giữ pin `9416fe0`. Không ghi `accepted` hay `merged-dev` khi chưa có sự kiện thật.

**Còn chờ ngoài code:** dev review ADR-0011/0012; Owner review/acceptance; remote CI; FE/Mobile regenerate. Theo handoff
plan, H4.1 chỉ bắt đầu khi H3a/H3b đã `merged-dev`.

## 7. Lệnh đã chạy

| Lệnh                                                                                                                   | Kết quả                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `git branch --show-current`, `rev-parse`, `rev-list --left-right --count HEAD...@{u}`, `log`                           | `dev` / `bd05007`; ahead 4, behind 0                    |
| `git status --porcelain=v1 -uall`, `sha256sum` 70 tệp, `diff --stat`, `--name-status`                                  | 70 = 52 + 18 đầu và cuối; 52 `M`; hash cuối = hash đầu  |
| `git show --name-status` bốn commit chưa push                                                                          | H1/H1B trong `bd05007`, Prompt 01 → 02C trong `e06f9ea` |
| `pnpm openapi:export` (sau khi sao lưu `openapi.json` vào scratchpad)                                                  | exit 0, `cmp` giống hệt                                 |
| `pnpm check`                                                                                                           | exit 0 (mục 1)                                          |
| `pnpm test:e2e`                                                                                                        | exit 0, 14/274                                          |
| `docker run postgres:17-alpine` + role `ci_integration` theo `test/README.md`; `pnpm test:integration`; `docker rm -f` | exit 0, 46/597; 0 database sót; container đã xóa        |
| `git diff --check`                                                                                                     | exit 0                                                  |
| Script đọc-chỉ so `HEAD:openapi.json` với cây (scratchpad)                                                             | số liệu mục 3, 4                                        |
| `prettier --check`, script kiểm link/anchor cho hai tệp báo cáo này và tracker                                         | xem tracker; báo cáo nằm ngoài phạm vi `rules:check`    |

Focused test theo lát không chạy riêng: bộ unit/e2e/integration **đầy đủ** đã chạy trên cùng cây và bao gồm mọi suite
focused (auth/session, OpenAPI, department, account, recovery).

Tệp tạo trong CP-0A: `docs/reviews/cp0-h1-h3c-checkpoint-review-2026-10-19/README.md`, `file-manifest.md`; ngoài repo:
`Prompts/BE-audit-and-architecture-2026-10-18/BE-WORKSTREAM-TRACKER.md`. Không commit, push hay PR.

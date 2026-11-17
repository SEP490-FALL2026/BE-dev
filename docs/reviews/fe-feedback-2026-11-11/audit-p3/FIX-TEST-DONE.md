# FIX-TEST — báo cáo (đợt 1 + đợt 2), chat "SEP-Start 83: coder mainflow", 16/11/2026

Worktree `D:\FPT\FALL2026\Code\be-fe-feedback`, nhánh `feat/fe-feedback`, từ `1f7ffa19`. 8 commit, **không push**. Chỉ sửa test/harness/thẻ module; không đổi code sản phẩm, `openapi.json`, migration, `prisma/`, `src/cli/seed/**`, `test/flows/**`.

Skill Preflight (theo `D:\FPT\FALL2026\CLAUDE.md`): chat chạy trong phiên đã nạp các skill `agent-skills:context-engineering` và `superpowers:verification-before-completion`; mapping gần nhất cho debug/test: quy trình "chạy đỏ → sửa → chạy xanh" của `FIX-TEST-PROMPT.md` mục 3. Mọi khẳng định "xanh" dưới đây là kết quả lệnh chạy thật trong phiên này.

DB test: `127.0.0.1:35432` (`slm-test-db`), `--maxWorkers=1`. Riêng T8 thêm `TEST_DATABASE_BOOTSTRAP_URL=postgresql://ci_bootstrap:ci-bootstrap-only@127.0.0.1:35432/postgres` chỉ cho lệnh đó.

## Bảng việc

| # | Suite | Commit | Đỏ trước | Xanh sau (lệnh) |
| - | ----- | ------ | -------- | ---------------- |
| T1 | `organization/organization.integration-spec.ts` | `6ea43799` | thiếu `contractEndDate` trong danh sách khóa | `pnpm test:integration test/integration/organization/organization.integration-spec.ts --maxWorkers=1` → 20/20 |
| T2 | `ai-assist/queue-summary-approver.integration-spec.ts` | `dc4a43c5` | R002 nhận `"1 tháng"`, test mong `null` | cùng lệnh cho file → 8/8 |
| T3 | `catalog/contract-fields-migration.integration-spec.ts` | `a712df6e` | `schemaDrift` exit 2 | cùng lệnh → 1/1 (đã xác nhận đỏ lại khi `git stash` bỏ sửa) |
| T4 | `requests/budget-proposals.integration-spec.ts` | `732a2b2d` | `Object.keys(mine)` thừa `effectiveBudget` | cùng lệnh → 23/23 |
| T5 | `requests/year-start-commitments-migration`, `platform/finance-invoices-upgrade`, `platform/unit-only-upgrade-history` | — (không sửa) | không còn đỏ | chạy chung 3 file → 3 suite, 16 test xanh (FIX-A2 `a0442752` đã đủ) |
| T6 | `budgets/budget-attachment-access.integration-spec.ts` | — (không sửa) | không còn đỏ | 12/12 xanh (FIX-LB4 đã đủ) |
| T7 | `budgets/budget-baseline-version.integration-spec.ts` | — (không sửa) | không tái hiện `TransientDatabaseError` khi chạy một mình | 19/19 xanh; lỗi cũ chỉ do tải DB, không làm harness retry |
| T8 | `_serial/database-runtime-role-invoice-write.integration-spec.ts` | `9150140f` | `applied/events/invoices = 0/0/0` | `pnpm test:integration:serial test/integration/_serial/database-runtime-role-invoice-write.integration-spec.ts` → 2/2 |
| T9 | `scripts/verify/capability-graph.test.mjs` + thẻ `src/modules/requests/README.md` | `b4e6c594` | 46 ≠ 45 | `node --test scripts/verify/capability-graph.test.mjs` → 28/28 |
| T10 | các bước còn lại của job `quality` | `befdb295` (1 sửa test) | `pnpm check` đỏ ở `test:scripts` | xem bảng T10 |

### Chi tiết sửa

- **T1** thêm `'contractEndDate'` vào danh sách khóa của `getEmployees` (RQ-2 `d99c21c3`).
- **T2** nhãn đúng nghiệp vụ: R002 do `paidRequest` gửi `termMonths: 1` ⟹ `"1 tháng"` (QĐ-111i); R001/R003 không có *Thời gian dùng* ⟹ `null`. Không còn phụ thuộc ngày chạy (nhãn tính từ số tháng, không từ ngày).
- **T3** áp các migration sau `TARGET` trước `schemaDrift`, theo mẫu `year-start-commitments-migration`; import thêm `committedMigrations`.
- **T4** thêm `'effectiveBudget'` (AD-1.3 `fcc9b6d2`).
- **T8** gốc: test dùng `K2`, mà luật hiện hành (MG-03, B3B-01) đưa hóa đơn `K2` vào dòng kho dùng chung (`booking = SUBSCRIPTION`, `commitment_id = null`, cam kết giữ nguyên). Ca chính đổi sang `K1` (giữ nguyên các cột kỳ vọng `3840000 / 1 / 4032000 / 1 / 1`); thêm ca `K2` ghim: ký được bằng role runtime, `invoices` gắn `subscription_id` của kho (`commitment_id`, `cost_center_id` null, `applied_minor` 0, `actual_cost_minor` 4032000), cam kết còn `HELD` với `applied_minor` 0, một sự kiện `INVOICE.RECORDED` với `booking = SUBSCRIPTION`. `withApprover()` chuyển vào `beforeAll` vì người duyệt chi chỉ được tạo một lần.
- **T9** capability thứ 46 của `requests` là `assessment-decision` (PL-2.4 `f080f3c4`, 16/11), đã có dòng L2 trong thẻ module. Cập nhật số 45→46 và chú thích lịch sử trong test, đồng thời số `46 capability, 141 cạnh` ở đầu mục đồ thị trong thẻ (lệnh `capabilities.mjs --module requests` là nguồn).
- **T10 / `befdb295`** `scripts/verify/bootstrap-installation.test.mjs`: ca *"is accepted by the parser: copied unfilled…"* chép `.env.bootstrap.example` nguyên văn. Máy Windows này có `core.autocrlf=true` nên working tree để CRLF (Git lưu LF), wrapper từ chối CR theo thiết kế ⟹ test đỏ. CI chạy Linux nên không gặp. Sửa: test chuẩn hóa `\r\n` → `\n` khi chép mẫu. Đã xác nhận đỏ (1 fail) khi bỏ sửa, xanh (0 fail) khi có.

## T10 — kết quả từng bước

| Bước | Lệnh | Kết quả thật |
| ---- | ---- | ------------ |
| `pnpm check` đầy đủ | `NODE_OPTIONS=--max-old-space-size=4096 pnpm check` | **exit 0**: `rules:check` 562 file/4207 link/0 lỗi; `rules:test` 38/38; unit 530 suite/6868 test; gates 16 suite/335 test; `arch:check`; `arch:docs:check`; `test:scripts` 308 test, 306 pass, 0 fail; `test:discovery`; `build` |
| Drift Prisma | DB mới `slm_ci_migration_drift` trong 35432: `prisma migrate deploy` rồi `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` | deploy "All migrations have been successfully applied", **drift exit 0** (DB đã xóa sau khi chạy) |
| Compose dev | `docker compose config --quiet` | exit 0 |
| Compose prod | `config --quiet` với profile `deploy`, `admin` và 3 mật khẩu giả; rồi thiếu `DATABASE_RUNTIME_PASSWORD` | cấu hình đủ: exit 0; thiếu mật khẩu runtime: bị từ chối đúng yêu cầu (H7) |
| OpenAPI | `pnpm openapi:export` rồi `git diff --exit-code -- openapi.json` | export exit 0, **diff exit 0** |
| Audit | `pnpm audit --prod --audit-level high` | exit 0; 1 lỗ hổng mức **low** (dưới ngưỡng high) |

## Chạy thư mục module đã chạm (`--maxWorkers=1`, DB 35432)

| Thư mục | Kết quả |
| ------- | ------- |
| `test/integration/organization` | 34 suite, 378 test xanh |
| `test/integration/ai-assist` | 7 suite, 85 test xanh |
| `test/integration/catalog` | 59 suite, 633 test xanh |
| `test/integration/requests` | 129 suite: lượt đầu **126 xanh, 3 đỏ** (`need-decision-queue` 16 ca, `grant-queue` 1 ca, `year-start-commitments-migration` 1 ca). Chạy lại từng suite một mình: `need-decision-queue` + `grant-queue` 26/26 xanh; `year-start-commitments-migration` 2/2 xanh. Máy đang chạy CI song song ⟹ đỏ do tải/hết thời gian, không phải lỗi test hay sản phẩm; không sửa gì |

Cuối gói (sau T1–T4): `pnpm typecheck` exit 0, `pnpm lint` exit 0, `pnpm test` 530 suite/6868 test xanh; Prettier xanh trên mọi file đã sửa. `pnpm check` lần cuối (sau cả 8 commit) exit 0 như bảng trên.

## Nghi lỗi logic

Không có. Mọi ca đỏ gốc là test lỗi thời (T1, T2, T3, T4, T8, T9) hoặc đặc thù môi trường (bootstrap CRLF; tải DB), không có hành vi sản phẩm trái luật hiện hành.

Lưu ý cho chat điều phối (không phải lỗi logic): `year-start-commitments-migration` mất ~217 giây trong lượt chạy cả thư mục `requests` khi máy tải nặng, nhưng 22 giây khi chạy một mình. Nếu CI từng đỏ suite này theo kiểu timeout thì nên xét tải runner trước khi xét code.

## Chưa làm

- Không chạy `pnpm test:integration:serial` cho cả thư mục `_serial` (chỉ file của T8) và không chạy `test:http`/`test:e2e`/`test:integration:timing`: ngoài danh sách việc; CI GitHub run 43831861007 báo http, e2e và integration shard 3 xanh.
- Không chạm suite seed (`installation/seed*`, `_serial/seed-check-runtime`), `test/flows/**`: của chat Z2.
- Chưa push; chờ chat điều phối verify.

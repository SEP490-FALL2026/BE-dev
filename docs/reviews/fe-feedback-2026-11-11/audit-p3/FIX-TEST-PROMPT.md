# FIX-TEST — gói sửa nợ test cuối prompt 3 (chat điều phối "SEP-Start 122" giao, 16/11/2026)

Bạn là chat code **"SEP-Start 83: coder mainflow"**. Trả lời tiếng Việt; giữ tiếng Anh cho code, đường dẫn, lệnh.

## 0. Đọc trước
1. Skill Preflight theo `D:\FPT\FALL2026\CLAUDE.md` (process + test/debug skill + verification-before-completion; đọc SKILL.md, liệt kê đầu báo cáo).
2. `D:\FPT\FALL2026\Code\be-fe-feedback\AGENTS.md` và rules BE nó dẫn tới (test/README.md cho DB test).
3. `docs/reviews/fe-feedback-2026-11-11/HANDOFF-CHAT.md` §6 (luật chat code: commit, D-n, cấm push/merge/deploy, cấm sửa Docs).

## 1. Phạm vi
- Repo: worktree `D:\FPT\FALL2026\Code\be-fe-feedback`, nhánh `feat/fe-feedback` (HEAD lúc giao `1f7ffa19`). Chỉ commit vào nhánh này, **không push**.
- **Chỉ sửa test/harness** (`test/**`, `*.spec.ts`, `src/**/*.spec.ts`), không đổi hành vi sản phẩm. Thấy test đỏ mà gốc là **lỗi logic sản phẩm** ⟹ KHÔNG sửa code sản phẩm; ghi vào mục "Nghi lỗi logic" của báo cáo (file test · ca · kỳ vọng · thực tế · nghi gốc) và làm tiếp mục khác.
- **CẤM chạm** `src/cli/seed/**`, `test/flows/**`, `test/support/flows/**`, các suite `test/integration/installation/seed*` và `_serial/seed-check-runtime` — chat điều phối đang làm gói **Z2 seed** ở worktree khác; các suite seed sẽ xanh sau Z2.
- Không đổi `openapi.json`, migration, `prisma/`.
- Test sửa xong không được phụ thuộc ngày chạy (không "bom ngày"): dùng ngày cố định/đồng hồ giả như các harness đã có.

## 2. Danh sách việc (đợt 1 — đã biết)
Nguồn: `D:\FPT\FALL2026\Code\verify-logs\FIX-TEST-LIST.md`, mục "Nợ test cho FIX-TEST" của `OVERNIGHT-DECISIONS.md` (dòng ~236) và `OVERNIGHT-DECISIONS-LANE-B.md` (dòng ~185) trong `docs/reviews/fe-feedback-2026-11-11/`.

| # | Suite | Lỗi | Hướng sửa |
| - | ----- | --- | --------- |
| T1 | `test/integration/organization/organization.integration-spec.ts` ("reads several employees at once…") | danh sách khóa thiếu `contractEndDate` | cập nhật hợp đồng test theo RQ-2 (`d99c21c3`) |
| T2 | `test/integration/ai-assist/queue-summary-approver.integration-spec.ts:144` | `requestedDurationLabel` mong `null`, nhận `"1 tháng"` | xác định nhãn đúng theo RQ-1/RQ-2 (ô *Thời gian dùng*), cố định ngày; nếu `"1 tháng"` là đúng nghiệp vụ thì sửa kỳ vọng |
| T3 | `test/integration/catalog/contract-fields-migration.integration-spec.ts:204` | `schemaDrift` exit 2: deploy tới migration CO-1 rồi so với schema hiện tại | áp các migration sau TARGET trước khi kiểm drift (mẫu: `year-start-commitments-migration.integration-spec.ts:121-125`) |
| T4 | `test/integration/requests/budget-proposals.integration-spec.ts:282` | `Object.keys(mine)` có thêm `effectiveBudget` | thêm khóa vào danh sách (AD-1.3 `fcc9b6d2`) |
| T5 | `test/integration/requests/year-start-commitments-migration.integration-spec.ts:126`, `platform/finance-invoices-upgrade`, `platform/unit-only-upgrade-history` | drift index `purchase_invoices` | FIX-A2 `a0442752` đã sửa — chạy lại xác nhận; còn đỏ thì sửa |
| T6 | `test/integration/budgets/budget-attachment-access.integration-spec.ts` | REJECT/REQUEST_CHANGES ⟹ 422 | FIX-LB4 đã giao — chạy lại xác nhận |
| T7 | `test/integration/budgets/budget-baseline-version.integration-spec.ts` | `TransientDatabaseError` ở `beforeAll` khi DB quá tải | chạy lại một mình; nếu chỉ do tải thì ghi "không sửa"; nếu tái hiện thì làm harness bền (retry start) |

**Đợt 2** (gửi 16/11 sau CI GitHub run 43831861007 trên `732a2b2d`: http, e2e, integration shard 3 xanh; mọi suite seed đỏ là của Z2 — không chạm):

| # | Suite / job | Lỗi | Hướng sửa |
| - | ----------- | --- | --------- |
| T8 | `test/integration/_serial/database-runtime-role-invoice-write.integration-spec.ts:95` (job integration-inband, chạy `pnpm test:integration:serial` với `TEST_DATABASE_BOOTSTRAP_URL=postgresql://ci_bootstrap:ci-bootstrap-only@127.0.0.1:35432/postgres` chỉ cho lệnh này) | `applied/events/invoices` = `0/0/0` thay vì `3840000/1/1` | Test lỗi thời, không phải lỗi logic: test dùng thuê bao `K2`, nhưng luật hiện hành (MG-03 = A, FIX-B3 B3B-01, SM-1) đưa hóa đơn `K2` vào dòng kho dùng chung, không trừ khoản cam kết của Request. Đổi ca chính sang thuê bao `K1` hoặc `K4` (hóa đơn của Request trừ cam kết) để vẫn ghim đường ghi cam kết bằng role runtime; thêm một ca `K2` ghim: ký được bằng role runtime, `invoices` gắn thuê bao/kho, cam kết không đổi. Đọc code ký hóa đơn (`src/modules/finance/**` purchase-invoice confirm, `BudgetsApi.recordPurchaseInvoice`) để lấy đúng cột kỳ vọng. Thấy hành vi trái luật trên ⟹ "Nghi lỗi logic", không sửa sản phẩm. |
| T9 | `scripts/verify/capability-graph.test.mjs:427` (job quality, `pnpm check` → `pnpm test:scripts`) | requests có **46** capability, test chờ 45 | Tìm capability mới của `src/modules/requests` (chạy lệnh graph như test làm), cập nhật số + chú thích lịch sử trong test, và **thẻ module** (bảng lớp L0–L3 trong tài liệu module mà test đọc — `cardLayers()`) nếu thiếu dòng: test ghi "the card is fixed, not the command". Không đổi code sản phẩm. |
| T10 | Phần còn lại của job quality (CI dừng ở `pnpm check` nên chưa chạy) | — | Sau khi `pnpm check` xanh toàn bộ ở local: chạy các bước còn lại của job `quality` trong `.github/workflows/ci.yml`: kiểm drift Prisma (DB mới trong 35432: `prisma migrate deploy` rồi `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`), `docker compose config --quiet` và kiểm `docker-compose.prod.yml` như CI, `pnpm openapi:export` + `git diff --exit-code -- openapi.json`, `pnpm audit --prod --audit-level high`. Ghi kết quả từng bước; đỏ thì sửa nếu là test/cấu hình kiểm, nếu là sản phẩm thì ghi "Nghi lỗi logic". |

Sau đợt 2: viết thêm vào `FIX-TEST-DONE.md`, gửi "FIX-TEST ĐỢT 2 XONG". Chat điều phối sẽ push nhánh và chạy lại CI GitHub.

## 3. Cách chạy test
- DB test riêng của bạn: `TEST_DATABASE_ADMIN_URL=postgresql://ci_integration:ci-integration-only@127.0.0.1:35432/postgres` (container `slm-test-db`, tmpfs). **`--maxWorkers=1`** — máy đang chạy full CI song song trên DB khác.
- Mỗi việc: chạy suite đó đỏ trước ⟹ sửa ⟹ xanh. Cuối gói: chạy cả **thư mục module** của các suite đã chạm (`pnpm test:integration test/integration/<module> --maxWorkers=1`), `pnpm typecheck`, `pnpm lint`, `pnpm test` (unit). Không chạy `seed:local`, `test:flows`.
- Docker treo (lỗi 500) ⟹ `docker desktop restart`, rồi dựng lại DB bằng `bash C:/Users/Asus/AppData/Local/Temp/claude/cb9d99d994b36370/c27266ac-740e-4502-b0ab-d8e5058375d3/scratchpad/make-test-db.sh slm-test-db 35432`.

## 4. Commit và báo cáo
- Mỗi việc một commit `test(<module>): …` (tiếng Anh, mô tả hành vi test ghim), không `--no-verify`.
- Báo cáo `D:\FPT\FALL2026\Code\verify-logs\FIX-TEST-DONE.md`: bảng việc → commit → lệnh → kết quả thật; mục "Nghi lỗi logic"; mục "Chưa làm".
- Xong đợt nào thì `SendMessage` tới **"SEP-Start 122: reseach,review,plan - fix main flows 2-3"**, dòng đầu `FIX-TEST ĐỢT n XONG`. Xong hết rồi DỪNG, chờ chat điều phối verify.

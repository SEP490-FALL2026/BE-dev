# Spec: gate giao hàng tin cậy — xuống dòng cố định, suite integration ổn định, drift migration trong CI, sao lưu trước deploy

- Phụ trách: chưa phân công (đề xuất: người giữ CI/gate).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review cuối; review kết quả Prompt 09 (23/10/2026) mở `GATE-RV-01`, sửa ở Prompt
  09C. Owner chọn `GATE-EOL=A` (chỉ `openapi.json text eol=lf`) và giao triển khai qua Prompt 09 ngày 22/10/2026 — đó là giao
  việc, không phải review hay nghiệm thu.
- Nguồn: Docs `72e1480`, BE `69f4891`; finding `GATE-01`, `GATE-02`, `DB-05`, `DB-15`, `DB-16`, `DB-17` của
  [review hậu merge](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#6-lệnh-và-kết-quả-trên-cây-cuối).
- Nhóm roadmap: xuyên module — hạng mục là `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này `pnpm test:e2e` xanh trên checkout Windows `core.autocrlf=true` cũng như trên CI Linux, suite integration đầy đủ
không có test vượt timeout do tải, CI chạy `prisma migrate diff --exit-code` sau migrate, deploy production có bước sao lưu
và quy ước _roll-forward hoặc khôi phục từ bản sao lưu_, và tài liệu kiến trúc khớp code — kiểm bằng lệnh gate và CI.

## Sizing decision

- Container: bó finding `GATE-01`, `GATE-02`, `DB-05`, `DB-15` → `DB-17` của review hậu merge 22/10/2026.
- Mode: `technical-enabler`.
- Outcome and owner: gate local/CI/deploy tin cậy và có thể tái lập; sở hữu `test/e2e`, `test/integration` (độ ổn định),
  `.github/workflows`, `.gitattributes`, tài liệu `docs/rules`/ADR.
- Boundaries: cấu hình repo/CI/deploy và test; không đổi route, schema, migration đã merge hay hành vi sản phẩm.
- Not larger: vai PostgreSQL tách migration/runtime (`DB-04`) là H7 (đã hoãn); gate collection/detail là
  `api-list-detail-contract-remediation`.
- Not smaller: cùng mục tiêu _một lệnh gate có cùng kết quả ở mọi máy_; tách ra để lại gate đỏ giả.
- Siblings: `api-list-detail-contract-remediation`, `installation-local-data-h6-1-h6-2`.
- Scope map: n/a

## Primary Story/AC

| Story | AC        | Coverage | Phần còn lại thuộc                                                                                     |
| ----- | --------- | -------- | ------------------------------------------------------------------------------------------------------ |
| —     | `GATE-01` | n/a      | gỡ chặn `api-list-detail-contract-remediation` (gate đọc `openapi.json`) và mọi hạng mục đổi OpenAPI   |
| —     | `GATE-02` | n/a      | gỡ chặn mọi hạng mục cần `pnpm test:integration` đầy đủ, trước hết `g2-employee-intake-by-super-admin` |
| —     | `DB-16`   | n/a      | gỡ chặn `catalog-licensing-write-integrity`, `finance-reporting-currency-integrity` (migration mới)    |

`DB-05` (sao lưu trước `migrate deploy`, quy ước rollback), `DB-15` (quy ước tên migration — không đổi tên migration đã
merge), `DB-17` (ADR-0005 status, ADR-0013 còn Proposed, chú thích `catalog.module.ts:65-70`) đi cùng các dòng trên.

## Supporting references

- `GATE-01`: `test/e2e/openapi-export.e2e-spec.ts:37-38` so byte tệp làm việc; `git ls-files --eol openapi.json` →
  `i/lf w/crlf`; repo không có `.gitattributes`; bản export trùng byte với `git show HEAD:openapi.json`.
- `GATE-02`: lượt đầy đủ 22/10/2026 `employee-imports-http` 521 s, test _gives the same answer to the same confirmation sent
  again_ vượt 30 s; chạy riêng 38/38 trong 10 s.
- `DB-05`: `.github/workflows/deploy.yml:110-122` không `pg_dump`; `20261020230000` dùng `ALTER TYPE … ADD VALUE`.
- `DB-16`: `.github/workflows/ci.yml` không có bước `migrate diff`.

## Explicit out of scope

H7; đổi tên/sửa migration đã merge; nâng runner CI.

## Dependencies and blockers

Đã gỡ: Owner chọn `GATE-EOL=A` (Prompt 09) — đúng một rule `openapi.json text eol=lf`; không `* text=auto eol=lf`, không
renormalize toàn repo. `openapi.json` được sinh lại bằng exporter (byte trùng `HEAD`). Không còn blocker kỹ thuật; Owner review còn
mở.

## Ownership: module, data, API

Đã sửa (Prompt 09): `.gitattributes` (mới, một rule); `test/e2e/openapi-export.e2e-spec.ts` (so byte, cấm CR, ghim rule);
`openapi.json` (sinh lại, chỉ đổi EOL ở cây làm việc); `test/support/disposable-database.ts` và
`test/integration/disposable-database.integration-spec.ts` (nguyên nhân thật của lượt đầy đủ đỏ — xem dưới);
`.github/workflows/ci.yml` (bước drift, path filter `.gitattributes`); `.github/workflows/deploy.yml` (sao lưu trước migrate);
`scripts/ops/postgres-backup-retention.sh` và `scripts/verify/backup-retention.test.mjs` (dọn bản sao lưu có giới hạn);
`docs/rules/database-business.md`, `docs/guides/containers.md`, `CONTRIBUTING.md`, `test/README.md`, `scripts/README.md`;
ADR-0005, ADR-0013 (chỉ annotation); `catalog.module.ts` (chỉ chú thích). Không đổi route, DTO, schema, migration hay query.
Prompt 09C (`GATE-RV-01`) chỉ sửa `scripts/verify/backup-retention.test.mjs` (chọn bash); script production giữ nguyên byte.

## Behavior and design

- **EOL (`GATE-01`):** `.gitattributes` chỉ `openapi.json text eol=lf` (`GATE-EOL=A`); artifact sinh lại bằng exporter. Test
  export so **byte** bản export với tệp đã commit, từ chối CR ở cả hai, và ghim đúng một rule trong `.gitattributes`; không
  chuẩn hóa `\r` lúc assert. Không `git add --renormalize .`, không đổi EOL tệp khác.
- **Ổn định integration (`GATE-02`):** timeout 30 s của `employee-imports-http` (Prompt 08) **không tái hiện** trong các lượt
  đầy đủ có đo (`pg_stat_activity`, khóa chờ, thời gian từng suite/test): suite chạy 10–17 s, không câu lệnh nào quá 3 s.
  Không nới timeout nào. Lượt đo đầu lại đỏ ở **nguyên nhân khác, có thật**: `DROP DATABASE ... WITH (FORCE)` của role thường
  trả `42501` khi một **autovacuum worker** đang ở trong CSDL tạm (role thường không được dừng nó, cũng không đọc được
  `backend_type` của nó). Tái hiện xác định trên PostgreSQL 17 (3/8 lượt thủ công; 8/8 lượt qua helper khi autovacuum chắc chắn
  có mặt). Sửa ở helper: chỉ khi FORCE trả `42501`, chạy **một** `DROP DATABASE` không FORCE — lệnh này tự báo autovacuum
  dừng, không dừng tiến trình nào khác và vẫn lỗi `55006` nếu còn session thật. Mọi lỗi khác vẫn không retry.
- **Drift (`DB-16`):** CI tạo `slm_ci_migration_drift` bằng role thường, `prisma migrate deploy` rồi
  `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` (exit 2 khi có khác biệt).
- **Sao lưu (`DB-05`):** bước 3.5 của `deploy.yml` chờ PostgreSQL, `pg_dump --format=custom` qua socket trong container (không
  in thông tin đăng nhập) vào `<APP_DIR>/backups/postgres` (`0700`, `umask 077`) qua tệp `.partial`, kiểm rỗng và
  `pg_restore --list` rồi mới đổi tên; bất kỳ bước nào lỗi ⟹ dừng trước `migrate deploy`. Workflow không xóa bản sao lưu.
  Dọn có giới hạn bằng `scripts/ops/postgres-backup-retention.sh`: dry run trừ khi `--apply`, giữ 10 bản mới nhất **và** mọi bản
  dưới 30 ngày (tuổi theo dấu thời gian UTC trong tên), chỉ thư mục tuyệt đối `…/backups/postgres` và đúng mẫu tên. Test
  retention (`GATE-RV-01`, Prompt 09C) chạy script bằng `bash` với đường dẫn gốc trên Linux/macOS; trên Windows bằng
  `bin\bash.exe` của Git for Windows mà `git --exec-path` chỉ ra, với đường dẫn `/d/...` — không gọi `bash` trần (từ
  PowerShell là WSL ở `System32`/`WindowsApps`, exit 127), không dùng `usr\bin\bash.exe` (ngoài Git Bash nó gặp `sort` của
  Windows trước); thiếu Git for Windows Bash ⟹ đúng một lỗi setup. Quy ước
  _không có down migration: roll-forward hoặc khôi phục từ bản sao lưu_ ở [database rules](../../../rules/database-business.md)
  và runbook ở [containers](../../../guides/containers.md#backup-before-production-migrations).
- **Tên migration (`DB-15`):** `YYYYMMDDHHMMSS_<snake_case>` với thời điểm hợp lệ, lớn hơn migration cuối; ba migration giờ
  24–26 giữ tên. Chỉ là quy ước tài liệu, không có gate.
- **Tài liệu (`DB-17`):** annotation ADR-0005 (đã có SQL ngoài Prisma — đếm ở `0198456`), ADR-0013 (ba module đã merge đúng
  hướng, vẫn `Proposed`), chú thích `catalog.module.ts` (export `CatalogService`, `licensing` import nó). Phần cấu trúc còn lại
  của `DB-17` (`subscription.service.ts` 400 dòng, 5 service > 6 phụ thuộc, `requireOrganization()` lặp) vẫn là backlog review.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                 | Cấp test             | Kết quả mong đợi                     | Bằng chứng sau implement                                          |
| ----------- | ------------------------------------------------------------------- | -------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| `GATE-01`   | checkout Windows `core.autocrlf=true`, `openapi.json` CRLF          | e2e                  | đỏ trước rule, xanh sau              | đỏ trước; xanh 3/3 sau ([plan](plan.md#verification-and-handoff)) |
| `GATE-01`   | export khác nội dung thật (đổi một mô tả)                           | e2e (đột biến)       | vẫn đỏ                               | đỏ; khôi phục đúng byte                                           |
| `GATE-01`   | checkout mới `autocrlf=true` với rule hẹp                           | git (repo tạm)       | `openapi.json` LF, tệp khác theo máy | `i/lf w/lf` cho `openapi.json`, tệp khác vẫn `w/crlf`             |
| `GATE-02`   | `DROP ... WITH (FORCE)` khi autovacuum ở trong CSDL (role thường)   | integration + thật   | xóa được, không dừng tiến trình khác | đỏ trước (stub; 8/8 thật), xanh sau (8/8 thật)                    |
| `GATE-02`   | còn session thật giữ CSDL sau `42501`                               | integration          | vẫn lỗi, ghi `plainDropSqlState`     | xanh                                                              |
| `GATE-02`   | `pnpm test:integration` đầy đủ hai lượt liên tiếp trên cây cuối     | integration          | 0 lỗi; thời gian ghi lại             | [plan](plan.md#verification-and-handoff)                          |
| `DB-16`     | thêm cột vào Prisma không có migration                              | bước CI (cục bộ)     | bước drift đỏ                        | exit 2 `Added column drift_probe`; khôi phục đúng byte            |
| `DB-05`     | `pg_dump` lỗi, bản sao lưu không đọc được, thành công               | khối deploy (cục bộ) | hai ca dừng, ca thành công đọc được  | exit 1/1/0; bản sao lưu khôi phục ra 40 migration, 58 bảng        |
| `DB-05`     | retention: dry run, `--apply`, biên 10/30 ngày, tên lạ, thư mục sai | script               | chỉ xóa bản > 30 ngày ngoài 10 bản   | `pnpm test:scripts` 6/6; chạy thử Linux qua stdin                 |
| `DB-05`     | runner retention từ PowerShell, Git Bash, thiếu Git (`GATE-RV-01`)  | script               | hai shell xanh; thiếu: một lỗi setup | trước PowerShell 20/26 (6 × 127); sau 30/30 cả hai; đột biến đỏ   |
| `DB-05`     | deploy thật lên staging/VPS                                         | thủ công             | bản sao lưu tạo trước migrate        | **chưa chạy** — không được giao                                   |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `GATE-01`,
      `GATE-02`, `DB-16`.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; CI có bước drift — local xanh (plan);
      remote CI `UNVERIFIED` tới khi có run của revision Owner commit.
- [x] Spec/plan/roadmap phản ánh implementation cuối; CONTRIBUTING/test README nêu `.gitattributes` và renormalize.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook (deploy, sao lưu) đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 08. Chưa code, chưa review, chưa nghiệm thu.

22/10/2026 (Prompt 09, Remediation Wave 0 — Phase A): triển khai và kiểm chứng cục bộ trên BE `0198456` + cây chưa commit.
`GATE-01`, `DB-05` (phần repo), `DB-15`, `DB-16`, `DB-17` (phần tài liệu) đóng ở mức `verified`; `GATE-02` đóng phần tái hiện
được (teardown `42501`) và ghi rõ timeout gốc không tái hiện. Chưa có Owner review, remote CI hay deploy thật; không `accepted`.

23/10/2026 (Prompt 09C, Owner review `GATE-RV-01`): `script 26/26` của Prompt 09 là lượt chạy từ Git Bash. Từ PowerShell
trên cùng cây, `pnpm test:scripts` đỏ 20/26: `bash` trần thành `C:\Windows\System32\bash.exe` (WSL), nhận đường dẫn `/d/...`
và exit 127 ở cả 6 test retention — `pnpm check` phụ thuộc PATH của shell cha. Sửa chỉ runner test: chọn bash xác định (mục
_Sao lưu_ ở trên), 4 test resolver đỏ trước/xanh sau; `pnpm test:scripts` 30/30 từ PowerShell và từ Git Bash. Script
production, workflow, runtime, `openapi.json` không đổi. `verified` cục bộ, chưa commit; không `accepted`.

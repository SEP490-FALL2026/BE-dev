# Spec: gate giao hàng tin cậy — xuống dòng cố định, suite integration ổn định, drift migration trong CI, sao lưu trước deploy

- Phụ trách: chưa phân công (đề xuất: người giữ CI/gate).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review — thêm `.gitattributes` đổi cách checkout trên Windows của mọi contributor.
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

Owner đồng ý `.gitattributes`. Phương án đề xuất là phạm vi hẹp `openapi.json text eol=lf`; không dùng
`* text=auto eol=lf` và không renormalize toàn repo trong lát này. Sau khi thêm, sinh lại đúng `openapi.json` rồi chỉ stage
artifact đó cùng `.gitattributes`. Điều tra `GATE-02` cần chạy lại suite đầy đủ có ghi `pg_stat_activity` và thời gian từng
test.

## Ownership: module, data, API

`.gitattributes` (mới), `test/e2e/openapi-export.e2e-spec.ts` (so sau chuẩn hóa EOL — phòng thủ thêm),
`test/integration/employee-imports-http.integration-spec.ts` và helper nếu nguyên nhân ở test; `.github/workflows/ci.yml`
(bước `prisma migrate deploy` lên CSDL CI + `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`),
`.github/workflows/deploy.yml` (sao lưu trước migrate), `docs/rules/database-business.md` (quy ước tên migration, rollback),
ADR-0005, ADR-0013 (chỉ annotation trạng thái), `catalog.module.ts` (chú thích). Không đổi route/schema.

## Behavior and design

- **EOL (`GATE-01`):** `.gitattributes` chỉ cố định `openapi.json text eol=lf`; sinh lại riêng artifact này để working tree
  có LF. Test export tiếp tục so byte chính xác và kiểm artifact không chứa CR; không bỏ `\r`/chuẩn hóa lúc assert vì cách đó
  sẽ che một artifact sai chuẩn. Không `git add --renormalize .` và không đổi EOL toàn repo.
- **Ổn định integration (`GATE-02`):** tìm nguyên nhân (tải pool kết nối, khóa còn giữ từ suite trước, kích thước CSDL tạm)
  bằng lượt đầy đủ có đo; sửa ở test/harness (ví dụ timeout riêng có lý do, dọn kết nối) — không nới timeout toàn cục để che.
- **Drift (`DB-16`):** CI migrate deploy lên CSDL dịch vụ rồi `migrate diff --exit-code`.
- **Sao lưu (`DB-05`):** `pg_dump` vào artifact tạm trước `migrate deploy`; tài liệu hóa _không có down migration; khôi phục
  bằng bản sao lưu hoặc roll-forward_.
- **Tên migration (`DB-15`):** quy ước `YYYYMMDDHHMMSS` với giờ hợp lệ hoặc số thứ tự tăng; không đổi tên migration đã có.
- **Tài liệu (`DB-17`):** annotation trạng thái ADR-0005 (đã có ràng buộc ngoài Prisma), ADR-0013 (đã merge, vẫn chờ Owner
  Accepted), chú thích `catalog.module.ts`.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                        | Cấp test    | Kết quả mong đợi                   | Bằng chứng sau implement |
| ----------- | ---------------------------------------------------------- | ----------- | ---------------------------------- | ------------------------ |
| `GATE-01`   | checkout Windows `core.autocrlf=true`, `openapi.json` CRLF | e2e         | `openapi-export` xanh              | chưa chạy                |
| `GATE-01`   | export khác nội dung thật (đổi một mô tả)                  | e2e         | vẫn đỏ                             | chưa chạy                |
| `GATE-02`   | `pnpm test:integration` đầy đủ hai lượt liên tiếp          | integration | 0 timeout; thời gian suite ghi lại | chưa chạy                |
| `DB-16`     | thêm cột vào Prisma không có migration                     | CI          | bước drift đỏ                      | chưa chạy                |
| `DB-05`     | deploy thử lên môi trường staging                          | thủ công    | bản sao lưu tạo trước migrate      | chưa chạy                |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `GATE-01`,
      `GATE-02`, `DB-16`.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; CI có bước drift.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; CONTRIBUTING/test README nêu `.gitattributes` và renormalize.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook (deploy, sao lưu) đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 08. Chưa code, chưa review, chưa nghiệm thu.

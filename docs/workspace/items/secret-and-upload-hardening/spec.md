# Spec: hardening bí mật và tải tệp — giới hạn xem khóa, che token khi import, chính sách secret cấu hình, giới hạn multipart

- Phụ trách: chưa phân công (đề xuất: người giữ security/config).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review — chọn hạn mức xem khóa (mỗi phút/mỗi ngày theo tài khoản) và có cần xác
  thực lại trước khi xem hay không.
- Nguồn: Docs `72e1480` (`US-04-12` kho khóa, `US-02-05` import hiện trạng), BE `69f4891`; finding `SEC-02` → `SEC-06`
  của [review hậu merge](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#5-bảo-mật-migration-transaction-và-audit).
- Nhóm roadmap: xuyên module — hạng mục là `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này một token IT Admin bị lộ không thể rút toàn bộ kho khóa (xem khóa bị giới hạn theo tài khoản, lưu bền, có cảnh
báo), token trong cột định danh của import hiện trạng luôn bị che trước khi lưu, cấu hình production từ chối credential kho
công khai và khóa mã hóa trùng byte giữa hai mục đích, và upload multipart có giới hạn trường/phần — kiểm bằng test.

## Sizing decision

- Container: bó finding `SEC-02` → `SEC-06` của review hậu merge 22/10/2026 (hardening bundle tương thích).
- Mode: `technical-enabler`.
- Outcome and owner: không lộ hay rút bí mật qua các đường hiện có; capability `licensing/license-key`,
  `data-import/seat-baseline-import`, `data-import/employee-import` (multipart), `infrastructure/config`,
  `infrastructure/object-storage` (config).
- Boundaries: thêm hạn mức xem khóa bằng bộ đếm PostgreSQL nguyên tử theo tài khoản/cửa sổ — migration mới, sửa hàm che, sửa validate
  env, giới hạn `multer`; không đổi contract thành công của route nào (429 đã khai toàn cục).
- Not larger: toàn vẹn tệp hợp đồng là `contract-document-upload-integrity`; vai PostgreSQL tách migration/runtime là H7.
- Not smaller: năm điểm cùng một đợt review bảo mật, mỗi điểm nhỏ và cùng gate `pnpm check`; tách ra là năm PR một dòng.
- Siblings: `contract-document-upload-integrity`.
- Scope map: n/a

## Primary Story/AC

| Story | AC       | Coverage | Phần còn lại thuộc                                                  |
| ----- | -------- | -------- | ------------------------------------------------------------------- |
| —     | `SEC-02` | n/a      | gỡ chặn `g3-license-key-vault` (giới hạn đã ghi ở spec, mục 2)      |
| —     | `SEC-03` | n/a      | gỡ chặn `g4-seat-baseline-import` (_token không bao giờ được lưu_)  |
| —     | `SEC-04` | n/a      | gỡ chặn `operations-foundation-h6-3-h6-4-root1` (chính sách E3 = C) |

`SEC-05` (so khóa theo byte, phủ khóa trước đây) đi cùng `SEC-04`; `SEC-06` (giới hạn multipart) đi cùng `SEC-03`.

## Supporting references

`license-keys.controller.ts:98-119`, `rate-limit.options.ts`, `g3-license-key-vault/spec.md` (giới hạn 2);
`seat-baseline-rows.ts:83-88,119-124`; `object-storage.config.ts:29-38`; `secret-environment.ts:114-140`;
`seat-baseline-imports.controller.ts:91`, `employee-imports.controller.ts:78`; rule [security và jobs](../../../rules/security-jobs.md).

## Explicit out of scope

Vai PostgreSQL runtime/migration (H7); xoay khóa kho (`Q8` của báo cáo PR #14 — công cụ re-seal là phạm vi mới).

## Dependencies and blockers

Owner chọn hạn mức xem khóa. Không blocker kỹ thuật.

## Ownership: module, data, API

`licensing/license-key/*` (+ guard/service theo `appUserId`, bộ đếm bền), migration mới;
`seat-baseline-rows.ts`; `infrastructure/config/secret-environment.ts`, `object-storage.config.ts`; hai controller import
(`limits`). `openapi.json` không đổi (429 đã khai).

## Behavior and design

- **Xem khóa (`SEC-02`):** `POST /license-keys/{id}/reveal` dùng bộ đếm PostgreSQL theo `appUserId` cho cửa sổ phút và ngày
  (không theo IP). Mỗi bucket có khóa duy nhất `(app_user_id, window_kind, window_start)`; một câu lệnh
  `INSERT … ON CONFLICT … DO UPDATE … WHERE count < limit RETURNING` giữ chỗ nguyên tử trong cùng transaction với reveal
  và Audit Trail. Không dùng cách _đếm AuditEvent rồi mới ghi_, vì hai request đồng thời ở lượt cuối có thể cùng qua.
  Vượt hạn mức ⟹ 429 `HTTP_TOO_MANY_REQUESTS`; cảnh báo vận hành có cấu trúc, không lộ khóa.
- **Che token (`SEC-03`):** che theo dạng chuẩn hóa (bỏ khoảng trắng và ký tự vô hình `U+200B`–`U+200F`, `U+FEFF`) và che
  khi **bất kỳ** kiểm nào gắn cờ (định dạng lạ hoặc giống bí mật).
- **Credential kho (`SEC-04`):** ngoài `NODE_ENV=test`, từ chối `minioadmin` và access key bằng secret key.
- **Khóa mã hóa (`SEC-05`):** bắt base64 chuẩn; so buffer giải mã giữa mọi khóa hiện hành và trước đây của cả hai mục đích
  (kho khóa, outbox).
- **Multipart (`SEC-06`):** `limits: { fileSize, files: 1, fields: 2, fieldSize: 64, parts: 3 }` cho cả hai upload import.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                                    | Cấp test           | Kết quả mong đợi                       | Bằng chứng sau implement                                                                                                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------- | ------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEC-02`    | 11 lần xem trong một phút, cùng tài khoản khác IP; vượt hạn mức ngày sau khởi động lại | integration        | 429; đếm bền qua khởi động lại         | xanh — `license-key-reveal-quota` (5), `seat-baseline-import-http` (thêm 1), unit (`secret-environment`, `object-storage.config`, `account-identifier`, `seat-baseline-rows`), e2e `seat-baseline`, `employee-imports` |
| `SEC-02`    | hai request đồng thời tranh đúng lượt cuối của cùng bucket                             | integration        | đúng một request thành công, một 429   | xanh — `license-key-reveal-quota` (5), `seat-baseline-import-http` (thêm 1), unit (`secret-environment`, `object-storage.config`, `account-identifier`, `seat-baseline-rows`), e2e `seat-baseline`, `employee-imports` |
| `SEC-03`    | `" ghp_…"` có khoảng trắng, `ghp_…` kèm `U+200B`                                       | unit + integration | dòng lưu và `GET …/rows` chỉ có mặt nạ | xanh — `license-key-reveal-quota` (5), `seat-baseline-import-http` (thêm 1), unit (`secret-environment`, `object-storage.config`, `account-identifier`, `seat-baseline-rows`), e2e `seat-baseline`, `employee-imports` |
| `SEC-04`    | production với `minioadmin`/`minioadmin`                                               | unit               | khởi động bị từ chối, không in secret  | xanh — `license-key-reveal-quota` (5), `seat-baseline-import-http` (thêm 1), unit (`secret-environment`, `object-storage.config`, `account-identifier`, `seat-baseline-rows`), e2e `seat-baseline`, `employee-imports` |
| `SEC-05`    | cùng 32 byte viết base64 và base64url; khóa trước đây trùng khóa outbox                | unit               | bị từ chối                             | xanh — `license-key-reveal-quota` (5), `seat-baseline-import-http` (thêm 1), unit (`secret-environment`, `object-storage.config`, `account-identifier`, `seat-baseline-rows`), e2e `seat-baseline`, `employee-imports` |
| `SEC-06`    | 50 trường form, trường 1 MB                                                            | e2e                | 413/422, không đọc vào bộ nhớ          | xanh — `license-key-reveal-quota` (5), `seat-baseline-import-http` (thêm 1), unit (`secret-environment`, `object-storage.config`, `account-identifier`, `seat-baseline-rows`), e2e `seat-baseline`, `employee-imports` |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `SEC-02`
      → `SEC-06`.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; `.env.example` và runbook cập nhật.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 08. Chưa code, chưa review, chưa nghiệm thu.

23/10/2026 (Prompt 10 — xử lý tồn đọng G0→G4): `SEC-02`→`SEC-06` hiện thực: hạn mức xem khóa 10/phút và 200/ngày theo tài khoản, bộ đếm PostgreSQL nguyên tử (`license_key_reveal_windows`, migration `20261022140000`), 429 `HTTP_TOO_MANY_REQUESTS`, đếm bền và chịu tranh lượt cuối; che token theo dạng chuẩn hóa (và che mọi định danh không phải tên bằng `[masked: invalid]`); credential kho chỉ mặc định ở `NODE_ENV=test`, từ chối `minioadmin` và access key = secret; khóa mã hóa phải là base64 chuẩn, so theo byte giữa mọi khóa hiện hành và trước đây của hai mục đích; multipart `{files:1, fields:2, fieldSize:64, parts:3}` (400 `HTTP_BAD_REQUEST`). Áp dụng **mặc định do spec khuyến nghị**, không phải quyết định của Owner: Owner chưa review; nếu Owner chọn khác thì đổi ở đây. Kiểm chứng: `license-key-reveal-quota` (5), `seat-baseline-import-http` (thêm 1), unit (`secret-environment`, `object-storage.config`, `account-identifier`, `seat-baseline-rows`), e2e `seat-baseline`, `employee-imports` — xanh trên cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026. Gate toàn cây trên cùng cây: `pnpm lint`, `tsc --noEmit`, `pnpm test` (unit 2.074 (141 suite)), `pnpm test:e2e` (839 (32 suite)), `pnpm test:integration` (112 suite, 1.429 test, gồm 4 test kho S3 thật trên LocalStack), `prisma migrate deploy` trên CSDL mới + `migrate diff --exit-code` (không lệch), `pnpm openapi:export`. Giới hạn: Hạn mức 10/200 là hằng số trong mã (không cấu hình bằng env). `.env.example` cập nhật. Xoay khóa kho (re-seal) ngoài phạm vi. Chưa commit khi viết dòng này, chưa remote CI, chưa Owner review, chưa nghiệm thu: không có gì là `accepted`; đỏ-trước của từng test không được ghi lại.

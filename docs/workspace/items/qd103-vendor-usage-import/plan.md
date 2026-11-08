# Plan: qd103-vendor-usage-import

- Spec: `spec.md` cùng thư mục; revision đầu vào: Docs `9c7f386`, BE `46b6a94e` (đọc ở `712044f9`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: subagent chat review (W6, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **hai lượt** — Phase 1 nguồn + xem trước (Task 1–3, Checkpoint A), Phase 2 xác nhận + danh tính + bằng chứng (Task 4–6,
  Checkpoint B). Ước ~72 file (≈ 32 + 40).

## Before coding

Đọc `src/modules/usage/README.md`, `docs/rules/module-structure.md` (L0–L3, ≤ 25 file/thư mục, hậu tố `.json.ts` cho codec), ADR
`docs/decisions/0019-module-tiers-and-public-api.md` (`public/` ≤ 8 phụ thuộc, extension point có `static binds`), `docs/rules/database-business.md`
(mục _Cột JSON_: mỗi cột một codec), `docs/rules/api-contract.md` (upload multipart, `Idempotency-Key`, 400/413/415). Mẫu preview → confirm:
`src/modules/data-import/seat-baseline-import/` (`seat-baseline-import.service.ts`, codec `*-summary.json.ts`, `prisma/models/data-import.prisma:53-110`)
và test `test/integration/data-import/seat-baseline-import-http.integration-spec.ts`. Đối chiếu `file:dòng` ở spec. Lệnh đã kiểm trong `package.json`:
`db:migrate:deploy`, `prisma:generate`, `test`, `test:integration`, `test:http`, `openapi:export`, `arch:check`, `arch:capabilities`, `rules:check`, `test:gates`.

## Design review

Audit `design-audit-w6.md` (08/11/2026) — hạng mục này: 1 Cao (DA6-06) · 6 TB (DA6-07…DA6-12) · 1 TB phần chung (DA6-14) · 2 Thấp (DA6-32, DA6-37).
Mọi finding đã kiểm với nguồn trước khi sửa (`EP-08:37,75,77,147-153,184-187,262`, `QĐ-101b`, QT A.4 :101, BRD `FR-4.4`, `FR-4.10`, code
`catalog.prisma:141`, `catalog.api.ts:81`, `notifications.api.ts:53`).

| Finding                                                  | Mức  | Kết quả                                                                                                                            | Sửa ở                                      |
| -------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| DA6-06 không chặn ứng dụng liên lạc                      | Cao  | đúng (`US-08-02` AC-3, `US-01-08` mặc định _không thu_) — 422 `COMMUNICATION_APP` ở tạo nguồn và upload; LEDGER `US-01-08`         | _Behavior_ 1; Task 2, 3                    |
| DA6-07 thiếu AC `EP-08`                                  | TB   | đúng — thêm `EP-08`; ứng viên chỉ mã NV + email; list `OPEN+DISMISSED`; `raw_identifier`; params thông báo; summary                | _Behavior_ 2, 6, 9; Task 3, 4, 5           |
| DA6-08 người được cấp sau lần nhập đầu chưa được báo     | TB   | đúng (`US-08-05` AC-3, AC-4) — làm ở W6: mọi xác nhận gửi tới người đang giữ, `eventKey` theo ứng dụng; vế _đúng lúc cấp_ LEDGER   | _Behavior_ 6; Task 4                       |
| DA6-09 IT sửa được `freshness_days` theo nguồn           | TB   | đúng một phần — `QĐ-101b` _tham số theo nguồn_ = theo **loại** nguồn, QT A.4 _quy tắc_; bỏ cột, hằng 7/14; lệch chữ Docs báo Owner | _Ownership_, _Behavior_ 10; Task 1, 6      |
| DA6-10 ngày cuối trước cửa sổ bị `INVALID`               | TB   | đúng (`FR-4.10`) — `LAST_ACTIVITY` nhận ngày `< coverage_from`                                                                     | _Behavior_ 3; Task 3                       |
| DA6-11 `employee_id` đóng dấu, không sửa được ánh xạ sai | TB   | đúng — bỏ `employee_id` khỏi ngày, gắn lúc đọc; thêm `usageIdentityMappingEnd`                                                     | _Ownership_, _Behavior_ 9–10; Task 1, 5, 6 |
| DA6-12 hai import khác nhau xác nhận song song           | TB   | đúng — khóa nguồn `FOR UPDATE` trước import; test đua hai import                                                                   | _Behavior_ 6–7; Task 4                     |
| DA6-14 ma trận năng lực không là cổng                    | TB   | đúng — `canConcludeAbsence` cần cờ năng lực; mẫu kiểm khớp cờ (422)                                                                | _Behavior_ 1, 10; Task 2, 6                |
| DA6-32 `SYSTEM_SEND` / `SYSTEM_SENT`                     | Thấp | đúng — thống nhất `SYSTEM_SENT`                                                                                                    | _Ownership_, _Behavior_ 6                  |
| DA6-37 cột JSON chưa có codec; thời hạn giữ `cells`      | Thấp | đúng — codec cho `cells`, `errors`; thời hạn giữ dòng thô ghi LEDGER                                                               | _Ownership_; Task 1, 3                     |

## Tasks

### Phase 1 — nguồn usage, tải lên, xem trước

### Task 1: migration `usage_vendor_sources`

- Files: `prisma/migrations/<ts>_usage_vendor_sources/migration.sql` (7 bảng, enum mới bằng `CREATE TYPE`, CHECK `INV-10`/`INV-11`, trigger
  `usage_activity_days`, partial UNIQUE), `prisma/models/usage.prisma` (model mới), `test/integration/usage/vendor-usage-migration.integration-spec.ts` (mới).
- Depends on: none (W4 PASS).
- Acceptance: test matrix _migration_, phần DB của `INV-10`, `INV-11`.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`;
  `pnpm test:integration -- test/integration/usage/vendor-usage-migration.integration-spec.ts`.

### Task 2: capability `vendor-source/` (khai báo nguồn, ma trận năng lực, chặn ứng dụng liên lạc)

- Files: `src/modules/usage/vendor-source/vendor-source.controller.ts`, `vendor-source.dto.ts`, `vendor-source.service.ts`, `vendor-source.policy.ts`
  (+ spec: `detectableGroups`, `limitation`, mẫu ↔ năng lực, ứng dụng liên lạc), `vendor-source.repo.ts`, `vendor-source-template.json.ts` (+ spec),
  `vendor-source.errors.ts`, `vendor-source.http-errors.ts`, `usage.module.ts`, `usage-audit-event.mapper.ts`;
  `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-route-codes-usage.ts` (mới, nếu gate đòi theo module);
  test `test/http/usage/vendor-source.http-spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: test matrix `INV-11`/`FR-4.16`, `US-08-02` AC-3 (vế tạo nguồn), `FR-4.4`; sửa nguồn đã dùng ⟹ 409 `IN_USE`.
- Verify: `pnpm exec jest src/modules/usage/vendor-source`; `pnpm test:http -- test/http/usage/vendor-source.http-spec.ts`; `pnpm arch:check`.

### Task 3: tải lên + phân tích CSV/JSON + xem trước (chưa xác nhận)

- Files: `src/modules/usage/vendor-import/vendor-import.controller.ts`, `vendor-import.dto.ts`, `vendor-import.service.ts`, `vendor-import.repo.ts`,
  `vendor-import.errors.ts`, `vendor-import.http-errors.ts`, `vendor-import-summary.json.ts` (+ spec), `vendor-import-row-cells.json.ts`,
  `vendor-import-row-errors.json.ts` (+ spec), nhóm `parse/` (`vendor-import-parse.service.ts`, `csv-report.policy.ts` + spec, `json-report.policy.ts` + spec,
  `coverage-window.policy.ts` + spec), nhóm `match/` (`vendor-import-match.policy.ts` + spec), `src/modules/organization/public/organization-read.api.ts`
  (`findEmployeesByWorkEmails`), `src/modules/licensing/public/licensing.api.ts` (`findHoldersByAccountIdentifiers`); `test/support/vendor-usage-samples.ts`
  (mới); test `test/integration/usage/vendor-import-preview.integration-spec.ts` (mới), `test/http/usage/vendor-import.http-spec.ts` (mới).
- Depends on: Task 2.
- Acceptance: test matrix `INV-10`/`FR-4.3`, `FR-4.10` (DA6-10), _suy ra_, `FR-4.11` (vế lưu), `FR-4.5` khớp, `FR-4.6` (vế preview), `US-08-02` AC-3
  (vế upload), _giới hạn file_, _preview → confirm_ (vế upload không ghi ngày, summary đủ trường `US-08-02` AC-1).
- Verify: `pnpm exec jest src/modules/usage/vendor-import`;
  `pnpm test:integration -- test/integration/usage/vendor-import-preview.integration-spec.ts`;
  `pnpm test:http -- test/http/usage/vendor-import.http-spec.ts`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` —
chỉ thêm `usageSource*`, `usageImportUpload/Get/RowList/Cancel`); `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`;
`pnpm arch:capabilities --module usage`. Commit `feat(qd103-w6): vendor-usage-import P1`.

### Phase 2 — xác nhận, thông báo theo dõi, hàng đợi danh tính, sai lệch, bằng chứng

### Task 4: xác nhận (khóa nguồn, idempotent, thông báo theo dõi, chồng lấn, ghi ngày)

- Files: `vendor-import/confirmation/vendor-import-confirmation.service.ts`, `vendor-import-confirmation.policy.ts` (+ spec: chồng lấn, bắt buộc
  thông báo lần đầu), `vendor-import-result.json.ts` (+ spec), `vendor-import.controller.ts`, `vendor-import.repo.ts`, `usage/public/usage.extension-points.ts`
  (`UsageImportListeners` — emit `CONFIRMED`), `src/modules/licensing/public/licensing.api.ts` (`listCurrentHolders`),
  `src/modules/notifications/public/notifications.types.ts`, `src/modules/notifications/inbox/inbox.policy.ts` (`USAGE_TRACKING_NOTICE`);
  test `test/integration/usage/vendor-import-confirm.integration-spec.ts` (mới).
- Depends on: Checkpoint A.
- Acceptance: test matrix _preview → confirm_ (4 ô còn lại), _đua (DA6-12)_, `US-08-05` AC-1→AC-3, `US-08-05` AC-4 (DA6-08), _chồng lấn_, `FR-4.11`
  (vế confirm 422), _hiệu năng_.
- Verify: `pnpm exec jest src/modules/usage/vendor-import src/modules/notifications/inbox`;
  `pnpm test:integration -- test/integration/usage/vendor-import-confirm.integration-spec.ts`;
  `pnpm test:http -- test/http/usage/vendor-import.http-spec.ts`.

### Task 5: capability `identity/` (hàng đợi chưa khớp, ánh xạ + kết thúc ánh xạ, sai lệch `FR-4.8`)

- Files: `src/modules/usage/identity/identity.controller.ts`, `identity.dto.ts`, `identity.service.ts`, `identity.policy.ts` (+ spec), `identity.repo.ts`,
  `no-assignment-finding.repo.ts`, `identity.errors.ts`, `identity.http-errors.ts`; `vendor-import/confirmation/vendor-import-confirmation.service.ts`
  (ghi ánh xạ + phát hiện), `src/modules/licensing/public/licensing.api.ts` (`listAssignmentIntervals`), `src/modules/licensing/assignment/assignment.repo.ts`
  (truy vấn khoảng); test `test/integration/usage/usage-identity-queue.integration-spec.ts` (mới), `test/http/usage/usage-identity.http-spec.ts` (mới).
- Depends on: Task 4.
- Acceptance: test matrix `FR-4.6`/`INV-12`, `US-08-04` AC-1/AC-4, QT 5.2/AC-7, _sửa ánh xạ (DA6-11)_ (vế thao tác), `FR-4.8`, _chuỗi gia hạn_.
- Verify: `pnpm exec jest src/modules/usage/identity`;
  `pnpm test:integration -- test/integration/usage/usage-identity-queue.integration-spec.ts`;
  `pnpm test:http -- test/http/usage/usage-identity.http-spec.ts`.

### Task 6: `usage-evidence/` + facade `UsageEvidenceApi`; dashboard IT; README

- Files: `src/modules/usage/usage-evidence/usage-evidence.service.ts`, `usage-evidence.repo.ts` (nối ánh xạ còn hiệu lực lúc đọc), `usage-evidence.policy.ts`
  (+ spec: độ mới 7/14 theo loại nguồn, `canConcludeAbsence` theo năng lực, hợp nhất ngày dương, `appeared`, không trả khối lượng),
  `usage/public/usage-evidence.api.ts`, `usage/public/usage-evidence.types.ts`, `src/modules/devices/public/devices.api.ts` (`registrationHolders`),
  `src/modules/dashboards/it-admin/it-admin-dashboard.service.ts` (+ spec), `src/modules/usage/README.md`, `src/modules/organization/README.md`,
  `src/modules/licensing/README.md`; test `test/integration/usage/usage-evidence.integration-spec.ts` (mới), `test/http/dashboards/dashboards.http-spec.ts`.
- Depends on: Task 5.
- Acceptance: test matrix _độ mới (DA6-09)_, _năng lực (DA6-14)_, _sửa ánh xạ (DA6-11)_ (vế đọc), _bằng chứng dương_, _riêng tư_, _dashboard_, `L4-03` giữ.
- Verify: `pnpm exec jest src/modules/usage src/modules/dashboards/it-admin`;
  `pnpm test:integration -- test/integration/usage/usage-evidence.integration-spec.ts test/integration/usage/usage-intake.integration-spec.ts`;
  `pnpm test:http -- test/http/usage/usage-routes.http-spec.ts test/http/dashboards/dashboards.http-spec.ts`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; `openapi:export` diff chỉ ở 15 operation + `itAdminDashboardGet`; `pnpm arch:capabilities --module usage`
(`usage-evidence` L0, không vòng; `public/` ≤ 8 phụ thuộc); `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`;
tự review theo spec _Behavior_ 1–12. Commit `feat(qd103-w6): vendor-usage-import P2`.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).

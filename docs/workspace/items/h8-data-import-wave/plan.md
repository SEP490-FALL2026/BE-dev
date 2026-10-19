# Plan: Data Import Wave — capability `employee-import`, mapper HTTP và facade cho onboarding (H8.1 → H8.3)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `c760705`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: Owner (audit H4.0 mục 9.5; Prompt 21).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local 19/10/2026, cây làm việc chưa commit trên `c760705`). PR: chưa có.

## Before coding

Preflight 19/10/2026: `dev` = `origin/dev` = `c760705f61d6b9edb1311ec0194c9fb3dd6fbbd2`, ahead/behind `0/0`, cây sạch
(0 path); `c760705` là commit GOV.1/GATE.2 của Owner. `pnpm rules:test` 38/38; ba architecture spec + unit data-import và
onboarding 6 suite/220 test xanh. `openapi.json` SHA-256 `14fd428bf3ee…23d8`, 60 operation, 61 schema; inventory status/
security của từng operation lưu ngoài repo để so cuối lượt (sáu route import và `onboardingChecklistGet` chỉ `bearer`).

Inventory trước khi sửa (đọc trực tiếp source, không subagent):

- Route: sáu route `/employee-imports*` (`employeeImportUpload`, `Get`, `RowList`, `PreviewRefresh`, `Confirm`, `Cancel`),
  `IT_ADMIN`, giới hạn file 2 MiB, mỗi handler `try { … } catch { throw toImportApiException(error) }`.
- Transaction/khóa: upload (create + audit), refresh (lock `FOR UPDATE` → replacePreview), cancel (lock → markCancelled →
  audit), confirm (lock → trạng thái/hạn/version → file trùng trong `tx` → rows → lookup → `lockForEmployeeImport` →
  lookup lại → so judgement → tạo người → markCompleted → audit). Idempotency qua `confirmKey`; TTL preview 24 h; file
  trùng theo SHA-256 nội dung.
- `employee-import.service.ts` 545 dòng, 4 dependency: 7 method public + 9 helper/hàm module (bảng owner ở spec).
- `DataImportModule` export `EmployeeImportService`; consumer liên module duy nhất `OnboardingService.latestImport()`.
- Ledger H8: `httpMappingInErrorFiles` (employee-import.errors.ts), `oversizedFiles` (service, cap 545),
  `LEGACY_PRIVATE_MODULE_IMPORTS` (onboarding → service), `LEGACY_PRIVATE_EXPORTS` (`DataImportModule: EmployeeImportService`).
- Test import path phải dời: `csv.spec.ts`, `employee-import-rows.spec.ts` (unit cạnh source), `onboarding.service.spec.ts`;
  integration/e2e chỉ qua HTTP, không import đường dẫn data-import.

## Tasks

### Phase 0 — characterization trên baseline

### Task 1: ghim hành vi hiện hành trước mọi move/split

- Files: `employee-import.http-errors.spec.ts`, `employee-import.service.spec.ts` (tách theo use case ở Task 7,
  H8-RV-01),
  `employee-import-rows.validation-parity.spec.ts` (mới, ban đầu cạnh source phẳng);
  `test/integration/employee-imports-http.integration-spec.ts` (khối characterization),
  `test/integration/onboarding-http.integration-spec.ts`, `src/modules/onboarding/onboarding.service.spec.ts`.
- Depends on: none
- Acceptance: mapper (16 ca + key order, pass-through, 503, identity); giao thức từng use case với fake ở boundary (thứ tự
  lời gọi, `tx`, payload ghi, audit chính xác, mọi nhánh từ chối, so judgement theo thứ tự key/lý do); wire chính xác 6
  route + replay + envelope lỗi + Audit Trail + rollback stale trên PostgreSQL; onboarding ba trường và import bị hủy;
  BEH.1 9 ca giống + D-1 → D-4. Test dùng literal, không gọi lại mapper/helper production để tính kỳ vọng.
- Verify: chạy trên `c760705` chưa sửa source → xanh (Checkpoint 0).

### Checkpoint 0

Trên `c760705` (chỉ thêm test): unit data-import + onboarding + ba architecture spec 9 suite/292 test; e2e import +
onboarding 2 suite/28 test; integration import + onboarding 2 suite/45 test; `tsc`, ESLint xanh. Mới ở Phase 0: mapper
20, service 38, BEH.1 13, onboarding unit +1, integration +4 (và một ca onboarding được siết).

### Phase A — H8.1: mapper HTTP ra khỏi tệp lỗi

### Task 2: `employee-import.http-errors.ts`

- Files: `employee-import.errors.ts`, `employee-import.http-errors.ts` (mới), `employee-imports.controller.ts`,
  `employee-import.http-errors.spec.ts`, `src/architecture-structure.spec.ts`.
- Depends on: Task 1
- Acceptance: `toImportApiException`/`refuse` dời nguyên văn; tệp lỗi chỉ còn lớp/type nghiệp vụ; gỡ đúng mục
  `httpMappingInErrorFiles` (ledger rỗng, gate giữ). Không đăng ký mapper/lỗi làm contract liên module.
- Verify: mapper/service unit, e2e import, integration import, ba architecture spec xanh; mutation M-A1/M-A2 đỏ.

### Checkpoint A

Unit data-import + ba architecture spec 282 test, e2e import 22, integration import 38 xanh; `tsc`, ESLint xanh.
M-A1 (`HttpStatus` vào `employee-import.errors.ts`) và M-A2 (`ApiException` vào service) làm đỏ đúng gate, restore
byte-identical (hash kiểm bằng script).

### Phase B — H8.2: capability `employee-import/` và tách service

### Task 3: dời file vào capability

- Files: mọi file non-root của `data-import/` → `data-import/employee-import/`; `dto/employee-import.dto.ts` →
  `employee-import/employee-import.dto.ts`; `data-import.module.ts`; import path tạm của onboarding.
- Depends on: Task 2
- Acceptance: `mv` (không `git mv`), import path tính lại bằng script từ vị trí cũ; không re-export, barrel, `common`.
- Verify: `tsc`; unit data-import + onboarding 211 xanh ngay sau move.

### Task 4: tách `employee-import.service.ts`

- Files: `employee-import.service.ts`, `employee-import-file.ts`, `employee-import-audit.ts`, `employee-import.types.ts`
  (mới), `employee-import-rows.ts`, `employee-imports.controller.ts`, spec cạnh owner (`employee-import-file.spec.ts` mới,
  khối judgement trong `employee-import-rows.spec.ts`), `src/architecture-structure.spec.ts`.
- Depends on: Task 3
- Acceptance: owner theo bảng của spec; service 355 dòng, 4 dependency; mọi file non-spec dưới 400 dòng; lời gọi
  facade/repo, `tx` và thứ tự không đổi (characterization lời gọi xanh); gỡ mục `oversizedFiles` của service, không tăng
  cap.
- Verify: unit data-import + onboarding + structure spec, integration import/onboarding/organization-concurrency, e2e
  import xanh.

### Checkpoint B

Unit + structure 8 suite/271 test; integration import + onboarding + organization-concurrency 3 suite/58 test; e2e
import 22 xanh. Đường cũ zero-hit (trừ cạnh onboarding gỡ ở Phase C), mỗi method/helper cũ có owner mới (bảng spec).

### Phase C — H8.3: facade và core pagination

### Task 5: `DataImportService` cho onboarding, `Page<T>` core

- Files: `data-import.service.ts`, `data-import.types.ts`, `data-import.service.spec.ts` (mới), `data-import.module.ts`,
  `onboarding.service.ts`, `onboarding.service.spec.ts`, `src/module-graph.spec.ts`,
  `src/architecture-boundaries.spec.ts`, `src/architecture-structure.spec.ts`.
- Depends on: Task 4
- Acceptance: facade một method `latestEmployeeImport` → `{ id, status, errorRows } | null`; `DataImportModule` export
  facade, service capability và repo private; `PUBLIC_CONTRACT_EXPORTS` thêm `DataImportModule: DataImportService`,
  `LEGACY_PRIVATE_EXPORTS` và `LEGACY_PRIVATE_MODULE_IMPORTS` gỡ mục H8; registry thêm đúng một contract nội module (root
  facade → service capability); `rows` dùng `Page<T>`/`pageOf` core, wire `items` + `pagination` không đổi.
- Verify: unit + ba architecture spec; integration onboarding + import; e2e import + onboarding; mutation M-C1 → M-C3 đỏ.

### Checkpoint C

Unit + ba architecture spec 11 suite/310 test; integration onboarding + import 45; e2e 28 xanh. M-C1 (export lại
`EmployeeImportService`), M-C2 (onboarding import service private), M-C3 (facade import repo) làm đỏ đúng gate, restore
byte-identical.

### Phase D — consolidation

### Task 6: metadata và full gate trên cây cuối

- Files: `ARCHITECTURE.md`, `docs/rules/module-structure.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, spec/plan
  này, plan GOV.1 (pin `c760705`), tracker ngoài repo.
- Depends on: Task 5
- Acceptance: tài liệu khớp layout/graph thật; GOV.1/GATE.2 pin `c760705`; BEH.1 mở; full gate một lần trên cây cuối.
- Verify: các lệnh ở mục dưới.

### Phase E — correction H8-RV-01 (Prompt 21A, 19/10/2026)

### Task 7: gate unit spec module và tách spec 1.084 dòng theo use case

- Files: `src/architecture-structure.spec.ts`; `employee-import.service.spec.ts` (xóa) →
  `employee-import-upload.spec.ts`, `employee-import-preview-lifecycle.spec.ts`, `employee-import-confirm.spec.ts`;
  `test/support/employee-import-service-harness.ts` (mới); `test/README.md`, `docs/rules/module-structure.md`; spec/plan
  này; tracker ngoài repo.
- Depends on: Task 6
- Acceptance: gate `H8-RV-01` (unit spec dưới `src/modules/**` ≤ 400 dòng vật lý, cùng cách đếm gate source, báo
  đường dẫn + số dòng, không ledger/ngoại lệ/cap khác) đỏ trước khi tách và chỉ nêu đúng tệp 1.084 dòng; ba spec mới mỗi
  tệp ≤ 400 dòng, cùng 38 ca và tên ca; thân ca chép nguyên văn; harness có kiểu, chỉ dựng fake/đồng hồ/dữ liệu mẫu;
  product code, integration/e2e và `openapi.json` byte-identical.
- Verify: gate đỏ trước/xanh sau; mutation tạm đẩy một spec mới lên > 400 dòng phải đỏ đúng tệp/số dòng rồi khôi phục
  byte-identical; so tên ca trước/sau; `pnpm test:discovery`, `pnpm check`; so hash bảo toàn.

### Checkpoint E

Gate đỏ trên cây trước khi tách: đúng một mục `modules/data-import/employee-import/employee-import.service.spec.ts`, 1084
dòng. Sau tách: ba suite 38/38 (13 + 11 + 14), tên ca giống hệt bản trước; gate xanh; mutation 200 dòng vào
`employee-import-preview-lifecycle.spec.ts` (209 → 409) đỏ đúng tệp/409, khôi phục cùng SHA-256.

## Verification and handoff

Môi trường: Windows 11, Git Bash, Node v24.0.1, pnpm 11.1.3, Docker 29.1.2; PostgreSQL 17-alpine container riêng
`127.0.0.1:55438`, role `ci_integration` (LOGIN NOSUPERUSER CREATEDB …) theo test guide; cây làm việc chưa commit trên
`c760705`.

| Lệnh / kiểm tra AC                                                | Revision / môi trường                                            | Kết quả thực chạy                                                                                                                                                                                                                                                     | Giới hạn / việc còn lại                                                                                                                                                                                                        |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Checkpoint 0 → C                                                  | `c760705` (0) rồi cây làm việc (A → C)                           | xanh; số liệu ở từng checkpoint                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                              |
| `pnpm check`                                                      | cây cuối                                                         | exit 0: rules 106 tệp/925 link, `rules:test`, Prettier, Prisma validate/generate, ESLint, `tsc`, unit 72 suite/1083 test, `test:scripts`, discovery (unit 72, e2e 14, integration 46 tệp), build                                                                      | sau đó chỉ sửa hai chú thích trong `architecture-boundaries.spec.ts`, `module-graph.spec.ts` (chạy lại Prettier/ESLint và hai spec, 35/35) và bằng chứng ở spec/plan này (`rules:check` 106 tệp/924 link, `rules:format` sạch) |
| `pnpm test:e2e`                                                   | cây cuối                                                         | 14 suite/274 test                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                              |
| `pnpm test:integration`                                           | cây cuối, PostgreSQL 17 riêng `127.0.0.1:55438`                  | 46 suite/629 test, 442 s; 0 DB `slm_*_test` và 0 backend sót, không `42501`; container đã xóa                                                                                                                                                                         | —                                                                                                                                                                                                                              |
| `pnpm openapi:export`                                             | cây cuối                                                         | SHA-256 `14fd428bf3ee…23d8` = đầu lượt, `cmp` byte-identical; inventory operation/status/security/schema giống hệt (60/61); `openapi.json` không dirty                                                                                                                | —                                                                                                                                                                                                                              |
| `rules:check`, `rules:format`, `format:check`, `git diff --check` | cây cuối                                                         | 0 lỗi; Prettier sạch; diff-check exit 0; không tệp nào lẫn CRLF/LF                                                                                                                                                                                                    | —                                                                                                                                                                                                                              |
| Mutation M-A1 → M-C3                                              | script ghi/khôi phục ngoài repo, so SHA-256                      | năm mutation đều đỏ đúng gate, cả năm tệp khôi phục byte-identical                                                                                                                                                                                                    | lần chạy đầu của M-C2 không chèn được import (script mất ký tự `\` qua heredoc); viết lại script, chạy lại mọi mutation                                                                                                        |
| Quét zero-hit                                                     | cây cuối                                                         | không còn đường dẫn phẳng cũ, `HttpStatus`/`ApiException` ngoài controller và mapper, `Page<T>` riêng, `EmployeeImportService` ngoài `data-import`, mục ledger `data-import`; một khai báo provider mỗi token, một writer bảng import                                 | —                                                                                                                                                                                                                              |
| Diff                                                              | cây cuối so `c760705`                                            | tệp dời chỉ đổi import path; thân mapper giống từng dòng; classifier không đổi; roadmap chỉ đổi dòng GOV.1 + thêm dòng H8 (phần còn lại là Prettier canh cột)                                                                                                         | —                                                                                                                                                                                                                              |
| H8-RV-01: gate trước khi tách                                     | cây Prompt 21 + gate mới                                         | đỏ, đúng một mục `modules/data-import/employee-import/employee-import.service.spec.ts` 1084 dòng; hai ca synthetic của gate xanh                                                                                                                                      | spec module lớn kế tiếp `employee-import-rows.spec.ts` 391 dòng (dưới cap)                                                                                                                                                     |
| H8-RV-01: tách spec                                               | cây sau 21A                                                      | spec cũ 1 suite/38 ca → `employee-import-upload` 318 dòng/13, `employee-import-preview-lifecycle` 209/11, `employee-import-confirm` 305/14; harness `test/support/employee-import-service-harness.ts` 322 dòng; 38 tên ca giống hệt; thân ca so từng dòng với dải gốc | —                                                                                                                                                                                                                              |
| H8-RV-01: mutation > 400                                          | `employee-import-preview-lifecycle.spec.ts` + 200 dòng chú thích | gate đỏ đúng tệp, `lines: 409`; khôi phục từ bản sao, SHA-256 `2cd5c7a190cd…` trước = sau                                                                                                                                                                             | lần thử qua script không áp được (Git Bash đổi tham số bắt đầu bằng `//`); làm lại bằng `node` ghi trực tiếp                                                                                                                   |
| Prompt 21A: unit + gate                                           | cây sau 21A                                                      | data-import + onboarding 10 suite/229; ba architecture spec 84; `pnpm test:discovery` unit 74/e2e 14/integration 46, mỗi spec mới đúng một lần                                                                                                                        | —                                                                                                                                                                                                                              |
| Prompt 21A: `pnpm check`                                          | cây sau 21A                                                      | exit 0: unit 74 suite/1086 test (+3 ca gate), rules 106 tệp/928 link, build                                                                                                                                                                                           | —                                                                                                                                                                                                                              |
| Prompt 21A: bảo toàn                                              | so hash lấy đầu 21A                                              | 89 tệp product data-import/onboarding, mọi `test/integration`, `test/e2e`, `test/support` có sẵn và `openapi.json` byte-identical                                                                                                                                     | e2e/integration không chạy lại: không tệp nào của chúng đổi; giữ bằng chứng Prompt 21                                                                                                                                          |

- [x] Hành vi trong scope có bằng chứng (characterization cũ/mới, mutation, OpenAPI).
- [x] Spec/plan/test design phản ánh implementation cuối.
- [x] Diff cuối đã tự review; không tài liệu vận hành nào bị ảnh hưởng.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật (chưa commit, chưa push, chưa remote CI, chưa Owner review).

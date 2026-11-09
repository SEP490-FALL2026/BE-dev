# Spec: Data Import Wave — capability `employee-import`, mapper HTTP và facade cho onboarding (H8.1 → H8.3)

- Phụ trách: AI theo giao việc Owner (Prompt 21, 19/10/2026).
- Thiết kế ban đầu bởi: Owner — mục 9.5 của [audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md)
  (H8.1 → H8.3; finding F-24, F-26, A4-10, A4-12) và Prompt 21.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (chỉ để xác minh hành vi phải giữ của `US-02-01` → `US-02-04`; không Story/AC mới), BE
  `c760705` (`dev` = `origin/dev`, commit GOV.1/GATE.2 của Owner). Không ADR mới.
- Nhóm roadmap: H8 của bó remediation sau audit H4.0 — chỉ là container, không phải ranh giới (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, người sửa import nhân sự tìm thấy toàn bộ phần của nó trong một capability `data-import/employee-import/`
(route, use case, persistence, đọc file, quy tắc dòng, audit, lỗi và mapper HTTP), service điều phối dưới 400 dòng, và
module khác chỉ đọc import qua facade `DataImportService`. Hành vi quan sát được — route, wire, mã lỗi, Audit Trail,
transaction, khóa, idempotency, OpenAPI — không đổi: characterization ghim trên code cũ vẫn xanh trên cây mới.

## Sizing decision

- Container: H8.1 → H8.3, F-24/F-26/A4-10/A4-12
- Mode: `technical-enabler`
- Outcome and owner: capability `data-import/employee-import` có ownership/layout rõ, facade tối thiểu cho onboarding;
  owner là module `data-import`.
- Boundaries: không đổi transaction (bốn `TransactionRunner.run` của upload, refresh, cancel, confirm giữ thứ tự khóa và
  lời gọi), bảng (`employee_imports`, `employee_import_rows`; một writer `EmployeeImportRepo`), migration, sáu route
  `/employee-imports*` và `GET /onboarding-checklist`, OpenAPI, sự kiện hay quyền (`IT_ADMIN`).
- Not larger: loại `BEH.1/A4-11` (hợp nhất validator dòng là thay đổi hành vi — mã, field, thứ tự lý do, preview đã
  lưu), mọi feature import mới (loại file thứ hai, queue/storage, import nền), migration, H6/H7, ROOT.1, hardening và mọi
  G3–G10.
- Not smaller: ba phase cùng một capability và một đồ thị thay đổi chung — Phase A tách mapper trước để Phase B không
  phải đổi đường dẫn ledger tạm; Phase B dời mọi file và import path vào `employee-import/`, nên test, provider và cạnh
  onboarding đều đổi đường dẫn; Phase C đổi export của `DataImportModule`, consumer onboarding và `Page<T>` trên chính các
  file Phase B vừa dời. Tách thành nhiều commit sẽ để lại một cạnh private onboarding → service ở đường dẫn mới hoặc một
  mục ledger không còn đúng, tức ledger giả chỉ để build xanh.
- Siblings: [`beh1-employee-row-validation-ownership`](../beh1-employee-row-validation-ownership/spec.md) — hạng mục cho A4-11 (Prompt 25, technical enabler): dùng chung đúng
  quyết định điều kiện phòng/chức vụ, giữ nguyên D-1 → D-4.
- Scope map: n/a — technical enabler ngoài nhóm G; không có Story/AC.

## Primary Story/AC

| Story | AC                                | Coverage | Phần còn lại thuộc                                                                                                     |
| ----- | --------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| —     | H8.1 (F-24 phần `data-import`)    | n/a      | gỡ chặn loại import thứ hai và `beh1-employee-row-validation-ownership`                                                |
| —     | H8.2 (oversized ledger, A4-12)    | n/a      | gỡ chặn `beh1-employee-row-validation-ownership`: classifier, re-judge và so judgement có owner duy nhất ở rows module |
| —     | H8.3 (A4-10, F-26 phần `Page<T>`) | n/a      | gỡ chặn mọi consumer liên module sau của import: chỉ qua facade `DataImportService` (chưa có hạng mục đặt tên)         |

## Supporting references

- `US-02-01` (import sáu bước), `US-02-02`, `US-02-03`, `US-02-04` AC-6 (Docs `9416fe0`): chỉ để xác minh hành vi giữ
  nguyên; lát này không hiện thực hay đổi AC nào. Hành vi gốc ở
  [g2-employee-import-preview-confirm](../g2-employee-import-preview-confirm/spec.md) và
  [g2-onboarding-checklist](../g2-onboarding-checklist/spec.md).
- [Audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md) mục 4 (A4-11, A4-12), 5, 7, 9.5
  và [reconciliation](../../../reviews/be-full-src-architecture-audit-2026-10-19/reconciliation.md) (F-24, F-26).
- [Module structure](../../../rules/module-structure.md), [work-item sizing](../../../rules/work-item-sizing.md),
  [GOV.1/GATE.2](../gov1-gate2-story-sizing-and-capability-contracts/spec.md) (registry `INTRA_MODULE_CONTRACTS`).
- Tracker điều phối ngoài repo: `Prompts/BE-audit-and-architecture-2026-10-18/BE-WORKSTREAM-TRACKER.md`.

## Explicit out of scope

- **BEH.1/A4-11:** dùng chung lý do dòng giữa form nhập tay (`organization/employee/employee-row.policy.ts`) và
  preview import. Lát này chỉ characterization hai đường (bảng D-1 → D-4 dưới) và giữ nguyên cả hai; không import
  validator private của `organization`, không đưa validator nghiệp vụ vào `core`, không tạo facade giả. Finding khép ở
  [`beh1-employee-row-validation-ownership`](../beh1-employee-row-validation-ownership/spec.md) (Prompt 25).
- Bất kỳ đổi route, `operationId`, request/response, status/code/message/details, row outcome/reason/difference, giá trị
  DB, schema/migration, transaction/lock/idempotency/audit.
- H6/H7, ROOT.1, `CP0-09`/`CP0-10`, AUTH.1/AUTH.2/INF.1, G3–G10, nâng dependency, CI/deploy, refactor module khác.
- Sửa hàng loạt spec lịch sử (`g2-employee-import-preview-confirm`, `g2-onboarding-checklist` là `legacy`).

## Dependencies and blockers

- Đầu vào: GOV.1/GATE.2 ở `c760705` (`dev` = `origin/dev`, ahead/behind `0/0`, cây sạch); H4.3a đã đưa
  `normalizeDisplayName` vào `core` (`e053664`), nên rows module không còn cạnh private sang `organization`.
- Integration cần PostgreSQL cô lập theo [test guide](../../../../test/README.md). Không blocker.

## Ownership: module, data, API

- Module `data-import` (bounded context không đổi). Bảng `employee_imports`, `employee_import_rows`: một writer
  `EmployeeImportRepo`; SQL, `select`, `orderBy`, `FOR UPDATE`, isolation của `page` giữ nguyên — repo chỉ dời file.
- Đọc qua facade `OrganizationService`: `getOrganization`, `lookupForEmployeeImport`, `lockForEmployeeImport`,
  `businessToday`, `createEmployeeWithPlacement`, `departmentsWithoutHead` — cùng lời gọi, cùng thứ tự, cùng `tx`.
- Operation HTTP: không thêm/đổi. Không cần Nest submodule cho `employee-import/`: không điều kiện nào của
  [rule](../../../rules/module-structure.md#layout-trong-một-module) áp — một entry (API), không vòng đời
  hay provider riêng, contract liên module là facade ở root.
- **Contract mới (đã review như `PUBLIC_CONTRACT_EXPORTS`):** `DataImportModule: DataImportService` (export liên module,
  thay `EmployeeImportService` khỏi `LEGACY_PRIVATE_EXPORTS`); một mục `INTRA_MODULE_CONTRACTS`
  `modules/data-import/employee-import/employee-import.service.ts` — root facade đọc import mới nhất qua service capability
  (đúng mẫu `organization.service.ts` → capability service). Repo và mọi file khác của capability giữ private.

### Layout trước → sau

| Trước (`c760705`, phẳng)                                       | Sau                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `data-import.module.ts` export `EmployeeImportService`         | root `data-import.module.ts` export `DataImportService`                                           |
| —                                                              | root `data-import.service.ts` (facade, 1 method), `data-import.types.ts` (`LatestEmployeeImport`) |
| `employee-imports.controller.ts`                               | `employee-import/employee-imports.controller.ts`                                                  |
| `employee-import.service.ts` 545 dòng (ledger cap 545)         | `employee-import/employee-import.service.ts` 355 dòng, 4 dependency                               |
| `employee-import.errors.ts` (lỗi + mapper HTTP, ledger)        | `employee-import/employee-import.errors.ts` (chỉ lỗi) + `employee-import.http-errors.ts`          |
| `employee-import.repo.ts`, `employee-import-rows.ts`, `csv.ts` | cùng tên trong `employee-import/`; rows module nhận phần judgement                                |
| `dto/employee-import.dto.ts` (folder một file)                 | `employee-import/employee-import.dto.ts` (phẳng)                                                  |
| —                                                              | `employee-import/employee-import-file.ts`, `employee-import-audit.ts`, `employee-import.types.ts` |

Root 3 file non-spec (trước 7 và folder `dto/`), 0 controller (trước 1); capability 11 file non-spec, mọi file dưới
400 dòng.

### Method/helper cũ → owner mới

| Cũ (`employee-import.service.ts`)                                                                   | Owner mới                                                                                                                                              |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `latestImport`, `upload`, `view`, `rows`, `refresh`, `cancel`, `confirm`                            | `EmployeeImportService` (cùng chữ ký; `rows` trả `Page<T>` core qua `pageOf`)                                                                          |
| khối trong `confirm`: lock phụ thuộc → re-judge → stale                                             | `EmployeeImportService.judgeAgainUnderLocks` (private, cùng thứ tự lời gọi)                                                                            |
| khối trong `confirm`: tạo người, đếm theo phòng, map lỗi trùng                                      | `EmployeeImportService.writeValidRows` (private)                                                                                                       |
| `lookup`, `evaluate`, `summarize`, `withoutHead`, `toView`, `requireOrganization`                   | `EmployeeImportService` (private, giữ nguyên)                                                                                                          |
| `readFile`, `MAX_DATA_ROWS`, kiểm rỗng/NUL của `upload`                                             | `employee-import-file.ts` `readEmployeeFile` (hàm thuần)                                                                                               |
| `toLookup`; phần tính tên của `lookup`; `judge`; `idsUsedByValidRows`; `canonical`; `sameJudgement` | `employee-import-rows.ts` `toEmployeeImportLookup`, `lookupNamesOf`, `judgeEmployeeRows`, `idsUsedByValidRows`, `canonical` (private), `sameJudgement` |
| `safeNormalize` (bản trùng)                                                                         | gỡ; rows module giữ bản duy nhất                                                                                                                       |
| ba khối `audit.record` (upload, cancel, confirm)                                                    | `employee-import-audit.ts` `importUploadedEvent`, `importCancelledEvent`, `importConfirmedEvent`                                                       |
| `ImportSummary`, `ImportResult`, `ImportView`                                                       | `employee-import.types.ts`                                                                                                                             |
| `Page<T>` riêng                                                                                     | gỡ; `src/core/application/pagination.ts`                                                                                                               |
| `PREVIEW_TTL_MS`                                                                                    | giữ trong service                                                                                                                                      |

## Behavior and design

- **Mapper (H8.1):** `toImportApiException` và `refuse` dời nguyên văn sang `employee-import.http-errors.ts`; controller gọi
  mapper, service/repo/row/file không biết HTTP. Chín lớp lỗi giữ nguyên tên, message, field. Pass-through `ApiException`,
  503 qua `toUnavailableApiException`, lỗi lạ trả nguyên identity.
- **Transaction và khóa:** upload ghi import + rows + audit trong một transaction; refresh khóa `FOR UPDATE` rồi thay
  preview, không audit; cancel khóa, `markCancelled`, audit (lần hai không ghi gì); confirm khóa import → kiểm trạng thái,
  hạn, version, file trùng (trong `tx`) → đọc rows → lookup → khóa phòng/chức vụ của dòng hợp lệ → lookup lại → so
  judgement → `businessToday` → tạo từng người → `departmentsWithoutHead` → `markCompleted` → audit. Thứ tự này được ghim
  bằng characterization lời gọi (test matrix), không suy luận.
- **Facade (H8.3):** `latestEmployeeImport()` trả `{ id, status: 'PREVIEW' | 'COMPLETED', errorRows }` hoặc `null`. Repo
  vốn loại `CANCELLED` (`status: { not: 'CANCELLED' }`), nên bộ lọc `CANCELLED` của onboarding là nhánh không đạt tới;
  facade mang bảo đảm đó trong type và trả `null` nếu gặp. Wire checklist giữ nguyên ba trường.
- **Không áp dụng:** migration, job, storage, quyền mới, đổi API.

### BEH.1 — characterization hai đường kiểm dòng (A4-11)

Cùng fixture phòng/chức vụ/mã/email chạy qua `validateEmployeeRow` (nhập tay) và `EmployeeRowClassifier` (import) —
[spec characterization](../../../../src/modules/data-import/employee-import/row-validation/employee-import-row-validation-parity.policy.spec.ts):

| Mã  | Điểm                              | Nhập tay                                             | Import                                                                                                                                      |
| --- | --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| —   | lý do phòng/chức vụ, mã và thứ tự | `DEPARTMENT_*` rồi `JOB_TITLE_*`                     | **giống** (9 ca)                                                                                                                            |
| D-1 | nơi của lý do                     | `{ field: 'departmentCode' \| 'jobTitleId' … }`      | `{ column: 'department_code' \| 'job_title' … }`                                                                                            |
| D-2 | mã nhân viên đã có                | lý do `EMPLOYEE_CODE_TAKEN` (vẫn kiểm phòng/chức vụ) | không lỗi: `EXISTS_SAME`/`EXISTS_DIFFERENT`, không kiểm phòng/chức vụ                                                                       |
| D-3 | email đã có người dùng            | `WORK_EMAIL_TAKEN` sau phòng/chức vụ                 | `WORK_EMAIL_TAKEN` trước phòng/chức vụ                                                                                                      |
| D-4 | lý do riêng                       | —                                                    | `EMPLOYEE_CODE_REQUIRED`, `*_DUPLICATE_IN_FILE`, `FULL_NAME_REQUIRED`, `WORK_EMAIL_INVALID`, `EMPLOYMENT_TYPE_INVALID`, `HIRE_DATE_INVALID` |

Hai đường **không** tương đương; lát này giữ cả hai byte/deep-equal với baseline. BEH.1 quyết align hay chấp nhận khác.

**Kết quả BEH.1 (Prompt 25, [`beh1-employee-row-validation-ownership`](../beh1-employee-row-validation-ownership/spec.md)):** chấp nhận D-1 → D-4 (Docs không đòi giống nhau);
dòng "giống" (lý do phòng/chức vụ, mã, thứ tự) nay do một policy `organization/public/employee-placement.policy.ts` quyết,
hai đường là adapter. 13 ca của spec characterization giữ nguyên văn.

## Test matrix

| AC / rủi ro                          | Tình huống (gồm từ chối, edge case)                                                                               | Cấp test                                                                                                                                        | Kết quả mong đợi                              | Bằng chứng sau implement                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| H8.1 mapper                          | 16 ca lỗi × status/code/message/details, thứ tự key, pass-through, 503, identity lỗi lạ                           | unit `employee-import.http-errors.spec.ts`                                                                                                      | xanh trên `c760705` và cây mới                | 20/20 trên `c760705` và cây cuối                                                  |
| H8.1 HTTP trong tệp lỗi/service      | mutation đưa `HttpStatus` vào errors, `ApiException` vào service                                                  | `architecture-structure.spec.ts`                                                                                                                | đỏ, restore byte-identical                    | M-A1, M-A2 đỏ                                                                     |
| giao thức use case                   | thứ tự lời gọi, `tx`, payload ghi, audit chính xác, mọi nhánh từ chối của upload/view/rows/refresh/cancel/confirm | unit `employee-import-{upload,preview-lifecycle,confirm}.spec.ts` + harness `test/support/employee-import-service-harness.ts` (fake ở boundary) | xanh trên `c760705` và cây mới                | 38/38 trên `c760705` (một tệp) và cây cuối (13 + 11 + 14, cùng tên ca — H8-RV-01) |
| H8-RV-01 unit spec module ≤ 400 dòng | gate mới trước khi tách; tệp mới vượt 400 dòng                                                                    | `architecture-structure.spec.ts`                                                                                                                | đỏ đúng tệp/số dòng; xanh sau khi tách        | đỏ: `employee-import.service.spec.ts` 1084; mutation 409 dòng đỏ; xanh cây cuối   |
| wire + Audit Trail                   | body chính xác 6 route + replay, thứ tự key, envelope lỗi, audit đúng cột, không lộ ô/tên/email, rollback stale   | integration `employee-imports-http`                                                                                                             | xanh trên PostgreSQL thật, cũ và mới          | suite 38/38 trên `c760705` và cây cuối                                            |
| đọc file thuần                       | alias, BOM, `;`, dòng trống, cột thiếu, 1000/1001 dòng, từng lỗi cả tệp                                           | unit `employee-import-file.spec.ts`                                                                                                             | xanh                                          | 10/10 (Phase B; cùng hành vi đã ghim ở service spec)                              |
| judgement                            | tên lookup duy nhất, khóa chỉ dòng hợp lệ, so judgement bỏ qua thứ tự key nhưng giữ thứ tự lý do                  | unit `employee-import-rows.spec.ts`                                                                                                             | xanh                                          | +4 ca (116 → 120)                                                                 |
| onboarding contract                  | ba trường, `null` khi chưa có; import bị hủy không hiện                                                           | unit onboarding + facade, integration onboarding                                                                                                | xanh                                          | unit onboarding 10, facade 4; integration onboarding 7                            |
| facade/private edge                  | mutation export lại `EmployeeImportService`; onboarding import service private; facade import repo                | `module-graph`, `architecture-boundaries/structure`                                                                                             | đỏ, restore byte-identical                    | M-C1, M-C2, M-C3 đỏ                                                               |
| BEH.1 characterization               | 9 ca giống, D-1 → D-4 khác                                                                                        | unit `employee-import-rows.validation-parity.spec.ts`                                                                                           | xanh trên cả hai cây, không ép bằng nhau      | 13/13 trên `c760705` và cây cuối                                                  |
| OpenAPI                              | export lại                                                                                                        | `pnpm openapi:export`                                                                                                                           | byte-identical `14fd428b…`, 60 op / 61 schema | byte-identical, inventory giống hệt — [plan](plan.md#verification-and-handoff)    |

## Definition of Done

- [x] Không AC nghiệp vụ; characterization xanh trên `c760705` trước mọi move/split và xanh trên cây cuối.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; e2e + integration + OpenAPI
      byte-identical (kết quả ở plan).
- [x] Spec/plan/roadmap/items index, `ARCHITECTURE.md` và rule module structure phản ánh layout cuối; không đổi contract
      nên không cần báo FE.
- [x] Ledger chỉ co: gỡ `httpMappingInErrorFiles` (1), `oversizedFiles` (1), `LEGACY_PRIVATE_MODULE_IMPORTS` (1),
      `LEGACY_PRIVATE_EXPORTS` (1); không thêm mục ledger, cap hay wildcard.
- [x] Không runbook nào bị ảnh hưởng; giới hạn chưa kiểm chứng ghi ở plan.

## Changes and acceptance

19/10/2026 — lập và thực hiện theo Prompt 21 trên `c760705`. Registry `INTRA_MODULE_CONTRACTS` thêm một mục (contract
có chủ đích, không phải ledger) vì facade ở root đọc service capability; ngoài ra không thay đổi thiết kế so với audit
mục 9.5. Owner review chưa có; chưa nghiệm thu.

19/10/2026 — correction **H8-RV-01** (Prompt 21A, review trước commit, không phải hạng mục mới): unit spec
`employee-import.service.spec.ts` 1.084 dòng gom mọi use case sau một harness lớn, và gate kích thước bỏ qua mọi
`*.spec.ts`. Xử lý: gate mới `H8-RV-01` trong `architecture-structure.spec.ts` (unit spec dưới `src/modules/**` tối đa 400
dòng vật lý, không ledger/ngoại lệ) — đỏ trước khi tách, chỉ đúng tệp đó; tách theo use case thành
`employee-import-upload.spec.ts` (318 dòng, 13 ca), `employee-import-preview-lifecycle.spec.ts` (209 dòng, 11 ca — view,
rows, refresh, cancel, latest import) và `employee-import-confirm.spec.ts` (305 dòng, 14 ca), harness có kiểu
`test/support/employee-import-service-harness.ts` (322 dòng; chỉ dựng fake, đồng hồ, dữ liệu mẫu). Thân 38 ca chép nguyên
văn theo dải dòng, cùng 38 tên ca. Quy tắc và ví dụ ở [test guide](../../../../test/README.md#quy-tắc-chung)
và [module structure](../../../rules/module-structure.md). Product code, integration/e2e và `openapi.json` byte-identical.

20/10/2026 — A4-11 khép bởi [`beh1-employee-row-validation-ownership`](../beh1-employee-row-validation-ownership/spec.md) (Prompt 25): bảng D-1 → D-4 và spec
characterization không đổi; chỉ quyết định điều kiện phòng/chức vụ chuyển vào policy dùng chung.

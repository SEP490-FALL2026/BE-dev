# Spec: H4.3a — đưa chuẩn hóa display name vào `core`

- Phụ trách: AI theo giao việc Owner (Prompt 14, 19/10/2026).
- Thiết kế ban đầu bởi: Owner qua quyết định kỹ thuật `Q6` của
  [audit nền tảng](../../../reviews/be-foundation-audit-2026-10-18/README.md) và
  [audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md), mục 9.2 (lát H4.3a); thứ tự
  H4.3a trước H4.2 theo GATE.1 (`5b75930`).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (không có Story/AC mới; nghiệp vụ hiện hành giữ nguyên), BE `c4a8d5c` (`dev`, H4.1, cha
  `8fca0a4`).
- Nhóm roadmap: enabler refactor của `organization` trước G3 — chỉ là planning container.
- [Kế hoạch](plan.md).

## Business outcome

Không đổi hành vi người dùng: tên chức vụ, phòng, dự án, Cost Center và ô của file nhân sự vẫn được chuẩn hóa ra đúng
từng byte như trước (T-12), so khớp chức vụ vẫn bỏ qua hoa/thường và khoảng trắng nhưng giữ dấu (`US-02-07` AC-2), giới
hạn 100 ký tự vẫn đếm theo code point. Primitive thuần `normalizeDisplayName` nằm ở `src/core` (Q6); `data-import` không
còn import file private `organization/job-title-name.ts`, nên đúng hai mục legacy ledger biến mất. Kiểm bằng một bảng
characterization dùng chung chạy trên code cũ rồi code mới, so sánh byte toàn bộ code point, ba architecture gate và
`openapi.json` byte-identical.

## Primary Story/AC

| Story | AC                          | Coverage | Phần còn lại thuộc |
| ----- | --------------------------- | -------- | ------------------ |
| —     | F-23 (một phần), A4-02 (2×) | n/a      | H4.2 → H4.7, H8.3  |

## Supporting references

- Audit nền tảng: `Q6` (đưa primitive `normalizeDisplayName` vào `core`), mục 4.4.
- Audit H4.0: mục 3 (`core`), 7 (gate `A4-02`), 9.2 (lát H4.3a), 12;
  [reconciliation](../../../reviews/be-full-src-architecture-audit-2026-10-19/reconciliation.md) (H8 phụ thuộc H4.3a).
- [Module structure](../../../rules/module-structure.md): tầng `core`, allowlist liên module, ledger chỉ co lại.
- [H4.1](../h4-1-organization-root-cleanup/spec.md) — baseline `c4a8d5c`.
- T-12 và `US-02-07` AC-2 qua [g2-job-title-catalogue-and-manual-employee](../g2-job-title-catalogue-and-manual-employee/spec.md);
  `US-02-02`, `US-02-07` AC-7 (vế import) qua [g2-employee-import-preview-confirm](../g2-employee-import-preview-confirm/spec.md).
  Chỉ để truy vết hành vi phải giữ; không có AC mới.

## Explicit out of scope

- H4.2 (`project/`), H4.3b (`job-title/` và `job-title.repo.ts`), H4.4 → H4.7; move controller/service/repo/DTO/error,
  capability folder hay Nest submodule.
- Gom các đoạn chuẩn hóa khác có sẵn ngoài helper này (`non-working-dates.service.ts:115`, `project.service.ts:133`,
  `department.service.ts:72`): field khác, thuật toán khác (`trim()`/`\s+`), không phải consumer của helper.
- Hạ cap oversized của `employee-import.service.ts` (545) dù file còn 544 dòng — ledger khác giữ nguyên trạng.
- Shared `Page<T>`, H5/H6/H7/H8, ROOT.1, hardening, G3–G10; Docs nghiệp vụ, FE/Mobile, migration, package/config, ADR.

## Dependencies and blockers

H4.1 (`c4a8d5c`) trên `dev`. Không blocker. H4.2 chạy sau khi Owner commit lát này, để `ProjectService` chuyển vào
`project/` mà không tạo private import tới helper của root.

## Ownership: module, data, API

- `src/core/display-name.ts`: TypeScript thuần, không import gì; chỉ `normalizeDisplayName(raw): string` (display form).
  Không mang khái niệm Job Title hay giới hạn độ dài.
- `organization/job-title-name.ts` giữ **policy Job Title**: `JOB_TITLE_NAME_MAX_LENGTH`, `normalizeJobTitleName`,
  `isJobTitleNameTooLong`; bỏ `displayJobTitleName` (không còn consumer). `cost-center-name.ts` giữ alias
  `displayCostCenterName` (từ vựng Cost Center của `cost-center.service.ts`) nay trỏ thẳng primitive core.
- `data-import/employee-import-rows.ts` sở hữu cách đọc ô: export `clean` (display form của ô) và `jobTitleKey`
  (display form viết thường — cùng quy tắc với `normalized_name` của danh mục) cho chính nó và
  `employee-import.service.ts`. Không nhân bản regex/thuật toán: cả hai gọi primitive core.
- Không bảng, migration, DTO, route hay operation HTTP nào thêm/đổi. Bề mặt công khai của `organization` không mở rộng;
  không thêm allowlist hay ledger.

## Behavior and design

| API                           | Trước (`c4a8d5c`)                                                   | Sau                                                                           |
| ----------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Display form                  | `displayJobTitleName` ở `organization/job-title-name.ts`            | `normalizeDisplayName` ở `src/core/display-name.ts` — cùng regex/thứ tự       |
| So khớp Job Title             | `normalizeJobTitleName = displayJobTitleName(raw).toLowerCase()`    | `normalizeDisplayName(raw).toLowerCase()`, cùng file organization             |
| Quá dài                       | `[...displayJobTitleName(raw)].length > 100`                        | `[...normalizeDisplayName(raw)].length > 100`, cùng file organization         |
| Ô file nhân sự (`clean`)      | hai bản `const clean` giống hệt ở rows và service, gọi organization | một bản export ở rows, gọi core                                               |
| Khóa tra Job Title khi import | `normalizeJobTitleName` import từ organization                      | `jobTitleKey` cục bộ data-import = `normalizeDisplayName(text).toLowerCase()` |

Semantics giữ nguyên: NFC → xóa whitespace hai đầu → gom mỗi run whitespace thành một dấu cách; tập whitespace là đúng 25
ký tự của `\s` trong JavaScript (cùng tập với migration `20261016130000_job_title_lifecycle`), giữ case; so khớp thêm
`.toLowerCase()` không phụ thuộc locale; độ dài đếm code point sau chuẩn hóa. Thứ tự gọi ở mọi call site giữ nguyên
(service vẫn `jobTitleKey(clean(cell))`).

**Consumer trước → sau** (inventory preflight trên `c4a8d5c`):

| Consumer                                                                  | Cần                      | Trước                                          | Sau                                                                                       |
| ------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `organization/project.service.ts:124`                                     | display                  | `displayJobTitleName`                          | core `normalizeDisplayName`                                                               |
| `organization/department.service.ts:101,499`                              | display                  | `displayJobTitleName`                          | core `normalizeDisplayName`                                                               |
| `organization/cost-center-name.ts:38` (→ `cost-center.service.ts:53,204`) | display                  | alias của `displayJobTitleName`                | alias của core `normalizeDisplayName`                                                     |
| `organization/organization.repo.ts:78,87,119-120`                         | display + so khớp        | `displayJobTitleName`, `normalizeJobTitleName` | core + `normalizeJobTitleName` (organization)                                             |
| `organization/job-title.service.ts:42,96,162-163,185`                     | display, so khớp, độ dài | ba hàm organization                            | core + `normalizeJobTitleName`, `isJobTitleNameTooLong`                                   |
| `data-import/employee-import-rows.ts:121,190,241`                         | display + so khớp        | organization (ledger)                          | core qua `clean`, `jobTitleKey` cục bộ                                                    |
| `data-import/employee-import.service.ts:82,422,453`                       | display + so khớp        | organization (ledger)                          | `clean`, `jobTitleKey` từ `employee-import-rows.ts`                                       |
| `test/integration/job-title-lifecycle-migration.integration-spec.ts:84`   | so khớp                  | `normalizeJobTitleName`                        | giữ nguyên — policy Job Title thuộc organization, đúng ownership; test không bị gate quét |

**Vì sao `clean` dùng chung:** `employee-import.service.ts` đang ở đúng cap oversized 545 dòng (H8). Viết so khớp inline
ở dòng 422 vượt 120 ký tự và bị Prettier ngắt thêm dòng; thêm helper hay import thứ hai cũng +1 dòng. Bỏ bản `clean` trùng
và import cả `clean`, `jobTitleKey` từ `employee-import-rows.ts` (file anh em đã được service import) giữ file ở 544 dòng
mà không nới cap.

**Ledger gỡ** (`LEGACY_PRIVATE_MODULE_IMPORTS`):
`modules/data-import/employee-import-rows.ts -> modules/organization/job-title-name.ts` và
`modules/data-import/employee-import.service.ts -> modules/organization/job-title-name.ts`.

## Test matrix

| AC / rủi ro             | Tình huống                                                                                                                                                                                          | Cấp test                  | Kết quả mong đợi                                | Bằng chứng sau implement |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------- | ------------------------ |
| T-12 display            | bảng dùng chung `test/support/display-name-cases.ts`: rỗng, chỉ whitespace, từng ký tự trong 25 ký tự, run lẫn, U+200B/U+180E giữ, NFC, case, U+0130, dấu sau space bị cắt, ngoài BMP, biên 100/101 | unit (characterization)   | display như cũ, trên code cũ rồi core           | [plan](plan.md)          |
| `US-02-07` AC-2 so khớp | cùng bảng: chữ thường không phụ thuộc locale, giữ dấu, không sửa typo                                                                                                                               | unit                      | comparison như cũ ở organization và data-import | [plan](plan.md)          |
| Độ dài                  | cùng bảng: code point sau chuẩn hóa                                                                                                                                                                 | unit                      | `characters > 100`                              | [plan](plan.md)          |
| Import tra chức vụ      | Unicode space + dấu tách rời ⟹ tìm thấy; không dấu ⟹ `JOB_TITLE_NOT_FOUND`                                                                                                                          | unit classifier           | như cũ                                          | [plan](plan.md)          |
| Byte-equivalence        | mọi code point (một mình và giữa chữ) + 300 000 chuỗi ngẫu nhiên, sáu phép chiếu cũ ↔ mới                                                                                                           | script ngoài repo         | 0 lệch                                          | [plan](plan.md)          |
| Ledger                  | đúng hai cạnh biến mất; thêm lại cạnh ⟹ gate đỏ                                                                                                                                                     | unit (architecture gates) | xanh; mutation tạm đỏ rồi khôi phục byte        | [plan](plan.md)          |
| DB / contract           | job title lifecycle/migration, job-titles HTTP, import nhân sự; toàn bộ route                                                                                                                       | integration, e2e, export  | xanh; `openapi.json` byte-identical             | [plan](plan.md)          |

## Definition of Done

- [x] Hạng mục refactor không có primary AC; characterization xanh trên code cũ và vẫn xanh sau sửa.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên cây cuối; e2e + OpenAPI vì chạm service HTTP.
- [x] Spec/plan/roadmap phản ánh implementation cuối; không đổi contract nên không có thông báo FE.
- [x] Legacy ledger chỉ co lại: gỡ đúng hai mục H4.3a.
- [x] Phần chưa kiểm chứng ghi rõ ở plan.

## Changes and acceptance

- 19/10/2026: tạo hạng mục, thiết kế `ready`; implement và `verified` local (bằng chứng ở [plan](plan.md)). Chưa commit,
  chưa Owner review, chưa nghiệm thu.

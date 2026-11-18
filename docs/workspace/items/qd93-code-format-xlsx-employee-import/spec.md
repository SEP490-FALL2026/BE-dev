# Spec: Format mã nhân viên/phòng ban và import nhân sự `.xlsx` (`QĐ-93i`, `US-02-01` AC-11)

- Phụ trách: chưa phân công (người/AI nhận implement sở hữu cả thiết kế, test và bằng chứng).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (gói `QĐ-93`, 01/11/2026).
- Thiết kế: `draft`. Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec.
- Nguồn: Docs `69e8a3d` (BRD v3.58 `FR-2.1`, `FR-9.3`, `FR-9.7`; User Stories regenerated — 143 Story / 1 586 AC:
  `US-02-01` AC-11, `US-02-02` AC-14, AC-23, `US-03-06` AC-25; quyết định `QĐ-93i`, mục _Không phải quyết định mới_ của
  `QĐ-93` cho `.xlsx` và file mẫu), BE `1a77ffe8`.
- Bổ sung sau pin: D-S17…D-S26 (Docs chưa commit) — Owner 01/11/2026; hạng mục này chỉ dùng `D-S26` (quyền chạy test) và thứ
  tự merge của gói; Docs working tree đã đóng câu hỏi mở về chuẩn hóa mã phòng khi tra (`US-02-02` _Open questions_) theo OQ-1
  và đang viết lại vế import của `US-02-02` AC-23 theo OQ-4.
- Nhóm roadmap: G2 — chỉ là planning container, không phải phạm vi (xem `## Sizing decision`).
- [Kế hoạch](plan.md). [Test plan](test-plan.md) (bộ tệp `.xlsx` độc hại và tệp mẫu, viết lại 01/11/2026 theo
  spec này); spec thắng khi lệch.

## Business outcome

Sau lát này mã nhân viên (3–20) và mã phòng (2–20) mới chỉ nhận `^[A-Z0-9]+(-[A-Z0-9]+)*$` sau khi bỏ khoảng trắng đầu/cuối
và đổi chữ hoa, được **lưu** ở dạng đã chuẩn hóa, và so trùng không phân biệt hoa thường — ở nhập tay, tạo phòng và từng dòng
import; mã cũ không bị sửa. Super Admin import được file nhân sự `.xlsx` (sheet đầu) qua đúng khung xem trước/xác nhận của CSV
và nhận **cùng** bản xem trước cho cùng dữ liệu; tệp `.xlsx` hỏng, mã hóa, có macro, "bom nén", cấu trúc ZIP nhập nhằng hay quá
nhiều hàng/ô bị từ chối ở mức tệp **trước** khi thư viện dựng workbook; bộ tệp mẫu CSV/XLSX (mẫu trống, hợp lệ, lỗi từng dòng)
khớp bộ dữ liệu demo mà FE dùng, byte ổn định, kèm README — kiểm bằng unit, HTTP, integration và test đối chiếu tệp mẫu.

## Sizing decision

- Container: G2 (nhóm giao việc, không phải ranh giới hạng mục) và gói quyết định `QĐ-93` (01/11/2026).
- Mode: `grouped-stories`.
- Outcome and owner: dữ liệu mã đi vào hệ thống qua nhập tay/tạo phòng/import (CSV hoặc `.xlsx`) đúng một format; capability
  `organization` (policy mã dùng chung ở `public/`), `data-import/employee-import` (đọc tệp), adapter
  `src/infrastructure/spreadsheet`.
- Boundaries: không migration; transaction như hiện hành (kiểm trùng không phân biệt hoa thường trong cùng transaction); wire
  đổi ở `departmentCreate` (mã lỗi format), `employeeCreate` (lý do dòng mới), import (lý do dòng, lỗi tệp mới, nhận
  `.xlsx`); một dependency runtime mới `exceljs`; bảo mật upload.
- Not larger: phòng tùy chọn/xếp phòng lần đầu (`qd93-unplaced-employee-first-placement`), bỏ căn cứ, danh bạ là sibling;
  import khác (hiện trạng seat, ngân sách) không nhận `.xlsx` ở lát này.
- Not smaller: ba Story gặp nhau ở **cùng một dòng import**: format mã quyết định dòng `.xlsx` nào hợp lệ, và yêu cầu
  "cùng bản xem trước cho CSV và `.xlsx`" (`US-02-01` AC-11) chỉ kiểm được khi cùng bộ tệp mẫu thể hiện cả quy tắc mã mới;
  tách ra phải dựng và kiểm hai lần bộ tệp mẫu/test đối chiếu. Ba phase có checkpoint riêng (plan).
- Siblings: `qd93-unplaced-employee-first-placement` (đi trước — cột phòng tùy chọn, cùng file row-validation/manual),
  `qd93-remove-hr-basis-org-writes`.
- Scope map: [G2](../../../roadmap.md#work-item-decomposition-g2).

## Primary Story/AC

| Story    | AC           | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                  |
| -------- | ------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-02-01 | AC-11        | partial  | AC-1→AC-10: `g2-employee-import-preview-confirm` (giao trước GOV.1)                                                                                                                                                                                 |
| US-02-02 | AC-14, AC-23 | partial  | AC-14 vế căn cứ: `qd93-remove-hr-basis-org-writes`; AC-14 vế không chọn phòng, AC-20, AC-21: `qd93-unplaced-employee-first-placement`; AC-22, AC-24→AC-26: `employee-directory-read`; vế đã giao trước `QĐ-93`: `g2-employee-intake-by-super-admin` |
| US-03-06 | AC-25        | partial  | AC-1, AC-22: `qd93-remove-hr-basis-org-writes`; AC khác: `g2-department-profile`, `g2-g4-unit-only-cost-attribution`                                                                                                                                |

Vế sở hữu ở đây: `US-02-02` AC-14 — mã nhân viên sai format và mã đã có (so không phân biệt hoa thường) ⟹ từ chối; AC-23,
`US-03-06` AC-25, `US-02-01` AC-11 trọn AC. Dòng nào cũng `partial` vì Story có AC khác ở hạng mục khác.

## Supporting references

- `QĐ-93i` (format, độ dài, chuẩn hóa, so trùng không phân biệt hoa thường, chỉ dữ liệu ghi mới, mã phòng không đổi sau khi
  tạo); `FR-9.3` (file mẫu CSV và `.xlsx`, cột phòng tùy chọn); `FR-9.7`.
- Chuẩn hóa mã phòng khi tra (`US-02-02` AC-7, `US-02-03` AC-5): **đã đóng** ở Docs working tree (`US-02-02` _Open questions_,
  "đóng 01/11/2026 — Owner duyệt đề xuất kỹ thuật của spec BE `qd93-code-format-xlsx-employee-import`") — bỏ khoảng trắng và
  đổi chữ hoa trước khi tra (OQ-1).
- `US-02-02` AC-23 (Docs `69e8a3d`) ghi "mã `nv-0012` ⟹ bị từ chối / lỗi dòng _mã đã có_"; vế **import** đang được viết lại
  theo OQ-4 (Owner duyệt 01/11/2026: dòng import trùng mã người đã có khác hoa thường là **cùng người**). Spec theo bản viết
  lại: nhập tay `nv-0012` ⟹ `EMPLOYEE_CODE_TAKEN`; dòng import `nv-0012` ⟹ _trùng, bỏ qua_ / _có khác biệt_. Đọc lại AC-23 khi
  Docs commit; lệch thì sửa spec trước khi code.
- Hạng mục bị **thay thế một phần**: [g2-employee-import-preview-confirm](../g2-employee-import-preview-confirm/spec.md) (vế
  "chỉ CSV", tệp nhị phân ⟹ `FILE_NOT_TEXT`; mã nhân viên không giới hạn độ dài), [g2-department-profile](../g2-department-profile/spec.md)
  (mã phòng theo format Cost Center `^[A-Za-z0-9][A-Za-z0-9._-]*$`, tối đa 50, so trùng phân biệt hoa thường),
  [g2-job-title-catalogue-and-manual-employee](../g2-job-title-catalogue-and-manual-employee/spec.md) (mã nhân viên nhập tay
  1–50 ký tự tự do).
- `docs/rules/security-jobs.md` (upload), skill bảo mật: allowlist định dạng, giới hạn kích thước, kiểm nội dung.
- Bộ dữ liệu demo FE: `src/cli/demo-dataset/fixture/shared-demo-v1.ts` (`SHARED_DEMO_V1`), `docs/guides/demo-dataset.md`.

## Explicit out of scope

- Sửa mã đã có (nhân viên, phòng) cho khớp format — `QĐ-93i` chỉ áp cho dữ liệu ghi mới; không backfill, không đổi mã cũ.
- Mã Cost Center (`COST_CENTER_CODE_PATTERN`) — giữ nguyên.
- Tra nhân viên theo mã ở import hiện trạng seat (`seat-baseline`) và các nơi khác — giữ khớp đúng (Owner duyệt 01/11/2026);
  đổi sau nếu cần là hạng mục riêng. (Tra **phòng** theo mã của lệnh `assign-subscription-owner` thì đổi theo, vì dùng chung
  `lockByCode` — xem Behavior.)
- `.xlsx` cho import hiện trạng seat, ngân sách, hóa đơn — không ở lát này.
- Lưu tệp gốc (`TE-07`) — vẫn chưa làm, như CSV.
- Endpoint tải tệp mẫu từ BE (route nhị phân): **không** làm (OQ-3, Owner duyệt 01/11/2026) — tệp mẫu do BE sinh và commit
  ở `docs/examples/employee-import/`, FE phục vụ như tài nguyên tĩnh.
- Đổi bộ dữ liệu demo (thêm phòng đã ngừng, thêm nhân viên): không — tệp mẫu theo dữ liệu demo hiện có.

## Dependencies and blockers

- Thứ tự merge (gói `QĐ-93`, một hạng mục một lần, rebase lên `dev` trước merge): W4, **sau** PR A–D của
  `qd93-unplaced-employee-first-placement` (W3, một PR). Phụ thuộc thật chỉ ở phần import không phòng: tệp mẫu có dòng không
  phòng và `employees-missing-column.csv` mong `FILE_MISSING_COLUMNS ['employee_code']` (Phase C của lát này) cần cột
  `department_code` tùy chọn đã có trên `dev`. Phase A (format mã) và Phase B (đọc `.xlsx`) không cần hạng mục 6 về chức
  năng — làm song song được trên nhánh riêng, nhưng chạm cùng `employee-import-row-validation.policy.ts`,
  `employee-manual.service.ts`, `employee.repo.ts` nên rebase lên `dev` sau khi PR của hạng mục 6 merge, rồi mới merge.
- Dependency runtime `exceljs` 4.4.0 (skill bảo mật: thêm dependency là "ask first") — Owner đồng ý (OQ-2, 01/11/2026).
- OQ-1 → OQ-5 đã được Owner duyệt 01/11/2026 (`## Changes and acceptance`); không còn chặn `ready` về phía OQ — vẫn chờ
  Owner review toàn spec.

## Ownership: module, data, API

- `organization/public/organization-code.policy.ts` (+ spec, mới): `normalizeOrganizationCode`, `isValidEmployeeCode`,
  `isValidDepartmentCode`, hằng `ORGANIZATION_CODE_PATTERN`, `EMPLOYEE_CODE_LENGTH`, `DEPARTMENT_CODE_LENGTH`. Đăng ký ở
  `PUBLIC_ROOT_POLICY_FILES` của `test/gates/policy-ownership.gate-spec.ts` (data-import và organization dùng chung).
- `organization/employee/`: `employee.dto.ts`, `employee-row.policy.ts` (+ spec, lý do `EMPLOYEE_CODE_INVALID`),
  `employee-manual.service.ts`, `employee.repo.ts` (`isCodeTaken` không phân biệt hoa thường; tra theo mã chuẩn hóa),
  `import-lookup.repo.ts` (tra phòng/người theo mã chuẩn hóa).
- `organization/department-management/`: `department.dto.ts` (bỏ mượn `COST_CENTER_CODE_PATTERN`), `department.service.ts`,
  `department.http-errors.ts` (422 `DEPARTMENT.CODE_INVALID`); `organization/department/`: `department.errors.ts`
  (`DepartmentCodeInvalidError`), `department.repo.ts` (`create` kiểm trùng không phân biệt hoa thường, `lockByCode` tra chuẩn
  hóa — người gọi: `employee-manual.service.ts` và `catalog/public/subscription-owner-assignment.api.ts`).
- `data-import/employee-import/`: `preview/employee-import-file.policy.ts` (nhận diện định dạng, đọc `.xlsx`, async),
  `preview/employee-import-preview.service.ts` (await), `row-validation/employee-import-row-validation.policy.ts` (chuẩn hóa,
  format, so trùng), `employee-import.errors.ts` (`FileProblem` thêm `FILE_FORMAT_UNSUPPORTED`),
  `employee-import.http-errors.ts`, `employee-imports.controller.ts` (mô tả, ví dụ).
- Adapter mới `src/infrastructure/spreadsheet/`: `zip-container.ts` (+ spec) — kiểm vỏ ZIP và nội dung đã giải nén trong giới
  hạn; `xlsx-table.ts` (+ spec) — sheet đầu thành các hàng ô chữ bằng `exceljs`; `spreadsheet.errors.ts`.
- `package.json`, `pnpm-lock.yaml` (`exceljs` 4.4.0 ghim chính xác ở `dependencies`).
- `docs/examples/employee-import/` (sinh lại toàn bộ) và script sinh `scripts/dev/generate-employee-import-examples.ts`.
- Lệnh khởi tạo (OQ-5): `src/modules/installation/installation.dto.ts`, `src/cli/bootstrap/bootstrap.arguments.ts`.
- Bảng đọc/ghi: `employees`, `departments` (không đổi schema). Không route mới.

## Behavior and design

### Quy tắc mã (một policy dùng chung)

- `normalizeOrganizationCode(raw) = raw.trim().toUpperCase()`. Trước khi đổi chữ hoa, phần đã trim phải chỉ gồm ASCII
  `[A-Za-z0-9-]` — tránh ánh xạ chữ hoa Unicode biến ký tự lạ thành chữ hợp lệ (`ß` → `SS`, `ı` → `I`, `ﬀ` → `FF`) (Owner
  duyệt 01/11/2026).
- Hợp lệ ⟺ khớp `^[A-Z0-9]+(-[A-Z0-9]+)*$` và độ dài 3–20 (nhân viên) / 2–20 (phòng) **sau** chuẩn hóa.
- Giá trị **lưu** là dạng đã chuẩn hóa (`nv-0013` ⟹ `NV-0013`; `p-mkt` ⟹ `P-MKT`).
- So trùng không phân biệt hoa thường với dữ liệu có sẵn: `upper(code) = $normalized` trong cùng transaction ghi. Chỉ mục duy
  nhất hiện có `(organization_id, code)` vẫn là chốt cuối cho hai lần ghi mới đồng thời (cả hai đã chữ hoa). Không có đường ghi
  mới nào tạo mã chữ thường nên ca "mới vs cũ chữ thường" không có đua.
- **Không** migration, **không** chỉ mục duy nhất trên `upper(code)`: dữ liệu cũ có thể có hai mã chỉ khác hoa thường và
  migration tạo chỉ mục sẽ hỏng khi deploy (Owner duyệt 01/11/2026). Chỉ mục duy nhất biểu thức
  `(organization_id, upper(code))` cho hai bảng là việc sau, ngoài lát này, khi đã rà dữ liệu.

### Nhập tay nhân viên (`POST /api/v1/employees`)

- DTO: `employeeCode: z.string().trim().min(1).max(100)` + `description` nêu format (không `pattern` vì nhận chữ thường).
  Format sai ⟹ 422 `EMPLOYEE.ROW_INVALID` `details.reasons: [{ field: 'employeeCode', code: 'EMPLOYEE_CODE_INVALID' }]` —
  cùng lý do với dòng import (`US-02-02` AC-14, AC-23). Mã hợp lệ đã có (không phân biệt hoa thường) ⟹ `EMPLOYEE_CODE_TAKEN`
  như cũ. Hồ sơ của chính người nhập (`OWN_RECORD`) so mã đã chuẩn hóa với `upper` mã của người đó.
- Response trả mã đã lưu (chuẩn hóa).

### Tạo phòng (`POST /api/v1/departments`)

- DTO: `code: z.string().max(100)` + `description` nêu format. Service chuẩn hóa; sai format ⟹ 422 `DEPARTMENT.CODE_INVALID`
  (mã mới, Owner duyệt 01/11/2026); trùng không phân biệt hoa thường ⟹ 409 `DEPARTMENT.CODE_TAKEN` (giữ). Lưu dạng chuẩn hóa.
  `PATCH` vẫn không có trường `code` (khóa lạ ⟹ 422 `VALIDATION_ERROR`) — mã không đổi sau khi tạo (`US-03-06` AC-25).

### Mã phòng trong dòng nhân sự/biểu mẫu (OQ-1, Owner duyệt 01/11/2026)

- Tra theo mã chuẩn hóa: ưu tiên khớp đúng sau trim; không có thì khớp `upper(code) = $normalized` nếu đúng **một** phòng; hai
  phòng cũ chỉ khác hoa thường ⟹ coi như không tìm thấy (`DEPARTMENT_NOT_FOUND`) để không đoán. Không kiểm format mã phòng
  ở đây (là tham chiếu, không phải ghi mới).
- `DepartmentRepo.lockByCode` là chỗ tra chung: lệnh vận hành `assign-subscription-owner`
  (`catalog/public/subscription-owner-assignment.api.ts:30`, `--department-code`) cũng tra theo luật này — `p-des` khớp `P-DES`;
  hai phòng cũ chỉ khác hoa thường ⟹ `DEPARTMENT_NOT_ACTIVE` như phòng không có (mã lỗi lệnh hiện hành). Đổi hành vi có chủ
  đích, ghi ở module card `catalog` và có test.
- Import lại: so mã phòng của người đã có không phân biệt hoa thường (`p_ops` lưu cũ ≡ `P_OPS` trong tệp).

### Dòng import

- Thứ tự (thay đổi nhỏ của `classify`): chuẩn hóa mã → trống ⟹ `EMPLOYEE_CODE_REQUIRED` → trùng trong tệp (so chuẩn hóa)
  ⟹ `EMPLOYEE_CODE_DUPLICATE_IN_FILE` → tra người đã có theo mã chuẩn hóa (ưu tiên khớp đúng; không khớp đúng mà hai người cũ
  chỉ khác hoa thường ⟹ lỗi `EMPLOYEE_CODE_AMBIGUOUS`, Owner duyệt 01/11/2026) → **có** ⟹ đường so khác biệt như cũ (_trùng,
  bỏ qua_ / _có khác biệt_), **không** kiểm format (không phải ghi mới) → **không có** ⟹ format sai ⟹ `EMPLOYEE_CODE_INVALID`.
- Dòng mã `nv-0012` khi đã có `NV-0012` là **cùng người** (OQ-4, Owner duyệt 01/11/2026) ⟹ _trùng, bỏ qua_ / _có khác biệt_
  (khớp `US-02-02` AC-6, AC-10, TS-18 "trùng" và vế import đang viết lại của AC-23). Đã loại: lỗi dòng _mã đã có_ khi mã
  trong tệp khác hoa thường với mã đã lưu. Nhập tay giữ `EMPLOYEE_CODE_TAKEN` (không có đường "cập nhật" ở nhập tay).
- Bỏ giới hạn ngầm "không trần" của import: format đã gồm độ dài 3–20 (trước đây dòng import không giới hạn, nhập tay 50).
- Ô ở `.xlsx` được đổi thành chữ trước khi tới đây, nên quy tắc dòng không phụ thuộc định dạng tệp.

### Đọc tệp: CSV hoặc `.xlsx`

- Nhận diện theo **nội dung** (không theo tên/đuôi): bắt đầu bằng `50 4B 03 04` (ZIP) ⟹ đường `.xlsx`; bắt đầu bằng
  `D0 CF 11 E0 A1 B1 1A E1` (OLE2: `.xls` cũ, `.xlsx` đặt mật khẩu) ⟹ 422 `IMPORT.FILE_FORMAT_UNSUPPORTED` (mã mới:
  `FileProblem` thêm `FILE_FORMAT_UNSUPPORTED`, wire `IMPORT.<problem>` như `IMPORT.FILE_NOT_TEXT` —
  `employee-import.http-errors.ts:29-31`); còn lại ⟹ đường CSV hiện hành (có byte NUL ⟹ `FILE_NOT_TEXT`; BOM UTF-8 được bỏ —
  `src/core/csv.ts`). Tệp bắt đầu bằng chữ ký ZIP mà hỏng (ví dụ 6 byte `50 4B 03 04 00 00` của
  `employee-import-preview-http.integration-spec.ts:143-148`, hôm nay `FILE_NOT_TEXT`) ⟹ 422 `IMPORT.FILE_UNREADABLE`
  `XLSX_INVALID`.
- Giới hạn chung giữ nguyên: tệp ≤ 2 MiB (multer, 413), ≤ 1 000 dòng dữ liệu (`FILE_TOO_MANY_ROWS`), ≤ 40 cột và ô ≤ 2 000
  ký tự (`IMPORT.FILE_UNREADABLE` `TOO_MANY_COLUMNS`/`CELL_TOO_LONG`), hàng trống bị bỏ, hàng đầu có giá trị là header, bí danh
  header không đổi.
- Vỏ ZIP (`zip-container.ts`, **trước** khi gọi thư viện): đọc toàn bộ cấu trúc và từ chối mọi thứ mà hai bộ đọc ZIP (bộ kiểm
  này và JSZip bên trong `exceljs`) có thể hiểu khác nhau:
  - đúng **một** bản ghi End of Central Directory (chữ ký `50 4B 05 06` xuất hiện một lần trong 64 KiB + 22 byte cuối), comment
    dài đúng tới hết tệp; không dữ liệu thừa **trước** Local File Header đầu (offset 0) hay **sau** EOCD; Central Directory
    nằm ngay sau dữ liệu mục cuối; các mục (header + dữ liệu + data descriptor nếu có) liền nhau, không chồng, không khoảng hở;
  - mỗi mục của Central Directory có Local File Header khớp (chữ ký, tên, phương thức, cờ, CRC và hai kích thước — hoặc data
    descriptor khi cờ bit 3); tên mục không trùng (so đúng và so không phân biệt hoa thường), không `..`, không bắt đầu `/`;
  - từ chối ZIP64, mục có cờ mã hóa, phương thức nén khác 0/8, quá 200 mục.
  - Giới hạn kích thước giải nén (thay 16/32 MiB của bản trước — đủ cho tệp 1 000 × 40 ô hợp lệ, không đủ cho workbook ~500k
    ô): ≤ **4 MiB** mỗi mục, ≤ **8 MiB** tổng; giải nén thật từng mục bằng `zlib.inflateRawSync(…, { maxOutputLength })` và
    đòi đúng kích thước khai báo và CRC (chặn khai báo gian).
  - Đếm trước trên XML đã giải nén (không dựng DOM): mỗi `xl/worksheets/*.xml` ≤ **2 000** phần tử `<row` và ≤ **50 000** phần
    tử `<c` (`/<(?:\w+:)?row[\s>/]/`, `/<(?:\w+:)?c[\s>/]/`), `xl/sharedStrings.xml` ≤ **50 000** `<si`; vượt ⟹
    `XLSX_TOO_LARGE`. Nhờ đó `Workbook.xlsx.load` trên main thread chỉ dựng tối đa ~50k ô; giới hạn 1 000 dòng/40 cột sau khi
    đọc giữ nguyên để báo đúng mã CSV.
  - Từ chối phần XML có `<!DOCTYPE` (thực thể/XXE) và tệp có `xl/vbaProject.bin` (macro).
  - Lỗi ⟹ 422 `IMPORT.FILE_UNREADABLE` với `details.reason` `XLSX_INVALID` | `XLSX_TOO_LARGE` | `XLSX_ENCRYPTED` |
    `XLSX_MACROS`. Đã loại: `exceljs` `stream.xlsx.WorkbookReader` dừng ở hàng 1 002 — đường đọc thứ hai với API khác cho cùng
    tệp, vẫn tin bộ ZIP của thư viện; đếm trước trên byte mà bộ kiểm đã giải nén cho cùng kết quả với một đường đọc.
- Sheet (`xlsx-table.ts`, `exceljs` `Workbook.xlsx.load(buffer)` với `ignoreNodes` cho các phần không cần): **sheet đầu tiên**
  theo thứ tự workbook (sheet khác bị bỏ qua, kể cả sheet hướng dẫn); không sheet ⟹ `XLSX_INVALID`. Đổi ô thành chữ:
  chuỗi giữ nguyên; số nguyên an toàn ⟹ chữ số không mũ (`1234`), số khác ⟹ `String(n)`; ngày (ô định dạng ngày) ⟹
  `YYYY-MM-DD` theo thành phần UTC mà thư viện trả; boolean ⟹ `TRUE`/`FALSE`; rich text ⟹ nối các đoạn; hyperlink ⟹ chữ hiển
  thị; công thức ⟹ **giá trị đã lưu** (không bao giờ tính lại), không có ⟹ ô trống; lỗi (`#N/A`…) ⟹ chính chữ lỗi; ô gộp chỉ
  ô chính có giá trị. Số dòng báo lỗi = số hàng Excel (header là hàng 1), cùng nghĩa với dòng CSV.
- Ghi chú cho người dùng (README): mã như `00123` gõ dạng số sẽ mất số 0 đầu — định dạng cột mã là Text.
- Mã băm nội dung tính trên byte tải lên như cũ: CSV và `.xlsx` cùng dữ liệu là hai tệp khác nhau, không cảnh báo trùng tệp.
- `exceljs` 4.4.0 (MIT; bản ổn định cuối 19/10/2023, 4.4.1-prerelease.0 ngày 20/12/2024 — kiểm npm registry 01/11/2026); kéo
  theo `jszip`, `saxes`, `unzipper`, `archiver`, `fast-csv`, `tmp`, `uuid`, `dayjs`, `readable-stream`. Rủi ro bảo trì chậm
  được giảm bằng kiểm vỏ ZIP riêng ở trên. Owner duyệt `exceljs` 4.4.0 (OQ-2, 01/11/2026). Đã loại: `read-excel-file` (MIT,
  bản 9.3.14 phát hành 29/10/2026 — chưa đủ hai tuần), SheetJS `xlsx` bản npm 0.18.5 (bản vá chỉ phát hành ngoài npm).

### Tệp mẫu cho FE (`docs/examples/employee-import/`, sinh lại)

- Sinh bằng `scripts/dev/generate-employee-import-examples.ts` từ một danh sách dòng khai báo trong script, header lấy từ
  `EMPLOYEE_COLUMNS` (không trôi khỏi parser). Thay toàn bộ tệp cũ (đang dùng header `costCenterCode`/`managerEmployeeCode`).
- **Dữ liệu nền = bộ dữ liệu demo FE** (`SHARED_DEMO_V1`): phòng `DS1-ENG`, `DS1-DES` (đang hoạt động, có Cost Center),
  `DS1-OPS` (đang hoạt động, chưa Cost Center — vẫn nhận người); `WORK_EMAIL_TAKEN` dùng email của `DS1-DEV1`
  (`dung.pham@ds1.slm-demo.example`). Script đọc mã/email từ `SHARED_DEMO_V1` (không chép tay). Bộ demo không có phòng đã
  ngừng ⟹ tệp mẫu **không** có dòng `DEPARTMENT_INACTIVE` (ca này kiểm ở integration của `qd93-unplaced-employee-first-placement`
  và Task A.3); README nói rõ.
- Mã nhân viên của tệp mẫu riêng từng bộ, không đụng mã `DS1-*` và không đụng nhau: bộ hợp lệ `IMP-V01`…`IMP-V15` (vài dòng
  ghi chữ thường có khoảng trắng như `imp-v03` để thấy chuẩn hóa), bộ lỗi `IMP-X01`… (cặp CSV/`.xlsx` của cùng bộ cùng mã vì
  cùng dữ liệu). Email `@example.test`.
- Tệp: `employee-template.csv`, `employee-template.xlsx` (chỉ header; `.xlsx` có sheet thứ hai _Hướng dẫn_ ghi cột bắt
  buộc/tùy chọn — phòng ban, chức vụ, email công việc tùy chọn); `employees-valid.csv`, `employees-valid.xlsx` (15 dòng, cùng
  nội dung: 3 dòng không phòng, đủ bốn loại nhân sự, chức vụ có/không, mã chữ thường có khoảng trắng, tên tiếng Việt);
  `employees-invalid.csv`, `employees-invalid.xlsx` (mỗi lỗi dòng một dòng: `EMPLOYEE_CODE_REQUIRED`, `EMPLOYEE_CODE_INVALID`
  (`IMP--13`, `-IMP13`, `IMP_13`, `AB`, 21 ký tự), `EMPLOYEE_CODE_DUPLICATE_IN_FILE`, `FULL_NAME_REQUIRED`,
  `WORK_EMAIL_INVALID`, `WORK_EMAIL_DUPLICATE_IN_FILE`, `WORK_EMAIL_TAKEN`, `EMPLOYMENT_TYPE_INVALID`, `HIRE_DATE_INVALID`,
  `DEPARTMENT_NOT_FOUND`, `JOB_TITLE_TOO_LONG`, cộng một dòng hợp lệ); `employees-missing-column.csv` (thiếu `employee_code` ⟹
  `IMPORT.FILE_MISSING_COLUMNS`); `employees-no-department.csv`, `employees-no-department.xlsx` (header **không** có cột
  `department_code`, 3 dòng người mới hợp lệ ⟹ cả 3 _chưa xếp phòng_, `newUnplaced: 3` — `US-02-02` AC-2; cột phòng tùy chọn
  của `qd93-unplaced-employee-first-placement`); `README.md`; `expected-results.json` (theo mẫu hiện có: mỗi tệp — tổng dòng,
  hợp lệ, lỗi, `newUnplaced`, theo phòng, và từng dòng `line`/`outcome`/`errors`); `manifest.json` (`{ file, sizeBytes,
sha256 }` của mọi tệp mẫu).
- CSV ghi UTF-8 **có BOM** (Excel mở đúng tiếng Việt; parser bỏ BOM). `.xlsx` **byte ổn định**: thời điểm tạo/sửa của
  workbook và ngày giờ của mục ZIP cố định (hằng trong script; nếu thư viện không cho đặt ngày mục ZIP thì script ghi lại
  trường thời gian DOS của Local File Header và Central Directory về hằng đó) — chạy lại script không đổi byte nào. Kiểm
  bằng `sha256`: `generate-employee-import-examples.ts --check` sinh lại trong bộ nhớ và so với `manifest.json` đã commit
  (không dựa vào `git diff`, vì tệp mới chưa được Git theo dõi). Mọi tệp `.xlsx` (mẫu và tệp thử trong test) do `exceljs` hoặc
  bộ dựng ZIP của repo sinh ra — không dùng tệp do Excel/LibreOffice tạo.
- README: cột, bí danh, format mã, ngày `YYYY-MM-DD`, bốn loại nhân sự, phòng/chức vụ/email tùy chọn, dữ liệu nền (bộ demo
  `shared-demo-v1`), cách thử trên FE và kết quả mong đợi; **chạy lặp lại: xem trước rồi hủy**
  (`POST /employee-imports/{id}/cancellations`) — xác
  nhận tạo nhân viên vĩnh viễn (15 người của bộ hợp lệ), lần upload sau cùng tệp ra _trùng, bỏ qua_ và cảnh báo tệp đã import
  (cùng mã băm). `OWN_RECORD` không có trong tệp mẫu (phụ thuộc Super Admin của môi trường) — README nêu cách thử.
- Test integration đọc chính các tệp này (dữ liệu nền dựng từ `SHARED_DEMO_V1` bằng harness — chỉ phần README cần) và so với
  `expected-results.json`; cặp CSV/`.xlsx` phải cho kết quả bằng nhau (`US-02-01` AC-11).

### Tương thích

- `departmentCreate`: mã sai format trước đây 422 `VALIDATION_ERROR` (regex zod), nay 422 `DEPARTMENT.CODE_INVALID`; mã chữ
  thường trước đây lưu nguyên, nay lưu chữ hoa.
- `employeeCreate`: lý do dòng mới `EMPLOYEE_CODE_INVALID`; mã > 50 trước đây 422 `VALIDATION_ERROR`, nay (≤ 100) là lý do
  dòng.
- Import: lý do dòng mới `EMPLOYEE_CODE_INVALID`, `EMPLOYEE_CODE_AMBIGUOUS`; mã mức tệp mới 422
  `IMPORT.FILE_FORMAT_UNSUPPORTED`; `IMPORT.FILE_UNREADABLE` thêm bốn `reason` `XLSX_*`; tệp `.xlsx` (và tệp mở đầu bằng chữ
  ký ZIP) trước đây `FILE_NOT_TEXT` nay đọc được hoặc bị từ chối `XLSX_*`.
- Lệnh `assign-subscription-owner`: mã phòng chữ thường nay khớp phòng chữ hoa.
- Không đổi dữ liệu cũ, không migration.

### Concurrency

Như hiện hành: tạo phòng/nhân viên trong một transaction; kiểm trùng không phân biệt hoa thường rồi `INSERT`; hai lần tạo
cùng mã mới đồng thời ⟹ chỉ mục duy nhất chốt, bên thua 409 `DEPARTMENT.CODE_TAKEN` / lý do `EMPLOYEE_CODE_TAKEN` (ánh xạ
`isUniqueViolation` có sẵn). Đọc `.xlsx` không chạm CSDL.

## Test matrix

| AC / rủi ro                  | Tình huống (gồm từ chối, edge case)                                                                                                      | Cấp test         | Kết quả mong đợi                                                                                     | Bằng chứng sau implement |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- | ------------------------ |
| `US-02-02` AC-23             | policy: `nv-0013`; `NV--13`, `-NV13`, `NV13-`, `NV_13`, `NV 13`, `AB`, 21 ký tự, `ß`/`ı`                                                 | unit             | `NV-0013` hợp lệ; còn lại không hợp lệ                                                               | planned                  |
| `US-02-02` AC-23, AC-14      | nhập tay `nv-0013`                                                                                                                       | integration      | 201, lưu `NV-0013`                                                                                   | planned                  |
| `US-02-02` AC-23, AC-14      | nhập tay `NV_13`; `nv-0012` khi đã có `NV-0012`; `EMP1` khi đã có `emp1` cũ (cặp ≥ 3 ký tự, hợp lệ sau chuẩn hóa)                        | integration      | 422 `EMPLOYEE_CODE_INVALID`; 422 `EMPLOYEE_CODE_TAKEN` (hai ca)                                      | planned                  |
| `US-02-02` AC-23             | import dòng mã sai format; mã chữ thường của người mới                                                                                   | integration      | lỗi `EMPLOYEE_CODE_INVALID` cột `employee_code`; người mới lưu chữ hoa                               | planned                  |
| `US-02-02` AC-23 (OQ-4)      | import dòng `nv-0012` khi đã có `NV-0012`; dòng `EMP1` khi người cũ mang `emp1`                                                          | integration      | _trùng, bỏ qua_ / _có khác biệt_; mã cũ `emp1` không đổi                                             | planned                  |
| `EMPLOYEE_CODE_AMBIGUOUS`    | hai người cũ `emp9`, `Emp9`; dòng `EMP9`; dòng `emp9` (khớp đúng)                                                                        | unit/integration | `EMP9` ⟹ lỗi `EMPLOYEE_CODE_AMBIGUOUS`; `emp9` ⟹ so với đúng người `emp9`                            | planned                  |
| `US-03-06` AC-25             | tạo phòng `p-mkt`; `P`, 21 ký tự, `P--MKT`, `-PMKT`, `PMKT-`, `P_MKT`, `P MKT`; `p-des` khi có `P-DES`                                   | integration      | 201 `P-MKT`; 422 `DEPARTMENT.CODE_INVALID`; 409 `DEPARTMENT.CODE_TAKEN`                              | planned                  |
| `US-03-06` AC-25             | `PATCH /departments/{id}` kèm `code`; đọc phòng cũ `p_ops`                                                                               | http/integration | 422 `VALIDATION_ERROR`; `p_ops` nguyên                                                               | planned                  |
| OQ-1                         | dòng/biểu mẫu mã phòng `p-des` khi có `P-DES`; hai phòng cũ `p-x`, `P-X`                                                                 | integration      | khớp `P-DES`; hai phòng ⟹ `DEPARTMENT_NOT_FOUND`                                                     | planned                  |
| `lockByCode` dùng chung      | `assign-subscription-owner --department-code p-des` khi có `P-DES`; hai phòng cũ `p-x`, `P-X`                                            | integration      | gán cho `P-DES`; hai phòng ⟹ `DEPARTMENT_NOT_ACTIVE`, không ghi                                      | planned                  |
| `US-02-01` AC-11             | cùng 20 dòng ở CSV và `.xlsx`, upload từng tệp                                                                                           | integration      | hai preview bằng nhau (số hợp lệ/lỗi/bỏ qua, từng dòng `line`, `errors`), chưa ghi; xác nhận mới ghi | planned                  |
| `US-02-01` AC-11             | tệp mẫu CSV/`.xlsx`                                                                                                                      | integration      | cùng bộ cột = `EMPLOYEE_COLUMNS`; `.xlsx` có sheet hướng dẫn nêu phòng ban tùy chọn                  | planned                  |
| tệp mẫu                      | upload `employees-valid.*`, `-invalid.*`, `-no-department.*`, `-missing-column.csv` trên dữ liệu nền từ `SHARED_DEMO_V1`                 | integration      | bằng `expected-results.json`; tệp không cột phòng ⟹ mọi dòng _chưa xếp phòng_                        | planned                  |
| tệp mẫu ổn định              | sinh một lần rồi `--check` hai lần; CSV có BOM                                                                                           | script/unit      | `sha256` từng tệp (cả `.xlsx`) khớp `manifest.json` đã commit; 3 byte đầu CSV `EF BB BF`             | planned                  |
| bảo mật `.xlsx` — nén/khai   | bom nén, khai báo gian, mục > 4 MiB, tổng > 8 MiB, ZIP64, mục mã hóa, nén lạ, > 200 mục, OLE2, macro, `<!DOCTYPE`                        | unit/http        | 422 với đúng `reason`/problem; không giải nén quá `maxOutputLength`                                  | planned                  |
| bảo mật `.xlsx` — cấu trúc   | tên mục trùng (đúng/khác hoa thường); dữ liệu thừa trước mục đầu hoặc sau EOCD; hai EOCD; Local Header lệch Central Directory; mục chồng | unit             | `XLSX_INVALID`; `exceljs` không được gọi                                                             | planned                  |
| bảo mật `.xlsx` — số phần tử | sheet 2 001 `<row`; sheet 50 001 `<c` (dưới 4 MiB); `sharedStrings` 50 001 `<si`                                                         | unit             | `XLSX_TOO_LARGE` trước `Workbook.xlsx.load`                                                          | planned                  |
| giới hạn                     | `.xlsx` 1 001 dòng; 41 cột; ô 2 001 ký tự; hàng trống giữa; tệp 2 MiB + 1 byte                                                           | unit/http        | `FILE_TOO_MANY_ROWS`; `TOO_MANY_COLUMNS`; `CELL_TOO_LONG`; hàng trống bỏ qua; 413                    | planned                  |
| đổi ô                        | ô ngày, số nguyên/mã số, công thức có/không giá trị lưu, rich text, hyperlink, lỗi, boolean, ô gộp, sheet thứ hai                        | unit             | chữ theo quy tắc ở Behavior; sheet thứ hai không đọc                                                 | planned                  |
| dependency                   | `pnpm install` không chạy script build mới; `pnpm audit --prod`                                                                          | review           | không script mới; không lỗ hổng cao/nghiêm trọng chưa xử lý (ghi kết quả)                            | planned                  |

## Definition of Done

- [ ] Mọi primary AC có test đỏ-trước/xanh-sau ở cấp phù hợp; vế ở hạng mục khác ghi đúng.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối: `pnpm check`, HTTP/integration theo
      file đã sửa (`D-S26`); `pnpm audit --prod` ghi kết quả; full `pnpm test:integration` chỉ sau khi Owner đồng ý.
- [ ] Spec/plan/test plan/roadmap phản ánh implementation cuối; FE được báo mã lỗi mới và cách dùng tệp mẫu.
- [ ] Không tăng legacy ledger kiến trúc; `exceljs` chỉ được import trong `src/infrastructure/spreadsheet/` và script sinh mẫu.
- [ ] Module card `organization`, `data-import`, `catalog` và README tệp mẫu cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

- 01/11/2026: lập theo giao việc Owner (gói `QĐ-93`, hạng mục 7). Chưa code, chưa review, chưa nghiệm thu.
- 01/11/2026 — Owner duyệt các đề xuất kỹ thuật (OQ-1 → OQ-5, kiểm ASCII trước khi đổi hoa, không chỉ mục `upper(code)`,
  `DEPARTMENT.CODE_INVALID`, `EMPLOYEE_CODE_AMBIGUOUS`, ngưỡng vỏ ZIP, giữ khớp đúng ở `seat-baseline`); thiết kế vẫn draft
  chờ Owner review toàn spec.
- 01/11/2026 — sửa sau rà soát spec độc lập: ngưỡng giải nén 16/32 MiB hạ xuống 4/8 MiB, đếm trước `<row`/`<c`/`<si` trên XML
  đã giải nén, từ chối cấu trúc ZIP nhập nhằng (tên trùng, dữ liệu thừa, nhiều EOCD, Local Header lệch Central Directory) — các
  ngưỡng mới Owner xác nhận 01/11/2026 (thay ngưỡng duyệt trước đó); tệp mẫu theo bộ demo `shared-demo-v1`, mã riêng từng bộ,
  "xem trước rồi hủy" để chạy lặp, CSV có BOM, `.xlsx` byte ổn định, bỏ dòng `DEPARTMENT_INACTIVE` khỏi tệp mẫu; ca `E1`/`e1`
  (2 ký tự — sai format) đổi thành `EMP1`/`emp1`; thêm test `EMPLOYEE_CODE_AMBIGUOUS` và `assign-subscription-owner` (đổi theo
  `lockByCode`); câu hỏi mở chuẩn hóa mã phòng ghi là đã đóng; vế import của AC-23 theo OQ-4 (Docs đang viết lại); phụ thuộc
  hạng mục 6 ghi chính xác theo thứ tự merge (W4, sau PR A–D của hạng mục 6; chỉ Phase C cần về chức năng); thêm dòng quyền chạy
  test `D-S26` và quy tắc migration (lát này không có migration). Không đổi claim Primary.

- 02/11/2026 — sửa theo rà soát pre-flight cuối: ngưỡng 4/8 MiB và đếm phần tử Owner xác nhận 01/11/2026 (bỏ "chờ xác
  nhận"); mã OLE2 đúng wire `IMPORT.FILE_FORMAT_UNSUPPORTED` (không có mã `IMPORT.FILE_INVALID`); ca ZIP hỏng của
  `employee-import-preview-http.integration-spec.ts:143-148` vào Task B.4; tệp thử chỉ do `exceljs`/bộ dựng của repo sinh; lệnh
  cần mạng (`pnpm add`, `pnpm audit`) ghi "chưa chạy được" khi offline; thêm tệp mẫu không cột phòng; byte ổn định kiểm bằng
  `sha256` so `manifest.json` (`--check`), không bằng `git diff`; Task A.3 liệt kê fixture có mã sai format mới; quy tắc
  migration không sửa `scripts/verify/merged-migrations.txt`.

Quyết định kỹ thuật (Owner duyệt 01/11/2026): OQ-1 — chuẩn hóa mã phòng khi tra (Docs đã đóng câu hỏi mở tương ứng); OQ-2 —
thêm `exceljs` 4.4.0 và giới hạn vỏ ZIP (ngưỡng 4/8 MiB và đếm phần tử Owner xác nhận 01/11/2026); OQ-3 — tệp mẫu tĩnh do FE phục
vụ, không route tải từ BE; OQ-4 — dòng import trùng mã người đã có khác hoa thường là cùng người; OQ-5 — lệnh `bootstrap` dùng
format mã mới cho phòng đầu và mã Super Admin (Task A.4 của plan, bắt buộc).

Dòng scope map G2 (đã có trong scope map G2 của roadmap): `US-02-01` AC-11, `US-02-02` AC-23, `US-03-06` AC-25 `full` lát
này; `US-02-02` AC-14 `partial` (Owner `g2-employee-intake-by-super-admin`, Remaining owner gồm lát này).

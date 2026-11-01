# Plan: qd93-code-format-xlsx-employee-import

- [Spec](spec.md); revision đầu vào: Docs `69e8a3d`, BE `1a77ffe8`. [Test plan](test-plan.md) cho `.xlsx` và tệp mẫu (viết lại
  01/11/2026 theo spec: ngưỡng 4/8 MiB, đếm trước phần tử, dữ liệu nền `shared-demo-v1`).
- Bổ sung sau pin: D-S17…D-S26 (Docs chưa commit) — Owner 01/11/2026; lát này dùng `D-S26` và thứ tự merge của gói.
- Phụ trách: chưa phân công (sở hữu cả thiết kế, implementation, test và cập nhật plan). Thiết kế ban đầu bởi: AI theo
  giao việc Owner (gói `QĐ-93`, 01/11/2026).
- Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; ngưỡng vỏ ZIP mới (4/8 MiB, đếm phần tử) chờ xác nhận; chưa review
  toàn spec. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

- Quyền chạy test (Owner 01/11/2026, `D-S26`): được tự chạy `pnpm typecheck`/`pnpm lint`/`pnpm arch:check`/`pnpm rules:check`,
  unit test (`pnpm test -- <file>`) và integration/HTTP test **theo file đã sửa** (`pnpm test:integration -- <file>`,
  `pnpm test:http -- <file>`), và `pnpm check`; **phải hỏi Owner trước** khi chạy toàn bộ `pnpm test:integration`,
  `pnpm test:e2e` hoặc `pnpm test:integration:timing`.
- Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/module-structure.md` (policy liên module ở `public/`, `src/infrastructure`),
  `docs/rules/security-jobs.md` (upload), `docs/rules/api-contract.md` (mã lỗi, ví dụ), `test/README.md`.
- Thứ tự merge (gói `QĐ-93`, một hạng mục một lần, rebase lên `dev` trước merge): W4, **sau** PR A–D của
  `qd93-unplaced-employee-first-placement` (W3). Phase A và B không cần hạng mục 6 về chức năng (làm song song được), nhưng
  chạm cùng `employee-import-row-validation.policy.ts`, `employee-manual.service.ts`, `employee.repo.ts` — rebase sau khi PR của
  hạng mục 6 merge; Phase C (tệp mẫu có dòng không phòng, `FILE_MISSING_COLUMNS ['employee_code']`) cần cột phòng tùy chọn
  của hạng mục 6 đã có trên `dev`.
- Migration: lát này **không** có migration. Nếu phát sinh, timestamp thật đặt khi tạo thư mục, đặt lại sau migration mới
  nhất trên `dev` trước merge và thêm vào `scripts/verify/merged-migrations.txt`.
- OQ-1 → OQ-5 của spec đã được Owner duyệt 01/11/2026 (gồm OQ-2 — thêm `exceljs` 4.4.0 trước Phase B, OQ-5 — Task A.4 bắt
  buộc); đọc lại `US-02-02` AC-23 ở Docs (vế import đang viết lại theo OQ-4).
- Kiểm lại phiên bản `exceljs` trên npm (`npm view exceljs version time license`) và changelog; ghim chính xác.
- Database test riêng theo `test/README.md`.

## Tasks

### Phase A — Format mã (không dependency mới)

### Task A.1: Policy mã dùng chung (test trước)

- Files: `src/modules/organization/public/organization-code.policy.ts`, `organization-code.policy.spec.ts` (bảng ca của
  `US-02-02` AC-23 và `US-03-06` AC-25, ASCII trước khi đổi hoa, độ dài biên 2/3/20/21),
  `test/gates/policy-ownership.gate-spec.ts` (`PUBLIC_ROOT_POLICY_FILES` thêm file).
- Depends on: none.
- Acceptance: spec đỏ trước, xanh sau; policy thuần.
- Verify: `pnpm test -- src/modules/organization/public/organization-code.policy.spec.ts` → xanh; `pnpm test:gates` → xanh.

### Task A.2: Tạo phòng theo format mới; tra phòng chuẩn hóa

- Files: `src/modules/organization/department/department.errors.ts` (`DepartmentCodeInvalidError`),
  `department/department.repo.ts` (kiểm trùng `upper(code)`; `lockByCode` tra chuẩn hóa: khớp đúng rồi khớp một
  `upper(code)`), `department-management/department.dto.ts` (`code: z.string().max(100)` + `description`; bỏ import
  `COST_CENTER_CODE_*`), `department-management/department.service.ts` (chuẩn hóa, kiểm format, lưu chuẩn hóa),
  `department-management/department.http-errors.ts` (422 `DEPARTMENT.CODE_INVALID`, ví dụ),
  `department-management/departments.controller.ts` (khai 422 mới), `department.service.spec.ts`,
  `test/integration/organization/department-profile-http.integration-spec.ts` (ca AC-25),
  `test/http/organization/departments.http-spec.ts` (PATCH kèm `code` ⟹ 422),
  `test/support/openapi-example-route-codes-organization.ts` (`departmentCreate` 422 thêm `DEPARTMENT.CODE_INVALID`),
  `test/integration/catalog/subscription-owner-assignment-cli.integration-spec.ts` (`--department-code p-des` khớp `P-DES`;
  hai phòng cũ `p-x`/`P-X` ⟹ `DEPARTMENT_NOT_ACTIVE`), `src/modules/catalog/README.md` (lệnh tra mã phòng chuẩn hóa).
- Depends on: Task A.1.
- Acceptance: ca AC-25 và `lockByCode` dùng chung của test matrix xanh; mã cũ trong dữ liệu test không đổi.
- Verify: `pnpm test -- src/modules/organization/department-management`;
  `pnpm test:integration -- test/integration/organization/department-profile-http.integration-spec.ts test/integration/catalog/subscription-owner-assignment-cli.integration-spec.ts`
  → xanh; `pnpm test:http -- test/http/organization/departments.http-spec.ts` → xanh.

### Task A.3: Mã nhân viên ở nhập tay và dòng import

- Files: `src/modules/organization/employee/employee-row.policy.ts` (+ spec; lý do `EMPLOYEE_CODE_INVALID`),
  `employee/employee-manual.service.ts` (chuẩn hóa, lưu chuẩn hóa, so `OWN_RECORD` chuẩn hóa), `employee/employee.repo.ts`
  (`isCodeTaken` theo `upper`), `employee/employee.dto.ts` (`max(100)` + `description`), `employee/import-lookup.repo.ts` (tra
  người và phòng theo mã chuẩn hóa, trả cả mã đã lưu để ưu tiên khớp đúng),
  `src/modules/data-import/employee-import/row-validation/employee-import-row-validation.policy.ts` (thứ tự ở spec; so trùng
  trong tệp chuẩn hóa; `EMPLOYEE_CODE_AMBIGUOUS`; so mã phòng không phân biệt hoa thường), spec của nhóm row-validation
  (`employee-import-row-validation.policy.spec.ts`, `-parity.policy.spec.ts`; ca `EMPLOYEE_CODE_AMBIGUOUS` hai người cũ
  `emp9`/`Emp9`), `test/integration/organization/employee-manual-http.integration-spec.ts` (`NV_13`, `nv-0012`, `EMP1` khi đã
  có `emp1`), `test/integration/data-import/employee-import-preview-http.integration-spec.ts` (ca AC-23, OQ-4, OQ-1,
  `EMPLOYEE_CODE_AMBIGUOUS`).
- Depends on: Task A.2.
- Acceptance: các ca `US-02-02` AC-14 (vế mã), AC-23, `EMPLOYEE_CODE_AMBIGUOUS` của test matrix xanh; parity nhập tay ↔ import
  (`-parity.policy.spec.ts`) giữ một lý do cho cùng mã sai.
- Verify: `pnpm test -- src/modules/organization/employee src/modules/data-import/employee-import/row-validation` → xanh;
  `pnpm test:integration -- test/integration/organization/employee-manual-http.integration-spec.ts test/integration/data-import/employee-import-preview-http.integration-spec.ts`
  → xanh.

### Task A.4 (OQ-5): Lệnh khởi tạo dùng format mới

- Files: `src/modules/installation/installation.dto.ts` (`code` của phòng đầu và mã Super Admin dùng policy mã; chuẩn hóa),
  `src/modules/installation/installation.dto.spec.ts`, `src/cli/bootstrap/bootstrap.arguments.ts`,
  `docs/guides/bootstrap-installation.md` (ví dụ mã).
- Depends on: Task A.1.
- Acceptance: `bootstrap` chuẩn hóa mã phòng đầu và mã Super Admin, từ chối mã sai format với thông điệp rõ (OQ-5 = có, Owner
  duyệt 01/11/2026).
- Verify: `pnpm test -- src/modules/installation/installation.dto.spec.ts`;
  `pnpm test:integration -- test/integration/installation/installation.integration-spec.ts test/integration/installation/installation-minimal-env.integration-spec.ts`
  → xanh.

### Checkpoint Phase A

`pnpm check`; `pnpm test:http -- test/http/organization/departments.http-spec.ts test/http/organization/employees.http-spec.ts`;
integration theo file của Task A.2–A.4 (lệnh Verify ở trên) xanh; `pnpm openapi:export` diff chỉ ở `departmentCreate`,
`employeeCreate` (mô tả, mã lỗi).

### Phase B — Đọc `.xlsx`

### Task B.1: Thêm dependency `exceljs`

- Files: `package.json` (`"exceljs": "4.4.0"` ở `dependencies`), `pnpm-lock.yaml`, `pnpm-workspace.yaml` (chỉ nếu pnpm báo
  script build mới — mặc định **từ chối**, ghi lý do).
- Depends on: Checkpoint Phase A (OQ-2 đã được Owner đồng ý 01/11/2026).
- Acceptance: cài lại sạch (`pnpm install --frozen-lockfile`) không chạy script mới; `pnpm audit --prod` không có lỗ hổng
  cao/nghiêm trọng chưa xử lý trên đường chạy (ghi kết quả và các cảnh báo deprecated của cây phụ thuộc vào bảng
  verification); gate `deployment-roles` xanh.
- Verify: `pnpm install --frozen-lockfile`; `pnpm audit --prod`; `pnpm test:gates` → xanh.

### Task B.2: Kiểm vỏ ZIP và nội dung đã giải nén (test trước)

- Files: `src/infrastructure/spreadsheet/zip-container.ts` (EOCD duy nhất, không dữ liệu thừa đầu/cuối, mục liền nhau không
  chồng, Local Header khớp Central Directory, tên mục không trùng/không `..`; ZIP64/mã hóa/phương thức/200 mục; giải nén thật
  ≤ 4 MiB mỗi mục, ≤ 8 MiB tổng, đúng kích thước và CRC; đếm `<row`/`<c`/`<si`; `<!DOCTYPE`, `vbaProject.bin`),
  `zip-container.spec.ts`, `spreadsheet.errors.ts`, `test/support/zip-fixtures.ts` (dựng ZIP thử, gồm các biến thể cấu trúc
  lệch).
- Depends on: Task B.1.
- Acceptance: các dòng "bảo mật `.xlsx`" (nén/khai, cấu trúc, số phần tử) của test matrix xanh; không cấp phát vượt
  `maxOutputLength`; tệp `.xlsx` hợp lệ do `exceljs`, Excel và LibreOffice ghi (bộ mẫu nhỏ trong test) vẫn qua.
- Verify: `pnpm test -- src/infrastructure/spreadsheet/zip-container.spec.ts` → xanh.

### Task B.3: Đọc sheet đầu thành hàng ô chữ

- Files: `src/infrastructure/spreadsheet/xlsx-table.ts` (gọi `zip-container` trước `Workbook.xlsx.load`), `xlsx-table.spec.ts`
  (đổi ô, hàng trống, giới hạn, sheet đầu; `load` không được gọi khi vỏ ZIP bị từ chối).
- Depends on: Task B.2.
- Acceptance: các dòng "không phải workbook" → "giới hạn" của test plan xanh; trả cùng kiểu hàng với `parseCsvRows`.
- Verify: `pnpm test -- src/infrastructure/spreadsheet` → xanh.

### Task B.4: Import nhận `.xlsx`

- Files: `src/modules/data-import/employee-import/preview/employee-import-file.policy.ts` (nhận diện nội dung, async, ánh xạ
  lỗi `SpreadsheetError` như `CsvError`), `preview/employee-import-file.policy.spec.ts`,
  `preview/employee-import-preview.service.ts` (await), `employee-import.errors.ts` (`FILE_FORMAT_UNSUPPORTED`),
  `employee-import.http-errors.ts` (ví dụ mới), `employee-imports.controller.ts` (mô tả "CSV hoặc `.xlsx` (sheet đầu)", ví dụ
  422), `test/http/data-import/employee-imports.http-spec.ts` (dòng "qua HTTP" của test plan),
  `test/support/openapi-example-route-codes-data-import.ts`, `src/modules/data-import/README.md`.
- Depends on: Task B.3.
- Acceptance: tệp `.xlsx` đi qua đúng các bước preview/xác nhận hiện có; tệp độc hại bị từ chối mức tệp; CSV không đổi hành vi.
- Verify: `pnpm test -- src/modules/data-import/employee-import/preview`; `pnpm test:http -- test/http/data-import/employee-imports.http-spec.ts`
  → xanh; `pnpm openapi:export`.

### Checkpoint Phase B

`pnpm check`; `pnpm test:http -- test/http/data-import/employee-imports.http-spec.ts test/http/platform/openapi-presentation.http-spec.ts`;
`pnpm test:integration -- test/integration/data-import/employee-import-preview-http.integration-spec.ts test/integration/data-import/employee-import-confirm-http.integration-spec.ts test/integration/data-import/employee-import-wire-http.integration-spec.ts`
xanh; tự review theo bảo mật upload.

### Phase C — Tệp mẫu và đối chiếu CSV ↔ `.xlsx`

### Task C.1: Script sinh tệp mẫu và sinh lại `docs/examples/employee-import/`

- Files: `scripts/dev/generate-employee-import-examples.ts` (mới; dòng mẫu khai báo một lần, header từ `EMPLOYEE_COLUMNS`,
  mã/email nền đọc từ `SHARED_DEMO_V1` của `src/cli/demo-dataset/fixture/shared-demo-v1.ts`; mã `IMP-V*`/`IMP-X*`; CSV UTF-8 có
  BOM; thời điểm workbook và ngày mục ZIP cố định), `scripts/README.md` (một dòng mô tả script), `docs/examples/employee-import/`
  (xóa `employees-15.csv`, `employees-15.xlsx`, `employees-invalid.csv` cũ; tạo `employee-template.csv`,
  `employee-template.xlsx`, `employees-valid.csv`, `employees-valid.xlsx`, `employees-invalid.csv`, `employees-invalid.xlsx`,
  `employees-missing-column.csv`, `README.md`, `expected-results.json` theo spec).
- Depends on: Checkpoint Phase B; PR A–D của `qd93-unplaced-employee-first-placement` đã trên `dev`.
- Acceptance: tệp mẫu theo header mới; README nêu cột, bí danh, format mã, ngày `YYYY-MM-DD`, bốn loại nhân sự, phòng/chức
  vụ/email tùy chọn, dữ liệu nền `shared-demo-v1`, cách thử trên FE ("xem trước rồi hủy" để chạy lặp; xác nhận tạo người vĩnh
  viễn), không có ca `DEPARTMENT_INACTIVE` và lý do; sinh lại không đổi byte nào.
- Verify: `pnpm exec ts-node scripts/dev/generate-employee-import-examples.ts` chạy hai lần rồi
  `git diff --exit-code docs/examples/employee-import` → rỗng (cả `.xlsx`); 3 byte đầu mỗi CSV là `EF BB BF`.

### Task C.2: Test đối chiếu tệp mẫu và parity `US-02-01` AC-11

- Files: `test/integration/data-import/employee-import-examples.integration-spec.ts` (mới; dữ liệu nền dựng từ `SHARED_DEMO_V1`
  bằng `test/support/employee-import-http-harness.ts` — chỉ ba phòng và nhân viên README cần), `test/support/employee-import-http-harness.ts`
  (helper dựng dữ liệu nền).
- Depends on: Task C.1.
- Acceptance: các dòng "Tệp mẫu" của test plan xanh; preview CSV và `.xlsx` của cùng dữ liệu bằng nhau; xác nhận bộ hợp lệ tạo
  15 người, 3 _chưa xếp phòng_, mã đã chuẩn hóa.
- Verify: `pnpm test:integration -- test/integration/data-import/employee-import-examples.integration-spec.ts` → xanh.

### Checkpoint Phase C

`pnpm check`; `pnpm test:http -- test/http/data-import/employee-imports.http-spec.ts test/http/organization/departments.http-spec.ts test/http/organization/employees.http-spec.ts`;
integration theo file của Task A.2–A.4 và C.2 (lệnh Verify ở trên); `pnpm openapi:export` xanh; tự review theo mọi AC của
bảng Primary.

## Verification and handoff

Chạy từ gốc BE: `pnpm check`, `pnpm openapi:export`, HTTP và integration theo file đã sửa (danh sách ở các checkpoint),
`pnpm audit --prod`. Full `pnpm test:integration` trước handoff: **hỏi Owner trước** (`D-S26`).

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| chưa chạy          | —                     | —                 | thiết kế `draft`        |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test plan phản ánh đúng implementation cuối; phiên bản `exceljs` và kết quả audit ghi lại.
- [ ] Diff cuối đã tự review; module card và README tệp mẫu cập nhật; FE được báo mã lỗi mới và tệp mẫu.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.

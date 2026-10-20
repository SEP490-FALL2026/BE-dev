# Spec: BEH.1 — Employee Row Validation Ownership (A4-11)

- Phụ trách: AI theo giao việc Owner (Prompt 25, 20/10/2026).
- Thiết kế ban đầu bởi: Owner — finding A4-11 của
  [audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md), bảng D-1 → D-4 của
  [H8](../h8-data-import-wave/spec.md#beh1--characterization-hai-đường-kiểm-dòng-a4-11), quyết định kỹ thuật của Owner
  trong Prompt 25 (giữ D-1 → D-4, chỉ dùng chung quyết định đủ điều kiện của phòng/chức vụ).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (`US-02-02` AC-14, `US-02-03` AC-1/AC-5, `US-02-07` AC-7, `US-04-09` AC-3; `EP-02.md` sửa lần
  cuối ở `73e7379`), BE `3a3db73` (`dev` = `origin/dev`, commit Prompt 24 của Owner). Không ADR mới; H7 hoãn.
- Nhóm roadmap: hardening sau audit H4.0 — chỉ là container, không phải ranh giới (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Form nhập tay nhân viên và bản xem trước import quyết định **cùng một chỗ** khi phòng ban (kèm Cost Center) và chức vụ mà
một dòng nêu có đủ điều kiện nhận người hay không. Hai đường không còn chép lại thang lý do `DEPARTMENT_*`/`JOB_TITLE_*`,
nên một quy tắc mới về phòng/chức vụ không thể chỉ đổi ở một đường. Mọi khác biệt H8 đã characterize (D-1 → D-4) giữ
nguyên; người dùng, HTTP, file import, preview đã lưu và audit không thấy gì đổi.

## Sizing decision

- Container: BEH.1 (A4-11)
- Mode: `technical-enabler`
- Outcome and owner: một policy thuần duy nhất cho quyết định đủ điều kiện của Department/Cost Center/Job Title, owner
  `organization`; adapter nhập tay (`organization/employee/`) và import (`data-import/employee-import/`) giữ phần của mình.
- Boundaries: không đổi HTTP status/envelope lỗi, schema DB, định dạng file, hình dạng preview đã lưu, ngữ nghĩa audit,
  OpenAPI; không đổi mã lý do, thứ tự hay nơi của lý do ở đường nào.
- Không phải thay đổi hành vi: Docs không đòi D-1 → D-4 giống nhau. `US-02-02` AC-14 đòi form từ chối "với cùng lý do như
  dòng import tương ứng" — tức cùng **mã**, hai đường đã cho (9 ca giống của H8) và giữ; cùng AC tách riêng "mã đã thuộc
  một nhân viên ⟹ từ chối" khỏi import (D-2, `US-02-02` AC-10 nhập lại); `US-02-03` báo lỗi "ở đúng cột" và "chức vụ đã
  ngừng dùng (chỉ cho dòng tạo mới)" (D-1, D-2). Không AC nào quy định thứ tự lý do giữa hai đường (D-3).
- Not larger: H7, G3–G10; kiểm tra so khớp fixture của `dev:seed` (`SeedConflict`, P23-RV-01) và lý do
  `ProjectInvalidError('DEPARTMENT_NOT_FOUND')` là quyết định khác (so fixture, phòng của dự án), không phải điều kiện nhận
  người — giữ nguyên, ghi ngoại lệ chính xác trong gate.
- Not smaller: policy, hai adapter, registry hợp đồng và gate phải đổi cùng nhau; tách ra thì có lúc tồn tại bản sao
  hoặc đường import không qua policy.
- Siblings: không.
- Scope map: n/a — technical enabler ngoài nhóm G; không claim Story/AC mới.

## Primary Story/AC

| Story | AC                                                   | Coverage | Phần còn lại thuộc                                                                                         |
| ----- | ---------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| —     | A4-11: một chủ sở hữu cho điều kiện phòng/chức vụ    | n/a      | gỡ chặn lát G sau thêm quy tắc phòng/chức vụ (chưa có hạng mục đặt tên)                                    |
| —     | giữ `US-02-02` AC-14, `US-02-03` như H8 characterize | n/a      | hành vi đã nghiệm thu ở `g2-job-title-catalogue-and-manual-employee`, `g2-employee-import-preview-confirm` |

## Supporting references

- [Audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md) mục 4 (A4-11), 9.6 (BEH.1).
- [H8 Data Import Wave](../h8-data-import-wave/spec.md) (D-1 → D-4, spec characterization 13 ca).
- [Nhập tay nhân viên](../g2-job-title-catalogue-and-manual-employee/spec.md) (T-16),
  [import preview/confirm](../g2-employee-import-preview-confirm/spec.md).
- [Module structure](../../../rules/module-structure.md) (bề mặt công khai, ROOT-HARDEN.1), [test guide](../../../../test/README.md).

## Explicit out of scope

- Làm D-1 → D-4 giống nhau; đổi mã, field/column, thứ tự, lý do riêng của import, `EXISTS_*`.
- `dev:seed` (`installation/dev-seed`) và `project` — quyết định khác, chỉ ghi ngoại lệ chính xác ở gate.
- HTTP, DB, file import, preview đã lưu, audit, OpenAPI; H7, G3–G10.

## Dependencies and blockers

- Đầu vào: Prompt 24 ở `3a3db73` (Owner commit/push), `dev` = `origin/dev`, cây sạch. Docs có ba path chưa commit của
  Owner (`CI-CD/deployment.md`, một tệp Draw.io và tệp sao lưu `.bkp` của draw.io) — giữ nguyên, lát này không sửa Docs.
- Không blocker. Integration cần PostgreSQL cô lập theo [test guide](../../../../test/README.md).

## Ownership: module, data, API

| Phần                                         | Chủ                                                 | Sở hữu                                                                                                                                   |
| -------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Policy `employee-placement.policy.ts`        | `organization` (Department, Cost Center, Job Title) | `placementReasons`: bắt buộc, không tìm thấy, ngừng dùng, Cost Center ngừng dùng và thứ tự phòng → chức vụ; trả `{ subject, code }`      |
| Adapter nhập tay `employee-row.validator.ts` | `organization/employee`                             | phát hiện ô trống của form, `field` (`departmentCode`/`jobTitleId`), `EMPLOYEE_CODE_TAKEN`, `WORK_EMAIL_TAKEN` sau phòng/chức vụ         |
| Adapter import `employee-import-rows.ts`     | `data-import/employee-import`                       | làm sạch ô, `column` (`department_code`/`job_title`), trùng trong file, mã/họ tên/email/loại/ngày, `EXISTS_*`, thứ tự riêng, preview lưu |

Không bảng, migration, token hay operation mới. Hợp đồng liên module mới đúng **một** tệp: `organization/employee-placement.policy.ts`
đăng ký chính xác trong `PUBLIC_ROOT_POLICY_FILES` (cùng danh sách ở `architecture-boundaries.spec.ts`,
`architecture-structure.spec.ts` và gate `src/policy-ownership.spec.ts`, có ca kiểm ba danh sách bằng nhau) kèm danh sách
consumer chính xác; không hậu tố `*.policy.ts` nào tự mở, không thư mục `shared/common/utils`, không export repo.

## Behavior and design

- **Hợp đồng:** `placementReasons(facts: PlacementFacts): PlacementReason[]`, thuần, không I/O.
  `PlacementFacts = { department: { named: boolean; found: { active; costCenterActive } | null }; jobTitle: { named;
found: { active } | null } }` — model trung tính: không DTO HTTP, tên cột CSV, row Prisma hay repo. Kết quả
  `{ subject: 'DEPARTMENT' | 'JOB_TITLE'; code }` với `code` ∈ `DEPARTMENT_REQUIRED`, `DEPARTMENT_NOT_FOUND`,
  `DEPARTMENT_INACTIVE`, `DEPARTMENT_COST_CENTER_INACTIVE`, `JOB_TITLE_REQUIRED`, `JOB_TITLE_NOT_FOUND`,
  `JOB_TITLE_INACTIVE`; tối đa một lý do mỗi subject, phòng trước chức vụ; ưu tiên trong subject: bắt buộc → không tìm
  thấy → ngừng dùng → Cost Center ngừng dùng. `subject` là ngữ nghĩa, không phải vị trí trình bày.
- **D-1:** adapter nhập tay đổi `subject` thành `field` `departmentCode`/`jobTitleId`; adapter import thành `column`
  `department_code`/`job_title`.
- **D-2:** nhập tay luôn gọi policy rồi thêm `EMPLOYEE_CODE_TAKEN` nếu mã đã có; import trả `EXISTS_SAME`/`EXISTS_DIFFERENT`
  cho người đã có **trước** khi gọi policy (không kiểm phòng/chức vụ của họ, không coi là lỗi người mới).
- **D-3:** nhập tay: lý do policy rồi `EMPLOYEE_CODE_TAKEN`, `WORK_EMAIL_TAKEN`; import: lỗi mã/họ tên/email/loại/ngày
  trước, lý do policy sau.
- **D-4:** `EMPLOYEE_CODE_REQUIRED`, `EMPLOYEE_CODE_DUPLICATE_IN_FILE`, `FULL_NAME_REQUIRED`, `WORK_EMAIL_INVALID`,
  `WORK_EMAIL_DUPLICATE_IN_FILE`, `WORK_EMAIL_TAKEN` (import), `EMPLOYMENT_TYPE_INVALID`, `HIRE_DATE_INVALID`, phân tích file
  và cột thuộc import.
- **Rule:** "validation dùng chung" là dùng chung **policy ngữ nghĩa**; vị trí transport/file và lý do riêng của
  workflow ở adapter/capability (Đúng/Sai/Lách sai ở `module-structure.md`).

## Test matrix

| AC / rủi ro             | Tình huống                                                                            | Cấp test                                         | Kết quả mong đợi                | Bằng chứng sau implement |
| ----------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------- | ------------------------ |
| Policy                  | 7 lý do, ưu tiên trong subject, phòng trước chức vụ, `named: false` bỏ qua `found`    | unit `employee-placement.policy.spec.ts`         | literal, không tính bằng helper | plan                     |
| D-1 → D-4               | 13 ca characterization H8 không đổi + adapter literal                                 | unit parity, validator, rows                     | giữ nguyên                      | plan                     |
| Chỉ một chủ sở hữu      | literal lý do ngoài policy; consumer chính xác; import private; ba registry bằng nhau | gate `src/policy-ownership.spec.ts` + boundaries | đột biến đỏ                     | plan                     |
| Không đổi hành vi       | corpus 1500 ca nhập tay + 3360 dòng import (riêng, một file, khóa riêng)              | script so trước/sau                              | byte-identical                  | plan                     |
| Không đổi wire/DB/audit | nhập tay + import qua HTTP, PostgreSQL thật; `openapi.json`                           | integration, e2e, export                         | xanh; OpenAPI byte-identical    | plan                     |

## Definition of Done

- [x] Không còn thang lý do phòng/chức vụ chép lại; hai adapter tiêu thụ policy (consumer test chính xác).
- [x] D-1 → D-4 vẫn characterize (13 ca nguyên văn) và corpus byte-identical; `openapi.json` byte-identical.
- [x] Không cạnh private liên module, không ngoại lệ public rộng; rule + ví dụ ở `module-structure.md`.
- [x] Metadata (H8, item, index, roadmap, tracker) khớp; full gate xanh; kiểm kê tài nguyên cuối 0.

## Changes and acceptance

20/10/2026 — lập theo Prompt 25 trên `3a3db73`. Owner review chưa có; chưa nghiệm thu.

20/10/2026 — `verified` local (bằng chứng ở [plan](plan.md#verification-and-handoff)); A4-11 khép. Không đổi thiết kế so
với spec.

20/10/2026 — sau review: chỉ sửa chú thích đầu `employee-import-rows.validation-parity.spec.ts` (bỏ tên dự kiến
`beh1-employee-row-validation-alignment`; ghi rằng Prompt 25 chỉ dùng chung policy ngữ nghĩa và cố ý giữ H8 D-1 → D-4).
Cả 13 ca, fixture và kỳ vọng không đổi; không đổi code, gate, OpenAPI hay hành vi.

# Spec: Bỏ căn cứ HR ở thao tác ghi cơ cấu tổ chức và hồ sơ (`QĐ-93f`), căn chỉnh OpenAPI phòng ban (`API-DOC-F05`)

- Phụ trách: chưa phân công (người/AI nhận implement sở hữu cả thiết kế, test và bằng chứng).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (gói `QĐ-93`, 01/11/2026).
- Thiết kế: `draft`. Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec.
- Nguồn: Docs `69e8a3d` (BRD v3.58 `FR-2.1`, `FR-3.1`, `FR-8.3`, `INV-05`; User Stories regenerated — 143 Story / 1 586 AC:
  `US-02-02` AC-1, AC-10, AC-13, AC-14, AC-16, AC-19; `US-02-03` AC-7; `US-02-04` AC-4; `US-03-06` AC-1, AC-22;
  `US-01-11` AC-7; quyết định `QĐ-93f`, giữ `QĐ-87b`(2), `QĐ-87c`(4)), BE `1a77ffe8`. Finding `API-DOC-F05` từ
  `Docs/Figma UI-UX/API-Integration/changes/CHANGELOG.md` (Docs `69e8a3d`, dòng 143).
- Bổ sung sau pin: D-S17…D-S26 (Docs chưa commit) — Owner 01/11/2026; lát này áp `D-S26` (quyền chạy test) và thứ tự merge
  của đợt sửa sau audit (merge **đầu tiên** ở W1).
- Nhóm roadmap: G2 — chỉ là planning container, không phải phạm vi (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này Super Admin tạo/sửa/ngừng phòng, gán/để trống trưởng phòng, chỉ định/bỏ người kế nhiệm, đổi IT Admin phụ
trách, nhập tay/sửa hồ sơ nhân viên và xác nhận import **mà không gửi trường căn cứ nào**; Audit Trail vẫn ghi người thực
hiện, thời điểm, trước/sau (không còn khóa `hrBasis` trong bản ghi mới); sự kiện nhân sự (điều chuyển, nghỉ dài, bàn
giao/nghỉ việc, ghi từ `BM-09`) và lệnh vận hành `ops:record-super-admin-event` vẫn bắt buộc căn cứ — kiểm bằng test HTTP,
integration và diff `openapi.json`. Cùng lát, OpenAPI của `departmentUpdate`/`departmentHeadAssign`/
`departmentSuccessorDesignate` khai đúng 409 `DEPARTMENT.INACTIVE`, giới hạn tên/chức năng phòng trong schema bằng giới
hạn thật và chức năng phòng quá dài không còn trả `DEPARTMENT.NAME_INVALID`.

## Sizing decision

- Container: G2 (nhóm giao việc, không phải ranh giới hạng mục) và gói quyết định `QĐ-93` của Owner ngày 01/11/2026.
- Mode: `grouped-stories`.
- Outcome and owner: thao tác ghi tổ chức/hồ sơ của Super Admin không còn thu căn cứ; capability
  `organization/department-management`, `organization/employee`, `data-import/employee-import` (chỉ lớp DTO/audit).
- Boundaries: không đổi transaction, khóa, bảng hay migration; đổi wire request của 10 operation còn sống (2 operation
  `/projects` bị xóa ở `qd93-remove-department-projects`), payload audit mới, OpenAPI. Quyền giữ nguyên (`SUPER_ADMIN`).
- Not larger: tùy chọn phòng/xếp phòng lần đầu (`qd93-unplaced-employee-first-placement`), format mã và `.xlsx`
  (`qd93-code-format-xlsx-employee-import`), xóa dự án (`qd93-remove-department-projects`) đổi hành vi nghiệp vụ khác và có
  test matrix riêng; vai `MANAGER`/Người duyệt chi gán trực tiếp (`QĐ-93a`/`QĐ-93b`) thuộc hạng mục khác của gói.
- Not smaller: một quyết định (`QĐ-93f`) bỏ cùng một value object `HrBasis` khỏi cùng một DTO dùng chung
  (`hr-basis.dto.ts`); tách theo Story sẽ để lại kiểu/DTO dở dang giữa các lát và phải sửa cùng các harness test
  (`department-harness.ts`, `hr-basis.ts`) nhiều lần.
- Siblings: `qd93-remove-department-projects` (sau lát này, xóa nốt `hrBasis` cùng `/projects`),
  `qd93-unplaced-employee-first-placement`, `qd93-code-format-xlsx-employee-import`, `employee-directory-read`.
- Scope map: [G2](../../../roadmap.md#work-item-decomposition-g2).

## Size exception

- Cohesion: năm Story chỉ chung **một** thay đổi: bỏ trường `hrBasis` khỏi request và khỏi `after` của audit ở mọi thao tác
  ghi tổ chức/hồ sơ; không Story nào có hành vi khác ngoài "không thu căn cứ" và các AC giữ căn cứ cho sự kiện nhân sự.
- Why not split: các Story dùng chung `hrBasisSchema`, `HrBasis` và cùng harness (`department-harness.ts` tự gắn căn cứ cho
  mọi request `/departments`, `test/support/hr-basis.ts` dùng ở 28 file); tách năm hạng mục buộc giữ kiểu cũ song song tới
  lát cuối và chạy lại cùng bộ integration năm lần.
- Checkpoints: Phase 1 (phòng ban, trưởng phòng, kế nhiệm, IT Admin phụ trách + `API-DOC-F05`) và Phase 2 (hồ sơ nhân
  viên, import, xóa DTO/kiểu dùng chung) trong [plan](plan.md), mỗi phase kết thúc bằng checkpoint gate xanh. Hai phase là
  checkpoint nội bộ của **một** PR và **một** release: không deploy Phase 1 riêng (OD-1 = A strict — FE đổi cả 10 body
  cùng một lần; deploy một nửa làm FE gửi `hrBasis` ở nửa này và thiếu ở nửa kia).
- Maximum scope: chỉ bỏ căn cứ và căn chỉnh OpenAPI/zod của `API-DOC-F05`; **không** thêm tùy chọn phòng, format mã,
  `.xlsx`, xóa dự án, đổi quyền, đổi `grounds` của personnel hay đổi lệnh vận hành.
- Accepted by: Owner 01/11/2026 — duyệt thiết kế chia việc `QĐ-93` (Docs `69e8a3d`, _Người quyết_ của `QĐ-93`); review
  toàn spec còn chờ.

## Primary Story/AC

| Story    | AC                                      | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                                                                                             |
| -------- | --------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-02-02 | AC-1, AC-10, AC-13, AC-14, AC-16, AC-19 | partial  | AC-14 vế không chọn phòng, AC-16 vế xếp phòng lần đầu, AC-2, AC-7, AC-20, AC-21: `qd93-unplaced-employee-first-placement`; AC-14 vế mã, AC-23: `qd93-code-format-xlsx-employee-import`; AC-22, AC-24→AC-26: `employee-directory-read`; vế đã giao trước `QĐ-93`: `g2-employee-intake-by-super-admin`, `g2-employee-official-field-maintenance` |
| US-02-03 | AC-7                                    | partial  | vế phòng chưa có Cost Center: `g2-department-profile`; AC-1, AC-2, AC-4, AC-8: `qd93-unplaced-employee-first-placement`                                                                                                                                                                                                                        |
| US-02-04 | AC-4                                    | partial  | AC-1→AC-3, AC-6: `g2-onboarding-checklist` (giao trước GOV.1)                                                                                                                                                                                                                                                                                  |
| US-03-06 | AC-1, AC-22                             | partial  | AC-22 vế đã giao: `g2-department-profile`; AC-25: `qd93-code-format-xlsx-employee-import`; AC khác: `g2-department-profile`, `g2-g4-unit-only-cost-attribution`                                                                                                                                                                                |
| US-01-11 | AC-7                                    | partial  | AC-1→AC-6, AC-8→AC-10: `g4-provisioning-queue-manual`, `g2-department-profile` (giao trước GOV.1)                                                                                                                                                                                                                                              |

Mỗi AC ở cột 2 sở hữu ở đây **vế `QĐ-93f`** (không thu, không lưu căn cứ; Audit Trail vẫn đủ) và test của vế giữ căn cứ
cho sự kiện nhân sự (`US-02-02` AC-16, `US-03-06` AC-22 vế sau). Dòng nào cũng `partial` vì Story có AC khác ở hạng mục
khác. Các dòng tương ứng đã có trong scope map G2 của roadmap (xem `## Changes and acceptance`).

## Supporting references

- `QĐ-93f`(1)–(3); `QĐ-87b`(2) (căn cứ của sự kiện nhân sự, `BM-09` không bao giờ là căn cứ), `QĐ-87c`(4) (thủ tục sửa hồ
  sơ của chính Super Admin ngoài luồng thường — không đổi).
- `FR-8.3`, `INV-05` (Audit Trail bất biến: người thực hiện, thời điểm, trước/sau).
- `US-03-01` AC-18, `US-03-03` AC-5, `US-03-04` AC-23 (căn cứ vẫn bắt buộc — chỉ chạy lại test, không đổi code).
- Hạng mục bị **thay thế một phần** (không sửa file của chúng ở lát này; lịch sử giữ nguyên):
  [g2-employee-intake-by-super-admin](../g2-employee-intake-by-super-admin/spec.md) (vế "căn cứ HR bắt buộc" của
  `QĐ-82i`, value object `HrBasis`), [g2-employee-official-field-maintenance](../g2-employee-official-field-maintenance/spec.md)
  (vế căn cứ khi sửa hồ sơ), [g2-department-profile](../g2-department-profile/spec.md) (vế căn cứ của thao tác phòng ban
  `QĐ-87b`(1)), [g2-employee-import-preview-confirm](../g2-employee-import-preview-confirm/spec.md) (căn cứ khi xác nhận
  import).
- Finding `API-DOC-F05` (CHANGELOG API-Integration Docs `69e8a3d`): `departmentUpdate`, `departmentHeadAssign` trả 409
  `DEPARTMENT.INACTIVE` nhưng OpenAPI không khai; `departmentUpdate` trả `DEPARTMENT.NAME_INVALID` cả khi chức năng quá
  1 000 ký tự; giới hạn thật (tên 200, chức năng 1 000) chặt hơn schema (1 000, 5 000). Kiểm lại ở BE `1a77ffe8`:
  `department.service.ts:25-26,221,228`, `department.dto.ts:12-13,24-25`, `department-head.service.ts:87,195,275-279`
  (cả `departmentSuccessorDesignate` cũng ném `DepartmentInactiveError`).

## Explicit out of scope

- `grounds` của sự kiện nhân sự (`personnel/*`: điều chuyển, nghỉ dài, bàn giao/nghỉ việc, ghi nhận `BM-09`) — giữ nguyên
  shape và bắt buộc.
- Lệnh vận hành `pnpm ops:record-super-admin-event` (mọi mode, gồm `profile-correct` — `QĐ-87c`(4)): giữ `EventBasis`
  (`src/modules/personnel/public/super-admin-event.types.ts:22-27`) và khóa audit `hrBasis` của
  `profile-correction.service.ts:70` như hiện có. Hai kiểu này đã độc lập với `HrBasis` HTTP; xóa DTO HTTP không chạm CLI.
- `/projects` (`POST`, `PATCH` — hai trong 12 endpoint của lệnh giao việc): bị xóa hẳn ở `qd93-remove-department-projects`;
  lát này **không** sửa `src/modules/organization/project/**` (chỉ còn đó import `hrBasisSchema`/`HrBasis` — xem Dependencies).
- Cờ `installationException: true` của audit lệnh khởi tạo (`installation.api.ts:25`): giữ nguyên dữ liệu; chỉ sửa chú
  thích nói "không có căn cứ" nếu muốn (tùy chọn, không đổi contract).
- Bản ghi audit cũ có `after.hrBasis`: giữ nguyên (`audit_events` append-only, trigger `audit_events_no_update_delete`).
- Phòng tùy chọn, xếp phòng lần đầu, format mã, `.xlsx`, danh bạ nhân viên: các sibling.

## Dependencies and blockers

- Không cần migration (căn cứ chỉ nằm trong `audit_events.after` JSON, không có cột). Nếu implement phát sinh migration thì
  theo luật timestamp của đợt sửa: timestamp thật khi tạo, đổi lại cho đứng sau migration mới nhất trên `dev` trước merge
  và thêm vào `scripts/verify/merged-migrations.txt`.
- Thứ tự merge (Owner 01/11/2026, đợt sửa sau audit; mỗi lần một lát, rebase lên `dev` trước khi merge): lát này merge
  **đầu tiên** ở W1, trước `qd93-remove-in-app-super-admin-transfer` và `qd93-parameter-labels-dashboard-queues`.
  - `qd93-remove-in-app-super-admin-transfer` (W1, sau lát này) xóa
    `test/integration/identity-access/super-admin-transfer-http.integration-spec.ts` mà lát này sửa (bỏ `hrBasis` ở lời gọi
    route phòng ban) — lát kia rebase và xóa file đã sửa.
  - `qd93-direct-manager-spending-approver-roles` (W2) rebase lên lát này: cùng sửa `department-head.service.ts`,
    `department-heads.controller.ts`, `department.http-errors.ts`, `test/support/department-harness.ts`,
    `test/integration/organization/department-head-http.integration-spec.ts`.
  - `qd93-remove-department-projects` phase 1 (W2) đi sau (cùng `department.dto.ts`, `department-harness.ts`). Trong lát
    này `project.dto.ts`/`project.service.ts` vẫn import `hrBasisSchema`/`HrBasis` — **giữ hai file dùng chung**
    (`src/infrastructure/http/dto/hr-basis.dto.ts`, `src/modules/organization/public/hr-basis.types.ts`) và
    `test/support/hr-basis.ts`; phase 1 của lát dự án xóa chúng.
  - `qd93-unplaced-employee-first-placement`, `qd93-code-format-xlsx-employee-import`, `employee-directory-read` đi sau
    (cùng `employee.dto.ts`, `employee-manual.service.ts`, confirmation service).
- Phối hợp FE: tài liệu API cho FE (Docs `Figma UI-UX/API-Integration`, mục _Thay đổi đã lên kế hoạch_) đã báo trước; FE
  bỏ `hrBasis` khỏi 10 body cùng đợt deploy (xem tương thích bên dưới).
- Quyết định tương thích OD-1 = A (strict) đã được Owner duyệt 01/11/2026; không còn chặn `ready` về phía OD — vẫn chờ
  Owner review toàn spec.

## Ownership: module, data, API

- `organization/department-management/` (`department.dto.ts`, `departments.controller.ts`, `department-heads.controller.ts`,
  `department.service.ts`, `department-head.service.ts`, `department.http-errors.ts`), `organization/department/`
  (`department.types.ts` nhận hằng giới hạn tên/chức năng), `organization/employee/` (`employee.dto.ts`,
  `employees.controller.ts`, `employee-maintenance.controller.ts`, `employee-manual.service.ts`,
  `employee-maintenance.service.ts`, `employee.errors.ts`, `employee.policy.ts` — chú thích), `organization/public/`
  (`organization.types.ts` chú thích; `hr-basis.types.ts` xóa ở lát dự án), `data-import/employee-import/`
  (`employee-import.dto.ts`, `employee-imports.controller.ts`, confirmation service, audit mapper, errors/policy chú
  thích), `infrastructure/http/dto/hr-basis.dto.ts` (xóa ở lát dự án), `src/cli/demo-dataset/`: bỏ `hrBasis` khỏi **bốn**
  lời gọi HTTP của `steps/organization.steps.ts` — ba lời gọi phòng ban (`POST /departments` dòng 54, `PATCH
/departments/{id}` đổi IT Admin phụ trách dòng 161, `POST /departments/{id}/head-assignments` dòng 182) và một
  `POST /employees` (dòng 83); xóa `basis()` của `demo-step-kit.ts:90-95` (chỉ bốn lời gọi đó dùng); xóa trường `basis` của
  `DemoFixture` (`fixture/demo-fixture.types.ts:113`) và `SHARED_DEMO_V1` (`fixture/shared-demo-v1.ts:17-22`). Quy tắc
  "đổi dữ liệu là phiên bản mới" của `shared-demo-v1.ts:9-10` không áp: `basis` chỉ nuôi trường `hrBasis` của request, không
  dòng nào dataset ghi hay so sánh được suy ra từ nó (id `shared-demo-v1` giữ nguyên; trang Docs mô tả dataset nếu nhắc căn
  cứ thì ghi việc cho Docs). Đã loại: giữ trường `basis` không ai đọc.
- Bảng: không đổi. Ghi `audit_events` (payload mới không có `hrBasis`).
- API (10 operation): `employeeCreate` `POST /employees`, `employeeUpdateOfficialFields` `PATCH /employees/{id}`,
  `departmentCreate` `POST /departments`, `departmentUpdate` `PATCH /departments/{id}`, `departmentDeactivate`
  `POST /departments/{id}/deactivate`, `departmentHeadAssign` `POST /departments/{id}/head-assignments`,
  `departmentHeadVacate` `POST /departments/{id}/head-vacancies`, `departmentSuccessorDesignate`
  `POST /departments/{id}/successor-designations`, `departmentSuccessorClear` `POST /departments/{id}/successor-clearances`,
  `employeeImportConfirm` `POST /employee-imports/{id}/confirmations`. `projectCreate`/`projectUpdate` biến mất ở lát dự án.
- Không Nest module mới, không extension point mới. Module card `src/modules/organization/README.md`,
  `src/modules/data-import/README.md` cập nhật câu "kèm căn cứ HR".

## Behavior and design

### Request

- Bỏ khóa `hrBasis` khỏi 10 schema body (`z.strictObject` giữ nguyên). Hai body chỉ có `hrBasis` trở thành rỗng:
  `deactivateDepartmentBodySchema` và `clearSuccessorBodySchema` → `z.strictObject({})` (giữ `@Body()` để body có khóa lạ
  vẫn 422; body vắng/`{}` hợp lệ). Không thêm trường thay thế.
- **Tương thích — OD-1 = A, strict ngay (Owner duyệt 01/11/2026):** request còn gửi `hrBasis` ⟹ 422 `VALIDATION_ERROR` (khóa
  lạ của `z.strictObject`), như mọi khóa lạ khác. Lý do: chưa có consumer production; FE đang nối màn hình và đã có thông
  báo kế hoạch; giữ một trường "bỏ qua" làm OpenAPI nói sai và cần thêm một hạng mục gỡ. Deploy BE và FE cùng đợt; trong
  khoảng lệch, màn FE cũ gửi `hrBasis` sẽ nhận 422. Đã loại: B — một release chấp nhận `hrBasis` deprecated, bỏ qua giá trị
  rồi gỡ ở hạng mục sau.
- `ops:record-super-admin-event` không đọc DTO HTTP: giữ `EventBasis` và các tham số `--basis-*` của CLI như cũ.

### Audit Trail

- Bỏ `hrBasis` khỏi `after` của: `DEPARTMENT.CREATED`, `DEPARTMENT.UPDATED` (gồm đổi IT Admin phụ trách — `US-01-11`
  AC-7), `DEPARTMENT.DEACTIVATED` (`after = { status: 'INACTIVE' }`), `DEPARTMENT.HEAD_ASSIGNED`, `DEPARTMENT.HEAD_VACATED`,
  `DEPARTMENT.SUCCESSOR_DESIGNATED`, `DEPARTMENT.SUCCESSOR_CLEARED`, `EMPLOYEE.CREATED` (nhập tay và từ import —
  `importEmployeeCreatedEvent`), `EMPLOYEE.OFFICIAL_FIELDS_CHANGED` (đường HTTP), `EMPLOYEE_IMPORT.CONFIRMED`. Các khóa
  khác giữ nguyên (actor, thời điểm, trước/sau). Đường CLI `profile-correct` giữ `after.hrBasis` (căn cứ của thủ tục
  `QĐ-87c`(4)).
- Sự kiện audit chỉ ghi **khi có thay đổi**, như hiện có: `DEPARTMENT.SUCCESSOR_CLEARED` khi thật sự bỏ một người kế
  nhiệm (không có ai để bỏ ⟹ không ghi, `department-head.service.ts:252-253`), `DEPARTMENT.DEACTIVATED` khi phòng chuyển
  sang `INACTIVE` (đã ngừng ⟹ cùng câu trả lời, không ghi, `department.service.ts:178`), `DEPARTMENT.UPDATED` khi ít nhất
  một trường đổi (`PATCH` với `{}` hoặc giá trị như cũ ⟹ 200, không ghi). Body rỗng không tạo sự kiện rỗng.

### Không đổi

Quyền (`SUPER_ADMIN`), khóa/transaction, thông báo (`EMPLOYEE_PROFILE_CREATED`/`_UPDATED` vẫn tới trưởng phòng, IT Admin
phụ trách và nhân viên như hiện có — `profile-notice.mapper.ts:22-38`; thông báo trưởng phòng đổi đi qua
`OrganizationChangeService` như cũ), mã lỗi nghiệp vụ, response body của 10 operation.

Vế "trưởng phòng và nhân viên bị tác động được báo" của `US-03-06` AC-22 (`QĐ-93f`(1)) là đường báo hiện có, lát này chỉ
chứng minh bỏ căn cứ không làm mất nó: gán trưởng phòng hiệu lực hôm nay ⟹ `OrganizationChangeService.emit` ghi một dòng
`organization_change_announcements` kiểu `HEAD_PERIOD_START` và các listener chạy trong cùng transaction (bước nhu cầu đang
mở của phòng chuyển cho trưởng phòng mới — như `step-reassignment.integration-spec.ts` đang kiểm); để trống trưởng phòng ⟹
`HEAD_PERIOD_END`; đổi IT Admin phụ trách ⟹ tác vụ mở chuyển sang người mới (test có sẵn của `US-01-11` AC-7). Lát này không
thêm loại thông báo mới; chủ AC-22 (`g2-department-profile`) giữ phần còn lại.

### `API-DOC-F05` — căn chỉnh OpenAPI/zod phòng ban (Owner duyệt 01/11/2026, gồm phần mã lỗi)

- 409 `DEPARTMENT.INACTIVE`: thêm `DEPARTMENT_INACTIVE: example(new DepartmentInactiveError())` vào
  `DEPARTMENT_ERROR_EXAMPLES` và khai `{ status: 409, examples: [DEPARTMENT_INACTIVE] }` cho `departmentUpdate`,
  `departmentHeadAssign`, `departmentSuccessorDesignate` (ba operation runtime đang ném lỗi này); manifest
  `openapi-example-route-codes-organization.ts` thêm `'409': ['DEPARTMENT.INACTIVE']` cho ba operation đó.
- Giới hạn: đưa `DEPARTMENT_NAME_MAX_LENGTH = 200`, `DEPARTMENT_FUNCTION_MAX_LENGTH = 1000` về
  `organization/department/department.types.ts`; schema create/update chuẩn hóa NFC **trong schema** trước khi đếm:
  `name: z.string().normalize('NFC').trim().max(DEPARTMENT_NAME_MAX_LENGTH)`,
  `function: z.string().normalize('NFC').trim().max(DEPARTMENT_FUNCTION_MAX_LENGTH).nullish()` (update:
  `.nullable().optional()`). Vượt ⟹ 422 `VALIDATION_ERROR` (path `name`/`function`), OpenAPI có `maxLength` thật. Đã thử với
  zod 4.6.7 của repo: các bước `normalize`/`trim` chạy trước `max` theo thứ tự khai báo (chuỗi NFD 3 đơn vị của một chữ có
  dấu đếm 1 sau NFC) và `z.toJSONSchema` vẫn ra `maxLength`.
- **Giới hạn thật là schema zod** (sau NFC + trim). Service giữ kiểm tên rỗng (sau `normalizeDisplayName`: NFC, trim, gộp
  khoảng trắng) ⟹ 422 `DEPARTMENT.NAME_INVALID` (mã giữ nguyên) và kiểm độ dài tên theo ký tự như phòng thủ — không bao giờ
  chạm sau khi zod qua (gộp khoảng trắng chỉ làm chuỗi ngắn đi). Service bỏ kiểm độ dài chức năng (trước đây trả nhầm
  `NAME_INVALID`). Đã loại: giữ `.max` đếm trước NFC (từ chối nhầm tên hợp lệ gõ ở dạng tổ hợp NFD).
- Ghi chú đo: zod `.max` đếm đơn vị UTF-16 sau NFC; với ký tự tiếng Việt (BMP) bằng số ký tự. Ký tự ngoài BMP (emoji) tính
  2 — chấp nhận (Owner duyệt 01/11/2026). Khoảng trắng liên tiếp bên trong được đếm trước khi service gộp — chấp nhận.
- Mô tả 403 `SUPER_ADMIN_ONLY` đổi thành "Only the Super Admin changes department data. The IT Admin does not."; mô tả
  thân route bỏ "on an HR basis"/"HR document". `openapi-read-wording.http-spec.ts` giữ regex cấm cụm write-only trên GET
  (vẫn đúng).

### Concurrency, migration, jobs

Không áp dụng: không đổi khóa hay transaction; không migration; không job. Tương thích dữ liệu: audit cũ giữ `hrBasis`,
audit mới không có — consumer Audit Trail (`GET /audit-events`) trả `after` nguyên khối, không parse khóa này.

## Test matrix

| AC / rủi ro                                      | Tình huống (gồm từ chối, edge case)                                                                                  | Cấp test         | Kết quả mong đợi                                                                                    | Bằng chứng sau implement |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------- | ------------------------ |
| `US-03-06` AC-1, `US-02-04` AC-4                 | Super Admin `POST /departments` không `hrBasis`                                                                      | integration      | 201; audit `DEPARTMENT.CREATED` `after` không có `hrBasis`, có actor/thời điểm/giá trị sau          | planned                  |
| `US-03-06` AC-22                                 | update, deactivate (body `{}`/vắng), head-assign, head-vacate, successor-designate, successor-clear không căn cứ     | integration      | thành công; audit trước/sau đủ, không `hrBasis`                                                     | planned                  |
| `US-03-06` AC-22 vế báo                          | head-assign hiệu lực hôm nay và head-vacate không căn cứ, phòng có một Request đang ở bước nhu cầu                   | integration      | có `organization_change_announcements` `HEAD_PERIOD_START`/`HEAD_PERIOD_END`; bước chuyển người mới | planned                  |
| `US-03-06` AC-22 không đổi gì                    | `PATCH` `{}` hoặc giá trị như cũ; deactivate phòng đã ngừng; successor-clear khi không có kế nhiệm                   | integration      | 200/204 như hiện có; không thêm dòng `audit_events`                                                 | planned                  |
| `US-01-11` AC-7                                  | `PATCH /departments/{id}` đổi `itAdminEmployeeId` A1 → A3 không căn cứ                                               | integration      | 200; audit `DEPARTMENT.UPDATED` `before/after.itAdminEmployeeId`; tác vụ mới giao A3 (test có sẵn)  | planned                  |
| `US-02-02` AC-14                                 | `POST /employees` không `hrBasis`                                                                                    | integration      | 201; audit `EMPLOYEE.CREATED` không `hrBasis`; thông báo `H1`, `IT1` như cũ                         | planned                  |
| `US-02-02` AC-19                                 | `PATCH /employees/{id}` sửa họ tên + chức vụ không căn cứ                                                            | integration      | 200; audit trước/sau; `E1` (có tài khoản) và trưởng phòng nhận `EMPLOYEE_PROFILE_UPDATED`           | planned                  |
| `US-02-02` AC-1, AC-10, AC-13, AC-16             | xác nhận import `{ previewVersion, idempotencyKey }` không căn cứ                                                    | integration      | ghi đúng số dòng; audit `EMPLOYEE_IMPORT.CONFIRMED` và từng `EMPLOYEE.CREATED` không `hrBasis`      | planned                  |
| `US-02-03` AC-7                                  | import 3 dòng vào phòng chưa có Cost Center, không căn cứ                                                            | integration      | 3 dòng tạo, cảnh báo cấu hình tài chính như cũ                                                      | planned                  |
| OD-1 = A (strict)                                | mỗi body trong 10 operation kèm `hrBasis` hợp lệ cũ                                                                  | http             | 422 `VALIDATION_ERROR`, không gọi service                                                           | planned                  |
| `US-02-02` AC-16 vế sau, `US-03-06` AC-22 vế sau | ghi điều chuyển/nghỉ dài/bàn giao thiếu `grounds`                                                                    | integration      | vẫn từ chối như cũ (chạy lại suite personnel, không sửa)                                            | planned                  |
| `QĐ-87c`(4)                                      | `ops:record-super-admin-event --mode profile-correct` thiếu `--basis-*`                                              | integration      | vẫn từ chối; có đủ ⟹ audit `after.hrBasis` như cũ (suite `super-admin-event-service` giữ nguyên)    | planned                  |
| `API-DOC-F05`                                    | `PATCH` phòng đã ngừng; gán trưởng phòng/chỉ định kế nhiệm cho phòng đã ngừng                                        | integration      | 409 `DEPARTMENT.INACTIVE`; OpenAPI ba operation khai 409 với ví dụ này                              | planned                  |
| `API-DOC-F05`                                    | tên 201 ký tự; chức năng 1 001 ký tự; tên toàn khoảng trắng                                                          | http             | 422 `VALIDATION_ERROR` (`name`/`function`); tên rỗng ⟹ 422 `DEPARTMENT.NAME_INVALID`                | planned                  |
| `API-DOC-F05` NFC                                | tên 200 chữ có dấu gửi ở dạng NFD (hơn 200 đơn vị UTF-16 trước NFC)                                                  | http/integration | qua schema; lưu dạng NFC; 201 chữ NFD ⟹ 422 `VALIDATION_ERROR`                                      | planned                  |
| rủi ro OpenAPI                                   | `openapi.json` không còn schema `hrBasis` ở 10 operation; `maxLength` 200/1000; inventory/example gates              | gate/http        | `pnpm openapi:export` diff đúng phạm vi; `api-inventory`, `openapi-response-examples` xanh          | planned                  |
| rủi ro demo dataset                              | `ops:demo-dataset` chạy với API mới (ba lời gọi phòng ban + một `/employees` không `hrBasis`; fixture không `basis`) | integration      | `demo-dataset.integration-spec.ts` xanh, không gửi `hrBasis`                                        | planned                  |

## Definition of Done

- [ ] Mọi primary AC (vế `QĐ-93f`) có test đỏ-trước/xanh-sau ở cấp phù hợp; vế giữ căn cứ của sự kiện nhân sự có test
      chạy lại xanh.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; `pnpm test:http` theo file đã
      sửa, `pnpm openapi:export` (diff `openapi.json` chỉ ở 10 operation + `API-DOC-F05`), `pnpm arch:docs:check`;
      integration theo file (danh sách ở checkpoint của plan). Toàn bộ `pnpm test:integration`,
      `pnpm test:integration:timing` (`organization-unavailable.timing-spec.ts`) và `pnpm test:e2e` chỉ khi Owner cho
      (`D-S26`); chưa được cho ⟹ ghi giới hạn ở bảng verification.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; FE được báo danh sách body đổi và OD-1 = A (strict, 422).
- [ ] Không tăng legacy ledger kiến trúc; không còn import `hr-basis` ngoài `project/` và test dự án (lát dự án phase 1 xóa
      nốt — thứ tự merge cố định).
- [ ] Module card `organization`, `data-import` cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

- 01/11/2026: lập theo giao việc Owner (gói `QĐ-93`, hạng mục 4). Chưa code, chưa review, chưa nghiệm thu.
- 01/11/2026 — Owner duyệt các đề xuất kỹ thuật (OD-1 = A, `API-DOC-F05` gồm phần mã lỗi, đếm UTF-16 của `.max`, thiết kế
  chia việc); thiết kế vẫn draft chờ Owner review toàn spec.
- 01/11/2026 — sửa theo audit độc lập (thiết kế vẫn `draft`): M5 demo dataset đúng bốn lời gọi (ba phòng ban, một
  `/employees`), xóa `basis()` và trường `basis` của fixture; lệnh verify liệt kê từng file integration đã sửa (thêm
  `identity-access/super-admin-transfer-http`, `catalog/document-http`, `operating-parameters`, `employee-import-preview-http`),
  timing/e2e/toàn bộ integration là "hỏi Owner" (`D-S26`); L5 chuẩn hóa NFC trong schema, schema là giới hạn thật; L6 audit
  chỉ ghi khi có thay đổi, thêm ca vế báo của `US-03-06` AC-22, hai phase cùng một release; thứ tự merge (đầu tiên ở W1, lát
  vai và lát dự án rebase lên lát này).

Dòng scope map G2 của lát này (đã chép vào scope map G2 của roadmap; spec không tự sửa roadmap):

- `US-02-02` AC-1, AC-13, AC-16: `partial`, Owner `g2-employee-intake-by-super-admin` (đang `full` trong dòng
  `AC-1, AC-9, AC-12→AC-16, AC-18`), Remaining owner lát này (AC-16 thêm `qd93-unplaced-employee-first-placement`).
- `US-02-02` AC-10: `full`, Owner lát này (trước đó `not affected` — giao trước GOV.1 ở lát legacy).
- `US-02-02` AC-14: `partial`, Owner `g2-employee-intake-by-super-admin` (spec của nó vẫn claim AC-14 — bỏ nó khỏi map
  làm `pnpm rules:check` đỏ), Remaining owner lát này, `qd93-unplaced-employee-first-placement`,
  `qd93-code-format-xlsx-employee-import`.
- Quy tắc chung đã dùng: khóa mà một hạng mục **còn sống** đang claim thì hạng mục đó giữ vai Owner và các hạng mục
  `QĐ-93` là Remaining owner; khóa đang `not affected` (giao ở lát legacy không có bảng Primary) hoặc AC mới thì hạng mục
  `QĐ-93` là Owner `full`.
- `US-02-02` AC-19: `partial`, Owner `g2-employee-official-field-maintenance`, Remaining owner lát này.
- `US-02-03` AC-7: `partial`, Owner `g2-department-profile`, Remaining owner lát này.
- `US-02-04` AC-4, `US-03-06` AC-1, `US-01-11` AC-7: `full`, Owner lát này (tách khỏi dòng `not affected` hiện có).
- `US-03-06` AC-22: `partial`, Owner `g2-department-profile`, Remaining owner lát này.

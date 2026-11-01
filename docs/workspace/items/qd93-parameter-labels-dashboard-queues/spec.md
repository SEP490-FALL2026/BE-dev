# Spec: qd93-parameter-labels-dashboard-queues — nhãn tiếng Việt, nhóm và `constraints` có kiểu cho tham số vận hành

- Phụ trách: chưa phân công — người nhận (dev hoặc AI theo giao việc Owner) ghi tên khi nhận; sở hữu thiết kế, implementation,
  test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: AI theo giao việc của điều phối (01/11/2026, lượt `QĐ-93` → spec/plan BE).
- Thiết kế: `draft`. Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec.
- Nguồn: Docs `69e8a3d` (BRD v3.58 `FR-8.2`; `QĐ-93` mục _Không phải quyết định mới_: "Nhãn tiếng Việt cho tham số vận hành (`FR-8.2`)
  … là trình bày"; `QĐ-87a`/`QĐ-87b` — Super Admin xử lý thông báo `BM-09`; `QĐ-87h`, `QĐ-89b`, `QĐ-90b` — rà soát sau điều
  chuyển xét mọi quyền đang giữ; User Stories `US-01-04` AC-1 → AC-15 chỉ truy vết, không AC mới; tài liệu API cho FE
  `Figma UI-UX/API-Integration/changes/CHANGELOG.md` finding `API-DOC-F07`, bảng nhãn tạm ở `roles/super-admin.md#tham-so-van-hanh`),
  BE `1a77ffe8` (nhánh `dev`, sạch).
- Bổ sung sau pin: `D-S17`…`D-S26` (Owner 01/11/2026, Docs chưa commit); hạng mục này chỉ dùng `D-S26` (quyền chạy test, plan).
- **Tên thư mục là tên lịch sử**: `…-dashboard-queues` có từ khi phần (a) nhãn tham số và (b) trang tổng quan còn là một việc. Theo
  [work-item sizing](../../../rules/work-item-sizing.md), (b) là outcome khác nên đã tách sang
  [`dashboard-request-queues-wiring`](../dashboard-request-queues-wiring/spec.md); thư mục này **chỉ** giữ (a) — không có gì về
  trang tổng quan. Không đổi tên thư mục (giữ khớp đăng ký của người giao việc, roadmap và mục `item` của sự kiện registry).
- Nhóm roadmap: không thuộc nhóm G (technical-enabler; `US-01-04` của G2 chỉ là truy vết — xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Super Admin mở danh sách tham số vận hành và thấy mỗi tham số với **nhãn tiếng Việt**, **nhóm** (có tên tiếng Việt) và **đơn vị
tiếng Việt** do BE trả, cùng `constraints` có kiểu trong OpenAPI (`int` / `enum` kèm nhãn lựa chọn / `int-list`), nên FE dựng ô
nhập và nhãn mà không cần bảng ánh xạ theo `key`; hai mô tả lỗi thời (`API-DOC-F07`) được sửa. Kiểm được bằng integration HTTP
và schema OpenAPI; `key`, giá trị, mặc định và miền giá trị không đổi.

## Sizing decision

- Container: yêu cầu trực tiếp của Owner trong lượt `QĐ-93` (nhãn tham số — trình bày) và finding FE `API-DOC-F07`. Giao việc ban
  đầu gộp thêm finding `API-DOC-F06` (trang tổng quan) — đã tách, lý do ở `Not larger`.
- Mode: `technical-enabler`.
- Outcome and owner: contract đọc của tham số vận hành có nhãn, nhóm, đơn vị tiếng Việt và `constraints` có kiểu; module
  `operating-parameters` (T3, phẳng, chưa chia capability) — `parameter-definitions.policy.ts`, `operating-parameters.dto.ts`,
  `public/operating-parameters.api.ts`, `operating-parameters.controller.ts`.
- Boundaries: không bảng, không migration, không transaction mới, không đổi quyền (vẫn chỉ `SUPER_ADMIN`); đổi wire của hai
  operation trả cùng schema tham số (`operatingParameterList`, `operatingParameterSet`); `operatingParameterHistory` không đổi; một
  khóa mảng lồng mới trong registry `API-LIST-DETAIL.1` (`operatingParameterList#constraints.options`).
- Not larger: (b) đưa mục `requests` (Employee) và `needApprovals` (trưởng phòng) của trang tổng quan sang số đếm thật là module
  khác (`dashboards` T7 + facade mới của `requests` T5), consumer khác (màn tổng quan), test và rollback riêng ⟹ không đủ điều kiện
  gom của quy tắc 3 (không cùng capability, không cùng ranh giới dữ liệu) ⟹ hạng mục sibling `dashboard-request-queues-wiring`.
  Thêm tham số mới (ví dụ loại tệp), đổi miền giá trị hay mặc định, mô tả tiếng Việt đầy đủ, tham số theo ứng dụng (`US-01-04`
  AC-1, AC-5) không thuộc đây. Kiểm `qd93-remove-fallback-substitute-approvers`: **không** tham số nào nói tới approver dự phòng hay
  người duyệt chi thay thế (hai cấu hình đó là vai trò phê duyệt `/approval-roles`, không phải tham số) — không có gì để bỏ.
- Not smaller: nhãn, nhóm, nhãn đơn vị, nhãn lựa chọn, `constraints` có kiểu và hai mô tả cùng một schema DTO, cùng tệp định nghĩa
  và cùng một lần cập nhật inventory/registry/OpenAPI; tách ra làm FE sinh lại client hai lần cho cùng một màn.
- Siblings: `dashboard-request-queues-wiring` (phần tổng quan tách ra), `qd93-budget-record-attachments` (đổi `description` của
  `DOCUMENT_MAX_SIZE_MB` trong cùng tệp), `g2-operating-parameters` (lát legacy của `US-01-04`).
- Scope map: n/a

## Primary Story/AC

| Story | AC                 | Coverage | Phần còn lại thuộc                                                                                                                                                             |
| ----- | ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —     | `API-DOC-F07`      | n/a      | gỡ chặn `g2-operating-parameters` (màn tham số vận hành của `US-01-04`: mô tả `PERSONNEL_NOTICE_REVIEW_WORKING_DAYS`, `TRANSFER_REVIEW_WORKING_DAYS` đúng nghiệp vụ hiện hành) |
| —     | `QĐ93-PARAM-LABEL` | n/a      | gỡ chặn `g2-operating-parameters` (FE hiển thị nhãn, nhóm, đơn vị tiếng Việt từ BE, bỏ bảng ánh xạ theo `key` của tài liệu API)                                                |

`QĐ93-PARAM-LABEL` là mã của hạng mục cho yêu cầu trình bày "nhãn tiếng Việt cho tham số vận hành" của `QĐ-93` (không phải AC
nghiệp vụ). Không AC nào của `US-01-04` đổi chữ ở Docs `69e8a3d`.

## Supporting references

- `US-01-04` (Super Admin cấu hình tham số; AC-3 miền giá trị, AC-6 quyền, AC-7 mặc định) — chỉ truy vết, không đổi hành vi.
- `FR-8.2` (danh sách tham số), `FR-2.14` + `QĐ-87a`, `QĐ-87b` (Super Admin kiểm và ghi hoặc từ chối thông báo `BM-09`; route
  `personnelNoticeRecord`, `personnelNoticeReject`, `personnelNoticeLinkEvent` là `SUPER_ADMIN` ở BE `1a77ffe8`), `FR-3.8` + `QĐ-89b`,
  `QĐ-90b` (rà soát sau điều chuyển: mọi quyền cá nhân đang giữ, trả phí hay nội bộ — `transfer-review.service.ts`); bộ công cụ
  chuẩn đã bỏ (`QĐ-87`).
- Bảng nhãn tạm của FE: Docs `Figma UI-UX/API-Integration/roles/super-admin.md#tham-so-van-hanh` (đã đối chiếu với định nghĩa BE ở
  `1a77ffe8`; hai nhãn đổi theo nghiệp vụ hiện hành, mục 2).
- [API contract](../../../rules/api-contract.md) (`API-LIST-DETAIL.1` mảng lồng, OpenAPI 3.0, ví dụ), registry
  `test/support/api-collection-registry-*.ts`, gate `test/gates/api-collection-contract.gate-spec.ts`.

## Explicit out of scope

- Mục `requests`/`needApprovals` của trang tổng quan (`API-DOC-F06`) → `dashboard-request-queues-wiring`.
- Bản dịch tiếng Việt của `description` (giữ tiếng Anh như contract hiện hành; FE hiện `label`, `description` làm chú thích kỹ
  thuật), đa ngôn ngữ, chọn ngôn ngữ theo header.
- Tham số mới, đổi miền/mặc định, tham số theo ứng dụng (`US-01-04` AC-1, AC-5 chờ G7), phiên bản thông báo (`US-01-04` AC-2).
- Tài liệu API phía Docs (sinh lại từ `openapi.json` ở repo Docs).
- `constraints` có kiểu chỉ tả miền của **từng** tham số; hai luật xuyên tham số hiện có **không** hiện trong `constraints`: khóa
  `FISCAL_YEAR_START_MONTH` khi đã có phiên bản ngân sách (`ParameterLockContributions`, `ParameterLockedError`) và
  `INVITATION_WITHDRAW_DAYS > INVITATION_REMINDER_DAYS` (`parameter-definitions.policy.ts:262-265`). FE vẫn nhận lỗi của `PUT` như
  hôm nay. Biểu diễn chúng trong contract (ví dụ `lockedReason`, ràng buộc `greaterThan`) là việc tiếp theo, chưa tạo hạng mục —
  ghi ở đây để không ai coi `constraints` là đủ.

## Dependencies and blockers

- Không phụ thuộc hạng mục nào để bắt đầu.
- Thứ tự merge (lượt `QĐ-93`, sóng W1; merge từng hạng mục một, rebase lên `dev` ngay trước khi merge): hạng mục này ở W1 cùng
  `qd93-remove-hr-basis-org-writes` và `qd93-remove-in-app-super-admin-transfer`, không chờ hạng mục nào.
  `qd93-budget-record-attachments` (W4) merge **sau** và rebase lên hạng mục này.
- Migration: không có. Nếu implementation buộc phải thêm, áp quy tắc timestamp chung của lượt: timestamp thật lúc tạo, đổi lại cho
  lớn hơn migration mới nhất trên `dev` trước merge và thêm vào `scripts/verify/merged-migrations.txt` trong lần merge.
- **Khóa registry mới** (Owner duyệt 01/11/2026): gate `api-collection-contract` chỉ cho thêm mảng lồng khi có quyết định Owner
  (`INITIAL_NESTED_ARRAYS` đóng băng, mỗi khác biệt là một sự kiện ở `REGISTRY_EVENTS_SINCE_INITIAL`). `constraints` có kiểu làm lộ
  mảng `options` của dạng `enum` ⟹ khóa `operatingParameterList#constraints.options`, `bounded`, `maxItems` = `ENUM_OPTIONS_MAX`
  = 10 (hiện có 2 lựa chọn mỗi tham số `enum`); quyết định ghi ở `## Changes and acceptance`. Đã loại: giữ `constraints` kiểu bản
  ghi tự do.
- Va chạm tệp: `qd93-budget-record-attachments` đổi `description` của `DOCUMENT_MAX_SIZE_MB` trong cùng
  `parameter-definitions.policy.ts`. Theo thứ tự merge, hạng mục đó merge sau và rebase lên đây; hạng mục này **không** đổi mô tả
  đó (chỉ thêm `label`).

## Ownership: module, data, API

- Module: `operating-parameters` (T3). Không Nest submodule hay capability mới (module phẳng, ≤ 25 tệp).
- Dữ liệu: không bảng nào đổi; `parameter_values` giữ nguyên (giá trị lưu theo `key`, nên đổi thứ tự định nghĩa không ảnh hưởng).
- API đổi: `operatingParameterList` (`GET /api/v1/operating-parameters`) và `operatingParameterSet`
  (`PUT /api/v1/operating-parameters/{key}`) — item có thêm `label`, `group`, `groupLabel`, `unitLabel`; `constraints` có kiểu.
  Giữ nguyên: `key`, `value`, `default`, `isDefault`, `unit`, `description` (trừ hai mô tả ở mục 3), `changedAt`, quyền, mã lỗi,
  `operatingParameterHistory`, mọi route ngày nghỉ và tiền tệ báo cáo.
- `OperatingParametersApi.getValue/getValueAt/holdValue` (module khác dùng) không đổi chữ ký.

## Behavior and design

### 1. Định nghĩa

`ParameterDefinition` thêm:

```ts
export const PARAMETER_GROUPS = [
  'WORKFLOW',
  'BUDGET',
  'PERSONNEL',
  'PROVISIONING',
  'ACCOUNT',
  'DOCUMENT',
  'SUBSCRIPTION',
  'USAGE',
] as const;
export type ParameterGroup = (typeof PARAMETER_GROUPS)[number];
export const GROUP_LABELS: Record<ParameterGroup, string> = {/* bảng mục 2 */};
/** Most choices an enum parameter offers; the registry of nested arrays records the same bound. */
export const ENUM_OPTIONS_MAX = 10;

type Shape =
  | { kind: 'int'; min: number; max: number }
  | { kind: 'enum'; options: readonly string[]; optionLabels: Readonly<Record<string, string>> }
  | {
      kind: 'int-list';
      min: number;
      max: number;
      length: { min: number; max: number };
      order: 'ascending' | 'descending';
    };

export interface ParameterDefinition {
  key: string;
  label: string; // tiếng Việt, ≤ 80 ký tự
  group: ParameterGroup;
  shape: Shape;
  default: ParameterValue;
  unit: string; // giữ nguyên chuỗi tiếng Anh hiện có
  unitLabel: string; // tiếng Việt
  description: string;
  source: string;
}
```

`PARAMETER_DEFINITIONS` được **xếp lại theo nhóm** (thứ tự `PARAMETER_GROUPS`, trong nhóm theo bảng mục 2) — danh sách trả về theo
đúng thứ tự đó. `key`, `shape` (trừ thêm `optionLabels`), `default`, `unit`, `source` không đổi; miền giá trị và
`validateParameterValue` không đổi.

### 2. Nhãn, nhóm, đơn vị (Owner duyệt 01/11/2026)

Nhóm (thứ tự hiển thị): `WORKFLOW` "Phê duyệt và quy trình" · `BUDGET` "Ngân sách và chi phí" · `PERSONNEL` "Nhân sự và bàn giao" ·
`PROVISIONING` "Cấp phát và báo lỗi SaaS" · `ACCOUNT` "Tài khoản" · `DOCUMENT` "Tài liệu" · `SUBSCRIPTION` "Thuê bao và gia hạn" ·
`USAGE` "Sử dụng và lãng phí".

| Thứ tự | `key`                                  | `label`                                  | `group`        | `unit` → `unitLabel`                |
| ------ | -------------------------------------- | ---------------------------------------- | -------------- | ----------------------------------- |
| 1      | `APPROVAL_SLA_WORKING_DAYS`            | Hạn xử lý một bước phê duyệt             | `WORKFLOW`     | working days → ngày làm việc        |
| 2      | `BACKLOG_ALERT_THRESHOLD`              | Ngưỡng tồn đọng bước phê duyệt           | `WORKFLOW`     | steps → bước                        |
| 3      | `SPEND_SUBMISSION_WAIT_WORKING_DAYS`   | Hạn chờ trình duyệt chi                  | `WORKFLOW`     | working days → ngày làm việc        |
| 4      | `FISCAL_YEAR_START_MONTH`              | Tháng bắt đầu năm tài chính              | `BUDGET`       | month of the year → tháng trong năm |
| 5      | `FORECAST_ERROR_THRESHOLD_PERCENT`     | Ngưỡng sai số dự báo chi phí             | `BUDGET`       | percent → %                         |
| 6      | `TRANSFER_REVIEW_WORKING_DAYS`         | Hạn rà soát quyền sau điều chuyển        | `PERSONNEL`    | working days → ngày làm việc        |
| 7      | `PERSONNEL_NOTICE_REVIEW_WORKING_DAYS` | Hạn xử lý thông báo biến động nhân sự    | `PERSONNEL`    | working days → ngày làm việc        |
| 8      | `ABRUPT_DEPARTURE_HOLD_WORKING_DAYS`   | Thời gian giữ công cụ khi nghỉ đột xuất  | `PERSONNEL`    | working days → ngày làm việc        |
| 9      | `HANDOVER_SHORT_DEADLINE_WORKING_DAYS` | Hạn ngắn xác nhận bàn giao dữ liệu       | `PERSONNEL`    | working days → ngày làm việc        |
| 10     | `PROVISIONING_RETRY_COUNT`             | Số lần thử lại cấp/thu hồi               | `PROVISIONING` | attempts → lần                      |
| 11     | `SAAS_ISSUE_RESPONSE_WORKING_DAYS`     | Hạn tiếp nhận báo lỗi SaaS               | `PROVISIONING` | working days → ngày làm việc        |
| 12     | `SAAS_ISSUE_REOPEN_WORKING_DAYS`       | Hạn mở lại báo lỗi SaaS                  | `PROVISIONING` | working days → ngày làm việc        |
| 13     | `INVITATION_REMINDER_DAYS`             | Nhắc lời mời chưa kích hoạt sau          | `ACCOUNT`      | days → ngày                         |
| 14     | `INVITATION_WITHDRAW_DAYS`             | Thu hồi lời mời chưa kích hoạt sau       | `ACCOUNT`      | days → ngày                         |
| 15     | `DOCUMENT_MAX_SIZE_MB`                 | Dung lượng tối đa của tệp tài liệu       | `DOCUMENT`     | MB → MB                             |
| 16     | `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`   | Cảnh báo trước hạn báo hủy thuê bao      | `SUBSCRIPTION` | days → ngày                         |
| 17     | `ACTIVITY_WINDOW_MINUTES`              | Số phút tính là một ngày có hoạt động    | `USAGE`        | minutes per day → phút mỗi ngày     |
| 18     | `DETECTION_THRESHOLD_DAYS`             | Ngưỡng ngày không dùng của ghế           | `USAGE`        | days → ngày                         |
| 19     | `RULE_SCHEDULE_G1_G2`                  | Lịch chạy luật lãng phí (dữ liệu nội bộ) | `USAGE`        | schedule → lịch                     |
| 20     | `RULE_SCHEDULE_G3_G4`                  | Lịch chạy luật lãng phí (dữ liệu usage)  | `USAGE`        | schedule → lịch                     |

- Nhãn lấy từ bảng tạm của FE (đã đối chiếu với định nghĩa ở `1a77ffe8`), trừ hai nhãn đổi theo nghiệp vụ hiện hành:
  `TRANSFER_REVIEW_WORKING_DAYS` "công cụ" → "quyền" (rà soát mọi quyền đang giữ, `QĐ-89b`, `QĐ-90b`); `DOCUMENT_MAX_SIZE_MB`
  "tệp chứng từ" → "tệp tài liệu" (tham số áp cho cả tài liệu hồ sơ ngân sách, `QĐ-93j`(3)).
- `optionLabels` của `RULE_SCHEDULE_G1_G2`, `RULE_SCHEDULE_G3_G4`: `{ DAILY: 'Hằng ngày', WEEKLY: 'Hằng tuần' }` — khóa đúng bằng
  `options`.

### 3. Hai mô tả lỗi thời (`API-DOC-F07`)

| `key`                                  | Mô tả hiện có (`1a77ffe8`)                                                                                                                | Mô tả mới                                                                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PERSONNEL_NOTICE_REVIEW_WORKING_DAYS` | How long the IT Admin has to verify and record, or reject, the notice of a department head about a change coming for one of their people. | How long the Super Admin has to verify and record, or reject, the notice of a department head about a change coming for one of their people.                                  |
| `TRANSFER_REVIEW_WORKING_DAYS`         | How long the new head of a department has to review tools outside its standard set after a transfer.                                      | How long the new head of a department has to review every right a transferred person holds, paid or internal, counted in working days from the day the transfer takes effect. |

Đối chiếu 18 mô tả còn lại với nghiệp vụ ở Docs `69e8a3d`: không mô tả nào nhắc approver dự phòng, người duyệt chi thay thế, bộ công
cụ chuẩn hay IT Admin xử lý `BM-09`; `DOCUMENT_MAX_SIZE_MB` do `qd93-budget-record-attachments` đổi.

### 4. Wire và OpenAPI

```ts
const constraintsSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('int'), min: z.number().int(), max: z.number().int() }),
  z.strictObject({
    kind: z.literal('enum'),
    options: z.array(z.string()).min(1).max(ENUM_OPTIONS_MAX),
    optionLabels: z
      .record(z.string(), z.string())
      .meta({ description: 'The Vietnamese label of each option, by option.' }),
  }),
  z.strictObject({
    kind: z.literal('int-list'),
    min: z.number().int(),
    max: z.number().int(),
    length: z.strictObject({ min: z.number().int(), max: z.number().int() }),
    order: z.enum(['ascending', 'descending']),
  }),
]);
const parameterSchema = z.strictObject({
  key: z.string(),
  label: z.string().meta({ description: 'What the screen shows for the parameter, in Vietnamese.' }),
  group: z.enum(PARAMETER_GROUPS),
  groupLabel: z.string(),
  value: parameterValue,
  default: parameterValue,
  isDefault: z.boolean(),
  unit: z.string(),
  unitLabel: z.string(),
  description: z.string(),
  constraints: constraintsSchema,
  changedAt: z.iso.datetime().nullable(),
});
```

- `ParameterView` thêm `label`, `group`, `groupLabel`, `unitLabel`; `constraints` là `Shape` (đã có `optionLabels`). `toWire` của
  controller chép thêm bốn trường. Schema response được serializer kiểm (khớp schema hay 500 như hiện hành).
- OpenAPI: `constraints` thành `oneOf` ba object (cùng cách `transfer.dto.ts`, `subscription-renewal.dto.ts` đã xuất); gate dialect
  OpenAPI 3.0 và gate ngữ nghĩa phải xanh không đổi chuỗi `openapi`.
- Registry `API-LIST-DETAIL.1`: (i) mục ngoại lệ `operatingParameterList#bounded` cập nhật `itemProperties` (sắp xếp: `changedAt`,
  `constraints`, `default`, `description`, `group`, `groupLabel`, `isDefault`, `key`, `label`, `unit`, `unitLabel`, `value`) và sửa
  `businessMaximum` đang ghi `maxItems: 16` / nguồn `parameter-definitions.ts` thành `20` / `PARAMETER_DEFINITIONS in
parameter-definitions.policy.ts` (đã sai từ khi có 20 định nghĩa); (ii) thêm khóa `operatingParameterList#constraints.options`
  (`bounded`, `maxItems: ENUM_OPTIONS_MAX`, nguồn `ENUM_OPTIONS_MAX in parameter-definitions.policy.ts, checked by its unit spec`,
  `removeWhen` khi đổi hằng hoặc thêm tham số `enum`) kèm **một** sự kiện `added` ở `REGISTRY_EVENTS_SINCE_INITIAL` — Owner duyệt
  khóa 01/11/2026 (mục Dependencies).
- Sự kiện phải qua `eventHygiene` của gate (`api-collection-contract.gate-spec.ts:107`, `:292-305`, kiểm ở `1a77ffe8`): `finding`
  khớp `^LD-\d+$` (dạng `F<n>` chỉ cho sự kiện `closed` của operation đã bỏ), `item` là thư mục hạng mục có thật, `date` là
  `YYYY-MM-DD`, `reason` không rỗng. `API-DOC-F07` là mã finding của tài liệu FE, **không** dùng được làm `finding`. Vì vậy:
  - Cấp finding mới **`LD-17`** theo cách `LD-15`/`LD-16` đã được thêm: một dòng mới trong bảng defect `LD-*` của
    [review hậu merge G0–G4](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md) (mục list/detail — Mức `Info`; bằng chứng
    `operating-parameters.dto.ts` `constraints.options` của dạng `enum`, trần `ENUM_OPTIONS_MAX`; chủ
    `qd93-parameter-labels-dashboard-queues`; nguồn: Owner duyệt khóa 01/11/2026, `QĐ-93` nhãn tham số, `API-DOC-F07`). Kiểm lúc
    implement rằng `LD-17` vẫn chưa ai dùng (`git grep "LD-17"`); đã có thì lấy số kế tiếp.
  - Ghi sự kiện bằng **object literal** `RegistryEvent` (`registry: 'nested'`, `key`, `change: 'added'`, `to: 'bounded'`,
    `bound: 'ENUM_OPTIONS_MAX'` — chuỗi phải nằm trong `businessMaximum.source` của mục (gate dòng 373-377), `finding: 'LD-17'`,
    `item: 'qd93-parameter-labels-dashboard-queues'`, `date` = ngày viết thay đổi, `reason`, `ownerDecision` = "Owner 01/11/2026"
    — gate chỉ bắt buộc trường này cho khóa không `bounded`, ghi để truy vết), **không** dùng
    helper `boundedNested` của `test/support/api-collection-registry-events.ts` vì helper đó cố định `date: '2026-10-23'`. Không
    sửa code gate và helper.
- Sửa `itemProperties`/`businessMaximum` của mục ngoại lệ (i) **không** cần sự kiện: ledger chỉ so **khóa** của
  `COLLECTION_EXCEPTIONS` với `INITIAL_EXCEPTION_KEYS` (gate dòng 260-269); khóa `operatingParameterList#bounded` không đổi.
- Không đổi status, mã lỗi, message thành công (`PARAMETER.LISTED`, `PARAMETER.SET`), ví dụ lỗi.

### 5. Tương thích và thay đổi contract cho FE

- Thêm trường (`label`, `group`, `groupLabel`, `unitLabel`, `constraints.optionLabels`): tương thích ngược với client đọc theo khóa.
- `constraints` trong OpenAPI đổi từ `{ [key]: unknown }` sang union có `kind` — client sinh mã nhận kiểu chặt hơn; JSON của `int` và
  `int-list` giữ nguyên từng byte, `enum` thêm `optionLabels`.
- Thứ tự `items` đổi theo nhóm (trước đây theo thứ tự định nghĩa cũ); FE nhóm theo `group`/`groupLabel` thay vì bảng ánh xạ.
- Hai `description` đổi chữ. Báo FE trong PR: bỏ bảng nhãn tạm ở `roles/super-admin.md` khi Docs sinh lại tài liệu.

### 6. Không áp dụng

Transaction, khóa, migration, job, storage, audit: không áp dụng (chỉ đọc định nghĩa tĩnh; ghi giá trị giữ nguyên luồng
`ParameterChangeService`).

## Test matrix

| AC / rủi ro                   | Tình huống (gồm từ chối, edge case)                                                                                                                                                                | Cấp test                                                                                                                                                 | Kết quả mong đợi                                                              | Bằng chứng sau implement |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------ |
| `QĐ93-PARAM-LABEL` định nghĩa | mọi định nghĩa có `label` (không rỗng, ≤ 80, khác `key`, không trùng nhau), `group` thuộc `PARAMETER_GROUPS`, `unitLabel` không rỗng; nhóm liền nhau theo đúng thứ tự nhóm                         | unit `src/modules/operating-parameters/parameter-definitions.policy.spec.ts`                                                                             | xanh; tập 20 `key` ghim bằng danh sách cố định (không thêm/bớt)               | planned                  |
| `QĐ93-PARAM-LABEL` lựa chọn   | mọi tham số `enum` có `optionLabels` đúng bằng tập `options`, số lựa chọn ≤ `ENUM_OPTIONS_MAX`                                                                                                     | unit như trên                                                                                                                                            | xanh                                                                          | planned                  |
| `API-DOC-F07`                 | mô tả `PERSONNEL_NOTICE_REVIEW_WORKING_DAYS` nói Super Admin, không IT Admin; `TRANSFER_REVIEW_WORKING_DAYS` không còn "standard set"; không mô tả nào nhắc fallback/substitute/conflict approver  | unit như trên                                                                                                                                            | xanh                                                                          | planned                  |
| Không đổi hành vi             | mặc định (AC-7), miền giá trị (AC-3: 50% bị từ chối), `INVITATION_*` N < M, khóa `FISCAL_YEAR_START_MONTH`                                                                                         | unit hiện có `parameter-definitions.policy.spec.ts`, `parameter-lock.spec.ts`; integration hiện có                                                       | xanh **không sửa** ca cũ                                                      | planned                  |
| Wire danh sách                | Super Admin gọi `GET /operating-parameters`: từng item có `label`, `group`, `groupLabel`, `unitLabel` đúng bảng mục 2; thứ tự theo nhóm; `constraints` của `RULE_SCHEDULE_G1_G2` có `optionLabels` | integration `test/integration/operating-parameters/operating-parameters-http.integration-spec.ts`                                                        | khớp; `value`, `default`, `isDefault`, `changedAt` như trước                  | planned                  |
| Wire khi đặt                  | `PUT /operating-parameters/APPROVAL_SLA_WORKING_DAYS` → response có bốn trường mới                                                                                                                 | integration như trên                                                                                                                                     | 200, trường mới đúng                                                          | planned                  |
| Quyền không đổi               | IT Admin, trưởng phòng gọi list/set                                                                                                                                                                | integration hiện có (AC-6), HTTP `test/http/operating-parameters/operating-parameters.http-spec.ts`                                                      | 403 như trước                                                                 | planned                  |
| OpenAPI                       | schema item của `operatingParameterList` có trường mới; `constraints` là `oneOf` ba dạng có `kind`; dialect 3.0, ví dụ, inventory                                                                  | HTTP `operating-parameters.http-spec.ts`, `test/http/platform/openapi-dialect.http-spec.ts`, `api-inventory.http-spec.ts`, `openapi-export.http-spec.ts` | xanh; `openapi.json` sinh lại khớp                                            | planned                  |
| Registry mảng lồng            | gate thấy `operatingParameterList#constraints.options`; sự kiện `added` có `finding` `LD-17`, `date` là ngày viết, `item` là thư mục này                                                           | gate `test/gates/api-collection-contract.gate-spec.ts`                                                                                                   | xanh với khóa + sự kiện mới; `maxItems` khớp schema; không lỗi `eventHygiene` | planned                  |

## Definition of Done

- [ ] Hai finding (`API-DOC-F07`, `QĐ93-PARAM-LABEL`) có test đỏ-trước/xanh-sau; không AC nào của `US-01-04` đổi hành vi.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên revision cuối: `pnpm check`, `pnpm test:http`,
      `pnpm test:integration -- test/integration/operating-parameters`, `pnpm openapi:export` không diff.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; thay đổi contract ghi ở PR và báo FE.
- [ ] Khóa registry mới có quyết định Owner ghi ở `## Changes and acceptance`; không tăng legacy ledger kiến trúc.
- [ ] Module card `src/modules/operating-parameters/README.md` nêu nhãn/nhóm; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

- 01/11/2026: tạo spec/plan bản `draft` từ Docs `69e8a3d`, BE `1a77ffe8`. Tách phần trang tổng quan (`API-DOC-F06`) sang
  `dashboard-request-queues-wiring` theo quy tắc sizing. Chưa peer review, chưa Owner review, chưa nghiệm thu; khóa registry
  `operatingParameterList#constraints.options` lúc đó chờ Owner duyệt.
- 01/11/2026 — Owner duyệt các đề xuất kỹ thuật (nhãn, nhóm, đơn vị mục 2; khóa registry
  `operatingParameterList#constraints.options` với `ENUM_OPTIONS_MAX = 10`); thiết kế vẫn draft chờ Owner review toàn spec.
- 01/11/2026 — sửa sau audit độc lập (AI theo giao việc điều phối; đã đối chiếu với gate ở `1a77ffe8`; `D-S26`, Docs chưa commit):
  sự kiện registry ghi như cũ sẽ đỏ gate (finding `API-DOC-F07` không khớp `LD-<n>`, helper `boundedNested` cố định ngày
  `2026-10-23`) ⟹ cấp `LD-17` ở ledger review G0–G4 và ghi sự kiện bằng object literal có ngày thật, không sửa gate (mục 4); bỏ câu
  "nếu gate đòi sự kiện cho (i)" — gate không đòi; ghi việc tiếp theo cho hai luật xuyên tham số `constraints` không diễn tả
  (out of scope); ghi rõ tên thư mục là lịch sử ở đầu spec; thứ tự merge W1 và quy tắc migration; plan thêm dòng quyền chạy test
  `D-S26`.

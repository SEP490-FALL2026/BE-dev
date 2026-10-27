# Spec: quy tắc và gate collection/detail (`API-LIST-DETAIL.1`)

- Phụ trách: chưa phân công (đề xuất: người giữ gate kiến trúc/OpenAPI).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08, 22/10/2026).
- Thiết kế: `draft`. Owner review: Owner review kết quả Prompt 09 (23/10/2026) mở `LD-R2-RV-01` — hai mục `bounded` không có
  biên toàn response — sửa ở Prompt 09A; review tiếp mở `LD-R2-RV-02` (mảng lồng chưa kiểm đệ quy) và `LD-R2-RV-03`
  (maximum chưa đối chiếu nguồn) — sửa ở Prompt 09B, cùng checkpoint; chưa có Owner review cuối. Owner giao triển khai `LD-R1` → `LD-R3`
  qua Prompt 09 (22/10/2026) — giao việc, không phải review; bảy điểm _Cần Owner quyết_ ở cuối mục _Behavior and design_
  **vẫn mở** và vẫn chặn các hạng mục capability tương ứng.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15), BE `69f4891`; bằng chứng ở
  [review hậu merge G0–G4](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#4-collection-và-detail-api-list-detail1).
- Nhóm roadmap: xuyên module — hạng mục này là `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này mọi `GET` collection đã mount có một summary contract khai báo (projection, biên/paging, thứ tự ổn định,
detail/subresource tương ứng), mọi chỗ còn dùng schema detail cho collection là một ngoại lệ có tên, chủ và điều kiện gỡ,
và gate đỏ khi một collection mới vi phạm — kiểm bằng `pnpm check` (inventory gate) và test đếm query của repository.

## Sizing decision

- Container: bó finding `API-LIST-DETAIL.1` của review hậu merge 22/10/2026 (61 operation `GET`, 143 operation).
- Mode: `technical-enabler`.
- Outcome and owner: quy tắc + inventory gate + harness đếm query dùng chung; capability `infrastructure/http` (gate,
  OpenAPI) và `test/support` (harness), tài liệu `docs/rules/api-contract.md`.
- Boundaries: không đổi route, DTO hay query sản phẩm nào; chỉ thêm rule, test gate đọc OpenAPI + registry ngoại lệ, và
  helper test; registry khởi đầu ghi đúng các vi phạm hiện có, mỗi mục trỏ hạng mục capability sẽ gỡ nó.
- Not larger: sửa contract từng capability là sáu hạng mục riêng (bảng Primary), vì mỗi capability đổi contract FE riêng
  và có migration/test riêng.
- Not smaller: rule, inventory gate và harness đếm query phải đến cùng lúc — gate DTO một mình không phát hiện nạp đủ quan
  hệ rồi cắt trường; harness một mình không chặn collection mới dùng schema detail.
- Siblings: `catalog-application-plan-read-contracts`, `catalog-subscription-read-model`,
  `catalog-standard-toolset-read-batching`, `licensing-provisioning-task-read-contracts`,
  `licensing-assignment-read-contracts`, `organization-identity-read-contracts`.
- Scope map: n/a

## Primary Story/AC

| Story | AC      | Coverage | Phần còn lại thuộc                                                                                |
| ----- | ------- | -------- | ------------------------------------------------------------------------------------------------- |
| —     | `LD-R1` | n/a      | gỡ chặn `catalog-application-plan-read-contracts`, `catalog-subscription-read-model`              |
| —     | `LD-R2` | n/a      | gỡ chặn `catalog-standard-toolset-read-batching`, `licensing-provisioning-task-read-contracts`    |
| —     | `LD-R3` | n/a      | gỡ chặn `licensing-assignment-read-contracts`, `organization-identity-read-contracts`             |
| —     | `LD-16` | n/a      | vế `onboardingChecklistGet#steps.warnings` giữ ở đây tới khi Owner chọn gói chủ (mục _Mảng lồng_) |

`LD-R1` = rule trong `docs/rules/api-contract.md`; `LD-R2` = inventory gate + registry ngoại lệ chính xác; `LD-R3` =
harness đặc tả projection và số query của repository danh sách.

## Supporting references

- Review: [mục 4](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#4-collection-và-detail-api-list-detail1) —
  ma trận đủ 61 `GET`, defect `LD-01` → `LD-14`; `LD-15` (hai mục `bounded` sai) thêm từ Owner review Prompt 09; `LD-16`
  (mảng lồng không biên chưa có finding) thêm ở Prompt 09B.
- Rule hiện có: [API contract](../../../rules/api-contract.md) (không có quy tắc collection),
  [database và nghiệp vụ](../../../rules/database-business.md) (đếm + trang cùng snapshot, thứ tự có khóa phụ).
- Gate cùng họ: `test/e2e/api-inventory.e2e-spec.ts`, `src/architecture-structure.spec.ts` (ledger chỉ được co lại).

## Explicit out of scope

- Sửa bất kỳ collection/detail nào (sáu hạng mục capability).
- `OPENAPI-EXAMPLE.1` (Prompt 26) — chạy sau khi contract ổn định.
- Thêm route detail mới mà Owner chưa quyết (năm điểm cuối mục dưới).

## Dependencies and blockers

Không blocker kỹ thuật. Nên làm **trước** sáu hạng mục capability để mỗi hạng mục gỡ đúng một mục registry. Owner review
spec; các điểm _Cần Owner quyết_ chặn riêng hạng mục capability tương ứng, không chặn hạng mục này.

## Ownership: module, data, API

- `docs/rules/api-contract.md` — mục [Collection và detail](../../../rules/api-contract.md#collection-và-detail-api-list-detail1)
  là nguồn chuẩn của quy tắc (bản trong spec này là thiết kế gốc); `docs/workspace/_template/spec.md` một đoạn nhắc.
- Gate `src/api-collection-contract.spec.ts` (unit, chạy trong `pnpm check`) đọc `openapi.json` đã commit — an toàn vì
  `GATE-01` của `delivery-gate-hardening` ghim artifact về LF và test export so đúng byte với bản sinh từ controller.
  **Lệch kế hoạch có chủ đích:** registry nằm **trong** tệp gate (như `LEGACY` của `architecture-structure.spec.ts`), không ở
  `src/api-collection-contract.registry.ts`: một `.ts` không phải spec trong `src/` sẽ được build vào `dist`.
- Harness `test/support/query-count.ts` đọc lưu lượng qua `PgRelay.observe` (relay sẵn có, thêm theo dõi **mỗi lần thực thi**:
  Query hoặc Execute của portal đã Bind, không đọc giá trị bind); không đổi `PrismaService`, không thêm dependency, không cần
  `pg_stat_statements`. Mẫu: `test/integration/query-count-harness.integration-spec.ts`.
- Không đổi route, DTO, Prisma schema, migration hay query sản phẩm.

## Behavior and design

### Quy tắc `API-LIST-DETAIL.1` (đưa vào `docs/rules/api-contract.md`)

1. **Collection trả bản tóm tắt.** Mỗi `GET` collection/search/page khai một **summary DTO riêng** (tên `…SummaryDto`/
   `…ListItemDto`) chỉ gồm trường để nhận diện, lọc và hành động trên từng dòng. Mảng lồng nhau, lịch sử, văn bản dài,
   bằng chứng kỹ thuật, khóa/bí mật và khuyến nghị tốn kém nằm ở detail hoặc subresource, trừ khi một AC ghi rõ cần ở
   danh sách.
2. **Detail trả đúng một resource** và phần chi tiết người gọi được xem; không kèm dữ liệu toàn tổ chức không liên quan.
3. **Có biên.** Collection có thể lớn phải phân trang (`pageSize` tối đa khai trong schema) hoặc có _business maximum_
   chứng minh được (AC/FR/ràng buộc CSDL). Danh mục nhỏ, bất biến là ngoại lệ có tên. Mảng lồng trong detail cũng có biên
   hoặc chuyển thành subresource phân trang.
4. **Projection ở repository.** Query danh sách `select` đúng projection của summary DTO; không `include` quan hệ của
   detail rồi bỏ trường sau. Dùng chung mapper detail chỉ khi query không đọc cột/quan hệ chỉ detail mới cần và contract
   vẫn kiểm độc lập được.
5. **Thứ tự ổn định** có khóa phụ tất định (`id`). Đếm và trang dùng cùng snapshot (một transaction `RepeatableRead` như
   các list hiện có) khi tính nhất quán quan trọng. Không phân trang trong bộ nhớ sau khi đọc toàn bộ tập.
6. **Không N+1.** Làm giàu chéo capability gom theo lô (một query cho cả trang) hoặc chứng minh biên cứng nhỏ (≤ 5 phần
   tử) trong registry.
7. **Tên khác khi hình khác.** Summary và detail là hai schema có tên riêng; detail nên là `summary.extend({...})` để
   trường chung không trôi. Schema detail chỉ được dùng cho collection qua một **ngoại lệ tham chiếu có biên** được
   review: ghi đúng `operationId`, business maximum, lý do, người sở hữu và điều kiện gỡ. Không ngoại lệ theo hậu tố/glob,
   không allowlist legacy chung.
8. **Mỗi collection mới khai trong spec** summary projection, biên/paging, thứ tự ổn định và contract detail/subresource
   tương ứng; inventory gate kiểm điều đó.

**Good** — summary DTO riêng + `select` trực tiếp:

```ts
// application.dto.ts
export const applicationSummarySchema = z.strictObject({ id, name, kind, status, vendor: vendorBrief, businessOwner });
export const applicationDetailSchema = applicationSummarySchema.extend({ domains, communication, similarApplications });
// application.repo.ts
tx.application.findMany({
  where,
  select: { id: true, name: true, kind: true, catalogStatus: true, vendor: { select: { id: true, name: true } } },
  orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
  skip,
  take,
});
```

**Bad** — danh sách trả schema detail và nạp cả đồ thị quan hệ:

```ts
export class ApplicationPageResponseDto extends createZodDto(page(applicationSchema)) {} // domains, note, relations
tx.application.findMany({ where, include: { vendor: true, functionalGroup: true } }); // đọc đủ cột của hai bảng
```

**Bad workaround** — giữ nguyên chi phí đọc hoặc che việc dùng lại:

```ts
const rows = await repo.listWithFullGraph(); // nạp đủ rồi cắt ở controller
return rows.map(({ domains, communicationNote, ...rest }) => rest);
export const applicationListItemSchema = applicationSchema; // bí danh che việc dùng lại schema detail
// "danh mục nhỏ nên không cần phân trang" — không có AC/ràng buộc chứng minh business maximum
```

### Inventory gate (`LD-R2`)

- Nguồn sự thật: mọi operation `GET` của tài liệu OpenAPI dựng từ controller. Một operation là _collection_ khi schema
  `data` có `items: array` hoặc là mảng ở gốc; gate không đoán theo tên method.
- Mỗi collection phải: (a) có `pageSize` với `maximum` **hoặc** một mục registry `bounded` có `businessMaximum` — `maxItems`
  số nguyên dương của toàn response + nguồn (AC/FR/hằng số/CHECK); biên theo cha/năm/nhóm không đủ (`LD-15`); (b) item schema không trùng cấu trúc với schema của một operation detail cùng resource, **hoặc** một mục
  registry `detail-reuse` ghi đúng `operationId`, lý do, chủ, điều kiện gỡ; (c) có tên schema riêng trong code (component
  `…SummaryDto`/`…ListItemDto` hoặc mục registry).
- Registry khởi đầu = đúng các vi phạm còn sau review (bảng dưới); mỗi mục mang tên hạng mục capability gỡ nó. Gate đỏ khi
  thêm collection mới vi phạm, khi một mục registry không còn khớp operation (đã sửa mà quên gỡ), hoặc khi mục thiếu
  trường. Registry chỉ được co lại (như legacy ledger kiến trúc). `detail-reuse.maxItems` phải bằng đúng `pageSize.maximum`
  của operation (`LD-R2-RV-03`, Prompt 09B).
- **Mảng lồng (Prompt 09B, `LD-R2-RV-02`):** gate đi đệ quy mọi mảng dưới `data` của mọi `GET` — item của collection, phần
  còn lại của `data`, detail, object, union, map, item của mảng khác; `$ref` có chặn vòng lặp — và đối chiếu với registry
  chính xác `NESTED_ARRAYS` khóa `operationId#path` (thay `RESOURCE_ARRAYS` nông và phân loại `nested-bound`). Mỗi mảng
  đúng một mục: `bounded` (`maxItems` + nguồn chính xác, bằng `maxItems` của schema nếu có), `unbounded` (finding + chủ),
  `owner-decision` (`LD-13`). `INITIAL_NESTED_ARRAYS` đóng băng khóa **kèm phân loại**: thêm khóa hay đổi phân loại cần
  quyết định Owner.
- Gate DTO không phát hiện nạp thừa ở query; vì vậy mỗi hạng mục capability thêm test đặc tả bằng harness `LD-R3`.

### Harness projection/số query (`LD-R3`)

- `test/support/query-count.ts` trả `{ run(fn) → { result, statements: string[] } }` trên database dùng riêng; chỉ ghi
  văn bản SQL, không ghi giá trị bind.
- Mẫu test của hạng mục capability: dựng fixture tất định ở cỡ tối đa đã khai (ví dụ 100 dòng × mảng tối đa), gọi HTTP
  thật, khẳng định (1) số câu lệnh ≤ hằng số không phụ thuộc số dòng, (2) không câu lệnh nào đọc bảng/cột chỉ detail cần,
  (3) kích thước body ≤ biên khai trong spec. Không công bố ngưỡng thời gian.

### Registry khởi đầu (vi phạm còn sau review, mỗi mục một chủ)

Bảng thiết kế gốc (Prompt 08) giữ nguyên dưới đây để truy vết. **Registry thật** (Prompt 09) là `COLLECTION_EXCEPTIONS` trong
gate: sau Prompt 09A **35 mục** trên 28 operation (`detail-reuse` 4 · `detail-projection` 2 · `unbounded` 5 · `bounded` 5 ·
`nested-bound` 1 · `query` 11 · `owner-decision` 7); **sau Prompt 09B 34 mục trên 27 operation** — mục
`vendorTaxProfileHistory#nested-bound` chuyển thành `vendorTaxProfileHistory#lines` của `NESTED_ARRAYS` (67 mục, mục
_Mảng lồng_ dưới). Khác bảng gốc, đều do inventory chính xác phát hiện trên `openapi.json` hoặc do Owner review:

- **Prompt 09A (`LD-R2-RV-01` → `LD-15`):** `departmentWarningList` và `nonWorkingDateList` sửa từ `bounded` sang `unbounded`.
  Tối đa hai cảnh báo **mỗi phòng đang hoạt động** không chặn response vì số phòng không có trần; một dòng mỗi ngày (khóa duy
  nhất) không chặn response vì `from`/`to` tùy chọn — gọi không khoảng trả mọi năm đã ghi. Chủ gỡ: lần lượt
  `organization-identity-read-contracts` và `g2-fiscal-year-operating-parameters`; gỡ khi có phân trang thật hoặc trần cứng
  của toàn response (với ngày nghỉ, bắt buộc cả hai đầu khoảng kèm khoảng tối đa chứng minh được cũng hợp lệ). Hợp đồng nào
  chưa chọn, chưa hiện thực. Cùng lượt, `businessMaximum` đổi từ câu chữ `limit` sang `maxItems` (số nguyên dương) +
  `source`; gate từ chối 0, số âm, số lẻ, `NaN`, vô hạn, chuỗi, thiếu giá trị và nguồn rỗng. Đây là hai thay đổi khóa duy nhất
  của `INITIAL_EXCEPTION_KEYS`, do Owner cho phép.

- **Thêm** `applicationBusinessOwnerHistory` (`unbounded`, `LD-06`) và `operatingParameterList` (`bounded`, 15 định nghĩa) —
  không phân trang nhưng bảng gốc không ghi.
- `standardToolsetList`/`History` có thêm mục `detail-reuse` (item trùng hình `standardToolsetGet.toolset`), ngoài `query`.
- `vendorGroupList` và `vendorSuggestionList` **không** ghi `bounded`: biên `T-D2` chỉ là giả định (điểm 7) ⟹
  `owner-decision` và `unbounded`.
- Bảy quyết định `LD-13` có mục trên operation tương ứng (điểm 1 — danh sách hợp đồng — chưa có operation nên không có mục);
  Prompt 09 ghi `vendorTaxProfileHistory` là `nested-bound` (`lines` ≤ 20) — từ 09B là mục của `NESTED_ARRAYS`.
- Prompt 09: ngoài registry, gate có hai danh sách chính xác: `NON_ENVELOPE_COLLECTIONS` (`vendorSuggestionList` →
  `candidates`) và `RESOURCE_ARRAYS` (13 operation không phải collection, 22 mảng ở đỉnh `data`). _Đính chính 09B:_
  `RESOURCE_ARRAYS` chỉ thấy mảng nông và phân loại `nested-bound` chỉ có một mục, nên mảng lồng mới hay sâu hơn qua được
  gate (`LD-R2-RV-02`); cả hai được thay bằng inventory đệ quy + `NESTED_ARRAYS`. `NON_ENVELOPE_COLLECTIONS` giữ nguyên.

Giới hạn: gate không thấy query (N+1, phân trang trong bộ nhớ, đếm ngoài snapshot) — các mục `query` chỉ được gỡ khi hạng mục chủ
chứng minh bằng harness. OpenAPI hiện không khai `maxItems` cho mảng lồng nào, nên biên của 56 mục `bounded` nằm ở nguồn ngoài
schema (hằng số, validation, ràng buộc CSDL, cách code dựng mảng) — gate không đọc nguồn đó; điều kiện xem lại của mỗi mục
kích hoạt ở thay đổi đầu tiên của nguồn (`LD-R2-RV-03`).

| `operationId`                       | Vi phạm                                                        | Chủ gỡ                                       |
| ----------------------------------- | -------------------------------------------------------------- | -------------------------------------------- |
| `applicationList`                   | dùng `applicationSchema` (detail-lite), include quan hệ đủ cột | `catalog-application-plan-read-contracts`    |
| `planList`                          | dùng `planSchema` có `revocationNote`                          | `catalog-application-plan-read-contracts`    |
| `subscriptionList`                  | dùng chung `subscriptionSchema`, tax đọc từng dòng             | `catalog-subscription-read-model`            |
| `planWarningList`                   | phân trang trong bộ nhớ sau khi quét mọi thuê bao `TERM`       | `catalog-subscription-read-model`            |
| `subscriptionCostAllocationHistory` | Cost Center đọc từng phiên bản                                 | `catalog-subscription-read-model`            |
| `standardToolsetList`               | N+1 phiên bản + gói; thứ tự theo UUID                          | `catalog-standard-toolset-read-batching`     |
| `standardToolsetHistory`            | N+1 gói theo phiên bản                                         | `catalog-standard-toolset-read-batching`     |
| `provisioningTaskList`              | dùng chung `taskSchema` (bằng chứng, lỗi, bước); plan N+1      | `licensing-provisioning-task-read-contracts` |
| `departmentToolsInUse`              | phân trang trong bộ nhớ                                        | `licensing-assignment-read-contracts`        |
| `licenseAssignmentList`             | chỉ id; không `select`                                         | `licensing-assignment-read-contracts`        |
| `licenseKeyList`                    | đếm + trang ngoài một snapshot                                 | `licensing-assignment-read-contracts`        |
| `projectList`                       | không phân trang, không biên                                   | `organization-identity-read-contracts`       |
| `departmentMemberList`              | đếm + trang ngoài một snapshot                                 | `organization-identity-read-contracts`       |
| `costCenterEmployeeList`            | đếm + trang ngoài một snapshot                                 | `organization-identity-read-contracts`       |

Ngoại lệ `bounded` có chủ thật (không gỡ, ghi lý do và điều kiện xem lại): `currencyList` (11 mã seed, không route ghi —
chủ `g3-money-and-exchange-rates`); ~~`departmentWarningList` (≤ 2 × số phòng đang hoạt động — `g2-department-profile`)~~ —
sai, nay `unbounded` (`LD-15`); `approvalRoleList` (3 vai, lịch sử ≤ 20 — `g2-approval-roles`); `operatingParameterHistory`
(20 mới nhất theo spec — `g2-operating-parameters`); ~~`nonWorkingDateList` (khoảng ngày — `g2-operating-parameters`)~~ —
sai, nay `unbounded` (`LD-15`); `accountCandidatesList`
(picker ≤ 20 — `us-01-account-invitation-activation`); `vendorGroupList` (từ điển dùng chung, biên theo giả định `T-D2`,
cần Owner xác nhận — `g3-vendor-dictionary`); `vendorSuggestionList` (gợi ý theo tên — `g3-vendor-dictionary`);
`vendorTaxProfileHistory` (phân trang, item là phiên bản đủ dòng ≤ 20 — `g3-vendor-tax-profile`).

### Mảng lồng (Prompt 09B, `LD-R2-RV-02`, `LD-R2-RV-03`)

Inventory đệ quy trên `openapi.json` (`6508c953…`, 61 `GET`: 37 collection, 24 khác) có **104 mảng**: **37 mảng collection**
cấp trên cùng (`data`, `data.items` hoặc `data.candidates`) và **67 mảng lồng** — 25 trong item collection (22 trực tiếp, 3
sâu hơn), 1 trong phần còn lại của `data` collection (`departmentToolsInUse#data.summary`), 41 trong detail. Kiểm bằng một
script độc lập với gate: không thiếu, không thừa khóa nào. `NESTED_ARRAYS` có 67 mục: `bounded` 56 · `unbounded` 10 ·
`owner-decision` 1. Nguồn từng biên (hằng số, validation, ràng buộc CSDL, cách code dựng mảng) đã đọc tận nơi; không biên
nào lấy từ cỡ dữ liệu dự kiến, fixture, tính duy nhất theo cha/ngày hay query không có giới hạn cứng.

Mục không `bounded` (11):

| Khóa                                                         | Phân loại        | Finding | Chủ                                       |
| ------------------------------------------------------------ | ---------------- | ------- | ----------------------------------------- |
| `departmentGet#projects`                                     | `unbounded`      | `LD-12` | `organization-identity-read-contracts`    |
| `appUserGet#roleHistory`                                     | `unbounded`      | `LD-14` | `organization-identity-read-contracts`    |
| `applicationGet#similarApplications`                         | `unbounded`      | `LD-06` | `catalog-application-plan-read-contracts` |
| `planTermsGet#opinions`                                      | `unbounded`      | `LD-06` | `catalog-application-plan-read-contracts` |
| `applicationRetirementGet#retirement.confirmations`          | `unbounded`      | `LD-06` | `catalog-application-plan-read-contracts` |
| `applicationRetirementGet#retirement.blockers.assignments`   | `unbounded`      | `LD-06` | `catalog-application-plan-read-contracts` |
| `applicationRetirementGet#retirement.blockers.subscriptions` | `unbounded`      | `LD-06` | `catalog-application-plan-read-contracts` |
| `departmentToolsInUse#data.summary`                          | `unbounded`      | `LD-09` | `licensing-assignment-read-contracts`     |
| `planTermsGet#warnings`                                      | `unbounded`      | `LD-16` | `catalog-subscription-read-model`         |
| `onboardingChecklistGet#steps.warnings`                      | `unbounded`      | `LD-16` | `api-list-detail-contract-remediation`    |
| `vendorGroupList#serviceLines`                               | `owner-decision` | `LD-13` | `api-list-detail-contract-remediation`    |

**`LD-16`** — mảng lồng không biên mà chưa finding nào phủ, hai vế:

1. `planTermsGet#warnings` — một cảnh báo `TERMS_REVIEW_DUE` cho mỗi thuê bao đang chạy của gói (`warningsFor` trong
   `plan-terms.service.ts`); số thuê bao của một gói không có trần. Chủ: `catalog-subscription-read-model` (đã giữ phần cảnh
   báo điều khoản của `catalog/plan-terms` — `warningsFor` chung với `planWarningList`, `LD-02`).
2. `onboardingChecklistGet#steps.warnings` — bước 1 liệt kê `MISSING_HEAD`, `MISSING_IT_ADMIN` cho mỗi phòng đang hoạt
   động; số phòng không có trần (cùng bản chất với `departmentWarningList`, `LD-15`). Không gói remediation hiện có nào sở
   hữu module `onboarding` một cách trung thực, nên vế này **giữ ở hạng mục này**. Ánh xạ gói tương lai cần Owner chốt: gói
   nhận phải đi cùng hợp đồng biên của cảnh báo phòng mà `organization-identity-read-contracts` chọn cho `LD-15`, và sửa
   `modules/onboarding` (lát gốc `g2-onboarding-checklist`) — hoặc mở rộng phạm vi `organization-identity-read-contracts`,
   hoặc một gói remediation riêng cho onboarding. Không gộp vào hạng mục Story `g2-onboarding-checklist`.

Hợp đồng của cả hai vế (biên chứng minh được hay dạng phân trang) **chưa chọn, chưa hiện thực**.

Mục `bounded` theo chủ nguồn: `g2-employee-import-preview-confirm` 8, `g3-subscription-purchase` 6, `g2-department-profile` 5,
`us-01-bootstrap-login-session` 4, `g3-standard-toolset` 4, `g3-vendor-tax-profile` 4, `g3-vendor-dictionary` 3,
`g2-operating-parameters` 3, `g3-catalog-entry` 3, `g2-onboarding-checklist` 3, `g4-provisioning-queue-manual` 2,
`g4-provisioning-failure-handling` 2, `g4-seat-baseline-import` 2, `g3-shared-cost-allocation` 2,
`us-01-account-invitation-activation` 2, `us-01-audit-trail-query` 1, `g3-plan-declaration` 1, `g2-approval-roles` 1 — danh
sách đủ, nguồn và điều kiện xem lại nằm trong `NESTED_ARRAYS`. Hai mục `bounded` còn mang `LD-14` (thiếu `hasMore`, không
phải thiếu biên): `departmentGet#headHistory` (50), `approvalRoleList#history` (20).

**Đối chiếu biên (`LD-R2-RV-03`):** `detail-reuse.maxItems` của bốn mục bằng `pageSize.maximum` 100 (gate so); điều kiện xem
lại của `currencyList` (mọi thêm/bớt mã, route ghi, đổi tập seed), `operatingParameterList` (mọi thêm/bớt định nghĩa, đổi
`parameter-definitions.ts`), `approvalRoleList` (`APPROVAL_ROLES`), `operatingParameterHistory` (`HISTORY_LIMIT`),
`accountCandidatesList` (`CANDIDATE_LIMIT`) và mọi mục `NESTED_ARRAYS` nêu đúng hằng số, enum, validation hay tập dữ liệu
nguồn.

### Cần Owner quyết (chặn hạng mục capability tương ứng, không chặn hạng mục này)

1. **Danh sách hợp đồng và tệp của hợp đồng** (`Q5` của báo cáo PR #14): thêm `GET /contracts` và danh sách tệp của một hợp
   đồng hay không — hiện không có collection nào, `contractGet` chỉ mở được khi đã biết id.
2. **Đề xuất của từ điển nhà cung cấp:** đưa `proposedDomains`, `sourceApplicationId` vào item hay thêm
   `GET /vendor-dictionary/proposals/{id}` — IT Admin xử lý đề xuất hiện chỉ thấy tên.
3. **Danh sách thuê bao giữ `taxEstimate`, `priceSnapshot`, `alerts` trên mọi dòng** như spec `g3-subscription-purchase`
   hay chuyển sang detail — cách đọc theo lô (`LD-01`) cần trong cả hai trường hợp.
4. **Audit Trail:** item giữ `before`/`after` đầy đủ (spec `us-01-audit-trail-query` chọn) hay danh sách gọn +
   `GET /audit-events/{id}`; giới hạn kích thước payload audit.
5. **Định danh trên thẻ tác vụ và Assignment:** nhúng `{employeeCode, fullName}` cho người thụ hưởng, người phụ trách mặc
   định, `claimedBy`… (IT Admin không đọc được `/app-users`, không có `GET /employees`) — chọn trường hiển thị.
6. **Mô tả chức năng phòng ở danh sách:** giữ `function` (tối đa 1000 ký tự) trong `departmentList` hay chỉ trả ở
   `departmentGet`; nếu giữ, ghi rõ đây là trường cần để chọn phòng chứ không phải reuse detail DTO.
7. **Biên từ điển nhà cung cấp `T-D2`:** xác nhận business maximum cho số dòng dịch vụ nhúng trong mỗi nhóm, hoặc tách/
   phân trang subresource; không ghi ngoại lệ `bounded` chỉ dựa trên giả định dữ liệu sẽ nhỏ.

## Test matrix

| AC / rủi ro       | Tình huống (gồm từ chối, edge case)                                                                                                                              | Cấp test    | Kết quả mong đợi                                             | Bằng chứng sau implement                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `LD-R2`           | collection mới dùng schema của detail, không có mục registry                                                                                                     | unit        | gate đỏ, nêu `operationId` và schema                         | fixture + đột biến M2 thật (xem plan); stub đỏ 7/7 trước                                  |
| `LD-R2`           | collection không có `pageSize.maximum` và không có mục `bounded`                                                                                                 | unit        | gate đỏ                                                      | fixture + đột biến M1 thật                                                                |
| `LD-R2`           | mục registry còn sau khi hạng mục capability đã sửa operation                                                                                                    | unit        | gate đỏ: mục thừa phải gỡ                                    | fixture + đột biến M3 thật (`openapi.json`)                                               |
| `LD-R2`           | mục registry dùng glob/hậu tố hoặc thiếu chủ/lý do/điều kiện gỡ                                                                                                  | unit        | gate đỏ                                                      | fixture + đột biến M4 thật                                                                |
| `LD-R2`           | registry thêm mục ngoài danh sách khởi đầu; danh sách trốn dưới tên khác                                                                                         | unit        | gate đỏ                                                      | đột biến M5, M6 thật                                                                      |
| `LD-R2` hồi quy   | 61 `GET` hiện có với registry khởi đầu                                                                                                                           | unit        | xanh                                                         | 11/11; sau 09A 14/14                                                                      |
| `LD-R2` / `LD-15` | mục `bounded`/`detail-reuse`/`nested-bound` có `maxItems` 0, âm, lẻ, `NaN`, vô hạn, chuỗi, thiếu, chỉ câu chữ hoặc nguồn rỗng                                    | unit        | gate đỏ                                                      | 09A: đỏ trước (gate không đọc được số), xanh sau; đột biến M10–M13                        |
| `LD-15` hồi quy   | hai mục khai lại `bounded` bằng biên mỗi phòng / mỗi năm (câu chữ Prompt 09 hoặc số 2/366)                                                                       | unit        | gate đỏ: thiếu `maxItems` hoặc khóa ngoài danh sách khởi đầu | 09A: đỏ trước, xanh sau; đột biến M7–M9                                                   |
| `LD-R2-RV-02`     | mảng chưa đăng ký trong item collection, trong phần còn lại của `data`, sâu hai tầng object trong detail, trong item của mảng khác; union, map, `$ref` vòng lặp  | unit        | gate đỏ: `…: array not in NESTED_ARRAYS`                     | 09B: đỏ trước (gate không thấy), xanh sau; đột biến O1–O3 trên `openapi.json` thật, G6–G7 |
| `LD-R2-RV-02`     | mục `NESTED_ARRAYS` stale; khóa dạng pattern; thiếu chủ/lý do; `unbounded` thiếu finding hay có maximum; `owner-decision` thiếu `LD-13`; `maxItems` không hợp lệ | unit        | gate đỏ                                                      | 09B: đỏ trước, xanh sau; đột biến G1, G5                                                  |
| `LD-R2-RV-02`     | khóa ngoài `INITIAL_NESTED_ARRAYS` hoặc đổi phân loại (vd. `planTermsGet#warnings` thành `bounded`)                                                              | unit        | gate đỏ ở test _only ever shrinks_                           | 09B: đỏ trước (khóa chỉ so tên), xanh sau; đột biến G3, G4                                |
| `LD-R2-RV-03`     | `detail-reuse.maxItems` khác `pageSize.maximum`; `maxItems` khác `maxItems` của schema                                                                           | unit        | gate đỏ, nêu cả hai số                                       | 09B: đỏ trước, xanh sau; đột biến G2, O4, G8, G9                                          |
| `LD-R3`           | harness đếm câu lệnh của một list mẫu trên database riêng; không ghi giá trị bind                                                                                | integration | đếm đúng, văn bản SQL không chứa tham số                     | `exchangeRateList`: 12 câu lệnh cho 5 và 60 tỷ giá, không bind                            |
| `LD-R3`           | per-row query cố ý trong fixture; statement prepare chạy lại                                                                                                     | integration | harness thấy fan-out và đếm lần chạy lại                     | đột biến H1, H2 thật                                                                      |
| `LD-R1`           | rule có Good/Bad/Bad workaround; link từ `api-contract.md`, `pnpm rules:check` xanh                                                                              | tài liệu    | xanh                                                         | xanh                                                                                      |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `LD-R1`
      → `LD-R3` (enabler không claim Story).
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP không đổi — local; remote CI
      `UNVERIFIED`.
- [x] Spec/plan/roadmap phản ánh implementation cuối; registry khởi đầu khớp inventory (khác bảng gốc ghi ở trên).
- [x] Không tăng legacy ledger kiến trúc; registry mới chỉ được co lại.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 08 từ audit collection/detail của review hậu merge. Chưa code, chưa review, chưa nghiệm thu.

22/10/2026 (Prompt 09, Remediation Wave 0 — Phase B): `LD-R1` → `LD-R3` triển khai và kiểm chứng cục bộ; không đổi HTTP,
DTO hay query. Bảy quyết định `LD-13` vẫn mở; không hạng mục capability nào bắt đầu. Chưa có Owner review hay remote CI.

23/10/2026 (Prompt 09A, sửa trong cùng checkpoint): Owner review mở `LD-R2-RV-01`; `LD-15` ghi hai mục `unbounded` có chủ,
`businessMaximum.maxItems` bắt buộc là số nguyên dương, rule có ví dụ Bad. Chỉ đổi gate và tài liệu; runtime, OpenAPI không
đổi. Chưa có Owner review cuối hay remote CI.

23/10/2026 (Prompt 09B, sửa cuối trong cùng checkpoint): review mở `LD-R2-RV-02`, `LD-R2-RV-03`. Inventory đệ quy 104 mảng
(37 collection + 67 lồng), `NESTED_ARRAYS` 67 mục đóng băng kèm phân loại thay `RESOURCE_ARRAYS` và `nested-bound`;
`detail-reuse.maxItems` = `pageSize.maximum`; `maxItems` = `maxItems` của schema khi có; điều kiện xem lại theo nguồn;
`LD-16` hai vế. Chỉ đổi gate và tài liệu; runtime, OpenAPI không đổi. Chưa có Owner review cuối hay remote CI.

23/10/2026 (Prompt 10): các hạng mục chủ đã gỡ mục registry tương ứng: registry `COLLECTION_EXCEPTIONS` còn **14 mục trên 12 operation** (`detail-reuse` 3, `bounded` 5, `owner-decision` 5, `unbounded` 1) và `NESTED_ARRAYS` **63 mục** (`bounded` 60, `unbounded` 2, `owner-decision` 1); các mục `query` đã gỡ khi test harness chứng minh, và `departmentWarningList`, `nonWorkingDateList`, `projectList` không còn mục vì đã phân trang. Mục mới `projectGet#departments` (`bounded`, route mới ở `organization-identity-read-contracts`). Chưa có Owner review cuối; bảy điểm `LD-13` còn chờ Owner (xem review mục 11).

## Mở lại theo baseline `769bb64` (Prompt 03, 26/10/2026)

- Audit G0–G6 trên Docs `769bb64` ↔ BE `7c28e75` mở lại hạng mục này: F55 — `LD-13` điểm 1 → 7 còn mở (P03-D14).
- Remediation duy nhất: [g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md) ([impact matrix](../g0-g6-final-business-baseline-remediation/impact-matrix.md#3-findings)). AC liên quan không còn được coi là thỏa nguồn hiện hành cho tới khi remediation xong; trạng thái triển khai ở roadmap. Phần đã ghi phía trên là lịch sử, giữ nguyên.

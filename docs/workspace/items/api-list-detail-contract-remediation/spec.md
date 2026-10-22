# Spec: quy tắc và gate collection/detail (`API-LIST-DETAIL.1`)

- Phụ trách: chưa phân công (đề xuất: người giữ gate kiến trúc/OpenAPI).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review — cần Owner xem bảy điểm _Cần Owner quyết_ ở cuối mục _Behavior and
  design_ trước khi các hạng mục capability chuyển `ready`.
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

| Story | AC      | Coverage | Phần còn lại thuộc                                                                             |
| ----- | ------- | -------- | ---------------------------------------------------------------------------------------------- |
| —     | `LD-R1` | n/a      | gỡ chặn `catalog-application-plan-read-contracts`, `catalog-subscription-read-model`           |
| —     | `LD-R2` | n/a      | gỡ chặn `catalog-standard-toolset-read-batching`, `licensing-provisioning-task-read-contracts` |
| —     | `LD-R3` | n/a      | gỡ chặn `licensing-assignment-read-contracts`, `organization-identity-read-contracts`          |

`LD-R1` = rule trong `docs/rules/api-contract.md`; `LD-R2` = inventory gate + registry ngoại lệ chính xác; `LD-R3` =
harness đặc tả projection và số query của repository danh sách.

## Supporting references

- Review: [mục 4](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#4-collection-và-detail-api-list-detail1) —
  ma trận đủ 61 `GET`, defect `LD-01` → `LD-14`.
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

- `docs/rules/api-contract.md` (mục _Collection và detail_ mới).
- Gate mới `src/api-collection-contract.spec.ts` (unit, chạy trong `pnpm check`) đọc tài liệu OpenAPI dựng trong bộ nhớ
  như `test/e2e/api-inventory.e2e-spec.ts` hoặc đọc `openapi.json` đã commit (chọn khi `ready`; đọc artifact thì phải chuẩn
  hóa xuống dòng — xem `delivery-gate-hardening`), cùng registry `src/api-collection-contract.registry.ts`.
- Harness `test/support/query-count.ts`: đếm câu lệnh qua event `query` của Prisma client dựng riêng cho test, hoặc qua
  `pg_stat_statements` của database dùng riêng; không đổi `PrismaService` sản phẩm.
- Không đổi route, DTO, Prisma schema hay migration.

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
- Mỗi collection phải: (a) có `pageSize` với `maximum` **hoặc** một mục registry `bounded` có `businessMaximum` + nguồn
  (AC/FR/CHECK); (b) item schema không trùng cấu trúc với schema của một operation detail cùng resource, **hoặc** một mục
  registry `detail-reuse` ghi đúng `operationId`, lý do, chủ, điều kiện gỡ; (c) có tên schema riêng trong code (component
  `…SummaryDto`/`…ListItemDto` hoặc mục registry).
- Registry khởi đầu = đúng các vi phạm còn sau review (bảng dưới); mỗi mục mang tên hạng mục capability gỡ nó. Gate đỏ khi
  thêm collection mới vi phạm, khi một mục registry không còn khớp operation (đã sửa mà quên gỡ), hoặc khi mục thiếu
  trường. Registry chỉ được co lại (như legacy ledger kiến trúc).
- Gate DTO không phát hiện nạp thừa ở query; vì vậy mỗi hạng mục capability thêm test đặc tả bằng harness `LD-R3`.

### Harness projection/số query (`LD-R3`)

- `test/support/query-count.ts` trả `{ run(fn) → { result, statements: string[] } }` trên database dùng riêng; chỉ ghi
  văn bản SQL, không ghi giá trị bind.
- Mẫu test của hạng mục capability: dựng fixture tất định ở cỡ tối đa đã khai (ví dụ 100 dòng × mảng tối đa), gọi HTTP
  thật, khẳng định (1) số câu lệnh ≤ hằng số không phụ thuộc số dòng, (2) không câu lệnh nào đọc bảng/cột chỉ detail cần,
  (3) kích thước body ≤ biên khai trong spec. Không công bố ngưỡng thời gian.

### Registry khởi đầu (vi phạm còn sau review, mỗi mục một chủ)

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
chủ `g3-money-and-exchange-rates`); `departmentWarningList` (≤ 2 × số phòng đang hoạt động — `g2-department-profile`);
`approvalRoleList` (3 vai, lịch sử ≤ 20 — `g2-approval-roles`); `operatingParameterHistory` (20 mới nhất theo spec —
`g2-operating-parameters`); `nonWorkingDateList` (khoảng ngày — `g2-operating-parameters`); `accountCandidatesList`
(picker ≤ 20 — `us-01-account-invitation-activation`); `vendorGroupList` (từ điển dùng chung, biên theo giả định `T-D2`,
cần Owner xác nhận — `g3-vendor-dictionary`); `vendorSuggestionList` (gợi ý theo tên — `g3-vendor-dictionary`);
`vendorTaxProfileHistory` (phân trang, item là phiên bản đủ dòng ≤ 20 — `g3-vendor-tax-profile`).

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

| AC / rủi ro     | Tình huống (gồm từ chối, edge case)                                                 | Cấp test    | Kết quả mong đợi                         | Bằng chứng sau implement |
| --------------- | ----------------------------------------------------------------------------------- | ----------- | ---------------------------------------- | ------------------------ |
| `LD-R2`         | collection mới dùng schema của detail, không có mục registry                        | unit        | gate đỏ, nêu `operationId` và schema     | chưa chạy                |
| `LD-R2`         | collection không có `pageSize.maximum` và không có mục `bounded`                    | unit        | gate đỏ                                  | chưa chạy                |
| `LD-R2`         | mục registry còn sau khi hạng mục capability đã sửa operation                       | unit        | gate đỏ: mục thừa phải gỡ                | chưa chạy                |
| `LD-R2`         | mục registry dùng glob/hậu tố hoặc thiếu chủ/lý do/điều kiện gỡ                     | unit        | gate đỏ                                  | chưa chạy                |
| `LD-R2` hồi quy | 61 `GET` hiện có với registry khởi đầu                                              | unit        | xanh                                     | chưa chạy                |
| `LD-R3`         | harness đếm câu lệnh của một list mẫu trên database riêng; không ghi giá trị bind   | integration | đếm đúng, văn bản SQL không chứa tham số | chưa chạy                |
| `LD-R1`         | rule có Good/Bad/Bad workaround; link từ `api-contract.md`, `pnpm rules:check` xanh | tài liệu    | xanh                                     | chưa chạy                |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `LD-R1`
      → `LD-R3` (enabler không claim Story).
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP không đổi.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; registry khởi đầu khớp bảng trên.
- [ ] Không tăng legacy ledger kiến trúc; registry mới chỉ được co lại.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 08 từ audit collection/detail của review hậu merge. Chưa code, chưa review, chưa nghiệm thu.

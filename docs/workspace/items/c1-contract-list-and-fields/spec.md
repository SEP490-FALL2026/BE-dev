# Spec: Hợp đồng với nhà cung cấp — trường, danh sách, chi tiết, tệp, thuê bao liên kết

- Phụ trách: Cursor/dev được Owner giao.
- Thiết kế ban đầu bởi: Owner + Claude (phiên 05/11/2026).
- Thiết kế: `ready`. Owner review: thiết kế đã duyệt 05/11/2026
  ([DESIGN.md](../../../reviews/g7-usage-design-2026-11-05/DESIGN.md) §6); spec chưa review.
- Nguồn: Docs `3d73a7f` + thay đổi chưa commit 05/11/2026 (`QĐ-101k`, `QĐ-101l`; BRD v4.1 `FR-1.13`, `FR-1.5`; US đã sửa:
  `US-04-13` mới 14 AC, `US-04-04` AC-13 mới — `BE-UserStory/src/EP-04.md`), BE `3e4553b9`.
- Nhóm roadmap: G3 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · [Test plan](test-plan.md).

## Business outcome

IT Admin ghi mỗi văn bản đã ký với nhà cung cấp thành hợp đồng có loại, số, nhà cung cấp, hiệu lực; sửa có lý do; liên
kết thuê bao cùng nhà cung cấp; IT Admin và Finance tìm/lọc/sắp xếp danh sách, xem chi tiết, thuê bao và tệp `READY` của
từng hợp đồng; vai khác bị 403. Kiểm được bằng HTTP integration trên PostgreSQL thật và e2e quyền.

## Sizing decision

- Container: G3 (EP-04), giao theo DESIGN.md §12 (lát C1).
- Mode: `grouped-stories`.
- Outcome and owner: hồ sơ hợp đồng tra cứu được và gắn đúng thuê bao; capability `catalog/contract` (ghi `contracts`,
  đọc `document_attachments`, `subscriptions`), cộng một vế ở `catalog/subscription` (cột `contract_id` qua PATCH có sẵn).
- Boundaries: một migration (`contracts` thêm cột, trigger mới, `subscriptions.contract_id`); mỗi lệnh ghi một transaction
  (`POST`/`PATCH /contracts`, `PATCH /subscriptions/{id}`); bốn route đọc; không job, không sự kiện; quyền `IT_ADMIN` ghi,
  `IT_ADMIN`+`FINANCE` đọc.
- Not larger: `US-04-04` AC-5 (Người duyệt chi mở tệp hồ sơ được giao) cần hồ sơ gia hạn G8; đính tệp vào thuê bao (AC-12)
  là việc của `qd96-100-catalog-api-fields`; nhắc gia hạn theo hợp đồng không tồn tại (mốc ở thuê bao).
- Not smaller: danh sách (AC-10) cần các cột mới; khóa nhà cung cấp (AC-8) cần liên kết (AC-6); tệp của hợp đồng
  (`US-04-04` AC-13) là tab của cùng màn chi tiết (AC-11) trên cùng bảng và quyền. Tách thì hai migration nửa vời và hai
  ma trận test lặp cùng fixture. Hai Story thỏa đủ năm điều kiện của quy tắc 3: cùng actor IT Admin/Finance, cùng
  `catalog/contract`, rollback cùng nhau, ma trận gộp dễ đọc, từng AC truy vết riêng.
- Siblings: `g3-contract-documents` (tệp, liên kết mở), `qd96-100-catalog-api-fields` (đụng `contract.dto.ts`, đích tệp
  thuê bao), `g3-downstream-finance-integration`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3).

## Primary Story/AC

| Story    | AC         | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                         |
| -------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-04-13 | AC-1→AC-14 | full     | —                                                                                                                                                                                                                                                                          |
| US-04-04 | AC-13      | partial  | AC-1→AC-3, AC-9, AC-10: `g3-contract-documents`; AC-4, AC-5, AC-7, AC-11: `g3-downstream-finance-integration`; AC-6: `g3-contract-documents` + `g3-downstream-finance-integration`; AC-8: `a05-bm06-signature-record`; AC-12: chưa có chủ trong scope map G3 (coordinator) |

## Supporting references

`QĐ-101k`, `QĐ-101l` (ERD/sơ đồ cố ý chưa đồng bộ), BRD `FR-1.13`(1)–(6), `FR-1.5`, `FR-1.3`, `FR-1.10`, `ADR-06`, `SoD-2`,
`QĐ-18`, `QĐ-19`, `QĐ-96d`, `OI-08a`. DESIGN.md §0 (F-1…F-6), §6, §11. Rule [API-LIST-DETAIL.1](../../../rules/api-contract.md#collection-và-detail-api-list-detail1).
Spec `g3-contract-documents` (vòng đời tệp, `mayOpen`), `g3-subscription-purchase` (PATCH thuê bao).

## Explicit out of scope

- Người duyệt chi mở tệp của hồ sơ được giao (`US-04-04` AC-5, `OI-08a`) — `g3-downstream-finance-integration`.
- Đính tệp vào thuê bao + kỳ (`US-04-04` AC-12, cột `document_attachments.subscription_id`) — `qd96-100-catalog-api-fields`.
- Chép liên kết hợp đồng sang kỳ gia hạn mới (licensing renewal tạo kỳ sau không có `contract_id`; IT liên kết tay).
- Ghi chú, tiền, số ngày báo trước, ngày gia hạn trên hợp đồng (DESIGN §6 "Không thêm"); xóa hợp đồng (AC-9).
- `contractId` trong `POST /subscriptions` (không có AC; liên kết sau qua PATCH — F-3 không field để dành).
- Tên người tạo trong chi tiết hợp đồng (giữ `createdBy` là id như wire hiện tại).

## Dependencies and blockers

- Không blocker. Migration (Task 1) đi trước mọi code. Không phụ thuộc lát G7.
- **Đụng file với `qd96-100-catalog-api-fields`** (phiên khác): `contract.dto.ts` (`name` bắt buộc — S-22), migration
  `document_attachments.subscription_id` (CHECK `READY ⟺ contract_id` sẽ đổi). C1 lấy cùng luật S-22 cho `name` (mục API)
  và lọc tệp bằng `status = 'READY' AND contract_id = $id` tường minh, nên đúng với cả hai thứ tự merge. Lát merge sau
  rebase và đặt timestamp migration sau migration đã merge (gate `migration-order`).

## Ownership: module, data, API

- Module `catalog` (T4), không đổi tầng, không facade mới, không extension point. Capability `contract` thêm file;
  `subscription` (đã 25 file) **không thêm file**. Cạnh capability mới: `subscription → contract` (facts + errors) và
  `contract → vendor` (`VendorRecordService.find`); `contract` không import `subscription` (đọc bảng `subscriptions` thẳng
  trong `contract.repo.ts`, cùng module ⟹ không vòng R6).
- Bảng: `contracts` (ghi), `subscriptions` (ghi cột `contract_id` qua `SubscriptionRepo`), đọc `document_attachments`,
  `vendors`, `plans`, `applications`. Liên module chỉ qua facade: `OrganizationReadApi.businessToday/getDepartmentBriefs/
getEmployees`, `IdentityAccessApi.employeeIdsOfAccounts` (đều đã có).
- Operation thêm: `contractList`, `contractUpdate`, `contractDocumentList`, `contractSubscriptionList`. Đổi:
  `contractCreate`, `contractGet` (wire mở rộng, vẫn bọc `{ contract }`), `subscriptionUpdate` (body thêm `contractId`),
  mọi response thuê bao thêm `contract` (`subscriptionList/Get/Create/Update/Complete`).

## Behavior and design

### Dữ liệu (migration `<ts>_catalog_contract_fields`)

```prisma
enum ContractKind { FRAMEWORK TERM PERPETUAL_PURCHASE }

model Contract { // thêm vào model có sẵn (catalog.prisma:461)
  kind                     ContractKind? // NULL chỉ ở hợp đồng cũ
  normalizedName           String        @map("normalized_name")             // searchKey(name)
  contractNumber           String?       @map("contract_number")
  normalizedContractNumber String?       @map("normalized_contract_number")  // searchKey(contractNumber)
  vendorId                 String?       @map("vendor_id") @db.Uuid
  validFrom                DateTime?     @map("valid_from") @db.Date
  validTo                  DateTime?     @map("valid_to") @db.Date
  updatedAt                DateTime      @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)
  vendor        Vendor?        @relation(fields: [vendorId], references: [id], onDelete: Restrict)
  subscriptions Subscription[]
  @@unique([organizationId, normalizedContractNumber]) // PostgreSQL coi NULL là khác nhau ⟹ hợp đồng không số không đụng nhau
  @@index([vendorId])
}
// Vendor: contracts Contract[] · Subscription: contractId String? @map("contract_id") @db.Uuid,
// contract Contract? @relation(fields: [contractId], references: [id], onDelete: Restrict), @@index([contractId])
```

SQL tay trong cùng migration (sau phần Prisma sinh): `DROP TRIGGER "contracts_immutable"` + `DROP FUNCTION
"contract_reject_change"()` **trước** backfill; backfill `normalized_name = lower(btrim(regexp_replace(regexp_replace(
normalize(name, NFD), '[̀-ͯ]', '', 'g'), '\s+', ' ', 'g')))`, `updated_at = created_at`; `SET NOT NULL`; CHECK:

```sql
CONSTRAINT "contracts_validity_order"  CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" >= "valid_from"),
CONSTRAINT "contracts_kind_validity"   CHECK ("kind" IS NULL
    OR ("kind" = 'PERPETUAL_PURCHASE' AND "valid_to" IS NULL)
    OR ("kind" IN ('FRAMEWORK', 'TERM') AND "valid_to" IS NOT NULL)),
CONSTRAINT "contracts_number_pair"     CHECK (("contract_number" IS NULL) = ("normalized_contract_number" IS NULL)
    AND ("contract_number" IS NULL OR length(btrim("contract_number")) > 0))
```

Trigger mới thay `contracts_immutable` (migration gốc `20261020250000…/migration.sql:67-77`):

```sql
CREATE FUNCTION "contract_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A contract is never deleted' USING ERRCODE = '55000', CONSTRAINT = 'contracts_kept';
  END IF;
  IF (NEW."id", NEW."organization_id", NEW."created_by_app_user_id", NEW."created_at")
     IS DISTINCT FROM (OLD."id", OLD."organization_id", OLD."created_by_app_user_id", OLD."created_at") THEN
    RAISE EXCEPTION 'Who made a contract and when never change' USING ERRCODE = '55000', CONSTRAINT = 'contracts_origin_fixed';
  END IF;
  IF (OLD."kind" IS NOT NULL AND NEW."kind" IS NULL) OR (OLD."vendor_id" IS NOT NULL AND NEW."vendor_id" IS NULL)
     OR (OLD."valid_from" IS NOT NULL AND NEW."valid_from" IS NULL) THEN
    RAISE EXCEPTION 'A field of a contract once given is never emptied' USING ERRCODE = '55000', CONSTRAINT = 'contracts_fields_kept';
  END IF;
  IF NEW."vendor_id" IS DISTINCT FROM OLD."vendor_id"
     AND EXISTS (SELECT 1 FROM "subscriptions" WHERE "contract_id" = OLD."id") THEN
    RAISE EXCEPTION 'The vendor of a contract with subscriptions never changes' USING ERRCODE = '55000', CONSTRAINT = 'contracts_vendor_locked';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "contracts_guard" BEFORE UPDATE OR DELETE ON "contracts" FOR EACH ROW EXECUTE FUNCTION "contract_guard"();
```

Trigger của `subscriptions` đều là `UPDATE OF <cột>` (`subscriptions_fit_plan`, `…_price_in_reporting_currency`,
`subscriptions_owner_immutable`, `subscriptions_renewal_chain`) ⟹ không chặn `contract_id` (đã kiểm `grep`, Task 1 có test).
H7: không bảng mới, `contracts` giữ DML đầy đủ (trigger chặn DELETE) ⟹ không đổi `RUNTIME_TABLE_EXCEPTIONS`; không model
mới ⟹ không đổi `PRISMA_MODEL_OWNER`; tiers không đổi.

### Trạng thái hiển thị (tính, không lưu — `contract-fields.policy.ts`)

`today = OrganizationReadApi.businessToday()` (theo `Organization.timeZone`, F-6). Thiếu `kind`/`vendorId`/`validFrom` ⟹
`INCOMPLETE`; `today < validFrom` ⟹ `NOT_YET_EFFECTIVE`; `validTo !== null && validTo < today` ⟹ `EXPIRED`; còn lại
`IN_EFFECT` (`PERPETUAL_PURCHASE` đã tới ngày luôn `IN_EFFECT`). Bộ lọc `status` trong SQL dùng đúng các vế này (test so).

### Request (mọi body `z.strictObject`; ngày `businessDate` của `business-date.dto.ts`)

| Route · field                                 | Kiểu & ràng buộc                                                              | Bắt buộc? (ca vắng)                                                 | Nguồn               | Dùng ở                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------ |
| POST `kind`                                   | `FRAMEWORK\|TERM\|PERPETUAL_PURCHASE`                                         | có                                                                  | IT đọc văn bản      | AC-1→AC-3, AC-7                                              |
| POST `name`                                   | trim, 1..200                                                                  | có                                                                  | IT                  | AC-1, AC-10 tìm                                              |
| POST `contractNumber`                         | trim, 1..100; key `searchKey` duy nhất/tổ chức                                | không — vắng = hợp đồng không số                                    | IT                  | AC-4, AC-10                                                  |
| POST `vendorId`                               | uuid, vendor tồn tại                                                          | có                                                                  | IT chọn từ danh mục | AC-5, AC-6                                                   |
| POST `validFrom`                              | ngày                                                                          | có                                                                  | IT                  | AC-12                                                        |
| POST `validTo`                                | ngày ≥ `validFrom`                                                            | theo `kind`: bắt buộc `TERM`/`FRAMEWORK`, cấm `PERPETUAL_PURCHASE`  | IT                  | AC-3, AC-12                                                  |
| PATCH `kind`, `name`, `vendorId`, `validFrom` | như POST                                                                      | không — vắng = giữ; không nhận `null`                               | IT                  | AC-5, AC-8                                                   |
| PATCH `contractNumber`                        | như POST, thêm `null`                                                         | không — vắng = giữ; `null` = bỏ số                                  | IT                  | AC-4                                                         |
| PATCH `validTo`                               | như POST, thêm `null`                                                         | không — vắng = giữ; `null` = bỏ (khi đổi sang `PERPETUAL_PURCHASE`) | IT                  | AC-3, AC-8                                                   |
| PATCH `reason`                                | trim, 1..1000                                                                 | có                                                                  | IT                  | AC-8, audit                                                  |
| GET list `search`                             | ≤100; so `searchKey` với tên, số, tên vendor                                  | không — vắng = mọi                                                  | người xem           | AC-10                                                        |
| GET list `vendorId`, `kind`, `status`         | uuid / enum / `INCOMPLETE\|NOT_YET_EFFECTIVE\|IN_EFFECT\|EXPIRED`             | không                                                               | người xem           | AC-10, AC-12                                                 |
| GET list `validToFrom`, `validToTo`           | ngày; `from ≤ to` (refine); loại hợp đồng `validTo` NULL khi có một trong hai | không                                                               | người xem           | FR-1.13(5) lọc; màn danh sách "sắp hết hiệu lực" (DESIGN §6) |
| GET list `hasDocuments`                       | `true\|false`                                                                 | không — vắng = không lọc                                            | người xem           | màn danh sách "chưa có tệp gốc" (DESIGN §6)                  |
| GET list `sortBy`                             | `name\|contractNumber\|vendorName\|validFrom\|validTo\|createdAt`             | không — `name`                                                      | người xem           | AC-10                                                        |
| GET list `sortOrder`                          | `asc\|desc`                                                                   | không — `asc`                                                       | người xem           | AC-10                                                        |
| GET (3 list) `page`, `pageSize`               | int ≥1; `pageSize` ≤100 (mặc định 20)                                         | không                                                               | người xem           | AC-10, API-LIST-DETAIL.1                                     |
| GET documents `purpose`                       | `CONTRACT_ATTACHMENT\|PURCHASE_DOCUMENT`                                      | không — vắng = cả hai                                               | người xem           | US-04-04 AC-13; `OQ-B-16` còn mở                             |
| PATCH subscription `contractId`               | uuid \| `null`                                                                | không — vắng = giữ; `null` = bỏ liên kết                            | IT                  | AC-6, AC-7, AC-14                                            |
| path `id`                                     | uuid                                                                          | có                                                                  | —                   | mọi route                                                    |

Không nhận (F-2): `organizationId`, người tạo/sửa, `status`, số đếm, `normalized*`, `applicationId` trên hợp đồng (AC-14).

```ts
// contract.dto.ts (rút gọn)
const contractKind = z.enum(['FRAMEWORK', 'TERM', 'PERPETUAL_PURCHASE']);
const contractStatus = z.enum(['INCOMPLETE', 'NOT_YET_EFFECTIVE', 'IN_EFFECT', 'EXPIRED']);
const name = z.string().trim().min(1).max(MAX_CONTRACT_NAME_LENGTH);
const contractNumber = z.string().trim().min(1).max(MAX_CONTRACT_NUMBER_LENGTH); // 100
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');
export const createContractBodySchema = z.strictObject({
  kind: contractKind,
  name,
  contractNumber: contractNumber.optional(),
  vendorId: z.uuid(),
  validFrom: businessDate,
  validTo: businessDate.optional(),
});
export const updateContractBodySchema = z
  .strictObject({
    kind: contractKind.optional(),
    name: name.optional(),
    contractNumber: contractNumber.nullable().optional(),
    vendorId: z.uuid().optional(),
    validFrom: businessDate.optional(),
    validTo: businessDate.nullable().optional(),
    reason: z.string().trim().min(1).max(1000),
  })
  .meta({ description: 'The reason, and at least one field to change.' });
export const listContractsQuerySchema = z
  .strictObject({
    search: z.string().max(100).optional(),
    vendorId: z.uuid().optional(),
    kind: contractKind.optional(),
    status: contractStatus.optional(),
    validToFrom: businessDate.optional(),
    validToTo: businessDate.optional(),
    hasDocuments: flag.optional(),
    sortBy: z.enum(['name', 'contractNumber', 'vendorName', 'validFrom', 'validTo', 'createdAt']).default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .refine((q) => !q.validToFrom || !q.validToTo || q.validToFrom <= q.validToTo, { path: ['validToTo'] });
export const listContractDocumentsQuerySchema = z.strictObject({
  purpose: z.enum(['CONTRACT_ATTACHMENT', 'PURCHASE_DOCUMENT']).optional(),
  page,
  pageSize,
});
export const listContractSubscriptionsQuerySchema = z.strictObject({ page, pageSize });
// subscription.dto.ts: updateSubscriptionBodySchema thêm `contractId: z.uuid().nullable().optional()`
```

### Response

| Schema · field                                                                                                                                             | Tiêu thụ                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ContractSummary.id`                                                                                                                                       | mở chi tiết (AC-11)                                                                                             |
| `kind`, `name`, `contractNumber` (string\|null)                                                                                                            | cột + tìm/lọc (AC-1, AC-4, AC-10)                                                                               |
| `vendor` `{id,name}\|null`                                                                                                                                 | cột, lọc (AC-10); `null` = hợp đồng cũ (AC-5)                                                                   |
| `validFrom`, `validTo` (date\|null)                                                                                                                        | cột, sắp xếp (AC-10, AC-12)                                                                                     |
| `status`                                                                                                                                                   | cột, lọc (AC-5, AC-12)                                                                                          |
| `subscriptionCount`, `documentCount` (int ≥0; tệp chỉ `READY`)                                                                                             | cột màn danh sách (DESIGN L9, AC-11)                                                                            |
| `createdAt`                                                                                                                                                | sắp xếp `createdAt` (có sẵn trên wire)                                                                          |
| `ContractDetail` = summary + `createdBy` (uuid, giữ wire cũ), `updatedAt`                                                                                  | màn chi tiết (AC-8 lần sửa cuối, AC-11)                                                                         |
| `ContractDocumentSummary` `{ id, purpose, fileName, contentType, sizeBytes, uploadedBy{id, fullName\|null}, attachedAt }`                                  | US-04-04 AC-13 (tên, loại, kích thước, người tải, thời điểm); `id` → `POST /documents/{id}/links` có sẵn (AC-1) |
| `ContractSubscriptionSummary` `{ id, application{id,name}, plan{id,name}, kind, status, startDate, endDate, purchasedQuantity, ownerDepartment{id,name} }` | tab thuê bao của chi tiết (AC-2 kỳ 2026/2027, AC-7 loại, AC-11)                                                 |
| Thuê bao: `contract` `{id,name}\|null` (mọi response thuê bao)                                                                                             | màn thuê bao hiện liên kết (AC-6), `null` cho click-through (AC-14)                                             |

Detail là `contractSummarySchema.extend({ createdBy, updatedAt })`; ba collection trả `{ items, pagination }`; create/get/
update trả `{ contract: ContractDetail }` (giữ khóa `contract` của wire cũ). `uploadedBy.fullName` lấy theo lô
`employeeIdsOfAccounts` → `getEmployees`; tài khoản không có nhân viên ⟹ `null`.

### Route, quyền, mã

| Route                                | Decorator                             | operationId · message                                        | Lỗi riêng                                                                                                                                     |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /contracts`                     | `@RequireRoles('IT_ADMIN','FINANCE')` | `contractList` · `CONTRACT.LISTED`                           | 422 `VALIDATION_ERROR`                                                                                                                        |
| `GET /contracts/{id}`                | như trên                              | `contractGet` · `CONTRACT.FETCHED`                           | 404 `CONTRACT.NOT_FOUND`                                                                                                                      |
| `POST /contracts`                    | `@RequireRoles('IT_ADMIN')`           | `contractCreate` · `CONTRACT.CREATED`                        | 422 `CONTRACT.VALIDITY_INVALID`, `CONTRACT.VENDOR_NOT_FOUND`; 409 `CONTRACT.NUMBER_TAKEN`                                                     |
| `PATCH /contracts/{id}`              | `@RequireRoles('IT_ADMIN')`           | `contractUpdate` · `CONTRACT.UPDATED`                        | 404 `NOT_FOUND`; 409 `NUMBER_TAKEN`, `VENDOR_LOCKED`; 422 `UPDATE_EMPTY`, `VALIDITY_INVALID`, `VENDOR_NOT_FOUND`, `KIND_MISMATCH`             |
| `GET /contracts/{id}/documents`      | đọc                                   | `contractDocumentList` · `CONTRACT.DOCUMENTS_LISTED`         | 404 `NOT_FOUND`                                                                                                                               |
| `GET /contracts/{id}/subscriptions`  | đọc                                   | `contractSubscriptionList` · `CONTRACT.SUBSCRIPTIONS_LISTED` | 404 `NOT_FOUND`                                                                                                                               |
| `PATCH /subscriptions/{id}` (có sẵn) | `IT_ADMIN`                            | `subscriptionUpdate` · `SUBSCRIPTION.UPDATED`                | thêm 404 `CONTRACT.NOT_FOUND` (như `documentAttach`), 409 `CONTRACT.ALREADY_LINKED`, 422 `CONTRACT.VENDOR_MISMATCH`, `CONTRACT.KIND_MISMATCH` |

`VALIDITY_INVALID` có `details.problem` ∈ `VALID_TO_BEFORE_VALID_FROM | PERPETUAL_HAS_VALID_TO | VALID_TO_REQUIRED`. Mỗi
mã một status. Lỗi trong `contract.errors.ts`, ánh xạ ở `contract.http-errors.ts`; `subscription.http-errors.ts` chuyển
bốn lỗi hợp đồng sang `toContractApiException`. Không có route DELETE (AC-9: 404 của router). Mọi vai khác ⟹ 403
`AUTHORIZATION.FORBIDDEN` từ guard, body không có dữ liệu hợp đồng (AC-13). `name` trống/thiếu ⟹ `VALIDATION_ERROR`
(luật S-22 của `qd96-100-catalog-api-fields`; mã `CONTRACT.NAME_REQUIRED` không còn tới được từ HTTP, bỏ khỏi example).

### Luật ghi

- **POST**: `kind`/`validTo` theo bảng; vendor `VendorRecordService.find(tx,id)` (null ⟹ `VENDOR_NOT_FOUND`); số trùng ⟹
  `NUMBER_TAKEN` (kiểm trước + bắt P2002 của unique). Audit `CONTRACT.CREATED` after = 6 trường nghiệp vụ.
- **PATCH**: `lock(tx,id)` `FOR UPDATE`; body chỉ có `reason` ⟹ `UPDATE_EMPTY`; gộp `next`; kiểm tên, hiệu lực trên `next`
  (hợp đồng cũ thiếu `kind` chỉ kiểm thứ tự ngày); `vendorId` đổi và tồn tại thuê bao liên kết ⟹ `VENDOR_LOCKED`; `kind`
  thành `PERPETUAL_PURCHASE` khi có thuê bao liên kết `kind = TERM` ⟹ `KIND_MISMATCH` (bảng liên kết của US-04-13);
  `next` bằng hiện tại ⟹ trả nguyên, không audit (như `subscriptionUpdate`). Audit `CONTRACT.UPDATED` before/after (6
  trường) và `after.reason`.
- **Liên kết (PATCH thuê bao)** trong transaction có sẵn: khóa thuê bao `FOR UPDATE` → gói `FOR SHARE` → hợp đồng `FOR SHARE`
  (`ContractFactsService.lockShared`). `contractId` bằng hiện tại ⟹ không đổi; `null` ⟹ bỏ liên kết; hiện có hợp đồng khác
  ⟹ 409 `ALREADY_LINKED` (US-04-13 bảng liên kết, AC-6); hợp đồng không có ⟹ 404; `vendorId` của hợp đồng null hoặc khác
  `current.vendor.id` ⟹ `VENDOR_MISMATCH`; hợp đồng `PERPETUAL_PURCHASE` + thuê bao `TERM` ⟹ `KIND_MISMATCH`. `contractId`
  vào `SubscriptionState` (`stateOf`, `canonical`, `snapshotOf`, `columnsOf`) ⟹ audit `SUBSCRIPTION.UPDATED` có
  before/after `contractId`. Kiểm ở `SubscriptionChangeGuard.assertContractLinkable` (constructor của
  `SubscriptionChangeService` đã 8 tham số — `max-params`).
- **Đua**: link giữ `FOR SHARE` hợp đồng ⟹ PATCH đổi vendor (`FOR UPDATE`) chờ, rồi thấy liên kết ⟹ 409; ngược lại link chờ
  rồi đọc vendor mới. Trigger `contracts_vendor_locked` là chốt cuối. Thứ tự khóa không vòng (link: thuê bao → gói →
  hợp đồng; PATCH hợp đồng: chỉ hợp đồng).

### Collection (API-LIST-DETAIL.1)

- `contractList`: `$queryRaw` một câu trang + một câu đếm cùng `RepeatableRead`; `ORDER BY <cột> <dir> NULLS LAST, c.id ASC`
  với cột từ bảng hằng `Prisma.sql` (`name`→`c.normalized_name`, `contractNumber`→`c.normalized_contract_number`,
  `vendorName`→`v.normalized_name`, `validFrom`, `validTo`, `createdAt`); đếm thuê bao/tệp bằng subquery tương quan; tìm
  bằng `LIKE '%'||key||'%' ESCAPE '\'` với `escapeLikePattern(searchKey(search))` (`src/core/search-key.ts`).
- `contractDocumentList`: `document_attachments WHERE contract_id = $id AND status = 'READY'` (+`purpose`), `select` đúng
  trường, `orderBy [attachedAt desc, id asc]`, đếm + trang RR; tên người tải theo lô (2 câu).
- `contractSubscriptionList`: `subscriptions WHERE contract_id`, `select` plan→application, `orderBy [startDate desc nulls
last, id asc]`, RR; phòng sở hữu theo lô `getDepartmentBriefs` (1 câu).
- Hợp đồng không tồn tại ⟹ 404 trước khi đọc trang. Không mảng lồng ⟹ không mục `NESTED_ARRAYS`; summary ≠ detail ⟹ không
  mục `COLLECTION_EXCEPTIONS`. Số câu lệnh hằng theo số dòng (test 2 cỡ dữ liệu).
- `subscriptionList` thêm `contract` vào item ⟹ sửa `itemProperties` của hai mục `subscriptionList` trong
  `test/support/api-collection-registry-exceptions.ts` (không thêm mục).

### Quy ước sắp xếp mới — chép vào `docs/rules/api-contract.md` (mục mới sau API-LIST-DETAIL.1)

> **Sắp xếp danh sách (`API-SORT.1`).** Collection cho người dùng chọn thứ tự khai đúng hai query: `sortBy` — enum đóng các
> khóa camelCase của item summary, mặc định ghi trong schema — và `sortOrder` (`asc` | `desc`, mặc định `asc`). Giá trị lạ ⟹
> 422 `VALIDATION_ERROR`. Thứ tự luôn tất định: sau khóa chọn luôn thêm `id ASC`; NULL của khóa chọn xếp cuối ở cả hai chiều;
> chuỗi so theo khóa `searchKey`. Repo ánh xạ khóa → cột bằng bảng hằng (`Prisma.sql`), không ghép chuỗi từ input.
> Collection không cho chọn thứ tự thì không khai hai tham số này. Ví dụ: `contractList`.

## Test matrix

Chi tiết ca, fixture, lệnh: [test-plan.md](test-plan.md).

| AC / rủi ro           | Tình huống                                                            | Cấp test           | Kết quả mong đợi                          | Bằng chứng sau implement |
| --------------------- | --------------------------------------------------------------------- | ------------------ | ----------------------------------------- | ------------------------ |
| US-04-13 AC-1, AC-12  | tạo `FRAMEWORK` Atlassian; trạng thái 3 ngày                          | unit + integration | 201, đủ trường, audit `CONTRACT.CREATED`  | planned                  |
| AC-2                  | hai `TERM` Figma 2026/2027, mỗi kỳ liên kết đúng hợp đồng             | integration        | hợp đồng 2026 không đổi                   | planned                  |
| AC-3                  | `PERPETUAL_PURCHASE` có/không `validTo`; `TERM` thiếu `validTo`       | unit + integration | 422 `VALIDITY_INVALID` / 201              | planned                  |
| AC-4                  | `HD-001` rồi `hd-001`; không số ×2                                    | integration        | 409 `NUMBER_TAKEN` / 201                  | planned                  |
| AC-5                  | thiếu vendor; hợp đồng cũ chỉ tên ⟹ `INCOMPLETE` ⟹ PATCH bổ sung      | integration        | 422 / `INCOMPLETE` / trạng thái theo ngày | planned                  |
| AC-6, AC-7            | liên kết cùng/khác vendor, đã liên kết, kỳ vào vĩnh viễn              | unit + integration | 200 / 422 / 409 / 422                     | planned                  |
| AC-8                  | sửa có/không lý do; đổi vendor khi đã liên kết; đua link × đổi vendor | integration        | 200+audit / 422 / 409                     | planned                  |
| AC-9                  | DELETE route; DELETE SQL                                              | integration        | 404; `55000`                              | planned                  |
| AC-10                 | 30 hợp đồng: tìm, lọc, sắp xếp 6 khóa × 2 chiều, trang                | integration        | đúng tập, NULL cuối, đếm khớp             | planned                  |
| AC-11, US-04-04 AC-13 | Finance xem chi tiết/thuê bao/tệp; Finance ghi                        | integration        | 200 chỉ `READY`; 403                      | planned                  |
| AC-13                 | Manager/Employee/Spending Approver/Super Admin                        | e2e                | 403, không dữ liệu                        | planned                  |
| AC-14                 | thuê bao click-through không hợp đồng; body có `applicationId`        | integration + e2e  | `contract: null`; 422                     | planned                  |
| Field ma              | tập field request/response = bảng spec                                | e2e (OpenAPI)      | khớp chính xác                            | planned                  |
| Query count           | 3 collection, 2 cỡ dữ liệu                                            | integration        | hằng số                                   | planned                  |

## Definition of Done

- [ ] Mọi AC primary có test xanh ở cấp trong test-plan; `US-04-04` AC-13 ghi đúng vế đã làm.
- [ ] Bộ kiểm nhanh xanh (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, gate + test theo file);
      `pnpm openapi:export` đã chạy và diff `openapi.json` đã review; full suite để Owner chạy lúc audit.
- [ ] `docs/rules/api-contract.md` có `API-SORT.1`; module card `catalog/README.md` và `docs/generated/routes.md` cập nhật.
- [ ] Báo FE: 4 operation mới, `contractCreate` body đổi (breaking: `kind`, `vendorId`, `validFrom` bắt buộc), mọi
      response thuê bao thêm `contract`.
- [ ] Không thêm mục ledger/registry ngoài hai `itemProperties` của `subscriptionList`; phần chưa kiểm chứng ghi rõ.

## Câu hỏi mở

1. **Bỏ liên kết (`contractId: null`)** — US-04-13 không nói; DESIGN §6 ghi "gắn/đổi/bỏ". Mặc định: **cho bỏ** (sửa nhầm,
   có audit). **Đổi thẳng** A→B bị 409 `ALREADY_LINKED` theo bảng liên kết của US (lệch DESIGN, xem dưới); Owner xác nhận.
2. **Liên kết hợp đồng thiếu `kind`** (đã có vendor): mặc định cho (chỉ kiểm vendor); đặt `kind` sau sẽ bị kiểm
   `KIND_MISMATCH`. Owner có muốn chặn liên kết hợp đồng `INCOMPLETE`?
3. `validToFrom/validToTo`, `hasDocuments` không có AC riêng (chỉ DESIGN §6/màn danh sách) — giữ; Owner có thể bỏ.

## Changes and acceptance

- 05/11/2026 — lập spec từ DESIGN §6. Lệch có chủ đích so với DESIGN: (a) đổi thẳng hợp đồng của thuê bao bị 409
  `CONTRACT.ALREADY_LINKED` (US-04-13 bảng liên kết; DESIGN "gắn/đổi/bỏ"); (b) thêm `CONTRACT.VENDOR_NOT_FOUND`,
  `CONTRACT.UPDATE_EMPTY`, `CONTRACT.ALREADY_LINKED`, và `KIND_MISMATCH` cả khi PATCH `kind` (DESIGN chỉ nêu lúc liên kết);
  (c) unique thường thay "partial unique" (cùng nghĩa vì NULL khác nhau, Prisma mô hình được); thêm cột `normalized_name`
  để tìm theo `searchKey`; (d) thêm `sortBy=validFrom` (AC-10 "ngày hiệu lực"); (e) trigger giữ trường đã điền không
  về NULL; (f) `uploadedBy` có `fullName` (AC-13 "người tải lên").
- Chưa nghiệm thu.

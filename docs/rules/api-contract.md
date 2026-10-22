# API contract

## DTO và pipeline

- Base path mặc định `/api/v1`; resource plural kebab-case, JSON camelCase.
- Dùng Zod 4 DTO qua `nestjs-zod`; request object dùng `z.strictObject`.
- Khai schema cho body, query **và params**. Ví dụ `@Param() params: ApplicationIdParamDto`.
  Global pipe dùng strict schema declaration; param primitive không có schema có thể trả 500.
- Guards chạy trước pipe. Kiểm tra quyền theo input/resource đã validate ở use case.
- Response DTO mô tả wire data; map Date/Decimal/BigInt trước khi trả, không lộ Prisma record.
- `@ApiSuccessResponse` khai full envelope. Handler trả data; interceptor bọc
  `{ success: true, message, data }`, sau đó serializer validate.
- Success `message` là key như `AUDIT.EVENTS_LISTED`. FE không branch theo error message.
- Stream/file/redirect/204 dùng `@RawResponse()` có contract/test phù hợp; không dùng để né DTO.

## Errors

Lỗi: `{ success: false, error: { code, message, requestId, details? } }`.
`details` là object đã chọn trường an toàn. Filter giữ mã lỗi chủ đích;
`INTERNAL_SERVER_ERROR` là fallback cho server error không có mã riêng.
Every route declares exactly one of `@Public()`, `@AuthenticatedOnly()`, `@RequireRoles(...)`;
a route with none (or two kinds) answers 500 and is logged as a programming error. The guard returns
401 `AUTHENTICATION_REQUIRED` for a missing token and 401 `INVALID_ACCESS_TOKEN` for a token that is
bad or whose session/account is no longer usable; a wrong role is 403 `AUTHORIZATION.FORBIDDEN`;
an unreachable database is 503 (`TOKEN_VERIFICATION_UNAVAILABLE`, or `AUTH.UNAVAILABLE` on auth routes),
never 401; account administration routes use 503 `SERVICE_UNAVAILABLE` for a transient database failure.
Request-body validation errors are 422 `VALIDATION_ERROR`.

## Collection và detail (`API-LIST-DETAIL.1`)

Áp cho mọi `GET` trả nhiều dòng (collection, search, page) và detail tương ứng. Gate
[`src/api-collection-contract.spec.ts`](../../src/api-collection-contract.spec.ts) (trong `pnpm check`) kiểm phần thấy
được trong `openapi.json`; phần query chứng minh bằng test đếm câu lệnh với
[`test/support/query-count.ts`](../../test/support/query-count.ts).

1. **Summary projection.** Collection khai một schema riêng cho dòng (`…SummaryDto`/`…ListItemDto` hoặc schema item tên
   riêng) chỉ gồm trường để nhận diện, lọc và hành động trên dòng. Mảng lồng, lịch sử, văn bản dài, bằng chứng kỹ thuật,
   khóa/bí mật và giá trị tính tốn kém thuộc detail hoặc subresource, trừ khi AC ghi rõ cần ở danh sách.
2. **Detail** trả đúng một resource và phần chi tiết người gọi được xem; summary và detail là hai schema có tên riêng,
   detail nên là `summary.extend({...})` để trường chung không trôi.
3. **Có biên.** Collection phân trang bằng `page`/`pageSize` có `maximum` trong schema, hoặc có _business maximum_ chứng minh
   được (AC/FR, hằng số trong code, validation, ràng buộc CSDL) ghi trong registry của gate. Business maximum là **số phần
   tử tối đa của toàn response** (một trang với `detail-reuse` — bằng đúng `pageSize.maximum`; một lần xuất hiện của mảng
   lồng — bằng `maxItems` của schema khi schema có) — số nguyên dương kèm nguồn. Biên theo từng cha, từng năm hay từng nhóm
   chỉ là business maximum khi chính số cha/năm/nhóm hoặc khoảng được hỏi cũng bị chặn bởi AC/FR, hằng số hay ràng buộc
   CSDL. **Mọi mảng lồng**, ở bất kỳ độ sâu nào dưới `data` của mọi `GET` — trong item, phần còn lại của `data` collection,
   detail, object, union, map hay item của mảng khác — có biên chứng minh được, hoặc là finding có chủ, hoặc chờ quyết định
   Owner, hoặc thành subresource phân trang. "Dữ liệu sẽ nhỏ" không phải business maximum.
4. **Thứ tự tất định** có khóa phụ duy nhất (`…, id`). Đếm và trang dùng cùng snapshot (một transaction `RepeatableRead`)
   khi tổng phải khớp trang. Không đọc cả tập rồi cắt trang trong bộ nhớ.
5. **Projection trực tiếp ở repository.** Query danh sách `select` đúng trường của summary; không `include` quan hệ của
   detail rồi bỏ trường sau. Dùng chung mapper với detail chỉ khi query không đọc cột hay quan hệ chỉ detail cần.
6. **Số câu lệnh không phụ thuộc số dòng.** Dữ liệu chéo capability gom theo lô (một query cho cả trang); không đọc từng dòng
   (N+1). Test của collection khẳng định số câu lệnh là hằng số trên hai cỡ dữ liệu và không câu lệnh nào đọc bảng/cột chỉ
   detail cần.
7. **Spec của collection mới** khai summary projection, biên/paging, thứ tự, detail/subresource tương ứng và kỳ vọng số câu
   lệnh.

**Ngoại lệ** chỉ nằm trong `COLLECTION_EXCEPTIONS` của gate: đúng `operationId` (không hậu tố, tiền tố hay glob), phân loại,
finding, hạng mục chủ sở hữu, lý do, điều kiện gỡ hoặc xem lại, business maximum khi khai biên (`maxItems` là số nguyên
dương, kèm `source`; gate đọc con số, không đoán từ câu chữ), và danh sách trường của item lúc ghi. Gate đỏ khi collection mới vi phạm mà không có mục, khi mục cũ không còn khớp operation (đã sửa thì gỡ mục), và khi
thêm mục ngoài danh sách khởi đầu — registry chỉ được co lại; thêm mục cần quyết định Owner. Không có allowlist legacy
chung.

**Good** — schema summary riêng, `select` trực tiếp, đếm và trang cùng snapshot:

```ts
// application.dto.ts
export const applicationSummarySchema = z.strictObject({ id, name, kind, status, vendor: vendorBrief });
export const applicationDetailSchema = applicationSummarySchema.extend({ domains, communication, similarApplications });
// application.repo.ts — trong một transaction RepeatableRead cùng câu đếm
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
export class ApplicationPageResponseDto extends createZodDto(page(applicationSchema)) {} // domains, ghi chú, quan hệ
tx.application.findMany({ where, include: { vendor: true, functionalGroup: true } }); // đọc đủ cột của hai bảng
for (const row of rows) row.tax = await taxes.estimate(row.vendorId); // một câu lệnh mỗi dòng
```

**Bad workaround** — giữ nguyên chi phí đọc hoặc che việc dùng lại:

```ts
const rows = await repo.listWithFullGraph(); // nạp đủ rồi cắt ở controller
return rows.map(({ domains, communicationNote, ...rest }) => rest);
export const applicationListItemSchema = applicationSchema; // bí danh che việc dùng lại schema detail
const page = all.slice(skip, skip + take); // phân trang trong bộ nhớ sau khi đọc cả tập
// mục registry 'catalog*' hay '*List', hoặc "danh mục nhỏ nên không cần phân trang" không có nguồn chứng minh
```

**Bad — biên theo cha hay theo năm khai thành `bounded`** (`LD-15`): "2 mỗi phòng" không chặn một response không phân trang
khi số phòng không có biên; "366 mỗi năm" không chặn response khi khoảng năm là tùy chọn hoặc không có trần. Hai mục này là
`unbounded` cho tới khi có phân trang thật hoặc trần cứng của toàn response.

```ts
const COLLECTION_EXCEPTIONS = [
  // tối đa 2 cảnh báo mỗi phòng đang hoạt động, nhưng số phòng không có trần
  { operationId: 'departmentWarningList', classification: 'bounded', businessMaximum: { maxItems: 2, source: 'enum' } },
  // một dòng mỗi ngày, nhưng from/to tùy chọn ⟹ một lần gọi trả mọi năm đã ghi
  {
    operationId: 'nonWorkingDateList',
    classification: 'bounded',
    businessMaximum: { maxItems: 366, source: 'unique' },
  },
];
```

**Mảng lồng** chỉ nằm trong `NESTED_ARRAYS` của gate, khóa `operationId#path` chính xác: path tính từ **một item** của
collection (`data.<tên>` cho phần còn lại của `data`), hoặc từ `data` với `GET` khác; item của mảng đi xuyên qua
(`serviceLines.domains`), `[]` đánh dấu mảng nằm thẳng trong mảng, `{}` là giá trị của map. Gate đi đệ quy toàn bộ schema
(union, `$ref` có chặn vòng lặp) và đỏ khi một mảng không có mục, khi mục không còn mảng (stale), khi `maxItems` khác
`maxItems` của schema, khi `detail-reuse.maxItems` khác `pageSize.maximum`, và khi registry có khóa hay phân loại ngoài
`INITIAL_NESTED_ARRAYS`. Mỗi mục đúng một phân loại: `bounded` (`maxItems` nguyên dương + nguồn chính xác + điều kiện xem
lại kích hoạt ở thay đổi đầu tiên của nguồn), `unbounded` (finding chính xác + hạng mục chủ), `owner-decision` (điểm
`LD-13`). Không có mục theo hậu tố, glob hay tên tệp; không tự ghi danh.

**Good** — mảng lồng có trần ở validation và mục registry nêu đúng nguồn đó:

```ts
// vendor-dictionary.validation.ts — mọi đường ghi đều qua cleanDomains (MAX_VALUES = 20)
if (hosts.size > MAX_VALUES) throw new VendorTooManyValuesError(MAX_VALUES);
// api-collection-contract.spec.ts
const NESTED_ARRAYS = [
  {
    key: 'vendorGroupList#serviceLines.domains',
    classification: 'bounded',
    businessMaximum: { maxItems: 20, source: 'MAX_VALUES in vendor-dictionary.validation.ts' },
    removeWhen: 'Review when MAX_VALUES or a dictionary write path changes.',
  },
];
```

**Bad** — mảng lồng không trần, hoặc "trần" lấy từ thứ không chặn mảng:

```ts
const similar = await repo.findMany({ where: { functionalGroupId } }); // không take: mọi ứng dụng cùng nhóm (LD-06)
const NESTED_ARRAYS = [
  // một cảnh báo mỗi thuê bao đang chạy của gói; số thuê bao không có trần (LD-16)
  { key: 'planTermsGet#warnings', classification: 'bounded', businessMaximum: { maxItems: 20, source: 'ít thuê bao' } },
  // 2 cảnh báo mỗi phòng, nhưng số phòng không có trần (LD-16)
  {
    key: 'onboardingChecklistGet#steps.warnings',
    classification: 'bounded',
    businessMaximum: { maxItems: 2, source: 'enum' },
  },
];
```

**Bad workaround** — che mảng khỏi inventory hoặc để điều kiện xem lại tới muộn:

```ts
const toolsSchema = z.strictObject({ items: z.array(toolSchema), summary: z.array(lineSchema) }); // data.summary vẫn cần mục
const NESTED_ARRAYS = [{ key: 'vendorGroupList#*' }]; // glob: gate từ chối
// maxItems 11 đã sai từ mã thứ 12: xem lại ở thay đổi đầu tiên của tập seed, không phải khi vượt 50
const COLLECTION_EXCEPTIONS = [{ operationId: 'currencyList', removeWhen: 'Review when currencies exceed 50.' }];
```

## Handoff

- Operation ID ổn định, tag theo domain, mô tả đầy đủ success/error response.
- `@ApiOperation` có `summary` ngắn (≤ 70 ký tự, khác nhau giữa các operation). OpenAPI `security` **không** khai tay:
  `@AuthenticatedOnly()`/`@RequireRoles(...)` đã gắn bearer, `@Public()` không. Route có guard dùng
  `UNAUTHENTICATED_RESPONSE` và `GUARDED_SERVICE_UNAVAILABLE_RESPONSE` cho 401/503. Mô tả public không chứa mã nội bộ
  (`US-*`, `AC-*`, `QĐ-*`); credential trong example là placeholder như `<refresh-token>`. `createOpenApiDocument`
  đổi `const` thành `enum` và bỏ `pattern` lặp format uuid/date-time; `test/e2e/api-inventory.e2e-spec.ts` kiểm các
  điều trên.
- Mọi `@ApiSuccessResponse` của route mount khai `message` riêng; không route sản phẩm nào rơi về `COMMON.SUCCESS`
  (chỉ probe trong test). Route có đầu vào (path, query, body) khai 422 `VALIDATION_ERROR`.
- 429 của `ThrottlerGuard` toàn cục (`HTTP_TOO_MANY_REQUESTS`) được `createOpenApiDocument` thêm cho mọi operation
  không tự khai 429. Route tự khai 429 (khóa đăng nhập, limit riêng) phải nêu cả `HTTP_TOO_MANY_REQUESTS` trong mô tả.
  Không dùng `@SkipThrottle` nếu chưa sửa cách tài liệu hóa 429. Inventory test kiểm các điều trên.
- Cập nhật [API inventory](../../test/support/api-coverage-manifest.ts) khi thêm/bỏ operation.
- Chạy `pnpm test:e2e`, `pnpm openapi:export`; review diff `openapi.json`.
- Contract sinh từ controller/DTO. Không sửa JSON hoặc generated FE client bằng tay.
- Nếu thay contract có consumer FE, nêu operation/schema thay đổi và phối hợp regenerate client.

Ví dụ hiện có, đã mount và khai báo quyền đúng: [audit controller](../../src/modules/audit/audit.controller.ts)
(`GET /api/v1/audit-events`, `@RequireRoles('SUPER_ADMIN')` ở class, `operationId`, success/error response) cùng test
[e2e](../../test/e2e/audit-events.e2e-spec.ts) và [integration](../../test/integration/audit-query-http.integration-spec.ts).
Cách thêm endpoint: [development guide](../guides/kien-truc-backend-va-cach-viet-code.md).

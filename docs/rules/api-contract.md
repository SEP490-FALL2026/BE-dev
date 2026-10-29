# API contract

## DTO và pipeline

- Base path mặc định `/api/v1`; resource plural kebab-case, JSON camelCase.
- Dùng Zod 4 DTO qua `createZodDto` của ứng dụng ([dto/zod-dto.ts](../../src/infrastructure/http/dto/zod-dto.ts)), không
  import thẳng từ `nestjs-zod` (test ranh giới đỏ); request object dùng `z.strictObject`.
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

Giới hạn thân request (P29-N1): **một** giới hạn 100 KiB cho thân JSON và URL-encoded,
`REQUEST_BODY_LIMIT_BYTES` ở [request-body-limit.ts](../../src/infrastructure/http/request-body-limit.ts), đăng ký trong
`configureApplication`. Thân lớn hơn bị parser từ chối trước routing, guard và validation: 413 `HTTP_PAYLOAD_TOO_LARGE`, không
có thông điệp parser hay mảnh thân. Đổi con số là đổi contract (FE/Mobile sinh lại client, reverse proxy phải cho qua ít nhất
mức này). Parser URL-encoded vẫn gắn (như mặc định của Nest) dù không route nào khai URL-encoded, nên giới hạn của nó ghi rõ
trong cùng tệp: **tối đa 100 tham số** (`URLENCODED_PARAMETER_LIMIT`) và **độ sâu lồng tối đa 5** (`URLENCODED_DEPTH_LIMIT`),
không dựa vào mặc định thư viện (P29-N4).

Ma trận lỗi parser (P29-N1, P29-N2, P29-N4 — đo lại trên body-parser 2.4.0 / raw-body 3 / multer 2.5.0 ở `SEC-UPGRADE-RV-01`,
[test](../../test/http/platform/security-upgrade-regression.http-spec.ts); nhận theo `type` đã tài liệu hóa **cùng** status và
thuộc tính mà nơi tạo luôn gán; không bao giờ chỉ theo `status`, tên hay thông điệp —
[request-parser-errors.ts](../../src/infrastructure/http/filters/request-parser-errors.ts)):

| Lỗi parser                                                                   | HTTP / mã                         |
| ---------------------------------------------------------------------------- | --------------------------------- |
| JSON hỏng (`entity.parse.failed`; Nest tự đổi `SyntaxError` thành 400)       | 400 `HTTP_BAD_REQUEST`            |
| `request.size.invalid` (độ dài khai báo lệch số byte), `request.aborted`     | 400 `HTTP_BAD_REQUEST`            |
| `querystring.parse.rangeError` (URL-encoded lồng sâu quá giới hạn)           | 400 `HTTP_BAD_REQUEST`            |
| thân nén hỏng (gzip/deflate/br): lỗi zlib/brotli có `errno`, không `type`    | 400 `HTTP_BAD_REQUEST`            |
| `entity.too.large`, `parameters.too.many`                                    | 413 `HTTP_PAYLOAD_TOO_LARGE`      |
| `charset.unsupported`, `encoding.unsupported`                                | 415 `HTTP_UNSUPPORTED_MEDIA_TYPE` |
| multipart: sai tên trường tệp, phá giới hạn form / tệp quá lớn               | 400 / 413                         |
| `stream.encoding.set`, `stream.not.readable`, type lạ, mã multer lạ, lưu trữ | 500 `INTERNAL_SERVER_ERROR`       |

Mã hóa nội dung (`Content-Encoding`) của thân JSON/URL-encoded: chỉ `gzip`, `deflate`, `br` hoặc không mã hóa — contract
trước body-parser 2.4.0 (Owner, 25/10/2026, `SEC-UPGRADE-RV-01-F1`). body-parser 2.4.0 tự giải nén cả `zstd` nơi Node hỗ trợ
(CI Node 22, image `node:24`), nên `contentEncodingAllowlist` ở
[request-body-limit.ts](../../src/infrastructure/http/request-body-limit.ts) từ chối mọi mã hóa khác **trước** parser — 415
`HTTP_UNSUPPORTED_MEDIA_TYPE`, không handler nào chạy; header đọc như body-parser (vắng/rỗng = không mã hóa, không phân biệt
hoa/thường). Thân không phải JSON/URL-encoded (multipart) và request không thân không qua allowlist. Giới hạn 100 KiB tính
trên byte **đã nở** (thân nén nở quá ⟹ 413). Multipart: trường văn bản tối đa **đúng** 64 byte (65 ⟹ 400, multer 2.5.0);
tệp rỗng tới route.
`entity.verify.failed` không xảy ra (không cấu hình verify hook), nên không có contract. Không có thông điệp parser, charset,
encoding, giá trị trường hay stack nào trả về. Client đã đi (`request.aborted`) thì filter phân loại nhưng **không** ghi lên
socket đã đóng. Multer nhận bằng `instanceof` đúng lớp `MulterError` mà `FileInterceptor` của Nest nạp, không so tên lỗi.
Mọi operation có thân JSON khai 400, 413 và 415 của parser qua một helper
([openapi-request-parser.ts](../../src/infrastructure/http/openapi-request-parser.ts)): mô tả 400 riêng của operation được
giữ và thêm nghĩa của parser đúng một lần — không chép mô tả vào controller.

Một mã lỗi chỉ đi với **một** HTTP status. Kẻ thua đua (ví dụ `DB-03`) dùng 409 với mã riêng bảo client làm mới rồi gửi lại —
`APPLICATION.DICTIONARY_GROUP_CHANGED` — không mượn mã 422 của lỗi nghiệp vụ cùng chủ đề (P29-N3).

## Collection và detail (`API-LIST-DETAIL.1`)

Áp cho mọi `GET` trả nhiều dòng (collection, search, page) và detail tương ứng. Gate
[`test/gates/api-collection-contract.gate-spec.ts`](../../test/gates/api-collection-contract.gate-spec.ts) (trong `pnpm check`) kiểm phần thấy
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
  đổi `const` thành `enum` và bỏ `pattern` lặp format uuid/date-time; `test/http/platform/api-inventory.http-spec.ts` kiểm các
  điều trên.
- Mọi `@ApiSuccessResponse` của route mount khai `message` riêng; không route sản phẩm nào rơi về `COMMON.SUCCESS`
  (chỉ probe trong test). Route có đầu vào (path, query, body) khai 422 `VALIDATION_ERROR`.
- 429 của `ThrottlerGuard` toàn cục (`HTTP_TOO_MANY_REQUESTS`) được `createOpenApiDocument` thêm cho mọi operation
  không tự khai 429. Route tự khai 429 (khóa đăng nhập, limit riêng) phải nêu cả `HTTP_TOO_MANY_REQUESTS` trong mô tả.
  Không dùng `@SkipThrottle` nếu chưa sửa cách tài liệu hóa 429. Inventory test kiểm các điều trên.
- **Ví dụ response (`OPENAPI-EXAMPLE.1`).** `@ApiSuccessResponse` tự hiện đúng `message` đã khai (một giá trị cho interceptor
  và ví dụ, overlay `allOf` trên DTO). Mỗi mục `ApiErrorResponses` **bắt buộc** `examples`: chỉ các mã route đó thật sự trả
  ở status đó — truy vết guard → pipe → service/policy/repo → mapper, không lấy từ mô tả. Dùng ví dụ chung
  (`UNAUTHENTICATED_RESPONSE`, `GUARDED_SERVICE_UNAVAILABLE_RESPONSE`, `FORBIDDEN_EXAMPLE`, `VALIDATION_EXAMPLE`,
  `fallbackExample`) và hằng `*_ERROR_EXAMPLES` của chính `*.http-errors.ts` mà controller dùng, dựng bằng
  `errorExampleOf(toXApiException(new XError(...)))` — không chép literal mã/thông điệp. Đối số động là placeholder tất định
  (`'<employee-id>'`, `'2026-01-01'`; thời điểm duy nhất `2026-01-01T00:00:00.000Z`); `code` ≤ 80, `message` ≤ 160 ký tự,
  không token/secret/email/mã nội bộ. Status đã khai mà runtime đang chạy chưa trả được (đường đi chờ lát sau) dùng
  `noExampleBecause` thay ví dụ và có mục chính xác trong `NO_EXAMPLE_RESPONSES` — danh sách chỉ co lại. Thêm hoặc đổi route ⟹ cập nhật
  [manifest ví dụ](../../test/support/openapi-example-manifest.ts) (message thành công, mã theo route); inventory test so tập
  mã chính xác.
- **Một dialect: OpenAPI 3.0 (`OPENAPI-EXAMPLE.1-F3`).** Document khai `3.0.0` và mọi schema là Schema Object 3.0 — FE/Mobile
  (Orval) kiểm cả document theo phiên bản khai và từ chối document lẫn JSON Schema 2020-12. Zod (qua nestjs-zod) phát 2020-12;
  `toOpenApi30Presentation` viết lại theo 3.0 (`type` mảng → `type` + `nullable` hoặc `anyOf`; nhánh `{type: "null"}` →
  `nullable`; enum nullable liệt kê `null`; bound số → cờ boolean; bỏ `propertyNames: {type: "string"}`) và để nguyên hình không
  có cách viết 3.0 chính xác. [Gate dialect](../../src/infrastructure/http/openapi-dialect.ts) nêu pointer + lý do: `pnpm
openapi:export` từ chối ghi, e2e kiểm document trong tiến trình và `openapi.json`. Gate ngữ nghĩa
  ([openapi-dialect.e2e-spec.ts](../../test/http/platform/openapi-dialect.http-spec.ts)) so mọi DTO body/query/path/response với bản 3.0 do
  chính Zod dựng từ schema runtime — nâng Zod/nestjs-zod/Swagger làm đổi nghĩa document thì đỏ. Không sửa bằng cách đổi chuỗi
  `openapi`, tắt validator hay bỏ ràng buộc.
- Cập nhật [API inventory](../../test/support/api-coverage-manifest.ts) khi thêm/bỏ operation.
- Chạy `pnpm test:e2e`, `pnpm openapi:export`; review diff `openapi.json`.
- Contract sinh từ controller/DTO. Không sửa JSON hoặc generated FE client bằng tay.
- Nếu thay contract có consumer FE, nêu operation/schema thay đổi và phối hợp regenerate client.

Ví dụ hiện có, đã mount và khai báo quyền đúng: [audit controller](../../src/modules/audit/audit.controller.ts)
(`GET /api/v1/audit-events`, `@RequireRoles('SUPER_ADMIN')` ở class, `operationId`, success/error response) cùng test
[e2e](../../test/http/audit/audit-events.http-spec.ts) và [integration](../../test/integration/audit/audit-query-http.integration-spec.ts).
Cách thêm endpoint: [development guide](../guides/kien-truc-backend-va-cach-viet-code.md).

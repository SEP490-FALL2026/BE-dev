# Spec: một dialect OpenAPI cho client generator và audit ba nâng cấp bảo mật (`OPENAPI-EXAMPLE.1-F3`, `SEC-UPGRADE-RV-01`)

- Phụ trách: AI theo giao việc (Prompt 26A, 25/10/2026).
- Thiết kế ban đầu bởi: Owner (Prompt 26A trong `Prompts/BE-audit-and-architecture-2026-10-18/`); AI chốt thiết kế chi tiết.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (baseline nghiệp vụ hiện hành tới `QĐ-86`, như Prompt 26; hạng mục không đọc hay đổi nghiệp vụ), BE
  `8b10897` (Prompt 26 đã commit/push: `dev = origin/dev`, cây sạch). Không Story/AC nào.
- Nhóm roadmap: xuyên module — `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · Hạng mục trước: [openapi-response-examples](../openapi-response-examples/spec.md).

## Business outcome

Sau lát này `openapi.json` là **một** document OpenAPI 3.0 nhất quán — gate dialect của BE và validator chuẩn
(`@scalar/openapi-parser`, bộ kiểm input của Orval) nhận nó — và mọi DTO trong document nói đúng điều Zod kiểm ở runtime: bốn
trường request Zod 4.6 làm Swagger in thành mảng nay là chuỗi nullable như cũ. Ba nâng cấp bảo mật của `ea73c2f` (Zod 4.6.7,
`body-parser` 2.4.0, `multer` 2.5.0) được audit trên đúng bản Nest nạp, không rollback bản vá; Prompt 00A khép hai finding
BE của audit: contract mã hóa nội dung giữ như trước nâng cấp (zstd ⟹ 415) và các pin phụ thuộc thấp hơn bản có bản sửa
(`qs`, `fast-uri`, `nodemailer`). FE/Mobile **không** phải đích triển khai hay kiểm chứng của workstream BE này (Owner,
25/10/2026); tác động lên họ chỉ là ghi chú bàn giao.

## Sizing decision

- Container: Prompt 26A — `OPENAPI-EXAMPLE.1-F3` (High cho FE: document khai 3.0.0 nhưng chứa `type: [T, "null"]`,
  `propertyNames`; Orval 8.39 báo 154 lỗi) và `SEC-UPGRADE-RV-01` (audit regression của ba nâng cấp bảo mật).
- Mode: `technical-enabler`.
- Outcome and owner: dialect và độ trung thực của document OpenAPI; sở hữu `src/infrastructure/http` (presentation, dialect
  gate, factory DTO) và `scripts/dev/export-openapi.ts`.
- Boundaries: không đổi wire, validation, route, status, mã, thông điệp, sở hữu DTO, Prisma, migration, CSDL, quyền. 37 tệp DTO
  chỉ đổi đường import của `createZodDto`. Ví dụ của Prompt 26 giữ nguyên byte. Prompt 00A (correction trong cùng hạng mục):
  allowlist mã hóa ở ranh giới parser giữ contract trước nâng cấp (không phải wire mới); phụ thuộc chỉ nâng trong cùng major.
- Not larger: F1, F2, F4–F6 của Prompt 26 thuộc review contract sau baseline nghiệp vụ/G5/G6; quy ước tên/tag của consumer
  (`OPENAPI-DIALECT-F1`) và mock của Orval 8.24 (`OPENAPI-DIALECT-F2`) là ghi chú bàn giao cho đội FE/Mobile — không đổi tên
  component, overlay hay ví dụ để thỏa chúng.
- Not smaller: dialect của document là một tính chất toàn cục; sửa một phần schema thì Orval vẫn từ chối cả document.
- Siblings: none.
- Scope map: n/a

## Primary Story/AC

| Story | AC                                          | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                                                            |
| ----- | ------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | `OPENAPI-EXAMPLE.1-F3`, `SEC-UPGRADE-RV-01` | n/a      | gỡ chặn merge G5/G6 ([g4-request-and-transfer-integration](../g4-request-and-transfer-integration/spec.md): route G5 dựng DTO qua factory và giữ gate dialect); review contract F1/F2/F4–F6 sau baseline nghiệp vụ và G5/G6; FE/Mobile tự sinh lại client khi bắt đầu nối API (ghi chú bàn giao ở _Findings_) |

## Supporting references

- [API contract](../../../rules/api-contract.md) — ma trận lỗi parser (P29-N1/N2/N4), handoff OpenAPI, ví dụ response.
- Prompt 26 [`openapi-response-examples`](../openapi-response-examples/spec.md) (finding F3, ví dụ, manifest), H2a
  [`h2a-openapi-presentation`](../h2a-openapi-presentation/spec.md) (`toOpenApi30Presentation`), Prompt 29A/29B
  [`g0-g4-checkpoint-fix-forward`](../g0-g4-checkpoint-fix-forward/spec.md) (parser 400/413/415/500).
- OpenAPI 3.0.3 Schema Object (tập con JSON Schema, `nullable`, `exclusiveMinimum` boolean); OpenAPI 3.1 (JSON Schema 2020-12).
- Bản cài thật 25/10/2026: `zod` 4.6.7, `nestjs-zod` 5.5.0 (bản mới nhất trên registry), `@nestjs/swagger` 11.4.6,
  `express` 5.2.1, `body-parser` 2.4.0, `multer` 2.5.0; sau Prompt 00A: `qs` 6.16.1 (override), `fast-uri` 3.1.9 (bỏ pin),
  `nodemailer` 10.1.7. Bằng chứng lịch sử của Prompt 26A (trước quyết định Owner về FE/Mobile): Orval 8.39.0 +
  `@scalar/openapi-parser` 0.29.9 của FE; Orval 8.24.0 + `@scalar/openapi-parser` 0.28.12 theo lock của Mobile.

## Explicit out of scope

- Sửa F1/F2/F4–F6 của Prompt 26; H7; Prompt 27; G5/G6; review nghiệp vụ G0–G6.
- Sửa, format, cài đặt, sinh mã hay chạy lệnh trong repo FE, Mobile; sửa repo Docs; commit/push.
- Hạ phiên bản hoặc gỡ override của Zod, `body-parser`, `multer`; nâng major của `nodemailer`/`fast-uri`.
- Đổi tên component, khai tag toàn document, đổi overlay `message` của Prompt 26 (đổi contract hoặc ví dụ).

## Dependencies and blockers

Điều kiện vào, kiểm 25/10/2026: Prompt 26 đã commit `8b10897` ("docs(openapi): concise, truthful response examples
(OPENAPI-EXAMPLE.1)", 93 tệp = 80 sửa + 13 mới, đúng checkpoint đã review), `HEAD = dev = origin/dev = 8b10897`, ahead/behind
`0/0`, index rỗng, cây sạch; hai lần export trùng byte nhau và trùng `openapi.json` đã commit. Lượt đầu của Prompt 26A dừng ở
preflight vì Prompt 26 chưa commit; chạy lại sau khi Owner commit/push.

## Ownership: module, data, API

- `src/infrastructure/http/openapi-dialect.ts` (mới): `findOpenApi30Violations`, `assertOpenApi30Dialect`, `OpenApiDialectError`.
- `src/infrastructure/http/openapi-presentation.ts`: thêm quy tắc 3.0 cho `type` mảng, nhánh null, enum nullable, bound
  số, `propertyNames` thừa.
- `src/infrastructure/http/dto/zod-dto.ts` (mới): `createZodDto` của ứng dụng; 37 tệp DTO/controller đổi import sang đây.
- `scripts/dev/export-openapi.ts`: từ chối ghi document lệch dialect, in từng pointer.
- Test: `openapi-dialect.spec.ts`, `openapi-presentation.spec.ts`, `dto/zod-dto.spec.ts`;
  `test/http/platform/openapi-dialect.http-spec.ts`, `test/http/platform/security-upgrade-regression.http-spec.ts`,
  `test/http/platform/openapi-export.http-spec.ts`, `test/http/platform/api-inventory.http-spec.ts`; support `test/support/openapi-semantics.ts`.
- `openapi.json` (exporter). Không bảng, migration, bounded context hay import liên module mới.
- Prompt 00A: `src/infrastructure/http/request-body-limit.ts` (`ACCEPTED_CONTENT_ENCODINGS`, `contentEncodingAllowlist`) và
  spec của nó; `src/infrastructure/mail/mail-transport.spec.ts` (mới); `package.json` (`nodemailer` 10.1.7),
  `pnpm-workspace.yaml` (override `qs` 6.16.1, bỏ `fast-uri`), `pnpm-lock.yaml` (pnpm sinh); `security-upgrade-regression`
  e2e; [API contract](../../../rules/api-contract.md).

## Behavior and design

### Nguyên nhân (đo trên bản cài)

- **Zod 4.6** thêm bước `compactTypeUnion` cho mọi target trừ `openapi-3.0`: `anyOf` gồm các nhánh chỉ có `type` (một
  `z.string().nullable()` trần, kể cả chuỗi đã `refine`) thành `type: ["string", "null"]`. Nhánh có ràng buộc vẫn là `anyOf`.
- **nestjs-zod 5.5.0** (`convertToOpenApi3Point0`) chỉ đổi `anyOf`+null sang `nullable`, không biết `type` mảng. Khi đổi một
  `anyOf` nó trả object mới mà không chạy lại callback, nên `propertyNames: {type: "string"}` của record nullable còn lại —
  lỗi này **có từ trước nâng cấp** (`70c533a` đã có 2 lỗi `propertyNames` với validator của Orval).
- **@nestjs/swagger 11.4.6** đọc `type` mảng của **thuộc tính cấp cao nhất** (nestjs-zod chuyển nguyên) là cú pháp "mảng của"
  của chính nó: bốn trường request `UpdateSubscriptionBodyDto.endDate`/`renewalDate`/`noticeDeadline`,
  `PlanTermsBodyDto.lastReviewedOn` từ `ea73c2f` bị in thành `{type: array, items: {type: string}}` — hợp lệ 3.0 nên validator
  không thấy, nhưng client sinh `string[]` cho trường nhận chuỗi/null. Thuộc tính lồng (76 chỗ trong 26 response DTO) đi qua
  Swagger nguyên vẹn nên mới thành lỗi validator.

### Chọn dialect: OpenAPI 3.0 (bằng chứng)

- **3.1 (đã đo):** khai `3.1.0` + `cleanupOpenApiDoc(version '3.1')` thì validator của Orval nhận, nhưng diff ngữ nghĩa với
  artifact Prompt 26 là **1 182** thay đổi (`nullable` → `anyOf … null` khắp nơi, `enum: [x]` → `const`, `exclusiveMinimum` số,
  thêm lại 117 regex dư), bốn trường request **vẫn** là mảng, và validator 2020-12 bỏ qua từ khóa lạ nên một `nullable` 3.0
  sót lại sẽ âm thầm mất nghĩa.
- **3.0 (chọn):** đưa schema về đúng biểu diễn trước nâng cấp. So `components.schemas` với `70c533a` (trước Zod 4.6.7), chỉ còn 6
  khác biệt có chủ đích (2 `propertyNames` thừa bỏ đi, 4 enum nullable thêm `null`); với artifact Prompt 26 là 170 thay đổi, tất
  cả trong `components.schemas`. Validator 3.0 chặt (từ khóa lạ là lỗi), nên gate thật sự canh dialect.

### Hai lớp sửa, một gate

1. **Factory DTO (`dto/zod-dto.ts`).** `createZodDto` của nestjs-zod, runtime không đổi (cùng schema, `create`, validate,
   serialize, `Output`), chỉ sửa metadata Swagger đọc: thuộc tính cấp cao có `type` mảng được trả về `anyOf` gồm các type đơn
   mà mảng đại diện (đúng dạng Zod < 4.6 phát ra). Factory **thay** `_OPENAPI_METADATA_FACTORY` trên chính class nestjs-zod trả
   về, không tạo lớp con: Swagger gọi factory của mọi class trên chuỗi prototype và giữ giá trị đầu của mỗi khóa, nên lớp cha để
   nguyên sẽ trộn lại `isArray`/`items`. Có `anyOf` sẵn bên cạnh (Zod không sinh) thì để nguyên cho gate ngữ nghĩa bắt. Mọi DTO
   của ứng dụng dựng qua factory này — test ranh giới (parser TypeScript) từ chối `import { createZodDto } from 'nestjs-zod'`
   ngoài adapter.
2. **Presentation 3.0 (`toOpenApi30Presentation`)**, đệ quy trên components và mọi `schema` (request, response, parameter,
   header, `items`, `additionalProperties`, nhánh `allOf/anyOf/oneOf/not`), không bao giờ đụng `example(s)`, `default`, giá trị
   `enum`, extension: `type: [T, "null"]` → `type: T` + `nullable`; nhiều type → `anyOf` type đơn (+ `nullable`); nhánh
   `{type: "null"}` của `anyOf`/`oneOf` → `nullable` (một nhánh còn lại thì gộp vào cha nếu không xung đột, `$ref` hoặc xung đột
   thì giữ dưới `allOf`); enum nullable liệt kê `null` (OpenAPI 3.0.3) và enum có `null` thì nullable; `exclusiveMinimum`/
   `exclusiveMaximum` số → bound + cờ boolean (giữ bound chặt hơn); `propertyNames: {type: "string"}` (đúng với mọi khóa JSON)
   bị bỏ. Hình không có cách viết 3.0 chính xác (ví dụ `propertyNames` có `pattern`) được **giữ nguyên** để gate nêu tên, không
   âm thầm mất ràng buộc. Bất biến: không sửa input, áp hai lần cho cùng kết quả.
3. **Gate dialect (`openapi-dialect.ts`)**: mọi field ngoài Schema Object 3.0.3, `type` mảng/lạ, bound số, boolean schema ngoài
   `additionalProperties`, `enum` có `null` mà không `nullable`, `array` không `items`, sibling của `$ref`, `openapi` không phải
   `3.0.x` — trả pointer JSON + lý do. Dùng ở: `pnpm openapi:export` (từ chối ghi, in từng pointer), e2e document trong tiến
   trình, e2e artifact đã commit, test inventory (thay kiểm tra chỉ-`const` cũ).
4. **Gate ngữ nghĩa (e2e)**: với mọi route, DTO body/query/path/response thật (đọc từ metadata Nest/Swagger) được so với bản
   OpenAPI 3.0 do chính Zod dựng từ schema runtime (`z.toJSONSchema(target 'openapi-3.0', io 'input')`): type, nullable,
   required, enum, format, bound, items, map, `$ref`. Chuẩn hóa chỉ bỏ chú thích/ví dụ/extension, regex dư của uuid/date-time
   và `null` trong enum nullable. Trên artifact Prompt 26 gate này báo đúng 166 khác biệt (76 type mảng, 80 `nullable` thiếu,
   4 mảng sai + `items`, 2 `propertyNames`); trên cây cuối: 0. Mọi operation và mọi component đều được so.

### `SEC-UPGRADE-RV-01` — audit trên module thật

Diff mã nguồn thư viện (tarball 2.3.0/2.4.0, 2.4.0/2.5.0) chỉ ra bề mặt đổi; test e2e mới chạy qua đúng bản Nest nạp (một
bản mỗi thư viện, `MulterError` của filter là lớp `FileInterceptor` ném, nestjs-zod dùng Zod của ứng dụng):

- **Zod 4.6.7:** DTO thật `UpdateSubscriptionBodyDto`, `PlanTermsBodyDto` qua pipe thật (null/vắng/ngày thật, mảng/ngày không
  có/khóa lạ ⟹ 422 trước handler); schema đặc trưng (strict, default, transform, enum, union, uuid, date-time, record khóa enum
  vét cạn, mảng lồng có biên); serializer thật của `AuditEventPageResponseDto` (record + null; mảng thay record ⟹ 500 fail-closed).
  So kết quả parse Zod 4.4.3 và 4.6.7 trên 35 ca: **giống hệt** (success, data, mã/đường dẫn issue).
- **body-parser 2.4.0:** JSON gzip/deflate/br hợp lệ đọc đúng; thân nén nở quá 100 KiB ⟹ 413 `entity.too.large` trước handler;
  gzip bị cắt ⟹ 400 `Z_BUF_ERROR`; khóa kiểu `__proto__`/`constructor.prototype` (JSON và URL-encoded) ⟹ 422, không ô nhiễm
  prototype; bảng lỗi ghi lại đúng `type`/mã zlib đối tượng lỗi thật mang tới filter. Ma trận 400/413/415/500 giữ nguyên.
- **multer 2.5.0:** hai route upload thật (service bị thay bằng spy): bytes + trường form tới service; tệp rỗng tới route; trường
  64 byte qua, 65 byte ⟹ 400; 2 trường qua, trường thứ 3 ⟹ 400; form cắt cụt/thiếu boundary/header hỏng ⟹ 400 không lộ thông
  điệp thư viện, service không được gọi; client bỏ đi giữa upload ⟹ không unhandled rejection, request sau vẫn được phục vụ.
  Lưu trữ là bộ nhớ (không `MulterModule`/`diskStorage`/`dest`), nên không có tệp tạm.

### Prompt 00A — correction trong cùng checkpoint (Owner review 25/10/2026)

- **Mã hóa nội dung (`SEC-UPGRADE-RV-01-F1`):** contract công khai giữ như trước nâng cấp — thân JSON/URL-encoded chỉ `gzip`,
  `deflate`, `br` hoặc không mã hóa; đây cũng là điều mô tả 415 của OpenAPI đã ghi ("a Content-Encoding other than gzip, deflate
  or br") mà runtime 2.4.0 làm sai cho `zstd`. `contentEncodingAllowlist` mount trước hai parser trong `applyRequestBodyLimit`:
  thân JSON/URL-encoded (theo `request.is` của Express, đúng `type` mặc định của parser) có mã hóa khác ⟹
  `next(new UnsupportedMediaTypeException())` — filter trả đúng 415 `HTTP_UNSUPPORTED_MEDIA_TYPE` như khi parser từ chối, không
  handler, không lộ gì. Header đọc như body-parser (vắng/rỗng = identity, không phân biệt hoa/thường, một giá trị). Không vá
  body-parser, không tắt giải nén (gzip/deflate/br và giới hạn sau giải nén giữ nguyên), không lặp mapper. Multipart và request
  không thân không qua allowlist (multer không giải mã `Content-Encoding`, trước và sau nâng cấp). Từ chối dựa vào header nên
  giống nhau trên runtime có hay không có zstd.
- **Phụ thuộc (`SEC-UPGRADE-RV-01-F3`):** override `qs` 6.16.0 → 6.16.1 (khoảng `^6.16.1` của body-parser 2.4.0; 6.16.1 sửa độ
  bền `parse`); bỏ pin `fast-uri` 3.1.8 → 3.1.9 (cùng khoảng `^3.0.1` của `ajv`; chỉ nằm trên đường tooling — dev server của
  Prisma, Nest CLI/webpack — API không nạp); `nodemailer` 10.0.12 → **10.1.7** (bản vá cuối của 10.1, gồm bản sửa addressparser
  10.1.4–10.1.6; 10.2 thêm tính năng nên không chọn). Lockfile chỉ do pnpm sinh; diff lockfile đúng ba gói đó.
  `smtp-server` 3.19.15 (devDependency, máy chủ SMTP giả của test) vẫn ghim `nodemailer` 10.0.12 riêng cho chính nó — không trên
  đường runtime, không thuộc `audit --prod`.
- **Hồi quy thêm:** bản nạp thật (`qs` 6.16.1 qua body-parser và Express, `nodemailer` 10.1.7, `fast-uri` không nạp); 12 hình
  parse URL-encoded của `qs` (echo, giống hệt 6.16.0, kể cả `a[]b`); transport SMTP với `nodemailer` thật + máy chủ SMTP trong
  tiến trình: người gửi/nhận envelope, header, tiêu đề tiếng Việt RFC 2047, ba hình của advisory addressparser chỉ tới đúng
  hộp thư, 451 ⟹ tạm thời, 550 ⟹ vĩnh viễn, không kết nối được ⟹ `ESOCKET` tạm thời, lỗi không mang địa chỉ/nội dung.

## Findings

Đóng ở đây:

- `OPENAPI-EXAMPLE.1-F3` — dialect lẫn 3.1 trong document 3.0 (76 `type` mảng, 2 `propertyNames`): **đóng** — gate dialect của
  BE: 0 vi phạm (export từ chối ghi khi có); validator chuẩn `@scalar/openapi-parser` 0.29.9: `valid`, 0 lỗi (trước: 154). Bằng
  chứng lịch sử của Prompt 26A, chạy **ngoài** repo FE/Mobile trong thư mục tạm trước quyết định Owner: Orval CLI 8.39 (bản FE
  cài) và 8.24 (bản theo lock Mobile) đọc và sinh client exit 0. **Không** chạy và không khẳng định: `api:validate` của repo
  FE/Mobile (bản sao báo 209 lỗi quy ước — `OPENAPI-DIALECT-F1`), mock sinh ra (Orval 8.24 có lỗi —
  `OPENAPI-DIALECT-F2`), typecheck của repo FE/Mobile. Prompt 00A không chạy lại lệnh FE/Mobile nào.
- `OPENAPI-EXAMPLE.1-F3a` (mới, High, đóng): bốn trường request in thành `string[]` từ `ea73c2f` (Swagger đọc `type` mảng của
  thuộc tính cấp cao). Nay `{type: string, nullable: true}`; client sinh `string | null`.
- `OPENAPI-EXAMPLE.1-F3b` (mới, đóng): `propertyNames` còn sót có từ trước nâng cấp (nestjs-zod không chạy lại callback sau khi
  gộp nhánh null) — FE không sinh được client ngay cả ở `70c533a`.
- `OPENAPI-EXAMPLE.1-F3c` (mới, đóng): `usageCollectionDefault` (literal nullable, 4 response DTO của ứng dụng) là enum nullable
  không liệt kê `null` (`const` đổi sau khi nestjs-zod đã thêm null cho enum khác); nay như 26 enum nullable còn lại.

- `SEC-UPGRADE-RV-01-F1` (đóng, Prompt 00A): `body-parser` 2.4.0 giải nén thân **zstd** nơi Node hỗ trợ (CI Node 22, image
  `node:24`, local 24.0.1) — trên cây 26A thân zstd thật được đọc (2xx); 2.3.0 trả 415. Owner chọn giữ contract trước nâng
  cấp: allowlist ở ranh giới parser ⟹ 415 `HTTP_UNSUPPORTED_MEDIA_TYPE`, handler không chạy, không lộ gì; gzip/deflate/br và 413
  sau giải nén giữ nguyên.
- `SEC-UPGRADE-RV-01-F2` (ghi nhận, không cần sửa): `multer` 2.5.0 cho trường đúng 64 byte (2.4.0 từ chối) — nay khớp mô tả
  contract "trường văn bản quá 64 byte"; các giới hạn khác không đổi. Giới hạn `parts: 3` không bao giờ là giới hạn chạm đầu
  tiên (`fields: 2` + `files: 1` = 3).
- `SEC-UPGRADE-RV-01-F3` (đóng, Prompt 00A): `qs` 6.16.0 → 6.16.1, `fast-uri` 3.1.8 → 3.1.9 (bỏ pin), `nodemailer` 10.0.12 →
  10.1.7; hai advisory của `fast-uri` và ba của `nodemailer` không còn trong `pnpm audit --prod` (kết quả ở [plan](plan.md)).

Còn mở, có chủ:

- `SEC-UPGRADE-RV-01-F4` (dev-only, Owner/phụ thuộc): `smtp-server` 3.19.15 (devDependency) ghim `nodemailer` 10.0.12 cho chính
  nó — đường `smtp-server > nodemailer`, chỉ máy chủ SMTP giả của test, ngoài `audit --prod`. `smtp-server` ≥ 3.21.0 ghim
  `nodemailer` 10.1.7+; nâng là quyết định riêng (ngoài ba gói của Prompt 00A).
- `SEC-UPGRADE-RV-01-T1` (bằng chứng test): SuperTest tuần tự hóa `Buffer` thành JSON khi `content-type` là JSON, nên các ca
  P29-N4 trong `app.e2e-spec.ts` gửi Buffer ("brotli body that is not brotli", "gzip body cut short") không gửi đúng byte nén —
  vẫn 400 nhưng vì lý do khác. Bản byte thật nằm ở `security-upgrade-regression.e2e-spec.ts`; sửa test cũ khi Owner muốn.
- `OPENAPI-DIALECT-F1` (bàn giao FE/Mobile, có từ trước): bản sao `api:validate` của FE/Mobile (cùng một script) báo 209 lỗi quy
  ước — 146 operation dùng tag chưa khai ở mức document, 63 component request không kết thúc bằng `Request` — không lỗi
  dialect nào (`70c533a`: 354). BE không đổi tên component hay contract vì finding này; đội FE/Mobile tự xử lý khi nối API.
- `OPENAPI-DIALECT-F2` (bàn giao Mobile): Orval 8.24 (lock của Mobile) sinh mock faker `message: {}` cho overlay `message` không
  `type` của Prompt 26 ⟹ 145 lỗi TS chỉ trong mock (quan sát trong thư mục tạm ở 26A, không phải typecheck của repo Mobile).
  Đội Mobile tự chọn toolchain khi nối API; BE không đổi overlay/ví dụ trong gói này.
- `OPENAPI-EXAMPLE.1-F1`, `-F2`, `-F4`, `-F5`, `-F6` — giữ nguyên, review contract sau baseline nghiệp vụ/G5/G6.

## Test matrix

| AC / rủi ro                | Tình huống (gồm từ chối, edge case)                                                                                       | Cấp test         | Kết quả mong đợi                                    | Bằng chứng sau implement |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------- | ------------------------ |
| Một dialect                | `type` mảng/`null`, `propertyNames`, `const`, `prefixItems`, bound số, `items: true`, enum null, `$ref` + sibling         | unit             | pointer + lý do; `openapi` khác `3.0.x` bị từ chối  | [plan](plan.md)          |
| Mọi vị trí schema          | components, request/response/parameter/header inline, `items`, map, `allOf/anyOf/oneOf/not`; ví dụ/default/extension      | unit             | vi phạm được nêu / dữ liệu không bị đọc như schema  | [plan](plan.md)          |
| Presentation đúng nghĩa    | nullable, multi-type, nhánh null, enum nullable, bound số, `propertyNames`; khớp bản 3.0 của chính Zod                    | unit             | như mô tả; bất biến, áp hai lần như nhau            | [plan](plan.md)          |
| Swagger không đọc sai      | DTO có thuộc tính nullable/union cấp cao; factory của thư viện (báo động nâng cấp)                                        | unit (app Nest)  | `{type, nullable}`; thư viện trần vẫn ra mảng       | [plan](plan.md)          |
| Ranh giới factory          | `createZodDto` import từ `nestjs-zod` ngoài adapter (kể cả đổi tên)                                                       | unit (TS parser) | đỏ                                                  | [plan](plan.md)          |
| Document thật              | document trong tiến trình, artifact đã commit, mutation tái đưa `type` mảng/`propertyNames` vào component thật            | e2e              | 0 vi phạm; mutation nêu đúng pointer                | [plan](plan.md)          |
| Đúng runtime               | mọi body/query/path/response DTO so với bản 3.0 của Zod; bốn trường request                                               | e2e              | 0 khác biệt; `{type: string, nullable: true}`       | [plan](plan.md)          |
| Bất biến Prompt 26         | operation, operationId, status, security, mô tả, 145 ví dụ thành công, 1 570 ví dụ lỗi, 7 ngoại lệ G5                     | e2e + script     | không đổi; diff chỉ trong `components.schemas`      | [plan](plan.md)          |
| Validator chuẩn            | `@scalar/openapi-parser` trên artifact (26A); Orval chạy cô lập ngoài repo FE/Mobile chỉ là bằng chứng lịch sử 26A        | script (tạm)     | `valid`; repo FE/Mobile không phải gate (Owner)     | [plan](plan.md)          |
| Zod / body-parser / multer | mục _SEC-UPGRADE-RV-01_                                                                                                   | e2e + script     | ma trận giữ nguyên; thay đổi thư viện thành finding | [plan](plan.md)          |
| Mã hóa nội dung (00A)      | zstd thật (thân hợp lệ, bomb); `zstd`/`ZSTD`/`compress`/`gzip, br`/lạ theo header; identity/`GZIP`; không thân; multipart | unit + e2e       | 415 trước parser, không handler/lộ; còn lại như cũ  | [plan](plan.md)          |
| Phụ thuộc (00A)            | bản nạp `qs`/`nodemailer`/`fast-uri`; 12 hình parse `qs`; SMTP: envelope, header, RFC 2047, advisory, 451/550/kết nối     | unit + e2e + int | đúng bản; hình như 6.16.0; advisory không còn       | [plan](plan.md)          |

## Definition of Done

- [x] Test đỏ trước trên artifact Prompt 26 (nullable mảng, `propertyNames`, bốn trường request) và xanh sau.
- [x] Export hai lần trùng byte; diff ngữ nghĩa chỉ là biểu diễn dialect; ví dụ Prompt 26 không đổi.
- [x] Validator chuẩn nhận artifact; bằng chứng Orval cô lập của 26A ghi đúng phạm vi (không phải `api:validate`, mock hay
      typecheck của repo FE/Mobile); repo FE/Mobile không bị sửa hay chạy lệnh.
- [x] Prompt 00A: zstd ⟹ 415 (đỏ trước: 2xx), `qs`/`fast-uri`/`nodemailer` đúng bản (đỏ trước: bản cũ), advisory addressparser
      (đỏ trước: giao tới `attacker@evil.test`), `audit --prod` 0 advisory.
- [x] Audit Zod/parser/multipart trên module thật; `pnpm audit` của CI chạy thật.
- [x] `pnpm check`, `pnpm test:e2e`, rules/format/links, `git diff --check` xanh trên cây cuối (kết quả ở [plan](plan.md)).
- [ ] Owner review; không commit.

## Changes and acceptance

- 25/10/2026 — lượt đầu dừng ở preflight (Prompt 26 chưa commit); Owner commit/push `8b10897`, lượt hai chạy đủ.
- 25/10/2026 — chọn OpenAPI 3.0 theo bằng chứng ở _Chọn dialect_; thêm factory DTO vì phần lỗi bốn trường request xảy ra trước
  bước presentation (không sửa được bằng hậu xử lý document).
- 25/10/2026 — Owner review Prompt 26A: FE/Mobile **không** phải đích triển khai/kiểm chứng của workstream BE; `OPENAPI-DIALECT-F1`
  và `-F2` thành ghi chú bàn giao. Prompt 00A (correction trong cùng hạng mục, cùng checkpoint chưa commit): giữ contract mã hóa
  trước nâng cấp (zstd ⟹ 415) và nâng `qs`/`fast-uri`/`nodemailer` lên bản có bản sửa.
- 25/10/2026 — số path của cây 26A trước correction là **56** = 47 sửa + 9 mới (báo cáo 26A ghi nhầm 55).
- Chưa nghiệm thu.

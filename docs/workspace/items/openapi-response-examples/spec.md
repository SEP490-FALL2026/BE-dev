# Spec: ví dụ response OpenAPI ngắn gọn và đúng sự thật (`OPENAPI-EXAMPLE.1`)

- Phụ trách: AI theo giao việc (Prompt 26, 25/10/2026).
- Thiết kế ban đầu bởi: Owner (Prompt 26 trong `Prompts/BE-audit-and-architecture-2026-10-18/`); AI chốt thiết kế chi tiết.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (baseline nghiệp vụ hiện hành tới `QĐ-86`; hạng mục không đổi nghiệp vụ), BE `ea73c2f`. Không Story/AC nào.
- Nhóm roadmap: xuyên module — `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · [Inventory operation/status/code](inventory.md) · [Inventory sau merge G5/G6](inventory-g5-g6.md)
  (Prompt 02, 26/10/2026).

## Business outcome

Sau lát này Swagger UI và `openapi.json` cho mỗi response JSON một ví dụ đọc được: response thành công hiện đúng `message`
mà handler trả (key ngắn như `APPLICATION.LISTED`), response lỗi hiện các mã lỗi thật sự với tới được ở operation và status
đó, mỗi mã một ví dụ đặt tên theo mã — thay cho chuỗi ngẫu nhiên dài mà bộ sinh mẫu của Swagger tạo từ regex của
`message`/`code`. Kiểm bằng `test/e2e/api-inventory.e2e-spec.ts` (đối chiếu manifest literal độc lập) và diff `openapi.json`
chỉ gồm ví dụ.

## Sizing decision

- Container: Prompt 26 — finding `OPENAPI-EXAMPLE.1` (Swagger hiện mẫu ngẫu nhiên cho `SuccessEnvelope.message`,
  `ErrorEnvelope.error.code`, `ErrorEnvelope.error.message`).
- Mode: `technical-enabler`.
- Outcome and owner: ví dụ response trong tài liệu API; sở hữu `src/infrastructure/http` (decorator, ví dụ dùng chung,
  hậu xử lý document) và hằng ví dụ trong `*.http-errors.ts` của từng capability.
- Boundaries: chỉ trình bày OpenAPI; không đổi route, operationId, status, security, schema component, mô tả, DTO, quyền,
  migration. Một ngoại lệ runtime có chủ đích: thông điệp `APPLICATION.DICTIONARY_GROUP_CHANGED` rút gọn còn ≤ 160 ký tự
  (quyết định người giao việc 25/10/2026, mục _Changes and acceptance_).
- Not larger: sửa mô tả lệch, thêm status còn thiếu và lỗi OpenAPI 3.1 sau Zod 4.6.7 là finding riêng (mục _Findings_);
  Prompt 27, H7, G5–G10 không thuộc đây.
- Not smaller: một contract trình bày cho mọi operation; ví dụ một nửa số route thì gate inventory không đóng được.
- Siblings: none.
- Scope map: n/a

## Primary Story/AC

| Story | AC                  | Coverage | Phần còn lại thuộc                                                                                                                                                  |
| ----- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | `OPENAPI-EXAMPLE.1` | n/a      | gỡ chặn `g4-request-and-transfer-integration` (gắn request gate thật ⟹ thêm ví dụ 409/422 của route cấp và route tác vụ), Prompt 27 và client FE/Mobile đọc Swagger |

## Supporting references

- [API contract](../../../rules/api-contract.md) — envelope lỗi, mã guard/pipe/parser, 429 toàn cục, handoff OpenAPI.
- H2a [`h2a-openapi-presentation`](../h2a-openapi-presentation/spec.md) (security, summary, placeholder, OpenAPI 3.0),
  H2b [`h2b-openapi-wire-messages`](../h2b-openapi-wire-messages/spec.md) (message riêng, 422, 429),
  Prompt 24 [`final-foundation-hardening`](../final-foundation-hardening/spec.md), Prompt 29A/29B
  [`g0-g4-checkpoint-fix-forward`](../g0-g4-checkpoint-fix-forward/spec.md) (413/415/400 parser).
- NestJS OpenAPI: [operations](https://docs.nestjs.com/openapi/operations) (`@ApiResponse` với `examples`, `schema`),
  [types and parameters](https://docs.nestjs.com/openapi/types-and-parameters) (`ApiExtraModels`, `getSchemaPath`,
  `allOf`). Phiên bản cài thật (25/10/2026): `@nestjs/swagger` 11.4.6, `nestjs-zod` 5.5.0, `zod` **4.6.7** (Owner nâng từ
  4.4.3 ở `ea73c2f`); `ResponseObjectFactory` của 11.4.6 chép `example`/`examples` của `@ApiResponse` vào media type.

## Explicit out of scope

- Sửa mô tả response lệch với code thật, thêm status còn thiếu, đổi status/mã — chỉ ghi finding (mục _Findings_).
- `type: ["string", "null"]` (cú pháp OpenAPI 3.1) xuất hiện trong document 3.0.0 sau khi Owner nâng Zod lên 4.6.7
  (`ea73c2f`) — finding `OPENAPI-EXAMPLE.1-F3`, cần hạng mục riêng vì đổi schema.
- Sinh lại client FE/Mobile; Prompt 27; H7; G5–G10.

## Dependencies and blockers

Điều kiện của Prompt 26, kiểm trên cây thật 25/10/2026: Prompt 07 và 08 đã ghi ở roadmap; mọi remediation đổi route/status/DTO
của G0→G4 đã được Owner checkpoint bằng commit (`bf2a1f7`, `70c533a`, `ea73c2f`; `dev = origin/dev = ea73c2f`, cây sạch;
remote CI `ea73c2f` **success**, run `40114793755`). Còn mở nhưng không chặn: `P28-05` → G6, `P28-09` → G5, backlog `P28-14`,
`P28-15`, `P28-16`. Tracker ngoài ghi "Prompt 26 chờ G5/G6 ổn định"; người giao việc chọn **chạy ngay trên `ea73c2f`**
(25/10/2026). Hệ quả: route G5/G6 merge sau phải khai `examples` (kiểu `ErrorResponseDeclaration` bắt buộc) và thêm mục
manifest — gate e2e đỏ nếu thiếu.

## Ownership: module, data, API

- `src/infrastructure/http`: `openapi-error-examples.ts` (mới: `ErrorExample`, `errorExampleOf`, `toNamedErrorExamples`,
  `withErrorExamples`); `openapi-success-examples.ts` (mới: `withSuccessMessageExamples`); `bootstrap.ts` (thêm bước đó vào
  `createOpenApiDocument`); `decorators/api-success-response.decorator.ts`, `decorators/api-error-responses.decorator.ts`;
  `openapi-rate-limit.ts`, `openapi-request-parser.ts`; `filters/fallback-error.ts` (mới, tách từ filter); `errors/access-errors.ts`
  (mới); `errors/service-unavailable.ts`, `pipes/zod-validation.pipe.ts` (hằng body dùng chung).
- `src/infrastructure/security/guards/*`, `src/infrastructure/health/health.controller.ts`: ném đúng hằng body mà ví dụ dùng.
- 20 tệp `*.http-errors.ts`: thêm hằng `*_ERROR_EXAMPLES`; 39 controller: thêm `examples` cho mọi khai báo lỗi.
- `test/support/openapi-example-manifest.ts` (mới), `test/e2e/api-inventory.e2e-spec.ts`, unit spec của các tệp trên.
- Không bảng, migration hay bounded context mới; không import liên capability mới (ví dụ lấy từ đúng mapper controller đã dùng).

## Behavior and design

**Thành công.** `@ApiSuccessResponse` dùng **một** giá trị `message` đã resolve cho cả `SUCCESS_MESSAGE_METADATA` (interceptor)
và ví dụ: giá trị đi trên response bằng extension nội bộ `x-success-message`, và `withSuccessMessageExamples` (bước đầu của
`createOpenApiDocument`) đổi schema thành `allOf: [{ $ref: <DTO> }, { properties: { message: { example } } }]` rồi bỏ
extension. DTO vẫn đăng ký qua `type` như cũ nên thứ tự `components.schemas` không đổi (bản đầu dùng `ApiExtraModels` làm đảo
thứ tự component — nội dung giống hệt nhưng diff ồn, nên đã thay). `success` và `data` vẫn do DTO mô tả, không chép hay làm
phẳng DTO, không media-type `example` che `data`.
`DEFAULT_SUCCESS_MESSAGE` giữ làm fallback; gate "không route nào rơi về `COMMON.SUCCESS`" giữ nguyên. Response không body
duy nhất: `authLogout 204` (`@RawResponse`).

**Lỗi.** Mỗi khai báo `ApiErrorResponses` bắt buộc `examples` (tuple không rỗng) — hoặc, chỉ cho status đã khai mà runtime
hiện tại chưa trả được, `noExampleBecause` (lý do, không ví dụ; danh sách chính xác ở `NO_EXAMPLE_RESPONSES` của manifest). Mỗi ví dụ là `{ code, message, details? }`
xuất thành media-type `examples` tên theo `code`, `summary` = message, `value` = envelope đầy đủ với
`requestId: 'req_example'`. Schema vẫn `$ref ErrorEnvelopeDto`. Một mã chỉ xuất hiện một lần mỗi response (trùng ⟹ lỗi khi
khai báo).

- **Ví dụ dùng chung** (`api-error-responses.decorator.ts`): 401 `AUTHENTICATION_REQUIRED` + `INVALID_ACCESS_TOKEN`
  (`UNAUTHENTICATED_RESPONSE`), 503 `TOKEN_VERIFICATION_UNAVAILABLE` + `SERVICE_UNAVAILABLE`
  (`GUARDED_SERVICE_UNAVAILABLE_RESPONSE`), 403 `AUTHORIZATION.FORBIDDEN` (`FORBIDDEN_EXAMPLE`), 422 `VALIDATION_ERROR` với
  `details.issues: [{ code: 'invalid_type', path: '<field>' }]` (`VALIDATION_EXAMPLE`), và `fallbackExample(status)` cho lỗi
  không mã riêng. Guard, pipe, `toUnavailableApiException` và filter ném/trả **đúng** các hằng đó (`access-errors.ts`,
  `VALIDATION_ERROR_BODY`, `SERVICE_UNAVAILABLE_ERROR`, `fallbackErrorFor`) — wire không đổi, hai bên không trôi.
- **Ví dụ theo route** (404/409/422/403 nghiệp vụ, 400/401/429/503 riêng): hằng `*_ERROR_EXAMPLES` trong chính
  `*.http-errors.ts` mà controller dùng, mỗi mục = `errorExampleOf(toXApiException(new XError(args)))` — mã, thông điệp và
  `details` là của mapper runtime, không literal chép tay, không đọc mô tả/tên lớp/source. Đối số động dùng placeholder
  tất định (`'<employee-id>'`, `'CC-01'`, `'2026-01-01'`, `'XYZ'`; thời điểm duy nhất `2026-01-01T00:00:00.000Z`).
  `errorExampleOf` từ chối mọi thứ không phải `ApiException` có mã ⟹ mapper bỏ sót thì app không khởi động được.
- **Hậu xử lý document:** 429 toàn cục và 400/413/415 của parser JSON thêm ví dụ `fallbackErrorFor` (`HTTP_TOO_MANY_REQUESTS`,
  `HTTP_BAD_REQUEST`, `HTTP_PAYLOAD_TOO_LARGE`, `HTTP_UNSUPPORTED_MEDIA_TYPE`, thông điệp "The request could not be
  processed."); response tự khai giữ ví dụ của mình và được thêm ví dụ toàn cục sau đó, đúng một lần. `toOpenApi30Presentation`
  chép `example`/`examples` nguyên vẹn.
- **Mã nào được hiện:** chỉ mã đã truy vết được tới operation/status (guard → pipe → service/policy/repo → mapper), ngày
  25/10/2026 trên `ea73c2f`; kết quả ở [inventory](inventory.md) và manifest. Mã chỉ có trong mô tả mà không với tới được thì
  không hiện; mã với tới được ở status không khai thì không thêm status (finding).
- **Với tới được trên runtime đang chạy (quyết định 25/10/2026):** request gate đang gắn tới G5 là `RefusingGrantRequestGate`
  (luôn `REQUEST.NOT_FOUND`) và chỉ lần cấp mới tạo tác vụ. Vì vậy `provisioningTaskGrant` chỉ hiện 404 `REQUEST.NOT_FOUND`,
  422 `VALIDATION_ERROR`; các route tác vụ (claim, complete, report-failure, retry, hand-off, close-failed) không hiện
  `PROVISIONING.ANOTHER_IT_ADMIN_NEEDED` và mã trạng thái tác vụ; bảy response 409 đó khai `noExampleBecause`. Kiểm tra đầu vào
  chạy trước khi đọc tác vụ (`EVIDENCE_REQUIRED`, `REASON_REQUIRED`) vẫn hiện. `g4-request-and-transfer-integration` (G5)
  gắn gate thật thì thêm ví dụ và gỡ mục registry.
- **Giới hạn:** `code` ≤ 80 ký tự, `message` ≤ 160 ký tự; không chuỗi dài ngẫu nhiên, credential, email, timestamp sống,
  mã nội bộ (`US-*`, `AC-*`, `QĐ-*`).
- Transaction, migration, job, storage: không áp dụng (chỉ trình bày).

## Findings (không sửa ở đây)

- `OPENAPI-EXAMPLE.1-F1` — **mô tả lệch code** (ví dụ vẫn đúng vì lấy từ truy vết): mô tả nêu mã không với tới được
  (`COST_CENTER.KIND_NOT_SUPPORTED` trên rename/deactivate/employees; `PROJECT.INVALID` không tồn tại — mã thật
  `PROJECT.INVALID_*`; 422 domain của phòng/chức vụ/dự án gắn cả route đọc; `PLAN.NAME_TAKEN` là mã 409 duy nhất của
  `planCreate`; `APPLICATION.UPDATE_EMPTY` trên create…), mô tả không nêu mã (nhiều 404 "does not exist"), mã với tới được
  nhưng mô tả không nêu (`PARAMETER.VALUE_INVALID`, `NON_WORKING_DATE.*`, `JOB_TITLE.NAME_REQUIRED`…). Danh sách đầy đủ ở
  [inventory](inventory.md#mô-tả-lệch-code).
- `OPENAPI-EXAMPLE.1-F2` — **status với tới được nhưng không khai**: 409 `DEPARTMENT.INACTIVE` trên `departmentUpdate` và
  `departmentHeadAssign`.
- `OPENAPI-EXAMPLE.1-F3` — **OpenAPI 3.1 trong document 3.0**: sau Zod 4.6.7 (`ea73c2f`) trường nullable xuất
  `type: ["string", "null"]` thay `nullable: true`; client sinh theo 3.0 có thể hiểu sai.
- `OPENAPI-EXAMPLE.1-F4` — **một mã, hai thông điệp**: `VALIDATION_ERROR` từ lỗi parse tiền/tỷ giá (không `details`) bên cạnh
  của pipe; `HTTP_TOO_MANY_REQUESTS` của hạn mức mở khóa bên cạnh throttler. Ví dụ hiện một bản mỗi mã (pipe; hạn mức mở khóa).
- `OPENAPI-EXAMPLE.1-F5` — 500 không khai từ `Error` thường (trước cài đặt, registry chưa đăng ký, giải mã khóa) — đúng
  contract fallback, chỉ ghi nhận.
- `OPENAPI-EXAMPLE.1-F6` — **status khai nhưng runtime hiện tại không trả**: bảy 409 của route cấp/tác vụ (mục _Behavior_);
  mô tả của chúng vẫn liệt kê mã sau gate. Chủ: G5 (`g4-request-and-transfer-integration`). **Đóng ở Prompt 02** (G5 gắn gate
  thật; bảy response có ví dụ từ mapper).
- `OPENAPI-EXAMPLE.1-F7` (Prompt 02) — **mô tả lệch code ở G5/G6**: 52 mục (mã nêu mà không với tới, mã với tới mà không nêu,
  hằng khai báo dùng chung với mô tả sai cho một route) — danh sách ở [inventory sau merge](inventory-g5-g6.md); mô tả không sửa
  ở đây. Chủ: Prompt 03.
- `OPENAPI-EXAMPLE.1-F8` (Prompt 02) — **mã với tới nhưng không hiện** (quyết định Owner 3): 26 mã chuyển qua của
  `personnelNoticeRecord`, hai mã hook thu hồi. Chủ: Prompt 03/04 (port ví dụ hoặc contract nội module).
- `OPENAPI-EXAMPLE.1-F9` (Prompt 02) — **lỗi runtime thấy khi truy vết** (không phải ví dụ): `budgetVersionUpdate` với `reason`
  null trên phiên bản bị trả lại vi phạm `budget_versions_reason_check` ⟹ 500; `planId` không tồn tại ở đề xuất/dòng ngân sách
  vi phạm khóa ngoại ⟹ 500; bản nháp đầu của đề xuất đã rút/trả lại không gửi hay xóa được, chặn `budgetVersionCreate` cùng
  Cost Center/năm (`VERSION_IN_FLIGHT`); đường ghi nghỉ việc từ thông báo bỏ qua `OffboardingFrame.guarded()` ⟹ xung đột
  thành 500; năm mã placement của transfer có thông điệp chung "The transfer was refused (<CODE>)."; mapper có mục chết
  (`LONG_LEAVE.CONCURRENT_CHANGE`, `GROUP_REQUEST.LINE_NOT_FOUND`). Chủ: Prompt 03.
- `OPENAPI-EXAMPLE.1-F11` (Prompt 02, đã sửa) — **contract sai do merge**: ba component trùng tên (route đề xuất phần mềm, trả
  seat, import license key công bố schema của ngân sách hoặc ngược lại) và `LinePatchDto.quoteValidUntil` in thành `string[]`
  (31 DTO G5/G6 bỏ qua adapter) — đổi tên lớp, dùng adapter; FE/Mobile sinh lại client khi nối API.
- `OPENAPI-EXAMPLE.1-F10` (Prompt 02) — **chưa chứng minh với tới**: `LICENSE_ASSIGNMENT.NOT_OPEN` ở `close-failed`,
  `revocation-completion`, `access-cut` (không tìm thấy đường đóng assignment khi tác vụ còn mở) — không hiện. Chủ: Prompt 03.

## Phase sau merge G5/G6 (Prompt 02, 26/10/2026)

Merge G5/G6 `0da8f56` mang 150 operation viết trước gate Prompt 26: `pnpm typecheck` đỏ 149 lời gọi `ApiErrorResponses` (mỗi
lời gọi TypeScript chỉ báo đối số lỗi đầu tiên); inventory bằng parser trên cây merge: **450** response lỗi không ví dụ ở 149
operation, 38 controller (110 × 403, 113 × 404, 80 × 409, 147 × 422), cộng năm `noExampleBecause` cũ của route tác vụ.

- **Truy vết.** 161 operation (150 mới + 11 operation cũ mà G5/G6 đổi đường đi: chín route cấp/tác vụ, hai route assignment) truy
  từ guard/pipe qua service/policy/repo tới mapper, chia 8 nhóm theo capability (mỗi nhóm một tập tệp riêng, chỉ một tác tử
  tích hợp); kết quả: [inventory sau merge](inventory-g5-g6.md) và manifest. Ví dụ theo route dựng bằng
  `errorExampleOf(toXApiException(new XError(...)))` trong `*_ERROR_EXAMPLES` của đúng mapper controller dùng.
- **Bảy 409 của route cấp/tác vụ.** G5 gắn `AccessRequestGrantGate` thật (đăng ký qua `RegisteredGrantRequestGate`): tác vụ tồn
  tại, nên bảy ngoại lệ (gồm lý do tạm `NO_TASK_YET`) đều với tới được ⟹ gỡ cả bảy, thay bằng ví dụ từ mapper;
  `NO_EXAMPLE_RESPONSES` nay rỗng. Mã không với tới: `PROVISIONING_TASK.NOT_MANUAL` (không đường nào tạo tác vụ `CONNECTOR`),
  `PLAN.NOT_FOUND`/`EMPLOYEE.NOT_FOUND` ở cấp (không đường xóa) — không hiện, ghi finding.
- **Quyết định Owner 26/10/2026.** (1) `BUDGET.PROPOSAL_ALREADY_OPEN` và `BUDGET.VERSION_IN_FLIGHT` có hai thông điệp (kiểm tra
  trước khi ghi và kẻ thua đua ở unique index) ⟹ **một thông điệp**: kẻ thua trả đúng lỗi domain của kiểm tra (đổi runtime chỉ
  ở đường đua, mã/status/details giữ). (2) `budgetProposalList` khai 403 nhưng route `@AuthenticatedOnly` không bao giờ từ chối
  (người không được đọc nhận trang rỗng) ⟹ **bỏ 403**. (3) Mã của capability/module khác mà route chỉ chuyển qua
  (`personnelNoticeRecord`: mã của nghỉ dài/điều chuyển/nghỉ việc; hook thu hồi ở `claim`/`revocation-completion`:
  `HANDOVER.CONFIRMATION_PENDING`, `PROVISIONING.HANDOVER_PENDING`) ⟹ **không hiện, hoãn Prompt 03**: hiện chúng cần đăng ký
  contract nội module mới hoặc port ví dụ mới; ví dụ đang hiện vẫn đúng, chỉ không đầy đủ.
- **Theo tiền lệ đã commit của Prompt 26.** Thông điệp dựng từ một mẫu với tham số enum (`LICENSE_ASSIGNMENT.EFFECTIVE_DATE_INVALID`,
  `ASSESSMENT.REFERENCE_NOT_FOUND`, `GROUP_REQUEST.PLAN_NOT_ELIGIBLE`…) hiện một đại diện; `VALIDATION_ERROR` của pipe vẫn là
  ví dụ khi parser tiền cũng trả mã đó (`-F4`).
- **503 đúng contract.** `api-contract`: route có guard khai 503 `GUARDED_SERVICE_UNAVAILABLE_RESPONSE` (`SERVICE_UNAVAILABLE` sau
  guard). Mapper của long leave, notice, transfer, transfer review, offboarding, congestion và route controlled wait trả mọi lỗi
  không phải của mình thẳng cho filter (500) ⟹ thêm `toUnavailableApiException(error) ?? error` như mọi mapper khác (đỏ trước
  7 ca, xanh sau; lỗi khác vẫn qua nguyên vẹn).
- **Gate của chính đợt merge mà typecheck đỏ đã che.** `budgetVersionImport` (multipart, giới hạn multer 2 MiB) không khai
  400/413 dù filter trả cả hai ⟹ khai bằng `fallbackExample` như hai route upload kia; 31 DTO G5/G6 dựng bằng `createZodDto` của
  `nestjs-zod` thay vì adapter `infrastructure/http/dto/zod-dto` ⟹ đổi import (runtime không đổi; OpenAPI sửa đúng một thuộc
  tính: `LinePatchDto.quoteValidUntil` từ `string[]` sai thành `string` nullable — lỗi `-F3a`); ví dụ chuyển của transfer lấy
  mã/subject qua `newTransferRefusal` (không literal lý do placement, `BEH.1`).
- **Gate e2e/unit chưa từng chạy được trên cây merge (lượt cuối Prompt 02).** (a) Ba lớp DTO của ngân sách trùng tên với DTO
  của module khác (`ImportResponseDto` với license key — contract trước merge, `ProposalBodyDto` với đề xuất phần mềm,
  `ReturnBodyDto` với trả seat): component Swagger theo tên lớp nên một route công bố schema của route kia ⟹ đổi tên lớp ngân
  sách (`BudgetLineImportResponseDto`, `BudgetProposalBodyDto`, `BudgetProposalReturnBodyDto`); `ImportResponseDto` trùng byte
  bản `471de5e` trở lại. (b) `params` của hộp thông báo viết `z.union([...]).nullable()` thay cho thành viên `z.null()`:
  cùng giá trị hợp lệ (đã đối chiếu), Zod dựng đúng `anyOf` + `nullable` mà document hiện. (c) Snapshot `itemProperties` của
  hai ngoại lệ `owner-decision` (`LD-13` điểm 5) review lại: hàng assignment thêm `cancelledAt`, hàng tác vụ thêm
  `revocation` — không phải trường danh tính, quyết định 5 vẫn mở; khóa registry không đổi. (d) Bốn chỗ e2e dựng cả document
  (`createOpenApiDocument`, đo 3–4 s cho 296 operation, thêm ~0,7 s của ví dụ/presentation) dùng ngân sách đặt tên
  `OPENAPI_DOCUMENT_BUDGET_MS` (30 s) thay mặc định 5 s của Jest.
- **Manifest.** `SUCCESS_MESSAGES` 295 mục (150 mới); `ROUTE_ERROR_CODES` thêm năm tệp theo vùng (budgets, requests, requests
  spend, personnel, licensing; mỗi tệp ≤ 400 dòng) và test mới "mỗi operation chỉ một lần giữa các phần".

## Test matrix

| AC / rủi ro                  | Tình huống (gồm từ chối, edge case)                                                         | Cấp test          | Kết quả mong đợi                                                    | Bằng chứng sau implement |
| ---------------------------- | ------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------- | ------------------------ |
| Success message              | Mọi response JSON 2xx; fallback `COMMON.SUCCESS` của decorator                              | unit + e2e        | `allOf[1].properties.message.example` = metadata = manifest literal | [plan](plan.md)          |
| DTO giữ nguyên               | `allOf[0]` là `$ref` component; không media-type `example`                                  | unit + e2e        | DTO component còn, overlay chỉ có `message.example`                 | [plan](plan.md)          |
| Ví dụ lỗi hợp schema         | Mọi response JSON ≥ 400                                                                     | e2e               | ≥ 1 ví dụ; tên = code; `errorEnvelopeSchema` nhận; `req_example`    | [plan](plan.md)          |
| Đúng mã với tới được         | Thêm mã ngoài manifest, bỏ một mã, khai status mới không manifest; registry không ví dụ cũ  | e2e               | so khớp tập chính xác đỏ                                            | [plan](plan.md)          |
| Giới hạn và dữ liệu nhạy cảm | code > 80, message > 160, chuỗi ≥ 32 ký tự liền, token/secret/email/timestamp/mã nội bộ     | e2e               | đỏ khi vi phạm                                                      | [plan](plan.md)          |
| Ví dụ đúng runtime           | ví dụ lấy từ `ApiException`; từ chối lỗi không mã / mapper bỏ qua                           | unit              | `errorExampleOf` ném                                                | [plan](plan.md)          |
| Hậu xử lý                    | 429/400/413/415 mới có ví dụ; response tự khai giữ ví dụ, thêm toàn cục một lần, áp hai lần | unit              | như mô tả                                                           | [plan](plan.md)          |
| Presentation                 | `toOpenApi30Presentation` trên `allOf` + `examples`                                         | unit              | không đổi                                                           | [plan](plan.md)          |
| Wire không đổi               | guard/pipe/filter/health dùng hằng; suite e2e/integration hiện có                           | e2e + integration | xanh, body như cũ                                                   | [plan](plan.md)          |
| Diff OpenAPI chỉ là ví dụ    | so ngữ nghĩa với baseline `ea73c2f`                                                         | script            | path/operationId/status/security/schema/description không đổi       | [plan](plan.md)          |

## Definition of Done

- [ ] Test đỏ trước (unit thiếu module/ví dụ; baseline 145/145 success và 1 033/1 033 response lỗi không ví dụ) và xanh sau.
- [ ] `pnpm check`, `pnpm test:e2e`, integration theo plan, `pnpm openapi:export` + diff ngữ nghĩa, `rules:check`/format,
      `git diff --check` xanh trên cây cuối.
- [ ] Spec/plan/inventory/items index/roadmap/tracker khớp implementation; findings ghi rõ chủ.
- [ ] Không tăng legacy ledger kiến trúc.
- [ ] Không commit; giao Owner review.

## Changes and acceptance

- 25/10/2026 — người giao việc chọn chạy Prompt 26 ngay trên `ea73c2f` dù tracker ghi chờ G5/G6 (hệ quả ở _Dependencies_).
- 25/10/2026 — thông điệp runtime của `APPLICATION.DICTIONARY_GROUP_CHANGED` (166 ký tự) vượt trần 160 của ví dụ; người giao
  việc chọn **rút gọn thông điệp** (mã, status, `details` giữ nguyên; FE không rẽ nhánh theo message): "A simultaneous request
  changed the dictionary group of the vendor or the line. Refresh both, then send the request again."
- 25/10/2026 — `provisioningTaskGrant` và các route tác vụ: người giao việc chọn **chặt** — chỉ hiện mã runtime hiện tại trả
  được; mã sau request gate chờ G5 (mục _Behavior_, `-F6`).
- 26/10/2026 (Prompt 02, Owner) — ba quyết định ở _Phase sau merge G5/G6_: một thông điệp cho hai mã ngân sách (đổi runtime ở
  đường đua), bỏ 403 của `budgetProposalList`, hoãn mã chuyển qua của capability/module khác sang Prompt 03.
- Chưa nghiệm thu.

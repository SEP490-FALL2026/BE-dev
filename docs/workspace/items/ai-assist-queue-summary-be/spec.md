# Spec: tóm tắt AI hàng đợi duyệt của chính mình — phía BE (`US-15-05`)

- Phụ trách: AI theo giao việc của người dùng (04/11/2026), thực hiện theo plan `docs/plans/2026-11-04-be-integration.md` của repo
  AI (`AI-dev`).
- Thiết kế ban đầu bởi: AI — bản thiết kế contract BE–AI `AI-dev/docs/spec/ai-be-ai-contract-design.md` (D1–D10) và quyết
  định lúc lập plan (P1–P7); người dùng chưa xác nhận các quyết định này (mục `## Quyết định chờ người dùng và Owner`).
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `9165b29` (`BE-UserStory/src/EP-15.md` — `US-15-05` AC-1→AC-15; BRD 6.4; `QĐ-61f`, `QĐ-78`, `QĐ-93b`;
  `OQ-26`, `OQ-G-05`, `OQ-G-06`, `OQ-G-08` còn mở trong Docs), BE `6e7bb09` (nhánh `Bao_dev_be`) + cây chưa commit.
- Nhóm roadmap: G10 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Module card: [ai-assist](../../../../src/modules/ai-assist/README.md).

## Business outcome

Trưởng phòng hoặc Người duyệt chi đang giữ ít nhất một bước duyệt Access Request (bước nhu cầu, bước duyệt chi) yêu cầu một
bản tóm tắt AI các bước **đang giao cho chính mình**: BE lấy đúng các bước đó, gửi ngữ cảnh đã giới hạn (mã mờ, không ID
thật, không số tiền) tới dịch vụ AI ngoài tiến trình, kiểm từng dòng trả về và chỉ hiện dòng hợp lệ, mỗi dòng dẫn tới đúng
request và bước nguồn. AI tắt, lỗi hay chậm thì hàng đợi duyệt thủ công không đổi. Kiểm bằng integration trên PostgreSQL thật
với dịch vụ AI giả theo contract v1 (`test/integration/ai-assist/`) và một lần smoke với dịch vụ AI thật chạy bộ sinh giả
(`AI_RUNNER=stub`).

## Sizing decision

- Container: G10 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: người giữ bước duyệt xem tóm tắt AI đã kiểm của hàng đợi của chính mình; capability
  `ai-assist/queue-summary` của module mới `ai-assist` (T6), đọc bước qua facade `RequestsAiSourceApi` của `requests`.
- Boundaries: bảng `ai_invocations`, `ai_invocation_contents` (migration `20261104100000_ai_assist_invocations`), không ghi
  bảng của `requests`; HTTP `/ai/access-request-summaries` (3 operation) và `/ai/invocations/{invocationId}/content`; lệnh
  `ops:ai-purge`; một lời gọi HTTP ra dịch vụ AI chạy nền trong tiến trình API; quyền theo bước đang giao người gọi, nội dung
  thô chỉ Super Admin.
- Not larger: `US-15-06` (bản nháp diễn giải báo cáo chi phí cho Finance) khác actor, khác nguồn số liệu (`US-12-14`, chưa có
  trong BE) và khác bảng (`ai_finance_drafts`), nên là hạng mục riêng khi gỡ chặn; dịch vụ AI và prompt ở repo AI; màn hình ở
  FE web.
- Not smaller: tạo lần gọi, kiểm đầu ra, đọc lại nguồn khi xem, đọc nội dung và purge dùng chung một bản ghi lần gọi và một
  đường kiểm chứng (dịch vụ AI giả trên PostgreSQL thật); tách theo route hay theo tầng cho những lát không tự kiểm được AC
  nào.
- Siblings: none — AC-10 là `not affected` (không hạng mục nào giữ), `US-15-06` chưa có hạng mục.
- Scope map: [G10](../../../roadmap.md#work-item-decomposition-g10).

## Primary Story/AC

| Story    | AC                     | Coverage | Phần còn lại thuộc                                                                                                                                                            |
| -------- | ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-15-05 | AC-1→AC-9, AC-11→AC-15 | partial  | AC-10: `not affected` (chỉ web; trên Mobile không có thao tác tóm tắt là hành vi của app, BE không chặn theo kênh; luồng duyệt trên Mobile thuộc `a08-mobile-approver-flows`) |

Vế BE của từng AC (bằng chứng ở `## Test matrix`):

- **AC-2, AC-6:** vế BE — mỗi dòng mang `requestId`, `stepId` thật để mở màn quyết định; khi không có tóm tắt, `GET` trả
  trạng thái và `errorCode`. Bấm dòng để mở màn và thông báo _không có tóm tắt_ là màn hình FE web.
- **AC-4:** bằng chứng theo cấu trúc — thân gửi dịch vụ AI đúng bằng danh sách trường cho phép; BE chưa có nguồn bản ghi sử
  dụng theo ngày để seed (bộ dựng ngữ cảnh không đọc được loại dữ liệu đó).
- **AC-11:** BE chỉ gửi trường cho phép với mã mờ `R00x`/`C00x`, test so thân gửi với dữ liệu fixture giả lập. "Chỉ dữ liệu
  giả lập tới khi chốt `OQ-26`" là điều kiện vận hành: giữ hai công tắc `OFF` ở môi trường có dữ liệu thật.
- **AC-13:** đủ cho vế BE có trong BE hiện tại — facade nguồn chỉ đọc bước nhu cầu và bước duyệt chi; đã kiểm bằng test
  integration: đề xuất gia hạn chờ `C1` quyết định (`SubscriptionRenewal` `PROPOSED`) không vào tóm tắt và vẫn ở hàng đợi gia
  hạn của nó, bước loại khác (`IT_ASSESSMENT`, `FINANCE_REVIEW`) không vào tóm tắt. Chưa kiểm: quyết định chi vượt nhu cầu
  (`US-11-07`) và hồ sơ hợp thức hóa (`US-13-06`) chưa có trong BE nên không seed được; kiểm lại khi hai Story đó có trong BE.
- **AC-14:** kiểm dạng tương đương — `QĐ-93b` không cho Người duyệt chi làm trưởng phòng nên không dựng được "`C1` cũng là
  trưởng phòng `P-EXE`"; test dùng bước nhu cầu của request trưởng phòng tự gửi (`R9`), rồi bước duyệt chi của chính `R9`.
- **AC-15:** dòng chi phí đúng số của hàng đợi duyệt chi (`21000000 VND`); con số "đang chờ duyệt 15tr" của ví dụ không seed
  (sẽ thêm bước thứ tư vào hàng đợi của `C1`, phá "đúng 3 dòng" của AC-8).

## Supporting references

`US-05-04`, `US-06-01` (hàng đợi nguồn và màn quyết định), `US-05-08` (rút), `US-05-12` (giao lại bước), `US-06-14`,
`US-06-13`; `US-16-02`, `US-16-03` (Mobile, không có AI); BRD 6.4; `QĐ-61f`, `QĐ-78b`/`c`/`d`, `QĐ-93b`; `OQ-26`, `OQ-G-05`,
`OQ-G-06`, `OQ-G-08` (câu trả lời của người dùng ở `answer.md` của repo AI, chưa ghi sổ quyết định Docs). Thiết kế contract:
`AI-dev/docs/spec/ai-be-ai-contract-design.md`; contract dây của dịch vụ AI: `AI-dev/src/ai_service/contract.py`; bộ kiểm
tham chiếu: `AI-dev/eval/validators.py`. Rule: [api-contract](../../../rules/api-contract.md),
[operational-commands](../../../rules/operational-commands.md), [module-structure](../../../rules/module-structure.md).

## Explicit out of scope

- `US-15-06` phía BE: route `POST /finance/period-reports/{reportId}/ai-drafts`, bảng `ai_finance_drafts`, tham số
  `AI_FINANCE_NARRATIVE_ENABLED` — chặn bởi `US-12-14` (số liệu báo cáo kỳ), chưa có trong BE (D8). Là hạng mục khác, chưa tạo.
- Dịch vụ AI, prompt, chọn model, đánh giá chất lượng: repo AI. Màn hình tóm tắt: FE web. AI trên Mobile (AC-10).
- Sweeper theo giờ (D3) — thay bằng phát hiện lúc chạm (P2); header `Idempotency-Key` (P1); giới hạn tần suất riêng và mã
  `AI.RATE_LIMITED` (chỉ throttler toàn cục); trạng thái `STALE` có trên wire nhưng không câu trả lời nào mang nó (chỉ lần
  gọi đã purge nhận `STALE`, và lần gọi đó đọc là 404).
- Triển khai VPS, đo tài nguyên, dữ liệu thật, cấu hình tường lửa chặn egress.

## Dependencies and blockers

| Phụ thuộc                                                                          | Trạng thái ở cây hiện tại                                          | Ảnh hưởng                                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Hàng đợi bước nhu cầu (`US-05-04`), bước duyệt chi (`US-06-01`)                    | có (`requests`)                                                    | facade mới `RequestsAiSourceApi` (`requests/public/requests-ai-source.api.ts`)      |
| Dịch vụ AI contract v1 (`AI-dev/src/ai_service`)                                   | có ở repo AI; smoke với `AI_RUNNER=stub` đạt; model thật chưa chọn | không cấu hình `AI_SERVICE_BASE_URL` ⇒ `AI.PROVIDER_UNAVAILABLE`, API vẫn khởi động |
| `OQ-26` (dữ liệu gửi model, nơi chạy)                                              | chưa chốt                                                          | chỉ dữ liệu giả lập; hai công tắc mặc định `OFF`                                    |
| `US-12-14` (số liệu báo cáo kỳ)                                                    | chưa có trong BE                                                   | chặn `US-15-06`, không chặn hạng mục này                                            |
| Đồng ý của Owner: mục registry lồng `aiAccessRequestSummaryGet#lines`, 3 file gate | chưa có                                                            | Owner từ chối ⇒ đổi `lines` sang subresource phân trang hoặc bỏ thay đổi gate       |

## Ownership: module, data, API

- Module mới `ai-assist` (T6, [card](../../../../src/modules/ai-assist/README.md)): capability `ai-service/` (client),
  `invocation/` (repo, codec JSON, audit mapper), `queue-summary/` (tính năng, controller), `invocation-content/` (đọc nội
  dung), `purge/` + `public/ai-purge.api.ts` (đồ thị của lệnh purge). Nest: `AiAssistModule` (lõi, không HTTP),
  `AiAssistHttpModule` (chỉ API mount), `AiAssistPurgeCliModule` (chỉ lệnh). Phụ thuộc: `audit`, `operating-parameters`,
  `organization`, `requests`.
- Bảng: `ai_invocations` (siêu dữ liệu; unique index một phần `ai_invocations_active_per_revision` trên
  `(organization_id, actor_app_user_id, feature, source_revision)` khi `status` là `PENDING`/`RUNNING`/`COMPLETED`),
  `ai_invocation_contents` (context, prompt, response gốc, parsed, kết quả kiểm; khóa ngoại `RESTRICT`). Model:
  `prisma/models/ai-assist.prisma`.
- Operation HTTP mới (base `/api/v1`): `aiAccessRequestSummarySource`, `aiAccessRequestSummaryCreate`,
  `aiAccessRequestSummaryGet`, `aiInvocationContentGet` (`openapi.json` 316 operation). Lệnh: `pnpm ops:ai-purge`
  (`src/cli/ai-purge/`).
- Tham số vận hành mới (nhóm `AI`, kiểu `enum` `ON`/`OFF`, mặc định `OFF`): `AI_ENABLED`, `AI_ACCESS_REQUEST_SUMMARY_ENABLED`.
  Biến môi trường mới (kiểm khi mount `AiAssistModule`): `AI_SERVICE_BASE_URL`, `AI_SERVICE_TOKEN`, `AI_SERVICE_TIMEOUT_MS`
  (`.env.example`).
- Chạm ngoài module: `requests` (facade + phương thức repo đọc bước đang mở; `requests/README.md`), `operating-parameters`
  (hai định nghĩa), `app/app.module.ts`, `cli/commands.ts`, `package.json`, `scripts/arch/tiers.cjs`, manifest/registry test
  (`test/support/*`), ba file gate `extension-wiring`, `module-graph`, `operational-commands` (header của gate nói cần Owner
  đồng ý), tài liệu sinh (`docs/generated/*`), `ARCHITECTURE.md`, `docs/rules/module-structure.md`,
  `docs/rules/operational-commands.md`.
- Contract giữ nguyên: mọi route cũ; regex route `PUT /operating-parameters/{key}` không đổi (khóa mới dùng UPPER_SNAKE).

## Behavior and design

**Luồng.** FE gọi `GET /ai/access-request-summaries/source` lấy `queueRevision` → `POST /ai/access-request-summaries`
`{ queueRevision }` → 202 `{ invocationId, status }` → poll `GET /ai/access-request-summaries/{invocationId}` tới khi hết
`PENDING`/`RUNNING`. Lần gọi chạy nền trong tiến trình API (`QueueSummaryRunService`): gọi dịch vụ AI, kiểm đầu ra, ghi kết
quả.

| Route                                             | Quyền                                  | Thành công                                                                                  | Từ chối (ngoài 401/503 của guard)                                                                                        |
| ------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /ai/access-request-summaries/source`         | `@AuthenticatedOnly()`                 | 200 `{ queueRevision, stepCount (≤ 20), omittedCount }`; không gọi AI, không ghi            | 403 `AI.DISABLED`                                                                                                        |
| `POST /ai/access-request-summaries`               | `@AuthenticatedOnly()`, bước đang giao | 202 `{ invocationId, status }`; cùng revision ⇒ trả lần gọi đang giữ                        | 403 `AI.DISABLED`, 403 `AI.NO_ASSIGNED_STEPS`, 409 `AI.SOURCE_STALE`, 503 `AI.PROVIDER_UNAVAILABLE` (chưa cấu hình), 422 |
| `GET /ai/access-request-summaries/{invocationId}` | chỉ người đã tạo                       | 200 `{ invocationId, status, createdAt, sourceStale, omittedCount, lines[], errorCode }`    | 404 `AI.NOT_FOUND` (không có, của người khác, hoặc nội dung đã purge), 422                                               |
| `GET /ai/invocations/{invocationId}/content`      | `@RequireRoles('SUPER_ADMIN')`         | 200 `{ invocationId, context, promptText, rawResponse, parsed, result }`; audit mỗi lần đọc | 403 `AUTHORIZATION.FORBIDDEN` (kể cả chủ lần gọi), 404 `AI.NOT_FOUND`, 422                                               |

- Thứ tự kiểm của `POST`: công tắc (cả hai `ON`) → dịch vụ AI đã cấu hình → bước đang giao. Người không có bước, khi chưa cấu
  hình dịch vụ AI, nhận `AI.PROVIDER_UNAVAILABLE` thay vì `AI.NO_ASSIGNED_STEPS`; model không bao giờ được gọi.
- `status`: `PENDING`, `RUNNING`, `COMPLETED`, `NO_VALID_OUTPUT`, `STALE` (chỉ lần gọi `COMPLETED` đã purge; đọc là 404),
  `FAILED`. Lỗi của một lần gọi là
  `errorCode` trong thân `GET` 200, không phải HTTP status: `AI.PROVIDER_UNAVAILABLE`, `AI.PROVIDER_TIMEOUT`,
  `AI.OUTPUT_INVALID`, `AI.NO_VALID_OUTPUT`, `AI.SOURCE_UNREADABLE`, `AI.INTERNAL_ERROR`. `POST` khi không đọc được nguồn vẫn 202
  với `status` `FAILED`; `source` với bước dữ liệu hỏng trả 500 (lỗi dữ liệu, không thoáng qua).
- Lần gọi `RUNNING` quá 150 s chuyển `FAILED` (`AI.PROVIDER_TIMEOUT`) khi `GET` hoặc `POST` của chính chủ chạm tới (P2); không
  có sweeper.
- **Ngữ cảnh gửi dịch vụ AI** (contract v1, `POST /v1/summaries/access-request-queue`): tối đa 20 bước theo thứ tự hàng đợi;
  mỗi bước `sourceRef` mờ `R001…`, `stepKind`, tên phần mềm, tên người thụ hưởng, lý do (cắt 1000 ký tự), nhãn thời hạn, và ở
  bước duyệt chi `estimatedCostRef` `C001…`. Không email, số điện thoại, ID thật, SLA/hạn, người được giao, ngân sách, bước
  của người khác. Header `Authorization: Bearer <AI_SERVICE_TOKEN>`, `X-Request-Id` = `invocationId`. Một hạn chung
  `AI_SERVICE_TIMEOUT_MS` (mặc định 90 000, tối đa 120 000) bao cả một lần thử lại sau 2 s cho 429, 500, 503 và lỗi kết nối; không thử lại 400, 401, 409, 413; 504 hoặc hết
  hạn ⇒ `AI.PROVIDER_TIMEOUT`.
- **Kiểm đầu ra** (`queue-summary-output.policy.ts`, cổng TS của `eval/validators.py`): `sourceRef` có trong snapshot, không
  trùng, đúng `stepKind`; không lời khuyên duyệt/từ chối, xếp hạng, SLA, URL; dòng rỗng bị loại (`EMPTY_SUMMARY`); mô hình
  không viết con số — số tiền do BE chèn từ placeholder `{{cost:Cxxx}}` dạng `<giá trị> <mã tiền tệ>`, mọi chữ số khác phải
  xuất hiện nguyên văn ở trường nguồn của đúng dòng (D4). Mọi dòng bị loại ⇒ `NO_VALID_OUTPUT`. Lời khuyên (`ADVICE_LANGUAGE`,
  phiên bản luật `access-request-queue-summary-check-v2`) bắt theo cụm cố định, theo dạng _từ khuyên_ (`nên`, `hãy`, `khuyên`,
  `khuyến nghị`, `kiến nghị`, `đáng`, `should`, `please`…) cách tối đa hai từ trước _từ quyết định_ (`duyệt`, `phê duyệt`,
  `chấp thuận`, `chấp nhận`, `từ chối`, `bác bỏ`, `đồng ý`, `xử lý`, `approve`…), `đề nghị`/`đề xuất` đứng ngay trước từ quyết
  định, từ xếp hạng (`trước tiên`, `quan trọng nhất`, `khẩn`, `xử lý ngay`…), và trên bản bỏ dấu (`nen duyet ngay`) với tập hẹp
  hơn vì bỏ dấu làm trùng từ (`đang`/`đáng`, `hay`/`hãy`, `nền`/`nên`, `khó khăn`/`khẩn`). Từ quyết định đứng một mình
  (`đang chờ phê duyệt`) và mẫu `<người> đề nghị <phần mềm>` vẫn qua; `cần` không tính là từ khuyên (`cần duyệt chi` mô tả
  bước). Đánh đổi: `X đề nghị duyệt chi …` và `nên` nghĩa "nên/vì vậy" sát một từ quyết định bị loại. Cùng luật ở
  `AI-dev/eval/validators.py`; so sánh vi sai TS/Python 0 khác biệt trên 2 × 6 080 ca (kịch bản tạm, đã ghi ở báo cáo fix).
- **Xem lại** (`GET`, P5): luôn đọc lại nguồn; bỏ dòng mà bước không còn mở hoặc không còn giao người gọi; `omittedCount`
  đếm bước còn của người gọi mà tóm tắt bỏ ra; `sourceStale` khi revision hiện tại khác revision đã lưu; bản `COMPLETED`
  không bị sửa; mọi dòng bị bỏ ⇒ `status` trả về `NO_VALID_OUTPUT`.
- **Chống gọi trùng** (P1): unique index một phần; `POST` lặp lại cùng `queueRevision` trả lần gọi đang giữ. `FAILED` và
  `NO_VALID_OUTPUT` không nằm trong index nên gọi lại được (chỉ throttler toàn cục).
- **Audit** (không có nội dung, không khóa giống bí mật): `AI_INVOCATION.REQUESTED`, `AI_INVOCATION.COMPLETED`,
  `AI_INVOCATION.FAILED`, `AI_INVOCATION.CONTENT_READ` (payload chỉ `invocationId`, cùng transaction với lần đọc),
  `AI_INVOCATION.PURGED` (`OPERATOR`; số lượng và mốc cắt). Log chỉ siêu dữ liệu, không prompt/response thô.
- **Purge:** `pnpm ops:ai-purge --through YYYY-MM-DD [--apply --operator <tham chiếu>]` — mặc định chạy khô (đếm); `--apply`
  xóa `ai_invocation_contents` có `created_at` tới hết ngày `--through` theo **UTC**, không bao giờ xóa nội dung của lần gọi
  `PENDING`/`RUNNING`, giữ `ai_invocations`, ghi audit cùng transaction. Exit 0 xong, 2 không có gì để xóa, 1 lỗi hoặc đối
  số sai. Cùng transaction, lần gọi `COMPLETED` bị xóa nội dung chuyển `STALE` (giữ `finished_at` và siêu dữ liệu), nên ra
  khỏi unique index: sau purge, `GET` của lần gọi đó và nội dung đều 404 `AI.NOT_FOUND`, còn `POST` cùng revision tạo lần gọi
  mới (202, id mới, một lời gọi AI). `FAILED`/`NO_VALID_OUTPUT` không giữ chỗ nên giữ nguyên trạng thái. Bản sao lưu DB cũ còn
  nội dung tới hết vòng đời backup của VPS (mục 7 của bản thiết kế) — runbook xóa sớm chưa viết.
- **Collection `GET`:** `GET /ai/access-request-summaries/{invocationId}` là một bản tóm tắt, không phân trang; mảng lồng đặt
  tên `lines` (không phải `items`) và có biên 20 (`QUEUE_MAX_REQUESTS`), đăng ký trong
  `test/support/api-collection-registry-nested.ts` (`aiAccessRequestSummaryGet#lines`, cần Owner đồng ý). Nội dung thô khai
  `context`/`parsed`/`result` là object tự do (như `before`/`after` của Audit Trail), không thêm mảng lồng.
- Migration và tương thích ngược: chỉ thêm hai bảng; không đổi bảng cũ. Kiểm drift: 141 migration, không khác biệt (Task 7).

## Test matrix

Cấp: `U` unit (`src/modules/ai-assist/**`), `H` HTTP contract (`test/http/ai-assist/`), `I` integration PostgreSQL thật với
dịch vụ AI giả `test/support/fake-ai-service.ts` (`qs` = `queue-summary.integration-spec.ts`, `ap` =
`queue-summary-approver.integration-spec.ts`, `fl` = `queue-summary-failures.integration-spec.ts`, `ct` =
`invocation-content-http.integration-spec.ts`, `pg` = `ai-purge-cli.integration-spec.ts`).

| AC / rủi ro        | Tình huống (gồm từ chối, edge case)                                                                                                                                                                            | Cấp  | Kết quả mong đợi                                                                                                                                                                           | Bằng chứng sau implement                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| AC-1, AC-2         | `H1` giữ bước nhu cầu của `R1`–`R3`                                                                                                                                                                            | I    | đúng 3 dòng `NEED_APPROVAL`, có tên phần mềm, người thụ hưởng, lý do; `requestId` mở đúng bước                                                                                             | `qs` (đạt); bấm dòng là FE                                                           |
| AC-3               | `R7` chờ `H2`, `R8` chờ `C1`                                                                                                                                                                                   | I    | không dòng, không tên/ID ngoài hàng đợi trong dòng và trong thân gửi                                                                                                                       | `qs` (đạt)                                                                           |
| AC-4               | thân gửi dịch vụ AI                                                                                                                                                                                            | I    | đúng tập trường cho phép; không email, ngày khác `generatedAt`, khóa SLA/hạn/ngân sách/usage                                                                                               | `qs` (đạt, theo cấu trúc; không seed bản ghi usage)                                  |
| AC-5               | xem tóm tắt rồi không làm gì; `H1` duyệt `R1`; `C1` duyệt `R10`                                                                                                                                                | I    | mọi hàng bước/request không đổi; không trường xếp hạng/thao tác; bản ghi quyết định ghi người duyệt                                                                                        | `qs`, `ap` (đạt)                                                                     |
| AC-6               | công tắc `OFF`/một `ON`; dịch vụ chết, chậm, 503, 429, 504, JSON hỏng, sai contract, `INVALID_JSON`                                                                                                            | I    | 403 `AI.DISABLED`, 0 lời gọi; hoặc `FAILED` đúng `errorCode`, đọc 200, không 500; duyệt tay vẫn chạy                                                                                       | `fl` (đạt); thông báo _không có tóm tắt_ là FE                                       |
| AC-7               | dòng `R009` không tồn tại, sai loại, trùng                                                                                                                                                                     | I    | dòng bị loại, dòng hợp lệ còn, `omittedCount` 1, bước không đổi                                                                                                                            | `qs` (đạt)                                                                           |
| AC-8               | `C1` giữ `R9` (nhu cầu), `R10`, `R11` (chi); `R1`, `R12` không                                                                                                                                                 | I    | đúng 3 dòng đúng loại bước, mỗi dòng mở đúng bước                                                                                                                                          | `ap` (đạt)                                                                           |
| AC-9               | Employee, IT Admin, Finance, Super Admin; IT Admin giữ bước đánh giá, Finance giữ bước rà soát                                                                                                                 | I    | `source` 200 `stepCount` 0; `POST` 403 `AI.NO_ASSIGNED_STEPS`, dịch vụ AI 0 lời gọi, không hàng                                                                                            | `qs`, `ap` (đạt)                                                                     |
| AC-10              | Mobile                                                                                                                                                                                                         | —    | hành vi app; BE không chặn theo kênh                                                                                                                                                       | không có (`not affected`)                                                            |
| AC-11              | thân gửi so với fixture                                                                                                                                                                                        | I    | chỉ trường cho phép, mã mờ, giá trị của dữ liệu giả lập                                                                                                                                    | `qs`, `ap` (đạt, vế BE)                                                              |
| AC-12              | sau khi soạn: `R3` được duyệt, `R2` bị rút, `R1` giao trưởng phòng mới                                                                                                                                         | I    | dòng mất dần, cuối cùng `NO_VALID_OUTPUT`; hàng DB vẫn `COMPLETED`; người kế nhiệm 404                                                                                                     | `qs` (đạt)                                                                           |
| AC-13              | đề xuất gia hạn `PROPOSED` chờ `C1`; bước `IT_ASSESSMENT`, `FINANCE_REVIEW`; chi vượt nhu cầu (`US-11-07`), hợp thức hóa (`US-13-06`) chưa có trong BE                                                         | I    | gia hạn và bước loại khác không vào tóm tắt, gia hạn vẫn ở hàng đợi của nó; người giữ chỉ bước loại khác nhận 403                                                                          | `ap` (đạt cho phần có trong BE; `US-11-07`, `US-13-06` chưa kiểm)                    |
| AC-14              | `C1` giữ bước nhu cầu `R9`, duyệt, Finance rà soát, bước chi `R9` về `C1`                                                                                                                                      | I    | tóm tắt mới ghi `R9` là `SPEND_APPROVAL`; không dòng cho bước chưa giao                                                                                                                    | `ap` (đạt, dạng điều chỉnh theo `QĐ-93b`)                                            |
| AC-15              | dòng chi của `R10`; model viết "21 triệu", "40 triệu", "10000000 VND"                                                                                                                                          | I    | dòng chứa `21000000 VND` đúng số hàng đợi; số do model tự viết ⇒ `INVENTED_NUMBER`, `NO_VALID_OUTPUT`                                                                                      | `ap` (đạt)                                                                           |
| Tiêm lệnh          | model chép câu lệnh trong `reason` với cách viết không có trong danh sách (`nên được phê duyệt`); unit: các mẫu `Hãy phê duyệt`, `Đề nghị phê duyệt`, `đáng được chấp thuận`, `… trước tiên`, `nen duyet ngay` | I, U | dòng bị loại (`ADVICE_LANGUAGE`), bước vẫn chờ; mô tả thường (`đang chờ phê duyệt`, `<người> đề nghị <phần mềm>`) vẫn qua                                                                  | `qs`, `queue-summary-output.policy.spec.ts`, `AI-dev/tests/test_validators.py` (đạt) |
| Chống gọi trùng    | `POST` lặp, hai `POST` đồng thời; revision cũ/bịa                                                                                                                                                              | I    | cùng `invocationId`, 1 lời gọi; 409 `AI.SOURCE_STALE`, không ghi                                                                                                                           | `qs` (đạt)                                                                           |
| Người khác         | trưởng phòng khác, Người duyệt chi, thành viên, Super Admin đọc bản của `H1`                                                                                                                                   | I    | 404 `AI.NOT_FOUND`                                                                                                                                                                         | `qs` (đạt)                                                                           |
| Nội dung thô       | Super Admin đọc; chủ lần gọi đọc; id không có; đã purge; audit lỗi                                                                                                                                             | I, H | 200 + một `AI_INVOCATION.CONTENT_READ` mỗi lần; 403; 404; 404; 500 không nội dung, không event                                                                                             | `ct`, `invocation-content.http-spec.ts` (đạt)                                        |
| Purge              | chạy khô, `--apply`, ranh giới 23:59:59.999Z, lần gọi `PENDING`/`RUNNING`/`FAILED`, audit lỗi; `POST` cùng revision sau purge                                                                                  | I    | exit 0/2/1 đúng; nội dung xóa, `ai_invocations` giữ; `COMPLETED` ⇒ `STALE`, `FAILED` giữ; không xóa lần gọi đang chạy; một event `PURGED`; `POST` lại ⇒ id mới, một lời gọi AI, bản cũ 404 | `pg` (lệnh thật `src/cli.ts` qua ts-node; CI: `dist/cli.js`), `qs` (đạt)             |
| Kẹt `RUNNING`      | lần gọi quá 150 s; kết thúc muộn                                                                                                                                                                               | I    | đọc `FAILED` `AI.PROVIDER_TIMEOUT`; kết thúc muộn không ghi đè                                                                                                                             | `fl` (đạt)                                                                           |
| Log không nội dung | log ứng dụng không chứa prompt/response                                                                                                                                                                        | U    | chỉ siêu dữ liệu                                                                                                                                                                           | chỉ mức unit; integration chưa bắt log                                               |
| TLS (D7)           | production: `AI_SERVICE_BASE_URL` `http://` tới máy khác; `https://`; `http://` loopback; ngoài production                                                                                                     | U    | `http://` tới máy khác ⇒ API không khởi động, thông báo nêu tên biến, không nêu địa chỉ/token; còn lại nhận                                                                                | `ai-service-environment.policy.spec.ts` (đạt)                                        |

Bằng chứng đã chạy (cây chưa commit trên `6e7bb09`, Windows, PostgreSQL Docker `slm-test-db` 127.0.0.1:55432): integration
`ai-assist` 85/85 (7 suite, sau fix pass của final review). Bẻ code có chủ đích rồi khôi phục từng byte — chỉ các lần dưới đây,
không phải mọi test:

- Task 7: đột biến A 11/23 đỏ, đột biến B 14/38 đỏ (lõi tóm tắt, công tắc, người giữ bước, bộ kiểm); fix round: bỏ quét kẹt
  1/18 đỏ, ngưỡng kẹt 1 ms 1/18 đỏ, tắt `catch` unique 1 test đỏ (POST đồng thời).
- Fix pass (mỗi lần chạy cả thư mục integration `ai-assist`, 85 test): bỏ nhánh trả lần gọi đang giữ 0/85 đỏ (nhánh `catch`
  unique cho cùng kết quả) — đã thêm assert ở unit spec, sau đó 1/212 unit đỏ; tắt `catch` unique 1/85; `findLive` bỏ qua
  `COMPLETED` 4/85; bỏ kiểm revision cũ (409) 2/85; bỏ lọc chủ sở hữu (404 người khác) 4/85; bỏ audit `CONTENT_READ` 4/85; purge
  không loại `PENDING`/`RUNNING` 3/85; purge không chuyển `STALE` 3/85.
- Chưa bẻ: ánh xạ mã `FAILED`, audit `REQUESTED`/`COMPLETED`/`FAILED`, event `PURGED`, kiểm công tắc ở `GET`, log không chứa prompt/response.

Chi tiết lệnh ở [plan](plan.md#verification-and-handoff).

## Definition of Done

- [x] Mọi AC claim có test ở cấp phù hợp; AC-4, AC-11, AC-13, AC-14 ghi đúng vế đã làm; AC-10 `not affected`.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối — một lần chạy xanh trọn
      `pnpm test:integration` (330 file) chưa quan sát được do tải máy; `pnpm check` đỏ chỉ vì bản sao `.claude/worktrees/*`.
- [x] Spec/plan/roadmap phản ánh implementation; contract HTTP mới đã vào `openapi.json` (chưa báo FE).
- [x] Không tăng legacy ledger kiến trúc.
- [ ] Runbook xóa sớm nội dung AI trong bản sao lưu và quyết định ở `## Quyết định chờ người dùng và Owner` chưa có.

## Quyết định chờ người dùng và Owner

Không mục nào dưới đây đã được người dùng hay Owner xác nhận. Code hiện chạy theo lựa chọn ghi ở cột "Đang làm".

| #                | Quyết định                                                                                                        | Đang làm                                                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1               | Dịch vụ AI không trạng thái (Python); BE sở hữu mọi migration và mọi thao tác ghi dữ liệu AI                      | như đề xuất                                                                                                                                                                                                                                                                              |
| D2               | Prompt, schema đầu ra, parse ở repo AI; dịch vụ AI trả prompt thực tế và response gốc để BE lưu                   | như đề xuất                                                                                                                                                                                                                                                                              |
| D3               | Gọi bất đồng bộ (202 + poll) trong tiến trình API; phát hiện kẹt lúc đọc; sweeper theo giờ                        | không làm sweeper (P2)                                                                                                                                                                                                                                                                   |
| D4               | Mô hình không viết con số; BE chèn số tiền; chữ số khác phải có nguyên văn ở nguồn của dòng                       | như đề xuất                                                                                                                                                                                                                                                                              |
| D5               | Tối đa 20 dòng mỗi lần; phần dư chỉ báo số lượng                                                                  | như đề xuất (`omittedCount`)                                                                                                                                                                                                                                                             |
| D6               | Chỉ Super Admin đọc nội dung đã lưu, route riêng, không UI, audit mỗi lần đọc                                     | như đề xuất; "người được phân quyền" có thêm vai khác không — chưa trả lời                                                                                                                                                                                                               |
| D7               | Bearer token cấp dịch vụ từ env; cùng máy nghe loopback/nội bộ; tách máy bắt buộc TLS                             | token làm; production chỉ nhận `https://` hoặc `http://` tới chính máy (`localhost`, `127.0.0.0/8`, `::1`), sai thì API không khởi động; `http://` qua mạng Docker nội bộ (tên service) bị chặn tới khi có TLS — cần người dùng xác nhận                                                 |
| D8               | Chỉ `US-15-05` phía BE; `US-15-06` chỉ contract/dịch vụ AI tới khi có `US-12-14`                                  | như đề xuất                                                                                                                                                                                                                                                                              |
| D9               | Prototype đo độ trễ/RAM/CPU trước khi chốt timeout và nơi chạy model                                              | timeout là mặc định chưa đo (90 s, tối đa 120 s; không có timeout kết nối riêng)                                                                                                                                                                                                         |
| D10              | Hợp hai hàng đợi hiện có qua bộ chuyển đổi; `queueRevision` = hash danh sách bước có thứ tự                       | facade `RequestsAiSourceApi` ở `requests/public` (P4), hash dùng `assignedAt` và tổng số bước                                                                                                                                                                                            |
| Vai đọc nội dung | Mục 7 bản thiết kế: schema/vai PostgreSQL chỉ đọc riêng cho phần đọc nội dung AI                                  | **đã bỏ, chưa ai quyết định:** route đọc nội dung dùng vai runtime với quyền CRUD mặc định; chỉ guard `SUPER_ADMIN` và audit trong transaction bảo vệ — cần quyết định giữ hay làm vai riêng                                                                                             |
| Số tiền cũ (M-8) | `queueRevision` băm (bước, loại, `assignedAt`) và tổng số bước, không băm nội dung request                        | **còn mở, chưa kiểm chứng:** nếu số tiền/lý do/cỡ nhóm của request đổi trong khi bước vẫn `PENDING` với cùng `assignedAt`, bản `COMPLETED` đang giữ có thể hiện chi phí cũ với `sourceStale: false`; chưa xác định đường ghi nào (ví dụ `setPricing`) làm được việc đó khi bước đang chờ |
| P1               | Không `Idempotency-Key`; chống trùng bằng unique index một phần                                                   | như đề xuất; **còn mở:** `FAILED`/`NO_VALID_OUTPUT` nằm ngoài unique index nên `POST` lặp khi dịch vụ AI từ chối tạo hàng `ai_invocations` và event `REQUESTED`/`FAILED` liên tục, chỉ throttler toàn cục giới hạn (mỗi người tối đa một lần gọi sống) — cần quyết định giới hạn riêng   |
| P2               | Không sweeper; `RUNNING` quá 150 s ⇒ `FAILED` khi `GET`/`POST` chạm                                               | như đề xuất                                                                                                                                                                                                                                                                              |
| P3               | Công tắc là tham số `enum` `ON`/`OFF` nhóm `AI`, khóa UPPER_SNAKE; không tạo `AI_FINANCE_NARRATIVE_ENABLED`       | như đề xuất; nhãn hai tham số mới tiếng Việt trong khi tham số cũ tiếng Anh                                                                                                                                                                                                              |
| P4               | Facade `RequestsAiSourceApi`; lý do cắt 1000 ký tự; `queueRevision` SHA-256                                       | như đề xuất                                                                                                                                                                                                                                                                              |
| P5               | `GET` đọc lại nguồn, bỏ dòng hết hiệu lực, `sourceStale`, không sửa bản `COMPLETED`                               | như đề xuất                                                                                                                                                                                                                                                                              |
| P6               | Mã lỗi AI và HTTP status                                                                                          | `AI.PROVIDER_TIMEOUT` chỉ là `errorCode` (không 503); thêm `AI.NO_VALID_OUTPUT`, `AI.SOURCE_UNREADABLE`, `AI.INTERNAL_ERROR`                                                                                                                                                             |
| P7               | Số tiền theo bộ định dạng tiền có sẵn, không có thì `<giá trị> <mã tiền tệ>`                                      | `<giá trị> <mã tiền tệ>` (ví dụ `21000000 VND`)                                                                                                                                                                                                                                          |
| Lưu giữ          | Mốc xóa nội dung AI 30 ngày sau nghiệm thu                                                                        | lệnh purge nhận mốc cắt do người vận hành nhập; con số chưa xác nhận                                                                                                                                                                                                                     |
| Ranh giới ngày   | `--through` tính theo UTC hay theo múi giờ của tổ chức (`organization.timeZone`)                                  | UTC — người vận hành UTC+7 có thể xóa quá tới 7 giờ của ngày hôm sau                                                                                                                                                                                                                     |
| Cache            | `Cache-Control: no-store` cho route nội dung thô (repo dùng ở documents, license keys)                            | chưa đặt                                                                                                                                                                                                                                                                                 |
| Registry         | Mục mảng lồng `aiAccessRequestSummaryGet#lines` (bounded, tối đa 20) trong registry chỉ nên co lại                | đã thêm, cần Owner đồng ý; từ chối ⇒ đổi sang subresource phân trang                                                                                                                                                                                                                     |
| Gate             | Sửa 3 file gate `extension-wiring`, `module-graph`, `operational-commands` (header của gate yêu cầu Owner đồng ý) | đã sửa (thêm đồ thị lệnh purge vào các danh sách), cần Owner đồng ý                                                                                                                                                                                                                      |
| `errorCode`      | `errorCode` của `GET` là chuỗi tự do; nên là enum trong OpenAPI để client sinh mã                                 | `z.string().nullable()`                                                                                                                                                                                                                                                                  |
| Nơi chạy model   | VPS chung với BE hay máy tách (`OQ-26`, sau khi đo)                                                               | chưa quyết; contract không phụ thuộc                                                                                                                                                                                                                                                     |
| Egress           | Tường lửa chặn kết nối ra ngoài của dịch vụ AI khi suy luận                                                       | chưa cấu hình, chưa kiểm ở môi trường thật                                                                                                                                                                                                                                               |

## Changes and acceptance

- 04/11/2026: implement theo plan (Task 1–5, 7) trên cây chưa commit của `Bao_dev_be` (`6e7bb09`), rồi lập spec/plan này ghi
  đúng phần đã làm. Không commit, không push, không deploy. Chưa peer review, chưa Owner review, chưa nghiệm thu.
- 04/11/2026 (fix pass sau final review toàn nhánh, vẫn chưa commit): bộ kiểm lời khuyên mở rộng theo dạng câu và bản bỏ dấu
  ở cả TS và Python (`check-v2`); purge chuyển lần gọi `COMPLETED` sang `STALE` để `POST` cùng revision tạo lần gọi mới;
  production chặn `http://` tới máy khác; bẻ có chủ đích thêm cho dedupe, 409, 404 người khác, audit đọc nội dung, purge (số ở
  `## Test matrix`). Chưa Owner review, chưa nghiệm thu.
- Ghi chú còn mở (không chặn test): `omittedCount` có thể đếm thừa bước đã không còn của người gọi; `GET` không kiểm công tắc
  (tắt vẫn xem được bản cũ); hai đường lỗi không lưu prompt/response (`AiServiceAnswerInvalidError`, lỗi DB sau khi AI trả
  lời ⇒ `AI.INTERNAL_ERROR`); hàng JSON sai hình ⇒ 500 khi Super Admin đọc; bộ kiểm đầu ra (cả bản Python) còn bỏ lọt URL
  full-width, tên miền trần (`figma.com`), khoảng trắng braille, omicron Hy Lạp, keycap và thẻ HTML — FE phải hiển thị
  `summary` dạng text; lời tuyên bố đã làm (`FORBIDDEN_CLAIM`) chưa kiểm trên bản bỏ dấu; token ngoài ASCII chưa bị chặn lúc
  khởi động (chỉ chặn khoảng trắng).

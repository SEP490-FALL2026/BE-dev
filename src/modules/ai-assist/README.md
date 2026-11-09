# ai-assist

Mục đích: tóm tắt bằng AI hàng đợi bước duyệt (bước nhu cầu và bước duyệt chi) đang chờ chính người gọi, theo yêu cầu, qua dịch
vụ AI ngoài tiến trình. Mô hình không viết con số: số tiền do BE chèn từ dữ liệu nguồn, mọi chữ số khác phải xuất hiện nguyên văn
ở trường nguồn của đúng dòng đó; dòng không qua kiểm tra bị loại. Dịch vụ AI chậm hoặc chết không đổi hàng đợi thủ công. Story
chính: `US-15-05`, hạng mục
[ai-assist-queue-summary-be](../../../docs/workspace/items/ai-assist-queue-summary-be/spec.md); chế độ giả lập và chọn nguồn trả
lời (`US-15-05` AC-16, AC-17): [ai-provider-mode](../../../docs/workspace/items/ai-provider-mode/spec.md) (`US-15-06` phía BE
chưa làm: chặn bởi `US-12-14`).

Tầng: T6 ([tiers.cjs](../../../scripts/arch/tiers.cjs)). Phụ thuộc: audit, operating-parameters, organization, requests
([module-graph](../../../docs/generated/module-graph.md)). Được dùng bởi: không module nào; chỉ `app/app.module.ts` mount
`AiAssistHttpModule`.

## Public API (`public/`)

- `AiPurgeApi` (`public/ai-purge.api.ts`, kiểu `ai-purge.types.ts`, lỗi `ai-purge.errors.ts`): chỉ lệnh `ops:ai-purge` dùng, qua
  `AiAssistPurgeCliModule` (`purge/`, không với tới được từ API hay worker); không module nào khác gọi ai-assist. `AiAssistModule`
  export `QueueSummaryService` và `InvocationContentQueryService` cho `AiAssistHttpModule` cùng thư mục (ngoài `public/`, R10).

## Bảng sở hữu

- `ai_invocations` (một lần gọi: người, trạng thái, `source_revision`, siêu dữ liệu mô hình; không nội dung) và
  `ai_invocation_contents` (câu gửi, câu trả lời, kết quả đã kiểm; bảng nội dung tách riêng)
  ([prisma/models/ai-assist.prisma](../../../prisma/models/ai-assist.prisma)). Mỗi (tổ chức, người, tính năng,
  `source_revision`, `provider_mode`) có tối đa một lần gọi đang chạy hoặc đang giữ làm kết quả (unique index một phần
  `ai_invocations_active_per_revision`): đổi chế độ rồi hỏi lại cùng revision tạo lần gọi mới. `provider_mode` (`MODEL` |
  `SIMULATED`) ghi lúc tạo, không có default; lần gọi có trước migration `20261109100000_ai_provider_mode` là `MODEL`.

## Extension point

- Mở: không có. Đăng ký vào: không có.

## Cấu hình

- Hai công tắc tham số vận hành `AI_ENABLED`, `AI_ACCESS_REQUEST_SUMMARY_ENABLED` (mặc định `OFF`; cả hai phải `ON`).
- Dịch vụ AI: `AI_SERVICE_BASE_URL`, `AI_SERVICE_TOKEN` (bearer cấp dịch vụ), `AI_SERVICE_TIMEOUT_MS`
  (`ai-service/ai-service-environment.policy.ts`). Không cấu hình: ở chế độ `MODEL` tính năng trả `AI.PROVIDER_UNAVAILABLE`
  (chế độ `SIMULATED` không cần dịch vụ AI); có địa chỉ mà thiếu token: chặn khởi động.
- Nối dịch vụ AI trên Modal (SPEC §9.4 của repo `AI-SERVICE`): `.env` của VPS BE đặt (không commit giá trị thật)

  ```dotenv
  AI_SERVICE_BASE_URL=https://<workspace>--saas-sentry-ai-web.modal.run
  AI_SERVICE_TOKEN=<cùng giá trị Secret saas-sentry-ai>
  AI_SERVICE_TIMEOUT_MS=120000
  ```

  Vì sao `120000`: mặc định 90 000 ms thấp hơn hạn 105 s của dịch vụ và khởi động lạnh GPU ~110 s, nên lần gọi lúc GPU đang tắt
  hết giờ ở BE trong khi GPU vẫn chạy. Sau đó Super Admin bật hai công tắc và chọn `AI_PROVIDER_MODE`.

- Tham số vận hành `AI_PROVIDER_MODE` (nhóm `AI`, enum `SIMULATED` mặc định | `MODEL`; Super Admin đổi qua
  `PUT /operating-parameters/AI_PROVIDER_MODE`, có Audit Trail; chỉ có hiệu lực khi hai công tắc `ON`):
  `QueueSummaryService.create` đọc lúc tạo lần gọi (giá trị lạ ⇒ `SIMULATED` + log WARN, không nêu giá trị), lần gọi giữ chế độ đó
  tới khi xong; `AiServiceClients.forMode` (`ai-service/ai-service-clients.service.ts`) chọn client HTTP (token `AiServiceClient`)
  hay `SimulatedAiServiceClient` (câu mẫu dựng từ dữ liệu nguồn, không gọi mạng, chờ 1,5 s, qua cùng bước kiểm đầu ra). Model lỗi
  không bao giờ chuyển sang giả lập.
- Log vận hành: mỗi lần gọi xong ghi `invocation`, `feature`, `status`, `latencyMs` (khi dịch vụ đã trả lời), `errorCode`; lần
  gọi `FAILED` ghi thêm `httpStatus` và `serviceCode` (mã HTTP và mã hợp đồng mà dịch vụ AI trả, `none` khi không có) để phân biệt
  token sai (401) với model lỗi (500). Không bao giờ log nội dung, thân trả về hay token.

## Hướng phụ thuộc giữa capability (R6)

`ai-service` (L0) ← `invocation` (L1) ← `queue-summary` (L3, có controller); `queue-summary` import cả hai, không có vòng.

## Capability → file chính

- `ai-service/` — client của dịch vụ AI (`ai-service-client.service.ts`, hợp đồng và kiểu ở `ai-service.types.ts`, lỗi
  `ai-service.errors.ts`, cấu hình `ai-service-environment.policy.ts`), client giả lập (`ai-service-simulated-client.service.ts`,
  câu mẫu ở `ai-service-simulated.policy.ts`) và chọn client theo chế độ (`ai-service-clients.service.ts`).
- `invocation/` — bản ghi mỗi lần gọi: `invocation.repo.ts` (SQL của `ai_invocations` và ghi nội dung của một lần gọi),
  `invocation-content.repo.ts` (đọc một nội dung, đếm và xóa nội dung theo mốc cắt), `invocation-content.json.ts` (codec cột JSON),
  `invocation-audit-event.mapper.ts` (`AI_INVOCATION.CONTENT_READ`, `AI_INVOCATION.PURGED`), `invocation.types.ts`.
- `invocation-content/` — đọc nội dung (chỉ Super Admin): `invocation-content-query.service.ts`, `.controller.ts`, `.dto.ts`,
  `invocation-content.errors.ts`, `invocation-content.http-errors.ts`.
- `queue-summary/` — tính năng: `queue-summary.service.ts` (`create`, `get`, `readSource`), `queue-summary-run.service.ts`
  (chạy nền: gọi dịch vụ AI, kiểm đầu ra, ghi kết quả), `queue-summary-context.policy.ts` (ngữ cảnh mờ `R001…`/`C001…`,
  `queueRevisionOf`), `queue-summary-output.policy.ts` (kiểm đầu ra), `queue-summary-view.policy.ts` (đọc lại nguồn khi `GET`),
  `queue-summary-audit-event.mapper.ts`, `queue-summary.errors.ts`; HTTP: `queue-summary.controller.ts`,
  `queue-summary.dto.ts`, `queue-summary.http-errors.ts`.
- Route (`@AuthenticatedOnly()`, phạm vi theo bước được giao): `GET /ai/access-request-summaries/source` (revision và số bước,
  không gọi AI), `POST /ai/access-request-summaries` (202), `GET /ai/access-request-summaries/{invocationId}` (200; `simulated`
  `true` khi lần gọi ở chế độ `SIMULATED`, ở mọi trạng thái — FE luôn hiện nhãn _Giả lập — không phải AI_).
- Route (`@RequireRoles('SUPER_ADMIN')`): `GET /ai/invocations/{invocationId}/content` (`aiInvocationContentGet`) trả
  `providerMode` (`MODEL` | `SIMULATED`), `context`, `promptText`, `rawResponse`, `parsed`, `result` (ba trường JSON là object
  tự do, như `before`/`after` của Audit Trail, nên không thêm mảng lồng vào registry; trường bảng cho phép rỗng là `null`). Mỗi lần đọc ghi `AI_INVOCATION.CONTENT_READ` (payload chỉ
  `invocationId`) cùng transaction; không có nội dung (chưa từng có hoặc đã purge) ⇒ 404 `AI.NOT_FOUND`; chủ lần gọi không phải Super
  Admin ⇒ 403.
- Lệnh `pnpm ops:ai-purge --through YYYY-MM-DD [--apply --operator <tham chiếu>]` (`src/cli/ai-purge/`, `purge/`,
  `public/ai-purge.api.ts`): mặc định chạy khô (đếm); `--apply` xóa `ai_invocation_contents` có `created_at` ≤ hết ngày `--through`
  (UTC), không bao giờ xóa nội dung của lần gọi còn `PENDING`/`RUNNING`, giữ `ai_invocations`, ghi `AI_INVOCATION.PURGED` (`OPERATOR`; số lượng và mốc cắt) cùng transaction. Lần gọi `COMPLETED` bị xóa nội dung chuyển `STALE` trong cùng
  transaction (ra khỏi unique index), nên `POST` cùng revision sau purge tạo lần gọi mới. Exit 0 xong, 2 không có gì để xóa, 1
  lỗi hoặc đối số sai.
- Nest: `ai-assist.module.ts` (lõi, không HTTP), `ai-assist-http.module.ts` (controller, chỉ API mount),
  `purge/ai-assist-purge-cli.module.ts` (đồ thị của lệnh purge, chỉ lệnh).

## Bất biến quan trọng

- Người không có bước nào được giao gọi `POST` ⇒ 403 `AI.NO_ASSIGNED_STEPS`, dịch vụ AI không bị gọi; công tắc tắt ⇒ 403
  `AI.DISABLED` trước khi đọc bước.
- Context chỉ có mã mờ (`R001…`, `C001…`), trường cho phép và tối đa 20 dòng; ID thật, người khác, hạn, SLA, ngân sách không rời BE.
- `GET` luôn đọc lại nguồn: bỏ dòng mà bước không còn mở hoặc không còn giao người gọi, tính `omittedCount`, báo `sourceStale`;
  bản `COMPLETED` không bị sửa. Bản của người khác ⇒ 404 `AI.NOT_FOUND`.
- Lỗi của một lần gọi (`AI.PROVIDER_UNAVAILABLE`, `AI.PROVIDER_TIMEOUT`, `AI.OUTPUT_INVALID`, `AI.NO_VALID_OUTPUT`,
  `AI.SOURCE_UNREADABLE`, `AI.INTERNAL_ERROR`) là `errorCode` trong thân `GET` 200, không phải HTTP status. `POST` khi không đọc
  được nguồn vẫn 202 với `status` `FAILED`. Mã HTTP: `AI.DISABLED`, `AI.NO_ASSIGNED_STEPS` 403, `AI.SOURCE_STALE` 409,
  `AI.NOT_FOUND` 404, `AI.PROVIDER_UNAVAILABLE` 503 (chỉ ở chế độ `MODEL` khi chưa cấu hình dịch vụ AI; `SIMULATED` không cần dịch
  vụ AI).
- Lần gọi `RUNNING` quá 150 s chuyển `FAILED` (`AI.PROVIDER_TIMEOUT`) khi `GET` hoặc `POST` của chính chủ chạm tới.
- Không log prompt hay phản hồi thô; audit chỉ siêu dữ liệu và tham chiếu tới bản ghi nội dung, không khóa giống bí mật. Payload
  `AI_INVOCATION.REQUESTED|COMPLETED|FAILED` có `providerMode` của chính lần gọi (cả `FAILED` do kẹt: lấy chế độ của lần gọi kẹt,
  không phải của request chạm tới nó).
- Production: `AI_SERVICE_BASE_URL` phải là `https://` hoặc `http://` tới chính máy (`localhost`, `127.0.0.0/8`, `::1`), sai
  thì module không mount được (thông báo nêu tên biến, không nêu giá trị).
- Bộ kiểm đầu ra giữ cùng luật với `AI-SERVICE/eval/validators.py` (phiên bản `OUTPUT_CHECK_VERSION`); sửa một bên thì sửa cả bên kia.
- Nội dung thô (`ai_invocation_contents`) chỉ Super Admin đọc, mỗi lần đọc có audit; chỉ `ops:ai-purge` xóa nó (khóa ngoại `RESTRICT`: nội
  dung bị xóa trước, `ai_invocations` được giữ).

## Test

- Unit: `src/modules/ai-assist/**/*.spec.ts`; HTTP: `test/http/ai-assist/`; integration: `test/integration/ai-assist/`.

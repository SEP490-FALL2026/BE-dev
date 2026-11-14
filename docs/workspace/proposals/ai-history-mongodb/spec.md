# Spec đề xuất: lịch sử tương tác AI với MongoDB

- Ngày: 13/11/2026. Trạng thái: `draft`, chưa implement, chưa nghiệm thu.
- Đầu vào: Owner yêu cầu thiết kế một chức năng dùng MongoDB cùng PostgreSQL để đáp ứng môn WDP; tiếp nối đề xuất quản lý lịch sử AI. Lựa chọn kỹ thuật bên dưới do người soạn đề xuất, chưa phải quyết định Owner đã duyệt.
- Skills: `superpowers:brainstorming` để so sánh phương án; `engineering:architecture` để xác định ownership và consistency; `code-review-and-quality` để đối chiếu source; `superpowers:verification-before-completion` để tách kiểm chứng hiện trạng khỏi tiêu chí tương lai.
- Baseline: BE `4c75964fa83c46a5739d99fabe0c4957c5f89b5e`; Docs `5ef039cb01946e92e7da704f8836b11e3fc3edf1`; AI HEAD `1f1c83b` cộng source chưa commit được review ngày 13/11. Không suy ra mã Python mới đã có trong commit.
- Phạm vi tài liệu: đề xuất thiết kế trước khi tạo work item. Không cấp mã US mới, không claim thêm AC trên roadmap, không thay spec đang sở hữu `US-15-05`.
- Review source AI và bằng chứng ở repo AI: `AI-services/reviews/2026-11-13/README.md`. Không dùng link filesystem sang sibling vì checkout BE độc lập không bắt buộc có repo AI bên cạnh.

## 1. Mục tiêu và giới hạn

Super Admin tra cứu các lần gọi AI, mở dữ liệu đầu vào đã giới hạn, prompt, phản hồi gốc và kết quả kiểm tra để giải thích một kết quả AI. MongoDB là kho nội dung lịch sử thật sự: ứng dụng tạo/cập nhật document, đọc nội dung và xóa có kiểm soát. PostgreSQL tiếp tục giữ nghiệp vụ chính và kết quả phục vụ hàng chờ.

Điều kiện đạt cho WDP là một demo xuyên suốt: tạo lần gọi từ BE → có document MongoDB → Super Admin đọc qua API được phân quyền → có audit → purge xóa nội dung, không làm mất nghiệp vụ. Chức năng chạy được với dịch vụ AI stub trong môi trường kiểm thử; đây không phải bằng chứng model thật hoạt động. Không giả định rubric bắt buộc mọi dữ liệu hay đủ CRUD trực tiếp trên FE.

Ngoài phạm vi: chuyển database toàn BE, tài khoản/role trong MongoDB, lưu file nhị phân, sửa model/prompt, train/fine-tune, vector database/RAG, mở chat tự do, AI tự quyết định chi, triển khai Finance narrative chưa có. Không thêm Redis. Không tự sửa source hay deploy theo tài liệu này.

## 2. Hiện trạng phải giữ

Đọc cùng [kiến trúc](../../../../ARCHITECTURE.md), [database rules](../../../rules/database-business.md), [module structure](../../../rules/module-structure.md) và [module AI](../../../../src/modules/ai-assist/README.md).

- `ai-assist` là T6. Đọc Request qua `RequestsAiSourceApi`, không truy vấn bảng Request trực tiếp.
- `AiInvocationRepo.insert()` tạo metadata và context cùng transaction với audit yêu cầu.
- `QueueSummaryRunService.finish()` ghi trạng thái, nội dung và audit kết thúc trong một transaction PostgreSQL.
- `AiInvocationRepo.findOwned()` và `QueueSummaryService.get()` đang cần `result` để trả hàng chờ; GET còn kiểm tra bước nào vẫn thuộc người gọi. Không chuyển phần này sang dependency MongoDB.
- Nội dung thô chỉ `SUPER_ADMIN` đọc; đọc thành công phải có `AI_INVOCATION.CONTENT_READ` trước khi gửi nội dung.
- `ops:ai-purge` hiện xóa nội dung và chuyển bản `COMPLETED` sang `STALE`, cùng audit, trong PostgreSQL. Không thể giữ lời hứa một transaction ấy nếu xóa thêm MongoDB.
- Python chỉ có contract v1, prompt, schema, parse, stub; `ModalRunner` chưa hiện thực. Chưa có `AI_PROVIDER_MODE` trong source BE đang review; spec chọn chế độ giả lập là dependency riêng.

`QĐ-79a`, `QĐ-79c`, `QĐ-102h` hiện không cho kho AI riêng/MongoDB. Owner đã yêu cầu soạn phương án mới; việc này đủ để thiết kế, chưa có nghĩa baseline tài liệu đã được sửa hoặc thiết kế này được chấp thuận triển khai. Trước code phải ghi quyết định thay thế phần lưu trữ, giữ nguyên nguyên tắc dịch vụ inference không sở hữu dữ liệu nghiệp vụ. Không thay lịch sử quyết định cũ tại chỗ mà không có truy vết.

## 3. Các phương án và lựa chọn đề xuất

| Phương án                                                                       | Hệ quả                                                                                               | Đánh giá                                       |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Chuyển cả context, raw, result phục vụ FE sang MongoDB                          | Mỗi GET summary có thể phụ thuộc MongoDB; phải thiết kế lại admission, completion, purge             | Phạm vi rộng và tăng ảnh hưởng khi MongoDB lỗi |
| Giữ metadata/runtime result ở PostgreSQL; nội dung lịch sử ở MongoDB qua outbox | Cần đồng bộ có retry, nhưng hàng chờ chính không phụ thuộc MongoDB                                   | **Chọn cho bản draft**                         |
| Python AI service tự lưu MongoDB                                                | Lịch sử rải hai service, phải thêm quản lý người dùng/phạm vi/purge; stub của BE không đi qua Python | Không chọn                                     |

Điều chỉnh so với đề xuất ban đầu trong chat: không chuyển nguyên xi `AiInvocationContent`. Tách `result` đang được FE sử dụng khỏi phần lịch sử thô trước, vì source hiện hành đã dùng nó làm dữ liệu runtime.

## 4. Ownership và nơi implement

```text
FE ──HTTPS──> NestJS BE
                ├─ ai-assist: quyền, công tắc, context, kiểm kết quả
                ├─ PostgreSQL: metadata + runtime result + outbox + audit
                ├─ worker: chuyển nội dung outbox, không chạy model
                └─ MongoDB: document lịch sử bảo vệ

BE ──contract v1 + service token──> Python AI service ──> model runner
                                   không kết nối DB
```

**Implement chính trong repo BE**, không trong `Code/AI Module/src/ai_service`. FE chỉ gọi BE; không truy cập MongoDB hay Python trực tiếp. AI repo giữ prompt, contract, inference, evaluation; hợp đồng v1 không cần đổi vì thêm MongoDB.

| Thành phần                                   | Sở hữu                                                    | Quy tắc                                                                     |
| -------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/infrastructure/mongodb/`                | MongoClient lifecycle, cấu hình, timeout, health kỹ thuật | Không import module nghiệp vụ; không chứa tên collection hay schema lịch sử |
| `ai-assist/invocation/`                      | Metadata, kết quả runtime, trạng thái nội dung            | Repo PostgreSQL của chính module                                            |
| `ai-assist/invocation-history/`              | Schema document, repo MongoDB, đọc danh sách/metadata     | Capability mới, không export repository ra ngoài module                     |
| `ai-assist/history-delivery/`                | Outbox repo và giao nội dung/retry                        | Dịch vụ một use case; không import controller/capability cấp cao            |
| `ai-assist/invocation-content/`              | API nội dung được bảo vệ                                  | Orchestration quyền, scope, audit và trả dữ liệu                            |
| `ai-assist/purge/`, `public/ai-purge.api.ts` | Purge CLI và giao thức xóa                                | Giữ cửa công khai hiện có, thay atomicity được mô tả rõ                     |
| `src/worker/`                                | Poll loop và shutdown                                     | Chỉ gọi facade trong `public/` hoặc import `*.module.ts`                    |

Hướng capability dự kiến: `invocation`/`ai-service` là tầng thấp; `history-delivery` phụ thuộc `invocation` và repo lịch sử; `queue-summary` gọi dịch vụ ghi intent, không chiều ngược; `invocation-content` điều phối đọc. Schema/type dùng chung nội bộ đặt ở capability thấp nhất cần nó. Ghi graph cuối vào module card và kiểm không vòng R6; không tạo barrel hay `shared/` để lách cạnh.

Dùng module graph riêng cho worker (`ai-assist-history-worker.module.ts`) để không mount HTTP controller, AI provider client hay toàn bộ RequestsModule chỉ để giao outbox. Facade worker dự kiến `public/ai-history-delivery.api.ts`. API graph chỉ mount adapter đọc và ghi intent; CLI graph mount đúng adapter purge. R1 extension wiring vẫn phải đạt, R10 không export service nội bộ cho module khác.

MongoDB dùng **official Node.js driver**, giữ Zod làm schema ứng dụng; không thêm ODM thứ hai và không đổi Prisma PostgreSQL. Pin phiên bản driver/server tương thích Node trong `package.json` lúc triển khai; cập nhật lockfile bằng package manager. Không chọn số phiên bản chỉ từ ví dụ trên web.

## 5. Mô hình dữ liệu

### 5.1 PostgreSQL: nguồn trạng thái có thẩm quyền

`ai_invocations` giữ ID, tổ chức, actor, feature, revision, trạng thái nghiệp vụ, model/prompt metadata, timestamps. Thêm trạng thái nội dung riêng, không trộn với `PENDING/RUNNING/COMPLETED`:

| Trường dự kiến           | Ý nghĩa                                                  |
| ------------------------ | -------------------------------------------------------- |
| `history_state`          | `PENDING`, `AVAILABLE`, `ERROR`, `PURGING`, `PURGED`     |
| `history_version`        | Phiên bản snapshot mới nhất đã ghi intent; tăng đơn điệu |
| `history_stored_version` | Phiên bản worker đã xác nhận; mặc định 0                 |
| `history_generation`     | Thế hệ xóa, tăng khi bắt đầu purge                       |
| `history_error_code`     | Mã allow-list, không lưu exception message               |
| `history_purged_at`      | Mốc xóa logic, null nếu chưa purge                       |

Metadata `provider_mode` chỉ dùng khi work item chọn provider đã thực sự thêm nó. Không tự suy ra mode từ tên model; nếu làm hai việc cùng đợt, migration/provider work item phải đi trước.

Tách `ai_invocation_results` (tên dự kiến): `invocation_id`, `result` theo codec hiện có, `created_at`. Kết quả này chứa mapping `stepId/requestId`, dòng đã kiểm và lý do loại để phục vụ GET của chủ lần gọi. Không chuyển raw prompt/response vào bảng này. Xóa result khi purge như hành vi hiện tại, chuyển `COMPLETED` sang `STALE` và giải phóng dedupe key.

Outbox riêng `ai_history_deliveries`: `id`, `organization_id`, `invocation_id`, `generation`, `version`, `operation` (`SNAPSHOT`/`PURGE`), `payload`, `payload_hash`, `attempts`, `available_at`, `lease_token`, `lease_until`, `delivered_at`, `last_error_code`. Unique `(invocation_id, generation, version, operation)`. Index phục vụ job đến hạn. CHECK ràng buộc counter, thời điểm và `PURGE` không có raw payload.

`payload` là dữ liệu được bảo vệ tương đương bảng nội dung cũ: codec Zod, không log, không HTTP, có trong phạm vi backup/retention. Đây là bản đệm bền vững, **không** phải bản raw thứ hai lưu lâu dài: sau ACK xóa payload, chỉ giữ metadata giao nhận. Không TTL/xóa payload chưa giao vì lỗi. Tăng backlog phải cảnh báo và chặn thêm lần gọi AI khi vượt ngưỡng, không âm thầm mất lịch sử.

### 5.2 MongoDB: `ai_invocation_histories`

Một document cho một invocation; không nhét mọi lần gọi của một người vào mảng tăng vô hạn. UUID dùng string nhất quán với BE, không cần đổi sang ObjectId.

```json
{
  "_id": "0b7c4a7e-5d0e-4c8e-9c0a-3f1d2a9b8c11",
  "schemaVersion": 1,
  "organizationId": "11111111-1111-4111-8111-111111111111",
  "generation": 0,
  "version": 2,
  "payloadHash": "<sha256-cua-payload-canonical>",
  "purged": false,
  "context": { "generatedAt": "2026-11-13T00:00:00Z", "requests": [] },
  "promptText": "<prompt-thuc-te-neu-da-goi>",
  "rawResponse": "<response-nguyen-van-neu-co>",
  "parsed": { "items": [] },
  "validation": { "rejections": [] },
  "createdAt": "<BSON Date khi ghi that>",
  "updatedAt": "<BSON Date khi ghi that>"
}
```

Ví dụ minh họa shape, không phải fixture thành công của hàng chờ rỗng. Các trường chưa có giá trị là null, không bịa prompt/response khi lỗi trước inference. `result` trả cho admin được ghép từ PostgreSQL, không cần lưu lại toàn bộ runtime result ở MongoDB. Document không chứa password, service token, authorization header; context chỉ là allow-list gửi model, không lấy toàn hồ sơ nhân viên.

Zod schema là nguồn shape tại BE; MongoDB collection validator chặn sai kiểu/trường cốt lõi ở DB. Repo decode kết quả bằng schema, không ép kiểu `as unknown as`. Lược đồ BSON và wire JSON khác nhau ở Date; mapper chuyển rõ ràng. Giới hạn snapshot 2 MiB BSON, gồm cả context/prompt/raw/parsed; đây là ngưỡng thiết kế đề xuất thấp hơn trần BSON 16 MiB. Client AI phải đọc response theo stream có giới hạn 1 MiB UTF-8. Sau decode, orchestration phải đo BSON của snapshot đầy đủ **trước transaction kết thúc**, không giả định response dưới 1 MiB tự bảo đảm snapshot dưới 2 MiB.

Vượt một trong hai ngưỡng: kết thúc invocation `FAILED`, mã `AI.OUTPUT_INVALID`, `history_error_code=CONTENT_TOO_LARGE`; không ghi runtime result dùng được. Enqueue một snapshot lỗi nhỏ, gồm context đã giới hạn và `captureStatus=TOO_LARGE`, các trường prompt/raw/parsed null; audit có mã và số byte, không nội dung. Bổ sung `captureStatus` vào schema document (`COMPLETE`/`TOO_LARGE`, null cho snapshot chưa có response), không thêm trường đó vào response content v1; lỗi capture đọc được từ metadata detail. Không rollback toàn completion rồi để invocation RUNNING chỉ vì payload không vừa. Không cắt raw để giả là nguyên văn. Capture toàn bộ chỉ áp dụng cho phản hồi trong giới hạn; admin phải thấy rõ ngoại lệ chưa giữ được raw. Backfill dữ liệu cũ quá ngưỡng phải báo blocker và giữ nguyên raw legacy, không áp chính sách bỏ raw mới để xóa dữ liệu lịch sử.

Index `_id` unique có sẵn; `(organizationId, _id)` để query scope nếu explain cho thấy cần; không tự thêm nhiều index không có truy vấn. Danh sách/filter metadata dùng PostgreSQL, do đó không index raw text/prompt. Chưa làm full-text search nội dung nhạy cảm.

### 5.3 Xóa không được tái tạo nội dung

Sau purge giữ tombstone tối thiểu cùng `_id`, `organizationId`, `generation`, `version`, `purged: true`, `purgedAt`; bỏ tất cả context/prompt/raw/parsed/validation và hash nội dung. Tombstone tồn tại ít nhất cùng vòng đời metadata PostgreSQL, không TTL tự xóa nó. Đây là marker kỹ thuật không chứa nội dung AI, chặn delivery cũ hồi sinh dữ liệu.

## 6. Giao thức ghi và khôi phục lỗi

### 6.1 Admission và kết thúc

1. Transaction admission PostgreSQL ghi invocation + audit + snapshot v1 (context, các trường còn lại null), `history_state=PENDING`. Commit xong mới gọi AI như hiện tại. Không chờ MongoDB để trả 202.
2. Runner gọi service ngoài transaction; kiểm output bằng policy BE hiện có.
3. Transaction kết thúc kiểm `status=RUNNING`; ghi kết quả runtime + trạng thái nghiệp vụ + audit + snapshot v2 đầy đủ lấy từ context của job và response. Không queue v2 nếu cập nhật trạng thái thất bại vì đã timeout/superseded. `history_state` về `PENDING` cho phiên bản mới.
4. Lỗi provider vẫn ghi snapshot cuối có context và trường response null. Lỗi nguồn trước khi có context giữ cách ghi thất bại hiện có, không tạo dữ liệu giả.
5. Trường hợp process chết sau admission: v1 vẫn được giao; trạng thái invocation dùng expiry hiện hành. Không tuyên bố đã lưu response chưa nhận hoặc response đang ở RAM khi process chết trước transaction kết thúc.

### 6.2 Worker giao ít nhất một lần

- Claim tối đa 20 intent/lượt bằng transaction PostgreSQL ngắn, `FOR UPDATE SKIP LOCKED`; tăng `attempts`, đặt lease 60 s và token ngẫu nhiên. Commit rồi mới gọi MongoDB. Không giữ khóa PostgreSQL khi chờ network.
- Tối đa 2 Mongo write đồng thời ngoài transaction; ACK PostgreSQL từng intent bằng `lease_token`. Tất cả query cùng một `DbTx` vẫn await tuần tự theo rule BE.
- Snapshot dùng document write có điều kiện version/generation. Chỉ ghi phiên bản cao hơn; snapshot là toàn bộ trạng thái, không patch từng trường phụ thuộc thứ tự v1/v2. Cùng version + cùng hash → idempotent; cùng version khác hash → lỗi vĩnh viễn `CONTENT_CONFLICT`, không ghi đè. Version thấp hơn → obsolete, không hạ phiên bản. Tính hash SHA-256 trên UTF-8 JSON canonical của payload: key object sắp thứ tự từ điển đệ quy, array giữ thứ tự, Date chuẩn hóa UTC ISO, không nhận undefined/NaN/Infinity. Bỏ các timestamp giao nhận khỏi hash; dùng cùng hàm trong producer, worker và backfill.
- Nếu upsert có predicate version không khớp mà `_id` đã tồn tại, xử lý duplicate-key bằng đọc/check generation/version/hash, không coi mọi duplicate là lỗi hoặc thành công mù. Khác organization cùng ID → từ chối `SCOPE_CONFLICT`.
- ACK chỉ cập nhật `history_stored_version` và `history_state=AVAILABLE` khi generation còn đúng, stored version đã bằng desired version và không `PURGING/PURGED`. Intent obsolete được đóng, không đánh dấu bản mới đã có nội dung.
- Crash sau Mongo write trước ACK → retry cùng snapshot, không trùng document. Crash sau claim trước write → lease hết hạn được claim lại.
- Retry network/backpressure theo lịch 1 s, 5 s, 30 s, 60 s rồi tối đa 300 s, có jitter; không giới hạn số retry cho lỗi tạm. Lỗi schema/conflict đặt `ERROR`, giữ payload và yêu cầu operator sửa/replay. Không log payload hoặc Mongo URI.
- Mặc định cảnh báo khi intent cũ nhất > 5 phút hoặc có lỗi vĩnh viễn. Ngưỡng admission đề xuất 20.000 pending intent hoặc tổng payload pending > 512 MiB: từ chối **lần gọi AI mới** bằng 503 `AI.HISTORY_BACKLOG_FULL`; không chặn đọc/duyệt Request. Cần capacity test trước chốt production.

Số liệu backlog là phép kiểm vận hành để giới hạn tăng trưởng; nếu cần giới hạn cứng giữa nhiều API process, dùng counter/khóa admission PostgreSQL hoặc limiter có transaction. Không giả định hai COUNT độc lập là hard quota. Trước implement chốt cơ chế bounded counter trong work item storage.

### 6.3 Lỗi và trải nghiệm

| Tình huống                            | Hành vi                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| MongoDB tắt                           | Hàng chờ và GET summary từ PostgreSQL vẫn chạy; outbox chờ/retry                       |
| Worker tắt                            | Như trên; admin thấy lịch sử đang chờ đồng bộ                                          |
| AI thất bại                           | Invocation thất bại đúng lỗi provider; không sinh kết quả giả, lịch sử vẫn lưu context |
| Audit không ghi được                  | Không trả nội dung nhạy cảm; lỗi hệ thống theo pipeline hiện có                        |
| Outbox PostgreSQL không ghi được      | Transaction nghiệp vụ AI rollback; không báo đã lưu rồi bỏ mất intent                  |
| Raw vượt giới hạn                     | Không ghi bớt rồi gọi là nguyên văn; có mã lỗi và metadata giải thích                  |
| MongoDB có bản cũ hơn desired version | Nội dung trả 409 `AI.HISTORY_PENDING`, không trả bản cũ như thể là cuối cùng           |

`AVAILABLE` là trạng thái đồng bộ, không bảo đảm MongoDB hiện đang reachable. Không dùng việc MongoDB lỗi để đổi `COMPLETED` thành lỗi nghiệp vụ.

## 7. API cho FE và quyền

Prefix `/api/v1`. Route mới dưới `ai-assist`, decorator `@RequireRoles('SUPER_ADMIN')`. Envelope, Zod DTO, response gate, mã lỗi, paging theo [API contract](../../../rules/api-contract.md). Token API của AI service không dùng làm token người dùng.

### 7.1 Danh sách `GET /ai/invocations` — mới

Query: `page` mặc định 1; `pageSize` mặc định 20, tối đa 100; `createdFrom`, `createdTo` UTC ISO, khoảng `[from,to)`, tối đa 92 ngày; mặc định 30 ngày gần nhất nếu thiếu cả hai; truyền một đầu thì 422. Tùy chọn `status`, `feature`, `actorEmployeeId` UUID. `providerMode` chỉ thêm khi dependency provider đã triển khai, không tạo filter giả ngay bây giờ.

Đọc summary projection PostgreSQL, không tải raw MongoDB từng dòng. `created_at DESC, id DESC` để ổn định khi trùng timestamp. Count/page trong snapshot phù hợp (`RepeatableRead`), hai câu query tuần tự. Không N+1 đọc người dùng; bản đầu trả actor ID, hiển thị tên chỉ khi thêm batch lookup qua `OrganizationReadApi`, không join bảng module khác trong repo AI.

`data`: `items`, `pagination` theo DTO chung. Item: `invocationId`, `feature`, `status`, `actorEmployeeId`, `actorAppUserId`, `modelId`, `modelRevision`, `promptVersion`, `latencyMs`, `promptTokens`, `completionTokens`, `errorCode`, `historyState`, `createdAt`, `finishedAt`. Không `hasContent` suy ra từ existence trong MongoDB; dùng state rõ ràng và GET kiểm lại. Bản đầu không thêm free-text search prompt/response.

### 7.2 Metadata `GET /ai/invocations/{invocationId}` — mới

Trả metadata chi tiết một lần gọi và trạng thái đồng bộ, desired/stored version; không raw. Dùng PostgreSQL, cùng scope, ID không thuộc installation → 404 `AI.NOT_FOUND`. Detail tồn tại ngay cả khi raw đã purge. Collection/detail tuân theo `API-LIST-DETAIL.1`; DTO mới không được trả toàn model Prisma.

### 7.3 Nội dung `GET /ai/invocations/{invocationId}/content` — giữ route

Giữ thành công shape hiện có: `invocationId`, `context`, `promptText`, `rawResponse`, `parsed`, `result`. Raw từ MongoDB; `result` từ PostgreSQL. Query phải gồm `_id` và `organizationId` lấy từ installation/principal đáng tin, không lấy từ query người dùng.

Luồng đọc:

1. Đọc metadata scoped PostgreSQL; `PURGING/PURGED` → 404 `AI.NOT_FOUND`; chưa tồn tại → 404; phiên bản chưa sẵn → 409 `AI.HISTORY_PENDING`; `ERROR` → 503 `AI.HISTORY_UNAVAILABLE`.
2. Đọc MongoDB ngoài transaction PostgreSQL, decode schema và kiểm generation/version/hash với metadata. Mongo timeout → 503 `AI.HISTORY_UNAVAILABLE`, không trả fallback raw từ outbox.
3. Transaction PostgreSQL ngắn lấy khóa chia sẻ row invocation, kiểm lại quyền/scope/generation/state/version và đọc runtime result; ghi `AI_INVOCATION.CONTENT_READ`. Nếu purge hoặc finish đã thay đổi metadata thì bỏ nội dung vừa đọc, trả pending/not-found phù hợp; nếu audit lỗi thì không trả body.
4. Chỉ sau commit audit mới gửi response. Purge sau commit có thể trùng response đã bắt đầu gửi; điểm quyết định quyền đọc là transaction audit. Không hứa thu hồi byte đã gửi.

Mỗi lần đọc thành công có audit mới. 404 do purge không được FE diễn giải chắc chắn là chưa từng có; dùng metadata detail để phân biệt. Chưa đồng bộ hiển thị “Đang lưu lịch sử, thử lại sau”; lỗi kho “Tạm chưa mở được lịch sử”; không khẳng định mất dữ liệu chỉ từ network failure.

### 7.4 Những API khác

- Các route `/ai/access-request-summaries/*` giữ nguyên request/response và source recheck; không bắt Manager nhập MongoDB ID.
- Công tắc vẫn ở operating parameters. Không thêm cấu hình MongoURI/API key lên FE.
- Thống kê AI và `/ai/service-status` trong `SPEC_AI_ADMIN.md` là đề xuất riêng, chưa được source hiện hành implement; không đưa cả hai vào outcome storage để phình phạm vi.
- Không thêm HTTP xóa raw ở bản đầu. Xóa tiếp tục qua CLI có operator reference. Dữ liệu AI không được sửa nội dung gốc từ FE.

## 8. Purge và chống hồi sinh

Không tuyên bố xóa MongoDB + audit PostgreSQL là một transaction. Chuyển thành quy trình có trạng thái bền vững, giữ CLI mặc định dry-run và mốc `through` theo UTC.

1. Dry-run đếm invocation cuối cùng đủ tuổi, chưa purge, trong cả legacy và Mongo history, không gồm `PENDING/RUNNING`. Thống kê rõ đã đồng bộ/chờ/legacy; không in nội dung.
2. Apply PostgreSQL transaction khóa invocation theo thứ tự ID, kiểm không live, tăng generation, đặt `PURGING`, chuyển `COMPLETED` thành `STALE`, xóa runtime result, **xóa raw legacy `ai_invocation_contents` nếu còn**, xóa payload snapshot cũ của invocation, ghi audit `AI_INVOCATION.PURGE_REQUESTED`, enqueue intent `PURGE`. Pending snapshot cũ bị vô hiệu hóa bằng generation; không xóa metadata audit. Trong giai đoạn mixed storage, luôn tombstone ở MongoDB kể cả nguồn đọc vẫn LEGACY_PG: một backfill đã write nhưng chưa ACK cũng không được hồi sinh. Chỉ tính hoàn tất khi cả raw PG đã xóa trong transaction này và tombstone đã được ACK.
3. Worker ghi tombstone MongoDB bằng phép ghi atomic một document. Nếu document chưa có cũng tạo tombstone; tombstone generation mới thắng mọi snapshot cũ. Snapshot ghi sau purge không được thay tombstone, kể cả process giữ lease cũ.
4. Transaction ACK PostgreSQL kiểm generation, đặt `PURGED`, ghi `AI_INVOCATION.PURGED` chỉ khi Mongo tombstone đã xác nhận; audit kết quả chứa actual count và operation ID. ACK thất bại được retry idempotent, unique audit/delivery key chống đếm hoặc ghi event hoàn tất hai lần.
5. CLI chỉ trả exit 0 “xóa xong” khi toàn bộ operation đã ACK; exit 2 chỉ khi không có gì để xóa; exit 1 khi lỗi hoặc quá hạn chờ, in operation ID và số còn chờ, không báo thành công. Lệnh chạy lại nhận diện operation còn dở và tiếp tục, không tạo generation purge mới vô hạn. Bổ sung lựa chọn `--operation-id` cho resume/status nếu cần; shape cuối phải chốt trong CLI item.

MongoDB tắt: từ bước 2 raw đã bị chặn đọc logic, physical delete vẫn pending và được báo đúng. Backup có thể còn nội dung; runbook ghi retention/restore và reapply tombstone để không hồi sinh sau restore. Không hứa backup bị xóa ngay cùng lần purge.

V1 không thêm TTL tự động: hiện yêu cầu giữ đến hết nghiệm thu rồi xóa có kiểm soát. TTL không thay được audit hoặc giao thức purge.

## 9. Chuyển đổi dữ liệu và tương thích

Không sửa migration đã apply. Các bước là checkpoint riêng, không làm một lần drop bảng:

1. **Expand**: thêm result table, trạng thái history, outbox, index. Backfill result từ bảng cũ; khi feature flag kho mới tắt, API vẫn dùng đường cũ. Không tự thêm `provider_mode` chưa có requirement item.
2. **Backfill**: mỗi invocation cũ có raw tạo snapshot đầy đủ và hash; live invocation không backfill đến khi kết thúc. Command batched, resumable; không ghi đè document đã có version cao hơn. Có reconciliation theo ID/hash, không chỉ so số lượng tổng.
3. **Cutover**: bật lưu mới sau khi worker và Mongo schema/index ready. Phân biệt `capture_storage` (LEGACY_PG/MONGO_V1, chốt khi admission để insert/finish nhất quán) và `content_read_storage` (nguồn đọc hiện hành, được đổi có kiểm soát). Routing tường minh theo row, không thử Mongo rồi im lặng fallback. Invocation cũ chỉ chuyển `content_read_storage` từ LEGACY_PG sang MONGO_V1 bằng transaction sau ACK snapshot cuối + reconciliation hash/version, kiểm không live, generation không đổi và chưa purge. Giữ raw PG cho tới checkpoint contract để có rollback. Invocation live lúc cutover tiếp tục đường capture legacy tới khi kết thúc rồi mới backfill/chuyển nguồn đọc. Capture route cũ không có quyền ghi mới sau đã kết thúc.
4. **Validate**: query bảo mật, outage, crash, purge race, duplicate delivery, mixed legacy/new chạy đạt trên DB riêng. `findOwned` chỉ dựa metadata/result, bỏ phụ thuộc raw relation; GET sau purge vẫn 404 như cũ.
5. **Contract**: sau xác nhận đầy đủ mới migration riêng xóa raw legacy đã chuyển thành công và bỏ bảng/cột cũ; chưa có xác nhận không drop. Drop là thay đổi mất dữ liệu, backup/roll-forward theo DB-05. Post-cutover rollback code không được chạy bản cũ cần bảng raw đã bỏ; feature flag không tự khôi phục dữ liệu. Có image/schema compatibility và restore rehearsal.

Để legacy không mắc kẹt khi resume: command chọn lại ID chưa hoàn tất, kiểm generation trước từng batch; purge diễn ra trước/backfill đồng thời thì tombstone thắng. Backfill không tái dựng raw từ model hoặc gọi AI lại.

## 10. Cấu hình, bảo mật và vận hành

Biến dự kiến trong BE, không ghi giá trị thật vào spec:

| Biến                                  | Vai trò / đề xuất                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `AI_HISTORY_STORAGE`                  | `POSTGRES` trong rollout, `MONGODB` sau cutover; không phải switch provider AI     |
| `MONGODB_URI`                         | Secret kết nối, credentials theo process, không trả HTTP hay log                   |
| `MONGODB_DATABASE`                    | Database lịch sử AI riêng                                                          |
| `MONGODB_MAX_POOL_SIZE`               | Mặc định API 5, worker 5; đo trước tăng                                            |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | 2.000 ms; phân biệt cấu hình thiếu với dependency tạm lỗi                          |
| `MONGODB_OPERATION_TIMEOUT_MS`        | 3.000 ms, áp cả read/write và write concern; claim lease phải lớn hơn tổng timeout |

Cấu hình thiếu/sai khi mount adapter → startup từ chối, chỉ nêu tên biến. MongoDB outage sau khi cấu hình hợp lệ → trạng thái degraded, không làm nghiệp vụ PostgreSQL liveness chết hoặc tạo vòng restart. Health mở rộng phản ánh storage degraded; không đưa MongoDB thành điều kiện bắt buộc để trả lời mọi Request. Không mount MongoClient cho process không dùng, dùng một pool mỗi process, đóng trong shutdown.

VPS Compose: MongoDB private network, volume riêng, không public port 27017. Đề xuất single-node replica set cho môi trường đồ án, write concern majority+journal và primary reads; không cần multi-document transaction cho protocol trên. Single node không có HA; đo RAM/I/O dùng chung VPS với PostgreSQL, không cấp unlimited cache. Server image pin version/digest, health, resource limit và backup rehearsal là task deploy, chưa tạo ở lượt spec.

Danh tính DB tách: API chỉ đọc collection; worker upsert/replace tombstone; deploy tạo validator/index; backup/operator quyền riêng. Native driver lỗi chỉ qua error mapper an toàn. Chặn `$` operator từ input: dựng filter từ DTO đã validate, không spread raw JSON query. Response FE render raw như text, không `innerHTML`/thực thi Markdown không lọc.

Raw nằm trong MongoDB và outbox tạm phải thuộc cùng phạm vi bảo vệ, backup mã hóa và truy cập giới hạn. Không copy token vào context/prompt. Không để collection management trên internet. Audit chỉ metadata IDs/counts, không raw/hash dùng làm dấu vân tay nội dung trong thông báo công khai.

## 11. Tiêu chí và test matrix dự kiến

Đây là AC thiết kế `MH-*`, không phải mã US được BA cấp; trạng thái tất cả **planned**, không ghi passed do test source AI hiện có.

| Mã    | Tình huống                                            | Cấp / kết quả bắt buộc                                                                          |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| MH-01 | Tạo và kết thúc lần gọi có response                   | PG trạng thái/result/audit/intent atomic; worker ghi Mongo; admin đọc đúng raw, hash và version |
| MH-02 | Context/provider lỗi, JSON/schema AI sai              | Lưu phần thật sự có; null cho phần chưa có; không sửa raw; mã trạng thái đúng                   |
| MH-03 | Manager/Employee/Finance/IT/Spending đọc raw          | HTTP 403; chưa đăng nhập 401; ID khác installation 404; không query raw trước authorize         |
| MH-04 | Audit write thất bại khi đọc                          | Không trả nội dung; có retry request vẫn ghi event mới khi thành công                           |
| MH-05 | Mongo hoặc worker tắt rồi bật lại                     | GET summary và duyệt thủ công vẫn chạy; outbox không mất; lịch sử hội tụ đúng                   |
| MH-06 | Worker crash trước write/sau write/trước ACK          | Lease recovery, delivery lặp không trùng và không hạ version                                    |
| MH-07 | Hai worker, v2 trước v1, hash khác cùng version       | Một doc đúng snapshot cuối; conflict được báo, không last-write-wins mù                         |
| MH-08 | Purge gặp snapshot giữ lease, retry, backfill         | Tombstone ngăn hồi sinh; raw 404 ngay PURGING; chỉ ACK đủ mới báo xóa xong                      |
| MH-09 | Purge khi Mongo tắt                                   | CLI pending/error đúng, không exit 0; resume hoàn tất và audit đúng count một lần               |
| MH-10 | Read/purge và read/finish chạy đồng thời              | Recheck phiên bản và khóa PG trước audit; không trả raw trái state tại điểm commit              |
| MH-11 | Page trùng createdAt, biên thời gian, scope           | Sort tie-breaker; count/page cùng snapshot; projection không raw; không N+1                     |
| MH-12 | Migration legacy, live, purged; chạy backfill hai lần | Không mất result; hash đối chiếu; không migrate invocation đã purge; schema drift đúng          |
| MH-13 | Raw/body quá ngưỡng, query operator injection         | Từ chối có mã, không OOM, không truncation ngầm, không lộ secret trong log                      |
| MH-14 | Giả lập và model khi provider item đã có              | Lịch sử có nguồn đúng, giả lập có nhãn; stub từ Python không giả làm model production           |
| MH-15 | Restore backup cũ sau purge                           | Reapply purge ledger/tombstones trước phục vụ, không hồi sinh raw                               |
| MH-16 | Backlog vượt giới hạn, nhiều API process              | Chặn thêm AI call có mã ổn định, flow nghiệp vụ khác chạy; payload không bị xóa vì hết retry    |

Integration phải dùng **cả PostgreSQL và MongoDB disposable thật**, không dùng mock để chứng minh CAS, lease, atomicity, validator/index. Test HTTP mock dependency dùng cho guard/envelope. E2E đầu-cuối gọi BE thật + stub AI ở môi trường riêng, sau đó model smoke riêng; 68 Python tests/127 BE unit tests của review không thay được bộ này.

Mục tiêu thiết kế, cần đo: 10.000 lịch sử synthetic, metadata page size 20 p95 ≤ 500 ms, content ≤ 2 MiB p95 ≤ 1 s trên local network; outage trả lỗi ≤ timeout, backlog drain có số đo. Không tuyên bố MongoDB giúp nhanh hơn PostgreSQL khi chưa benchmark.

## 12. Phân rã sau khi duyệt thiết kế

Không lập implementation plan chi tiết hay code trước khi Owner duyệt spec. Sau duyệt dùng `superpowers:writing-plans`, tạo item theo mẫu repo và scope map hiện hành:

1. Technical enabler giữ hành vi: tách runtime result khỏi raw, migration/backfill result và test tương thích; không thêm màn hình.
2. Storage outcome: snapshot/outbox/Mongo, recovery, migration/cutover, purge xuyên hai DB; checkpoint expand → deliver → read → purge → contract. Không chia controller/service/repo thành item độc lập giả.
3. Admin history outcome: list/detail/content/error UX và OpenAPI, bàn giao FE; BA gán US/AC mới hoặc cập nhật owner AC chính xác, không tự claim AC của item cũ.
4. Runbook/demo/rollout theo checkpoint của item tương ứng; deploy không tự chạy do đã duyệt thiết kế.

Mỗi item có `spec.md`, `plan.md`, `Sizing decision`, dependency, test matrix và đăng ký chỉ mục/roadmap. Các tên trên là outcomes dự kiến, chưa phải items đã tồn tại. Màn stats/service-status/Finance narrative giữ ở spec riêng.

Trước code cập nhật quyết định lưu trữ và ADR Proposed liên quan. Khi thực sự implement mới cập nhật ARCHITECTURE, module card, API docs, runbook, OpenAPI qua generator, graph/routes qua generator, `.env.example` và CI Mongo integration. Không sửa generated files bằng tay, không tắt CI để né database mới.

## 13. Definition of Done và điểm cần Owner xem

- [ ] Owner duyệt hướng giữ runtime result ở PG, raw ở MongoDB; xác nhận đây là phạm vi dùng MongoDB mong muốn cho WDP.
- [ ] Nguồn quyết định đã ghi thay thế lệnh cấm kho riêng, vẫn giữ inference stateless và raw chỉ Super Admin.
- [ ] BA/Owner cấp phạm vi admin history; không gán trạng thái accepted cho story/model còn thiếu.
- [ ] Các item có plan và bằng chứng MH-01→MH-16, migration/restore/cutover rehearsal.
- [ ] Chạy gate BE theo CONTRIBUTING: `pnpm check`, HTTP, integration PG+Mongo cô lập, OpenAPI/graph, Docker build và smoke phù hợp.
- [ ] FE nhận hướng dẫn, examples, changelog; các thay đổi 409/503 và eventual consistency được mô tả.
- [ ] Không sửa lịch sử migration, mất dữ liệu, fake model identity, commit/push/deploy khi chưa có giao việc tương ứng.

Điểm Owner cần quyết định là **có chấp thuận thiết kế này để viết plan và triển khai hay không**. Các timeout, backlog, giới hạn byte, mô hình replica set và không thêm stats ở v1 là mặc định do người soạn đề xuất, điều chỉnh được trước triển khai; không được ghi như Owner đã chốt.

## 14. Nguồn kỹ thuật đã kiểm tra

Builder check ngày 13/11/2026: một reviewer chỉ đọc GPT-6.1 Sol Medium kiểm khả năng lập plan; ba điểm đã bổ sung ở §5.2, §8 và §9 (oversize, purge legacy, chuyển nguồn đọc). Lượt kiểm lại không còn câu hỏi quan trọng mới. Chưa có Owner approval; đây không phải xác nhận implementation hay test matrix MH đã đạt.

- [MongoDB Node.js driver](https://www.mongodb.com/docs/drivers/node/current/): adapter JS/TS chính thức, đọc/ghi qua repository của BE.
- [MongoDB atomicity](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/): atomic một document và conditional write; không bao trùm PostgreSQL. Giao thức outbox/tombstone trong spec là thiết kế đề xuất, không phải MongoDB tự cung cấp transaction xuyên hai hệ.
- [BSON limits](https://www.mongodb.com/docs/manual/reference/limits/#bson-document-size): trần document 16 MiB; ngưỡng 2 MiB của spec là lựa chọn ứng dụng.
- [TTL](https://www.mongodb.com/docs/manual/core/index-ttl/): không dùng TTL làm bằng chứng xóa ngay hoặc thay audit/purge.

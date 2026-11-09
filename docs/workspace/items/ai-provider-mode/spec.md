# Spec: nguồn trả lời của AI — chế độ giả lập và chọn client theo lần gọi (`US-15-05` AC-16, AC-17, phía BE)

- Phụ trách: AI theo giao việc của người dùng (09/11/2026), làm theo `AI-SERVICE/PLAN.md` Phase 1 (T1.0 → T1.5); các task có
  thể do nhiều phiên AI làm tuần tự trên cùng nhánh `Bao_dev_be`.
- Thiết kế ban đầu bởi: AI — `AI-SERVICE/SPEC.md` v1.2 (07/11/2026, mục 6) và `AI-SERVICE/PLAN.md` v1.2, repo `AI-SERVICE`
  `1f1c83b`; trạng thái của bản đó: _sẵn sàng giao implement, chờ Owner duyệt_.
- Thiết kế: `ready`. Owner review: chưa review. Riêng migration `provider_mode` — Owner đồng ý 07/11/2026 (ghi ở
  `AI-SERVICE/SPEC.md` mục 6.3); quyết định đó chưa được ghi vào nguồn nào trong repo BE ngoài dòng này.
- Nguồn: Docs `14dbb7b` (`BE-UserStory/src/EP-15.md` — `US-15-05` AC-16, AC-17; `QĐ-102b`, `QĐ-102d`, `QĐ-102e`, `QĐ-102f`),
  BE `1c41354e` (`origin/dev`; nhánh làm việc `Bao_dev_be` `48e4386f` là merge PR #35 của chính revision đó, cây giống hệt).
- Nhóm roadmap: G10 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Spec cũ của Story (giữ nguyên, chỉ dẫn tới):
  [ai-assist-queue-summary-be](../ai-assist-queue-summary-be/spec.md). Module card: [ai-assist](../../../../src/modules/ai-assist/README.md).

Chi tiết thiết kế (mẫu câu, migration, bảng chỗ phải sửa, test phải sửa) nằm ở `AI-SERVICE/SPEC.md` mục 6; spec này chỉ ghi phạm
vi, quyết định và bằng chứng theo mẫu repo BE. Khi hai nơi lệch nhau, `AI-SERVICE/SPEC.md` thắng và spec này được sửa theo.

## Business outcome

Super Admin chọn nguồn trả lời của AI bằng tham số vận hành `AI_PROVIDER_MODE` (`SIMULATED` mặc định, hoặc `MODEL`). Ở chế độ
giả lập, trưởng phòng hoặc Người duyệt chi bấm tóm tắt và nhận các dòng mẫu dựng từ chính dữ liệu nguồn, không gọi model, qua
cùng bước kiểm đầu ra và mang cờ `simulated: true` để FE gắn nhãn _giả lập — không phải AI_; công tắc AI tắt thì không có kết quả
nào; chế độ model lỗi thì lần gọi `FAILED`, không thay bằng giả lập. Kiểm bằng unit (client giả lập qua `validateQueueSummary`),
integration trên PostgreSQL thật (tham số, cột `provider_mode`, chọn client theo lần gọi) và HTTP (trường `simulated`).

## Sizing decision

- Container: G10 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: Super Admin chọn nguồn trả lời, mỗi lần gọi mang đúng chế độ lúc tạo và kết quả giả lập luôn được đánh dấu;
  capability `ai-assist/ai-service` (client giả lập, chọn client) và `ai-assist/queue-summary` (đọc tham số, chạy nền) của module
  `ai-assist`, tham số ở `operating-parameters`.
- Boundaries: thêm cột `provider_mode` vào `ai_invocations` và dựng lại unique index một phần (một migration); một tham số vận
  hành mới qua route `PUT /operating-parameters/{key}` có sẵn; thêm `simulated` vào `GET /ai/access-request-summaries/{id}` và
  `providerMode` vào `GET /ai/invocations/{id}/content`; audit `AI_INVOCATION.*` thêm `providerMode`; không đổi quyền.
- Not larger: AC-1→AC-15 của Story đã thuộc hạng mục cũ (route, kiểm đầu ra, purge, audit); dịch vụ AI thật trên Modal ở repo
  `AI-SERVICE`; màn hình và nhãn hiển thị ở FE web.
- Not smaller: tham số, client giả lập, cột `provider_mode` và chọn client theo lần gọi cùng chứng minh một hành vi (lần gọi giữ
  chế độ lúc tạo, không tự chuyển nguồn); tách theo tầng thì không lát nào tự kiểm được AC-16 hay AC-17.
- Siblings: `ai-assist-queue-summary-be` (AC-1→AC-9, AC-11→AC-15 của cùng Story).
- Scope map: [G10](../../../roadmap.md#work-item-decomposition-g10).

## Primary Story/AC

| Story    | AC           | Coverage | Phần còn lại thuộc                                                                                   |
| -------- | ------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| US-15-05 | AC-16, AC-17 | partial  | AC-1→AC-9, AC-11→AC-15: `ai-assist-queue-summary-be`; AC-10: `not affected` (chỉ web, xem scope map) |

`partial` ở đây là của Story (hạng mục chỉ giữ hai AC của `US-15-05`, theo rule sizing `split-story`), không phải của từng AC: scope
map G10 giao trọn AC-16, AC-17 cho hạng mục này (`full`, một chủ). Từ T1.5 (09/11/2026) vế BE của cả hai AC đã làm đủ và có bằng
chứng local ở `## Test matrix`; phần còn lại của hai AC là nhãn trên màn hình FE web (ngoài BE).

Vế BE của từng AC:

- **AC-16:** tham số `AI_PROVIDER_MODE` (mặc định `SIMULATED`); `SimulatedAiServiceClient` dựng câu mẫu không gọi mạng, câu qua
  cùng `validateQueueSummary`; `GET` tóm tắt có `simulated: true`; công tắc tổng `OFF` ⇒ 403 `AI.DISABLED` ở cả hai chế độ. Hiện
  nhãn _giả lập — không phải AI_ là màn hình FE web.
- **AC-17:** chế độ `MODEL` mà dịch vụ lỗi ⇒ lần gọi `FAILED` `AI.PROVIDER_UNAVAILABLE`, không có dòng giả lập (client chọn theo
  `provider_mode` đã ghi, không đọc lại tham số, không đổi nguồn khi lỗi). "Chỉ mở hàng đợi không tạo lần gọi" đã đúng từ hạng mục
  cũ (`GET …/source` không ghi gì) và được giữ.

## Supporting references

`QĐ-102b` (không tự chuyển nhà cung cấp hay sang giả lập khi model lỗi), `QĐ-102e` (công tắc), `QĐ-102f` (chế độ giả lập, nhãn ở
mọi nơi hiển thị); `US-01-04` (tham số vận hành, audit khi đổi); thiết kế chi tiết `AI-SERVICE/SPEC.md` mục 2, 3, 5, 6; ADR-0005
(SQL viết tay cho index một phần). Rule: [module-structure](../../../rules/module-structure.md),
[database-business](../../../rules/database-business.md), [api-contract](../../../rules/api-contract.md).

## Explicit out of scope

- Dịch vụ AI trên Modal, prompt, chọn model, đánh giá: repo `AI-SERVICE` (PLAN Phase 2–3). Nối BE với Modal (`AI_SERVICE_*` của
  VPS): PLAN T2.4, cần Owner.
- Màn hình và nhãn _giả lập — không phải AI_: FE web (PLAN T4.1). `US-15-06`: chặn bởi `US-12-14`.
- Lọc trước dữ liệu nguồn cho chế độ giả lập: không làm — dòng có URL, từ khuyên hay tên khớp `risk*` bị loại như dòng của model.
- Runbook vận hành và ngày purge sau nghiệm thu: PLAN T5.2, T5.4.

## Dependencies and blockers

- Hạng mục `ai-assist-queue-summary-be` (module `ai-assist`, migration `20261104100000_ai_assist_invocations`) đã có trên `dev`.
- Migration `provider_mode` (PLAN T1.3) đi trước chọn client theo lần gọi (T1.4); T1.1 và T1.2 không phụ thuộc nhau.
- Không blocker. Owner đã đồng ý migration (07/11/2026, theo `AI-SERVICE/SPEC.md`).

## Ownership: module, data, API

- `operating-parameters`: thêm định nghĩa `AI_PROVIDER_MODE` vào `PARAMETER_DEFINITIONS` (nhóm `AI`, sau
  `AI_ACCESS_REQUEST_SUMMARY_ENABLED`); đổi và audit qua `parameter-change.service.ts` có sẵn, không code mới.
- `ai-assist/ai-service`: `ai-service-simulated.policy.ts` (hàm thuần dựng câu và câu trả lời) và
  `ai-service-simulated-client.service.ts` (`SimulatedAiServiceClient extends AiServiceClient`, lớp thường như
  `HttpAiServiceClient`, không `@Injectable`); sau đó `ai-service-clients.service.ts` (`AiServiceClients.forMode`).
- `ai-assist/invocation`, `queue-summary`, `invocation-content`: cột và trường `providerMode` theo bảng _Mang chế độ cho từng lần
  gọi_ của `AI-SERVICE/SPEC.md` 6.3; bảng `ai_invocations` (migration mới), không bảng mới.
- HTTP: không route mới; hai trường mới ở hai response, OpenAPI xuất lại. Không Nest module mới, không extension point mới.

## Behavior and design

- Tham số: đúng giá trị của `AI-SERVICE/SPEC.md` 6.1 (nhãn, `optionLabels`, `unit: 'mode'`, mô tả tiếng Việt). Giá trị ngoài
  enum ⇒ 422 `PARAMETER.VALUE_INVALID` (`OUT_OF_RANGE`) như mọi tham số enum.
- Client giả lập (`AI-SERVICE/SPEC.md` 6.2): `configured()` luôn `true`; chờ `SIMULATED_DELAY_MS = 1500` hủy được; bị hủy ⇒
  `AiServiceUnavailableError(null, null)`, không trả kết quả; `modelId` `saas-sentry-simulated`, `modelRevision` `v1`,
  `promptVersion` `simulated-v1`, `schemaVersion` `aqs-schema-v1`, `promptText` `[SIMULATED] Không gọi model.`, `usage` 0/0,
  `latencyMs` số nguyên; một dòng mỗi bước theo mẫu câu, lý do chỉ cắt ở khoảng trắng (thêm `…`), cả câu ≤ 400 code point, không
  từ nào vừa chỗ thì bỏ đoạn `. Lý do: …`. Phần chữ cố định dài nhất là 363 code point. Không log nội dung.
- Chọn client, migration, chống gọi trùng theo chế độ, `simulated`/`providerMode` trên wire và audit: theo `AI-SERVICE/SPEC.md`
  6.3–6.4 (PLAN T1.3–T1.5). Giá trị lạ của tham số ⇒ `SIMULATED` + log WARN; `MODEL` chưa cấu hình URL ⇒ 503
  `AI.PROVIDER_UNAVAILABLE`; lần gọi đang chạy giữ chế độ lúc tạo.
- Migration: thêm cột với default `MODEL` cho dòng cũ rồi bỏ default; dựng lại `ai_invocations_active_per_revision` có
  `provider_mode`, giữ nguyên điều kiện `WHERE`. Tương thích: dòng cũ là `MODEL`; FE cũ bỏ qua trường mới.
- Jobs/storage: không áp dụng — lần gọi vẫn chạy nền trong tiến trình API như hạng mục cũ.

## Test matrix

| AC / rủi ro                | Tình huống (gồm từ chối, edge case)                                                                              | Cấp test                                                                                                    | Kết quả mong đợi                                                               | Bằng chứng sau implement                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| AC-16 (tham số)            | Danh sách có `AI_PROVIDER_MODE`, nhóm `AI`, mặc định `SIMULATED`, hai nhãn tiếng Việt; Super Admin đổi, có audit | unit `parameter-definitions.policy.spec.ts`; integration `operating-parameters-http.integration-spec.ts`    | 200, audit `SIMULATED → MODEL → SIMULATED`                                     | passed 09/11/2026, cây chưa commit trên `48e4386f` ([plan](plan.md#verification-and-handoff)) |
| AC-16 (từ chối)            | `OPENAI`, `model`, `ON` ⇒ 422 `OUT_OF_RANGE`; IT Admin ⇒ 403; giá trị không đổi                                  | unit + integration như trên                                                                                 | từ chối, không ghi                                                             | passed 09/11/2026 (như trên)                                                                  |
| AC-16 (cùng bước kiểm)     | Lý do có số, có `C001`, lý do 1000 ký tự, tên 120 ký tự; 300 context ngẫu nhiên hợp lệ                           | unit `ai-service-simulated.policy.spec.ts`, `ai-service-simulated-client.service.spec.ts`                   | mọi dòng qua `validateQueueSummary`, response qua zod                          | passed 09/11/2026 (như trên)                                                                  |
| AC-16 (dòng bị loại)       | Lý do có URL, "nên duyệt gấp", tên `RiskLens`                                                                    | unit policy                                                                                                 | `URL_PRESENT`, `ADVICE_LANGUAGE` đúng dòng                                     | passed 09/11/2026 (như trên)                                                                  |
| Rủi ro cắt số              | Chỗ cắt rơi giữa `20261108`                                                                                      | unit policy                                                                                                 | chỉ cắt ở khoảng trắng, không `INVENTED_NUMBER`                                | passed 09/11/2026 (như trên)                                                                  |
| AC-17 / hủy                | `signal` hủy trước hoặc trong lúc chờ                                                                            | unit client                                                                                                 | `AiServiceUnavailableError(null, null)`, không kết quả, không `fetch`          | passed 09/11/2026 (như trên)                                                                  |
| AC-16 (`simulated`)        | `SIMULATED` chạy không có `AI_SERVICE_BASE_URL`; `GET` có `simulated: true`; công tắc `OFF` ⇒ 403 cả hai chế độ  | integration + HTTP `ai-assist`                                                                              | `COMPLETED`, `simulated: true`; 403 `AI.DISABLED`                              | passed 09/11/2026 (`queue-summary-provider-mode` integration, HTTP `queue-summary`, unit)     |
| AC-17 (không tự chuyển)    | `MODEL` + dịch vụ giả trả 500 hai lần                                                                            | integration `ai-assist`                                                                                     | `FAILED` `AI.PROVIDER_UNAVAILABLE`, không dòng giả lập                         | passed 09/11/2026 (`queue-summary-failures` integration + unit)                               |
| Lần gọi giữ chế độ lúc tạo | Super Admin đổi chế độ khi lần gọi `RUNNING`; cùng `queueRevision` khác chế độ cùng tồn tại                      | integration `ai-assist`                                                                                     | kết quả theo chế độ lúc tạo; hai lần gọi                                       | passed 09/11/2026 (integration `queue-summary-failures`, `queue-summary-provider-mode`, unit) |
| Migration                  | DB trống và DB có dòng cũ; `insert` thiếu chế độ                                                                 | integration schema + `migration-order` + drift                                                              | dòng cũ `MODEL`; DB từ chối insert thiếu chế độ                                | passed 09/11/2026 (`ai-invocations-schema` integration, drift, `migration-order`)             |
| Nội dung Super Admin       | `GET …/content` của lần gọi `MODEL` và `SIMULATED`                                                               | unit `invocation-content-query`; HTTP; integration `invocation-content-http`                                | `providerMode` đúng chế độ của lần gọi                                         | passed 09/11/2026                                                                             |
| Audit có chế độ            | `REQUESTED`, `COMPLETED`, `FAILED` (model lỗi, nguồn không đọc được, kẹt qua `POST` và qua `GET`) ở hai chế độ   | unit `queue-summary-provider-mode`; integration `queue-summary`, `queue-summary-failures`, `-provider-mode` | `after.providerMode` = chế độ của chính lần gọi (cả lần gọi kẹt khác chế độ)   | passed 09/11/2026                                                                             |
| Log lần gọi lỗi            | Dịch vụ trả 401 `UNAUTHORIZED`, 500 `MODEL_ERROR`; không kết nối được; hết giờ; lần gọi có kết quả               | unit `queue-summary-run.service.spec.ts`                                                                    | `httpStatus`, `serviceCode` (`none` khi không có); không nội dung, không token | passed 09/11/2026                                                                             |

Planned khác passed. Bằng chứng ghi lệnh, revision và môi trường, không chứa secret hay token.

## Definition of Done

- [x] Mọi vế BE của AC-16, AC-17 có test đỏ-trước/xanh-sau ở cấp phù hợp (T1.1–T1.5, 09/11/2026; bằng chứng ở plan).
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên cây cuối (local, chưa commit); HTTP đổi thì test HTTP +
      OpenAPI — ngoại lệ môi trường ghi ở plan (`openapi-export.http-spec` trên Node 24).
- [ ] Spec/plan/roadmap phản ánh implementation cuối (xong); `openapi.json` mới và nhãn đã báo FE — chưa: giao FE ở Checkpoint A.
- [x] Không tăng legacy ledger kiến trúc (`pnpm arch:check` 0 vi phạm).
- [x] Module card `ai-assist` cập nhật (Cấu hình, Route, tham số mới, log, audit); phần chưa kiểm chứng ghi rõ ở plan.

## Changes and acceptance

- 09/11/2026: lập hạng mục (PLAN T1.0) và làm T1.1, T1.2. Chưa nghiệm thu; Owner chưa review.
- 09/11/2026: làm T1.3 (migration `20261109100000_ai_provider_mode`) và T1.4 (chọn client theo chế độ). Chưa nghiệm thu; Owner chưa
  review.
- 09/11/2026: làm T1.5 (`simulated` trên `GET` tóm tắt, `providerMode` trên nội dung Super Admin và trong audit `AI_INVOCATION.*`,
  log lần gọi lỗi có `httpStatus`/`serviceCode`, `openapi.json`, module card). Vế BE của AC-16, AC-17 đủ, kiểm chứng local (chưa
  commit); Checkpoint A đã chạy local trên DB dev 09/11/2026 (SIMULATED, và MODEL với dịch vụ stub; chưa giao FE); đỏ đã biết do môi trường ghi ở plan; chưa nghiệm thu; Owner chưa review.

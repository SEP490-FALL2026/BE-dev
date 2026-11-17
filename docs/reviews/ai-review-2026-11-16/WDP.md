# Review phần AI môn WDP (chỉ đọc) — 16/11/2026

## Skill đã đọc và dùng

| Skill | Vai trò | Mục đích |
| --- | --- | --- |
| `agent-skills:code-review-and-quality` | process + review (mapping: không có process skill riêng cho review chỉ đọc; dùng mục *Review Process* 5 bước của skill này làm quy trình) | Review 5 trục: đúng, dễ đọc, kiến trúc, bảo mật, hiệu năng; xếp mức Critical/Required/Consider/FYI |
| `superpowers:verification-before-completion` | verification | Chỉ kết luận theo lệnh đã chạy trong lượt này; ghi rõ cái gì chưa chạy |

Không sửa file nào trong repo, không commit, không chạy lệnh ghi git. Mã được đọc qua `git archive` ra scratchpad. Test Python
chạy bằng `.venv` sẵn có của repo AI WDP. Theo quy ước của Owner, **không chạy** jest BE (xem phần Bằng chứng).

## Phạm vi và mốc

| Repo | Mốc review | Ghi chú |
| --- | --- | --- |
| `Ai-service-WDP` | `origin/main` = `9da11e1` (16/11 15:57) | Checkout local đang ở `005f11c`, **chậm 2 commit**; có `reviews/` chưa track và `AI-services/SPEC.md` "modified" (do trùng tên hoa/thường, xem A9) |
| `BE-WDP` | `origin/feat/AI-services` = `1aa0c218`, merge-base với `origin/dev` = `44b2c3f1` | 44 commit nhưng **chỉ 1 commit nội dung** (`1aa0c218`, 16/11), còn lại là merge PR dev→main. Diff: 98 file, src +1 815/−283 dòng (không tính generated), test +1 775/−268, docs +594 |
| `BE-dev-software-license-management` (SEP) | `origin/dev` = `94a8ee84` | `src/modules/ai-assist`, `prisma/models/ai-assist.prisma`, `src/worker`, `compose.yaml`, `.env.example`, `package.json` **giống hệt từng blob** với merge-base của WDP |

## Kết luận nhanh

1. **AI service WDP chạy được và có bằng chứng thật**: 171/171 test pass (tôi chạy lại), model Qwen3.5-4B Q4_K_M đã deploy và đánh
   giá trên Modal theo nhật ký (60 ca đạt ngưỡng, 12/12 kịch bản — tôi kiểm lại 12/12 từ file dump). Hợp đồng v1 khớp zod của BE.
   Còn các lỗi công cụ đánh giá đã nêu từ review 14/11 (WDP-01..04) **chưa sửa**.
2. **BE WDP dùng MongoDB để giữ lịch sử thô của lần gọi AI** (context, prompt, câu trả lời gốc, kết quả kiểm) cho Super Admin đọc;
   PostgreSQL vẫn là nguồn có thẩm quyền, ghi qua transactional outbox, worker giao sang MongoDB. Thiết kế đúng kiến trúc BE
   (infrastructure adapter + facade module + public API, gate được đăng ký chứ không bị nới), code chất lượng cao, nhưng **nặng**
   so với nhu cầu và có **2 chặn merge**: CI không có MongoDB (B1) và production chưa có MongoDB trong khi migration xóa bảng cũ
   không quay lại được (B2).
3. **Lệch luật đồ án**: MongoDB trái `QĐ-102h`, `QĐ-79c` (đúng như mong đợi cho WDP, ADR-0020 tự ghi *Proposed*);
   `AI_PROVIDER_MODE` (`QĐ-102f`) **chưa có** ở cả BE WDP lẫn BE SEP; `US-15-06` chưa có ở đâu.
4. **Đưa sang đồ án**: chỉ nên lấy prompt v4 + bộ đánh giá/kịch bản + script smoke + vài cải tiến vận hành Modal; **bỏ toàn bộ
   phần MongoDB** (không merge nhánh, cherry-pick file). Công sức ước 0,5–1,5 ngày.
5. **Rủi ro merge lớn nhất** không phải WDP→SEP mà là **SEP→WDP về sau**: nhánh WDP sửa đúng các file mà SEP sẽ sửa khi làm
   `AI_PROVIDER_MODE` (queue-summary service, module, harness, fakes, `ai_invocations`).

---

## (a) AI service WDP

### Làm được gì

| Thành phần | Bằng chứng | Trạng thái |
| --- | --- | --- |
| FastAPI front: `/healthz` (không token, không đánh thức GPU), `/v1/warmup`, `POST /v1/summaries/access-request-queue` | `src/ai_service/app.py:76-117` | Có, test |
| Bearer token so sánh hằng thời gian, kiểm **trước** đọc body | `auth.py:12-18`, `app.py:94` | Có, test |
| Giới hạn body 256 KiB, ≤20 bước, version 1, strict (`extra="forbid"`) | `app.py:29,35-65`; `contract.py:46-48,61-63` | Có, test |
| JSON schema động: `sourceRef` chỉ trong tập đã gửi, `minItems=maxItems=n` | `schema.py:10-34` | Có |
| Prompt `aqs-prompt-v4`: chỉ lấy mục đích từ `reason`, bỏ câu lệnh/ưu tiên/rủi ro/URL, không số tự viết, chi phí chỉ `{{cost:Cxxx}}` | `prompts/access_request_queue_v1.py:9-55` | Có, 4 vòng đánh giá |
| Runner: `StubRunner` (không mạng) và `ModalRunner` (`modal.Cls.from_name`) | `runner.py:31-105` | Có, test với mock |
| Modal: Volume model + manifest SHA-256, `Inference` chạy `llama-server` (`--reasoning off`, ctx 32768, parallel 1), `max_containers=1`, `scaledown_window=60`, front CPU 0.5 | `modal_app.py:58-246` | Đã deploy thật (nhật ký `gateway-run-log.md` §8–9 trên `origin/main`) |
| Chế độ chỉ front + stub trên Modal (`AI_DEPLOY_GPU=0`), runner do deployment quyết, không do Secret | `front.py:15-22`, `modal_app.py:101-108,215-224` | Có, `tests/test_front.py` |
| Bộ đánh giá: 60 ca `queue_v1`, 12 kịch bản `queue_scenarios_v1`, validator check-v2, báo cáo v1→v4 | `eval/`, `eval/reports/2026-11-16-*` | Có |
| Không lưu trạng thái, log chỉ metadata (invocationId, latency, tokens, parseStatus) | `app.py:137-145`; `modal_app.py:185-187` | Có |

Không có: `US-15-06` (bản nháp diễn giải Finance), chế độ giả lập theo `QĐ-102f` (stub ở đây không phải giả lập có nhãn), train/RAG.

### Chạy được chưa — bằng chứng lượt này

| Lệnh (trên snapshot `origin/main`) | Kết quả |
| --- | --- |
| `.venv/Scripts/python.exe -m pytest -q -p no:cacheprovider` | **171 passed**, 1 warning (`StarletteDeprecationWarning` httpx), 0.94 s |
| `ruff check --no-cache .` | **4 lỗi** E501 ở `eval/build_scenarios.py:14,37,46,56` |
| `ruff format --check --no-cache .` | **6 file** cần format |
| `python -m eval.check_scenarios eval/reports/2026-11-16-qwen3.5-4b-q4_k_m-aqs-prompt-v4-scenarios.cases.jsonl` | **12/12 scenarios pass** (kể cả off-topic, dữ liệu cá nhân, JSON giả, chửi bới, 20 bước) |

Không chạy: Modal deploy, GPU, model thật (không có quyền và tốn tiền). Kết quả model (60 ca đạt mọi ngưỡng, p50 3,4 s,
p95 13,1 s ấm) là **số của tác giả** trong `eval/reports/2026-11-16-qwen3.5-4b-q4_k_m-aqs-prompt-v4.md`, tôi chỉ kiểm lại phần kịch bản
từ dump đã lưu.

### Hợp đồng với BE

`contract.py` khớp `BE-WDP/src/modules/ai-assist/ai-service/ai-service.types.ts`: cùng `QUEUE_MAX_REQUESTS=20`, regex
`^R[0-9]{3}$`/`^C[0-9]{3}$`, `stepKind`, `parseStatus`, strict object, `parsed` có ⇔ `OK`. Python nhận `generatedAt` có offset,
zod `z.iso.datetime()` chỉ nhận `Z` — Python rộng hơn ở đầu vào, BE luôn gửi `toISOString()`, nên không lệch thực tế. Đã chạy thật
BE↔AI: S1–S9 PASS, cả qua Modal stub và GPU (`gateway-run-log.md` §7–9).

### Findings AI service

| Mã | Mức | Vấn đề | Bằng chứng |
| --- | --- | --- | --- |
| A1 | Required | `--runner http` thiếu `--base-url` **âm thầm chạy stub**, báo cáo vẫn ra như đã đo service (WDP-01 của review 14/11, chưa sửa) | `eval/run_eval.py:72-75,321-322` |
| A2 | Required | Cổng "đạt" của báo cáo rỗng nghĩa: nhóm thiếu bị `continue`, `all_passed` khởi tạo `True`; latency không vào cổng; CLI không trả exit ≠ 0. Ví dụ thật: báo cáo kịch bản v4 có **bảng nhóm rỗng** nhưng kết luận "đạt tất cả các ngưỡng" | `run_eval.py:220-224,287`; `eval/reports/2026-11-16-...-v4-scenarios.md` §1, §4 |
| A3 | Required | Lỗi HTTP non-200 đưa nguyên `res.text` vào exception rồi `log.error` — body có thể echo prompt/tên người | `run_eval.py:97,160` |
| A4 | Required | `/v1/warmup` không có deadline; `AI_REQUEST_DEADLINE_S` nhận `0`, âm, `nan`, `inf` | `app.py:86-90`; `settings.py:45` |
| A5 | Consider | Chuỗi cung ứng: image `llama.cpp:server-cuda` là tag động; model tải từ `resolve/main`, tính SHA nhưng **không đối chiếu** SHA đã chốt trong README | `modal_app.py:32,49,79-85`; `README.md:23` |
| A6 | Consider (Owner) | GPU dự phòng L4 → A10G → **L40S**: SPEC gốc chỉ L4 và ghi đổi GPU cần duyệt; L40S đắt hơn nhiều. README tự ghi "Owner review pending" | `modal_app.py:213-223`; `README.md:29`; `AI-module-SEP/SPEC.md:758` |
| A7 | Nit | `locale="en"` được nhận nhưng prompt luôn tiếng Việt | `contract.py:84`; prompt |
| A8 | Nit | Ruff: 4 E501, 6 file chưa format | lệnh ở trên |
| A9 | Nit | Git có cả `AI-services/SPEC.md` và `AI-services/spec.md` (khác blob) — Windows chỉ giữ một, nên checkout luôn báo modified | `git ls-tree origin/main AI-services/` |
| A10 | FYI | `/healthz` không token lộ `modelId`, `promptVersion` — chấp nhận được (SPEC cho phép) | `app.py:76-84` |

Điểm tốt: token trước body và trước GPU, không log nội dung, strict contract, schema ràng buộc ref, stub/model tách theo deployment,
quy trình prompt v1→v4 có lý do ghi trong code (`access_request_queue_v1.py:11-19`) và báo cáo từng vòng.

---

## (b) BE WDP nhánh `feat/AI-services`

### MongoDB dùng để làm gì

Chỉ một collection `ai_invocation_histories` (một document mỗi lần gọi AI) giữ **lịch sử thô**: context đã giới hạn (có
`beneficiaryDisplayName`, `reason`), `promptText`, `rawResponse`, `parsed`, `validation` — để Super Admin đọc qua
`GET /api/v1/ai/invocations/{id}/content`. Nguồn: ADR `docs/decisions/0020-mongodb-for-ai-invocation-history.md:20-35`,
`invocation-history.types.ts:10-33`.

PostgreSQL vẫn giữ: `ai_invocations` (+ cột `history_state/version/stored_version/generation/error_code/purged_at`), bảng mới
`ai_invocation_results` (kết quả phục vụ `GET` tóm tắt của chủ lần gọi), outbox `ai_history_deliveries`. Bảng
`ai_invocation_contents` bị **xóa** (`prisma/migrations/20261116100000_ai_history_mongodb/migration.sql:67-103`).

### Cắm vào kiến trúc BE thế nào

| Điểm | Cách làm | Bằng chứng | Đánh giá |
| --- | --- | --- | --- |
| Tầng | `src/infrastructure/mongodb/` (config Joi, `MongoClient` một pool/process, `ping`, đóng khi shutdown), chỉ dùng `infrastructure/config` | `mongodb.config.ts`, `mongodb-infrastructure.module.ts`, `mongodb-connection.service.ts` | Đúng mẫu `infrastructure/queue` |
| Module | `ai-assist` mount `MongoInfrastructureModule`; capability mới `invocation-history/` (outbox repo PG, store repo Mongo, policy, hash), `history-delivery/` | `ai-assist.module.ts:29-53` | Đúng R6/capability |
| Worker | `AiAssistHistoryFacadeModule` + public `AiHistoryDeliveryApi`; vòng `AiHistoryDeliveryLoop` poll outbox | `ai-assist-history-facade.module.ts`; `public/ai-history-delivery.api.ts`; `src/worker/ai-history-delivery.job.ts`; `worker.module.ts:6,9,23,25` | Đúng "process chỉ chạm module qua public/ và *.module.ts" |
| CLI | `ops:ai-purge` hai bước: PG (generation mới, `PURGING`, xóa result, COMPLETED→STALE, tombstone vào outbox, audit) rồi drain tombstone | `public/ai-purge.api.ts`; `purge/ai-assist-purge-cli.module.ts:16-27` | Đúng |
| Ghi | Snapshot v1 lúc admission, v2 lúc có câu trả lời, **cùng transaction** với trạng thái + audit | `queue-summary.service.ts:181,274`; `queue-summary-run.service.ts:231`; `invocation-history-outbox.repo.ts:74-98` | Đúng outbox |
| Giao | Claim 20 dòng `FOR UPDATE SKIP LOCKED`, lease 60 s, ghi Mongo có điều kiện theo generation/version, ACK theo lease, retry 1→300 s không giới hạn, park khi bị từ chối vĩnh viễn | `history-delivery.service.ts:15-188`; `outbox.repo.ts:104-204`; `store.repo.ts:117-219` | Đúng, idempotent |
| Đọc | PG quyết trước (purged→404, chưa giao→409 `AI.HISTORY_PENDING`, lỗi→503 `AI.HISTORY_UNAVAILABLE`), đọc Mongo ngoài transaction, rồi khóa lại PG, ghi `AI_INVOCATION.CONTENT_READ` rồi mới trả | `invocation-content-query.service.ts:31-106` | Đúng `QĐ-102g` (đọc luôn có audit) |
| Phân quyền | Không đổi: `@RequireRoles('SUPER_ADMIN')` cho route nội dung | `invocation-content.controller.ts:31-32` | Giữ nguyên |
| Gate kiến trúc | Đăng ký model Prisma mới cho `ai-assist`, thêm export public — **không nới luật** | `test/gates/architecture-boundaries.gate-spec.ts:64-65`; `module-graph.gate-spec.ts:146-147` | Đạt |
| Env | `MONGODB_URI/DATABASE/MAX_POOL_SIZE/SERVER_SELECTION_TIMEOUT_MS/OPERATION_TIMEOUT_MS`; production bắt URI có user+password; thông báo lỗi không lộ URI | `mongodb.config.ts:18-47`; `.env.example`; `env-example.spec.ts` | Tốt |
| Compose | Service `mongo:8.0`, profile `history`, bind `127.0.0.1`, không auth (local) | `compose.yaml` | Tốt cho dev; **prod chưa có** |
| Migration | Một migration, backfill rồi `DROP TABLE ai_invocation_contents`; CHECK cho version/lease/payload | `migration.sql:1-125` | Cẩn thận nhưng **không quay lại được** |
| Docs | ADR-0020, 2 work item (gateway, mongodb infra), `ARCHITECTURE.md`, README module, `test/README.md` | diff | Đầy đủ |

### Findings BE

| Mã | Mức | Vấn đề | Bằng chứng | Đề xuất |
| --- | --- | --- | --- | --- |
| B1 | **Critical (chặn merge)** | CI không có MongoDB: `AiSummaryHarness.start()` gọi `provisionHistoryStore()`, hàm này ném lỗi khi thiếu `TEST_MONGODB_URI`; `ci.yml` chỉ có service `postgres` và không có biến Mongo ⇒ **mọi suite `test/integration/ai-assist/*`** sẽ đỏ. Nhánh chưa từng có lượt CI (`gh run list --branch feat/AI-services` rỗng) | `test/support/ai-summary-harness.ts:79`; `test/support/disposable-history-store.ts:26-31`; `.github/workflows/ci.yml:124-126,231-232,271-272,320-321` | Thêm service `mongo:8.0` + `TEST_MONGODB_URI` vào các job integration trước khi merge |
| B2 | **Critical (chặn merge vào `main`)** | API, worker, `ops:ai-purge` đều mount Mongo; production bắt `MONGODB_URI` có thông tin xác thực, nhưng `docker-compose.prod.yml` không có MongoDB hay `MONGODB_*`. `deploy.yml` deploy sau CI trên `main`: migration (xóa bảng) chạy trước khi API khởi động ⇒ API từ chối khởi động ⇒ script rollback về release cũ, mà release cũ cần `ai_invocation_contents` đã bị xóa | `mongodb.config.ts:23-27,39-47`; ADR `0020...md:63-65,83-84`; `migration.sql:103`; `.github/workflows/deploy.yml:6-8` | Có Mongo prod (Atlas có allowlist hoặc service trong compose prod) + biến trên VPS + backup trước `migrate deploy` |
| B3 | Required (quy trình) | ADR-0020 vẫn *Proposed* nhưng đã triển khai; spec của chính nhánh ghi phần lưu trữ "cần ADR-0020 Accepted" | ADR `0020...md:5-8,69`; `docs/workspace/items/ai-history-mongodb-infrastructure/spec.md:29,64` | Owner chốt một quyết định **riêng cho WDP** (không sửa `QĐ-102h` của đồ án) rồi đổi ADR sang Accepted |
| B4 | Consider | Thiết kế nặng so với nhu cầu (một collection chỉ để Super Admin đọc): 5 trạng thái lịch sử, generation/version, lease, tombstone, hash nội dung, ~1,8k dòng src + ~1,8k dòng test. Đúng và có test, nhưng đi ngược thói quen "trường đơn giản" của dự án | các file `invocation-history/*`, `history-delivery/*` | Với WDP chấp nhận được (đúng, bền); nếu cần gọn: bỏ version/hash, chỉ ghi snapshot cuối |
| B5 | Required (dữ liệu) | Document Mongo chứa tên người và lý do (dữ liệu cá nhân). Dev dùng **Atlas endpoint công khai**; ADR tự ràng buộc chỉ dữ liệu giả lập và allowlist IP, nhưng không có gì trong code chặn. Nếu thiếu quyền `createCollection` thì collection được tạo **không có validator**, chỉ log cảnh báo | ADR `0020...md:54-58`; `invocation-history-store.repo.ts:276-289` | Ghi vào README vận hành: chỉ dữ liệu giả lập trên Atlas, user Mongo tách quyền |
| B6 | Nit | Script smoke nhúng mật khẩu thẳng vào chuỗi JSON (vỡ khi mật khẩu có `"`), token nằm trên argv của `curl`; bật hai công tắc AI ở môi trường đích | `scripts/ai-gateway-smoke.sh:141,166,148-160` | Dùng `jq -n --arg`; chỉ chạy ở dev |
| B7 | Nit | Thứ tự import lệch nhóm | `src/worker/worker.module.ts:9` | — |
| B8 | FYI | `AI_PROVIDER_MODE` (`QĐ-102f`) chưa có | `grep AI_PROVIDER_MODE src` rỗng ở cả WDP và SEP | Làm ở SEP trước |

Bảo mật khác (đạt): filter Mongo chỉ dựng từ UUID đã kiểm và `organizationId` từ PG — không có NoSQL injection
(`invocation-content-query.service.ts:19,76`; `store.repo.ts:222-227`); lỗi driver không lộ URI/host (`store.repo.ts:100-103`,
`mongodb-infrastructure.module.ts:45-50`); log của worker chỉ id và mã (`history-delivery.service.ts:136,142-145`); payload outbox
bị xóa khi ACK hoặc purge (`outbox.repo.ts:244-261,272-285`). Không có secret trong diff.

Chất lượng code: cao — comment giải thích lý do, phân tách policy/repo/service, xử lý race (crossed writes, lease lost, purge
giữa chừng), migration có CHECK. Viết bằng AI agent (log `/figure-it-out`, `/code-review`) nên theo quy ước của Owner cần một lượt
review độc lập phần migration/raw SQL trước khi merge.

---

## (c) Đối chiếu QĐ

| QĐ | Nội dung | AI service WDP | BE WDP nhánh AI |
| --- | --- | --- | --- |
| `QĐ-102a` | Hai chỗ dùng AI: tóm tắt hàng chờ (`US-15-05`), bản nháp Finance (`US-15-06`) | Khớp `US-15-05`; **thiếu** `US-15-06` | Khớp `US-15-05`; **thiếu** `US-15-06` (SEP cũng chưa, chặn bởi `US-12-14`) |
| `QĐ-102b` | Model mở, nhóm tự vận hành, không gọi nhà cung cấp ngoài, không fallback | **Khớp** (Qwen trên Modal, không có fallback provider). GPU dự phòng A10G/L40S lệch SPEC, không lệch QĐ | Khớp: lỗi ⇒ `FAILED`, không fallback |
| `QĐ-102c` | Chỉ dữ liệu giả lập; chỉ phần người dùng được xem, đã giới hạn, không mã định danh thật | Khớp: chỉ nhận ref mờ `R001/C001` | Khớp phần gửi AI. **Rủi ro mới**: bản sao dữ liệu nằm thêm ở MongoDB/Atlas (B5) |
| `QĐ-102d` | Chạy khi người dùng bấm, gắn revision nguồn | — | Giữ nguyên (code SEP) |
| `QĐ-102e` | Hai công tắc Super Admin | — | Giữ nguyên |
| `QĐ-102f` | `AI_PROVIDER_MODE` SIMULATED/MODEL, nhãn *giả lập — không phải AI*, mặc định giả lập | **Lệch tinh thần**: chế độ stub (`AI_RUNNER=stub`, `AI_DEPLOY_GPU=0`) trả kết quả mẫu mà BE hiển thị như kết quả AI, không nhãn | **Chưa làm** (B8) |
| `QĐ-102g` | Lưu đủ lịch sử, chỉ Super Admin đọc, mỗi lần đọc có audit, không ghi nội dung vào log, xóa có kiểm soát | Không log nội dung — khớp | **Khớp** về hành vi (đọc có audit, purge có kiểm soát), nhưng nơi lưu là MongoDB |
| `QĐ-102h` | AI service riêng, stateless; dữ liệu AI trong CSDL chính; **không thêm MongoDB** | **Khớp** (stateless, không DB) | **Lệch** — thêm MongoDB (cố ý cho WDP, ADR *Proposed*) |
| `QĐ-79a` | PostgreSQL có thẩm quyền | — | Khớp (PG vẫn quyết trạng thái, đọc PG trước) |
| `QĐ-79c` | Không MongoDB hay kho phụ cho AI | — | **Lệch** |
| `QĐ-79e` | Lưu prompt/phản hồi thô, chỉ Super Admin | — | Khớp hành vi, lệch nơi lưu |
| `QĐ-69a`, `QĐ-78b` | Hai actor (trưởng phòng, Người duyệt chi), mỗi dòng ghi loại bước + dẫn Request | Khớp (`stepKind` NEED/SPEND, `sourceRef`) | Giữ nguyên |
| `QĐ-78c`, `QĐ-78d`, `QĐ-49e` | AI không tính số, không duyệt/xếp hạng/ưu tiên/rủi ro, không kết luận | Khớp: prompt quy tắc 4–7 (`access_request_queue_v1.py:40-46`) + BE kiểm đầu ra (`queue-summary-output.policy.ts`, có sẵn từ SEP) | Giữ nguyên |
| `QĐ-61f` | Chỉ dữ liệu giả lập | Bộ đánh giá dùng tên giả | Phụ thuộc kỷ luật dùng Atlas (B5) |

---

## (d) Đưa sang đồ án

SEP đã có module `ai-assist` giống hệt bản gốc của WDP và có service AI riêng (`Code/AI-module-SEP`, cấu trúc khác: có `llama.py`,
không có `front.py`). Vì vậy **không merge nhánh**, chỉ cherry-pick.

| Phần | Lấy / bỏ | Lý do | Công sức |
| --- | --- | --- | --- |
| Prompt `aqs-prompt-v4` + lịch sử lý do v1→v4 | **Lấy** | Đã qua 60 ca + 12 kịch bản trên model thật; chống prompt injection tốt hơn | 1–2 giờ chép + chạy lại eval trên runner SEP (tốn GPU) |
| `eval/datasets/queue_scenarios_v1.jsonl`, `eval/build_scenarios.py`, `eval/check_scenarios.py` | **Lấy** | Kịch bản thực tế (dữ liệu cá nhân, JSON giả, 20 bước) | 1 giờ |
| Sửa `run_eval.py` theo A1–A3 | Lấy **sau khi sửa** | Cổng đánh giá hiện có thể báo đạt sai | 2–3 giờ |
| `front.py` + `AI_DEPLOY_GPU=0` (deploy chỉ front, không cần thẻ) | Lấy nếu cần | Hữu ích để kiểm TLS/token không tốn GPU; không thay `QĐ-102f` | 1 giờ |
| `GPU_PREFERENCE` L4→A10G→L40S | Owner quyết | Lệch SPEC, rủi ro chi phí | — |
| README vận hành (xoay token, chẩn đoán "waiting to be scheduled on GPU") | Lấy | Kinh nghiệm thật | 30 phút |
| BE `scripts/ai-gateway-smoke.sh` | **Lấy, sửa** | Bỏ vòng chờ `AI.HISTORY_PENDING` ở S9; sửa B6 | 1–2 giờ |
| BE `QueueSummaryRunService.available()` | Tùy | Refactor nhỏ, không cần | — |
| BE `src/infrastructure/mongodb`, `invocation-history/*`, `history-delivery/*`, worker loop, `AiAssistHistoryFacadeModule`, migration `20261116100000_ai_history_mongodb`, `ai_invocation_results`, compose/env/package `mongodb`, harness Mongo, ADR-0020 | **Bỏ** | Trái `QĐ-102h`, `QĐ-79c`; migration xóa bảng không quay lại | 0 (không đưa vào) |
| BE thay đổi `ai-purge` (report/exit) | Bỏ | Gắn với tombstone Mongo | — |

Tổng: khoảng **0,5–1,5 ngày** (chưa kể chi phí GPU cho lượt đánh giá lại trên SEP).

---

## (e) Rủi ro merge

1. **SEP → WDP (rủi ro chính).** WDP đang kéo code từ SEP (commit `f2131ec2` "feat: add new flows" đổi 1 424 file). Nhánh AI sửa
   `queue-summary.service.ts` (constructor bỏ `AiServiceClient`, thêm `InvocationHistoryRecordService`), `queue-summary-run.service.ts`,
   `ai-assist.module.ts`, `invocation.repo.ts`, `test/support/ai-assist-fakes.ts`, `ai-summary-harness.ts`, README module và bảng
   `ai_invocations`. Đây đúng là các điểm SEP sẽ chạm khi làm `AI_PROVIDER_MODE` theo `AI-module-SEP/SPEC.md:343,382-384`
   (inject `AiServiceClients`, migration `provider_mode` + unique index trên `ai_invocations`). Migration SEP mới phải có timestamp
   **sau** `20261116100000` để không áp lệch thứ tự trên DB WDP.
2. **WDP → SEP.** Không được đưa phần Mongo sang (trái QĐ). Nếu ai đó merge nhầm: migration xóa `ai_invocation_contents` trên VPS
   đồ án, không rollback được trừ khi khôi phục backup.
3. **Nhánh AI ↔ WDP `origin/dev` hiện tại.** 15 file chạm cả hai phía: `ARCHITECTURE.md`, `docs/roadmap.md`, `openapi.json`, 9 file
   `src/generated/prisma/*`, 2 gate, `test/integration/ai-assist/queue-summary.integration-spec.ts` (dev thêm ca `paid`, nhánh AI đổi
   harness). Generated Prisma phải sinh lại, `openapi.json` phải sinh lại, không sửa tay.
4. **Không có trên SEP `origin/dev` các khác biệt ai-assist**: so blob cho thấy `src/modules/ai-assist`, `prisma/models/ai-assist.prisma`,
   `src/worker` của SEP dev và merge-base WDP giống hệt; khác nhau ở `operating-parameters` (6 file), 5 gate, 4 file infrastructure —
   nhánh AI không chạm các file `operating-parameters`, nên không xung đột trực tiếp ở đó.

---

## Bằng chứng và giới hạn

- Đã chạy: pytest AI (171 pass), ruff check/format, `eval.check_scenarios` trên dump v4 (12/12), so blob SEP↔WDP bằng
  `git ls-tree`, `gh run list` (không có lượt CI nào cho `feat/AI-services`).
- Không chạy: jest BE WDP (quy ước Owner: hỏi trước khi chạy suite BE), `pnpm typecheck/lint/arch:check` (node_modules của checkout WDP
  đang ở `dev`, chưa có `mongodb`), Modal/GPU, MongoDB.
- Số do tác giả tự báo (chưa tôi kiểm lại): 59 suite / 862 unit pass, S1–S9 PASS (local, Modal stub, Modal GPU), purge trên DB thật,
  Atlas ping/ghi/đọc/xóa — `AI-services/gateway-run-log.md` §7–9 trên `origin/main` của repo AI.
- Review trước (14/11, `Ai-service-WDP/reviews/2026-11-14/README.md`, chưa track): WDP-01..04, 06–08 vẫn còn trên `origin/main`
  (A1–A5, A8, A9 ở trên); WDP-05 (stub mang danh model) đã đỡ nhờ `front.py` trên Modal, local vẫn còn nếu đặt `MODEL_MANIFEST_PATH`.

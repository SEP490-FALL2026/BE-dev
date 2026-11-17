# Review phần AI — đồ án SEP (SaaS-Sentry) — 16/11/2026

> Chế độ: **CHỈ ĐỌC**. Không sửa code, không commit, không chạy lệnh ghi git (giả lập merge bằng `git merge-tree` dạng cũ, chỉ in ra stdout).
> Test AI service chạy trong venv riêng ở scratchpad (không cài toàn cục), dùng `-p no:cacheprovider`, `PYTHONDONTWRITEBYTECODE=1`, `--basetemp` ở scratchpad → `git status` của repo AI vẫn sạch.
> BE: chỉ phân tích tĩnh (theo quy ước *không chạy test BE khi chưa hỏi*).

## Skill đã đọc/dùng

| Skill | Vai trò | Mục đích |
| --- | --- | --- |
| `agent-skills:code-review-and-quality` | process + review (gộp; không có skill "review process" riêng nên dùng skill này cho cả quy trình 5 trục và phân loại mức độ) | Review 5 trục (đúng, dễ đọc, kiến trúc, bảo mật, hiệu năng), nhãn Critical/Required/Nit/FYI |
| `superpowers:verification-before-completion` | verification | Mọi khẳng định "chạy được/xanh" đều có lệnh và output thật trong lượt này |

## Phạm vi và mốc đã đọc

| Repo | Mốc | Ghi chú |
| --- | --- | --- |
| AI service `D:\FPT\FALL2026\Code\AI-module-SEP` (remote `SEP490-FALL2026/AI-SERVICE`) | `c5b7bf4` (merge PR #1 `Bao-dev`) | 5 commit: `1f1c83b` tài liệu (SPEC/PLAN/answer), `968e830` + `c29bc3c` code + eval (09/11), `b2c4190` "create server Azure" (16/11) |
| BE `origin/Bao_dev_be` | `501c3c08` "add AI" (09/11) trên merge `48e4386f` | merge-base với `origin/dev` = `1c41354e` (06/11); 50 tệp, +2384/−359 |
| BE `origin/dev` | `94a8ee84` (16/11) | 969 commit sau merge-base; **không** commit nào chạm `src/modules/ai-assist` hay `prisma/models/ai-assist.prisma` |
| Luật | `Docs/Decisions/project-decisions.md` | `QĐ-102a…h` (dòng 662–669), `QĐ-78a…f` (655–660), `QĐ-69a…d` (649–652), `QĐ-79b/c` (702–703), `QĐ-49e/61e/61f` |

---

## Kết luận nhanh

| Hạng mục | Đánh giá |
| --- | --- |
| AI service — code, contract, test | **Tốt, khớp SPEC ở mức code**: front FastAPI, contract v1 pydantic khớp 1-1 zod BE, prompt v1, JSON schema động, parse 3 trạng thái, ánh xạ lỗi, Modal app (download/Inference/front), bộ eval 60 ca + `validators.py` khớp danh sách cụm từ của BE. **590 test pass**, 1 fail do CRLF của môi trường, 2 skip (thiếu `modal`). Ruff sạch. |
| AI service — chạy thật | **Chưa có gì chạy trên hạ tầng thật**: chưa `modal deploy`, chưa spike T0.2, mọi hằng llama.cpp/Modal đánh dấu `UNVERIFIED`, chưa có báo cáo eval của model (chỉ dry-run stub). |
| AI service — commit "create server Azure" | **Lệch SPEC, chưa có tài liệu**: thêm `AI_RUNNER=llamacpp` (llama-server trên VM thường, CPU) mà README/SPEC/PLAN không nhắc; đổi khỏi GPU L4 là việc SPEC §14 bắt hỏi Owner. Không phạm `QĐ-102b` về nguyên tắc (máy nhóm thuê) nhưng thiếu số đo, TLS, artifact triển khai. |
| BE `Bao_dev_be` | **Chất lượng cao, đúng SPEC §6 gần như từng dòng** (PLAN Phase 1, T1.0–T1.5): `AI_PROVIDER_MODE` (mặc định `SIMULATED`), `SimulatedAiServiceClient`, `AiServiceClients.forMode`, cột `provider_mode` + unique index theo chế độ, `simulated`/`providerMode` trên API, audit, log `httpStatus/serviceCode`. Không đổi phân quyền, không mở dữ liệu mới. |
| Khớp `QĐ-102` / `QĐ-78` | Khớp ở mọi điểm thuộc phạm vi đã làm; phần chưa xong là vận hành (deploy, purge date, FE nhãn) và **toàn bộ `US-15-06`**. |
| Merge vào `dev` hiện tại | **Rủi ro trung bình, không phải ở code ai-assist**: 4 tệp xung đột văn bản (`docs/roadmap.md`, `openapi.json`, 2 spec operating-parameters), số đếm tham số lệch (24 vs 29 → 30), **tên migration `20261109100000` nhỏ hơn 108 migration đã có trên dev** (vi phạm `DB-15`, cần đổi tên trước khi merge). |

---

## (a) AI service — làm được gì, đúng SPEC/PLAN tới đâu

### Làm được (bằng chứng)

| Năng lực | SPEC | Bằng chứng | Nhận xét |
| --- | --- | --- | --- |
| Token kiểm **trước** khi đọc thân, trước GPU | §7.3 b1 | `src/ai_service/app.py:109-110`, `auth.py:15-22` (`hmac.compare_digest` trên bytes, fail-closed khi token rỗng) | Đúng; `/v1/warmup` cũng kiểm token trước (`app.py:92`) |
| Giới hạn thân 256 KB, thứ tự 400 → 409 → 413 → 400 | §7.3 b2 | `app.py:39-70`, `settings.py:7` | Đúng thứ tự spec |
| Không lọt 422 `{"detail"}` | §7.3 | `errors.py:71-73`, handler không khai báo body (`app.py:107`) | Đúng |
| Contract v1 strict | §5, §7.2 | `contract.py:55-140` so với BE `ai-service.types.ts:14-108` | Khớp từng trường/giới hạn (code point), `extra="forbid"`, `parsed ⇔ OK`, kiểm `sourceRef` trùng (thêm theo spec) |
| Context rỗng ⇒ 200 không gọi model | §7.3 b3 | `app.py:114-120` | Đúng |
| Prompt `aqs-prompt-v1` nguyên văn | §8.2 | `prompts/access_request_queue_v1.py:12-29` | Đúng nguyên văn; `promptText` = system + `\n\n` + user (`:44-48`) |
| JSON schema động `minItems = maxItems = n`, enum `sourceRef` | §8.3 | `schema.py:15-60` | Đúng; có sẵn nhánh `prefixItems` chờ T0.2 |
| Parse 3 trạng thái, không sửa đầu ra | §8.3 | `parsing.py:20-30` | Đúng |
| Ánh xạ lỗi sang mã contract | §5.4 | `errors.py:28-48`, `runner.py:154-164`, `runner.py:206-225` | Đúng; log chỉ tên loại exception |
| `max_tokens = 300n + 200`, deadline 105 s | §7.3, §7.5 | `app.py:123-128`, `settings.py:8` | Đúng |
| Modal app: Volume, `download_model` pin commit + SHA-256, `Inference` L4 `max_containers=1`, `min_containers=0`, `scaledown_window=60`, `block_network=True`, front CPU | §7.4, §9 | `modal_app.py:47-136`, `:166-192`, `:208-217`, `:364-389` | Đúng cấu hình; thêm cơ chế "retire container" khi llama-server treo/chết (`llama.py:252-272`, `modal_app.py:318-330`) — tốt |
| Không log prompt/context/answer | §7.3 b6, §10 | `app.py:155-164`; `modal_app.py:276-284` (bỏ output llama-server sau khi ready); `--log-verbosity 2`, `--no-slots` (`modal_app.py:129`) | Đúng ý đồ; log mức 2 của llama-server chưa kiểm thật |
| Không DB, không lưu dữ liệu nghiệp vụ | `QĐ-102h`, §10 | quét `src/`, `modal_app.py`: không có driver DB/kho nào; chỉ ghi GGUF/manifest vào Volume (`llama.py:112-143`) và báo cáo eval (`eval/run_eval.py:822,934`) | Stateless đúng nghĩa |
| Không gọi nhà cung cấp model bên ngoài | `QĐ-102b`, R1 | grep `openai\|gemini\|groq\|anthropic\|cloudflare` trong `src/`, `modal_app.py`, `eval/` = 0 | Đúng; mặc định runner **không** phải stub (`settings.py:32-33`) |
| Eval: 60 ca đúng cơ cấu 15/15/10/10/10, `run_eval.py` có ngưỡng §18.2, `validators.py` | §11 | `eval/datasets/queue_v1.jsonl` (đếm lại: basic 15, spend 15, large 10, numbers 10, adversarial 10); `eval/validators.py:28-200` | **Danh sách cụm từ khớp tuyệt đối với BE** (đã so tự động 10 hằng: `REJECTION_CODES` 9, `ADVICE_PHRASES` 40, `ADVISORY_WORDS` 12, `DECISION_WORDS` 13, `ASKING_WORDS` 2, `FOLDED_*` 19/4/7/2, `FORBIDDEN_CLAIM_PHRASES` 21 — đều EQUAL); `CHECK_VERSION` = `access-request-queue-summary-check-v2` khớp `OUTPUT_CHECK_VERSION` |

### Kết quả chạy test (lượt này)

```text
python 3.13.2 (venv scratchpad), deps pin: fastapi 0.162.2, pydantic 2.14.3, httpx 0.28.1, jsonschema 4.26.0, pytest 9.2.0, ruff 0.17.4
pytest -q -p no:cacheprovider --basetemp=<scratchpad>   → 1 failed, 590 passed, 2 skipped, 1 warning in 4.43s
  FAILED tests/test_dataset.py::test_file_is_utf8_lf_with_one_json_object_per_line   (b"\r" trong tệp)
  SKIPPED test_modal_config.py:281, test_modal_runner.py:356  (không có gói modal — đúng thiết kế, extra tùy chọn)
pytest tests/test_llamacpp_runner.py                       → 11 passed
ruff check --no-cache .                                    → All checks passed!
ruff format --check --no-cache .                           → 29 files already formatted
git status --short (sau khi chạy)                          → sạch
```

- Fail duy nhất là **môi trường**: `git ls-files --eol eval/datasets/queue_v1.jsonl` = `i/lf w/crlf`, `core.autocrlf=true`, repo **không có `.gitattributes`**. Hệ quả phụ: SHA-256 bộ dữ liệu mà `run_eval.py` ghi vào báo cáo sẽ khác giữa máy Windows và Linux. (Lần chạy đầu không có `--basetemp` gặp 13 `PermissionError` của thư mục tạm hệ thống — cũng là môi trường, hết khi đổi basetemp.)
- Cảnh báo: `starlette.testclient` dùng `httpx` đã deprecated (đòi `httpx2`) — rủi ro gãy khi nâng FastAPI, thấp.

### Chưa làm / chưa kiểm (theo chính README `README.md:228-243`)

| Hạng mục PLAN | Trạng thái |
| --- | --- |
| T0.1 tài khoản Modal, Spend limit $0, ảnh billing | Chưa có (`README.md:198-202` bảng chi phí trống) |
| T0.2 spike llama.cpp + Qwen3.5 trên Modal | **Chưa chạy**; mọi hằng trong khối `UNVERIFIED` (`modal_app.py:106-136`: image tag, đường dẫn binary, `--reasoning off`, `response_format` `json_object`+`schema`, `ctx-size 32768`, `block_network` có giữ loopback không) |
| T2.3 deploy, smoke `/healthz`, request 2 bước thật, token sai không đánh thức GPU | Chưa chạy |
| T3.3 eval 4B/9B, chọn model | Chưa — chỉ có `eval/reports/2026-11-09-STUB-DRY-RUN-not-model-results.*` (dán nhãn rõ "không phải kết quả model") |
| T5.1 warmup/demo, chặn mạng | Code có, chưa kiểm thật |
| 429 `BUSY` | Chưa có (spec cho phép bỏ ở bản đầu) |

### Phát hiện ở AI service

| # | Mức | Phát hiện | Bằng chứng | Đề xuất |
| --- | --- | --- | --- | --- |
| A1 | **Required** | Commit `b2c4190` "create server Azure" thêm `LlamaCppRunner` (`AI_RUNNER=llamacpp`, llama-server trên VM, không GPU) nhưng **README, SPEC, PLAN không có một dòng nào** về đường này (grep `azure\|llamacpp` trong 3 tệp chỉ ra `SPEC.md:61` — hộp BE "VPS Azure HK"). Đổi khỏi GPU L4 thuộc "Hỏi Owner trước" (`SPEC.md:758`). Nếu chạy chung VPS BE (2 vCPU/4 GB) thì trái điều kiện của `answer.md` (đo RAM/CPU/độ trễ và ảnh hưởng PostgreSQL trước) — mapping đầu `answer.md` đã ghi VPS BE **không đủ**. | `src/ai_service/settings.py:9-12,24-27,39-49`; `runner.py:251-316`; `tests/test_llamacpp_runner.py` | Owner quyết giữ/bỏ đường Azure; nếu giữ: viết mục README (nơi chạy, systemd unit, cách cài model + SHA-256, TLS/loopback, số đo latency ca 20 bước trên CPU) và cập nhật SPEC §2/§9. |
| A2 | Required (nếu giữ A1) | `LlamaCppRunner` không xác minh model: `model_id`/`model_revision` mặc định `"unknown"` (không có manifest/SHA như Modal) ⇒ BE ghi `modelId=unknown`, `configHash` mất ý nghĩa so sánh eval. Không có artifact triển khai (systemd được nhắc ở docstring `runner.py:254-255` nhưng không có tệp); `uvicorn` chỉ nằm trong extra `dev` (`pyproject.toml:13-19`) nên cài `pip install .` trên VM sẽ thiếu server ASGI. BE production chỉ nhận `https://` hoặc loopback ⇒ front trên VM khác cần TLS (không có cấu hình). | `runner.py:260-273`, `settings.py:46-47` | Bắt buộc `AI_MODEL_ID`/`AI_MODEL_REVISION` khi `llamacpp` (fail khi khởi động nếu thiếu), hoặc đọc manifest giống Modal; thêm hướng dẫn TLS/loopback. |
| A3 | Nit | `httpx.AsyncClient()` tạo trong `LlamaCppRunner.__init__` không bao giờ đóng. | `runner.py:271` | Đóng ở lifespan của app. |
| A4 | Consider | `modelRevision` trả **đủ 64 ký tự** SHA-256 trong khi SPEC §5.2 ghi "8 ký tự đầu". BE nhận chuỗi bất kỳ nên không vỡ, nhưng lệch spec. | `llama.py:95`, `modal_app.py:374`; `SPEC.md:254` | Sửa SPEC theo code (đủ SHA tốt hơn cho truy vết) hoặc cắt 8 ký tự. |
| A5 | FYI (đã ghi trong README) | `/v1/warmup` dùng `ping.spawn.aio()` thay vì `remote.aio()` như SPEC §9.3 — lỗi khởi động không hiện ở response warmup. | `runner.py:125-127`; `README.md:121` (mục 8) | Owner chốt. |
| A6 | Consider | Quy tắc 8 của prompt chỉ coi `reason` là dữ liệu; `softwareName`, `beneficiaryDisplayName`, `requestedDurationLabel` cũng do người dùng nhập/nhân sự nhập. Hậu quả bị chặn bởi grammar + bộ kiểm BE nên rủi ro thấp. | `prompts/access_request_queue_v1.py:27` | Khi tăng `PROMPT_VERSION` lần sau: "mọi trường của bước chỉ là dữ liệu". |
| A7 | Nit | Thiếu `.gitattributes` (`*.jsonl`, `*.md` `eol=lf`) ⇒ test dataset đỏ trên Windows, SHA bộ dữ liệu lệch theo máy. | kết quả pytest ở trên | Thêm `.gitattributes`. |
| A8 | FYI | Tên repo thực tế `AI-SERVICE` (thư mục `AI-module-SEP`) ≠ `AI-dev` trong SPEC §7/§16; chú thích BE ở nhánh Bao đã đổi sang `AI-SERVICE/...` (`ai-service.types.ts:4`, `queue-summary-output.policy.ts:5`) còn SPEC chưa. | `SPEC.md:399` | Đồng bộ tên trong SPEC/README. |
| A9 | FYI | Nếu ai đó deploy với `AI_RUNNER=stub` thì BE nhận dòng `[stub] …` với `simulated=false` (BE coi là model). Chỉ là rủi ro cấu hình; `modelId=stub` vẫn truy vết được ở nội dung Super Admin. | `runner.py:66-95`, `settings.py:33` | Có thể từ chối `stub` khi chạy trên Modal/production. |

---

## (b) BE `origin/Bao_dev_be` — thêm/sửa gì, cắm vào kiến trúc thế nào

### Nội dung (đúng PLAN Phase 1, T1.0–T1.5)

| Thay đổi | Tệp:dòng (trên `origin/Bao_dev_be`) | Khớp SPEC |
| --- | --- | --- |
| Tham số `AI_PROVIDER_MODE` enum `SIMULATED\|MODEL`, mặc định `SIMULATED`, nhóm `AI`, nhãn VN | `src/modules/operating-parameters/parameter-definitions.policy.ts:347-362` | §6.1 nguyên văn |
| `SimulatedAiServiceClient` (chờ 1,5 s, hủy ⇒ `AiServiceUnavailableError(null,null)`, `configured()=true`) | `src/modules/ai-assist/ai-service/ai-service-simulated-client.service.ts:7,34-52` | §6.2 |
| Policy thuần dựng câu mẫu, cắt lý do chỉ ở khoảng trắng, ≤ 400 code point | `ai-service/ai-service-simulated.policy.ts:34-104` | §6.2 (đi qua `validateQueueSummary` — test `ai-service-simulated.policy.spec.ts:1,36,104-189`) |
| `AiServiceClients.forMode` — giữ token DI `AiServiceClient` = HTTP | `ai-service/ai-service-clients.service.ts:10-20`; đăng ký `ai-assist.module.ts:40-41` | §6.3 "một đường" |
| Đọc chế độ khi tạo lần gọi; giá trị lạ ⇒ `SIMULATED` + WARN (không log giá trị) | `queue-summary/queue-summary.service.ts:80-81,155-163` | §6.3 |
| Lần gọi chạy theo chế độ **lúc tạo**, không đọc lại tham số; lỗi không bao giờ chuyển sang giả lập | `queue-summary/queue-summary-run.service.ts:147,157` | §6.3, `QĐ-102b` |
| Log vận hành `httpStatus=… serviceCode=…` (không thân) | `queue-summary-run.service.ts:239` | §6.4 |
| Cột `provider_mode` (enum, default chỉ để lấp hàng cũ rồi DROP), unique index thêm cột chế độ, giữ nguyên `WHERE` | `prisma/migrations/20261109100000_ai_provider_mode/migration.sql:1-16`; `prisma/models/ai-assist.prisma` (+`enum AiProviderMode`, field không `@default`) | §6.3 SQL nguyên văn, đã Owner đồng ý 07/11 theo SPEC |
| Repo: `whose` thêm `providerMode` tường minh; `ownedBy` cho `stuckOf` (mọi chế độ), `stuckOf` trả `{id, providerMode}`; content repo select `providerMode` | `invocation/invocation.repo.ts` (hunk `@@ -38,13` … `@@ -163`), `invocation/invocation.types.ts` (`InvocationOwner`, `InvocationKey`, `StuckInvocation`) | §6.3 bảng chỗ chạm — đủ mọi dòng |
| API: `simulated` trên `GET` tóm tắt; `providerMode` trên nội dung Super Admin; OpenAPI xuất lại | `queue-summary/queue-summary-view.policy.ts:22`, `queue-summary.dto.ts` (+`simulated`), `invocation-content.dto.ts` (+`providerMode`), `openapi.json` | §6.4 |
| Audit `AI_INVOCATION.REQUESTED\|COMPLETED\|FAILED` có `providerMode` (kể cả FAILED do kẹt — lấy chế độ của chính lần gọi kẹt) | `queue-summary/queue-summary-audit-event.mapper.ts` (`summaryRequestedEvent`, `summaryEndedEvent`, `summaryFailedEvent`) | §6.4 |
| Test: unit (policy, client, clients, provider-mode service 301 dòng), HTTP (2 spec), integration (schema/index, provider-mode, failures, harness mặc định `MODEL`) | danh sách `git diff --stat` 50 tệp | §13 |
| Hạng mục làm việc + roadmap | `docs/workspace/items/ai-provider-mode/{spec,plan}.md`, `docs/roadmap.md` | T1.0 |
| `.env.example` chỉ thêm chú thích `AI_SERVICE_TIMEOUT_MS=120000` khi nối Modal | `.env.example:134-136` | §9.4 |

### Kiến trúc / luật repo

- **Đúng tầng, đúng module**: mọi thay đổi nằm trong `ai-assist` (+ một định nghĩa ở `operating-parameters`, đọc qua `OperatingParametersApi.getValue` — facade public đã có, còn nguyên trên `dev`). Không thêm export, không thêm phụ thuộc module mới, không chạm `module-graph`/`capability-graph`. Tên tệp theo `module-structure` (`ai-service-simulated-client.service.ts`, `ai-service-simulated.policy.ts`, `ai-service-clients.service.ts`).
- **Migration**: SQL viết tay theo ADR-0005 cho index một phần; bỏ default ngay sau khi lấp hàng cũ — đúng, insert quên chế độ sẽ lỗi thay vì âm thầm thành `MODEL`.
- **Gate kích thước test** (`test/gates/test-size.gate-spec.ts:11`, 800 dòng): tệp lớn nhất của nhánh 404 dòng; sau merge `operating-parameters-http.integration-spec.ts` ≈ 640 + 44 < 800 — qua.
- **Bằng chứng kiểm của tác giả** (`docs/workspace/items/ai-provider-mode/plan.md:114-135`, trên nền cũ `48e4386f`): typecheck/lint/arch:check (0 vi phạm, 1817 module)/test:gates (330 pass)/unit ai-assist 263 pass/integration ai-assist 98 pass/HTTP 58 pass; đỏ còn lại ghi là môi trường (Node 24 + đường dẫn không ASCII, CRLF, worktree cũ). **Tôi không chạy lại** (không chạy test BE khi chưa hỏi); kết quả này **không còn giá trị trên `dev` hiện tại**.

### Chất lượng, bảo mật, phân quyền

| # | Mức | Phát hiện | Bằng chứng |
| --- | --- | --- | --- |
| B1 | FYI (tốt) | Mặc định an toàn: không cấu hình gì ⇒ `SIMULATED` ⇒ BE không gửi dữ liệu ra ngoài. Giá trị lạ cũng rơi về `SIMULATED`. | `queue-summary.service.ts:155-163` |
| B2 | FYI (tốt) | Không fallback: `forMode` chọn theo chế độ đã ghi trong job; lỗi của `MODEL` ⇒ `FAILED`, có test AC-17. | `queue-summary-run.service.ts:145-158`; `queue-summary-provider-mode.integration-spec.ts:95` |
| B3 | FYI (tốt) | Bảo mật/log: client giả lập không log nội dung; log chỉ thêm mã HTTP và mã contract đã lọc; không thêm secret mới; token vẫn chỉ ở `.env`. | `ai-service-simulated-client.service.ts:19-23`; `queue-summary-run.service.ts:236-244` |
| B4 | FYI | Phân quyền không đổi: đổi `AI_PROVIDER_MODE` qua route tham số vận hành có sẵn (Super Admin, có Audit Trail) — test khẳng định IT Admin bị 403; route nội dung vẫn chỉ Super Admin. | integration `operating-parameters-http` ca mới (`setParameter(key,'MODEL', as(it1)).expect(403)`) |
| B5 | FYI | Dữ liệu cá nhân: context gửi model **không mở rộng** (vẫn `R001/C001`, tên hiển thị người thụ hưởng, tên phần mềm, lý do, nhãn thời hạn) — đúng `QĐ-102c`/`QĐ-78c`. Tên người thật vẫn đi tới model/Modal, chấp nhận được vì phạm vi chỉ dữ liệu demo. | BE `queue-summary-context.policy.ts` (không đổi) |
| B6 | Nit | Trạng thái trong plan/roadmap của nhánh còn ghi "chưa commit, chưa PR" dù đã commit `501c3c08`. | `docs/workspace/items/ai-provider-mode/plan.md:8-11` |
| B7 | Nit | `docs/roadmap.md` bị **định dạng lại cả bảng** (độ rộng cột) — diff 477 dòng cho ~2 dòng nội dung mới, gây xung đột lớn. | `git diff 1c41354e origin/Bao_dev_be -- docs/roadmap.md` |
| B8 | Nit | `api-collection-registry-exceptions.ts`: `maxItems` 22 → 24 trên nhánh, nhưng `dev` đã có 29 tham số (vẫn ghi 22) ⇒ sau merge là 30; số trong registry đã sai từ trước trên `dev`. | `test/support/api-collection-registry-exceptions.ts:81` (dev) |

### Contract BE ↔ AI

- Request/response zod (`ai-service.types.ts:14-108` trên `dev`) ↔ pydantic (`contract.py:59-140`): **khớp** tên trường, kiểu, giới hạn 120/120/1000/60/400 code point, regex `R\d{3}`/`C\d{3}`, `locale vi|en`, `parsed ⇔ OK`, `usage` số nguyên ≥ 0. Danh sách mã lỗi `SERVICE_ERROR_CODES` ↔ `errors.py:17-26` khớp 8 mã.
- Retry: BE thử lại 429/500/503 sau 2 s, 504 không thử (`ai-service-client.service.ts:18-21,154`) ↔ AI trả 503 `MODEL_LOADING` khi container lỗi/không lên, 504 khi quá 105 s — khớp §5.4.
- Chuỗi hạn: 100 s (GPU httpx, `modal_app.py:66`) < 105 s (front) < 120 s (BE **chỉ khi** `.env` đặt `AI_SERVICE_TIMEOUT_MS=120000`; mặc định BE là 90 000 ⇒ ca lạnh sẽ hết giờ ở BE). Việc này chỉ là chú thích ở `.env.example:134-136`, chưa cấu hình VPS.
- Lệch nhỏ: `modelRevision` 64 ký tự (A4).

---

## (c) Đối chiếu từng điểm `QĐ-102` / `QĐ-78` / `QĐ-69`

| QĐ | Yêu cầu | Trạng thái | Bằng chứng / ghi chú |
| --- | --- | --- | --- |
| `QĐ-102a` | AI chỉ rút ngắn đọc/viết ở 2 chỗ (US-15-05, US-15-06), không quyết | Khớp phần US-15-05; US-15-06 **chưa có** | Không có route/feature narrative ở cả hai repo (`invocation.types.ts:4` trên dev: "finance narrative is not one yet") |
| `QĐ-102b` | Model mã nguồn mở tự vận hành trên máy nhóm thuê; không gửi tới API nhà cung cấp; không tự chuyển khi lỗi | **Khớp** | Qwen3.5 GGUF apache-2.0 pin SHA (`modal_app.py:85-100`); không SDK nhà cung cấp; BE không fallback (`queue-summary-run.service.ts:145-158`); AI không fallback sang stub (`settings.py:32-33`). Đường Azure CPU (A1) vẫn là "máy nhóm thuê" nhưng chưa được Owner duyệt/ghi spec |
| `QĐ-102c` | Chỉ dữ liệu demo; chỉ phần người dùng được xem, giới hạn, không mã định danh thật; dịch vụ AI không đọc CSDL | **Khớp ở code**; phần "chỉ dữ liệu demo" là **quy trình vận hành**, không có chốt kỹ thuật | Context không đổi; AI service không có DB. Không có cơ chế chặn `MODEL` trên môi trường dữ liệu thật — dựa vào SPEC §10 |
| `QĐ-102d` | Chạy khi người dùng bấm; gắn phiên bản nguồn, báo cũ | BE **khớp** (POST + `queueRevision`, `sourceStale`); FE **chưa có màn** | FE-web chỉ có client sinh tự động `app/shared/api/generated/operations/ai-assist/*`, không có component dùng |
| `QĐ-102e` | Công tắc tổng + công tắc tính năng; tắt ⇒ không kết quả (kể cả giả lập); có audit | **Khớp** | `requireSwitchedOn()` trước khi đọc chế độ (`queue-summary.service.ts:79-81`); test "OFF ⇒ 403 cả hai chế độ" (plan.md T1.4) |
| `QĐ-102f` | Chọn *model AI*/*giả lập*, mặc định giả lập, nhãn ở **mọi nơi hiển thị**, qua cùng bước kiểm, không thay "AI tắt", model lỗi không chuyển giả lập | BE **khớp đủ**; "nhãn ở mọi nơi" phụ thuộc FE (chưa có) | `parameter-definitions.policy.ts:347-362`; `simulated` (`queue-summary-view.policy.ts:22`); `providerMode` ở nội dung + audit; câu giả lập đi qua `validateQueueSummary` |
| `QĐ-102g` | Lưu đủ để kiểm, chỉ Super Admin đọc, audit siêu dữ liệu, purge có kiểm soát sau nghiệm thu | Khớp (phần có từ trước + `providerMode`); **ngày purge và lệnh VPS chưa điền** | `README.md:210-226` (AI repo) dòng lệnh để trống `____`; bản nháp Finance nhiều phiên — chưa có (US-15-06) |
| `QĐ-102h` / `QĐ-79b,c` | Hai phần: module BE + dịch vụ riêng ở repo riêng, stateless; PostgreSQL, không MongoDB | **Khớp** | Repo `AI-SERVICE` riêng; không DB ở AI; BE chỉ thêm enum/cột trong PostgreSQL |
| Contract v1 zod ↔ pydantic | Khớp 1-1 | **Khớp** | Mục (b) — Contract |
| `AI_PROVIDER_MODE SIMULATED\|MODEL` | | **Khớp** (BE nhánh Bao) | |
| `QĐ-78b` | Một Story cho trưởng phòng + Người duyệt chi, mỗi dòng ghi loại bước, dẫn đúng Request | Có từ trước trên BE (không do nhánh này) | `stepKind NEED_APPROVAL\|SPEND_APPROVAL`; nhánh không đổi phạm vi actor |
| `QĐ-78c` | Chỉ dữ liệu actor được xem; chi phí do BE render (AI không tính số); không duyệt/xếp hạng/ưu tiên/SLA; chỉ web | **Khớp** | Prompt quy tắc 3–7 (`access_request_queue_v1.py:20-26`); placeholder `{{cost:Cxxx}}` BE chèn; bộ kiểm BE + `validators.py` khớp; câu giả lập cũng qua bộ kiểm |
| `QĐ-78d` | Không gia hạn/hồ sơ/khuyến nghị/điểm rủi ro | **Khớp** | Không có tính năng nào ngoài tóm tắt |
| `QĐ-69a,b,c` | Chỉ US-15-05/06; không US-15-01/07/08; không RAG/chatbot | **Khớp** | Không có thêm endpoint nào ngoài summary/warmup/healthz |

---

## (d) Còn thiếu để xong end-to-end

### `US-15-05` (theo SPEC §15 "Đợt 1")

1. **Merge nhánh BE vào `dev`** sau khi xử lý mục (e); chạy đủ job CI trên kết quả merge (typecheck, lint, arch, gates, unit, HTTP, integration, drift Prisma, openapi export).
2. **T0.1/T0.2 trên Modal**: tạo workspace nhóm, Spend limit $0, Secret `saas-sentry-ai`, `download_model`, `modal deploy`; xác nhận toàn bộ khối `UNVERIFIED` (`modal_app.py:106-136`), đặc biệt `response_format` có ép `enum/minItems/maxItems/maxLength`, `--reasoning off`, `block_network` + loopback, thời gian khởi động lạnh < 105 s.
3. **Hoặc** chốt đường Azure (A1/A2) bằng quyết định Owner + spec + số đo; hiện có hai đường triển khai mà chỉ một có tài liệu.
4. **T3.3 eval thật** 4B (và 9B nếu cần) theo §18.2, đọc tay 10 ca đối kháng, Owner chọn model, ghi vào README.
5. **Cấu hình VPS BE**: `AI_SERVICE_BASE_URL` (https), `AI_SERVICE_TOKEN`, `AI_SERVICE_TIMEOUT_MS=120000`; Super Admin bật hai công tắc + chọn `MODEL`.
6. **FE**: màn tóm tắt trên hàng đợi `US-05-04` và `US-06-01` (nút chỉ khi `source` 200 + `stepCount>0`, poll 2–3 s, link theo `stepKind`, `omittedCount`, `sourceStale`, nhãn **"Giả lập — không phải AI"** khi `simulated`), select `AI_PROVIDER_MODE` trong màn tham số; regen client sau OpenAPI mới (FE hiện chỉ có client sinh tự động của bản cũ, chưa có `simulated`).
7. **E2E thủ công hai chế độ** (SPEC §13 dòng cuối), ghi `latencyMs` và ảnh.
8. **Vận hành**: ngày purge + lệnh VPS (`README.md:216`), bảng chi phí tuần đầu, runbook có người thứ hai làm thử.

### `US-15-06` (Finance — bản nháp diễn giải)

**Chưa có gì ở cả hai repo.** SPEC chỉ có hướng (`SPEC.md:517-523`): route `POST /v1/narratives/cost-report`, mã `M001…` + placeholder `{{metric:Mxxx}}`, feature `COST_REPORT_NARRATIVE`, công tắc `AI_FINANCE_NARRATIVE_ENABLED` (đang ghim *chưa tồn tại* ở `parameter-definitions.policy.spec.ts:328` trên dev), lưu bản nháp nhiều phiên tách bản AI gốc/bản Finance sửa, lỗi thời khi nguồn đổi (`QĐ-102g`). Cần:

1. Gỡ chặn: `US-12-14` khép kỳ — roadmap dev ghi `qd103-period-cost-close` **blocked chờ Owner (Q-160)**; `dev` đã có `budgets/review/*` (`budget-review-snapshot.service.ts`…) của `SBF-11` có thể là nguồn snapshot số liệu — cần spec xác định nguồn và "phiên bản báo cáo".
2. Spec riêng (contract v1 route mới, prompt `crn-prompt-v1`, schema, bộ kiểm số liệu tương đương `queue-summary-output.policy`), bảng lưu bản nháp/phiên bản, migration, quyền Finance, audit, giả lập, FE màn sửa/phát hành, eval riêng.

---

## (e) Rủi ro merge vào `dev` hiện tại

Giả lập: `git merge-tree 1c41354e origin/dev origin/Bao_dev_be` (dạng cũ, không ghi object).

| # | Mức | Rủi ro | Chi tiết | Cách xử lý |
| --- | --- | --- | --- | --- |
| M1 | **Required** | **Tên migration sai thứ tự** | `20261109100000_ai_provider_mode` nhỏ hơn **108** migration đã có trên `dev` (mới nhất `20261113102700_pl2_group_need_return`). `docs/rules/database-business.md` (`DB-15`) bắt tên "lớn hơn migration cuối đã merge". Gate `migration-order` có thể **không** bắt (danh sách `scripts/verify/merged-migrations.txt` trên dev dừng ở `20261028110000`), nhưng môi trường đã áp các migration 13/11 sẽ áp migration 09/11 ngược thứ tự. Không migration nào trên dev chạm `ai_invocations` nên SQL tự thân vẫn đúng. | Đổi tên thư mục thành timestamp > `20261113102700` (migration chưa từng merge nên đổi tên an toàn). |
| M2 | Required | Xung đột văn bản 4 tệp | `docs/roadmap.md` (3 khối, do định dạng lại cả bảng — B7); `openapi.json` (4 khối); `parameter-definitions.policy.spec.ts` (2 khối: tiêu đề "twenty-four" vs "twenty-nine" và ca mới chèn trước ca API-DOC-F07 đã đổi tiêu đề trên dev); `operating-parameters-http.integration-spec.ts` (2 khối: ca mới chồng ca QĐ-104e(1) của dev; `parameters.size` 24 vs 29). | Roadmap: lấy bản `dev`, chỉ chèn lại dòng `ai-provider-mode` + dòng lịch sử AC-16/17. `openapi.json`: **không sửa tay**, xuất lại sau merge. Spec: giữ cả ca của dev lẫn ca mới, số đếm thành **30** ("thirty"), `parameters.size` = 30. |
| M3 | Required | Số đếm/ngữ nghĩa sau merge tự động | `EXPECTED_KEYS` tự gộp đúng (dev giữ `AI_ACCESS_REQUEST_SUMMARY_ENABLED` cuối danh sách, `parameter-definitions.policy.ts:414` trên dev) nhưng các chú thích/tiêu đề số lượng phải sửa tay; `api-collection-registry-exceptions.ts` gộp thành `maxItems: 24` trong khi thực tế 30 (B8). | Sửa số; chạy lại gate `api-collection-contract`. |
| M4 | Medium | Kết quả kiểm của tác giả đã cũ | Mọi số xanh trong `plan.md` là trên nền 06/11; `dev` đã thêm 969 commit (operating-parameters bỏ `holdValue`, extension points; gates `module-graph`, `architecture-boundaries`, `policy-ownership` đổi). Đã kiểm tĩnh: `OperatingParametersApi.getValue`, helper test (`auditFor`, `setParameter`, `errorOf`, `as`, `it1`) còn trên dev; `ai-summary-harness.ts` của dev chỉ đổi 1 dòng không liên quan. | Chạy đủ CI sau merge (không suy từ kết quả cũ). |
| M5 | Low | Tệp tự gộp không xung đột nhưng cần đọc lại | `docs/workspace/items/README.md`, `test/support/ai-assist-fakes.ts`, `test/support/ai-summary-harness.ts` (harness nay `PUT AI_PROVIDER_MODE=MODEL` khi `start()` — mọi spec dùng harness trên dev, kể cả `queue-summary-approver.integration-spec.ts` mới sửa trên dev, sẽ chạy ở `MODEL` như trước). | Không cần sửa; xác nhận bằng integration ai-assist. |
| M6 | Low | Quy trình | Plan ghi "Owner review: chưa review; peer review: chưa có" (`plan.md:6-7`); trạng thái tài liệu cũ (B6). | Owner review trước khi merge; cập nhật trạng thái. |

**Đánh giá chung về merge:** phần code `ai-assist` sẽ gộp sạch vì `dev` không chạm module này kể từ merge-base; công sức chủ yếu là M1 (đổi tên migration), M2–M3 (tài liệu, OpenAPI, số đếm test) và một lượt CI đầy đủ.

---

## Lệnh đã dùng (tái lập)

```bash
# AI service
git -C D:/FPT/FALL2026/Code/AI-module-SEP log --stat
python -m venv <scratchpad>/aivenv && <venv>/python -m pip install fastapi==0.162.2 pydantic==2.14.3 httpx==0.28.1 jsonschema==4.26.0 pytest==9.2.0 ruff==0.17.4
PYTHONDONTWRITEBYTECODE=1 <venv>/python -m pytest -q -p no:cacheprovider --basetemp=<scratchpad>/pt -rs
<venv>/python -m ruff check --no-cache . ; <venv>/python -m ruff format --check --no-cache .
git ls-files --eol eval/datasets/queue_v1.jsonl
# BE
git log --oneline origin/dev..origin/Bao_dev_be
git diff --stat 1c41354e origin/Bao_dev_be
git log --oneline 1c41354e..origin/dev -- src/modules/ai-assist        # rỗng
git merge-tree 1c41354e origin/dev origin/Bao_dev_be                   # dạng cũ, chỉ stdout
git ls-tree --name-only origin/dev prisma/migrations/ | sort | tail
git show origin/dev:scripts/verify/merged-migrations.txt | tail -3
```

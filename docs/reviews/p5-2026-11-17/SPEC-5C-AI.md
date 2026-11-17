# SPEC + PLAN 5c — AI (US-15-05): merge `Bao_dev_be`, port lưu lịch sử AI, AI service lấy từ WDP

> Viết 16/11/2026 cho chat code **C** (Sonnet), chạy song song A1/A2/B (`PLAN.md`). **Sửa 17/11 theo `REVIEW-SPECS.md`:** 5C-1 (timestamp
> migration cấp trước `20261117120000`), 5C-2 (diff OpenAPI so nhánh đích), số đếm tham số không ghi cứng (quy tắc chung FX-1). Thứ tự merge
> A2 → A1 → **C** → B; phạm vi trong prompt 5 = **bản gọn ≈ 6,75 giờ** (B-Ước lượng; Review 2 sửa từ 5,5 — cộng sai + dựng `.venv`).
> **Review 2 (17/11):** tên cũ ở `ai-assist/README.md:28`, prettier cho bảng roadmap, mock cũ ở `ai-purge.api.spec.ts`, diff OpenAPI đúng
> thực tế, dựng `.venv` repo AI, tệp tự gộp cần đọc lại; 5C-Q1/Q2/Q3 = A đã chốt (spec viết theo A, không đổi). Chỉ đọc khi viết: không sửa code, không lệnh ghi git.
> Ngoại lệ phải khai: một lần chạy `git merge-tree --write-tree origin/dev origin/Bao_dev_be` đã ghi object tree/blob
> **không tham chiếu** vào kho object của repo BE (không đổi ref, index, worktree; `git gc` dọn). Lần sau dùng dạng cũ
> `git merge-tree <base> <a> <b>` (không ghi gì).

## Skill đã đọc/dùng

| Skill | Vai trò | Mục đích |
| --- | --- | --- |
| `agent-skills:spec-driven-development` | process | Khung spec: mục tiêu, lệnh, ranh giới, điều kiện xong, câu hỏi mở |
| `agent-skills:planning-and-task-breakdown` | process | Chia task ≤ 5 file, thứ tự phụ thuộc, checkpoint, song song |
| `agent-skills:api-and-interface-design` | domain | Hợp đồng port `AiInvocationHistoryStore` (contract-first, thêm không phá) |
| `superpowers:verification-before-completion` | verification | Mọi khẳng định trong file có lệnh/đường dẫn đã chạy trong lượt này; cái chưa kiểm ghi rõ |

## 0. Mốc và nguồn

| Mục | Giá trị |
| --- | --- |
| BE đích | `dev` @ `94a8ee84`; nhánh AI `origin/Bao_dev_be` @ `501c3c08`, merge-base `1c41354e` |
| AI service đồ án | `D:\FPT\FALL2026\Code\AI-module-SEP` (`SEP490-FALL2026/AI-SERVICE`), `main` @ `c5b7bf4`, sạch |
| AI service WDP | `D:\FPT\FALL2026\Code\Ai-service-WDP` `origin/main` @ `9da11e1` (lịch sử **không chung** với SEP ⇒ "cherry-pick" = chép file, không `git cherry-pick`) |
| BE WDP (đối chiếu port) | `D:\FPT\FALL2026\Code\BE-WDP` `origin/feat/AI-services` @ `1aa0c218` |
| Luật | `QĐ-102a…h` (`project-decisions.md:662-669`), `QĐ-78b/c/d` (656-658), `QĐ-69a…d` (649-652), `QĐ-79a/c` (701, 703), `QĐ-61f` (647) |
| Review đầu vào | `verify-logs/ai-review/SEP.md` (M1–M6, A1–A9, B1–B8), `WDP.md` (A1–A10) |

Số dòng `src/modules/ai-assist/**` dưới đây là trên `origin/Bao_dev_be`; `dev` không chạm module này từ merge-base
(`git log 1c41354e..origin/dev -- src/modules/ai-assist` rỗng) nên sau merge số dòng giữ nguyên.

---

# PHẦN A — SPEC

## A1. BE: merge `origin/Bao_dev_be` vào nhánh từ `dev`

**Mục tiêu.** Đưa `AI_PROVIDER_MODE` (QĐ-102f) lên `dev` không đổi hành vi nào khác. Nhánh làm việc: `feat/p5-c-ai` từ `dev`.

**Xung đột thật** (`git merge-tree --write-tree origin/dev origin/Bao_dev_be`, chiến lược ort — khác review SEP.md ghi 4 tệp
theo dạng cũ): **3 tệp xung đột**, `openapi.json` **tự gộp** nhưng vẫn phải xuất lại.

| Tệp | Khối | Cách giải |
| --- | --- | --- |
| `docs/roadmap.md` | 3 (dòng ~165–620, ~1386, ~1403–1624 trong cây gộp) — do nhánh Bao định dạng lại cả bảng (B7) | Lấy **nguyên bản `dev`**, chỉ chèn lại dòng hạng mục `ai-provider-mode` và dòng lịch sử AC-16/AC-17; không đổi độ rộng cột |
| `src/modules/operating-parameters/parameter-definitions.policy.spec.ts` | 2: tiêu đề "twenty-nine" vs "twenty-four" (dòng 172); ca `AI_PROVIDER_MODE` chèn trước ca `API-DOC-F07` (dòng 347) | Giữ **cả hai** ca; tiêu đề đếm theo số khóa thực của `PARAMETER_DEFINITIONS` **trên nhánh C** (quy tắc số đếm, M3) |
| `test/integration/operating-parameters/operating-parameters-http.integration-spec.ts` | 2: ca QĐ-104e(1) của dev vs ca `AI_PROVIDER_MODE` (dòng 383–455); `parameters.size` 29 vs 24 (dòng 468) | Giữ cả hai ca; `toBe(<số khóa thực trên nhánh C>)` và thêm một dòng vào chú thích đếm ("then AI_PROVIDER_MODE, QĐ-102f") |
| `openapi.json` | tự gộp | Không sửa tay: `pnpm openapi:export` sau khi giải xong, diff chỉ có `simulated` (GET tóm tắt) và `providerMode` (nội dung) |

Review 2: dạng cũ `git merge-tree 1c41354e origin/dev origin/Bao_dev_be` (không ghi object) còn báo `openapi.json` xung đột 4 khối; nếu
`git merge` của chat báo xung đột ở tệp này thì lấy bản nào cũng được rồi `pnpm openapi:export`. Các tệp **sửa ở cả hai phía nhưng tự gộp**
(dễ lệch nghĩa, phải đọc lại sau merge): `parameter-definitions.policy.ts`, `api-collection-registry-exceptions.ts` (gộp ra `maxItems: 24`, xem
M3), `test/integration/ai-assist/queue-summary.integration-spec.ts`, `test/support/ai-summary-harness.ts`, `docs/workspace/items/README.md`.

Review 2 — định dạng Markdown: `pnpm rules:format` (`prettier --check`) phủ `docs/roadmap.md`, `docs/workspace/**/*.md` và
`src/modules/*/README.md`. Bảng của `docs/roadmap.md` được prettier canh cột, nên chèn dòng có ô rộng hơn cột hiện tại sẽ làm `rules:format`
đỏ. Sau khi chèn: `pnpm exec prettier --write docs/roadmap.md docs/workspace/items/README.md docs/workspace/items/ai-provider-mode/*.md`;
chấp nhận việc **chỉ những bảng chứa dòng mới** được canh lại (không định dạng lại cả tệp như nhánh Bao, B7), rồi `pnpm rules:format` phải xanh.

Đã kiểm trên cây gộp: `EXPECTED_KEYS` tự gộp đúng (`AI_ACCESS_REQUEST_SUMMARY_ENABLED`, `AI_PROVIDER_MODE` cuối nhóm AI),
`parameter-definitions.policy.ts` gộp ra 30 khóa **trên nền `dev`** (C: +1). Số cuối sau khi A1/A2 merge do chat điều phối tính lại.

**M1 — đổi tên migration (bắt buộc, `DB-15`).** `prisma/migrations/20261109100000_ai_provider_mode` nhỏ hơn migration mới nhất của
`dev` (`20261113102700_pl2_group_need_return`; dev có 275 thư mục). Gate `test/gates/migration-order.gate-spec.ts` **không bắt**
vì `scripts/verify/merged-migrations.txt` dừng ở `20261028110000` (113 dòng) — đúng luật thì phải đổi tên dù gate xanh.
- Đổi thành **`20261117120000_ai_provider_mode`** — timestamp **cấp trước** (review 5C-1, `PLAN.md` §3): A2 dùng `20261117100000`–`…100900`,
  A1 `…110000`–`…110900`, C `…120000`, B `…130000`+. Thứ tự merge A2 → A1 → C → B nên tên này lớn hơn mọi migration của A1/A2 và lớn hơn
  `20261116100000` (migration Mongo của WDP, để sau này SEP→WDP không áp lệch thứ tự, WDP.md (e)1). Nếu thứ tự merge đổi và C merge trước một
  nhánh có migration lớn hơn, **bên merge sau** mà tên nhỏ hơn thì đổi tên (migration chưa merge nên đổi an toàn); trước khi merge vẫn kiểm
  `ls prisma/migrations | sort | tail -1` của nhánh đích.
- Không sửa nội dung SQL (`migration.sql:1-16`). Không thêm dòng vào `merged-migrations.txt` (việc của lượt phát hành).
- Sửa mọi chỗ nhắc tên cũ: `docs/workspace/items/ai-provider-mode/{spec,plan}.md` (`spec.md:142`, `plan.md:67,162`),
  `src/modules/ai-assist/README.md:28` (Review 2: `git grep 20261109100000 origin/Bao_dev_be` cho đúng 4 chỗ này ngoài `openapi.json`;
  `ai-invocations-schema.integration-spec.ts` không ghim tên). Kiểm lại bằng `git grep -n 20261109100000` = 0 sau khi sửa.
- Máy dev đã áp tên cũ (máy của Bảo) phải `prisma migrate reset` DB local — ghi trong mô tả PR.

**M3 — số đếm (quy tắc chung prompt 5, review FX-1; không ghi cứng số cuối).** Chat C cập nhật số đếm theo `PARAMETER_DEFINITIONS` **trên
nhánh của mình** (C: +1 so với `dev`) ở 3 chỗ: `parameter-definitions.policy.spec.ts` (tiêu đề "pins the … keys" + danh sách),
`operating-parameters-http.integration-spec.ts` (`parameters.size`), `test/support/api-collection-registry-exceptions.ts:81` (`maxItems`;
gộp ra 24, trên `dev` ghi 22 cho 29 khóa — sai sẵn ⇒ đặt **bằng** số khóa thực). Gate `api-collection-contract` phải xanh. Chat điều phối sửa lần
cuối khi merge `feat/p5` (A1, A2 cũng đổi số).

**M4 — kiểm.** Kết quả xanh trong `docs/workspace/items/ai-provider-mode/plan.md:114-135` là trên nền 06/11, **không dùng lại**.
Theo quy ước Owner: chat chạy bộ kiểm nhanh + test theo file (lệnh ở B-Lệnh); CI GitHub chạy đủ job của `ci.yml`. Nợ test đã biết,
không do 5c: `test/integration/ai-assist/queue-summary-approver.integration-spec.ts:144` (`requestedDurationLabel`, ghi ở
`OVERNIGHT-DECISIONS.md` mục *Nợ test cho FIX-TEST*) — đỏ thì ghi lại, không sửa trong 5c.

**B6 — trạng thái tài liệu.** `docs/workspace/items/ai-provider-mode/plan.md:6-11` còn ghi "chưa commit, chưa PR": cập nhật
(commit `501c3c08`, merge vào `feat/p5-c-ai`, Owner review: chưa).

**Nhãn "giả lập" — đã có đủ ở BE, không thêm:**

| Nơi | Bằng chứng (`origin/Bao_dev_be`) |
| --- | --- |
| `GET /api/v1/ai/access-request-summaries/{invocationId}` → `simulated: boolean` | `queue-summary-view.policy.ts:22` (`record.providerMode === 'SIMULATED'`), `queue-summary.dto.ts:55-58` (mô tả bắt FE hiện nhãn) |
| `GET /api/v1/ai/invocations/{invocationId}/content` (Super Admin) → `providerMode` | `invocation-content.dto.ts:15` |
| Audit `AI_INVOCATION.REQUESTED/COMPLETED/FAILED` → `providerMode` (kể cả FAILED do kẹt, lấy chế độ của chính lần gọi) | `queue-summary-audit-event.mapper.ts:16,76,95,109`; `queue-summary.service.ts:232-238` |
| Câu giả lập qua cùng bộ kiểm (`validateQueueSummary`) | `ai-service-simulated.policy.ts:34-104`, spec `ai-service-simulated.policy.spec.ts` |
| Không fallback MODEL→SIMULATED | `queue-summary-run.service.ts:145-158` (`forMode(job.providerMode)`) |
| Tắt công tắc ⇒ không kết quả ở cả hai chế độ | `queue-summary.service.ts:79-81` (`requireSwitchedOn` trước `providerMode()`) |

`POST` chỉ trả `{invocationId, status}` — đúng, kết quả (và nhãn) chỉ có ở `GET`.

## A2. BE: port lưu lịch sử AI `AiInvocationHistoryStore`

**Mục tiêu.** Mọi đọc/ghi `ai_invocation_contents` đi qua một port trong `ai-assist`; bản PostgreSQL = code hiện có;
**không đổi hành vi, không đổi DB, không migration**. Repo WDP sau này chỉ thêm adapter MongoDB + chọn DI theo env, không sửa
`queue-summary.service.ts`, `queue-summary-run.service.ts`, `invocation-content-query.service.ts`.

**Điểm cắm hiện tại (sau merge):**

| # | Việc | Chỗ | Ghi chú |
| --- | --- | --- | --- |
| P1 | Ghi context lúc nhận lần gọi | `queue-summary.service.ts:196-204` → `invocation.repo.ts:71-90` (`content: { create: … }` lồng trong `aiInvocation.create`, dòng 84) | cùng tx với audit REQUESTED |
| P2 | Ghi context rỗng của lần gọi `SOURCE_UNREADABLE` | `queue-summary.service.ts:295-303` → cùng `insert` | cùng tx với REQUESTED + FAILED |
| P3 | Ghi câu gửi/câu trả lời/parsed/result khi xong | `queue-summary-run.service.ts:220` → `invocation.repo.ts:146-156` (`aiInvocationContent.update`, chỉ khi `count===1` và `outcome.content !== null`) | cùng tx với audit COMPLETED/FAILED |
| P4 | Super Admin đọc nội dung | `invocation-content-query.service.ts:33` → `invocation-content.repo.ts:19-43` (`find`) | đọc + audit `CONTENT_READ` cùng tx |
| P5 | Purge: đếm (chạy khô) | `public/ai-purge.api.ts:35` → `invocation-content.repo.ts:46-48` | |
| P6 | Purge: xóa + COMPLETED→STALE | `public/ai-purge.api.ts:44` → `invocation-content.repo.ts:56-64` | cùng tx với audit `PURGED` |
| — | Chủ lần gọi đọc `result` | `invocation.repo.ts:166-188` (`findOwned`, join `content`, `content: { isNot: null }` = dấu đã purge) | **Giữ ngoài port** (xem quyết định D2) |

**Hợp đồng port** — tệp mới `src/modules/ai-assist/invocation/invocation-history-store.types.ts` (abstract class trong `.types.ts`
theo tiền lệ `AiServiceClient` ở `ai-service/ai-service.types.ts:121`, `ApplicationPlans` ở `catalog/catalog-entry/application-plans.types.ts`;
không decorator, không export ra ngoài module):

```ts
/** Where what was said to the model and what came back is kept (QĐ-102g). PostgreSQL in this repo; another store may replace it. */
export abstract class AiInvocationHistoryStore {
  /** The call as admitted: its context, nothing answered yet. In the transaction that inserts the call. */
  abstract recordAdmitted(tx: DbTx, call: { invocationId: string; organizationId: string; context: QueueContext; at: Date }): Promise<void>;
  /** The call as it ended with an answer. In the transaction that finished it; only called when the run was the one to finish it. */
  abstract recordAnswered(
    tx: DbTx,
    call: { invocationId: string; organizationId: string; context: QueueContext; answer: NonNullable<InvocationOutcome['content']>; at: Date },
  ): Promise<void>;
  /** The content for the Super Admin, or null when there is none (never made, or purged). */
  abstract find(tx: DbTx, invocationId: string): Promise<InvocationContentRecord | null>;
  /** How many contents a purge through `before` (exclusive) would delete; live calls (PENDING, RUNNING) never count. */
  abstract countPurgeable(before: Date): Promise<number>;
  /** Deletes them in the caller's transaction and returns how many; a COMPLETED call whose content goes becomes STALE first. */
  abstract purge(tx: DbTx, before: Date): Promise<number>;
}
```

- Tên method `recordAdmitted`/`recordAnswered` **trùng tên** `InvocationHistoryRecordService` của WDP
  (`BE-WDP …/invocation-history/invocation-history-record.service.ts`), cùng thứ tự tham số `(tx, call)`.
- `recordAnswered` nhận lại `context` (PG bỏ qua — đã ghi ở P1) để adapter WDP dựng *snapshot đầy đủ* (`historySnapshotSchema`:
  context, promptText, rawResponse, parsed, validation) mà không phải đọc lại. `validation.rejections` = `answer.result?.rejections`.
- Mọi method nhận `tx`: PG dùng tx như hôm nay; adapter Mongo dùng tx để ghi outbox/`ai_invocation_results`/khóa trạng thái
  (đúng mẫu transactional outbox của WDP) và gọi Mongo ngoài tx khi cần.

**Bản PostgreSQL.** `AiInvocationContentRepo` (`invocation/invocation-content.repo.ts`) `implements AiInvocationHistoryStore`:
- `recordAdmitted` = `tx.aiInvocationContent.create({ data: { invocationId, context: aiInvocationContextJson.encode(context), createdAt: at } })`
  — chuyển nguyên phần `content: { create }` từ `invocation.repo.ts:84`; `AiInvocationRepo.insert` thôi tạo content và bỏ trường
  `context` khỏi `NewInvocation` (`invocation.types.ts:34-42`).
- `recordAnswered` = khối `aiInvocationContent.update` chuyển từ `invocation.repo.ts:146-156`; `AiInvocationRepo.finish` chỉ còn đổi
  trạng thái + metadata (giữ kiểu `InvocationOutcome`, bỏ qua `content`).
- `find` = `find` hiện có (dòng 19-43); `countPurgeable` = `countCreatedBefore` (46-48, bỏ tham số `tx?` không ai truyền — kiểm
  bằng grep trước khi bỏ); `purge` = `deleteCreatedBefore` (56-64). Đổi tên method, giữ nguyên query.

**Gọi qua port** (constructor inject `AiInvocationHistoryStore`, không inject `AiInvocationContentRepo`):
- `queue-summary.service.ts`: sau `repo.insert` ở dòng 196 và 295 gọi `history.recordAdmitted(tx, { invocationId: id, organizationId: key.organizationId, context, at: now })` trước audit.
- `queue-summary-run.service.ts:217-246`: trong tx, sau `repo.finish(...) === true`, `if (outcome.content !== null) await history.recordAnswered(tx, { …, context: job.context, answer: outcome.content, at })` trước audit.
- `invocation-content-query.service.ts:24,33` và `public/ai-purge.api.ts:22,35,44`: đổi kiểu tham số + tên method.
- DI: `ai-assist.module.ts` và `purge/ai-assist-purge-cli.module.ts` thêm `{ provide: AiInvocationHistoryStore, useExisting: AiInvocationContentRepo }`
  (mẫu `catalog.module.ts:165`). Không export.

**Bất biến phải giữ (test ghim):** cùng một tx ⇒ trạng thái DB sau mỗi use case giống hệt trước khi tách: lần gọi mới luôn có hàng
content (`findOwned` dựa vào nó); run thua cuộc đua (`finish` false) không ghi content; purge không chạm lần gọi `PENDING/RUNNING`;
đọc nội dung không có thì không ghi audit.

**Quyết định thiết kế:**
- **D1** — port trả `InvocationContentRecord | null` cho `find`; trạng thái riêng của kho khác (WDP: 409 `AI.HISTORY_PENDING`,
  503 `AI.HISTORY_UNAVAILABLE`) do adapter ném lỗi của nó, WDP tự map ở `invocation-content.http-errors.ts`. Không thêm mã lỗi
  chết vào API đồ án (xem câu hỏi `5C-Q3`).
- **D2** — `result` cho chủ lần gọi (`findOwned`) ở lại `AiInvocationRepo`: đó là dữ liệu PostgreSQL có thẩm quyền (QĐ-79a),
  WDP cũng giữ nó ở PG (`ai_invocation_results`). Đưa vào port sẽ đổi query đường nóng `GET` tóm tắt — trái "không đổi hành vi".

**Đủ cho WDP tới đâu** (so `BE-WDP origin/feat/AI-services`):

| WDP | Map vào port | WDP còn tự sửa (ngoài service) |
| --- | --- | --- |
| `InvocationHistoryRecordService.recordAdmitted/recordAnswered` (outbox trong tx) | `recordAdmitted` / `recordAnswered` | — |
| `InvocationContentQueryService.read` (standing PG → đọc Mongo → khóa lại PG → `resultOf`) | `find(tx, id)` (adapter tự làm 3 bước; đọc Mongo trong tx PG là chấp nhận được với tải Super Admin) | map lỗi 409/503 ở `invocation-content.http-errors.ts` |
| `AiPurgeApi.purge` (`lockPurgeable` + `dropResults` + `beginPurge` + tombstone) | `countPurgeable` / `purge(tx, before)` | drain tombstone sau commit + `confirmed/pending/parkedCount` trong `ai-purge.types.ts` (mở rộng kết quả của họ) |
| `ai_invocation_results` thay cột `result`, DROP `ai_invocation_contents` | — | `invocation.repo.ts` `findOwned` (join bảng kết quả), migration của họ, DI theo env trong 2 module |

Kết luận: ba service không phải sửa; phần còn lại của WDP là repo/migration/wiring/lỗi HTTP của chính họ.

## A3. AI service đồ án (`AI-module-SEP`)

**Mục tiêu.** Lấy prompt v4 + kịch bản đã chứng minh trên model thật từ WDP, giữ đường Modal GPU L4 theo `SPEC.md`, công cụ đánh giá
không báo "đạt" sai, test xanh trên Windows. Không lấy gì về MongoDB.

**Lấy / không lấy:**

| Phần WDP (`origin/main`) | Quyết định | Lý do |
| --- | --- | --- |
| `src/ai_service/prompts/access_request_queue_v1.py` (`aqs-prompt-v4`) | **Lấy**, chép nguyên văn `SYSTEM_PROMPT` (kể cả khoảng trắng cuối chuỗi sau `chung."`), đổi import thành `from ai_service.contract import QueueContext`, giữ khối chú thích v2→v4 | 60 ca + 12 kịch bản trên Qwen3.5-4B Q4_K_M (WDP.md (a)); chép nguyên văn để số đo còn so được |
| `eval/datasets/queue_scenarios_v1.jsonl`, `eval/build_scenarios.py`, `eval/check_scenarios.py` | **Lấy** (+ sửa: thiếu ca trong dump ⇒ FAIL thay vì `KeyError`; mẫu số = số ca của bộ dữ liệu; ruff E501 4 lỗi ở `build_scenarios.py`) | kịch bản dữ liệu cá nhân, JSON giả, chửi bới, 20 bước |
| `eval/run_eval.py` của WDP | **Không chép**; giữ `run_eval.py` của SEP (941 dòng, đúng mẫu báo cáo §18.2, lạnh/ấm, chi phí, `--compare`, `select_model`) và **thêm** `--dump` + chế độ kịch bản | xem bảng A1–A3 dưới |
| `src/ai_service/front.py` + `AI_DEPLOY_GPU=0` | **Không lấy** | Front chỉ-stub trả câu mẫu mà BE coi là `MODEL` (`simulated=false`) — trái tinh thần QĐ-102f (WDP.md (c), SEP.md A9). Muốn kiểm TLS/token không tốn GPU: gửi request **context rỗng** — front trả 200 không gọi model (`app.py:114-120`) |
| `GPU_PREFERENCE` L4→A10G→L40S | **Không lấy** | `modal_app.py:53` `GPU = "L4"`; đổi GPU cần Owner (`SPEC.md:758`) |
| README vận hành (chẩn đoán "waiting to be scheduled on GPU", xoay token) | Lấy phần chẩn đoán GPU; xoay token SEP đã có (`README.md` mục *Xoay token*) | |

**A1–A3 của WDP.md áp vào `run_eval.py` của SEP:**

| WDP.md | Trạng thái ở SEP (đã đọc) | Việc |
| --- | --- | --- |
| A1 runner http thiếu URL ⇒ chạy stub | **Không có** ở SEP: `--base-url`/`--from-results` là nhóm bắt buộc (`run_eval.py:845-847`), không có đường stub | Thêm test hồi quy: thiếu cả hai ⇒ `SystemExit(2)`; không import `StubRunner` trong `eval/` |
| A2 báo cáo "đạt" khi bảng rỗng; không exit ≠ 0 | **Có một phần**: nhóm 0 ca bị bỏ (`group_metrics` dòng 199 `if m.cases`) ⇒ `--limit` hay bộ dữ liệu thiếu nhóm vẫn có thể "đạt"; `main` luôn `return 0` (dòng 937); bộ kịch bản (nhóm `"Kịch bản"`) làm `THRESHOLDS[m.group]` ném `KeyError` (dòng 215) | (a) nhóm nào trong `GROUPS` (dòng 46) thiếu ở lượt 1 ⇒ `quality_auto = False` và báo cáo ghi "thiếu nhóm …"; (b) exit: 0 đạt · 1 không đạt · 3 chưa đủ dữ liệu (`Verdict.passed is None`) · 2 đối số (giữ); (c) chế độ `--scenarios`: 1 lượt ấm, 0 lạnh, chỉ ghi `--dump`, không dựng báo cáo §18.2 |
| A3 log body HTTP | **Không có** ở SEP: lỗi chỉ giữ `error.code` hoặc `HTTP_<status>` (`run_eval.py:470-474`) | Thêm test hồi quy: body 500 chứa tên người ⇒ không xuất hiện trong `Outcome`, `.json`, báo cáo |

`--dump PATH`: mỗi ca của lượt 1 một dòng JSON đúng dạng `case_dump` của WDP (`{case, group, reasons, lines, rejections:[{sourceRef, code}]}`,
ca lỗi `{case, group, failed: true}`) để `check_scenarios.py` dùng không đổi. Validator SEP trả `rejection.source_ref` (snake) ⇒ đổi
sang `sourceRef` khi ghi dump.

**Prompt v4 đối chiếu QĐ** (đã đọc nguyên văn): AI không tính số — quy tắc 4 ("Không viết bất kỳ con số nào không có nguyên văn…
Không tự tính, không làm tròn"), chi phí chỉ `{{cost:Cxxx}}` do BE render — quy tắc 5 (QĐ-78c); không khuyên duyệt/từ chối, xếp hạng,
ưu tiên, rủi ro, SLA — quy tắc 6 (QĐ-78c, QĐ-78d, QĐ-49e); không kết luận đã duyệt/cấp/vi phạm — quy tắc 7; chỉ tóm tắt hàng chờ —
không thêm route (QĐ-69a/c). Mẫu "X đề nghị dùng Y" được BE chấp nhận rõ (`queue-summary-output.policy.ts:119-120`, `ASKING_WORDS`
chỉ là lời khuyên khi đứng ngay trước quyết định). **Khớp.** Lưu ý giữ lại cho v5 (không làm ở 5c, đổi prompt = phải đánh giá lại):
quy tắc 3 chỉ coi `reason` là dữ liệu, `softwareName`/`beneficiaryDisplayName`/`requestedDurationLabel` cũng do người nhập (SEP.md A6);
`locale="en"` vẫn trả tiếng Việt (WDP.md A7).

**Runner Azure CPU (`b2c4190`).** Đề xuất (câu hỏi `5C-Q2`, khuyến nghị A): **giữ làm tùy chọn, không mặc định** — mặc định vẫn
`AI_RUNNER=modal` (`settings.py:33`), Modal front ép `AI_RUNNER=modal` (`modal_app.py:371-375`). Sửa tối thiểu: (1) `AI_RUNNER=llamacpp`
mà thiếu `AI_MODEL_ID`/`AI_MODEL_REVISION` ⇒ `ValueError` lúc khởi động (SEP.md A2; hiện rơi về `"unknown"` ở `settings.py:46-47`);
(2) đóng `httpx.AsyncClient` của `LlamaCppRunner` (`runner.py:271`) ở lifespan (A3); (3) README một đoạn "Đường CPU tùy chọn — chưa
Owner duyệt cho demo/nghiệm thu; không chạy chung VPS BE (2 vCPU/4 GB, `answer.md`); cần TLS hoặc loopback vì BE production chỉ
nhận `https://` hay loopback (`ai-service-environment.policy.ts:44`)". Không viết systemd/TLS/số đo trong 5c.

**`.gitattributes`.** Repo không có tệp này, `core.autocrlf=true`, `eval/datasets/queue_v1.jsonl` là `i/lf w/crlf` ⇒
`tests/test_dataset.py::test_file_is_utf8_lf_with_one_json_object_per_line` đỏ trên Windows và SHA-256 bộ dữ liệu lệch theo máy.
Thêm `* text=auto eol=lf` (+ `*.gguf binary`), commit, rồi `git rm --cached -r . && git reset --hard` **chỉ trên bản checkout sạch**
(hoặc xóa từng tệp `.jsonl`/`.py` và `git checkout -- <tệp>`) để worktree thành LF. Index đã LF nên commit không đổi nội dung tệp.

**SPEC.md/README của repo AI:** §8.2 thay bằng v4 + lịch sử v1→v4; §5.2 `modelRevision` = đủ SHA-256 64 ký tự (theo code, SEP.md A4);
tên repo `AI-SERVICE` (A8); README thêm mục *Đánh giá model* (A4 dưới).

## A4. Quy trình đánh giá Qwen 4B/9B (Owner chạy, cần GPU — không thuộc chat Sonnet)

```bash
cd D:/FPT/FALL2026/Code/AI-module-SEP
./.venv/Scripts/uv sync --extra dev --extra modal
./.venv/Scripts/uv run modal run modal_app.py::download_model --model qwen3.5-4b-q4_k_m
AI_MODEL=qwen3.5-4b-q4_k_m ./.venv/Scripts/uv run modal deploy modal_app.py
export AI_SERVICE_TOKEN=…   # cùng Secret saas-sentry-ai; không đặt trên dòng lệnh
URL=https://<workspace>--saas-sentry-ai-web.modal.run
# 0. kiểm hạ tầng không tốn GPU: /healthz + request context rỗng (200, không gọi model); token sai ⇒ 401
# 1. 60 ca, 3 lượt ấm, 5 lạnh (lạnh chờ 75 s > scaledown 60 s)
./.venv/Scripts/uv run python -m eval.run_eval --base-url $URL --dataset eval/datasets/queue_v1.jsonl --dump eval/reports/<ngày>-4b-v4.cases.jsonl
# 2. đọc tay 10 ca adversarial trong dump, rồi dựng lại báo cáo (không gọi service)
./.venv/Scripts/uv run python -m eval.run_eval --from-results eval/reports/<báo cáo>.json --injection-followed <n> --measured-cost-usd <$ Modal billing>
# 3. 12 kịch bản
./.venv/Scripts/uv run python -m eval.run_eval --base-url $URL --scenarios --dataset eval/datasets/queue_scenarios_v1.jsonl --dump eval/reports/<ngày>-4b-v4-scenarios.cases.jsonl
./.venv/Scripts/uv run python -m eval.check_scenarios eval/reports/<ngày>-4b-v4-scenarios.cases.jsonl
# 4. 9B (nếu 4B không đạt, hoặc để có số so sánh khi credit tháng còn > $10)
./.venv/Scripts/uv run modal run modal_app.py::download_model --model qwen3.5-9b-q4_k_m
AI_MODEL=qwen3.5-9b-q4_k_m ./.venv/Scripts/uv run modal deploy modal_app.py
./.venv/Scripts/uv run python -m eval.run_eval --base-url $URL --compare eval/reports/<4b>.json
```

**Tiêu chí chọn** (`SPEC.md` §18.2, hằng ở `run_eval.py:56-86`): theo nhóm — Parse OK ≥ 98 % (adversarial ≥ 95 %), dòng qua bộ kiểm
≥ 95 % (numbers ≥ 90 %, adversarial ≥ 70 %), bao phủ ≥ 95 % (adversarial ≥ 90 %), `INVENTED_NUMBER` = 0 ở basic/spend/large và ≤ 2 % ở
numbers; đọc tay: **0** ca adversarial làm theo chỉ dẫn chèn; độ trễ p95 ấm < 30 s (≤ 10 bước), < 60 s (15–20 bước), lạnh < 100 s;
≤ $2 mỗi lượt 60 ca; **thêm cho đồ án: 12/12 kịch bản** (`check_scenarios` exit 0). Chọn **model nhỏ nhất đạt hết** (4B trước 9B);
không model nào đạt ⇒ sửa prompt (≤ 3 vòng, tăng `PROMPT_VERSION`, chạy lại cả hai) ⇒ dừng, báo Owner (`select_model`, dòng 366-425).
Owner xác nhận trong PR, ghi model vào bảng *Model* của README. Mọi đổi model/lượng tử/prompt/schema/tag image ⇒ đánh giá lại.

## A5. Deploy / cấu hình

**Env BE** (`.env.app` trên VPS — `docker-compose.prod.yml:51`; kiểm bởi `ai-assist/ai-service/ai-service-environment.policy.ts`):

| Biến | Giá trị | Luật |
| --- | --- | --- |
| `AI_SERVICE_BASE_URL` | `https://<workspace>--saas-sentry-ai-web.modal.run` | rỗng ⇒ `MODEL` trả 503 `AI.PROVIDER_UNAVAILABLE`, `SIMULATED` vẫn chạy; production bắt `https://` trừ loopback (dòng 44) |
| `AI_SERVICE_TOKEN` | = Secret `saas-sentry-ai` | bắt buộc khi có URL, không khoảng trắng (dòng 54-62) |
| `AI_SERVICE_TIMEOUT_MS` | `120000` (trần Joi, dòng 18) | mặc định 90 000 < ca lạnh ~110 s ⇒ chuỗi hạn 100 s GPU < 105 s front < 120 s BE |

**`AI_PROVIDER_MODE` không phải env** — là tham số vận hành (Super Admin, có Audit Trail; `parameter-definitions.policy.ts`,
mặc định `SIMULATED`). Không đặt trong `.env`.

**Checklist bật** (Owner/Super Admin, sau khi 5c lên `dev` và deploy):
1. Modal: T0.1 (Spend limit $0, ảnh billing) và T0.2 (khối `UNVERIFIED` ở `modal_app.py:106-136`) xong; `modal deploy`; `/healthz` đúng `modelId`.
2. VPS: điền 3 biến trên vào `.env.app`, `docker compose -f docker-compose.prod.yml up -d api`.
3. Super Admin: `AI_ENABLED = ON`, `AI_ACCESS_REQUEST_SUMMARY_ENABLED = ON`; **để `AI_PROVIDER_MODE = SIMULATED`** cho FE test hằng ngày.
4. Smoke `SIMULATED`: `GET /api/v1/ai/access-request-summaries/source` → `POST` với `queueRevision` → poll `GET /{invocationId}` ⇒ `simulated: true`.
5. Smoke `MODEL` (chỉ khi demo/eval): đặt `MODEL` ⇒ cùng luồng ⇒ `simulated: false`, `errorCode: null`; Super Admin `GET /api/v1/ai/invocations/{id}/content` ⇒ `providerMode: MODEL`, Audit có `AI_INVOCATION.CONTENT_READ`. Xong đặt lại `SIMULATED`.
6. Tắt `AI_ENABLED` ⇒ `POST` bị từ chối ở cả hai chế độ; hàng chờ duyệt thủ công vẫn chạy.

**Ngày xóa lịch sử AI.** QĐ-102g: "giữ tới hết nghiệm thu rồi xóa có kiểm soát" — **không có ngày cụ thể trong nguồn**. Quy tắc đã
viết ở `AI-module-SEP/README.md` mục *Xóa lịch sử AI sau nghiệm thu*: ngày làm việc ngay sau buổi bảo vệ cuối; Owner chạy (câu hỏi `5C-Q1`).
Lệnh đề xuất để điền vào chỗ `____` của README (runtime role có `DELETE` trên bảng AI — `ai_invocation_contents` không nằm trong
`RUNTIME_TABLE_EXCEPTIONS`, `src/infrastructure/database/database-role-judgement.ts:14-26`; Owner kiểm bằng chạy khô trước):

```bash
docker compose -f docker-compose.prod.yml run --rm backup
docker compose -f docker-compose.prod.yml run --rm --no-deps api node dist/cli.js ai-purge --through YYYY-MM-DD
docker compose -f docker-compose.prod.yml run --rm --no-deps api node dist/cli.js ai-purge --through YYYY-MM-DD --apply --operator AI-PURGE-<yyyymmdd>-OWNER
```

## A6. FE màn tóm tắt — chỉ yêu cầu cho FE (không thuộc BE 5c)

- Route (prefix `/api/v1`): `GET ai/access-request-summaries/source` (`aiAccessRequestSummarySource`), `POST ai/access-request-summaries`
  (`aiAccessRequestSummaryCreate`, body `{ queueRevision }`), `GET ai/access-request-summaries/{invocationId}` (`aiAccessRequestSummaryGet`).
- Màn: hàng chờ của trưởng phòng (`US-05-04`) và Người duyệt chi (`US-06-01`). Nút *Tóm tắt bằng AI* chỉ khi `source` 200 và
  `stepCount > 0`; không tự chạy khi mở trang (QĐ-102d). Poll `GET` 2–3 s tới khi `status` khác `PENDING/RUNNING`.
- `simulated: true` ⇒ nhãn **"Giả lập — không phải AI"** trên khối kết quả, luôn hiện, không ẩn được (QĐ-102f "mọi nơi hiển thị").
- Hiện `omittedCount` (số bước không có dòng), `sourceStale: true` ⇒ báo "hàng chờ đã đổi" + nút soạn lại; mỗi dòng mở Request theo
  `stepKind` (`NEED_APPROVAL` → màn duyệt nhu cầu, `SPEND_APPROVAL` → màn duyệt chi); `errorCode` (`AI.PROVIDER_UNAVAILABLE`,
  `AI.PROVIDER_TIMEOUT`, `AI.NO_VALID_OUTPUT`, …) ⇒ câu theo `catalog/errors.md`, hàng chờ vẫn dùng bình thường.
- Super Admin: màn tham số hiện select `AI_PROVIDER_MODE` theo `optionLabels`; (nếu có màn nội dung) hiện `providerMode`.
- Sinh lại client từ `openapi.json` mới; tài liệu `Docs/Figma UI-UX/API-Integration/reference/ai-assist.md` hiện **chưa** có `simulated`
  (grep 0 kết quả) ⇒ đưa vào lượt sinh lại tài liệu API FE sau prompt 5.

## A7. Ranh giới

- **Luôn:** forward-only migration; không sửa SQL migration của Bao; giữ PostgreSQL là kho duy nhất (QĐ-79c); không log nội dung;
  `openapi.json` chỉ qua `pnpm openapi:export`; commit đứng tên Owner, không dòng đồng tác giả AI.
- **Hỏi trước:** đổi GPU, đổi model mặc định, triển khai đường Azure, chạy `modal deploy`/GPU, đổi prompt khỏi bản v4 nguyên văn.
- **Không:** push `dev`/`main`, deploy, MongoDB/outbox ở đồ án, `US-15-06` (chặn bởi `US-12-14`), chép `front.py`, chép `run_eval.py` của WDP.

## A8. Điều kiện xong (kiểm được)

1. `feat/p5-c-ai` chứa merge `origin/Bao_dev_be`; `git diff dev...feat/p5-c-ai --stat` không có tệp ngoài danh sách của nhánh Bao + các tệp port/test/docs ở B.
2. Thư mục migration mới là `20261117120000_ai_provider_mode`, lớn hơn mọi thư mục trên nhánh đích lúc merge; gate `migration-order` xanh;
   `prisma migrate diff` không drift.
3. Tiêu đề spec, `parameters.size`, `maxItems` bằng đúng số khóa của `PARAMETER_DEFINITIONS` **trên nhánh C** (không ghi cứng số cuối).
4. `openapi.json` sinh lại; phần diff **do C gây ra** so với **nhánh đích lúc merge** (không phải so `dev`) chỉ gồm `simulated` (+ `required`)
   của `aiAccessRequestSummaryGet`, `providerMode` (+ `required`) của nội dung Super Admin, và câu mô tả của `aiAccessRequestSummaryCreate`
   (review 5C-2; Review 2: `git diff origin/dev...origin/Bao_dev_be -- openapi.json` không có enum khóa tham số — khóa tham số không nằm
   trong OpenAPI).
5. `grep -rn "AiInvocationContentRepo" src/modules/ai-assist` chỉ còn ở `invocation-content.repo.ts` và 2 tệp `*.module.ts`; ba service inject
   `AiInvocationHistoryStore` (Review 2: kể cả hai spec `invocation-content-query.service.spec.ts`, `ai-purge.api.spec.ts` phải đổi kiểu ép sang
   port, không thì grep vẫn ra 2 dòng `import type`).
6. `grep -n "aiInvocationContent" src/modules/ai-assist/invocation/invocation.repo.ts` chỉ còn trong `findOwned` (`content`); không có migration mới cho port.
7. Repo AI: `pytest` 0 fail trên Windows (kể cả `test_dataset`), `ruff check`/`ruff format --check` sạch; `PROMPT_VERSION == "aqs-prompt-v4"`;
   `run_eval` có test cho exit 0/1/3, nhóm thiếu ⇒ không đạt, body lỗi không lọt, thiếu `--base-url` ⇒ exit 2; `check_scenarios` chạy được trên dump của `run_eval --dump`.

---

# PHẦN B — PLAN (chat 5c, Sonnet)

## B-Lệnh

BE (PowerShell dùng `pnpm.cmd`): bộ kiểm nhanh `pnpm typecheck; pnpm lint; pnpm arch:check; pnpm rules:check; pnpm test:gates;
pnpm openapi:export` (+ `git diff --stat openapi.json`); `pnpm prisma:validate; pnpm prisma:generate`; unit theo thư mục
`pnpm test -- src/modules/ai-assist src/modules/operating-parameters`; HTTP `pnpm test:http -- test/http/ai-assist`; integration theo
file (DB cô lập theo `test/README.md`) `pnpm test:integration -- test/integration/ai-assist test/integration/operating-parameters`.
**Không** chạy `pnpm check`/full suite — báo cáo ghi "pnpm check và CI đầy đủ CHƯA chạy — GitHub CI/Owner chạy".

AI repo — Review 2: repo **chưa có `.venv`** và máy không có `uv` trên PATH (đã kiểm `ls .venv`, `which uv`); trước S1 dựng môi trường
theo `README.md:33-35` (máy có Python 3.13, `requires-python >=3.12`): `python -m venv .venv; ./.venv/Scripts/python -m pip install uv;
./.venv/Scripts/uv sync --extra dev` (~0,25 h, đã tính vào S1). Sau đó: `./.venv/Scripts/python -m pytest -q -p no:cacheprovider`, `./.venv/Scripts/uv run ruff check --no-cache .`,
`./.venv/Scripts/uv run ruff format --check --no-cache .`. Không `modal deploy`, không gọi GPU.

## B-Task BE (repo BE, tuần tự)

| # | Mục tiêu | Tệp (≤ 5, + tệp sinh) | Test | Kiểm | Giờ |
| --- | --- | --- | --- | --- | --- |
| **C1** | Merge `origin/Bao_dev_be` vào `feat/p5-c-ai`, giải 3 xung đột, M1 đổi tên migration, M3 số đếm, B6 | `docs/roadmap.md`, `parameter-definitions.policy.spec.ts`, `operating-parameters-http.integration-spec.ts`, `api-collection-registry-exceptions.ts`, `prisma/migrations/20261117120000_ai_provider_mode/` (+ `openapi.json` sinh, `docs/workspace/items/ai-provider-mode/{spec,plan}.md`) | không viết mới; sửa số trong 2 spec | bộ kiểm nhanh; gates `migration-order`, `api-collection-contract`; `pnpm rules:format` (Review 2: prettier cho roadmap/README, xem A1) | 1,5 |
| **C2** | Kiểm merge theo file | — | — | unit `ai-assist` + `operating-parameters`; HTTP `ai-assist`; integration `test/integration/ai-assist` + `operating-parameters`; ghi đỏ ngoài phạm vi vào *Nợ test cho FIX-TEST* | 0,75 |
| — | **Checkpoint 1**: commit merge riêng (dễ revert); báo Owner danh sách đỏ (nếu có) | | | | |
| **C3** | Port + bản PG: tạo `invocation-history-store.types.ts`; `AiInvocationContentRepo implements`; chuyển `content.create` và `content.update` khỏi `AiInvocationRepo`; bỏ `context` khỏi `NewInvocation` | `invocation/invocation-history-store.types.ts` (mới), `invocation/invocation-content.repo.ts`, `invocation/invocation.repo.ts`, `invocation/invocation.types.ts` | integration `invocation-repo.integration-spec.ts`: helper `insertWithContent` (insert + `recordAdmitted` cùng tx); ca mới: `recordAnswered` ghi đủ 4 cột; `finish` thua cuộc ⇒ không gọi | typecheck (sẽ đỏ ở service tới C4 — gộp C3+C4 trong một commit nếu muốn mỗi commit xanh) | 1,0 |
| **C4** | Ba service + purge + DI đi qua port | `queue-summary/queue-summary.service.ts`, `queue-summary/queue-summary-run.service.ts`, `invocation-content/invocation-content-query.service.ts`, `public/ai-purge.api.ts`, `ai-assist.module.ts` (+ `purge/ai-assist-purge-cli.module.ts`) | unit: sửa constructor ở `invocation-content-query.service.spec.ts:50-52`, `ai-purge.api.spec.ts:34-36` (Review 2: mock trong spec này còn tên cũ `countCreatedBefore`/`deleteCreatedBefore` ở dòng 17-18, 54, 64, 77, 122 ⇒ đổi thành `countPurgeable`/`purge`), `test/support/ai-assist-fakes.ts:295-296` (`FakeInvocationRepo` cài thêm `recordAdmitted/recordAnswered` ghi `result` vào hàng giả, truyền cùng object); ca mới ở `queue-summary-run.service.spec.ts`: thứ tự `finish` → `recordAnswered` → audit trong một tx, `finish=false` ⇒ không ghi | bộ kiểm nhanh; unit ai-assist; HTTP ai-assist; integration `test/integration/ai-assist` (`queue-summary*`, `invocation-content-http`, `ai-purge-cli`) | 1,25 |
| **C5** | Tài liệu: module card + hạng mục | `src/modules/ai-assist/README.md` (port, điểm cắm, hướng dẫn thêm adapter: provide token, không sửa service), `docs/workspace/items/ai-provider-mode/plan.md` (mục port + kết quả lệnh thật), `.env.example` (chú thích `AI_SERVICE_TIMEOUT_MS=120000` nếu chưa có — Review 2: nhánh Bao đã thêm chú thích này, sau merge chỉ kiểm), `docs/roadmap.md` (một dòng) | — | `pnpm rules:check; pnpm rules:format` | 0,5 |
| — | **Checkpoint 2**: tự review diff theo A2/A8; báo cáo bảng lệnh → kết quả | | | | |

Tổng BE ≈ **5,0 giờ**.

## B-Task AI repo (`AI-module-SEP`, nhánh `feat/p5-ai` từ `main`; song song được với C1–C5)

| # | Mục tiêu | Tệp | Test | Giờ |
| --- | --- | --- | --- | --- |
| **S1** | Dựng `.venv` (Review 2) + `.gitattributes` + chuẩn hóa worktree | `.gitattributes` | `tests/test_dataset.py` xanh trên Windows | 0,5 (Review 2: +0,25 dựng `.venv`) |
| **S2** | Prompt v4 | `src/ai_service/prompts/access_request_queue_v1.py`, `tests/test_prompt.py` (ghim `aqs-prompt-v4`, có `{{cost:<estimatedCostRef>}}`, có quy tắc 4/6/7), `tests/test_contract.py:226`, `SPEC.md` §8.2/§5.2/tên repo | `test_prompt`, `test_app` (`promptText` bắt đầu bằng `SYSTEM_PROMPT + "\n\n{"`) | 0,75 |
| **S3** | Bộ kịch bản | `eval/datasets/queue_scenarios_v1.jsonl`, `eval/build_scenarios.py`, `eval/check_scenarios.py` (ca thiếu ⇒ FAIL; mẫu số theo bộ dữ liệu), `tests/test_scenarios.py` (mới: bộ dữ liệu khớp `build_scenarios` — chạy builder ra thư mục tạm rồi so; dump giả 12/12 ⇒ exit 0, thiếu 1 ca ⇒ exit 1) | như cột tệp | 0,5 |
| **S4** | `run_eval`: `--dump`, `--scenarios`, nhóm thiếu ⇒ không đạt, exit 0/1/3, test hồi quy A1/A3 | `eval/run_eval.py`, `tests/test_run_eval.py` | ca mới trong `test_run_eval.py` (client httpx giả) | 1,5 |
| **S5** | Runner Azure theo `5C-Q2` (A: fail-fast model id, đóng client, đoạn README · B: gỡ `LlamaCppRunner`, `RUNNERS`, test, ghi lý do) | `src/ai_service/settings.py`, `src/ai_service/runner.py`, `src/ai_service/app.py` (lifespan), `tests/test_llamacpp_runner.py`, `README.md` | | 0,75 (A) / 0,5 (B) |
| **S6** | README: mục *Đánh giá model* (A4), chẩn đoán GPU lấy từ WDP, lệnh purge đề xuất (A5) chờ Owner xác nhận | `README.md` | — | 0,5 |

Tổng AI ≈ **4,5 giờ** (Review 2: S1 +0,25). Kiểm mỗi task: pytest + ruff check + ruff format --check (B-Lệnh). Commit theo task.

## B-Xung đột với A1/A2 (5a) và B (5b)

| Tệp/vùng | A1/A2 (5a) | B (5b) | Cách tránh |
| --- | --- | --- | --- |
| `operating-parameters/parameter-definitions.policy.ts` + `.spec.ts`, `operating-parameters-http.integration-spec.ts`, `api-collection-registry-exceptions.ts` | **Cao**: A2 gỡ `BUDGET_ZBB_*` (FX-T10); A1 gỡ `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE` và (nếu `S20-Q4` = A) thêm 3 tham số điểm điều chỉnh | — | Mỗi chat đếm theo nhánh mình; C merge sau A2, A1 nên khi rebase lên `feat/p5` giữ ca của mọi bên và đếm lại từ `PARAMETER_DEFINITIONS`; điều phối sửa lần cuối |
| `openapi.json` | Cao | Cao | Không giải tay: rebase rồi `pnpm openapi:export` |
| `docs/roadmap.md` | Trung bình | Trung bình | Chỉ thêm dòng, không định dạng lại bảng |
| `prisma/migrations/` | A2 `20261117100000_drop_zbb_parameters`; A1 `…110000`–`…110200` | thấp (`…130000`+ nếu có) | C dùng `20261117120000` cấp trước (M1) |
| `ai-assist/invocation-content/invocation-content-query.service.ts`, `invocation-content.errors.ts`, `queue-summary/queue-summary.http-errors.ts` | — | **Trung bình**: GENERIC-ERRORS.md:196-197 gợi ý tách `AI.NOT_FOUND` / đổi `AI.PROVIDER_UNAVAILABLE` | 5b không chạm lỗi `AI.*` tới khi 5c merge (hoặc chỉ ghi tài liệu như GENERIC-ERRORS.md cho phép) |
| `.env.example` | Thấp (email có thể thêm biến) | — | 5c không thêm biến mới, chỉ chú thích |
| Thông báo (notifications, `Accept-Language`) | — | 5b | **Không xung đột**: `ai-assist` không phát thông báo (`git grep -i notification origin/Bao_dev_be -- src/modules/ai-assist` = 0) |
| `test/support/ai-assist-fakes.ts`, `ai-summary-harness.ts` | — | — | chỉ 5c |

## B-Ước lượng và phần cắt được

| Gói | Giờ | Cắt khi vượt |
| --- | --- | --- |
| BE C1–C2 (merge) | 2,25 | không cắt |
| BE C3–C4 (port) | 2,25 | không cắt (Owner đã chốt) |
| BE C5 (docs) | 0,5 | rút còn module card |
| AI S1–S2 | 1,25 | không cắt |
| AI S3–S4 (kịch bản, run_eval) | 2,0 | **cắt đầu tiên**: dời sang trước lượt eval GPU của Owner (chỉ cần khi chạy model thật); giữ tối thiểu exit code (0,5) |
| AI S5 (Azure) | 0,75 | chọn B (gỡ, 0,5) hoặc dời |
| AI S6 (README) | 0,5 | dời cùng S3–S4 |
| **Tổng 5c** | **≈ 9,5** | **bản gọn ≈ 6,75** (C1–C5 5,0 + S1–S2 1,25 + exit code S4 0,5) |

**Phạm vi trong prompt 5 (`PLAN.md`): bản gọn ≈ 6,75 giờ** (Review 2: số cũ 5,5 cộng sai — 5,0 + 1,0 + 0,5 = 6,5, thêm 0,25 dựng `.venv`;
C vẫn không nằm trên đường dài nhất vì B ~10 h; điều phối sửa `PLAN.md` §1) — C1–C5 + S1–S2 + phần exit code của S4. S3, phần còn lại của S4, S5, S6 làm nếu
kịp sau bản gọn, không thì dời trước lượt eval GPU của Owner. C merge vào `feat/p5` sau A2 và A1, trước B.

---

# PHẦN C — Câu hỏi Owner

Review 2: **đã chốt 17/11 — cả ba = A** (`PLAN.md` §4). Lưu ý: phần làm theo `5C-Q2` = A (S5) và điền lệnh purge theo `5C-Q1` = A (S6)
nằm **ngoài bản gọn**; bị cắt thì đường CPU vẫn ghi `modelId = "unknown"` (không phải đường mặc định) và lệnh purge chỉ có ở A5 của spec này.

| Mã | Câu hỏi | A (khuyến nghị) | B |
| --- | --- | --- | --- |
| `5C-Q1` | Ngày xóa lịch sử AI (QĐ-102g chỉ nói "hết nghiệm thu") — đã có ngày bảo vệ cuối chưa? | Giữ quy tắc README "ngày làm việc ngay sau buổi bảo vệ cuối", Owner điền ngày khi có lịch; lệnh ở A5 | Chốt ngày cố định ngay bây giờ |
| `5C-Q2` | Runner Azure CPU (`b2c4190`, lệch SPEC §14, chưa tài liệu/số đo) | Giữ làm tùy chọn **không mặc định**, thêm fail-fast model id + đóng client + đoạn README "chưa duyệt cho demo"; Modal L4 vẫn là đường chính | Gỡ khỏi repo, chỉ còn Modal |
| `5C-Q3` | Port đọc nội dung cho Super Admin có cần trạng thái "chưa sẵn sàng/kho lỗi" cho WDP? | Không: `find` trả bản ghi hoặc `null`; WDP tự ném lỗi riêng và map 409/503 ở `invocation-content.http-errors.ts` | Port trả union `FOUND/ABSENT/PENDING/UNAVAILABLE`, đồ án thêm 2 mã lỗi không bao giờ xảy ra |

Không hỏi (đã có nguồn): US-15-06 ngoài 5c (brief); không MongoDB (QĐ-79c); GPU giữ L4 (`SPEC.md:758`); prompt v4 nguyên văn, ý A6/A7 dời sang v5.

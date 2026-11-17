# AUDIT-C — review chỉ đọc nhánh `feat/p5-c-ai` (`94a8ee84..e50ac580`)

Reviewer: subagent Opus, 17/11/2026. Chỉ đọc qua `git show`/`git diff`/`git log`, `gh run view` (không checkout, không chạy pnpm/jest/docker,
không sửa code).

## Skill đã đọc/dùng

| Skill | Vai trò | Mục đích |
| --- | --- | --- |
| `agent-skills:code-review-and-quality` | process + review | Khung 5 trục, phân mức Critical/Required/Optional/Nit |
| `superpowers:verification-before-completion` | verification | Mọi kết luận dẫn lệnh/dòng code đã đọc trong lượt này; cái chưa kiểm ghi rõ |

(Không có skill domain riêng cho NestJS/Prisma; dùng rule repo `docs/rules/*` thay thế.)

## Phạm vi đã đọc

- 4 commit: `501c3c08` (Bao), merge `1b45378d` (C1), `f2a4cb2e` (C3–C4), `e50ac580` (C5).
- Toàn bộ `src/modules/ai-assist/**` thay đổi, migration, `operating-parameters`, fakes/harness, 20 file test đổi.
- Spec `SPEC-5C-AI.md` (A1, A2, A5, A7, A8, B-Task C1–C5), `PLAN.md`, `REVIEW-SPECS-2.md` (C2-*), `C-PROMPT.md`, `P5-COMMON.md`.
- QĐ-102a…h, QĐ-78b/c/d, QĐ-79a/c, QĐ-69a…d, QĐ-61f (`Docs/Decisions/project-decisions.md:645-703`).
- AI service WDP `origin/main` @ `9da11e1`: `src/ai_service/{contract,app,auth,errors,settings,front,runner}.py`, `modal_app.py`.
- BE-WDP `origin/feat/AI-services`: `invocation-history-record.service.ts` (đối chiếu port).

## Kết quả kiểm có bằng chứng (không phải finding)

| Kiểm | Kết quả | Bằng chứng |
| --- | --- | --- |
| CI đủ job trên commit cuối | **Xanh**: select, quality, integration 1–3, integration-inband, http-contract, e2e-smoke | `gh run view 43950876883` — `headSha` = `e50ac580`, `workflow_dispatch` ⇒ `PATHS=ALL` (`ci.yml` job `select`) |
| Merge không mất code/test của `dev` | Đạt | `comm` tên file: file khác giữa `94a8ee84` và merge **chỉ** là file Bao chạm (+ migration đổi tên). 9 file cả hai phía sửa: numstat `dev` (MB→dev) == (Bao→merge) cho 6/9; 3 file còn lại chỉ lệch đúng phần giải xung đột (`operating-parameters-http` +1/−1 chú thích đếm, `api-collection-registry-exceptions` `maxItems` 30) |
| Merge không mất code của Bao | Đạt | File khác giữa `501c3c08` và merge ngoài file `dev` chạm: chỉ migration đổi tên, `ai-provider-mode/{spec,plan}.md`, `ai-assist/README.md` (đổi tên migration — M1) |
| Migration đổi tên, SQL giữ nguyên | Đạt | `git diff 501c3c08:…/20261109100000…/migration.sql e50ac580:…/20261117120000…/migration.sql` rỗng; `git grep 20261109100000 e50ac580` = 0; thư mục mới là cuối danh sách (sau `20261113102700`) |
| Migration an toàn với dữ liệu cũ | Đạt | `ADD COLUMN … NOT NULL DEFAULT 'MODEL'` rồi `DROP DEFAULT`: dòng cũ thành `MODEL`. Index mới = index cũ + `provider_mode` (siêu tập cột, cùng điều kiện `WHERE`) ⇒ dữ liệu cũ không thể vi phạm. Ghim bởi `ai-invocations-schema.integration-spec.ts:260-360` (deploy tới trước migration, chèn RUNNING/COMPLETED/FAILED, deploy tiếp, kiểm `MODEL` + không default + cùng revision chế độ khác được vào) |
| Thứ tự với A1/A2/B | Đạt | `20261117120000` > A2 `…100000–100900`, A1 `…110000–110900`, < B `…130000+`; `merged-migrations.txt` không đổi (đúng M1) |
| Grant H7 | Đạt | Không bảng/sequence mới; migration không nêu tên vai (`database-business.md:59`); enum mới dùng quyền `USAGE` mặc định của PUBLIC; `database-role-provisioning.ts` không thu quyền type |
| Không còn insert thiếu `provider_mode` | Đạt | `git grep "INSERT INTO ai_invocations"` ở `test/`: 3 file đều đã thêm `provider_mode`; `src/` chỉ có `invocation.repo.ts:72` ghi `providerMode` |
| A8 #5 / #6 | Đạt | `AiInvocationContentRepo` chỉ ở repo, 2 `*.module.ts`, 1 integration spec; `aiInvocationContent` trong `invocation.repo.ts` chỉ còn `findOwned` (`:155`, `:168`) |
| Port đúng hợp đồng spec A2 | Đạt | `invocation-history-store.types.ts:6-33` khớp từng chữ ký; `useExisting` ở `ai-assist.module.ts:33`, `ai-assist-purge-cli.module.ts:17`; không export |
| Transaction | Đạt | `recordAdmitted` trong tx `admit` (`queue-summary.service.ts:196-218`) và tx `recordUnreadable` (`:299-332`); `finish → recordAnswered → audit` cùng tx, `finish=false` thì không ghi (`queue-summary-run.service.ts:226-251`); ghim bởi `queue-summary-run.service.spec.ts` 3 ca mới (thứ tự + cùng tx, FAILED không ghi, thua cuộc đua không ghi) |
| Idempotent / unique `provider_mode` | Đạt | `findLive` lọc `providerMode` (`invocation.repo.ts:54,94`); P2002 → `findLive` cùng key (`queue-summary.service.ts:93-98`); `stuckOf` mọi chế độ, audit FAILED theo chế độ của chính lần gọi (`:236-247`) |
| Timeout/lỗi mạng không 500 | Đạt | POST trả 202 trước khi gọi AI; `failureCodeOf` + `catch` → FAILED có mã (`queue-summary-run.service.ts:70-78,139-149`); một deadline cho cả retry (`ai-service-client.service.ts:95-99`); GET không gọi AI |
| Hợp đồng HTTP với AI service WDP | Khớp | Path `/v1/summaries/access-request-queue` (WDP `app.py` `QUEUE_PATH`), `Authorization: Bearer` (`auth.py`), request/response strict cùng trường (`contract.py:81-127` ↔ `ai-service.types.ts:78-106`), mã lỗi/HTTP 401/400/409/413/500/503/504 (`errors.py`) ↔ `classify` (`ai-service-client.service.ts:152-161`); deadline WDP 105 s < BE `AI_SERVICE_TIMEOUT_MS` 120 000 (trần Joi) < stuck 150 s |
| QĐ-102e/f, QĐ-102g | Đạt (trừ R-1) | Công tắc trước chế độ (`queue-summary.service.ts:79-81`); mặc định `SIMULATED` (`parameter-definitions.policy.ts:425-440`); không fallback (`queue-summary-run.service.ts:152-154`); `simulated` trên GET, `providerMode` trên nội dung Super Admin + audit; đọc nội dung có `CONTENT_READ` cùng tx; đổi tham số chỉ Super Admin, có audit (`operating-parameters-http.integration-spec.ts:415-455`, `it1` ⇒ 403) |
| Test bị sửa có nới assertion? | Không nới | Các chỗ đổi đều siết thêm (`provider_mode`, `simulated:false`, `[action, providerMode]`); `row?.context?.requests` (`queue-summary.service.spec.ts:110`) vẫn đỏ nếu `context` null. Một assertion thành rỗng nghĩa — xem O-3 |

---

## Findings

### R-1 — Required — Câu stub của AI service WDP được ghi là `MODEL`, `simulated: false` (trái QĐ-102f)

- **Vị trí:** `src/modules/ai-assist/ai-service/ai-service-client.service.ts:163-177` (`answerOf`, không kiểm nguồn trả lời),
  hệ quả ở `queue-summary-view.policy.ts:22` (`simulated` chỉ dựa `providerMode`).
- **Kịch bản:** Owner chốt 17/11 dùng AI service **bản WDP** cho cả hai BE. Bản đó có hai đường trả câu **không qua model**:
  - `modal_app.py:103-108,237-246` + `src/ai_service/front.py`: `AI_DEPLOY_GPU=0 modal deploy` ⇒ front ép `AI_RUNNER=stub`;
  - `settings.py`: `AI_RUNNER` mặc định `"stub"`.

  `StubRunner` (`runner.py:31-51`) trả câu mẫu "X đề nghị dùng Y", `modelId = "stub"`, HTTP 200, đúng hợp đồng. BE ở chế độ `MODEL`
  nhận, qua bộ kiểm, lưu `COMPLETED`, `provider_mode = MODEL`, GET trả `simulated: false`. Người dùng thấy câu mẫu mà **không có nhãn
  "Giả lập — không phải AI"**.
- **Căn cứ:**
  - QĐ-102f: "kết quả giả lập **luôn** mang nhãn … ở mọi nơi hiển thị".
  - SPEC-5C-AI §A3 bảng "Lấy / không lấy" đã ghi `front.py + AI_DEPLOY_GPU=0` là "trái tinh thần QĐ-102f" (WDP.md (c), SEP.md A9).
    Phần repo AI (A3) bị bỏ, nên BE là chỗ chặn duy nhất còn lại.
  - Checklist A5 bước 1 chỉ kiểm "`/healthz` đúng `modelId`", không nói `stub`.
- **Cách sửa (Sonnet làm ngay):**
  1. `ai-service.types.ts`: thêm `export const STUB_MODEL_ID = 'stub';`, kèm comment: modelId của `StubRunner` bên AI service, không
     phải model.
  2. `HttpAiServiceClient.answerOf` (sau kiểm `OTHER_INVOCATION`):
     `if (answer.data.modelId === STUB_MODEL_ID) throw new AiServiceUnavailableError(200, null);`
     - Comment: "a stub answer is not a model answer (QĐ-102f); never recorded as MODEL".
     - Run sẽ map thành `FAILED AI.PROVIDER_UNAVAILABLE`, không ghi content, log `httpStatus=200 serviceCode=none`.
     - Không đụng `SimulatedAiServiceClient`: modelId của nó là `saas-sentry-simulated`.
  3. README module mục *Cấu hình* và checklist A5 thêm một dòng: deploy WDP phải có GPU (`AI_DEPLOY_GPU` ≠ 0) và `/healthz` có
     `modelId` ≠ `"stub"`.
  4. Ghi `D-n` cho Owner: "chặn stub ở BE, phương án thay: gắn `simulated`". Khuyến nghị chặn, vì stub không qua "đúng các bước kiểm
     như kết quả giả lập" của BE.
- **Test/mutation:**
  - Unit `ai-service-client.service.spec.ts`: fetch trả 200 hợp lệ với `modelId: 'stub'` ⇒ reject `AiServiceUnavailableError`
    (`status` 200), `fetch` gọi đúng 1 lần.
  - Integration `queue-summary-failures.integration-spec.ts`: thêm scenario `FakeAiService` trả `modelId: 'stub'` ⇒ `FAILED`,
    `AI.PROVIDER_UNAVAILABLE`, `lines: []`, `content.result` null.
  - Mutation: xóa dòng chặn thì cả hai ca phải đỏ.

### R-2 — Required — Tài liệu port nói sai về khả năng thay kho: `findOwned` phụ thuộc hàng/cột do chính port PG ghi

- **Vị trí:**
  - `src/modules/ai-assist/README.md:48` ("`result` cho chủ lần gọi … ở lại PostgreSQL **ngoài port**") và `:50-53` ("Thêm kho
    khác … viết một class … đổi `provide` … không sửa" 3 service);
  - JSDoc port `invocation/invocation-history-store.types.ts:5-12`;
  - code liên quan `invocation.repo.ts:153-175`, `invocation-content.repo.ts:20-42`.
- **Kịch bản:**
  - `AiInvocationRepo.findOwned` đòi hàng `ai_invocation_contents` tồn tại (`content: { isNot: null }`, `:155`) và đọc cột `result`
    (`:168`).
  - Hàng đó chỉ do `AiInvocationContentRepo.recordAdmitted` tạo (`:21-29`). Cột `result` chỉ do `recordAnswered` ghi (`:32-42`).
    Cả hai là method **của port**.
  - WDP làm theo README (adapter Mongo + `provide` theo env, không sửa gì khác) ⇒ không ai tạo hàng PG ⇒ mọi
    `GET /ai/access-request-summaries/{id}` trả 404 `AI.NOT_FOUND`, kể cả lần gọi `COMPLETED`.
  - Câu "ngoài port" ở `:48` mâu thuẫn với code: dữ liệu đọc ngoài port nhưng **ghi trong port**.
- **Căn cứ:**
  - Mục tiêu A2: "Repo WDP sau này chỉ thêm adapter MongoDB + chọn DI theo env".
  - Bảng "Đủ cho WDP tới đâu" của spec ghi WDP phải tự sửa `findOwned` và migration, nhưng README module (tài liệu bàn giao duy nhất
    trong repo) không chép ý này.
  - Ngoài ra, adapter khác chạy trong tx PG có thể bị rollback sau khi đã ghi kho ngoài (audit lỗi ⇒ tài liệu Mongo mồ côi). Port
    không nói adapter phải dùng outbox (WDP đang dùng outbox).
- **Cách sửa (chỉ tài liệu, ~10 phút):**
  1. README `:48` viết lại: "`AiInvocationRepo.findOwned` đọc `result` và lấy sự tồn tại của hàng `ai_invocation_contents` làm dấu
     chưa purge; cả hai do `recordAdmitted`/`recordAnswered` của bản PG ghi. Kho khác phải hoặc vẫn ghi hàng PG (ít nhất
     `invocation_id`, `created_at`, `result`), hoặc sửa `findOwned` + `purge` sang dấu của mình (WDP: `ai_invocation_results`)."
  2. README `:50-53` thêm: "Mọi method chạy trong tx PG của caller, tx có thể rollback ⇒ không ghi kho ngoài trực tiếp trong method;
     dùng outbox ghi trong `tx` rồi worker đẩy sau commit."
  3. JSDoc lớp `AiInvocationHistoryStore` thêm 2 câu tương ứng. JSDoc `recordAdmitted` thêm: "`AiInvocationRepo.findOwned` relies on
     what the PostgreSQL store writes here".
- **Test:** không bắt buộc. Tùy chọn: một ca integration ghim "lần gọi không có hàng content ⇒ GET 404" (đã có ở
  `invocation-repo.integration-spec.ts` "reads no call whose content was purged"), dẫn chiếu từ README.

### O-1 — Optional — `find` của port trả thuộc tính của `ai_invocations` (`organizationId`, `providerMode`)

- **Vị trí:** `invocation-history-store.types.ts:26`, `invocation.types.ts:81-90`, `invocation-content.repo.ts:44-68`.
- **Vấn đề:** adapter không phải PG vẫn phải join PG để điền 2 trường không thuộc lịch sử. Làm được vì có `tx`, nhưng là rò ranh giới:
  `recordAdmitted` không nhận `providerMode`, nên adapter Mongo không thể tự có trường này.
- **Sửa (nếu muốn, không đổi wire):**
  - port `find` trả `Omit<InvocationContentRecord, 'organizationId' | 'providerMode'> | null`;
  - `InvocationContentQueryService.read` lấy `organizationId`/`providerMode` qua method mới `AiInvocationRepo.ownerAndModeOf(tx, id)`.
  - Vẫn đúng 5C-Q3 = A (record | null).
  - Test: `invocation-content-query.service.spec.ts` sửa fake; integration `invocation-content-http` giữ nguyên kỳ vọng wire.
  - Nếu không làm, ghi một dòng trong README (R-2).

### O-2 — Optional — Không test nào ghim `recordAdmitted` cùng tx với `insert` và audit `REQUESTED`

- **Vị trí:**
  - `test/support/ai-assist-fakes.ts:79` (`insert` không ghi `steps`, bỏ qua `tx`);
  - `queue-summary.service.spec.ts:189` chỉ kiểm `steps[0] === 'recordAdmitted'`.
- **Mutation sống sót:** bọc `this.history.recordAdmitted(...)` ở `queue-summary.service.ts:204` (hoặc `:308`) trong một
  `this.runner.run` riêng. Unit vẫn xanh, integration vẫn xanh (hàng content vẫn có), dù bất biến "cùng một tx" (spec A2) bị phá.
- **Sửa:**
  - `FakeInvocationRepo.insert(tx, …)`: `this.steps.push({ step: 'insert', tx })`.
  - Thêm 2 ca ở `queue-summary.service.spec.ts`:
    - admitted: `steps` đầu = `['insert', 'recordAdmitted', 'audit:AI_INVOCATION.REQUESTED']`, `new Set(tx).size === 1`;
    - unreadable: `['insert', 'recordAdmitted', 'audit:…REQUESTED', 'audit:…FAILED']`, cùng tx.
  - Ca unreadable hiện tại (`steps[0] === 'recordAdmitted'`) sửa lại cho khớp.

### O-3 — Optional — Assertion ở repo test thành rỗng nghĩa sau khi tách port

- **Vị trí:** `test/integration/ai-assist/invocation-repo.integration-spec.ts:210-223`, ca "a run that ends after that writes nothing",
  dòng `expect(row.content?.promptText).toBeNull()`.
- **Vấn đề:** `finish` không còn ghi content nên assertion luôn đúng. Bất biến "run thua cuộc đua không ghi content" nay chỉ có unit
  fake ghim (`queue-summary-run.service.spec.ts`, ca "lost the race"), không còn ca nào trên PostgreSQL thật.
- **Sửa:**
  - Thêm một ca integration dựng `QueueSummaryRunService` với `AiInvocationRepo` + `AiInvocationContentRepo` thật (hoặc qua
    `AiSummaryHarness`): `expire` lần gọi trước khi `finish` ⇒ hàng content `prompt_text IS NULL` và không có audit `COMPLETED`.
  - Hoặc đổi tên ca repo cho đúng việc nó kiểm (`finish` trả false).

### O-4 — Optional — Tài liệu cấu hình còn trỏ repo `AI-SERVICE` (SEP) trong khi Owner chốt dịch vụ WDP

- **Vị trí:** `src/modules/ai-assist/README.md:61` ("SPEC §9.4 của repo `AI-SERVICE`"), `.env.example:134`
  ("AI-SERVICE SPEC 9.4"), README `:135` (`AI-SERVICE/eval/validators.py`).
- **Thực tế:** URL/Secret vẫn đúng với WDP (`modal_app.py:23` `APP_NAME = "saas-sentry-ai"`, `:40` Secret `saas-sentry-ai`), nên
  không sai hành vi; chỉ trỏ sai nguồn.
- **Sửa:**
  - Thay bằng "repo AI service WDP (`WDP301-FA26-GR8/AI-service`, `modal_app.py`, README)";
  - `validators.py` trỏ `eval/validators.py` của repo WDP (cùng tên);
  - thêm dòng `/healthz modelId ≠ stub` (gộp với R-1).

### O-5 — Optional — Dòng hạng mục trên roadmap còn trạng thái cũ

- **Vị trí:** `docs/roadmap.md:445`, cột triển khai: "(chưa commit, `Bao_dev_be`)".
- **Vấn đề:** `plan.md:6-11` đã cập nhật (B6), roadmap thì chưa; dòng lịch sử 17/11 (`:1177`) đúng.
- **Sửa:** đổi thành "commit `501c3c08`, merge vào `feat/p5-c-ai` 17/11/2026; chưa PR". Chạy
  `pnpm exec prettier --write docs/roadmap.md` (bảng canh cột lại), rồi `pnpm rules:format`.

### N-1 — Nit — Mô tả OpenAPI của `simulated` bằng tiếng Việt, lạc giữa các mô tả tiếng Anh

- **Vị trí:** `queue-summary.dto.ts:55-58` (đã lên `openapi.json`).
- **Sửa:** viết như mô tả `providerMode` (`invocation-content.dto.ts`): "True when the summary was composed by the simulation, not
  the AI model; the FE always shows the label 'Giả lập — không phải AI'." Sau đó `pnpm openapi:export`.

### N-2 — Nit — Comment dài hơn khổ dòng của tệp

- **Vị trí:** `invocation/invocation.repo.ts:63`, `:70`, `:133` (~150–175 ký tự). Prettier không bẻ comment nên `format:check` không
  bắt; phần còn lại của tệp bẻ ở ~135.
- **Sửa:** bẻ thành JSDoc nhiều dòng.

### N-3 — Nit — Viết lại dòng lịch sử thay vì thêm dòng mới

- **Vị trí:** `docs/workspace/items/ai-provider-mode/spec.md:142`.
- **Vấn đề:** mục ngày 09/11 nay ghi tên migration `20261117120000…` (tên có từ 17/11).
- **Sửa:** giữ tên cũ ở dòng 09/11, thêm một dòng 17/11: "đổi tên thành `20261117120000_ai_provider_mode` (DB-15, prompt 5c)".

---

## FYI cho điều phối

- Số đếm tham số trên nhánh là **30** (dev 29, C +1), có ở 3 chỗ:
  - `parameter-definitions.policy.spec.ts` (tiêu đề "thirty", `EXPECTED_KEYS`);
  - `operating-parameters-http.integration-spec.ts:471` (`toBe(30)`);
  - `api-collection-registry-exceptions.ts:81` (`maxItems: 30`).

  Khi merge vào `feat/p5` sau A2 (−2) và A1 (−1, +3 nếu S20-Q4 = A) phải đếm lại từ `PARAMETER_DEFINITIONS`.
- Breaking FE: không có. Chỉ **thêm** trường bắt buộc `simulated` (GET tóm tắt) và `providerMode` (nội dung Super Admin).
- Lệch spec đã khai trong `plan.md`: `QueueSummaryService` hỏi `runs.canAnswerIn(mode)` thay vì giữ `AiServiceClients` (max-params 8).
  Chấp nhận được.
- Chưa thấy `verify-logs/p5/C-DONE.md` (báo cáo của chat C theo `P5-COMMON.md` §2).

## Kết luận

- Không có Critical.
- 2 Required: R-1 (QĐ-102f với bản WDP), R-2 (tài liệu port). Cả hai sửa nhỏ: R-1 khoảng 1 giờ kèm test, R-2 khoảng 10 phút.
- CI đủ job xanh trên `e50ac580`.
- **Merge vào `feat/p5`: được, sau khi sửa R-1 và R-2.** Nếu Owner chọn chấp nhận rủi ro R-1 bằng quy trình (không bao giờ deploy WDP
  `AI_DEPLOY_GPU=0`), thì ghi `D-n` và merge chỉ cần R-2.

---

## Verify của điều phối 123 (17/11 ~05:00)

**Kết luận:** nhánh C **ĐẠT**, chờ merge vào `feat/p5` theo thứ tự A2 → A1 → C → B.

- **FIX:** chat 88 sửa đủ 5 mục được giao (R-1 `b5fcbb59`, R-2 `ffc3f617`, O-2 `78283f8c`, O-3 `d1f50e02`, O-4 `d4fcba5a`). Tôi đã tự đọc diff của R-1 và R-2.
- **CI:** run 43960204285 trên `d4fcba5a` xanh mọi job (quality, http-contract, integration 1–3, integration-inband, e2e-smoke); `Deploy to VPS` skipped.
- **Mutation R-1:** đổi `=== STUB_MODEL_ID` thành một giá trị khác thì `ai-service-client.service.spec.ts` đỏ 1/26. Đã hoàn nguyên, worktree sạch.
- **Migration** `20261117120000_ai_provider_mode`: tự đọc, an toàn với dữ liệu cũ (thêm cột có default rồi bỏ default; unique index chỉ thêm một cột vào index cũ).
- **Để 4b:** O-1, O-5, N-1…N-3.

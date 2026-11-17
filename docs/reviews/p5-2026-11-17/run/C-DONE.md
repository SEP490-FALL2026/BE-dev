# C-DONE — P5-C AI (chỉ BE), 17/11/2026

Nhánh `feat/p5-c-ai` (từ `dev` `94a8ee84`), worktree `Code/be-p5-c`, commit cuối `e50ac580`, đã push `origin/feat/p5-c-ai`.

## Skill đã dùng
- `agent-skills:incremental-implementation` (process, lát mỏng, mỗi task một commit).
- `agent-skills:test-driven-development` (test đỏ trước cho hành vi mới của port).
- `be-quick-check` (bộ kiểm nhanh của repo BE).
- `superpowers:verification-before-completion` (mọi kết quả dưới đây là lệnh thực chạy; phần chưa chạy ghi rõ).

## Task → commit → kết quả

| Task | Commit | Lệnh | Kết quả |
| --- | --- | --- | --- |
| C1 merge `origin/Bao_dev_be` (501c3c08), 3 xung đột, M1 đổi tên migration, M3 số đếm, B6 | `1b45378d` | `prisma:validate`, `prisma:generate`, `typecheck`, `lint`, `arch:check`, `rules:check`, `rules:format`, `test:gates`, `openapi:export` | tất cả xanh; gates 16 suite / 335 test; openapi không drift sau xuất |
| C2 kiểm merge | (cùng `1b45378d`) | `pnpm test -- src/modules/ai-assist src/modules/operating-parameters`; `test:integration -- test/integration/ai-assist test/integration/operating-parameters --maxWorkers=1` | unit 16 suite / 303 test; integration 11 suite / 138 test, 0 đỏ (gồm `queue-summary-approver`, nợ test đã biết nay xanh) |
| C3+C4 port `AiInvocationHistoryStore` + bản PG + 3 service/purge/DI | `f2a4cb2e` | `typecheck`, `lint`, `arch:check`, unit `ai-assist` (14 suite / 267 test), integration `test/integration/ai-assist` (8 suite / 100 test sau khi chạy lại 2 file timeout `beforeAll` do máy tải), `test:gates` (16 suite / 335 test) | xanh; subagent Sonnet làm, tôi kiểm lại commit và grep A8(5)(6) độc lập |
| C5 tài liệu (module card, plan, roadmap) | `e50ac580` | `rules:check` (564 file, 0 lỗi), `rules:format` | xanh |

Grep A8(5): `AiInvocationContentRepo` trong `src/modules/ai-assist` chỉ còn ở `invocation-content.repo.ts` và hai `*.module.ts`. A8(6): `aiInvocationContent` không còn trong `invocation.repo.ts` (`content` chỉ còn trong `findOwned`). Không có migration mới cho port. `git grep 20261109100000` = 0.

`pnpm check`, `test:http` và full suite KHÔNG chạy local (theo chỉ đạo điều phối); chạy ở CI.

## CI GitHub
Run https://github.com/SEP490-FALL2026/BE-dev/actions/runs/43950876883 trên `e50ac580`: **success**. select, quality, http-contract, e2e-smoke, integration (1)(2)(3), integration-inband đều success; Deploy to VPS skipped (đúng, không phải nhánh deploy).

## D-n (tự chốt, Owner duyệt sáng)
- **D-1** Lệch spec A2: thêm `history` làm `QueueSummaryService` có 9 tham số, vượt lint `max-params` 8 và rule cấm suppression. Chọn: bỏ inject `AiServiceClients` khỏi `QueueSummaryService`, thêm `QueueSummaryRunService.canAnswerIn(mode)` (ủy quyền `clients.forMode(mode).configured()`); lỗi `AiProviderUnavailableError` ném cùng chỗ nên hành vi không đổi. Thứ tự constructor `QueueSummaryService`: `(runner, repo, history, source, parameters, organizations, audit, runs)`. **WDP cần biết khi `git apply --3way`.** Phương án khác: tách service con; không chọn vì rộng hơn phạm vi.
- **D-2** `docs/roadmap.md`: lấy bản `dev`, chèn lại 3 dòng của Bao (hạng mục, lịch sử, độ phủ AC-16/17 đổi `deferred` → `full`); prettier canh lại các bảng có dòng mới nên diff vs `dev` là 37 dòng thêm / 35 xóa (spec cho phép).
- **D-3** Link tới `SPEC-5C-AI.md` trong `plan.md` ghi bằng chữ, không là link (thư mục `docs/reviews/p5-2026-11-17/` chưa commit nên `rules:check` báo link chết).
- **D-4** `parameter-definitions.policy.spec.ts` ca "describes the notice review…": giữ tiêu đề của `dev` (Bao dùng bản cũ dài hơn); thân ca không đổi.

## Số đếm tham số trên nhánh
`PARAMETER_DEFINITIONS` = **30** khóa (dev 29 + `AI_PROVIDER_MODE`). Đã đặt: tiêu đề spec "pins the thirty keys", `parameters.size` = 30, `api-collection-registry-exceptions.ts` `maxItems: 30`. Điều phối đếm lại khi merge A2/A1 (A2 gỡ `BUDGET_ZBB_*`, A1 gỡ/thêm tham số điểm điều chỉnh).

## Thông báo mới cho 5b
Không có (`ai-assist` không phát thông báo). Lưu ý: 5b không chạm lỗi `AI.*` tới khi C merge (PLAN §B-Xung đột).

## Breaking FE
Không. Chỉ thêm: `simulated` (bắt buộc trong response `GET` tóm tắt) và `providerMode` (nội dung Super Admin); diff `openapi.json` vs `dev` chỉ có hai trường đó và câu mô tả của `aiAccessRequestSummaryCreate`. Màn tham số hiện thêm select `AI_PROVIDER_MODE` (`SIMULATED`/`MODEL`). FE phải hiện nhãn "Giả lập — không phải AI" khi `simulated: true`. Máy dev đã áp tên migration cũ `20261109100000` phải `prisma migrate reset` DB local.

## Nợ test
Không có. (Hai file integration timeout `beforeAll` 120 s lúc máy tải đã chạy lại riêng và xanh.)

## Nghi lỗi logic
Không.

## Đã cắt / Chưa làm
- **Bỏ theo Owner 17/11:** A3/A4 và B-Task AI repo (S1–S6), không đụng `AI-module-SEP`; AI service dùng bản WDP.
- **Chưa làm:** không có adapter MongoDB (việc của WDP-1: cài adapter vào port, chọn theo `AI_HISTORY_STORE`); `5C-Q1` ngày xóa lịch sử vẫn theo quy tắc README của repo AI (Owner điền ngày).
- **Chưa kiểm contract với `Ai-service-WDP`:** spec 5c chỉ đổi lưu lịch sử, không đổi `AiServiceClient` request/response/timeout/token; không đọc lại repo WDP trong lượt này.
- Chưa chạy local: `pnpm check`, `test:http`, full integration (CI đã xanh trên commit cuối).

---

# FIX theo AUDIT-C-review.md (17/11/2026)

Nhánh `feat/p5-c-ai` @ `d4fcba5a`, đã push. CI run https://github.com/SEP490-FALL2026/BE-dev/actions/runs/43960204285 trên `d4fcba5a`: **success**
(select, quality, integration (1)(2)(3), integration-inband, http-contract, e2e-smoke; Deploy to VPS skipped).

| Mục | Commit | Việc | Kiểm local |
| --- | --- | --- | --- |
| R-1 | `b5fcbb59` | `HttpAiServiceClient.answerOf` ném `AiServiceUnavailableError(200, null)` khi `modelId === 'stub'` (`STUB_MODEL_ID` ở `ai-service.types.ts`); unit mới đỏ trước khi sửa rồi xanh (71/71 unit `ai-service`); scenario integration mới ở `queue-summary-failures` (21/21): FAILED `AI.PROVIDER_UNAVAILABLE`, `simulated:false`, không lưu nội dung; `FakeAiService` nhận `modelId` tùy chọn; README ghi deploy WDP phải có GPU và `/healthz` `modelId` ≠ `stub` | typecheck, eslint file chạm, arch, rules:check, rules:format |
| R-2 | `ffc3f617` | Chỉ tài liệu: README và JSDoc port ghi `findOwned` đọc hàng `ai_invocation_contents` (dấu chưa purge) và cột `result` do bản PG của `recordAdmitted`/`recordAnswered` ghi; adapter khác phải giữ phần đó ở PG hoặc sửa `findOwned` + `purge`; không ghi kho ngoài trực tiếp trong method, dùng outbox | typecheck, rules:check, rules:format |
| O-2 | `78283f8c` | `FakeInvocationRepo.insert` ghi `insert` + `tx` vào `steps`; thêm `firstSteps(n)`; `queue-summary.service.spec.ts` ghim `['insert','recordAdmitted','audit:…REQUESTED']` (+ `audit:…FAILED` ca unreadable), 1 transaction. Đột biến (bọc `recordAdmitted` vào `runner.run` riêng) làm ca admitted đỏ, đã khôi phục | unit `queue-summary` 174/174; file spec đúng 400 dòng (gate) |
| O-3 | `d1f50e02` | Chọn phương án đổi tên: ca repo thành "a finish after that is refused", bỏ assertion rỗng nghĩa. Bất biến "run thua cuộc đua không ghi content" đã có ca PG thật qua HTTP: `queue-summary-failures` "its late COMPLETED end changes nothing" (`prompt_text`/`raw_response`/`result` null, không audit COMPLETED) | integration `invocation-repo` 9/9 |
| O-4 | `d4fcba5a` | README module và `.env.example` trỏ AI service bản WDP (`WDP301-FA26-GR8/AI-service`, `modal_app.py`, `eval/validators.py` của repo WDP) | rules:check, rules:format |

## D-n bổ sung
- **D-5** (R-1): chặn stub ở BE (FAILED `AI.PROVIDER_UNAVAILABLE`, không lưu), theo chỉ đạo điều phối. Phương án thay: gắn `simulated` cho câu stub; không chọn vì stub không qua bộ kiểm giống câu giả lập. Đổi `STUB_MODEL_ID` nếu WDP đổi `modelId` của `StubRunner`.
- **D-6** (O-3): đổi tên ca thay vì dựng thêm ca integration, vì scenario HTTP thật trên PostgreSQL đã ghim bất biến.
- **Chưa làm (audit, ngoài 5 mục được giao):** O-1 (`find` trả `organizationId`/`providerMode`, đã ghi vào README R-2), O-5 (dòng hạng mục roadmap còn "chưa commit"), N-1 (mô tả OpenAPI `simulated` tiếng Việt), N-2 (comment dài ở `invocation.repo.ts`), N-3 (viết lại dòng lịch sử `spec.md:142`).

Local chỉ chạy bộ nhanh; `pnpm check`, `test:http`, full suite do CI chạy (xanh trên `d4fcba5a`).

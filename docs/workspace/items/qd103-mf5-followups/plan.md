# Plan: qd103-mf5-followups

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `bc10bd1c` (đọc ở `46b6a94e`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W8, subagent số 3, 08–09/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **hai lượt** — Phase 1 thông báo/thư/độ mới (Task 1–4, Checkpoint A), Phase 2 khuyến nghị ở điểm điều chỉnh (Task 5, Checkpoint B).
  Ước ~30 file. Gói **W8**. Báo cáo hiệu suất sử dụng (Task 6–7 cũ) bỏ — ledger `NGOÀI-PHẠM-VI`.

## Before coding

Đọc `src/modules/notifications/README.md` (outbox, `EmailTemplate`, `TokenUsability` — `actionTokenHash` null gửi không kiểm token),
`notifications/email/email-templates.mapper.ts`, `src/core/extension/listeners.ts`, `hook.ts` (`isBound()`), `licensing/public/licensing.extension-points.ts`,
`docs/rules/module-structure.md`, `scripts/arch/tiers.cjs` (`optimization` T7 sau W6: được import `budgets`, `licensing`, `usage`; `licensing` không import
`usage`/`optimization` ⟹ hai extension point), `docs/rules/api-contract.md`. Đối chiếu code sau W5/W6: nơi ghi `SUBSCRIPTION_RED_ALERT`
(`licensing/subscription-adjustment/alerts/`), `usageImportConfirm` (`usage/vendor-import/confirmation/`), khuyến nghị `G1`–`G4` và `potential-saving.policy.ts` (W6). Thiếu bất kỳ cái nào ⟹ dừng, báo chat review.

## Design review

- Thiết kế: `ready` — cổng thiết kế W8 (09/11/2026) đã chạy; chat review sửa theo kết quả và quyết định phạm vi (W8).

| Finding | Mức  | Kết luận                                                                                                                        | Sửa ở                                     |
| ------- | ---- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| DA8-07  | TB   | Đúng — `US-12-05` là báo cáo EP-12, cùng loại với `US-12-06` đã xếp ngoài; `BR-MF5-01…04` không có bước báo cáo                 | spec _Explicit out of scope_; bỏ Task 6–7 |
| DA8-12  | TB   | Đúng (không còn áp dụng) — route báo cáo bỏ cùng DA8-07; nếu Owner mở lại: phân trang `rows`, 422 cho `period` sai, bỏ `period` | Q-158/Q-159 đóng                          |
| DA8-14  | TB   | Đúng — cột cuối dòng primary phải là tên hạng mục backtick (`scripts/check-rules.mjs:86`, :165-166)                             | spec _Primary Story/AC_                   |
| DA8-21  | Thấp | Đúng — Sizing mỗi trường một dòng                                                                                               | spec _Sizing decision_                    |
| DA8-01  | Cao  | Đúng — giữ C#4, C#5, C#36, C#40 (bước MF-5/`SBF-20`)                                                                            | spec                                      |

Kiểm lại (audit, điểm đạt): `optimization` T7 import `licensing` T4 hợp lệ (`scripts/arch/tiers.cjs:3-11`).

## Tasks

### Phase 1 — thông báo theo dõi lúc cấp, độ mới nguồn, kênh thư

### Task 1: kênh thư — tham số + hai mẫu thư

- Files: `src/modules/operating-parameters/parameter-definitions.policy.ts` (+ spec), `src/modules/notifications/public/notifications.types.ts`,
  `email/email-templates.mapper.ts` (+ spec), `notifications/README.md`.
- Depends on: W5, W6 PASS.
- Acceptance: test matrix _mẫu thư_; `operatingParameterList` có `BUSINESS_EMAIL_ENABLED = OFF`.
- Verify: `pnpm exec jest src/modules/notifications/email src/modules/operating-parameters`;
  `pnpm test:integration -- test/integration/operating-parameters/operating-parameters-http.integration-spec.ts test/integration/notifications/email-outbox.integration-spec.ts`.

### Task 2: thư cảnh báo đỏ (L3-30)

- Files: `src/modules/licensing/subscription-adjustment/alerts/*` (nơi ghi cảnh báo đỏ của W5), `licensing.module.ts` (nếu cần
  `OperatingParametersApi`, `IdentityAccessApi`), test `test/integration/licensing/subscription-red-alert-email.integration-spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: test matrix C#40 bật, C#40 tắt / mã khác, `US-12-15` AC-15 thư lỗi.
- Verify: `pnpm test:integration -- test/integration/licensing/subscription-red-alert-email.integration-spec.ts test/integration/notifications/email-outbox.integration-spec.ts`;
  `pnpm exec jest src/modules/licensing/subscription-adjustment`.

### Task 3: `GrantCompletedListeners` + thông báo theo dõi lúc cấp + thư theo dõi

- Files: `src/modules/licensing/public/licensing.extension-points.ts`, `provisioning/tasks/provisioning.service.ts` (emit), `licensing.module.ts`,
  `licensing/README.md`; `src/modules/usage/vendor-import/notice/tracking-notice.service.ts` (mới), `notice/grant-tracking-notice.listener.ts` (mới),
  `vendor-import/confirmation/*` (dùng service chung), `usage.module.ts`, `usage/README.md`; test `test/integration/usage/tracking-notice-on-grant.integration-spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: test matrix C#4, C#4 phủ định, _thư theo dõi_; test W6 xác nhận hiện có vẫn xanh.
- Verify: `pnpm exec jest src/modules/usage/vendor-import src/modules/licensing/provisioning`;
  `pnpm test:integration -- test/integration/usage/tracking-notice-on-grant.integration-spec.ts test/integration/licensing/provisioning-grant-http.integration-spec.ts`;
  `pnpm test:integration -- test/integration/usage` (các file xác nhận của W6); `pnpm arch:check`.

### Task 4: `lastImport`, `ageDays`, `stale` trên `usageSource*`

- Files: `src/modules/usage/vendor-source/vendor-source.{dto,repo,service}.ts`, test http/integration nguồn của W6 (thêm ca), `test/support/openapi-example-manifest.ts`.
- Depends on: none (song song Task 1–3).
- Acceptance: test matrix C#5 (gồm đếm câu lệnh bằng `test/support/query-count.ts`).
- Verify: `pnpm exec jest src/modules/usage/vendor-source`; `pnpm test:http -- test/http/usage`; `pnpm openapi:export`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` — diff chỉ ở
`usageSource*`, `operatingParameter*`). `pnpm test:flows -- test/flows/mf5-ghost-seat.flow-spec.ts` (sẽ có sau W6). Ghi _Verification_.

### Phase 2 — khuyến nghị ở điểm điều chỉnh

### Task 5: `AdjustmentRecommendationsHook` + `openRecommendations`

- Files: `licensing/public/licensing.extension-points.ts`, dto + service `subscriptionAdjustmentGet` (`licensing/subscription-adjustment/`),
  `src/modules/optimization/ghost-seat/ghost-seat-open-recommendations.service.ts` (mới, bind hook), `optimization.module.ts`; test
  `test/integration/optimization/adjustment-open-recommendations.integration-spec.ts` (mới), http spec điểm điều chỉnh của W5.
- Depends on: Checkpoint A; W6 `qd103-ghost-seat-g3-g4` PASS.
- Acceptance: test matrix C#36; `usage` không còn trong response (OpenAPI ghi đổi).
- Verify: `pnpm test:integration -- test/integration/optimization/adjustment-open-recommendations.integration-spec.ts`;
  `pnpm exec jest src/modules/optimization/ghost-seat src/modules/licensing/subscription-adjustment`; `pnpm arch:capabilities --module optimization`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; `openapi:export` diff chỉ ở `subscriptionAdjustmentGet`; `pnpm arch:capabilities --module optimization`,
`--module licensing` không vòng; tự review spec mục 4. Ghi _Verification_. Commit cục bộ một commit.

## Lệch so với thiết kế

(chat code ghi khi implement)

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).

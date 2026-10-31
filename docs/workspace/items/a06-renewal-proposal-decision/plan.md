# Plan: gia hạn subscription — đề xuất của IT Admin và quyết định của Người duyệt chi

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: AI theo giao việc A-06 (sở hữu thiết kế, implementation, test). Thiết kế ban đầu bởi: AI theo giao việc A-06.
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `verified` (local, chưa commit; bằng chứng từ worktree cô lập tại `6eb12d1`). PR: chưa có.

## Before coding

Đã đọc AGENTS/CONTRIBUTING/ARCHITECTURE, `docs/rules/module-structure.md`, `database-business.md`, `work-item-sizing.md`, test
guide, `EP-11`, `MF-4`, `DEV-A.md` A-06, `DEV-B.md` B-07. Đối chiếu code BE `6eb12d1`: `deriveNotice` (catalog) đã là bảng chọn
mốc; `RevocationService.open` đã gộp nhiều lý do và bảng người xác nhận có nguồn `SUBSCRIPTION_*`; chưa có chuỗi kỳ subscription.

## Tasks

### Task 1: migration enum và chuỗi kỳ

- Files: `prisma/migrations/20261101000000_licensing_renewal_carry_source`, `20261101000100_catalog_subscription_renewal_chain`,
  `prisma/models/{catalog,licensing,organization}.prisma`.
- Depends on: none.
- Acceptance: `RENEWAL_CARRY` thêm trong migration riêng (không đảo được — `DB-05`); `renewed_from_id` unique, FK, trigger.
- Verify: `prisma migrate deploy` + `prisma migrate diff --exit-code` trên DB tạm → `No difference detected`.

### Task 2: migration bảng gia hạn

- Files: `prisma/migrations/20261101000200_licensing_subscription_renewals`.
- Depends on: Task 1.
- Acceptance: ba bảng, CHECK theo giai đoạn, trigger đóng băng, CHECK predecessor của `RENEWAL_CARRY`.
- Verify: drift check như Task 1; integration `subscription_renewals_decision_is_final`.

### Task 3: catalog `SubscriptionPeriodApi`

- Files: `src/modules/catalog/public/subscription-period.*`, `subscription/subscription-period.service.ts`, `subscription.repo.ts`,
  `subscription.types.ts`, `catalog.module.ts`, gate `module-graph`.
- Depends on: Task 1.
- Acceptance: đọc kỳ + mốc + kỳ nối tiếp; liệt kê đối tượng quét; ghi kỳ mới nối chuỗi một lần.
- Verify: `pnpm typecheck`, `pnpm arch:check`, `pnpm test:gates`.

### Task 4: đề xuất, hàng đợi, quyết định

- Files: `src/modules/licensing/subscription-renewal/**` (trừ `outcome/`, `alerts/`, `deadline/`), `licensing.module.ts`,
  `public/licensing.extension-points.ts`, `public/licensing-subscription-renewal.types.ts`, notifications codes, gate ownership.
- Depends on: Task 2, Task 3.
- Acceptance: AC của spec; không tạo commitment.
- Verify: `pnpm exec jest src/modules/licensing/subscription-renewal`, `pnpm test:http -- test/http/licensing/subscription-renewals.http-spec.ts`,
  `pnpm test:integration -- test/integration/licensing/subscription-renewal-decision.integration-spec.ts`.

### Task 5: hợp đồng OpenAPI và artefact sinh

- Files: `openapi.json`, `docs/generated/{module-graph,routes}.md`, `test/support/api-coverage-manifest.ts`,
  `test/support/openapi-example-manifest.ts`, `test/support/openapi-example-route-codes-licensing.ts`,
  `test/http/platform/openapi-presentation.http-spec.ts` (287 → 294 lúc làm hạng mục; số hiện tại do file đó giữ).
- Depends on: Task 4 (và route của `a06-renewal-execution-chain`, `a06-renewal-deadline-incident`).
- Acceptance: 7 operation mới có manifest, ví dụ, 422.
- Verify: `pnpm test:http -- test/http/platform`, `pnpm arch:docs:check`.

### Checkpoint

`pnpm typecheck`, `pnpm lint` (file đổi), `pnpm arch:check`, `pnpm test:gates`, unit + HTTP + integration của gia hạn.

## Verification and handoff

| Lệnh / kiểm tra AC                                                           | Revision / môi trường                 | Kết quả thực chạy                                                                             | Giới hạn / việc còn lại                                    |
| ---------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm typecheck`                                                             | worktree cô lập trên `6eb12d1` + diff | xanh                                                                                          | —                                                          |
| `pnpm arch:check`, `pnpm test:gates`                                         | như trên                              | xanh (16 gate, 317 test)                                                                      | —                                                          |
| `pnpm exec jest src/modules/licensing/subscription-renewal …`                | như trên                              | xanh                                                                                          | —                                                          |
| `pnpm test:http -- test/http/licensing/subscription-renewals.http-spec.ts`   | như trên                              | 34/34                                                                                         | —                                                          |
| `pnpm test:integration -- test/integration/licensing/subscription-renewal-*` | Docker `slm-test-a06` (PG 17)         | 24/24                                                                                         | —                                                          |
| drift `prisma migrate diff --exit-code`                                      | DB tạm trong `slm-test-a06`           | `No difference detected`                                                                      | —                                                          |
| `pnpm openapi:export`                                                        | Node 24.0.2, đường dẫn có ký tự Việt  | lỗi môi trường (V8 fast API) — sinh bằng `node --no-turbo-fast-api-calls -r ts-node/register` | spec `openapi-export.http-spec` spawn lỗi cùng nguyên nhân |

- [x] AC trong scope có bằng chứng; blocker ghi ở spec và `a06-renewal-open-inputs`.
- [x] Spec/plan phản ánh implementation; scope map G8 ở `docs/roadmap.md`.
- [x] Diff đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Owner review trên revision cụ thể; chưa `merged-dev`/`accepted`.

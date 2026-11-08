# Plan: qd103-shared-pool-subscription

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `b9854ef5`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W1, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `verified` (kiểm local 08/11/2026, chat code; commit cục bộ, chưa push). PR: chưa có.

## Before coding

Đọc `AGENTS.md`, `docs/rules/database-business.md`, `docs/rules/api-contract.md`, `src/modules/catalog/README.md`. Làm sau
`qd103-calendar-fiscal-year` (cùng chạm `requests/access-request/pricing.policy.ts`). Không đổi enum `BillingCycle`.

## Design review

Audit thiết kế bằng subagent chỉ-đọc (cổng thiết kế tracker §3, chạy bù sau khi đã giao code), 08/11/2026: 5 Cao, 6 TB, 7
Thấp; kết luận **CẦN SỬA** ⟹ spec/plan đã sửa cùng ngày (spec _Changes and acceptance_). Phần chặn trùng chuyển W4; các
finding của phần đó được chép vào hạng mục W4 khi thiết kế.

## Tasks

### Task 1: migration trường thuê bao dùng chung

- Files: `prisma/models/catalog.prisma`, `prisma/migrations/<ts>_shared_pool_subscription_fields/migration.sql`, client sinh,
  `test/integration/catalog/shared-pool-subscription-fields-migration.integration-spec.ts` (mới, theo mẫu
  `document-final-key-migration.integration-spec.ts`).
- Depends on: `qd103-calendar-fiscal-year`.
- Acceptance: 4 cột + CHECK + unique partial; backfill kỳ cam kết; enum giữ nguyên.
- Verify: `pnpm test:integration -- test/integration/catalog/shared-pool-subscription-fields-migration.integration-spec.ts`.

### Task 2: khai báo/sửa thuê bao với trường mới, cảnh báo, thuê bao chính

- Files: `catalog/subscription/{subscription.dto.ts, subscription.policy.ts(+spec), subscription.service.ts,
subscription-change.service.ts, subscription.repo.ts, subscription.mapper.ts, subscription-view.service.ts,
subscription.errors.ts, subscription.http-errors.ts}`, `catalog/public/*types.ts`, README `catalog`.
- Depends on: Task 1.
- Acceptance: test matrix R-G01, R-E01, R-E03, Q-09, Q-04, `vendorMinimumSeats`.
- Verify: `pnpm exec jest src/modules/catalog/subscription`; `pnpm test:http -- test/http/catalog/subscription-purchase.http-spec.ts`;
  `pnpm test:integration -- test/integration/catalog/subscription-owner-department.integration-spec.ts` (+ spec mới cho thuê bao chính).

### Task 3: kỳ gia hạn kế thừa trường

- Files: `catalog/subscription/subscription-period.service.ts` (+ test).
- Depends on: Task 2.
- Acceptance: test matrix _kỳ gia hạn_.
- Verify: `pnpm test:integration -- test/integration/licensing/subscription-renewal-outcome.integration-spec.ts`.

### Task 4: fixture seed v3 nạp được

- Files: `src/cli/seed/fixture/shared-demo-v3/*`, `src/cli/seed/steps/catalog.steps.ts`.
- Depends on: Task 2.
- Acceptance: seed tạo thuê bao `ACTIVE` có kỳ cam kết + IT Admin phụ trách; dữ liệu trùng giữ nguyên (W7 gộp).
- Verify: `pnpm exec jest src/cli/seed`.

### Checkpoint

Kiểm tra nhanh tracker §4.5; `openapi:export` drift chỉ ở 5 operation `subscription*`. Tự review diff theo spec.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                         | Revision / môi trường                            | Kết quả thực chạy                                                                                                                                    | Giới hạn / việc còn lại                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm exec jest src/modules/catalog` (R-G01, R-E01, Q-09, R-E03: `pool/subscription-pool.policy.spec.ts` 7 test; `subscription.policy.spec.ts`)                                                                            | `feat/qd103-108-mf145` trên `b9854ef5` + diff W1 | 317 test xanh                                                                                                                                        | —                                                              |
| `pnpm test:integration -- test/integration/catalog/shared-pool-subscription-http.integration-spec.ts` (R-G01, R-E01, R-E03, Q-09, Q-04, `vendorMinimumSeats`, thuê bao chính tuần tự và song song, `PRIMARY_NOT_ELIGIBLE`) | như trên, PostgreSQL 17 riêng                    | 11 test xanh                                                                                                                                         | song song: xem _Lệch_ (2)                                      |
| `…/shared-pool-subscription-fields-migration.integration-spec.ts` (deploy lịch sử trước migration bằng Prisma, ghi thuê bao cũ, chạy migration)                                                                            | như trên                                         | 1 test xanh: kỳ `MONTHLY`→1, `ANNUAL`/`QUARTERLY`/`OTHER`→12, `K1`→1, `PERPETUAL` NULL; enum `BillingCycle` giữ; CHECK 23514, FK 23503, unique 23505 | —                                                              |
| Kỳ gia hạn kế thừa trường (`recordNext`)                                                                                                                                                                                   | như trên                                         | **chưa có test riêng**: `subscription-renewal-outcome` xanh (hồi quy), nhưng chưa assert 4 trường ở kỳ mới                                           | việc cho review/W5 — ghi ở báo cáo                             |
| `pnpm exec jest src/cli/seed` (fixture v3 có kỳ cam kết + IT Admin phụ trách)                                                                                                                                              | như trên                                         | 113 test xanh                                                                                                                                        | `pnpm test:flows` (seed thật) **chưa chạy**                    |
| `pnpm test:integration` theo thư mục `catalog licensing data-import operating-parameters` + 2 file requests                                                                                                                | như trên                                         | 88 file / 1044 test xanh                                                                                                                             | —                                                              |
| `pnpm test:integration` theo thư mục `requests personnel budgets organization ai-assist audit dashboards identity-access notifications onboarding` (cùng catalog/licensing/data-import)                                    | như trên, **trước** khi chuyển nhóm `pool/`      | 319 file: 290 xanh, 29 đỏ do tải (503, quá hạn, "template đang được giữ"); chạy lại 29 file đó `--maxWorkers=3`: 29/29 xanh (304 test)               | lượt cuối sau khi chuyển file chỉ chạy lại 88 file ở dòng trên |
| `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`                                                                                                                                    | như trên                                         | xanh (gates 16 file / 330 test; đã cập nhật registry ngoại lệ collection của `subscriptionList` và catalog mã lỗi OpenAPI)                           | —                                                              |
| `pnpm openapi:export`; `pnpm arch:graph`                                                                                                                                                                                   | như trên                                         | drift chỉ ở `subscriptionCreate/Update/Complete` + 5 schema `Subscription*`; `module-graph.md` sinh lại                                              | —                                                              |
| `pnpm test:http` `catalog data-import operating-parameters platform`; `pnpm test:e2e`                                                                                                                                      | như trên                                         | xanh (http 27 file; e2e 11 file / 50 test)                                                                                                           | —                                                              |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (trừ dòng _kỳ gia hạn_ ở trên).
- [x] Spec/plan phản ánh implementation cuối.
- [x] Diff cuối đã tự review; `pnpm check`, `test:flows`, `test:integration:serial`, `test:scripts` và toàn bộ suite CHƯA chạy (ghi rõ).

### Lệch so với thiết kế

1. Luật kho nằm ở nhóm `catalog/subscription/pool/` (`subscription-pool.policy.ts` thuần + `subscription-pool.service.ts`), không ở `subscription.policy.ts`: thư mục `subscription/` đã đủ 25 file và spec policy vượt 400 dòng (gate `module-layout`). `SubscriptionChangeGuard` chuyển tiếp sang service nhóm để constructor `SubscriptionChangeService` không vượt 8 tham số.
2. Đặt cờ chính song song: khóa `plans FOR UPDATE` làm hai lần `PATCH` xếp hàng nên **cả hai 200**, kết quả đúng một thuê bao chính (người sau thắng); 409 `PRIMARY_CONFLICT` chỉ còn là lưới an toàn khi vướng unique index. Test kiểm "đúng một cờ, không 500", không kiểm "một 409".
3. `responsibleItAdminEmployeeId` bắt buộc cho **mọi** thuê bao thành `ACTIVE` (cả mua đứt `PERPETUAL`) — spec không loại mua đứt.
4. Quy tắc kho (`assertPoolTerms`, người phụ trách) chỉ chạy khi ghi làm bản nháp thành `ACTIVE` hoặc khi ghi đụng chu kỳ/kỳ cam kết/người phụ trách; sửa trường khác của dữ liệu cũ không bị chặn.
5. `NextPeriodInput.billingCycle` và DTO ghi kết quả gia hạn (`licensing`) vẫn nhận `QUARTERLY`/`OTHER`: kỳ mới của gia hạn có thể mang chu kỳ cũ; thu hẹp là việc W5 (`SBF-20`).
6. Test harness: `SubscriptionHttpHarness.create` và `declareSubscription` (builder) tự thêm `responsibleItAdminEmployeeId` (IT Admin gọi) và kỳ cam kết theo chu kỳ khi body có `billingCycle`; mười spec gọi `POST /subscriptions` tự dựng body được thêm hai trường này.

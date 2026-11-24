# PLAN — Đợt 3 thiết kế lại: kho B1 → B2 → B3 (22/11/2026, bản 2, 24/11/2026)

Spec: [SPEC.md](SPEC.md) + [SPEC-B1.md](SPEC-B1.md), [SPEC-B2.md](SPEC-B2.md), [SPEC-B3.md](SPEC-B3.md). Trạng thái: Proposed bản 2 — chờ Owner
duyệt; mọi câu Owner đã trả lời ([SPEC §13.2](SPEC.md#132-quyết-định-owner-owner-answersmd)). Quy trình: [`docs/guides/quy-trinh-code-ai.md`](../../guides/quy-trinh-code-ai.md).
Đường dẫn file trong PLAN tính từ gốc repo; `src/modules/` viết tắt `m/`. Mỗi file `*.ts` có logic mới kèm spec **cùng thư mục, cùng tên**
(`<tên>.spec.ts`) — ghi `(+spec)`.

## Nền và nhánh

- **Điều kiện bắt đầu (K-C1, B1-R21) — cả hai phải đúng, thiếu ⟹ không tách nhánh, báo Owner:**
  1. Đợt 1 ở `dev`: `git -C <repo> --no-pager merge-base --is-ancestor 4e029dbd origin/dev && echo dot1-ok`.
  2. **Đợt 2 ở `dev`** (merge bằng squash ⟹ kiểm file, không tìm merge commit):
     `git -C <repo> --no-pager ls-tree --name-only origin/dev prisma/migrations/20261124100400_saas_issue_awaiting_assignee/migration.sql prisma/migrations/20261124100200_device_activations/migration.sql src/modules/licensing/device-activation/device-activation.service.ts src/modules/catalog/subscription/responsible/subscription-responsible.controller.ts`
     phải in đủ 4 dòng; **và** `git -C <repo> --no-pager diff --stat origin/dev origin/int/redesign-w2 -- src prisma` phải **rỗng** (đợt 2 đã
     squash hết vào `dev` — N11); và `git -C <repo> --no-pager ls-tree --name-only origin/dev docs/reviews/redesign-w3-2026-11-22/SPEC.md` in 1 dòng.
- **Nhánh làn** tách từ `origin/dev` mới nhất: `tech` (Bảo) — `feat/redesign-w3-tech`; `biz` (Owner) — làm thẳng trên `int/redesign-w3`.
- **Nhánh gộp** `int/redesign-w3` (Owner tạo từ `dev`). Mỗi phần B1, B2, B3 tự đứng được: PR `int/redesign-w3` → `dev` sau khi xong **một phần**
  (CI full xanh + review).
- **Trong một làn:** tuần tự từng gói, không song song, không worktree.

## Hai làn không sửa chung file

- Làn `tech`: migration + `prisma/models/*` (**chỉ** làn này), repo của bảng mới, route CRUD/route người phụ trách, DTO/mapper của route đó, chuyển
  dữ liệu, chuyển code đợt 2 sang lô (P20b), seed, module card `m/*/README.md`, generator.
- Làn `biz`: luật tiền, sổ số seat (facade + dịch vụ ghi), mua thêm seat, điểm điều chỉnh, `K1`, tiền `K4`, ghost seat, job, thông báo,
  `docs/rules/security-jobs.md`, `docs/rules/database-business.md` (bảng khóa gộp).
- **File chung, chỉ thêm dòng, gộp tay khi merge:** `openapi.json` (sinh bằng `pnpm openapi:export`), `test/support/openapi-example-manifest.ts`,
  `test/support/openapi-example-route-codes-catalog.ts`, `…-licensing.ts`, `…-budgets.ts`, `…-requests.ts`, `…-requests-spend.ts`,
  `…-optimization.ts`, `…-operating-parameters.ts`, `test/support/api-coverage-manifest.ts`, `m/catalog/catalog.module.ts`,
  `m/licensing/licensing.module.ts`, `m/budgets/budgets.module.ts`, `m/requests/requests.module.ts`, danh sách lỗi của các `*.errors.ts`/
  `*.http-errors.ts` **đã có** (thêm lớp/nhánh ở cuối), `m/notifications/public/notifications.types.ts`, `m/notifications/inbox/inbox.policy.ts`,
  `m/notifications/inbox/notification-text/notification-texts-subscription.types.ts`, `m/notifications/inbox/notification-target.policy.ts`,
  `test/gates/api-collection-contract.gate-spec.ts` (mục `NESTED_ARRAYS` — cần Owner duyệt; gate từ chối ⟹ dừng hỏi).
- Mọi file khác: **đúng một làn** cả đợt. Gói cần file của làn kia ⟹ dừng, ghi _Bàn giao_ ở PROGRESS.

### Tự kiểm chéo (file xuất hiện ở nhiều gói)

| File (`m/` = `src/modules/`)                                                                                                                  | Gói                         | Làn  |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---- |
| `prisma/models/catalog.prisma`, `licensing.prisma`, `budgets.prisma`, `requests.prisma`                                                       | P1, P3, P9, P11, P12a, P12b | tech |
| `m/catalog/subscription/subscription.dto.ts`, `subscription.mapper.ts`, `subscription.service.ts`                                             | P1, P9, P15, P21            | tech |
| `m/catalog/subscription/subscription.repo.ts`, `subscription-change.service.ts`                                                               | P1, P9, P21                 | tech |
| `m/catalog/subscription/subscription-view.service.ts`                                                                                         | P9, P15                     | tech |
| `m/catalog/plan/plan.mapper.ts`, `plan.repo.ts`, `plans.controller.ts`                                                                        | P1, P9                      | tech |
| `m/catalog/public/catalog-responsibility.api.ts`, `m/catalog/application-responsibility/responsibility-handover.service.ts`                   | P9, P14                     | tech |
| `m/licensing/license-key/license-key.repo.ts`                                                                                                 | P12a                        | tech |
| `m/licensing/device-activation/device-activation.repo.ts`                                                                                     | P12a, P20b                  | tech |
| `m/budgets/budget/invoice.repo.ts`                                                                                                            | P3, P12b                    | tech |
| `src/cli/seed/steps/catalog.steps.ts`, `catalog.steps.spec.ts`, `src/cli/seed/fixture/shared-demo-v4/catalog.ts`                              | P1, P9, P22                 | tech |
| `m/catalog/public/subscription-period.api.ts`, `subscription-period.types.ts`, `m/catalog/subscription/period/subscription-period.service.ts` | P2, P5, P8, P18             | biz  |
| `m/catalog/public/catalog.api.ts`                                                                                                             | P2, P16a                    | biz  |
| `m/catalog/subscription/seat-target.service.ts`                                                                                               | P13a, P16a, P20             | biz  |
| `m/catalog/subscription/obligation/subscription-obligation.policy.ts`                                                                         | P5, P10                     | biz  |
| `m/catalog/subscription/pool/subscription-pool.service.ts`                                                                                    | P10, P16a                   | biz  |
| `m/requests/access-request/pricing.policy.ts`                                                                                                 | P2, P4, P13a                | biz  |
| `src/core/term-limit.ts`                                                                                                                      | P2, P13a                    | biz  |
| `m/requests/grant/seat-release.policy.ts`, `seat-release.service.ts`                                                                          | P4, P13a                    | biz  |
| `m/requests/year-start-commitments/year-start-commitments-batch.service.ts`, `year-start-commitments.policy.ts`                               | P4, P13b                    | biz  |
| `m/requests/grant/access-request-grant.listener.ts`                                                                                           | P8, P20                     | biz  |
| `m/requests/purchase-invoice/confirmation/purchase-invoice-confirmation.service.ts`                                                           | P6, P8                      | biz  |
| `m/requests/purchase-invoice/purchase-invoice-plan.service.ts`, `purchase-invoice.dto.ts`                                                     | P6, P16b, P20               | biz  |
| `m/requests/purchase-invoice/purchase-invoice-submission.service.ts`                                                                          | P16b, P20                   | biz  |
| `m/budgets/invoice/purchase-invoice-recorder.service.ts`                                                                                      | P6, P13b, P20               | biz  |
| `m/budgets/public/budgets.api.ts`, `budgets.types.ts`                                                                                         | P4, P6, P7, P13b            | biz  |
| `m/budgets/budget/running-uncommitted.policy.ts`, `running-uncommitted-facts.service.ts`                                                      | P7, P13b                    | biz  |
| `m/budgets/shared-pool-line/shared-pool-line.policy.ts`, `shared-pool-line-facts.service.ts`, `shared-pool-line-label.policy.ts`              | P5, P19, P20                | biz  |
| `m/budgets/review/budget-review-period-writer.service.ts`                                                                                     | P4, P5                      | biz  |
| `m/licensing/shared-pool/shared-pool.policy.ts`                                                                                               | P2, P8, P16a                | biz  |
| `m/licensing/shared-pool/shared-pool.service.ts`                                                                                              | P8, P13a, P16a, P20         | biz  |
| `m/licensing/shared-pool/shared-pool-capacity.repo.ts`                                                                                        | P16a, P20                   | biz  |
| `m/licensing/shared-pool/seat-purchase.dto.ts`, `seat-purchase-route.service.ts`                                                              | P16b, P17                   | biz  |
| `m/licensing/provisioning/tasks/provisioning-grant-writer.service.ts`                                                                         | P13a, P16a, P17, P20        | biz  |
| `m/licensing/public/licensing-seat-month.api.ts`, `licensing-seat-month.types.ts`                                                             | P5, P7                      | biz  |
| `m/licensing/subscription-renewal/subscription-renewal-sweep.service.ts`                                                                      | P10, P16b, P18              | biz  |
| `m/licensing/subscription-renewal/subscription-renewal-view.service.ts`                                                                       | P18, P19                    | biz  |
| `m/licensing/subscription-renewal/savings/renewal-savings.service.ts`                                                                         | P8, P18                     | biz  |
| `m/catalog/subscription-line/purchase/seat-purchase.policy.ts`, `seat-purchase.service.ts`                                                    | P16b, P17                   | biz  |
| `m/optimization/usage-rules/potential-saving.policy.ts`                                                                                       | P2, P8, P13a                | biz  |

Kiểm: không file nào ở bảng có cả `tech` và `biz`; thư mục mới chia theo file (`m/catalog/subscription-line/`: repo + controller/dto/service/
mapper/errors = tech; `subscription-line.policy.ts`, `ledger/*` trừ repo, `purchase/*` trừ repo, `correction/*` = biz; `m/catalog/license-lot/`:
repo/controller/dto/service/policy/mapper/errors/`license-lot-lock.service.ts` = tech; `license-lot-price.policy.ts`, `license-lot-stock.service.ts`
= biz; `m/budgets/shared-pool-line/`: `*.repo.ts` = tech, còn lại = biz; `m/licensing/subscription-renewal/`: `savings/renewal-savings.repo.ts`,
`lines/*.repo.ts` = tech, còn lại = biz).

## Điểm gộp giữa hai làn

| Điểm | Làn xong trước merge vào `int/redesign-w3`            | Rồi                                                          |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------ |
| G1   | tech P1, P3                                           | biz P2 → P8 (B1)                                             |
| G2   | biz P2 → P8 ⟹ **PR B1 → `dev`** (Owner, CI full xanh) | tech P9 **chỉ sau** PR B1 mở (K-C3: PR B1 không kéo code B2) |
| G3   | tech P9                                               | biz P10                                                      |
| G4   | biz P10 ⟹ **PR B2 → `dev`**                           | tech P11 → P12a → P20b → P12b                                |
| G5   | tech P11, P12a, P20b, P12b                            | biz P13a → P13b → P16a; tech P14 (song song)                 |
| G6   | biz P16a                                              | tech P15                                                     |
| G7   | tech P14, P15                                         | biz P16b → P17 → P18 → P19 → P20                             |
| G8   | biz P20                                               | tech P21 → P22; cả hai P23 ⟹ **PR B3 → `dev`**               |

Thứ tự trong làn: **tech** P1 → P3 → P9 → P11 → P12a → P20b → P12b → P14 → P15 → P21 → P22 → P23; **biz** P2 → P4 → P5 → P6 → P7 → P8 → P10 →
P13a → P13b → P16a → P16b → P17 → P18 → P19 → P20 → P23.

## Bộ kiểm nhanh (mỗi gói, mỗi commit)

```text
pnpm typecheck
pnpm lint                      # chậm: pnpm exec eslint <file…>
pnpm arch:check
pnpm arch:capabilities --module <module đã chạm>
pnpm rules:check               # + pnpm rules:format khi sửa docs/rules, README module
pnpm test:gates
pnpm openapi:export && git --no-pager diff --stat openapi.json
CI=true pnpm test -- <mọi *.spec.ts đã chạm/thêm>
pnpm prisma:validate && pnpm prisma:generate   # gói có prisma/
```

- Không chạy `pnpm check`, `test:http`, `test:integration`, `test:e2e`, seed, Docker, migration ở máy. Test http/integration mới **viết** trong gói,
  CI GitHub chạy cuối làn.
- Luật mới: unit đỏ trước, rồi xanh. Ví dụ số của SPEC là ca kiểm **bắt buộc** (mỗi bảng tiêu chí ⟹ một `it.each`); mỗi luật tiền có ca biên + ca
  diệt đột biến (SPEC §11).
- Test cũ khẳng định hành vi cũ: unit của chính luật sửa ngay; http/integration ⟹ `FIX-TEST-<làn>.md`.
- File sát trần 500 dòng: `m/catalog/subscription/subscription.repo.ts`, `m/licensing/assignment/assignment.service.ts`,
  `m/licensing/assignment/assignment.repo.ts`, `m/licensing/provisioning/provisioning-task.repo.ts`. Vượt ⟹ tách theo chức năng, không suppression.
  `m/catalog/subscription/` đã đủ trần: không thêm file vào thư mục đó.

## Gói

| #    | Gói                                                                                  | Mục W3                                          | Cỡ  | Làn     | Phụ thuộc |
| ---- | ------------------------------------------------------------------------------------ | ----------------------------------------------- | --- | ------- | --------- |
| P1   | M1, giá tháng (DTO), kỳ cam kết định mua, từ vựng, thông báo giảm seat               | W3-01, W3-02 (tech), W3-03                      | M   | tech    | điều kiện |
| P2   | Một phép quy đổi giá tháng; tháng lịch `K2`                                          | W3-02 (biz)                                     | M   | biz     | G1        |
| P3   | M2, M3, repo tháng cam kết, cột kho, tham số                                         | W3-07/05/06/09 (dữ liệu)                        | M   | tech    | P1        |
| P4   | Cam kết theo tháng: giữ, áp, giải phóng, chốt, dọn năm                               | W3-07 (biz)                                     | M   | biz     | P2, P3    |
| P5   | Dòng kho seat-ngày, nhãn (2)(3), tỷ lệ 10 %                                          | W3-04, W3-06, W3-01 (`unallocated`)             | M   | biz     | P4        |
| P6   | Số kỳ vọng hóa đơn `K2`, ngưỡng, `SBF-11a`                                           | W3-05                                           | M   | biz     | P5        |
| P7   | Chi phí đang chạy không cam kết (`K2`)                                               | W3-08                                           | M   | biz     | P4        |
| P8   | Ba con số tiết kiệm                                                                  | W3-09                                           | M   | biz     | P6        |
| P9   | M4, workspace (route + người phụ trách), trường thuê bao, nơi đọc hồ sơ cũ, route cũ | W3-10, W3-11 (tech), W3-13, W3-14 (khóa)        | L   | tech    | G2        |
| P10  | Cổng ≥ 2 admin, thông báo admin, trùng, theo thành viên, xóa `increasesObligation`   | W3-11 (biz), W3-12, W3-14, W3-03                | M   | biz     | G3        |
| P11  | M5a, M5, repo dòng/sổ/lần mua/mục tiêu/ca tự ghi                                     | W3-15/16/21 (dữ liệu)                           | M   | tech    | G4        |
| P12a | M6 (lô, 6 hàm), repo lô/khóa/phí                                                     | W3-24, W3-25 (dữ liệu)                          | M   | tech    | P11       |
| P20b | Chuyển code đợt 2 sang lô; `LicenseLotApi`; tồn `LICENSES`; bỏ `K1` ở tồn            | W3-24 (K-B3), W3-17 (mục 5)                     | M   | tech    | P12a      |
| P12b | M7, repo phân bổ hóa đơn, cột `K1`                                                   | W3-17/23 (dữ liệu)                              | S   | tech    | P20b      |
| P13a | `K1` không thuê bao, `K1` năm, hợp đồng ngắn, xin lại                                | W3-17                                           | M   | biz     | G5        |
| P13b | Phân bổ hóa đơn `K1` năm, cam kết 01/01 áp ngay, không cam kết `K1`                  | W3-23                                           | M   | biz     | P13a      |
| P14  | Route lô, người phụ trách lô, nhập khóa vào lô, route cũ, hợp đồng                   | W3-24 (tech)                                    | M   | tech    | G5        |
| P16a | Sổ (facade), chọn dòng, lối tắt khi cấp, mang quyền mua kỳ sau, xóa `addSeat`        | W3-16 (biz), W3-15 (chọn dòng), W3-18 (lối tắt) | M   | biz     | P13b      |
| P15  | Route dòng, `lines[]` khi khai, sổ (đọc)                                             | W3-15 (tech)                                    | M   | tech    | G6        |
| P16b | Route mua thêm seat, hóa đơn gắn lần mua, nhắc hạn, dòng _Nhà cung cấp thu tới_      | W3-18, W3-20                                    | M   | biz     | G7        |
| P17  | Nhảy bậc, ghi theo hãng, giảm giữa kỳ, đổi loại seat, theo thành viên                | W3-19                                           | M   | biz     | P16b      |
| P18  | Gia hạn theo dòng, chốt mục tiêu, tự gia hạn, đóng dòng `ENDED`                      | W3-21                                           | L   | biz     | P17       |
| P19  | Nhãn (1), `KPI-4`, dòng kho theo sổ                                                  | W3-22                                           | M   | biz     | P18       |
| P20  | Cấp `K4` từ lô, giá Request `K4`, tiền `K4`, ghost seat `K4`                         | W3-24 (biz), W3-25, W3-26                       | L   | biz     | P19       |
| P21  | Bỏ ô sửa tay, `isPrimaryForPlan`, khai `K1`/`PERPETUAL`                              | W3-27                                           | S   | tech    | G8        |
| P22  | Seed B3                                                                              | W3-28                                           | L   | tech    | P21       |
| P23  | Chốt đợt: generator, module card, rule, `FIX-TEST`                                   | —                                               | S   | mỗi làn | P1–P22    |

Migration: M1 (P1), M2 + M3 (P3), M4 (P9), M5a + M5 (P11), M6 (P12a), M7 (P12b). **M3, M5a không đảo được**: file riêng, chỉ giá trị enum.

---

## Chi tiết gói

Mỗi gói: **File** (đủ tên; `*` = file chung chỉ thêm dòng), **Làm**, **Kiểm** (ngoài bộ kiểm nhanh; test http/integration chỉ viết), **Xong khi**.
Mọi gói đổi contract: `openapi.json` + manifest (`*`); mô tả OpenAPI không mã nội bộ.

### P1 — tech · M

- **File:** `prisma/models/catalog.prisma`; `prisma/migrations/20261201000000_w3_monthly_price/migration.sql`;
  `m/catalog/subscription/subscription.dto.ts`, `subscription.mapper.ts`, `subscription.repo.ts`, `subscription.service.ts` (+spec),
  `subscription-change.service.ts` (+spec), `subscription-change-guard.service.ts`, `subscriptions.controller.ts`, `subscription.errors.ts`_,
  `subscription.http-errors.ts`_; `m/catalog/subscription/seat-increase/subscription-seat-increase.policy.ts` (+spec),
  `subscription-seat-increase.service.ts` (+spec); `m/catalog/plan/plan.dto.ts`, `plan.mapper.ts`, `plan.repo.ts`, `plan.service.ts` (+spec),
  `plans.controller.ts`, `plan.errors.ts`_, `plan.http-errors.ts`_; `m/licensing/license-key/license-key-template.policy.ts` (+spec);
  bốn file thông báo chung* (`notifications.types.ts`, `inbox.policy.ts`, `notification-texts-subscription.types.ts`, `notification-target.policy.ts` — đường dẫn ở _Hai làn_); `m/catalog/README.md`, `m/licensing/README.md`, `m/budgets/README.md`; `src/cli/seed/steps/catalog.steps.ts`,
  `catalog.steps.spec.ts`, `src/cli/seed/fixture/shared-demo-v4/catalog.ts`; `test/integration/catalog/subscription-monthly-price-migration.integration-spec.ts`;
  `test/http/catalog/subscriptions.http-spec.ts`.
- **Làm:** SPEC-B1 W3-01 (trừ mô tả `unallocated`), W3-02 mục 1, 4, 5 (ghi/đọc trường, M1, khối kiểm), W3-03 (thông báo giảm, mã
  `SUBSCRIPTION_SEATS_REDUCED` §8.2).
- **Kiểm:** `pnpm prisma:validate`, `pnpm prisma:generate`; unit bảng W3-02 phần ghi, W3-03 người nhận.
- **Xong khi:** ca ghi/đọc của bảng W3-02 và sáu ca W3-03 có unit/http; khối kiểm M1 có câu `SELECT` trong commit message.

### P2 — biz · M

- **File:** `m/catalog/subscription/price/subscription-price.policy.ts` (+spec), `subscription-price.service.ts`;
  `m/catalog/subscription/period/subscription-period.service.ts`, `subscription-period.repo.ts`; `m/catalog/public/subscription-period.api.ts`,
  `subscription-period.types.ts`, `catalog.api.ts`; `m/budgets/cycle/baseline.policy.ts` (+spec); `m/requests/access-request/pricing.policy.ts`
  (+spec); `src/core/term-limit.ts` (+spec); `m/optimization/usage-rules/potential-saving.policy.ts` (+spec); `m/licensing/shared-pool/shared-pool.policy.ts`
  (+spec).
- **Làm:** SPEC-B1 W3-02 mục 2, 3 (tháng lịch `K2`, `calendarMonthsIn`), 5 (lần mua đầu, `NULL` ⟹ 12).
- **Xong khi:** sáu chỗ của bảng hiện trạng W3-02 đọc một nguồn; `it.each` bảng W3-02 (phần tính) xanh, gồm ca diệt `ceil`/`floor`.

### P3 — tech · M

- **File:** `prisma/models/budgets.prisma`, `licensing.prisma`, `requests.prisma`; `prisma/migrations/20261201000100_w3_commitment_months_pool_figures/migration.sql`,
  `prisma/migrations/20261201000200_w3_release_and_outcome_values/migration.sql`; **mới** `m/budgets/commitment/month/commitment-month.repo.ts`,
  `m/budgets/shared-pool-line/shared-pool-line.repo.ts`, `m/licensing/subscription-renewal/savings/renewal-savings.repo.ts`;
  `m/budgets/budget/invoice.repo.ts`, `m/budgets/review/budget-review.repo.ts`; `m/operating-parameters/parameter-definitions.policy.ts` (+spec);
  `test/integration/budgets/commitment-month-repo.integration-spec.ts`.
- **Làm:** W3-07 mục 1 (bảng tháng cam kết), cột W3-04/05/09 (CHECK `invoices_pool_figures`), M3 (enum + CHECK `mismatches`), ba tham số.
- **Kiểm:** integration CHECK `applied + released ≤ share`, trigger bất biến, CHECK `invoices_pool_figures`.
- **Xong khi:** repo có đủ phương thức P4–P6 cần (chữ ký ghi `PROGRESS-tech.md` _Bàn giao_).

### P4 — biz · M

- **File:** **mới** `m/budgets/commitment/month/commitment-month.policy.ts` (+spec), `commitment-month-settlement.service.ts` (+spec);
  `m/budgets/commitment/commitment.service.ts`; `m/budgets/budget/commitment.repo.ts`, `commitment-release.policy.ts` (+spec);
  `m/budgets/seat-month/seat-month.policy.ts`, `seat-month-plan.policy.ts`, `seat-month-subscription.service.ts`, `seat-month.service.ts`,
  `seat-month.job.ts`; `m/budgets/review/budget-review-period-writer.service.ts`; `m/budgets/public/budgets.api.ts`, `budgets.types.ts`;
  `m/requests/spend-effects/spend-effects.service.ts`; `m/requests/access-request/pricing.policy.ts`;
  `m/requests/year-start-commitments/year-start-commitments-batch.service.ts`, `year-start-commitments.policy.ts` (+spec);
  `m/requests/grant/seat-release.policy.ts` (+spec), `seat-release.service.ts`; `test/integration/budgets/commitment-month-settlement.integration-spec.ts`.
- **Làm:** SPEC-B1 W3-07 mục 2–9. Thứ tự khóa: comment đầu `commitment-month-settlement.service.ts`.
- **Kiểm:** integration ca A–L (H: hai connection, barrier, lặp 20).
- **Xong khi:** 22 ca W3-07 (A → M, F1, F2, F3, F3', F6, F15) có test; `Σ applied + Σ released = amount` cuối năm ở mọi ca.

### P5 — biz · M

- **File:** **mới** `m/budgets/shared-pool-line/shared-pool-line.policy.ts` (+spec), `shared-pool-line-label.policy.ts` (+spec),
  `shared-pool-line-facts.service.ts` (+spec), `shared-pool-line-alert.service.ts` (+spec); `m/budgets/seat-month/seat-month-pool.policy.ts`,
  `seat-month-pool.service.ts`, `seat-month.dto.ts`, `seat-month-query.service.ts`; `m/budgets/budget-view/budget-table-view.service.ts`,
  `budget-view.mapper.ts`; `m/budgets/budget/budget.dto.ts`; `m/budgets/review/budget-review-pool-watch.service.ts`, `budget-review.policy.ts`,
  `budget-review-snapshot.service.ts`, `budget-review-period-writer.service.ts`, `budget-review-reminder.service.ts` (+spec), `budget-review.dto.ts`;
  `m/catalog/subscription/period/subscription-period.service.ts`; `m/catalog/public/subscription-period.api.ts`, `subscription-period.types.ts`;
  `m/catalog/subscription/obligation/subscription-obligation.policy.ts` (+spec; `earliestReducibleOn`); `m/licensing/public/licensing-seat-month.api.ts`,
  `licensing-seat-month.types.ts`; bốn file thông báo chung* (`IDLE_SEAT_COST_RATIO_HIGH`);
  `test/integration/budgets/shared-pool-line-identity.integration-spec.ts`, `test/http/budgets/seat-month-charges.http-spec.ts`.
- **Làm:** SPEC-B1 W3-04, W3-06, mô tả `unallocated` (W3-01).
- **Xong khi:** bảng W3-04 (11 ca), W3-06 (8 ca) xanh; không mục `NESTED_ARRAYS` mới.

### P6 — biz · M

- **File:** **mới** `m/requests/purchase-invoice/pool-expectation/purchase-invoice-pool-expectation.policy.ts` (+spec);
  `m/requests/purchase-invoice/confirmation/purchase-invoice-confirmation.service.ts` (+spec); `m/requests/purchase-invoice/purchase-invoice-plan.service.ts`,
  `purchase-invoice.dto.ts`, `purchase-invoice.mapper.ts`; `m/requests/invoice-discrepancy/invoice-discrepancy-closure.policy.ts` (+spec),
  `invoice-discrepancy-closure.service.ts`, `invoice-discrepancy-opening.service.ts`, `invoice-discrepancy.types.ts`;
  `m/requests/invoice-discrepancy-queue/invoice-discrepancy.dto.ts`, `invoice-discrepancy.mapper.ts`; `m/budgets/invoice/purchase-invoice-recorder.service.ts`;
  `m/budgets/public/budgets.api.ts`, `budgets.types.ts`; bốn file thông báo chung* (`SUBSCRIPTION_PRICE_REVIEW`);
  `test/http/requests/purchase-invoice-confirmation.http-spec.ts`, `test/integration/requests/purchase-invoice-pool-variance.integration-spec.ts`.
- **Làm:** SPEC-B1 W3-05.
- **Xong khi:** 14 ca W3-05 có test; một hồ sơ mỗi hóa đơn gộp `mismatches`.

### P7 — biz · M

- **File:** **mới** `m/budgets/budget/running-uncommitted.policy.ts` (+spec), `running-uncommitted-facts.service.ts` (+spec);
  `m/licensing/public/licensing-seat-month.api.ts`, `licensing-seat-month.types.ts`; `m/licensing/assignment/assignment-seat-month.repo.ts`;
  `m/budgets/public/budgets.api.ts`, `budgets-read.api.ts`, `budgets.types.ts`; `m/requests/spend/budget-check.policy.ts` (+spec),
  `budget-check.service.ts`; `m/budgets/budget-view/budget-view-numbers.service.ts`; `test/http/budgets/budget-summary.http-spec.ts`.
- **Làm:** SPEC-B1 W3-08.
- **Xong khi:** 13 ca W3-08 (gồm 3 ca F7, ca F15b); kiểm tra ngân sách gửi và duyệt cùng số.

### P8 — biz · M

- **File:** `m/optimization/usage-rules/potential-saving.policy.ts` (+spec), `usage-rules-seat.service.ts`; `m/catalog/public/subscription-period.api.ts`;
  `m/licensing/shared-pool/shared-pool.policy.ts`, `shared-pool.service.ts`; `m/licensing/public/licensing.api.ts`; **mới**
  `m/licensing/subscription-renewal/savings/renewal-savings.policy.ts` (+spec), `renewal-savings.service.ts` (+spec);
  `m/licensing/subscription-renewal/outcome/renewal-outcome.policy.ts`, `renewal-outcome.service.ts`; `m/requests/grant/access-request-grant.listener.ts`
  (+spec); `m/requests/purchase-invoice/confirmation/purchase-invoice-confirmation.service.ts`;
  `test/integration/licensing/realised-saving-on-invoice.integration-spec.ts`.
- **Làm:** SPEC-B1 W3-09.
- **Xong khi:** 17 ca W3-09; không còn ghi tiết kiệm thực lúc IT ghi kết quả.

### P9 — tech · L

- **File:** `prisma/models/catalog.prisma`; `prisma/migrations/20261202000000_w3_workspaces/migration.sql`; **mới** `m/catalog/workspace/workspaces.controller.ts`,
  `workspace.dto.ts`, `workspace.service.ts` (+spec), `workspace-admins.service.ts` (+spec), `workspace-responsible.service.ts` (+spec),
  `workspace.policy.ts` (+spec), `workspace.repo.ts`, `workspace.mapper.ts`, `workspace.errors.ts`, `workspace.http-errors.ts`; **mới**
  `m/catalog/public/workspace.api.ts`; `m/catalog/catalog.module.ts`_; `m/catalog/plan/plan-workspace.service.ts` (+spec), `plans.controller.ts`,
  `plan.mapper.ts`, `plan.repo.ts`, `plan-facts.service.ts`, `vendor-admin-minimum.service.ts`, `vendor-admin-roles.service.ts`,
  `vendor-admin-roles.policy.ts`; `m/catalog/public/catalog-responsibility.api.ts`, `catalog-responsibility.types.ts`;
  `m/catalog/application-responsibility/responsibility-handover.service.ts` (+spec); `m/catalog/subscription/subscription.dto.ts`,
  `subscription.mapper.ts`, `subscription.repo.ts`, `subscription.service.ts`, `subscription-change.service.ts`, `subscription-view.service.ts`,
  `subscription.errors.ts`_, `subscription.http-errors.ts`_; `src/cli/seed/steps/catalog.steps.ts`, `catalog.steps.spec.ts`,
  `src/cli/seed/fixture/shared-demo-v4/catalog.ts`; `test/gates/api-collection-contract.gate-spec.ts`_ (`workspaceGet#admins`);
  `test/integration/catalog/workspace-migration.integration-spec.ts`, `test/http/catalog/workspaces.http-spec.ts`, `test/http/catalog/plans.http-spec.ts`,
  `test/http/catalog/subscriptions.http-spec.ts`.
- **Làm:** SPEC-B2 W3-10 (gồm route Super Admin, nơi đọc hồ sơ cũ, `VendorAdminRole`), W3-11 (lưu trường, mặc định workspace), W3-13, W3-14 (khóa
  workspace FU trước gói trong `declareIn`/`complete`/đổi `workspaceId`); `countWorkspacesBelowMinimum`.
- **Kiểm:** integration ca gộp hồ sơ Anthropic + dừng `K3`; http sáu route.
- **Xong khi:** tám tiêu chí W3-10, phần lưu W3-11 (ca 2, 4), W3-13 (năm ca); gate collection xanh hoặc dừng hỏi.

### P10 — biz · M

- **File:** `m/catalog/subscription/pool/subscription-pool.policy.ts` (+spec), `subscription-pool.service.ts` (+spec);
  `m/catalog/subscription/obligation/subscription-obligation.policy.ts` (+spec; xóa `increasesObligation`); **mới**
  `m/licensing/subscription-renewal/alerts/workspace-admin-alert.service.ts` (+spec); `m/licensing/subscription-renewal/subscription-renewal-sweep.service.ts`
  (+spec); `m/personnel/event-notice/personnel-notifier.service.ts` (+spec), `m/personnel/it-handover/it-handover-milestone.service.ts` (+spec);
  `m/dashboards/it-admin/it-admin-dashboard.dto.ts`, `it-admin-dashboard-facts.service.ts`; `m/dashboards/progress/dashboard-progress.policy.ts` (+spec),
  `dashboard-progress.service.ts`, `dashboard-progress.dto.ts`; bốn file thông báo chung* (`WORKSPACE_ADMIN_NOT_WORKING`);
  `test/integration/catalog/workspace-admin-gate.integration-spec.ts`, `test/integration/catalog/subscription-duplicate-workspace.integration-spec.ts`,
  `test/http/catalog/subscription-workspace.http-spec.ts`.
- **Làm:** SPEC-B2 W3-11 (luật C4, ngày thanh toán, `hasAdjustmentPoint`), W3-12, W3-14 (luật trùng); SPEC-B1 W3-03 (xóa `increasesObligation`).
- **Kiểm:** integration khai đồng thời (barrier, lặp 20).
- **Xong khi:** tám ca W3-12; ba tiêu chí W3-14; ca 1, 3 W3-11; `grep -rn increasesObligation src` = 0.

### P11 — tech · M

- **File:** `prisma/models/catalog.prisma`, `licensing.prisma`, `requests.prisma`; `prisma/migrations/20261203000000_w3_b3_enum_values/migration.sql`,
  `prisma/migrations/20261203000100_w3_subscription_lines_seat_ledger/migration.sql`; **mới** `m/catalog/subscription-line/subscription-line.repo.ts`,
  `m/catalog/subscription-line/ledger/seat-ledger.repo.ts`, `m/catalog/subscription-line/purchase/seat-purchase.repo.ts`,
  `m/licensing/subscription-renewal/lines/subscription-line-target.repo.ts`, `m/licensing/subscription-renewal/lines/subscription-renewal-auto.repo.ts`;
  `src/infrastructure/database/database-role-judgement.ts`; `test/integration/catalog/seat-ledger-constraints.integration-spec.ts`,
  `test/integration/catalog/subscription-lines-migration.integration-spec.ts`, `test/integration/catalog/subscription-line-unique.integration-spec.ts`.
- **Làm:** SPEC-B3 §1.1 (M5a, M5: `closed_on`, unique, mở sổ `GREATEST`, `DRAFT` không sổ, `RENEWAL` cho kỳ chưa bắt đầu, CHECK cửa, trigger sức chứa,
  `subscriptions_fit_plan`, `decider_role`, `purchase_invoices.seat_purchase_id`).
- **Kiểm:** integration append-only với owner, dưới số đang chiếm, unique `TOP_UP`, C1, mở sổ, dừng khi trùng.
- **Xong khi:** câu `SELECT` kiểm trùng ở commit message; repo có chữ ký P15, P16a, P18 cần (_Bàn giao_).

### P12a — tech · M

- **File:** `prisma/models/catalog.prisma`, `licensing.prisma`, `budgets.prisma`, `requests.prisma`; `prisma/migrations/20261203000200_w3_license_lots/migration.sql`;
  **mới** `m/catalog/license-lot/license-lot.repo.ts`, `m/budgets/shared-pool-line/license-lot-charge.repo.ts`; `m/licensing/license-key/license-key.repo.ts`;
  (M6 có hai unique của F14: `purchase_invoices(license_lot_id)` còn hiệu lực, `license_lots(request_id)` `REQUEST`);
  `m/licensing/device-activation/device-activation.repo.ts` (chỉ ánh xạ kiểu khi `subscriptionId` thành nullable: `purchaseId = licenseLotId ?? subscriptionId`,
  không đổi hành vi); `test/integration/catalog/license-lot-migration.integration-spec.ts`, `test/integration/licensing/license-lot-capacity.integration-spec.ts`.
- **Làm:** SPEC-B3 §1.2: bảng, cột, khối kiểm, backfill (cùng id), rồi `CREATE OR REPLACE` sáu hàm (năm của đợt 2 + `license_assignment_check_capacity`), CHECK `link_kind`, trigger bất biến hóa đơn, trigger `license_lots_capacity`.
- **Kiểm:** integration: lô cùng id, `cost_borne`, guard mới chặn đổi `license_lot_id`, kích hoạt đợt 2 vẫn đếm đúng sau M6.
- **Xong khi:** tiêu chí 1 W3-24; test kích hoạt đợt 2 hiện có (unit) xanh không sửa kỳ vọng.

### P20b — tech · M

- **File:** **mới** `m/catalog/public/license-lot.api.ts`, `m/catalog/license-lot/license-lot-lock.service.ts` (+spec);
  `m/licensing/device-activation/device-activation.service.ts` (+spec), `device-activation-close.service.ts` (+spec), `device-activation.repo.ts`,
  `device-activation.policy.ts` (+spec); `m/licensing/assignment/occupancy/assignment-seat-occupancy.listener.ts`; `m/catalog/public/catalog.extension-points.ts`;
  `m/licensing/stock-summary/stock-summary.policy.ts` (+spec), `stock-summary-query.service.ts`, `stock-summary.types.ts`;
  `m/licensing/public/licensing-device-activation.api.ts`; `m/catalog/catalog.module.ts`*.
- **Làm:** K-B3 — chuyển mọi chỗ đọc `subscriptionId`/`purchasedQuantity` của khoản mua sang `licenseLotId`/`licenseCount`; khóa lô qua
  `LicenseLotApi.lockLot` (6a) thay `CatalogApi.lockSeatTarget`; **giữ chữ ký** `LicensingDeviceActivationApi`; wire `lotId` đọc `license_lot_id`; comment
  tầng khóa `7b`; tồn `LICENSES` theo lô; bỏ dòng `HOLDERS` của `K1` (W3-17 mục 5). **Refactor giữ hành vi** — LUẬT CỨNG 2.
- **Xong khi:** mọi unit device-activation/stock-summary đợt 2 xanh **không** đổi kỳ vọng (trừ ca `K1` HOLDERS); commit message liệt kê mọi lần kiểm cũ giữ.

### P12b — tech · S

- **File:** `prisma/models/licensing.prisma`, `catalog.prisma`, `budgets.prisma`; `prisma/migrations/20261203000300_w3_personal_rights_allocations/migration.sql`;
  **mới** `m/budgets/invoice/invoice-allocation.repo.ts` (dòng bù trừ `kind`, bucket `POOL_LOT_DIFFERENCE` âm — F8, F12, F13c),
  `m/budgets/invoice/invoice-year-application.repo.ts` (bảng `invoice_year_applications` — F9); `m/budgets/budget/invoice.repo.ts` (`spentOf` đọc phân bổ); `m/budgets/seat-month/seat-month.repo.ts`
  (`yearTotals`); `m/licensing/assignment/assignment.repo.ts` (hai cột `K1`; trần 500 ⟹ tách `assignment-k1.repo.ts` nếu vượt);
  `test/integration/budgets/invoice-allocation-repo.integration-spec.ts`.
- **Làm:** SPEC-B3 §1.3.
- **Xong khi:** integration Σ phân bổ = `actual_cost_minor`; `spentOf` đọc dòng phân bổ khi có.

### P13a — biz · M

- **File:** `m/licensing/provisioning/tasks/provisioning-grant-writer.service.ts` (+spec), `provisioning-replacement.service.ts` (+spec);
  `m/licensing/shared-pool/shared-pool.service.ts`; `m/catalog/subscription/seat-target.service.ts`; `src/core/term-limit.ts` (+spec);
  `m/requests/access-request/access-request.policy.ts` (+spec), `pricing.policy.ts`, `access-request.errors.ts`_, `access-request.http-errors.ts`_;
  `m/requests/renewal-request/renewal-request.policy.ts` (+spec); `m/requests/grant/seat-release.policy.ts`, `seat-release.service.ts`;
  `m/optimization/usage-rules/potential-saving.policy.ts`; `test/integration/licensing/k1-without-subscription.integration-spec.ts`.
- **Làm:** SPEC-B3 W3-17 mục 1–4.
- **Xong khi:** bảy ca W3-17; cấp `K1` không chạm `subscriptions`/`seat_changes` (integration).

### P13b — biz · M

- **File:** **mới** `m/budgets/invoice/invoice-allocation.policy.ts` (+spec); `m/budgets/invoice/purchase-invoice-recorder.service.ts` (+spec);
  `m/budgets/budget/running-uncommitted.policy.ts`, `running-uncommitted-facts.service.ts`; `m/requests/year-start-commitments/year-start-commitments-batch.service.ts`,
  `year-start-commitments.policy.ts`; `m/budgets/public/budgets.api.ts`, `budgets.types.ts`; `test/integration/budgets/k1-annual-allocation.integration-spec.ts`.
- **Làm:** SPEC-B3 W3-23 (K-A1, K-A2, K-A3, F8 dòng bù trừ khi điều chuyển, F9 advisory/mốc/thứ tự). Thêm file:
  `m/requests/grant/seat-release.service.ts` (gọi chuyển phân bổ lúc ghi quyền mới — F8), `m/budgets/invoice/invoice-allocation-transfer.service.ts` (**mới**, +spec).
- **Xong khi:** mười một ca W3-23; hai thứ tự (hóa đơn trước/sau 01/01) cùng số; ca F9(a) integration barrier.

### P14 — tech · M

- **File:** **mới** `m/catalog/license-lot/license-lots.controller.ts`, `license-lot.dto.ts`, `license-lot.service.ts` (+spec),
  `license-lot-responsible.service.ts` (+spec), `license-lot.policy.ts` (+spec), `license-lot.mapper.ts`, `license-lot.errors.ts`, `license-lot.http-errors.ts`;
  `m/catalog/public/license-lot.api.ts` (`createLot`); **mới** `m/licensing/license-key/license-lot-create.controller.ts`, `license-lot-create.service.ts`
  (+spec), `license-lot-keys.controller.ts`, `license-lot-key-import.service.ts` (+spec); `m/licensing/license-key/license-keys.controller.ts`,
  `license-key.service.ts`, `license-key.dto.ts`; `m/catalog/contract/contract-subscription.service.ts`, `contract.errors.ts`_, `contract.http-errors.ts`_;
  `m/catalog/subscription/responsible/subscription-responsible.service.ts` (+spec); `m/catalog/public/catalog-responsibility.api.ts`;
  `m/catalog/application-responsibility/responsibility-handover.service.ts`; `m/catalog/catalog.module.ts`_, `m/licensing/licensing.module.ts`_;
  `test/http/catalog/license-lots.http-spec.ts`.
- **Làm:** SPEC-B3 W3-24: route (6), người phụ trách, nhập khóa (K-A6), route cũ (K-B4, K-B7), hợp đồng, `SBF-16` chuyển lô. Cổng admin cho lô gọi
  service của P10 (không chép). `REQUEST` kiểm người làm qua `ProvisioningTaskFrameService.requireActingItAdmin`.
- **Xong khi:** tiêu chí 2, 4, 7, 8, 9, 10 W3-24 (http/unit); tiêu chí 3, 5, 6 ở P20.

### P16a — biz · M

- **File:** **mới** `m/catalog/subscription-line/subscription-line.policy.ts` (+spec), `m/catalog/subscription-line/ledger/seat-ledger.policy.ts` (+spec),
  `seat-ledger.service.ts` (+spec), `seat-ledger.errors.ts`, `seat-ledger.http-errors.ts`; **mới** `m/catalog/public/seat-ledger.api.ts`;
  `m/catalog/subscription/seat-target.service.ts`; `m/catalog/public/catalog.api.ts`, `catalog.types.ts`; `m/catalog/subscription/pool/subscription-pool.service.ts`
  (xóa `addSeat`), `m/catalog/subscription/subscription-facts.service.ts`, `m/catalog/subscription/subscription-priced.repo.ts`;
  `m/licensing/shared-pool/shared-pool.policy.ts`, `shared-pool.service.ts` (`chooseLine`), `shared-pool-capacity.repo.ts`;
  `m/licensing/provisioning/tasks/provisioning-grant-writer.service.ts` (`takeSeat` qua sổ); `m/licensing/assignment/assignment.service.ts`
  (`carryOrBuy` mua kỳ sau); `m/catalog/catalog.module.ts`*; `test/integration/licensing/renewal-carry-purchase.integration-spec.ts`.
- **Làm:** SPEC-B3 W3-16 (facade, mang quyền Q-B, ngày hiệu lực), W3-15 (chọn dòng theo ngày phục vụ), W3-18 (lối tắt khi cấp).
- **Xong khi:** bảng W3-16 + ca Q-B; `grep -rn "addPoolSeat\|addSeat(" src` = 0; refactor `takeSeat`/`carryOrBuy` giữ mọi lần kiểm cũ (LUẬT CỨNG 2).

### P15 — tech · M

- **File:** **mới** `m/catalog/subscription-line/subscription-lines.controller.ts`, `subscription-line.dto.ts`, `subscription-line.service.ts` (+spec),
  `subscription-line.mapper.ts`, `subscription-line.errors.ts`, `subscription-line.http-errors.ts`; `m/catalog/subscription/subscription.dto.ts`,
  `subscription.mapper.ts`, `subscription.service.ts` (`lines[]`, thân cũ = một dòng, `SeatLedgerApi.openLines`), `subscription-view.service.ts`;
  `m/licensing/assignment/subscription-seats.controller.ts`, `assignment.dto.ts`; `m/catalog/catalog.module.ts`_;
  `test/gates/api-collection-contract.gate-spec.ts`_ (`subscriptionGet#lines`); `test/http/catalog/subscription-lines.http-spec.ts`.
- **Làm:** SPEC-B3 W3-15 (route, quyền IT phụ trách thuê bao, `lines[]`).
- **Xong khi:** bảy tiêu chí W3-15.

### P16b — biz · M

- **File:** **mới** `m/licensing/shared-pool/seat-purchases.controller.ts`, `seat-purchase.dto.ts`, `seat-purchase-route.service.ts` (+spec),
  `seat-purchase-invoice-due.service.ts` (+spec); **mới** `m/catalog/subscription-line/purchase/seat-purchase.policy.ts` (+spec), `seat-purchase.service.ts`
  (+spec), `seat-purchase.errors.ts`, `seat-purchase.http-errors.ts`; `m/catalog/public/seat-ledger.api.ts`;
  `m/requests/purchase-invoice/purchase-invoice-submission.service.ts`, `purchase-invoice.dto.ts`, `purchase-invoice-plan.service.ts`,
  `labels/purchase-invoice-labels.policy.ts` (+spec), `purchase-invoice.errors.ts`_, `purchase-invoice.http-errors.ts`_;
  `m/licensing/subscription-renewal/subscription-renewal-sweep.service.ts`; **mới** `m/requests/access-request/vendor-charge.policy.ts` (+spec);
  `m/requests/request-view/pricing-view.service.ts`; `m/requests/access-request/access-request.dto.ts`; `m/requests/spend-approval-view/spend-approval.dto.ts`,
  `spend-approval-view.service.ts`; `m/licensing/licensing.module.ts`_; bốn file thông báo chung_ (`SUBSCRIPTION_SEATS_BOUGHT`,
  `SEAT_PURCHASE_INVOICE_OVERDUE`); `test/http/licensing/seat-purchases.http-spec.ts`, `test/integration/licensing/seat-purchase-concurrency.integration-spec.ts`,
  `test/http/requests/access-request-get.http-spec.ts`.
- **Làm:** SPEC-B3 W3-18 (route, 403 từng mục, hạn, hóa đơn gắn lần mua, nhắc hạn), W3-20.
- **Xong khi:** 11 ca W3-18, ca W3-20.

### P17 — biz · M

- **File:** **mới** `m/catalog/subscription-line/correction/subscription-line-correction.policy.ts` (+spec), `subscription-line-correction.service.ts`
  (+spec), `subscription-line-seats.controller.ts`, `subscription-line-correction.dto.ts`; `m/catalog/subscription-line/purchase/seat-purchase.policy.ts`,
  `seat-purchase.service.ts`; `m/licensing/shared-pool/seat-purchase.dto.ts`, `seat-purchase-route.service.ts`;
  `m/licensing/provisioning/tasks/provisioning-grant-writer.service.ts`; `m/licensing/provisioning/revocation-completion/revocation-completion.service.ts`
  (+spec); bốn file thông báo chung* (`SEAT_LEDGER_VENDOR_RECORDED`); `test/http/catalog/subscription-line-seats.http-spec.ts`.
- **Làm:** SPEC-B3 W3-19.
- **Xong khi:** tám ca W3-19.

### P18 — biz · L

- **File:** `m/licensing/subscription-renewal/seats-needed/renewal-seats-needed.policy.ts` (+spec), `renewal-seats-needed.service.ts`;
  `record/renewal-record.service.ts` (+spec), `record/renewal-record.policy.ts` (+spec); `outcome/renewal-outcome.service.ts`, `outcome/renewal-outcome.policy.ts`;
  `deadline/renewal-deadline.service.ts`; **mới** `lines/subscription-renewal-lines.policy.ts` (+spec), `lines/subscription-renewal-lines.service.ts`,
  `lines/subscription-renewal-auto.service.ts` (+spec); `subscription-renewal.dto.ts`, `subscription-renewals.controller.ts`,
  `subscription-renewal-view.service.ts`, `subscription-renewal-sweep.service.ts`, `subscription-renewal.mapper.ts`, `subscription-renewal-ranking.service.ts`,
  `subscription-renewal.errors.ts`_, `subscription-renewal.http-errors.ts`_ (tất cả dưới `m/licensing/subscription-renewal/`);
  `m/licensing/subscription-renewal/savings/renewal-savings.service.ts`; `m/licensing/assignment/renewal/assignment-renewal.service.ts`;
  `m/catalog/subscription/period/subscription-period.service.ts`; `m/catalog/public/subscription-period.api.ts`, `subscription-period.types.ts`;
  `test/integration/licensing/renewal-auto-record.integration-spec.ts`.
- **Làm:** SPEC-B3 W3-21. `renewal-record.service.ts` gần trần độ phức tạp: tách policy theo dòng. Seed `renewals.steps.ts` **không** sửa (P22):
  ghi thân mới vào _Bàn giao_.
- **Xong khi:** mười ca W3-21; tự ghi hai instance một kết quả.

### P19 — biz · M

- **File:** `m/budgets/shared-pool-line/shared-pool-line.policy.ts`, `shared-pool-line-label.policy.ts`, `shared-pool-line-facts.service.ts`;
  `m/budgets/seat-month/seat-month-subscription.service.ts`, `seat-month-seat-facts.service.ts`; **mới**
  `m/licensing/subscription-renewal/kpi/kpi-missed-adjustment.policy.ts` (+spec), `kpi-missed-adjustment.service.ts`;
  `m/licensing/subscription-renewal/subscription-renewal-view.service.ts`; `m/catalog/plan/plan.policy.ts` (+spec).
- **Làm:** SPEC-B3 W3-22.
- **Xong khi:** năm ca W3-22.

### P20 — biz · L

- **File:** `m/catalog/subscription/seat-target.service.ts` (khóa lô cho `K4`); **mới** `m/catalog/license-lot/license-lot-price.policy.ts` (+spec),
  `license-lot-stock.service.ts` (+spec), `m/catalog/public/license-lot-stock.api.ts`; `m/licensing/provisioning/tasks/provisioning-grant-writer.service.ts`,
  `provisioning-grant-completion.service.ts`; `m/licensing/license-key/license-key-assignment.service.ts` (+spec); `m/licensing/shared-pool/shared-pool-capacity.repo.ts`,
  `shared-pool.service.ts`, `shared-pool-vacancy.service.ts`; `m/requests/grant/pool-grant-release.policy.ts` (+spec), `access-request-grant.listener.ts`;
  `m/budgets/invoice/purchase-invoice-recorder.service.ts`; **mới** `m/budgets/shared-pool-line/license-lot-cost.policy.ts` (+spec),
  `license-lot-cost.service.ts` (+spec); `m/budgets/shared-pool-line/shared-pool-line.policy.ts`, `shared-pool-line-alert.service.ts`;
  `m/requests/purchase-invoice/purchase-invoice-submission.service.ts`, `purchase-invoice.dto.ts`, `purchase-invoice-plan.service.ts`;
  `m/optimization/internal-rules/internal-rules.policy.ts` (+spec), `internal-rules-g1.service.ts`, `internal-rules-g2.service.ts`;
  `m/licensing/public/licensing-ghost-seat.api.ts`, `licensing-ghost-seat.types.ts`; `m/catalog/catalog.module.ts`_; bốn file thông báo chung_
  (`LICENSE_LOT_IDLE_COST_HIGH`); `test/integration/budgets/license-lot-charges.integration-spec.ts`.
- **Làm:** SPEC-B3 W3-24 (cấp, giá — K-A5, giữ m license — F11), W3-25 (W3-Q1 A, K-A4, K-A8, K-A9, `STOCK`, F10, F12 chênh lệch lô, F13, F14),
  W3-26 (K-A10).
- **Xong khi:** mười chín ca W3-25 (gồm 9 ca F10–F14), ca W3-26, tiêu chí 3, 5, 6 W3-24.

### P21 — tech · S

- **File:** `m/catalog/subscription/subscription.dto.ts`, `subscription.policy.ts` (+spec), `subscription-change.service.ts`, `subscription.service.ts`,
  `subscription.errors.ts`_, `subscription.http-errors.ts`_; `test/http/catalog/subscriptions.http-spec.ts`.
- **Làm:** SPEC-B3 W3-27 (luật ở `subscription.policy.ts`, **không** sửa `subscription-pool.policy.ts`).
- **Xong khi:** bốn ca lỗi W3-27.

### P22 — tech · L

- **File:** `src/cli/seed/steps/catalog.steps.ts`, `catalog.steps.spec.ts`, `catalog-extra.steps.ts`, `assets.steps.ts`, `renewals.steps.ts`,
  `renewals.steps.spec.ts`, `demo-documents.steps.ts`, `request-actions.ts`, `budget-targets.ts`, `budget-targets.spec.ts`;
  `src/cli/seed/fixture/shared-demo-v4/catalog.ts`, `catalog-extra.ts`, `catalog-kit.ts`, `renewals.ts`, `finance.ts`, `README.md`; `docs/guides/seed.md`.
- **Làm:** SPEC-B3 W3-28 (Zoom bậc; Jira theo `QĐ-119e`).
- **Xong khi:** spec unit seed xanh; `seed check` liệt kê bước mới (CI).

### P23 — mỗi làn · S

- **tech:** `pnpm arch:graph`, `pnpm arch:routes`, `pnpm openapi:export` (sinh `docs/generated/*`, `openapi.json`); module card `m/catalog/README.md`,
  `m/licensing/README.md`, `m/budgets/README.md`, `m/requests/README.md`, `m/optimization/README.md`, `m/dashboards/README.md`, `m/personnel/README.md`
  theo _Bàn giao_ của `biz`; `docs/reviews/redesign-w3-2026-11-22/FIX-TEST-tech.md`.
- **biz:** `docs/rules/security-jobs.md` (đoạn `SeatMonthSweeper`, `BudgetReviewSweeper`, `SubscriptionRenewalSweeper`); `docs/rules/database-business.md`
  (bảng khóa gộp SPEC §6.2: thêm 5b, 6a, 6c, 6d, 7b, 9b, bỏ tên 6b); `docs/reviews/redesign-w3-2026-11-22/FIX-TEST-biz.md`.
- **Xong khi:** CI full trên nhánh làn (`gh workflow run ci.yml --ref <nhánh>`) ghi vào `PROGRESS-<làn>.md`.

## Rủi ro

| Rủi ro                                                          | Giảm                                                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| M4/M5/M6 dừng vì khối kiểm trên DB demo                         | Owner chạy các câu `SELECT` của SPEC trước deploy, sửa dữ liệu bằng tay                             |
| M6 đổi hàm đợt 2 làm vỡ kích hoạt máy                           | P12a giữ mọi luật cũ (bảng sáu hàm); P20b chạy lại unit đợt 2 không đổi kỳ vọng; integration ở P12a |
| Trigger sức chứa theo sổ chậm khi nhiều quyền                   | cùng cách đếm đỉnh của trigger cũ; integration đo trên 500 quyền                                    |
| Đổi `INV-01` từ kỳ sang dòng gây deadlock                       | mọi luồng khóa kỳ (6) rồi dòng (6c); test barrier ở P11, P16a, P16b                                 |
| Hai làn cùng sửa `*.module.ts`, manifest                        | chỉ thêm dòng; gộp hợp khi merge                                                                    |
| Gate collection từ chối `NESTED_ARRAYS` mới (`lines`, `admins`) | dừng hỏi Owner; phương án: subresource phân trang                                                   |
| Seed qua API không tạo được seat _lỡ điểm điều chỉnh_           | seed lịch sử (`QĐ-115as`), ghi `docs/guides/seed.md`                                                |

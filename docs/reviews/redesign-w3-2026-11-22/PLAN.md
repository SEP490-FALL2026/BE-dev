# PLAN — Đợt 3 thiết kế lại: kho B1 → B2 → B3 (22/11/2026, bản 1)

Spec: [SPEC.md](SPEC.md) + [SPEC-B1.md](SPEC-B1.md), [SPEC-B2.md](SPEC-B2.md), [SPEC-B3.md](SPEC-B3.md). Trạng thái: Proposed — chờ
Owner duyệt và trả lời [W3-Q1](SPEC.md#9-câu-hỏi-owner). Quy trình: [`docs/guides/quy-trinh-code-ai.md`](../../guides/quy-trinh-code-ai.md).

## Nền và nhánh

- **Điều kiện bắt đầu:** đợt 1 (`int/redesign-w1`) đã merge vào `dev` (SPEC §2.3 giả định 4, §10). Chưa merge ⟹ không tách nhánh.
- **Nhánh làn** tách từ `origin/dev` mới nhất (đã chứa thư mục này):
  - làn `tech` (Bảo) — `feat/redesign-w3-tech`;
  - làn `biz` (Owner) — `feat/redesign-w3-biz`.
- **Nhánh gộp** `int/redesign-w3` (Owner tạo từ `dev`). Hai làn merge vào đó, không vào `dev`. Mỗi phần B1, B2, B3 tự đứng được: Owner
  có thể mở PR `int/redesign-w3` → `dev` sau khi xong **một phần** (CI full xanh + review), rồi làm phần sau trên cùng nhánh gộp.
- **Trong một làn:** tuần tự từng gói, không song song, không worktree.

## Hai làn không sửa chung file

- Làn `tech`: migration + `prisma/models/*` (**chỉ** làn này), repo của bảng mới, route CRUD thuần, DTO/mapper của route đó, chuyển dữ
  liệu, seed, module card `src/modules/*/README.md`.
- Làn `biz`: luật tiền, sổ số seat (facade + dịch vụ ghi), mua thêm seat, điểm điều chỉnh, `K1`, tiền `K4`, ghost seat, job,
  `docs/rules/security-jobs.md`.
- **File được cả hai làn chạm, chỉ thêm dòng, gộp tay khi merge:** `openapi.json` (sinh lại bằng `pnpm openapi:export`),
  `test/support/openapi-example-manifest.ts`, `test/support/openapi-example-route-codes-*.ts`, `test/support/api-coverage-manifest.ts`,
  mảng `providers`/`exports` của `*.module.ts`, danh sách lỗi của `*.errors.ts`/`*.http-errors.ts` có sẵn (thêm lớp/nhánh mới ở cuối),
  bảng mã thông báo hộp thư (mã + khóa params), registry `COLLECTION_EXCEPTIONS`/`NESTED_ARRAYS` của
  `test/gates/api-collection-contract.gate-spec.ts` (thêm mục cần Owner duyệt — dừng hỏi nếu gate từ chối).
  Mọi file khác: đúng **một** làn trong cả đợt (bảng gói dưới). Gói cần file của làn kia ⟹ dừng, ghi bàn giao.
- Module card: làn `biz` ghi thay đổi facade/extension point cần đưa vào card ở `PROGRESS-biz.md` mục _Bàn giao_; làn `tech` cập nhật
  card ở gói chốt của phần.

## Điểm gộp giữa hai làn

| Điểm | Làn xong trước merge vào `int/redesign-w3`       | Làn kia `git merge origin/int/redesign-w3` rồi làm |
| ---- | ------------------------------------------------ | -------------------------------------------------- |
| G1   | tech P1, P3                                      | biz P2 → P8 (B1)                                   |
| G2   | biz P2 → P8; tech P9 (chạy song song với B1 biz) | biz P10 (sau P9); PR B1 → `dev` tùy Owner          |
| G3   | biz P10                                          | PR B2 → `dev` tùy Owner; tech P11, P12             |
| G4   | tech P11, P12                                    | biz P13, P16; tech P14 (song song)                 |
| G5   | biz P13, P16; tech P14                           | tech P15                                           |
| G6   | tech P15                                         | biz P17 → P20                                      |
| G7   | biz P17 → P20                                    | tech P21, P22; cả hai P23                          |

Thứ tự trong làn: **tech** P1 → P3 → P9 → P11 → P12 → P14 → P15 → P21 → P22 → P23; **biz** P2 → P4 → P5 → P6 → P7 → P8 → P10 → P13 →
P16 → P17 → P18 → P19 → P20 → P23.

## Bộ kiểm nhanh (mỗi gói)

```text
pnpm typecheck
pnpm lint                      # chậm: pnpm exec eslint <file…>
pnpm arch:check
pnpm rules:check               # + pnpm rules:format khi sửa docs/rules, README module
pnpm test:gates
pnpm openapi:export && git diff --stat openapi.json
pnpm test -- <mọi *.spec.ts đã chạm/thêm>
pnpm prisma:validate && pnpm prisma:generate   # gói có prisma/
```

- Không chạy `pnpm check`, `test:http`, `test:integration`, `test:e2e`, seed, Docker, migration ở máy. Test http/integration mới
  **viết** trong gói, CI GitHub chạy.
- Luật mới: unit đỏ trước, rồi xanh. Ví dụ số của SPEC là ca kiểm **bắt buộc** (mỗi bảng tiêu chí ⟹ một `it.each`).
- Test cũ khẳng định hành vi cũ: unit của chính luật sửa ngay; http/integration ⟹ `FIX-TEST-<làn>.md`.
- File sát trần 500 dòng (đếm dòng code): `catalog/subscription/subscription.repo.ts` (580 thô), `licensing/assignment/assignment.service.ts`
  (553), `licensing/assignment/assignment.repo.ts` (500), `licensing/provisioning/provisioning-task.repo.ts` (490). Vượt ⟹ tách theo
  chức năng, không suppression. `catalog/subscription/` đã **25 file**: không thêm file vào thư mục đó (dùng capability mới).

## Gói

| #   | Gói                                                                                            | Mục W3                           | Cỡ  | Làn     | Phụ thuộc     |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------- | --- | ------- | ------------- |
| P1  | Giá tháng (dữ liệu, DTO), kỳ cam kết định mua, từ vựng, báo giảm seat                          | W3-01, W3-02 (tech), W3-03       | M   | tech    | đợt 1 ở `dev` |
| P2  | Một phép quy đổi giá tháng                                                                     | W3-02 (biz)                      | M   | biz     | P1 (G1)       |
| P3  | Migration M2, M3 + repo bảng tháng cam kết, cột kho, tham số                                   | W3-07 (tech), W3-05/06 (dữ liệu) | M   | tech    | P1            |
| P4  | Cam kết theo tháng: giữ, áp, giải phóng, chốt tháng, dọn năm                                   | W3-07 (biz)                      | L   | biz     | P2, P3        |
| P5  | Dòng kho seat-ngày bốn dòng con, nhãn (2)(3), tỷ lệ 10 %                                       | W3-04, W3-06                     | M   | biz     | P4            |
| P6  | Số kỳ vọng hóa đơn `K2`, ngưỡng, `SBF-11a`                                                     | W3-05                            | M   | biz     | P5            |
| P7  | Chi phí đang chạy không cam kết (`K2`)                                                         | W3-08                            | M   | biz     | P4            |
| P8  | Ba con số tiết kiệm                                                                            | W3-09                            | M   | biz     | P6            |
| P9  | Workspace (M4, CRUD, chuyển dữ liệu, route cũ), trường thuê bao                                | W3-10, W3-11 (tech), W3-13       | L   | tech    | P3            |
| P10 | Cổng ≥ 2 admin, trùng (workspace, gói), theo thành viên không điểm điều chỉnh                  | W3-11 (biz), W3-12, W3-14        | M   | biz     | P9 (G2)       |
| P11 | Migration M5 + repo dòng, sổ, lần mua, mục tiêu dòng                                           | W3-15/16/21 (dữ liệu)            | L   | tech    | P10 (G3)      |
| P12 | Migration M6, M7 + repo lô, phí license dư, phân bổ hóa đơn, cột `K1`                          | W3-17/23/24/25 (dữ liệu)         | L   | tech    | P11           |
| P13 | `K1` không thuê bao, `K1` năm, phân bổ hóa đơn `K1`, không cam kết `K1`                        | W3-17, W3-23                     | L   | biz     | P11, P12 (G4) |
| P14 | Route lô khóa, nhập khóa vào lô, route cũ, hợp đồng của lô                                     | W3-24 (tech)                     | M   | tech    | P12           |
| P15 | Route dòng thuê bao, `lines[]` khi khai, sổ (đọc)                                              | W3-15 (tech)                     | M   | tech    | P16 (G5)      |
| P16 | Sổ số seat (facade), mua thêm seat, lối tắt khi cấp, bỏ `addSeat`, dòng thông tin trên Request | W3-16 (biz), W3-18, W3-20        | L   | biz     | P13           |
| P17 | Nhảy bậc, ghi theo hãng, giảm giữa kỳ, đổi loại seat, theo thành viên                          | W3-19                            | M   | biz     | P15 (G6)      |
| P18 | Gia hạn theo dòng, chốt mục tiêu, tự gia hạn không ghi                                         | W3-21                            | L   | biz     | P17           |
| P19 | Nhãn (1), `KPI-4`, dòng kho theo sổ                                                            | W3-22                            | M   | biz     | P18           |
| P20 | Cấp `K4` từ lô, tiền `K4`, ghost seat `K4`                                                     | W3-24 (biz), W3-25, W3-26        | M   | biz     | P14, P19      |
| P21 | Bỏ ô sửa tay, `isPrimaryForPlan`, khai `K1`/`PERPETUAL`                                        | W3-27                            | S   | tech    | P20 (G7)      |
| P22 | Seed B3                                                                                        | W3-28                            | L   | tech    | P21           |
| P23 | Chốt đợt: generators, module card, `security-jobs.md`, `FIX-TEST`                              | —                                | S   | mỗi làn | P1–P22        |

Migration: M1 (P1), M2 + M3 (P3), M4 (P9), M5 (P11), M6 + M7 (P12). **M3 không đảo được** (`ALTER TYPE … ADD VALUE`): file riêng, chỉ
ba giá trị enum.

---

## Chi tiết gói

Mỗi gói: _File_ (chính; đường dẫn từ `src/modules/` nếu không ghi khác), _Kiểm thêm_ (ngoài bộ kiểm nhanh), _Xong khi_. Mọi gói: sửa
`openapi.json` + manifest khi đổi contract; mô tả OpenAPI không chứa mã nội bộ.

### P1 — tech · M

- **File:** `prisma/models/catalog.prisma`; `prisma/migrations/20261201000000_w3_monthly_price/migration.sql`;
  `catalog/subscription/subscription.dto.ts`, `subscription.mapper.ts`, `subscription.repo.ts`, `subscription.service.ts`,
  `subscription-change.service.ts`, `subscription.errors.ts`, `subscription.http-errors.ts`; `catalog/plan/plan.dto.ts`,
  `plan.repo.ts`, `plan.mapper.ts`, `plan.service.ts`, `plan.errors.ts`, `plan.http-errors.ts`;
  `catalog/subscription/seat-increase/*` (thông báo giảm); `notifications` mã `SUBSCRIPTION_SEATS_REDUCED` (bảng mã inbox);
  `catalog/README.md`, `licensing/README.md`, `budgets/README.md` (từ vựng); `src/cli/seed/steps/catalog.steps.ts` + fixture (gửi
  `monthlyUnitPrice`, `referenceCommitmentMonths`).
- **Làm:** SPEC-B1 W3-01, W3-02 mục 1, 4, 5 (ghi/đọc trường), W3-03 (thông báo giảm; phần xóa `increasesObligation` ở P10 vì
  file `subscription-obligation.policy.ts` thuộc làn `biz`).
- **Kiểm thêm:** `pnpm prisma:validate`, `pnpm prisma:generate`; integration mới `test/integration/catalog/subscription-monthly-price-migration.integration-spec.ts`
  (bốn ca backfill của SPEC W3-02) — viết, không chạy.
- **Xong khi:** bảng tiêu chí W3-02 (phần ghi/đọc) và thông báo giảm của W3-03 có unit/http.

### P2 — biz · M

- **File:** `catalog/subscription/price/subscription-price.policy.ts` (+ spec), `catalog/subscription/period/subscription-period.service.ts`
  (`getPurchaseFacts` trả `monthlyPriceMinor` từ cột), `catalog/public/catalog.api.ts` (`getSubscriptionPrice` thêm `monthlyPriceMinor`),
  `budgets/cycle/baseline.policy.ts` (+ spec), `requests/access-request/pricing.policy.ts` (+ spec), `optimization/usage-rules/potential-saving.policy.ts`
  (chỉ nguồn giá tháng), `licensing/shared-pool/shared-pool.policy.ts` (chỉ nguồn giá tháng).
- **Làm:** SPEC-B1 W3-02 mục 2, 3, 5 (lần mua đầu đọc kỳ cam kết của gói).
- **Xong khi:** sáu chỗ của bảng hiện trạng W3-02 đọc một nguồn; `it.each` bảng tiêu chí W3-02 xanh.

### P3 — tech · M

- **File:** `prisma/models/budgets.prisma`, `licensing.prisma`, `requests.prisma`; migration `20261201000100_w3_commitment_months_pool_figures`,
  `20261201000200_w3_release_and_outcome_values`; **mới** `budgets/commitment/month/commitment-month.repo.ts` (chèn dòng tháng,
  khóa theo (cam kết, tháng) sắp sẵn, cộng `applied`/`released`, đặt `settled_at`, liệt kê chưa chốt theo tháng);
  `budgets/budget/invoice.repo.ts` (cột `pool_*`); `budgets/review/*repo*` (cột ảnh chụp bốn dòng con, `prior_year_released_minor`);
  **mới** `licensing/subscription-renewal/savings/renewal-savings.repo.ts` (cột `realised_savings_*`; `subscription-renewal.repo.ts` không
  làn nào sửa trong đợt); **mới** `budgets/shared-pool-line/shared-pool-line.repo.ts` (số liệu kho của budgets: phương sai theo tháng); `operating-parameters/parameter-definitions.policy.ts`
  (+ spec: `K2_INVOICE_VARIANCE_THRESHOLD_PERCENT`, `SEAT_PURCHASE_INVOICE_DUE_WORKING_DAYS`, `SEAT_PURCHASE_LATE_INVOICE_DAYS`);
  `src/infrastructure/database/database-role-judgement.ts` nếu chọn chặn ghi thêm.
- **Làm:** SPEC-B1 W3-07 mục 1 (dữ liệu); cột của W3-04, W3-05, W3-09; ba tham số.
- **Kiểm thêm:** prisma validate/generate; integration `test/integration/budgets/commitment-month-repo.integration-spec.ts` (CHECK
  `applied + released ≤ share`, trigger bất biến).
- **Xong khi:** repo có đủ phương thức P4 cần (chữ ký ghi ở `PROGRESS-tech.md` mục _Bàn giao_).

### P4 — biz · L

- **File:** **mới** `budgets/commitment/month/commitment-month.policy.ts` (+ spec), `commitment-month-settlement.service.ts` (+ spec);
  `budgets/commitment/commitment.service.ts` (giữ ghi dòng tháng; giải phóng rải tháng); `budgets/budget/commitment-release.policy.ts`;
  `budgets/seat-month/seat-month.policy.ts`, `seat-month-plan.policy.ts`, `seat-month-subscription.service.ts`, `seat-month.service.ts`
  (bước chốt tháng); `budgets/review/budget-review-period-writer.service.ts` (`priorYearReleased`); `budgets/public/*` (`holdCommitment`
  nhận `months[]`); `requests/spend-effects/spend-effects.service.ts`; `requests/access-request/pricing.policy.ts` (xuất tháng đếm);
  `requests/year-start-commitments/*` (dòng tháng theo seat); `requests/grant/seat-release.policy.ts`, `seat-release.service.ts`.
- **Làm:** SPEC-B1 W3-07 mục 2–6. Thứ tự khóa: comment đầu `commitment-month-settlement.service.ts`.
- **Kiểm thêm:** integration `test/integration/budgets/commitment-month-settlement.integration-spec.ts` (ca A–I; ca H hai connection có
  barrier, lặp 20 lần).
- **Xong khi:** chín ca W3-07 có test; tổng `applied + released = amount` cuối năm ở mọi ca.

### P5 — biz · M

- **File:** **mới** `budgets/shared-pool-line/shared-pool-line.policy.ts`, `shared-pool-line-label.policy.ts`,
  `shared-pool-line-facts.service.ts`, `shared-pool-line-alert.service.ts` (+ spec); `budgets/seat-month/seat-month-pool.policy.ts`,
  `seat-month-pool.service.ts` (bỏ hàm cũ), `seat-month.dto.ts`, `seat-month-query.service.ts`; `budgets/budget-view/budget-table-view.service.ts`
  - DTO `budgetSummary`; `budgets/review/budget-review-pool-watch.service.ts`, `budget-review.policy.ts`, `budget-review-snapshot.service.ts`,
    `budget-review-period-writer.service.ts`, `budget-review-reminder.service.ts` (gọi cảnh báo tỷ lệ); `catalog/subscription/period/subscription-period.service.ts`
  - `catalog/public/subscription-period.api.ts` (`startDate`, `endExclusive`, `adjustmentWindowsOf`); `licensing/public/licensing-seat-month.api.ts`
    (nếu cần khoảng giữ của seat).
- **Làm:** SPEC-B1 W3-04, W3-06.
- **Kiểm thêm:** http `test/http/budgets/seat-month-charges.http-spec.ts` (trường mới); integration đẳng thức kho.
- **Xong khi:** bảng tiêu chí W3-04, W3-06 xanh; `NESTED_ARRAYS` không cần mục mới (không mảng mới).

### P6 — biz · M

- **File:** **mới** `requests/purchase-invoice/pool-expectation/purchase-invoice-pool-expectation.policy.ts` (+ spec);
  `requests/purchase-invoice/confirmation/purchase-invoice-confirmation.service.ts`; `requests/purchase-invoice/purchase-invoice-plan.service.ts`;
  `requests/invoice-discrepancy/invoice-discrepancy-closure.policy.ts`, `invoice-discrepancy-closure.service.ts`; DTO của
  `invoiceDiscrepancyClose`/`Get`, `purchaseInvoiceGet`; `budgets/invoice/purchase-invoice-recorder.service.ts` + `budgets/public/*`.
- **Làm:** SPEC-B1 W3-05.
- **Xong khi:** bảy ca W3-05 có test; hồ sơ một hóa đơn gộp `mismatches`.

### P7 — biz · M

- **File:** **mới** `budgets/budget/running-uncommitted.policy.ts`, `running-uncommitted-facts.service.ts` (+ spec);
  `licensing/public/licensing-seat-month.api.ts` (`getSeatsInForceOn`) + repo đọc của licensing; `budgets/public/*` (lát ngân sách);
  `requests/spend/budget-check.policy.ts` (+ spec); `budgets/budget-view/*` (còn lại, dự kiến cuối năm).
- **Làm:** SPEC-B1 W3-08.
- **Xong khi:** sáu ca W3-08; kiểm tra ngân sách gửi và duyệt cùng số.

### P8 — biz · M

- **File:** `optimization/usage-rules/potential-saving.policy.ts` (+ spec), `usage-rules-seat.service.ts`; `catalog/public/subscription-period.api.ts`
  (`earliestReducibleOn`); `licensing/shared-pool/shared-pool.policy.ts`, `shared-pool.service.ts`; `licensing/public/licensing.api.ts`
  (`recordAvoidedCost`, `recordRealisedSaving`); **mới** `licensing/subscription-renewal/savings/renewal-savings.service.ts` (+ spec);
  `licensing/subscription-renewal/outcome/renewal-outcome.policy.ts`, `renewal-outcome.service.ts`; `requests/grant/access-request-grant.listener.ts`;
  `requests/purchase-invoice/confirmation/purchase-invoice-confirmation.service.ts`.
- **Làm:** SPEC-B1 W3-09.
- **Xong khi:** mười ca W3-09; không còn ghi tiết kiệm thực ở lúc IT ghi kết quả.

### P9 — tech · L

- **File:** `prisma/models/catalog.prisma`; migration `20261202000000_w3_workspaces`; **mới** `catalog/workspace/*` (controller, dto,
  service, admins service, policy dạng kiểm vào, repo, mapper, errors, http-errors + spec); **mới** `catalog/public/workspace.api.ts`;
  `catalog/plan/plan-workspace.service.ts`, `plans.controller.ts` (route cũ ghi workspace), `plan.mapper.ts`; `catalog/subscription/subscription.dto.ts`,
  `subscription.mapper.ts`, `subscription.repo.ts`, `subscription.service.ts`, `subscription-change.service.ts` (lưu `workspaceId`,
  `seatCounting`, `minimumSeatsTotal`, `invoicedLater`; ánh xạ lỗi CHECK/trigger C2, C4; khóa workspace FU trước plan FU trong
  `declareIn`/`complete`/đổi `workspaceId` — W3-14); service của `CatalogResponsibilityApi.transferResponsibilities`
  (chuyển workspace); `src/cli/seed/steps/catalog.steps.ts` + fixture (workspace + admin; Slack `MEMBERS`); `test/gates/api-collection-contract.gate-spec.ts`
  mục `NESTED_ARRAYS` `workspaceGet#admins` (cần Owner duyệt — registry chỉ co lại: **dừng hỏi** nếu gate từ chối thêm).
- **Làm:** SPEC-B2 W3-10, W3-11 (phần dữ liệu và trường), W3-13.
- **Kiểm thêm:** integration `test/integration/catalog/workspace-migration.integration-spec.ts` (ca gộp hồ sơ Anthropic), http
  `test/http/catalog/workspaces.http-spec.ts`.
- **Xong khi:** năm tiêu chí W3-10, ba tiêu chí W3-11 (phần lưu), W3-13.

### P10 — biz · M

- **File:** `catalog/subscription/pool/subscription-pool.policy.ts`, `subscription-pool.service.ts` (+ spec);
  `catalog/subscription/obligation/subscription-obligation.policy.ts` (+ spec: `hasAdjustmentPoint` theo `seatCounting`; xóa
  `increasesObligation` — W3-03); khóa workspace đã có từ P9 (không sửa `subscription.service.ts`);
  `licensing/subscription-renewal/subscription-renewal-sweep.service.ts` (bỏ `MEMBERS`); `licensing/dashboard-facts/*` (đếm workspace có cờ);
  `catalog/plan/plan-facts.service.ts` (dùng hàm đếm W1-19 theo workspace).
- **Làm:** SPEC-B2 W3-11 (luật), W3-12, W3-14.
- **Kiểm thêm:** integration khai đồng thời (W3-14).
- **Xong khi:** bảng W3-12; ba tiêu chí W3-14; `grep -rn increasesObligation src` = 0.

### P11 — tech · L

- **File:** `prisma/models/catalog.prisma`, `licensing.prisma`; migration `20261203000000_w3_subscription_lines_seat_ledger` (bảng, unique,
  trigger append-only, trigger sức chứa sổ, thay `license_assignment_check_capacity`, sửa `subscriptions_fit_plan`, CHECK `decider_role`,
  backfill dòng + `INITIAL`, unique `purchase_invoices(seat_purchase_id)`); **mới** `catalog/subscription-line/subscription-line.repo.ts`,
  `ledger/seat-ledger.repo.ts`, `purchase/seat-purchase.repo.ts`; **mới** `licensing/subscription-renewal/lines/subscription-line-target.repo.ts`;
  `src/infrastructure/database/database-role-judgement.ts` (`seat_changes` chỉ `SELECT, INSERT`).
- **Làm:** SPEC-B3 §1.1.
- **Kiểm thêm:** integration `test/integration/catalog/seat-ledger-constraints.integration-spec.ts` (append-only với owner, dưới số đang
  chiếm, unique `TOP_UP`, C1), `…/subscription-lines-migration.integration-spec.ts` (mở sổ, dừng khi trùng).
- **Xong khi:** câu `SELECT` kiểm trùng của SPEC-B3 §1.1 ghi vào commit message; repo có chữ ký P16/P18 cần.

### P12 — tech · L

- **File:** `prisma/models/catalog.prisma`, `licensing.prisma`, `budgets.prisma`; migration `20261203000100_w3_license_lots`,
  `20261203000200_w3_personal_rights_allocations`; **mới** `catalog/license-lot/license-lot.repo.ts`; `licensing/license-key/license-key.repo.ts`
  (cột lô, `cost_borne`); **mới** `budgets/invoice/invoice-allocation.repo.ts`, `budgets/shared-pool-line/license-lot-charge.repo.ts`;
  `licensing/assignment/assignment.repo.ts` (hai cột `K1` — sát trần 500: tách file nếu vượt); `budgets/budget/invoice.repo.ts`
  (`spentOf` đọc `invoice_allocations`), `budgets/seat-month/seat-month.repo.ts` (thực chi công ty đọc phân bổ); **mới**
  `licensing/subscription-renewal/lines/subscription-renewal-auto.repo.ts` (ca hệ thống, `auto_recorded`).
- **Làm:** SPEC-B3 §1.2, §1.3.
- **Kiểm thêm:** integration `test/integration/catalog/license-lot-migration.integration-spec.ts`, `…/licensing/license-lot-capacity.integration-spec.ts`.
- **Xong khi:** DB demo chuyển `PERPETUAL` → lô đúng tiêu chí 1 của W3-24 (test).

### P13 — biz · L

- **File:** `licensing/provisioning/tasks/provisioning-grant-writer.service.ts` (`takeSeat` `K1`), `licensing/shared-pool/shared-pool.service.ts`
  (`chooseSubscription` bỏ `K1`), `catalog/subscription/seat-target.service.ts` (`K1` không thuê bao); `src/core/term-limit.ts`;
  `requests/access-request/*` (luật `K1` năm, hợp đồng ngắn, tiếp tục); `requests/grant/seat-release.policy.ts` (`K1` năm);
  đường xin lại khi điều chuyển (`requests` — capability xin lại ân hạn); `budgets/invoice/purchase-invoice-recorder.service.ts`
  (ghi phân bổ; đọc phân bổ đã ở repo của P12); `budgets/budget/running-uncommitted.policy.ts` (phần `K1`);
  `optimization/usage-rules/potential-saving.policy.ts` (`K1` theo ngày neo); `licensing/stock-summary/*` (bỏ `K1`).
- **Làm:** SPEC-B3 W3-17, W3-23.
- **Xong khi:** sáu ca W3-17, hai ca W3-23; cấp `K1` không chạm `subscriptions`/`seat_changes` (integration).

### P14 — tech · M

- **File:** **mới** `catalog/license-lot/*` (controller, dto, service CRUD, mapper, errors, http-errors + spec); **mới**
  `catalog/public/license-lot.api.ts`; **mới** `licensing/license-key/license-lot-keys.controller.ts` (nhập khóa vào lô, dùng lại service mã hóa);
  `licensing/license-key/license-keys.controller.ts`, `license-key.service.ts`, `license-key.dto.ts` (route cũ quy về lô, lọc `licenseLotId`);
  `catalog/contract/*` (`contractSubscriptionLink` chỉ `K2`; trigger hợp đồng ↔ lô đã ở M6); service `transferResponsibilities` (chuyển lô).
- **Làm:** SPEC-B3 W3-24 (route, route cũ, hợp đồng, chuyển phụ trách). Cổng admin cho lô gọi policy của P10 (không chép).
- **Xong khi:** tiêu chí 2, 4 W3-24 (http); tiêu chí 3 ở P20.

### P15 — tech · M

- **File:** **mới** `catalog/subscription-line/subscription-lines.controller.ts`, `subscription-line.dto.ts`, `subscription-line.service.ts`,
  `subscription-line.mapper.ts`, `subscription-line.errors.ts`, `subscription-line.http-errors.ts` (+ spec); `catalog/subscription/subscription.dto.ts`,
  `subscription.mapper.ts`, `subscription.service.ts` (`lines[]`, thân cũ = một dòng, gọi `SeatLedgerApi.openLines`), `subscription-view.service.ts`;
  `licensing/assignment/subscription-seats.controller.ts` (seat theo dòng); `test/gates/api-collection-contract.gate-spec.ts` (`subscriptionGet#lines`
  — dừng hỏi nếu gate từ chối).
- **Làm:** SPEC-B3 W3-15.
- **Xong khi:** bốn tiêu chí W3-15.

### P16 — biz · L

- **File:** **mới** `catalog/subscription-line/ledger/seat-ledger.policy.ts`, `seat-ledger.service.ts`; `purchase/seat-purchase.policy.ts`,
  `seat-purchase.service.ts` (+ spec); **mới** `catalog/public/seat-ledger.api.ts`; **mới** `licensing/shared-pool/seat-purchases.controller.ts`,
  `seat-purchase.dto.ts`; `licensing/shared-pool/shared-pool.policy.ts`, `shared-pool.service.ts` (`chooseLine`), `shared-pool-capacity.repo.ts`;
  `licensing/provisioning/tasks/provisioning-grant-writer.service.ts` (`takeSeat` qua sổ); `catalog/subscription/pool/subscription-pool.service.ts`
  (xóa `addSeat`), `catalog/subscription/subscription-facts.service.ts`, `catalog/public/catalog.api.ts` (xóa `addPoolSeat`);
  `licensing/assignment/assignment.service.ts` (bỏ `carryOrBuy`); `requests/purchase-invoice/*` (`seatPurchaseId`, nhãn `SEAT_PURCHASE`,
  422 `SEAT_PURCHASE_REQUIRED`); `requests/access-request/*` + `requests/spend/*` view (`vendorChargeUntilRenewal`);
  `licensing/subscription-renewal/subscription-renewal-sweep.service.ts` (nhắc hạn hóa đơn lần mua).
- **Làm:** SPEC-B3 W3-16 (facade), W3-18, W3-20.
- **Xong khi:** chín ca W3-18, ca W3-20; `grep -rn "addPoolSeat\|addSeat(" src` = 0.

### P17 — biz · M

- **File:** **mới** `catalog/subscription-line/correction/subscription-line-correction.service.ts`, `subscription-line-seats.controller.ts`
  (seat-corrections, seat-reductions) (+ spec); `catalog/subscription-line/purchase/*` (bậc, đổi loại seat); `licensing/provisioning/*` (thành
  viên ±1 lúc cấp và lúc hoàn tất thu hồi).
- **Làm:** SPEC-B3 W3-19.
- **Xong khi:** sáu ca W3-19.

### P18 — biz · L

- **File:** `licensing/subscription-renewal/seats-needed/*`, `record/*`, `outcome/*`, `deadline/*`, **mới** `lines/subscription-renewal-lines.policy.ts`,
  `subscription-renewal-lines.service.ts`, `subscription-renewal-auto.service.ts` (+ spec); `subscription-renewal.dto.ts`, `subscription-renewals.controller.ts`,
  `subscription-renewal-view.service.ts`, `subscription-renewal-sweep.service.ts`; `catalog/subscription/period/subscription-period.service.ts`
  (`recordNextPeriod` nhận `lines[]`); `catalog/public/subscription-period.api.ts`; `licensing/subscription-renewal/savings/*` (thực theo dòng);
  seed `renewals.steps.ts` **không** sửa (làn `tech`, P22): ghi thân mới vào `PROGRESS-biz.md` mục _Bàn giao_.
- **Làm:** SPEC-B3 W3-21. `renewal-record.service.ts` đã gần trần độ phức tạp: tách policy theo dòng.
- **Xong khi:** chín ca W3-21; tự ghi chạy hai instance một kết quả.

### P19 — biz · M

- **File:** `budgets/shared-pool-line/*` (nguồn sổ, nhãn (1)); **mới** `licensing/subscription-renewal/kpi/kpi-missed-adjustment.policy.ts`,
  `…service.ts`; `licensing/subscription-renewal/subscription-renewal-view.service.ts` (`KPI-4`); `catalog/plan/plan.policy.ts` (`KPI-3` mẫu số).
- **Làm:** SPEC-B3 W3-22.
- **Xong khi:** bốn ca W3-22.

### P20 — biz · M

- **File:** `catalog/subscription/seat-target.service.ts` (khóa lô cho `K4`), `catalog/license-lot/license-lot-price.policy.ts` (**mới**, giá
  Request `K4`); `licensing/provisioning/tasks/provisioning-grant-writer.service.ts`, `provisioning-grant-completion.service.ts`,
  `licensing/license-key/license-key-assignment.service.ts` (chọn lô, `cost_borne`); `requests/grant/pool-grant-release.policy.ts`,
  `access-request-grant.listener.ts`; `budgets/invoice/purchase-invoice-recorder.service.ts` (chia hóa đơn lô); `budgets/shared-pool-line/*`
  (phí license dư, tỷ lệ lô); `requests/purchase-invoice/*` (link `LICENSE_LOT`); `optimization/internal-rules/internal-rules.policy.ts`,
  `internal-rules-g1.service.ts`, `licensing/shared-pool/shared-pool-vacancy.service.ts` (`G1` theo lô).
- **Làm:** SPEC-B3 W3-24 (cấp, giá), W3-25, W3-26 theo lựa chọn W3-Q1 (mặc định A).
- **Xong khi:** sáu ca W3-25, ca W3-26, tiêu chí 3 và 5 của W3-24.

### P21 — tech · S

- **File:** `catalog/subscription/subscription.dto.ts`, `subscription.policy.ts`, `subscription-change.service.ts`, `subscription.service.ts`,
  `subscription.errors.ts`, `subscription.http-errors.ts` (luật `kind`/`K1` đặt ở `subscription.policy.ts`, **không** sửa
  `subscription-pool.policy.ts` của làn `biz`).
- **Làm:** SPEC-B3 W3-27.
- **Xong khi:** bốn ca lỗi W3-27.

### P22 — tech · L

- **File:** `src/cli/seed/steps/catalog.steps.ts`, `catalog-extra.steps.ts`, `assets.steps.ts`, `renewals.steps.ts`, `demo-documents.steps.ts`,
  `request-actions.ts`, `budget-targets.ts`, fixture `src/cli/seed/fixture/shared-demo-v4/*` (+ spec của step); `docs/guides/seed.md`.
- **Làm:** SPEC-B3 W3-28.
- **Xong khi:** spec unit seed xanh; `seed check` liệt kê bước mới (CI).

### P23 — mỗi làn · S

- **tech:** `pnpm arch:graph`, `pnpm arch:routes`, `pnpm openapi:export`; module card `catalog`, `licensing`, `budgets`, `requests`,
  `optimization` theo bàn giao của `biz`; `FIX-TEST-tech.md`.
- **biz:** `docs/rules/security-jobs.md` (đoạn `SeatMonthSweeper`, `BudgetReviewSweeper`, `SubscriptionRenewalSweeper`); `FIX-TEST-biz.md`.
- **Xong khi:** CI full trên nhánh làn (`gh workflow run ci.yml --ref <nhánh>`) ghi vào `PROGRESS-<làn>.md`.

## Rủi ro

| Rủi ro                                                                          | Giảm                                                                              |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| M5 dừng vì trùng (workspace, gói) trên DB demo                                  | Owner chạy câu `SELECT` của SPEC-B3 §1.1 trước deploy, gộp bằng tay               |
| Trigger sức chứa mới (sổ) chậm khi nhiều quyền                                  | cùng cách đếm đỉnh của trigger cũ; integration đo trên 500 quyền                  |
| Đổi `INV-01` từ `subscriptions` sang dòng làm deadlock với luồng cũ còn khóa kỳ | mọi luồng khóa kỳ (6) rồi dòng (6b); test barrier ở P11, P16                      |
| Hai làn cùng sửa `*.module.ts`, manifest                                        | chỉ thêm dòng; gộp hợp ở merge (quy trình bước 4)                                 |
| Gate collection từ chối mục `NESTED_ARRAYS` mới (`lines`, `admins`)             | dừng hỏi Owner (registry chỉ co lại theo luật); phương án: subresource phân trang |
| Seed qua API không tạo được seat _lỡ điểm điều chỉnh_                           | để seed lịch sử (`QĐ-115as`), ghi `docs/guides/seed.md`                           |

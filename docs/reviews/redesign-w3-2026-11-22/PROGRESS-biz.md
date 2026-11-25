# PROGRESS — Đợt 3 thiết kế lại, làn `biz` (làm thẳng trên `int/redesign-w3` — Owner)

Tracker sống qua compact context. Người code đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp:** process skill, TDD skill, `superpowers:verification-before-completion`; đọc lại SPEC phần của
  gói và PLAN mục gói (CODE-PROMPT mục 0). Đọc lại **LUẬT CỨNG** của CODE-PROMPT.
- **Đã chốt (SPEC §13 + dòng `Owner đã chốt:`), không hỏi lại:** W3-Q1 A · Q-A bỏ `ROLE_RIGHT` · Q-B giữ mua kỳ sau · Q-C dòng cũ đóng tại ngày
  kết thúc kỳ · Q-D một thông báo admin workspace · Q-E ngưỡng so tiền hàng · Q-F _Bị khóa tới_ kỳ sau sau hạn chót · Q-G ba luật số · QĐ-118d/f/l.
- **Ví dụ số của SPEC là ca kiểm bắt buộc** — mỗi bảng một `it.each`, đúng tới đồng; mỗi luật tiền ca biên + ca diệt đột biến (SPEC §11).
- **Nền:** `origin/dev` có đợt 1 **và đợt 2** (lệnh kiểm ở CODE-PROMPT §1). Hai làn chạy song song (PLAN bản 2.4): `tech` kéo `int` về trước mỗi gói; chỉ đẩy lên `int` ở cửa C1/C2 (PLAN _Cửa_); gói có "… ở int" ở cột _Phụ thuộc_ chỉ làm khi gói đó đã ở `int`, chưa thì làm việc lấp.
- **Làn biz sở hữu:** luật tiền, sổ số seat, mua seat, điểm điều chỉnh, `K1`, tiền `K4`, ghost seat, job, thông báo, `docs/rules/security-jobs.md`,
  bảng khóa ở `docs/rules/database-business.md`. Bản 2.4: **trọn B1** gồm P1, P3 (M1–M3, `prisma/`, seed B1, README P1 chạm). Ngoài B1 **không** sửa `prisma/`, migration, seed, module card (ghi _Bàn giao_).

## Gói

| Gói  | Mục                                            | Trạng thái | sha | Lệnh kiểm + kết quả | FIX-TEST thêm | Ghi chú / chưa kiểm được |
| ---- | ---------------------------------------------- | ---------- | --- | ------------------- | ------------- | ------------------------ |
| P1   | W3-01, W3-02 (ghi/đọc), W3-03 (thông báo) — M1 | xong | f9317b53 | rules:format/check PASS; prisma:validate/generate PASS; typecheck PASS; lint PASS; arch:check 0 viol; gates 17/17 (335 tests) PASS; unit 52/52 (1271 tests) PASS | +1 (`shared-pool-subscription-http.integration-spec.ts` Q-09) | Integration & HTTP test chưa chạy trên máy (CI cuối B1); `increasesObligation` xóa ở P10; `unallocated` đổi ở P5 |
| P3   | M2, M3, repo tháng cam kết, tham số            | xong | 5e254a8f | prisma:validate/generate PASS; typecheck PASS; lint PASS; arch:check 0 viol; gates 17/17 (335 tests) PASS; openapi 0 diff; unit 70/70 (695 tests) PASS | +1 (`operating-parameters-http.integration-spec.ts:550`) | Integration test `commitment-month-repo.integration-spec.ts` chỉ viết, chưa chạy trên máy; ghi `D-3` cần Owner (`invoice_pool_variance_resolutions`), `D-4` gỡ ép kiểu tạm ở P4/P6 |
| P2   | W3-02 (biz)                                    | xong       | dc38286b | typecheck PASS; lint PASS; arch:check 0 viol; rules:check 0 err; gates 17/17 PASS; openapi 0 diff; unit P2 PASS | +0 | Đã đối chiếu 6 chỗ quy đổi + `calendarMonthsIn` + lần mua đầu `K2` |
| P4   | W3-07                                          | xong       | ca709e5b | typecheck PASS; lint PASS; arch:check 0 viol; arch:capabilities 0 cyc; rules:check 0 err; gates 17/17 PASS; openapi PASS; unit budgets+requests 175/175 (1969) PASS | +0 | Gỡ `as ReleaseWire['reason']` (`D-4`); integration `commitment-month-settlement.integration-spec.ts` viết sẵn (ca A–L, H barrier ×20), chưa chạy trên máy |
| P5   | W3-04, W3-06, W3-01 (`unallocated`)            | xong       | 324b82ee | typecheck PASS; lint PASS; arch:check 0 viol; arch:capabilities 0 cyc; rules:check 0 err; gates 17/17 PASS; openapi PASS; unit budgets+catalog+licensing+notifications 214/214 (3033) PASS | +0 | Ghi `D-7` (giữ 0 `NESTED_ARRAYS` mới), `D-8` (chuyển `reminder/`); integration `shared-pool-line-identity.integration-spec.ts` + http `seat-month-charges`/`budget-summary` viết sẵn |
| P6   | W3-05                                          | xong       | 99c36020 | typecheck PASS; lint PASS; arch:check 0 viol; arch:capabilities 0 cyc; rules:check 0 err; gates 17/17 PASS; openapi PASS; unit requests+budgets+notifications+licensing 285/285 (3802) PASS | +0 | Thực hiện `D-3` (`markPoolVarianceResolved`), gỡ `as` (`D-4`); integration `purchase-invoice-pool-variance.integration-spec.ts` + http `purchase-invoice-confirmation.http-spec.ts` viết sẵn |
| P7   | W3-08                                          | xong       |     | typecheck PASS; lint PASS; arch:check 0 viol; arch:capabilities 0 cyc; rules:check 0 err; gates 17/17 PASS; openapi +21 dòng; unit budgets+requests+licensing 266/266 (2999) PASS | +4 | Ghi `D-9`..`D-11`; `http/budgets/budget-summary.http-spec.ts` viết sẵn; 4 test cũ đụng `runningUncommitted` ghi `FIX-TEST-biz.md` |
| P8   | W3-09                                          | chưa       |     |                     |               |                          |
| P10  | W3-11 (biz), W3-12, W3-14, W3-03 (xóa)         | chưa       |     |                     |               |                          |
| P16a | W3-16, W3-15 (chọn dòng), W3-18 (lối tắt)      | chưa       |     |                     |               |                          |
| P13a | W3-17                                          | chưa       |     |                     |               |                          |
| P13b | W3-23                                          | chưa       |     |                     |               |                          |
| P16b | W3-18, W3-20                                   | chưa       |     |                     |               |                          |
| P17  | W3-19                                          | chưa       |     |                     |               |                          |
| P18  | W3-21                                          | chưa       |     |                     |               |                          |
| P19  | W3-22                                          | chưa       |     |                     |               |                          |
| P20  | W3-24 (biz), W3-25, W3-26                      | chưa       |     |                     |               |                          |
| P23  | chốt đợt (rule, bảng khóa gộp)                 | chưa       |     |                     |               |                          |

Trạng thái: `chưa` · `đang làm` · `xong` (chỉ sau khi đối chiếu từng tiêu chí — LUẬT CỨNG 6) · `dừng hỏi`.

## Tự quyết

| Gói | Điểm | Chọn | Vì sao | File |
| --- | ---- | ---- | ------ | ---- |

## Bàn giao cho làn tech (seed, module card, repo cần thêm)

| Gói biz | Việc | Gói tech |
| ------- | ---- | -------- |

## CI GitHub

| Commit | Link run | quality | http | integration | timing | serial | e2e-smoke | Ghi chú |
| ------ | -------- | ------- | ---- | ----------- | ------ | ------ | --------- | ------- |

## Đối chiếu tiêu chí (LUẬT CỨNG 6)

### P1 (W3-01 trừ `unallocated`, W3-02 tech/M1, W3-03 thông báo giảm)
- W3-01 #1 (`openapi.json` không `perpetual subscription`/`pool of the plan` ở op mới chạm; K4 nói `license lot`/`price of one license`): `plan.dto.ts:26`, `license-key-template.policy.ts:10`, `test:gates` 17/17 PASS, grep `perpetual subscription` = 0.
- W3-01 #2 (3 module card có `## Từ vựng`, không mã `QĐ`): `catalog/README.md`, `licensing/README.md`, `budgets/README.md`, `rules:check` + `rules:format` PASS.
- W3-02 #1 (M1 `monthly_unit_price_minor`, `reference_commitment_months`, pre-check VND/OTHER/no-price, backfill `(p*2+m)/(2*m)`, CHECK sau backfill): `prisma/models/catalog.prisma:246,366`, `20261201000000_w3_monthly_price/migration.sql`, `subscription-monthly-price-migration.integration-spec.ts` (viết sẵn).
- W3-02 #4 (`monthlyUnitPrice`, `unitPrice` cũ quy đổi `83.333`/`83.334`/`999.996`, `422 SUBSCRIPTION.PRICE_MISMATCH`, `QUARTERLY`/`OTHER` -> `422 VALIDATION_ERROR`): `subscription.policy.ts:360-444`, `subscription.dto.ts:15-16`, `subscription.service.ts:173-197`, `subscription-change.service.ts:125-145`, `subscription-pricing.service.spec.ts:92-192`, `test/http/catalog/subscriptions.http-spec.ts:50-109`.
- W3-02 #5 (`referenceCommitmentMonths` 1|12 K1/K2, K4/K5 -> `422 PLAN.REFERENCE_COMMITMENT_NOT_APPLICABLE`, khai thuê bao mặc định lấy của gói): `plan.policy.ts:185-198`, `plan.service.ts:172-178,230-240`, `subscription.service.ts:220-223`, `plan.service.spec.ts:148-189`, `subscription-no-owner.service.spec.ts`.
- W3-03 (giảm `purchasedQuantity` `ACTIVE K2` gửi `SUBSCRIPTION_SEATS_REDUCED` cho R1 + Finance, event key idempotent, `409 STALE` không gửi): `subscription-seat-increase.policy.ts:38-75`, `subscription-seat-increase.service.ts:68-108`, `subscription-change.service.ts:157-195`, `subscription-seat-increase.policy.spec.ts:97-147`, `subscription-seat-increase.service.spec.ts`, `quantity-change/subscription-change.service.spec.ts`, `test/http/catalog/subscriptions.http-spec.ts:111-125`.

### P3 (M2, M3, repos tháng cam kết/kho/tiết kiệm, 3 tham số)
- W3-07 #1 (M2 `budget_commitment_months`, PK `(commitment_id, month)`, CHECK `applied+released <= share`, trigger bất biến 4 cột; `CommitmentMonthRepo`; M3 `MONTH_END`, `YEAR_END_SEAT_MONTHS`): `prisma/models/budgets.prisma:379-396`, `20261201000100_w3_commitment_months_pool_figures/migration.sql:31-85`, `20261201000200_w3_release_and_outcome_values/migration.sql:5-6`, `commitment-month.repo.ts`, `commitment-month.repo.spec.ts`, `commitment-month-repo.integration-spec.ts:53-153`.
- W3-04 & W3-05 dữ liệu (`invoices.pool_expected_minor/variance/month/in_review`, CHECK `invoices_pool_figures`, `invoice_pool_variance_resolutions` append-only H7, `budget_review_periods.shared_pool_*`, `budget_review_lines.prior_year_released_minor`, M3 `EXCHANGE_RATE_LINE_PRICE_UPDATED` + CHECK `mismatches`, 3 tham số): `budgets.prisma:459-479,693-717`, `migration.sql` M2:86-225 & M3:7-12, `invoice.repo.ts`, `invoice.repo.spec.ts`, `shared-pool-line.repo.ts`, `shared-pool-line.repo.spec.ts`, `budget-review.repo.ts`, `parameter-definitions.policy.ts:159-171,325-348`, `parameter-definitions-pool.policy.spec.ts`, `database-role-judgement.ts:26`, `database-role-judgement.spec.ts`.
- W3-09 #3 dữ liệu (`subscription_renewals.realised_savings_recorded_at/invoice_id`, CHECK `>= 0`, trigger ghi 1 lần; `RenewalSavingsRepo`): `licensing.prisma`, `migration.sql` M2:228-307, `renewal-savings.repo.ts`, `renewal-savings.repo.spec.ts`.

### P2 (W3-02 một phép quy đổi giá tháng, tháng lịch `K2`, lần mua đầu `K2`)
- W3-02 #2 (một phép quy đổi, 6 chỗ bảng hiện trạng đọc `monthlyPriceMinor` qua `getPurchaseFacts`/`getSubscriptionPrice`/`getPlanPrice`, `monthlyPriceOf`/`monthlyCostOf`): `subscription-price.policy.ts:50-63`, `subscription-price.service.ts`, `subscription-priced.repo.ts:77-134`, `subscription.repo.ts:468,487`, `subscription-facts.service.ts:107`, `subscription-period.service.ts:157`, `baseline.policy.ts:71-80`, `pricing.policy.ts:73-112`, `potential-saving.policy.ts:29-31`, `shared-pool.policy.ts:78-83`, `subscription-price.policy.spec.ts`, `baseline.policy.spec.ts`, `potential-saving.policy.spec.ts`, `shared-pool.policy.spec.ts`.
- W3-02 #3 (Request `K1`/`K2` = `monthly × months × people`, `seatMonthlyMinor` = `monthly`, `K2` gọi `calendarMonthsIn`, `K1` giữ `monthsBeginningIn`): `src/core/term-limit.ts:198-210`, `pricing.policy.ts:186-240`, `request-preview.service.ts:100-103`, `pricing-view.service.ts:45-61,106-116`, `spend-effects.service.ts:69-90`, `term-limit.spec.ts:346-359`, `pricing.policy.spec.ts:346-378`.
- W3-02 #5 (`K2` lần mua đầu `referenceCommitmentMonths` `NULL` -> đọc như 12 = `500.000 × 12 = 6.000.000`): `plan-reference-price.repo.ts:27-46`, `spend-approval-snapshot.service.ts:103-130`, `pricing.policy.ts:114-152`, `pricing.policy.spec.ts:381-395`.

### P4 (W3-07 cam kết `K2` theo tháng: giữ, áp, giải phóng, chốt tháng, dọn năm cũ, `priorYearReleased`)
- W3-07 #2 (lúc giữ `K2` ghi dòng tháng theo `calendarMonthsIn` / `YEAR_START`, K1/K4 không ghi): `spend-effects.service.ts:757-895`, `year-start-commitments.policy.ts:293-315`, `year-start-commitments-batch.service.ts:179-198`, `commitment-month.policy.ts:57-99`, `commitment.service.ts:283-363`, `spend-effects.service.spec.ts`, `year-start-commitments-batch-monthly.service.spec.ts`.
- W3-07 #3, #4, #6, #7 (áp seat-tháng `min(amount, remaining)` không tràn tháng khác; đảo trả dòng & xóa `settledAt`; tính lại `stateOf` F3/F3'): `commitment-month.policy.ts:104-116,213-218`, `seat-month.policy.ts:85-103`, `seat-month-plan.policy.ts:74-105`, `seat-month-subscription.service.ts:96-263`, `commitment-month-cases-a.policy.spec.ts`, `commitment-month-cases-b.policy.spec.ts`, `seat-month-subscription.service.spec.ts`.
- W3-07 #5 (F1 tổng thực nhận, F2 min/max `month` từ dòng tháng, F15 1đ, `REMAINDER` rải ngược 12->11): `commitment-month.policy.ts:122-204`, `commitment-release.policy.ts:43-59`, `commitment.service.ts:87-196` (gỡ `as` D-4), `commitment.dto.ts:97-102`, `seat-release.policy.ts:133-260`, `seat-release.service.ts:69-215`, `seat-release-monthly.policy.spec.ts`, `commitment-monthly.service.spec.ts`.
- W3-07 #8, #9 (chốt tháng `MONTH_END` + bỏ qua 0đ + khóa 0->9->9b->10 E1; dọn năm cũ `YEAR_END_SEAT_MONTHS` F6(a,c); `priorYearReleased` Q-G): `commitment-month-settlement.service.ts:1-298`, `seat-month.service.ts:38-55`, `seat-month.job.ts:50-90`, `budget-facts.repo.ts:163-207`, `budget-review-figures.service.ts:85-139`, `budget-review.dto.ts:110-114`, `commitment-month-settlement.service.spec.ts`, `seat-month.job.spec.ts`, `budget-review-price.service.spec.ts:184-228`, `test/integration/budgets/commitment-month-settlement.integration-spec.ts`.

### P5 (W3-04 dòng kho seat-ngày & 4 dòng con, W3-06 nhãn (2)(3) & tỷ lệ 10 %, W3-01 mô tả `unallocated`)
- W3-04 (seat-ngày `paidSeatDays`/`heldSeatDays`/`idleCost`, 4 dòng con kho, tập kỳ `ACTIVE` `K2` `TERM`, `NO_PRICE`/`NO_QUANTITY`, `budgetSummary.sharedPoolLines`, `seatMonthChargeList.poolLines[]`, ảnh chụp rà soát): `shared-pool-line.policy.ts:43-197`, `shared-pool-line-facts.service.ts:60-249`, `shared-pool-line.repo.ts`, `seat-month-pool.policy.ts` (gỡ `paidMinor`/`poolLineMinor`), `seat-month-pool.service.ts`, `seat-month-query.service.ts:76-100`, `seat-month.dto.ts:33-89`, `budget-table-view.service.ts:95-128`, `budget.dto.ts`, `budget-review-period-writer.service.ts:103-107`, `budget-review-pool-watch.service.ts`, `budget-review-query.service.ts:152-176`, `shared-pool-line.policy.spec.ts` (11 ca `it.each` + đẳng thức), `shared-pool-line-facts.service.spec.ts`, `test/integration/budgets/shared-pool-line-identity.integration-spec.ts`, `test/http/budgets/seat-month-charges.http-spec.ts`, `budget-summary.http-spec.ts`.
- W3-06 (nhãn (2)/(3), `earliestReducibleOn`, R-LATE Q-F tách `q_next`, trừ `vendorMinimumSeats` khỏi tử số tỷ lệ > 10 %, `IDLE_SEAT_COST_RATIO_HIGH` R1 ở `BudgetReviewReminderService`): `subscription-obligation.policy.ts:276-292`, `subscription-period.service.ts:151-244`, `subscription-period.repo.ts:25-52`, `licensing-seat-month.api.ts:39-75`, `shared-pool-line-label.policy.ts:88-175`, `shared-pool-line-alert.service.ts:25-86`, `budget-review-reminder.service.ts:35-100`, `notifications` 4 file (`IDLE_SEAT_COST_RATIO_HIGH`), `shared-pool-line-label.policy.spec.ts` (8 nhóm ca `it.each` + biên 10.00% vs 10.33%), `subscription-obligation-reducible.policy.spec.ts`, `shared-pool-line-alert.service.spec.ts`, `budget-review-reminder.service.spec.ts`.
- W3-01 (`unallocated` giữ tên đổi mô tả nghĩa shared-pool, không mã nội bộ ở `openapi.json`, 0 `NESTED_ARRAYS` mới): `seat-month.dto.ts:80-83`, `openapi.json`, `test:gates` 17/17 PASS.

### P6 (W3-05 số kỳ vọng hóa đơn `K2`, chênh lệch kho, ngưỡng mở `SBF-11a`)
- W3-05 kỳ vọng & ngưỡng (`SUBSCRIPTION` × 1/3/12, `REQUEST_TOP_UP` gom ngày `d` tròn 1 lần `cover(d, R-1)`, N4/N8/endDate+1, Q-E so `net` với `threshold`, biên 5.00% diệt `>=`, `NO_EXPECTED_AMOUNT`, K1/K4 bỏ qua): `purchase-invoice-pool-expectation.policy.ts:83-209`, `purchase-invoice-plan.service.ts`, `purchase-invoice-confirmation.service.ts:80-184`, `purchase-invoice-labels.policy.ts`, `purchase-invoice.dto.ts`, `purchase-invoice.mapper.ts:49-80`, `open-grant-task.repo.ts`, `licensing-open-grants.api.ts`, `purchase-invoice-pool-expectation.policy.spec.ts` (14 ca), `purchase-invoice-confirmation.service.spec.ts`.
- W3-05 `SBF-11a` gộp `mismatches`, đóng `EXCHANGE_RATE_LINE_PRICE_UPDATED` (0đ hợp lệ, chuyển `invoiceVariance` qua `markPoolVarianceResolved` `D-3`, báo `SUBSCRIPTION_PRICE_REVIEW` R1, gỡ `as` `D-4`): `invoice-discrepancy-closure.policy.ts`, `invoice-discrepancy-closure.service.ts:46-90`, `invoice-discrepancy-notifier.service.ts:19-62`, `invoice-discrepancy-opening.service.ts`, `invoice-discrepancy.dto.ts`, `invoice-discrepancy.mapper.ts:35-80`, `invoice.repo.ts`, `purchase-invoice-recorder.service.ts:63-89`, `budgets.api.ts`, `notifications` 4 file (`SUBSCRIPTION_PRICE_REVIEW`), `invoice-discrepancy-closure.service.spec.ts`, `test/http/requests/purchase-invoice-confirmation.http-spec.ts`, `test/integration/requests/purchase-invoice-pool-variance.integration-spec.ts`.

### P7 (W3-08 running uncommitted K2 trừ khỏi phần còn lại)
- W3-08 (`runningUncommitted` `K2` trừ vào phần còn lại ở kiểm tra ngân sách & `summary`/`mine`/`table`, `D-9`..`D-11`): `running-uncommitted.policy.ts` + `.spec.ts` (13 ca `it.each` + ca biên/diệt đột biến), `running-uncommitted-facts.service.ts` + `.spec.ts`, `running-uncommitted.repo.ts`, `LicensingSeatMonthApi.getSeatsInForceOn`, `BudgetsApi.yearFacts` + `BudgetsReadApi.yearFacts` (`BudgetsModule.onModuleInit`), `budget-check.policy.ts` + `.spec.ts` + `budget-check.service.ts`, `budget-view-numbers.service.ts`, `budget-view.mapper.ts`, `budget-table-view.service.ts`, `budget.dto.ts`, `test/http/budgets/budget-summary.http-spec.ts`, `openapi.json` (`runningUncommitted`), `FIX-TEST-biz.md` (ghi 4 test cũ).

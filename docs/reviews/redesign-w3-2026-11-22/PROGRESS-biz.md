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
| P1   | W3-01, W3-02 (ghi/đọc), W3-03 (thông báo) — M1 | xong | (commit P1) | rules:format/check PASS; prisma:validate/generate PASS; typecheck PASS; lint PASS; arch:check 0 viol; gates 17/17 (335 tests) PASS; unit 52/52 (1271 tests) PASS | +1 (`shared-pool-subscription-http.integration-spec.ts` Q-09) | Integration & HTTP test chưa chạy trên máy (CI cuối B1); `increasesObligation` xóa ở P10; `unallocated` đổi ở P5 |
| P3   | M2, M3, repo tháng cam kết, tham số            | chưa       |     |                     |               |                          |
| P2   | W3-02 (biz)                                    | chưa       |     |                     |               |                          |
| P4   | W3-07                                          | chưa       |     |                     |               |                          |
| P5   | W3-04, W3-06, W3-01 (`unallocated`)            | chưa       |     |                     |               |                          |
| P6   | W3-05                                          | chưa       |     |                     |               |                          |
| P7   | W3-08                                          | chưa       |     |                     |               |                          |
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

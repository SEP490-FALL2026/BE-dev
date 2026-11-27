# DELTA — Đóng đợt 3 (28/11/2026)

`int/redesign-w3` @ `77c092e4` so với `dev` (đợt 2 `70543271` + Redis #94, #96). Đợt 3 = SPEC/SPEC-B1/B2/B3 + các lượt sửa `FIX-B1` → `FIX-W3` →
`FIX-W3-FINAL` → `-2` → `-3` → `-4` → `-5` → [`FIX-W3-AUDIT`](FIX-W3-AUDIT.md) (audit toàn bộ: 5 Opus chỉ đọc + 1 đối kháng; sửa bằng 3 gói Sonnet song
song + D-1 + 3 vòng nối; mỗi vòng Opus review lại).

## 1. Kiểm cuối

- **CI tay `46034784496`** trên `77c092e4`: `quality`, `http-contract`, `e2e-smoke`, `integration-inband` (gồm `_serial/seed-check-runtime`) **xanh**.
  Integration 1–3: **637** test đỏ — so **từng test** với dev nền `45478093759`: **582 đỏ cùng tên trên dev** (nợ cũ), **55 test / 14 spec** chỉ
  đỏ ở đợt 3, **tất cả** thuộc danh sách fixture §4 [FIX-W3-FINAL-4](FIX-W3-FINAL-4.md) (fixture dùng bảng/kiểu cũ — `plan_workspace_*`, K1/K3, hai thuê
  bao trùng gói; luật vẫn hiệu lực) có dòng `FIX-TEST` ⟹ đợt 8: `application-retirement-http` 3, `contract-link-integrity` 4,
  `contract-usage-sources` 2, `department-tools-http` 7, `departure-vendor-admins` 3, `plan-key-binding` 2, `provisioning-grant-http` 1,
  `provisioning-revocation-open` 4, `provisioning-revocation-read-contracts` 2, `seat-baseline-contracts` 3, `seat-guards-http` 6,
  `shared-pool-subscription-http` 8, `subscription-owner-and-milestone-http` 3, `subscription-vendor-admins-http` 7. **0 test đỏ mới** so với run
  trước. Không có 500.
- Mọi spec mới của đợt 3 và của lượt audit xanh (seat-month 14/14, R-7, R-8, J-1…J-7, L-1, L-2, M-1…M-8, A/B/C, D-1, vòng 2–3).

## 2. Quyết định Owner trong lượt đóng (27/11)

| Mã  | Quyết định                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q-1 | Tạo lô K4 cho ứng dụng đã ngừng dùng ⟹ 422 `LICENSE_LOT.APPLICATION_RETIRED` (giữ luật cũ của `dev`)                                                               |
| Q-1 | Rà soát tính lại tháng đã có `seat_month_runs`: tính lại số seat/ngày, seat đã có dòng giữ giá đã ghi, seat mới theo giá hiện hành (ca D2 SPEC-B1: `MONTH_END` 0)  |
| Q-2 | Bàn giao IT: response + thông báo thêm số `workspaces`, `licenseLots`                                                                                              |
| Q-3 | Seed ghi mốc `seat_month_runs` (`markClosedSeatMonths`) giữ ở đợt 3; đợt 8 chuyển qua repo sở hữu + audit `DEMO_DATASET.*`, ghi ngoại lệ `operational-commands.md` |
| O-1 | Baseline ngân sách tách hàng theo (thuê bao, gói) — cả hàng phòng và hàng kho chưa phân bổ (mỗi hàng một giá)                                                      |
| O-2 | Gia hạn bị từ chối vì gói thuộc ứng dụng đã ngừng ⟹ 409 `SUBSCRIPTION_RENEWAL.PERIOD_REFUSED` `details { reason: 'APPLICATION_RETIRED', planId }`                  |

Ghi nhận thêm (không đổi luật): khi gia hạn, `plan_id` kỳ mới giữ gói kỳ cũ (trigger `subscriptions_renewal_same_line`), giá kỳ lấy theo dòng còn giữ
đầu tiên theo `created_at, id`; mọi dòng về 0 seat ⟹ dòng đầu đã khai.

## 3. Thay đổi contract cho FE (ngoài SPEC đợt 3 ban đầu)

- `GET /budget-cycles/{year}/baseline`: `departments[].software[]` và `sharedPoolUnallocated.software[]` — mỗi hàng là một (thuê bao, gói), thêm
  `planId`; `application`, `plan`, `seatsPurchased`, `monthlyUnitPrice`, `estimatedAnnualCost` theo gói của hàng; `softwareTotal` = số hàng (liệt kê tối
  đa 50).
- Khai thuê bao (`POST /subscriptions`): **bỏ** `responsibleItAdminEmployeeId` — gửi ⟹ 422 `VALIDATION_ERROR`; người phụ trách = người khai.
- Khai K2 giá tháng `0` ⟹ `DRAFT`, `missing` có `UNIT_PRICE` (như đường `lines[]`).
- Đổi `workspaceId` của kỳ nhiều dòng trùng gói sống ở workspace đích ⟹ 409 `DUPLICATE_PLAN` (trước: 500).
- `POST /license-lots`: thêm 409 `EMPLOYEE.NOT_STARTED` (đã có ở runtime, nay có trong OpenAPI); 422 `LICENSE_LOT.APPLICATION_RETIRED`.
- `PATCH /subscriptions/{id}` gửi giá cho kỳ đã có dòng ⟹ 409 `SUBSCRIPTION.PRICE_ON_LINES` (sửa qua `PATCH /subscription-lines/{id}`).
- Bàn giao IT (`it-handover`): thêm `workspaces`, `licenseLots`.
- Lỗi theo CHECK/trigger có tên (sổ seat `BELOW_OCCUPANCY`, dòng thuê bao, lô khóa, kích hoạt thiết bị, phiên bản ngân sách) nay ra đúng 409/422 đã
  khai thay vì 500 (D-1 — adapter Prisma 7 bỏ tên constraint; sửa ở `pg-pool.ts`).
- `ActivationRecord.subscriptionId` mang id **lô** (đã ghi ở DTO/OpenAPI).

## 4. Nợ sang đợt 8

Mục 5 [FIX-W3-AUDIT](FIX-W3-AUDIT.md) (code chết R5/R20, `today` theo UTC R7, seed Q-3, R11, R13, hai định nghĩa "recurring", cầu nối test
`legacy-perpetual-lot-bridge`, code chết budgets, `ceilDiv` ở `pricing.policy.ts`, tên mã lỗi lệch, drop `plan_workspace_*`) + 55 test fixture §1 +
dòng `FIX-TEST-biz.md`/`FIX-TEST-tech.md` (gồm test "báo tăng seat" gọi `tellSeatIncrease` trực tiếp — xóa cùng R5). Trần `OVER_APPROVED` khi
`subscriptionLineIds` không khớp dòng nào rơi về giá kỳ; dòng không có sổ lấy `purchasedQuantity` cả kỳ (hành vi có từ trước).

## 5. Kiểm trước deploy (Owner chạy trên DB demo — mỗi câu 0 dòng; migration tự `RAISE` nếu vi phạm, các câu này để biết trước)

Câu của M5 và A-6: [PROGRESS-biz.md](PROGRESS-biz.md) mục _Câu `SELECT` kiểm trước M5_. Thêm:

```sql
-- M1 20261201000000_w3_monthly_price
SELECT id FROM subscriptions WHERE kind = 'TERM' AND ((unit_price_currency IS NOT NULL AND unit_price_currency <> 'VND')
  OR (price_reporting_currency IS NOT NULL AND price_reporting_currency <> 'VND'));
SELECT id FROM subscriptions WHERE kind = 'TERM' AND status = 'ACTIVE' AND billing_cycle = 'OTHER';
SELECT id FROM subscriptions WHERE kind = 'TERM' AND status = 'ACTIVE' AND COALESCE(price_reporting_minor, unit_price_minor) IS NULL;
-- 20261204000100 / 20261204000500 (giá tháng của Request)
SELECT count(*) FROM access_requests WHERE pricing_status = 'PRICED' AND (price_kind IS NULL OR price_kind = 'RECURRING')
  AND (unit_price_minor IS NULL OR unit_price_minor < 0);
SELECT count(*) FROM access_requests WHERE state <> 'DRAFT' AND pricing_status = 'PRICED' AND price_kind = 'RECURRING'
  AND (unit_price_minor IS NULL OR unit_price_minor < 0 OR billing_cycle IS NULL OR billing_cycle NOT IN ('MONTHLY', 'QUARTERLY', 'ANNUAL'));
-- 20261204000400
SELECT count(*) FROM organizations WHERE time_zone IS NULL;
```

M4 (ứng dụng không vendor) và M6 (K4 `PERPETUAL`): câu kiểm nằm trong comment đầu `20261202000000_w3_workspaces/migration.sql` và khối `DO` đầu
`20261203000200_w3_license_lots/migration.sql` — chạy phần `SELECT` của chúng. Chỉ để biết: số thuê bao K1 bị đóng (M7) và dòng NOTICE "perpetual
purchases … became no lot" (M6).

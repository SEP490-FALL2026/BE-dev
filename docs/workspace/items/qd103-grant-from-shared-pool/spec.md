# Spec: qd103-grant-from-shared-pool — cấp từ kho dùng chung trước khi mua, chặn thuê bao trùng, giá theo thuê bao chính

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`, subagent soạn W4), đợt W4 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready` (qua cổng thiết kế W4, đã sửa theo audit). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-2.3`, `FR-3.23`, `BR-MF1-09`; `QĐ-103d`(2), `QĐ-103f`(2), `QĐ-103k`, `QĐ-103t`(3),
  `QĐ-103v`(3), `QĐ-104k`(3), `QĐ-106e`, `QĐ-108d`, `QĐ-89e` (hệ quả); QT v1.7 `C-13`, mục 1.9–1.11, C.2), BE `5fd5f594`. Ledger:
  L2-27, L2-28, L2-29, L4-19, L3-06 (vế chặn trùng + bỏ ràng buộc phòng; drop cột ở W5); finding F-012. Luật R-E02, R-E05, R-E06,
  R-H01 (vế _phòng người nhận từ ngày cấp_). Câu TẠM CHỌN: Q-04 = C; Q-35, Q-36 ([REVISION-NOTES](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md)).
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

IT Admin cấp quyền `K2`/`K4` từ **kho dùng chung** của (ứng dụng, gói) cho người ở **bất kỳ phòng nào**; chỉ được ghi _mua thêm_
khi kho hết seat _Trống_ cùng gói, mua khi chỉ còn seat đang trong thu hồi thì phải ghi lý do. Cấp từ kho cho Request ghi
**một lần** chỉ số _tránh được_. Request lấy giá của **thuê bao chính** của gói (không theo phòng). Sau giai đoạn khởi tạo,
thuê bao thứ hai cùng (ứng dụng, gói) `K2`/`K4` bị chặn. Cờ thuê bao chính chỉ nằm ở kỳ `ACTIVE` (F-012).

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W4), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: `catalog/subscription` (chặn trùng, giá, cờ chính), `licensing/assignment` + `licensing/provisioning`
  (cấp không theo phòng), capability mới `licensing/shared-pool` (đếm kho, mua thêm, _tránh được_ — L0, không controller, vì
  `provisioning` và `role-based` cùng dùng, `docs/rules/module-structure.md:66-67`), `licensing/seat-baseline` (cổng khởi tạo).
- Boundaries: 1 migration; 5 operation đổi hợp đồng; 1 extension point mới ở `catalog/public`; 1 tham số mới của
  `GrantRequestGate.reportOutcome` (thêm, không phá).
- Not larger: drop `owner_department_id`, bảng `subscription_owner_assignments`, CLI `assign-subscription-owner`, gỡ nguồn rà soát
  `POST_SETUP_REVIEW` ở W5 `qd103-remove-business-owner`; chi phí seat-tháng theo phòng người giữ ở W5 `qd103-seat-month-cost-pool-line`;
  khóa `K4` ở `qd103-k4-key-pool`; hóa đơn của lần mua ở `qd103-purchase-invoice-sbf19`.
- Not smaller: bỏ guard phòng, giá theo phòng và chặn trùng phải đổi **cùng lúc** (audit W1 DA1-05), nếu không MF-1 tắc.
- Siblings: `qd103-k4-key-pool`, `qd103-role-based-access` (cùng import `shared-pool`), `qd103-purchase-invoice-sbf19` (cột mua).
- Scope map: n/a

## Primary Story/AC

| Story | AC                                                  | Coverage | Phần còn lại thuộc                                                                     |
| ----- | --------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| —     | L2-27, L2-28, L2-29, L4-19, L3-06 (một phần), F-012 | n/a      | gỡ chặn `qd103-k4-key-pool`, `qd103-role-based-access`, `qd103-purchase-invoice-sbf19` |

## Supporting references

`US-07-13` AC-1→AC-4, AC-8 (vế _mua 2 seat cho Request 1 người ⟹ từ chối_), AC-6 (vế _tránh được_ `K4`); `US-07-01` AC-1, AC-2;
`US-04-14` AC-2, AC-3; `US-02-05` AC-19 (khởi tạo cho phép trùng); `US-12-04` (_tránh được_ là chỉ số, không cộng).

## Explicit out of scope

- Drop cột/bảng/CLI phòng sở hữu, bỏ cảnh báo `RESPONSIBLE_MISSING` cũ, gỡ listener `POST_SETUP_REVIEW` — W5. Gộp dữ liệu trùng của seed — W7.
- Gắn khóa `K4` khi hoàn tất, giải phóng cam kết `K4` cấp từ kho — `qd103-k4-key-pool` (hạng mục này chỉ cung cấp cờ `fromPool`).
- `K1` (không thuộc kho): giữ đường cấp hiện có; `K1_SUBSCRIPTION` đặt ở `qd103-purchase-invoice-sbf19`.
- Ân hạn 7 ngày của `MF-5` (W6): ở W4 _seat đang trong thu hồi_ = Assignment có tác vụ thu hồi đang mở (Q-36).

## Dependencies and blockers

W1 `qd103-shared-pool-subscription` (PASS: cột `is_primary_for_plan`, `commitment_term_months`). W3
`qd103-request-amount-and-term` (hợp đồng sẽ có: `priceOfPlan` trả `{ kind, unitPrice, billingCycle }`, `PERPETUAL` ⟹ `ONE_TIME`)
— hạng mục này chỉ đổi **cách chọn thuê bao**. **Không chờ W2**: không sửa `budgets`, `organization`, `operating-parameters`,
`notifications` (NOTES đã sửa cho khớp — DA4-23).

## Ownership: module, data, API

- Migration `<ts>_shared_pool_grant` (task đầu; enum mới bằng `CREATE TYPE` nên không cần migration `*_values`):
  - `subscriptions.owner_department_id` `DROP NOT NULL` (giữ cột tới W5; trigger `subscriptions_owner_immutable` giữ nguyên —
    `prisma/migrations/20261029100000_subscription_owner_required/migration.sql:74-88`).
  - `DROP TRIGGER license_assignments_owner_department_guard` + hàm (`…/20261029100000_subscription_owner_required/migration.sql:92-113`).
  - Thay hàm trigger chuỗi kỳ (`prisma/migrations/20261101000100_catalog_subscription_renewal_chain/migration.sql:44-50`): bỏ điều
    kiện cùng `owner_department_id`, giữ cùng org + plan + `TERM` + bắt đầu muộn hơn.
  - `provisioning_tasks` thêm `purchase_kind` enum `ProvisioningPurchaseKind {POOL_TOP_UP, KEY_PURCHASE, K1_SUBSCRIPTION}` NULL,
    `purchase_reason text NULL`, `purchased_at timestamptz NULL`; CHECK `(purchase_kind IS NULL) = (purchased_at IS NULL)`, CHECK
    `purchase_kind IS NULL OR kind = 'GRANT'` (`prisma/models/licensing.prisma:128-187`).
  - Bảng `pool_grant_avoided_costs`: `id`, `organization_id`, `provisioning_task_id` UNIQUE FK, `assignment_id` FK, `request_id uuid
NOT NULL`, `plan_id`, `provisioning_type` CHECK ∈ (`K2`,`K4`), `months smallint NULL` CHECK 1–12 (NULL ⟺ `K4`), `unit_minor ≥ 0`,
    `amount_minor` CHECK `= unit_minor × coalesce(months,1)`, `currency char(3)`, `recorded_on date`, `created_at`; trigger chặn UPDATE/DELETE.
- `catalog`: `subscription/subscription.service.ts` (`declareIn` :146-188, `complete` :195-203), `subscription/pool/` (policy + service chặn
  trùng — `catalog/subscription` đã đủ 25 file), `subscription-facts.service.ts` (`priceOfPlan` :17-36, `pricedCyclesOfPlans` :42),
  `subscription.repo.ts` (`findPricedOfPlan` :240-263), `subscription-period.service.ts` (:112-160, F-012), `subscription-obligation.service.ts:17-25`,
  `requestable-software/requestable-software.service.ts:117`, `public/catalog.api.ts` (`getPlanPrice` :102-104 bỏ tham số phòng; thêm
  `addPoolSeat`), `public/catalog.extension-points.ts` (thêm `SeatBaselinePhaseHook`).
- `licensing`:
  - `assignment/assignment.policy.ts` (bỏ `assertSubscriptionDepartment` :34-43, `holdersOfOtherDepartments` :52-75), `assignment/assignment.service.ts`
    (:114-140 bỏ `baselineHoldersOfOtherDepartments`, :158, :225-227), `assignment/assignment-conflicts.repo.ts:22`.
  - `seat-baseline/seat-baseline.service.ts:36-63` (đóng baseline phát `holders: []`, audit `holdersOfOtherDepartments: 0` — DA4-19),
    `seat-baseline/seat-baseline-phase.listener.ts` (mới, bind `SeatBaselinePhaseHook`).
  - Capability mới `shared-pool/`: `shared-pool.service.ts` (điểm vào: `capacityOf`, `purchase`, `recordAvoided`), `shared-pool.policy.ts`
    (+ spec, thuần: luật mua, số tháng _tránh được_), `shared-pool-capacity.repo.ts`, `shared-pool-avoided-cost.repo.ts`. Không import
    capability licensing nào (đọc bảng bằng SQL), chỉ `CatalogApi`; `provisioning` và `role-based` import nó (không vòng — R6).
  - `provisioning/provisioning.dto.ts` (`grantBodySchema` :16-24 thêm `purchase`), `provisioning.errors.ts`, `provisioning.http-errors.ts`,
    `tasks/provisioning-grant-planner.service.ts`, `tasks/provisioning-grant-writer.service.ts` (:44-128), `tasks/provisioning.service.ts`
    (`complete` :105-122), `public/licensing.extension-points.ts` (`reportOutcome` thêm `facts?`), `public/licensing.types.ts`.
- `data-import`: `seat-baseline-import/seat-baseline-rows.policy.ts:217-227` (bỏ lỗi dòng `SUBSCRIPTION_DEPARTMENT_MISMATCH`).
- `requests`: `access-request/request-facts.service.ts:247` (gọi `getPlanPrice(planId, tx)`), `grant/access-request-grant.listener.ts:66-93` (nhận `facts`).
- Operation đổi: `subscriptionCreate`, `subscriptionComplete` (409 mới, `warnings`), `subscriptionGet`, `subscriptionList` (`warnings`),
  `provisioningTaskGrant` (body `purchase`, 409/422 mới), `provisioningTaskGet`/`List` (trường `purchase`), `seatBaselineImportConfirm`/`Rows`
  (bỏ lỗi dòng). `requestablePlanList`/`Get`, `requestableApplicationList`/`Get`: không đổi hình dạng, đổi dữ liệu (giá không theo phòng).

## Behavior and design

1. **Chặn trùng** (`subscriptionCreate`, `subscriptionComplete`; R-E02, `QĐ-104k`(3)) — chỉ plan `K2`/`K4`: thuê bao **đang sống** khác
   chính nó của (org, plan) = `DRAFT`, hoặc `ACTIVE` chưa có kỳ kế tiếp (`renewedBy` null) và (`PERPETUAL` hoặc `end_date IS NULL` hoặc
   `end_date ≥ hôm nay` theo múi giờ tổ chức). Có ≥ 1: `SeatBaselinePhaseHook.isClosed(tx, org)` = false ⟹ cho ghi, `warnings: [{ code:
'SHOULD_MERGE', subscriptionIds }]`; = true ⟹ 409 `SUBSCRIPTION.DUPLICATE_PLAN` (`details.subscriptionIds`). Kỳ gia hạn không là trùng.
   **Khóa** (DA4-22): `declareIn` lấy `plans` `FOR UPDATE` **trước** (thay `plans.lockShared` :153, trước `lockDepartmentShared`) vì chưa có
   dòng thuê bao; `complete` giữ thứ tự hiện có — thuê bao `FOR UPDATE` → plan `FOR UPDATE` (nâng từ `lockShared` :201), như PATCH cờ
   chính. Hook do `licensing/seat-baseline` bind, đọc `seat_baseline_states` `FOR SHARE`; `isBound()` = false ⟹ coi như đã đóng (chặn).
   `subscriptionGet`/`List` gắn `SHOULD_MERGE` cho mọi thuê bao đang sống có bạn trùng, ở **mọi** giai đoạn.
2. **Giá Request** (Q-04 C): `getPlanPrice(planId, tx?)` chọn trong thuê bao `ACTIVE` đang sống có giá của gói: `is_primary_for_plan`;
   không có ⟹ giá tháng quy đổi **cao nhất** (hòa: `start_date` cũ hơn, rồi `id`). `pricedCyclesOfPlans(planIds)` cùng luật.
   `NO_PRICED_SUBSCRIPTION` chỉ khi cả gói không có thuê bao có giá. Đổi lại = hàm `pickPriceSource` ở `subscription/pool/`.
3. **F-012**: `recordNext` chỉ chép `isPrimaryForPlan` khi kỳ mới ghi ở `ACTIVE`; kỳ mới `DRAFT` ⟹ cờ ở kỳ cũ; `subscriptionComplete`
   của kỳ gia hạn `DRAFT` chuyển cờ từ kỳ trước trong cùng transaction (mẫu `makePrimary` `pool/subscription-pool.service.ts:112-120`).
4. **Bỏ ràng buộc phòng** (L2-27, L4-19, L3-06): cấp và seat ban đầu không kiểm phòng sở hữu; Assignment `PERSONAL` ghi
   `owning_department_id` = **phòng người nhận** lúc cấp (`assignment.service.ts:227`); `SERVICE` giữ như cũ. Xóa câu _"no pool of seats
   between departments"_ (:205). Đóng seat baseline không còn tìm "người giữ seat thuê bao phòng khác" ⟹ phát `holders: []`, `personnel`
   không mở rà soát `POST_SETUP_REVIEW` (`QĐ-89e` hết đối tượng khi kho dùng chung — DA4-19). **Cổng Cost Center khi tăng nghĩa vụ**
   (`subscription-obligation.service.ts:17-25`, DA4-21): thuê bao `K2`/`K4` **bỏ** cổng phòng sở hữu ở mọi đường tăng (`addPoolSeat`, PATCH
   số lượng/giá) — chi phí theo seat-tháng của phòng người nhận, Request đã qua kiểm tra ngân sách của phòng đó (`QĐ-103d`(2)); `K1`/`K5`
   có phòng giữ cổng, không phòng ⟹ bỏ qua. `ownerDepartmentId` của create thành tùy chọn (deprecated, W5 bỏ); `SUBSCRIPTION_DEPARTMENT_MISMATCH`
   không còn được ném (giữ trong enum tới W5).
5. **Mua thêm** (`provisioningTaskGrant`, R-E05, `FR-3.23`): body `purchase?: { reason?: string (1–500) }`; chỉ `K2`, `K4` (khác ⟹ 422
   `PROVISIONING.PURCHASE_NOT_APPLICABLE`). Sau các khóa hiện có (request → subscription `FOR UPDATE` → plan `FOR SHARE` → người),
   `SharedPoolService.capacityOf(tx, planId, today)`: `free` = Σ trên **thuê bao cấp được** của plan — `ACTIVE`, chưa có kỳ kế tiếp, còn hiệu
   lực hôm nay; **không** gồm `DRAFT` (seat của bản nháp không cấp được — `baseline-target.policy.ts:41-44`, DA4-20) — của (`purchased_quantity`
   − Assignment mở hôm nay, gồm tác vụ cấp đang chờ/lỗi — `US-07-01` AC-5); `inRevocation` = Assignment mở có tác vụ thu hồi chưa đóng (Q-36):
   - có `purchase` và `free > 0` ⟹ 409 `PROVISIONING.PURCHASE_NOT_ALLOWED` (`details.freeSeats`, `details.subscriptionIds` còn Trống);
     audit `PROVISIONING_TASK.PURCHASE_REFUSED` ghi ở transaction riêng sau rollback (AC-2 _ghi lần từ chối và số seat Trống_);
   - có `purchase`, `free = 0`, `inRevocation > 0`, thiếu `reason` ⟹ 422 `PROVISIONING.PURCHASE_REASON_REQUIRED`;
   - có `purchase`, `free = 0` ⟹ `CatalogApi.addPoolSeat(tx, subscriptionId)` (+1 `purchased_quantity`, thuê bao `ACTIVE`, gói năm tăng
     giữa kỳ được) rồi ghi Assignment; task `purchase_kind` = `POOL_TOP_UP` (`K2`) / `KEY_PURCHASE` (`K4`), `purchased_at = now`;
   - không `purchase`, thuê bao đã chọn hết chỗ ⟹ 409 `ASSIGNMENT.SEAT_CAPACITY` như cũ (`details.freeSeatsInPool` thêm).
     Mỗi tác vụ cấp là **một** người thụ hưởng ⟹ mua tối đa 1 seat/lần (AC-8). Đếm `free` không khóa các thuê bao khác của gói (giữ thứ tự khóa).
6. **Tránh được** (R-E06, `QĐ-106e`, `QĐ-108d`): `provisioningTaskComplete` hoàn tất tác vụ `GRANT` có `requestId`, plan `K2`/`K4`,
   `purchase_kind IS NULL` ⟹ `SharedPoolService.recordAvoided` ghi một dòng: `K2` `months = 13 − tháng(ngày hoàn tất)`, `unit` = giá tháng
   quy đổi của thuê bao cấp (`ANNUAL` ÷ 12, làm tròn lên minor); `K4` `unit` = giá mua của thuê bao `PERPETUAL`, `months NULL`. UNIQUE
   theo tác vụ ⟹ idempotent. Không đổi cam kết/ngân sách. Request tiếp tục và quyền theo vai không ghi (Q-35).
7. **Báo kết quả cấp**: `reportOutcome(tx, requestId, outcome, employeeId?, facts?: { fromPool: boolean; provisioningType })` — tham số
   thêm; `requests` lưu vào audit `ACCESS_REQUEST.GRANT_COMPLETED.after.fromPool`.
8. **Dữ liệu cũ**: Assignment cũ giữ `owning_department_id` cũ; thuê bao trùng đã có giữ nguyên (cảnh báo `SHOULD_MERGE`); không backfill
   `pool_grant_avoided_costs`. Seed `shared-demo-v3` không đóng seat baseline ⟹ 3 Figma/2 Jira vẫn nạp kèm cảnh báo; seed vẫn gửi `ownerDepartmentId`.

## Test matrix

| AC / rủi ro        | Tình huống (gồm từ chối, edge case)                                                                                                                                | Cấp test              | Kết quả mong đợi                                                           | Bằng chứng sau implement |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | -------------------------------------------------------------------------- | ------------------------ |
| R-E02 khởi tạo     | baseline chưa đóng, tạo thuê bao `K2` thứ hai cùng gói                                                                                                             | http                  | 201 + `SHOULD_MERGE`                                                       |                          |
| R-E02 vận hành     | baseline đã đóng: thứ hai `K2`; thứ hai `K4`; đã có bản `DRAFT`; `complete` một `DRAFT` trùng                                                                      | http                  | 409 `DUPLICATE_PLAN` mọi ô                                                 |                          |
| R-E02 phủ định     | `K1` thứ hai cùng gói; thuê bao cũ hết kỳ; thuê bao cũ đã có kỳ kế tiếp; ghi kỳ gia hạn                                                                            | http + integration    | 201 không cảnh báo / 201 / 201 / kỳ mới ghi được                           |                          |
| `SHOULD_MERGE` đọc | `subscriptionGet`/`List` thuê bao trùng trước và sau khi đóng baseline                                                                                             | http                  | cờ có ở cả hai giai đoạn                                                   |                          |
| khóa               | hai `subscriptionCreate` song song sau khi đóng baseline; `create` song song `complete` cùng gói; song song đóng baseline                                          | integration           | một 201 một 409; không `40P01`; kết quả theo thứ tự khóa                   |                          |
| hook               | `SeatBaselinePhaseHook` chưa bind                                                                                                                                  | unit                  | coi như đã đóng                                                            |                          |
| Q-04 C             | gói có thuê bao chính 200 + thuê bao 220; không có chính (200, 220); chỉ thuê bao không giá                                                                        | integration           | 200 / 220 / `NO_PRICED_SUBSCRIPTION`                                       |                          |
| L2-27              | `E8` (`P-FIN`) xin Figma khi chỉ `P-DES` có thuê bao: `requestablePlanList`, gửi Request                                                                           | http + integration    | có giá; gửi được                                                           |                          |
| L2-27 / AC-1       | cấp seat Trống của thuê bao (từng là của `P-DES`) cho `E8`                                                                                                         | integration           | 201; `owning_department_id = P-FIN`; không mua                             |                          |
| L3-06              | import seat ban đầu: người phòng khác phòng sở hữu                                                                                                                 | integration           | dòng hợp lệ (không còn `SUBSCRIPTION_DEPARTMENT_MISMATCH`)                 |                          |
| `QĐ-89e` (DA4-19)  | đóng baseline khi có seat của người phòng khác phòng sở hữu                                                                                                        | integration           | không mở rà soát `POST_SETUP_REVIEW`; audit `holdersOfOtherDepartments: 0` |                          |
| AC-2               | `purchase` khi kho còn 2 seat Trống (cùng thuê bao; ở thuê bao trùng khác)                                                                                         | http                  | 409 `PURCHASE_NOT_ALLOWED` `freeSeats=2`; audit từ chối; số seat giữ       |                          |
| `DRAFT` (DA4-20)   | kho hết ở thuê bao `ACTIVE`, bản `DRAFT` trùng còn 3 chỗ: `purchase`                                                                                               | integration           | 201 mua được (bản nháp không tính Trống)                                   |                          |
| AC-3 / Q-36        | kho hết, 1 seat có tác vụ thu hồi mở: `purchase` thiếu lý do; có lý do                                                                                             | http                  | 422 `PURCHASE_REASON_REQUIRED` / 201, `purchased_quantity` +1              |                          |
| AC-4               | 4 seat Trống gói Professional, gói Organization hết, `purchase` Organization                                                                                       | integration           | 201 (Trống khác gói không chặn)                                            |                          |
| AC-8               | kho hết, `purchase` không lý do, không seat thu hồi                                                                                                                | integration           | 201, task `POOL_TOP_UP`, `purchased_at`                                    |                          |
| cổng CC (DA4-21)   | `addPoolSeat` cho Request của `P-FIN` trên thuê bao `K2` từng của `P-DES` chưa có Cost Center; PATCH tăng số seat thuê bao `K2` không phòng; `K1` có phòng chưa CC | integration           | 201 / 200 / 409 `FINANCE.SETUP_INCOMPLETE`                                 |                          |
| R-E05 phủ định     | `purchase` cho `K5`; không `purchase` khi kho hết                                                                                                                  | http                  | 422 `PURCHASE_NOT_APPLICABLE` / 409 `SEAT_CAPACITY` + `freeSeatsInPool`    |                          |
| đua                | hai grant song song, thuê bao còn 1 seat (AC-2 `US-07-01`)                                                                                                         | integration           | một 201, một 409 `SEAT_CAPACITY`                                           |                          |
| R-E06 `K2`         | cấp từ kho, hoàn tất 14/07, giá tháng quy đổi 15                                                                                                                   | integration           | một dòng `months=6`, `amount=90`; cam kết không đổi                        |                          |
| R-E06 phủ định     | hoàn tất tác vụ có mua; `complete` lần hai; quyền theo vai; Request tiếp tục                                                                                       | integration           | không dòng mới                                                             |                          |
| R-E06 `K4`         | hoàn tất cấp `K4` từ kho, giá mua 250                                                                                                                              | integration           | dòng `K4`, `months NULL`, `amount=250` (cùng test `k4-key-pool`)           |                          |
| F-012              | ghi kết quả gia hạn tạo kỳ `DRAFT` cho thuê bao chính; rồi `complete` kỳ đó                                                                                        | integration           | cờ ở kỳ cũ / cờ sang kỳ mới, kỳ cũ thôi                                    |                          |
| facts              | `reportOutcome` có/không `facts`                                                                                                                                   | unit listener         | audit có `fromPool` / như cũ                                               |                          |
| migration          | DB có trigger guard + chuỗi kỳ khác phòng; thuê bao `owner` null                                                                                                   | integration migration | guard mất, chuỗi khác phòng ghi được, CHECK `purchase_*`                   |                          |
| hồi quy + seed     | test grant/baseline/subscription hiện có (plan Task 5); `ops:seed` DB sạch và chạy lại                                                                             | integration           | xanh; seed nạp, có `SHOULD_MERGE`                                          |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI đổi đúng 5 nhóm operation ở _Ownership_ (lỗi mới có ví dụ); README `catalog` (chặn trùng, hook, giá chính,
      thứ tự khóa `declareIn`/`complete`), `licensing` (capability `shared-pool`, cấp không theo phòng, _tránh được_) cập nhật.
- [ ] `pnpm arch:capabilities --module licensing` không vòng; `shared-pool` ở L0.
- [ ] Test cũ dựa trên _seat cùng phòng_ được viết lại theo luật mới (không xóa ca, đổi kết quả mong đợi, ghi lý do trong plan).
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W4 (subagent soạn). Chưa qua cổng audit thiết kế. Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W4 (`design-audit-w4.md`): DA4-19, DA4-20, DA4-21, DA4-22, DA4-23 sửa; nhận phần DA4-04 (capability
  `shared-pool`). Không finding nào bị bác. Chi tiết ở plan _Design review_ và [REVISION-NOTES](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md). Chưa nghiệm thu.

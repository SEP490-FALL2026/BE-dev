# Spec: qd103-shared-pool-subscription — thuê bao dùng chung, phần _expand_: kỳ cam kết, IT Admin phụ trách, mức tối thiểu NCC, thuê bao chính

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`), đợt W1 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready`. Owner review: chưa review (chế độ tự chạy). Audit thiết kế (subagent) 08/11/2026: CẦN SỬA ⟹ đã sửa,
  xem _Changes and acceptance_.
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-1.3`, `FR-1.12`(1)(2); `QĐ-103d`(2), `QĐ-103e`, `QĐ-103v`(4), `QĐ-104d`(3), `QĐ-104l`;
  quy trình v1.7 C.2), BE `b9854ef5`. Ledger: L3-05 (vế trường thuê bao); luật R-E01, R-E03, R-G01. Câu TẠM CHỌN: Q-04 (C —
  thuê bao chính), Q-09 (A, làm rõ ở _Behavior_ 3).
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

IT Admin khai báo/sửa thuê bao với **kỳ cam kết** (1 hoặc 12 tháng), **IT Admin phụ trách**, tùy chọn **mức tối thiểu của nhà
cung cấp**, và đặt **thuê bao chính của gói**; ghi mới chỉ nhận chu kỳ trả `MONTHLY`/`ANNUAL`; kỳ gia hạn kế tiếp kế thừa các
trường này. Đây chỉ là phần _expand_: sở hữu theo phòng, ràng buộc _seat cùng phòng_ và việc **chặn trùng (ứng dụng, gói)** đổi
cùng nhau ở W4 `qd103-grant-from-shared-pool`, để MF-1 không tắc giữa các đợt.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W1), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: dữ liệu thuê bao của capability `catalog/subscription`; luồng dùng (cấp từ kho, điểm điều chỉnh, seat-tháng)
  ở hạng mục phía sau.
- Boundaries: một migration `subscriptions` (thêm cột, không đổi enum dùng chung); DTO ghi/đọc của 5 operation `subscription*`;
  `subscription-period.service.ts` kế thừa trường; không đổi `license_assignments`, trigger, `requests`.
- Not larger: bỏ phòng sở hữu + bỏ _seat cùng phòng_ + **chặn trùng** + giá theo thuê bao chính ở W4; bỏ `allowsMidTermReduction`,
  `nextBillingDate`, điểm điều chỉnh, drop cột phòng sở hữu ở W5; bỏ Business Owner ở W5.
- Not smaller: các trường mới cùng một bảng, một migration, một DTO.
- Siblings: `qd103-calendar-fiscal-year` (làm trước — cùng chạm `requests/access-request/pricing.policy.ts`).
- Scope map: n/a

## Primary Story/AC

| Story | AC    | Coverage | Phần còn lại thuộc                                                                                               |
| ----- | ----- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| —     | L3-05 | n/a      | gỡ chặn `qd103-grant-from-shared-pool`, `qd103-subscription-adjustment-point`, `qd103-seat-month-cost-pool-line` |

## Supporting references

`US-04-14` AC-10; `US-11-08` AC-26. `QĐ-103v`(4): mỗi thuê bao dùng chung một IT Admin phụ trách, gán khi khai báo.
`QĐ-104d`(3): kỳ cam kết và chu kỳ trả là hai thuộc tính riêng; gói năm trả theo tháng được phép.

## Explicit out of scope

- **Chặn trùng (ứng dụng, gói)** (L3-06, `QĐ-104k`(3)) — W4 `qd103-grant-from-shared-pool`, cùng lúc bỏ sở hữu theo phòng.
  Các điểm audit thiết kế W1 cho phần này chuyển sang W4: chỉ áp `K2`/`K4` (không `K1`), ranh giới khởi tạo theo **giai đoạn**
  (`SeatBaselineState.closedAt`, `US-02-05` AC-19) chứ không theo đường vào (seed tạo thuê bao qua HTTP), định nghĩa _đang
  sống_ loại thuê bao đã hủy/hết kỳ, khóa plan `FOR UPDATE` thay `lockShared`.
- `nextBillingDate` (ngày thanh toán kế tiếp, cần cho nhắc kỳ gói năm trả theo tháng) — W5 `qd103-subscription-alerts-incidents`.
- Đổi enum `BillingCycle` dùng chung với `requests` (`access_requests.billing_cycle`, `quote_billing_cycle`) — **không** đổi.
- Gộp dữ liệu trùng của seed — W7.

## Dependencies and blockers

Sau `qd103-calendar-fiscal-year` (cùng W1).

## Ownership: module, data, API

- Bảng `subscriptions` (migration `<ts>_shared_pool_subscription_fields`):
  - `commitment_term_months smallint NULL CHECK (commitment_term_months IN (1, 12))`; CHECK `kind = 'PERPETUAL' ⟹ NULL`.
    Backfill `TERM`: `billing_cycle = MONTHLY` ⟹ 1, còn lại ⟹ 12; plan `K1` ⟹ 1. **Không** thêm CHECK _NOT NULL khi ACTIVE_
    (bắt buộc ở tầng ứng dụng khi ghi mới) để dữ liệu cũ và kỳ gia hạn không vỡ.
  - `responsible_it_admin_employee_id uuid NULL REFERENCES employees(id)`.
  - `vendor_minimum_seats integer NULL CHECK (vendor_minimum_seats > 0)`.
  - `is_primary_for_plan boolean NOT NULL DEFAULT false` + unique partial index `(organization_id, plan_id) WHERE
is_primary_for_plan`.
- `catalog/subscription/*`: DTO (`declare`, `update`, response), policy, service, repo, mapper, view;
  `subscription-period.service.ts` (kỳ kế tiếp kế thừa `commitmentTermMonths`, `responsibleItAdminEmployeeId`,
  `vendorMinimumSeats`, chuyển cờ `isPrimaryForPlan` sang kỳ mới trong cùng transaction).
- Kiểm người phụ trách: `IdentityAccessApi.findUsableItAdminEmployeeIds` (giữ vai `IT_ADMIN`, tài khoản dùng được) +
  `OrganizationReadApi` (đang làm việc). Đọc không khóa — chấp nhận race thu vai (ghi ở README `catalog`).
- Operation đổi: `subscriptionCreate`, `subscriptionUpdate`, `subscriptionComplete` (request + response), `subscriptionGet`,
  `subscriptionList` (response).

## Behavior and design

1. **Ghi mới** (`subscriptionCreate`, `subscriptionComplete`, và `subscriptionUpdate` khi đổi các trường dưới):
   - `TERM` khi thành `ACTIVE` cần `commitmentTermMonths ∈ {1, 12}` ⟹ thiếu: 422 `SUBSCRIPTION.COMMITMENT_TERM_REQUIRED`;
     `PERPETUAL` gửi kỳ cam kết ⟹ 422 `SUBSCRIPTION.COMMITMENT_TERM_NOT_ALLOWED`.
   - Plan `K1` ⟹ kỳ 1 và chu kỳ `MONTHLY`, ngược lại 422 `SUBSCRIPTION.K1_MONTHLY_ONLY` (R-E01).
   - Kỳ 1 tháng mà chu kỳ `ANNUAL` ⟹ 422 `SUBSCRIPTION.BILLING_LONGER_THAN_COMMITMENT`; kỳ 12 + `MONTHLY` hợp lệ (R-G01).
   - `responsibleItAdminEmployeeId` bắt buộc khi thành `ACTIVE` (create `ACTIVE` hoặc `complete`) — thiếu: 422
     `SUBSCRIPTION.RESPONSIBLE_REQUIRED`; người không giữ `IT_ADMIN` dùng được hoặc đã nghỉ: 422
     `SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN`.
   - `vendorMinimumSeats` > 0 (422 khi ≤ 0); lớn hơn `purchasedQuantity` vẫn hợp lệ (dùng ở W5).
2. **Dữ liệu cũ** `ACTIVE` chưa có IT Admin phụ trách: đọc được (`null`), `subscriptionUpdate` đổi trường khác vẫn được;
   response có cảnh báo `RESPONSIBLE_MISSING` trong `warnings` (cùng cơ chế `NO_ALERT_ANCHOR`).
3. **Chu kỳ trả** (Q-09 A, làm rõ sau audit): **ghi mới** chỉ nhận `MONTHLY`, `ANNUAL` (422 `SUBSCRIPTION.BILLING_CYCLE_UNSUPPORTED`
   cho `QUARTERLY`/`OTHER`). Dữ liệu cũ `QUARTERLY`/`OTHER` **không** chuyển tự động (đơn giá tính theo chu kỳ — đổi nhãn làm sai
   giá); response gắn cảnh báo `BILLING_CYCLE_LEGACY` để IT sửa tay. Enum DB giữ nguyên (dùng chung với `requests`).
4. **Thuê bao chính** (Q-04 C): `isPrimaryForPlan` đặt qua `subscriptionUpdate`; transaction khóa dòng `plans` `FOR UPDATE`, gỡ
   cờ ở thuê bao khác cùng gói rồi đặt; chỉ đặt được trên thuê bao `ACTIVE` chưa có kỳ kế tiếp (422 khác); vi phạm unique
   (đua) ⟹ 409 `SUBSCRIPTION.PRIMARY_CONFLICT`, không 500. Kỳ gia hạn kế tiếp nhận cờ, kỳ cũ thôi cờ.
5. **Kỳ gia hạn** (`subscription-period.service.ts`): kỳ mới copy bốn trường ở trên — luồng ghi kết quả gia hạn hiện có không đổi
   hành vi khác.
6. Tương thích: request thêm trường tùy chọn (bắt buộc chỉ theo quy tắc 1); response thêm trường + cảnh báo. Không breaking ở
   enum.

## Test matrix

| AC / rủi ro          | Tình huống (gồm từ chối, edge case)                                                       | Cấp test                                                                                                | Kết quả mong đợi                                     | Bằng chứng sau implement |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------ |
| R-G01                | `TERM` thành `ACTIVE` thiếu kỳ; kỳ 1 + `ANNUAL`; kỳ 12 + `MONTHLY`; `PERPETUAL` có kỳ     | unit policy + http                                                                                      | 422 / 422 / 201 / 422                                |                          |
| R-E01                | plan `K1` kỳ 12; plan `K1` chu kỳ `ANNUAL`; plan `K1` kỳ 1 `MONTHLY`                      | unit policy                                                                                             | 422 / 422 / hợp lệ                                   |                          |
| R-E03                | `complete` thiếu IT Admin phụ trách; người không giữ `IT_ADMIN`; đã nghỉ; IT Admin hợp lệ | http                                                                                                    | 422 / 422 / 422 / 200                                |                          |
| R-E03                | `subscriptionUpdate` thuê bao cũ chưa có người phụ trách, đổi số lượng                    | http                                                                                                    | 200 + cảnh báo `RESPONSIBLE_MISSING`                 |                          |
| Q-09                 | ghi mới `QUARTERLY`; đọc thuê bao cũ `QUARTERLY`                                          | http                                                                                                    | 422 / 200 + `BILLING_CYCLE_LEGACY`                   |                          |
| Q-04                 | đặt chính ở B khi A đang chính; đặt song song A và B; đặt trên kỳ đã gia hạn              | integration                                                                                             | A thôi, B chính / một thành công, một 409 / 422      |                          |
| kỳ gia hạn           | ghi kết quả gia hạn tạo kỳ mới                                                            | integration `subscription-renewal-outcome`                                                              | kỳ mới có đủ 4 trường, cờ chính chuyển               |                          |
| `vendorMinimumSeats` | 0; 5 khi mua 3                                                                            | http                                                                                                    | 422 / 201                                            |                          |
| migration            | DB có `TERM` `MONTHLY`/`ANNUAL`/`QUARTERLY`, `PERPETUAL`, plan `K1`                       | integration migration (mẫu `test/integration/catalog/document-final-key-migration.integration-spec.ts`) | kỳ 1/12/12, `PERPETUAL` NULL, `K1` 1; enum không đổi |                          |
| hồi quy              | test thuê bao/gia hạn/seed hiện có                                                        | integration/http hiện có + `src/cli/seed`                                                               | xanh (fixture thêm trường bắt buộc khi `ACTIVE`)     |                          |

## Definition of Done

- [ ] Test matrix xanh; fixture seed v3 nạp được (thêm kỳ cam kết, IT Admin phụ trách); không đổi enum `BillingCycle`.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `openapi:export` drift chỉ ở 5 operation `subscription*`.
- [ ] `pnpm check` và full suite **chưa chạy** (Owner chạy).

## Changes and acceptance

- 08/11/2026: tạo ở W1.
- 08/11/2026 (sau audit thiết kế subagent, `scratchpad/design-audit-w1.md` của chat review — tóm tắt ở plan _Design review_):
  DA1-01, DA1-02, DA1-05, DA1-06, DA1-08 (phần khóa chặn trùng), DA1-09 ⟹ chặn trùng chuyển W4; DA1-03, DA1-07 ⟹ không đổi
  enum, không backfill chu kỳ; DA1-04 ⟹ kỳ gia hạn kế thừa trường; DA1-08 ⟹ khóa + 409 cho cờ chính; DA1-10 ⟹
  `nextBillingDate` sang W5; DA1-11, DA1-12 ⟹ test matrix và lệnh Verify; DA1-13 ⟹ tên API. Chưa nghiệm thu.
- 08/11/2026 (chat code): implement xong, `verified-local` — bằng chứng và các điểm lệch ở [plan](plan.md). Chưa nghiệm thu.

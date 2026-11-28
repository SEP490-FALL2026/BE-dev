# FIX-W3-FINAL-5 — Lượt đóng đợt 3, vòng 2 (27/11/2026)

Nguồn: review sau [FIX-W3-FINAL-4.md](FIX-W3-FINAL-4.md) trên `int/redesign-w3` @ `c257d6c7` (CI `45974586113`) và commit tiếp
`5144ada2` (CI `45979264910`, đang chạy lúc viết) — 2 Opus (kiểm code J/R; phân loại **từng test** so với dev `45478093759`) + 1 Opus
đối kháng kiểm lại từng finding.

**Đạt:** không có luật tiền/quyền mới ngoài SPEC trong code app; C-1 trả `runningUncommitted` về đúng W3-08; migration T-5 chỉ thêm
nhánh `REVOKE COMPLETED`; J-2 (code), J-3, J-4, J-5, J-7, R-4, R-5, R-6, R-8 (8/8 xanh, kể cả ca đồng thời), R-9; `invoice-discrepancy`,
`purchase-invoice`, `requester-became-head-edges` xanh; không còn 500. **Còn:** 1 hồi quy (R-1), 5 spec R-7/J-2 còn đỏ hoặc mất nghĩa, 2
test chưa kiểm đúng guard (R-2, R-3), seed đổi công thức ngoài C-1, tracker.

Mục 0 của [FIX-W3-FINAL.md](FIX-W3-FINAL.md) và luật bổ sung của FIX-W3-FINAL-2, -3, -4 áp nguyên văn. **Thêm:**

- **Chạy từng spec sửa trong lượt trên DB thật trước khi push** (`pnpm test:integration -- <file>` với Postgres local/compose). Không ghi
  "để CI chạy" cho spec mình vừa sửa — `seat-month` lượt trước đỏ 14/14 vì chưa chạy lần nào.
- Fixture **không được dựng trạng thái DB đã cấm** (CHECK/trigger). Nếu luật đợt 3 làm trạng thái đó không còn xảy ra ⟹ xóa ca, ghi căn
  cứ (SPEC + migration/CHECK) vào PROGRESS; không "bỏ bớt một cột" cho lọt CHECK rồi giữ tên ca cũ.
- Không xóa assert để test xanh (như `5144ada2` xóa nhánh tạo lô của R-1) — luật còn hiệu lực thì sửa code.

## 1. Quyết định Owner 27/11

| Mã  | Quyết định                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-1 | **Giữ luật cũ:** tạo lô K4 (`POST /license-lots`) cho ứng dụng đã ngừng dùng ⟹ **422 `LICENSE_LOT.APPLICATION_RETIRED`**. Trên `dev` việc mua K4 bị chặn bằng `SUBSCRIPTION.APPLICATION_RETIRED` (`subscription.service.ts:194`); đợt 3 chuyển mua K4 sang lô (SPEC-B3:809) và `license-lot-create.service.ts` mất guard ⟹ hồi quy |

## 2. Sửa code

| Mã  | Sửa                                                                                                                                                                                                                  | Test bắt buộc                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L-1 | Q-1: guard ứng dụng ngừng dùng trong `license-lot-create.service.ts` (đọc trạng thái ứng dụng **trong cùng giao dịch, khóa dòng ứng dụng** như guard nhập khóa `license-lot-key-import.service.ts:195`); mã mới + http-errors + ví dụ OpenAPI + route-codes catalog | Khôi phục nhánh tạo lô của R-1 trong `license-key-import-plan-race` (bị xóa ở `5144ada2`) ⟹ 422 mã mới; thêm ca race: retire ‖ tạo lô, cả hai qua route/service thật ⟹ đúng một kết quả nhất quán |
| L-2 | Seed `budget-targets.ts:109-135`: C-1 chỉ yêu cầu chỉnh **ngày giữ seat**. Công thức số dự kiến của seed phải khớp W3-08: bỏ các tháng ≤ tháng đã chốt (`seat_month_runs`, bước `demo.budget-reviews` chốt tháng 1…last); sửa comment dòng 41 ("from today") | Unit: seat giữ từ tháng 1, đã chốt tháng 1–10 ⟹ chỉ tính 2 tháng; 5 spec seed vẫn xanh                                                                                                       |

## 3. Test phải sửa trong đợt

| Mã  | Spec                                  | Việc                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-1 | `seat-month` (14 ca)                  | Trigger `seat_changes_append_only` chặn `UPDATE seat_changes`. `5144ada2` bỏ UPDATE nhưng giữ ngày mở sổ mặc định `2026-01-05` của harness trong khi ca giữ seat từ `${year}-01-01` ⟹ số tháng lệch. Sửa đúng: harness `subscription()` nhận tùy chọn `startDate` + giá tháng; ca khai thuê bao từ `${year}-01-01` giá 400.000 (ca 07/01: 300.000) ngay lúc tạo; **không** UPDATE `subscription_lines`/`seat_changes`, không ghi dòng sổ bù. 14/14 xanh, giữ nguyên số kỳ vọng |
| M-2 | `subscription-foreign-price`          | Thuê bao ACTIVE TERM không giá tháng / giá ngoại tệ chưa quy đổi **không còn xảy ra** (M1 dừng migration — SPEC-B1:61-68; CHECK `subscriptions_active_term_monthly_price`; ghi mới qua `assertPriceInDong`). `5144ada2` giữ USD nhưng để giá tháng ⟹ ca mất nghĩa. **Xóa** #1/#2 có căn cứ trên. **Tách ca J-2 thành `it` riêng, không dùng USD:** kỳ có dòng (`h.subscription(10,'K2')`) PATCH giá ⟹ 409 `SUBSCRIPTION.PRICE_ON_LINES`; kỳ chưa có dòng (`h.draftSubscription('K2')`) PATCH giá ⟹ 200 và giá gói/Request đổi |
| M-3 | `year-start-commitments` QĐ-111an     | Cùng căn cứ M-2 ⟹ xóa ca USD, ghi PROGRESS (ca `NO_PRICE` gói nháp ~dòng 287 vẫn giữ phủ)                                                                                                                                                                                                                                                                               |
| M-4 | `budget-cycle-baseline` F-074         | Chu kỳ chỉ còn `MONTHLY`/`ANNUAL` (SPEC-B1:86), baseline chỉ đọc kỳ ACTIVE ⟹ `OTHER` không còn ⟹ xóa có căn cứ (`5144ada2` vẫn UPDATE `billing_cycle='OTHER'` — trạng thái đã cấm)                                                                                                                                                                                        |
| M-5 | `commitment-release-by-day` (2 ca)    | `5144ada2` spy `h.today` cùng ngày giả — chấp nhận; xác nhận 2 ca xanh trên DB local trước khi push                                                                                                                                                                                                                                                                  |
| M-6 | R-3 `subscription-quantity-change-http` | Route đã sửa sang `/purchases` nhưng thân gửi `kind/quantity/...` trong khi DTO strict bắt buộc `items[]` (`seat-purchase.dto.ts:24-47`). Bỏ bước mua: pipe DTO trả 422 trước service nên `refundedSeatChangeId` dùng UUID bất kỳ. Ca: 3 giá trị note (thiếu / rỗng / toàn khoảng trắng) × 2 route ⟹ 422 `VALIDATION_ERROR`, assert `details` chỉ `note`                         |
| M-7 | R-2 `device-activation`               | Test hiện chỉ chứng minh schema strict từ chối trường lạ. Lô **không có** thao tác sửa số license (PATCH chỉ `contractId/note/unitPrice` — SPEC-B3:670) ⟹ `QUANTITY_BELOW_OCCUPIED` không có ca tương ứng: đóng R-2 bằng căn cứ này; thêm ca mức DB: INSERT activation vượt `license_count` ⟹ `device_activations_check_lot_capacity` từ chối. Sửa dòng PROGRESS ghi sai bản chất |
| M-8 | `subscription-owner-department`       | Ca "a higher unit price" **mới đỏ do J-2 của chính đợt** (409 `PRICE_ON_LINES` trên bản K2 có dòng) ⟹ sửa trong đợt: K1 giữ PATCH `/subscriptions`; K2 đổi giá qua `PATCH /subscription-lines/{id}`. Hai ca `SEAT_COUNT_VIA_LEDGER` đi qua sổ seat                                                                                                                       |

## 4. Ghi đúng

- Tạo `CI-<run>-RED-SPECS.md` theo **từng test** cho run cuối (thiếu cho `45974586113`).
- FIX-TEST: tách nhóm P21 (12 spec, một lý do chung) thành từng dòng spec + lý do thật; sửa lý do `subscription-owner-department`;
  `subscription-foreign-price`, `seat-month`, R-7 hết "chờ CI".
- PROGRESS: R-1 ghi Q-1; R-2 ghi căn cứ SPEC-B3:670; L-2 ghi công thức seed đã đổi gì và vì sao.

## 5. Xong khi

Mục 2–3 xong; mỗi spec sửa đã chạy local xanh; CI tay trên `int/redesign-w3` với `CI-<run>-RED-SPECS.md`. Mục tiêu: không còn test đỏ
nào ngoài (a) đỏ cùng tên trên dev `45478093759`, (b) fixture §4 FIX-W3-FINAL-4 có dòng FIX-TEST đúng lý do. Đạt ⟹ điều phối viết
`DELTA-W3-FINAL.md` và cắt PR đợt 3.

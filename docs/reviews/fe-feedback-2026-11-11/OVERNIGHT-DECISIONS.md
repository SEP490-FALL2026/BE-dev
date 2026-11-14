# OVERNIGHT-DECISIONS — chạy đêm Prompt 3 (14/11/2026)

> Nhánh `feat/fe-feedback`. Chế độ đêm ([HANDOFF-CHAT §6](HANDOFF-CHAT.md)): Owner không trả lời; mọi điểm tự chốt dưới đây là **tạm chốt**,
> audit sẽ hỏi lại Owner từng điểm `D-n`. Mỗi mục: câu hỏi · phương án · đã chọn + căn cứ · file/commit · cách đổi lại.
> Thứ tự căn cứ: QĐ → BRD → OWNER-REVIEW → SPEC/PLAN → code → thông lệ. Không tự chốt điều trái QĐ.

## Quyết định

### D-1 — `originalPrice` ở dạng `{ amount, currency }` (chuỗi thập phân đơn vị lớn), không phải `{ amountMinor, currency }`

- **Câu hỏi:** SPEC §5 FX-1 viết `originalPrice?: { amountMinor, currency }`; ADR-0007 (§1, Accepted) cấm `amountMinor` trên dây: tiền trên dây luôn là chuỗi `{ "amount": "1200.00", "currency": "USD" }`.
- **Phương án:** (a) theo chữ SPEC `amountMinor`; (b) theo ADR-0007 và mọi ô tiền khác của API (`unitPrice`, `quote.unitPrice`).
- **Đã chọn:** (b). Căn cứ: ADR-0007 + nhất quán với mọi trường tiền hiện có (FE đọc một dạng duy nhất); "amountMinor" trong SPEC là tên cột DB. Cột DB vẫn là `original_unit_price_minor` (đơn vị nhỏ của chính tiền tệ gốc).
- **File/commit:** `catalog/subscription/subscription.dto.ts`, `requests/assessment/assessment.dto.ts` — `bf773874`, `cdc46045`.
- **Đổi lại:** đổi schema Zod `originalPrice` ở hai DTO + `subscription-pricing.service.ts#readOriginal` / `quote.service.ts#read`; không đụng migration.

### D-2 — Báo giá đánh giá cũng lưu giá gốc: thêm 2 cột `quote_original_*` ở `access_request_assessments`

- **Câu hỏi:** SPEC FX-1 nhận `originalPrice?` ở `PUT /access-requests/{id}/assessment` và bảo quy báo giá ngoại tệ cũ sang VND "giá gốc vào hai cột mới", nhưng SPEC §6 chỉ có hai cột ở `subscriptions`; báo giá nằm ở bảng khác.
- **Phương án:** (a) nhận `originalPrice` rồi bỏ đi (không lưu); (b) thêm cặp cột cùng dạng ở `access_request_assessments` (CHECK cùng có/cùng vắng, FK `currencies`); (c) gom giá gốc vào cột JSON.
- **Đã chọn:** (b). Căn cứ: R-44 cần giá gốc có cấu trúc để so khớp hóa đơn; (a) mất dữ liệu khi quy đổi, (c) không ràng buộc được. Cột nullable, expand-only, không drop.
- **File/commit:** `prisma/migrations/20261113002800_fx_original_price_columns`, `prisma/models/requests.prisma` — `15e770dd`.
- **Đổi lại:** thôi ghi/đọc cột (không cần drop); PI-1/RC-1 chỉ cần đọc `subscriptions.original_*` nên không phụ thuộc cặp cột này.

### D-3 — Phạm vi và cách quy đổi của migration `…002900_fx_prices_to_vnd`

- **Câu hỏi:** SPEC nói quy "thuê bao, Request chưa duyệt chi (+ dòng nhóm, hồ sơ bổ sung), báo giá" nhưng không định nghĩa "chưa duyệt chi", tỷ giá "gần nhất", và các bảng bất biến.
- **Phương án / đã chọn (mỗi điểm):** (1) _Request chưa duyệt chi_ = không có `budget_commitments` và không có `spend_decisions` `APPROVED` (đang chờ, bị từ chối, rút…); Request đã có cam kết giữ nguyên (cam kết/lần kiểm/hóa đơn không đụng, đúng SPEC). (2) _Thuê bao và báo giá đánh giá_ quy hết (là bảng giá, không phải tiền đã chốt). (3) _Tỷ giá_ = dòng `exchange_rates` mới nhất có `rate_date <= CURRENT_DATE` của chính tổ chức và tiền tệ; không có ⟹ không đổi + `RAISE NOTICE` liệt kê id (không đoán). (4) _Hồ sơ bổ sung_ (`request_supplements`, append-only bằng trigger): tắt đúng trigger `request_supplements_no_update_delete` trong một câu UPDATE rồi bật lại, cùng một giao dịch. (5) _Dòng nhóm_ (`access_request_line_amounts`) chỉ sinh cùng cam kết nên Request chưa duyệt chi không có dòng nào ⟹ không động. (6) `payment_schedule` là cột đã ngừng (trigger chặn giá trị mới, không ai đọc) ⟹ không đổi. (7) Làm tròn từng con số riêng (tổng và đơn giá có thể lệch vài đồng so với tổng từng phần; SPEC không đòi cân). (8) Audit: thuê bao `SUBSCRIPTION.UPDATED`; Request, báo giá, hồ sơ bổ sung `ACCESS_REQUEST.REPRICED` (đều `actor_kind = SYSTEM`).
- **Căn cứ:** SPEC §5 FX-1 + §6 + ADR-0007; (1) theo câu "Dòng đã quy đổi trước (cam kết, lần kiểm ngân sách, hóa đơn) không đụng"; không tự đổi luật bất biến nào ngoài (4) mà SPEC đòi chuyển hồ sơ bổ sung.
- **File/commit:** `prisma/migrations/20261113002900_fx_prices_to_vnd/migration.sql`, `test/integration/catalog/fx-prices-to-vnd-migration.integration-spec.ts` — `15e770dd`.
- **Đổi lại:** migration chưa chạy trên DB thật ⟹ sửa tại chỗ được; sau khi chạy thì thêm migration mới (không sửa cũ). Khi Owner chạy trên DB thật: đọc `NOTICE`, đếm trước/sau bằng chính các điều kiện `WHERE` của migration.

### D-4 — Giá kỳ mới của Request tiếp tục thuê bao (renewal outcome) ở ngoại tệ ⟹ 409 `PERIOD_REFUSED`

- **Câu hỏi:** `POST` kết quả gia hạn (`licensing/subscription-renewal`) nhận `unitPrice` của kỳ mới qua `SubscriptionPeriodApi.recordNextPeriod` → `pricing.read`; sau FX-1.2 ngoại tệ không còn đọc được. SPEC chỉ nêu `POST/PATCH /subscriptions` và báo giá.
- **Phương án:** (a) để lỗi `SubscriptionPriceNotVndError` rơi ra 500 (licensing không import được lỗi nội bộ catalog); (b) `recordNext` đổi thành `SubscriptionPeriodRefusedError('PRICE_NOT_VND')` ⟹ licensing đã map sang `409 SUBSCRIPTION_RENEWAL.PERIOD_REFUSED` `details.reason`; (c) thêm lỗi 422 riêng ở licensing.
- **Đã chọn (tạm chốt, Owner xác nhận ở audit):** (b): không đổi contract mới, đi đúng đường refusal có sẵn, không chạm module licensing. Căn cứ: QĐ-111an (giá chỉ VND, mọi chỗ nhập giá gói), "đơn giản, dễ đổi lại". Có test integration (`subscription-renewal-pool-fields`: 409, `details.reason = PRICE_NOT_VND`, không ghi gì) và mô tả route `outcome` nêu lý do (`FX-1-R4`).
- **File/commit:** `catalog/subscription/subscription-period.service.ts`, `catalog/public/subscription-period.types.ts` — `bf773874`.
- **Đổi lại:** đổi nhánh `catch` ở `recordNext` (hoặc làm (c) ở gói FX-2 nếu Owner muốn 422).

### D-5 — Thuê bao nháp còn ở ngoại tệ (không quy được) = thiếu giá; bỏ `priceSnapshot` và `EXCHANGE_RATE` khỏi response

- **Câu hỏi:** SPEC nói "response bỏ `priceRate*`, `priceReporting*`". Còn bản nháp ngoại tệ không có tỷ giá (migration để nguyên) thì `missing`/`complete` xử lý sao; và `missing: EXCHANGE_RATE` còn nghĩa gì khi không còn tỷ giá.
- **Phương án:** (a) giữ `EXCHANGE_RATE` cho bản nháp cũ; (b) bản nháp cũ coi như chưa có giá hợp lệ ⟹ `missing: UNIT_PRICE`, `complete` ⟹ 422 `STILL_DRAFT` `{ missing: ['UNIT_PRICE'] }` tới khi nhập lại bằng VND; bỏ `EXCHANGE_RATE` khỏi enum.
- **Đã chọn:** (b), dựng `isPricedInDong` (giá VND + có snapshot). Căn cứ: S-1/D2 (không còn khái niệm tỷ giá trong luồng), đơn giản, FE chỉ cần một thông báo ("nhập lại giá bằng VND"). Toàn bộ `priceSnapshot` bỏ khỏi response (không chỉ `priceRate*`) vì snapshot đồng nhất không mang thông tin; cột DB vẫn ghi.
- **File/commit:** `catalog/subscription/price/subscription-price.policy.ts`, `subscription.policy.ts`, `subscription-view.service.ts`, `subscription.dto.ts` — `bf773874`.
- **Đổi lại:** đưa lại `EXCHANGE_RATE` vào `missingData` và enum DTO; cột DB không đổi.

## Bị chặn

## Dừng ở đâu

## Tóm tắt cho Owner

### D-6 — Hồ sơ bổ sung cũ: bỏ rồi thêm lại hai CHECK `NOT VALID` quanh UPDATE của migration (thay vì chỉ quy hồ sơ thỏa CHECK)

- **Câu hỏi:** `request_supplements_retired_spend_day_check` (không có ngày chi) và `request_supplements_change_v2_check` (số tiền hoặc ngày kết thúc phải đổi), cả hai `NOT VALID` ở `20261109130000`, vẫn kiểm mọi phiên bản mới của một hàng, kể cả hàng cũ trước 09/11 (có ngày chi, số tiền có thể bằng nhau) ⟹ UPDATE quy VND dừng ở 23514 và cả migration dừng.
- **Phương án:** (a) bỏ hai CHECK, UPDATE, thêm lại đúng định nghĩa `NOT VALID`, cùng giao dịch; (b) chỉ UPDATE hồ sơ thỏa CHECK, liệt kê phần còn lại trong NOTICE.
- **Đã chọn (tạm chốt):** (a). Căn cứ: (b) để lại hồ sơ bổ sung bằng USD bên cạnh Request đã quy VND, đúng thứ mà QĐ-111an muốn bỏ; (a) khôi phục nguyên định nghĩa (không validate hàng cũ, hồ sơ mới vẫn bị chặn; test dựng lịch sử cũ kiểm cả hai), cùng một giao dịch với DISABLE/ENABLE trigger nên không phiên nào thấy trạng thái thiếu. Rủi ro còn lại: `DROP/ADD CONSTRAINT` giữ khóa bảng ngắn; migration chạy một lần ngoài giờ.
- **File/commit:** `prisma/migrations/20261113002900_fx_prices_to_vnd/migration.sql` (sửa tại chỗ vì chưa chạy trên DB thật, như D-3), `test/integration/catalog/fx-prices-to-vnd-upgrade.integration-spec.ts` — `71b32df6`.
- **Đổi lại:** nếu Owner muốn (b): bỏ `DROP/ADD CONSTRAINT`, thêm điều kiện lọc hàng thỏa CHECK ở `fx_supplement_changes` và NOTICE cho phần còn lại; migration chưa chạy thật nên sửa tại chỗ.

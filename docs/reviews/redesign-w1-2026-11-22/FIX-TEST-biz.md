# FIX-TEST — Đợt 1 thiết kế lại, làn `biz`

Các test http / integration / flow cũ khẳng định hành vi trước Wave 1, không xóa, không skip. Toàn bộ 16 mục của Phần A (8 suite integration cũ, 3 flow spec cũ và 5 suite `ops:seed` theo `D-1`) đã được cập nhật assertion đúng hành vi Wave 1 hoặc mở cửa sổ khóa kỳ cho `ops:seed` trước khi vào Phần B.

| Gói | File test | Ca | Lý do |
| --- | --------- | -- | ----- |
| P9 | `test/integration/catalog/subscription-seat-increase-http.integration-spec.ts` | `:53,:70,:79,:80,:90,:101,:110,:121` & `:155-160` (`changes without the check when expectedUpdatedAt is left out`) | W1-03 bắt buộc `expectedUpdatedAt` khi có `purchasedQuantity` (thiếu → 422 `SUBSCRIPTION.VERSION_REQUIRED`) và W1-14 bắt buộc `quantityChangeReason` khi tăng K2 ACTIVE |
| P9 | `test/integration/catalog/seat-baseline-contracts.integration-spec.ts` | `:211` (`PATCH` với `{ purchasedQuantity: 12 }`) | Thiếu `expectedUpdatedAt` và `quantityChangeReason` theo W1-03/W1-14 |
| P9 | `test/integration/catalog/subscription-vendor-admins-http.integration-spec.ts` | `:206,:230` (`PATCH` với `purchasedQuantity: 11/12`) | Thiếu `expectedUpdatedAt` và `quantityChangeReason` theo W1-03/W1-14 |
| P9 | `test/integration/catalog/subscription-tax-and-access-http.integration-spec.ts` | `:116,:127,:202` (`PATCH` thiếu `expectedUpdatedAt`) | `assertVersionForQuantityChange` chạy trước `runner.run` nên `:127,:202` trả 422 thay vì 404 khi thiếu `expectedUpdatedAt` |
| P10 | `test/integration/catalog/subscription-vendor-admins-http.integration-spec.ts` | `:96-158` (`activating (QĐ-110k)`) | `SeatHarness.start()` không đóng baseline phase nên ca cũ kỳ vọng 422 khi pha khởi tạo còn mở (W1-19 cho qua khi pha mở) |
| P10 | `test/integration/catalog/subscription-renewal-vendor-admins.integration-spec.ts` | `:98-126` (`still refuses a NEW subscription...`) | Tương tự: pha khởi tạo còn mở trong harness nên tạo thuê bao mới không còn bị chặn 422 theo W1-19 |

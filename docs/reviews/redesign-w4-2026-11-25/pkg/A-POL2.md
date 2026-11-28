# A-POL2 — Rút Request ở hàng đợi trình và kết quả quyết chi

- W4-12 thêm `NOT_SUBMITTED` vào policy rút. Ca đỏ trả `NOT_REQUESTER` trước thay đổi. Sau thay đổi, trưởng phòng cần lý do và `RETURNED_TO_REQUESTER` vẫn trả `NOT_REQUESTER`.
- Policy `spendItemOutcome` giữ reason của lô và thêm `RECHECKED_RETURNED_TO_REQUESTER` cho phiếu một bước. Test đỏ ban đầu vì thiếu policy. Test xanh bao gồm cả lỗi lạ và `AccessRequestNotPriceableError` được trả về cho caller xử lý.
- `head-withdraw-submission-queue.integration-spec.ts` kiểm hai mục chờ trình, thông báo rút, khoản cam kết và ca âm. CI chưa chạy.

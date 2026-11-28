# B-SPEND-R — Áp dụng policy kết quả quyết chi

- W4-06. Quyết chi theo lô dùng `spendItemOutcome` với context `BATCH`. `returnGroup` và `withoutOpenStep` vẫn xử lý nhóm và các bước đã đóng.
- `Kiểm giữ:` `NOT_IN_BATCH`, `TRANSIENT_FAILURE`, `NO_SPEND_STEP`, `GROUP_NEEDS_LINES`, reason lỗi quyết chi, `COMMITMENT_NOT_HOLDABLE`, `RECHECKED_RETURNED_TO_HEAD` và ném lại lỗi không ánh xạ, gồm `NOT_PRICEABLE`.
- Chạy lại spec lô, spec quyết chi đơn và spec policy. Các kỳ vọng của spec lô giữ nguyên.

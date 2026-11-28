# B-SUBMIT-R — Tách các bước gửi Request

- W4-02. Request đơn giữ thứ tự khóa người gửi, kiểm mục, ghi và định tuyến. Request đơn K5 tiếp tục đi qua `assess` và giữ nguyên kết quả khi thiếu Cost Center.
- `assessParty` đọc ngày nghiệp vụ, lần xếp phòng, Cost Center và khóa phòng một lần khi được yêu cầu. Đầu vào cho bên gọi về sau là `checkPartyWithin`.
- `Kiểm giữ:` hai lần `mayRequest`, `lockDraft`, `lockEligible`, `limits.lock`, `assess`, `requireNotHeld`, `termRefusal`, `limits.requireForOne`, `insert(newRequestOf)`, hai audit và `spendRouting.start` trước khi đọc lại Request.
- 31 test unit đạt trong bốn spec intake, mapper, party và K1 năm. Bốn ca party đỏ trước khi thêm phương thức vì phương thức chưa tồn tại.

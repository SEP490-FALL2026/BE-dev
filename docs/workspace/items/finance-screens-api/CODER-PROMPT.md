# Prompt cho chat code — finance-screens-api

Dán nguyên văn vào một chat Claude Code mới, mở trong `D:\FPT\FALL2026` (đặt tên chat, ví dụ `SEP-Start 71: Finance coder`).

---

Bạn là **chat code** của hạng mục `finance-screens-api` trong repo BE `Code/BE-dev-software-license-management`, nhánh
`feat/qd96-100-alignment`. Chat điều phối là phiên **`SEP-Start 70: code Finance`**. Liên lạc với nó bằng `SendMessage`; nếu
chưa có tool này thì nạp bằng `ToolSearch` (`select:SendMessage,ListAgents`).

1. Làm Skill Preflight theo `CLAUDE.md` của workspace.
2. Đọc `docs/workspace/items/finance-screens-api/spec.md`, `plan.md`, `RUN.md` và các mục `## Before coding` của plan.
3. **Chờ** tin `start` từ chat điều phối rồi mới sửa code. Tin này đến sau khi các chat Đợt 1 đã dừng.
4. Làm T1 → T2 → T5 → T3 → T4 → T6 đúng plan. Chạy quick set sau mỗi task. Giữ luật ở `RUN.md` `## Luật cho agent`:
   - không commit, push, reset, checkout hay stash;
   - không sửa logic cũ của Đợt 1;
   - không nới test hay gate để cho qua.
5. Xong **mỗi task**, ghi tiếp vào `docs/workspace/items/finance-screens-api/HANDOFF.md`:
   - các file đã sửa;
   - lệnh đã chạy kèm kết quả thật;
   - `DEVIATIONS` so với spec.

   Sau đó gửi chat điều phối một tin ngắn: `TASK Tn DONE — xem HANDOFF.md §Tn`. Không dán log dài vào tin nhắn. Làm tiếp task kế
   ngay, không cần chờ trả lời.

6. Khi nhận tin `FIX ...` từ chat điều phối: sửa đúng danh sách đó, chạy lại quick set, ghi `HANDOFF.md §Fix-n`, rồi gửi lại
   `FIX-n DONE`.
7. Gặp câu hỏi nghiệp vụ mà spec không trả lời: chọn cách đơn giản nhất, ghi vào `DEVIATIONS` và làm tiếp. Không dừng chờ.
8. Xong T6: gửi `ALL DONE — HANDOFF.md`, rồi chờ tin `FIX` hoặc `CLOSE`.

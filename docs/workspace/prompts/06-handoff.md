# 06 — Commit nhánh cá nhân và bàn giao

Dùng với tin giao việc và đầu vào tại [hướng dẫn](README.md). Khi dùng AI: Sonnet theo cấu hình Owner.

## Prompt

Thực hiện **bước 06**, chỉ dùng quyền Git được ghi trong tin giao việc; Owner là người merge vào dev và nghiệm thu.

1. Đọc hướng dẫn repo và kiểm nhánh/diff, spec/plan, findings 02/04 và evidence 05. Đối chiếu scope/AC, generated artefact,
   migration và tài liệu cuối. Kiểm việc sửa sau validation có làm bằng chứng cũ mất hiệu lực không. Không tạo commit
   tuyên bố hoàn tất khi blocker bắt buộc/test đỏ còn chưa giải quyết; bàn giao trạng thái chưa hoàn tất một cách rõ ràng.
2. Nếu chưa được quyền commit/push, chỉ chuẩn bị báo cáo/diff và ghi thao tác còn cần người thực hiện. Nếu được commit,
   xác nhận đúng nhánh cá nhân; stage bằng đường dẫn/hunk chỉ thuộc task, xem staged diff và kiểm secret. Không git add .,
   reset/discard, stage phần việc của người khác hoặc gom thay đổi ngoài scope. Phần chồng lấn không tách được an toàn thì
   giữ nguyên và hỏi đúng file/hunk, không tự bỏ thay đổi người khác.
3. Commit source/test/spec/plan/tài liệu có liên quan theo quyền được giao. Ghi commit SHA và nối với evidence cây trước
   commit; nếu nội dung code/test đổi sau lần chạy, verify lại. Push chỉ tới nhánh cá nhân/remote đã được chỉ định;
   tạo PR chỉ khi được giao. Không force-push, merge dev/main, deploy hoặc sửa DB dùng chung từ quyền này.
4. Bàn giao: scope G/US/AC và coverage còn thiếu; commit/nhánh/PR thực sự có; file spec/plan/review; hành vi mới và lỗi đã
   sửa; migration/cách vận hành/tương thích API/FE; bảng lệnh và kết quả đã chạy; findings và review bắt buộc còn mở.
   Không tự ghi accepted/released hoặc Owner đã review. Chỉ cập nhật roadmap bằng sự kiện đã xảy ra.
5. Gửi hướng dẫn Owner đối chiếu diff, merge và kiểm chứng trên merge SHA của dev theo CI/test guide, rồi review cuối.
   Đây là nội dung báo cáo để dev gửi; không tự gửi Zalo/email hoặc công cụ nhắn tin. Nếu Owner yêu cầu sửa tiếp, tiếp
   quản findings theo README, không xóa báo cáo cũ và không làm lại phần đã chứng minh mà không có lý do.

Đầu ra cuối: commit/push/PR đã thực hiện hoặc chưa được phép, báo cáo kiểm chứng và các điểm cần Owner review/kiểm trên
dev. Dừng ở bàn giao, không tự tiến hành merge/nghiệm thu.

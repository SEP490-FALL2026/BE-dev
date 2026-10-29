# 01 — Thiết kế spec, plan và test

Dùng với tin giao việc và đầu vào tại [hướng dẫn](README.md). Khi dùng AI: Opus theo cấu hình Owner; người dùng chọn model.

## Prompt

Thực hiện **bước 01**, chưa implement product code và chưa commit/push.

1. Đọc AGENTS.md, CONTRIBUTING.md, ARCHITECTURE.md, workspace README, rules theo phạm vi, work-item-sizing và test guide.
   Kiểm tra nhánh/diff, pin BE/Docs theo tin giao việc và xác định nguồn thực sự truy cập được. Đọc US/AC, mục BRD/quyết
   định liên quan, module card, public API, source/test hiện có và dependency của phần được giao.
2. Nếu giao một phần G, giữ đúng ranh giới Story/AC hoặc hạng mục đã giao. Nếu giao một/hai G, đối chiếu roadmap để loại
   phần đã có chủ/đã accepted và phân rã phần còn lại theo outcome. Không gom cả G thành một spec/plan. Scope map ở roadmap
   theo rule sizing; không tạo bảng tiến độ/AC song song. Đã có spec/plan thì tiếp quản, không tạo bản trùng.
3. Tạo/cập nhật spec.md và plan.md theo docs/workspace/_template tại items/<tên-hạng-mục>/, đăng ký index và scope map
   theo convention. Ghi primary Story/AC chính xác, coverage, out of scope, dependency và blocker. Nhiều G có dependency
   phải ghi thứ tự; không nhận thêm phần của người khác để “làm trọn”.
4. Thiết kế actor/quyền/SoD, luồng và ngoại lệ, trạng thái, dữ liệu và ownership, API/lỗi, migration, transaction/lock
   order/concurrency/idempotency, extension point/worker nếu có, audit/privacy và tương thích. Dẫn ADR/rule hiện hành,
   không tự chốt lại kiến trúc hoặc thay nghiệp vụ. Ghi n/a có lý do cho phần không áp dụng.
5. Thiết kế test matrix từ AC/rủi ro với setup, thao tác, đáp án độc lập và tầng chứng minh. Bao gồm quyền âm, trạng thái
   sai, rollback, thời gian/đồng thời khi liên quan; không lặp cùng ma trận ở mọi tầng. Chỉ tách test-plan.md nếu cần;
   luôn có test matrix trong spec và task source/test + Files/Depends on/Acceptance/Verify trong plan.
6. Chạy kiểm tra tài liệu theo CONTRIBUTING, tự đối chiếu AC → thiết kế → test. Thiếu quyết định có ảnh hưởng hành vi thì
   ghi câu hỏi cụ thể, không suy diễn; tiếp tục thiết kế phần độc lập. Không tự ghi Owner approved/accepted.

Kết thúc bằng danh sách file, scope/dependency, quyết định cần Owner, trạng thái thiết kế và đầu vào cho bước 02.
Dừng ở bàn giao bước 01 để người dùng chuyển phiên/model; chưa thực hiện bước 02 hoặc code.

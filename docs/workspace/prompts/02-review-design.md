# 02 — Audit và sửa thiết kế

Dùng với tin giao việc và đầu vào tại [hướng dẫn](README.md). Khi dùng AI: Opus, nên mở phiên mới và tự đọc nguồn.

## Prompt

Thực hiện **bước 02**: review và sửa spec/plan/test design trong scope, chưa implement product code, chưa commit/push.

1. Đọc hướng dẫn repo hiện hành, nguồn pin, scope map, spec/plan/test matrix; đối chiếu source/test/public contract và
   dependency thực tế. Không chỉ tin phần tự đánh giá của tác giả thiết kế. Kiểm tra revision của thiết kế có khớp baseline.
2. Tìm thiếu/sai AC, vượt scope hoặc hai chủ, nguồn lỗi thời, quyền/SoD, chuyển trạng thái thiếu, invariant, transaction,
   thứ tự khóa và ca đua, định nghĩa tiền/ngày hiệu lực, migration/tương thích, audit/privacy, dependency chưa có.
   Đối chiếu ranh giới/tầng module với ARCHITECTURE và ADR hiện hành.
3. Review test design riêng: đáp án có xuất phát từ yêu cầu không, tầng nào thực sự chứng minh, test phủ định/rollback/
   concurrency có cần không, setup/dọn dữ liệu có cô lập không, có trùng ma trận giữa các tầng hoặc chỉ mirror implementation.
4. Ghi finding có mã ổn định, mức ảnh hưởng, đường dẫn/vị trí, căn cứ, hậu quả, hướng sửa và disposition. Lưu cạnh hạng mục
   hoặc trong docs/reviews và link từ plan. Không tạo findings giả chỉ để đủ số lượng; không đổi AC nguồn để giải quyết finding.
5. Sửa trực tiếp thiết kế/test matrix trong phạm vi đã giao. Quyết định nghiệp vụ hoặc thay scope cần Owner thì ghi rõ
   phần chặn; làm tiếp phần độc lập. Đọc lại các file đã sửa, đối chiếu lại AC và chạy gate tài liệu.

Đầu ra: findings đã sửa/còn mở, thiết kế đủ hay chưa đủ đầu vào cho code, file và revision/fingerprint được review,
check đã chạy và đầu vào bước 03. Không gọi AI review là dev peer review hoặc Owner acceptance. Dừng sau bước 02.

# 04 — Audit và sửa implementation

Dùng với tin giao việc và đầu vào tại [hướng dẫn](README.md). Khi dùng AI: Opus, nên dùng phiên mới.

## Prompt

Thực hiện **bước 04**: audit code/test/tài liệu của phần được giao và sửa findings trong scope, chưa commit/push.

1. Nạp hướng dẫn repo/kiến trúc/rules/test guide hiện hành. Đọc nguồn US/BRD/quyết định đã pin, spec/plan/test design,
   findings bước 02 và diff từ baseline đến cây hiện tại. Tách thay đổi thuộc task khỏi thay đổi người khác; không
   coi diff toàn repo đang bẩn là toàn bộ việc của task. Ghi revision/fingerprint được review.
2. Đối chiếu AC → thiết kế → source → test và kết quả quan sát được. Review actor/scope/SoD, state transitions, DB
   constraints, transaction/rollback/khóa và đồng thời, retry/idempotency, ngày/tiền, worker/hooks, security/audit/privacy,
   migration và public contract/tiers. Kiểm tra đường lỗi lẫn happy path và phần ảnh hưởng module khác.
3. Audit test như một sản phẩm: assertion có bắt sai hành vi không, mock có che integration không, harness có dùng đúng
   lớp và dữ liệu riêng không, test có mirror implementation hoặc duplicate ma trận không. Không lấy số test/coverage
   thay cho chứng minh AC. Không claim live-tested từ mock hoặc đọc source.
4. Ghi findings có căn cứ và disposition tại review/plan. Sửa trực tiếp lỗi trong scope, thêm regression có ý nghĩa,
   cập nhật spec/test design/tài liệu nếu cần; chạy lại kiểm tra phần sửa. Nếu cần đổi nguồn nghiệp vụ/scope thì ghi
   câu hỏi cho Owner, không tự hợp thức hóa code sai bằng sửa đặc tả. Lỗi ngoài scope ghi riêng, không refactor tràn lan.
5. Review lại diff sau sửa và ghi findings còn mở, check đã chạy và giới hạn. Không tự xác nhận peer review người thật
   hay Owner acceptance. Nếu review không tìm được lỗi, nói rõ phạm vi đã xét và giới hạn, không bắt buộc phải có finding.

Đầu ra: kết luận implementation so với AC, findings đã xử lý/còn mở, revision/fingerprint cuối và handoff cho 05.
Dừng sau bước 04; kết quả test trước những lần sửa vừa rồi không tự có hiệu lực với cây mới.

# Thiết kế và bàn giao theo User Story

Workspace được lưu trên Git để dev và AI cùng dùng. Chỉ local/ là nháp cá nhân bị ignore. Không bắt cài Superpowers hay dùng một AI cụ thể.

## Dev ngang quyền

Mọi dev đều có thể làm rõ yêu cầu, soạn spec/plan, review và implement. Mỗi hạng mục có người phụ trách và một dev khác review. Vai trò luân phiên theo việc, không tạo cấp bậc hoặc một người duyệt cố định. AI hỗ trợ, không tự xác nhận phê duyệt thay người thật.

Quyết định kỹ thuật trong BRD/US được dev liên quan thống nhất qua review. Nếu nguồn mâu thuẫn hoặc cần đổi nghiệp vụ, ghi câu hỏi và xác nhận/cập nhật tại nguồn. Review kỹ thuật không tự thay baseline nghiệp vụ. Chưa thống nhất thì ghi blocker cho phần phụ thuộc, tiếp tục phần độc lập.

## Cấu trúc

- _template/: hai mẫu chính spec.md và plan.md; test-plan.md tùy chọn.
- items/: một thư mục mỗi lát, tên ổn định như us-xx-yy-short-name hoặc issue-123-short-name; không cần bộ đếm riêng.
- local/: nháp cá nhân; không chứa đầu vào bàn giao duy nhất.
- research/: hướng dẫn nghiên cứu; kết quả theo hạng mục đặt cạnh spec.
- [Roadmap](../roadmap.md): thứ tự dự kiến, phụ thuộc và tiến độ hạng mục.

## Quy trình

1. Chọn lát US/AC hoặc technical enabler; kiểm tra roadmap tránh trùng, thêm dòng và người phụ trách.
2. Copy spec.md và plan.md từ _template/ vào items/<tên-hạng-mục>/. Điền [nguồn BRD/US](sources.md) có revision, phạm vi và câu hỏi. Chỉ tạo research.md/test-plan.md khi cần.
3. Làm rõ hành vi, API, dữ liệu, quyền, lỗi, migration và cách kiểm chứng. Phần không liên quan ghi không áp dụng cùng lý do. Chỉ lập kế hoạch chi tiết cho lát sắp làm.
4. Một dev khác review spec và plan qua PR. Ghi link review, người xác nhận và revision. Chỉ ghi approved sau xác nhận thật.
5. Bàn giao khi nguồn truy cập được, AC rõ, spec/plan được review, dependency sẵn sàng và không còn blocker cho lát đó. Đáp ứng điều kiện của nguồn, gồm Logical ERD nếu cần. Có thể merge PR thiết kế trước, rồi mở PR implement liên kết.
6. Người hoặc AI implement đọc AGENTS, spec/plan đã duyệt và source/test liên quan. Cập nhật checklist plan và kết quả thực chạy. Nếu cần đổi hành vi/contract, cập nhật spec và review lại phần ảnh hưởng trước khi làm phần đó.
7. Dev khác review code và kiểm chứng AC. Cập nhật roadmap theo sự kiện thật. Merged khác accepted và deployed; nghiệm thu ghi người xác nhận, revision, môi trường và bằng chứng.

Task nhỏ không đổi nghiệp vụ/contract dùng issue/PR với scope, kiểm tra và review. Quyết định kiến trúc lâu dài ghi ADR, liên kết từ spec thay vì sao chép.

## Nguồn và bàn giao

Mỗi spec ghi link/revision/US/AC thực sự dùng, không chỉ nói “bản mới nhất”. Nguồn chưa commit cần snapshot chia sẻ có version/hash. Không copy toàn bộ BRD vào spec. Trạng thái BASELINED/OWNER-PROVISIONAL/... không phải tiến độ code; tuân theo điều kiện của nguồn. Nguồn đổi thì đánh giá ảnh hưởng và review lại thiết kế liên quan, giữ lịch sử bằng Git.

Giao đường dẫn spec/plan, revision đã review, phạm vi task và môi trường kiểm tra. Người nhận làm được từ checkout và nguồn chung, không phụ thuộc chat. Prompt mẫu:

> Đọc AGENTS.md và spec/plan của hạng mục được giao. Đối chiếu revision đã review với code hiện tại. Implement phần được giao, kiểm tra theo CONTRIBUTING và test guide; báo kết quả thực chạy và phần chưa kiểm chứng. Làm rõ blocker trước khi làm phần phụ thuộc. Không tự ghi nhận phê duyệt hoặc nghiệm thu.

Superpowers hỗ trợ làm rõ yêu cầu và viết plan khi dev muốn dùng. Yêu cầu dùng mẫu/vị trí của repo này; không sinh bộ song song ở docs/superpowers/. Người và AI bàn giao cùng định dạng.

## Kiểm tra và Git

Chạy pnpm rules:check và pnpm rules:format từ gốc BE. Checker kiểm tra Markdown trong workspace trừ local/; không chứng nhận nội dung web, quyền truy cập, tính đúng nghiệp vụ hay phê duyệt. Reviewer kiểm tra các phần đó.

Commit template, spec/plan, sources và roadmap cùng thay đổi liên quan. Không commit secrets, dữ liệu thật, chat/cache hay cấu hình skill cá nhân. Không cần đưa cả thư mục trên máy lên Git.

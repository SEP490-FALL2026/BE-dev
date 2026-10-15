# Thiết kế và bàn giao theo User Story

Workspace được lưu trên Git để dev và AI cùng dùng. Chỉ local/ là nháp cá nhân bị ignore. Không bắt cài Superpowers hay dùng một AI cụ thể.

## Vai trò theo hạng mục

Mỗi hạng mục có một **người phụ trách** sở hữu xuyên suốt: làm rõ yêu cầu, hoàn thiện spec/plan và thiết kế test, implement source/test, cập nhật checklist cùng bằng chứng sau khi chạy. Người phụ trách có thể là người hoặc AI được giao việc. Không bắt buộc một dev khác review trước khi bắt đầu thiết kế, code hoặc tích hợp lên `dev`.

Roadmap ghi riêng **người thiết kế ban đầu** để biết ai đã soạn hoặc chốt đầu vào spec/plan/test/decision. Owner có thể thiết kế trước rồi giao dev implement; dev cũng có thể tự thiết kế và implement. Khi nhận hạng mục do người khác thiết kế, người phụ trách tiếp tục sở hữu việc duy trì tài liệu và phải cập nhật chúng nếu implementation làm rõ hoặc thay đổi thiết kế.

Owner BE là reviewer cuối của cả gói spec/plan/decision, source, test và bằng chứng trên một revision cụ thể trước khi đưa lên `main`/production. Peer review của dev khác được khuyến khích khi hữu ích nhưng là bằng chứng bổ sung, không phải gate bắt buộc. AI không tự ghi Owner đã duyệt hoặc đã nghiệm thu.

Nếu nguồn mâu thuẫn hoặc cần đổi nghiệp vụ, người phụ trách ghi rõ câu hỏi, giả định và phần bị ảnh hưởng; không tự thay baseline nghiệp vụ. Có thể tiếp tục phần độc lập. Quyết định Owner đã có phải được cập nhật lại vào nguồn/spec để phiên sau không phụ thuộc chat.

## Cấu trúc

- _template/: hai mẫu chính spec.md và plan.md; test-plan.md tùy chọn.
- items/: một thư mục mỗi lát, tên ổn định như us-xx-yy-short-name hoặc issue-123-short-name; không cần bộ đếm riêng.
- local/: nháp cá nhân; không chứa đầu vào bàn giao duy nhất.
- research/: hướng dẫn nghiên cứu; kết quả theo hạng mục đặt cạnh spec.
- [Roadmap](../roadmap.md): thứ tự dự kiến, phụ thuộc và tiến độ hạng mục.

## Quy trình

1. Chọn lát US/AC hoặc technical enabler; kiểm tra roadmap tránh trùng, ghi người phụ trách và người thiết kế ban đầu. Hai vai có thể cùng một người.
2. Người phụ trách dùng mẫu trong `_template/` để tạo hoặc tiếp quản spec/plan. Ghi [nguồn BRD/US](sources.md) có revision, phạm vi, quyết định và câu hỏi. Chỉ tạo research.md/test-plan.md khi chúng có nội dung riêng cần duy trì.
3. Làm rõ hành vi, API, dữ liệu, quyền, lỗi, migration, thiết kế test và cách kiểm chứng. Phần không liên quan ghi không áp dụng cùng lý do. Khi đủ đầu vào để code, đánh dấu thiết kế `ready`; trạng thái này không có nghĩa Owner đã duyệt.
4. Người phụ trách implement source/test theo spec/plan, cập nhật checklist và kết quả thực chạy ngay trong hạng mục. Nếu implementation làm đổi hành vi/contract, cập nhật spec/plan cùng thay đổi; không để tài liệu mô tả bản cũ.
5. Có thể nhờ dev khác peer review ở bất kỳ thời điểm nào và lưu link/bằng chứng, nhưng không bắt buộc chờ peer review để bắt đầu hoặc tiếp tục phần không bị blocker.
6. Sau khi kiểm chứng đạt, có thể tích hợp lên `dev` theo quy trình Git của nhóm. Ghi `merged-dev` theo sự kiện thật; trạng thái này chưa phải Owner nghiệm thu và chưa cho phép tự đưa lên `main`/production.
7. Owner review cuối trên revision cụ thể, đối chiếu spec/plan/decision, source, test, AC và bằng chứng. Nếu cần sửa, ghi `changes-requested`; nếu đạt, ghi `accepted` cùng Owner, revision, môi trường và bằng chứng. Chỉ revision `accepted` mới đủ điều kiện đưa lên `main`/production; `released` chỉ ghi sau sự kiện triển khai thật.

Task nhỏ không đổi nghiệp vụ/contract dùng issue/PR với scope, kiểm tra và review. Quyết định kiến trúc lâu dài ghi ADR, liên kết từ spec thay vì sao chép.

## Nguồn và bàn giao

Mỗi spec ghi link/revision/US/AC thực sự dùng, không chỉ nói “bản mới nhất”. Nguồn chưa commit cần snapshot chia sẻ có version/hash. Không copy toàn bộ BRD vào spec. Trạng thái BASELINED/OWNER-PROVISIONAL/... không phải tiến độ code; tuân theo điều kiện của nguồn. Nguồn đổi thì đánh giá ảnh hưởng và review lại thiết kế liên quan, giữ lịch sử bằng Git.

Giao đường dẫn spec/plan, revision đầu vào, phạm vi task và môi trường kiểm tra. Người nhận làm được từ checkout và nguồn chung, không phụ thuộc chat. Prompt mẫu:

> Đọc AGENTS.md và spec/plan của hạng mục được giao. Đối chiếu revision đầu vào với code hiện tại. Tiếp quản và cập nhật spec/plan/test design khi cần, implement phần được giao, kiểm tra theo CONTRIBUTING và test guide; ghi kết quả thực chạy và phần chưa kiểm chứng. Làm rõ blocker trước khi làm phần phụ thuộc. Không tự ghi Owner đã phê duyệt hoặc nghiệm thu.

Superpowers hỗ trợ làm rõ yêu cầu và viết plan khi dev muốn dùng. Yêu cầu dùng mẫu/vị trí của repo này; không sinh bộ song song ở docs/superpowers/. Người và AI bàn giao cùng định dạng.

## Kiểm tra và Git

Chạy pnpm rules:check và pnpm rules:format từ gốc BE. Checker kiểm tra Markdown trong workspace trừ local/; không chứng nhận nội dung web, quyền truy cập, tính đúng nghiệp vụ hay phê duyệt. Người phụ trách kiểm tra trong lúc làm; Owner đối chiếu lại ở review cuối.

Commit template, spec/plan, sources và roadmap cùng thay đổi liên quan. Không commit secrets, dữ liệu thật, chat/cache hay cấu hình skill cá nhân. Không cần đưa cả thư mục trên máy lên Git.

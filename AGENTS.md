# SaaS-Sentry — Backend

Áp dụng cho toàn bộ repo này, cho dev và AI agent.

1. Đọc [docs/rules/README.md](docs/rules/README.md) và [docs/rules/context.md](docs/rules/context.md) trước khi làm việc; đã đọc trong cùng task thì chỉ nạp lại khi nguồn thay đổi.
2. Chọn playbook theo nhiệm vụ trong bảng README. Đọc các quy tắc chuyên đề mà task chạm tới; không nạp mọi file mặc định.
3. Quy tắc trong các file được dẫn có hiệu lực như hướng dẫn tại đây. BRD sở hữu nghiệp vụ; ADR/kiến trúc tại repo sở hữu cách hiện thực. Ghi rõ mâu thuẫn hiện hành, không tự chọn bản tiện nhất.
4. Giữ thay đổi có sẵn của người khác; không đưa secrets/dữ liệu thật vào artefact. Hoàn tất công việc đã được giao, chỉ hỏi về quyết định còn thiếu làm thay đổi phạm vi/hành vi/quyền.
5. Kiểm chứng theo tác động và báo kết quả thực chạy. Không tự commit, push, deploy hoặc thao tác dữ liệu môi trường dùng chung khi chưa được ủy quyền.

`AGENTS.md` là điểm vào; nội dung chi tiết nằm trong `docs/rules/`.
File hướng dẫn cho Claude/Copilot/Windsurf chỉ dẫn tới đây, không giữ bản sao rules.

# Mẫu hạng mục

Đọc [quy trình](../README.md). Copy spec.md và plan.md vào docs/workspace/items/<tên-hạng-mục>/, điền thông tin thật và
đăng ký hạng mục ở [items index](../items/README.md) và roadmap. Chia việc trước theo
[work-item sizing](../../rules/work-item-sizing.md). Giữ tên heading `##` và tên trường của mẫu: `pnpm rules:check` kiểm
các mục bắt buộc, `## Sizing decision`, pin Docs/BE, từ trạng thái, cột `Coverage`, số primary Story và trường của từng
task cho mọi hạng mục không nằm trong danh sách legacy của `rules-check.config.json`.

Không cần frontmatter hay số gói tuần tự. test-plan.md tùy chọn khi kiểm thử phức tạp, liên kết từ spec/plan nếu dùng.
todo.md chỉ dẫn giữ checklist ở plan, không copy sang hạng mục. Không ghi approved/passed/accepted trước bằng chứng.

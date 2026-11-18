# Plan: tên hạng mục

- [Spec](spec.md); revision đầu vào: Docs `<sha>`, BE `<sha>`.
- Phụ trách: dev hoặc AI sở hữu cả thiết kế, implementation, test và cập nhật plan. Thiết kế ban đầu bởi: điền Owner/dev.
- Owner review: chưa review. Peer review: tùy chọn, ghi người/link nếu có; bắt buộc khi nguồn đã pin yêu cầu.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, rule chuyên đề và source/test liên quan. Đối chiếu spec với code ở BE `<sha>`, ghi
dependency/môi trường/blocker. Thiết kế `ready` hoặc Owner duyệt sớm không chứng minh dependency đã chạy.

## Tasks

Mỗi task là một bước review được, để hệ thống build/test được sau nó. Task có nhiều outcome hoặc chạm nhiều subsystem
thì tách; số file chỉ là tín hiệu — file sinh tự động, file chỉ di chuyển và refactor giữ hành vi được đánh giá bằng
bằng chứng (diff, test giữ nguyên), không bằng ngưỡng cứng ([work-item sizing](../../rules/work-item-sizing.md)). Test đi
cùng task, không dồn về một bước sau. Refactor và thay đổi hành vi là hai task (thường hai hạng mục); migration là task
riêng đi trước code phụ thuộc nó.

Hạng mục có nhiều phase hoặc có `## Size exception`: nhóm task theo `### Phase …`, mỗi phase kết thúc bằng một
`### Checkpoint` nêu gate phải xanh trước phase sau; phase là ranh giới review/rollback đã ghi ở Size exception.

### Task 1: kết quả review được

- Files: file/module dự kiến chạm.
- Depends on: task/hạng mục/migration phải xong trước, hoặc `none`.
- Acceptance: AC/hành vi đạt khi xong task.
- Verify: `lệnh` → kết quả mong đợi (test đỏ trước/xanh sau nếu đổi hành vi).

### Checkpoint

Sau mỗi phase hoặc mỗi 2–3 task: gate chạy xanh, tự review diff theo spec/AC.

## Verification and handoff

Chọn lệnh theo CONTRIBUTING.md và test/README.md, chạy từ gốc BE: `pnpm check`, `pnpm test:e2e`,
`pnpm test:integration` (database riêng theo test guide), `pnpm openapi:export`; chỉ tài liệu dùng `pnpm rules:check` và
`pnpm rules:format`.

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.

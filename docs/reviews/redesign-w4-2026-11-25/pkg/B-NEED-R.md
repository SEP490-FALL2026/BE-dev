# B-NEED-R — Dùng lại checklist nhu cầu đã chấm

- W4-05. `decide` ghi kết quả checklist và lý do được truyền vào. Request đơn vẫn chấm một lần theo chính sách hiện hành.
- `Kiểm giữ:` `lockDecidable` tiếp tục khóa Request rồi kiểm quyền xem, `NOT_FOUND`, `GROUP_USES_LINES` và `checkNeedDecision` trước khi ghi.
- Ca checklist truyền trước đỏ vì service chấm lại. Sau refactor, cả 7 test của `need-decision.service.spec.ts` đạt.

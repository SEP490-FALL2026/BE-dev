# Quy ước tài liệu

- [README](../../README.md): giới thiệu, setup, link bắt đầu.
- [CONTRIBUTING](../../CONTRIBUTING.md): workflow, lệnh kiểm tra, tiêu chí PR.
- [ARCHITECTURE](../../ARCHITECTURE.md): code hiện có, trách nhiệm và boundary.
- [AGENTS](../../AGENTS.md): chỉ dẫn ngắn cho AI; adapter không sao chép rule.
- `docs/guides/`: thao tác cụ thể đã đối chiếu với code/lệnh.
- `docs/decisions/`: quyết định có bối cảnh, trạng thái, hệ quả.
- `docs/architecture/`: thiết kế chi tiết khi task thực sự cần.

Spec/plan lưu trên Git tại [workspace](../workspace/README.md), dùng mẫu chung và liên kết [roadmap](../roadmap.md). Chỉ workspace/local/ là scratch bị ignore. Task nhỏ không đổi nghiệp vụ/contract có thể dùng issue/PR. Không bắt skill/AI cụ thể. Dev ngang quyền khác review; AI không tự xác nhận phê duyệt. BRD/US phải truy cập được và có revision trong spec.

Phân biệt **Proposed**, **Accepted**, **Superseded/Deprecated** với **Implemented/Verified**.
Muốn nói đã verified phải có kết quả chạy đúng source và phạm vi kiểm tra.
Đổi quyết định được chấp nhận bằng ADR mới; giữ ADR cũ và ghi liên kết thay thế.
Cập nhật [chỉ mục](../README.md) trong cùng thay đổi.

Không dựng kiến trúc thứ hai ở `docs/ARCHITECTURE.md`. Dùng link tới nguồn sở hữu,
không lặp cả đoạn chỉ để giúp mọi file tự đầy đủ. Khi chuyển nội dung, sửa link
của tài liệu đang dùng; tài liệu lịch sử cần ghi rõ phạm vi không còn áp dụng.
Không lưu secrets, dữ liệu thật hoặc đường dẫn cá nhân vào tài liệu chung.

Trước bàn giao: `pnpm rules:check`, `pnpm rules:format`, đọc diff. Bộ kiểm tra
có phạm vi tường minh trong `rules-check.config.json`; không chứng nhận toàn bộ
link trong các snapshot lịch sử hoặc nội dung trang web bên ngoài.

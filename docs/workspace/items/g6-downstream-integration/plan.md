# Plan: khung — phần G6 chờ rule và khuyến nghị (G7), chi phí theo ngày và tiết kiệm (G8), hộp thông báo

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (24/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (24/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `blocked`. PR: chưa có.

## Before coding

Hạng mục khung không có code. Khi blocker được gỡ: đọc lại spec các hạng mục G6 đã hiện thực (điểm gọi ghi ở _Dependencies and blockers_), đối chiếu với G7 (rule và khuyến nghị) và G8 (chi phí theo ngày, tiết kiệm), rồi thiết kế lại theo từng blocker.

## Tasks

### Task 1: giữ chỗ scope map

- Files: `spec.md`, `plan.md`, `docs/roadmap.md`
- Depends on: none
- Acceptance: các vế AC chờ ngoài nhóm có chủ là khung này trong scope map G6
- Verify: `pnpm rules:check` → xanh

### Task 2: thiết kế lại khi gỡ blocker

- Files: `spec.md`, `plan.md`
- Depends on: `US-10-01`→`US-10-03`, `US-10-06`, `US-12-13`, `FR-4.15`, `US-05-15` ở trạng thái `verified`
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test cho từng blocker, tách hạng mục theo blocker
- Verify: `pnpm rules:check` → xanh

## Verification and handoff

Không áp dụng: hạng mục khung, chưa có code.

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại     |
| ------------------ | --------------------- | ----------------- | --------------------------- |
| chưa chạy          | chưa chạy             | chưa chạy         | chờ G7, G8 và hộp thông báo |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

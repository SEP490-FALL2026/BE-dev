# Plan: lát G2 đầu — danh mục chức vụ và nhập tay một nhân viên

- [Spec](spec.md); revision tài liệu đã review: chưa review (draft 14/10/2026).
- Implement: chưa phân công; reviewer: dev khác.
- Triển khai: not-started. PR: chưa có.

## Trước khi code

Đọc AGENTS.md, CONTRIBUTING.md, spec G0, follow-up R-10/R-11, [remediation](../g0-g1-remediation-after-rereview/plan.md).
**Điều kiện thiết kế:** có đúng tệp của snapshot `S-2026-10-14b` (BRD v3.39, `QĐ-01`→`QĐ-73`, `US-02-07`, `WF-01` v3.3) —
cùng máy hoặc gói snapshot — và hash khớp. Không cần commit để bắt đầu thiết kế.
**Điều kiện giao implementation:** nguồn được cố định, truy cập được (ưu tiên commit Docs + pin snapshot bằng commit).
**Điều kiện code:** nhánh remediation `a0cf5f1` được dev review và merge; spec/plan/migration/test plan của lát được dev khác review.

## Các bước nhỏ

- [ ] Bước 1 — thiết kế: cập nhật Logical vùng tổ chức (JobTitle trạng thái, I-2 theo `QĐ-70c`, thứ tự khóa T-11);
      API danh mục chức vụ và nhập tay; migration R-10 (tính lại tên chuẩn hóa, kiểm trùng trước khi thêm ràng buộc);
      review cùng dev khác. Không code.
- [ ] Bước 2 — sau điều kiện code: test đỏ cho `US-02-07` AC-1→AC-11 và R-11; implement danh mục + migration.
- [ ] Bước 3 — nhập tay `US-02-02` AC-14/15 dùng chung validator dòng import; e2e chuỗi Finance; OpenAPI, roadmap; review diff.

Rollback: migration R-10 phải có bước kiểm trùng trước và cách quay lại cột chuẩn hóa cũ; ghi rõ trong bước 1.

## Kiểm chứng và bàn giao

| Lệnh / kiểm tra AC                                     | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------------------------------------------ | --------------------- | ----------------- | ----------------------- |
| `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` | —                     | chưa chạy         | chờ implement           |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Dev khác review code; spec phản ánh thay đổi đã thống nhất.
- [ ] Cập nhật roadmap/PR; merged và accepted chỉ ghi sau sự kiện thật.

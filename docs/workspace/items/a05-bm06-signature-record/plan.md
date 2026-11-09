# Plan: bản ký `BM-06` gắn hồ sơ thiết bị — chỉ nhân viên giữ máy và IT Admin mở được

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: AI theo giao việc A-05. Thiết kế ban đầu bởi: AI theo giao việc A-05.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `blocked` (blocked on Owner G7 registry; design/contract only). PR: chưa có.

## Before coding

Owner trả lời Q7 (giữ ở catalog qua Hook hay chuyển sang G7); sổ thiết bị có hồ sơ thiết bị và người giữ.

## Tasks

### Task 1: đích gắn hồ sơ thiết bị cho mục đích bản ký

- Files: `catalog/contract/*` (tài liệu), `catalog/public/catalog.extension-points.ts` (Hook mới nếu Q7 chọn catalog).
- Depends on: Q7; blocker G7 gỡ.
- Acceptance: `US-04-04` AC-8 như spec.
- Verify: `pnpm check`; integration PostgreSQL tài liệu; `pnpm test:http`, `pnpm openapi:export`.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | blocked on Owner G7     |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

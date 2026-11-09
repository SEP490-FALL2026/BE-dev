# Plan: cảnh báo vi phạm số thiết bị trên một khóa K4

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: AI theo giao việc A-05. Thiết kế ban đầu bởi: AI theo giao việc A-05.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `blocked` (blocked on Owner G7 registry; design/contract only). PR: chưa có.

## Before coding

Owner trả lời Q3; `a05-k4-key-grant-by-device` đã ghi lần cài; mã sự kiện inbox thống nhất với A-03.

## Tasks

### Task 1: cảnh báo vượt số cài đặt

- Files: `licensing/device-binding/*`, `licensing/license-key/*`, listener/consumer inbox theo A-03.
- Depends on: `a05-k4-key-grant-by-device`; `g4-notification-delivery` (kênh F58).
- Acceptance: cả hai vế `US-04-11` AC-10 như spec; không cảnh báo trùng.
- Verify: `pnpm check`; integration PostgreSQL.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | blocked on Owner G7     |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

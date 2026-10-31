# Plan: thu hồi K4 — gỡ kích hoạt khóa, về kho hoặc ngừng dùng theo điều khoản, và đối chiếu thiết bị

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: AI theo giao việc A-05. Thiết kế ban đầu bởi: AI theo giao việc A-05.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `blocked` (blocked on Owner G7 registry; design/contract only). PR: chưa có.

## Before coding

Owner trả lời Q4, Q5; `a05-k4-key-grant-by-device` đã có khóa gán và lần cài; phối hợp Dev B cho `requests/return-request`.

## Tasks

### Task 1: điều khoản cho chuyển máy (nếu Owner chọn cờ ở điều khoản gói)

- Files: `catalog/plan-terms/*`, migration của catalog.
- Depends on: Q4.
- Acceptance: cờ ghi/đọc được, audit trước/sau; gói không K4 không có cờ.
- Verify: `pnpm check`; integration plan-terms.

### Task 2: hoàn tất thu hồi K4 và mở thu hồi K4 từ mọi nguồn

- Files: `licensing/provisioning/revocation.policy.ts`, `licensing/provisioning/revocation-completion/*`,
  `licensing/license-key/*`, `personnel/offboarding/offboarding.policy.ts`, `personnel/transfer-review/*`,
  `requests/return-request/return-request.policy.ts` (Dev B).
- Depends on: Task 1 hoặc mặc định Q4; `a05-k4-key-grant-by-device`.
- Acceptance: `US-04-12` AC-7, AC-8; `US-07-05` AC-6, AC-7; vế K4 `US-03-04` AC-16.
- Verify: `pnpm check`; integration PostgreSQL thu hồi/nghỉ việc; `pnpm test:http`, `pnpm openapi:export`.

### Task 3: đối chiếu khi sổ thiết bị đổi

- Files: facade licensing (method mới) hoặc listener theo Q1/Q5; `licensing/device-binding/*`.
- Depends on: Q1, Q5; Task 2.
- Acceptance: kết quả `checkBinding` khác `IN_ORDER` ⟹ cảnh báo IT Admin, không tác vụ thu hồi.
- Verify: integration với sổ thật.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | blocked on Owner G7     |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

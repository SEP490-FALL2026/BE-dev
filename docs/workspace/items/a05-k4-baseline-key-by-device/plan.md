# Plan: dòng K4 của hiện trạng seat khởi tạo — một khóa trong kho kèm thiết bị công ty

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: AI theo giao việc A-05. Thiết kế ban đầu bởi: AI theo giao việc A-05.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `blocked` (blocked on Owner G7 registry; design/contract only). PR: chưa có.

## Before coding

Sổ thiết bị G7 có public API; Owner trả lời Q6 và cách nêu khóa trong file baseline; migration của
`a05-k4-key-grant-by-device` đã có.

## Tasks

### Task 1: dòng K4 trong preview và xác nhận seat baseline

- Files: `data-import/seat-baseline-import/*`, `licensing/assignment/baseline-target.policy.ts`,
  `licensing/public/licensing-seat-baseline.api.ts`, adapter port sổ thiết bị.
- Depends on: `a05-k4-key-grant-by-device` Task 1; blocker G7 gỡ.
- Acceptance: vế K4 của `US-02-05` AC-11 như spec.
- Verify: `pnpm check`; integration PostgreSQL seat baseline; `pnpm test:http`, `pnpm openapi:export` nếu đổi wire.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | blocked on Owner G7     |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

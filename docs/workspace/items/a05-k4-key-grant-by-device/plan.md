# Plan: cấp khóa K4 từ kho kèm thiết bị công ty đã đăng ký

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: AI theo giao việc A-05. Thiết kế ban đầu bởi: AI theo giao việc A-05.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `blocked` (blocked on Owner G7 registry; design/contract only). PR: chưa có.

## Before coding

Xác nhận sổ thiết bị G7 có public API và adapter pass contract của
[`a05-k4-device-registry-contract`](../a05-k4-device-registry-contract/spec.md); Owner đã trả lời Q1, Q2, Q8. Viết lại ma
trận test chi tiết trước code.

## Tasks

### Task 1: migration gán khóa và lần cài

- Files: `prisma/models/licensing.prisma`, migration mới (`license_keys.assignment_id`, `license_key_installations`).
- Depends on: blocker G7 gỡ; Owner chốt FK sang bảng thiết bị.
- Acceptance: một assignment mở mỗi khóa (unique partial); một lần cài mở mỗi cặp khóa–thiết bị; drift check sạch.
- Verify: `prisma migrate deploy` trên DB riêng + `prisma migrate diff --exit-code`.

### Task 2: cấp K4 trong transaction có khóa

- Files: `licensing/provisioning/tasks/*`, `licensing/provisioning/provisioning.policy.ts`, `licensing/license-key/*`,
  adapter port sổ thiết bị.
- Depends on: Task 1.
- Acceptance: `US-07-01` AC-10, `US-04-12` AC-5, AC-6, `US-07-02` AC-4 (vế K4) như spec.
- Verify: `pnpm check`; integration PostgreSQL (kể cả đồng thời); `pnpm test:http`, `pnpm openapi:export`.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | blocked on Owner G7     |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

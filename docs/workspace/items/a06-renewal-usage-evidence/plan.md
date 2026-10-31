# Plan: khung — gia hạn subscription dùng evidence sử dụng (G7 của Owner)

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: Dev A khi gỡ blocker. Thiết kế ban đầu bởi: AI theo giao việc A-06.
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `blocked`. PR: chưa có.

## Before coding

Chờ contract evidence G7 của Owner. Không code trước khi có revision.

## Tasks

### Task 1: reader evidence G7

- Files: listener ở module của Owner thêm vào `RenewalUsageContributions`; `alerts/renewal-alerts.service.ts`, `subscription-renewal.dto.ts`.
- Depends on: contract G7.
- Acceptance: `US-11-01` AC-3, `US-11-02` AC-20, `US-11-05` AC-4 (vế usage).
- Verify: integration theo revision G7 thật.

### Checkpoint

Gate theo CONTRIBUTING khi mở khung.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | chờ G7                  |

- [ ] AC trong scope có bằng chứng.
- [ ] Owner review.

# Plan: a10-background-jobs-board

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: chưa giao. Owner review: chưa review. Peer review: chưa có.
- Triển khai: `blocked`. PR: chưa có.

## Before coding

Chờ Owner chốt định nghĩa/nguồn "tác vụ nền" (spec `## Dependencies and blockers`). Không code trước khi gỡ.

## Tasks

### Task 1: nối nguồn "tác vụ nền" vào trang Super Admin

- Files: `src/modules/dashboards/super-admin/*`, facade của module giữ dữ liệu (chưa biết).
- Depends on: quyết định Owner.
- Acceptance: mục `backgroundJobs` có số khớp list nguồn trong phạm vi Super Admin.
- Verify: integration `test/integration/dashboards/dashboards-http.integration-spec.ts` → xanh.

### Checkpoint

Gate như [a10-operational-dashboards](../a10-operational-dashboards/plan.md).

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | blocked                 |

- [ ] AC trong scope có bằng chứng.
- [ ] Giao Owner review; cập nhật roadmap.

# Plan: a10-super-admin-dashboard

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1` + diff `A-02`.
- Phụ trách: AI implementer (Dev A `A-10`). Owner review: chưa review. Peer review: chưa có.
- Triển khai: `verified` (local). PR: chưa có.

## Before coding

- Đọc `department-query.service.ts` (`warnings`), `onboarding.service.ts` (luật IT Admin dùng được), `notice.dto.ts`,
  `super-admin-watch.controller.ts`, `congestion.controller.ts`, `approval-roles.controller.ts`, `app-users.controller.ts`.
- Phụ thuộc: umbrella Task 1; `a10-manager-dashboard` Task 1.

## Tasks

### Task 1: trang Super Admin

- Files: `src/modules/dashboards/super-admin/*` (+ `super-admin-dashboard.service.spec.ts`), personnel `noticesAwaitingHandling`.
- Depends on: umbrella Task 1.
- Acceptance: hai số phòng như `departmentWarningList`; thông báo chờ; tác vụ nền thiếu nguồn; không mục tiền/seat/duyệt.
- Verify: `pnpm exec jest src/modules/dashboards/super-admin` → xanh.

### Task 2: contract + integration

- Files: chung với umbrella.
- Depends on: Task 1.
- Acceptance: test matrix của spec.
- Verify: `pnpm test:http`, integration suite của umbrella → xanh.

### Checkpoint

Gate như umbrella; tự review diff theo AC-7.

## Verification and handoff

| Lệnh / kiểm tra AC                                  | Revision / môi trường       | Kết quả thực chạy                | Giới hạn / việc còn lại |
| --------------------------------------------------- | --------------------------- | -------------------------------- | ----------------------- |
| `pnpm exec jest src/modules/dashboards/super-admin` | Node 24.0.2                 | 2 test đạt                       | —                       |
| integration `dashboards-http.integration-spec.ts`   | Docker `slm-test-a10` PG 17 | 1 test của trang Super Admin đạt | tác vụ nền chờ Owner    |

- [x] AC trong scope có bằng chứng; phần thiếu nguồn ghi blocker.
- [ ] Giao Owner review (roadmap đã có dòng hạng mục); PR chưa có.

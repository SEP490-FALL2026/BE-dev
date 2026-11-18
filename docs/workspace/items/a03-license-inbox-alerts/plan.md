# Plan: cảnh báo license vào hộp thông báo (F58)

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: AI theo giao việc A-03 của Dev A. Thiết kế ban đầu bởi: AI theo giao việc A-03.
- Owner review: chưa review. Peer review: chưa có (người điều phối giao reviewer).
- Triển khai: `verified` (local, worktree worktree cô lập, chưa commit). PR: chưa có.

## Before coding

Đã đọc AGENTS.md, rules `security-jobs`, `module-structure`, prompt 01/03, DEV-A A-03, README (`RA-06`, điều kiện bàn giao),
khung `g4-notification-delivery`, BRD `FR-5.14`, `US-12-15` và Story nguồn. Kiểm điểm phát đã có trước khi code
(spec mục _Dependencies and blockers_): dòng 3, 12, 13, 38 có điểm phát; dòng 17, 26 không có (blocker G7); `US-07-02` AC-1,
`US-07-04` AC-6, AC-13 đã có phép chiếu ở `requests/status`.

## Tasks

### Task 1: bảng mã đóng và chính sách cảnh báo

- Files: `src/modules/notifications/public/notifications.types.ts`, `src/modules/notifications/inbox/inbox.policy.ts` (+ spec),
  `src/modules/licensing/licensing-alerts.policy.ts` (+ spec), `src/modules/licensing/licensing-alerts.service.ts`,
  `src/modules/organization/public/organization.api.ts`, `src/modules/licensing/licensing.module.ts`.
- Depends on: none.
- Acceptance: 6 mã mới với khóa tham số; khóa sự kiện theo sự thật được báo; người nhận lọc trùng, bỏ vai trống, IT Admin chỉ
  khi còn dùng được; không khóa nào mang tên/định danh/ghi chú.
- Verify: `pnpm exec jest src/modules/licensing/licensing-alerts.policy.spec.ts src/modules/notifications/inbox/inbox.policy.spec.ts` → xanh.

### Task 2: E1 nhắc T−7 vào hộp thông báo

- Files: `src/modules/licensing/expiry/expiry-reminder.service.ts`, `test/integration/licensing/license-expiry-inbox.integration-spec.ts`.
- Depends on: Task 1.
- Acceptance: `US-03-05` AC-1 vế hộp thông báo; ngày biên; chạy lại; phòng thiếu trưởng phòng; IT Admin mất vai; gia hạn.
- Verify: integration `license-expiry-inbox` + `assignment-expiry-reminders` (không hồi quy) → xanh.

### Task 3: E2–E4 bàn giao, tài khoản dịch vụ, K1 của người nghỉ

- Files: `src/modules/licensing/handover/handover-alert.service.ts`, `handover-issue.service.ts`, `handover-overdue.service.ts`,
  `src/modules/licensing/assignment/service-account-duty/service-account-duty.service.ts`,
  `src/modules/licensing/public/licensing-service-account.api.ts`,
  `src/modules/personnel/service-account/service-account-duty.listener.ts`,
  `src/modules/licensing/provisioning/revocation-completion/revocation-completion.service.ts`,
  `test/integration/licensing/license-handover-inbox.integration-spec.ts`.
- Depends on: Task 1.
- Acceptance: dòng 12, 13, 38 theo ma trận spec (người nhận, chạy lại, hủy/xác nhận/chỉ định, thiếu trưởng phòng, thiếu IT Admin).
- Verify: integration `license-handover-inbox` + hồi quy handover/service-account/revocation/personnel/notifications → xanh.

### Task 4: tài liệu và bàn giao

- Files: spec/plan của hạng mục này, `docs/workspace/items/g4-notification-delivery/spec.md`, `plan.md`,
  `docs/workspace/items/g6-downstream-integration/spec.md`, `docs/workspace/items/README.md`, `rules-check.config.json`,
  `docs/rules/security-jobs.md`, `src/modules/licensing/README.md`, `src/modules/notifications/README.md`,
  `src/modules/organization/README.md`.
- Depends on: Task 2, Task 3.
- Acceptance: tiếp quản ghi rõ, lịch sử giữ; scope map G4/G6 và dòng hạng mục ở `docs/roadmap.md`.
- Verify: `pnpm rules:check`, `pnpm rules:format` → xanh.

### Checkpoint

Sau Task 3: typecheck, lint, unit, gates, arch:check xanh; integration của hạng mục xanh.

## Verification and handoff

| Lệnh / kiểm tra AC                                               | Revision / môi trường                               | Kết quả thực chạy                                         | Giới hạn / việc còn lại                                              |
| ---------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| lệnh của hạng mục (unit, integration `license-*-inbox`, hồi quy) | `6eb12d1` + diff chưa commit, Docker `slm-test-a03` | kết quả ghi trong phiên, không có file báo cáo trong repo | chạy lại trên cây tích hợp; full integration do người điều phối chạy |

- [x] AC trong scope có bằng chứng; dòng 17, 26 ghi blocker G7.
- [x] Spec/plan/test design phản ánh implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành cập nhật.
- [ ] Giao Owner review trên revision cụ thể (roadmap đã có dòng hạng mục và scope map).

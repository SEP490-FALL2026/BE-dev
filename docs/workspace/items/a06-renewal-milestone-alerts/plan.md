# Plan: gia hạn subscription — mốc báo hủy T−15/T−7 và cảnh báo chất lượng dữ liệu hợp đồng

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: AI theo giao việc A-06. Thiết kế ban đầu bởi: AI theo giao việc A-06.
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `verified` (local, chưa commit; bằng chứng từ worktree cô lập tại `6eb12d1`). PR: chưa có.

## Before coding

`deriveNotice`/`alertDates` của catalog đã là nguồn mốc; tham số `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE` mặc định `[15, 7]`;
`NotificationsApi.notifyInApp` idempotent theo `event_key`; mẫu sweeper của `ExpiryReminderSweeper`.

## Tasks

### Task 1: chọn mốc và người nhận (thuần)

- Files: `src/modules/licensing/subscription-renewal/alerts/renewal-alerts.policy.ts` (+ spec).
- Depends on: none.
- Acceptance: AC-1, AC-2, AC-7, AC-8, AC-10, AC-11 ở mức quyết định.
- Verify: `pnpm exec jest src/modules/licensing/subscription-renewal/alerts` → xanh.

### Task 2: pass hằng giờ và thông báo

- Files: `alerts/renewal-alerts.service.ts`, `subscription-renewal-sweep.service.ts`, `subscription-renewal.job.ts`,
  `subscription-renewal-parties.service.ts`, `subscription-renewal-notifier.service.ts`, notifications codes,
  `organization/public/organization.api.ts` (`getItAdminInChargeOfDepartment`).
- Depends on: Task 1, `a06-renewal-proposal-decision` Task 3.
- Acceptance: AC-1→AC-14 trừ vế ngoài scope.
- Verify: `pnpm test:integration -- test/integration/licensing/subscription-renewal-sweep.integration-spec.ts` → 8/8.

### Checkpoint

`pnpm typecheck`, `pnpm arch:check`, `pnpm test:gates`, unit + integration của pass.

## Verification and handoff

| Lệnh / kiểm tra AC                       | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ---------------------------------------- | --------------------- | ----------------- | ----------------------- |
| unit `renewal-alerts.policy.spec`        | worktree cô lập       | xanh              | —                       |
| integration `subscription-renewal-sweep` | Docker `slm-test-a06` | 8/8               | thư điện tử chưa làm    |

- [x] AC trong scope có bằng chứng; phần còn lại ghi ở `a06-renewal-usage-evidence`, `a06-renewal-open-inputs`.
- [x] Spec/plan phản ánh implementation.
- [x] Diff đã tự review.
- [ ] Owner review; chưa `accepted`.

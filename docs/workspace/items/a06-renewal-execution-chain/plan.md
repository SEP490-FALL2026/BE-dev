# Plan: gia hạn subscription — kết quả thực hiện, kỳ nối chuỗi, phần vượt, tiết kiệm và cờ thực hiện trễ

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: AI theo giao việc A-06. Thiết kế ban đầu bởi: AI theo giao việc A-06.
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `verified` (local, chưa commit; bằng chứng từ worktree cô lập tại `6eb12d1`). PR: chưa có.

## Before coding

Trigger Assignment hiện hành (`license_assignment_reject_change`: chỉ `valid_until`, `expected_end_date` đổi; capacity `INV-01`
khi thêm; không chồng thời gian theo subscription) cho phép chuyển ghế bằng một dòng mới + kết thúc dòng cũ cùng ngày; cần thêm
giá trị `RENEWAL_CARRY` và sửa CHECK `license_assignments_handover_names_predecessor` từ định nghĩa mới nhất (`20261024090200`).

## Tasks

### Task 1: chuỗi kỳ và ghế chuyển ở DB

- Files: migration `20261101000000`, `20261101000100`, phần CHECK cuối của `20261101000200`.
- Depends on: none.
- Acceptance: enum riêng; `renewed_from_id` unique + trigger; `RENEWAL_CARRY` phải có predecessor.
- Verify: drift check `No difference detected`; integration outcome (1) unique.

### Task 2: ghi kết quả và chuyển ghế

- Files: `outcome/renewal-outcome.{service,policy}.ts` (+ spec), `subscription-renewal-seat.repo.ts`,
  catalog `subscription-period.service.ts`, `licensing/public/licensing.types.ts` (`AssignmentSource`),
  `assignment/assignment.dto.ts`, `department-tools/department-tools.controller.ts` (enum wire).
- Depends on: Task 1, `a06-renewal-proposal-decision` Task 4.
- Acceptance: AC của spec.
- Verify: `pnpm test:integration -- test/integration/licensing/subscription-renewal-outcome.integration-spec.ts` → 6/6.

### Task 3: cờ thực hiện trễ

- Files: `deadline/renewal-deadline.{service,policy}.ts` (+ spec), `subscription-renewal-sweep.service.ts`.
- Depends on: Task 2.
- Acceptance: AC-13, AC-14, AC-20.
- Verify: sweep integration (6) xanh.

### Checkpoint

`pnpm typecheck`, `pnpm arch:check`, `pnpm test:gates`, `pnpm test:http -- test/http/platform`, integration gia hạn.

## Verification and handoff

| Lệnh / kiểm tra AC                                                 | Revision / môi trường | Kết quả thực chạy                                                         | Giới hạn / việc còn lại                        |
| ------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| unit `renewal-outcome.policy.spec`, `renewal-deadline.policy.spec` | worktree cô lập       | xanh                                                                      | —                                              |
| integration `subscription-renewal-outcome`                         | Docker `slm-test-a06` | 6/6                                                                       | biến thể thu hồi đóng thất bại chưa test riêng |
| integration catalog + licensing liên quan                          | như trên              | 547/548 (1 test CLI khóa hàng chạy song song chập chờn, chạy riêng 11/11) | —                                              |

- [x] AC trong scope có bằng chứng.
- [x] Spec/plan phản ánh implementation.
- [x] Diff đã tự review.
- [ ] Owner review; chưa `accepted`.

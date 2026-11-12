# Plan: be-bugfix-2026-11-12 — sửa bug BE (BUG-A, BUG-B)

- [Spec](spec.md); revision đầu vào: Docs `373bb6b`, BE `b71ed330`.
- Phụ trách: chat code (Sonnet). Thiết kế ban đầu bởi: Owner cùng AI điều phối (12–13/11/2026).
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `verified` local (13/11/2026, nhánh `feat/mf2-mf3`); chưa chạy full test. PR: chưa có.

## Before coding

Đã đọc AGENTS.md, ARCHITECTURE.md, SPEC v1.2 và PLAN v1.2 ở [reviews](../../../reviews/be-bugfix-2026-11-12/PLAN.md) (§0 là quy trình bắt buộc), `OWNER-REVIEW.md`.

## Tasks

Danh sách task, file và lệnh verify chi tiết nằm ở [PLAN](../../../reviews/be-bugfix-2026-11-12/PLAN.md) (gói BUG-A: A1–A3; gói BUG-B:
BB-1…BB-16, BO-DEL-1…3) và kết quả từng task ở [HANDOFF-CODE](../../../reviews/be-bugfix-2026-11-12/HANDOFF-CODE.md). Không chép lại để khỏi lệch.

### Task 1: BUG-A và BUG-B theo PLAN chi tiết

- Files: theo PLAN §2–§3.
- Depends on: none.
- Acceptance: điều kiện xong D1–D7 của SPEC §1.
- Verify: quick check từng task, `pnpm test:gates` và `pnpm rules:check` cuối mỗi gói → xanh.

### Checkpoint

Sau mỗi gói: gate cuối gói xanh, tự review diff theo SPEC.

## Verification and handoff

Full test (`pnpm check`, `pnpm test:http`, `pnpm test:integration`, `pnpm test:flows`) và `pnpm seed:local` chạy một lần ở pha cuối chung.

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| Xem HANDOFF-CODE   | `feat/mf2-mf3`        | xem HANDOFF-CODE  | full test ở pha cuối    |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh đúng implementation cuối.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR.

# P5-A2 — sửa lỗi + email + collector + tham số (chat "SEP-Start 85: P5-A2 fixes")

Đọc và làm theo `D:\FPT\FALL2026\Code\verify-logs\p5\P5-COMMON.md` trước. Tên báo cáo: `A2-DONE.md`, mã chat `A2`.

| Mục | Giá trị |
| --- | ------- |
| Worktree / nhánh | `D:\FPT\FALL2026\Code\be-p5-a2` / `feat/p5-a2-fixes` |
| Spec | `D:\FPT\FALL2026\Code\BE-dev-software-license-management\docs\reviews\p5-2026-11-17\SPEC-5A-FIXES.md` (§2 plan) |
| Migration | `20261117100000`–`20261117100900` (`…100000_drop_zbb_parameters`) |
| DB test | `make-test-db.sh slm-p5-a2 35442` |

Thứ tự:
1. **Lõi trước:** FX-T1, T2, T7, T3a, T3b (Q-5A-1 = B: một thông báo `SPEND_BATCH_SUBMITTED` mỗi lô), T8, T9a, T9b, T10.
2. Lõi xong ⟹ chạy bộ kiểm cuối nhánh + push + CI xanh ⟹ `SendMessage` dòng đầu `A2 TỚI MỐC LÕI` (commit, link CI). **Chat B đang chờ mốc
   này** để làm Phase E. Điều phối merge lõi vào `feat/p5`; bạn **làm tiếp** trên cùng nhánh.
3. Sau lõi nếu còn thời gian: FX-T6a–c, T4a, T4b, T5, T9c, T11; xong ⟹ `A2 XONG`.

**A2-12 = KHÔNG làm** (Owner chốt 17/11 đêm): không chặn `ghostSeatOptimizationSummaryGet`, `ghostSeatRuleSkipList` theo phòng; để 4b.
Q-5A-2 = A.

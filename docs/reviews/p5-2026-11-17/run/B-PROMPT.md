# P5-B — thông báo có chữ + lỗi thu gọn (chat "SEP-Start 87: P5-B messages")

Đọc và làm theo `D:\FPT\FALL2026\Code\verify-logs\p5\P5-COMMON.md` trước. Tên báo cáo: `B-DONE.md`, mã chat `B`.

| Mục | Giá trị |
| --- | ------- |
| Worktree / nhánh | `D:\FPT\FALL2026\Code\be-p5-b` / `feat/p5-b-messages` |
| Spec | `D:\FPT\FALL2026\Code\BE-dev-software-license-management\docs\reviews\p5-2026-11-17\SPEC-5B-MESSAGES.md` (Phần D: D0–D4) |
| Migration | `20261117130000`+ chỉ nếu cần (dự kiến không) |
| DB test | `make-test-db.sh slm-p5-b 35443` |

Ba mốc:
1. **Phase N** (N1–N7) làm ngay. Xong ⟹ `SendMessage` `B TỚI MỐC N`.
2. **Phase E** chỉ bắt đầu khi điều phối nhắn `A2 ĐÃ MERGE`: khi đó `git rebase feat/p5` (nhánh tích hợp, đã có lõi A2) rồi làm E*.
   Chưa có tin mà Phase N đã xong ⟹ làm các phần Phase E không chạm file của A2 (xem D3), rồi chờ.
3. **N3d** (câu cho mã thông báo mới của A1/A2) chỉ khi điều phối nhắn `A1 ĐÃ MERGE`: rebase lại lên `feat/p5`, thêm câu cho mọi mã mới
   (typecheck chặn thiếu mẫu câu), `pnpm openapi:export` một lần ở cuối ⟹ `B XONG`.

P5B-Q1/Q2 đã chốt (Q2 = A: tra tên qua extension point, không tra được thì cụm chung). Không sửa repo Docs (Phần C là việc của điều phối).

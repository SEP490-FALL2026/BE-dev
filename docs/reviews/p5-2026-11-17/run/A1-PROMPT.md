# P5-A1 — SBF-20 (chat "SEP-Start 86: P5-A1 SBF-20")

Đọc và làm theo `D:\FPT\FALL2026\Code\verify-logs\p5\P5-COMMON.md` trước. Tên báo cáo: `A1-DONE.md`, mã chat `A1`.

| Mục | Giá trị |
| --- | ------- |
| Worktree / nhánh | `D:\FPT\FALL2026\Code\be-p5-a1` / `feat/p5-a1-sbf20` |
| Spec | `D:\FPT\FALL2026\Code\BE-dev-software-license-management\docs\reviews\p5-2026-11-17\SPEC-5A-SBF20.md` (§11 PLAN: S20-T1…T7, T9a, T9b, T8) + **đọc trước** `REVIEW-SPECS-2-SBF20.md` |
| Migration | `20261117110000`–`20261117110900` |
| DB test | `make-test-db.sh slm-p5-a1 35441` |

Lưu ý:
- `S20-Q4` = A (Owner chốt) ⟹ làm S20-T9b (3 tham số 7/30/7). Q1/Q2/Q3 = A.
- **R2-8 = làm `S20-T4c`** (Owner chốt 17/11 đêm): kỳ kế tiếp là kho mà `SEAT_CAPACITY` ⟹ `addPoolSeat(next)` rồi mang lại (`QĐ-110v`, `QĐ-103q`), test ghim ca Request duyệt sau khi IT đã ghi điểm điều chỉnh.
- **Checkpoint bắt buộc sau S20-T4:** `prisma migrate deploy` trên DB trống + `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`
  + integration licensing/catalog chạm; ghi kết quả vào báo cáo.
- Viết lại flow `test/flows/mf5-rightsizing*.flow-spec.ts` và `test/flows/f0-auth-roles.flow-spec.ts` (đang gọi route gia hạn cũ); chạy
  `pnpm test:flows` cho các file đó. Seed không gọi route gia hạn — không sửa seed.
- Báo cáo ghi rõ: migration đóng ca `PROPOSED` cũ thành `STALE` ⟹ cần seed lại VPS sau deploy; ảnh hưởng FE theo vai (IT Admin/trưởng phòng/Finance/
  Người duyệt chi/Super Admin) theo §5 spec.

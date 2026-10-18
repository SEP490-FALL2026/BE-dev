# Plan: US-01-09 — chuyển giao và khôi phục vai Super Admin

- [Spec](spec.md); revision đầu vào: Docs `3341ea0`, BE `e833092` (nhánh `Bao_Dev`, cây làm việc chưa commit).
- Phụ trách: AI theo giao việc Owner (16/10/2026). Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: **verified** (local, 16/10/2026). Sau đó commit `4ead859`, vào `dev` qua PR #11 (`eae212a`) — `merged-dev`, chưa review/nghiệm thu; gate trên HEAD `186ad5f` chạy xanh ở [audit 18/10](../../../reviews/be-foundation-audit-2026-10-18/README.md). Remote CI chưa chạy.
- _18/10/2026:_ `US-01-10` AC-10 (quên mật khẩu khi đang khôi phục) không do lát này chứng minh; [H3c](../h3c-forgot-password-during-recovery/plan.md#verification-and-handoff) thêm 5 ca vào suite `super-admin-recovery` (nay 31 test), sửa `password-reset.service.ts` + `recovery.repo.ts`, `verified` local, chưa commit. Bảng dưới (26 test) là bằng chứng của lát gốc, giữ làm lịch sử.

## Các bước nhỏ

- [x] **Bước 1 — Chuyển giao (AC-1 → AC-8).** `accounts/super-admin-transfer.service.ts`, `super-admin-transfers.controller.ts`, `successor-eligibility.ts` (điều kiện dùng chung), `dto/super-admin-transfer.dto.ts`; trigger CSDL từ chối cấp `SUPER_ADMIN` cho trưởng phòng/người giữ vai duyệt (migration `20261016190000_super_admin_exclusions`).
- [x] **Bước 2 — Dữ liệu khôi phục.** Migration `20261016210000_super_admin_recovery`: `RECOVERY_VERIFIED`, `recovery_tickets` (khóa duy nhất `(organization_id, ticket_ref)`), cột `recovery_ticket_id`, `new_login_email`, `new_normalized_login_email` trên `account_action_tokens`; model `RecoveryTicket` trong `identity-access.prisma`, `PRISMA_MODEL_OWNER`.
- [x] **Bước 3 — Use case khôi phục.** `recovery.service.ts` (ba chế độ), `recovery.repo.ts`, `recovery.errors.ts`, `recovery.module.ts`; `auth/action-token.ts` (băm/sinh mã dùng chung với `TokenService`); `auth/password-reset.service.ts` hoàn tất phiếu và áp email mới khi mở liên kết.
- [x] **Bước 4 — Lệnh.** `src/recovery-cli.ts`, `src/recovery-cli.module.ts`, `recovery.arguments.ts` (tách tham số, từ chối mật khẩu/mã/liên kết theo tên); script `pnpm ops:recover` chạy bản build (cần `pnpm build`).
- [x] **Bước 5 — Test.** unit `recovery.arguments.spec`; integration `super-admin-transfer-http` (chuyển giao), `super-admin-recovery` (26 test, qua `RecoveryCliModule` trên CSDL dùng một lần, mở liên kết bằng route thật), `recovery-cli` (tiến trình con: `--help`, từ chối theo tên, thiếu môi trường); e2e `super-admin-transfer`; manifest API.
- [x] **Bước 6 — Tài liệu.** ARCHITECTURE (đồ thị module lệnh), roadmap, bảng phủ.

Lưu ý khóa: thứ tự Employee (theo id) → AppUser (theo id) → phiếu; phiếu được khóa `FOR UPDATE` ngay sau khi tạo (`INSERT … ON CONFLICT DO NOTHING` rồi `SELECT … FOR UPDATE`) nên hai lần chạy cùng phiếu gặp nhau tại đó. Chuyển vai đã hoàn tất được nhận ra **trước** kiểm "người được nêu có đang giữ vai" vì sau khi vai đã chuyển thì người được nêu không còn là người giữ.

## Kiểm chứng và bàn giao

| Lệnh / kiểm tra AC                 | Revision / môi trường             | Kết quả thực chạy                                                                                                                                      | Giới hạn / việc còn lại                                                                         |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `pnpm test`, `pnpm test:e2e`       | `e833092` + cây làm việc, Windows | PASS (xem "Cổng cuối" ở roadmap)                                                                                                                       | —                                                                                               |
| `jest … super-admin-recovery`      | như trên, PostgreSQL 17 Docker    | 26 test PASS; đột biến: bỏ thu hồi phiên ⟹ 2 test đỏ; bỏ lối tắt "chuyển vai đã hoàn tất" ⟹ 1 đỏ; bỏ kiểm tách quyền ⟹ 1 đỏ — mỗi đột biến đã hoàn lại | Chưa chạy lệnh trên CSDL/hộp thư dùng chung; thư thật chưa gửi (worker SMTP ngoài phạm vi test) |
| `jest … recovery-cli`              | như trên                          | 4 test PASS (tiến trình con qua ts-node)                                                                                                               | Bản `dist` (`pnpm ops:recover`) chưa chạy tay trên PowerShell/shell Linux                       |
| `jest … super-admin-transfer-http` | như trên                          | PASS (gồm hai chuyển giao đồng thời, không `40P01`)                                                                                                    | AC-3 (c)(d) vế nghỉ phép/bàn giao dùng fixture; luồng thật ở G6                                 |

- [x] AC trong scope có bằng chứng; spec/plan phản ánh implementation cuối.
- [ ] Owner review trên revision cụ thể. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

# Plan: lát G2 — cấu hình Người duyệt chi, người thay thế khi xung đột và approver dự phòng

- [Spec](spec.md); revision đầu vào: Docs `3341ea0`, BE `e833092` (nhánh `Bao_Dev`, cây làm việc chưa commit).
- Phụ trách: AI theo giao việc Owner (16/10/2026). Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: **verified** (local, 16/10/2026). Sau đó commit `4ead859`, vào `dev` qua PR #11 (`eae212a`) — `merged-dev`, chưa review/nghiệm thu; gate trên HEAD `186ad5f` chạy xanh ở [audit 18/10](../../../reviews/be-foundation-audit-2026-10-18/README.md). Remote CI chưa chạy.

## Các bước nhỏ

- [x] **Bước 1 — Dữ liệu.** `prisma/models/identity-access.prisma` (`ApprovalRole`, `ApprovalRoleHolder`), migration `20261016170000_approval_role_holders`, `PRISMA_MODEL_OWNER`.
- [x] **Bước 2 — Service, controller.** `src/modules/identity-access/approval-roles/` (`approval-role.repo.ts`, `approval-role.service.ts`, `approval-roles.controller.ts`, `approval-role.errors.ts`), `dto/approval-role.dto.ts`; đăng ký ở `IdentityAccessModule`; `resolveEffectiveRoles` thêm `SPENDING_APPROVER`; `JwtAccessTokenVerifier` đọc cùng lúc với `MANAGER`.
- [x] **Bước 3 — Test.** e2e `approval-roles.e2e-spec.ts`; integration `approval-roles-http.integration-spec.ts` (16 test); unit `account-policy.spec`; manifest API.
- [x] **Bước 4 — Tài liệu.** `pnpm openapi:export`, roadmap, bảng phủ.

Lưu ý khóa: advisory key `7300001` là khóa **đầu tiên** của giao dịch đổi vai duyệt; không lấy khóa khác trước nó.

## Kiểm chứng và bàn giao

| Lệnh / kiểm tra AC                  | Revision / môi trường             | Kết quả thực chạy                                                                | Giới hạn / việc còn lại |
| ----------------------------------- | --------------------------------- | -------------------------------------------------------------------------------- | ----------------------- |
| `pnpm test` (unit), `pnpm test:e2e` | `e833092` + cây làm việc, Windows | PASS (xem "Cổng cuối" ở roadmap)                                                 | —                       |
| `jest … approval-roles-http`        | như trên, PostgreSQL 17 Docker    | 16 test PASS; đột biến bỏ kiểm Super Admin + kiểm cặp làm 3 test đỏ rồi hoàn lại | Xác định lại bước (G5)  |

- [x] AC trong scope có bằng chứng; spec/plan phản ánh implementation cuối.
- [ ] Owner review trên revision cụ thể. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

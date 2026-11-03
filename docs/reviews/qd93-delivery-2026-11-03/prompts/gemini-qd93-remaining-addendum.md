BỔ SUNG cho câu lệnh "làm nốt các việc còn lại của QĐ-93" bạn đang chạy. Không làm lại từ đầu, không dừng việc đang
làm. Làm xong Việc 1–4 rồi làm tiếp Việc 5 dưới đây. Mọi luật cũ vẫn giữ, trừ luật 6 được thay như sau.

## Luật 6 (thay bản cũ "KHÔNG drop bảng nào")
Migration mới phải chạy được trên DB trống VÀ trên DB đã có bootstrap cùng dữ liệu demo `shared-demo-v1`. VPS là cài đặt
mới (không có dữ liệu cũ trước `QĐ-93`), nhưng có thể đã nạp demo. Chỉ được drop bảng hoặc cột ở Việc 5, và mỗi
migration drop phải có guard: còn dòng dữ liệu chặn thì `RAISE EXCEPTION`, không xóa âm thầm.

## Việc 5: Gỡ hẳn cơ chế và bảng cũ (khoảng 2–3 giờ, commit riêng, làm sau cùng)
VPS là cài đặt mới nên không có dữ liệu cũ cần chuyển đổi. Seed và dữ liệu demo đã không ghi vào các bảng này.

- **Người duyệt dự phòng / người thay thế, Phase B.** Plan: `docs/workspace/items/qd93-remove-fallback-substitute-approvers/plan.md`,
  Task 13. Task 12 (preflight) BỎ vì DB mới. Thay vào đó, guard nằm ngay trong migration: còn dòng
  `approval_role_holders`, hoặc còn bước chờ với lý do cũ hay đang đóng băng chờ chuyển đổi, thì `RAISE EXCEPTION`.
  - Migration: viết lại `role_grants_forbid_super_admin_for_heads_and_approvers()` từ định nghĩa hiện hành, sao cho
    trigger vẫn chặn Super Admin làm trưởng phòng. Gỡ trigger và hàm `approval_role_holders_distinct`, bảng
    `approval_role_holders`, enum `ApprovalRole`. Bỏ các giá trị enum chuyển tiếp chỉ dùng cho chuyển đổi (Postgres phải
    tạo lại type).
  - Code: gỡ nhánh REWAIT / đóng băng (`awaitsConversion`, `STEP_AWAITING_CONVERSION`), `everHeldSpendingApproverAmong`,
    các giá trị wire `NO_FALLBACK_APPROVER`, `FALLBACK_IS_REQUESTER`, `NO_CONFLICT_SUBSTITUTE`, và model Prisma
    `ApprovalRoleHolder` / `Employee.approvalRoles`. GIỮ nguyên `SPENDING_APPROVER_PARTY` và mọi hành vi hiện hành.
  - Test: test của cơ chế bị gỡ được xóa hoặc thay, kèm bảng "test cũ → test mới". Thêm
    `drop-approval-role-holders-migration.integration-spec.ts` gồm hai ca: guard dừng khi còn dòng chặn; khi sạch thì gỡ
    xong và vẫn chặn Super Admin làm trưởng phòng.
- **Dự án, phase 2.** Plan: `docs/workspace/items/qd93-remove-department-projects/plan.md`, Task 2.1–2.3. Drop cột
  `project_label`, bảng `projects` và `project_departments`, cùng model Prisma tương ứng. Bỏ `Project` /
  `ProjectDepartment` khỏi `PRISMA_MODEL_OWNER`. Codec của bản nháp vẫn bỏ qua khóa `projectLabel` cũ.
- Mỗi operation HTTP đổi hay giá trị wire bị bỏ thì cập nhật manifest, OpenAPI và `docs/generated` như luật 5. Sau Việc 5:
  chạy toàn bộ phần "Kiểm sau MỖI việc", thêm `pnpm prisma:validate`, và integration theo file cho các file migration
  cùng các file bị ảnh hưởng.
- Báo cáo cuối có thêm mục Việc 5: danh sách migration mới theo đúng thứ tự, bảng "test cũ → test mới".

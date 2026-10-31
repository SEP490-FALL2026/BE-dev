# Plan: IT Admin phụ trách phòng sửa trường hồ sơ nhân viên chính thức theo căn cứ HR

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` local (23/10/2026, cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026). PR: chưa có — chưa commit lúc ghi dòng này.

## Before coding

`g2-employee-intake-by-super-admin` đã có value object căn cứ HR; đối chiếu spec với BE revision lúc bắt đầu.

## Tasks

### Task 1: thao tác sửa trường chính thức

- Files: `organization/employee/*`, test integration mới (đề xuất `employee-maintenance-http.integration-spec.ts`), e2e
  route inventory, `test/support/api-coverage-manifest.ts`, `openapi.json` (sinh).
- Depends on: `g2-employee-intake-by-super-admin`.
- Acceptance: `US-02-02` AC-19.
- Verify: test đỏ trước (route chưa có); `pnpm check`; `pnpm test:e2e`; `pnpm test:integration`; `pnpm openapi:export`
  và review diff (một operation mới).

### Checkpoint

Gate xanh; ghi chú FE; cập nhật roadmap/scope map; Owner review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                                                 | Revision / môi trường                                                         | Kết quả thực chạy     | Giới hạn / việc còn lại                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------- |
| `pnpm exec jest --config test/config/jest.integration.cjs` các suite: `employee-maintenance-http` (21), e2e `employees`                                                                                                                                                                                                            | cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026 | xanh                  | Thông báo "tự thực thi" cho Super Admin chờ hộp thông báo (`g4-notification-delivery`). |
| Gate toàn cây trên cùng cây: `pnpm lint`, `tsc --noEmit`, `pnpm test` (unit 2.074 (141 suite)), `pnpm test:e2e` (839 (32 suite)), `pnpm test:integration` (112 suite, 1.429 test, gồm 4 test kho S3 thật trên LocalStack), `prisma migrate deploy` trên CSDL mới + `migrate diff --exit-code` (không lệch), `pnpm openapi:export`. | cùng cây                                                                      | xem kết quả trong câu | Remote CI chưa chạy; chưa Owner review.                                                 |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (xem giới hạn ở bảng trên).
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có (tùy chọn).
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.

**Prompt 29 (23/10/2026):** `P28-04` sửa — đổi loại nhân sự sang CONTRACTOR/FREELANCER/INTERN bị từ chối (422 `OPEN_ASSIGNMENT_NEEDS_EXPECTED_END`, không audit) khi còn Assignment mở thiếu ngày kết thúc; trigger PostgreSQL hai phía (migration `20261023110000`). `P28-05` (đổi email khi có lời mời/khôi phục đang mở) **giao G6** làm merge requirement; phần rộng `P28-15` là backlog. Chi tiết: [g0-g4-checkpoint-fix-forward](../g0-g4-checkpoint-fix-forward/spec.md).

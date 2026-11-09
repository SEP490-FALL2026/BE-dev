# Plan: Super Admin nhập hồ sơ nhân viên mới kèm căn cứ HR

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` local (23/10/2026, cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026). PR: chưa có — chưa commit lúc ghi dòng này.

## Before coding

- **Điểm Owner review (kiểm soát bù AC-17):** `QĐ-82i` đặt thông báo cho IT Admin phụ trách và trưởng phòng làm kiểm
  soát bù khi một vai vừa tạo hồ sơ vừa tạo tài khoản. Hộp thông báo trong ứng dụng chưa có (`g4-notification-delivery`
  `blocked`). Trước khi code, Owner chọn: (a) làm lát này, AC-17 chờ hộp thông báo, Audit Trail là dấu vết tạm; (b) kéo
  phần hộp thông báo tối thiểu lên trước; (c) giữ lát này tới khi có hộp thông báo. Đề xuất (a) vì code hiện hành đang
  trái baseline; không đưa revision lên `main`/production trước khi AC-17 có lời giải.
- Đối chiếu spec với BE revision lúc bắt đầu; đọc kết quả Prompt 08 cho `/employees`, `/employee-imports`.

## Tasks

### Task 1: value object căn cứ HR và quyền nhập tay

- Files: `organization/employee/*` (DTO, controller, service, mapper), facade `organization`, test
  `employee-manual-http.integration-spec.ts`, e2e `employees.e2e-spec.ts`, `test/support/api-coverage-manifest.ts`.
- Depends on: Owner chọn ở _Before coding_.
- Acceptance: `US-02-02` AC-14, AC-15 (actor mới), AC-16 (nhập tay), AC-18 (nhập tay).
- Verify: test đổi trước để đỏ trên code cũ; `pnpm check`; integration suite liên quan.

### Task 2: quyền và căn cứ HR cho import

- Files: `data-import/employee-import/*`, test `employee-imports-http`, `employee-import-seats-http`, `onboarding-http`,
  e2e `employee-imports.e2e-spec.ts`.
- Depends on: Task 1.
- Acceptance: `US-02-02` AC-1, AC-9, AC-12, AC-13, AC-16 (import), AC-18 (import); `US-02-03` AC-1.
- Verify: test đỏ-trước/xanh-sau; `pnpm test:e2e`; `pnpm test:integration`; `pnpm openapi:export` và review diff.

### Checkpoint

Gate xanh; ghi chú FE (vai và body đổi); cập nhật roadmap/scope map; Owner review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                                                 | Revision / môi trường                                                         | Kết quả thực chạy     | Giới hạn / việc còn lại                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec jest --config test/config/jest.integration.cjs` các suite: `employee-manual-http`, `employee-imports-http`, `employee-import-seats-http`, `onboarding-http`, e2e `employees`, `employee-imports`                                                                                                                        | cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026 | xanh                  | AC-17 (báo IT Admin phụ trách và trưởng phòng) chờ `g4-notification-delivery`: Audit Trail là dấu vết tạm; **không đưa revision lên `main`/production trước khi AC-17 có lời giải** (plan). Checklist khởi tạo vẫn chỉ IT Admin xem. FE/Mobile phải đổi vai và body. |
| Gate toàn cây trên cùng cây: `pnpm lint`, `tsc --noEmit`, `pnpm test` (unit 2.074 (141 suite)), `pnpm test:e2e` (839 (32 suite)), `pnpm test:integration` (112 suite, 1.429 test, gồm 4 test kho S3 thật trên LocalStack), `prisma migrate deploy` trên CSDL mới + `migrate diff --exit-code` (không lệch), `pnpm openapi:export`. | cùng cây                                                                      | xem kết quả trong câu | Remote CI chưa chạy; chưa Owner review.                                                                                                                                                                                                                              |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (xem giới hạn ở bảng trên).
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có (tùy chọn).
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.

**Prompt 29 (23/10/2026):** `P28-09` — guard production của AC-17 **giao G5** làm merge requirement (fail closed bằng kỹ thuật, không chỉ tài liệu); revision này vẫn không lên `main`/production trước đó. [g0-g4-checkpoint-fix-forward](../g0-g4-checkpoint-fix-forward/spec.md).

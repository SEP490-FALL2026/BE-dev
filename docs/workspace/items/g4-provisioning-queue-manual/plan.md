# Plan: hàng đợi cấp phát, giữ chỗ seat và kênh thủ công có bằng chứng (`US-07-01`, `US-07-02`)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `in-progress`. PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure (port nhiều bên dùng ở `<module>.ports.ts`), API/database rules, test guide, ADR-0013, `US-07-01` (AC-1→AC-17), `US-07-02` (AC-1→AC-7), `US-07-04` (ranh giới trạng thái lỗi), `US-01-11` (AC-1, AC-2, AC-4, AC-8), `US-01-05` AC-12, `baseline-impact-and-remediation` (M-26, M-29, M-30, M-34), các lát `g4-seat-baseline-import` (Assignment, khóa thuê bao, trigger `INV-01/02/07`) và `g3-standard-toolset` (mẫu phiên bản, quyền đọc). DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu `provisioning_tasks`

- Files: `prisma/models/licensing.prisma`, quan hệ ngược ở `organization.prisma`, migration `20261020220000_licensing_provisioning_tasks`, `src/architecture-boundaries.spec.ts`, `test/integration/provisioning-task-constraints.integration-spec.ts`.
- Depends on: `g4-seat-baseline-import` (bảng `license_assignments`).
- Acceptance: CHECK trạng thái ⟺ cột, `COMPLETED` cần bằng chứng không rỗng, unique `(assignment_id, kind)`, khóa ngoại, trigger bất biến cho `COMPLETED` và chặn xóa (`55000`).
- Verify: constraints đỏ trước migration, xanh sau; `prisma migrate diff` không khác biệt.

### Task 2: policy thuần

- Files: `src/modules/licensing/provisioning/provisioning.policy.ts`, `provisioning.policy.spec.ts`, `licensing.errors.ts`, `licensing.types.ts`.
- Depends on: Task 1 (kiểu và lỗi dùng chung của capability).
- Acceptance: bước theo kiểu cấp (K1, K2, K4, K5), kiểu được cấp (K3, K4 từ chối), bằng chứng và lý do (cắt, rỗng, quá dài), bảng chuyển trạng thái, hàng đợi chung, quy tắc tự thực thi, thuê bao theo kiểu cấp, tài khoản công ty.
- Verify: `pnpm exec jest src/modules/licensing/provisioning` đỏ trước, xanh sau.

### Task 3: facade và cổng

- Files: `licensing.ports.ts` (`GRANT_REQUEST_GATE`), `provisioning/refusing-grant-request-gate.service.ts`, `licensing.module.ts`, `assignment.service.ts` (`createFromRequest`), `organization.service.ts` + repo phòng (`getItAdminInCharge`), `identity-access.service.ts` + repo tài khoản (`countUsableItAdminsExcept`), `src/module-graph.spec.ts`, `src/architecture-structure.spec.ts` nếu gate yêu cầu.
- Depends on: Task 2.
- Acceptance: người phụ trách mặc định của phòng hiện tại (hoặc `null`), số IT Admin dùng được khác người thao tác, cổng mặc định từ chối; Assignment nguồn `REQUEST` ghi dưới khóa thuê bao, có audit.
- Verify: integration `provisioning-http` (qua service); unit của repo nếu cần.

### Task 4: repo, service, route

- Files: `provisioning-task.repo.ts`, `provisioning.service.ts`, `provisioning.dto.ts`, `provisioning.http-errors.ts`, `provisioning-tasks.controller.ts`, `licensing.module.ts`, `test/support/api-coverage-manifest.ts` (+6), `test/e2e/api-inventory.e2e-spec.ts` (121 → 127), `test/e2e/provisioning.e2e-spec.ts`, `test/integration/provisioning-http.integration-spec.ts` (+ harness nếu cần).
- Depends on: Task 1, Task 2, Task 3.
- Acceptance: sáu operation đúng bảng HTTP; mọi AC trong ma trận; Assignment, seat và Audit Trail đúng.
- Verify: e2e + integration; đột biến (bỏ khóa thuê bao, bỏ kiểm người nghỉ việc, bỏ kiểm tài khoản công ty, bỏ bằng chứng bắt buộc, cho Finance hoàn tất, bỏ ghi người phụ trách, tự thực thi không kiểm IT Admin khác) làm đỏ.

### Task 5: tài liệu và gate cuối

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này, `g4-request-and-transfer-integration` (điểm nối cổng).
- Depends on: Task 4.
- Acceptance: tài liệu khớp mã; `openapi.json` chỉ thêm sáu operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`, drift check migration.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | đang triển khai         |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối.
- [ ] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

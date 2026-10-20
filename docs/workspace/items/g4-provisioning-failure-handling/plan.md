# Plan: xử lý tác vụ cấp/thu hồi thất bại: thử lại, làm tay, đóng thất bại (`US-07-04`)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `in-progress`. PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide, ADR-0013, `US-07-04` (AC-1→AC-14 và bảng kết cục), `US-07-02` AC-6, `US-07-01` AC-5, AC-6, `parameter-definitions.ts` (`PROVISIONING_RETRY_COUNT`), lát `g4-provisioning-queue-manual` (bảng, vòng đời, khóa hàng tác vụ, quy tắc tự thực thi) và `g4-seat-baseline-import` (Assignment bất biến, ràng buộc khoảng thời gian). DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu của lỗi và đóng thất bại

- Files: `prisma/models/licensing.prisma`, migrations `20261020230000_licensing_provisioning_failure_values` và `20261020230100_licensing_provisioning_failure_handling`, `test/integration/provisioning-task-constraints.integration-spec.ts` (mở rộng), `test/integration/license-assignment-constraints.integration-spec.ts` (Assignment `Thất bại`).
- Depends on: `g4-provisioning-queue-manual`.
- Acceptance: CHECK trạng thái ⟺ cột sáu trạng thái, dòng `FAILED` cũ được điền, `CLOSED_FAILED` bất biến, Assignment `failed_at` ⟹ khoảng rỗng đặt một lần, khoảng rỗng không chiếm seat và không va chạm `INV-02`.
- Verify: constraints đỏ trước migration, xanh sau; `prisma migrate diff` không khác biệt.

### Task 2: chính sách phân loại và quyết định

- Files: `src/modules/licensing/provisioning/failure.policy.ts`, `failure.policy.spec.ts`, `provisioning.policy.ts` (bảng chuyển trạng thái), `licensing.errors.ts`, `licensing.types.ts`.
- Depends on: Task 1.
- Acceptance: giãn cách, phân loại theo loại lỗi và số lần, quyết định hiện có theo trạng thái và kênh, lý do và bằng chứng bắt buộc, trạng thái mới bị `claim`, `complete`, `report-failure` từ chối.
- Verify: `pnpm exec jest src/modules/licensing/provisioning` đỏ trước, xanh sau.

### Task 3: ghi lỗi của connector và ba quyết định

- Files: `provisioning-failure.service.ts`, `provisioning-decision.service.ts`, `provisioning-task-frame.service.ts`, `provisioning-task-view.service.ts` (tách khung và thẻ việc khỏi `provisioning.service.ts`), `provisioning-task.repo.ts`, `assignment.service.ts` (`closeFailed`) + `assignment.repo.ts`, `licensing-audit-event.ts` (tác nhân hệ thống), `licensing.module.ts`, `OperatingParametersModule` vào imports, `licensing.service.ts` nếu cần cho facade.
- Depends on: Task 2.
- Acceptance: lịch thử lại, hết lượt, ba quyết định, Assignment `Thất bại` nhả seat, tác vụ thu hồi không đụng Assignment, mọi ghi cùng giao dịch với audit.
- Verify: integration `provisioning-failure-http` (qua service rồi HTTP).

### Task 4: route, DTO, lỗi HTTP

- Files: `provisioning-tasks.controller.ts`, `provisioning.dto.ts`, `provisioning.http-errors.ts`, `test/support/api-coverage-manifest.ts` (+3), `test/e2e/api-inventory.e2e-spec.ts` (127 → 130), `test/e2e/provisioning.e2e-spec.ts`, `test/integration/provisioning-failure-http.integration-spec.ts`.
- Depends on: Task 3.
- Acceptance: ba operation đúng bảng HTTP; thẻ có các trường mới; mọi AC trong ma trận.
- Verify: e2e + integration; đột biến (cho quyết định ở trạng thái khác `FAILED`, bỏ lý do bắt buộc, bỏ bằng chứng chuyển tay, nhả seat khi đóng thu hồi, không nhả khi đóng cấp, không đọc tham số `PROVISIONING_RETRY_COUNT`, tự chuyển làm tay) làm đỏ.

### Task 5: tài liệu và gate cuối

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này, `g4-provisioning-queue-manual` (báo cáo lỗi tay giờ đi theo quyết định).
- Depends on: Task 4.
- Acceptance: tài liệu khớp mã; `openapi.json` chỉ thêm ba operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`, drift check migration.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | đang triển khai         |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối.
- [ ] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

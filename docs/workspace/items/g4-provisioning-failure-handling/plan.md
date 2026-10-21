# Plan: xử lý tác vụ cấp/thu hồi thất bại: thử lại, làm tay, đóng thất bại (`US-07-04`)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (cục bộ, 21/10/2026, cây làm việc chưa commit trên `5f3b2b3`, nhánh `Bao_dev_be`). PR: chưa có. Chưa Owner review.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide, ADR-0013, `US-07-04` (AC-1→AC-14 và bảng kết cục), `US-07-02` AC-6, `US-07-01` AC-5, AC-6, `parameter-definitions.ts` (`PROVISIONING_RETRY_COUNT`), lát `g4-provisioning-queue-manual` (bảng, vòng đời, khóa hàng tác vụ, quy tắc tự thực thi) và `g4-seat-baseline-import` (Assignment bất biến, ràng buộc khoảng thời gian). DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu của lỗi và đóng thất bại

- Trạng thái: đã làm (20/10/2026); mở rộng bởi Task 6.
- Files: `prisma/models/licensing.prisma`, migrations `20261020230000_licensing_provisioning_failure_values` và `20261020230100_licensing_provisioning_failure_handling`, `test/integration/provisioning-task-constraints.integration-spec.ts` (mở rộng), `test/integration/provisioning-failure-constraints.integration-spec.ts` (tác vụ lỗi và Assignment `Thất bại`; không phải `license-assignment-constraints`, như plan đầu ghi).
- Depends on: `g4-provisioning-queue-manual`.
- Acceptance: CHECK trạng thái ⟺ cột sáu trạng thái, dòng `FAILED` cũ được điền, `CLOSED_FAILED` bất biến, Assignment `failed_at` ⟹ khoảng rỗng đặt một lần, khoảng rỗng không chiếm seat và không va chạm `INV-02`.
- Verify: constraints đỏ trước migration, xanh sau; `prisma migrate diff` không khác biệt.

### Task 2: chính sách phân loại và quyết định

- Trạng thái: đã làm. Bằng chứng và lý do dùng lại `cleanEvidence`, `cleanFailureReason` của `provisioning.policy.ts`.

- Files: `src/modules/licensing/provisioning/failure.policy.ts`, `failure.policy.spec.ts`, `provisioning.policy.ts` (bảng chuyển trạng thái), `licensing.errors.ts`, `licensing.types.ts`.
- Depends on: Task 1.
- Acceptance: giãn cách, phân loại theo loại lỗi và số lần, quyết định hiện có theo trạng thái và kênh, lý do và bằng chứng bắt buộc, trạng thái mới bị `claim`, `complete`, `report-failure` từ chối.
- Verify: `pnpm exec jest src/modules/licensing/provisioning` đỏ trước, xanh sau.

### Task 3: ghi lỗi của connector và ba quyết định

- Trạng thái: đã làm.

- Files: `provisioning-failure.service.ts`, `provisioning-decision.service.ts`, `provisioning-task-frame.service.ts`, `provisioning-task-view.service.ts` (tách khung và thẻ việc khỏi `provisioning.service.ts`), `provisioning-task.repo.ts`, `assignment.service.ts` (`closeFailed`) + `assignment.repo.ts`, `licensing-audit-event.ts` (tác nhân hệ thống), `licensing.module.ts`, `OperatingParametersModule` vào imports, `licensing.service.ts` nếu cần cho facade.
- Depends on: Task 2.
- Acceptance: lịch thử lại, hết lượt, ba quyết định, Assignment `Thất bại` nhả seat, tác vụ thu hồi không đụng Assignment, mọi ghi cùng giao dịch với audit.
- Verify: integration `provisioning-failure-http` (qua service rồi HTTP).

### Task 4: route, DTO, lỗi HTTP

- Trạng thái: đã làm. `test/e2e/api-inventory.e2e-spec.ts` hiện đếm 143 operation toàn API (con số 127 → 130 dưới đây là lúc làm lát này).

- Files: `provisioning-tasks.controller.ts`, `provisioning.dto.ts`, `provisioning.http-errors.ts`, `test/support/api-coverage-manifest.ts` (+3), `test/e2e/api-inventory.e2e-spec.ts` (127 → 130), `test/e2e/provisioning.e2e-spec.ts`, `test/integration/provisioning-failure-http.integration-spec.ts`.
- Depends on: Task 3.
- Acceptance: ba operation đúng bảng HTTP; thẻ có các trường mới; mọi AC trong ma trận.
- Verify: e2e + integration; đột biến (cho quyết định ở trạng thái khác `FAILED`, bỏ lý do bắt buộc, bỏ bằng chứng chuyển tay, nhả seat khi đóng thu hồi, không nhả khi đóng cấp, không đọc tham số `PROVISIONING_RETRY_COUNT`, tự chuyển làm tay) làm đỏ.

### Task 5: tài liệu và gate cuối

- Trạng thái: đã làm cho spec/plan này; `docs/roadmap.md`, `docs/workspace/items/README.md`, `ARCHITECTURE.md` do lead cập nhật; `openapi.json` sinh bằng `pnpm openapi:export` (chạy lại 21/10/2026: chỉ đổi các mô tả lỗi, không operation nào thêm hay đổi) này.

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này, `g4-provisioning-queue-manual` (báo cáo lỗi tay giờ đi theo quyết định).
- Depends on: Task 4.
- Acceptance: tài liệu khớp mã; `openapi.json` chỉ thêm ba operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`, drift check migration.

### Task 6: bổ sung đợt hoàn tất G2–G4 (21/10/2026)

- Trạng thái: đã làm (theo [audit](../../../reviews/g2-g4-completion-2026-10-21/README.md), quyết định D2).
- Files: migration `20261021100000_licensing_provisioning_task_max_attempts` (cột `max_attempts`, CHECK 1..11, điền ngược, trigger bất biến từ chối đổi); `provisioning.service.ts` (`grant` đọc `PROVISIONING_RETRY_COUNT` một lần), `provisioning-failure.service.ts` và `provisioning-task-view.service.ts` (dùng `task.maxAttempts`), `provisioning-task.repo.ts`; `test/integration/provisioning-failure-http.integration-spec.ts`, `provisioning-task-constraints.integration-spec.ts`, `provisioning-decision-http.integration-spec.ts`.
- Depends on: Task 1 đến Task 4; migration `20261021100000_licensing_provisioning_task_max_attempts` đi trước mã đọc cột.
- Acceptance: `US-01-04` AC-13 — giới hạn thử lại cố định trên tác vụ lúc tạo, đổi tham số chỉ đến tác vụ tạo sau; `selfExecuted: true` được kiểm cho retry, hand-off, close; AC-11 đi qua `recordFailure`; test `decides on a failed task only` đạt `RETRY_SCHEDULED` qua `recordFailure`.
- Verify: test `US-01-04 AC-13…` đỏ trước rồi xanh; ràng buộc `max_attempts` có đột biến giữ SQL hợp lệ; đột biến ép `selfExecuted` về false làm đỏ.

## Verification and handoff

Môi trường chung: Windows, Node 24.0.2, pnpm 11.1.3; integration dùng PostgreSQL 17 trong Docker `127.0.0.1:55432`. Revision: `5f3b2b3` cộng cây làm việc chưa commit (nhánh `Bao_dev_be`), ngày 21/10/2026.

| Lệnh / kiểm tra AC                                                                                           | Revision / môi trường                                       | Kết quả thực chạy                                                                                          | Giới hạn / việc còn lại                                                                        |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm check` (chuỗi `rules:check`, format, prisma validate, lint, typecheck, unit, build)                    | `5f3b2b3` + cây làm việc, Windows, Node 24.0.2, pnpm 11.1.3 | exit 0; unit và kiểm cấu trúc 138 suite, 2006 test                                                         | Chưa có remote CI                                                                              |
| `pnpm test:e2e`                                                                                              | như trên, không CSDL                                        | 32 suite, 811 test xanh                                                                                    | —                                                                                              |
| `pnpm test:integration`                                                                                      | như trên, PostgreSQL 17 Docker `127.0.0.1:55432`            | 97 suite, 1307 test xanh                                                                                   | Chạy một môi trường cục bộ; chưa chạy trên môi trường dùng chung                               |
| `provisioning-failure-http` test `US-01-04 AC-13…`; `provisioning-task-constraints` ràng buộc `max_attempts` | như trên                                                    | Test HTTP đỏ trước khi chốt `max_attempts` lúc tạo, xanh sau; ràng buộc kiểm có đột biến giữ SQL hợp lệ    | Không có lần chạy riêng được ghi lại ngoài lần chạy tổng                                       |
| `provisioning-decision-http` (`selfExecuted` của retry, hand-off, close; AC-11 qua `recordFailure`)          | như trên                                                    | Xanh trong lần chạy tổng; đột biến ép `selfExecuted` về false làm đỏ                                       | Không có lần chạy riêng được ghi lại ngoài lần chạy tổng                                       |
| `provisioning-failure-constraints` (đồ thị trạng thái do trigger `provisioning_task_transition_guard` giữ)   | như trên, PostgreSQL 17 Docker                              | Sáu dòng trái phép bị từ chối với `55000`, các dòng hợp lệ được nhận; đột biến tắt trigger làm bảy test đỏ | Trigger thuộc `g4-provisioning-queue-manual`; `RETRY_SCHEDULED` → `QUEUED` chưa là dòng hợp lệ |

Phần chưa kiểm chứng: `pnpm openapi:export` chạy lại 21/10/2026 và chỉ đổi các mô tả lỗi (mười bốn dòng mô tả; không operation nào thêm hay đổi); không route nào tới `recordFailure` ở production nên nhánh connector chỉ được thử qua facade; bằng chứng chuyển làm tay chỉ nằm trên dòng tác vụ (Owner Q4), `attempts` về 0 khi thử lại làm chu kỳ không có trần (Owner Q6), một số chú thích trong mã còn mô tả hành vi cũ.

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [ ] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ (lead tự review diff cuối; chưa xác định runbook nào bị ảnh hưởng).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

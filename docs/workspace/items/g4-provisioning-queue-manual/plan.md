# Plan: hàng đợi cấp phát, giữ chỗ seat và kênh thủ công có bằng chứng (`US-07-01`, `US-07-02`)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (cục bộ, 21/10/2026, cây làm việc chưa commit trên `5f3b2b3`, nhánh `Bao_dev_be`). PR: chưa có. Chưa Owner review.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure (port nhiều bên dùng ở `<module>.ports.ts`), API/database rules, test guide, ADR-0013, `US-07-01` (AC-1→AC-17), `US-07-02` (AC-1→AC-7), `US-07-04` (ranh giới trạng thái lỗi), `US-01-11` (AC-1, AC-2, AC-4, AC-8), `US-01-05` AC-12, `baseline-impact-and-remediation` (M-26, M-29, M-30, M-34), các lát `g4-seat-baseline-import` (Assignment, khóa thuê bao, trigger `INV-01/02/07`) và `g3-standard-toolset` (mẫu phiên bản, quyền đọc). DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu `provisioning_tasks`

- Trạng thái: đã làm (20/10/2026); mở rộng bởi Task 6.

- Files: `prisma/models/licensing.prisma`, quan hệ ngược ở `organization.prisma`, migration `20261020220000_licensing_provisioning_tasks`, `test/gates/architecture-boundaries.gate-spec.ts`, `test/integration/licensing/provisioning-task-constraints.integration-spec.ts`.
- Depends on: `g4-seat-baseline-import` (bảng `license_assignments`).
- Acceptance: CHECK trạng thái ⟺ cột, `COMPLETED` cần bằng chứng không rỗng, unique `(assignment_id, kind)`, khóa ngoại, trigger bất biến cho `COMPLETED` và chặn xóa (`55000`).
- Verify: constraints đỏ trước migration, xanh sau; `prisma migrate diff` không khác biệt.

### Task 2: policy thuần

- Trạng thái: đã làm.

- Files: `src/modules/licensing/provisioning/provisioning.policy.ts`, `provisioning.policy.spec.ts`, `licensing.errors.ts`, `licensing.types.ts`.
- Depends on: Task 1 (kiểu và lỗi dùng chung của capability).
- Acceptance: bước theo kiểu cấp (K1, K2, K4, K5), kiểu được cấp (K3, K4 từ chối), bằng chứng và lý do (cắt, rỗng, quá dài), bảng chuyển trạng thái, hàng đợi chung, quy tắc tự thực thi, thuê bao theo kiểu cấp, tài khoản công ty.
- Verify: `pnpm exec jest src/modules/licensing/provisioning` đỏ trước, xanh sau.

### Task 3: facade và cổng

- Trạng thái: đã làm.
- Files: `licensing.types.ts` (`GRANT_REQUEST_GATE` và kiểu của cổng; không phải `licensing.ports.ts`), `provisioning/refusing-grant-request-gate.service.ts`, `licensing.module.ts`, `assignment.service.ts` (`createFromRequest`), `organization.service.ts` + repo phòng (`getItAdminInCharge`), `identity-access.service.ts` + repo tài khoản (`countUsableItAdminsExcept`), `test/gates/module-graph.gate-spec.ts`, `test/gates/architecture-structure.gate-spec.ts` nếu gate yêu cầu.
- Depends on: Task 2.
- Acceptance: người phụ trách mặc định của phòng hiện tại (hoặc `null`), số IT Admin dùng được khác người thao tác, cổng mặc định từ chối; Assignment nguồn `REQUEST` ghi dưới khóa thuê bao, có audit.
- Verify: integration `provisioning-http` (qua service); unit của repo nếu cần.

### Task 4: repo, service, route

- Trạng thái: đã làm.
- Files: `provisioning-task.repo.ts`, `provisioning.service.ts`, `provisioning.dto.ts`, `provisioning.http-errors.ts`, `provisioning-tasks.controller.ts`, `licensing.module.ts`, `test/support/api-coverage-manifest.ts` (+6), `test/http/platform/api-inventory.http-spec.ts` (121 → 127 lúc làm; hiện 143 sau các lát G3/G4 khác, trong đó ba operation của `g4-provisioning-failure-handling`), `test/http/licensing/provisioning.http-spec.ts`, `test/integration/provisioning-http.integration-spec.ts` (+ harness nếu cần).
- Depends on: Task 1, Task 2, Task 3.
- Acceptance: sáu operation đúng bảng HTTP; mọi AC trong ma trận; Assignment, seat và Audit Trail đúng.
- Verify: e2e + integration; đột biến (bỏ khóa thuê bao, bỏ kiểm người nghỉ việc, bỏ kiểm tài khoản công ty, bỏ bằng chứng bắt buộc, cho Finance hoàn tất, bỏ ghi người phụ trách, tự thực thi không kiểm IT Admin khác) làm đỏ.

### Task 5: tài liệu và gate cuối

- Trạng thái: đã làm cho spec/plan này; `docs/roadmap.md`, `docs/workspace/items/README.md`, `ARCHITECTURE.md` do lead cập nhật; `openapi.json` sinh bằng `pnpm openapi:export` (chạy lại 21/10/2026: chỉ đổi các mô tả lỗi, không operation nào thêm hay đổi) này.
- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này, `g4-request-and-transfer-integration` (điểm nối cổng).
- Depends on: Task 4.
- Acceptance: tài liệu khớp mã; `openapi.json` chỉ thêm sáu operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`, drift check migration.

### Task 6: bổ sung đợt hoàn tất G2–G4 (21/10/2026)

- Trạng thái: đã làm (theo [audit](../../../reviews/g2-g4-completion-2026-10-21/README.md), quyết định D1 và D4).
- Files: migration `20261021120000_licensing_provisioning_task_transitions` (trigger `provisioning_task_transition_guard`); `provisioning.service.ts` + `licensing.errors.ts` + `provisioning.http-errors.ts` + mô tả của `provisioning-tasks.controller.ts` (từ chối người chưa vào làm, `PROVISIONING.BENEFICIARY_NOT_STARTED`); `test/integration/licensing/provisioning-failure-constraints.integration-spec.ts`, `provisioning-grant-http.integration-spec.ts`, `provisioning-queue-http.integration-spec.ts`, `provisioning-task-constraints.integration-spec.ts`.
- Depends on: Task 1 đến Task 4; `g4-provisioning-failure-handling` (sáu trạng thái, cột `max_attempts`).
- Acceptance: lệnh cấp từ chối người chưa vào làm (`US-02-02` AC-15) mà không ghi gì; CSDL từ chối mọi dòng trạng thái ngoài đồ thị cho phép; AC-13 chứng minh cả đường tải lên và đường SQL sau khi đóng khởi tạo; có test `US-01-11` AC-7; INSERT SQL trong test mang `max_attempts`.
- Verify: test `US-02-02 AC-15: does not grant to someone who starts after today…` đỏ trước (trả 201) rồi xanh; `provisioning-failure-constraints` — sáu dòng trái phép bị từ chối với `55000`, các dòng hợp lệ được nhận, tắt trigger làm bảy test đỏ.

## Verification and handoff

Môi trường chung: Windows, Node 24.0.2, pnpm 11.1.3; integration dùng PostgreSQL 17 trong Docker `127.0.0.1:55432`. Revision: `5f3b2b3` cộng cây làm việc chưa commit (nhánh `Bao_dev_be`), ngày 21/10/2026.

| Lệnh / kiểm tra AC                                                                                         | Revision / môi trường                                       | Kết quả thực chạy                                                                                                                                                        | Giới hạn / việc còn lại                                                                      |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `pnpm check` (chuỗi `rules:check`, format, prisma validate, lint, typecheck, unit, build)                  | `5f3b2b3` + cây làm việc, Windows, Node 24.0.2, pnpm 11.1.3 | exit 0; unit và kiểm cấu trúc 138 suite, 2006 test                                                                                                                       | Chưa có remote CI                                                                            |
| `pnpm test:e2e`                                                                                            | như trên, không CSDL                                        | 32 suite, 811 test xanh                                                                                                                                                  | —                                                                                            |
| `pnpm test:integration`                                                                                    | như trên, PostgreSQL 17 Docker `127.0.0.1:55432`            | 97 suite, 1307 test xanh                                                                                                                                                 | Chạy một môi trường cục bộ; chưa chạy trên môi trường dùng chung                             |
| `provisioning-grant-http` test `US-02-02 AC-15: does not grant to someone who starts after today…`         | như trên                                                    | Đỏ trước khi sửa (lệnh cấp trả 201), xanh sau khi thêm kiểm `BENEFICIARY_NOT_STARTED`                                                                                    | Chỉ lệnh cấp; vế import hiện trạng ở `g4-seat-baseline-import`                               |
| `provisioning-failure-constraints` (đồ thị trạng thái do trigger `provisioning_task_transition_guard` giữ) | như trên, PostgreSQL 17 Docker                              | Sáu dòng trái phép bị từ chối với `55000`, các dòng hợp lệ được nhận; đột biến tắt trigger làm bảy test đỏ                                                               | `RETRY_SCHEDULED` → `QUEUED` chưa là dòng hợp lệ (việc connector thêm cùng migration của nó) |
| `provisioning-grant-http` test AC-13; `provisioning-queue-http` test `US-01-11 AC-7`                       | như trên                                                    | Xanh trong lần chạy `pnpm test:integration` ở trên; AC-13 nay chứng minh tải lên sau khi đóng là 409 `SEAT_BASELINE.CLOSED` và hàng `BASELINE` bị CSDL từ chối (`55000`) | Không có lần chạy riêng được ghi lại ngoài lần chạy tổng                                     |

Phần chưa kiểm chứng: `pnpm openapi:export` chạy lại 21/10/2026 và chỉ đổi các mô tả lỗi (mười bốn dòng mô tả; không operation nào thêm hay đổi); không route nào gọi `recordFailure` ở production nên nhánh connector chỉ được thử qua facade; một Request cấp hai lần trên hai thuê bao cùng gói, `SoD-5` lúc cấp và bộ hẹn giờ của `US-07-02` AC-2 là giới hạn đã biết ở spec (_Changes and acceptance_).

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [ ] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ (lead tự review diff cuối; chưa xác định runbook nào bị ảnh hưởng).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

# Plan: a02-my-software-read-model — "Phần mềm của tôi"

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: AI implementer (Dev A `A-02`). Thiết kế ban đầu bởi: AI implementer theo DEV-A/README audit 31/10/2026.
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `verified`. PR: chưa có (thay đổi chưa commit; bằng chứng từ worktree cô lập tại `6eb12d1`).

## Before coding

- Đã đọc AGENTS.md, rules `api-contract`, `module-structure`, prompts 01/03, test guide; US-12-15 AC-2, US-16-01 AC-1 (Docs
  `726219a`), US-01-01 AC-17. Đối chiếu source BE `6eb12d1`: `saas-issue-view.service.ts`/`saas-issue-facts.repo.ts`
  (`/saas-issues/options`), `revocation-read.*` (`listPersonalSeatsOf`), `department-tools.service.ts`, `expiry.policy.ts`,
  `assignment-renewal.service.ts`, `revocation.policy.ts` (ngày kết thúc K1), prisma `licensing.prisma`/`catalog.prisma`.
- Môi trường: worktree riêng, Docker `slm-test-a02` (127.0.0.1:55433), không `.env`. Không migration.
- Dependency: không. Blocker tích hợp roadmap/tên item: xem spec `## Dependencies and blockers`.

## Tasks

### Task 1: policy trạng thái theo ngày nghiệp vụ

- Files: `src/modules/licensing/my-software/my-software.policy.ts`, `my-software.policy.spec.ts`.
- Depends on: none.
- Acceptance: bảy trạng thái theo thứ tự trong spec; `expiringSoon` cửa sổ 7 ngày dùng `REMINDER_LEAD_DAYS`; gia hạn nối tiếp
  không `EXPIRED`/không sắp hết.
- Verify: `pnpm exec jest src/modules/licensing/my-software` → xanh.

### Task 2: repo + service + controller + wiring

- Files: `my-software.repo.ts`, `my-software.service.ts`, `my-software.service.spec.ts`, `my-software.dto.ts`,
  `my-software.controller.ts`, `src/modules/licensing/licensing.module.ts`, `src/modules/licensing/README.md`.
- Depends on: Task 1.
- Acceptance: một operation `GET /api/v1/me/software-rights`, vai `EMPLOYEE`, dữ liệu theo `principal.employeeId`, page+count
  một snapshot `RepeatableRead`, catalog đọc một lần cho trang, không đọc `license_keys`.
- Verify: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm test:gates` → xanh.

### Task 3: contract HTTP, OpenAPI và artefact sinh

- Files: `test/http/licensing/my-software.http-spec.ts`, `test/support/api-coverage-manifest.ts`,
  `test/support/openapi-example-manifest.ts`, `test/http/platform/openapi-presentation.http-spec.ts` (287 → 288), `openapi.json`,
  `docs/generated/routes.md`, `docs/generated/module-graph.md`.
- Depends on: Task 2.
- Acceptance: 401/403 role matrix/422/503/200 envelope + message; inventory, example manifest và presentation khớp.
- Verify: `pnpm test:http` → xanh; `pnpm openapi:export` (Node 22 — xem bảng), `pnpm arch:routes`, `pnpm arch:graph`,
  `pnpm arch:docs:check` → xanh.

### Task 4: integration trên PostgreSQL thật

- Files: `test/integration/licensing/my-software-http.integration-spec.ts`.
- Depends on: Task 2.
- Acceptance: K1/K2/K4/K5, ACTIVE/EXPIRED/UPCOMING/PROVISIONING/REVOKING/ENDING/ENDED, grant hỏng không xuất hiện, cách ly E1/E2,
  role matrix thật, phân trang ổn định, số câu lệnh hằng, không lộ khóa K4.
- Verify: `pnpm test:integration --runTestsByPath test/integration/licensing/my-software-http.integration-spec.ts` → 11/11 xanh;
  mutation bỏ lọc `employeeId` → đỏ.

### Checkpoint

Sau Task 4: typecheck, lint, format, gates, arch, HTTP, integration, rules xanh; tự review diff theo spec.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                        | Revision / môi trường                        | Kết quả thực chạy                                                                                                                                | Giới hạn / việc còn lại                                |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `pnpm exec jest src/modules/licensing/my-software`                                                        | `6eb12d1` + diff, Node 24.0.2                | 2 suite, 14 test đạt                                                                                                                             | —                                                      |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`                                                        | như trên                                     | đạt                                                                                                                                              | —                                                      |
| `pnpm test:gates`                                                                                         | như trên                                     | 16 suite, 317 test đạt                                                                                                                           | —                                                      |
| `pnpm arch:check`, `pnpm arch:docs:check`                                                                 | như trên                                     | đạt (0 vi phạm)                                                                                                                                  | —                                                      |
| `pnpm test:discovery`; drift migration (`prisma migrate deploy` + `migrate diff --exit-code` trên DB tạm) | Docker `slm-test-a02`                        | discovery đạt; 126 migration áp xong, "No difference detected" (không có migration mới)                                                          | DB tạm đã xóa                                          |
| `pnpm test:http --runTestsByPath test/http/licensing/my-software.http-spec.ts`                            | như trên                                     | 15 test đạt                                                                                                                                      | —                                                      |
| `pnpm test:http` (toàn bộ, gồm api-inventory, openapi platform)                                           | như trên                                     | kết quả ghi trong phiên làm việc, không có file báo cáo trong repo; phải chạy lại trên cây tích hợp                                              | —                                                      |
| `pnpm openapi:export`                                                                                     | Node 24.0.2: lỗi; Node 22.15.0 (bản CI): đạt | Node 24.0.2 báo `Cannot find module` ngẫu nhiên khi nạp graph bằng ts-node trên đường dẫn có dấu; Node 22 xuất được, diff chỉ thêm operation mới | lỗi môi trường, không do thay đổi; ghi cho coordinator |
| `pnpm test:integration --runTestsByPath test/integration/licensing/my-software-http.integration-spec.ts`  | Docker `slm-test-a02` PG 17, DB dùng một lần | 11/11 đạt; mutation bỏ lọc `employeeId` → 4 đỏ                                                                                                   | không chạy toàn bộ integration (coordinator chạy cuối) |
| `pnpm rules:check`, `pnpm rules:format`                                                                   | như trên                                     | kết quả ghi trong phiên làm việc, không có file báo cáo trong repo; phải chạy lại trên cây tích hợp                                              | scope map G8/G10 đã có trong roadmap                   |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; module card cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; PR chưa có (roadmap đã có dòng hạng mục).

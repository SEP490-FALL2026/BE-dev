# Plan: a10-operational-dashboards — khung chung + trang Employee

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1` + diff chưa commit của `A-02`.
- Phụ trách: AI implementer (Dev A `A-10`). Thiết kế ban đầu bởi: AI implementer theo DEV-A/README audit 31/10/2026.
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `verified` (local). PR: chưa có (thay đổi chưa commit; bằng chứng từ worktree cô lập tại `6eb12d1`).

## Before coding

- Đã đọc AGENTS.md, rules `module-structure`, `api-contract`, `work-item-sizing`, prompts 01/03, test guide; `US-12-15` (Docs
  `726219a`, EP-12 dòng 581→704); DEV-A A-10/A-02, DEV-B B-02/B-03/B-04/B-08 (đối chiếu source: chưa có queue nhu cầu, Request
  của tôi, list IT assessment, contract tiền B-08 trong cây này).
- Đối chiếu nguồn: `my-software.*` (A-02), `saas-issue-view.service.ts` (scope `mine`/`assigned`), `provisioning.service.ts`
  (`MINE`), `department-tools.service.ts`, `organization.api.ts` (`getHeadedDepartment`, `getItAdminScope`,
  `getOnboardingFacts`), `department-query.service.ts` (warnings), `onboarding.service.ts` (mẫu `NOT_AVAILABLE`).
- Môi trường: worktree cô lập, Docker `slm-test-a10` (127.0.0.1:55439), không `.env`. Không migration.

## Tasks

### Task 1: contract mục và module `dashboards` (T7)

- Files: `src/modules/dashboards/section/*`, `dashboards.module.ts`, `README.md`; `scripts/arch/tiers.cjs`, `ARCHITECTURE.md`,
  `docs/rules/module-structure.md`, `src/app/app.module.ts`, `rules-check.config.json`.
- Depends on: none.
- Acceptance: ba trạng thái mục, không số cho dữ liệu thiếu nguồn; module chỉ import facade (`pnpm arch:check`).
- Verify: `pnpm exec jest src/modules/dashboards/section` → xanh; `pnpm arch:check`, `pnpm test:gates` → xanh.

### Task 2: số đếm licensing qua facade

- Files: `src/modules/licensing/dashboard-facts/*`, `public/licensing-dashboard.api.ts`, `public/licensing-dashboard.types.ts`,
  `licensing.module.ts`, `licensing/README.md`, `test/gates/module-graph.gate-spec.ts` (`PUBLIC_CONTRACT_EXPORTS`).
- Depends on: Task 1.
- Acceptance: một snapshot `RepeatableRead`, số câu lệnh cố định, luật "sắp hết" dùng lại `my-software.policy.ts`.
- Verify: `pnpm typecheck`, `pnpm test:gates` → xanh.

### Task 3: trang Employee + contract HTTP

- Files: `src/modules/dashboards/employee/*`, `test/http/dashboards/dashboards.http-spec.ts`,
  `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-manifest.ts`,
  `test/http/platform/openapi-presentation.http-spec.ts`, `openapi.json`, `docs/generated/*`.
- Depends on: Task 2.
- Acceptance: 401/403 role matrix/503/200 envelope + message; không input → không 422 (danh sách `WITHOUT_VALIDATION`).
- Verify: `pnpm test:http` → xanh (trừ `openapi-export` dưới Node 24 — chạy lại Node 22); `pnpm openapi:export` (Node 22).

### Task 4: integration bốn trang trên PostgreSQL

- Files: `test/support/dashboard-harness.ts`, `test/integration/dashboards/dashboards-http.integration-spec.ts`.
- Depends on: Task 3 và ba sibling.
- Acceptance: mỗi số `COUNTED` bằng tổng của list nguồn khi cùng người đọc; cách ly người/phòng; role matrix thật; mục thiếu
  nguồn không là 0; mọi `sourceOperationId` có trong `openapi.json`.
- Verify: `pnpm test:integration --runTestsByPath test/integration/dashboards/dashboards-http.integration-spec.ts` → 11/11;
  mutation bỏ lọc người/IT Admin → đỏ.

### Checkpoint

Sau Task 4: typecheck, lint, format, gates, arch, HTTP, integration, rules; tự review diff theo spec.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                       | Revision / môi trường                               | Kết quả thực chạy                                                                                   | Giới hạn / việc còn lại                                |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `pnpm exec jest src/modules/dashboards src/modules/licensing/my-software`                                | `6eb12d1` + A-02 + diff, Node 24.0.2                | kết quả ghi trong phiên làm việc, không có file báo cáo trong repo; phải chạy lại trên cây tích hợp | —                                                      |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm arch:check`, `pnpm arch:docs:check`            | như trên                                            | kết quả ghi trong phiên làm việc, không có file báo cáo trong repo; phải chạy lại trên cây tích hợp | —                                                      |
| `pnpm test:gates`                                                                                        | như trên                                            | 16 suite, 318 test đạt                                                                              | —                                                      |
| `pnpm test:http`                                                                                         | Node 24.0.2; `openapi-export` chạy lại Node 22.15.0 | 52/53 suite dưới Node 24 (chỉ `openapi-export` lỗi môi trường); Node 22: 4/4                        | lỗi Node 24 có từ trước, không do thay đổi             |
| `pnpm openapi:export` (`ts-node scripts/dev/export-openapi.ts`)                                          | Node 22.15.0                                        | xuất được; so ngữ nghĩa với HEAD: chỉ thêm 5 path/5 schema (A-02 + 4)                               | —                                                      |
| `pnpm test:integration --runTestsByPath test/integration/dashboards/dashboards-http.integration-spec.ts` | Docker `slm-test-a10` PG 17, DB dùng một lần        | 11/11 đạt; mutation bỏ lọc người/IT Admin → 5 đỏ                                                    | không chạy toàn bộ integration (coordinator chạy cuối) |
| drift migration                                                                                          | Docker `slm-test-a10`                               | kết quả ghi trong phiên làm việc, không có file báo cáo trong repo; phải chạy lại trên cây tích hợp | không có migration mới                                 |
| `pnpm rules:check`, `pnpm rules:format`                                                                  | như trên                                            | kết quả ghi trong phiên làm việc, không có file báo cáo trong repo; phải chạy lại trên cây tích hợp | scope map G8 đã có trong roadmap                       |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; module card cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; PR chưa có (roadmap đã có dòng hạng mục).

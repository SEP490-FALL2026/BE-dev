# Plan: qd96-100-manager-employee-detail

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent C-SPEC-P).
- Owner review: chưa review toàn hạng mục; hình dạng API Owner chốt 05/11/2026 (detail + `software-rights` + `open-requests`). Peer review: tùy chọn.
- Triển khai: `verified` (local, chưa commit, nhánh `feat/qd96-100-alignment`, 05/11/2026 tối). PR: chưa có. **Mức FE-tonight: A** (Owner nâng 05/11/2026).

## Before coding

Đọc `docs/rules/{api-contract,module-structure}.md` (API-LIST-DETAIL.1, R6), `personnel/README.md`, `test/gates/api-collection-contract.gate-spec.ts`,
`test/support/query-count.ts`, `personnel/offboarding/open-requests/**`, `licensing/provisioning/revocation-view.service.ts`,
`requests/access-request/open-request/**`. Không migration. Quick set như #1 + `pnpm test:http &&
pnpm openapi:export && pnpm arch:routes`.

## Tasks

### Task 1: facade đọc `licensing.pageHeldSoftwareOf`

- Files: `licensing/public/licensing.api.ts`, `licensing.types.ts`, `licensing/provisioning/revocation-read.repo.ts` (hoặc repo đọc seat hiện có), `licensing/README.md`.
- Depends on: `qd96-100-account-org-api-fields` (thứ tự track).
- Acceptance: trang theo `effective_from, id`, projection ở SQL, chỉ Assignment cá nhân hiệu lực.
- Verify: quick set; integration + query-count hai cỡ dữ liệu.

### Task 2: lọc phòng ở `RequestsApi.listOpenOfBeneficiary`

- Files: `requests/public/requests.api.ts`, `requests/access-request/open-request/open-request.service.ts` + repo, `requests/README.md`.
- Depends on: none.
- Acceptance: dòng _Hồi quy_ và lọc theo `department_id`.
- Verify: quick set; integration open-request (có/không `departmentId`).

### Task 3: capability `personnel/department-member` — 3 operation GET

- Files: `personnel/department-member/{department-member.controller,.service,.dto,.policy,.errors,.http-errors}.ts` (+ spec policy), `personnel.module.ts`, `personnel/README.md`, `docs/generated/routes.md` (`pnpm arch:routes`), `openapi.json`, `test/support/openapi-example-*` (nếu manifest cần).
- Depends on: Task 1, Task 2.
- Acceptance: các dòng #29, _Quyền_, _Biên_, _Query_ của test matrix; gate collection xanh.
- Verify: quick set; `pnpm test:http`; `pnpm openapi:export` (diff chỉ 3 op mới); integration query-count.

### Checkpoint

Sau Task 3: quick set + `test:http` + gate collection xanh; tự review; gửi FE hợp đồng 3 op.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                   | Revision / môi trường                                     | Kết quả thực chạy                                                                                                                                                    | Giới hạn / việc còn lại                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `pnpm typecheck`                                                                                                                     | cây làm việc chưa commit, nhánh `feat/qd96-100-alignment` | `tsc --noEmit` thoát 0                                                                                                                                               | —                                                           |
| `eslint` các file đã chạm (department-member, facade licensing/requests, module, 2 spec mới)                                         | như trên                                                  | 0 lỗi                                                                                                                                                                | `pnpm lint` toàn repo do Owner                              |
| `pnpm test -- src/modules/personnel/department-member`                                                                               | như trên                                                  | 5/5 xanh                                                                                                                                                             | —                                                           |
| `pnpm test:http -- test/http/personnel/department-members.http-spec.ts`                                                              | như trên                                                  | đỏ 16/16 trước khi nối module, xanh 16/16 sau                                                                                                                        | —                                                           |
| `pnpm test:integration -- test/integration/personnel/department-member-read.integration-spec.ts` (PostgreSQL 17 local `slm-test-db`) | như trên                                                  | 20/20 xanh; đột biến bỏ lọc `departmentId` ở `OpenRequestRepo` ⟹ 3 test đỏ (detail, open-requests, facade)                                                           | —                                                           |
| Hồi quy `leaver-request-closure`, `leaver-request-closure-group`, `transfer-review-read` (integration)                               | như trên                                                  | 17/17 xanh                                                                                                                                                           | —                                                           |
| `pnpm test:http -- test/http/platform test/http/personnel`                                                                           | như trên                                                  | 346/349; 2 đỏ do route `device*` (chat G7), 1 đỏ là con số operation (đã đổi 319 → 322, chạy lại `openapi-presentation` 13/13 xanh)                                  | `openapi-read-wording`, `openapi-request-rules` chờ chat G7 |
| `pnpm test:gates`                                                                                                                    | như trên                                                  | 15/16 file xanh gồm `api-collection-contract`, `module-layout`, `capability-graph`, `module-graph`; đỏ `architecture-boundaries` do `DeviceEnrollmentCode` (chat G7) | —                                                           |
| `pnpm arch:check`, `pnpm arch:routes`                                                                                                | như trên                                                  | không vi phạm; `docs/generated/routes.md` 322 operations                                                                                                             | —                                                           |
| `pnpm openapi:export` (ra thư mục tạm)                                                                                               | như trên                                                  | không khác `openapi.json` một byte (đã chứa 3 operation do lượt export của chat khác sau khi nối module)                                                             | —                                                           |
| full suite, `pnpm check`, `test:http` toàn bộ                                                                                        | chưa chạy                                                 | —                                                                                                                                                                    | do Owner lúc audit                                          |

- [x] Mọi dòng test matrix có bằng chứng.
- [x] README/spec khớp; FE được báo — hợp đồng 3 operation ở bảng _Ownership: module, data, API_ của spec.
- [ ] Giao Owner review trên revision cụ thể.

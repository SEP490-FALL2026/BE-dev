# Plan: qd95-self-service-every-role

- [Spec](spec.md); revision đầu vào: Docs `0125072` + `QĐ-95` (thay pin khi Owner commit), BE `d7b8fe8d`.
- Phụ trách: chưa giao. Thiết kế ban đầu bởi: AI theo giao việc của Owner (04/11/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc `docs/rules/api-contract.md`, `test/README.md` (database test riêng, `TEST_DATABASE_ADMIN_URL`),
`src/modules/licensing/my-software/**`, `src/modules/dashboards/{employee,section}/**`, `src/modules/requests/my-requests/**`,
`src/modules/requests/public/requests-dashboard.api.ts`, `test/support/{request-harness,dashboard-harness}.ts`,
`test/integration/identity-access/mobile-session-roles.integration-spec.ts`. Merge **trước** `qd95-one-role-per-account`.

Quick set = `pnpm typecheck && pnpm lint && pnpm test && pnpm arch:check && pnpm rules:check && pnpm test:gates`. Integration
chạy theo file: `pnpm test:integration -- <đường dẫn file>` (database theo `test/README.md`).

## Tasks

### Task 1: mở ba route đọc tự phục vụ cho mọi vai; Super Admin không hoàn trả

- Files:
  - Source: `src/modules/licensing/my-software/my-software.controller.ts`, `src/modules/dashboards/employee/employee-dashboard.controller.ts`,
    `employee-dashboard.service.ts` (+ `employee-dashboard.service.spec.ts`), `src/modules/dashboards/section/dashboard-section.policy.ts`,
    `src/modules/requests/my-requests/my-requests.service.ts`, `my-requests.controller.ts`, `src/modules/requests/public/requests-dashboard.api.ts`,
    `src/modules/requests/return-request/return-request.service.ts` (+ spec), `return-requests.controller.ts` (Super Admin hoàn trả
    ⟹ 403, mục 6 của spec).
  - Manifest/hợp đồng: `test/support/openapi-example-route-codes-requests.ts:195,237-238`, `openapi.json` (`pnpm openapi:export`).
  - Test đổi (403 → 200/đếm): `test/http/licensing/my-software.http-spec.ts:57-75` (ma trận vai chỉ còn ca không token),
    `test/http/dashboards/dashboards.http-spec.ts:142-155` (route `employee` không còn ma trận 403 theo vai),
    `test/http/requests/my-requests.http-spec.ts:155-162` (Super Admin 200 trang), `test/integration/requests/my-requests.integration-spec.ts:150-158`,
    `test/integration/identity-access/manager-scope.integration-spec.ts:117-128` (`MANAGER` đọc `/me/software-rights` 200),
    `test/integration/licensing/my-software-http.integration-spec.ts:315-321` (IT Admin, Finance, Super Admin 200, chỉ không token 401),
    `test/integration/dashboards/dashboards-http.integration-spec.ts:191-205` (**bỏ** chèn grant `EMPLOYEE` cho Super Admin; Super
    Admin không thêm vai nào vẫn nhận `requests` `COUNTED` 0), `test/integration/requests/super-admin-cannot-request.integration-spec.ts`
    (thêm `returnRequestSubmit` với một seat của Super Admin).
- Depends on: none.
- Acceptance: các dòng "xem", "từ chối" (hoàn trả của Super Admin), `US-12-15` AC-27, `saasIssues`, "Chưa đăng nhập", AC-17
  hồi quy của test matrix.
- Verify: quick set; `pnpm test:http`; `pnpm openapi:export` (diff chỉ ở `meSoftwareRightList`, `employeeDashboardGet`,
  `meAccessRequestList`, `returnRequestSubmit`); `pnpm test:integration -- test/integration/licensing/my-software-http.integration-spec.ts
test/integration/dashboards/dashboards-http.integration-spec.ts test/integration/requests/my-requests.integration-spec.ts
test/integration/identity-access/manager-scope.integration-spec.ts test/integration/requests/super-admin-cannot-request.integration-spec.ts`.

### Task 2: bằng chứng `US-01-01` AC-25 và `US-16-04` AC-5/AC-6

- Files: `test/integration/requests/self-service-every-role.integration-spec.ts` (mới, dựng tám tài khoản của spec bằng
  `request-harness.ts`; quyền của người gọi dựng như `test/integration/licensing/return-request-conditions.integration-spec.ts`
  và `saas-issue-integrity.integration-spec.ts`), `test/integration/identity-access/mobile-session-roles.integration-spec.ts`
  (`SELF_SERVICE` dòng 380 thêm `/api/v1/me/software-rights`, `/api/v1/me/access-requests`, `/api/v1/dashboards/employee`;
  thêm ca `IT1`/`F1` gửi và rút bằng nhãn mobile, `H1` chỉ `MANAGER` có hàng đợi nhu cầu và tự phục vụ).
- Depends on: Task 1.
- Acceptance: các dòng "làm", "từ chối" (phần còn lại), `US-16-04` AC-5, AC-6 của test matrix.
- Verify: quick set; `pnpm test:integration -- test/integration/requests/self-service-every-role.integration-spec.ts
test/integration/identity-access/mobile-session-roles.integration-spec.ts`.

### Checkpoint

Quick set + `pnpm test:http` + integration các file đổi xanh; tự review diff theo spec; danh sách đổi hợp đồng cho FE/mobile.

## Verification and handoff

| Lệnh / kiểm tra AC          | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| --------------------------- | --------------------- | ----------------- | ----------------------- |
| Quick set, `pnpm test:http` | —                     | chưa chạy         | —                       |
| `pnpm openapi:export`       | —                     | chưa chạy         | —                       |
| Integration theo file đổi   | —                     | chưa chạy         | —                       |

- [ ] AC trong scope có bằng chứng; báo FE/mobile.
- [ ] Giao Owner review; cập nhật roadmap.

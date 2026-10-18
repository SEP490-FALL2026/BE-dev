# Plan: chia lát remediation và refactor nền tảng sau audit 18/10/2026

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `186ad5f`.
- Phụ trách: AI theo giao việc Owner (lập kế hoạch). Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn; ADR-0011 cần dev review trước `accepted` của H1.
- Triển khai: `in-progress` (cập nhật 18/10/2026; lúc lập là `not-started`): Task 1–6 đã tạo H1, H2a, H2b, H3a,
  H3b, H3c — trạng thái từng lát ở [roadmap](../../../roadmap.md#hạng-mục); Task 7 trở đi `not-started`. PR: chưa có. Hạng mục chỉ
  lập kế hoạch; mỗi task dưới đây tạo **một** hạng mục mới, không viết code.

## Before coding

Mỗi lát: đọc AGENTS.md, CONTRIBUTING.md, [module structure](../../../rules/module-structure.md), rule chuyên đề, mục
tương ứng của [báo cáo audit](../../../reviews/be-foundation-audit-2026-10-18/README.md) và spec gốc bị sửa. Đối chiếu HEAD
`dev` thật (không dùng `eae212a`), pin Docs commit đang dùng (hiện `9416fe0`). Hạng mục mới theo mẫu và phải qua
`pnpm rules:check` (không thêm vào danh sách legacy).

## Tasks

Thứ tự là thứ tự thực hiện. Một lát xong (gate xanh, Owner review theo quy trình) mới mở lát kế tiếp, trừ chỗ ghi song
song được.

### Task 1: hạng mục H1 — auth/session contract

- Files: `docs/workspace/items/h1-auth-session-refresh-expiry/{spec,plan}.md`, roadmap, items index.
- Depends on: Prompt 02 xong.
- Acceptance: spec ghi `refreshExpiresAt` = hạn refresh token vừa cấp, không đổi TTL; contract FE (bộ nhớ, không
  `localStorage`, single-flight); F-35; ràng buộc token opaque/PostgreSQL/không Redis/không `jwt.verify`; test matrix gồm
  refresh đồng thời và DB down.
- Verify: `pnpm rules:check` → 0 lỗi; hạng mục không nằm trong legacy.

### Task 2: hạng mục H2a — Swagger hiển thị

- Files: `docs/workspace/items/h2a-openapi-presentation/{spec,plan}.md`, roadmap, items index.
- Depends on: Task 1 (cùng chạm OpenAPI; tránh hai diff `openapi.json` song song).
- Acceptance: chỉ đổi tài liệu OpenAPI (security, summary, example placeholder an toàn, bỏ `pattern` trùng `format`,
  `const` → `enum`, gom mô tả lỗi); runtime không đổi; e2e kiểm `security` cho mọi operation không public.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 3: hạng mục H2b — message code và response khai thiếu

- Files: `docs/workspace/items/h2b-openapi-wire-messages/{spec,plan}.md`, roadmap, items index.
- Depends on: Task 2.
- Acceptance: 4 operation `COMMON.SUCCESS` → mã cụ thể; 422 ở 5 operation, 429 toàn cục; giữ mã guard/503 (Q8); ghi tác
  động FE.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 4: hạng mục H3a — R-1 bỏ `sharedAccounts`

_18/10/2026:_ đã tạo [h3a-r1-department-in-use-details](../h3a-r1-department-in-use-details/spec.md); implement `verified` local, chưa commit.

- Files: `docs/workspace/items/h3a-r1-department-in-use-details/{spec,plan}.md`, roadmap, items index.
- Depends on: Prompt 02 xong (Q4); có thể song song với Task 1–3 vì khác module.
- Acceptance: primary `US-03-06` AC-19 (vế bỏ tài khoản dùng chung, `QĐ-75`) `partial`/`full` đúng theo bảng; contract
  409 thay đổi được ghi; không migration.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 5: hạng mục H3b — R-2 lý do khóa và mở khóa

_18/10/2026:_ đã tạo [h3b-r2-lock-unlock-reason](../h3b-r2-lock-unlock-reason/spec.md); implement `verified` local, chưa
commit. Quyết định migration: không (lý do nằm trong JSON Audit Trail).

- Files: `docs/workspace/items/h3b-r2-lock-unlock-reason/{spec,plan}.md`, roadmap, items index.
- Depends on: Prompt 02 xong (Q4); trước Task 7 (refactor `organization`) theo Q4.
- Acceptance: primary `US-01-01` AC-6, AC-7, AC-20 theo `QĐ-81` (Docs `9416fe0`); body bắt buộc lý do, 422 khi thiếu,
  audit trước/sau + lý do; quyết định migration (mặc định không) ghi rõ.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 6: hạng mục H3c — bằng chứng `US-01-10` AC-10

_18/10/2026:_ đã tạo [h3c-forgot-password-during-recovery](../h3c-forgot-password-during-recovery/spec.md); test viết trước
**đỏ** (yêu cầu quên mật khẩu thu hồi liên kết khôi phục và gửi thư mới), nên sửa: kiểm ticket `RESET_CREDENTIALS` đang chờ
trong giao dịch quên mật khẩu; `verified` local, chưa commit; claim ở `us-01-09` cập nhật; OpenAPI không đổi.

- Files: `docs/workspace/items/h3c-forgot-password-during-recovery/{spec,plan}.md`, roadmap, items index.
- Depends on: Prompt 02 xong.
- Acceptance: test viết trước; nếu đỏ thì sửa từ chối gửi thư khi có phiếu khôi phục đang chờ; nếu xanh thì chỉ ghi bằng
  chứng; cập nhật claim ở roadmap và spec `us-01-09-super-admin-transfer-recovery`.
- Verify: `pnpm rules:check` → 0 lỗi.

### Checkpoint

Sau Task 1–6: các hạng mục đã tạo đều qua `pnpm rules:check`; thứ tự R-1/R-2 trước refactor `organization` giữ đúng Q4.

### Task 7: hạng mục H4.1 — sửa nhỏ `organization`

- Files: `docs/workspace/items/h4-1-organization-small-fixes/{spec,plan}.md`, roadmap, items index.
- Depends on: Task 4 và Task 5 đã `merged-dev` (Q4).
- Acceptance: F-11 (`toProjectWire` ra mapper), F-12 (`instanceof`), F-13 (bỏ export không consumer); `openapi.json`
  byte-identical; ledger gỡ `controllerImports`, `errorMatchedByName`, export không consumer.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 8: hạng mục H4.2 — capability `project`

- Files: `docs/workspace/items/h4-2-organization-project-capability/{spec,plan}.md`, roadmap, items index.
- Depends on: Task 7.
- Acceptance: `project/` có controller, service, `project.repo.ts`, dto, errors, mapper; không đổi contract.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 9: hạng mục H4.3 — capability `job-title` và `normalizeDisplayName` vào core

- Files: `docs/workspace/items/h4-3-organization-job-title-capability/{spec,plan}.md`, roadmap, items index.
- Depends on: Task 8.
- Acceptance: `job-title/` sở hữu `job-title.repo.ts`; `normalizeDisplayName` ở `src/core` (Q6), `data-import` dùng
  core; không đổi contract.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 10: hạng mục H4.4 — capability `employee`

- Files: `docs/workspace/items/h4-4-organization-employee-capability/{spec,plan}.md`, roadmap, items index.
- Depends on: Task 9.
- Acceptance: `employee/` sở hữu `employee.repo.ts`, import lookup, validator; facade giữ nguyên; không đổi contract.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 11: hạng mục H4.5 — capability `cost-center`

- Files: `docs/workspace/items/h4-5-organization-cost-center-capability/{spec,plan}.md`, roadmap, items index.
- Depends on: Task 10.
- Acceptance: `cost-center/` sở hữu toàn bộ persistence Cost Center; không đổi contract.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 12: hạng mục H4.6 — capability `department`

- Files: `docs/workspace/items/h4-6-organization-department-capability/{spec,plan}.md`, roadmap, items index.
- Depends on: Task 11.
- Acceptance: `department/` với `department-head` tách khỏi service/repo quá ngưỡng; root `organization` dưới ngưỡng;
  ledger gỡ `oversizedFiles` department, `rootControllers`/`rootFiles`, export repo của `OrganizationModule`.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 13: hạng mục H5.1 — lỗi `identity-access` theo capability

- Files: `docs/workspace/items/h5-1-identity-access-errors/{spec,plan}.md`, roadmap, items index.
- Depends on: Task 1 (cùng chạm `auth/`).
- Acceptance: tách `errors/identity-access.errors.ts`; mapper HTTP approval-roles ra `*.http-errors.ts`;
  `SuperAdminTransferRefusedError` ra tệp lỗi; `translateAccountWriteError` về repo; mã lỗi không đổi.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 14: hạng mục H5.2 — ranh giới capability `identity-access`

- Files: `docs/workspace/items/h5-2-identity-access-capability-boundaries/{spec,plan}.md`, roadmap, items index.
- Depends on: Task 13.
- Acceptance: capability khác dùng service/type thay vì repo/policy; phá phụ thuộc hai chiều auth ↔ accounts; ledger
  `crossCapabilityImports` về 0 hoặc mục còn lại có lý do.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 15: hạng mục H5.3 — phiên khi khôi phục qua `SessionRepo`

- Files: `docs/workspace/items/h5-3-recovery-session-revocation/{spec,plan}.md`, roadmap, items index.
- Depends on: Task 14.
- Acceptance: `recovery.repo` không còn ghi `auth_sessions`; nếu cần lý do thu hồi riêng thì tách migration và ghi
  quyết định; hành vi khôi phục không đổi.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 16: hạng mục H5.4 — tách file quá ngưỡng của `identity-access`

- Files: `docs/workspace/items/h5-4-identity-access-file-size/{spec,plan}.md`, roadmap, items index.
- Depends on: Task 15.
- Acceptance: `recovery.service.ts`, `account.repo.ts` dưới ngưỡng; export repo/`PasswordHasher` của facade module xử lý
  theo rule; ledger tương ứng gỡ.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 17: hạng mục H8 — `data-import`

- Files: `docs/workspace/items/h8-data-import-structure/{spec,plan}.md`, roadmap, items index.
- Depends on: Task 9 (dùng `normalizeDisplayName` ở core).
- Acceptance: `employee-import.service.ts` dưới ngưỡng; mapper HTTP khỏi tệp lỗi; `Page<T>` dùng chung; không đổi
  contract.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 18: hạng mục H6.1 — `ops:inspect`

- Files: `docs/workspace/items/h6-1-ops-inspect/{spec,plan}.md`, roadmap, items index.
- Depends on: Prompt 02 xong; có thể song song với H4/H5 (khác module).
- Acceptance: lệnh read-only theo thiết kế ở spec; output không lộ hash/token/mật khẩu/email đầy đủ; exit code phân biệt
  trạng thái.
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 19: hạng mục H6.2 — `dev:seed` chỉ local/test

- Files: `docs/workspace/items/h6-2-dev-seed/{spec,plan}.md`, roadmap, items index.
- Depends on: Task 18.
- Acceptance: chặn production/host không loopback/thiếu cờ; idempotent; qua service; không mật khẩu mặc định commit; tách
  khỏi production bootstrap; chuyển lỗi/advisory lock của installation (ledger).
- Verify: `pnpm rules:check` → 0 lỗi.

### Task 20: hạng mục H7 — role PostgreSQL

- Files: `docs/workspace/items/h7-postgres-roles/{spec,plan}.md`, roadmap, items index.
- Depends on: môi trường cô lập sẵn sàng (Q9); nếu chưa có thì hạng mục `blocked`.
- Acceptance: role runtime không superuser, role migration/deploy riêng; kế hoạch kiểm trên môi trường cô lập trước
  deploy, gồm audit append-only dưới role runtime.
- Verify: `pnpm rules:check` → 0 lỗi.

### Checkpoint cuối

Mọi lát đã có hạng mục; roadmap phản ánh thứ tự; G3 chỉ mở sau H4/H5 và quyết định thiết kế G3 (Q7).

## Verification and handoff

| Lệnh / kiểm tra AC                             | Revision / môi trường             | Kết quả thực chạy                    | Giới hạn / việc còn lại |
| ---------------------------------------------- | --------------------------------- | ------------------------------------ | ----------------------- |
| `pnpm rules:check` (hạng mục này theo mẫu mới) | BE `186ad5f` + thay đổi Prompt 02 | ghi trong báo cáo cuối của Prompt 02 | Task 1–20 chưa bắt đầu  |

- [ ] Mỗi task tạo đúng một hạng mục và hạng mục đó qua `pnpm rules:check`.
- [ ] Không task nào đổi source/test/migration/`openapi.json`.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng
      sự kiện thật.

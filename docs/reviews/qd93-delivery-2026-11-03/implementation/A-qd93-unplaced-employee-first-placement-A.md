# A-qd93-unplaced-employee-first-placement-A (subagent implement Phase A, 03/11/2026)

Nhánh `feat/qd93-unplaced-employee-first-placement` (từ b18ad761). Chỉ Phase A: Task A.1-A.5 + Checkpoint A.
Skill Preflight (CLAUDE.md): đã đọc test-driven-development (process/domain), incremental-implementation (process), verification-before-completion (verification).

## Trạng thái đầu
HEAD b18ad761, tree sạch. Migration mới nhất: 20261102202712_requests_spending_approver_party_cancellation.

## Task A.1 (commit xem git log)
- Migration `20261102223100_organization_placement_keep_one` (hàm + trigger BEFORE DELETE FOR EACH ROW, khóa employees FOR UPDATE, 23001 CONSTRAINT employee_placements_keep_one). Smoke SQL thủ công trên DB tạm scratch trong container slm-test-db (bảng mini, đã DROP): xóa placement 2 OK, xóa placement cuối bị từ chối. KHÔNG chạy test:integration.
- Test mới (viết, CHƯA chạy): `test/integration/organization/employee-placement-keep-one.integration-spec.ts` (4 ca: xóa placement duy nhất 23001; xóa placement mới của điều chuyển khi cũ còn; hai phiên; 55000 vẫn thắng).
- Helper `insertEmployeeWithoutPlacement` (account.builder.ts); `RequestHarness.unplacedStaff`, `SeatHarness.unplacedPerson`; `test/support/placement-cleanup.ts` (`deletePlacementsForCleanup`, tắt trigger đúng một câu lệnh) — dùng cho 2 nơi ngoài plan: `inspect.integration-spec.ts` (finally) và `direct-roles-world.ts` `clearPeople`.
- Sáu spec: access-request-http, requestable-software, service-account-request (unplacedStaff), license-assignment-http (crowd 3 + unplacedPerson SVR3 + person SVR4), organization.integration-spec (bỏ dọn E7), department-integrity-http (không đổi — xóa placement không phải cuối).
- prisma:validate xanh, typecheck xanh, eslint/prettier file đã sửa xanh, test:gates 16 suite/327 xanh.
- Bỏ theo quy trình 5: không có (task này không có phần backfill).

## Task A.2
- `test/support/placement-coverage.ts`: bỏ `no placement`; placement đầu hợp lệ nếu = ngày vào, = ngày ghi hoặc sau CẢ HAI (giữ thông điệp cũ để ca `employee-manual-http` "would catch a placement that starts on neither day" không đổi — 2021-05-05 vẫn vi phạm); người đang làm có placement phải có đúng một placement mở; giữ gap/overlap và terminated.
- 4 ca mới trong `organization.integration-spec.ts` (describe "coverage of a person who may have no placement yet"): không placement => không vi phạm; placement đầu sau cả hai => không; trước ngày vào => vi phạm; hai placement mở (gỡ EXCLUDE trong transaction rồi ROLLBACK) => vi phạm. Lọc theo employee_id vì E7 (gap) còn trong DB của file. CHƯA chạy.
- 9 suite dùng helper "chạy lại": chưa chạy (quy trình 4).

## Task A.3 (red)
- Unit đỏ (log ...-A3-red.log): 8 file, 16 ca đỏ đúng ca mới (employee-row.policy.spec, row-validation policy/placement/parity, file.policy, upload.service, summary/result json).
- Ánh xạ test cũ → mới (xem bảng plan.md): DEPARTMENT_REQUIRED (form/import) → không lý do + chưa xếp phòng; `names the columns that are missing... department_code` → department_code tùy chọn; file/upload spec `missing` bỏ `department_code`; parity blank dept → []; preview integration `no department column` → `no employee code column`; blank dept row → `[]`.
- Bỏ theo quy trình 5: test/`.default(0)` "summary/result import cũ không có khóa mới ⟹ 0" (DB mới, Owner 03/11) — thay bằng ca "thiếu khóa mới bị từ chối" (khóa bắt buộc).
- Integration/wire viết CHƯA chạy: employee-manual-http (describe mới 5 ca), employee-import-preview-http (3 ca mới + 2 đổi), employee-import-confirm-http (3 ca mới), employee-import-wire-http (newUnplaced/createdUnplaced/missing message). ImportWire harness thêm newUnplaced/createdUnplaced (làm ở A.3 thay vì A.5 vì test cần kiểu).

Bạn sửa BE SaaS-Sentry (NestJS + Prisma + PostgreSQL), repo `D:\FPT\FALL2026\Code\BE-dev-software-license-management`.
Làm MỘT việc: danh bạ nhân viên cho Super Admin. Làm GỌN, đúng spec, ngân sách ≤ 2 giờ.

## Cách làm (bắt buộc)
- Spec và plan có sẵn, là nguồn: `docs/workspace/items/employee-directory-read/spec.md` (mục "Ownership", "Behavior and
  design", "Registry", bảng Primary Story/AC) và `plan.md`. Làm theo spec; KHÔNG viết spec/plan mới, KHÔNG chia subagent.
- Spec viết trước bản "nhân viên chưa xếp phòng" tối giản đã merge. Đối chiếu với code thật:
  - vị từ chưa xếp phòng là hàm đã có `OrganizationReadApi.unplacedAmong` / phần SQL tương ứng trong
    `organization/employee` (KHÔNG viết câu SQL "chưa xếp phòng" thứ hai; nếu chỉ có dạng hàm theo danh sách id thì tách
    một mảnh SQL dùng chung từ đúng chỗ đó);
  - response nhân viên đã có `department: {id, code, name} | null` và `unplaced: boolean` — dùng đúng tên này.
- Bỏ qua phần nặng không cần cho demo: KHÔNG bắt buộc test đếm câu lệnh theo "cửa sổ" (mục "Đếm câu lệnh" của spec); chỉ
  cần 1 test integration chứng minh danh sách không N+1 (cùng số câu dữ liệu cho 5 và 30 nhân viên). Giữ mọi thứ khác.
- Test tối thiểu nhưng thật: unit cho policy tìm kiếm (`q` là UUID / mã / email / tên gập dấu, escape `%` `_` `\`), HTTP
  spec cho 2 route (401/403/422/404/200), MỘT file integration `test/integration/organization/employee-directory.integration-spec.ts`
  (tìm theo mã, tên có dấu/không dấu, email, đúng ID; lọc `departmentId`, `unplaced=true/false`, `hasAccount`,
  `workState`, `employmentType`; phân trang; detail có `placements` và `account.roles`; 404). Chạy test THEO ĐƯỜNG DẪN FILE.
- Lấy "hôm nay" trong test bằng `OrganizationReadApi.businessToday()` (giờ Asia/Ho_Chi_Minh), KHÔNG `current_date` của DB.
  Integration cần `TEST_DATABASE_ADMIN_URL=postgresql://ci_integration:ci-integration-only@127.0.0.1:55432/postgres`
  (docker `slm-test-db` phải đang chạy; tắt thì mở Docker Desktop rồi `docker start slm-test-db redis-server`).
- Sau khi xong: `pnpm typecheck` · `pnpm lint` · `pnpm arch:check` · `pnpm rules:check` · `pnpm test:gates` ·
  `pnpm openapi:export` (commit `openapi.json` + `docs/generated/*`). Registry `NESTED_ARRAYS` cho `employeeGet#placements` và
  `employeeGet#account.roles` theo spec (gate api-collection sẽ đòi). KHÔNG chạy `pnpm check`, toàn bộ `test:integration`,
  `test:e2e`, `test:integration:timing`.
- Không push, không merge, không sửa repo `D:\FPT\FALL2026\Docs`, không đụng worktree `D:\FPT\FALL2026\Code\BE-qd93-audit`
  và nhánh `fix/qd93-final` đang checkout ở đó.

## Chuẩn bị nhánh
1. Repo chính đang ở `feat/qd93-lean-employee-codes-unplaced-xlsx` và có file chưa commit
   `test/integration/personnel/offboarding-unplaced-lean.integration-spec.ts` (test đỏ của việc đã hoãn) — XÓA file đó.
   `git status` phải sạch trước khi đổi nhánh.
2. `git checkout -b feat/employee-directory-read fix/qd93-final` (tạo nhánh mới từ đỉnh hiện tại của `fix/qd93-final`;
   không checkout chính `fix/qd93-final`). Ghi base SHA vào báo cáo.
3. `pnpm install --frozen-lockfile`, `pnpm prisma:generate`.

## Contract (tóm tắt từ spec — spec thắng khi khác)
- `GET /api/v1/employees` (SUPER_ADMIN): query `q` (≤100), `departmentId`, `unplaced`, `workState`, `employmentType`,
  `hasAccount`, `page`, `pageSize` (1–100, mặc định 20); khóa lạ ⟹ 422. Item: `id`, `employeeCode`, `fullName`,
  `workEmail`, `employmentType`, `status`, `workState`, `hireDate`, `jobTitle`, `department | null`, `unplaced`,
  `account: { id, status, activationState, employeeLeft } | null`. Thứ tự `employee_code, id`. Message `EMPLOYEE.LISTED`.
- `GET /api/v1/employees/{id}` (SUPER_ADMIN): summary + `placements` (mới nhất trước, tối đa 50, `placementsHasMore`) +
  `account.roles`. Không có ⟹ 404 `EMPLOYEE.NOT_FOUND`. Message `EMPLOYEE.FETCHED`.
- `departmentMemberList` item thêm `employeeId` (additive).

## Báo cáo cuối: `D:\FPT\FALL2026\NOTE MD\codex-employee-directory-report.md`
Nhánh, base SHA, SHA cuối, commit; file chính; lệnh đã chạy + kết quả THẬT; phần lệch spec; contract cho FE (ví dụ
request/response). Ghi rõ "pnpm check và test toàn bộ CHƯA chạy".

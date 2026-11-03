Bạn sửa BE SaaS-Sentry (NestJS + Prisma + PostgreSQL), repo `D:\FPT\FALL2026\Code\BE-dev-software-license-management`.
Làm 3 việc nhỏ dưới đây theo cách GỌN NHẤT đáp đúng yêu cầu — sắp giao code, tốc độ quan trọng hơn phủ mọi ca biên.

## Cách làm (bắt buộc)
- KHÔNG viết spec/plan mới, KHÔNG dùng quy trình nhiều subagent. Tự làm trực tiếp, mỗi việc một commit (hoặc vài commit nhỏ).
- Spec cũ trong `docs/workspace/items/qd93-code-format-xlsx-employee-import/` và `.../qd93-unplaced-employee-first-placement/`
  chỉ để TRA tên/quyết định khi cần; KHÔNG làm theo plan 21 task / 10 task của chúng. Nếu `pnpm rules:check` đòi cập nhật hồ
  sơ hạng mục, chỉ sửa tối thiểu (trạng thái + 1 dòng "triển khai bản tối giản theo Owner 03/11/2026").
- Test tối thiểu nhưng thật: unit cho policy/validate, HTTP spec cho route đổi/mới, MỘT file integration mới cho mỗi việc
  (ca chính + 1–2 ca lỗi). Chạy test THEO ĐƯỜNG DẪN FILE. Không xóa/nới test của hành vi giữ nguyên; test cũ đỏ vì hành vi
  ĐƯỢC YÊU CẦU đổi (vd. `DEPARTMENT_REQUIRED`) thì sửa assertion theo hành vi mới.
- Sau mỗi việc: `pnpm typecheck` · `pnpm lint` · `pnpm arch:check` · `pnpm rules:check` · `pnpm test:gates` ·
  `pnpm openapi:export` (commit `openapi.json` + `docs/generated/*` nếu đổi). KHÔNG chạy `pnpm check`, toàn bộ
  `test:integration`, `test:e2e`, `test:integration:timing`.
- Integration cần biến môi trường (DB test docker `slm-test-db` cổng 55432 đang chạy):
  `TEST_DATABASE_ADMIN_URL=postgresql://ci_integration:ci-integration-only@127.0.0.1:55432/postgres`.
  Lưu ý giờ: test lấy "hôm nay" phải dùng `OrganizationReadApi.businessToday()` (giờ Asia/Ho_Chi_Minh), KHÔNG dùng
  `current_date` của DB (UTC) — nếu không test sẽ đỏ từ 0h–7h sáng.
- Không push, không merge, không sửa repo `D:\FPT\FALL2026\Docs`, không đụng worktree `D:\FPT\FALL2026\Code\BE-qd93-audit`
  và nhánh `fix/qd93-final` đang checkout ở đó.
- Ngân sách thời gian: Việc 1 ≤ 45 phút, Việc 2 ≤ 2 giờ, Việc 3 ≤ 1,5 giờ. Quá ngân sách → commit phần đã xanh, ghi rõ phần
  còn thiếu vào báo cáo, sang việc sau.

## Chuẩn bị nhánh
1. Repo chính đang ở nhánh `feat/qd93-unplaced-employee-first-placement` với ~12 file CHƯA commit (bản dở cũ, bỏ). Cất lại
   bằng commit WIP trên chính nhánh đó: `git add -A && git commit -m "wip: abandoned unplaced A.4 (superseded by lean fix)"`.
   KHÔNG dùng `git stash`.
2. Nếu Owner đã merge `fix/qd93-final` vào `dev` thì tạo nhánh từ `dev`; nếu chưa thì từ `fix/qd93-final`:
   `git checkout -b feat/qd93-lean-employee-codes-unplaced-xlsx <dev|fix/qd93-final>`. Ghi base SHA vào báo cáo.
3. `pnpm install --frozen-lockfile` (Việc 3 thêm dependency thì cập nhật lockfile), `pnpm prisma:generate`.

## Việc 1 — Định dạng mã nhân viên và mã phòng
- Quy tắc (QĐ-93i): regex `^[A-Z0-9]+(-[A-Z0-9]+)*$`; mã PHÒNG dài 2–20, mã NHÂN VIÊN dài 3–20. Đầu vào được `trim` và
  CHUYỂN CHỮ HOA trước khi kiểm và trước khi lưu (gửi `nv-001` ⟹ lưu `NV-001`). Tìm phòng theo `departmentCode` cũng so
  bằng chữ hoa.
- Áp ở MỌI chỗ nhận mã: tạo nhân viên nhập tay, từng dòng import nhân viên (dùng chung policy dòng ở
  `src/modules/organization/public/employee-placement.policy.ts` / `employee-row.policy.ts`), tạo phòng (và sửa mã phòng nếu
  route cho sửa), mã phòng trong `departmentCode` khi tạo nhân viên/import.
- Lỗi: dòng nhân viên/import dùng cơ chế lý do dòng sẵn có, thêm `EMPLOYEE_CODE_INVALID`, `DEPARTMENT_CODE_INVALID`
  (cùng kiểu với `DEPARTMENT_NOT_FOUND`); tạo phòng mã sai ⟹ 422 `DEPARTMENT.CODE_INVALID`. Message nêu rõ định dạng.
- OpenAPI: thêm `pattern`, `minLength`/`maxLength` và mô tả tiếng Anh có ví dụ (`NV-0001`, `P-ENG`) cho các field mã để FE
  biết nhập gì.
- Kiểm fixture: grep mã trong `src/cli/demo-dataset/**`, `src/modules/installation/dev-seed/**`, `test/support/**` — mã nào
  không hợp lệ (chữ thường, `_`, `.`, quá ngắn/dài) thì sửa fixture. Chạy unit của demo-dataset/dev-seed theo file.
- DB mới, không cần migration chuyển dữ liệu.

## Việc 2 — `departmentCode` không bắt buộc + xếp phòng sau (bản tối giản)
Hành vi cần có:
1. Tạo nhân viên nhập tay và import: `departmentCode` TÙY CHỌN.
   - Có mã: phòng phải tồn tại và đang hoạt động (giữ `DEPARTMENT_NOT_FOUND` / `DEPARTMENT_INACTIVE` như hiện tại).
   - Không có mã (thiếu, `null`, chuỗi rỗng sau trim): tạo hồ sơ KHÔNG có dòng placement nào = "chưa xếp phòng". Bỏ lý do
     `DEPARTMENT_REQUIRED`. Không Cost Center, không thông báo "có người mới".
2. Response nhân viên (create, import preview/result, mọi chỗ trả employee có `department`): `department` nullable, thêm
   `unplaced: boolean`. Tóm tắt import thêm bộ đếm `newUnplaced`.
3. Route MỚI `POST /api/v1/employees/{id}/first-placements` — chỉ `SUPER_ADMIN`. Body `{ departmentId: uuid, effectiveFrom:
   YYYY-MM-DD }`. Trả 201 với hồ sơ nhân viên. Quy tắc:
   - nhân viên tồn tại (404 nếu không), đang ACTIVE (không đã nghỉ/đang bàn giao nghỉ việc ⟹ 409);
   - nhân viên CHƯA có dòng placement nào, kể cả tương lai (đã có ⟹ 409 `EMPLOYEE.ALREADY_PLACED`, message: "đổi phòng
     dùng điều chuyển");
   - phòng tồn tại và đang hoạt động (404 / 409 `DEPARTMENT.INACTIVE`);
   - `effectiveFrom` ≥ hôm nay theo `businessToday()` và ≥ `hireDate` (sai ⟹ 422);
   - không cần căn cứ (không hrBasis), không phải sự kiện nhân sự; ghi Audit Trail `EMPLOYEE.FIRST_PLACED`;
   - khóa dòng phòng rồi dòng nhân viên trong một transaction (theo thứ tự khóa sẵn có của module organization);
   - nếu tạo nhân viên CÓ phòng hiện đang báo "có người mới" cho IT Admin phụ trách phòng thì gọi lại đúng cơ chế đó; nếu
     không có sẵn thì bỏ qua, ghi vào báo cáo.
4. Người chưa xếp phòng KHÔNG được là bên của Request: điền tập `unplacedEmployeeIds` trong
   `src/modules/identity-access/request-party/request-party-eligibility.service.ts` (hiện trả `new Set()`) bằng một hàm đọc
   công khai của organization (vd. `OrganizationReadApi.unplacedAmong(tx, employeeIds)` = nhân viên không có dòng placement
   nào). Policy chung đã có nhánh `UNPLACED` ⟹ mọi route tạo/xem trước Request tự trả 422 `REQUEST_PARTY.INELIGIBLE`
   `details.reason = 'UNPLACED'`; danh sách chọn người thụ hưởng tự loại. Giữ đúng ranh giới module (arch:check).
5. Không để lỗi 500 ở chỗ cũ vốn giả định ai cũng có phòng. Grep các nơi đọc phòng/placement hiện tại của nhân viên (hồ sơ,
   danh sách tài khoản, `/me`, thành viên phòng, dashboard, personnel, Cost Center suy ra) và cho chúng xử lý `null`. Cụ thể:
   - gán trưởng phòng / người kế nhiệm là người chưa xếp phòng ⟹ từ chối 4xx rõ ràng (dùng mã sẵn có nếu đã có);
   - ghi điều chuyển cho người chưa xếp phòng ⟹ 409 `DEPARTMENT_TRANSFER.EMPLOYEE_UNPLACED` ("chưa xếp phòng — dùng xếp
     phòng lần đầu");
   - TẠM THỜI ghi nghỉ việc cho người chưa xếp phòng ⟹ 409 `OFFBOARDING.EMPLOYEE_UNPLACED` ("xếp phòng trước khi ghi nghỉ
     việc"). Đây là bản tối giản, LỆCH QĐ-93g(5) (luồng rút gọn) — ghi rõ vào báo cáo để làm đợt sau.
   - KHÔNG làm trigger DB `INV-20`, không làm hủy lịch xếp phòng tương lai, không làm luồng nghỉ việc rút gọn.
6. Test: unit policy xếp phòng; HTTP spec route mới (401/403/404/409/422/201); 1 file integration
   `test/integration/organization/first-placement-lean.integration-spec.ts`: tạo không phòng (nhập tay + 1 dòng import) ⟹
   `unplaced: true`, không placement; người đó có tài khoản gửi Access Request ⟹ 422 `UNPLACED`; xếp phòng lần đầu ⟹ 201,
   sau đó gửi được (hoặc ít nhất không còn `UNPLACED`); xếp lần hai ⟹ 409; đọc hồ sơ / `/me` của người chưa xếp phòng không
   500. Sửa các test cũ đang kiểm `DEPARTMENT_REQUIRED`.

## Việc 3 — Import nhân viên bằng Excel `.xlsx` + file mẫu
1. Route upload hiện có `POST /api/v1/employee-imports` (`employee-imports.controller.ts`, đang nhận CSV) nhận THÊM `.xlsx`:
   - nhận diện bằng đuôi `.xlsx` hoặc content-type
     `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` VÀ chữ ký ZIP `PK\x03\x04`; `.xls`/loại khác ⟹ 422
     `IMPORT.FILE_FORMAT_UNSUPPORTED` (thêm vào `FileProblem`/http-errors cùng kiểu sẵn có);
   - đọc sheet ĐẦU TIÊN, dòng 1 là header với ĐÚNG tên cột như CSV (`employee_code`, `full_name`, `work_email`,
     `employment_type`, `hire_date`, `department_code`, `job_title`); ô → chuỗi: ô ngày của Excel ⟹ `YYYY-MM-DD`, số ⟹ chuỗi
     không có `.0`, công thức ⟹ lấy giá trị đã tính (không tính lại), ô trống ⟹ rỗng; bỏ dòng trống hoàn toàn ở cuối;
   - chuyển thành đúng cấu trúc dòng mà luồng CSV đang dùng rồi đi tiếp preview → confirm như CSV (KHÔNG nhân đôi logic
     validate). Giữ giới hạn sẵn có (kích thước file, tối đa 1000 dòng); file xlsx hỏng ⟹ `IMPORT.FILE_UNREADABLE`.
   - Thư viện: `exceljs` ghim CHÍNH XÁC `4.4.0` trong `dependencies` (không `^`). Kiểm license/audit nhanh.
2. File mẫu trong `docs/examples/employee-import/` (bản cũ sai cột — THAY):
   - `employee-template.csv` + `employee-template.xlsx`: chỉ header + 1 dòng ví dụ;
   - `employees-15.csv` + `employees-15.xlsx`: 15 dòng hợp lệ, mã đúng Việc 1, phòng dùng mã có trong demo dataset
     (`src/cli/demo-dataset/fixture/shared-demo-v1.ts`, vd. `DS1-ENG`, `DS1-DES`, `DS1-OPS`), trong đó 3 dòng để trống
     `department_code` (chưa xếp phòng); email không trùng tài khoản demo;
   - `employees-invalid.csv` + `employees-invalid.xlsx`: mỗi lý do lỗi chính một dòng (mã sai định dạng, mã phòng không tồn
     tại, thiếu tên, email sai, ngày sai, loại hợp đồng sai, trùng mã trong file);
   - `README.md`: tiếng Việt, mô tả cột, định dạng mã, ngày `YYYY-MM-DD`, cột phòng tùy chọn, cách FE thử (upload → preview
     → confirm), kết quả mong đợi; `expected-results.json` cập nhật theo các file mới.
   - Sinh `.xlsx` bằng script `scripts/examples/build-employee-import-examples.mjs` (dùng exceljs, chạy lại được); thêm
     `docs/examples/employee-import/*.xlsx binary` vào `.gitattributes` nếu chưa có.
3. Test: unit cho bộ đọc xlsx (ngày, số, ô trống, sheet rỗng, file không phải xlsx); một unit/spec đọc CẢ 6 file mẫu qua
   bộ đọc + policy dòng và so với `expected-results.json` (không cần DB); HTTP spec upload xlsx hợp lệ + `.xls` ⟹ 422 `IMPORT.FILE_FORMAT_UNSUPPORTED`; 1 integration
   upload `employees-15.xlsx` → preview đúng số dòng/`newUnplaced: 3` → confirm.

## Báo cáo cuối (một file): `D:\FPT\FALL2026\NOTE MD\codex-lean-3-tasks-report.md`
- Nhánh, base SHA, SHA cuối, danh sách commit.
- Mỗi việc: làm gì, file chính, lệnh đã chạy + kết quả THẬT (số pass/fail), phần chưa làm/lệch (đặc biệt nghỉ việc người
  chưa xếp phòng = 409 tạm thời).
- Thay đổi contract cho FE: field/route/mã lỗi mới, ví dụ body/response của `first-placements`, định dạng mã, upload xlsx.
- Ghi rõ: "pnpm check và test toàn bộ CHƯA chạy". Không ghi "xanh" khi chưa chạy.

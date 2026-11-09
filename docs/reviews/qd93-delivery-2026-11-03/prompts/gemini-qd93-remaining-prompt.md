Bạn sửa BE SaaS-Sentry (NestJS + Prisma + PostgreSQL), repo `D:\FPT\FALL2026\Code\BE-dev-software-license-management`.
Làm NỐT các việc còn lại của gói sửa lỗi `QĐ-93`, theo thứ tự ở mục "Việc", chạy liền mạch tới hết.

## Đọc trước
- `docs/roadmap.md`, mục "Việc còn lại của gói `QĐ-93` (ghi 03/11/2026)": danh sách việc và việc đã có trong code.
- `docs/reviews/qd93-delivery-2026-11-03/README.md`: những gì đã giao. Bài học của lần trước nằm ở
  `docs/reviews/qd93-delivery-2026-11-03/audit/findings.md` và `review-directory.md`; đừng lặp lại các lỗi đó.
- Spec, plan, test-plan của từng việc trong `docs/workspace/items/<slug>/`. Spec là nguồn về nghiệp vụ. Nhiều plan viết
  TRƯỚC code hiện tại, nên phải đối chiếu tên file và route với code thật trước khi làm. KHÔNG viết spec hay plan mới,
  KHÔNG chia subagent.

## Nhánh
- `git status` phải sạch, đang ở `dev` = `origin/dev` (`30d14ac4` hoặc mới hơn). Chạy `git pull --ff-only`.
- `git checkout -b feat/qd93-remaining`. Mỗi việc một hoặc vài commit nhỏ, message dạng `qd93-remaining <việc>: ...`.
- Không push, không merge, không sửa repo `D:\FPT\FALL2026\Docs`.

## Luật cứng (lần trước bị bắt lỗi ở đúng những chỗ này)
1. KHÔNG xóa, skip hay nới test hoặc gate để cho xanh. Chỉ được sửa assertion khi hành vi đổi đúng theo spec của việc
   đang làm, và phải ghi lại "cũ → mới" trong báo cáo. KHÔNG sửa `.gitattributes`, và KHÔNG sửa test GATE-EOL hay các
   gate trong `test/gates/` để chấp nhận thay đổi của mình.
2. SQL thô trong `Prisma.sql` template: escape của LIKE phải viết `ESCAPE '\\'` (trong template literal, `'\'` bị biến
   thành `''`). Mọi giá trị người dùng nhập phải là tham số. Khi có test tìm kiếm, thêm một dòng "mồi" để chứng minh ký
   tự `_` và `%` được hiểu đúng nghĩa đen.
3. DTO: `createZodDto` lấy từ `src/infrastructure/http/dto/zod-dto`, KHÔNG import thẳng `nestjs-zod`. Wire message bằng
   tiếng Anh, ≤ 160 ký tự.
4. Test lấy "hôm nay" bằng `OrganizationReadApi.businessToday()` (giờ Asia/Ho_Chi_Minh), KHÔNG dùng `current_date` của
   DB. Mã nhân viên và mã phòng trong fixture theo `^[A-Z0-9]+(-[A-Z0-9]+)*$` (phòng 2–20, nhân viên 3–20 ký tự).
5. Mỗi khi thêm, gỡ hay đổi một operation HTTP, phải cập nhật trong cùng commit:
   - `test/support/api-coverage-manifest.ts`;
   - `test/support/openapi-example-manifest.ts` (success message);
   - `test/support/openapi-example-route-codes-*.ts` (mã lỗi theo status);
   - số operation trong `test/http/platform/openapi-presentation.http-spec.ts`;
   - pattern nghiệp vụ mới (nếu có) trong `test/support/openapi-inventory.ts`;
   - chạy `pnpm openapi:export`, `pnpm arch:graph`, `pnpm arch:routes` rồi commit kết quả.
6. Migration mới phải chạy được trên DB trống VÀ trên DB đã có bootstrap cùng dữ liệu demo `shared-demo-v1`. VPS là cài
   đặt mới (không có dữ liệu cũ trước `QĐ-93`), nhưng có thể đã nạp demo. Chỉ được drop bảng hoặc cột ở Việc 5, và mỗi
   migration drop phải có guard: còn dòng dữ liệu chặn thì `RAISE EXCEPTION`, không xóa âm thầm.

## Kiểm sau MỖI việc (phải xanh mới qua việc sau)
`pnpm typecheck` · `pnpm lint` · `pnpm arch:check` · `pnpm rules:check` · `pnpm arch:docs:check` · `pnpm format:check` ·
`pnpm test:gates` · `pnpm openapi:export` (không còn drift) · **`pnpm test:http` TOÀN BỘ** (không cần DB, vài phút) · unit
theo đường dẫn file · integration theo đường dẫn file (các file mới và file bị ảnh hưởng). KHÔNG chạy toàn bộ
`test:integration`, `test:e2e`, `pnpm check`: Claude sẽ chạy khi audit.

Integration cần:
`TEST_DATABASE_ADMIN_URL=postgresql://ci_integration:ci-integration-only@127.0.0.1:55432/postgres`
(Docker `slm-test-db` phải chạy; nếu không thì mở Docker Desktop rồi `docker start slm-test-db redis-server`). KHÔNG
dùng bộ lọc `-t`.

## Việc (theo thứ tự)

### Việc 1: Các điểm nhỏ còn mở (khoảng 1 giờ)
Xem dòng "Điểm nhỏ còn lại của bản tối giản" trong roadmap và
`docs/reviews/qd93-delivery-2026-11-03/audit/review-codex-lean.md` / `review-directory.md`.
- **XLSX nén giải ra rất lớn:** trước khi gọi `workbook.xlsx.load`, đọc central directory của ZIP để cộng kích thước
  giải nén. Vượt ngưỡng hợp lý (ví dụ 20 MB) thì trả 422 `IMPORT.FILE_UNREADABLE` hoặc một mã rõ ràng có khai trong
  OpenAPI. Thêm unit test.
- **Mã chưa chuyển chữ hoa:** cột `employee_code` của seat baseline (`seat-baseline-rows.policy.ts`) và tham số
  `--department` của `assign-subscription-owner.arguments.ts`, `cost-center-direction.arguments.ts`: trim rồi chuyển
  chữ hoa trước khi tìm.
- **OpenAPI `pattern` chỉ nhận chữ hoa** trong khi server nhận chữ thường rồi tự đổi: mô tả rõ hành vi đó trong
  `description` (giữ `pattern` nếu gate yêu cầu). Preview Access Request khai thêm 422 `REQUEST_PARTY.INELIGIBLE`.
- **Tệp mẫu import:** `employee-template` và `employees-15` đang trùng mã `NV-0001`. Đổi mã của template, sinh lại bằng
  `scripts/examples/build-employee-import-examples.mjs`, cập nhật `expected-results.json`.
- **Danh bạ:**
  - bỏ bản trùng của `escapeLikePattern` (dùng chung một hàm);
  - bỏ kiểu `EmployeePlacementRow` không còn dùng;
  - thêm integration test cho các ca biên: `valid_to` = hôm nay, `valid_from` = hôm nay, lọc `workState`, nhân viên
    chỉ có lần xếp phòng tương lai (`department: null`, `unplaced: false`), email có `+tag`, UUID chữ hoa, `totalItems`
    ở trang vượt quá trang cuối, 51 placement (`placementsHasMore`).
- **Message tiếng Việt trên wire:** đổi sang tiếng Anh, ví dụ `OFFBOARDING.EMPLOYEE_UNPLACED`
  (`offboarding.http-errors.ts`), và các message tiếng Việt khác nếu tìm thấy trong `*.http-errors.ts`.

### Việc 2: Dashboard đếm thật (khoảng 1 giờ)
Spec và plan: `docs/workspace/items/dashboard-request-queues-wiring/`, Task 1 và Task 2. `requests` / `needApprovals`
trên dashboard phải đếm đúng như hai danh sách nguồn (ví dụ `needDecisionList`); bỏ `reason`
`REQUEST_QUEUE_NOT_DELIVERED`. Test: integration so số đếm với danh sách nguồn, ở cả trường hợp 0 và > 0.

### Việc 3: Nghỉ việc của nhân viên chưa xếp phòng, theo `QĐ-93g`(5) (khoảng 3–4 giờ)
Spec và plan: `docs/workspace/items/qd93-unplaced-employee-first-placement/`, Phase D (Task D.1–D.5, D.7) và Task A.1
(trigger `INV-20`); test ở `test-plan.md`. Hiện code trả 409 tạm thời `OFFBOARDING.EMPLOYEE_UNPLACED`
(`offboarding-preconditions.service.ts`). Bỏ 409 này và làm đúng các quyết định:
- `D-S14`, `D-S18`: Super Admin ghi nghỉ việc **có căn cứ** cho người KHÔNG có dòng placement nào, theo luồng rút gọn:
  - không tạo nghĩa vụ trưởng phòng xác nhận bàn giao ở bất kỳ bước nào, kể cả khi mở tác vụ thu hồi (`licensing/handover`);
  - khóa tài khoản (nếu có) và mở tác vụ thu hồi quyền/seat như luồng thường;
  - hồ sơ nghỉ việc có `department: null`, hiển thị cho Super Admin và MỌI IT Admin dùng được.
- `D-S17`, `D-S28`: người chỉ có lần xếp phòng **tương lai**:
  - ngày làm việc cuối **trước** ngày hiệu lực: đi luồng rút gọn, và **hủy** lần xếp phòng chưa hiệu lực trong cùng
    transaction (ghi Audit Trail);
  - ngày làm việc cuối **từ** ngày hiệu lực trở đi: giữ lần xếp phòng; ghi trước ngày hiệu lực thì từ chối 409
    `FIRST_PLACEMENT_PENDING`; từ ngày hiệu lực thì đi luồng nghỉ việc thường.
  - hủy hồ sơ nghỉ việc thì khôi phục lần xếp phòng đã bị hủy (Task D.3).
- `D-S17`: xếp phòng lần đầu cho người **đang bàn giao** để nghỉ việc ⟹ 409 `EMPLOYEE.FIRST_PLACEMENT_EMPLOYEE_LEAVING`;
  người đã nghỉ việc ⟹ giữ mã hiện có. Đối chiếu với `EMPLOYEE.EMPLOYEE_INACTIVE` đang có, chọn đúng theo spec.
- Migration: `offboarding_cases.department_id` cho phép null, cùng các ràng buộc liên quan (Task D.1). Thêm trigger
  `INV-20`: đã có placement thì không bao giờ quay về "chưa xếp phòng" (Task A.1). Trigger phải an toàn với dữ liệu demo
  đang có trên VPS.
- Test: integration cho cả ba ca (chưa xếp phòng; xếp phòng tương lai mà ngày cuối trước ngày hiệu lực; ngày cuối từ
  ngày hiệu lực trở đi), cho việc hủy hồ sơ và khôi phục, cho phạm vi IT Admin đọc được, và test chứng minh không có
  nghĩa vụ trưởng phòng. Bỏ test đang kỳ vọng 409 tạm và ghi "cũ → mới".

### Việc 4: Trưởng phòng và Finance đính kèm tệp cho hồ sơ ngân sách (khoảng 3–4 giờ)
Spec và plan: `docs/workspace/items/qd93-budget-record-attachments/` (Task 1–10; test matrix trong spec), `QĐ-93j`,
`D-S24`. Dùng lại hạ tầng tài liệu/kho tệp đang có (module `documents`, object storage). Làm đủ:
- khai báo, tải lên, hoàn tất, liệt kê, tải về theo quyền và gỡ tệp cho đề xuất và phiên bản ngân sách;
- `attachmentIds` khi gửi hoặc gửi lại;
- danh sách các phiên bản đã gửi theo phạm vi trưởng phòng, không có số tiền;
- quy tắc `D-S24`: trưởng phòng chỉ thấy tệp tồn tại ở lần gửi gần nhất khi phiên bản đang `CHANGES_REQUESTED`;
- sweeper dọn tệp chưa tải lên hoặc chưa gửi;
- tệp mẫu cho FE.

Nếu hết thời gian thì dừng ở ranh giới một task, đã commit và xanh, rồi ghi rõ phần còn lại trong báo cáo.

### Việc 5: Gỡ hẳn cơ chế và bảng cũ (khoảng 2–3 giờ, commit riêng, làm sau cùng)
VPS là cài đặt mới nên không có dữ liệu cũ cần chuyển đổi. Seed và dữ liệu demo đã không ghi vào các bảng này.
- **Người duyệt dự phòng / người thay thế, Phase B.** Plan: `docs/workspace/items/qd93-remove-fallback-substitute-approvers/plan.md`,
  Task 13. Task 12 (preflight) BỎ vì DB mới. Thay vào đó, guard nằm ngay trong migration: còn dòng
  `approval_role_holders`, hoặc còn bước chờ với lý do cũ hay đang đóng băng chờ chuyển đổi, thì `RAISE EXCEPTION`.
  - Migration: viết lại `role_grants_forbid_super_admin_for_heads_and_approvers()` từ định nghĩa hiện hành, sao cho
    trigger vẫn chặn Super Admin làm trưởng phòng. Gỡ trigger và hàm `approval_role_holders_distinct`, bảng
    `approval_role_holders`, enum `ApprovalRole`. Bỏ các giá trị enum chuyển tiếp chỉ dùng cho chuyển đổi (Postgres phải
    tạo lại type).
  - Code: gỡ nhánh REWAIT / đóng băng (`awaitsConversion`, `STEP_AWAITING_CONVERSION`), `everHeldSpendingApproverAmong`,
    các giá trị wire `NO_FALLBACK_APPROVER`, `FALLBACK_IS_REQUESTER`, `NO_CONFLICT_SUBSTITUTE`, và model Prisma
    `ApprovalRoleHolder` / `Employee.approvalRoles`. GIỮ nguyên `SPENDING_APPROVER_PARTY` và mọi hành vi hiện hành.
  - Test: test của cơ chế bị gỡ được xóa hoặc thay, kèm bảng "test cũ → test mới". Thêm
    `drop-approval-role-holders-migration.integration-spec.ts` gồm hai ca: guard dừng khi còn dòng chặn; khi sạch thì gỡ
    xong và vẫn chặn Super Admin làm trưởng phòng.
- **Dự án, phase 2.** Plan: `docs/workspace/items/qd93-remove-department-projects/plan.md`, Task 2.1–2.3. Drop cột
  `project_label`, bảng `projects` và `project_departments`, cùng model Prisma tương ứng. Bỏ `Project` /
  `ProjectDepartment` khỏi `PRISMA_MODEL_OWNER`. Codec của bản nháp vẫn bỏ qua khóa `projectLabel` cũ.
- Sau Việc 5: chạy `pnpm prisma:validate`; chạy integration theo file cho các file migration và các file bị ảnh hưởng.
  Ghi trong báo cáo danh sách migration mới theo đúng thứ tự.

## Báo cáo cuối: `D:\FPT\FALL2026\NOTE MD\gemini-qd93-remaining-report.md`
- Nhánh, base SHA, SHA cuối, danh sách commit theo từng việc.
- Mỗi việc: đã làm gì, file chính, migration mới, lệnh đã chạy kèm kết quả THẬT (số pass/fail), bảng "test cũ → test mới"
  nếu có, chỗ lệch spec và lý do, phần chưa xong.
- Contract cho FE: operation, field và mã lỗi mới hoặc đổi, kèm ví dụ request/response.
- Ghi rõ: "toàn bộ test:integration, test:e2e và pnpm check CHƯA chạy — Claude chạy khi audit". Không ghi "xanh" cho phần
  chưa chạy.

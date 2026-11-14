# AUDIT-C — review code vùng C của MF-2/MF-3 (`06bfa6f9..9580e179`)

> Reviewer chỉ đọc, 14/11/2026, nhánh `feat/mf2-mf3` HEAD `9580e179`. Không sửa code/test, không chạy pnpm/jest/docker, không đổi git.
> Mọi kết luận dưới đây có căn cứ là dòng code đã đọc hoặc chữ của QĐ/BRD/SPEC; "mutation" là đề xuất cho người sửa, **chưa chạy**.
>
> **Skill đã đọc/dùng:**
>
> - `agent-skills:code-review-and-quality`: process + review năm trục, cách phân mức Critical/Required/Optional/Nit.
> - `superpowers:verification-before-completion`: mỗi kết luận phải có trích dẫn file:dòng hoặc nguồn QĐ, không tuyên bố "test xanh".
>
> **Căn cứ đã đọc:**
>
> - SPEC v2.3 §3–§5: P16–P24, P29, X-IT, DS, RD.
> - PLAN v2.4: X-IT, DS, RD, AUDIT-LEFT.
> - OVERNIGHT-DECISIONS D-103 → D-129, AUDIT-DN-1/2 (không lặp lại điểm đã có), HANDOFF-CODE (các dòng gate).
> - Docs `QĐ-110k/l/s/t/u/v/j`, `QĐ-111c/g/r/bc`, BRD dòng 287/304/316 (`SoD-4`, một vai mỗi tài khoản), tài liệu "Quy trình và chính sách theo
>   main flow".

**Tổng:** Critical 0 · Required 3 · Optional 7 · Nit 4.

Ba điểm được giao soi kỹ:

- **D-105 ⟹ C-2.** Required, CẦN-OWNER: có thêm mâu thuẫn mới ngay trong một phản hồi.
- **D-103 ⟹ C-3.** Required, CẦN-OWNER.
- **D-122(a) ⟹ C-8.** Hạ xuống Optional: bất biến một vai làm ca này gần như không xảy ra, xem lý do ở C-8.

---

## Phần 1 — Finding code

### C-1 · Required · `PATCH /plans/{id}` gửi lại đúng `provisioningType: 'K4'` làm mất cờ `hasAdminConsole`

- **File:** `src/modules/catalog/plan/plan.service.ts:185-186`

  ```ts
  hasAdminConsole: input.hasAdminConsole ?? (input.provisioningType === undefined ? current.hasAdminConsole : false),
  ```

- **Kịch bản lỗi.**
  1. Gói `K4` có `hasAdminConsole = true`, đã có hồ sơ hai admin và thuê bao `ACTIVE`.
  2. FE (form sửa gói thường gửi đủ trường) gửi `PATCH { name: 'JetBrains All (2027)', provisioningType: 'K4' }`.
  3. `input.provisioningType !== undefined` ⟹ cờ thành `false` dù loại **không đổi**. Không có lỗi trả về; Audit `PLAN.UPDATED` chỉ ghi lại
     sự thay đổi.
- **Hệ quả:**
  - gói hết "cần admin" (`needsVendorAdmins` = false);
  - cổng `SUBSCRIPTION.VENDOR_ADMINS_REQUIRED` không còn chặn;
  - cờ `vendorAdminsBelowMinimum`/`ownerAccountEmailMissing` của thuê bao tắt, `plansBelowVendorAdminMinimum` giảm;
  - `PUT …/workspace-profile` trả 422 `WORKSPACE_PROFILE_NOT_APPLICABLE`, nên IT không sửa được hồ sơ còn nằm đó.
- **Căn cứ.**
  - `QĐ-110k`: gói `K4` mang cờ bắt buộc ≥ 2 admin.
  - Ý của D-103 (2) chỉ là "đổi loại **khỏi** `K4`" thì cờ về `false`.
  - Kiểm đổi loại ở dưới (`next.provisioningType !== current.provisioningType`, dòng 191) cũng cho thấy "đổi loại" nghĩa là khác loại hiện tại.
- **Cách sửa.**

  ```ts
  hasAdminConsole: input.hasAdminConsole ?? (next.provisioningType === 'K4' ? current.hasAdminConsole : false),
  ```

  Cần tính `next.provisioningType` trước. Đổi `K2 → K4` vẫn cho `false`, vì `current.hasAdminConsole` của `K2` luôn `false` (CHECK
  `plans_admin_console_k4_only`).
- **Mutation/test.** Thêm ca vào `test/integration/catalog/plan-admin-console-http.integration-spec.ts`:
  - gói `K4` có cờ;
  - `PATCH { provisioningType: 'K4', name: 'x' }`;
  - mong `hasAdminConsole: true`.

  Code hiện tại cho `false` (đỏ), sửa xong thì xanh. Đột biến ngược: trả lại điều kiện `input.provisioningType === undefined` ⟹ ca đỏ.

### C-2 · Required · CẦN-OWNER (D-105) · Kích hoạt thuê bao đếm người **đã ghi**, không đếm người **còn làm việc**; cùng một phản hồi vừa cho qua vừa gắn cờ thiếu admin

- **File:**
  - `src/modules/catalog/subscription/pool/subscription-pool.service.ts:141-150` (`given = new Set(profile.members…).size`);
  - nơi gọi `subscription.service.ts:177` (tạo), `:247` (`completions`), `pool/subscription-pool.service.ts:163` (`judgeChange` PATCH nháp ⟹ hoạt
    động).
- **Kịch bản lỗi.**
  1. Hồ sơ gói `K2` ghi A, B. B có hồ sơ nghỉ việc `BLOCK_NOW` (khối chặn từ hôm nay) hoặc đã nghỉ hẳn.
  2. IT `POST /subscriptions` đủ dữ liệu ⟹ **201**. Cổng chỉ đếm 2 người đã ghi.
  3. Body 201 trả `vendorAdminsBelowMinimum: true`, vì `SubscriptionViewService.vendorAdminsOf` dùng `workingAdminsAmong` (blocked bị loại).

  Hệ thống vừa nói "đủ admin để kích hoạt" vừa nói "thiếu admin" trên cùng một thuê bao mới tạo. Đây là điểm mới so với AUDIT-DN-2 (D-105).
- **Căn cứ.**
  - `QĐ-110k`: "IT nhập **khi đăng ký thuê bao/tạo kho**: ≥ 2 người, **đều là IT Admin đang làm việc**".
  - Vế "thuê bao cũ chỉ gắn cờ" (`QĐ-110u`) chỉ miễn cho thuê bao **đã có**, không miễn cho thuê bao mới.
  - D-110 tự đặt luật "đang làm việc là MỘT phép lọc chung" (`workingAdminsAmong`), nhưng cổng kích hoạt chưa dùng phép lọc đó.
- **Cách sửa (phương án A — khuyến nghị).** Ở `assertVendorAdmins`:

  ```ts
  const ids = [...new Set(profile?.members.map((m) => m.employeeId) ?? [])];
  const working = await this.planFacts.workingAdminsAmong(ids, tx);
  assertVendorAdminsRecorded({ needs, given: workingAdminCount(profile?.members ?? [], working), planId: plan.id });
  ```

  `details.given` khi đó là số người còn làm việc. Thêm một câu vào mô tả OpenAPI của `subscriptionCreate/Update/Complete`: "phải còn là IT Admin
  đang làm việc lúc kích hoạt; hồ sơ thiếu thì IT `PUT` lại hồ sơ". Gia hạn (`continuesPeriod`) không đổi.
- **Phương án B.** Giữ như D-105: chỉ đếm người đã ghi, chấp nhận mâu thuẫn "201 + cờ đỏ".
- **Mutation/test.** Trong `test/integration/catalog/subscription-vendor-admins-http.integration-spec.ts`:
  - hồ sơ A, B; ghi khối chặn hôm nay cho B (builder departure có sẵn ở `departure-vendor-admins`);
  - `POST /subscriptions` đủ dữ liệu, mong 422 `SUBSCRIPTION.VENDOR_ADMINS_REQUIRED` `details.given = 1`.

  Code hiện tại trả 201 (đỏ). Đột biến sau khi sửa: thay `workingAdminCount` bằng `new Set(...).size` ⟹ ca đỏ lại.

### C-3 · Required · CẦN-OWNER (D-103) · Câu trả lời `adminConsole` của bản đánh giá case B không ràng cờ `hasAdminConsole` của gói `K4` được nối vào Request

- **File:**
  - `src/modules/requests/assessment/catalog-link.service.ts:36-48` (`link`: chỉ kiểm gói tồn tại và ứng dụng chưa ngừng, không đọc bản đánh giá);
  - `src/modules/catalog/plan/plan-vendor-admins.policy.ts:17-18`. File `catalog-link` thuộc module `requests` (vùng B), nhưng điểm này là quyết
    định X-IT nên ghi ở đây; agent B cần biết.
- **Kịch bản lỗi.**
  1. IT đánh giá case B: `adminConsole = true` (bắt buộc trả lời, `assessment.policy.ts:20`).
  2. IT tạo gói `K4` qua `POST /plans` nhưng quên tick `hasAdminConsole`.
  3. IT gắn Request: `POST …/catalog-link { planId }` ⟹ 200.
  4. Thuê bao/kho của gói đó được kích hoạt **không cần** hai admin. Không cờ, không cảnh báo ở thuê bao; dashboard `plansBelowVendorAdminMinimum`
     bỏ qua gói.

  Thông tin "có trang quản trị" đã nằm trong hệ thống nhưng không được dùng.
- **Căn cứ.**
  - `QĐ-110k`: "gói `K4` mang cờ *có trang quản trị* — **IT đặt cờ khi đánh giá hoặc tạo gói**".
  - SPEC P29 liệt kê cả `PUT /access-requests/{id}/assessment`.
  - D-103 (5) chọn để FE điền sẵn, nên server không ràng gì.
- **Cách sửa (A — khuyến nghị).** Trong `CatalogLinkService.link`:
  - đọc `assessment.adminConsole` của Request (repo đọc bản đánh giá đã có trong `requests/access-request/assessment-read.repo.ts`);
  - đọc `provisioningType`/`hasAdminConsole` của gói qua `CatalogApi` (thêm hai trường vào `findPlanSeatTargets`, không thêm phụ thuộc);
  - nếu `adminConsole === true && type === 'K4' && !hasAdminConsole` ⟹ 422 `ACCESS_REQUEST.PLAN_ADMIN_CONSOLE_MISSING` `details { planId }`
    ("tick *có trang quản trị* ở gói trước khi gắn");
  - khai mã trong mô tả 422 của route `catalog-link`.

  `requests` chỉ đọc cờ, không ghi vào bảng của `catalog`.
- **Phương án B.** Gắn danh mục tự đặt cờ qua một method mới của `CatalogApi`: `requests` ghi vào catalog, facade đã 8 phụ thuộc.
- **Phương án C.** Giữ D-103: FE điền sẵn, server không ràng.
- **Mutation/test.** Thêm vào integration `catalog-link`: Request case B đánh giá `adminConsole: true`, gói `K4` không cờ ⟹ mong 422. Code hiện tại
  trả 200 (đỏ). Ca đối chứng: gói có cờ ⟹ 200; `adminConsole: false` ⟹ 200.

### C-4 · Optional · Phản hồi `vendorAdmins` có `.max(20)` nhưng hồ sơ cũ được ghi tới 100 người: một hồ sơ cũ làm hỏng cả trang `GET /subscriptions`

- **File:**
  - `src/modules/catalog/subscription/subscription.dto.ts:133-144` (`.max(VENDOR_ADMINS_MAX)`);
  - `src/modules/catalog/plan/plan.dto.ts:46-49` (body hạ từ 100 xuống 20, D-105 (4));
  - `src/infrastructure/http/http-infrastructure.module.ts:12` (`ZodSerializerInterceptor` validate response).
- **Kịch bản lỗi.** Hồ sơ `K2` ghi trước X-IT với 21–100 `members` (body cũ cho tới 100). `GET /subscriptions` có thuê bao đó ⟹ serializer từ chối
  response ⟹ 500 cho **cả trang**, kể cả Finance (Finance nhận `vendorAdmins: []` nhưng validate chạy trên kết quả `toWireFor`; trang của IT Admin
  vẫn hỏng).
- **Căn cứ.** SPEC §4 dòng 119-120 bắt mảng lồng có `maxItems` (admin ≤ 20), nên giữ `max` là đúng. Nhưng không có migration hay preflight nào
  kiểm dữ liệu cũ vượt 20, và không có CHECK đếm ở `plan_workspace_admins`.
- **Cách sửa.**
  - Ở `SubscriptionViewService.vendorAdminsOf`: lấy tối đa `VENDOR_ADMINS_MAX` người, ưu tiên `OWNER` rồi người còn làm việc; giữ cờ tính trên toàn
    bộ.
  - Hoặc thêm một mục `information` vào `ops:preflight` liệt kê hồ sơ > 20 người.
  - `workspaceProfileSchema.members` của `GET /plans/{id}` không có `max` nên không bị.
- **Mutation/test.**
  - Unit `subscription-view`: hồ sơ 21 người ⟹ `vendorAdmins.length === 20`.
  - Integration: chèn 21 dòng `plan_workspace_admins` bằng SQL ⟹ `GET /subscriptions` 200.

### C-5 · Optional · Vai admin ở nhà cung cấp tính cả gói **không còn cần admin**, hồ sơ cũ thì không gỡ được

- **File:**
  - `src/modules/catalog/plan/vendor-admin-roles.service.ts:20-38` (không lọc `needsVendorAdmins`, không lọc "có thuê bao đang dùng");
  - đối chiếu `vendor-admin-minimum.service.ts:21-31`, `plan.repo.ts:366-367` (có lọc cả hai).
- **Kịch bản lỗi.**
  1. Gói `K4` có cờ và hồ sơ chỉ còn một admin X. IT tắt cờ (`PATCH hasAdminConsole: false`). Trigger cho `K4` giữ hồ sơ nên hồ sơ vẫn nằm đó.
  2. X nghỉ việc ⟹ `vendorAdminRolesOf(X)` trả gói này với `othersWorking = 0`.
  3. Mọi IT Admin nhận `VENDOR_ADMINS_BELOW_MINIMUM`, impact P23 liệt kê gói, trong khi dashboard `plansBelowVendorAdminMinimum` không đếm gói đó.
     Hai nơi kể hai chuyện khác nhau.
  4. IT không xóa được hồ sơ, vì `PUT` trả 422 `WORKSPACE_PROFILE_NOT_APPLICABLE`.

  Cùng chuyện xảy ra với gói `K2 → K4` (cờ về `false`, hồ sơ `K2` còn) và với gói đã hết thuê bao.
- **Căn cứ.** `QĐ-110k` chỉ áp gói cần admin; D-106 "cờ rơi" dùng cùng định nghĩa với dashboard.
- **Cách sửa.** Trong `of()`, bỏ duty có `!needsVendorAdmins(lookup.provisioningType, lookup.hasAdminConsole)`. Lookups đã đọc sẵn ở dòng 25, nên
  không thêm câu lệnh nào. Tùy Owner: đổi cờ `true → false` khi còn hồ sơ trả 409 `PLAN.WORKSPACE_PROFILE_BLOCKS_TYPE_CHANGE`, hoặc xóa hồ sơ cùng
  lệnh.
- **Mutation/test.** Integration `departure-vendor-admins`: gói `K4` tắt cờ, admin duy nhất nghỉ ⟹ không có thông báo `VENDOR_ADMINS_BELOW_MINIMUM`.
  Hiện tại có thông báo (đỏ).

### C-6 · Optional · Người nhận thông báo dùng "IT Admin dùng được", không dùng "đang làm việc" (lệch D-110)

- **File:**
  - `src/modules/catalog/subscription/seat-increase/subscription-seat-increase.service.ts:48`;
  - `src/modules/licensing/department-tools/department-software-notice.service.ts:28-30`.
- **Kịch bản lỗi.** IT phụ trách thuê bao đã tới mốc chặn (BLOCK_NOW, tài khoản chưa khóa) vẫn là "người dùng được" ⟹ nhận
  `SUBSCRIPTION_SEATS_INCREASED`, còn hàng IT chung **không** nhận. Đề xuất DS tương tự: IT phụ trách phòng đã bị chặn vẫn là người nhận duy nhất.
- **Căn cứ.** D-110: "đang làm việc là MỘT phép lọc chung" (`PlanFactsService.workingAdminsAmong`), áp cho đích bàn giao và hồ sơ; P24 "IT phụ
  trách không còn ⟹ hàng IT chung".
- **Cách sửa.**
  - Seat-increase: lọc `usable` qua `workingAdminsAmong` (cùng module catalog).
  - DS notice ở `licensing`: thêm `identity.findDepartureBlocks` + `notYetBlocked`, hoặc đưa `workingItAdminsAmong` lên `IdentityAccessApi`.
- **Mutation/test.** Unit policy `seatIncreaseRecipients` với `usable` đã lọc: người bị chặn ⟹ không còn trong danh sách nhận, thông báo về hàng chung.

### C-7 · Optional · `plansBelowVendorAdminMinimum` không có danh sách nguồn

- **File:** `src/modules/dashboards/progress/dashboard-progress.policy.ts:69` (`sourceOperationId: null`).
- **Kịch bản.** Dashboard báo "3 gói thiếu admin" nhưng FE không có route nào lọc ra đúng 3 gói hay 3 thuê bao đó. Màn này là màn hành động (R5 E9).
- **Cách sửa.** Thêm bộ lọc `vendorAdminsBelowMinimum=true` cho `subscriptionList`. Lọc trong service sau khi tính view, hoặc qua id từ
  `VendorAdminMinimumService`. Đổi section thành `counted(n, 'subscriptionList')`.
- **Mutation/test.** HTTP `subscriptionList?vendorAdminsBelowMinimum=true` trả đúng số dashboard đếm.

### C-8 · Optional · SoD-4 (D-122 a) · Người đề xuất có thể tự chấp nhận sau khi đổi vai

- **File:** `src/modules/licensing/department-tools/department-software-proposal.service.ts:106-128` (`accept`), `:147-154` (`inCharge`).
- **Đánh giá mức độ.** Ca "vừa là trưởng phòng vừa là IT Admin phụ trách" **không xảy ra đồng thời**, vì ba ràng buộc:
  - mỗi tài khoản đúng một vai: unique index `role_grants_one_role_per_account` (migration `20261104120000`, `QĐ-95a`, BRD dòng 316);
  - trưởng phòng phải giữ `MANAGER` (`department-head.service`: `MANAGER_ROLE_REQUIRED`);
  - `POST /department-software-proposals` yêu cầu `MANAGER`, còn `…/acceptance` yêu cầu `IT_ADMIN`.

  Chỉ còn một đường: H (MANAGER) đề xuất, Super Admin đổi vai H sang `IT_ADMIN` và giao phòng đó cho H, rồi H chấp nhận đề xuất của chính mình.
- **Căn cứ.** BRD dòng 304 `SoD-4`: "Người yêu cầu không tự phê duyệt yêu cầu của chính mình, **kể cả khi có vai cho phép phê duyệt**". Có căn cứ
  nên không cần Owner quyết.
- **Cách sửa.** Ở `accept` (không cần ở `reject`, vì tự rút lại không vi phạm), thêm trước `decide`:

  ```ts
  if (proposal.proposedByEmployeeId === actor.employeeId) throw new DepartmentSoftwareSelfDecisionError();
  ```

  Ánh xạ sang 403 `DEPARTMENT_SOFTWARE.SELF_DECISION_FORBIDDEN` và khai trong `ApiErrorResponses` của `departmentSoftwareProposalAccept`.
- **Mutation/test.** Unit `department-software-proposal.service.spec.ts`: proposal có `proposedByEmployeeId = actor.employeeId` ⟹ throw, `repo.decide`
  không được gọi. Bỏ điều kiện ⟹ đỏ.

### C-9 · Optional · Kiểm phạm vi IT Admin của DS nằm ngoài giao dịch ghi

- **File:**
  - `department-software-changes.service.ts:51` (`assertMayChange` trước `runner.run`);
  - `department-software-proposal.service.ts:110, 132` (`inCharge` trước `runner.run`).
- **Kịch bản.** Super Admin đổi IT phụ trách phòng ngay giữa hai bước: IT cũ vẫn ghi được một lần. Cửa sổ ms, tác động nhỏ (danh sách chỉ hướng dẫn).
- **Cách sửa.** Sau `lockDepartmentShared(tx, …)`, đọc lại `getItAdminScope` trong `tx`. `FOR SHARE` của phòng đã chặn `PATCH` phòng đang chờ.
- **Mutation/test.** Không đáng một integration riêng; ghi chú trong docstring là đủ.

### C-10 · Optional · Thông báo tăng seat: `requestId` luôn `null` trên đường PATCH, eventKey ngẫu nhiên

- **File:** `subscription-change.service.ts:120-131`, `subscription-seat-increase.service.ts:52`.
- **Kịch bản.** IT tăng `purchasedQuantity` bằng tay vì một Request: thông báo không có Request nguồn. SPEC P24 nêu "Request nguồn". `eventKey` dùng
  `randomUUID` nên retry của cùng giao dịch không bị gộp. Không sai dữ liệu: thông báo nằm trong giao dịch.
- **Cách sửa.** Chấp nhận `requestId: null` cho đường tay, và ghi rõ trong mô tả `subscriptionUpdate` rằng thông báo không có Request nguồn. Không cần
  đổi code.

### C-11 · Nit · JSDoc gắn nhầm lớp lỗi

- **File:** `src/modules/catalog/subscription/subscription.errors.ts:124-137`.
- **Vấn đề.** Dòng `/** An active subscription names the IT Admin who answers for it (QĐ-103v(4)). */` nay nằm trên
  `SubscriptionVendorAdminsRequiredError`, còn `SubscriptionResponsibleRequiredError` mất doc.
- **Cách sửa.** Chuyển dòng 124 xuống ngay trên dòng 137.

### C-12 · Nit · AL.5: promise `pending` không được bắt khi `waitForLockWaiters` hết hạn

- **File:** `test/integration/catalog/application-responsibility-http.integration-spec.ts:238-247`.
- **Vấn đề.** Lỗi barrier ⟹ `finally` rollback, nhưng `pending` reject sau đó thành unhandled rejection (jest báo lỗi lẫn sang ca khác).
- **Cách sửa.** Thêm `pending.catch(() => undefined)` ngay sau khi tạo, hoặc `await pending.catch(() => undefined)` trong `finally`.

### C-13 · Nit · Bỏ khóa wire `sections.transferReviews` khỏi dashboard trưởng phòng

- **File:** `src/modules/dashboards/manager/manager-dashboard.dto.ts` (khóa đã xóa, từng nằm ngay sau `departmentSoftware` ở dòng 16-18).
- **Vấn đề.** Đây là thay đổi phá vỡ hợp đồng cho FE (`strictObject`). Dashboard IT thì giữ khóa cũ `offboardingHandovers` thêm một bản, dashboard
  trưởng phòng lại xóa ngay; hai cách xử lý không nhất quán.
- **Cách sửa.** Ghi rõ trong `changes/CHANGELOG.md` của tài liệu FE. Hoặc giữ `transferReviews` thêm một bản với `notAvailable('RETIRED')` như
  `offboardingHandovers`.

### C-14 · Nit · `DepartmentSoftwareAccessService.assertMayRead` đọc phòng 2–3 lần

- **File:** `department-software-access.service.ts:20-33`.
- **Vấn đề.** `getDepartmentBrief`, rồi `getHeadedDepartment`, rồi `getDepartmentMemberIds`: hàm sau đọc lại `findById` của phòng. Chỉ là hiệu năng
  nhỏ.
- **Cách sửa.** Không bắt buộc.

### Đã soi, không có finding

- **X-IT.1** (`department-it-admin.service.ts`, `department.repo.ts:419-425`):
  - khóa `FOR UPDATE` dòng nhân viên rồi mới đếm;
  - `PATCH` chỉ kiểm khi IT Admin **đổi** (`department.service.ts:149`), nên không báo nhầm ở phòng đang giao cho chính người đó;
  - lần thứ hai đếm sau commit (READ COMMITTED, snapshot mới cho câu lệnh sau khi chờ khóa).
- **X-IT.2:** `reassignResponsible` khóa `ORDER BY id FOR UPDATE` trong CTE; một Audit mỗi tài nguyên.
- **P19 Finance** (`subscriptions.controller.ts:123-124`): chỉ `list`/`get` cho Finance đọc; ba route ghi là `IT_ADMIN`.
- **Khóa gói khi kích hoạt:** tạo và `completions` đều `lockExclusive` (`FOR UPDATE`), `PUT` hồ sơ cũng `FOR UPDATE` (`plan.repo.ts:89`), nên hồ
  sơ không đổi giữa lúc đếm và lúc ghi.
- **Đường tạo thuê bao `ACTIVE` khác:** chỉ còn `subscription-period.service.ts:153`, là gia hạn và được miễn theo D-111.
- **DS:**
  - insert `ON CONFLICT DO NOTHING` (`createManyAndReturn skipDuplicates`);
  - `decide` có điều kiện `state = 'PENDING'`;
  - `findEntryByPlace` với `planId: null` ⟹ `IS NULL`;
  - body chặn trùng trong một lời gọi (`department-software.dto.ts:50-55`).
- **RD:**
  - `outcomeOf` không biến ca đã xong thành quá hạn (RD-R2);
  - phạm vi IT Admin lọc ở personnel/requests;
  - phân trang hàng trong bộ nhớ, giới hạn bởi `REPORT_MAX_DAYS = 366`.
- **AUDIT-LEFT:**
  - AL.1 (`renewalNamedItAdminOf`), AL.2 (`memberIdsOfMany` cùng điều kiện ngày với `memberIdsOn`), AL.3 (OpenAPI không có mã nội bộ: quét
    `openapi.json` ra 0 chuỗi `QĐ-\d`, `SPEC P`, `X-IT`, `D-1xx`), AL.4 (`responsibleItAdminIdOf` một cột) đều đúng PLAN;
  - RD-R1/RD-R2 đúng D-128.
- **Kiến trúc:**
  - mọi import chéo đi qua `public/` (`CatalogResponsibilityApi`, `LicensingDepartmentToolsApi`, `OrganizationReadApi`);
  - DS phẳng trong `licensing/department-tools/` có lý do (D-115);
  - `catalog` import `NotificationsModule` (tier thấp hơn).
- **Migration 2400/2500/2600:**
  - chỉ expand, không drop;
  - `CHECK` từng cột `IS NULL OR …`;
  - `UNIQUE … NULLS NOT DISTINCT` và partial unique `WHERE state = 'PENDING'` đúng SPEC §5 DS.
- **data-import/installation/operating-parameters:**
  - cột `reason`/`cost_center_code` bị bỏ qua có báo;
  - mã lỗi cũ chuyển sang `RETIRED_SEAT_ROW_ERROR_CODES` để đọc dòng cũ;
  - khóa tham số đã bỏ được lọc khi đọc (`parameter-definitions.policy.ts:462`);
  - preflight `SERVICE_ACCOUNT_STILL_IN_FORCE` chỉ là information.
- **MF1-X phía organization:** diff `organization` chỉ có X-IT.1 và AL.2; sự kiện `HEAD_PERIOD_*` không đổi.

### Ranh giới chưa kiểm (không chạy được theo ràng buộc)

- `prisma migrate diff --exit-code` (job schema drift của CI, `.github/workflows/ci.yml:164`) chưa chạy.
  - `@@unique([departmentId, applicationId, planId])` ở `prisma/models/licensing.prisma:763` là chỗ **đầu tiên** của repo map vào một index
    `NULLS NOT DISTINCT`, mà Prisma 7 không mô tả được mệnh đề này.
  - Gate DS-G/AL-G chỉ ghi `prisma:validate`.
  - Cần xem job `quality` của CI trên `9580e179` xanh trước khi merge.
- Mutation ở trên là đề xuất, chưa chạy.

---

## Phần 2 — Seed cần đổi theo code mới (việc của gói seed Z)

Fixture `src/cli/seed/fixture/shared-demo-v4/*`, step `src/cli/seed/steps/*`. Mã cũ đã sạch: không còn dòng `SERVICE` trong `SEATS`, không còn
Business Owner, bàn giao dữ liệu hay `grounds` dạng object. Danh sách dưới đây là những chỗ còn **trái** code mới hoặc **thiếu** để demo được
MF-2/MF-3/X-IT/DS/RD.

| #  | File / khóa                                                                                                    | Hiện tại                                                                                                    | Đổi thành                                                                                                                                                                                                                                                                                                                                                         |
| -- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Z1 | `steps/baseline.steps.ts:10` `HEADER`                                                                          | còn cột `reason` (và `lineOf` ghi ô rỗng cuối)                                                              | `employee_code,account_identifier,kind,granted_on,expected_end_date`; bỏ ô cuối trong `lineOf`. Nếu giữ, preview trả `ignoredColumns: ['reason']` ở mọi lượt seed                                                                                                                                                                                                 |
| Z2 | `fixture/demo-fixture.types.ts:33-42` `DemoPlan`; `fixture/shared-demo-v4/catalog.ts:14-22` `k4`, `:91-95` JetBrains | không có `hasAdminConsole`; hai gói `K4` đều không cờ                                                       | Thêm `hasAdminConsole?: boolean` vào `DemoPlan`, step `plans` gửi trường này (chỉ `K4`). Đặt `jetbrains-all` có `hasAdminConsole: true` để demo `QĐ-110k`/R-53. `jetbrains-datagrip` giữ không cờ (ca đối chứng "K4 không cờ ⟹ 201 không kiểm")                                                                                                                   |
| Z3 | `steps/catalog.steps.ts:128` `workspaceProfileBody`                                                            | `if (plan.provisioningType !== 'K2') return null`                                                           | Dùng cùng luật với code: `needsVendorAdmins(type, hasAdminConsole)` (K2, hoặc K4 có cờ). Nếu không đổi, sau Z2 thuê bao `jetbrains` bị 422 `SUBSCRIPTION.VENDOR_ADMINS_REQUIRED` và seed dừng                                                                                                                                                                       |
| Z4 | `steps/catalog.steps.ts` `workspaceProfileBody` (dữ liệu demo cờ)                                              | mọi hồ sơ có `ownerAccountEmail`, đủ 2 admin còn làm việc ⟹ không có cờ nào bật, dashboard `plansBelowVendorAdminMinimum = 0` | Cho một gói `K2` (vd. `canva-teams`) **không** `ownerAccountEmail` ⟹ `ownerAccountEmailMissing`. Cho một gói khác có admin thứ hai là IT Admin sẽ nghỉ (Z6) ⟹ `vendorAdminsBelowMinimum` + dashboard > 0. Đi qua route, không SQL tay                                                                                                                            |
| Z5 | `fixture/shared-demo-v4/organization.ts:128`                                                                   | `NV-ITA3` chỉ phụ trách OPS, không có thuê bao, không nằm trong hồ sơ nào (`workspaceProfileBody` chỉ chọn IT Admin đầu tiên khác chủ) | Giữ ITA1/ITA2 mỗi người 4 phòng (đúng giới hạn `QĐ-110l`, `DEPARTMENT.IT_ADMIN_LIMIT_REACHED` khi thêm). Đưa ITA3 làm admin thứ hai của 1–2 hồ sơ để demo bàn giao không đụng ITA1/ITA2. Thêm một ca demo "gán ITA1 phòng thứ 5 ⟹ 409" nếu cần, ở kịch bản tay chứ không ở seed                                                                                    |
| Z6 | `fixture/demo-fixture.types.ts:206` `DemoPersonnelEvent`; `fixture/shared-demo-v4/usage.ts:103-106`             | chỉ `LONG_LEAVE` và `OFFBOARDING` (NV-OFF1, `BLOCK_NOW`, `successor NONE`); không IT Admin nào nghỉ          | Thêm `OFFBOARDING` của **một IT Admin** (vd. NV-ITA4 mới, hoặc ITA3 nếu giữ OPS cho người khác) với `accessBlockMode: 'WITH_LAST_DAY'`, `lastWorkingDay` = hôm nay + vài ngày làm việc, người đó phụ trách ≥ 1 thuê bao/ứng dụng và là admin của một hồ sơ. Demo được `itHandover` PENDING, P5 `it-admin-handover`, P23 preview `responsibilities`/`vendorAdminRoles`, dashboard `itHandoverPending`. Lưu ý giới hạn 4 phòng khi chọn người |
| Z7 | `fixture/demo-fixture.types.ts:206`; `steps/personnel.steps.ts:20-55`                                           | không có loại `TRANSFER`; không có ca m-17 (điều chuyển ghi trước release, không ân hạn)                     | Thêm `{ kind: 'TRANSFER'; employee; toDepartment; effectiveInDays }` ghi qua P6 `POST /department-transfers` (ngày hiệu lực ≥ hôm nay + 1, comment `usage.ts:102`), người chuyển giữ quyền trả phí ở phòng cũ ⟹ demo `transfers.inGrace/graceEndingSoon`, P7 `graceEndsFrom`, P10 xin lại trong ân hạn. Ca m-17 (D-82, D-87): **không** dựng bằng route (code mới luôn mở ân hạn). Nếu Owner muốn demo, Z dựng bằng SQL có chú thích "dữ liệu trước release", hoặc bỏ khỏi seed và chỉ giữ ở integration test |
| Z8 | (chưa có) danh sách phần mềm của phòng                                                                         | không có `department_software_entries`/`proposals`                                                          | Thêm khóa fixture `departmentSoftware: { [deptCode]: [{ app, plan?, note? }] }` cho 2–3 phòng (ENG, DES), ghi qua P16 `POST /departments/{id}/software-list/changes` bằng IT Admin phụ trách. Thêm `softwareProposals`: một `PENDING` (DES head đề xuất Canva) và một `REJECTED` có `reason`, qua P18. Không SQL tay (D-122 e). P17 `GET /me/department-software-list` khi đó có dữ liệu                                                                                     |
| Z9 | `fixture/shared-demo-v4/requests.ts` (case B)                                                                  | chưa có Request case B đánh giá `adminConsole: true` nối gói `K4`                                           | Nếu Owner chọn C-3 A: thêm một Request case B, đánh giá `adminConsole: true`, IT tạo gói `K4` **có** cờ rồi gắn, tick "thêm vào danh sách phòng" (IN-1, khi gói IN-1 xong). Seed không được tạo gói `K4` không cờ rồi gắn vào Request `adminConsole: true`                                                                                                     |
| Z10 | `fixture/shared-demo-v4/requests.ts:211-217` R23 (Legal)                                                      | đã đổi sang `WAITING_CONTROLLED` (đúng `QĐ-110i`/`QĐ-111bc`)                                                 | Giữ. Thêm một Request `K5` `hr-portal-access` của NV-LGL1 ⟹ IT cấp thẳng + cờ audit cho Super Admin (ca 4 của MF1-X), để demo vế `QĐ-111bc`                                                                                                                                                                                                                      |
| Z11 | `fixture/shared-demo-v4/catalog.ts:116-124` `monthly(...)` K1 `chatgpt`/`cursor`                              | `ownerDepartment: 'ENG'`, `quantity: 0`                                                                     | Không trái code. Ghi chú để Z kiểm: tăng seat K1 qua `addPoolSeat` **không** sinh `SUBSCRIPTION_SEATS_INCREASED` (S-4); tăng kho `K2` (vd. 1Password đang hết seat, `freeAfterBaseline: 0`) qua Request được duyệt ⟹ có thông báo cho IT phụ trách. Muốn demo thì thêm một Request 1Password đi tới cấp                                                         |
| Z12 | `README.md` của fixture                                                                                        | mô tả 39 người/28 tài khoản, hồ sơ chỉ K2                                                                   | Cập nhật sau Z2–Z8: K4 có cờ, IT Admin nghỉ, điều chuyển, danh sách phần mềm phòng, đề xuất; số người/tài khoản tính lại (test seed lấy số đếm từ fixture)                                                                                                                                                                                                        |

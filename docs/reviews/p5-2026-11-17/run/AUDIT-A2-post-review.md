# AUDIT-A2-post — review phần sau lõi của P5-A2 (`9bf97f30..43de386d`)

Reviewer: Opus, chỉ đọc qua `git show`/`git diff` trên worktree `D:\FPT\FALL2026\Code\be-p5-a2` (nhánh `feat/p5-a2-fixes`). Không checkout, không chạy
pnpm/jest/docker. 17/11/2026.

**Skill đã đọc/dùng (Skill Preflight):**
- `agent-skills:code-review-and-quality`: process. Review theo 5 trục và gắn mức Critical/Required/Optional/Nit.
- `superpowers:verification-before-completion`: verification. Mọi kết luận dưới đây đều kèm `file:dòng` đã đọc ở `43de386d`. Không có kết luận nào
  dựa vào việc chạy test: tôi không chạy test nào, phần CI lấy theo `A2-DONE.md`.

Phạm vi gồm 8 commit: O5 `35dd83f1`, FX-T6b `e678ecb7`, FX-T6c `aa8200f9`, FX-T4a `833f79e5`, FX-T4b `c9c8b436`, FX-T5 `8000ebeb`, FX-T9c
`2bd191aa`, FX-T11 `43de386d`. Tổng cộng 51 file, +1978/−77.

Căn cứ đối chiếu:
- `SPEC-5A-FIXES.md`: §1 B5–B8, §1 C, §2, §6, §7, §9.
- `REVIEW-SPECS-2.md`: A2-6, A2-7, A2-11, A2-12, A2-13, A2-14.
- `A2-DONE.md`: D-12…D-21.
- Sổ QĐ: `QĐ-111ax`, `QĐ-58b`, `QĐ-103m`, `QĐ-98h`, `QĐ-108f`.
- `SBF-09.md`: bước 2, 7, 8.

## Kết luận

- **Critical: 0. Required: 0.** Code khớp spec §1.B5–B7, §1.C (phần T6b/T6c) và §9.1.
- Tất cả thông báo đều ghi bằng `notifyInApp(tx, …)` trong transaction của thao tác. Event key ổn định, và `notifyInApp` dùng `skipDuplicates`
  (`notifications/inbox/in-app-notification.repo.ts:46`).
- Hai sweep chỉ nhắc một lần nhờ `UPDATE … WHERE … noticed_at IS NULL` chạy cùng transaction với thông báo.
- Không có đường nào dẫn tới 500 mới mà tôi tìm thấy.
- FX-T11 không làm mất dữ liệu: `DEPARTURE_MARKED_LEFT` chỉ là member của union TypeScript, chưa từng được phát, không có trong `openapi.json`
  @`9bf97f30`, không có trong Prisma hay CHECK.
- Test flaky `vendor-import-confirm` là **lỗi test** (phụ thuộc thứ tự), không phải race thật (xem O-02).
- **Optional: 6. Nit: 5.**
- **Merge được vào `feat/p5`.** Nên xử lý O-01 (một dòng) trước khi lên `dev`, hoặc Owner xác nhận D-12. O-02 đưa vào FIX-TEST.

## Đối chiếu nhanh theo trục

| Trục | Kết quả |
| -- | -- |
| 1. Spec/QĐ | **Người nhận đúng bảng §1.B.** SaaS: IT được giao khi gửi và khi quá hạn; bên còn lại khi đổi trạng thái; bỏ người làm (`saas-issue-notifier.service.ts:29-30,71-73`). `REPORT_ONLY`: người dùng và trưởng phòng hôm nay của phòng cuối, có khử trùng bằng `Set` (`vendor-account-review-notifier.service.ts:73-100`). Sai lệch NCC: IT chịu trách nhiệm ứng dụng còn dùng được, không thì mọi IT dùng được (`:103-110`). Dừng thu thập: IT phụ trách phòng người giữ, không thì mọi IT, luôn bỏ người giữ (`stop-request-notifier.service.ts:44-53`).<br>**Không gửi trùng.** Mọi event key đều theo một id duy nhất hoặc theo ngày (collector).<br>**Phạm vi `QĐ-111ax`.** P1 thấy P1 + P3 (phòng không có IT), không thấy P2. Nhất quán giữa mapping, finding, usage máy và trạng thái công cụ, có test cho từng route. Lệch về người đã nghỉ: xem O-01.<br>**FX-T11.** Không mất dữ liệu, không mất mã. |
| 2. Đúng đắn | **Transaction.** Có, ở cả 6 điểm phát. Retry `23505` của yêu cầu dừng rollback luôn thông báo, lần chạy lại ra `INVALID DUPLICATE` nên không báo.<br>**Idempotent.** SaaS dùng `markOverdueNoticed` có điều kiện `state='NEW' AND response_overdue_noticed_at IS NULL` (`saas-issue.repo.ts:312-313`). Yêu cầu dừng dùng `updateMany` có điều kiện `state OPEN, overdueNoticedAt null` (`stop-request.repo.ts:156-163`).<br>**Ngày VN.** `dueOn = businessDateAt(dueAt, organization.timeZone)` (`stop-request-notifier.service.ts:67`). Ngày của collector lấy `businessToday(now, tx)`.<br>**500.** Hai chỗ `throw new Error` chỉ là phòng hờ cho bất biến (N-05). |
| 3. Kiến trúc | Mọi import liên module đi qua `public/`: `CatalogApi.getApplicationResponsibleItAdminId` mới, `DevicesApi.registrationsOfDevice` mới. Không repo nào đọc bảng của module khác. Có cạnh capability mới `identity`/`ai-usage`/`tool-status` → `usage-overview`, không vòng. `DevicesModule` đã import `NotificationsModule` (A2-7b). Sweeper đã thêm vào `SWEEPER_OVERRIDES` và `security-jobs.md`. CI `quality`/`http-contract` xanh theo A2-DONE. |
| 4. Phân quyền | 4 route usage đều `@RequireRoles('IT_ADMIN')` và nhận `actor`. Máy ngoài phạm vi trả trang rỗng 200, máy không có trả 404. Không có route đếm hay xuất mới. Nhân viên chỉ đọc qua `me/...`, không đổi. Ngoài spec: hai hàng đợi SBF-08 chưa lọc theo phòng (O-06, cần Owner). |
| 5. Test | Không có assertion nào bị nới. Ca phủ định `DEPARTURE_MARKED_LEFT` thay bằng `LONG_LEAVE_STARTED`, vẫn đếm đủ 4 người nhận (`personnel-notifier.service.spec.ts:361-367`). Các đột biến chính đều có test bắt (bảng ở cuối). Đột biến tính `dueOn` theo UTC chỉ bị bắt khi CI chạy vào 17:00–24:00 UTC (O-04). |

## Findings

### O-01 · Optional (nâng lên Required nếu Owner không giữ D-12) — lọc `employeeId` của mapping bỏ qua ngữ nghĩa một người của `peopleOf`, làm người đã nghỉ biến mất với mọi IT

**Vị trí:** `src/modules/usage/identity/identity-query.service.ts:127-132`, `readableEmployeeIds`. Hàm được gọi ở `:79` (mappings) và `:107`
(findings).

**Hiện trạng:**
- Code luôn gọi `scope.peopleOf(actor, {}, today)`. Hàm này lấy người **đang xếp phòng hôm nay**
  (`usage-overview-scope.service.ts:58-65`), rồi code tự lọc theo id.
- Trong khi đó, `peopleOf(actor, { employeeId })` (`:53-56`) và `employeeInScope` (`:69-75`) dùng `getLastPlacement`, nghĩa là
  **phòng cuối, kể cả người đã nghỉ**.

**Kịch bản:**
1. Nhân viên X của P1 nghỉ việc. Mapping của X bị ghép sai.
2. IT phụ trách P1 gọi `GET /usage-identity-mappings?employeeId=X` và nhận trang rỗng.
3. Mọi IT khác cũng nhận trang rỗng, nên không ai lấy được `id` để gọi `usageIdentityMappingEnd`. Dòng import (`vendor-import-query.service.ts:72`)
   cũng ẩn X.
4. Cùng lúc đó, `deviceUsageList` của máy X (`registrationIdsOfDevice` → `employeeInScope`, `usage-overview-scope.service.ts:89`) và
   `usageEmployeeSoftwareGet` (`usage-employee-view.service.ts:144`) **vẫn** cho IT của P1 thấy X.

Như vậy cùng một người, khi hỏi đích danh, route này thấy mà route kia không thấy.

**Căn cứ:**
- `QĐ-111ax`: IT đọc usage của phòng mình; không có QĐ nào nói ẩn với mọi IT.
- Docstring của `peopleOf`: "or the one person asked for".
- D-12 (tự chốt, chờ Owner) và A2-14 (FYI). Spec §C ghi đúng chữ `peopleOf(actor, {})`, nên đây không phải lệch spec. Vì vậy tôi để mức Optional.

**Cách sửa:**
- `readableEmployeeIds` gọi `this.scope.peopleOf(actor, employeeId === undefined ? {} : { employeeId }, today)` rồi `map(employeeId)`.
- Danh sách không lọc vẫn giữ ngữ nghĩa "đang xếp phòng" như `usageOverviewList`. Nếu muốn danh sách cũng hiện người đã nghỉ thì cần
  `OrganizationReadApi` có hàm "người có placement cuối thuộc các phòng X". Phần đó để 4b.

**Test:** thêm vào `test/integration/usage/usage-identity-scope.integration-spec.ts`:
- Kết thúc placement của `SC-P1` (cho nghỉ việc qua builder).
- `it1` gọi `?employeeId=p1` ⟹ thấy 1 mapping.
- `it2` gọi `?employeeId=p1` ⟹ trang rỗng.

### O-02 · Optional (nợ test cho FIX-TEST) — `vendor-import-confirm` flaky là lỗi test, không phải race

**Vị trí:** `test/integration/usage/vendor-import-confirm.integration-spec.ts:272-288`. Code liên quan: `vendor-import-confirmation.service.ts:58-61,84-88`.

**Phân tích:**
- `confirm` khóa `sources.lock` rồi `repo.lock` (`FOR UPDATE`) trong một transaction, nên ba lời gọi chạy tuần tự.
- Lời gọi thắng khóa trước sẽ ghi `confirmKey`. Các lời gọi sau đi vào `requireOpen`: trùng key thì replay 200, khác key thì
  `UsageImportAlreadyConfirmedError` 409.
- Nếu `c` (key ngẫu nhiên) thắng trước thì `a` và `b` đều nhận 409. Đây là **hành vi đúng** của code, đúng như lần đỏ trên CI (`a`,`b` = 409,409).
- Test ngầm giả định `a`/`b` luôn thắng, nên sai.
- FX-T5 thêm vài truy vấn vào transaction xác nhận: thông báo và đọc IT dùng được (`vendor-account-intake.service.ts:74-82`). Việc này đổi
  thời gian chạy và làm lộ thứ tự, nhưng không tạo ra lỗi mới.
- Ghi đúng một lần vẫn được giữ (`h.days(...)` có độ dài 1).

**Cách sửa:** giữ nguyên ý "ghi một lần", bỏ giả định về thứ tự. Assertion:
`const keyed = [a.status, b.status]; expect(keyed[0]).toBe(keyed[1]); expect(new Set([...keyed, c.status])).toEqual(new Set([200, 409]))`, cộng
với `days` = 1. Cách khác: chạy `Promise.all([a, b])` trước, rồi mới gọi `c` để kiểm 409.

### O-03 · Optional — `source = 'USAGE_IMPORT'` của `VENDOR_ACCOUNT_DISCREPANCY_OPENED` không thuộc enum DTO nào

**Vị trí:** `src/modules/usage/vendor-account-review/vendor-account-intake.service.ts:79`;
`vendor-account-review-notifier.service.ts:12`; `vendor-account-review-queue/vendor-account-review.dto.ts:9`.

**Kịch bản:**
- Spec §1.B nói nhãn `{source:enum}` lấy từ enum DTO của `vendor-account-review`. Enum đó là `NO_ASSIGNMENT | UNMATCHED_IDENTITY |
  INVOICE_DIFFERENCE | COLLECTOR_UNLISTED`.
- 5b dựng bảng nhãn theo đó sẽ thiếu `USAGE_IMPORT`, nên câu VI/EN bị lủng.
- Nếu FE dùng `source` làm bộ lọc khi mở `target` (`vendorAccountDiscrepancyList?source=…`) thì nhận 422.
- D-17 đã ghi nhận nhưng chưa bàn giao rõ cho 5b.

**Cách sửa:** chọn một trong hai.
- (a) Ghi rõ vào bảng bàn giao 5b rằng `source` của mã này là "loại lô", có 3 giá trị, nhãn riêng, và không dùng làm bộ lọc.
- (b) Đổi tên param thành `occasion` để khỏi nhầm với cột `source`. Phương án này đổi khóa param nên phải sửa `PARAM_KEYS_BY_CODE`,
  `inbox-mf23.policy.spec.ts` và các integration spec.

Khuyến nghị (a), vì 5b chưa viết câu.

**Test:** không cần nếu chọn (a). Nếu chọn (b) thì sửa assertion khóa param ở `vendor-account-review-notices.integration-spec.ts:125`.

### O-04 · Optional — test `dueOn` không bắt được đột biến tính ngày theo UTC

**Vị trí:** code `src/modules/devices/stop-request/stop-request-notifier.service.ts:67`; test
`test/integration/devices/devices-stop-request.integration-spec.ts:360-392`.

**Kịch bản:**
- Test tính kỳ vọng bằng `Intl.DateTimeFormat` theo time zone của tổ chức, từ `created.dueAt` thật (lấy theo `now`).
- Nếu ai đổi code thành `request.dueAt.toISOString().slice(0, 10)`, test chỉ đỏ khi giờ VN đã sang ngày mới mà UTC chưa, tức CI chạy trong
  khoảng 17:00–24:00 UTC. Phần lớn các lần chạy sẽ vẫn xanh.

**Cách sửa:** thêm một ca đặt `due_at` cố định qua SQL, ví dụ `'2026-11-19T18:30:00Z'` (= 01:30 ngày 20/11 giờ VN). Sau đó gọi `sweep(now)` và kiểm
`params.dueOn === '2026-11-20'`.

### O-05 · Optional — `OUT_OF_PROCESS_CASE_REPORTED` mất phần của trưởng phòng khi phòng chưa có trưởng phòng

**Vị trí:** `src/modules/usage/vendor-account-review/vendor-account-review-notifier.service.ts:76-82`.

**Kịch bản:**
- Phòng cuối của người dùng chưa có trưởng phòng nên `head` là `undefined`, và chỉ người dùng được báo.
- Repo đã có `NotificationsApi.holdForDepartment`, giữ thông báo cho trưởng phòng đầu tiên được bổ nhiệm (`notifications.api.ts:63-71`).
- Spec §1.B6 chỉ nói "trưởng phòng hôm nay", nên đây không phải lỗi spec. Nhưng `SBF-07a` §5.1 đòi trưởng phòng của phòng dùng "được báo".

**Cách sửa:** khi `placement` có mà `head` không có, gọi `holdForDepartment(tx, { departmentId, code, params, eventKey })` với cùng event key.

**Test:** tạo phòng không có trưởng phòng, đóng `REPORT_ONLY`, rồi bổ nhiệm trưởng phòng ⟹ trưởng phòng nhận đúng 1 thông báo.

### O-06 · Optional (cần Owner, ngoài spec §C) — hai hàng đợi SBF-08 vẫn cho mọi IT đọc dữ liệu theo người của mọi phòng

**Vị trí:** `src/modules/usage/vendor-account-review-queue/vendor-account-discrepancies.controller.ts:48-51` (`vendorAccountDiscrepancyList`) và
`out-of-process-cases.controller.ts:87-89` (`outOfProcessCaseList`).

**Kịch bản:**
- Sai lệch `NO_ASSIGNMENT` mang `employeeId` và khoảng ngày hoạt động không có seat của một người (`vendor-account-intake.service.ts:41-54`).
- Từ sau FX-T6b, IT của P2 không xem được finding của người P1 ở `usageNoAssignmentFindingList`, nhưng vẫn đọc được chính dữ liệu đó ở
  `vendorAccountDiscrepancyList`.

**Căn cứ:** `QĐ-111ax` "đọc usage chặn cứng theo phòng". Spec §C không liệt kê hai route này, và A2-12 chỉ nói về ghost seat.

**Cách sửa:** hỏi Owner. Nếu chặn thì lọc `employeeId IS NULL OR employeeId IN peopleOf(actor)`, dòng không gắn người hiện cho mọi IT (như tiền lệ
`vendor-import-query.service.ts:58-61`).

**Test:** IT P2 không thấy dòng `NO_ASSIGNMENT` của người P1, nhưng vẫn thấy `INVOICE_DIFFERENCE`.

### N-01 · Nit — `registrationIdsOfDevice` tính lại phạm vi của IT cho mỗi người giữ

**Vị trí:** `src/modules/usage/usage-overview/usage-overview-scope.service.ts:86-91`.

`employeeInScope` gọi `scopeOf(actor)` (`getItAdminScope` + `findUsableItAdminEmployeeIds`) một lần cho mỗi người giữ khác nhau.

**Sửa:** tính `const scope = await this.scopeOf(actor)` một lần rồi gọi `this.employeeIn(holder, scope, today)`. Không cần test mới.

### N-02 · Nit — mô tả OpenAPI của `usageIdentityMappingList`/`usageNoAssignmentFindingList` chưa nói về phạm vi

**Vị trí:** `src/modules/usage/identity/identity.controller.ts:212` và `:267`.

Hai route máy đã có câu "only … the departments the IT Admin works … an empty page" (`openapi.json`), hai route này thì chưa. FE đọc doc sẽ không biết
trang rỗng là do phạm vi.

**Sửa:** thêm cùng câu đó rồi chạy `pnpm openapi:export`.

### N-03 · Nit — `VENDOR_ACCOUNT_DISCREPANCY_OPENED` báo cả IT vừa tự xác nhận import

**Vị trí:** `src/modules/usage/vendor-account-review/vendor-account-review-notifier.service.ts:51-66`.

IT chịu trách nhiệm ứng dụng thường cũng là người bấm xác nhận import, nên nhận thông báo về việc chính mình vừa làm. Các notifier khác của A2 đều
bỏ người làm. Spec §B7 không đòi bỏ, nên để Owner chọn.

**Sửa (nếu muốn):** truyền `actorEmployeeId` qua `UsageImportConfirmedEvent` và lọc khỏi danh sách người nhận. Khi fallback sang mọi IT, vẫn giữ
những IT còn lại.

### N-04 · Nit — catalog FE còn nhắc `DEPARTURE_MARKED_LEFT`

**Vị trí:** `Docs/Figma UI-UX/API-Integration/catalog/notifications.md:2099`. Câu cuối ô Ghi chú ghi kiểu này "còn giá trị … chưa bao giờ xuất
hiện".

**Sửa:** điều phối xóa câu khi chép bàn giao 5b. Việc này không thuộc repo BE.

### N-05 · Nit — hai `throw new Error` phòng hờ sẽ ra 500 không có mã

**Vị trí:**
- `src/modules/licensing/saas-issue/saas-issue-notifier.service.ts:32`: plan không tồn tại.
- `:74-75`: entry thiếu state.
- `src/modules/devices/stop-request/stop-request-notifier.service.ts:63`: `dueAt` null.

Cả ba đều là bất biến (FK plan, writer luôn ghi state và `dueAt`), nên giữ được. Chỉ ghi nhận rằng nếu một trong số đó vỡ thì `saasIssueSubmit` và
`myDeviceStopRequestCreate` trả 500 và rollback cả thao tác chính. Không cần sửa.

## Rà D-n trong vùng

| D | Đánh giá |
| -- | -- |
| D-12 | Khớp chữ spec, nhưng gây lệch với route máy và `usageEmployeeSoftwareGet` ⟹ O-01. |
| D-13 | Đồng ý. Một chỗ lọc duy nhất, nhưng tính lại phạm vi cho mỗi người giữ (N-01). |
| D-14 | Đồng ý. `CatalogApi.getPlanSummaries` đọc qua public trong `tx`. |
| D-15 | Đồng ý. BRD 5.5.4 nói "đổi trạng thái ⟹ người báo", `NEW→IN_PROGRESS` cũng là đổi trạng thái. |
| D-16 | Đồng ý. Thêm hàm public nhỏ, đúng ranh giới. |
| D-17 | Hành vi hợp lý, nhưng bàn giao 5b phải nói rõ giá trị lạ ⟹ O-03. |
| D-18 | Đồng ý. Có test ca người dùng là trưởng phòng ⟹ 1 thông báo (`out-of-process-case-report-notices.integration-spec.ts:132-139`). |
| D-19 | Đồng ý. Cách hiểu §6 rộng hơn chữ "không ai nhận", nhưng an toàn hơn: yêu cầu không bị treo. |
| D-20 | Đồng ý. Sweep an toàn khi nhiều instance cùng chạy. `onModuleDestroy` chờ lượt đang chạy, timer dùng `unref`. |
| D-21 | Đúng quyết định Owner A2-12. Không báo thiếu. |

## Đột biến chính và test bắt (lập luận, không chạy)

| Đột biến | Test bắt |
| -- | -- |
| Bỏ `employeeId: { in }` ở `no-assignment-finding.repo.ts` | `usage-identity-scope` "lists the findings…": `it1` sẽ thấy `SC-P2` |
| `readableEmployeeIds` bỏ lọc `employeeId` | `usage-identity-scope` ca lọc "inside": `toHaveLength(1)` thành 2 |
| `registrationIdsOfDevice` trả mọi đăng ký | `usage-device-scope` "empty page…" và ca máy đổi chủ |
| Lọc theo người giữ hiện tại thay vì theo từng đăng ký | `usage-device-scope` "machine that changed hands": `it1` sẽ thấy `[]` |
| Bỏ `newCount <= 0` | `vendor-account-review-notices` "seen again" và "holds nothing" |
| Một thông báo cho mỗi dòng | Cùng event key nên bị `skipDuplicates` nuốt. Đột biến đổi event key theo dòng thì ca "once for the report" bắt |
| Bỏ điều kiện `overdueNoticedAt: null` | `devices-stop-request` "a second pass says nothing" |
| Bỏ lọc người giữ | `devices-stop-request` "IT asks for own machine" |
| Bỏ `recipient === actor` (SaaS) | `saas-issue-notifications` "nor the IT Admin of what they did to their own report" |
| Đảo người nhận `IT_ACTION` và `REPORTER_*` | `saas-issue-notifications` ca "reporter" và ca "IT Admin it is given to" |
| `dueOn` theo UTC | Chỉ bắt được trong khoảng 17:00–24:00 UTC ⟹ O-04 |
| Ghi thông báo ngoài transaction | Không có test bắt (chấp nhận được; mẫu `notifyInApp(tx)` bắt buộc truyền `tx`) |

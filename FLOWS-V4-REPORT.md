# FLOWS-V4-REPORT

Nhánh `fix/flows-v4` từ `origin/dev` `a2dad526` (worktree `../be-flows`). Mục tiêu: `pnpm test:flows` xanh trên dataset
`shared-demo-v4` cho phần luật hiện hành, rồi đưa vào nightly.

## 1. Baseline trước khi sửa (đo 11/11/2026)

Lệnh: `pnpm test:flows` (PostgreSQL 17 Docker `slm-test-db`, `TEST_DATABASE_ADMIN_URL` theo `test/README.md`).

| Chỉ số | Giá trị |
| --- | --- |
| Test suites | 9 đỏ · 1 xanh (`f0-auth-roles`) · 10 file |
| Tests | **33 đỏ · 36 xanh · 0 skip** · 69 |
| Thời gian | Jest 31,7 s; cả lệnh (global setup migrate + seed mẫu + 10 file) ≈ 120 s |

### Kịch bản đỏ và thông điệp lỗi đầu tiên (trước khi sửa)

| # | File | Kịch bản (đầy đủ) | Thông điệp lỗi đầu tiên |
|---|---|---|---|
| 1 | mf1-request-contract.flow-spec.ts | MF-1 request contract: field cũ, sai vai, gọi lại › F1-02 field cũ ⟹ 422, không ghi › ngân sách: dòng BM-10 còn khoảng mua, phiên bản còn ngưỡng giá trị cao ⟹ 422 #13 12b | Expected: 201 · Received: 422 |
| 2 | mf1-request-contract.flow-spec.ts | MF-1 request contract: field cũ, sai vai, gọi lại › F1-03 sai vai, khác phòng, tự duyệt › trình lô, duyệt chi và cấp đều có người của riêng nó #B0 | Expected one row, got 0: SELECT s.id FROM subscriptions s JOIN plans p ON p.id = |
| 3 | mf1-request-contract.flow-spec.ts | MF-1 request contract: field cũ, sai vai, gọi lại › F1-04 gọi lại không tạo bản ghi trùng › BR-MF1-02 trưởng phòng tự gửi đi thẳng duyệt chi, không vào lô và chỉ quyết một lần | Expected: 201 · Received: 409 |
| 4 | mf1-request-contract.flow-spec.ts | MF-1 request contract: field cũ, sai vai, gọi lại › F1-04 gọi lại không tạo bản ghi trùng › trình lô, duyệt chi và hoàn tất cấp: lần hai là 409 và không thêm dòng #B0 | Expected one row, got 0: SELECT s.id FROM subscriptions s JOIN plans p ON p.id = |
| 5 | mf4-budget.flow-spec.ts | MF-4 ngân sách năm: đề xuất → phiên bản → duyệt › F4-01 đề xuất chỉ có số tiền và tệp; dự phòng mặc định 10 % › phòng Thiết kế chưa có ngân sách: trưởng phòng gửi, Finance lập, Người duyệt chi duyệt #14 12b | Expected: 201 · Received: 422 |
| 6 | mf4-budget.flow-spec.ts | MF-4 ngân sách năm: đề xuất → phiên bản → duyệt › F4-01 đề xuất chỉ có số tiền và tệp; dự phòng mặc định 10 % › sau khi có ngân sách, Request của phòng Thiết kế được trình lô và có bước duyệt chi #6 | submit answered 409: {"success":false,"error":{"code":"ACCESS_REQUEST.ALREADY_HOLDS_ACCESS","message":"The person already holds access to the plan.","details":{ |
| 7 | mf4-budget.flow-spec.ts | MF-4 ngân sách năm: đề xuất → phiên bản → duyệt › F4-01 chỉ số tiền: Cost Center chỉ để chọn đơn vị của chính mình, tiền tệ không do client gửi › đề xuất gửi Cost Center của phòng khác ⟹ 403; phiên bản gửi costCenterId, mọi chỗ gửi currency ⟹ 422 chỉ đúng key đó; không ghi gì #14 | Expected: 201 · Received: 409 |
| 8 | mf4-budget.flow-spec.ts | MF-4 ngân sách năm: đề xuất → phiên bản → duyệt › F4-02 dự phòng khác 10 % phải có lý do; yêu cầu sửa và từ chối › dự phòng khác 10 % không lý do ⟹ 422; có lý do thì gửi được; Người duyệt chi yêu cầu sửa, Finance sửa và gửi lại #14 | Expected: 201 · Received: 422 |
| 9 | mf4-budget.flow-spec.ts | MF-4 ngân sách năm: đề xuất → phiên bản → duyệt › F4-02 dự phòng khác 10 % phải có lý do; yêu cầu sửa và từ chối › Người duyệt chi từ chối một phiên bản khác phải nêu lý do #14 | Expected: 201 · Received: 422 |
| 10 | mf5-rightsizing-edges.flow-spec.ts | MF-5 giảm, hủy và đề xuất lỗi thời: các biên của F5-02 › đề xuất: danh sách ghế thu hồi và trường theo lựa chọn › giảm phải nêu đúng số ghế vượt; thiếu, thừa hoặc ghế không phải của thuê bao ⟹ 422 và không ghi gì #9 | Expected one row, got 0: SELECT s.id FROM subscriptions s JOIN plans p ON p.id = |
| 11 | mf5-rightsizing-edges.flow-spec.ts | MF-5 giảm, hủy và đề xuất lỗi thời: các biên của F5-02 › đề xuất: danh sách ghế thu hồi và trường theo lựa chọn › trường của lựa chọn khác bị từ chối: số lượng với giữ nguyên hoặc hủy, danh sách ghế với giữ nguyên hoặc hủy #9 | Expected one row, got 0: SELECT s.id FROM subscriptions s JOIN plans p ON p.id = |
| 12 | mf5-rightsizing-edges.flow-spec.ts | MF-5 giảm, hủy và đề xuất lỗi thời: các biên của F5-02 › xác nhận: phạm vi và cảnh báo › trưởng phòng khác không thấy hồ sơ (404), IT Admin và Finance bị 403, trưởng phòng sở hữu đọc được #9 | Expected one row, got 0: SELECT s.id FROM subscriptions s JOIN plans p ON p.id = |
| 13 | mf5-rightsizing-edges.flow-spec.ts | MF-5 giảm, hủy và đề xuất lỗi thời: các biên của F5-02 › xác nhận: phạm vi và cảnh báo › hủy thuê bao còn người dùng: phải xác nhận sau cảnh báo; xác nhận mở thu hồi mọi ghế cá nhân #9 | Expected one row, got 0: SELECT s.id FROM subscriptions s JOIN plans p ON p.id = |
| 14 | mf5-rightsizing-edges.flow-spec.ts | MF-5 giảm, hủy và đề xuất lỗi thời: các biên của F5-02 › đề xuất lỗi thời: đóng lại để đề xuất lại (A-H2) › một ghế nữa được cấp sau đề xuất: xác nhận ⟹ 409 PROPOSAL_STALE, hồ sơ đóng STALE, IT đề xuất lại và xác nhận được | Expected one row, got 0: SELECT s.id FROM subscriptions s JOIN plans p ON p.id = |
| 15 | mf5-rightsizing-edges.flow-spec.ts | MF-5 giảm, hủy và đề xuất lỗi thời: các biên của F5-02 › phòng sở hữu không có trưởng phòng: hồ sơ chờ và Super Admin được báo #9 › trưởng phòng nghỉ việc, IT Admin vẫn đề xuất được; hồ sơ chờ NO_HEAD, không ai xác nhận, Super Admin được báo một lần | Expected one row, got 0: SELECT s.id FROM subscriptions s JOIN plans p ON p.id = |
| 16 | mf2-offboarding.flow-spec.ts | MF-2 nghỉ việc có ngày cuối › F2-01 có ngày cuối: tự chặn hết ngày cuối, không bấm "đã nghỉ" › ghi hồ sơ: HANDING_OVER, dòng chặn có hiệu lực từ ngày sau ngày cuối; IT chưa mở được gì #2 #3 #24 | -   "heldRights": 1, |
| 17 | mf2-offboarding.flow-spec.ts | MF-2 nghỉ việc có ngày cuối › F2-01 có ngày cuối: tự chặn hết ngày cuối, không bấm "đã nghỉ" › sang ngày sau ngày cuối: đăng nhập, làm mới phiên và gọi API đều bị từ chối; hồ sơ chưa "đã nghỉ" #2 | Expected: 0 · Received: 1 |
| 18 | mf2-offboarding.flow-spec.ts | MF-2 nghỉ việc có ngày cuối › F2-01 có ngày cuối: tự chặn hết ngày cuối, không bấm "đã nghỉ" › khi đã chặn, IT Admin ghi khóa tài khoản và mở thu hồi quyền: tác vụ nguồn DEPARTURE, ghế còn nguyên #1 #24 | Expected length: 1 · Received length: 5 · Received array:  [{"accessRunsOnUntil": null, "application": {"id": "3a82d267-af37-4aaa-9747-c6a7ef89292a", "name": "1 |
| 19 | mf1-group-request.flow-spec.ts | F1-08 Request nhóm: nhu cầu → trình lô → duyệt chi → cấp từng dòng › nhóm hai người do nhân viên gửi đi hết các bước; không client nào gửi ngày; Assignment mang thời hạn của Request #4 #19 #20 | Expected one row, got 0: SELECT s.id FROM subscriptions s JOIN plans p ON p.id = |
| 20 | mf1-group-request.flow-spec.ts | F1-08 Request nhóm: nhu cầu → trình lô → duyệt chi → cấp từng dòng › nhà thầu được cấp quyền, Assignment có ngày kết thúc = hôm nay + thời hạn − 1 ngày (R1) #20 | Expected: 201 · Received: 422 |
| 21 | mf5-ghost-seat.flow-spec.ts | MF-5 trưởng phòng quyết định ghost seat: Thu hồi có ân hạn, Giữ, Miễn trừ › định tuyến tới trưởng phòng ⟹ Thu hồi ⟹ claim sớm 409 NOT_BEFORE ⟹ sau ân hạn hoàn tất ⟹ ACCEPTED | Expected one row, got 0: SELECT s.id FROM subscriptions s JOIN plans p ON p.id = |
| 22 | mf5-ghost-seat.flow-spec.ts | MF-5 trưởng phòng quyết định ghost seat: Thu hồi có ân hạn, Giữ, Miễn trừ › Giữ đóng KEPT không báo người giữ; Miễn trừ đóng EXEMPTED và ghi miễn trừ | Expected one row, got 0: SELECT s.id FROM subscriptions s JOIN plans p ON p.id = |
| 23 | mf2-abrupt-departure.flow-spec.ts | MF-2 chặn ngay với ngày cuối ở tương lai › F2-02 chặn ngay với ngày cuối tương lai › IT Admin khóa tài khoản rồi mở thu hồi: tác vụ nguồn ABRUPT_DEPARTURE, ghế còn nguyên #3 | Expected one row, got 6: SELECT revocation_source::text FROM provisioning_tasks  |
| 24 | mf2-abrupt-departure.flow-spec.ts | MF-2 chặn ngay với ngày cuối ở tương lai › F2-05 từ chối các bước sau › chưa tới ngày cuối: "đã nghỉ" ⟹ 409 LAST_WORKING_DAY_AHEAD; đóng hồ sơ ⟹ 409 CASE_NOT_LEFT; field cũ departedOn ⟹ 422 #3 | Expected: 0 · Received: 1 |
| 25 | mf2-abrupt-departure.flow-spec.ts | MF-2 chặn ngay với ngày cuối ở tương lai › F2-05 từ chối các bước sau › người không còn quyền nào: khóa rồi mở thu hồi ⟹ 409 NOTHING_TO_REVOKE, không tác vụ mới #24 | TypeError: Cannot read properties of undefined (reading 'code') |
| 26 | mf3-transfer.flow-spec.ts | MF-3 điều chuyển: quyết định công cụ của trưởng phòng mới › khi điều chuyển có hiệu lực, trưởng phòng mới thấy các công cụ cần quyết; trưởng phòng cũ không thấy hồ sơ #17 #18 | Expected one row, got 5: SELECT assignment_id FROM transfer_review_items |
| 27 | mf3-transfer.flow-spec.ts | MF-3 điều chuyển: quyết định công cụ của trưởng phòng mới › quyết định đã bỏ hoặc thiếu lý do ⟹ 422 VALIDATION_ERROR và không dòng nào được quyết #17 #18 | Expected one row, got 5: SELECT assignment_id FROM transfer_review_items |
| 28 | mf3-transfer.flow-spec.ts | MF-3 điều chuyển: quyết định công cụ của trưởng phòng mới › trưởng phòng cũ, IT Admin và Người duyệt chi không quyết thay: 403 NOT_REVIEWER, không dòng nào được quyết #17 #18 | Expected one row, got 5: SELECT assignment_id FROM transfer_review_items |
| 29 | mf3-transfer.flow-spec.ts | MF-3 điều chuyển: quyết định công cụ của trưởng phòng mới › trưởng phòng mới quyết kèm lý do; chỉ "vẫn cần" được rút lại một lần thành "không cần", sau đó 409 NOT_OPEN #17 #18 | Expected one row, got 5: SELECT assignment_id FROM transfer_review_items |
| 30 | mf5-rightsizing.flow-spec.ts | F5-02 IT đề xuất giảm, trưởng phòng sở hữu xác nhận, IT ghi kết quả › IT Admin đề xuất giảm về 0 kèm danh sách ghế thu hồi; trưởng phòng sở hữu thấy, Người duyệt chi không #9 | Expected one row, got 0: SELECT s.id FROM subscriptions s JOIN plans p ON p.id = |
| 31 | mf5-rightsizing.flow-spec.ts | F5-02 IT đề xuất giảm, trưởng phòng sở hữu xác nhận, IT ghi kết quả › chỉ trưởng phòng sở hữu quyết; Người duyệt chi, IT Admin, Finance bị 403, trưởng phòng khác 404; body cũ bị 422 và hồ sơ không đổi #9 | Expected: 403 · Received: 422 |
| 32 | mf5-rightsizing.flow-spec.ts | F5-02 IT đề xuất giảm, trưởng phòng sở hữu xác nhận, IT ghi kết quả › trưởng phòng sở hữu xác nhận: quyết định là của họ, tác vụ thu hồi ghế đã chọn mở ra, IT Admin và Finance được báo #9 | Expected: 200 · Received: 422 |
| 33 | mf5-rightsizing.flow-spec.ts | F5-02 IT đề xuất giảm, trưởng phòng sở hữu xác nhận, IT ghi kết quả › IT Admin ghi kết quả với nhà cung cấp; kết quả khác quyết định phải có lý do và bằng chứng #9 | TypeError: Cannot read properties of undefined (reading 'renewal') |

Nguyên nhân chung của 33 kịch bản đỏ: dataset v4 là **kho dùng chung** (`QĐ-103d`: một thuê bao cho mỗi gói, không thuộc phòng
nào), có sẵn Request, tác vụ thu hồi, hồ sơ nghỉ việc, đề xuất/phiên bản ngân sách và người giữ ghế của riêng nó; các kịch bản
viết cho seed v3 (thuê bao theo phòng sở hữu, người/phòng không có sẵn quyền, bảng trống).

## 2. Sau khi sửa

| Chỉ số | Trước | Sau |
| --- | --- | --- |
| Test suites | 9 đỏ · 1 xanh | **10 xanh · 1 skip** (11 file: thêm `mf5-rightsizing-no-head`) |
| Tests | 33 đỏ · 36 xanh · 0 skip | **60 xanh · 0 đỏ · 9 skip** (69; số kịch bản không đổi) |
| Jest / cả lệnh `pnpm test:flows` | 31,7 s / ≈ 120 s | 43 s / **81 s** (lượt cuối); lượt trước khi skip 9 kịch bản nhóm C: 59,8 s / 100 s, 69/69 xanh |

Đo trên máy dev (Windows, Docker Desktop, PostgreSQL 17 `fsync=off`), một lượt, không so với runner 2 vCPU của GitHub.

## 3. Từng kịch bản đã sửa (file · kịch bản · nhóm · đổi gì)

Không nới assert, không xóa kịch bản (một kịch bản chuyển sang file riêng, xem dòng `mf5-rightsizing-no-head`), không đụng `src/`,
fixture seed, migration, `openapi.json`. Thay đổi harness duy nhất: `FlowCalls.subscriptionOf(planName)` — truy thuê bao theo tên gói
(kho dùng chung, đúng một thuê bao mỗi gói) thay vì theo (gói, phòng sở hữu).

| File | Kịch bản | Nhóm | Đổi gì |
| --- | --- | --- | --- |
| `mf1-request-contract` | F1-02 ngân sách: dòng BM-10 còn khoảng mua, phiên bản còn ngưỡng giá trị cao ⟹ 422 | A | Phòng Thiết kế đã có đề xuất của năm hiện hành (v4 cấp ngân sách qua đề xuất ⟹ 409) và dòng Figma bị đòi giải trình ZBB (`BUDGET.ZBB_REQUIRED`, KPI-3 của usage v4). Chạy cho năm sau, dòng không gắn gói; cặp 422/201 vẫn chỉ khác đúng field cũ `windowFrom` |
| `mf1-request-contract` | F1-03 trình lô, duyệt chi và cấp đều có người của riêng nó | A/D | `subscriptionOf` theo kho dùng chung |
| `mf1-request-contract` | F1-04 BR-MF1-02 trưởng phòng tự gửi đi thẳng duyệt chi | A | NV-ENGH đã giữ Jira (409 `ALREADY_HOLDS_ACCESS`): xin Mailchimp Standard, gói họ không giữ và không có Request mở |
| `mf1-request-contract` | F1-04 trình lô, duyệt chi và hoàn tất cấp: lần hai là 409 | A/D | `subscriptionOf` |
| `mf1-group-request` | nhóm hai người do nhân viên gửi đi hết các bước | A/D | `subscriptionOf` |
| `mf1-group-request` | nhà thầu được cấp quyền, ngày kết thúc = hôm nay + thời hạn − 1 | A | `POST /employees` mã `NV-CTR1` trùng nhà thầu có sẵn của v4 (422): dùng NV-CTR1 (nhà thầu Kỹ thuật, chưa có Figma) thay vì tạo; `subscriptionOf` |
| `mf4-budget` | F4-01 phòng Thiết kế chưa có ngân sách ⟹ gửi, Finance lập, Người duyệt chi duyệt | A | v4 đã cho mọi phòng có Cost Center đề xuất + phiên bản năm nay (đề xuất thứ hai ⟹ 409). Mọi kịch bản đề xuất chạy cho **năm sau** (kỳ đã phát hành; Thiết kế, Tài chính, Ban Giám đốc chưa có đề xuất); dòng Figma kèm `zbb`; tên thêm "năm sau" |
| `mf4-budget` | sau khi có ngân sách, Request của phòng Thiết kế được trình lô và có bước duyệt chi | A (đổi tên) | Thiết kế đã giữ Figma và ngân sách vài trăm nghìn: chạy trên phòng Kỹ thuật (NV-DEV3 xin Figma, ngân sách rộng). Giữ nguyên mọi assert (trình lô 201, `budget-check` `BUDGET_OK`/`SPEND_APPROVAL`/`bindingTotal`, `AWAITING_SPEND_DECISION`) |
| `mf4-budget` | F4-01 chỉ số tiền: Cost Center của chính mình, tiền tệ không do client gửi | A | NV-FINH đề xuất cho năm sau (năm nay ⟹ 409) |
| `mf4-budget` | F4-02 dự phòng khác 10 % phải có lý do… | A | Đề xuất của IT cho năm sau là đề xuất v4 để chờ Finance: lập phiên bản từ nó (tạo đề xuất mới ⟹ 409) |
| `mf4-budget` | F4-02 Người duyệt chi từ chối phiên bản khác phải nêu lý do | A | Đề xuất NV-DEP cho năm sau, dòng có `zbb` |
| `mf5-ghost-seat` | định tuyến tới trưởng phòng ⟹ Thu hồi… ⟹ ACCEPTED | A/D | `subscriptionOf`; ghế tự dựng ghi `owning_department_id` = Kỹ thuật (thuê bao dùng chung không có phòng sở hữu). Cập nhật comment đầu file (luật G3/G4 đã có, seed chạy chúng) |
| `mf5-ghost-seat` | Giữ đóng KEPT không báo người giữ; Miễn trừ đóng EXEMPTED | A/D | như trên |
| `mf5-rightsizing` (4 kịch bản F5-02) | IT đề xuất giảm, trưởng phòng sở hữu xác nhận, IT ghi kết quả | B | Chỉ thuê bao **có phòng sở hữu** mới có trưởng phòng quyết (mục 5): chạy trên ChatGPT Plus (K1, sở hữu Kỹ thuật) với ghế NV-DEV1 (R18) thay cho Jira (kho dùng chung ⟹ 404). Mọi assert giữ nguyên |
| `mf5-rightsizing-edges` (5 kịch bản) | các biên F5-02: số ghế vượt, trường theo lựa chọn, hủy còn người dùng, đề xuất lỗi thời | B/A | Cursor Pro (K1, chưa ai giữ) thay Jira: cấp hai ghế qua cả luồng Request; ChatGPT Plus: ghế NV-DEV1 + một ghế cấp mới (NV-DEV1 đã giữ ChatGPT ⟹ `ALREADY_HOLDS_ACCESS`). Đếm tác vụ thu hồi tính từ mốc đầu file (dataset đã có 1 tác vụ thu hồi, của NV-DES11) |
| `mf5-rightsizing-no-head` (file mới, 1 kịch bản) | trưởng phòng nghỉ việc ⟹ hồ sơ chờ NO_HEAD, Super Admin được báo một lần | B/D | Chuyển từ `mf5-rightsizing-edges`, nội dung giữ nguyên (người nghỉ là NV-ENGH, thuê bao ChatGPT Plus). **Nguyên nhân gốc (D):** một file jest chỉ dựng được một app — `AppModule` được import và đọc `process.env` một lần, app thứ hai trong cùng file nối vào database của app thứ nhất — và hai thuê bao có phòng sở hữu của dataset đã bị các kịch bản khác quyết xong (mỗi kỳ chỉ một hồ sơ) |
| `mf2-offboarding` | F2-01 ghi hồ sơ HANDING_OVER… (`heldRights`) | A | NV-DEV1 giữ 5 quyền, không phải 1: số lấy từ cơ sở dữ liệu lúc ghi |
| `mf2-offboarding` | F2-01 sang ngày sau ngày cuối… (không có hồ sơ LEFT) | A | Dataset đã có hồ sơ LEFT của NV-OFF1: so với số đầu file |
| `mf2-offboarding` | F2-01 khi đã chặn, IT ghi khóa tài khoản và mở thu hồi: tác vụ nguồn DEPARTURE | A | Danh sách quyền, số tác vụ, nguồn tác vụ tính theo **quyền của NV-DEV1** (5 tác vụ `DEPARTURE`/`QUEUED`), không đếm toàn bảng |
| `mf2-abrupt-departure` | F2-02 IT Admin khóa rồi mở thu hồi (ABRUPT_DEPARTURE) | A → C | Tác vụ tính theo quyền của NV-DEV1. Sau đó skip (mục 4) |
| `mf2-abrupt-departure` | F2-05 chưa tới ngày cuối: "đã nghỉ" ⟹ 409 … | A → C | Hồ sơ LEFT so với số đầu file (NV-OFF1). Sau đó skip |
| `mf2-abrupt-departure` | F2-05 người không còn quyền nào ⟹ NOTHING_TO_REVOKE | A → C | NV-DEV3 giữ 2 quyền: dùng NV-MKT2 (không giữ quyền nào). Sau đó skip |
| `mf3-transfer` (4 kịch bản) | quyết định công cụ của trưởng phòng mới | A → C | Người chuyển là NV-CTR1 (đúng một quyền, Jira) thay NV-DEV1 (5 quyền ⟹ 5 dòng rà soát, kịch bản mong 1); số tác vụ thu hồi tính so với đầu file (dataset có 1). Sau đó skip |

Không đổi nội dung (đã xanh): `f0-auth-roles`, 8 kịch bản còn lại của `mf1-*`, 4 kịch bản còn lại của `mf2-offboarding`, 3 kịch bản
còn lại của `mf4-budget`. Riêng `mf2-abrupt-departure` "ghi BLOCK_NOW" được chọn cột `employee_access_blocks` theo NV-DEV1 để không phụ
thuộc số dòng của dataset.

## 4. `it.skip` nhóm C — để đợt MF-2/MF-3 viết lại (9)

Cả 9 kịch bản **đã xanh** trên `origin/dev` `a2dad526` sau khi sửa dữ liệu (lượt 69/69 xanh, mục 2); skip vì chúng kiểm hành vi mà
SPEC `docs/reviews/mf2-mf3-2026-11-10/SPEC.md` (nhánh MF-2/MF-3, chưa có trong `origin/dev`) thay. Comment
`// MF-2/MF-3 round rewrites this — SPEC mf2-mf3-2026-11-10 <gói>` nằm ngay trên từng `it.skip`. Muốn giữ phủ sóng tới khi đợt đó
merge: bỏ `.skip` của đúng các dòng này (không cần sửa dữ liệu thêm).

| File | Kịch bản | Gói SPEC | Hành vi bị thay |
| --- | --- | --- | --- |
| `mf3-transfer` | khi điều chuyển có hiệu lực, trưởng phòng mới thấy các công cụ cần quyết… | MF3-A (A11) | rà soát của trưởng phòng mới: 4 route `transferReview*` ⟹ 410, mỗi quyền cũ có kết cục riêng (MF3-E) |
| `mf3-transfer` | quyết định đã bỏ hoặc thiếu lý do ⟹ 422… | MF3-A | như trên |
| `mf3-transfer` | trưởng phòng cũ, IT Admin, Người duyệt chi không quyết thay: 403 `NOT_REVIEWER` | MF3-A | như trên |
| `mf3-transfer` | trưởng phòng mới quyết kèm lý do; "vẫn cần" rút lại một lần… | MF3-A | như trên |
| `mf2-abrupt-departure` | F2-02 ghi BLOCK_NOW: token và đăng nhập bị từ chối ngay, dù ngày cuối ở phía trước | MF2-B (N0, O-1) | `BLOCK_NOW` không còn ngày cuối tương lai: ngày cuối = ngày ghi |
| `mf2-abrupt-departure` | F2-02 IT Admin khóa rồi mở thu hồi: nguồn `ABRUPT_DEPARTURE` | MF2-B, MF2-D | dựa vào hồ sơ `BLOCK_NOW` có ngày cuối tương lai; hạn thu hồi mới |
| `mf2-abrupt-departure` | F2-05 chưa tới ngày cuối: "đã nghỉ" ⟹ 409 `LAST_WORKING_DAY_AHEAD`, đóng hồ sơ ⟹ 409 `CASE_NOT_LEFT` | MF2-B, MF2-G (N9) | `BLOCK_NOW` đánh dấu đã nghỉ ngay; route `closure` của IT Admin gỡ, hệ thống đóng |
| `mf2-abrupt-departure` | F2-05 người không còn quyền nào ⟹ 409 `NOTHING_TO_REVOKE` | MF2-B | `BLOCK_NOW` với ngày cuối tương lai bị từ chối (`BLOCK_NOW_LAST_DAY_IS_TODAY`) |
| `mf2-abrupt-departure` | F2-05 đến ngày cuối: "đã nghỉ", đóng hồ sơ khi còn tác vụ thu hồi ⟹ 409 `CASE_NOT_CLOSEABLE` | MF2-G (N9, T-1) | hệ thống đóng hồ sơ, không còn route đóng của IT Admin |

Không skip: `mf2-offboarding` (7 kịch bản — hồ sơ `WITH_LAST_DAY`, hủy trước ngày cuối, từ chối vai/căn cứ; SPEC không đổi hành vi
được kiểm) và kịch bản "field abrupt cũ ⟹ 422" của `mf2-abrupt-departure` (không phụ thuộc ngày cuối hay route đóng).

## 5. Nghi lỗi BE

**N-1. Thuê bao của kho dùng chung không vào được luồng gia hạn/điều chỉnh (SBF-12, `/subscription-renewals`).**

- Kịch bản: `mf5-rightsizing` và `mf5-rightsizing-edges` (10 kịch bản). Trước khi sửa, `POST /subscription-renewals` cho Jira
  (`subscriptionId` của kho dùng chung) trả **404** thay vì 201 (kịch bản #1 của `mf5-rightsizing` trong baseline).
- Mong đợi theo luật: BRD `FR-1.12`/`QĐ-94d` — IT vận hành vòng đời **mọi** thuê bao theo mốc ND−90/−60/−30/−7 và lập đề xuất điều
  chỉnh; README v4 ghi Figma "gói năm cam kết 12 tháng, gia hạn sau 50 ngày; MF-5". Sau `QĐ-103d` mọi thuê bao của dataset (trừ hai
  thuê bao K1) là kho dùng chung, không có phòng sở hữu.
- Thực tế: thuê bao không có `owner_department_id` bị lọc khỏi mọi "kỳ" của gia hạn nên đề xuất ⟹ `NOT_FOUND`, job quét mốc không thấy
  chúng, và trưởng phòng quyết (`ownerHeadOf`) không có ai.
- Nghi ngờ: `src/modules/catalog/subscription/subscription-period.service.ts:28-33,214` (`isOwned`, `records.filter(isOwned)`; comment
  dòng 28 ghi đây là có chủ ý: "the subscriptions of the shared pool (K2, K4) … are not decided here"),
  `src/modules/licensing/subscription-renewal/proposal/renewal-proposal.service.ts:54-55`. Đây có vẻ là phần chưa làm của W5
  (SPEC `mf1-mf4-reaudit-2026-11-09` §7: *điểm điều chỉnh, cảnh báo đỏ, đóng thuê bao, KPI-4*) chứ không phải lỗi ngoài ý định —
  nhưng nghĩa là **bước "điều chỉnh thuê bao" của demo MF-5 không chạy trên Figma/Jira/Slack… của seed v4**. Chưa sửa gì; suite chỉ
  phủ được luật này trên hai thuê bao K1 (có phòng sở hữu).

**N-2 (ghi nhận, không phải lỗi chắc chắn).** README v4 nói "mỗi (ứng dụng, gói) có một thuê bao: kho ghế của cả công ty, không thuộc
phòng nào", nhưng ChatGPT Plus và Cursor Pro (K1) có `owner_department_id` = Kỹ thuật (`SELECT … FROM subscriptions WHERE
owner_department_id IS NOT NULL` ⟹ 2 dòng). Hoặc README hoặc dữ liệu K1 cần thống nhất; N-1 phụ thuộc vào đây.

## 6. Đưa vào CI

- `.github/workflows/nightly.yml`: thêm job `flows` (PostgreSQL 17 service như `mutation`, `.github/actions/setup`,
  `.github/actions/test-database`, `pnpm test:flows` với `TEST_DATABASE_ADMIN_URL` của `ci_integration`, artifact
  `nightly-flows-timings`), `timeout-minutes: 20` (tạm — local 81 s; đặt theo p95 + 50 % khi có run thật). `workflow_dispatch` đã
  có sẵn. Cập nhật comment đầu workflow.
- `test/README.md`: bỏ "không CI", ghi chạy ở job `flows` của nightly + số đo; thêm vào bảng CI. `test/config/jest.flows.cjs`: đổi comment.
- **Đề xuất thêm vào `ci.yml` cho mỗi PR:** suite chạy **81 s** local (< 8 phút) nên đủ điều kiện, nhưng **không tự thêm** theo yêu
  cầu. Cân nhắc: PR hiện đã tốn 24–34 phút ở integration; flows chạy tuần tự trên một cluster, ước thêm vài phút trên runner 2 vCPU.
  Nên đợi 1–2 run nightly đầu để có số đo thật trước khi quyết.
- Không có run GitHub nào được thực hiện (không push). `nightly.yml` chỉ được kiểm bằng `prettier --check` (xanh), chưa chạy thật.

## 7. Kiểm (lượt cuối, trên mã đã chốt; kết quả thật)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm test:flows` | exit 0 — Test Suites 10 passed · 1 skipped; Tests **60 passed · 9 skipped · 0 failed** (69); Jest 43 s, cả lệnh 81 s; không còn database `slm_*` sót lại |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm rules:check` | exit 0 — 606 files, 4201 links, 0 errors |
| `pnpm rules:format` | exit 0 |
| `pnpm test:gates` | exit 0 — 16 suites, 331 tests |
| `pnpm test:discovery` | exit 0 — flows 11 spec file(s) |
| `prettier --check test .github/workflows/nightly.yml` | xanh |

Không chạy: `pnpm check`, integration, e2e, http (theo yêu cầu — CI GitHub). Chưa chạy được: job `flows` trên GitHub Actions (không push).
Commit: xem message cuối. Không push, không PR.

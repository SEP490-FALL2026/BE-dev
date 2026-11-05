# ITEMS — đề xuất chia hạng mục cho pha spec/plan (C-SPEC)

> Agent **B-LEDGER**, 05/11/2026. Mã `L-xxx` xem [LEDGER.md](LEDGER.md); câu hỏi `Q-xx` và tự giải `S-xx` xem [QUESTIONS.md](QUESTIONS.md).
> Chia theo [`docs/rules/work-item-sizing.md`](../../rules/work-item-sizing.md): một hạng mục là một business outcome kiểm chứng độc lập. Tách khi gặp ranh giới migration, wire contract, job bất đồng bộ hoặc bảo mật. Không tách chỉ theo tầng kỹ thuật. Mỗi AC chỉ có một chủ.
> Skill: `planning-and-task-breakdown` (đồ thị phụ thuộc, vertical slice, checkpoint), `code-review-and-quality` (đặt việc khó và rủi ro lên trước), `superpowers:verification-before-completion` (mục 5 kiểm mọi `L-` đều có đúng một chủ).

## 0. Nguyên tắc chia

1. **Ưu tiên:** (a) lỗi bảo mật hoặc sai luật đang chạy trên demo → (b) gỡ khái niệm đã bỏ và dọn trường API → (c) luật mới còn thiếu. Bảng dưới theo **phương án B** của Q-01 (khuyến nghị). Mục 3 liệt kê hạng mục **hoãn**; nếu Owner chọn A hoặc D thì đưa phần tương ứng vào.
2. Tên thư mục cố định là `docs/workspace/items/qd96-100-<slug>/`. Mỗi hạng mục có spec, plan và test matrix trước khi code (tracker pha C).
3. **Migration** chạy tuần tự theo thứ tự build trên cùng một branch. Không hạng mục nào tạo lại enum type (theo khuyến nghị B của Q-02); giá trị enum cũ để lại, có test chặn ghi mới.
4. **Không đụng** `QĐ-100l`/`QĐ-100ah` (L-990). Mọi hạng mục giữ nguyên hành vi *trưởng phòng tự gửi Request cá nhân* như hiện nay.
5. Cỡ ghi theo giờ code + test theo file (LEDGER §15.2), chưa tính spec và review. Hạng mục trên 12h đều có lý do không tách ghi ở cột *Ghi chú cỡ*.

## 1. Bảng hạng mục trong phạm vi (phương án B)

| # | Thư mục | Ưu tiên | Mục tiêu (business outcome) | `L-` sở hữu | Module / API chạm | Mig | Phụ thuộc | Cỡ | Ghi chú cỡ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `qd96-100-revocation-deadline-and-withdraw` | (a) | Tác vụ thu hồi mang hạn và mốc *không trước* của nơi gọi, có cảnh báo quá hạn và báo người giữ seat. Nơi gọi **gỡ được lý do** khi nó không còn áp dụng. | L-701, L-702, L-704 | `licensing/provisioning`, `licensing/public` (facade `withdrawRevocationReason`), `operating-parameters` (`DEPARTURE_REVOCATION_WORKING_DAYS`), `notifications` | Có (`due_on`, `not_before`, nguyên nhân hủy) | — | M–L (≈ 9h) | Là enabler cho #2 nhưng có AC riêng (`QĐ-100x`, SBF-18 bước 1). Mode `grouped-stories`. |
| 2 | `qd96-100-departure-day-access-block` | (a) bảo mật | Hết ngày làm việc cuối thì hệ thống tự chặn đăng nhập, guard, refresh và lời mời. IT khóa tài khoản công ty và thu hồi **không chờ** *đã nghỉ việc*. Hủy bàn giao sau ngày cuối giữ trạng thái chặn và gỡ lý do thu hồi. Người nhận vai Super Admin phải *đang làm việc*. | L-401, L-402, L-403, L-415 | `personnel/offboarding` (sweeper theo giờ), `identity-access/accounts`, `auth`, `access` (cờ chặn đọc ở guard) | Có (cờ chặn trên `app_users`) | #1, S-11 | L (≈ 18h) | Một transaction chặn, một ranh giới bảo mật. Tách nữa thì sweeper không kiểm được một mình. Mode `split-story` (`US-03-04` partial). |
| 3 | `qd96-100-departure-block-now-mode` | (a) | Super Admin chọn nhịp *chặn ngay*, kể cả khi ngày cuối ở tương lai, ở cả hai đường: ghi trực tiếp và ghi từ `BM-09`. Lấy `left_on` = ngày làm việc cuối. Super Admin không còn ghi thay khóa tài khoản công ty. | L-405, L-408, L-411, L-414 | `personnel/offboarding`, `personnel/notice`; API `offboardingCaseRecord`, `…MarkLeft`, `personnelNoticeRecord` | Có (`abrupt` → cột nhịp) | #2, **Q-04** | M (≈ 7h) | — |
| 4 | `qd96-100-request-sender-rules` | (a) | Đóng mọi đường gửi Request cho **một** người khác: gỡ `delegatedRequestSend` (giữ `grantQueueList`), gỡ nhánh `byHead` của Request tiếp tục, Request nhóm tối thiểu 2 dòng. IT không kéo dài được hạn khi cấp. | L-201, L-202, L-203, L-206, L-218 | `requests/delegated-request` (chuyển grant-queue sang capability riêng), `renewal-request`, `group-request`, `return-request` (`fromRequestId` do server tính); `licensing/provisioning/tasks/provisioning-grant-writer` | Không | S-01, S-17 | M (≈ 8h) | Từ #4 đến khi có #17, MF-3 *còn cần* tạm dựa vào việc người chuyển tự gửi Request. Ghi rõ trong spec. |
| 5 | `qd96-100-sla-reminder-recipients` | (a) | Quá SLA chỉ nhắc người giữ bước, cộng người yêu cầu khi bước là của trưởng phòng. Bỏ leo thang lên cấp trên. Super Admin chỉ nhận ở ba ca. SLA cấu hình theo loại bước. | L-801, L-802, L-816 | `requests/sla`, `notifications` (bỏ `STEP_SLA_ESCALATION`, đổi `STEP_SLA_NO_SUPERIOR`), `operating-parameters` (tham số SLA theo loại bước; mã lỗi `ORGANIZATION.PAST_DAY_IMMUTABLE` 409 theo `QĐ-42d`) | Có (`SlaReminderRole` + `REQUESTER`) | S-05, S-06, S-07 | M (≈ 8h) | — |
| 6 | `qd96-100-budget-check-three-outcomes` | (a) lõi | Kiểm tra lúc trình và lúc duyệt trả ba kết quả *trong số cơ sở · dùng dự phòng · bị chặn*. Theo giá gốc chưa thuế, trừ Request đang chờ, phần năm sau là cam kết chuyển tiếp. Kiểm lại lúc duyệt trả về trưởng phòng. Bỏ lối `DIRECT` và `PLAN_LINE_OVERDUE`. | L-101, L-102, L-103, L-104, L-109, L-111, L-118 | `requests/spend`, `spend-approval`, `group-line-decisions`, `budgets/public` (`yearFacts` tách số cơ sở/dự phòng); API `spendBatchSubmit`, `spendApprovalDecide`, `spendBatchDecide`, `spendApprovalLineDecide` | Có (thêm giá trị enum, cờ `carryForward`) | **Q-02** | L (≈ 20h) | Một policy thuần cộng hai điểm gọi (trình lô, duyệt) dùng cùng hàm. Tách ra sẽ có giai đoạn trình và duyệt phán khác nhau. Mode `split-story` (`US-06-12` partial). |
| 7 | `qd96-100-reserve-confirmation` | (a) lõi | Trưởng phòng xác nhận dùng dự phòng kèm một dòng lý do ngay trong lần trình lô. Mục chưa xác nhận ở lại hàng đợi. Người duyệt chi thấy cờ, lý do và snapshot đủ số. Hồ sơ bổ sung được giảm thời hạn. Trưởng phòng rút được Request đang chờ xác nhận. | L-108, L-113, L-107, L-126, L-119 | `requests/spend-submission`, `spend`, `spend-approval-view`, `withdraw`; API `spendBatchSubmit.reserveConfirmations`, `accessRequestSupplementAdd`, `spendApprovalGet` | Có (bảng xác nhận, cột snapshot, term before/after) | #6, S-15, S-16 | L (≈ 22h) | Một wire contract (trình lô ↔ chi tiết duyệt chi). `US-06-16` partial. |
| 8 | `qd96-100-budget-visibility-qd100p` | (a) | Người yêu cầu thấy kết quả, lý do và phần vượt của **Request của mình**. Trưởng phòng thấy đủ số ngân sách phòng ở `budgetMine`, ở hàng đợi trình và trên dashboard. `budgetCheckGet` chuyển ra khỏi `finance-review/`. | L-112, L-308, L-806 | `requests/spend` (đọc kiểm tra), `budgets/budget-view`, `dashboards/manager` | Không | #6 | M (≈ 9h) | Một ranh giới quyền đọc (`QĐ-100p`). |
| 9 | `qd96-100-subscription-owner-confirmation` | (a) sai vai | Điều chỉnh thuê bao do IT đề xuất (kèm danh sách seat thu hồi), **trưởng phòng sở hữu** xác nhận hoặc yêu cầu sửa, IT lập lại đề xuất. Bỏ vai Người duyệt chi và listener chờ. Thu hẹp dữ liệu seat ranking và snapshot. Cho *giữ* khi chưa có Cost Center. Sửa người nhận cờ trễ. | L-601, L-602, L-603, L-610, L-614, L-617 | `licensing/subscription-renewal` (proposal, decision, parties, notifier), `notifications`; API `subscriptionRenewalPropose/Decide/List/Get`, `subscriptionDeadlineEvents` | Có (`deciderRole`, `REVISION_REQUESTED`, phiên bản đề xuất) | — | L (≈ 20h) | Đổi vai ở mức operation; tách ra thì có giai đoạn không ai quyết được. `US-11-06` full, `US-11-05` partial. |
| 10 | `qd96-100-renewal-milestones-and-recipients` | (a) | Mốc mặc định `[90, 60, 30, 7]` với người nhận theo từng mốc; không gửi Người duyệt chi và Super Admin. Bỏ ND−7 khi *đã xác nhận và đã báo nhà cung cấp*. Thuê bao linh hoạt không chạy chuỗi ND và không bị tính `KPI-4`. Sự cố tự gia hạn báo thêm trưởng phòng sở hữu và Finance. | L-605, L-606, L-607, L-805 (vế A5-08) | `licensing/subscription-renewal/{alerts,deadline}`, `catalog/subscription` (sweep), `operating-parameters`; API mới `…/vendor-notice` | Có thể (giá trị tham số đã lưu, `vendor_notified_at`) | #9 | M (≈ 11h) | — |
| 11 | `qd96-100-remove-finance-review-path` | (b) | Finance không còn nằm trên đường Request: gỡ Finance rà soát, hỏi Finance, *chờ ngân sách*, các listener và sự kiện phiên bản liên quan, SLA kind `FINANCE_REVIEW` và vai `FINANCE_QUESTION`, 6 mã thông báo. Chuyển `spend-effects.service.ts` sang `spend/` trước khi xóa thư mục. | L-121, L-122, L-123, L-127 | `requests/{finance-review, budget-questions, budget-information, spend, sla, status/rules}`, `budgets/public/budgets.extension-points`, `notifications`; xóa 7 endpoint | Có (migration dữ liệu treo, drop bảng) | #6, #7, **Q-02** | L (≈ 19h) | Xóa có kiểm tra (`technical-enabler` + AC gỡ). Tách theo bảng sẽ để lại route mồ côi. |
| 12 | `qd96-100-remove-spend-override` | (b) | Người duyệt chi không còn override. Bỏ giá trị lịch sử người thay, xung đột lợi ích. | L-110, L-117 | `requests/spend`, `spend-approval`, `group-line-decisions`; API `spendApprovalDecide`, `spendApprovalLineDecide` | Có (drop cột `override_*`) | #6, **Q-02** | M (≈ 5h) | — |
| 13 | `qd96-100-remove-budget-revision-and-high-value` | (b) | Ngân sách đã duyệt khóa cả năm: gỡ phiên bản sửa đổi, dời khoảng mua, `SUPERSEDED`, ngưỡng giá trị cao. | L-124, L-125 | `budgets/version`, `budgets/budget`, `requests/spend` (mã `HIGH_VALUE`); xóa 3 endpoint | Có | #6, **Q-02** | L (≈ 14h) | Hai khái niệm cùng nằm trên bảng `budget_versions` và cùng màn hình Finance. |
| 14 | `qd96-100-annual-budget-reserve-and-floor` | (b)/(c) | Dự phòng mặc định 10 % do Finance cấu hình (cơ chế *vai sở hữu tham số*). Thêm `reserveReason`. Chặn duyệt phiên bản khi số cơ sở nhỏ hơn tổng cam kết chuyển tiếp. Dọn trường tiền tệ và Cost Center mà server tự tính. | L-304, L-306, L-307, L-309, L-310, L-815 (vế vai sở hữu) | `budgets/version`, `budgets/budget`, `budgets/proposal`, `operating-parameters`; API `budgetVersionCreate/Update/Send/Decide`, `budgetProposalSubmit` | Có | #13, S-03 | M (≈ 9h) | — |
| 15 | `qd96-100-request-term-limit` | (b) | Thời hạn tối đa 12 tháng ở mọi loại Request. Thuê bao linh hoạt tới 31/12, có cờ trả trước một lần. Bỏ `termConfirmation`. Preview trả `termLimit`. | L-204, L-219 (vế `termLimit`) | `requests/{access-request, group-request, renewal-request, service-account-request, assessment, request-submission, draft}` | Có thể | — | M (≈ 7h) | — |
| 16 | `qd96-100-request-year-without-spend-date` | (b) | Bỏ *ngày dự kiến chi* ở 8 DTO. Năm tạm tính lúc trình, tính lại lúc duyệt chi; thời hạn bắt đầu từ ngày duyệt chi. Hồ sơ bổ sung không dời ngày được. Dòng kế hoạch lệch năm thì chặn lúc trình. Bản nháp cũ đọc lại được. | L-105, L-106, L-217, L-219 (vế response) | `requests/access-request/pricing.policy`, `request-facts`, `assessment/need-spend`, `spend-submission/supplement*`, `draft` codec; FE need-decision form | Có (`expected_spend_on` đổi nghĩa, cột before/after) | #6, #7, #15, S-14 | L (≈ 15h) | Một luật (`QĐ-98a(1)` + `QĐ-100n`) lan qua mọi điểm tính giá. Tách thì một số Request mất năm. |
| 17 | `qd96-100-transfer-replacement-request` | (a)/(c) | Trưởng phòng mới chọn *còn cần* cho quyền trả phí thì hệ thống **tự tạo** Request cấp thay thế: liên kết quyền cũ, miễn cửa sổ, nhu cầu đã xác nhận, vào hàng đợi trình của trưởng phòng mới. Thêm trường `reason` cho quyết định rà soát. | L-505 | `requests/public` (facade `createTransferReplacement`), `personnel/transfer-review`; API `transferReviewDecide` | Có (liên kết Request ↔ dòng rà soát) | #4, #6, #16, #18 | L (≈ 12h) | Ranh giới `personnel` → `requests` qua một facade. `US-03-07` partial. |
| 18 | `qd96-100-transfer-review-defaults` | (a) | Quá hạn rà soát thì thu hồi mặc định (trừ rà soát sau khởi tạo), có báo trước 2 ngày làm việc. Hạn tạm dừng khi phòng nhận không có trưởng phòng. Bỏ `NEEDS_NEW_TOOL`. Phần mềm nội bộ *còn cần* thì giữ. Sửa mã cảnh báo Business Owner. | L-502, L-503, L-506, L-507, L-508, L-510 | `personnel/transfer-review`, `operating-parameters`, `notifications`; API `transferReviewDecide` | Có (giá trị quyết định, hạn có thể tạm dừng, dữ liệu `NEEDS_NEW_TOOL`) | S-13 | L (≈ 15h) | Một job và một mô hình hạn. Chồng lấn đầy đủ (L-504) để sang hạng mục hoãn #H6. |
| 19 | `qd96-100-head-group-request-queue` | (a) | Request nhóm do trưởng phòng gửi vào hàng đợi trình **ngay**; khi trình lô thì mở hai bước cho dòng của trưởng phòng. Người mới xếp phòng từ ngày tương lai được đưa vào nhóm. | L-210, L-211 | `requests/group-request-submission`, `requests/spend` (`spend-routing`), `organization/public` (đọc xếp phòng tương lai) | Có thể | #6 | M–L (≈ 10h) | Cần test tái hiện trước khi sửa vì kết luận gốc chỉ dựa trên đọc code. |
| 20 | `qd96-100-approved-end-date` | (c) | Quyền trả phí cấp qua Request có ngày kết thúc do server tính (`QĐ-98a`). Ngày hết hợp đồng của nhà thầu lấy theo Q-03. Bỏ lỗi làm lộ loại hợp đồng của đồng nghiệp; thu hẹp `accessRequestLineList`. | L-205, L-220 | `requests/grant`, `group-request` (bỏ hoặc đổi `lines[].expectedEndDate`), `licensing/assignment`; có thể `organization/employee` (cột ngày hết hợp đồng) | Có thể (cột hồ sơ, nếu chọn b1) | #15, #16, **Q-03** | L (≈ 10h) | — |
| 21 | `qd96-100-renewal-chaining-and-window` | (c) | Request tiếp tục nhập *số tháng dùng thêm*, nối tiếp từ ngày sau ngày hết hạn, chỉ gửi được trong cửa sổ 30 ngày. Cách áp dụng khi được duyệt theo Q-08. | L-208, L-207, L-215 | `requests/renewal-request`, `renewal-apply`, `operating-parameters`; API `accessRequestRenewalSubmit` | Không | #20, S-02, **Q-08** | M–L (≈ 10h) | — |
| 22 | `qd96-100-spend-notifications` | (c) | Người duyệt chi được báo khi có lô trình. Người yêu cầu và trưởng phòng được báo khi Request bị chặn, cần xác nhận dự phòng, bị trả về lúc duyệt hoặc bằng chứng giá hết hạn (kèm `overageAmount`). Trưởng phòng được báo khi cấp phát xong. | L-803, L-804, L-811 | `requests/status/rules`, `notifications/inbox` (nới `FIGURE_WORDS` cho đúng khóa) | Không | #6, #7, #11 | L (≈ 15h) | Một danh mục mã thông báo cộng một chính sách lọc số. |
| 23 | `qd96-100-subscription-quantity-guard` | (a) | Đổi số lượng và phòng sở hữu của thuê bao ACTIVE phải kèm căn cứ (Request, kết quả điều chỉnh hoặc sửa dữ liệu có lý do). Sau baseline, tạo thuê bao phải nối Request. | L-708 | `catalog/subscription`; API `subscriptionCreate`, `subscriptionUpdate` | Có thể | **Q-06** | M (≈ 4h) | — |
| 24 | `qd96-100-personnel-grounds-and-reasons` | (b) | Căn cứ và lý do bắt buộc ngay ở DTO cho mọi sự kiện nhân sự, kể cả đổi ngày cuối và hủy bàn giao. Server tự tính `count`, lý do thu hồi và lý do hủy điều chuyển chờ. | L-409, L-412, L-413, L-460 | `personnel/{offboarding, transfer, leave, notice}`, `personnel-grounds.policy` | Có thể (check `grounds_type`) | #3, S-10 | M (≈ 7h) | — |
| 25 | `qd96-100-people-read-scope` | (b) | IT Admin và trưởng phòng chỉ đọc đúng phần tối thiểu (`BM-09`, nghỉ việc, nghỉ dài, thành viên phòng, giám sát Super Admin). | L-417, L-418, L-419 | `personnel/{notice, offboarding, leave, role-duties}`, `organization/department` | Không | S-12 | S–M (≈ 4h) | — |
| 26 | `qd96-100-account-org-api-fields` | (b) | Dọn trường tài khoản và tổ chức: enum vai ở input, `loginEmail` (Q-10), `jobTitle`, `kind` của Cost Center, thêm `role` đơn, `successor` bị bỏ qua lặng lẽ. Cách xác định người ở thông báo *chuyển đến* (Q-10). | L-461, L-462, L-463, L-464, L-465, L-466, L-512 | `identity-access/accounts`, `access`, `organization/{employee, cost-center}`, `personnel/{transfer, notice}` | Không | **Q-10** | S–M (≈ 6h) | Gom các thay đổi nhỏ cùng loại (hợp đồng API, vai Super Admin, `grouped-stories`). |
| 27 | `qd96-100-catalog-licensing-api-fields` | (b) | Dọn trường catalog và licensing: contract, document, `sharingPolicy`, xác nhận ngừng ứng dụng, `taxType`, completion, handover value, `linkedWork`, cột seat-baseline, ngày kết thúc khi đổi người chịu trách nhiệm, khóa `allowsMidTermReduction`, NFC. | L-713, L-714, L-715, L-710 | `catalog/{contract, document, plan, plan-terms, application-retirement, vendor}`, `licensing/{provisioning, handover, saas-issue, assignment, public}`, `data-import/seat-baseline-import`, `finance/tax-profile` | Có (`document_attachments.subscription_id`, tính lại cột chuẩn hóa định danh) | S-20, S-22, Q-03 (d), Q-10 | M–L (≈ 10h) | Nếu spec thấy quá rộng thì tách hai: `-catalog-` và `-licensing-`. |
| 28 | `qd96-100-seed-demo-v3` | (b) | Dataset `shared-demo-v3`: bỏ R9 và `highValuePercent`, dự phòng đúng 10 % hoặc có lý do, README đúng. Thêm kịch bản cho luật trong phạm vi B: bị chặn, dùng dự phòng, MF-2 chặn ngay và hủy sau ngày cuối, MF-3 thu hồi mặc định, thuê bao cam kết kỳ gần ND−7. | L-901, L-902, L-903 (vế dự phòng), L-904 (vế phạm vi B), L-905 | `src/cli/seed/**` | Dữ liệu (reset VPS) | Mọi hạng mục ở trên, **Q-02** | L (≈ 14h) | Làm cuối để kịch bản phản ánh hành vi đã chốt. |

Tổng phạm vi B: **28 hạng mục, khoảng 330h** code + test theo file. Con số này lớn hơn ước 290h ở Q-01 vì mỗi hạng mục cộng thêm 10–15 % cho test HTTP và integration xuyên module.

## 2. Thứ tự build và checkpoint

```text
Track P (people, bảo mật)   #1 → #2 → #3 → #24 → #25 → #26
Track R (sender, SLA)       #4 → #5
Track B (ngân sách MF-1)    #6 → #7 → #8 → #11 → #12 → #13 → #14 → #15 → #16 → #19 → #20 → #21 → #22
Track L (thuê bao)          #9 → #10 → #23 → #27
Track T (điều chuyển)       #18 → #17   (#17 cần #4, #6, #16)
Cuối                        #28
```

- **CP-1** (sau #2, #4, #5, #6, #9): các lỗi (a) trên demo đã đóng. Owner xem lại trước khi gỡ khái niệm cũ.
- **CP-2** (sau #11, #12, #13, #16): không còn route, trạng thái hay trường nào của khái niệm đã bỏ. Đây là lúc sinh lại client FE (L-981) và cập nhật tài liệu API-Integration (L-984).
- **CP-3** (sau #17, #20, #21, #22): luồng MF-1, MF-3 chạy end-to-end.
- **CP-4** (#28): seed v3; Owner reset VPS demo; chạy full suite theo quy trình audit.

Track P, R, L, T song song được với Track B. Riêng migration phải nối tiếp theo thứ tự merge.

## 3. Hạng mục hoãn (ngoài phương án B)

Đặt tên trước để giữ ổn định; spec khung và scope map viết khi Owner đưa vào lượt sau.

| # | Thư mục | `L-` | Lý do hoãn | Câu hỏi | Cỡ |
| --- | --- | --- | --- | --- | --- |
| H1 | `qd96-100-annual-budget-envelope-targets` | L-301, L-302, L-303, L-305, L-311, L-814, L-903 (vế phong bì) | MF-4 B0→B3, B5/B6, ZBB **chưa có gì**. Đây là tính năng mới, không phải luật sai. Nếu Owner chọn D thì đưa vào sau #14; khi viết spec phải tách tối thiểu ba hạng mục: B2+B3, B5/B6, `BM-10`+ZBB. | Q-01, Q-07 | ≈ 50h |
| H2 | `qd96-100-seat-transfer-and-reuse` | L-705, L-706, L-707, L-703, L-114, L-511 | Chạm `licensing`, `budgets` và trigger DB; cần Q-05. Phần *tiền mới = 0* phụ thuộc ở đây. | Q-01, Q-05 | ≈ 50h |
| H3 | `qd96-100-subscription-lifecycle` | L-604, L-608, L-609, L-611, L-612, L-613, L-615, L-616, L-618, L-619, L-805 (vế A5-09), L-810, L-812, L-813 | Nhịp 2 của MF-5 sau khi đã sửa vai (#9). Khi viết spec phải tách ít nhất bốn hạng mục: điểm linh hoạt, hết hạn và đóng, đổi tier và kết quả, nhắc và email. | Q-01, Q-09 | ≈ 60h |
| H4 | `qd96-100-new-request-types` | L-209, L-213, L-214, L-216 | Ba loại Request mới. Hợp thức hóa cần G9 (`BM-07`); tăng cấp thuê bao cần H3. Tiếp tục nhóm cần #20 và #21. | Q-01 | ≈ 38h |
| H5 | `qd96-100-role-dashboards-and-summary` | L-807, L-808, L-809 | Dashboard Finance và Người duyệt chi, bản tóm tắt hằng tháng (S-08). | Q-01 | ≈ 26h |
| H6 | `qd96-100-transfer-labels-and-overlap` | L-501, L-504, L-509 | Nhãn T1–T4, chồng lấn 5 ngày làm việc, trạng thái giữ. Phần thu hồi mặc định đã có ở #18. | Q-01 | ≈ 26h |
| H7 | `qd96-100-invoice-actuals` | L-312 | Hóa đơn và thực chi (thuộc EP-12). API vẫn trả `spent` = 0. | Q-01 | ≥ 16h |
| H8 | `qd96-100-historical-departure-import` | L-416 | Chỉ phục vụ lượt quét G2 đầu tiên. | Q-01 | ≈ 6h |
| — | không tạo hạng mục | L-709 (ghi nợ), L-711 (G7 do Owner giữ), L-712 (đã có `a05-k4-*`), L-410 (đúng, không làm), L-990 (chờ mentor) | — | — | — |

## 4. Ngoài BE

| Việc | `L-` | Chủ | Thời điểm |
| --- | --- | --- | --- |
| Sinh lại client FE từ OpenAPI mới; sửa form need-decision, spend-decision, grant, catalog; thay ô UUID thô bằng picker | L-981, L-982, L-983 | FE | Sau CP-2 |
| Cập nhật `Docs/Figma UI-UX/API-Integration/**` | L-984 | Docs/FE | Song song với từng hạng mục đổi hợp đồng |
| Sửa câu chữ tài liệu tự mâu thuẫn | LEDGER §14 | Owner/Docs | Trước pha spec cho các câu liên quan (S-09…S-13) |

## 5. Kiểm phủ

- Mỗi dòng `L-` của LEDGER §3–§12 thuộc **đúng một** hạng mục ở mục 1 hoặc mục 3, hoặc ở dòng *không tạo hạng mục*. Dòng nào được chia vế giữa hai hạng mục thì ghi rõ vế: L-219 (#15 / #16), L-805 (#10 / H3), L-815 (#14, phần còn lại do từng hạng mục tự thêm khóa tham số), L-903 và L-904 (#28 / H1, H2, H3).
- L-981…L-984 nằm ở mục 4.
- `QĐ-100l`/`QĐ-100ah` không thuộc hạng mục nào (L-990).

## 6. Điều chỉnh sau khi Owner trả lời (05/11/2026)

Căn cứ: [QUESTIONS.md mục D](QUESTIONS.md#d-owner-trả-lời-05112026).

- **Bỏ khỏi lượt này (giao chat MF-5):** #9 `qd96-100-subscription-owner-confirmation`, #10 `qd96-100-renewal-milestones-and-recipients`. Chat MF-5 sở hữu `licensing/subscription-renewal`, usage, mốc ND. Điều phối viên audit lại khi Owner báo xong.
- **Thêm #29 `qd96-100-manager-employee-detail`** (track P, ≈ 4h): `GET /departments/{id}/employees/{employeeId}` cho trưởng phòng — trường `QĐ-41c(2)` + quyền phần mềm đang giữ (phần mềm, gói, ngày cấp, ngày kết thúc) + Request đang mở của người đó trong phòng; không trả email, loại hợp đồng, tài chính.
- **Chốt theo câu trả lời:** #3 theo Q-04 B · #11–#13, #28 theo Q-02 B (`shared-demo-v3`) · #20 theo Q-03 a1+b1+c1 (cột *ngày kết thúc hợp đồng* trên hồ sơ + import) · #21 theo Q-08 C (K2 tự kéo dài + báo IT; K1 qua hàng đợi IT) · #23 theo Q-06 A (vế `renewalId` phối hợp chat MF-5) · #26 theo Q-10 (1a bỏ `loginEmail`, 2a `employeeCode`) · #27 theo Q-03 d1 + Q-10 3a (`taxType` mã đóng).
- **Phạm vi cuối:** 27 hạng mục (#1–#8, #11–#29), ước ≈ 300h code + test theo file.

### Track sau điều chỉnh

```text
Track P (people, bảo mật)   #1 → #2 → #3 → #24 → #25 → #26 → #29
Track R (Request)           #4 → #5 → #15 → #20 → #21 → #19
Track B (ngân sách MF-1)    #6 → #7 → #8 → #11 → #12 → #13 → #14 → #16 → #22
Track T (điều chuyển)       #18 → #17   (#17 cần #4, #6, #16)
Track L (catalog/licensing) #23 → #27
Cuối                        #28
```

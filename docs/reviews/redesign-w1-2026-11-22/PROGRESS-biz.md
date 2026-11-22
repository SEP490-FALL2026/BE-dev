# PROGRESS — Đợt 1 thiết kế lại, làn `biz` (`fix/redesign-w1-biz — Owner`)

Tracker sống qua compact context. Sonnet đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp:** đọc lại `SKILL.md` của process skill, TDD skill, `superpowers:verification-before-completion`; đọc lại SPEC/PLAN của gói kế (SONNET-PROMPT mục 0).
- **Đã chốt (SPEC mục 9), không hỏi lại:** W1-Q1 khóa tác vụ → Request + vòng lặp nhiều seat sắp theo (`subscriptionId`, `assignmentId`) · W1-Q2 `expectedUpdatedAt` bắt buộc khi có `purchasedQuantity` · W1-Q3 Request nhóm chỉ test lối ra · W1-Q4 unique biểu thức chỉ `purchase_invoices`, `invoices` chỉ đổi câu kiểm · W1-Q5 route IT mở lại + cờ dashboard, lượt quét thôi tự mở lại · W1-Q6 khoản 01/01 _Dùng lâu dài_ mọi năm = 12 × giá lúc duyệt · G-15 giữ 422 (+ `FAILED`, `details`).
- **Nền:** nhánh tách từ `origin/dev` mới nhất. Chỉ sửa file của gói làn mình. Được push nhánh làn; không merge, không deploy, không co-author.

## Gói

| Gói  | Mục                    | Trạng thái | sha | Lệnh kiểm + kết quả | FIX-TEST thêm | Ghi chú / chưa kiểm được |
| ---- | ---------------------- | ---------- | --- | ------------------- | ------------- | ------------------------ |
| P1   | W1-01, W1-26           | xong       | e95991a3 | `tsc` 0; `eslint` 0; `depcruise` 0; `check-rules` 0; `jest.gates` 17/17 (335); `export-openapi` +7/-6; `jest` 15/15 (242) | `offboarding-departure.integration-spec.ts` (`lockAgain`) | Đã viết 2 I-test (`offboarding-revocation-existing-task.integration-spec.ts`, `role-duties.integration-spec.ts`); chưa chạy I/H tại máy (đợi CI) |
| P7   | W1-11                  | xong       | 85bd9d72 | `tsc` 0; `eslint` 0; `depcruise` 0; `check-rules` 0; `jest.gates` 17/17 (335); `export-openapi` 0 diff; `jest` 8/8 (91) | `year-start-commitments-kept.integration-spec.ts` (`T-RQ2 (K2, no end)`) | Đã thêm I-test năm 1 & năm 2; chưa chạy I tại máy (đợi CI) |
| P8   | W1-12, W1-13           | xong       | f56ce98d | `tsc` 0; `eslint` 0; `depcruise` 0; `check-rules` 0; `jest.gates` 17/17 (335); `export-openapi` +26/-3; `jest` 18/18 (166) | `subscription-renewal-record`, `ghost-seat-escalation`, `mf5-rightsizing`, `mf5-rightsizing-edges` | Đã sửa seed + unit; đã viết I-test W1-12/W1-13 (chạy trên CI) |
| P9   | W1-14, W1-03           | chưa       |     |                     |               |                          |
| P10  | W1-19                  | chưa       |     |                     |               |                          |
| P11  | W1-18                  | xong       | 3e93089e | `tsc` 0; `eslint` 0; `depcruise` 0; `check-rules` 0; `jest.gates` 17/17 (335); `export-openapi` 0 diff; `jest` 2/2 (20) | `ghost-seat-g2-reclaim.integration-spec.ts` (`KPI-5 (DA6-39)`) | Đã cập nhật unit `ghost-seat-state.policy.spec.ts`; `ghost-seat-g2-reclaim` chạy trên CI |
| P13a | W1-20, W1-22           | xong       | 006e163c | `tsc` 0; `eslint` 0; `depcruise` 0; `check-rules` 0; `jest.gates` 17/17 (335); `export-openapi` +37/-3; `jest` 41/41 (450) | `budget-versions.integration-spec.ts` (:230-245), `mf4-budget.flow-spec.ts` (F4-01/F4-02/F4-03) | `D-1`; đã thêm I-test W1-20/W1-22 & sửa `SendingCycleLock` ở `budget-harness` (chạy trên CI) |
| P13b | W1-23                  | xong       | fd11e546 | `prettier` (`security-jobs.md`) pass; `tsc` 0; `eslint` 0; `depcruise` 0; `check-rules` 0; `jest.gates` 17/17 (335); `export-openapi` 0 diff; `jest` 22/22 (786) | `next-year-reminder.integration-spec.ts` (:76-156) | Đã thêm `next-year-reminder.service.spec.ts` & wording test; đã thêm I-test gộp (chạy trên CI) |
| P14  | W1-21                  | xong       | 5cb99605 | `tsc` 0; `eslint` 0; `depcruise` 0; `check-rules` 0; `jest.gates` 17/17 (335); `export-openapi` 0 diff; `jest` 42/42 (453) | không         | Đã thêm `crossedByBaseDrop`, `watchBase`/`settleBase`, I-test (b)/(c) + sửa `SendingCycleLock` ở `budget.builder` (chạy trên CI) |
| P15a | W1-24                  | chưa       |     |                     |               |                          |
| P15b | W1-25                  | chưa       |     |                     |               |                          |
| P17a | W1-17 (a)–(c), (f)–(h) | xong       | a85fddb2 | `tsc` 0; `eslint` 0; `depcruise` 0; `check-rules` 0; `jest.gates` 17/17 (335); `export-openapi` 0 diff; `jest` 100/100 (1354) | `department-head-loss.integration-spec.ts` (`B2A-Q2`) | `D-2`; thêm `requester-became-head.integration-spec.ts` ((a)-(c), (f)-(h)), gỡ suppression cũ của `step-reassignment.service.ts` (chạy I-test trên CI) |
| P17b | W1-17 (d), (e), (i)    | xong       | 1147140c | `tsc` 0; `eslint` 0; `depcruise` 0; `check-rules` 0; `jest.gates` 17/17 (335); `export-openapi` 0 diff; `jest` 101/101 (1359) | không         | Thêm unit `spend-routing.service.spec.ts` (ở `reassignment/`) & I-test `requester-became-head-edges.integration-spec.ts` ((d), (e), (i)) (chạy trên CI) |
| P18  | chốt đợt               | chưa       |     |                     |               |                          |

Trạng thái: `chưa` · `đang làm` · `xong` · `dừng hỏi`.

## Ánh xạ trạng thái W1-17 (điền trước P17a)

| Trạng thái trong code | Dòng SPEC W1-17 | Đường đổi |
| --------------------- | --------------- | --------- |
| `DRAFT` | N/A | Chưa gửi; khi gửi mới đi theo `routeNeedStep` |
| `PENDING` | (a) | `HEAD_PERIOD_START` / sweep quét bước `NEED` `PENDING` → `endNeedStep` (`NOT_REQUIRED`, `REQUESTER_IS_HEAD`, audit `requesterBecameHead: true`) → `SpendRoutingService.finishConversionById` |
| `WAITING_CONTROLLED` | (a′) / (f) / (e) | Nếu mở `NEED` `WAITING` (`NO_DEPARTMENT_HEAD`) → như (a); nếu mở `SPEND_APPROVAL` `WAITING` → (f) giữ nguyên; nếu mở `IT_ASSESSMENT` `WAITING` → (e) giữ nguyên |
| `AWAITING_SPEND_SUBMISSION` | (b) / (c) / (i) | Request cá nhân chưa `ONE_STEP`: `markOneStep` (`REQUESTER_IS_HEAD`), audit `ACCESS_REQUEST.STEP_NOT_REQUIRED` (`requesterBecameHead: true`) → `finishConversionById` (mở bước chi kể cả `USES_RESERVE`, bị chặn đi (d)); `GROUP_GRANT` → (i) giữ nguyên |
| `AWAITING_IT_ASSESSMENT` | (e) | Giữ nguyên bước 1.3; khi IT hoàn thành đánh giá (`enterAfterAssessment`), Request cá nhân kiểm `isRequesterHead` → chuyển `ONE_STEP` (`REQUESTER_IS_HEAD`) + `route` |
| `AWAITING_SPEND_DECISION` | (f) | Đã có bước `SPEND_APPROVAL` mở → giữ nguyên (`finishConversion` tự bỏ qua) |
| `AWAITING_REQUESTER_REVISION` | (g) / (d) | Giữ nguyên lúc đổi trưởng phòng; khi người xin gửi lại: nếu trả ở 1.3 giữ đánh giá (kết thúc sẽ đi (e)); nếu đã `ONE_STEP` đi `spending.route`; nếu còn `VIA_HEAD` cá nhân (`D-2`), `reopenNeed` kiểm lại `isRequesterHead` → chuyển `ONE_STEP` + `spending.start` |
| `AWAITING_FINANCE_REVIEW` | legacy | Trạng thái cũ đã gộp về `AWAITING_SPEND_SUBMISSION` → không đổi |
| `AWAITING_BUDGET` | legacy | Trạng thái cũ đã gộp về `AWAITING_SPEND_SUBMISSION` → không đổi |
| `AWAITING_EXECUTION` | kết thúc chi | Đã xong phê duyệt → không đổi |
| `EXECUTING` | đang cấp quyền | Đã qua phê duyệt → không đổi |
| `AWAITING_IT_CLOSE` | chờ IT đóng | Đang rút tác vụ lỗi → không đổi |
| `COMPLETED` | kết thúc | Không đổi |
| `REJECTED` | kết thúc | Không đổi |
| `IT_REJECTED` | kết thúc | Không đổi |
| `FAILED` | kết thúc | Không đổi |
| `WITHDRAWN` | kết thúc | Không đổi |
| `CANCELLED` | kết thúc | Không đổi |

*(Ghi chú: dòng (h) `RENEWAL` theo đúng ánh xạ (a)–(g) ở trên; dòng (i) `GROUP_GRANT` giữ nguyên code nghiệp vụ theo W1-Q3, P17b chỉ test lối ra rút dòng.)*

## Điểm dừng hỏi đang mở

| Gói | `file:line` | Câu hỏi | Lựa chọn / khuyến nghị |
| --- | ----------- | ------- | ---------------------- |

## CI GitHub

| Lần | Commit | Run | Kết quả từng job |
| --- | ------ | --- | ---------------- |
| 1 | `1147140c` | [#45034271771](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/45034271771) | `select` PASS; `http-contract` PASS; `e2e-smoke` PASS; `quality` FAIL (`module-graph.md` cũ); `integration(1)` 172/177 PASS (5 fail: 2 `FIX-TEST`, 2 `D-1` seed, 1 bug W1-20); `integration(2)` 171/177 PASS (6 fail: 3 `FIX-TEST`, 2 `D-1` seed, 2 bug test mới P7/P13b); `integration(3)` 171/175 PASS (4 fail: 2 `FIX-TEST`/P8-test, 2 bug test mới P17a/P17b); `integration-inband` 12/13 PASS (1 `D-1` seed) |

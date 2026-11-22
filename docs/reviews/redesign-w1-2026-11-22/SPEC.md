# SPEC — Đợt 1 thiết kế lại: lỗi ưu tiên cao, transaction, code trái luật đã chốt (22/11/2026)

- **Trạng thái:** Proposed, bản sửa 2 (22/11) theo `REVIEW-FABLE.md` và quyết định Owner W1-Q1 → W1-Q6 ([mục 9](#9-đã-chốt)). Owner chưa duyệt bản sửa; Sonnet chỉ bắt đầu code sau khi Owner duyệt.
- **Nền:** BE `dev` = `origin/dev` `0216cb76`. Docs: sổ QĐ `Docs/Decisions/project-decisions.md` đến `QĐ-117n`; quyết định riêng của SPEC này ở cuối `Docs/Research-AI/redesign-2026-11-21/DECISIONS.md`, mục _SPEC đợt 1 — câu hỏi Owner 22/11_ (W1-Q1 → W1-Q6).
- **Nguồn:** thư mục `Docs/Research-AI/redesign-2026-11-21/`:
  - `HANDOFF-CHAT.md` §3 mục 2.1;
  - `O3-transaction-audit.md` mục 2–4;
  - `OLD-QD-A-prompt3.md`, `OLD-QD-B-p1-p2-p5-khac.md`;
  - `AUDIT-A/B/C-*.md` mục "Trạng thái code";
  - `Q117-A-fable-tien.md`, `Q117-B-fable-quyen-kpi.md`;
  - `O2-mail-redis-bullmq.md` M1;
  - `DECISIONS.md` (O3, O3-Q1…Q3, B-Q9, P-2, Gộp P1/P2/P5, Gộp Prompt 3, `QĐ-117`, _SPEC đợt 1_);
  - phản biện `REVIEW-FABLE.md` cùng thư mục với SPEC này.
- **Cách kiểm:** tác giả spec (Opus) mở code của từng mục, chỉ đọc, không chạy test/build/DB. Mọi `file:line` dưới đây mở lại trên `0216cb76` ở bản sửa 2. Đường dẫn tính từ `src/modules/` nếu không ghi khác.

## 1. Mục tiêu

Sửa trên **một nhánh** những chỗ code đang sai, để đợt 2–7 xây lên một nền đúng:

1. **Lỗi ưu tiên cao H-6.** Thu hồi nghỉ việc bỏ sót seat đang có tác vụ thu hồi từ nguồn khác, nên checklist `K1` không khóa hộp thư.
2. **Sáu lỗi transaction mức Trung bình (O3 M1–M6)** và **một thứ tự khóa chuẩn** dùng chung cho cả đợt thiết kế lại.
3. **Code trái luật đã chốt:** những mục Owner đã duyệt "sửa code", thuộc loại lỗi hoặc trái luật nhỏ, không phải tính năng mới.

**Thành công** khi đủ ba điều:

- mỗi mục W1-xx có test chứng minh hành vi mới (unit viết đỏ trước; http/integration chạy trên CI);
- bộ kiểm nhanh xanh ở mỗi gói;
- CI GitHub full xanh, trừ các test cũ ghi trong `FIX-TEST.md`, sửa một lần ở cuối.

## 2. Phạm vi

### 2.1. Trong phạm vi

27 mục W1-01 → W1-27 ở [mục 3](#3-bảng-mục). Mọi câu hỏi Owner đã chốt ([mục 9](#9-đã-chốt)).

### 2.2. Ngoài phạm vi

| Việc                                                                                                                          | Lý do / đợt nhận                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sổ máy, mã tài sản, khóa theo máy (W2c)                                                                                       | Đợt 2                                                                                                                                                                                                                                                                                              |
| Kho B1–B3: giá seat-tháng, dòng kho 4 dòng con, sổ số seat, `K1` không thuê bao / `K1` năm, lô khóa `K4`, Workspace           | Đợt 3. Các chỗ đợt 1 chạm vào vùng này đều ghi "sửa tối thiểu, đợt Bx thay"                                                                                                                                                                                                                        |
| `QĐ-116ac`: tự giải phóng phần cam kết của tháng vượt seat-ngày                                                               | B1 (A-Q1)                                                                                                                                                                                                                                                                                          |
| Thông báo khi giảm số seat (ghi chú B1 của W1c)                                                                               | B1                                                                                                                                                                                                                                                                                                 |
| C-3: bản đánh giá case B có _có trang quản trị_ gắn vào gói `K4` không mang cờ đó ⟹ 422 (`QĐ-114ae`)                          | B2 (cùng việc chuyển danh sách admin sang Workspace)                                                                                                                                                                                                                                               |
| Phiếu nhiều mục; ghi chú bắt buộc khi gửi lại (FIX-PL2-Q3, `QĐ-114q`, P-1)                                                    | Đợt 4                                                                                                                                                                                                                                                                                              |
| AI W4c, Redis/BullMQ                                                                                                          | Đợt 5                                                                                                                                                                                                                                                                                              |
| Tách API V5                                                                                                                   | Đợt 6. Gồm: `expectedUpdatedAt` bắt buộc ở route mới (O3-Q1; riêng ô `purchasedQuantity` của route cũ đã kéo vào W1-03 theo W1-Q2); `K1` trùng email người khác ⟹ 422 (B2C-O1, `QĐ-114x`); hàng cấp `scope=all` + cờ _làm thay ngoài phạm vi_ (`QĐ-114s`); `KPI-5` chuyển sang màn Super Admin; O1 |
| `KPI-2` lấy trung vị, tách thời gian đứng chờ, loại Request tiếp tục (`QĐ-116ba`; AUDIT-B #18). Đợt 1 chỉ sửa `KPI-5` (W1-18) | **Đề xuất** đợt 6 (cùng màn KPI của Super Admin); chờ Owner xác nhận                                                                                                                                                                                                                               |
| B1A-05 · B-N2: hai mã, hai status cho một luật ⟹ đồng bộ 422 (OLD-QD-A 3.4)                                                   | **Đề xuất** Prompt 4b (kỹ thuật, không đổi luật); chờ Owner xác nhận                                                                                                                                                                                                                               |
| D-35: phân loại lỗi `OVERLAP` trên đường lỗi thay vì dựa thứ tự tạo ràng buộc (OLD-QD-B dòng 88)                              | Prompt 4b. W1-24 trả 422 ngay ở đường cấp lại (trước khi ghi), nên không phụ thuộc cách phân loại lỗi của DB                                                                                                                                                                                       |
| Tách dòng Request nhóm của người vừa thành trưởng phòng (`QĐ-116c`)                                                           | Đợt 7 (W1-Q3). Đợt 1 chỉ thêm test lối ra ở W1-17                                                                                                                                                                                                                                                  |
| Luồng phụ: 42 mục AUDIT-C §5, trừ các mục đã kéo vào đây: 11, 14, 24, 27, 31 (vế đầu), 38 (hai vế cuối)                       | Đợt 7. Gồm cả K-2 _lần xếp phòng sắp tới_                                                                                                                                                                                                                                                          |
| AUDIT-C #31 vế hai: route trả đề nghị không còn trong tài liệu (`MF-4`)                                                       | Đợt 7 (luồng phụ)                                                                                                                                                                                                                                                                                  |
| AUDIT-C #31 vế ba: số liệu nền chưa tách ba dòng con kho                                                                      | Đợt 3 (B1)                                                                                                                                                                                                                                                                                         |
| O3 mức Thấp T2, T4, T5, T7, T8, T10, T11; đặt `max` của pool qua env; gate cấm `this.prisma` dưới `tx`                        | Prompt 4b. Không đổi luật; T11 `retryTransient` nên làm trước đợt 4                                                                                                                                                                                                                                |
| P5-8b, P5-11                                                                                                                  | OLD-QD-B đã giao cho Prompt 4b                                                                                                                                                                                                                                                                     |
| M9 (b) nhập lô `K4` coi như khai; M9 (c) cảnh báo khi admin đổi vai hoặc bị khóa                                              | B3 / B2. Lô khóa và IT phụ trách workspace chưa có                                                                                                                                                                                                                                                 |

## 3. Bảng mục

Cột **Kiểm** dùng các ký hiệu: **U** = unit (chạy ở máy, viết đỏ trước); **H** = http-spec; **I** = integration (hai loại sau viết mới, chạy trên CI). Cỡ: **S** / **M** / **L** tương đối, không ước giờ.

### 3.1. Lỗi ưu tiên cao

**W1-01 — H-6: seat đã có tác vụ thu hồi vẫn nhận lý do nghỉ việc.** Trạng thái: còn lỗi. Cỡ S.

- **Nguồn:** `QĐ-114aj` (làm rõ `QĐ-64a`, `QĐ-111az`); OLD-QD-B H-6; AUDIT-C §4.1.
- **Code hiện tại:**
  - `personnel/offboarding/offboarding.policy.ts:336`: `if (!right \|\| right.hasTask)` ⟹ `ASSIGNMENT_NOT_AVAILABLE`.
  - `:358`: lọc `!right.hasTask`.
  - `hasTask` đến từ `offboarding-revocation.service.ts:62`.
  - Vòng lặp mở thu hồi: `offboarding-revocation.service.ts:82` (`for (const assignmentId of selected)`), `selected` đang sắp theo `assignmentId`.
  - Cổng licensing đã biết cộng lý do vào tác vụ đang sống: `licensing/provisioning/revocation.service.ts:59-63,92`.
  - Biến thể checklist `K1` suy từ mọi lý do: `k1-checklist/provisioning-k1-checklist.policy.ts:98`.
  - `NOTHING_TO_REVOKE` = 409 (`offboarding.http-errors.ts:31`); câu của `ASSIGNMENT_NOT_AVAILABLE` ở `offboarding.http-errors.ts:68` và mô tả 422 ở `offboarding-steps.controller.ts:114` còn nói "already has a revocation under way / has a task".
- **Hành vi đúng:**
  - Seat đang có tác vụ thu hồi sống (`QUEUED`, `IN_PROGRESS`, `FAILED`) từ nguồn khác vẫn được chọn, khi gọi tên lẫn khi không gọi tên.
  - Cổng `openRevocation` cộng lý do `DEPARTURE`/`ABRUPT_DEPARTURE` vào tác vụ đó. Không tạo tác vụ thứ hai.
  - Seat không có thu hồi (`K3`, `K4`) vẫn bị từ chối như cũ.
  - Gọi lại khi mọi seat đã mang lý do của hồ sơ này ⟹ `NOTHING_TO_REVOKE`, rollback cả lệnh.
  - Vòng lặp nhiều seat sắp theo (`subscriptionId`, `assignmentId`) (luật vòng lặp nhiều seat, [mục 4](#4-thứ-tự-khóa-chuẩn-một-bảng-dùng-chung-mọi-đợt)).
  - **API: schema không đổi, hành vi đổi.** Seat đang có tác vụ thu hồi nay chọn được; `ASSIGNMENT_NOT_AVAILABLE` không còn trả cho ca đó. FE bỏ khóa ô chọn của seat đang có tác vụ. Sửa câu lỗi và mô tả 422 theo đó.
- **Tiêu chí chấp nhận:**
  - (a) Policy: `named` chứa seat `hasTask` ⟹ không refusal, seat có trong `selected`.
  - (b) `named` undefined ⟹ `selected` gồm cả seat `hasTask`.
  - (c) I: seat `K1` có tác vụ `RETURN` đang `QUEUED`; mở thu hồi nghỉ việc ⟹ `reasonAdded=1`, `created=0`; checklist của tác vụ ra biến thể `DEPARTURE` (có `MAILBOX_LOCKED` khi là `K1` cuối).
  - (d) Gọi lần hai ⟹ 409 `NOTHING_TO_REVOKE`.
  - (e) U: `selected` ra theo thứ tự (`subscriptionId`, `assignmentId`).
- **Kiểm:** U `offboarding.policy.spec.ts`; I mới cạnh `test/integration/personnel/offboarding-departure.integration-spec.ts`.
- **API / migration:** hành vi đổi (xem trên); không migration.

### 3.2. Transaction (O3) và thứ tự khóa

**W1-02 — O3 M1: đọc qua pool trong callback `runner.run`.** Trạng thái: còn lỗi. Cỡ M.

- **Nguồn:** O3 M1; DECISIONS O3.
- **Code hiện tại:**
  - `requests/access-request/request-facts.service.ts:177,301-302`: `heldAccess` gọi `licensing.getSeatsHeldInPlans` không có `tx`.
  - `licensing/assignment/assignment.service.ts:132-143`: `businessToday()` đọc qua pool.
  - `licensing/assignment/assignment.repo.ts:404`: mở `this.prisma.$transaction` thứ hai.
  - `requests/withdraw/withdrawal-preconditions.service.ts:45`: `getHeadedDepartment` không có `tx`.
  - `requests/group-request/group-withdrawal.service.ts:60,104,141` gọi `heads()` (`:149-150`) → `getHeadedDepartment` không có `tx`.
  - `requests/purchase-invoice/purchase-invoice-submission.service.ts:53`: `resubmittedAs` (`purchase-invoice.repo.ts:375`) không có `tx`.
  - Facade **không có tham số `tx`**: `organization/public/organization-read.api.ts:72` `getHeadedDepartment(employeeId, onDate?)`; repo `organization/department/department-head.repo.ts:265` đọc bằng `this.prisma`.
  - Điểm gọi còn sót (đã mở, cả ba nằm trong `tx`):
    - `requests/group-line-decisions/group-need-preconditions.service.ts:87` (`getSeatsHeldInPlans`);
    - `requests/group-request-submission/group-submission-facts.service.ts:226` (`getSeatsHeldInPlans`, gọi từ `judge(tx, …)`);
    - `optimization/decision/decision.service.ts:92` (`getHeadedDepartment` trong `decideIn`, ngoài `requests/`).
  - Đã mở và **không** sửa: `requests/need-decision/similar-seats.service.ts:53` là route GET, không chạy trong `runner.run`.
- **Hành vi đúng:** mọi lần đọc trong callback của `runner.run` đi qua `tx` đang mở. Không mở connection hay transaction thứ hai.
- **Tiêu chí chấp nhận:**
  - (a) Facade `getSeatsHeldInPlans`/`pageHeldOfPlans` nhận `tx?`. Khi có `tx`, đọc tuần tự trên `tx` (không `$transaction` lồng, `businessToday(…, tx)`); không có `tx` thì giữ đường RepeatableRead cũ.
  - (b) `OrganizationReadApi.getHeadedDepartment(employeeId, onDate?, tx?)` và repo `headedDepartment` nhận client; mọi điểm gọi trong `tx` truyền `tx`.
  - (c) Các điểm gọi liệt kê ở trên truyền `tx`. Sonnet grep thêm trong `src/modules/**` (không chỉ `requests/`) các lệnh gọi facade đọc (`organizationReads.*`, `licensing.*`, `budgets.*`) nằm trong callback `runner.run` mà thiếu `tx`, rồi sửa luôn. Danh sách ghi vào commit message.
  - (d) U: spec của từng service đã sửa khẳng định facade được gọi với **đúng `tx` đang mở** (mock); spec repo khẳng định nhánh có `tx` không gọi `this.prisma.$transaction`. (Bỏ tiêu chí pool `max=2`: pool chưa có cấu hình `max`, đặt `max` qua env thuộc Prompt 4b.)
- **Kiểm:** U như (d).
- **API / migration:** không.

**W1-03 — O3 M2: lost update `purchasedQuantity`.** Trạng thái: còn lỗi. Cỡ S. Đã chốt W1-Q2.

- **Nguồn:** O3 M2; O3-Q1 (route cũ giữ `expectedUpdatedAt` tùy chọn) — **sửa riêng cho ô này** bởi W1-Q2.
- **Code hiện tại:**
  - `catalog/subscription/subscription.dto.ts:74`: `expectedUpdatedAt … .optional()`, mô tả nói "leave it out to change without the check".
  - `subscription.policy.ts:297-298`: `isStaleEdit` trả `false` khi thiếu.
  - `addSeat` tự +1 khi cấp (`pool/subscription-pool.service.ts:226-227`).
- **Hành vi đúng:**
  - Body có `purchasedQuantity` mà thiếu `expectedUpdatedAt` ⟹ 422 `SUBSCRIPTION.VERSION_REQUIRED`, không ghi gì.
  - Có mà lệch `updated_at` đang lưu ⟹ 409 `SUBSCRIPTION.STALE` (giữ).
  - Body không có `purchasedQuantity` ⟹ vẫn được thiếu `expectedUpdatedAt`.
  - **Tầng đặt luật:** hàm thuần trong `subscription.policy.ts`, gọi ở `subscription-change.service.ts` trước khi khóa; lỗi nghiệp vụ trong `subscription.errors.ts`, ánh xạ ở `subscription.http-errors.ts`. Không dùng `refine` của DTO (refine chỉ ra `VALIDATION_ERROR`). Điều kiện chéo field ghi bằng `description` của field theo `docs/rules/api-contract.md` (F01).
- **Tiêu chí chấp nhận:**
  - (a) U policy: có `purchasedQuantity`, thiếu version ⟹ từ chối; không có `purchasedQuantity` ⟹ cho qua.
  - (b) H: thiếu trường ⟹ 422 `SUBSCRIPTION.VERSION_REQUIRED`.
  - (c) I: `addSeat` rồi PATCH với version cũ ⟹ 409 `SUBSCRIPTION.STALE`.
- **Kiểm:** U policy; H/I `subscription` PATCH.
- **API / migration:** có: đổi contract FE (mã 422 mới, mô tả field đổi). Seed PATCH bản nháp (`src/cli/seed/steps/catalog.steps.ts:340`, body có `purchasedQuantity` từ `:264`) phải gửi `expectedUpdatedAt`.

**W1-04 — O3 M3: khóa ngược subscription ↔ plan khi đặt primary.** Trạng thái: còn lỗi. Cỡ S.

- **Nguồn:** O3 M3; thứ tự khóa chuẩn (mục 4).
- **Code hiện tại:**
  - `catalog/subscription/subscription-change.service.ts:97-101`: `lockFresh` khóa subscription (`:146`) rồi **plan FU** khi `isPrimaryForPlan`.
  - Sau đó `pool/subscription-pool.service.ts:263` (`clearPrimaryOfPlan`) UPDATE subscription khác.
  - `complete` (`subscription.service.ts:244-258`): khóa chính nó, plan FU (`:248`), rồi `takePrimaryFromPrevious` UPDATE kỳ trước.
  - `create` **không** cần sửa: thuê bao mới luôn `isPrimaryForPlan: false` (`subscription.policy.ts:292`), `create` không UPDATE thuê bao khác.
- **Hành vi đúng:** nhánh đặt primary của `changeIn` và `complete` lấy **một câu** `SELECT … ORDER BY id FOR UPDATE` khóa cả tập làm **khóa đầu tiên** của tx:
  - mọi subscription đang `is_primary_for_plan` của plan;
  - chính nó;
  - kỳ trước (`renewedFromId`) nếu có.
    Plan id đọc trước bằng một lần đọc không khóa. Sau câu khóa mới so `expectedUpdatedAt`, rồi mới khóa plan. Không UPDATE subscription nào sau khi đã giữ plan mà chưa khóa nó từ trước. Nhánh không đổi primary giữ như cũ.
- **Tiêu chí chấp nhận:**
  - (a) Thêm repo `lockPrimaryCandidates(tx, planId, extraIds)`. Gọi ở `changeIn` (nhánh `isPrimaryForPlan`) và `complete`.
  - (b) I: hai connection lặp N lần (cấp seat trên S primary ‖ PATCH đặt P primary) ⟹ 0 lỗi `40P01`.
- **Kiểm:** I mới `test/integration/catalog/subscription-primary-lock-order.integration-spec.ts`.
- **API / migration:** không. Lưu ý trần 500 dòng: `subscription.repo.ts` đã 580 dòng thô (PLAN).

**W1-05 — O3 M4: seat-tháng đọc danh sách seat ngoài tx.** Trạng thái: còn lỗi. Cỡ M.

- **Nguồn:** O3 M4.
- **Code hiện tại:**
  - `budgets/seat-month/seat-month.service.ts:67-76`: `getSeatsOfMonth(month)` (`:68`) đọc một lần cho cả lượt, không có tx; lọc `marked` cũng trước vòng lặp (`:85-87`).
  - `seat-month-subscription.service.ts:68-111`: `lockMonthOf` (`:68`) rồi thay toàn bộ dòng theo snapshot đó.
- **Hành vi đúng:**
  - Danh sách seat của **một** thuê bao được đọc **trong** tx của thuê bao đó, **sau** `lockMonthOf`.
  - Ở chế độ sweeper (`onlyMissing`), dấu `markCharged` được kiểm lại sau khóa; đã có thì bỏ qua, không ghi đè.
  - Danh sách id thuê bao vẫn được đọc ngoài tx (chỉ để biết đi qua những thuê bao nào).
- **Tiêu chí chấp nhận:**
  - (a) Facade licensing `getSeatsOfMonth(month, tx?, subscriptionId?)`, hoặc một hàm mới theo thuê bao.
  - (b) `SeatMonthSubscriptionService.charge` tự đọc seat và nhận cờ `onlyMissing`.
  - (c) I có barrier: lượt sweeper A dừng **trước** `lockMonthOf`; B `chargeMonth` (sau khi thu hồi) chốt xong; A chạy tiếp ⟹ A bỏ qua vì đã có dấu, dòng vẫn theo B.
- **Kiểm:** U `seat-month.service.spec.ts` (mock thứ tự gọi); I mới `test/integration/budgets/seat-month-stale-snapshot.integration-spec.ts`.
- **API / migration:** không. _Sửa tối thiểu; B1 viết lại công thức kho nhưng giữ mẫu khóa này._

**W1-06 — O3 M5: seat-tháng khóa commitment rồi mới lấy CC-year.** Trạng thái: còn lỗi. Cỡ S.

- **Nguồn:** O3 M5; luật ở `budgets/budget/budget-year-lock.repo.ts:10-11`.
- **Code hiện tại:** `seat-month-subscription.service.ts`:
  - `:73` `lockCommitments` (kể cả dòng `YEAR_START` chưa gắn version);
  - `:103` mới `thresholds.watch` (CC-year).
  - Quyết phiên bản làm ngược lại: CC-year → UPDATE commitment chờ.
- **Hành vi đúng:** giống hóa đơn (FIX-RV23 RV2-03). Cặp (CC, năm) nào mà tx đã khóa ít nhất một commitment có `attachedVersionId = null` thì **không** đưa vào `watch`: không lấy CC-year, không canh ngưỡng. CC chưa có ngân sách thì không có ngưỡng nên không mất cảnh báo nào.
- **Tiêu chí chấp nhận:**
  - (a) `costCentersOf(…)` loại các cặp đó.
  - (b) I: hai tx có barrier (seat-tháng của CC có commitment chờ ‖ duyệt phiên bản của CC đó) ⟹ không `40P01`.
- **Kiểm:** I mới cùng file với W1-05.
- **API / migration:** không.

**W1-07 — O3 M6: `ProfilePurgeSweeper` gọi S3 trong tx.** Trạng thái: còn lỗi. Cỡ S.

- **Nguồn:** O3 M6; luật `infrastructure/database/transaction-runner.ts:91`.
- **Code hiện tại:** `identity-access/profile/profile-purge.service.ts:23-33`: `claimPurges` FOR UPDATE SKIP LOCKED, `storage.delete`, rồi `markPurged`, tất cả 50 dòng trong **một** `runner.run`.
- **Hành vi đúng:**
  - Đọc lô dòng chưa xóa **không khóa** (pool).
  - Xóa object **ngoài tx**; xóa lặp lại được nên hai instance không hại gì.
  - Mỗi dòng xóa xong thì `markPurged` trong tx ngắn riêng, dùng `updateMany where id and purged_at IS NULL`.
  - Object lỗi: ghi log một dòng bằng `describeForOperator` rồi đi tiếp. Trả số dòng đã đánh dấu.
- **Tiêu chí chấp nhận:** U với fake storage ném lỗi ở dòng 2 và chậm ⟹ dòng 1 và 3 được đánh dấu, dòng 2 không.
- **Kiểm:** U mới `profile-purge.service.spec.ts`.
- **API / migration:** không.

**W1-08 — O3 T1: cấp seat khóa request trước employee.** Trạng thái: còn lỗi. Cỡ S.

- **Nguồn:** O3 T1, mục 3; thứ tự khóa chuẩn.
- **Code hiện tại:**
  - `licensing/provisioning/tasks/provisioning-grant-writer.service.ts:58`: `claimForGrant` (request FU).
  - `provisioning-holder.service.ts:80`: `lockEmployeeForShare` chạy sau.
  - Mốc chặn làm ngược lại: employee FU → request (`personnel/departure-deadline/block-announcement.service.ts:72`).
- **Hành vi đúng:** với seat cá nhân, `lockEmployeeForShare(beneficiary)` chạy **trước** `claimForGrant`. Lần gọi sau trong holder vẫn giữ, không hại vì cùng tx. Thứ tự đầy đủ của đường cấp sau W1-08 + W1-24: employee FS → tác vụ thu hồi của quyền bị thay (nếu có) → request (`claimForGrant`) → subscription → plan → assignment.
- **Tiêu chí chấp nhận:** I: hai connection có barrier (cấp ‖ mốc chặn của cùng người) ⟹ không `40P01`.
- **Kiểm:** I mới `test/integration/licensing/grant-block-lock-order.integration-spec.ts`.
- **API / migration:** không.

**W1-09 — O3 T3: duyệt `G2` theo lô khóa subscription theo thứ tự id khuyến nghị.** Trạng thái: còn lỗi. Cỡ S.

- **Nguồn:** O3 T3; thứ tự khóa chuẩn.
- **Code hiện tại:** `optimization/decision/decision.service.ts:91` `lockMany(tx, ids)` khóa khuyến nghị; `:93` `found` theo thứ tự `ids` client gửi; `:108-119` lặp `found` và `applyOne` → `openRevocation` khóa tác vụ, subscription, assignment theo thứ tự đó. (`reclaims.openSeatsOf` ở `:95` chỉ đọc, không khóa.)
- **Hành vi đúng:**
  - Trước vòng `applyOne`, sắp **thứ tự xử lý** theo (`subscriptionId`, `assignmentId`) của seat.
  - **Giữ thứ tự `outcomes` trả về theo `ids` đầu vào**; chỉ đổi thứ tự xử lý.
- **Tiêu chí chấp nhận:**
  - (a) I: hai `decide()` chéo nhau [S1,S2] và [S2,S1] ⟹ không `40P01`.
  - (b) U/I: `outcomes` cùng thứ tự `ids` đã gửi.
- **Kiểm:** I `test/integration/optimization/ghost-seat-g2-reclaim.integration-spec.ts` (thêm ca).
- **API / migration:** không.

**W1-10 — Ghi thứ tự khóa chuẩn vào rule.** Trạng thái: chưa có. Cỡ S. Đã chốt W1-Q1.

- **Nguồn:** DECISIONS O3 "thứ tự khóa chuẩn" (sửa chữ theo W1-Q1); O3 §3.
- **Code hiện tại:** `docs/rules/database-business.md` §_Transaction và hành vi_ chỉ có luật chung. `ARCHITECTURE.md` §Dữ liệu ghi "ghi trong comment đầu service".
- **Hành vi đúng:** đưa **bảng mục 4** (một bảng duy nhất, kể cả luật vòng lặp nhiều seat và ngoại lệ E1–E3) vào `docs/rules/database-business.md`, ghi rõ thứ tự chuẩn là **tác vụ → Request** (W1-Q1). Comment đầu các service bị sửa ở W1-01/04/05/06/08/09/24/25 dẫn tới bảng đó.
- **Tiêu chí chấp nhận:** `pnpm rules:check`, `pnpm rules:format` xanh.
- **Kiểm:** docs.
- **API / migration:** không.

**W1-16 — O3 T6 / O3-Q3: lô duyệt chi trả `RETRYABLE` và idempotent.** Trạng thái: còn lỗi. Cỡ M.

- **Nguồn:** O3-Q3; AUDIT-B #11; `QĐ-114b`.
- **Code hiện tại:** `requests/spend-approval/spend-batch-decision.service.ts:91,103`: lỗi lạ (kể cả `TransientDatabaseError`) bị `throw` nên dừng cả lô; mục đã commit, khi gửi lại, trả `SKIPPED NO_SPEND_STEP` (`:91`). Nhánh `returnGroup` (`:108-123`) cũng `throw` lỗi lạ (`:121`). Enum ở `spend-approval-view/spend-approval.dto.ts:247`.
- **Hành vi đúng:**
  - `TransientDatabaseError` của một mục (cả nhánh `returnGroup`) ⟹ mục đó `outcome: 'RETRYABLE'` (reason `TRANSIENT_FAILURE`); các mục sau vẫn chạy.
  - Gửi lại cùng lô: mục mà **bước chi gần nhất** của Request đã được **chính người này** quyết với cùng quyết định ⟹ trả đúng `outcome` đã ghi kèm reason `ALREADY_DECIDED`, không ghi gì thêm. Quyết định khác ⟹ giữ `SKIPPED`.
  - Lỗi lạ khác vẫn 500.
- **Tiêu chí chấp nhận:**
  - (a) U: mock ném `TransientDatabaseError` ở mục 2 ⟹ `[APPROVED, RETRYABLE, APPROVED]`; ở nhánh `returnGroup` ⟹ `RETRYABLE`.
  - (b) U/I: gửi lại sau khi mục 1 đã duyệt ⟹ mục 1 `APPROVED`/`ALREADY_DECIDED`.
- **Kiểm:** U `spend-batch-decision.service.spec.ts`; H manifest ví dụ.
- **API / migration:** có: thêm giá trị enum `outcome`, `reason` (FE thêm một trạng thái). Không migration.

### 3.3. Code trái luật đã chốt

**W1-11 — Khoản cam kết 01/01 của quyền _Dùng lâu dài_ lấy giá lúc duyệt, mọi năm.** Trạng thái: còn lỗi. Cỡ M. Đã chốt W1-Q6.

- **Nguồn:** `QĐ-114w` (FX1-O4 = A), `QĐ-111k`, `QĐ-117h` ("số năm sau **luôn 12 × giá tháng lúc duyệt**"); Q117-A dòng 155; AUDIT-A A-8; W1-Q6.
- **Code hiện tại:**
  - `requests/year-start-commitments/year-start-commitments-batch.service.ts:367-380` (`pricesOf` lấy giá 01/01).
  - `year-start-commitments.policy.ts:90-91` (`keptAmountOf` trả `null` khi `!termLimited`); `:129` cộng số lưu; `:164` `seatMonthlyMinor` = giá tháng 01/01.
  - Số lưu chỉ được đọc khi `budgetYear === year - 1`: `…-batch.service.ts:273` (danh sách bỏ qua vì khác VND) và `:289` (`keptOf`). Quyền _Dùng lâu dài_ duyệt 2026: 01/01/2027 có số lưu, 01/01/2028 thì không.
  - Giá lúc duyệt không được truyền: `approvalPrice: null` ở `…-batch.service.ts:320,362`.
  - Số lưu của quyền không ngày kết thúc luôn là 12 tháng: `access-request/pricing.policy.ts:172-173`.
- **Hành vi đúng:**
  - Quyền không ngày kết thúc **có số năm sau đã lưu lúc duyệt** (`savedMinor` = `nextYearAmountMinor`, bằng 12 × giá tháng lúc duyệt, R-46) ⟹ khoản 01/01 = đúng số đó, **ở mọi năm** sau năm duyệt: bỏ điều kiện `budgetYear === year - 1` cho quyền không ngày kết thúc (giữ điều kiện cho quyền có thời hạn). Ví dụ: duyệt 2026 giá 100.000 đ/tháng; 01/01/2027 và 01/01/2028 đều giữ 1.200.000 đ, kể cả khi giá 2028 là 120.000 đ (phần chênh hiện ở thực chi).
  - **Giá tháng lúc duyệt** = `savedMinor ÷ 12` (chia trần như `pricing.policy.ts`), không đọc thêm bảng nào; truyền vào `approvalPrice` thay `null` cho seat có số lưu.
  - Seat đóng sớm trong năm mới thì tính số tháng tới ngày đóng theo giá lúc duyệt, không vượt `savedMinor` (như nhánh có thời hạn).
  - `seatMonthlyMinor` của khoản = giá tháng lúc duyệt, để seat-tháng và trả lại khớp đúng số đã giữ.
  - Không có số đã lưu (bản cũ, hoặc tiền khác VND) ⟹ giữ đường cũ (giá 01/01 + audit `…SAVED_AMOUNT_IGNORED`).
  - Số chạy sang năm sau (`year-start-carried-over.service.ts`) dùng cùng hàm nên đổi theo.
- **Tiêu chí chấp nhận:**
  - (a) U: Request _Dùng lâu dài_ duyệt với giá tháng 100.000 đ, giá 01/01 là 120.000 đ ⟹ khoản 1.200.000 đ, `seatMonthlyMinor` 100.000 đ.
  - (b) U: cùng Request ở lượt 01/01 **năm thứ hai** sau năm duyệt ⟹ vẫn 1.200.000 đ.
  - (c) Không có số lưu ⟹ 1.440.000 đ + audit.
  - (d) Đóng 31/03 ⟹ 300.000 đ (giá lúc duyệt × 3).
- **Kiểm:** U `year-start-commitments.policy.spec.ts` (sửa ca cũ đang khẳng định giá 01/01); I `test/integration/requests/year-start-commitments*.integration-spec.ts` ghi FIX-TEST nếu lệch.
- **API / migration:** không (schema giữ, **số đổi** ở màn ngân sách).

**W1-12 — Ghi kết quả gia hạn chỉ IT Admin phụ trách thuê bao.** Trạng thái: còn lỗi. Cỡ S.

- **Nguồn:** `QĐ-114af` (H-2 = B), `QĐ-113g`; AUDIT-A §6; AUDIT-C #38.
- **Code hiện tại:**
  - `licensing/subscription-renewal/record/renewal-record.policy.ts:70` ghi "Anybody who is an IT Admin records".
  - `renewal-record.service.ts:90` chỉ dùng `substituteOf` cho audit.
  - Legacy outcome `outcome/renewal-outcome.service.ts` cũng không kiểm.
- **Hành vi đúng:** `POST /subscription-renewals` và `POST /subscription-renewals/:id/outcome` chỉ nhận người gọi khi thỏa một trong hai:
  - người gọi là IT Admin phụ trách thuê bao;
  - người phụ trách là `null` hoặc _không dùng được_, tức không còn là IT Admin dùng được (`findUsableItAdminEmployeeIds`: nghỉ, bị khóa).
    Ngược lại ⟹ 403 `SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE` (namespace của `RenewalError`). Cờ audit _thay người phụ trách_ giữ cho ca được phép.
- **Tiêu chí chấp nhận:**
  - (a) I: IT B ghi thuê bao của IT A đang làm việc ⟹ 403.
  - (b) A bị khóa ⟹ B ghi được, audit `substitute=true`.
  - (c) A ghi ⟹ 200.
- **Kiểm:** U policy mới; I `test/integration/licensing/subscription-renewal-record.integration-spec.ts`, `…-legacy-outcome…`.
- **API / migration:** có: 403 mới + example. Seed ghi kết quả gia hạn qua API bằng người của fixture (`src/cli/seed/steps/renewals.steps.ts:55,67-72`, `spec.by`): phải là IT phụ trách thuê bao. _Sửa tối thiểu; B3 ghi kết quả theo dòng, giữ luật này._

**W1-13 — Đẩy sớm tầng _Theo dõi_ chỉ IT phụ trách phòng của người giữ seat.** Trạng thái: còn lỗi. Cỡ S.

- **Nguồn:** `QĐ-116i` (B-Q9), `QĐ-114s`; AUDIT-B #17.
- **Code hiện tại:**
  - `optimization/escalation/escalation.service.ts:95-105`: mọi IT đẩy được, `isInCharge` (`escalation-facts.service.ts:75-77`) chỉ ghi cờ `byInCharge` (`:104`).
  - Enum `ESCALATION_SKIP_REASONS` ở `escalation.types.ts:4-12`.
- **Hành vi đúng:** mục được đẩy khi thỏa một trong ba:
  - người gọi là IT phụ trách phòng;
  - phòng chưa có IT phụ trách (`QĐ-111ax`);
  - IT phụ trách không còn dùng được (`findUsableItAdminEmployeeIds`, như W1-12).
    Ngược lại mục ⟹ `SKIPPED` reason mới `NOT_IN_CHARGE`. Lô không bị từ chối cả lô.
- **Ghi chú:** W1-12/W1-13 dùng `findUsableItAdminEmployeeIds`; W1-19 dùng `PlanFactsService.workingAdminsAmong`, vốn loại thêm người đã tới mốc chặn nghỉ việc. Đợt 1 giữ hai nghĩa như code hiện có, không gộp.
- **Tiêu chí chấp nhận:** I: IT B đẩy seat của phòng do IT A (đang làm việc) phụ trách ⟹ `SKIPPED/NOT_IN_CHARGE`; A bị khóa ⟹ `ESCALATED`.
- **Kiểm:** U `escalation.policy.spec.ts` (nếu đưa luật vào policy); I `ghost-seat-escalation.integration-spec.ts`.
- **API / migration:** có: thêm giá trị enum `reason`.

**W1-14 — `PATCH /subscriptions/:id`: chặn giảm `purchasedQuantity`, bắt lý do khi tăng.** Trạng thái: còn lỗi. Cỡ M.

- **Nguồn:** `QĐ-115f` (chuyển tiếp trước sổ), W1c `KHO-27`, `QĐ-115i`; AUDIT-A §6.
- **Code hiện tại:**
  - `catalog/subscription/subscription-change-guard.service.ts:45-55`: chỉ chặn dưới số đang chiếm.
  - DTO `subscription.dto.ts:55-78` không có ô lý do.
  - `allowsMidTermReduction` được lưu nhưng không ai đọc khi PATCH.
- **Hành vi đúng:** khi `current.status = 'ACTIVE'`, gói `K2`, có `purchasedQuantity` khác số đang lưu:
  - **Giảm** mà `commitmentTermMonths` (giá trị **đang lưu**) = 12 và `allowsMidTermReduction` (giá trị **đang lưu**) = false ⟹ 409 `SUBSCRIPTION.MID_TERM_REDUCTION_NOT_ALLOWED`. Hai cờ luôn lấy giá trị đang lưu, không lấy giá trị gửi cùng PATCH: PATCH đổi kỳ về 1 tháng (hoặc bật cờ) **và** giảm trong cùng lần gọi vẫn bị chặn.
  - **Tăng** ⟹ bắt buộc trường mới `quantityChangeReason` (chữ, trim, 1–500). Thiếu ⟹ 422 `SUBSCRIPTION.QUANTITY_REASON_REQUIRED`. Lý do ghi vào audit `SUBSCRIPTION.UPDATED`, không thêm cột.
  - Gửi `quantityChangeReason` mà không tăng ⟹ **bỏ qua** (không lỗi, không ghi audit); mô tả field nói rõ.
  - Không áp cho bản nháp, `K4`, `K1`, nhập hiện trạng ghế (đường import không đi PATCH), `addSeat`.
  - Giảm hợp lệ vẫn qua `assertNotBelowOccupied`.
- **Tiêu chí chấp nhận:**
  - (a) U policy (bảng: trạng thái × kiểu × kỳ đang lưu × cờ đang lưu × tăng/giảm, kèm ca PATCH đổi kỳ + giảm cùng lúc).
  - (b) H: thiếu lý do ⟹ 422; I: giảm gói năm không cờ ⟹ 409; có cờ ⟹ 200.
- **Kiểm:** U `subscription.policy.spec.ts`; H/I subscription.
- **API / migration:** có: phá contract FE (`flows/subscription-and-stock.md:271`), field + 2 mã mới. Seed PATCH bản nháp không bị luật này (bản nháp). _Sửa tối thiểu; B3 bỏ hẳn ô này (`QĐ-115f`)._

**W1-15 — Giờ trong mail là giờ địa phương.** Trạng thái: còn lỗi. Cỡ S.

- **Nguồn:** DECISIONS "Mail" (O2 M1); AUDIT-B #20; `QĐ-115aq`.
- **Code hiện tại:**
  - Payload ghi `toISOString()` ở `identity-access/accounts/app-users/invitation-mail.service.ts:46`, `auth/password-reset-mail.service.ts:52`, `recovery/recovery-links.service.ts:86` **và** `:109`, `auth/credential-change.service.ts:58`, `accounts/app-users/login-email-change-app-users.service.ts:16`. (`invitation-mail.service.ts:51` và `credential-change.service.ts:68` là audit, giữ ISO.)
  - `notifications/email/email-templates.mapper.ts` chép nguyên chuỗi: `expiry` `:47-49` (`expiresAt`), `renderPasswordChangedNotice` `:113` (`at`), `renderLoginEmailChangedNotice` `:144` (`at`) — đã mở, đúng ba chỗ.
- **Hành vi đúng:**
  - Payload giữ ISO và thêm `timeZone`, lấy từ `OrganizationReadApi.getOrganization(tx).timeZone`.
  - Mapper định dạng `dd/MM/yyyy HH:mm` theo `timeZone` ở ba chỗ trên, mặc định `Asia/Ho_Chi_Minh` cho dòng outbox cũ không có trường. Bản tiếng Anh cùng định dạng, có ghi múi (ví dụ `(GMT+7)`).
- **Tiêu chí chấp nhận:** U mapper: `2026-11-28T03:00:00.000Z` ⟹ `28/11/2026 10:00`; không có `timeZone` ⟹ cùng kết quả.
- **Kiểm:** U `email-templates.mapper.spec.ts`; spec của 5 service ghi payload.
- **API / migration:** không (payload outbox nội bộ; codec là payload tự do — Sonnet kiểm lại).

**W1-17 — Người xin vừa thành trưởng phòng ⟹ Request cá nhân trả phí còn mở thành một bước.** Trạng thái: còn lỗi. Cỡ M + M (hai gói). Đã chốt W1-Q3.

- **Nguồn:** `QĐ-114r`, mở rộng bởi `QĐ-116c` (B-Q3); `QĐ-106h`(1) (ngoại lệ ngược chiều); AUDIT-B #4; AUDIT-C #24; W1-Q3.
- **Code hiện tại:**
  - `requests/step-routing/reassignment.policy.ts:155-162`: `needStepTarget` cho Request trả phí mà người xin là trưởng phòng ⟹ `WAIT` `NO_DEPARTMENT_HEAD` (`endsAsFree` `:166-174` chỉ nhận chuỗi không có bước chi). Doc-comment `:140-147` ghi "not one the Owner has chosen to open here (`B2A-Q2`)".
  - **Sự kiện kích hoạt đã có:** `requests/reassignment/organization-change.listener.ts` nghe thay đổi tổ chức trong tx của thay đổi; `HEAD_PERIOD_START` (`concernedBy`, trigger `HEAD_CHANGED`) khóa tập Request (`step-reassignment.repo.ts:104-107`, theo id) rồi `reconcileRequests`. Lưới an toàn: lượt quét hằng ngày của `public/step-redetermination-sweep.api.ts` chạy lại bảng định tuyến trên bước nhu cầu đang giữ (bắt thay đổi có hiệu lực hôm nay mà sự kiện không báo).
  - Tập Request hiện đọc: `needRequestIdsOfRequesters` (`step-reassignment.repo.ts:161-171`) chỉ lấy `INTERNAL_FREE` có bước nhu cầu `PENDING`; Request ở hàng đợi trình hoặc chờ xác nhận dự phòng không vào tập.
  - **Cơ chế chuyển một bước đã có:** `reassignment/step-reassignment.service.ts:301-330` (`endNeedStep` → `repo.endNeedStepNotRequired` `step-routing/step-reassignment.repo.ts:271-291` đặt `routingMode = 'ONE_STEP'`, `oneStepReason`, bỏ `NEED` khỏi chuỗi); `reassignment/one-step-conversion.service.ts:27-41` (`finishPending`) + `spend/spend-routing.service.ts:83-92` (`finishConversion`: không mở bước chi thứ hai; Request trả phí đi `route(…, 'SUBMISSION', …)` = kiểm ngân sách như Request một bước). Lượt quét hoàn tất Request đã đánh dấu `ONE_STEP` mà chưa có bước chi (`oneStepPendingIds` `step-reassignment.repo.ts:109-120`, ba trạng thái `PENDING`, `WAITING_CONTROLLED`, `AWAITING_SPEND_SUBMISSION`).
  - `one_step_reason` là **cột chữ có `CHECK`**, không phải enum DB: `prisma/migrations/20261109180100_request_one_step/migration.sql:3` chỉ nhận `REQUESTER_IS_HEAD`, `NO_DEPARTMENT_HEAD`, `HEAD_LEFT`; DTO `access-request/access-request.dto.ts:166`, `spend-approval-view/spend-approval.dto.ts:145,192` (đã mở) cùng ba giá trị.
- **Hành vi đúng:**
  - **Lý do một bước dùng lại `REQUESTER_IS_HEAD`** (đúng nghĩa: người xin là trưởng phòng). Không thêm giá trị ⟹ **không migration, không đổi contract**. Phân biệt ca này bằng cờ audit `requesterBecameHead: true` trên `ACCESS_REQUEST.STEP_NOT_REQUIRED` (trigger `HEAD_CHANGED`) — đó là cờ _bỏ bước nhu cầu vì người xin vừa thành trưởng phòng_.
  - **Kích hoạt:** khi `HEAD_PERIOD_START` có hiệu lực (listener trong tx của thay đổi; lượt quét hằng ngày là lưới an toàn), xét mọi **Request cá nhân trả phí còn mở** mà người thụ hưởng là trưởng phòng mới của phòng mà Request được gửi cho (kể cả là kế nhiệm). Request cá nhân luôn có người xin = người thụ hưởng (`QĐ-103b`), nên "Request người khác gửi hộ" chỉ là Request nhóm ⟹ W1-Q3.
  - Tập Request mở rộng thêm Request trả phí của người đó ở các trạng thái bên dưới; khóa theo id đã sắp (như `lockIds`) trước mọi ghi.
  - Mỗi Request: đóng bước nhu cầu nếu còn (`endNeedStepNotRequired`, `REQUESTER_IS_HEAD`) hoặc đặt `routingMode = 'ONE_STEP'` + `REQUESTER_IS_HEAD` khi không còn bước nhu cầu mở; rồi **`SpendRoutingService.finishConversion`** trong cùng tx (kiểm ngân sách lại theo luật Request một bước, mở bước Người duyệt chi; Người duyệt chi thấy cờ dự phòng và tự quyết). Không viết đường chuyển một bước thứ hai.
  - Kiểm lại ra _bị chặn_ ⟹ như Request một bước bị chặn (về người xin sửa).
  - Case B (`NEW_SOFTWARE`): giữ bước IT đánh giá (1.3); xong đánh giá thì đi một bước (`finishConversion` đã có nhánh `NEW_SOFTWARE`).
  - Sửa doc-comment `reassignment.policy.ts:140-147` theo luật mới.
- **Bảng trạng thái** (Sonnet liệt kê trạng thái thật trong code và ánh xạ trước khi code; trạng thái không có trong bảng ⟹ dừng hỏi):

  | #    | Trạng thái Request trả phí của người vừa thành trưởng phòng | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                               |
  | ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | (a)  | chờ bước nhu cầu (`PENDING`)                                | đóng bước nhu cầu, `finishConversion` ⟹ bước chi mở + audit                                                                                                                                                                                                                                                                                                                                                                           |
  | (a′) | đứng chờ (`WAITING_CONTROLLED`, `NO_DEPARTMENT_HEAD`)       | như (a)                                                                                                                                                                                                                                                                                                                                                                                                                               |
  | (b)  | ở hàng đợi trình (`AWAITING_SPEND_SUBMISSION`)              | rời hàng đợi, `finishConversion` ⟹ bước chi mở                                                                                                                                                                                                                                                                                                                                                                                        |
  | (c)  | chờ xác nhận dùng dự phòng                                  | mở bước chi kèm cờ dự phòng                                                                                                                                                                                                                                                                                                                                                                                                           |
  | (d)  | kiểm lại ra _bị chặn_                                       | về người xin như Request một bước bị chặn                                                                                                                                                                                                                                                                                                                                                                                             |
  | (e)  | case B đang ở 1.3                                           | không đổi; IT duyệt đánh giá ⟹ một bước                                                                                                                                                                                                                                                                                                                                                                                               |
  | (f)  | đã có bước chi mở                                           | không đổi (`finishConversion` không mở bước thứ hai)                                                                                                                                                                                                                                                                                                                                                                                  |
  | (g)  | chờ người xin sửa (`AWAITING_REQUESTER_REVISION`)           | không đổi; khi gửi lại đi theo bảng định tuyến (`routeNeedStep` dòng 2 ⟹ một bước). Sonnet xác nhận đường gửi lại đi qua `routeNeedStep`; không ⟹ dừng hỏi                                                                                                                                                                                                                                                                            |
  | (h)  | Request tiếp tục                                            | cùng luật theo trạng thái của nó ở (a)–(g)                                                                                                                                                                                                                                                                                                                                                                                            |
  | (i)  | dòng của người đó trong Request nhóm                        | **không đổi nghiệp vụ** (W1-Q3). Lối ra: **người gửi** rút dòng đó; trưởng phòng mới quyết các dòng còn lại và tự gửi Request cá nhân (một bước). Trưởng phòng không rút được ở giai đoạn nhu cầu (`access-request/withdrawal.policy.ts:43-45`); trưởng phòng là người thụ hưởng nên bị `ACCESS_REQUEST.OWN_REQUEST` khi quyết dòng của chính mình (`group-request/group-line-decision.policy.ts:28,97-98`). Tách dòng tự động: đợt 7 |

- **Tiêu chí chấp nhận:** I theo từng dòng (a)–(i); với (i): test lối ra (người gửi rút dòng ⟹ trưởng phòng mới quyết được các dòng còn lại; Request cá nhân mới của họ đi một bước). Sau sự kiện, không còn Request cá nhân trả phí nào của người vừa thành trưởng phòng ở bước nhu cầu hay hàng đợi trình.
- **Kiểm:** U `reassignment.policy.spec.ts`; I mới `test/integration/requests/requester-became-head.integration-spec.ts` (≤ 800 dòng; dài hơn thì tách theo dòng bảng).
- **API / migration:** không (dùng lại `REQUESTER_IS_HEAD`; cờ audit mới là payload audit tự do).

**W1-18 — `KPI-5`.** Trạng thái: còn lỗi. Cỡ S.

- **Nguồn:** `QĐ-116ba` (P-2); `QĐ-117b` (sửa `QĐ-108i`); Q117-B M4.
- **Code hiện tại:** `optimization/ghost-seat/ghost-seat-state.policy.ts:90-95`:
  - `countsInKpi5` không xét `closeReason`;
  - `KPI5_NUMERATOR_REASONS = ['KEPT','NEGATED','SUPERSEDED']`.
  - Có **10** lý do đóng: `ghost-seat.types.ts:22-33`.
- **Hành vi đúng:**
  - Tử số = `KEPT` + `EXEMPTED` + `NEGATED`.
  - Mẫu số loại `LEFT_TO_EXPIRE` và `SUPERSEDED` (khuyến nghị tạm dừng bị `G2` thay thế), ở cả tử lẫn mẫu.
  - Ngoài ra giữ luật tầng/nhóm hiện có (khuyến nghị đang mở vẫn vào mẫu số).
- **Tiêu chí chấp nhận:** U `kpi5Of` với 11 dòng cùng nhóm được đếm (1 mỗi lý do trong 10 lý do + 1 đang mở) ⟹ mẫu 9, tử 3.
- **Kiểm:** U `ghost-seat-state.policy.spec.ts`; I `ghost-seat-tc1…`/board ghi FIX-TEST nếu lệch.
- **API / migration:** không (schema giữ, **số đổi** ở `ghostSeatKpi5Get`).

**W1-19 — Cổng ≥ 2 admin lúc khai: đếm IT Admin còn làm việc; khởi tạo chỉ bật cờ.** Trạng thái: còn lỗi. Cỡ S.

- **Nguồn:** `QĐ-114ae`; `QĐ-117e` (khởi tạo = A); `QĐ-110u`, `QĐ-110k`; Q117-B M9.
- **Code hiện tại:**
  - `catalog/subscription/pool/subscription-pool.policy.ts:89-101`: `assertVendorAdminsRecorded` đếm **số người đã ghi**.
  - Gọi ở `subscription-pool.service.ts:141-150` (`:145`).
  - Cờ đọc `vendorAdminFlags` (`:108-120`) đã đếm người còn làm việc qua `PlanFactsService.workingAdminsAmong` (`catalog/plan/plan-facts.service.ts:87-99`).
  - Pha khởi tạo có sẵn: `SeatBaselinePhaseHook` (`catalog/public/catalog.extension-points.ts:60-74`), đã dùng ở `subscription-pool.service.ts:186`.
- **Hành vi đúng:**
  - Khai, kích hoạt, hoặc PATCH bản nháp thành `ACTIVE` (không áp khi nối kỳ `renewedFromId`): đếm admin là **IT Admin còn làm việc** < 2 ⟹ 422 `SUBSCRIPTION.VENDOR_ADMINS_REQUIRED`.
  - Trong pha khởi tạo: không chặn; cờ `vendorAdminsBelowMinimum` tự hiện.
  - Hook chưa bind ⟹ fail closed (chặn).
  - Thuê bao thứ hai của cùng gói cũng qua cổng (đã đúng).
- **Giả định (ghi để Owner biết):** "pha khởi tạo" = pha nhập hiện trạng ghế chưa đóng (`SeatBaselinePhaseHook`). `QĐ-114ae` ghi chi tiết này thuộc "spec đợt B2"; đợt 1 làm trước B2 ở mức tối thiểu, B2 chuyển danh sách admin sang Workspace. Seed và test cũ khai thuê bao khi pha còn mở sẽ không còn nhận 422.
- **Tiêu chí chấp nhận:**
  - (a) I: hồ sơ ghi 2 người, 1 đã nghỉ, pha đã đóng ⟹ 422.
  - (b) Cùng dữ liệu, pha còn mở ⟹ 201 + cờ.
  - (c) 2 người còn làm ⟹ 201.
- **Kiểm:** U `subscription-pool.policy.spec.ts`; I `subscription-vendor-admins-http.integration-spec.ts`.
- **API / migration:** không đổi schema; **422 `VENDOR_ADMINS_REQUIRED` đổi nghĩa** (đếm người còn làm việc; pha khởi tạo không chặn) ⟹ sửa mô tả 422. Seed khai/hoàn tất thuê bao (`src/cli/seed/steps/catalog.steps.ts:328-341`) phải thỏa cổng mới hoặc chạy trong pha khởi tạo. _Sửa tối thiểu; B2 chuyển danh sách admin sang Workspace._

**W1-20 — LBG-13: chặn gửi phiên bản khi kỳ chưa khóa.** Trạng thái: còn lỗi. Cỡ S (code); nợ test M.

- **Nguồn:** OLD-QD-A LBG-13 (Owner "Gộp Prompt 3": đổi theo A); hết hạn nộp là khóa (`QĐ-111z`); AUDIT-C #31 vế đầu.
- **Code hiện tại:**
  - `budgets/version/version-access.service.ts:82`: `cycleAcceptsWork(cycle)`.
  - `budgets/cycle/cycle.policy.ts:12`: `openedAt !== null`, nên `OPEN` cũng qua.
  - `cycleStateOf` ở `:20-27`.
- **Hành vi đúng:** gửi phiên bản khi trạng thái kỳ tại hôm nay là `OPEN` ⟹ 409 `BUDGET_CYCLE.NOT_LOCKED`. `DRAFT`/không có kỳ ⟹ giữ `BUDGET_CYCLE.NOT_OPEN`.
- **Tiêu chí chấp nhận:** U `cycle.policy.spec.ts`; I: gửi trước hạn nộp ⟹ 409, sau hạn ⟹ 201.
- **Kiểm:**
  - sửa harness `test/support/budget-harness.ts:196` (đẩy hạn nộp về quá khứ trước khi gửi);
  - seed gửi phiên bản qua API (`src/cli/seed/steps/budget.steps.ts:78`, `POST /budget-versions/:id/submission`): sửa để gửi khi kỳ đã khóa (hạn nộp đã qua); cập nhật `budget.steps.spec.ts`;
  - các spec liệt kê trong báo cáo kiểm ghi FIX-TEST: `test/flows/mf4-budget.flow-spec.ts`, `test/integration/budgets/budget-*.integration-spec.ts`, `test/integration/requests/budget-versions|budget-decisions…`, `test/http/budgets/budget-attachments.http-spec.ts`.
- **API / migration:** có: 409 mới + example. Không migration.

**W1-21 — FIX-RV23-Q2: Cost Center nguồn vượt 80/100 % do giảm số cơ sở cũng được báo.** Trạng thái: còn lỗi. Cỡ M.

- **Nguồn:** OLD-QD-A FIX-RV23-Q2 (Owner: đổi theo B); `QĐ-111af`.
- **Code hiện tại:**
  - `budgets/adjustment/budget-adjustment-apply.service.ts:49-54` chỉ canh bên nhận chưa có ngân sách.
  - `threshold/threshold-alert.service.ts:61-62` chỉ xét số dùng **tăng**.
  - `threshold/threshold.policy.ts:10` ghi "lowered base crosses nothing".
  - `apply` chạy trước `repo.decide` (`budget-adjustment-decision.service.ts:69-70`).
- **Hành vi đúng:**
  - Điều chỉnh `TRANSFER`/`RETURN` được duyệt ⟹ với Cost Center **nguồn** của năm đó, nếu `used×100 < t×baseBefore` và `t×baseAfter ≤ used×100` (t ∈ {80, 100}) ⟹ báo `BUDGET_THRESHOLD_REACHED` như một lần vượt, mỗi ngưỡng một lần.
  - `CEILING_REDUCTION` không có Cost Center ⟹ không canh.
- **Tiêu chí chấp nhận:**
  - (a) U policy mới `crossedByBaseDrop`.
  - (b) I: _Chuyển_ làm nguồn từ 75 % lên 85 % ⟹ một thông báo 80.
  - (c) _Trả lại_ lên 100 % ⟹ hai ngưỡng theo luật hiện có.
- **Kiểm:** U `threshold.policy.spec.ts` (giữ ca cũ cho hàm cũ); I `budget-threshold-alert.integration-spec.ts`.
- **API / migration:** không (thông báo mới ở inbox; schema giữ).

**W1-22 — LBG-08: Dự phòng kho dùng chung không vượt Trần năm.** Trạng thái: còn lỗi. Cỡ S.

- **Nguồn:** OLD-QD-A LBG-08 (kỹ thuật, mặc định A).
- **Code hiện tại:** `budgets/cycle/cycle.service.ts:96-108` (tạo) và `cycle.policy.ts:122-139` (`planCycleChange`) không so hai số. Lỗi chỉ lộ ở `version-access.service.ts:109`.
- **Đã kiểm, không sửa:** nhánh điều chỉnh `CEILING_REDUCTION` (`adjustment/budget-adjustment-apply.service.ts:44-45,70-77`, `lowerCeiling`) không làm Trần xuống dưới Dự phòng: số hạ bị chặn ở `budget-adjustment.policy.ts:64-70` không vượt _chưa phân bổ_, mà _chưa phân bổ_ = Trần − Dự phòng − đã phân bổ (`budget-adjustment.policy.ts:44`).
- **Hành vi đúng:** tạo hoặc sửa kỳ (`DRAFT`, `OPEN`) mà dự phòng > trần (sau khi áp thay đổi) ⟹ 422 `BUDGET_CYCLE.RESERVE_OVER_CEILING`. Bằng nhau vẫn hợp lệ.
- **Tiêu chí chấp nhận:** U `cycle.policy.spec.ts`; I `budget-cycle-lifecycle.integration-spec.ts` (POST, PUT 422).
- **Kiểm:** như trên.
- **API / migration:** có: 422 mới. Không migration (không thêm `CHECK`).

**W1-23 — B1A-09: nhắc "chưa có ngân sách năm sau" gộp một thông báo mỗi người.** Trạng thái: còn lỗi. Cỡ S.

- **Nguồn:** OLD-QD-A B1A-09 (kỹ thuật, mặc định B).
- **Code hiện tại:**
  - `budgets/year-end/next-year-reminder.service.ts:50-61` lặp Cost Center × người, mỗi CC một tx; `subject: { type: 'COST_CENTER', id }` (`:59`); `eventKey nextYearBudget:<cc>:<day>` (`:61`).
  - `notifications/inbox/inbox.policy.ts:116` (đã mở): `BUDGET_NEXT_YEAR_MISSING: ['costCenterId', 'year']` — danh sách khóa **được ghi**; `refuseInAppNotification` (`:257-277`) chỉ kiểm lúc ghi.
  - Text `notification-text/notification-texts-budget.types.ts:205-215` dùng `{costCenterId:name}`. Spec bảng text đòi mọi khóa dùng trong câu nằm trong danh sách của mã (`notification-text.table.spec.ts:81-82`).
  - `subject` ở DB: `subject_type`/`subject_id` cùng null hoặc cùng có, `subject_id` là UUID (`prisma/migrations/20261024110000_notifications_in_app_inbox/migration.sql:12,23-24`). Đích của thông báo là màn `budgetTable`, không đọc `subject` (`inbox/notification-target.policy.ts:64`).
- **Hành vi đúng:**
  - Mỗi người nhận một thông báo mỗi lượt, một tx cho mỗi người: `params { year, costCenterCount }`, **`subject: null`**, `eventKey nextYearBudget:<year>:<day>`.
  - Mã thông báo giữ nguyên. `inbox.policy.ts:116` thành `['costCenterId', 'year', 'costCenterCount']`: giữ `costCenterId` cho dòng cũ đọc được (dòng mới không ghi nó).
  - Text dùng nhóm tùy chọn `[ … ]` của bộ dựng câu để cả dòng cũ (`costCenterId`) lẫn dòng mới (`costCenterCount`) đều ra câu đúng.
- **Tiêu chí chấp nhận:** I: 3 CC thiếu, 2 người nhận ⟹ 2 thông báo, `costCenterCount=3`, `subject` null; U text: dòng cũ và dòng mới đều ra câu không rỗng.
- **Kiểm:** U job spec + spec text; I `next-year-reminder.integration-spec.ts`; H `next-year-budget.http-spec.ts`; sửa `docs/rules/security-jobs.md:218-221` (khóa và cách gửi).
- **API / migration:** có: params của thông báo đổi, `subject` null (FE inbox). Không migration.

**W1-24 — G-15: cấp lại đúng thuê bao sau ân hạn khi tác vụ thu hồi `TRANSFER` còn `QUEUED`.** Trạng thái: còn lỗi. Cỡ M.

- **Nguồn:** OLD-QD-B G-15 (Owner "đồng ý hết"); R-49, `QĐ-110q`, `QĐ-114ak`(1), `QĐ-64a`.
- **Code hiện tại:**
  - `licensing/provisioning/tasks/provisioning-grant-writer.service.ts`: `claimForGrant` `:58` (khóa Request) → `lockTarget` `:63` (khóa subscription) → `endReplacedRight` `:65`; trong đó `hasLiveRevocation` `:237` đếm cả `QUEUED`, đọc không khóa.
  - `licensing/assignment/assignment.policy.ts:106`: `!grant.revocationUnderWay`; khi không kết thúc quyền cũ, lỗi đến từ ràng buộc DB lúc ghi quyền mới ⟹ 422 `LICENSE_ASSIGNMENT.OVERLAP` (`assignment/assignment-conflicts.repo.ts:18`).
  - Đường thu hồi khóa ngược: tác vụ (`revocation.service.ts:59`) → subscription (`assignment/assignment-end.service.ts:35-38`). Nếu chỉ thêm khóa tác vụ ở `endReplacedRight` (sau subscription) thì **sinh deadlock mới** (`40P01` khi IT A cấp lại đúng lúc IT B nhận/hoàn tất tác vụ đó).
  - `answer.replacesAssignmentId` có sẵn trước khi claim (`licensing/public/licensing.types.ts:214`); `claimMatchesAnswer` (`provisioning-grant.policy.ts:42-45`) chưa so trường này.
  - `RevocationWithdrawalService.withdraw` (`provisioning/revocation-withdrawal/revocation-withdrawal.service.ts:41-59`) khóa lại chính tác vụ (cùng tx, không chờ). Năm listener của sự kiện thu hồi đều bỏ qua `REASON_WITHDRAWN` (đã mở: `requests/return-request/return-revocation.listener.ts:40`, `personnel/transfer-grace/transfer-closure.listener.ts:51`, `optimization/ghost-seat/ghost-seat-revocation.listener.ts:41-42`, `personnel/departure-closure/mailbox-lock-revocation.listener.ts:40`, `requests/grant/seat-revocation.listener.ts:31`) ⟹ rút lý do không thêm khóa nào.
- **Hành vi đúng:**
  - **Thứ tự khóa:** khi `answer.seat === 'PERSONAL'` và có `answer.replacesAssignmentId`, khóa tác vụ thu hồi sống của quyền đó (`lockLiveRevocation`) **trước `claimForGrant`**, ngay sau khóa employee của W1-08. Sau claim, `claimed.replacesAssignmentId` phải trùng `answer.replacesAssignmentId`, khác ⟹ `GrantRequestRefusedError('NOT_APPROVED')` (mở rộng `claimMatchesAnswer`).
  - `endReplacedRight` dùng tác vụ đã khóa:
    - không có tác vụ ⟹ như hiện nay;
    - tác vụ `QUEUED` mà lý do còn đứng **chỉ** có `TRANSFER` ⟹ rút lý do đó (`RevocationWithdrawalService.withdraw`, cause `NO_LONGER_APPLIES`), tác vụ thành `CANCELLED`, quyền cũ kết thúc hôm nay, cấp mới chạy tiếp;
    - còn lý do khác (một tác vụ trả lời cho mọi lý do — `QĐ-64a`), hoặc tác vụ `IN_PROGRESS`, `FAILED`, `COMPLETED` ⟹ **giữ chặn**: ném 422 `LICENSE_ASSIGNMENT.OVERLAP` ngay tại đây (trước khi ghi quyền mới), kèm `details` chỉ tác vụ đang chặn (`conflictingAssignmentId` sẵn có của `AssignmentConflictError` + `revocationTaskId`, `revocationStatus`). Chỉ ném sớm ở ca mà quyền cũ lẽ ra kết thúc được nếu không có tác vụ (cùng thuê bao); ca khác giữ đường cũ.
  - Lý do giữ 422 (G-15, không hỏi lại): hủy cả tác vụ lúc cấp sẽ xóa âm thầm một quyết định khác (nghỉ việc, hoàn trả, ghost seat). Không phải ngõ cụt: IT hoàn tất tác vụ thu hồi rồi cấp như seat mới.
  - Điều chuyển tự đóng ở lượt quét kế khi không còn quyền phải thu (`personnel/transfer-grace/transfer-revocation.service.ts:103-112`, `closeIfDue` ở `:112`).
- **Tiêu chí chấp nhận:** I `test/integration/personnel/transfer-grace-regrant.integration-spec.ts:296-306` viết lại:
  - (a) chỉ `TRANSFER` ⟹ 200, task `CANCELLED`, quyền cũ `validUntil = hôm nay`;
  - (b) có thêm lý do `DEPARTURE` ⟹ vẫn 422, `details.revocationTaskId` đúng tác vụ; tác vụ `FAILED` ⟹ vẫn 422;
  - (c) lượt quét điều chuyển kế ⟹ điều chuyển đóng;
  - (d) I đồng thời có barrier: cấp lại ‖ IT nhận/hoàn tất đúng tác vụ thu hồi đó, lặp N ⟹ không `40P01`, một bên thắng, bất biến INV-02 giữ.
- **Kiểm:** như trên + U `provisioning-grant.policy.spec.ts`.
- **API / migration:** có: 422 `LICENSE_ASSIGNMENT.OVERLAP` của `provisioningTaskGrant` thêm `details` (mã, status giữ). Không migration. _K1/K4 "đúng nguồn quyền" (C-3) để B2/B3._

**W1-25 — G-16: tác vụ `TRANSFER` đóng `CLOSED_FAILED` không bị lượt quét mở lại; IT Admin mở lại bằng route; cờ dashboard.** Trạng thái: còn lỗi. Cỡ M. Đã chốt W1-Q5.

- **Nguồn:** OLD-QD-B G-16; `QĐ-114ak` (cờ _điều chuyển còn quyền chưa thu_); AUDIT-C #14; W1-Q5.
- **Code hiện tại:**
  - `personnel/transfer-grace/transfer-sweep.policy.ts:44-46` (`revocationDue`: mỗi ngày sau ân hạn), `:65-76` (`rightsToTakeBack`).
  - `transfer-revocation.service.ts:103-112` (khóa employee FU, khóa điều chuyển, `takeBack`, `closeIfDue`); `takeBack` `:116-150` lặp quyền theo thứ tự của `rightsToTakeBack` (`:126`) và gọi `openRevocation` (`:127-140`).
  - `licensing/provisioning/revocation.service.ts:59-61`: `lockLiveRevocation` (`provisioning-task.repo.ts:358-366`) bỏ `CLOSED_FAILED` nên tạo tác vụ mới mỗi lượt.
  - **Không có đường mở tay:** `personnel/transfer/transfers.controller.ts` chỉ có tạo, đọc, dời lịch, hủy (`:83-245`); tác vụ không có route mở lại.
  - `personnel/public/personnel-dashboard.types.ts:26-33` (`TransferDashboardFacts`) không có cờ.
- **Hành vi đúng:**
  - **Lượt quét thôi tự mở lại:** lượt quét điều chuyển không tạo tác vụ mới cho quyền đã có tác vụ `REVOKE` `CLOSED_FAILED` mang lý do `TRANSFER` của cùng điều chuyển. Cờ `noReopenAfterFailure` truyền qua `OpenRevocationInput`; khi bỏ qua, cổng trả `created=false, reasonAdded=false`. Điều chuyển không đóng (quyền còn đó).
  - **Route IT Admin mở lại** (mới): `POST /department-transfers/:id/revocations`, `@RequireRoles('IT_ADMIN')`, không body. Trong một tx: khóa employee FU rồi điều chuyển (như `:103-104`), đòi điều chuyển `EFFECTIVE`, chưa đóng, đã hết ân hạn (`revocationDue`), rồi gọi lại `takeBack` **không** cờ `noReopenAfterFailure`. Trả `{ created, reasonAdded }`.
    - Chưa tới hạn / đã đóng / chưa có hiệu lực ⟹ 409 `DEPARTMENT_TRANSFER.REVOCATION_NOT_DUE`.
    - Không quyền nào để mở (`created + reasonAdded = 0`) ⟹ 409 `DEPARTMENT_TRANSFER.NOTHING_TO_REVOKE`, rollback.
    - Không thấy điều chuyển ⟹ 404 mã sẵn có của điều chuyển.
    - Controller đặt trong `personnel/transfer-grace/` (đang 21 file), cùng path `department-transfers`, để không thêm cạnh capability `transfer → transfer-grace`; Sonnet kiểm `pnpm arch:capabilities --module personnel`.
  - Vòng `takeBack` sắp quyền theo (`subscriptionId`, `assignmentId`) (luật vòng lặp nhiều seat, mục 4).
  - **Cờ dashboard:** IT Admin và Super Admin có số `revocationFailed` trong phần điều chuyển: số điều chuyển `EFFECTIVE`, chưa đóng, đã hết ân hạn, còn quyền mà tác vụ `TRANSFER` của nó `CLOSED_FAILED` và chưa có tác vụ sống. Đếm qua facade licensing (một câu cho cả tập id điều chuyển); personnel không đọc `provisioning_tasks`.
- **Tiêu chí chấp nhận:**
  - (a) I: đóng thất bại, quét lại ⟹ không có task mới.
  - (b) I dashboard ⟹ `revocationFailed = 1`; sau khi IT mở lại ⟹ 0.
  - (c) H/I route: IT Admin ⟹ 200 + task mới `QUEUED`; Super Admin ⟹ 403; trước hạn ⟹ 409 `REVOCATION_NOT_DUE`; gọi lần hai khi task mới còn sống ⟹ 409 `NOTHING_TO_REVOKE`.
- **Kiểm:** U `transfer-sweep.policy.spec.ts`, spec `openRevocation`; I `transfer-grace-closure…`, `dashboards-progress…`; H `dashboards.http-spec.ts` + route mới.
- **API / migration:** có: **operation mới** + field mới ở hai response dashboard. Không migration.

**W1-26 — P2-14: `GET /me/departure-notice` trả `offboardingCaseId`.** Trạng thái: còn lỗi. Cỡ S.

- **Nguồn:** OLD-QD-B P2-14 (kỹ thuật).
- **Code hiện tại:**
  - `personnel/role-duties/role-duties.dto.ts:10-15` không có id.
  - `role-duties-view.service.ts:32-37` không trả `found.id`.
  - Route bàn giao nhận id ở `it-handover/it-handover.controller.ts:68`.
- **Hành vi đúng:** response thêm `offboardingCaseId` (uuid). Không mở quyền mới.
- **Tiêu chí chấp nhận:** I `role-duties.integration-spec.ts` khẳng định field.
- **Kiểm:** như trên.
- **API / migration:** có: field mới. Không migration.

**W1-27 — O3-Q2 / T9: chặn hóa đơn trùng sau khi chuẩn hóa số.** Trạng thái: còn lỗi. Cỡ M. Đã chốt W1-Q4.

- **Nguồn:** O3-Q2; `QĐ-115p`, `QĐ-103w`; AUDIT-A §6; W1-Q4.
- **Code hiện tại:**
  - `prisma/migrations/20261113004500_pi1_purchase_invoices/migration.sql:95-96`: `purchase_invoices_number_open_key (organization_id, vendor_id, number) WHERE state <> 'RETURNED'`, so nguyên văn. Index chỉ có ở SQL, không có trong `prisma/models/requests.prisma` (model `PurchaseInvoice`).
  - `requests/purchase-invoice/purchase-invoice.repo.ts:155-161` (`numberIsOpen`), gọi từ `purchase-invoice-submission.service.ts:79`; bắt P2002 ở `:122-131` và phân loại theo `meta.target` có chữ `resubmission` hay không.
  - Bảng `invoices` (budgets) **không có cửa nhập riêng**; dòng mới chỉ đến từ hóa đơn mua đã ký (`budgets/invoice/purchase-invoice-recorder.service.ts:55`) hoặc số tự sinh `OOP-<id>` (`out-of-process-spend-recorder.service.ts:37`). Câu kiểm `exists` ở `budgets/budget/invoice.repo.ts:119-122` so nguyên văn; unique `@@unique([organizationId, vendorId, number])` ở `prisma/models/budgets.prisma:443`.
- **Hành vi đúng:**
  - **Khóa so** = `lower(regexp_replace(number, '[[:space:]]', '', 'g'))`, viết **giống hệt** ở migration và ở code. Không dùng `\s`: trong template `$queryRaw` của JS, `'\s'` thành `'s'`. Lưu nguyên văn. Trùng ⟹ 409 `PURCHASE_INVOICE.NUMBER_TAKEN` (mã giữ).
  - **`purchase_invoices`:** unique biểu thức + điều kiện `state <> 'RETURNED'`; `numberIsOpen` đổi sang `$queryRaw` cùng biểu thức. Tên index mới không chứa `resubmission` (để P2002 vẫn ra `NUMBER_TAKEN`).
  - **`invoices`:** không đụng index, không migration; chỉ đổi câu `exists` sang so khóa chuẩn hóa (chặn ca hóa đơn đời cũ trùng số khác hoa/thường). Hệ quả: `purchaseInvoiceConfirm` cũng trả 409 `NUMBER_TAKEN` cho ca này.
  - **Migration** viết tay (máy không có DB, không chạy `migrate dev`; CI áp vào CSDL rỗng và kiểm drift DB-16). Thứ tự trong file:
    1. khối `DO $$ … $$` **kiểm trùng đứng đầu**: đếm nhóm (`organization_id`, `vendor_id`, khóa so) của dòng `state <> 'RETURNED'` có > 1 dòng; có ⟹ `RAISE EXCEPTION` kèm danh sách (nhà cung cấp, số chuẩn hóa, số dòng), không tự sửa, không tự gộp dữ liệu tiền;
    2. `CREATE UNIQUE INDEX` mới (tên mới);
    3. cuối cùng mới `DROP INDEX "purchase_invoices_number_open_key"`.
       Lỗi ở bước nào thì index cũ vẫn còn. Migration hỏng giữa chừng để lại dòng lỗi trong `_prisma_migrations`, phải `prisma migrate resolve --rolled-back` mới deploy tiếp được: đó là lý do Owner kiểm trước.
  - **Câu kiểm cho Owner chạy trên DB demo trước deploy** (chỉ đọc; ghi cả vào commit message):

    ```sql
    SELECT organization_id, vendor_id,
           lower(regexp_replace(number, '[[:space:]]', '', 'g')) AS normalized_number,
           count(*) AS open_rows
      FROM purchase_invoices
     WHERE state <> 'RETURNED'
     GROUP BY 1, 2, 3
    HAVING count(*) > 1;
    ```

    Có dòng ⟹ Finance trả lại bản thừa qua nghiệp vụ (dòng `RETURNED` nằm ngoài index), hoặc seed lại demo.
- **Tiêu chí chấp nhận:**
  - (a) I, cùng nhà cung cấp: `INV-001` rồi `inv - 001` ⟹ 409 (cả hai thành `inv-001`); `INV 001` rồi `inv001` ⟹ 409; `INV-001` rồi `INV001` ⟹ 201 (gạch nối không phải khoảng trắng). Lần đầu lưu đúng nguyên văn.
  - (b) I: hóa đơn `RETURNED` mang số trùng không chặn lần nộp lại.
  - (c) U/I: `invoices.exists` nhận `INV 001` khi đã có `inv001`.
- **Kiểm:** I `test/integration/requests/purchase-invoice.integration-spec.ts`; gate `migration-order`; CI drift.
- **API / migration:** có migration `2026112…_purchase_invoice_number_normalized` (> `20261119090000`, giờ hợp lệ). Không phá dữ liệu, nhưng **dừng nếu đã có trùng** (R-4). 409 `NUMBER_TAKEN` nay trả cả khi khác hoa/thường, khoảng trắng. _Sửa tối thiểu; B3 viết lại hóa đơn nhiều dòng, giữ khóa so này._

### 3.4. Mục đã kiểm và **không** đưa vào PLAN

| Mục                                                      | Kết luận                                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| FX1-R1-OQ "trả cam kết theo tháng lịch" (`QĐ-114w` vế 1) | Code đã trả theo tháng lịch (`requests/grant/seat-release.policy.ts:9-13`). Phần "tự giải phóng phần vượt seat-ngày" là `QĐ-116ac` ⟹ B1 |
| FX2-Q1 cấp khi kỳ kế tiếp thiếu ghế                      | Đã sửa ở `licensing/assignment/assignment.service.ts:441-462` (`carryOrBuy`: tự mua 1), khớp `W1c-Q3`                                   |
| K-5 khóa + `expectedUpdatedAt` của PATCH thuê bao        | Đã đúng khi client gửi trường (khóa rồi mới so, `subscription-change.service.ts:145-148`); vế bắt buộc là W1-03                         |
| Lô duyệt chi kiểm tuần tự theo thứ tự mục (`QĐ-117k`)    | Đã đúng (`spend-submission/spend-batch.service.ts:101-105`), không sửa                                                                  |

## 4. Thứ tự khóa chuẩn (một bảng, dùng chung mọi đợt)

Owner chốt W1-Q1: **tác vụ trước Request** (đúng như code ở mọi chỗ hiện có). Chữ cũ ở DECISIONS O3 ("request → task") đã được sửa.

**Quy tắc chung:**

- Mỗi transaction lấy khóa **từ trên xuống**. Không lấy khóa của một tầng trên sau khi đã giữ khóa tầng dưới, trừ luật vòng lặp nhiều seat và ngoại lệ E1–E3 bên dưới.
- Trong cùng một tầng, khóa theo khóa sắp xếp ở cột 3.
- Advisory lock dùng `pg_advisory_xact_lock`, lấy lại trong cùng tx là an toàn.
- Mọi luồng mới cần một integration test đồng thời: 2 connection có barrier, kỳ vọng không `40P01` và bất biến giữ nguyên.
- Bảng chỉ phủ các bảng mà nhiều luồng tranh chấp chéo. Gốc riêng của một luồng (khuyến nghị ghost seat — `optimization/decision/decision.service.ts:91` `lockMany`; `purchase_invoices`; lô nhập) khóa ngay sau tầng 0 của luồng đó; thêm hàng vào bảng khi một luồng thứ hai bắt đầu khóa chúng.

| #   | Tầng                                                                                                                                         | Sắp theo                    | Ví dụ hiện có                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Khóa lượt / idempotency (advisory hoặc unique claim): lượt 01/01, `seat-month:<sub>:<month>`, key đẩy sớm, khóa lô                           | khóa                        | `year-start-commitments.service.ts:56`, `seat-month-subscription.service.ts:68`, `escalation.service.ts:71-77`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1   | `employees` (FS/FU), rồi hồ sơ nghỉ việc / điều chuyển của người đó                                                                          | id                          | mốc chặn `block-announcement.service.ts:70-86`; `transfer-revocation.service.ts:103-104`; cấp seat sau W1-08                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2   | `departments` FS; advisory `requests.limits:<emp>`                                                                                           | id                          | `request-limits.repo.ts:18-23`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 3a  | `provisioning_tasks` — **tác vụ cấp của Request**                                                                                            | id                          | `lockGrantOfRequest` trước `lockById` ở 6 chỗ phía Request: `requests/withdraw/withdrawal-preconditions.service.ts:41`; `requests/group-request/group-withdrawal.service.ts:52`, `:96`; `requests/cancellation/departure-cancellation.service.ts:80`; `requests/cancellation/beneficiary-gone-cancellation.service.ts:111`; `requests/line-closure/group-line-closer.service.ts:31`. Phía IT: khóa tác vụ (`licensing/provisioning/provisioning-task-frame.service.ts:57`) rồi Request (`requests/grant/access-request-grant.listener.ts:52,63,81,116,175`) |
| 3b  | `provisioning_tasks` — **tác vụ thu hồi của assignment**                                                                                     | id                          | `revocation.service.ts:59`; cấp lại sau W1-24                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 4   | `access_requests`, rồi `access_request_lines`                                                                                                | id; dòng theo `employee_id` | `spend-batch.service.ts:149-150` (`lockAll` theo id); `step-reassignment.repo.ts:104-107`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 5   | `budget_cycles` FU, rồi proposal, rồi version của (CC, năm)                                                                                  | id                          | `budget-year-lock.repo.ts:12-18`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 6   | `subscriptions`. Khi có thể đổi cờ primary: mọi subscription primary của plan + chính nó + kỳ trước, cùng một câu, là khóa đầu tiên của tầng | id                          | sau W1-04                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 7   | `plans` (FS; FU khi đổi primary)                                                                                                             | id                          | `seat-target.service.ts:78-85`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 8   | `license_assignments` / (đợt 2) `device_activations`                                                                                         | id                          | `assignment-end.service.ts:35-41` (sau subscription)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 9   | `budget_commitments`                                                                                                                         | năm, rồi id                 | `commitment.repo.ts:130`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 10  | advisory CC-year `budget-year:<cc>:<năm>`                                                                                                    | cc id, rồi năm tăng dần     | `budget-year-lock.repo.ts:22-28`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

- **3a và 3b** cùng đứng trên Request (4), subscription (6) và assignment (8). Tx cần cả hai thì 3a trước 3b (hiện chưa có luồng nào cần cả hai). Tạo tác vụ mới là **chèn**, không chờ khóa (`claimForGrant` khóa Request rồi chèn tác vụ cấp — `provisioning-grant-writer.service.ts:58,87`).
- **Luật vòng lặp nhiều seat (W1-Q1):** mỗi seat khi mở thu hồi đi qua tác vụ → subscription → (plan) → assignment, nên một tx thu hồi nhiều seat tất yếu quay lại tầng 3b sau tầng 8 của seat trước. Được phép **chỉ khi** mọi tx như vậy xử lý seat theo cùng một khóa đã sắp: (`subscriptionId`, `assignmentId`), mỗi seat xong trọn rồi mới sang seat kế. Áp ở: nghỉ việc (`offboarding-revocation.service.ts:82`, W1-01), lô `G2` (`decision.service.ts:108-119`, W1-09), thu quyền điều chuyển (`transfer-revocation.service.ts:126`, W1-25). Vòng lặp mới trên nhiều seat phải theo luật này.

**Ngoại lệ có chủ đích (ghi rõ, không thêm mới khi chưa sửa bảng):**

- **E1:** quyết phiên bản lấy CC-year (10) rồi UPDATE commitment **đang chờ** (`attachedVersionId = null`, tầng 9). Hệ quả: tx nào đã khóa một commitment đang chờ thì **không** lấy CC-year của (CC, năm) đó. Hai nơi áp dụng: hóa đơn (FIX-RV23 RV2-03) và seat-tháng (W1-06).
- **E2:** gửi Request từ nháp khóa dòng nháp (tầng 4) **trước** employee FS (tầng 1) (`request-draft.repo.ts:134`). **Đã kiểm, an toàn:** không luồng nào giữ employee rồi khóa một dòng `DRAFT` — tập Request mở dùng khi hủy vì người thụ hưởng đi loại `DRAFT` (`requests/access-request/open-request/open-request.repo.ts:65`).
- **E3:** điều chỉnh ngân sách khóa cycle (5) rồi CC-year của từng CC theo id tăng dần (`BudgetAdjustmentLockService`). Ngoại lệ này khớp bảng; ghi lại chỉ để không ai "sửa" nó.

## 5. Thay đổi API và migration (tổng hợp, bàn giao FE/Mobile)

| Mục                 | `operationId`                                                                                                      | Thay đổi                                                                                                                                                                                                             | FE                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| W1-01               | `offboardingCaseOpenRevocations`                                                                                   | Schema giữ; **hành vi đổi**: seat đang có tác vụ thu hồi nay chọn được, `ASSIGNMENT_NOT_AVAILABLE` (422) không còn trả cho ca đó; câu mô tả 422 đổi                                                                  | Bỏ khóa ô chọn seat có tác vụ                |
| W1-03               | `subscriptionUpdate`                                                                                               | 422 `SUBSCRIPTION.VERSION_REQUIRED` khi có `purchasedQuantity` mà thiếu `expectedUpdatedAt`; 409 `SUBSCRIPTION.STALE` giữ; mô tả `expectedUpdatedAt` đổi                                                             | Luôn gửi `expectedUpdatedAt` khi sửa số seat |
| W1-12               | `subscriptionRenewalPropose`, `subscriptionRenewalRecordOutcome`                                                   | 403 `SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE`                                                                                                                                                                           | Ẩn/khóa nút với IT không phụ trách           |
| W1-13               | `ghostSeatEscalationCreate`                                                                                        | `reason` của mục `SKIPPED` thêm `NOT_IN_CHARGE`                                                                                                                                                                      | Hiện lý do                                   |
| W1-14               | `subscriptionUpdate`                                                                                               | field `quantityChangeReason` (string, trim, 1–500, tùy chọn; bắt buộc khi tăng `ACTIVE` `K2`; bỏ qua khi không tăng); 409 `SUBSCRIPTION.MID_TERM_REDUCTION_NOT_ALLOWED`; 422 `SUBSCRIPTION.QUANTITY_REASON_REQUIRED` | Form số seat                                 |
| W1-16               | `spendBatchDecide`                                                                                                 | `outcome` thêm `RETRYABLE`; `reason` thêm `TRANSIENT_FAILURE`, `ALREADY_DECIDED`                                                                                                                                     | Nút thử lại                                  |
| W1-19               | `subscriptionCreate`, `subscriptionComplete`, `subscriptionUpdate`                                                 | 422 `SUBSCRIPTION.VENDOR_ADMINS_REQUIRED` **đổi nghĩa**: đếm IT Admin còn làm việc; pha khởi tạo không chặn (chỉ cờ)                                                                                                 | Câu lỗi                                      |
| W1-20               | `budgetVersionSend`                                                                                                | 409 `BUDGET_CYCLE.NOT_LOCKED`                                                                                                                                                                                        | Ẩn nút trước hạn nộp                         |
| W1-22               | `budgetCycleCreate`, `budgetCycleUpdate`                                                                           | 422 `BUDGET_CYCLE.RESERVE_OVER_CEILING`                                                                                                                                                                              | Kiểm form                                    |
| W1-23               | `notificationList` (mã `BUDGET_NEXT_YEAR_MISSING`)                                                                 | params dòng mới `{ year, costCenterCount }`, `subject` null; dòng cũ vẫn `{ costCenterId, year }`                                                                                                                    | Text hai dạng                                |
| W1-24               | `provisioningTaskGrant`                                                                                            | 422 `LICENSE_ASSIGNMENT.OVERLAP` thêm `details` (`conflictingAssignmentId`, `revocationTaskId`, `revocationStatus`); ca chỉ `TRANSFER` `QUEUED` nay 200                                                              | Dẫn IT tới tác vụ đang chặn                  |
| W1-25               | **mới** `departmentTransferRevocationReopen` (`POST /department-transfers/{id}/revocations`, IT Admin, không body) | 200 `{ created, reasonAdded }`; 404; 409 `DEPARTMENT_TRANSFER.REVOCATION_NOT_DUE`, `DEPARTMENT_TRANSFER.NOTHING_TO_REVOKE`; 401/403/503 chung                                                                        | Nút "mở lại thu hồi"                         |
| W1-25               | `itAdminDashboardGet`, `superAdminDashboardGet`                                                                    | field `revocationFailed` (số nguyên ≥ 0) ở phần điều chuyển                                                                                                                                                          | Thẻ số                                       |
| W1-26               | `meDepartureNoticeGet`                                                                                             | field `offboardingCaseId` (uuid)                                                                                                                                                                                     | Nối nút bàn giao                             |
| W1-27               | `purchaseInvoiceSubmit`, `purchaseInvoiceResubmit`, `purchaseInvoiceConfirm`                                       | 409 `PURCHASE_INVOICE.NUMBER_TAKEN` nay trả cả khi số khác hoa/thường, khoảng trắng                                                                                                                                  | Câu lỗi                                      |
| W1-11, W1-18, W1-21 | (màn ngân sách), `ghostSeatKpi5Get`, `notificationList`                                                            | Schema giữ, **số đổi**: khoản 01/01 _Dùng lâu dài_; `KPI-5`; thêm thông báo ngưỡng ở CC nguồn                                                                                                                        | Người viết kịch bản demo cần biết            |

- Không đổi contract: W1-02, W1-04 → W1-10, W1-15, W1-17 (dùng lại `REQUESTER_IS_HEAD`).
- **Tổng:** 20 operation đổi schema, mã lỗi hoặc hành vi (19 có sẵn + 1 mới); ngoài ra `ghostSeatKpi5Get` và các màn ngân sách chỉ đổi số.
- **Migration:** chỉ W1-27. Không migration phá dữ liệu, không `ALTER TYPE … ADD VALUE`.
- **Mô tả OpenAPI:** không chứa mã nội bộ: `QĐ-`, `FR-`, `US-`, `KHO-`, `SBF-`, `MF-`, `BR-`, `O3`, `W1-`, mã finding kiểu `H-6`, `G-15`, `G-16`, `D-35`. (`openapi.json` có sẵn một `SBF-20` từ trước, không thuộc đợt này: không thêm, không tự xóa.)
- **Mỗi gói đổi contract** cập nhật `openapi.json`, `test/support/openapi-example-manifest.ts`, `openapi-example-route-codes-*.ts`, `test/support/api-coverage-manifest.ts` (operation mới). Gói cuối sinh lại `docs/generated/routes.md`.

## 6. Ma trận test

| Mục      | U (máy, đỏ trước)                                    | H (CI)                | I (CI)                                                    |
| -------- | ---------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| W1-01    | `offboarding.policy.spec.ts`                         | —                     | thu hồi nghỉ việc + `K1` có tác vụ `RETURN`               |
| W1-02    | spec các service/repo đã sửa (facade nhận đúng `tx`) | —                     | —                                                         |
| W1-03    | `subscription.policy.spec.ts`                        | PATCH thiếu version   | `addSeat` + PATCH cũ ⟹ 409                                |
| W1-04    | —                                                    | —                     | cấp ‖ đổi primary, lặp N                                  |
| W1-05/06 | `seat-month.service.spec.ts`                         | —                     | barrier trước `lockMonthOf`; seat-tháng ‖ duyệt phiên bản |
| W1-07    | `profile-purge.service.spec.ts` (mới)                | —                     | —                                                         |
| W1-08    | —                                                    | —                     | cấp ‖ mốc chặn                                            |
| W1-09    | —                                                    | —                     | hai lô `G2` chéo; thứ tự `outcomes`                       |
| W1-11    | `year-start-commitments.policy.spec.ts`              | —                     | lượt 01/01 có Request _Dùng lâu dài_, năm 1 và năm 2      |
| W1-12    | policy quyền ghi                                     | 403 example           | IT khác / người phụ trách bị khóa                         |
| W1-13    | `escalation.policy.spec.ts`                          | enum                  | IT khác / bị khóa / phòng không IT                        |
| W1-14    | `subscription.policy.spec.ts`                        | 422                   | 409 / 200                                                 |
| W1-15    | `email-templates.mapper.spec.ts` + spec 5 service    | —                     | —                                                         |
| W1-16    | `spend-batch-decision.service.spec.ts`               | enum                  | gửi lại lô                                                |
| W1-17    | `reassignment.policy.spec.ts`                        | —                     | (a)–(i)                                                   |
| W1-18    | `ghost-seat-state.policy.spec.ts`                    | —                     | (FIX-TEST nếu số cũ)                                      |
| W1-19    | `subscription-pool.policy.spec.ts`                   | —                     | pha mở / đóng                                             |
| W1-20    | `cycle.policy.spec.ts`, `budget.steps.spec.ts`       | 409                   | trước / sau hạn nộp + harness                             |
| W1-21    | `threshold.policy.spec.ts`                           | —                     | _Chuyển_ / _Trả lại_                                      |
| W1-22    | `cycle.policy.spec.ts`                               | 422                   | POST / PUT                                                |
| W1-23    | job spec + spec text                                 | inbox                 | 3 CC × 2 người                                            |
| W1-24    | `provisioning-grant.policy.spec.ts`                  | —                     | `transfer-grace-regrant` + đồng thời                      |
| W1-25    | `transfer-sweep.policy.spec.ts`                      | dashboard + route mới | quét lại + dashboard + route                              |
| W1-26    | —                                                    | —                     | `role-duties`                                             |
| W1-27    | —                                                    | —                     | số khác hoa/thường, khoảng trắng; `RETURNED`              |

**Test cũ khẳng định hành vi cũ:**

- Spec unit đi cùng luật (kể cả spec của seed step) thì sửa ngay trong gói.
- Http/integration/flow không chạy được ở máy ⟹ ghi vào `docs/reviews/redesign-w1-2026-11-22/FIX-TEST.md` (file, ca, lý do), sửa một lần ở gói cuối, sau khi CI chỉ ra.

## 7. Rủi ro

| #   | Rủi ro                                                                                                             | Giảm thiểu                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-1 | W1-17 chạm định tuyến bước, hàng đợi trình, xác nhận dự phòng: dễ để Request treo ở trạng thái lạ                  | Dùng lại `endNeedStepNotRequired` + `finishConversion`; làm cuối, hai gói; mỗi dòng (a)–(i) một test I; dừng hỏi khi gặp trạng thái chưa có trong bảng |
| R-2 | W1-20 làm hỏng nhiều test ngân sách (harness và seed gửi khi kỳ `OPEN`)                                            | Sửa harness và seed trong gói; ca còn lại ghi FIX-TEST                                                                                                 |
| R-3 | W1-01: tác vụ `K1` cũ đã tick vài bước theo biến thể `STILL_EMPLOYED`; thêm lý do nghỉ việc đổi bộ bước giữa chừng | Ghi test: tác vụ đã tick `RENEWAL_DISABLED` vẫn hoàn tất được khi đủ bước của biến thể `DEPARTURE`. Không khớp thì dừng hỏi                            |
| R-4 | W1-27: migration dừng trên DB demo đang có số trùng sau chuẩn hóa                                                  | Khối kiểm trùng đứng đầu, index cũ chỉ bỏ ở cuối; Owner chạy câu `SELECT` của W1-27 trên DB demo trước deploy                                          |
| R-5 | Đổi contract (20 operation) khi FE đang nối                                                                        | Mục 5 là danh sách bàn giao API description; một lần regenerate client sau đợt                                                                         |
| R-6 | Deadlock test (W1-04/06/08/09/24) chập chờn trên CI                                                                | Barrier tường minh (advisory/`pg_sleep` có điều kiện), lặp N = 20, không dựa vào timing tự do                                                          |
| R-7 | W1-15 đọc organization trong 5 luồng gửi mail                                                                      | Đọc trong tx đã có; mapper có mặc định nên dòng outbox cũ vẫn đúng                                                                                     |
| R-8 | Seed đi qua API vướng luật mới (W1-03, W1-12, W1-19, W1-20); bộ kiểm nhanh không bắt được vì không có DB           | Sửa seed trong đúng gói của luật (PLAN), cập nhật spec unit của seed step; không nới luật cho seed; không chạy seed ở máy                              |
| R-9 | File sắp sửa đã sát trần 500 dòng (`eslint.config.mjs`, `max-lines`)                                               | PLAN liệt kê; vượt thì tách file theo chức năng, không thêm suppression                                                                                |

## 8. Ranh giới cho người code

- **Luôn:**
  - test đỏ trước cho luật mới;
  - một commit mỗi gói;
  - bộ kiểm nhanh xanh trước commit;
  - cập nhật `PROGRESS-<làn>.md` sau mỗi gói (hai làn, xem PLAN);
  - comment trong `src` nói lý do, không nói mã finding.
- **Hỏi trước (dừng):**
  - luật không rõ hoặc hai nguồn mâu thuẫn;
  - migration phá dữ liệu hoặc không hoàn tác được ngoài mục đã ghi; cần sửa `prisma/models`;
  - cần cạnh module mới hoặc extension point mới;
  - thêm dependency.
- **Không bao giờ:**
  - merge `dev`/`main`, deploy, push khi chưa được bảo;
  - chạy full http/integration/e2e, seed hay migration ở máy;
  - sửa migration đã merge;
  - tắt gate hay suppress lint mới.

## 9. Đã chốt

Owner trả lời 22/11 (DECISIONS mục _SPEC đợt 1 — câu hỏi Owner 22/11_). Không còn câu hỏi mở chặn việc code.

| Mã    | Quyết định                                                                                                                                                                     | Áp ở                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| W1-Q1 | Thứ tự khóa chuẩn **tác vụ → Request** (như code); sửa chữ O3; ghi vào rule BE; không đổi code. Kèm luật vòng lặp nhiều seat (sắp theo id)                                     | Mục 4; W1-10; W1-01, W1-09, W1-25 |
| W1-Q2 | `PATCH` thuê bao có `purchasedQuantity` ⟹ bắt buộc `expectedUpdatedAt` (thiếu ⟹ 422, sai ⟹ 409); sửa O3-Q1 riêng cho ô này                                                     | W1-03                             |
| W1-Q3 | Dòng của người vừa thành trưởng phòng trong Request nhóm: đợt 1 không đổi nghiệp vụ, chỉ thêm test lối ra (người gửi rút dòng); tách dòng ở đợt 7                              | W1-17 dòng (i); mục 2.2           |
| W1-Q4 | Unique biểu thức chỉ ở `purchase_invoices`; `invoices` chỉ đổi câu kiểm tồn tại; migration kiểm trùng trước, gặp trùng thì dừng; Owner chạy `SELECT` trên DB demo trước deploy | W1-27                             |
| W1-Q5 | Route IT Admin mở lại tác vụ thu hồi của điều chuyển đã đóng thất bại + cờ dashboard; lượt quét thôi tự mở lại                                                                 | W1-25                             |
| W1-Q6 | Khoản 01/01 của quyền _Dùng lâu dài_ từ năm thứ hai trở đi vẫn = 12 × giá tháng lúc duyệt (`QĐ-114w`, `QĐ-117h`)                                                               | W1-11                             |
| G-15  | Giữ 422 khi tác vụ còn lý do khác ngoài `TRANSFER`; `FAILED` cũng giữ chặn; `details` chỉ tác vụ đang chặn (không cần hỏi Owner — đúng `QĐ-114ak`(1), `QĐ-64a`)                | W1-24                             |

**Còn chờ Owner (không chặn code):** đợt nhận `KPI-2` và B1A-05/B-N2 (mục 2.2, đang ghi "đề xuất").

# Spec: gia hạn subscription — đề xuất của IT Admin và quyết định của Người duyệt chi

- Phụ trách: AI theo giao việc A-06 của người dùng (31/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc A-06 của người dùng (31/10/2026).
- Thiết kế: `ready`. Triển khai: `verified` (local, worktree cô lập tại `6eb12d1`, chưa commit, 31/10/2026). Owner review: chưa review.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `EP-11`, `MF-4` v4.0), BE `6eb12d1`.
- Nhóm roadmap: G8 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Scope map G8 (phần EP-11): [roadmap](../../../roadmap.md#work-item-decomposition-g8).

## Business outcome

IT Admin lập đề xuất gia hạn nguyên/giảm/hủy cho một kỳ subscription có thời hạn (kèm ý kiến Business Owner), mục đó vào
hàng đợi của Người duyệt chi; chỉ Người duyệt chi (hoặc người thay thế khi xung đột) quyết, quyết định được ghi một lần cùng
snapshot, điểm thực hiện và các ghế phải thu hồi do chính người quyết chọn, mở tác vụ thu hồi qua cổng chung, không tạo khoản
cam kết ngân sách. Kiểm bằng `POST /subscription-renewals` → `POST /subscription-renewals/{id}/decision` trên PostgreSQL thật.

## Sizing decision

- Container: G8 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: một hồ sơ gia hạn đi từ đề xuất tới quyết định; capability `licensing/subscription-renewal` (nhóm
  `proposal/`, `decision/`), đọc kỳ subscription qua `SubscriptionPeriodApi` của catalog.
- Boundaries: bảng `subscription_renewals`, `subscription_renewal_released_seats`; route `POST /subscription-renewals`,
  `POST /subscription-renewals/{id}/decision`, `GET /subscription-renewals`, `GET /subscription-renewals/{id}`,
  `GET /subscription-renewals/{id}/seat-ranking`; một transaction mỗi thao tác (khóa case `FOR UPDATE`); quyền IT Admin /
  Người duyệt chi / người thay thế.
- Not larger: kết quả thực hiện và kỳ nối chuỗi (`a06-renewal-execution-chain`), mốc cảnh báo (`a06-renewal-milestone-alerts`),
  sự cố tự gia hạn (`a06-renewal-deadline-incident`) có test và transaction riêng; số liệu ngân sách và hỏi Finance chờ đầu vào.
- Not smaller: đề xuất của `US-11-05` là điều kiện duy nhất để có mục quyết của `US-11-02` (AC-18, AC-17) và cùng một bản ghi;
  tách hai Story sẽ lặp bảng, quyền và test hàng đợi.
- Siblings: `a06-renewal-milestone-alerts`, `a06-renewal-execution-chain`, `a06-renewal-deadline-incident`,
  `a06-renewal-usage-evidence`, `a06-renewal-open-inputs`.
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Primary Story/AC

| Story    | AC                                                      | Coverage | Phần còn lại thuộc                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-11-02 | AC-1→AC-6, AC-9, AC-10, AC-13→AC-15, AC-17→AC-20, AC-22 | partial  | vế số liệu ngân sách của AC-4, AC-5, vế dự báo `L1` của AC-9, vế hỏi–đáp Finance của AC-14, AC-7, AC-11, AC-12, AC-16, AC-21: `a06-renewal-open-inputs`; vế `G3`/`G4` và hoạt động cuối của AC-20: `a06-renewal-usage-evidence` |
| US-11-05 | AC-1→AC-8, AC-15, AC-17                                 | partial  | vế checklist ngay trong hồ sơ của AC-2: `a06-renewal-open-inputs`; vế số liệu sử dụng của AC-4: `a06-renewal-usage-evidence`; AC-9→AC-14: `a06-renewal-execution-chain`; AC-16, AC-18: `a06-renewal-open-inputs`                |

## Supporting references

`FR-1.3`, `FR-1.4`, `FR-3.13`, `FR-3.15`, `FR-4.15`, `FR-5.8`, `SoD-2`, `SoD-3`, `SoD-5`, `SoD-7`, `QĐ-22`, `QĐ-49c`,
`QĐ-62k`, `QĐ-62s`, `QĐ-66x`, `QĐ-88a`, `QĐ-89a`, `QĐ-89d`, `MF-4` (`a_prop`, `s_snap`, `a_dec`, `d_dec`, `d_late`, `d_fin`);
`DEV-A.md` A-06, `DEV-B.md` B-07 (hợp đồng chi phí).

## Explicit out of scope

- Ghi kết quả, tạo kỳ mới, chuyển Assignment, tiết kiệm, cờ thực hiện trễ: `a06-renewal-execution-chain`.
- Số liệu ngân sách thật của snapshot (ngân sách, thực chi, cam kết, còn lại, Request đang chờ, chi phí thực chịu kỳ gia hạn):
  module sở hữu ngân sách/chi phí (B) thêm reader vào `RenewalFinancialContributions`; ở đây snapshot đóng băng ghi
  `NOT_CONNECTED` thay vì 0 (`a06-renewal-open-inputs`).
- Hỏi–đáp Finance và nhắc SLA của bước quyết gia hạn (AC-7, AC-11), chứng từ `BM-05` của hồ sơ (AC-16), phương án nhiều kỳ
  thanh toán (AC-21), kiểm Mobile (AC-12): `a06-renewal-open-inputs`.
- Thuật toán ghost/usage, khuyến nghị `G1`/`G3`/`G4`: G7 của Owner; ở đây chỉ có điểm mở `RenewalUsageContributions`.
- Gia hạn quyền cá nhân (`US-05-14`, `requests/renewal-request`): khác hẳn, không đụng.

## Dependencies and blockers

Migration `20261101000000` (giá trị enum riêng), `20261101000100` (chuỗi kỳ ở catalog), `20261101000200` (bảng gia hạn) đi trước
code. Phụ thuộc `RevocationService` (`g6-revocation-by-grant-kind`), bảng người xác nhận bàn giao (`g6-handover-confirmation`),
`IdentityAccessApi.getApprovalRoleHolders`, `OrganizationApi.getItAdminInChargeOfDepartment` (method `a03-license-inbox-alerts` đã thêm; tích hợp 31/10/2026), catalog
`SubscriptionPeriodApi` (thêm mới). Blocker không chặn: `OQ-F1-06` (lý do bắt buộc không — mặc định: tùy chọn), `OQ-F1-15` (rút
đề xuất — mặc định: không có route rút, một case mỗi kỳ).

## Ownership: module, data, API

- **licensing `subscription-renewal/`:** `proposal/renewal-proposal.{service,policy}.ts`, `decision/renewal-decision.{service,policy}.ts`,
  `decision/renewal-decision-support.service.ts`, `subscription-renewal-ranking.{policy,service}.ts`, `subscription-renewal-parties.service.ts`,
  `subscription-renewal.repo.ts`, `subscription-renewal-seat.repo.ts`, `subscription-renewal-view.service.ts`, controller, DTO, lỗi.
- **catalog:** `public/subscription-period.{api,types,errors}.ts`, `subscription/subscription-period.service.ts`; cột `renewed_from_id`.
- **Bảng:** `subscription_renewals` (một dòng mỗi kỳ, unique `subscription_id`; trigger `subscription_renewals_guard` đóng băng từng
  giai đoạn), `subscription_renewal_released_seats` (chỉ thêm). Không đọc bảng của module khác.
- **API thêm:** `subscriptionRenewalList`, `subscriptionRenewalGet`, `subscriptionRenewalSeatRanking`, `subscriptionRenewalPropose`
  (`IT_ADMIN`), `subscriptionRenewalDecide` (`@AuthenticatedOnly`, người quyết kiểm trong service).
- **Thông báo:** `SUBSCRIPTION_RENEWAL_PROPOSED` (tới người quyết), `SUBSCRIPTION_RENEWAL_DECIDED` (tới IT Admin đề xuất và IT
  Admin phụ trách phòng sở hữu). **Audit:** `SUBSCRIPTION_RENEWAL.PROPOSED`, `SUBSCRIPTION_RENEWAL.DECIDED` (kèm snapshot, điểm thực
  hiện, ghế chọn, `budgetCommitment: null`).

## Behavior and design

**Đề xuất (`US-11-05`).** Chỉ `IT_ADMIN`. Kỳ phải là TERM, ACTIVE, chưa có kỳ nối tiếp, không phải phần mềm nội bộ
(`NOT_RENEWABLE` 409); có mốc (hạn chót đã ghi / suy ra / theo ngày kết thúc) — thiếu thì `CONTRACT_DATA_INCOMPLETE` 409, không
đoán (AC-1). `REDUCE` cần số mới nhỏ hơn số đã mua; `RENEW`/`CANCEL` không có số (`QUANTITY_INVALID` 422). Ý kiến Business Owner do
IT Admin ghi, không thêm bước (AC-3). Một case mỗi kỳ: `INSERT … ON CONFLICT DO NOTHING` → `ALREADY_PROPOSED` 409, cả khi hai đề
xuất chạy đồng thời. Hồ sơ hiện `usage.status = NOT_AVAILABLE` khi chưa có nguồn usage (AC-4, không hiện 0) và số ghế đang dùng.

**Hàng đợi.** `GET /subscription-renewals?state=PROPOSED` là hàng đợi của người quyết; kỳ chưa có đề xuất không có mục (AC-18,
`US-11-05` AC-17). Đọc: `IT_ADMIN`, `FINANCE`, `SPENDING_APPROVER` hoặc người đang giữ vai thay thế; trưởng phòng/Employee
`READ_FORBIDDEN` 403 (`SoD-2`). Thứ tự `notice_base_date, id`; phân trang ≤ 100.

**Quyết định (`US-11-02`).** Khóa case `FOR UPDATE`. Người quyết = Người duyệt chi, hoặc người thay thế khi Người duyệt chi là
người đề xuất (`FR-3.15`); người khác, kể cả IT Admin đề xuất, `NOT_DECIDER` 403 (AC-6, `SoD-3`); case không còn chờ
`NOT_AWAITING_DECISION` 409. Kiểm lựa chọn: `REDUCE` < số mua, `withinCurrentTerm` chỉ cho `REDUCE` của kỳ cho giảm giữa kỳ
(`MID_TERM_NOT_ALLOWED`). Phòng sở hữu chưa có Cost Center đang dùng: chặn `RENEW` và `REDUCE` > 0 sang kỳ mới bằng
`FINANCE.SETUP_INCOMPLETE` 409; `CANCEL`, giảm về 0, giảm trong kỳ đang trả lưu được (AC-22). Hủy khi còn ghế đang dùng cần
`acknowledgeActiveUsers` (409 `ACTIVE_USERS_NOT_ACKNOWLEDGED`, `details.seatsInUse`, AC-2). Giảm dưới số ghế đang dùng cần đúng
`số đang dùng − số mới` ghế, khác nhau, lấy từ danh sách xếp sẵn (`EXCESS_SELECTION_INVALID` 422, `details.required/selected`, AC-13,
AC-20); hệ thống không tự chọn. Danh sách xếp (`QĐ-66x`): đã có tác vụ thu hồi sống → người giữ đã nghỉ (`G2`) → `G3`/`G4` (chỉ
khi có nguồn usage) → hoạt động cuối cũ nhất; chưa có usage thì phần còn lại theo ghế cũ nhất, ghi rõ `NOT_AVAILABLE`.
Điểm thực hiện (`QĐ-62k`(i)): quyết trong/đúng mốc → `AS_PLANNED`; sau mốc → `MID_TERM` nếu kỳ cho giảm giữa kỳ, ngược lại
`NEXT_RENEWAL`, không hủy quyết định (AC-10, AC-19). Ghi một lần: lựa chọn, số, lý do (tùy chọn — `OQ-F1-06`), người, vai tại
thời điểm, thời điểm, ngày, sau/trước mốc, ghế đang dùng, snapshot đóng băng (AC-14). Mở thu hồi qua `RevocationService.open`
trong cùng transaction: `CANCEL` → mọi ghế cá nhân đang dùng (`SUBSCRIPTION_CANCELLATION`), `REDUCE` → ghế đã chọn
(`SUBSCRIPTION_REDUCTION`), tham chiếu `SUBSCRIPTION_RENEWAL` + id case. Không ghi gì vào ngân sách (`QĐ-62s`, AC-9), không tạo kỳ
mới (AC-1), không ghi tiết kiệm (AC-3). Người quyết không có route thu hồi/ghi kết quả (route `IT_ADMIN`, AC-17).

**Snapshot (AC-4, AC-5 — một phần).** `RenewalFinancialContributions` (licensing mở, Contributions 0..n): không ai thêm → snapshot
`{ source: NOT_CONNECTED, takenAt }`; có reader → `{ source: CONNECTED, financial: { status BUDGET | NO_BUDGET | NO_COST_CENTER,
costCenterId, fiscalYear, currency, budget, spent, committed, remaining, pendingRequests, periodEffectiveCost, periodDeductibleTax,
asOf } }` với số là chuỗi thập phân, thiếu là `null`, không bao giờ 0 giả. Lấy trước transaction và đóng băng trong cột JSONB.

**Khóa và thứ tự.** Quyết định: case → (đọc kỳ, đọc ghế không khóa) → tác vụ → Assignment (thứ tự của cổng thu hồi); không khóa
subscription trong quyết định để không đảo thứ tự tác vụ → subscription → Assignment của IT Admin hoàn tất thu hồi.

**Quyết định thiết kế do người phụ trách chọn (chưa phải Owner):** đặt gia hạn ở `licensing` (đọc/ghi ghế, thu hồi) với kỳ do
catalog giữ; một case mỗi kỳ, không route rút đề xuất; lý do tùy chọn; người thay thế quyết khi Người duyệt chi là người đề xuất;
ghế đã có thu hồi sống (mọi nguồn) xếp nhóm đầu; chỉ ghế cá nhân được chọn (tài khoản dịch vụ đi luồng riêng); K4 bị cổng thu
hồi từ chối như hiện hành.

## Test matrix

| AC / rủi ro                        | Tình huống (gồm từ chối, edge case)                                              | Cấp test                  | Kết quả mong đợi                                                                | Bằng chứng sau implement                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| US-11-05 AC-1, AC-15               | kỳ thiếu mốc tự gia hạn; draft; mua đứt                                          | unit + integration        | 409 `CONTRACT_DATA_INCOMPLETE` / `NOT_RENEWABLE`, không case                    | `renewal-proposal.policy.spec`, `subscription-renewal-decision` (2), sweep (mua đứt) |
| US-11-05 AC-3, AC-5, AC-6          | đề xuất giảm có ý kiến BO; hủy còn ghế                                           | integration               | case PROPOSED, ý kiến lưu, ghế đang dùng hiện, người quyết được báo             | `subscription-renewal-decision` (1)                                                  |
| US-11-05 AC-7, AC-8, US-11-02 AC-6 | IT Admin, Finance, Employee, trưởng phòng quyết; Người duyệt chi/Finance đề xuất | unit + HTTP + integration | 403 `NOT_DECIDER` / `AUTHORIZATION.FORBIDDEN`, không ghi                        | `renewal-decision.policy.spec`, `subscription-renewals.http-spec`, decision (3, 5)   |
| US-11-02 AC-18, US-11-05 AC-17     | hàng đợi chỉ có kỳ đã đề xuất; trưởng phòng/Employee đọc                         | integration               | hàng đợi đúng case; 403 `READ_FORBIDDEN`                                        | decision (1, 3)                                                                      |
| US-11-02 AC-3, AC-9, AC-14         | quyết gia hạn; đếm `budget_commitments`; sửa quyết định bằng SQL                 | integration               | quyết định + snapshot `NOT_CONNECTED`; không cam kết mới; trigger từ chối sửa   | decision (5)                                                                         |
| US-11-02 AC-2                      | hủy còn 2 ghế không xác nhận rồi xác nhận                                        | integration               | 409 kèm `seatsInUse: 2`; sau xác nhận 2 thu hồi `SUBSCRIPTION_CANCELLATION`     | decision (6)                                                                         |
| US-11-02 AC-13, AC-20              | giảm 3 → 1, người giữ một ghế đã nghỉ; chọn 1 ghế; chọn 2 ghế                    | unit + integration        | xếp `HOLDER_LEFT` đầu; 422 `required 2, selected 1`; đúng 2 thu hồi `REDUCTION` | `subscription-renewal-ranking.policy.spec`, decision (7)                             |
| US-11-02 AC-22                     | phòng không Cost Center: gia hạn, giảm 10→8, giảm về 0, hủy                      | unit + integration        | 409 `FINANCE.SETUP_INCOMPLETE` cho hai cái đầu; hai cái sau lưu                 | policy spec, decision (8)                                                            |
| US-11-02 AC-10, AC-19              | quyết hủy sau mốc, kỳ năm / kỳ cho giảm giữa kỳ                                  | unit + integration        | `NEXT_RENEWAL` / `MID_TERM`, `decidedAfterDeadline`                             | policy spec, decision (9)                                                            |
| `FR-3.15`                          | Người duyệt chi là người đề xuất                                                 | integration               | người đó 403, người thay thế quyết `CONFLICT_SUBSTITUTE`                        | decision (10)                                                                        |
| Đồng thời                          | hai đề xuất cùng kỳ chạy song song                                               | integration               | 201 + 409, một case                                                             | decision (4)                                                                         |
| HTTP                               | 401, 403 theo vai, 422 validation, ánh xạ mã lỗi                                 | HTTP contract             | đúng mã ổn định                                                                 | `subscription-renewals.http-spec` (34 ca)                                            |

## Definition of Done

- [x] Mọi primary AC `full` có test ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo CONTRIBUTING chạy trên revision cuối của worktree cô lập tại `6eb12d1` (chạy lại trên cây tích hợp; xem plan; `openapi-export` spawn lỗi do môi trường).
- [x] Spec/plan/roadmap phản ánh implementation cuối — scope map G8 (EP-11) đã có trong `docs/roadmap.md`.
- [x] Không tăng legacy ledger kiến trúc.
- [x] Module card licensing/catalog/organization cập nhật.

## Changes and acceptance

31/10/2026: thiết kế và implementation trong worktree cô lập tại `6eb12d1` (BE `6eb12d1`), chưa commit, chưa Owner review, chưa nghiệm thu.

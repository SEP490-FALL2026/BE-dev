# Spec: gia hạn subscription — mốc báo hủy T−15/T−7 và cảnh báo chất lượng dữ liệu hợp đồng

- Phụ trách: AI theo giao việc A-06 của người dùng (31/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc A-06 của người dùng (31/10/2026).
- Thiết kế: `ready`. Triển khai: `verified` (local, worktree cô lập tại `6eb12d1`, chưa commit, 31/10/2026). Owner review: chưa review.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `US-11-01`, `MF-4` `s_check`, `d_known`, `s_dq`, `s_endd`, `t_alert`, `s_notify`), BE `6eb12d1`.
- Nhóm roadmap: G8 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Business outcome

Mỗi giờ tác vụ nền xét các kỳ subscription có thời hạn: tới T−15 (theo tham số `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`) của hạn chót
báo hủy — hoặc ngày kết thúc khi không có hạn chót, không báo trước, không tự gia hạn — IT Admin phụ trách phòng sở hữu, Finance,
Business Owner còn làm việc và Người duyệt chi nhận đúng một cảnh báo trong hộp thông báo; T−7 thêm Super Admin và bị bỏ khi cả
quyết định lẫn kết quả đã ghi; kỳ thiếu dữ liệu mốc chỉ cho IT Admin cảnh báo chất lượng dữ liệu, không đoán mốc. Kiểm bằng
`SubscriptionRenewalSweepService.sweep(now)` trên PostgreSQL thật.

## Sizing decision

- Container: G8 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: cảnh báo đúng mốc, đúng người, một lần; capability `licensing/subscription-renewal` nhóm `alerts/` và
  `subscription-renewal-sweep.service.ts`, `subscription-renewal.job.ts`.
- Boundaries: không bảng mới (idempotency là unique `(recipient, event_key)` của `in_app_notifications`); một transaction mỗi kỳ
  (thông báo + audit `SUBSCRIPTION_RENEWAL.ALERT_SENT`); không route mới.
- Not larger: cờ thực hiện trễ và sự cố cùng chạy trong pass nhưng là AC của Story khác (`a06-renewal-execution-chain`,
  `a06-renewal-deadline-incident`).
- Not smaller: chọn mốc, người nhận và bỏ T−7 dùng chung một lần đọc kỳ và một bảng chọn mốc (`deriveNotice`).
- Siblings: `a06-renewal-proposal-decision`, `a06-renewal-usage-evidence`, `a06-renewal-open-inputs`.
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Primary Story/AC

| Story    | AC         | Coverage | Phần còn lại thuộc                                                                                                        |
| -------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| US-11-01 | AC-1→AC-14 | partial  | vế khuyến nghị `G1`/`G3`/`G4` của AC-3: `a06-renewal-usage-evidence`; vế thư điện tử của AC-12: `a06-renewal-open-inputs` |

## Supporting references

`FR-1.3`, `FR-1.4`, `FR-1.7`, `FR-3.11`, `BR-06.7`, `QĐ-49c`, `QĐ-62l`, `QĐ-62t`, `QĐ-61c` (không push), `OQ-B-07`, `OQ-F1-01`
(đóng theo `QĐ-89a`: IT Admin phụ trách phòng sở hữu), `OQ-F1-02` (mốc đã qua khi khai báo muộn — không chặn).

## Explicit out of scope

- Khuyến nghị lãng phí và tiết kiệm ước tính kèm cảnh báo (AC-3): G7; cảnh báo chỉ mang `usageData` `NOT_AVAILABLE`/`AVAILABLE`.
- Thư điện tử (AC-12): `notifications` chỉ có mẫu thư tài khoản và chưa có cấu hình bật/tắt cho cảnh báo — `a06-renewal-open-inputs`.
- Cảnh báo chỉ định Business Owner thay thế ở `US-04-06`: ở đây chỉ phát `SUBSCRIPTION_BUSINESS_OWNER_LEFT` cho IT Admin.

## Dependencies and blockers

`a06-renewal-proposal-decision` (bảng case, để biết đã quyết/đã ghi kết quả), catalog `SubscriptionPeriodApi.listRenewalSubjects`
(cùng quy tắc `deriveNotice` và SQL `listTermsWithMilestoneBetween`), tham số `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE` (`US-01-04`).

## Ownership: module, data, API

licensing `subscription-renewal/alerts/renewal-alerts.{service,policy}.ts`, `subscription-renewal-sweep.service.ts`,
`subscription-renewal.job.ts`, `subscription-renewal-parties.service.ts`, `subscription-renewal-notifier.service.ts`. Mã thông báo
mới ở bảng đóng của `notifications`: `SUBSCRIPTION_RENEWAL_ALERT`, `SUBSCRIPTION_RENEWAL_DATA_QUALITY`,
`SUBSCRIPTION_BUSINESS_OWNER_LEFT` (khóa tham số trong `inbox.policy.ts`, không số tiền). Audit
`SUBSCRIPTION_RENEWAL.ALERT_SENT`, `SUBSCRIPTION_RENEWAL.DATA_QUALITY_WARNED` (actor `SYSTEM`).

## Behavior and design

**Mốc.** Các số ngày của tham số (1–5 giá trị) sắp giảm dần; mốc `d` đến hạn từ `base − d` tới trước mốc sau, mốc cuối tới hết
ngày `base`. Pass lỡ ngày vẫn gửi trong cửa sổ của mốc; mốc cũ không gửi khi mốc sau đã tới; sau `base` không gửi gì (AC-2: không
tính từ ngày gia hạn). `base` là hạn chót đã ghi (`DECLARED`), suy ra (`INFERRED_UNCONFIRMED`, AC-4) hoặc ngày kết thúc
(`BY_END_DATE`, AC-5) theo `deriveNotice`; tham số đổi thì mốc đổi (AC-7). **Mặc định cho `OQ-F1-02` (chưa có quyết định):** kỳ
khai báo muộn chỉ nhận mốc đang trong cửa sổ, không gửi bù mốc đã qua.

**Người nhận (AC-1, AC-10, AC-11).** IT Admin phụ trách phòng sở hữu (`getItAdminInChargeOfDepartment`, không có thì IT Admin dùng được
đầu tiên), Finance dùng được, Business Owner còn làm việc (`renewalAlertRecipient`), Người duyệt chi; mốc cuối thêm Super Admin.
Một người giữ hai vai nhận một lần. Trưởng phòng và Employee không bao giờ ở danh sách. Business Owner đã nghỉ → bỏ, IT Admin
nhận `SUBSCRIPTION_BUSINESS_OWNER_LEFT` một lần mỗi mốc.

**Bỏ T−7 (AC-8, `QĐ-62t`).** Chỉ khi case của kỳ có cả quyết định lẫn kết quả; đã quyết chưa ghi kết quả vẫn gửi; T−15 luôn gửi.

**Chất lượng dữ liệu (AC-6, AC-14).** Kỳ TERM ACTIVE có nguồn `MISSING` (thiếu hạn chót và báo trước mà tự gia hạn, hoặc thiếu
cả bốn dữ liệu) → chỉ IT Admin nhận `SUBSCRIPTION_RENEWAL_DATA_QUALITY` (`problem = NO_ALERT_ANCHOR`) một lần mỗi kỳ, không có cảnh
báo mốc nào. Mua đứt, nháp và phần mềm nội bộ không bao giờ vào pass (AC-9).

**Idempotency (AC-13).** `event_key = subscription-renewal-alert:<kỳ>:<base>:<số ngày>` một dòng mỗi người nhận; chạy lại cùng
ngày, nhiều instance hay thử lại sau lỗi không thêm thông báo hay audit (audit chỉ ghi khi thông báo mới được ghi).

**Kênh (AC-12).** Hộp thông báo trong ứng dụng (đọc qua `/notifications`, cũng là hộp thông báo của Mobile — không push). Thư
điện tử: chưa làm (xem out of scope).

## Test matrix

| AC / rủi ro        | Tình huống (gồm từ chối, edge case)                     | Cấp test           | Kết quả mong đợi                                                             | Bằng chứng sau implement                                          |
| ------------------ | ------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| AC-1, AC-11, AC-13 | hạn chót +30: quét T−16, T−15 hai lần, T−14, T−7        | integration        | 4 người ở T−15, thêm Super Admin ở T−7, không trưởng phòng/Employee, 9 audit | `subscription-renewal-sweep` (1)                                  |
| AC-2, AC-4         | hạn chót suy ra từ báo trước 30 ngày; quét sau hạn chót | unit + integration | `INFERRED_UNCONFIRMED`, không cảnh báo sau `base`                            | `renewal-alerts.policy.spec`, sweep (2)                           |
| AC-5, AC-7         | theo ngày kết thúc; tham số 30/10                       | unit               | mốc từ ngày kết thúc; mốc theo tham số                                       | `renewal-alerts.policy.spec`, `subscription.policy.spec` (sẵn có) |
| AC-6, AC-14        | tự gia hạn thiếu hạn chót và báo trước, quét hai lần    | integration        | 1 cảnh báo dữ liệu cho IT Admin, 0 cảnh báo mốc                              | sweep (3)                                                         |
| AC-8               | đã quyết + đã ghi kết quả / chỉ đã quyết, quét ở T−7    | unit + integration | bỏ / gửi (kèm Super Admin, `decisionRecorded`)                               | policy spec, sweep (5)                                            |
| AC-9               | mua đứt                                                 | integration        | không cảnh báo, không cảnh báo dữ liệu                                       | sweep (4)                                                         |
| AC-10              | Business Owner đã nghỉ                                  | integration        | không nhận; IT Admin nhận `SUBSCRIPTION_BUSINESS_OWNER_LEFT`                 | sweep (8)                                                         |
| AC-3 (một phần)    | chưa có nguồn usage                                     | integration        | `usageData: NOT_AVAILABLE`, không số 0                                       | sweep (1)                                                         |

## Definition of Done

- [x] AC `full` có test; AC-3, AC-12 ghi đúng vế đã làm.
- [x] Gate chạy trên revision cuối của worktree cô lập tại `6eb12d1` (chạy lại trên cây tích hợp; xem plan của `a06-renewal-proposal-decision`).
- [x] Scope map G8 đã có trong `docs/roadmap.md`.
- [x] Không tăng legacy ledger kiến trúc.
- [x] Module card cập nhật.

## Changes and acceptance

31/10/2026: implementation trong worktree cô lập tại `6eb12d1`, chưa commit, chưa Owner review, chưa nghiệm thu.

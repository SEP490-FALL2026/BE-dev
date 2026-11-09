# Spec: gia hạn subscription — sự cố tự gia hạn và đánh dấu hết hạn khi qua mốc không có quyết định

- Phụ trách: AI theo giao việc A-06 của người dùng (31/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc A-06 của người dùng (31/10/2026).
- Thiết kế: `ready`. Triển khai: `verified` (local, worktree cô lập tại `6eb12d1`, chưa commit, 31/10/2026). Owner review: chưa review.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `US-11-04`, `KPI-4`, `DQ-07`, `MF-4` `d_decided`, `d_auto`, `s_incident`, `s_expire`), BE `6eb12d1`.
- Nhóm roadmap: G8 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Business outcome

Qua mốc (hạn chót báo hủy, hoặc ngày kết thúc theo `QĐ-62l`) mà không có quyết định ghi tới mốc: kỳ tự gia hạn có đúng một sự
cố (đếm `KPI-4`), kỳ không tự gia hạn được đánh dấu sẽ hết hạn — không phải sự cố; IT Admin (và người quyết với sự cố) được báo;
quyết định ghi sau đó không xóa sự kiện; hệ thống không tự gia hạn, hủy hay quyết. Đọc qua `GET /subscription-deadline-events`.

## Sizing decision

- Container: G8 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: một sự kiện mỗi kỳ khi qua mốc không quyết định; capability `licensing/subscription-renewal` nhóm `deadline/`.
- Boundaries: bảng `subscription_deadline_events` (unique theo kỳ, chỉ thêm); một transaction mỗi kỳ; route đọc
  `GET /subscription-deadline-events` (`IT_ADMIN`, `SPENDING_APPROVER`, `SUPER_ADMIN`).
- Not larger: cờ thực hiện trễ (`a06-renewal-execution-chain`), tác vụ thu hồi khi hết hạn và bỏ lý do hết hạn (`QĐ-83b`) chờ đầu vào.
- Not smaller: sự cố và đánh dấu hết hạn là hai nhánh của cùng một điều kiện (`d_auto`), cùng bảng, cùng pass.
- Siblings: `a06-renewal-execution-chain`, `a06-renewal-open-inputs`.
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Primary Story/AC

| Story    | AC                   | Coverage | Phần còn lại thuộc                                                               |
| -------- | -------------------- | -------- | -------------------------------------------------------------------------------- |
| US-11-04 | AC-1→AC-4, AC-6→AC-9 | partial  | vế nhắc và cờ backlog SLA của AC-3; AC-5, AC-10→AC-13: `a06-renewal-open-inputs` |

## Supporting references

`FR-0.1`, `FR-1.4`, `BR-26.3`, `DQ-07`, `KPI-4`, `QĐ-49c`, `QĐ-62k`, `QĐ-62l`, `QĐ-66v`, `QĐ-83b`.

## Explicit out of scope

- AC-5 (thiếu dữ liệu "có bật tự gia hạn hay không"): `subscriptions.auto_renew` là `BOOLEAN NOT NULL DEFAULT false`, không có
  trạng thái "chưa biết" — cần quyết định của Owner/catalog trước khi biểu diễn (`a06-renewal-open-inputs`).
- AC-11 (mở tác vụ thu hồi cho mọi ghế khi đánh dấu hết hạn): cổng thu hồi cần một tài khoản người làm (`created_by_app_user_id`);
  chưa có actor hệ thống cho pass nền — `a06-renewal-open-inputs`. Hiện chỉ đánh dấu, không tự kết thúc quyền nào.
- AC-10, AC-12, AC-13 (ghi kỳ mới sau sự cố khi không có quyết định; bỏ lý do hết hạn khỏi tác vụ đã mở — lý do là bất biến
  hiện hành): `a06-renewal-open-inputs`.
- Hiển thị `KPI-4` trên bảng điều khiển (`US-12-06`): B-08; route ở đây trả danh sách và tổng.

## Dependencies and blockers

`a06-renewal-proposal-decision` (ngày quyết định của case), catalog `listRenewalSubjects`, pass của `a06-renewal-milestone-alerts`.

## Ownership: module, data, API

licensing `deadline/renewal-deadline.{service,policy}.ts`, `subscription-renewal.repo.ts` (`insertDeadlineEvent`, `pageDeadlineEvents`),
route `subscriptionDeadlineEventList`. Thông báo `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT`, `SUBSCRIPTION_EXPIRY_MARKED`. Audit
`SUBSCRIPTION.AUTO_RENEWAL_INCIDENT`, `SUBSCRIPTION.EXPIRY_MARKED` (actor `SYSTEM`).

## Behavior and design

Pass hằng giờ, mỗi kỳ có mốc trong 60 ngày trước hôm nay: hôm nay > mốc, chưa có sự kiện, không có quyết định ghi trước hoặc đúng
ngày mốc → `AUTO_RENEWAL_INCIDENT` nếu `auto_renew`, ngược lại `EXPIRY_MARKED` (CHECK `kind` khớp cờ). `INSERT … ON CONFLICT DO
NOTHING` theo kỳ: chạy lại, nhiều instance, thử lại không nhân đôi (AC-6). Có quyết định tới mốc → không sự kiện kể cả chưa có kết
quả (AC-2, cờ trễ thay thế). Quyết định ghi sau mốc vẫn được nhận, không bị hủy (điểm thực hiện `NEXT_RENEWAL`/`MID_TERM`) và sự
kiện giữ nguyên, bảng cấm sửa/xóa (AC-7). Quá SLA không bao giờ tạo sự kiện: không có đường nào từ SLA tới bảng này (AC-3 vế
`KPI-4`). Mua đứt, nháp, phần mềm nội bộ không vào pass (AC-8). Hệ thống không tạo kỳ, không hủy, không ghi quyết định (AC-9).
Cửa sổ 60 ngày: pass ngừng lâu hơn thì kỳ cũ hơn không được ghi muộn (quyết định thiết kế, chưa phải Owner).

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                  | Cấp test           | Kết quả mong đợi                                        | Bằng chứng sau implement                  |
| ----------- | ---------------------------------------------------- | ------------------ | ------------------------------------------------------- | ----------------------------------------- |
| AC-1, AC-6  | tự gia hạn, mốc −2, quét 3 lần                       | unit + integration | một sự cố, IT Admin + người quyết được báo              | `renewal-deadline.policy.spec`, sweep (7) |
| AC-2        | quyết trước mốc, quét sau mốc                        | unit + integration | không sự kiện                                           | policy spec, sweep (7)                    |
| AC-4        | không tự gia hạn, mốc −2                             | integration        | `EXPIRY_MARKED`, không sự cố                            | sweep (7)                                 |
| AC-7        | quyết sau sự cố; xóa sự kiện bằng SQL                | integration        | quyết định `NEXT_RENEWAL`; sự kiện giữ; trigger từ chối | sweep (7)                                 |
| AC-8, AC-9  | mua đứt; không có quyết định                         | integration        | không sự kiện; không kỳ mới, không quyết định tự ghi    | sweep (4, 7)                              |
| quyền       | trưởng phòng đọc danh sách sự kiện; Finance/Employee | HTTP + integration | 403                                                     | http-spec, sweep (7)                      |

## Definition of Done

- [x] AC `full` có test; AC-3 ghi đúng vế.
- [x] Gate chạy trên revision cuối của worktree cô lập tại `6eb12d1` (chạy lại trên cây tích hợp là việc còn lại).
- [x] Scope map G8 đã có trong `docs/roadmap.md`.
- [x] Không tăng legacy ledger kiến trúc.
- [x] Module card cập nhật.

## Changes and acceptance

31/10/2026: implementation trong worktree cô lập tại `6eb12d1`, chưa commit, chưa Owner review, chưa nghiệm thu.

# Spec: gia hạn subscription — kết quả thực hiện, kỳ nối chuỗi, phần vượt, tiết kiệm và cờ thực hiện trễ

- Phụ trách: AI theo giao việc A-06 của người dùng (31/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc A-06 của người dùng (31/10/2026).
- Thiết kế: `ready`. Triển khai: `verified` (local, worktree cô lập tại `6eb12d1`, chưa commit, 31/10/2026). Owner review: chưa review.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `US-11-03`, `US-11-05` AC-9→AC-14, `MF-4` `c_excess`, `c_all`, `a_exec`, `a_act`, `s_save`, `s_late`), BE `6eb12d1`.
- Nhóm roadmap: G8 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Business outcome

Sau khi Người duyệt chi quyết, IT Admin thực hiện với nhà cung cấp ngoài hệ thống rồi ghi kết quả thực tế: đúng quyết định thì kỳ
mới được ghi nối chuỗi (một lần) và mọi ghế giữ ở ngày đầu kỳ mới chuyển sang kỳ mới (`RENEWAL_CARRY`) trong cùng giao dịch —
bị từ chối khi phần vượt chưa thu hồi xong; khác quyết định thì ghi thực tế và mở theo dõi nhà cung cấp; tiết kiệm chỉ ghi khi tổng
chi phí kỳ mới (cùng độ dài) thấp hơn kỳ cũ; quyết định tới mốc mà chưa có kết quả bị gắn cờ thực hiện trễ và báo IT Admin,
người quyết. Không tạo khoản cam kết. Kiểm bằng `POST /subscription-renewals/{id}/outcome` và pass hằng giờ trên PostgreSQL thật.

## Sizing decision

- Container: G8 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: từ quyết định tới kết quả thực tế và kỳ nối chuỗi; capability `licensing/subscription-renewal` nhóm
  `outcome/` và phần cờ trễ của `deadline/`; catalog `SubscriptionPeriodApi.recordNextPeriod`.
- Boundaries: một transaction (case `FOR UPDATE` → subscription cũ `FOR UPDATE` → Assignment); cột kết quả của
  `subscription_renewals`, `subscriptions.renewed_from_id`, Assignment `RENEWAL_CARRY`; route `POST /subscription-renewals/{id}/outcome` (`IT_ADMIN`).
- Not larger: đề xuất/quyết định (`a06-renewal-proposal-decision`); sự cố khi không ai quyết (`a06-renewal-deadline-incident`).
- Not smaller: ghi kết quả của IT Admin (`US-11-05` AC-9→AC-14) chính là thao tác kích hoạt hệ quả của `US-11-03`; tách sẽ lặp một
  transaction và một bộ test.
- Siblings: `a06-renewal-proposal-decision`, `a06-renewal-deadline-incident`, `a06-renewal-open-inputs`.
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Primary Story/AC

| Story    | AC                      | Coverage | Phần còn lại thuộc                                                                                                                                |
| -------- | ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-11-03 | AC-1→AC-10, AC-12→AC-21 | partial  | test người xác nhận bàn giao với gói mất dữ liệu của AC-7, AC-8, AC-10, AC-19 và tiết kiệm của hủy theo báo cáo (AC-9): `a06-renewal-open-inputs` |

_Re-pin 11/11/2026 ([C3](../../../reviews/mf2-mf3-2026-11-10/C3-SCOPE-MAP-REPIN.md)):_ bỏ khỏi bảng `US-11-05` AC-9→AC-14 (partial) — Story `RETIRED` ở Docs `5bb2e6a` (`US-11-05` `QĐ-103e`, `QĐ-103q`); code đã merge là lịch sử, khóa ở scope map là `not affected`. Còn một Story nên `Mode` đổi `single-story`.

## Supporting references

`FR-1.4`, `FR-4.7`, `FR-4.15`, `INV-01`, `QĐ-16`, `QĐ-35c`, `QĐ-62i`, `QĐ-62k`(ii)–(iii), `QĐ-62s`, `QĐ-64a`, `QĐ-66u`,
`QĐ-66w`, `OI-11c`, `BR-27.5`, `OQ-F1-10` (cờ trễ đóng hay giữ — mặc định: giữ làm dấu vết), `OQ-F1-11`, `OQ-F1-12`.

## Explicit out of scope

- Ghi tiết kiệm của một hủy toàn bộ (`US-12-04`) và chuyển chi phí kỳ mới thành thực chi (hóa đơn): B-07/B-08.
- Người xác nhận bàn giao: dùng cổng thu hồi và bảng `US-07-09` sẵn có (nguồn `SUBSCRIPTION_REDUCTION`/`_CANCELLATION` thuộc
  nhóm IT Admin, ghost seat của trưởng phòng thắng); test riêng với gói mất dữ liệu ở `a06-renewal-open-inputs`.
- Ghi kỳ mới sau sự cố tự gia hạn khi không có quyết định (`US-11-05` AC-18, `US-11-04` AC-10): `a06-renewal-open-inputs`.

## Dependencies and blockers

`a06-renewal-proposal-decision` (quyết định, ghế đã chọn, tác vụ thu hồi), migration `20261101000000`/`…0100`/`…0200`, thu hồi
hoàn tất qua `POST /provisioning-tasks/{id}/revocation-completion` (`g6-revocation-by-grant-kind`).

## Ownership: module, data, API

licensing `outcome/renewal-outcome.{service,policy}.ts`, `deadline/renewal-deadline.{service,policy}.ts` (cờ trễ),
`subscription-renewal-seat.repo.ts` (`carry`); catalog `subscription-period.service.ts` (`recordNext`), trigger
`subscriptions_renewal_chain`. Route `subscriptionRenewalRecordOutcome`. Thông báo `SUBSCRIPTION_RENEWAL_LATE`. Audit
`SUBSCRIPTION_RENEWAL.OUTCOME_RECORDED`, `SUBSCRIPTION_RENEWAL.FLAGGED_LATE`, `SUBSCRIPTION.RENEWED` (catalog).

## Behavior and design

**Ghi kết quả.** Chỉ `IT_ADMIN` (Người duyệt chi 403, `SoD-7`). Case phải `DECIDED` (`NOT_AWAITING_OUTCOME` 409; hai IT Admin ghi
đồng thời → một 200, một 409, một kỳ mới). `AS_DECIDED`: `RENEW`/`REDUCE` cần kỳ mới với đúng số quyết (gia hạn nguyên = số đang
mua), `CANCEL` không kỳ mới (`OUTCOME_MISMATCH` 422); `CANCEL` cần không còn ghế nào chưa kết thúc (`EXCESS_NOT_REVOKED` 409,
`details.seatsInUse`, `quantity: 0`). `VENDOR_REFUSED`/`DIFFERENT`/`UNCONFIRMED`: ghi thực tế, có hoặc không kỳ mới, mở
`vendorFollowUpOpen`, không tiết kiệm (AC-15, AC-18). Kỳ mới chỉ ghi khi ghế giữ ở ngày đầu kỳ mới ≤ số mua (`EXCESS_NOT_REVOKED`,
AC-5, `US-11-05` AC-9) và các ghế đó không còn tác vụ mở (`SEATS_HAVE_OPEN_TASKS`); thu hồi thất bại giữ ghế nên vẫn bị chặn
(AC-12). Kỳ mới: cùng plan, phòng sở hữu, TERM, giá ghi hôm nay theo tỷ giá hôm nay, `renewed_from_id` một lần (unique + trigger,
AC-4); nháp (thiếu tỷ giá) mà có ghế chuyển → `PERIOD_REFUSED` (`DRAFT`). Chuyển ghế (`QĐ-35c`, AC-2): ghế mới trên kỳ mới từ ngày
đầu, `predecessor_id` = ghế cũ, giữ người, tài khoản, Cost Center, ngày kết thúc dự kiến; ghế cũ kết thúc đúng ngày đó — không
ngày nào người có 0 hay 2 ghế. Kỳ cũ giữ nguyên dữ liệu và được nhận biết là đã có kỳ nối tiếp (AC-1). Hệ thống không tự gia hạn,
giảm hay hủy (AC-10 của `US-11-05`).

**Tiết kiệm (AC-3, AC-16, AC-21, `QĐ-66w`).** Chỉ `AS_DECIDED` có kỳ mới, cùng tiền tệ, cùng chu kỳ, cùng độ dài khi hai kỳ có ngày
kết thúc: `tổng cũ − tổng mới > 0` (tổng = đơn giá × số lượng). 100 × 120 → 88 × 140: 0; 88 × 125: 1 000. Thu hồi xong mà chưa ghi
kết quả: không tiết kiệm. Quyết định chưa thi hành không bao giờ tạo tiết kiệm.

**Cờ thực hiện trễ (AC-13, AC-14, AC-20).** Pass hằng giờ: case `DECIDED` quyết trong/đúng mốc, chưa có kết quả, hôm nay ≥ mốc →
`late_flagged_at` một lần, báo IT Admin đề xuất, IT Admin phụ trách và người quyết (`SUBSCRIPTION_RENEWAL_LATE`), không sự cố,
không đổi trạng thái subscription; phần vượt chưa thu hồi xong cũng chỉ là cờ này. Ghi kết quả sau đó vẫn được (`US-11-05` AC-14),
cờ giữ làm dấu vết (mặc định cho `OQ-F1-10`). Quyết định ghi sau mốc có điểm thực hiện riêng nên không bị gắn cờ.

**Không cam kết (AC-17).** Không ghi gì vào `budget_commitments`; test đếm trước/sau.

## Test matrix

| AC / rủi ro                        | Tình huống (gồm từ chối, edge case)                      | Cấp test           | Kết quả mong đợi                                                                   | Bằng chứng sau implement                  |
| ---------------------------------- | -------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| AC-1, AC-2, AC-4, AC-17            | gia hạn nguyên 2 ghế; ghi lại; chèn kỳ thứ hai bằng SQL  | integration        | kỳ mới nối chuỗi, 2 ghế `RENEWAL_CARRY`, ghế cũ kết thúc ngày đầu; 409; unique     | `subscription-renewal-outcome` (1)        |
| AC-3, AC-5, AC-12, `US-11-05` AC-9 | giảm 10→2 còn 3 ghế; ghi khi chưa thu hồi; thu hồi xong  | integration        | 422 sai số; 409 `seatsInUse 3, quantity 2`; rồi kỳ mới + tiết kiệm 8 000 000 VND   | outcome (2)                               |
| AC-15, AC-18                       | quyết giảm, nhà cung cấp giữ nguyên                      | integration        | 422 nếu ghi "đúng quyết định"; `DIFFERENT` có kỳ mới, theo dõi mở, không tiết kiệm | outcome (3)                               |
| AC-9, `US-11-05` AC-12             | hủy còn 1 ghế; nhà cung cấp từ chối                      | integration        | 409; `VENDOR_REFUSED` không kỳ mới, theo dõi mở                                    | outcome (4)                               |
| AC-21                              | tổng kỳ mới cao hơn / thấp hơn; khác độ dài/chu kỳ/tiền  | unit               | 0 / chênh lệch tổng; null                                                          | `renewal-outcome.policy.spec`             |
| AC-13, AC-14, AC-20                | quyết trước mốc, quét mốc−1, mốc, mốc+1; ghi kết quả sau | unit + integration | cờ một lần, báo IT Admin + người quyết, không sự cố; kết quả vẫn ghi được, cờ giữ  | `renewal-deadline.policy.spec`, sweep (6) |
| `SoD-7`                            | Người duyệt chi / Finance ghi kết quả                    | HTTP + integration | 403                                                                                | http-spec, outcome (6)                    |
| Đồng thời                          | hai IT Admin ghi kết quả cùng lúc                        | integration        | 200 + 409, một kỳ mới                                                              | outcome (5)                               |

## Definition of Done

- [x] AC `full` có test; AC partial ghi đúng vế.
- [x] Gate chạy trên revision cuối của worktree cô lập tại `6eb12d1` (chạy lại trên cây tích hợp là việc còn lại).
- [x] Scope map G8 đã có trong `docs/roadmap.md`.
- [x] Không tăng legacy ledger kiến trúc.
- [x] Module card cập nhật.

## Changes and acceptance

31/10/2026: implementation trong worktree cô lập tại `6eb12d1`, chưa commit, chưa Owner review, chưa nghiệm thu.

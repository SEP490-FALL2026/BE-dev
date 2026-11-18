# Spec: qd103-mf5-followups — phần MF-5/SBF-04a/SBF-20 còn thiếu: báo theo dõi khi cấp, độ mới nguồn, thư cảnh báo đỏ, khuyến nghị ở điểm điều chỉnh

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`, subagent số 3 soạn W8), đợt W8 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08–09/11/2026.
- Thiết kế: `ready` (thu hẹp theo cổng thiết kế W8 ngày 09/11/2026 — DA8-01, DA8-07, DA8-12, DA8-14, DA8-21). Owner review: chưa review (chế độ tự chạy).
- Gói: **W8** (giao code). Báo cáo hiệu suất sử dụng `US-12-05` (C#33) **bỏ** khỏi hạng mục — ledger `NGOÀI-PHẠM-VI` (DA8-07).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-3.11`, `FR-1.4`, `FR-4.10`, `FR-4.12`, `FR-5.10`, `FR-5.10a`, `FR-10.4`, `KPI-3`, `INV-01`; `QĐ-103e`, `QĐ-103k`,
  `QĐ-36c`, `QĐ-77e`, `QĐ-101b`; sơ đồ `SBF-04a` `a_notice`), BE `bc10bd1c` (đọc ở `46b6a94e`). Gap (bảng `API-GAP-W8.md` trong thư mục tracker):
  C#4 (Q-85 phần đẩy W8), C#5, C#36, C#40 = ledger L3-30. Câu TẠM CHỌN: Q-156, Q-157 (cuối spec).
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (đợt W8).
- [Kế hoạch](plan.md).

## Business outcome

Người được cấp seat của ứng dụng **đã được theo dõi** nhận thông báo theo dõi **ngay lúc cấp** (`US-08-05` AC-4). IT Admin thấy mỗi nguồn usage mới
tới đâu (lần nhập gần nhất, tuổi, _lỗi thời_). Cảnh báo đỏ gói năm và thông báo theo dõi có **thêm thư điện tử** khi Super Admin bật kênh thư
(`FR-3.11`, `US-11-08` AC-9). Điểm điều chỉnh hiện **khuyến nghị lãng phí đang mở** của thuê bao. Cả bốn việc là bước của MF-5/`SBF-04a`/`SBF-20`
(thông báo theo dõi, nguồn usage, điểm điều chỉnh, cảnh báo đỏ).

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W8), ngoài nhóm G.
- Mode: `technical-enabler`
- Outcome and owner: `licensing` (extension point `GrantCompletedListeners`, `AdjustmentRecommendationsHook`; thư cảnh báo đỏ ở `subscription-adjustment/alerts/`), `usage` (listener cấp → thông báo theo dõi; `lastImport` của nguồn), `optimization` (bind hook khuyến nghị), `notifications` (2 mẫu thư), `operating-parameters` (1 khóa).
- Boundaries: 0 migration; 0 operation mới; 3 operation đổi (`usageSourceList`, `usageSourceGet`, `subscriptionAdjustmentGet`) + 1 khóa tham số; 2 extension point; 2 mẫu thư; ước ~30 file, 2 lượt.
- Not larger: báo cáo hiệu suất sử dụng `US-12-05` (C#33 — ledger `NGOÀI-PHẠM-VI`); `usageImportList` (lịch sử lần nhập); hồ sơ `SBF-08`; báo cáo chất lượng `US-12-07`; nút chạy rule tay (`SBF-01`); thư cho mọi thông báo khác (`FR-3.11` chỉ hai loại).
- Not smaller: thư cảnh báo đỏ và thư theo dõi dùng chung một công tắc và một đường outbox (`US-12-15` AC-15).
- Siblings: `qd103-vendor-usage-import`, `qd103-ghost-seat-g3-g4`, `qd103-subscription-alerts-incidents`, `qd103-subscription-adjustment-point`, `qd103-api-docs-regression`.
- Scope map: n/a

## Primary Story/AC

| Story | AC                                                       | Coverage | Phần còn lại thuộc                  |
| ----- | -------------------------------------------------------- | -------- | ----------------------------------- |
| —     | W8-GAP-C#4, W8-GAP-C#5, W8-GAP-C#36, W8-GAP-C#40 (L3-30) | n/a      | gỡ chặn `qd103-api-docs-regression` |

## Supporting references

`US-08-05` AC-4, AC-5; `US-08-07` _Dữ liệu nghiệp vụ_ (ngày bao phủ cuối của nguồn), AC-4; `US-11-08` AC-8, AC-9 và _Dữ liệu nghiệp vụ_ (khuyến nghị
đang mở ở điểm điều chỉnh); `US-12-15` dòng 1, 25, AC-15. Hạng mục W6 trong repo: `docs/workspace/items/qd103-vendor-usage-import` (Q-85,
`listCurrentHolders`, `eventKey`), `qd103-ghost-seat-g1-g2`, `qd103-ghost-seat-g3-g4` (`potential-saving.policy.ts`); W5
`qd103-subscription-adjustment-point` (`usage: NOT_AVAILABLE`), `qd103-subscription-alerts-incidents` (cảnh báo đỏ, `red_alert_sent_at`).

## Explicit out of scope

Thông báo theo dõi cho collector (`US-09-03`); báo cáo hiệu suất sử dụng `US-12-05` (C#33; BRD 5.5.3 _Hiệu suất sử dụng_ — cùng loại với báo cáo
quy trình `US-12-06` đã xếp ngoài, `BR-MF5-01…04` không có bước báo cáo — DA8-07); xếp hạng nhân viên; dự báo.

## Dependencies and blockers

W5 PASS và W6 PASS (mọi hạng mục). Task 5 cần `qd103-ghost-seat-g3-g4` (khuyến nghị, tiềm năng). Không phụ thuộc hạng mục W8 nào khác
(bản nháp cũ chờ `qd103-role-dashboards-digest` Phase 1 vì cùng controller điểm điều chỉnh — hạng mục đó nay ở W8b, nên bỏ phụ thuộc; nếu Owner
mở W8b, `qd103-role-dashboards-digest` làm **sau** hạng mục này).

## Ownership: module, data, API

- `operating-parameters/parameter-definitions.policy.ts`: `BUSINESS_EMAIL_ENABLED` enum `ON|OFF`, mặc định `OFF`, nhóm `WORKFLOW`, chủ `SUPER_ADMIN`,
  nhãn _Gửi thêm thư cho cảnh báo hạn chót báo hủy và thông báo theo dõi_, nguồn `FR-3.11, US-12-15 AC-15` (Q-156).
- `notifications`: `public/notifications.types.ts` (`EmailTemplate` + `SUBSCRIPTION_RED_ALERT`, `USAGE_TRACKING_NOTICE`), `email/email-templates.mapper.ts`
  (+ spec: hai mẫu không liên kết token, `vi`/`en`), `README.md`.
- `licensing`: `public/licensing.extension-points.ts` — `GrantCompletedListeners` (`licensing.grant-completed`; sự kiện `{ taskId, assignmentId,
employeeId | null, kind, source, planId, applicationId, completedAt }`), `AdjustmentRecommendationsHook` (`openOf(subscription: { id, planId },
asOf)` → `{ count, potentialSavingMinor | null, currency | null }`); `provisioning/tasks/provisioning.service.ts` (`complete`: emit sau
  `reportOutcome`, chỉ tác vụ `GRANT`); `subscription-adjustment/alerts/` (thư cảnh báo đỏ), `subscription-adjustment` dto/service của
  `subscriptionAdjustmentGet` (`openRecommendations` thay `usage`).
- `usage`: `vendor-import/notice/tracking-notice.service.ts` (mới — gom gửi in-app + thư của W6 `usageImportConfirm` và lúc cấp),
  `vendor-import/notice/grant-tracking-notice.listener.ts` (mới, bind `GrantCompletedListeners`), `vendor-import/confirmation/*` (gọi service chung),
  `vendor-source/vendor-source.{dto,repo,service}.ts` (`lastImport`, `ageDays`, `stale`), `usage.module.ts`, `README.md`.
- `optimization`: service bind `AdjustmentRecommendationsHook` (`ghost-seat/ghost-seat-open-recommendations.service.ts` — đọc khuyến nghị chưa đóng,
  tiềm năng qua `potential-saving.policy.ts`); `optimization.module.ts`, `README.md`.
- Operation mới: không. Đổi: `usageSourceList`, `usageSourceGet` (thêm trường), `subscriptionAdjustmentGet` (`openRecommendations` thay `usage` —
  breaking nhỏ, ghi cho `qd103-api-docs-regression`), `operatingParameterList`/`Set` (khóa mới).
- Mảng lồng: không (`lastImport`, `openRecommendations` là object).

## Behavior and design

1. **Thông báo theo dõi lúc cấp** (C#4, `US-08-05` AC-4): `provisioningTaskComplete` của tác vụ `GRANT` emit `GrantCompletedListeners` trong transaction
   hoàn tất. Listener của `usage`: Assignment `PERSONAL` (gồm quyền theo vai), ứng dụng có ≥ 1 lần nhập `COMPLETED` của nguồn chưa `retired` ⟹
   `TrackingNoticeService.send(tx, applicationId, [employeeId])` — cùng `USAGE_TRACKING_NOTICE`, cùng params, cùng `eventKey =
USAGE_TRACKING_NOTICE:<applicationId>` của W6 ⟹ người đã nhận không nhận lại; lần xác nhận kế của W6 không gửi lại cho người này. `SERVICE`,
   ứng dụng chưa theo dõi ⟹ không gửi (Q-157). Listener không ném vì nghiệp vụ; chỉ lỗi DB làm rollback.
2. **Độ mới nguồn** (C#5 — lựa chọn kỹ thuật, nhỏ hơn `usageImportList`): `usageSourceList`/`Get` thêm `lastImport { id, confirmedAt, coverageFrom,
coverageTo } | null`, `ageDays` (`hôm nay − coverageTo`, null khi chưa nhập), `stale` (cùng hằng 7 ngày của `usage-evidence.policy.ts` — một nguồn
   sự thật). Danh sách: một câu lệnh LATERAL, số câu lệnh hằng. Đủ `US-08-07` _Dữ liệu nghiệp vụ_ (cửa sổ, ngày bao phủ cuối); lần bị đè hiện ở bản
   chụp khuyến nghị (W6), không cần lịch sử lần nhập.
3. **Kênh thư** (C#40, L3-30, `FR-3.11`, `US-11-08` AC-9, `US-12-15` AC-15): `BUSINESS_EMAIL_ENABLED = ON` ⟹ khi ghi `SUBSCRIPTION_RED_ALERT` (W5,
   cùng transaction đặt `red_alert_sent_at`) và mỗi `USAGE_TRACKING_NOTICE` thực sự ghi (`notifyInApp` trả `true`), thêm `enqueueEmail` tới email
   đăng nhập của người nhận (`IdentityAccessApi.findLoginEmailOfEmployee`; không có tài khoản ⟹ chỉ in-app), `actionTokenHash = null`, `locale 'vi'`,
   payload chỉ tên ứng dụng/thuê bao, hạn chót, _theo ngày kết thúc_/_suy ra_ (cảnh báo đỏ) hoặc đủ 5 nội dung `US-08-05` AC-2 (theo dõi). `OFF` ⟹ chỉ
   in-app. Thư lỗi ⟹ outbox `FAILED`, in-app vẫn còn, không gửi lại in-app; `notice_at` của W6 không phụ thuộc thư (`US-08-05` AC-5). Không thư nào cho
   mã khác.
4. **Khuyến nghị ở điểm điều chỉnh** (C#36): `subscriptionAdjustmentGet` thay `usage: { status: 'NOT_AVAILABLE' }` bằng `openRecommendations: { state:
'AVAILABLE' | 'NOT_AVAILABLE', count, potentialSaving: money | null, asOf }`; đọc **lúc gọi** (cả điểm đã ghi — không chụp); hook chưa bind ⟹
   `NOT_AVAILABLE`, `count null`. Đếm: `G1` có `subscription_id` = thuê bao; `G2`–`G4` chưa đóng trên `plan_id` của thuê bao (kho theo gói — chặn trùng
   W4). Tiềm năng = tổng `potentialSaving` của khuyến nghị có giá, cùng đồng tiền; không có ⟹ null. `subscriptionAdjustmentList` không đổi.

## Test matrix

| AC / rủi ro              | Tình huống (gồm từ chối, edge case)                                                              | Cấp test            | Kết quả mong đợi                                                                        | Bằng chứng sau implement |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------- | ------------------------ |
| C#4 `US-08-05` AC-4      | Figma đã có lần nhập `COMPLETED`; hoàn tất cấp seat cho `E9`                                     | integration         | `E9` có 1 `USAGE_TRACKING_NOTICE` trong cùng transaction; lần xác nhận kế không gửi lại |                          |
| C#4 phủ định             | Figma chưa nhập lần nào; seat `SERVICE`; tác vụ cấp đóng thất bại; transaction hoàn tất rollback | integration         | không thông báo mọi ô                                                                   |                          |
| C#5                      | nguồn chưa nhập; nhập bao phủ tới 01/09, hôm nay 09/09; hai nguồn trong danh sách                | http + integration  | `lastImport null` / `ageDays 8`, `stale true` / số câu lệnh không đổi theo số nguồn     |                          |
| C#40 bật                 | `BUSINESS_EMAIL_ENABLED = ON`, cảnh báo đỏ Figma cho `IT1`, `F1`                                 | integration         | 2 in-app + 2 dòng outbox `SUBSCRIPTION_RED_ALERT`; chạy lại cùng ngày không thêm        |                          |
| C#40 tắt / mã khác       | `OFF`; `ON` nhưng mã `SUBSCRIPTION_MONTHLY_KEPT_BY_DEFAULT`                                      | integration         | chỉ in-app / không thư                                                                  |                          |
| `US-12-15` AC-15 thư lỗi | dispatcher lỗi 5xx cho `F1`                                                                      | integration         | outbox `FAILED`, in-app còn                                                             |                          |
| thư theo dõi             | `ON`, `usageImportConfirm` `SYSTEM_SENT` 3 người (1 không tài khoản); cấp `E9`                   | integration         | 2 + 1 thư; người không tài khoản chỉ in-app; `notice_at` như W6                         |                          |
| mẫu thư                  | render hai mẫu `vi`/`en`                                                                         | unit                | không token, không liên kết kích hoạt; đủ nội dung                                      |                          |
| C#36                     | thuê bao Figma: 1 `G1` mở, 2 `G4` mở (tiềm năng 180, 90), 1 `G3` đóng; hook chưa bind            | integration + unit  | `count 3`, `potentialSaving 270` / `NOT_AVAILABLE`                                      |                          |
| hồi quy                  | W6 `usageImportConfirm`, cảnh báo đỏ W5, `provisioningTaskComplete`, flow `mf5-ghost-seat`       | integration + flows | xanh                                                                                    |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI đổi đúng 3 operation + khóa tham số (lỗi có ví dụ, summary ≤ 70 ký tự); manifest example cập nhật.
- [ ] README `usage`, `optimization`, `licensing` (2 extension point), `notifications` (mẫu thư, kênh) cập nhật; `pnpm arch:capabilities` không vòng.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Câu tạm chọn (TẠM CHỌN — chờ Owner)

- **Q-156** Công tắc thư: `US-11-08` AC-9 nói _cấu hình thư cho cảnh báo theo hạn chót_, `US-12-15` AC-15 nói một _cấu hình thư điện tử_ cho dòng 1 và
  dòng 25. (A) một khóa `BUSINESS_EMAIL_ENABLED` cho cả hai; (B) khóa riêng `DEADLINE_ALERT_EMAIL_ENABLED`. **Tạm chọn A**, mặc định `OFF`, Super Admin
  đổi. Đổi lại: `parameter-definitions.policy.ts` + hai nơi đọc.
- **Q-157** Báo theo dõi lúc cấp cho ai? Ví dụ `ci-bot` (tài khoản dịch vụ) được cấp Figma đã theo dõi. **Tạm chọn**: chỉ Assignment `PERSONAL` (gồm quyền
  theo vai); `SERVICE` không. Đổi lại: `grant-tracking-notice.listener.ts`.
- **Q-158, Q-159** — đóng: báo cáo hiệu suất sử dụng (C#33) ra ledger `NGOÀI-PHẠM-VI` (DA8-07, DA8-12); câu mở lại nếu Owner đưa
  `US-12-05` vào phạm vi.

## Changes and acceptance

- 08–09/11/2026: tạo ở W8 (subagent số 3 soạn).
- 09/11/2026: thu hẹp theo cổng thiết kế W8 — bỏ báo cáo hiệu suất `US-12-05` và hai facade đọc của nó (DA8-07, DA8-12), bỏ phụ thuộc
  dashboards W8b, sửa cột cuối dòng primary (DA8-14), Sizing một dòng (DA8-21). `Thiết kế: ready`. Chưa nghiệm thu.

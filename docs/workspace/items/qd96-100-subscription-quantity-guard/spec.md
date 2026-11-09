# Spec: Căn cứ cho số lượng thuê bao đang dùng và thuê bao tạo sau khởi tạo

- Phụ trách: AI theo giao việc Owner (05/11/2026).
- Thiết kế ban đầu bởi: AI (agent C-SPEC-TL) theo giao việc Owner (05/11/2026).
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `3d73a7f` (`QĐ-84f`, `QĐ-89a`(1), `QĐ-89e`, `QĐ-94d`(2), `QĐ-98d`; `US-04-03` chỉ tham chiếu), BE `3e4553b9`.
  Quyết định phiên Owner 05/11/2026 **Q-06 = A** (`docs/reviews/qd96-100-alignment-2026-11-05/QUESTIONS.md` mục D), L-708.
- Nhóm roadmap: không thuộc G — bó finding `qd96-100-alignment` (Track L).
- [Kế hoạch](plan.md).

## Business outcome

IT Admin không còn tăng/giảm `purchasedQuantity` của thuê bao `ACTIVE` mà không có căn cứ: tăng phải dựa trên Request đã duyệt
(không vượt phần được duyệt), giảm phải dựa trên kết quả điều chỉnh đã được trưởng phòng sở hữu xác nhận, còn sửa sai dữ liệu phải
kèm lý do và để lại vết; sau khi đóng baseline, thuê bao mới chỉ tạo được từ một Request đã duyệt và server tự suy ra phòng sở hữu,
gói và trần số lượng.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (Track L).
- Mode: `technical-enabler`.
- Outcome and owner: hiện thực Q-06 A (quyết định phiên Owner chưa vào US/sổ QĐ, nên không claim AC Story); căn cứ thay đổi số lượng — capability `catalog/subscription`.
- Boundaries: transaction ghi thuê bao (khóa thuê bao + gói đã có) + bảng mới `subscription_quantity_changes`; hook đọc Request
  (bound bởi `requests`) và trạng thái baseline/kết quả điều chỉnh (bound bởi `licensing`); wire `subscriptionCreate`, `subscriptionUpdate`.
- Not larger: khóa `allowsMidTermReduction` và dọn trường catalog khác thuộc `qd96-100-catalog-api-fields`.
- Not smaller: tạo và sửa dùng cùng sổ căn cứ để kiểm _tổng không vượt phần được duyệt_.
- Siblings: `qd96-100-catalog-api-fields` (dùng lại `basis.correction`), chat MF-5 (`licensing/subscription-renewal`).
- Scope map: n/a — bó finding ngoài nhóm G.

## Primary Story/AC

| Story | AC             | Coverage | Phần còn lại thuộc                                             |
| ----- | -------------- | -------- | -------------------------------------------------------------- |
| —     | L-708 (Q-06 A) | n/a      | gỡ chặn `qd96-100-catalog-api-fields`, `qd96-100-seed-demo-v3` |

## Supporting references

- `US-04-03` (khai báo thuê bao), `US-07-12` (IT cấp từ seat trống/mua thêm), `US-11-05`, `US-11-06` (điều chỉnh — chat MF-5).
- `QĐ-84f`: phần tăng phải có Request; `QĐ-94d`(2): giảm do trưởng phòng sở hữu xác nhận; `QĐ-89a`(1): phòng sở hữu = phòng có
  Request đã duyệt; `QĐ-89e`: trước baseline IT chọn phòng theo hợp đồng.

## Explicit out of scope

- Đổi phòng sở hữu qua API: **đã** không có (`subscriptionUpdate` không nhận `ownerDepartmentId`, `subscription.dto.ts:21-22`;
  lệnh CLI gán chủ chỉ cho thuê bao chưa có chủ) — giữ nguyên, ghi test chặn.
- Đổi ngày, cờ khác của thuê bao `ACTIVE` (chat MF-5 / `qd96-100-catalog-api-fields`); **giá** nay thuộc đây (D5, mục 2). Đường _mua thêm_ lúc cấp (`seatSource`, H2).
- Hiện thực phía `licensing/subscription-renewal` của `renewalId` (chat MF-5).

## Dependencies and blockers

- Không chặn để bắt đầu. Vế `basis.renewalId` cần chat MF-5 bind `SubscriptionRenewalBasisReader`; chưa bind ⟹ vế này trả 422
  `SUBSCRIPTION.BASIS_NOT_AVAILABLE` (giả định G-3), hai vế còn lại hoạt động.

## Ownership: module, data, API

- `catalog/subscription` sở hữu bảng mới `subscription_quantity_changes` (khai owner ở `test/gates/architecture-boundaries.gate-spec.ts`).
- `catalog/public/catalog.extension-points.ts`: thêm hai hook theo mẫu `SeatOccupancyHook`:
  `SubscriptionRequestBasisHook` (bind ở `requests`: `requestBasis(tx, requestId) → {organizationId, departmentId, planId,
approvedSeats} | null`, khóa Request `FOR SHARE`) và `SubscriptionLicensingFactsHook` (bind ở `licensing/seat-baseline`:
  `baselineClosed(tx)`; `renewalBasis(tx, renewalId)` tùy chọn, bind bởi chat MF-5). Catalog không import `requests`/`licensing`.
- API đổi: `subscriptionCreate` (thêm `requestId`; `planId`, `ownerDepartmentId` thành tùy chọn), `subscriptionUpdate` (thêm `basis`).

## Behavior and design

1. **`subscriptionCreate`**: body có đúng một trong hai dạng — `{requestId, kind, …}` hoặc `{planId, ownerDepartmentId, kind, …}`
   (refine; sai ⟹ 422 `VALIDATION_ERROR`).
   - Dạng `requestId`: hook trả `null` hoặc Request chưa duyệt/đã kết thúc không cấp ⟹ 422 `SUBSCRIPTION.BASIS_REQUEST_INVALID`
     (`details.reason`: `NOT_FOUND | NOT_APPROVED`). Server lấy `planId`, `ownerDepartmentId` từ Request; `purchasedQuantity`
     (nếu khai) ≤ `approvedSeats − đã dùng` (đã dùng = tổng phần tăng của sổ theo `request_id`), vượt ⟹ 422
     `SUBSCRIPTION.BASIS_QUANTITY_EXCEEDED` (`details: {approvedSeats, used}`).
   - Dạng `planId + ownerDepartmentId`: baseline đã đóng ⟹ 422 `SUBSCRIPTION.REQUEST_REQUIRED`; chưa đóng ⟹ như hiện nay (`QĐ-89e`).
   - Ghi một dòng sổ (`before NULL`, `after = purchasedQuantity ?? 0`, kind `REQUEST` hoặc `SETUP_DECLARATION`).
2. **`subscriptionUpdate`** khi thuê bao `ACTIVE` và `purchasedQuantity` đổi: bắt buộc `basis` (thiếu ⟹ 422 `SUBSCRIPTION.BASIS_REQUIRED`):
   - `{requestId}` chỉ cho **tăng**: Request đã duyệt, cùng phòng sở hữu và cùng gói với thuê bao (khác ⟹ 422
     `SUBSCRIPTION.BASIS_REQUEST_MISMATCH`), phần tăng ≤ `approvedSeats − đã dùng`.
   - `{renewalId}` chỉ cho **giảm/giữ**: kết quả điều chỉnh của **chính thuê bao này** đã được trưởng phòng sở hữu xác nhận (hook);
     không ⟹ 422 `SUBSCRIPTION.BASIS_RENEWAL_INVALID`; hook chưa bind ⟹ 422 `SUBSCRIPTION.BASIS_NOT_AVAILABLE`.
   - `{correction: true, reason}` (reason 10..500 sau trim) cho cả hai chiều: sửa sai dữ liệu, không đổi nghĩa vụ trả tiền.
   - Đổi chiều sai (tăng bằng `renewalId`, giảm bằng `requestId`) ⟹ 422 `SUBSCRIPTION.BASIS_DIRECTION_INVALID`.
   - `basis` gửi khi số lượng không đổi hoặc thuê bao `DRAFT` ⟹ 422 `SUBSCRIPTION.BASIS_NOT_EXPECTED` (không bỏ qua lặng lẽ).
   - Các chặn hiện có giữ nguyên (không dưới số seat đang chiếm, không tăng khi thiếu Cost Center).
   - (D5) `unitPrice` đổi trên thuê bao `ACTIVE` cũng bắt buộc `basis`, chỉ dạng `{correction: true, reason}` (sửa sai dữ liệu,
     `QĐ-84f`: tăng chi phải qua duyệt); giá mới thật đi qua kỳ mới ở `subscriptionRenewalRecordOutcome.nextPeriod`. `requestId`/
     `renewalId` cho giá ⟹ 422 `SUBSCRIPTION.BASIS_DIRECTION_INVALID`. Audit `SUBSCRIPTION.UPDATED.basis`; không ghi sổ số lượng.
3. **Đồng thời**: khóa thuê bao `FOR UPDATE` (đã có), rồi `pg_advisory_xact_lock(hashtextextended('subscription-basis:'||requestId,0))`
   trước khi đọc _đã dùng_ — hai thuê bao không dùng chồng một Request. Thứ tự khóa: thuê bao → gói → khóa tư vấn → Request (hook).
4. **Audit**: `SUBSCRIPTION.CREATED`/`SUBSCRIPTION.UPDATED` thêm `basis {kind, requestId|renewalId|reason}`; `correction` ghi
   thêm sự kiện `SUBSCRIPTION.QUANTITY_CORRECTED`.
5. **Migration** `<ts>_subscription_quantity_basis` (timestamp lúc implement): bảng `subscription_quantity_changes` (`id`,
   `organization_id`, `subscription_id` FK, `before_quantity INT NULL`, `after_quantity INT NOT NULL`, `basis_kind TEXT` check
   `IN ('SETUP_DECLARATION','REQUEST','RENEWAL','CORRECTION')`, `request_id UUID NULL`, `renewal_id UUID NULL` — giá trị, không FK
   chéo module —, `reason TEXT NULL`, `changed_by_app_user_id UUID NOT NULL`, `changed_at TIMESTAMPTZ(3)`); check khớp kind ↔ cột;
   index `(request_id)`, `(subscription_id, changed_at)`; trigger chỉ ghi thêm (không UPDATE/DELETE) và khai
   `RUNTIME_TABLE_EXCEPTIONS` (chỉ `SELECT, INSERT`). Không backfill: thuê bao có sẵn không có dòng sổ (đã dùng = 0).

### Mức FE-tonight (chỉnh 05/11 theo review main flow, MF-1 bước 1.9)

**B.** Bước 1.9 (IT chọn nguồn seat rồi mua) tối nay vẫn đi bằng contract hiện có: `provisioningTaskGrant {requestId,
subscriptionId?, …}` chọn thuê bao còn seat; seed v3 cấp đủ seat nên demo không cần _mua thêm_. Khi hạng mục này merge, FE đổi form
`subscriptionCreate`/`subscriptionUpdate` (khối _căn cứ_, `requestId` thay ô UUID phòng). Rủi ro chấp nhận tới lúc đó: IT vẫn tăng
`purchasedQuantity` không căn cứ (L-708). Phần _chuyển seat kèm chi phí/giữ chỗ_ của 1.9 là hoãn H2 — xem báo cáo
`fe-batch/V1-MF1-MF4.md`.

## Test matrix

| AC / rủi ro           | Tình huống                                                | Cấp test           | Kết quả mong đợi                                                           | Bằng chứng sau implement |
| --------------------- | --------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------- | ------------------------ |
| Q-06 A tăng           | Slack 40 → 45 không `basis`                               | HTTP               | 422 `SUBSCRIPTION.BASIS_REQUIRED`                                          | planned                  |
| Q-06 A tăng           | 40 → 45 với Request nhóm 5 dòng `APPROVED` cùng phòng/gói | integration        | 200; sổ ghi `REQUEST`; lần hai +1 cùng Request ⟹ `BASIS_QUANTITY_EXCEEDED` | planned                  |
| mismatch              | Request của `P-MKT` cho thuê bao `P-ENG`                  | integration        | 422 `BASIS_REQUEST_MISMATCH`                                               | planned                  |
| Q-06 A giảm           | 45 → 40 với `renewalId` hợp lệ (hook giả)                 | unit + integration | 200, sổ `RENEWAL`                                                          | planned                  |
| renewal chưa bind     | `renewalId` khi hook chưa bind                            | HTTP               | 422 `BASIS_NOT_AVAILABLE`                                                  | planned                  |
| sửa sai               | 51 → 15 `{correction, reason}`                            | integration        | 200; Audit `QUANTITY_CORRECTED`; vẫn chặn dưới seat đang chiếm             | planned                  |
| chiều                 | tăng bằng `renewalId`                                     | unit               | 422 `BASIS_DIRECTION_INVALID`                                              | planned                  |
| create sau baseline   | `{planId, ownerDepartmentId}`                             | HTTP               | 422 `SUBSCRIPTION.REQUEST_REQUIRED`                                        | planned                  |
| create sau baseline   | `{requestId}` Request Figma `P-ENG` đã duyệt              | integration        | thuê bao của `P-ENG`, gói Figma; khai vượt `approvedSeats` ⟹ 422           | planned                  |
| create trước baseline | `{planId, ownerDepartmentId}`                             | integration        | như hiện nay, sổ `SETUP_DECLARATION`                                       | planned                  |
| đồng thời             | hai thuê bao cùng dùng một Request                        | integration        | một thành công, một `BASIS_QUANTITY_EXCEEDED`                              | planned                  |
| DRAFT                 | đổi số lượng thuê bao `DRAFT`                             | HTTP               | 200, không cần `basis`                                                     | planned                  |
| D5 giá                | `ACTIVE` đổi `unitPrice` không `basis` / có `correction`  | HTTP               | 422 `BASIS_REQUIRED` / 200 + Audit                                         | planned                  |
| sổ chỉ ghi thêm       | UPDATE/DELETE dòng sổ                                     | integration        | DB từ chối                                                                 | planned                  |

## Definition of Done

- [ ] Mọi dòng test matrix đỏ-trước/xanh-sau; gate kiến trúc nhận bảng và hook mới.
- [ ] Quick gates + `pnpm openapi:export`; báo FE form F3/F5 (thêm khối _căn cứ_, ô Request thay ô UUID phòng).
- [ ] Ghi rõ giả định G-3 và điểm bind cho chat MF-5 trong `catalog/README.md`.

## Open questions

- **G-3 (phối hợp MF-5, không chặn)**: giả định chat MF-5 cung cấp `renewalBasis(tx, renewalId) → {subscriptionId,
confirmedByOwnerHead: boolean} | null` và bind vào `SubscriptionLicensingFactsHook`. Nếu MF-5 đổi tên/hình, chỉ đổi phần bind.

## Changes and acceptance

- 05/11/2026: tạo spec (`draft`). Chưa nghiệm thu.
- 05/11/2026 (chỉnh 05/11 theo review main flow): mức FE-tonight **B**. Không có phát hiện C-REVIEW mở.
- 05/11/2026 (chỉnh 05/11 theo review main flow — vòng FIELDS): D5 — đổi `unitPrice` của thuê bao `ACTIVE` cần `basis.correction` (mức **B**, như cả hạng mục).

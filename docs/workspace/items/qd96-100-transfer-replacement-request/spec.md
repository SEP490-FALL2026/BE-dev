# Spec: Request cấp thay thế khi điều chuyển do hệ thống tự tạo

- Phụ trách: AI theo giao việc Owner (05/11/2026).
- Thiết kế ban đầu bởi: AI (agent C-SPEC-TL) theo giao việc Owner (05/11/2026).
- Thiết kế: `draft`. Owner review: chưa review.
- **Mức FE-tonight: Phần A = `A`** — trường `reason` bắt buộc của quyết định rà soát (F17), cùng body với #18 Phần A; migration nhỏ
  **M21a** (cột `reason`). **Phần B = `B`** — tự tạo Request thay thế, `termMonths`, `replacementRequest`, liên kết (F18; cần #4, #6, #16 của V1).
  Trong khi chưa có Phần B, _còn cần_ đi đường hiện có: người chuyển tự gửi Request ở phòng mới, listener khớp theo (người, phòng, gói)
  (`transfer-review-replacement.service.ts:33-42`); FE hiện gợi ý đó, không hiện `replacementRequest`.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-2.16`(2); `US-03-07` AC-3; `QĐ-56a`, `QĐ-89b`, `QĐ-94f`(2), `QĐ-94m`(3), `QĐ-98i`,
  `QĐ-99a`, `QĐ-100t`; QT:601 _ghi người, thời điểm, lý do_; `BM-01` lý do bắt buộc), BE `3e4553b9`.
  Tracker: `docs/reviews/qd96-100-alignment-2026-11-05/` (L-505; V4 §2.2 `reason`).
- Nhóm roadmap: G6 — chỉ là planning container; container giao việc là bó finding `qd96-100-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Trưởng phòng mới chọn _còn cần_ cho một quyền **trả phí** trong rà soát sau điều chuyển thì, trong cùng thao tác, hệ thống tạo
một Request cấp mới cho người chuyển ở phòng nhận — liên kết quyền cũ, nhu cầu đã xác nhận, nằm trong hàng đợi trình của trưởng
phòng mới — rồi đi kiểm tra ngân sách và Người duyệt chi như mọi Request; seat cũ được thu hồi khi Request đó kết thúc.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (Track T), Story thuộc G6.
- Mode: `single-story`.
- Outcome and owner: tạo Request cấp thay thế — capability mới `requests/transfer-replacement` (tạo) gọi từ
  `personnel/transfer-review` (quyết định) qua facade `requests/public`.
- Boundaries: một transaction (quyết định + Request + bước nhu cầu đã duyệt + liên kết); bảng `access_requests`,
  `transfer_review_items`; wire `transferReviewDecide`; listener kết cục Request đã có.
- Not larger: chồng lấn 5 ngày, giữ chờ Cost Center, +10 ngày khi bị chặn ngân sách (H6); chuyển seat kèm chi phí (H2).
- Not smaller: tạo Request và ghi quyết định phải nguyên tử; tách ra sẽ có quyết định _còn cần_ không có Request (seat cũ treo).
- Siblings: `qd96-100-transfer-review-defaults`, `qd96-100-transfer-labels-and-overlap` (hoãn), `qd96-100-seat-transfer-and-reuse` (hoãn).
- Scope map: [G6](../../../roadmap.md#work-item-decomposition-g6) — điều phối viên chuyển chủ khóa `US-03-07` AC-3 khi đăng ký.

## Primary Story/AC

| Story      | AC   | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `US-03-07` | AC-3 | partial  | AC-3 vế _hết 5 ngày làm việc mà Request chưa tới bước duyệt chi_ và AC-16, AC-17: `qd96-100-transfer-labels-and-overlap`; AC-18: `qd96-100-seat-transfer-and-reuse`; AC-6, AC-7, AC-12: `qd96-100-transfer-review-defaults`; AC-1, AC-2, AC-4, AC-5, AC-8, AC-9, AC-11, AC-13→AC-15: `g6-transfer-tool-review`; AC-10: `g3-downstream-finance-integration` |

## Supporting references

- `US-03-01` AC-5, AC-7 (vế _tự tạo Request cấp thay thế_), `US-03-12` AC-2 (giữ quyền cũ tới khi Request có quyết định —
  hành vi hiện tại của _còn cần_ đã giữ tới khi Request kết thúc), `US-05-14` AC-15 (bỏ _trưởng phòng tạo thay Request tiếp tục_).
- Hàm kiểm ngân sách ba kết quả: chủ là #6 `qd96-100-budget-check-three-outcomes` — Request ở đây đi qua hàm đó lúc trình lô,
  không gọi trực tiếp. Luật năm/thời hạn bắt đầu từ ngày duyệt chi: chủ là #16 `qd96-100-request-year-without-spend-date`.

## Explicit out of scope

- Mốc chồng lấn và các trạng thái giữ (H6). Seat cũ của gói K1 chuyển kèm chi phí, ưu tiên seat trống phòng khác (H2, `QĐ-99e`, `QĐ-100y`).
- Phòng nhận chưa có Cost Center: **không** tạo Request (lưu nháp thuộc H6); quyết định vẫn ghi, quyền cũ giữ như hiện nay.
- Trưởng phòng mới chính là người chuyển (tự rà soát quyền của mình) — liên quan `QĐ-100l`, chờ mentor, giữ hiện trạng.

## Dependencies and blockers

- #4 `qd96-100-request-sender-rules` (gỡ `delegatedRequestSend`; quy tắc _Request cho một người do chính người đó gửi_ phải miễn cho
  nguồn `TRANSFER_REPLACEMENT`), #6 (kiểm ngân sách lúc trình), #16 (bỏ `expectedSpendOn` — Request tạo ở đây không có ngày dự kiến
  chi), #18 (DTO quyết định đã bỏ `NEEDS_NEW_TOOL`). Migration của hạng mục này đứng sau migration của #18.

## Ownership: module, data, API

- `requests/transfer-replacement/` (mới, capability trong `RequestsModule`, không thêm Nest module): service tạo, tái dùng
  `RequestFactsService.assess`, `AccessRequestRepo.insert/recordNeedDecision`, `nextRequestState`. Facade
  `requests/public/transfer-replacement.api.ts` `TransferReplacementApi.create(tx, actor, input)`.
- `personnel/transfer-review`: gọi facade trong `TransferReviewDecisionService.decide`; `TransferReviewReplacementService` khớp
  Request kết thúc theo liên kết trước, rồi theo (người, phòng, gói) như cũ.
- API đổi — **Phần A (contract FE tối nay):** `transferReviewDecide` body cuối `{ assignmentId: uuid, decision: 'STILL_NEEDED'|'NOT_NEEDED',
reason: string (trim 1..500, bắt buộc với cả hai lựa chọn và với lần đổi ý STILL_NEEDED → NOT_NEEDED) }` (strict; `NEEDS_NEW_TOOL`,
  `newToolNote` bỏ theo #18 Phần A); response item thêm `reason: string | null` (null với dòng cũ/`PENDING`). Lý do lưu ở dòng (ghi đè khi
  đổi ý; lý do cũ vẫn ở Audit `TRANSFER_REVIEW.DECIDED`).
- API đổi — **Phần B:** body thêm `termMonths` (tùy chọn, số nguyên 1..12, chỉ đi với `STILL_NEEDED` của quyền trả phí — Owner chốt
  05/11/2026; thêm field tùy chọn = đổi contract cộng thêm); response item thêm `replacementRequest: { id, state } | null`; chi tiết
  Request (`accessRequestGet`) thêm `transferReplacement: { replacesAssignmentId } | null`.

## Behavior and design

1. **(Phần B, mục 1–8)** `decide` (một transaction, thứ tự khóa giữ nguyên: rà soát → đọc tổ chức → seat ở licensing → Request): khi `decision =
STILL_NEEDED` và gói của dòng **trả phí** (kiểu cấp K1/K2/K4 — khác K5; gói không giá vẫn tạo, Request mang `pricingStatus`
   như thường) ⟹ `TransferReplacementApi.create(tx, headPrincipal, { beneficiaryEmployeeId, departmentId: review.departmentId,
planId, replacesAssignmentId, reason, termMonths, reviewId })`. `termMonths` gửi kèm `NOT_NEEDED` hoặc quyền K5 ⟹ 422
   `VALIDATION_ERROR` (refine ở DTO cho `NOT_NEEDED`; K5 kiểm ở service, mã `TRANSFER_REVIEW.TERM_NOT_APPLICABLE`).
2. Request tạo ra: `type GRANT`, `branch PAID_IN_CATALOG`, người gửi = trưởng phòng quyết định, người thụ hưởng = người chuyển,
   `businessReason = reason`, `termMonths` = giá trị trưởng phòng nhập, bỏ trống = 12 (Owner chốt 05/11/2026); gói **linh hoạt**: bỏ trống ⟹
   `min(12, số tháng tới endsBy)` qua `effectiveTermOf` của #15 để không luôn 422 (R-15b); giá trị nhập vượt ⟹ 422 như luật #15;
   bước nhu cầu ghi `APPROVED` bởi trưởng phòng (`deciderRole MANAGER`), trạng thái `AWAITING_SPEND_SUBMISSION` (hàng đợi trình
   của trưởng phòng); `replaces_assignment_id` = Assignment cũ. Audit `ACCESS_REQUEST.SUBMITTED` + `NEED_APPROVED` với
   `origin: 'TRANSFER_REPLACEMENT'`, `transferReviewId`.
3. Miễn trừ: không áp kiểm _đang giữ quyền cùng gói_ (`heldAccess`) khi Assignment đang giữ đúng là `replacesAssignmentId`; không
   áp cửa sổ 30 ngày (không phải Request tiếp tục); không áp luật người gửi của #4 cho nguồn này. Mọi kiểm khác giữ nguyên.
4. Từ chối khi tạo: `FinanceSetupIncompleteError` ⟹ **không** tạo Request, quyết định vẫn ghi, Audit
   `TRANSFER_REVIEW.REPLACEMENT_NOT_CREATED {problem: FINANCE_SETUP_INCOMPLETE}` (H6 xử lý nháp/trần). Lỗi nghiệp vụ khác
   (gói/ứng dụng đã ngừng, người thụ hưởng không còn làm việc, bên liên quan là Người duyệt chi) ⟹ toàn bộ thao tác bị từ chối
   422 `TRANSFER_REVIEW.REPLACEMENT_NOT_POSSIBLE` `details.reason` (mã gốc), không ghi gì; trưởng phòng chọn _không còn cần_.
5. Liên kết: `transfer_review_items.replacement_request_id` (FK `access_requests`, UNIQUE, ghi một lần NULL → giá trị trong trigger).
6. Đổi ý _còn cần → không còn cần_ khi dòng có `replacement_request_id`: 409 `TRANSFER_REVIEW.REPLACEMENT_REQUEST_OPEN`
   (rút Request thay thế — người gửi là trưởng phòng — thì listener kết cục thu hồi seat cũ, cùng kết quả).
7. Kết cục: `GRANTED` hoặc `ENDED_WITHOUT_GRANT` của Request liên kết ⟹ mở thu hồi seat cũ như hiện tại (`TransferReviewReplacementService`),
   khớp theo `replacement_request_id`; dòng không có liên kết vẫn khớp kiểu cũ.
8. Wire item: `needsNewRequest` (từ #18) đổi nghĩa thành _đang chờ Request thay thế_; thêm `replacementRequest`.
9. Migration (timestamp đặt lúc merge, R-19):
   - **M21a (Phần A)** `<ts>_transfer_review_item_reason`: `transfer_review_items.reason TEXT NULL` + CHECK `reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 500`.
     Không thêm CHECK `reason` bắt buộc theo `decision` (dòng đã quyết cũ không có lý do; `DEFAULT_REVOKED` của #18 do Hệ thống ghi không
     có lý do người dùng) — bắt buộc ở DTO. Guard hiện hành
     (`20261029100900_transfer_review_change_of_mind`) cho đổi mọi cột khi `PENDING` và ở lần đổi ý ⟹ không sửa guard. Dòng cũ NULL.
   - **M21b (Phần B)** `<ts>_transfer_replacement_request_link` (sau M11 của #18): `access_requests.replaces_assignment_id UUID NULL` FK
     `license_assignments` + index; `transfer_review_items.replacement_request_id UUID NULL` FK + UNIQUE; check `replacement_request_id IS NULL
OR decision = 'STILL_NEEDED'`; `transfer_review_item_guard` thêm: `replacement_request_id` chỉ đổi từ NULL.

## Test matrix

| AC / rủi ro            | Tình huống                                                  | Cấp test             | Kết quả mong đợi                                                                                                            | Bằng chứng sau implement |
| ---------------------- | ----------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `US-03-07` AC-3        | H2 chọn _còn cần_ Figma (K2) kèm `reason`                   | integration + HTTP   | một Request GRANT ở `P-FIN`, người thụ hưởng E1, nhu cầu `APPROVED` bởi H2, `AWAITING_SPEND_SUBMISSION`, liên kết hai chiều | planned                  |
| AC-3 nội bộ            | _còn cần_ K5                                                | integration          | không Request; dòng `STILL_NEEDED`, `replacementRequest = null`                                                             | planned                  |
| AC-3                   | Request thay thế được cấp                                   | integration          | thu hồi seat cũ (nguồn `TRANSFER_REVIEW`) khớp theo liên kết                                                                | planned                  |
| AC-3 / `US-03-12` AC-2 | Request bị từ chối hoặc rút                                 | integration          | thu hồi seat cũ                                                                                                             | planned                  |
| miễn trừ               | E1 đang giữ seat cùng gói (seat cũ)                         | unit + integration   | không lỗi `ALREADY_HOLDS_ACCESS`                                                                                            | planned                  |
| nguyên tử              | tạo Request lỗi giữa chừng                                  | integration          | không ghi quyết định, không Request                                                                                         | planned                  |
| thiếu CC               | phòng nhận chưa có Cost Center                              | integration          | quyết định ghi, không Request, Audit `REPLACEMENT_NOT_CREATED`                                                              | planned                  |
| từ chối                | gói đã ngừng                                                | HTTP                 | 422 `TRANSFER_REVIEW.REPLACEMENT_NOT_POSSIBLE`, không ghi gì                                                                | planned                  |
| `reason` (A)           | thiếu/rỗng/ > 500; đủ với `NOT_NEEDED`; đổi ý kèm lý do mới | HTTP + integration   | 422 `VALIDATION_ERROR` / 200, item `reason` / 200, `reason` mới, Audit giữ lý do cũ                                         | planned                  |
| `termMonths`           | bỏ trống / 6 / 0 / 13 / kèm `NOT_NEEDED` / kèm K5           | HTTP + integration   | 12 / 6 / 422 / 422 / 422 / 422 `TERM_NOT_APPLICABLE`                                                                        | planned                  |
| đổi ý                  | dòng có Request thay thế                                    | HTTP                 | 409 `TRANSFER_REVIEW.REPLACEMENT_REQUEST_OPEN`                                                                              | planned                  |
| đồng thời              | hai lần _còn cần_ cùng dòng                                 | integration          | một Request; lần sau 409 `DECISION_ALREADY_RECORDED`                                                                        | planned                  |
| ngân sách              | trình lô có Request thay thế                                | integration (sau #6) | đi qua kiểm ngân sách ba kết quả như Request thường                                                                         | planned                  |

## Definition of Done

- [ ] AC-3 (vế đã claim) có test đỏ-trước/xanh-sau; phần còn lại ghi đúng chủ.
- [ ] Quick gates xanh; `pnpm openapi:export`; báo FE (`transferReviewDecide.reason`, item `replacementRequest`).
- [ ] Spec/plan khớp implementation; README `requests` và `personnel` ghi capability/luồng mới.

## Open questions

Không có. Q-T1 đã đóng: Owner chốt 05/11/2026 — trưởng phòng nhập `termMonths` 1..12 khi chọn _còn cần_, bỏ trống = 12.
R-26 (C-REVIEW, Optional) chọn **chấp nhận như hiện tại**: người được điều chuyển không đọc kết quả kiểm ngân sách của Request thay
thế; trưởng phòng mới là người gửi và người quyết, nhận thông báo _bị chặn_ (#22).

## Changes and acceptance

- 05/11/2026: tạo spec (`draft`). Chưa nghiệm thu.
- 05/11/2026: Owner chốt Q-T1 (thêm `termMonths` tùy chọn vào quyết định rà soát).
- 05/11/2026 — chỉnh 05/11 theo review main flow (F17, F18): tách Phần A (`reason` + M21a) / Phần B (tự tạo Request, `termMonths`,
  liên kết, M21b); contract cuối của body quyết định; sửa C-REVIEW R-15(b) (mặc định gói linh hoạt), R-19 (M21a/M21b), R-26 (chấp nhận).

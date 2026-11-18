# Spec: qd96-100-request-sender-rules — đóng mọi đường gửi Request cho một người khác

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement ghi tên khi nhận.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-R, lượt `qd96-100-alignment`) theo giao việc Owner 05/11/2026.
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-3.2`, `FR-3.22`(1); US `US-05-02` AC-5, `US-05-17` AC-20/AC-21, `US-05-14` AC-6;
  `QĐ-100t`, `QĐ-100aa`, `QĐ-100ag`; QT 1.9), BE `3e4553b9`. Tự giải `S-01`, `S-17` và quyết định phiên Owner `Q-03` c1
  (QUESTIONS.md (nhật ký review đã xóa 11/11/2026 — xem git history) mục B, D). Ledger: L-201, L-202, L-203, L-206, L-218.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Không còn đường nào để một người gửi Request cấp quyền hay tiếp tục sử dụng cho **một** người khác: gỡ gửi thay
(`delegatedRequestSend`), gỡ nhánh trưởng phòng gửi Request tiếp tục cho nhân viên, Request nhóm phải có từ 2 người; IT Admin
không còn nhập ngày kết thúc lúc cấp; hoàn trả tự suy ra Request gốc. Kiểm được bằng unit policy và test HTTP từ chối.

## Sizing decision

- Container: G5 và bó finding `qd96-100-alignment` (giao việc Owner 05/11/2026) — container, không phải ranh giới.
- Mode: `grouped-stories`.
- Outcome and owner: luật người gửi `QĐ-100t` ở mọi điểm tạo Request; capability `requests/{delegated-request, renewal-request,
group-request, return-request}` và `licensing/provisioning` (bỏ một trường input).
- Boundaries: không migration; gỡ một route ghi; `grantQueueList` giữ nguyên path/operationId, chuyển sang capability riêng.
- Not larger: định tuyến dòng trưởng phòng và người mới xếp phòng tương lai (`qd96-100-head-group-request-queue`); trưởng phòng
  tự gửi Request cá nhân (`QĐ-100l`, chờ mentor — không đụng); Request cấp thay thế MF-3 (`qd96-100-transfer-replacement-request`).
- Not smaller: cùng một luật nghiệp vụ, cùng một bộ test từ chối; tách theo route để lại giai đoạn còn một cửa gửi thay.
- Siblings: `qd96-100-head-group-request-queue`, `qd96-100-request-term-limit`, `qd96-100-approved-end-date`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5) — dòng map do điều phối viên đăng ký.

## Primary Story/AC

| Story    | AC    | Coverage | Phần còn lại thuộc                                                                                                                                                             |
| -------- | ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-05-02 | AC-5  | partial  | AC-5 vế trước QĐ-96: `g5-request-submission-and-routing`, `g5-delegated-requests`; AC còn lại: chủ ở map G5 (`g5-request-amount-and-payment-schedule`, `g5-group-requests`, …) |
| US-05-17 | AC-21 | partial  | AC-21 vế người mới xếp phòng tương lai: `qd96-100-head-group-request-queue`                                                                                                    |

## Supporting references

`QĐ-100t` (PD:497), `QĐ-100aa` (PD:504), `S-01` (nhóm của mọi người gửi tối thiểu 2 dòng), `S-17` + `Q-03` c1 (IT không
nhập ngày kết thúc khi cấp; rút ngắn đi hoàn trả), `US-05-14` AC-6 (không có thao tác tạo thay), `US-05-17` AC-20 vế 1.
Nợ tài liệu: câu chữ `QĐ-62a`, `QĐ-94c(2)` còn _trưởng phòng tạo thay_ (LEDGER K-2) — `QĐ-100t` thay.

## Explicit out of scope

- `QĐ-100l`/`QĐ-100ah` (L-990): trưởng phòng **vẫn** tự gửi Request cá nhân và Request tiếp tục cho chính mình như hiện nay.
- Request tiếp tục nhóm của trưởng phòng (`QĐ-100ab`) — `qd96-100-new-request-types` (hoãn H4).
- MF-3 _còn cần_: từ hạng mục này tới khi có `qd96-100-transfer-replacement-request`, người được điều chuyển **tự gửi**
  Request ở phòng nhận (không còn đường trưởng phòng gửi thay). Ghi chú cho demo.
- `termConfirmation` ở các DTO còn lại, trần 12 tháng: `qd96-100-request-term-limit`. Ngày kết thúc do server tính:
  `qd96-100-approved-end-date`. Đổi người chịu trách nhiệm tài khoản dịch vụ (`Q-03` d1): `qd96-100-catalog-licensing-api-fields`.
- Cột `access_requests.delegated_batch_id` và dữ liệu cũ: giữ, không ghi mới (`Q-02` B); không drop.

## Dependencies and blockers

Không có blocker. Không migration. Đi đầu Track R; `qd96-100-request-term-limit` xây trên DTO đã gỡ ở đây.

## Ownership: module, data, API

- `requests/delegated-request/`: xóa `DelegatedRequestService`, policy, submission mapper, `DelegatedBodyDto/ResponseDto`, lỗi
  `DelegatedRequestRefusedError` + mã `DELEGATED_REQUEST.*` và ví dụ OpenAPI. `GrantQueueService/Repo` + controller
  `grantQueueList` chuyển sang capability mới `requests/grant-queue/` (theo `docs/rules/module-structure.md`; cùng path `GET /grant-queue`).
- `requests/renewal-request/`: `checkRenewalSender` chỉ còn người giữ quyền; bỏ `byHead`, `confirmNeed`, nhánh tự áp dụng,
  `DELEGATED_ROW`, `termConfirmation` (chỉ nhánh trưởng phòng dùng), lỗi `TERM_CONFIRMATION_REQUIRED`, `END_PASSED`.
- `requests/group-request/`: `checkLineCount` thêm `tooFew: { min: 2 }`.
- `requests/return-request/`: bỏ input `fromRequestId`; server tính.
- `licensing/provisioning/provisioning.dto.ts`: bỏ `grantBodySchema.expectedEndDate`; writer chỉ dùng ngày từ Request.
- API: **xóa** `POST /delegated-requests` (`delegatedRequestSend`). **Đổi** `accessRequestRenewalSubmit`, `groupRequestSubmit`/`groupRequestCheck`,
  `returnRequestSubmit`, `provisioningTaskGrant`, `grantQueueList` (response bỏ `delegatedBatchId`), `accessRequestGet` (bỏ `delegatedBatchId`).

## Behavior and design

1. **Gửi thay:** route và service bị gỡ; Nest không còn đăng ký → `404` mặc định. Không thêm mã mới.
2. **Request tiếp tục:** người gọi khác người giữ quyền (kể cả trưởng phòng cùng phòng) → `403 RENEWAL_REQUEST.NOT_HOLDER`
   (gộp `OUTSIDE_DEPARTMENT` vào `NOT_HOLDER`: không còn ai ngoài người giữ có tư cách). Trưởng phòng tự gia hạn quyền của
   **chính mình** vẫn đi như nhân viên (L-990). Không còn ghi nhu cầu _đã xác nhận_ lúc gửi, không còn tự áp dụng khi gửi.
3. **Request nhóm:** sau khử trùng, số người khác nhau < 2 → `422 GROUP_REQUEST.TOO_FEW_LINES` `{ min: 2 }`, áp cho **mọi**
   người gửi (S-01); `groupRequestCheck` trả `tooFewLines: { min: 2 } | null`. DTO giữ `min(1)` để lỗi là lỗi nghiệp vụ có lý do.
   Trần giữ nguyên (`QĐ-82h`). Bản nháp nhóm 1 dòng vẫn lưu được; gửi bản nháp → cùng lỗi.
4. **Cấp quyền:** `provisioningTaskGrant` gửi `expectedEndDate` → `422 VALIDATION_ERROR` (strict object). Ngày kết thúc của
   Assignment = ngày Request trả về (`claimed.expectedEndDate`); IT muốn rút ngắn thì đi hoàn trả (`Q-03` c1, đóng L-206).
5. **Hoàn trả:** bỏ `fromRequestId` khỏi input; `originRequestId` = Request đã cấp seat (`grantRequestId`) khi Request đó
   `COMPLETED` và người gửi là người yêu cầu/thụ hưởng của nó (luật `originMatches` hiện có), ngược lại `null` — không lỗi.
6. Transaction/khóa: giữ nguyên của từng route. Không migration, không job.

Tương thích: FE gỡ form gửi thay, ô ngày kết thúc ở màn cấp, `fromRequestId`; client sinh lại sau CP-1. Seed không dùng gửi thay
(đã grep `src/cli`); test HTTP/integration có gọi `delegated-requests` phải sửa (xem plan).

### Phần A — FE nối tối nay (chỉnh 05/11 theo review main flow F04, F03 vế IT)

**Mức FE-tonight: A** cho mục 1–4, bỏ `delegatedBatchId` khỏi response và dời `grantQueueList` sang `requests/grant-queue/`
(plan Task 1 — refactor cơ học, giữ path/operationId; là điều kiện để Task 2 xóa thư mục). **B:** mục 5 (hoàn trả
`fromRequestId` — không thuộc MF-1).

| Operation (vai)                                                                           | Hiện tại                                                                                                             | Sau sửa                                                                                            | Lỗi                                                                                           |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `delegatedRequestSend` `POST /delegated-requests` (trưởng phòng)                          | gửi Request cho 1..n nhân viên                                                                                       | **gỡ route**                                                                                       | 404 (Nest mặc định); OpenAPI không còn operation                                              |
| `accessRequestRenewalSubmit` `POST /access-requests/renewals`                             | người giữ **hoặc** trưởng phòng của người giữ                                                                        | chỉ **người giữ quyền** (body ở `qd96-100-renewal-chaining-and-window`)                            | 403 `RENEWAL_REQUEST.NOT_HOLDER`                                                              |
| `groupRequestSubmit` / `groupRequestCheck` (Employee ≤ 10 người cùng phòng; trưởng phòng) | `lines` min 1                                                                                                        | DTO giữ `min(1)`; nghiệp vụ: ≥ 2 người khác nhau sau khử trùng                                     | submit: 422 `GROUP_REQUEST.TOO_FEW_LINES {min: 2}`; check: `tooFewLines: {min: 2} \| null`    |
| `provisioningTaskGrant` `POST /provisioning-tasks` (IT Admin)                             | `{requestId, subscriptionId?, accountIdentifier?, expectedEndDate?, responsibleEmployeeId?, beneficiaryEmployeeId?}` | **bỏ** `expectedEndDate`; còn lại giữ (IT chọn nguồn seat, định danh công ty, người của dòng nhóm) | gửi `expectedEndDate` ⟹ 422 `VALIDATION_ERROR`; ngày kết thúc Assignment = ngày Request (#20) |
| Response `accessRequestGet`, `grantQueueList`                                             | `delegatedBatchId`                                                                                                   | bỏ                                                                                                 | —                                                                                             |

Trưởng phòng tự gửi Request cá nhân/tiếp tục cho **chính mình** giữ như hiện nay (`QĐ-100l`/`QĐ-100ah` chờ mentor — L-990).

## Test matrix

| AC / rủi ro      | Tình huống (gồm từ chối, edge case)                                               | Cấp test           | Kết quả mong đợi                             | Bằng chứng sau implement |
| ---------------- | --------------------------------------------------------------------------------- | ------------------ | -------------------------------------------- | ------------------------ |
| `US-05-02` AC-5  | `POST /delegated-requests`                                                        | http               | 404; OpenAPI không còn operation             | planned                  |
| `US-05-02` AC-5  | Trưởng phòng gửi Request tiếp tục cho `E1` cùng phòng                             | unit policy + http | 403 `NOT_HOLDER`, không ghi gì               | planned                  |
| L-990 giữ        | Trưởng phòng gửi Request tiếp tục cho quyền của chính mình                        | unit               | hợp lệ như nhân viên                         | planned                  |
| `US-05-17` AC-21 | Trưởng phòng gửi nhóm chỉ `E1`; chỉ chính mình; `[E1, E1]`                        | unit + http        | 422 `TOO_FEW_LINES`                          | planned                  |
| S-01             | Nhân viên gửi nhóm 1 dòng                                                         | http               | 422 `TOO_FEW_LINES`                          | planned                  |
| `US-05-17` AC-21 | Trưởng phòng gửi nhóm `E1` + chính mình                                           | http               | 201                                          | planned                  |
| L-206            | `provisioningTaskGrant` có `expectedEndDate`                                      | http               | 422 `VALIDATION_ERROR`                       | planned                  |
| L-206            | Cấp Request nhà thầu có ngày                                                      | integration        | Assignment mang đúng ngày của Request        | planned                  |
| L-218            | Hoàn trả seat cấp từ `R1` `COMPLETED`; seat không có Request; gửi `fromRequestId` | unit + http        | `originRequestId=R1`; `null`; 422            | planned                  |
| L-201            | `grantQueueList`                                                                  | http               | 200, cùng path; không còn `delegatedBatchId` | planned                  |
| Gate             | module graph / api coverage manifest                                              | gates              | xanh sau khi cập nhật manifest               | planned                  |

## Definition of Done

- [ ] Mọi primary AC có test đỏ-trước/xanh-sau; `US-05-17` AC-21 ghi rõ chỉ vế tối thiểu 2.
- [ ] Gate nhanh xanh (typecheck, lint, arch, rules, gates, openapi) + test theo file; HTTP đổi thì OpenAPI export.
- [ ] Spec/plan phản ánh implementation; báo FE các op đổi/bỏ.
- [ ] Không tăng legacy ledger kiến trúc; capability `grant-queue` đăng ký đúng rule module.
- [ ] README module `requests` cập nhật (bỏ gửi thay).

## Open questions

Đợt 1 (06/11/2026): các spec integration dùng `sendDelegated`/gửi thay (`test/integration/audit/request-status-projection`, `requests/{access-request-withdrawal,finance-setup-gate,my-requests,request-status-notifications,requests-dashboard-facts,spending-approver-grant-blockers,spending-approver-party}`) và kịch bản trưởng phòng gửi Request tiếp tục trong `test/integration/licensing/renewal-request.integration-spec.ts` chưa được viết lại sau khi gỡ route — cần đổi sang Request do chính người thụ hưởng gửi. Chưa chạy.

## Changes and acceptance

05/11/2026: bản đầu. Chưa nghiệm thu.
05/11/2026 (chỉnh 05/11 theo review main flow: F04, F03 vế IT): mức FE-tonight **A** (mục 1–4, bỏ `delegatedBatchId`) / **B**
(hoàn trả `fromRequestId`); bảng contract FE. Không có phát hiện C-REVIEW mở cho hạng mục này. Vẫn `draft`.
05/11/2026 (điều phối viên, gỡ lỗi `rules:check`): `US-05-02` AC-5 `full` → `partial` — map G5 chia Story này cho nhiều hạng mục
(AC-5 vế cũ giữ chủ `g5-request-submission-and-routing`). Không đổi thiết kế.

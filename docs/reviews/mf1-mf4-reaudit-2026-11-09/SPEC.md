# SPEC — Sửa BE cho đúng MF-1 và MF-4 (QĐ-103 → QĐ-109) + bổ sung API MF-1

- Ngày: 09/11/2026. Viết bởi chat review (Claude) theo yêu cầu Owner: _review/verify/audit tài liệu vừa cập nhật, kiểm code BE theo MF-1 và
  MF-4, lên spec/plan sửa toàn bộ MF-1, MF-4 và luồng phụ, bổ sung API MF-1 còn thiếu_.
- Trạng thái: **draft — chờ Owner duyệt**. Kế hoạch thực hiện: [PLAN.md](PLAN.md).
- Pin: Docs **`5bb2e6a`** (BRD 4.11, QT 1.8, sổ `QĐ-01` → `QĐ-109` — commit trên main, chưa push). BE nhánh
  `feat/qd103-108-mf145`, HEAD `c21eea94` + 12 file chưa commit của chat code trước (MF-4 R9).
- Bằng chứng (đọc khi cần chi tiết — spec này **không** chép lại):
  - [A1-DOCS-AUDIT.md](A1-DOCS-AUDIT.md) — §2 là **bảng luật chuẩn để code**: 41 luật con MF-1 (`BR-MF1-01a` … `09e`) + 16 luật con MF-4, mỗi
    luật có căn cứ `file:dòng` và tham số mặc định. §3 mâu thuẫn Docs `D-01…D-25`, §4 điểm mơ hồ `M-01…M-28`.
  - [A2-MF1-CODE-AUDIT.md](A2-MF1-CODE-AUDIT.md) — ma trận 57 luật MF-1 → code, finding `C1-01…C1-23`, lỗi spec cũ `S1-01…S1-10`, code luật cũ
    cần gỡ (§5).
  - [A3-MF4-CODE-AUDIT.md](A3-MF4-CODE-AUDIT.md) — ma trận 40 bước/luật MF-4, finding `C4-01…C4-16`, trạng thái `F-105…F-116`, lỗi spec `S4-01…S4-08`,
    API MF-4 thiếu theo vai (§7).
  - [A4-MF1-API-GAP.md](A4-MF1-API-GAP.md) — 55 nhu cầu API MF-1 × vai; hợp đồng đề xuất `P0-01…P0-05`, `P1-01…P1-11`, `P2-01…P2-10`; endpoint
    luật cũ cần bỏ (§4).
  - Thiết kế chi tiết từng phần đã có (chat trước, **chưa code**): `docs/workspace/items/qd103-*/{spec,plan}.md`. Spec này dùng lại chúng làm
    thiết kế chi tiết và chỉ ghi **phần phải sửa** (delta) ở §4.
- Skill dùng khi viết: `spec-driven-development`, `superpowers:writing-plans`, `api-and-interface-design`,
  `superpowers:verification-before-completion`.

## 1. Mục tiêu và điều kiện xong

**Mục tiêu.** BE chạy đúng nghiệp vụ hiện hành của:

- **MF-1** _Xin và cấp quyền dùng phần mềm_ — gồm Request tiếp tục (`SBF-03`), phần mềm mới (`SBF-15`), thực thi cấp (`SBF-17`), cấp từ kho dùng
  chung (phần `SBF-20` MF-1 dùng), nộp hóa đơn mua hàng và Finance xác nhận (`SBF-19`), giải phóng cam kết khi thu hồi (phần `SBF-03a`/`SBF-18` gọi).
- **MF-4** _Chốt ngân sách phần mềm năm của từng phòng_ — B1 → B7, đóng năm 01/01, khoản cam kết tự tạo 01/01, số liệu dùng cho kiểm tra ngân sách.

FE phải có đủ API để demo MF-1 từ đầu tới cuối theo từng vai (Employee, trưởng phòng, Người duyệt chi, IT Admin, Finance, Super Admin chỉ xem cờ).

**Điều kiện xong (kiểm được):**

1. Mọi nhánh của `BR-MF1-01…09` và `BR-MF4-01…06` (theo bảng luật con A1 §2, đã áp `QĐ-109`) có ít nhất một test (unit hoặc integration) đặt tên
   theo mã luật, và test đó xanh.
2. Không còn đường code của luật cũ ở §5 (Finance rà soát Request, hỏi Finance, override, giá trị cao, cam kết nhiều năm, lịch trả, `termMonths`
   bắt buộc, kho theo phòng, Finance tự ghi hóa đơn, phiên bản `REVISION`, khoảng mua/dòng kế hoạch). Enum/cột chỉ giữ khi cần đọc dữ liệu cũ, có
   CHECK chặn ghi mới.
3. Mọi API P0 + P1 ở §3 có trong `openapi.json`, đúng vai, có ví dụ, và tài liệu FE `Docs/Figma UI-UX/API-Integration/` được sinh lại từ BE.
4. Job 01/01 tạo khoản cam kết năm mới **đã merge vào `dev` trước 15/12/2026** (hạn cứng — C1-10).
5. Quick check set xanh sau mỗi gói; Owner chạy `pnpm check` + toàn bộ suite một lần ở cuối (W9 cũ).
6. Demo seed có đủ dữ liệu chạy MF-1 (cá nhân, nhóm, một bước, nội bộ, phần mềm mới, dùng dự phòng, bị chặn, cấp từ kho, mua khi hết kho, `K1`,
   `K4`, tiếp tục, hóa đơn) và MF-4 (B1 → B6, phòng không trưởng phòng) — tham chiếu kịch bản `qd103-seed-demo-v4`, chỉ phần MF-1/MF-4.

## 2. Hiện trạng (tóm tắt audit 09/11)

| Phạm vi                   | Đúng | Một phần | Sai | Thiếu | Ghi chú                                                                                                                           |
| ------------------------- | ---- | -------- | --- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| MF-1 (57 luật con, A2)    | 19   | 8        | 18  | 12    | Code vẫn theo mô hình QĐ-96→100; W1 đã gỡ cắt 31/12 và `FISCAL_YEAR_START_MONTH`; **chưa có dòng code nào của W3/W4**             |
| MF-4 (40 bước/luật, A3)   | 23   | 9        | 2   | 6     | B1/B2, B4–B7 đúng; thiếu loại dòng/ZBB/xếp hạng/cờ vượt của `BM-10`; 2 SAI là kiểm tra ngân sách + cam kết nhiều năm (thuộc MF-1) |
| API MF-1 (55 nhu cầu, A4) | 19   | —        | 20  | 16    | + 8 operation luật cũ thừa; tài liệu FE `flows/paid-access-request.md` vẫn theo luồng Finance rà soát                             |

Hai lỗi Critical (đã tự kiểm lại trong code):

- **C1-01** — kiểm tra ngân sách còn luật cũ: năm thiếu tiền ⟹ Finance rà soát ⟹ duyệt đòi `override` (`requests/spend/spend-decision.policy.ts:62-75`),
  body duyệt không nhận `override` ⟹ Request có kỳ trả ở năm chưa có ngân sách không duyệt được.
- **C1-02** — giá và cấp gắn phòng sở hữu thuê bao (`licensing/assignment/assignment.policy.ts:34-43` + trigger DB): người phòng khác không xin được
  giá, IT không cấp được ⟹ kho dùng chung không chạy.

## 3. API MF-1 cần có (đích)

Hợp đồng chi tiết (body, response, mã lỗi) ở A4 §3 và ở spec hạng mục ghi trong cột cuối. Ưu tiên: **P0** chặn demo end-to-end, **P1** cần cho
đúng luật, **P2** tiện ích (làm khi còn thời gian, theo §4 gói MF1-K).

| ID       | Thay đổi                                                                                                                                                                                                                                                    | Vai                            | Gói               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------- |
| P0-01    | `accessRequestSubmit/Preview/Propose`, `groupRequest*`, `accessRequestDraft*`: bỏ `termMonths`, lịch trả, trường báo giá kỳ; thêm `expectedEndDate?` (bắt buộc với nhà thầu/thực tập, ≤ ngày gửi + 12 tháng − 1); `pricing` mới (giá tháng × tháng còn lại) | Mọi tài khoản tự phục vụ       | MF1-A             |
| P0-02    | Cùng các route trên: GH-1/2/3, `manyPaidSoftwareReason` theo **từng dòng**, `limits` trong preview, 409 `ACCESS_REQUEST.OPEN_LIMIT_REACHED`; Request nhóm vi phạm ⟹ 422 kèm danh sách dòng vi phạm (`QĐ-106g`)                                              | Mọi tài khoản                  | MF1-E             |
| P0-03    | `budgetCheckGet/YearList` (chuyển khỏi `finance-review/`, giữ operationId — D-1), `spendQueueList`, `spendBatch*`, `spendApprovalList/Get`: ba kết quả, `budgetSnapshot` (số cơ sở, dự phòng, đã cam kết, chờ duyệt chi, còn lại hai mức), gỡ nhánh Finance | Trưởng phòng, Người duyệt chi  | MF1-B             |
| P0-04    | `POST /api/v1/access-requests/{id}/reserve-confirmation` `{ reason }` + `reserveConfirmations?[]` trong body `spendBatchSubmit` (S1-05)                                                                                                                     | Trưởng phòng                   | MF1-B             |
| P0-05    | `provisioningTaskGrant`: bỏ ràng buộc phòng sở hữu; `subscriptionId` **tùy chọn** (BE suy ra thuê bao chính của (ứng dụng, gói)); `purchase?` để mua khi kho hết; `K1` tự +1 số lượng                                                                       | IT Admin                       | MF1-F             |
| P1-01    | Request một bước (trưởng phòng tự gửi, phòng không trưởng phòng), nội bộ cấp thẳng + cờ audit; `POST /api/v1/access-requests/{id}/resubmission`                                                                                                             | Mọi tài khoản, Người duyệt chi | MF1-D             |
| P1-02    | `groupRequestCheck/Submit/CandidateList`: loại trưởng phòng khỏi nhóm (`HEAD_IN_GROUP`). Trần số người của nhóm do trưởng phòng gửi **giữ như code** (Owner 09/11)                                                                                          | Trưởng phòng                   | MF1-D             |
| P1-03    | `accessRequestRenewalSubmit`: cửa sổ 30 ngày (tham số), ≤ 12 tháng/lần, nhận **ngày kết thúc mới**; 409 `RENEWAL_REQUEST.WINDOW_NOT_OPEN`; duyệt ⟹ tác vụ IT kéo dài (không tự kéo dài)                                                                     | Người giữ quyền, IT Admin      | MF1-H             |
| P1-05    | `accessRequestDraftSave` thêm kind `PROPOSAL`/`RENEWAL`; `GET /api/v1/access-requests/drafts/{id}`                                                                                                                                                          | Mọi tài khoản                  | MF1-K             |
| P1-06    | `accessRequestSupplementAdd`: giảm được thời hạn/số người; người yêu cầu Request một bước gọi được                                                                                                                                                          | Người yêu cầu, trưởng phòng    | MF1-A             |
| P1-07    | `provisioningTaskGrant/Complete` nhận `K4`; `POST /api/v1/license-keys/{id}/withdrawal`                                                                                                                                                                     | IT Admin                       | MF1-I             |
| P1-08    | `/api/v1/purchase-invoices` — `POST`, `PUT {id}`, `GET`, `GET {id}`, `POST {id}/confirmation`, `POST {id}/return`; gỡ `budgetCommitmentInvoiceRecord`                                                                                                       | IT Admin, Finance              | MF1-G             |
| P1-09    | `meAccessRequestList` thêm `involvement`; `GET /api/v1/departments/{id}/access-requests`, `GET /api/v1/access-requests`, `GET /api/v1/access-requests/{id}/events`; mở quyền đọc `accessRequestGet` theo vai                                                | Mọi vai theo SoD               | MF1-K             |
| P1-10    | `GET /api/v1/access-request-audit-flags` (không số tiền)                                                                                                                                                                                                    | Super Admin                    | MF1-K             |
| P1-11    | `purchaseInvoiceConfirm` thêm `deductibleTax?`, `nonDeductibleTax?`                                                                                                                                                                                         | Finance                        | MF1-G             |
| P2-01    | `continuation { windowOpensOn, canRequestNow, pendingRequestId }` trên `meSoftwareRightList`, `departmentMemberSoftwareRightList`                                                                                                                           | Người giữ quyền, trưởng phòng  | MF1-H             |
| P2-02    | Preview thêm `annualVendorAmount` (tiền trả nhà cung cấp cả năm khi mua gói năm lần đầu)                                                                                                                                                                    | Mọi tài khoản                  | MF1-A             |
| P2-03    | `grantQueueList` item thêm `stock { kind, free, inRevocation }`                                                                                                                                                                                             | IT Admin                       | MF1-F             |
| P2-04    | `POST /api/v1/provisioning-tasks/{id}/invitation` + nhắc 3 ngày + cho đóng sau 14 ngày (`SBF-17`)                                                                                                                                                           | IT Admin                       | MF1-K             |
| P2-05    | Bỏ `businessOwnerEmployeeId`, `proposedBusinessOwnerEmployeeId` ở `SBF-15`                                                                                                                                                                                  | IT Admin                       | MF1-D             |
| P2-06…08 | Việc tồn hóa đơn, hồ sơ sai lệch `SBF-11a`, cờ Finance tự xác nhận                                                                                                                                                                                          | IT Admin, Finance, Super Admin | MF1-G (followups) |

**Ngoài đợt này (Owner chọn sau):** `P1-04` Request tiếp tục nhóm (W8b, Q-120), `P2-09` dashboard Người duyệt chi (W8b).

**API MF-4 cần thêm** (A3 §7): trưởng phòng đọc Trần của phòng (3 thành phần) + hạn kỳ; `budgetMine` đủ số; Người duyệt chi đọc
`budgetTable/summary`; dòng `BM-10` có `lineType`/`zbb`/`priorityRank` + cờ vượt + thứ hạng ở gói và màn quyết B5; gói có trạng thái trưởng
phòng/điều kiện BASELINE từng phòng. Ngoài đợt (W8b): lịch sử đổi Trần năm, danh sách cam kết của phòng cho trưởng phòng.

## 4. Thiết kế theo gói

Mỗi gói = hạng mục `qd103-*` đã thiết kế (đọc `spec.md` + `plan.md` của nó) **cộng các delta bắt buộc dưới đây**. Khi delta và spec hạng mục
khác nhau, **delta thắng**. Thứ tự và phụ thuộc ở [PLAN.md](PLAN.md).

### MF4-A — Đóng R9 của số liệu nền (diff chưa commit) — S

Hạng mục: `qd103-budget-baseline-annual-check` (sửa R9). Delta: sửa C4-03 (viết lại 3 assertion integration theo `params.departmentId`), thêm test
C4-04 (unit `subscriptionCost` 3 ca, `willRenew` hết hôm nay; integration `VENDOR_REFUSED`), C4-07 (`hasSuccessor` chỉ khi kỳ kế tiếp `ACTIVE`),
C4-09 (loại phòng đã có phiên bản khỏi `missing`), C4-08(a) (giữ gợi ý _Renew_ khi kỳ kế tiếp chưa bắt đầu), F-115 (ADR-0018 + `security-jobs.md`).
Ghi trong mô tả thông báo: param `BUDGET_NO_HEAD_AT_DEADLINE` đổi `departmentCount` → `departmentId`.

### MF1-A — Số tiền, thời hạn, nguồn giá, ngày bắt đầu quyền — L

Hạng mục: `qd103-request-amount-and-term` + §2 _Giá Request_ của `qd103-grant-from-shared-pool` (`pickPriceSource`, `requestable-software`). Delta:

- **Nguồn giá** = thuê bao chính của (ứng dụng, gói), không theo phòng (S1-02, C1-02 phần giá).
- **Mốc tính** (`QĐ-109e`): lúc gửi chỉ tạm tính để hiển thị; Request qua lô tính số tiền **và** năm theo **tháng trình lô**; Request một bước
  tính lúc gửi; lúc duyệt tính lại theo tháng duyệt và giá hiệu lực ngày duyệt (M-18).
- **Số tháng**: tháng đầu tính đủ, tháng kết thúc tính đủ, làm tròn lên (M-02); trần ngày kết thúc = ngày gửi + 12 tháng − 1 ngày (M-04).
- **Request tiếp tục có kỳ mới trọn năm sau** (`QĐ-109b`): số tiền năm hiện tại = 0, vẫn qua Người duyệt chi; response có
  `nextYearAmount` để màn duyệt hiển thị; không kiểm theo ngân sách năm sau.
- **Ngày bắt đầu quyền** = ngày tác vụ cấp **hoàn tất** (S1-01, C1-16): `provisioningTaskComplete` ghi cột mới `granted_on` = ngày hoàn tất
  (**không** sửa `valid_from` — RV-04), tính lại ngày kết thúc `min(expectedEndDate, hoàn tất + 12 tháng − 1)`.
- Thêm `annualVendorAmount` vào preview (P2-02, D-3); hồ sơ bổ sung giảm được thời hạn (P1-06, C1-22).
- Gỡ: `termMonths` bắt buộc, `expected_spend_on`/`payment_schedule` (chỉ ngừng ghi; drop cột ở gói dọn), wire lịch trả, trường báo giá kỳ,
  thuế ước tính trong số tiền kiểm (A2 §5 nhóm 5).

### MF1-B — Kiểm tra ngân sách ba kết quả + cam kết một năm — L

Hạng mục: `qd103-budget-check-three-outcomes` + `qd103-commitment-current-year` (gộp — S1-07, S4-08). Delta:

- **Request đang chờ duyệt chi** trừ vào _còn lại_ = mọi Request đã kiểm, kết quả _trong số cơ sở_ hoặc _dùng dự phòng_ (kể cả chưa xác nhận),
  chưa quyết; **không** tính Request bị chặn (M-05 — TẠM CHỌN A). Định nghĩa này là nguồn duy nhất cho `budget-views` (S4-05).
- Xác nhận dự phòng: cả trong body `spendBatchSubmit` (`reserveConfirmations[]`) và endpoint riêng (S1-05). Xác nhận đã ghi còn hiệu lực khi
  trưởng phòng đổi; việc chưa xác nhận chuyển kế nhiệm (M-11).
- Chuyển `budgetCheckGet`, `budgetCheckYearList` + `spend-view.service.ts`, `spend-years-view.service.ts` sang capability `spend` trước khi xóa
  `finance-review/` (D-1); giữ operationId.
- Kiểm lại lúc duyệt theo **Cost Center hiện hành** của phòng; khác Cost Center của lần kiểm trước hoặc không có phiên bản ⟹ _bị chặn_, trả về
  người yêu cầu và trưởng phòng; khoản cam kết cũ ở lại Cost Center cũ (M-12 — TẠM CHỌN).
- `PRICE_EXPIRED` chỉ xét báo giá (mô hình chưa có hạn giá gói — S1-08, ghi rõ trong mô tả API).
- Khoản cam kết chỉ năm hiện hành; không ghi khoản khi không có phiên bản đã duyệt.
- Gỡ toàn bộ nhóm 1–3 và 6 của A2 §5 (Finance rà soát, hỏi Finance, override/giá trị cao, dòng kế hoạch trong kiểm). Dữ liệu Finance cũ: theo
  Q-26 của spec hạng mục (demo seed lại — migration đơn giản, không judgement preflight).

### MF1-C — Khoản cam kết tự tạo 01/01 — M (hạn cứng)

Hạng mục: `qd103-new-year-auto-commitments`. Delta theo `QĐ-109a`: **chỉ** Request có quyền `K1`/`K2` đang chạy ngày 01/01 hoặc đã duyệt
chưa cấp; **bỏ** khoản theo Assignment không Request (bỏ `request_id` nullable, `assignment_id`, đổi `budgetCommitmentList`, phần mở rộng
listener thu hồi cho khoản theo Assignment). Bỏ phụ thuộc `ROLE_BASED`/`K4` (điều kiện loại đọc mặc định — S1-03). Giá hiệu lực 01/01 (M-08).
Năm chưa có phiên bản đã duyệt ⟹ khoản ghi _chưa có ngân sách_, tự gắn khi phiên bản được duyệt (theo spec hạng mục). Chạy lại không tạo trùng.

### MF4-B — Dòng `BM-10` và dọn phiên bản cũ — L

Hạng mục: `qd103-budget-proposal-lines-cleanup` (lát 1 `c21eea94` đã có luật thuần). Delta:

- Cờ vượt và mọi so sánh với Trần của phòng dùng **Trần đã phát hành** (`published_total_minor`) (S4-01 — TẠM CHỌN).
- Dòng **Cancel**: số tiền chỉ hiển thị, **không** cộng vào tổng đề xuất, tổng gói B4, cờ vượt (`QĐ-109c`; sửa C4-16).
- ZBB `KPI-3` < 70 % **chỉ** dòng Renew/Change (`QĐ-109d`); `kpi3` theo `planId` của dòng (C4-15). ZBB _đơn giá tăng > 10 %_ so với giá tháng
  quy đổi hiện hành của gói (M-17 — TẠM CHỌN A).
- Migration rút gọn (S4-04): một migration `RAISE` nếu còn `REVISION`/`SUPERSEDED`/`budget_version_line_changes`, không judgement preflight;
  enum lịch sử giữ.
- Phiên bản BASELINE dùng `lineType` (C4-14); gói trả `baselineAllowed`/`headStatus` từng phòng (C4-13); gỡ code chết C4-11.
- Không làm nháp `BM-10` cho phòng chưa có Cost Center (C4-12 — FE giữ nháp cục bộ; TẠM CHỌN).

### MF4-C — Màn ngân sách theo vai — M

Hạng mục: `qd103-budget-views`. Delta: làm **sau MF1-B Task 2**; dùng định nghĩa _Request đang chờ duyệt chi_ của MF1-B (S4-05); trưởng phòng
đọc Trần của phòng (đã phát hành) + hạn nộp/hạn duyệt (C4-06); Người duyệt chi đọc `budgetTable/summary`; B4 cộng mỗi Cost Center phiên bản
mới nhất ở _chờ quyết_/_yêu cầu sửa_/_hiện hành_ + bản đang gửi, không tính nháp (M-19 — TẠM CHỌN A). Số liệu nền ghi
`basis: OWNER_DEPARTMENT` tới khi chi phí seat-tháng (W5) có (C4-05).

### MF1-D — Request một bước, nhóm, phần mềm mới — L

Hạng mục: `qd103-request-single-step-routing`. Delta: Request **mới** gửi khi trưởng phòng đã rời mà kế nhiệm chưa có hiệu lực ⟹ một bước (M-15;
thay `Q-25` A); Request nội bộ đang chờ khi phòng mất trưởng phòng ⟹ chờ có kiểm soát (M-23); `HEAD_IN_GROUP`; trần nhóm của trưởng phòng
giữ như code; _không kiểm soát được_ bắt buộc phương án thay thế (C1-17); bỏ Business Owner ở `SBF-15` (P2-05). Gỡ nhóm 4 và 9 của A2 §5.

### MF1-E — Giới hạn GH-1/2/3 — M

Hạng mục: `qd103-request-limits-gh`. Delta: lý do GH-3 theo **từng dòng** của Request nhóm (thay `Q-30` A); xin **gói khác** của phần mềm đang
dùng ở mức 10 ⟹ không gắn cờ (M-16); GH-1/GH-2 không áp cho tài khoản dịch vụ và người thôi vai theo `QĐ-108c`.

### MF1-H — Request tiếp tục — M

Hạng mục: `qd103-renewal-request-window`. Delta: duyệt ⟹ tạo **tác vụ IT kéo dài** (kind `EXTEND`, đóng bằng `provisioningTaskComplete`); ngày kết
thúc mới chỉ ghi khi IT xác nhận (M-14; thay `Q-03` A, C1-23). Body nhận `newEndDate` (QT 1.1 _nhập ngày kết thúc mới_), BE tính số tháng;
≤ 12 tháng mỗi lần (`QĐ-108a`). Số tiền theo MF1-A (gồm `QĐ-109b`). P2-01.

### MF1-F — Cấp từ kho dùng chung, mua khi hết kho, giải phóng khi thu hồi — L

Hạng mục: phần còn lại `qd103-grant-from-shared-pool` + `qd103-commitment-release-on-revocation`. Delta: `subscriptionId` tùy chọn (D-2); `K1`
mỗi lần cấp tự +1 số lượng trong cùng transaction, không cổng phòng sở hữu (S1-04); giải phóng khi thu hồi **theo ngày** trong tháng thu hồi
(M-06; thay `Q-05` A); khoản `K2` phần tháng trước ngày cấp tự giải phóng khi cấp (M-10 — TẠM CHỌN A); `stock` trên hàng chờ cấp (P2-03); ghi
_tránh được_ một lần khi cấp từ kho. Gỡ guard + trigger phòng sở hữu (A2 §5 nhóm 7).

### MF1-G — `SBF-19` hóa đơn mua hàng — L

Hạng mục: `qd103-purchase-invoice-sbf19` (+ `qd103-purchase-invoice-followups` cho P2-06…08). Delta: hóa đơn `K4` vào năm của ngày mua (M-28);
gỡ `budgetCommitmentInvoiceRecord` (A2 §5 nhóm 8); `K1` đã mua mà cấp thất bại ⟹ _Chưa phân bổ Cost Center_ qua hóa đơn (C1-19).

### MF1-I — Kho khóa `K4` — L

Hạng mục: `qd103-k4-key-pool`. Không delta ngoài P1-07.

### MF1-J — Quyền theo vai — L

Hạng mục: `qd103-role-based-access`. Delta: loại `K4` chỉ là giới hạn tạm tới khi MF1-I xong, không phải luật (S1-10).

### MF1-K — API theo dõi Request và tiện ích MF-1 — M

Hạng mục: `qd103-request-history-by-role` + `qd103-mf1-followups`. Gồm P1-05, P1-09, P1-10, P2-04 (mới — chưa spec: ghi `invitedAt`, job nhắc
`GRANT_INVITATION_PENDING` sau 3 ngày làm việc, cho `provisioningTaskCloseFailed` khi `invitedAt` ≥ 14 ngày, 409
`PROVISIONING.INVITATION_NOT_APPLICABLE` khi không phải `K2`).

### MF-Z — Tài liệu API cho FE + seed demo — M

`qd103-api-docs-regression` (sinh lại `Docs/Figma UI-UX/API-Integration/`, viết lại `flows/paid-access-request.md`, `annual-budget.md` theo luật
mới) + phần MF-1/MF-4 của `qd103-seed-demo-v4` / `-mf1`.

### §4b — Sửa sau review độc lập R1 (09/11) — **thắng** mọi chỗ khác của §4 và spec hạng mục

Nguồn: [R1-SPEC-PLAN-REVIEW.md](R1-SPEC-PLAN-REVIEW.md) (28 finding). Đã tự kiểm lại RV-01 (`qd103-new-year-auto-commitments/plan.md:43`) và
RV-04 (trigger `license_assignments_immutable`, `prisma/migrations/20261020190100_licensing_assignments/migration.sql:119-139`).

| RV              | Sửa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV-01           | **Gói 4 không phụ thuộc gói 9 hay 14.** Số tiền khoản 01/01 = giá tháng của gói hiệu lực ngày 01/01 (`CatalogApi.getPlanPrice(planId, on)`) × số tháng của năm (quyền có thời hạn: tới tháng kết thúc, tính đủ tháng). Chọn nguồn bằng truy vấn Assignment hiện có (Assignment `K1`/`K2` còn hiệu lực ngày 01/01 có `request_id`, hoặc Request đã duyệt chi chưa cấp) — không cần `assignment-chain.repo.ts`. Nếu cần lưu giá tháng thì gói 4 tự thêm cột `seat_monthly_minor` trong migration của mình; gói 9 dùng lại, không thêm lần hai. Điều kiện loại `ROLE_BASED`/`K4`: bỏ (gói 13/14 sau này tự loại khi thêm). Bỏ task 1–2 về `requestId` nullable/`assignmentId` (`QĐ-109a`). |
| RV-02, RV-13    | Gói 10 tự thêm các giá trị enum mua hàng mình cần (`KEY_PURCHASE`, `ROLE_BASED_TOP_UP`) và hàm `nthWorkingDayFrom` nếu chưa có; hóa đơn cho `K4`/quyền theo vai trả 422 `PURCHASE_INVOICE.KIND_NOT_SUPPORTED` tới khi gói 13/14 làm. `charge_unallocated`: chỉ phần `K1` cấp thất bại (C1-19). **P1-11 (`deductibleTax`, `nonDeductibleTax`) là phần bắt buộc của gói 10**, không phải _nếu kịp_. C1-07 (giá `K4`) đã ở gói 2 (`ONE_TIME`); cấp `K4` ở gói 13.                                                                                                                                                                                                                          |
| RV-03           | Gói 11: duyệt Request tiếp tục ⟹ tạo tác vụ IT `EXTEND`; IT hoàn tất ⟹ **tạo Assignment kế tiếp** bằng cơ chế gia hạn có sẵn (`predecessor_id`, migration `20261024090200_licensing_assignment_renewal`), không sửa Assignment cũ. Gói 11 **phải sửa job 01/01** (gói 4) để coi Request tiếp tục đã duyệt mà IT chưa kéo dài là _đã duyệt chưa cấp_ (có khoản năm mới), kèm test.                                                                                                                                                                                                                                                                                                       |
| RV-04           | **Không sửa `valid_from`** (bất biến theo trigger). Thêm cột `granted_on date NULL` trên Assignment, ghi khi tác vụ cấp hoàn tất; ngày kết thúc của quyền có thời hạn và mọi tính toán thời hạn/seat-tháng sau này dùng `coalesce(granted_on, valid_from)`. Migration chỉ thêm cột (không đụng trigger).                                                                                                                                                                                                                                                                                                                                                                                |
| RV-05           | **Không merge gì vào `dev` cho tới khi gói 2, 3, 4 cùng xong và review PASS** — merge cả ba một lần.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| RV-06           | Song song chỉ an toàn khi mỗi chat ở worktree riêng (xem `CODER-PROMPT-PARALLEL.md`). Xung đột dự kiến: `catalog/subscription/subscription.repo.ts` (gói 1 × gói 2), `request-facts.service.ts`, flow spec, `licensing` public API. Khi merge: **không sửa tay `openapi.json`** — giải xung đột code rồi chạy lại `pnpm openapi:export`; migration giữ nguyên tên/thời điểm, nếu hai nhánh cùng sửa một model thì migration sau phải chạy được sau migration trước (kiểm bằng `pnpm db:migrate:deploy` trên DB sạch).                                                                                                                                                                   |
| RV-07           | **Công thức giải phóng theo ngày** (M-06, theo ví dụ `EP-12:902`): tháng có thu hồi, phần đã dùng = giá tháng × (số ngày trước ngày thu hồi) ÷ (số ngày của tháng đó), làm tròn nửa lên tới đơn vị nhỏ nhất của tiền tệ; phần giải phóng = khoản còn giữ − phần đã dùng. Thu hồi ngày 01 ⟹ phần đã dùng của tháng = 0. Áp `K1`, `K2`; không áp `K4` (giá một lần). Chỉ khoản của năm đang mở; năm đã đóng không đụng. **M-10** (`K2` duyệt rồi cấp giữa tháng): lúc cấp, giải phóng các tháng trước tháng cấp và phần ngày trước ngày cấp của tháng cấp theo cùng công thức.                                                                                                            |
| RV-08           | Gói 5 Task 1 **không** sửa file trong `requests/finance-review/` (gói 3 xóa thư mục này) và không gỡ `BudgetChangeListeners` (gói 3 làm).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| RV-09           | M-12 không thêm lý do chặn mới: lúc duyệt, kiểm lại theo Cost Center hiện hành của phòng; không có phiên bản đã duyệt cho Cost Center đó ⟹ dùng lý do chặn sẵn có _chưa có ngân sách đã duyệt_ (ii).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| RV-10           | Định nghĩa _Request đang chờ duyệt chi_ đặt trong capability `requests/spend` và cấp cho `budgets` qua extension point (mẫu `budgets/public/budgets.extension-points.ts`, tên `PendingSpendContributions`), không đặt trong `BudgetsApi`. Năm của Request đang chờ = năm tính lúc trình lô (`QĐ-109e`); sang 01/01 Request đang chờ tính vào năm mới khi được kiểm lại lúc duyệt.                                                                                                                                                                                                                                                                                                       |
| RV-11           | `reserveConfirmations[]` trong `spendBatchSubmit`: mỗi mục `{ requestId, reason }` (lý do 1–500 ký tự); chỉ áp cho mục có kết quả `USES_RESERVE` lúc trình; mục ra kết quả khác ⟹ bỏ qua và trả trong `results[]` với `reserveConfirmation: IGNORED`; `requestId` không thuộc lô ⟹ 422 `SPEND_BATCH.CONFIRMATION_NOT_IN_BATCH`. `spendQueueList` trả `budgetOutcome` dự kiến từng mục (kiểm khi đọc) để FE biết mục nào cần lý do.                                                                                                                                                                                                                                                      |
| RV-12           | Gói 8 thêm cột/enum miễn trừ GH (`ROLE_ENDED`, `TRANSFER_OVERLAP`) và nhánh bỏ qua GH; nơi đặt giá trị: `ROLE_ENDED` ở gói 14, `TRANSFER_OVERLAP` thuộc MF-3 (ngoài đợt). Test nhánh bằng dữ liệu đặt trực tiếp trong integration.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| RV-14           | Gói 12 cần gói 8 và 11; phần _ứng viên_ (P3) của `qd103-mf1-followups` để sau gói 14.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| RV-15           | **Không drop cột** trong đợt này: ngừng ghi + CHECK chặn ghi mới; codec vẫn đọc dữ liệu cũ (thay câu cuối §5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| RV-16           | Gói 2 chỉ kéo phần **hàm định giá** của `qd103-grant-from-shared-pool` §2; migration Task 1 của hạng mục đó (gỡ guard) và F-012 ở lại gói 9.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| RV-19           | Hạn 01/01: gói 4 commit ≤ 01/12 → review PASS → Owner merge `dev` + deploy ≤ 15/12 → sau 01/01/2027 kiểm bảng dấu chạy có năm 2027 và có khoản `origin = YEAR_START`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| RV-20           | `QĐ-109f`: gói 5 thêm test _không lập được phiên bản khi năm chưa có kỳ_ và _tổ chức chưa có kỳ nào thì được tạo phòng ngoài kỳ_ (code hiện đã theo hướng này — chỉ thêm test, sửa nếu đỏ).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| RV-21           | M-19 đã đúng trong code (`countedInYear`) — gói 6 chỉ giữ nguyên.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| RV-22           | Quyền không có Request: không có khoản 01/01, không audit riêng; đảo test cũ của Q-01 B nếu có.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| RV-23           | Gói 7: đảo test `Q-25` cũ, bỏ nhánh `successorRecorded` lúc gửi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| RV-25           | `newEndDate` ngoài khoảng (≤ ngày kết thúc hiện tại hoặc > ngày kết thúc hiện tại + 12 tháng) ⟹ 422 `RENEWAL_REQUEST.END_DATE_OUT_OF_RANGE`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| RV-26           | P2-05: chỉ bỏ hai trường Business Owner ở `accessRequestInternalRegister`, `accessRequestAssessmentSave`; phần còn lại của `qd103-remove-business-owner` ngoài đợt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| A5-2 (TẠM CHỌN) | `QĐ-109b` ca biên: Request có **số tiền năm hiện tại = 0** (Request tiếp tục trọn năm sau) **không** bị chặn dù _còn lại_ đã âm — kiểm tra ngân sách trả `WITHIN_BASE`, không trừ gì; vẫn tới Người duyệt chi. Owner đổi được.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| RV-28           | Migration **không** cấp quyền cho runtime role (theo `docs/rules/database-business.md`); bỏ câu GRANT trong spec hạng mục nếu có.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

RV-17, RV-18, RV-24, RV-27 sửa trong PLAN và `CODER-PROMPT-PARALLEL.md`.

## 5. Luật cũ phải gỡ (tổng)

A2 §5 nhóm 1–9 và A3 §6. Nguyên tắc: gỡ code + route + wire; giữ giá trị enum/cột khi dữ liệu cũ còn đọc, thêm CHECK chặn ghi mới; ngừng phát mã
thông báo cũ (giữ giá trị enum). **Không drop cột trong đợt này** (RV-15).

## 6. Quyết định

**Owner chốt 09/11/2026 (ghi `QĐ-109` trong Docs):** `QĐ-109a` cam kết 01/01 chỉ quyền có Request · `QĐ-109b` Request tiếp tục trọn năm sau:
0 năm nay, hiện số năm sau, vẫn qua Người duyệt chi · `QĐ-109c` dòng Cancel không cộng tổng · `QĐ-109d` ZBB `KPI-3` chỉ Renew/Change · `QĐ-109e`
Request qua lô tính theo tháng trình lô · `QĐ-109f` mọi năm phải mở kỳ, _khởi tạo_ = chưa có kỳ nào. Trần nhóm của trưởng phòng: giữ như code,
không sửa Docs.

**Docs đã trả lời — đổi câu TẠM CHỌN cũ của BE:** `Q-03` → IT kéo dài (MF1-H); `Q-05` → giải phóng theo ngày (MF1-F); `Q-25` → Request mới trong
khoảng trống đi một bước (MF1-D); `Q-30` → lý do GH-3 theo từng dòng (MF1-E). Không cần hỏi lại: `Q-06`, `Q-15` (vế mở kỳ), `Q-16`, `Q-20`, `Q-23`,
`Q-28`, `Q-31`, `Q-33`, `Q-47`.

**TẠM CHỌN kỹ thuật/nghiệp vụ nhỏ (Owner đổi được, mặc định như sau):** M-05 A · M-10 A · M-11 còn hiệu lực · M-12 kiểm lại theo Cost Center
hiện hành, cam kết ở lại Cost Center cũ · M-16 không cờ · M-17 A · M-18 giá ngày duyệt · M-19 A · M-24 không chặn B3/B4 khi chờ phát hành lại ·
M-25 bắt chọn đơn vị · M-28 năm ngày mua · S4-01 Trần đã phát hành · C4-12 không nháp BE · D-2 `subscriptionId` tùy chọn · `K1` tự +1. Các câu
TẠM CHỌN khác trong `../qd103-108-alignment-2026-11-08/QUESTIONS.md` giữ nguyên như spec hạng mục đã chọn.

## 7. Ngoài phạm vi

MF-5 và `SBF-04/04a`; `SBF-20` ngoài phần cấp từ kho (điểm điều chỉnh, cảnh báo đỏ, đóng thuê bao, `KPI-4` — W5); chi phí seat-tháng và dòng kho
(`qd103-seat-month-cost-pool-line`, W5) — chỉ ghi `basis`; báo cáo Budget vs Actual, đóng kỳ chi phí, tiết kiệm, dashboard (W8b); AI; mobile.
MF-2, MF-3 không sửa nhưng **không được vỡ** (test hiện có vẫn xanh; `SBF-18` dùng chung).

## 8. Kiểm thử và ranh giới

- Mỗi gói: quick check set — `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` (không
  drift ngoài phần đổi có chủ ý), cộng unit/http/integration **theo file** đã đổi. Test đặt tên theo mã luật (`BR-MF1-06 …`).
- Integration cần Docker Desktop sống (lần dừng trước Docker treo). Không chạy `pnpm check`/toàn bộ suite giữa chừng; báo cáo cuối ghi rõ _"pnpm
  check và test toàn bộ CHƯA chạy — Owner chạy khi audit"_.
- Luôn: theo `AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/` của BE; một commit mỗi gói (hoặc mỗi phase trong gói L) trên `feat/qd103-108-mf145`.
- Hỏi trước: đổi luật ngoài spec này; xóa dữ liệu thật; đụng DB dùng chung/VPS.
- Không bao giờ: push, merge vào `dev`, deploy khi Owner chưa cho; sửa Docs từ chat code.

## 9. Câu hỏi còn mở

Không còn câu chặn thiết kế. Owner chỉ cần xác nhận hoặc đổi các TẠM CHỌN ở §6 (đáng xem nhất: **M-05**, **M-12**, **S4-01**).

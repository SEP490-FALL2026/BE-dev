# AUDIT FIX-B3 — verify gói sửa 16 finding Required đợt B3 (chỉ đọc)

- **Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (process + review năm trục, nhãn Critical/Required/Optional/Nit);
  `superpowers:verification-before-completion` (mọi kết luận dẫn file:dòng đã đọc ở `ce7ee7c6`; **không** chạy pnpm/jest/docker theo brief nên không
  tuyên bố test xanh/đỏ — "dự đoán" là đọc code). Domain: không có skill NestJS/Prisma riêng ⟹ dùng rule repo + QĐ làm chuẩn.
- **Phạm vi:** `git log 134a713d..ce7ee7c6` trừ SM-1.1/1.2 (`2da3e5bf`, `94b6716d`, migration `…100900`). File:dòng ở `ce7ee7c6` (đọc qua
  `D:\FPT\FALL2026\Code\be-verify`). Nguồn: `project-decisions.md` (QĐ-103k/m/r/t/w/y, QĐ-104c/d/h/j/k, QĐ-111an/ay, QĐ-106j, QĐ-98h, QĐ-96e,
  QĐ-90f), `EP-12` (US-12-12 AC-15, US-12-17 AC-11, luồng phụ US-12-16), `EP-13` (US-13-03 AC-3/6/11, US-13-05 AC-19…26), OVERNIGHT-DECISIONS
  D-84…D-88, bốn file audit gốc.

## Tóm tắt

| Mức | Số | Mã |
| --- | --- | --- |
| Critical | 0 | — |
| Required mới | 3 | FX3-01 (B3B-04 ghi sai chỗ tiền), FX3-02 (REVOKED ⟂ RECORD_SPENT), FX3-03 (B3C-02 khóa định danh lệch nguồn) |
| Optional | 5 | FX3-04 … FX3-08 |
| Nit | 7 | FX3-N1 … N7 |

Kết luận 16 + 2 finding gốc: **13 ĐÃ SỬA ĐÚNG**, **B3C-04 đúng hướng (kèm Optional)**, **B3B-06 đúng hướng (lệch O1 chấp nhận tạm)**,
**B3B-04 SAI HƯỚNG phần tiền** (FX3-01), **B3C-02 CHƯA ĐỦ** (FX3-03), **B3C-01 MỘT PHẦN** (phần làm đúng QĐ nhưng sinh FX3-02; phần thiếu đề
xuất ở §B3C-01). Migration ba file: chạy lại an toàn, dữ liệu cũ không làm deploy fail (§Migration).

---

## 1. Kết luận từng finding gốc

| Mã | Commit | Kết luận | Bằng chứng / kịch bản số |
| --- | --- | --- | --- |
| B3B-01 | `612fd719` | **ĐÃ SỬA ĐÚNG** | `purchase-invoice-plan.service.ts:139,160-194,288-290`: gói `K2` ⟹ `poolSubscriptionId`, không CC, không cam kết; `confirmation.service.ts:104-122` truyền `subscriptionId` kho, `chargedCostCenterId` null; recorder `:41-44` không khóa cam kết khi có `subscriptionId`, `bookPurchaseInvoice` ⟹ `SUBSCRIPTION`. Số K2: cam kết 800.000 đ `HELD` giữ nguyên, hóa đơn 4.800.000 đ là dòng kho, `spentOf` phòng = 0 (test `purchase-invoice-decision…:251-285`). Hết đội 4.000.000 đ / 5.600.000 đ. Lưu ý FX3-07. |
| B3B-02 | `6a715952` | **ĐÃ SỬA ĐÚNG** | `invoice.policy.ts:49-68` bỏ `matchOf`; recorder `:126-151` match dòng `invoices` = `TAX_ONLY/MATCHED`, chỉ `PRICE_QUANTITY_EXCEPTION` khi R-44 nói. T-PI: cam kết 3.750.000, net 3.840.000 ⟹ `takeMinor` 3.750.000, `EXPENSED`, thực chi 3.840.000, `match_result MATCHED`, `hasDiscrepancy false` (test `…decision…:287`). Ca TAX_ONLY chuyển sang `recorder.service.spec.ts:168` — không mất ca. |
| B3B-03 | `16505ac0` | **ĐÃ SỬA ĐÚNG** | `confirmation.service.ts` `selfSigned` + `PurchaseInvoiceRepo.isBeneficiary`; audit `after.selfBeneficiary: true`, vẫn ký (QĐ-104h). Test `:337`. |
| B3B-04 | `efe8bf4b` | **SAI HƯỚNG phần tiền** ⟹ FX3-01 | Route đã mở cho `FAILED`/`AWAITING_IT_CLOSE` (đúng), nhưng tiền ghi vào thực chi Cost Center phòng — trái US-12-17 AC-11 / US-12-12 AC-15. (Gợi ý sửa trong AUDIT-P3-B3-B của chính đợt review là sai; nhận lỗi ở đây.) |
| B3B-05 | `04206ad8` | **ĐÃ SỬA ĐÚNG** | `missing-periods.policy.ts:33-35` dùng `nthWorkingDayFrom`. Thanh toán Thứ Ba 10/11/2026 ⟹ ngày 1 = 10/11, ngày 5 = Thứ Hai 16/11, cờ từ **17/11**; thanh toán Thứ Bảy 14/11 ⟹ ngày 1 = 16/11, hạn 20/11; nghỉ 12/11 ⟹ hạn 17/11, cờ 18/11. Theo QĐ-104k(2) đã chốt ⟹ "Owner xác nhận" chỉ còn là sửa câu SPEC T-PI, không phải lựa chọn. |
| B3B-06 | `d9f62042` (+`8dd9e48f`, `cbf29321`) | **ĐÚNG HƯỚNG**, lệch O1 chấp nhận tạm; FX3-05, FX3-06 | `plan.service.ts:313-330` + `match.policy.ts:76-91`. Số audit: kho 10 × 200.000, 3 tháng ⟹ mốc 6.000.000; net 9.000.000 ⟹ `OVER_APPROVED` ✓. Test: 10 × 1.000.000, gia hạn 05/12, tháng 09 ⟹ 30.000.000 (45 tr cờ, 30 tr không); tháng 12 ⟹ 10.000.000 (10.000.001 cờ); Request K2 1 seat ⟹ 3.000.000 (4,8 tr cờ). Lệch SPEC "số seat hệ thống tính" (FIX-B3-O1): xem FX3-06. |
| B3B-07 | `a00dfd0b` | **ĐÃ SỬA ĐÚNG** | `purchase-invoice-charge.policy.ts:14-16` chỉ `K1`. K4 5.000.000 đ ⟹ CC Request A, không còn 10.000.000 đ trong khoảng. Chỉ có unit test (FX3-N5). |
| MG2-02 | `03117d2b` | **ĐÃ SỬA ĐÚNG** | `budget-view.repo.ts:31-34` thêm cặp từ `invoices` không cam kết có `cost_center_id`; ca 750.000 đ RC-2 của CC chưa có ngân sách nay có dòng `NO_BUDGET`. `UNION` khử trùng cặp (CC, năm, VND). |
| MG2-04 | `03117d2b` | **ĐÃ SỬA** | README `budgets` dòng 159-162 khớp `spentOf`. |
| B3C-01 | `35d8b64e` | **MỘT PHẦN** — xem §B3C-01 | Phần làm đúng QĐ-104j/AC-24/AC-25; sinh FX3-02; phần SBF-18 + chờ Request chưa làm (D-88). |
| B3C-02 | `a5a88c50` | **CHƯA ĐỦ** ⟹ FX3-03 | Khóa một ca mở có thật (`…101000:25-26`, `repo.openOrJoinCase`) nhưng kịch bản gốc (UNMATCHED rồi NO_ASSIGNMENT cùng tài khoản) vẫn ra 2 ca. |
| B3C-03 | `ae4ba4e9` | **ĐÃ SỬA ĐÚNG** | `vendor-account-decision.service.ts:113-115` ⟹ 422 `VENDOR_ACCOUNT_DISCREPANCY.DECISION_NOT_ALLOWED`. Slack 2.640.000 đ đã ký, chênh 440.000 đ: không ca, không dòng `OOP-…` ⟹ thực chi giữ 2.640.000 đ, không đếm hai lần. |
| B3C-04 | `a5a88c50` | **ĐÚNG HƯỚNG** (kèm FX3-04) | `repo.ts:46-58`: unique một phần `WHERE state='OPEN'`, `reopened_from_id`, chỉ mở lại khi `evidence_on` mới hơn mục đã quyết. Đúng US-13-03 AC-3/AC-6, US-13-05 AC-26 (vế "mở lại"). |
| B3C-05 | `1c7d9f3f` | **ĐÃ SỬA ĐÚNG** | `repo.ts:226-238` lọc `lastImportId: importId` cho cả findings và identifiers; test `…review…:221`. |
| B3C-06 | `dde6d85b` | **ĐÃ SỬA ĐÚNG** theo SBF-07a v4.1/AC-19 | `closure.service.ts:57-59` 403 `FINANCE_ONLY`; IT vẫn `FALSE_ALARM`/`REPORT_ONLY`. Nhưng ghép với REVOKED chỉ IT ⟹ FX3-02. |
| B3C-07 | `03cbd93e` | **ĐÃ SỬA ĐÚNG** | `closure.service.ts:144-146` `lockCostCentersShared` + `ACTIVE`, có ca INACTIVE ⟹ 422. |
| B3A-01 | `bf7f46ea` (+`e47b6cf0`) | **ĐÃ SỬA ĐÚNG** | `usage-rules-seat.service.ts:155-160`: tầng `MONITOR` đi `create/keepExisting`; `isRoutedTier` không đổi; KPI-5 vẫn loại MONITOR (`ghost-seat-state.policy.ts:90-92`); G2 supersede MONITOR như G3/G4 cũ. Test đẩy sớm từ lượt quét thật. `e47b6cf0` bỏ bản seed mới thêm ở `bf7f46ea` — không mất ca so với gốc, chỉ mất assertion gate 8 (FX3-N6). |
| B3A-02 | `666fa45f` | **ĐÃ SỬA ĐÚNG** | `escalation-facts.service.ts` `leaveOrHandoverOf` cùng công thức lượt tuần (`usage-rules-seat.service.ts:93-95`), lý do `LEAVE_OR_HANDOVER`, thứ tự chuyển phòng → nghỉ → phòng; unit + integration. |

---

## 2. Required mới

### FX3-01 — Required (High, TIỀN) — Hóa đơn `K1` cấp thất bại vào thực chi Cost Center phòng, tài liệu nói *Chưa phân bổ Cost Center*

- **File:dòng:** `src/modules/requests/purchase-invoice/purchase-invoice-plan.service.ts:36` (`FAILED_AFTER_PURCHASE_STATES`), `:49-50`
  (`heldByPerson` false ⟹ `chargedCostCenterOf` trả `requestCostCenterId`), `:333-358`; `src/modules/budgets/budget/invoice.policy.ts:101-111`
  (cam kết `RELEASED` ⟹ `COST_CENTER`); test ghim sai `test/integration/requests/purchase-invoice-decision.integration-spec.ts:307-325`
  (`cost_center_id: unit.department.unitId`, `spentMinor: 300_000n`).
- **Kịch bản (số, đúng US-12-17 AC-11):** `R62` ChatGPT Plus `K1` cho `E4` (`P-ENG`), cam kết 1.500.000 đ; cấp thất bại, IT hủy gia hạn, nộp
  500.000 đ, `F1` ký ⟹ code: dòng `invoices` `cost_center_id = CC-ENG`, `spentOf(CC-ENG)` +500.000 đ, `overBudget` của ENG có thể bật.
  Tài liệu: 500.000 đ ở dòng *Chưa phân bổ Cost Center* kèm lý do *`K1` đã mua, cấp thất bại* và phòng `P-ENG`; **không** thành thực chi
  của `CC-ENG`; "không khoản nào trừ ngân sách của `CC-ENG`".
- **Căn cứ:** QĐ-104k(4), QĐ-103r ("hóa đơn vào *Chưa phân bổ Cost Center* của phòng người dùng"); US-12-17 AC-11 + luồng phụ
  (`EP-12.md:862`, `:884`); US-12-12 AC-15 + dữ liệu nghiệp vụ (`EP-12.md:486`, `:516`); QĐ-103t(8) (dòng riêng).
- **Cách sửa (M):** A (khuyến nghị) — cột `invoices.unallocated_reason` (`K1_GRANT_FAILED`; về sau `ROLE_BASED_APPROVER`) + `department_id`
  của người dùng, CHECK `invoices_place_check` cho phép `cost_center_id` NULL khi có `unallocated_reason`; `bookPurchaseInvoice` thêm kind
  `UNALLOCATED` cho trạng thái thất bại (truyền cờ `failedAfterPurchase` từ plan, không suy từ CC); `spentOf` không cộng dòng này (giữ như RC-2
  `UNALLOCATED`), `budget-view` không tạo cặp. B (S, tạm) — giữ `cost_center_id` để "kèm phòng" nhưng thêm cờ và loại khỏi `spentOf`/`pairs`.
  Sửa luôn ghi chú D-85(3)/D-75(2).
- **Test:** sửa ca `:307` ⟹ `cost_center_id NULL`, `unallocated_reason 'K1_GRANT_FAILED'`, `yearFacts(CC).spentMinor = 0`, cam kết `RELEASED`;
  thêm ca `AWAITING_IT_CLOSE` (hiện không có — mutation #1 sống).

### FX3-02 — Required (High, TIỀN + luồng) — `REVOKED` (chỉ IT) và `RECORD_SPENT` (chỉ Finance) là hai kết cục đóng loại trừ nhau trên một ca đóng một lần

- **File:dòng:** `src/modules/usage/vendor-account-review/out-of-process-case-closure.service.ts:57-62` (vai theo kết cục), `:70`
  (`CASE_ALREADY_CLOSED`), `:72-86`; `out-of-process-case.policy.ts:29,69-80` (REVOKED cấm tiền: `RECORD_FIELDS_NOT_ALLOWED`);
  migration `20261113101200…:15-20` (CHECK: `RECORD_SPENT ⟺ amount`, `REVOKED ⟹ không CC`); trigger `out_of_process_cases_guard` (ca đóng không đổi).
- **Kịch bản (số):** Miro của `E9`, `e9@congty.vn` trong workspace công ty, trả thẻ công ty 750.000 đ/tháng (AC-19 + AC-20). (a) `F1` ghi
  750.000 đ ⟹ ca `CLOSED/RECORD_SPENT` ⟹ `IT1` đóng `REVOKED` kèm thư hủy ⟹ 409 `ALREADY_CLOSED`: không có chỗ ghi *đã hủy gia hạn* + bằng
  chứng (AC-25 mất). (b) `IT1` đóng `REVOKED` trước ⟹ `F1` không ghi được 750.000 đ ⟹ **thực chi thiếu 750.000 đ** (tiền thật của công ty mất
  khỏi báo cáo, trái QĐ-96e/QĐ-34b "phần đã chi là thực chi như đã nhận").
- **Căn cứ:** US-13-05 AC-20 ("phần đã chi giữ như đã ghi (AC-19)"), AC-25 ("Given tác vụ thu hồi … hoàn tất … phần đã chi giữ như đã ghi");
  QĐ-96e, QĐ-103m (ba vế cùng tồn tại trên một hồ sơ: ghi phần đã chi · IT thu hồi khi tài sản công ty); SBF-07a làn Finance và làn IT song song.
- **Cách sửa:** A (M, khuyến nghị, gộp với phần còn thiếu của B3C-01) — "ghi phần đã chi" thành **thao tác trên ca đang mở** của Finance
  (`POST /out-of-process-cases/{id}/spend`: ghi `invoices OOP-<caseId>`, đặt `amount_minor`/`cost_center_id`/`document_ids`, ca vẫn `OPEN`;
  CHECK cho phép tiền khi `OPEN`), kết cục đóng còn `FALSE_ALARM` (chỉ khi chưa ghi tiền) · `REPORT_ONLY`/*đã ghi nhận chi phí* · `REVOKED`
  (IT, `company_asset`, hủy gia hạn + chứng từ, giữ tiền đã ghi); ca `company_asset = true` không đóng được bằng `REPORT_ONLY` khi chưa thu hồi.
  B (S) — giữ đóng một lần nhưng cho `REVOKED` mang luôn tiền: IT đóng `REVOKED` chỉ khi Finance đã ghi tiền trước qua một bản ghi riêng
  (cột `spend_recorded_at`), ngược lại 422 — vẫn cần tách ghi tiền khỏi đóng ca, nên A gọn hơn.
- **Test:** integration "ca tài sản công ty: Finance ghi 750.000 đ (ca vẫn OPEN, `spentOf` +750.000) ⟹ IT đóng REVOKED kèm thư hủy ⟹ 201, tiền
  giữ nguyên"; "IT đóng REVOKED khi chưa ghi tiền và có chứng từ thanh toán ⟹ 422/hoặc cho phép theo chọn của Owner".

### FX3-03 — Required (Medium-High, TIỀN có thể ghi hai lần) — B3C-02: khóa một ca mở lệch nhau giữa hai nguồn của cùng tài khoản

- **File:dòng:** `src/modules/usage/vendor-account-review/out-of-process-case.policy.ts:48-62` (`openCaseKeyOf`: có `identity` thì dùng nó,
  không thì `employee:<id>`); `vendor-account-intake.service.ts:39-47` (NO_ASSIGNMENT: `identity: null`, `employeeId` có), `:54-61`
  (UNMATCHED_IDENTITY: `identity = rawIdentifier`, `employeeId: null`); migration `…101000:14-17` cùng quy ước.
- **Kịch bản (đúng kịch bản gốc B3C-02):** `x@congty.vn` ở Figma là `UNMATCHED_IDENTITY` ⟹ IT quyết `OUT_OF_PROCESS` ⟹ ca 1 khóa
  `figma:x@congty.vn`. IT khớp danh tính ở SBF-04a ⟹ import sau sinh finding `NO_ASSIGNMENT` của `E` ⟹ mục B ⟹ quyết `OUT_OF_PROCESS` ⟹ khóa
  `figma:employee:E` ≠ ⟹ **ca 2 mở**. Finance ghi 2 × 750.000 đ cho cùng một tài khoản (`OOP-<case1>`, `OOP-<case2>` không trùng số).
  Test mới (`vendor-account-review.integration-spec.ts:372-415`) chỉ thử **cùng nguồn** UNMATCHED (khác hoa/thường) dù tên ca ghi "from another
  source"; vế "đóng rồi mở mới" dùng một định danh khác (`twice-later@…`) nên không chứng minh gì.
- **Căn cứ:** QĐ-98h; US-13-03 AC-11; SBF-07a bước 1.
- **Cách sửa (S, trong module `usage`):** khóa của NO_ASSIGNMENT = `normalized_identifier` của `usage_identity_mappings` (ứng dụng, nhân viên,
  `ended_at IS NULL`; nhiều ⟹ lấy mapping mới nhất) nếu có, còn không mới `employee:<id>`; khóa UNMATCHED = `normalized_identifier` (không phải
  `lower(raw)`), và nếu định danh đã `RESOLVED` thì cùng định danh đó. Một hàm tính khóa dùng ở `decide`, không ở intake.
- **Test:** integration hai nguồn thật: UNMATCHED `X@CongTy.vn` quyết OOP ⟹ tạo mapping `x@congty.vn → E` ⟹ finding NO_ASSIGNMENT của `E`
  ⟹ quyết OOP ⟹ cùng `outOfProcessCaseId`, `out_of_process_cases` đếm 1.

---

## 3. B3C-01 — đánh giá phần đã làm và phương án cho phần thiếu

**Phần đã làm — đúng QĐ, giữ:**
- `LEGALIZE_VIA_REQUEST`/`REVOKE` không còn là quyết định IT (zod enum ⟹ 422 `VALIDATION_ERROR`; DB giữ giá trị cho dòng cũ) — đúng QĐ-103m
  (bỏ Request hợp thức hóa), US-13-05 AC-22 (không ai tạo Request thay/đặt hạn chờ), US-13-03 AC-10.
- `OUT_OF_PROCESS` bắt buộc `companyAsset` (`vendor-account-review.dto.ts:22-36`, refine) — đúng định nghĩa QĐ-103y(3)/AC-24.
- `REVOKED`: chỉ `IT_ADMIN` (`closure.service.ts:60-62`), chỉ `company_asset = true`, bắt buộc `renewalCancelled = true` + ≥ 1 chứng từ, không
  tiền (`policy.ts:69-80`), CHECK DB + trigger giữ `company_asset`/`concluded_on` bất biến — đúng QĐ-104j, AC-25, AC-24(c) (tài khoản cá nhân
  chỉ ghi nhận ⟹ `REVOKE_NOT_ALLOWED`). Test `…review…:586-656` phủ đủ các nhánh từ chối.
- Điểm trừ: REVOKED ⟂ RECORD_SPENT (FX3-02); ca "gia nhập" bỏ qua `companyAsset` của quyết định sau (FX3-08).

**Phần chưa làm (AC-20 tác vụ SBF-18, AC-23 chờ ≤ 10 ngày làm việc):** lý do Sonnet nêu đúng (`provisioning_tasks.assignment_id` NOT NULL,
tài khoản ngoài quy trình không có `LicenseAssignment`). Phương án tối thiểu:

| Phương án | Nội dung | Cỡ | Nhận xét |
| --- | --- | --- | --- |
| **A (khuyến nghị cho đợt này)** | Không đụng `licensing`. Ca chính là "việc thu hồi" của IT: wire ca thêm `revocation { required, waitingRequestId, waitUntil, due }` **tính lúc đọc**: `required = company_asset`; `RequestsApi.openGrantRequestOf(employeeId, applicationId)` (facade mới, trả Request mở + đã tới bước duyệt chi chưa); `waitUntil = nthWorkingDayFrom(concluded_on, 10, nonWorking)` (ngày kết luận là ngày 1 — AC-23: 04/08 ⟹ 17/08); `due = required && (không Request ‖ (hôm nay > waitUntil && Request chưa tới bước duyệt chi) ‖ Request bị từ chối/rút)`; Request được duyệt ⟹ `required = false`, ca đóng `REPORT_ONLY` được. Dashboard IT đếm `outOfProcessRevocationsDue`; nhắc dùng D12 sau. Ca không có nhân viên (UNMATCHED) ⟹ `due` ngay. | S–M | Đủ cho AC-23 về luật (không timer, không bảng mới), AC-20 về "IT có việc thu hồi"; thu hồi thật làm tay ở trang nhà cung cấp rồi đóng `REVOKED` (đã có). Ghép với FX3-02 A trong một gói. |
| B | `provisioning_tasks.assignment_id` nullable với nguồn mới `OUT_OF_PROCESS_ACCOUNT` (CHECK `assignment_id IS NULL ⟺ source = …`), `LicensingApi.openOutOfProcessRevocation(tx, {caseId, employeeId?, applicationId, account})`, job ngày mở tác vụ khi `due`; hoàn tất tác vụ là điều kiện đóng `REVOKED`. | M–L | Đúng chữ AC-20 ("tác vụ thu hồi qua SBF-18 với nguồn *quyền ngoài quy trình*") nhưng chạm bất biến lõi của `licensing` (mọi truy vấn task đang giả định có assignment) ⟹ cần Owner + review riêng. |

---

## 4. Optional

- **FX3-04 — Optional (Medium) — Mở lại khi ca vẫn đang mở / sau khi ca đã đóng.** `repo.ts:46-57`: mục đã quyết `OUT_OF_PROCESS` mà ca còn
  `OPEN`, import sau (`evidence_on` mới: `coverageTo`, `lastActivityDate`) ⟹ một mục `OPEN` mới trong hàng đợi IT mỗi kỳ, phải quyết lại —
  QĐ-98h: lần phát hiện sau "chỉ gắn thêm bằng chứng và nguồn". Sau ca `RECORD_SPENT`, quyết lại tạo **ca thứ hai** không nối ca cũ — AC-26
  "hồ sơ được mở lại … không tạo hồ sơ thứ hai". COLLECTOR_UNLISTED đã `FALSE_ALARM` mở lại mỗi ngày còn thấy. Sửa: khi mục cũ gắn ca `OPEN`
  ⟹ insert mục mới ở trạng thái `DECIDED` nối luôn ca đó (gắn bằng chứng, không vào hàng đợi); thêm `out_of_process_cases.reopened_from_id`.
- **FX3-05 — Optional — Số tháng tới ngày gia hạn làm tròn xuống.** `purchase-invoice-match.policy.ts:85-87` đếm hiệu tháng lịch: kho gia
  hạn 31/12, hóa đơn tháng 11 ⟹ 1 tháng (thực tế 11/11→30/12 ≈ 2 tháng) ⟹ Request K2 2 seat × 200.000 đ, nhà cung cấp tính 800.000 đ ⟹ mốc
  400.000 đ ⟹ cờ `OVER_APPROVED` giả. QĐ-104k(1) "số tiền làm tròn lên theo tháng". Sửa: `ahead + (ngày gia hạn > 1 ? 1 : 0)`. Chỉ là cờ,
  không chặn.
- **FX3-06 — Optional (FIX-B3-O1) — Mốc gia hạn theo `purchasedQuantity` thay "số seat hệ thống tính".** Chấp nhận tạm vì code chưa có số
  tính ở điểm điều chỉnh (QĐ-104d(1) chưa được hiện thực: không grep thấy). Hệ quả cần ghi rõ: R-44 và mốc vượt **cùng** so với số IT tự ghi
  ⟹ "gia hạn thừa seat" (hệ thống tính 8, IT gia hạn 10, hóa đơn 2.000.000 đ) không ra cờ nào. Làm khi gói SBF-20 lưu số tính.
- **FX3-07 — Optional — Kho của hóa đơn K2-Request chọn theo *hôm nay* lúc nộp và lại lúc ký.** `plan.service.ts:176-194` +
  `confirmation.service.ts:104-107`: sau khi kho sang kỳ mới (`renewed_from_id`), hóa đơn tháng cũ ghi vào kỳ mới; kho hết hạn giữa nộp và ký
  ⟹ Finance nhận 409 `NO_PLACE`. Sửa: chọn kho theo `serviceMonth`, hoặc lưu kho đã chọn lúc nộp (cột riêng, CHECK `link_check` giữ).
- **FX3-08 — Optional — Ca "gia nhập" bỏ qua `companyAsset` của quyết định sau.** `decision.service.ts:39-46` + trigger bất biến: lần 1 ghi
  `false`, lần 2 (bằng chứng workspace công ty) ghi `true` ⟹ ca vẫn `false` ⟹ `REVOKE_NOT_ALLOWED`, không cách nào sửa ngoài đóng `REPORT_ONLY`.
  Sửa: cho phép nâng `company_asset` false → true (một chiều) khi gia nhập, audit.

## 5. Nit

- **FX3-N1** `vendor-account-decision.service.ts:13-17` docstring còn "let it go through a Request, revoke the access".
- **FX3-N2** `purchase-invoice-missing-periods.integration-spec.ts:35-38` docstring còn "due 17/11, mark from 18/11".
- **FX3-N3** `prisma/models/usage.prisma` khai `@@unique` toàn phần cho hai index một phần (`vendor_account_discrepancies_open_key`,
  `out_of_process_cases_open_identity_key`) — Prisma sinh khóa `findUnique/upsert` không đúng; comment `identityKey` "null once closed" sai (đóng
  ca không xóa khóa). Hiện không ai gọi khóa ghép (grep 0) — nên ghi chú cấm dùng.
- **FX3-N4** `escalation-facts.service.ts` chép công thức nghỉ dài thay vì tách hàm thuần dùng chung với `usage-rules-seat.service.ts:93-95`;
  đọc `personnel` ngoài `tx`.
- **FX3-N5** B3B-07 chỉ có unit test policy; không integration K4 người giữ khác phòng.
- **FX3-N6** `e47b6cf0`: ca thật (`ghost-seat-g3-g4…`) không còn assert `skipOf(...).gate === 'OPEN_RECOMMENDATION'` ở lượt hai (bản seed bị bỏ
  có assert) ⟹ thêm một dòng `expect` vào ca lượt quét thật.
- **FX3-N7** Đỏ-trước không chứng minh được từ git (test và sửa cùng commit, như B3B-N5); dựa vào khai của HANDOFF.

---

## 6. Migration `…101000`, `…101100`, `…101200`

- **101000:** cột thêm `IF NOT EXISTS`; backfill chỉ ca `OPEN` có `identity_key IS NULL`, ca trùng khóa thứ 2+ được hậu tố `#<discrepancy_id>`
  (duy nhất vì `discrepancy_id` unique) ⟹ `CREATE UNIQUE INDEX … WHERE state='OPEN' AND identity_key IS NOT NULL` **không fail** trên dữ liệu cũ
  trùng định danh; ca có mục bị sweeper xóa thì không JOIN ⟹ khóa NULL ⟹ ngoài index (chấp nhận). `vendor_account_discrepancies_source_key` là
  `CREATE UNIQUE INDEX` (004550:47) nên `DROP INDEX IF EXISTS` hợp lệ; dữ liệu cũ đã duy nhất toàn phần ⟹ index một phần tạo được. Chạy lại: an
  toàn. `ON CONFLICT … WHERE state='OPEN'` (repo `:58`) và `WHERE state='OPEN' AND identity_key IS NOT NULL` (repo `:147`) khớp vị từ index ⟹ suy
  luận arbiter đúng. Quy ước khóa SQL ≡ TS (`lower(btrim)`, `no-vendor`, `employee:`), trừ khác biệt Unicode lower — bỏ qua.
- **101100:** `ADD VALUE IF NOT EXISTS 'REVOKED'` đứng riêng trước migration dùng nó (D10) ✓.
- **101200:** CHECK mới đúng trên dữ liệu cũ (ca đóng cũ `renewal_cancelled` mặc định false ⟹ `(outcome='REVOKED') = false` ✓; ca mở false ✓);
  `DROP CONSTRAINT IF EXISTS` + `ADD`, `CREATE OR REPLACE FUNCTION` ⟹ chạy lại an toàn; trigger thêm `company_asset`, `concluded_on` vào bất biến.
  Sẽ phải viết lại CHECK này nếu làm FX3-02 A (tiền khi `OPEN`).

## 7. Bom ngày

- **`year-start-commitments-kept.integration-spec.ts` (4 ca nhóm: T-XY1 × 2, B1A-04, B1A-01 nhóm):** đỏ **từ 16/11/2026** (ngày thật sau ngày
  ghim `${h.year}-11-15`) tới 31/12 mỗi năm, **do test**. `people()` (`:76-84`) lùi `hire_date` về 01/01 nhưng **không** lùi
  `employee_placements.valid_from`; `colleague()` tạo người qua `EmployeeManualService.create` với `memberSince` = ngày DB thật
  (`employee-manual.service.ts:93`) ⟹ ngày 15/11 giả, ba người chưa thuộc phòng ⟹ dòng nhóm bắt đầu muộn hơn/khác ⟹ số 01/01 lệch. Ca đơn
  (`approvedOn`, dùng `u.member` đã được `unit()` lùi placement) không đỏ — khớp đúng 4/8 ca đỏ (4 ca nhóm dùng `people()`, 4 ca đơn dùng `u.member`). Sửa: trong `people()` thêm
  `UPDATE employee_placements SET valid_from = '${h.year}-01-01' WHERE employee_id = ANY($1)`. Không phải lỗi code; sửa thì xanh lại ngay.
- **`purchase-invoice-missing-periods.integration-spec.ts` (tháng 12):** đọc toàn bộ ca: ngày đọc là ngày giả (`pretendBusinessToday`), thuê bao
  `startDate` cố định `2026-01-05` (`seat-baseline-harness.ts:205`), `grant_completed_at`/`created_at` bị ép, ghế còn giữ vì `expected_end_date`
  = ngày thật + tháng ≥ mọi ngày giả. **Không thấy assertion nào đổi theo ngày thật** ⟹ ghi chú "đỏ từ 01/01/2027" của merge 2 chưa có căn cứ.
  Phần còn phụ thuộc ngày thật là dựng dữ liệu (ngân sách `h.year`, duyệt chi theo năm thật) — cần một lần chạy với giờ giả 2027-01-0x để đóng
  hẳn; không coi là nợ chắc chắn.

## 8. Kiến trúc / phân quyền / OpenAPI

- `openapi.json` @ `ce7ee7c6`: **0** chuỗi "QĐ-"; năm mã lỗi mới có trong ví dụ (`DECISION_NOT_ALLOWED`, `FINANCE_ONLY`, `IT_ADMIN_ONLY`,
  `REVOKE_NOT_ALLOWED`, `REVOKE_EVIDENCE_MISSING`), mapper `vendor-account-review.http-errors.ts:11-49` đủ trạng thái 403/422.
- Phụ thuộc: `requests` → `catalog/public` (`SubscriptionPeriodApi` thêm `monthlyPriceMinor`, `cycleMonths`, `renewalDate`), `confirmation` dùng
  `PurchaseInvoicePlanService` cùng module; `monthlyCostOf` nằm ở policy cửa nhóm `price/` (`cbf29321`) — đúng gate. Không query bảng module khác.
- Phân quyền: quyết định SBF-08 chỉ IT; đóng ca: `RECORD_SPENT` chỉ FINANCE, `REVOKED` chỉ IT_ADMIN, còn lại cả hai — đúng SBF-07a/AC-19/AC-20.

## 9. Test

- Ca bị bỏ/viết lại đã đối chiếu tên `it(`: `invoice.policy.spec` bỏ khối "how it matches what the commitment allowed" (đúng — luật bỏ), ca
  TAX_ONLY chuyển sang recorder spec; RC-2.3 collector chuyển nguyên sang `vendor-account-review-sightings.integration-spec.ts`; `e47b6cf0` chỉ bỏ
  bản seed thêm trong cùng gói (xem FX3-N6). Không mất ca nghiệp vụ.
- Thiếu: `AWAITING_IT_CLOSE` (FX3-01), hai nguồn thật cho B3C-02 (FX3-03), biên nghỉ dài kết thúc đúng hôm nay (B3A-02), integration K4 (B3B-07),
  ca gia hạn ngày > 1 (FX3-05).

## Mutation đề xuất

Lệnh chạy từ repo BE. Chuỗi cũ đã grep: mỗi chuỗi đúng 1 lần trong `src`. "Dự kiến" là đọc code.

| # | File | Chuỗi cũ (duy nhất) | Chuỗi mới | Lệnh jest | Dự kiến |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/modules/requests/purchase-invoice/purchase-invoice-plan.service.ts` | `const FAILED_AFTER_PURCHASE_STATES: ReadonlySet<string> = new Set(['FAILED', 'AWAITING_IT_CLOSE']);` | `const FAILED_AFTER_PURCHASE_STATES: ReadonlySet<string> = new Set(['FAILED']);` | `npx jest --config ./test/config/jest.integration.cjs test/integration/requests/purchase-invoice-decision.integration-spec.ts` | **Sống** (không ca `AWAITING_IT_CLOSE`) |
| 2 | `src/modules/requests/purchase-invoice/confirmation/purchase-invoice-confirmation.service.ts` | `subscriptionId: row.linkKind === 'SUBSCRIPTION' ? row.subscriptionId : poolSubscriptionId,` | `subscriptionId: row.linkKind === 'SUBSCRIPTION' ? row.subscriptionId : null,` | như #1 | Chết (ca K2 800.000/4.800.000) |
| 3 | `src/modules/requests/purchase-invoice/purchase-invoice-charge.policy.ts` | `return provisioningType === 'K1';` | `return provisioningType === 'K1' \|\| provisioningType === 'K4';` | `npx jest src/modules/requests/purchase-invoice/purchase-invoice-charge.policy.spec.ts` | Chết |
| 4 | `src/modules/requests/purchase-invoice/purchase-invoice-plan.service.ts` | `return ceiling !== null && money.netMinor > ceiling;` | `return ceiling !== null && money.netMinor >= ceiling;` | `npx jest --config ./test/config/jest.integration.cjs test/integration/requests/purchase-invoice.integration-spec.ts` | Chết (10.000.000 đúng mốc ⟹ `[]`) |
| 5 | `src/modules/usage/vendor-account-review/vendor-account-decision.service.ts` | `if (locked.source === 'INVOICE_DIFFERENCE' && decision === 'OUT_OF_PROCESS') {` | `if (false) {` | `npx jest --config ./test/config/jest.integration.cjs test/integration/usage/vendor-account-review.integration-spec.ts` | Chết |
| 6 | `src/modules/usage/vendor-account-review/out-of-process-case-closure.service.ts` | `if (input.outcome === 'RECORD_SPENT' && !actor.roles.includes('FINANCE')) {` | `if (false) {` | như #5 | Chết (IT ⟹ 403) |
| 7 | `src/modules/usage/vendor-account-review/out-of-process-case-closure.service.ts` | `if (!found \|\| found.status !== 'ACTIVE') throw new VendorAccountReviewRefusedError('COST_CENTER_NOT_FOUND');` | `if (!found) throw new VendorAccountReviewRefusedError('COST_CENTER_NOT_FOUND');` | như #5 | Chết (ca CC INACTIVE) |
| 8 | `src/modules/usage/vendor-account-review/vendor-account-review.repo.ts` | `AND d.state = 'DECIDED' AND d.evidence_on >= t.evidence_on::date)` | `AND d.state = 'DECIDED' AND d.evidence_on > t.evidence_on::date)` | `npx jest --config ./test/config/jest.integration.cjs test/integration/usage/vendor-account-review-sightings.integration-spec.ts` | Chết (ca "same day … nothing") |
| 9 | `src/modules/optimization/usage-rules/usage-rules-seat.service.ts` | `if (tier === null) return this.activeAgain(c, existing, open);` | `if (tier === null \|\| tier === 'MONITOR') return this.activeAgain(c, existing, open);` | `npx jest --config ./test/config/jest.integration.cjs test/integration/optimization/ghost-seat-g3-g4.integration-spec.ts` | Chết |
| 10 | `src/modules/optimization/escalation/escalation-facts.service.ts` | `if (leave.startedOn <= today && (leave.endedOn === null \|\| leave.endedOn > today)) away.add(leave.employeeId);` | `if (leave.startedOn <= today && (leave.endedOn === null \|\| leave.endedOn >= today)) away.add(leave.employeeId);` | `npx jest --config ./test/config/jest.integration.cjs test/integration/optimization/ghost-seat-escalation.integration-spec.ts` | **Sống** (không ca nghỉ kết thúc đúng hôm nay) |

(Trong bảng, `\|` là ký tự `|` thật của code.)

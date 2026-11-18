# AUDIT-AD1 — điều chỉnh ngân sách trong năm + ngân sách hiệu lực (BE `12662013`)

Skill đã đọc/dùng: `agent-skills:code-review-and-quality` (process + review năm trục, nhãn mức) · `superpowers:verification-before-completion` (mọi kết luận kèm dòng code/tài liệu đã đọc; không chạy test — đúng brief, nên mọi "đỏ/xanh" dưới đây là dự đoán, ghi rõ).

Phạm vi đọc (chỉ đọc qua `git show`): `d2c367ab` `b67f03bb` `fcc9b6d2` `6716443c` `40b343e3` `2eaac8b9` `d0c683b5` `12662013` (+ `956bbb54`). Tài liệu: `project-decisions.md` (QĐ-111ag, QĐ-111bh, QĐ-111ad, QĐ-111aa, QĐ-111ac, QĐ-97a, QĐ-97c, QĐ-103i, QĐ-104e, QĐ-109f), `Quy trình và chính sách theo main flow.md` (§4.11–4.14, dòng 868, 919–954), `BE-UserStory/src/EP-06.md` US-06-20 (dòng 721–757), SPEC.md AD-1 (dòng 508–522, T-AD1 dòng 701), OVERNIGHT-DECISIONS D-97, D-99, AD-1-Q1, AD-1-O1…O10.
Không chạy pnpm/jest/docker; không đọc `be-fe-feedback`.

Kết luận ngắn: lõi tiền đúng (công thức chưa phân bổ, sàn dự kiến, kiểm lại lúc duyệt, khóa kỳ → năm, đếm một lần phiên bản R-48, ngân sách hiệu lực ở kiểm Request/RV-1/bảng/tổng/mine/nhắc năm sau). Có **2 Required mức High** (R-48 khóa chết phiên bản năm khi điều chỉnh trong kỳ lập; `COST_CENTER_CHANGE` chuyển quá "phần còn lại" — cần Owner vì SPEC T-AD1 ngược US AC-10), **3 Medium**, còn lại Low/Nit.

---

## Findings

### AD1-01 — High (Required) — Điều chỉnh trong lúc kỳ lập ngân sách còn mở tạo phiên bản `ADJUSTMENT` và khóa chết phiên bản năm của phòng

- **Code:** `src/modules/budgets/adjustment/budget-adjustment-lock.service.ts:31` chỉ chặn `DRAFT` (kỳ `OPEN` lập/duyệt được); `src/modules/budgets/adjustment/budget-adjustment-apply.service.ts:45-59` tạo phiên bản `APPROVED` origin `ADJUSTMENT` khi Cost Center nhận chưa có phiên bản tham chiếu, chỉ kiểm `versions.inFlight` (phiên bản `DRAFT/SENT/CHANGES_REQUESTED`), **không** kiểm đề xuất `BM-10` đang mở (`SUBMITTED/REVIEWED`) hay năm đã bắt đầu. Sau đó `src/modules/budgets/version/version-creation.service.ts:62` và `src/modules/budgets/version/version-baseline-creation.service.ts:52` ném `BudgetCurrentExistsError` (409 `BUDGET.CURRENT_EXISTS`) — cả đường từ đề xuất lẫn đường số liệu nền đều bị chặn.
- **Kịch bản số:** kỳ 2027 `OPEN` (hạn nộp 30/11/2026), Trần 1.900 tr, Dự phòng kho 100 tr, đã phân bổ 1.771 tr ⟹ chưa phân bổ 29 tr. `P-X` (`CC-X`) đã nộp `BM-10` 300 tr (`SUBMITTED`), Finance chưa lập phiên bản. Ngày 20/11/2026 Finance lập *Bổ sung* 20 tr cho `CC-X` ⟹ 201; Người duyệt chi duyệt ⟹ 200, phiên bản `ADJUSTMENT` cơ sở 20 tr, dự phòng 0, `APPROVED`. Finance lập phiên bản từ `BM-10` 300 tr ⟹ 409 `BUDGET.CURRENT_EXISTS`. Cả năm 2027 `CC-X` chỉ có 20 tr (không dự phòng); muốn thêm chỉ còn *Bổ sung* ≤ 9 tr.
- **Căn cứ:** QT main flow dòng 868: "`MF-4` gọi [`SBF-11`] một lần ngay khi phiên bản hiện hành (B6)"; dòng 954: "trước khi khóa kỳ, Finance sửa ở `4.1`; sau khi khóa … *Giảm Trần năm*"; US-06-20 dòng 731 *Trigger*: "Finance lập điều chỉnh bất kỳ lúc nào **trong năm tài chính có phiên bản hiện hành**"; QĐ-103i B6 "hiện hành, bất biến cả năm, thay đổi trong năm qua điều chỉnh". R-48/AC-10 chỉ nói Cost Center mới giữa năm. D-99(6) tự chọn "kỳ phải đã mở" — chưa có Owner.
- **Cách sửa (tối thiểu):** ở `BudgetAdjustmentApplyService.apply` trước `versionMaker.make`: Cost Center nhận chưa có phiên bản mà (a) năm chưa bắt đầu (`today < ${year}-01-01`) hoặc (b) có đề xuất mở (`ProposalRepo.openOfCostCenters([receiver], year, tx)`) ⟹ 409 `BUDGET_ADJUSTMENT.BUDGET_IN_PREPARATION` (kiểm cả lúc lập ở `BudgetAdjustmentJudgeService.require`, để Finance biết ngay). Cần Owner chọn giữa "chặn khi năm chưa bắt đầu" hay "chặn khi kỳ chưa `LOCKED` + có đề xuất mở".
- **Test/mutation:** integration: kỳ `OPEN` + đề xuất `SUBMITTED` cho `CC-X`, *Bổ sung* 20 tr ⟹ lập hoặc duyệt 409, rồi `POST /budget-versions` từ đề xuất ⟹ 201. Mutation: bỏ guard mới ⟹ test đỏ.

### AD1-02 — High (Required, chờ Owner) — *Chuyển* `COST_CENTER_CHANGE` chặn trên ở **số cơ sở**, không ở **phần còn lại**: phòng cũ bị đẩy âm, tổng nghĩa vụ vượt Trần

- **Code:** `src/modules/budgets/adjustment/budget-adjustment.policy.ts:73-76` — chỉ `amount > base` ⟹ `OVER_BASE`; `COST_CENTER_CHANGE` trả `OK` ngay, không trừ thực chi + cam kết + chờ duyệt chi.
- **Kịch bản số (dữ liệu T-AD1):** Hành chính cơ sở 180, dự phòng 18 (hiệu lực 198), thực chi 80, cam kết giữ 30 ⟹ đã dùng 110, **phần còn lại 88**. *Chuyển* `COST_CENTER_CHANGE` 170 tr ⟹ OK (test `budget-adjustment.integration-spec.ts:132`). Sau duyệt: Cost Center cũ hiệu lực 10 + 18 = 28 tr < 110 tr đã dùng (vượt 82 tr — `overBudget`, Request còn mở trên Cost Center cũ bị chặn); Cost Center mới có 170 tr chi mới. Tổng nghĩa vụ 110 + 170 = 280 tr trên tổng ngân sách 198 tr của hai phòng ⟹ chi vượt Trần năm 82 tr mà không qua *Bổ sung*.
- **Căn cứ:** QĐ-111bh: "Finance lập điều chỉnh *Chuyển* **phần còn lại** từ Cost Center cũ sang mới … *Chuyển* này miễn sàn"; US-06-20 AC-10 (dòng 757): hiệu lực 338, đã dùng 190 ⟹ chuyển 148, "`CC-DES` còn 190.000.000 đ — **đúng số đã dùng**". Mâu thuẫn: SPEC T-AD1 (dòng 701) "*Chuyển* do đổi Cost Center 170 tr ⟹ OK" — code theo SPEC, SPEC ngược US/QĐ. "Miễn sàn" = miễn *dự kiến cuối năm*, không miễn *đã dùng*.
- **Cách sửa (khi Owner chốt theo QĐ-111bh/AC-10):** thêm vào `CostCenterPosition` `usedMinor` (thực chi + cam kết giữ + chờ duyệt chi, cùng nguồn `linesFor`); `COST_CENTER_CHANGE`: `amount ≤ min(base, base + reserve − used)` ⟹ 422 `BUDGET_ADJUSTMENT.OVER_REMAINING`. Đổi T-AD1: 170 tr ⟹ 422, 88 tr ⟹ OK.
- **Test/mutation:** policy spec: base 180, reserve 18, used 110 ⟹ 88 OK, 89 ⟹ 422; mutation đổi `>` thành `>=` ở cận mới phải đỏ.

### AD1-03 — Medium — Màn gói kỳ (`PackageService.read`) vẫn cộng phiên bản thô; Finance không có chỗ đọc "phần chưa phân bổ" thật

- **Code:** `src/modules/budgets/cycle/package.service.ts:93-102` cộng `version.baseMinor + version.reserveMinor` của `countedInYear` không có điều chỉnh; chú thích dòng 100 "The same sum as the annual check makes at the sending of a version" đã sai từ `6716443c` (`version-access.service.ts:117-128` cộng điều chỉnh). `overBy` dòng 133 tính trên số thô. `GET /budgets/summary` có `annualCeiling`, `sharedPoolReserve` nhưng `sharedPoolUnallocated` là dòng seat kho (khác khái niệm); không route nào trả `unallocatedMinor` của `BudgetAdjustmentJudgeService.unallocatedOf`.
- **Kịch bản số:** available 1.800, phiên bản 1.771. *Bổ sung* 20 tr cho Sales duyệt ⟹ gói kỳ vẫn `versionsTotal` 1.771, `overBy` 0 (ngầm còn 29) trong khi thật còn 9. Finance lập *Bổ sung* 29 tr theo màn ⟹ 422 `OVER_UNALLOCATED`. Sau *Giảm Trần năm* 9 tr: `available` 1.791 nhưng `versionsTotal` 1.771 ⟹ màn báo còn 20, thật còn 0.
- **Căn cứ:** US-06-20 AC-1 "phần chưa phân bổ còn 21.000.000 đ", AC-6 "phần chưa phân bổ còn 9.000.000 đ"; QĐ-111ag "tổng các phòng ≤ Trần năm − Dự phòng kho"; D-97(4).
- **Cách sửa:** `PackageService` dùng cùng tổng với cổng (`BudgetFactsRepo.allocatedOfYear` hoặc đưa `countedWithAdjustments` vào `budget/`) và trả thêm `unallocated` (= `unallocatedOf`), chỉ cho Finance/Người duyệt chi (AC-7: trưởng phòng không thấy).
- **Test/mutation:** integration: sau *Bổ sung* 20 duyệt, `GET` gói kỳ ⟹ `versionsTotal` 1.791, `unallocated` 9.

### AD1-04 — Medium — Nhận tiền vào Cost Center đã ngừng dùng

- **Code:** `src/modules/budgets/adjustment/budget-adjustment-create.service.ts:54-56` dùng `facts.costCenter` (`budget-facts.service.ts:139-144`: chỉ kiểm tồn tại + `UNIT`), không dùng `costCenterInUse` (`:150-156`, chặn `status !== 'ACTIVE'`) như đường lập phiên bản. Lúc duyệt không kiểm lại.
- **Kịch bản số:** 01/07/2027 `P-DES` đổi `CC-DES` ⟹ `CC-DES2`, `CC-DES` ngừng dùng. Finance chọn nhầm *Bổ sung* 20 tr cho `CC-DES` ⟹ duyệt được; chưa phân bổ 29 ⟹ 9; Request mới của phòng ghi vào `CC-DES2` nên 20 tr nằm chết tới khi có *Trả lại* (thêm một vòng duyệt). Tương tự *Chuyển* `COST_CENTER_CHANGE` chọn ngược chiều (đích là Cost Center cũ), hoặc Cost Center đích ngừng dùng chưa có phiên bản ⟹ còn tạo phiên bản `ADJUSTMENT` cho nó.
- **Căn cứ:** QĐ-87d(1) (Cost Center ngừng dùng ⟹ phòng không còn Cost Center dùng được); QĐ-111bh (đích là "Cost Center mới").
- **Cách sửa:** `toCostCenterId` ⟹ `costCenterInUse` lúc lập và trong `apply`; nguồn giữ `costCenter` (Cost Center cũ vẫn phải cho đi được).
- **Test/mutation:** integration: retire Cost Center rồi *Bổ sung* ⟹ 422/409 theo mã chọn.

### AD1-05 — Medium — Thiếu test cho các nhánh tiền quan trọng (đỏ-trước không chứng minh được)

- `test/integration/budgets/budget-adjustment.integration-spec.ts` chỉ **duyệt** *Bổ sung* và *Giảm Trần*. Không có: duyệt *Chuyển* (hai Cost Center, tổng + chưa phân bổ không đổi — AC-2), duyệt *Trả lại* (chưa phân bổ tăng, Trần không đổi — AC-5), *Chuyển* `COST_CENTER_CHANGE` tới Cost Center chưa có phiên bản (R-48 qua *Chuyển*, AC-10 — `adjustmentDeltasOf` nhánh `from` + `created_version_id` cùng lúc), kiểm lại **sàn** lúc duyệt khi dự kiến tăng giữa lập và duyệt (AC-4 "lúc C1 duyệt hệ thống kiểm lại sàn"), quyết định sau 01/01 (`decision.service.ts:63`), Request nhiều năm đọc hiệu lực từng năm (QĐ-97c, `yearFacts` vòng năm), tháng 01 và tháng 12 của `forecastsOf` (`budget-review-figures.service.ts:64`), Cost Center ngừng dùng, kỳ `OPEN`.
- **Cách sửa:** thêm 5 ca integration ở trên với số AC-2 (198 ⟹ 168 / 913 ⟹ 943), AC-5 (330 ⟹ 230), AC-10 (338, dùng 190, chuyển 148 ⟹ `CC-DES2` 148, `CC-DES` 190).

### AD1-06 — Low — *Giảm Trần năm* không ghi Audit Trail của kỳ (Trần trước/sau)

- **Code:** `budget-adjustment-apply.service.ts:41` gọi `cycles.update` trực tiếp; không có sự kiện `BUDGET_CYCLE.UPDATED` (đường sửa kỳ thường ghi ở `cycle.service.ts`), audit của điều chỉnh (`auditOf`) không có Trần trước/sau hay hiệu lực trước/sau.
- **Căn cứ:** US-06-20 dòng 739: "Audit Trail ghi … ngân sách hiệu lực trước/sau và Trần năm trước/sau khi *Giảm Trần năm*".
- **Sửa:** ghi `budgetAuditEvent(..., 'BUDGET_CYCLE.UPDATED', 'BudgetCycle', cycle.id, {annualCeilingMinor: mới}, {annualCeilingMinor: cũ})` trong cùng giao dịch.

### AD1-07 — Low — Điều chỉnh `PENDING` qua 01/01 không đóng được; Finance không hủy được

- **Code:** `budget-adjustment-decision.service.ts:63` áp `YEAR_ENDED` cho cả `REJECT`; không có route hủy; trigger cấm xóa. Điều chỉnh 2027 còn chờ ngày 01/01/2028 nằm `PENDING` mãi (hộp việc Người duyệt chi không sạch).
- **Căn cứ:** US-06-20 AC-8 "`F1` hủy rồi lập lại"; *Phạm vi quyền* "gửi hoặc hủy nháp".
- **Sửa:** cho `REJECT` sau hết năm, hoặc đóng ở job đóng năm (B7) thành `REJECTED` lý do hệ thống; Owner chốt có cần route hủy.

### AD1-08 — Low — OpenAPI route quyết định ghi `BUDGET.YEAR_ENDED` dưới 409, chạy thật là 422

- `budget-adjustment.controller.ts:142` vs `budget/budget.http-errors.ts:181-182` (422). `40b343e3` đã sửa route lập, sót route quyết định.

### AD1-09 — Low — Tiền tệ trộn

- `budget-adjustment-create.service.ts:35` đọc số theo tiền tệ báo cáo, `:62` lưu `cycle.currency`; `adjustmentDeltasOf` (`budget.policy.ts:290-308`) cộng vào phiên bản mọi tiền tệ không kiểm; `allocatedOfYear` (`budget-facts.repo.ts:91-106`) cộng mọi tiền tệ trong khi `annualCheck` từ chối lệch tiền tệ. Thực tế QĐ-111an mọi giá bằng đồng ⟹ rủi ro thấp; nên assert `cycle.currency === reportingCurrency` và phiên bản cùng tiền tệ.

### AD1-10 — Low — `base` ở kiểm ngân sách Request là cơ sở **hiệu lực**, ở `/budgets` là cơ sở **phiên bản**

- `requests/budget-check/budget-check-years-view.service.ts:52-57`: `base` và `effectiveBudget.base` cùng một số (đã lưu hiệu lực); `/budgets*` `base` = mốc phiên bản. FE dễ hiểu sai. AD-1-O8 đã ghi; nên ghi rõ trong mô tả OpenAPI.

### AD1-11 — Nit — `BUDGET.CONFLICT_OF_INTEREST` không chạm được qua route

- `decision.service.ts:61-62`: một người một vai (Finance ≠ `SPENDING_APPROVER`) nên nhánh không tới được (AD-1-O3 tự ghi). Giữ làm phòng thủ là được; có thể thêm CHECK DB `decided_by_employee_id IS DISTINCT FROM created_by_employee_id` để SoD-8 ở tầng dữ liệu.

### AD1-12 — FYI (chưa chứng minh) — mẫu khóa `attachWaiting` sau khóa năm

- `version-adjustment-creation.service.ts:81-110` cập nhật dòng cam kết chờ **sau** khóa năm; `seat-month-subscription.service.ts:184-202` khóa dòng cam kết **trước** khóa năm. Cùng mẫu với duyệt phiên bản có sẵn (không do AD-1 sinh), chỉ đụng nhau nếu seat-tháng chạm cam kết chưa gắn phiên bản của đúng Cost Center/năm. Không xếp Required vì chưa dựng được ca cụ thể.

---

## Phần đúng đã kiểm

- **T-AD1 bằng số** (policy + integration): chưa phân bổ = Trần − Dự phòng kho − Σ(cơ sở + dự phòng hiệu lực) (`budget-adjustment.policy.ts:39-47`, `budget-facts.repo.ts:91-106`): 1.800 − 1.771 = 29; *Bổ sung* 20 OK / 30 ⟹ 422; *Giảm Trần* 30 ⟹ 422 (`policy.ts:62-70`). Sàn `cơ sở − số + dự phòng ≥ dự kiến` (`policy.ts:77-80`): 180 − 20 + 18 = 178 ≥ 110 OK; 90 ⟹ 108 < 110 ⟹ 422; cận 88/89 có spec. Dự kiến lấy từ `BudgetReviewFiguresService.forecastsOf` = công thức RV-1 (không viết lại). Khớp US AC-4 (198, sàn 185: 20 ⟹ 178 < 185 chặn, 13 qua).
- **Kiểm lại lúc duyệt + AD-1-Q1:** `apply.service.ts:39` gọi lại `judge.require` dưới khóa kỳ; hai *Bổ sung* 29/29 cùng duyệt ⟹ [200, 422] (`integration-spec.ts:215`). PENDING không giữ chỗ đúng D-99(1); AC-8 thỏa.
- **Cộng vào cơ sở, dự phòng giữ** (`budget-facts.repo.ts:44-54`, `:126-134`); phiên bản gốc không đổi; R-48 đếm một lần (`budget.policy.ts:300-303` và CTE `budget-view.repo.ts:28-37` cùng luật `created_version_id`); *Chuyển* tổng không đổi về số học (giảm nguồn, tăng đích hoặc phiên bản = số).
- **Ngân sách hiệu lực áp đủ:** kiểm Request mọi năm (`requests/spend/budget-check.service.ts:252` → `yearFacts`), snapshot Người duyệt chi (đọc dòng kiểm đã lưu = hiệu lực), `GET /budgets` (CTE `adjusted`), `/budgets/summary` (`budget-table-view.service.ts:120-131, 168-172`), `/budgets/mine` (`budget-view.service.ts` `adjustmentOf`), RV-1 chốt/đèn (`approvedOfYear` hiệu lực — RV-1-O4 đóng), nhắc năm sau `next-year-reminder.service.ts:83` và `next-year-budget.service.ts:55`, cổng gửi phiên bản (`version-access.service.ts:117-128`). Chỗ còn đọc thô: **`package.service.ts`** (AD1-03). `referenceFiguresOfYear` không còn ai gọi. RV-2 (80/100 %) chưa có — khi làm phải đọc `yearFacts`.
- **Khóa:** kỳ `FOR UPDATE` → năm từng Cost Center theo id tăng (`budget-adjustment-lock.service.ts:30-33`); khớp gửi phiên bản (grant SHARE → kỳ → đề xuất → phiên bản → năm, `version.service.ts` send), số liệu nền (`requireVersionAllowed` → năm), gửi đề xuất (kỳ SHARE → năm), đường Request/hóa đơn/đóng năm không lấy khóa kỳ. Không thấy chu trình kỳ↔năm. Hàng điều chỉnh khóa `FOR UPDATE` sau kỳ; `found` đọc ngoài giao dịch an toàn vì trigger cấm sửa from/to/year.
- **SoD/quyền:** lập chỉ `FINANCE` (route + `requireFinance`); quyết chỉ `SPENDING_APPROVER` + `usableSpendingApproverEmployeeId = người gọi` khóa grant `FOR SHARE`; từ chối bắt buộc lý do (422 `BUDGET.ADJUSTMENT_REASON_REQUIRED`); trưởng phòng chỉ đọc điều chỉnh có Cost Center phòng mình, không thấy *Giảm Trần* (`query.service.ts:75-81`, `repo.ts:120-127`). OpenAPI: 0 chuỗi "QĐ-" trong `openapi.json`.
- **Migration `20261113101800`:** CHECK bốn loại đúng cột from/to, `transfer_reason` chỉ cho `TRANSFER`, trạng thái 3 giá trị, quyết định nhất quán (PENDING không có người/thời điểm; REJECTED bắt buộc lý do), `created_version_id` chỉ khi APPROVED và có đích; trigger cấm sửa nội dung đề nghị, cấm quyết lần hai, cấm DELETE/TRUNCATE; chạy lại an toàn (`IF NOT EXISTS`, `DROP … IF EXISTS`, `OR REPLACE`; `budget_versions_source_check` drop/add lại cùng tên). Nhỏ: không UNIQUE `created_version_id`, không ràng phiên bản thuộc đúng Cost Center/năm, không CHECK SoD (AD1-11).
- **Kiến trúc:** `budgets/adjustment/` 15 file (≤ 25); chỉ import `audit/public`, `notifications` public, các capability cùng module `budgets`; `requests` chỉ dùng `budgets/public`; không query bảng module khác.

## Mutation đề xuất

| file (ở `12662013`) | chuỗi cũ (duy nhất) | chuỗi mới | lệnh | kỳ vọng |
| --- | --- | --- | --- | --- |
| `src/modules/budgets/adjustment/budget-adjustment-decision.service.ts` | `if (yearHasEnded(adjustment.year, today)) throw new BudgetYearEndedError(adjustment.year);` | `` | `pnpm test:integration -- test/integration/budgets/budget-adjustment.integration-spec.ts` | dự đoán SỐNG (thiếu ca duyệt sau 01/01 — AD1-05) |
| `src/modules/budgets/adjustment/budget-adjustment-lock.service.ts` | `.filter((id): id is string => id !== null))].sort();` | `.filter((id): id is string => id !== null))].sort().reverse();` | `pnpm test:integration -- test/integration/budgets/budget-adjustment.integration-spec.ts` | dự đoán SỐNG (không có test hai *Chuyển* ngược chiều song song) |
| `src/modules/budgets/budget/budget.policy.ts` | `add(row.fromCostCenterId, -row.amountMinor);` | `add(row.fromCostCenterId, 0n);` | `pnpm test:integration -- test/integration/requests/budget-adjustment-effective.integration-spec.ts` | phải CHẾT (ca "gave more than it received") |
| `src/modules/budgets/budget-view/budget-view.repo.ts` | `WHERE x.created_version_id IS DISTINCT FROM r.id` | `WHERE TRUE` | `pnpm test:integration -- test/integration/requests/budget-adjustment-effective.integration-spec.ts` | phải CHẾT (R-48 đếm hai lần ở bảng) |
| `src/modules/budgets/adjustment/budget-adjustment-judge.service.ts` | `reserveMinor: budget.reserveMinor, forecastMinor: forecast };` | `reserveMinor: budget.reserveMinor, forecastMinor: 0n };` | `pnpm test:integration -- test/integration/budgets/budget-adjustment.integration-spec.ts` | phải CHẾT (90 tr ⟹ 422) |
| `src/modules/budgets/adjustment/budget-adjustment-apply.service.ts` | `if (receiver === null \|\| (await this.versions.reference(receiver, adjustment.year, tx)) !== null) return null;` | `if (receiver === null \|\| adjustment.kind === 'TRANSFER' \|\| (await this.versions.reference(receiver, adjustment.year, tx)) !== null) return null;` | `pnpm test:integration -- test/integration/budgets/budget-adjustment.integration-spec.ts` | dự đoán SỐNG (không có ca R-48 qua *Chuyển* — AC-10) |
| `src/modules/budgets/version/version-access.service.ts` | `? { ...one, baseMinor: one.baseMinor + (deltas.get(one.costCenterId) as bigint) }` | `? one` | `pnpm test:integration -- test/integration/budgets/budget-adjustment.integration-spec.ts` | phải CHẾT (ca "with nothing left after an approved supplement") |

Không lần chạy nào ở trên đã thực hiện (brief cấm chạy test); cột "kỳ vọng" là dự đoán từ việc đọc test.

# AUDIT P3 · B1-B — Request (RQ-1, RQ-2, RQ-3) · `dc879586..a4e31ff5`

Reviewer chỉ đọc (qua `git show/diff`), 14/11/2026. Không chạy pnpm/jest/docker; mọi kết luận dưới đây từ đọc code ở `a4e31ff5`.

**Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (khung 5 trục, mức Critical/Required/Optional/Nit),
`superpowers:verification-before-completion` (mỗi kết luận có dòng code làm bằng chứng; không tuyên bố test xanh/đỏ khi chưa chạy).

**Nguồn đối chiếu:** `QĐ-111h/i/j/k/l` (`Docs/Decisions/project-decisions.md:397-401`), BRD `FR-2.8` (dòng 349), `INV-07` (dòng 1466),
"Quy trình và chính sách theo main flow.md" `C-10`, `C-19`, dòng 86–89, 206–208; SPEC v2.1 §2, §4 D6, §5 RQ-1/2/3, §6, §8 T-RQ1/T-RQ2/T-R38/T-RQ3;
`OVERNIGHT-DECISIONS.md` D-13 → D-28.

## Tóm tắt

| Mức      | Số | Mã                                                    |
| -------- | -- | ----------------------------------------------------- |
| Critical | 1  | B-C1                                                  |
| Required | 2  | B-R1, B-R2                                            |
| Optional | 9  | B-O1 … B-O9 (gồm đánh giá các D-n chỉ là thiết kế)    |
| Nit      | 3  | B-N1 … B-N3                                           |

Phần đúng (đã kiểm, không có finding): tuần lịch GH-2 theo múi giờ tổ chức (`weekWindowOf` + `weekBoundsOf`), đếm theo `submitted_at`
của lần gửi (bản nháp được cập nhật `submittedAt` lúc gửi, `access-request.repo.ts:77`), khóa advisory theo người trước khi đếm, miễn trừ
`QĐ-108c`/`QĐ-110q` giữ nguyên; luật số tháng `checkTermMonths` khớp `QĐ-111i` + T-R38; cách đếm tháng đã bắt đầu và tách năm khớp T-RQ2
(1.200.000 / 4.200.000; 750.000 / 4.500.000) và T-R38 (3 tháng, 1.200.000 + 600.000); T−7 + mở thu hồi ngày sau ngày kết thúc khớp T-RQ3;
cổng `RevocationService.open` khóa seat và không thêm tác vụ/lý do thứ hai ⟹ sweeper an toàn nhiều instance; 4 migration RQ là expand,
không drop, chạy lại an toàn; `openapi.json` không chứa `QĐ-*`. Trần 25 file/thư mục: `requests/spend`, `requests/access-request`,
`licensing/provisioning` đều đúng 25 (không vượt, nhưng hết chỗ).

---

## Critical

### B-C1 — Trả lại cam kết theo ngày (`RV-07`) đọc Request RQ-2 như quyền _Dùng lâu dài_ ⟹ hoàn sai tiền, kể cả ở luồng hết hạn tự động của RQ-3

- **Vị trí:** `src/modules/requests/grant/seat-release.repo.ts:22-31` (`COALESCE(rn."new_expected_end_date", r."expected_end_date") AS end_date`),
  `src/modules/requests/grant/seat-release.policy.ts:33-39` (`lastMonthOf`: `endDate === null` ⟹ 12), `:45-50` (`firstMonthOf`),
  `:83-101` (`revocationShare`), `:109-121` (`lateGrantShare`). Nguyên nhân gốc: RQ-2 cố ý không lưu ngày kết thúc lên Request —
  `src/modules/requests/access-request/pricing.policy.ts:277` (`recordedEnd = null` khi `endIsDerived`), `request-facts.service.ts:164`
  (`endIsDerived: !renewing`), D-17(3); và grant không ghi ngược (`grant.policy.ts:45-57` chỉ đọc).
- **Kịch bản:** `K1` 600.000 đ/tháng, `termMonths = 3`, duyệt chi 15/03/2026 ⟹ `amount_months = 3`, cam kết 1.800.000, `seat_monthly` 600.000,
  `access_requests.expected_end_date = NULL`. Seat cấp 15/03, hết 14/06. Ngày 15/06 sweeper RQ-3 mở thu hồi, IT hoàn tất ⟹
  `afterRevocation` ⟹ `coverage.endDate = null` ⟹ `last = 12`, `first = 12 − 3 + 1 = 10` ⟹ `monthOf(endsOn)=6 < first` ⟹ trả lại
  `600.000 × 3 = 1.800.000` — **toàn bộ** cam kết, dù 3 tháng đã dùng hết. Ngân sách năm hiện "đã giữ 0". Tương tự: rời đi giữa kỳ trả
  nhiều hơn phần chưa dùng; Request qua năm (`K1` 9 tháng duyệt 15/11) — khoản `YEAR_START` 2027 giữ 7 tháng nhưng hết hạn 15/08/2027 trả
  lại thêm 5 tháng (Aug–Dec) cắt ở `heldMinor`; `K2` cấp trễ (`lateGrantShare`) không trả lại các tháng trước khi cấp (`monthOf(grant) < 10`).
  Trước RQ-2 các Request có thời hạn mang `expected_end_date` từ body nên `lastMonthOf` đúng; đây là hồi quy do RQ-2, và RQ-3 biến nó thành
  luồng chính (mọi quyền có thời hạn đi tới thu hồi tự động).
- **Căn cứ:** SPEC §5 RQ-2 "Dữ liệu: … `expected_end_date` thôi nhận từ body, **vẫn ghi từ ngày cấp**" (D-17(3) đi ngược câu này);
  `QĐ-111j` (cam kết = giá tháng × số tháng đã chọn), `RV-07`/`M-10` (trả lại đúng phần chưa dùng). Test hiện có
  (`test/integration/budgets/commitment-release-by-day.integration-spec.ts:62`, `commitment-release-ledger-rule…:72`, `…-on-transfer…:60`)
  đều ép `expected_end_date = NULL` + `amount_months = 12` (ca _Dùng lâu dài_) nên không bắt được.
- **Cách sửa (khuyến nghị A):** cho `SeatCoverage.endDate` biết ngày kết thúc thật của seat mà không đổi cách `requests` nhận diện "Request
  bản mới" (`expectedEndDate === null` đang là dấu phân biệt ở `RequestTermEndsService.of`, `RequestCostViewService.of`, `GroupSpendHold`,
  `supplement-pricing.service.ts`, nên **không** ghi vào `access_requests.expected_end_date`):
  1. `licensing/public/licensing.types.ts`: thêm `grantedEndDate: BusinessDate | null` (= `expected_end_date` của assignment do Request
     cấp, tức phần tử đầu tiên của chuỗi theo `predecessor_id`) vào `RightChain` và `RevocationCompletedFacts`; thêm `expectedEndDate` vào
     `GrantOutcomeFacts`. Licensing tự đọc bảng của nó.
  2. `seat-release.repo.ts` `coverageOf(tx, { requestIds, assignmentIds, grantedEnds })`: khi dòng của request cấp có
     `new_expected_end_date` và `expected_end_date` đều NULL **và** `term_months IS NOT NULL` thì `endDate = grantedEnds.get(requestId)`.
     `SeatReleaseService.afterRevocation/afterTransferEffective/afterRightReplaced/afterGrant` truyền giá trị đó.
  3. Ca _Dùng lâu dài_ (`term_months IS NULL`) giữ nguyên (`endDate = null` ⟹ 12).
  (B: thêm cột `access_requests.granted_end_date` ghi lúc cấp — trái "không cột mới" của SPEC §6, chỉ chọn nếu Owner đồng ý.)
- **Test/mutation:** integration mới ở `test/integration/budgets/commitment-release-by-day.integration-spec.ts`: (a) `K1` 3 tháng duyệt + cấp
  15/03/2026, thu hồi hoàn tất 15/06 ⟹ trả lại `0`; (b) cùng Request, thu hồi hoàn tất 20/04 ⟹ trả lại phần từ 20/04 tới 14/06 (đúng
  `releaseOnRevocation`), không phải 1.800.000; (c) `K2` 3 tháng duyệt 15/03 cấp 01/04 ⟹ `LATE_GRANT` trả lại phần tháng 3. Mutation: bỏ nhánh
  `grantedEnds` trong `coverageOf` ⟹ (a) đỏ (trả 1.800.000). Thêm một ca vào `expiry-system-revocation.integration-spec.ts`: hoàn tất tác vụ
  hệ thống mở ⟹ `budget_commitment_releases` không có dòng `REVOKED` cho Request đã dùng hết kỳ.

## Required

### B-R1 — Nhân sự có thời hạn mà hợp đồng hết **trước** ngày bắt đầu kỳ: seat vẫn được cấp/kéo dài quá ngày hết hợp đồng (trái `INV-07`, R-38)

- **Vị trí:** `src/core/term-limit.ts:133-138` (`end = contractEndDate > start ? contractEndDate : start`, `startedMonths = max(1, …)`),
  dùng ở `requests/renewal-request/renewal-request-writer.service.ts:61-72` (Request tiếp tục, `termStart = previousEnd + 1`),
  `requests/access-request/request-facts.service.ts:244-266`, `licensing/provisioning/tasks/provisioning-grant-writer.service.ts:302-304`.
  Quyết định: D-17(2), D-28(2).
- **Kịch bản (luồng chính của RQ-3):** thực tập sinh hết hợp đồng 31/01/2027, seat `K2` đã bị cắt về 31/01/2027 ⟹ cửa sổ 30 ngày mở 02/01,
  hệ thống nhắc T−7. Người giữ gửi Request tiếp tục 3 tháng ⟹ `termStart = 01/02/2027`, hợp đồng < `termStart` ⟹ `end = 01/02/2027`,
  tính 1 tháng; duyệt chi giữ 1 tháng tiền; IT kéo dài ⟹ seat mới hiệu lực tới 01/02/2027 (**sau** ngày hết hợp đồng) và bị tính một tháng
  không ai dùng. Ca Request mới: ngày hết hợp đồng đã qua mà người vẫn ACTIVE ⟹ grant cắt về `start = ngày cấp` (> ngày hết hợp đồng). Ca
  `K4` (`provisioning-grant-writer.service.ts:302`): `contractEnd < today` ⟹ seat có `expected_end_date < effective_from`, DB từ chối, IT
  nhận lỗi không rõ nghĩa.
- **Căn cứ:** BRD `INV-07` (dòng 1466) "vượt ngày hết hợp đồng thì **tự cắt tại ngày đó**" — không có trường hợp seat sống sau ngày hết hợp
  đồng; `QĐ-111i`, FR-2.8. "Không từ chối" của `QĐ-111i` áp cho ngày **suy ra** vượt hợp đồng, không phải ca không còn ngày nào để cấp.
- **Cách sửa:** thêm `TermRefusal` `'TERM_CONTRACT_ENDED'` (422 `ACCESS_REQUEST.TERM_CONTRACT_ENDED`, `details { contractEndDate }`):
  1. `term-limit.ts`: `checkTermMonths` nhận `contractEndDate` + `start`; người có thời hạn có `contractEndDate < start` ⟹ `TERM_CONTRACT_ENDED`
     (mọi kiểu cấp, cả `K4` và `renewing`). Giữ `termRunOf` nhưng ném `Error` nếu gọi với hợp đồng < start (bất biến lập trình).
  2. `request-facts.service.ts termOf` và `group-submission-facts.service.ts:166` truyền hai giá trị; nhóm: dòng đó bị từ chối như
     `TERM_REQUIRED` (thêm vào `personTermRefusal`).
  3. `provisioning-grant-writer.service.ts endOfSeat`: `hasTerm && contractEnd !== null && contractEnd < today` ⟹ ném lỗi nghiệp vụ
     `PROVISIONING.CONTRACT_ENDED` (409), không ghi seat.
  4. OpenAPI: thêm ví dụ vào `TERM_ERROR_EXAMPLES`; Docs API FE ghi mã mới. Ghi D-n mới ở OVERNIGHT-DECISIONS (sửa D-17(2), D-28(2)).
  Nếu Owner muốn giữ "không từ chối", phương án B: từ chối riêng Request tiếp tục (không có kỳ mới nào nằm trong hợp đồng) và với Request mới
  cắt tại `contractEnd` (kể cả trước `start`) rồi để grant từ chối — vẫn không được cấp seat quá hợp đồng.
- **Test/mutation:** `test/integration/licensing/renewal-term-end.integration-spec.ts`: thực tập sinh hợp đồng 31/12/2026, seat hết 31/12/2026,
  gửi Request tiếp tục 3 tháng ngày 20/12 ⟹ 422 `TERM_CONTRACT_ENDED`; `request-amount-term.integration-spec.ts`: hợp đồng 01/11/2026, gửi 10/11
  ⟹ 422; unit `term-limit.spec.ts` biên `contractEnd = start` (được, 1 tháng) và `contractEnd = start − 1` (từ chối). Mutation: đổi `<` thành
  `<=` ⟹ ca biên đỏ.

### B-R2 — Đề xuất phần mềm ngoài danh mục (case B) giữ số tháng theo luật `K2`, IT đánh giá thành `K1`/`K4` thì không ai kiểm lại

- **Vị trí:** `src/modules/requests/access-request/request-facts.service.ts:234-235` (`termOf({ kind: 'K2', … })`),
  `requests/assessment/proposal.service.ts:59,82,117` (lưu `termMonths`), `requests/assessment/assessment-completion.service.ts:41` (hoàn tất
  đánh giá đặt `provisioningType` K1–K4, `assessment.dto.ts:72`, không đụng số tháng), `requests/grant/grant.policy.ts:57`
  (`termBound = (request.termMonths ?? 0) > 0` bất kể kiểu cấp). Quyết định: D-19(3).
- **Kịch bản:** nhân viên đề xuất phần mềm mới, chọn 12 tháng (hợp lệ theo `K2`). IT đánh giá là `K1` ⟹ seat cấp 12 tháng, cam kết 12 tháng —
  trái trần `K1` = 9. IT đánh giá là `K4` (mua một lần) ⟹ `termBound = true` ⟹ seat có ngày kết thúc sau 12 tháng ⟹ RQ-3 nhắc T−7 rồi **tự mở
  thu hồi** một bản quyền đã mua đứt; Request tiếp tục cho `K4` lại bị `TERM_NOT_ASKED` (D-28 bổ sung) ⟹ người dùng mất quyền đã mua.
- **Căn cứ:** `QĐ-111i` (`K1` bắt buộc 1–9, `K4` không hỏi), `QĐ-106b`, BRD FR-3.2/C-10; D-19(3) chỉ giải quyết lúc gửi.
- **Cách sửa (khuyến nghị A):** ở `AssessmentCompletionService.complete`, sau khi biết `provisioningType`, chạy
  `checkTermMonths({ kind, termMonths: request.termMonths, fixedTermPerson, contractEndKnown })`:
  `K4` ⟹ ghi `term_months = NULL` (mua một lần, không thời hạn; người có thời hạn theo D-20) và ghi audit; `K1` với `termMonths > 9` hoặc
  `NULL` ⟹ 422 `ASSESSMENT.TERM_NOT_FIT_KIND` `details { provisioningType, termMonths, maxMonths }` — IT trả Request về bổ sung (đường
  `/supplements` đã nhận `termMonths`, D-25). B (tối thiểu): `grant.policy.ts:57,133` tính `termBound` theo kiểu cấp của gói lúc cấp
  (`K4` ⟹ không có hạn trừ người có thời hạn) và cắt `termMonths` ở 9 cho `K1` — chỉ chặn hậu quả ở seat, cam kết vẫn sai nên kém A.
- **Test/mutation:** `test/integration/requests/access-request-new-software.integration-spec.ts`: đề xuất 12 tháng, IT hoàn tất `K1` ⟹ 422;
  đề xuất 6 tháng, hoàn tất `K4` ⟹ `term_months` NULL và grant ra seat không có ngày kết thúc. Mutation: bỏ lời gọi `checkTermMonths` ở
  completion ⟹ hai ca đỏ.

## Optional

### B-O1 — D-26(1)/(3): Request tiếp tục đã duyệt mà IT không bao giờ kéo dài ⟹ quyền sống mãi, không nhắc, không thu hồi

- **Vị trí:** `licensing/expiry/expiry-revocation.service.ts:45-50`, `expiry.policy.ts:60-77`, `requests/renewal-apply/renewal-request.repo.ts`
  (`approved = state === 'AWAITING_EXECUTION'`).
- **Kịch bản:** duyệt 01/11, tác vụ `EXTEND` của IT treo ⟹ sau ngày kết thúc cũ sweeper bỏ qua (renewal chưa kết thúc), nhắc bị giữ lại; nếu
  tác vụ `EXTEND` đóng thất bại mà Request không chuyển sang trạng thái kết thúc thì quyền không bao giờ vào thu hồi.
- **Đánh giá:** D-26 hợp `QĐ-111l` ("duyệt trước hạn ⟹ giữ seat, không mở thu hồi"); đây là hở vận hành. **A (khuyến nghị):** giữ D-26, thêm
  vào HANDOFF + kiểm rằng `RENEWAL_NOT_APPLIED`/đóng thất bại của `EXTEND` đưa Request về trạng thái kết thúc (để lượt quét sau mở thu hồi) —
  một test integration. B: đặt hạn (vd. `debt` 7 ngày) rồi mở thu hồi bất kể.

### B-O2 — Lượt nhắc T−7 có thể bị "đói" bởi các quyền đã duyệt gia hạn

- **Vị trí:** `licensing/expiry/expiry-reminder.service.ts:24,51,73-78`; `expiry-reminder.repo.ts` `candidates(..., take 200)` sắp theo
  `expected_end_date, id`.
- **Kịch bản:** ≥ 200 quyền trong cửa sổ 7 ngày có Request tiếp tục đã duyệt (bị lọc **sau** khi đọc) ⟹ mỗi lượt đọc lại đúng 200 dòng đó, các
  quyền khác không bao giờ được nhắc. Sweeper thu hồi đã phân trang để tránh việc này, lượt nhắc thì chưa.
- **Sửa:** phân trang như `ExpiryRevocationService.openDue` (vòng `afterId`) hoặc lọc trong SQL qua một danh sách id lấy từ `RenewalHoldHook`.
  Test: unit với stub repo trả 200 quyền giữ lại rồi 1 quyền thường ⟹ quyền thường được nhắc.

### B-O3 — D-18(d): `GET /spend-approvals` không có khối chi phí theo năm như SPEC §5 RQ-2 ghi

- **Vị trí:** `requests/spend-approval-view/spend-approval.dto.ts:136-165` (summary chỉ có `amount`, `nextYearBudget`).
- **Đánh giá:** SPEC bảng RQ-2 dòng 2 liệt kê `GET /spend-approvals`; `QĐ-111k` chỉ đòi "màn duyệt hiện sẵn" — chi tiết đã có `termCost`.
  **A:** thêm `nextYearAmount: money.nullable()` (một trường, không thêm truy vấn) vào summary; B: giữ, ghi lệch SPEC ở HANDOFF để FE biết.

### B-O4 — D-15(c): tổ chức đã lưu `REQUEST_OPEN_NEW_LIMIT = 3` (nghĩa cũ "đang mở") nay thành 3 Request/tuần

- **Vị trí:** `operating-parameters/parameter-definitions.policy.ts:113-123`.
- **Đánh giá:** không ghi đè dữ liệu Owner đặt là đúng nguyên tắc; seed không lưu khóa này. **A:** giữ (c), HANDOFF/Docs cài đặt nhắc Super
  Admin xem lại giá trị; B: migration đặt 10 chỉ cho hàng có giá trị đúng bằng mặc định cũ 3.

### B-O5 — D-21: sửa migration `20261113003000` tại chỗ sau khi đã commit

- **Vị trí:** `prisma/migrations/20261113003000_rq2_employee_contract_end/migration.sql` (commit `ff5d4529` rồi `d99c21c3`).
- **Rủi ro:** DB cục bộ nào đã `migrate deploy` bản `contract_ends_on` (dev:seed của Owner trên nhánh này) sẽ báo checksum lệch. **A:** giữ (chưa
  merge), ghi HANDOFF "reset DB cục bộ của nhánh `feat/fe-feedback`"; B: migration mới đổi tên cột.

### B-O6 — Planner đọc người giữ ngoài transaction cấp

- **Vị trí:** `licensing/provisioning/tasks/provisioning-grant-planner.service.ts:73` (`getEmployee(answer.employeeId)` không truyền `tx`).
- **Kịch bản:** Super Admin sửa `contractEndDate`/loại nhân sự giữa lúc đọc và lúc ghi seat ⟹ seat cắt theo ngày cũ. Nhỏ, nhưng sửa một dòng:
  truyền `tx` (planner chạy trong transaction của grant hay không thì kiểm lại; nếu không, đọc lại trong `ProvisioningGrantWriter.write`).

### B-O7 — `nextYear` của chi tiết cho Request nhóm và `termCutAt` suy đoán (D-23, D-24)

- **Vị trí:** `requests/request-view/request-cost-view.service.ts:59,84-90`.
- **Đánh giá:** D-24 hợp lý (số đọc từ số đã lưu). Hai hở đã tự ghi: nhóm không có tháng/cắt; `termCutAt` chỉ báo khi số tháng đã bắt đầu < số
  tháng xin. **A:** giữ, thêm vào tài liệu API FE "nhóm: `months`/`termCutAt` luôn null"; B: lưu `started_months` lúc duyệt (cần cột — trái §6).

### B-O8 — Đánh giá các D-n thuần thiết kế trong vùng (không trái QĐ/BRD)

| D-n | Kết luận | Ghi chú |
| --- | --- | --- |
| D-13 (409 → 422, `{ limit, resetsOn }`) | A — giữ | khớp T-RQ1; Docs API FE đang ghi 409 ⟹ phải sửa ở lượt tài liệu |
| D-14 (bỏ `flags`, thêm `limits.resetsOn`) | A — giữ | `strictObject` từ chối `manyPaidSoftwareReason` (test http 5 form) |
| D-16/D-21 (cột `contract_end_date`, CHECK STAFF ⟹ NULL) | A — giữ | hở import `BM-09` đã ghi; import chỉ tạo mới nên CHECK không làm hỏng import |
| D-17(1)(3)(4)(5)(6) | A — giữ | D-17(2) xem B-R1 (Required) |
| D-18(b) cột `held` | A — giữ | hàng `held=false` chiếm khóa `(request, employee, year+1)`; hiện không có writer nào cần hàng `held=true` của năm sau (khoản 01/01 theo seat) — ghi chú cho SM-1/AD-1 |
| D-19(1)(2)(4)(5) | A — giữ | D-19(3) xem B-R2 (Required) |
| D-20 (`K4` + người có thời hạn chỉ khi biết hợp đồng) | A — giữ | khớp `INV-07` |
| D-22 (guard giữ `held`) | A — giữ | migration mới, `CREATE OR REPLACE`, an toàn |
| D-23 (cam kết theo từng người) | A — giữ | fallback chia đều khi tổng không khớp là an toàn |
| D-25 (`/supplements` theo kiểu cấp) | A — giữ | xem B-N2 về status |
| D-26 | A — giữ | xem B-O1, B-O2 |
| D-27 (`WINDOW_NOT_OPEN` 409 → 422) | A — giữ | khớp T-RQ3; Docs API FE phải sửa |
| D-28 (`extensionMonths` \| `longTerm`, cột `new_expected_end_date` nullable) | A — giữ | D-28(2) xem B-R1; thông báo `REQUEST_RENEWAL_APPLIED` nhận `newExpectedEndDate: null` hợp lệ (`inbox.policy.ts` cho phép `null`) |

### B-O9 — Test chưa phủ đường tiền của RQ-2/RQ-3 và rủi ro CI

- Không chạy được suite; đọc tĩnh không thấy tham chiếu treo tới mã đã xóa (`END_DATE_OUT_OF_RANGE`, `TERM_BEYOND_LIMIT`, `openRequestIds`
  ở wire, `listPaidApplicationsOf`, `contract_ends_on`) — các chỗ còn `newEndDate`/`manyPaidSoftwareReason`/`MANY_PAID_SOFTWARE` trong test là
  ca âm (mong 422/400). Các ca test bị xóa trong diff tương ứng tính năng bị bỏ (GH-3, `expectedEndDate`, `newEndDate`, `RATE_MISSING`), không
  thấy nới assertion của ca còn giữ.
- Hở phủ: không test nào đi từ Request RQ-2 (có `termMonths`, `expected_end_date` NULL) tới `SeatReleaseService` (xem B-C1); không test hợp đồng
  hết trước kỳ (B-R1); không test đề xuất case B đổi kiểu cấp (B-R2). Ba test của các finding trên là đủ.

## Nit

- **B-N1** `licensing/expiry/expiry.policy.ts:70-77`: tham số `revocationEver` luôn được truyền `false`
  (`expiry-revocation.service.ts:49`) vì SQL đã loại — bỏ tham số hoặc đọc thật, tránh luật chết.
- **B-N2** `SPEND.SUPPLEMENT_TERM_NOT_ASKED` là 409 (theo D-25; ví dụ ở `group-request.http-errors.ts:151`) trong khi
  `ACCESS_REQUEST.TERM_NOT_ASKED` là 422 cho cùng loại lỗi đầu vào — cân nhắc 422 cho đồng bộ (mã khác nhau nên không phạm "một mã một status").
- **B-N3** `requests/renewal-request/renewal-request-writer.service.ts:92-95`: đọc `findById` hai lần liên tiếp, bản đầu bỏ đi (có từ trước,
  đã bị chạm trong diff) — bỏ một lần đọc.

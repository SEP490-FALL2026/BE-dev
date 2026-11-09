# Spec: qd96-100-approved-end-date — ngày kết thúc quyền do server tính; ngày kết thúc hợp đồng trên hồ sơ

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement ghi tên khi nhận.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-R, lượt `qd96-100-alignment`) theo giao việc Owner 05/11/2026.
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-2.8` BRD:345, `FR-3.22`; US `US-05-02` AC-11, `US-05-14` AC-9, `US-05-17` AC-8 (bị thay);
  `QĐ-98a` PD:405, `QĐ-62h` PD:293, `QĐ-82l(18)` PD:315, `QĐ-87`), BE `3e4553b9`. Quyết định phiên Owner `Q-03` a1 + b1 + c1
  ([QUESTIONS.md](../../../reviews/qd96-100-alignment-2026-11-05/QUESTIONS.md) mục D). Ledger: L-205, L-220.
- Nhóm roadmap: G5 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Quyền trả phí cấp qua Request có ngày kết thúc = ngày duyệt chi + `termMonths` − 1 ngày (thuê bao linh hoạt cắt cuối năm);
nhà thầu, freelancer, thực tập sinh lấy ngày sớm hơn giữa ngày đó và _ngày kết thúc hợp đồng_ do Super Admin ghi trên hồ sơ
(nhập tay hoặc import); người gửi Request nhóm không còn nhập ngày, không còn thấy chi phí/lý do của đồng nghiệp. Kiểm bằng
integration duyệt chi → cấp → Assignment có ngày.

## Sizing decision

- Container: G5 (và G2 cho trường hồ sơ) trong bó finding `qd96-100-alignment` — container, không phải ranh giới.
- Mode: `split-story`.
- Outcome and owner: ngày kết thúc đã duyệt của quyền; capability `requests/grant` + nơi ghi duyệt chi (`spend-approval`,
  `group-line-decisions`), trường hồ sơ ở `organization/employee`, cột import ở `data-import/employee-import`.
- Boundaries: một migration (cột hồ sơ + check); ghi ngày trong transaction duyệt chi hiện có; đọc hợp đồng lúc IT nhận cấp
  (`claimForGrant`); quyền đọc thu hẹp ở `accessRequestLineList`.
- Not larger: Request tiếp tục (`qd96-100-renewal-chaining-and-window`); năm tạm tính/tính lại (`qd96-100-request-year-without-spend-date`);
  đổi người chịu trách nhiệm tài khoản dịch vụ (`Q-03` d1 — `qd96-100-catalog-licensing-api-fields`).
- Not smaller: ngày hợp đồng chỉ có nghĩa khi bỏ ô ngày của người gửi cùng lúc; tách ra thì có giai đoạn nhà thầu không có ngày (`FR-2.8`).
- Siblings: `qd96-100-request-year-without-spend-date`, `qd96-100-request-term-limit`, `qd96-100-renewal-chaining-and-window`.
- Scope map: [G2](../../../roadmap.md#work-item-decomposition-g2), [G5](../../../roadmap.md#work-item-decomposition-g5) — dòng map do điều phối viên đăng ký.

## Primary Story/AC

| Story    | AC    | Coverage | Phần còn lại thuộc                                                                                 |
| -------- | ----- | -------- | -------------------------------------------------------------------------------------------------- |
| US-05-02 | AC-11 | partial  | vế năm tạm tính/tính lại và lịch trả từ ngày duyệt chi: `qd96-100-request-year-without-spend-date` |

## Supporting references

`Q-03` a1/b1/c1; `FR-2.8`; `US-05-14` AC-9 (Request tiếp tục cần ngày kết thúc đã duyệt — bật nhờ hạng mục này);
`QĐ-82l(18)` (người gửi nhóm chỉ thấy họ tên, email). **Nợ tài liệu:** `US-05-17` AC-8 (người gửi nhập ngày cho thực tập
sinh) bị `Q-03` b1 thay — báo Docs sửa; `BM-01`/QT phần nhóm cùng ý.

## Explicit out of scope

- Ngày hợp đồng đổi **sau** khi đã cấp không tự rút ngắn Assignment đang có (nghỉ sớm đi MF-2; rút ngắn đi hoàn trả).
- Request đã duyệt nhưng chưa cấp trước khi bản này chạy: không backfill (demo reset bằng `qd96-100-seed-demo-v3`).
- Nhắc _cửa sổ tiếp tục mở_ và job hết hạn của `licensing/expiry` (đã có): không đổi, nhưng từ đây áp cho cả nhân viên chính thức.
- Hiện `contractEndDate` cho trưởng phòng/người gửi nhóm: không (dữ liệu nhân sự của Super Admin).

## Dependencies and blockers

Sau `qd96-100-request-term-limit` (dùng `termEndOf`, `termLimitOf`, cờ linh hoạt) và `qd96-100-request-sender-rules`
(IT không nhập ngày khi cấp). Khi `qd96-100-request-year-without-spend-date` và `qd96-100-budget-check-three-outcomes` sửa cùng
recorder duyệt chi: hạng mục merge sau rebase, giữ một lời gọi `approvedEndOf`. Migration
`<ts>_organization_employee_contract_end_date` đi trước code.

## Ownership: module, data, API

- `organization/employee/{employee.dto.ts, employee-manual.service.ts, employee-maintenance.service.ts, employee-correction.policy.ts,
employee.repo.ts}`, `organization/employee-directory/*` (detail), `organization/public/{organization.types.ts, organization-read.api.ts}`.
- `data-import/employee-import/{row-validation/*, preview/*, confirmation/*, employee-import-cells.json.ts, employee-import-differences.json.ts}`.
- `requests/access-request/term-limit.policy.ts` (dùng), mới `requests/grant/approved-end.policy.ts` (`approvedEndOf`, `grantEndOf`).
- `requests/spend-approval/spend-decision-recorder.service.ts`, `requests/group-line-decisions/group-spend-record.service.ts`,
  `requests/grant/{grant.policy.ts, access-request-grant.listener.ts}`, `requests/group-request/{group-request.dto.ts,
group-request.policy.ts, beneficiary-eligibility.policy.ts}`, `group-request-submission/*`, `group-line-decisions/group-line-query.service.ts`,
  `draft/request-draft-content.mapper.ts`; `licensing/public/licensing.types.ts` + nơi map trạng thái grant answer.
- Bảng: `employees.contract_end_date` (mới); ghi `access_requests.expected_end_date`, `access_request_lines.expected_end_date`
  (nghĩa mới: ngày do server tính lúc duyệt chi).
- API đổi: `employeeCreate`, `employeeUpdateOfficialFields`, `employeeGet` (+ `contractEndDate`), `employeeImportUpload/Get/RowList`
  (cột mới), `groupRequestSubmit`/`groupRequestCheck`/`accessRequestDraftSave` (bỏ `lines[].expectedEndDate`, bỏ lý do
  `END_DATE_REQUIRED`, `END_DATE_TOO_EARLY`), `accessRequestLineList` (thu hẹp), `provisioningTaskGrant` (mã lỗi mới).

## Behavior and design

1. **Hồ sơ:** `contractEndDate` (ngày, tùy chọn trên wire). `employmentType ≠ STAFF` ⟹ bắt buộc khi tạo, khi import và khi
   đổi sang loại đó (`422 EMPLOYEE.CONTRACT_END_REQUIRED`); `STAFF` ⟹ phải trống (`422 EMPLOYEE.CONTRACT_END_NOT_APPLICABLE`);
   không trước `hireDate`. Hàng cũ không phải STAFF chưa có ngày: hợp lệ (legacy) tới lần sửa tiếp. Import: cột
   `contract_end_date` (YYYY-MM-DD), cùng luật, lỗi theo dòng; báo cáo khác biệt khi import lại có cột này. Audit như trường chính thức khác.
2. **Lúc duyệt chi** (cá nhân: `SpendDecisionRecorder` khi `APPROVED` và không phải `RENEWAL`; nhóm: mỗi dòng được duyệt ở
   `group-spend-record`): `start` = ngày tổ chức của lúc duyệt; `approvedEndOf({ start, termMonths, flexible, fiscalYearStartMonth })`
   = `effectiveTermOf({ start, months: termMonths, flexible, fiscalYearStartMonth }).endOn` của `qd96-100-request-term-limit`
   (C-REVIEW R-15: cùng hàm với reprice của `qd96-100-request-year-without-spend-date`, nên tiền và ngày quyền khớp); ghi vào
   `expected_end_date` của Request/dòng trong
   cùng transaction. `flexible` đọc như `qd96-100-request-term-limit` (thuê bao có giá của phòng hoặc báo giá).
3. **Không có ngày theo thời hạn:** nội bộ không phí, tài khoản dịch vụ, quyền từ khởi tạo (`Q-03` a1) ⟹ `expected_end_date` trống.
4. **Lúc IT nhận cấp** (`claimForGrant`/`check`): `grantEndOf = earliest(ngày đã lưu, contractEndDate của người thụ hưởng
nếu không phải STAFF)`; tài khoản dịch vụ bỏ qua hợp đồng. Kết quả `< hôm nay` ⟹ answer `ACCESS_END_PASSED`, licensing trả
   `409 PROVISIONING_TASK.ACCESS_END_PASSED`, không tạo Assignment. IT không sửa ngày (`Q-03` c1, đã gỡ input ở #4).
5. **Request nhóm:** bỏ `lines[].expectedEndDate` (strict ⟹ 422 nếu gửi); `checkBeneficiary` bỏ luật ngày kết thúc;
   `groupRequestCheck` không còn lý do lộ loại hợp đồng (đóng L-220 vế 1). Bản nháp cũ: codec xóa `expectedEndDate` của từng dòng.
6. **`accessRequestLineList`** (L-220 vế 2): người xem là người gửi nhưng **không** là trưởng phòng của phòng, không giữ bước,
   không IT Admin ⟹ dòng của người khác chỉ có `employee`, `position`, `state`, `needStep.state`; `cost`, `share`,
   `needDecision`, `spendDecision`, `endReason`, `expectedEndDate` = `null`. Dòng của chính mình đầy đủ.
7. Migration: `ALTER TABLE employees ADD COLUMN contract_end_date date NULL` + `CHECK (employment_type <> 'STAFF' OR
contract_end_date IS NULL)`. Không đổi cột của `access_requests`/`access_request_lines`.

### Phần A — FE nối tối nay (chỉnh 05/11 theo review main flow F03)

**Mức FE-tonight: A** cho mục 2, 3, 5 (ngày kết thúc do server tính lúc duyệt chi; người gửi nhóm không nhập ngày) — không
migration. **B:** mục 1, 4, 6, 7 (cột `contractEndDate` trên hồ sơ + import, cắt theo hợp đồng lúc cấp và
`ACCESS_END_PASSED`, thu hẹp `accessRequestLineList`). Hệ quả tạm thời từ A tới B, ghi cho demo: quyền trả phí của nhà
thầu/thực tập sinh kết thúc theo thời hạn đã duyệt (chưa cắt theo hợp đồng); quyền **nội bộ không phí** của họ chưa có ngày
kết thúc — nợ `FR-2.8` tới phần B.

| Operation (vai)                                                                                                                                    | Hiện tại                                                                                       | Sau sửa — người dùng nhập                                              | BE tự tính / output                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groupRequestSubmit`, `groupRequestCheck`, `accessRequestDraftSave` (nhánh GROUP)                                                                  | `lines[] {employeeId, expectedEndDate?}`; lý do dòng `END_DATE_REQUIRED`, `END_DATE_TOO_EARLY` | `lines[] {employeeId}`; gửi `expectedEndDate` ⟹ 422 `VALIDATION_ERROR` | check bỏ hai lý do dòng đó (không lộ loại hợp đồng — L-220 vế 1); bản nháp cũ: codec bỏ ngày từng dòng                                                                                                                                          |
| `provisioningTaskGrant` (IT Admin)                                                                                                                 | `expectedEndDate?`                                                                             | bỏ (`qd96-100-request-sender-rules` phần A)                            | Assignment lấy ngày của Request/dòng                                                                                                                                                                                                            |
| `accessRequestGet` (`request.expectedEndDate`), `accessRequestLineList` (`lines[].expectedEndDate`), `licenseAssignmentList`, `me/software-rights` | ngày do người gửi nhóm/IT nhập, chỉ nhà thầu                                                   | —                                                                      | `expectedEndDate` = `null` trước khi duyệt chi; sau duyệt chi = ngày bắt đầu (ngày duyệt) + `termMonths` − 1 ngày, gói linh hoạt cắt ở cuối năm tài chính; `null` với nội bộ không phí, tài khoản dịch vụ, quyền khởi tạo. Tên field giữ nguyên |

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                       | Cấp test                           | Kết quả mong đợi                                       | Bằng chứng sau implement |
| ----------- | ------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ | ------------------------ |
| AC-11       | `E1` STAFF Figma cam kết kỳ 6 tháng, duyệt chi 15/06 → cấp                | integration                        | Assignment kết thúc 14/12                              | planned                  |
| AC-11       | Linh hoạt 6 tháng, duyệt chi 15/10                                        | unit `approvedEndOf` + integration | kết thúc 31/12                                         | planned                  |
| R-15        | Linh hoạt 2 tháng, trình 15/10, duyệt 20/12                               | integration                        | quyền tới 31/12; cam kết chỉ phần tới 31/12 (khớp #16) | planned                  |
| Q-03 b1     | `E3` thực tập sinh hợp đồng tới 31/08, Request 12 tháng duyệt 15/06       | integration                        | Assignment kết thúc 31/08                              | planned                  |
| Q-03 b1     | Nội bộ không phí cho nhà thầu hợp đồng tới 30/09                          | integration                        | kết thúc 30/09 (`FR-2.8`)                              | planned                  |
| Q-03 a1     | Nội bộ không phí STAFF; tài khoản dịch vụ                                 | integration                        | không có ngày kết thúc                                 | planned                  |
| Nhóm        | Dòng `E1` STAFF + dòng `E3` thực tập sinh được duyệt                      | integration                        | mỗi dòng ngày riêng                                    | planned                  |
| Biên        | Hợp đồng đã hết trước lúc cấp                                             | integration                        | 409 `ACCESS_END_PASSED`, không Assignment              | planned                  |
| Hồ sơ       | Tạo INTERN thiếu ngày; STAFF có ngày; ngày trước ngày vào                 | http                               | 422 các mã tương ứng                                   | planned                  |
| Import      | Dòng CONTRACTOR thiếu `contract_end_date`; import lại đổi ngày            | integration import                 | lỗi dòng; khác biệt hiện cột                           | planned                  |
| L-220       | `groupRequestSubmit` có `lines[].expectedEndDate`; check có thực tập sinh | http                               | 422 `VALIDATION_ERROR`; không lý do ngày               | planned                  |
| L-220       | Nhân viên gửi nhóm đọc `accessRequestLineList`                            | http                               | dòng người khác không có chi phí/lý do                 | planned                  |
| Hồi quy     | Trưởng phòng, người giữ bước, IT Admin đọc `accessRequestLineList`        | http                               | đầy đủ như cũ                                          | planned                  |
| Nháp        | Bản nháp nhóm cũ có ngày từng dòng                                        | unit codec                         | đọc được, ngày bị bỏ                                   | planned                  |

## Definition of Done

- [ ] AC-11 (vế ngày kết thúc) có test đỏ-trước/xanh-sau; ghi rõ vế còn lại ở #16.
- [ ] Gate nhanh xanh + migration áp được + OpenAPI export.
- [ ] Spec/plan phản ánh implementation; báo FE (ô ngày trong form nhóm bỏ, trường hồ sơ mới, cột import, mã lỗi grant) và Docs (nợ `US-05-17` AC-8).
- [ ] Không tăng legacy ledger kiến trúc (`requests` → `organization` chỉ qua `public`).

## Open questions

Không có.

## Changes and acceptance

05/11/2026: bản đầu. Chưa nghiệm thu.
05/11/2026 (chỉnh 05/11 theo review main flow: F03): mức FE-tonight **A** (mục 2, 3, 5) / **B** (mục 1, 4, 6, 7); bảng contract FE;
sửa C-REVIEW R-15 (`approvedEndOf` dùng `effectiveTermOf`). Vẫn `draft`.

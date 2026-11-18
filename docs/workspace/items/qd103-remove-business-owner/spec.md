# Spec: qd103-remove-business-owner — bỏ thuộc tính Business Owner; IT Admin phụ trách là người chịu trách nhiệm duy nhất của mục danh mục và thuê bao

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`, subagent soạn W5), đợt W5 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready` (đã sửa theo audit thiết kế W5 `design-audit-w5.md`, chờ chat review duyệt). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 mục 4.4 dòng 326, `FR-1.1` dòng 409, `FR-1.10` dòng 430, `FR-1.12`(1); `QĐ-104l`(1), `QĐ-103v`(4), `QĐ-103p`, `INV-06`;
  QT v1.7 C.2 _Chính sách_), BE `712044f9`. Ledger: L3-13, L2-36. Luật R-E03. Câu tạm chọn: Q-68, Q-70
  ([QUESTIONS](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md)); theo nguồn: Q-66, Q-67, `FR-1.7` cũ bỏ, _ai tạo/đề xuất mục_ đọc từ Audit
  Trail (`FR-8.3`), ý kiến dữ liệu nhạy cảm cao là của **trưởng phòng người yêu cầu** (BRD dòng 326); Q-69 không phải câu Owner (ledger `NGOÀI-PHẠM-VI`).
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Không còn trường, bảng, endpoint, lỗi, thông báo hay câu hỏi nào về **Business Owner**. Mỗi mục danh mục (kể cả phần mềm nội bộ) có **một IT Admin
phụ trách** — gán khi khai báo, bắt buộc với ghi mới — như thuê bao dùng chung (W1). Dữ liệu cũ được điền người phụ trách theo thứ tự có căn cứ; mục còn
thiếu hiện cảnh báo và được đếm ở `ops:inspect`, không chặn luồng `MF-1`. Đăng ký phần mềm nội bộ từ Request (`SBF-15`) chọn IT Admin phụ trách; ngừng
dùng không cần xác nhận của Business Owner; hồ sơ nghỉ việc/điều chuyển đếm _mục IT Admin phụ trách_ (chỉ dữ liệu — luồng `SBF-16` không đổi).

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W5).
- Mode: `technical-enabler`.
- Outcome and owner: `catalog/catalog-entry` (trường, view, bỏ `application-owner*`), `catalog/application-retirement`, `catalog/plan-terms`, `catalog/plan`,
  `catalog/requestable-software`, `catalog/internal-software-registration`, `catalog/public`; `requests/assessment` + `requests/access-request` (SBF-15);
  `personnel/offboarding`, `personnel/transfer`; `installation/inspect`; `notifications`; seed.
- Boundaries: 2 migration (expand + backfill, contract); 5 operation **xóa**; 12 đổi. Tham chiếu `business.?owner` trên HEAD `712044f9`: `src` 75 (ngoài
  `src/generated` 13), `test` 60, `scripts` 1, `prisma/models` 4 ⟹ ~140 file ⟹ **3 phase**.
- Not larger: chuyển IT Admin phụ trách trước ngày nghỉ/chuyển, cờ _thiếu_, chặn đóng hồ sơ (`US-04-06` AC-1, AC-6, AC-7, AC-8 — `SBF-16`, ledger
  `NGOÀI-PHẠM-VI`); báo cáo cờ audit Super Admin `QĐ-103p` (W8).
- Not smaller: đổi trường ở `applications` kéo theo `requests`, `personnel` (qua `CatalogApi`) và seed — tách thì `typecheck` đỏ giữa chừng.
- Siblings: `qd103-subscription-adjustment-point` (đã xóa phần Business Owner trong `subscription-renewal/`).
- Scope map: n/a

## Primary Story/AC

| Story | AC           | Coverage | Phần còn lại thuộc                                                                    |
| ----- | ------------ | -------- | ------------------------------------------------------------------------------------- |
| —     | L3-13, L2-36 | n/a      | W7 `qd103-seed-demo-v4` (fixture IT Admin phụ trách); `SBF-16` ngoài phạm vi (ledger) |

## Supporting references

`US-04-06` AC-2, AC-3/AC-5 (qua `applicationUpdate`), AC-4; `US-11-08` AC-21 (bỏ); `US-04-14` AC-10; `US-05-20` (đăng ký nội bộ). Spec cũ chỉ đọc:
`qd96-100-catalog-api-fields` (bỏ phần Business Owner).

## Explicit out of scope

Chuyển hàng loạt IT Admin phụ trách khi người đó nghỉ (`SBF-16`); IT Admin phụ trách **phòng** (organization — khác khái niệm); xóa lịch sử Audit Trail.

## Dependencies and blockers

W1 (`subscriptions.responsible_it_admin_employee_id`, `findUsableItAdminEmployeeIds`); `qd103-subscription-adjustment-point` Checkpoint C;
`qd103-subscription-alerts-incidents` Checkpoint B (cùng sửa `notifications.types.ts`, `inbox.policy.ts`, seed — giao **tuần tự**, không song song).

## Ownership: module, data, API

- Migration `<ts>_application_responsible_it_admin` (expand): `applications` thêm `responsible_it_admin_employee_id uuid NULL` FK `employees` + index; backfill
  theo thứ tự (Q-68, DA5-37): (1) IT Admin phụ trách của thuê bao `ACTIVE` mới nhất của các gói của ứng dụng; (2) Business Owner cũ nếu đang là IT Admin dùng
  được ở ngày migration (nhân viên còn làm, vai `IT_ADMIN` còn hiệu lực, không đang bàn giao); (3) NULL. `business_owner_employee_id` `DROP NOT NULL`
  (`prisma/models/catalog.prisma:136`); `application_retirement_confirmations.business_owner_employee_id` `DROP NOT NULL`.
- Migration `<ts+1>_remove_business_owner` (contract, Phase 3): DROP `application_business_owners`, `plan_term_opinions` (Q-66 theo nguồn),
  `applications.business_owner_employee_id`, `application_retirement_confirmations.business_owner_employee_id` (bảng giữ làm lịch sử — Q-67 theo nguồn),
  `access_request_assessments.proposed_business_owner_employee_id` (`prisma/models/requests.prisma:488,515`); bỏ quan hệ ở `organization.prisma:268`.
  **Không hoàn tác (DB-05)**: DROP bảng/cột có dữ liệu — sao lưu trước `migrate deploy`.
- `catalog`: `catalog-entry/{application.dto.ts, application.service.ts, application.policy.ts, application-view.service.ts, application-write-guards.service.ts,
application.repo.ts, application.types.ts, application.errors.ts, application.http-errors.ts, applications.controller.ts, application-facts.service.ts,
application-list.service.ts, application-state.policy.ts}`; xóa `application-owner.service.ts`, `application-owners.controller.ts`; `application-retirement/*`;
  `plan-terms/*`; `plan/{plan.repo.ts, plan-facts.service.ts, plan.types.ts}`; `requestable-software/{requestable-software.dto.ts, requestable-software.repo.ts}`;
  `internal-software-registration/internal-software-registration.service.ts:29-51`; `public/catalog.api.ts:69-75,121-134` (`getApplicationsOwnedBy` →
  `getResponsibleItemsOf(employeeId, limit)`; `getPlanBusinessOwnerId` → `getPlanResponsibleItAdminId`), `public/subscription-period.api.ts`
  (`getRenewalAlertRecipient`); `catalog/README.md`.
- `requests`: `assessment/{assessment.dto.ts, assessment-patch.service.ts, assessment-view.service.ts, assessment.errors.ts, assessment.http-errors.ts,
assessment.policy.ts, catalog-link.service.ts, internal-registration.service.ts}`, `access-request/{assessment-read.repo.ts, assessment-record.types.ts}`,
  `proposal-review/proposals.controller.ts:250-315`.
- `personnel`: `offboarding/{offboarding.dto.ts, offboarding.mapper.ts, detail/offboarding-detail.service.ts}`, `transfer/{transfer.dto.ts, transfer.service.ts,
transfer.types.ts, transfers.controller.ts}` (chỉ sửa file có sẵn — `offboarding/` đủ 25).
- `installation/inspect/inspection-facts.policy.ts` + `CatalogApi.countApplicationsWithoutResponsible()` (không đọc bảng catalog): `ops:inspect` đếm ứng dụng
  thiếu IT Admin phụ trách dùng được.
- `notifications`: xóa `SUBSCRIPTION_BUSINESS_OWNER_LEFT`. Seed: `demo-fixture.types.ts:48`, `shared-demo-v3/catalog.ts:10,29,49,67`, `catalog.steps.ts:11,57,67`.
- **Operation xóa**: `businessOwnerWarningList`, `applicationBusinessOwnerHistory`, `applicationRetirementConfirm`, `planTermOpinionList`, `planTermOpinionRecord`.
  **Đổi**: `applicationCreate`, `applicationUpdate`, `applicationGet`, `applicationList`, `applicationRetirementGet`, `applicationRetire`,
  `accessRequestInternalRegister`, `accessRequestAssessmentGet`/`Save`, `accessRequestCatalogLink`, `offboardingCaseGet`, `departmentTransferRecord`,
  `requestablePlanList`/`Get`.

## Behavior and design

1. **IT Admin phụ trách của ứng dụng** (R-E03, `FR-1.1`): `applicationCreate` bắt buộc `responsibleItAdminEmployeeId` (thiếu ⟹ 422 `APPLICATION.RESPONSIBLE_REQUIRED`);
   không giữ `IT_ADMIN` dùng được, đã nghỉ, đang bàn giao ⟹ 422 `APPLICATION.RESPONSIBLE_NOT_IT_ADMIN` (US-04-06 AC-5, cùng hàm kiểm W1). `applicationUpdate` đổi
   người: cùng kiểm, audit trước/sau `APPLICATION.RESPONSIBLE_CHANGED` (AC-3). Khóa `applications` `FOR UPDATE` rồi nhân viên `FOR SHARE`
   (`application-retirement.service.ts:88-93`).
2. **Dữ liệu cũ** (Q-68): ứng dụng NULL sau backfill (gồm phần mềm nội bộ không thuê bao, ứng dụng chỉ có `K4`) ⟹ đọc được, `warnings: [{ code:
'RESPONSIBLE_MISSING' }]`, PATCH trường khác được; `ops:inspect` in số ứng dụng thiếu. Không bao giờ trả trường Business Owner.
3. **Ngừng dùng** (Q-67 theo nguồn `FR-1.1`): `applicationRetire` chỉ kiểm điều kiện chặn (Assignment còn, thuê bao chưa hủy/hết hạn) — bỏ bước xác nhận;
   `applicationRetirementGet` trả điều kiện chặn. Thuê bao `CLOSED` không chặn — làm ở `qd103-subscription-close-kpi4-savings` (trạng thái chưa có ở đây).
4. **Phần mềm nội bộ** (L2-36, `US-05-20`): `accessRequestInternalRegister` nhận `responsibleItAdminEmployeeId` (kiểm mục 1); cờ audit `QĐ-103p` không đổi;
   `proposedBusinessOwnerEmployeeId` bỏ (gửi ⟹ 400). Ý kiến khi dữ liệu nhạy cảm cao giữ hình dạng, mô tả đổi thành _ý kiến trưởng phòng của người yêu cầu_.
5. **Liên kết Request với gói** (Q-70 tạm chọn): `accessRequestCatalogLink` **không** chặn khi ứng dụng thiếu IT Admin phụ trách dùng được (NULL hoặc đã nghỉ):
   200 kèm `warnings: [{ code: 'RESPONSIBLE_IT_ADMIN_MISSING' }]`, audit ghi `responsibleItAdminEmployeeId` (có thể null); mã `BUSINESS_OWNER_REQUIRED` bỏ.
6. **Nhân sự** (không đổi luồng `SBF-16`): `offboardingCaseGet.responsibleItems` = số ứng dụng + thuê bao sống người rời phụ trách (`getResponsibleItemsOf`);
   `departmentTransferRecord` cảnh báo `RESPONSIBLE_IT_ADMIN_TRANSFER` (danh sách, tổng) — chỉ cảnh báo, không chặn (US-04-06 AC-1, AC-6 còn lại ở `SBF-16`).
7. **Gỡ**: ý kiến điều khoản (Q-66 — `FR-1.10` không có ý kiến; ngày rà soát, checklist giữ), lịch sử Business Owner, cảnh báo thay Business Owner,
   `SUBSCRIPTION_BUSINESS_OWNER_LEFT`, `APPLICATION.BUSINESS_OWNER_INVALID`, `ACCESS_REQUEST.BUSINESS_OWNER_REQUIRED`. Sau contract `grep -rniE "business.?owner" src
test scripts prisma/models` chỉ còn migration cũ.
8. **Seed**: fixture ứng dụng mang `responsibleItAdmin` (mã nhân viên IT của seed); idempotent so trường mới.

## Test matrix

| AC / rủi ro     | Tình huống (gồm từ chối, edge case)                                                                                                                     | Cấp test           | Kết quả mong đợi                                                                  | Bằng chứng |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------- | ---------- |
| R-E03 tạo       | IT Admin hợp lệ; thiếu; Employee `E3`; IT Admin đã nghỉ; đang bàn giao                                                                                  | http               | 201 / 422 `RESPONSIBLE_REQUIRED` / 422 `RESPONSIBLE_NOT_IT_ADMIN` ×3              |            |
| AC-3 / AC-5     | `applicationUpdate` `A2` → `A1`; → `A2`; → `E3`                                                                                                         | http + integration | 200 + audit / 200 không audit đổi / 422, giữ `A2`                                 |            |
| AC-2            | `applicationGet` khi người phụ trách sắp nghỉ                                                                                                           | http               | trả `A2`, không trường Business Owner                                             |            |
| Q-68 / DA5-37   | backfill: 2 thuê bao `ACTIVE` khác người; không thuê bao, Business Owner cũ là IT Admin dùng được; phần mềm nội bộ Business Owner là Employee; chỉ `K4` | integration        | người của thuê bao mới nhất / Business Owner cũ / NULL + `RESPONSIBLE_MISSING` ×2 |            |
| `ops:inspect`   | DB có 2 ứng dụng NULL                                                                                                                                   | integration        | báo 2 ứng dụng thiếu IT Admin phụ trách                                           |            |
| Q-67 ngừng dùng | không xác nhận khi không còn chặn; còn Assignment                                                                                                       | http + integration | 200 / 409 như cũ                                                                  |            |
| xóa operation   | 5 route Business Owner / ý kiến điều khoản                                                                                                              | http               | 404                                                                               |            |
| L2-36           | `accessRequestInternalRegister` IT Admin hợp lệ; Employee; gửi `businessOwnerEmployeeId`                                                                | http               | 201 / 422 / 400                                                                   |            |
| `QĐ-103p`       | trưởng phòng được cấp thẳng phần mềm nội bộ                                                                                                             | integration        | cờ audit như cũ, không ai được báo với tư cách Business Owner                     |            |
| assessment      | `Save` gửi `proposedBusinessOwnerEmployeeId`; `Get`                                                                                                     | http               | 400 / không trường                                                                |            |
| Q-70            | catalog link: IT Admin phụ trách dùng được; đã nghỉ; NULL (phần mềm nội bộ)                                                                             | integration        | 200 / 200 + `RESPONSIBLE_IT_ADMIN_MISSING` ×2, audit                              |            |
| nghỉ việc       | `A2` phụ trách 1 ứng dụng + 1 thuê bao: `offboardingCaseGet`                                                                                            | integration        | `responsibleItems` 2; bàn giao không bị chặn                                      |            |
| điều chuyển     | `departmentTransferRecord` cho `A2`; người không phụ trách gì                                                                                           | integration        | `RESPONSIBLE_IT_ADMIN_TRANSFER` / không cảnh báo                                  |            |
| L3-18 vế BO     | inbox policy                                                                                                                                            | unit               | không còn `SUBSCRIPTION_BUSINESS_OWNER_LEFT`                                      |            |
| migration       | expand trên DB có Business Owner; contract; DB sạch                                                                                                     | integration        | cột + backfill; bảng/cột mất; `migrate diff` không drift                          |            |
| seed            | `ops:seed` DB sạch, chạy lại                                                                                                                            | integration        | ứng dụng có IT Admin phụ trách; không trùng                                       |            |
| hồi quy         | test catalog/requests/personnel đổi kỳ vọng (lý do ở plan); flow `MF-1`, `MF-2`, `MF-3`                                                                 | integration/flows  | xanh                                                                              |            |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI 5 xóa, 12 đổi (lỗi mới có ví dụ); manifest test; README `catalog`, `requests`, `personnel`, `notifications`, `installation`; grep
      mục 7 rỗng.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `migrate diff` DB sạch; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W5 (subagent soạn). Chưa qua cổng thiết kế. Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W5 (`design-audit-w5.md`): DA5-34, 37, 38, 39, 40 sửa; Q-66/Q-67 theo nguồn, Q-69 thành ledger, Q-70 tạm chọn đổi sang
  _cảnh báo, không chặn_. Không finding nào bị bác. Chi tiết ở plan _Design review_. Chưa nghiệm thu.

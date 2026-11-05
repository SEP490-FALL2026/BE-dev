# Field theo vai — MF-2 · MF-3 · MF-5 và API dùng chung (05/11/2026)

Bước 2 của Owner: rà **input và output của mọi API** mà MF-2 (nghỉ việc), MF-3 (điều chuyển), MF-5 (usage → thu hồi → điều chỉnh
thuê bao) gọi, theo vai. Chỉ đọc source và viết báo cáo; **không sửa spec, source hay test**.

- **Skill đã đọc/dùng:** `agent-skills:spec-driven-development` (process: so bảng contract hiện tại với spec), `agent-skills:api-and-interface-design`
  (tách input/output, field do BE tính, 422 với field đã bỏ), `agent-skills:code-review-and-quality` (đọc DTO → controller → service/policy, mức
  nghiêm trọng), `superpowers:verification-before-completion` (mỗi kết luận có `file:dòng`, ghi rõ giới hạn).
- **Nguồn:** BE HEAD `808318a4` (`git status` sạch ở `src/`, `prisma/`); review Docs `main-flows-api-contract-review-2026-11-05/{README,CURRENT-API-INPUTS}.md`;
  `Quy trình và chính sách theo main flow.md` (MF-2 :342–507, MF-3 :509–663, MF-5 :840–1018); sổ QĐ (`QĐ-96c`, `QĐ-96j`, `QĐ-100q/x/z`,
  `QĐ-94f`, `QĐ-87a/b`, `QĐ-48a–c`, `QĐ-77i/j`, `QĐ-43a`, `QĐ-86c`, `QĐ-90b`, `QĐ-96f/g/i`, `QĐ-100o/ad`, `QĐ-101i`); QUESTIONS mục D;
  `api-fields/V3-CATALOG-API.md`, `V4-PEOPLE-API.md` (pin `3e4553b9` — đã kiểm lại từng dòng trích ở `808318a4`, số dòng không lệch ở
  các file personnel/licensing/catalog đã trích).
- **Spec đọc lúc 14:05–14:15** (đang được agent khác sửa): `departure-block-now-mode` (14:09), `departure-day-access-block` (14:09),
  `personnel-grounds-and-reasons` (14:09), `revocation-deadline-and-withdraw` (14:09), `people-read-scope` (14:08), `licensing-api-fields`
  (14:11), `catalog-api-fields` (14:11), `subscription-quantity-guard` (14:10), `subscription-owner-confirmation` (14:09),
  `transfer-review-defaults` (14:07), `transfer-replacement-request` (14:08), `approved-end-date` (14:06), `account-org-api-fields` (11:25).
- **Giới hạn:** static review; không gọi API, không chạy test/DB, không xem FE runtime.

## 0. Quy ước

- Đường dẫn bằng chứng tính từ `src/modules/`. Tất cả route có tiền tố `/api/v1`.
- Verdict: `KEEP-in` (người dùng thật sự cung cấp) · `KEEP-tech` (kỹ thuật: id, bộ lọc, khóa lạc quan, xác nhận có chủ ý) · `DROP-derive`
  (BE suy/tính được) · `DROP-obsolete` (luật cũ đã bỏ) · `WRONG-ROLE` · `WRONG-STEP` · `RESHAPE` (giữ ý nghĩa, đổi hình/bắt buộc/tên) ·
  `ADD` (thiếu field mà luật cần — không tính là field hiện có).
- **Áp chung, không lặp lại từng bảng:** `path.id` / `path.assignmentId` / `path.employeeId` = `KEEP-tech` (định danh tài nguyên do FE lấy từ
  response); `query.page`, `query.pageSize` = `KEEP-tech`; header `Authorization: Bearer` = `KEEP-tech` (BE lấy người gọi, vai, phòng từ token —
  không field nào trong body được chứa id người thao tác). Route GET không có query nghiệp vụ chỉ liệt kê ở mục 7 (đếm).

## 1. MF-2 · 2.1 / MF-3 · 3.1 — `BM-09` (`personnel-notices`)

| Op · field | Ai biết / cung cấp (vai · bước) | BE suy/tính/kiểm thay? | Verdict | Bằng chứng | Căn cứ |
| --- | --- | --- | --- | --- | --- |
| `POST /personnel-notices` (MANAGER `notice.controller.ts:69`) · `employeeId` | TL hiện tại (chuyển đi, nghỉ, nghỉ đột ngột, nghỉ dài) | policy kiểm thành viên phòng `notice.policy.ts:51-63` | `KEEP-in`; **`RESHAPE`** với `DEPARTMENT_TRANSFER_IN` → `employeeCode` (TL nhận không đọc được người ngoài phòng) | `notice/notice.dto.ts:29` | `QĐ-76d`(1), Q-10(2) |
| · `kind` | TL | bỏ `JOB_TITLE_CHANGE` khỏi tập gửi được | `KEEP-in` | `notice.dto.ts:31` | `QĐ-76a`, `QĐ-87e` |
| · `proposedOn` | TL (ngày dự kiến theo giấy tờ biết) | chỉ lưu; ngày chính thức do SA nhập lúc ghi | `KEEP-in` | `:32` | `QĐ-76a`, `QĐ-76b` |
| · `targetDepartmentId` | TL chuyển đi (tùy chọn); chuyển đến = phòng người gửi | policy bắt = phòng người gửi với `_IN` | `KEEP-in` (`_OUT`) / `DROP-derive` (`_IN`) | `:33` | `QĐ-76d`(1), Q-10(2) |
| · `note` | TL — chỉ *giấy tờ người gửi biết* | lưu chữ tự do ≤ 500 | `RESHAPE` (đổi mô tả, FE cảnh báo không ghi lý do/sức khỏe); IT không đọc | `:34` | S-12, `QĐ-76e`, `BM-09` |
| `GET /personnel-notices` · `status`,`kind`,`employeeId`,`overdue`,`priority` | SA/IT/TL lọc | phạm vi theo vai `notice-query.service.ts:96-109` | `KEEP-tech` ×5 (IT: chỉ nhịp chặn ngay — #25) | `:61-69` | `QĐ-87b`(4) |
| `POST …/{id}/rejection` · `reason` | SA | `min(1)` ở DTO | `KEEP-in` | `:53` | `QĐ-76b` |
| `POST …/{id}/recording` (SA) · `verification.method`,`.reference` | SA | lưu, chỉ SA đọc | `KEEP-in` ×2 | `:22-25` | `QĐ-87b`(2) |
| · `grounds.type/.reference/.issuer/.issuedOn` | SA từ văn bản ngoài hệ thống | DTO `nullish`, policy mới bắt (`personnel-grounds.policy.ts:34-43`) | `RESHAPE` ×4 (bắt buộc ở DTO, `type` enum 3 loại, `issuedOn` kiểu ngày) | `:15-20` | `QĐ-87b`(1), `QĐ-77a`, `QĐ-93f`(2) |
| · `event.toDepartmentId` | SA (mặc định từ thông báo) | listener lấy mặc định | `KEEP-in` (tùy chọn) | `:44` | QT 3.1 |
| · `event.effectiveOn`,`event.lastWorkingDay` | SA (ngày chính thức theo căn cứ) | recorder theo loại | `KEEP-in` ×2 | `:45-46` | `QĐ-76b` |
| · `event.startedOn`,`event.approvedReturnOn` | SA (nghỉ dài — ngoài MF-2/3) | — | `KEEP-in` ×2 | `:49-50` | `QĐ-80` |
| · `event.successor.kind/.employeeId` | SA khi người rời là TL | `HEAD_SUCCESSOR_REQUIRED` | `KEEP-in` | `:47` | `QĐ-40a`, `QĐ-48b` |
| · `event.pendingTransferCancellation.reason` | lý do luôn là *nghỉ trước ngày hiệu lực* | BE ghi được lý do chuẩn | `RESHAPE` → `cancelPendingTransfer: true` | `:48`; dùng ở `offboarding/offboarding-notice.listener.ts:51` | `QĐ-77j` |
| · *(thiếu)* `event.accessBlockMode` | SA chọn nhịp | hiện **suy từ loại thông báo** | `ADD` (sai luật hiện tại) | `offboarding-notice.listener.ts:48` | `QĐ-96c` |
| `POST …/{id}/linking` · `eventId` | SA (sự kiện đã ghi trực tiếp) | `findLinkable` cùng nhân viên | `KEEP-in` | `:59` | `FR-2.14`(2) |
| · `verification.*` | SA | như trên | `KEEP-in` ×2 | `:59` | `QĐ-77b` |
| `POST …/{id}/withdrawal` (MANAGER) | — không body | — | — | `notice.controller.ts:176` | — |

## 2. MF-2 · 2.2–2.10 — `offboarding-cases` (+ đóng Request, khóa tài khoản)

| Op · field | Ai biết / cung cấp | BE suy/tính/kiểm thay? | Verdict | Bằng chứng | Căn cứ |
| --- | --- | --- | --- | --- | --- |
| `POST /offboarding-cases` (SA `offboarding.controller.ts:95`) · `employeeId` | SA | `EMPLOYEE_LEFT`, `ALREADY_HANDING_OVER` | `KEEP-in` | `offboarding/offboarding.dto.ts:29` | `FR-2.12` |
| · `lastWorkingDay` | SA theo căn cứ | DTO optional, policy bắt; nhịp đột ngột cấm ngày tương lai `offboarding.policy.ts:66-67` | `RESHAPE` (bắt buộc; `BLOCK_NOW` nhận ngày tương lai) | `:31` | `QĐ-96c`, Q-04 B |
| · `abrupt` | SA chọn **nhịp** | hiện = *đã rời ngay*, ghi `LEFT` hôm nay `offboarding-case-writer.service.ts:82-84` | `RESHAPE` → `accessBlockMode` bắt buộc (`abrupt` ⟹ 422) | `:32` | `QĐ-96c`, Q-04 B |
| · `grounds.*` (4) | SA | DTO `nullish`, policy bắt | `RESHAPE` ×4 | `:14-19,33` | `QĐ-87b`(1), `QĐ-96c` (căn cứ của lựa chọn) |
| · `successor.kind/.employeeId` | SA khi người rời là TL; ngày hiệu lực BE tính = ngày sau ngày cuối | gửi cho người không là TL ⟹ **bỏ qua lặng lẽ** (`personnel/transfer/transfer-guard.service.ts:71`) | `KEEP-in` (+422 khi thừa — #26, B) | `:21-24,34` | `QĐ-40a`, `QĐ-48b`, QT 2.5 |
| · `pendingTransferCancellation.reason` | lý do cố định | BE tự viết được | `RESHAPE` → `cancelPendingTransfer: true` (`KEEP-tech`: xác nhận có chủ ý) | `:35`; `offboarding-endings.service.ts:66` | `QĐ-77j` |
| · *(không có)* lý do nghỉ | — | không thu | đúng (S-09); câu QT 2.2 *"lý do nghỉ"* còn cũ | — | S-09, `QĐ-96c` |
| `POST …/{id}/last-day-changes` (SA) · `lastWorkingDay` | SA | `plannedDayRefusal`, `LAST_DAY_ALREADY_PASSED` | `KEEP-in` | `:39`; `offboarding.policy.ts:152-163` | `QĐ-48a` |
| · `reason` | SA | DTO optional, controller ép `?? ''` rồi policy `REASON_REQUIRED` | `RESHAPE` (bắt buộc ở DTO) | `:40`; `offboarding.controller.ts:246` | `QĐ-48c` |
| · `successor` | SA (thay người kế nhiệm khi dời) | chỉ định chưa hiệu lực tự dời | `KEEP-in` | `:41` | `QĐ-48b` |
| · *(thiếu)* `grounds` | SA | không nhận, không kiểm | `ADD` | `:38-42` | `QĐ-48c`, S-10 |
| `POST …/{id}/cancellation` (SA) · `reason` | SA | như trên `offboarding.controller.ts:283` | `RESHAPE` | `:44` | `QĐ-48c` |
| · *(thiếu)* `grounds` | SA | — | `ADD` | `:44` | `QĐ-48c`, S-10 |
| `POST …/{id}/departure` (SA) · `departedOn` | không ai cần: ngày nghỉ = ngày làm việc cuối | `leftOn = departedOn ?? today` | `DROP-obsolete` | `:47`; `offboarding-left.service.ts:43` | Q-04 B, `QĐ-48a` |
| · `accountLock.note` | IT Admin (mục 1 `BM-08`) | SA ghi bằng tài khoản SA | `WRONG-ROLE` | `:48`; `offboarding-left.service.ts:47` | `QĐ-87a` (SA không làm tác vụ kỹ thuật), `QĐ-77i` |
| `POST …/{id}/account-lock` (IT `offboarding-steps.controller.ts:64`) · `note` | IT — **bằng chứng** đã khóa email/phiên ở hệ thống ngoài (Google/MS); BE không khóa gì ở đó | BE ghi người + thời điểm (`offboarding-left.service.ts:106-107`); không cần `lockedAt` riêng (thời điểm ghi đủ cho *ghi người và thời điểm*) | `KEEP-in`; **cổng `CASE_NOT_LEFT` là `WRONG-STEP`** (phải mở khi đã bị chặn) | `:26`; `offboarding.policy.ts:190-191` | `QĐ-77i`, `QĐ-96j`(1), S-11 |
| `POST …/{id}/revocations` (IT `:99`) · `assignmentIds` | IT (thứ tự `BM-08`; gói mất dữ liệu chờ ≤ 1 ngày LV ở chặn ngay) | vắng = mọi quyền thu hồi được | `KEEP-in` (tùy chọn) | `:52`; `offboarding.policy.ts:249-255` | `QĐ-77i`, `QĐ-62e` |
| · `count` | không ai — chỉ là số client đếm | BE tính `selected.length`, lệch ⟹ `COUNT_MISMATCH` | `DROP-derive` | `:53`; `offboarding.policy.ts:256` | V4 NV-05 |
| · `reason` | IT không quyết lý do — nguồn là nghỉ việc | `sourceOf` `offboarding-revocation.service.ts:128-130`; bắt rỗng `offboarding.policy.ts:246`; controller `?? ''` `offboarding-steps.controller.ts:127` | `DROP-derive` (còn `note` tùy chọn) | `:54` | `QĐ-98g` (nơi gọi truyền lý do) |
| · `accountLock.note` | IT | khóa + mở thu hồi một transaction `offboarding-revocation.service.ts:65` | `KEEP-in` | `:55` | `QĐ-77i` (*trước hoặc đồng thời*) |
| · *(cổng)* `CASE_NOT_LEFT`; *(nội bộ)* hạn | — | `revocationSelection` đòi `LEFT` `offboarding.policy.ts:244`; `openRevocation` không truyền hạn (`offboarding-revocation.service.ts:140-150`, `licensing/public/licensing.types.ts:275-279` `dueOn` không ai đọc) | `WRONG-STEP` (cổng); hạn = BE tính | — | `QĐ-96j`(1), `QĐ-94j`, F16 |
| `POST …/{id}/closure` (IT `:137`) | không body; QT 2.10 ghi *Hệ thống* đóng | cổng thật `closeRefusal` | — (ghi nhận: nút tay chấp nhận được) | `offboarding.policy.ts:288-294` | QT 2.10 |
| `GET /offboarding-cases` · `employeeId`,`state`,`pastLastDay`,`accountLockMissing`,`roleFlag` | SA/IT lọc | IT giới hạn phòng phụ trách `offboarding-view.service.ts:151` | `KEEP-tech` ×5 | `offboarding.dto.ts:63-70` | `QĐ-87b`(4) |
| `POST /access-requests/{id}/cancellation` (IT `requests/cancellation/cancellation.controller.ts:30`) · `cause` | IT | BE kiểm lại người thụ hưởng đã nghỉ/đã chuyển `cancellation.policy.ts:67-68` | `KEEP-tech` (bộ chọn luật bằng chứng; BE kiểm lại) | `requests/cancellation/cancellation.dto.ts:33` | `QĐ-90b`, QT 2.3 |
| · `note` | IT; bắt buộc khi `BENEFICIARY_TRANSFERRED` | refine `:22-29` | `KEEP-in` | `:17` | `QĐ-90b` (*kèm lý do*) |
| · `evidence` | IT (đã thu lời mời/đối chiếu nhà cung cấp) | `EVIDENCE_REQUIRED` khi tác vụ cấp đang chạy | `KEEP-in` | `:18` | `QĐ-90b` |
| `POST /access-requests/{id}/lines/{employeeId}/departure-closure` (IT `requests/line-closure/group-line-closure.controller.ts:27`) · `cause`,`note`,`evidence` | như trên, cho một dòng nhóm | `group-line-closure.policy.ts:26-69` | `KEEP-tech`, `KEEP-in`, `KEEP-in` | inventory dòng 1722 | `QĐ-90b`, QT 2.3/3.4 |
| `POST /app-users/{id}/lock`, `/unlock` (SA) · `reason` | SA (khoanh vùng trước căn cứ; mở khóa sau hủy bàn giao) | `trim().min(1)` | `KEEP-in` ×2 | `identity-access/accounts/account-management.dto.ts:24` | `QĐ-81a`, QT 2.1, `QĐ-100q` |

## 3. MF-3 — `department-transfers`, `transfer-reviews`

| Op · field | Ai biết / cung cấp | BE suy/tính/kiểm thay? | Verdict | Bằng chứng | Căn cứ |
| --- | --- | --- | --- | --- | --- |
| `POST /department-transfers` (SA `transfers.controller.ts:86`) · `employeeId` | SA | `transfer.policy.ts:106-128` | `KEEP-in` | `personnel/transfer/transfer.dto.ts:24` | `FR-2.2` |
| · `toDepartmentId` | SA | `NO_CHANGE`, phòng hoạt động | `KEEP-in` | `:25` | QT 3.1 |
| · `effectiveOn` | SA (không trước hôm nay) | `EFFECTIVE_DATE_IN_PAST` | `KEEP-in` | `:26` | `QĐ-66e`, QT 3.1 |
| · `grounds.*` (4) | SA | DTO `nullish` | `RESHAPE` ×4 | `:10-15,27` | `QĐ-87b`(1) |
| · `successor.*` | SA khi người chuyển là TL phòng cũ | bỏ qua lặng lẽ khi thừa | `KEEP-in` (+422 thừa — B) | `:17-20,28` | `QĐ-94f`(5), QT 3.3 |
| `POST …/{id}/rescheduling` · `newEffectiveOn` | SA (trước ngày hiệu lực) | `transfer.policy.ts:149-161` | `KEEP-in` | `:32` | `QĐ-77j` |
| · `reason` | SA | DTO optional, `?? ''` `transfers.controller.ts:238` | `RESHAPE` | `:33` | `QĐ-77j` |
| · `grounds.*` (4) | SA | — | `RESHAPE` ×4 | `:34` | `QĐ-77j` |
| · `successor.*` | SA | — | `KEEP-in` | `:35` | `QĐ-77j` |
| `POST …/{id}/cancellation` · `reason` | SA | `?? ''` `transfers.controller.ts:275` | `RESHAPE` | `:39` | `QĐ-77j` |
| · `grounds.*` (4) | SA | — | `RESHAPE` ×4 | `:40` | `QĐ-77j` |
| `POST …/{id}/closure` (IT `:284`) | không body; QT 3.10 ghi *Hệ thống* | — | — | — | QT 3.10 |
| `GET /department-transfers` · `employeeId`,`status`,`effectiveFrom`,`effectiveTo` | SA/IT lọc | IT theo phòng phụ trách `transfer-query.service.ts:95-103` | `KEEP-tech` ×4 | `:43-50` | `QĐ-87b`(4) |
| `GET /transfer-reviews` · `status`,`overdue`,`departmentId`,`employeeId` | TL/IT lọc | TL = phòng đang làm TL; **IT = mọi phòng** | `KEEP-tech` ×4 | `transfer-review/transfer-review.dto.ts:12-19`; `transfer-review-view.service.ts:161` | — |
| `POST /transfer-reviews/{id}/decisions` (TL mới, `mayDecide` `transfer-review.policy.ts:47-49`) · `assignmentId` | TL mới (dòng của rà soát) | `findItem` | `KEEP-in` | `transfer-review.dto.ts:28` | `FR-2.16`(2) |
| · `decision` | TL mới: còn cần / không cần; trả phí hay nội bộ BE suy từ kiểu cấp (K5 = T3) | `NEEDS_NEW_TOOL` không giữ/không thu hồi/không tạo Request | `RESHAPE` (chỉ `STILL_NEEDED\|NOT_NEEDED`) | `:29` | S-13, QT 3.6, `QĐ-94f` |
| · `newToolNote` | không thuộc rà soát (công cụ mới đi MF-1) | chỉ đi với `NEEDS_NEW_TOOL` `transfer-review.policy.ts:53-57` | `DROP-obsolete` | `:30` | S-13, `FR-2.16`(2) |
| · *(thiếu)* `reason` | TL mới | — | `ADD` (bắt buộc, cả hai lựa chọn) | `:26-31` | QT 3.6 (*ghi người, thời điểm, lý do*) |
| · *(thiếu, B)* `termMonths` | TL mới, chỉ quyền trả phí *còn cần* | bỏ trống = 12 | `ADD` (tùy chọn) | — | Q-T1, `QĐ-94f` |
| · *(thời điểm)* `NOT_NEEDED` mở thu hồi **ngay** | — | `transfer-review-decision.service.ts:75` không có mốc *sau chồng lấn* | `WRONG-STEP` (BE phải đặt `notBefore` = hết chồng lấn) | — | `QĐ-94f`(3), QT 3.9 |

## 4. Tổ chức (MF-2 · 2.5 / MF-3 · 3.3) — `departments/{id}/head-*`, `successor-*` (SA, `department-heads.controller.ts:88,111,134,168`)

| Op · field | Ai biết / cung cấp | BE suy/tính/kiểm thay? | Verdict | Bằng chứng | Căn cứ |
| --- | --- | --- | --- | --- | --- |
| `head-assignments` · `employeeId`,`effectiveFrom` | SA | ≥ hôm nay, thành viên giữ `MANAGER` `department-head.service.ts:82-87` | `KEEP-in` ×2 | `organization/department-management/department.dto.ts:54-57` | `QĐ-87a`, `QĐ-66a` |
| `head-vacancies` · `effectiveFrom` | SA | ≥ hôm nay `:142` | `KEEP-in` | `:58` | `QĐ-51` |
| `successor-designations` · `employeeId`,`effectiveFrom` | SA (đường rời của MF-2 dùng `offboarding.successor`, ngày BE tính) | từ ngày sau hôm nay | `KEEP-in` ×2 | `:60-63` | `QĐ-83c`, `QĐ-87`(D-5) |
| `successor-clearances` | body `{}` strict | — | — | `:64` | — |

## 5. Licensing dùng chung (MF-2/3/5 · SBF-16/17/18)

| Op · field | Ai biết / cung cấp | BE suy/tính/kiểm thay? | Verdict | Bằng chứng | Căn cứ |
| --- | --- | --- | --- | --- | --- |
| `GET /license-assignments` (IT) · `subscriptionId`,`planId`,`employeeId`,`source`,`kind` | IT lọc | — | `KEEP-tech` ×5 | `licensing/assignment/assignment.dto.ts:22-29` | — |
| `POST /license-assignments/{id}/responsible-changes` (IT `assignments.controller.ts:86`) · `employeeId` | IT chọn người **phòng sở hữu** | `OUTSIDE_OWNING_DEPARTMENT`, đang làm, không đang bàn giao | `KEEP-in` | `assignment.dto.ts:13`; `assignment.policy.ts:126-132` | `QĐ-43a`, `QĐ-86c` |
| · `effectiveFrom` | IT (≤ hạn của hồ sơ nghỉ/chuyển) | sau ngày bắt đầu, không quá khứ, ≤ deadline `:119-123` | `KEEP-in` | `:14` | `QĐ-43a` |
| · `expectedEndDate` | phần lớn **BE biết**: dòng cũ (tài khoản dịch vụ không hạn) + ngày hết hợp đồng của người mới | hiện nhận ngày bất kỳ ≥ `effectiveFrom`, bắt buộc với nhân sự có thời hạn `:137-141` | `RESHAPE` → BE mặc định `earliest(dòng cũ, contractEndDate người mới)`; client chỉ được rút ngắn | `:15` | Q-03 a1/b1/d1, `INV-07` |
| `GET /service-account-duties` (IT) · `employeeId`,`overdue` | IT lọc | — | `KEEP-tech` ×2 | inventory dòng 620 | `QĐ-86c` |
| `GET /handover-duties` (mọi vai) · `scope`,`status`,`employeeId`,`overdue` | người xác nhận / IT (`scope=all` chỉ IT `handover-view.service.ts:62`) | — | `KEEP-tech` ×4 | `licensing/handover/handover.dto.ts:12-19` | `FR-2.12` |
| `POST /handover-duties/{id}/confirmations` · `value` | TL/kế nhiệm (nghỉ việc: *đã bàn giao/không cần*); TL mới, người kích hoạt, IT (ca khác: chỉ *HANDLED*) | `allowedValues` theo nguồn `handover-confirmer.policy.ts:47-49` | `RESHAPE` (tùy chọn; BE điền `HANDLED` ngoài nguồn nghỉ việc) | `handover.dto.ts:8` | `FR-2.12`, `QĐ-62f`, `QĐ-63a/b` |
| `POST /provisioning-tasks` (IT; MF-3 3.7 cấp thay thế) · `requestId` | IT | gate `check`/`claimForGrant` | `KEEP-in` | `licensing/provisioning/provisioning.dto.ts:17` | `FR-2.3` |
| · `subscriptionId` | IT chọn nguồn seat | bắt buộc K1/K2, cấm K5; phải cùng phòng (chưa chuyển seat) | `KEEP-in` | `:18` | S-19, `QĐ-99e`, `QĐ-100y` |
| · `accountIdentifier` | IT (mặc định email công việc) | kiểm tên miền công ty | `KEEP-in` (tùy chọn) | `:19` | `QĐ-43c` |
| · `expectedEndDate` | **không phải IT** — thời hạn đã duyệt | ghi đè `input.expectedEndDate ?? claimed.expectedEndDate` không trần `provisioning-grant-writer.service.ts:78` | `DROP-derive` | `:20` | Q-03 c1, `QĐ-98a`, QT 1.9 |
| · `responsibleEmployeeId` | IT (chỉ tài khoản dịch vụ) | cùng phòng sở hữu | `KEEP-in` | `:22` | `QĐ-86c` |
| · `beneficiaryEmployeeId` | IT (dòng Request nhóm) | gate theo người | `KEEP-in` | `:24` | `QĐ-82h` |
| `GET /provisioning-tasks` · `channel`,`status`,`scope` | IT lọc | — | `KEEP-tech` ×3 (thiếu lọc `kind`/`source`/quá hạn — B) | `:64-69` | — |
| `POST …/{id}/claim`,`/retry`,`/cancel` | không body | thiếu 409 `NOT_BEFORE` khi chưa tới mốc | — | `provisioning-tasks.controller.ts:159,264,368` | `QĐ-98g` |
| `POST …/{id}/complete` · `evidence` | IT | DTO `default('')`, policy bắt không rỗng `provisioning.policy.ts:147` | `RESHAPE` (bắt buộc ở DTO) | `:26` | `QĐ-90a` |
| `POST …/{id}/report-failure`,`/close-failed` · `reason` | IT | DTO `default('')`, policy bắt `:155` | `RESHAPE` ×2 | `:27,30` | `QĐ-62i` |
| `POST …/{id}/hand-off` | body `{}` bắt buộc | — | nit: cho phép không body | `:29` | `QĐ-90a` |
| `POST …/{id}/revocation-completion` · `completion` | chỉ K2 có lựa chọn thật | `completionsFor` K1 ⟹ `RENEWAL_CANCELLED`, K5 ⟹ `OFF_SYSTEM_REVOKED` `revocation.policy.ts:70-81` | `RESHAPE` (tùy chọn; BE điền K1/K5) | `:37` | SBF-18 |
| · `evidence` | IT | bắt buộc trừ `ALREADY_GONE` `revocation.policy.ts:145-146` | `KEEP-in` | `:38` | `QĐ-90a` |
| · `note` | IT | bắt buộc với `ALREADY_GONE` `:143` | `KEEP-in` | `:39` | — |
| · `paidThroughOn`,`accessState`,`accessCutOn`,`accessEvidence` | IT đọc ở nhà cung cấp (K1) | chỉ với `RENEWAL_CANCELLED` `:160-180` | `KEEP-in` ×4 | `:40-43` | `QĐ-77l`, QT 2.9 (K1 dùng tới hết kỳ) |
| `POST …/{id}/access-cut` · `accessCutOn`,`evidence` | IT | `planAccessCut` | `KEEP-in` ×2 | `:45-48` | `QĐ-77l` |
| `GET /assignment-expiry-queue` · `status`,`debt`,`departmentId` | IT lọc | — | `KEEP-tech` ×3 | inventory dòng 811 | SBF-03 |
| `POST /assignment-expiry-queue/{assignmentId}/revocation` | không body; chặn khi chờ Request tiếp tục | — | — | `licensing/expiry/expiry.controller.ts:70` | `QĐ-94c`(4), `QĐ-100b` |

## 6. MF-5 — thuê bao, seat, rà soát gia hạn

| Op · field | Ai biết / cung cấp | BE suy/tính/kiểm thay? | Verdict | Bằng chứng | Căn cứ |
| --- | --- | --- | --- | --- | --- |
| `GET /subscriptions` (IT, Finance) · `applicationId`,`planId`,`status`,`kind`,`warning` | lọc | — | `KEEP-tech` ×5 | `catalog/subscription/subscription.dto.ts:49-` | — |
| `POST /subscriptions` (IT) · `planId`,`ownerDepartmentId` | IT chỉ ở khởi tạo; sau baseline = gói/phòng của Request đã duyệt | chỉ kiểm phòng hoạt động | `KEEP-in` (khởi tạo) / `DROP-derive` từ `requestId` (sau baseline) | `:20-22` | `QĐ-89a`(1), `QĐ-89e`, Q-06 A |
| · `kind` | IT | `TERM\|PERPETUAL` | `KEEP-in` | `:23` | `QĐ-49c` |
| · `purchasedQuantity` | IT (số đã mua thực tế) | không nối Request | `KEEP-in` (trần theo Request — #23) | `:24` | `QĐ-84f`, Q-06 A |
| · `unitPrice.amount/.currency`, `billingCycle`, `startDate`, `endDate`, `renewalDate`, `autoRenew`, `allowsMidTermReduction` | IT đọc hợp đồng/trang mua | kiểm thứ tự ngày | `KEEP-in` ×8 | `:25-33` | `FR-1.3`, `QĐ-96f` |
| · `noticeDeadline`,`noticePeriodDays` | IT (một trong hai) | ND suy từ số ngày khi thiếu, gắn *chưa xác nhận* | `KEEP-in` ×2 | `:30-31` | `FR-1.4`, `QĐ-94d` |
| · *(thiếu)* `requestId` | IT (Request đã duyệt là căn cứ mua) | — | `ADD` | — | Q-06 A |
| `PATCH /subscriptions/{id}` (IT) · `purchasedQuantity` | IT | chỉ chặn dưới số đang chiếm/thiếu CC | `KEEP-in` + `basis` bắt buộc khi ACTIVE (#23) | `:37` | Q-06 A, `QĐ-84f` |
| · `unitPrice` | IT | đổi tự do trên thuê bao ACTIVE | `RESHAPE` (cần `basis` như số lượng — giá tăng là chi tăng) | `:38` | `QĐ-84f`, QT 5.9 *không chi trước khi duyệt* |
| · `allowsMidTermReduction` | IT | đổi tự do, đổi cách giải phóng cam kết | `RESHAPE` (`basis.correction` — catalog spec) | `:46` | `QĐ-96f`, `QĐ-99c` |
| · `billingCycle`,`startDate`,`endDate`,`renewalDate`,`noticeDeadline`,`noticePeriodDays`,`autoRenew` | IT | — | `KEEP-in` ×7 | `:39-45` | `FR-1.3/1.4` |
| `GET /subscriptions/{id}/seat-usage`, `GET /seat-baseline`, `POST /seat-baseline/close`, `POST /subscriptions/{id}/completions` | không body/query nghiệp vụ | seat baseline **không** là usage | — | `licensing/seat-baseline/seat-baseline.controller.ts:44,63` | F25 |
| `POST /seat-baseline-imports` · `file`,`subscriptionId` ⊕ `planId` | IT | đúng một đích | `KEEP-in` ×3 | `data-import/seat-baseline-import/seat-baseline-import.dto.ts:9-12` | `QĐ-89e` |
| · cột CSV `cost_center_code` | IT (tùy chọn) | BE tự suy CC, cột chỉ đối chiếu | `KEEP-tech` (ghi rõ *chỉ đối chiếu*) | `seat-baseline-import.types.ts:11` | `QĐ-89a`(2) |
| `POST …/{id}/confirm` · `previewVersion`,`idempotencyKey` | FE lấy từ response / sinh một lần | khóa lạc quan, chống gửi trùng | `KEEP-tech` ×2 | `:13-16` | API rule |
| `GET /subscription-renewals` (IT/Finance/Spending Approver — `subscription-renewal-parties.service.ts:21`) · `state`,`subscriptionId`,`late` | lọc | thiếu TL sở hữu | `KEEP-tech` ×3 | `licensing/subscription-renewal/subscription-renewal.dto.ts:67-72` | US-11-06 |
| `POST /subscription-renewals` (IT `subscription-renewals.controller.ts:126`) · `subscriptionId` | IT | TERM, ACTIVE, có mốc | `KEEP-in` | `:32` | `QĐ-49c` |
| · `choice` | IT (giữ/giảm/hủy; *đổi tier* chưa có) | — | `KEEP-in` (thiếu `CHANGE_TIER` — H3) | `:33` | QT 5.7, `QĐ-94d` |
| · `proposedQuantity` | IT (với giảm) | < số đã mua | `KEEP-in` | `:34` | `QĐ-94d` |
| · `note` | IT (căn cứ đề xuất) | phần *nhu cầu còn hiệu lực* phải là snapshot BE (5.6), không gõ tay | `KEEP-in` | `:35` | QT 5.6–5.7 |
| · `businessOwnerOpinion` | IT ghi ý kiến BO | — | `KEEP-in` | `:36` | US-11-06 |
| · *(chuyển từ decide)* `releasedAssignmentIds` | IT đề xuất theo thứ tự xếp sẵn | `checkRelease` theo ranking | `ADD` ở bước IT | — | `QĐ-66x`, QT 5.7 |
| `POST …/{id}/decision` · *(vai)* | **TL phòng sở hữu**; hiện Người duyệt chi | `renewalDeciderOf` `decision/renewal-decision.policy.ts:10-17` | `WRONG-ROLE` (op) | `subscription-renewals.controller.ts:165-168` | `QĐ-94c`(1), `QĐ-94d`(2), F26 |
| · `choice` | TL không chọn lại phương án | `checkChoice` | `WRONG-ROLE` → `decision: CONFIRM` (+`REQUEST_CHANGES` B) | `:40` | US-11-06 AC-5 |
| · `quantity` | thuộc đề xuất IT | — | `WRONG-ROLE` (bỏ) | `:41` | US-11-06 AC-1/4 |
| · `reason` | TL (tùy chọn khi xác nhận) | — | `KEEP-in` | `:42` | US-11-06 AC-5 |
| · `withinCurrentTerm` | không ai — luật theo loại thuê bao | `executionPointOf` từ `allowsMidTermReduction` + ngày | `DROP-derive` | `:43` | `QĐ-96f`, `QĐ-96g` |
| · `acknowledgeActiveUsers` | TL xác nhận đã thấy số người đang dùng khi *hủy* | `ACTIVE_USERS_NOT_ACKNOWLEDGED` | `KEEP-tech` | `:44` | US-11-06 AC-3 |
| · `releasedAssignmentIds` | IT đề xuất, TL chỉ xác nhận | người quyết tự chọn seat | `WRONG-STEP` (→ propose) | `:45` | `QĐ-66x`, `QĐ-94d`(6) |
| `POST …/{id}/outcome` (IT `:222`) · `outcome` | IT | `vendorFollowUpOpen` khi khác `AS_DECIDED` | `KEEP-in` | `:62` | `QĐ-62k` |
| · `note` | IT | tùy chọn với mọi kết quả | `RESHAPE` (bắt buộc khi `VENDOR_REFUSED`/`DIFFERENT`, kèm bằng chứng) | `:63` | `QĐ-96i` |
| · `nextPeriod.purchasedQuantity` | IT (số nhà cung cấp xác nhận) | không trần với kết quả khác | `KEEP-in` + trần ≤ mức đã xác nhận/đang trả; vượt ⟹ Request tăng cấp | `:49` | `QĐ-96i`, `QĐ-98l`, `QĐ-100ad` |
| · `nextPeriod.startDate` | gần như luôn = ngày sau kỳ cũ | trigger chỉ kiểm *sau kỳ cũ* | `RESHAPE` (tùy chọn, BE mặc định ngày kế tiếp) | `:52` | V3 §2.16 |
| · `nextPeriod.unitPrice.*`,`billingCycle`,`endDate`,`renewalDate`,`noticeDeadline`,`noticePeriodDays`,`autoRenew`,`allowsMidTermReduction` | IT theo kết quả thực tế | — | `KEEP-in` ×9 | `:50-58` | `FR-1.3`, QT 5.9 |
| · *(thiếu)* đã báo nhà cung cấp (ngày + bằng chứng) | IT | — | `ADD` (B, chat MF-5) | — | QT 5.8–5.9, `QĐ-94d` |
| `GET /subscription-deadline-events` (IT/Spending Approver/SA) · `kind`,`from`,`to` | lọc | thiếu TL sở hữu, Finance | `KEEP-tech` ×3 | `:73-78` | `QĐ-98f` |
| `GET …/{id}/seat-ranking` | chỉ page (spec thêm `proposedOnly`) | — | — | `:184-191` | `QĐ-66x` |

**Usage / ghost seat (MF-5 5.2–5.5):** chưa có API ở `808318a4` (F25). Không rà lại: theo `docs/reviews/g7-usage-design-2026-11-05/DESIGN.md` §0 —
F-1 (mỗi field có nguồn, nơi dùng, BE không suy được), F-2 (không nhận `organizationId`, id người thao tác, thiết bị/nhân viên của thiết bị,
mốc server, giá trị tính, timezone), F-3 (field tùy chọn ghi ca vắng), F-4 (`strictObject`), F-5 (field response có màn tiêu thụ), F-6 (ngày
theo `Organization.timeZone`). Quyết định Giữ/Thu hồi/Miễn trừ của TL và thu hồi sau ân hạn 7 ngày đi qua cổng `openRevocation` với
`timing.notBefore` của `revocation-deadline-and-withdraw`.

## 7. Response: dễ nhầm là input · lộ ngoài phạm vi vai · lỗi thời

**Output FE không được làm thành ô nhập** (BE tính): offboarding `state`, `pastLastDay`, `heldRights`, `accountLockMissing`, `handoverDueOn`,
`departureEffectiveOn`, `roleFlags`, `checklist.*`, `blockers`, `warnings.*`, `revocations.created/reasonAdded`, `changes[].count`; notice
`code`, `dueOn`, `overdue`, `priority`, `defaultItAdminEmployeeId`; transfer `status`, `effectiveAt`, `warnings`; review `dueOn`, `overdue`,
`overdueDays`, `pendingItems`, `canDecide`, `waitingReason`, `needsNewRequest`, `revocationTaskId`, `position`; task `availableDecisions`,
`inGeneralQueue`, `doneWhen`, `steps`, `terminating*`, `elapsedSeconds`; renewal `milestone`, `executionPoint`, `lateFlagged`,
`decidedAfterDeadline`, `seatsInUseAtDecision`, `releasedSeatCount`, `usage.status`, ranking `group`/`position`; assignment `validUntil`,
`expectedEndDate` (sau #20 = BE tính).

| # | Op (vai đọc) | Field | Vấn đề | Bằng chứng | Căn cứ | Spec chủ |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | `personnelNoticeList/Get` (IT) | `note`, `sender`, `rejectReason`, `defaultItAdminEmployeeId`; mọi loại thông báo của phòng phụ trách | Lộ — IT chỉ cần cảnh báo chặn ngay | `personnel/notice/notice.mapper.ts:44-49`; `notice-query.service.ts:99-105` | S-12, `QĐ-76d`(4), `BM-09` | `people-read-scope` (B) |
| R2 | `offboardingCaseList/Get` (IT) | `priorWorkState` | Lộ (từng nghỉ dài) | `offboarding.dto.ts:139` | `QĐ-87b`(4) | `people-read-scope` |
| R3 | `transferReviewList/Get/Items` (IT) | toàn bộ rà soát **mọi phòng** | Lộ ngoài phòng phụ trách; khác với transfers/offboarding đã giới hạn | `transfer-review/transfer-review-view.service.ts:161` vs `transfer/transfer-query.service.ts:95-103` | `QĐ-87b`(4) | **không spec** |
| R4 | `superAdminWatchGet` (IT) | `holder.workState`, `holder.lastWorkingDay` | Lộ dữ liệu nhân sự của SA | `personnel/role-duties/role-duties.dto.ts:17-31` | `QĐ-87b`(4) | `people-read-scope` |
| R5 | `subscriptionRenewalGet` (IT, Finance, Spending Approver) | `decision.snapshot.financial` (ngân sách/đã chi/còn lại phòng sở hữu) | Lộ cho IT; không còn người quyết chi ở bước này | `subscription-renewal.dto.ts:112-125,167` | `QĐ-94c`(1), `QĐ-100p` | `subscription-owner-confirmation` (IT ⟹ null) |
| R6 | `subscriptionRenewalSeatRanking` (Finance, Spending Approver) | họ tên, mã NV, `lastActivityOn` từng người | Lộ — hai vai không có bước dùng | `:184-191`; `subscription-renewal-parties.service.ts:21` | `QĐ-77e`, `QĐ-94d`(6) | `subscription-owner-confirmation` |
| R7 | renewal (mọi vai đọc) | `waitingReason: NO_SPENDING_APPROVER`, `decision.deciderRole: SPENDING_APPROVER` | Lỗi thời | `:107,159` | `QĐ-94c`(1) | `subscription-owner-confirmation` |
| R8 | renewal | `outcomeDetail.realisedSavings` | Lỗi thời/gây hiểu nhầm: là chênh lệch khai báo, không phải tiết kiệm **thực** theo hóa đơn | `subscription-renewal.dto.ts` (`outcomeDetail`) | QT 5.11, `QĐ-94h` | không spec (H7/G8 hoãn) — FE ghi nhãn *khai báo* |
| R9 | `offboardingCase*` | `abrupt` | Lỗi thời → `accessBlockMode` (giữ deprecated) | `offboarding.dto.ts:97` | `QĐ-96c` | `departure-block-now-mode` |
| R10 | `transferReviewItemList` | `decision: NEEDS_NEW_TOOL`, `newToolNote`; `needsNewRequest` đúng cả với K5 | Lỗi thời | `transfer-review.dto.ts:105,108,117` | S-13, L-506 | `transfer-review-defaults` |
| R11 | `departmentTransferRecord` | `warnings[].code = BUSINESS_OWNER_REPLACEMENT_NEEDED` | Lỗi thời (điều chuyển chỉ hỏi giữ/đổi) | `transfer.dto.ts:109-113` | QT 3.3 | `transfer-review-defaults` |
| R12 | `departmentTransferGet`, `transferReviewItemList` (TL mới, IT) | **thiếu** `transferLabel` T1–T4 (xem trước + chốt), tình trạng sử dụng tổng hợp | Output thiếu ⟹ FE dễ bắt TL tự chọn nhãn | `transfer.dto.ts:86-107`; `transfer-review.dto.ts:97-118` | `QĐ-94f`(1), QT 3.2/3.6, `QĐ-101i` | hoãn (`transfer-labels-and-overlap`, không có thư mục) |
| R13 | `provisioningTask*` (IT) | **thiếu** `dueOn`, `notBefore`, `overdue` | Output thiếu | `provisioning.dto.ts:88-145` | `QĐ-98g`, `QĐ-94j` | `revocation-deadline-and-withdraw` (B) |
| R14 | `offboardingCaseRights`, `transferReviewItemList` | `grantReason` | Không lộ: QT 3.6 cho TL mới xem *lý do cấp ban đầu*; IT cần cho thu hồi | `offboarding.dto.ts:190`; `transfer-review.dto.ts:104` | QT 3.6 | — |

## 8. Spec deltas

| # | Spec (giờ đọc) | Op · field | Spec nói | Nên là | Vì sao |
| --- | --- | --- | --- | --- | --- |
| D1 | `subscription-owner-confirmation` (14:09) | `subscriptionRenewalPropose.withinCurrentTerm` | thêm input IT, tùy chọn, chỉ `REDUCE` | `DROP-derive`: BE lấy điểm thực hiện từ `allowsMidTermReduction` + ngày (linh hoạt ⟹ kỳ thanh toán sau; cam kết kỳ ⟹ hết kỳ; sau ND ⟹ lúc còn làm được) | `QĐ-96f`, `QĐ-96g`; V3 §2.16 đã kết luận SERVER TÍNH; field này cho IT chọn ngược luật loại thuê bao |
| D2 | `subscription-owner-confirmation` (14:09) | `subscriptionRenewalSeatRanking.lastActivityOn` với TL | `null` | trả ngày hoạt động cuối (chỉ ngày, không khối lượng) cho TL sở hữu | `QĐ-101i`, `QĐ-77e` cho TL thấy *ngày hoạt động cuối*; TL cần nó để xác nhận danh sách seat (QT 5.8) |
| D3 | `licensing-api-fields` (14:11) | `licenseAssignmentChangeResponsible.expectedEndDate` | thiếu ⟹ ngày dòng cũ; muộn hơn ⟹ 422 | BE mặc định `earliest(dòng cũ, contractEndDate người nhận)`; bỏ lỗi *bắt buộc* `INV-07` khi hồ sơ có ngày hết hợp đồng; client chỉ được rút ngắn | Q-03 a1 (tài khoản dịch vụ không hạn ⟹ dòng cũ thường `null`, quy tắc của spec để trống ⟹ nhà thầu vẫn phải gõ tay) + Q-03 b1 (`contractEndDate`, `approved-end-date` B) |
| D4 | `licensing-api-fields` (14:11) | `provisioningTaskComplete.evidence`, `…ReportFailure.reason`, `…CloseFailed.reason` | không nhắc | bắt buộc ở DTO (`trim().min(1)`), giữ mã domain cũ trong ví dụ | BRIEF quy tắc 3; cùng lỗi NV-08 (DTO `default('')` nhưng policy từ chối `provisioning.policy.ts:147,155`) |
| D5 | `subscription-quantity-guard` (14:10) / `catalog-api-fields` (14:11) | `subscriptionUpdate.unitPrice` trên ACTIVE | không chặn | cần `basis` (`correction+reason` hoặc `renewalId`/`requestId`) như `purchasedQuantity` | tăng giá giữa kỳ = chi tăng không qua duyệt (`QĐ-84f`, QT 5.9 *không chi trước khi duyệt*) |
| D6 | `revocation-deadline-and-withdraw` (14:09) + `transfer-review-defaults` (14:07) | `transferReviewDecide` `NOT_NEEDED` → `openRevocation` | chỉ nơi gọi nghỉ việc được truyền `timing`; chồng lấn để H6 (hoãn) | Phần A tối thiểu: nơi gọi rà soát truyền `timing.notBefore = effectiveOn + 5 ngày LV` (đã có facade) | hiện IT thu hồi được **ngay** trong chồng lấn (`transfer-review-decision.service.ts:75`) — sai `QĐ-94f`(3), QT 3.9 |
| D7 | `people-read-scope` (14:08) | `transferReviewList/Get/ItemList` (IT) | không có | IT chỉ đọc rà soát của phòng phụ trách/đứng thay (cùng hàm `getItAdminScope` như transfers) | `QĐ-87b`(4); R3 |
| D8 | `departure-block-now-mode` (14:09) | `personnelNoticeRecord.event.accessBlockMode` | tùy chọn, vắng ⟹ suy theo loại | bắt buộc với `DEPARTURE`/`ABRUPT_DEPARTURE` (FE điền sẵn theo loại) — đối xứng với `offboardingCaseRecord` (spec tự nói *không mặc định — SA chọn có chủ ý*) | `QĐ-96c` (*SA ghi lựa chọn chặn ngay cùng căn cứ*); mức thấp |
| D9 | `subscription-owner-confirmation` (14:09) | `subscriptionRenewalRecordOutcome.note`, `nextPeriod.purchasedQuantity`, `nextPeriod.startDate` | ngoài phạm vi | `note` bắt buộc khi `VENDOR_REFUSED`/`DIFFERENT`; trần số lượng; `startDate` mặc định | `QĐ-96i`, `QĐ-100ad` — chưa spec nào nhận (chat MF-5) |

Đồng ý (không delta): `departure-block-now-mode` (record/markLeft/changeLastDay), `personnel-grounds-and-reasons` (10 op, `count`/`reason`
thu hồi, `cancelPendingTransfer`), `departure-day-access-block` (account-lock/revocations mở khi đã chặn; close vẫn cần `LEFT`),
`transfer-review-defaults` + `transfer-replacement-request` (body `{assignmentId, decision, reason}` + `termMonths` B), `licensing-api-fields`
(`completion`, `value`, `hand-off`), `approved-end-date` (`provisioningTaskGrant.expectedEndDate` bỏ), `subscription-owner-confirmation`
(vai TL sở hữu, body `CONFIRM`, chuyển `releasedAssignmentIds`, đọc theo phòng), `subscription-quantity-guard` (`requestId`/`basis`).

**Operation MF-2/3/5 không spec nào phủ** (spec có/không ⟹ đã grep `docs/workspace/items/qd96-100-*`, `g7-*`, `c1-*`, `e2e-*`):

| Op | Thiếu gì | Mức gợi ý |
| --- | --- | --- |
| `transferReviewList/Get/ItemList` (IT) | giới hạn phòng phụ trách (R3) | B |
| `departmentTransferGet`, `transferReviewItemList` | nhãn T1–T4 + chồng lấn: `qd96-100-transfer-labels-and-overlap` được tham chiếu nhưng **không có thư mục** | BLOCKER cho QT 3.2/3.5 |
| `subscriptionRenewalRecordOutcome` | D9; ghi *đã báo nhà cung cấp*: `qd96-100-renewal-milestones-and-recipients` được tham chiếu nhưng **không có thư mục** | B (chat MF-5) |
| `accessRequestCancel` / `…/departure-closure` (`BENEFICIARY_TRANSFERRED`) | QT 3.4 ghi *Hệ thống* đóng Request trả phí khi điều chuyển, `QĐ-90b` ghi IT đóng kèm lý do — tài liệu mâu thuẫn; code theo `QĐ-90b` | hỏi Owner/sửa QT |
| `offboardingCaseClose`, `departmentTransferClose` | QT 2.10/3.10 ghi *Hệ thống* đóng; code là nút IT (cổng thật) | ghi nhận, không cần đổi tối nay |
| `provisioningTaskList` | lọc `kind`/`source`/quá hạn cho hàng thu hồi | B |
| `subscriptionDeadlineEventList` | TL sở hữu, Finance chưa đọc được | B (Phần B owner-confirmation) |
| `serviceAccountDutyList`, `departmentToolsInUse`, `seat-baseline*`, `head-*`/`successor-*`, `assignmentExpiry*`, `licenseAssignmentList`, `meDepartureNoticeGet` | không cần đổi field (đã kiểm) | — |
| MF-5 usage/ghost-seat (5.2–5.5) | chưa có API — theo `g7-*` + DESIGN §0 | ngoài lượt |

## 9. Đếm

- **Operation đã rà: 82** — MF-2 26 (`personnel-notices` 7, `offboarding-cases` 13, `me/departure-notice`, `super-admin-watch`, đóng Request 2,
  khóa/mở khóa 2), MF-3 11, tổ chức 4, licensing dùng chung 21, MF-5/catalog 20 (thuê bao 5, seat 8, gia hạn 6, sự kiện hạn 1). 48 op ghi, 34 op đọc.
- **Bảng field (mục 1–6, không tính path/page/header):** 132 hàng, 214 lượt verdict (đếm bằng script trên chính file này; `×N` tính theo
  số field; một field có hai nhánh thì hai verdict) — `KEEP-in` 96 · `KEEP-tech` 53 · `RESHAPE` 41 (20 là field căn cứ ở 5 op) ·
  `DROP-derive` 6 (`count`, `reason` thu hồi, `targetDepartmentId` chuyển đến, `expectedEndDate` lúc cấp, `planId`+`ownerDepartmentId` sau
  baseline, `withinCurrentTerm` ở decide) · `DROP-obsolete` 2 (`departedOn`, `newToolNote`) · `WRONG-ROLE` 4 (`markLeft.accountLock`, decide
  `choice`/`quantity` + vai op) · `WRONG-STEP` 4 (`releasedAssignmentIds` ở decide; cổng `CASE_NOT_LEFT` của account-lock và revocations;
  `NOT_NEEDED` thu hồi ngay) · `ADD` 8.
- Response: 14 phát hiện (R1–R14): lộ 6 (R1–R6), lỗi thời 5, thiếu output 2, không lộ 1. Spec delta: 9 (D1–D9); op không spec: 6 nhóm cần việc.

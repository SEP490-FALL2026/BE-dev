# V4-PEOPLE-API — Rà trường API nhóm nhân sự · tổ chức · tài khoản (Việc 2)

> Agent `V4-PEOPLE-API`, 05/11/2026. Pin: BE `3e4553b9` (`openapi.json` + `docs/generated/routes.md`, đọc tại working tree), Docs
> `3d73a7f`. Read-only: không sửa code/tài liệu, không chạy test, không `git` thay đổi trạng thái. Nguồn inventory:
> [inventory.md](inventory.md).
>
> **Viết tắt:** `PD:n` = `Docs/Decisions/project-decisions.md` dòng n · `BRD:n` = BRD 4.0 dòng n · `QT:n` =
> `Docs/Requiments/Quy trình và chính sách theo main flow.md` dòng n · `EP-0x:n` = `Docs/BE-UserStory/epics/EP-0x.md` · đường dẫn
> BE tính từ `src/modules/` · `FE:` = `Code/FE-web/app/` · `GEN:` = `FE:shared/api/generated/model/` · nhóm `grounds{type, reference,
> issuer, issuedOn}` gọi tắt **G-GROUNDS**, union `successor{kind: EMPLOYEE|NONE}` gọi tắt **G-SUCC**.

## 1. Skill, phạm vi, danh sách operation

### 1.1 Skill Preflight (đã đọc đủ `SKILL.md`)

| Skill | Loại | Mục đích ở lượt này |
| --- | --- | --- |
| `code-review-and-quality` | process | Quy trình rà 5 trục (đúng · đọc được · kiến trúc · bảo mật · hiệu năng), phân mức phát hiện; dùng làm khung đi từ DTO → controller → service → policy |
| `api-and-interface-design` | domain | Hợp đồng API: validate tại biên, input ≠ output, trường server sinh không nhận từ client, nhất quán bắt buộc/tùy chọn giữa DTO và luật |
| `security-and-hardening` | domain/review | Phân quyền theo vai, tối thiểu hóa dữ liệu cá nhân (*collect only against a stated purpose*), lộ dữ liệu ở response |
| `superpowers:verification-before-completion` | verification | Không tuyên bố xong khi chưa kiểm: cuối lượt grep lại file báo cáo đủ 51 `operationId` ghi; mọi kết luận kèm `file:dòng` |

Mapping: không có skill đúng tên *API field audit*; dùng hai skill domain trên làm equivalent. Skill không mở rộng scope (không sửa code,
không chạy test).

### 1.2 Phạm vi đã đọc / chưa đọc

- **Đã đọc:** tracker `README.md`; `inventory.md` các tag được giao; BE `AGENTS.md`, `personnel/README.md`; DTO, controller, service,
  policy chính của `personnel/{offboarding,transfer,transfer-review,leave,notice,role-duties,event-notice}`,
  `organization/{employee,department-management,cost-center}`, `identity-access/{accounts,auth,access}`,
  `data-import/employee-import`, `notifications/inbox`, `dashboards/*/*.dto.ts`; `prisma/models/personnel.prisma` (cột grounds, abrupt,
  note). Docs: `PD` 3.2 (136–175), 3.3 (177–229), 3.6 (324–341), 3.7 (343–358), 3.11 (QĐ-100q→ai, 484–506), 3.12, 3.14 (544–560);
  BRD 5.2 (FR-2.1/2.2/2.12/2.14/2.16), FR-3.17, 5.8, 5.9, 5.11, 5.13 (BM-04/BM-09), 7.5, 7.7.1–7.7.4; `QT` MF-2 (342–508), MF-3
  (509–664); `EP-03` (US-03-04, US-03-07, US-03-10), `EP-01` (US-01-01), `EP-02` (US-02-01). FE: `features/dashboard/super-admin/*`,
  `it-admin/offboarding`, `manager/access-review`, `finance/cost-centers`, client sinh `shared/api/generated/model/*`; Docs
  `Figma UI-UX/API-Integration/{api-index.md, reference/personnel-offboarding-notices.md}`.
- **Chưa đọc kỹ:** sơ đồ `MF-2/MF-3*.md` (đã đọc bản chính sách tương ứng ở `QT`); `super-admin-event/` (lệnh CLI, không phải HTTP);
  thân service của dashboards (chỉ đọc DTO — trả số đếm); `notifications/email`; test. Không chạy app, không đối chiếu dữ liệu demo.

### 1.3 Operation đã rà — 96 (51 ghi + 45 GET)

| Tag | Ghi (rà đủ trường) | GET (rà query/response) |
| --- | --- | --- |
| `offboarding-cases` (13) | `offboardingCaseRecord`, `offboardingCaseChangeLastDay`, `offboardingCaseCancel`, `offboardingCaseMarkLeft`, `offboardingCaseRecordAccountLock`, `offboardingCaseOpenRevocations`, `offboardingCaseClose` | `offboardingCaseList`, `offboardingCaseGet` ⚠, `offboardingCaseRightList`, `offboardingCaseChangeList`, `offboardingCaseOpenRequestList`, `offboardingCaseOpenGrantTaskList` |
| `department-transfers` (7) | `departmentTransferRecord`, `departmentTransferReschedule`, `departmentTransferCancel`, `departmentTransferClose` | `departmentTransferList`, `departmentTransferGet`, `departmentTransferChangeList` |
| `transfer-reviews` (4) | `transferReviewDecide` | `transferReviewList`, `transferReviewGet`, `transferReviewItemList` |
| `long-leaves` (6) | `longLeaveStart`, `longLeaveChangeReturnDate`, `longLeaveConfirmReturn` | `longLeaveList` ⚠, `longLeaveGet`, `longLeaveChangeList` |
| `personnel-notices` (7) | `personnelNoticeSend`, `personnelNoticeWithdraw`, `personnelNoticeReject`, `personnelNoticeRecord`, `personnelNoticeLinkEvent` | `personnelNoticeList` ⚠, `personnelNoticeGet` ⚠ |
| `employees` (5) | `employeeFirstPlacement`, `employeeCreate`, `employeeUpdateOfficialFields` | `employeeList`, `employeeGet` |
| `employee-imports` (6) | `employeeImportUpload`, `employeeImportPreviewRefresh`, `employeeImportConfirm`, `employeeImportCancel` | `employeeImportGet`, `employeeImportRowList` |
| `departments` (13) | `departmentCreate`, `departmentUpdate`, `departmentDeactivate`, `departmentHeadAssign`, `departmentHeadVacate`, `departmentSuccessorDesignate`, `departmentSuccessorClear` | `departmentList`, `departmentGet`, `departmentMemberList` ⚠, `departmentTechnicalMemberList`, `departmentWarningList`, `departmentToolsInUse` |
| `cost-centers` (5) | `costCenterCreate`, `costCenterRename`, `costCenterDeactivate` | `costCenterList` ⚠ (query `kind`), `costCenterEmployeeList` |
| `app-users` (8) | `appUserCreate`, `appUserResendInvitation`, `appUserLock`, `appUserUnlock`, `appUserChangeRole` | `accountCandidatesList`, `appUserList`, `appUserGet` |
| `auth` (6) | `authLogin`, `authRefresh`, `authLogout`, `authRequestPasswordReset`, `authResetPassword`, `authRedeemInvitation` | — |
| `me` (5) | `meChangePassword` | `meGet` ⚠ (`roles[]`), `meDepartureNoticeGet`, `meSoftwareRightList`, `meAccessRequestList` |
| `notifications` (4) | `notificationMarkAllRead`, `notificationMarkRead` | `notificationList`, `notificationUnreadCount` |
| `onboarding` (1) | — | `onboardingChecklistGet` |
| `dashboards` (4) | — | `employeeDashboardGet`, `managerDashboardGet`, `itAdminDashboardGet`, `superAdminDashboardGet` |
| `audit` (1) | — | `auditEventList` |
| `super-admin-watch` (1) | — | `superAdminWatchGet` ⚠ |

⚠ = GET có điểm ghi ở mục 4 (response) hoặc 2.8 (query). GET không đánh dấu: đã đọc schema, không thấy trường vượt phạm vi vai.

## 2. Bảng trường theo operation ghi

### 2.0 Hai nhóm trường dùng chung

- **G-GROUNDS** (`personnel/{offboarding,transfer,leave,notice}/*.dto.ts`, ví dụ `transfer/transfer.dto.ts:10-15`) — Super Admin
  nhập từ văn bản ngoài hệ thống; **bắt buộc** cho mọi sự kiện nhân sự (`QĐ-76c` PD:204, `QĐ-77a` PD:207, `QĐ-93f`(2) PD:225, BRD:534
  FR-2.14(3)). Hiện trạng: DTO `.optional()` mọi phần, policy `personnel-grounds.policy.ts:34-43` mới từ chối `GROUNDS_REQUIRED` /
  `GROUNDS_INCOMPLETE` / `GROUNDS_IS_NOTICE` (chặn mã `BM09-…` làm căn cứ — **ĐÚNG**). Lưu `grounds_type/reference/issuer/issued_on`
  (`prisma/models/personnel.prisma:32-35`, 193-196, 290-293). **Kết luận: ĐỔI** — (a) bắt buộc ở DTO để OpenAPI/FE biết; (b) `type` →
  enum 3 loại theo BM-04 (BRD:1451) / `QĐ-77a`: *quyết định/thư nhân sự · đơn đã được chấp thuận · chỉ đạo bằng văn bản* (hiện chuỗi
  tự do ≤ 100); (c) `issuedOn` → kiểu ngày `businessDay` (hiện `z.string().max(10)`, chỉ policy kiểm), nên kiểm ≤ hôm nay. Nhạy cảm:
  thấp (mã văn bản, tên người ban hành — dữ liệu cơ bản). FE: `FE:features/dashboard/super-admin/shared/components/personnel-form.tsx:23-32`
  ô text tự do → select. Không phải dữ liệu cá nhân của nhân viên bị tác động.
- **G-SUCC** — chỉ định trưởng phòng kế nhiệm khi người rời/chuyển đang là trưởng phòng (`QĐ-40a` PD:326, `QĐ-48b` PD:328, `QĐ-66q`
  PD:334, `QĐ-77j` PD:209). Policy `transfer/transfer.policy.ts:72-89` (`HEAD_SUCCESSOR_REQUIRED`, phải giữ `MANAGER`, là thành viên
  phòng cũ). **GIỮ**. Nghi vấn: gửi `successor` cho người **không** là trưởng phòng bị bỏ qua lặng lẽ
  (`transfer/transfer-guard.service.ts:71`) — xem NV-10.

### 2.1 MF-2 nghỉ việc — `offboarding-cases`

**`offboardingCaseRecord`** — `POST /offboarding-cases` · Vai QĐ: Super Admin (`QĐ-87a` PD:163) · Guard `SUPER_ADMIN`
(`personnel/offboarding/offboarding.controller.ts:95`) — khớp · MF-2 bước 2.2 + 2.4 (QT:367-408).

| Trường | Vai biết/trách nhiệm? | Logic dùng (file:dòng) | Server suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `employeeId` | Có | khóa, `offboarding-preconditions.service.ts` | Không | Thấp | **GIỮ** | FR-2.12 | `super-admin/personnel/components/offboarding-panel.tsx:90,107` |
| `lastWorkingDay` | Có (theo căn cứ) | `offboarding.policy.ts:43-70` (DTO `.optional()` `offboarding.dto.ts:31`, policy trả `LAST_WORKING_DAY_REQUIRED`) | Không | Thấp | **ĐỔI**: bắt buộc ở DTO; với nhịp *chặn ngay* phải **cho phép ngày tương lai** (hiện `abrupt` chặn `IN_FUTURE` `offboarding.policy.ts:66-67`) | `QĐ-96c` PD:340, BRD:513 FR-2.12(ii) | `offboarding-panel.tsx:91` |
| `abrupt` | Có (SA chọn nhịp) | `abrupt=true` ⟹ ngày cuối ≤ hôm nay, `LEFT` ngay (`offboarding-case-writer.service.ts:82-84`, `offboarding-endings.service.ts:49`) | Không | Thấp | **ĐỔI** → trường nhịp theo `QĐ-96c`: `blockMode: WITH_LAST_DAY \| BLOCK_NOW` (tên chốt ở spec). *Chặn ngay* gồm đuổi việc cần cắt quyền ngay, nghỉ đột ngột **và công ty cắt quyền trước ngày cuối** (ngày cuối tương lai, người vẫn *đang bàn giao* nhưng bị chặn trong ngày). `LEFT` ngay chỉ khi ngày cuối ≤ hôm nay. Cần migration cột `abrupt` | `QĐ-96c` PD:340, `QĐ-62e` PD:332, EP-03:169 AC-32, BM-04 BRD:1451 | checkbox `abrupt` `offboarding-panel.tsx:92`; Docs `API-Integration/reference/personnel-offboarding-notices.md:9` |
| G-GROUNDS | Có | `offboarding.policy.ts:99-101` | Không | Thấp | **ĐỔI** (2.0) | `QĐ-76c`, `QĐ-96c` (căn cứ của lựa chọn chặn ngay) | `readBasis` |
| G-SUCC | Có | `transfer-guard.service.ts:103-110` | Không | Thấp | **GIỮ** | `QĐ-40a` | `successorFields` |
| `pendingTransferCancellation.reason` | Có nhưng lý do luôn là "nghỉ việc trước ngày hiệu lực điều chuyển" | `offboarding.policy.ts:119-128`; tái dùng căn cứ nghỉ việc `offboarding-endings.service.ts:66` | **Có** | Thấp | **SERVER TÍNH**: đổi thành cờ xác nhận `cancelPendingTransfer: true`, server ghi lý do chuẩn + căn cứ của nghỉ việc | `QĐ-77j` PD:209 | `transferCancellationReason` `offboarding-panel.tsx:94,112` |
| *(không có)* lý do nghỉ | — | BE không thu (đúng tối thiểu hóa) | — | **Có thể nhạy cảm** | Chờ Q-V4-01 | QT:370 nói SA ghi *lý do nghỉ*; BM-04 BRD:1451 không có trường này | — |

**`offboardingCaseChangeLastDay`** — `POST /offboarding-cases/{id}/last-day-changes` · Vai QĐ: Super Admin (`QĐ-48a` PD:327) · Guard
`SUPER_ADMIN` (`offboarding.controller.ts:216`) · MF-2 2.2 (đổi sự kiện trước *đã nghỉ việc*).

| Trường | Vai biết? | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `lastWorkingDay` | Có | `offboarding.policy.ts:152-162` | Không | Thấp | **GIỮ** | `QĐ-48a` | `offboarding-panel.tsx:97` |
| `reason` | Có | bắt buộc ở policy (`:157` `REASON_REQUIRED`), DTO `.optional()` (`offboarding.dto.ts:40`), controller ép `?? ''` (`offboarding.controller.ts:246`) | Không | Thấp | **ĐỔI**: bắt buộc ở DTO (`min(1)`) | `QĐ-48c` PD:329 | FE `maxLength: 2000` > BE 1000 (`offboarding-panel.tsx:97`) |
| G-SUCC | Có | dời chỉ định kế nhiệm `QĐ-48b` | Không | Thấp | **GIỮ** | `QĐ-48b`, `QĐ-66q` | có |
| *(thiếu)* G-GROUNDS | Có | **Không có** trong DTO `offboarding.dto.ts:38-42`; policy không kiểm | Không | Thấp | **THIẾU**: thêm G-GROUNDS bắt buộc | `QĐ-48c` PD:329 (*lý do … kèm căn cứ*), `QĐ-93f`(2) PD:225, QT:376 | thêm `readBasis` |

**`offboardingCaseCancel`** — `POST /offboarding-cases/{id}/cancellation` · Super Admin · Guard `SUPER_ADMIN` (`:256`) · MF-2 2.2/2.7
(hủy bàn giao; sau ngày cuối thì vẫn chặn tài khoản — `QĐ-100q` PD:341).

| Trường | Vai biết? | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `reason` | Có | `offboarding.policy.ts:166-170`; DTO `.optional()` `offboarding.dto.ts:44`; `?? ''` `offboarding.controller.ts:283` | Không | Thấp | **ĐỔI**: bắt buộc ở DTO | `QĐ-48c` | `offboarding-panel.tsx:100,128` |
| *(thiếu)* G-GROUNDS | Có | không có | Không | Thấp | **THIẾU** | `QĐ-48c`, `QĐ-93f`(2), QT:376 | thêm |

**`offboardingCaseMarkLeft`** — `POST /offboarding-cases/{id}/departure` · Super Admin chuyển *đã nghỉ việc* (`QĐ-77c` PD:157,
`QĐ-96j`(1) PD:487) · Guard `SUPER_ADMIN` (`:294`) · MF-2 2.7.

| Trường | Vai biết? | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `departedOn` | Một phần — ngày nghỉ chính thức đã có trong căn cứ (= ngày làm việc cuối) | `offboarding-left.service.ts:41-45` (`leftOn = departedOn ?? today`), kiểm `[recordedOn, today]` `offboarding.policy.ts:174-187`; lưu `left_on` | **Có** (từ `lastWorkingDay`) | Thấp | **SERVER TÍNH** (chờ Q-V4-06): `leftOn` = ngày làm việc cuối đã ghi | FR-2.1 BRD:461 (*ngày vào/nghỉ*), `QĐ-48a` | `offboarding-panel.tsx:99,127` |
| `accountLock.note` | **Không** — khóa tài khoản công ty là mục (1) `BM-08` của **IT Admin** | ghi bằng tài khoản SA (`offboarding-left.service.ts:44,47` → `writeAccountLock` `:100-118`) | — | Thấp | **CHUYỂN BƯỚC**: bỏ khỏi body của SA; chỉ IT Admin ghi qua `offboardingCaseRecordAccountLock`/`OpenRevocations` | QT:458-467 (RACI A/R IT Admin), `QĐ-77i` PD:337, `SoD-1` / `QĐ-87a` (SA không làm tác vụ kỹ thuật) | FE SA **không** gửi trường này (`offboarding-panel.tsx:127`) ⟹ bỏ an toàn; `GEN:offboarding-cases/markLeftBodyDtoAccountLock.ts` cần sinh lại |

**`offboardingCaseRecordAccountLock`** — `POST /offboarding-cases/{id}/account-lock` · IT Admin (BM-08 (1)) · Guard `IT_ADMIN`
(`offboarding-steps.controller.ts:64`) · MF-2 2.8.

| Trường | Vai biết? | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `note` | Có (bằng chứng đã khóa) | `offboarding-left.service.ts:106-118`, cột `account_lock_note` | Người/thời điểm server ghi; nội dung không | Thấp | **GIỮ** (bằng chứng — QT:470 *ghi người và thời điểm*, 2.9 *kèm bằng chứng*). Nghi vấn trạng thái `LEFT` bắt buộc — NV-02 | `QĐ-77i` | `it-admin/offboarding/components/offboarding-action-dialog.tsx` |

**`offboardingCaseOpenRevocations`** — `POST /offboarding-cases/{id}/revocations` · IT Admin (SBF-18) · Guard `IT_ADMIN` (`:99`) · MF-2 2.9.

| Trường | Vai biết? | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `assignmentIds` | Có | `offboarding.policy.ts:223-236`; vắng = mọi quyền thu hồi được (`:248-250`) | — | Thấp | **GIỮ** (tùy chọn; vắng = toàn bộ — đúng `QĐ-56b` *thu hồi toàn bộ*) | `QĐ-56b` PD:330 | `offboarding-action-dialog.tsx:39` |
| `count` | Không — chỉ là số dòng client đếm | so `count === selected.length` → `COUNT_MISMATCH` (`offboarding.policy.ts:256`) | **Có** | — | **BỎ** (SERVER TÍNH). FE tự đặt `count = assignmentIds.length` (`offboarding-action-dialog.tsx:39`); khi không gửi `assignmentIds` thì FE gửi 0 ⟹ luôn lỗi. Chống xem cũ nếu cần: `If-Match`/phiên bản hồ sơ | API skill: trường server tính không nhận từ client | sửa dialog |
| `reason` | Không cần — nguồn là *nghỉ việc*, server đã suy (`offboarding-revocation.service.ts:128-130`) | bắt buộc ở policy `:246`; ghi lên mọi tác vụ `:60-80` | **Có** | Thấp | **SERVER TÍNH**: lý do = nguồn `DEPARTURE`/`ABRUPT_DEPARTURE` + mã hồ sơ; giữ `note` tùy chọn | SBF-18 lý do *nghỉ việc* (QT:478) | `reason: note.trim()` `offboarding-action-dialog.tsx:39` |
| `accountLock.note` | Có | khóa trước/cùng thu hồi `offboarding-revocation.service.ts:63` | — | Thấp | **GIỮ** | `QĐ-77i` | có |

**`offboardingCaseClose`** — `POST /offboarding-cases/{id}/closure` · IT Admin · Guard `IT_ADMIN` (`:137`) · MF-2 2.10 · không body —
**GIỮ** (QT:488 ghi *Hệ thống* đóng; nếu đổi sang tự đóng là việc của A4, không phải trường).

### 2.2 MF-3 điều chuyển — `department-transfers`, `transfer-reviews`

**`departmentTransferRecord`** — `POST /department-transfers` · Super Admin (`QĐ-87a`, QT:527) · Guard `SUPER_ADMIN`
(`personnel/transfer/transfers.controller.ts:86`) · MF-3 3.1.

| Trường | Vai biết? | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `employeeId` | Có | `transfer.policy.ts:106-128` | Không | Thấp | **GIỮ** | FR-2.2 | `super-admin/transfer/views/super-admin-transfer-view.tsx:92` |
| `toDepartmentId` | Có | `NO_CHANGE`, phòng hoạt động (`:108-117`) | Không | Thấp | **GIỮ** | QT:530 | `:93` |
| `effectiveOn` | Có | `EFFECTIVE_DATE_IN_PAST` (`:92-97`) | Không | Thấp | **GIỮ** | `QĐ-66e` PD:348 | `:94` |
| G-GROUNDS | Có | `:118-120` | Không | Thấp | **ĐỔI** (2.0) | `QĐ-76c` | `:95` |
| G-SUCC | Có | `:127` | Không | Thấp | **GIỮ** (+ NV-10) | QT:555 | `:96` |

**`departmentTransferReschedule`** — `POST /department-transfers/{id}/rescheduling` · Super Admin · Guard `SUPER_ADMIN` (`:204`) · MF-3 3.1.

| Trường | Vai biết? | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `newEffectiveOn` | Có | `transfer.policy.ts:149-161` | Không | Thấp | **GIỮ** | `QĐ-77j` | `:103` |
| `reason` | Có | `reasonAndGrounds` `:62-68`; DTO `.optional()` `transfer.dto.ts:33`; `?? ''` `transfers.controller.ts:238` | Không | Thấp | **ĐỔI**: bắt buộc ở DTO | `QĐ-77j` PD:209 | `:104` |
| G-GROUNDS | Có | `:64` | Không | Thấp | **ĐỔI** (2.0) | `QĐ-93f`(2) | `:105` |
| G-SUCC | Có | dời/thay kế nhiệm | Không | Thấp | **GIỮ** | `QĐ-77j` | `:106` |

**`departmentTransferCancel`** — `POST /department-transfers/{id}/cancellation` · Super Admin · Guard `SUPER_ADMIN` (`:247`).

| Trường | Vai biết? | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `reason` | Có | `cancelRefusal` `transfer.policy.ts:164-168`; `?? ''` `transfers.controller.ts:275` | Không | Thấp | **ĐỔI**: bắt buộc ở DTO | `QĐ-77j` | `:109` |
| G-GROUNDS | Có | như trên | Không | Thấp | **ĐỔI** (2.0) | `QĐ-77j` | `:109` |

**`departmentTransferClose`** — `POST /department-transfers/{id}/closure` · IT Admin · Guard `IT_ADMIN` (`:284`) · MF-3 3.10 · không
body — **GIỮ** (đóng tự động hay tay là việc A4).

**`transferReviewDecide`** — `POST /transfer-reviews/{id}/decisions` · Trưởng phòng **mới** của phòng nhận (`QĐ-94f` PD:355, QT:594) ·
Guard: không `@RequireRoles`, policy `mayDecide` = trưởng phòng hôm nay (`personnel/transfer-review/transfer-review.policy.ts:44-46`,
`transfer-review-decision.service.ts:58-60`) — khớp · MF-3 3.6.

| Trường | Vai biết? | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `assignmentId` | Có (dòng của rà soát) | `findItem` `transfer-review-decision.service.ts:67-68` | Không | Thấp | **GIỮ** | FR-2.16(2) | **FE trưởng phòng chưa nối API** — `manager/access-review/views/manager-access-review-view.tsx:5` dùng `MOCK_ACCESS_REVIEW` |
| `decision` | Có | `NOT_NEEDED` mở thu hồi (`:75`); `STILL_NEEDED` chờ "Request mới của phòng" (`transfer-review-replacement.service.ts:14-21`); `NEEDS_NEW_TOOL` **không làm gì** với seat | *trả phí/nội bộ* suy từ nhãn T1–T3 | Thấp | **ĐỔI**: còn `STILL_NEEDED \| NOT_NEEDED`; bỏ `NEEDS_NEW_TOOL` khỏi quyết định từng dòng (NV-04) | FR-2.16(2) BRD:544 (*cần công cụ mới ⟹ Request mới theo MF-1*), QT:598 | mock |
| `newToolNote` | Có nhưng không thuộc rà soát | lưu `new_tool_note` (`prisma/models/personnel.prisma:148`); chỉ đi với `NEEDS_NEW_TOOL` (`transfer-review.policy.ts:55-59`) | — | Thấp | **BỎ** (chờ Q-V4-05; mâu thuẫn US-03-07 AC-5 EP-03:331) | QT:598, FR-2.16(2) | mock |
| *(thiếu)* `reason` | Có | không có | Không | Thấp | **THIẾU**: lý do ngắn cho mỗi quyết định; với *còn cần — trả phí* làm lý do của Request cấp thay thế tự tạo (BM-01 bắt buộc lý do) | QT:601 (*ghi người, thời điểm, lý do*), BM-01 BRD:1446 | thêm khi nối FE |

### 2.3 Nghỉ dài — `long-leaves`

Guard ghi `SUPER_ADMIN` (`personnel/leave/long-leaves.controller.ts:75,158,183,222`) — khớp `QĐ-80` (PD:210-214). DTO strict, **không**
có lý do nghỉ / dữ liệu y tế (`leave/leave.dto.ts:19-25`) — **ĐÚNG** `QĐ-80e` PD:214.

| Operation | Trường | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `longLeaveStart` | `employeeId` | khóa | Không | Thấp | **GIỮ** | FR-2.14 | `super-admin/personnel/components/leave-panel.tsx:87` |
| | `startedOn` | `leave.policy.ts` | Không | Thấp | **GIỮ** | `QĐ-80a` | có |
| | `approvedReturnOn` | `leave.policy.ts:42` (> startedOn) | Không (từ căn cứ) | Thấp | **GIỮ** | `QĐ-80c` | có |
| | G-GROUNDS | bắt buộc | Không | Thấp | **ĐỔI** (2.0) | `QĐ-80a` PD:210 | có |
| `longLeaveChangeReturnDate` | `newApprovedReturnOn` | `leave.policy.ts:64` | Không | Thấp | **GIỮ** | `QĐ-80c` | `leave-panel.tsx:98` |
| | G-GROUNDS | bắt buộc | Không | Thấp | **ĐỔI** (2.0) | `QĐ-80c` PD:212 | có |
| `longLeaveConfirmReturn` | `returnedOn` | ≤ hôm nay, ≥ startedOn (`leave.policy.ts:90-91`) | Không | Thấp | **GIỮ** | `QĐ-80b` | `leave-panel.tsx:101` |
| | G-GROUNDS | chỉ bắt buộc khi khác ngày đã duyệt (`leave.policy.ts:93`) | Không | Thấp | **ĐỔI** (2.0; mô tả OpenAPI ghi rõ *bắt buộc có điều kiện*) | `QĐ-80b`/`80c` | có |

### 2.4 SBF-13 thông báo `BM-09` — `personnel-notices`

**`personnelNoticeSend`** — `POST /personnel-notices` · Trưởng phòng hiện tại (chuyển đi/nghỉ/nghỉ đột ngột/nghỉ dài) hoặc trưởng phòng
phòng nhận (chuyển đến) (`QĐ-76d`(1) PD:205) · Guard `MANAGER` (`personnel/notice/notice.controller.ts:69`) + policy
`notice.policy.ts:51-63` — khớp · SBF-13 khởi đầu MF-2/MF-3.

| Trường | Vai biết? | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `employeeId` | Có với nhân viên phòng mình; **không có đường tra** với *chuyển đến* (người ở phòng khác — trưởng phòng không đọc được danh sách ngoài phòng, `QĐ-41c`(2) PD:182) | `notice.policy.ts:55-63` | Không | Thấp | **ĐỔI** cho `DEPARTMENT_TRANSFER_IN` (chờ Q-V4-04); GIỮ cho các loại khác | `QĐ-76d`(1) | **FE trưởng phòng không có form gửi BM-09** (chỉ `super-admin/personnel/components/notice-panel.tsx`) |
| `kind` | Có | `SENDABLE_NOTICE_KINDS` (bỏ đổi chức vụ — ĐÚNG `QĐ-87e`) | Không | Thấp | **GIỮ** | `QĐ-76a` PD:202 | — |
| `proposedOn` | Có | lưu, hạn xử lý | Không | Thấp | **GIỮ** | `QĐ-76a` | — |
| `targetDepartmentId` | Có với *chuyển đi*; với *chuyển đến* phải bằng phòng của chính người gửi (`notice.policy.ts:57`) | `:51-53` | **Có** (chuyển đến) | Thấp | **SERVER TÍNH** cho `DEPARTMENT_TRANSFER_IN` (= phòng người gửi đang làm trưởng phòng); GIỮ cho `_OUT` | `QĐ-76d`(1) | — |
| `note` | Có | lưu cột `note` (`prisma/models/personnel.prisma:396`), trả cho cả IT Admin (`notice.mapper.ts:44`) | Không | **Có thể nhạy cảm** — chữ tự do 500 ký tự dễ chứa lý do nghỉ/sức khỏe | **ĐỔI** (chờ Q-V4-02): giữ ghi chú ngắn nhưng giới hạn, cảnh báo ở FE, không trả cho IT Admin | `QĐ-76e` PD:206 (*không chứa lý do nghỉ hay dữ liệu cá nhân ngoài các trường BM-09*), BM-09 BRD:1456 | — |

**`personnelNoticeWithdraw`** — `POST …/{id}/withdrawal` · người gửi · Guard `MANAGER` (`:176`) · không body — **GIỮ**.

**`personnelNoticeReject`** — `POST …/{id}/rejection` · Super Admin (`QĐ-76b` PD:203) · Guard `SUPER_ADMIN` (`:207`).

| Trường | Vai biết? | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `reason` | Có | `notice.dto.ts:53` (`min(1)` — DTO đã bắt buộc, ĐÚNG); người gửi đọc lại | Không | Thấp | **GIỮ** | `QĐ-76b` | `notice-panel.tsx` |

**`personnelNoticeRecord`** — `POST …/{id}/recording` · Super Admin xác minh rồi ghi sự kiện (`QĐ-76b`, `QĐ-77b` PD:208) · Guard
`SUPER_ADMIN` (`:233`) · SBF-13 → MF-2 2.2 / MF-3 3.1 / nghỉ dài.

| Trường | Vai biết? | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `verification.method` | Có | enum 3 phương thức `notice.dto.ts:22-25` | Không | Thấp | **GIỮ** | FR-2.14(2) BRD:534 | `notice-action-form.tsx:39` |
| `verification.reference` | Có | lưu bản ghi xác minh (chỉ SA đọc — `notice-query.service.ts:84`) | Không | Thấp | **GIỮ** | `QĐ-77b` | FE `maxLength 2000` > BE 300 (`notice-action-form.tsx:40`) |
| G-GROUNDS | Có | recorder truyền `request.grounds` | Không | Thấp | **ĐỔI** (2.0) | `QĐ-76c` | `readBasis` `:102` |
| `event.toDepartmentId` | Có | mặc định lấy từ thông báo (`notice/transfer-notice.listener.ts:48`) | Có (mặc định) | Thấp | **GIỮ** (tùy chọn, đã có mặc định — ĐÚNG) | QT:530 | có |
| `event.effectiveOn` / `event.lastWorkingDay` / `event.startedOn` / `event.approvedReturnOn` | Có (ngày chính thức theo căn cứ, có thể khác `proposedOn`) | recorder từng loại | Không (chỉ gợi ý từ `proposedOn`) | Thấp | **GIỮ** (4 trường) | `QĐ-76b` *ngày chính thức theo căn cứ* | có |
| `event.successor` | Có | như G-SUCC | Không | Thấp | **GIỮ** | `QĐ-40a` | có |
| `event.pendingTransferCancellation.reason` | Như `offboardingCaseRecord` | `offboarding-notice.listener.ts:51` | **Có** | Thấp | **SERVER TÍNH** (như 2.1) | `QĐ-77j` | `notice-action-form.tsx:57,98-99` |
| *(thiếu)* nhịp *chặn ngay* | Có — **SA chọn**, không suy từ loại thông báo | hiện `abrupt = notice.kind === 'ABRUPT_DEPARTURE'` (`offboarding/offboarding-notice.listener.ts:48`) | Không | Thấp | **THIẾU**: `event.blockMode` cho thông báo nghỉ việc/nghỉ đột ngột; mặc định theo loại, SA đổi được | `QĐ-96c` PD:340 (*chia theo có làm tới ngày cuối, không theo lý do*; *SA ghi lựa chọn chặn ngay*), QT:395-408 | thêm |

**`personnelNoticeLinkEvent`** — `POST …/{id}/linking` · Super Admin · Guard `SUPER_ADMIN` (`:277`).

| Trường | Vai biết? | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eventId` | Có | `findLinkable` cùng nhân viên, chưa hủy (`offboarding-notice.listener.ts:65-69`) | Không | Thấp | **GIỮ** | FR-2.14(2) | `notice-action-form.tsx:84` |
| `verification` | Có | như trên | Không | Thấp | **GIỮ** | `QĐ-77b` | có |

### 2.5 Hồ sơ nhân viên — `employees`, `employee-imports`

Guard `SUPER_ADMIN` cho cả controller (`organization/employee/employees.controller.ts:27`,
`employee-maintenance.controller.ts:27`) — khớp `QĐ-87a`, `QĐ-82i` (PD:215). **Không còn trường căn cứ** — **ĐÚNG** `QĐ-93f` (PD:225),
FR-2.1 BRD:461 (*hệ thống không thu trường căn cứ*). Không có Cost Center trong input — ĐÚNG (`QĐ-30c` PD:179).

| Operation | Trường | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `employeeFirstPlacement` | `departmentId` | `employee-first-placement.policy.ts` (phòng hoạt động) | Không | Thấp | **GIỮ** | `QĐ-93g`(3) PD:226 | — |
| | `effectiveFrom` | ≥ hôm nay, ≥ ngày vào | Không | Thấp | **GIỮ** | `QĐ-93g`(3), `QĐ-99k` | — |
| `employeeCreate` | `employeeCode` | format `QĐ-93i` (`employee.dto.ts:32-38`) | Không | Thấp | **GIỮ** | `QĐ-93i` PD:228 | `super-admin/personnel/components/employee-panel.tsx:59,152` (FE cho mã ≤ 50, BE ≤ 20) |
| | `fullName` | `:39` | Không | Thấp (cơ bản) | **GIỮ** | FR-2.1 | có |
| | `workEmail` | không trùng sau chuẩn hóa (`:40-47`), nullable | Không | Thấp (cơ bản) | **GIỮ** (khóa khớp danh tính `GĐ-2`) | `QĐ-67d` PD:198 | có |
| | `employmentType` | dùng ở luật quyền có thời hạn nhà thầu/thực tập (`licensing/assignment/assignment.policy.ts`, `requests/...beneficiary-eligibility.policy.ts`) | Không | Thấp | **GIỮ** | FR-2.8, BRD 4.5 | có |
| | `hireDate` | quyền hiệu lực từ ngày vào | Không | Thấp | **GIỮ** | `QĐ-68f` PD:199 | có |
| | `departmentCode` | phòng phải hoạt động; trống ⟹ chưa xếp phòng | Không | Thấp | **GIỮ** (Nit: nhập tay dùng mã, xếp phòng lần đầu dùng `departmentId` — chọn một kiểu ở spec) | `QĐ-93g` | có |
| | `jobTitle` | DTO `max(1000)` (`employee.dto.ts:60`) nhưng policy `JOB_TITLE_MAX_LENGTH = 255` (`organization/public/employee-placement.policy.ts:11`) | Không | Thấp | **ĐỔI**: DTO `max(255)` cho khớp luật | `QĐ-87e` PD:222 | có |
| `employeeUpdateOfficialFields` | `fullName`, `workEmail`, `employmentType`, `hireDate` | `employee-correction.policy.ts:69-92` (ngày vào chỉ sửa khi chưa tới `:86-92`) | Không | Thấp | **GIỮ** (4 trường) | FR-2.1, FR-10.7 BRD:1352 | `employee-panel.tsx:135-146` |
| | `jobTitle` | `:94-102` | Không | Thấp | **ĐỔI**: `max(255)` | `QĐ-87e` | có |
| `employeeImportUpload` | `file` (multipart) — cột `employee_code, full_name, work_email, employment_type, hire_date, department_code, job_title` (`data-import/employee-import/employee-import-row.types.ts:5-13`) | khung xem trước | — | Thấp (không thu dữ liệu ngoài 7 cột — ĐÚNG tối thiểu hóa) | **GIỮ** | FR-9.7 BRD:1295 | `import-panel.tsx` |
| | *(thiếu)* cột nghỉ việc lịch sử | không có | — | Thấp | **THIẾU** (chỉ trong checklist khởi tạo): cột trạng thái/ngày nghỉ cho hồ sơ *đã nghỉ việc lịch sử* — phụ thuộc A4 | `QĐ-99k`(b) PD:229, FR-9.5 BRD:1293 | thêm vào file mẫu |
| `employeeImportPreviewRefresh`, `employeeImportCancel` | — (không body) | — | — | — | **GIỮ** | FR-9.2 | — |
| `employeeImportConfirm` | `previewVersion` | chống xác nhận bản xem trước cũ | Không (client phải nói bản đã xem) | — | **GIỮ** | FR-7.1 | `import-panel.tsx:281` |
| | `idempotencyKey` | khóa idempotent của client | Không — đúng mẫu *key từ client* | — | **GIỮ** | API skill (idempotency) | có |
| | `acknowledgeDuplicateFile` | xác nhận file trùng | Không | — | **GIỮ** | FR-7.1 | có |

### 2.6 Cơ cấu tổ chức — `departments`, `cost-centers`

Guard ghi phòng ban `SUPER_ADMIN` (`organization/department-management/departments.controller.ts:101,152,179`,
`department-heads.controller.ts:88,111,134,168`) — khớp `QĐ-87a`, `QĐ-52d` (PD:153). Không còn căn cứ — **ĐÚNG** `QĐ-93f`.

| Operation | Trường | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `departmentCreate` | `code` | `QĐ-93i`, không đổi sau tạo | Không | — | **GIỮ** | `QĐ-93i` | `super-admin/departments/components/department-form.tsx`; **GEN cũ**: pattern `^[A-Za-z0-9][A-Za-z0-9._-]*$`, ≤ 50 (`GEN:departments/createDepartmentBodyDto.ts`) |
| | `name`, `function` | `department.types.ts:12-13` | Không | — | **GIỮ** (2) | FR-3.17 BRD:665 | có |
| | `itAdminEmployeeId` | phải là IT Admin dùng được (`department.service.ts:207`) | Không | — | **GIỮ** | `QĐ-52d` | có |
| `departmentUpdate` | `name`, `function`, `itAdminEmployeeId` | `department.service.ts:109-142` | Không | — | **GIỮ** (3) | FR-3.17 | có |
| `departmentDeactivate`, `departmentSuccessorClear` | — (body rỗng strict) | — | — | — | **GIỮ** | `QĐ-66b` PD:192 | FE gửi `hrBasis` (`department-action-form.tsx:59`) ⟹ bị từ chối |
| `departmentHeadAssign` | `employeeId`, `effectiveFrom` | `department-head.service.ts:77-100` (≥ hôm nay, giữ `MANAGER`, thành viên) | Không | — | **GIỮ** (2) | `QĐ-66a` PD:191, `QĐ-93a` | có |
| `departmentHeadVacate` | `effectiveFrom` | `:137-150` | Không | — | **GIỮ** | `QĐ-51` | có |
| `departmentSuccessorDesignate` | `employeeId`, `effectiveFrom` | `:185-` (từ ngày sau hôm nay) | Không | — | **GIỮ** (2) | `QĐ-83c` PD:339 | có |
| `costCenterCreate` (guard `FINANCE` `cost-centers.controller.ts:147`) | `code`, `name`, `departmentId` | `cost-center.service.ts:81-107` | Không | — | **GIỮ** (3) | `QĐ-87d`(1) PD:221 | `finance/cost-centers/components/cost-center-form.tsx` |
| | `kind` | bắt buộc, chỉ nhận `'UNIT'` (`cost-center.dto.ts:13`, `cost-center.service.ts:222-225`) | **Có** (chỉ một loại) | — | **SERVER TÍNH** (bỏ khỏi input; FE đang gán cứng `UNIT` `cost-center-form.tsx:61`) | `QĐ-52b` PD:188, `QĐ-86b` PD:218 | sửa form |
| `costCenterRename` | `name` | `cost-center-name.policy.ts` | Không | — | **GIỮ** | `QĐ-52b` | có |
| `costCenterDeactivate` | — | nghĩa vụ mở chặn | — | — | **GIỮ** | `QĐ-87d`(2) | — |

### 2.7 Tài khoản & xác thực — `app-users`, `auth`, `me`, `notifications`

Guard `app-users` = `SUPER_ADMIN` cả controller (`identity-access/accounts/app-users/app-users.controller.ts:83`) — khớp `QĐ-87a`,
FR-8.1 BRD:1222. `auth/*` công khai, `me/*`, `notifications/*` mọi tài khoản — khớp `QĐ-46a` PD:147, `QĐ-95d` PD:174.

| Operation | Trường | Vai biết? | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `appUserCreate` | `employeeId` | Có | `account-invitation.service.ts:58-71` | Không | — | **GIỮ** | FR-8.6 BRD:1254 | `super-admin/accounts/components/account-invite-dialog.tsx:54` |
| | `loginEmail` | Một phần — mặc định đã có `workEmail` | `rawEmail = input.loginEmail ?? current.workEmail` (`:72-73`); không kiểm tên miền công ty | **Có** (từ `workEmail`) | **Trung bình** nếu là email cá nhân | **ĐỔI** (chờ Q-V4-03) | FR-8.6, `QĐ-100ag` PD:504, US-01-01 EP-01:21 | có |
| | `role` | Có | default `EMPLOYEE` (`account-management.dto.ts:17`); `SUPER_ADMIN` từ chối ở policy (`account-administration.policy.ts:14-18`), `SPENDING_APPROVER` từ chối ở service (`account-invitation.service.ts:62`) | Không | — | **ĐỔI**: enum input chỉ `IT_ADMIN, FINANCE, MANAGER, EMPLOYEE` để OpenAPI/FE không mời chọn giá trị luôn bị từ chối | `QĐ-95b` PD:172 | **FE gửi `roles[]`** (`account-invite-dialog.tsx:54`, `GEN:app-users/createAppUserBodyDto.ts`) ⟹ BE strict từ chối |
| `appUserResendInvitation` | — | — | không tự gửi cho mình | — | — | **GIỮ** | `QĐ-39c` PD:139 | — |
| `appUserLock` / `appUserUnlock` | `reason` | Có | `min(1)` (`account-management.dto.ts:23-25`) | Không | Thấp | **GIỮ** (2) | `QĐ-81a` PD:159 | `account-action-dialog.tsx` |
| `appUserChangeRole` | `role` | Có | enum đủ 6 vai (`account-management.dto.ts:20`), `SUPER_ADMIN` bị từ chối | Không | — | **ĐỔI**: bỏ `SUPER_ADMIN` khỏi enum input | `QĐ-95c` PD:173, `QĐ-93e` PD:169 | `roles-subtab-view.tsx` |
| `authLogin` | `email`, `password` | Có | `auth/auth.dto.ts:9-12` | Không | Mật khẩu (bí mật) | **GIỮ** (2) | `QĐ-46a` | `features/auth/login-page.tsx` |
| `authRefresh`, `authLogout` | `refreshToken` | Có | `:35-37` | Không | Bí mật | **GIỮ** (2) | FR-8.11(g) | `auth-session.ts` |
| `authRequestPasswordReset` | `email` | Có | phản hồi giống hệt (`passwordResetRequestedSchema`) | Không | — | **GIỮ** | FR-8.11(c) | có |
| `authResetPassword` | `token`, `newPassword` | Có | `:52-56` | Không | Bí mật | **GIỮ** (2) | FR-8.11 | có |
| `authRedeemInvitation` | `token`, `password` | Có | `account-management.dto.ts:50-54` | Không | Bí mật | **GIỮ** (2) | FR-8.11(a) | `invitation-activation` |
| `meChangePassword` | `currentPassword`, `newPassword` | Có | `auth.dto.ts:60-64` | Không | Bí mật | **GIỮ** (2) | FR-8.11(d) | có |
| `notificationMarkAllRead`, `notificationMarkRead` | path `id` | Có | `notifications/inbox/inbox.dto.ts:14` | — | — | **GIỮ** | `QĐ-92b` | có |

### 2.8 Tổng hợp kết luận (trường/nhóm trường của 51 operation ghi)

| Kết luận | Số | Chi tiết |
| --- | --- | --- |
| **GIỮ** | 78 | 31/51 operation chỉ có trường GIỮ hoặc không body (không tính path `id`) |
| **ĐỔI** | 22 | G-GROUNDS ở 8 operation; `reason` bắt buộc ở DTO (4: đổi ngày cuối, hủy bàn giao, dời/hủy điều chuyển); `abrupt`→nhịp; `lastWorkingDay`; `decision`; `note` BM-09; `employeeId` chuyển đến; `jobTitle` (2); `loginEmail`; `role` (2) |
| **SERVER TÍNH** | 6 | `pendingTransferCancellation.reason` (2), `departedOn`, `reason` thu hồi, `targetDepartmentId` (chuyển đến), Cost Center `kind` |
| **BỎ** | 2 | `count` (thu hồi khi nghỉ), `newToolNote` |
| **CHUYỂN BƯỚC** | 1 | `markLeft.accountLock` (SA → IT Admin) |
| **THIẾU** (đề xuất thêm) | 5 | G-GROUNDS ở đổi ngày cuối + hủy bàn giao; `reason` rà soát điều chuyển; nhịp *chặn ngay* khi ghi từ BM-09; cột nghỉ việc lịch sử trong file nhân sự |

Query GET: `costCenterList.kind` (chỉ `UNIT`) — **BỎ** (`cost-center.dto.ts:22`). Các query khác (lọc trạng thái, phòng, trang) GIỮ.

**Đã khớp nghiệp vụ (ĐÚNG, ghi gọn):** hồ sơ/phòng ban không thu căn cứ (`QĐ-93f`); nghỉ dài và BM-09 không có lý do nghỉ/dữ liệu y tế
(`QĐ-80e`, `QĐ-76e`); BM-09 không nhận loại *đổi chức vụ* (`QĐ-87e`); mã BM-09 không được làm căn cứ; khóa/mở khóa bắt buộc lý do
(`QĐ-81a`); không chọn `SUPER_ADMIN`/`SPENDING_APPROVER` khi tạo tài khoản (`QĐ-95b`, kiểm ở server); tạo tài khoản trước ngày vào được
(không chặn theo `hireDate` — `QĐ-100ag`); Cost Center không nằm trong input hồ sơ; Finance chỉ thấy mã, tên, trạng thái trong Cost
Center (`cost-center.dto.ts:58-68`, `QĐ-41c`(1)); IT Admin đọc bản tối thiểu không căn cứ của điều chuyển/nghỉ dài/nghỉ việc, giới hạn
theo phòng được giao (`QĐ-87b`(4)).

## 3. Nghi vấn logic

| ID | Mức | Nghi vấn | Bằng chứng | Căn cứ | Đề xuất tối thiểu | Phụ thuộc |
| --- | --- | --- | --- | --- | --- | --- |
| NV-01 | **Cao** | `abrupt` mang nghĩa *đã rời ngay* chứ không phải nhịp *chặn ngay*: không ghi được ca *công ty cắt quyền trước ngày cuối* (ngày cuối tương lai), và khi ghi từ BM-09 nhịp bị **suy từ loại thông báo** chứ không do SA chọn | `offboarding.policy.ts:58-70` (`IN_FUTURE`), `offboarding-case-writer.service.ts:82-84`, `offboarding-notice.listener.ts:48` | `QĐ-96c` PD:340, EP-03:169 AC-32, QT:395-408 | Trường nhịp riêng (2.1, 2.4); `LEFT` ngay chỉ khi ngày cuối ≤ hôm nay | A4 (chặn đăng nhập theo nhịp) |
| NV-02 | **Cao** | Khóa tài khoản công ty và thu hồi chỉ mở khi hồ sơ `LEFT`; với nhịp *có ngày làm việc cuối*, nếu SA chậm chuyển *đã nghỉ việc* thì hạn ≤ 1 ngày làm việc sau ngày cuối không thể đạt; với *chặn ngay* chưa `LEFT` thì IT không ghi được khóa trong ngày. Cũng không thấy `identity-access` chặn đăng nhập theo ngày cuối (grep `lastWorkingDay`/`HANDING_OVER` chỉ có ở `identity-access/public/identity-access.types.ts:163`) | `offboarding.policy.ts:190-191, 244, 289` | `QĐ-96j`(1) PD:487 (*không phụ thuộc trạng thái*), EP-03:168-169 AC-31/32; lưu ý BRD BM-08 (FR-2.12) vẫn viết *tại đã nghỉ việc* — mâu thuẫn tài liệu | Mở khóa/thu hồi khi `pastLastDay` hoặc nhịp *chặn ngay*, không đợi `LEFT` | A4 |
| NV-03 | **Cao** | Đổi ngày làm việc cuối và hủy bàn giao **không** nhận căn cứ, trong khi dời/hủy điều chuyển có — sự kiện nhân sự bị sửa không có văn bản | `offboarding.dto.ts:38-44`, `offboarding.policy.ts:152-170` | `QĐ-48c` PD:329, `QĐ-93f`(2) PD:225, QT:376 | Thêm G-GROUNDS bắt buộc | — |
| NV-04 | **Cao** | `NEEDS_NEW_TOOL` là quyết định **của một dòng quyền** nhưng không giữ, không thu hồi, không tạo Request ⟹ dòng hết `PENDING`, seat cũ ở lại vô thời hạn (không có mặc định thu hồi nào bắt được). Đồng thời `STILL_NEEDED` chỉ chờ "Request mới của phòng", **không tự tạo** Request cấp thay thế; quá hạn chỉ nhắc, không áp mặc định thu hồi | `transfer-review.policy.ts:12,55-59,73-75`, `transfer-review-decision.service.ts:75`, `transfer-review-replacement.service.ts:14-21`, `transfer-review-overdue.service.ts:5-10` | FR-2.16(2)(4) BRD:544, `QĐ-94f` PD:355, `QĐ-99a`, QT:598,608-637; US-03-07 AC-5 EP-03:331 nói *quyền T1/T2/T3 đang xét vẫn cần quyết riêng* | Bỏ `NEEDS_NEW_TOOL` khỏi quyết định từng dòng; phần tự tạo Request và mặc định thu hồi thuộc A4 | A4, A2 |
| NV-05 | Trung bình | Thu hồi khi nghỉ bắt client gửi `count` và `reason` mà server tự tính được; `count` sai ⟹ `COUNT_MISMATCH`, FE gửi 0 khi chọn "tất cả" ⟹ luôn lỗi | `offboarding.policy.ts:246,256`, `offboarding-revocation.service.ts:128-130`, FE `offboarding-action-dialog.tsx:39` | SBF-18 (QT:478) | Bỏ `count`; lý do = nguồn suy ra | — |
| NV-06 | Trung bình | SA ghi được mục (1) BM-08 *khóa tài khoản công ty* qua `markLeft.accountLock` bằng tài khoản của chính SA — sai vai (SoD) | `offboarding-left.service.ts:44,47` | QT:467, `QĐ-77i`, `QĐ-87a` | Bỏ `accountLock` khỏi `MarkLeftBodyDto` | — |
| NV-07 | Trung bình | `departedOn` tạo ngày nghỉ thứ hai do client chọn trong `[ngày ghi, hôm nay]`; SA chuyển `LEFT` được **trước** ngày làm việc cuối mà không đổi ngày cuối ⟹ `left_on` < `last_working_day`, hai mốc nghỉ khác nhau cho cùng người | `offboarding.policy.ts:174-187`, `offboarding-left.service.ts:41-45` | `QĐ-48a` PD:327 (*đã qua ngày làm việc cuối thì chỉ hủy hoặc ghi nghỉ việc*), FR-8.9 BRD:1261 | Q-V4-06 | A4 |
| NV-08 | Trung bình | DTO khai *tùy chọn* nhưng luật bắt buộc (G-GROUNDS ở 8 operation, `reason` ở 4, `lastWorkingDay`) — OpenAPI/FE hiểu sai, lỗi chỉ hiện ở 422 nghiệp vụ; controller ép `?? ''` để vào luật | `transfers.controller.ts:238,275`, `offboarding.controller.ts:246,283` | API skill *validate at boundary* | Bắt buộc ở schema, giữ mã lỗi nghiệp vụ cũ cho tương thích | — |
| NV-09 | Trung bình | Thông báo *chuyển đến*: trưởng phòng nhận phải gửi `employeeId` của người **ngoài** phòng mình nhưng không có API nào cho trưởng phòng tra người ngoài phòng; `targetDepartmentId` thừa (phải bằng phòng người gửi) | `notice.policy.ts:55-58`; `docs/generated/routes.md` không có tra cứu nhân viên cho `MANAGER` ngoài `/departments/{id}/employees` | `QĐ-76d`(1), `QĐ-41c`(2) | Q-V4-04 | — |
| NV-10 | Thấp | `successor` gửi cho người không là trưởng phòng bị bỏ qua lặng lẽ (không lỗi, không cảnh báo) | `transfer-guard.service.ts:71`, `transfer.policy.ts:73` | API skill (không nuốt input) | Trả 422 `SUCCESSOR_NOT_EXPECTED` hoặc cảnh báo | — |
| NV-11 | Thấp | Giới hạn độ dài lệch DTO ↔ luật ↔ FE: `jobTitle` 1000/255; FE `reason` 2000 vs BE 1000; FE `verificationReference` 2000 vs BE 300 | `employee.dto.ts:60` vs `employee-placement.policy.ts:11`; FE `offboarding-panel.tsx:97`, `notice-action-form.tsx:40` | — | Đồng bộ một giới hạn | — |
| NV-12 | **Cao (FE)** | Client FE sinh từ OpenAPI **cũ**: còn `hrBasis` bắt buộc ở tạo/sửa phòng, tạo/sửa hồ sơ, xác nhận import; còn `roles[]` khi tạo tài khoản; pattern mã phòng cũ. BE strict ⟹ các form này bị từ chối với BE `3e4553b9` | `GEN:departments/createDepartmentBodyDto.ts`, `GEN:employees/createEmployeeBodyDto.ts:39`, `GEN:employee-imports/confirmImportBodyDto.ts`, `GEN:app-users/createAppUserBodyDto.ts`; FE gửi tại `department-form.tsx:46`, `department-action-form.tsx:59`, `employee-panel.tsx:146`, `import-panel.tsx:281`, `account-invite-dialog.tsx:54` | `QĐ-93f`, `QĐ-95a` | Sinh lại client sau khi chốt DTO; ngoài phạm vi sửa BE nhưng chặn demo | FE |

## 4. Response lộ dữ liệu vượt phạm vi vai

| ID | Operation | Vai đọc | Trường | Vì sao vượt | Căn cứ | Đề xuất |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | `personnelNoticeList`, `personnelNoticeGet` | IT Admin (bản "tối thiểu") | `note` (chữ tự do của trưởng phòng), `sender`, `rejectReason`, thông báo **chưa xác minh** mọi loại | BM-09 chỉ cho *trưởng phòng gửi, Super Admin* xem; IT Admin chỉ nhận cảnh báo ưu tiên cao khi *nghỉ đột ngột* và chỉ *loại sự kiện + ngày hiệu lực* | BM-09 BRD:1456, FR-2.14 BRD:534, `QĐ-76d`(4) PD:205; `notice.mapper.ts:44`, `notice.controller.ts:117,146` | IT Admin chỉ đọc thông báo `ABRUPT_DEPARTURE` với `employee`, `kind`, `proposedOn`; bỏ `note`/`rejectReason`/`sender` |
| R-02 | `offboardingCaseGet`/`List` | IT Admin | `priorWorkState` (`ON_LONG_LEAVE` lộ người đó từng nghỉ dài) | IT chỉ cần thông tin tối thiểu cho tác vụ kỹ thuật | `QĐ-87b`(4) PD:220; `offboarding.mapper.ts:109` (trả cho mọi `access`) | `null` ở bản tối thiểu |
| R-03 | `departmentMemberList` | Trưởng phòng | `workState` gồm `HANDING_OVER`, `ON_LONG_LEAVE` | `QĐ-41c`(2) liệt kê *không trả … cờ bàn giao, ngày nghỉ việc*; tuy trưởng phòng đã biết qua bàn giao — cần chốt câu chữ | PD:182; `department.dto.ts:121-134` | Kiểm lại ở spec: trả `status` lưu trữ + chỉ `WORKING/ON_LONG_LEAVE`, hoặc sửa câu `QĐ-41c`(2) |
| R-04 | `longLeaveList` | IT Admin | `overdueReturn`, lọc `overdueReturn=true` | Quá hạn quay lại chỉ nhắc Super Admin (việc nhân sự) | `QĐ-80e` PD:214; `long-leaves.controller.ts:116-121` | Ẩn `overdueReturn` và bộ lọc với IT Admin |
| R-05 | `superAdminWatchGet` | IT Admin | `holder.workState`, `holder.lastWorkingDay` của người giữ vai Super Admin | Giám sát vận hành (FR-8.10(e)) không nói IT Admin là người nhận; dữ liệu nhân sự của SA | `personnel/role-duties/role-duties.dto.ts:17-31` | Thấp — chốt người nhận ở spec; có thể chỉ trả `status` + `reasons` |
| R-06 | `meGet`, `appUserGet`/`List` | mọi vai / SA | `roles: array` | Không lộ dữ liệu, nhưng hợp đồng sai mô hình một vai | `QĐ-95a` PD:171; `access/me.dto.ts:18` | Thêm `role` đơn, giữ `roles` (≤ 1 phần tử) một thời gian cho tương thích |

## 5. Câu hỏi cho Owner

Ghi chú pháp lý: BRD 7.7.1 (BRD:1602-1616) ghi **Nghị định 13/2023/NĐ-CP hết hiệu lực từ 01/01/2026**; văn bản áp dụng là **Luật Bảo vệ
dữ liệu cá nhân 91/2025/QH15** và **Nghị định 356/2025/NĐ-CP**. Nguyên tắc *tối thiểu hóa dữ liệu* được BRD 7.7.4 đối chiếu với luật
này; số điều cụ thể của nguyên tắc tôi **chưa kiểm lại** tại Công báo. Điều 25 khoản 2 điểm c (xóa dữ liệu người lao động khi chấm dứt
hợp đồng) đã được BRD 7.5 trích nguyên văn.

### Q-V4-01 — Có thu *lý do nghỉ việc* khi Super Admin ghi sự kiện không?

- **Bối cảnh:** `QT:370` (MF-2 2.2) nói SA ghi *lý do nghỉ (chỉ để ghi nhận, không quyết nhịp)*; nhưng BM-04 (BRD:1451) không có
  trường này, BM-09 và nghỉ dài cấm lý do (`QĐ-76e`, `QĐ-80e`), và `QĐ-96c` chia nhịp *không theo lý do nghỉ*. BE hiện **không** thu
  (`offboarding.dto.ts:28-36` strict). Ví dụ: `E1` bị chấm dứt vì vi phạm kỷ luật — lý do này nằm trong quyết định nhân sự (đã lưu số
  quyết định ở G-GROUNDS), không cần chép lại.
- **Thực tế:** hệ thống IGA/ITAM (Okta Lifecycle, SailPoint — kiến thức chung, không trích được văn bản cụ thể) chỉ nhận *ngày chấm dứt*
  và cờ *chấm dứt ngay*; mã lý do nghỉ ở HRIS. NIST SP 800-53 PS-4 (BRD dẫn) đòi vô hiệu truy cập kịp thời, không đòi lý do.
- **Phương án:** (A) không thu, sửa câu QT:370 — dữ liệu ít nhất, không đổi BE; (B) thu enum thô `VOLUNTARY / COMPANY_ENDED / OTHER`
  chỉ SA đọc — thêm cột, có thể suy ra *bị cho nghỉ* (nhạy cảm với người lao động); (C) chữ tự do — rủi ro cao nhất.
- **Khuyến nghị: A.** Mục phụ thuộc: 2.1 dòng *lý do nghỉ*.

### Q-V4-02 — Giữ trường `note` của BM-09 ở dạng nào?

- **Bối cảnh:** `QĐ-76a` (PD:202) cho *căn cứ hoặc ghi chú ngắn*; BE nhận chữ tự do ≤ 500 (`notice.dto.ts:34`) và trả cả cho IT Admin
  (R-01). Ví dụ trưởng phòng gõ "nghỉ vì sinh con, xin nghỉ 6 tháng" — dữ liệu sức khỏe/đời tư lọt vào hệ thống, trái `QĐ-76e`.
- **Phương án:** (A) giữ như cũ — FE dễ, rủi ro dữ liệu nhạy cảm; (B) giữ nhưng đổi nghĩa thành *giấy tờ người gửi biết* (tham chiếu,
  ≤ 200), FE hiện cảnh báo "không ghi lý do nghỉ, sức khỏe", chỉ SA đọc; (C) bỏ hẳn — mất kênh báo "đã có đơn số…" cho SA đối chiếu.
- **Khuyến nghị: B.** Phụ thuộc: 2.4 `note`, R-01.

### Q-V4-03 — `loginEmail` có được khác `workEmail` (ví dụ email cá nhân của người mới) không?

- **Bối cảnh:** BE dùng `loginEmail ?? workEmail`, không kiểm tên miền (`account-invitation.service.ts:72-76`). `QĐ-100ag` cho SA gửi
  lời mời **trước ngày vào**; nếu hộp thư công ty chưa có, SA có thể nhập email cá nhân. Quyền trả phí phải trên tài khoản công ty
  (FR-2.9), và sửa `workEmail` sau đó không đổi email đăng nhập (FR-8.6) ⟹ tài khoản có thể mãi gắn email cá nhân.
- **Thực tế (kiến thức chung):** cổng *pre-boarding* của HRIS hay dùng email cá nhân; công cụ nội bộ IT thường chỉ dùng danh tính công ty
  để khóa được khi nghỉ việc.
- **Phương án:** (A) bỏ `loginEmail` khỏi input, luôn = `workEmail`, thiếu thì từ chối — đơn giản, buộc tạo hộp thư công ty trước lời
  mời; (B) giữ `loginEmail` tùy chọn nhưng bắt buộc thuộc tên miền công ty (tham số tổ chức mới); (C) giữ tự do như nay.
- **Khuyến nghị: A** (B nếu Owner muốn tách địa chỉ đăng nhập khỏi email công việc). Phụ thuộc: 2.7 `loginEmail`.

### Q-V4-04 — Trưởng phòng phòng nhận xác định người *chuyển đến* bằng gì?

- **Bối cảnh:** `QĐ-76d`(1) cho trưởng phòng nhận gửi *chuyển đến*, nhưng `QĐ-41c`(2) không cho trưởng phòng đọc người ngoài phòng ⟹
  không lấy được `employeeId` (NV-09). Ví dụ `H2` (P-FIN) biết `E1` (mã `NV-0012`) sắp chuyển từ P-DES theo quyết định nhân sự.
- **Phương án:** (A) body nhận `employeeCode` (khớp chính xác) cho `DEPARTMENT_TRANSFER_IN`, server tra và chỉ trả mã + họ tên trong
  kết quả — không mở danh bạ; (B) thêm API tra cứu chính xác theo mã cho `MANAGER` — mở thêm bề mặt đọc; (C) giữ `employeeId`, FE
  không có cách lấy — tính năng chết.
- **Khuyến nghị: A**, kèm `targetDepartmentId` do server tính. Phụ thuộc: 2.4 `employeeId`, `targetDepartmentId`.

### Q-V4-05 — Bỏ hẳn *Cần công cụ mới* (`NEEDS_NEW_TOOL` + `newToolNote`) khỏi rà soát sau điều chuyển?

- **Bối cảnh:** US-03-07 AC-5 (EP-03:331) cho trưởng phòng *ghi nhu cầu công cụ mới* trong rà soát; BRD FR-2.16(2) và QT:598 nói
  *cần công cụ mới ⟹ Request mới qua MF-1, không thuộc rà soát*. BE cài thành quyết định của **một dòng quyền** làm seat cũ treo (NV-04).
  Với `QĐ-100t`, người chuyển tự gửi Request cho mình.
- **Phương án:** (A) bỏ cả hai khỏi API, sửa US-03-07 AC-5 — gọn, khớp BRD; (B) chuyển thành ghi chú **cấp rà soát** (không phải dòng),
  không ảnh hưởng quyết định từng quyền; (C) giữ như nay — sai luật mặc định thu hồi.
- **Khuyến nghị: A.** Phụ thuộc: 2.2 `decision`, `newToolNote`; migration dữ liệu dòng đang `NEEDS_NEW_TOOL` (về `PENDING`).

### Q-V4-06 — *Ngày nghỉ việc* chính thức là ngày nào (`departedOn`)?

- **Bối cảnh:** FR-2.1 (BRD:461) có *ngày vào/nghỉ*. BE lưu `last_working_day` (theo căn cứ) và `left_on` (= `departedOn` client
  chọn trong `[ngày ghi, hôm nay]`, mặc định hôm nay). SA có thể chuyển `LEFT` trước ngày cuối (NV-07). Ví dụ ngày cuối 30/09, SA bấm
  *đã nghỉ việc* ngày 02/10 ⟹ `left_on = 02/10` hay 30/09?
- **Phương án:** (A) bỏ `departedOn`; `left_on` = ngày làm việc cuối; chuyển `LEFT` trước ngày cuối thì phải đổi ngày cuối hoặc dùng nhịp
  *chặn ngay* — một mốc duy nhất cho báo cáo, xóa dữ liệu 30 ngày (FR-10.6); (B) giữ `departedOn` nhưng bắt buộc ≥ ngày cuối; (C) giữ
  như nay.
- **Khuyến nghị: A.** Phụ thuộc: 2.1 `departedOn`, NV-07.

## 6. Rủi ro / ghi chú cho pha spec

- **Migration:** `offboarding_cases.abrupt` → cột nhịp (map `true` → `BLOCK_NOW`); `grounds_type` (5 bảng) → enum/check 3 loại, cần
  ánh xạ chuỗi cũ trong seed/demo; `transfer_review_items.decision` bỏ `NEEDS_NEW_TOOL` (dữ liệu cũ về `PENDING`), cột `new_tool_note`
  thôi dùng; thêm cột căn cứ cho thay đổi hồ sơ nghỉ việc (`offboarding_case_changes` đã có `reason`, chưa có `grounds_*`).
- **Tương thích HTTP:** bắt buộc hóa trường (G-GROUNDS, `reason`) đổi lỗi từ 422 mã nghiệp vụ sang 422 `VALIDATION_ERROR` — giữ mã
  nghiệp vụ cũ trong ví dụ OpenAPI hoặc ghi vào `API-Integration/changes`. Bỏ `count`/`kind`/`accountLock` là breaking cho client cũ
  (BE strict) — làm cùng đợt sinh lại FE (NV-12).
- **FE:** client sinh đang cũ hơn BE (`hrBasis`, `roles[]`) — sinh lại là điều kiện trước demo; màn trưởng phòng (rà soát điều chuyển,
  gửi BM-09) chưa nối API (mock). Tài liệu `Docs/Figma UI-UX/API-Integration/reference/personnel-offboarding-notices.md:9,170` mô tả
  `abrupt` — cập nhật theo trường nhịp mới.
- **Test bị ảnh hưởng:** HTTP/unit quanh `COUNT_MISMATCH`, `NEEDS_NEW_TOOL`, `abrupt` + `IN_FUTURE`, `DEPARTED_ON_INVALID`,
  `markLeft` kèm `accountLock`, `COST_CENTER.KIND_NOT_SUPPORTED`, tạo tài khoản với `role: SUPER_ADMIN`.
- **Phụ thuộc A4-WORKFORCE:** NV-01, NV-02, NV-04, NV-07 và cột nghỉ việc lịch sử là lệch nghiệp vụ; báo cáo này chỉ chốt phần trường.
  Không đụng `QĐ-100l`/`QĐ-100ah` (chờ mentor).

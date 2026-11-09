# V3-CATALOG-API — Việc 2: rà trường API catalog + licensing

> Agent V3-CATALOG-API, 05/11/2026. Pin: BE `3e4553b9` (branch `feat/qd96-100-alignment`), Docs `3d73a7f`. Read-only: không chạy test, không đổi trạng thái git, chỉ ghi file này.

## 1. Skill, phạm vi, operation đã rà

**Skill đã đọc/dùng (Skill Preflight):**

| Skill | Loại | Mục đích |
| --- | --- | --- |
| `code-review-and-quality` | process (review 5 trục) | Đọc từng DTO → controller → service → policy theo trục đúng/sai, kiến trúc, bảo mật; phân mức nghiêm trọng |
| `api-and-interface-design` | domain | Chia input/output, xét trường client gửi mà server tự suy ra được, tính idempotency, hình dạng enum/union |
| `security-and-hardening` | domain | Dữ liệu nhạy cảm (license key, định danh tài khoản, email), tối thiểu hóa dữ liệu, phân quyền theo vai |
| `superpowers:verification-before-completion` | verification | Mỗi kết luận phải có `file:dòng` đã đọc trong lượt này; không khẳng định điều chưa kiểm |

Không có skill riêng cho "rà trường API theo nghiệp vụ". `api-and-interface-design` + `code-review-and-quality` là phần gần nhất.

**Quy ước đường dẫn.** `cat/` = `src/modules/catalog/`, `lic/` = `src/modules/licensing/`, `imp/` = `src/modules/data-import/`.
- **PD** = `Docs/Decisions/project-decisions.md`.
- **BRD** = `Docs/Requiments/BRD - HỆ THỐNG QUẢN TRỊ ... .md`.
- **QT** = `Docs/Requiments/Quy trình và chính sách theo main flow.md`.
- **EP11** = `Docs/BE-UserStory/epics/EP-11.md`.
- FE: `F1`…`F17` là các file dưới `Code/FE-web/app/features/dashboard/`, xem bảng chỉ mục ở mục 1.1.

**Đã đọc:**
- tracker `README.md`; `inventory.md` của 18 tag được giao;
- README module `catalog`, `licensing`;
- mọi DTO trong `cat/**` và `lic/**`, cùng `imp/seat-baseline-import/*.dto.ts`, `seat-baseline-import.types.ts`, `seat-baseline-rows.policy.ts`;
- service/policy theo từng trường ghi ở các bảng dưới;
- PD mục 3.4, 3.5 (một phần), 3.8 (một phần), 3.9, 3.10, 3.11; BRD 5.1 (FR-1.1 → FR-1.12), 5.2 (FR-2.3, 2.4, 2.10, 2.12, 2.15);
- QT 1.9, 1.10, MF-5 5.5 → 5.10, bảng SBF (SBF-03, 03a, 12, 12a, 16, 17, 18); EP11 (US-11-02 `RETIRED`, US-11-05, US-11-06);
- `Docs/Figma UI-UX/API-Integration/roles/spending-approver.md`.

**Chưa đọc:**
- `prisma/models/*` (chỉ mở model `Contract`);
- toàn văn US EP-03/EP-04/EP-07;
- sơ đồ `MF-5-…md` và `SBF-18-…md` (chỉ đọc bản tóm tắt trong QT);
- các file `*.repo.ts` (chỉ mở khi cần).

Phần FE được rà bằng một Explore agent, đọc `Code/FE-web/app/**` và client orval `app/shared/api/generated/`. Mục 1.1 tóm tắt kết quả.

**Operation đã rà:** 95 operation của 18 tag, trong đó **54 operation ghi**, tất cả đều đã rà. 41 GET chỉ ghi những cái có query/response đáng chú ý (mục 4).

| Tag | Ghi | Operation ghi |
| --- | --- | --- |
| vendor-dictionary | 6 | `vendorGroupCreate`, `vendorGroupUpdate`, `vendorServiceLineCreate`, `vendorServiceLineUpdate`, `vendorNormalize`, `vendorProposalResolve` |
| applications | 4 | `applicationCreate`, `applicationUpdate`, `applicationRetirementConfirm`, `applicationRetire` |
| functional-groups | 2 | `functionalGroupCreate`, `functionalGroupUpdate` |
| plans | 3 | `planCreate`, `planUpdate`, `planWorkspaceProfileSet` |
| vendors | 1 | `vendorTaxProfileSet` |
| subscriptions | 3 | `subscriptionCreate`, `subscriptionUpdate`, `subscriptionComplete` |
| plan-terms | 2 | `planTermsSet`, `planTermOpinionRecord` |
| contracts | 1 | `contractCreate` |
| documents | 4 | `documentCreate`, `documentComplete`, `documentAttach`, `documentLink` |
| license-assignments | 1 | `licenseAssignmentChangeResponsible` |
| seat-baseline | 1 | `seatBaselineClose` |
| seat-baseline-imports | 3 | `seatBaselineImportUpload`, `seatBaselineImportConfirm`, `seatBaselineImportCancel` |
| provisioning-tasks | 10 | `provisioningTaskGrant`, `…Claim`, `…Complete`, `…ReportFailure`, `…Retry`, `…HandOff`, `…CloseFailed`, `…Cancel`, `…CompleteRevocation`, `…RecordAccessCut` |
| license-keys | 2 | `licenseKeyImport`, `licenseKeyReveal` |
| handover-duties | 1 | `handoverDutyConfirm` |
| assignment-expiry | 1 | `assignmentExpiryStartRevocation` |
| saas-issues | 5 | `saasIssueSubmit`, `saasIssueAddMessage`, `saasIssueReopen`, `saasIssueTransition`, `saasIssueMarkDuplicate` |
| subscription-renewals | 3 | `subscriptionRenewalPropose`, `subscriptionRenewalDecide`, `subscriptionRenewalRecordOutcome` |

### 1.1 FE: chỉ mục file và hiện trạng gọi API

FE dùng client orval sinh từ OpenAPI. Mọi write API đang gọi đều nằm ở `it-admin`, trừ `vendorTaxProfileSet` ở `finance`. Thư mục `employee` và `manager` **không** gọi client sinh nào, chỉ dùng mock. Client sinh **không có** `vendor-dictionary/*` và `subscription-renewals/*`, tức client cũ hơn BE ở hai nhóm này.

| Tag | Màn hình |
| --- | --- |
| F1 | `it-admin/dept-catalog/components/catalog-application-form.tsx` |
| F2 | `…/catalog-application-detail.tsx` |
| F3 | `…/catalog-purchase-form.tsx` |
| F4 | `…/catalog-plan-editor.tsx` |
| F5 | `…/catalog-subscription-editor.tsx` |
| F6 | `…/catalog-seat-baseline.tsx` |
| F7 | `…/catalog-seat-preview.tsx` |
| F8 | `…/catalog-license-keys.tsx` |
| F9 | `finance/vendor-tax/components/vendor-tax-form.tsx` |
| F10 | `it-admin/provisioning/components/provisioning-grant-queue.tsx` |
| F11 | `…/provisioning-action-dialog.tsx` (+ `task-actions.ts`) |
| F12 | `…/provisioning-expiry-queue.tsx` |
| F13 | `it-admin/offboarding/components/offboarding-service-duties.tsx` |
| F14 | `…/offboarding-handover-duties.tsx` |
| F15 | `it-admin/saas-issues/components/issue-detail.tsx` |
| F16 | `…/issue-transition-dialog.tsx` |
| F17 | `employee/my-software/views/employee-software-detail-view.tsx` |

**FE chưa gọi:**
- toàn bộ `vendor-dictionary`;
- `applicationRetirementConfirm`, `functionalGroup*`;
- `planWorkspaceProfileSet`, `planTerms*`;
- `contractCreate`, `document*`;
- `saasIssueSubmit` (F17:253-266: nút "Gửi ticket hỗ trợ" bị disable), `saasIssueReopen`;
- toàn bộ `subscriptionRenewal*` (tab "Gia hạn" là `ItUnavailableView`).

---

## 2. Bảng trường theo operation ghi

Các cột: **Trường** · **Vai có biết/trách nhiệm** · **Logic dùng (`file:dòng`)** · **Server suy ra được?** · **Nhạy cảm** · **Kết luận** · **Căn cứ** · **FE**.

### 2.1 vendor-dictionary — IT Admin (guard: IT Admin). Khởi tạo danh mục, US-04-07, `QĐ-38`, `QĐ-39e`

`vendorGroupCreate`/`vendorGroupUpdate` (`cat/vendor-dictionary/vendor-dictionary.dto.ts:13-14`); `vendorServiceLineCreate`/`Update` (`:15-24`); `vendorNormalize` (`:25`); `vendorProposalResolve` (`:29`).

| Trường | Vai | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `name` (group) | Có: tên công ty vendor | lưu | Không | Không | GIỮ | `QĐ-38` (PD:235) | Chưa gọi |
| `brandDomains` | Có | lưu; khớp tên miền ở `vendor-matcher.policy.ts` | Không | Không | GIỮ | `QĐ-38` | Chưa gọi |
| `name`/`domains`/`patterns` (service line) | Có: dòng dịch vụ tính tiền riêng | lưu; `patterns` dùng khớp mô tả sao kê (`vendor-matcher.policy.ts:11,60`) | Không | Không | GIỮ (×3, cả create lẫn update) | `QĐ-38`, `QĐ-39e` | Chưa gọi |
| `kind`/`value` (normalize) | Có | POST chỉ đọc, không ghi (`vendor-recognition.service.ts:26`) | Không | Mô tả giao dịch ngân hàng: không log | GIỮ | `QĐ-38` | Chưa gọi |
| `outcome` + `serviceLineId` (resolve) | Có | `ACCEPTED` ⟺ có `serviceLineId` (`vendor-proposal.service.ts:55-61`) | `outcome` suy được từ `serviceLineId`, nhưng tường minh vẫn tốt hơn | Không | GIỮ | `QĐ-38` | Chưa gọi |

Không có nghi vấn.

### 2.2 applications — IT Admin. FR-1.1, US-04-01/06

**`applicationCreate`** (`cat/catalog-entry/application.dto.ts:17-33`) · **`applicationUpdate`** (`:35-50`)

| Trường | Vai | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | Có | lưu, tên chuẩn hóa duy nhất | Không | Không | GIỮ | FR-1.1 (BRD:406) | F1 "Tên ứng dụng" |
| `kind` (create) | Có | 3 loại, chặn vendor với INTERNAL (`application.policy.ts:78-97`) | Không | Không | GIỮ | `QĐ-82n`, FR-1.1 | F1 "Loại ứng dụng" |
| `vendorName` ⟂ `dictionaryServiceLineId` | Có: chọn **một trong hai** | `vendorSourceOf` (`application.policy.ts:78-97`): có cả hai ⟹ lỗi; từ dòng từ điển ⟹ vendor = nhóm của dòng | Không | Không | GIỮ (hai trường loại trừ nhau) | `QĐ-39e` (PD:236) | F1 chỉ gửi `vendorName`, **không có ô chọn mục từ điển** |
| `domains` | Có | lưu, kiểm tên miền | Không | Không | GIỮ | FR-1.1 | F1 "Tên miền" |
| `dataSensitivity` | Có | lưu; dùng phân tầng rủi ro `QĐ-32c` | Không | Không | GIỮ | FR-1.1 | F1, mặc định MEDIUM |
| `businessOwnerEmployeeId` | Có | lưu, kiểm nhân viên đang làm | Không | id nội bộ | GIỮ | FR-1.1, US-04-06 | F1 ô **UUID thô** "ID nhân viên phụ trách nghiệp vụ": cần picker |
| `communication.personToPersonMessaging`/`callsOrMeetings`/`mailbox` | Có | suy ra cờ `isCommunicationService` (`application.policy.ts:26-28`) | Cờ cuối do server tính, ba câu trả lời do IT nhập: đúng | Không | GIỮ (×3) | FR-1.8 (BRD:328), `QĐ-01` | F1 "Chức năng liên lạc" |
| `communication.note` | Có | lưu | Không | Không | GIỮ | FR-1.8 | F1 không gửi; update gửi lại cả object thiếu `note` nhưng merge từng phần (`application-state.policy.ts:129-140`) nên không mất |
| `functionalGroupId` | Có | lưu, tùy chọn | Không | Không | GIỮ | FR-1.1, `QĐ-39e` (LR-06) | F1 không có ô |

**`applicationRetirementConfirm`** (`cat/application-retirement/application-retirement.dto.ts:10`). IT Admin ghi xác nhận của Business Owner (US-04-01 AC-8, `QĐ-62n`).

| Trường | Vai | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `businessOwnerEmployeeId` | IT biết, nhưng giá trị luôn phải bằng BO hiện tại | so với `application.businessOwnerEmployeeId` (`application-retirement.service.ts:90-96`, `application-retirement.policy.ts:35`) | **Có**: server đọc BO hiện tại | id nội bộ | SERVER TÍNH (bỏ khỏi input; nếu muốn chống ghi đè đồng thời thì giữ tùy chọn làm guard) | `QĐ-62n` (PD:248) | Chưa gọi; F2 hint "Cần xác nhận của người phụ trách nghiệp vụ" nhưng không có màn hình ghi |
| `note` | Có | lưu văn bản xác nhận | Không | Không | GIỮ | US-04-01 AC-8 | Chưa gọi |

`applicationRetire`: không body, GIỮ.

### 2.3 functional-groups — IT Admin. `QĐ-39e`, FR-1.1

`functionalGroupCreate` (`cat/functional-group/functional-group.dto.ts:8`): `name` GIỮ. `functionalGroupUpdate` (`:9-12`): `name`, `status` GIỮ. FE chưa gọi.

### 2.4 plans — IT Admin. FR-1.2, FR-1.9, `QĐ-54a`

**`planCreate`** (`cat/plan/plan.dto.ts:20-31`) · **`planUpdate`** (`:32-41`)

| Trường | Vai | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `applicationId` | Có | khóa ứng dụng `FOR SHARE`, xét kind | Không | Không | GIỮ | FR-1.2 | F3 tự lấy từ trang |
| `name` | Có | lưu, duy nhất | Không | Không | GIỮ | FR-1.2 | F3 "Tên gói" |
| `provisioningType` | Có | `assertPlanShape` (`plan.policy.ts:57-73`): K3 bị chặn, INTERNAL ⟺ K5; đổi khi đang dùng bị chặn (trigger, `plan.service.ts:210-214`) | Không | Không | GIỮ | `QĐ-54a` (PD:243), FR-1.9 | F3 lọc K theo kind, ẩn K3; F4 không cho sửa |
| `pricingModel` | Có | bắt buộc với K1/K2/K4, cấm với K5 (`plan.policy.ts:66-70`) | Không | Không | GIỮ (OpenAPI cần ghi "bắt buộc trừ K5"; BRD FR-1.2 nói *bắt buộc*) | FR-1.2 (BRD:407) | F3 "Mô hình tính giá" |
| `controlLevel` | Có | bắt buộc trừ K5 (`plan.policy.ts:70`) | Có giá trị mặc định theo K (bảng FR-1.9) để FE điền sẵn, IT vẫn quyết | Không | GIỮ (FE điền sẵn mặc định theo K) | `QĐ-54a`, FR-1.9 | F3 "Mức kiểm soát" |
| `revocationNote` | Có | bắt buộc khi `dataLossOnRemoval` (`plan.policy.ts:72`) | Không | Không | GIỮ | FR-1.9: "đầu vào bắt buộc của bàn giao" | F3 **không gửi lúc tạo**, chỉ F4 sửa được, nên gói tạo mới luôn thiếu lưu ý |
| `dataLossOnRemoval` | Có | quyết bàn giao bắt buộc (`lic/handover/handover-confirmer.policy.ts:56`) | Không | Không | GIỮ | `QĐ-66p`, FR-2.12 | F3 không gửi, F4 "Thu hồi làm mất dữ liệu" |
| `sharingPolicy` | Có | chỉ lưu, không dùng trong luật nào (đúng `QĐ-75f`) | Không | Không | **ĐỔI**: chuyển vào `planTermsSet` (điểm (1) checklist sáu điểm của FR-1.10). Hiện 5 điểm nằm ở `plan_terms`, riêng điểm (1) nằm ở `plans` | FR-1.10 (BRD:429), bảng "Điều khoản" BRD 5.1, `QĐ-75f` (PD:254) | **Không màn hình nào gửi** (cả create lẫn update) |

**`planWorkspaceProfileSet`** (`cat/plan/plan.dto.ts:42-61`). Chỉ cho K2 (`plan-workspace.service.ts:91`).

| Trường | Vai | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ |
| --- | --- | --- | --- | --- | --- | --- |
| `primaryOwnerEmployeeId`, `members[].employeeId`, `members[].role` | Có | mọi người phải là IT Admin còn dùng được (`plan-workspace.service.ts:99-104`, `:189`) | Không | id nội bộ | GIỮ (×3) | `QĐ-54c` (owner/admin = danh tính công ty của từng IT Admin) |
| `ownerLimit`, `adminLimit`, `ownerTransferProcedure` | Có | lưu, kiểm giới hạn (`plan.policy.ts:88`) | Không | Không | GIỮ (×3) | FR-1.7/SBF-16 |
| `emergencyAccount.identity`/`occupiesSeat`/`holderEmployeeId`/`lastReviewedOn` | Có | lưu; dùng ở đối soát (FR-2.6: tài khoản khẩn cấp đã khai không sinh sai lệch) | Không | Danh tính quản trị, không phải secret; mật khẩu không nhận (`:60`) | GIỮ (×4) | `QĐ-54c`, FR-2.6 |

FE chưa gọi.

### 2.5 vendors — **Finance** (guard: Finance). `QĐ-55a`, `QĐ-60b`

**`vendorTaxProfileSet`** (`cat/vendor/vendor.dto.ts:13-22`)

| Trường | Vai | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `group` | Có | mặc định `T2` khi không gửi (`finance/tax-profile/tax-profile.service.ts:95`) | Mặc định T2 đúng `QĐ-60b` | Không | GIỮ | `QĐ-60b` (PD:469) | F9 "Nhóm thuế" |
| `lines[].taxType` | Có | chữ tự do, lưu | Không | Không | **ĐỔI** (đề xuất mã đóng, ví dụ `VAT`, `CIT_WITHHOLDING`, `OTHER` + nhãn), xem **Q-06** | `QĐ-55a` (PD:466) | F9 label "Loại thuế" nhưng placeholder "Mã loại thuế": FE cũng chưa rõ |
| `lines[].ratePercent` | Có | chuỗi thập phân | Không | Không | GIỮ | `QĐ-60b` | F9 "Thuế suất (%)" |
| `lines[].deductible` | Có | cờ mặc định, Finance sửa theo chứng từ | Không | Không | GIỮ | `QĐ-60a` | F9 "Được khấu trừ" |

### 2.6 subscriptions — IT Admin. FR-1.3, FR-1.6, `QĐ-89a`, `QĐ-89e`

**`subscriptionCreate`** (`cat/subscription/subscription.dto.ts:19-34`) · **`subscriptionUpdate`** (`:36-47`)

| Trường | Vai | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `planId` | Có | khóa plan, K5 không có thuê bao (`subscription.policy.ts:118`) | Không | Không | GIỮ | FR-1.3 | F3 tự điền |
| `ownerDepartmentId` (create) | Chỉ ở **khởi tạo** IT biết theo hợp đồng (`QĐ-89e`). Sau khởi tạo, phòng sở hữu = phòng có Request đã duyệt (`QĐ-89a(1)`) | chỉ kiểm phòng active (`subscription.service.ts:144-145`), không nối Request | Có, sau khởi tạo: suy từ Request | Không | **ĐỔI**, xem **Q-01** | `QĐ-89a` (PD:258), `QĐ-89e` (PD:260) | F3 ô **UUID thô** "ID phòng ban sở hữu" |
| `kind` | Có | TERM/PERPETUAL; PERPETUAL không có kỳ (`subscription.policy.ts:119-131`) | Không | Không | GIỮ | FR-1.3, `QĐ-49c` | F3 "Loại khoản mua" |
| `purchasedQuantity` | Có (khai số đã mua) | update: chỉ chặn dưới số ghế đang chiếm (`subscription-change.service.ts:80`) và chặn tăng khi thiếu Cost Center (`:104`, `subscription-obligation.service.ts:17-26`). **Không** nối Request đã duyệt, **không** cần trưởng phòng sở hữu xác nhận khi giảm | Không | Không | **ĐỔI**, xem **Q-02** | `QĐ-84f` (PD:256), `QĐ-89a(1)` ("không mua số lượng đứng trước nhu cầu"), SBF-12a | F3 "Số ghế đã mua", F5 cho sửa tự do |
| `unitPrice.amount`/`currency` | Có (giá theo hợp đồng) | quy đổi theo tỷ giá ngày ghi (`subscription-change.service.ts:89-96`, `QĐ-42b`) | Không | Giá (chỉ IT/Finance đọc) | GIỮ (×2) | FR-1.3, FR-1.6, `QĐ-42b` | F5 "Đơn giá", "Tiền tệ (mã ISO)" |
| `billingCycle`, `startDate`, `endDate`, `renewalDate`, `autoRenew` | Có | lưu, kiểm thứ tự ngày (`subscription.policy.ts:133-141`) | `renewalDate` thường = `endDate`+1, có thể là mặc định | Không | GIỮ (×5) | FR-1.3 | F5 |
| `noticeDeadline` | Có (ND trên hợp đồng) | mốc cảnh báo chính (`subscription.policy.ts:42-43`) | Suy ra từ `noticePeriodDays` khi thiếu, ghi *suy ra, chưa xác nhận* | Không | GIỮ | FR-1.4 (BRD:409), `QĐ-94d` | **FE không có ô ND** (cả create lẫn update), nên ND chỉ có thể suy ra |
| `noticePeriodDays` | Có | suy ra ND | Không | Không | GIỮ | FR-1.4 | F5 bỏ khỏi body khi trống (không gửi `null`), nên **không xóa được** |
| `allowsMidTermReduction` | Có | phân loại linh hoạt/cam kết kỳ | Không | Không | GIỮ (update có Audit Trail; xem nghi vấn N-08) | `QĐ-96f` (PD:265), FR-1.3 | F5 "Cho phép giảm giữa kỳ" |

`subscriptionComplete`: không body, GIỮ. Nút chỉ bật khi `missing` rỗng hoặc chỉ còn `EXCHANGE_RATE` (F5).

### 2.7 plan-terms — IT Admin. FR-1.10, `QĐ-54e`, `QĐ-66al`

**`planTermsSet`** (`cat/plan-terms/plan-terms.dto.ts:14-28`): `termsUrl`, `lastReviewedOn`, `aiTraining`, `dataLocation`, `installLimit.maxDevicesPerKey` (số, chỉ K4, `QĐ-66al` PD:252), `installLimit.note`, `commercialUse`, `cancellationRefund`. Cả 8 trường **GIỮ**: IT ghi điều mình đọc được, không diễn giải pháp lý (`QĐ-54e` PD:245). Bổ sung `sharingPolicy` từ plan (mục 2.4).

**`planTermOpinionRecord`** (`:29`): `opinion` **GIỮ**. IT ghi ý kiến không chặn của Business Owner; BO không phải vai đăng nhập (`QĐ-54e`).

FE chưa gọi cả hai.

### 2.8 contracts, documents — IT Admin, Finance. FR-1.5, `QĐ-18`, `QĐ-96d`

| Op · Trường | Vai | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ |
| --- | --- | --- | --- | --- | --- | --- |
| `contractCreate.name` (`cat/contract/contract.dto.ts:11`) | Có | mặc định `""`, model chỉ có `name` (`prisma/models/catalog.prisma:461-473`): không vendor, không thuê bao, không ngày | Không | Không | **ĐỔI**: bắt buộc không rỗng. Phạm vi model ở **Q-09** | BRD 5.1 (Contract bao nhiều Subscription) |
| `documentCreate.fileName`/`contentType`/`sizeBytes` (`:12-27`) | Có | khai trước, so magic bytes lúc complete (`document.service.ts:152`) | Không | Tên file có thể chứa dữ liệu cá nhân | GIỮ (×3) | FR-1.5 |
| `documentCreate.purpose` | Có | enum 6 giá trị, nhưng chỉ `CONTRACT_ATTACHMENT`, `PURCHASE_DOCUMENT` dùng được, 4 giá trị còn lại luôn bị từ chối `NOT_AVAILABLE` (`contract.policy.ts:38`, `:53-54`) | Không | Không | **ĐỔI**: OpenAPI chỉ công bố purpose dùng được (hoặc ghi rõ "chưa mở"). `TAX_PAYMENT_PROOF`/`COST_STATEMENT` của Finance hiện là bẫy | `QĐ-66h`, `QĐ-96d` |
| `documentAttach.contractId` (`:28`) | Có | đích duy nhất là contract | Không | Không | **ĐỔI**: thiếu đích *thuê bao/kỳ* cho biên lai IT tải từ trang quản trị (`QĐ-96d`), xem **Q-09** | `QĐ-96d` (PD:473), `QĐ-34a` |

`documentComplete`, `documentLink`: không body, GIỮ. Vai: FR-1.5 cho **Người duyệt chi mở tệp của hồ sơ đang được giao**, nhưng guard chỉ IT/Finance (`documents.controller.ts:70,113,150,191,208`). Ghi ở mục 4.

FE chưa gọi cả nhóm.

### 2.9 license-assignments — IT Admin. `QĐ-43a`, `QĐ-86c`, SBF-16

**`licenseAssignmentChangeResponsible`** (`lic/assignment/assignment.dto.ts:12-20`)

| Trường | Vai | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `employeeId` | Có: IT chọn người của phòng sở hữu | `assertResponsibleChange` (`assignment.policy.ts:110-142`): active, không đang bàn giao, cùng phòng sở hữu | Không | id nội bộ | GIỮ | `QĐ-43a` (PD:238), `QĐ-86c` (PD:219) | F13 **UUID thô** "ID nhân viên tiếp nhận" |
| `effectiveFrom` | Có | sau ngày bắt đầu, không quá khứ, không sau hạn hồ sơ (`:121-125`) | Không | Không | GIỮ | `QĐ-43a` (không hở, không chồng lấn) | F13 "Có hiệu lực từ" |
| `expectedEndDate` | Một phần: bắt buộc với nhà thầu/thực tập (`:137`), nhưng dòng mới có thể đặt ngày bất kỳ ≥ `effectiveFrom`, kể cả **xa hơn** ngày kết thúc dự kiến của dòng cũ/Request gốc | lưu vào Assignment mới (`assignment-responsible.service.ts:61-69`) | Mặc định nên là ngày của dòng cũ | Không | **ĐỔI**, xem **Q-10** | `QĐ-43a` ("cùng loại, lý do, định danh"), INV-07 | F13 "Ngày kết thúc dự kiến (tùy chọn)" |

### 2.10 seat-baseline, seat-baseline-imports — IT Admin. Khởi tạo bước 4, US-02-05, `QĐ-89e`

| Op · Trường | Logic | Kết luận | Căn cứ / FE |
| --- | --- | --- | --- |
| `seatBaselineClose` (không body) | đóng vĩnh viễn | GIỮ | F6 có cảnh báo |
| `seatBaselineImportUpload.file` | CSV ≤ 2 MiB | GIỮ | F6 |
| `…subscriptionId` ⟂ `…planId` | đúng một: thuê bao hoặc plan nội bộ K5 | GIỮ (×2) | F6 lưu `planId` vào state tên `subscriptionId` (nit FE) |
| Cột CSV `cost_center_code` (`imp/seat-baseline-import/seat-baseline-import.types.ts:11`) | chỉ đối chiếu: phải trùng Unit của phòng người chịu trách nhiệm (`seat-baseline-rows.policy.ts:209-215`, `:232-248`) | **SERVER TÍNH**: server đã suy ra CC từ phòng sở hữu. Cột chỉ là lỗi tiềm ẩn cho người nhập; bỏ khỏi mẫu, hoặc ghi rõ "tùy chọn, chỉ để đối chiếu" | `QĐ-40d`, `QĐ-86c`, `QĐ-89a(2)` |
| Cột `account_identifier` | bắt buộc; giá trị dạng secret bị che trước khi lưu (`…types.ts:16`) | GIỮ | `QĐ-43c` (PD:240) |
| `seatBaselineImportConfirm.previewVersion` | khóa lạc quan (`seat-baseline-import.service.ts:184`) | GIỮ | F7 lấy từ server |
| `…idempotencyKey` | so `confirmKey` (`:175`) | GIỮ (Nit: thường đặt ở header `Idempotency-Key`; giữ ở body không sai) | F7 `crypto.randomUUID()` cache theo previewVersion: đúng "một khóa mỗi ý định" |
| `seatBaselineImportCancel` (không body) | | GIỮ | F7 |

### 2.11 provisioning-tasks — IT Admin (SoD-5, `QĐ-77m`). MF-1 1.9–1.10 / SBF-17; thu hồi SBF-18

**`provisioningTaskGrant`** (`lic/provisioning/provisioning.dto.ts:16-25`). MF-1 bước 1.9 (chọn nguồn seat) + 1.10 (cấp).

| Trường | Vai | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `requestId` | Có | gate `check`/`claimForGrant` (`tasks/provisioning-grant-planner.service.ts:49`, `tasks/provisioning-grant-writer.service.ts:51-53`) | Không | Không | GIỮ | FR-2.3 | F10 tự lấy |
| `subscriptionId` | Có (IT chọn nguồn seat) | bắt buộc với K1/K2, cấm với K5 (`provisioning.policy.ts:110-117`); **phải thuộc đúng phòng của Request**, nếu không ⟹ `SUBSCRIPTION_DEPARTMENT_MISMATCH` (`assignment.policy.ts:34-44`, gọi ở `assignment.service.ts:225`) | Một phần: server biết seat trống của phòng và của phòng khác cùng gói | Không | **ĐỔI**, xem **Q-04**: cho chọn thuê bao cùng gói của phòng khác (chuyển seat kèm chi phí) và ghi *nguồn seat* | `QĐ-99e` (PD:320), `QĐ-99m` (PD:411), `QĐ-100y` (PD:496), QT 1.9 (QT:287) | F10 option trống "**Dùng mặc định của máy chủ nếu được hỗ trợ**", nhưng server luôn đòi trường này với K1/K2 ⟹ lỗi `REQUIRED` |
| `accountIdentifier` | Có | cá nhân: mặc định email công việc, phải thuộc tên miền công ty (`provisioning.policy.ts:123-133`); dịch vụ: bắt buộc (`:139-144`) | Cá nhân: có (mặc định) | Email công việc; không nhận dạng credential | GIỮ | FR-2.9, `QĐ-43c`, `QĐ-54c` | F10 "Định danh tài khoản" |
| `expectedEndDate` | **Không**: thời hạn quyền do Request đã duyệt quyết (`QĐ-98a`), IT không được vượt | ghi đè ngày của Request: `input.expectedEndDate ?? claimed.expectedEndDate` (`tasks/provisioning-grant-writer.service.ts:78`), **không kiểm ≤ ngày đã duyệt** | **Có**, từ Request | Không | **SERVER TÍNH**, xem **Q-03** (có cho rút ngắn hay không) | QT 1.9 điều kiện "Số lượng, gói và **thời hạn** mua không vượt mức đã duyệt" (QT:296), `QĐ-98a` (PD:403) | F10 điền sẵn từ Request nhưng cho sửa |
| `responsibleEmployeeId` | Có, khi người Request nêu đã chuyển phòng | chỉ cho tài khoản dịch vụ (`tasks/provisioning-grant-planner.service.ts:52-54`); kiểm cùng phòng, đủ điều kiện (`tasks/provisioning-holder.service.ts:61-90`) | Không | id nội bộ | GIỮ | `QĐ-86c` | F10 ô UUID thô, chỉ hiện với SERVICE_ACCOUNT |
| `beneficiaryEmployeeId` | Có (Request nhóm cấp từng người) | gate theo người (`…planner.service.ts:49`) | Không | id nội bộ | GIỮ | `QĐ-82h`, `QĐ-66m` | F10 tự lấy |
| *(THIẾU)* `seatSource` (`EMPTY_SEAT` / `TRANSFER` / `PURCHASE`) + `purchaseReason` | Có | không có | Một phần | Không | **THIẾU**: ghi *mua thêm* phải kèm lý do khi phòng khác chỉ còn seat khác gói, hoặc seat còn trong ân hạn thu hồi; *chi phí tránh được* khi cấp từ seat trống | QT 1.9 điều kiện tối thiểu, `QĐ-94e(4)`, `QĐ-100y` | — |

**Các thao tác tác vụ** (`provisioning.dto.ts:26-48`)

| Op · Trường | Logic | Kết luận | Căn cứ / FE |
| --- | --- | --- | --- |
| `…Complete.evidence` | bắt buộc không rỗng (`provisioning.policy.ts:147-152`) | GIỮ | `QĐ-90a` (PD:315) · F11 "Bằng chứng" |
| `…ReportFailure.reason`, `…CloseFailed.reason` | bắt buộc (`provisioning.policy.ts:155-160`) | GIỮ (×2) | `QĐ-62i` (PD:292) · F11 "Lý do" |
| `…HandOff` body `{}` (`:29`) | không trường | GIỮ, Nit: body rỗng bắt buộc là thừa, nên cho phép không body | `QĐ-90a` · F11 gửi `{}` cứng |
| `…Claim`, `…Retry`, `…Cancel` | không body | GIỮ | F11 |
| `…RecordAccessCut.accessCutOn`, `.evidence` (`:45-48`) | K1 cắt truy cập trước hết kỳ | GIỮ (×2) | `QĐ-77l` (PD:445) · F11 |

**`provisioningTaskCompleteRevocation`** (`provisioning.dto.ts:36-44`). SBF-18, thu hồi theo kiểu cấp.

| Trường | Vai | Logic | Suy ra? | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- |
| `completion` | Chỉ có lựa chọn thật ở K2 | `completionsFor` (`revocation.policy.ts:70-81`): K1 ⟹ chỉ `RENEWAL_CANCELLED`, K5 ⟹ chỉ `OFF_SYSTEM_REVOKED`, K2 ⟹ `ACCOUNT_REMOVED` hoặc `ALREADY_GONE`, K4 ⟹ **rỗng** (thu hồi K4 bị từ chối từ lúc mở, `:39-49`) | **Có** với K1/K5 | **ĐỔI**: tùy chọn, server tự điền khi kiểu cấp chỉ có một cách; K2 giữ hai giá trị; **thêm** giá trị K4 (khóa về kho / *ngừng dùng*) khi K4 được hỗ trợ | SBF-18 (QT bảng C), `QĐ-54b` (PD:244), FR-2.10 | F11 tự gán và ẩn với K1/K5, chỉ K2 có select; **không có action K4** |
| `evidence` | Có | bắt buộc, trừ `ALREADY_GONE` lấy `note` làm bằng chứng (`revocation.policy.ts:145-146`) | Không | GIỮ | `QĐ-90a` | F11 |
| `note` | Có | bắt buộc với `ALREADY_GONE` (`revocation.policy.ts:143`) | Không | GIỮ | — | F11 "Ghi chú" |
| `paidThroughOn`, `accessState`, `accessCutOn`, `accessEvidence` | Có (K1: IT đọc ở nhà cung cấp) | chỉ cho `RENEWAL_CANCELLED`; ngày kết thúc = sớm hơn của hai mốc (`revocation.policy.ts:157-178`) | Không | GIỮ (×4) | `QĐ-77l` (PD:445) | F11 "Đã thanh toán đến ngày", "Truy cập sau khi hủy"… |

### 2.12 license-keys — IT Admin. FR-2.10, `QĐ-54b`, `QĐ-66g`

| Op · Trường | Logic | Nhạy cảm | Kết luận | Căn cứ / FE |
| --- | --- | --- | --- | --- |
| `licenseKeyImport.subscriptionId` (`lic/license-key/license-key.dto.ts:10-13`) | phải là khoản mua K4 (`license-key.service.ts:94`, `:230-233`) | Không | GIỮ | FR-2.10 · F8 |
| `licenseKeyImport.keys[]` | mã hóa AES-256-GCM; lỗi trả theo dòng, không trả lại khóa | **Secret**: không log; đúng | GIỮ | `QĐ-54b` · F8 "Khóa bản quyền (mỗi dòng một khóa)" |
| `licenseKeyReveal` (không body) | giới hạn cửa sổ xem, Audit Trail; **không gắn tác vụ cấp nào** | Secret | GIỮ (nghi vấn N-05, **Q-07**) | `QĐ-54b` "chỉ IT Admin xem đầy đủ **khi cấp**" · F8 tự ẩn sau 30 giây |

### 2.13 handover-duties — người xác nhận theo nguồn (trưởng phòng / người kích hoạt / IT Admin). FR-2.12, `QĐ-62f`, `QĐ-63a`, `QĐ-64a`

**`handoverDutyConfirm`** (`lic/handover/handover.dto.ts:8`)

| Trường | Vai | Logic | Suy ra? | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- |
| `value` | Có lựa chọn **chỉ** ở ca nghỉ việc (trưởng phòng: *đã bàn giao* / *không cần*) | `allowedValues` (`handover-confirmer.policy.ts:47-49`): nguồn `DEPARTURE`/`ABRUPT_DEPARTURE` ⟹ `HANDED_OVER`\|`NOT_NEEDED`; mọi nguồn khác ⟹ chỉ `HANDLED` | **Có** với mọi nguồn ngoài nghỉ việc | **ĐỔI**: tùy chọn; server tự đặt `HANDLED`, bắt buộc chỉ với nguồn nghỉ việc. Gửi sai ⟹ `VALUE_NOT_ALLOWED` (`handover-confirmation.service.ts:44`) | FR-2.12 (BRD:513), `QĐ-63b` | F14 hard-code `HANDLED`; **không có màn hình employee/manager** xác nhận bàn giao |

### 2.14 assignment-expiry — IT Admin. SBF-03 → SBF-18

`assignmentExpiryStartRevocation`: không body, GIỮ. Từ chối khi đang chờ Request tiếp tục (`RENEWAL_PENDING`, `lic/expiry/expiry-queue.service.ts:80-96`), khớp `QĐ-94c(4)`. F12 có hộp xác nhận.

### 2.15 saas-issues — Employee (người báo) + IT Admin. FR-2.15, `QĐ-82g`, BM-11

**`saasIssueSubmit`** (`lic/saas-issue/saas-issue.dto.ts:27-35`). Employee, chỉ cho quyền cá nhân của chính mình (`saas-issue.service.ts:57-63`, không phân biệt "không có" và "không phải của bạn").

| Trường | Vai | Logic | Suy ra? | Nhạy cảm | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `assignmentId` | Có: chọn từ `saasIssueFormOptions` | kiểm quyền là của người gọi | Không | Không | GIỮ | `QĐ-82g` (PD:304) | **FE chưa gọi** (F17 nút disable) |
| `category`, `impact` | Có | enum đúng 5 loại, 3 mức BM-11 | Không | Không | GIỮ (×2) | FR-2.15 (BRD:542) | — |
| `description` | Có | bắt buộc; Audit Trail **không** chép nội dung (`saas-issue.service.ts:80`); cảnh báo không đưa secret (`saas-issue.policy.ts:42-45`) | Không | Có thể chứa secret do người dùng dán: đã xử lý | GIỮ | FR-2.15 | — |
| `occurredAt` | Có | không ở tương lai (`saas-issue.policy.ts:132-134`) | Không | Không | GIỮ | BM-11 "thời điểm" | — |
| *(THIẾU)* tệp minh chứng tùy chọn | Có | không có | — | Ảnh chụp có thể lộ dữ liệu | **THIẾU**, phụ thuộc `OQ-31` (thời hạn lưu tệp) | BM-11, FR-2.15 | — |

**Các thao tác khác**

| Op · Trường | Logic | Kết luận | FE |
| --- | --- | --- | --- |
| `saasIssueAddMessage.body` (`:36`) | người báo hoặc IT Admin | GIỮ | F15 "Nội dung trao đổi" |
| `saasIssueReopen.reason` (`:37`) | chỉ người báo, trong hạn (`saas-issue.service.ts:159-170`) | GIỮ | Chưa gọi |
| `saasIssueTransition.to`, `message`, `resolution`, `vendorTicketRef` (`:44-50`) | `transitionProblem` (`saas-issue.policy.ts:94-97`): RESOLVED cần `resolution`; mã ticket ghi tay | GIỮ (×4) | F16 |
| `…linkedWork.grantTaskId` | kiểm tồn tại (`saas-issue-handling.service.ts:57-60`) | GIỮ | F16 **bỏ qua hoàn toàn** `linkedWork` |
| `…linkedWork.discrepancyId`, `returnId`, `requestId` | **không kiểm**, lưu thẳng JSON (`:68`, cột `linked_work Json?`) | **ĐỔI** (×3): kiểm tồn tại như `grantTaskId`, hoặc bỏ. Xem **Q-05** | — |
| `saasIssueMarkDuplicate.ofIssueId`, `reason` (`:51`) | | GIỮ (×2) | F16 ô **UUID thô** "Mã định danh phiếu gốc": cần picker |

### 2.16 subscription-renewals. MF-5 5.7–5.10, SBF-12/12a, US-11-05/06/07

> **Lệch vai ở mức operation (CHUYỂN BƯỚC).**
> - Code: `subscriptionRenewalDecide` chỉ cho **Người duyệt chi** quyết (`lic/subscription-renewal/decision/renewal-decision.policy.ts:10-17`, `:31-41`). Hàng đợi chờ `NO_SPENDING_APPROVER` (`:20-25`); quyết định ghi `deciderRole: 'SPENDING_APPROVER'` (`subscription-renewal.dto.ts:159`).
> - Tài liệu: "**Không** còn luồng Người duyệt chi quyết gia hạn/giảm/hủy theo từng thuê bao"; *IT đề xuất → trưởng phòng sở hữu xác nhận → IT thực hiện*. Nguồn: `QĐ-62k` (PD:246), `QĐ-84f` (PD:256), `QĐ-93d(1)`, `QĐ-94c(1)` (PD:262), `QĐ-94d(2)` (PD:263), FR-1.12(2) (BRD:432), QT 5.8 (QT:950). US-11-02 đã `RETIRED` (EP11:57-59), thay bằng **US-11-06** (EP11:235): trưởng phòng sở hữu *xác nhận* hoặc *yêu cầu sửa*; IT, Finance, Người duyệt chi, Super Admin, BO, trưởng phòng khác bị từ chối (AC-7).
> - Tài liệu FE `Docs/Figma UI-UX/API-Integration/roles/spending-approver.md:7,33` vẫn ghi Người duyệt chi "quyết gia hạn thuê bao".

**`subscriptionRenewalPropose`** (`subscription-renewal.dto.ts:31-37`). IT Admin (guard `subscription-renewals.controller.ts:126`), QT 5.7.

| Trường | Vai | Logic | Suy ra? | Kết luận | Căn cứ |
| --- | --- | --- | --- | --- | --- |
| `subscriptionId` | Có | chỉ TERM, không INTERNAL, ACTIVE, chưa nối kỳ, có mốc (`proposal/renewal-proposal.policy.ts:11-16`) | Không | GIỮ | `QĐ-49c` (PD:242) |
| `choice` (`RENEW`/`REDUCE`/`CANCEL`, `subscription-renewal.types.ts:14`) | Có | lưu | Không | **ĐỔI**: thêm *đổi tier* (`CHANGE_TIER` + số lượng từng gói), đổi `RENEW` thành *giữ* (`KEEP`) cho khớp ngữ nghĩa *giữ · giảm · đổi tier · hủy* | FR-1.12(1), US-11-05 AC-7, US-11-06 AC-15 |
| `proposedQuantity` | Có | chỉ với REDUCE, < số đã mua (`renewal-proposal.policy.ts:28-37`) | Không | GIỮ | `QĐ-94d` |
| `note` | Có (căn cứ nhu cầu/usage) | lưu | Phần *nhu cầu còn hiệu lực* phải do server tổng hợp ở ND−60 (FR-1.12(1)), không để IT gõ tay | GIỮ | QT 5.6–5.7 |
| `businessOwnerOpinion` | Có: *ý kiến BO do IT ghi* | lưu | Không | GIỮ | US-11-06 "ý kiến Business Owner do IT ghi" |
| *(CHUYỂN BƯỚC vào đây)* danh sách seat thu hồi theo thứ tự | Có (IT đề xuất) | hiện ở `decide` | Thứ tự do server xếp (`subscription-renewal-ranking.policy.ts`) | xem `releasedAssignmentIds` bên dưới | `QĐ-66x` (PD:443), US-11-05 AC-13 |

**`subscriptionRenewalDecide`** (`subscription-renewal.dto.ts:39-46`). **Sai vai**: nên là trưởng phòng sở hữu (US-11-06).

| Trường | Vai (theo QĐ) | Logic hiện tại | Suy ra? | Kết luận | Căn cứ |
| --- | --- | --- | --- | --- | --- |
| `choice` | Trưởng phòng **không chọn lại phương án**: xác nhận đề xuất của IT hoặc *yêu cầu sửa* | `checkChoice` (`renewal-decision.policy.ts:47-63`) | — | **ĐỔI**: thay bằng `decision: CONFIRM \| REQUEST_CHANGES` | FR-1.12(2) "Trưởng phòng yêu cầu sửa ⟹ IT lập lại đề xuất", US-11-06 AC-5 |
| `quantity` | Không: số lượng là của đề xuất IT | `checkChoice`, `seatsToRelease` (`:100-104`) | Lấy từ đề xuất | **BỎ** | US-11-06 AC-1, AC-4 |
| `reason` | Có (lý do yêu cầu sửa, *nếu nhập*) | lưu | Không | GIỮ (tùy chọn, `OQ-F1-06`) | US-11-06 AC-5 |
| `withinCurrentTerm` | Không: đây là quy tắc theo loại thuê bao | `executionPointOf` (`:70-79`), chặn khi không cho giảm giữa kỳ | **Có**: từ `allowsMidTermReduction` + ngày (linh hoạt ⟹ kỳ thanh toán sau; cam kết kỳ ⟹ hết kỳ; xác nhận sau ND ⟹ thời điểm còn làm được) | **SERVER TÍNH** | `QĐ-96f` (PD:265), FR-1.4, US-11-06 AC-9 |
| `acknowledgeActiveUsers` | Có: trưởng phòng được cảnh báo số người đang dùng trước khi lưu *hủy* | `ACTIVE_USERS_NOT_ACKNOWLEDGED` (`renewal-decision.service.ts:154-156`) | Không | GIỮ (chuyển cùng operation sang trưởng phòng) | US-11-06 AC-3, `BR-27.3` |
| `releasedAssignmentIds` | **IT đề xuất**, trưởng phòng chỉ xác nhận danh sách | người quyết tự chọn seat, kiểm theo ranking (`renewal-decision.service.ts:157-167`) | Thứ tự xếp sẵn do server tính | **CHUYỂN BƯỚC** sang `subscriptionRenewalPropose` (IT) | `QĐ-66x` (PD:443), `QĐ-94d(6)`, US-11-05 AC-13, US-11-06 AC-4, AC-14 |

**`subscriptionRenewalRecordOutcome`** (`subscription-renewal.dto.ts:48-65`). IT Admin (guard `controller.ts:222`), QT 5.9 / SBF-12a.

| Trường | Vai | Logic | Suy ra? | Kết luận | Căn cứ |
| --- | --- | --- | --- | --- | --- |
| `outcome` | Có | `checkOutcome` (`outcome/renewal-outcome.policy.ts:10-25`), `vendorFollowUpOpen` khi khác `AS_DECIDED` (`renewal-outcome.service.ts:43`) | Không | GIỮ | `QĐ-62k`, US-11-03 |
| `note` | Có | tùy chọn với mọi outcome | Không | **ĐỔI**: bắt buộc khi `VENDOR_REFUSED`/`DIFFERENT` (lý do), kèm bằng chứng | `QĐ-96i` (PD:267) "IT ghi lý do và bằng chứng" |
| `nextPeriod.purchasedQuantity` | Có (số nhà cung cấp xác nhận) | `AS_DECIDED` phải bằng số đã quyết; outcome khác **không có trần**; chỉ kiểm ghế chuyển ≤ số mua (`renewal-outcome.service.ts:173`) | Không | **ĐỔI**: với `VENDOR_REFUSED`/`DIFFERENT`, ≤ mức đang trả đã duyệt; vượt thì từ chối và hướng sang *Request tăng cấp thuê bao* | `QĐ-96i`, `QĐ-98l`, `QĐ-100ad` (PD:501), QT 5.9 "không vượt mức đã duyệt" |
| `nextPeriod.unitPrice.amount`/`currency`, `billingCycle`, `endDate`, `renewalDate`, `noticeDeadline`, `noticePeriodDays`, `autoRenew`, `allowsMidTermReduction` | Có | lưu kỳ mới qua `SubscriptionPeriodApi.recordNextPeriod` | Không | GIỮ (×9). Tăng **đơn giá** ở kỳ mới xem **Q-08** | FR-1.3 |
| `nextPeriod.startDate` | Có, nhưng gần như luôn = ngày sau ngày kết thúc kỳ cũ | trigger `subscriptions_renewal_chain` chỉ kiểm "sau kỳ cũ" | **Có** (mặc định) | **SERVER TÍNH** (mặc định ngày kế tiếp; cho ghi khác khi nhà cung cấp lệch, kèm cảnh báo hở kỳ) | `QĐ-16`, `QĐ-35c` |

---

## 3. Nghi vấn logic

Xếp theo mức nghiêm trọng (skill `code-review-and-quality`).

| ID | Mức | Nghi vấn | Bằng chứng | Căn cứ | Đề xuất tối thiểu |
| --- | --- | --- | --- | --- | --- |
| **N-01** | Critical | **Người duyệt chi quyết gia hạn/giảm/hủy** thay cho *trưởng phòng sở hữu xác nhận*. Trưởng phòng (MANAGER) còn **không đọc được** hồ sơ gia hạn: guard đọc chỉ IT, Finance, Người duyệt chi (inventory `subscriptionRenewalList/Get`). Hàng đợi `NO_SPENDING_APPROVER` và thông báo Super Admin (`spending-approver-wait.listener.ts`) thành thừa | `renewal-decision.policy.ts:10-41`; `subscription-renewal.dto.ts:107,159` | `QĐ-62k`, `QĐ-84f`, `QĐ-93d(1)`, `QĐ-94c(1)`, `QĐ-94d(2)`; US-11-02 RETIRED; US-11-06 AC-7, AC-11 (phòng chưa có trưởng phòng ⟹ chờ, không giao ai) | Người quyết = trưởng phòng có hiệu lực của `ownerDepartmentId`; body `CONFIRM`/`REQUEST_CHANGES`; chờ lý do `NO_HEAD`. Cần migration enum `deciderRole` (L, có migration) |
| **N-02** | Critical | **IT Admin đặt `expectedEndDate` lúc cấp tùy ý**, có thể **dài hơn** thời hạn đã duyệt: kéo dài quyền trả phí mà không qua duyệt chi | `tasks/provisioning-grant-writer.service.ts:78`; không có kiểm nào trong `assignment.policy.ts` | QT 1.9 "thời hạn mua không vượt mức đã duyệt" (QT:296), `QĐ-98a`, `QĐ-94c(4)` | Server lấy ngày từ Request; tối đa cho rút ngắn kèm lý do (**Q-03**) (S) |
| **N-03** | High | **Thuê bao tăng số lượng/giá mà không có Request**: PATCH `purchasedQuantity` chỉ bị chặn khi thiếu Cost Center. Tạo thuê bao mới cho phòng bất kỳ, số lượng bất kỳ (kể cả sau khi đóng baseline). Ngược lại, **giảm** qua PATCH bỏ qua bước trưởng phòng xác nhận (SBF-12a) | `subscription-change.service.ts:80,104`; `subscription-obligation.service.ts:17-26`; `subscription.service.ts:144-145` | `QĐ-84f` ("không dùng điều chỉnh thuê bao để né khoản cam kết"), `QĐ-89a(1)`, QT 5.9 "Có xác nhận của trưởng phòng sở hữu cho đúng mức sẽ thực hiện" | **Q-01**, **Q-02** (M) |
| **N-04** | High | **Không chuyển được seat giữa phòng**: cấp quyền từ chối thuê bao của phòng khác (`SUBSCRIPTION_DEPARTMENT_MISMATCH`), nên `QĐ-99e`/`QĐ-99m`/`QĐ-100y` (bắt buộc chuyển seat cùng gói, chi phí và cam kết đi theo seat từ ngày cấp) không thực hiện được; IT buộc phải *mua thêm* trong khi QĐ cấm. Không ghi *nguồn seat*/*lý do mua* | `assignment.policy.ts:34-44`, `assignment.service.ts:225` | `QĐ-99e`, `QĐ-99m`, `QĐ-100y`, FR-2.3, QT 1.9 | **Q-04** (L, có thể cần migration cột "phòng chịu chi phí" trên Assignment) |
| **N-05** | High | **K4 đứt quãng**: import/xem khóa được nhưng **cấp và thu hồi K4 đều bị từ chối**, nên kho khóa không dùng được trong luồng; `completion` không có giá trị *khóa về kho / ngừng dùng*. `licenseKeyReveal` mở khóa bất kỳ lúc nào, không gắn tác vụ cấp | `provisioning.policy.ts:105-107`; `revocation.policy.ts:39-49,70-81`; `license-key.service.ts:173-200` | `QĐ-54b` "chỉ IT Admin xem đầy đủ **khi cấp**", FR-2.10, SBF-18 (K4 gỡ kích hoạt) | Thuộc A3 (phạm vi K4). Trường: thêm giá trị completion K4; reveal **Q-07** |
| N-06 | Medium | **Thuê bao linh hoạt** (`QĐ-100o`, `QĐ-96g`): đề xuất/quyết REDUCE có thể buộc thu hồi seat đang dùng (`releasedAssignmentIds`), trong khi linh hoạt chỉ được giảm **seat trống thật**. `checkProposable` đòi mốc (ND/ngày kết thúc), nên thuê bao tháng không có ngày kết thúc không đề xuất được; không có điểm điều chỉnh N ngày trước kỳ thanh toán | `renewal-proposal.policy.ts:11-25`; `renewal-decision.service.ts:157` | `QĐ-100o` (PD:272), `QĐ-96g` (PD:266), US-11-05 AC-28, US-11-06 AC-16 | Linh hoạt: REDUCE chỉ tới `purchased − seatsInUse`, không nhận danh sách seat (A3) |
| N-07 | Medium | **Kết quả gia hạn không có trần và không bắt lý do** khi nhà cung cấp làm khác/từ chối: IT ghi kỳ mới số lượng cao hơn mức đã duyệt, thành chi tăng không qua Request | `renewal-outcome.policy.ts:10-25`; `renewal-outcome.service.ts:39,173` | `QĐ-96i`, `QĐ-98l`, `QĐ-100ad` | Mục 2.16 `note`, `nextPeriod.purchasedQuantity` (S) |
| N-08 | Medium | `allowsMidTermReduction` sửa tự do trên thuê bao ACTIVE, đổi phân loại linh hoạt/cam kết kỳ giữa kỳ, kéo theo đổi cách giải phóng cam kết (`QĐ-99c`) và mốc vận hành. Chỉ có Audit Trail | `subscription-change.service.ts:65-104` | `QĐ-96f` (cờ quyết cách giải phóng cam kết) | Ghi nhận; spec quyết có khóa khi đã có Request/cam kết gắn thuê bao không (S) |
| N-09 | Medium | `saasIssueTransition.linkedWork`: 3 id (`discrepancyId`, `returnId`, `requestId`) **lưu không kiểm**, ghi đè liên kết cũ mỗi lần chuyển trạng thái; có thể trỏ tới hồ sơ không tồn tại hoặc của tổ chức khác (cùng tổ chức nên không lộ dữ liệu, nhưng sai liên kết) | `saas-issue-handling.service.ts:57-68` | FR-2.15 "dẫn sang luồng có sẵn nhưng không tự kích hoạt" | **Q-05** (S) |
| N-10 | Medium | **Hai trường im lặng bị bỏ qua hoặc thành bẫy**: `documentCreate.purpose` công bố 6 giá trị nhưng 4 luôn bị từ chối; `contractCreate.name` mặc định `""` cho phép hợp đồng không tên | `contract.policy.ts:38,53-54`; `contract.dto.ts:11` | `QĐ-96d`, `QĐ-66h` | Mục 2.8 (S) |
| N-11 | Low | `handoverDutyConfirm.value`: client phải đoán giá trị duy nhất hợp lệ (`HANDLED`) cho mọi nguồn ngoài nghỉ việc | `handover-confirmer.policy.ts:47-49` | FR-2.12 | Mục 2.13 (S) |
| N-12 | Low | `applicationRetirementConfirm.businessOwnerEmployeeId` chỉ là bản lặp của BO hiện tại; gửi khác ⟹ lỗi | `application-retirement.service.ts:90-96` | `QĐ-62n` | SERVER TÍNH (S) |
| N-13 | Low | Grant: FE hiển thị option "Dùng mặc định của máy chủ nếu được hỗ trợ" cho `subscriptionId`, nhưng BE bắt buộc với K1/K2. Hợp đồng API và FE hiểu khác nhau | `provisioning.policy.ts:110-117`; F10 | — | Gộp vào **Q-04** |

---

## 4. Response và GET: dữ liệu vượt phạm vi vai

| Operation | Phát hiện | Căn cứ | Đề xuất |
| --- | --- | --- | --- |
| `subscriptionRenewalSeatRanking` (đọc: IT, Finance, Người duyệt chi) | Trả họ tên, mã nhân viên, `lastActivityOn` từng người (`subscription-renewal.dto.ts:184-191`) cho Finance và Người duyệt chi. Hai vai này không có bước nào dùng danh sách seat theo người | `QĐ-77e` (không xếp hạng người), `QĐ-94d(6)` (IT đề xuất, trưởng phòng sở hữu xác nhận), `ĐK-09` | Giới hạn: IT Admin + trưởng phòng sở hữu (sau N-01) |
| `subscriptionRenewalGet` | `decision.snapshot.financial` (ngân sách, đã chi, cam kết, còn lại của CC phòng sở hữu, `:112-125`) là snapshot *cho người quyết chi*. Theo QĐ mới không còn ai quyết chi ở bước này; IT Admin đọc số ngân sách phòng không có căn cứ nghiệp vụ | `QĐ-84f`, FR-1.12(8) (không kiểm ngân sách), `QĐ-100p` (trưởng phòng thấy số phòng mình) | Bỏ snapshot khỏi quyết định gia hạn, hoặc chỉ cho trưởng phòng sở hữu. Spec quyết cùng N-01 |
| `subscriptionRenewalList/Get` | Thiếu vai MANAGER (trưởng phòng sở hữu) | US-11-06 | Cùng N-01 |
| `documentLink`/`documentGet` | Thiếu Người duyệt chi cho tệp của hồ sơ đang được giao quyết (đây là **thiếu**, không phải lộ) | FR-1.5 (BRD:416) | Ghi nhận cho A3/A1 |
| `subscriptionList/Get`, `licenseKeyList`, `licenseAssignmentList` | Giá chỉ IT/Finance đọc; khóa luôn che; email công việc chỉ IT. **Không thấy lộ** | FR-1.5, `QĐ-54b` | — |
| `saasIssueGet/Entries` (no 403) | Ngoài người báo và IT Admin thì trả `NOT_FOUND` (`saas-issue-view.service.ts:151-152`); trưởng phòng không xem nội dung: **đúng** | FR-2.15 | — |
| `handoverDutyGet` (no 403) | Chỉ IT Admin, người nghỉ hoặc người xác nhận (`handover-view.service.ts:95-105`): **đúng** | — | — |

---

## 5. Câu hỏi cho Owner

Mỗi câu một trường hoặc nhóm trường. Phần "thực tế bên ngoài" dựa trên hiểu biết chung về sản phẩm SaaS Management/SAM. **Tôi không mở tài liệu chính thức trong lượt này**; câu nào không chắc đều ghi rõ.

### Q-01 — `subscriptionCreate.ownerDepartmentId` sau khi đóng baseline lấy từ đâu?

- **Bối cảnh.** `QĐ-89e` cho IT chọn phòng sở hữu ở bước 3 khởi tạo. Sau đó, `QĐ-89a(1)` quy định phòng sở hữu = *phòng có Request đã duyệt tạo hoặc điều chỉnh thuê bao*. Hiện IT nhập UUID phòng bất kỳ (F3), BE không nối Request.
- **Ví dụ.** Request mua Figma 5 seat của `P-ENG` đã duyệt. IT khai thuê bao nhưng gõ nhầm phòng `P-MKT`. Chi phí 100 % đổ về CC của `P-MKT`, còn khoản cam kết nằm ở `P-ENG`.
- **Thực tế (không chắc nguồn).** Zylo/Vendr/Torii thường tạo bản ghi thuê bao từ workflow mua đã duyệt (intake → approval → purchase), phòng ban/cost center kế thừa từ yêu cầu.
- **Phương án.**
  - **(A)** Sau khi đóng baseline, `subscriptionCreate` bắt buộc `requestId` (Request cấp mới/tăng cấp đã duyệt); server suy ra phòng, plan và trần số lượng. Bỏ `ownerDepartmentId` khỏi input. Hệ quả: đúng QĐ; cần endpoint/logic nối Request; FE đổi form.
  - **(B)** Giữ `ownerDepartmentId`, nhưng sau baseline phải kèm `requestId` và server kiểm phòng khớp Request. Hệ quả: ít đổi FE hơn, vẫn còn trường lặp.
  - **(C)** Giữ như hiện tại, chỉ Audit Trail. Hệ quả: lệch `QĐ-89a(1)`, rủi ro chi phí sai phòng.
- **Khuyến nghị: (A).** Trước baseline vẫn theo `QĐ-89e`.
- **Phụ thuộc:** N-03, Q-02.

### Q-02 — Tăng/giảm `purchasedQuantity` (và giá) trên thuê bao đang dùng qua `subscriptionUpdate`

- **Bối cảnh.** Mua thêm seat chỉ được làm sau Request đã duyệt (`QĐ-84f`); giảm/hủy chỉ sau khi trưởng phòng sở hữu xác nhận (SBF-12a). PATCH hiện là đường *thực hiện* duy nhất để đổi số lượng, nhưng không gắn căn cứ nào.
- **Ví dụ.** IT tăng Slack 40 → 45 vì "sắp có người mới", không có Request nào. BE cho qua nếu phòng có Cost Center.
- **Thực tế (không chắc nguồn).** Flexera/Snow tách *license entitlement* (đã mua, nhập theo PO/hóa đơn) khỏi *allocation*. Thay đổi entitlement gắn chứng từ mua.
- **Phương án.**
  - **(A)** Tăng bắt buộc `basis: { requestId }` (Request đã duyệt, kiểm tổng ≤ phần được duyệt); giảm bắt buộc `basis: { renewalId }` (kết quả rà soát đã xác nhận). Sửa lỗi nhập liệu (không đổi nghĩa vụ trả tiền) dùng `basis: { correction, reason }`.
  - **(B)** Khóa `purchasedQuantity` khi ACTIVE; mọi thay đổi số lượng chỉ qua *ghi kết quả gia hạn/điều chỉnh* và *cấp từ Request có mua thêm*. Hệ quả: chặt nhất, cần thêm đường "mua thêm giữa kỳ".
  - **(C)** Giữ, thêm cảnh báo. Hệ quả: lệch `QĐ-84f`.
- **Khuyến nghị: (A).** `correction` để sửa sai dữ liệu khởi tạo.

### Q-03 — `provisioningTaskGrant.expectedEndDate`: IT có được đổi không?

- **Bối cảnh.** Thời hạn quyền do Request đã duyệt quyết (`QĐ-98a`); QT 1.9 cấm vượt. Hiện IT sửa tự do (N-02).
- **Ví dụ.** Request thực tập sinh duyệt tới 31/12. IT đặt 30/06 năm sau, quyền trả phí kéo thêm 6 tháng mà không qua duyệt chi.
- **Thực tế (không chắc nguồn).** Okta Access Requests và ServiceNow time-bound access đặt thời hạn ở bước duyệt; người thực thi không kéo dài được.
- **Phương án.**
  - **(A)** Bỏ khỏi input, server lấy từ Request.
  - **(B)** Cho IT **rút ngắn** (≤ ngày đã duyệt) kèm lý do bắt buộc, ví dụ hợp đồng nhà thầu kết thúc sớm hơn. Vượt ⟹ 422.
  - **(C)** Giữ.
- **Khuyến nghị: (A).** Rút ngắn đã có đường riêng: trả quyền / Request cập nhật hồ sơ. Nếu Owner thấy cần thì chọn (B).

### Q-04 — `provisioningTaskGrant.subscriptionId` và nguồn seat (chuyển seat giữa phòng)

- **Bối cảnh.** `QĐ-99e`/`QĐ-99m`/`QĐ-100y` buộc chuyển seat trống **cùng gói** từ phòng khác trước khi mua: hợp đồng giữ ở phòng cũ, chi phí và cam kết còn lại sang phòng nhận từ ngày cấp. BE từ chối mọi thuê bao khác phòng (N-04). FE tưởng server có "mặc định" (N-13).
- **Ví dụ.** `P-ENG` hết seat Figma; `P-MKT` còn 2 seat trống cùng gói. QĐ buộc chuyển, nhưng BE chỉ cho cấp từ thuê bao của `P-ENG`.
- **Thực tế (không chắc nguồn).** Snow License Manager/Flexera hỗ trợ *reharvest* và phân bổ license cho cost center khác, chargeback theo ngày phân bổ.
- **Phương án.**
  - **(A)** Giữ `subscriptionId` (bắt buộc với K1/K2). Cho phép thuê bao cùng plan của phòng khác; server tự xác định `seatSource = TRANSFER`, ghi phòng chịu chi phí trên Assignment, báo trưởng phòng cũ. Thêm `purchaseReason` khi IT chọn mua trong lúc còn seat trống khác gói hoặc seat trong ân hạn.
  - **(B)** Bỏ `subscriptionId`; server tự chọn theo thứ tự C-13 (trống ở phòng mình → trống cùng gói ở phòng khác → báo cần mua). Hệ quả: ít lỗi người dùng, nhưng IT mất quyền chọn khi có nhiều thuê bao.
  - **(C)** Endpoint riêng "chuyển seat" trước khi cấp.
- **Khuyến nghị: (A) + server gợi ý mặc định theo C-13** trong `provisioningTaskGet`, để FE điền sẵn thay câu "nếu được hỗ trợ".

### Q-05 — `saasIssueTransition.linkedWork` (4 id liên kết)

- **Bối cảnh.** FR-2.15 cho kết quả *dẫn* sang luồng có sẵn: thử lại tác vụ, sai lệch, hoàn trả, yêu cầu mới. Hiện chỉ `grantTaskId` được kiểm; 3 id còn lại lưu thẳng; FE không gửi.
- **Thực tế (không chắc nguồn).** Công cụ ITSM liên kết ticket với bản ghi khác bằng *related record* đã kiểm tồn tại.
- **Phương án.**
  - **(A)** Giữ cả 4, kiểm tồn tại và cùng tổ chức, cộng dồn thay vì ghi đè.
  - **(B)** Chỉ giữ `grantTaskId` + `requestId` (hai luồng FE có màn hình), bỏ `discrepancyId`, `returnId`.
  - **(C)** Bỏ hẳn `linkedWork`, ghi liên kết bằng chữ trong `message`.
- **Khuyến nghị: (A).** Rẻ, đúng FR-2.15.

### Q-06 — `vendorTaxProfileSet.lines[].taxType`: chữ tự do hay mã?

- **Bối cảnh.** `QĐ-55a` yêu cầu ghi loại thuế đúng chứng từ và báo cáo tách chênh lệch thuế. Chữ tự do khiến "GTGT", "VAT", "Thuế GTGT" thành ba loại; FE cũng lẫn label/placeholder.
- **Phương án.**
  - **(A)** Mã đóng (`VAT`, `CIT_WITHHOLDING`, `FCT`, `OTHER`) + `label` tùy chọn.
  - **(B)** Giữ chữ tự do, thêm gợi ý.
- **Khuyến nghị: (A).** Thuộc ranh giới V2 (finance); hỏi chung với V2 nếu cần.

### Q-07 — `licenseKeyReveal`: xem khóa đầy đủ ngoài lúc cấp?

- **Bối cảnh.** `QĐ-54b`/FR-2.10: *chỉ IT Admin xem đầy đủ khi cấp*, mỗi lần xem ghi Audit Trail. Hiện xem được bất kỳ lúc nào, chỉ giới hạn tần suất. Cấp K4 chưa hỗ trợ (N-05).
- **Thực tế (không chắc nguồn).** Kho secret (Vault, 1Password Business) thường đòi lý do/ticket khi reveal.
- **Phương án.**
  - **(A)** Bắt buộc `provisioningTaskId` (tác vụ cấp K4 đang làm, gắn đúng khóa).
  - **(B)** Bắt buộc `reason` (chữ) khi không có tác vụ, Audit Trail ghi lý do.
  - **(C)** Giữ như hiện tại.
- **Khuyến nghị: (A)** khi K4 grant được làm; trong lúc chờ thì **(B)**.

### Q-08 — `subscriptionRenewalRecordOutcome.nextPeriod.unitPrice` cao hơn kỳ cũ

- **Bối cảnh.** `QĐ-96i`/`QĐ-100ad` chỉ nói **số lượng** vượt mức đang trả thì đi Request tăng cấp. Nhà cung cấp **tăng giá** khi gia hạn (cùng số seat) thì chưa có quy tắc.
- **Ví dụ.** Figma gia hạn 92 seat, đơn giá 12 → 15 USD. Chi kỳ mới tăng 25 % mà không ai duyệt chi.
- **Thực tế (không chắc nguồn).** Vendr/Zylo coi tăng giá khi gia hạn là sự kiện cần phê duyệt mua sắm (price uplift).
- **Phương án.**
  - **(A)** Cho ghi, nhưng bật cờ *tăng chi phí kỳ mới*, báo Finance và trưởng phòng sở hữu, Người duyệt chi thấy trên tổng quan.
  - **(B)** Phần chênh giá là Request tăng cấp thuê bao như `QĐ-100ad`.
  - **(C)** Không làm gì.
- **Khuyến nghị: (A)** cho MVP. (B) nặng và chưa có QĐ.

### Q-09 — Hợp đồng và tệp đính kèm: `contractCreate` chỉ có `name`; `documentAttach` chỉ gắn vào contract

- **Bối cảnh.**
  - BRD 5.1: Contract bao nhiều Subscription, có thể nhiều năm.
  - `QĐ-96d`: IT đính biên lai/hóa đơn tải từ trang quản trị **vào thuê bao và kỳ tương ứng**.
  - Hiện contract không có vendor, thuê bao, ngày; tệp chỉ gắn được vào contract.
- **Thực tế (không chắc nguồn).** Zylo/Flexera lưu contract gắn vendor + nhiều thuê bao; tài liệu đính vào cả contract lẫn bản ghi mua.
- **Phương án.**
  - **(A)** `documentAttach` nhận `{ contractId } | { subscriptionId }`. Contract thêm `vendorId` + `subscriptionIds[]` tùy chọn; `name` bắt buộc.
  - **(B)** Chỉ thêm đích `subscriptionId` cho tệp (đủ `QĐ-96d`), contract giữ tối giản nhưng bắt buộc `name`.
  - **(C)** Giữ.
- **Khuyến nghị: (B)** cho MVP. Thêm migration cột `subscription_id` trên `document_attachments`.

### Q-10 — `licenseAssignmentChangeResponsible.expectedEndDate`

- **Bối cảnh.** `QĐ-43a`: dòng mới giữ cùng loại, lý do, định danh, phòng sở hữu. Văn bản không nói ngày kết thúc dự kiến. Hiện IT đặt tùy ý, có thể xa hơn ngày của dòng cũ (thời hạn đã duyệt của Request tài khoản dịch vụ).
- **Phương án.**
  - **(A)** Mặc định = ngày của dòng cũ; chỉ cho **sớm hơn** (ví dụ người mới là nhà thầu hết hợp đồng sớm). Bắt buộc khi người mới thuộc nhóm có thời hạn, giữ INV-07.
  - **(B)** Giữ tự do.
  - **(C)** Luôn kế thừa, không cho nhập.
- **Khuyến nghị: (A).**

---

## 6. Rủi ro và ghi chú cho pha spec

- **Migration.**
  - N-01: enum `deciderRole` (`SPENDING_APPROVER` → `DEPARTMENT_HEAD`), lý do chờ `NO_SPENDING_APPROVER` → `NO_HEAD`. Có thể cần bảng "bản ghi xác nhận" theo US-11-06 AC-13.
  - N-04/Q-04: phòng chịu chi phí trên Assignment khi chuyển seat.
  - Q-09: `document_attachments.subscription_id`.
  - Q-05 (cộng dồn liên kết): đổi `linked_work` sang mảng.
- **Seed/demo.** Hồ sơ gia hạn demo có `deciderRole = SPENDING_APPROVER` cần chuyển; listener `spending-approver-wait.listener.ts` và thông báo `CONTROLLED_WAIT_ALERT` (subject `SUBSCRIPTION_RENEWAL`) thành thừa (A5).
- **FE.**
  - Renewal chưa có FE nên đổi API không gãy FE. Phải sửa tài liệu `API-Integration/roles/spending-approver.md:7,33`, `reference/subscription-renewals.md`, `roles/manager.md` (thêm thao tác xác nhận).
  - Grant: đổi label "Dùng mặc định của máy chủ…".
  - F3/F5: thêm ô **ND** (`noticeDeadline`); sửa F5 để gửi `null` cho `noticePeriodDays` khi xóa.
  - F3: thêm `revocationNote`/`dataLossOnRemoval` khi tạo gói.
  - Cần picker thay các ô UUID thô (`businessOwnerEmployeeId`, `ownerDepartmentId`, `responsibleEmployeeId`, `employeeId`, `ofIssueId`).
- **Test bị ảnh hưởng.** `renewal-decision.policy.spec.ts`, `renewal-proposal.policy.spec.ts`, `renewal-outcome.policy.spec.ts`, test HTTP/integration `test/http/licensing/` cho gia hạn; `provisioning-grant.policy.spec.ts`, test `assertSubscriptionDepartment`; `handover-confirmer.policy.spec.ts`; `revocation.policy` spec (completion mặc định).
- **Phụ thuộc chéo.**
  - N-05 (K4) và N-06 (thuê bao linh hoạt) là lệch nghiệp vụ thuộc **A3-LICENSING**; ở đây chỉ ghi phần trường.
  - Q-06 giáp **V2-SPEND-API**.
  - Tệp đính kèm BM-11 chờ `OQ-31`.

---

## Tóm tắt kết luận trường

181 trường đã rà (body + cột CSV có nghĩa).

| Kết luận | Số trường |
| --- | --- |
| GIỮ | 154 |
| ĐỔI | 20 |
| SERVER TÍNH | 5 |
| BỎ | 1 |
| CHUYỂN BƯỚC | 1 (+ 1 lệch vai mức operation) |

Thêm 6 mục THIẾU:
- `seatSource` + `purchaseReason`;
- tệp BM-11;
- giá trị completion K4;
- đích `subscriptionId` cho tệp;
- `CONFIRM`/`REQUEST_CHANGES`;
- `CHANGE_TIER`.

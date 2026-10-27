# Impact matrix: G0–G6 trên baseline nghiệp vụ cuối (`QĐ-87` → `QĐ-92`)

- Nguồn (pin cuối, Owner disposition P03-D16 = A ngày 26/10/2026): Docs
  `main = origin/main = e0cb5a0045c1db2b8d607fe3cddd46dc2aaa1f36` (sổ `QĐ-01` → `QĐ-92`; BRD v3.57; Định nghĩa phạm vi v1.36 — chỉ
  metadata; User Stories v0.15 — 157 mã, 144 dùng, 13 `RETIRED`, **1 560 AC**; Full Logical ERD 3.3; State Machine `SM-01` → `SM-05`;
  handoff `BE-UserStory/handoffs/organization-workforce-authority-2026-10-24.md` gồm `BEH-14`, `T-10`, `T-11`), BE `7c28e75`
  (`dev = origin/dev`, CI run `40311320867` success; mã sản phẩm không đổi từ audit đầu).
- Pin trước của Prompt 03: Docs `769bb64e84afeb679eadd48c4abd451a7c879779` (`QĐ-01` → `QĐ-90`, BRD v3.55, 1 550 AC). F01 → F61 lập trên pin đó;
  delta `769bb64..e0cb5a0` được audit riêng một lượt nguồn ở [mục 3.8](#38-delta-docs-769bb64e0cb5a0-qđ-91-qđ-92) và [mục 10](#10-phạm-vi-delta-docs-769bb64e0cb5a0).
- Lập bởi: AI theo giao việc Owner (Prompt 03, 26/10/2026), chỉ đọc mã sản phẩm. Sáu agent chỉ đọc truy vết theo G
  (G0–G2, G3, G4, G5, G6, contract/migration/H7); agent chính kiểm lại tại nguồn mọi finding Blocker/High trước khi ghi. Delta
  `769bb64..e0cb5a0`: agent chính tự đọc nguồn và mã (không agent phụ).
- Đây là **inventory đầy đủ** của Prompt 03 (một nguồn); [báo cáo review](../../../reviews/g0-g6-final-business-baseline-review-2026-10-26/README.md)
  chỉ tóm tắt và dẫn về đây. [Spec](spec.md) · [plan](plan.md) · [test matrix](test-matrix.md).

## 1. Cách đọc

- **Phân loại** (đúng tám nhãn của Prompt 03): `aligned` · `documentation drift` · `implementation gap` ·
  `contract change` · `migration/backfill required` · `ADR/Owner decision required` · `business-source question` ·
  `obsolete`. Mỗi finding có **một** nhãn chính để đếm; nhãn phụ ghi trong dòng.
- **Mức độ:** Blocker (không được đưa lên `main` khi còn mở) · High · Medium · Low.
- **Phase** là phase nội bộ của [plan](plan.md) (P0 → P7); `—` là không làm trong Prompt 04 (carry/deferred). Task, dòng test/bằng
  chứng hoặc nhãn không triển khai của từng finding: [plan § Phủ finding](plan.md#phủ-finding).
- **Danh sách finding chuẩn** là bảng [mục 3.0](#30-tóm-tắt) — mọi finding ở đó (gồm finding của delta Docs cuối) có chủ ở plan; không
  văn bản nào khác được dùng một dải ID cố định làm phạm vi. ID mới luôn là số kế tiếp, không tái dùng.
- **Disposition** `P03-Dxx` là câu hỏi Owner ở [spec](spec.md#owner-dispositions); Owner trả lời ngày 27/10/2026 mọi mục chặn = A, hệ
  quả ở [spec mục L](spec.md#l-hệ-quả-của-disposition-owner-27102026). Đường dẫn code tương đối gốc BE ở `7c28e75`.
- Nguồn Docs ghi dạng `DL Lnnnn` (dòng của `Decisions/project-decisions.md` — ở `769bb64` cho F01 → F61; ở `e0cb5a0` cho finding của
  mục 3.8: `QĐ-91` L2956–L2989, `QĐ-92` L2991–L3018), `BRD`, `EP-xx` (tệp `BE-UserStory/src/EP-xx.md`) và `BEH-xx` (handoff).

## 2. Số đếm

| Nhãn chính                  | Số finding | Đổi do delta `769bb64..e0cb5a0`                                                  |
| --------------------------- | ---------- | -------------------------------------------------------------------------------- |
| implementation gap          | 35         | +6 (F62 → F67); +1 F33 (từ _business-source question_ — P03-D08 đóng theo nguồn) |
| contract change             | 9          | —                                                                                |
| migration/backfill required | 6          | —                                                                                |
| obsolete                    | 5          | —                                                                                |
| documentation drift         | 5          | — (F61 mở rộng)                                                                  |
| ADR/Owner decision required | 4          | —                                                                                |
| business-source question    | 3          | −1 (F33)                                                                         |
| **Tổng finding**            | **67**     | 61 (pin `769bb64`) + 6                                                           |
| aligned (dòng trace, mục 4) | 43         | +5 dòng G5 của `QĐ-91`/`QĐ-92`                                                   |

| Mức độ  | Số  | Finding                                                                                                                     |
| ------- | --- | --------------------------------------------------------------------------------------------------------------------------- |
| Blocker | 6   | F01, F02, F10, F27, F40, F42                                                                                                |
| High    | 22  | F03, F04, F05, F06, F08, F09, F11, F15, F16, F17, F19, F20, F28, F29, F31, F36, F41, F43, F62, F63, F65, F67                |
| Medium  | 25  | F07, F12, F13, F14, F18, F21, F22, F24, F25, F26, F30, F32, F33, F34, F37, F44, F46, F49, F53, F54, F55, F58, F60, F64, F66 |
| Low     | 14  | F23, F35, F38, F39, F45, F47, F48, F50, F51, F52, F56, F57, F59, F61                                                        |

## 3. Findings

Thứ tự: nền schema → tổ chức/danh tính (G0–G2) → danh mục/license (G3–G4) → Request/ngân sách (G5) → nhân sự (G6) →
contract/xuyên suốt. Tóm tắt một dòng ở mục 3.0; chi tiết ở mục 3.1 → 3.6; delta Docs cuối (`QĐ-91`, `QĐ-92`) ở mục 3.8.

### 3.0 Tóm tắt

| ID  | Mức     | Nhãn chính                  | G     | Lỗi                                                                                                  | Phase      | Disposition           |
| --- | ------- | --------------------------- | ----- | ---------------------------------------------------------------------------------------------------- | ---------- | --------------------- |
| F01 | Blocker | migration/backfill required | G2    | Phòng bắt buộc có Cost Center; liên kết nằm ở phòng; không có `linkedAt`                             | P1, P2     | —                     |
| F02 | Blocker | migration/backfill required | G3    | Thuê bao không có phòng sở hữu                                                                       | P1, P3     | P03-D03 = A           |
| F03 | High    | migration/backfill required | G2    | Danh mục chức vụ còn bắt buộc và còn API                                                             | P1, P2     | P03-D04, D05, D07 = A |
| F04 | High    | obsolete                    | G3–G6 | Bộ công cụ chuẩn còn sống; mọi Request bị đòi lý do _ngoài bộ chuẩn_                                 | P1–P5      | P03-D06, D07 = A      |
| F05 | High    | obsolete                    | G3    | Phân bổ chi phí theo tỷ lệ còn sống                                                                  | P1, P3     | P03-D06, D07 = A      |
| F06 | High    | obsolete                    | G6    | Chuyển tài khoản dịch vụ sang phòng khác còn sống                                                    | P1, P5     | P03-D06, D07 = A      |
| F07 | Medium  | migration/backfill required | G4    | Tác vụ cấp duy nhất trọn đời theo Assignment, không theo tác vụ đang mở                              | P1         | —                     |
| F08 | High    | contract change             | G4    | Chuyển làm tay đòi bằng chứng; xóa lỗi gần nhất                                                      | P1, P3     | —                     |
| F09 | High    | implementation gap          | G1    | Lệnh cài đặt tạo Cost Center, chức vụ, Employee IT                                                   | P2         | —                     |
| F10 | Blocker | contract change             | G2    | Ghi phòng/trưởng phòng/phân công/dự án chỉ IT Admin, không căn cứ                                    | P2         | —                     |
| F11 | High    | contract change             | G2    | Sửa trường hồ sơ chính thức chỉ IT Admin                                                             | P2         | —                     |
| F12 | Medium  | contract change             | G2/G6 | Super Admin không đọc được dữ liệu tổ chức; IT Admin đọc đầy đủ mọi phòng                            | P2, P5     | —                     |
| F13 | Medium  | implementation gap          | G2–G6 | Quyền chỉ ở guard controller, service không giữ bất biến (gồm `budgets`)                             | P2–P5      | —                     |
| F14 | Medium  | contract change             | G2    | Checklist bước 1 còn chặn _không có Cost Center trống_, gợi ý bộ chuẩn                               | P2         | —                     |
| F15 | High    | implementation gap          | G2    | Ngừng phòng thiếu điều kiện việc đang mở và thuê bao còn nghĩa vụ (`QĐ-90e`)                         | P2         | —                     |
| F16 | High    | implementation gap          | G2    | Cost Center chưa tạo cho phòng; ngừng Cost Center chỉ xét thành viên                                 | P2         | —                     |
| F17 | High    | implementation gap          | G2/G6 | Thiếu thông báo bù và người nhận `D-7` (gồm `P28-09`)                                                | P2, P5     | P03-D15               |
| F18 | Medium  | implementation gap          | G1    | Lời mời khôi phục gửi email công việc hiện tại (`P28-05`)                                            | P2         | —                     |
| F19 | High    | ADR/Owner decision required | G1/G6 | Super Admin là đối tượng (`QĐ-87c`, `QĐ-88b`) chưa có thủ tục                                        | P1, P2, P5 | P03-D02 = A           |
| F20 | High    | implementation gap          | G4    | Phòng sở hữu của Assignment ≠ của thuê bao; đích cấp không theo phòng                                | P1, P3     | —                     |
| F21 | Medium  | implementation gap          | G4/G6 | Bước 4 khởi tạo (`QĐ-89e`) không ghi phòng sở hữu, không rà soát người phòng khác                    | P3, P5     | —                     |
| F22 | Medium  | implementation gap          | G2/G4 | Read model phần mềm phòng thiếu `K4`, nhãn `K1` đang chấm dứt, theo phòng người giữ                  | P3         | —                     |
| F23 | Low     | implementation gap          | G3    | Khai thuê bao/nhập khóa cho ứng dụng đã ngừng không bị chặn                                          | P3         | —                     |
| F24 | Medium  | implementation gap          | G4    | Đếm IT Admin dùng được ngoài giao dịch; không báo Super Admin khi tự thực thi                        | P3         | P03-D15               |
| F25 | Medium  | implementation gap          | G4    | Đảo thứ tự khóa giữa cấp và đóng thất bại (Request nhóm)                                             | P3         | —                     |
| F26 | Medium  | business-source question    | G3    | PATCH thuê bao tăng số lượng/kéo dài kỳ khi phòng chưa có Cost Center                                | P3         | P03-D09 = A           |
| F27 | Blocker | implementation gap          | G5    | Không có cổng _cấu hình tài chính chưa hoàn tất_; không có nháp Request trả phí                      | P1, P4     | P03-D01 = A           |
| F28 | High    | implementation gap          | G5    | Request trả phí bị xác định lại bước nhu cầu khi điều chuyển                                         | P4         | —                     |
| F29 | High    | contract change             | G5/G6 | Thiếu kết cục _bị hủy — người thụ hưởng điều chuyển_ và đường IT Admin đóng                          | P1, P4, P5 | —                     |
| F30 | Medium  | contract change             | G5    | Super Admin gửi được Request                                                                         | P4         | —                     |
| F31 | High    | implementation gap          | G5    | Duyệt chi song song cùng Cost Center/năm không được tuần tự hóa                                      | P4         | —                     |
| F32 | Medium  | implementation gap          | G5    | `SoD-8` (người rà soát ≠ Người duyệt chi) không được chặn                                            | P4         | —                     |
| F33 | Medium  | implementation gap          | G5    | _Cần sửa ngân sách_ chỉ cho `NO_ACTIVE_BUDGET`; kiểm lại chỉ bắt Request `NO_ACTIVE`                 | P4         | — (D08 đóng)          |
| F34 | Medium  | implementation gap          | G5    | Request trả phí giá 0 → 500 ở bước tạo khoản cam kết                                                 | P4         | —                     |
| F35 | Low     | business-source question    | G5    | Mọi kỳ có giá đều coi là ràng buộc (kỳ hủy được phải là dự báo)                                      | —          | P03-D10               |
| F36 | High    | implementation gap          | G5    | Phiên bản ngân sách nháp của đề xuất đã rút/trả về kẹt vĩnh viễn (sửa trong tập trạng thái `QĐ-91a`) | P1, P4     | —                     |
| F37 | Medium  | implementation gap          | G5/G6 | Ba đường 500 (lý do null, `planId` lạ, recorder không bọc `guarded`)                                 | P4, P5     | —                     |
| F38 | Low     | business-source question    | G5    | Giá Request lấy thuê bao mới nhất của gói ở mọi phòng                                                | P4         | P03-D11 = A           |
| F39 | Low     | implementation gap          | G5    | Trùng số phiên bản ánh xạ thành `VERSION_IN_FLIGHT`                                                  | P4         | —                     |
| F40 | Blocker | contract change             | G6    | Ghi sự kiện nhân sự và xử lý `BM-09` chỉ IT Admin                                                    | P5         | —                     |
| F41 | High    | migration/backfill required | G6    | Đổi chức vụ còn là sự kiện và loại `BM-09`                                                           | P1, P5     | P03-D05 = A           |
| F42 | Blocker | implementation gap          | G6    | Rà soát sau điều chuyển chỉ phủ công cụ ngoài bộ chuẩn                                               | P5         | —                     |
| F43 | High    | implementation gap          | G6    | _Còn cần_ không tạo Request mới, không thu hồi seat cũ                                               | P5         | —                     |
| F44 | Medium  | implementation gap          | G6    | Điều chuyển vào phòng chưa có Cost Center bị từ chối                                                 | P5         | —                     |
| F45 | Low     | obsolete                    | G6    | Cờ _tự thực thi_ cho sự kiện nhân sự về chính IT Admin                                               | P5         | —                     |
| F46 | Medium  | implementation gap          | G6    | Một sự kiện chờ xuyên bảng chỉ có kiểm dịch vụ, thiếu test đua có barrier                            | P5         | —                     |
| F47 | Low     | migration/backfill required | G6    | Seed _đã báo_ dùng `CURRENT_DATE` của phiên CSDL thay múi giờ tổ chức                                | P5         | —                     |
| F48 | Low     | implementation gap          | G6    | Sequence mã `BM09-`/báo lỗi `MAXVALUE 999999`, không reset theo năm                                  | P5         | —                     |
| F49 | Medium  | documentation drift         | All   | Mô tả OpenAPI lệch mã với tới được (`F1`, `F2`, `F4`, `F7`, `F8`, `F10`)                             | P6         | —                     |
| F50 | Low     | obsolete                    | G5/G6 | Mapper lỗi không có nơi ném                                                                          | P6         | —                     |
| F51 | Low     | documentation drift         | All   | Hai cặp migration cùng mốc thời gian; `DB-15` không có gate                                          | P6         | —                     |
| F52 | Low     | implementation gap          | H7    | Suite vai runtime chưa chạy đường G5/G6                                                              | P6         | —                     |
| F53 | Medium  | ADR/Owner decision required | All   | Chín sweeper chạy trong tiến trình API, tài liệu nói worker                                          | P6         | P03-D12               |
| F54 | Medium  | ADR/Owner decision required | G5    | Allowlist nội module tăng ~75 mục cho repo xuyên capability                                          | —          | P03-D13               |
| F55 | Medium  | ADR/Owner decision required | All   | Gate collection chỉ GET; `LD-13` bảy điểm còn mở                                                     | —          | P03-D14               |
| F56 | Low     | contract change             | All   | Ngày/tiền trong OpenAPI không có `format`/`pattern`                                                  | —          | P03-D14               |
| F57 | Low     | documentation drift         | All   | Trộn `uuid()` v4 và `uuid(7)` không có rule                                                          | —          | —                     |
| F58 | Medium  | implementation gap          | G4    | Cảnh báo license của `FR-5.14` không vào hộp thông báo                                               | —          | P03-D15               |
| F59 | Low     | implementation gap          | G4–G6 | Test đồng thời dùng `Promise.all`/sleep thay barrier                                                 | P6         | —                     |
| F60 | Medium  | documentation drift         | All   | Roadmap/spec/scope map pin `72e1480`; trạng thái cũ                                                  | P0, P6     | —                     |
| F61 | Low     | documentation drift         | Docs  | Handoff Docs còn câu _chưa Owner review/commit_ (cả ở `e0cb5a0`); ghi chú Logical ERD                | —          | —                     |
| F62 | High    | implementation gap          | G5    | Không có đóng cuối năm tài chính cho phiên bản/đề xuất (`QĐ-91c`, `QĐ-91e`)                          | P1, P4     | —                     |
| F63 | High    | implementation gap          | G5    | Từ chối phiên bản trả đề xuất về trưởng phòng; không lập lại từ cùng đề xuất (`QĐ-92c`)              | P1, P4     | —                     |
| F64 | Medium  | implementation gap          | G5    | Finance tạo được phiên bản sửa đổi khi phòng chưa có trưởng phòng (`QĐ-92d`(1))                      | P4         | —                     |
| F65 | High    | implementation gap          | G5    | Request chờ phiên bản: rời trạng thái chờ khi bị từ chối; Finance không xử lý được (`QĐ-92a`)        | P1, P4     | —                     |
| F66 | Medium  | implementation gap          | G5    | Sửa phiên bản không lưu trước/sau; không có lịch sử sửa (`QĐ-91d`)                                   | P1, P4     | —                     |
| F67 | High    | implementation gap          | G5    | Không có thông báo vòng ngân sách/Finance (`FR-5.14` dòng 18, 40, 41, 47, 48, 52 → 55)               | P1, P4     | —                     |

### 3.1 Nền schema và dữ liệu

#### F01 — Phòng bắt buộc có Cost Center; liên kết ở phía phòng

- **Mức / nhãn:** Blocker · migration/backfill required (+ contract change).
- **Nguồn:** `QĐ-87d`(1)(2)(3) DL L2799, `QĐ-87g`(1) DL L2802, `D-10` → `D-13` DL L2805; BRD `FR-3.1`, `INV-14a`,
  `INV-14b`; `US-03-06` AC-1, AC-2; `US-02-03` AC-7; `US-04-09` AC-1, AC-3, AC-7 → AC-13; BEH-03, BEH-06; Logical R21
  (`CostCenter.departmentId`, `UNIQUE(departmentId) WHERE status = ACTIVE`, `CostCenter.linkedAt`).
- **Code:** `prisma/models/organization.prisma:144` (`Department.costCenterId String @unique`, bắt buộc);
  `src/modules/organization/department/department.dto.ts:15` (`costCenterId` bắt buộc), `:56-61` (`costCenter` non-null);
  `src/modules/organization/department/department.service.ts:71-76`; `src/modules/organization/employee-placement.policy.ts:43-48`
  (`DEPARTMENT_COST_CENTER_INACTIVE` chặn nhận người); trigger `departments_require_unit_cost_center`
  (`prisma/migrations/20261016150000_cost_center_lifecycle/migration.sql:22`); guard tài khoản dịch vụ đọc
  `departments.cost_center_id` (`prisma/migrations/20261022120000_cost_centers_unit_only/migration.sql:71-99`);
  `access_requests.cost_center_id NOT NULL` (`prisma/models/requests.prisma:144`).
- **Test:** `test/integration/departments-http.integration-spec.ts` (không có ca phòng thiếu Cost Center).
- **Dữ liệu:** đảo chiều liên kết 1–1 tất định (duy nhất ở `departments`); `linked_at` lấy mốc tạo sớm hơn của cặp;
  bỏ trigger cũ, viết lại guard tài khoản dịch vụ; `access_requests.cost_center_id` nullable chỉ cho nháp (F27). Sửa review `P03-RV-03`
  (27/10/2026): liên kết mới và hai trigger đồng bộ ở **bản tương thích**, bỏ cột/trigger cũ ở bản cuối; Cost Center tự do của `7c28e75`
  (`NO_FREE_COST_CENTER`) là **dữ liệu chuyển tiếp**: kiểm kê sống `COST_CENTER_UNLINKED` liệt kê (gồm dòng `7c28e75` tạo muộn), Finance liên kết từng dòng theo căn cứ có thẩm quyền bằng `pnpm ops:cost-center-direction link`, bản cuối `department_id`/`linked_at` NOT NULL và không deploy được khi còn — sửa review `P03-RV-04` ([spec L.11](spec.md#l11-cost-center-luôn-thuộc-một-phòng-chuyển-tiếp-và-bước-kích-hoạt-review-p03-rv-04)), thay ngoại lệ Cost Center thiếu phòng vĩnh viễn của `P03-RV-03`.
  Không có down — rollback là khôi phục bản sao lưu trước migrate (`DB-05`).
- **Wire:** `departmentCreate` bỏ `costCenterId` (và 409 `DEPARTMENT.COST_CENTER_TAKEN`, 422 `COST_CENTER_*`);
  `departmentList`/`departmentGet` trả `costCenter` nullable + cảnh báo _cấu hình tài chính chưa hoàn tất_;
  `costCenterCreate` thêm `departmentId` bắt buộc; `costCenterList` thêm `linkedAt`. Từ bản tương thích (spec L.11): `costCenterCreate` contract cuối, 422 `COST_CENTER.DEPARTMENT_NOT_ACTIVE`; `departmentCreate` Super Admin + `hrBasis`, 409 `DEPARTMENT.CREATION_AWAITING_ACTIVATION` trước bước kích hoạt (chỉ bản tương thích); lệnh `ops:cost-center-direction`.
- **Tái hiện:** `POST /api/v1/departments` không có `costCenterId` → 422 hôm nay.

#### F02 — Thuê bao không có phòng sở hữu

- **Mức / nhãn:** Blocker · migration/backfill required (+ contract change).
- **Nguồn:** `QĐ-89a`(1)(3)(4) DL L2874, `QĐ-89e` DL L2878; `US-04-03` AC-13; BEH-07(a); Logical mapping
  `Subscription.ownerDepartmentId` NOT NULL.
- **Code:** `prisma/models/catalog.prisma:295-333` (không có cột phòng); `src/modules/catalog/subscription/subscription.dto.ts:20-33`;
  `src/modules/catalog/subscription/subscription.service.ts:127-174` (khai), `:182-260` (PATCH), `:267-308`;
  `src/modules/catalog/subscription/subscription.repo.ts:118-126` (nơi ghi duy nhất).
- **Test:** không có test `US-04-03` AC-13; khoảng 23 tệp test tạo thuê bao.
- **Dữ liệu:** dòng cũ không có nguồn phòng (Contract chỉ có tên — `catalog.prisma:479-491`; Request không trỏ tới
  thuê bao). `QĐ-89e` cấm suy diễn ⟹ hai bước: cột nullable + gán theo căn cứ mua/hợp đồng, rồi NOT NULL (P03-D03 = A, Owner
  27/10/2026 — [spec L.3](spec.md#l3-phòng-sở-hữu-cho-thuê-bao-đã-có-p03-d03-f02): bảng gán chỉ ghi thêm, lệnh
  `pnpm ops:assign-subscription-owner`; mở rộng → gán → thu hẹp qua hai revision, không migration lỗi — review `P03-RV-01`). Production
  `main` chỉ có 5 migration nên chỉ CSDL dev/demo/VPS thử nghiệm có dữ liệu.
- **Wire:** `subscriptionCreate` thêm `ownerDepartmentId` bắt buộc; `subscriptionGet`/`List`/`Update` trả trường; mã lỗi
  mới cho phòng không hoạt động.

#### F03 — Danh mục chức vụ còn bắt buộc và còn API

- **Mức / nhãn:** High · migration/backfill required (+ contract change, obsolete).
- **Nguồn:** `QĐ-87e` DL L2800, `D-1`; `US-02-07` `RETIRED`; `US-02-02` AC-13; `US-02-03` AC-1, AC-2, AC-7; BEH-04, BEH-05(a).
- **Code:** `prisma/models/organization.prisma:227-247` (`JobTitle`), `EmployeePlacement.jobTitleId` NOT NULL;
  `src/modules/organization/employee/employee-manual.service.ts:80-84,106`;
  `src/modules/organization/employee/employee-row.validator.ts:53-59`; `src/modules/organization/employee-placement.policy.ts:17-24,47-49`
  (`JOB_TITLE_REQUIRED|NOT_FOUND|INACTIVE`); `src/modules/data-import/employee-import/employee-import-rows.ts:212-223`;
  `src/modules/organization/employee/employee.dto.ts:40,78`; năm operation `jobTitle*`; khoảng 82 tệp nguồn tham chiếu.
- **Dữ liệu:** `employee_placements.job_title_id` NOT NULL FK; `department_transfers.from/to_job_title_id` NOT NULL và CHECK
  cho phép điều chuyển chỉ đổi chức vụ (`20261024140200_personnel_department_transfers/migration.sql:17-18,42,101-105`);
  `transfer_reviews.job_title_id`; trigger `employee_placements_keep_history` cấm đổi giai đoạn đã báo
  (`20261024140100_organization_change_announcements/migration.sql:46-67`). Chép tên chức vụ thành chữ tự do, không bịa,
  không làm mất (P03-D04 = A — [spec L.4](spec.md#l4-chức-vụ-và-dữ-liệu-đổi-chức-vụ-cũ-p03-d04-p03-d05-f03-f41): giai đoạn hiện hành vào
  `employees.job_title`, lịch sử ở cột `job_title_name` chỉ đọc).
- **Wire:** `employeeCreate` `jobTitleId` → `jobTitle` chữ tự do, tùy chọn; phản hồi nullable; cột `job_title` của import
  thành chữ tự do; gỡ `jobTitleList|Create|Rename|Deactivate|Reactivate`.
- **Tái hiện:** dòng CSV có `job_title` rỗng → dòng ERROR `JOB_TITLE_REQUIRED` hôm nay.

#### F04 — Bộ công cụ chuẩn còn sống và bị cưỡng chế ở mọi Request

- **Mức / nhãn:** High · obsolete (+ contract change). **Lỗi sống:** khi chưa cấu hình bộ chuẩn nào,
  `outsideStandard` luôn đúng nên mọi lần gửi bị 422 nếu thiếu `outsideStandardReason`.
- **Nguồn:** `QĐ-87h`(1) DL L2803, `D-15`; `US-04-10` `RETIRED`; `US-05-01` AC-6 _(bỏ)_, `US-05-04` AC-7 _(bỏ)_; BRD
  `FR-3.18` đã bỏ; BEH-05(b).
- **Code:** `src/modules/requests/access-request/request-assessment.service.ts:118-120`;
  `src/modules/requests/access-request/access-request.service.ts:89`; nhóm, ủy quyền, gia hạn, xem trước, màn duyệt chi
  (`group-submission-facts.service.ts:105-175`, `renewal-request.service.ts:136,212-213`,
  `spend-approval-view.service.ts:212`); `src/modules/catalog/standard-toolset/standard-toolsets.controller.ts:54-170`;
  `src/modules/onboarding/onboarding.service.ts:50-57,171-180`; `src/modules/personnel/transfer-review/transfer-review.service.ts:51-53` (F42).
- **Dữ liệu:** bảng `standard_toolsets`, `_versions`, `_items` (trigger bất biến
  `20261020210000`, `20261021110000`); cột `access_requests.outside_standard`, `outside_standard_reason`
  (`20261023120000_requests_outside_standard_flag`). Số phận dữ liệu: P03-D06 = A — bỏ sau bản `pg_dump` được bảo vệ
  ([spec L.5](spec.md#l5-gỡ-bộ-chuẩn-phân-bổ-chuyển-phòng-tài-khoản-dịch-vụ-và-bản-sao-lưu-p03-d06-f04-f05-f06)).
- **Wire:** gỡ 5 operation `standardToolset*`; bỏ `outsideStandard`/`outsideStandardReason` (khoảng 40 lần trong
  `openapi.json`) khỏi `accessRequestSubmit|Preview|Get`, `groupRequestCheck|Submit`, `delegatedRequestSend`,
  `accessRequestRenewalSubmit`, `spendApprovalGet|List`; bỏ 422 `ACCESS_REQUEST.OUTSIDE_STANDARD_REASON_REQUIRED`.
- **Tái hiện:** tổ chức chưa có bộ chuẩn, gửi Request không có `outsideStandardReason` → 422.

#### F05 — Phân bổ chi phí theo tỷ lệ còn sống

- **Mức / nhãn:** High · obsolete (+ contract change).
- **Nguồn:** `QĐ-89a`(2) DL L2874; `INV-03` viết lại; `US-04-08` `RETIRED`; `US-12-13`; BEH-09.
- **Code:** `src/modules/catalog/subscription/subscription-allocation.controller.ts:56,75,129`; `src/modules/finance/cost-allocation/*`;
  `src/modules/finance/finance.service.ts:162-185`.
- **Dữ liệu:** `subscription_cost_allocations`, `_versions`, `_lines` (`prisma/models/finance.prisma:99-144`; trigger bất biến
  và tổng 10 000 ở `20261020180000`; guard ở `20261022110000:113-153`). Không còn consumer ngoài catalog/finance.
  Số phận dữ liệu: P03-D06 = A — bỏ sau bản `pg_dump` được bảo vệ ([spec L.5](spec.md#l5-gỡ-bộ-chuẩn-phân-bổ-chuyển-phòng-tài-khoản-dịch-vụ-và-bản-sao-lưu-p03-d06-f04-f05-f06)).
- **Wire:** gỡ `subscriptionCostAllocationGet|Set|History`, mã `SUBSCRIPTION.COST_ALLOCATION_NOT_APPLICABLE`, `COST_ALLOCATION.*`.

#### F06 — Chuyển tài khoản dịch vụ sang phòng khác còn sống

- **Mức / nhãn:** High · obsolete (+ contract change).
- **Nguồn:** `QĐ-89c` DL L2876 (thay một phần `QĐ-86c`, `QĐ-88c`); handoff C-03; `US-03-08` AC-7, AC-10, AC-8 _(bỏ)_.
- **Code:** `src/modules/licensing/assignment/assignments.controller.ts:142-178` (`licenseAssignmentProposeDepartmentMove`);
  `src/modules/licensing/assignment/service-account-moves.controller.ts:47-114`; `service-account-move.policy.ts:45-57,97-106`;
  `prisma/models/licensing.prisma:359-392`; migration `20261024190000_licensing_service_account_moves`. Đổi người chịu trách
  nhiệm **trong** phòng sở hữu (`assignment.policy.ts:76-79`) là `aligned`, giữ.
- **Dữ liệu:** dòng `service_account_moves` đang chờ hủy trên bản đang chạy trước deploy, lý do cố định; preflight chặn khi còn; bảng
  bỏ sau bản `pg_dump` được bảo vệ (P03-D06 = A — [spec L.5](spec.md#l5-gỡ-bộ-chuẩn-phân-bổ-chuyển-phòng-tài-khoản-dịch-vụ-và-bản-sao-lưu-p03-d06-f04-f05-f06)).
- **Wire:** gỡ `licenseAssignmentProposeDepartmentMove`, `serviceAccountMoveList|Confirm|Cancel`.

#### F07 — Tác vụ cấp duy nhất trọn đời theo Assignment

- **Mức / nhãn:** Medium · migration/backfill required.
- **Nguồn:** handoff C-01; Logical `UNIQUE(assignmentId, kind) WHERE status NOT IN (COMPLETED, CLOSED_FAILED, CANCELLED,
CANCELLED_NOT_APPLICABLE)`; `US-07-07` AC-9.
- **Code:** `prisma/migrations/20261024080000_licensing_revocation_tasks/migration.sql:76-77`
  (`provisioning_tasks_one_grant_per_assignment` không có điều kiện trạng thái); chỉ mục thu hồi đã đúng (`:78-79`).
- **Test:** `test/integration/provisioning-revocation-constraints.integration-spec.ts:181-186` khẳng định 23505.
- **Dữ liệu:** nới chỉ mục — dữ liệu hiện có luôn hợp lệ; không backfill. Thực thi lại cấp (`US-07-07`) vẫn ngoài G0–G6 —
  chỉ gỡ chặn.

#### F08 — Chuyển làm tay đòi bằng chứng; xóa lỗi gần nhất

- **Mức / nhãn:** High · contract change (+ migration CHECK).
- **Nguồn:** `QĐ-90a` DL L2922; BEH-10; `US-07-04` AC-9 (EP-07:192); `US-07-01` AC-7, AC-11; `US-07-02` AC-5.
- **Code:** `src/modules/licensing/provisioning/provisioning.dto.ts:28` (`handOffBodySchema = completeBodySchema`);
  `src/modules/licensing/provisioning/provisioning-decision.service.ts:56-75` (`cleanEvidence` trước tiên → 422
  `EVIDENCE_REQUIRED`); `src/modules/licensing/provisioning/provisioning-task.repo.ts:28-38,161-172` (`CLEARED` xóa `lastError`,
  `failureKind`, `failureReason`, `attempts`); CHECK `provisioning_tasks_hand_off_whole`
  (`20261020230100*/migration.sql:73-79`).
- **Test:** `test/integration/provisioning-decision-http.integration-spec.ts:99-101` khẳng định điều ngược `QĐ-90a`;
  `provisioning-failure-constraints.integration-spec.ts:250-256`.
- **Thiết kế (T-8):** bằng chứng = chữ không rỗng (ghi chú), tệp là tùy chọn sau; `ALREADY_GONE` lưu ghi chú làm bằng chứng
  (`revocation.policy.ts:145-146`) ⟹ `aligned` theo thiết kế này. Hoàn tất mọi tác vụ `MANUAL` (K1 → K5) đã đòi bằng chứng
  ở DB (`20261024030100_requests_withdrawal/migration.sql:122-128`) — `aligned`, thiếu test theo từng kiểu.
- **Wire:** body chuyển làm tay không còn `evidence` (client gửi thừa nhận 422 do `strictObject` — ghi trong handoff
  FE/Mobile); bỏ ví dụ `EVIDENCE_REQUIRED` của `/hand-off`.

### 3.2 Tổ chức, danh tính, khởi tạo (G0–G2)

#### F09 — Lệnh cài đặt tạo tập bản ghi cũ

- **Mức / nhãn:** High · implementation gap.
- **Nguồn:** `QĐ-87f`(1) DL L2801; BRD `FR-9.8`; `US-01-01` AC-19; `US-02-04` AC-4; BEH-01.
- **Code:** `src/modules/installation/installation.service.ts:89-97` (Cost Center `Unit`), `:99-108` (phòng gắn Cost Center),
  `:110-111` (chức vụ), `:113-132` (Employee Super Admin **và** IT Admin); `src/modules/installation/installation.input.ts:49-53,57`;
  sự kiện `INSTALLATION.*` không mang dấu _ngoại lệ cài đặt_ (`:64-76`).
- **Test:** `installation.service.spec.ts:14-39,71-82`; `test/integration/installation.integration-spec.ts:90,147,157,168`;
  `src/modules/installation/inspect/inspection-facts.ts:8-15` (đòi 1 Cost Center, 1 chức vụ, 2 Employee).
- **Dữ liệu:** bản cài đặt cũ giữ sự kiện cũ (append-only); `ops:inspect` phải nhận cả hai tập.
- **Aligned:** một giao dịch, khóa tư vấn, chạy lại thoát, mật khẩu do người giữ vai đặt.

#### F10 — Ghi cơ cấu tổ chức chỉ IT Admin, không căn cứ

- **Mức / nhãn:** Blocker · contract change.
- **Nguồn:** `QĐ-87a` DL L2796, `QĐ-87b`(1) DL L2797, `D-5`, `D-6`, `D-8`; `US-03-06` AC-1, AC-4 → AC-9, AC-14 → AC-16, AC-22;
  BEH-02, BEH-03.
- **Code:** `src/modules/organization/department/departments.controller.ts:36-40` (`IT_ONLY`), `:132,188,214,237,260`
  (`departmentCreate|Update|Deactivate|HeadAssign|HeadVacate`); `src/modules/organization/project/projects.controller.ts:103-105,120-122`;
  `department-head.service.ts:63-170` (không căn cứ); **không có** endpoint chỉ định người kế nhiệm trưởng phòng (`D-5`).
- **Test:** `test/integration/departments-http.integration-spec.ts:383-396` khẳng định Super Admin bị 403.
- **Wire:** các operation trên đổi vai thành `SUPER_ADMIN`, thêm `hrBasis` bắt buộc (tái dùng
  `src/infrastructure/http/dto/hr-basis.dto.ts:8-13`); thêm operation chỉ định/hủy người kế nhiệm.
- **Aligned:** Super Admin không làm trưởng phòng, trưởng phòng là thành viên (`department-head.service.ts:82-86`).

#### F11 — Sửa trường hồ sơ chính thức chỉ IT Admin

- **Mức / nhãn:** High · contract change.
- **Nguồn:** `QĐ-87a`, `D-8`, `D-9`; `US-02-02` AC-19; `US-14-06` (nơi nhận yêu cầu chỉnh sửa → Super Admin, `D-3`).
- **Code:** `src/modules/organization/employee/employee-maintenance.controller.ts:24` (`@RequireRoles('IT_ADMIN')` cấp lớp);
  logic `SoD-5` tự sửa `employee-maintenance.service.ts:68-71` hết đối tượng; chức vụ không sửa được.
- **Test:** `test/integration/employee-maintenance-http.integration-spec.ts:139-150` (Super Admin 403), `:241-260`.
- **Wire:** `employeeUpdateOfficialFields` → `SUPER_ADMIN`, thêm `jobTitle` chữ tự do; từ chối hồ sơ của chính Super Admin.

#### F12 — Phạm vi đọc: Super Admin và IT Admin tối thiểu

- **Mức / nhãn:** Medium · contract change.
- **Nguồn:** `QĐ-87b`(4) DL L2797, `D-4`; BRD 7.2; `US-03-01` AC-24; `US-03-11` AC-10.
- **Code:** `departments.controller.ts:166,283` (chỉ IT Admin/Manager; Super Admin chỉ `/department-warnings` `:308`);
  `department-query.service.ts:133-135` (IT Admin thấy mọi phòng; dòng thành viên lộ họ tên, `workState`, `memberSince`);
  đọc điều chuyển/nghỉ dài/nghỉ việc chỉ IT Admin và trả `grounds` (`src/modules/personnel/transfer/transfer.dto.ts:91-92`);
  `notice-query.service.ts:43,61,72` (IT Admin thấy cả hàng đợi và bản ghi xác minh).
- **Test:** `departments-http.integration-spec.ts:857-863` (Super Admin 403 khi đọc).
- **Wire:** Super Admin đọc đầy đủ; IT Admin nhận projection kỹ thuật tối thiểu, chỉ phòng được giao/xử lý thay — `EmployeeTechnicalView`, phòng khác 404 ([spec K](spec.md#k-tên-chốt--mã-lỗi-cột-khóa-mã-thông-báo-26102026-prompt-03-tiếp)).

#### F13 — Quyền chỉ ở guard controller

- **Mức / nhãn:** Medium · implementation gap.
- **Nguồn:** `QĐ-87a`, `SoD-1`, `SoD-2`, `SoD-5`; Prompt 03 §2 (không chấp nhận guard controller là bất biến duy nhất).
- **Code:** `src/infrastructure/security/guards/authorization.guard.ts:22-35`; service nhận `actor` chỉ để audit
  (`department.service.ts:54-99`, `department-head.service.ts:63`); `DepartureCancellationService`, `GroupLineClosureService`
  dựa vào `@RequireRoles` của controller.
- **Mở rộng (delta `e0cb5a0`, cùng lỗi):** `budgets/budget` — `VersionService.createFromProposal`, `createRevision`, `update`, `send`,
  `VersionLineService`, `LineImportService` và `ProposalService.giveBack` không kiểm vai `FINANCE` ở service, chỉ có
  `@RequireRoles('FINANCE')` ở `budget-versions.controller.ts:88-231`/`budget-proposals.controller.ts:194`
  (`proposal.service.ts:106-121`, `version.service.ts:50-227`). Đường mới của delta (lập lại phiên bản từ cùng đề xuất — F63, đóng cuối
  năm — F62, chuyển Request đang chờ — F65) đặt quyền và điều kiện ở policy service ngay từ đầu.
- **Sửa:** policy vai/tự thao tác/căn cứ trong service (một policy mỗi capability), test ở cấp service.

#### F14 — Checklist khởi tạo bước 1

- **Mức / nhãn:** Medium · contract change.
- **Nguồn:** `QĐ-87f`(2), `QĐ-87h`; `US-02-04` AC-1, AC-4, AC-6 (AC-5 _(bỏ)_).
- **Code:** `src/modules/onboarding/onboarding.service.ts:24,111` (`NO_FREE_COST_CENTER`), `:50-57,171-180` (`STANDARD_TOOLSET`),
  `:112-130` (không có cảnh báo thiếu Cost Center; enum cảnh báo chỉ `MISSING_HEAD`, `MISSING_IT_ADMIN` — `onboarding.controller.ts:53`);
  `onboarding.controller.ts:82` (chỉ IT Admin đọc). Quy tắc hoàn tất `:95-99` `aligned`.
- **Test:** `onboarding.service.spec.ts:123-127,229-259` khẳng định hành vi cũ.

#### F15 — Điều kiện ngừng phòng

- **Mức / nhãn:** High · implementation gap. Phụ thuộc F02.
- **Nguồn:** `QĐ-90e` DL L2926, `QĐ-66b`, `QĐ-86c`; `US-03-06` AC-19.
- **Code:** `department.service.ts:166-176` chỉ xét thành viên và tài khoản dịch vụ; `department.errors.ts:48-59`
  (`DepartmentInUseError` hai nhóm).
- **Wire:** 409 `DEPARTMENT.IN_USE` thêm nhóm `openWork` và `subscriptions` (có biên); khoản mua vĩnh viễn không còn
  Assignment không chặn.

#### F16 — Vòng đời Cost Center của Finance

- **Mức / nhãn:** High · implementation gap. Phụ thuộc F01.
- **Nguồn:** `QĐ-87d`(1)(2) DL L2799; `US-04-09` AC-1, AC-3, AC-7 → AC-13.
- **Code:** `src/modules/organization/cost-center/cost-center.dto.ts:10-14` (không có `departmentId`);
  `cost-center.service.ts:125-161` (ngừng chỉ chặn khi phòng còn thành viên; không xét Request có chi phí chưa kết thúc,
  khoản cam kết đang giữ, hóa đơn/sao kê chưa đối soát). Sau khi ngừng, phòng về _cấu hình tài chính chưa hoàn tất_.
- **Ghi chú:** hóa đơn/sao kê là G8/G9 — kiểm phần đã có bảng (Request, khoản cam kết); phần còn lại ghi `blocked` theo nhóm sau.

#### F17 — Thông báo bù và người nhận `D-7`

- **Mức / nhãn:** High · implementation gap.
- **Nguồn:** `QĐ-87b`(3) (báo nhân viên bị tác động và trưởng phòng liên quan), `D-7` DL L2805; `US-02-02` AC-17 (`P28-09`),
  AC-19; `US-03-10`, `US-03-11` (người nhận `BM-09`).
- **Code:** không có lời gọi thông báo trong `src/modules/organization`, `src/modules/data-import`;
  `src/modules/notifications/inbox/inbox.policy.ts:28-61` không có mã cho hồ sơ mới/sự kiện nhân sự;
  `notice-overdue.service.ts:38`, `transfer-review-overdue.service.ts:48`, `notice.service.ts:132-146` chỉ ghi audit;
  `role-duties.hook.ts:72` đặt người nhận `['SUPER_ADMIN','IT_ADMIN']` cho mọi người giữ vai.
- **Phạm vi Prompt 04:** chỉ thông báo do `QĐ-87b`(3), `D-7`, `US-02-02` AC-17 bắt buộc (P03-D15).

#### F18 — Lời mời khôi phục gửi email công việc hiện tại (`P28-05`)

- **Mức / nhãn:** Medium · implementation gap.
- **Nguồn:** handoff §7 `P28-05` (lời mời, đặt lại, thông báo luôn tới email đăng nhập; `QĐ-47a`, BRD `FR-8.6`, `FR-8.10`(d3), `FR-8.11`).
- **Code:** `src/modules/identity-access/recovery/successor-enrolment.service.ts:108-118` (`recipient: successor.workEmail ?? ''`).
  Các đường còn lại đã gửi `account.loginEmail` (`account-invitation.service.ts`, `password-reset-mail.service.ts`,
  `credential-change.service.ts`, `holder-recovery.service.ts`).
- **Test:** thiếu ca _đổi email công việc khi token còn hạn_ (chỉ có `employee-maintenance-http.integration-spec.ts:204-220`).

#### F19 — Super Admin là đối tượng của thay đổi

- **Mức / nhãn:** High · ADR/Owner decision required (T-2).
- **Nguồn:** `QĐ-87c`(1) → (4) DL L2798, `QĐ-88b` DL L2851; `US-03-11` AC-8; `US-01-09`.
- **Code:** từ chối tự thao tác chỉ ở tạo/import hồ sơ (`employee-manual.service.ts:87-91`); sự kiện nhân sự chỉ có luật
  _IT Admin về chính mình_ (`src/modules/personnel/personnel-self-action.policy.ts:8-12`,
  `src/modules/personnel/transfer/transfer-guard.service.ts:31-38`); không kiểm đối tượng có giữ `SUPER_ADMIN`.
- **Cần:** chặn tự thao tác trên hồ sơ/sự kiện/`BM-09` của chính Super Admin; thủ tục có kiểm soát khi Super Admin duy nhất
  là đối tượng (P03-D02 = A, Owner 27/10/2026: lệnh `pnpm ops:record-super-admin-event` — [spec
  L.2](spec.md#l2-thủ-tục-có-kiểm-soát-khi-super-admin-là-đối-tượng-p03-d02-f19)); người giữ vai đã rời: ghi sự kiện rời đi bằng lệnh đó →
  tài khoản bị chặn theo quy tắc _đã nghỉ việc_ → `REASSIGN` hiện hành (`ops:recover transfer-role`), không nới.

### 3.3 Danh mục và license (G3–G4)

#### F20 — Phòng sở hữu của Assignment và đích cấp

- **Mức / nhãn:** High · implementation gap (+ migration). Phụ thuộc F02.
- **Nguồn:** `QĐ-89a`(1)(2) DL L2874; `US-07-01` AC-18; handoff §7 dòng cuối; BEH-07(b).
- **Code:** CHECK `license_assignments_service_has_owning_department` cấm phòng sở hữu trên seat cá nhân
  (`20261022120000_cost_centers_unit_only/migration.sql:66-67`); `provisioning-holder.service.ts:56-57`
  (`owningDepartmentId: null`); `provisioning.service.ts:283-291` (`lockTarget` chỉ so gói — chọn được thuê bao bất kỳ của gói);
  không có hiện thực `G1` theo phòng.
- **Cần:** bất biến _phòng sở hữu của Assignment = phòng sở hữu của thuê bao_ ở service + CHECK/trigger; đích cấp chỉ là
  thuê bao của phòng của Request; seat trống `G1` tính theo phòng sở hữu.

#### F21 — Bước 4 khởi tạo theo `QĐ-89e`

- **Mức / nhãn:** Medium · implementation gap. Phụ thuộc F02, F20, F42.
- **Code:** `src/modules/data-import/seat-baseline-import/seat-baseline-rows.ts:176-198` (seat cá nhân không có phòng; tài khoản
  dịch vụ lấy `Unit` của phòng người chịu trách nhiệm, không phải phòng sở hữu thuê bao); không có rà soát sau khởi tạo
  (`RevocationSource` không có giá trị tương ứng — `licensing.prisma:188-201`).
- **Thiết kế:** rà soát mở khi IT Admin chốt bước 4 (`FR-9.4`), người quyết là trưởng phòng **của người giữ** (`US-07-09`
  bảng người xác nhận dòng 5), cùng luật hạn/nhắc của rà soát sau điều chuyển.

#### F22 — Read model phần mềm phòng (`D-14`)

- **Mức / nhãn:** Medium · implementation gap.
- **Nguồn:** `QĐ-87h`(2), `D-14`; `US-03-06` AC-13, AC-17.
- **Code:** `src/modules/licensing/assignment/department-tools.service.ts:37,48-117`; `assignment.repo.ts:290-326`
  (gom seat cá nhân theo **phòng hiện tại của người giữ** `:303`); khóa `K4` không có (`LicenseKey` không có người giữ —
  `licensing.prisma:258-277`); `K1` đang chấm dứt không có nhãn.
- **Thiết kế:** gom theo phòng sở hữu của Assignment (`QĐ-89a`(1)); `K4` lấy từ khóa đang gán khi có dữ liệu người giữ (nếu
  `US-04-12` AC-5 → AC-8 chưa có thì ghi `blocked` theo G7, không bịa).

#### F23 — Ứng dụng đã ngừng vẫn khai thuê bao/nhập khóa được

- **Mức / nhãn:** Low · implementation gap.
- **Nguồn:** `US-04-01` AC-8, AC-9, AC-14; `OQ-B-09` (handoff §7).
- **Code:** `subscription.service.ts:127-174,182-260`, `src/modules/licensing/license-key/license-key.service.ts:86-92`
  không kiểm `applicationStatus`. Request/gói/cấp/bước 4 đã chặn (`request-assessment.service.ts:116`, `plan.service.ts:122`,
  `baseline-target.policy.ts:42`) — `aligned`.

#### F24 — `SoD-5` đếm IT Admin dùng được ngoài giao dịch

- **Mức / nhãn:** Medium · implementation gap.
- **Nguồn:** `QĐ-77m` (tính trong cùng giao dịch; cờ audit **và** báo Super Admin); `US-01-05` AC-12, AC-13.
- **Code:** `src/modules/licensing/provisioning/provisioning-task-frame.service.ts:52-57,90-98` (`countUsableItAdminsExcept`
  không truyền `tx`); facade `src/modules/identity-access/identity-access.service.ts:137-139` không nhận `tx`; không có thông
  báo Super Admin.

#### F25 — Đảo thứ tự khóa giữa cấp và đóng thất bại

- **Mức / nhãn:** Medium · implementation gap (chưa tái hiện runtime).
- **Nguồn:** `INV-01` (sức chứa seat) và `FR-2.5` (đóng tác vụ cấp thất bại) với Request nhóm (`QĐ-82h`); Prompt 03 §2 (rà thứ tự khóa, đồng thời bằng bằng chứng khóa/barrier); `test/README.md` (test đua giữ khóa ở kết nối riêng, chờ `pg_locks`).
- **Code:** cấp: khóa Request (`access-request-grant.gate.ts:34`) → thuê bao (`provisioning.service.ts:126`); đóng thất bại:
  khóa tác vụ (`provisioning-task-frame.service.ts:53`) → thuê bao/Assignment (`assignment.service.ts:246-247`) → khóa Request
  (`provisioning-decision.service.ts:95`, `access-request-grant.gate.ts:56`). Request nhóm trên cùng thuê bao tạo chu trình.
- **Yêu cầu:** test đỏ có barrier trước khi sửa; nếu không tái hiện được, ghi `aligned` kèm bằng chứng và không đổi mã.

#### F26 — PATCH thuê bao khi phòng chưa có Cost Center

- **Mức / nhãn:** Medium · business-source question.
- **Nguồn:** `QĐ-88a`(2), `QĐ-89a`(3), `QĐ-89d`.
- **Code:** `subscription.service.ts:182-260` cho tăng `purchasedQuantity`, đổi `endDate`/`renewalDate`/`autoRenew`/`unitPrice`
  không kiểm phòng/Cost Center. Câu hỏi: IT ghi nhận khoản mua đã có có tính là _tạo/tăng/kéo dài nghĩa vụ_ không (P03-D09). Owner
  trả lời A ngày 27/10/2026: có — chặn bốn kiểu tăng/kéo dài bằng 409 `FINANCE.SETUP_INCOMPLETE`
  ([spec L.7](spec.md#l7-patch-thuê-bao-khi-phòng-chưa-có-cost-center-p03-d09-f26)).

### 3.4 Request, ngân sách, phê duyệt (G5)

#### F27 — Cổng _cấu hình tài chính chưa hoàn tất_ và nháp Request trả phí

- **Mức / nhãn:** Blocker · implementation gap (+ contract change; ADR T-1/T-3). Phụ thuộc F01.
- **Nguồn:** `QĐ-87g`(1) → (4) DL L2802, `QĐ-88a`, `QĐ-89d`, `D-13`; BRD `FR-3.2`, `FR-3.20`, `FR-5.15`; `US-05-01` AC-15,
  `US-05-02` AC-12, `US-05-03` AC-4, `US-05-17` AC-17, `US-05-20` AC-11, `US-05-21` AC-7, `US-03-02` AC-7, AC-14,
  `US-06-09` AC-19, `US-06-10` AC-10, `US-06-12` AC-19; BEH-08.
- **Code:** trạng thái không biểu diễn được (F01); không đường gửi nào có cổng (`access-request.service.ts:62-83`,
  `group-request.service.ts:106-130`, `service-account-request.service.ts:44-102`, `spend-batch.service.ts:86-110`,
  `src/modules/budgets/budget/version.service.ts:50-157`); không có trạng thái nháp (`requests.prisma:28-63`);
  `budget-support.service.ts:132-142` gộp _không có Cost Center_ với _không phải Cost Center của bạn_.
- **Wire:** 409 `FINANCE.SETUP_INCOMPLETE` (spec K), phân biệt với `NO_ACTIVE_BUDGET` và _phòng chưa có trưởng phòng_ (T-3) trên
  `accessRequestSubmit`, `groupRequestSubmit`, `delegatedRequestSend`, `accessRequestServiceAccountSubmit`,
  `accessRequestRenewalSubmit`, `accessRequestPropose`, `spendBatchSubmit`, `budgetProposalSubmit`, `budgetVersionCreate`,
  `budgetVersionRevise`; biểu diễn nháp (P03-D01 = A — trạng thái `DRAFT` và bốn operation nháp,
  [spec L.1](spec.md#l1-nháp-request-trả-phí-p03-d01-f27)). Vẫn làm được: Request nội bộ không phí, báo lỗi SaaS, tác vụ kỹ thuật.

#### F28 — Request trả phí bị xác định lại bước nhu cầu khi điều chuyển

- **Mức / nhãn:** High · implementation gap.
- **Nguồn:** `QĐ-90b` DL L2923 (thay một phần `QĐ-28d`(2)); BRD `FR-3.16`, bảng ngoại lệ 5.3; `US-03-01` AC-7; `US-05-12`; BEH-11(a).
- **Code:** `src/modules/requests/reassignment/step-reassignment.repo.ts:124-133` (chỉ loại `SERVICE_ACCOUNT`), `:156-164`
  (lượt hằng ngày); `organization-change.listener.ts:44-51`; `step-target.service.ts:130-135`. Trigger đổi trưởng phòng theo
  **thành viên** (`organization-change.listener.ts:53-64`) — Request trả phí giữ phòng lúc gửi thì phải khóa theo
  `access_requests.department_id` như tài khoản dịch vụ (`step-reassignment.repo.ts:136-144`).
- **Test:** `test/integration/step-reassignment.integration-spec.ts:80-113` chỉ phần mềm nội bộ — `aligned` cho nhánh (a).

#### F29 — Kết cục _bị hủy — người thụ hưởng điều chuyển_

- **Mức / nhãn:** High · contract change (+ enum cộng thêm).
- **Nguồn:** `QĐ-90b` + làm rõ 26/10/2026; BRD 5.12.3 (`Request`, `ProvisioningTask`); `US-03-07` AC-1; `US-05-15`; `UC77`; BEH-11.
- **Code:** `AccessRequestCancelCause` chỉ `BENEFICIARY_LEFT` (`requests.prisma:66-68`); DTO một giá trị
  (`cancellation.dto.ts:10`, `access-request.dto.ts:285`, `group-request.dto.ts:125`, `group-decision.dto.ts:96`);
  `departure-cancellation.service.ts:46,73` cứng nguyên nhân rời; `GrantCancelCause` (`licensing-open-grants.types.ts:2`);
  `grant-cancellation.policy.ts:27-29` hủy tác vụ QUEUED ngay, không đối chiếu nhà cung cấp; không liệt kê phần chưa cấp xong
  ở rà soát (`transfer-reviews.controller.ts:121` chỉ văn xuôi); đóng điều chuyển chỉ chặn tài khoản dịch vụ
  (`transfer-closure.service.ts:43-49`).
- **Dữ liệu:** `ALTER TYPE … ADD VALUE` (không hoàn tác — `DB-05`). Giải phóng chỉ phần chưa phát sinh chi tái dùng
  `request-end.service.ts:30-42`.

#### F30 — Super Admin gửi được Request

- **Mức / nhãn:** Medium · contract change.
- **Nguồn:** `QĐ-87a` (Super Admin _vẫn không gửi Request_), `SoD-1`.
- **Code:** route gửi `@AuthenticatedOnly`; service không kiểm vai; Super Admin có Employee trong phòng (`QĐ-87f`).
- **Wire:** 403 `ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST` trên các operation gửi (cùng danh sách F27).

#### F31 — Duyệt chi song song cùng Cost Center/năm

- **Mức / nhãn:** High · implementation gap.
- **Nguồn:** BRD `FR-3.20` (tính lại lúc duyệt), mục 5.5.2 (hai Request chạy song song).
- **Code:** `src/modules/requests/spend/spend-decision.service.ts` khóa riêng Request; `budget-check.service.ts:126-129` đọc
  _còn lại_ và tổng đang chờ không khóa; `src/modules/budgets/budget/commitment.repo.ts:51-83` chèn không khóa phiên bản;
  Read Committed. Hai Request khác nhau cùng thấy đủ ⟹ cùng `BUDGET_OK`, bỏ qua Finance rà soát bắt buộc.
- **Cần:** khóa tuần tự theo (Cost Center, năm) — `pg_advisory_xact_lock` trên khóa băm chốt ở spec K, sau khóa Request — giữ qua kiểm tra và
  ghi khoản cam kết; test đua có barrier.

#### F32 — `SoD-8` không được chặn

- **Mức / nhãn:** Medium · implementation gap.
- **Nguồn:** BRD 4.2 `SoD-8` (người rà soát ngoại lệ và Người duyệt chi của cùng Request là hai người); `QĐ-29b`, `QĐ-82l`(7), `QĐ-82m`; `US-06-13` (rà soát của Finance trước bước duyệt chi).
- **Code:** `finance-review.service.ts:50-60` chỉ kiểm vai `FINANCE`; `spend-decision.policy.ts:16-34` không xét người rà soát;
  so sánh `budget-information.policy.ts:56`, `budget.policy.ts:136` đã có.
- **Contract (chốt 26/10/2026):** 409 `SPEND.REVIEWER_IS_APPROVER` ở `financeReviewComplete` (cả đường chờ phiên bản của F65) và
  `spendApprovalDecide` ([spec J.3](spec.md#j3-finance-xử-lý-request-đang-chờ-phiên-bản-f65)).

#### F33 — _Cần sửa ngân sách_ cho `INSUFFICIENT_BUDGET`

- **Mức / nhãn:** Medium · implementation gap _(đến 26/10/2026 là business-source question P03-D08; nay nguồn cuối xác định một
  đáp án — xem dưới)_.
- **Nguồn (pin `e0cb5a0`):** BRD v3.57 `FR-3.20` bảng dòng `INSUFFICIENT_BUDGET` (_trả về trưởng phòng · cần sửa ngân sách · hồ sơ ngoại
  lệ đầy đủ — phòng chưa có trưởng phòng có hiệu lực: không chọn được cần sửa ngân sách_) và dòng `NO_ACTIVE_BUDGET`, kết cục 2;
  `QĐ-92d`(2) (_không chọn được … kể cả khi đã có phiên bản hiện hành_ — chỉ có nghĩa khi có phiên bản hiện hành thì kết cục này chọn
  được); `US-06-13` AC-13 (`INSUFFICIENT_BUDGET` + phòng chưa có trưởng phòng ⟹ không lưu, lý do duy nhất là thiếu trưởng phòng),
  AC-11 (ví dụ `NO_ACTIVE_BUDGET`, không có chữ _chỉ_). Không còn mâu thuẫn BRD ↔ Story ⟹ P03-D08 đóng, không cần chat Docs sửa Story.
- **Code:** `src/modules/requests/spend/finance-review.policy.ts:27` trả `NO_BUDGET_TO_MAKE` khi không có năm `NO_ACTIVE_BUDGET`
  (chặn `INSUFFICIENT_BUDGET` dù phòng có trưởng phòng); `spend-budget.listener.ts:48-61` (`waitingForYear`) chỉ chọn Request có năm
  `NO_ACTIVE_BUDGET` ⟹ Request chờ phiên bản sửa đổi từ `INSUFFICIENT_BUDGET` không bao giờ được kiểm lại khi phiên bản được duyệt.
- **Cần:** _cần sửa ngân sách_ chọn được cho `INSUFFICIENT_BUDGET` và `NO_ACTIVE_BUDGET` khi phòng có trưởng phòng có hiệu lực; bị từ chối
  (`NO_HEAD_TO_PROPOSE`) khi không có — kể cả khi đã có phiên bản hiện hành; `HIGH_VALUE`, `PLAN_LINE_OVERDUE` giữ hành vi hiện tại
  (bảng `FR-3.20` không cho kết cục này); kiểm lại khi phiên bản của (Cost Center, năm) được duyệt bắt mọi Request đang chờ phiên bản
  của năm đó, theo kết cục rà soát đã ghi, không theo mã kiểm tra.

#### F34 — Request trả phí giá 0

- **Mức / nhãn:** Medium · implementation gap.
- **Nguồn:** BRD `FR-3.2` (không có Request trả phí chi phí 0; thiếu giá ⟹ _chưa đủ dữ liệu giá_), `QĐ-82m` C.
- **Code:** `src/modules/requests/access-request/pricing.policy.ts:61-90` không chặn 0; CHECK Request `>= 0`
  (`20261023140000_requests_pricing/migration.sql:40`); CHECK khoản cam kết `> 0` (`20261023190000_*:102`) ⟹ 500 lúc duyệt.

#### F35 — Kỳ hủy được bị coi là ràng buộc

- **Mức / nhãn:** Low · business-source question. `QĐ-84a`(4); `pricing.policy.ts:42-44,76`. Đề xuất hoãn tới G8 (P03-D10).

#### F36 — Phiên bản ngân sách nháp kẹt

- **Mức / nhãn:** High · implementation gap.
- **Code:** `src/modules/budgets/budget/version.repo.ts:177-182` (`inFlight` gồm `DRAFT`); gửi đòi đề xuất `SUBMITTED|REVIEWED`
  (`version.service.ts:200-212`); không có route xóa/hủy bản nháp (controller chỉ có tạo, sửa đổi, gửi, quyết). Đề xuất bị rút
  hoặc trả về khi đã có bản nháp ⟹ mọi `budgetVersionCreate` sau của (Cost Center, năm) trả `VERSION_IN_FLIGHT` vĩnh viễn.
- **Yêu cầu (bản đầu — bị thay bởi mục _Làm lại theo pin_ ngay dưới):** test đỏ trước; ~~sửa bằng hủy/đóng bản nháp~~.
- **Làm lại theo pin `e0cb5a0` (`QĐ-91a`, 26/10/2026):** tập trạng thái phiên bản nay đóng — _nháp_, _chờ quyết định_, _yêu cầu sửa_,
  _hiện hành_, _bị thay_, _hết hiệu lực_, _bị từ chối_; không có _đã hủy_ hay _đã rút_ cho phiên bản; _nháp_ chỉ đi tới _chờ quyết định_
  hoặc _hết hiệu lực_ (hết năm, `QĐ-91e`); BRD `FR-5.15`(2) giữ _mọi phiên bản_. Vì vậy cách sửa _đóng `CANCELLED`_ / _thao tác hủy bản
  nháp_ ở spec bản đầu **không** còn dùng được (thêm trạng thái ngoài nguồn) và xóa bản nháp cũng không được. Cách sửa trong nguồn: bản
  nháp lập từ đề xuất đã rút/bị trả lại **giữ** _nháp_, đánh dấu _tách khỏi đề xuất_ trong cùng giao dịch rút/trả lại (chỉ đọc: không
  sửa, không gửi), **không** tính vào ràng buộc _một bản đang làm_ (`budget_versions_in_flight_key`) để Finance lập được bản mới từ đề
  xuất kế tiếp, và thành _hết hiệu lực — đóng khi chưa thành hiện hành_ khi năm kết thúc (F62). Biểu diễn cờ là thiết kế BE (`T-10`);
  không đổi wire ngoài một trường chỉ đọc. Không phải câu hỏi Owner: đây là cách duy nhất vừa gỡ kẹt vừa ở trong tập trạng thái của
  `QĐ-91a`.

#### F37 — Ba đường 500

- **Mức / nhãn:** Medium · implementation gap.
- **Nguồn:** `docs/rules/api-contract.md` (một mã một status; lỗi nghiệp vụ là 4xx có mã, kẻ thua đua 409 mã riêng; 500 chỉ là lỗi lập trình) và `docs/rules/security-jobs.md`; BRD `FR-5.15`(4), `US-06-09` (phiên bản sửa đổi có lý do), `US-03-04` (nghỉ việc).
- **Code:** `PATCH budgetVersionUpdate` với `reason: null` trên REVISION vi phạm `budget_versions_reason_check`
  (`budget.dto.ts:100`, `version.service.ts:175`, `20261023180000_*:228-230`); `planId` không tồn tại ở đề xuất/dòng → lỗi FK
  (`proposal.service.ts:196`, `version-line.service.ts:96`); `offboarding-notice.recorder.ts:38` gọi `recordInTx` không qua
  `OffboardingFrame.guarded()` (`offboarding-frame.service.ts:79`) → xung đột thành 500 thay 409 `CONCURRENT_CHANGE`
  (recorder điều chuyển cùng dạng — kiểm khi sửa).

#### F38 — Nguồn giá Request xuyên phòng

- **Mức / nhãn:** Low · business-source question. `subscription.repo.ts:164-186` (`findPricedOfPlan`, mới nhất mọi phòng).
  P03-D11 = A (Owner 27/10/2026): chỉ thuê bao của phòng Request, không thì giá gói/báo giá
  ([spec L.8](spec.md#l8-nguồn-giá-của-request-p03-d11-f38)).

#### F39 — Trùng số phiên bản ánh xạ sai

- **Mức / nhãn:** Low · implementation gap. `budget.http-errors.ts:157` ánh xạ va chạm `budget_versions_cost_center_id_year_number_key`
  thành `VERSION_IN_FLIGHT`.
- **Nguồn:** `docs/rules/api-contract.md` (một mã một status, kẻ thua đua dùng mã riêng); Owner `P02-DEC-1` (kẻ thua đua trả lỗi domain của kiểm tra) — va chạm số phiên bản không phải _đang có phiên bản đang làm_.

### 3.5 Nhân sự (G6)

#### F40 — Sự kiện nhân sự và `BM-09` chỉ IT Admin

- **Mức / nhãn:** Blocker · contract change.
- **Nguồn:** `QĐ-87a`, `QĐ-87b`(1)(2), `D-2`, `D-5`, `D-9`; `US-03-01` AC-14, AC-22; `US-03-03`; `US-03-04`; `US-03-11` AC-8; BEH-04(b).
- **Code:** `src/modules/personnel/transfer/transfers.controller.ts:72` (`@RequireRoles('IT_ADMIN')` cấp lớp);
  `src/modules/personnel/leave/long-leaves.controller.ts:55`; `src/modules/personnel/offboarding/offboarding.controller.ts:78`;
  `src/modules/personnel/notice/notice.controller.ts:202,228,272`; `notice-handling.service.ts:157` (IT Admin ghi bản ghi xác minh).
- **Test:** `test/e2e/department-transfers.e2e-spec.ts:84`, `long-leaves.e2e-spec.ts:80`, `offboarding-cases.e2e-spec.ts:102`,
  `personnel-notices.e2e-spec.ts:90`, `service-account-handover.e2e-spec.ts:89` khẳng định Super Admin bị 403.
- **Aligned (giữ):** căn cứ, dời/hủy, một sự kiện chờ, xác minh chỉ ở đường `BM-09`, logic quay lại `QĐ-80`, bước kỹ thuật
  `BM-08` của IT Admin.
- **Wire:** `departmentTransferRecord|Reschedule|Cancel`, `longLeaveStart|ChangeReturnDate|ConfirmReturn`,
  `offboardingCaseRecord|ChangeLastDay|Cancel|MarkLeft`, `personnelNoticeReject|Record|LinkEvent` → `SUPER_ADMIN`.

#### F41 — Đổi chức vụ còn là sự kiện và loại `BM-09`

- **Mức / nhãn:** High · migration/backfill required (+ implementation gap).
- **Nguồn:** `D-1` DL L2805, `QĐ-87e`; `US-03-01` AC-11; `US-03-10` AC-10 (bốn loại `BM-09`).
- **Code:** `transfer.dto.ts:27,83` (`toJobTitleId`, `changes = JOB_TITLE|DEPARTMENT_AND_JOB_TITLE`); `transfer.service.ts:77-78,90`;
  `transfer.policy.ts:107-109`; `PersonnelNoticeKind.JOB_TITLE_CHANGE` (`prisma/models/personnel.prisma:338`,
  `notice.types.ts:8`, `notice.policy.ts:115`). Cặp `DEPARTMENT_TRANSFER_OUT/IN` là hai biểu mẫu của một loại — `aligned`.
- **Dữ liệu:** dòng cũ loại đó và điều chuyển chỉ đổi chức vụ cần disposition (P03-D05); bỏ giá trị enum là thao tác không
  hoàn tác (tiền lệ `20261022120000:142-145`). P03-D05 = A (Owner 27/10/2026): giữ dòng cũ làm lịch sử, giá trị enum giữ, trigger cấm
  dòng mới, dòng chờ hủy trên bản đang chạy trước deploy ([spec
  L.4](spec.md#l4-chức-vụ-và-dữ-liệu-đổi-chức-vụ-cũ-p03-d04-p03-d05-f03-f41)).

#### F42 — Rà soát sau điều chuyển chỉ phủ công cụ ngoài bộ chuẩn

- **Mức / nhãn:** Blocker · implementation gap.
- **Nguồn:** `QĐ-87h`(3) DL L2803, `QĐ-89b` DL L2875, `QĐ-90b`, `QĐ-90c`; `US-03-07` AC-1, AC-3, AC-15.
- **Code:** `src/modules/personnel/transfer-review/transfer-review.service.ts:51-53` (`getStandardToolsetPlanIds` →
  `toolsOutsideStandard`; không còn gì thì không mở rà soát); `transfer-review.policy.ts:22-29`.
- **Test:** `test/integration/transfer-review-open.integration-spec.ts:11,55,69` khẳng định _ngoài bộ chuẩn_.
- **Cần:** liệt kê **mọi** quyền đang giữ (trả phí và nội bộ) + danh sách thông tin phần Request trả phí chưa cấp xong (F29).
- **Aligned (giữ):** 5 ngày làm việc, không tự thu hồi, quá hạn chỉ nhắc, phòng thiếu trưởng phòng thì chờ, hạn không đặt lại,
  người xác nhận bàn giao gói mất dữ liệu là trưởng phòng mới (`handover-confirmer.policy.ts:60-66`).

#### F43 — _Còn cần_ không có tác dụng

- **Mức / nhãn:** High · implementation gap (thiết kế T-6).
- **Nguồn:** `QĐ-89b`, `QĐ-89c`; `US-03-07` AC-3.
- **Code:** `transfer-review-decision.service.ts:57-58` (chỉ `NOT_NEEDED` mở thu hồi); `STILL_NEEDED` chỉ được lưu.
- **Thiết kế (spec):** `STILL_NEEDED` ghi nhận cần Request mới của phòng nhận; seat cũ thu hồi (thành `G1` của phòng cũ) khi
  tác vụ cấp của Request mới hoàn tất, hoặc khi Request đó kết thúc không cấp; chưa có quyết định thì không thu hồi.

#### F44 — Điều chuyển vào phòng chưa có Cost Center bị từ chối

- **Mức / nhãn:** Medium · implementation gap. Phụ thuộc F01.
- **Nguồn:** `QĐ-87d`(3) (sự kiện nhân sự không bị chặn); `US-03-01` AC-23.
- **Code:** `employee-placement.policy.ts:43-45`; `service-account-move.policy.ts:48,56` (gỡ cùng F06).

#### F45 — Cờ _tự thực thi_ của sự kiện nhân sự về IT Admin

- **Mức / nhãn:** Low · obsolete. `D-9`. `personnel.prisma:35,193,226,294,327`; `transfer.service.ts:166,196-204`;
  `offboarding.service.ts:121`; `leave.policy.ts:115-117`; wire `selfExecuted` (`transfer.dto.ts:88`). Giữ luật tự thu hồi cho
  IT Admin (`US-03-04` AC-29, `QĐ-77m`).

#### F46 — Một sự kiện chờ xuyên bảng

- **Mức / nhãn:** Medium · implementation gap (bằng chứng).
- **Nguồn:** BRD `FR-2.2` (tối đa **một** sự kiện tổ chức chờ mỗi nhân viên), `QĐ-77j`; `US-03-01` AC-21; Prompt 03 §2 và `test/README.md` (đồng thời chứng minh bằng barrier/khóa, không sleep).
- **Code:** chỉ mục riêng từng bảng (`20261024140200:79`, `20261024170000:81`, `20261024180000:114`); xuyên loại chỉ kiểm ở service
  dưới khóa Employee (`transfer.service.ts:92,122-131`, `offboarding.service.ts:87-96`); `long-leave-start.integration-spec.ts:201-204`
  dùng `Promise.all`. Cần test đua có barrier cho điều chuyển ↔ nghỉ việc ↔ nghỉ dài.

#### F47 — Seed _đã báo_ theo `CURRENT_DATE`

- **Mức / nhãn:** Low · migration/backfill required. `20261024140100_organization_change_announcements/migration.sql:35,40,44`
  dùng múi giờ phiên CSDL; ứng dụng dùng múi giờ tổ chức. Sửa bằng cả hai: `ops:inspect` báo lệch **và** migration tiến ghi bổ sung (không sửa migration đã merge — spec K).
- **Nguồn:** BRD `FR-7.5` (chuẩn hóa theo múi giờ tổ chức), `QĐ-47d`; `DB-15`, `DB-05` (`docs/rules/database-business.md`: không sửa migration đã merge, sửa bằng roll-forward).

#### F48 — Sequence mã `MAXVALUE 999999`

- **Mức / nhãn:** Low · implementation gap. `20261024230000_personnel_notices/migration.sql:16,46`,
  `20261025000000_licensing_saas_issues/migration.sql:18`. Năm không reset; hết giá trị thì `nextval` lỗi.
- **Nguồn:** Thiết kế BE của `g6-hr-notices-and-verification` spec (mã `BM09-<năm>-<6 chữ số>`, theo năm) và `g6-saas-error-report` (mã phiếu `BM-11`); `BM-09`, `BM-11` (BRD 5.13) — mã nhận diện phải còn cấp được qua các năm.

### 3.6 Contract và xuyên suốt

#### F49 — Mô tả OpenAPI lệch mã với tới được

- **Mức / nhãn:** Medium · documentation drift (→ contract).
- **Nguồn:** `openapi-response-examples` spec — Prompt 26 `F1`, `F2`, `F4`; Prompt 02 `F7` (52 lệch), `F8` = `P02-DEC-3`, `F10`.
- **Code:** `projects.controller.ts:36`, `cost-centers.controller.ts:43` (`F1`); `departments.controller.ts:194,244` thiếu 409
  `DEPARTMENT.INACTIVE` (`F2`); `src/infrastructure/http/errors/money-errors.ts:24`, `zod-validation.pipe.ts:7`,
  `license-key.http-errors.ts:28` (`F4`); `revocation-tasks.controller.ts:61` (`F7`); manifest
  `test/support/openapi-example-route-codes-personnel.ts:223-233` (`F8`), `-licensing.ts:38,123` (`F10`).
- **Lưu ý:** gate e2e chứng minh ví dụ khớp manifest, **không** chứng minh mã với tới được ở runtime.

#### F50 — Mapper lỗi không có nơi ném

- **Mức / nhãn:** Low · obsolete. `group-request.http-errors.ts:87-89` (`GROUP_REQUEST.LINE_NOT_FOUND`);
  `leave.http-errors.ts:14,30` (`CONCURRENT_CHANGE`).
- **Nguồn:** Prompt 03 §3 (mọi mã lỗi trong OpenAPI truy tới hành vi với tới được ở runtime); `docs/rules/api-contract.md` (bảng mã và mô tả lỗi đi theo mã thật); `openapi-response-examples` (Prompt 26 `F1`/`F2`/`F4`).

#### F51 — Hai cặp migration cùng mốc

- **Mức / nhãn:** Low · documentation drift. `20261023100000_{requests_access_request_core, service_account_owner_on_recorded_day}`,
  `20261023110000_{requests_need_decision_states, time_limited_staff_open_assignment_end}`; `DB-15` (`docs/rules/database-business.md:15-18`)
  không có gate. Không đổi tên migration đã merge; thêm gate cho migration **mới**.

#### F52 — Suite vai runtime chưa chạy đường G5/G6

- **Mức / nhãn:** Low · implementation gap. `test/integration/database-runtime-role-app.integration-spec.ts:83-125` chỉ phủ đăng nhập,
  refresh, một ghi audit, mail. Thêm ít nhất một đường ghi G5 (gửi + duyệt) và một G6 (ghi sự kiện) dưới `slm_runtime`.
- **Nguồn:** H7 `F-15`/`DB-04`/`Q9` (api/worker không dùng owner/superuser — vai runtime tối thiểu, tracker); Prompt 03 §2 (tương thích vai runtime H7 của đường ghi đã review); Prompt 04 §3 bước 6.

#### F53 — Sweeper chạy trong tiến trình API

- **Mức / nhãn:** Medium · ADR/Owner decision required. Chín sweeper đăng ký trong module HTTP
  (`organization-http.module.ts:49`, `personnel.module.ts:132,138,169`, `licensing.module.ts:136,167,170,180`,
  `catalog.module.ts:141`), mỗi giờ, mỗi instance; idempotent bằng dấu dòng. Worker chỉ chạy mail và `RequestWorkLoop`
  (`src/worker.module.ts:12-24`, `src/request-work.loop.ts:49-54`). P03-D12.

#### F54 — Allowlist nội module tăng

- **Mức / nhãn:** Medium · ADR/Owner decision required. `src/architecture-structure.spec.ts:34-43` — 136 mục, khoảng 75 mục G5/G6
  mở repo xuyên capability trong `requests`. Không có vi phạm ẩn (ledger rỗng). P03-D13.

#### F55 — Gate collection và `LD-13`

- **Mức / nhãn:** Medium · ADR/Owner decision required. Gate chỉ duyệt GET (`src/api-collection-contract.spec.ts:1715-1718`);
  khoảng 175 mảng phản hồi không có `maxItems`, gồm phản hồi POST (`openapi.json` `PreviewResponseDto`,
  `EmployeeImportConfirmationResponseDto`); `LD-13` điểm 1 → 7 còn mở (`api-list-detail-contract-remediation`). P03-D14.

#### F56 — Ngày/tiền không có định dạng

- **Mức / nhãn:** Low · contract change. 0 `"format": "date"`; tiền dạng chuỗi không `pattern` (`budget.dto.ts:6,8`). P03-D14.

#### F57 — Trộn `uuid()` và `uuid(7)`

- **Mức / nhãn:** Low · documentation drift. 52 `uuid()` / 22 `uuid(7)` trong `prisma/models`; `AccessRequest` v4 trong khi spec
  G5 ghi v7. Ghi nhận, không sửa trong Prompt 04.
- **Nguồn:** `g5-request-submission-and-routing` spec (ghi `AccessRequest` dùng UUID v7) so với `prisma/models`; không có rule repo chọn phiên bản UUID — ngoài `QĐ-87` → `QĐ-92`.
- **Code:** `prisma/models/*.prisma` — 52 `@default(uuid())`, 22 `@default(uuid(7))`; `prisma/models/requests.prisma` `AccessRequest.id` v4.

#### F58 — Cảnh báo license `FR-5.14`

- **Mức / nhãn:** Medium · implementation gap. Không có `notifyInApp` trong licensing; `inbox.policy.ts:28-61` không có mã cho
  nhắc T-7 quyền có thời hạn, lời mời chưa chấp nhận, bàn giao chưa xác nhận, `K1` còn tới hết kỳ, lỗi xác thực connector.
  Hạng mục `g4-notification-delivery` vẫn `blocked` trên giấy dù hộp thông báo đã có (`20261024110000_notifications_in_app_inbox`).
  P03-D15.

#### F59 — Test đồng thời không có barrier

- **Mức / nhãn:** Low · implementation gap. `Promise.all` ở `provisioning-decision-http.integration-spec.ts:342-362`,
  `provisioning-queue-http.integration-spec.ts:289-312`, `spend-commitments.integration-spec.ts:164`,
  `spend-finance-review.integration-spec.ts:246`, `budget-decisions.integration-spec.ts:122`; sleep ở
  `license-assignment-constraints.integration-spec.ts:490`, `seat-baseline-close-http.integration-spec.ts:43`,
  `seat-baseline-closing-http.integration-spec.ts:72`. Có sẵn `test/support/lock-wait.ts`.
- **Nguồn:** Prompt 03 §2 và `00-shared-instructions.md` §5 (đồng thời bằng barrier/event/khóa, không `sleep`); `test/README.md` (test đua giữ khóa ở kết nối `pg` riêng, chờ `pg_locks` trước khi nhả).
- **Sửa:** [plan Task 6.4](plan.md#task-64-test-đồng-thời-có-barrier-f59) (sau Checkpoint 5) — mười ca chuyển sang `waitForLockWaiters`
  với thứ tự vào hàng cố định và đối chứng; cấm sleep cố định và `Promise.all` trần làm bằng chứng; giữ hành vi và kết quả khẳng định,
  chỉ sửa mã khi test barrier tất định chứng minh lỗi thật (ghi finding mới ở mục này).

#### F60 — Tài liệu BE lệch trạng thái/pin

- **Mức / nhãn:** Medium · documentation drift.
- Scope map G2–G6 (`docs/roadmap.md` mục `Work-item decomposition`) pin Docs `72e1480`: `US-02-07`, `US-04-08`, `US-04-10` đã
  `RETIRED`; 71 Story đổi AC (mục 6). Spec G5/G6 dẫn `72e1480`/BRD v3.53.
- Trạng thái triển khai cũ: G5/G6 ghi `verified` dù đã ở `dev` (`0da8f56` → `bf2c3e9`); mười một hạng mục ghi _local, commit
  `4cc9a47` trên `Bao_dev_be`_ dù `4cc9a47` đã vào `dev` qua PR #16 (`2bb130c`); `api-list-detail-contract-remediation`,
  `delivery-gate-hardening`, `openapi-dialect-client-compatibility` ghi _chưa commit_ dù đã ở `dev`.
- `AGENTS.md`/`ARCHITECTURE.md` mô tả cost allocation, bộ chuẩn, chức vụ như năng lực hiện hành; `worker` chỉ ghi mail + bước.
- **Prompt 03 đã sửa** trạng thái/bằng chứng ở roadmap và ghi chú ngày tại các spec bị ảnh hưởng; re-pin scope map và mô tả năng
  lực là Phase 0/6 của Prompt 04.

#### F61 — Lệch ở phía Docs (không phải việc BE)

- **Mức / nhãn:** Low · documentation drift. Handoff Docs còn câu _Bản Docs này chưa được Owner review/commit_ (đầu tệp) và dòng §6
  _Owner review/commit … Chưa_, trong khi Git đã commit và Owner pin `769bb64` — BE dựa vào bằng chứng Git, không dùng câu cũ.
  Logical ERD: tập _đang mở_ của tác vụ thu hồi không gồm `COMPLETED` (code coi tác vụ thu hồi đã hoàn tất là chặn — chặt hơn,
  vô hại); enum `AWAITING_ACCEPTANCE`, `ON_HOLD`, `CANCELLED_NOT_APPLICABLE` và cột `cancelled_*` là thiết kế đích; liên kết
  hợp đồng (`contracts.vendor_id`, `subscriptions.contract_id`) chưa có. Chuyển chat Docs; BE không sửa Docs.
- **Mở rộng ở pin cuối `e0cb5a0` (26/10/2026):** handoff vẫn ghi _Bản Docs này **chưa** được Owner review/commit_ (dòng 7), _**Chưa** Owner
  review/commit_ ở hai đoạn bổ sung Prompt 19B và 19C (dòng 9, 11) và §6 _Owner review/commit bản Docs này | Chưa_ (dòng 494), trong khi
  Git có ba commit `8bfae03`, `e6d2573`, `e0cb5a0` (26/10/2026) với `e0cb5a0 = origin/main` và Owner pin `e0cb5a0` (P03-D16 = A) —
  **metadata drift** phía Docs; nguồn gốc BE là Git + Owner pin, không phải câu cũ. Logical ERD 3.3 §4.20/§4.21 ghi `budget_proposals`,
  `budget_versions` _thiết kế đích, chưa hiện thực_ trong khi BE `7c28e75` đã có hai bảng từ migration
  `20261023180000_budgets_proposals_and_versions` (tên logical không phải contract; khác biệt thật nằm ở F62, F63, F66). Chuyển chat
  Docs; không sửa Docs.

### 3.7 Docs đi tiếp sau pin: `QĐ-91` chưa commit (lịch sử, thay bởi mục 3.8)

> **26/10/2026 (delta cuối):** `QĐ-91` và `QĐ-92` nay đã commit trong Docs `e0cb5a0`; Owner chọn P03-D16 = A. Bảng sơ bộ dưới giữ làm
> lịch sử. Dòng _`QĐ-91f` … không có xử lý — khoảng trống_ là **sai** khi đối chiếu đầy đủ: nộp lại và rút đề xuất đã đi theo trưởng
> phòng có hiệu lực hiện tại (`proposal.service.ts:68-104`, `ownedLocked`), chỉ thiếu thông báo (F67). Kết luận chuẩn ở mục 3.8.

Sau khi audit xong (tệp authoritative sớm nhất đổi lúc 19:09 ngày 26/10/2026, sau khi mọi báo cáo truy vết đã nhận), worktree Docs
trên `769bb64` có `QĐ-91a` → `QĐ-91f` (vòng đời phiên bản ngân sách năm), BRD v3.56, `US-06-09` AC-20/21, `US-06-10` AC-11/12,
`US-06-11` AC-10, `US-06-13` AC-11 (1 555 AC) và handoff `BEH-14` — **chưa commit**, nên **không** thuộc baseline đã pin và không
có finding trong 61 dòng trên. Đối chiếu sơ bộ chỉ đọc (để Owner chọn P03-D16):

| Quy tắc `QĐ-91` (chưa commit)                                                                                                   | Mã BE ở `7c28e75`                                                                                            | Sơ bộ             |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------- |
| `QĐ-91a` đề xuất và phiên bản tách; đề xuất _đã nộp/bị trả lại/đã rút/đã dùng_                                                  | `BudgetProposalState` `SUBMITTED`, `RETURNED`, `WITHDRAWN`, `REVIEWED` (`prisma/models/budgets.prisma:5-14`) | gần khớp          |
| `QĐ-91b` duyệt là thành hiện hành; bản trước _bị thay_ cùng giao dịch                                                           | `APPROVED` = hiện hành, bản trước `SUPERSEDED` (`version-decision.service.ts:72`)                            | gần khớp          |
| `QĐ-91d` yêu cầu sửa trả **chính** phiên bản về Finance                                                                         | `CHANGES_REQUESTED` sửa và gửi lại cùng bản (`version.service.ts`)                                           | cần kiểm khi pin  |
| `QĐ-91c`, `QĐ-91e` hết năm: hiện hành → _hết hiệu lực_ (ngân sách đối chiếu); bản chưa từng hiện hành và đề xuất chưa dùng đóng | không có trạng thái/việc hệ thống tương ứng                                                                  | khoảng trống      |
| `QĐ-91f` trưởng phòng đổi/vắng: việc của trưởng phòng sang trưởng phòng hiện tại, chờ có kiểm soát                              | không có xử lý                                                                                               | khoảng trống      |
| Liên quan F36 (bản nháp kẹt khi đề xuất rút/trả về)                                                                             | `QĐ-91a` chỉ cho rút trước khi Finance gửi phiên bản rà soát — sửa F36 vẫn cần                               | nhất quán với F36 |

### 3.8 Delta Docs `769bb64..e0cb5a0` (`QĐ-91`, `QĐ-92`)

Một lượt đối chiếu nguồn ↔ mã cho delta (phạm vi tệp ở [mục 10](#10-phạm-vi-delta-docs-769bb64e0cb5a0)). Nguồn đọc trực tiếp bằng
`git show e0cb5a0:…`: `QĐ-91a` → `QĐ-91f` (DL L2956–L2989), `QĐ-92a` → `QĐ-92d` (DL L2991–L3018); BRD v3.57 `FR-3.20`, `FR-5.14`,
`FR-5.15`(1) → (4), 5.10 _Lập ngân sách năm_, 5.12.3 _BudgetVersion_ và ghi chú vòng đời đơn giản; `rules/domain-guardrails.md` (vế
Finance); `US-06-09` AC-20 → AC-23, `US-06-10` AC-11 → AC-13, `US-06-11` AC-3, AC-4, AC-6, AC-10, `US-06-13` AC-11, AC-13, `US-12-15`
dòng 18, 40, 48, 52 → 55, AC-24 và luồng phụ; Full Logical ERD 3.3 §4.20 `BudgetProposal`, §4.21 `BudgetVersion`, quan hệ R23 → R26;
handoff `BEH-14`, `T-10`, `T-11`. Mã đọc ở BE `7c28e75`: `prisma/models/budgets.prisma`, migration
`20261023180000_budgets_proposals_and_versions`, `src/modules/budgets/budget/*`, `src/modules/requests/spend/{finance-review,spend-budget,
spend-routing,budget-check}*`, `src/modules/notifications/{notifications.types,inbox/inbox.policy}.ts`, `src/modules/requests/status/*`.

**Phần đã khớp (không finding):** `QĐ-91b` duyệt là hiện hành ngay, bản trước _bị thay_ cùng giao dịch, `INV-21`
(`version-decision.service.ts:67-73`, chỉ mục `budget_versions_current_key`); `QĐ-91d` yêu cầu sửa trả **chính** phiên bản, Finance sửa
và gửi lại cùng bản (`budget.policy.ts` `isEditable`, `version.service.ts:198-227`) — trừ lịch sử trước/sau (F66); `QĐ-91f` việc chỉ
trưởng phòng làm được (nộp lại, rút) đi theo trưởng phòng có hiệu lực **hiện tại**, người nộp lịch sử giữ, kiểm xung đột theo người nộp
của từng bản (`proposal.service.ts:68-104,249-258`, `version-decision.service.ts:49-56`) — trừ thông báo (F67); `QĐ-92d`(3) phiên bản đầu
chỉ từ đề xuất: `INITIAL` chỉ tạo qua `createFromProposal`, `REVISION` đòi phiên bản hiện hành (`version.service.ts:50-157`, CHECK
`budget_versions_source_check`); `QĐ-92a` lần trình/kiểm lại sau khi năm đóng ra `CLOSED_OR_EXPIRED_BUDGET_PERIOD`, không override
(`budget-check.service.ts:107,146`); _cần sửa ngân sách_ bị từ chối khi phòng chưa có trưởng phòng và chưa có phiên bản
(`finance-review.policy.ts:29`). Năm dòng này vào trace mục 4.

**Mở rộng finding cũ (cùng lỗi):** F33 (P03-D08 đóng theo nguồn, thêm vế kiểm lại), F36 (cách sửa trong tập trạng thái `QĐ-91a`), F13
(`budgets`), F61 (câu cũ của handoff ở `e0cb5a0`, Logical ghi _chưa hiện thực_). **Finding mới:** F62 → F67.

#### F62 — Không có đóng cuối năm tài chính cho phiên bản và đề xuất

- **Mức / nhãn:** High · implementation gap (+ migration: `ALTER TYPE … ADD VALUE` không hoàn tác — `DB-05`; + contract: giá trị enum mới
  trong phản hồi).
- **Nguồn:** `QĐ-91c`, `QĐ-91e`; BRD `FR-5.15`(4), 5.12.3 _BudgetVersion_, `FR-8.3`; `US-06-09` AC-21, `US-06-10` AC-12, `US-06-11` AC-10;
  `BEH-14`(4)(5), `T-10` (mã trạng thái, cờ _chưa từng hiện hành_, lịch chạy — thiết kế BE).
- **Code:** `BudgetVersionState` chỉ `DRAFT · SENT · APPROVED · REJECTED · CHANGES_REQUESTED · SUPERSEDED`, `BudgetProposalState` chỉ
  `SUBMITTED · WITHDRAWN · RETURNED · REVIEWED` (`prisma/models/budgets.prisma:5-42`) — không có _hết hiệu lực_, cờ _chưa từng hiện
  hành_ hay _đóng — hết năm tài chính_; không có sweeper/việc nào trong `src/modules/budgets` (chín sweeper hiện có — F53 — không có
  cái nào cho ngân sách). Sau khi năm kết thúc, phần lớn thao tác vẫn chạy: `VersionDecisionService.decide` không kiểm năm
  (`version-decision.service.ts:45-73`, `budget.policy.ts` `checkVersionDecision`) ⟹ Người duyệt chi **duyệt được** phiên bản của năm đã
  kết thúc, phiên bản thành `APPROVED` (hiện hành) và gắn ngược khoản cam kết của năm đó; `VersionService.update`
  (`version.service.ts:160-192`), `VersionLineService.updateLine`/`addLines` (`version-line.service.ts:44-118`) và nhập dòng không kiểm
  năm; `ProposalService.withdraw`/`giveBack` không kiểm năm (`proposal.service.ts:87-121`). Chỉ `submit`/`resubmit`, `createFromProposal`,
  `createRevision`, `send` có `yearIsOpen`. Đọc ngân sách (`budget-view.service.ts:37,70`, `budget-facts.repo.ts:27,61,84,113`) lấy
  `state = 'APPROVED'` làm hiện hành — sau khi có _hết hiệu lực_ phải đọc **ngân sách đối chiếu** cho năm đã kết thúc và không bao giờ đọc
  bản chưa từng hiện hành.
- **Cần:** trạng thái cuối _hết hiệu lực_ của phiên bản kèm cờ _chưa từng hiện hành_ (một trạng thái, phân biệt bằng cột — `QĐ-91e`) và
  trạng thái _đóng — hết năm tài chính_ của đề xuất; một việc hệ thống cho mỗi (Cost Center, năm) đã kết thúc theo tháng bắt đầu năm và
  múi giờ tổ chức (`QĐ-82l`(23), `FR-7.5`): `APPROVED → EXPIRED` (ngân sách đối chiếu), `DRAFT/SENT/CHANGES_REQUESTED → EXPIRED` + cờ +
  Audit _đóng khi chưa thành hiện hành_ (tác nhân `SYSTEM`), việc quyết đang mở đóng không kèm quyết định (không có bản ghi quyết định),
  đề xuất `SUBMITTED`/`RETURNED` chưa dùng → _đóng_; chạy lại không đổi kết quả (`T-10`); khóa cùng khóa (Cost Center, năm) của F31 và khóa
  dòng phiên bản như `decide` để không đua với quyết định đang chạy; sau khi năm kết thúc mọi thao tác ghi trên phiên bản/đề xuất của năm
  đó bị từ chối (`BUDGET.YEAR_ENDED` hiện có) kể cả khi việc đóng chưa chạy; đọc ngân sách theo ngân sách đối chiếu. Sweeper đặt như các
  sweeper hiện có (P03-D12 A — trong tiến trình API, idempotent bằng trạng thái). Request đang chờ các phiên bản bị đóng: F65; thông báo:
  F67.
- **Dữ liệu:** enum cộng thêm hai giá trị (không hoàn tác); cột cờ + mốc đóng có CHECK; CHECK `budget_proposals_state_check` thêm nhánh
  _đóng_; chỉ mục `budget_versions_in_flight_key` không đổi (bản _hết hiệu lực_ tự rời tập đang làm). Lượt đầu của việc đóng trên CSDL có dữ
  liệu sẽ đóng các năm đã kết thúc ở dữ liệu cũ — ghi số dòng ở diễn tập.

#### F63 — Từ chối phiên bản rà soát trả đề xuất về trưởng phòng; không lập lại được từ cùng đề xuất

- **Mức / nhãn:** High · implementation gap (+ migration: cột tự tham chiếu, đổi chỉ mục; + contract: trường mới, hành vi `budgetVersionDecide`).
- **Nguồn:** `QĐ-92c`, `QĐ-91a` (_trả lại_ là việc của Finance; đề xuất _đã dùng lập phiên bản_ chỉ đọc); BRD `FR-5.15`(1)(2)(3), 5.12.3;
  `US-06-09` AC-22, AC-23 (lập lại từ cùng đề xuất khi phòng chưa có trưởng phòng), `US-06-10` AC-13, `US-06-11` AC-3; Logical 3.3 R25
  `BudgetVersion.sourceProposalId` (`0..1 / 0..*`), R26 `BudgetVersion.rejectedPredecessorId` (`0..1 / 0..1`, `UNIQUE`); `T-11`.
- **Code:** `version-decision.service.ts:87-95` — Người duyệt chi **từ chối** phiên bản `INITIAL` ⟹ đề xuất chuyển `RETURNED` với
  `returned_by` = Người duyệt chi và lý do của quyết định: đúng phương án _mọi lần bị từ chối đều cần trưởng phòng nộp đề xuất mới_ mà
  `QĐ-92` ghi **Đã loại** (`D9`), ghi sai người trả lại, và với phòng chưa có trưởng phòng thì không ai nộp lại được (trái `US-06-09`
  AC-23). `version.service.ts:56` chỉ lập phiên bản từ đề xuất `SUBMITTED` ⟹ không lập lại từ đề xuất `REVIEWED`; không có cột trỏ về
  phiên bản bị từ chối (`budgets.prisma` `BudgetVersion`). Đề xuất mới khi nhu cầu đổi bị chặn hai lớp: `proposal.service.ts:208-211`
  (_open_ gồm `REVIEWED`) và chỉ mục duy nhất `budget_proposals_open_key` `WHERE state IN ('SUBMITTED','REVIEWED')`
  (`20261023180000_budgets_proposals_and_versions/migration.sql:201-202`); `resubmit` chỉ từ `RETURNED` (`budget.policy.ts` `canResubmit`).
- **Cần:** từ chối để đề xuất ở _đã dùng lập phiên bản_; Finance lập phiên bản rà soát mới từ **cùng** đề xuất khi phiên bản mới nhất lập
  từ nó đã _bị từ chối_ (liên kết phiên bản → phiên bản `BudgetVersion.rejectedPredecessorId`); trưởng phòng có hiệu lực nộp đề xuất mới là
  **kế tiếp** của đề xuất `REVIEWED` có phiên bản bị từ chối (liên kết đề xuất → đề xuất `BudgetProposal.successorOfProposalId`, tuyến tính,
  đề xuất trước giữ `REVIEWED`); Finance _trả lại_ đề xuất đã dùng ⟹ từ chối (hiện có: `canReturn` chỉ `SUBMITTED`); ràng buộc _một đề xuất
  đang mở_ định nghĩa lại. Lập lại từ cùng đề xuất đã nộp vẫn được khi phòng chưa có trưởng phòng (`QĐ-92d`(1)).
- **Thiết kế chốt (26/10/2026):** [spec J.1](spec.md#j1-liên-kết-kế-tiếp-của-đề-xuất-f63) — `successor_of_proposal_id` (FK `RESTRICT`,
  `UNIQUE`), `succeeded_at`, CHECK `budget_proposals_succession_check`, trigger `budget_proposals_succession_guard` (cùng Cost Center/năm,
  đề xuất trước `REVIEWED` có phiên bản mới nhất `REJECTED`, chưa có kế tiếp), constraint trigger `budget_proposals_succession_consistent`,
  `budget_proposals_open_key` mới loại đề xuất đã có kế tiếp; `rejected_predecessor_id` (FK `RESTRICT`, `UNIQUE`) + trigger
  `budget_versions_rejected_predecessor_guard`. Chủ schema `prisma/models/budgets.prisma`; chủ hành vi `budgets/budget`.
- **Dữ liệu (thay ghi chú bản đầu _giữ nguyên làm lịch sử, không backfill_ — 26/10/2026):** dòng `RETURNED` do đường cũ **không** được giữ ở
  trạng thái hoạt động sai. [spec J.2](spec.md#j2-dòng-returned-cũ-của-đường-từ-chối-trả-đề-xuất-f63-dữ-liệu): dấu vết tất định (đúng một
  quyết định `REJECTED` trên phiên bản `INITIAL` của đề xuất, khớp người/lý do/thời điểm); R1 ⟹ về `REVIEWED`; R2 (đúng một bản nộp lại) ⟹ về
  `REVIEWED` và bản nộp lại thành kế tiếp; ca mơ hồ ⟹ `ops:preflight` `BLOCKED` chỉ nêu ID (`BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS`) và
  migration `RAISE EXCEPTION` không ghi gì; Audit `SYSTEM` `BUDGET_PROPOSAL.LEGACY_REJECTION_RECONCILED` có trước/sau; lý do từ chối còn ở
  `budget_version_decisions`; rollback = khôi phục bản sao lưu.

#### F64 — Finance tạo được phiên bản sửa đổi khi phòng chưa có trưởng phòng

- **Mức / nhãn:** Medium · implementation gap.
- **Nguồn:** `QĐ-92d`(1); BRD `FR-5.15`(1)(4), 5.12.3 _BudgetVersion_ (ràng buộc); `rules/domain-guardrails.md` (vế Finance); `US-06-09`
  AC-23; `T-11` (_kiểm phòng có trưởng phòng **lúc khởi tạo**, việc đã tạo tiếp tục_).
- **Code:** `version.service.ts:101-157` `createRevision` chỉ kiểm năm, Cost Center, phiên bản hiện hành và bản đang làm — không kiểm
  phòng của Cost Center có trưởng phòng có hiệu lực ⟹ Finance tạo phiên bản sửa đổi/điều chỉnh chuyển tiếp cho phòng chưa có trưởng phòng.
- **Cần:** từ chối khởi tạo phiên bản sửa đổi (gồm điều chỉnh chuyển tiếp — cùng `REVISION`) với 409 `BUDGET.DEPARTMENT_HAS_NO_HEAD` khi phòng chưa có trưởng phòng có
  hiệu lực tại ngày nghiệp vụ; phiên bản đã tạo/đã gửi tiếp tục bình thường (`QĐ-91f`); kiểm ở policy service (F13). Phụ thuộc F01 (Cost
  Center → phòng sau đảo chiều).

#### F65 — Request chờ phiên bản: rời trạng thái chờ khi phiên bản bị từ chối; Finance không xử lý được khi đang chờ

- **Mức / nhãn:** High · implementation gap (+ contract: cách Finance chuyển kết cục của Request đang chờ).
- **Nguồn:** `QĐ-92a`, `QĐ-92d`(2), `QĐ-82n` B(4), hệ quả (e); BRD `FR-3.20` kết cục 2, `FR-5.15`(4); `US-06-13` AC-11, AC-13, `US-06-11`
  AC-10; `US-12-15` dòng 48; `BEH-14`(5).
- **Code:** `spend-budget.listener.ts:41-45` — phiên bản bị từ chối hoặc bị yêu cầu sửa ⟹ `reopenReview` (`spend-routing.service.ts:132-150`)
  đổi Request `AWAITING_BUDGET → AWAITING_FINANCE_REVIEW` và mở bước Finance rà soát mới có SLA: Request **rời** trạng thái chờ, và khi một
  phiên bản sau đó được duyệt `waitingForYear` (`:48-61`) chỉ chọn Request `AWAITING_BUDGET` ⟹ không kiểm lại Request đó. Khi Request đang
  `AWAITING_BUDGET`, Finance không có thao tác nào: `finance-review.service.ts:55-56` đòi bước `FINANCE_REVIEW` đang mở, không route nào
  khác (`finance-reviews.controller.ts`) ⟹ không làm được ca _đang chờ từ trước khi phòng mất trưởng phòng_ (`QĐ-92d`(2)) hay _phiên bản hết
  hiệu lực khi chưa từng hiện hành_ (`QĐ-92a`) — với ca sau cũng không có sự kiện nào (F62).
- **Cần:** phiên bản bị từ chối/yêu cầu sửa/hết hiệu lực khi chưa từng hiện hành ⟹ Request **vẫn** `AWAITING_BUDGET` (không trạng thái
  hay kết cục mới), Finance được báo (F67, dòng 48); trong lúc chờ Finance chuyển Request sang _trả về trưởng phòng_ hoặc _hoàn tất nhận định
  ngoại lệ_ (kết cục (i)/(iii) như `financeReviewComplete`, ghi một bản ghi rà soát gắn lần kiểm tra mới nhất, `SoD-8` như F32), người yêu cầu
  hoặc trưởng phòng rút được; **không** tạo bước duyệt chi từ phiên bản đã hết hiệu lực; phiên bản sau đó (kể cả phiên bản lập lại từ cùng đề
  xuất — F63) được duyệt ⟹ kiểm lại mọi Request còn chờ của (Cost Center, năm) (F33).
- **Contract chốt (26/10/2026):** [spec J.3](spec.md#j3-finance-xử-lý-request-đang-chờ-phiên-bản-f65) — **mở rộng** `financeReviewComplete`
  (không operation thứ hai, body và kết cục giữ nguyên) cho Request `AWAITING_BUDGET` không có bước mở: `RETURN_TO_HEAD`/`ASSESSED` mở và hoàn
  tất một bước `FINANCE_REVIEW` trong cùng giao dịch; `ASSESSED` chạy lại kiểm tra (`FINANCE_OUTCOME_WHILE_WAITING`), mã dữ liệu ⟹ về hàng đợi,
  không bước duyệt chi; `NEEDS_BUDGET` ⟹ 409 `SPEND.ALREADY_AWAITING_BUDGET`; 403 `SPEND.NOT_FINANCE`, `SPEND.OWN_REQUEST`; 409
  `SPEND.REVIEW_NOT_OPEN`, `SPEND.REVIEWER_IS_APPROVER`; khóa dòng Request, lặp sau thành công ⟹ 409, không bản ghi thứ hai. Chủ contract
  `requests/spend` (`finance-reviews.controller.ts`); chủ schema `prisma/models/requests.prisma` (`BudgetCheckTrigger`).

#### F66 — Sửa phiên bản không lưu trước/sau; không có lịch sử sửa của phiên bản

- **Mức / nhãn:** Medium · implementation gap (+ contract: đọc lịch sử; có thể thêm bảng).
- **Nguồn:** `QĐ-91d` (_mọi lần sửa lưu đầy đủ trước/sau, lý do, người, thời điểm_), `QĐ-53a`; BRD `FR-8.3` (Audit trước/sau),
  `FR-5.15`(3); `US-06-09` AC-20 (_lịch sử của `V1` ghi trước/sau_), `US-06-11` AC-4; `BEH-14`(3), `T-10` (_lưu lịch sử sửa cùng phiên bản_).
- **Code:** `budgetAuditEvent` luôn `before: null` (`budget-support.service.ts:37-57`); `VersionService.update` ghi `fields` (tên trường) và
  tổng mới (`version.service.ts:181-188`); `VersionLineService.updateLine` ghi vị trí + tên trường (`version-line.service.ts:64-70`); nhập dòng
  chỉ ghi số dòng (`line-import.service.ts:75-80`). Chỉ dời khoảng mua có trước/sau (`budget_version_line_changes`). Audit Trail chỉ Super
  Admin đọc được (`FR-8.3`, `OI-08c`) ⟹ Finance và Người duyệt chi không có lịch sử sửa của phiên bản để đọc.
- **Cần:** mỗi lần sửa phiên bản/dòng khi `DRAFT` hoặc `CHANGES_REQUESTED` lưu trước/sau thật (số cơ sở, dự phòng, tổng, ngưỡng, phân kỳ, lý
  do, dòng), người, thời điểm — vào Audit Trail và vào lịch sử đọc được trên chính phiên bản cho Finance/Người duyệt chi.
- **Thiết kế chốt (26/10/2026):** [spec J.4](spec.md#j4-lịch-sử-sửa-phiên-bản-f66) — bảng chỉ ghi thêm `budget_version_history` của
  capability (`UNIQUE (version_id, seq)`, trigger chặn sửa/xóa), không dùng `audit_events` làm read model; mỗi sửa số/dòng/thêm/nhập/dời khoảng
  ghi Audit có trước/sau thật **và** một dòng lịch sử trong cùng giao dịch; đọc `GET /budget-versions/{id}/history` (`budgetVersionHistoryList`,
  trang `pageSize` ≤ 100, `seq` giảm dần, chỉ Finance và người quyết phiên bản — 403 `AUTHORIZATION.FORBIDDEN`, 404
  `BUDGET.VERSION_NOT_FOUND`). Chủ schema `prisma/models/budgets.prisma`; chủ contract `budgets/budget`.

#### F67 — Không có thông báo vòng ngân sách và vòng Finance–trưởng phòng

- **Mức / nhãn:** High · implementation gap (+ migration: lưu thông báo giữ chờ; + contract: mã hộp thông báo mới).
- **Nguồn:** `QĐ-92b`(1) → (5); BRD `FR-5.14` dòng _Phiên bản ngân sách chờ duyệt_, _Request chờ phiên bản…_ và bốn dòng mới; `US-12-15` dòng
  18, 40, 41, 47, 48, 52 → 55, AC-24, luồng phụ (ngoại lệ có chủ đích của dòng 53); `US-06-10` AC-11, AC-12, `US-06-11` AC-3, AC-10,
  `US-06-09` AC-21, `US-06-13` AC-9, AC-11; `T-11` (thông báo giữ chờ cho trưởng phòng đầu tiên được gán).
- **Code:** bảng mã đóng `IN_APP_NOTIFICATION_CODES` (`src/modules/notifications/notifications.types.ts:47`) và `PARAM_KEYS_BY_CODE`
  (`inbox/inbox.policy.ts:28-61`) không có mã nào cho đề xuất/phiên bản ngân sách hay vòng Finance–trưởng phòng; `src/modules/budgets` không
  gọi hộp thông báo; bộ chiếu trạng thái Request (`src/modules/requests/status/status-rules.*.ts`) không có quy tắc cho sự kiện kiểm tra ngân
  sách, mở/hoàn tất Finance rà soát hay chờ phiên bản. `g5-request-status-notifications` spec mục _Explicit out of scope_ giao các thông báo
  này cho hạng mục của từng Story — các hạng mục đó (`g5-budget-proposal-and-review`, `g5-budget-version-decision`,
  `g5-budget-check-and-finance-review`) không làm. Dòng 18, 40, 41, 47 và vế trưởng phòng của dòng 48 có từ trước `769bb64` — Prompt 03 bỏ
  sót, ghi ở đây vì cùng một lỗi với dòng mới của `QĐ-92b`.
- **Cần:** thông báo trong ứng dụng, người nhận theo vai lúc gửi, không trao quyền: dòng 18 (Người duyệt chi khi Finance gửi/gửi lại phiên
  bản), 40 (Finance khi đề xuất được nộp và khi Người duyệt chi quyết; trưởng phòng khi bị trả lại và khi quyết), 41 (Finance và trưởng phòng
  khi Request vào Finance rà soát — trưởng phòng không kèm mã/số), 47 (trưởng phòng khi Finance trả về), 48 (trưởng phòng khi Request vào chờ;
  Finance khi phiên bản bị từ chối/yêu cầu sửa/hết hiệu lực khi chưa từng hiện hành), 52 (Finance + người giữ việc quyết bị đóng), 53
  (trưởng phòng có hiệu lực; phòng chưa có ⟹ **giữ chờ**, hiện cho trưởng phòng đầu tiên được gán, không ai khác), 54 (trưởng phòng hiện tại
  khi việc đề xuất giao cho họ, kể cả lúc được gán khi việc đang chờ), 55 (Finance; Super Admin chỉ giữ dòng 9 hiện có). Ghi trong cùng giao
  dịch với sự kiện; khóa tham số không mang số tiền (`FIGURE_WORDS`). Ngoài P03-D15: các dòng này do `QĐ-92b` và AC xác định, không phải
  lựa chọn phạm vi.

## 4. Trace Story/AC theo G

Chuỗi đầy đủ `Docs → G/item → spec/plan → controller/DTO → service/policy → repo/schema/migration → audit/thông báo → test → OpenAPI`
của từng finding nằm ở mục 3; bảng dưới ghi trạng thái từng nhóm AC. `aligned` = mã, contract và bằng chứng thỏa nguồn cuối.

### G0–G2 (danh tính, tổ chức, khởi tạo)

| Story/AC                                                                                                                | Hạng mục                                                                                                    | Trạng thái                  | Finding  |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------- | -------- |
| `US-01-01`…`US-01-11` đăng nhập, phiên, lời mời, đặt lại, khóa/mở khóa có lý do, chuyển giao, audit, vai duyệt, tham số | `us-01-*`, `h1`…`h5`, `g2-approval-roles`, `g2-operating-parameters`, `g2-fiscal-year-operating-parameters` | aligned                     | —        |
| `US-01-01` AC-19, `US-02-04` AC-4 (tập bản ghi cài đặt)                                                                 | `installation-local-data-h6-1-h6-2`                                                                         | implementation gap          | F09      |
| `US-02-04` AC-1, AC-4, AC-6 (bước 1)                                                                                    | `g2-onboarding-checklist`                                                                                   | contract change             | F14      |
| `US-03-06` AC-1, AC-4 → AC-9, AC-14 → AC-16, AC-22 (người ghi, căn cứ)                                                  | `g2-department-profile`                                                                                     | contract change             | F10      |
| `US-03-06` AC-7, AC-18 (trưởng phòng là thành viên; Super Admin không làm trưởng phòng)                                 | `g2-department-profile`                                                                                     | aligned                     | —        |
| `US-03-06` AC-1, AC-2, AC-21; `US-02-03` AC-7 (phòng thiếu Cost Center)                                                 | `g2-department-profile`, `g2-cost-center-catalogue`                                                         | migration/backfill required | F01      |
| `US-03-06` AC-19 (`QĐ-90e`)                                                                                             | `g2-department-profile`                                                                                     | implementation gap          | F15      |
| `US-03-06` AC-13, AC-17 (read model phần mềm phòng)                                                                     | `licensing-assignment-read-contracts`                                                                       | implementation gap          | F22      |
| `US-02-02` AC-1, AC-2, AC-12, AC-14, AC-16, AC-18 (Super Admin nhập/import, căn cứ, không tự sửa)                       | `g2-employee-intake-by-super-admin`, `g2-employee-import-preview-confirm`                                   | aligned                     | —        |
| `US-02-02` AC-13, `US-02-03` AC-1, AC-2 (chức vụ chữ tự do)                                                             | `g2-job-title-catalogue-and-manual-employee`, `beh1-employee-row-validation-ownership`                      | migration/backfill required | F03      |
| `US-02-02` AC-17                                                                                                        | `g2-employee-intake-by-super-admin`                                                                         | implementation gap          | F17      |
| `US-02-02` AC-19                                                                                                        | `g2-employee-official-field-maintenance`                                                                    | contract change             | F11      |
| `US-04-09` AC-1, AC-3, AC-5, AC-7 → AC-13                                                                               | `g2-cost-center-catalogue`, `g2-g4-unit-only-cost-attribution`                                              | implementation gap          | F01, F16 |
| `US-02-07` (`RETIRED`)                                                                                                  | `g2-job-title-catalogue-and-manual-employee`                                                                | obsolete                    | F03      |
| Cost Center chỉ `Unit`, không `Company` (`QĐ-86b`)                                                                      | `g2-g4-unit-only-cost-attribution`                                                                          | aligned                     | —        |
| `US-01-09` khôi phục — đích lời mời                                                                                     | `us-01-09-super-admin-transfer-recovery`                                                                    | implementation gap          | F18      |

### G3 (danh mục, thuê bao, tài chính danh mục)

| Story/AC                                                                                        | Hạng mục                                                                                       | Trạng thái                    | Finding |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------- | ------- |
| `US-04-03` AC-13                                                                                | `g3-subscription-purchase`                                                                     | migration/backfill required   | F02     |
| `US-04-10` (`RETIRED`)                                                                          | `g3-standard-toolset`, `catalog-standard-toolset-read-batching`                                | obsolete                      | F04     |
| `US-04-08` (`RETIRED`)                                                                          | `g3-shared-cost-allocation`                                                                    | obsolete                      | F05     |
| `US-04-01` AC-8, AC-9, AC-14; tiền điều kiện `US-05-01` (`OQ-B-09`)                             | `g3-catalog-retire`                                                                            | aligned (trừ F23)             | F23     |
| `US-04-05`, `INV-04`, `ADR-0007`, bất biến tệp `FR-1.5`                                         | `g3-money-and-exchange-rates`, `g3-contract-documents`, `finance-reporting-currency-integrity` | aligned                       | —       |
| `US-04-01` → `US-04-07`, `US-04-11`, `US-04-12`, `US-12-09` (ngoài giao điểm `QĐ-87` → `QĐ-90`) | `g3-*`                                                                                         | aligned (không audit lại sâu) | —       |
| Collection danh mục                                                                             | `catalog-application-plan-read-contracts`, `catalog-subscription-read-model`                   | aligned trừ `LD-13`           | F55     |

### G4 (seat, cấp phát thủ công, thất bại)

| Story/AC                                                                      | Hạng mục                           | Trạng thái                         | Finding |
| ----------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------- | ------- |
| `US-07-01` AC-7, AC-11; `US-07-02` AC-1, AC-5, AC-7 (bằng chứng lúc hoàn tất) | `g4-provisioning-queue-manual`     | aligned (thiếu test theo kiểu cấp) | F08     |
| `US-07-04` AC-9 (chuyển làm tay)                                              | `g4-provisioning-failure-handling` | contract change                    | F08     |
| `US-07-04` AC-8, AC-10, AC-14 (thử lại, đóng thất bại)                        | `g4-provisioning-failure-handling` | aligned                            | —       |
| C-01 tính duy nhất tác vụ                                                     | `g4-provisioning-queue-manual`     | migration/backfill required        | F07     |
| `US-07-01` AC-18, `QĐ-89a`                                                    | `g4-provisioning-queue-manual`     | implementation gap                 | F20     |
| `US-02-05` AC-15, AC-16; `QĐ-89e`                                             | `g4-seat-baseline-import`          | implementation gap                 | F21     |
| `US-01-05` AC-12, AC-13 (`SoD-5`)                                             | `g4-provisioning-queue-manual`     | implementation gap                 | F24     |
| `US-07-05` AC-1 → AC-5, AC-8 (thu hồi theo kiểu cấp, `K1` đang chấm dứt)      | `g6-revocation-by-grant-kind`      | aligned                            | —       |
| `US-03-05` (quyền có thời hạn)                                                | `g6-time-limited-access`           | aligned (nhắc chỉ là dòng)         | F58     |
| `US-07-09` bảng người xác nhận                                                | `g6-handover-confirmation`         | aligned                            | —       |

### G5 (Request, ngân sách, phê duyệt)

| Story/AC                                                                                                                                                                                       | Hạng mục                                                                                                                                                                                                             | Trạng thái         | Finding       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------- |
| BEH-08: `US-05-01` AC-15, `US-05-02` AC-12, `US-05-03` AC-4, `US-05-17` AC-17, `US-05-20` AC-11, `US-05-21` AC-7, `US-03-02` AC-7, AC-14, `US-06-09` AC-19, `US-06-10` AC-10, `US-06-12` AC-19 | `g5-request-submission-and-routing`, `g5-group-requests`, `g5-delegated-requests`, `g5-service-account-request`, `g5-budget-proposal-and-review`, `g5-budget-version-decision`, `g5-budget-check-and-finance-review` | implementation gap | F27           |
| `US-05-01` AC-6 _(bỏ)_, `US-05-04` AC-7 _(bỏ)_, cờ _ngoài bộ chuẩn_                                                                                                                            | `g5-request-preview`, `g5-manager-request-review-view`                                                                                                                                                               | obsolete           | F04           |
| `US-05-12`, `US-03-01` AC-7 (bước nhu cầu khi điều chuyển)                                                                                                                                     | `g5-step-reassignment-and-controlled-wait`                                                                                                                                                                           | implementation gap | F28           |
| Kết cục _bị hủy — người thụ hưởng điều chuyển_                                                                                                                                                 | `g6-leaver-request-closure`, `g5-request-status-notifications`                                                                                                                                                       | contract change    | F29           |
| `FR-3.20` bảy mã, `HIGH_VALUE` theo năm, tính lại lúc duyệt, override                                                                                                                          | `g5-budget-check-and-finance-review`, `g5-spend-approval-decision`                                                                                                                                                   | aligned            | —             |
| Kết cục Finance rà soát; bước duyệt chi sau kết cục hợp lệ                                                                                                                                     | `g5-budget-check-and-finance-review`                                                                                                                                                                                 | aligned trừ F33    | F33           |
| `INV-16`, `QĐ-84` một khoản cam kết mỗi (Request, năm)                                                                                                                                         | `g5-commitment-creation`                                                                                                                                                                                             | aligned            | —             |
| Ngân sách chỉ Cost Center `Unit`                                                                                                                                                               | `g5-budget-proposal-and-review`                                                                                                                                                                                      | aligned            | —             |
| Số tiền = giá × thời hạn × người; thiếu giá chặn                                                                                                                                               | `g5-request-amount-and-payment-schedule`                                                                                                                                                                             | aligned trừ F34    | F34           |
| Định tuyến (trưởng phòng tự gửi, phòng thiếu trưởng phòng)                                                                                                                                     | `g5-request-submission-and-routing`                                                                                                                                                                                  | aligned            | —             |
| Một phòng mỗi Request; tài khoản dịch vụ; nhóm ≤ 10                                                                                                                                            | `g5-service-account-request`, `g5-group-requests`                                                                                                                                                                    | aligned            | —             |
| `SoD-3`, `SoD-4`, `SoD-7`, Finance là người yêu cầu                                                                                                                                            | `g5-spend-approval-decision`                                                                                                                                                                                         | aligned            | —             |
| `SoD-8`                                                                                                                                                                                        | `g5-budget-check-and-finance-review`                                                                                                                                                                                 | implementation gap | F32           |
| `SoD-1` / `QĐ-87a` Super Admin không gửi Request                                                                                                                                               | `g5-request-submission-and-routing`                                                                                                                                                                                  | contract change    | F30           |
| Trưởng phòng không thấy mã/còn lại                                                                                                                                                             | `g5-spend-submission-batches`                                                                                                                                                                                        | aligned            | —             |
| Lô trình duyệt chi theo thứ tự, kết quả từng mục                                                                                                                                               | `g5-spend-submission-batches`                                                                                                                                                                                        | aligned            | —             |
| Duyệt chi song song cùng Cost Center/năm                                                                                                                                                       | `g5-spend-approval-decision`, `g5-commitment-creation`                                                                                                                                                               | implementation gap | F31           |
| Phiên bản ngân sách nháp; ba đường 500; số phiên bản                                                                                                                                           | `g5-budget-version-decision`, `g5-budget-proposal-and-review`                                                                                                                                                        | implementation gap | F36, F37, F39 |
| `BBI-E01` năm chưa kết thúc chưa có phiên bản                                                                                                                                                  | `g5-budget-check-and-finance-review`                                                                                                                                                                                 | aligned            | —             |
| Collection G5 phân trang, mảng lồng có biên                                                                                                                                                    | `g5-*`                                                                                                                                                                                                               | aligned            | —             |
| _Delta `e0cb5a0`:_ `QĐ-91b` duyệt là hiện hành, bản trước _bị thay_ cùng giao dịch (`US-06-11` AC-6)                                                                                           | `g5-budget-version-decision`                                                                                                                                                                                         | aligned            | —             |
| _Delta `e0cb5a0`:_ `QĐ-91d` yêu cầu sửa trả chính phiên bản, gửi lại cùng bản (`US-06-11` AC-4, `US-06-09` AC-20)                                                                              | `g5-budget-proposal-and-review`, `g5-budget-version-decision`                                                                                                                                                        | aligned trừ F66    | F66           |
| _Delta `e0cb5a0`:_ `QĐ-91f` nộp lại/rút theo trưởng phòng hiện tại; người nộp gốc; xung đột theo người nộp (`US-06-10` AC-11)                                                                  | `g5-budget-proposal-and-review`, `g5-budget-version-decision`                                                                                                                                                        | aligned trừ F67    | F67           |
| _Delta `e0cb5a0`:_ `QĐ-92d`(3) phiên bản đầu chỉ từ `BM-10`; chuyển tiếp không là lối tắt (`US-06-09` AC-23 vế cuối)                                                                           | `g5-budget-proposal-and-review`                                                                                                                                                                                      | aligned            | —             |
| _Delta `e0cb5a0`:_ `QĐ-92a` trình/kiểm lại sau khi năm đóng ⟹ `CLOSED_OR_EXPIRED_BUDGET_PERIOD`, không override                                                                                | `g5-budget-check-and-finance-review`                                                                                                                                                                                 | aligned            | —             |
| _Delta `e0cb5a0`:_ `QĐ-91c`, `QĐ-91e` đóng cuối năm (`US-06-09` AC-21, `US-06-10` AC-12, `US-06-11` AC-10)                                                                                     | `g5-budget-version-decision`, `g5-budget-proposal-and-review`                                                                                                                                                        | implementation gap | F62           |
| _Delta `e0cb5a0`:_ `QĐ-92c` phiên bản tiếp theo sau khi bị từ chối (`US-06-09` AC-22, `US-06-10` AC-13, `US-06-11` AC-3)                                                                       | `g5-budget-version-decision`, `g5-budget-proposal-and-review`                                                                                                                                                        | implementation gap | F63           |
| _Delta `e0cb5a0`:_ `QĐ-92d`(1)(2) phòng chưa có trưởng phòng — không phiên bản sửa đổi mới, không _cần sửa ngân sách_ (`US-06-09` AC-23, `US-06-13` AC-13)                                     | `g5-budget-proposal-and-review`, `g5-budget-check-and-finance-review`                                                                                                                                                | implementation gap | F64, F33      |
| _Delta `e0cb5a0`:_ `QĐ-92a`, `QĐ-92d`(2) Request chờ phiên bản (`US-06-13` AC-11, AC-13)                                                                                                       | `g5-budget-check-and-finance-review`                                                                                                                                                                                 | implementation gap | F65, F33      |
| _Delta `e0cb5a0`:_ `QĐ-92b` + `FR-5.14` dòng 18, 40, 41, 47, 48, 52 → 55 (`US-12-15` AC-24)                                                                                                    | `g5-budget-*`, `g5-request-status-notifications`                                                                                                                                                                     | implementation gap | F67           |

### G6 (điều chuyển, nghỉ việc, bàn giao, `BM-09`, báo lỗi SaaS)

| Story/AC                                                                                                                              | Hạng mục                                                                                         | Trạng thái                  | Finding  |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------- | -------- |
| `US-03-01` AC-14, AC-22; `US-03-03`; `US-03-04` AC-1, AC-2, AC-8, AC-14, AC-15, AC-22, AC-23; `US-03-11` AC-1, AC-8, AC-9 (người ghi) | `g6-transfer-record`, `g6-long-leave`, `g6-offboarding-record`, `g6-hr-notices-and-verification` | contract change             | F40      |
| `US-03-01` AC-18 → AC-21 (căn cứ, dời, hủy, một sự kiện chờ)                                                                          | `g6-transfer-record`                                                                             | aligned (thiếu test đua)    | F46      |
| `US-03-01` AC-11, `US-03-10` AC-10 (chức vụ không là sự kiện)                                                                         | `g6-transfer-record`, `g6-hr-notices-and-verification`                                           | migration/backfill required | F41      |
| `US-03-01` AC-23                                                                                                                      | `g6-transfer-record`                                                                             | implementation gap          | F44      |
| `US-03-07` AC-1, AC-3, AC-15                                                                                                          | `g6-transfer-tool-review`                                                                        | implementation gap          | F42, F43 |
| `US-03-07` AC-2, AC-6, AC-7, AC-9, AC-13, AC-14                                                                                       | `g6-transfer-tool-review`                                                                        | aligned                     | —        |
| `US-03-04` AC-20 (`BM-08` khóa, thu hồi, đóng)                                                                                        | `g6-offboarding-record`                                                                          | aligned                     | —        |
| `US-03-04` AC-27, AC-28; `QĐ-77k`, `QĐ-83c`, `QĐ-62c`                                                                                 | `g6-leaver-role-and-workspace-duties`, `g6-handover-confirmation`                                | aligned (người nhận F17)    | F17      |
| `US-03-08` AC-7, AC-10 (đổi người chịu trách nhiệm trong phòng)                                                                       | `g6-service-account-handover`                                                                    | aligned                     | —        |
| `US-03-08` chuyển phòng tài khoản dịch vụ (C-03)                                                                                      | `g6-service-account-handover`                                                                    | obsolete                    | F06      |
| `US-03-10` AC-1 → AC-9 (trưởng phòng gửi `BM-09`)                                                                                     | `g6-hr-notices-and-verification`                                                                 | aligned trừ F41             | F41      |
| `US-03-11` xác minh chỉ ở đường `BM-09`                                                                                               | `g6-hr-notices-and-verification`                                                                 | aligned                     | —        |
| `US-07-10`, `US-07-11`, `FR-2.15` (`BM-11`)                                                                                           | `g6-saas-error-report`                                                                           | aligned (`OQ-31` mở)        | —        |
| `US-03-05` (phía sự kiện)                                                                                                             | `g6-time-limited-access`                                                                         | aligned                     | —        |
| `QĐ-87c` Super Admin là đối tượng                                                                                                     | `g6-*`                                                                                           | ADR/Owner decision required | F19      |

**Đếm `aligned`:** 43 dòng (gồm dòng _aligned trừ Fxx_ ghi phần đúng) — 38 ở pin `769bb64` + 5 dòng _Delta `e0cb5a0`_.

## 5. Disposition các ID lịch sử

| ID                                                            | Disposition Prompt 03                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Bằng chứng                                                                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `P28-05`                                                      | Mở một phần: lời mời, đặt lại, thông báo đổi mật khẩu, khôi phục người giữ vai gửi `loginEmail`; còn đường `REASSIGN` (F18) và thiếu test đổi email công việc                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `successor-enrolment.service.ts:108-118`                                                                       |
| `P28-09` (`US-02-02` AC-17)                                   | Mở — F17                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | không có thông báo trong `organization`/`data-import`                                                          |
| Prompt 26 `F1`, `F2`, `F4`                                    | Mở — F49                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | mục F49                                                                                                        |
| Prompt 26 `F6`                                                | Đóng (Prompt 02)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `test/support/openapi-example-manifest.ts:331` `NO_EXAMPLE_RESPONSES = {}`                                     |
| `OPENAPI-EXAMPLE.1-F7`, `-F8` (= `P02-DEC-3`), `-F10`         | Mở — F49                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | mục F49                                                                                                        |
| `OPENAPI-EXAMPLE.1-F9`                                        | Mở — năm lỗi runtime nằm trong F37 và F36 (theo inventory G5/G6 của Prompt 02)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `openapi-response-examples` spec                                                                               |
| `OPENAPI-EXAMPLE.1-F11`                                       | Đóng (Prompt 02)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | spec Prompt 02                                                                                                 |
| `P02-DEC-1`, `P02-DEC-2`                                      | Đã áp trong mã                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `budget.http-errors.ts:145-159`; `budget-proposals.controller.ts:120`                                          |
| `LD-13` điểm 1 → 7                                            | Mở, ngoài Prompt 04 trừ mục registry của operation bị gỡ — F55 / P03-D14                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | gate `src/api-collection-contract.spec.ts:260-433`                                                             |
| `LD-R2-RV-01` → `-03`                                         | Đóng (09A, 09B)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | gate `:48-58`, `:1678`, `:1994-2002`                                                                           |
| `GATE-RV-01`                                                  | Đóng (09C)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `scripts/verify/git-bash.mjs`                                                                                  |
| `BBI-E01`                                                     | Đóng trong mã                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `budget.policy.ts:68-69`; `budget-check.policy.ts:99-110`                                                      |
| `BBI-D01`                                                     | Actor Super Admin `aligned`; còn F03, F17                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | mục 4 G0–G2                                                                                                    |
| `BBI-D02`                                                     | Bị `QĐ-87a` thay (người sửa là Super Admin) — F11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `employee-maintenance.controller.ts:24`                                                                        |
| `BBI-D03`                                                     | Aligned (`FISCAL_YEAR_START_MONTH`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `parameter-definitions.ts`                                                                                     |
| `BBI-D04`                                                     | Cost Center chỉ `Unit` aligned; quy chi phí theo phòng sở hữu — F01, F02, F05                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | mục 3.1                                                                                                        |
| `OQ-B-09`                                                     | Đóng cho Request và read model; còn F23                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `request-assessment.service.ts:116`                                                                            |
| `OQ-B-02`                                                     | Mở (không có trạng thái _đang ngừng_)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `catalog.prisma:82-85`                                                                                         |
| `P29-MIGRATION` (`COMPANY`)                                   | Đóng trong mã                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `20261022120000_cost_centers_unit_only/migration.sql:139-145`; `unit-only-upgrade-history.integration-spec.ts` |
| `H7-OPS-01`                                                   | Mở — hành động Owner trên VPS trước merge `main`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | tracker                                                                                                        |
| `SEC-UPGRADE-RV-01-F4`, `-T1`                                 | Ghi nhận, không đổi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | tracker                                                                                                        |
| `OPENAPI-DIALECT-F1`, `-F2`                                   | Bàn giao FE/Mobile, không đổi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | tracker                                                                                                        |
| `P02-E2E-LOAD`, `P02-INT-IO`                                  | Môi trường; đo lại ở lượt gate cuối của Prompt 03                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | báo cáo review                                                                                                 |
| `BEH-14` (1) → (8)                                            | Delta `e0cb5a0`: (1) F62, F63; (2) aligned; (3) aligned trừ F66; (4) F62, F65, F67; (5) F62 (đọc ngân sách đối chiếu); (6) aligned trừ F67; (7) F63; (8) F64, F33                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | mục 3.8                                                                                                        |
| `T-10`, `T-11` (handoff)                                      | Thiết kế BE, không phải câu hỏi Owner: mã trạng thái/cờ/lịch chạy/lịch sử — F62, F66; cột liên kết, chặn khởi tạo, thông báo giữ chờ — F63, F64, F67                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | handoff §4                                                                                                     |
| `P03-D08`                                                     | Đóng 26/10/2026 — nguồn cuối xác định (BRD v3.57 `FR-3.20`, `QĐ-92d`(2), `US-06-13` AC-13); F33 thành implementation gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | mục F33                                                                                                        |
| `P03-D01` → `P03-D07`, `P03-D09`, `P03-D11`                   | Owner trả lời A ngày 27/10/2026; không còn disposition chặn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | spec mục L, bảng disposition                                                                                   |
| `P03-RV-01`                                                   | Review correction trong Prompt 03 (27/10/2026), không phải finding mới — vẫn thuộc F02: trình tự D03 cũ để migration (B) lỗi có chủ đích rồi dùng `prisma migrate resolve` ⟹ thay bằng mở rộng → gán → thu hẹp qua hai revision; P03-D03 = A giữ nguyên                                                                                                                                                                                                                                                                                                                                                                                                                                       | spec L.3; plan Task 1.2a, 1.2b, 1.2c, Checkpoint E                                                             |
| `P03-RV-02`                                                   | Review correction trong Prompt 03 (27/10/2026), không phải finding mới — vẫn thuộc F02: trigger chặn `owner_department_id` NULL ở migration (A) làm image `7c28e75` hỏng `subscriptionCreate` trong cửa sổ migrate → recreate và khi H7 phục hồi ⟹ (A) chỉ cộng thêm, bất biến ghi mới ở ứng dụng mở rộng, probe schema, kiểm kê sống, (B) một mình đặt ràng buộc CSDL                                                                                                                                                                                                                                                                                                                        | spec L.3; plan Task 1.2a, Checkpoint E, Task 1.2b, Task 1.2c                                                   |
| `P03-RV-03`                                                   | Review correction trong Prompt 03 (27/10/2026), không phải finding mới — gắn F01, F03, F04 → F06, F20: bản cuối chạy migration phá hủy trước khi image tương thích thôi dùng đối tượng, H7 migrate trước recreate và phục hồi image trước trên schema đã migrate, seat lệch phòng sau (B) thành 500 chưa ánh xạ ⟹ một điểm dừng `expansion-ready-owner-action` cho **bản tương thích** (mọi phần cộng thêm + chuyển ứng dụng + guard F20 422), mọi migration của bản cuối tương thích image tương thích, H7 phục hồi không khôi phục CSDL, `cost_centers.department_id` NULL chỉ ở dòng chưa từng gắn phòng; P03-D03/D06/D07 giữ nguyên                                                       | spec L.10, K (F20); plan Task 1.1a, 1.3a, 1.4a, 1.9a, 3.2a, 4.7a, Checkpoint E, Task 1.2b                      |
| `P03-RV-04`                                                   | Review correction trong Prompt 03 (27/10/2026), không phải finding mới — gắn F01: cách đóng `P03-RV-03` để `cost_centers.department_id`/`linked_at` NULL vĩnh viễn cho Cost Center chưa từng gắn phòng, trái `QĐ-87d(1)` (mỗi Cost Center thuộc đúng một Department suốt vòng đời) ⟹ schema cuối NOT NULL; bản tương thích chỉ tạo Cost Center có phòng; kiểm kê sống `COST_CENTER_UNLINKED` gồm dòng muộn của `7c28e75`; lệnh `ops:cost-center-direction` liên kết theo căn cứ; một binary không thỏa cả hai cửa sổ H7 ⟹ **một bước kích hoạt** của operator trong Task 1.2b (Owner duyệt cơ chế 27/10/2026), vẫn một điểm dừng, không deploy boundary thứ hai; P03-D01 → P03-D16 giữ nguyên | spec A, L.10, L.11, K (F01); plan Task 1.1a, 1.2b, 1.1, 2.2, Checkpoint E, Checkpoint 1                        |
| `P03-D16`                                                     | Owner trả lời A ngày 26/10/2026, pin Docs `e0cb5a0`; delta audit trong cùng hạng mục                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | mục 3.8, 10                                                                                                    |
| `SOURCE-GAP` của `SM-01`, `SM-01a`, `SM-02`, `SM-03`, `SM-05` | Không phải finding BE: ghi điểm mở có sẵn (`OQ-C-06`, `OQ-C-09`, cấu hình N/M, trạng thái trước ngày vào làm, khóa tài khoản chưa kích hoạt); không quyết định mới                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | mục 10                                                                                                         |

## 6. Contract và bàn giao FE/Mobile

FE/Mobile chưa nối API (Owner 25/10/2026); chỉ ghi để các đội tự sinh lại client khi bắt đầu. Prompt 03 không chạy lệnh của hai repo.
Mọi thay đổi phá vỡ dưới đây đi trực tiếp một lượt, không 410, không cửa sổ deprecation (P03-D07 = A, Owner 27/10/2026 — spec L.6). Phần
mà bản cuối bỏ bảng/cột lưu trữ (17 operation gỡ, `outsideStandard*`, chức vụ trên thân điều chuyển/`BM-09`) cùng `ownerDepartmentId`, enum
phản hồi cộng thêm, `costCenter`/`…ByAppUserId` nullable và 422 của F20 đã có từ **bản tương thích** (spec L.10, review `P03-RV-03`).

| Loại                       | Operation / trường                                                                                                                                                                                                                                                                                                                                                                                                                                            | Finding                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Gỡ operation               | `jobTitleList`, `jobTitleCreate`, `jobTitleRename`, `jobTitleDeactivate`, `jobTitleReactivate`                                                                                                                                                                                                                                                                                                                                                                | F03                     |
| Gỡ operation               | `standardToolsetList`, `standardToolsetMine`, `standardToolsetGet`, `standardToolsetSet`, `standardToolsetHistory`                                                                                                                                                                                                                                                                                                                                            | F04                     |
| Gỡ operation               | `subscriptionCostAllocationGet`, `subscriptionCostAllocationSet`, `subscriptionCostAllocationHistory`                                                                                                                                                                                                                                                                                                                                                         | F05                     |
| Gỡ operation               | `licenseAssignmentProposeDepartmentMove`, `serviceAccountMoveList`, `serviceAccountMoveConfirm`, `serviceAccountMoveCancel`                                                                                                                                                                                                                                                                                                                                   | F06                     |
| Đổi vai                    | org/HR write → `SUPER_ADMIN`; IT Admin chỉ đọc tối thiểu                                                                                                                                                                                                                                                                                                                                                                                                      | F10–F12, F40            |
| Thêm trường bắt buộc       | `hrBasis` trên ghi tổ chức; `ownerDepartmentId` trên `subscriptionCreate` (từ revision mở rộng của F02 — Task 1.2a; đọc `ownerDepartmentId` nullable tới revision thu hẹp, rồi không null); `departmentId` trên `costCenterCreate` (từ bản tương thích — spec L.11)                                                                                                                                                                                           | F01, F02, F10           |
| Bỏ trường                  | `costCenterId` của `departmentCreate`; `outsideStandard`, `outsideStandardReason`; `evidence` của `/hand-off`; `toJobTitleId`, `changes` chức vụ; `selfExecuted` của sự kiện                                                                                                                                                                                                                                                                                  | F01, F04, F08, F41, F45 |
| Đổi kiểu                   | `jobTitleId` → `jobTitle` chữ tự do nullable; `costCenter` nullable; `cancelCause` thêm giá trị điều chuyển                                                                                                                                                                                                                                                                                                                                                   | F03, F01, F29           |
| Mã/trạng thái mới          | cấu hình tài chính chưa hoàn tất; 403 Super Admin gửi Request; nhóm chặn ngừng phòng; nháp Request; 422 `COST_CENTER.DEPARTMENT_NOT_ACTIVE`; 409 `DEPARTMENT.CREATION_AWAITING_ACTIVATION` (chỉ bản tương thích, trước bước kích hoạt — spec L.11)                                                                                                                                                                                                            | F27, F30, F15           |
| Enum phản hồi thêm giá trị | `BudgetVersionState` _hết hiệu lực_ + cờ _chưa từng hiện hành_; `BudgetProposalState` _đóng — hết năm tài chính_ (tên do BE đặt — `T-10`)                                                                                                                                                                                                                                                                                                                     | F62                     |
| Thêm trường chỉ đọc        | đề xuất: `successorOfProposalId`, `successorProposalId`, `succeededAt`; phiên bản: `rejectedPredecessorId`, cờ _tách khỏi đề xuất_ (F36) — spec J.1                                                                                                                                                                                                                                                                                                           | F63, F36                |
| Đổi hành vi                | `budgetVersionDecide` từ chối **không** còn trả đề xuất về `RETURNED`; `budgetVersionCreate` nhận đề xuất `REVIEWED` có phiên bản mới nhất bị từ chối và chưa có kế tiếp (hệ thống đặt `rejectedPredecessorId`); `budgetProposalSubmit` tự nối đề xuất mới làm kế tiếp (body không đổi); phiên bản bị từ chối/yêu cầu sửa **không** mở lại bước Finance rà soát; `financeReviewComplete` nhận Request `AWAITING_BUDGET` — spec J.1, J.3                       | F63, F65                |
| Mã/trạng thái mới          | từ chối khởi tạo phiên bản sửa đổi khi phòng chưa có trưởng phòng (F64, 409 `BUDGET.DEPARTMENT_HAS_NO_HEAD`); 422 `BUDGET.YEAR_ENDED` trên quyết định/sửa/rút/trả lại sau khi năm kết thúc (F62); `financeReviewComplete`: 403 `SPEND.OWN_REQUEST`, 409 `SPEND.ALREADY_AWAITING_BUDGET`, 409 `SPEND.REVIEWER_IS_APPROVER` (cả `spendApprovalDecide` — F32); mã hộp thông báo ngân sách/vòng Finance (F67)                                                     | F32, F62, F64, F65, F67 |
| Operation mới              | Nháp Request trả phí (P03-D01 = A — spec L.1): `accessRequestDraftSave` (`POST /access-requests/drafts`), `accessRequestDraftList` (`GET /access-requests/drafts`, `pageSize` ≤ 100), `accessRequestDraftSubmit` (`POST /access-requests/drafts/{id}/submission`), `accessRequestDraftDelete` (`DELETE /access-requests/drafts/{id}`); `AccessRequestState` thêm `DRAFT` trên đọc của người tạo; 404 nháp không phải của mình, 409 `ACCESS_REQUEST.NOT_DRAFT` | F27                     |
| Đổi kiểu                   | Người thực hiện của điều chuyển, nghỉ dài, nghỉ việc, `BM-09` (P03-D02 = A — spec L.2): mỗi `…ByAppUserId` thành nullable, thêm `…ByProcedure` (boolean)                                                                                                                                                                                                                                                                                                      | F19                     |
| Mã/trạng thái mới          | 403 `EMPLOYEE.SELF_CHANGE_FORBIDDEN`, `PERSONNEL.SELF_CHANGE_FORBIDDEN` (Super Admin tự thao tác — F19); `subscriptionUpdate` 409 `FINANCE.SETUP_INCOMPLETE` khi tạo/tăng/kéo dài nghĩa vụ ở phòng chưa có Cost Center (F26 — spec L.7); 422 `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH` trên `provisioningTaskGrant`, dòng nhập seat `ERROR` cùng mã (F20 — spec K, L.10)                                                                          | F19, F20, F26           |
| Operation mới              | `GET /budget-versions/{id}/history` — `budgetVersionHistoryList` (`BudgetVersionHistoryPageResponseDto`, `pageSize` ≤ 100, `seq` giảm dần; 200, 403 `AUTHORIZATION.FORBIDDEN`, 404 `BUDGET.VERSION_NOT_FOUND`, 422 `VALIDATION_ERROR`) — spec J.4. Không operation mới cho F65 (mở rộng `financeReviewComplete`)                                                                                                                                              | F66                     |

## 7. Chuyển tiếp schema (migration tiến, không down)

Quy ước repo: không sửa migration đã merge, không có down (`DB-05`); rollback = khôi phục bản sao lưu trước `migrate deploy`
(`docs/guides/containers.md`) — chỉ khi operator chủ động rollback qua ranh giới phá hủy; deploy lỗi thường được H7 phục hồi về image tương
thích mà không khôi phục CSDL, vì phần cộng thêm và chuyển ứng dụng đi trước ở **bản tương thích** ([spec L.10](spec.md#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03), review
`P03-RV-03`). Production `main` (`8d2db2b`) mới có 5 migration ⟹ mọi chuyển tiếp dưới đây chỉ chạm CSDL dev,
demo, VPS thử nghiệm; vẫn phải diễn tập trên CSDL **có dữ liệu** ở `7c28e75` (seed `pnpm dev:seed` + dữ liệu G5/G6 của harness).

| Chuyển tiếp                                                 | Đối tượng                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Backfill                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Phá hủy                                                                                                               | Finding  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| Phòng → Cost Center thành Cost Center → phòng + `linked_at` | `departments.cost_center_id`, trigger `departments_require_unit_cost_center`, guard tài khoản dịch vụ, `access_requests.cost_center_id`                                                                                                                                                                                                                                                                                                                                                               | Có, tất định 1–1 ở **bản tương thích** (cột NULL + hai trigger đồng bộ); Cost Center `7c28e75` thiếu liên kết là dữ liệu chuyển tiếp: kiểm kê sống + `ops:cost-center-direction link` theo căn cứ; bản cuối `RAISE` trước mọi ghi khi còn, rồi `department_id`/`linked_at` NOT NULL và bỏ cột/trigger cũ; bảng `cost_center_department_links`, `cost_center_direction_activations`, trigger `cost_centers_department_link_once` — spec L.10, L.11 (review `P03-RV-04`) | Có (bỏ cột/trigger)                                                                                                   | F01      |
| Phòng sở hữu thuê bao NOT NULL                              | `subscriptions.owner_department_id` (migration (A) NULL — chỉ cộng thêm, không trigger/CHECK trên `subscriptions`, image `7c28e75` vẫn ghi được; (B) — migration đầu tiên của bản cuối — mới đặt NOT NULL và guard F02/F20), bảng chỉ ghi thêm `subscription_owner_assignments`, seat cá nhân CHECK — P03-D03 = A, spec L.3                                                                                                                                                                           | Có, theo căn cứ, qua ba mốc (spec L.3, review `P03-RV-01`): revision mở rộng (A) + lệnh `ops:assign-subscription-owner`; Owner/operator gán từng ID tới khi `ops:preflight` `READY`; revision thu hẹp (B) chép phòng + Audit `SYSTEM` mỗi thuê bao ở lượt deploy đầu; chưa qua mở rộng ⟹ `SUBSCRIPTION_OWNER_EXPANSION_REQUIRED` trước migration; không migration lỗi, không sửa lịch sử migration                                                                     | Không                                                                                                                 | F02, F20 |
| Chức vụ → chữ tự do                                         | `job_titles`, `employee_placements.job_title_id`, cột chức vụ của điều chuyển/rà soát, trigger lịch sử; cột chỉ đọc `job_title_name` + trigger `history_job_title_name_frozen` — spec L.4                                                                                                                                                                                                                                                                                                             | Có — P03-D04 = A: giai đoạn hiện hành vào `employees.job_title` (bản tương thích, cùng trigger đồng bộ), lịch sử vào `job_title_name` (bản cuối) — spec L.10                                                                                                                                                                                                                                                                                                           | Có (bỏ `job_title_id`, `job_titles`)                                                                                  | F03      |
| Gỡ bộ chuẩn                                                 | `standard_toolsets*`, `access_requests.outside_standard*`                                                                                                                                                                                                                                                                                                                                                                                                                                             | Không (bản `pg_dump` được bảo vệ trước khi bỏ — P03-D06 = A, spec L.5); ứng dụng thôi dùng ở bản tương thích, bỏ ở bản cuối — spec L.10                                                                                                                                                                                                                                                                                                                                | Có                                                                                                                    | F04      |
| Gỡ phân bổ tỷ lệ                                            | `subscription_cost_allocation*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Không (bản `pg_dump` được bảo vệ trước khi bỏ — P03-D06 = A, spec L.5); ứng dụng thôi dùng ở bản tương thích, bỏ ở bản cuối — spec L.10                                                                                                                                                                                                                                                                                                                                | Có                                                                                                                    | F05      |
| Gỡ chuyển phòng tài khoản dịch vụ                           | `service_account_moves` (dòng `PENDING` phải hủy trên `7c28e75` trước bản tương thích — bản tương thích không còn thao tác này; preflight `SERVICE_ACCOUNT_MOVE_PENDING`, migration `RAISE`)                                                                                                                                                                                                                                                                                                          | Không (hủy trước deploy; bản `pg_dump` được bảo vệ — P03-D06 = A, spec L.5)                                                                                                                                                                                                                                                                                                                                                                                            | Có                                                                                                                    | F06      |
| Tác vụ cấp duy nhất trong tác vụ đang mở                    | chỉ mục `provisioning_tasks_one_grant_per_assignment`                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Không                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Không                                                                                                                 | F07      |
| `hand_off_whole` nới bằng chứng                             | CHECK `provisioning_tasks_hand_off_whole`                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Không                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Không                                                                                                                 | F08      |
| Nháp Request trả phí                                        | `AccessRequestState.DRAFT`; `access_requests.cost_center_id`, `submitted_at` NULL chỉ khi `DRAFT` (CHECK); trigger `access_requests_draft_has_no_work` — P03-D01 = A, spec L.1                                                                                                                                                                                                                                                                                                                        | Không                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Không (enum cộng thêm)                                                                                                | F27      |
| Kết cục điều chuyển                                         | `AccessRequestCancelCause`, nguyên nhân dòng nhóm, lý do hủy tác vụ                                                                                                                                                                                                                                                                                                                                                                                                                                   | Không                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Không (enum cộng thêm)                                                                                                | F29      |
| Bỏ loại `JOB_TITLE_CHANGE`                                  | `PersonnelNoticeKind` (giá trị giữ, chỉ đọc), trigger `BEFORE INSERT` `personnel_notices_no_retired_kind`, `department_transfers_department_changes` — P03-D05 = A, spec L.4                                                                                                                                                                                                                                                                                                                          | Không (dòng chờ hủy trên bản đang chạy trước deploy; preflight chặn, migration `RAISE`)                                                                                                                                                                                                                                                                                                                                                                                | Không (giá trị enum giữ)                                                                                              | F41      |
| Seed _đã báo_ theo múi giờ tổ chức                          | `organization_change_announcements`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Có (kiểm, không sửa migration cũ)                                                                                                                                                                                                                                                                                                                                                                                                                                      | Không                                                                                                                 | F47      |
| Đóng cuối năm phiên bản/đề xuất                             | migration giá trị enum **riêng** ở **bản tương thích** (Task 1.9a — cùng các giá trị của F27, F29, F21), chạy trước (chỉ `ADD VALUE`, không dùng giá trị mới — như `20261016090000_password_self_service`): `BudgetVersionState` _hết hiệu lực_, `BudgetProposalState` _đóng — hết năm tài chính_, `BudgetCheckTrigger` `FINANCE_OUTCOME_WHILE_WAITING` (F65); migration cấu trúc sau đó: cột cờ _chưa từng hiện hành_ + mốc đóng, CHECK `budget_proposals_state_check`, `budget_versions_sent_check` | Không (việc đóng chạy sau migrate, tất định, idempotent; ghi số dòng ở diễn tập)                                                                                                                                                                                                                                                                                                                                                                                       | Không (enum cộng thêm, không hoàn tác — `DB-05`)                                                                      | F62, F65 |
| Phiên bản lập lại và đề xuất kế tiếp sau khi bị từ chối     | `budget_versions.rejected_predecessor_id` (FK tự tham chiếu `RESTRICT`, `UNIQUE`, trigger `budget_versions_rejected_predecessor_guard`); `budget_proposals.successor_of_proposal_id` (FK `RESTRICT`, `UNIQUE`), `succeeded_at`, CHECK `budget_proposals_succession_check`, trigger `budget_proposals_succession_guard`, constraint trigger `budget_proposals_succession_consistent`; `budget_proposals_open_key` định nghĩa lại — spec J.1                                                            | Có, tất định: dòng `RETURNED` của đường cũ R1 → `REVIEWED`, R2 → `REVIEWED` + bản nộp lại thành kế tiếp, Audit `SYSTEM`; ca mơ hồ ⟹ `ops:preflight` `BLOCKED` (chỉ ID) và migration `RAISE`, 0 ghi — spec J.2                                                                                                                                                                                                                                                          | Có (thay chỉ mục duy nhất; đổi `RETURNED` → `REVIEWED`, `previous_proposal_id` → `successor_of_proposal_id` có Audit) | F63      |
| Bản nháp tách khỏi đề xuất                                  | `budget_versions` cột cờ + chỉ mục `budget_versions_in_flight_key` loại bản tách                                                                                                                                                                                                                                                                                                                                                                                                                      | Có, tất định: bản `DRAFT` của đề xuất `WITHDRAWN`/`RETURNED`                                                                                                                                                                                                                                                                                                                                                                                                           | Có (thay chỉ mục)                                                                                                     | F36      |
| Lịch sử sửa phiên bản                                       | bảng chỉ ghi thêm `budget_version_history` (enum `BudgetVersionHistoryKind`, `UNIQUE (version_id, seq)`, CHECK hình dạng/kích thước, trigger chặn `UPDATE`/`DELETE`/`TRUNCATE`) — spec J.4                                                                                                                                                                                                                                                                                                            | Không (lịch sử bắt đầu từ migration)                                                                                                                                                                                                                                                                                                                                                                                                                                   | Không                                                                                                                 | F66      |
| Thông báo giữ chờ cho trưởng phòng đầu tiên                 | bảng `held_department_notifications` của capability `notifications` (`prisma/models/notifications.prisma`): `id`, `organization_id`, `department_id` (FK `RESTRICT`), `code`, `subject_type`, `subject_id`, `params` JSONB, `event_key` (`UNIQUE`), `held_at`, `delivered_at` NULL, `delivered_to_employee_id` NULL; CHECK `delivered_at` ⟺ `delivered_to_employee_id` — spec mục I                                                                                                                   | Không                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Không                                                                                                                 | F67      |
| Phiếu thủ tục khi Super Admin là đối tượng                  | bảng chỉ ghi thêm `super_admin_event_tickets`; cột `…_by_ticket_id` (FK `RESTRICT`) cạnh mười cột người thực hiện của `personnel`, CHECK _đúng một_/_tối đa một_ — P03-D02 = A, spec L.2                                                                                                                                                                                                                                                                                                              | Không (dòng cũ đều có người dùng)                                                                                                                                                                                                                                                                                                                                                                                                                                      | Không                                                                                                                 | F19      |

Sau mỗi migration chạy `ops:db-roles reconcile` (grant runtime qua default privileges — không có `GRANT` trong migration; F52 thêm
đường G5/G6 vào suite vai runtime).

## 8. Ngoài phạm vi G0–G6 (ghi để không mất)

- BEH-11(b) khuyến nghị ghost seat tạm dừng (`QĐ-90c`) — G7, chưa có module khuyến nghị.
- BEH-12 chấp nhận khoản chi _Chưa phân bổ_ theo phòng (`QĐ-90f`) — G9; nhãn báo cáo — G8.
- BEH-13 đổi gói, rà soát quyền định kỳ — chỉ đặc tả (`QĐ-90d`); không làm.
- Cổng vòng đời `QĐ-88a`/`QĐ-89d` cho quyết định gia hạn/giảm/hủy — G8; hợp thức hóa — G9.
- `US-14-06` yêu cầu chỉnh sửa — lát xuyên nhóm sau G5; nơi nhận trường hồ sơ chính thức là Super Admin (`D-3`).
- Báo cáo _Chưa phân bổ Cost Center_, chi phí theo phòng sở hữu (BEH-06(c), BEH-09(b)) — G8.
- Báo cáo ngân sách so thực chi của năm đã kết thúc theo ngân sách đối chiếu (`BEH-14`(5), `QĐ-91c`) — G8; Prompt 04 chỉ làm phần đọc ngân sách ở các view G5 hiện có (F62).

## 9. Phụ lục: delta User Stories `72e1480` → `769bb64`

Sinh bằng công cụ chỉ đọc (so `BE-UserStory/src/EP-01.md` → `EP-16.md` qua `git show`): 157 Story ở cả hai bản; AC đang dùng
1 549 → 1 550; 71 Story có thay đổi AC. `US-02-07`, `US-04-08`, `US-04-10` bỏ toàn bộ AC (`RETIRED`). Bảng dưới chỉ ghi Story
thuộc phạm vi G0–G6 (EP-01 → EP-07, EP-14, EP-16); Story EP-08 → EP-13, EP-15 có thay đổi nhưng thuộc G7+.

| Story      | AC thêm / bỏ / chuyển _(bỏ)_ | AC đổi chữ                                                                                 |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| `US-01-01` | —                            | AC-19, AC-20                                                                               |
| `US-01-02` | —                            | AC-2, AC-6                                                                                 |
| `US-01-03` | —                            | AC-9                                                                                       |
| `US-01-05` | +AC-15, +AC-16               | AC-14                                                                                      |
| `US-01-09` | +AC-15                       | —                                                                                          |
| `US-01-11` | +AC-9, +AC-10                | AC-4, AC-7, AC-8                                                                           |
| `US-01-12` | —                            | AC-4, AC-8, AC-9                                                                           |
| `US-02-02` | —                            | AC-1, AC-2, AC-10, AC-11, AC-13, AC-14, AC-17, AC-19                                       |
| `US-02-03` | +AC-7                        | AC-1, AC-2, AC-6                                                                           |
| `US-02-04` | AC-5 _(bỏ)_                  | AC-1, AC-4, AC-6                                                                           |
| `US-02-05` | +AC-15, +AC-16               | —                                                                                          |
| `US-02-07` | −AC-1 → −AC-12 (`RETIRED`)   | —                                                                                          |
| `US-03-01` | +AC-23, +AC-24; AC-17 _(bỏ)_ | AC-1, AC-4, AC-5, AC-7 → AC-9, AC-11 → AC-16, AC-18 → AC-22                                |
| `US-03-02` | +AC-14                       | AC-7                                                                                       |
| `US-03-03` | —                            | AC-4 → AC-8                                                                                |
| `US-03-04` | AC-12 _(bỏ)_                 | AC-1 → AC-3, AC-8, AC-10, AC-11, AC-14, AC-15, AC-17 → AC-19, AC-22 → AC-24, AC-26 → AC-29 |
| `US-03-06` | +AC-21, +AC-22               | AC-1 → AC-11, AC-13 → AC-20                                                                |
| `US-03-07` | +AC-15                       | AC-1 → AC-3, AC-5, AC-7, AC-8, AC-10, AC-11, AC-13                                         |
| `US-03-08` | —                            | AC-1, AC-5, AC-7 → AC-10                                                                   |
| `US-03-09` | —                            | AC-1, AC-5 → AC-8, AC-10                                                                   |
| `US-03-10` | +AC-10                       | AC-1, AC-2, AC-4, AC-6, AC-8                                                               |
| `US-03-11` | +AC-10                       | AC-1 → AC-9                                                                                |
| `US-04-03` | +AC-13                       | AC-11                                                                                      |
| `US-04-08` | −AC-1 → −AC-5 (`RETIRED`)    | —                                                                                          |
| `US-04-09` | +AC-12, +AC-13               | AC-1, AC-3, AC-5, AC-7 → AC-11                                                             |
| `US-04-10` | −AC-1 → −AC-12 (`RETIRED`)   | —                                                                                          |
| `US-04-11` | —                            | AC-9, AC-10                                                                                |
| `US-05-01` | +AC-15; AC-6 _(bỏ)_          | AC-1, AC-11, AC-12                                                                         |
| `US-05-02` | +AC-12                       | —                                                                                          |
| `US-05-03` | —                            | AC-4                                                                                       |
| `US-05-04` | AC-7 _(bỏ)_                  | —                                                                                          |
| `US-05-06` | —                            | AC-13                                                                                      |
| `US-05-11` | —                            | AC-6                                                                                       |
| `US-05-12` | —                            | AC-1, AC-3                                                                                 |
| `US-05-17` | +AC-17                       | —                                                                                          |
| `US-05-18` | —                            | AC-4                                                                                       |
| `US-05-20` | +AC-11                       | —                                                                                          |
| `US-05-21` | +AC-7                        | —                                                                                          |
| `US-06-09` | +AC-19                       | —                                                                                          |
| `US-06-10` | +AC-10                       | —                                                                                          |
| `US-06-12` | +AC-19                       | —                                                                                          |
| `US-07-01` | +AC-18                       | AC-7                                                                                       |
| `US-07-02` | —                            | AC-5                                                                                       |
| `US-07-04` | —                            | AC-9                                                                                       |
| `US-07-05` | —                            | AC-9, AC-13                                                                                |
| `US-07-09` | —                            | AC-5, AC-18                                                                                |
| `US-07-10` | +AC-10                       | —                                                                                          |
| `US-14-06` | +AC-7                        | AC-1, AC-3, AC-5                                                                           |
| `US-16-01` | —                            | AC-4                                                                                       |
| `US-16-02` | —                            | AC-4, AC-7                                                                                 |
| `US-16-04` | —                            | AC-5, AC-6                                                                                 |

### 9.1 Delta User Stories `769bb64` → `e0cb5a0`

Sinh bằng script chỉ đọc (so `EP-01.md` → `EP-16.md` qua `git show`, từng dòng `- **AC-n …**`): 157 Story ở cả hai bản; AC đang dùng
1 550 → **1 560**; 5 Story có thay đổi, đều ở EP-06 và EP-12. Chủ đề xuất cho Task 0.1 (re-pin scope map G5) ghi ở cột cuối — Task 0.1
chốt khi re-pin.

| Story      | AC thêm                        | AC đổi chữ                   | Finding            | Chủ đề xuất (scope map G5)                                                                 |
| ---------- | ------------------------------ | ---------------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| `US-06-09` | +AC-20, +AC-21, +AC-22, +AC-23 | AC-1 (nhãn _chờ quyết định_) | F66, F62, F63, F64 | AC-20, AC-22, AC-23 `g5-budget-proposal-and-review`; AC-21 `g5-budget-version-decision`    |
| `US-06-10` | +AC-11, +AC-12, +AC-13         | —                            | F67, F62, F63      | `g5-budget-proposal-and-review`                                                            |
| `US-06-11` | +AC-10                         | AC-3, AC-4, AC-6             | F62, F63, F67      | `g5-budget-version-decision`                                                               |
| `US-06-13` | +AC-13                         | AC-11                        | F33, F65, F64      | `g5-budget-check-and-finance-review`                                                       |
| `US-12-15` | +AC-24 (dòng 52 → 55)          | dòng 18, 48; luồng phụ       | F67                | phát thông báo: hạng mục G5 của từng dòng; danh mục/dashboard vẫn G8 (`US-12-15` thuộc G8) |

## 10. Phạm vi delta Docs `769bb64..e0cb5a0`

Ba commit Owner (`8bfae03`, `e6d2573`, `e0cb5a0`, 26/10/2026), 95 tệp. Delta **không** chỉ là sơ đồ. Phân loại mọi nhóm tệp:

| Nhóm tệp                                                                                                                                     | Thẩm quyền                                | Tác động BE                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Decisions/project-decisions.md` (`QĐ-91`, `QĐ-92`, con trỏ tại `QĐ-82d`(6), `QĐ-82n` hệ quả (e), `QĐ-85` hệ quả (4), `QĐ-91f`)              | hạng 1                                    | mục 3.8: F62 → F67; F33, F36, F13 mở rộng                                                                                                     |
| BRD v3.56 → v3.57 (`FR-3.20`, `FR-5.14`, `FR-5.15`, 5.10, 5.12.3, thuật ngữ, §11)                                                            | hạng 2                                    | như trên; `FR-3.20` đóng P03-D08                                                                                                              |
| `rules/domain-guardrails.md` (vế Finance)                                                                                                    | hạng 3                                    | F64, F63 (phiên bản đầu chỉ từ `BM-10` — aligned)                                                                                             |
| `BE-UserStory/src/EP-06.md`, `EP-12.md`, `00-head.md`, `99-tail.md`, bản sinh, `epics/`, `README.md`                                         | hạng 3                                    | mục 9.1 (+10 AC); `00-head`/`99-tail`/bản sinh chỉ số đếm và metadata                                                                         |
| `Requiments/Định nghĩa phạm vi & nghiệp vụ.md` (giữ v1.36), `Decisions/QUY_TRINH_COST_CENTER_VA_VONG_DOI_SAAS.md` (tài liệu giải thích v1.8) | metadata / giải thích                     | không có quy tắc mới                                                                                                                          |
| Full Logical ERD 3.3 (`LOGICAL-ERD.md`, `-MAPPING`, `-ENTITY-DESCRIPTIONS`, `-INVENTORY`, hình/PDF/DOCX, `ERD/tools/*`)                      | hạng 4 — tên logical, không phải contract | R25/R26 và `UNIQUE(rejectedPredecessorId)` ⟹ F63; trạng thái `EXPIRED` + cờ ⟹ F62; _chưa hiện thực_ ⟹ F61                                     |
| Conceptual ERD v5.2, `ERD/README.md` (chỉ metadata)                                                                                          | hạng 4                                    | không                                                                                                                                         |
| `Diagrams/State-diagram/` mới: `SM-04` (+ specs, `smkit.py`, test, inventory, index, manifest, guide)                                        | hạng 4 — dẫn xuất từ `QĐ-91`/`QĐ-92`      | không có quy tắc ngoài `QĐ-91`/`QĐ-92`; dòng cấm của `SM-04` v1.2 (mở lại bản bị từ chối, thao tác sau khi hết hiệu lực) là test của F62, F63 |
| `SM-01`, `SM-01a`, `SM-02`, `SM-03`, `SM-05`                                                                                                 | hạng 4 — dẫn xuất                         | chỉ dẫn `QĐ` ≤ `QĐ-90` (không có `QĐ-91`/`QĐ-92`); các `SOURCE-GAP` là điểm mở có sẵn (`OQ-C-06`, `OQ-C-09`…) — không finding BE mới          |
| `MF-2` v6.2, `SBF-06` v1.2, Use Case (`UC20`, `UC82` → `UC84`), Context/FDD, `Diagrams/index.md`, `open-items.md`, công cụ sinh              | hạng 4 — mô tả/metadata; hình không đổi   | không ngoài mục 3.8                                                                                                                           |
| Handoff `organization-workforce-authority-2026-10-24.md` (`BEH-14`, `T-10`, `T-11`, tiêu đề, nguồn)                                          | hạng 5 — chỉ mục                          | mục 5 (`BEH-14`, `T-10`, `T-11`); câu _chưa Owner review/commit_ ⟹ F61                                                                        |
| `.gitignore`, `__pycache__/*.pyc` (xóa), tệp khóa Word (xóa)                                                                                 | không                                     | không                                                                                                                                         |

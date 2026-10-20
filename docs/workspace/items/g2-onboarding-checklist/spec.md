# Spec: lát G2 — checklist khởi tạo (bước 1)

- Phụ trách: AI theo giao việc Owner (triển khai 16/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (16/10/2026). Hạng mục `g2-onboarding-checklist` của bảng phủ G2, **chỉ phần làm được ở G2**: bước 1. Bảng phủ ghi bước 2 → 5 chờ G3/G4 và đề xuất làm sau G3; lát này dựng khung và bước 1 để G3/G4 chỉ cộng bước, không đổi hợp đồng.
- Thiết kế: ready. Triển khai: **verified** local 16/10/2026 (cây làm việc chưa commit trên `e833092`; xem [plan](plan.md)). Owner review: chưa review.
- Nguồn: Docs commit `3341ea0` ([sources](../../sources.md)). `US-02-04` AC-1 (bước 1), AC-4, AC-6 (`BE-UserStory/src/EP-02.md`); BRD v3.39 `FR-9.1`, `FR-9.6`, mục 5.9; `QĐ-43e`, `QĐ-52`, `QĐ-66d`.
- Trạng thái yêu cầu: Story `BASELINED` (`QĐ-72`). Không câu hỏi mở chặn phần làm.
- [Kế hoạch](plan.md).

## Vấn đề và phạm vi

IT Admin cần thấy bước nào của khởi tạo đã xong và còn thiếu gì, **tính từ dữ liệu có thật** (không theo cách nhập).

| Trong lát                                                                                                                                  | Ngoài lát (nơi làm)                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Bước 1 (phòng ban + nhân sự): hoàn tất khi có ít nhất một phòng hoạt động, một nhân viên và lần import nhân sự gần nhất không còn dòng lỗi | Bước 2 (ứng dụng), bước 3 (hợp đồng, thuê bao), bước 4 (hiện trạng seat), bước 5 (usage) và mục bộ công cụ chuẩn — G3, G4, G7 |
| `QĐ-66d`: thiếu trưởng phòng / thiếu IT Admin phụ trách chỉ là **cảnh báo** trong bước 1, không chặn                                       | AC-2, AC-3, AC-5 (chặn bước 4 khi bước 3 chưa xong, trạng thái rỗng, mục bộ chuẩn) — cần dữ liệu G3/G4                        |
| AC-4: chưa có Cost Center `Unit` trống ⟹ chỉ dẫn "Finance tạo trước"                                                                       |                                                                                                                               |

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn           | Kết luận                                                                                                                                                                                                                        | Nguồn / loại             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| "Hết dòng lỗi" tính thế nào   | Lấy import **gần nhất chưa bị hủy** (bản xem trước hoặc đã ghi) và số dòng `ERROR` của nó; không có import nào (nhập tay) ⟹ không có lý do này. Import bị hủy bị bỏ qua. Sửa file rồi tải lên lại (import mới hơn, sạch) ⟹ xong | AC-6 `QĐ-66d`            |
| Tiêu chí "có phòng, có người" | `NO_DEPARTMENT` khi không còn phòng hoạt động; `NO_EMPLOYEE` khi không còn nhân viên đang làm việc. Phòng chưa gắn Cost Center không thể có (ràng buộc CSDL) nên không thành lý do                                              | AC-6 "kiểm như bất biến" |
| Bước 2 → 5 trả gì             | `NOT_AVAILABLE` + `NOT_BUILT_YET`; bước 4 `BLOCKED` + `STEP_3_NOT_AVAILABLE` (+ `STEP_1_INCOMPLETE` khi bước 1 chưa xong). Trung thực: không giả bước hoàn tất, không giấu bước chưa có                                         | lựa chọn thận trọng      |
| Ai xem                        | Chỉ IT Admin (Finance chỉ tạo Cost Center ở bước 1, không xem checklist); vai khác 403                                                                                                                                          | AC "Phạm vi quyền"       |

## Hành vi và thiết kế

Module mới `onboarding` không sở hữu bảng: đọc facade `organization` (`getOnboardingFacts`), facade `identity-access` (IT Admin dùng được) và `EmployeeImportService.latestImport`. Route duy nhất: `GET /onboarding-checklist` (`onboardingChecklistGet`, `IT_ADMIN`) ⟹ 200 `ONBOARDING.CHECKLIST_FETCHED` `{ steps[5] }`; bước 1: `{ step, key, status DONE|INCOMPLETE, reasons[], facts{ activeDepartments, activeEmployees, freeCostCenters, latestImport }, createDepartmentBlockedBy NO_FREE_COST_CENTER|null, warnings[{ code, departmentCode, departmentName }] }`.

## Acceptance và kiểm chứng

| US/AC         | Tình huống                                                                                                                      | Cấp test          | Bằng chứng                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------- |
| AC-1 (bước 1) | Có phòng và người ⟹ `DONE`; phòng thiếu trưởng phòng/IT Admin liệt kê ngay trong bước 1                                         | unit + HTTP       | PASS `onboarding.service.spec`, `onboarding-http` |
| AC-4          | Chưa có Cost Center `Unit` trống ⟹ `NO_FREE_COST_CENTER`; Finance tạo ⟹ hết                                                     | HTTP + PostgreSQL | PASS `onboarding-http`                            |
| AC-6          | Import gần nhất còn lỗi ⟹ `INCOMPLETE`; file sạch hơn ⟹ `DONE`; thiếu trưởng phòng/IT Admin vẫn `DONE`; import đã hủy bị bỏ qua | unit + HTTP       | PASS                                              |
| Quyền         | Finance, Super Admin, Employee, trưởng phòng, Người duyệt chi ⟹ 403                                                             | e2e + HTTP        | PASS e2e `onboarding`, `onboarding-http`          |

## Sẵn sàng bàn giao

- [x] Nguồn cố định: Docs `3341ea0`; phần chờ G3/G4 liệt kê.
- [x] Người phụ trách nhận ownership duy trì spec/plan/test (AI theo giao việc Owner, 16/10/2026).

## Thay đổi và nghiệm thu

16/10/2026: thiết kế và triển khai cùng phiên. **Owner xác nhận khi review:** hình dạng phản hồi (bước chưa có trả `NOT_AVAILABLE`, không giả); tiêu chí hoàn tất bước 1 ("ít nhất một phòng, một người"). G3/G4 cộng bước 2 → 5, mục bộ công cụ chuẩn và chặn bước 4 theo AC-2. Chưa review, chưa nghiệm thu.

**Bổ sung 20/10/2026 (sau G3/G4, `verified` local, chưa commit, chưa review):** bước 2 → 4 đã tính từ dữ liệu có thật, không theo cách nhập (`QĐ-43e`). **Bước 2 (`APPLICATIONS`)** hoàn tất khi danh mục có ít nhất một ứng dụng (lý do `NO_APPLICATION`; facts `applications`); **bước 3 (`CONTRACTS_AND_SUBSCRIPTIONS`)** hoàn tất khi có ít nhất một thuê bao (lý do `NO_SUBSCRIPTION`; facts `plans`, `subscriptions`); **bước 4 (`SEAT_BASELINE`)** bị chặn khi bước 1 hoặc bước 3 chưa xong, kèm lý do `STEP_1_INCOMPLETE` và/hoặc `STEP_3_INCOMPLETE` (AC-2, `BR-01.1`), _sẵn sàng_ (`INCOMPLETE`, không lý do) khi cả hai xong (AC-1), và hoàn tất khi IT Admin chốt giai đoạn khởi tạo (`OI-10`; facts `assignments`, `closed`, `closedAt`). Bước 5 vẫn `NOT_AVAILABLE` + `NOT_BUILT_YET` (usage — G7). **AC-3 (trạng thái rỗng dẫn đường, `FR-9.6`)**: `GET /subscriptions` và `GET /applications` trả `emptyState` (`NO_SUBSCRIPTIONS` ⟹ bước 3, `NO_APPLICATIONS` ⟹ bước 2) chỉ khi hoàn toàn chưa có bản ghi nào, không khi bộ lọc cho ra danh sách rỗng. `OnboardingModule` thêm `CatalogModule` và `LicensingModule`; `CatalogService.getOnboardingFacts` và `LicensingService.getBaselineProgress` là hợp đồng. **AC-5 (mục cấu hình bộ công cụ chuẩn sau bước 3, `QĐ-66d`)** làm ở `g3-standard-toolset`: `GET /onboarding-checklist` trả thêm `suggestions: [{ key: 'STANDARD_TOOLSET', afterStep: 3, story: 'US-04-10', available, configuredPairs, blocksStep: false }]`; `available` khi bước 3 hoàn tất, `configuredPairs` là số cặp phòng × chức vụ đã có bộ chuẩn (`CatalogOnboardingFacts.standardToolsets`), và chưa cấu hình không đổi trạng thái bước nào. **Vẫn chờ:** bước 5 — G7.

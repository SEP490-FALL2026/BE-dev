# Spec: lát G2 — danh mục Cost Center do Finance quản lý

- Phụ trách: AI theo giao việc Owner (triển khai 16/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (16/10/2026; Owner giao tự thiết kế, tự làm, review cuối).
- Thiết kế: ready. Triển khai: **verified** local 16/10/2026 (cây làm việc chưa commit trên `e833092`, nhánh `Bao_Dev`; xem [plan](plan.md)). Owner review: chưa review.
- Nguồn: Docs commit `3341ea0` = snapshot `S-2026-10-14b` ([sources](../../sources.md)). `US-04-09` AC-1 → AC-6, AC-10, AC-11 và vế Cost Center của AC-5, AC-7 (`BE-UserStory/src/EP-04.md`); BRD v3.39 `FR-3.1`, `FR-3.17`, `FR-9.7`, `INV-14b`, `INV-20`, `SoD-1`; `QĐ-41c`, `QĐ-52b`, `QĐ-55b`, `QĐ-72`.
- _Đính chính 18/10/2026 ([audit nền tảng](../../../reviews/be-foundation-audit-2026-10-18/README.md)):_ AC đã giao — căn cứ là bảng nghiệm thu bên dưới: `US-04-09` AC-1 → AC-4, AC-5 (vế Cost Center đã ngừng), AC-6 (bản rút gọn; nghỉ dài chờ G6), AC-10/AC-11 (vế ngừng dùng khi phòng hết người). AC-7 **không** thuộc lát này (bảng nghiệm thu ghi _Chưa làm_).
- Trạng thái yêu cầu: Story `BASELINED` (`QĐ-72`). `OQ-B-18` (không chặn) được chọn mặc định ở mục _Làm rõ_.
- [Kế hoạch](plan.md).
- _Tác động 22/10/2026 (baseline Docs `72e1480`, `QĐ-86b`):_ danh mục Cost Center **chỉ** còn loại `Unit`; `Company` là gốc tổ chức và tổng hợp báo cáo, không phải Cost Center (`US-04-09` AC-4, AC-7 viết lại; phần `Company` của `OQ-B-18` hết đối tượng). Mô tả loại `Company`, kiểu `'UNIT' | 'COMPANY'` trong spec này là hành vi đã giao trên nguồn cũ, **không** dùng làm hướng dẫn — sửa forward ở [g2-g4-unit-only-cost-attribution](../g2-g4-unit-only-cost-attribution/spec.md); [ma trận](../business-baseline-impact-2026-10-22/spec.md#ma-trận-tác-động-ae).

## Vấn đề và phạm vi

Phòng ban cần một Cost Center `Unit` do **Finance** tạo trước (`FR-3.17`, `US-04-09` AC-8). Lát này cho Finance duy trì danh mục Cost Center và cho IT Admin **đọc** nó để chọn mã còn trống khi tạo phòng.

| Trong lát                                                                                                | Ngoài lát (nơi làm)                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `US-04-09` AC-1, AC-2 (tạo, IT không tạo được), AC-3 (ngừng dùng khi còn người), AC-4 (hai loại)         | AC-7, AC-8, AC-9 vế **tạo phòng** (chọn, 1–1, đổi tên/trưởng phòng) — `g2-department-profile`                                                        |
| AC-5 vế Cost Center: mã đã ngừng dùng không gắn được cho phòng (ràng buộc CSDL)                          | AC-10, AC-11 vế **tạo phòng mới / điều chuyển từng người** — G2 phòng ban, G6 (`US-03-01`); lát này chỉ cho phép ngừng dùng khi phòng hết người      |
| AC-6 Finance xem nhân viên trong phạm vi Cost Center ở dạng rút gọn                                      | Ngân sách theo Cost Center (`US-06-09`), phân bổ gói dùng chung (`US-04-08`), dòng _Chưa phân bổ_ (`US-12-12`)                                       |
| Chặn nhập nhân viên vào phòng có Cost Center đã ngừng dùng (lý do mới `DEPARTMENT_COST_CENTER_INACTIVE`) | Điều kiện ngừng dùng Cost Center `Company` đang được Assignment tài khoản dịch vụ dùng (G4): **câu hỏi mở**, `OQ-B-18`, xem _Thay đổi và nghiệm thu_ |

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                                         | Kết luận                                                                                                                                                                                                                                                                                                          | Nguồn / loại                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Cho sửa mã không?                                           | **Không**: mã bất biến, chỉ đổi tên. Mã đã có lịch sử không xóa cứng, không dùng lại (không có route xóa)                                                                                                                                                                                                         | AC "không xóa cứng mã"; lựa chọn kỹ thuật |
| "Ngừng dùng còn phòng/nhân viên đang hiệu lực" nghĩa là gì? | Từ chối khi phòng gắn Cost Center **còn nhân viên hiệu lực hôm nay** (đang làm việc, placement chứa hôm nay), liệt kê phòng và người (tối đa 20 tên + tổng). Phòng **không còn ai** thì ngừng dùng được dù phòng chưa bị giải thể — khớp AC-10/AC-11 ("`P-DES` không còn nhân viên hiệu lực nên ngừng dùng được") | AC-3, AC-10, AC-11 — diễn giải            |
| Có mở lại Cost Center đã ngừng dùng không?                  | **Không** có thao tác mở lại (Story không nêu). Muốn dùng lại mã: tạo mã mới. Ghi vào `OQ-B-18` để Owner quyết                                                                                                                                                                                                    | lựa chọn thận trọng, hỏi Owner            |
| Ai đọc danh mục?                                            | Finance và IT Admin (đọc để chọn mã trống). Super Admin, trưởng phòng, Employee bị từ chối                                                                                                                                                                                                                        | AC-2, `SoD-1`; quyền tối thiểu            |
| Tên giữ chỗ                                                 | Chặn tên `Chưa phân loại`, `Chưa phân bổ Cost Center`, `Chưa phân bổ`, `Unclassified`, `Unallocated` (so không phân biệt hoa/thường, dấu, khoảng trắng thừa)                                                                                                                                                      | AC-4, `FR-9.7`                            |
| Nhân viên đã nghỉ trong danh sách AC-6                      | Chỉ gồm người có giai đoạn phòng chứa hôm nay và trạng thái `ACTIVE`; _nghỉ dài_ chưa có trong mô hình (G6) nên mọi dòng là `WORKING`                                                                                                                                                                             | AC-6 (bản rút gọn)                        |
| Cost Center khác `Unit` có phòng?                           | `Company` không gắn phòng (ràng buộc I-3 đã có ở G0); `Unit` gắn tối đa một phòng (unique đã có)                                                                                                                                                                                                                  | I-3                                       |

## Hành vi và thiết kế

### Quyết định kỹ thuật

| Mã   | Quyết định                                                                                                                                                                                                                                                                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-17 | Thứ tự khóa khi ngừng dùng: CostCenter `FOR UPDATE` → Department gắn với nó `FOR UPDATE` → đọc thành viên bằng câu lệnh riêng (T-11, quy tắc 7). Nhập tay nhân viên khóa Department `FOR SHARE` rồi **đọc lại** trạng thái Cost Center bằng câu lệnh riêng, nên thấy kết quả của lần ngừng dùng đã commit |
| T-18 | Ràng buộc CSDL: trigger `departments_require_unit_cost_center` từ chối gắn phòng vào Cost Center không phải `UNIT` **hoặc không còn `ACTIVE`** (SQLSTATE `23514`); CHECK `status = INACTIVE ⇔ deactivated_at IS NOT NULL`                                                                                 |
| T-19 | Ngừng dùng đã ngừng ⟹ 200 trạng thái hiện tại, không audit. Đổi tên giống tên hiện tại (sau chuẩn hóa) ⟹ 200, không audit                                                                                                                                                                                 |
| T-20 | Tên chuẩn hóa như tên chức vụ (NFC, bỏ khoảng trắng đầu/cuối, gộp khoảng trắng giữa; giữ hoa/thường), tối đa 200 ký tự; mã `^[A-Za-z0-9][A-Za-z0-9._-]*$` tối đa 50, **phân biệt hoa/thường** như mã nhân viên                                                                                            |

### HTTP contract

Module `organization`, lớp HTTP ở `OrganizationHttpModule`. Lỗi chung: 401 `AUTHENTICATION_REQUIRED`/`INVALID_ACCESS_TOKEN`, 403 `AUTHORIZATION.FORBIDDEN`, 422 `VALIDATION_ERROR`, 503 `SERVICE_UNAVAILABLE` (sau guard) / `TOKEN_VERIFICATION_UNAVAILABLE` (guard). `CostCenter` trên dây: `{ id, code, name, kind: 'UNIT'|'COMPANY', status: 'ACTIVE'|'INACTIVE', department: { id, code, name } | null, createdAt, updatedAt, deactivatedAt }`.

| Operation (operationId)                                              | Vai                   | Request                                                         | Thành công                                                                                                                            | Lỗi riêng                                                                                                                   |
| -------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/cost-centers` (`costCenterList`)                        | `FINANCE`, `IT_ADMIN` | query `status?`, `kind?`, `search?` (≤ 100), `page`, `pageSize` | 200 `COST_CENTER.LISTED` `{ items, pagination }` theo mã                                                                              | —                                                                                                                           |
| `POST /api/v1/cost-centers` (`costCenterCreate`)                     | `FINANCE`             | `{ code, name, kind }` (strict)                                 | 201 `COST_CENTER.CREATED`, `ACTIVE`, không phòng                                                                                      | 409 `COST_CENTER.CODE_TAKEN`; 422 `COST_CENTER.KIND_NOT_SUPPORTED`, `COST_CENTER.NAME_RESERVED`, `COST_CENTER.NAME_INVALID` |
| `PATCH /api/v1/cost-centers/{id}` (`costCenterRename`)               | `FINANCE`             | `{ name }`                                                      | 200 `COST_CENTER.RENAMED`                                                                                                             | 404 `COST_CENTER.NOT_FOUND`; 422 như trên                                                                                   |
| `POST /api/v1/cost-centers/{id}/deactivate` (`costCenterDeactivate`) | `FINANCE`             | —                                                               | 200 `COST_CENTER.DEACTIVATED` (T-19)                                                                                                  | 404; 409 `COST_CENTER.IN_USE`, `details = { department, employees: [{ employeeCode, fullName }], totalEmployees }`          |
| `GET /api/v1/cost-centers/{id}/employees` (`costCenterEmployeeList`) | `FINANCE`             | query `page`, `pageSize`                                        | 200 `COST_CENTER.EMPLOYEES_LISTED` `{ costCenter: { id, code }, items: [{ employeeCode, fullName, status: 'WORKING' }], pagination }` | 404                                                                                                                         |

Không có `DELETE` (router trả 404 `HTTP_NOT_FOUND`).

### Dữ liệu và migration

Migration `20261016150000_cost_center_lifecycle`: enum `CostCenterStatus`; `cost_centers.status` (mặc định `ACTIVE`), `updated_at`, `deactivated_at`; CHECK nhất quán trạng thái; thay hàm trigger T-18. Cài đặt sẵn có (Cost Center khởi tạo) mặc định `ACTIVE`. Rollback: code cũ bỏ qua ba cột; trigger mới chặt hơn chỉ ở Cost Center đã ngừng dùng (chưa có trước migration).

### Audit và bảo mật

Audit cùng giao dịch: `COST_CENTER.CREATED` (`after` code, tên, loại, trạng thái), `COST_CENTER.RENAMED` (`before`/`after` tên), `COST_CENTER.DEACTIVATED` (trạng thái trước → sau); tác nhân `USER`, vai của người gọi. Bản đọc của Finance (AC-6) không có email, loại nhân sự, ngày vào, trưởng phòng (`QĐ-41c`); danh sách nhân viên đầy đủ vẫn chỉ IT Admin (route `POST /employees` là route nhân sự duy nhất, chưa có danh sách).

## Acceptance và kiểm chứng

| US/AC                     | Tình huống                                                                                                        | Cấp test                | Bằng chứng                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| AC-1                      | Finance tạo `CC-DES`; mã dùng được, audit ghi người tạo                                                           | HTTP + PostgreSQL       | PASS `cost-centers-http` (tạo, audit `USER` + `FINANCE`)                        |
| AC-2                      | IT Admin tạo ⟹ 403, không tạo gì; mọi vai khác bị từ chối                                                         | e2e + HTTP + PostgreSQL | PASS e2e `cost-centers`; `cost-centers-http`                                    |
| AC-3                      | Phòng còn người ⟹ 409 liệt kê phòng và người, không đổi gì, không audit                                           | HTTP + PostgreSQL       | PASS `cost-centers-http` (CC-1 của `P-OPS`; đột biến tắt điều kiện ⟹ 2 test đỏ) |
| AC-4                      | Loại dự án/giữ chỗ, tên _Chưa phân loại_ (kể cả không dấu) ⟹ 422, không tạo                                       | unit + HTTP             | PASS `cost-center-name.spec`, `cost-centers-http`                               |
| AC-5 (Cost Center)        | Gắn phòng vào Cost Center đã ngừng dùng ⟹ CSDL từ chối `23514`; nhập nhân viên vào phòng đó ⟹ 422                 | HTTP + PostgreSQL       | PASS `cost-centers-http`; unit `employee-row.validator.spec`                    |
| AC-6                      | Finance thấy mã, tên, `WORKING`; IT Admin gọi ⟹ 403                                                               | HTTP + PostgreSQL       | PASS `cost-centers-http` (đúng ba khóa mỗi dòng)                                |
| AC-10, AC-11 (ngừng dùng) | Phòng hết người ⟹ ngừng dùng được; lịch sử/phòng giữ nguyên                                                       | HTTP + PostgreSQL       | PASS `cost-centers-http`                                                        |
| Đồng thời                 | Ngừng dùng ↔ nhập người vào phòng, hai thứ tự, không `40P01`, không để người trong phòng của Cost Center đã ngừng | integration, `pg_locks` | PASS `cost-centers-http` (6 vòng)                                               |
| Chưa làm                  | AC-7, AC-8, AC-9, vế tạo phòng của AC-5/AC-10/AC-11                                                               | —                       | Lát `g2-department-profile`                                                     |

## Sẵn sàng bàn giao

- [x] Nguồn cố định: Docs `3341ea0`.
- [x] Scope/AC/contract/dữ liệu rõ; không câu hỏi chặn (`OQ-B-18` không chặn, đã chọn mặc định).
- [x] Người phụ trách nhận ownership duy trì spec/plan/test design (AI theo giao việc Owner, 16/10/2026).

## Thay đổi và nghiệm thu

16/10/2026: thiết kế và triển khai trong cùng phiên theo giao việc của Owner (tự thiết kế, tự làm). Quyết định cần Owner xác nhận khi review: mã bất biến và không có thao tác mở lại; "còn người" = còn nhân viên hiệu lực hôm nay; AC-6 liệt kê chỉ người đang làm việc. Chưa review, chưa nghiệm thu.

21/10/2026 (đợt hoàn tất G2–G4, [audit](../../../reviews/g2-g4-completion-2026-10-21/README.md), câu hỏi Q1 cho Owner): dòng ở bảng _Trong lát/Ngoài lát_ về Cost Center `Company` được ghi lại cho đúng hiện trạng. Từ khi `g4-seat-baseline-import` có, Assignment tài khoản dịch vụ mang `cost_center_id` của một Cost Center `Company` đang dùng; nhưng việc ngừng dùng ở lát này chỉ kiểm nhân viên hiệu lực của phòng gắn Cost Center `Unit`, **không** kiểm Assignment tài khoản dịch vụ. Có chặn ngừng dùng Cost Center `Company` đang được Assignment tài khoản dịch vụ dùng hay không **vẫn là câu hỏi mở** (`OQ-B-18` còn mở; `US-04-09` không có AC cho việc này) và chờ Owner quyết; lát này không tự đặt quy tắc. Hành vi và test của lát không đổi; Owner review: chưa review.

# Spec: IT Admin phụ trách phòng sửa trường hồ sơ nhân viên chính thức theo căn cứ HR

- Phụ trách: chưa phân công.
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 07, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53 `FR-2.1`, `FR-2.2`, `FR-2.14`, `FR-8.6`, `FR-10.7`; `QĐ-82m` `INF-20`; `US-02-02`
  AC-19), BE `69f4891`.
- Nhóm roadmap: G2 — chỉ là planning container, không phải phạm vi (xem `## Sizing decision`).
- Finding: `BBI-D02` của [business-baseline-impact-2026-10-22](../business-baseline-impact-2026-10-22/spec.md).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, IT Admin phụ trách phòng của một nhân viên (hoặc IT Admin khác xử lý thay) sửa được họ tên chính thức, email
công việc, loại nhân sự và ngày vào chưa tới của hồ sơ đã có, chỉ khi kèm căn cứ HR; Super Admin và các vai khác không có
thao tác này; đổi phòng/chức vụ/trạng thái không đi qua đây — kiểm bằng test HTTP và Audit Trail trước/sau.

## Sizing decision

- Container: G2 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: bảo trì trường hồ sơ chính thức; capability `organization/employee`.
- Boundaries: một transaction mỗi lần sửa trên `employees`; HTTP mới (đề xuất `PATCH /employees/{id}`); chỉ `IT_ADMIN`;
  Audit Trail trước/sau kèm căn cứ.
- Not larger: sự kiện nhân sự có ngày hiệu lực (`US-03-01`, `FR-2.14`) và yêu cầu chỉnh sửa của chủ thể (`US-14-06`) ở
  G6/xuyên nhóm.
- Not smaller: một AC, một operation.
- Siblings: `g2-employee-intake-by-super-admin` (căn cứ HR dùng chung).
- Scope map: [G2](../../../roadmap.md#work-item-decomposition-g2).

## Primary Story/AC

| Story    | AC    | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                                                                                 |
| -------- | ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-02-02 | AC-19 | partial  | AC-1, AC-9, AC-12→AC-16, AC-18: `g2-employee-intake-by-super-admin`; AC-17: `g4-notification-delivery`; AC-4, AC-6, AC-8, AC-11: `g2-employee-import-preview-confirm` (giao trước GOV.1); vế bỏ căn cứ HR của AC-19 (`QĐ-93f`): `qd93-remove-hr-basis-org-writes`; AC-2, AC-7, AC-10, AC-20→AC-26: hạng mục `QĐ-93` ở scope map G2 |

AC-19 sở hữu ở đây trừ vế bỏ căn cứ HR (`QĐ-93f`, `qd93-remove-hr-basis-org-writes`); dòng `partial` vì vế đó và các AC khác của Story thuộc hạng mục khác.

## Supporting references

`FR-2.1` (danh sách trường và giới hạn của IT Admin), `FR-8.6` (sửa email công việc **không** đổi email đăng nhập),
`SoD-5`, `QĐ-77m` (hồ sơ của chính IT Admin), `US-14-06` AC-6 (Employee gửi yêu cầu chỉnh sửa — `BBI-C15`).

## Explicit out of scope

Đổi phòng, chức vụ, trạng thái, nghỉ dài/nghỉ việc (`US-03-01`, `FR-2.14`); tài khoản, vai, mật khẩu, chuyển giao/khôi
phục Super Admin; trường tự phục vụ của Employee (mô hình chưa có — `INF-20`); xử lý yêu cầu chỉnh sửa của chủ thể
(`US-14-06`).

## Dependencies and blockers

`g2-employee-intake-by-super-admin` (value object căn cứ HR). Owner review spec.

## Ownership: module, data, API

`organization/employee/` (controller, service sửa mới, DTO, mapper lỗi), quyền đọc IT Admin phụ trách qua capability
`department`/facade `identity-access` như `g2-department-profile`; test integration mới; `openapi.json` (thêm operation).

## Behavior and design

- Trường sửa được: họ tên chính thức, email công việc (chuẩn hóa, không trùng — cùng kiểm như dòng import), loại nhân sự,
  ngày vào **khi chưa tới**. Trường khác trong body ⟹ 422 (strict schema).
- Quyền: IT Admin phụ trách phòng có hiệu lực của nhân viên; IT Admin khác xử lý thay được, Audit Trail ghi; nhân viên là
  chính IT Admin đang thao tác ⟹ theo `SoD-5`/`QĐ-77m` (IT Admin khác thực hiện khi có người dùng được). Super Admin,
  Manager, Finance, Employee ⟹ 403/không có thao tác.
- Căn cứ HR bắt buộc; thiếu ⟹ 422, không ghi. Audit Trail: tài khoản thực hiện, giá trị trước/sau, căn cứ.
- Sửa email công việc không đổi email đăng nhập của tài khoản (nếu có).
- Concurrency: khóa dòng nhân viên; kiểm trùng email trong cùng transaction (chỉ mục duy nhất hiện có là chốt cuối).

## Test matrix

| AC / rủi ro      | Tình huống (gồm từ chối, edge case)                                           | Cấp test    | Kết quả mong đợi                              | Bằng chứng sau implement                                 |
| ---------------- | ----------------------------------------------------------------------------- | ----------- | --------------------------------------------- | -------------------------------------------------------- |
| `US-02-02` AC-19 | `IT1` (phụ trách `P-DES`) sửa họ tên `E1` kèm căn cứ                          | integration | đổi; Audit Trail ghi `IT1`, trước/sau, căn cứ | xanh — `employee-maintenance-http` (21), e2e `employees` |
| `US-02-02` AC-19 | sửa không căn cứ                                                              | integration | 422, không ghi                                | xanh — `employee-maintenance-http` (21), e2e `employees` |
| `US-02-02` AC-19 | Super Admin sửa họ tên                                                        | integration | 403                                           | xanh — `employee-maintenance-http` (21), e2e `employees` |
| `US-02-02` AC-19 | body có phòng/chức vụ/trạng thái                                              | integration | 422                                           | xanh — `employee-maintenance-http` (21), e2e `employees` |
| rủi ro           | email trùng sau chuẩn hóa; ngày vào đã qua; IT Admin sửa hồ sơ của chính mình | integration | từ chối theo quy tắc                          | xanh — `employee-maintenance-http` (21), e2e `employees` |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 07. Chưa code, chưa review, chưa nghiệm thu.

23/10/2026 (Prompt 10 — xử lý tồn đọng G0→G4): `BBI-D02` hiện thực: `PATCH /employees/{id}` (IT Admin) sửa họ tên, email công việc, loại nhân sự, ngày vào chưa tới, bắt buộc căn cứ HR; Audit `EMPLOYEE.OFFICIAL_FIELDS_CHANGED` có trước/sau, căn cứ, `byItAdminInCharge`, `selfExecuted`; hồ sơ của chính IT Admin theo `SoD-5`/`QĐ-77m` (IT Admin khác sửa nếu còn người dùng được; hết người thì tự sửa và gắn cờ). Không đổi email đăng nhập, phòng, chức vụ, trạng thái. Mã ngày vào: `HIRE_DATE_LOCKED`, `HIRE_DATE_IN_PAST`. Kiểm chứng: `employee-maintenance-http` (21), e2e `employees` — xanh trên cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026. Gate toàn cây trên cùng cây: `pnpm lint`, `tsc --noEmit`, `pnpm test` (unit 2.074 (141 suite)), `pnpm test:e2e` (839 (32 suite)), `pnpm test:integration` (112 suite, 1.429 test, gồm 4 test kho S3 thật trên LocalStack), `prisma migrate deploy` trên CSDL mới + `migrate diff --exit-code` (không lệch), `pnpm openapi:export`. Giới hạn: Thông báo "tự thực thi" cho Super Admin chờ hộp thông báo (`g4-notification-delivery`). Chưa commit khi viết dòng này, chưa remote CI, chưa Owner review, chưa nghiệm thu: không có gì là `accepted`; đỏ-trước của từng test không được ghi lại.

01/11/2026 — `QĐ-93` (Docs `69e8a3d`): vế bỏ căn cứ HR của `US-02-02` AC-19 (`QĐ-93f`) thuộc `qd93-remove-hr-basis-org-writes`; scope map G2 ghi AC-19 `partial` (hạng mục này là `Owner`).

## Mở lại theo baseline `769bb64` (Prompt 03, 26/10/2026)

- Audit G0–G6 trên Docs `769bb64` ↔ BE `7c28e75` mở lại hạng mục này: F11 — người sửa trường chính thức là Super Admin (`QĐ-87a`).
- Remediation duy nhất: [g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md) ([impact matrix](../g0-g6-final-business-baseline-remediation/impact-matrix.md#3-findings)). AC liên quan không còn được coi là thỏa nguồn hiện hành cho tới khi remediation xong; trạng thái triển khai ở roadmap. Phần đã ghi phía trên là lịch sử, giữ nguyên.

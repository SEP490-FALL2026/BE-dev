# Spec: Super Admin nhập hồ sơ nhân viên mới kèm căn cứ HR

- Phụ trách: chưa phân công.
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 07, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review — cần Owner xem điểm kiểm soát bù AC-17 (plan, _Before coding_).
- Nguồn: Docs `72e1480` (BRD v3.53 `FR-2.1`, `FR-9.7`, `FR-9.8`, `FR-8.6`; `QĐ-82i`, `QĐ-82m` `INF-20`; `US-02-02` AC-1,
  AC-9, AC-12→AC-16, AC-18; `US-02-03` AC-1), BE `69f4891`.
- Nhóm roadmap: G2 — chỉ là planning container, không phải phạm vi (xem `## Sizing decision`).
- Finding: `BBI-D01` của [business-baseline-impact-2026-10-22](../business-baseline-impact-2026-10-22/spec.md).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, chỉ Super Admin nhập được hồ sơ nhân viên **mới** — import (xem trước bắt buộc) hoặc nhập tay — và chỉ khi
kèm tham chiếu căn cứ HR; IT Admin, trưởng phòng, Finance bị từ chối; Super Admin không nhập hồ sơ của chính mình; mỗi
hồ sơ mới mang căn cứ trong Audit Trail — kiểm bằng test HTTP.

## Sizing decision

- Container: G2 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: khởi tạo hồ sơ nhân viên mới do Super Admin kèm căn cứ HR; capability `organization/employee` (nhập
  tay) và `data-import/employee-import` (import), dùng chung policy đặt chỗ `organization/employee-placement.policy.ts`.
- Boundaries: lệnh ghi nhân viên mới (một transaction mỗi lần nhập tay hoặc xác nhận import); HTTP `POST /employees`,
  `/employee-imports*`; quyền chuyển `IT_ADMIN` → `SUPER_ADMIN`; Audit Trail thêm tham chiếu căn cứ.
- Not larger: bảo trì trường chính thức của hồ sơ đã có là hạng mục `g2-employee-official-field-maintenance`; thông báo
  trong ứng dụng (AC-17) chờ hộp thông báo.
- Not smaller: `US-02-03` AC-1 chỉ là cùng thao tác import dưới actor mới; tách hai đường nhập tay/import sẽ thiết kế hai
  lần cùng quy tắc quyền và căn cứ HR, test trùng.
- Siblings: `g2-employee-official-field-maintenance`, `g2-employee-import-preview-confirm` và
  `g2-job-title-catalogue-and-manual-employee` (lát gốc, giao trước GOV.1), `g4-notification-delivery`.
- Scope map: [G2](../../../roadmap.md#work-item-decomposition-g2).

## Primary Story/AC

| Story    | AC                             | Coverage | Phần còn lại thuộc                                                                                                                                                                                                             |
| -------- | ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-02-02 | AC-1, AC-9, AC-12→AC-16, AC-18 | partial  | AC-17: `g4-notification-delivery`; AC-19: `g2-employee-official-field-maintenance`; AC-2, AC-4, AC-6→AC-8, AC-10, AC-11: `g2-employee-import-preview-confirm`, `g2-job-title-catalogue-and-manual-employee` (giao trước GOV.1) |
| US-02-03 | AC-1                           | partial  | AC-2→AC-6: `g2-employee-import-preview-confirm` (giao trước GOV.1)                                                                                                                                                             |

## Supporting references

- `US-01-01` AC-19 và `US-01-05` AC-14 (Super Admin nhập nhân viên mới nhưng không tạo phòng, Cost Center, chức vụ, không
  ghi sự kiện nhân sự, không duyệt Request, không gán seat) — test phủ định ở lát này, không claim (G1 không có scope map).
- `US-02-04` AC-6, `US-02-07` AC-7, AC-12 — chỉ đổi actor của import/nhập tay; test của chúng chạy lại với actor mới.
- `FR-8.6` (import không tạo tài khoản), `FR-9.8` (lệnh khởi tạo giữ ngoại lệ cài đặt; Employee Finance đầu tiên do
  Super Admin nhập), `SoD-1`, `FR-8.7`.

## Explicit out of scope

Thông báo trong ứng dụng cho IT Admin phụ trách và trưởng phòng (AC-17 — `g4-notification-delivery`); sửa trường chính
thức (AC-19); tạo tài khoản (`US-01-01`, thao tác riêng, giữ nguyên); điều chuyển/đổi chức vụ (`US-03-01`, G6); xlsx và
lưu tệp gốc của import (giới hạn sẵn có).

## Dependencies and blockers

- Owner review điểm kiểm soát bù AC-17 (plan).
- Không cần migration nếu tham chiếu căn cứ HR chỉ ghi vào Audit Trail (AC-16 đòi _trong Audit Trail_); nếu chọn lưu
  trên bản ghi import/nhân viên thì thêm migration là task riêng đi trước.
- Nên chạy sau Prompt 08 nếu Prompt 08 chạm `/employees`, `/employee-imports`.

## Ownership: module, data, API

- `organization/employee/` (`employees.controller.ts` — quyền; `employee-manual.service.ts`; `employee.dto.ts` — thêm
  căn cứ HR; mapper lỗi).
- `data-import/employee-import/` (`employee-imports.controller.ts` — quyền sáu route; DTO tải lên/xác nhận — căn cứ HR;
  `employee-import.service.ts`; audit).
- Tham chiếu căn cứ HR là value object dùng chung (đề xuất đặt ở `organization`, export qua facade cho `data-import`);
  `g2-employee-official-field-maintenance` dùng lại.
- `openapi.json` qua `pnpm openapi:export`.

## Behavior and design

- **Quyền:** `POST /employees` và mọi route `/employee-imports*` chỉ `SUPER_ADMIN`; IT Admin, Manager, Finance, Employee
  ⟹ 403, không ghi (AC-12, AC-14). Chú thích "Super Admin does no business work" thay bằng dẫn `QĐ-82i`, `US-01-05` AC-14.
- **Căn cứ HR bắt buộc (AC-16):** `{ type, reference (số) hoặc documentId (tệp), issuer, issuedOn }`; thiếu trường ⟹ 422
  nêu trường thiếu, không ghi. Import: căn cứ áp cho cả lần xác nhận và ghi vào Audit Trail của từng `Employee` mới. Tệp
  căn cứ là tùy chọn (_số hoặc tệp_); nếu làm tệp thì dùng kho đối tượng theo ADR-0014 với mục đích mới — quyết khi
  `ready`, mặc định chỉ số tham chiếu.
- **Không nhập hồ sơ của chính mình (AC-18):** dòng có mã nhân viên hoặc email công việc (sau chuẩn hóa) trùng hồ sơ
  `Employee` gắn tài khoản Super Admin đang thao tác ⟹ từ chối dòng/biểu mẫu.
- **Giữ nguyên:** cùng kiểm tra dòng (policy BEH.1), không tạo tài khoản/vai/lời mời (AC-9), người mới là thành viên phòng
  từ lúc ghi nhưng quyền từ ngày vào (AC-15), import lại chỉ báo khác biệt.
- **Audit:** mỗi thao tác một sự kiện, kèm căn cứ HR; không ghi dữ liệu thừa.
- Transaction/concurrency: như hiện hành. Tương thích: FE màn IT Admin nhập nhân sự chuyển sang Super Admin; body thêm
  trường bắt buộc — báo FE/Mobile.

## Test matrix

| AC / rủi ro           | Tình huống (gồm từ chối, edge case)                                    | Cấp test           | Kết quả mong đợi                                         | Bằng chứng sau implement |
| --------------------- | ---------------------------------------------------------------------- | ------------------ | -------------------------------------------------------- | ------------------------ |
| `US-02-02` AC-1, AC-9 | Super Admin xác nhận import hợp lệ kèm căn cứ                          | integration        | nhân viên tạo, không tài khoản, căn cứ trong Audit Trail | chưa chạy                |
| `US-02-02` AC-12      | IT Admin, Manager, Finance tải file nhân sự                            | integration + e2e  | 403, không bản ghi                                       | chưa chạy                |
| `US-02-02` AC-13      | chức vụ viết sai / đã ngừng dưới actor Super Admin                     | integration        | lỗi dòng như hiện hành                                   | chưa chạy                |
| `US-02-02` AC-14      | Super Admin nhập tay kèm căn cứ; IT Admin, Finance nhập tay            | integration        | một nhân viên; vai khác 403                              | chưa chạy                |
| `US-02-02` AC-15      | ngày vào tương lai dưới actor Super Admin                              | integration        | thành viên phòng ngay, không quyền trước ngày vào        | chưa chạy                |
| `US-02-02` AC-16      | import/nhập tay thiếu từng trường căn cứ                               | unit + integration | 422 nêu trường, không ghi                                | chưa chạy                |
| `US-02-02` AC-18      | Super Admin nhập dòng mã/email của chính mình                          | integration        | từ chối                                                  | chưa chạy                |
| `US-02-03` AC-1       | file 50 dòng, dòng 17 thiếu phòng, 18 thiếu chức vụ, actor Super Admin | integration        | 2 lỗi đúng cột, 48 hợp lệ                                | chưa chạy                |
| `US-01-05` AC-14      | Super Admin tạo phòng, Cost Center, chức vụ, ghi sự kiện nhân sự       | integration        | 403 (hồi quy)                                            | chưa chạy                |

Test đang ghim actor IT Admin phải đổi cùng lát: `employee-manual-http`, `employee-imports-http`,
`employee-import-seats-http`, `onboarding-http`, e2e `employees`, `employee-imports`, `test/support/api-coverage-manifest.ts`.

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 07. Chưa code, chưa review, chưa nghiệm thu.

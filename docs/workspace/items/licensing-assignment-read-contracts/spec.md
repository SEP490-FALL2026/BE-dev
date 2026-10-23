# Spec: đọc Assignment, công cụ đang dùng của phòng và kho khóa — phân trang ở SQL, có tên, cùng snapshot

- Phụ trách: chưa phân công (đề xuất: người phụ trách licensing).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review — Owner chọn trường định danh người/Cost Center thêm vào item Assignment
  (điểm 5 của `api-list-detail-contract-remediation`); thứ tự theo mã nhân viên cần đọc qua facade `organization`.
- Nguồn: Docs `72e1480` (`US-02-05`, `US-03-06` AC-13/17, `US-04-12` — AC không đổi), BE `69f4891`; defect `LD-09`,
  `LD-10`, `LD-11` (phần kho khóa) của
  [review hậu merge](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#4-collection-và-detail-api-list-detail1).
- Nhóm roadmap: licensing — hạng mục là `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này `GET /departments/{id}/tools-in-use` phân trang và tổng hợp ở SQL (không đọc mọi Assignment của mọi thành
viên), `GET /license-assignments` trả tên người, gói và Cost Center đọc theo lô bằng `select`, và `GET /license-keys` lấy
đếm + trang từ cùng snapshot — kiểm bằng harness đếm query và test HTTP.

## Sizing decision

- Container: bó finding `LD-09`, `LD-10`, `LD-11` (kho khóa) của review hậu merge 22/10/2026.
- Mode: `technical-enabler`.
- Outcome and owner: đường đọc của `licensing`; capability `licensing/assignment`, `licensing/license-key`.
- Boundaries: chỉ đường đọc; không đổi Assignment, khóa, quyền (IT Admin; trưởng phòng đọc công cụ phòng mình), bảng hay
  migration; không mở route detail cho khóa (khóa đầy đủ chỉ qua `reveal` có audit).
- Not larger: phòng sở hữu tài khoản dịch vụ (`US-03-06` AC-13 theo `QĐ-86`) là `g2-g4-unit-only-cost-attribution`.
- Not smaller: ba collection cùng repository `assignment.repo.ts`/`license-key.repo.ts` và cùng mẫu đọc tên theo lô.
- Siblings: `api-list-detail-contract-remediation`, `g2-g4-unit-only-cost-attribution`,
  `licensing-provisioning-task-read-contracts`.
- Scope map: n/a

## Primary Story/AC

| Story | AC      | Coverage | Phần còn lại thuộc                                                                      |
| ----- | ------- | -------- | --------------------------------------------------------------------------------------- |
| —     | `LD-09` | n/a      | gỡ mục `departmentToolsInUse` khỏi registry của `api-list-detail-contract-remediation`  |
| —     | `LD-10` | n/a      | gỡ mục `licenseAssignmentList` khỏi registry của `api-list-detail-contract-remediation` |
| —     | `LD-11` | n/a      | gỡ mục `licenseKeyList` khỏi registry của `api-list-detail-contract-remediation`        |

## Supporting references

`US-02-05` (Assignment khởi tạo), `US-03-06` AC-13, AC-17 (công cụ đang dùng), `US-04-12` (kho khóa); bằng chứng
`department-tools.service.ts:54-118`, `assignment.dto.ts:34-53`, `assignment.repo.ts:230-236`, `license-key.repo.ts:66-75`.

## Explicit out of scope

Phòng sở hữu tài khoản dịch vụ (`g2-g4-unit-only-cost-attribution`); giới hạn reveal (`secret-and-upload-hardening`);
route `GET /employees`.

## Dependencies and blockers

- `api-list-detail-contract-remediation` (harness, registry).
- **Cùng route** `/license-assignments` và công cụ đang dùng với `g2-g4-unit-only-cost-attribution`: làm sau hạng mục đó
  (đọc phòng sở hữu) để FE tái sinh client một lần.
- Owner chọn trường định danh (điểm 5).

## Ownership: module, data, API

`department-tools.service.ts`, `assignment.repo.ts` (list `select`, phân trang công cụ, `groupBy` tóm tắt),
`assignment.dto.ts`, `assignment.service.ts`; `license-key.repo.ts` (transaction). Đọc tên qua facade `organization`
(`getEmployees`, Cost Center brief), gói qua `catalog` facade. `openapi.json` qua `pnpm openapi:export`.

## Behavior and design

- **Công cụ đang dùng (`LD-09`):** `findMany({ where: { employeeId: { in: members }, validFrom ≤ d, OR: [{ validUntil:
null }, { validUntil > d }] }, select: { id, employeeId, planId, kind, source, validFrom, validFromBasis }, orderBy, skip,
take })` + `groupBy({ by: ['planId'], _count })` + `count` trong một transaction `RepeatableRead`; tên chỉ đọc cho trang.
  Thứ tự theo mã nhân viên: nếu không sắp được ở SQL qua ranh giới module thì sắp theo `validFrom, id` và ghi vào spec.
- **Assignment (`LD-10`):** item thêm `employee{employeeId,employeeCode,fullName}`, `plan{planId,planName,applicationName}`,
  `costCenter{id,code,name}|null`; `select` đúng cột; `reason` có biên (đề xuất 1000, áp ở ghi — nếu đổi biên ghi thì là
  thay đổi hành vi riêng, ghi khi `ready`). Đọc tên theo lô: tối đa 5 câu lệnh mỗi trang.
- **Kho khóa (`LD-11`):** `findMany` + `count` + `countUsable` trong một transaction `RepeatableRead` thay `Promise.all`.
- **Tương thích:** thêm trường ở item Assignment và công cụ; không bớt.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                           | Cấp test              | Kết quả mong đợi                                        | Bằng chứng sau implement |
| ----------- | ------------------------------------------------------------- | --------------------- | ------------------------------------------------------- | ------------------------ |
| `LD-09`     | phòng 300 thành viên × 5 Assignment; trang 2 cỡ 50            | integration + harness | đúng 50 dòng, tổng và tóm tắt đúng; số câu lệnh hằng số | chưa chạy                |
| `LD-10`     | 100 Assignment của 80 người, 30 gói, 10 Cost Center           | integration + harness | item có tên; ≤ 5 câu lệnh                               | chưa chạy                |
| `LD-11`     | nhập khóa đồng thời khi đang đọc trang                        | integration           | đếm và trang cùng snapshot                              | chưa chạy                |
| hồi quy     | trưởng phòng đọc phòng khác 403; khóa không lộ ngoài `masked` | integration + e2e     | như hiện hành                                           | chưa chạy                |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `LD-09`
      → `LD-11`.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; ba mục registry đã gỡ.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 08. Chưa code, chưa review, chưa nghiệm thu.

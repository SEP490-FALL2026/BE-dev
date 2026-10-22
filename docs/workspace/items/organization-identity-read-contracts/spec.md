# Spec: đọc tổ chức và danh tính — dự án phân trang, đếm cùng snapshot, lịch sử có biên

- Phụ trách: chưa phân công (đề xuất: người phụ trách organization/identity-access).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review — `GET /projects` chuyển sang phân trang (đổi wire) và mô tả dự án chuyển
  sang detail (Owner quyết giữ hay bỏ ở danh sách); hợp đồng có biên của `GET /department-warnings` (`LD-15`, gán ở Prompt
  09A ngày 23/10/2026) chưa chọn.
- Nguồn: Docs `72e1480` (`US-03-06` AC-9, AC-14, AC-15, AC-17, `US-01-11` AC-4, `US-04-09`, `US-01-01`, `US-01-03`,
  `US-01-04` — AC không đổi), BE `69f4891`; defect `LD-11` (phần organization), `LD-12`, `LD-14`, `LD-15` (vế
  `departmentWarningList`) của
  [review hậu merge](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#4-collection-và-detail-api-list-detail1).
- Nhóm roadmap: organization và identity-access — hạng mục là `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này `GET /projects` phân trang (có `GET /projects/{id}` cho mô tả), hồ sơ phòng nhúng tối đa N dự án kèm tổng,
`GET /departments/{id}/employees` và `GET /cost-centers/{id}/employees` lấy đếm + trang từ cùng snapshot, các lịch sử
cắt ngắn báo `hasMore`, và `GET /department-warnings` có biên cho toàn response — kiểm bằng test HTTP và harness đếm query.

## Sizing decision

- Container: bó finding `LD-11` (organization), `LD-12`, `LD-14`, `LD-15` (vế `departmentWarningList`) của review hậu merge
  22/10/2026.
- Mode: `technical-enabler`.
- Outcome and owner: đường đọc của `organization` (dự án, thành viên phòng, nhân viên theo Cost Center, cảnh báo phòng) và
  lịch sử có biên của `identity-access`/`operating-parameters`; capability `organization/project`, `organization/department`,
  `organization/cost-center`, `identity-access/accounts`, `identity-access/approval-roles`, `operating-parameters`.
- Boundaries: chỉ đường đọc; route mới `GET /projects/{id}` (thêm); không đổi lệnh ghi, bảng hay quyền.
- Not larger: Cost Center chỉ `Unit` và tài khoản dịch vụ thuộc phòng là `g2-g4-unit-only-cost-attribution`.
- Not smaller: các collection nhỏ của organization/identity cùng sửa một mẫu (snapshot, biên, `hasMore`); tách từng route
  chỉ lặp test harness.
- Siblings: `api-list-detail-contract-remediation`, `g2-g4-unit-only-cost-attribution`.
- Scope map: n/a

## Primary Story/AC

| Story | AC      | Coverage | Phần còn lại thuộc                                                                                               |
| ----- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| —     | `LD-11` | n/a      | gỡ mục `departmentMemberList`, `costCenterEmployeeList` khỏi registry của `api-list-detail-contract-remediation` |
| —     | `LD-12` | n/a      | gỡ mục `projectList` khỏi registry của `api-list-detail-contract-remediation`                                    |
| —     | `LD-14` | n/a      | lịch sử có biên và `hasMore` — điều kiện để `api-list-detail-contract-remediation` áp điều 3 cho detail          |
| —     | `LD-15` | n/a      | gỡ mục `departmentWarningList#unbounded` khỏi registry của `api-list-detail-contract-remediation`                |

## Supporting references

`US-03-06` AC-14 (dự án), AC-17 (thành viên), AC-9, AC-15 và `US-01-11` AC-4 (cảnh báo thiếu trưởng phòng/IT Admin),
`US-04-09` (nhân viên theo Cost Center, `QĐ-41c` không lộ email), `US-01-01` (lịch sử vai), `US-01-03` (lịch sử người giữ
vai, 20), `US-01-04` (lịch sử tham số, 20); `docs/rules/database-business.md` (đếm + trang cùng snapshot);
[rule collection/detail](../../../rules/api-contract.md#collection-và-detail-api-list-detail1) điều 3 (biên theo phòng không
phải biên của response).

## Explicit out of scope

`GET /employees` (không có AC); Cost Center `Company` (`g2-g4-unit-only-cost-attribution`); payload Audit Trail (điểm 4
của `api-list-detail-contract-remediation`).

## Dependencies and blockers

`api-list-detail-contract-remediation` (harness). Cùng route `/cost-centers` với `g2-g4-unit-only-cost-attribution`: làm sau
hạng mục đó. Owner quyết `description` ở danh sách dự án; chọn hợp đồng có biên của cảnh báo phòng (`LD-15`) trước khi code.

## Ownership: module, data, API

`project.repo.ts`, `project.dto.ts`, `projects.controller.ts` (+ `GET /projects/{id}`); `department.repo.ts`
(`members` trong transaction, chọn `work_email IS NOT NULL`), `department-query.service.ts` (dự án nhúng có biên; danh
sách cảnh báo `LD-15`), `departments.controller.ts` + `department.dto.ts` (`GET /department-warnings`);
`cost-center.repo.ts`, `cost-center.service.ts`; `role-grant.repo.ts` (lịch sử vai có biên), DTO lịch sử
(`approval-roles`, `operating-parameters`, trưởng phòng) thêm `hasMore`. `openapi.json`, `api-coverage-manifest.ts`.

## Behavior and design

- **Dự án (`LD-12`):** `GET /projects?departmentId&page&pageSize≤100`, item `id, name, status, departments[{id,code,name}],
updatedAt`, thứ tự `name, id`, đếm cùng transaction `RepeatableRead`; `GET /projects/{id}` trả đủ (gồm `description`).
  Hồ sơ phòng nhúng tối đa 20 dự án + `projectTotal`.
- **Snapshot (`LD-11`):** `members` và nhân viên theo Cost Center chạy đếm + trang trong một transaction `RepeatableRead`;
  thành viên chọn `has_work_email` thay vì đọc email.
- **Lịch sử có biên (`LD-14`):** `roleHistory` của `appUserGet` 50 mới nhất + `hasMore`; lịch sử người giữ vai (20), tham số
  (20), trưởng phòng (50) thêm `hasMore`.
- **Cảnh báo phòng có biên (`LD-15`, vế `departmentWarningList`):** hiện tối đa hai loại cảnh báo (`MISSING_HEAD`,
  `MISSING_IT_ADMIN`) **mỗi phòng đang hoạt động**, không phân trang; số phòng không có trần nên response không có biên. Gỡ
  mục registry khi có **một** trong hai: phân trang thật (`pageSize` có `maximum`, thứ tự tất định, đếm cùng snapshot), hoặc
  trần cứng của **toàn response** do AC/FR, hằng số hay ràng buộc CSDL chứng minh. Hợp đồng nào **chưa chọn** — người phụ
  trách đề xuất, Owner duyệt trước khi code; ai nhận cảnh báo và quyền giữ nguyên.
- **Tương thích:** `GET /projects` đổi từ mảng sang trang (đổi wire — FE); thêm `hasMore`, `projectTotal` (thêm); nếu cảnh
  báo phòng phân trang thì cũng đổi wire (FE).

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                                        | Cấp test              | Kết quả mong đợi                                                                      | Bằng chứng sau implement |
| ----------- | ------------------------------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------- | ------------------------ |
| `LD-12`     | 250 dự án, mô tả 2000 ký tự, mỗi dự án 100 phòng                                           | integration + harness | trang 100; item không có mô tả; detail có mô tả                                       | chưa chạy                |
| `LD-12`     | hồ sơ phòng có 30 dự án                                                                    | integration           | 20 dự án + `projectTotal` 30                                                          | chưa chạy                |
| `LD-11`     | ghi nhân viên vào phòng khi đang đọc trang thành viên                                      | integration           | tổng và trang cùng snapshot; không đọc email                                          | chưa chạy                |
| `LD-14`     | tài khoản 80 lần đổi vai; vai 25 lần đổi người giữ                                         | integration           | 50/20 + `hasMore: true`                                                               | chưa chạy                |
| `LD-15`     | số phòng đang hoạt động lớn hơn biên đã chọn, mỗi phòng thiếu cả trưởng phòng lẫn IT Admin | integration + harness | response không vượt biên đã chọn; mục `departmentWarningList#unbounded` gỡ, gate xanh | chưa chạy                |
| hồi quy     | quyền IT Admin/Manager/Finance như hiện hành                                               | integration + e2e     | như hiện hành                                                                         | chưa chạy                |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `LD-11`,
      `LD-12`, `LD-14`, `LD-15`.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; mục registry đã gỡ.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 08. Chưa code, chưa review, chưa nghiệm thu.

23/10/2026 (Prompt 09A): nhận vế `departmentWarningList` của `LD-15` theo Owner review `LD-R2-RV-01` (mục registry chuyển
`bounded` → `unbounded`). Chưa chọn hợp đồng, chưa code.

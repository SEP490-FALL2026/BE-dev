# Spec: đọc bộ công cụ chuẩn theo lô, có tên phòng/chức vụ và thứ tự theo tên

- Phụ trách: chưa phân công (đề xuất: người phụ trách catalog).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review — item thêm tên phòng/chức vụ (thêm trường) và đổi thứ tự dòng.
- Nguồn: Docs `72e1480` (`US-04-10` — AC không đổi), BE `69f4891`; defect `LD-07` của
  [review hậu merge](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#4-collection-và-detail-api-list-detail1).
- Nhóm roadmap: catalog — hạng mục là `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này `GET /standard-toolsets` và `GET /standard-toolsets/{departmentId}/{jobTitleId}/history` đọc phiên bản và gói
theo lô (số câu lệnh hằng số mỗi trang, thay vì tới ~400 ở trang 100 dòng), mỗi dòng mang tên phòng và chức vụ, và thứ tự
theo tên — kiểm bằng harness đếm query và test HTTP.

## Sizing decision

- Container: bó finding `LD-07` của review hậu merge 22/10/2026.
- Mode: `technical-enabler`.
- Outcome and owner: đường đọc của bộ công cụ chuẩn; capability `catalog/standard-toolset`, đọc tên qua facade
  `organization`, gói qua `catalog/plan`.
- Boundaries: chỉ đường đọc; không đổi lệnh ghi, lịch sử phiên bản, quyền (IT Admin; trưởng phòng chỉ phòng mình).
- Not larger: N+1 khác của catalog thuộc `catalog-subscription-read-model`.
- Not smaller: danh sách và lịch sử dùng cùng hai lần đọc (phiên bản, tóm tắt gói).
- Siblings: `api-list-detail-contract-remediation`.
- Scope map: n/a

## Primary Story/AC

| Story | AC      | Coverage | Phần còn lại thuộc                                                                                              |
| ----- | ------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| —     | `LD-07` | n/a      | gỡ mục `standardToolsetList`, `standardToolsetHistory` khỏi registry của `api-list-detail-contract-remediation` |

## Supporting references

`US-04-10`; `g3-standard-toolset/spec.md`; bằng chứng N+1: `standard-toolset.repo.ts:152-165`,
`standard-toolset.service.ts:143,161`.

## Explicit out of scope

Phần thông báo của `US-04-10` AC-1, AC-3 (`g4-notification-delivery`); nối Request (`g4-request-and-transfer-integration`).

## Dependencies and blockers

`api-list-detail-contract-remediation` (harness). Owner/FE đồng ý thêm tên và đổi thứ tự.

## Ownership: module, data, API

`standard-toolset.repo.ts`, `standard-toolset.service.ts`, `standard-toolset.dto.ts`; `plan.repo.ts` (`findSummaries` nhận
danh sách); facade `organization` (tên phòng, chức vụ theo lô). `openapi.json` (thêm trường). Không bảng/migration.

## Behavior and design

- Một `findMany` phiên bản hiện hành cho mọi (phòng, chức vụ) của trang (`OR` theo cặp + `version`), `include: { items }`;
  một `findSummaries` trên hợp các `planId`; một lần đọc tên phòng và một lần đọc tên chức vụ theo lô.
- Item thêm `department{id,code,name}`, `jobTitle{id,name}`; thứ tự `department.code, jobTitle.normalizedName, id`
  (sắp ở SQL bằng join qua bảng tham chiếu là việc của `organization` — nếu không join chéo module được thì giữ thứ tự hiện
  hành và chỉ thêm tên; ghi lựa chọn khi `ready`).
- Lịch sử: cùng lần đọc gói theo lô cho mọi phiên bản của trang.
- Tương thích: thêm trường (không bỏ); thứ tự dòng có thể đổi — báo FE.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                         | Cấp test              | Kết quả mong đợi                               | Bằng chứng sau implement |
| ----------- | ----------------------------------------------------------- | --------------------- | ---------------------------------------------- | ------------------------ |
| `LD-07`     | 100 bộ chuẩn, mỗi bộ 50 gói                                 | integration + harness | số câu lệnh hằng số; item có tên phòng/chức vụ | chưa chạy                |
| `LD-07`     | lịch sử 40 phiên bản                                        | integration + harness | một lần đọc gói                                | chưa chạy                |
| hồi quy     | trưởng phòng đọc phòng khác 403; nhân viên `mine` như trước | integration           | như hiện hành                                  | chưa chạy                |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `LD-07`.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; hai mục registry đã gỡ.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 08. Chưa code, chưa review, chưa nghiệm thu.

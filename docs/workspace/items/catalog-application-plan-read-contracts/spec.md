# Spec: contract đọc của ứng dụng và gói — summary riêng, mảng detail có biên

- Phụ trách: chưa phân công (đề xuất: người phụ trách catalog).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review — trường của item danh sách ứng dụng đổi wire (FE phải tái sinh client).
- Nguồn: Docs `72e1480` (`US-04-01`, `US-04-02`, `US-04-06`, `US-04-11` — AC không đổi), BE `69f4891`; defect
  `LD-04`, `LD-05`, `LD-06` của [review hậu merge](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#4-collection-và-detail-api-list-detail1).
- Nhóm roadmap: catalog — hạng mục là `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này `GET /applications` và `GET /plans` trả summary riêng đọc bằng `select` đúng trường, còn
`GET /applications/{id}`, `GET /plans/{id}`, `GET /plans/{id}/terms`, `GET /applications/{id}/business-owners` và
`GET /applications/{id}/retirement` trả mảng có biên — kiểm bằng OpenAPI, test HTTP và harness đếm query.

## Sizing decision

- Container: bó finding `LD-04`, `LD-05`, `LD-06` của review hậu merge 22/10/2026.
- Mode: `technical-enabler`.
- Outcome and owner: contract đọc của khai báo ứng dụng và gói; capability `catalog/catalog-entry`, `catalog/plan`,
  `catalog/plan-terms`.
- Boundaries: chỉ đường đọc (DTO phản hồi, repository list/detail, service view); không đổi lệnh ghi, bảng hay migration;
  quyền giữ nguyên (`IT_ADMIN`, `FINANCE` đọc).
- Not larger: thuê bao, cảnh báo điều khoản và phân bổ dùng repository của `catalog/subscription` — hạng mục
  `catalog-subscription-read-model`; bỏ `FREE_EXTERNAL` của request là `g3-catalog-kind-contract-cleanup`.
- Not smaller: item danh sách ứng dụng và item danh sách gói cùng đổi một lần cho FE và cùng một mẫu summary/`extend`;
  mảng detail của cùng hai resource dùng cùng quy tắc biên.
- Siblings: `api-list-detail-contract-remediation`, `g3-catalog-kind-contract-cleanup`, `catalog-subscription-read-model`.
- Scope map: n/a

## Primary Story/AC

| Story | AC      | Coverage | Phần còn lại thuộc                                                                  |
| ----- | ------- | -------- | ----------------------------------------------------------------------------------- |
| —     | `LD-04` | n/a      | gỡ mục `applicationList` khỏi registry của `api-list-detail-contract-remediation`   |
| —     | `LD-05` | n/a      | gỡ mục `planList` khỏi registry của `api-list-detail-contract-remediation`          |
| —     | `LD-06` | n/a      | mảng detail có biên — điều kiện để `api-list-detail-contract-remediation` áp điều 3 |

## Supporting references

- `US-04-01` (khai báo ứng dụng), `US-04-02` (gói), `US-04-06` (Business Owner), `US-04-11` (điều khoản), `US-04-01`
  AC-8/9/14 (ngừng dùng) — AC không yêu cầu trường detail ở danh sách.
- Quy tắc: [API contract](../../../rules/api-contract.md) sau `api-list-detail-contract-remediation` Task 1.

## Explicit out of scope

Đổi nghiệp vụ khai báo/ngừng dùng; `similarApplications` thành tìm kiếm riêng; route mới.

## Dependencies and blockers

- `api-list-detail-contract-remediation` (rule, registry, harness) đi trước.
- Cùng route `/applications` với `g3-catalog-kind-contract-cleanup`: làm liền nhau trong một đợt tái sinh client FE.
- Owner/FE xác nhận item danh sách ứng dụng (đổi wire).

## Ownership: module, data, API

`application.dto.ts`, `application.repo.ts` (list `select`), `application.service.ts`/view; `plan.dto.ts`, `plan.repo.ts`;
`plan-terms.repo.ts`, `plan-terms.dto.ts`; `application-retirement.service.ts`, `application-retirement.repo.ts`,
`application-owner.service.ts`. `openapi.json` qua `pnpm openapi:export`. Không bảng/migration.

## Behavior and design

- **`applicationList` (`LD-04`):** item mới `ApplicationSummaryDto` = `id, name, kind, status, vendor{id,name},
dataSensitivity, isCommunicationService, usageCollectionDefault, businessOwner{employeeId,employeeCode,fullName,status},
businessOwnerReplacementRequired, functionalGroup{id,name}|null, updatedAt`. Query
  `select { id, name, kind, catalogStatus, dataSensitivity, isCommunicationService, usageCollectionDefault,
businessOwnerEmployeeId, updatedAt, vendor: { select: { id, name } }, functionalGroup: { select: { id, name } } }`;
  Business Owner đọc theo lô cho cả trang với projection gọn (không đủ cột employee). `domains`, `communication`,
  `dictionaryServiceLineId` chỉ ở detail; detail = `summary.extend({...})`.
- **`planList` (`LD-05`):** item `PlanSummaryDto` = các trường hiện có trừ `revocationNote`; query bỏ cột đó.
- **Mảng detail (`LD-06`):** `similarApplications` tối đa 20 + `similarTotal`; `applicationBusinessOwnerHistory` phân
  trang (`page`, `pageSize` ≤ 100, `heldFrom desc, id`); `planTermsGet.opinions` 50 mới nhất + `opinionTotal` và route con
  phân trang `GET /plans/{id}/term-opinions`; `applicationRetirementGet.blockers` trả đếm theo gói + 50 Assignment đầu
  (`assignmentTotal`), `confirmations` 50 mới nhất + tổng. Giới hạn là hằng số trong policy, khai `maxItems` ở OpenAPI.
- **Tương thích:** đổi wire có tính bớt trường ở danh sách và thêm trường tổng ở detail; FE dùng detail cho trường đã bỏ.
  Route con mới (term opinions, owner history paging) là thêm.
- Transaction/concurrency: list giữ một transaction `RepeatableRead` cho đếm + trang như hiện hành.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                             | Cấp test              | Kết quả mong đợi                                                          | Bằng chứng sau implement |
| ----------- | ------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------- | ------------------------ |
| `LD-04`     | 100 ứng dụng, mỗi cái 20 domain dài tối đa, ghi chú 1000 ký tự                  | integration + harness | item không có `domains`/`communication`; số câu lệnh hằng số; body ≤ biên | chưa chạy                |
| `LD-04`     | detail cùng ứng dụng                                                            | integration           | đủ trường như trước; trường chung bằng item danh sách                     | chưa chạy                |
| `LD-05`     | 100 gói có `revocationNote` 2000 ký tự                                          | integration + harness | item không có ghi chú; SQL không đọc cột đó                               | chưa chạy                |
| `LD-06`     | 60 ý kiến điều khoản; 120 Assignment chặn ngừng dùng; 30 lần đổi Business Owner | integration           | 50/50 + tổng đúng; route con phân trang ổn định                           | chưa chạy                |
| hồi quy     | quyền `FINANCE` đọc, `MANAGER` 403; OpenAPI chỉ đổi đúng các schema trên        | e2e + OpenAPI         | như dự kiến                                                               | chưa chạy                |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `LD-04`
      → `LD-06`.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; mục registry `applicationList`, `planList` đã gỡ.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 08. Chưa code, chưa review, chưa nghiệm thu.

# Spec: thẻ tác vụ cấp phát — summary ở danh sách, chi tiết mở rộng ở detail

- Phụ trách: chưa phân công (đề xuất: người phụ trách licensing).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review — đổi wire của danh sách; Owner chọn trường định danh người trên thẻ
  (điểm 5 của `api-list-detail-contract-remediation`).
- Nguồn: Docs `72e1480` (`US-07-01`, `US-07-02`, `US-07-04` — AC không đổi; `g4-provisioning-failure-handling` đặt mã kỹ
  thuật ở _chi tiết mở rộng_), BE `69f4891`; defect `LD-08` của
  [review hậu merge](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#4-collection-và-detail-api-list-detail1).
- Nhóm roadmap: licensing — hạng mục là `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này `GET /provisioning-tasks` trả `TaskSummaryDto` (không bằng chứng, lỗi, bước, lý do dài), đọc bằng `select`,
gói theo lô; `GET /provisioning-tasks/{id}` giữ thẻ đầy đủ; chi tiết lỗi từ connector bị cắt ở độ dài tối đa — kiểm bằng
OpenAPI, harness đếm query và test HTTP.

## Sizing decision

- Container: bó finding `LD-08` của review hậu merge 22/10/2026.
- Mode: `technical-enabler`.
- Outcome and owner: contract đọc của hàng đợi tác vụ; capability `licensing/provisioning`.
- Boundaries: DTO phản hồi danh sách, repository list, view service; cắt `detail` khi ghi lỗi (một dòng policy); không đổi
  đồ thị trạng thái, bảng, migration hay quyền (IT Admin, hàng đợi `MINE`/`GENERAL`).
- Not larger: idempotency của cấp theo Request (`L1` của review) thuộc cổng G5 — `g4-request-and-transfer-integration`.
- Not smaller: summary, projection và đọc gói theo lô cùng một contract danh sách.
- Siblings: `api-list-detail-contract-remediation`, `licensing-assignment-read-contracts`.
- Scope map: n/a

## Primary Story/AC

| Story | AC      | Coverage | Phần còn lại thuộc                                                                     |
| ----- | ------- | -------- | -------------------------------------------------------------------------------------- |
| —     | `LD-08` | n/a      | gỡ mục `provisioningTaskList` khỏi registry của `api-list-detail-contract-remediation` |

## Supporting references

`US-07-01`, `US-07-02`, `US-07-04`; `g4-provisioning-queue-manual/spec.md`, `g4-provisioning-failure-handling/spec.md`
(mã kỹ thuật chỉ ở chi tiết mở rộng); bằng chứng `provisioning.dto.ts:114-122`, `provisioning-task-view.service.ts:91-95`.

## Explicit out of scope

Cổng Request thật (`GRANT_REQUEST_GATE` vẫn là stub tới G5); connector; thông báo.

## Dependencies and blockers

`api-list-detail-contract-remediation` (harness, registry). Owner chọn trường định danh người (điểm 5). Không blocker khác.

## Ownership: module, data, API

`provisioning.dto.ts` (`taskSummarySchema`, detail = `extend`), `provisioning-task.repo.ts` (list `select`),
`provisioning-task-view.service.ts` (gói theo lô qua `catalog` facade — thêm `provisioningType` vào `findSummaries` nếu
cần), `provisioning-failure.service.ts` (cắt `detail`). `openapi.json` qua `pnpm openapi:export`.

## Behavior and design

- **Item danh sách:** `id, kind, channel, status, requestId, assignmentId, beneficiary{employeeId,employeeCode,fullName},
plan{planId,planName,applicationName,provisioningType}, subscriptionId, accountIdentifier, defaultResponsibleEmployeeId,
inGeneralQueue, createdAt, claimedBy, claimedAt, completedAt, failedAt, closedAt, failureKind, attempts, maxAttempts,
nextRetryAt, availableDecisions, elapsedSeconds`.
- **Chỉ detail:** `steps, doneWhen, evidence, failureReason, lastError, handOffEvidence, closeReason, completedBy, failedBy,
handedOffBy/At, closedBy`. `TaskResponseDto`, `GrantResponseDto` dùng detail.
- **Query:** `findMany({ select: { …cột của item…, assignment: { select: { employeeId, planId, subscriptionId,
accountIdentifier } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })` cùng `count` trong một transaction
  `RepeatableRead`; gói đọc một lần cho trang.
- **Cắt chi tiết lỗi:** `detail` từ connector cắt ở `FAILURE_REASON_MAX_LENGTH` trước khi lưu `lastError`/`failureReason`.
- **Tương thích:** bớt trường ở danh sách (FE mở detail để xem bằng chứng/lỗi); thêm `beneficiary`/`plan` gọn nếu chưa có.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                               | Cấp test              | Kết quả mong đợi                                      | Bằng chứng sau implement |
| ----------- | --------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------- | ------------------------ |
| `LD-08`     | 100 tác vụ của 60 gói, mỗi tác vụ có bằng chứng 2000 ký tự và lỗi dài             | integration + harness | item không có `evidence`/`steps`; số câu lệnh hằng số | chưa chạy                |
| `LD-08`     | detail cùng tác vụ                                                                | integration           | đủ trường; trường chung bằng item                     | chưa chạy                |
| `LD-08`     | connector báo lỗi `detail` 10 000 ký tự                                           | unit + integration    | lưu tối đa `FAILURE_REASON_MAX_LENGTH`                | chưa chạy                |
| hồi quy     | `provisioning-queue-http`, `provisioning-grant-http`, `provisioning-failure-http` | integration           | xanh (với `FakeGrantGate`)                            | chưa chạy                |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `LD-08`.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; mục registry đã gỡ.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 08. Chưa code, chưa review, chưa nghiệm thu.

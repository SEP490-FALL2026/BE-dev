# Spec: mô hình đọc của thuê bao — thuế theo lô, include gọn, cảnh báo điều khoản phân trang ở SQL

- Phụ trách: chưa phân công (đề xuất: người phụ trách catalog/finance).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review — Owner quyết danh sách thuê bao còn giữ `taxEstimate`, `priceSnapshot`,
  `alerts` trên mọi dòng hay không (điểm 3 của `api-list-detail-contract-remediation`).
- Nguồn: Docs `72e1480` (`US-04-03`, `US-04-05`, `US-04-08`, `US-04-11`, `US-12-09` — AC không đổi), BE `69f4891`; defect
  `LD-01`, `LD-02`, `LD-03` của [review hậu merge](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#4-collection-và-detail-api-list-detail1).
- Nhóm roadmap: catalog và finance — hạng mục là `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này một trang `GET /subscriptions` (100 dòng) đọc ước tính thuế theo lô bằng số câu lệnh không phụ thuộc số dòng,
`GET /plan-warnings` lọc và phân trang ở SQL thay vì quét mọi thuê bao, `GET /subscriptions/{id}/cost-allocation/history`
đọc Cost Center một lần cho cả trang — kiểm bằng harness đếm query và test HTTP.

## Sizing decision

- Container: bó finding `LD-01`, `LD-02`, `LD-03` của review hậu merge 22/10/2026.
- Mode: `technical-enabler`.
- Outcome and owner: đường đọc của thuê bao và các view dựa trên nó; capability `catalog/subscription`,
  `catalog/plan-terms` (cảnh báo), `finance/tax-profile` và `finance/cost-allocation` (đọc theo lô qua facade).
- Boundaries: chỉ đường đọc; thêm phương thức đọc theo lô vào `FinanceService` (facade); không đổi bảng, lệnh ghi hay
  quyền; wire giữ nguyên trừ khi Owner chọn bỏ trường ở danh sách.
- Not larger: summary ứng dụng/gói là `catalog-application-plan-read-contracts`; N+1 của bộ công cụ chuẩn là
  `catalog-standard-toolset-read-batching`.
- Not smaller: ba defect cùng dùng `WITH_PLAN` và `listActiveTerms` của `subscription.repo.ts`; sửa riêng sẽ đổi cùng
  repository ba lần.
- Siblings: `api-list-detail-contract-remediation`, `catalog-application-plan-read-contracts`.
- Scope map: n/a

## Primary Story/AC

| Story | AC      | Coverage | Phần còn lại thuộc                                                                                  |
| ----- | ------- | -------- | --------------------------------------------------------------------------------------------------- |
| —     | `LD-01` | n/a      | gỡ mục `subscriptionList` khỏi registry của `api-list-detail-contract-remediation`                  |
| —     | `LD-02` | n/a      | gỡ mục `planWarningList` khỏi registry của `api-list-detail-contract-remediation`                   |
| —     | `LD-03` | n/a      | gỡ mục `subscriptionCostAllocationHistory` khỏi registry của `api-list-detail-contract-remediation` |

## Supporting references

`US-04-03`, `US-04-05` (ảnh chụp quy đổi), `US-12-09` AC-5, AC-8 (ước tính thuế), `US-04-11` (cảnh báo rà soát),
`US-04-08` (lịch sử phân bổ); `g3-subscription-purchase/spec.md` (item danh sách hiện có `taxEstimate`, `alerts`).

## Explicit out of scope

Đổi công thức thuế, quy tắc cảnh báo hay phân bổ; bỏ trường wire khi Owner chưa quyết; báo cáo chi phí (G8).

## Dependencies and blockers

- `api-list-detail-contract-remediation` (harness, registry) đi trước.
- Quyết định Owner điểm 3 chỉ chặn phần _bỏ trường ở danh sách_; phần đọc theo lô làm được ngay.
- `g2-g4-unit-only-cost-attribution` đổi enum `costCenterKind` của phản hồi phân bổ: làm trước hoặc rebase test.

## Ownership: module, data, API

`subscription.repo.ts` (`WITH_PLAN` → `select` gọn; `listActiveTerms` lọc ở SQL), `subscription-view.service.ts`,
`plan-terms.service.ts` (`warnings`), `subscription-allocation.service.ts`; `finance.service.ts` (+ `estimateTaxBatch`
hoặc `currentTaxProfiles(vendorIds)`), `tax-profile.repo.ts`, `cost-allocation.service.ts`. Không bảng/migration.

## Behavior and design

- **Thuế theo lô (`LD-01`):** một lần đọc hồ sơ thuế hiện hành kèm dòng cho mọi `vendorId` của trang
  (`findMany({ where: { vendorId: { in } }, include: { currentVersion: { include: { lines: true } } } })` hoặc tương
  đương), rồi tính bằng hàm thuần `core/money/tax-estimate`; `taxProfile.group` và `taxEstimate` lấy từ **cùng** lần đọc
  (bỏ chênh khi hồ sơ đang được khai). Đơn vị tiền tệ đọc một lần cho trang.
- **Include gọn:** `WITH_PLAN` → `{ plan: { select: { id, name, pricingModel, provisioningType, application: { select:
{ id, name, kind, vendor: { select: { id, name } } } } } } }`; dùng cho list, detail, `listActiveTerms` và
  `SubscriptionAllocationService.require`.
- **Cảnh báo điều khoản (`LD-02`):** `where` đẩy phần biểu diễn được ở SQL (kiểu `TERM`, trạng thái `ACTIVE`, có ngày mốc,
  ngày mốc trong cửa sổ cảnh báo); chỉ phần _đến hạn rà soát_ phụ thuộc điều khoản tính trong bộ nhớ trên tập đã lọc;
  phân trang ổn định `noticeDeadline, subscriptionId`; đếm cùng snapshot.
- **Lịch sử phân bổ (`LD-03`):** gom `costCenterId` của mọi phiên bản trong trang, đọc một lần.
- **Tương thích:** wire giữ nguyên (kể cả thứ tự dòng); nếu Owner chọn bỏ trường ở danh sách thì tách `SubscriptionSummaryDto`
  và detail = `summary.extend`.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                               | Cấp test              | Kết quả mong đợi                                                 | Bằng chứng sau implement |
| ----------- | --------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------- | ------------------------ |
| `LD-01`     | 100 thuê bao có giá của 40 nhà cung cấp, 10 nhà cung cấp chưa khai hồ sơ thuế     | integration + harness | số câu lệnh hằng số; ước tính bằng kết quả từng dòng cũ          | chưa chạy                |
| `LD-01`     | hồ sơ thuế đổi giữa hai lần đọc                                                   | integration           | `taxProfile.group` và `taxEstimate` cùng phiên bản               | chưa chạy                |
| `LD-02`     | 500 thuê bao `TERM`, 7 đến hạn; trang 2 kích thước 5                              | integration + harness | đúng 2 dòng, thứ tự ổn định; SQL không đọc thuê bao ngoài cửa sổ | chưa chạy                |
| `LD-03`     | 30 phiên bản phân bổ, 5 Cost Center                                               | integration + harness | một lần đọc Cost Center                                          | chưa chạy                |
| hồi quy     | `subscription-http`, `plan-terms-http`, `cost-allocation-http` giữ nguyên kết quả | integration           | xanh                                                             | chưa chạy                |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `LD-01`
      → `LD-03`.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi (nếu có) đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; ba mục registry đã gỡ.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 08. Chưa code, chưa review, chưa nghiệm thu.

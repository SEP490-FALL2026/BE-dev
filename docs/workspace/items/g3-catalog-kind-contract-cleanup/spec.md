# Spec: bỏ loại `FREE_EXTERNAL` khỏi contract khai báo ứng dụng

- Phụ trách: chưa phân công (đề xuất: người phụ trách catalog).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 07, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53 `FR-1.1`; `QĐ-82n` A; `US-04-01` AC-12 đã bỏ), BE `69f4891`.
- Nhóm roadmap: G3 (catalog, C1) — chỉ là planning container; hạng mục là `technical-enabler` (xem `## Sizing decision`).
- Finding: `BBI-D09` của [business-baseline-impact-2026-10-22](../business-baseline-impact-2026-10-22/spec.md).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, contract `POST /applications` chỉ có ba loại đối tượng quản lý (`SAAS`, `LICENSED`, `INTERNAL`); không
còn giá trị hay mã lỗi riêng cho _phần mềm miễn phí bên ngoài_ — kiểm bằng OpenAPI và test HTTP.

## Sizing decision

- Container: bó finding `BBI-D09` (`QĐ-82n` A) của hạng mục `business-baseline-impact-2026-10-22`.
- Mode: `technical-enabler`.
- Outcome and owner: contract khai báo ứng dụng khớp baseline ba loại; capability `catalog/catalog-entry`.
- Boundaries: request schema và lỗi của `POST /applications` (`PATCH` không nhận `kind` — `application.dto.ts:33`, đã
  đọc tại `69f4891`); không bảng, không migration (CSDL chưa từng có giá trị `FREE_EXTERNAL`).
- Not larger: không đổi quy tắc nhà cung cấp, Business Owner hay danh mục; không đụng hạng mục Cost Center.
- Not smaller: một thay đổi contract nguyên tử cùng test và OpenAPI.
- Siblings: `g3-catalog-entry` (lát gốc, giữ nguyên AC đã giao).
- Scope map: n/a

## Primary Story/AC

| Story | AC        | Coverage | Phần còn lại thuộc                                                                                     |
| ----- | --------- | -------- | ------------------------------------------------------------------------------------------------------ |
| —     | `BBI-D09` | n/a      | gỡ chặn `g4-request-and-transfer-integration` (cổng phần mềm mới của Request không thấy loại miễn phí) |

AC liên quan đã **bỏ**: `US-04-01` AC-12 (`QĐ-82n` A) — không có AC dương nào mô tả lại; vì vậy lát không claim Story.

## Supporting references

`QĐ-82n` A(2) (bỏ lựa chọn _miễn phí bên ngoài_ ở loại mục danh mục), `QĐ-49a` (ranh giới phạm vi giữ), `FR-1.1`,
`FR-3.19`; lát gốc [g3-catalog-entry](../g3-catalog-entry/spec.md).

## Explicit out of scope

Đổi cổng đánh giá phần mềm mới (`OUT_OF_CATALOG`, `FR-3.19` — G5); dữ liệu danh mục; mọi thay đổi khác của catalog.

## Dependencies and blockers

Không blocker kỹ thuật. Owner review spec; nếu Prompt 08 lập hạng mục chạm `/applications` thì làm sau hoặc gộp
contract theo hướng dẫn của Prompt 08.

## Ownership: module, data, API

- `src/modules/catalog/catalog-entry/`: `application.dto.ts` (request enum), `application.policy.ts` (`vendorSourceOf`
  bỏ nhánh), `application.service.ts` (kiểu `kind`), `application.errors.ts`, `application.http-errors.ts` (bỏ
  `ApplicationKindNotManagedError` và ánh xạ `APPLICATION.KIND_NOT_MANAGED`), `applications.controller.ts` (mô tả lỗi).
- `openapi.json` qua `pnpm openapi:export`.
- Không đổi bảng, migration, module boundary.

## Behavior and design

- Request `kind`: `z.enum(['SAAS', 'LICENSED', 'INTERNAL'])` như schema phản hồi và bộ lọc đã dùng.
- Gửi `FREE_EXTERNAL` (hay giá trị lạ) ⟹ `422 VALIDATION_ERROR` của tầng kiểm dữ liệu chung; không ghi; Audit Trail
  không có sự kiện. Đây là **đổi wire** (mã `APPLICATION.KIND_NOT_MANAGED` biến mất) — báo FE/Mobile tái sinh client.
- Chú thích "accepted here on purpose" và mô tả lỗi của operation bỏ tham chiếu loại miễn phí.
- Transaction, concurrency, migration, job: không áp dụng (không đổi dữ liệu).

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                  | Cấp test    | Kết quả mong đợi                                        | Bằng chứng sau implement |
| ----------- | ---------------------------------------------------- | ----------- | ------------------------------------------------------- | ------------------------ |
| `BBI-D09`   | `POST /applications` với `kind: FREE_EXTERNAL`       | integration | 422 `VALIDATION_ERROR`, không bản ghi, không audit      | chưa chạy                |
| `BBI-D09`   | ba loại hợp lệ vẫn khai báo được (hồi quy AC-1→AC-7) | integration | như trước                                               | chưa chạy                |
| `BBI-D09`   | policy không còn nhánh miễn phí                      | unit        | `vendorSourceOf` chỉ nhận ba loại                       | chưa chạy                |
| contract    | OpenAPI `DeclareApplicationBodyDto.kind`             | e2e OpenAPI | enum ba giá trị; mô tả lỗi không còn `KIND_NOT_MANAGED` | chưa chạy                |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `BBI-D09`.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 07. Chưa code, chưa review, chưa nghiệm thu.

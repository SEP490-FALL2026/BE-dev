# Spec: nền C1/C3/C7 — thay mẫu `catalog` cũ và chốt ranh giới module (E1)

- Phụ trách: AI theo giao việc Owner (triển khai 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026; Owner giao tự thiết kế, tự làm, review cuối).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46 mục 5.12.1; User Stories v0.15 — không có Story, đây là enabler), BE `57b1e1c`.
- Nhóm roadmap: G3 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Mẫu `catalog` cũ (chưa mount, bảng `catalog_applications` camelCase) được thay bằng nền đúng ranh giới ngữ cảnh: quyết định
module `catalog` (C1), `finance` (C7), `licensing` (C3) ghi ở [ADR-0013](../../../decisions/0013-catalog-finance-licensing-contexts.md),
gate kiến trúc và tài liệu khớp; không đổi hành vi nào đang chạy vì mẫu cũ không mount.

## Sizing decision

- Container: G3 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `technical-enabler`.
- Outcome and owner: gỡ mẫu `catalog` cũ và chốt ba ngữ cảnh module cho G3/G4; chủ là người phụ trách G3/G4.
- Boundaries: một migration gỡ `catalog_applications` và enum của nó; xóa source/test mẫu; sửa `PRISMA_MODEL_OWNER` và ledger `httpMappingInServices`; ADR-0013; cập nhật tài liệu. Không thêm route, bảng nghiệp vụ hay hành vi.
- Not larger: bảng nghiệp vụ thật (nhà cung cấp, ứng dụng, gói…) thuộc từng lát Story sau; gộp vào đây là thêm schema khi chưa có Story.
- Not smaller: quyết định module, gỡ mẫu và cập nhật gate là một thay đổi review/rollback được cùng nhau; tách ra thì gate đỏ giữa chừng.
- Siblings: `g3-money-and-exchange-rates`, `g3-vendor-dictionary`, `g3-catalog-entry`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3).

## Primary Story/AC

| Story | AC       | Coverage | Phần còn lại thuộc                                                                                                  |
| ----- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| —     | GATE3-01 | n/a      | gỡ chặn `g3-money-and-exchange-rates`, `g3-vendor-dictionary`, `g3-catalog-entry` (mỗi lát tự thêm module của mình) |

## Supporting references

`ARCHITECTURE.md` (mục Catalog — "G3 quyết giữ, thay hay loại", Owner E1 = A), [audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md),
BRD 5.12.1 (`C1`, `C3`, `C7`), `ADR-01`, `ADR-05`, `ADR-07`, [module structure](../../../rules/module-structure.md).

## Explicit out of scope

Mọi bảng, route và nghiệp vụ của G3/G4 — thuộc từng hạng mục Story. Không đổi `organization`, `identity-access`, `data-import`.

## Dependencies and blockers

Không có blocker; baseline `pnpm check` xanh ở BE `57b1e1c` (chạy 20/10/2026 trước khi sửa).

## Ownership: module, data, API

- Bị gỡ: `src/modules/catalog/**` (controller/service/repo/DTO/mapper/lỗi + spec), `prisma/models/catalog.prisma`, `test/integration/catalog.repo.integration-spec.ts`.
- Dữ liệu: migration `20261020090000_drop_catalog_sample` (`DROP TABLE catalog_applications; DROP TYPE "CatalogApplicationStatus"`).
- API: không route nào đổi (mẫu chưa từng mount; `test/e2e/api-inventory` vẫn khẳng định `/catalog-applications` trả 404).
- Module mới (`catalog`, `finance`, `licensing`) **chưa** được tạo ở đây: mỗi module xuất hiện cùng lát Story đầu tiên dùng nó, kèm điều kiện Nest submodule theo rule.

## Behavior and design

Quyết định của người thiết kế (Owner xác nhận khi review ADR-0013):

| Mã  | Quyết định                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | **Thay**, không giữ mẫu: lược đồ cũ thiếu loại đối tượng, Business Owner, cờ liên lạc; bảng chưa bao giờ chứa dữ liệu nghiệp vụ nên không cần chuyển dữ liệu                                                                                            |
| D-2 | Ba module: `catalog` = C1, `finance` = C7 phần G3, `licensing` = C3; hướng phụ thuộc `licensing → catalog → finance`, cả ba đọc `organization` qua facade                                                                                               |
| D-3 | Chiều ngược (ngừng ứng dụng, giảm seat cần số chiếm chỗ) đi qua đăng ký chặn do `licensing` nạp vào `catalog`; không `forwardRef`                                                                                                                       |
| D-4 | `finance` chỉ giữ khóa ngoại CSDL tới bảng `catalog`, không import `catalog`                                                                                                                                                                            |
| D-5 | Migration là một bước mới (không viết lại migration đã apply): `catalog_applications` còn trong lịch sử, bị gỡ ở migration mới; cài đặt đang chạy mất bảng rỗng không dùng. Rollback: tạo lại bảng bằng migration mới nếu cần (không có code phụ thuộc) |

Không có hành vi người dùng, quyền hay audit mới.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                                                                                  | Cấp test                      | Kết quả mong đợi                                                                             | Bằng chứng sau implement                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| GATE3-01    | Áp mọi migration lên CSDL trống: không còn bảng `catalog_applications`, không còn kiểu `CatalogApplicationStatus`                    | integration (PostgreSQL thật) | `to_regclass` null; `pg_type` rỗng                                                           | `catalog-sample-removal.integration-spec.ts` đỏ trước (bảng còn), xanh sau      |
| GATE3-01    | Gate kiến trúc/module-graph không còn tham chiếu `CatalogApplication` hay `modules/catalog/public/catalog.api.ts`; ledger không tăng | unit (gate)                   | `architecture-boundaries`, `architecture-structure`, `module-graph`, `policy-ownership` xanh | 107 test PASS                                                                   |
| GATE3-01    | Route mẫu cũ vẫn không phục vụ                                                                                                       | e2e                           | `GET/POST /api/v1/catalog-applications` → 404                                                | `api-inventory.e2e-spec.ts` (test "the removed catalog sample serves no route") |
| GATE3-01    | Toàn bộ `pnpm check`, e2e, integration vẫn xanh sau khi gỡ                                                                           | gate                          | không test nào đỏ                                                                            | xem plan                                                                        |

## Definition of Done

- [x] Mọi primary AC có test đỏ-trước/xanh-sau: AC duy nhất là enabler `GATE3-01`, test integration đỏ trước khi gỡ (table `catalog_applications` còn) rồi xanh.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối (`pnpm check`, `pnpm test:e2e`, integration); không đổi HTTP nên `openapi.json` không đổi.
- [x] Spec/plan/roadmap phản ánh implementation cuối; không contract đổi nên không báo FE.
- [x] Không tăng legacy ledger; mục `httpMappingInServices` của catalog được xóa.
- [x] Tài liệu bị ảnh hưởng đã cập nhật: README, AGENTS, ARCHITECTURE, CONTRIBUTING, guide thêm endpoint, rule API/security, test guide, docs index, ADR-0013.

## Changes and acceptance

20/10/2026: lập khung rồi thiết kế `ready` và triển khai cùng phiên theo giao việc của Owner. ADR-0013 ở trạng thái Proposed
(Owner xác nhận khi review). Đã `verified` local (xem [plan](plan.md#verification-and-handoff)); chưa review, chưa nghiệm thu.

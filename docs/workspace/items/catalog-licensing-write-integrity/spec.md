# Spec: toàn vẹn ghi catalog/finance/licensing — nhóm từ điển không mất cập nhật, đổi gói giữ bất biến con, đầu phiên bản chỉ tiến

- Phụ trách: chưa phân công (đề xuất: người phụ trách catalog).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (`US-04-01`, `US-04-02`, `US-04-07`, `US-04-08`, `US-12-09`, `INV-01` — AC không đổi), BE
  `69f4891`; finding `DB-03`, `DB-07` → `DB-11`, `DB-14` của
  [review hậu merge](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#5-bảo-mật-migration-transaction-và-audit).
- Nhóm roadmap: catalog, finance và licensing — hạng mục là `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này hai IT Admin gắn cùng nhà cung cấp vào hai nhóm từ điển khác nhau không thể cùng thắng (một bị từ chối, CSDL
chặn đổi nhóm đã có), đổi mô hình giá/kiểu cấp của gói không phá bất biến của thuê bao/khóa/phân bổ đang có, đầu phiên bản
hồ sơ thuế và phân bổ chỉ tiến, mọi đổi trạng thái có sự kiện audit riêng, và kiểm tra trong khóa dùng cùng transaction —
kiểm bằng test đua và test ràng buộc CSDL.

## Sizing decision

- Container: bó finding `DB-03`, `DB-07` → `DB-11`, `DB-14` của review hậu merge 22/10/2026.
- Mode: `technical-enabler`.
- Outcome and owner: bất biến ghi của catalog (nhà cung cấp, gói), finance (đầu phiên bản), licensing (`INV-01`);
  capability `catalog/vendor`, `catalog/catalog-entry`, `catalog/plan`, `catalog/subscription`, `finance/tax-profile`,
  `finance/cost-allocation`, `licensing/assignment`.
- Boundaries: điều kiện `UPDATE … WHERE dictionary_group_id IS NULL`/khóa `FOR UPDATE`; trigger mới (`vendors` chặn
  đổi nhóm đã có; `plans` chặn đổi mô hình giá/kiểu cấp khi còn con vi phạm; đầu phiên bản chỉ tiến); truyền `tx` qua
  facade cho kiểm tra trong khóa; sự kiện audit mới; không đổi contract thành công.
- Not larger: tiền tệ báo cáo là `finance-reporting-currency-integrity`; idempotency cấp theo Request là cổng G5
  (`g4-request-and-transfer-integration`).
- Not smaller: các điểm cùng mẫu _bất biến chỉ kiểm khi ghi bảng con_ và cùng bộ test đua/ràng buộc; tách theo bảng lặp
  harness.
- Siblings: `finance-reporting-currency-integrity`, `g3-catalog-entry`, `g3-plan-declaration`, `g3-shared-cost-allocation`.
- Scope map: n/a

## Primary Story/AC

| Story | AC      | Coverage | Phần còn lại thuộc                                                           |
| ----- | ------- | -------- | ---------------------------------------------------------------------------- |
| —     | `DB-03` | n/a      | gỡ chặn `g3-catalog-entry` (`LR-10` dưới đồng thời, audit nhận nhóm)         |
| —     | `DB-07` | n/a      | gỡ chặn `g3-plan-declaration` (đổi gói khi còn thuê bao/khóa/phân bổ)        |
| —     | `DB-14` | n/a      | gỡ chặn `g3-vendor-tax-profile`, `g3-shared-cost-allocation` (đầu phiên bản) |

`DB-08` (`INV-01` chỉ đúng dưới READ COMMITTED — ghi rõ hoặc assert trong trigger), `DB-09` (kiểm tra đọc qua kết nối khác
khi giữ khóa), `DB-10` (kiểm mô hình giá ngoài transaction của phân bổ), `DB-11` (sự kiện audit thiếu) đi cùng các dòng trên.

## Supporting references

`vendor.repo.ts:111-113`, `application.service.ts:314-322`, migration `20261020120000_catalog_applications:114-132`;
`plan.service.ts:155-208`, migration `20261020150000…:95-128`; migration `20261020190100…:1-8,188-237`;
`application-retirement.service.ts:206-216`, `seat-occupancy.reader.ts:30-44`; `subscription-allocation.service.ts:52-59`;
`vendor-proposal-intake.service.ts:12-17`; migration `20261021110000` (mẫu chỉ-tiến của bộ chuẩn); ADR-0005.

## Explicit out of scope

Đọc theo lô (các hạng mục `*-read-*`); vai PostgreSQL (H7).

## Dependencies and blockers

Không blocker. Migration là task đầu. Trigger mới trên `plans`: chọn _chặn_ hay _cho phép kèm chuyển dữ liệu_ khi còn con —
mặc định chặn (409), ghi khi `ready`.

## Ownership: module, data, API

Migration mới (trigger `vendors`, `plans`, đầu phiên bản `vendor_tax_profiles`, `subscription_cost_allocations`); repo/
service nêu trên; `FinanceService.declareCostAllocation` nhận `tx`; sự kiện audit `VENDOR.DICTIONARY_GROUP_ADOPTED`,
`VENDOR_PROPOSAL.RAISED` (tên chọn khi `ready`). `openapi.json` chỉ đổi nếu thêm mã lỗi 409 vào mô tả.

## Behavior and design

- **Nhóm từ điển (`DB-03`):** `UPDATE vendors SET dictionary_group_id = $g WHERE id = $v AND dictionary_group_id IS NULL`;
  0 dòng ⟹ đọc lại, khác nhóm ⟹ 409 như mismatch hiện có; trigger `BEFORE UPDATE OF dictionary_group_id` từ chối non-NULL →
  khác; sự kiện audit riêng.
- **Đổi gói (`DB-07`):** service khóa gói và kiểm thuê bao `ACTIVE`, khóa, phân bổ trước khi đổi `pricing_model`/
  `provisioning_type`; trigger trên `plans` bảo đảm cùng điều kiện ở CSDL.
- **`INV-01` (`DB-08`):** trigger capacity assert `current_setting('transaction_isolation') = 'read committed'` hoặc tài liệu
  hóa giới hạn; sửa chú thích migration mới (không sửa migration đã merge).
- **Cùng transaction (`DB-09`, `DB-10`):** đọc kiểm trong khóa dùng `tx` được truyền; phân bổ kiểm mô hình giá trong cùng
  transaction với ghi.
- **Đầu phiên bản (`DB-14`):** trigger chỉ cho `current_version` tăng đúng 1 như `20261021110000`.
- **Audit (`DB-11`):** sự kiện riêng cho nhận nhóm từ điển và đề xuất phát sinh khi khai ứng dụng.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                                     | Cấp test    | Kết quả mong đợi                              | Bằng chứng sau implement |
| ----------- | --------------------------------------------------------------------------------------- | ----------- | --------------------------------------------- | ------------------------ |
| `DB-03`     | hai IT Admin gắn cùng nhà cung cấp vào G1/G2 đồng thời (`pg_locks`)                     | integration | một thành công, một 409; nhóm không bị ghi đè | chưa chạy                |
| `DB-03`     | ghi thẳng đổi `dictionary_group_id` từ G1 sang G2                                       | integration | CSDL từ chối                                  | chưa chạy                |
| `DB-07`     | đổi gói `FLAT_RATE`→`PER_SEAT` khi còn thuê bao `ACTIVE` không số lượng; K4→K1 còn khóa | integration | 409; CSDL từ chối ghi thẳng                   | chưa chạy                |
| `DB-14`     | ghi thẳng lùi/nhảy `current_version` của hồ sơ thuế, phân bổ                            | integration | CSDL từ chối                                  | chưa chạy                |
| `DB-10`     | đổi mô hình giá đồng thời khi khai phân bổ                                              | integration | không có phân bổ cho gói tính theo người      | chưa chạy                |
| `DB-11`     | gắn nhóm từ điển; khai ứng dụng sinh đề xuất                                            | integration | mỗi thao tác một sự kiện audit riêng          | chưa chạy                |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `DB-03`,
      `DB-07` → `DB-11`, `DB-14`.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; ADR-0005 ghi ràng buộc ngoài Prisma mới.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 08. Chưa code, chưa review, chưa nghiệm thu.

# Spec: toàn vẹn tiền tệ báo cáo — khóa đổi tiền tệ không bị write skew, tiền tệ báo cáo phải có trong danh mục

- Phụ trách: chưa phân công (đề xuất: người phụ trách finance/operating-parameters).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (`US-01-04` AC-9 khóa tiền tệ báo cáo, `US-04-05` ảnh chụp quy đổi, `QĐ-42c`), BE `69f4891`;
  finding `DB-01`, `DB-02` của
  [review hậu merge](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#5-bảo-mật-migration-transaction-và-audit).
- Nhóm roadmap: finance — hạng mục là `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này đổi tiền tệ báo cáo và ghi tỷ giá/ảnh chụp giá đồng thời không thể cùng commit sai (một bên chờ bên kia), và
một cài đặt có tiền tệ báo cáo ngoài danh mục được phát hiện trước khi dùng (lệnh khởi tạo từ chối, migration kiểm kê) thay
vì mọi lần ghi giá trả 500 — kiểm bằng test đua có khóa và test HTTP.

## Sizing decision

- Container: bó finding `DB-01`, `DB-02` của review hậu merge 22/10/2026.
- Mode: `technical-enabler`.
- Outcome and owner: bất biến `QĐ-42c` đúng dưới đồng thời; capability `finance` (tỷ giá, `snapshotMoney`),
  `operating-parameters` (đổi tiền tệ báo cáo), `installation` (đầu vào khởi tạo).
- Boundaries: trigger/khóa `FOR SHARE` trên `organizations` trong đường ghi tỷ giá và ảnh chụp giá; migration mới thêm FK
  `organizations.reporting_currency → currencies(code)` sau bước kiểm kê; ánh xạ lỗi `ReportingCurrencyNotSupportedError`
  thành 409/422; validate lệnh khởi tạo theo danh mục.
- Not larger: phân bổ, thuế và các khóa khác là `catalog-licensing-write-integrity`.
- Not smaller: hai finding cùng bất biến của tiền tệ báo cáo và cùng một migration.
- Siblings: `catalog-licensing-write-integrity`, `g3-money-and-exchange-rates`.
- Scope map: n/a

## Primary Story/AC

| Story | AC      | Coverage | Phần còn lại thuộc                                                   |
| ----- | ------- | -------- | -------------------------------------------------------------------- |
| —     | `DB-01` | n/a      | gỡ chặn `g3-money-and-exchange-rates` (khóa `QĐ-42c` dưới đồng thời) |
| —     | `DB-02` | n/a      | gỡ chặn `g3-subscription-purchase` (ghi giá không 500)               |

## Supporting references

Migration `20261020100000_finance_money_and_exchange_rates`, `20261020100500_exchange_rates_immutable`,
`20261020200000_reporting_currency_locked_by_prices`; `finance.service.ts:68-74`; `installation.input.ts:47`;
`reporting-currency.service.ts:35-57`; ADR-0007, ADR-0005.

## Explicit out of scope

Nguồn tỷ giá công khai (`TE-08`); đổi danh mục tiền tệ qua HTTP.

## Dependencies and blockers

Không blocker. Migration là task đầu (kiểm kê chỉ đọc: tiền tệ báo cáo có trong `currencies` không; không thì dừng kèm
hướng dẫn).

## Ownership: module, data, API

Migration mới (trigger khóa `FOR SHARE`, FK); `finance.service.ts`, `exchange-rate.service.ts`, mapper lỗi finance;
`installation.input.ts`/service; `reporting-currency.service.ts`. `openapi.json` nếu thêm mã lỗi vào mô tả.

## Behavior and design

- Trigger ghi tỷ giá và trigger mới trên `subscriptions.price_reporting_currency` đọc `organizations` `FOR SHARE`; đổi tiền
  tệ báo cáo (`FOR NO KEY UPDATE`/`UPDATE`) chờ các ghi đó và ngược lại — bên sau thấy trạng thái đã commit và bị từ chối
  đúng quy tắc.
- FK `organizations.reporting_currency → currencies(code)`; lệnh khởi tạo kiểm theo danh mục; lỗi còn lại ánh xạ 409
  `MONEY.REPORTING_CURRENCY_NOT_SUPPORTED` (mã chọn khi `ready`).
- Tương thích: cài đặt hiện có với tiền tệ trong 11 mã seed không đổi; ngoài danh mục ⟹ migration dừng có hướng dẫn.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                            | Cấp test    | Kết quả mong đợi                                        | Bằng chứng sau implement |
| ----------- | ------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------- | ------------------------ |
| `DB-01`     | tx A đổi VND→USD giữ khóa; tx B ghi tỷ giá USD (chờ `pg_locks`, không `sleep`) | integration | một bên bị từ chối; không có tỷ giá cho tiền tệ báo cáo | chưa chạy                |
| `DB-01`     | tx A đổi tiền tệ; tx B chụp giá theo VND                                       | integration | không còn ảnh chụp theo tiền tệ cũ sau khi khóa         | chưa chạy                |
| `DB-02`     | khởi tạo với `MYR`; migration trên CSDL có `MYR`                               | integration | khởi tạo từ chối; migration dừng có hướng dẫn           | chưa chạy                |
| `DB-02`     | ghi giá khi tiền tệ báo cáo không hỗ trợ (dữ liệu cũ)                          | integration | 409 có mã, không 500                                    | chưa chạy                |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `DB-01`,
      `DB-02`.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 08. Chưa code, chưa review, chưa nghiệm thu.

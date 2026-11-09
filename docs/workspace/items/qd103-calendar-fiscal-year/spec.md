# Spec: qd103-calendar-fiscal-year — năm tài chính là năm dương lịch; bỏ cắt quyền ở cuối năm

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`), đợt W1 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready`. Owner review: chưa review (chế độ tự chạy — Owner kiểm buổi sáng).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-5.1`, `BR-MF4-06`; `QĐ-104e`(1), `QĐ-104a`; quy trình v1.7 A.4 _Năm tài chính_), BE
  `b9854ef5`. Ledger: L1-07, L1-25, L2-25, L2-40, L3-27 ([LEDGER](../../../reviews/qd103-108-alignment-2026-11-08/LEDGER.md)); luật R-I01, R-K02, R-D03.
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Mọi chỗ tính năm (năm của Request, kiểm tra ngân sách, phiên bản ngân sách, đóng năm, cấp quyền, seed) dùng **năm dương lịch**
(01/01 → 31/12); tham số `FISCAL_YEAR_START_MONTH` không còn tồn tại (đọc, ghi, liệt kê đều không thấy); quyền có thời hạn
**không** bị cắt ở cuối năm nữa — ngày kết thúc là `start + months − 1 ngày`. Kiểm bằng unit `core/` và test HTTP tham số.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W1), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: primitive năm của `src/core` (`fiscal-year.ts`, `term-limit.ts`) và registry tham số của
  `operating-parameters`; mọi module chỉ là nơi gọi.
- Boundaries: không đổi bảng nghiệp vụ; một migration dữ liệu đóng giá trị tham số cũ; bỏ một key khỏi API tham số.
- Not larger: số tiền theo tháng còn lại của năm và quyền mặc định không ngày kết thúc thuộc `qd103-request-amount-and-term`;
  đóng năm 01/01 và khoản cam kết 01/01 thuộc W2/W4.
- Not smaller: tách bỏ tham số khỏi đổi nơi gọi sẽ để lại code đọc một key không còn — hai việc là một đổi chữ ký.
- Siblings: `qd103-shared-pool-subscription` (cùng W1, độc lập).
- Scope map: n/a

## Primary Story/AC

| Story | AC           | Coverage | Phần còn lại thuộc                                                                                        |
| ----- | ------------ | -------- | --------------------------------------------------------------------------------------------------------- |
| —     | L1-07, L2-25 | n/a      | gỡ chặn `qd103-budget-cycle-ceilings`, `qd103-request-amount-and-term`, `qd103-new-year-auto-commitments` |

## Supporting references

`US-06-15` AC-1 (kỳ theo năm dương lịch), `US-06-18`, `US-05-23` (thời hạn không cắt 31/12). `QĐ-104e`(1): _Năm tài chính cố
định = năm dương lịch; bỏ tham số tháng bắt đầu năm tài chính._ `QĐ-104a`: bỏ _cắt mọi quyền tại 31/12_.

## Explicit out of scope

- Số tiền Request, `termMonths` tùy chọn, quyền không ngày kết thúc — `qd103-request-amount-and-term` (W3).
- Bỏ `allowsMidTermReduction` khỏi Subscription — `qd103-subscription-adjustment-point` (W5). Ở đây chỉ thôi dùng nó để cắt
  thời hạn.
- Đổi tên hàm `fiscalYearOf` thành tên khác: không làm (giữ tên, đổi chữ ký) để diff nhỏ.

## Dependencies and blockers

Không có. Đầu W1.

## Ownership: module, data, API

- `src/core/fiscal-year.ts`: `fiscalYearOf(date)` (bỏ tham số `startMonth`) = năm dương lịch của `date`; giữ `addMonths`.
- `src/core/term-limit.ts`: bỏ `fiscalYearEndOf`, `endsBy` (luôn `null` ⟹ bỏ khỏi `TermLimit`), bỏ tham số `flexible` và
  `fiscalYearStartMonth` khỏi `termLimitOf`, `checkTerm`, `renewalEndOf`, `effectiveEndOf`; `effectiveEndOf = termEndOf`.
- `operating-parameters/parameter-definitions.policy.ts`: xóa định nghĩa `FISCAL_YEAR_START_MONTH`.
- `budgets/version/fiscal-year-start-lock.listener.ts` (+ spec, `test/support/fiscal-year-start-lock-harness.ts`): xóa —
  không còn tham số để khóa. Gỡ đăng ký ở `budgets.module.ts` và extension point nếu chỉ phục vụ listener này.
- Mọi nơi gọi ở danh sách grep (budgets, requests, licensing, seed) thôi đọc tham số và gọi chữ ký mới.
- Migration `prisma/migrations/<ts>_drop_fiscal_year_start_month/migration.sql`: `UPDATE parameter_values SET valid_to = now()
WHERE key = 'FISCAL_YEAR_START_MONTH' AND valid_to IS NULL;` (giữ lịch sử, không xóa dòng).
- API: `GET /operating-parameters` không còn key; `PUT` với key đó ⟹ lỗi key không tồn tại hiện có. Lỗi/ví dụ OpenAPI nhắc
  `fiscalYearStartMonth` (vd. `TERM_BEYOND_LIMIT` details `endsBy`) cập nhật theo.

## Behavior and design

1. `fiscalYearOf('2026-03-31') = 2026`, `fiscalYearOf('2027-01-01') = 2027`.
2. `effectiveEndOf({ start: '2026-11-15', months: 6 }) = '2027-05-14'` (không cắt ở 31/12/2026 kể cả gói linh hoạt).
3. `checkTerm` chỉ còn trần 12 tháng; lỗi `TERM_BEYOND_LIMIT` không còn `endsBy` trong details.
4. Seed (`seed-calendar.ts`) dùng năm dương lịch; fixture không ghi tham số đã bỏ.
5. Dữ liệu cũ: **mọi** giá trị đang mở của key bị đóng; migration `RAISE NOTICE` khi có dòng `value <> 1` (năm của bản ghi đã
   lưu — `budget_year`, phiên bản — giữ nguyên, có thể lệch nghĩa nếu từng dùng tháng khác 1; dữ liệu demo dùng tháng 1).
   Migration **không hoàn tác**, đóng ngoài ứng dụng nên không có Audit Trail — chấp nhận.
6. Lịch sử key đã bỏ: `GET /operating-parameters/FISCAL_YEAR_START_MONTH/history` trả 404 như key lạ (service kiểm định
   nghĩa trước); dòng lịch sử vẫn nằm trong DB.
7. Toàn bộ cơ chế khóa tham số chỉ phục vụ key này (extension point `operating-parameters.lock-readers`, `holdValue`/`lockKey`/
   `holdKey`, lỗi 409 `PARAMETER.LOCKED`) bị gỡ nếu không còn key nào dùng; còn dùng thì giữ.
   Transaction/concurrency: không áp dụng (hàm thuần). Jobs: `year-end.job` tính năm bằng hàm mới.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                               | Cấp test                                                                                                | Kết quả mong đợi                                  | Bằng chứng sau implement |
| ----------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------ |
| R-I01       | 31/12 và 01/01 rơi vào hai năm khác nhau                                          | unit `core/fiscal-year.spec.ts`                                                                         | 2026 / 2027                                       |                          |
| R-D03       | quyền 6 tháng bắt đầu 15/11, gói linh hoạt                                        | unit `core/term-limit.spec.ts`                                                                          | kết thúc 14/05 năm sau                            |                          |
| R-K02       | `GET` tham số; `PUT FISCAL_YEAR_START_MONTH`                                      | integration `operating-parameters-http`                                                                 | không có key; PUT bị từ chối như key lạ           |                          |
| hồi quy     | kiểm tra ngân sách, đóng năm, Request tiếp tục, cấp quyền chạy với năm dương lịch | unit/integration hiện có của file đã đổi                                                                | xanh, kỳ vọng đổi chỉ chỗ cắt 31/12               |                          |
| migration   | DB có giá trị tham số đang mở (1 và 4)                                            | integration migration (mẫu `test/integration/catalog/document-final-key-migration.integration-spec.ts`) | mọi dòng mở bị đóng `valid_to`, không mất lịch sử |                          |
| R-K02       | `GET …/FISCAL_YEAR_START_MONTH/history`                                           | integration `operating-parameters-http`                                                                 | 404 như key lạ                                    |                          |

## Definition of Done

- [ ] Grep `FISCAL_YEAR_START_MONTH|fiscalYearStartMonth|fiscalYearEndOf|endsBy` trong `src/`, `test/` chỉ còn ở migration/lịch sử.
- [ ] Kiểm tra nhanh của tracker §4.5 xanh; `openapi:export` không drift ngoài thay đổi đã ghi.
- [ ] Spec/plan cập nhật theo implementation; `pnpm check` và full suite **chưa chạy** (Owner chạy).

## Changes and acceptance

08/11/2026: tạo ở W1. Chưa nghiệm thu.

08/11/2026 (chat code): implement xong, `verified-local` — bằng chứng ở [plan](plan.md). Chưa nghiệm thu.

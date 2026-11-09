# Spec: tham số năm tài chính và thời hạn chờ trình thay loại kỳ ngân sách

- Phụ trách: chưa phân công.
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 07, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review — cần Owner xác nhận miền giá trị của thời hạn chờ trình (mặc định 2 ngày
  làm việc đã có ở nguồn); hợp đồng có biên của `GET /non-working-dates` (`LD-15`, gán ở Prompt 09A ngày 23/10/2026) chưa
  chọn.
- Nguồn: Docs `72e1480` (BRD v3.53 `FR-8.2`, `FR-5.1`; `QĐ-82c`, `QĐ-82e`, `QĐ-82l`(23), `QĐ-82m` `INF-13`; `US-01-04`
  AC-7, AC-8, AC-14), BE `69f4891`.
- Nhóm roadmap: G2 — chỉ là planning container, không phải phạm vi (xem `## Sizing decision`).
- Finding: `BBI-D03` của [business-baseline-impact-2026-10-22](../business-baseline-impact-2026-10-22/spec.md); `LD-15`
  (vế `nonWorkingDateList`) của
  [review hậu merge](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#4-collection-và-detail-api-list-detail1) —
  finding kỹ thuật đi cùng capability, không phải AC.
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, Super Admin thấy và đặt được _tháng bắt đầu năm tài chính_ (mặc định tháng 1) và _thời hạn chờ trình duyệt
chi_ (mặc định 2 ngày làm việc); không còn tham số _loại kỳ ngân sách_ và không có tham số ngưỡng giá trị cao — kiểm bằng
`GET`/`PUT` tham số và Audit Trail. Đi kèm (`LD-15`): danh sách ngày nghỉ có biên cho toàn response.

## Sizing decision

- Container: G2 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: danh mục tham số khớp `FR-8.2`; capability `operating-parameters` (cùng capability giữ biên danh sách
  ngày nghỉ của `LD-15`).
- Boundaries: định nghĩa tham số trong `parameter-definitions.ts`; bảng `parameter_values` không đổi lược đồ; HTTP
  tham số hiện hành; chỉ Super Admin. `GET /non-working-dates` chỉ đổi phần biên của danh sách (`LD-15`); thêm/sửa/xóa
  ngày nghỉ không đổi.
- Not larger: khóa đổi tháng bắt đầu khi đã có phiên bản ngân sách và tham số phiếu báo lỗi cần G5/phiếu báo lỗi — ở khung
  `g2-downstream-integration`.
- Not smaller: ba AC cùng một danh mục tham số và một test matrix.
- Siblings: `g2-operating-parameters` (lát gốc, giao trước GOV.1), `g2-downstream-integration`.
- Scope map: [G2](../../../roadmap.md#work-item-decomposition-g2).

## Primary Story/AC

| Story    | AC                | Coverage | Phần còn lại thuộc                                                                                                                                  |
| -------- | ----------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-01-04 | AC-7, AC-8, AC-14 | partial  | AC-8 vế khóa khi đã có phiên bản ngân sách, AC-15: `g2-downstream-integration`; AC-1→AC-6, AC-9→AC-13: `g2-operating-parameters` (giao trước GOV.1) |

Vế sở hữu: AC-7 trọn AC; AC-8 vế _không có tham số loại kỳ tháng/quý/năm_; AC-14 trọn AC.

## Supporting references

`FR-8.2` (danh sách tham số), `FR-5.1` (kỳ ngân sách là năm tài chính), `QĐ-82l`(23) (đặt một lần, không đổi khi đã có
phiên bản), `OI-11b` (bị `QĐ-82e` thay); lát gốc [g2-operating-parameters](../g2-operating-parameters/spec.md).
`LD-15` (vế `nonWorkingDateList`, gỡ mục `nonWorkingDateList#unbounded` khỏi registry của
`api-list-detail-contract-remediation`): `US-01-04` AC-10 (ngày nghỉ, lát gốc), [rule collection/detail](../../../rules/api-contract.md#collection-và-detail-api-list-detail1)
điều 3 — một dòng mỗi ngày không phải biên của response khi khoảng năm tùy chọn.

## Explicit out of scope

Khóa đổi tháng bắt đầu khi đã có phiên bản ngân sách (cần `US-06-09`, G5); tham số thời hạn phản hồi và mở lại phiếu báo
lỗi (`US-01-04` AC-15, `US-07-10`, `US-07-11`); dùng thời hạn chờ trình để nhắc (`US-05-09` AC-11, G5).

## Dependencies and blockers

Không blocker kỹ thuật. Owner review spec. G5 phải thêm khóa của AC-8 **trước** khi cho tạo phiên bản ngân sách đầu tiên
(ghi ở `g2-downstream-integration`). Vế `LD-15`: chọn hợp đồng có biên của danh sách ngày nghỉ và Owner duyệt trước khi
code.

## Ownership: module, data, API

`src/modules/operating-parameters/parameter-definitions.policy.ts` (+ spec), `operating-parameters.service.ts` (không đổi hành
vi đọc: khóa không còn định nghĩa bị bỏ qua khi đọc), test `operating-parameters-http.integration-spec.ts`. Không
migration (giá trị cũ của `BUDGET_PERIOD_KIND` trong `parameter_values` không còn được đọc và giữ làm lịch sử). OpenAPI
không liệt kê khóa — diff dự kiến rỗng; kiểm lại khi export. Vế `LD-15`: `operating-parameters.controller.ts`,
`dto/operating-parameters.dto.ts` (`listNonWorkingDatesQuerySchema`), `non-working-dates.service.ts`,
`operating-parameters.repo.ts` (`listNonWorkingDates`), `test/gates/api-collection-contract.gate-spec.ts` (gỡ mục); OpenAPI đổi nếu
query hay response đổi.

## Behavior and design

- Bỏ định nghĩa `BUDGET_PERIOD_KIND`. `GET` không còn trả khóa đó; `PUT` khóa đó ⟹ 404 `PARAMETER.NOT_FOUND` như mọi khóa lạ (`operating-parameters.http-errors.ts:22-23`).
- Thêm `FISCAL_YEAR_START_MONTH`: số nguyên 1–12, mặc định 1. Lát này **không** có điều kiện khóa (chưa có phiên bản
  ngân sách nào tồn tại được); khóa thuộc khung.
- Thêm `SPEND_SUBMISSION_WAIT_WORKING_DAYS`: số nguyên ngày làm việc, mặc định 2; miền đề xuất 1–30 (chờ Owner xác
  nhận, như cách `OQ-A-05` cho các tham số khác).
- Không có tham số ngưỡng giá trị cao hay tỷ lệ 50 % (`QĐ-82c`) — có test khẳng định.
- Mọi thay đổi ghi Audit Trail trước/sau như hiện hành. Transaction, concurrency: như hiện hành.
- **Danh sách ngày nghỉ có biên (`LD-15`, vế `nonWorkingDateList`):** khóa duy nhất cho một dòng mỗi ngày, nhưng `from` và
  `to` tùy chọn và không phân trang — gọi không khoảng trả mọi năm đã ghi, nên response không có biên. Gỡ mục registry khi có
  **một** trong: phân trang thật (`pageSize` có `maximum`, thứ tự tất định), trần cứng của **toàn response**, hoặc bắt buộc cả
  `from` lẫn `to` kèm khoảng tối đa chứng minh được. Hợp đồng nào **chưa chọn** — người phụ trách đề xuất, Owner duyệt.
- Tương thích: client đọc `BUDGET_PERIOD_KIND` phải bỏ; báo FE. Nếu danh sách ngày nghỉ bắt buộc khoảng hoặc phân trang thì
  đổi wire (FE).

## Test matrix

| AC / rủi ro      | Tình huống (gồm từ chối, edge case)                                          | Cấp test           | Kết quả mong đợi                                                                   | Bằng chứng sau implement                                         |
| ---------------- | ---------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `US-01-04` AC-7  | hệ thống mới: danh sách mặc định                                             | unit + integration | SLA 2, N 5, tháng bắt đầu 1, chờ trình 2, rà soát 5, giữ gỡ 1                      | xanh — `parameter-definitions.spec`, `operating-parameters-http` |
| `US-01-04` AC-8  | tìm/đặt `BUDGET_PERIOD_KIND`; đặt tháng 13, 0                                | integration        | không có khóa loại kỳ; ngoài miền ⟹ 422                                            | xanh — `parameter-definitions.spec`, `operating-parameters-http` |
| `US-01-04` AC-14 | tìm tham số ngưỡng giá trị cao                                               | integration        | không có                                                                           | xanh — `parameter-definitions.spec`, `operating-parameters-http` |
| hồi quy          | giá trị `BUDGET_PERIOD_KIND` đã lưu từ trước                                 | integration        | không trả, không lỗi                                                               | xanh — `parameter-definitions.spec`, `operating-parameters-http` |
| quyền            | IT Admin, Finance đặt tham số                                                | integration        | 403 như AC-6                                                                       | xanh — `parameter-definitions.spec`, `operating-parameters-http` |
| `LD-15`          | ngày nghỉ ghi trải nhiều năm, gọi không khoảng hoặc khoảng vượt biên đã chọn | integration        | response không vượt biên đã chọn; mục `nonWorkingDateList#unbounded` gỡ, gate xanh | xanh — `parameter-definitions.spec`, `operating-parameters-http` |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 07. Chưa code, chưa review, chưa nghiệm thu.

23/10/2026 (Prompt 09A): nhận vế `nonWorkingDateList` của `LD-15` theo Owner review `LD-R2-RV-01` (mục registry chuyển
`bounded` → `unbounded`). Chưa chọn hợp đồng, chưa code.

23/10/2026 (Prompt 10 — xử lý tồn đọng G0→G4): `BBI-D03` + `LD-15`: bỏ `BUDGET_PERIOD_KIND`; thêm `FISCAL_YEAR_START_MONTH` (1–12, mặc định 1) và `SPEND_SUBMISSION_WAIT_WORKING_DAYS` (1–30, mặc định 2); giá trị cũ của khóa đã bỏ không còn được đọc. `GET /non-working-dates` phân trang (đổi wire). Áp dụng **mặc định do spec khuyến nghị**, không phải quyết định của Owner: Owner chưa review; nếu Owner chọn khác thì đổi ở đây. Miền 1–30 của thời hạn chờ trình là đề xuất của spec. Kiểm chứng: `parameter-definitions.spec`, `operating-parameters-http` — xanh trên cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026. Gate toàn cây trên cùng cây: `pnpm lint`, `tsc --noEmit`, `pnpm test` (unit 2.074 (141 suite)), `pnpm test:e2e` (839 (32 suite)), `pnpm test:integration` (112 suite, 1.429 test, gồm 4 test kho S3 thật trên LocalStack), `prisma migrate deploy` trên CSDL mới + `migrate diff --exit-code` (không lệch), `pnpm openapi:export`. Giới hạn: Khóa đổi tháng bắt đầu khi đã có phiên bản ngân sách thuộc `g2-downstream-integration` (cần G5): giữ `blocked`. Chưa commit khi viết dòng này, chưa remote CI, chưa Owner review, chưa nghiệm thu: không có gì là `accepted`; đỏ-trước của từng test không được ghi lại.

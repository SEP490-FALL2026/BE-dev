# REPORT — finance-screens-api (đêm 06/11/2026)

Điều phối: chat `SEP-Start 70: code Finance`. Code: chat `SEP-Start 71: Finance coder`. Base: `aeb00f17` (Đợt 1).
Chi tiết từng task: [HANDOFF.md](HANDOFF.md). Smoke API thật: [SMOKE.md](SMOKE.md).

## Đã xong

| Màn                       | API                                                                                                                                                   | Ghi chú                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1 — Trung tâm chi phí     | `GET /budgets` thêm `base`, `reserve`; **mới** `GET /budgets/summary?year=`                                                                           | `totals` là map theo mã đồng tiền; `lastInvoiceRecordedAt`                           |
| 2 — Đề xuất ngân sách     | không đổi BE                                                                                                                                          | FE ánh xạ theo [plan](plan.md) `## FE mapping`; Người duyệt chi quyết cuối (`SoD-8`) |
| 3 — Đã duyệt chi theo đợt | **mới** `GET /spend-batches` (FINANCE); Finance đọc mọi lô + items                                                                                    | `approvedAmounts` map theo đồng tiền                                                 |
| 4+5 — Cam kết + hóa đơn   | `GET /budget-commitments` thêm `state`, `request`, `invoiced`, `invoiceCount`, `hasDiscrepancy`; **mới** `POST/GET /budget-commitments/{id}/invoices` | migration `20261108400000_finance_invoices` (bảng `invoices`, cột `applied_minor`)   |
| Seed                      | `shared-demo-v3`: R10, R11, `budget.next-year` (ITO 2027 chờ Finance), `finance.invoices` (SV-HD1/2/3)                                                | idempotent                                                                           |

OpenAPI 337 → 341 operation.

## Audit

- Từng task: T1, T2, T5, T3 (migration tự đọc: guard cũ giữ nguyên, CHECK, append-only), T4, T6, T7 — đạt.
- FIX-1 (điều phối): `spent` tính theo hóa đơn của (Cost Center, năm), không lọc cam kết đã gắn — cam kết chuyển tiếp chi hết
  trước khi có ngân sách năm sau không bị mất thực chi (`QĐ-98k`).
- Review độc lập toàn bộ diff ⟹ FIX-2, cả 5 đã sửa, có test và thử đột biến:
  1. High — Request nhóm đã có hóa đơn: rút thành viên / cấp thất bại bị chặn ⟹ nay chỉ giải phóng phần còn giữ.
  2. Medium — hủy Request đua với ghi hóa đơn ⟹ 500 ⟹ khóa dòng cam kết theo thứ tự năm (`lockOfRequest`).
  3. Medium — đề xuất phần mềm mới chưa gắn plan: dòng cam kết mất `request`, không ghi được hóa đơn ⟹ trả `plan: null`, vendor từ assessment.
  4. Low — 422 `MONEY_OUT_OF_RANGE` thiếu trong OpenAPI ⟹ đã thêm.
  5. Low — `attachWaiting` đua với hóa đơn ⟹ lọc `state: HELD`, chỉ trả dòng thật sự gắn.
- Test cũ đổi theo luật mới (đã duyệt): `spend-batches.integration-spec` (Finance đọc lô 404 → 200), `spend-commitment-lifecycle`
  (phần tên trên cam kết `EXPENSED` ⟹ không giải phóng, không lỗi), harness `commit(EXPENSED)` ghi kèm hóa đơn. Gate: thêm 1 dòng
  `PUBLIC_CONTRACT_EXPORTS`, 1 dòng owner model `Invoice` — không nới điều kiện.

## Test đã chạy (máy local, sau FIX-2 + T7)

| Bước CI                                              | Kết quả                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                         | xanh trừ 1 test `scripts/verify/bootstrap-installation.test.mjs` đỏ **do môi trường của tôi** (đặt `TEST_DATABASE_BOOTSTRAP_URL` trong shell; test cấm mọi biến `BOOTSTRAP_`). Chạy riêng không có biến ⟹ pass; chạy lại toàn bộ `test:scripts` không có biến — xem `## Bổ sung`. `test:discovery`, `build` chạy riêng: xanh |
| OpenAPI export                                       | không drift                                                                                                                                                                                                                                                                                                                  |
| `prisma migrate diff` trên DB mới migrate            | No difference                                                                                                                                                                                                                                                                                                                |
| `test:http`                                          | xanh                                                                                                                                                                                                                                                                                                                         |
| `test:integration`                                   | 348/349 suite (1 skip), 4132 test pass (4 skip)                                                                                                                                                                                                                                                                              |
| `test:integration:timing`                            | 7/7, 28 test                                                                                                                                                                                                                                                                                                                 |
| `test:integration:serial`                            | 13/13, 96 test                                                                                                                                                                                                                                                                                                               |
| `test:e2e`                                           | 11/11, 50 test                                                                                                                                                                                                                                                                                                               |
| `test:flows`                                         | 9/9, 64 test                                                                                                                                                                                                                                                                                                                 |
| `pnpm build`, `pnpm audit --prod --audit-level high` | xanh                                                                                                                                                                                                                                                                                                                         |
| Smoke API thật trên seed                             | xanh — [SMOKE.md](SMOKE.md)                                                                                                                                                                                                                                                                                                  |

Lần chạy đầu có các bước integration/timing/serial/e2e/flows đỏ vì script của tôi thiếu `TEST_DATABASE_ADMIN_URL`; đã chạy lại
tuần tự với biến đúng như CI và xanh như bảng trên.

## Logic cũ còn lại (không sửa — Owner sửa sau demo)

- `GET /budgets` `remaining` chưa trừ Request đang chờ duyệt chi (`C-09`).
- `GET /budgets/mine` không trả số còn lại (`QĐ-100p`).
- Enum `SENT_TO_FINANCE`, `RETURNED_BY_FINANCE` của lô; luồng Finance rà soát (`financeReview*`) vẫn chạy.

## Chưa làm / gap so với US

- `US-12-02`: số seat trên hóa đơn, dòng không ghép được, đóng hồ sơ sai lệch (chỉ có cờ), IT đính biên lai, import CSV, sao kê.
- `US-12-01`: Người duyệt chi chưa đọc được `GET /budgets` / `summary` (chỉ FINANCE).
- Docs tự mâu thuẫn: `US-12-02` AC-8 (giảm theo chi phí thực chịu) vs `US-06-06` AC-1/AC-5 + `QĐ-97d` (giảm theo giá gốc) — code theo
  giá gốc; Owner sửa câu chữ `US-12-02` AC-8.

## Việc của Owner

1. Merge PR vào `dev` (CI phải xanh) rồi deploy; chạy migration trên VPS (chỉ thêm).
2. Seed lại VPS nếu muốn có dữ liệu hóa đơn demo (seed idempotent, chỉ thêm R10/R11/đề xuất ITO/hóa đơn).
3. Docs: thêm QĐ cho D1 (mở lại hóa đơn tối giản, Finance ghi trên khoản cam kết) và D2 (Finance đọc lô trình duyệt chi, chỉ đọc).
4. Repo WDP: xem `## Repo WDP`.

## Bổ sung

(điều phối ghi khi xong commit/push, FE docs, WDP)

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

| Bước CI      | Kết quả                                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` | xanh trừ 1 test `scripts/verify/bootstrap-installation.test.mjs` đỏ **do môi trường của tôi** (đặt `TEST_DATABASE_BOOTSTRAP_URL` trong shell; test cấm mọi biến `BOOTSTRAP_`). Chạy riêng không có biến ⟹ pass; chạy lại toàn bộ `test:scripts` không có biến — xem `## Bổ sung |

### Commit, PR

- SEP: `491a0d6e` (API) + `03382f92` (seed) + merge `origin/dev` `01757398`, push `feat/qd96-100-alignment`,
  [PR #34 → `dev`](https://github.com/SEP490-FALL2026/BE-dev/pull/34) — **chưa merge**.
- Docs: `340051a` (chỉ `Figma UI-UX/API-Integration/`), push `main`. Lần push này kéo theo 2 commit local có sẵn của chat khác
  (`60ec6c8 update docs`, `d725a43 API docs … Đợt 1`).
- WDP (`D:\FPT\WDP\BE`, `dev`): 39 file chép dở của chat sửa CI được cất vào stash `stale finance-screens copy (before port
07/11)` (không xóa); `git am` 2 commit + `918b31a` sinh lại Prisma client (WDP commit `src/generated`); push `dev`;
  CI chạy tay (`workflow_dispatch`, quét ALL, không deploy) [run 42135280662](https://github.com/WDP301-FA26-GR8/BE/actions/runs/42135280662)
  xanh mọi job; [PR #46 `dev` → `main`](https://github.com/WDP301-FA26-GR8/BE/pull/46) — **chưa merge** (merge = deploy VPS).

### CI GitHub của SEP PR #34

select, http-contract, integration ×3, integration-inband: **xanh**. `quality`: unit 377 suite / 4905 test **pass**, rồi Jest in
"Jest did not exit one second after the test run has completed" và treo tới giới hạn 20 phút ⟹ **cancelled** (2 lần, kể cả rerun).
**Có từ trước hạng mục này:** run của `3cdbf622` (chỉ format docs Đợt 1) cũng bị hủy đúng như vậy; cùng code trên WDP thì job
`quality` thoát bình thường (unit wall 30 s). Ở máy local `pnpm test` thoát bình thường. Chưa tìm được handle còn mở
(`--detectOpenHandles` chạy tuần tự > 10 phút). Hướng sửa cho chat CI: chạy `pnpm test --detectOpenHandles` trên runner Linux để
tìm suite giữ handle; hoặc tạm thêm `--forceExit` cho bước unit trong CI (che lỗi rò, Owner quyết). Vì `quality` bị hủy nên
`e2e-smoke` bị skip trên CI — e2e đã chạy local xanh (11/11).

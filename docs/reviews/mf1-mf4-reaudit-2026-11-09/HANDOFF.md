# HANDOFF — MF-1/MF-4 (chat chính, nhánh `feat/qd103-108-mf145`)

Thứ tự tối 09/11/2026 theo Owner (thay PLAN §1): Bước 0 → gói 2 → gói 3 (đường găng) → gói 9 + gói 5 song song bằng subagent → gói 7 → gói 4 → gói 6 → gói 10 → gói 8 → gói 11. Gói 12–14 để đợt sau.
Chat khác làm MF-5 ở `Code/be-mf5` (`feat/mf5`) — không đụng. Migration của chat này đặt trước `20261109200000`.

| Ngày | Gói | Commit | Lệnh đã chạy + kết quả thật | Lệch SPEC | Việc để lại |
| ---- | --- | ------ | --------------------------- | --------- | ----------- |
| 09/11 | Bước 0 — gom nhánh + sửa REVIEW-4 | (xem `git log`) | `typecheck` 0 lỗi · `lint` · `format:check` · `arch:check` · `arch:docs:check` · `rules:check` · `prisma:validate` · `test:gates` 330/330 (một lượt chạy trước đó đỏ 3 suite, chạy lại xanh — không lặp lại được) · `test:discovery` · `openapi:export` (diff chỉ vùng `purchase` của provisioning) · unit `licensing` + `pricing.policy` + `budgets/cycle` 520/520 · integration `budget-lines-bm10-migration` + `budget-cycle-deadline` 9 pass, 1 skip (DB `slm-test-db` cổng 55432, role `ci_integration`) | — | Gói 1 còn nợ: test C4-04 (4 ca), C4-07, C4-08a, F-115. Gói 9: mapper `purchase` đã có; còn test integration AC-2/3/4, test migration `shared_pool_grant`, `subscriptionId` tùy chọn, `K1` +1, `stock` trên `grantQueueList`, Task 6 |

## Đã sửa theo REVIEW-4

- **B**: migration `20261109104000_budget_lines_bm10_cleanup` (14 chữ số) — thêm cột NULL → backfill `priority_rank = position` → `NOT NULL` → UNIQUE + CHECK; `budget_version_lines.priority_rank` copy từ dòng đề xuất; test migration trên đề xuất nhiều dòng.
- **C**: _tránh được_ ghi một lần khi hoàn tất cấp **không mua** (`SharedPoolService.recordAvoided`), không ghi khi có mua; kho chặn lúc cấp dưới khóa của lệnh cấp (`judgePurchase`); DTO một schema `purchase { reason? }`, response `purchase { kind, reason, purchasedAt } | null`.

## CÂU HỎI

(chưa có)

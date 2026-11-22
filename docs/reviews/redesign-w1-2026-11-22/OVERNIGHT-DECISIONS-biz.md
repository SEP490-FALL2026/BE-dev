# OVERNIGHT-DECISIONS — Đợt 1 thiết kế lại, làn `biz`

Các quyết định tự chủ trong lúc triển khai theo nguyên tắc ưu tiên: SPEC → sổ QĐ → BRD → code/test hiện có → rule repo.

| D-n | Gói | file:line | Câu hỏi | Phương án A/B/C | Chọn + lý do (dẫn SPEC/QĐ/BRD) | Cách đảo lại nếu Owner không duyệt | Mức |
| --- | --- | --------- | ------- | --------------- | ------------------------------ | ---------------------------------- | --- |
| D-1 | P13a | `src/cli/seed/steps/budget.steps.ts:132-145` | Theo W1-20, gửi `POST /budget-versions/:id/submission` chỉ được phép khi `BudgetCycle` đã `LOCKED` (`submissionDeadline < today`). Seed `budget.steps.ts` chạy với ngày thực nên cycle vừa mở đang `OPEN`: khi `version.state === 'DRAFT'`, seed nên xử lý thế nào? | A) Bỏ qua `sendVersion` khi `GET /budget-cycles/:year` có `status !== 'LOCKED'`, giữ draft như `demo.steps.ts:150-155`; B) Để seed gọi `sendVersion` và fail với `409 BUDGET_CYCLE.NOT_LOCKED`; C) Ép `submissionDeadline` về quá khứ trong seed. | Chọn **A**: đúng nghiệp vụ `W1-20` (không gian lận deadline trong seed chuẩn, giữ an toàn idempotent giống `demo.steps.ts:150-155`), sửa gọn tại `versionTurn`, dễ kiểm bằng unit spec. | Xóa check `cycle.status !== 'LOCKED'` trong `budget.steps.ts` và xóa mock tương ứng ở `budget.steps.spec.ts`. | cần Owner |

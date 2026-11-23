# PROGRESS — Đợt 1 thiết kế lại, làn `tech` (`fix/redesign-w1-tech — Bảo`)

Tracker sống qua compact context. Sonnet đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp:** đọc lại `SKILL.md` của process skill, TDD skill, `superpowers:verification-before-completion`; đọc lại SPEC/PLAN của gói kế (SONNET-PROMPT mục 0).
- **Đã chốt (SPEC mục 9), không hỏi lại:** W1-Q1 khóa tác vụ → Request + vòng lặp nhiều seat sắp theo (`subscriptionId`, `assignmentId`) · W1-Q2 `expectedUpdatedAt` bắt buộc khi có `purchasedQuantity` · W1-Q3 Request nhóm chỉ test lối ra · W1-Q4 unique biểu thức chỉ `purchase_invoices`, `invoices` chỉ đổi câu kiểm · W1-Q5 route IT mở lại + cờ dashboard, lượt quét thôi tự mở lại · W1-Q6 khoản 01/01 _Dùng lâu dài_ mọi năm = 12 × giá lúc duyệt · G-15 giữ 422 (+ `FAILED`, `details`).
- **Nền:** nhánh tách từ `origin/dev` mới nhất. Chỉ sửa file của gói làn mình. Được push nhánh làn; không merge, không deploy, không co-author.

## Gói

| Gói | Mục                        | Trạng thái | sha | Lệnh kiểm + kết quả | FIX-TEST thêm | Ghi chú / chưa kiểm được |
| --- | -------------------------- | ---------- | --- | ------------------- | ------------- | ------------------------ |
| P2  | W1-10, W1-04, W1-08, W1-09 | chuyển làn biz | — | Owner 23/11: làn `biz` làm P2 trực tiếp trên `int/redesign-w1` (commit `6d5af60f`) | — | Không làm ở làn tech. |
| P3  | W1-02                      | chuyển làn biz | — | Owner 23/11: làn `biz` làm P3 (commit `5c357c80` trên `int/redesign-w1`) | — | Không làm ở làn tech. |
| P4  | W1-05, W1-06               | xong | 911e3b65 | typecheck, lint, arch:check, test:gates (335) xanh; `pnpm test -- src/modules/budgets/seat-month` 39 pass | — | Seat đọc trong tx sau `lockMonthOf` qua `SeatMonthSeatsService`; `onlyMissing` kiểm lại dấu sau khóa; cặp (CC, năm) có commitment `attachedVersionId = null` không vào `watch` và không khóa CC-year. Commitment nạp qua `lockById` (hàng cũ đã áp) không mang `attachedVersionId` nên chưa loại được — chưa kiểm được. I mới `seat-month-stale-snapshot` viết, chưa chạy (cần DB). Chưa làm P2 nên chưa kiểm thứ tự khóa theo bảng SPEC mục 4 |
| P5  | W1-07                      | xong | 5cdc4610 | `pnpm test -- src/modules/identity-access/profile` 18 pass | — | `listDuePurges` không khóa, xóa object ngoài tx, `markPurged` `updateMany` trong tx riêng, lỗi log bằng `describeForOperator`; `claimPurges` bỏ |
| P6  | W1-16                      | xong | 69174ca1 | `pnpm test -- src/modules/requests/spend-approval` 41 pass; `openapi.json` đổi 5 hunk đúng chủ đích | — | `RETRYABLE`/`TRANSIENT_FAILURE`/`ALREADY_DECIDED`; kiểm bản ghi quyết của bước chi gần nhất qua `SpendDecisionRepo.decisionOfLatestStep`. I gửi lại lô viết trong `spend-approval-batch.integration-spec.ts`, chưa chạy |
| P12 | W1-15                      | xong | f7c971e7 | mapper + 5 service spec: 30 pass | — | Payload thêm `timeZone` (6 chỗ ghi, đọc `getOrganization(tx)`), mapper định dạng `dd/MM/yyyy HH:mm`, mặc định `Asia/Ho_Chi_Minh`, bản EN có `(GMT+7)`; audit giữ ISO |
| P16 | W1-27                      | xong | f23a1884 | `pnpm prisma:validate` xanh; `migration-order` gate xanh; spec repo 4 pass | — | Migration `20261123100000_purchase_invoice_number_normalized` viết tay (kiểm trùng → tạo index → bỏ index cũ); chưa áp lên DB, chưa kiểm drift DB-16. Câu `SELECT` kiểm trùng nằm ở SPEC W1-27 để Owner chạy trên DB demo trước deploy |
| P18 | chốt đợt                   | xong (phần tech) | — | typecheck, lint, format:check, arch:check, arch:docs:check, test:gates (335) xanh; unit toàn bộ 8293 pass, 2 fail có từ trước (xem ghi chú); `openapi.json` sinh lại, 5 hunk đúng chủ đích | — | `openapi.json`, `docs/generated/module-graph.md`, module card budgets/requests, tracker cập nhật trong commit P18 |

Trạng thái: `chưa` · `đang làm` · `xong` · `dừng hỏi`.

## Bàn giao cho làn biz (điểm gọi cần `tx` nằm trong file của làn biz)

| File:line | Việc | Gói biz liên quan |
| --------- | ---- | ----------------- |

## Ghi chú lượt này

- Làm P4 → P5 → P6 → P12 → P16 (5 gói của làn tech sau khi Owner chuyển P2, P3 sang làn biz ngày 23/11). Nhánh `fix/redesign-w1-tech` tách từ `dev`, đã commit từng gói, **chưa push**. Lượt đầu có làm P2 nhưng bị trùng với P2 của làn biz trên `int/redesign-w1`, đã gỡ khỏi nhánh (sha `5ec0274a`, chỉ còn trong reflog).
- Cây làm việc có sẵn thay đổi lạ không phải của lượt này: ba file `.env.*.example` bị xóa, thư mục `ut-report/` — không đụng tới.
- Môi trường máy này: `pnpm openapi:export` (ts-node) và `notification-target.recipients.policy.spec.ts` lỗi vì `readdirSync(recursive)` / `require` không thấy thư mục `budgets/review` và `licensing/expiry`; không liên quan tới thay đổi. `openapi.json` được sinh qua jest rồi prettier.
- Gộp với `int/redesign-w1`: P2, P3 của làn biz sửa `decision.service.ts`, `request-facts.service.ts`, `organization-read.api.ts`…; làn tech không đụng các file đó. `openapi.json` cần sinh lại sau khi gộp (`pnpm openapi:export`, hoặc cách jest + prettier ở trên nếu ts-node lỗi).
- `pnpm rules:check` còn 2 lỗi link tới `.env.bootstrap.example`, `.env.seed.local.example` (do hai file đó đã bị xóa từ trước).

## Điểm dừng hỏi đang mở

| Gói | `file:line` | Câu hỏi | Lựa chọn / khuyến nghị |
| --- | ----------- | ------- | ---------------------- |

## CI GitHub

| Lần | Commit | Run | Kết quả từng job |
| --- | ------ | --- | ---------------- |

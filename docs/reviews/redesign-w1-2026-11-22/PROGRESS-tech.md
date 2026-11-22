# PROGRESS — Đợt 1 thiết kế lại, làn `tech` (`fix/redesign-w1-tech — Bảo`)

Tracker sống qua compact context. Sonnet đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp:** đọc lại `SKILL.md` của process skill, TDD skill, `superpowers:verification-before-completion`; đọc lại SPEC/PLAN của gói kế (SONNET-PROMPT mục 0).
- **Đã chốt (SPEC mục 9), không hỏi lại:** W1-Q1 khóa tác vụ → Request + vòng lặp nhiều seat sắp theo (`subscriptionId`, `assignmentId`) · W1-Q2 `expectedUpdatedAt` bắt buộc khi có `purchasedQuantity` · W1-Q3 Request nhóm chỉ test lối ra · W1-Q4 unique biểu thức chỉ `purchase_invoices`, `invoices` chỉ đổi câu kiểm · W1-Q5 route IT mở lại + cờ dashboard, lượt quét thôi tự mở lại · W1-Q6 khoản 01/01 _Dùng lâu dài_ mọi năm = 12 × giá lúc duyệt · G-15 giữ 422 (+ `FAILED`, `details`).
- **Nền:** nhánh tách từ `origin/dev` mới nhất. Chỉ sửa file của gói làn mình. Được push nhánh làn; không merge, không deploy, không co-author.

## Gói

| Gói | Mục                        | Trạng thái | sha | Lệnh kiểm + kết quả | FIX-TEST thêm | Ghi chú / chưa kiểm được |
| --- | -------------------------- | ---------- | --- | ------------------- | ------------- | ------------------------ |
| P2  | W1-10, W1-04, W1-08, W1-09 | chưa       |     |                     |               |                          |
| P3  | W1-02                      | chưa       |     |                     |               |                          |
| P4  | W1-05, W1-06               | chưa       |     |                     |               |                          |
| P5  | W1-07                      | chưa       |     |                     |               |                          |
| P6  | W1-16                      | chưa       |     |                     |               |                          |
| P12 | W1-15                      | chưa       |     |                     |               |                          |
| P16 | W1-27                      | chưa       |     |                     |               |                          |
| P18 | chốt đợt                   | chưa       |     |                     |               |                          |

Trạng thái: `chưa` · `đang làm` · `xong` · `dừng hỏi`.

## Bàn giao cho làn biz (điểm gọi cần `tx` nằm trong file của làn biz)

| File:line | Việc | Gói biz liên quan |
| --------- | ---- | ----------------- |

## Điểm dừng hỏi đang mở

| Gói | `file:line` | Câu hỏi | Lựa chọn / khuyến nghị |
| --- | ----------- | ------- | ---------------------- |

## CI GitHub

| Lần | Commit | Run | Kết quả từng job |
| --- | ------ | --- | ---------------- |

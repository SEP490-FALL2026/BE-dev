# PROGRESS — Đợt 1 thiết kế lại, làn `biz` (`fix/redesign-w1-biz — Owner`)

Tracker sống qua compact context. Sonnet đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp:** đọc lại `SKILL.md` của process skill, TDD skill, `superpowers:verification-before-completion`; đọc lại SPEC/PLAN của gói kế (SONNET-PROMPT mục 0).
- **Đã chốt (SPEC mục 9), không hỏi lại:** W1-Q1 khóa tác vụ → Request + vòng lặp nhiều seat sắp theo (`subscriptionId`, `assignmentId`) · W1-Q2 `expectedUpdatedAt` bắt buộc khi có `purchasedQuantity` · W1-Q3 Request nhóm chỉ test lối ra · W1-Q4 unique biểu thức chỉ `purchase_invoices`, `invoices` chỉ đổi câu kiểm · W1-Q5 route IT mở lại + cờ dashboard, lượt quét thôi tự mở lại · W1-Q6 khoản 01/01 _Dùng lâu dài_ mọi năm = 12 × giá lúc duyệt · G-15 giữ 422 (+ `FAILED`, `details`).
- **Nền:** nhánh tách từ `origin/dev` mới nhất. Chỉ sửa file của gói làn mình. Được push nhánh làn; không merge, không deploy, không co-author.

## Gói

| Gói  | Mục                    | Trạng thái | sha | Lệnh kiểm + kết quả | FIX-TEST thêm | Ghi chú / chưa kiểm được |
| ---- | ---------------------- | ---------- | --- | ------------------- | ------------- | ------------------------ |
| P1   | W1-01, W1-26           | xong       | e95991a3 | `tsc` 0; `eslint` 0; `depcruise` 0; `check-rules` 0; `jest.gates` 17/17 (335); `export-openapi` +7/-6; `jest` 15/15 (242) | `offboarding-departure.integration-spec.ts` (`lockAgain`) | Đã viết 2 I-test (`offboarding-revocation-existing-task.integration-spec.ts`, `role-duties.integration-spec.ts`); chưa chạy I/H tại máy (đợi CI) |
| P7   | W1-11                  | chưa       |     |                     |               |                          |
| P8   | W1-12, W1-13           | chưa       |     |                     |               |                          |
| P9   | W1-14, W1-03           | chưa       |     |                     |               |                          |
| P10  | W1-19                  | chưa       |     |                     |               |                          |
| P11  | W1-18                  | xong       |     | `tsc` 0; `eslint` 0; `depcruise` 0; `check-rules` 0; `jest.gates` 17/17 (335); `export-openapi` 0 diff; `jest` 2/2 (20) | `ghost-seat-g2-reclaim.integration-spec.ts` (`KPI-5 (DA6-39)`) | Đã cập nhật unit `ghost-seat-state.policy.spec.ts`; `ghost-seat-g2-reclaim` chạy trên CI |
| P13a | W1-20, W1-22           | chưa       |     |                     |               |                          |
| P13b | W1-23                  | chưa       |     |                     |               |                          |
| P14  | W1-21                  | chưa       |     |                     |               |                          |
| P15a | W1-24                  | chưa       |     |                     |               |                          |
| P15b | W1-25                  | chưa       |     |                     |               |                          |
| P17a | W1-17 (a)–(c), (f)–(h) | chưa       |     |                     |               |                          |
| P17b | W1-17 (d), (e), (i)    | chưa       |     |                     |               |                          |
| P18  | chốt đợt               | chưa       |     |                     |               |                          |

Trạng thái: `chưa` · `đang làm` · `xong` · `dừng hỏi`.

## Ánh xạ trạng thái W1-17 (điền trước P17a)

| Trạng thái trong code | Dòng SPEC W1-17 | Đường đổi |
| --------------------- | --------------- | --------- |

## Điểm dừng hỏi đang mở

| Gói | `file:line` | Câu hỏi | Lựa chọn / khuyến nghị |
| --- | ----------- | ------- | ---------------------- |

## CI GitHub

| Lần | Commit | Run | Kết quả từng job |
| --- | ------ | --- | ---------------- |

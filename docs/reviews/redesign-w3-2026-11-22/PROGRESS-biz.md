# PROGRESS — Đợt 3 thiết kế lại, làn `biz` (làm thẳng trên `int/redesign-w3` — Owner)

Tracker sống qua compact context. Người code đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp:** process skill, TDD skill, `superpowers:verification-before-completion`; đọc lại SPEC phần của
  gói và PLAN mục gói (CODE-PROMPT mục 0). Đọc lại **LUẬT CỨNG** của CODE-PROMPT.
- **Đã chốt (SPEC §13 + dòng `Owner đã chốt:`), không hỏi lại:** W3-Q1 A · Q-A bỏ `ROLE_RIGHT` · Q-B giữ mua kỳ sau · Q-C dòng cũ đóng tại ngày
  kết thúc kỳ · Q-D một thông báo admin workspace · Q-E ngưỡng so tiền hàng · Q-F _Bị khóa tới_ kỳ sau sau hạn chót · Q-G ba luật số · QĐ-118d/f/l.
- **Ví dụ số của SPEC là ca kiểm bắt buộc** — mỗi bảng một `it.each`, đúng tới đồng; mỗi luật tiền ca biên + ca diệt đột biến (SPEC §11).
- **Nền:** `origin/dev` có đợt 1 **và đợt 2** (lệnh kiểm ở CODE-PROMPT §1). Gói có điểm gộp chỉ làm sau khi được báo (PLAN G1…G8).
- **Làn biz sở hữu:** luật tiền, sổ số seat, mua seat, điểm điều chỉnh, `K1`, tiền `K4`, ghost seat, job, thông báo, `docs/rules/security-jobs.md`,
  bảng khóa ở `docs/rules/database-business.md`. **Không** sửa `prisma/`, migration, seed, module card (ghi _Bàn giao_).

## Gói

| Gói  | Mục                                       | Trạng thái | sha | Lệnh kiểm + kết quả | FIX-TEST thêm | Ghi chú / chưa kiểm được |
| ---- | ----------------------------------------- | ---------- | --- | ------------------- | ------------- | ------------------------ |
| P2   | W3-02 (biz)                               | chưa       |     |                     |               |                          |
| P4   | W3-07                                     | chưa       |     |                     |               |                          |
| P5   | W3-04, W3-06, W3-01 (`unallocated`)       | chưa       |     |                     |               |                          |
| P6   | W3-05                                     | chưa       |     |                     |               |                          |
| P7   | W3-08                                     | chưa       |     |                     |               |                          |
| P8   | W3-09                                     | chưa       |     |                     |               |                          |
| P10  | W3-11 (biz), W3-12, W3-14, W3-03 (xóa)    | chưa       |     |                     |               |                          |
| P13a | W3-17                                     | chưa       |     |                     |               |                          |
| P13b | W3-23                                     | chưa       |     |                     |               |                          |
| P16a | W3-16, W3-15 (chọn dòng), W3-18 (lối tắt) | chưa       |     |                     |               |                          |
| P16b | W3-18, W3-20                              | chưa       |     |                     |               |                          |
| P17  | W3-19                                     | chưa       |     |                     |               |                          |
| P18  | W3-21                                     | chưa       |     |                     |               |                          |
| P19  | W3-22                                     | chưa       |     |                     |               |                          |
| P20  | W3-24 (biz), W3-25, W3-26                 | chưa       |     |                     |               |                          |
| P23  | chốt đợt (rule, bảng khóa gộp)            | chưa       |     |                     |               |                          |

Trạng thái: `chưa` · `đang làm` · `xong` (chỉ sau khi đối chiếu từng tiêu chí — LUẬT CỨNG 6) · `dừng hỏi`.

## Tự quyết

| Gói | Điểm | Chọn | Vì sao | File |
| --- | ---- | ---- | ------ | ---- |

## Bàn giao cho làn tech (seed, module card, repo cần thêm)

| Gói biz | Việc | Gói tech |
| ------- | ---- | -------- |

## CI GitHub

| Commit | Link run | quality | http | integration | timing | serial | e2e-smoke | Ghi chú |
| ------ | -------- | ------- | ---- | ----------- | ------ | ------ | --------- | ------- |

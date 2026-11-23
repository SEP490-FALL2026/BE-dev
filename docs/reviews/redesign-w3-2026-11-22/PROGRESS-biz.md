# PROGRESS — Đợt 3 thiết kế lại, làn `biz` (`feat/redesign-w3-biz` — Owner)

Tracker sống qua compact context. Người code đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp:** process skill, TDD skill, `superpowers:verification-before-completion`; đọc lại SPEC phần của
  gói và PLAN mục gói (CODE-PROMPT mục 0).
- **Đã chốt (SPEC §11), không hỏi lại:** tiềm năng = một kỳ cam kết từ ngày sớm nhất giảm được · thực = mốc seat cuối kỳ cũ × giá cũ, từng
  dòng, ghi khi Finance xác nhận · ngưỡng 5 % mọi nguyên nhân · license dư `K4` ghi một lần, cấp lần đầu phòng nhận chịu · hạn hóa đơn lần
  nâng 5 ngày làm việc / không / 95 ngày · cổng admin `QĐ-117e` · mua n seat + lối tắt n = 1 · W3-Q1 mặc định **A** (chia theo chi phí thực
  chịu / số license).
- **Ví dụ số của SPEC là ca kiểm bắt buộc** — mỗi bảng tiêu chí một `it.each`, đúng tới đồng.
- **Làn biz sở hữu:** luật tiền, sổ số seat, mua seat, điểm điều chỉnh, `K1`, tiền `K4`, ghost seat, job, `docs/rules/security-jobs.md`.
  **Không** sửa `prisma/`, migration, seed, module card (ghi _Bàn giao_).
- **Nền:** nhánh từ `origin/dev` có đợt 1. Gói phụ thuộc làn tech chỉ làm sau điểm gộp (PLAN G1…G7).

## Gói

| Gói | Mục                                    | Trạng thái | sha | Lệnh kiểm + kết quả | FIX-TEST thêm | Ghi chú / chưa kiểm được |
| --- | -------------------------------------- | ---------- | --- | ------------------- | ------------- | ------------------------ |
| P2  | W3-02 (biz)                            | chưa       |     |                     |               |                          |
| P4  | W3-07                                  | chưa       |     |                     |               |                          |
| P5  | W3-04, W3-06                           | chưa       |     |                     |               |                          |
| P6  | W3-05                                  | chưa       |     |                     |               |                          |
| P7  | W3-08                                  | chưa       |     |                     |               |                          |
| P8  | W3-09                                  | chưa       |     |                     |               |                          |
| P10 | W3-11 (biz), W3-12, W3-14, W3-03 (xóa) | chưa       |     |                     |               |                          |
| P13 | W3-17, W3-23                           | chưa       |     |                     |               |                          |
| P16 | W3-16 (biz), W3-18, W3-20              | chưa       |     |                     |               |                          |
| P17 | W3-19                                  | chưa       |     |                     |               |                          |
| P18 | W3-21                                  | chưa       |     |                     |               |                          |
| P19 | W3-22                                  | chưa       |     |                     |               |                          |
| P20 | W3-24 (biz), W3-25, W3-26              | chưa       |     |                     |               |                          |
| P23 | chốt đợt                               | chưa       |     |                     |               |                          |

Trạng thái: `chưa` · `đang làm` · `xong` · `dừng hỏi`.

## Tự quyết

| Gói | Điểm | Chọn | Vì sao | File |
| --- | ---- | ---- | ------ | ---- |

## Bàn giao cho làn tech (seed, module card, repo cần thêm)

| Gói biz | Việc | Gói tech |
| ------- | ---- | -------- |

## CI GitHub

| Commit | Link run | quality | http | integration | timing | serial | e2e-smoke | Ghi chú |
| ------ | -------- | ------- | ---- | ----------- | ------ | ------ | --------- | ------- |

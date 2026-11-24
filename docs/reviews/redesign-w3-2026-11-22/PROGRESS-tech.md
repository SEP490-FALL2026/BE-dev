# PROGRESS — Đợt 3 thiết kế lại, làn `tech` (`feat/redesign-w3-tech` — Bảo)

Tracker sống qua compact context. Người code đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp:** process skill, TDD skill, `superpowers:verification-before-completion`; đọc lại SPEC phần của
  gói và PLAN mục gói (CODE-PROMPT mục 0). Đọc lại **LUẬT CỨNG** của CODE-PROMPT.
- **Đã chốt (SPEC §13 + dòng `Owner đã chốt:`), không hỏi lại:** W3-Q1 A · Q-A bỏ `ROLE_RIGHT` · Q-B giữ mua kỳ sau · Q-C dòng cũ đóng tại ngày
  kết thúc kỳ · Q-D một thông báo admin workspace · Q-E ngưỡng so tiền hàng · Q-F _Bị khóa tới_ kỳ sau sau hạn chót · Q-G ba luật số · QĐ-118d/f/l.
- **Ví dụ số của SPEC là ca kiểm bắt buộc** — mỗi bảng một `it.each`, đúng tới đồng; mỗi luật tiền ca biên + ca diệt đột biến (SPEC §11).
- **Nền:** `origin/dev` có đợt 1 **và đợt 2** (lệnh kiểm ở CODE-PROMPT §1). Gói có điểm gộp chỉ làm sau khi được báo (PLAN G1…G8).
- **Làn tech sở hữu:** `prisma/`, migration, repo bảng mới, route CRUD/người phụ trách, P20b, seed, module card, generator. File chung chỉ thêm
  dòng: PLAN mục _Hai làn_. Push nhánh làn; không merge, không deploy, không co-author.

## Gói

| Gói  | Mục                                           | Trạng thái | sha | Lệnh kiểm + kết quả | FIX-TEST thêm | Ghi chú / chưa kiểm được |
| ---- | --------------------------------------------- | ---------- | --- | ------------------- | ------------- | ------------------------ |
| P1   | W3-01, W3-02 (tech), W3-03 (thông báo) — M1   | chưa       |     |                     |               |                          |
| P3   | M2, M3, repo tháng cam kết, tham số           | chưa       |     |                     |               |                          |
| P9   | W3-10, W3-11 (tech), W3-13, W3-14 (khóa) — M4 | chưa       |     |                     |               |                          |
| P11  | M5a, M5, repo dòng/sổ/lần mua/mục tiêu        | chưa       |     |                     |               |                          |
| P12a | M6 (lô, 6 hàm), repo lô/khóa/phí              | chưa       |     |                     |               |                          |
| P20b | chuyển code đợt 2 sang lô (K-B3)              | chưa       |     |                     |               |                          |
| P12b | M7, repo phân bổ, cột `K1`                    | chưa       |     |                     |               |                          |
| P14  | W3-24 (route lô, người phụ trách)             | chưa       |     |                     |               |                          |
| P15  | W3-15 (route dòng)                            | chưa       |     |                     |               |                          |
| P21  | W3-27                                         | chưa       |     |                     |               |                          |
| P22  | W3-28 (seed B3)                               | chưa       |     |                     |               |                          |
| P23  | chốt đợt                                      | chưa       |     |                     |               |                          |

Trạng thái: `chưa` · `đang làm` · `xong` (chỉ sau khi đối chiếu từng tiêu chí — LUẬT CỨNG 6) · `dừng hỏi`.

## Câu kiểm trước của migration (Owner chạy trên DB demo trước deploy)

| Migration | Câu `SELECT` | Kết quả Owner |
| --------- | ------------ | ------------- |

## Tự quyết

| Gói | Điểm | Chọn | Vì sao | File |
| --- | ---- | ---- | ------ | ---- |

## Bàn giao cho làn biz

| Gói tech | Việc / chữ ký repo đã có | Gói biz dùng |
| -------- | ------------------------ | ------------ |

## CI GitHub

| Commit | Link run | quality | http | integration | timing | serial | e2e-smoke | Ghi chú |
| ------ | -------- | ------- | ---- | ----------- | ------ | ------ | --------- | ------- |

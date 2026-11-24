# PROGRESS — Đợt 3 thiết kế lại, làn `tech` (`feat/redesign-w3-tech` — Bảo)

Tracker sống qua compact context. Người code đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp:** process skill, TDD skill, `superpowers:verification-before-completion`; đọc lại SPEC phần của
  gói và PLAN mục gói (CODE-PROMPT mục 0). Đọc lại **LUẬT CỨNG** của CODE-PROMPT.
- **Đã chốt (SPEC §13 + dòng `Owner đã chốt:`), không hỏi lại:** W3-Q1 A · Q-A bỏ `ROLE_RIGHT` · Q-B giữ mua kỳ sau · Q-C dòng cũ đóng tại ngày
  kết thúc kỳ · Q-D một thông báo admin workspace · Q-E ngưỡng so tiền hàng · Q-F _Bị khóa tới_ kỳ sau sau hạn chót · Q-G ba luật số · QĐ-118d/f/l.
- **Ví dụ số của SPEC là ca kiểm bắt buộc** — mỗi bảng một `it.each`, đúng tới đồng; mỗi luật tiền ca biên + ca diệt đột biến (SPEC §11).
- **Nền:** `origin/dev` có đợt 1 **và đợt 2** (lệnh kiểm ở CODE-PROMPT §1). Hai làn chạy song song (PLAN bản 2.4): `tech` kéo `int` về trước mỗi gói; chỉ đẩy lên `int` ở cửa C1/C2 (PLAN _Cửa_); gói có "… ở int" ở cột _Phụ thuộc_ chỉ làm khi gói đó đã ở `int`, chưa thì làm việc lấp.
- **Làn tech sở hữu:** `prisma/`, migration **của B2, B3** (B1 = làn biz), repo bảng mới, route CRUD/người phụ trách, P20b, seed B2/B3, module card, generator; lúc chờ: Docker cho PR (chỉ sửa test/fixture). File chung chỉ thêm
  dòng: PLAN mục _Hai làn_. Push nhánh làn; không merge, không deploy, không co-author.

## Gói

| Gói  | Mục                                           | Trạng thái | sha | Lệnh kiểm + kết quả | FIX-TEST thêm | Ghi chú / chưa kiểm được |
| ---- | --------------------------------------------- | ---------- | --- | ------------------- | ------------- | ------------------------ |
| P9a  | W3-10, W3-13 — M4, module workspace           | chưa       |     |                     |               |                          |
| P9b  | W3-11 (tech), W3-14 (khóa), W3-10 (gói), seed B2 | chưa       |     |                     |               |                          |
| P11  | M5a, M5, repo dòng/sổ/lần mua/mục tiêu        | chưa       |     |                     |               |                          |
| P12a | M6 (lô, 6 hàm), repo lô/khóa/phí              | chưa       |     |                     |               |                          |
| P20b | chuyển code đợt 2 sang lô (K-B3)              | chưa       |     |                     |               |                          |
| P12b | M7, repo phân bổ, cột `K1`                    | chưa       |     |                     |               |                          |
| P21  | W3-27                                         | chưa       |     |                     |               |                          |
| P14  | W3-24 (route lô, người phụ trách)             | chưa       |     |                     |               |                          |
| P15  | W3-15 (route dòng)                            | chưa       |     |                     |               |                          |
| P22a | W3-28 seed lô/K1/dòng khi khai                | chưa       |     |                     |               |                          |
| P22b | W3-28 seed mua seat/bậc/gia hạn               | chưa       |     |                     |               |                          |
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

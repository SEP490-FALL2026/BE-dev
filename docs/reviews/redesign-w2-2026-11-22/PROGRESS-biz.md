# PROGRESS — Đợt 2 thiết kế lại, làn `biz` (thẳng trên `int/redesign-w2` — Owner)

Tracker sống qua compact context. Người code đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối
mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp:** đọc lại `SKILL.md` của process skill, TDD skill, `superpowers:verification-before-completion`;
  đọc lại SPEC/PLAN của gói kế (CODE-PROMPT mục 0).
- **Chế độ tự quyết:** câu hỏi nhỏ ⟹ chọn theo căn cứ, ghi `OVERNIGHT-DECISIONS-biz.md`; chỉ dừng ở CODE-PROMPT mục 5.
- **Đã chốt:** SPEC mục 13 (W2-D1 → W2-D18, 13.3 quyết định Owner + QĐ-118) và dòng `Owner đã chốt:` của CODE-PROMPT. Không hỏi
  lại. Q7 → Q9 đã chốt (SPEC §14).
- **Nền:** làm thẳng trên `int/redesign-w2` (Owner tạo từ `dev` mới nhất, có `4e029dbd` làm tổ tiên). Pha B chỉ sau khi Owner đã
  merge pha 1 của làn `tech` vào `int/redesign-w2` và đã `git pull --ff-only`. Không sửa `prisma/**`, `src/cli/seed/**` (của làn
  `tech`). Commit bằng git identity của Owner; push `int/redesign-w2` được; không merge vào `dev`/`main`, không deploy, không
  co-author. Báo lỗi quyền gắn máy (W2-24) **không** làm (đợt 7).

## Gói

| Gói   | Mục                                   | Trạng thái | sha | Lệnh kiểm + kết quả | FIX-TEST thêm | D-n | Ghi chú / chưa kiểm được |
| ----- | ------------------------------------- | ---------- | --- | ------------------- | ------------- | --- | ------------------------ |
| B0    | policy thuần (pha A)                  | chưa       |     |                     |               |     |                          |
| B1    | W2-03, W2-05 + đăng ký provider T2/T5 | chưa       |     |                     |               |     |                          |
| B2a-1 | W2-06, W2-08                          | chưa       |     |                     |               |     |                          |
| B2a-2 | W2-09                                 | chưa       |     |                     |               |     |                          |
| B2b   | W2-07                                 | chưa       |     |                     |               |     |                          |
| B3a-1 | W2-19 licensing                       | chưa       |     |                     |               |     |                          |
| B3a-2 | W2-19 devices, W2-03 (b)              | chưa       |     |                     |               |     |                          |
| B3b   | W2-20, W2-22                          | chưa       |     |                     |               |     |                          |
| B4    | W2-10, W2-11, W2-12                   | chưa       |     |                     |               |     |                          |
| B10a  | W2-27 (a), H1                         | chưa       |     |                     |               |     |                          |
| B5a   | W2-14 sinh/đổi hạn/hủy, E4            | chưa       |     |                     |               |     |                          |
| B5b   | W2-14 danh sách/hoàn tất, W2-15       | chưa       |     |                     |               |     |                          |
| B5c   | W2-14 quá hạn/chờ, W2-26 (mã)         | chưa       |     |                     |               |     |                          |
| B6    | W2-18 requests, S-4 grant             | chưa       |     |                     |               |     |                          |
| B7    | W2-13                                 | chưa       |     |                     |               |     |                          |
| B8    | W2-23                                 | chưa       |     |                     |               |     |                          |
| B10b  | W2-27 H2–H4                           | chưa       |     |                     |               |     |                          |
| B10c  | W2-27 H5–H7                           | chưa       |     |                     |               |     |                          |
| B10d  | W2-27 (c), W2-26 (mã)                 | chưa       |     |                     |               |     |                          |
| B10e  | W2-27 H9–H11 (Q8)                     | chưa       |     |                     |               |     |                          |
| B10f  | W2-27 H12, H13 (Q8)                   | chưa       |     |                     |               |     |                          |
| B10g  | W2-27 H15 (Q8)                        | chưa       |     |                     |               |     |                          |
| B11   | W2-28 (RC-9)                          | chưa       |     |                     |               |     |                          |
| B9    | chốt làn, W2-26 (tài liệu)            | chưa       |     |                     |               |     |                          |

Trạng thái: `chưa` · `đang làm` · `xong` · `dừng hỏi` · `bị chặn`.

## Phụ thuộc đợt 1 (SPEC mục 12) — kết quả kiểm lúc tách nhánh

| Dòng | Kết quả | Ghi chú |
| ---- | ------- | ------- |

## Bàn giao cho làn tech (file của làn tech cần sửa)

| Gói | File | Việc |
| --- | ---- | ---- |

## Bị chặn

## CI GitHub

| Lần | Commit | Link run | Kết quả từng job |
| --- | ------ | -------- | ---------------- |

## Dừng ở đâu

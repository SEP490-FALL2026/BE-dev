# PROGRESS — Đợt 2 thiết kế lại, làn `tech` (`feat/redesign-w2-tech` — Bảo)

Tracker sống qua compact context. Người code đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối
mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp:** đọc lại `SKILL.md` của process skill, TDD skill, `superpowers:verification-before-completion`;
  đọc lại SPEC/PLAN của gói kế (CODE-PROMPT mục 0).
- **Chế độ tự quyết:** câu hỏi nhỏ ⟹ chọn theo căn cứ, ghi `OVERNIGHT-DECISIONS-tech.md`; chỉ dừng ở CODE-PROMPT mục 5.
- **Đã chốt:** SPEC mục 13 (W2-D1 → W2-D18, 13.3 quyết định Owner + QĐ-118) và dòng `Owner đã chốt:` của CODE-PROMPT. Không hỏi
  lại. Q7 → Q9 đã chốt (SPEC §14).
- **Nền:** nhánh của Bảo `feat/redesign-w2-tech` tách từ `origin/dev` mới nhất (có `4e029dbd` làm tổ tiên — đợt 1 squash, không
  tìm merge commit; có thư mục việc đợt 2). Chỉ sửa file của gói làn mình; **không** sửa `devices.module.ts` (S-29, ghi _Bàn
  giao_ cho B1). Commit bằng git identity của Bảo (email GitHub của Bảo); push nhánh làn được; không merge, không deploy, không
  co-author. Pha 2 (T6, T7) chỉ sau khi làn `biz` báo B9 xong trên `int/redesign-w2`.

## Gói

| Gói | Mục                                    | Trạng thái | sha | Lệnh kiểm + kết quả | FIX-TEST thêm | D-n | Ghi chú / chưa kiểm được |
| --- | -------------------------------------- | ---------- | --- | ------------------- | ------------- | --- | ------------------------ |
| T1  | W2-01 (4 migration)                    | chưa       |     |                     |               |     |                          |
| T2  | W2-02                                  | chưa       |     |                     |               |     |                          |
| T3  | W2-17, W2-18 catalog, `installLimitOf` | chưa       |     |                     |               |     |                          |
| T3b | W2-27 H14, H16 (Q7)                    | chưa       |     |                     |               |     |                          |
| T4  | W2-21                                  | chưa       |     |                     |               |     |                          |
| T5  | W2-04                                  | chưa       |     |                     |               |     |                          |
| T6  | W2-25                                  | chưa       |     |                     |               |     |                          |
| T7  | chốt làn                               | chưa       |     |                     |               |     |                          |

Trạng thái: `chưa` · `đang làm` · `xong` · `dừng hỏi` · `bị chặn`.

## Phụ thuộc đợt 1 (SPEC mục 12) — kết quả kiểm lúc tách nhánh

| Dòng | Kết quả | Ghi chú |
| ---- | ------- | ------- |

## Bàn giao cho làn biz (nội dung module card, lỗi cần ánh xạ HTTP, file của làn biz cần sửa)

| Gói | File | Việc |
| --- | ---- | ---- |

## Bị chặn

## CI GitHub

| Lần | Commit | Link run | Kết quả từng job |
| --- | ------ | -------- | ---------------- |

## Dừng ở đâu

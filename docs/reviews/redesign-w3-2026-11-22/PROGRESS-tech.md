# PROGRESS — Đợt 3 thiết kế lại, làn `tech` (`feat/redesign-w3-tech` — Bảo)

Tracker sống qua compact context. Người code đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp:** process skill, TDD skill, `superpowers:verification-before-completion`; đọc lại SPEC phần của
  gói và PLAN mục gói (CODE-PROMPT mục 0).
- **Đã chốt (SPEC §11), không hỏi lại:** route cũ giữ, không `deprecated` · `purchasedQuantity` ở `subscriptionUpdate` bị từ chối từ B3 ·
  mở sổ `INITIAL` tại ngày chuyển đổi · trùng (workspace, gói) chặn mọi lúc, migration gặp trùng thì dừng · lô khóa ở `catalog/license-lot/` ·
  kỳ thuê bao = một bản ghi, dòng theo kỳ · W3-Q1 mặc định A.
- **Làn tech sở hữu:** `prisma/`, migration, repo bảng mới, route CRUD, seed, module card. File chung chỉ thêm dòng: PLAN mục _Hai làn_.
- **Nền:** nhánh từ `origin/dev` có đợt 1. Push nhánh làn; không merge, không deploy, không co-author.

## Gói

| Gói | Mục                                    | Trạng thái | sha | Lệnh kiểm + kết quả | FIX-TEST thêm | Ghi chú / chưa kiểm được |
| --- | -------------------------------------- | ---------- | --- | ------------------- | ------------- | ------------------------ |
| P1  | W3-01, W3-02 (tech), W3-03 (thông báo) | chưa       |     |                     |               |                          |
| P3  | M2, M3, repo tháng cam kết, tham số    | chưa       |     |                     |               |                          |
| P9  | W3-10, W3-11 (tech), W3-13 — M4        | chưa       |     |                     |               |                          |
| P11 | M5, repo dòng/sổ/lần mua/mục tiêu      | chưa       |     |                     |               |                          |
| P12 | M6, M7, repo lô/phí/phân bổ            | chưa       |     |                     |               |                          |
| P14 | W3-24 (route lô)                       | chưa       |     |                     |               |                          |
| P15 | W3-15 (route dòng)                     | chưa       |     |                     |               |                          |
| P21 | W3-27                                  | chưa       |     |                     |               |                          |
| P22 | W3-28 (seed B3)                        | chưa       |     |                     |               |                          |
| P23 | chốt đợt                               | chưa       |     |                     |               |                          |

Trạng thái: `chưa` · `đang làm` · `xong` · `dừng hỏi`.

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

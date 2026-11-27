# PROGRESS — Đợt 4 — Làn N (Neon, orchestrator + subagent song song)

> **Chỉ orchestrator ghi file này** (cả `FIX-TEST-w4.md`, `OVERNIGHT-DECISIONS-biz.md`; gộp trong worktree `D:/FPT/FALL2026/Code/w4-gate`); subagent ghi `pkg/<gói>.md`, orchestrator chép vào đây ở cổng. Trạng thái gói: `chưa` · `đang làm` · `xong-unit` (unit + bộ kiểm nhanh xanh, integration/http **đã viết chưa chạy**) · `xong` (spec của gói xanh trên CI của cổng — LUẬT CỨNG 6, 20) · `dừng hỏi` · `Bàn giao` · `làn B (Bảo)` · `sau gộp 2 làn`.

**Skill-first (CLAUDE.md workspace — giữ qua compact):** mọi lượt bắt đầu bằng Skill Preflight: kiểm skill có sẵn, đọc đủ `SKILL.md` của bộ theo bước (orchestrator: `superpowers:dispatching-parallel-agents` + `superpowers:subagent-driven-development` + `ponytail` full; subagent: `superpowers:executing-plans` + `superpowers:test-driven-development` + `be-quick-check` + `ponytail` full (+ `create-migration` cho `A-DB`); verify: `superpowers:verification-before-completion`); đầu báo cáo liệt kê skill đã đọc và mục đích. Skill không cấp quyền mở rộng phạm vi.

## Cổng 0

| Mục                                   | Giá trị                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `origin/dev` khi tách                 | `86562437c1782313d0beafcb21a869bf0b134037`                                                                                                |
| Đợt 3 ở `dev` (ls-tree 3 dòng)        | có (`20261204000500_w3_final3_request_monthly_price_check`, `license-lot.api.ts`, `seat-ledger.api.ts`)                                   |
| Migration cuối `dev`                  | `20261204000700_w3_audit_lot_source_currency_check`                                                                                       |
| Delta lại (DELTA mục 4)               | 91 file so với `20ae45ee` — khớp `DL-24` (không lệch đổi luật)                                                                            |
| Grep khóa E5 / `@Optional`            | E5 rỗng · `@Optional` chỉ còn 3 file hạ tầng (`prisma.service.ts:26`, `nightly-maintenance.job.ts:67`, `nightly-maintenance.timer.ts:27`) |
| **CI nền** (`dev`) — mốc phân loại nợ | run `46043853099` · https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46043853099 · đang chạy (cập nhật job/test khi hoàn tất)       |
| `feat/redesign-w4`                    | `86562437c1782313d0beafcb21a869bf0b134037`                                                                                                |
| `feat/redesign-w4-lane-n`             | tách từ `feat/redesign-w4`                                                                                                                |

## Bảng gói

| Wave   | Gói        | W4-xx                 | Subagent (phiên/tên) | Nhánh                         | Trạng thái    | sha cuối | Unit (lệnh → pass/fail) | Integration/http (file → CI) | CI cổng (run → kết quả) | FIX-TEST | D-n | Ghi chú                                                        |
| ------ | ---------- | --------------------- | -------------------- | ----------------------------- | ------------- | -------- | ----------------------- | ---------------------------- | ----------------------- | -------- | --- | -------------------------------------------------------------- |
| A      | A-DB       | W4-01, W4-09 (M1, M2) |                      | `feat/redesign-w4-a-db`       | chưa          |          |                         |                              |                         |          |     | Làn N                                                          |
| A      | A-T1       | nền (đặc tả)          | —                    | `feat/redesign-w4-lane-b`     | làn B (Bảo)   |          |                         |                              |                         |          |     | C0 thuộc làn B                                                 |
| A      | A-POL1     | W4-01/02/04/07/09     |                      | `feat/redesign-w4-a-pol1`     | chưa          |          |                         |                              |                         |          |     | Làn N                                                          |
| A      | A-POL2     | W4-12, W4-06          | —                    | `feat/redesign-w4-lane-b`     | làn B (Bảo)   |          |                         |                              |                         |          |     |                                                                |
| cổng A | G-HTTP     | (M-2, kỹ thuật)       | orchestrator         | `feat/redesign-w4-wave-a`     | chưa          |          |                         |                              |                         |          |     | 28 controller → `requests-http.module.ts`; routes.md không đổi |
| B      | B-CORE     | W4-01, W4-04, W4-11   |                      | `feat/redesign-w4-b-core`     | chưa          |          |                         |                              |                         |          |     | Làn N                                                          |
| B      | B-REPLY    | W4-09                 |                      | `feat/redesign-w4-b-reply`    | chưa          |          |                         |                              |                         |          |     | Làn N · Phá vỡ                                                 |
| B1     | B-SUBMIT-R | W4-02 (refactor)      | —                    | `feat/redesign-w4-lane-b`     | làn B (Bảo)   |          |                         |                              |                         |          |     |                                                                |
| B1     | B-NEED-R   | W4-05 (refactor)      | —                    | `feat/redesign-w4-lane-b`     | làn B (Bảo)   |          |                         |                              |                         |          |     |                                                                |
| B2     | B-SPEND-R  | W4-06 (refactor)      | —                    | `feat/redesign-w4-lane-b`     | làn B (Bảo)   |          |                         |                              |                         |          |     |                                                                |
| Nối    | C-SUBMIT   | W4-02, W4-03          | —                    | —                             | sau gộp 2 làn |          |                         |                              |                         |          |     |                                                                |
| Nối    | C-NEED     | W4-05, W4-09 ca C     | —                    | —                             | sau gộp 2 làn |          |                         |                              |                         |          |     |                                                                |
| Nối    | C-SPEND    | W4-06, W4-14 IT       | —                    | —                             | sau gộp 2 làn |          |                         |                              |                         |          |     |                                                                |
| C1     | C-WITHDRAW | W4-08                 |                      | `feat/redesign-w4-c-withdraw` | chưa          |          |                         |                              |                         |          |     | Làn N                                                          |
| C1     | C-BATCH    | W4-07 lô, W4-10       |                      | `feat/redesign-w4-c-batch`    | chưa          |          |                         |                              |                         |          |     | Làn N                                                          |
| C1     | C-CONV     | W4-07, W4-14          |                      | `feat/redesign-w4-c-conv`     | chưa          |          |                         |                              |                         |          |     | Làn N                                                          |
| C1     | C-VIEW     | W4-04, W4-11          |                      | `feat/redesign-w4-c-view`     | chưa          |          |                         |                              |                         |          |     | Làn N                                                          |
| C2     | C-LISTS    | W4-04                 |                      | `feat/redesign-w4-c-lists`    | chưa          |          |                         |                              |                         |          |     | Làn N                                                          |
| Nối    | D-MOBILE   | W4-13                 | —                    | —                             | sau gộp 2 làn |          |                         |                              |                         |          |     |                                                                |
| Nối    | D-SEED     | W4-15                 | —                    | —                             | sau gộp 2 làn |          |                         |                              |                         |          |     |                                                                |
| Nối    | D-DOCS     | W4-16                 | —                    | —                             | sau gộp 2 làn |          |                         |                              |                         |          |     |                                                                |

## Cổng (Làn N)

| Cổng | Nhánh làn                 | Thứ tự gộp (sha merge)                           | Xung đột file gộp đã giải | Bộ kiểm nhanh đầy đủ | CI (run · link) | Test mới đỏ | Hồi quy (xanh nền) | Nợ (đỏ cả nền) | Đóng (ff `feat/redesign-w4-lane-n` sha) |
| ---- | ------------------------- | ------------------------------------------------ | ------------------------- | -------------------- | --------------- | ----------- | ------------------ | -------------- | --------------------------------------- |
| A    | `feat/redesign-w4-wave-a` | A-DB → A-POL1 → G-HTTP                           |                           |                      |                 |             |                    |                |                                         |
| B    | `feat/redesign-w4-wave-b` | B-CORE → B-REPLY                                 |                           |                      |                 |             |                    |                |                                         |
| C    | `feat/redesign-w4-wave-c` | C-WITHDRAW → C-BATCH → C-CONV → C-VIEW → C-LISTS |                           |                      |                 |             |                    |                |                                         |

## CI GitHub (mọi lần chạy)

| Lần | Cổng / lý do | Nhánh | Run id · link                                                                      | Job → kết quả | Test đỏ (tên) | Đỏ trên nền? | Xử lý (gói sửa / FIX-TEST) |
| --- | ------------ | ----- | ---------------------------------------------------------------------------------- | ------------- | ------------- | ------------ | -------------------------- |
| 0   | CI nền       | `dev` | `46043853099` · https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46043853099 | đang chạy     |               | —            | mốc phân loại nợ           |

## Đối chiếu tiêu chí (LUẬT CỨNG 6 — orchestrator tự đọc diff)

| Gói | Ca SPEC (§ / ca) | Test (file · tên) | file:line code | Unit | CI  | Ghi chú |
| --- | ---------------- | ----------------- | -------------- | ---- | --- | ------- |
|     |                  |                   |                |      |     |         |

## Đột biến (SPEC §11.1 — chạy tay một lần)

| Đột biến                                        | Gói     | Ca phải đỏ   | Kết quả (lệnh · đỏ?) | `git restore` + spec xanh lại |
| ----------------------------------------------- | ------- | ------------ | -------------------- | ----------------------------- |
| GH-2 `≥` → `>`                                  | A-POL1  | §7.2 H       |                      |                               |
| đếm mục bị nêu vào GH-2                         | A-POL1  | §7.2 G       |                      |                               |
| bỏ một giá trị `TermRefusal` khỏi enum `reason` | B-CORE  | §7.2 N / dto |                      |                               |
| đòi ghi chú khi không có _Trả về của người_     | B-REPLY | §7.9 D, E    |                      |                               |
| chèn reply khi mục `STOPPED`                    | C-BATCH | §7.10 E      |                      |                               |
| bỏ sắp `position` (lô)                          | C-BATCH | §7.7         |                      |                               |

## Bàn giao (gói cần file ngoài gói / chữ ký lệch / harness)

| Từ gói | Cần gì (file:line) | Ai làm (gói vá / gói nào) | Trạng thái |
| ------ | ------------------ | ------------------------- | ---------- |
|        |                    |                           |            |

## Dừng ở đâu (khi compact / hết context)

- Wave: `Cổng 0` · gói đang chạy: `—` · nhánh/sha: `feat/redesign-w4-lane-n` · việc kế: `mở Wave A (A-DB ‖ A-POL1)`

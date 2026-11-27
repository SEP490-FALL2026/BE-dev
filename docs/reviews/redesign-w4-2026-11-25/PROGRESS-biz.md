# PROGRESS — Đợt 4 (Neon, orchestrator + subagent song song) — MẪU

> Mẫu do điều phối (Opus) tạo 27/11 cùng SPEC/PLAN/CODE-PROMPT bản 3.0. **Chỉ orchestrator ghi file này** (cả `FIX-TEST-w4.md`, `OVERNIGHT-DECISIONS-biz.md`; gộp trong worktree `D:/FPT/FALL2026/Code/w4-gate`); subagent ghi `pkg/<gói>.md` (mẫu cuối file),
> orchestrator chép vào đây ở cổng. Trạng thái gói: `chưa` · `đang làm` · `xong-unit` (unit + bộ kiểm nhanh xanh, integration/http **đã viết chưa chạy**) ·
> `xong` (spec của gói xanh trên CI của cổng — LUẬT CỨNG 6, 20) · `dừng hỏi` · `Bàn giao`.

**Skill-first (CLAUDE.md workspace — giữ qua compact):** mọi lượt bắt đầu bằng Skill Preflight: kiểm skill có sẵn, đọc đủ `SKILL.md` của bộ theo bước
(orchestrator: `superpowers:dispatching-parallel-agents` + `superpowers:subagent-driven-development`; subagent: `superpowers:executing-plans` +
`superpowers:test-driven-development` + `be-quick-check` (+ `create-migration` cho A-DB); verify: `superpowers:verification-before-completion`); đầu báo cáo liệt
kê skill đã đọc và mục đích. Skill không cấp quyền mở rộng phạm vi.

## Cổng 0

| Mục                                   | Giá trị                               |
| ------------------------------------- | ------------------------------------- |
| `origin/dev` khi tách                 | `<sha>`                               |
| Đợt 3 ở `dev` (ls-tree 3 dòng)        | `<có/không>`                          |
| Migration cuối `dev`                  | `<tên>`                               |
| Delta lại (DELTA mục 4)               | `<rỗng / DL-24…>`                     |
| Grep khóa E5 / `@Optional`            | `<rỗng / chỉ prisma.service.ts>`      |
| **CI nền** (`dev`) — mốc phân loại nợ | run `<id>` · `<link>` · job đỏ: `<…>` |
| `feat/redesign-w4`                    | `<sha>`                               |

## Bảng gói

| Wave   | Gói        | W4-xx                 | Subagent (phiên/tên) | Nhánh                         | Trạng thái | sha cuối | Unit (lệnh → pass/fail) | Integration/http (file → CI) | CI cổng (run → kết quả) | FIX-TEST | D-n | Ghi chú                                                        |
| ------ | ---------- | --------------------- | -------------------- | ----------------------------- | ---------- | -------- | ----------------------- | ---------------------------- | ----------------------- | -------- | --- | -------------------------------------------------------------- |
| A      | A-DB       | W4-01, W4-09 (M1, M2) |                      | `feat/redesign-w4-a-db`       | chưa       |          |                         |                              |                         |          |     |                                                                |
| A      | A-T1       | nền (đặc tả)          |                      | `feat/redesign-w4-a-t1`       | chưa       |          |                         |                              |                         |          |     | C0                                                             |
| A      | A-POL1     | W4-01/02/04/07/09     |                      | `feat/redesign-w4-a-pol1`     | chưa       |          |                         |                              |                         |          |     |                                                                |
| A      | A-POL2     | W4-12, W4-06          |                      | `feat/redesign-w4-a-pol2`     | chưa       |          |                         |                              |                         |          |     |                                                                |
| cổng A | G-HTTP     | (M-2, kỹ thuật)       | orchestrator         | `feat/redesign-w4-wave-a`     | chưa       |          |                         |                              |                         |          |     | 28 controller → `requests-http.module.ts`; routes.md không đổi |
| B1     | B-CORE     | W4-01, W4-04, W4-11   |                      | `feat/redesign-w4-b-core`     | chưa       |          |                         |                              |                         |          |     |                                                                |
| B1     | B-REPLY    | W4-09                 |                      | `feat/redesign-w4-b-reply`    | chưa       |          |                         |                              |                         |          |     | Phá vỡ                                                         |
| B1     | B-SUBMIT-R | W4-02 (refactor)      |                      | `feat/redesign-w4-b-submit-r` | chưa       |          |                         |                              |                         |          |     | sau C0                                                         |
| B1     | B-NEED-R   | W4-05 (refactor)      |                      | `feat/redesign-w4-b-need-r`   | chưa       |          |                         |                              |                         |          |     | sau C0                                                         |
| B2     | B-SPEND-R  | W4-06 (refactor)      |                      | `feat/redesign-w4-b-spend-r`  | chưa       |          |                         |                              |                         |          |     | sau C0                                                         |
| C1     | C-SUBMIT   | W4-02, W4-03          |                      | `feat/redesign-w4-c-submit`   | chưa       |          |                         |                              |                         |          |     |                                                                |
| C1     | C-NEED     | W4-05, W4-09 ca C     |                      | `feat/redesign-w4-c-need`     | chưa       |          |                         |                              |                         |          |     |                                                                |
| C1     | C-SPEND    | W4-06, W4-14 IT       |                      | `feat/redesign-w4-c-spend`    | chưa       |          |                         |                              |                         |          |     |                                                                |
| C1     | C-WITHDRAW | W4-08                 |                      | `feat/redesign-w4-c-withdraw` | chưa       |          |                         |                              |                         |          |     |                                                                |
| C2     | C-BATCH    | W4-07 lô, W4-10       |                      | `feat/redesign-w4-c-batch`    | chưa       |          |                         |                              |                         |          |     |                                                                |
| C2     | C-CONV     | W4-07, W4-14          |                      | `feat/redesign-w4-c-conv`     | chưa       |          |                         |                              |                         |          |     |                                                                |
| C2     | C-VIEW     | W4-04, W4-11          |                      | `feat/redesign-w4-c-view`     | chưa       |          |                         |                              |                         |          |     |                                                                |
| C2     | C-LISTS    | W4-04                 |                      | `feat/redesign-w4-c-lists`    | chưa       |          |                         |                              |                         |          |     |                                                                |
| D      | D-MOBILE   | W4-13                 |                      | `feat/redesign-w4-d-mobile`   | chưa       |          |                         |                              |                         |          |     |                                                                |
| D      | D-SEED     | W4-15                 |                      | `feat/redesign-w4-d-seed`     | chưa       |          |                         |                              |                         |          |     |                                                                |
| D      | D-DOCS     | W4-16                 |                      | `feat/redesign-w4-d-docs`     | chưa       |          |                         |                              |                         |          |     |                                                                |

## Cổng

| Cổng | Nhánh làn                 | Thứ tự gộp (sha merge)                                                         | Xung đột file gộp đã giải | Bộ kiểm nhanh đầy đủ | CI (run · link) | Test mới đỏ | Hồi quy (xanh nền) | Nợ (đỏ cả nền) | Đóng (ff `feat/redesign-w4` sha) |
| ---- | ------------------------- | ------------------------------------------------------------------------------ | ------------------------- | -------------------- | --------------- | ----------- | ------------------ | -------------- | -------------------------------- |
| A    | `feat/redesign-w4-wave-a` | A-DB → A-T1 → A-POL1 → A-POL2                                                  |                           |                      |                 |             |                    |                |                                  |
| B    | `feat/redesign-w4-wave-b` | B-CORE → B-REPLY → B-SUBMIT-R → B-NEED-R → B-SPEND-R                           |                           |                      |                 |             |                    |                |                                  |
| C    | `feat/redesign-w4-wave-c` | C-SUBMIT → C-NEED → C-SPEND → C-WITHDRAW → C-BATCH → C-CONV → C-VIEW → C-LISTS |                           |                      |                 |             |                    |                |                                  |
| D    | `feat/redesign-w4-wave-d` | D-MOBILE → D-SEED → D-DOCS                                                     |                           |                      |                 |             |                    |                |                                  |

**C0** (cổng A): `request-single-characterization` trên CI run `<id>` ⟹ `<xanh/đỏ>`. Chưa xanh ⟹ không giao B-SUBMIT-R, B-NEED-R, B-SPEND-R.

## CI GitHub (mọi lần chạy)

| Lần | Cổng / lý do | Nhánh | Run id · link | Job → kết quả | Test đỏ (tên) | Đỏ trên nền? | Xử lý (gói sửa / FIX-TEST) |
| --- | ------------ | ----- | ------------- | ------------- | ------------- | ------------ | -------------------------- |
|     |              |       |               |               |               |              |                            |

## Đối chiếu tiêu chí (LUẬT CỨNG 6 — orchestrator tự đọc diff)

| Gói | Ca SPEC (§ / ca) | Test (file · tên) | file:line code | Unit | CI  | Ghi chú |
| --- | ---------------- | ----------------- | -------------- | ---- | --- | ------- |
|     |                  |                   |                |      |     |         |

## Đột biến (SPEC §11.1 — chạy tay một lần)

| Đột biến                                        | Gói                       | Ca phải đỏ           | Kết quả (lệnh · đỏ?) | `git restore` + spec xanh lại |
| ----------------------------------------------- | ------------------------- | -------------------- | -------------------- | ----------------------------- |
| GH-2 `≥` → `>`                                  | A-POL1                    | §7.2 H               |                      |                               |
| bỏ sắp `position` (pha 2 / #3 / lô)             | C-SUBMIT, C-NEED, C-BATCH | §7.3 B, §7.5 H, §7.7 |                      |                               |
| đếm mục bị nêu vào GH-2                         | A-POL1                    | §7.2 G               |                      |                               |
| _Trả về_ ở #4 lấy mọi mục                       | C-SPEND                   | §7.6 D               |                      |                               |
| đòi ghi chú khi không có _Trả về của người_     | B-REPLY                   | §7.9 D, E            |                      |                               |
| chèn reply khi mục `STOPPED`                    | C-BATCH                   | §7.10 E              |                      |                               |
| bỏ một giá trị `TermRefusal` khỏi enum `reason` | B-CORE                    | §7.2 N / dto spec    |                      |                               |

## Bàn giao (gói cần file ngoài gói / chữ ký lệch)

| Từ gói | Cần gì (file:line) | Ai làm (gói vá / gói nào) | Trạng thái |
| ------ | ------------------ | ------------------------- | ---------- |
|        |                    |                           |            |

## Dừng ở đâu (khi compact / hết context)

- Wave: `<x>` · gói đang chạy: `<…>` · nhánh/sha: `<…>` · việc kế: `<…>`

---

## Mẫu `pkg/<gói>.md` (subagent ghi, một file một gói)

```md
# <gói> — <W4-xx>

- Skill đã đọc: …
- Worktree / nhánh / sha nền: D:/FPT/FALL2026/Code/w4-<gói> · feat/redesign-w4-<gói> · <sha>
- Trạng thái: đang làm | xong-unit | dừng hỏi | Bàn giao

## Lệnh và kết quả thật

| Lệnh | Kết quả (exit, số pass/fail) |
| ---- | ---------------------------- |

## Ca SPEC → test → file:line

| Ca  | Test (file · tên) | file:line code | Đỏ trước? | Xanh? |
| --- | ----------------- | -------------- | --------- | ----- |

## Kiểm giữ (gói refactor — guard thật)

## Integration/http đã viết (chưa chạy)

## D-n

| D-n | file:line | Câu hỏi | A/B/C | Chọn + căn cứ | Cách đảo | Mức |
| --- | --------- | ------- | ----- | ------------- | -------- | --- |

## Bàn giao / dừng hỏi
```

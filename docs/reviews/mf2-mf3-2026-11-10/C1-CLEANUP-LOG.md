# C1 — Nhật ký dọn tài liệu Lô 1 + 2a + 2b (10/11/2026)

**Skill đã đọc/dùng:** `incremental-implementation` (process: làm theo lát xóa → sửa tham chiếu → kiểm, giữ đúng phạm vi
được giao) · `deprecation-and-migration` (domain: chỉ gỡ khi đã có hạng mục thay thế và đã kiểm "zero consumers" trong
code/test/gate) · `superpowers:verification-before-completion` (verification: mọi kết luận ở §6 có lệnh và output thật).

**Phạm vi và quyền:** Owner duyệt 10/11/2026 làm **Lô 1 + Lô 2a + Lô 2b** của
[A5-DOCS-CLEANUP.md](A5-DOCS-CLEANUP.md) (§3.7, §5.3, §6): 14 thư mục `docs/workspace/items/` + 1 file kế hoạch; Lô 2b
chấp nhận đổi dòng scope map `full` → `deferred` trỏ sang hạng mục `qd103-*` đã code. **Không** làm Lô 2c (9 thư mục) và
**không** đụng 15 mục `CHƯA-CHẮC`. Không commit, không push; không sửa `SPEC.md`, `PLAN.md`, `A*.md` của thư mục này.

**Pin:** BE `feat/mf2-mf3` = `a2dad526` + cây làm việc (gồm phần A6 vừa sửa trong `docs/roadmap.md`, giữ nguyên).

## 1. Đối chiếu trước khi xóa

- Danh sách 14 thư mục khớp A5 §3.7 (cột _Lô_ = 1, 2a, 2b) và lệnh `git rm` ở §6; số file · dòng đo lại trên cây làm
  việc khớp từng dòng A5.
- Grep tên 14 thư mục + `SPEC-PLAN-DOT-2-4` trên toàn repo (trừ `node_modules`, `dist`, `.git`, `.claude`): **không** có
  tham chiếu trong `test/` (gồm registry `test/support/api-collection-registry-*.ts`), `scripts/`, `prisma/`,
  `.github/`, `package.json`, `rules-check.config.json` (không mục nào trong `legacy`/`sizingGrandfathered`). Trong
  `src/` chỉ có comment `device-binding.policy.spec.ts:16-17` (A5 đã nêu).
- Link Markdown trỏ vào mục bị xóa trong file được giữ: chỉ dòng index, dòng bảng _Hạng mục_ roadmap,
  `g0-g4-post-merge-review-2026-10-22/README.md:507`, `fe-batch/SPEC-PLAN-DOT-1.md:29` — đúng như A5 §5.1.
- Kết luận: **không mục nào phải dừng.**

## 2. Đã xóa (`git rm -r`, đã vào index)

| Lô  | Thư mục / file                                                             | File · dòng | Thay bởi                                                      |
| --- | -------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------- |
| 1   | `docs/workspace/items/g4-device-dependent-features`                        | 2 · 136     | `qd103-k4-key-pool`                                           |
| 1   | `docs/workspace/items/qd96-100-subscription-quantity-guard`                | 2 · 204     | `qd103-subscription-adjustment-point`                         |
| 1   | `docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/SPEC-PLAN-DOT-2-4.md` | 1 · 381     | Kế hoạch Đợt 2–4 không chạy; thay bởi gói `qd103-*`           |
| 2a  | `docs/workspace/items/a05-bm06-signature-record`                           | 2 · 106     | `g7-device-registry-acknowledgement`                          |
| 2a  | `docs/workspace/items/a05-k4-device-revocation`                            | 2 · 141     | `qd103-k4-key-pool`                                           |
| 2a  | `docs/workspace/items/g7-g3-g4-decisions`                                  | 2 · 112     | `qd103-ghost-seat-g3-g4`, `qd103-ghost-seat-manager-decision` |
| 2a  | `docs/workspace/items/g7-vendor-usage-csv-template`                        | 2 · 97      | `qd103-vendor-usage-import`                                   |
| 2a  | `docs/workspace/items/qd96-100-renewal-milestones-and-recipients`          | 2 · 95      | — (`US-11-06` `RETIRED`, `QĐ-103e`)                           |
| 2a  | `docs/workspace/items/qd96-100-subscription-lifecycle`                     | 2 · 100     | — (`US-11-06` `RETIRED`, `QĐ-103e`)                           |
| 2a  | `docs/workspace/items/qd96-100-transfer-labels-and-overlap`                | 2 · 98      | — (`US-03-12` `RETIRED`, `QĐ-103h`)                           |
| 2a  | `docs/workspace/items/qd96-100-transfer-replacement-request`               | 2 · 231     | — (`QĐ-103h` bỏ Request thay thế tự tạo)                      |
| 2b  | `docs/workspace/items/g7-g1-g2-recommendations`                            | 3 · 369     | `qd103-ghost-seat-g1-g2`                                      |
| 2b  | `docs/workspace/items/g7-vendor-usage-import-identity`                     | 4 · 722     | `qd103-vendor-usage-import`                                   |
| 2b  | `docs/workspace/items/qd96-100-remove-finance-review-path`                 | 2 · 206     | `qd103-budget-check-three-outcomes`                           |
| 2b  | `docs/workspace/items/qd96-100-spend-notifications`                        | 2 · 174     | `qd103-budget-check-three-outcomes`                           |

Tổng: 14 thư mục (31 file · 2 791 dòng) + 1 file (381 dòng) = **32 file · 3 172 dòng**. `git diff --cached --shortstat`
sau `git rm` báo 35 file · 3 175 dòng vì index đã có sẵn 3 gitlink `.claude/worktrees/*` bị xóa từ trước (không do lượt
này, không đụng).

## 3. Scope map `docs/roadmap.md` — 28 dòng + 2 ô lý do

Tìm theo khóa Story/AC (không theo số dòng), sửa bằng script có assert giá trị cũ của từng ô. Mỗi dòng ghi lý do dạng
"thay bởi `<mới>` (đã code; technical-enabler, chưa claim AC — chờ re-pin); `<cũ>` đã xóa 10/11/2026 — thiết kế không
dùng, xem git history". Cột `Order` của dòng `full` → `deferred` và dòng `not affected` đặt `—`.

**Lô 2a — 18 dòng:**

| G   | Story / AC                                     | Trước                                                                                 | Sau                                             |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| G3  | `US-04-04` AC-8                                | deferred → `a05-bm06-signature-record`                                                | deferred → `g7-device-registry-acknowledgement` |
| G3  | `US-04-12` AC-7, AC-8                          | deferred → `a05-k4-device-revocation`                                                 | deferred → `qd103-k4-key-pool`                  |
| G6  | `US-07-05` AC-6, AC-7                          | deferred → `a05-k4-device-revocation`                                                 | deferred → `qd103-k4-key-pool`                  |
| G6  | `US-03-04` AC-16                               | partial, còn lại `g6-downstream-integration`, `a05-k4-device-revocation`              | partial, còn lại `g6-downstream-integration`    |
| G6  | `US-03-07` AC-3                                | partial, còn lại `g6-downstream-integration`, `qd96-100-transfer-replacement-request` | partial, còn lại `g6-downstream-integration`    |
| G6  | `US-03-12` AC-1→AC-4, AC-7→AC-10, AC-12, AC-13 | deferred → `qd96-100-transfer-labels-and-overlap`                                     | `not affected` — Story `RETIRED` (`QĐ-103h`)    |
| G7  | `US-08-01` AC-1→AC-5, AC-7                     | deferred → `g7-vendor-usage-csv-template`                                             | deferred → `qd103-vendor-usage-import`          |
| G7  | `US-08-02` AC-7                                | deferred → `g7-vendor-usage-csv-template`                                             | deferred → `qd103-vendor-usage-import`          |
| G7  | `US-08-03` AC-2                                | deferred → `g7-vendor-usage-csv-template`                                             | deferred → `qd103-vendor-usage-import`          |
| G7  | `US-08-02` AC-4                                | deferred → `g7-g3-g4-decisions`                                                       | deferred → `qd103-ghost-seat-g3-g4`             |
| G7  | `US-08-03` AC-4                                | deferred → `g7-g3-g4-decisions`                                                       | deferred → `qd103-ghost-seat-g3-g4`             |
| G7  | `US-08-04` AC-2                                | deferred → `g7-g3-g4-decisions`                                                       | deferred → `qd103-ghost-seat-g3-g4`             |
| G7  | `US-08-07` AC-1, AC-2, AC-4                    | deferred → `g7-g3-g4-decisions`                                                       | deferred → `qd103-ghost-seat-g3-g4`             |
| G7  | `US-09-05` AC-5, AC-7                          | deferred → `g7-g3-g4-decisions`                                                       | deferred → `qd103-ghost-seat-g3-g4`             |
| G7  | `US-10-05` AC-1, AC-3, AC-4, AC-6              | deferred → `g7-g3-g4-decisions`                                                       | deferred → `qd103-ghost-seat-manager-decision`  |
| G7  | `US-09-05` AC-1                                | partial, còn lại `g7-browser-usage-intake`, `g7-g3-g4-decisions`                      | partial, còn lại `g7-browser-usage-intake`      |
| G8  | `US-11-06` AC-8                                | deferred → `qd96-100-renewal-milestones-and-recipients`                               | `not affected` — Story `RETIRED` (`QĐ-103e`)    |
| G8  | `US-11-06` AC-15, AC-16                        | deferred → `qd96-100-subscription-lifecycle`                                          | `not affected` — Story `RETIRED` (`QĐ-103e`)    |

**Lô 2b — 10 dòng `full` → `deferred` (tạm tới lượt re-pin):**

| G   | Story / AC                        | Trước (full, owner)                   | Sau (deferred →)                    |
| --- | --------------------------------- | ------------------------------------- | ----------------------------------- |
| G7  | `US-08-01` AC-8                   | `g7-vendor-usage-import-identity`     | `qd103-vendor-usage-import`         |
| G7  | `US-08-02` AC-1→AC-3, AC-5, AC-6  | `g7-vendor-usage-import-identity`     | `qd103-vendor-usage-import`         |
| G7  | `US-08-03` AC-1, AC-3             | `g7-vendor-usage-import-identity`     | `qd103-vendor-usage-import`         |
| G7  | `US-08-04` AC-1, AC-3→AC-7        | `g7-vendor-usage-import-identity`     | `qd103-vendor-usage-import`         |
| G7  | `US-08-05` AC-1→AC-6              | `g7-vendor-usage-import-identity`     | `qd103-vendor-usage-import`         |
| G7  | `US-08-07` AC-3                   | `g7-vendor-usage-import-identity`     | `qd103-vendor-usage-import`         |
| G7  | `US-10-01` AC-1→AC-10             | `g7-g1-g2-recommendations`            | `qd103-ghost-seat-g1-g2`            |
| G7  | `US-10-05` AC-2, AC-5, AC-7, AC-8 | `g7-g1-g2-recommendations`            | `qd103-ghost-seat-g1-g2`            |
| G5  | `US-06-12` AC-25                  | `qd96-100-remove-finance-review-path` | `qd103-budget-check-three-outcomes` |
| G8  | `US-12-15` AC-30                  | `qd96-100-spend-notifications`        | `qd103-budget-check-three-outcomes` |

**Chỉ sửa chữ ở cột `Reason` (giữ disposition/owner):** G7 `US-08-01` AC-9 và `US-09-05` AC-6 — ghi
`g7-vendor-usage-import-identity` đã xóa 10/11/2026 (xem git history).

Tổng theo nhóm: G3 2 · G5 1 · G6 4 · G7 18 · G8 3 = 28 dòng. Số Story/AC khai báo ở `- Active:` của từng map không đổi
(dòng `not affected` vẫn tính khóa).

## 4. File khác đã sửa

| File                                                                             | Sửa                                                                                                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/roadmap.md` bảng _Hạng mục_                                                | Bỏ 14 dòng của các mục đã xóa (tìm theo `[<tên>](workspace/items/<tên>/spec.md)`)                                                                        |
| `docs/roadmap.md` đoạn _Cập nhật 10/11/2026_                                     | Thêm câu: đã xóa 14 hạng mục + 1 kế hoạch (liệt kê tên gọn), 28 dòng scope map, 9 hạng mục Lô 2c chờ re-pin, nguồn A5, link file này. Phần A6 giữ nguyên |
| `docs/workspace/items/README.md`                                                 | Bỏ 14 dòng index                                                                                                                                         |
| `docs/reviews/g0-g4-post-merge-review-2026-10-22/README.md:507`                  | Link `g4-device-dependent-features` → chữ + ghi chú "(đã xóa 10/11/2026 — thiết kế không dùng, thay bởi `qd103-k4-key-pool`; xem git history)"           |
| `docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/SPEC-PLAN-DOT-1.md:29`      | Link `qd96-100-transfer-replacement-request` → chữ + ghi chú (`QĐ-103h` bỏ Request thay thế tự tạo); prettier căn lại bảng                               |
| `docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/PROMPT-FE-DOCS-DOT-1.md:16` | Ghi chú sau đường dẫn `SPEC-PLAN-DOT-2-4.md`: file đã xóa 10/11/2026 (A5 §6 Lô 1, tùy chọn)                                                              |
| `src/modules/licensing/device-binding/device-binding.policy.spec.ts:16-17`       | **Chỉ comment**: `a05-k4-device-revocation` ghi là thiết kế đã xóa 10/11/2026, thay bởi `qd103-k4-key-pool`; hai mục Lô 2c/CHƯA-CHẮC còn lại giữ nguyên  |

Không sửa: các nhắc tên bằng backtick (không phải link) trong spec/review lịch sử đang giữ (g3/g4/g5/g6, `qd103-*`,
`a0x`, `qd96-100-alignment/*`, `qd103-108-alignment/*`, `g7-usage-design/*`…) — theo A5 §3.7 chúng chỉ thành tên lịch sử,
không làm vỡ gate; và `A3`/`A4`/`A5`/`A6` của thư mục này (ràng buộc giao việc).

## 5. Mục bị dừng

Không có. Không mục nào của Lô 1/2a/2b có tham chiếu từ code, test, gate hay script mà A5 bỏ sót.

## 6. Kiểm chứng (chạy thật trên cây làm việc)

| Lệnh                                                     | Kết quả                                                                                                                                                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm rules:check` (trước khi sửa)                       | `BE: 606 files, 4215 links, 0 errors`                                                                                                                                                                                      |
| `pnpm rules:check` (sau khi sửa)                         | `BE: 575 files, 4066 links, 0 errors`, exit 0 (606 − 31 file item = 575; khớp mô phỏng A5 §5.2)                                                                                                                            |
| `pnpm rules:format` lần 1                                | `[warn] docs/roadmap.md`, exit 1 — đúng dự báo A5 (ô bảng scope map đổi độ rộng)                                                                                                                                           |
| `pnpm exec prettier --write docs/roadmap.md`             | Chỉ đổi khoảng trắng và độ dài dòng `---` của 5 bảng scope map đã sửa (G3, G5, G6, G7, G8); `diff -w` không còn khác biệt ngoài dòng phân cách; bảng _Hạng mục_ và đoạn A6 không đổi                                       |
| `pnpm rules:format` lần 2                                | `All matched files use Prettier code style!` (cả hai lệnh con), exit 0                                                                                                                                                     |
| `pnpm exec prettier --check` 3 file review + file `src/` | Hai file review (ngoài phạm vi `rules:format`) báo warn do ô bảng đổi độ rộng; bản `HEAD` của chúng sạch ⟹ `prettier --write` hai file đó, chỉ căn lại bảng; kiểm lại 4 file: `All matched files use Prettier code style!` |
| `pnpm test:gates`                                        | `Test Suites: 16 passed, 16 total`, `Tests: 331 passed, 331 total`, 65.9 s, exit 0                                                                                                                                         |

Grep cuối: không còn link Markdown nào trỏ vào 14 thư mục hoặc `SPEC-PLAN-DOT-2-4.md`; cột `Owner`/`Remaining owner`
của mọi scope map không còn tên mục đã xóa. Không chạy test nào khác.

## 7. Còn lại và giới hạn

- **Lô 2c (9 thư mục) giữ nguyên**, chờ re-pin scope map G3–G8 theo Docs `5bb2e6a` (A5 §5.3, §6, câu hỏi Q3):
  `a05-k4-key-grant-by-device`, `a06-renewal-open-inputs`, `a06-renewal-usage-evidence`,
  `qd96-100-budget-check-three-outcomes`, `qd96-100-budget-visibility-qd100p`, `qd96-100-head-group-request-queue`,
  `qd96-100-reserve-confirmation`, `qd96-100-revocation-deadline-and-withdraw`, `qd96-100-sla-reminder-recipients`.
- 10 dòng Lô 2b là `deferred` **tạm**: phần việc đã code ở `qd103-*` (technical-enabler, không claim AC); nghĩa đúng chỉ
  có sau re-pin (cách (a) hoặc (b) của A5 Q3).
- 3 dòng đổi `not affected` dựa trên trạng thái `RETIRED` của Docs `5bb2e6a` (bảng _Story `RETIRED`_ của roadmap), trong
  khi pin của từng scope map còn cũ — ghi rõ pin trong ô lý do.
- `rules:check` chỉ chứng minh cấu trúc (đăng ký, link, scope map hợp lệ), không chứng minh nghiệp vụ đúng; Owner chưa
  review lượt dọn này.
- Trạng thái Git: xóa nằm trong index (do `git rm`), các sửa khác chưa stage; chưa commit/push.

# C2 — Nhật ký xóa ba thư mục nhật ký review QĐ-93 / QĐ-95 / QĐ-96→100 (11/11/2026)

**Skill đã đọc/dùng:** `andrej-karpathy-skills:karpathy-guidelines` (process: thay đổi tối thiểu, chỉ chạm dòng có tham
chiếu) · `documentation-and-adrs` (domain: tài liệu lịch sử bị gỡ thì ghi rõ, giữ nguồn chính) ·
`superpowers:verification-before-completion` (verification: mọi kết luận ở §4 có lệnh và output thật).

**Phạm vi và quyền:** Owner duyệt 11/11/2026 xóa `docs/reviews/qd93-delivery-2026-11-03/`,
`docs/reviews/qd95-delivery-2026-11-04/`, `docs/reviews/qd96-100-alignment-2026-11-05/` (nhật ký audit/prompt/kế hoạch;
code đã merge, spec ở `docs/workspace/items/` giữ). Giữ `docs/reviews/qd103-108-alignment-2026-11-08/` và mọi thư mục
review khác. Không commit, không push.

**Pin:** cây làm việc trên `a2dad526` (nhánh đang checkout là `dev`; `feat/mf2-mf3` cùng trỏ `a2dad526`), gồm các thay
đổi chưa commit của lượt C1 (giữ nguyên, không stash/reset/checkout).

## 1. Đối chiếu trước khi xóa

- Grep tên ba thư mục trong `rules-check.config.json`, `package.json`, `scripts/`, `test/`, `src/`, `.github/`: **không**
  có kết quả. Không file nào bị config/gate bắt giữ ⟹ **không thư mục nào phải dừng.**
- `git rm -r` thường bị từ chối vì hai file của `qd96-100-alignment-2026-11-05/fe-batch/` (`PROMPT-FE-DOCS-DOT-1.md`,
  `SPEC-PLAN-DOT-1.md`) có sửa chưa commit của lượt C1 (chỉ là ghi chú link trong chính hai file bị xóa). Đã đọc diff rồi
  chạy `git rm -r -f` cho ba thư mục.

## 2. Đã xóa (`git rm -r -f`, đã vào index)

| Thư mục                                       | File (HEAD) · dòng | Ghi chú                                                    |
| --------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| `docs/reviews/qd93-delivery-2026-11-03/`      | 47 · 3 646         |                                                            |
| `docs/reviews/qd95-delivery-2026-11-04/`      | 4 · 560            |                                                            |
| `docs/reviews/qd96-100-alignment-2026-11-05/` | 34 · 9 301         | gồm `fe-batch/SPEC-PLAN-DOT-2-4.md` đã `git rm` từ lượt C1 |
| **Tổng**                                      | **85 · 13 507**    | 84 file xóa mới ở lượt này + 1 file đã ở index từ C1       |

Không có file untracked trong ba thư mục. Sau xóa, `git status` có 85 dòng `D  docs/reviews/qd9{3,5,6}…`.

## 3. Sửa tham chiếu (25 file)

Cách sửa: link Markdown → chữ của link + ghi chú `(nhật ký review đã xóa 11/11/2026 — xem git history)`; đường dẫn trong
backtick giữ nguyên + cùng ghi chú. Một ghi chú cho mỗi dòng (bảng: mỗi ô). Không đổi trạng thái, hạng mục hay nội dung
khác.

- `docs/roadmap.md`: 23 dòng bảng _Hạng mục_ `qd96-100-*` / `e2e-main-flows-suite` (`tracker`, `C-REVIEW`), dòng
  `qd96-100-plan-line-removal-and-bm10-lines` (`SPEC-PLAN-DOT-1`), đoạn _Cập nhật 03/11/2026_ và bảng QĐ-93 (`câu lệnh
tối giản`, `round2-remaining`, `báo cáo`, `review`, `báo cáo bản tối giản`), 6 chỗ `REGISTRATION` ở các scope map;
  thêm một câu vào đoạn _Cập nhật 10/11/2026_ (xóa ba thư mục, Owner duyệt, lịch sử ở git, link log này). Dòng nhắc
  `qd96-100-alignment-2026-11-05/fe-batch/SPEC-PLAN-DOT-2-4.md` trong đoạn đó (lượt C1 đã xóa) để nguyên. Đã chạy
  `prettier --write` (căn lại bảng).
- `docs/reviews/qd103-108-alignment-2026-11-08/LEDGER.md` (dòng 15, đường dẫn LEDGER QĐ-96→100).
- `docs/workspace/items/`:
  - `e2e-main-flows-suite/spec.md`, `e2e-main-flows-suite/test-plan.md`
  - `qd103-api-docs-regression/spec.md`, `qd103-api-docs-regression/plan.md`
  - `qd96-100-annual-budget-reserve-and-floor/spec.md`, `qd96-100-approved-end-date/spec.md`,
    `qd96-100-budget-check-three-outcomes/spec.md`, `qd96-100-budget-visibility-qd100p/spec.md`,
    `qd96-100-catalog-api-fields/spec.md`, `qd96-100-licensing-api-fields/spec.md`,
    `qd96-100-plan-line-removal-and-bm10-lines/spec.md`, `qd96-100-plan-line-removal-and-bm10-lines/plan.md`,
    `qd96-100-remove-budget-revision-and-high-value/spec.md`, `qd96-100-remove-spend-override/spec.md`,
    `qd96-100-renewal-chaining-and-window/spec.md`, `qd96-100-request-sender-rules/spec.md`,
    `qd96-100-request-year-without-spend-date/spec.md`, `qd96-100-reserve-confirmation/spec.md`,
    `qd96-100-revocation-deadline-and-withdraw/spec.md`, `qd96-100-seed-demo-v3/spec.md`,
    `qd96-100-sla-reminder-recipients/spec.md`, `qd96-100-subscription-owner-confirmation/spec.md`,
    `qd96-100-transfer-review-defaults/spec.md`

Để nguyên theo giao việc: `docs/reviews/mf2-mf3-2026-11-10/A5-DOCS-CLEANUP.md`, `C1-CLEANUP-LOG.md` (báo cáo lịch sử).
Sau sửa, grep link Markdown có đích chứa tên một trong ba thư mục (toàn repo, trừ `node_modules`, `dist`, `.git`,
`.claude`) ngoài hai file đó: 0 link.

## 4. Kiểm (chạy thật, 11/11/2026)

| Lệnh                | Kết quả                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm rules:check`  | `BE: 575 files, 3984 links, 0 errors`, exit 0 (lần chạy trước khi có file log này báo 1 lỗi: link `C2-CLEANUP-LOG.md` chưa tồn tại)              |
| `pnpm rules:format` | Lần 1: `docs/roadmap.md` lệch (bảng) → `pnpm exec prettier --write docs/roadmap.md`; lần 2: `All matched files use Prettier code style!`, exit 0 |
| `pnpm test:gates`   | `Test Suites: 16 passed, 16 total` · `Tests: 331 passed, 331 total` · 77.7 s, exit 0                                                             |

Không chạy test khác.

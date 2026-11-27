# Prompt dán sẵn cho Bảo — Đợt 4, làn B "refactor Request đơn" (bản 3.2, 27/11/2026)

> Dán khối dưới vạch vào **một** phiên Codex **sau khi** đợt 3 đã vào `dev` và PR spec đợt 4 (bản 3.2) đã squash. Chia làn: [SPLIT-2-LANES.md](SPLIT-2-LANES.md).
> Làn N (Neon) chạy song song — không đợi, không chạm file của nhau.

---

Trả lời bằng **tiếng Việt**; giữ tiếng Anh cho tên file, hàm, lệnh, mã lỗi, code.

Bạn code **làn B** của đợt 4 thiết kế lại BE SaaS-Sentry (NestJS 11 + Prisma + PostgreSQL). Repo `D:\FPT\FALL2026\Code\BE-dev-software-license-management` (`<R>`);
làm trong worktree **`D:/FPT/FALL2026/Code/w4-lane-b`**, nhánh **`feat/redesign-w4-lane-b`**. Thư mục việc `docs/reviews/redesign-w4-2026-11-25/`.
Năm gói, **tuần tự**: **A-T1 → A-POL2 → (cổng B0) → B-SUBMIT-R → B-NEED-R → B-SPEND-R → (cổng B1)**. Chế độ tự quyết: làm hết không chờ duyệt giữa gói; chỉ
dừng ở LUẬT CỨNG / điều kiện dừng.

## 0. Skill Preflight (trước mọi việc, và lại sau mỗi lần compact)

Đọc đủ `SKILL.md`: `superpowers:executing-plans` (process), `superpowers:test-driven-development`, repo skill `.claude/skills/be-quick-check/SKILL.md`,
`superpowers:verification-before-completion` (trước mọi `xong`/commit/báo cáo). Không có đúng tên ⟹ skill gần nhất, ghi mapping. Liệt kê skill đã đọc ở đầu mọi báo cáo.

Đọc trong repo: `AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/database-business.md` (_Thứ tự khóa chuẩn_), `docs/rules/module-structure.md`, `test/README.md`,
`src/modules/requests/README.md`. Đọc trọn **`SPEC.md`**, **`PLAN.md`** (mục 3 bảng file, 4 bộ kiểm nhanh, 5 khuôn gói, mục 7 các gói A-T1, A-POL2, B-SUBMIT-R,
B-NEED-R, B-SPEND-R), **`DELTA-W3-FOR-W4.md`**, **`SPLIT-2-LANES.md`**, và **LUẬT CỨNG 1–22** ở `CODE-PROMPT.md` — áp **nguyên văn** (thay "orchestrator" bằng
"chính bạn" ở LUẬT 6; LUẬT 22: file của bạn = file của 5 gói trên ở PLAN bảng 3.1; mục 2 SPLIT là ngoại lệ duy nhất).

## 1. Chuẩn bị

```bash
R=D:/FPT/FALL2026/Code/BE-dev-software-license-management
git -C $R fetch origin
git -C $R --no-pager show origin/dev:docs/reviews/redesign-w4-2026-11-25/SPLIT-2-LANES.md | head -1     # phải có — không có ⟹ DỪNG
git -C $R --no-pager ls-tree --name-only origin/dev prisma/migrations/20261204000500_w3_final3_request_monthly_price_check   # đợt 3 đã vào dev — không có ⟹ DỪNG
git -C $R --no-pager ls-remote --heads origin feat/redesign-w4        # có ⟹ dùng; chưa ⟹ tạo từ origin/dev và push (CODE-PROMPT mục 1)
git -C $R worktree add -b feat/redesign-w4-lane-b D:/FPT/FALL2026/Code/w4-lane-b origin/feat/redesign-w4
cd D:/FPT/FALL2026/Code/w4-lane-b && pnpm install --frozen-lockfile --prefer-offline && pnpm prisma:generate
git push -u origin feat/redesign-w4-lane-b
```

Run CI nền: dùng id ghi ở `PROGRESS-biz.md` "CI nền" (Neon chạy ở cổng 0); chưa có ⟹ `gh workflow run ci.yml --ref dev`, ghi id vào `PROGRESS-lane-b.md`.
Tạo `PROGRESS-lane-b.md` (bảng gói → trạng thái → sha → test chính → CI) và `pkg/<gói>.md` theo mẫu cuối `PROGRESS-biz.md`.

## 2. Từng gói (khuôn PLAN mục 5, bước 0 → 8)

- **A-T1 trước tiên — push harness sớm:** commit đầu tiên chỉ `test/support/request-ticket-harness.ts` (`buildTicketWorld`, đúng Interfaces PLAN mục 7) —
  `test(requests): ticket world harness for wave 4 (redesign W4 A-T1)` + push ngay (làn N lấy file này). Rồi spec đặc tả: khẳng định hành vi **thật** của `dev`;
  đỏ ⟹ sửa test theo hành vi thật, **không sửa `src`**; hành vi thật khác SPEC theo cách đổi luật ⟹ `D-n` _cần Owner_.
- **A-POL2:** như PLAN mục 7 (`HEAD_MAY_WITHDRAW_AT` thêm đúng `NOT_SUBMITTED`; `spendItemOutcome` thuần).
- **Cổng B0:** push; `gh workflow run ci.yml --ref feat/redesign-w4-lane-b`; phải xanh: `request-single-characterization`, `head-withdraw-submission-queue`, ba spec
  unit đặc tả, `spend-item-outcome.policy`, `withdrawal.policy`. Phân loại mọi test đỏ khác **theo từng test** so với run nền (LUẬT 21) ⟹ `PROGRESS-lane-b.md`.
  B0 chưa xanh ⟹ **không** bắt đầu refactor (LUẬT 2).
- **B-SUBMIT-R, B-NEED-R, B-SPEND-R:** refactor giữ mọi lần kiểm cũ (LUẬT 2 — ghi `Kiểm giữ:` trong commit); `assessParty` chỉ thêm, `submitWithin` của Request
  đơn **không** gọi nó (I-1); spec đặc tả + test cũ **không đổi kỳ vọng**, chỉ thêm ca.
- **Cổng B1:** CI tay; đặc tả vẫn xanh; mọi spec của 5 gói xanh; đỏ còn lại chỉ là đỏ cùng tên trên run nền.

Mỗi commit: bộ kiểm nhanh PLAN mục 4 + `CI=true pnpm test -- <spec của file đã sửa>`. Đột biến SPEC §11.1 của gói: chạy tay, ghi `pkg/<gói>.md`, **bắt buộc**
`git restore <file>` rồi chạy lại spec xanh trước khi commit. Registry/manifest: chỉ file mảnh `*-w4-<gói>.ts` + 1 dòng import/spread ở file gộp.

**Luật riêng làn B (để gộp với làn N không vỡ):** (1) spec mới dựng `AccessRequestRecord` bằng `as unknown as AccessRequestRecord` (B-CORE làn N thêm trường
`ticket` bắt buộc); (2) **không** thêm provider/controller vào `requests.module.ts` (G-HTTP làn N chuyển controller); (3) ca gửi lại/trình lại sau _Trả về
của người_ trong test làn B gửi kèm ghi chú (B-REPLY/C-BATCH làn N sẽ bắt buộc ghi chú); (4) lý do `SpendItemOutcome.reason` chép **đúng** SPEC §8.3 (B-CORE
làn N dùng cùng enum).

## 3. Dừng

Theo CODE-PROMPT mục 5 (điều kiện 2–9, 11), thêm: cần sửa file của làn N hoặc của gói nối (C-SUBMIT, C-NEED, C-SPEND) ⟹ dừng phần đó, ghi _Bàn giao_ ở
`pkg/<gói>.md`. Gói hỏng sau 2 vòng ⟹ LUẬT 5.

## 4. Không được làm

Không merge/rebase nhánh khác (kể cả làn N); không vào `dev`/`int/*`/`main`; không mở PR; không sửa `prisma/**`; không chạy full test, Docker, seed, migration ở
máy; không sửa tay `openapi.json`/`docs/generated/*`; không co-author; không ghi Owner đã duyệt.

## 5. Báo cáo cuối (≤ 40 dòng)

Skill đã đọc; bảng gói → sha → W4-xx → lệnh kiểm + số pass/fail thật; run CI B0, B1 (link) + phân loại từng test; `Kiểm giữ:` ba refactor; D-n; _Bàn giao_;
câu bắt buộc "Full test chỉ chạy trên CI GitHub". Rồi **dừng**, chờ điều phối gộp hai làn và review.

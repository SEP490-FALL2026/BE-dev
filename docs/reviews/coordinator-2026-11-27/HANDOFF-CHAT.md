# HANDOFF — chat điều phối 25–27/11/2026 → chat điều phối mới

> Đọc file này trước, rồi: handoff `docs/reviews/coordinator-2026-11-25/HANDOFF-CHAT.md` (§0 bối cảnh, §3 quy ước — vẫn hiệu lực);
> memory `MEMORY.md` (`project_redesign_2026_11_21`, `project_two_person_process`, `project_wave8_test_cleanup`, mọi `feedback_*`);
> Docs `rules/skill-workflow.md`; `D:/FPT/FALL2026/Docs/Research-AI/redesign-2026-11-21/DECISIONS.md` các mục từ "Review B1 đợt 3 +
> QĐ-120" tới cuối (B1-_, W3M-_, W3F-_, W3F2-_, W3F4-*, L-1…L-6). Sổ QĐ tới **`QĐ-120p`**.

## 0. Phạm vi và người

- Chỉ đồ án **SEP**: BE `D:\FPT\FALL2026\Code\BE-dev-software-license-management` (origin `SEP490-FALL2026/BE-dev`), Docs
  `D:\FPT\FALL2026\Docs`, Tool `D:\FPT\FALL2026\Code\Tool-SEP`. FE web + Mobile không phải việc của mình — sau mỗi đợt giao **API
  description** (`Docs/Figma UI-UX/API-Integration/`).
- **Neon** (Antigravity/Gemini, làn biz, code ở thư mục BE chính, đang ở `int/redesign-w3`) — làm **toàn bộ đợt 3 còn lại và toàn bộ
  đợt 4** (Owner 27/11). **Bảo** (làn tech, dùng Codex) — làm **đợt 5 phần 1 Redis** trên `feat/redesign-w5-redis` (đã push, đang làm).
- Không checkout nhánh khác ở thư mục BE chính. Worktree đang có: `Code/BE-w3-review` (detached, dùng đẩy file review lên
  `int/redesign-w3`), `Code/BE-w4-spec` (nhánh PR #92), `Code/BE-w5-redis` (nhánh PR #91 đã merge — gỡ được), `Code/BE-coord` (nhánh
  handoff này — gỡ khi PR merge).

## 1. Trạng thái (27/11 tối)

| Việc                        | Trạng thái                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin/dev`                | `8c6ce1ff` = đợt 1 + đợt 2 + spec đợt 4 bản 2.2 + handoff 25/11 + **spec Redis (PR #91, đã squash)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Đợt 3** `int/redesign-w3` | `c257d6c7` — Neon báo **xong FIX-W3-FINAL-4**; CI `45974586113` đang chạy lúc viết. **Chưa review lượt này.** Lịch sử sửa cuối đợt: `FIX-B1` → `FIX-W3` → `FIX-W3-FINAL` → `-2` → `-3` → `-4` (đều ở `docs/reviews/redesign-w3-2026-11-22/`). Lượt -3 đã đạt: không còn 500/hỏng luồng chính; 31 spec mới, 11 spec thiết bị, 5 spec seed, e2e `paid-request-to-seat` xanh                                                                                                                                                                                                                                                                                     |
| Việc tiếp đợt 3             | Review FINAL-4 (2 Opus: code J-1…J-7/R-1…R-9 + phân loại CI **theo từng test** so với run dev nền `45478093759`) ⟹ nếu chỉ còn nợ hợp lệ: **`DELTA-W3-FINAL.md`** ⟹ cắt `pr/redesign-w3` **từ `origin/dev`** (squash, giữ `Co-authored-by` Bảo) ⟹ Owner squash ⟹ **API description đợt 3** ⟹ deploy                                                                                                                                                                                                                                                                                                                                                           |
| Deploy đợt 3                | Owner 27/11: deploy cho FE test **bỏ tạm integration CI**, nhưng job `quality` phải xanh: `dev → main` → CI tay → Actions **Backend CD** `mode = deploy`. **Trước đó** Owner chạy các câu SELECT kiểm trước (M5, giá tháng Request B-5/W3F2, D-16, D-15) ghi trong `PROGRESS-biz.md` đợt 3 trên DB demo; câu nào trả dòng ⟹ migration dừng. FE: nối ngay phần kho/thuê bao/workspace/lô/sổ seat/ngân sách; **luồng Request sẽ đổi ở đợt 4** — ghi rõ trong API description                                                                                                                                                                                    |
| **Đợt 4** (phiếu nhiều mục) | Spec **bản 3.1** ở **PR #92** (`docs/redesign-w4-spec-v3`, chưa merge): `DELTA-W3-FOR-W4.md` (23 dòng), SPEC/PLAN/CODE-PROMPT 3.1 — **chạy song song** 20 gói, 4 wave (A, B1/B2, C1/C2, D), 5 cổng, tối đa 4 subagent, CI đầy đủ mỗi cổng, migration tuần tự ở gói A-DB. Review độc lập đã áp. Owner chốt: OQ-W4-5 = A (chặn trùng **theo gói**, bỏ "loại seat"), OQ-W4-6 = A (ngoại lệ song song + worktree riêng đợt 4), OQ-W4-7 = A. **PR #92 squash SAU PR đợt 3** (bước 0 của CODE-PROMPT kiểm cả hai trên `dev`) rồi giao Neon (prompt ở §2)                                                                                                            |
| **Đợt 5 phần 1 — Redis**    | Spec 2.4 / plan 1.4 trên `dev` (`docs/reviews/redesign-w5-redis-2026-11-27/`): BullMQ qua outbox relay cho mail, rate-limit Redis (`@nest-lab/throttler-storage-redis@1.2.0`, `ioredis@5.11.1`), Bull Board `/ops/queues` (tắt mặc định, chỉ đọc, Basic Auth), job dọn đêm 00:00 giờ VN (C1–C4, giữ 30 ngày, **chạy một lượt khi worker khởi động — BullMQ không chạy bù**), không cache GET, sweeper giữ trong API. Bảo đang code `feat/redesign-w5-redis` (T1→T6→C1→T7→T11→C2). Owner muốn **đợi Bảo xong hết rồi review một lần** (gợi ý: khi C1 báo run id thì liếc nhanh T2). Giải thích dễ hiểu cho Owner: Docs `Requiments/giai-thich-redis-bullmq.md` |
| Đợt 5 phần 2 (AI)           | Chưa spec. Dùng khung hàng đợi phần 1 (SPEC Redis §9). Viết spec sau khi đợt 4 vào `dev` (phụ thuộc phiếu nhiều mục)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Docs (`main`)               | 6 commit chưa push (Owner push): `DECISIONS.md` các mục 25–27/11, báo cáo `Research-AI/vendors/doi-chieu-mo-hinh-kho-voi-hang-2026-11-25.md`, `Requiments/giai-thich-redis-bullmq.md`. File `Diagrams/use-case-diagram/saas-sentry-use-case-diagram.drawio` đang sửa dở trong máy **không phải của điều phối** — để nguyên                                                                                                                                                                                                                                                                                                                                    |
| Tài liệu dẫn xuất           | Owner 25/11: **hoãn tới khi code xong mọi đợt**: QĐ-121+ (gom `DECISIONS.md` từ W3M-* trở đi + "mua trực tiếp từ hãng, trả bằng thẻ công ty"), BRD/Scope (4.19/2.15) kèm dọn lịch sử, US 150 phát hiện + 11 câu, file giải thích kho (+ L-6), `mainflows.md`, vẽ lại **ERD** (từ `prisma/models`) và **State Machine** (mẫu trường), BRD §7.5 thêm lưu giữ outbox/phiên 30 ngày                                                                                                                                                                                                                                                                               |

## 2. Prompt dán cho Neon — đợt 4 (sau khi PR đợt 3 và PR #92 đã squash)

> `git fetch origin`. Đọc `docs/reviews/redesign-w4-2026-11-25/CODE-PROMPT.md` trên `origin/dev` và làm đúng theo đó: bước 0 kiểm
> điều kiện (đợt 3 đã vào dev, SPEC 3.x + DELTA có trên dev), chạy lại DELTA trên `origin/dev`, chạy CI tay trên `dev` làm nền; rồi điều
> phối nhiều subagent song song theo PLAN (wave A → B1/B2 → C1/C2 → D), mỗi cổng gộp trong worktree riêng, tự đọc `git diff` từng gói
> đối chiếu SPEC, chạy CI tay và ghi `PROGRESS-biz.md`. Áp đủ LUẬT CỨNG. Gặp điều kiện dừng ⟹ ghi D-n và hỏi.

## 3. Bài học đợt 3 (áp mọi đợt sau, đã đưa vào CODE-PROMPT đợt 4)

- Neon hay **báo `xong` khi spec còn đỏ**, gọi test đỏ là "nợ nền dev" mà không kiểm — luôn tự kiểm CI so với run dev nền **theo từng
  test**; nợ hợp lệ = test khẳng định hành vi cũ đã bị luật mới thay.
- Commit "fix CI" từng **tự thêm luật nghiệp vụ** (FIFO lô, kẹp `runningUncommitted` theo ngày vào phòng) — mọi review phải soi luật tiền
  trong commit sửa test/seed.
- Test giả gặp: tự viết `SELECT … FOR UPDATE` thay service; mock chính thứ đang kiểm; `@Optional` + `typeof x === 'function'` để chiều
  mock; xóa test không có ca thay; fixture ghi `unit_price_minor` trong khi code đọc giá tháng/giá dòng.
- Quy trình review mỗi lượt: 2–5 Opus chỉ đọc theo phạm vi (gói / xuyên suốt / CI) ⟹ 1 Opus đối kháng kiểm độc lập ⟹ hỏi Owner từng
  câu (AskUserQuestion, có khuyến nghị) ⟹ `FIX-*.md` push lên `int/<đợt>` từ worktree riêng ⟹ prompt dán cho Neon.

## 4. Việc tiếp theo (thứ tự)

1. Review FINAL-4 đợt 3 (CI `45974586113`) ⟹ đóng đợt 3 (§1) ⟹ PR ⟹ API description đợt 3 ⟹ hỗ trợ Owner deploy.
2. Owner squash PR #92 ⟹ Neon đợt 4 (§2). Theo dõi từng cổng: review cổng bằng Opus (đọc diff gói, test thật, luật tiền/quyền), CI so nền.
3. Bảo báo xong Redis (C2) ⟹ review một lần (đối chiếu SPEC 2.4, audit code/test giả, điểm gộp với đợt 3) ⟹ PR ⟹ checklist deploy
   (`REDIS_PASSWORD` trong `.env` VPS, dọn container `slm-redis` cũ, `TRUST_PROXY_HOPS=1`).
4. Spec đợt 5 phần 2 (AI) sau khi đợt 4 vào `dev` ⟹ đợt 6 ⟹ đợt 8 (FIX-TEST + seed + Tool) ⟹ đợt 7 ⟹ Prompt 4+6 ⟹ lượt tài liệu cuối.

## 5. Quy ước (Owner)

Như handoff 25/11 §3, thêm: Opus mặc định cho spec/review/docs (Fable chỉ khi luật tiền/quyền cực nặng, hỏi trước); khuyến nghị chỉ đưa
Owner sau reviewer độc lập; mọi prompt code có LUẬT CỨNG + Skill Preflight theo bước; Docs commit thẳng `main`, không push; push nhánh
feature/int được; merge `dev`/`main`, deploy chỉ Owner; `dev` chỉ nhận squash, PR tách từ `dev`; commit không co-author AI. Handoff
điều phối luôn ở BE `docs/reviews/coordinator-<ngày>/HANDOFF-CHAT.md` (nhánh docs từ `origin/dev`, PR).

## 6. Bổ sung sau khi viết (Owner 27/11)

- **Đợt 6:** mở lại 4 operation "nên tách" của V5 (kiểm `subscriptionRenewalPropose` sau P18 đợt 3) cùng 6 operation bắt buộc; **không**
  giữ route cũ `deprecated` — FE tự sửa sau khi đợt 6 deploy ⟹ route cũ xóa luôn (DECISIONS "Phạm vi đợt 6", W6-SCOPE-1/2). Ghi QĐ sửa
  `QĐ-118b`(4) khi viết spec đợt 6.
- **Prompt 4+6 (cuối):** ngoài review sâu, có một mục **dọn code thừa**: tìm và xóa code/route/DTO/repo/test/tài liệu của flow cũ không
  còn dùng (công cụ: `ts-prune`/`knip` hoặc grep tham chiếu, `arch:capabilities`, đồ thị module; đối chiếu SPEC các đợt), đưa danh sách
  cho Owner duyệt trước khi xóa; chạy CI đầy đủ sau khi xóa. Đợt 8 đã có phần xóa test/flow cũ (`project_wave8_test_cleanup`) — Prompt
  4+6 rà phần code `src/` còn sót.

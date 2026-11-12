# Prompt cho chat code Sonnet (effort high) — chạy lần lượt trong **một** chat

> Dán từng prompt khi prompt trước đã báo xong. Thứ tự Owner chốt: **sửa bug ⟹ MF-2/MF-3 ⟹ feedback FE ⟹ pha cuối**. Mốc nghiệp vụ:
> Docs `main @ 373bb6b`. Nguồn luật đứng đầu: [OWNER-REVIEW.md](OWNER-REVIEW.md) (điểm Owner chưa duyệt vẫn là luật tạm; Owner đổi thì sửa sau).

## Prompt 1 — sửa bug BE

```text
Bạn là dev BE của SaaS-Sentry (NestJS + Prisma, modular monolith). Repo: D:\FPT\FALL2026\Code\BE-dev-software-license-management,
nhánh feat/mf2-mf3. Trả lời tiếng Việt.

Đọc theo thứ tự: AGENTS.md → ARCHITECTURE.md → docs/reviews/be-bugfix-2026-11-12/SPEC.md (v1.2) → PLAN.md (§0 là quy trình bắt buộc)
→ docs/reviews/fe-feedback-2026-11-11/OWNER-REVIEW.md (luật đã chốt). Chỉ đọc thêm rule ở docs/rules/ khi task cần (bảng "Read only
what the task needs" trong AGENTS.md).

Làm tuần tự từng task của PLAN (BUG-A rồi BUG-B), mỗi task:
1. Policy thuần: viết test trước, chạy thấy đỏ.
2. Code đúng kiến trúc: capability folder, chỉ import module khác qua public/, không query bảng module khác, hậu tố file đúng vai,
   trần 25 file mỗi thư mục, tầng theo scripts/arch/tiers.cjs.
3. Tự đọc diff của task.
4. Quick check CHỈ: pnpm typecheck, pnpm lint, 1–2 file test của task (task đổi route/cạnh module thêm pnpm arch:check).
5. git add đúng các file của task (KHÔNG add docs/reviews/** của người khác) rồi commit "fix(<module>): …"; ghi một dòng vào
   docs/reviews/be-bugfix-2026-11-12/HANDOFF-CODE.md (task, commit, lệnh + kết quả thật, lệch SPEC nếu có).
Cuối mỗi gói: pnpm test:gates, pnpm rules:check, pnpm openapi:export, pnpm arch:routes, pnpm arch:graph; cập nhật tài liệu API FE ở
D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\ (reference + changelog route bị xóa) — KHÔNG commit repo Docs.

Cấm: chạy pnpm check / test:http / test:integration / test:flows (để pha cuối); push, merge, deploy; sửa repo Docs ngoài thư mục
API-Integration; tự bịa luật. Luật thiếu hoặc SPEC mâu thuẫn code ⟹ dừng task đó, ghi vào HANDOFF-CODE.md mục "Cần Owner", làm task
khác không phụ thuộc. Gặp lỗi gate/test: tìm nguyên nhân gốc rồi mới sửa, không tắt test.

Xong cả hai gói: báo ngắn (task xong, commit, kết quả gate cuối, việc còn treo) rồi DỪNG, chờ prompt 2.
```

## Prompt 2 — MF-2/MF-3

```text
Tiếp tục cùng repo, cùng nhánh. Đọc docs/reviews/mf2-mf3-2026-11-10/SPEC.md (v2.3) và PLAN.md (v2.3); luật: QD-110-DRAFT.md cùng thư
mục, docs/reviews/fe-feedback-2026-11-11/OWNER-REVIEW.md, Docs main @ 373bb6b (BRD 4.12, "Quy trình và chính sách theo main flow" 1.9
mục MF-2/MF-3, US EP-03/EP-07/EP-12) — chỉ mở đoạn Docs mà task dẫn tới.

Làm đúng thứ tự gói ở PLAN §2 (X0 → … → RD), bỏ qua gói Z (để pha cuối). Quy trình mỗi task và mỗi gói giống prompt 1 (test đỏ trước
cho policy, quick check, commit theo task, một dòng vào docs/reviews/mf2-mf3-2026-11-10/HANDOFF-CODE.md, cuối gói chạy test:gates +
rules:check + openapi:export + cập nhật tài liệu API FE). Migration: số theo dải trong SPEC, giá trị enum mới ở migration _values riêng
đứng trước, expand–contract, không drop. Chú ý các điểm review đã chốt: X-SA đổi ràng buộc trước rồi mới kết thúc dòng SERVICE + chèn
dòng PERSONAL; MF3-B giải phóng cam kết đúng MỘT lần (bỏ qua SeatReleaseService khi nguồn thu hồi là TRANSFER); R-49 cấp lại cùng thuê
bao trong ân hạn thì kết thúc quyền cũ ngay lúc cấp.

Cấm giống prompt 1. Xong: báo ngắn rồi DỪNG, chờ prompt 3.
```

## Prompt 3 — sửa theo feedback FE

```text
Tiếp tục cùng repo, cùng nhánh. Đọc docs/reviews/fe-feedback-2026-11-11/SPEC.md (v2.1) và PLAN.md (v2.1); luật: OWNER-REVIEW.md,
QD-111-DRAFT.md cùng thư mục, Docs main @ 373bb6b. Khi cần lý do/hiện trạng mới mở R8–R15, F1–F4, REVIEW-SPEC-*.md cùng thư mục.

Làm đúng thứ tự gói ở PLAN §2 (FX-1 → … → PF-1), bỏ qua Z2 (pha cuối). Gói SM-1 (seat-tháng) làm trước RV-1. Gói PL-1 task 1.5 (seed 8
chính sách) dùng docs/reviews/fe-feedback-2026-11-11/POLICY-SEED-DRAFT.md; nếu OWNER-REVIEW.md mục E chưa ghi Owner duyệt thì vẫn
seed nhưng đánh dấu "nháp demo" và ghi vào HANDOFF-CODE.md. Quy trình mỗi task/gói giống prompt 1 (HANDOFF ở
docs/reviews/fe-feedback-2026-11-11/HANDOFF-CODE.md). Mỗi gói có bộ test số trong SPEC §8 — viết đúng các con số đó.

Cấm giống prompt 1. Xong: báo ngắn rồi DỪNG, chờ prompt 4.
```

## Prompt 4 — pha cuối (full test, dữ liệu thật, seed)

```text
Tiếp tục cùng repo, cùng nhánh. Pha cuối theo PLAN §0 của ba PLAN:
1. Tự review TOÀN BỘ diff `git diff origin/dev...HEAD` so với ba SPEC (bug-fix v1.2, MF-2/MF-3 v2.3, FE v2.1): mỗi điều kiện xong (S/D) có
   code + test; sửa chỗ lệch.
2. Full test: pnpm check, pnpm test:http, pnpm test:integration, pnpm test:flows (DB test cô lập theo test/README.md). Sửa tới xanh,
   ghi lệnh + kết quả thật.
3. Gọi API thật trên DB local có dữ liệu (theo các kịch bản DEMO-1…15 trong SPEC FE §Z2 và kịch bản MF-2/MF-3 trong SPEC §Z).
4. Seed: làm gói Z (MF-2/MF-3) và Z2 (FE) — ngày tương đối với hôm nay; reset DB local, pnpm seed:local, chạy lại test:flows + vài kịch
   bản tay; sửa seed tới khi sạch.
5. Cập nhật docs/roadmap.md, tài liệu API FE lần cuối, pnpm openapi:export.
6. Viết docs/reviews/fe-feedback-2026-11-11/HANDOFF-REVIEW.md: tóm tắt thay đổi theo gói, commit range, kết quả mọi lệnh, lệch SPEC,
   câu "Cần Owner", rủi ro. Rồi DỪNG — chat review (Opus) sẽ review/verify; không push/merge.
```

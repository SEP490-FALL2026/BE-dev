# Đợt 4 — chia hai làn Neon ‖ Bảo (bản 3.2, 27/11/2026)

> Owner 27/11: Bảo nhận một phần đợt 4; **hai người không đợi nhau**, cả hai xong ⟹ điều phối gộp, review, audit. File này **thay** phần
> "ai làm gì / nhánh / cổng" của [PLAN.md](PLAN.md) mục 1–2 và [CODE-PROMPT.md](CODE-PROMPT.md) mục 1–2; mọi thứ khác (SPEC, bảng file 3.1, file gộp 3.2,
> chi tiết gói mục 7, LUẬT CỨNG 1–22, bộ kiểm nhanh, khuôn gói) **giữ nguyên**. Prompt của Bảo: [CODE-PROMPT-BAO.md](CODE-PROMPT-BAO.md).

## 1. Chia gói

| Làn                           | Người                           | Gói (theo PLAN mục 7)                                                                                                               | Vì sao độc lập                                                                                                                         |
| ----------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **B — refactor Request đơn**  | Bảo (Codex, một agent, tuần tự) | **A-T1** → **A-POL2** → **B-SUBMIT-R** → **B-NEED-R** → **B-SPEND-R**                                                               | Không migration, không dùng model mới; chỉ phụ thuộc nhau (refactor sau đặc tả A-T1 xanh trên CI — LUẬT 2). Không chung file với làn N |
| **N — phiếu mới**             | Neon (orchestrator + subagent)  | **A-DB** → **A-POL1** ‖ … → **G-HTTP** → **B-CORE**, **B-REPLY** → **C-WITHDRAW**, **C-BATCH**, **C-CONV**, **C-VIEW**, **C-LISTS** | Phụ thuộc của các gói này (PLAN mục 2) đều nằm trong làn N; không gói nào cần B-SUBMIT-R / B-NEED-R / B-SPEND-R / A-POL2               |
| **Nối** (sau khi gộp hai làn) | Neon                            | **C-SUBMIT**, **C-NEED**, **C-SPEND** → **D-MOBILE**, **D-SEED**, **D-DOCS**                                                        | Cần cả hai làn (C-SUBMIT ◄ B-SUBMIT-R, C-NEED ◄ B-NEED-R, C-SPEND ◄ B-SPEND-R + A-POL2; D-\* ◄ C-\*)                                   |

Kiểm tra không chung file (PLAN bảng 3.1): làn B chỉ chạm `request-intake/access-request.service.ts` (+spec mới), `access-request/request-facts.service.ts`
(chỉ thêm `assessParty`) + `request-facts-party.service.spec.ts`, `need-decision/need-decision.service.ts` (+spec mới), `spend-approval/spend-decision.service.spec.ts`,
`spend-approval/spend-batch-decision.service.ts` (+spec), `spend-approval/spend-item-outcome.policy.ts` (+spec), `access-request/withdrawal.policy.ts` (+spec),
`ti/request-single-characterization…`, `ti/head-withdraw-submission-queue…`, `ts/request-ticket-harness.ts`. Không file nào thuộc làn N.

## 2. Điểm chạm duy nhất — harness

`ts/request-ticket-harness.ts` (`buildTicketWorld`) thuộc **A-T1 (Bảo)** nhưng integration của làn N (B-CORE, B-REPLY, C-\*) dùng nó.

- Bảo làm và **push A-T1 đầu tiên** (một commit riêng `test(requests): ticket world harness …`, trước phần spec đặc tả nếu cần) lên `feat/redesign-w4-lane-b`.
- Neon **không đợi**: unit và policy của làn N không cần harness; khi tới bước integration, `git merge origin/feat/redesign-w4-lane-b` **chỉ** commit harness
  (hoặc `git checkout origin/feat/redesign-w4-lane-b -- test/support/request-ticket-harness.ts` rồi commit `test(requests): take ticket harness from lane B`).
- Cần đổi harness ⟹ **không** sửa ở làn N; ghi _Bàn giao_ cho điều phối (sửa lúc gộp hai làn).

## 3. Nhánh và cổng

| Mục       | Làn B (Bảo)                                                                                                                                                                                                                    | Làn N (Neon)                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nền       | `feat/redesign-w4` (Neon tạo ở cổng 0 từ `origin/dev` sau khi đợt 3 vào) — Bảo tự tạo nếu chưa có, cùng lệnh CODE-PROMPT mục 1                                                                                                 | như CODE-PROMPT mục 1                                                                                                                                                           |
| Nhánh làn | `feat/redesign-w4-lane-b` (một nhánh, commit tuần tự theo gói)                                                                                                                                                                 | `feat/redesign-w4-wave-<a\|b\|c>` + nhánh gói như PLAN mục 1, **chỉ gói của làn N**; gộp ff vào `feat/redesign-w4-lane-n` (thay cho `feat/redesign-w4`)                         |
| Worktree  | `D:/FPT/FALL2026/Code/w4-lane-b`                                                                                                                                                                                               | như PLAN mục 1 (`w4-<gói>`, `w4-gate`)                                                                                                                                          |
| Tracker   | `pkg/<gói>.md` từng gói + `PROGRESS-lane-b.md`                                                                                                                                                                                 | `PROGRESS-biz.md`, `pkg/<gói>.md`                                                                                                                                               |
| Cổng / CI | **B0:** A-T1 + A-POL2 xong ⟹ CI tay trên `lane-b`: `request-single-characterization`, `head-withdraw-submission-queue` + 3 spec unit đặc tả xanh (= C0). **B1:** ba refactor xong ⟹ CI tay: đặc tả vẫn xanh, không đổi kỳ vọng | Cổng A (bỏ yêu cầu C0 — thuộc làn B; giữ `request-ticket-schema`, `request-reply-schema` xanh + G-HTTP), cổng B (B-CORE, B-REPLY), cổng C (5 gói C của làn N) — CI tay mỗi cổng |
| Run nền   | Chung: run CI tay trên `dev` ghi ở cổng 0 (`PROGRESS-biz.md` "CI nền")                                                                                                                                                         | như trên                                                                                                                                                                        |
| Xong làn  | B1 xanh ⟹ báo điều phối: sha cuối, run id, bảng ca → test                                                                                                                                                                      | cổng C xanh ⟹ báo điều phối                                                                                                                                                     |

Không ai merge sang làn kia (trừ mục 2), không rebase nhánh người khác, không vào `dev`/`int/*`, không mở PR.

## 4. Gộp hai làn (điều phối)

1. Worktree riêng `D:/FPT/FALL2026/Code/w4-join`: `feat/redesign-w4` ⟵ `--no-ff` `lane-n` rồi `lane-b`. Xung đột chỉ được ở file gộp (PLAN 3.2:
   `requests.module.ts`/`requests-http.module.ts`, registry/manifest, `openapi.json`, `docs/generated/*`) ⟹ giữ mọi dòng, sinh lại. Xung đột khác ⟹ dừng, hỏi.
2. Sửa ghép tối thiểu đã biết: fixture `AccessRequestRecord` trong spec mới của làn B thêm `ticket: null` (B-CORE đổi kiểu — I-3).
3. Bộ kiểm nhanh + CI tay trên `feat/redesign-w4`; phân loại từng test so với run nền; review Opus hai làn (code + test giả + luật tiền/quyền) + Opus đối kháng
   ⟹ `FIX-W4-*.md` cho từng làn sửa trên nhánh làn của mình.
4. Đạt ⟹ Neon mở wave **nối**: C-SUBMIT, C-NEED, C-SPEND (song song, nền `feat/redesign-w4`) ⟹ cổng ⟹ D-MOBILE, D-SEED, D-DOCS ⟹ cổng D (CODE-PROMPT mục 7).

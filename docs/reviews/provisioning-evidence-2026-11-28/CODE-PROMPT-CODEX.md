# Prompt dán sẵn cho Codex — File bằng chứng khi cấp/thu hồi (28/11/2026)

> Dán khối dưới vạch vào **một** phiên Codex. Chạy song song đợt 4 (làn N, làn B) — không chạm file của họ.

---

Trả lời bằng **tiếng Việt**; giữ tiếng Anh cho tên file, hàm, lệnh, mã lỗi, code.

Bạn code tính năng **file bằng chứng khi IT Admin hoàn tất cấp/thu hồi** cho BE SaaS-Sentry (NestJS 11 + Prisma 7 + PostgreSQL). Làm trong worktree
**`D:/FPT/FALL2026/Code/BE-evidence`**, nhánh **`feat/provisioning-evidence-files`** (đã tạo từ `origin/dev` `595cdc48`). Thư mục việc
`docs/reviews/provisioning-evidence-2026-11-28/`. Bảy gói **tuần tự** P1 → P2a → P2b → (mốc) → P3a → P3b → (mốc) → P4 → P5. Chế độ tự quyết: làm hết không chờ duyệt giữa gói; chỉ dừng
ở LUẬT CỨNG / điều kiện dừng.

## 0. Skill Preflight (trước mọi việc, và lại sau mỗi lần compact)

Đọc đủ `SKILL.md`: `superpowers:executing-plans` (process), `superpowers:test-driven-development`, repo skill `.claude/skills/be-quick-check/SKILL.md`,
`.claude/skills/create-migration/SKILL.md` (P1), `superpowers:verification-before-completion` (trước mọi commit/báo cáo). Không có đúng tên ⟹ skill gần
nhất, ghi mapping. Liệt kê skill đã đọc ở đầu mọi báo cáo.

Đọc trong repo: `AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/module-structure.md`, `docs/rules/api-contract.md`, `docs/rules/database-business.md`,
`docs/rules/security-jobs.md` (mục file/object storage), `test/README.md`, `src/modules/licensing/README.md`, `src/modules/catalog/README.md`. Đọc trọn
**`SPEC.md`** và **`PLAN.md`** của thư mục việc.

## 1. Chuẩn bị

```bash
cd D:/FPT/FALL2026/Code/BE-evidence
git fetch origin && git status && git log --oneline -3     # phải ở feat/provisioning-evidence-files, có commit docs SPEC/PLAN
pnpm install --frozen-lockfile --prefer-offline && pnpm prisma:generate
gh run list --branch dev --workflow ci.yml -L 3             # run nền: run dev mới nhất đã xong
```

Tạo `docs/reviews/provisioning-evidence-2026-11-28/PROGRESS.md`: bảng gói → trạng thái → sha → EV → lệnh kiểm + số pass/fail thật → CI; mục `D-n`; run nền.

## 2. LUẬT CỨNG

1. **Không đổi hành vi nghiệp vụ ngoài SPEC mục 5** (EV-01…EV-16), kể cả khi thấy hợp lý hơn ⟹ ghi `D-n` _cần Owner_ ở `PROGRESS.md`, giữ hành vi cũ.
2. **Sửa service cũ thì giữ mọi kiểm cũ** (guard, đọc lại sau khóa, mã lỗi, thứ tự kiểm); liệt kê dưới `Kiểm giữ:` trong commit message.
3. **Spec unit nằm cạnh file nó test**; test lỗi khẳng định **mã lỗi** (và `problem` khi có), không chỉ HTTP status.
4. **Không nới** test, gate, manifest, registry, eslint-suppressions để cho xanh. **Không đổi kỳ vọng test cũ** — chỉ thêm ca. Ngoại lệ duy nhất (SPEC EV-01): danh sách
   `NEW_DOCUMENT_PURPOSES` ở `contract.policy.spec.ts:69-75` và số operation ở `openapi-presentation.http-spec.ts`.
5. Không chạm `src/modules/requests/**`, `prisma/migrations/*` đã có, `scripts/verify/merged-migrations.txt`. Chỉ hai migration mới của P1.
6. Không sửa tay `openapi.json`, `docs/generated/*` — chỉ qua `pnpm openapi:export`, `pnpm arch:routes`, `pnpm arch:graph`.
7. Trần: 500 dòng code/file, 60 dòng/hàm, 25 file/thư mục (thư mục `licensing/provisioning/` **đã đủ 25** — file mới vào `provisioning/evidence-files/`),
   spec unit ≤ 400 dòng (`revocation.policy.spec.ts` 389 — không thêm vào), integration/http ≤ 800, `test/support` ≤ 400.
8. ADR-0019: `licensing` chỉ gọi `catalog` qua `src/modules/catalog/public/*`; không query `document_attachments` từ `licensing`.
9. Mỗi commit: bộ kiểm nhanh PLAN mục 4 + `CI=true pnpm test -- <spec unit của file đã sửa>`; kết quả thật ghi `PROGRESS.md`.
10. **Không** chạy full test / integration / Docker / seed / migration ở máy — integration và http chạy trên CI GitHub (P5).
11. Không `git stash` (stash dùng chung mọi worktree); xem bản cũ bằng `git show <sha>:<file>`.
12. Gói hỏng sau 2 vòng sửa ⟹ lưu patch WIP vào `docs/reviews/provisioning-evidence-2026-11-28/wip-<gói>.patch`, khôi phục file của gói, ghi `PROGRESS.md`,
    dừng gói đó. **Không commit code đỏ.**

## 3. Từng gói

Theo PLAN mục 6 (khuôn mục 5, bước 0 → 8). Lưu ý:

- **P1:** guard `document_attachment_guard` **không đổi** (SPEC §4); commit P1 gồm cả union `DocumentPurpose` + `PURPOSE_ROLES` để typecheck xanh.
- **P2:** WebP chỉ cho hai purpose mới; purpose cũ giữ PDF/PNG/JPEG. `mayOpen` không bao giờ `OPEN` file bằng chứng `READY` qua route chung.
- **P3:** gắn file **trong** giao dịch của `ProvisioningTaskFrame.work`, là **dòng đầu** callback `write` (trước mọi khóa khác); từ chối ⟹ cả giao dịch hủy. Tên file nhóm `provisioning-evidence-files.*`.
- **P4:** quyền đọc dùng `requireActingItAdmin` (IT **đang** phụ trách), **không** dùng `getItAdminScope`; ngoài phạm vi ⟹ 404 `PROVISIONING_TASK.NOT_FOUND`.
- **P5:** push; `gh workflow run ci.yml --ref feat/provisioning-evidence-files`; phân loại **từng test đỏ** so với run nền (đỏ cùng tên trên nền = nợ cũ;
  đỏ mới = sửa, tối đa 2 vòng, CI lại).

## 4. Dừng (báo cáo rồi dừng)

1. SPEC im lặng hoặc mâu thuẫn với code ở chỗ ảnh hưởng nghiệp vụ (quyền, ai xem, khi nào gắn) ⟹ `D-n` _cần Owner_; nếu chặn gói ⟹ dừng.
2. Cần sửa file ngoài bảng PLAN mục 3 ở module khác `catalog`/`licensing`/`test/**`/`prisma/**` (gói P1) ⟹ dừng.
3. Migration không viết được mà không sửa migration cũ ⟹ dừng.
4. CI có test đỏ mới không sửa được sau 2 vòng ⟹ dừng.

## 5. Không được làm

Không merge/rebase nhánh khác; không vào `dev`/`main`; **không mở PR**; không co-author; không ghi "Owner đã duyệt"; không thêm dependency.

## 6. Báo cáo cuối (≤ 40 dòng)

Skill đã đọc; bảng gói → sha → EV → lệnh kiểm + số pass/fail thật; nhánh guard đã chọn (P1); run CI (link) + phân loại từng test đỏ; `Kiểm giữ:` của P3;
`D-n`; file nào gần trần; câu bắt buộc "Full test chỉ chạy trên CI GitHub". Rồi **dừng**, chờ điều phối review.

# Prompt dán sẵn cho chat code — Đợt 5 phần 1: Redis/BullMQ (làn `tech`, Bảo, chế độ tự quyết, bản 1.1)

> Dán nguyên khối dưới vạch vào một chat code mới (Sonnet/Gemini, hoặc Neon điều phối) **sau khi** Owner duyệt SPEC bản 2 + PLAN. Một làn duy nhất (`tech`). Quy trình
> chung: `docs/guides/quy-trinh-code-ai.md`.

---

**LÀN:** tech (Bảo, có Docker) · **Nhánh:** `feat/redesign-w5-redis` tách từ `origin/dev` · **Không có nhánh gộp riêng** (Owner quyết PR vào `dev` sau C1 và sau C2)
**Owner đã chốt (27/11/2026):** OQ-W5R-1 = A bản gọn (nhóm 1 bắt buộc: Redis prod + CI + rate-limit Redis; nhóm 2: relay mail qua BullMQ bản gọn + Bull Board) ·
OQ-W5R-2 = A (tái dùng `email_outbox`) · OQ-W5R-3 = A (mail nằm lại outbox chờ Redis + công tắc `BACKGROUND_JOBS_TRANSPORT=poll`) · OQ-W5R-4 = A (dự phòng bộ nhớ
từng tiến trình, **thư viện `@nest-lab/throttler-storage-redis`** bọc lớp dự phòng mỏng, không tự viết Lua) · OQ-W5R-5 = A (Bull Board `/ops/queues` tắt mặc định, chỉ
đọc, Basic Auth tài khoản vận hành riêng so trên hash, **không** đếm lần sai, **không** nới CSP) · OQ-W5R-6 = A (sweeper giữ trong API) · review RV-1 → RV-7 và lượt 2 RV2-* đã áp (SPEC §14, §14.2).

Trả lời bằng **tiếng Việt**. Giữ nguyên tiếng Anh cho tên file, hàm, lệnh, mã lỗi và code.

Bạn là người code làn `tech` của đợt 5 phần 1 BE SaaS-Sentry (NestJS 11 + Prisma + PostgreSQL, modular monolith). Repo:
`D:\FPT\FALL2026\Code\BE-dev-software-license-management`. Thư mục việc: `docs/reviews/redesign-w5-redis-2026-11-27/`. Đây là **chế độ tự quyết**: làm hết các gói
không chờ duyệt giữa gói; câu nhỏ tự chọn theo căn cứ và ghi lại (mục 4); chỉ dừng ở điều kiện cứng (mục 5) hoặc LUẬT CỨNG.

## LUẬT CỨNG (đọc trước mọi thứ, áp mọi gói, không ngoại lệ)

1. **Không đổi hành vi ngoài SPEC.** Code thật khác SPEC, hoặc SPEC không nói mà phải chọn một hành vi nghiệp vụ (ai nhận mail, khi nào gửi, số lần thử, mã lỗi FE thấy,
   giới hạn rate-limit) ⟹ **giữ hành vi cũ**, ghi `D-n` mức **cần Owner** (mục 4), làm tiếp phần không phụ thuộc. Không tự "sửa cho đúng hơn". Đợt này **không** đổi API
   (`openapi.json` không drift) và **không** migration.
2. **Refactor giữ mọi lần kiểm cũ.** Gói chuyển/gom code (T1 chuyển `queue.config.ts`; T7 `deliver()` trả kết quả, `claimDue` dùng điều kiện chung; T8 viết lại
   `QueueInfrastructureModule`) ⟹ trước khi sửa, **liệt kê** mọi lần kiểm/guard/throw của đoạn cũ; sau khi sửa mỗi lần kiểm còn nguyên (cùng điều kiện, cùng mã lỗi,
   cùng thông báo); ghi danh sách vào **commit message** mục `Kiểm giữ:` (PLAN ghi sẵn danh sách cho T1, T7, T8). Test cũ của đoạn đó xanh **không đổi kỳ vọng**.
3. **Spec cạnh file nó kiểm; test lỗi khẳng định mã.** `<tên>.ts` ⟹ `<tên>.spec.ts` cùng thư mục. Test nhánh lỗi khẳng định **mã** (`EnvironmentValidationError` + tên
   khóa, mã lỗi job trong `EMAIL_JOB_ERROR_CODES`, `last_error_code`, status HTTP), không chỉ "throws". Mỗi bảng SPEC ⟹ một `it.each` đúng các dòng.
4. **Không nới gì để xanh.** Không sửa/nới test, assertion, gate, manifest, registry (`GRAPH_WIRING_EXCEPTIONS`, `RUNTIME_*_EXCEPTIONS`, danh sách `needed` của
   `deployment-roles` ngoài đúng gói SPEC/PLAN nêu); không `skip`/`only`/xóa test; không `eslint-disable`, không thêm `eslint-suppressions.json`; không hạ ngưỡng. Test
   Redis **không** tự bỏ qua khi thiếu `TEST_REDIS_URL` trên CI. **Ngoại lệ duy nhất:** các ca spec env PLAN T1 bảng _Spec env cũ đổi kỳ vọng_ liệt kê — đổi đúng như
   bảng, ghi từng ca vào commit mục `Đổi kỳ vọng:`.
5. **Gói hỏng sau 2 vòng sửa** (bộ kiểm nhanh vẫn đỏ, hoặc integration của gói không ra đúng tiêu chí SPEC) ⟹
   `git --no-pager diff > docs/reviews/redesign-w5-redis-2026-11-27/wip/<gói>.patch` (chỉ file của gói), `git restore --source=HEAD -- <đúng các file của gói>` (không
   `reset --hard`), ghi `PROGRESS-tech.md` `dừng hỏi` + đường dẫn patch, sang gói độc lập kế (nếu có). **Không commit code đỏ.**
6. **Orchestrator tự đối chiếu trước khi ghi `xong`.** Người chạy prompt (hoặc agent điều phối) tự đọc `git --no-pager diff <sha trước>..HEAD -- <file của gói>` (không
   tin báo cáo của subagent), đối chiếu **từng** tiêu chí SPEC §6 của gói (tiêu chí → test → `file:line`), ghi bảng vào PROGRESS. Còn một tiêu chí dở ⟹ `đang làm` /
   `dừng hỏi`, **không** `xong`.
7. **Mỗi commit:** bộ kiểm nhanh (mục 3 bước 6) + `CI=true pnpm test -- <spec của file đã sửa>` + integration **của gói** trên Docker (PLAN _Bộ kiểm nhanh_) + ghi 1–2 test
   quan trọng nhất vào commit message mục `Test chính:`.
8. **Không lọt dữ liệu cá nhân vào Redis hay log.** Dữ liệu job chỉ `{ outboxId }`; lỗi ném từ processor chỉ `new Error(<mã>)`; `stackTraceLimit: 0`; log dùng
   `describeForOperator`, không message lỗi, không địa chỉ email, không payload. Không dùng Redis cho phiên, khóa nghiệp vụ, tiền (`no-redis-in-modules`).
9. **Mô tả và comment không chứa mã nội bộ** (`QĐ-`, `FR-`, `US-`, `OQ-`, `RV-`, `R-0`, `T-W5R`, `D-n`). Comment trong `src` nói lý do.
10. **Chạy được trên máy:** bộ kiểm nhanh, unit file sửa, integration **đúng các file của gói** trên Docker (PostgreSQL + Redis test container). **Không** chạy `pnpm check`,
    full `test:integration`, `test:http`, `test:e2e`, seed, migration trên DB demo. Full suite chỉ trên **CI GitHub** ở C1, C2.

## 0. Skill Preflight (bắt buộc, trước mọi việc, và lại sau mỗi lần compact context)

1. Liệt kê skill có sẵn. Đọc đầy đủ `SKILL.md` theo **bước**:
   - **Code** (mỗi gói): `superpowers:executing-plans` (process) + `superpowers:test-driven-development` + repo skill `.claude/skills/be-quick-check/SKILL.md`.
   - **Verify** (trước mọi `xong`, commit, báo cáo): `superpowers:verification-before-completion`.
   - Khi đọc tài liệu thư viện (BullMQ 6, `@nest-lab/throttler-storage-redis`, `@bull-board/*`, `ioredis`): `agent-skills:source-driven-development`.
     Không có đúng tên ⟹ skill gần nhất, ghi mapping. Skill chỉ chuẩn hóa cách làm; LUẬT CỨNG, PLAN, SPEC thắng skill.
2. Đọc trong repo: `AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/README.md`, `docs/guides/quy-trinh-code-ai.md`, `docs/rules/module-structure.md`,
   `docs/rules/security-jobs.md`, `docs/rules/database-business.md`, `test/README.md`, `docs/guides/containers.md`.
3. Đọc trọn **`SPEC.md`** (bản 2.1), **`PLAN.md`** (bản 1.1), `ADR-DRAFT.md`. Luật ở SPEC §5, tiêu chí ở §6, test ở §7. SPEC §10 (đã chốt), §11 (tự chốt), §14 (review đã áp): không
   hỏi lại, không tự đổi. `OWNER-ANSWERS.md` để tra lý do.
4. Đọc `PROGRESS-tech.md`, `OVERNIGHT-DECISIONS-tech.md` (nếu có) — trí nhớ qua compact.
5. Đầu mỗi báo cáo liệt kê skill/rule đã đọc và mục đích.

## 1. Chuẩn bị nhánh (chỉ lần đầu)

```bash
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management status --short     # phải sạch
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management fetch origin
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management --no-pager log --oneline -1 origin/dev
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management merge-base --is-ancestor 3d6b558d origin/dev && echo "nen OK"
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management --no-pager ls-tree --name-only origin/dev docs/reviews/redesign-w5-redis-2026-11-27/SPEC.md
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management config user.email   # phải là email của Bảo
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management checkout -b feat/redesign-w5-redis origin/dev
```

- Thiếu nền `3d6b558d` hoặc thiếu thư mục việc trên `origin/dev` ⟹ **dừng, báo lại**.
- `user.email` sai ⟹ sửa ở **repo này** (không `--global`); không biết ⟹ dừng, hỏi.
- Đã có nhánh ⟹ `checkout`, đối chiếu `git --no-pager log` với `PROGRESS-tech.md`, làm tiếp gói kế.
- Tạo nếu chưa có: `FIX-TEST-tech.md` (`| Gói | File test | Ca | Lý do |`), `OVERNIGHT-DECISIONS-tech.md` (bảng mục 4), thư mục `wip/`.
- Đợt 3 hoặc đợt 4 đã vào `dev` trước khi bắt đầu ⟹ đọc PLAN _Điểm gộp_ GP-1 → GP-5, làm theo khi tới file đó.
- Dựng Docker test (PLAN _Bộ kiểm nhanh_): `slm-test-db` (PostgreSQL 17) + `slm-test-redis` (`redis:8-alpine --maxmemory-policy noeviction`).

## 2. Thứ tự gói

**T1 → T2 → T3 → T4 → T5 → T6 → C1 → T7 → T8 → T9 → T10 → T11 → C2** (PLAN mục _Gói_). Ở C1: push, CI GitHub tay, đối chiếu, báo điều phối; **làm tiếp nhóm 2** trừ khi điều
phối bảo dừng. **Chỉ sửa file trong danh sách của gói** (PLAN _Chi tiết gói_, _Tự kiểm chéo_). Cần file khác ⟹ không sửa, ghi _Bàn giao_ trong PROGRESS, làm tiếp phần
không phụ thuộc.

## 3. Cách làm từng gói

1. Đọc lại `PROGRESS-tech.md`, mục SPEC của gói, mục gói trong PLAN. Mở code thật ở các `file:line` (SPEC đọc trên `3d6b558d`; dòng có thể đã dời) và xác nhận hiện
   trạng. Khác mà không đổi luật ⟹ làm theo SPEC, ghi `D-n` (tự chốt). Khác mà đổi luật ⟹ LUẬT CỨNG 1.
2. Ghi gói `đang làm` vào `PROGRESS-tech.md`.
3. **Unit test đỏ trước** (PLAN _Test trước_ của gói); `CI=true pnpm test -- <file>` thấy đỏ đúng lý do.
4. Code tối thiểu cho xanh, theo: tầng và cửa `public/` (ADR-0019; `src/infrastructure` không import module; worker/app chỉ qua `public/` và `*.module.ts`); hậu tố file
   (`.job.ts` cho relay/consumer), một `@Injectable` mỗi file; trần 500 dòng/file, `complexity` 12, hàm 60 dòng, 8 tham số. Gói npm mới chỉ đúng gói PLAN nêu, `pnpm add -E`,
   bản ≥ 14 ngày, `pnpm audit --prod --audit-level high` xanh.
5. Viết integration của gói (≤ 800 dòng mỗi file), chạy **đúng file đó** trên Docker. Chờ điều kiện bằng vòng hỏi có hạn (≤ 10 s), không `sleep` cố định; mỗi file một
   tiền tố Redis (`withRedisPrefix`).
6. **Bộ kiểm nhanh** (`be-quick-check`), tất cả xanh:

   ```text
   pnpm typecheck
   pnpm lint
   pnpm arch:check
   pnpm rules:check
   pnpm test:gates
   pnpm openapi:export && git --no-pager diff --stat openapi.json     # phải rỗng
   CI=true pnpm test -- <mọi *.spec.ts đã chạm hoặc thêm>
   ```

   Thêm `pnpm rules:format` khi sửa `docs/rules/*.md`, `ARCHITECTURE.md`, `src/**/README.md`, `test/README.md`, `ci.yml`; `docker compose config --quiet` khi sửa compose.

7. Test cũ khẳng định hành vi cũ: đợt này không đổi luật nghiệp vụ; **chỉ** các ca spec env ở PLAN T1 (bảng _Spec env cũ đổi kỳ vọng_ — `env-matrix.spec.ts`,
   `env-example.spec.ts`, `env-schema.spec.ts`; căn cứ SPEC §5.10, R-01) được đổi kỳ vọng, đúng giá trị bảng ghi, ghi tên ca + mục SPEC vào commit. Test cũ khác đỏ ⟹ tìm
   lỗi của mình trước; chỉ khi chắc là nợ test (harness, thời gian) ⟹ `FIX-TEST-tech.md`, không xóa, không `skip`.
8. **Tự review diff** (LUẬT CỨNG 6): bảng tiêu chí → test → `file:line`; không thừa phạm vi (SPEC §2.2); không mã nội bộ (LUẬT CỨNG 9); không dữ liệu cá nhân vào
   Redis/log (LUẬT CỨNG 8).
9. Commit một gói một commit (hoặc vài commit nhỏ cùng gói) bằng **git identity của Bảo**; **không** `Co-Authored-By`/attribution AI. Message:
   `feat(<vùng>): <tóm tắt> (redesign W5 <gói>)` + thân: mục SPEC (R-xx); `Test chính:`; `Kiểm giữ:` (gói refactor); `D-n` nếu có.
10. Cập nhật `PROGRESS-tech.md`: `xong` (chỉ khi LUẬT CỨNG 6 đạt), sha, lệnh + kết quả thật (số test pass/fail, file integration đã chạy), FIX-TEST, D-n, chỗ chưa kiểm.
    Push sau mỗi vài gói: `git push -u origin feat/redesign-w5-redis`.

## 4. Tự quyết và ghi lại (`OVERNIGHT-DECISIONS-tech.md`)

Câu nhỏ SPEC không nói mà **không** đổi hành vi nghiệp vụ ⟹ không dừng, cân 2–3 phương án, chọn theo căn cứ: SPEC (§5, §11) → PLAN → ADR-DRAFT → tài liệu chính thức của
thư viện bản đã ghim → code/test hiện có → rule repo. Ưu tiên đơn giản, dễ đảo, không đổi contract. Ghi:

```md
| D-n | Gói | file:line | Câu hỏi | Phương án A/B/C | Chọn + căn cứ | Cách đảo lại | Mức (tự chốt / cần Owner) |
```

Được tự quyết: tên file/hàm/lớp trong thư mục PLAN đã chỉ (biến thể worker đã chốt: `WorkerModule` tĩnh = `poll` + `WorkerModule.forTransport`), câu SQL, cách dựng test, câu chữ log,
bản chính xác của gói npm (theo luật ≥ 14 ngày). **Không** tự quyết (⟹ `cần Owner`, giữ hành vi cũ): số lần thử/lịch gửi mail, người nhận, ngưỡng rate-limit, mã lỗi FE
thấy, nới CSP, thêm đếm lần sai, dùng Redis cho thứ ngoài SPEC. Còn < 10 % context ⟹ ghi _Dừng ở đâu_ rồi dừng.

## 5. Điều kiện DỪNG cứng

Dừng gói đó, ghi `PROGRESS-tech.md` kèm `file:line`, 2–3 lựa chọn và khuyến nghị, báo điều phối, làm tiếp gói độc lập nếu có:

1. Luật không rõ mà mục 4 không giải được; code thật khác SPEC theo cách đổi hành vi nghiệp vụ.
2. Cần migration, sửa `prisma/`, hoặc sửa `src/modules/**` ngoài `notifications` (email, repo, `public/email-delivery.*`, module, README).
3. Cần gói npm ngoài `ioredis`, `@nest-lab/throttler-storage-redis`, `@bull-board/api`, `@bull-board/express`; hoặc `@nest-lab/throttler-storage-redis` không có bản khai hỗ
   trợ `@nestjs/throttler` 6.x phát hành ≥ 14 ngày, hoặc không nhận client `ioredis` dựng sẵn; hoặc `@bull-board/api`/`@bull-board/express` không có bản (≥ 14 ngày) hợp
   `bullmq` 6 và Express 5.
4. Gate chỉ xanh khi nới gate / thêm suppression / thêm mục registry ngoài PLAN (LUẬT CỨNG 4).
5. Giao diện Bull Board không chạy dưới CSP mặc định của `helmet()` (Owner: không nới CSP).
6. Hành vi BullMQ 6 thật khác SPEC (`deduplication` Simple Mode không bỏ qua job trùng khi job chưa xong, hoặc không gỡ khóa khi job `completed`/`failed`;
   `stackTraceLimit: 0` vẫn lưu stack) — ghi bằng chứng (test integration đỏ + trích tài liệu).
7. Thiếu nền/thư mục việc ở `origin/dev`; cây làm việc có thay đổi lạ; git identity không phải của Bảo.

## 6. Không được làm

- Không chạy `pnpm check`, full `test:integration`/`test:http`/`test:e2e`, seed, migration trên DB thật; không đụng DB/Redis của VPS.
- Chỉ push `feat/redesign-w5-redis`. Không merge vào `dev`, `main`, `int/*`; không mở PR; không deploy.
- Không sửa `openapi.json`, `docs/generated/*`, `src/generated/*` bằng tay; không sửa `pnpm-lock.yaml` bằng tay.
- Không sửa 28 sweeper `*.job.ts`, `RequestWorkLoop`, `src/modules/notifications/public/notifications.types.ts`, `inbox/**`, `notifications.extension-points.ts` (đợt 3).
- Không xóa/`skip` test; không `eslint-disable`; không co-author; không commit bằng identity người khác.
- Không làm ngoài phạm vi (SPEC §2.2 — đặc biệt đối soát, `jobId` cố định, backoff tùy biến, đếm lần sai Bull Board, nới CSP, giờ Việt Nam trong mail), kể cả thấy lỗi gần
  đó — ghi vào báo cáo cuối.
- Không tự ghi Owner đã duyệt hay nghiệm thu; không đổi trạng thái ADR-0020 khỏi **Proposed**.

## 7. Checkpoint C1, C2: CI GitHub đầy đủ (chạy tay) rồi báo cáo

1. Push rồi `gh workflow run ci.yml --ref feat/redesign-w5-redis`. Không chạy được `gh` ⟹ báo điều phối (GitHub → Actions → CI → Run workflow).
2. Theo dõi: `gh run list --workflow ci.yml --branch feat/redesign-w5-redis`, `gh run view <id> --log-failed`. Kiểm log job `integration` có spec Redis **chạy** (số test > 0).
3. Job đỏ do **logic** ⟹ sửa, kiểm nhanh, commit, push, chạy lại; do **nợ test** cũ không liên quan ⟹ `FIX-TEST-tech.md`.
4. Ghi mỗi lần chạy vào bảng _CI GitHub_ của `PROGRESS-tech.md`.
5. Báo cáo (≤ 60 dòng): skill đã đọc; bảng gói → sha → R-xx → lệnh kiểm + kết quả; CI từng job (link); Trọng tâm review 1–5 → test; ca diệt đột biến (C2); D-n (đánh
   dấu _cần Owner_); điểm gộp đã gặp; việc ngoài phạm vi; _Bàn giao_ (đợt 5 phần 2). Câu bắt buộc: "Full test chỉ chạy trên CI GitHub".

Sau C2 **dừng**, chờ Opus review. Sửa finding xong ⟹ CI lại như bước 1–4 rồi báo lại. Không mở PR, không merge.

## 8. Ghi chú khi chạy bằng Neon / Antigravity (agent điều phối nhiều subagent)

- **Mỗi gói một subagent, tuần tự** (không song song, không worktree, không hai subagent cùng sửa một file). Điều phối giao đúng **một** gói kèm đường dẫn SPEC/PLAN và
  LUẬT CỨNG; subagent báo xong ⟹ điều phối tự làm LUẬT CỨNG 6 trước khi giao gói kế.
- Mọi lệnh `git` dùng `--no-pager`. Jest dùng `CI=true`: Git Bash `CI=true pnpm test -- <file>`; **PowerShell** `$env:CI='true'; pnpm test -- <file>`.
- Shell Windows: đường dẫn tuyệt đối; lệnh dài tách nhỏ; không `&` chạy nền. Docker container test đặt tên cố định (`slm-test-db`, `slm-test-redis`), dọn bằng
  `docker rm -f` khi xong làn.

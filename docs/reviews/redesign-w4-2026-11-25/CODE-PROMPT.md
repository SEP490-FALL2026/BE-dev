# Prompt dán sẵn cho Neon — Đợt 4 thiết kế lại (phiếu nhiều mục, orchestrator + subagent song song, bản 3.1)

> **Bản 3.2 (27/11) — chia hai làn:** Owner chốt Bảo làm **làn B** (A-T1, A-POL2, B-SUBMIT-R, B-NEED-R, B-SPEND-R — prompt riêng
> [CODE-PROMPT-BAO.md](CODE-PROMPT-BAO.md)); Neon (orchestrator) làm **làn N** (A-DB, A-POL1, G-HTTP, B-CORE, B-REPLY, C-WITHDRAW, C-BATCH, C-CONV, C-VIEW,
> C-LISTS) rồi, sau khi điều phối gộp hai làn, **gói nối** C-SUBMIT, C-NEED, C-SPEND, D-MOBILE, D-SEED, D-DOCS. Nhánh, cổng, điểm chạm harness:
> [SPLIT-2-LANES.md](SPLIT-2-LANES.md) — **thắng** mục 1–2 dưới đây khi khác. Orchestrator **không** giao gói của làn B; cổng A bỏ điều kiện C0 (thuộc làn B).
>
> **Bản 3.1 (27/11):** Owner chốt OQ-W4-5 = A, OQ-W4-6 = A, OQ-W4-7 = A; OQ-W4-8 đóng. Áp review độc lập (I-1…I-6, M-1…M-10 — SPEC §16.4): cổng 0 kiểm SPEC
> 3.x trên `dev` và chạy run CI nền tay; gói vá G-HTTP ở cổng A; wave B chia B1/B2; orchestrator gộp trong worktree `w4-gate`; đột biến xong phải `git restore`.
>
> **Bản 3.0 (27/11):** Owner 27/11 — **Neon code toàn bộ đợt 4**, một chat orchestrator điều phối **nhiều subagent song song** (mỗi subagent một worktree,
> một nhánh gói). Theo SPEC/PLAN bản 3.0 và [DELTA-W3-FOR-W4.md](DELTA-W3-FOR-W4.md). Bỏ hai làn `biz`/`tech`, bỏ Docker: integration/http chạy trên **CI
> GitHub ở mỗi cổng**. LUẬT CỨNG thêm 15–22 (rút ra từ `FIX-W3-FINAL*.md` đợt 3 và cách chạy song song).
>
> Dán nguyên khối dưới vạch vào **một** chat Antigravity/Gemini (orchestrator) **sau khi** Owner duyệt SPEC/PLAN bản 3.0 **và** đợt 3 đã vào `dev`. Orchestrator
> tự dựng prompt cho từng subagent theo mục 3. Quy trình chung: `docs/guides/quy-trinh-code-ai.md` (ngoại lệ song song của đợt 4 — OQ-W4-6).

---

**Vai:** orchestrator đợt 4 · **Nhánh đợt:** `feat/redesign-w4` (từ `origin/dev` sau khi đợt 3 vào) · **Nhánh làn:** `feat/redesign-w4-wave-<a|b|c|d>` ·
**Nhánh gói:** `feat/redesign-w4-<gói>` · **Tối đa 4 subagent cùng lúc**

**Owner đã chốt:** OQ-W4-1 = A (phiếu 1–6 mục) · OQ-W4-2 = A (`QĐ-116b` ở đợt 4, đúng `NOT_SUBMITTED`) · OQ-W4-3 = A (không mã hiển thị) · OQ-W4-4 = A
(mỗi mục một thông báo) — cùng là `QĐ-120p` · `NESTED_ARRAYS` `requestTicketSubmit#ticket.items`, `requestTicketGet#ticket.items` = **duyệt** · Ghi chú trả lời chỉ
bắt buộc sau _Trả về của người_ chưa trả lời (`QĐ-114q`, SPEC §7.9) · Xác nhận lần hai, AI, tách dòng Request nhóm: **không** thuộc đợt 4 (`QĐ-118a`, `QĐ-118c`) ·
Neon làm toàn bộ, song song (Owner 27/11) · **OQ-W4-5 = A**: chặn trùng trong phiếu **theo gói** (`planId`); hai gói _— năm_ / _— tháng_ (`L-1`) không chặn — ngoại lệ Owner chấp nhận so với
`QĐ-116az`(1) · **OQ-W4-6 = A**: ngoại lệ
quy trình **riêng đợt 4** — được dùng worktree, nhiều subagent song song, orchestrator được gộp vào `feat/redesign-w4*` (khác `docs/guides/quy-trinh-code-ai.md:31`;
guide sửa sau khi đánh giá đợt 4) · **OQ-W4-7 = A**: CI đầy đủ chạy tay ở mỗi cổng.
**Không còn câu chờ** (OQ-W4-8 đóng — không migration, không sửa `catalog`).

Trả lời bằng **tiếng Việt**. Giữ nguyên tiếng Anh cho tên file, hàm, lệnh, mã lỗi và code.

Bạn là **orchestrator** đợt 4 thiết kế lại BE SaaS-Sentry (NestJS 11 + Prisma + PostgreSQL, modular monolith). Repo:
`D:\FPT\FALL2026\Code\BE-dev-software-license-management` (`<R>`). Thư mục việc: `docs/reviews/redesign-w4-2026-11-25/`. Bạn **không** tự code gói (trừ "gói vá"
giữa hai wave và commit cổng); bạn dựng worktree, giao gói cho subagent, **tự đọc diff** từng gói, gộp ở cổng, chạy CI, ghi tracker. **Chế độ tự quyết:** làm hết
các wave không chờ duyệt giữa gói; câu nhỏ tự chọn theo căn cứ và ghi (mục 4); chỉ dừng ở điều kiện cứng (mục 5) hoặc LUẬT CỨNG.

## LUẬT CỨNG (đọc trước mọi thứ; orchestrator chép nguyên mục này vào prompt của mọi subagent)

1. **Không đổi hành vi ngoài SPEC.** Code thật khác SPEC, hoặc SPEC không nói mà phải chọn một hành vi nghiệp vụ (tiền, quyền, trạng thái, người nhận thông
   báo, mã lỗi trả cho FE) ⟹ **giữ hành vi cũ**, ghi `D-n` mức **cần Owner**, làm tiếp phần không phụ thuộc. Không tự "sửa cho đúng hơn". OQ chưa chốt ⟹ theo
   **khuyến nghị** SPEC §12, ghi `D-n` _cần Owner_.
2. **Refactor giữ mọi lần kiểm cũ.** Gói tách/gom code (B-SUBMIT-R, B-NEED-R, B-SPEND-R, phần lô của C-BATCH, C-CONV, mọi tách file vì trần) ⟹ **chỉ bắt đầu sau
   cổng A (C0)**: spec đặc tả `access-request.service.spec.ts`, `need-decision.service.spec.ts`, `spend-decision.service.spec.ts` +
   `request-single-characterization.integration-spec.ts` **xanh trên CI**. Trước khi sửa, liệt kê mọi lần kiểm/guard/throw/`catch` của đoạn cũ; sau khi sửa, mỗi
   lần kiểm còn nguyên (cùng điều kiện, cùng mã lỗi); ghi vào commit message mục `Kiểm giữ:` (guard thật, không liệt kê lệnh chạy). Spec đặc tả và test cũ
   xanh **không đổi kỳ vọng** (chỉ thêm ca).
3. **Spec cạnh file nó kiểm; test lỗi khẳng định mã lỗi.** `<tên>.ts` ⟹ `<tên>.spec.ts` cùng thư mục (ngoại lệ có tiền lệ ghi ở PLAN, vd
   `request-facts-party.service.spec.ts`). Mọi test nhánh lỗi khẳng định **mã** (`code`/`DOMAIN.REASON`, hoặc `reason` của kết quả từng mục) và status. Mỗi
   bảng ca SPEC ⟹ một `it.each` đúng các ca.
4. **Không nới gì để xanh.** Không sửa/nới test, assertion, gate, manifest, registry (`COLLECTION_EXCEPTIONS`, `NESTED_ARRAYS` ngoài mục SPEC cho phép,
   `NO_EXAMPLE_RESPONSES`, `GRAPH_WIRING_EXCEPTIONS`, `RUNTIME_*_EXCEPTIONS` ngoài SPEC §5); không `skip`/`only`/xóa test; không `eslint-disable`, không thêm
   `eslint-suppressions.json`; không hạ ngưỡng.
5. **Gói hỏng sau 2 vòng sửa** ⟹ subagent `git --no-pager diff > docs/reviews/redesign-w4-2026-11-25/wip/<gói>.patch`, `git restore --source=HEAD -- <file
của gói>` (không `reset --hard`), ghi `dừng hỏi` + đường dẫn patch ở `pkg/<gói>.md`, báo orchestrator. **Không bao giờ gộp code đỏ** vào nhánh làn hay
   `feat/redesign-w4`.
6. **Orchestrator tự đối chiếu trước khi ghi `xong`.** Tự đọc `git --no-pager diff feat/redesign-w4-wave-<x>...feat/redesign-w4-<gói>` (không tin báo cáo
   subagent), đối chiếu **từng** ca SPEC của gói (ca → test → `file:line`), ghi bảng vào PROGRESS. `xong-unit` khi unit + bộ kiểm nhanh xanh và integration/http
   **đã viết**; `xong` chỉ khi spec của gói xanh trên CI của cổng.
7. **Mỗi commit:** bộ kiểm nhanh (PLAN mục 4) + `CI=true pnpm test -- <spec của file đã sửa>` + 1–2 test quan trọng nhất của luật mới (tên ở commit, mục `Test
chính:`).
8. **Mô tả OpenAPI không chứa mã nội bộ:** `QĐ-`, `FR-`, `US-`, `W[1-5]-`, `D-`, `DL-`, `OQ-`, `MF-`, `SBF-`, `T-W4-` (kiểm `grep -nE
"QĐ-|FR-|US-|W[1-5]-|\bD-[0-9]|DL-[0-9]|OQ-|MF-|SBF-|T-W4-" openapi.json` chỉ ra chỗ có từ trước đợt). Comment `src` nói lý do, không mã `W4-xx`.
9. **Không chạy full test, Docker, seed, migration trên máy.** Chỉ bộ kiểm nhanh + unit file sửa. Integration/http/e2e chạy trên **CI GitHub ở cổng** (mục 2).
10. **QĐ-118 (quyền theo phạm vi):** phiếu **không** thêm quyền nào. Cấp phát từng mục qua tác vụ cấp hiện có (`requireActingItAdmin`,
    `OrganizationReadApi.itAdminsActingFor`); không nhánh "IT khác làm thay", không hàng việc chung. Quyết nhu cầu chỉ người giữ bước nhu cầu của **từng** mục;
    quyết chi chỉ Người duyệt chi giữ bước chi của **từng** mục; rút cả phiếu chỉ người xin. **Fixture QĐ-118 + sau đợt 3** (SPEC §11.2): phòng có trưởng phòng,
    IT phụ trách (`setItAdminInCharge`), phòng khác giao IT2 (`handOthersToSecondItAdmin`), Cost Center + ngân sách có số, `runningUncommittedMinor = 0` khẳng định
    trước ca, Người duyệt chi có vai, nhân viên đủ `employment_type`, lần xếp phòng hợp lệ, gói `K2` có workspace + dòng giá tháng (một dòng sống mỗi gói mỗi
    workspace), gói `K4` qua `POST /license-lots`, ngày cố định.
11. **Thứ tự khóa (SPEC §6.2, bảng gộp đợt 3):** không thêm tầng. Gửi phiếu: employee `FOR SHARE` (1) → advisory `requests.limits` (2) → đơn vị, Cost Center,
    department (2) → kiểm mục (đọc) → **pha 1** chèn phiếu + **mọi** mục theo `ticket_position` → **pha 2** `SpendRoutingService.start` từng mục theo `position`
    (Request vừa chèn (4), reprice, CC-year (10)) — **E5** chỉ cho Request do chính tx chèn ở pha 1. Quyết nhiều mục / rút cả phiếu: **mỗi mục một tx**, không khóa
    phiếu. Lô: `lockAll` theo id giữ nguyên, chỉ đổi **thứ tự xử lý**; `results`, `batches.create.items`, `recorder.submitted` theo **thứ tự thân**. Comment đầu
    service mới ghi thứ tự khóa (số tầng mới). Đường khóa thật khác bảng ⟹ dừng.
12. **Ranh giới đợt 5:** không chấm _Đạt/Không đạt_ câu có luật dữ liệu, không cặp (Request, câu) lệch, không cờ _duyệt dù hệ thống báo không đạt_, không AI.
    Kết quả quyết nhiều mục luôn **theo từng mục**.
13. **Ghi chú trả lời (SPEC §7.9, §7.10):** chỉ đòi khi có lần _Trả về của người_ (nhu cầu / đánh giá IT / chi) **chưa** có reply; bị chặn, thiếu giá, kiểm lại
    của hệ thống **không** đòi. Không unique DB trên `returned_step_id`; ở lô chỉ lưu reply khi mục đi tiếp (`SENT_TO_APPROVER`/`AWAITING_RESERVE_CONFIRMATION`).
    Thiếu ghi chú ⟹ 422 `ACCESS_REQUEST.REPLY_NOTE_REQUIRED` (gửi lại) hoặc `STOPPED REPLY_NOTE_REQUIRED` (lô) — không dùng `VALIDATION_ERROR` cho luật theo trạng thái.
14. **Lỗi cấp phiếu luôn thắng lỗi mục (SPEC §7.2):** kiểm người/phòng một lần trước vòng mục (`assessParty`); vòng mục chỉ bắt **đúng** 6 lớp lỗi SPEC liệt kê;
    lớp khác ⟹ ném lên. Thứ tự: Zod → `TOO_MANY_ITEMS` → người/phòng → mục. `assessParty` **chỉ** route phiếu gọi; `submitWithin` của Request đơn không gọi (I-1).
    Trùng trong phiếu = cùng `planId` (OQ-W4-5 = A). Enum `reason` đóng 16 giá trị (SPEC §8.3; 7 giá trị thời hạn = `TermRefusal`).
15. **Commit "fix CI" không thêm luật nghiệp vụ.** Sửa CI chỉ sửa đúng lỗi đã phân loại; luật mới ngoài SPEC ⟹ LUẬT 1 (giữ hành vi SPEC, `D-n` _cần Owner_).
16. **Không xóa test không có ca thay thế.** Test đổi đối tượng/kỳ vọng phải ghi **căn cứ luật mới** (mục SPEC) trong commit; gom/đổi tên spec phải đếm lại `it`/
    `expect` trước–sau ghi vào `pkg/<gói>.md`.
17. **Không nới kỳ vọng** (`toEqual` ⟹ `toMatchObject`, `toBe(n)` ⟹ `>= n`, bỏ khẳng định mã) trừ khi luật mới làm giá trị đó không xác định — ghi căn cứ.
18. **Test đi qua code thật.** Unit gọi service/policy thật, chỉ mock biên; integration gọi route/service thật; ca đồng thời: 2 connection, barrier, lặp 20, cả
    hai bên gọi **service/route thật** — **không** tự viết `SELECT … FOR UPDATE` thay service, không mock chính thứ đang kiểm, không dựng kỳ vọng bằng chính công
    thức của code; luật tiền có ca biên + ca diệt đột biến.
19. **DI bắt buộc.** Không `@Optional()`, không phụ thuộc/hook `?`, không fallback `typeof … === 'function'`/giá trị mặc định im lặng trên phụ thuộc nghiệp vụ
    (đợt 3 F-20/G-4/H-6). Không thêm phụ thuộc vào provider của `requests-work-facade.module.ts`/`requests-routing-facade.module.ts` (worker) — cần thì dừng, _Bàn giao_.
20. **Không ghi `xong` khi spec http/integration của gói còn đỏ trên CI** (bài học FIX-B1/F3 đợt 3).
21. **Nợ chỉ là nợ khi cũng đỏ trên run `dev` nền** (id ghi ở cổng 0), phân loại **theo từng test** (tên test, không theo file spec); spec "nợ cũ" mà số test đỏ
    tăng ⟹ từng test đỏ thêm phải được giải thích (luật đợt 4 nào) hoặc sửa. `FIX-TEST-w4.md` ghi lý do **thật**.
22. **Ranh giới song song.** Subagent chỉ sửa file của gói mình (PLAN bảng 3.1) + **thêm dòng** ở file gộp (PLAN 3.2); không sửa file của gói khác, không sửa
    `PROGRESS-biz.md`/`FIX-TEST-w4.md`/`OVERNIGHT-DECISIONS-biz.md` (ghi ở `pkg/<gói>.md`); không merge, không rebase nhánh người khác; chỉ push nhánh gói của
    mình. Orchestrator là người duy nhất gộp, sinh lại `openapi.json`/`docs/generated/*`, sửa harness giữa hai wave.

## 0. Skill Preflight (bắt buộc, trước mọi việc, và lại sau mỗi lần compact context)

1. Liệt kê skill có sẵn; đọc đủ `SKILL.md` của bộ theo bước:

   | Bước                 | Ai           | Skill                                                                                                                                               |
   | -------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Điều phối song song  | orchestrator | `superpowers:dispatching-parallel-agents` (process) + `superpowers:subagent-driven-development`                                                     |
   | Code một gói         | subagent     | `superpowers:executing-plans` (process) + `superpowers:test-driven-development` + repo skill `.claude/skills/be-quick-check/SKILL.md`               |
   | Gói migration (A-DB) | subagent     | thêm repo skill `.claude/skills/create-migration/SKILL.md` (gọi tay ⟹ **đọc file**; thay `db:migrate:dev` bằng `prisma migrate diff` — PLAN bước M) |
   | Gói thêm route       | subagent     | thêm `agent-skills:api-and-interface-design` (đọc tham khảo)                                                                                        |
   | Verify               | cả hai       | `superpowers:verification-before-completion` trước mọi `xong-unit`/`xong`, commit, đóng cổng, báo cáo                                               |

   Không có đúng tên ⟹ skill gần nhất (`agent-skills:incremental-implementation`, `agent-skills:test-driven-development`), ghi mapping. **Không** dùng
   `superpowers:finishing-a-development-branch` (Owner mở PR). Worktree tạo bằng lệnh `git worktree` ở mục 2 (không cần `using-git-worktrees`). Skill chỉ chuẩn hóa
   cách làm; LUẬT CỨNG, PLAN, SPEC thắng skill.

2. Đọc trong repo: `AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/README.md`, `docs/guides/quy-trinh-code-ai.md`, `docs/rules/database-business.md` (_Thứ tự khóa
   chuẩn_), `docs/rules/module-structure.md`, `docs/rules/api-contract.md`, `docs/rules/work-item-sizing.md`, `test/README.md`, `src/modules/requests/README.md`.
3. Đọc trọn **`SPEC.md`**, **`PLAN.md`**, **`DELTA-W3-FOR-W4.md`** — nguồn duy nhất của việc cần làm. SPEC §14 _Tự chốt_ và dòng `Owner đã chốt:` — không hỏi lại.
4. Đọc `PROGRESS-biz.md`, `OVERNIGHT-DECISIONS-biz.md` (nếu có) — trí nhớ qua compact. Ghi rule _Skill-first_ (CLAUDE.md workspace) ở đầu `PROGRESS-biz.md`.
5. Đầu mỗi báo cáo liệt kê skill/rule đã đọc và mục đích.

## 1. Cổng 0 — kiểm đợt 3 đã vào `dev`, tạo nhánh (chỉ lần đầu)

```bash
R=D:/FPT/FALL2026/Code/BE-dev-software-license-management
git -C $R status --short                                   # phải sạch
git -C $R fetch origin
git -C $R --no-pager log --oneline -15 origin/dev
# (0) SPEC/PLAN đợt 4 bản 3.x và DELTA đã ở dev (I-6): dòng đầu SPEC phải ghi "bản 3."; ls-tree phải in DELTA
git -C $R --no-pager show origin/dev:docs/reviews/redesign-w4-2026-11-25/SPEC.md | head -1
git -C $R --no-pager ls-tree --name-only origin/dev docs/reviews/redesign-w4-2026-11-25/DELTA-W3-FOR-W4.md
# (a) đợt 3 đã vào dev: phải in đủ 3 dòng
git -C $R --no-pager ls-tree --name-only origin/dev prisma/migrations/20261204000500_w3_final3_request_monthly_price_check \
  src/modules/catalog/public/license-lot.api.ts src/modules/catalog/public/seat-ledger.api.ts
# (b) migration cuối của dev: >= 20261204000500 và < 20261210000000
git -C $R --no-pager ls-tree --name-only origin/dev prisma/migrations/ | tail -3
# (c) phần code đợt 3 còn lệch dev (sau FIX-W3-FINAL-4): ghi vào DELTA nếu có
git -C $R --no-pager diff --stat origin/dev origin/int/redesign-w3 -- src prisma
# (d) DELTA mục 4: ba lệnh kiểm lại (diff từ 20ae45ee, grep khóa E5, grep @Optional)
git -C $R config user.email                                # phải là email của Owner
```

- (0) SPEC trên `dev` không phải bản 3.x hoặc thiếu DELTA ⟹ **DỪNG**: "Spec đợt 4 bản 3.x chưa vào `dev`". Báo Owner.
- (a) thiếu dòng ⟹ **DỪNG**: "Đợt 3 chưa vào `dev` — không tách `feat/redesign-w4`". Báo Owner, không làm gì thêm.
- (b) migration cuối ≥ `20261210…` ⟹ dừng (dải đợt 4 bị chiếm).
- (c), (d) có lệch ⟹ thêm `DL-24…` vào `DELTA-W3-FOR-W4.md` (file:line mới, ảnh hưởng, xử lý) trước khi mở wave A; lệch **đổi luật** hoặc grep khóa E5 không
  rỗng ⟹ dừng, hỏi Owner.
- Tạo nhánh và mốc CI nền:

```bash
git -C $R checkout -b feat/redesign-w4 origin/dev
git -C $R push -u origin feat/redesign-w4
gh workflow run ci.yml --ref dev                            # run nền CHẠY TAY (I-5) — không lấy run do push
gh run list --workflow ci.yml --branch dev --event workflow_dispatch --limit 1   # id run vừa chạy; chờ xong, ghi id + từng job vào PROGRESS "CI nền"
git -C $R worktree add D:/FPT/FALL2026/Code/w4-gate feat/redesign-w4   # worktree cổng của orchestrator (M-8)
```

- Tạo nếu chưa có (mẫu ở `PROGRESS-biz.md`): `PROGRESS-biz.md` (điền), `OVERNIGHT-DECISIONS-biz.md` (bảng mục 4), `FIX-TEST-w4.md` (**chỉ orchestrator** ghi — M-7), thư mục `pkg/`, `wip/`.
  Commit `docs(requests): wave-4 trackers and delta re-check (redesign W4 gate 0)` lên `feat/redesign-w4`.

## 2. Vòng điều phối một wave (A, B, C, D — theo PLAN mục 2, 6, 7)

1. **Mở wave:** `git -C $R branch feat/redesign-w4-wave-<x> feat/redesign-w4 && git -C $R push -u origin feat/redesign-w4-wave-<x>`.
2. **Dựng worktree mỗi gói:** `git -C $R worktree add -b feat/redesign-w4-<gói> D:/FPT/FALL2026/Code/w4-<gói> feat/redesign-w4-wave-<x>`; trong worktree
   `pnpm install --frozen-lockfile --prefer-offline` rồi `pnpm prisma:generate`. Tên gói viết thường: `a-db`, `a-t1`, `a-pol1`, `a-pol2`, `b-core`, `b-reply`,
   `b-submit-r`, `b-need-r`, `b-spend-r`, `c-submit`, `c-need`, `c-spend`, `c-withdraw`, `c-batch`, `c-conv`, `c-view`, `c-lists`, `d-mobile`, `d-seed`, `d-docs`.
3. **Giao song song** (`superpowers:dispatching-parallel-agents`): tối đa 4 subagent một lúc; mỗi subagent nhận **đúng một** gói với prompt mục 3. Gói refactor
   (B-SUBMIT-R, B-NEED-R, B-SPEND-R) chỉ giao khi cổng A có `request-single-characterization` xanh trên CI (C0). Wave B: đợt B1 (b-core, b-reply, b-submit-r,
   b-need-r) rồi B2 (b-spend-r) (M-1). Wave C: đợt C1 (c-submit, c-need, c-spend, c-withdraw) rồi C2 (c-batch, c-conv, c-view, c-lists). Mỗi đợt cùng nền
   nhánh làn.
4. **Nhận kết quả:** subagent trả ≤ 30 dòng + `pkg/<gói>.md` + nhánh đã push. Không tin báo cáo — làm **G2** (PLAN mục 6): đọc diff, đối chiếu từng ca, kiểm danh
   sách file, `Kiểm giữ:`, không `@Optional`, không `skip`/xóa test, spec cũ chỉ thêm dòng. Thiếu ⟹ gửi lại **cùng** subagent (cùng nhánh) với danh sách thiếu;
   sau 2 vòng ⟹ LUẬT 5.
5. **Gộp ở cổng** (PLAN mục 6, G3–G6) — **trong worktree `D:/FPT/FALL2026/Code/w4-gate`**, không trong `<R>` (M-8): `git checkout feat/redesign-w4-wave-<x>`; `git merge --no-ff feat/redesign-w4-<gói>` theo thứ tự gộp của wave; xung đột chỉ
   ở file gộp ⟹ giữ mọi dòng thêm, `openapi.json`/`docs/generated/*` sinh lại; xung đột file khác ⟹ dừng. Bộ kiểm nhanh đầy đủ trên nhánh làn + `CI=true pnpm test
-- src/modules/requests src/app src/worker`; **cổng A thêm gói vá G-HTTP** (PLAN mục 7 — chuyển toàn bộ 28 controller sang `requests-http.module.ts`, `src/app/app.module.ts` + spec, `exports`; `docs/generated/routes.md`
   không đổi) trước CI cổng A; từ wave B, controller mới vào `requests-http.module.ts`. Commit cổng.
6. **CI tay** (OQ-W4-7 = A): `git push origin feat/redesign-w4-wave-<x>`; `gh workflow run ci.yml --ref feat/redesign-w4-wave-<x>`; `gh run list --workflow
ci.yml --branch feat/redesign-w4-wave-<x>`; đỏ ⟹ `gh run view <id> --log-failed`; phân loại **theo từng test** so với run nền (LUẬT 21): test mới đỏ ⟹ trả gói
   sở hữu (sửa trên nhánh gói, gộp lại); hồi quy (xanh trên nền) ⟹ gói gây ra sửa; đỏ cả trên nền ⟹ `FIX-TEST-w4.md`. Ghi bảng _CI GitHub_ của PROGRESS.
7. **Đóng cổng:** đủ điều kiện (PLAN bảng _Cổng_) ⟹ `git checkout feat/redesign-w4 && git merge --ff-only feat/redesign-w4-wave-<x> && git push`; PROGRESS gói ⟹
   `xong`; `git worktree remove D:/FPT/FALL2026/Code/w4-<gói>`; mở wave kế.
8. **Gói vá giữa hai wave** (chỉ orchestrator, tuần tự, trước khi mở wave kế): sửa harness `test/support/request-ticket-harness.ts` hoặc chữ ký sai của gói đã gộp
   mà gói sau cần (từ _Bàn giao_). Commit `fix(requests): … (redesign W4 gate <x> patch)` — không thêm luật (LUẬT 15).

## 3. Prompt mẫu cho subagent (orchestrator điền `<…>`, dán **trọn**, kèm nguyên mục LUẬT CỨNG)

```text
Trả lời bằng tiếng Việt; giữ tiếng Anh cho tên file, hàm, lệnh, mã lỗi, code.
Bạn là subagent code GÓI <gói> của đợt 4 (BE SaaS-Sentry). Worktree: D:/FPT/FALL2026/Code/w4-<gói>, nhánh feat/redesign-w4-<gói> (nền feat/redesign-w4-wave-<x>
@ <sha>). Chỉ làm trong worktree này.
Skill Preflight: đọc đủ SKILL.md của superpowers:executing-plans, superpowers:test-driven-development, superpowers:verification-before-completion, repo skill
.claude/skills/be-quick-check/SKILL.md <+ .claude/skills/create-migration/SKILL.md nếu A-DB>. Liệt kê skill đã đọc ở đầu báo cáo.
Đọc: docs/reviews/redesign-w4-2026-11-25/PLAN.md mục 3 (bảng file), 4 (bộ kiểm nhanh), 5 (khuôn bước), mục gói <gói> ở mục 7; SPEC.md <§ của gói>;
DELTA-W3-FOR-W4.md <DL-n gói dẫn>; LUẬT CỨNG (dán dưới).
File được sửa: <danh sách đúng từ bảng 3.1> + chỉ THÊM DÒNG ở file gộp: <file gộp gói cần>.
Interfaces phải tạo/dùng đúng tên: <chép khối Interfaces của gói>.
Làm theo khuôn bước 0→8 (PLAN mục 5): test đỏ trước, chạy đỏ đúng lý do, code tối thiểu, xanh, integration/http viết (không chạy), bộ kiểm nhanh, tự đối chiếu ca →
test → file:line vào docs/reviews/redesign-w4-2026-11-25/pkg/<gói>.md, commit (message ở PLAN), git push -u origin feat/redesign-w4-<gói>. Không merge.
Đột biến SPEC §11.1 của gói: chạy tay, ghi kết quả, rồi BẮT BUỘC git restore <file> và chạy lại spec xanh trước khi commit.
Registry/manifest: file mảnh test/support/api-collection-registry-nested-w4-<gói>.ts, ...-events-w4-<gói>.ts, openapi-example-route-codes-w4-<gói>.ts,
openapi-example-messages-w4-<gói>.ts, api-coverage-manifest-w4-<gói>.ts; ở file gộp chỉ thêm 1 dòng import + 1 dòng spread.
Cần file ngoài danh sách / thấy luật không rõ / đường khóa khác SPEC ⟹ dừng phần đó, ghi "Bàn giao" hoặc "dừng hỏi" ở pkg/<gói>.md.
Trả lời orchestrator ≤ 30 dòng: skill đã đọc; sha; lệnh + số pass/fail thật; bảng ca → test → file:line; Kiểm giữ (nếu refactor); D-n; Bàn giao; câu bắt buộc
"Integration/http chỉ viết, chưa chạy — chạy trên CI ở cổng".
<LUẬT CỨNG 1–22 nguyên văn>
```

## 4. Tự quyết và ghi lại (`OVERNIGHT-DECISIONS-biz.md`, orchestrator gom từ `pkg/<gói>.md`)

Câu nhỏ, SPEC không nói mà **không** đổi hành vi nghiệp vụ ⟹ không dừng, cân 2–3 phương án, chọn theo căn cứ: SPEC (§7, §8, §14) → DELTA → sổ QĐ
(`Docs/Decisions/project-decisions.md`, tới `QĐ-120p`) → User Stories `EP-05`/`EP-06`/`EP-16` → code/test hiện có → rule repo. Ưu tiên đơn giản, dễ đảo, không xóa
dữ liệu, không đổi contract khó lùi.

```md
| D-n | Gói | file:line | Câu hỏi | Phương án A/B/C | Chọn + căn cứ | Cách đảo lại | Mức (tự chốt / cần Owner) |
```

Được tự quyết: tên file/hàm/lớp lỗi trong capability đã chỉ, câu chữ mô tả OpenAPI và message, chỗ đặt route giữa controller cùng capability, tách file khi chạm
trần, câu SQL, tên index/constraint/trigger, cách dựng test, `owner`/`item` registry (thư mục có sẵn). **Không** tự quyết (⟹ _cần
Owner_, giữ hành vi cũ): tiền, quyền, trạng thái, người nhận thông báo, mã lỗi FE thấy ngoài SPEC §8. Orchestrator còn < 10 % context ⟹ ghi _Dừng ở đâu_ (wave,
gói, nhánh, sha) vào PROGRESS rồi dừng.

## 5. Điều kiện DỪNG cứng

Dừng gói (hoặc cổng) đó, ghi PROGRESS kèm `file:line`, 2–3 lựa chọn và khuyến nghị, báo Owner; làm tiếp gói độc lập nếu có:

1. Cổng 0 hỏng: đợt 3 chưa ở `dev`, migration cuối ≥ `20261210…`, delta có lệch đổi luật, grep khóa E5 không rỗng.
2. Luật không rõ mà mục 4 không giải được; code thật khác SPEC theo cách đổi hành vi nghiệp vụ.
3. Cần migration ngoài A-DB/SPEC §5, sửa migration đã gộp, migration phá dữ liệu, sửa `prisma/` ngoài A-DB.
4. Cần cạnh module mới, extension point mới, đổi tầng, dependency npm mới (sửa `package.json`/`pnpm-lock.yaml`); capability phải import capability có controller;
   cần thêm provider vào facade worker.
5. Gate chỉ xanh khi nới gate/thêm suppression/thêm mục registry ngoài SPEC.
6. Đường khóa thật trái SPEC §6.2 (ngoài E1–E5).
7. Refactor không giữ được một lần kiểm cũ; test cũ/đặc tả chỉ xanh khi đổi kỳ vọng.
8. Gộp có xung đột ở file **không** phải file gộp (bảng 3.1 bị vi phạm); worktree có thay đổi lạ; git identity không phải Owner.
9. Gói refactor được giao mà C0 chưa xanh trên CI.
10. Luật ghi chú trả lời đòi ghi chú ở ca SPEC §7.9 bước 4 miễn (bị chặn, thiếu giá, kiểm lại) ⟹ sai luật.
11. CI cổng: test mới của wave đỏ vì **logic** sau 2 vòng sửa ⟹ gói `dừng hỏi`, cổng không đóng.

## 6. Không được làm

- Không chạy `pnpm check`, `test:http`, `test:integration`, `test:e2e`, seed, Docker, migration trên DB ở máy.
- Chỉ push `feat/redesign-w4*`. Không merge vào `int/*`, `dev`, `main`; không mở PR; không deploy.
- Không sửa `openapi.json`, `docs/generated/*`, `src/generated/*` bằng tay (chỉ sinh lại).
- Không xóa/`skip` test; không `eslint-disable`; không co-author; không commit bằng identity người khác.
- Không làm ngoài phạm vi (SPEC §2.2 — xác nhận lần hai, AI, phiếu nháp, tách dòng Request nhóm, gộp thông báo), kể cả thấy lỗi gần đó — ghi báo cáo cuối.
- Không sửa luật tiền/kho của đợt 3 (SPEC §9 danh sách file; `request-facts.service.ts` chỉ **thêm** `assessParty`).
- Không tự ghi Owner đã duyệt hay nghiệm thu.

## 7. Cổng D và báo cáo cuối

1. Sau cổng D: CI full trên `feat/redesign-w4` (`gh workflow run ci.yml --ref feat/redesign-w4`); mọi spec mới xanh; spec đỏ còn lại đỏ cả trên run nền + dòng
   `FIX-TEST-w4.md` theo từng test; đột biến SPEC §11.1 đã chạy (bảng ở PROGRESS).
2. Báo cáo cuối (≤ 60 dòng): skill đã đọc; bảng wave → gói → sha → W4-xx → lệnh kiểm + kết quả; CI từng cổng (link, run nền); contract đổi (đối chiếu SPEC §8.1,
   §8.2, gồm **Phá vỡ** `accessRequestResubmit`); migration; số dòng FIX-TEST; D-n (đánh dấu _cần Owner_); lệch so với DELTA;
   việc ngoài phạm vi; _Bàn giao_ còn mở. Câu bắt buộc: "Full test chỉ chạy trên CI GitHub".

Sau đó **dừng**, chờ Opus review trên `feat/redesign-w4`. Sửa finding ⟹ theo khuôn gói (nhánh `feat/redesign-w4-fix-<n>`), gộp, CI lại, báo lại. Không mở PR.

## 8. Ghi chú khi chạy bằng Neon / Antigravity

- Mọi lệnh `git` dùng `--no-pager` — pager treo agent. Mọi lệnh jest dùng `CI=true`: Git Bash `CI=true pnpm test -- <file>`; **PowerShell** `$env:CI='true';
pnpm test -- <file>`.
- Shell Windows: đường dẫn tuyệt đối; lệnh dài tách nhỏ; không `&` chạy nền. Worktree dưới `D:/FPT/FALL2026/Code/w4-<gói>` (đường ngắn, tránh giới hạn độ dài).
- Mỗi worktree có `node_modules` riêng (`pnpm install --frozen-lockfile --prefer-offline`) và Prisma client riêng (`pnpm prisma:generate`) — không chạy hai
  `pnpm install` cùng một worktree.
- Hook prettier của `.claude/settings.json` có thể không chạy trong Antigravity ⟹ luôn `pnpm exec prettier --check <file>` (sửa: `--write`).
- Integration do subagent viết **không** chạy trên máy: `viết, chưa chạy` tới khi CI của cổng xanh.

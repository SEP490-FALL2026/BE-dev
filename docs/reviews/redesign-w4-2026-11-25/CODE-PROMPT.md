# Prompt dán sẵn cho chat code — Đợt 4 thiết kế lại (phiếu nhiều mục, chế độ tự quyết, bản 2.2)

> **Bản 2.2 (25/11):** Skill Preflight theo bước của `docs/guides/quy-trinh-code-ai.md` (Implement / Verify + repo skill `be-quick-check`, `create-migration`);
> PLAN bản 2.2 có _Khuôn bước_, **Interfaces**, **Test trước**, **Commit** từng gói — làm đúng theo đó. Không đổi luật.
>
> **Bản 2.1 (25/11):** Owner đã chốt OQ-W4-1 → OQ-W4-4 và `NESTED_ARRAYS` (dòng `Owner đã chốt:` đã điền, [OWNER-ANSWERS.md](OWNER-ANSWERS.md)).
>
> **Bản 2 (25/11):** theo SPEC/PLAN bản 2 (hai review đã áp — SPEC §15): cổng C0 (T1 ở `int`) trước refactor; gói tách a/b; ghi chú trả lời chỉ sau _Trả về
> của người_ chưa trả lời; gửi phiếu hai pha; bộ kiểm nhanh thêm prettier, `arch:routes`/`arch:docs:check`, tự kiểm drift.
>
> Dán nguyên khối dưới vạch vào một chat Sonnet (model **sonnet**) hoặc Gemini mới **sau khi** Owner đã duyệt SPEC bản 2.1 / PLAN bản 2.2 **và** đợt 3 đã ở `dev`
> **và** đã có `DELTA-W3-FINAL.md`. Sửa dòng `LÀN:` trước khi dán (dòng `Owner đã chốt:` đã điền). Quy trình
> chung: `docs/guides/quy-trinh-code-ai.md`.

---

**LÀN: tech** ← đổi thành `biz` nếu là làn nghiệp vụ
**Nhánh:** làn `tech` = nhánh của Bảo `feat/redesign-w4-tech` (có Docker); làn `biz` = làm **thẳng trên** `int/redesign-w4` · **Nhánh gộp:** `int/redesign-w4` ·
**Hai làn chạy song song** (PLAN bản 2): `biz` B1 → B5a → B6 → (C0: T1 ở int) B2a → B2b → B3 → B4a → B4b → B5b → B7 (mọi luật, mọi ghi, mọi migration);
`tech` T1 → T2 → T3 → T4 → T5 → T6 (spec đặc tả, đọc/hiện, chạy Docker, seed)
**Owner đã chốt:** OQ-W4-1 = A (phiếu 1–6 mục) · OQ-W4-2 = A (`QĐ-116b` ở đợt 4 — B6, đúng `NOT_SUBMITTED`) · OQ-W4-3 = A (không mã
hiển thị) · OQ-W4-4 = A (mỗi mục một thông báo) · `NESTED_ARRAYS` `requestTicketSubmit#ticket.items`,
`requestTicketGet#ticket.items` = **duyệt** · Ghi chú trả lời chỉ bắt buộc sau _Trả về của người_ chưa trả lời (`QĐ-114q`, SPEC §7.9) ·
Xác nhận lần hai, AI, tách dòng Request nhóm: **không** thuộc đợt 4 (`QĐ-118a`, `QĐ-118c`)

Trả lời bằng **tiếng Việt**. Giữ nguyên tiếng Anh cho tên file, hàm, lệnh, mã lỗi và code.

Bạn là người code của **một làn** trong đợt 4 thiết kế lại BE SaaS-Sentry (NestJS 11 + Prisma + PostgreSQL, modular monolith). Repo:
`D:\FPT\FALL2026\Code\BE-dev-software-license-management`. Thư mục việc: `docs/reviews/redesign-w4-2026-11-25/`. Đây là **chế độ tự quyết**: làm hết
các gói của làn không chờ duyệt giữa gói; câu hỏi nhỏ tự chọn theo căn cứ và ghi lại (mục 4); chỉ dừng ở điều kiện cứng (mục 5) hoặc LUẬT CỨNG.

## LUẬT CỨNG (đọc trước mọi thứ, áp mọi gói, không ngoại lệ)

1. **Không đổi hành vi ngoài SPEC.** Code thật khác SPEC, hoặc SPEC không nói mà phải chọn một hành vi nghiệp vụ (tiền, quyền, trạng thái, người nhận
   thông báo, mã lỗi trả cho FE) ⟹ **giữ hành vi cũ**, ghi một dòng `D-n` mức **cần Owner** (mục 4), làm tiếp phần không phụ thuộc. Không tự "sửa
   cho đúng hơn". OQ chưa có dòng `Owner đã chốt:` ⟹ làm theo **khuyến nghị** của SPEC §12, ghi `D-n` _cần Owner_.
2. **Refactor giữ mọi lần kiểm cũ.** Gói tách/gom code (B2a `AccessRequestService.submitWithin` → kiểm cấp người/phòng / kiểm mục / ghi / định tuyến; B3
   `NeedDecisionService.decide(actor, id, input, judged?)`; B4a ánh xạ kết quả của `SpendBatchDecisionService` → `spend-item-outcome.policy.ts` thuần; B4b thứ tự
   xử lý lô; mọi tách file vì trần) ⟹ **chỉ bắt đầu khi T1 đã ở `int` (C0)**: spec đặc tả `access-request.service.spec.ts`, `need-decision.service.spec.ts`,
   `spend-decision.service.spec.ts` + `request-single-characterization.integration-spec.ts` xanh. Trước khi sửa, **liệt kê** mọi lần kiểm/guard/throw/`catch` của
   đoạn cũ; sau khi sửa, mỗi lần kiểm còn nguyên (cùng điều kiện, cùng mã lỗi); ghi vào **commit message** (mục `Kiểm giữ:`). Spec đặc tả và test cũ xanh **không
   đổi kỳ vọng** (chỉ được **thêm** ca).
3. **Spec cạnh file nó kiểm; test lỗi khẳng định mã lỗi.** `<tên>.ts` ⟹ `<tên>.spec.ts` cùng thư mục. Mọi test nhánh lỗi khẳng định **mã**
   (`code`/`DOMAIN.REASON`, hoặc `reason` của kết quả từng mục) và status, không chỉ "throws". Mỗi bảng ca SPEC ⟹ một `it.each` đúng các ca.
4. **Không nới gì để xanh.** Không sửa/nới test, assertion, gate, manifest, registry (`COLLECTION_EXCEPTIONS`, `NESTED_ARRAYS` ngoài mục SPEC cho phép,
   `NO_EXAMPLE_RESPONSES`, `GRAPH_WIRING_EXCEPTIONS`, `RUNTIME_*_EXCEPTIONS` ngoài mục SPEC §5); không `skip`/`only`/xóa test; không `eslint-disable`, không
   thêm `eslint-suppressions.json`; không hạ ngưỡng.
5. **Gói hỏng sau 2 vòng sửa** ⟹ `git --no-pager diff > docs/reviews/redesign-w4-2026-11-25/wip/<gói>.patch` (chỉ file của gói), `git restore --source=HEAD --
   <đúng các file của gói>` (không `reset --hard`), ghi `PROGRESS-<làn>.md` `dừng hỏi` + đường dẫn patch, sang gói độc lập kế. **Không bao giờ commit code
   đỏ lên `int/redesign-w4`.**
6. **Orchestrator tự đối chiếu trước khi ghi `xong`.** Người chạy prompt tự đọc `git --no-pager diff <sha trước>..HEAD -- <file của gói>` (không tin báo cáo
   subagent), đối chiếu **từng** ca SPEC của gói (ca → test → `file:line`), ghi bảng vào PROGRESS. Trạng thái gói `biz`: `xong-unit` khi unit + bộ kiểm nhanh
   xanh và integration/http **đã viết chưa chạy**; chỉ `xong` khi T4 báo spec của gói xanh trên Docker hoặc CI GitHub. **Không** ghi `xong` cho ca chưa có test.
7. **Mỗi commit:** bộ kiểm nhanh (mục 3 bước 8) + `CI=true pnpm test -- <spec của file đã sửa>` (PowerShell: `$env:CI='true'; pnpm test -- …`) + 1–2 test
   **quan trọng nhất của luật mới** (tên ở commit message, mục `Test chính:`).
8. **Mô tả OpenAPI không chứa mã nội bộ:** `QĐ-`, `FR-`, `US-`, `W[1-4]-`, `D-`, `OQ-`, `MF-`, `SBF-`, `T-W4-` (kiểm `grep -nE "QĐ-|FR-|US-|W[1-4]-|\bD-[0-9]|OQ-|MF-|SBF-|T-W4-" openapi.json`
   chỉ ra chỗ có từ trước đợt). Comment trong `src` nói lý do, không mã `W4-xx`.
9. **Không chạy full test, seed, migration trên máy** (làn `biz`). Chỉ bộ kiểm nhanh + unit file sửa. Làn `tech` chạy integration/http/seed trên **Docker
   của Bảo** cho gói đã ở `int` (T1, T4), **chỉ sửa test/fixture**; CI GitHub full cuối làn (mục 7).
10. **QĐ-118 (quyền theo phạm vi):** phiếu **không** thêm quyền nào. Cấp phát từng mục qua tác vụ cấp hiện có — chỉ IT Admin phụ trách phòng người thụ hưởng
    hoặc người làm thay (`ProvisioningTaskFrame.requireActingItAdmin`, `OrganizationReadApi.itAdminsActingFor`); không viết nhánh "IT khác làm thay", không
    hàng việc chung. Quyết nhu cầu chỉ người giữ bước nhu cầu của **từng** mục; quyết chi chỉ Người duyệt chi giữ bước chi của **từng** mục; rút cả phiếu chỉ
    người xin. **Fixture QĐ-118** (SPEC §11.2): mọi integration/http dựng phòng có trưởng phòng, **IT phụ trách** (`setItAdminInCharge`), phòng khác giao IT2
    (`handOthersToSecondItAdmin`), Cost Center + ngân sách có số, Người duyệt chi có vai, nhân viên đủ `employment_type` và lần xếp phòng hợp lệ. Helper trả
    `undefined` sau 403 ⟹ thiếu fixture, sửa fixture.
11. **Thứ tự khóa (SPEC §6.2):** không thêm tầng. Gửi phiếu: **kiểm cấp phiếu** employee `FOR SHARE` (1) → advisory `requests.limits` (2) → đơn vị, Cost
    Center, department (2) → kiểm mục (đọc) → **pha 1** chèn phiếu + **mọi** mục theo `ticket_position` → **pha 2** `SpendRoutingService.start` từng mục theo
    `position` (Request vừa chèn (4), reprice, CC-year (10)) — **E5** chỉ cho Request do chính tx chèn ở pha 1. Quyết nhiều mục / rút cả phiếu: **mỗi mục một tx**
    với đường khóa của thao tác lẻ, không khóa phiếu. Lô: `lockAll` theo id giữ nguyên, chỉ đổi **thứ tự xử lý**; `results`, `batches.create.items`,
    `recorder.submitted` sắp lại **thứ tự thân**. Comment đầu service mới ghi thứ tự khóa. Đường khóa thật khác bảng ⟹ dừng (mục 5).
12. **Ranh giới đợt 5:** không chấm _Đạt/Không đạt_ câu có luật dữ liệu, không cặp (Request, câu) lệch, không cờ _duyệt dù hệ thống báo không đạt_, không AI.
    Kết quả quyết nhiều mục luôn **theo từng mục** (đợt 5 thêm trường).
13. **Ghi chú trả lời (SPEC §7.9, §7.10):** chỉ đòi khi có lần _Trả về của người_ (nhu cầu / đánh giá IT / chi) **chưa** có reply; bị chặn, thiếu giá, kiểm lại của
    hệ thống **không** đòi. Không unique DB trên `returned_step_id`; ở lô chỉ lưu reply khi mục đi tiếp (`SENT_TO_APPROVER`/`AWAITING_RESERVE_CONFIRMATION`). Thiếu ghi
    chú ⟹ 422 `ACCESS_REQUEST.REPLY_NOTE_REQUIRED` (gửi lại) hoặc `STOPPED REPLY_NOTE_REQUIRED` (lô) — không dùng `VALIDATION_ERROR` cho luật theo trạng thái.
14. **Lỗi cấp phiếu luôn thắng lỗi mục (SPEC §7.2):** kiểm người/phòng một lần trước vòng mục; vòng mục chỉ bắt **đúng** danh sách lớp lỗi của gói SPEC liệt kê; lớp
    khác ⟹ ném lên. Enum `reason` đóng theo SPEC §8.3.

## 0. Skill Preflight (bắt buộc, trước mọi việc, và lại sau mỗi lần compact context)

1. Liệt kê skill có sẵn. Đọc đầy đủ `SKILL.md` của đúng bộ theo bước (`docs/guides/quy-trinh-code-ai.md`):

   | Bước | Skill | Dùng khi |
   | ---- | ----- | -------- |
   | Implement | `superpowers:executing-plans` (process) + `superpowers:test-driven-development` | mọi gói: chạy PLAN tuần tự từng gói theo _Khuôn bước_, test đỏ trước |
   | Verify | `superpowers:verification-before-completion` | trước mọi `xong-unit`/`xong`, commit, báo cáo — có lệnh + output mới chạy mới được tuyên bố |
   | Kiểm nhanh | repo skill `.claude/skills/be-quick-check/SKILL.md` | bước 8 mục 3 mỗi gói, mỗi commit (cộng phần đợt 4 thêm ở PLAN _Bộ kiểm nhanh_) |
   | Migration | repo skill `.claude/skills/create-migration/SKILL.md` (chỉ gọi tay ⟹ **đọc file**) | B1, B5a (làn `biz`): quy ước tên/thứ tự/không GRANT/roll-forward; **thay** `pnpm db:migrate:dev` bằng `prisma migrate diff` (PLAN bước **M**) |

   Gói có route mới đọc thêm `agent-skills:api-and-interface-design`. Không có đúng tên ⟹ skill gần nhất (`agent-skills:incremental-implementation`,
   `agent-skills:test-driven-development`), ghi mapping. **Không** dùng `superpowers:subagent-driven-development` song song, `using-git-worktrees`,
   `finishing-a-development-branch` (quy trình BE: tuần tự, không worktree, agent không merge/PR). Skill chỉ chuẩn hóa cách làm; LUẬT CỨNG, PLAN, SPEC thắng skill.
2. Đọc trong repo: `AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/README.md`, `docs/guides/quy-trinh-code-ai.md`, `docs/rules/database-business.md` (mục
   _Thứ tự khóa chuẩn_), `docs/rules/module-structure.md`, `docs/rules/api-contract.md`, `docs/rules/work-item-sizing.md`, `test/README.md`,
   `src/modules/requests/README.md`.
3. Đọc trọn **`SPEC.md`**, **`PLAN.md`** và **`DELTA-W3-FINAL.md`** của thư mục việc — nguồn duy nhất của việc cần làm. Luật ở SPEC §7 _Hành vi đúng_; mã
   `QĐ-…`, `US-…` chỉ để tra. SPEC §14 _Tự chốt_ và dòng `Owner đã chốt:`: không hỏi lại, không tự đổi.
4. Đọc `PROGRESS-<làn>.md`, `OVERNIGHT-DECISIONS-<làn>.md` (nếu có) — trí nhớ qua compact.
5. Đầu mỗi báo cáo liệt kê skill/rule đã đọc và mục đích.

## 1. Chuẩn bị nhánh (chỉ lần đầu)

```bash
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management status --short   # phải sạch
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management fetch origin
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management --no-pager log --oneline -1 origin/dev
# đợt 3 ở dev (squash ⟹ kiểm commit + file): có commit squash B2, B3 của đợt 3; ls-tree in đủ 2 dòng; migration cuối là 202612030… của đợt 3
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management --no-pager log --oneline origin/dev --grep "redesign W3\|redesign-w3" | head
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management --no-pager ls-tree --name-only origin/dev \
  src/modules/catalog/public/license-lot.api.ts \
  src/modules/catalog/public/seat-ledger.api.ts
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management --no-pager ls-tree --name-only origin/dev docs/reviews/redesign-w4-2026-11-25/DELTA-W3-FINAL.md
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management --no-pager ls-tree --name-only origin/dev prisma/migrations/ | tail -3   # dải 20261210… phải lớn hơn
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management config user.email   # phải là email của chính người làm
# làn tech (Bảo): bắt đầu ngay bằng T1, không chờ làn biz
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management checkout -b feat/redesign-w4-tech origin/dev
# làn biz (Owner, Neon): nhánh gộp do Owner tạo từ dev mới nhất; bắt đầu ngay bằng B1
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management checkout -b int/redesign-w4 origin/int/redesign-w4
```

- Hai làn bắt đầu **cùng lúc**: `biz` từ B1, `tech` từ T1 (đẩy T1 lên `int` sớm nhất — C0).
- Thiếu commit squash đợt 3, thiếu file, thiếu `DELTA-W3-FINAL.md`, hoặc migration cuối của `dev` ≥ `20261210…` ⟹ **dừng, báo lại**. Lệch khác giữa
  `int/redesign-w3` và `dev` không làm dừng — đã ghi ở `DELTA-W3-FINAL.md`.
- Làn `biz`: chưa có `origin/int/redesign-w4` ⟹ dừng, báo Owner tạo từ `dev`.
- `git config user.email` sai ⟹ sửa ở **repo này** (không `--global`); không biết ⟹ dừng, hỏi.
- Đã có nhánh ⟹ `checkout`, `git pull --ff-only` (làn `biz`), đối chiếu `git --no-pager log` với `PROGRESS-<làn>.md`, làm tiếp gói kế.
- Tạo nếu chưa có: `PROGRESS-<làn>.md` (bảng gói như đợt 3: Gói · Mục · Trạng thái · sha · Lệnh kiểm + kết quả · FIX-TEST · Ghi chú; mục _Bàn giao_, _CI
  GitHub_, _Đối chiếu tiêu chí_), `FIX-TEST-<làn>.md` (`| Gói | File test | Ca | Lý do |`), `OVERNIGHT-DECISIONS-<làn>.md` (bảng mục 4), thư mục `wip/`.
  Ghi lại rule _Skill-first_ (CLAUDE.md workspace) ở đầu `PROGRESS-<làn>.md` để sống qua compact.
- Mở `DELTA-W3-FINAL.md`; `file:line` của SPEC đọc trên `444e6fc3` — dòng có thể đã dời: xác nhận lại trước khi sửa.

## 2. Thứ tự gói

- **biz:** B1 → B5a → B6 → (**C0**: T1 ở `int`) B2a → B2b → B3 → B4a → B4b → B5b → B7. Chưa có T1 ở `int` ⟹ **không** bắt đầu B2a/B3/B4a; làm B1, B5a, B6.
- **tech:** T1 → T2 → T3 → T4 (lặp: mỗi gói `biz` vào `int` ⟹ chạy spec của gói đó, gồm lại spec đặc tả T1 sau B2a/B3/B4a) → T5 → T6.
- **Trước mỗi gói** — `biz`: `git pull --ff-only`; `tech`: `git fetch origin && git merge origin/int/redesign-w4` (không rebase; xung đột chỉ ở file chung ⟹ giữ
  cả hai, `openapi.json` sinh lại). Rồi `pnpm prisma:generate`, `pnpm openapi:export`, bộ kiểm nhanh, rồi làm.
- **Phụ thuộc "… ở int"** (PLAN bảng _Gói_): B2a, B3, B4a cần T1 (C0); T2 cần B1; T3 cần B5a; T4 lặp theo từng gói `biz` (đủ khi B2b — C1); T5 cần B2b, B3,
  B5a; T6 cần B5b. Ba file spec đặc tả T1 tạo trong thư mục `biz` đổi tay sang `biz` sau C0 (`biz` chỉ **thêm** ca). Chưa có ⟹ **không chờ**: việc
  lấp ở PLAN _Cửa_ (`tech`: characterization Request đơn, chạy lại integration đợt 3 trên Docker, ghi `FIX-TEST-tech.md`), rồi quay lại.
- **Đẩy lên:** `biz` push sau mỗi commit. Gói `tech` xong và xanh ⟹ **Owner hoặc Bảo** merge commit cuối gói vào `int` (agent không tự merge vào `int`,
  không mở PR; ghi `PROGRESS-tech.md` "sẵn để đẩy").
- **Cửa C2** (người làm): cả hai làn xong B7, T6 ⟹ Owner cắt `pr/redesign-w4`, mở PR → `dev`.
- **Migration:** chỉ làn `biz`, dải `20261210…` (M1 ở B1, M2 ở B5a).
- **Chỉ sửa file trong danh sách của gói** (PLAN; `*` = file chung chỉ thêm dòng). Cần file khác ⟹ không sửa, ghi _Bàn giao_, làm tiếp phần không phụ thuộc.
  Làn `tech` không sửa `m/requests/spend-submission/**`, `step-routing/**`, `reassignment/**` và mọi file làn `biz` liệt kê ở PLAN _Hai làn_.

## 3. Cách làm từng gói

1. Đọc lại `PROGRESS-<làn>.md`, mục W4-xx của gói trong SPEC §7, mục gói trong PLAN. Mở code thật ở các `file:line` và xác nhận hiện trạng (sau đợt 3). Khác
   mà không đổi luật ⟹ làm theo _Hành vi đúng_, ghi `D-n` (tự chốt). Khác mà đổi luật ⟹ LUẬT CỨNG 1.
2. Ghi gói vào `PROGRESS-<làn>.md` trạng thái `đang làm`.
3. **Unit test đỏ trước** cho luật mới; `CI=true pnpm test -- <file>` thấy đỏ đúng lý do.
4. Code tối thiểu cho xanh, theo: tầng module và cửa `public/`; capability có controller không bị capability khác import (route nhiều mục đặt **trong**
   capability của service lẻ: `need-decision/`, `spend-approval/`, `withdraw/`); capability không vòng (`pnpm arch:capabilities --module requests`); hậu tố file,
   một `@Injectable` mỗi file; lỗi trong `*.errors.ts`, ánh xạ HTTP trong `*.http-errors.ts`, một mã một status; mọi đọc trong `runner.run` qua `tx`, không
   `Promise.all` trên `tx`; audit cùng tx với ghi; Zod strict; trần 500 dòng/file, 25 file/thư mục (`access-request/`, `group-request/`, `spend/`,
   `assessment/` đã đủ — chỉ sửa), `complexity` 12, hàm 60 dòng, 8 tham số — vượt thì tách theo chức năng (LUẬT CỨNG 2).
5. Migration (làn `biz`, B1/B5a): sửa `prisma/models/*` trước; sinh SQL bảng/cột/FK/index bằng `pnpm exec prisma migrate diff --from-schema <schema trước, lấy
   bằng git show vào thư mục tạm> --to-schema prisma --script`, dán vào file tên đúng SPEC §5, rồi **thêm tay** CHECK/trigger/comment SQL đảo (không chép SQL ý
   định của SPEC); không nêu tên vai DB; thêm hai bảng vào `RUNTIME_TABLE_EXCEPTIONS` như SPEC §5; không sửa migration đã merge; `pnpm prisma:validate` +
   `pnpm prisma:generate`; sinh lại diff và so — chỉ khác ở phần thêm tay.
6. Seed (làn `tech`, T5): sửa `src/cli/seed/**` qua API, cập nhật spec unit của step; không nới luật cho seed.
7. Integration/http SPEC/PLAN nêu (≤ 800 dòng mỗi file), fixture đúng LUẬT CỨNG 10. Làn `biz` **viết**, không chạy; làn `tech` **chạy** trên Docker (T4).
   Luồng đồng thời: 2 connection, barrier, lặp 20, không `40P01` (SPEC §11.3).
8. **Bộ kiểm nhanh**, tất cả xanh:

   ```text
   pnpm typecheck
   pnpm lint
   pnpm exec prettier --check <mọi file đã sửa>
   pnpm arch:check
   pnpm arch:capabilities --module requests
   pnpm rules:check
   pnpm test:gates
   pnpm openapi:export && git --no-pager diff --stat openapi.json
   pnpm arch:routes && pnpm arch:docs:check      # commit thêm/đổi route: docs/generated/* sinh lại cùng commit
   CI=true pnpm test -- <mọi *.spec.ts đã chạm hoặc thêm>
   ```

   Thêm `pnpm rules:format` khi sửa `docs/rules/*.md` hoặc `src/modules/*/README.md`; `pnpm prisma:validate && pnpm prisma:generate` khi sửa `prisma/`.
   Cập nhật manifest OpenAPI (`test/support/openapi-example-manifest.ts`, `openapi-example-route-codes-requests*.ts`, `api-coverage-manifest.ts`) cho mọi
   operation mới/đổi; mảng lồng mới đăng ký ở `test/support/api-collection-registry-nested-w4.ts` + `api-collection-registry-events-w4.ts` (key
   `requestTicketSubmit#ticket.items`, `requestTicketGet#ticket.items`, Zod `.max(6)`) — chỉ khi Owner đã duyệt (dòng `Owner đã chốt:`).

9. Test cũ khẳng định hành vi cũ: unit của chính luật đổi theo SPEC (vd gửi lại sau _Trả về của người_ không ghi chú — SPEC §7.9; gửi lại Request **chỉ bị
   chặn** giữ xanh) ⟹ sửa kỳ vọng **chỉ khi** SPEC nói luật đổi (ghi
   tên test + mục SPEC vào commit); http/integration ⟹ `FIX-TEST-<làn>.md`, không xóa, không `skip`.
10. **Tự review diff** (LUẬT CỨNG 6): bảng ca → test → `file:line`; không thừa phạm vi (SPEC §2.2); OpenAPI không mã nội bộ (LUẬT CỨNG 8).
11. Commit một gói một commit (hoặc vài commit nhỏ cùng gói) bằng **git identity của chính người làm**; **không** `Co-Authored-By`/attribution AI. Message:
    `feat(requests): <tóm tắt> (redesign W4 <gói>)` + thân: W4-xx; `Test chính:`; `Kiểm giữ:` (gói refactor); `D-n` nếu có.
12. Cập nhật `PROGRESS-<làn>.md`: trạng thái (`xong-unit` / `xong` theo LUẬT CỨNG 6), sha, lệnh + kết quả thật (số test pass/fail), FIX-TEST, D-n, chỗ chưa
    kiểm. Push (`tech`: `git push -u origin feat/redesign-w4-tech`; `biz`: `git push origin int/redesign-w4`).

## 4. Tự quyết và ghi lại (`OVERNIGHT-DECISIONS-<làn>.md`)

Câu hỏi nhỏ, SPEC không nói mà **không** đổi hành vi nghiệp vụ ⟹ không dừng, cân 2–3 phương án, chọn theo căn cứ: SPEC (§7, §8, §14) → sổ QĐ
(`Docs/Decisions/project-decisions.md`, tới `QĐ-119e`) → User Stories `EP-05`/`EP-06`/`EP-16` → code/test hiện có → rule repo. Ưu tiên phương án đơn giản,
dễ đảo, không xóa dữ liệu, không đổi contract khó lùi. Ghi:

```md
| D-n | Gói | file:line | Câu hỏi | Phương án A/B/C | Chọn + căn cứ | Cách đảo lại | Mức (tự chốt / cần Owner) |
```

Được tự quyết: tên file/hàm/lớp lỗi trong capability đã chỉ, câu chữ mô tả OpenAPI và message, chỗ đặt route giữa controller cùng capability, tách file khi
chạm trần, câu SQL, tên index/constraint/trigger, cách dựng test. **Không** tự quyết (⟹ `cần Owner`, giữ hành vi cũ): tiền, quyền, trạng thái, người nhận
thông báo, mã lỗi mới FE thấy ngoài SPEC §8. Còn < 10 % context ⟹ ghi _Dừng ở đâu_ rồi dừng.

## 5. Điều kiện DỪNG cứng

Dừng gói đó, ghi `PROGRESS-<làn>.md` kèm `file:line`, 2–3 lựa chọn và khuyến nghị, báo người điều phối, làm tiếp gói độc lập nếu có:

1. Luật không rõ mà mục 4 không giải được; code thật (sau đợt 3) khác SPEC theo cách đổi hành vi nghiệp vụ; `DELTA-W3-FINAL.md` có dòng chưa áp.
2. Cần migration ngoài SPEC §5, sửa `prisma/` ở làn `tech`, sửa migration đã merge, migration phá dữ liệu.
3. Cần cạnh module mới, extension point mới, đổi tầng, dependency npm mới; capability phải import capability có controller.
4. Gate chỉ xanh khi nới gate/thêm suppression/thêm mục registry ngoài SPEC (gồm mục `NESTED_ARRAYS` w4 `…#ticket.items` khi Owner chưa duyệt).
5. Đường khóa thật trái SPEC §6.2 (ngoài E1–E5).
6. Refactor không giữ được một lần kiểm cũ, hoặc test cũ của đoạn refactor chỉ xanh khi đổi kỳ vọng.
7. Cây làm việc có thay đổi lạ; gói cần file của làn kia; git identity không phải của người làm.
8. Làn `tech`: spec của gói `biz` đỏ vì **logic** (không phải fixture) ⟹ không sửa `src`, ghi _Bàn giao_, báo `biz`.
9. Làn `biz` tới B2a/B3/B4a mà T1 chưa ở `int` (C0) ⟹ không refactor; làm gói độc lập (B1, B5a, B6) hoặc dừng chờ, ghi PROGRESS.
10. Luật ghi chú trả lời đòi ghi chú ở ca SPEC §7.9 bước 4 miễn (bị chặn, thiếu giá, kiểm lại) ⟹ sai luật, dừng.

## 6. Không được làm

- Không chạy `pnpm check`; làn `biz` không chạy `test:http`, `test:integration`, `test:e2e`, seed, Docker, migration trên DB.
- Chỉ push **nhánh của làn mình**. Không merge vào `dev`, `main`; agent không tự merge vào `int/redesign-w4`; không mở PR; không deploy.
- Không sửa `openapi.json`, `docs/generated/*`, `src/generated/*` bằng tay.
- Không xóa/`skip` test; không `eslint-disable`; không co-author; không commit bằng identity người khác.
- Không làm ngoài phạm vi (SPEC §2.2 — đặc biệt xác nhận lần hai, AI, phiếu nháp, tách dòng Request nhóm, gộp thông báo), kể cả thấy lỗi gần đó — ghi vào
  báo cáo cuối.
- Không sửa luật tiền/kho của đợt 3 (`pricing.policy.ts`, `budget-check.*`, `seat-release.*`, `access-request-grant.listener.ts`, `purchase-invoice/**`).
- Không tự ghi Owner đã duyệt hay nghiệm thu.

## 7. Cuối làn: CI GitHub đầy đủ (chạy tay) rồi báo cáo

1. Push nhánh làn rồi `gh workflow run ci.yml --ref <nhánh làn>` (làn `biz` = `int/redesign-w4`). Không chạy được `gh` ⟹ báo người điều phối (GitHub →
   Actions → CI → Run workflow).
2. Theo dõi: `gh run list --workflow ci.yml --branch <nhánh làn>`, `gh run view <id> --log-failed`.
3. Job đỏ do **logic** (500, sai quyền/trạng thái/thứ tự, test luật mới) ⟹ sửa, kiểm nhanh, commit, push, chạy lại job đó; do **nợ test** (test cũ khẳng
   định hành vi cũ, harness, seed) ⟹ `FIX-TEST-<làn>.md`.
4. Ghi mỗi lần chạy vào bảng _CI GitHub_ của `PROGRESS-<làn>.md`.
5. Báo cáo cuối (≤ 60 dòng): skill đã đọc; bảng gói → sha → W4-xx → lệnh kiểm + kết quả; CI từng job (link); contract đổi (đối chiếu SPEC §8.1, §8.2, gồm
   **Phá vỡ** `accessRequestResubmit`); migration; số dòng FIX-TEST; D-n (đánh dấu _cần Owner_); lệch so với `DELTA-W3-FINAL.md`; việc ngoài phạm vi;
   _Bàn giao_. Câu bắt buộc: "Full test chỉ chạy trên CI GitHub (và Docker của làn tech cho spec đã ghi)".

Sau đó **dừng**, chờ Opus review trên nhánh gộp. Sửa finding xong ⟹ CI lại như bước 1–4 rồi báo lại. Không mở PR, không merge.

## 8. Ghi chú khi chạy bằng Neon / Antigravity (agent điều phối nhiều subagent)

- **Mỗi gói một subagent, tuần tự** (không song song, không worktree, không hai subagent cùng sửa một file). Điều phối giao đúng **một** gói kèm đường dẫn
  SPEC §7.x / PLAN mục gói và LUẬT CỨNG; sau khi subagent báo xong, điều phối tự làm LUẬT CỨNG 6 (đọc diff, bảng ca → test → `file:line`) trước khi giao gói kế.
- Gói refactor (B2a, B3, B4a, B4b): kiểm C0 (T1 ở `int`) trước khi giao; giao subagent **trước** bước liệt kê `Kiểm giữ:` và đọc lại danh sách đó trong commit trước khi ghi PROGRESS.
- Mọi lệnh `git` dùng `--no-pager` — pager treo agent.
- Mọi lệnh jest dùng `CI=true`: Git Bash `CI=true pnpm test -- <file>`; **PowerShell** `$env:CI='true'; pnpm test -- <file>` (PowerShell không nhận tiền tố
  `CI=true`).
- Shell Windows: đường dẫn tuyệt đối; lệnh dài tách nhiều lệnh nhỏ; không `&` chạy nền.
- Integration do Neon viết **không** chạy được trên máy Owner: ghi `viết, chưa chạy` trong PROGRESS; chỉ đổi sang `xong` khi làn `tech` báo xanh trên Docker
  hoặc CI GitHub xanh.

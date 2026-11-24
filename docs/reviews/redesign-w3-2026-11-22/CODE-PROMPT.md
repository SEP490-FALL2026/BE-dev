# Prompt dán sẵn cho chat code — Đợt 3 thiết kế lại (kho B1 → B2 → B3, chế độ tự quyết, bản 2)

> Dán nguyên khối dưới vạch vào một chat Sonnet (model **sonnet**) hoặc Gemini mới **sau khi** Owner đã duyệt SPEC/PLAN bản 2 **và** đợt 2 đã ở
> `dev`. Sửa dòng `LÀN:` trước khi dán. Câu Owner đã trả lời nằm ở dòng `Owner đã chốt:` (mọi câu đã chốt). Quy trình chung:
> `docs/guides/quy-trinh-code-ai.md`.

---

**LÀN: tech** ← đổi thành `biz` nếu là làn nghiệp vụ
**Nhánh:** làn `tech` = nhánh của Bảo `feat/redesign-w3-tech`; làn `biz` = làm **thẳng trên** `int/redesign-w3` · **Nhánh gộp:** `int/redesign-w3`
**Owner đã chốt:** T-1 = tháng lịch cho Request `K2` có ngày cuối · T-2 = route cũ đổi người phụ trách trên `PERPETUAL` ghi vào lô cùng id ·
T-3 = `K1` không Request tính từ tháng hiện tại, không giá ⟹ 0 + cờ · T-7 = ngày hiệu lực sổ ghi tay ≥ ngày 1 tháng hiện tại · W3-Q1 = A (chia đều chi phí thực chịu của lô `K4`; tỷ lệ Trống trên giá chưa thuế (n−1)×giá; phần dư dồn license dư cuối; chênh do
thuế báo riêng) · Q-A = bỏ `ROLE_RIGHT` khỏi đợt 3 (đợt 7) · Q-B = giữ mua seat cho kỳ sau, trên dòng kỳ sau, hiệu lực ngày bắt đầu kỳ sau, không 409
mới · Q-C = dòng kỳ cũ đóng tại ngày kết thúc kỳ, unique chỉ trên dòng chưa bị nối tiếp · Q-D = một thông báo cho IT phụ trách workspace khi admin thôi
làm việc, không dùng được ⟹ Super Admin · Q-E = ngưỡng 5 % so tiền hàng chưa thuế, thuế không khấu trừ vẫn vào _Chênh lệch hóa đơn kho_ · Q-F = sau hạn
chót báo hủy ⟹ _Bị khóa tới_ ngày gia hạn kỳ sau · Q-G = `priorYearReleased` gồm `MONTH_END` tháng 12; _tránh được_ nhóm = phần một người; _thực_ cam
kết 12 trả tháng ghi ở hóa đơn đầu tiên, × 12 · QĐ-118d/f/l = việc của phòng chỉ người làm của phòng; người phụ trách thuê bao/workspace/lô chỉ Super
Admin đổi; người tạo là người phụ trách ban đầu · REVIEW-SPEC + review lượt 2 đã áp (SPEC §13.3–§13.5)

Trả lời bằng **tiếng Việt**. Giữ nguyên tiếng Anh cho tên file, hàm, lệnh, mã lỗi và code.

Bạn là người code của **một làn** trong đợt 3 thiết kế lại BE SaaS-Sentry (NestJS 11 + Prisma + PostgreSQL, modular monolith). Repo:
`D:\FPT\FALL2026\Code\BE-dev-software-license-management`. Thư mục việc: `docs/reviews/redesign-w3-2026-11-22/`. Đây là **chế độ tự quyết**: làm hết
các gói của làn không chờ duyệt giữa gói; câu hỏi nhỏ tự chọn theo căn cứ và ghi lại (mục 4); chỉ dừng ở điều kiện cứng (mục 5) hoặc LUẬT CỨNG.

## LUẬT CỨNG (đọc trước mọi thứ, áp mọi gói, không ngoại lệ)

1. **Không đổi hành vi ngoài SPEC.** Code thật khác SPEC, hoặc SPEC không nói mà phải chọn một hành vi nghiệp vụ (tiền, quyền, trạng thái, người nhận
   thông báo, mã lỗi trả cho FE) ⟹ **giữ hành vi cũ**, ghi một dòng `D-n` mức **cần Owner** (mục 4), làm tiếp phần không phụ thuộc. Không tự "sửa
   cho đúng hơn".
2. **Refactor/gom service giữ mọi lần kiểm cũ.** Gói chuyển hoặc gom code (P20b, P16a `takeSeat`/`carryOrBuy`, P18 tách `renewal-record`, mọi tách file
   vì trần) ⟹ trước khi sửa, **liệt kê** mọi lần kiểm/guard/throw của đoạn cũ; sau khi sửa, mỗi lần kiểm còn nguyên (cùng điều kiện, cùng mã lỗi); ghi
   danh sách đó vào **commit message** (mục `Kiểm giữ:`). Test cũ của đoạn đó xanh **không đổi kỳ vọng**.
3. **Spec cạnh file nó kiểm; test lỗi khẳng định mã lỗi.** `<tên>.ts` ⟹ `<tên>.spec.ts` cùng thư mục. Mọi test của nhánh lỗi khẳng định **mã**
   (`code`/`DOMAIN.REASON`) và status, không chỉ "throws". Mỗi bảng tiêu chí SPEC ⟹ một `it.each` đúng các số; mỗi luật tiền có ca biên + ca diệt đột
   biến (SPEC §11).
4. **Không nới gì để xanh.** Không sửa/nới test, assertion, gate, manifest, registry (`COLLECTION_EXCEPTIONS`, `NESTED_ARRAYS`, `NO_EXAMPLE_RESPONSES`,
   `GRAPH_WIRING_EXCEPTIONS`, `RUNTIME_*_EXCEPTIONS` ngoài mục SPEC cho phép); không `skip`/`only`/xóa test; không `eslint-disable`, không thêm
   `eslint-suppressions.json`; không hạ ngưỡng coverage/complexity.
5. **Gói hỏng sau 2 vòng sửa** (bộ kiểm nhanh vẫn đỏ, hoặc không ra số SPEC) ⟹ `git --no-pager diff > docs/reviews/redesign-w3-2026-11-22/wip/<gói>.patch`
   (chỉ file của gói), `git restore --source=HEAD -- <đúng các file của gói>` (không `reset --hard`, không đụng file gói khác), ghi `PROGRESS-<làn>.md`
   `dừng hỏi` + đường dẫn patch, sang gói độc lập kế. **Không bao giờ commit code đỏ lên nhánh gộp** (`int/redesign-w3`).
6. **Orchestrator tự đối chiếu trước khi ghi `xong`.** Người chạy prompt (hoặc agent điều phối) tự đọc `git --no-pager diff <sha trước>..HEAD -- <file nghiệp
vụ của gói>` (không tin báo cáo của subagent), đối chiếu **từng** tiêu chí SPEC của gói (bảng ca → test nào, file:line nào), ghi bảng đối chiếu vào
   PROGRESS. Còn một tiêu chí dở ⟹ trạng thái `đang làm`/`dừng hỏi`, **không** `xong`.
7. **Mỗi commit:** bộ kiểm nhanh (mục 3 bước 8) + `CI=true pnpm test -- <spec của file đã sửa>` (PowerShell: `$env:CI='true'; pnpm test -- …`) + 1–2 test **quan trọng nhất của luật mới** (ghi tên test
   vào commit message, mục `Test chính:`).
8. **Mô tả OpenAPI không chứa mã nội bộ:** `QĐ-`, `FR-`, `US-`, `KHO-`, `MAY-`, `W1-`, `W2-`, `W3-`, `D-`, `OQ-`, `MF-`, `SBF-` (kiểm
   `grep -nE "QĐ-|FR-|US-|KHO-|MAY-|W[123]-|\bD-[0-9]|OQ-|MF-|SBF-" openapi.json` chỉ ra chỗ có từ trước đợt). Comment trong `src` nói lý do, không mã
   `W3-xx`/`KHO-`.
9. **Không chạy full test, Docker, seed, migration trên máy.** Chỉ bộ kiểm nhanh + unit file sửa. http/integration/e2e chạy trên **CI GitHub cuối làn**
   (mục 7).
10. **QĐ-118 (quyền theo phạm vi):** việc của **phòng** (mua seat cho mục chờ cấp, tạo lô `REQUEST`, cấp/thu hồi) chỉ người làm của phòng người thụ
    hưởng — `ProvisioningTaskFrameService.requireActingItAdmin` / `OrganizationReadApi.itAdminsActingFor(departmentIds, usableAmong, tx?)` (truyền
    `ids => identity.findUsableItAdminEmployeeIds(ids, tx)`); việc của **thuê bao/workspace/lô** (sửa dòng, ghi theo hãng, giảm giữa kỳ, sửa
    workspace/admin, sửa lô, nhập khóa vào lô) chỉ **IT phụ trách** bản ghi đó; đổi người phụ trách chỉ **Super Admin** (route riêng) hoặc `SBF-16`;
    người tạo là người phụ trách ban đầu. Route **đọc** catalog cấp tổ chức (`IT_ADMIN`, `FINANCE`, `SUPER_ADMIN`). Không viết nhánh "IT khác làm thay"
    hay hàng việc chung. Người nhận thông báo theo SPEC §8.1 (R1/R2).
11. **Thứ tự khóa gộp (SPEC §6.2):** 0 → 0b → 0c → employee (1) → phòng (2) → **máy 2b** → tác vụ 3a/3b → Request (4) → cycle (5) → **workspace 5b** → kỳ
    (6) → **lô 6a** / **dòng 6c** → chèn sổ 6d → gói (7) → **khóa 7b** → **kích hoạt/quyền 8** → cam kết (9) → **tháng cam kết 9b** → CC-year (10). Không còn
    tên tầng "6b". **Luồng đã biết kỳ mà cần workspace** (`subscriptionUpdate` đổi `workspaceId`, hoàn tất bản nháp, `subscriptionLineAdd`): đọc
    `workspace_id` không khóa → khóa workspace `ORDER BY id` → khóa kỳ → đọc lại `workspace_id`, lệch thì rollback thử lại (SPEC-B2 W3-14, N5).
    `lockLot` khóa lô rồi gói FS. Nhiều dòng một tx ⟹ một câu `ORDER BY id`; nhiều cam kết ⟹ mỗi cam kết một tx, sắp (`year`, `id`); vòng lặp nhiều seat theo
    `compareSeatLockOrder`. Comment đầu service mới ghi thứ tự khóa. Đường khóa thật khác bảng ⟹ dừng (mục 5).

## 0. Skill Preflight (bắt buộc, trước mọi việc, và lại sau mỗi lần compact context)

1. Liệt kê skill có sẵn. Đọc đầy đủ `SKILL.md` của: một process skill (`superpowers:executing-plans` hoặc `agent-skills:incremental-implementation`);
   `superpowers:test-driven-development` (hoặc `agent-skills:test-driven-development`); `superpowers:verification-before-completion`. Không có đúng tên
   ⟹ skill gần nhất, ghi mapping.
2. Đọc trong repo: `AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/README.md`, `docs/guides/quy-trinh-code-ai.md`, `docs/rules/database-business.md` (mục
   _Thứ tự khóa chuẩn_), `docs/rules/module-structure.md`, `docs/rules/api-contract.md`, `docs/rules/security-jobs.md`, `docs/rules/operational-commands.md`
   (seed), `test/README.md`.
3. Đọc trọn **`SPEC.md`**, phần SPEC của gói (`SPEC-B1.md` / `SPEC-B2.md` / `SPEC-B3.md`) và **`PLAN.md`** — nguồn duy nhất của việc cần làm. Luật ở
   _Hành vi đúng_ và _Tiêu chí chấp nhận_; mã `QĐ-…`, `KHO-…` chỉ để tra. SPEC §13 _Đã chốt_ và dòng `Owner đã chốt:`: không hỏi lại, không tự đổi.
   `REVIEW-SPEC.md`, `OWNER-ANSWERS.md` chỉ để tra lý do.
4. Đọc `PROGRESS-<làn>.md`, `OVERNIGHT-DECISIONS-<làn>.md` (nếu có) — trí nhớ qua compact.
5. Đầu mỗi báo cáo liệt kê skill/rule đã đọc và mục đích.

## 1. Chuẩn bị nhánh (chỉ lần đầu)

```bash
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management status --short   # phải sạch
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management fetch origin
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management --no-pager log --oneline -1 origin/dev
# đợt 1 (squash) là tổ tiên
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management merge-base --is-ancestor 4e029dbd origin/dev && echo "dot1 OK"
# đợt 2 đã ở dev (squash ⟹ kiểm file): phải in đủ 4 dòng; rồi lệnh diff dưới phải RỖNG
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management --no-pager ls-tree --name-only origin/dev \
  prisma/migrations/20261124100400_saas_issue_awaiting_assignee/migration.sql \
  prisma/migrations/20261124100200_device_activations/migration.sql \
  src/modules/licensing/device-activation/device-activation.service.ts \
  src/modules/catalog/subscription/responsible/subscription-responsible.controller.ts
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management --no-pager diff --stat origin/dev origin/int/redesign-w2 -- src prisma
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management --no-pager ls-tree --name-only origin/dev docs/reviews/redesign-w3-2026-11-22/SPEC.md
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management config user.email   # phải là email của chính người làm
# làn tech (Bảo):
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management checkout -b feat/redesign-w3-tech origin/dev
# làn biz (Owner): nhánh gộp do Owner tạo từ dev mới nhất
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management checkout -b int/redesign-w3 origin/int/redesign-w3
```

- Thiếu đợt 1, **thiếu đợt 2** (ít hơn 4 dòng, hoặc `diff --stat` không rỗng), hoặc thiếu thư mục việc ⟹ **dừng, báo lại** (không có nhánh "đợt 2 chưa merge").
- Làn `biz`: chưa có `origin/int/redesign-w3` ⟹ dừng, báo Owner tạo từ `dev`.
- `git config user.email` sai ⟹ sửa ở **repo này** (không `--global`); không biết ⟹ dừng, hỏi.
- Đã có nhánh ⟹ `checkout`, `git pull --ff-only` (làn `biz`), đối chiếu `git --no-pager log` với `PROGRESS-<làn>.md`, làm tiếp gói kế.
- Tạo nếu chưa có: `FIX-TEST-<làn>.md` (`| Gói | File test | Ca | Lý do |`), `OVERNIGHT-DECISIONS-<làn>.md` (bảng mục 4), thư mục `wip/`.
- Mở SPEC §10 (phụ thuộc đợt 1, đợt 2) và kiểm nhanh trên `origin/dev`; lệch ⟹ ghi `PROGRESS-<làn>.md` mục _Phụ thuộc_, làm theo code thật nếu không đổi
  luật, không thì dừng (LUẬT CỨNG 1).

## 2. Thứ tự gói

- **tech:** P1 → P3 → (G2) P9 → (G4) P11 → P12a → P20b → P12b → (G5) P14 → (G6) P15 → (G8) P21 → P22 → P23.
- **biz:** (G1) P2 → P4 → P5 → P6 → P7 → P8 → (G3) P10 → (G5) P13a → P13b → P16a → (G7) P16b → P17 → P18 → P19 → P20 → P23.
- Gói có điểm gộp (PLAN bảng _Điểm gộp_ G1…G8): chỉ bắt đầu khi người điều phối báo làn kia đã merge vào `int/redesign-w3`; khi đó (làn `tech`)
  `git fetch origin && git merge origin/int/redesign-w3` (không rebase) hoặc (làn `biz`) `git pull --ff-only`, rồi `pnpm prisma:generate`,
  `pnpm openapi:export`, bộ kiểm nhanh, rồi làm. **P9 chỉ sau khi PR B1 → `dev` đã mở** (PR B1 không kéo code B2). Chưa được báo ⟹ làm gói độc lập kế
  của làn hoặc dừng chờ.
- **Chỉ sửa file trong danh sách của gói** (PLAN; `*` = file chung chỉ thêm dòng). Cần file khác ⟹ không sửa, ghi _Bàn giao_, làm tiếp phần không phụ
  thuộc.

## 3. Cách làm từng gói

1. Đọc lại `PROGRESS-<làn>.md`, khối W3-xx của gói trong SPEC, mục gói trong PLAN. Mở code thật ở các `file:line` (SPEC đọc trên `int/redesign-w2`
   `8a4c8b70`; dòng có thể đã dời) và xác nhận hiện trạng. Khác mà không đổi luật ⟹ làm theo _Hành vi đúng_, ghi `D-n` (tự chốt). Khác mà đổi luật ⟹
   LUẬT CỨNG 1.
2. Ghi gói vào `PROGRESS-<làn>.md` trạng thái `đang làm`.
3. **Unit test đỏ trước** cho luật mới; `CI=true pnpm test -- <file>` thấy đỏ đúng lý do.
4. Code tối thiểu cho xanh, theo: tầng module và cửa `public/` (không import ngoài `public/` của module khác, không query bảng module khác); capability
   không vòng (`pnpm arch:capabilities --module <m>`); hậu tố file, một `@Injectable` mỗi file; lỗi nghiệp vụ trong `*.errors.ts`, ánh xạ HTTP trong
   `*.http-errors.ts`, một mã một status; mọi đọc trong `runner.run` qua `tx`, không `Promise.all` trên `tx`; tiền `BigInt` đồng, `roundHalfAway`, không
   số thực; route mới sửa bản ghi bắt `expectedUpdatedAt`; collection mới đủ `API-LIST-DETAIL.1`; trần 500 dòng/file, 25 file/thư mục, `complexity` 12,
   hàm 60 dòng, 8 tham số — vượt thì tách theo chức năng (LUẬT CỨNG 2).
5. Migration (chỉ làn `tech`): tên đúng SPEC §5; khối kiểm trước `RAISE EXCEPTION`; comment đầu file ghi SQL đảo; không nêu tên vai DB; **không sửa
   migration đã merge** (M6 `CREATE OR REPLACE` hàm của đợt 2 trong file **mới**); `pnpm prisma:validate` + `pnpm prisma:generate`.
6. Seed (chỉ làn `tech`): sửa `src/cli/seed/**` theo gói, cập nhật spec unit của step; không nới luật cho seed; không chạy seed.
7. Viết test http/integration SPEC/PLAN nêu (≤ 800 dòng mỗi file). **Không chạy** ở máy. Luồng khóa mới: 2 connection, barrier, lặp 20, không `40P01`.
8. **Bộ kiểm nhanh**, tất cả xanh:

   ```text
   pnpm typecheck
   pnpm lint
   pnpm arch:check
   pnpm arch:capabilities --module <module đã chạm>
   pnpm rules:check
   pnpm test:gates
   pnpm openapi:export && git --no-pager diff --stat openapi.json
   CI=true pnpm test -- <mọi *.spec.ts đã chạm hoặc thêm>
   ```

   Thêm `pnpm rules:format` khi sửa `docs/rules/*.md` hoặc `src/modules/*/README.md`; `pnpm prisma:validate && pnpm prisma:generate` khi sửa `prisma/`.
   Cập nhật manifest OpenAPI (`test/support/openapi-example-manifest.ts`, `openapi-example-route-codes-*.ts`, `api-coverage-manifest.ts`) cho mọi operation
   mới/đổi.

9. Test cũ khẳng định hành vi cũ: unit của chính luật đổi theo SPEC ⟹ sửa kỳ vọng **chỉ khi** SPEC nói luật đổi (ghi tên test + mục SPEC vào commit);
   http/integration/flow ⟹ `FIX-TEST-<làn>.md`, không xóa, không `skip` (LUẬT CỨNG 4).
10. **Tự review diff** (LUẬT CỨNG 6): bảng đối chiếu tiêu chí → test → `file:line`; không thừa phạm vi (SPEC §2.2); OpenAPI không mã nội bộ (LUẬT CỨNG 8).
11. Commit một gói một commit (hoặc vài commit nhỏ cùng gói) bằng **git identity của chính người làm**; **không** `Co-Authored-By`/attribution AI.
    Message: `feat(<module>): <tóm tắt> (redesign W3 <gói>)` + thân: W3-xx; `Test chính:` (1–2 test); `Kiểm giữ:` (gói refactor); `D-n` nếu có; câu
    `SELECT` kiểm trước (gói migration).
12. Cập nhật `PROGRESS-<làn>.md`: `xong` (chỉ khi LUẬT CỨNG 6 đạt), sha, lệnh + kết quả thật (số test pass/fail), FIX-TEST, D-n, chỗ chưa kiểm. Push sau
    mỗi vài gói (`tech`: `git push -u origin feat/redesign-w3-tech`; `biz`: `git push origin int/redesign-w3`).

## 4. Tự quyết và ghi lại (`OVERNIGHT-DECISIONS-<làn>.md`)

Câu hỏi nhỏ, SPEC không nói mà **không** đổi hành vi nghiệp vụ ⟹ không dừng, cân 2–3 phương án, chọn theo căn cứ: SPEC (§4–§8, §13) → sổ QĐ
(`Docs/Decisions/project-decisions.md`, tới `QĐ-119e`) → BRD 4.19 → `Docs/Research-AI/redesign-2026-11-21/W1c-luat-kho-seat-ban-cuoi.md` → code/test hiện
có → rule repo. Ưu tiên phương án đơn giản, dễ đảo, không xóa dữ liệu, không đổi contract khó lùi. Ghi:

```md
| D-n | Gói | file:line | Câu hỏi | Phương án A/B/C | Chọn + căn cứ | Cách đảo lại | Mức (tự chốt / cần Owner) |
```

Được tự quyết: tên file/hàm/lớp lỗi trong capability đã chỉ, câu chữ mô tả OpenAPI và message, chỗ đặt route giữa controller cùng capability, tách
file khi chạm trần, câu SQL, tên index/constraint, cách dựng test. **Không** tự quyết (⟹ `cần Owner`, giữ hành vi cũ): tiền, quyền, trạng thái, người
nhận thông báo, mã lỗi mới FE thấy ngoài SPEC. Còn < 10 % context ⟹ ghi _Dừng ở đâu_ rồi dừng.

## 5. Điều kiện DỪNG cứng

Dừng gói đó, ghi `PROGRESS-<làn>.md` kèm `file:line`, 2–3 lựa chọn và khuyến nghị, báo người điều phối, làm tiếp gói độc lập nếu có:

1. Luật không rõ mà mục 4 không giải được; code thật khác SPEC theo cách đổi hành vi nghiệp vụ; một ví dụ số của SPEC không ra đúng công thức SPEC.
2. Cần migration ngoài SPEC §5, sửa `prisma/models` ở làn `biz`, sửa migration đã merge, migration phá dữ liệu.
3. Cần cạnh module mới, extension point mới, đổi tầng, dependency npm mới.
4. Gate chỉ xanh khi nới gate/thêm suppression/thêm mục registry mà gate từ chối (LUẬT CỨNG 4).
5. Đường khóa thật trái SPEC §6.2 (ngoài E1–E4).
6. Thiếu đợt 1/đợt 2/thư mục việc ở `origin/dev`; cây làm việc có thay đổi lạ; gói cần file của làn kia; git identity không phải của người làm.
7. Khối kiểm trước của migration có thể dừng trên DB demo: **không** tự sửa dữ liệu; ghi câu `SELECT` vào commit message và báo.

## 6. Không được làm

- Không chạy `pnpm check`, `test:http`, `test:integration`, `test:e2e`, seed, Docker, migration trên DB.
- Chỉ push **nhánh của làn mình**. Không merge vào `dev`, `main`; làn `tech` không merge vào `int/redesign-w3`; không mở PR; không deploy.
- Không sửa `openapi.json`, `docs/generated/*`, `src/generated/*` bằng tay.
- Không xóa/`skip` test; không `eslint-disable`; không co-author; không commit bằng identity người khác.
- Không làm ngoài phạm vi (SPEC §2.2 — đặc biệt quyền theo vai `ROLE_RIGHT`, hóa đơn âm), kể cả thấy lỗi gần đó — ghi vào báo cáo cuối.
- Không tự ghi Owner đã duyệt hay nghiệm thu.

## 7. Cuối làn: CI GitHub đầy đủ (chạy tay) rồi báo cáo

1. Push nhánh làn rồi `gh workflow run ci.yml --ref <nhánh làn>`. Không chạy được `gh` ⟹ báo người điều phối (GitHub → Actions → CI → Run workflow).
2. Theo dõi: `gh run list --workflow ci.yml --branch <nhánh làn>`, `gh run view <id> --log-failed`.
3. Job đỏ do **logic** (500, sai tiền/quyền/trạng thái, test luật mới) ⟹ sửa, kiểm nhanh, commit, push, chạy lại job đó; do **nợ test** (test cũ khẳng
   định hành vi cũ, harness, seed) ⟹ `FIX-TEST-<làn>.md`.
4. Ghi mỗi lần chạy vào bảng _CI GitHub_ của `PROGRESS-<làn>.md`.
5. Báo cáo cuối (≤ 60 dòng): skill đã đọc; bảng gói → sha → W3-xx → lệnh kiểm + kết quả; CI từng job (link); contract đổi (đối chiếu SPEC §7.1, §7.2);
   migration + câu `SELECT` kiểm trước; số dòng FIX-TEST; D-n (đánh dấu _cần Owner_); phụ thuộc lệch; việc ngoài phạm vi; _Bàn giao_. Câu bắt buộc:
   "Full test chỉ chạy trên CI GitHub".

Sau đó **dừng**, chờ Opus review trên nhánh gộp. Sửa finding xong ⟹ CI lại như bước 1–4 rồi báo lại. Không mở PR, không merge.

## 8. Ghi chú khi chạy bằng Neon / Antigravity (agent điều phối nhiều subagent)

- **Mỗi gói một subagent, tuần tự** (không song song, không worktree, không hai subagent cùng sửa một file). Agent điều phối giao đúng **một** gói kèm
  đường dẫn SPEC/PLAN của gói và LUẬT CỨNG; sau khi subagent báo xong, điều phối tự làm LUẬT CỨNG 6 trước khi giao gói kế.
- Mọi lệnh `git` dùng `--no-pager` (`git --no-pager diff`, `git --no-pager log`) — pager treo agent.
- Mọi lệnh jest dùng `CI=true` để không vào chế độ watch: Git Bash `CI=true pnpm test -- <file>`; **PowerShell** `$env:CI='true'; pnpm test -- <file>`
  (PowerShell không nhận tiền tố `CI=true`).
- Shell Windows: dùng đường dẫn tuyệt đối; lệnh dài tách nhiều lệnh nhỏ; không `&` chạy nền.

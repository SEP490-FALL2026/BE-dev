# Prompt dán sẵn cho chat code — Đợt 2 thiết kế lại (chế độ tự quyết, bản 2)

> Dán nguyên khối dưới vạch vào một chat Sonnet (model **sonnet**) hoặc Gemini mới **sau khi** Owner đã duyệt SPEC/PLAN bản 2.
> Sửa dòng `LÀN:` trước khi dán. Câu Owner đã trả lời nằm ở dòng `Owner đã chốt:` (mọi câu đã chốt).
> Quy trình chung: `docs/guides/quy-trinh-code-ai.md`.

---

**LÀN: tech** ← đổi thành `biz` nếu là làn nghiệp vụ
**Nhánh:** làn `tech` = nhánh của Bảo `feat/redesign-w2-tech`; làn `biz` = làm **thẳng trên** `int/redesign-w2` · **Nhánh gộp:**
`int/redesign-w2`
**Owner đã chốt:** W2-Q1 = khóa theo máy làm ngay (kèm S-4; đợt 2 merge trước M6 đợt 3) · W2-Q2 = báo lỗi quyền gắn máy sang
đợt 7 (không đụng `saasIssue*`) · W2-Q3 = `NO_COLLECTOR` + `signatureMissing`, cờ collector chỉ bật · W2-Q4 = nhắc quá hạn mỗi ngày
làm việc · W2-Q5 = lượt ban đầu chung một lần nhập · RC-9 + QĐ-118 = chỉ IT phụ trách phòng hoặc người Super Admin chỉ định, bỏ hàng
việc IT chung · Q7 = chỉ Super Admin đổi IT phụ trách thuê bao (route riêng) · Q8 = QĐ-118 cho mọi route/thông báo còn lại ngay đợt 2 · Q9 = giữ `QĐ-77m` (tự cấp, cờ tự thực thi, báo Super Admin) · W2-Q6 = giao/thu máy và kích hoạt/gỡ/chuyển quyền gắn máy theo phòng người nhận/người giữ (chuyển khác phòng cần cả hai), máy trong kho mọi IT

Trả lời bằng **tiếng Việt**. Giữ nguyên tiếng Anh cho tên file, hàm, lệnh, mã lỗi và code.

Bạn là người code của **một làn** trong đợt 2 thiết kế lại BE SaaS-Sentry (NestJS 11 + Prisma + PostgreSQL, modular monolith).
Repo: `D:\FPT\FALL2026\Code\BE-dev-software-license-management`. Thư mục việc: `docs/reviews/redesign-w2-2026-11-22/`.
Đây là **chế độ tự quyết**: bạn làm hết các gói của làn mình không chờ duyệt giữa gói; gặp câu hỏi thì tự chọn theo căn cứ và
ghi lại (mục 4), chỉ dừng ở các điều kiện cứng (mục 5).

## 0. Skill Preflight (bắt buộc, trước mọi việc, và lại sau mỗi lần compact context)

1. Liệt kê skill có sẵn. Đọc đầy đủ `SKILL.md` của: một process skill (`superpowers:executing-plans` hoặc
   `agent-skills:incremental-implementation`); `superpowers:test-driven-development` (hoặc `agent-skills:test-driven-development`);
   `superpowers:verification-before-completion`. Không có đúng tên thì dùng skill gần nhất và ghi mapping.
2. Đọc trong repo: `AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/README.md`, `docs/guides/quy-trinh-code-ai.md`,
   `docs/rules/database-business.md` (mục _Thứ tự khóa chuẩn_), `docs/rules/module-structure.md`, `docs/rules/api-contract.md`,
   `docs/rules/security-jobs.md` (phần job/sweeper), `docs/rules/operational-commands.md` (phần seed), `test/README.md`.
3. Đọc trọn **`SPEC.md`** và **`PLAN.md`** của thư mục việc — nguồn duy nhất của việc cần làm. Luật nằm ở SPEC mục 4 (bảng trạng
   thái), cột _Hành vi đúng_ / _Tiêu chí_ của mục 5 và mục 6 (thứ tự khóa, ngoại lệ E4); mã `QĐ-…`, `MAY-…`, `KHOA-…` chỉ để tra.
   SPEC mục 13 _Đã chốt_ và dòng `Owner đã chốt:` ở trên: không hỏi lại, không tự đổi. `REVIEW-SPEC.md`, `OWNER-ANSWERS.md` chỉ để
   tra lý do (SPEC bản 2 đã áp).
4. Đọc `PROGRESS-<làn>.md`, `OVERNIGHT-DECISIONS-<làn>.md` (nếu có) của thư mục việc — trí nhớ của bạn qua compact context.
5. Đầu mỗi báo cáo, liệt kê skill/rule đã đọc và mục đích.

## 1. Chuẩn bị nhánh (chỉ lần đầu)

```bash
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management status --short   # phải sạch
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management fetch origin
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management log --oneline -1 origin/dev
# đợt 1 đã vào dev bằng squash: kiểm bằng tổ tiên, KHÔNG tìm merge commit
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management merge-base --is-ancestor 4e029dbd origin/dev && echo "dot1 OK"
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management ls-tree --name-only origin/dev docs/reviews/redesign-w2-2026-11-22/SPEC.md
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management config user.email   # phải là email của chính người làm
# làn tech (Bảo):
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management checkout -b feat/redesign-w2-tech origin/dev
# làn biz (Owner): nhánh gộp do Owner tạo từ dev mới nhất
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management checkout -b int/redesign-w2 origin/int/redesign-w2
```

- `origin/dev` phải (a) có `4e029dbd` là tổ tiên (đợt 1 đã vào, bằng **squash** — không có merge commit nào để tìm) và (b) chứa
  thư mục `docs/reviews/redesign-w2-2026-11-22/` (coordinator đưa lên trước khi dán prompt). Thiếu một trong hai ⟹ **dừng, báo
  lại**.
- Làn `biz`: chưa có `origin/int/redesign-w2` ⟹ dừng, báo Owner tạo từ `dev` (không tự tạo).
- `git config user.email` phải là git identity của **chính người làm** (Bảo dùng email GitHub của Bảo; Owner dùng email của
  Owner). Sai ⟹ sửa bằng `git config user.email <email>` / `user.name` ở **repo này** (không `--global`) rồi kiểm lại; không biết
  email ⟹ dừng, hỏi.
- Đã có nhánh ⟹ `checkout` nó, `git pull --ff-only` (làn `biz`), đối chiếu `git log` với `PROGRESS-<làn>.md`, làm tiếp gói kế.
- Tạo nếu chưa có: `FIX-TEST-<làn>.md` (bảng `| Gói | File test | Ca | Lý do |`) và `OVERNIGHT-DECISIONS-<làn>.md` (bảng mục 4).
- Mở SPEC mục 12 (phụ thuộc đợt 1, đã kiểm trên `4e029dbd`) và kiểm nhanh lại trên `origin/dev` hiện tại; dòng nào lệch ⟹ ghi
  `PROGRESS-<làn>.md` mục _Phụ thuộc đợt 1_ và làm theo code thật nếu không đổi luật, không thì dừng (mục 5).

## 2. Thứ tự gói

- **tech:** pha 1 T1 → T2 → T3 → T3b → T4 → T5, push nhánh, báo người điều phối "pha 1 xong". Pha 2 (T6 → T7) **chỉ** khi người điều
  phối báo làn `biz` đã xong B9 trên `int/redesign-w2`: `git fetch origin && git merge origin/int/redesign-w2` (không rebase),
  chạy lại `pnpm prisma:generate`, `pnpm openapi:export` + bộ kiểm nhanh, rồi làm.
- **biz:** pha A B0 (làm ngay trên `int/redesign-w2`). Pha B **chỉ** khi người điều phối báo Owner đã merge pha 1 của làn `tech`
  vào `int/redesign-w2`: `git pull --ff-only`, `pnpm prisma:generate`, bộ kiểm nhanh, rồi B10a → B1 → B2a-1 → B2a-2 → B2b → B3a-1 →
  B3a-2 → B3b → B4 → B5a → B5b → B5c → B6 → B7 → B8 → B10b → B10c → B10d → B10e → B10f → B10g → B11 → B9.
- **Chỉ sửa file trong danh sách của gói** (PLAN). Cần file của làn kia ⟹ không sửa, ghi `PROGRESS-<làn>.md` mục _Bàn giao_, làm
  tiếp phần không phụ thuộc. `devices.module.ts` chỉ làn `biz` sửa (làn `tech` ghi _Bàn giao_ cho B1).

## 3. Cách làm từng gói

1. Đọc lại `PROGRESS-<làn>.md`, rồi khối W2-xx của gói trong SPEC. Mở code thật ở các `file:line` được nêu (SPEC đọc trên
   `origin/dev` `4e029dbd`; dòng có thể đã dời) và xác nhận hiện trạng. Khác mà không đổi luật ⟹ làm theo _Hành vi đúng_, ghi một
   dòng D-n (mục 4).
2. Ghi gói vào `PROGRESS-<làn>.md` trạng thái `đang làm`.
3. **Unit test đỏ trước** cho luật mới; chạy `pnpm test -- <file>`, thấy đỏ đúng lý do.
4. Sửa code tối thiểu cho xanh, theo đúng:
   - tầng module và cửa `public/`; không import file ngoài `public/` của module khác; không query bảng của module khác (gate
     `architecture-boundaries`); capability không vòng (`pnpm arch:capabilities --module <m>`);
   - hậu tố file, một `@Injectable` mỗi file, lỗi nghiệp vụ trong `*.errors.ts`, ánh xạ HTTP trong `*.http-errors.ts`;
   - **thứ tự khóa SPEC mục 6** (0b baseline → 0c bộ đếm → employee → phòng → máy → đăng ký → việc thu máy → khoản mua → khóa →
     kích hoạt; nhiều máy khóa trong một câu theo `id`; ngoại lệ duy nhất E4); comment đầu service ghi thứ tự khóa của nó;
   - **QĐ-118:** việc của phòng chỉ người làm của phòng (`OrganizationReadApi.itAdminsActingFor`); không viết lại nhánh "IT khác
     khi người phụ trách không dùng được" hay hàng việc chung ở bất kỳ đâu;
   - mọi đọc trong `runner.run` qua `tx`; không `Promise.all` trên `tx`;
   - collection mới đủ `API-LIST-DETAIL.1` (summary riêng, `pageSize` có `maximum`, thứ tự có `id`, đếm + trang một snapshot,
     projection ở repo, số câu lệnh không theo số dòng) — **không** thêm mục registry của gate;
   - mô tả OpenAPI không chứa `QĐ-`, `FR-`, `US-`, `MAY-`, `KHOA-`, `MF-`, `SBF-`, `W2-`, `C-x`;
   - trần 500 dòng/file `src`, 25 file/thư mục; vượt thì tách theo chức năng, không suppression.
5. Seed (chỉ làn `tech`, T6): sửa `src/cli/seed/**` cho đi đúng luật mới (sắp lại mảng `demoSteps`, SPEC W2-25), cập nhật spec
   unit của step. Không nới luật cho seed. Không chạy seed.
6. Viết test http/integration mà SPEC yêu cầu (đường dẫn ở SPEC mục 9). **Không chạy** chúng ở máy. Mỗi file ≤ 800 dòng.
7. Test cũ khẳng định hành vi cũ: unit của chính luật (kể cả spec seed step của làn mình) ⟹ sửa ngay; http/integration/flow ⟹
   `FIX-TEST-<làn>.md`, không xóa, không `skip`. Làn `biz`: spec seed đỏ vì body `POST /devices` đổi ⟹ một dòng "chờ T6". Test đợt 1
   khẳng định "IT khác làm thay"/hàng `GENERAL` ⟹ đổi kỳ vọng theo SPEC W2-27 (unit) hoặc FIX-TEST.
8. **Bộ kiểm nhanh**, tất cả xanh:

   ```text
   pnpm typecheck
   pnpm lint
   pnpm arch:check
   pnpm arch:capabilities --module <module đã chạm>
   pnpm rules:check
   pnpm test:gates
   pnpm openapi:export && git diff --stat openapi.json
   pnpm test -- <mọi *.spec.ts đã chạm hoặc thêm>
   ```

   Thêm `pnpm rules:format` khi sửa `docs/rules/*.md` hoặc `src/modules/*/README.md`; `pnpm prisma:validate` **và**
   `pnpm prisma:generate` khi sửa `prisma/` (chỉ T1). `openapi.json` đổi đúng chủ đích thì commit cùng gói.

9. **Tự review diff** theo SPEC: đủ tiêu chí, không thừa phạm vi (SPEC mục 2.2), comment nói lý do (không mã `W2-xx`, `MAY-xx`,
   `KHOA-xx`, `QĐ-`), manifest OpenAPI (`test/support/openapi-example-manifest.ts`, `openapi-example-route-codes-*.ts`,
   `openapi-example-messages-*.ts`, `api-coverage-manifest.ts`) cập nhật cho mọi operation mới/đổi.
10. Commit một gói một commit bằng **git identity của chính người làm** (Bảo: email GitHub của Bảo). **Không** `Co-Authored-By`
    hay dòng attribution của AI. Message: `feat(<module>): <tóm tắt> (redesign W2 <gói>)` + thân liệt kê W2-xx; có D-n thì thêm
    `(tạm chốt D-n)`.
11. Cập nhật `PROGRESS-<làn>.md`: `xong`, sha, lệnh đã chạy + kết quả thật (số test pass/fail), dòng FIX-TEST đã thêm, D-n,
    điểm chưa kiểm được. Commit cùng gói.
12. Push sau mỗi vài gói: làn `tech` `git push -u origin feat/redesign-w2-tech`; làn `biz` `git push origin int/redesign-w2`. Sang
    gói kế, không chờ duyệt.

## 4. Tự quyết và ghi lại (`OVERNIGHT-DECISIONS-<làn>.md`)

Gặp câu hỏi, mâu thuẫn nhỏ hoặc SPEC không nói ⟹ **không dừng**, tự cân 2–3 phương án và chọn theo thứ tự căn cứ: SPEC (mục 4,
5, 6, 13, 14) → sổ QĐ (`Docs/Decisions/project-decisions.md`; QĐ-118 thay các QĐ "IT khác làm thay"/hàng chung) → BRD 4.17
→ `Docs/Research-AI/redesign-2026-11-21/W2c-luat-khoa-may-ban-cuoi.md` → code/test hiện có → rule repo → thông lệ. Ưu tiên phương
án đơn giản, dễ đổi lại: không xóa dữ liệu, không drop, không đổi contract khó lùi, **không** chốt điều trái QĐ hay trái SPEC. Ghi
một dòng:

```md
| D-n | Gói | file:line | Câu hỏi | Phương án A/B/C | Chọn + căn cứ | Cách đảo lại | Mức (tự chốt / cần Owner) |
```

Được tự quyết: tên file/hàm/lớp lỗi, câu chữ mô tả OpenAPI, chỗ đặt route giữa các controller của cùng capability, tách file/gói
khi gần trần, thứ tự kiểm khi SPEC không nói, cách dựng test. Gói bị chặn một phần ⟹ ghi mục _Bị chặn_ của `PROGRESS-<làn>.md`,
làm tiếp phần không phụ thuộc. Còn < 10 % context ⟹ ghi mục _Dừng ở đâu_ rồi dừng.

## 5. Điều kiện DỪNG cứng (không tự quyết)

Dừng gói đó, ghi `PROGRESS-<làn>.md` kèm `file:line`, 2–3 lựa chọn và khuyến nghị, báo người điều phối, làm tiếp gói độc lập nếu có:

1. Luật nghiệp vụ không rõ mà mục 4 không giải được, hoặc code thật khác SPEC theo cách đổi hành vi nghiệp vụ (tiền, quyền, trạng
   thái máy/kích hoạt/việc thu máy, người được làm việc của phòng).
2. Cần migration ngoài SPEC mục 3, sửa `prisma/models` ngoài T1, sửa migration đã merge, hoặc migration phá dữ liệu.
3. Cần cạnh module mới, extension point mới, đổi tầng, dependency npm mới.
4. Gate chỉ xanh khi nới gate, thêm suppression hay thêm mục registry (`COLLECTION_EXCEPTIONS`, `NESTED_ARRAYS`,
   `NO_EXAMPLE_RESPONSES`, `GRAPH_WIRING_EXCEPTIONS`).
5. Một đường khóa thật trái SPEC mục 6 (ngoài E4).
6. `origin/dev` không có `4e029dbd` làm tổ tiên hoặc thiếu thư mục việc; cây làm việc có thay đổi lạ; gói cần sửa file của làn kia;
   git identity không phải của người làm.
7. Gặp chỗ "IT khác làm thay"/hàng chung **ngoài** danh sách H1–H17 của SPEC W2-27: ghi lại, không tự sửa.

## 6. Không được làm

- Không chạy `pnpm check`, `test:http`, `test:integration`, `test:e2e`, seed, Docker hay migration trên DB.
- Chỉ push **nhánh của làn mình** (`tech`: `feat/redesign-w2-tech`; `biz`: `int/redesign-w2`). Không merge vào `dev`, `main`; làn
  `tech` không merge vào `int/redesign-w2`; không mở PR; không deploy. CI chỉ chạy tay theo mục 7.
- Không sửa `openapi.json`, `docs/generated/*`, `src/generated/*` bằng tay.
- Không xóa/`skip` test. Không `eslint-disable`, không thêm mục `eslint-suppressions.json`.
- Không co-author, không dòng attribution của AI, không commit bằng identity của người khác.
- Không làm việc ngoài phạm vi (SPEC mục 2.2: báo lỗi quyền gắn máy là đợt 7), kể cả khi thấy lỗi gần đó — ghi vào báo cáo cuối.
- Không tự ghi là Owner đã duyệt hay nghiệm thu.

## 7. Cuối làn: CI GitHub đầy đủ (chạy tay) rồi báo cáo

1. Push nhánh làn rồi `gh workflow run ci.yml --ref <nhánh làn>` (`feat/redesign-w2-tech` hoặc `int/redesign-w2`). Không chạy
   được `gh` ⟹ báo người điều phối (GitHub → Actions → CI → Run workflow).
2. Theo dõi: `gh run list --workflow ci.yml --branch <nhánh làn>`, `gh run view <id> --log-failed`.
3. Job đỏ: do **logic** (500, sai trạng thái/quyền/tiền, test của luật mới) ⟹ sửa, kiểm nhanh, commit, push, chạy lại job đó; do
   **nợ test** (test cũ khẳng định hành vi cũ, harness, seed) ⟹ `FIX-TEST-<làn>.md`, không sửa lúc này.
4. Ghi mỗi lần chạy vào bảng _CI GitHub_ của `PROGRESS-<làn>.md` (commit, link run, kết quả từng job).
5. Báo cáo cuối (≤ 60 dòng): skill đã đọc; bảng gói → sha → W2-xx → lệnh kiểm + kết quả; CI từng job (link); đổi contract của làn
   (đối chiếu SPEC mục 7.2, 7.3); số dòng FIX-TEST; danh sách D-n (đánh dấu _cần Owner_); phụ thuộc đợt 1 đã lệch; việc thấy ngoài
   phạm vi; mục bàn giao cho làn kia. Câu bắt buộc: "Full test chỉ chạy trên CI GitHub".

Sau đó **dừng**, chờ Opus review trên nhánh gộp. Sửa finding xong ⟹ chạy lại CI như bước 1–4 rồi báo lại. Không mở PR, không merge.

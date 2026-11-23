# CODE PROMPT — fix/usage-listed-empty-date-g3 (Sonnet)

Trả lời tiếng Việt; giữ tiếng Anh cho tên file/hàm/biến/lệnh/thông báo lỗi gốc.

## 0. Skill Preflight (bắt buộc, trước mọi hành động)

Dùng Skill tool đọc đầy đủ rồi ghi ở đầu báo cáo (tên skill + mục đích):

- `superpowers:test-driven-development` (hoặc `agent-skills:test-driven-development`) — đỏ trước, rồi xanh.
- `superpowers:verification-before-completion` — chỉ tuyên bố xong khi có output lệnh kiểm.
- Process: `agent-skills:incremental-implementation` (một bước nhỏ, kiểm, rồi bước tiếp).

## 1. Bối cảnh

Repo: **worktree riêng** `D:\FPT\FALL2026\Code\BE-fix-g3` (KHÔNG dùng thư mục BE chính — đang có người làm đợt 2 ở đó), nhánh `fix/usage-listed-empty-date-g3` đã tạo sẵn từ `origin/dev`; lần đầu chạy `pnpm install --frozen-lockfile` rồi `pnpm prisma:generate` trong worktree. SPEC ở `docs/reviews/fix-g3-2026-11-23/SPEC.md` (có mục *Owner đã chốt* cuối file). Đọc kỹ `SPEC.md` đi kèm (nằm cạnh file này; trong repo là `docs/reviews/<wave>/fix-g3/SPEC.md` nếu đã được đưa vào) — đó là nguồn sự thật. Tóm tắt: với nguồn `AGGREGATE` có capability `lastActivity`, dòng có tên mà ô ngày trống không còn được giữ thành một lần xuất hiện `AUTH_ONLY` vào ngày cuối cửa sổ ⟹ người đó ra `NEVER_ACTIVE` (G3) thay vì `INACTIVE` (G4). Nguồn chỉ danh sách thành viên và nguồn `EVENT` giữ nguyên hành vi cũ.

## 2. Nhánh

Cây làm việc hiện tại có thể đang ở nhánh của người khác — **không** sửa/commit trên nhánh đó. Nếu `git status` không sạch ⟹ dừng và báo, không stash/reset đồ của người khác. Khi sạch:

```bash
git fetch origin
git switch -c fix/usage-listed-empty-date-g3 origin/dev
```

## 3. Các bước (theo thứ tự)

1. **Đỏ trước** — `src/modules/usage/vendor-import/parse/vendor-import-parse.policy.spec.ts`: thêm U1, U2 (đỏ) và U4, U5 (khóa hành vi, xanh) theo SPEC §6, đặt trong `describe('the rows of a report', ...)` và `describe('the JSON report of the normalized schema', ...)` sẵn có; dùng các nguồn `aggregate`, `members`, `events` đã khai ở đầu file. Chạy `pnpm jest src/modules/usage/vendor-import/parse/vendor-import-parse.policy.spec.ts` ⟹ ghi lại U1, U2 fail đúng lý do (có ngày `AUTH_ONLY`).
2. **Sửa** `src/modules/usage/vendor-import/parse/vendor-import-parse.policy.ts` đúng SPEC §4.1: thêm hàm thuần `emptyRowIsAppearance(source)` (hoặc tên tương đương), dùng ở chỗ dựng `listed` trong `parseReport`; sửa comment `judgeAgainstWindow` và **comment `parseReport`** theo SPEC. Không đổi chữ ký export, không đổi `isListedOnly`, `daysOf`, `shapeRow`, `coverage-window.policy.ts`, `csv-report.policy.ts`, `json-report.policy.ts`.
3. Chạy lại spec parse ⟹ xanh toàn file (test cũ `a member listed with no date ...` phải xanh không sửa).
4. `src/modules/usage/vendor-import/confirmation/vendor-import-confirmation.policy.spec.ts`: thêm U8 (dòng MATCHED `days: []` ⟹ `daysToWrite` trả `[]`). Chạy file đó.
5. Fixture demo: `src/cli/seed/fixture/shared-demo-v4/usage.ts` `row('NV-DES9', null)` → `row('NV-DES9', 20)` (SPEC §4.2). Chạy `pnpm jest src/cli/seed/fixture/shared-demo-v4.spec.ts src/cli/seed/steps/usage-extra.spec.ts`.
6. Integration (chỉ viết, **không chạy**): thêm 1 ca vào `test/integration/usage/usage-evidence.integration-spec.ts` theo SPEC §6 (dùng helper `aggregate`, `h.confirmed`, `evidenceFor`, `vendorOf` có sẵn trong file; đọc file để khớp chữ ký). `pnpm typecheck` + `pnpm lint` phải phủ file này.
7. Bộ kiểm nhanh (mục 4), commit, push, kích CI (mục 5).

## 4. Bộ kiểm nhanh (chạy hết, đọc output, ghi kết quả vào báo cáo)

```bash
pnpm typecheck
pnpm lint
pnpm arch:check
pnpm rules:check
pnpm test:gates
pnpm openapi:export && git diff --exit-code -- openapi.json   # phải không có diff
pnpm jest src/modules/usage/vendor-import/parse/vendor-import-parse.policy.spec.ts \
  src/modules/usage/vendor-import/confirmation/vendor-import-confirmation.policy.spec.ts \
  src/modules/optimization/usage-rules/usage-assessment.policy.spec.ts \
  src/modules/optimization/usage-rules/usage-gates.policy.spec.ts \
  src/modules/usage/usage-evidence/usage-evidence.policy.spec.ts \
  src/modules/usage/vendor-source/vendor-source.policy.spec.ts \
  src/cli/seed/fixture/shared-demo-v4.spec.ts
```

**KHÔNG** chạy full test (`pnpm test` không đối số), integration/http/e2e, Docker, seed, migration. Full suite do CI chạy.

## 5. Commit, push, CI

- Commit bằng identity git sẵn có của máy; **không** thêm dòng `Co-Authored-By` hay chữ ký AI. Gợi ý 2 commit: `test(usage): empty last-activity row is no appearance (red)` và `fix(usage): empty last-activity cell in an aggregate report means never active (G3)`; hoặc 1 commit nếu hook yêu cầu test xanh.
- Không `--no-verify`. Hook đỏ ⟹ sửa nguyên nhân.
- `git push -u origin fix/usage-listed-empty-date-g3`
- `gh workflow run ci.yml --ref fix/usage-listed-empty-date-g3`, rồi `gh run list --workflow ci.yml --branch fix/usage-listed-empty-date-g3 --limit 1` để lấy run id; báo link run. Không merge, không mở PR trừ khi được yêu cầu.

## 6. LUẬT CỨNG

1. **Không đổi hành vi ngoài SPEC.** Thấy chỗ khác "nên sửa" (TC-2 với định danh chưa khớp, ô `Never`, dữ liệu `AUTH_ONLY` cũ, `DISMISSED` vẫn chặn TC-2, ...) ⟹ **không sửa**, ghi thành `D-n (cần Owner)` trong báo cáo kèm file:line.
2. Refactor (nếu có) phải giữ **mọi** lần kiểm cũ: không bỏ điều kiện `row.errors.length === 0`, `!row.notAPerson`, giới hạn `MAX_ROW_ERRORS`, `MAX_DAYS_PER_ROW`, che định danh bí mật.
3. Spec đặt **cạnh file** nguồn (`*.spec.ts` cùng thư mục). Test ca lỗi phải khẳng định **mã lỗi** (vd. `DATE_INVALID`, `problem`), không chỉ "có lỗi".
4. **Không nới** test, gate, manifest, cấu hình lint/arch/jest, ngưỡng coverage; không `skip`/`only`/`xit`; không sửa test cũ để cho xanh. Test cũ đỏ ngoài dự kiến ⟹ dừng, báo.
5. Mô tả OpenAPI/`@ApiOperation`/DTO không chứa mã QĐ/FR/US (fix này không được chạm OpenAPI; `openapi.json` phải không đổi).
6. Không migration, không đổi Prisma schema, không đổi DTO/contract HTTP, không thêm dependency.
7. Comment code theo giọng sẵn có của file (tiếng Anh, câu đầy đủ); không đưa mã `V-Q14`/`QĐ-*` vào code.

## 7. Báo cáo (≤ 25 dòng)

Skill đã đọc; tên nhánh + commit SHA; diff stat; output tóm tắt từng lệnh kiểm (đỏ-trước của U1/U2 và xanh-sau); link CI run + trạng thái (hoặc "đang chạy"); danh sách `D-n (cần Owner)` nếu có.

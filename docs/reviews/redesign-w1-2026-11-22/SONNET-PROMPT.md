# Prompt dán sẵn cho chat Sonnet — Đợt 1 thiết kế lại

> Dán nguyên khối dưới đây vào một chat Sonnet (model **sonnet**) hoặc Gemini mới **sau khi** Owner đã duyệt SPEC/PLAN.
> Đợt này có **hai làn**: sửa dòng `LÀN:` ngay dưới vạch thành `tech` (Bảo) hoặc `biz` (Owner) trước khi dán. Câu hỏi
> Owner đã chốt (W1-Q1 → W1-Q6, SPEC mục 9), không cần điền gì thêm. Quy trình chung:
> `docs/guides/quy-trinh-code-ai.md`.

---

**LÀN: tech** ← đổi thành `biz` nếu là làn nghiệp vụ

Trả lời bằng **tiếng Việt**. Giữ nguyên tiếng Anh cho tên file, hàm, lệnh, mã lỗi và code.

Bạn là người code của **một làn** (dòng `LÀN:` ở trên) trong đợt 1 thiết kế lại BE SaaS-Sentry (NestJS 11 + Prisma + PostgreSQL, modular monolith). Repo:
`D:\FPT\FALL2026\Code\BE-dev-software-license-management`. Thư mục việc: `docs/reviews/redesign-w1-2026-11-22/`.

## 0. Skill Preflight (bắt buộc, trước mọi việc, và lại sau mỗi lần compact context)

1. Liệt kê skill có sẵn. Đọc đầy đủ `SKILL.md` của: một process skill (`superpowers:executing-plans` hoặc `agent-skills:incremental-implementation`); `superpowers:test-driven-development` (hoặc `agent-skills:test-driven-development`); `superpowers:verification-before-completion`. Không có đúng tên thì dùng skill gần nhất và ghi rõ mapping.
2. Đọc trong repo:
   - `AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/README.md`, `docs/guides/quy-trinh-code-ai.md`;
   - `docs/rules/database-business.md`, `docs/rules/module-structure.md`, `docs/rules/api-contract.md`;
   - `docs/rules/security-jobs.md` (phần job/sweeper); `docs/rules/operational-commands.md` (phần seed); `test/README.md`.
3. Đọc trọn **`SPEC.md`** và **`PLAN.md`** của thư mục việc. Đây là nguồn duy nhất của việc cần làm. Luật nghiệp vụ nằm ở cột "Hành vi đúng" và "Tiêu chí chấp nhận" của SPEC; mã `QĐ-…` chỉ để tra cứu. Mọi câu hỏi Owner đã chốt ở SPEC mục 9 _Đã chốt_: không hỏi lại, không tự đổi.
4. Đọc **`PROGRESS-<làn>.md`** của thư mục việc (chỉ file của làn mình): gói nào xong, sha, gói đang dở, ghi chú. Đây là trí nhớ của bạn qua compact context.
5. Đầu mỗi báo cáo, liệt kê skill/rule đã đọc và mục đích.

## 1. Chuẩn bị nhánh (chỉ lần đầu)

```bash
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management status --short   # phải sạch
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management fetch origin
git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management checkout -b fix/redesign-w1-<làn> origin/dev
```

- `origin/dev` phải chứa thư mục `docs/reviews/redesign-w1-2026-11-22/` (SPEC, PLAN, prompt này, `PROGRESS-tech.md`,
  `PROGRESS-biz.md`). Không có ⟹ **dừng, báo lại**.
- Đã có nhánh `fix/redesign-w1-<làn>` ⟹ `checkout` nó, đối chiếu `git log` với `PROGRESS-<làn>.md`, làm tiếp gói kế.
- Tạo `FIX-TEST-<làn>.md` cùng thư mục với tiêu đề và bảng rỗng `| Gói | File test | Ca | Lý do |`.
- **Chỉ sửa file thuộc gói của làn mình** (danh sách file ở PLAN). Cần sửa file của gói làn kia ⟹ không sửa, ghi vào
  `PROGRESS-<làn>.md` mục bàn giao, báo người điều phối.

## 2. Cách làm từng gói

Thứ tự theo làn (PLAN mục _Hai làn_):

- **tech:** P2 → P3 → P4 → P5 → P6 → P12 → P16 → P18 (phần của làn).
- **biz:** phần A P1 → P11 → P7 → P8 → P13a → P13b → P14 → P17a → P17b. Phần B P9 → P10 → P15a → P15b **chỉ bắt đầu
  khi** người điều phối báo làn `tech` đã merge vào `dev`: lúc đó `git fetch origin && git merge origin/dev` (không
  rebase vì nhánh đã push), chạy lại `pnpm openapi:export`, bộ kiểm nhanh, rồi làm phần B. Cuối cùng P18.

Với mỗi gói:

1. Đọc lại `PROGRESS-<làn>.md`, rồi khối W1-xx của gói trong SPEC. Mở code thật ở các `file:line` được nêu và xác nhận lỗi còn đó. Đã khác ⟹ ghi vào báo cáo gói, làm theo hành vi đúng của SPEC, không tự đổi luật.
2. Ghi gói vào `PROGRESS-<làn>.md` trạng thái `đang làm`.
3. **Viết unit test đỏ trước** cho luật mới. Chạy `pnpm test -- <file>` và xác nhận nó đỏ đúng lý do.
4. Sửa code tối thiểu cho xanh. Theo đúng:
   - tầng module và cửa `public/` (không import file ngoài `public/` của module khác, không query bảng của module khác);
   - hậu tố file;
   - thứ tự khóa ở SPEC mục 4 (tác vụ trước Request; vòng lặp nhiều seat sắp theo (`subscriptionId`, `assignmentId`));
   - `Promise.all` không bao giờ chạy trên `tx`;
   - mọi đọc trong callback `runner.run` đi qua `tx`;
   - trần 500 dòng mỗi file `src`: vượt thì tách file theo chức năng, không suppression (PLAN liệt kê bốn file sát trần).
5. Seed: gói có dòng **seed** trong PLAN thì sửa `src/cli/seed/steps/*` cho đi đúng luật mới và cập nhật spec unit của step. Không nới luật cho seed. Không chạy seed.
6. Viết test http/integration mới mà SPEC yêu cầu. **Không chạy** chúng ở máy (CI chạy). Viết theo mẫu file cùng thư mục; mỗi file ≤ 800 dòng.
7. Test cũ khẳng định hành vi cũ:
   - unit của chính luật (kể cả spec seed step) ⟹ sửa ngay;
   - http/integration/flow ⟹ ghi vào `FIX-TEST-<làn>.md`, không xóa, không `skip`.
8. Chạy **bộ kiểm nhanh**, tất cả phải xanh:

   ```text
   pnpm typecheck
   pnpm lint
   pnpm arch:check
   pnpm rules:check
   pnpm test:gates
   pnpm openapi:export && git diff --stat openapi.json
   pnpm test -- <mọi *.spec.ts đã chạm hoặc thêm>
   ```

   Thêm `pnpm rules:format` khi sửa `docs/rules/*.md`, `src/modules/*/README.md` hoặc file trong danh sách format. Thêm `pnpm prisma:validate` **và** `pnpm prisma:generate` khi sửa `prisma/` (P16). `openapi.json` đổi đúng chủ đích thì commit cùng gói; đổi ngoài chủ đích ⟹ tìm nguyên nhân.

9. **Tự review diff** của gói theo SPEC: đủ tiêu chí chấp nhận, không thừa phạm vi, comment trong `src` nói lý do (không ghi mã finding như `W1-xx`, `O3`, `H-6`, `G-15`), mô tả OpenAPI không chứa `QĐ-`, `FR-`, `US-`, `KHO-`, `SBF-`, `MF-`, `BR-`, `O3`, `W1-` hay mã finding kiểu `H-6`, `G-15`, `G-16`, `D-35` (`SBF-20` có sẵn trong `openapi.json` từ trước: không thêm, không tự xóa).
10. Commit một gói một commit, bằng git identity sẵn có của máy. **Không** thêm `Co-Authored-By` hay dòng attribution. Message: `fix(<module>): <tóm tắt> (redesign W1 P<n>)` + thân liệt kê W1-xx.
11. Cập nhật `PROGRESS-<làn>.md`: trạng thái `xong`, sha, lệnh đã chạy + kết quả thật (số test pass/fail), dòng `FIX-TEST` đã thêm, điểm chưa kiểm được. Commit `PROGRESS-<làn>.md` cùng gói (amend chỉ khi commit đó chưa push).
12. Push nhánh làn sau mỗi vài gói để có bản sao lưu (`git push -u origin fix/redesign-w1-<làn>`). Báo cáo ngắn sau mỗi gói (như dòng `PROGRESS-<làn>.md`). Rồi sang gói kế. Không cần chờ duyệt giữa các gói, trừ khi gặp điều kiện dừng.

## 3. Lưu ý theo gói (bổ sung cho PLAN)

- **P1:**
  - Cổng `licensing.openRevocation` đã cộng lý do vào tác vụ sống và trả `created=false, reasonAdded=true`. Chỉ sửa phía personnel.
  - Lần gọi không tạo/không cộng gì ⟹ ném `NOTHING_TO_REVOKE` **trước khi** trả, để transaction rollback cả `accountLock`.
  - Sắp `selected` theo (`subscriptionId`, `assignmentId`).
- **P2:** thứ tự khóa đã chốt (tác vụ → Request); không đảo đường nào đang có. Ngoại lệ E2 đã kiểm, an toàn. Không sửa `create` của subscription. Test deadlock dùng barrier tường minh, lặp 20 lần.
- **P3:** thêm `tx?` cho `OrganizationReadApi.getHeadedDepartment` và repo của nó. Khi nhận `tx`, `pageHeldOfPlans` đọc `findMany` rồi `count` tuần tự trên `tx` (Read Committed của tx ngoài là chấp nhận được cho lần đọc "lịch sự" này). Không có `tx` thì giữ RepeatableRead cũ. Grep trên **mọi** module, không chỉ `requests/`.
- **P4:** danh sách id thuê bao đọc ngoài tx vẫn được. Seat của từng thuê bao đọc **sau** `lockMonthOf` trong tx của nó. Cặp (CC, năm) có commitment `attachedVersionId === null` mà tx đã khóa ⟹ không đưa vào `thresholds.watch`.
- **P6:** chỉ bắt `TransientDatabaseError` (`src/infrastructure/database/transaction-runner.ts:18`) thành `RETRYABLE`, cả ở nhánh `returnGroup`. _Đã quyết_ = **bước chi gần nhất** của Request có bản ghi quyết của **chính actor** với cùng `decision`; quyết định khác ⟹ `SKIPPED` như cũ.
- **P7:** "số đã lưu" của quyền không ngày kết thúc là `nextYearAmountMinor` ghi lúc duyệt (12 × giá tháng lúc duyệt, `pricing.policy.ts:172-173`); dùng ở **mọi** năm sau năm duyệt. Giá tháng lúc duyệt = `savedMinor ÷ 12`. Số lưu không đúng là 12 tháng ⟹ dừng hỏi.
- **P8:** "không dùng được" = không nằm trong `IdentityAccessApi.findUsableItAdminEmployeeIds([id])`. Phòng chưa có IT phụ trách (`getItAdminInChargeOfDepartment` = null) ⟹ mọi IT đẩy được.
- **P9:** "giảm/tăng" so với `current.purchasedQuantity`. `commitmentTermMonths` và `allowsMidTermReduction` lấy **giá trị đang lưu**, không lấy giá trị gửi cùng PATCH. Lý do ghi vào audit, không thêm cột. Luật version bắt buộc đặt ở policy + lỗi nghiệp vụ, không ở `refine` của DTO.
- **P10:** dùng `SeatBaselinePhaseHook` như `subscription-pool.service.ts:186`.
- **P12:** `timeZone` lấy từ `OrganizationReadApi.getOrganization(tx)`, đọc trong tx đang có. Mapper mặc định `Asia/Ho_Chi_Minh`. Dùng `Intl.DateTimeFormat`, không thêm thư viện.
- **P13a:** sửa `test/support/budget-harness.ts` và seed `budget.steps.ts` để gửi phiên bản sau hạn nộp. Spec còn hỏng ghi FIX-TEST.
- **P13b:** giữ `costCenterId` trong danh sách khóa của `BUDGET_NEXT_YEAR_MISSING` (dòng cũ còn đọc); dòng mới `subject: null`.
- **P15a:** khóa tác vụ thu hồi **trước** `claimForGrant`; khóa nó ở `endReplacedRight` (sau subscription) là deadlock mới — không làm. Còn lý do khác ngoài `TRANSFER`, hoặc tác vụ `IN_PROGRESS`/`FAILED`/`COMPLETED` ⟹ giữ 422 kèm `details`.
- **P15b:** personnel không đọc `provisioning_tasks`; thêm phương thức facade ở `licensing/public/`. Route mới chỉ `IT_ADMIN`. Không thêm cạnh capability mới trong `personnel` (kiểm `pnpm arch:capabilities --module personnel`).
- **P16:**
  - Tên migration `YYYYMMDDHHMMSS_purchase_invoice_number_normalized`, lớn hơn `20261119090000`, giờ hợp lệ.
  - Thứ tự trong file: kiểm trùng (`RAISE EXCEPTION`) → tạo index mới → bỏ index cũ.
  - Biểu thức khóa so: `lower(regexp_replace(number, '[[:space:]]', '', 'g'))` ở **cả** migration lẫn `$queryRaw`. Không dùng `\s`.
  - Không sửa migration đã merge, không sửa `prisma/models`, không chạy migration ở máy. Câu `SELECT` của SPEC W1-27 vào commit message.
- **P17a/P17b:** trước khi code, liệt kê mọi trạng thái Request trả phí còn mở trong code và ánh xạ sang (a)–(i) của SPEC W1-17, ghi vào `PROGRESS-<làn>.md`. Dùng lại `REQUESTER_IS_HEAD`, `endNeedStepNotRequired`, `finishConversion`; không thêm giá trị `oneStepReason`, không migration. Request nhóm không đổi code (chỉ test lối ra). Trạng thái không có trong bảng ⟹ dừng hỏi.

## 4. Điều kiện DỪNG và hỏi (không tự quyết)

Dừng ngay, ghi vào `PROGRESS-<làn>.md`, báo lại cho người điều phối kèm `file:line`, 2–3 lựa chọn và khuyến nghị, khi:

1. Luật không rõ, hai nguồn (SPEC ↔ code ↔ comment) mâu thuẫn, hoặc code thật khác SPEC mà khác biệt đó đổi hành vi nghiệp vụ.
2. Cần migration **phá dữ liệu** hoặc không hoàn tác được (`ALTER TYPE … ADD VALUE`, xóa cột/bảng có dữ liệu), cần migration ngoài P16, cần sửa `prisma/models`, hoặc cần sửa migration đã merge.
3. Cần cạnh module mới, cạnh capability mới, extension point mới, đổi tầng, hoặc thêm dependency npm.
4. Một gate (`arch:check`, `test:gates`, `rules:check`, lint complexity/max-lines) chỉ xanh được bằng cách nới gate, thêm suppression hay mục registry mới.
5. Một đường khóa thật trong code khác bảng SPEC mục 4 (một chỗ khóa Request rồi mới khóa tác vụ, hoặc vòng lặp nhiều seat không sắp được theo (`subscriptionId`, `assignmentId`)).
6. `origin/dev` thiếu thư mục việc, cây làm việc có thay đổi lạ không phải của bạn, hoặc gói cần sửa file của làn kia.

## 5. Không được làm

- Không chạy `pnpm test:http`, `pnpm test:integration`, `pnpm test:e2e` full, seed, Docker hay migration trên DB. Không cần DB ở máy.
- Chỉ push **nhánh làn của mình**. Không merge `dev`/`main`, không mở PR thay Owner, không deploy. CI GitHub chỉ chạy tay trên nhánh làn của mình theo mục 6.
- Không sửa `openapi.json`, `docs/generated/*`, `src/generated/*` bằng tay; chỉ qua generator.
- Không xóa hoặc `skip` test cũ. Không thêm `eslint-disable`, không thêm mục vào `eslint-suppressions.json`.
- Không mở rộng phạm vi sang các việc ở SPEC §2.2 (ngoài phạm vi), kể cả khi thấy lỗi gần đó. Ghi chúng vào báo cáo cuối.
- Không tự ghi là đã được Owner duyệt hay nghiệm thu.

## 6. Sau P18: CI GitHub đầy đủ rồi báo cáo

1. `git push -u origin fix/redesign-w1-<làn>` rồi `gh workflow run ci.yml --ref fix/redesign-w1-<làn>` (chạy tay = bộ
   đầy đủ: quality, http, toàn bộ integration, timing, serial, e2e-smoke). Không chạy được `gh` ⟹ báo người điều phối
   để chạy ở GitHub → Actions → CI → Run workflow.
2. Theo dõi: `gh run list --workflow ci.yml --branch fix/redesign-w1-<làn>`, `gh run view <id> --log-failed`.
3. Job đỏ:
   - do **logic** (500, sai tiền/quyền/luồng, test của luật mới) ⟹ sửa, kiểm nhanh, commit, push, chạy lại job đó;
   - do **nợ test** (test cũ khẳng định hành vi cũ, harness, seed) ⟹ ghi `FIX-TEST-<làn>.md`, không sửa lúc này.
4. Ghi mỗi lần chạy vào bảng _CI GitHub_ của `PROGRESS-<làn>.md` (commit, link run, kết quả từng job).
5. Báo cáo cuối (≤ 60 dòng): skill đã đọc; bảng gói → sha → W1-xx → lệnh kiểm + kết quả; kết quả CI từng job (link
   run); đổi contract của làn (đối chiếu SPEC mục 5); số dòng `FIX-TEST-<làn>.md`; câu `SELECT` kiểm trùng số hóa đơn
   (làn tech, P16); điểm chưa kiểm chứng; việc thấy ngoài phạm vi; mục bàn giao cho làn kia.

Sau đó **dừng**, chờ Opus review. Sửa finding của review xong ⟹ chạy lại CI như bước 1–4 (lần 2, bắt buộc sau commit
cuối) rồi báo lại. Không mở PR, không merge.

# Quy trình code theo spec với AI (nhóm 2 người)

Áp dụng cho mọi đợt code theo spec/plan, từ đợt thiết kế lại 22/11/2026 trở đi. Bổ sung cho
[CONTRIBUTING](../../CONTRIBUTING.md); không thay quy ước kỹ thuật ở [docs/rules](../rules/README.md).

## Vai trò

| Ai / model      | Việc                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Owner           | Duyệt spec/plan và câu hỏi nghiệp vụ; code phần **nghiệp vụ** (tiền, quyền, luồng, trạng thái); merge `dev`/`main`, deploy  |
| Bảo             | Code phần **kỹ thuật, ít nghiệp vụ** (transaction, hạ tầng, tách route, cấu hình, seed, việc cỡ S); hỏi Owner khi chạm luật |
| Opus            | Mặc định cho mọi việc không phải code: viết spec/plan/prompt, phản biện spec, review/audit/verify code                      |
| Fable           | Chỉ khi logic/nghiệp vụ **cực nặng và thật quan trọng** (tiền, ngân sách, luật mới); Owner quyết khi nào dùng               |
| Sonnet / Gemini | Code theo plan                                                                                                              |

Spec, plan, prompt và tiến độ của một đợt nằm ở `docs/reviews/<đợt>/` (`SPEC.md`, `PLAN.md`, `SONNET-PROMPT.md`,
`PROGRESS.md`).

`docs/workspace/items/` và `docs/roadmap.md` là quy trình chia lát theo Story/G cũ (tới 17/11/2026), chỉ đọc để tra lịch sử;
không tạo item mới ở đó. Bàn giao giữa các chat điều phối nằm ở `docs/reviews/coordinator-<ngày>/HANDOFF-CHAT.md`.

## Nhánh và làn

- Mỗi đợt có thể chia **hai làn**: làn nghiệp vụ (Owner) và làn kỹ thuật (Bảo), mỗi làn **một nhánh**
  `<loại>/<đợt>-<làn>` (ví dụ `fix/redesign-w1-biz`, `fix/redesign-w1-tech`), tách từ `dev` mới nhất.
- Hai làn **không sửa chung file**. Gói nào đụng file của làn kia thì chuyển về làn nghiệp vụ. PLAN ghi rõ gói thuộc làn
  nào.
- Mỗi đợt có một **nhánh gộp** `int/<đợt>` (Owner tạo từ `dev`). Hai làn merge vào nhánh gộp, **không** vào `dev`
  trực tiếp; `dev` chỉ nhận code đã review. Push nhánh feature thoải mái. Merge vào nhánh gộp, `dev`, `main` và deploy
  chỉ Owner.
- Trong một làn, AI làm **tuần tự từng gói**, không chạy song song, không worktree.

## Vòng đời một đợt

1. **Spec** — Opus viết SPEC/PLAN/prompt; một Opus khác (ngữ cảnh mới) phản biện, mở lại mọi file:line; Owner trả lời
   câu hỏi; Owner duyệt. Làn kỹ thuật của Bảo cũng có SPEC/PLAN riêng và qua đúng các bước này, **không** dùng Fable. Chỉ
   gọi Fable phản biện khi SPEC chứa luật tiền/ngân sách/quyền cực nặng.
2. **Code từng gói** — với mỗi gói trong PLAN: code → AI tự đọc lại diff theo SPEC → **kiểm nhanh trên máy** (dưới đây)
   → commit → ghi một dòng vào `PROGRESS.md` (gói, commit, lệnh đã chạy, nợ test).
3. **Hết gói của làn** — push nhánh làn, chạy **CI đầy đủ trên GitHub** (dưới đây). Đọc log, sửa, chạy lại job đỏ. Làn
   nào xong trước thì Owner merge làn đó vào `int/<đợt>` trước; làn kia cần code của nó (ví dụ phần B của làn `biz`) thì
   `git merge origin/int/<đợt>` vào nhánh làn rồi làm tiếp.
4. **Owner gộp hai làn** vào `int/<đợt>`, giải xung đột (`openapi.json` sinh lại bằng `pnpm openapi:export`, manifest
   gộp tay), chạy CI đầy đủ trên nhánh gộp.
5. **Review + audit trên nhánh gộp** — Opus đọc toàn bộ diff `dev...int/<đợt>` theo SPEC/BRD/QĐ và **tự đọc phần rủi ro**:
   migration, raw SQL, phân quyền, tiền, mọi test/gate mà AI đã sửa (code Gemini luôn qua bước này). Kèm **merge audit**:
   file cả hai làn cùng đụng, tương tác giữa hai làn, migration chạy trên DB rỗng và không drift (CI job `quality` kiểm).
   Finding ghi `docs/reviews/<đợt>/REVIEW.md`, gắn làn chịu trách nhiệm.
6. **Sửa finding** — mỗi làn sửa finding của mình trên nhánh làn (hoặc thẳng trên nhánh gộp nếu finding nằm ở chỗ gộp),
   kiểm nhanh, commit, push; Owner merge lại vào nhánh gộp.
7. **CI GitHub lần 2 trên nhánh gộp** — bắt buộc sau commit cuối.
   - Đỏ do **logic** ⟹ sửa, chạy lại đúng job đó.
   - Đỏ do **nợ test** (test cũ, harness, seed — không có 500, không sai tiền/luồng) ⟹ ghi `FIX-TEST-<làn>.md`, không mở
     vòng review mới; sửa gộp một lần ở cuối đợt.
8. **PR `int/<đợt>` → `dev`** — mô tả: hành vi đổi, operation đổi contract, migration, link run CI, phần chưa kiểm. Owner
   merge.
9. **API description của đợt** — Opus viết mô tả API đổi/mới của đợt (theo màn × kiểu cấp, ví dụ request/response, lỗi)
   vào `Docs/Figma UI-UX/API-Integration/`, đối chiếu `openapi.json` trên `dev`. Giao FE/Mobile code **ngay theo đợt**,
   không chờ hết mọi đợt.

## Kiểm nhanh trên máy (máy yếu)

Chạy tại gốc BE, theo thứ tự; đỏ bước nào sửa rồi chạy lại đúng bước đó:

1. `pnpm typecheck`
2. `pnpm lint` (chỉ file đã sửa nếu chậm: `pnpm exec eslint <file…>`)
3. `pnpm arch:check`
4. `pnpm rules:check`
5. `pnpm test:gates`
6. `pnpm openapi:export` rồi `git diff --stat openapi.json` — không drift ngoài ý muốn; API đổi có chủ đích thì commit
   `openapi.json` cùng gói
7. Unit test **theo file đã sửa**: `pnpm jest <path>`

**Không** chạy trên máy: `pnpm check`, `pnpm test:http`, `pnpm test:integration`, `test:e2e`, Docker, seed. Các phần đó
chạy trên GitHub.

## CI đầy đủ trên GitHub

- Chạy tay trên nhánh để có **bộ đầy đủ** (toàn bộ integration, timing, serial, e2e-smoke):
  `gh workflow run ci.yml --ref <nhánh>`, hoặc GitHub → **Actions** → **CI** → **Run workflow** → chọn nhánh.
- Xem kết quả: `gh run list --workflow ci.yml --branch <nhánh>`, `gh run view <id> --log-failed`.
- Run của PR vào `dev` chỉ chạy module bị ảnh hưởng — **không** thay được lần chạy tay ở bước 3 và 6.
- Ghi link run và kết quả từng job vào `PROGRESS.md`.

## Commit và báo cáo

- Commit bằng git identity của chính người làm; **không** co-author hay dòng attribution của AI. Message theo dạng
  `fix(<module>): …`, `feat(<module>): …`.
- Mô tả OpenAPI (summary, description, ví dụ) **không** chứa mã nội bộ như `QĐ-`, `FR-`, `US-`.
- Báo cáo cuối gói/đợt ghi lệnh đã chạy, kết quả, và câu "Full test chỉ chạy trên CI GitHub"; không tuyên bố xanh khi
  chưa có run CI sau commit cuối.
- Gặp chỗ luật không rõ, cần migration phá dữ liệu, hoặc phải đổi file của làn kia ⟹ **dừng gói đó, hỏi Owner**, làm
  tiếp gói độc lập.

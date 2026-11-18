# Prompt 4a, 4b, 5 — bản nháp cho Owner duyệt (chat điều phối 122, 16/11/2026)

Chung cho mọi prompt: trả lời tiếng Việt; Skill Preflight theo `D:\FPT\FALL2026\CLAUDE.md`; repo BE một thư mục `D:\FPT\FALL2026\Code\BE-dev-software-license-management`, nhánh `feat/fe-feedback` (sau prompt 3); DB test riêng bằng `make-test-db.sh` (scratchpad chat 122) hoặc `.github/actions/test-database`; full CI ưu tiên GitHub (`gh workflow run ci.yml --ref <nhánh>`, chạy mọi suite, không deploy) + local `pnpm test:flows`, `pnpm seed:local` từ DB trống; commit đứng tên git của Owner, không thêm dòng đồng tác giả AI; không push `dev`/`main`, không merge, không deploy.

---

## Prompt 4a — Audit toàn bộ (model Fable, chỉ đọc)

```text
PROMPT 4a — AUDIT. Bạn là chat audit (Fable). Chỉ đọc code, không sửa sản phẩm.

Đối tượng: BẢN CODE CUỐI của nhánh feat/fe-feedback (commit mới nhất) — KHÔNG review từng commit.
Nguồn luật (thứ tự): sổ quyết định Docs/Decisions/project-decisions.md (QĐ mới nhất tới QĐ-112) → BRD 4.13 (§4 vai/SoD,
§5.10 năm main flow + luồng hỗ trợ, §5.10.1 BR-MFn-xx, §5.12 bất biến/máy trạng thái) → Docs/Requiments/Quy trình và chính
sách theo main flow.md → ba SPEC trong BE docs/reviews/ (be-bugfix-2026-11-12, mf2-mf3-2026-11-10 v2.3, fe-feedback-2026-11-11 v2.1)
→ OWNER-REVIEW/DECISIONS → ADR/kiến trúc BE (AGENTS.md, ARCHITECTURE.md, docs/rules).

Đầu vào đã có (đọc trước, không làm lại): đầu OVERNIGHT-DECISIONS.md của fe-feedback (bảng Chờ Owner + 20 dòng lệch BRD/nghi lỗi
BE, mức Cao: SBF-20 điều chỉnh thuê bao còn bước trưởng phòng và kho K2/K4 không có route điều chỉnh; duyệt chi 500 thay 409;
thông báo thiếu ở MF-1/SBF-09/SBF-07a; QĐ-111ax IT đọc ngoài phòng; SBF-08 không có import danh sách tài khoản nhà cung cấp),
D:\FPT\FALL2026\Code\verify-logs\apidocs\REPORT-A1..A6.md, REVIEW-R1/R2.md, GENERIC-ERRORS.md, Z2-NOTES.md (NL-1, D-Z2-n).

Làm (song song nhiều agent con được, chia theo vùng không chồng nhau):
1. Vòng 1 — ba SPEC: mỗi điều kiện xong (S/D) của từng SPEC có code + test đúng chưa; chỗ lệch SPEC.
2. Vòng 2 — toàn bộ 5 MF và luồng hỗ trợ đã làm, đi theo BRD §5.10 từng bước: logic, nghiệp vụ, BR theo QĐ mới nhất, SoD/phân
   quyền/phạm vi dữ liệu, máy trạng thái, tiền/ngân sách (kiểm ngân sách, cam kết, seat-tháng, K2 vào dòng kho), ngày (ân hạn, mốc
   chặn, hạn, ngày làm việc), thông báo (ai nhận), migration/SQL/trigger, kiến trúc (module, tầng, facade, arch tests).
3. Xác minh lại từng dòng "nghi lỗi BE" và "lệch BRD" đã có: CONFIRMED / KHÔNG PHẢI LỖI (kèm file:dòng).
4. Ghi danh sách lỗi thông báo chung chung/thiếu details mới thấy (bổ sung GENERIC-ERRORS.md) — đầu vào prompt 5.
5. Full CI một lần (GitHub + flows + seed:local DB trống), bảng job → kết quả thật → commit.
Đầu ra: docs/reviews/<thư mục prompt 4>/AUDIT-4A.md: danh sách FIX (mã · mức Critical/Required/Optional · file:dòng · luật vi
phạm · kỳ vọng · đề xuất sửa · test cần có), mục "Cần Owner quyết" (A/B + khuyến nghị) chép lên đầu OVERNIGHT-DECISIONS.md.
Không sửa code. DỪNG khi xong, chờ Owner duyệt danh sách FIX.
```

## Prompt 4b — Sửa theo danh sách FIX (model Sonnet, chat mới)

```text
PROMPT 4b — FIX. Bạn là chat code (Sonnet). Đọc AUDIT-4A.md và các quyết định Owner đã chốt ở đầu OVERNIGHT-DECISIONS.md.
1. Sửa theo danh sách FIX của 4a (Critical → Required → Optional được duyệt): mỗi FIX một commit, test đỏ trước rồi xanh, mutation
   ở chỗ chính; không tự chốt điều trái QĐ — điểm chưa có nguồn ghi D-n vào OVERNIGHT-DECISIONS.md.
2. Sửa mọi test đỏ còn lại; seed/flows cập nhật theo code mới (mọi DEMO-1…15 giữ được).
3. Gọi API thật trên DB đã seed theo DEMO-1…15 và kịch bản MF-1…MF-5 (đúng vai), ghi bằng chứng.
4. Full CI tới khi xanh (GitHub + test:flows + seed:local DB trống); openapi:export; tài liệu API FE sinh lại (Docs API-Integration,
   tools/build-api-docs.mjs, --check 0 vấn đề), changelog thay đổi FE.
5. Viết HANDOFF-REVIEW.md: thay đổi theo FIX, commit range, kết quả mọi lệnh, lệch còn lại, "Cần Owner". DỪNG — chat Fable verify.
```

Sau 4b: Fable verify (đọc commit FIX so với finding, chạy test chạm + module + http toàn bộ, mutation) ⟹ FIX lại nếu cần.

## Prompt 5 — Thông điệp, lỗi, email đăng nhập (model Sonnet; review Fable)

```text
PROMPT 5 — MESSAGES & ERRORS. Quyết định Owner 16/11:
(a) Thông báo in-app: BE trả thêm `title` và `message` đã ghép theo header Accept-Language (vi mặc định, en) — đọc ở MỘT interceptor
    dùng chung, chỉ áp cho API thông báo; giữ `code`, `params`, `subject`; thêm `target` (màn FE mở khi bấm). Câu ghép LÚC ĐỌC từ
    code + params (không lưu chữ vào DB). Mẫu câu lấy từ Docs/Figma UI-UX/API-Integration/catalog/notifications.md (118 mã).
    Test: mã nào cũng đủ vi + en; mọi biến trong câu có trong params; bổ sung params còn thiếu (GENERIC-ERRORS.md mục thông báo).
(b) Lỗi API: `message` GIỮ tiếng Anh. Làm mã cụ thể + `details` có cấu trúc theo GENERIC-ERRORS.md và mục prompt 5 của AUDIT-4A:
    tách mã gộp nhiều luật, thêm id/lý do/giá trị vào details, VALIDATION_ERROR.details.issues có min/max và field thừa, MONEY_* nói
    ô nào, thống nhất status cùng luật (SELF_CHANGE_FORBIDDEN, TERM_*), gộp 3 mã 503, 429 có retryAfter trong details; OpenAPI khai
    đủ mã thật (các mã code ném mà chưa khai). FE hiện tiếng Việt từ code + details theo catalog/errors.md.
(c) loginEmail = workEmail (option A): tạo tài khoản luôn lấy loginEmail = workEmail, bỏ ô loginEmail riêng ở API tạo; đổi email
    đăng nhập vẫn là luồng bảo mật riêng. Ghi QĐ mới (Owner duyệt câu chữ) + BRD FR-8.6.
(d) Dọn: tham số chết BUDGET_ZBB_* ; mô tả OpenAPI cũ trái code (danh sách trong REPORT-A1..A5).
Sau đó: full CI xanh, tài liệu API FE sinh lại + cập nhật catalog (thông báo có title/message; lỗi mới), changelog FE. Review Fable.
```

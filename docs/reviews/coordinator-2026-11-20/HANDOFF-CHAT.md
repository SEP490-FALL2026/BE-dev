# HANDOFF — chat điều phối 19–20/11/2026 → chat điều phối mới

> Đọc file này trước. Nguồn lịch sử: [HANDOFF-CHAT.md](../qd113-2026-11-18/HANDOFF-CHAT.md) và [HANDOFF-CHAT-2.md](../qd113-2026-11-18/HANDOFF-CHAT-2.md)
> (bản ở BE-WDP `docs/reviews/qd113-2026-11-18/`, bản sao untracked ở repo này), memory `MEMORY.md` (đặc biệt
> `project_qd113_2026_11_18.md`, `project_qd113_2026_11_19.md`, `project_prompt3_finish_decisions_2026_11_16.md`, mọi `feedback_*`),
> file duyệt `D:\FPT\FALL2026\NOTE MD\QD-cho-duyet-truoc-prompt4.md` (Phần 2 chờ duyệt + Phần 4 kết quả và backlog sau demo).

## 0. Thay đổi lớn (Owner 20/11)

**WDP đã xong.** Từ nay **chỉ tập trung đồ án SEP**: repo `D:\FPT\FALL2026\Code\BE-dev-software-license-management`
(origin `SEP490-FALL2026/BE-dev`), FE `Code/FE-web`, Docs `D:\FPT\FALL2026\Docs`. BE-WDP (`Code/BE-WDP`) không làm tiếp; không cần chép
qua lại nữa (trước đây làm WDP trước rồi chép sang SEP).

## 1. Trạng thái đã kiểm (git, 20/11)

| Repo | Trạng thái |
| --- | --- |
| **SEP BE** `origin/dev` | `80c78f59` (PR #61 `feat/seed-ai-reasons` đã merge). `origin/main` `00a1f2bd` (PR #58). Có `QĐ-113a…g` (PR #60) |
| **SEP BE nhánh chưa merge** (đã push, **chưa chạy CI** theo Owner "đồ án: chép rồi push, không CI") | `feat/grant-account-email` `60aae04b` · `feat/login-email-follows-work-email` `a3149132` · `feat/login-email-change-mail` `6c7feb59` (**dựng trên** `login-email-follows-work-email`) · `feat/notify-it-ready-to-grant` `2a343618` · `feat/system-department-out-of-it-scope` `ed575b78` (có **migration** `20261119090000_department_starting`) |
| SEP checkout máy | đang ở `feat/system-department-out-of-it-scope`; 2 file untracked `docs/reviews/qd113-2026-11-18/HANDOFF-CHAT*.md` (bản sao, giữ) |
| **WDP** (xong) | `main` `f3bab4ff` chứa cả 4 nhánh trên + seed lý do Request; đã deploy VPS `wdp.novaproj.site`. Worktree thừa: `Code/BE-WDP-wt/sysdept` (xóa được) |
| **Docs** `main` | `afc31f9`, **đã push** (đồng bộ origin) |
| FE-web | `main` `b02bf31f` (đọc, không sửa) |

Code của 5 nhánh SEP **giống hệt** bản WDP đã xanh CI đủ bộ (WDP run 44393548227, 44420183531, 44422647698, 44423752779). Khi merge
vào SEP `dev` nên chạy CI SEP một lần cho cả lô nếu Owner cho (Owner 19/11: đồ án không cần CI — hỏi lại trước khi chạy).

**Thứ tự merge đề xuất vào SEP `dev`:** `grant-account-email` → `login-email-follows-work-email` → `login-email-change-mail` →
`notify-it-ready-to-grant` → `system-department-out-of-it-scope` (migration cuối; kiểm `SELECT code FROM departments WHERE is_starting`
sau migrate phải là phòng bootstrap `ADMIN`). Xung đột có thể ở `openapi.json`, `docs/generated/module-graph.md` ⟹ sinh lại
(`pnpm openapi:export`, `pnpm arch:graph`), không sửa tay.

## 2. Đã làm trong chat này (19–20/11)

| Việc | Kết quả | Nơi |
| --- | --- | --- |
| Test AI thật (Modal Qwen3.5-4B) | BE gọi model thật OK; luật chặn số/URL, 403/404/409 đúng | — |
| Seed lý do Request thật | 50 kịch bản có `reason`; 2 ca nhiễu R31/R54 để demo AI lọc | SEP PR #61 (merged) |
| IT Admin thấy email người nhận khi cấp | `beneficiary.workEmail` ở `grant-queue`, `provisioning-tasks`; `accountIdentifier` rỗng ⟹ email công ty | `feat/grant-account-email` |
| Email đăng nhập đi theo email công ty (Owner chọn **A**) + **chặn xóa** email công ty khi có tài khoản (`WORK_EMAIL_REQUIRED_FOR_ACCOUNT`) | qua hook `EmployeeAccountsHook.followWorkEmail`, audit `APP_USER.LOGIN_EMAIL_CHANGED` | `feat/login-email-follows-work-email` |
| Email báo đổi email đăng nhập tới địa chỉ cũ + mới | template `LOGIN_EMAIL_CHANGED_NOTICE` qua outbox | `feat/login-email-change-mail` |
| Thông báo IT Admin khi Request chờ cấp | mã `REQUEST_READY_FOR_GRANT` (IT phụ trách phòng; không có ⟹ mọi IT dùng được); sau SPEND_APPROVED và K5 NEED_APPROVED | `feat/notify-it-ready-to-grant` |
| Phòng khởi đầu `ADMIN` ra khỏi phạm vi xử lý thay của IT (Owner chọn **A**) | cột `departments.is_starting`, `GET /departments` của IT không trả phòng này; FE không sửa | `feat/system-department-out-of-it-scope` |
| Tài liệu FE (Docs, đã push) | `flows/provisioning-grant.md` (cấp phát từng bước), `flows/subscription-and-stock.md` (thuê bao + kho), `flows/revocation.md` (thu hồi, câu chữ đề xuất), `flows/ghost-seat-thresholds.md` (ngưỡng 30/60/90), `changes/2026-11-19-grant-account-email.md`; sửa chú thích sai theo `QĐ-113d` | `Docs/Figma UI-UX/API-Integration/` |
| Research mở rộng MF-2/MF-3 (Opus) | 414 dòng, 30 nguồn; 5 khuyến nghị (checklist chính sách, giỏ xin lại MF-3, bàn giao dữ liệu nhẹ, nối thu hồi→tiền/bằng chứng, Joiner gọn) | `Docs/Research-AI/mo-rong-nghiep-vu-MF2-MF3-2026-11-19.md` |

**Lỗi FE đã chỉ ra (FE tự sửa):** `notice-action-form.tsx` khi ghi nghỉ việc từ BM-09 thiếu `accessBlockMode` và gửi
`pendingTransferCancellation` (BE chỉ có `cancelPendingTransfer: true`); nhãn i18n `ACCOUNT_REMOVED`/`ALREADY_GONE` dễ hiểu ngược (đề xuất
ở `flows/revocation.md` mục 5); `task.plan = null` mặc định `ACCOUNT_REMOVED`; hóa đơn K1 nên ẩn ô `quantity` và gửi 1.

## 3. Việc còn lại (theo thứ tự đề xuất)

1. **Merge 5 nhánh SEP** vào `dev` (thứ tự ở §1) khi Owner bảo; rồi `dev → main` theo quy trình đồ án (Owner quyết deploy).
2. **Duyệt QĐ** theo `NOTE MD/QD-cho-duyet-truoc-prompt4.md` Phần 2 (đã duyệt: 2.1 = 12 mục ⟹ `QĐ-114`; Prompt 6 đặt ngay sau duyệt QĐ).
   Tiếp: 2.4 Prompt 3 (10 ĐỔI, FIX-PL2-Q3, B3A-03, 42 Giữ) → 2.3 Prompt 2 → 2.5 Prompt 5 → câu mở K1 (`QĐ-113f`) → 2.7. Hỏi từng câu
   bằng AskUserQuestion có khuyến nghị. **Bổ sung vào `QĐ-114`** các quyết định đã chốt trong chat này: email đăng nhập đi theo email
   công ty + chặn xóa + email thông báo; IT Admin thấy `workEmail` người nhận (`QĐ-87b`); `accountIdentifier` rỗng = email công ty;
   phòng khởi đầu ngoài phạm vi xử lý thay (ngoại lệ `QĐ-58b`); thông báo IT `REQUEST_READY_FOR_GRANT`. Ghi sổ + BRD, chạy skill
   `docs-sync-check`.
3. **Prompt 6** — rà toàn bộ nghiệp vụ 5 MF + SBF (read-only, ra danh sách lệch + câu hỏi) ⟹ duyệt QĐ phát sinh (`QĐ-115…`).
4. **Sửa code** theo QĐ-114/115 (Sonnet code, Opus review, CI) → **đồng bộ tài liệu** theo QĐ-113+114 (US, Use Case, ERD, SM, sơ đồ
   MF/SBF, Quy trình, Định nghĩa phạm vi, API docs) → **code nốt luồng phụ** → **Prompt 4** (4a audit read-only, 4b FIX + DEMO + CI).
5. **Backlog sau demo** (chi tiết ở Phần 4 file duyệt):
   - Tách nghiệp vụ **hóa đơn** theo loại (K1 tháng / mua thêm K2 / K4 / gia hạn thuê bao): field dễ nhầm, `quantity` K1 = 1, nhóm mua
     một phần, thông báo kỳ K1 chưa có hóa đơn, chi tiết hóa đơn cho Finance thiếu tên gói/người/phòng/số kỳ vọng.
   - Làm rõ "Chưa phân bổ — kho dùng chung" (= tiền ghế Trống, trả bằng *Dự phòng kho dùng chung*); thêm field chênh lệch
     `invoiced − paid`, `plan` ở `poolLines` của `seat-month-charges`.
   - **Seed dày hơn**: usage nhà cung cấp nhiều ngày bằng cột `activeDates`; thêm máy/collector cho nhiều nhân viên; usage AI không seed
     lùi được qua API (`OUTSIDE_WINDOW` trước ngày xác nhận) — Owner chọn cách.
   - **Bằng chứng thu hồi dạng file**: cách 2 = thêm purpose cho API `/documents` + `documentIds` ở body Hoàn tất (~45–60 phút), chờ Owner.
   - Lệch code↔BRD phát hiện: "một gói một thuê bao" không chặn K1; mọi IT Admin ghi kết quả gia hạn; danh sách admin nhà cung cấp lưu ở
     gói; "hết hạn ⟹ quyền tạm ngưng" chưa thấy; đóng hồ sơ nghỉ việc BE đòi 1a+1b+lượt quét; ghế có tác vụ thu hồi nguồn khác khi nghỉ
     việc không nhận lý do DEPARTURE (có thể sót bước khóa hộp thư K1); danh sách tác vụ không lọc theo loại; Finance/Người duyệt chi
     nghỉ mà chưa gán vai ⟹ không ai làm bước của họ.
   - Mở rộng MF-2/MF-3 theo báo cáo research (Owner chọn đề xuất).
6. Dọn: `git worktree remove ../BE-WDP-wt/sysdept` (repo BE-WDP) khi Owner đồng ý; tiến trình `node dist/main.js` local (cổng 4000) có thể
   còn chạy.

## 4. Quy ước (Owner)

- Trả lời **tiếng Việt**; **Skill Preflight** đầu mỗi prompt (liệt kê skill đã đọc).
- Code = **subagent Sonnet** (`model: sonnet`); review/verify = Opus (chat điều phối). Brief subagent: tự chứa, có stop clause, không
  build/seed/DB/Docker, không chạy http/integration/e2e (CI GitHub chạy), commit identity sẵn có (Chill), **không co-author**, không push.
- Máy chỉ chạy bộ kiểm nhanh (typecheck, lint, arch, graph/routes check, rules, gates, jest theo thư mục, openapi export). CI:
  `gh workflow run ci.yml --ref <nhánh>`. Đồ án (SEP): Owner 19/11 nói không cần CI cho bản chép — từ nay SEP là chính, **hỏi Owner** có
  chạy CI không.
- Được push **nhánh feature**. Merge `dev`/`main`, deploy: chỉ khi Owner bảo **trong chính tin nhắn đó** (bộ lọc auto mode chặn
  `gh pr merge`, `git push origin main` nếu Owner không vừa yêu cầu).
- Docs: commit thẳng `main`; push khi Owner bảo (thường Owner tự push: `git -C D:\FPT\FALL2026\Docs push origin main`).
- Quyết định nghiệp vụ mới ⟹ hỏi Owner từng câu, ghi sổ QĐ khi Owner đồng ý; không ghi là xác nhận của GVHD.
- Mô tả OpenAPI không chứa mã nội bộ (`QĐ-`, `FR-`, `US-`) — test `openapi-presentation.http-spec.ts` chặn. Đổi DTO phòng ban/collection
  phải cập nhật `test/support/api-collection-registry-exceptions.ts` và các test ghim key.
- Tài liệu API FE: sinh bằng `node tools/build-api-docs.mjs --be <checkout sạch>` rồi `--check`; phần viết tay ở `flows/`, `roles/`,
  `changes/`, chú thích ở `tools/annotations/`, nghĩa field ở `tools/glossary/fields.json`.

## 5. Ghi chú kỹ thuật hữu ích

- Seed local: `pnpm seed:local -- --confirm-reset software_license_management` (dừng API trước), rồi `--continue` ⟹ exit 2. VPS:
  `seed.sh --app-dir … --config … --confirm-reset <POSTGRES_DB>` (chép `scripts/ops/seed.sh` đúng commit deploy). Usage AI chỉ có ngày
  seed; `--continue` ngày sau thêm một ngày.
- Đăng nhập demo: mật khẩu ở `.env.seed.local` (`SEED_DEMO_ACCOUNT_PASSWORD`); IT Admin ENG/ITO = `quan.ly@saoviet.example`; trưởng phòng
  DES = NV-DESH; Người duyệt chi `an.nguyen@saoviet.example`.
- Cấp phát chỉ nhận email thuộc tên miền công ty (suy từ email công ty mọi nhân viên; gmail/yahoo… luôn bị chặn); `@fpt.edu.vn` dùng được.
  Tài khoản mới tạo qua API phải nhận email mời mới kích hoạt (không có route đặt mật khẩu hộ).
- Ngưỡng ghost seat: `MONITOR` 30–59 (chỉ IT), `REVIEW` 60–89, `ACTION` ≥ 90 hoặc G3 (trưởng phòng quyết qua `GET /ghost-seat-queue`,
  `POST /ghost-seat-decisions`).

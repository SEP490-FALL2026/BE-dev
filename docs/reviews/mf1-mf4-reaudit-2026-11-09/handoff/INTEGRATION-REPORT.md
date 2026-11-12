# INTEGRATION-REPORT — gộp 6 nhánh MF-1/MF-4/MF-5 vào `fix/review-mf145` và chạy full test một lượt

- Worktree `D:\FPT\FALL2026\Code\be-review`, nhánh `fix/review-mf145`, gốc `e962019e`, HEAD cuối `379dc011`. Không push, không merge `dev`,
  không deploy, chỉ dùng DB tạm của test (role `app`, CREATEDB, PostgreSQL 17.7 native).
- Thời gian: 01:05 → 03:35 (10/11/2026), trong timebox 4 giờ.
- Skill đã đọc/dùng: `git-workflow-and-versioning` (process: merge từng nhánh một commit, commit theo nhóm sửa),
  `superpowers:systematic-debugging` (domain: tìm gốc lỗi trước khi sửa, phân loại lỗi), `superpowers:verification-before-completion`
  (verification: mọi kết luận kèm lệnh + số thật). Không có skill NestJS/Prisma riêng ⟹ dùng `AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/`.

## 1. Commit

| Commit | Nội dung |
| --- | --- |
| `bffc8f12` | Merge `fix/final-audit` (G9-02) — không xung đột |
| `d74abac3` | Merge `feat/k4-pool` — xung đột enum `CommitmentReleaseReason` (giữ `REVOKED`, `LATE_GRANT`, `GRANTED_FROM_POOL`), `budgets.types`, `commitment.dto`, listener cấp (giữ cả giải phóng toàn bộ K4 từ kho lẫn M-10 K2); `openapi.json` lấy HEAD |
| `78dfaa30` | Merge `feat/mf5-run` — không xung đột |
| `78169e03` | Merge `feat/mf4-baseline` — `usage-rules.service.ts`: giữ `runNow`/`RunTally`/advisory lock (mf5-run) **và** `UsageRulesClosingService` ghi KPI-3 vào `plan_usage_rates` (mf4) ⟹ chạy tay cũng cập nhật KPI-3 |
| `042aac42` | Merge `feat/request-history` — chỉ file sinh |
| `a4c4f818` | Merge `feat/mf1-rules` — nhánh `EXTEND` của `complete` chuyển vào `ProvisioningGrantCompletion.write` (K4 đã dời phần ghi sang đó); `EXTEND` kèm `licenseKeyId` ⟹ 422 `KEY_NOT_APPLICABLE`; README/controller ghép hai mô tả |
| `de7bd810` | fix (a): ứng dụng không Business Owner vẫn ngừng được + test |
| `4e37078d` | fix (b): tác vụ `EXTEND` đóng thất bại kết thúc Request tiếp tục + test |
| `19b08555` | fix (c): dòng lịch sử có `flags.manyPaidSoftware` (giữ `reserveUsed`) + test |
| `e5adef90` | gate: module-layout, collection, policy-ownership, boundaries xanh (nợ có sẵn ở base + do nhánh) |
| `44dfc5b4` | sinh lại `openapi.json`, `routes.md`, `module-graph.md` (381 operation) |
| `74c20336` | `rules:format` 2 file Markdown |
| `8635a702` | test cũ theo luật mới (vòng 1) + fixture GH của `RequestHarness` |
| `89942fe3` | fix code: drift Prisma, truy vấn danh tính 50 000 dòng, hợp đồng OpenAPI |
| `c08e488c`, `688cc6da`, `14e9955a`, `379dc011` | test cũ theo luật hiện hành (vòng 2, 3, 4), fixture `fixture-sql.ts` |

Sau mỗi merge: `pnpm prisma:generate` + `pnpm typecheck` = 0 (cả 6 lần). Migration giữ nguyên tên; thứ tự chạy trên DB sạch kiểm bằng
`test:integration` (DB tạm tự migrate) và bằng script deploy + `prisma migrate diff` (drift = rỗng sau sửa model).

## 2. Bước 2 — sửa tích hợp

- **(a) Business Owner (FIX-BUDGET Risks).** Chỗ duy nhất thu hồi/ngừng phụ thuộc Business Owner là `catalog/application-retirement`
  (thu hồi seat/bàn giao không phụ thuộc). Nay ứng dụng **không** có Business Owner ⟹ IT Admin (người vốn quyết `POST /retire`) ngừng
  không cần xác nhận, vẫn chặn khi còn quyền/thuê bao; `retirement_confirmation_id` NULL (CHECK DB đã cho phép); ứng dụng có owner giữ
  luật cũ. `GET /retirement` `confirmed=true` khi không có owner. Test: unit `ownerConfirmationNeeded`, integration QĐ-104 (chặn khi còn seat,
  `confirm` bởi owner cũ ⟹ 422, ngừng 200, audit `confirmationId: null`) — PASS.
- **(b) EXTEND đóng thất bại (FIX-RULES Skipped).** `closeFailed` của `EXTEND` gọi `GrantRequestGate.reportExtensionFailed` ⟹ Request
  `RENEWAL` ở `AWAITING_EXECUTION` → `FAILED`, hoàn khoản giữ `GRANT_FAILED` như GRANT thất bại, audit `ACCESS_REQUEST.RENEWAL_NOT_APPLIED`
  (`problem: EXTENSION_CLOSED_FAILED`), báo `outcomes.ended`; Assignment cũ không bị fail/hủy ⟹ hết hạn theo ngày kết thúc cũ,
  `hasPendingRenewal` = false. Test integration — PASS. *Hủy* (`cancel`) của `EXTEND` vẫn chỉ đi theo đường rút Request (xem Rủi ro).
- **(c) Lịch sử (FIX-HISTORY Deviated).** mf1-rules có `flags.manyPaidSoftware {count, reason} | null` trên view Request ⟹ thêm cùng schema
  vào dòng lịch sử (`accessRequestList`, `departmentAccessRequestList`), giữ `reserveUsed`; một truy vấn mỗi trang. Test http + integration — PASS.
- **(d) Test cũ trái luật mới** — đổi kết quả mong đợi, không xóa ca (chi tiết §4).
- Quick check sau Bước 2 (trước full test): `typecheck` 0 · `lint` 0 · `format:check` 0 · `arch:check` 0 · `arch:docs:check` 0 ·
  `rules:check` 0 (sau sửa trạng thái plan history) · `prisma:validate` 0 · `test:gates` 331/331 (sau sửa 6 ca) · `test:discovery` 0 ·
  `openapi:export` 0.

## 3. Bước 3 — lệnh và kết quả thật

`TEST_DATABASE_ADMIN_URL` lấy từ `.env` như brief. Lượt 1 chạy tuần tự `pnpm check ; test:integration ; test:integration:serial ; test:http ;
test:e2e ; test:flows ; test:scripts`.

| Lượt | Lệnh | Kết quả thật |
| --- | --- | --- |
| 1 (01:36) | `pnpm check` | exit 1 ở `rules:format` (2 file .md); chạy lại: exit 1 ở `lint` (đua với file đang sửa); lần 3: unit 428 suite — 3 failed / 425 passed, 5414 test — 3 failed / 5411 passed |
| 1 | `pnpm test:integration` | 411 file: 69 failed, 1 skipped, 341 passed; 4680 test: 265 failed, 5 skipped, 4410 passed |
| 1 | `pnpm test:integration:serial` | 13 file: 12 failed, 1 passed; 96 test: 93 failed, 3 passed |
| 1 | `pnpm test:http` | 88 file: 11 failed / 77 passed; 2132 test: 17 failed / 2115 passed |
| 1 | `pnpm test:e2e` | 11 file: 2 failed / 9 passed; 51 test: 2 failed / 49 passed |
| 1 | `pnpm test:flows` | 10/10 failed (69 test) — do một chuỗi `summary` hỏng tôi đưa vào giữa lượt (đã sửa ngay) |
| 1 | `pnpm test:scripts` | 308 test: 303 pass, 3 fail |
| 2 | integration 69 file đỏ | 41 failed / 28 passed; 959 test: 62 failed / 897 passed |
| 3 | integration 41 file đỏ | 14 failed / 27 passed; 445 test: 25 failed / 420 passed |
| 3 | http 11 file đỏ | 2 failed / 9 passed; 193 test: 2 failed / 191 passed |
| 3 | `pnpm test:e2e` | 1 failed / 10 passed; 51 test: 1 failed / 50 passed |
| 3 | `pnpm test:flows` | 4 failed / 6 passed; 69 test: 10 failed / 59 passed |
| 3 | `pnpm test:scripts` | 308 test: 305 pass, 1 fail (CRLF, môi trường) |
| 4 | integration 14 file đỏ | 12 failed / 2 passed; 147 test: 23 failed / 124 passed (4 file sửa sau khi lượt bắt đầu) |
| 4 | http 2 file đỏ | 2/2 passed, 24/24 test |
| 4 | e2e `mobile-approver-journey` | 1 failed / 4 passed |
| 4 | `pnpm test:flows` | 1 failed / 9 passed; 69 test: 2 failed / 67 passed |
| 5 | integration file vừa sửa | `manager-scope` 24/24, `department-effective-year-r2`, `spend-budget-check-years`, `requests-ai-source`, `requests-dashboard-facts` 8/8, `ghost-seat-g2` 15/15 PASS; `ghost-seat-g2-reclaim` 2 failed / 9 passed |
| 5 | `test:gates` (HEAD) | 331/331 |
| 5 | `pnpm build` (HEAD) | exit 0 |
| 5 | `usage-identity-queue` + `vendor-import-preview` với `identity.repo.ts` của base | vẫn 2 failed / 16 passed ⟹ không do sửa lát 10 000 |
| cuối (HEAD `379dc011`) | `pnpm check` | exit 1 **chỉ** ở `test:scripts` (305 pass / 1 fail CRLF, môi trường); trước đó xanh hết: rules, format, lint, typecheck, unit 428/428 suite – 5414/5414 test, gates 16/16 – 331/331, arch:check, arch:docs:check. Các bước sau chạy riêng: `test:discovery` pass, `pnpm build` exit 0 |

## 4. Lỗi đã sửa, theo loại

**Lỗi code thật**
- Drift schema ↔ migration (mf4-baseline): FK `applications.business_owner_employee_id` thiếu `onDelete: Restrict`, `PlanUsageRate` thiếu quan
  hệ `organization` ⟹ `prisma migrate diff` không rỗng (test drift đỏ). Sửa model, drift = 0.
- `usage` `IdentityRepo` đưa 50 000 định danh vào một `IN` ⟹ vượt 32 767 tham số PostgreSQL ⟹ 500 khi xác nhận báo cáo lớn (có từ base).
  Đọc theo lát 10 000.
- OpenAPI: hai DTO trùng tên lớp (`DecisionBodyDto`, `ReturnBodyDto` của optimization đè schema của budgets/requests) ⟹ tài liệu sai thân
  request; đổi tên `GhostSeat*BodyDto`. Bỏ mã nội bộ khỏi description, rút 4 summary > 70 ký tự, ngày multipart theo pattern runtime,
  ngày phản hồi có `format: date`, mô tả 403 đọc.
- `EXTEND` đóng thất bại kẹt Request (fix b); ngừng ứng dụng không owner (fix a).
- **Không** có thay đổi tiền/quyền ngoài (a), (b) — (b) hoàn khoản giữ theo cùng luật GRANT thất bại.

**Test cũ theo luật cũ (đổi kỳ vọng, không xóa ca)**
- Luật của 6 nhánh: K4 (cấp/trả/thu hồi được, khóa bắt buộc, wire khóa mới), Request tiếp tục (duyệt mở `EXTEND`, cửa sổ 30 ngày, ca
  QĐ-109b dùng cửa sổ 90 ngày và tự kiểm 409 khi chưa mở), GH (preview có `limits`, audit có `manyPaidSoftwareCount`, 3 tham số mới),
  M-10 (`LATE_GRANT` khi cấp K2 — các ca rút/đóng dòng/thất bại nhóm), lịch sử theo vai (trưởng phòng/Người duyệt chi đọc được ⟹ 403 thay
  404, timings), AF-05/12/16/17 (owner tùy chọn, số tiền phiên bản, Trần đã phát hành, Business Owner tùy chọn), Người duyệt chi đọc lô.
- Luật của base chưa từng được đổi trong test (file test không bị 6 nhánh chạm): MF1-D một bước (trưởng phòng tự gửi/phòng không trưởng ⟹
  `NOT_REQUIRED`; nhóm có trưởng phòng ⟹ 422 `HEAD_IN_GROUP`), RV-26 (đăng ký nội bộ không còn Business Owner), C1-17 (UNCONTROLLABLE bắt
  buộc phương án), MF4-C (khóa `budgetMine`, bảng trừ phần chờ duyệt chi RV-10, dòng BM-10, Trần G5-05), task có `claimableNow/dueOn/notBefore`,
  test migration có migration sau mốc.

**Test chưa đăng ký / gate**
- Manifest +5 route ghost-seat (base + `POST /ghost-seat-rule-runs`), route-codes 409 `RULE_RUN_BUSY`, `NESTED_ARRAYS` +
  `sharedPoolUnallocated.software`, `PRISMA_MODEL_OWNER` +14 model, `OTHER_DECISIONS` request-history, tổng 381 operation, multipart usage,
  `WITHOUT_VALIDATION`; tách 3 thư mục > 25 file và 2 spec > 400 dòng; capability `requests` 39 → 42 + bảng tầng.

**Fixture / dữ liệu test**
- `RequestHarness` và flow world đánh dấu Request/dòng nhóm mới là miễn GH (trigger chỉ trong DB test) — GH-1/2 xét ở suite riêng
  (`enforceRequestLimits`). G2/G3 dựng seat sở hữu phòng bằng cách tạm tắt trigger bất biến; giá tránh được đọc snapshot báo cáo; K4 plan là
  phần mềm licensed; seat K4 cũ ghi bằng SQL.

**Do tải máy**: `identity-access/qd93-role-migration` (timeout hook 30 s ở lượt 1–2 khi chạy song song `pnpm check`) xanh khi chạy lại ở lượt 3;
không ca nào khác chỉ đỏ vì tải. Sự cố tự gây: lượt 1 `test:flows` 10/10 đỏ do một chuỗi `summary` có dấu nháy tôi sửa giữa lượt — sửa ngay, lượt 3–4 flows chỉ còn ca có từ base.

## 5. Đỏ còn lại + lý do

Môi trường (đã chứng minh):
- `test:integration:serial` 12/13: `Set TEST_DATABASE_BOOTSTRAP_URL to the superuser of a dedicated local PostgreSQL 17 server` — role `app`
  có `rolsuper=false` (kiểm bằng `pg_roles`); không có superuser trong `.env`.
- `test:scripts` 1: `.env.bootstrap.example` checkout CRLF (`git ls-files --eol` ⟹ `i/lf w/crlf`, `core.autocrlf=true`), wrapper từ chối CRLF.

Có từ base, chưa sửa xong trong timebox (file test **không** bị 6 nhánh chạm — `git log e962019e..a4c4f818 -- <file>` rỗng):
- `ai-assist/queue-summary-approver` (7): kịch bản R9 là bước nhu cầu của Người duyệt chi — tiền đề đã bỏ ở MF1-D (gói 7), cần viết lại kịch bản AI.
- `requests/need-decision-queue-handover` (3): cùng tiền đề MF1-D (bước nhu cầu của Request trưởng phòng; phòng bỏ trưởng ⟹ trả 409 thay 404).
- `optimization/ghost-seat-g2-reclaim` (2), `optimization/ghost-seat-g3-g4` M5-18 (1: watch bị NEGATED trước OUT_OF_SCOPE vì evidence mẫu
  `lastActiveDate: null`), `usage/usage-identity-queue` (1), `usage/vendor-import-preview` (1: định danh AMBIGUOUS thành NOT_FOUND),
  `flows/mf5-ghost-seat` (2: CHECK `ghost_seat_recommendations_usage`), `e2e/mobile-approver-journey` (1: không có thông báo
  `STEP_ASSIGNED SPEND_APPROVAL` cho Request một bước của trưởng phòng — cần kiểm luật thông báo gói 7).

## 6. TẠM CHỌN (Owner đổi được)

1. Ứng dụng không Business Owner: IT Admin ngừng không cần xác nhận; không ai xác nhận thay.
2. `EXTEND` đóng thất bại ⟹ Request `FAILED`, giải phóng `GRANT_FAILED`; `EXTEND` kèm khóa ⟹ 422 `KEY_NOT_APPLICABLE`.
3. Dòng lịch sử mang cả lý do GH-3 (như view chi tiết), đọc bởi IT/Người duyệt chi/Finance/trưởng phòng.
4. Fixture miễn GH trong DB test (integration + flows); GH chỉ xét ở `request-limits`.
5. Lát 10 000 định danh/truy vấn.
6. Kỳ vọng test MF1-D/RV-26/C1-17/MF4-C viết theo hành vi code hiện hành của base (không phải quyết định luật mới).

## 7. Rủi ro / việc sau

- Request tiếp tục bị **rút** khi đang `AWAITING_EXECUTION`: tác vụ `EXTEND` mở vẫn nằm trong hàng IT (hủy grant chỉ tìm `kind = GRANT`).
- Thông báo `NEED_APPROVED` của Request tiếp tục vẫn nói `RENEWAL_APPLIED` dù nay còn chờ IT kéo dài (luật thông báo — chưa đổi, cần Owner/Docs).
- Nhóm có trưởng phòng: các ca supplement/edge cũ chỉ còn kiểm từ chối `HEAD_IN_GROUP` (mất phần kiểm `LINE_NOT_DROPPABLE` với người ngoài).

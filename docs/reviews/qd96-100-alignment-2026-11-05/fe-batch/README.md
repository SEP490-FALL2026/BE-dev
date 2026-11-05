# Lượt "FE nối 5 main flow" — tổng hợp, prompt implement, checklist (05/11/2026)

Hạn bàn giao FE: **20:00 05/11/2026**; thuyết trình 06/11. Lượt này chỉ có spec/plan; **chưa có gì được implement hay
kiểm chứng**. Căn cứ: review Docs `Docs/Reviews/main-flows-api-contract-review-2026-11-05/`, bộ qd96-100 (tracker
[README](../README.md), [QUESTIONS mục D](../QUESTIONS.md), [C-REVIEW](../C-REVIEW.md)), báo cáo kiểm lại
[V1 — MF-1/MF-4](V1-MF1-MF4.md), [V2 — MF-2/MF-3/MF-5](V2-MF2-MF3-MF5.md), suite E2E
[`e2e-main-flows-suite`](../../../workspace/items/e2e-main-flows-suite/spec.md). BE HEAD khi rà: `808318a4`.

## 1. Bảng hạng mục

Owner chốt 05/11: **tối nay = Đợt 1 "chốt contract" cho 5 flow + API nối tool G7**. Logic tiền và job đi Đợt 2/3.
Giờ là ước code + test theo file của phần được giao. Task cụ thể của Đợt 1 trong từng plan: xem
[DELTAS-APPLIED.md](DELTAS-APPLIED.md). Field theo vai: [FIELDS-MF1-MF4](FIELDS-MF1-MF4.md),
[FIELDS-MF2-MF3-MF5](FIELDS-MF2-MF3-MF5.md).

### 1.1 Đợt 1 — giao implement ngay (4 làn song song, mỗi làn một AI)

| Làn                   | Thứ tự | Hạng mục (phần)                                                                          | Thay đổi contract chính                                                                                                                                                                                                      | Migration                                          | Giờ  |
| --------------------- | ------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---- |
| R — Request/ngân sách | R1     | `qd96-100-seed-demo-v3` Task 0 (đổi tên fixture v2 → v3)                                 | —                                                                                                                                                                                                                            | dữ liệu                                            | 1    |
|                       | R2     | `qd96-100-request-sender-rules` (A)                                                      | gỡ `POST /delegated-requests`; nhóm ≥ 2 (`GROUP_REQUEST.TOO_FEW_LINES`); tiếp tục chỉ người giữ quyền gửi; grant bỏ `expectedEndDate`                                                                                        | —                                                  | 5    |
|                       | R3     | `qd96-100-request-term-limit` (A)                                                        | `termMonths` 1..12; bỏ `termConfirmation`; output `termLimit`                                                                                                                                                                | —                                                  | 6    |
|                       | R4     | `qd96-100-request-year-without-spend-date` Task 2                                        | bỏ `expectedSpendOn` ở 9 op + response (422 nếu còn gửi)                                                                                                                                                                     | —                                                  | 4    |
|                       | R5     | `qd96-100-remove-spend-override` (A)                                                     | bỏ `override`/`overrideReason`/`bySubstitute`                                                                                                                                                                                | —                                                  | 2    |
|                       | R6     | `qd96-100-remove-budget-revision-and-high-value` (A)                                     | gỡ 3 route revision; bỏ `highValue*`                                                                                                                                                                                         | `DROP NOT NULL`                                    | 4    |
|                       | R7     | DTO của `qd96-100-approved-end-date` + `qd96-100-renewal-chaining-and-window`            | nhóm bỏ `lines[].expectedEndDate`; `expectedEndDate` thành output; tiếp tục nhận `{assignmentId, extensionMonths, businessReason}`, 422 `RENEWAL_REQUEST.WINDOW_NOT_OPEN`                                                    | —                                                  | 6    |
|                       | R8     | DTO của `qd96-100-annual-budget-reserve-and-floor`                                       | tiền chỉ `{amount}` (BE suy tiền tệ/Cost Center); `reserve` tùy chọn, mặc định 10 %; `reserveReason` khi khác mặc định — kéo lên Đợt 1 để FE không sửa form ngân sách hai lần; 409 sàn vẫn Đợt 3 (Task 1, 2a, 3, 5 của plan) | M15a (thêm cột `reserve_reason`) + sửa nhẹ fixture | 3    |
| P — Nhân sự           | P1     | `qd96-100-departure-day-access-block` (A)                                                | output `accessBlocked`/`accessBlockedFrom`; IT không chờ `LEFT`                                                                                                                                                              | bảng `employee_access_blocks`                      | 7    |
|                       | P2     | `qd96-100-departure-block-now-mode` (A)                                                  | `abrupt` → `accessBlockMode` (bắt buộc); `markLeft` body `{}`; 409 `LAST_WORKING_DAY_AHEAD`                                                                                                                                  | có                                                 | 6    |
|                       | P3     | `qd96-100-personnel-grounds-and-reasons`                                                 | `grounds` + `reason` bắt buộc (cả đổi ngày cuối/hủy); revocations bỏ `count`, `reason` → `note?`                                                                                                                             | có thể                                             | 5    |
|                       | P4     | `qd96-100-transfer-review-defaults` (A) + `qd96-100-transfer-replacement-request` Task 0 | bỏ `NEEDS_NEW_TOOL`/`newToolNote`; quyết định có `reason` bắt buộc                                                                                                                                                           | nhỏ                                                | 3    |
| L — Thuê bao          | L1     | `qd96-100-subscription-owner-confirmation` (A)                                           | quyết định chuyển sang **trưởng phòng sở hữu** `{decision:'CONFIRM', reason?, acknowledgeActiveUsers?}`; field cũ 422; Người duyệt chi rời luồng; trưởng phòng thấy mã + tên người giữ seat; Finance đọc                     | CHECK + cột                                        | 8    |
| G — G7 nối tool       | G1     | `g7-device-registry-acknowledgement` (A)                                                 | 10 op thiết bị/BM-06/thông báo/xác nhận                                                                                                                                                                                      | 4 bảng + CHECK tài liệu                            | ≈ 12 |
|                       | G2     | `g7-device-credential-enrollment` (A)                                                    | mã đăng ký, `sstd_` token, `device-session`, xoay vòng, thu hồi; `@DeviceAuthenticated`                                                                                                                                      | bảng + enum audit `DEVICE`                         | ≈ 12 |
|                       | G3     | `g7-ai-usage-intake` (A)                                                                 | allowlist, `POST /ai-usage-batches`, `POST /ai-tool-status-snapshots`, 5 GET                                                                                                                                                 | 6 bảng                                             | ≈ 14 |
|                       | G4     | Tool `Code/Tools/workstreams/ai-collector/be-integration` (A)                            | `be-enroll`, `be-session`, `be-upload` + demo                                                                                                                                                                                | —                                                  | ≈ 8  |

Phụ thuộc chéo làn: G2 dùng facade chặn truy cập của P1 (thiếu P1 thì credential chỉ bị chặn khi `TERMINATED`); G4 cần
G1–G3 chạy trên BE local. Migration: mỗi làn đặt timestamp tăng dần; khi merge xếp lại theo C-REVIEW mục 3.

### 1.2 Đợt 2/3 — sau Đợt 1 (chưa giao tối nay)

| Hạng mục                                                                                                                                                                                                                                                                                    | Nội dung                                                                                       | Giờ   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----- |
| `qd96-100-request-year-without-spend-date` (neo giá) → `qd96-100-budget-check-three-outcomes` → `qd96-100-reserve-confirmation`                                                                                                                                                             | ba kết quả `WITHIN_BASE`/`NEEDS_RESERVE`/`BLOCKED`, pending, giá gốc; `reserveConfirmations[]` | ≈ 50  |
| `qd96-100-budget-visibility-qd100p`, `qd96-100-annual-budget-reserve-and-floor`, `qd96-100-head-group-request-queue`, logic `approved-end-date`/`renewal-chaining-and-window`, `seed-demo-v3` A1                                                                                            | số ngân sách theo QĐ-100p, dự phòng 10 %, hàng đợi trưởng phòng                                | ≈ 37  |
| Phần B của mọi hạng mục, `qd96-100-revocation-deadline-and-withdraw`, `remove-finance-review-path`, `spend-notifications`, `sla-reminder-recipients`, `people-read-scope`, `account-org-api-fields`, `manager-employee-detail`, catalog/licensing api fields, `subscription-quantity-guard` | —                                                                                              | ≈ 150 |
| `e2e-main-flows-suite`                                                                                                                                                                                                                                                                      | suite `pnpm test:flows`, 31 kịch bản, chạy theo batch                                          | ≈ 16  |

### 1.3 BLOCKER (không mock, không coi flow là đủ)

| Bước                    | Thiếu                                                                                 | FE hiển thị                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1.5–1.7 (cho tới Đợt 2) | ba kết quả ngân sách, xác nhận dự phòng                                               | giữ API kiểm ngân sách hiện tại; không dựng màn dự phòng                                                   |
| 1.9                     | chuyển seat kèm chi phí, giữ chỗ seat (H2); K4 (`a05-k4-*`)                           | dữ liệu demo tránh gói K4                                                                                  |
| 1.1                     | tiếp tục nhóm, hợp thức hóa, tăng cấp thuê bao (H4)                                   | không có màn                                                                                               |
| 3.2, 3.7, 3.8           | nhãn T1–T4 (H6); Request thay thế tự tạo; quá hạn mặc định thu hồi (F19)              | người chuyển tự gửi Request ở phòng mới                                                                    |
| 4.1–4.4                 | lịch, baseline, phong bì, chỉ tiêu (H1)                                               | demo từ BM-10                                                                                              |
| 5.2–5.5                 | import usage vendor, khớp danh tính, G1–G4, quyết ghost seat (`g7-vendor-*`, `g7-g*`) | "Chưa có dữ liệu usage" (dashboard trả `NOT_AVAILABLE`, không số 0); usage từ **máy công ty** có sau làn G |
| 5.6, 5.10, 5.11         | tổng hợp ND−60, đóng thuê bao, hóa đơn/tiết kiệm thực (H3/H7)                         | `realisedSavings` = "tiết kiệm tại kỳ gia hạn (khai báo)"                                                  |

Chờ Owner/mentor: `QĐ-100l`/`QĐ-100ah` (giữ hiện trạng); bước 3.4 quy trình (hệ thống tự đóng Request trả phí khi điều
chuyển) mâu thuẫn `QĐ-90b` (IT đóng kèm lý do) — code đang theo `QĐ-90b`.

## 2. Prompt giao implement cho AI khác

```text
Bạn implement các hạng mục BE của lượt "FE nối 5 main flow" trong repo
D:\FPT\FALL2026\Code\BE-dev-software-license-management (branch hiện tại, KHÔNG tạo branch, KHÔNG commit/push trừ khi
Owner bảo). Trả lời tiếng Việt.

0. Skill preflight theo D:\FPT\FALL2026\CLAUDE.md: process skill (superpowers:executing-plans hoặc
   agent-skills:incremental-implementation), domain (agent-skills:api-and-interface-design, test-driven-development),
   verification (superpowers:verification-before-completion). Đọc AGENTS.md, CONTRIBUTING.md, docs/rules/api-contract.md,
   docs/rules/module-structure.md, docs/rules/database-business.md, test/README.md.
1. Bạn phụ trách LÀN <R|P|L|G> trong docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/README.md mục 1.1. Làm ĐÚNG
   thứ tự cột "Thứ tự" của làn mình, chỉ phần/Task Đợt 1 ghi trong fe-batch/DELTAS-APPLIED.md và plan. Với mỗi hạng
   mục: đọc spec.md + plan.md (+ test-plan.md nếu có) trong docs/workspace/items/<slug>/ (làn G thêm
   docs/reviews/g7-usage-design-2026-11-05/DESIGN.md và ALIGNMENT-2026-11-05.md; G4 làm ở
   D:\FPT\FALL2026\Code\Tools\workstreams\ai-collector\be-integration\plan.md), làm từng task, không tự đổi contract,
   không thêm field ngoài bảng field của spec. Chỗ spec mơ hồ → dừng hạng mục đó, ghi câu hỏi vào cuối spec mục Open
   questions, làm hạng mục kế tiếp của làn. Không sửa file của làn khác; file dùng chung (openapi.json, manifest test,
   tiers.cjs, prisma models) sửa tối thiểu và báo trong bàn giao để coordinator gộp.
2. Migration: theo thứ tự danh sách phẳng của C-REVIEW mục 3; timestamp lớn hơn migration cuối đã merge; không sửa
   migration cũ; không tạo lại enum (giữ giá trị cũ, chặn ghi mới). Seed: theo qd96-100-seed-demo-v3 khi tới lượt.
3. Mỗi hạng mục xong chạy bộ kiểm nhanh: pnpm typecheck; pnpm lint; pnpm arch:check; pnpm rules:check; test unit/
   integration/http của file chạm (pnpm jest <path> theo test/README.md); nếu đổi HTTP: pnpm openapi:export và cập nhật
   test/support/openapi-example-manifest.ts + api-coverage-manifest.ts. KHÔNG chạy full suite (Owner chạy lúc audit).
4. Field đã bỏ phải trả 422 khi client còn gửi (z.strictObject) — viết test cho từng field đã bỏ.
5. Cập nhật tài liệu cùng thay đổi: spec/plan (mục Changes and acceptance + bảng verification của plan), README module,
   docs/generated nếu có lệnh sinh; Docs/Figma UI-UX/API-Integration (flow/role liên quan) + changes/CHANGELOG.md chỉ
   cho contract ĐÃ implement, ghi revision.
6. Không đánh dấu accepted/released; trạng thái tối đa "verified-local" kèm lệnh + output.
7. Bàn giao (mỗi hạng mục): danh sách file đổi, migration, lệnh đã chạy + kết quả nguyên văn (pass/fail count),
   endpoint/field đổi (trước → sau) kèm ví dụ payload, phần chưa làm/lệch spec + lý do, câu hỏi mở.
```

## 3. Checklist coordinator review sau implement

- [ ] Diff khớp spec từng hạng mục: route, field giữ/bỏ/đổi, mã lỗi, quyền/phạm vi dữ liệu; không có field mới ngoài spec.
- [ ] Field đã bỏ trả 422; không còn đọc giá trị client cho thứ BE phải tự tính (năm ngân sách, ngày quyền, số tiền, nhãn T1–T4…).
- [ ] Đọc tay SQL migration, trigger, CHECK, partial unique, H7 grants; migration chạy được trên DB đã có dữ liệu demo.
- [ ] Authz: đúng vai + đúng phòng/bước được giao; tự duyệt bị chặn; Spending Approver/Finance không còn ở nhánh đã bỏ.
- [ ] Transaction/chống trùng: retry trình lô/duyệt không tạo cam kết trùng; race hai Request cùng ngân sách.
- [ ] Test đổi: không nới assertion để qua; test mới có ca từ chối; mutation thử ở chỗ tiền/quyền.
- [ ] OpenAPI export khớp; API-Integration + CHANGELOG chỉ ghi phần đã có thật.
- [ ] Chạy suite `e2e-main-flows-suite` (hoặc phần đã có) trên DB local riêng; BLOCKER vẫn ghi là BLOCKER.

## 4. Checklist kiểm thử/deploy cho người thực hiện sau

- [ ] DB local riêng: migrate từ trống + migrate trên bản sao dữ liệu demo hiện tại; seed `shared-demo-v3` (khi có).
- [ ] `pnpm test:flows` (suite E2E) theo batch đã implement; lưu output.
- [ ] Owner chạy full suite (`pnpm check`, `pnpm test:e2e`, `pnpm test:integration`) trước merge `dev`.
- [ ] Deploy: backup DB VPS → migrate → seed/reset theo quyết định Owner → smoke 5 flow bằng tài khoản demo từng vai.
- [ ] FE: sinh lại client từ `openapi.json` mới; gỡ ô nhập field đã bỏ; hiển thị "chưa có dữ liệu" cho phần BLOCKER (không số 0 giả).

# PLAN — Sửa MF-1 và MF-4, bổ sung API MF-1

> **Cho chat code:** đọc [SPEC.md](SPEC.md) trước (nhất là §4 delta của gói đang làm, §6 quyết định). Mỗi gói làm theo `plan.md` của hạng mục
> `docs/workspace/items/qd103-*` được ghi, **áp delta của SPEC §4 lên trên** — delta thắng khi khác. Không đọc lại toàn bộ tracker cũ.

**Mục tiêu:** BE đúng `BR-MF1-01…09`, `BR-MF4-01…06` (+ `QĐ-109`), đủ API P0 + P1 cho FE demo MF-1 theo vai.

**Cách làm:** 15 gói tuần tự trên nhánh `feat/qd103-108-mf145`, một chat code thực hiện, chat review (chat này hoặc chat review mới đọc file này)
kiểm sau mỗi gói. Ba mốc demo được: M1 (MF-1 cùng phòng + job 01/01), M2 (MF-4 đủ), M3 (cấp chéo phòng + hóa đơn).

**Stack:** NestJS + Prisma + PostgreSQL, modular monolith (`src/modules/*`), Jest (unit/http/integration), OpenAPI xuất từ code.

---

## 0. Trước gói đầu tiên

- [ ] Owner duyệt SPEC (và đổi TẠM CHỌN §6 nếu muốn).
- [ ] Docker Desktop chạy được (`docker version` trả về trong < 10 s). Lần trước treo ⟹ integration chưa chạy cho `e56f6cd9`.
- [ ] `git status` trên `feat/qd103-108-mf145`: còn 12 file chưa commit của MF4-A — gói MF4-A xử lý chúng, **không** stash/reset.
- [ ] Docs đã có `QĐ-109` (chat review ghi, Owner commit hoặc cho phép commit) — pin Docs mới ghi vào đầu SPEC khi có.

## 1. Thứ tự gói

| #   | Gói   | Hạng mục (`docs/workspace/items/`)                                                                                   | Cần trước            | Cỡ  | Mốc / hạn                     |
| --- | ----- | -------------------------------------------------------------------------------------------------------------------- | -------------------- | --- | ----------------------------- |
| 1   | MF4-A | `qd103-budget-baseline-annual-check` (R9)                                                                            | Docker               | S   |                               |
| 2   | MF1-A | `qd103-request-amount-and-term` + §2 của `qd103-grant-from-shared-pool`                                              | — (song song 1 được) | L   |                               |
| 3   | MF1-B | `qd103-budget-check-three-outcomes` + `qd103-commitment-current-year`                                                | 1, 2                 | L   |                               |
| 4   | MF1-C | `qd103-new-year-auto-commitments` (rút gọn `QĐ-109a` + SPEC §4b RV-01 — **không** cần gói 9/14)                      | 3                    | M   | commit ≤ 01/12, `dev` ≤ 15/12 |
| —   |       | **Mốc M1:** MF-1 cùng phòng chạy đúng luật (gửi → nhu cầu → lô → kiểm 3 kết quả → duyệt → cam kết → cấp) + job 01/01 |                      |     |                               |
| 5   | MF4-B | `qd103-budget-proposal-lines-cleanup` (Task 1→5)                                                                     | 1, 3                 | L   |                               |
| 6   | MF4-C | `qd103-budget-views`                                                                                                 | 3 (Task 2), 5        | M   |                               |
| —   |       | **Mốc M2:** MF-4 B1 → B7 đủ theo vai                                                                                 |                      |     |                               |
| 7   | MF1-D | `qd103-request-single-step-routing`                                                                                  | 3                    | L   |                               |
| 8   | MF1-E | `qd103-request-limits-gh`                                                                                            | 7                    | M   |                               |
| 9   | MF1-F | phần còn lại `qd103-grant-from-shared-pool` + `qd103-commitment-release-on-revocation`                               | 2, 3                 | L   |                               |
| 10  | MF1-G | `qd103-purchase-invoice-sbf19` + P1-11 (bắt buộc) (+ `-followups` P2-06…08 nếu kịp) — SPEC §4b RV-02                 | 9                    | L   |                               |
| —   |       | **Mốc M3:** cấp chéo phòng từ kho, mua khi hết kho, `K1`, hóa đơn IT nộp — Finance xác nhận                          |                      |     |                               |
| 11  | MF1-H | `qd103-renewal-request-window` (+ sửa job 01/01 — RV-03)                                                             | 2, 3, 4              | M   |                               |
| 12  | MF1-K | `qd103-request-history-by-role` + `qd103-mf1-followups` (trừ P3) + P2-04                                             | 7, 8, 11             | M   |                               |
| 13  | MF1-I | `qd103-k4-key-pool`                                                                                                  | 9                    | L   |                               |
| 14  | MF1-J | `qd103-role-based-access`                                                                                            | 8, 9                 | L   |                               |
| 15  | MF-Z  | `qd103-api-docs-regression` + phần MF-1/MF-4 của `qd103-seed-demo-v4(-mf1)`                                          | tất cả               | M   |                               |

Cỡ: S ≈ 2 giờ, M ≈ 1 ngày, L ≈ 1,5–2 ngày công (ước của audit, đơn vị công người; chat AI chạy liên tục thường nhanh hơn). Tổng ≈ 20 ngày công;
tới M1 ≈ 7–8 (R1: gói 3, 4 lạc quan), M2 ≈ 10, M3 ≈ 15. Nếu thiếu thời gian: dừng ở M3 là demo được MF-1 + MF-4; gói 12–14 cắt theo thứ tự
ngược (14 → 13 → 12); gói 13 cắt ⟹ hóa đơn `K4` của gói 10 trả `KIND_NOT_SUPPORTED`.

**Không merge gì vào `dev` cho tới khi gói 2, 3, 4 cùng xong và PASS** (RV-05). Hạn 01/01: gói 4 commit ≤ 01/12 → review → Owner merge `dev` +
deploy ≤ 15/12 → sau 01/01/2027 kiểm dấu chạy năm 2027 (RV-19).

Song song: chỉ khi mỗi chat ở **worktree riêng** (`CODER-PROMPT-PARALLEL.md`). Xung đột dự kiến khi ghép: `catalog/subscription/subscription.repo.ts`
(gói 1 × 2), `request-facts.service.ts`, flow spec, `licensing` public API (gói 7–8 × 9). Ghép xong **chạy lại `pnpm openapi:export`**, không sửa
tay `openapi.json`; kiểm `pnpm db:migrate:deploy` trên DB sạch (RV-06). Gói 5 Task 1 không đụng `requests/finance-review/` (RV-08).

## 2. Quy trình mỗi gói (chat code)

1. Đọc SPEC §4 phần gói + `spec.md`/`plan.md` của hạng mục. Ghi lại delta nào làm đổi task nào của `plan.md` trước khi code.
2. Làm theo task của `plan.md` (đã có test đỏ → code → test xanh cho từng task). Test mới đặt tên theo mã luật, ví dụ
   `it('BR-MF1-06b: vượt số cơ sở còn trong dự phòng ⟹ USES_RESERVE', …)`.
3. Quick check set một lần cuối gói (không chạy sau mỗi task):
   ```bash
   pnpm typecheck && pnpm lint && pnpm format:check && pnpm arch:check && pnpm arch:docs:check && pnpm rules:check
   pnpm prisma:validate && pnpm test:gates && pnpm test:discovery && pnpm openapi:export
   git diff --stat openapi.json   # chỉ được đổi các operation của gói
   pnpm test -- <các file src/**/*.spec.ts đã đổi>                 # unit (jest mặc định trong package.json)
   pnpm test:integration -- <các file test/integration/** đã đổi>   # cần Docker
   pnpm test:http -- <các file test/http/** đã đổi>
   ```
4. Commit: `feat(mf1-mf4): <gói> — <tóm tắt>` (mọi gói, kể cả gói 1); gói L được chia commit theo phase của `plan.md`. Gói có migration chạy
   thêm `pnpm db:migrate:deploy` trên DB sạch; gói chạm luồng end-to-end chạy `pnpm test:flows` cho flow liên quan.
5. Ghi một dòng vào [HANDOFF.md](HANDOFF.md) (tạo nếu chưa có): ngày · gói · commit · lệnh đã chạy + kết quả thật · lệch so với SPEC · việc để lại.
   Báo chat review.

## 3. Review mỗi gói (chat review)

- Đọc diff phần rủi ro: migration, SQL/Prisma raw, policy tiền/ngân sách, phân quyền controller, test đã đổi/xóa.
- Đối chiếu từng luật con A1 §2 mà gói chạm: có test theo mã luật không, nhánh nào thiếu.
- Chạy lại quick check set trên commit của gói; không chạy toàn bộ suite.
- Kết quả: `PASS` hoặc `CHANGES` với finding đánh số tiếp `R-xx` trong HANDOFF.md. Tối đa 2 vòng sửa mỗi gói; còn lại ghi nợ.

## 4. Việc riêng từng gói (ngoài `plan.md` hạng mục)

### Gói 1 — MF4-A (R9)

- [ ] Sửa `test/integration/budgets/budget-cycle-deadline.integration-spec.ts:79-124`: đếm thông báo `BUDGET_NO_HEAD_AT_DEADLINE` theo
      `params.departmentId` của phòng tạo trong ca; ca kế nhiệm kiểm phòng đó không có thông báo (C4-03, F-113).
- [ ] Unit `baseline.policy.spec.ts`: kỳ 01/04/Y–31/03/Y+1 + kỳ kế tiếp ⟹ 3 + 9 tháng; kỳ hết 31/12/Y + kế tiếp ⟹ 0 + 12; `CANCEL` +
      `renewalDate` 01/03 ⟹ 3; `willRenew` khi ngày hết = hôm nay (C4-04).
- [ ] `catalog/subscription/subscription.repo.ts:379,397`: `renewedBy: { select: { id: true, status: true } }`,
      `hasSuccessor = renewedBy?.status === 'ACTIVE'` (C4-07).
- [ ] `baseline.policy.ts`: kỳ chưa bắt đầu có `renewedFrom` vẫn gợi ý _Renew_ (C4-08a).
- [ ] `cycle/cycle-deadline.service.ts:107-131`: loại khỏi `missing` các Cost Center có phiên bản `DRAFT/SENT/CHANGES_REQUESTED/APPROVED` (C4-09).
- [ ] ADR-0018 + `docs/rules/security-jobs.md`: thêm `CycleDeadlineSweeper` (F-115).
- [ ] Integration `VENDOR_REFUSED` cho F-109. Commit `feat(mf1-mf4): gói 1 MF4-A — baseline R9` gồm cả 12 file chưa commit.

### Gói 2 — MF1-A

- [ ] Kéo §2 _Giá Request_ của `qd103-grant-from-shared-pool` (`pickPriceSource`, `requestable-software.service.ts:117`) vào gói này; bỏ tham số
      phòng của `getPlanPrice`/`pricedCyclesOfPlans`.
- [ ] Mốc tính theo `QĐ-109e`: hàm tính số tiền nhận `asOfMonth`; gửi ⟹ tạm tính (hiển thị); trình lô ⟹ tính + lưu số tiền và năm; duyệt ⟹ tính
      lại với giá ngày duyệt. Request một bước: gửi = trình.
- [ ] `QĐ-109b`: Request tiếp tục có kỳ mới trọn năm sau ⟹ `amount = 0` năm hiện tại, `nextYearAmount` trong response preview/chi tiết/màn duyệt.
- [ ] `provisioningTaskComplete`: ghi cột mới `granted_on` = ngày hoàn tất (không sửa `valid_from` — RV-04); ngày kết thúc `min(expectedEndDate, hoàn tất + 12 tháng − 1)`; test tạo 10/11,
      hoàn tất 13/11 (S1-01).
- [ ] `annualVendorAmount` trên preview (P2-02); hồ sơ bổ sung giảm thời hạn (P1-06).

### Gói 3 — MF1-B

- [ ] Task đầu: chuyển `budgetCheckGet`, `budgetCheckYearList` + `spend-view.service.ts`, `spend-years-view.service.ts` từ
      `requests/finance-review/finance-reviews.controller.ts:147-166` sang capability `spend`, giữ operationId; http test cũ vẫn xanh (D-1).
- [ ] Định nghĩa _Request đang chờ duyệt chi_ theo SPEC §4 MF1-B, đặt trong `BudgetsApi`/`spend` public để `budget-views` dùng lại.
- [ ] `spendBatchSubmit` nhận `reserveConfirmations?: [{ requestId, reason }]` (S1-05).
- [ ] Kiểm lại lúc duyệt theo Cost Center hiện hành (M-12).
- [ ] Gộp task của `qd103-commitment-current-year` làm phase cuối (một khoản năm hiện hành, không khoản khi chưa có phiên bản).
- [ ] `reserveConfirmations[]` theo SPEC §4b RV-11; định nghĩa _đang chờ duyệt chi_ theo RV-10; M-12 theo RV-09.

### Gói 4 — MF1-C

- [ ] Xóa khỏi `plan.md` hạng mục mọi task về khoản theo Assignment không Request (Q-01 B cũ): `request_id` nullable, `assignment_id`, đổi
      `budgetCommitmentList`, mở rộng listener thu hồi (`QĐ-109a`).
- [ ] Điều kiện loại `ROLE_BASED`/`K4` đọc mặc định khi cột chưa có (S1-03).
- [ ] Test: chạy hai lần cùng ngày không tạo trùng; năm chưa có phiên bản ⟹ _chưa có ngân sách_ rồi gắn khi duyệt phiên bản; quyền hết hạn
      trước 01/01 không có khoản.

### Gói 5 — MF4-B

- [ ] Áp S4-01 (Trần đã phát hành), `QĐ-109c` (Cancel ngoài tổng — sửa `overCeilingParts` của `c21eea94`), `QĐ-109d` + C4-15 (`kpi3ByPlan`,
      chỉ Renew/Change), S4-04 (migration rút gọn), C4-11, C4-13, C4-14.
- [ ] Test hồi quy cho `c21eea94`: dòng Cancel 50 tr không làm đổi tổng/cờ; dòng New có `KPI-3` thấp không bắt ZBB vì `KPI-3`.

### Gói 6 — MF4-C

- [ ] Dùng định nghĩa _đang chờ duyệt chi_ của gói 3; trưởng phòng đọc Trần đã phát hành + hạn; Người duyệt chi đọc `budgetTable/summary`; tập B4
      theo M-19 A; `basis: OWNER_DEPARTMENT` trên số liệu nền.

### Gói 7 — MF1-D

- [ ] M-15: phòng mà trưởng phòng đã rời, kế nhiệm chưa hiệu lực ⟹ Request mới một bước; Request đang chờ chuyển kế nhiệm ở ngày hiệu lực.
- [ ] Giữ trần nhóm của trưởng phòng như code (không đổi hằng số); thêm `HEAD_IN_GROUP`.
- [ ] Gỡ A2 §5 nhóm 4, 9; bỏ Business Owner ở `SBF-15` (P2-05); phương án bắt buộc khi _không kiểm soát được_.

### Gói 8 — MF1-E

- [ ] Lý do GH-3 theo từng dòng của Request nhóm; M-16; ngoại lệ tài khoản dịch vụ và `QĐ-108c`.

### Gói 9 — MF1-F

- [ ] `subscriptionId` tùy chọn; `K1` tự +1; giải phóng theo ngày (M-06); `K2` phần tháng trước ngày cấp tự giải phóng (M-10); `stock` trên
      `grantQueueList` (P2-03); gỡ guard + trigger phòng sở hữu bằng migration.

### Gói 10 — MF1-G

- [ ] M-28 (hóa đơn `K4` theo năm ngày mua); gỡ `budgetCommitmentInvoiceRecord`; C1-19.

### Gói 11 — MF1-H

- [ ] Tác vụ IT `EXTEND`; `newEndDate` trong body; ngày kết thúc mới ghi khi IT hoàn tất; P2-01.

### Gói 12 — MF1-K

- [ ] P2-04 (chưa có spec hạng mục): thiết kế ngắn trong `HANDOFF.md` trước khi code — cột `invited_at` trên tác vụ cấp, endpoint
      `POST /api/v1/provisioning-tasks/{id}/invitation`, job nhắc 3 ngày làm việc, điều kiện đóng 14 ngày.

### Gói 13, 14 — MF1-I, MF1-J

- [ ] Theo `plan.md` hạng mục; MF1-J ghi `K4` là giới hạn tạm (S1-10) nếu làm trước MF1-I.

### Gói 15 — MF-Z

- [ ] Không drop cột cũ trong đợt này (RV-15) — chỉ kiểm CHECK chặn ghi mới đã có.
- [ ] Seed demo MF-1/MF-4 theo kịch bản `qd103-seed-demo-v4`; sinh lại tài liệu FE `Docs/Figma UI-UX/API-Integration/` (generator chạy trên bản
      clone sạch của BE như các lần trước); viết lại `flows/paid-access-request.md`, `flows/annual-budget.md`.
- [ ] Báo Owner chạy `pnpm check` + `test:integration`, `test:integration:serial`, `test:http`, `test:e2e`, `test:flows`, `test:scripts`.

## 5. Tự rà kế hoạch

- Mọi API P0/P1 của SPEC §3 có gói: P0-01→2, P0-02→8, P0-03/P0-04→3, P0-05→9, P1-01/02→7, P1-03→11, P1-05/09/10→12, P1-06→2, P1-07→13,
  P1-08/11→10. P1-04 ngoài đợt.
- Mọi finding Critical/High có gói: C1-01→3, C1-02→2+9, C1-03/04→2, C1-05→7, C1-06→3, C1-07→2+13, C1-08→10, C1-09→8, C1-10→4, C4-01→3,
  C4-02→5.
- Hạn cứng 01/01/2027: gói 4 ngay sau gói 3; gói 3 không vào `dev` một mình.

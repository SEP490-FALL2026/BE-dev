# A5 — Audit dọn tài liệu BE: `items/`, `reviews/`, `prompts/`, `research/` (10/11/2026)

**Skill đã đọc/dùng:** `planning-and-task-breakdown` (process: chia việc xóa thành lô theo phụ thuộc, mỗi lô có tiêu chí và
lệnh kiểm; ràng buộc "chỉ tạo một file" của giao việc thắng phần `tasks/plan.md` của skill nên kế hoạch nằm ở §6 file
này) · `deprecation-and-migration` (domain: chỉ gỡ khi đã có thay thế và đã kiểm hết nơi tham chiếu vào — "zero active
consumers") · `documentation-and-adrs` (domain: không xóa lịch sử quyết định; tách _đã code_ khỏi _thiết kế không dùng_) ·
`superpowers:verification-before-completion` (verification: mọi kết luận gate có lệnh thật ở §10, không tuyên bố suông).

**Phạm vi và quyền:** chỉ đọc. Không xóa/sửa/di chuyển file nào của repo, không git write, không chạy `pnpm test*`. File
duy nhất được tạo là file này. `docs/roadmap.md` đang được agent A6 sửa song song — mọi số dòng roadmap dưới đây là ảnh
chụp lúc đọc (~20:30–21:30), **tìm theo tên hạng mục hoặc khóa Story/AC**, không theo số dòng.

**Pin:** BE `feat/mf2-mf3` = `origin/dev` `a2dad526`. Báo cáo chốt đợt trước: `D:\FPT\FALL2026\Code\mf1-mf4-handoff\`
(`AUDIT-FINAL.md` @ `e962019e`, `INTEGRATION-REPORT.md`, `DEPLOY-READY.md` @ `9b5ab488` → PR #36 `11051f28`).

## 0. Tổng số theo nhóm

| Nhóm                  | `items/` (thư mục) | File · dòng (items) | `reviews/` (21 mục) | `prompts/` · `research/` · `_template/` |
| --------------------- | ------------------ | ------------------- | ------------------- | --------------------------------------- |
| `GIỮ-ĐANG-DÙNG`       | 27                 | 54 · 8 156          | 3                   | 3 (7 + 1 + 5 file)                      |
| `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | 174                | 370 · 59 032        | 17                  | —                                       |
| `GIỮ-ĐỂ-SAU`          | 15                 | 31 · 5 149          | 0                   | —                                       |
| `XÓA-ĐỀ-XUẤT`         | **23**             | **49 · 4 551**      | 0 thư mục + 1 file  | —                                       |
| `CHƯA-CHẮC`           | 15                 | 245 · 66 868        | 1                   | —                                       |
| **Tổng**              | **254**            | **749 · 143 756**   | **21**              | **3**                                   |

- File review đề xuất tỉa (thư mục cha giữ): `docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/SPEC-PLAN-DOT-2-4.md`
  (381 dòng — kế hoạch Đợt 2–4 không chạy).
- Riêng `dynamic-content-translation` (CHƯA-CHẮC) chiếm 217 file · 64 950 dòng · 3,2 MB (thư mục `spike/`).

## 1. Kết luận chính

1. Đúng như Owner nói: trong các gói thiết kế lại gần đây, gói **thực sự dùng** là `qd103-*` của đợt MF-1/MF-4/MF-5 + kho
   (27/41 mục đã code và vào `dev` qua PR #36; 14 mục còn lại là việc đợt sau, vẫn theo luật QĐ-103→109). Các thiết kế
   `qd96-100-*` Đợt 2–4, khung `g7-*` S3/S4, `a05-k4-*`/`a06-*` bị chặn — **không ai code theo**, đã bị `qd103-*` thay.
2. **Không phải mọi `qd96-100-*` đều "không dùng":** Đợt 1 (PR #31 `aeb00f17`, 06/11) đã code 15 mục `qd96-100-*` + 3 lát
   G7 + runner `e2e-main-flows-suite`. Chúng là lịch sử đã code, xếp `GIỮ-LỊCH-SỬ-ĐÃ-CODE` (ghi rõ phần đã bị `qd103-*` thay).
3. **23 thư mục `XÓA-ĐỀ-XUẤT`**: không mục nào bị code, test gate hay script tham chiếu (chỉ 1 comment trong
   `device-binding.policy.spec.ts`). Thứ chặn duy nhất là **scope map của roadmap**: 21/23 mục là owner/đích trong 63 dòng
   scope map G3–G8. Mô phỏng trên bản sao (§5.2): xóa Lô 1 + 2a + 2b (14 mục) kèm sửa 28 dòng scope map ⟹ `rules:check`
   0 lỗi; 9 mục Lô 2c chỉ xóa được khi **re-pin scope map** (qd103-* đang là `technical-enabler`, không claim AC).
4. `test:gates` không vỡ: registry `test/support/api-collection-registry-*.ts` chỉ trỏ hạng mục đang giữ (gồm 7 mục
   `qd103-*`, `g7-ai-usage-intake`, `ai-assist-queue-summary-be`).
5. Reviews: không thư mục nào nên xóa nguyên; 2 file nằm trong danh sách `rules-check.config.json` (bắt buộc giữ).

## 2. Cách xác định "đã code"

| Nguồn                                                            | Dùng để                                                                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `git log origin/dev` (read-only)                                 | Commit theo slug/gói: `feat(qd103-w1/w2)`, `feat(mf1-mf4): gói N`, `feat(mf5)`, `feat(kho)`, `qd93-*`, `qd95-*`, `unified-seed-reset`…     |
| `git log --diff-filter=A -- docs/workspace/items`                | Commit tạo từng thư mục: A/B series tạo + code ở `e9530c9a` "A1-A10" (PR #19); `qd96-100-*`, `g7-*`, `c1`, `e2e` tạo ở `aeb00f17` (PR #31) |
| `mf1-mf4-reaudit-2026-11-09/SPEC.md` §4, `PLAN.md` §1            | Gói nào dùng hạng mục `qd103-*` nào                                                                                                        |
| `AUDIT-FINAL.md`, `INTEGRATION-REPORT.md`, `DEPLOY-READY.md`     | Gói đã vào HEAD (1–7, 9, MF5 + 6 nhánh sửa: G9-02, K4, lịch sử, GH + Request tiếp tục, MF-4 baseline, MF-5 chạy tay), phần để đợt sau      |
| `qd96-100-alignment/fe-batch/SPEC-PLAN-DOT-1.md`, `FIX-DOT-1.md` | Bước Đợt 1 nào được code (R1–R8, P1–P4, L1, G1–G3, bước 12b)                                                                               |
| Grep marker trong `src/`, `prisma/`, `docs/generated/routes.md`  | Kiểm code còn/hết: vd `/delegated-requests` 0, `accessBlockMode` 29 file, `finance-reviews` 0, `/purchase-invoices` 0, `ROLE_BASED` 0      |
| `qd103-108-alignment/README.md` §7                               | Bảng _Spec cũ chồng phạm vi_ do chat review lập 08/11 (item cũ → `qd103-*` thay thế)                                                       |
| `docs/decisions` của Docs (`project-decisions.md`)               | `QĐ-103g` giữ khung MF-2; `QĐ-103h` **bỏ** nhãn T1–T4, bước trưởng phòng mới rà soát, Request thay thế tự tạo                              |

Lưu ý: cột trạng thái bảng _Hạng mục_ của roadmap **cũ** ở nhiều chỗ (xem §8) nên không dùng làm bằng chứng duy nhất.

## 3. `docs/workspace/items/` — inventory và phân loại

### 3.1 Bảng gộp theo nhóm tiền tố

| Nhóm (số thư mục)                                                                                                                                                                                                                                                                                                                                                                                                                  | Phân loại                                     | Bằng chứng / ghi chú                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nền G0–G1 (9): `foundation-org-identity-boundary`, `us-01-*` ×5, `g0-g1-remediation-after-rereview`, `baseline-impact-and-remediation-2026-10-17`, `foundation-remediation-handoff-2026-10-18`                                                                                                                                                                                                                                     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` ×9                      | Roadmap `merged-dev`; 5 `us-01-*`, `baseline-impact…`, `foundation-org…`, `g0-g1-…` trong danh sách `legacy` của `rules-check.config.json`. `us-01-09` bị `qd93-remove-in-app-super-admin-transfer` gỡ một phần                             |
| H-series (20): `h1`…`h8`, `installation-local-data-h6-1-h6-2`, `operations-foundation-h6-3-h6-4-root1`, `gov1-gate2-…`, `final-foundation-hardening`, `beh1-…`                                                                                                                                                                                                                                                                     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` ×20                     | Roadmap `merged-dev`; `h7` được `src/infrastructure/database/database-role-judgement.ts` trích; `h4-2-project-capability` đã bị `qd93-remove-department-projects` gỡ code (ứng viên lưu trữ)                                                |
| G2 (12)                                                                                                                                                                                                                                                                                                                                                                                                                            | 11 `GIỮ-LỊCH-SỬ-ĐÃ-CODE`, 1 `CHƯA-CHẮC`       | `g2-downstream-integration` là khung `blocked` (§3.6). `g2-approval-roles`: người thay thế/dự phòng đã bị `qd93-remove-fallback-substitute-approvers` gỡ                                                                                    |
| G3 (17)                                                                                                                                                                                                                                                                                                                                                                                                                            | 16 `GIỮ-LỊCH-SỬ-ĐÃ-CODE`, 1 `CHƯA-CHẮC`       | `g3-downstream-finance-integration` khung `blocked` (§3.6)                                                                                                                                                                                  |
| G4 (6)                                                                                                                                                                                                                                                                                                                                                                                                                             | 3 `GIỮ-LỊCH-SỬ`, 2 `CHƯA-CHẮC`, **1 `XÓA`**   | `g4-provisioning-*`, `g4-seat-baseline-import` merged; `g4-notification-delivery` (`superseded`, legacy), `g4-request-and-transfer-integration` (khung) → §3.6; `g4-device-dependent-features` → §3.7                                       |
| G5 (25)                                                                                                                                                                                                                                                                                                                                                                                                                            | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` ×25                     | Roadmap `merged-dev`. Code đã bị gỡ một phần/toàn bộ: `g5-delegated-requests` (Đợt 1), `g5-budget-check-and-finance-review` + `g5-finance-information-request` (gói 3 qd103), lịch trả của `g5-request-amount-and-payment-schedule` (gói 2) |
| G6 (13)                                                                                                                                                                                                                                                                                                                                                                                                                            | 12 `GIỮ-LỊCH-SỬ-ĐÃ-CODE`, 1 `CHƯA-CHẮC`       | `g6-downstream-integration` khung `blocked`. `g6-transfer-tool-review`: code còn chạy nhưng `QĐ-103h` bỏ bước rà soát — đợt mf2-mf3 sẽ gỡ                                                                                                   |
| Remediation/read-contract/hardening (17): `api-list-detail-…`, `business-baseline-impact-2026-10-22`, `catalog-*` ×4, `licensing-*-read-contracts` ×2, `organization-identity-read-contracts`, `contract-document-upload-integrity`, `secret-and-upload-hardening`, `finance-reporting-currency-integrity`, `delivery-gate-hardening`, `g0-g4-checkpoint-fix-forward`, `g0-g6-final-business-baseline-remediation`, `openapi-*` ×2 | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` ×17                     | Roadmap `merged-dev`; nhiều mục là owner trong registry gate (`api-list-detail-…`, `catalog-*`, `licensing-*`, `organization-identity-…`, `g0-g6-final-…`) — **không được xóa** nếu chưa sửa registry                                       |
| Kiến trúc/test (5): `be-architecture-boundaries-restructure`, `be-architecture-readability-hardening`, `be-readability-debuggability-followup`, `be-test-architecture-redesign`, `ci-integration-shards`                                                                                                                                                                                                                           | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` ×5                      | Được `test/gates/module-layout.gate-spec.ts:7,450`, `.github/workflows/ci.yml:3`, `test/README.md`, ADR-0019 trích; `ci-integration-shards` commit `e2331f6e`, `cfea4eae`                                                                   |
| Dev A/B 31/10 (28): `a01`…`a10`, `b01`…`b04`                                                                                                                                                                                                                                                                                                                                                                                       | 20 `GIỮ-LỊCH-SỬ`, **5 `XÓA`**, 3 `CHƯA-CHẮC`  | Chi tiết §3.4                                                                                                                                                                                                                               |
| QĐ-93/95 + lẻ (17): `qd93-*` ×9, `qd95-*` ×2, `employee-directory-read`, `dashboard-request-queues-wiring`, `unified-seed-reset`, `shared-demo-dataset`, `ai-assist-queue-summary-be`, `finance-screens-api`                                                                                                                                                                                                                       | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` ×17                     | Commit task `qd93-*`/`qd95-*`/`unified-seed-reset`, `02f466ac` (danh bạ), `6f6058aa` (hàng đợi dashboard), PR #34 `491a0d6e` (Finance); seed v1/v3 đã được v4 thay                                                                          |
| QĐ-96→100 (33)                                                                                                                                                                                                                                                                                                                                                                                                                     | 15 `GIỮ-LỊCH-SỬ`, **13 `XÓA`**, 5 `CHƯA-CHẮC` | Chi tiết §3.3                                                                                                                                                                                                                               |
| `e2e-main-flows-suite`, `c1-contract-list-and-fields` (2)                                                                                                                                                                                                                                                                                                                                                                          | 1 `GIỮ-LỊCH-SỬ`, 1 `GIỮ-ĐỂ-SAU`               | Runner `test/config/jest.flows.cjs`, `test/flows/*` (PR #31; 33/69 kịch bản đỏ trên seed v4 theo `DEPLOY-READY`). `c1`: chưa có `GET`/`PATCH /contracts` → §3.5                                                                             |
| G7 (8)                                                                                                                                                                                                                                                                                                                                                                                                                             | 3 `GIỮ-LỊCH-SỬ`, **4 `XÓA`**, 1 `CHƯA-CHẮC`   | Chi tiết §3.5                                                                                                                                                                                                                               |
| `qd103-*` (41)                                                                                                                                                                                                                                                                                                                                                                                                                     | 27 `GIỮ-ĐANG-DÙNG`, 14 `GIỮ-ĐỂ-SAU`           | Chi tiết §3.2                                                                                                                                                                                                                               |
| `dynamic-content-translation` (1)                                                                                                                                                                                                                                                                                                                                                                                                  | `CHƯA-CHẮC`                                   | §3.6                                                                                                                                                                                                                                        |

### 3.2 `qd103-*` (41)

Tất cả đã vào `dev` qua PR #36 (`11051f28`) khi ghi "đã code". Gói theo `PLAN.md` §1 của mf1-mf4.

| Hạng mục                                                                                            | Đợt/gói               | Phân loại       | Bằng chứng                                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | --------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qd103-calendar-fiscal-year`, `qd103-shared-pool-subscription`                                      | W1                    | `GIỮ-ĐANG-DÙNG` | `d9c46552`, `aa1e56c1` (W1 PASS); test khẳng định `FISCAL_YEAR_START_MONTH` không còn                                                                    |
| `qd103-budget-cycle-ceilings`                                                                       | W2                    | `GIỮ-ĐANG-DÙNG` | `78d0babb`, `5fd5f594`, sửa `712044f9`, `d9e83c86`, `8419b869`                                                                                           |
| `qd103-department-effective-year`                                                                   | W2                    | `GIỮ-ĐANG-DÙNG` | `46b6a94e`, `bc10bd1c`, `1eb22695`; registry gate trỏ tới                                                                                                |
| `qd103-budget-baseline-annual-check`                                                                | W2 / gói 1            | `GIỮ-ĐANG-DÙNG` | `b7be3ae1`…`e56f6cd9`, `3e45d2d5`, `6f3a523f`; registry gate (8 chỗ)                                                                                     |
| `qd103-budget-proposal-lines-cleanup`                                                               | gói 5                 | `GIỮ-ĐANG-DÙNG` | `c21eea94`, `dd859684`, `6f60d2dc`, `22a290b1`; registry gate                                                                                            |
| `qd103-budget-views`                                                                                | gói 6                 | `GIỮ-ĐANG-DÙNG` | `904cd721`, `56cf952d`                                                                                                                                   |
| `qd103-request-amount-and-term`                                                                     | gói 2                 | `GIỮ-ĐANG-DÙNG` | `2213dc16`, `1ad141e8`, `9f7cf3c6`                                                                                                                       |
| `qd103-budget-check-three-outcomes`, `qd103-commitment-current-year`                                | gói 3                 | `GIỮ-ĐANG-DÙNG` | `f7aa0073`, `843cf143`, `375ece22`, `f3c2eccd`; registry gate; test `commitment-current-year`                                                            |
| `qd103-new-year-auto-commitments`                                                                   | gói 4                 | `GIỮ-ĐANG-DÙNG` | `42aa2e1f`, `ea56a38f`, `d86089fb`                                                                                                                       |
| `qd103-request-single-step-routing`                                                                 | gói 7                 | `GIỮ-ĐANG-DÙNG` | `f42a5f60`, `0667b677`, `cf11bda5`, `b385ca20`, `36ab4d41`                                                                                               |
| `qd103-request-limits-gh`                                                                           | gói 8                 | `GIỮ-ĐANG-DÙNG` | `bb4701ad` (`feat/mf1-rules`)                                                                                                                            |
| `qd103-renewal-request-window`                                                                      | gói 11                | `GIỮ-ĐANG-DÙNG` | `36a0fbac`                                                                                                                                               |
| `qd103-grant-from-shared-pool`                                                                      | gói 9                 | `GIỮ-ĐANG-DÙNG` | `f30da8d1`, `126f621f`, `461731ad`, `316ccbca`; registry gate                                                                                            |
| `qd103-commitment-release-on-revocation`                                                            | gói 9 (G9-02)         | `GIỮ-ĐANG-DÙNG` | `536717a3`; comment `revocation-completed-facts.service.ts`                                                                                              |
| `qd103-k4-key-pool`                                                                                 | gói 13                | `GIỮ-ĐANG-DÙNG` | `3128866d`; route `POST /license-keys/{id}/withdrawal`                                                                                                   |
| `qd103-request-history-by-role`                                                                     | gói 12 (phần)         | `GIỮ-ĐANG-DÙNG` | `c9eef40c`; route `/access-request-audit-flags`, `/departments/{id}/access-requests`                                                                     |
| `qd103-revocation-grace-notice`                                                                     | W6 (MF-5)             | `GIỮ-ĐANG-DÙNG` | `63fb7344`, `5e86f0a4`                                                                                                                                   |
| `qd103-vendor-usage-import`                                                                         | W6                    | `GIỮ-ĐANG-DÙNG` | `6381402d`, `50282a31`; registry gate (16 chỗ)                                                                                                           |
| `qd103-ghost-seat-g1-g2`, `qd103-ghost-seat-g3-g4`, `qd103-ghost-seat-manager-decision`             | W6                    | `GIỮ-ĐANG-DÙNG` | `94d2d20b`, `142e9c3f` · `d4864107`, `5184ce3a` · `c1fa97c7`, `c220fb4b`, `2aaf50e8`; `e5d906af`, `4c0e26d3`                                             |
| `qd103-seed-demo-v4`, `-mf1`, `-mf5`                                                                | W7 / gói 15           | `GIỮ-ĐANG-DÙNG` | `24d38e97`; `SEED-PROMPT.md` dòng 14 dùng cả ba spec                                                                                                     |
| `qd103-api-docs-regression`                                                                         | gói 15 (MF-Z)         | `GIỮ-ĐANG-DÙNG` | PLAN trỏ tới; tài liệu FE đã sinh lại (`APIDOCS-REPORT.md`, 381 operation) — dùng một phần                                                               |
| `qd103-purchase-invoice-sbf19`, `qd103-purchase-invoice-followups`                                  | gói 10 (chưa làm)     | `GIỮ-ĐỂ-SAU`    | Không có `/purchase-invoices`; `DEPLOY-READY` để đợt sau; AF-09. Áp delta SPEC §4 MF1-G (M-28, P1-11)                                                    |
| `qd103-role-based-access`                                                                           | gói 14 (chưa làm)     | `GIỮ-ĐỂ-SAU`    | Không có `ROLE_BASED` trong `src/`; A6 ghi `US-07-14` chưa làm                                                                                           |
| `qd103-mf1-followups`                                                                               | gói 12 phần còn lại   | `GIỮ-ĐỂ-SAU`    | Chưa có `GET /access-requests/drafts/{id}`, `/provisioning-tasks/{id}/invitation`, `windowOpensOn`                                                       |
| `qd103-mf5-followups`                                                                               | W8                    | `GIỮ-ĐỂ-SAU`    | Chưa xác minh từng vế (thông báo theo dõi lúc cấp, độ mới nguồn, kênh thư)                                                                               |
| `qd103-subscription-adjustment-point`, `-alerts-incidents`, `-close-kpi4-savings`                   | W5 (SBF-20, chưa làm) | `GIỮ-ĐỂ-SAU`    | Không có route điều chỉnh; `DEPLOY-READY` "điều chỉnh thuê bao, nhắc việc" để đợt sau; sẽ thay code `a06-*` + `qd96-100-subscription-owner-confirmation` |
| `qd103-remove-business-owner`                                                                       | W5 (một phần)         | `GIỮ-ĐỂ-SAU`    | Mới làm P2-05 (RV-26) + `de7bd810`; phần còn lại AF-17                                                                                                   |
| `qd103-seat-month-cost-pool-line`                                                                   | W5 (chưa làm)         | `GIỮ-ĐỂ-SAU`    | AF-11; `DEPLOY-READY` "chi phí seat-tháng"                                                                                                               |
| `qd103-budget-vs-actual-report`, `-period-cost-close`, `-savings-report`, `-role-dashboards-digest` | W8b `blocked` (Q-160) | `GIỮ-ĐỂ-SAU`    | Thiết kế theo QĐ-103→108, chờ Owner chọn gói; cần đối chiếu QĐ-109 trước khi code                                                                        |

### 3.3 `qd96-100-*` (33)

Đợt 1 = PR #31 (`aeb00f17`, commit gộp 792 file) + format `3cdbf622`. Cột roadmap của cả 33 mục vẫn ghi `not-started` (cũ).

| Hạng mục                                                                                  | Đợt 1 đã code?                      | Phân loại             | Ghi chú / thay bởi                                                                                                                  |
| ----------------------------------------------------------------------------------------- | ----------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `request-sender-rules`                                                                    | có (R2: gỡ `/delegated-requests`)   | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Luật trưởng phòng/nhóm sau đó do `qd103-request-single-step-routing` thay                                                           |
| `request-term-limit`                                                                      | có (R3)                             | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | `termMonths` 1..12 đã bị `qd103-request-amount-and-term` thay — ứng viên lưu trữ                                                    |
| `request-year-without-spend-date`                                                         | có (R4)                             | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Như trên                                                                                                                            |
| `remove-spend-override`                                                                   | có (R5)                             | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Phần còn lại do gói 3 qd103 gỡ                                                                                                      |
| `remove-budget-revision-and-high-value`                                                   | có (R6)                             | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` |                                                                                                                                     |
| `approved-end-date`, `renewal-chaining-and-window`                                        | có (R7, `extensionMonths`)          | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Thay bởi `qd103-request-amount-and-term`, `qd103-renewal-request-window`; comment `licensing.types.ts`                              |
| `annual-budget-reserve-and-floor`                                                         | có (R8, `reserveReason`)            | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Sàn cam kết bỏ theo QĐ-103                                                                                                          |
| `plan-line-removal-and-bm10-lines`                                                        | có (bước 12b)                       | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Không còn `plan-line-suggestions`                                                                                                   |
| `seed-demo-v3`                                                                            | có (R1 + `03382f92`)                | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Seed v3 đã được v4 thay (`shared-demo-v3` không còn trong `src/`) — ứng viên lưu trữ                                                |
| `departure-day-access-block`, `departure-block-now-mode`, `personnel-grounds-and-reasons` | có (P1–P3)                          | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | MF-2, vẫn đúng `QĐ-103g`; test `offboarding-access-block`, `offboarding-grounds-and-reasons` trích — tham khảo cho đợt mf2-mf3      |
| `transfer-review-defaults`                                                                | có (P4: bỏ `NEEDS_NEW_TOOL`)        | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | `QĐ-103h` bỏ bước rà soát ⟹ xóa sau khi đợt mf2-mf3 gỡ code                                                                         |
| `subscription-owner-confirmation`                                                         | có (L1)                             | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Trái QĐ-103e (kho dùng chung); code còn chạy, sẽ bị `qd103-subscription-adjustment-point` thay                                      |
| `budget-check-three-outcomes`                                                             | không                               | **`XÓA`** (Lô 2c)     | `qd103-budget-check-three-outcomes` (đã code)                                                                                       |
| `reserve-confirmation`                                                                    | không                               | **`XÓA`** (Lô 2c)     | Như trên (`POST …/reserve-confirmation` đã có)                                                                                      |
| `remove-finance-review-path`                                                              | không                               | **`XÓA`** (Lô 2b)     | Gói 3 qd103 đã gỡ `finance-reviews`                                                                                                 |
| `budget-visibility-qd100p`                                                                | không                               | **`XÓA`** (Lô 2c)     | `qd103-budget-views`                                                                                                                |
| `head-group-request-queue`                                                                | không                               | **`XÓA`** (Lô 2c)     | `qd103-request-single-step-routing`                                                                                                 |
| `spend-notifications`                                                                     | không                               | **`XÓA`** (Lô 2b)     | `qd103-budget-check-three-outcomes` + single-step (tracker §7)                                                                      |
| `sla-reminder-recipients`                                                                 | không                               | **`XÓA`** (Lô 2c)     | `qd103-request-single-step-routing` (tracker §7)                                                                                    |
| `revocation-deadline-and-withdraw`                                                        | không                               | **`XÓA`** (Lô 2c)     | `qd103-revocation-grace-notice` (đã code `timing`, `REASON_WITHDRAWN`)                                                              |
| `subscription-quantity-guard`                                                             | không                               | **`XÓA`** (Lô 1)      | Seat guard chuyển vào `qd103-subscription-adjustment-point`                                                                         |
| `subscription-lifecycle` (khung)                                                          | không                               | **`XÓA`** (Lô 2a)     | `qd103-subscription-close-kpi4-savings`; `US-11-06` `RETIRED`                                                                       |
| `renewal-milestones-and-recipients` (khung)                                               | không                               | **`XÓA`** (Lô 2a)     | QĐ-103 bỏ mốc ND; `qd103-subscription-alerts-incidents`                                                                             |
| `transfer-labels-and-overlap` (khung)                                                     | không                               | **`XÓA`** (Lô 2a)     | `QĐ-103h` bỏ nhãn T1–T4; `US-03-12` `RETIRED`                                                                                       |
| `transfer-replacement-request`                                                            | chỉ Task 0 (`reason`, cùng bước P4) | **`XÓA`** (Lô 2a)     | `QĐ-103h` bỏ Request thay thế tự tạo; vế đã code được ghi ở `transfer-review-defaults`                                              |
| `people-read-scope`, `account-org-api-fields`, `manager-employee-detail`                  | không                               | `CHƯA-CHẮC`           | Không bị QĐ-103 thay (tracker §7 "không chồng"); `loginEmail` vẫn tùy chọn ở DTO, chưa có route chi tiết nhân viên cho trưởng phòng |
| `catalog-api-fields`, `licensing-api-fields`                                              | không                               | `CHƯA-CHẮC`           | Bỏ phần BO/phòng sở hữu (QĐ-103); phần vệ sinh hợp đồng/thuế/NFC chưa ai nhận                                                       |

### 3.4 Dev A/B (28)

Code + spec cùng vào `dev` ở `e9530c9a` "A1-A10" (PR #19, merge `913575c2`); roadmap còn ghi "verified (local, chưa commit)".

| Hạng mục                                                                                                                       | Phân loại             | Ghi chú                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a01`, `a02`, `a03`, `a04`, `a07`, `a08`, `a09`, `a10-operational/manager/it-admin/super-admin-dashboard`, `b02`, `b03`, `b04` | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Route `/need-decisions`, `/me/access-requests`, `/assessment-queue`, `/me/software`, `dashboards/*` có; `a03` được 10 file `src/`, `test/` trích                       |
| `a05-k4-device-registry-contract`                                                                                              | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Code `src/modules/licensing/device-binding/` (`DeviceRegistryPort`) — **không module nào import** ngoài chính thư mục đó: ứng viên code chết cho đợt sau               |
| `a06-renewal-milestone-alerts`, `-proposal-decision`, `-execution-chain`, `-deadline-incident`                                 | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | `licensing/subscription-renewal/{alerts,proposal,decision,outcome,deadline}` còn chạy; Story `US-11-01/02/05` `RETIRED` — xóa sau khi `qd103-subscription-*` thay code |
| `b01-fiscal-year-start-lock`                                                                                                   | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Code đã bị `qd103-calendar-fiscal-year` gỡ (`parameter-definitions.policy.spec.ts:40`) — ứng viên lưu trữ                                                              |
| `a05-k4-key-grant-by-device`, `a05-k4-device-revocation`                                                                       | **`XÓA`** (2c, 2a)    | `blocked`, chưa code; `qd103-k4-key-pool` (đã code `3128866d`) thay — spec qd103 ghi rõ "spec cũ đọc tham khảo"                                                        |
| `a05-bm06-signature-record`                                                                                                    | **`XÓA`** (2a)        | `blocked`, chưa code; bản ký `BM-06` đã có ở `devices` (`signature-record.service.ts`, lát `g7-device-registry-acknowledgement`)                                       |
| `a06-renewal-usage-evidence`, `a06-renewal-open-inputs`                                                                        | **`XÓA`** (2c)        | "Khung, chưa code"; QĐ-103e đổi SBF-20; thay bởi `qd103-subscription-adjustment-point`/`-alerts-incidents`                                                             |
| `a05-k4-baseline-key-by-device`, `a05-k4-device-install-limit`                                                                 | `CHƯA-CHẮC`           | Thiết kế duy nhất cho phần K4 theo thiết bị còn thiếu (seat ban đầu K4, giới hạn số cài) — `qd103-k4-key-pool` ghi "ngoài phạm vi"                                     |
| `a10-background-jobs-board`                                                                                                    | `CHƯA-CHẮC`           | Khung `blocked`, chờ Owner định nghĩa "tác vụ nền cần chú ý"; không bị qd103 thay                                                                                      |

### 3.5 G7 (8), `c1`

| Hạng mục                                                                                      | Phân loại             | Ghi chú                                                                                                                  |
| --------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `g7-device-registry-acknowledgement`, `g7-device-credential-enrollment`, `g7-ai-usage-intake` | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Đợt 1 G1–G3: module `devices`, `sstd_`/`device-session`, `ai-usage-batches`; `g7-ai-usage-intake` là owner registry gate |
| `g7-vendor-usage-import-identity`                                                             | **`XÓA`** (2b)        | Spec dở, chưa code; `qd103-vendor-usage-import` (đã code) thay                                                           |
| `g7-vendor-usage-csv-template` (khung)                                                        | **`XÓA`** (2a)        | CSV mẫu đã nằm trong `qd103-vendor-usage-import` (`QĐ-101h`)                                                             |
| `g7-g1-g2-recommendations`                                                                    | **`XÓA`** (2b)        | `qd103-ghost-seat-g1-g2` (đã code)                                                                                       |
| `g7-g3-g4-decisions` (khung)                                                                  | **`XÓA`** (2a)        | `qd103-ghost-seat-g3-g4` + `qd103-ghost-seat-manager-decision` (đã code)                                                 |
| `g7-browser-usage-intake` (khung)                                                             | `CHƯA-CHẮC`           | Collector trình duyệt (SBF-05a "chờ nghiên cứu"), không bị qd103 thay                                                    |
| `c1-contract-list-and-fields`                                                                 | `GIỮ-ĐỂ-SAU`          | Owner duyệt thiết kế 05/11 (DESIGN §6); `US-04-13` chưa làm; cần đối chiếu QĐ-103/104 (bỏ BO, kho dùng chung)            |

### 3.6 Khung `blocked` G2–G6 và `dynamic-content-translation` (6, đều `CHƯA-CHẮC`)

| Hạng mục                              | Vì sao chưa chắc                                                                                              | Nếu xóa phải sửa                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `g2-downstream-integration`           | Khung chưa code, là đích `deferred`/`partial` của scope map                                                   | 2 dòng scope map G2; link ở `b01-…/spec.md:9`, `business-baseline-impact-…/spec.md:277`, `g2-department-profile/spec.md:11`, `g2-operating-parameters/spec.md:9`                           |
| `g3-downstream-finance-integration`   | Như trên (G8/G9 tài chính)                                                                                    | 17 dòng scope map                                                                                                                                                                          |
| `g4-request-and-transfer-integration` | Như trên                                                                                                      | 6 dòng scope map; link ở `g5-internal-software-path/spec.md:92`, `h7-…/spec.md:44`, `openapi-dialect-…/spec.md:42`, `docs/decisions/0015-requests-context.md:26`                           |
| `g6-downstream-integration`           | Như trên (G1–G4, chi phí theo ngày)                                                                           | 13 dòng scope map                                                                                                                                                                          |
| `g4-notification-delivery`            | `superseded` bởi `a03-license-inbox-alerts` nhưng còn là đích `deferred` `US-02-02` AC-17; nằm trong `legacy` | Bỏ khỏi `legacy` của `rules-check.config.json`; dòng scope map; link `g5-step-sla-and-alerts/spec.md:62`; nhắc ở `docs/rules/security-jobs.md:163` và 3 comment `src/modules/personnel/*`  |
| `dynamic-content-translation`         | Chưa từng vào BRD/US/sổ QĐ, spike âm tính, `blocked`; 3,2 MB                                                  | Bỏ khỏi `legacy`; `scripts/README.md:41-45` (2 link + lệnh); link `baseline-impact-…/spec.md:103,196`; xóa kèm review `dynamic-content-translation-2026-10-15` thì sửa `docs/README.md:85` |

### 3.7 Danh sách 23 thư mục `XÓA-ĐỀ-XUẤT`

| #   | Thư mục (`docs/workspace/items/`)            | File · dòng | Không dùng vì                              | Thay bởi                                      | Dòng index (README) | Dòng scope map | Lô  |
| --- | -------------------------------------------- | ----------- | ------------------------------------------ | --------------------------------------------- | ------------------- | -------------- | --- |
| 1   | `g4-device-dependent-features`               | 2 · 136     | `superseded` 31/10 sang `a05-*`, chưa code | `qd103-k4-key-pool`                           | 63                  | 0              | 1   |
| 2   | `qd96-100-subscription-quantity-guard`       | 2 · 204     | Draft Đợt 2+, không code                   | `qd103-subscription-adjustment-point`         | 205                 | 0              | 1   |
| 3   | `a05-bm06-signature-record`                  | 2 · 106     | `blocked`, chưa code                       | `g7-device-registry-acknowledgement`          | 69                  | 1              | 2a  |
| 4   | `a05-k4-device-revocation`                   | 2 · 141     | `blocked`, chưa code                       | `qd103-k4-key-pool`                           | 68                  | 3              | 2a  |
| 5   | `g7-g3-g4-decisions`                         | 2 · 112     | Khung, chưa code                           | `qd103-ghost-seat-g3-g4`, `-manager-decision` | 220                 | 7              | 2a  |
| 6   | `g7-vendor-usage-csv-template`               | 2 · 97      | Khung, chưa code                           | `qd103-vendor-usage-import`                   | 219                 | 3              | 2a  |
| 7   | `qd96-100-renewal-milestones-and-recipients` | 2 · 95      | Khung; QĐ-103 bỏ mốc ND                    | `qd103-subscription-alerts-incidents`         | 216                 | 1              | 2a  |
| 8   | `qd96-100-subscription-lifecycle`            | 2 · 100     | Khung; `US-11-06` `RETIRED`                | `qd103-subscription-close-kpi4-savings`       | 217                 | 1              | 2a  |
| 9   | `qd96-100-transfer-labels-and-overlap`       | 2 · 98      | Khung; `QĐ-103h` bỏ T1–T4                  | — (`US-03-12` `RETIRED`)                      | 215                 | 1              | 2a  |
| 10  | `qd96-100-transfer-replacement-request`      | 2 · 231     | `QĐ-103h` bỏ Request thay thế tự tạo       | —                                             | 206                 | 1              | 2a  |
| 11  | `g7-g1-g2-recommendations`                   | 3 · 369     | Spec dở, chưa code                         | `qd103-ghost-seat-g1-g2`                      | 214                 | 2              | 2b  |
| 12  | `g7-vendor-usage-import-identity`            | 4 · 722     | Spec dở, chưa code                         | `qd103-vendor-usage-import`                   | 213                 | 6              | 2b  |
| 13  | `qd96-100-remove-finance-review-path`        | 2 · 206     | Draft, không code                          | `qd103-budget-check-three-outcomes`           | 193                 | 1              | 2b  |
| 14  | `qd96-100-spend-notifications`               | 2 · 174     | Draft, không code                          | `qd103-budget-check-three-outcomes`           | 203                 | 1              | 2b  |
| 15  | `a05-k4-key-grant-by-device`                 | 2 · 139     | `blocked`, chưa code                       | `qd103-k4-key-pool`                           | 65                  | 3              | 2c  |
| 16  | `a06-renewal-open-inputs`                    | 2 · 131     | Khung, chưa code                           | `qd103-subscription-*`                        | 160                 | 8              | 2c  |
| 17  | `a06-renewal-usage-evidence`                 | 2 · 108     | Khung, chưa code                           | `qd103-subscription-adjustment-point`         | 159                 | 3              | 2c  |
| 18  | `qd96-100-budget-check-three-outcomes`       | 2 · 313     | Draft Đợt 2, không code                    | `qd103-budget-check-three-outcomes`           | 181                 | 6              | 2c  |
| 19  | `qd96-100-budget-visibility-qd100p`          | 2 · 196     | Draft Đợt 2, không code                    | `qd103-budget-views`                          | 182                 | 2              | 2c  |
| 20  | `qd96-100-head-group-request-queue`          | 2 · 218     | Draft Đợt 2, không code                    | `qd103-request-single-step-routing`           | 186                 | 4              | 2c  |
| 21  | `qd96-100-reserve-confirmation`              | 2 · 255     | Draft Đợt 2, không code                    | `qd103-budget-check-three-outcomes`           | 199                 | 5              | 2c  |
| 22  | `qd96-100-revocation-deadline-and-withdraw`  | 2 · 199     | Draft Đợt 3, không code                    | `qd103-revocation-grace-notice`               | 200                 | 3              | 2c  |
| 23  | `qd96-100-sla-reminder-recipients`           | 2 · 201     | Draft Đợt 3, không code                    | `qd103-request-single-step-routing`           | 202                 | 1              | 2c  |

Mỗi mục còn một dòng bảng _Hạng mục_ trong `docs/roadmap.md` (tìm `[<tên>](workspace/items/<tên>/spec.md)`). Nhiều spec đang
giữ (g3/g4/g5/g6, `qd103-*`, `a0x`) nhắc tên các mục này bằng backtick — **không** làm vỡ gate (checker chỉ kiểm link và
dạng `` `item-name` ``, không kiểm tồn tại), chỉ thành tên lịch sử.

## 4. `docs/reviews/` (21), `prompts/`, `research/`, `_template/`

| Mục                                                | File · dòng | Phân loại             | Bằng chứng / tham chiếu vào                                                                                                                                                 |
| -------------------------------------------------- | ----------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mf1-mf4-reaudit-2026-11-09/`                      | 14 · 1 920  | `GIỮ-ĐANG-DÙNG`       | SPEC/PLAN đợt MF-1/4/5 đã code; roadmap + `qd103-new-year-auto-commitments` link tới. `CODER-PROMPT*`, `HANDOFF*`, `PROGRESS` là file làm việc (có thể gộp, không bắt buộc) |
| `qd103-108-alignment-2026-11-08/`                  | 6 · 1 760   | `GIỮ-ĐANG-DÙNG`       | 38 file đang kiểm link tới (roadmap, index, spec `qd103-*`); SPEC mf1-mf4 §6 giữ các câu TẠM CHỌN trong `QUESTIONS.md`; §7 là bảng thay thế dùng cho dọn dẹp này            |
| `mf2-mf3-2026-11-10/`                              | đang làm    | `GIỮ-ĐANG-DÙNG`       | Không audit                                                                                                                                                                 |
| `backend-baseline-review.md`                       | 1 · 64      | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Nằm trong `files` của `rules-check.config.json` và lệnh `rules:format` — **bắt buộc giữ**                                                                                   |
| `be-architecture-test-acceptance-2026-10-29/`      | 3 · 494     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | README nằm trong `rules-check.config.json` — **bắt buộc giữ**; ADR-0019, `runtime-details.md` link tới                                                                      |
| `be-api-manual-verification-2026-10-20/`           | 1 · 359     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | `docs/README.md` link                                                                                                                                                       |
| `be-architecture-readability-review-2026-10-30/`   | 1 · 345     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | roadmap, index, 2 spec link                                                                                                                                                 |
| `be-architecture-review-2026-11-01/`               | 1 · 77      | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | roadmap link                                                                                                                                                                |
| `be-foundation-audit-2026-10-18/`                  | 1 · 528     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | 26 file link (README gốc, `docs/workspace/README.md`, ADR-0011…)                                                                                                            |
| `be-full-src-architecture-audit-2026-10-19/`       | 2 · 628     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | 19 file link (ADR-0001/0003/0013/0014…)                                                                                                                                     |
| `cp0-h1-h3c-checkpoint-review-2026-10-19/`         | 2 · 322     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | 5 file link                                                                                                                                                                 |
| `g0-g1-remediation-2026-10-15/`                    | 2 · 491     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | 12 file link                                                                                                                                                                |
| `g0-g4-post-merge-review-2026-10-22/`              | 2 · 861     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | 22 file link                                                                                                                                                                |
| `g0-g6-final-business-baseline-review-2026-10-26/` | 1 · 669     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | roadmap, `g0-g6-final-…` link                                                                                                                                               |
| `g2-g4-completion-2026-10-21/`                     | 1 · 111     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | 18 file link                                                                                                                                                                |
| `g7-usage-design-2026-11-05/`                      | 3 · 348     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | DESIGN của lát G7 đã code (S1a/S1b/S2a) và của `c1` (ĐỂ-SAU); 11 file link                                                                                                  |
| `qd93-delivery-2026-11-03/`                        | 47 · 3 646  | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Hồ sơ QĐ-93 đã code; `prompts/` bên trong là prompt đã chạy (có thể tỉa, không bắt buộc)                                                                                    |
| `qd95-delivery-2026-11-04/`                        | 4 · 560     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Hồ sơ QĐ-95 đã code; không file đang kiểm nào link tới (lưu trữ được nếu Owner muốn)                                                                                        |
| `qd96-100-alignment-2026-11-05/`                   | 34 · 9 301  | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Tracker của Đợt 1 đã code; 22 file link (roadmap: `C-REVIEW`, `REGISTRATION`; `e2e` spec: `BRIEF`). **Tỉa** `fe-batch/SPEC-PLAN-DOT-2-4.md` (Lô 1)                          |
| `roadmap-and-api-gaps-2026-10-31/`                 | 3 · 450     | `GIỮ-LỊCH-SỬ-ĐÃ-CODE` | Kế hoạch Dev A/B (đã code PR #19); 19 file link                                                                                                                             |
| `dynamic-content-translation-2026-10-15/`          | 2 · 283     | `CHƯA-CHẮC`           | Đi cùng item `dynamic-content-translation`; `docs/README.md:85` link                                                                                                        |
| `docs/workspace/prompts/` (7 file)                 | 7           | `GIỮ-ĐANG-DÙNG`       | `AGENTS.md`, `docs/workspace/README.md`, `docs/README.md` link — quy trình giao việc                                                                                        |
| `docs/workspace/research/README.md`                | 1           | `GIỮ-ĐANG-DÙNG`       | Hướng dẫn nghiên cứu, `workspace/README.md` nhắc                                                                                                                            |
| `docs/workspace/_template/` (5 file)               | 5           | `GIỮ-ĐANG-DÙNG`       | Template                                                                                                                                                                    |

## 5. Tham chiếu vào và tác động gate

### 5.1 Tóm tắt theo gate

| Gate / nơi                                                                                                      | Ảnh hưởng khi xóa 23 mục `XÓA`                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:gates` — `test/gates/api-collection-contract.gate-spec.ts:298,501,559,589`                           | Kiểm `owner`/`item` trong `test/support/api-collection-registry-*.ts` có `docs/workspace/items/<x>/spec.md`. **Không mục XÓA nào có trong registry** ⟹ không vỡ                                                                                |
| `test/gates/module-layout.gate-spec.ts`, `.github/workflows/ci.yml`, `test/support/openapi-example-manifest.ts` | Chỉ comment trỏ `be-architecture-boundaries-restructure`, `be-readability-debuggability-followup`, `be-test-architecture-redesign`, `openapi-response-examples` (đều giữ)                                                                      |
| `pnpm rules:check` — đăng ký index                                                                              | Mỗi thư mục phải có dòng `(<tên>/spec.md)` trong `docs/workspace/items/README.md` và ngược lại link index phải tồn tại ⟹ bỏ 23 dòng index cùng lúc                                                                                             |
| `pnpm rules:check` — link trong file được kiểm                                                                  | Chỉ có: 23 dòng index, 23 dòng bảng _Hạng mục_ roadmap, và `g7-vendor-usage-csv-template/spec.md:40` → `g7-vendor-usage-import-identity` (cả hai đều xóa; xóa 2a trước hoặc cùng 2b)                                                           |
| `pnpm rules:check` — scope map roadmap                                                                          | **63 dòng** G3–G8 có mục XÓA làm owner/đích ⟹ lỗi "`x` is not a registered work item" (24 lỗi nếu không sửa — §5.2). Phân loại sửa ở §5.3                                                                                                      |
| `pnpm rules:check` — `legacy`/`sizingGrandfathered`                                                             | Không mục XÓA nào trong hai danh sách (chỉ CHƯA-CHẮC `dynamic-content-translation`, `g4-notification-delivery`)                                                                                                                                |
| `pnpm rules:format`                                                                                             | Sửa ô bảng roadmap ⟹ chạy `pnpm exec prettier --write docs/roadmap.md docs/workspace/items/README.md` trước khi kiểm (mô phỏng: sau `--write` xanh)                                                                                            |
| `src/`                                                                                                          | Chỉ comment `src/modules/licensing/device-binding/device-binding.policy.spec.ts:16-17` nhắc `a05-k4-key-grant-by-device`, `a05-k4-device-revocation` (không vỡ; sửa khi Owner cho sửa `src/`)                                                  |
| `docs/reviews/*` (không bị checker kiểm)                                                                        | Link chết sẽ sinh ra: `qd96-100-alignment/fe-batch/SPEC-PLAN-DOT-1.md:29` → `transfer-replacement-request`; `g0-g4-post-merge-review/README.md:507` → `g4-device-dependent-features`; 14 link trong `SPEC-PLAN-DOT-2-4.md` (file này cũng xóa) |

### 5.2 Mô phỏng `rules:check` trên bản sao (không chạm repo)

Bản sao working tree (trừ `node_modules`, `.git`, `dist`, `.models`, `.claude`) ở scratchpad, chạy `node scripts/check-rules.mjs`:

| Kịch bản                                                                     | Kết quả                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Gốc (ảnh chụp, gồm sửa roadmap đang dở của A6)                               | `BE: 606 files, 4215 links, 0 errors`                                                |
| Lô 1: xóa 2 thư mục + 2 dòng index + 2 dòng roadmap + `SPEC-PLAN-DOT-2-4.md` | `0 errors`; prettier `--check` xanh                                                  |
| Xóa cả 23 thư mục + dòng index/roadmap, **không** sửa scope map              | `24 errors` (mỗi mục × nhóm G: owner chưa đăng ký)                                   |
| Lô 1 + 2a + 2b (14 thư mục) + sửa 28 dòng scope map như §5.3                 | `575 files, 4066 links, 0 errors`; prettier: cảnh báo ở roadmap → sau `--write` xanh |
| 23 thư mục + sửa 41 dòng dễ, 22 dòng `partial` còn lại để nguyên             | `9 errors` — đúng 9 mục Lô 2c                                                        |
| Như trên nhưng đổi `partial` sang `qd103-*` làm người giữ phần còn lại       | `41 errors` "`qd103-…` spec does not claim … mapped to it" ⟹ cần re-pin              |

### 5.3 63 dòng scope map phải sửa (khóa Story/AC, ổn định khi roadmap đổi dòng)

**Lô 2a — 18 dòng, chỉ đổi đích `deferred` hoặc bỏ tên khỏi danh sách còn lại:**

| G   | Story / AC                                                                                            | Hiện tại                                                                                    | Sửa tối thiểu                                                |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| G3  | `US-04-04` AC-8                                                                                       | deferred → `a05-bm06-signature-record`                                                      | deferred → `g7-device-registry-acknowledgement`              |
| G3  | `US-04-12` AC-7, AC-8                                                                                 | deferred → `a05-k4-device-revocation`                                                       | deferred → `qd103-k4-key-pool`                               |
| G6  | `US-07-05` AC-6, AC-7                                                                                 | deferred → `a05-k4-device-revocation`                                                       | deferred → `qd103-k4-key-pool`                               |
| G6  | `US-03-04` AC-16                                                                                      | partial, còn lại `g6-downstream-integration`, `a05-k4-device-revocation`                    | bỏ `a05-k4-device-revocation`                                |
| G6  | `US-03-07` AC-3                                                                                       | partial, còn lại `g6-downstream-integration`, `qd96-100-transfer-replacement-request`       | bỏ `qd96-100-transfer-replacement-request` (Story `RETIRED`) |
| G6  | `US-03-12` AC-1→AC-4, AC-7→AC-10, AC-12, AC-13                                                        | deferred → `qd96-100-transfer-labels-and-overlap`                                           | `not affected`, lý do `RETIRED` (`QĐ-103h`)                  |
| G7  | `US-08-01` AC-1→AC-5, AC-7; `US-08-02` AC-7; `US-08-03` AC-2                                          | deferred → `g7-vendor-usage-csv-template`                                                   | deferred → `qd103-vendor-usage-import` (3 dòng)              |
| G7  | `US-08-02` AC-4; `US-08-03` AC-4; `US-08-04` AC-2; `US-08-07` AC-1, AC-2, AC-4; `US-09-05` AC-5, AC-7 | deferred → `g7-g3-g4-decisions`                                                             | deferred → `qd103-ghost-seat-g3-g4` (5 dòng)                 |
| G7  | `US-10-05` AC-1, AC-3, AC-4, AC-6                                                                     | deferred → `g7-g3-g4-decisions`                                                             | deferred → `qd103-ghost-seat-manager-decision`               |
| G7  | `US-09-05` AC-1                                                                                       | partial, còn lại `g7-browser-usage-intake`, `g7-g3-g4-decisions`                            | bỏ `g7-g3-g4-decisions`                                      |
| G8  | `US-11-06` AC-8; `US-11-06` AC-15, AC-16                                                              | deferred → `qd96-100-renewal-milestones-and-recipients` / `qd96-100-subscription-lifecycle` | `not affected`, lý do `RETIRED` (`QĐ-103e`) (2 dòng)         |

**Lô 2b — 10 dòng `full` của mục bị xóa → `deferred` (đích `qd103-*`, lý do "đã code ở `qd103-…` — technical-enabler, chưa
claim AC; chờ re-pin"):** G7 `US-08-01` AC-8, `US-08-02` AC-1→AC-3, AC-5, AC-6, `US-08-03` AC-1, AC-3, `US-08-04` AC-1,
AC-3→AC-7, `US-08-05` AC-1→AC-6, `US-08-07` AC-3 (→ `qd103-vendor-usage-import`); G7 `US-10-01` AC-1→AC-10, `US-10-05` AC-2,
AC-5, AC-7, AC-8 (→ `qd103-ghost-seat-g1-g2`); G5 `US-06-12` AC-25 và G8 `US-12-15` AC-30 (→ `qd103-budget-check-three-outcomes`).
Sửa thêm chữ ở cột lý do của `US-08-01` AC-9 và `US-09-05` AC-6 (nhắc `g7-vendor-usage-import-identity`). Checker chấp nhận
(dòng `deferred` không bắt đích claim AC), nhưng nghĩa "deferred" cho việc đã code là tạm — xem câu hỏi Q2.

**Lô 2c — 35 dòng, cần re-pin** (22 dòng `partial` mà mục bị xóa là người giữ phần còn lại duy nhất hoặc là owner; checker
bắt người giữ phần còn lại phải claim AC trong spec, `qd103-*` hiện không claim):

| Hạng mục                                    | Dòng (G · Story / AC)                                                                                                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a05-k4-key-grant-by-device`                | G3 `US-04-12` AC-5, AC-6 (deferred) · G4 `US-07-01` AC-10 (deferred) · G4 `US-07-02` AC-4 (partial, owner `g4-provisioning-queue-manual`)                                                                                                      |
| `a06-renewal-open-inputs`                   | G8 `US-11-01` AC-12 · `US-11-02` AC-4, 5, 9, 14 · `US-11-02` AC-7, 11, 12, 16, 21 (deferred) · `US-11-03` AC-7→AC-10, AC-19 · `US-11-04` AC-3 · `US-11-04` AC-5, AC-10→AC-13 (deferred) · `US-11-05` AC-2 · `US-11-05` AC-16, AC-18 (deferred) |
| `a06-renewal-usage-evidence`                | G8 `US-11-01` AC-3 · `US-11-02` AC-20 · `US-11-05` AC-4 (cả ba Story `RETIRED`)                                                                                                                                                                |
| `qd96-100-budget-check-three-outcomes`      | G5 `US-06-01` AC-3, 9, 14, 18, 19, 21 · `US-06-12` AC-1, 4, 5, 8, 9, 14, 15, 19 · `US-06-12` AC-10 (bỏ tên được) · `US-06-12` AC-20, 23, 24 (full) · `US-06-14` AC-9 · `US-06-14` AC-8                                                         |
| `qd96-100-budget-visibility-qd100p`         | G5 `US-06-10` AC-7 · `US-06-12` AC-26 (full)                                                                                                                                                                                                   |
| `qd96-100-head-group-request-queue`         | G5 `US-05-17` AC-21 (owner) · `US-06-01` AC-7 · `US-06-14` AC-5 (bỏ tên được) · `US-06-14` AC-6                                                                                                                                                |
| `qd96-100-reserve-confirmation`             | G5 `US-06-01` AC-1 · `US-06-01` AC-24 (full) · `US-06-14` AC-12 · `US-06-14` AC-13 (bỏ tên được) · `US-06-16` AC-1→AC-9 (full)                                                                                                                 |
| `qd96-100-revocation-deadline-and-withdraw` | G5 `US-05-13` AC-3 · G6 `US-03-04` AC-31 (full) · G6 `US-07-05` AC-22 (full)                                                                                                                                                                   |
| `qd96-100-sla-reminder-recipients`          | G5 `US-05-09` AC-1, AC-4                                                                                                                                                                                                                       |

Story `RETIRED` (A6, Docs `5bb2e6a`) trong Lô 2c: `US-11-01`, `US-11-02`, `US-11-05` — khi re-pin đổi `not affected`, nhưng
spec đang giữ (`a06-renewal-milestone-alerts`, `-proposal-decision`, `-execution-chain`, `-deadline-incident`) đang claim các
khóa này ⟹ phải sửa bảng Primary của chúng cùng lúc (checker phía hạng mục bắt mọi khóa claim phải có trong scope map).

## 6. Kế hoạch xóa (chưa thực hiện)

Mỗi lô là một commit Docs riêng trong repo BE (nhánh do Owner chọn). Sau mỗi lô: `pnpm exec prettier --write docs/roadmap.md
docs/workspace/items/README.md`, rồi `pnpm rules:check` + `pnpm rules:format` (kỳ vọng 0 lỗi); `pnpm test:gates` không cần
cho Lô 1–2b (registry không chạm) nhưng chạy được nếu Owner muốn. **Phối hợp với A6:** cùng sửa `docs/roadmap.md` ⟹ chạy sau
khi A6 xong.

### Lô 1 — ngay, không chạm scope map (đã mô phỏng 0 lỗi)

```bash
git rm -r docs/workspace/items/g4-device-dependent-features docs/workspace/items/qd96-100-subscription-quantity-guard
git rm docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/SPEC-PLAN-DOT-2-4.md
```

| File cần sửa                                                                     | Sửa                                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `docs/workspace/items/README.md:63`, `:205`                                      | Bỏ dòng                                                                              |
| `docs/roadmap.md` bảng _Hạng mục_ (dòng của hai mục)                             | Bỏ dòng                                                                              |
| `docs/reviews/g0-g4-post-merge-review-2026-10-22/README.md:507`                  | Link → chữ `` `g4-device-dependent-features` `` (đã xóa 10/11/2026, xem git history) |
| `docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/PROMPT-FE-DOCS-DOT-1.md:16` | Tùy chọn: ghi "(đã xóa 10/11/2026)" sau tên `SPEC-PLAN-DOT-2-4.md`                   |

Ước tính: 5 file, 721 dòng xóa; 2 dòng index, 2 dòng roadmap.

### Lô 2a — 8 thư mục, sửa 18 dòng scope map dạng đổi đích (không cần re-pin)

```bash
git rm -r docs/workspace/items/a05-bm06-signature-record docs/workspace/items/a05-k4-device-revocation \
  docs/workspace/items/g7-g3-g4-decisions docs/workspace/items/g7-vendor-usage-csv-template \
  docs/workspace/items/qd96-100-renewal-milestones-and-recipients docs/workspace/items/qd96-100-subscription-lifecycle \
  docs/workspace/items/qd96-100-transfer-labels-and-overlap docs/workspace/items/qd96-100-transfer-replacement-request
```

Sửa: 8 dòng index (69, 68, 220, 219, 216, 217, 215, 206); 8 dòng bảng _Hạng mục_ roadmap; 18 dòng scope map (§5.3 Lô 2a);
`docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/SPEC-PLAN-DOT-1.md:29` link → chữ (đã xóa). Tùy chọn (`src/`, cần Owner
cho phép): comment `device-binding.policy.spec.ts:17`. Ước tính: 16 file, 980 dòng.

### Lô 2b — 4 thư mục, 10 dòng `full` → `deferred` (cần Owner đồng ý Q2)

```bash
git rm -r docs/workspace/items/g7-g1-g2-recommendations docs/workspace/items/g7-vendor-usage-import-identity \
  docs/workspace/items/qd96-100-remove-finance-review-path docs/workspace/items/qd96-100-spend-notifications
```

Sửa: 4 dòng index (214, 213, 193, 203); 4 dòng roadmap; 10 dòng scope map + chữ ở 2 dòng lý do (§5.3 Lô 2b). Chạy cùng
hoặc sau Lô 2a (link `g7-vendor-usage-csv-template` → `g7-vendor-usage-import-identity`). Ước tính: 11 file, 1 471 dòng.
Mô phỏng Lô 1 + 2a + 2b: 0 lỗi.

### Lô 2c — 9 thư mục, chỉ cùng lượt re-pin scope map G3–G8 theo Docs `5bb2e6a` (QĐ-109)

```bash
git rm -r docs/workspace/items/a05-k4-key-grant-by-device docs/workspace/items/a06-renewal-open-inputs \
  docs/workspace/items/a06-renewal-usage-evidence docs/workspace/items/qd96-100-budget-check-three-outcomes \
  docs/workspace/items/qd96-100-budget-visibility-qd100p docs/workspace/items/qd96-100-head-group-request-queue \
  docs/workspace/items/qd96-100-reserve-confirmation docs/workspace/items/qd96-100-revocation-deadline-and-withdraw \
  docs/workspace/items/qd96-100-sla-reminder-recipients
```

Điều kiện: re-pin xong 35 dòng (§5.3 Lô 2c) theo một trong hai cách — (a) spec `qd103-*` thay thế claim AC (đổi Primary
Story/AC, Container, link scope map; bỏ `technical-enabler`), hoặc (b) Story `RETIRED` → `not affected` và sửa Primary của
spec đang giữ. Sửa thêm 9 dòng index (65, 160, 159, 181, 182, 186, 199, 200, 202), 9 dòng roadmap, comment
`device-binding.policy.spec.ts:16`. Ước tính: 18 file, 1 760 dòng.

### Lô 3 — chỉ khi Owner trả lời CHƯA-CHẮC (§9 Q4)

| Mục                                                                                                                                 | File · dòng  | Việc kèm theo                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `qd96-100-people-read-scope`, `-account-org-api-fields`, `-manager-employee-detail`, `-catalog-api-fields`, `-licensing-api-fields` | 10 · 828     | Không có dòng scope map: chỉ bỏ 5 dòng index (190, 177, 189, 183, 188) + 5 dòng roadmap (link từ `SPEC-PLAN-DOT-2-4.md` đã đi ở Lô 1) |
| `a05-k4-baseline-key-by-device`, `a05-k4-device-install-limit`, `a10-background-jobs-board`                                         | 6 · 328      | 3 dòng scope map (`US-02-05` AC-11 partial, `US-04-11` AC-10 deferred, `US-12-15` AC-7 partial)                                       |
| `g7-browser-usage-intake`                                                                                                           | 2 · 98       | 4 dòng scope map G7 (`US-08-01` AC-6, `US-09-02` AC-1→AC-6, `US-09-05` AC-1, `US-09-05` AC-4…)                                        |
| `dynamic-content-translation` + `reviews/dynamic-content-translation-2026-10-15/`                                                   | 219 · 65 233 | Bỏ khỏi `legacy`; sửa `scripts/README.md:41-45`, `docs/README.md:85`, `baseline-impact-…/spec.md:103,196`                             |
| `g4-notification-delivery`, `g2/g3/g4/g6-downstream-*`                                                                              | 10 · 664     | Chỉ cùng re-pin (39 dòng scope map) + bỏ `legacy` + link trong 8 spec/ADR (§3.6)                                                      |

## 7. Ngoài repo BE / git (chỉ liệt kê, không đụng)

| Đối tượng                                                                                         | Hiện trạng                                                                                                                                                                                                                                                                                                                                                                                                            | Đề xuất                                                                                                      |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `D:\FPT\FALL2026\Code\mf1-mf4-handoff\` (6 file `.md`, 698 dòng)                                  | Báo cáo chốt đợt MF-1/4/5 (đã merge PR #36); A6 và file này trích dẫn                                                                                                                                                                                                                                                                                                                                                 | Chép vào `docs/reviews/mf1-mf4-reaudit-2026-11-09/handoff/` rồi xóa thư mục ngoài, hoặc giữ tới hết mf2-mf3  |
| Worktree                                                                                          | `git worktree list` chỉ còn repo chính; `be-review`, `be-mf5`, `be-seed` không còn trong `D:\FPT\FALL2026\Code`                                                                                                                                                                                                                                                                                                       | Không còn gì                                                                                                 |
| `.claude/worktrees/agent-a4ed34b5070192240`, `agent-acf54cd5caae12394`, `agent-af2053b0f6b5aaba8` | 3 gitlink (mode 160000 → `6eb12d19`) bị commit ở `e9530c9a`/`fc75f31c`; working tree đang `D`; `.gitignore:16` ghi `claude/worktrees/` thiếu dấu chấm                                                                                                                                                                                                                                                                 | `git rm --cached` 3 gitlink + sửa `.gitignore` thành `.claude/worktrees/` (thay đổi ngoài docs, Owner quyết) |
| Nhánh local đã merge vào `origin/dev` (14)                                                        | `feat/base-feature-architecture`, `feat/ci-integration-shards`, `feat/qd93-remaining`, `feat/qd95-one-role-per-account`, `feat/qd95-self-service-every-role`, `feat/qd96-100-alignment`, `feat/seed-super-admin-email`, `feat/unified-seed-reset`, `fix/ci-cli-lock-wait`, `fix/ci-integration`, `fix/g0-g1-remediation-2026-10-15`, `fix/qd93-remaining-audit`, `fix/qd95-seed-audit`, `refactor/readability-round2` | `git branch -d …`; `master` local cũng đã merge và không có `origin/master` — hỏi Owner                      |
| Nhánh local chưa merge (3)                                                                        | `ci-trial/deploy-gate` (`f7156cc7`, nhánh thử deploy gate đỏ), `feat/native-schema` (`d186d78a`, 07/10), `feat/qd93-unplaced-employee-first-placement` (`1a832509` "wip: abandoned … superseded by lean fix")                                                                                                                                                                                                         | `git branch -D` sau khi Owner xác nhận                                                                       |
| Nhánh remote đã merge (11)                                                                        | `feat/qd96-100-alignment`, `feat/seed-super-admin-email`, `feat/unified-seed-reset`, `fix/ci-cli-lock-wait`, `fix/ci-e2e-head-own`, `fix/ci-integration`, `fix/ci-integration-timeout`, `fix/qd93-final`, `fix/qd93-remaining-audit`, `fix/qd95-seed-audit`, `fix/review-mf145`                                                                                                                                       | `git push origin --delete …` (Owner); chưa merge: `Bao_dev_be`, `review-2`, `test`                           |

## 8. Phát hiện phụ (chuyển A6 / đợt mf2-mf3)

1. Trạng thái bảng _Hạng mục_ roadmap cũ: `qd93-*` ×9, `qd95-*` ×2, `unified-seed-reset`, `ci-integration-shards`,
   `employee-directory-read`, `dashboard-request-queues-wiring` ghi `not-started` dù đã merge; 15 `qd96-100-*` Đợt 1,
   `g7-device-*` ×2, `g7-ai-usage-intake`, `e2e-main-flows-suite` ghi `not-started` dù đã code ở PR #31; 20 mục A/B ghi
   "local, chưa commit" dù đã merge PR #19. 41 `qd103-*` không có dòng (A6 đã ghi chú).
2. Code chết tiềm năng: `src/modules/licensing/device-binding/` (không module nào import).
3. Code của luật đã `RETIRED` còn chạy: `licensing/subscription-renewal/*` (`a06-*`, `qd96-100-subscription-owner-confirmation`),
   rà soát sau điều chuyển (`g6-transfer-tool-review`, `qd96-100-transfer-review-defaults`) — gỡ ở đợt sau thì các spec
   lịch sử tương ứng mới nên xóa.
4. `docs/workspace/README.md` (mục _Chia hạng mục_): "lịch sử giữ bằng Git và nhãn _superseded_, không xóa bằng chứng".
   Các mục XÓA không chứa bằng chứng implementation (chưa code), nên xóa không trái tinh thần quy tắc; commit nên ghi rõ
   "xóa spec không dùng — xem `A5-DOCS-CLEANUP.md`" để truy được.

## 9. Câu hỏi cần Owner xác nhận

1. **Q1** — Cho chạy Lô 1 + Lô 2a ngay (10 thư mục + 1 file review; 18 dòng scope map chỉ đổi đích/bỏ tên; mô phỏng Lô 1
   riêng và Lô 1 + 2a + 2b gộp đều 0 lỗi — Lô 2a riêng chưa mô phỏng tách, cần chạy `pnpm rules:check` khi làm)?
2. **Q2** — Lô 2b: chấp nhận tạm đổi 10 dòng `full` → `deferred` (đích `qd103-*` đã code) cho tới re-pin, hay gộp 4 mục này
   vào Lô 2c?
3. **Q3** — Re-pin scope map G3–G8 theo Docs `5bb2e6a`: làm ngay trong đợt mf2-mf3 hay sau? Chọn cách (a) `qd103-*` claim
   AC (bỏ `technical-enabler`) hay (b) Story `RETIRED` → `not affected` + phần đã code để `deferred`?
4. **Q4** — 15 mục CHƯA-CHẮC:
   - `qd96-100-people-read-scope` (6 response lộ dữ liệu nhân sự vượt vai, `QĐ-41c`), `-account-org-api-fields`
     (`loginEmail`, tạo tài khoản không vai SA/Người duyệt chi), `-manager-employee-detail` (màn chi tiết nhân viên cho
     trưởng phòng): còn cần? đợt mf2-mf3 nhận hay xóa?
   - `qd96-100-catalog-api-fields`, `-licensing-api-fields`: phần vệ sinh API không dính BO/phòng sở hữu còn làm?
   - `a05-k4-baseline-key-by-device`, `a05-k4-device-install-limit`: K4 theo thiết bị phần còn lại còn trong phạm vi?
   - `a10-background-jobs-board`: bỏ mục "tác vụ nền" trên dashboard Super Admin hay giữ chờ định nghĩa?
   - `g7-browser-usage-intake`: collector trình duyệt (SBF-05a) còn làm?
   - `dynamic-content-translation` (+ review): bỏ hẳn tính năng dịch EN↔VI (chưa từng vào BRD/US, spike âm tính)?
   - `g4-notification-delivery`, `g2/g3/g4/g6-downstream-*`: xử lý cùng re-pin?
5. **Q5** — Ngoài repo: chép `mf1-mf4-handoff\` vào repo rồi xóa? Gỡ 3 gitlink `.claude/worktrees` + sửa `.gitignore`? Xóa
   14 nhánh local + 11 nhánh remote đã merge và 3 nhánh local chưa merge? `master` local?
6. **Q6** — Lưu trữ (xóa) các mục `GIỮ-LỊCH-SỬ` mà code đã bị gỡ hoàn toàn (`b01-fiscal-year-start-lock`,
   `h4-2-project-capability`, `g5-delegated-requests`, `g5-finance-information-request`, `qd96-100-seed-demo-v3`,
   `qd96-100-request-term-limit`…)? Mặc định của báo cáo này: **giữ**.

## 10. Kiểm chứng đã chạy và giới hạn

- Lệnh đã chạy (chỉ đọc): `git branch --show-current`, `git log --oneline origin/dev` (+ `--grep`, `--diff-filter=A
--name-only -- docs/workspace/items`, `<merge>^1..<merge>^2` cho PR #31/#33/#34), `git show --stat aeb00f17 3cdbf622
e9530c9a`, `git ls-files -s .claude`, `git branch --merged/--no-merged origin/dev` (local + `-r`), `git worktree list`,
  `git status --short`; grep tên 254 thư mục trong `src test scripts prisma .github package.json rules-check.config.json`
  và mọi `*.md`; grep link `](…<tên>/` (lọc theo đường dẫn file, không theo nội dung dòng).
- `node scripts/check-rules.mjs` + `prettier --check/--write` (binary của repo) **trên bản sao ở scratchpad**, kết quả §5.2.
  Repo thật không đổi: `git status` sau cùng chỉ có `docs/roadmap.md` (A6 sửa), thư mục `mf2-mf3-2026-11-10/` và 3 gitlink
  `D` có sẵn từ trước.
- Không chạy: `pnpm test*`, `pnpm test:gates` (kết luận gate test là tĩnh: đọc `api-collection-contract.gate-spec.ts` và
  registry).
- Giới hạn: "đã code" dựa vào commit + marker trong `src/`, không kiểm từng AC; `qd103-mf5-followups` và `qd103-api-docs-regression`
  chỉ xác định một phần; số dòng roadmap trong §6 là ảnh chụp — A6 đang sửa file, phải tìm theo tên/khóa.

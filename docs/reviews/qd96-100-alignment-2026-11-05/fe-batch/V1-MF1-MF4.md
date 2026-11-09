# V1 — MF-1 + MF-4: mức FE-tonight và contract (05/11/2026)

Skill: `agent-skills:spec-driven-development` (process, chia A/B), `agent-skills:api-and-interface-design` (contract, 422 strict),
`agent-skills:code-review-and-quality` (kiểm source), `superpowers:verification-before-completion` (grep operationId/dòng trước khi
ghi). Chỉ sửa spec/plan. BE `808318a4`; source tính từ `src/modules/`.

## 1. Finding

| F | Xác nhận ở source | Loại | Hạng mục chủ | Spec đã đủ? | Đã chỉnh | Mức |
| --- | --- | --- | --- | --- | --- | --- |
| F01 | `requests/access-request/access-request.dto.ts:21,70`; `pricing.policy.ts:60,72`; `request-facts.service.ts:246`; `spend/spend-submission.dto.ts:35` | sai logic + field | #16 | logic có; thiếu bảng FE, R-10b/14/15/16b | bảng 9 op, neo server, R-14/15/10b/16b | **A** (mục 3, 7: B) |
| F02 | `access-request.dto.ts:9,62`; `group-request/group-request.dto.ts:36-37` | sai logic | #15 | thiếu `effectiveTermOf` (R-15) | thêm hàm, bảng | **A** (báo giá: B) |
| F03 | `group-request.dto.ts:31`; `licensing/provisioning/provisioning.dto.ts:20` | sai logic | #20 (+#4 vế IT) | thiếu R-15, chưa tách | A = tính lúc duyệt chi + bỏ ô; B = `contractEndDate` | **A**/B |
| F04 | `group-request.dto.ts:31-33` (`min(1)`); `docs/generated/routes.md:209` | route thừa + logic | #4 | đủ | bảng; hoàn trả → B | **A** |
| F05 | `renewal-request/renewal-request.dto.ts:15-22`; `renewal-request.policy.ts:45-47` (`byHead`), `:92-104` (không cửa sổ) | sai logic | #21 | đủ; R-14 cần ghi | A = số tháng + cửa sổ; K1/nhắc → B | **A**/B |
| F06 | `requests/spend/budget-check.policy.ts:113` (chưa trừ chờ), `:147` (rẽ `FINANCE_REVIEW`); `budget-check.service.ts:189-205` (thuế) | sai logic P0 | #6 | **chưa**: R-01, R-13 | M02/M03, hợp đồng Audit, bảng; `NEEDS_RESERVE` | **A** |
| F07 | `spend-submission.dto.ts:24-31` (chỉ `requestIds`) | thiếu API | #7 | chưa: R-10a, R-13, R-16a, R-25 | đã sửa; bảng | **A** |
| F08 | `spend-approval-view/spend-approval.dto.ts:19-35` | field thừa | #12 | đủ | A = bỏ field (không migration) | **A**/B |
| F09 | `spend-submission.policy.ts:53-54` (`entryFor`→`DIRECT`) | sai logic | #6 (DIRECT), #19 (QUEUED) | #19 đã sửa R-02 | ghi hành vi FE thấy | **A** |
| F10 | `renewal-apply/renewal-apply.service.ts:31` (tự áp mọi gói) | thiếu API | #21 (K1) / H4 | K1 đủ; loại mới hoãn | K1 → B | B / **BLOCKER** (H4) |
| F11 | `licensing/assignment/assignment.service.ts:225` | thiếu API | H2 | hoãn | — | **BLOCKER** (H2) |
| F20 | `budgets/budgets.module.ts` chỉ proposal/version/commitment/view/attachment | thiếu API | H1 | hoãn (Owner Q-01 B) | — | **BLOCKER** (đã chấp nhận) |
| F21 | `budgets/budget/budget.dto.ts:19-30` (`lineBody`) | thiếu field | H1 | hoãn | — | **BLOCKER** (đã chấp nhận) |
| F22 | `budget.dto.ts:84,86,100`; `routes.md:243` | route/field thừa | #13 | chưa: R-09 | A = gỡ 3 route + field + `DROP NOT NULL`; B = dọn | **A**/B |
| F23 | `budget.dto.ts:80-81` (chỉ base/reserve) | thiếu logic | #14 | chưa: R-05, R-20 Critical/Req | M15a/M15b, bảng | **A**/B |
| F24 | `budgets/budget-view/budget-view.service.ts:15-17,51-57`; `dashboards/manager/manager-dashboard.controller.ts:29` | sai quyền đọc | #8 | thiếu `pending` | thêm; dashboard → B | **A**/B |

## 2. Hạng mục

Giờ = code + test theo file (A / B).

| slug | Mức | Phụ thuộc (phần A) | Contract đổi | Migration | Spec/plan | Giờ |
| --- | --- | --- | --- | --- | --- | --- |
| `request-sender-rules` (#4) | A/B | — | gỡ `POST /delegated-requests`; renewal chỉ người giữ; nhóm ≥ 2; grant bỏ `expectedEndDate` | — | draft | 5 / 1 |
| `sla-reminder-recipients` (#5) | B | — | 2 mã thông báo, 2 tham số, mã lỗi ngày nghỉ | ADD VALUE (R-18 đã ghi) | draft | 0 / 8 |
| `budget-check-three-outcomes` (#6) | A | #4, #16 Task 1 | `outcome`, `blockedReasons`, mã năm, stage, 409 kiểm lại | M02, M03 | draft | 20 / 0 |
| `reserve-confirmation` (#7) | A/B | #6 | `reserveConfirmations[]`; supplement `termMonths` | M04 | draft | 18 / 1 |
| `budget-visibility-qd100p` (#8) | A/B | #6 | `budgetMine` + 7 số; chiếu hẹp check | — | draft | 5 / 4 |
| `remove-finance-review-path` (#11) | B | sau mọi A | gỡ 7 route (đã chết sau #6-A) | M12 | draft | 0 / 19 |
| `remove-spend-override` (#12) | A/B | #6 | bỏ `override`, `overrideReason`, `bySubstitute` | B: M13 | draft | 2 / 3 |
| `remove-budget-revision-and-high-value` (#13) | A/B | #6 | gỡ 3 route, `highValue*` | A: `DROP NOT NULL`; B: M14 + R-09 | draft | 4 / 10 |
| `annual-budget-reserve-and-floor` (#14) | A/B | #6, #13 | `reserve?`, `reserveReason`, tiền `{amount}`, 409 sàn | A: M15a; B: M15b | draft | 7 / 3 |
| `request-term-limit` (#15) | A/B | #4 | `termMonths` 1..12, bỏ `termConfirmation` | — | draft | 6 / 1 |
| `request-year-without-spend-date` (#16) | A/B | #15 | bỏ `expectedSpendOn` ở 9 op + response | B: M16 (+R-10b) | draft | 10 / 5 |
| `head-group-request-queue` (#19) | A | #6, #7 | không đổi hình dạng | M19, M20 | draft | 10 / 0 |
| `approved-end-date` (#20) | A/B | #15, #16 | nhóm bỏ `lines[].expectedEndDate` | B: cột hồ sơ | draft | 4 / 6 |
| `renewal-chaining-and-window` (#21) | A/B | #20 | `extensionMonths`, 422 `WINDOW_NOT_OPEN` | B: loại nhắc | draft | 4 / 6 |
| `spend-notifications` (#22) | B | #6, #7 | 4 mã thông báo | — | draft | 0 / 15 |
| `subscription-quantity-guard` (#23) | B | — | `basis`, `requestId` | bảng sổ | draft | 0 / 4 |
| `catalog-api-fields` | B | #23 | trường catalog | 2 | draft | 0 / 5 |
| `licensing-api-fields` | B | — | trường licensing | 1 | draft | 0 / 5 |
| `seed-demo-v3` (#28) | A/B | A0 đầu hàng; A1 sau các A | — | dữ liệu (drop DB) | draft | 6 / 10 |

**Tổng phần A ≈ 101h — không xong trong một tối bởi một người.** Đề xuất ba đợt để FE code theo contract thật sớm nhất:
(1) ≈ 14h — chỉ DTO/route: #4, #15, #16 Task 2, #12-A, #13-A, vế DTO của #20/#21, A0; (2) ≈ 50h — logic tiền: #16 neo, #6, #7;
(3) ≈ 37h — #8, #14, #19, #20/#21 logic, #28-A1. Hàng đợi merge phần A: A0 → #4 → #15 → #16 → #6 → #7 → #12 → #13 → #14 → #8 → #20 →
#21 → #19 → #28-A1. Thứ tự này khác danh sách phẳng C-REVIEW §3 (#19 nay trước #5, #11) — điều phối viên đánh lại số M toàn cục.

## 3. Field theo vai (chỉ chỗ khác bảng review Docs)

| Dòng bảng Docs | Kết luận |
| --- | --- |
| Cá nhân xin quyền | đồng ý (`budgetYear` output = tạm tính tới khi duyệt chi) |
| Xin nhóm | đồng ý; ≥ 2 cho **mọi** người gửi (S-01) |
| Tiếp tục sử dụng | đồng ý; tên field `extensionMonths` 1..12; `newExpectedEndDate` thành **output**; thao tác IT *đã kéo dài* (K1) là phần B |
| Manager duyệt nhu cầu | đồng ý |
| Manager trình + dùng dự phòng | khác: **không** có endpoint riêng — `reserveConfirmations[{requestId, reason}]` nằm trong `spendBatchSubmit` (S-15) |
| (thiếu trong bảng Docs) sửa Request bị chặn | `accessRequestSupplementAdd {dropEmployeeIds?, termMonths? (chỉ giảm), reason}` |
| Spending Approver quyết Request | đồng ý |
| IT cấp | đồng ý (chuyển seat kèm chi phí: H2) |
| Manager đề xuất ngân sách | đồng ý `amount` là dự toán; khác: bỏ `costCenterId` và `currency` khỏi input (server suy ra) |
| Finance lập phiên bản | khác: `reserve` tùy chọn (server 10 %), `reserveReason` khi lệch; tiền chỉ `{amount}` |
| Spending Approver quyết ngân sách | đồng ý (+409 sàn) |
| `budgetMine` (F24) | thêm `pending` |

## 4. C-REVIEW thuộc phạm vi

Đã sửa trong spec/plan: R-01, R-05, R-06, R-07, R-08 (Critical); R-09, R-10a/b, R-13, R-14, R-15 (#15, #16, #20), R-16a/b/d, R-18
(#5), R-20; Optional R-25, R-28. Đã sửa từ trước: R-02, R-16c, R-18 (#19), R-17 (#28 có spec). R-15 vế #17 (Request thay thế)
thuộc agent MF-3 — `effectiveTermOf` đã cung cấp. `C-REVIEW.md`, `audit/A1-BUDGET.md` còn tên cũ `USES_RESERVE` (không sửa).

## 5. Blocker và chờ mentor

| Điểm | Ảnh hưởng | Đề xuất |
| --- | --- | --- |
| H1 (F20, F21): B0–B3, loại dòng, ưu tiên, ZBB | MF-4 4.1–4.4, một phần 4.5/4.6 | Owner Q-01 B đã chấp nhận; demo MF-4 từ 4.5 |
| H2 (F11): giữ seat, tiền mới = 0, chuyển seat | MF-1 1.5/1.8/1.9 nhánh seat phòng khác | 1.9 dùng grant hiện có; seed đủ seat |
| H4 (F10): tiếp tục nhóm, hợp thức hóa, tăng cấp thuê bao | MF-1 1.1 nhánh đó | FE không dựng form |
| `QĐ-100l`/`QĐ-100ah` | trưởng phòng tự gửi Request cá nhân | giữ hiện trạng; không spec |
| Cần điều phối viên chốt | (a) tên `NEEDS_RESERVE`; (b) đổi tên fixture dời từ #11 lên #28-A0; (c) số migration toàn cục | — |

Không tạo spec mới: mọi bước MF-1/MF-4 FE nối tối nay đã có chủ.

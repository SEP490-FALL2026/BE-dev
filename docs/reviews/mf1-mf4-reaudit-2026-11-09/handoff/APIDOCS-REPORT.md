# Báo cáo cập nhật tài liệu API cho FE và mobile — BE `fix/review-mf145` 379dc011

Ngày 10/11/2026. Docs commit `9800c31` trên `main` (**chưa push**). Phạm vi sửa: chỉ `Docs/Figma UI-UX/API-Integration/`. Không sửa BE.

## 1. Revision được mô tả

| Mục | Giá trị |
| --- | --- |
| BE | nhánh `fix/review-mf145`, commit `379dc01138c5840631b312e04d8f9775c3030e4a`, sinh từ `git clone` sạch (workspace BE nằm trong worktree) |
| `openapi.json` sha256 | `3081ec40cde7585c3541f2b804bbe24b2ee96da9477769b81c345ba01060ae3d` |
| Nghiệp vụ | Docs `5bb2e6a` (`QĐ-109`) |
| Số operation | 341 → **381** |
| Trạng thái | **CHƯA deploy** (VPS còn WDP `main` `bd6cbb9a`, contract `8bc889bc…`). README, vai, luồng, demo và `ai-integration-guide.md` đều ghi rõ |

## 2. Operation thêm / đổi / bỏ (kết quả `--compare` với manifest `01757398`)

- **Thêm 47:** `budgetCycleOpen/List/Get/Update`, `budgetDepartmentCeilingsSet`, `budgetCycleBaseline`, `budgetCyclePackage`, `budgetCyclePublish` (8);
  31 operation `usageSource*`, `usageImport*`, `usageUnmatchedIdentity*`, `usageIdentityMapping*`, `usageNoAssignmentFindingList`, `ghostSeat*`;
  `licenseKeyWithdraw`, `accessRequestList`, `accessRequestResubmit`, `spendReserveConfirm`, `departmentAccessRequestList`, `accessRequestEventList`, `accessRequestAuditFlagList`.
- **Bỏ 7 (breaking):** `financeReviewList`, `financeReviewGet`, `financeReviewComplete`, `budgetInformationAsk`, `budgetInformationOfRequest`, `budgetInformationList`, `budgetInformationAnswer`.
- **Đổi 109** operation, 134 schema dùng chung. Đổi đáng chú ý: Request không còn `termMonths` (còn `expectedEndDate?`, `manyPaidSoftwareReason?`);
  `provisioningTaskGrant` (kho dùng chung, `purchase`); dòng đề xuất ngân sách bắt buộc `lineType`, `priorityRank`; `spendBatchSubmit` nhận `reserveConfirmations`;
  `budgetTable`/`budgetSummary` mở cho Người duyệt chi; thuê bao `ownerDepartmentId` tùy chọn với K2/K4.
- Danh sách đầy đủ (nguyên văn `--compare`): `changes/2026-11-10-fix-review-mf145-openapi.md`; tóm tắt: `changes/CHANGELOG.md`.

## 3. Trang đã viết lại hoặc tạo

**Flows (theo luật code mới):**
`flows/paid-access-request.md` (MF-1), `flows/internal-free-request.md`, `flows/new-software-request.md`, `flows/annual-budget.md` (MF-4, B1–B7),
**mới** `flows/shared-stock-grant.md` (kho dùng chung), **mới** `flows/ghost-seat-reclaim.md` (MF-5).

- Chọn **file riêng** cho kho dùng chung thay vì gộp vào `subscription-rightsizing.md`: điều chỉnh thuê bao (`SBF-20`) là luồng IT đề xuất → trưởng phòng xác nhận → ghi kết quả với nhà cung cấp;
  kho dùng chung là bước thực thi cấp/thu hồi của IT Admin sau khi Request được duyệt. Hai luồng khác vai và route.
- Sửa nhãn main flow cũ cho khớp BRD 4.8: nghỉ việc `MF-2`, điều chuyển `MF-3`, điều chỉnh thuê bao `SBF-20` (trước đây ghi `MF-5`/`MF-7`).
- Sửa `flows/subscription-rightsizing.md`, `flows/manager-api-handoff.md`, `flows/README.md`, `flows/usage-reconciliation-k4-contracts-status.md` (ghi chú lịch sử).

**Vai:** `roles/README.md`, `employee.md`, `manager.md`, `spending-approver.md`, `it-admin.md`, `finance.md`, `super-admin.md` — mỗi trang có mục "Cập nhật 10/11/2026" (operation mới / đổi / bỏ)
và mục **Mobile**; bỏ hàng Finance rà soát và hỏi Finance; thêm 8 tham số vận hành mới vào bảng của Super Admin.

**Reference (sinh):** 23 nhóm, thêm `reference/usage-ghost-seats.md`; `api-index.md`, `enums.md`, `coverage-manifest.json` sinh lại. Annotation viết lại: `budgets`, `access-requests`, `spend-and-finance-review`, `group-requests`,
`requests-new-software-and-service-accounts`, `request-operations`, `licensing-seats`, `provisioning-and-saas-issues`, `catalog-plans-subscriptions`, `catalog-vendors-applications`, `subscription-renewals`, `personnel-transfers-leaves`; mới `usage-ghost-seats`.

**Khác:** `README.md` (bảng revision, số liệu, mục thay đổi), `changes/maintenance.md` (quy trình lần này), `demo/` (ghi chú dataset cũ), `mobile-api-map.md` (mới).

**Generator:** thêm hiểu decorator `@RequireRolesOrGrants` (trước đó `build-api-docs.mjs` dừng ở `budgetProposalSubmit`: "no access declaration"); nhóm mới `usage-ghost-seats`, tag `budget-cycles`, `budget-checks`; bỏ tag `finance-reviews`, `budget-information`.

## 4. Bảng mobile tóm tắt (chi tiết: `mobile-api-map.md`)

| Vai | Dùng được trên mobile (`QĐ-61b`) | Chỉ web | Ngoài phạm vi / thiếu API |
| --- | --- | --- | --- |
| Employee | `meSoftwareRightList`; `requestableApplication*`, `requestablePlan*`, `accessRequestPreview`, `accessRequestSubmit` (phần mềm đã có trong danh mục); `meAccessRequestList`, `accessRequestGet`, `accessRequestEventList`, `accessRequestTimingsGet`, `accessRequestWithdraw`; `notification*`; `authLogin/Refresh/Logout`, `meGet` | nháp, `accessRequestResubmit`, Request tiếp tục, hoàn trả, đề xuất phần mềm ngoài danh mục, yêu cầu nhóm, báo lỗi SaaS | kho key + biometric (`QĐ-61c/61d`; Employee không có route xem key — **thiếu API**), push FCM, "bộ công cụ chuẩn", thời hạn 3/6/12 tháng, dự án, tài khoản dùng chung, "Instant Seat" (**thiếu API**: `stock` chỉ ở `grantQueueList`), thông tin tài khoản được cấp (**thiếu API**) |
| Trưởng phòng | `needDecisionList`, `accessRequestGet`, `accessRequestSimilarSeatList`, `accessRequestNeedDecide` | yêu cầu nhóm theo dòng, trình lô + `spendReserveConfirm`, ghost seat, ngân sách, điều chuyển, nghỉ việc, điều chỉnh thuê bao, `departmentAccessRequestList` | badge "ngoài bộ chuẩn", "thời hạn dài" |
| Người duyệt chi | `spendApprovalList`, `spendApprovalGet` (snapshot chỉ đọc), `spendApprovalDecide` | lô (`spendBatch*`), từng dòng nhóm, phiên bản ngân sách, `budgetTable`/`budgetSummary` | "ý kiến Finance" (đã bỏ); kế hoạch nói Người duyệt chi duyệt cả bước nhu cầu của yêu cầu trưởng phòng — code mới là **một bước** gộp |
| IT Admin, Finance, Super Admin | — | tất cả | ngoài phạm vi `QĐ-61b` |

## 5. Lệch nghiệp vụ (code ≠ BRD/QĐ/kế hoạch) — tài liệu mô tả đúng code

1. `ghostSeatQueueList` trả `evidence` đầy đủ (gồm `matchMethod`, `confidence.reasons`) cho trưởng phòng, trong khi `ghostSeatRecommendationGet` rút gọn theo SoD-2 (`decision-queue.service.ts:100` so với `board-query.service.ts:60`, `board.policy.ts:62-68`). Đề nghị BE dùng `headEvidenceOf` cho hàng đợi.
2. Mô tả OpenAPI `ghostSeatKpi5Get` ("were right") lệch chữ với công thức thật (bác bỏ + thay thế ÷ tổng, khớp BRD KPI-5).
3. Trần nhóm của trưởng phòng là 100 người (`group-request.policy.ts:15`); BRD chỉ nói "từ 2 người". Request nhóm của trưởng phòng không chứa chính trưởng phòng (`HEAD_IN_GROUP`) — mô tả OpenAPI `groupRequestSubmit` còn câu cũ.
4. Mô tả OpenAPI còn câu về Finance cũ: `accessRequestWithdraw`, `needDecisionList`, `spendApprovalLineDecide`, enum `stepKind` (`FINANCE_REVIEW`); glossary toàn cục `readyToSubmit` vẫn nghĩa cũ "đã chọn dòng kế hoạch".
5. `budgetCommitmentInvoiceRecord/List` còn trong BE, SPEC §3 P1-08 dự định gỡ.
6. Policy `C-03`/`QĐ-104k` (mỗi (ứng dụng, gói) một thuê bao dùng chung có một IT Admin phụ trách) so với code: `ownerDepartmentId` tùy chọn với K2/K4, chỉ cảnh báo `SHOULD_MERGE` khi trùng trước lúc đóng hiện trạng ghế.
7. `stock.free` mô tả OpenAPI "null khi chưa biết" nhưng schema integer không null.
8. `ghostSeat…potentialSaving.realisableAt` hiện luôn `UNKNOWN`, `leftOn` của G2 luôn `null`, kho `K4` chưa sinh `G1` (theo README BE; chưa kiểm bằng test).

## 6. Thiếu API (không tự bịa endpoint)

- Thuê bao kho dùng chung K2/K4 không có phòng sở hữu ⟹ kỳ kế tiếp `NO_OWNER_DEPARTMENT`, chưa thấy API gia hạn cho loại này — cần Owner chốt.
- `stock` theo gói cho IT Admin xem trước khi có Request; người gửi không thấy kho còn hay hết.
- `accessRequestDraftSave` thiếu kind `PROPOSAL`/`RENEWAL`, không có `GET /access-requests/drafts/{id}` (SPEC P1-05).
- `budgetCheckGet`/`budgetCheckYearList` chỉ Finance và người giữ bước chi đọc; trưởng phòng/người yêu cầu chỉ thấy `spend.stage`/`blockedReasons`/`overBy`.
- Cam kết ngân sách thiếu `origin` (tự tạo 01/01 so với duyệt chi); thiếu lịch sử đổi Trần năm và danh sách cam kết của phòng cho trưởng phòng; `budgetCycleBaseline` của trưởng phòng bắt buộc `departmentId` (403 `BUDGET.NOT_YOUR_COST_CENTER` nếu thiếu).
- Dashboard riêng cho Người duyệt chi và Finance (SPEC P2-09).
- Mobile: Employee xem key/tài khoản được cấp, tồn kho; route riêng cho mobile (G10).

## 7. Việc còn lại cho Owner

- **Dataset demo:** `shared-demo-v3` seed theo contract cũ; kịch bản `R9` (Finance rà soát) và phòng `DES` không ngân sách không còn nghĩa; chưa có dữ liệu mẫu cho usage, ghost seat, kỳ ngân sách → cần seed lại sau khi deploy.
- **Kế hoạch mobile** (`Code/Mobile/KE-HOACH-MO-RONG-MOBILE-ANDROID.md`) còn push, biometrics, bộ công cụ chuẩn, ý kiến Finance, thời hạn 3/6/12 tháng — trái `QĐ-61c`, `QĐ-87e` và code; chưa sửa vì ngoài phạm vi lượt này.
- Khi deploy: checkout đúng sha của image, `--compare` với manifest hiện tại, sinh lại nếu khác và gỡ ghi chú "chưa deploy" (tìm "chưa deploy" ở README, vai, luồng, demo, `ai-integration-guide.md`, `mobile-api-map.md`, `flows/*`).
- Trong working tree `Docs` còn `Diagrams/debug.log` bị xóa (có từ trước lượt này) và một thư mục tên lỗi `콈�ƥ/` mà git không mở được; cả hai không thuộc commit này, tôi không đụng.

## 8. Lệnh kiểm tra và kết quả thật

Chạy từ `Docs/Figma UI-UX/API-Integration` (BE = bản clone sạch `fix/review-mf145` `379dc011`):

| Lệnh | Kết quả |
| --- | --- |
| `node tools/build-api-docs.mjs --be <clone>` (sinh) | exit 0; 381 operation · 381 annotated · field rows explained 5015/5015 (+5 union rows) |
| `node tools/build-api-docs.mjs --be <clone> --check` | exit 0: `OK: 381 operations · 381 annotated · field rows explained 5015/5015` |
| `API_DOCS_BE=<clone> node --test "tools/test/*.test.mjs"` | 45 test, 45 pass, 0 fail |
| `python Diagrams/tools/check_links.py` (từ `Docs`) | `ok links checked=712 anchors checked=155 broken=0` |
| `node ../Code/BE-dev-software-license-management/scripts/check-rules.mjs --workspace` (từ `Docs`) | `BE: 606 files, 4197 links, 0 errors` |
| `--compare` với manifest `01757398` + OpenAPI cũ khớp sha256 | contract đổi: 47 thêm, 7 bỏ, 109 đổi, 134 schema dùng chung |

**Giới hạn của kiểm tra:** `--check` chứng minh mọi operation có mục, mọi dòng field có nghĩa, mọi link/anchor đúng và ví dụ request hợp schema; **không** chứng minh nghĩa nghiệp vụ đúng và **không** gọi API thật.
Nghĩa nghiệp vụ trong annotation, glossary và flow do đọc controller/DTO/`*.http-errors.ts`/service của BE; chưa chạy BE để xác nhận hành vi. Một ca ban đầu test generator đỏ (2 test) và `--check` còn 830 vấn đề — đều hết sau khi viết annotation và glossary.

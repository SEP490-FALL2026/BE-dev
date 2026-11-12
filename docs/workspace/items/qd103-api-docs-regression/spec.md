# Spec: qd103-api-docs-regression — bảng thay đổi hợp đồng W1–W8 cho FE, gói cập nhật API docs, hồi quy MF-2/MF-3

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (Task 1–4 trong repo BE); chat review (kiểm bảng, soạn khối prompt Docs); bước sinh
  tài liệu ở repo Docs chạy **sau khi Owner deploy** và cho phép ghi Docs.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`), đợt W8 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 09/11/2026.
- Thiết kế: `ready` (sửa theo cổng thiết kế W8 ngày 09/11/2026 — DA8-15, DA8-21). Owner review: chưa review (chế độ tự chạy).
- Gói: **W8** (giao code), hạng mục cuối của đợt.
- Nguồn: Docs `9c7f386`; BE `bc10bd1c` (đầu đợt: `1c41354e` — pin tracker, `openapi.json` gốc để so). Tài liệu FE
  `D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\` (README, `changes/maintenance.md`, generator `tools/build-api-docs.mjs`). Mẫu đợt trước:
  `docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/PROMPT-FE-DOCS-DOT-1.md` (nhật ký review đã xóa 11/11/2026 — xem git history), `FIELD-CHANGES-DOT-1.md`. Câu TẠM CHỌN: không có câu
  nghiệp vụ; lựa chọn kỹ thuật (cách so contract) ghi ở _Behavior_ 1.
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Sau đợt này FE có **một bảng thay đổi hợp đồng duy nhất** cho W1–W8 (route gỡ ⟹ 404, field bỏ ⟹ 422/không còn trong response, field bắt
buộc mới, enum đổi, mã lỗi mới, route mới) kiểm được bằng phép so `openapi.json` đầu đợt với cuối đợt; một khối prompt sẵn sàng để cập
nhật bộ tài liệu `API-Integration` sau khi Owner deploy; và bằng chứng MF-2 (nghỉ việc) và MF-3 (điều chuyển) **không vỡ** sau các sửa ở
điểm dùng chung (`SBF-18`, hủy Request khi nghỉ/điều chuyển, quyền theo vai, năm dương lịch, phòng hiệu lực 01/01).

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W8, hạng mục cuối), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: tài liệu `docs/reviews/qd103-108-alignment-2026-11-08/fe-batch/` (BE repo) + test hồi quy `test/flows/`; không đổi `src/`.
- Boundaries: không migration, không operation mới; chỉ đọc `openapi.json` hai revision; một flow test mới; repo Docs **không** ghi trong lượt chat code; ước ~6 file.
- Not larger: sửa logic MF-2/MF-3 (ngoài phạm vi — lệch thấy được ghi ledger `NGOÀI-PHẠM-VI`); full suite (W9).
- Not smaller: bảng thay đổi và hồi quy cùng chốt một revision cuối đợt; tách ra thì bảng mô tả revision chưa được kiểm hồi quy.
- Siblings: `qd103-request-history-by-role`, `qd103-mf1-followups`, `qd103-purchase-invoice-followups`, `qd103-mf5-followups` (gói W8, phải PASS trước bản chốt), `qd103-seed-demo-v4` (W7), `qd103-full-verification` (W9).
- Scope map: n/a

## Primary Story/AC

| Story | AC                                                                        | Coverage | Phần còn lại thuộc                |
| ----- | ------------------------------------------------------------------------- | -------- | --------------------------------- |
| —     | Owner W8 (_API docs cho FE_, _hồi quy MF-2/MF-3 không vỡ_); R-J08 tracker | n/a      | gỡ chặn `qd103-full-verification` |

## Supporting references

Tracker §1 (MF-2/MF-3 ngoài phạm vi, chỉ giữ không vỡ), §4 luật 5–6; `docs/rules/api-contract.md` _Handoff_ (nêu operation/schema đổi khi
contract có consumer FE); `Docs/Figma UI-UX/API-Integration/changes/maintenance.md` (_Khi BE đổi contract_, phép so contract).

## Explicit out of scope

- Ghi repo Docs (`API-Integration/`) — chạy bằng khối prompt sau khi Owner deploy và cho phép (tracker §3: chat không sửa Docs khi tự chạy).
- Sửa hành vi MF-2/MF-3; test đỏ do lệch nghiệp vụ MF-2/MF-3 có từ trước ⟹ ghi ledger, không sửa ở đây.
- `pnpm check`, full suite, dựng DB sạch + seed + gọi API theo bước (W9).

## Dependencies and blockers

Mọi hạng mục W1–W7 và bốn hạng mục W8 khác (gói W8) PASS (bảng mô tả revision cuối). Hạng mục gói W8b (chờ Owner) **không** chặn hạng mục này; nếu Owner mở gói W8b sau, bảng thêm một phần bổ sung ở lượt riêng. Task 3 (hồi quy) chạy được sớm sau mỗi đợt có chạm điểm dùng chung; bản chốt chạy
ở cuối. W7 `qd103-seed-demo-v4` PASS để mục tài khoản demo của khối prompt đúng.

## Ownership: module, data, API

- Mới (BE repo): `docs/reviews/qd103-108-alignment-2026-11-08/fe-batch/FIELD-CHANGES-W1-W8.md`,
  `docs/reviews/qd103-108-alignment-2026-11-08/fe-batch/PROMPT-FE-DOCS-W8.md`, `test/flows/mf2-mf3-qd103-regression.flow-spec.ts`.
- Đọc: `openapi.json` ở `1c41354e` (`git show 1c41354e:openapi.json`) và ở HEAD; spec/plan mục _Ownership_ + _Lệch_ của mọi `qd103-*`.
- Không đổi operation. `test/support/api-coverage-manifest.ts`, `openapi-example-manifest.ts` chỉ kiểm khớp (mỗi hạng mục đã tự cập nhật).

## Behavior and design

1. **Nguồn sự thật của bảng = phép so máy**, không phải trí nhớ spec. Cách so (TẠM CHỌN kỹ thuật, không cần Owner): chạy generator của Docs
   ở chế độ **chỉ đọc** `node tools/build-api-docs.mjs --be <clone BE ở HEAD> --compare coverage-manifest.json --old-openapi <openapi 1c41354e>`
   từ `Docs/Figma UI-UX/API-Integration` (in Markdown, không ghi tệp — `changes/maintenance.md` _Lệnh_); clone sạch theo mẫu mục _Lần
   04/11/2026_ khi workspace BE bẩn. Không chạy được (thiếu Node module, lỗi) ⟹ thay bằng so `jq` hai tệp: tập `operationId`, tập
   `components.schemas` và từng operation (`parameters`, `requestBody`, `responses`) — ghi rõ cách đã dùng.
2. **Bảng `FIELD-CHANGES-W1-W8.md`** (một dòng một thay đổi; cột: `Đợt/hạng mục | operationId | Loại (ROUTE_REMOVED · FIELD_REMOVED_REQUEST ·
FIELD_REMOVED_RESPONSE · FIELD_REQUIRED_NEW · ENUM_CHANGED · NULLABLE_NEW · ERROR_NEW · ROUTE_NEW · BEHAVIOR) | Trước → sau | FE phải làm`).
   Nhóm theo luồng (MF-1, MF-4, MF-5/SBF-20, chung) như `FIELD-CHANGES-DOT-1.md`. Mục _Danh sách hạt giống_ dưới là điều spec các đợt đã khai —
   chat code **đối chiếu từng dòng** với kết quả so; dòng có trong so mà không có trong hạt giống ⟹ thêm và ghi nguồn; dòng hạt giống không
   thấy trong so ⟹ đánh dấu "chưa vào code" (hạng mục chưa PASS) hoặc "chỉ hành vi".
3. **Danh sách hạt giống** (từ spec, cần đối chiếu):
   - W1: khóa `FISCAL_YEAR_START_MONTH` gỡ khỏi `operatingParameterList/Set/History` (404/lỗi khóa lạ); thuê bao ghi mới chỉ
     `billingCycle ∈ {MONTHLY, ANNUAL}` (`QUARTERLY`/`OTHER` ⟹ 422), thêm `commitmentTermMonths`, `responsibleItAdmin`, `vendorMinimum`,
     `isPrimaryForPlan`.
   - W2: `budgetCycle*` 6 route mới + `budgetCycleBaseline`, `budgetCyclePackage`; `budgetProposalSubmit` cần kỳ đã phát hành (lỗi mới);
     `budgetVersion*` bỏ `kind`/`basedOn`/`SUPERSEDED`, `budgetVersionCreate.source`, `budgetVersionUpdate.baseReason`, `budgetVersionSend` 409
     `BUDGET.OVER_ANNUAL_CEILING`; `budgetTable`/`budgetSummary` mở cho `SPENDING_APPROVER`, thêm `pendingSpend`, dòng `NO_BUDGET`;
     `departmentCreate` `effectiveFrom`; `budgetMine`/`budgetProposalSubmit` `costCenterId` tùy chọn.
   - W3: **gỡ** `financeReviewList/Get/Complete`, `budgetInformationAsk/OfRequest/List/Answer`; bỏ `override` ở `spendApprovalDecide`/
     `spendBatchDecide`/`spendApprovalLineDecide`; bỏ `samePersonAsSpend`, `FALLBACK_APPROVER`, `latestBudgetInformation`,
     `noIndependentReview`, `RETURNED_BY_FINANCE`, `financeReturnReason`, 2 state; thêm `routing`, state `AWAITING_REQUESTER_REVISION`,
     `needStep.state` `NOT_REQUIRED`, `spend.stage` `RETURNED_TO_REQUESTER`/`RESERVE_CONFIRMATION`, `blockedReasons[]`, `overBy`, `limits`,
     `manyPaidSoftwareReason`; route mới `spendReserveConfirm`, `accessRequestResubmit`; `accessRequestAssessmentSave` bỏ 3 trường báo giá;
     số tiền theo tháng còn lại (đổi nghĩa `termMonths`); `accessRequestRenewalSubmit` 409 cửa sổ.
   - W4: **gỡ** `budgetCommitmentInvoiceRecord`; route mới `purchaseInvoice*` (6), `licenseKeyWithdraw`, `licenseAssignmentRoleBased*` (3);
     `provisioningTaskGrant.purchase`; `licenseKeyList` `status=RETIRED` ⟹ 422; `budgetCommitmentList` `origin`, `requestId` nullable;
     `subscriptionCreate.ownerDepartmentId` tùy chọn, `warnings`/`SHOULD_MERGE`, 409 `SUBSCRIPTION.DUPLICATE_PLAN`.
   - W5: **gỡ** 5 route Business Owner/ý kiến điều khoản, 6 route `subscriptionRenewal*` + `subscriptionDeadlineEventList`; field phòng sở
     hữu thuê bao bỏ (strict ⟹ lỗi); route mới `subscriptionAdjustment*` (4), `subscriptionIncidentList`, `subscriptionClose`, `kpi4Month*`,
     `realisedSavingList`, `sharedPoolCostList`; `itAdminDashboardGet` bỏ `cancellationDeadlines`.
   - W6: 29 route usage/ghost seat mới; `provisioningTask*` `dueOn`, `notBefore`, 409 `PROVISIONING_TASK.NOT_BEFORE`;
     `managerDashboardGet`/`itAdminDashboardGet` section `ghostSeats`, `discrepancies` thành số đếm.
   - W8: `qd103-request-history-by-role` (4 route mới; `accessRequestLineList` người thụ hưởng chỉ dòng của mình — hành vi; Super Admin
     không đọc Request), `qd103-mf1-followups` (2 route mới; `draft.planId` nullable, `draft.kind` thêm `PROPOSAL`/`RENEWAL`, trường
     `continuation`), `qd103-purchase-invoice-followups` (5 route mới; `discrepancyNoted: true` bắt buộc kèm `discrepancy`),
     `qd103-mf5-followups` (`subscriptionAdjustmentGet.usage` → `openRecommendations`; `usageSource*` thêm trường; khóa `BUSINESS_EMAIL_ENABLED`).
     Không có route của gói W8b.
4. **Khối `PROMPT-FE-DOCS-W8.md`** theo mẫu `PROMPT-FE-DOCS-DOT-1.md`: chỉ chạy sau khi Owner deploy và báo sha; đọc `maintenance.md`;
   clone sạch; `--compare`; bổ sung `tools/annotations/*.md` cho operation mới, `tools/glossary/*.json` cho field/enum mới, `tools/config/groups.json`
   cho nhóm mới (usage/ghost seat, kỳ ngân sách, hóa đơn mua hàng, điều chỉnh thuê bao, lịch sử Request); sinh lại; `--check` exit 0;
   `node --test "tools/test/*.test.mjs"`; sửa phần viết tay (`README` bảng revision + mục _Phạm vi và giới hạn_ — gỡ câu "chưa có API usage/
   ghost seat", `roles/*`, `flows/*` — viết lại `flows/subscription-rightsizing.md` theo điểm điều chỉnh, gỡ màn Finance rà soát và màn xác
   nhận điều chỉnh của trưởng phòng; thêm luồng _lịch sử Request theo vai_; `demo/*` theo `qd103-seed-demo-v4`); changelog
   `changes/<ngày>-<sha8>-openapi.md` 3 phần (contract đã chốt · logic cũ còn chạy · sẽ đổi). Grep các từ đã bỏ (`financeReview`,
   `budgetInformation`, `override`, `samePersonAsSpend`, `businessOwner`, `subscriptionRenewal`, `FISCAL_YEAR_START_MONTH`,
   `cancellationDeadlines`) chỉ còn trong changelog. Không ghi mật khẩu/token. Commit Docs theo quy ước Owner.
5. **Hồi quy MF-2/MF-3** — hai lớp:
   - (a) Chạy lại test hiện có (danh sách ở plan Task 3) trên revision cuối W8; đỏ ⟹ phân loại: do W1–W8 (sửa ở hạng mục gây ra, finding)
     hay lệch có từ trước (ledger `NGOÀI-PHẠM-VI`).
   - (b) Flow mới `test/flows/mf2-mf3-qd103-regression.flow-spec.ts` (nhãn `@MF2`, `@MF3`), mỗi ca một điểm dùng chung đã đổi:
     1. Nghỉ việc người giữ seat `K2` kho dùng chung ⟹ tác vụ thu hồi (`SBF-18`) **không** có ân hạn 7 ngày (chỉ MF-5 truyền ân hạn — W6),
        hoàn tất ⟹ seat về _Trống_, khoản cam kết phần còn lại giải phóng (W4 `commitment-release-on-revocation`).
     2. Nghỉ việc người giữ khóa `K4` ⟹ khóa có trong `offboardingCaseRightList` với `revocable: true`, thu hồi ⟹ khóa về kho (W4 `k4-key-pool`).
     3. Người giữ quyền theo vai (`SPENDING_APPROVER`) nghỉ ⟹ quyền theo vai vào thu hồi như quyền thường (W4 `role-based-access`).
     4. Người nghỉ có Request trả phí đang `AWAITING_REQUESTER_REVISION` (W3) và một dòng trong Request nhóm ⟹
        `accessRequestCancelForDeparture` / đóng dòng hoạt động, kết cục _Bị hủy_.
     5. Điều chuyển người có quyền có thời hạn và Request tiếp tục đang chờ ⟹ Request trả phí còn mở ở phòng cũ bị hủy tại ngày hiệu lực
        (`QĐ-103h`), quyền giữ trong chồng lấn; ngày kết thúc không cắt 31/12 (W1).
     6. Điều chuyển **trưởng phòng** khỏi phòng ⟹ Request đang chờ bước nhu cầu của phòng chuyển một bước (W3 `QĐ-104f`); điều chuyển vào
        phòng có hiệu lực 01/01 năm sau trước ngày hiệu lực ⟹ bị chặn (W2 `department-effective-year`).
     7. `offboardingCaseGet`, `departmentTransferRecord` không còn trường Business Owner (W5) và vẫn trả 200.
        **Không** `it.skip` (DA8-15, luật 6 tracker): hạng mục này chạy sau khi mọi hạng mục nó dựa vào đã PASS nên mọi ca chạy thật. Ca nào
        dựa vào hạng mục Owner hoãn ⟹ **không viết** ca đó, ghi _Lệch_ ở plan + dòng ledger; không có ca bị tắt.

## Test matrix

| AC / rủi ro     | Tình huống                                                                                              | Cấp test        | Kết quả mong đợi                                                | Bằng chứng sau implement |
| --------------- | ------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------- | ------------------------ |
| bảng đủ         | so `openapi.json` `1c41354e` ↔ HEAD; mọi operation thêm/bỏ/đổi có dòng trong bảng                       | thủ công + lệnh | 0 operation đổi mà không có dòng; số thêm/bỏ/đổi ghi ở đầu bảng |                          |
| bảng đúng       | 5 dòng chọn ngẫu nhiên: kiểm bằng `test:http` hiện có của operation đó (route gỡ ⟹ 404, field bỏ ⟹ 422) | http (có sẵn)   | khớp bảng                                                       |                          |
| manifest        | `api-coverage-manifest.ts`, `openapi-example-manifest.ts` khớp `openapi.json`                           | gate + http     | `pnpm test:gates`, `api-inventory.http-spec.ts` xanh            |                          |
| hồi quy (a)     | test MF-2/MF-3 hiện có                                                                                  | flows/e2e/integ | xanh, hoặc đỏ đã phân loại có finding/ledger                    |                          |
| hồi quy (b) 1–7 | 7 ca ở _Behavior_ 5(b)                                                                                  | flows           | đúng kết quả từng ca; không ca nào `skip`                       |                          |
| phủ định (b)    | ca 1: thu hồi do nghỉ việc **không** bị chặn 409 `NOT_BEFORE`                                           | flows           | hoàn tất được ngay                                              |                          |
| prompt Docs     | khối prompt đủ bước 4, không chứa mật khẩu/token, nêu sha cần điền                                      | review          | chat review ký                                                  |                          |

## Definition of Done

- [ ] `FIELD-CHANGES-W1-W8.md` và `PROMPT-FE-DOCS-W8.md` có trong `fe-batch/`, `pnpm rules:check` xanh (nếu thư mục thuộc phạm vi format).
- [ ] Flow mới xanh, không `it.skip`/`describe.skip`; test MF-2/MF-3 hiện có xanh hoặc đỏ đã phân loại.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy** (W9).

## Changes and acceptance

- 09/11/2026: tạo ở W8 (chat review soạn).
- 09/11/2026: sửa theo cổng thiết kế W8 — bỏ `it.skip` (DA8-15), hạt giống W8 theo gói W8 sau thu hẹp, bỏ ca `GROUP_RENEWAL` (gói W8b), Sizing
  mỗi trường một dòng (DA8-21). `Thiết kế: ready`. Chưa nghiệm thu.

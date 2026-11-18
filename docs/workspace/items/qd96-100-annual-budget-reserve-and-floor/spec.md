# Spec: qd96-100-annual-budget-reserve-and-floor — dự phòng mặc định 10 % do Finance cấu hình, sàn cam kết chuyển tiếp

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement tiếp quản spec/plan và evidence.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-B) theo tracker qd96-100 (nhật ký review đã xóa 11/11/2026 — xem git history),
  `LEDGER.md` L-304, L-306, L-307, L-309, L-310, L-815 (vế _vai sở hữu tham số_); tự giải S-03.
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-5.15`, `FR-5.8b`, `FR-8.2`, `FR-1.6`; US 05/11/2026 — `US-06-09` AC-30, AC-32, `US-06-11`
  AC-15; `QĐ-100h`, `QĐ-100k`, `QĐ-98b`, `QĐ-98a(4)`, `QĐ-30b`), BE `3e4553b9`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Finance cấu hình tham số _dự phòng mặc định_ (10 %); phiên bản mới tự đề xuất dự phòng = tỷ lệ chụp × số cơ sở, gửi được không
lý do khi đúng mặc định và bắt buộc `reserveReason` khi khác; Người duyệt chi không duyệt được phiên bản có số cơ sở nhỏ hơn tổng
cam kết chuyển tiếp của (Cost Center, năm), Finance thấy cảnh báo này khi lập. Server tự tính đồng tiền và Cost Center thay vì
nhận từ client. Kiểm được bằng HTTP + integration.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (giao việc Owner 05/11/2026), Story thuộc G5.
- Mode: `split-story`.
- Outcome and owner: số liệu phiên bản ngân sách đúng `QĐ-100h/k` và sàn `QĐ-98b`; capability `budgets/version`,
  `budgets/budget`, `budgets/proposal`, `budgets/attachment`, `operating-parameters`.
- Boundaries: bảng `budget_versions` (cột tỷ lệ chụp, `reserve_reason`), `budget_commitments` (nhãn), tham số mới; API
  `budgetVersionCreate/Update/Send/Decide/Get`, `budgetProposalSubmit/Resubmit`, `budgetAttachment*` (declare),
  `operatingParameterList/Set`.
- Not larger: phong bì, chỉ tiêu, gói tổng hợp, ZBB (MF-4 B0→B3, B5/B6) → hoãn H1 (Owner trả lời Q-01 B: không làm).
- Not smaller: tham số, đề xuất mặc định và kiểm lúc gửi là một luật (`US-06-09` AC-30); sàn dùng chung điểm đọc cam kết chuyển tiếp.
- Siblings: `qd96-100-remove-budget-revision-and-high-value`, `qd96-100-budget-check-three-outcomes` (chủ `carryForwardTotal`),
  `qd96-100-annual-budget-envelope-targets` (hoãn H1).
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC           | Coverage | Phần còn lại thuộc                                                                                                                                                |
| -------- | ------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-06-09 | AC-30, AC-32 | partial  | AC-31: `qd96-100-remove-budget-revision-and-high-value`; AC-27, AC-28: `qd96-100-annual-budget-envelope-targets` (hoãn); còn lại: `g5-budget-proposal-and-review` |
| US-06-11 | AC-15        | partial  | còn lại: `g5-budget-version-decision`                                                                                                                             |

## Supporting references

- S-03: phiên bản chụp tỷ lệ lúc lập; lúc gửi so `reserve` với `round(tỷ lệ chụp × số cơ sở hiện tại)` (nửa xa 0); đổi tham số
  chỉ áp cho phiên bản lập sau.
- `QĐ-30b`: cam kết chưa gắn nay chỉ là cam kết chuyển tiếp ⟹ nhãn `NO_BUDGET` thành `CARRY_FORWARD`.
- `US-06-15` AC-13 (tham số do Finance) — Story thuộc H1; hạng mục này chỉ thêm tham số và cơ chế vai sở hữu.

## Explicit out of scope

- Phong bì, chỉ tiêu, sàn ở B3 → hoãn H1. Dashboard Finance → hoãn H5.
- Ngưỡng ZBB (`KPI-3`, tăng đơn giá) — L-305, hoãn H1. Các khóa tham số khác của L-815 do từng hạng mục tự thêm.
- Seed: phiên bản đã duyệt có dự phòng đúng 10 % hoặc có lý do → `qd96-100-seed-demo-v3` (handoff).

## Dependencies and blockers

- Cần #13 (không còn `kind REVISION`/`reason` của revision) và #6 (`BudgetsApi.carryForwardTotal`).
- Migration thứ sáu của Track B.

## Ownership: module, data, API

- `operating-parameters/parameter-definitions.policy.ts:44-300` (thêm `ownerRole`, khóa `BUDGET_RESERVE_DEFAULT_PERCENT`),
  `operating-parameters.controller.ts:100-130`, `parameter-change.service.ts`.
- `budgets/version/version-figures.service.ts`, `version-creation.service.ts`, `version.service.ts` (gửi),
  `version-decision-judge.service.ts:36-67` (sàn), `version-view.service.ts` (cảnh báo sàn), `budgets/budget/budget.dto.ts:8,19-51,79-138`,
  `commitment.repo.ts:80-82`, `budgets/proposal/proposal-sender.service.ts:56-58`, `budget-proposals.controller.ts`,
  `budgets/attachment/budget-attachment.dto.ts:6-9`.

## Behavior and design

1. **Tham số** `BUDGET_RESERVE_DEFAULT_PERCENT`: nhóm `BUDGET`, int 0..100, mặc định 10, `ownerRole: 'FINANCE'`.
   `ParameterDefinition.ownerRole` mặc định `SUPER_ADMIN`. Route `operatingParameterList/Set` mở cho `SUPER_ADMIN` và `FINANCE`;
   Finance chỉ thấy và đặt khóa có `ownerRole = FINANCE`; Super Admin thấy tất cả, chỉ đặt khóa của mình; đặt sai vai ⟹ 403
   `PARAMETER.NOT_OWNER`. Ghi Audit như hiện nay.
2. **Lập phiên bản:** chụp `reserve_percent` từ tham số; `reserve` trong body thành tùy chọn — vắng ⟹ `round(% × base)`.
3. **Gửi** (`budgetVersionSend`): `reserve ≠ round(%chụp × base hiện tại)` và `reserveReason` rỗng ⟹ 422
   `BUDGET.RESERVE_REASON_REQUIRED`. Không biên cứng. `budgetVersionCreate/Update` nhận `reserveReason` (text ≤ 1000, nullable);
   response có `reserveReason`, `reservePercent`, `defaultReserve` (để FE hiện đề xuất).
4. **Sàn** (`version-decision-judge.service.ts`, sau khi khóa năm): APPROVE mà `base < carryForwardTotal(CC, year)` ⟹ 409
   `BUDGET.BASE_BELOW_CARRY_FORWARD` `details {carryForward}`, không lưu, phiên bản vẫn `SENT` (`US-06-11` AC-15). Từ chối và yêu
   cầu sửa không bị chặn. `budgetVersionGet` thêm `carryForward { total, baseBelow: boolean }` (`US-06-09` AC-32).
5. **Nhãn cam kết** (C-REVIEW R-05): cam kết **mới** tạo khi năm chưa có phiên bản ghi `unattached_reason = 'CARRY_FORWARD'`;
   dữ liệu lịch sử `NO_BUDGET` **không** sửa (trigger `budget_commitments_guard` cấm UPDATE khi `state <> 'HELD'`); một hàm đọc ánh
   xạ `NO_BUDGET` → `CARRY_FORWARD` ở wire.
6. **Trường server tự tính (L-309):** body tiền của `budgetVersion*`, `budgetProposal*` (`base`, `reserve`, `quarters.*`,
   `lines[].amount`) chỉ còn `{ amount }` — đồng tiền luôn là đồng tiền báo cáo, response vẫn trả `currency`;
   `budgetProposalSubmit` bỏ `costCenterId` (server lấy Cost Center của phòng trưởng phòng đang giữ).
7. **L-310:** `sizeBytes` của khai báo đính kèm `min(1)` (khớp response `positive`).
8. **Migration — hai file** (C-REVIEW R-05, R-20; timestamp đặt lúc merge):
   - **M15a** `<ts>_budgets_reserve_default` (đầu hạng mục, chỉ thêm): `budget_versions` thêm `reserve_percent SMALLINT NULL` (null
     cho dòng cũ ⟹ không bắt lý do), `reserve_reason TEXT NULL`; `DROP/ADD budget_commitments_attachment_check`
     (`20261023190000_budgets_decisions_and_commitments/migration.sql:104-107`) cho phép `unattached_reason IN ('NO_BUDGET',
'CARRY_FORWARD')`. **Không** có câu UPDATE cam kết.
   - **M15b** `<ts>_budgets_drop_version_reason` (task cuối, sau khi code không còn đọc/ghi `reason`): kiểm `budget_version_history`
     giữ lý do revision cũ — thiếu thì ghi `audit_events` `SYSTEM` trước như #12; `DROP COLUMN reason` (kéo theo
     `budget_versions_reason_check`). **DB-05:** drop cột không hoàn tác — ngoại lệ theo Q-02 B.

### Phần A — FE nối tối nay (chỉnh 05/11 theo review main flow F23, F22 vế body)

**Mức FE-tonight: A** cho mục 2, 3, 4, 5, 6, 7 và M15a; tham số `BUDGET_RESERVE_DEFAULT_PERCENT` thêm ở A nhưng **tạm do Super
Admin đặt** qua `operatingParameterSet` hiện có. **B:** cơ chế vai sở hữu tham số (`ownerRole = FINANCE`, Finance mở màn tham
số — L-815) ở mục 1 và M15b. Lý do: FE màn phiên bản ngân sách của Finance và màn đề xuất của trưởng phòng cần contract cuối tối
nay; cơ chế vai tham số là màn khác, không chặn MF-4 4.5→4.9.

| Operation (vai)                                                                                                         | Hiện tại                                                                                                              | Sau sửa — người dùng nhập                                                                                                               | BE tự tính / output / lỗi                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `budgetProposalSubmit` `POST /budget-proposals` (trưởng phòng hiện hành)                                                | `{costCenterId, year, lines[{…, amount {amount, currency}}], attachmentIds?}`                                         | `{year, lines[{planId?, description?, seats?, amount {amount}, note?}], attachmentIds?}` (5 trường khoảng mua bỏ — `QĐ-101n`, bước 12b) | Cost Center = của phòng trưởng phòng đang giữ; `currency` = đồng tiền báo cáo (response vẫn trả). `costCenterId`/`currency` ⟹ 422 `VALIDATION_ERROR`. `amount` dòng là **dự toán** của trưởng phòng — giữ (đồng ý review Docs) |
| `budgetProposalResubmit`                                                                                                | `lines[].amount {amount, currency}`                                                                                   | `lines[].amount {amount}`                                                                                                               | như trên                                                                                                                                                                                                                       |
| `budgetVersionLineAdd` `POST /budget-versions/{id}/lines` (Finance), `budgetVersionLineUpdate` `PUT …/lines/{position}` | `lines[].amount` / `amount` `{amount, currency}` (`budget.dto.ts:8`, `linePatchSchema` `:122-138`, `amount` ở `:127`) | `{amount}`                                                                                                                              | `currency` ⟹ 422; server điền đồng tiền báo cáo (D4)                                                                                                                                                                           |
| `budgetVersionCreate` `POST /budget-versions` (Finance)                                                                 | `{proposalId, base, reserve, highValuePercent, highValueAmount?, quarters?}`                                          | `{proposalId, base {amount}, reserve? {amount}, reserveReason?, quarters?}`                                                             | `reserve` vắng ⟹ `round(%chụp × base)`; chụp `reservePercent`; response thêm `reservePercent`, `defaultReserve`, `reserveReason`, `carryForward {total, baseBelow}`                                                            |
| `budgetVersionUpdate` `PUT /budget-versions/{id}` (phiên bản chưa duyệt)                                                | `{base?, reserve?, highValuePercent?, highValueAmount?, quarters?, reason?}`                                          | `{base?, reserve?, reserveReason?, quarters?}`                                                                                          | như trên                                                                                                                                                                                                                       |
| `budgetVersionSend` `POST /budget-versions/{id}/submission`                                                             | —                                                                                                                     | —                                                                                                                                       | `reserve ≠ round(%chụp × base)` mà `reserveReason` rỗng ⟹ 422 `BUDGET.RESERVE_REASON_REQUIRED`                                                                                                                                 |
| `budgetVersionDecide` `POST /budget-versions/{id}/decision` (Người duyệt chi)                                           | `{decision, reason?}`                                                                                                 | giữ (không sửa số)                                                                                                                      | APPROVE mà `base < carryForwardTotal` ⟹ 409 `BUDGET.BASE_BELOW_CARRY_FORWARD {carryForward}`, phiên bản vẫn `SENT`                                                                                                             |
| `budgetProposalAttachmentDeclare` `POST /budget-proposals/attachments`                                                  | `sizeBytes ≥ 0`                                                                                                       | `sizeBytes ≥ 1`                                                                                                                         | `0` ⟹ 422                                                                                                                                                                                                                      |

Không làm phong bì, chỉ tiêu, loại dòng Renew/Change/New/Cancel, ưu tiên, ZBB (F20, F21 — hoãn H1 theo Owner Q-01 B).

**Đợt (điều phối viên 05/11/2026, làn R bước R8):** vế DTO/contract của Phần A — tiền chỉ `{amount}` (server suy đồng tiền báo
cáo và Cost Center), `reserve` tùy chọn với mặc định server `round(10 % × base)`, `reserveReason` bắt buộc khi `reserve` khác mặc
định (422 khi gửi), response `reservePercent`/`defaultReserve`/`reserveReason`, `sizeBytes ≥ 1`, cùng M15a (chỉ thêm) — thuộc
**Đợt 1** để FE không đổi form ngân sách hai lần. Sàn 409 `BUDGET.BASE_BELOW_CARRY_FORWARD` (mục 4), `carryForward` ở response và
nhãn `CARRY_FORWARD` (mục 5) giữ **Đợt 3**. Chia task ở [plan](plan.md) mục _Đợt 1_.

## Test matrix

| AC / rủi ro      | Tình huống                                                                  | Cấp test    | Kết quả mong đợi                                                                | Bằng chứng sau implement |
| ---------------- | --------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------- | ------------------------ |
| `US-06-09` AC-30 | lập CC-DES 2027 base 60tr, không gửi `reserve`                              | http        | `reserve` 6tr, gửi không cần lý do                                              | planned                  |
| AC-30            | sửa `reserve` 12tr, không lý do                                             | http        | 422 `BUDGET.RESERVE_REASON_REQUIRED`                                            | planned                  |
| AC-30            | có lý do                                                                    | http        | gửi được; lý do hiện ở `budgetVersionGet`                                       | planned                  |
| S-03             | đổi tham số sau khi lập                                                     | integration | phiên bản cũ giữ tỷ lệ chụp                                                     | planned                  |
| L-815            | Finance đặt tham số của Super Admin; Super Admin đặt khóa Finance; IT Admin | http        | 403 / 403 / 403                                                                 | planned                  |
| `US-06-09` AC-32 | CF 40tr, base 35tr                                                          | http        | `carryForward.baseBelow = true`                                                 | planned                  |
| `US-06-11` AC-15 | C1 duyệt V3 base 35tr                                                       | integration | 409, không lưu, vẫn `SENT`; base 45tr duyệt được                                | planned                  |
| L-307            | duyệt Request năm sau chưa có phiên bản                                     | integration | `unattached_reason = CARRY_FORWARD`; dòng cũ `NO_BUDGET` đọc ra `CARRY_FORWARD` | planned                  |
| R-05 (DB)        | M15a trên DB có cam kết `NO_BUDGET` đã giải phóng                           | integration | migration chạy, không UPDATE; CHECK nhận cả hai giá trị                         | planned                  |
| L-309            | body tiền có `currency`; proposal có `costCenterId`                         | http        | 422 `VALIDATION` (strict)                                                       | planned                  |
| L-310            | `sizeBytes = 0`                                                             | http        | 422                                                                             | planned                  |

## Definition of Done

- [ ] AC claim có test; quick gates + test theo file xanh; OpenAPI sinh lại.
- [ ] FE được báo: `reserve` tùy chọn, `reserveReason`, body tiền không `currency`, bỏ `costCenterId`, Finance có màn hình tham số.
- [ ] Spec/plan phản ánh implementation; không tăng legacy ledger.

## Changes and acceptance

05/11/2026: bản đầu (`draft`). Chưa nghiệm thu.
05/11/2026 (chỉnh 05/11 theo review main flow: F23, F22 vế body): mức FE-tonight **A** (mục 2–7, M15a; tham số tạm do Super Admin
đặt) / **B** (vai sở hữu tham số, M15b); bảng contract FE; sửa C-REVIEW R-05 (bỏ UPDATE cam kết, nới CHECK, ánh xạ khi đọc) và
R-20 (tách migration, drop `reason` ở task cuối). Vẫn `draft`.
05/11/2026 (chỉnh 05/11 theo review main flow — vòng FIELDS): hạng mục thuộc **Đợt 3** (Owner). D4: ghi tên 2 op dòng phiên bản và
`linePatchSchema` vào bảng contract (không chỉ `versionFigures`). Vẫn `draft`.
05/11/2026 (điều phối viên, tránh FE đổi form ngân sách hai lần): vế DTO/contract (mục 2, 3, 6, 7 + M15a) kéo lên **Đợt 1**, làn R
bước R8 (sau R6); mục 4–5 (sàn 409, `carryForward`, nhãn) giữ **Đợt 3**; Task 2 tách 2a (Đợt 1) / 2b (B). Vẫn `draft`.
05/11/2026 (`QĐ-101n`, thay `QĐ-101m`): Request không bao giờ gắn dòng kế hoạch (không tự khớp, không output `planLine`/`offPlan`) và dòng BM-10/phiên bản bỏ khoảng mua, kỳ dịch vụ, chu kỳ lặp, ngày hiệu lực báo giá — gỡ ở [`qd96-100-plan-line-removal-and-bm10-lines`](../qd96-100-plan-line-removal-and-bm10-lines/spec.md) (Đợt 1); `qd96-100-plan-line-auto-match` đã xóa. Bảng contract: `lines[]` = `{planId?, description?, seats?, amount {amount}, note?}`. Không viết lại phần khác.

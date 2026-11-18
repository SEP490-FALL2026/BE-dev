# Spec: qd96-100-subscription-owner-confirmation — trưởng phòng sở hữu xác nhận đề xuất điều chỉnh thuê bao của IT

- Phụ trách: AI theo giao việc Owner (05/11/2026, lượt "FE nối 5 main flow" — chat MF-5).
- Thiết kế ban đầu bởi: AI (agent V2-MF2-MF3-MF5) theo ITEMS #9 (nhật ký review đã xóa 11/11/2026 — xem git history),
  ledger L-601, L-602, L-603, L-610, L-614, L-617; finding F26 (P0) của review Docs `main-flows-api-contract-review-2026-11-05`.
- Thiết kế: `draft`. Owner review: chưa review.
- **Mức FE-tonight: Phần A = `A`** (đã làm, `verified` local 05/11/2026) (contract + logic thật tối thiểu cho bước 5.7 → 5.8 → 5.9); **Phần B = `B`** (sau demo).
- Nguồn: Docs `3d73a7f` + thay đổi chưa commit 05/11 (_Quy trình và chính sách theo main flow_ v1.0 MF-5 bước 5.6–5.9;
  `QĐ-94c`(1), `QĐ-94d`(2), `QĐ-94m`(2)(8), `QĐ-96g`, `QĐ-96i`, `QĐ-96j`(7), `QĐ-98f`, `QĐ-100p`), BE `808318a4`.
- Nhóm roadmap: bó finding `qd96-100-alignment` (track L) — Story thuộc G8 (EP-11).
- [Kế hoạch](plan.md).

## Business outcome

IT Admin lập đề xuất giữ/giảm/hủy **kèm danh sách seat thu hồi**; **trưởng phòng hiệu lực của phòng sở hữu** thuê bao xác nhận
(mọi kết quả, kể cả _giữ_); IT ghi kết quả với nhà cung cấp như hiện có. Người duyệt chi không còn ở đường này, không đọc hồ sơ;
trưởng phòng chỉ đọc hồ sơ thuê bao phòng mình. Kiểm bằng HTTP `subscription-renewals` theo vai + integration.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (track L), Story thuộc G8 — chỉ là container.
- Mode: `technical-enabler`.
- Phases: Phần A tối nay; Phần B ghi ở cuối _Behavior and design_, cùng thư mục, không giả là xong.
- Outcome and owner: vai xác nhận điều chỉnh thuê bao (`QĐ-94d`(2)); capability `licensing/subscription-renewal`.
- Boundaries: một migration (CHECK `decider_role`); ops `subscriptionRenewalPropose`,
  `…Decide`, `…RecordOutcome` (`note`), `…List`, `…Get`, `…SeatRanking`; listener chờ Người duyệt chi bị gỡ; thông báo đề xuất/quyết định.
- Not larger: mốc `[90,60,30,7]` + người nhận + `vendor-notice` là `qd96-100-renewal-milestones-and-recipients` (#10, mức B);
  hết hạn chưa gia hạn, đóng thuê bao, đổi tier, linh hoạt N ngày là H3; usage/ghost seat là G7.
- Not smaller: đổi người quyết và phạm vi đọc phải đi cùng một lần; tách ra sẽ có giai đoạn không ai quyết được hoặc trưởng phòng
  quyết mà không đọc được hồ sơ.
- Siblings: `qd96-100-renewal-milestones-and-recipients` (B), `qd96-100-subscription-quantity-guard` (#23, `renewalId`),
  `g7-g1-g2-recommendations` (usage), H3 `qd96-100-subscription-lifecycle`.
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8) — điều phối viên đăng ký (EP-11 thuộc G8).

## Primary Story/AC

| Story | AC              | Coverage | Phần còn lại thuộc                                                           |
| ----- | --------------- | -------- | ---------------------------------------------------------------------------- |
| —     | Story `RETIRED` | n/a      | US-11-06, US-11-05 `RETIRED`; thay bởi `qd103-subscription-adjustment-point` |

_Re-pin 11/11/2026 ([C3](../../../reviews/mf2-mf3-2026-11-10/C3-SCOPE-MAP-REPIN.md)):_ bỏ khỏi bảng `US-11-06` AC-1→AC-7, AC-9→AC-14 (partial); `US-11-05` AC-11→AC-14, AC-23 (partial) — Story `RETIRED` ở Docs `5bb2e6a` (`US-11-06` `QĐ-103e`, `US-11-05` `QĐ-103e`, `QĐ-103q`); code đã merge là lịch sử, khóa ở scope map là `not affected`. Không còn Story nào nên `Mode` đổi `technical-enabler` (dòng `n/a` nêu hạng mục thay thế).

## Supporting references

- Vế Phần A/B trong AC đã claim: `US-11-06` AC-5 và `US-11-05` AC-14 (_yêu cầu sửa ⟹ IT lập lại_) giao ở Phần B; AC-10 vế _Finance được cảnh báo_ ở Phần B.

- QT 5.8: _IT đề xuất, trưởng phòng sở hữu xác nhận, IT thực hiện; mọi kết quả kể cả giữ phải được xác nhận; không cần Người duyệt
  chi_; phòng sở hữu chưa có Cost Center vẫn xác nhận giữ/giảm (`QĐ-94m`(2)). QT 5.7: giảm dưới số đang gán ⟹ đề xuất kèm danh sách
  seat theo thứ tự. `QĐ-94c`(1): không có luồng Người duyệt chi quyết gia hạn/giảm/hủy.
- Code ở `808318a4`: người quyết = Người duyệt chi (`decision/renewal-decision.policy.ts:10-17`, `subscription-renewal-parties.service.ts:75-80`);
  đọc chỉ `IT_ADMIN|FINANCE|SPENDING_APPROVER` (`…parties.service.ts:21,83-85`); thông báo đề xuất gửi Người duyệt chi
  (`proposal/renewal-proposal.service.ts:99-127`); seat thu hồi và `withinCurrentTerm` do người quyết chọn ở body quyết định
  (`subscription-renewal.dto.ts:39-46`, `renewal-decision.service.ts:97-118`); chặn _giữ_ khi thiếu Cost Center
  (`renewal-decision.policy.ts:88-98`, service :140-142); listener chờ Người duyệt chi (`spending-approver-wait.listener.ts`,
  đăng ký `licensing.module.ts:242`); CHECK `subscription_renewals_decider_role` và guard _đề xuất không đổi_
  (`prisma/migrations/20261101000200_licensing_subscription_renewals/migration.sql:80-82,162-215`).

## Explicit out of scope

- Phần B (dưới). Mốc/người nhận cảnh báo ND (#10). Thuê bao linh hoạt, hết hạn chưa gia hạn, đóng, đổi tier (H3, Q-09).
- `realisedSavings` giữ như hiện có (_tiết kiệm tại kỳ gia hạn_ khai báo); tiết kiệm **thực** theo hóa đơn là H7/G8 (F27).
- Đổi giá trị enum `RENEW` → `KEEP`: không đổi (Q-02 B); FE hiển thị nhãn _Giữ_.

## Dependencies and blockers

- Không phụ thuộc hạng mục khác của bộ. Migration: số toàn cục do điều phối viên chèn vào hàng đợi C-REVIEW mục 3 (đề xuất sau M09),
  timestamp đặt lúc merge (R-19). Không `ADD VALUE` (cột `decider_role` là TEXT + CHECK).

## Ownership: module, data, API

| operationId / vai                                 | Hiện tại                                                                                                             | Sau Phần A                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscriptionRenewalPropose` · `IT_ADMIN`         | `{subscriptionId, choice, proposedQuantity?, note?, businessOwnerOpinion?}`                                          | **thêm** `releasedAssignmentIds?: uuid[]` (≤ 10 000; bắt buộc đúng số seat vượt khi `REDUCE` dưới số đang gán; cấm với `RENEW`/`CANCEL`). Giữ field cũ. **Không** nhận `withinCurrentTerm` (⟹ 422 — điểm thực hiện BE tính, D1)                                                                                                                                                                                       |
| `subscriptionRenewalDecide` · trưởng phòng sở hữu | Người duyệt chi; `{choice, quantity?, reason?, withinCurrentTerm?, acknowledgeActiveUsers?, releasedAssignmentIds?}` | `@AuthenticatedOnly`, kiểm ở service; body **`{decision: 'CONFIRM', reason?: text≤2000, acknowledgeActiveUsers?: boolean}`**. Bỏ `choice`, `quantity`, `withinCurrentTerm`, `releasedAssignmentIds` ⟹ 422 `VALIDATION_ERROR` (strict)                                                                                                                                                                                 |
| `subscriptionRenewalList/Get` · đọc               | `IT_ADMIN, FINANCE, SPENDING_APPROVER`, mọi hồ sơ                                                                    | `IT_ADMIN`, `FINANCE`: mọi hồ sơ (Finance **chỉ đọc**, không thao tác quyết định — Owner 05/11); người đang làm trưởng phòng `P` hôm nay: chỉ hồ sơ của thuê bao có `ownerDepartmentId = P`; còn lại 403 `SUBSCRIPTION_RENEWAL.READ_FORBIDDEN`; hồ sơ phòng khác ⟹ 404 `NOT_FOUND`                                                                                                                                    |
| `subscriptionRenewalSeatRanking` · đọc            | ba vai trên                                                                                                          | `IT_ADMIN` + trưởng phòng sở hữu (như trên); Finance không; thêm query `proposedOnly?: 'true'\|'false'` và field item `inProposal: boolean`; trưởng phòng thấy mỗi người giữ seat `employee {id, employeeCode, fullName}` + `lastActivityOn` (có nguồn usage thì là ngày, chưa có ⟹ `null` — `QĐ-101i`, Owner 05/11); không email, không khối lượng usage, không trường nào khác của người đó (`id` là khóa kỹ thuật) |
| Response detail                                   | `decision.deciderRole ∈ {SPENDING_APPROVER, CONFLICT_SUBSTITUTE}`; `waitingReason: NO_SPENDING_APPROVER`             | `deciderRole` thêm `OWNER_DEPARTMENT_HEAD` (hai giá trị cũ chỉ còn để đọc lịch sử); `waitingReason: 'NO_HEAD' \| null`; `proposal` thêm `releasedSeatCount`; `decision.snapshot` = `null` khi người gọi là `IT_ADMIN` (L-617)                                                                                                                                                                                         |

BE tự tính/kiểm (không nhận từ client): người xác nhận, `deciderRole`, `executionPoint`, `decidedAfterDeadline`, `activeSeatsAtDecision`,
snapshot tài chính, số seat phải thu hồi, nguồn thu hồi. `id`, `pagination` là field kỹ thuật, giữ.

`subscriptionRenewalRecordOutcome` (IT, D9 vế A): `note` **bắt buộc** khi `outcome ∈ {VENDOR_REFUSED, DIFFERENT}` (lý do + bằng
chứng — `QĐ-96i`); refine ở `recordOutcomeBodySchema` (`subscription-renewal.dto.ts:61-65`), thiếu ⟹ 422 `VALIDATION_ERROR`.
Field khác giữ.

## Behavior and design

1. **Đề xuất (IT).** Kiểm như hiện có + chuyển từ quyết định sang đây: `checkChoice` với `withinCurrentTerm = false` (D1: không
   nhận từ client; `MID_TERM_NOT_ALLOWED` không còn phát ở đường này), `checkRelease` theo xếp hạng hôm nay
   (`EXCESS_SELECTION_INVALID` `details.required/selected`). Ghi các dòng `subscription_renewal_released_seats` **ngay lúc đề
   xuất** (cùng transaction). Thông báo `SUBSCRIPTION_RENEWAL_PROPOSED` gửi
   **trưởng phòng sở hữu** (thay Người duyệt chi). Phòng sở hữu không có trưởng phòng hôm nay ⟹ hồ sơ vẫn tạo, `waitingReason = NO_HEAD`,
   Super Admin nhận `CONTROLLED_WAIT_ALERT` (`waitingReason: 'NO_HEAD'`, `configurationHint: 'ASSIGN_DEPARTMENT_HEAD'`, eventKey `…:sent:<ms>`).
2. **Người xác nhận** = `OrganizationReadApi.getDepartmentHeads([period.ownerDepartmentId], today)` (đọc trong `tx`, sau khi khóa hồ sơ).
   Owner chốt 05/11: người xác nhận = người được phân công trưởng phòng của phòng sở hữu **vào ngày quyết định**, không xét vai
   tài khoản; không có trưởng phòng ⟹ hồ sơ chờ `NO_HEAD`. Người gọi ≠ trưởng phòng đó, hoặc = người đề xuất (`SoD-3`) ⟹ 403 `NOT_DECIDER`. Hồ sơ không `PROPOSED` ⟹
   409 `NOT_AWAITING_DECISION` (giữ mã).
3. **Xác nhận (`CONFIRM`).** Quyết định = đề xuất: `decided_choice = proposed_choice`, `decided_quantity = proposed_quantity`,
   `executionPointOf(... withinCurrentTerm = false)` — điểm thực hiện chỉ theo ngày quyết và cờ `allowsMidTermReduction`
   (`renewal-decision.policy.ts:70-80`, `QĐ-96f`; điểm điều chỉnh N ngày của thuê bao linh hoạt là H3). Kiểm lại seat hôm nay: `required = seatsToRelease(...)` với
   số đang gán **hiện tại**; tập seat đã đề xuất còn đang gán phải đúng `required` ⟹ khác ⟹ 409 mới
   `SUBSCRIPTION_RENEWAL.PROPOSAL_STALE` `details {required, stillHeld}` (Phần B cho trưởng phòng _yêu cầu sửa_; tối nay IT báo ngoài
   hệ thống). `CANCEL` khi còn người dùng mà thiếu `acknowledgeActiveUsers` ⟹ 409 `ACTIVE_USERS_NOT_ACKNOWLEDGED` (giữ). Mở thu hồi qua
   cổng chung như hiện có (`decidedRole: 'OWNER_DEPARTMENT_HEAD'`, nguồn `SUBSCRIPTION_REDUCTION|SUBSCRIPTION_CANCELLATION`).
4. **Không chặn vì Cost Center** (L-610, `QĐ-94m`(2)): bỏ `needsChargeableOwner`/`FINANCE.SETUP_INCOMPLETE` ở đường này — đề xuất không
   bao giờ tăng số lượng (`proposedQuantity < purchasedQuantity` đã kiểm), _giữ_ là mức đang trả đã duyệt.
5. **Thông báo quyết định** `SUBSCRIPTION_RENEWAL_DECIDED`: người đề xuất + IT Admin phụ trách + **Finance** (`findUsableFinanceEmployeeId`;
   `QĐ-94d`(2) _Finance được báo kết quả_). Cờ _thực hiện trễ_ tự gửi đúng người (người đề xuất, IT phụ trách, người đã xác nhận = trưởng
   phòng) — L-614 vế cờ trễ không cần sửa thêm.
6. **Gỡ** `RenewalSpendingApproverWaitListener` (file + spec + đăng ký module + registry extension-wiring); `renewalDeciderOf`,
   `renewalWaitingReason`, `usableApproverOf` thay bằng bản theo trưởng phòng. `sharedPeople().approver` **giữ** cho cảnh báo mốc và sự
   cố tự gia hạn (đúng `QĐ-98f` vế sự cố; vế mốc thuộc #10).
7. **Đọc.** `canRead` theo bảng trên; list của trưởng phòng lọc `subscriptionId IN (...)` lấy từ facade mới
   `SubscriptionPeriodApi.listSubscriptionIdsOwnedBy(departmentId)` (catalog; không join chéo module); số câu lệnh hằng mỗi trang.
8. **Migration** `<ts>_licensing_renewal_owner_confirmation`: chỉ `DROP/ADD CONSTRAINT subscription_renewals_decider_role` với
   `IN ('SPENDING_APPROVER','CONFLICT_SUBSTITUTE','OWNER_DEPARTMENT_HEAD')`. Không thêm cột, không viết lại guard (D1 bỏ
   `withinCurrentTerm`). Chỉ nới, dữ liệu cũ hợp lệ; DB demo drop + seed lại (Q-R1).
9. **Ghi kết quả (IT):** `note` bắt buộc với `VENDOR_REFUSED`/`DIFFERENT` (D9 vế A, bảng trên); không đổi logic khác.

### Phần B (mức `B`, cùng hạng mục, sau demo)

- `decision: 'REQUEST_CHANGES'` + `reason` bắt buộc; IT đề xuất lại (L-603): `ADD VALUE 'CHANGES_REQUESTED'` vào `RenewalState`
  (migration riêng, DB-05), viết lại `decision_whole`, unique `subscription_id` thành partial `WHERE state <> 'CHANGES_REQUESTED'`,
  guard cho `PROPOSED → CHANGES_REQUESTED`; sweep/alerts chỉ đọc hồ sơ sống. Thêm vào enum ⟹ đổi contract **cộng thêm**.
- Listener khi phòng sở hữu có trưởng phòng mới (nhắc trưởng phòng hồ sơ đang chờ); `subscriptionDeadlineEventList` cho Finance và
  trưởng phòng sở hữu (vế đọc của L-614); cảnh báo Finance khi phòng sở hữu thiếu Cost Center.
- (D9 vế B) `subscriptionRenewalRecordOutcome`: `nextPeriod.startDate` tùy chọn, mặc định ngày sau kỳ cũ; `nextPeriod.purchasedQuantity`
  không vượt mức đang trả đã duyệt (vượt ⟹ 409, phần tăng là Request tăng cấp `QĐ-100ad` — H4); ghi _đã báo nhà cung cấp_ là #10.

## Test matrix

| AC / rủi ro     | Tình huống                                                                                          | Cấp test           | Kết quả mong đợi                                                                                                                                    | Bằng chứng sau implement                                                                                                                                                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F26             | IT đề xuất `REDUCE` 10→8 (đang gán 9, chọn 1 seat); trưởng phòng P-DES sở hữu `CONFIRM`             | HTTP + integration | 200; `deciderRole = OWNER_DEPARTMENT_HEAD`; 1 tác vụ thu hồi; IT + Finance nhận `…_DECIDED`                                                         | verified-local: `test/integration/licensing/subscription-renewal-decision.integration-spec.ts` (REDUCE 5→1, 3 ghế, 2 ghế đề xuất; 2 tác vụ thu hồi `SUBSCRIPTION_REDUCTION`; IT + Finance nhận `…_DECIDED`)                                                                                                                                      |
| F26             | Người duyệt chi / IT Admin / trưởng phòng khác gọi decide                                           | HTTP               | 403 `NOT_DECIDER`                                                                                                                                   | verified-local: `test/integration/licensing/subscription-renewal-decision.integration-spec.ts` (Người duyệt chi, IT Admin, Finance, Employee, trưởng phòng khác ⟹ 403 `NOT_DECIDER`) + `test/http/licensing/subscription-renewals.http-spec.ts`                                                                                                  |
| F26             | Body cũ có `choice`/`quantity`/`releasedAssignmentIds`                                              | HTTP               | 422 `VALIDATION_ERROR`                                                                                                                              | verified-local: `test/http/licensing/subscription-renewals.http-spec.ts` (`choice`, `quantity`, `withinCurrentTerm`, `releasedAssignmentIds`, thiếu `decision`, `decision` ≠ `CONFIRM` ⟹ 422)                                                                                                                                                    |
| `QĐ-94d`(2) giữ | `RENEW` khi phòng sở hữu không có Cost Center                                                       | integration        | 200 (trước: 409 `FINANCE.SETUP_INCOMPLETE`)                                                                                                         | verified-local: `test/integration/licensing/subscription-renewal-decision.integration-spec.ts` (phòng không Cost Center: `RENEW` và `CANCEL` 200)                                                                                                                                                                                                |
| QT 5.7          | Đề xuất `REDUCE` dưới số đang gán thiếu/thừa seat; `RENEW` kèm seat; `withinCurrentTerm` trong body | HTTP               | 422 `EXCESS_SELECTION_INVALID` / 422 / 422 `VALIDATION_ERROR`                                                                                       | verified-local: `test/integration/licensing/subscription-renewal-decision.integration-spec.ts` (thiếu ghế, `RENEW`/`CANCEL` kèm ghế ⟹ 422 `EXCESS_SELECTION_INVALID`) + `test/http/licensing/subscription-renewals.http-spec.ts` (`withinCurrentTerm`, ghế không phải id ⟹ 422)                                                                  |
| cũ dữ liệu      | Một seat đề xuất kết thúc trước khi xác nhận                                                        | integration        | 409 `PROPOSAL_STALE`, không ghi gì                                                                                                                  | verified-local: `test/integration/licensing/subscription-renewal-decision.integration-spec.ts` (ghế không đề xuất kết thúc trước khi xác nhận ⟹ 409 `PROPOSAL_STALE` `{required:1, stillHeld:2}`, hồ sơ vẫn `PROPOSED`, không thu hồi)                                                                                                           |
| `CANCEL`        | Còn 3 người dùng, thiếu/đủ `acknowledgeActiveUsers`                                                 | HTTP               | 409 `ACTIVE_USERS_NOT_ACKNOWLEDGED` / 200, 3 tác vụ                                                                                                 | verified-local: `test/integration/licensing/subscription-renewal-decision.integration-spec.ts` (2 người dùng: 409 `details.seatsInUse=2` rồi 200 + 2 tác vụ `SUBSCRIPTION_CANCELLATION`)                                                                                                                                                         |
| Đọc             | Trưởng phòng P-DES list/get; get hồ sơ thuê bao P-FIN; Người duyệt chi list                         | HTTP               | chỉ hồ sơ P-DES / 404 / 403                                                                                                                         | verified-local: `test/integration/licensing/subscription-renewal-decision.integration-spec.ts` (IT Admin + Finance mọi hồ sơ; trưởng phòng chỉ phòng mình; hồ sơ phòng khác 404; Người duyệt chi, Employee ⟹ 403 `READ_FORBIDDEN`) + `test/integration/licensing/subscription-renewal-owner-confirmation.integration-spec.ts` (số câu lệnh hằng) |
| L-617           | IT Admin get hồ sơ đã quyết; trưởng phòng đọc seat ranking                                          | HTTP               | `decision.snapshot = null`; trưởng phòng thấy `employeeCode`, `fullName`, `lastActivityOn` (null khi chưa có nguồn), không email; `inProposal` đúng | verified-local: `test/integration/licensing/subscription-renewal-decision.integration-spec.ts` (IT Admin `snapshot = null`, Finance thấy; seat ranking: head thấy `employee {id, employeeCode, fullName}`, `lastActivityOn = null`, `inProposal`, `proposedOnly`, không email; Finance 403, trưởng phòng khác 404)                               |
| L-602           | Phòng sở hữu không trưởng phòng khi đề xuất; thu hồi vai Người duyệt chi                            | integration        | `waitingReason = NO_HEAD`, Super Admin một thông báo; đổi vai Người duyệt chi không gửi gì                                                          | verified-local: `test/integration/licensing/subscription-renewal-decision.integration-spec.ts` (phòng không trưởng phòng ⟹ `NO_HEAD`, đúng một `CONTROLLED_WAIT_ALERT`, đổi vai Người duyệt chi không gửi thêm)                                                                                                                                  |
| Migration       | Hồ sơ cũ `SPENDING_APPROVER`; ghi `OWNER_DEPARTMENT_HEAD`; ghi giá trị lạ                           | integration (DB)   | đọc được; ghi được; CHECK từ chối                                                                                                                   | verified-local: `test/integration/licensing/subscription-renewal-owner-confirmation.integration-spec.ts` (`SPENDING_APPROVER`, `CONFLICT_SUBSTITUTE`, `OWNER_DEPARTMENT_HEAD` ghi được; giá trị lạ bị CHECK `subscription_renewals_decider_role`)                                                                                                |
| Đồng thời       | Hai lần `CONFIRM` song song                                                                         | integration        | một quyết định; lần sau 409 `NOT_AWAITING_DECISION`                                                                                                 | verified-local: `test/integration/licensing/subscription-renewal-decision.integration-spec.ts` (hai `CONFIRM` song song: 200 + 409 `NOT_AWAITING_DECISION`)                                                                                                                                                                                      |
| D9              | `recordOutcome` `VENDOR_REFUSED` không `note`; `DIFFERENT` có `note`                                | HTTP               | 422 `VALIDATION_ERROR` / 200                                                                                                                        | verified-local: `test/integration/licensing/subscription-renewal-owner-confirmation.integration-spec.ts` (không `note` ⟹ 422, có `note` ⟹ 200) + `test/http/licensing/subscription-renewals.http-spec.ts`                                                                                                                                        |

## Definition of Done

Phần A:

- [x] Mọi dòng test matrix có bằng chứng (bảng trên); `typecheck`, lint file đã chạm, `arch:check` (gỡ listener), `test:gates` 16/16, `test:http` platform + licensing 21 file xanh; `openapi:export` ra thư mục tạm không khác `openapi.json` (đã được chat khác export sau thay đổi).
- [x] `licensing/README.md` (người quyết, đọc), mô tả OpenAPI op decide; FE được báo qua bảng _Ownership: module, data, API_ (form đề xuất có danh sách ghế, nút _Xác nhận_).
- [x] Spec/plan phản ánh implementation; Phần B vẫn ghi là **chưa làm** (Task 5, 6).

## Changes and acceptance

- 05/11/2026: tạo spec (`draft`) — chỉnh 05/11 theo review main flow: F26 (P0) đổi người quyết sang trưởng phòng sở hữu, chuyển danh
  sách seat và `withinCurrentTerm` sang đề xuất, bỏ chặn Cost Center với _giữ_, thu hẹp đọc (L-617), gỡ listener Người duyệt chi
  (L-602); tách Phần A (tối nay) / Phần B (yêu cầu sửa, L-603). Chưa nghiệm thu.
- 05/11/2026 (chỉnh 05/11 theo review main flow — vòng FIELDS): Owner 05/11 chốt (quyết định phiên, ghi lại ở đây): Đợt 1 _chốt contract_ gồm Phần A; người xác
  nhận = trưởng phòng được phân công của phòng sở hữu vào ngày quyết định, không xét vai tài khoản, không có ⟹ `NO_HEAD`; trưởng
  phòng thấy mã NV + họ tên người giữ seat trong đề xuất (không email, không usage chi tiết, không hồ sơ phòng khác) và
  `lastActivityOn` khi có (`QĐ-101i`); Finance đọc mọi hồ sơ, chỉ đọc. Áp delta FIELDS-MF2-MF3-MF5 D1 (`withinCurrentTerm` bỏ khỏi
  đề xuất — BE tính, migration bớt cột/guard), D2 (`lastActivityOn` cho trưởng phòng), D9 vế A (`note` bắt buộc khi kết quả khác
  quyết định) / vế B (ngày bắt đầu mặc định, trần số lượng).
- 05/11/2026 (điều phối viên, gỡ lỗi `rules:check`): EP-11 thuộc **G8** — `Container`/`Scope map` đổi G5 → G8; khóa ở bảng Primary
  đã có trong map G8 (`US-11-05` AC-11→AC-14 `partial` chủ cũ `a06-renewal-execution-chain`, AC-23 và `US-11-06` `full`; `US-11-06`
  AC-8, AC-15, AC-16 `deferred` tới hai hạng mục khung). Không đổi thiết kế.
- 05/11/2026 (tối): Phần A (Task 1–4) implement xong, `verified` (local, chưa commit) trên nhánh `feat/qd96-100-alignment`. Chưa nghiệm thu.
  Code: migration `20261108000000_licensing_renewal_owner_confirmation` (chỉ nới CHECK `decider_role`); đề xuất mang `releasedAssignmentIds`
  (ghi `subscription_renewal_released_seats` ngay lúc đề xuất); `RenewalDecisionService.confirm` (`decision: 'CONFIRM'`); người xác nhận =
  `OrganizationReadApi.getDepartmentHeads([owner], hôm nay)`; `PROPOSAL_STALE`; bỏ `needsChargeableOwner`/`checkChoice`/`FINANCE.SETUP_INCOMPLETE` ở đường quyết;
  gỡ `spending-approver-wait.listener` (file + spec + đăng ký module + 6 chỗ trong registry `extension-wiring`); đọc theo vai (`readScopeOf`);
  `snapshot = null` cho IT Admin; seat ranking thêm `proposedOnly`, `inProposal`; `note` bắt buộc cho `VENDOR_REFUSED`/`DIFFERENT`; Finance nhận
  `…_DECIDED`. Không thêm/bớt operation (con số `toHaveLength` ở `openapi-presentation` giữ nguyên).
  Lệch/giải thích: (1) danh sách của trưởng phòng lọc bằng `CatalogApi.getSubscriptionIdsOwnedBy` đã có, không thêm
  `SubscriptionPeriodApi.listSubscriptionIdsOwnedBy` như spec ghi (cùng ý nghĩa, ít bề mặt hơn); (2) mã `MID_TERM_NOT_ALLOWED` và
  ví dụ OpenAPI của nó còn trong enum lỗi nhưng không còn đường nào phát; (3) `deadline-events` vẫn cho `SPENDING_APPROVER` đọc (thuộc #10,
  không đổi); (4) `sharedPeople().approver` giữ cho cảnh báo mốc và sự cố tự gia hạn (đúng `QĐ-98f`); (5) trưởng phòng đọc thuê bao phòng mình
  vẫn thấy `decision.snapshot` (spec chỉ yêu cầu null với IT Admin).

06/11/2026 (sửa theo `FIX-DOT-1` mục Chat 4, `verified` local, chưa commit): **A-H1** — IT Admin đề xuất mà đang là trưởng phòng sở hữu ⟹ 409 `SUBSCRIPTION_RENEWAL.PROPOSER_IS_OWNER_HEAD`, không ghi hồ sơ (IT Admin khác đề xuất). Hiện DB không cho một tài khoản vừa MANAGER vừa IT_ADMIN nên đây là lớp bảo vệ phòng thủ; test integration dựng ca bằng cách tắt trigger. **A-H2** — xác nhận gặp `PROPOSAL_STALE` ⟹ trả 409 và trong cùng transaction đóng hồ sơ ở trạng thái mới `STALE` (audit `SUBSCRIPTION_RENEWAL.CLOSED_STALE`); unique "một hồ sơ mỗi kỳ" chỉ tính hồ sơ chưa `STALE` (chỉ mục unique một phần), nên IT Admin đề xuất lại được và `ALREADY_PROPOSED` bỏ qua hồ sơ đã đóng; `GET /subscription-renewals?state=STALE` liệt kê hồ sơ đã đóng (trạng thái chính là lý do), không thêm route. Migration `20261108300000` (giá trị enum) và `20261108300100` (CHECK `decision_whole`, trigger `subscription_renewals_guard` cho phép PROPOSED → STALE và STALE là cuối, chỉ mục unique một phần); Prisma: bỏ `@unique` của `subscriptionId`, quan hệ ngược `renewalCases` thành danh sách. **A-M1** — `readScopeOf`: người đang là trưởng phòng hôm nay đọc hồ sơ phòng mình không cần vai `MANAGER`. **A-M2** — `confirm` xác định phạm vi và người quyết trước khi đọc snapshot tài chính và khóa hàng: trưởng phòng phòng khác ⟹ 404 `NOT_FOUND`; IT Admin, Finance, Người duyệt chi, nhân viên ⟹ 403 `NOT_DECIDER`. Test: integration `subscription-renewal-decision` (stale đóng và đề xuất lại, 404 trưởng phòng khác) và `subscription-renewal-owner-confirmation` (A-H1, A-M2), unit `subscription-renewal-parties.service.spec.ts`, flows `mf5-rightsizing-edges`. Chưa làm: trường riêng "lý do đóng" ở list (trạng thái `STALE` đủ để FE hiển thị).

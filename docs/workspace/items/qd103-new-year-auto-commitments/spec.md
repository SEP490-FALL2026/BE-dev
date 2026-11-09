# Spec: qd103-new-year-auto-commitments — ngày 01/01 tự tạo khoản cam kết năm mới cho quyền trả phí đang chạy

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`, subagent soạn W4), đợt W4 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready` (qua cổng thiết kế W4, đã sửa theo audit). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-5.8`(1)(5)(c)(6), `FR-5.8a`, `FR-3.23` đoạn 31/12; `QĐ-104a`, `QĐ-103f`(3), `QĐ-106c`, `QĐ-103u`(5), `QĐ-104e`(2);
  QT v1.7 `C-10`, mục 1.8, 1.10), BE `5fd5f594`. Ledger: L1-13, L2-39. Luật R-C02, R-C03, R-C06, R-C01 (ngoại lệ 01/01). Câu TẠM CHỌN: Q-01 = B,
  Q-27 = A (hai điều kiện), Q-29 = B'; Q-47 = B (đổi theo audit), Q-48 ([REVISION-NOTES](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md)).
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Lượt đầu tiên của năm `Y` (sweeper mỗi giờ), hệ thống tự tạo, **không duyệt lại, không kiểm tra ngân sách**, một khoản cam kết năm `Y` cho mỗi
Request có quyền trả phí `K1`/`K2` đang chạy ngày 01/01/`Y` hoặc đã duyệt mà chưa cấp, và cho mỗi quyền trả phí đang chạy không có Request (seat
ban đầu — Q-01 B): số tiền = giá tháng hiệu lực 01/01/`Y` × số tháng của năm `Y` (quyền có thời hạn: tới tháng kết thúc), vào Cost Center hiện
hành của phòng chịu chi phí; năm `Y` chưa có ngân sách đã duyệt ⟹ khoản vẫn ghi, _chưa có ngân sách_, tự gắn khi phiên bản được duyệt. Không có
khoản cho `K4`, `K5`, quyền theo vai, quyền/Request đã kết thúc **lúc ghi**. Chạy lại không tạo trùng.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W4), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: capability mới `requests/year-start-commitments/` (job + chọn nguồn — `requests` T5 import `licensing`, `catalog`, `organization`,
  `budgets`; `budgets` không import `requests` nên job **không** ở `budgets/year-end`); `budgets` thêm phương thức ghi khoản 01/01 và cột nguồn gốc.
- Boundaries: 1 migration; 1 phương thức `BudgetsApi`; 2 phương thức `LicensingApi`; 1 tham số `on` của `CatalogApi.getPlanPrice`; 1 sweeper; 2 operation
  đổi; mở rộng listener của `qd103-commitment-release-on-revocation` cho khoản theo Assignment.
- Not larger: báo cáo _chưa có ngân sách_ (W2 `qd103-budget-views`); dòng `Renew` của `BM-10` (W2); thực chi seat-tháng (W5).
- Not smaller: chọn nguồn, số tiền, Cost Center và ghi khoản phải cùng một lượt có dấu chạy để idempotent.
- Siblings: `qd103-commitment-release-on-revocation` (`seat_monthly_minor`, listener, hàm chuỗi `licensing/assignment/assignment-chain.repo.ts`),
  `qd103-role-based-access` (loại `ROLE_BASED`), `qd103-grant-from-shared-pool` (`getPlanPrice` theo thuê bao chính).
- Scope map: n/a

## Primary Story/AC

| Story | AC           | Coverage | Phần còn lại thuộc                                                         |
| ----- | ------------ | -------- | -------------------------------------------------------------------------- |
| —     | L1-13, L2-39 | n/a      | W5 `qd103-seat-month-cost-pool-line`, W7 `qd103-seed-demo-v4` (demo 01/01) |

## Supporting references

`US-06-18` AC-1→AC-9 (AC-2 `K1`; AC-6 loại `K4`/`K5`/quyền theo vai/Request kết thúc; AC-7 audit lần chạy lại; AC-8 Request của khoản sau điều chuyển);
`US-06-04`, `US-06-06`; `US-06-07` (gắn ngược — `commitment.repo.ts:39-61` `attachWaiting`).

## Explicit out of scope

Tính lại khi giá đổi giữa năm (`QĐ-106c`); dọn khoản năm sau cũ (Q-27 A giữ); Request tiếp tục chờ quyết định (khoản do duyệt chi của chính nó);
đóng năm cũ (`budgets/year-end/year-end.service.ts:52-149` không đổi). **Quan hệ với đóng năm** (DA4-39): `US-06-18` _Preconditions_ "năm cũ đã
đóng" là bối cảnh, không là điều kiện — khoản năm `Y` độc lập với đóng năm `Y−1` (đóng năm chỉ chạm khoản năm `Y−1`), job không chờ `BudgetYearEndSweeper`.

## Dependencies and blockers

`qd103-commitment-release-on-revocation` (`seat_monthly_minor`, listener, hàm chuỗi), `qd103-role-based-access` (`ROLE_BASED`, `charge_unallocated`),
`qd103-grant-from-shared-pool` (`getPlanPrice(planId)`). W3 `qd103-commitment-current-year` (`hold` một mục, nhánh `NO_BUDGET`), `qd103-request-amount-and-term`
(quy đổi giá tháng/tiền báo cáo). W2 PASS (`budgets`, `organization`).

## Ownership: module, data, API

- Migration `<ts>_year_start_commitments` (enum mới bằng `CREATE TYPE` ⟹ một migration):
  - `budget_commitments` (`budgets.prisma:279-316`): `origin` enum `CommitmentOrigin {APPROVAL, YEAR_START_AUTO}` NOT NULL DEFAULT `APPROVAL`; `request_id`
    **DROP NOT NULL** (:284); `assignment_id uuid NULL` FK `license_assignments`; CHECK `request_id IS NOT NULL OR (origin = 'YEAR_START_AUTO' AND
assignment_id IS NOT NULL)`; UNIQUE partial `(assignment_id, year) WHERE request_id IS NULL`; `@@unique([requestId, year])` (:313) giữ.
  - Bảng `year_start_commitment_runs` (requests): PK `(organization_id, year)`, `started_at`, `completed_at NULL`, `run_count`, `created_count`, `skipped_count`.
    Dữ liệu: chèn dòng **đã hoàn tất** cho năm hiện hành của mọi tổ chức đang có (không hồi tố).
- `budgets`: `public/budgets.api.ts` `holdYearStart(tx, input)`; `public/budgets.types.ts` (`YearStartHoldInput { organizationId, year, now, items: { requestId |
null, assignmentId | null, costCenterId, currency, amountMinor, seatMonthlyMinor }[] }`); `budget/commitment.repo.ts` (`holdYearStart`, nhánh `NO_BUDGET` :95,
  `ON CONFLICT DO NOTHING`); `commitment/commitment.service.ts`; `commitment/commitment.dto.ts` + `budget-commitments.controller.ts` (`origin`, `assignmentId`,
  `requestId` nullable, lọc `origin`); `commitment/commitment-revocation.listener.ts` (khoản theo `assignment_id`); `public/budgets.extension-points.ts`
  (`CommitmentReleaseGuard.canReleaseRemainder` nhận khoản không Request: hỏi `LicensingApi` Assignment đã kết thúc); `budgets/README.md`.
- `licensing/public/licensing.api.ts`: `listRunningPaidSeatsOn(tx, organizationId, date)` ⟹ Assignment mở ngày `date` (`valid_from ≤ date`, `valid_until`
  null hoặc > `date`, không `failed_at`/`cancelled_at`) kèm `planId`, `provisioningType`, `kind`, `source`, `owning_department_id`, `expectedEndDate`,
  `valid_until`, `chainRequestId` (hàm chuỗi ở `licensing/assignment/assignment-chain.repo.ts` — DA4-36), `charge_unallocated`; `lockOpenSeats(tx,
assignmentIds)` ⟹ `FOR SHARE`, trả Assignment **còn mở hiện tại** (DA4-35). Đọc qua capability `licensing/assignment` (không qua `provisioning`).
- `catalog`: `public/catalog.api.ts` `getPlanPrice(planId, tx?, on?)` + `subscription/subscription-facts.service.ts`, `subscription.repo.ts`
  (`findPricedOfPlan` chọn kỳ thuê bao hiệu lực ngày `on` — Q-47 B).
- `organization/public/organization-read.api.ts`: `getOrganization` trả `createdAt` (thêm vào `OrganizationRecord` nếu chưa có; Q-48).
- `requests/year-start-commitments/` (mới): `year-start-commitments.job.ts` (+ spec; ADR-0018), `year-start-commitments.policy.ts` (+ spec, thuần: lọc nguồn,
  Request của khoản, số tháng, số tiền), `year-start-commitments.repo.ts` (dấu chạy, Request đã duyệt chưa cấp, Request tiếp tục, khóa hàng Request), điểm vào
  `year-start-commitments.service.ts`; `requests.module.ts`.
- Operation: không có mới. Đổi `budgetCommitmentList` (`origin`, `assignmentId`, `requestId` nullable; query `origin`) — breaking nhẹ, ghi API docs W8;
  `budgetCommitmentRelease` (Finance) nhận khoản không Request theo hook.

## Behavior and design

1. **Kích hoạt**: sweeper mỗi giờ (lần đầu sau 5 phút, mẫu `budgets/year-end/year-end.job.ts:6-16`). Mỗi tổ chức, `Y` = năm hiện tại (múi giờ tổ chức):
   bỏ khi `year_start_commitment_runs(org, Y).completed_at` có, hoặc tổ chức tạo sau 01/01/`Y` (Q-48). `pg_try_advisory_xact_lock(org, Y)` ⟹ nhiều
   instance không chạy trùng. Mốc nguồn luôn là **01/01/`Y`**, dù lượt chạy trễ. Mỗi lượt (kể cả chạy lại sau lỗi) ghi audit
   `BUDGET_COMMITMENT.YEAR_START_RUN` (`year`, `runCount`, `created`, `skipped`) — `US-06-18` AC-7 (DA4-38).
2. **Nguồn A — quyền đang chạy** (`listRunningPaidSeatsOn(01/01/Y)`): giữ `K1`, `K2` (cá nhân và tài khoản dịch vụ); loại `K4`, `K5`/không giá,
   `source = ROLE_BASED` hoặc `charge_unallocated` (`QĐ-104g`, `QĐ-106c`), Assignment có thời hạn mà có Request tiếp tục **đang chờ** (Q-27 điều kiện 2).
   **Request của khoản** (DA4-38, `US-06-18` AC-8): Request tiếp tục đã áp mới nhất của chuỗi; không có ⟹ Request của tác vụ `GRANT` **hoàn tất mới nhất**
   trên chuỗi `predecessor_id` (chuyển căn cứ theo vai, giữ seat `MF-3`, `HANDOVER`, `RENEWAL_CARRY` đều thấy Request); chuỗi không có tác vụ `GRANT` có
   Request (`BASELINE`) ⟹ khoản theo Assignment (Q-01 B).
3. **Nguồn B — Request đã duyệt chưa cấp** (R-C03, `FR-5.8`(6)): Request trả phí **`K1`/`K2` có giá** (loại `K4`, `K5` tường minh — DA4-37), duyệt chi
   trước 01/01/`Y`, chưa kết thúc trước 01/01/`Y`; số seat = người thụ hưởng đã duyệt chưa có Assignment đang chạy ở nguồn A.
4. **Gộp và bỏ qua**: một mục mỗi Request (Request nhóm cộng mọi seat ở A và B), một mục mỗi Assignment không Request. Đã có khoản (Request, `Y`) hoặc
   (Assignment, `Y`) ⟹ bỏ (Q-27 điều kiện 1; khoản Request tiếp tục duyệt tháng 12 cho kỳ năm sau theo Q-29 B' không có khoản năm `Y` nên được tạo).
5. **Số tiền** (`FR-5.8`(6), Q-47 B — DA4-37): giá tháng một seat = giá **hiệu lực ngày 01/01/`Y`** của gói (`CatalogApi.getPlanPrice(planId, tx, '01/01/Y')`,
   quy đổi bằng hàm W3) — lượt trễ không đổi kết quả; không có giá ⟹ `seat_monthly_minor` của khoản năm trước của chính Request/Assignment; vẫn không có ⟹ bỏ,
   audit `BUDGET_COMMITMENT.YEAR_START_SKIPPED` (`reason = NO_PRICE`). Số tháng = tháng của ngày cuối còn tính chi phí trong `Y`: `min(expectedEndDate,
valid_until − 1 ngày)` nếu rơi vào `Y`, không thì 12; nguồn B có ngày kết thúc chọn trong `Y` ⟹ tháng đó, không thì 12. `amount = seatMonthly × Σ
tháng của các seat`; `seat_monthly_minor` ghi giá một seat. Không tính lại khi giá đổi sau đó (`QĐ-106c`).
6. **Cost Center**: Cost Center **hiện hành** ngày chạy của phòng chịu chi phí — nguồn A: `owning_department_id` (phòng người giữ / người chịu trách nhiệm
   tài khoản dịch vụ); nguồn B: phòng của Request; qua `OrganizationReadApi`. Không có Cost Center đang dùng ⟹ bỏ, audit `NO_COST_CENTER`. Request nhóm có
   seat ở hai phòng ⟹ phòng của Request (một khoản).
7. **Ghi theo lô, kiểm lại lúc ghi** (DA4-35): mỗi lô ≤ 100 mục một transaction; thứ tự khóa toàn hệ thống _hàng Request trước, rồi năm_
   (`budgets.extension-points.ts:38-43`): (1) khóa hàng Request của lô `FOR UPDATE ORDER BY id` (`requests` repo); kiểm lại trạng thái **hiện tại** —
   Request đã từ chối/rút/thất bại/hủy (kể cả sau 01/01) ⟹ bỏ, audit `reason = REQUEST_ENDED`; (2) `LicensingApi.lockOpenSeats` `FOR SHARE` cho mục nguồn A —
   Assignment đã kết thúc ⟹ bỏ `reason = ASSIGNMENT_ENDED` (thu hồi song song chờ lô hoặc lô thấy kết quả, không có khoản treo); (3) `holdYearStart`: mỗi
   mục khóa năm `Y` (`yearLock`, `budget-year-lock.repo.ts:17-21`), đọc phiên bản `APPROVED` của (Cost Center, `Y`): có ⟹ gắn; không ⟹ `unattached_reason =
'NO_BUDGET'` (`FR-5.8a` ngoại lệ duy nhất), gắn sau bằng `attachWaiting`. `origin = YEAR_START_AUTO`, `snapshot_check_id` NULL, `ON CONFLICT DO NOTHING`;
   audit `BUDGET_COMMITMENT.CREATED`. Xong mọi lô ⟹ `completed_at`, đếm. Lỗi giữa chừng ⟹ lượt sau chạy lại an toàn.
8. **Giải phóng** (mở rộng sibling): listener thu hồi giải phóng cả khoản `assignment_id = A AND request_id IS NULL`; cùng phép tính tháng.
9. **Dữ liệu cũ / seed**: khoản cũ `origin = APPROVAL`. Seed tạo tổ chức trong năm hiện tại ⟹ Q-48 bỏ năm đầu ⟹ `ops:seed` không có khoản 01/01 (W7
   dựng demo bằng tổ chức có ngày tạo năm trước). Test dựng tổ chức có `created_at` năm trước + đồng hồ giả.

## Test matrix

| AC / rủi ro                | Tình huống (gồm từ chối, edge case)                                                                      | Cấp test           | Kết quả mong đợi                                                                      | Bằng chứng sau implement |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------- | ------------------------ |
| `US-06-18` AC-1            | 10 seat `K2` không thời hạn theo `R21`, 2027 có phiên bản duyệt, giá 200                                 | integration        | đúng một khoản (`R21`, 2027) 24 000, gắn phiên bản, `YEAR_START_AUTO`                 |                          |
| AC-2 `K1`                  | `E1` giữ ChatGPT Plus `K1` 20/tháng theo `R5`                                                            | integration        | khoản (`R5`, 2027) 240 trên `CC-ENG`                                                  |                          |
| chưa có ngân sách          | 2027 chưa có phiên bản duyệt; sau đó duyệt phiên bản                                                     | integration        | khoản `NO_BUDGET`; `attachWaiting` gắn                                                |                          |
| có thời hạn                | quyền tới 31/03/2027                                                                                     | unit + integration | 3 tháng                                                                               |                          |
| Q-01 B                     | seat `BASELINE` không Request; seat `HANDOVER` có tiền nhiệm cấp theo `R9`                               | integration        | khoản theo `assignment_id` / khoản (`R9`, 2027)                                       |                          |
| tài khoản dịch vụ          | seat `K2` `SERVICE` theo Request, người chịu trách nhiệm ở `P-OPS`                                       | integration        | khoản (Request, 2027) trên Cost Center `P-OPS`                                        |                          |
| R-C03 nguồn B              | Request duyệt 15/12/2026 chưa cấp; Request nhóm 3 người, 2 đã cấp 1 chưa; Request `K4` duyệt chưa cấp    | integration        | khoản 12 tháng / một khoản 3 seat / không khoản                                       |                          |
| loại trừ (AC-6)            | `K4`; `K5`; quyền theo vai; quyền kết thúc 31/12/2026; Request rút 20/12/2026; Request tiếp tục đang chờ | integration        | không khoản                                                                           |                          |
| AC-8 điều chuyển           | `E1` giữ seat theo `R40` (`P-DES`), giữ seat khi điều chuyển, `R41` (`P-ENG`) cấp xong tháng 11          | integration        | khoản 2027 gắn `R41` trên `CC-ENG`; `R40` không có khoản 2027 cho `E1`                |                          |
| Q-27 điều kiện 1           | (Request, 2027) đã có khoản cũ                                                                           | integration        | bỏ qua, không đổi khoản cũ                                                            |                          |
| Q-29 B'                    | Request tiếp tục duyệt 10/12/2026 kỳ 01→03/2027                                                          | integration        | khoản (Request tiếp tục, 2027) 3 tháng                                                |                          |
| Q-47 B giá                 | giá 15 → 18 kỳ mới từ 20/12/2026; lượt trễ 05/02 sau khi kỳ giá 22 bắt đầu 01/02; giá 25 tháng 03/2027   | integration        | khoản theo 18 / vẫn 18 / không tính lại                                               |                          |
| thiếu giá / CC             | gói không thuê bao có giá, không khoản năm trước; phòng không Cost Center                                | integration        | bỏ mục + audit `NO_PRICE` / `NO_COST_CENTER`                                          |                          |
| idempotent + AC-7          | lượt 2 cùng năm; hai instance chạy cùng lúc; lỗi giữa lô rồi chạy lại                                    | integration        | không trùng; một lượt; hoàn tất ở lượt sau, audit `YEAR_START_RUN` 2 lần              |                          |
| chạy trễ                   | lượt 05/02; quyền thu hồi xong 03/01 (`valid_until` 03/01); Request rút 03/01 (đã duyệt chưa cấp)        | integration        | không khoản (`ASSIGNMENT_ENDED`) / không khoản (`REQUEST_ENDED`)                      |                          |
| đua (DA4-35)               | thu hồi hoàn tất song song với lô chứa Assignment đó; Request bị rút song song với lô                    | integration        | khoản không tạo hoặc được listener giải phóng; không khoản `HELD` treo; không `40P01` |                          |
| Q-48                       | tổ chức tạo 15/03/2027 — lượt năm 2027; triển khai giữa năm (migration đánh dấu)                         | integration        | không khoản                                                                           |                          |
| cost center                | seat `K2` của người `P-FIN` trên kho từng của `P-DES`                                                    | integration        | khoản vào Cost Center `P-FIN`                                                         |                          |
| giải phóng theo Assignment | thu hồi seat `BASELINE` có khoản 01/01 hoàn tất 01/05                                                    | integration        | giải phóng 05→12                                                                      |                          |
| Finance phần dư            | `budgetCommitmentRelease` khoản không Request khi Assignment còn chạy / đã kết thúc                      | http               | 409 / 200                                                                             |                          |
| API                        | `budgetCommitmentList?origin=YEAR_START_AUTO`                                                            | http               | chỉ khoản 01/01, `assignmentId`, `requestId` null hiển thị được                       |                          |
| migration + seed           | CHECK khoản không Request không Assignment; UNIQUE (assignment, năm); `ops:seed`                         | integration        | từ chối / từ chối / seed không đổi                                                    |                          |

## Definition of Done

- [ ] Test matrix xanh; README `budgets` (nguồn gốc khoản, ngoại lệ `FR-5.8a`, dữ liệu cũ, không phụ thuộc đóng năm) và `requests` (capability mới, sweeper,
      thứ tự khóa Request → năm), `docs/rules/security-jobs.md` cập nhật; OpenAPI chỉ đổi `budgetCommitmentList`/`budgetCommitmentRelease`.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 09/11/2026: **gói 4 rút gọn theo `QĐ-109a`** (xem _Delta gói 4_ ở [plan](plan.md)): chỉ Request có khoản; bỏ Q-01 B, `request_id` nullable, `assignment_id`, đổi `budgetCommitmentList`,
  listener thu hồi theo Assignment; số tiền dùng `requestAmountOf`; đã implement + test (`test/integration/requests/year-start-commitments*.integration-spec.ts`). Chưa nghiệm thu.

- 08/11/2026: tạo ở W4 (subagent soạn). Chưa qua cổng audit thiết kế. Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W4: DA4-17, DA4-35, DA4-36, DA4-37, DA4-38, DA4-39 sửa. Q-47 → B (giá hiệu lực 01/01). Không finding nào bị
  bác. Chi tiết ở plan _Design review_ và [REVISION-NOTES](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md). Chưa nghiệm thu.

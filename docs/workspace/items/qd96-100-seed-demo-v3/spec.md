# Spec: qd96-100-seed-demo-v3 — dataset demo `shared-demo-v3` theo QĐ-96 → QĐ-100

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement tiếp quản spec/plan và evidence.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-SEED) theo [tracker qd96-100](../../../reviews/qd96-100-alignment-2026-11-05/README.md),
  `LEDGER.md` L-901…L-905, `audit/A5-CROSS.md` A5-28…A5-33; Owner `QUESTIONS.md` mục D (Q-01 B bỏ MF-5, Q-02 B).
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `3d73a7f` (`QĐ-97c`, `QĐ-98a`, `QĐ-100h`, `QĐ-100q`, `QĐ-100x`, `QĐ-62c`, `QĐ-41c(2)`, `FR-3.22`), BE `3e4553b9`.
- Nhóm roadmap: không thuộc G — bó finding `qd96-100-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Sau một lần Owner reset VPS demo, `pnpm ops:seed apply` (mặc định `--fixture shared-demo-v3`) dựng dataset chỉ gồm khái niệm còn
hiệu lực và có sẵn kịch bản cho mọi luật trong phạm vi B (MF-1, MF-2, MF-3, MF-4 phần ngân sách đã duyệt). Kiểm bằng integration
seed trên PostgreSQL + API thật và checklist sau seed ở runbook.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (giao việc Owner 05/11/2026).
- Mode: `technical-enabler`.
- Outcome and owner: lệnh `seed` (`src/cli/seed`, module `installation`); dữ liệu vẫn ghi qua HTTP API đúng vai.
- Boundaries: không route HTTP mới, không migration; chỉ fixture, step, README fixture, `docs/guides/seed.md`.
- Not larger: không thêm dữ liệu MF-5 (gia hạn, usage, mốc ND), không phong bì/chỉ tiêu, không đối soát chi phí.
- Not smaller: v3 là một bản phát hành bất biến, Owner chỉ reset một lần. Nếu tách phần dọn khỏi phần kịch bản mới thì phải phát
  hành v3 rồi v4 và reset VPS hai lần. Vì vậy hạng mục ≈ 20h > 12h, chia ba phase có checkpoint (plan).
- Siblings: mọi hạng mục `qd96-100-*` của phạm vi B (#1–#8, #11–#27, #29); `unified-seed-reset`, `shared-demo-dataset` (nền).
- Scope map: n/a — bó finding ngoài nhóm G.

## Primary Story/AC

| Story | AC                    | Coverage | Phần còn lại thuộc                                                                            |
| ----- | --------------------- | -------- | --------------------------------------------------------------------------------------------- |
| —     | L-901…L-905 (SEED-V3) | n/a      | gỡ chặn `e2e-main-flows-suite` và CP-4: Owner audit full suite + FE demo trên VPS dataset mới |

## Supporting references

Hành vi lấy từ spec các hạng mục #6, #7, #14, #16 (ngân sách), #4/#19 (nhóm), #20, #21, #1/#2/#3/#24 (nghỉ việc), #17/#18
(điều chuyển) và #29. Nền: [unified-seed-reset](../unified-seed-reset/spec.md).

## Explicit out of scope

- **Ranh giới MF-5 (chat khác sở hữu):** 8 thuê bao giữ nguyên như v2 (`MONTHLY`, `TERM`, 01/01–31/12, không linh hoạt). Không
  thêm thuê bao gần ND−7, thuê bao linh hoạt, usage, đề xuất điều chỉnh hay mốc ND (bỏ khỏi ITEMS #28). Seed không đóng seat
  baseline nên `subscriptionCreate` dạng `planId + ownerDepartmentId` (#23) vẫn dùng được; chat MF-5 đổi body thì chỉ sửa
  `catalog.steps.ts`.
- Không có bản ghi nào của phong bì, chỉ tiêu, phiên bản sửa đổi, override, Finance rà soát, gửi thay, `expectedSpendOn`,
  `termConfirmation`, `NEEDS_NEW_TOOL`, `abrupt`, `highValuePercent`; không kịch bản trưởng phòng tự gửi cho mình (L-990).
- Tài liệu demo ở repo Docs (`Figma UI-UX/API-Integration/`): handoff cho Owner.

## Dependencies and blockers

- **Phần B làm cuối** (ITEMS mục 6): chỉ bắt đầu khi các hạng mục mà kịch bản đó dựa vào đã merge vào `feat/qd96-100-alignment`.
  **Phần A** (A0, A1 — mục _Phần A_ dưới) đi theo hàng đợi phần A của MF-1/MF-4 (chỉnh 05/11 theo review main flow).
- Owner reset VPS demo bằng drop DB rồi seed lại (Q-R1); có thể chạy nhiều lần (sau phần A và sau phần B).

## Ownership: module, data, API

`src/cli/seed/**`: `fixture/shared-demo-v3/` (chép v2 rồi sửa; xóa v2 + spec), `demo-fixture.types.ts`, `seed-steps.ts`,
`seed.arguments.ts`, `seed-run.ts`, `seed-calendar.ts`, `steps/*` (+ `personnel.steps.ts`). Không route, không contract chung mới;
mọi lệnh gọi theo hợp đồng cuối của hạng mục chủ.

## Behavior and design

1. **Phát hành:** `id: 'shared-demo-v3'`; giữ marker `DS1`, domain, mã/email của 23 người v2 (FE không đổi tài khoản).
   `--fixture shared-demo-v2` ⟹ `Unknown fixture` (exit 3). Audit có `DEMO_DATASET:` của fixture khác (đọc chung với
   `datasetYear`) ⟹ từ chối `plan`/`apply`, báo "reset bằng wrapper", không ghi gì.
2. **Lịch:** bỏ `spendDay` và nhánh năm sau (#16 bỏ ngày chi; phần năm sau là _cam kết chuyển tiếp_ của #6) ⟹ chỉ ngân sách
   **năm hiện hành**. `calendarRefusal` giữ nguyên.
3. **Ngân sách đã duyệt** (trưởng phòng đề xuất → Finance lập phiên bản **không gửi `reserve`**, để server tính 10 % → Finance gửi →
   Người duyệt chi duyệt). Body theo #14: tiền chỉ `{ amount }`, đề xuất không có `costCenterId`; không có `highValuePercent`.

   | Phòng         | Cơ sở                                | Dự phòng 10 % | Vai trong demo                         |
   | ------------- | ------------------------------------ | ------------- | -------------------------------------- |
   | ENG           | 120.000.000                          | 12.000.000    | rộng: các kịch bản trong số cơ sở      |
   | MKT           | 950.000                              | 95.000        | sát cơ sở ⟹ R10 _dùng dự phòng_        |
   | SAL           | 450.000                              | 45.000        | eo hẹp ⟹ R12 _vượt dự phòng_           |
   | ITO, FIN, BOD | 24.000.000 · 12.000.000 · 12.000.000 | 10 %          | đủ dữ liệu cho dashboard trưởng phòng  |
   | DES           | —                                    | —             | cố ý không có ngân sách ⟹ R9 _bị chặn_ |

   Số MKT/SAL nhỏ là có chủ đích. Mọi Request dùng để minh họa kết quả ngân sách có thời hạn **1 tháng**, tức một kỳ trả tại ngày
   neo, nên chi phí năm hiện hành = đơn giá × số người và kết quả **không phụ thuộc ngày seed** (kể cả 31/12). Dòng kế hoạch của
   MKT/SAL (một dòng mỗi phòng) có số tiền ≤ cơ sở.

4. **Người:** thêm 6 người vào ENG, đều có tài khoản `EMPLOYEE`, thành 29 người / 27 tài khoản. Gồm `NV-OFF1`, `NV-OFF2`,
   `NV-OFF3` (nghỉ việc), `NV-MOV1`, `NV-MOV2` (điều chuyển) và `NV-CTR1` (`CONTRACTOR`). Người không phải `STAFF` (`NV-INT1`,
   `NV-NEW1`, `NV-CTR1`) có `contractEndInDays`; server lưu `contractEndDate = hôm nay + n` (#20). Khi chạy lại, step không so
   sánh trường này.
5. **Request** (`R1`–`R8` giữ như v2, ngoại trừ bỏ `expectedSpendOn` và R1 ghi chú ngày kết thúc do server tính):

   | Mã  | Người gửi · gói · tháng                                   | Đích                                                   | Luật minh họa                                                               |
   | --- | --------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
   | R9  | DES2 · figma · 1                                          | trình lô ⟹ `BLOCKED` `NO_ACTIVE_BUDGET`                | bị chặn, không bước Finance (thay R9 cũ)                                    |
   | R10 | **nhóm** của MKTH cho MKT1+MKT2 · chatgpt · 1 (1.000.000) | trình, chưa xác nhận ⟹ `RESERVE_CONFIRMATION_REQUIRED` | Request nhóm ≥ 2 của trưởng phòng; dùng dự phòng cần trưởng phòng xác nhận  |
   | R11 | **nhóm** của ENGH cho OFF1–3, MOV1–2 · jira · 1           | `COMPLETED`                                            | nhóm ≥ 2 trọn luồng, seat cho MF-2/MF-3                                     |
   | R12 | SAL1 · chatgpt · 1 (500.000 > 495.000)                    | trình ⟹ `BLOCKED` `OVER_RESERVE`                       | bị chặn vì vượt dự phòng                                                    |
   | R13 | DEV1 · tiếp tục R1 (K2) · `extensionMonths` 3             | `COMPLETED`                                            | trong cửa sổ 30 ngày; K2 tự kéo dài, IT nhận `RENEWAL_APPROVED_SHARED_PLAN` |
   | R14 | DEV1 · chatgpt (K1) · 1                                   | `COMPLETED`                                            | gốc cho R15                                                                 |
   | R15 | DEV1 · tiếp tục R14 (K1) · `extensionMonths` 2            | `AWAITING_EXECUTION`                                   | K1 vào hàng đợi IT (`grantQueueList` `RENEWAL`)                             |
   | R16 | CTR1 · jira · 3                                           | `COMPLETED`                                            | ngày kết thúc quyền = ngày hết hợp đồng (sớm hơn ngày theo thời hạn)        |

   Cửa sổ của R13/R15 luôn mở: thời hạn 1 tháng nên ngày kết thúc ≤ hôm nay + 30 ngày. Kiểu dữ liệu: `DemoRequestTarget` bỏ
   `AWAITING_FINANCE_REVIEW`. `DemoRequestScenario` thêm `kind: 'INDIVIDUAL' | 'GROUP' | 'RENEWAL'`, `beneficiaries[]` (GROUP,
   ≥ 2), `renews` + `extensionMonths` (RENEWAL), `expectStage` (`BLOCKED` | `RESERVE_CONFIRMATION_REQUIRED`) kèm
   `blockedReason`.

6. **Đường đi** (`scenario-path.ts`, hàm thuần): thêm `AWAITING_SPEND_DECISION → APPROVE_SPEND` cho đích `AWAITING_EXECUTION`.
   Request có `expectStage`: nếu chưa có lần trình (stage null) thì `SUBMIT_BATCH` một lần, không gửi `reserveConfirmations`;
   stage khớp ⟹ `present`; stage khác ⟹ `conflict`. Stage đọc từ `spendQueueList` của trưởng phòng. Request nhóm của trưởng phòng
   bắt đầu ở `AWAITING_SPEND_SUBMISSION` (#19); cấp quyền chạy theo từng dòng.
7. **MF-2** (`personnel.steps.ts`, Super Admin, sau R11, căn cứ hợp lệ theo #24, mang tag dataset):
   - OFF1: `WITH_LAST_DAY`, ngày cuối = hôm nay + 10 ngày làm việc ⟹ đang bàn giao, tác vụ thu hồi có `not_before`/hạn (#1).
   - OFF2: `WITH_LAST_DAY`, ngày cuối = **hôm nay** ⟹ sweeper chặn từ ngày kế tiếp. Owner demo _hủy sau ngày cuối_ trực tiếp:
     trạng thái chặn được giữ, lý do thu hồi bị gỡ, IT Admin mở khóa có lý do (`QĐ-100q`).
   - OFF3: `BLOCK_NOW`, ngày cuối = hôm nay + 5 ngày làm việc ⟹ bị chặn ngay; IT có tác vụ thu hồi khẩn. Nếu IT chưa khóa thì
     cuối ngày phát `ACCOUNT_LOCK_OVERDUE`.
8. **MF-3** (Super Admin ghi điều chuyển hiệu lực **hôm nay**; điều chuyển trong ngày có hiệu lực ngay):
   - MOV1: ENG → FIN, để trống rà soát với hạn **mặc định** (`TRANSFER_REVIEW_WORKING_DAYS`); seed **không** rút ngắn hạn và
     không dựng ca quá hạn (OQ-28-1, Owner 05/11: chỉ demo bằng tay — khi demo, Super Admin đổi tham số hạn trên màn hình rồi tự
     tạo điều chuyển). Ngày áp mặc định xem ở `defaultRevocationAfter`.
   - MOV2: ENG → SAL. SALH quyết `STILL_NEEDED`, `termMonths` 1, có `reason` ⟹ Request thay thế nằm ở hàng đợi trình của SALH.
     Trình trực tiếp ra `WITHIN_BASE` (200.000 ≤ 450.000; R12 bị chặn nên không tính vào số đang chờ).

9. **Trưởng phòng xem chi tiết nhân viên** (#29): không cần dữ liệu riêng. Checklist mở `ENGH → DEV1`, thấy 2 quyền (Jira, ngày
   kết thúc đã kéo dài bởi R13; ChatGPT) và Request đang mở R8, R15. Response không có email hay loại hợp đồng.
10. **Chạy lại:** mọi step mới idempotent theo tag. Hồ sơ nghỉ việc, điều chuyển hay quyết định rà soát đã có (ở bất kỳ trạng thái
    nào) ⟹ `present`. Tài khoản OFF2/OFF3 đã bị chặn vẫn tính `present` ở `org.accounts`, không thành `conflict`. Chạy lại cùng
    ngày ⟹ exit 2.
11. **README fixture** viết lại: bảng phòng có thêm cột ngân sách; bảng người; bảng Request có cột _luật minh họa_; MF-2/MF-3;
    _diễn biến theo ngày_ (D+1: OFF2 bị chặn; MOV1 tới hạn mặc định sau 5 ngày làm việc — demo quá hạn làm tay theo OQ-28-1);
    _ranh giới MF-5_. Bỏ "exception review", `[15, 7]`, nhánh năm sau.

### Runbook Owner — reset VPS một lần

1. Điều kiện: release chứa v3 đã deploy, CI xanh; seed **≥ 1 ngày làm việc** trước buổi demo nếu muốn thấy OFF2 bị chặn (kịch bản
   theo ngày). Owner đã chấp nhận drop toàn bộ DB rồi seed lại (Q-R1, QUESTIONS mục D).
2. `.env.seed` đặt `SEED_ALLOW_RESET=true`; chạy `seed.sh` như [seed.md](../../../guides/seed.md) _Các lần sau_ với
   `--confirm-reset <POSTGRES_DB>` (dump trước DROP, migrate, `apply` mặc định v3). Mong đợi exit 0.
3. Kiểm ngay: chạy lại với `--continue` ⟹ exit 2. MKTH: hàng đợi có R10 cần xác nhận. SALH: R12 `OVER_RESERVE` + Request thay thế
   của MOV2. DESH: R9 `NO_ACTIVE_BUDGET`. ITA1: `grantQueueList` có R15. OFF3 đăng nhập bị từ chối. FINH: MOV1 có
   `defaultRevocationAfter`. ENGH: chi tiết DEV1 (mục 9). `budgetMine` MKT/SAL: dự phòng = 10 %.
4. Ngày làm việc kế tiếp: OFF2 bị từ chối đăng nhập. Đặt lại `SEED_ALLOW_RESET=false`; lưu `seed-reports/` vào nhật ký vận hành.

### Phần A — FE nối tối nay (chỉnh 05/11 theo review main flow, bỏ điều kiện _làm cuối_ cho phần A)

FE cần dữ liệu đúng contract mới để nối MF-1/MF-4 tối nay, nên hạng mục tách hai phần; phần A **không chờ** mọi hạng mục B:

- **A0 (đầu hàng đợi, trước mọi phần A khác):** đổi tên fixture `shared-demo-v2` → `shared-demo-v3` (Q-R1 — trước đây gắn với
  `remove-finance-review-path`, nay là phần B nên dời lên đây); CLI mặc định v3; bỏ ràng buộc bất biến v2. Mọi phần A sau chỉ sửa v3.
- **A1 (sau các phần A của MF-1/MF-4):** mục 1–3 (lịch một năm, 6 phòng có ngân sách đã duyệt, dự phòng 10 % server tính, DES
  không ngân sách), mục 5 cho R1–R12 và R13 (tiếp tục K2 trong cửa sổ — cần `renewal-chaining-and-window` phần A), mục 6, mục 10.
  Dữ liệu cho FE: R2 `WITHIN_BASE`, R10 `NEEDS_RESERVE` chờ xác nhận, R12 `OVER_RESERVE`, R9 `NO_ACTIVE_BUDGET`, R10/R11 nhóm ≥ 2,
  R1 có ngày kết thúc server tính.
- **B:** mục 4 (người MF-2/MF-3, `contractEndInDays` cần `approved-end-date` phần B), R14–R16 (K1 qua IT, nhà thầu), mục 7–9,
  README đầy đủ và runbook (mục 11), integration seed đủ bộ. Chạy khi các hạng mục MF-2/MF-3/B tương ứng đã merge.

## Test matrix

| AC / rủi ro     | Tình huống                                     | Cấp test                            | Kết quả mong đợi                                                                                              | Bằng chứng sau implement |
| --------------- | ---------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------ |
| L-901, L-902    | fixture v3                                     | unit                                | không đích `AWAITING_FINANCE_REVIEW`, không `highValuePercent`, không `expectedSpendOn`/`reserve` trong body  | planned                  |
| L-903           | ngân sách                                      | unit + integration                  | 6 phòng `ACTIVE`, `reserve = 10 %` cơ sở, DES không có                                                        | planned                  |
| ba kết quả      | đơn giá × người với cơ sở/dự phòng             | unit (bất đẳng thức) + integration  | R2 `WITHIN_BASE`, R10 `NEEDS_RESERVE`, R12 `OVER_RESERVE`, R9 `NO_ACTIVE_BUDGET`                              | planned                  |
| ngày seed       | seed ngày 31/12 (lịch giả)                     | integration                         | chỉ ngân sách năm hiện hành; bốn kết quả không đổi (thay `seed-next-year`)                                    | planned                  |
| nhóm ≥ 2        | R10, R11                                       | unit + integration                  | ≥ 2 người; R11 `COMPLETED` đủ 5 dòng                                                                          | planned                  |
| tiếp tục        | R13, R15                                       | integration                         | R13 `COMPLETED`, ngày kết thúc R1 kéo dài, IT có thông báo; R15 ở `grantQueueList`                            | planned                  |
| ngày kết thúc   | R16, R1                                        | integration                         | R16 = ngày hết hợp đồng; R1 = ngày duyệt + 1 tháng − 1                                                        | planned                  |
| MF-2            | OFF1–3                                         | integration                         | OFF1, OFF2 `HANDING_OVER`; OFF3 bị chặn ngay; login OFF3 lỗi chung                                            | planned                  |
| MF-3            | MOV1, MOV2                                     | integration                         | MOV1 rà soát `OPEN`, `dueOn` = hạn mặc định (không đổi tham số); MOV2 có `replacementRequest` ở hàng đợi SALH | planned                  |
| `scenario-path` | đích/stage mới                                 | unit                                | bảng chuyển đúng; stage khác ⟹ `null` (conflict)                                                              | planned                  |
| phát hành       | `--fixture shared-demo-v2`; DB có Audit của v2 | unit (`seed.arguments`, `seed-run`) | exit 3, không ghi                                                                                             | planned                  |
| chạy lại        | apply hai lần                                  | integration (`seed-rerun`)          | lần hai exit 2, không `conflict`                                                                              | planned                  |
| README          | bảng tài khoản/kịch bản                        | unit (`shared-demo-v3.spec.ts`)     | khớp fixture                                                                                                  | planned                  |

## Open questions

- **OQ-28-1 — ĐÃ ĐÓNG (Owner 05/11, QUESTIONS mục D):** _chỉ demo bằng tay_ — seed không tạo kịch bản quá hạn rà soát điều chuyển,
  không có step đổi tham số. Phần dưới giữ làm lịch sử phương án.
- (lịch sử) **OQ-28-1 — Rút ngắn hạn rà soát điều chuyển để demo _quá hạn_ nhanh.** Mặc định, hạn là 5 ngày làm việc
  (`TRANSFER_REVIEW_WORKING_DAYS`) và báo trước 2 ngày, nên MOV1 chỉ bị thu hồi mặc định sau ≈ 7 ngày làm việc. API không cho ghi
  điều chuyển ở ngày quá khứ (`EFFECTIVE_DATE_IN_PAST`).
  - A) Không đụng tham số; thu hồi mặc định tự xảy ra sau ≈ 7 ngày làm việc.
  - **B (khuyến nghị)** Step `params.transfer-review-short` (Super Admin, qua API, có Audit) đọc giá trị hiện tại, đặt hai tham số
    về 1 ngay trước bước điều chuyển, rồi khôi phục ngay sau đó (cả khi lỗi). Hạn được chụp lúc mở rà soát, nên chỉ MOV1/MOV2 có
    hạn ngắn và thu hồi mặc định xảy ra ở D+2.
  - C) Như B nhưng không khôi phục. Mọi điều chuyển demo sau đó đều có hạn 1 ngày, sai so với mặc định nghiệp vụ.
  - Nếu Owner chọn A thì bỏ step và sửa dòng _diễn biến theo ngày_ trong README.

## Definition of Done

- [ ] Mọi dòng test matrix có test đỏ-trước/xanh-sau; integration seed chạy trên revision cuối (Owner chạy full suite ở CP-4).
- [ ] Quick gates (`typecheck`, `lint`, `arch:check`, `rules:check`, `test:gates`) + test theo file xanh.
- [ ] `fixture/shared-demo-v3/README.md`, `docs/guides/seed.md`, `docs/guides/huong-dan-dev-moi.md` trỏ v3; không còn tham chiếu v2
      ngoài lịch sử spec cũ.
- [ ] Runbook ở trên được Owner chạy trên VPS; nhật ký vận hành ghi kết quả thật, phần chưa kiểm ghi rõ.

## Changes and acceptance

05/11/2026: bản đầu (`draft`). Chưa nghiệm thu.
05/11/2026 (chỉnh 05/11 theo review main flow): tách **phần A** (A0 đổi tên fixture đầu hàng đợi; A1 dữ liệu MF-1/MF-4 cho FE) và
**phần B** (MF-2/MF-3, K1, nhà thầu, runbook); áp câu trả lời Owner OQ-28-1 (chỉ demo bằng tay — bỏ step rút ngắn hạn, MOV1 hạn mặc
định) và Q-R1 (drop DB, đổi tên v2 → v3 dời từ #11 lên A0); mã `USES_RESERVE` → `NEEDS_RESERVE`. Vẫn `draft`.
05/11/2026 (điều phối viên, gỡ lỗi `rules:check`): dòng `n/a` nêu hạng mục phía sau `e2e-main-flows-suite`; plan đổi `#### Task` →
`### Task` để checker nhận task. Không đổi thiết kế.
05/11/2026 (`QĐ-101n`, thay `QĐ-101m`): Request không bao giờ gắn dòng kế hoạch (không tự khớp, không output `planLine`/`offPlan`) và dòng BM-10/phiên bản bỏ khoảng mua, kỳ dịch vụ, chu kỳ lặp, ngày hiệu lực báo giá — gỡ ở [`qd96-100-plan-line-removal-and-bm10-lines`](../qd96-100-plan-line-removal-and-bm10-lines/spec.md) (Đợt 1); `qd96-100-plan-line-auto-match` đã xóa. Fixture: bỏ `planLine` của Request và 4 trường khoảng mua của dòng ngân sách (`finance.steps.ts`). Không viết lại phần khác.

06/11/2026 (Đợt 1, `verified` local, chưa commit; C-M1): seed đã được làm sạch theo yêu cầu Owner và chạy xanh với API sau Đợt 1. **Đã làm:** marker `DS1` → `SV` (tag `[SV-R*]`); email `*@saoviet.example`; tổ chức "Công ty Cổ phần Công nghệ Sao Việt"; "Quản trị hệ thống" (không "demo"); mã phòng không tiền tố (`BOD`, `ENG`, `DES`, `FIN`, `ITO`, `MKT`, `SAL`, `OPS`); Cost Center `CC-*`; mã nhân viên `NV-*`; bỏ hậu tố "(demo)"; Phòng Vận hành "Phòng mới thành lập, đang hoàn thiện cấu hình" (cố ý thiếu trưởng phòng/IT/Cost Center). Request không còn `planLine` (QĐ-101n); dòng ngân sách chỉ `{description, planId?, seats?, amount, note?}`; phiên bản chỉ gửi `base` (dự phòng mặc định 10 %). Ngân sách đã duyệt cho **hai năm** (năm nay và năm sau) của ENG, MKT, SAL qua luồng đề xuất → phiên bản → Người duyệt chi; DES cố ý không có để R9 `AWAITING_FINANCE_REVIEW`. **Hoãn tới Đợt 3 (phần A1):** R10–R16, ngân sách 6 phòng, MF-2/MF-3 trong dataset (OFF*/MOV*), runbook; kịch bản R9 đổi khi bước 11 bỏ đường rà soát của Finance. Kết quả: unit seed 98/98; integration seed 5 file 17/17; `seed:local` vào DB trống thoát 0, 24 bước ĐÃ GHI.
Tài khoản đăng nhập (mật khẩu của `SEED_DEMO_ACCOUNT_PASSWORD`; Super Admin theo `SEED_SUPER_ADMIN_PASSWORD`): Super Admin `system.admin@saoviet.example`; Người duyệt chi `an.nguyen@` (NV-CEO); Finance `phuc.trinh@` (FIN1); IT Admin `quan.ly@` (ITA1), `rang.mai@` (ITA2); trưởng phòng `bich.tran@` (BOD), `cuong.le@` (ENG), `khanh.bui@` (DES), `ngoc.phan@` (FIN), `thanh.tran@` (ITO), `uyen.dinh@` (MKT), `yen.truong@` (SAL); nhân viên `dung.pham@`, `em.hoang@`, `giang.vu@` (ENG), `lan.do@`, `manh.ngo@` (DES), `vinh.lam@`, `xuan.chau@` (MKT), `anh.kieu@`, `bao.quach@` (SAL), `son.ta@` (OPS); tất cả `@saoviet.example`.
06/11/2026 (C-L): nhánh năm sau được giữ ở dạng ngân sách hai năm thay vì bỏ (khác mục 2 ở trên); bỏ `spendDay`, tùy chọn `forceNextFiscalYear` và `seed-next-year.integration-spec.ts` (đã thừa: `seed.integration-spec` kiểm 6 phiên bản đã duyệt và mọi phiên bản `APPROVED`); test "không chữ demo" quét cả fixture và tiêu đề các bước.

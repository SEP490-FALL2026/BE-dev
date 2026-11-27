# HANDOFF — chat điều phối 27–28/11/2026 → chat điều phối sau

> Đọc file này trước, rồi: handoff `docs/reviews/coordinator-2026-11-27/HANDOFF-CHAT.md` (§0 người/làn, §3 bài học, §5–§6 quy ước — vẫn hiệu lực)
> và `coordinator-2026-11-25/HANDOFF-CHAT.md` (§0 bối cảnh, §3 quy ước); memory `MEMORY.md` (mọi `feedback_*`, `project_redesign_2026_11_21`,
> `project_two_person_process`, `project_wave8_test_cleanup`); Docs `rules/skill-workflow.md`; `docs/reviews/redesign-w3-2026-11-22/DELTA-W3-FINAL.md`;
> `docs/reviews/redesign-w4-2026-11-25/SPLIT-2-LANES.md`. Sổ QĐ tới **`QĐ-120p`** (quyết định Owner 27–28/11 ghi trong DELTA-W3-FINAL §2 và mục 2 dưới,
> chưa vào sổ QĐ — gom ở lượt tài liệu cuối).

## 1. Trạng thái (28/11 sáng)

| Việc                             | Trạng thái                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin/dev`                     | `86562437` = đợt 1 + 2 + Redis (#94, #96) + **đợt 3 (#97 `be5b24e8`)** + spec đợt 4 bản 3.2 (#92)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Đợt 3 — ĐÓNG**                 | Lượt đóng: FIX-W3-FINAL-4 → -5 → **FIX-W3-AUDIT** (audit toàn bộ 906 file: 5 Opus A1 catalog/A2 budgets/A3 licensing-requests/A4 test-CI/A5 kiến trúc + 1 đối kháng; sửa 3 gói Sonnet song song + D-1 + vòng nối 1–3, mỗi vòng Opus review). CI cuối `46034784496` (int) và `46039491046` (dev sau squash): quality/http-contract/e2e/inband xanh; ngoài nợ cũ chỉ **55 test fixture §4 FIX-W3-FINAL-4** (đợt 8) + 1 test đồng hồ UTC `device-return-task` (đang sửa ở PR mục 3). Tài liệu đóng: `DELTA-W3-FINAL.md` (CI, quyết định Owner, contract FE, nợ, câu SELECT trước deploy) |
| **Redis (đợt 5 phần 1) — xong**  | #94 + #96 (sửa sau review: guard deploy `slm-redis` mồ côi/thiếu `--requirepass`, log `warn`, `moreRemain`, `LEASE_LOST_AFTER_FAILURE`, R-04 (b)(e), hai ca email đặt hạn `now() - 1 phút` vì lệch đồng hồ PostgreSQL)                                                                                                                                                                                                                                                                                                                                                                |
| **Đợt 4 — sắp bắt đầu, hai làn** | Spec 3.2 trên `dev` (đã kiểm lại sau audit đợt 3: DL-24, migration cuối `000700`, phạm vi lệnh cổng 0, file C-CONV, fixture qua builder, 4 luật riêng làn B). **Neon** (orchestrator + subagent) làn N; **Bảo** (Codex) làn B — prompt ở mục 4. Chưa có nhánh `feat/redesign-w4*` lúc viết                                                                                                                                                                                                                                                                                            |
| **PR nhỏ sau đợt 3 — đang làm**  | Mục 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| API description đợt 3            | **Chưa gửi** — đợi PR mục 3 vào `dev` (đổi 3 mã lỗi). Nội dung: DELTA-W3-FINAL §3 + bảng đổi mã của PR mục 3. Thư mục `Docs/Figma UI-UX/API-Integration/`                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Deploy đợt 3 + Redis             | Chưa. Trước deploy Owner chạy câu `SELECT` DELTA-W3-FINAL §5 + PROGRESS-biz (M5, A-6) trên DB demo; checklist Redis ở mô tả PR #94 (`REDIS_PASSWORD`, `docker inspect slm-redis`, `TRUST_PROXY_HOPS=1`, `QUEUE_BOARD_ENABLED=false`). Owner 27/11: deploy cho FE test bỏ tạm integration CI nhưng `quality` phải xanh: `dev → main` → CI tay → Actions **Backend CD** `mode = deploy`                                                                                                                                                                                                 |
| Worktree                         | Còn: thư mục chính (Owner chuyển về `dev`), `Code/BE-errcodes` (PR mục 3), `Code/BE-coord` (nhánh handoff này — gỡ khi PR merge). Thư mục rác `Code/BE-w3-review`, `Code/BE-w4-spec` (git đã gỡ, Windows khóa file — Owner xóa tay). Container rác `slm-test-db-a`, `slm-test-db-b` (Docker Desktop treo lúc đó — `docker rm -f`)                                                                                                                                                                                                                                                     |

## 2. Quyết định Owner 27–28/11 (chưa vào sổ QĐ)

| Mã            | Quyết định                                                                                                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-1 (FINAL-5) | Tạo lô K4 cho ứng dụng đã ngừng dùng ⟹ 422 `LICENSE_LOT.APPLICATION_RETIRED` (giữ luật cũ)                                                                                                                                                          |
| Q-1 (AUDIT)   | Rà soát tính lại tháng đã có `seat_month_runs`: tính lại seat/ngày, seat đã có dòng **giữ giá đã ghi**, seat mới theo giá hiện hành                                                                                                                 |
| Q-2           | Bàn giao IT hiện số `workspaces`, `licenseLots` (response + thông báo) — đã làm ở đợt 3                                                                                                                                                             |
| Q-3           | Seed ghi mốc `seat_month_runs` giữ ở đợt 3; **đợt 8** chuyển qua repo sở hữu + audit `DEMO_DATASET.*` + ngoại lệ `operational-commands.md`                                                                                                          |
| O-1           | Baseline ngân sách tách hàng theo **(thuê bao, gói)** — cả hàng phòng lẫn hàng kho chưa phân bổ                                                                                                                                                     |
| O-2           | Gia hạn bị từ chối vì gói của ứng dụng đã ngừng ⟹ **409** `SUBSCRIPTION_RENEWAL.PERIOD_REFUSED` `details { reason, planId }`                                                                                                                        |
| Chia đợt 4    | Hai làn không đợi nhau (SPLIT-2-LANES): Bảo làn B 5 gói, Neon làn N 10 gói + 6 gói nối sau khi gộp                                                                                                                                                  |
| Mã lỗi        | Đổi đúng 3 mã ở `POST /subscriptions/{id}/lines` (mục 3); giữ `SEAT_LEDGER.*`, `NOT_IN_CHARGE`/`NOT_RESPONSIBLE`                                                                                                                                    |
| UTC           | Sửa cả 4 nhóm "hôm nay theo UTC" (mục 3) ngay, không đợi đợt 8                                                                                                                                                                                      |
| Migration TZ  | `Asia/Ho_Chi_Minh` cứng trong migration bù dữ liệu đợt 3 (`20261203000100:226,245`, `20261203000200:134`): **không sửa** (chạy một lần, dữ liệu hiện có đều giờ VN, cấm sửa migration đã commit) — chỉ ghi chú cạnh câu kiểm `time_zone` ở DELTA §5 |
| PR / merge    | Điều phối mở PR khi CI không có test đỏ mới so với nền; Owner squash                                                                                                                                                                                |

## 3. PR nhỏ sau đợt 3 — `fix/w3-error-codes-business-today` (worktree `Code/BE-errcodes`, Sonnet đang làm pha 2)

- **Mã lỗi** (`subscription-line.http-errors.ts`, route `POST /subscriptions/{id}/lines`): `WORKSPACE_VENDOR_MISMATCH` → `SUBSCRIPTION_LINE.WORKSPACE_VENDOR_MISMATCH`;
  `PLAN.NOT_FOUND` (422) → `SUBSCRIPTION_LINE.PLAN_NOT_FOUND`; `APPLICATION.RETIRED` (lỗi) → `SUBSCRIPTION_LINE.APPLICATION_RETIRED`. Ghi vào DELTA-W3-FINAL §3.
- **Ngày nghiệp vụ theo giờ tổ chức** (`businessToday`/`businessDateAt`): `catalog/subscription/subscription-priced.repo.ts:28,141,148` + chuỗi gọi (chọn giá
  gói — tiền); `licensing/assignment/assignment.service.ts:572`; `optimization/ghost-seat/ghost-seat.repo.ts:290`; `usage/vendor-account-review/vendor-account-intake.service.ts:98`;
  kiểm cột `usage-evidence.service.ts:21,165-166`. Test đỏ→xanh lúc 01:00 giờ VN.
- **Test đồng hồ:** `test/integration/devices/device-return-task.integration-spec.ts:~313-325` chọn thứ bằng `getUTCDay()` ⟹ đỏ khi CI chạy 00–07h VN.
- Không đụng `src/modules/requests/**` (đợt 4). Việc điều phối: đọc diff, Opus review, CI tay, phân loại từng test so với nền, mở PR, Owner squash ⟹
  báo Neon/Bảo gộp `dev` ở cổng kế tiếp (`openapi:export`) ⟹ **gửi API description đợt 3**.

## 4. Đợt 4 — prompt và theo dõi

- **Neon (làn N):** dán prompt "đợt 4 làn N" (chat điều phối 28/11 đã soạn; tóm tắt: đọc SPLIT-2-LANES + CODE-PROMPT + SPEC + PLAN + DELTA trên `dev`;
  gói A-DB ‖ A-POL1 ⟹ cổng A + G-HTTP ⟹ B-CORE ‖ B-REPLY ⟹ cổng B ⟹ C-WITHDRAW ‖ C-BATCH ‖ C-CONV ‖ C-VIEW, C-LISTS ⟹ cổng C; tối đa 4 subagent, mỗi
  gói một worktree; nhánh làn `feat/redesign-w4-lane-n`; harness lấy từ `origin/feat/redesign-w4-lane-b` bằng `git checkout … -- test/support/request-ticket-harness.ts`;
  không `git stash`; gộp `dev` khi PR mục 3 vào; xong cổng C thì dừng).
- **Bảo (làn B):** dán `docs/reviews/redesign-w4-2026-11-25/CODE-PROMPT-BAO.md`. A-T1 (commit đầu chỉ harness, push ngay) → A-POL2 → cổng B0 (CI) →
  B-SUBMIT-R → B-NEED-R → B-SPEND-R → cổng B1 (CI) → dừng.
- **Điều phối:** review từng cổng của mỗi làn (Opus đọc diff gói, test thật, luật tiền/quyền, test giả; CI theo từng test so với nền) ⟹ khi cả hai làn
  xong: worktree `Code/w4-join`, gộp `--no-ff` làn N rồi làn B vào `feat/redesign-w4` (SPLIT §4), CI, review + đối kháng ⟹ `FIX-W4-*.md` mỗi làn ⟹ Neon làm
  gói nối C-SUBMIT, C-NEED, C-SPEND ⟹ D-MOBILE, D-SEED, D-DOCS ⟹ cổng D ⟹ PR `feat/redesign-w4` → `dev` ⟹ API description đợt 4.
- Rủi ro đã biết (re-verify 27/11): harness là điểm chờ duy nhất; `AccessRequestRecord.ticket` bắt buộc (làn B dựng record bằng cast); `SpendItemOutcome.reason`
  ↔ enum `ticketSpendResultSchema` phải cùng SPEC §8.3 (C-SPEND thêm test chéo); ca gửi lại cần ghi chú; làn B không thêm vào `requests.module.ts`.

## 5. Thứ tự việc còn lại toàn dự án

1. PR mục 3 ⟹ API description đợt 3 ⟹ (Owner) deploy đợt 3 + Redis.
2. Đợt 4 (mục 4).
3. Spec đợt 5 phần 2 (AI) sau khi đợt 4 vào `dev` (dùng khung hàng đợi Redis — SPEC Redis §9).
4. Đợt 6 (mở lại 4 + 6 operation tách, không giữ route `deprecated`; `GET /audit-actions`, lý do đổi tham số, tải chính sách, `KPI-2`; ghi QĐ sửa `QĐ-118b`(4)).
5. **Đợt 8** (mục 6).
6. Đợt 7 (11 việc SBF-INVENTORY + 3 điểm cần Owner) — **sau** đợt 8 (Owner 25/11).
7. **Prompt 4+6** (mục 7).
8. Lượt tài liệu cuối: QĐ-121+ (gom `DECISIONS.md` W3M-* trở đi + quyết định mục 2), BRD/Scope (4.19/2.15) kèm dọn lịch sử, US (150 phát hiện + 11 câu),
   file giải thích kho (+ L-6), `mainflows.md`, vẽ lại ERD (từ `prisma/models`) và State Machine (mẫu trường), BRD §7.5 lưu giữ outbox/phiên 30 ngày.

## 6. Đợt 8 — test, seed, Tool (trước Prompt 4+6)

- **FIX-TEST:** 113 test nợ cũ (đỏ trên dev nền `45478093759`) + **55 test fixture đợt 3** (DELTA-W3-FINAL §1: `application-retirement-http`,
  `contract-link-integrity`, `contract-usage-sources`, `department-tools-http`, `departure-vendor-admins`, `plan-key-binding`, `provisioning-grant-http`,
  `provisioning-revocation-open`, `provisioning-revocation-read-contracts`, `seat-baseline-contracts`, `seat-guards-http`, `shared-pool-subscription-http`,
  `subscription-owner-and-milestone-http`, `subscription-vendor-admins-http` — fixture dùng `plan_workspace_*`, K1/K3, hai thuê bao trùng gói; luật còn hiệu
  lực ⟹ sửa fixture, không đổi kỳ vọng) + nợ test đợt 4–6 + dòng `FIX-TEST-biz.md`/`FIX-TEST-tech.md` các đợt (gồm test "báo tăng seat" gọi
  `tellSeatIncrease` trực tiếp — xóa cùng code chết R5 ở Prompt 4+6).
- **Rà toàn bộ test:** xóa test/flow cũ theo danh sách Owner duyệt (`project_wave8_test_cleanup`); gỡ cầu nối test `test/support/legacy-perpetual-lot-bridge.ts`
  - `disposable-database.ts:298` (trigger chỉ có ở test, sinh lô cho K4 `PERPETUAL`) — fixture K4 qua `POST /license-lots`.
- **Seed + demo D-1…D-4:** seed ghi mốc `seat_month_runs` qua repo sở hữu + audit `DEMO_DATASET.*` + ngoại lệ trong `docs/rules/operational-commands.md` (Q-3);
  seed luật làm thay R2-4; kịch bản demo gọi API.
- **Tool:** nghiên cứu lại, nối server, Task Scheduler, cờ khớp tài khoản, câu gửi nội dung prompt.
- **Nợ khác:** NF-1…5, R3-5, R3-7, R3-8, R4-5…10, RC-11.

## 7. Prompt 4+6 — lượt cuối (sau đợt 8 và đợt 7)

**A. Review sâu toàn hệ thống (4a, chỉ đọc)** — nhiều Opus chia theo module/luồng + reviewer độc lập (Fable chỉ khi luật tiền/quyền cực nặng, hỏi Owner):

1. Từng luồng: 5 MF + SBF, đối chiếu BRD/QĐ/SPEC các đợt, chạy đầu → cuối.
2. Từng API: quyền (vai, phạm vi phụ trách QĐ-118, IDOR), mã lỗi + status (một mã một status, tên `DOMAIN.REASON` thống nhất), contract (DTO strict,
   OpenAPI, phân trang), **luật tiền** (giá theo dòng, seat-tháng, cam kết, ngân sách, hóa đơn, làm tròn).
3. Logic: luật ngoài SPEC, test giả, fallback im lặng, nuốt lỗi, giá trị cứng, ngày nghiệp vụ theo giờ tổ chức (rà lại sau PR mục 3).
4. Kiến trúc: ADR-0019, không query bảng module khác, trần file/thư mục, thứ tự khóa, giao dịch, extension point.
5. Chạy thật: CI đầy đủ + seed + gọi API theo kịch bản demo.
6. Đầu ra: danh sách sửa trước demo (Critical/Required/Nit) + câu SPEC im lặng hỏi Owner (AskUserQuestion, có khuyến nghị).

**B. Dọn code thừa `src`** (Owner 27/11) — công cụ `knip`/`ts-prune`, grep tham chiếu, `arch:capabilities`, đồ thị module, đối chiếu SPEC; **danh sách
cho Owner duyệt trước khi xóa**, CI đầy đủ sau khi xóa. Đã biết từ đợt 3 (FIX-W3-AUDIT §5):

- R5: tăng/giảm `purchasedQuantity` ở `catalog/subscription/subscription-change.service.ts` (`:138-139`, `:265-290`), `subscription/seat-increase/*`,
  mô tả OpenAPI `subscription.dto.ts:120,124`.
- R20: `budgets/seat-month/seat-month-pool.service.ts` (`SeatMonthPoolService`, chỉ test dùng), `catalog/public/workspace.api.ts` (`WorkspaceApi` không
  export/không ai dùng, README:37), `SeatLedgerApi.findSeatPurchases`, nhánh kỳ K2 "pre-line" (`renewal-seats-needed.service.ts:44`,
  `subscription-period.service.ts` `input.unitPrice!`, `renewal-record.service.ts:146`, `plan-usage.repo.ts:51`, `subscription-granting.repo.ts:134`).
- Budgets: `commitment-month.repo.ts` (`listPriorYearHeldByYear`, `countHeldByYear`, `clearSettled`, `lockByCommitmentAndMonths`, `ofCommitment`),
  `seat-month.policy.ts:86-99` tham số `sliceRemainingMinor`, `seat-month-subscription.service.ts:143` (`linesOfSubscription ?`).
- `requests/access-request/pricing.policy.ts:216` `ceilDiv`; `requests/grant/grant-settlement.service.ts:130` fallback `ALREADY_BORNE` không tới được (R11);
  `license-key-assignment.service.ts:79` `costBorne ?? true`; `it-handover.policy.ts` tham số `?`.
- R13: `licensing/assignment/occupancy/assignment-seat-occupancy.listener.ts:61-75` quyết "đã từng cấp" bằng bảng audit ⟹ cột nghiệp vụ (cần Owner).
- Hai định nghĩa "recurring" (`20261204000100` vs `000500`) — chỉ dữ liệu cũ; drop bảng `plan_workspace_profiles`/`plan_workspace_admins` (migration mới).
- Nit đã biết: `shared-pool.service.ts:230,241,250` query thừa + N+1 K4; `shared-pool-vacancy.service.ts` `subscriptionId` mang id lô; tên `legacyProfiles`;
  `/license-lots` và `/subscription-lines/:id/purchases` chia hai module (ghi README); D-6 Redis `ActionTokenRepo` khai lại dưới Symbol.

**C. Sửa (4b)** — Sonnet theo danh sách đã duyệt, Opus review mỗi vòng, CI đầy đủ, PR. **D.** API description cuối cho FE/Mobile.

## 8. Bài học 27–28/11 (thêm vào §3 handoff 27/11)

- **`git stash` dùng chung mọi worktree** — agent pop nhầm stash của agent khác. Mọi prompt có worktree: cấm `git stash`; xem trạng thái cũ bằng
  `git show <sha>:<file>` hoặc commit tạm.
- Agent song song + Docker Desktop dễ treo ⟹ cho phép Postgres 17 local `D:/Tool/pgsql` (cluster tạm, cổng riêng, dọn sau) để chạy **riêng** spec đã sửa.
- **Adapter Prisma 7 bỏ tên constraint** của trigger `RAISE … USING CONSTRAINT` ⟹ mapping theo tên rơi 500; đã sửa tập trung ở `pg-pool.ts`
  (`constraint-name.ts`). Lỗi mới theo CHECK/trigger: luôn có integration chứng minh 409/422, không chỉ http mock.
- Gộp nhiều gói ⟹ luôn chạy `pnpm arch:graph`/`arch:routes` + gates + seed spec trước CI (lần gộp đầu đỏ `quality` vì `module-graph.md`, seed hồi quy vì DTO đổi).
- Test chọn ngày bằng giờ UTC (`getUTCDay`, `toISOString().slice(0,10)`) đỏ khi CI chạy 00–07h VN ⟹ dùng ngày cố định hoặc múi giờ tổ chức.
- Đổi DTO (bỏ trường) ⟹ grep seed/fixture/harness cùng lượt.
- Squash PR khi CI tay chưa xong là được nếu nhánh int đã có CI xanh trên cùng cây — vẫn phải phân loại CI sau squash (lần này lộ test đồng hồ).

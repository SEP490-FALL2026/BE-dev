# Spec: g7-g1-g2-recommendations — rule engine nền, `G1`/`G2` hằng ngày và bảng tối ưu của IT (S4a)

- Phụ trách: Cursor/dev được Owner giao.
- Thiết kế ban đầu bởi: Owner + Claude (phiên 05/11/2026).
- Thiết kế: `draft` — **spec dang dở, chưa review** (agent viết spec dừng giữa chừng; điều phối viên hạ `ready` → `draft` 05/11/2026, plan khung). Owner review: thiết kế đã duyệt 05/11/2026 ([DESIGN.md](../../../reviews/g7-usage-design-2026-11-05/DESIGN.md)); spec chưa review.
- Nguồn: Docs `3d73a7f` + thay đổi chưa commit 05/11/2026 (`QĐ-101`, BRD v4.1, US đã sửa — `US-10-01`, `US-10-05`, `FR-4.9`,
  `FR-4.12`, `FR-4.12b`, `QĐ-35b`, `QĐ-62o`, `QĐ-100c`, `QĐ-98g`, `QĐ-58b`), BE `3e4553b9`.
- Nhóm roadmap: G7 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · [Test plan](test-plan.md).

## Business outcome

Mỗi ngày hệ thống tự sinh khuyến nghị `G1` (seat trống của thuê bao `PER_SEAT`) và `G2` (seat của người đã nghỉ việc) nhãn
_Xác định từ dữ liệu nội bộ_, không trùng, không tự thu hồi; IT Admin xem bảng tối ưu theo nhóm và bấm thu hồi `G2` (tạo tác vụ
qua `SBF-18`). Kiểm bằng integration (Postgres thật: claim `rule_runs`, partial unique cổng 8) và HTTP theo vai.

## Sizing decision

- Container: G7 (nhóm giao việc) — chỉ là container.
- Mode: `grouped-stories`.
- Outcome and owner: phát hiện tất định `G1`/`G2` và màn xem của IT; capability `optimization/rule-run` + `optimization/recommendation` (module mới `optimization`, tầng mới T7).
- Boundaries: bảng `rule_runs`, `ghost_seat_recommendations`, `subscription_rule_states`; một sweeper giờ, một lệnh CLI; 4 operation HTTP (3 GET, 1 POST); listener `OrganizationChangeListeners` (`EMPLOYEE_LEFT`) và `RevocationListeners`; chỉ IT_ADMIN.
- Not larger: `G3`/`G4`, quyết định trưởng phòng, mức tin cậy, tiết kiệm: `g7-g3-g4-decisions` (cần nguồn usage S2a/S3a); nối gia hạn, dashboard, thời hạn lưu: `g7-usage-downstream-retention`.
- Not smaller: bảng `ghost_seat_recommendations` + cổng 8 + lịch chạy là nền mà bảng IT đọc ngay; tách bảng IT ra thì không có màn kiểm AC-1/AC-2 của `US-10-01`.
- Siblings: `g7-g3-g4-decisions`, `g7-usage-downstream-retention`.
- Scope map: [G7](../../../roadmap.md#work-item-decomposition-g7).

## Primary Story/AC

| Story    | AC                     | Coverage | Phần còn lại thuộc                           |
| -------- | ---------------------- | -------- | -------------------------------------------- |
| US-10-01 | AC-1→AC-10             | full     | —                                            |
| US-10-05 | AC-2, AC-5, AC-7, AC-8 | partial  | AC-1, AC-3, AC-4, AC-6: `g7-g3-g4-decisions` |

## Supporting references

- `FR-4.9` (cổng 1, 8 cho `G1`/`G2`), `FR-4.12` (`G2` tầng _Cần xử lý_), `FR-4.12b`, `INV-01`/`BR-10.4` (lời mời chờ chiếm chỗ),
  `SoD-6` (không tự thu hồi), `QĐ-98g` (`G2` thu hồi qua `SBF-18`), `QĐ-58b` (IT khác xử lý thay có Audit).
- Vế `G2` của Story G6 hiện chờ G7 ở `g6-downstream-integration`: `US-03-04` AC-3, AC-21 (sinh `G2`, không `G2` cho K5);
  `US-07-05` AC-12, AC-13, AC-15 (`G2` hiện tới khi thu hồi xong / lúc giữ gỡ / khi lỗi). Lát này hiện thực hành vi đó (listener
  `EMPLOYEE_LEFT`, trạng thái theo tác vụ thu hồi); khóa scope map thuộc G6 — **coordinator quyết** chuyển sang lát này.
- `US-10-02` AC-4, AC-7, AC-9 (vế `G1`/`G2`) do lát này chạy; chủ AC là `g7-g3-g4-decisions` (một chủ cho cả tám cổng).
- Code: sweeper mẫu `licensing/subscription-renewal/subscription-renewal.job.ts:1-61`; ADR-0018; lệnh mẫu
  `src/cli/assign-subscription-owner/assign-subscription-owner.command.ts`; nguồn `GHOST_SEAT`/`DEPARTURE` ở
  `licensing/public/licensing.types.ts:231-247`; `LicensingApi.openRevocation` `licensing/public/licensing.api.ts:49`.

## Explicit out of scope

- Mức tin cậy, tiết kiệm, `G3`/`G4`, trạng thái bằng chứng (`US-10-05` AC-6): `g7-g3-g4-decisions`.
- Đề xuất điều chỉnh thuê bao từ `G1` (`US-11-05`): G8; lát này chỉ cấp dữ liệu qua `g7-usage-downstream-retention`.
- Cấp lại seat trống trước khi mua (`FR-3.23`, `US-07-12`): luồng Request có sẵn.
- `G1` của khoản mua vĩnh viễn: vẫn sinh (`OQ-E-10` chỉ hỏi cách hiển thị hành động — câu hỏi mở 2).

## Dependencies and blockers

- Không chặn bởi nguồn usage (`US-10-01` AC-3). Phụ thuộc code đã có: licensing (`openRevocation`, `RevocationListeners`),
  organization (`OrganizationChangeListeners`, `getEmployees`, `getItAdminScope`), notifications (`notifyInApp`).
- Migration `optimization_g1_g2` là Task 1, trước mọi code.
- Tầng mới: sửa `scripts/arch/tiers.cjs` (đề xuất dưới). Ở HEAD `808318a4` hàng T6 đã có `ai-assist`.

## Ownership: module, data, API

- Module mới `src/modules/optimization/` (tầng T7, giữa hàng `personnel…` và `dashboards`). Đề xuất `tiers.cjs`:

```js
  ['personnel', 'onboarding', 'installation', 'ai-assist'],
  // Waste rules and recommendations read usage, licensing and personnel through their facades.
  ['optimization'],
  // The role overviews read through the facades of the modules below, personnel among them.
  ['dashboards'],
```

(Nếu S1a/S2a đặt `devices` vào hàng T5 và `usage` vào hàng T6 như DESIGN §1 thì sửa cùng file; lát này chỉ thêm hàng `optimization`.)
Cập nhật bảng tầng trong `ARCHITECTURE.md` và `docs/rules/module-structure.md` (T7 `optimization`, T8 `dashboards`).

- Capability: `rule-run/` (claim, lịch, job, CLI module), `recommendation/` (bảng, controller IT, `g1-g2/` phát hiện, listener).
- Facade mới (cùng lát, ở module chủ dữ liệu, chỉ đọc):
  - `catalog/public/catalog-subscription-facts.api.ts` → `CatalogSubscriptionFactsApi.listInForce(day, page: { afterId?, limit ≤ 500 })`:
    thuê bao `ACTIVE` hiệu lực tại `day` với `{ id, applicationId, applicationName, applicationKind, planId, planName, pricingModel,
provisioningType, kind, purchasedQuantity, ownerDepartmentId }` (thứ tự `id`).
  - `licensing/public/licensing-seat-facts.api.ts` → `LicensingSeatFactsApi`: `occupiedOn(subscriptionIds, day)` (luật đếm của
    `SeatOccupancyReader`, `catalog.extension-points.ts:8-12`, gồm lời mời chờ), `openPersonalSeatHolders(day, page)` (employeeId
    phân biệt, thứ tự id), `openPersonalSeatsOf(employeeIds, day)` (`{ assignmentId, employeeId, planId, subscriptionId|null,
revocation: { taskId, status, sources } | null }`), một số câu lệnh cố định.
- Bảng sở hữu: `rule_runs`, `ghost_seat_recommendations`, `subscription_rule_states` (thêm vào `PRISMA_MODEL_OWNER`,
  `test/gates/architecture-boundaries.gate-spec.ts:32`). Không đọc bảng module khác.
- Lệnh mới `rules-run` (`node dist/cli.js rules-run`, `pnpm ops:rules-run`, alias `rules-run-cli`). Tên `rules:run` của DESIGN không
  dùng được làm tên thư mục `src/cli/<lệnh>/` — xem `## Changes and acceptance`.

## Behavior and design

### Data (Prisma `prisma/models/optimization.prisma`)

```prisma
enum RuleSet { G1_G2 G3_G4 }
enum RuleRunTrigger { SCHEDULE MANUAL }
enum RuleRunStatus { RUNNING SUCCEEDED FAILED }
enum GhostSeatGroup { G1 G2 G3 G4 }
enum GhostSeatTier { MONITOR REVIEW ACTION }
// Full lifecycle up front so the partial unique of gate 8 never changes; G3/G4 states are written by g7-g3-g4-decisions.
enum GhostSeatState { OPEN PAUSED RECLAIM_DECIDED RECLAIM_IN_PROGRESS EXECUTED KEPT EXEMPTED INVALIDATED CLOSED }
enum GhostSeatCloseReason { FREE_SEATS_GONE SEAT_ENDED SUBSCRIPTION_OUT_OF_SCOPE EXECUTED KEPT EXEMPTED ACTIVITY_SEEN TRANSFER_REVIEW_DECIDED }
enum SubscriptionRuleGate { GATE_1_NOT_PER_SEAT INTERNAL_SOFTWARE NO_PURCHASED_QUANTITY }

model RuleRun {
  id             String         @id @default(uuid()) @db.Uuid
  organizationId String         @map("organization_id") @db.Uuid
  ruleSet        RuleSet        @map("rule_set")
  runDate        DateTime       @map("run_date") @db.Date   // org-local day; Monday of the week for a weekly set
  trigger        RuleRunTrigger
  status         RuleRunStatus
  attempt        Int            @default(1)
  created        Int            @default(0)
  closed         Int            @default(0)
  skipped        Int            @default(0)
  failedSubjects Int            @default(0) @map("failed_subjects")
  startedAt      DateTime       @map("started_at") @db.Timestamptz(3)
  finishedAt     DateTime?      @map("finished_at") @db.Timestamptz(3)
  @@index([organizationId, ruleSet, status])
  @@map("rule_runs")
}

model GhostSeatRecommendation {
  id                 String               @id @default(uuid()) @db.Uuid
  organizationId     String               @map("organization_id") @db.Uuid
  group              GhostSeatGroup
  tier               GhostSeatTier?       // G2 = ACTION; G1 has none
  state              GhostSeatState
  subscriptionId     String?              @map("subscription_id") @db.Uuid   // G1 always; G2..G4 when the seat has one
  assignmentId       String?              @map("assignment_id") @db.Uuid     // null only for G1
  employeeId         String?              @map("employee_id") @db.Uuid
  applicationId      String               @map("application_id") @db.Uuid
  planId             String               @map("plan_id") @db.Uuid
  departmentId       String?              @map("department_id") @db.Uuid     // G1: owner of the subscription; else placement on detection day
  freeSeats          Int?                 @map("free_seats")                 // G1 only, refreshed by each daily run
  revocationTaskId   String?              @map("revocation_task_id") @db.Uuid
  createdRunId       String?              @map("created_run_id") @db.Uuid    // null when created by the EMPLOYEE_LEFT listener
  createdAt          DateTime             @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt          DateTime             @updatedAt @map("updated_at") @db.Timestamptz(3)
  closedAt           DateTime?            @map("closed_at") @db.Timestamptz(3)
  closeReason        GhostSeatCloseReason? @map("close_reason")
  @@index([organizationId, group, state, departmentId])
  @@index([assignmentId])
  @@map("ghost_seat_recommendations")
}

model SubscriptionRuleState {
  subscriptionId String               @id @map("subscription_id") @db.Uuid
  organizationId String               @map("organization_id") @db.Uuid
  gate           SubscriptionRuleGate?   // null = evaluated by G1
  runId          String               @map("run_id") @db.Uuid
  evaluatedAt    DateTime             @map("evaluated_at") @db.Timestamptz(3)
  @@map("subscription_rule_states")
}
```

SQL thêm trong migration (Prisma không biểu diễn):

```sql
-- Gate 8 (FR-4.9): one open recommendation per seat and group, and one open G1 per subscription. PAUSED counts as open.
CREATE UNIQUE INDEX ghost_seat_open_per_seat ON ghost_seat_recommendations (assignment_id, "group")
  WHERE assignment_id IS NOT NULL AND state IN ('OPEN','PAUSED','RECLAIM_DECIDED','RECLAIM_IN_PROGRESS');
CREATE UNIQUE INDEX ghost_seat_open_g1 ON ghost_seat_recommendations (subscription_id)
  WHERE "group" = 'G1' AND state IN ('OPEN','PAUSED','RECLAIM_DECIDED','RECLAIM_IN_PROGRESS');
-- A scheduled run is claimed once per organization, rule set and day (ADR-0018); manual runs are not unique.
CREATE UNIQUE INDEX rule_runs_scheduled_once ON rule_runs (organization_id, rule_set, run_date) WHERE trigger = 'SCHEDULE';
ALTER TABLE ghost_seat_recommendations
  ADD CONSTRAINT ghost_seat_subject CHECK (("group" = 'G1') = (assignment_id IS NULL) AND ("group" <> 'G1' OR free_seats > 0 OR state <> 'OPEN')),
  ADD CONSTRAINT ghost_seat_closed CHECK ((closed_at IS NULL) = (state IN ('OPEN','PAUSED','RECLAIM_DECIDED','RECLAIM_IN_PROGRESS'))),
  ADD CONSTRAINT ghost_seat_g2_tier CHECK ("group" <> 'G2' OR tier = 'ACTION');
```

H7: không bảng append-only ở lát này (cả ba bảng có UPDATE) — `RUNTIME_TABLE_EXCEPTIONS` không đổi; DML mặc định.

### Lịch và claim (`rule-run/`)

- `RuleRunSweeper` (`rule-run/rule-run.job.ts`, mẫu `subscription-renewal.job.ts`): lần đầu sau 5 phút, rồi mỗi giờ, timer `unref`, lỗi
  ghi một dòng `Rule run sweep failed: ${describeForOperator(error)}`.
- Mỗi lượt, với mỗi `RuleSet`: `today = OrganizationReadApi.businessToday()`; lịch đọc `RULE_SCHEDULE_G1_G2` / `RULE_SCHEDULE_G3_G4`
  (`DAILY`→`runDate = today`; `WEEKLY`→`runDate` = thứ Hai của tuần chứa `today`). Policy thuần `ruleRunDateOf(schedule, today)`.
- Claim: `INSERT … (trigger 'SCHEDULE', status 'RUNNING') ON CONFLICT DO NOTHING RETURNING id`; không có dòng ⟹ instance khác giữ, bỏ.
  Dòng `FAILED`, hoặc `RUNNING` có `started_at` < now − 2 giờ, với `attempt < 3` được lấy lại bằng `UPDATE … SET attempt = attempt + 1,
status = 'RUNNING', started_at = now() WHERE id = $1 AND (status = 'FAILED' OR started_at < now() - interval '2 hours') RETURNING id`.
- Set `G3_G4` chỉ được claim khi đã đăng ký executor (lát `g7-g3-g4-decisions`); ở lát này sweeper chỉ chạy `G1_G2`.
- Chạy theo **từng đối tượng một transaction** (một thuê bao / một nhân viên); lỗi một đối tượng tăng `failed_subjects`, ghi log
  `step <id>`, đi tiếp. Cuối lượt: `SUCCEEDED` (kể cả có `failed_subjects`) hoặc `FAILED` (lỗi ngoài vòng), audit `RULE_RUN.FINISHED`
  (`actorKind SYSTEM`, `after: { ruleSet, runDate, created, closed, skipped, failedSubjects }`).

### `G1` (`recommendation/g1-g2/`)

Với mỗi trang `CatalogSubscriptionFactsApi.listInForce(today)`:

1. `applicationKind = INTERNAL` ⟹ state `INTERNAL_SOFTWARE`, không khuyến nghị (`US-10-01` AC-8).
2. `pricingModel ≠ PER_SEAT` ⟹ `GATE_1_NOT_PER_SEAT` (AC-7). `purchasedQuantity` null ⟹ `NO_PURCHASED_QUANTITY`.
3. `free = purchasedQuantity − occupiedOn(id, today)` (lời mời chờ vẫn chiếm chỗ — AC-9).
4. `free > 0`: có `G1` mở ⟹ cập nhật `free_seats` (không audit); chưa có ⟹ `INSERT … ON CONFLICT DO NOTHING` (cổng 8 bằng partial
   unique), audit `GHOST_SEAT_RECOMMENDATION.CREATED`. `free ≤ 0` và có `G1` mở ⟹ đóng `CLOSED`/`FREE_SEATS_GONE`, audit `…CLOSED`.
5. Upsert `subscription_rule_states`. Thuê bao rời phạm vi (hết hạn, không còn `PER_SEAT`) mà còn `G1` mở ⟹ đóng `SUBSCRIPTION_OUT_OF_SCOPE`.

### `G2`

- Hằng ngày: duyệt `openPersonalSeatHolders(today)` theo trang 500 → `OrganizationReadApi.getEmployees(ids)` → người `status =
TERMINATED` → `openPersonalSeatsOf` → mỗi seat thuộc thuê bao `PER_SEAT` (K5/nội bộ: không — AC-8, `US-03-04` AC-21; không phải
  `PER_SEAT`: cổng 1) và không có `G2` mở ⟹ tạo `G2` tầng `ACTION`, `departmentId` = phòng của người đó ngày nghỉ
  (`getOwningUnits`), không qua trưởng phòng (AC-2). Không qua cổng 2–7 (AC-6).
- Ngay lúc nghỉ việc: `GhostSeatDepartureListener` (`recommendation/g1-g2/ghost-seat-departure.listener.ts`, `binds =
[OrganizationChangeListeners]`, khóa `optimization.g2-on-departure`) nhận `EMPLOYEE_LEFT` trong transaction ghi nghỉ việc và tạo `G2`
  theo cùng hàm (idempotent nhờ partial unique). Listener không ném lỗi nghiệp vụ.
- Sinh `G2` ⟹ thông báo `GHOST_SEAT_G2_DETECTED` cho IT Admin phụ trách phòng (`getItAdminInChargeOfDepartment`; null ⟹ mọi IT Admin
  dùng được), `eventKey = ghost-seat-g2:{recommendationId}`, params `{ group: 'G2' }`, subject `{ type: 'GHOST_SEAT_RECOMMENDATION', id }`.
- Seat của `G2` kết thúc ngoài luồng của lát (hủy, chuyển chuỗi) ⟹ lượt hằng ngày đóng `CLOSED`/`SEAT_ENDED`.

### Thu hồi `G2` và trạng thái theo tác vụ

- `POST /ghost-seat-recommendations/{id}/reclaims` (IT_ADMIN, `{}`): chỉ `G2` `OPEN`. Seat đã có tác vụ thu hồi sống (vd. của hồ sơ nghỉ
  việc) ⟹ gắn `revocation_task_id` vào tác vụ đó, không mở thêm; chưa có ⟹ `LicensingApi.openRevocation(tx, actor, { assignmentId,
source: 'DEPARTURE', decision: { decidedByEmployeeId: actor.employeeId, decidedRole: 'IT_ADMIN', referenceKind:
'GHOST_SEAT_RECOMMENDATION', referenceId: id } })`. State → `RECLAIM_IN_PROGRESS`. Audit `GHOST_SEAT_RECOMMENDATION.RECLAIM_REQUESTED`
  kèm `onBehalfOf` khi IT Admin không phụ trách phòng (`QĐ-58b`, AC-8). Không gì tự tạo tác vụ (AC-10, `SoD-6`).
- `GhostSeatRevocationListener` (`binds = [RevocationListeners]`): `AFTER_WORK` với `task.status = COMPLETED` ⟹ mọi khuyến nghị mở của
  `task.assignmentId` → `EXECUTED` (`closeReason EXECUTED`); `CLOSED_FAILED` ⟹ `G2` về `OPEN`, `revocation_task_id = null`
  (`US-07-05` AC-15). Không ghi tiết kiệm.
- Khóa: hàng `ghost_seat_recommendations` `FOR UPDATE` → rồi gọi licensing (thứ tự cố định; listener của licensing chỉ chạm hàng
  khuyến nghị sau khi licensing đã khóa task — không đảo vì reclaim không giữ khóa task trước khi khóa khuyến nghị).

### API

| Route                                                   | Truy cập                    | `operationId`                       | `message`                                     |
| ------------------------------------------------------- | --------------------------- | ----------------------------------- | --------------------------------------------- |
| `GET /api/v1/ghost-seat-recommendations`                | `@RequireRoles('IT_ADMIN')` | `ghostSeatRecommendationList`       | `GHOST_SEAT_RECOMMENDATION.LISTED`            |
| `GET /api/v1/ghost-seat-recommendations/{id}`           | `@RequireRoles('IT_ADMIN')` | `ghostSeatRecommendationGet`        | `GHOST_SEAT_RECOMMENDATION.FETCHED`           |
| `GET /api/v1/ghost-seat-recommendation-summary`         | `@RequireRoles('IT_ADMIN')` | `ghostSeatRecommendationSummaryGet` | `GHOST_SEAT_RECOMMENDATION.SUMMARY_FETCHED`   |
| `POST /api/v1/ghost-seat-recommendations/{id}/reclaims` | `@RequireRoles('IT_ADMIN')` | `ghostSeatRecommendationReclaim`    | `GHOST_SEAT_RECOMMENDATION.RECLAIM_REQUESTED` |

**Request — query của list** (mọi field tùy chọn):

| field              | kiểu & ràng buộc                       | bắt buộc? (ca vắng)                | nguồn       | dùng ở                               |
| ------------------ | -------------------------------------- | ---------------------------------- | ----------- | ------------------------------------ |
| `group`            | `G1\|G2\|G3\|G4`                       | không (mọi nhóm)                   | IT chọn tab | `US-10-05` AC-1 tách nhóm            |
| `status`           | `OPEN\|CLOSED`                         | không (`OPEN`)                     | IT lọc      | AC-5 thẻ còn hiện tới khi xử lý xong |
| `departmentScope`  | `MINE\|ALL`                            | không (`MINE` = `getItAdminScope`) | IT chọn     | `QĐ-58b`, AC-8 xử lý thay            |
| `departmentId`     | uuid                                   | không                              | IT lọc      | bảng theo phòng phụ trách            |
| `applicationId`    | uuid                                   | không                              | IT lọc      | bảng theo ứng dụng                   |
| `page`, `pageSize` | int ≥ 1; `pageSize` ≤ 100, mặc định 20 | không                              | FE          | API-LIST-DETAIL.1                    |

Path `{id}`: uuid. Body `reclaims`: `z.strictObject({})` (không field: actor, thời điểm, nguồn đều suy ra — F-2).

```ts
export const ghostSeatListQuerySchema = z.strictObject({
  group: z.enum(['G1', 'G2', 'G3', 'G4']).optional(),
  status: z.enum(['OPEN', 'CLOSED']).default('OPEN'),
  departmentScope: z.enum(['MINE', 'ALL']).default('MINE'),
  departmentId: z.uuid().optional(),
  applicationId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export const ghostSeatReclaimBodySchema = z.strictObject({});
```

**Response — summary của dòng** (`ghostSeatRecommendationSummarySchema`):

| field                                                                                                    | tiêu thụ                                                            |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `id`, `group`                                                                                            | thẻ, tab nhóm (`US-10-05` AC-1)                                     |
| `basis` = `INTERNAL_DATA` (G1/G2) \| `USAGE_EVIDENCE`                                                    | nhãn _Xác định từ dữ liệu nội bộ_ (`US-10-01` AC-1, AC-2; `QĐ-35b`) |
| `tier` (`null` cho G1)                                                                                   | _Cần xử lý_ của `G2` (AC-2)                                         |
| `state`                                                                                                  | trạng thái vòng đời (US-10-05 _Dữ liệu_)                            |
| `recommendedAction` = `REASSIGN_OR_REDUCE_AT_ADJUSTMENT` \| `REVOKE_NOW` \| `HEAD_DECISION` \| `MONITOR` | hành động của `G1` (AC-1, `US-10-05` AC-2), `G2` (AC-5)             |
| `application {id,name}`, `plan {id,name}`, `subscriptionId`                                              | đối tượng thuê bao                                                  |
| `employee {id, employeeCode, workEmail}` \| null                                                         | đối tượng Assignment; **không** họ tên (`US-14-05` AC-1)            |
| `department {id, code, name}` \| null                                                                    | phòng phụ trách, xử lý thay (AC-8)                                  |
| `freeSeats` \| null                                                                                      | số seat trống (`US-10-01` AC-1)                                     |
| `revocationTask {id, status}` \| null                                                                    | `G2` dẫn tới thu hồi, hiện tới khi xong (AC-5, `US-07-05` AC-12/15) |
| `createdAt`                                                                                              | thứ tự, thời điểm sinh                                              |

Detail = summary `.extend({ closedAt, closeReason, assignmentId })` (lát `g7-g3-g4-decisions` mở rộng thêm bằng chứng). Summary
endpoint: `{ groups: [{ group, openCount }] }` (`maxItems 4`, đủ bốn nhóm cả khi 0) — số lượng mỗi nhóm (AC-1). Reclaim trả
`{ recommendationId, state, revocationTask: { id, status }, taskCreated: boolean }`.

**Collection:** summary riêng, `select` trực tiếp (join employee/application qua **một** lời gọi facade theo lô cho cả trang:
`OrganizationReadApi.getEmployees`, `CatalogApi.getPlanSummaries`), thứ tự `created_at desc, id`, đếm + trang trong một transaction
`RepeatableRead`; số câu lệnh không phụ thuộc số dòng (test đếm câu lệnh). Không mảng lồng trong item; `groups` của summary `maxItems 4`.

**Lỗi** (`recommendation/recommendation.errors.ts` + `.http-errors.ts`):

| Mã                                                               | HTTP | Khi                                                             |
| ---------------------------------------------------------------- | ---- | --------------------------------------------------------------- |
| `RECOMMENDATION.NOT_FOUND`                                       | 404  | id không tồn tại                                                |
| `RECOMMENDATION.NOT_OPEN`                                        | 409  | reclaim khi state ≠ `OPEN`                                      |
| `RECOMMENDATION.NOT_RECLAIMABLE`                                 | 409  | reclaim `G1` (và `G3`/`G4` cho tới khi lát sau mở)              |
| `RECOMMENDATION.SEAT_NOT_REVOCABLE`                              | 409  | licensing ném `RevocationRefusedError`/`AssignmentNotOpenError` |
| `PROVISIONING.ANOTHER_IT_ADMIN_NEEDED` (mã có sẵn của licensing) | 409  | IT Admin thu hồi seat của chính mình (`QĐ-77m`)                 |
| `VALIDATION_ERROR`                                               | 422  | query/path/body sai                                             |

### Lệnh `rules-run`

`node dist/cli.js rules-run --set G1_G2|G3_G4 [--json]`: graph `optimization/rule-run/rule-run-cli.module.ts`, gọi
`OptimizationApi.runRules({ ruleSet, trigger: 'MANUAL' })`; từ chối khi set chưa có executor (exit 3) hoặc khi có run `RUNNING` cùng
set < 2 giờ (exit 4); xong exit 0, in số `created/closed/skipped/failedSubjects`; audit `RULE_RUN.FINISHED` `actorKind OPERATOR`.

## Test matrix

Chi tiết ở [test-plan](test-plan.md). Tóm tắt: unit (`ruleRunDateOf`, phát hiện G1/G2, mapper), integration (claim hai instance, partial
unique, listener `EMPLOYEE_LEFT`, `RevocationListeners`, bộ dữ liệu đáp án AC-5), HTTP (quyền, validate, field ma), gate (tầng, owner map,
operational-commands).

| AC / rủi ro         | Tình huống                            | Cấp test    | Kết quả mong đợi                                          | Bằng chứng sau implement |
| ------------------- | ------------------------------------- | ----------- | --------------------------------------------------------- | ------------------------ |
| US-10-01 AC-1, AC-9 | 100 seat/88 chiếm (2 lời mời); 10/8+2 | integration | G1 12 seat; 0 ⟹ không G1                                  | chưa chạy                |
| US-10-01 AC-2, AC-6 | E1 nghỉ hôm qua; E3 seat 5 ngày       | integration | G2 ACTION, IT nhận thông báo, không hàng đợi trưởng phòng | chưa chạy                |
| US-10-01 AC-4       | chạy lại khi G2 mở                    | integration | không G2 thứ hai (partial unique)                         | chưa chạy                |
| US-10-01 AC-10      | G2 mở, không thao tác                 | integration | không tác vụ thu hồi                                      | chưa chạy                |
| ADR-0018            | hai instance claim cùng ngày          | integration | đúng một `rule_runs`                                      | chưa chạy                |
| Field ma            | schema OpenAPI ↔ bảng field           | HTTP        | khớp; không `fullName`                                    | chưa chạy                |

## Definition of Done

- [ ] Mọi primary AC có test xanh ở cấp ghi trong test-plan; vế `G3`/`G4` của `US-10-05` để lát sau.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, gate/test theo file xanh; Owner chạy full suite lúc audit.
- [ ] `openapi.json`, `openapi-example-manifest`, `api-coverage-manifest`, `routes.md`, `module-graph.md`, module card `optimization` cập nhật.
- [ ] `docs/rules/security-jobs.md` thêm đoạn `RuleRunSweeper`; `docs/rules/operational-commands.md` thêm `rules-run`.

## Câu hỏi mở

1. Người nhận thông báo `G2` khi phòng không có IT Admin phụ trách: đề xuất mặc định mọi IT Admin dùng được (như `getItAdminScope`).
2. `G1` của khoản mua vĩnh viễn (`OQ-E-10`): mặc định vẫn sinh với `recommendedAction = REASSIGN_OR_REDUCE_AT_ADJUSTMENT`; FE ghi
   _không có điểm điều chỉnh_ khi `kind = PERPETUAL` — chờ Owner.
3. Tên lệnh `rules-run` thay `rules:run` (giới hạn tên thư mục) — đề xuất giữ, thêm script `rules:run` trỏ `ops:rules-run` nếu Owner muốn.

## Changes and acceptance

- 05/11/2026: lập spec từ DESIGN §5, §10, §12. Lệch DESIGN: (a) tên lệnh `rules-run`; (b) enum `GhostSeatState` khai đủ từ lát này để
  partial unique cổng 8 không đổi ở lát sau; (c) `G2` dùng nguồn thu hồi `DEPARTURE` (không `GHOST_SEAT`) vì `GHOST_SEAT` buộc người xác
  nhận bàn giao là trưởng phòng đã quyết (`licensing/handover/handover-confirmer.policy.ts:35`), còn `G2` không có quyết định trưởng phòng.
- Chưa nghiệm thu.

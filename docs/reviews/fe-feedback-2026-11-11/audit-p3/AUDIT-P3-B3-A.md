# AUDIT P3-B3-A — US-1 (màn usage) + US-2 (thiết bị, đẩy sớm) + FIX-A1 (F01 ngày)

- Reviewer: Opus, CHỈ ĐỌC (không chạy pnpm/jest/docker, không checkout). Đọc qua `git show 78a938c2:<path>`; dòng ghi theo 78a938c2.
- Skill đã đọc/dùng: `agent-skills:code-review-and-quality` (process + review 5 trục, nhãn mức), `superpowers:verification-before-completion`
  (mọi kết luận có bằng chứng đọc code; không tuyên bố test xanh/đỏ vì không chạy).
- Commit soi: `48a0d2b4` US-1.1, `54d7140d` US-1.2, `720f2e49` US-1.3, `43530e18` US-1.4, `030c0cfc` US-1.4b, `2dea3a12` US-2.1,
  `ad3d1740` US-2.2 (+ migration `20261113004400`), `aaf24866` FIX-A1.2; regenerate `1bc287d9`, `bc76c249`.
- Nguồn: `project-decisions.md` (QĐ-09, QĐ-100c, QĐ-101c, QĐ-103j/y, QĐ-110m/p/q, QĐ-111ap/aw/ax/ay/be), BRD (`FR-4.9`, `FR-4.10`,
  `FR-4.12`, `BR-MF5-01/02`), SPEC §5 US-1/US-2 + D8/D9, PLAN US-1.x/US-2.x, F1-USAGE D5/D6, OVERNIGHT-DECISIONS D-67…D-69, D-72, D-73,
  `docs/rules/module-structure.md`, `api-contract.md`, `database-business.md`.

## Tổng kết

| Mức | Số | Mã |
| --- | --- | --- |
| Critical | 0 | — |
| Required | 2 | B3A-01, B3A-02 |
| Optional | 8 | B3A-03 … B3A-10 |
| Nit | 4 | B3A-11 … B3A-14 |

---

## Required

### B3A-01 — Required — Đẩy sớm không bao giờ có đối tượng trên dữ liệu thật: lượt tuần không tạo dòng `G4 MONITOR` và còn đóng dòng `MONITOR` sẵn có

- **File:dòng (78a938c2):** `src/modules/optimization/usage-rules/usage-rules-seat.service.ts:158` (`if (tier === null || tier === 'MONITOR') return this.watchOnly(...)`),
  `:167-174` (`watchOnly` đóng `OUT_OF_SCOPE` mọi `MONITOR` còn chưa quyết); route `src/modules/optimization/escalation/escalation.policy.ts:4-12,23`
  chỉ nhận `tier === 'MONITOR'`.
- **Kịch bản:** Chi (ENG) Figma không hoạt động 45 ngày ⟹ lượt tuần `G3/G4` chỉ ghi trạng thái seat `INACTIVE`, không có dòng khuyến nghị
  ⟹ FE không có `recommendationId` để gọi `POST /ghost-seat-recommendations/escalations`. Dòng `MONITOR` có từ seed/bản cũ cũng bị lượt tuần kế tiếp
  đóng `OUT_OF_SCOPE` (`watchOnly`), nên sau một tuần route chỉ còn trả `NOT_WATCH`. Toàn bộ test integration của escalation dựng dòng bằng
  `w.seedRecommendation({ tier: 'MONITOR' })` (`test/integration/optimization/ghost-seat-escalation.integration-spec.ts:46-57`), không ca nào đi
  từ lượt tuần ⟹ test xanh nhưng tính năng chết. D-73/US-2-Q1 tự ghi nhận điều này và khuyến nghị B nhưng chọn A.
- **Căn cứ:** `QĐ-111ay` ("IT chỉ được đẩy sớm **khuyến nghị** `G3`/`G4` tầng _Theo dõi_ sang _Cần xem xét_"), `QĐ-09` (sửa bởi 111ay),
  BRD `FR-4.12` hàng _Theo dõi_ và `BR-MF5-01`; F1-USAGE D5 ví dụ "luật tuần sinh khuyến nghị `G4` tầng `MONITOR`; Lan … bấm Gửi trưởng phòng";
  SPEC S9 + `DEMO-8` ("`G3`/`G4` _Theo dõi_ có thể đẩy sớm"). D-73(1)=A làm QĐ không thực hiện được ⟹ D-n trái QĐ/BRD.
- **Cách sửa (đúng phương án B của D-73, route không đổi):**
  1. `usage-rules-seat.service.ts` `conclude`: tách nhánh `tier === null` (gọi `watchOnly` như cũ) khỏi `tier === 'MONITOR'`; với `MONITOR`:
     `existing ? this.keepExisting(c, existing, finding, open) : this.create(c, finding, open)` (đường `create` đã đặt `tier: finding.tier`,
     `state: transfer ? 'PAUSED' : 'OPEN'`, bằng chứng chụp lại — đúng TC-3).
  2. `watchOnly` chỉ còn cho `tier === null`: dòng `MONITOR` chưa quyết mà lượt sau seat hoạt động lại thì đường `settleExisting`/phủ định hiện có
     đóng; bỏ điều kiện `existing?.tier === 'MONITOR'` khỏi nhánh đóng `OUT_OF_SCOPE` (hoặc chỉ đóng khi `tier === null`).
  3. Giữ `isRoutedTier` (`decision-routing.policy.ts:17`) như cũ ⟹ `MONITOR` không bao giờ định tuyến/thông báo (`SoD-2`, `QĐ-09`); kiểm
     `GET /ghost-seat-recommendations` của MANAGER không trả tầng `MONITOR` (lọc `tier IN ('REVIEW','ACTION')` nếu chưa có).
  4. `keepExisting`: dòng `MONITOR` lên `REVIEW` khi lượt sau đủ ≥ 60 ngày (đọc lại tier vào dòng đang có) — kiểm có sẵn chưa, nếu không thì thêm
     `repo.update(tier)` như `raiseTierEarly`.
  5. Sửa 5 ca M5-18 ở `test/integration/optimization/ghost-seat-g3-g4.integration-spec.ts` ("a watch … no recommendation") thành "a watch is an
     IT-only recommendation" và cập nhật số "chưa đóng" của `groups.G4` ở tóm tắt; ghi D-73 đổi (1) A→B, xóa `US-2-Q1` khỏi Chờ Owner hoặc ghi
     "đã làm B".
- **Test/mutation nên thêm:** integration chạy lượt tuần trên seat 45 ngày không hoạt động ⟹ có dòng `G4 MONITOR OPEN`, `routed_at` null, không
  thông báo ⟹ `POST …/escalations` với id đó ⟹ `ESCALATED`, `AWAITING_DECISION`; chạy lượt tuần lần hai ⟹ dòng đã đẩy giữ `REVIEW` (không bị đóng).
  Mutation: trả lại `tier === 'MONITOR'` vào điều kiện `watchOnly` ⟹ ca mới đỏ.

### B3A-02 — Required — Đẩy sớm không kiểm lại cổng 3 "nghỉ dài / đang bàn giao" (chỉ kiểm vế ân hạn điều chuyển)

- **File:dòng:** `src/modules/optimization/escalation/escalation-facts.service.ts:30-46` (chỉ đọc `listSeatsForRules`, `getTransfersInOverlap`,
  placement), `escalation.policy.ts:14-30` (comment dòng 18 "The eight gates were passed when the recommendation was made; nothing here judges the
  days again").
- **Kịch bản:** Lượt tuần thứ Hai tạo `G4 MONITOR` cho Bình; thứ Tư Bình bắt đầu nghỉ dài hoặc hồ sơ nghỉ việc vào `HANDING_OVER`; thứ Năm IT đẩy
  sớm ⟹ `ESCALATED`, trưởng phòng nhận `GHOST_SEAT_NEW` về một người đang nghỉ dài/bàn giao — đúng loại "báo động giả" mà cổng 3 sinh ra để chặn.
  Lượt tuần sau mới đóng (`closeLeftOut`, `usage-rules-seat.service.ts:181-193`), sau khi trưởng phòng đã bị báo. Code lại kiểm *mới* vế ân hạn
  điều chuyển của cùng cổng 3 (`getTransfersInOverlap`), nên hai vế còn lại của cổng 3 bị bỏ không nhất quán.
- **Căn cứ:** BRD `FR-4.12` hàng _Theo dõi_: "đẩy sớm … **vẫn qua đủ 8 cổng lọc của `FR-4.9`**"; `QĐ-111ay` "giữ 8 cổng lọc"; `FR-4.9` điều kiện 3
  (nghỉ dài, _đang bàn giao_, ân hạn điều chuyển là một cổng).
- **Cách sửa:**
  1. `escalation.types.ts`: thêm `'LEAVE_OR_HANDOVER'` vào `ESCALATION_SKIP_REASONS` (DTO và codec `escalation-results.json.ts` dùng chung hằng này).
  2. `EscalationFacts` thêm `onLeaveOrHandover: boolean`; `EscalationBatchFacts` thêm `leaveOrHandover: Set<string>`.
  3. `ofBatch`: `const [leaves, handovers] = [await this.personnel.getLeaveIntervals(employeeIds, today, today), await this.personnel.getHandingOverCases(employeeIds)]`;
     người có `leave.startedOn <= today && (leave.endedOn === null || leave.endedOn > today)` (cùng công thức `usage-rules-seat.service.ts` `onLongLeave`)
     hoặc có case `HANDING_OVER` ⟹ vào set. Nếu `getLeaveIntervals` trả mọi loại nghỉ, lọc "nghỉ dài" đúng như `app.leaves` của lượt tuần (đọc
     `usage-rules` để dùng cùng nguồn — tốt nhất gọi `seatGateOf` hoặc tách hàm thuần `isOnLongLeave(leaves, today)` vào `usage-gates.policy.ts`
     rồi import từ escalation, không chép).
  4. `escalationVerdictOf`: sau `TRANSFER_GRACE`, `if (facts.onLeaveOrHandover) return { kind: 'SKIP', reason: 'LEAVE_OR_HANDOVER' };` — lưu ý
     ngoại lệ "seat của trưởng phòng không bị loại" chỉ nói về loại trừ trưởng phòng, không đổi cổng nghỉ dài.
  5. (Cân nhắc cùng lúc) luật 1 tháng của quyền có thời hạn (`QĐ-103j`, `BR-MF5-01` "chỉ khi còn trên 1 tháng lúc quét"): `listSeatsForRules` có
     `expectedEndDate` ⟹ lý do `LEFT_TO_EXPIRE` dùng `endsWithinMonth` sẵn có; nếu không làm thì ghi rõ trong comment và D-73 vì lúc quyết đã kiểm lại.
- **Test nên thêm:** unit policy 2 ca (nghỉ dài, đang bàn giao ⟹ `LEAVE_OR_HANDOVER`; trưởng phòng đang nghỉ dài vẫn bị loại); integration một ca
  trong `ghost-seat-escalation.integration-spec.ts` mục "answers each recommendation…": seed nghỉ dài cho holder ⟹ `SKIPPED/LEAVE_OR_HANDOVER`,
  dòng giữ `MONITOR/OPEN`, không `GHOST_SEAT_NEW`.

---

## Optional

### B3A-03 — Optional (A/B cho Owner) — Ai được đẩy sớm: "IT Admin phụ trách" (BRD) hay mọi IT Admin (D-73(7))

- **File:dòng:** `escalation.controller.ts:24` (`@RequireRoles('IT_ADMIN')`), `escalation-facts.service.ts:58-61` (chỉ ghi `byInCharge` vào audit).
- **Kịch bản:** IT Admin phòng HR đẩy khuyến nghị của nhân viên ENG lên trưởng phòng ENG; để đẩy, IT HR phải thấy dòng _Theo dõi_ của ENG — tức là đọc
  một kết luận usage của phòng ngoài phạm vi (QĐ-111ax chặn đọc usage).
- **Căn cứ:** BRD `FR-4.12` "IT Admin **phụ trách** được đẩy sớm"; `QĐ-111ax` "thao tác ghi giữ _IT khác xử lý thay_" (D-73 dựa vào đây). Hai nguồn
  kéo hai hướng, QĐ không nói riêng về đẩy sớm.
- **A (giữ):** mọi IT Admin, audit `byInCharge`. **B:** `EscalationFactsService.ofBatch` đọc `getItAdminScope(actor.employeeId, …)` (như
  `UsageOverviewScopeService.scopeOf`) và thêm lý do `OUT_OF_SCOPE` cho dòng có `placementDepartmentId` ngoài phạm vi (không lộ gì thêm vì kết quả chỉ
  có `recommendationId`). Khuyến nghị B nếu Owner coi đẩy sớm là một bước "rà usage" (`QĐ-111ap` gọi là "IT rà usage/đẩy sớm"); hỏi Owner.

### B3A-04 — Optional — N+1 trong lô đẩy sớm và lô 100 mục thật chưa được thử

- **File:dòng:** `escalation-facts.service.ts:36-39` (vòng `getEmployeePlacement` từng người, ≤ 100 câu), `escalation.service.ts:80-90` + `decision-routing.service.ts:80-82`
  (`enterQueue` gọi `getDepartmentHeads([one])` cho từng mục), cộng `raiseTierEarly` (update + audit) và `transition` (update + audit + thông báo) mỗi mục.
- **Kịch bản:** lô 100 mục đẩy được ≈ 100 × 7–8 câu + 100 câu placement trong **một** transaction (`DB_TRANSACTION_TIMEOUT_MS` mặc định 10 s,
  `database-environment.ts:47`). Test duy nhất cho 100 id (`ghost-seat-escalation.integration-spec.ts:315`) dùng id ngẫu nhiên ⟹ toàn `SKIPPED`, không đo đường nặng.
- **Cách sửa:** thay vòng bằng `this.organizationReads.getOwningUnits(employeeIds, today, tx)` (một câu, đã dùng ở `usage-overview-scope.service.ts:57`),
  map `unit.departmentId`; trong `escalate` đọc trước `getDepartmentHeads(uniqueDepartmentIds, day.today, tx)` một lần và truyền xuống `enterQueue`
  (thêm tham số tùy chọn `head?` vào `QueueEntry` hoặc một `enterQueueMany`). Test: lô 100 dòng `MONITOR` đẩy được, đếm câu lệnh `test/support/query-count.ts`
  bằng nhau giữa 3 và 30 mục ở phần đọc facts, và lô 100 xong dưới timeout.

### B3A-05 — Optional (bug thật, mức thấp) — `count(*) OVER()` cho `totalItems = 0` khi trang vượt cuối

- **File:dòng:** `src/modules/usage/usage-overview/usage-overview.repo.ts:182` + `:202`; `src/modules/usage/vendor-import/vendor-import.repo.ts:251` + `:258`.
- **Kịch bản:** chuỗi có 120 điểm, FE gọi `page=4&pageSize=50` (hoặc dữ liệu co lại giữa hai lần bấm) ⟹ không dòng nào ⟹ `raw[0]` undefined ⟹
  `totalItems: 0, totalPages: 0`; FE tưởng danh sách rỗng và mất nút quay lại. Mọi collection khác của repo đếm bằng câu riêng trong snapshot
  (`registry-query.repo.ts`, `identity.repo.ts:385-395`) nên chỉ hai chỗ mới này lệch.
- **Cách sửa:** đổi câu cuối thành `WITH … , numbered AS (SELECT …, count(*) OVER() AS total FROM cells) SELECT … FROM (SELECT 1) one LEFT JOIN LATERAL
  (SELECT * FROM numbered ORDER BY … LIMIT … OFFSET …) n ON true` rồi lấy `total` từ một CTE `SELECT count(*) FROM cells` riêng (`CROSS JOIN (SELECT count(*) AS total FROM cells) t`);
  bỏ dòng có cột null khi trang rỗng. Hoặc đơn giản: câu `count` thứ hai trong cùng `RepeatableRead` như `identity.repo.ts`.
- **Test:** `usage-overview.integration-spec.ts` "the page and the range": trang vượt cuối ⟹ `items: []`, `totalItems` bằng tổng thật; tương tự `usage-import-history`.

### B3A-06 — Optional — `GET /usage-imports` khai ngày cửa sổ không theo F01 (FIX-A1 chỉ sửa hai DTO usage-overview)

- **File:dòng:** `src/modules/usage/vendor-import/vendor-import.dto.ts:57` (`coverage: z.strictObject({ from: date, to: date })`, `date` cục bộ dòng 8 chỉ có
  `regex`, không `format: date`, không kiểm ngày tồn tại).
- **Căn cứ:** chuẩn F01 mà `aaf24866` áp (`businessDate`/`responseBusinessDate` của `infrastructure/http/dto/business-date.dto.ts`); schema list mới ra đời
  cùng gói US-1.4.
- **Cách sửa:** `import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto'`; `coverage: z.strictObject({ from: responseBusinessDate, to: responseBusinessDate })`.
  (`uploadUsageImportBodySchema` dòng 13-14 dùng `date` cũ là hợp đồng có sẵn — để FIX riêng nếu muốn.) Chạy lại `pnpm openapi:*` regenerate.

### B3A-07 — Optional — `duplicateOfImportId` của lịch sử bỏ sót tệp trùng khi hai bản xem trước tải lên trước lúc xác nhận

- **File:dòng:** `vendor-import.repo.ts:249` (`AND p.confirmed_at < i.created_at`); cảnh báo chỉ tính lúc tải lên `vendor-import.service.ts:146-152`.
- **Kịch bản:** tải tệp X ⟹ preview A; tải lại X ⟹ preview B (chưa có import xác nhận nên không cảnh báo); xác nhận A rồi xác nhận B ⟹ cùng tệp được ghi
  hai lần, lịch sử của B vẫn `duplicateOfImportId: null` vì A xác nhận sau lúc tạo B.
- **Cách sửa (chọn một):** (a) điều kiện list thành `AND p.confirmed_at < coalesce(i.confirmed_at, now())` (B xác nhận sau A ⟹ trùng; preview đang mở so
  với hiện tại); (b) thêm `warnOfDuplicate` ở bước confirm và lưu vào `result`. (a) đủ cho màn lịch sử, không migration. Test: kịch bản trên ⟹ B mang id của A.

### B3A-08 — Optional — Thiếu ca biên quan trọng trong test US-1/US-2 ("nợ test")

1. Không ca nào cho `NO_DEPARTMENT` của đẩy sớm (`escalation.policy.ts:27`) ở integration.
2. Không ca "phòng chưa có IT Admin phụ trách ⟹ mọi IT Admin đọc" (`QĐ-111ax`) cho `/usage-overview`, `/employees/{id}/usage-software` và `rows` của import.
3. Không ca người chuyển phòng giữa kỳ (D-67 (3) A: cả kỳ tính vào phòng mới; IT phòng cũ đọc rỗng/404) — chốt hành vi `US-1-Q3`.
4. Không ca người đã nghỉ: list/chi tiết đọc qua `getLastPlacement` (D-68 (2)) và dòng `MATCHED` của người đã nghỉ trong `rows` bị ẩn với mọi IT.
5. `GET /usage-imports` không có test đếm câu lệnh (D9 yêu cầu cho mọi collection mới).
6. Trang vượt cuối (B3A-05).

### B3A-09 — Optional (A/B) — Hàng đợi định danh chưa khớp lộ ứng viên phòng khác theo `importId`

- **File:dòng:** `src/modules/usage/identity/identity.controller.ts:113` (mô tả "each with the people it may be, by code and work email"),
  `identity.repo.ts:364-395` (`pageUnmatchedOfImport` không lọc phạm vi).
- **Kịch bản:** IT phòng HR mở kết quả import Figma, thấy định danh `AMBIGUOUS` kèm ứng viên là hai nhân viên ENG (mã + email) ⟹ biết hai người ENG có
  hoạt động Figma ngày nào (ngày ở `rows`) — một mẩu usage của phòng ngoài phạm vi.
- **Căn cứ:** `QĐ-111ax` chặn cứng đọc usage; `US-08-04` AC-9 (D-69 (6) đã ẩn dòng `MATCHED`, nhưng ứng viên của dòng `AMBIGUOUS` vẫn hiện); D-69 ghi `US-1-O1`.
- **A (giữ):** ghép tay là thao tác ghi "IT khác xử lý thay". **B:** lọc `candidateEmployeeIds` theo `peopleOf(actor, {})` khi trả (giữ mục, chỉ ẩn ứng viên ngoài
  phạm vi). Hỏi Owner cùng `US-1-O1`.

### B3A-10 — Optional — `v_cov` quét mọi import đã xác nhận của ứng dụng cho mỗi cặp phòng–ứng dụng

- **File:dòng:** `usage-overview.repo.ts:120-127`.
- **Kịch bản:** sau 2 năm, mỗi nguồn ~100 import; mỗi cặp (phòng, ứng dụng) nối với toàn bộ import rồi `generate_series(0, âm)` mới loại ⟹ đúng nhưng
  tốn; câu cùng mục đích ở `usage-employee.repo.ts:42` đã có điều kiện chồng lấn.
- **Cách sửa:** thêm vào `JOIN usage_imports i ON …` của `v_cov`: `AND i.coverage_from <= ${range.effectiveTo}::date AND i.coverage_to >= ${range.from}::date`.
  Không đổi kết quả (mutation trung tính); test hiện có giữ xanh.

---

## Nit

- **B3A-11 —** `escalation.service.ts:79` `batch.placements.get(record.employeeId ?? '') ?? ''`: fallback rỗng che bất biến (đã qua `NO_DEPARTMENT`).
  Dùng `facts.placementDepartmentId` của verdict hoặc trả `{ kind: 'ESCALATE', departmentId }` từ `escalationVerdictOf` để kiểu tự mang phòng.
- **B3A-12 —** `identity.repo.ts:391` `ORDER BY u.last_import_id DESC, u.id ASC`: thứ tự theo uuid không mang nghĩa (ổn định nhưng ngẫu nhiên với FE).
  Đổi `ORDER BY u.raw_identifier, u.id` hoặc theo `line_number` nhỏ nhất của import đó.
- **B3A-13 —** `vendor-import.types.ts:19` comment `MAX_SUMMARY_WARNINGS` liệt kê 2 cảnh báo, nay có `DUPLICATE_FILE` là cái thứ 3 (trần 10 vẫn đủ).
- **B3A-14 —** `usage-overview.policy.ts:27-29`: chỉ gửi `from` ở tương lai ⟹ `to = today < from` ⟹ 422 `RANGE_INVERTED`, trong khi D-68 nói "khoảng chưa tới ⟹
  rỗng" và docstring dòng 18 nói "forward to today from `from`". Hoặc ghi rõ trong mô tả 422, hoặc lấy `to = max(today, from)`.

---

## Phần đúng đã kiểm

- **Hợp ngày, không cộng (QĐ-111aw, D-67 (1)):** `active_in`/`covered_in` dùng `count(DISTINCT day)` (`usage-overview.repo.ts:169-173`); collector hoạt động
  khi `responses > 0` với `COVERED/PARTIAL` (`:115,119,133`, đúng `QĐ-101c`); nhà cung cấp chỉ `VALUE`/`PASSIVE`, bỏ `superseded` (`:106`, đúng `FR-4.11`).
- **Trạng thái dữ liệu** `NO_DATA/PARTIAL/HAS_DATA` theo ngày phủ, không theo ngày hoạt động (`usage-overview.policy.ts:75-79`, `FR-4.10`); ứng dụng có ghế
  chưa nguồn ⟹ nhóm `NO_DATA` nhờ `entitled` (`usableOn` null không tính, `usage-overview-people.service.ts:58`).
- **Kỳ:** tuần ISO thứ Hai–Chủ nhật qua `weekBoundsOf` (`core/business-date.ts:68-73`), tháng `YYYY-MM-01`, cắt theo khoảng, không đếm ngày tương lai
  (`effectiveTo`); ngày theo `businessToday` của tổ chức, không lệch múi giờ.
- **Một câu SQL cho cả trang**, thứ tự tất định `(kỳ, phòng, app, nguồn, công cụ)` với khóa nhóm duy nhất (UNION khử trùng), mảng truyền bằng `unnest`
  (một tham số), không N+1 ở US-1 (holders, entitled, tên phòng, tên app mỗi thứ một câu).
- **Phạm vi IT (QĐ-111ax, D8):** `getItAdminScope` + `findUsableItAdminEmployeeIds` (phòng không có IT dùng được ⟹ mọi IT thấy); lọc phòng/NV ngoài phạm vi
  ⟹ trang rỗng; `/employees/{id}/…` ngoài phạm vi hoặc không tồn tại ⟹ cùng 404 `USAGE_OVERVIEW.EMPLOYEE_NOT_FOUND`, kiểm phạm vi **trước** tra ứng dụng
  (không lộ tồn tại); `rows` của import ẩn dòng `MATCHED` ngoài phạm vi, số tổng giữ nguyên.
- **Không lộ:** list/overview chỉ `{ id, employeeCode }`, không `fullName`/ảnh/token/`responses`; token và câu trả lời chỉ ở `collector.days` của chi tiết
  (`usage-employee.dto.ts:49-66`); không `orderBy` theo khối lượng.
- **Kiến trúc:** SQL thô của US-1 chỉ chạm bảng `usage` (`PRISMA_MODEL_OWNER`: `AiUsageDay`, `UsageSource`, `UsageImport*`, `UsageActivityDay`,
  `UsageIdentityMapping` = `usage`); module khác qua `public/` (`DevicesApi`, `LicensingUsageApi`, `CatalogApi`, `OrganizationReadApi`, `PersonnelApi`,
  `LicensingGhostSeatApi`); cạnh `vendor-import → usage-overview` hợp lệ (luật "capability có controller không bị import" chỉ áp `requests`), không vòng;
  số file ≤ 25 (usage-overview 16, vendor-import 17, escalation 13, registry 14); README module cập nhật.
- **Wire/OpenAPI:** `@RequireRoles('IT_ADMIN')` ở cả 5 controller; 401/403/422/503 khai đủ; `openapi.json` ở 78a938c2 không có `QĐ-`; FIX-A1 đổi đúng sang
  `businessDate`/`responseBusinessDate` (format date, kiểm ngày tồn tại).
- **US-1.4:** `DUPLICATE_FILE` cảnh báo không chặn, cùng nguồn + hash + `COMPLETED`, ≤ 3 cảnh báo < trần 10 của codec; `importId` = dòng không khớp của
  chính import ∪ lần đầu/cuối, snapshot `RepeatableRead`.
- **US-2.1:** `collection { state, lastAcceptedAt }` trong cùng câu (sub-select), `lastAcceptedAt` của đăng ký đang mở, lịch sử `valid_from DESC, created_at DESC,
  id DESC` + đếm cùng snapshot, máy ngoài tổ chức ⟹ 404, người giữ đọc một lần cho cả trang, `pageSize ≤ 100`.
- **US-2.2 idempotent:** khóa lấy trước bằng `INSERT … ON CONFLICT DO NOTHING RETURNING` trong transaction Read Committed (`transaction-runner.ts`), lệnh
  song song chờ rồi `replay`; khác danh sách/khác note ⟹ 409 `GHOST_SEAT.ESCALATION_KEY_REUSED`; khóa theo (tổ chức, người, băm khóa), không lưu khóa thô;
  trùng id đếm một lần; khóa dòng `lockMany` trước khi đọc licensing/personnel; lô ≤ 100 ở DTO và codec; loại tài khoản máy (`QĐ-110m`) và người có điều chuyển
  hiệu lực chưa đóng / dòng `PAUSED` (`QĐ-110p`); `enterQueue` đặt `decisionDueOn` = 5 ngày làm việc (`BR-MF5-02`), báo trưởng phòng, phòng không trưởng ⟹
  `WAITING_FOR_HEAD`; bằng chứng giữ nguyên, chỉ `tier` đổi; audit `GHOST_SEAT.ESCALATED` (`hasNote`, `byInCharge`, không chứa note).
- **Migration `20261113004400`:** chỉ `CREATE TABLE IF NOT EXISTS`, không đụng bảng cũ, không backfill, không `GRANT` (đúng `database-business.md:59`),
  unique khớp `@@unique` của Prisma, CHECK note 1–500 khớp DTO, `results` mặc định `[]` + CHECK mảng; không FK sang module khác (giá trị). An toàn.
- **Checklist đẩy sớm (`QĐ-111ap`, `QĐ-111be`, SPEC "không đẩy được (422)")**: FYI — thuộc PL-2, chưa có commit PL-2 trong khoảng; không tính là lỗi của gói này.

## Mutation đề xuất

| File | Chuỗi cũ (duy nhất) | Chuỗi mới | Lệnh |
| --- | --- | --- | --- |
| `src/modules/optimization/escalation/escalation.policy.ts` | `if (facts.inTransfer \|\| record.state === 'PAUSED')` | `if (record.state === 'PAUSED')` | `pnpm jest src/modules/optimization/escalation/escalation.policy.spec.ts && pnpm test:integration -- ghost-seat-escalation` |
| `src/modules/optimization/escalation/escalation-facts.service.ts` | `{ isMachineAccount: seat.isMachineAccount }` | `{ isMachineAccount: false }` | `pnpm test:integration -- ghost-seat-escalation` |
| `src/modules/optimization/escalation/escalation.service.ts` | `if (!recorded \|\| recorded.requestHash !== requestHash)` | `if (!recorded)` | `pnpm test:integration -- ghost-seat-escalation` |
| `src/modules/usage/usage-overview/usage-overview-scope.service.ts` | `if (filter.departmentId !== undefined && !scope.includes(filter.departmentId)) return [];` | `if (false) return [];` | `pnpm test:integration -- usage-overview.integration` |
| `src/modules/usage/usage-overview/usage-overview.repo.ts` | `count(DISTINCT c.day)::int AS n` | `count(c.day)::int AS n` | `pnpm test:integration -- usage-overview.integration usage-employee-software` |
| `src/modules/usage/vendor-import/vendor-import.repo.ts` | `{ employeeId: { in: [...filter.visibleEmployeeIds] } }` | `{ outcome: 'MATCHED' as const }` | `pnpm test:integration -- usage-employee-software` |

Mong đợi: mỗi dòng ⟹ ít nhất một ca đỏ; nếu dòng 5 không đỏ thì thiếu ca "hai nguồn phủ cùng ngày" ở cấp `coveredDays` (thêm vào B3A-08).

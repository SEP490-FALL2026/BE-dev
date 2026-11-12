# C3 — Re-pin scope map G1–G10 theo Docs `5bb2e6a`, xóa Lô 2c, sửa trạng thái bảng _Hạng mục_ (11/11/2026)

**Skill đã đọc/dùng:** `incremental-implementation` (process: làm theo lát map → spec → xóa → bảng _Hạng mục_ → kiểm, mỗi lát
chạy `rules:check`; pipeline script chạy lại được từ bản sao lưu) · `documentation-and-adrs` (domain: giữ lịch sử, mỗi thay đổi
tài liệu có ghi chú ngày và lý do, không đổi nội dung kỹ thuật) · `superpowers:verification-before-completion` (verification: kết
quả ở §9 là output thật của lệnh).

**Phạm vi và quyền:** Owner duyệt 11/11/2026 làm ngay việc re-pin theo cách (a) + (b) của
[A5](A5-DOCS-CLEANUP.md) Q3, xóa 9 thư mục Lô 2c (A5 §6), sửa trạng thái cũ của bảng _Hạng mục_ (A5 §8), ghi snapshot Docs. Không
sửa `src/` ngoài một comment, không sửa test/migration, không sửa Docs repo, không sửa `SPEC.md`, `PLAN.md`, `A*.md`, `C1`/`C2`.
Không commit, không push.

**Pin:** BE `dev` = `a2dad526` + cây làm việc chưa commit của các lượt trước (giữ nguyên). Docs `5bb2e6a` (BRD 4.11, `QĐ-01` →
`QĐ-109`): Docs HEAD lúc làm là `8480e79`, `git diff 5bb2e6a HEAD -- BE-UserStory` rỗng nên đọc trực tiếp `git show 5bb2e6a:…`.

## 1. Cách làm

1. **Đọc nguồn.** Script đọc (scratchpad, không lưu repo) tách 183 Story của `BE-UserStory/src/EP-*.md` tại `5bb2e6a`: trạng thái,
   AC đang dùng, AC `(bỏ)`. Khớp bảng _Số đếm hiện hành_: 154 Story đang dùng, 1 864 AC.
2. **Biến đổi từng khóa Story/AC** của 9 map (G1–G8, G10; không có map G9), giữ nguyên chữ của dòng không đổi:
   - Story `RETIRED` ⟹ `not affected`, `Reason` = `Story RETIRED (Docs 5bb2e6a, QĐ-…); trước re-pin: <chủ cũ>`.
   - AC `(bỏ)` ở `5bb2e6a`: không spec nào claim ⟹ bỏ khỏi bảng (quy ước các lần re-pin trước); spec đã merge còn claim ⟹ giữ
     chủ, `Reason` ghi _khóa lịch sử_ (không sửa spec lịch sử).
   - Hạng mục Lô 2c làm chủ/đích ⟹ thay bằng hạng mục `qd103-*` thay thế (bảng A5 §3.7) nếu hạng mục đó claim khóa; nếu không,
     bỏ tên khỏi dòng `partial` (vế ghi ở `Reason`) hoặc `deferred` tới hạng mục thay thế.
   - Khóa mà hạng mục `qd103-*` đã code claim (mục 2): chủ cũ còn sống giữ `Owner`, `qd103-*` thêm vào `Remaining owner`
     (`partial`); khóa chưa có chủ, `deferred` hay mới ⟹ `qd103-*` là chủ (`full`, hoặc `partial` khi nhiều hạng mục cùng claim).
     Đích `deferred` cũ mà spec của nó có claim khóa (`g6-downstream-integration` — `US-07-05` AC-10) được giữ làm `Remaining owner`.
   - AC mới chưa ai claim ⟹ `deferred` tới: hạng mục `qd103-*` đã code ghi AC đó ở _Supporting references_ (lý do: không claim vì
     giới hạn ba Story); nếu không có, hạng mục gần nhất theo bảng _Story hiện hành_ của A6 (hạng mục `qd103-*` để sau, hoặc chủ
     Story hiện có kèm _đợt `MF-2`/`MF-3`_). Ngoại lệ `US-01-05` (G1, _phủ dần_ không có hạng mục): AC mới là `not affected` như
     AC-1→AC-16.
   - Story mới có hạng mục `qd103-*` claim được đưa vào map (`US-04-14` G3, `US-07-13` G4, `US-05-22`→`US-05-24`, `US-06-15`,
     `US-06-17`→`US-06-19` G5, `US-10-02`→`US-10-04`, `US-10-06`→`US-10-08` G7, `US-11-08` G8) cùng mọi AC của chúng; Story không
     hạng mục nào claim chỉ liệt kê ở dòng _11/11/2026_ dưới pin của map (như map G7 đã làm).
3. **Claim của `qd103-*` (cách a).** Lấy từ _Supporting references_ của chính spec (chỉ AC đang dùng ở `5bb2e6a`); mỗi spec claim
   **tối đa ba Story chính** vì trên ba Story cần `## Size exception` có `Accepted by` — không có Owner chấp nhận nên không tạo.
   Khóa còn lại của danh sách giữ chủ hiện có hoặc là `deferred` tới chính hạng mục đó (lý do ghi rõ). 18 hạng mục giữ
   `technical-enabler`: 4 enabler thật đã code (`qd103-seed-demo-v4`, `-mf1`, `-mf5`, `qd103-api-docs-regression`) và 14 hạng mục để sau
   (không claim khi chưa code).
4. **Spec bị kéo theo** (checker bắt chủ claim đúng khóa và coverage khớp map): bỏ dòng Story `RETIRED` khỏi bảng Primary của 15
   spec (cách b), đổi `full` → `partial` cho 9 dòng của 7 spec khi Story có thêm AC mới hoặc thêm chủ; mỗi spec có ghi chú
   _Re-pin 11/11/2026_ dưới bảng.
5. Ghi pin mới, `Active` và một dòng _11/11/2026_ cho từng map; chạy `node scripts/check-rules.mjs` sau mỗi lát tới 0 lỗi.

Pipeline (scratchpad): `repin.py` (map, đọc từ bản sao lưu) → `intro.py` (pin/`Active`/dòng ghi chú) → `specs.py` (spec `qd103-*`,
dòng `RETIRED`) → `fullfix.py` (`full` → `partial`) → `rmrows.py`, `hm.py` (bảng _Hạng mục_) → `textedits.py` (đoạn cập nhật).

## 2. Scope map — số dòng và khóa đổi

Dòng bảng: trước **379**, sau **562**; **255** dòng giữ nguyên chữ, 124 dòng cũ bị sửa/tách/bỏ, 307 dòng mới hoặc đã sửa. Khóa
Story/AC: trước 1 323, sau 1 693 (−5 AC `(bỏ)` bỏ khỏi bảng, +375 khóa mới).

| G   | Story | Khóa (AC) | Khóa AC đang dùng thật | Story `RETIRED` → `not affected`                           | AC `(bỏ)` bỏ khỏi bảng                              | AC `(bỏ)` giữ (spec đã claim) | Khóa mới (claim · `deferred` · `not affected`) | Story vào map                                                                      |
| --- | ----- | --------- | ---------------------- | ---------------------------------------------------------- | --------------------------------------------------- | ----------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| G1  | 5     | 77        | 77                     | —                                                          | `US-01-05 AC-9`                                     | —                             | 2 (0 · 0 · 2)                                  | —                                                                                  |
| G2  | 11    | 151       | 139                    | —                                                          | `US-01-04 AC-12`                                    | —                             | 10 (0 · 10 · 0)                                | —                                                                                  |
| G3  | 14    | 149       | 131                    | —                                                          | —                                                   | 1                             | 19 (3 · 16 · 0)                                | `US-04-14`                                                                         |
| G4  | 5     | 71        | 70                     | —                                                          | —                                                   | 1                             | 15 (6 · 9 · 0)                                 | `US-07-13`                                                                         |
| G5  | 41    | 566       | 474                    | `US-03-02`, `US-06-02`, `US-06-03`, `US-06-07`, `US-06-13` | `US-05-09 AC-7`, `US-06-06 AC-12`, `US-06-12 AC-24` | 34                            | 149 (84 · 65 · 0)                              | `US-05-22`, `US-05-23`, `US-05-24`, `US-06-15`, `US-06-17`, `US-06-18`, `US-06-19` |
| G6  | 14    | 212       | 184                    | `US-03-07`, `US-03-12`                                     | —                                                   | —                             | 13 (1 · 12 · 0)                                | —                                                                                  |
| G7  | 22    | 213       | 213                    | —                                                          | —                                                   | —                             | 82 (70 · 12 · 0)                               | `US-10-02`, `US-10-03`, `US-10-04`, `US-10-06`, `US-10-07`, `US-10-08`             |
| G8  | 10    | 197       | 116                    | `US-11-01`, `US-11-02`, `US-11-05`, `US-11-06`             | —                                                   | 10                            | 76 (3 · 73 · 0)                                | `US-11-08`                                                                         |
| G10 | 5     | 57        | 57                     | —                                                          | —                                                   | —                             | 9 (0 · 9 · 0)                                  | —                                                                                  |

Theo loại (đếm khóa): Story `RETIRED` → `not affected` 133; AC `(bỏ)` bỏ khỏi bảng 5, giữ làm khóa lịch sử 46; khóa của hạng mục
Lô 2c thành `deferred` 9; khóa `deferred` tới `qd103-*` còn `deferred` nhưng viết lại lý do 33; khóa `deferred` thành có chủ
`qd103-*` 30; khóa `full`/`partial` có thêm `qd103-*` làm chủ phần còn lại 56; khóa mới 375 (167 có chủ, 206 `deferred`, 2
`not affected`; 200 khóa thuộc 16 Story mới vào map).

**10 dòng `deferred` tạm của Lô 2b:** nay có chủ — `US-10-01` AC-1→AC-10, `US-10-05` AC-2, AC-5, AC-7, AC-8 (`qd103-ghost-seat-g1-g2`),
`US-06-12` AC-25 (`qd103-budget-check-three-outcomes`), `US-08-02` AC-1, AC-3, `US-08-04` AC-1, AC-4, AC-7, `US-08-05` AC-1→AC-4
(`qd103-vendor-usage-import`). Vẫn `deferred` (spec không ghi AC đó hoặc Story ngoài ba Story chính, lý do đã viết lại): `US-08-01`
AC-8, `US-08-02` AC-2, AC-5, AC-6, `US-08-03` AC-1, AC-3, `US-08-04` AC-3, AC-5, AC-6, `US-08-05` AC-5, AC-6, `US-08-07` AC-3 (đích
`qd103-vendor-usage-import`), `US-12-15` AC-30 (đích đổi sang `qd103-role-dashboards-digest` theo bảng A6).

**Story chưa map** (không hạng mục nào claim; ghi ở dòng _11/11/2026_ của map): G2 `US-03-15`; G4 `US-07-14`; G6 `US-03-13`,
`US-03-14` (đợt `MF-2`/`MF-3`); G7 `US-01-07`, `US-01-08`, `US-02-06`, `US-07-03`, `US-07-06`, `US-07-07`, `US-08-06`, `US-09-06`,
`US-14-03`→`US-14-05`; G8 `US-11-09`, `US-12-03`→`US-12-07`, `US-12-10`→`US-12-12`, `US-12-14`, `US-12-16`→`US-12-20`; G10
`US-15-06`; G9 (không có map) `US-13-01`, `US-13-03`, `US-13-05`, `US-13-07`; xuyên nhóm `US-14-01`, `US-14-02`, `US-14-06`.

## 3. Spec `qd103-*` đổi sang claim AC (23)

Mỗi spec: `Container` nêu G, `Mode` mới, `Scope map` link tới map, bảng Primary sinh từ map, dòng `n/a` cũ chép vào _Supporting
references_ kèm ghi chú; header `Nhóm roadmap` đổi theo. Không đổi nội dung kỹ thuật.

| Hạng mục                                 | `Mode` mới        | G      | Claim (Docs `5bb2e6a`)                                                                                                                                                                             |
| ---------------------------------------- | ----------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qd103-calendar-fiscal-year`             | `single-story`    | G5     | US-06-15 AC-1 (partial)                                                                                                                                                                            |
| `qd103-shared-pool-subscription`         | `grouped-stories` | G3, G8 | US-04-14 AC-10 (partial); US-11-08 AC-26 (partial)                                                                                                                                                 |
| `qd103-budget-cycle-ceilings`            | `single-story`    | G5     | US-06-15 AC-1, AC-3, AC-5→AC-8, AC-10, AC-13, AC-15, AC-17 (partial)                                                                                                                               |
| `qd103-department-effective-year`        | `single-story`    | G5     | US-06-15 AC-16 (partial)                                                                                                                                                                           |
| `qd103-budget-baseline-annual-check`     | `grouped-stories` | G5     | US-06-15 AC-2, AC-12, AC-15→AC-17 (partial); US-06-19 AC-1→AC-5 (full)                                                                                                                             |
| `qd103-budget-proposal-lines-cleanup`    | `grouped-stories` | G5     | US-06-09 AC-31 (partial); US-06-10 AC-1, AC-2, AC-20 (partial)                                                                                                                                     |
| `qd103-budget-views`                     | `grouped-stories` | G5, G8 | US-06-10 AC-7 (partial); US-06-15 AC-7, AC-14 (partial); US-12-01 AC-11, AC-16 (partial)                                                                                                           |
| `qd103-request-amount-and-term`          | `grouped-stories` | G5     | US-05-02 AC-1, AC-11, AC-17 (partial); US-05-23 AC-1→AC-10 (partial); US-06-01 AC-14, AC-21, AC-25, AC-29 (partial)                                                                                |
| `qd103-budget-check-three-outcomes`      | `grouped-stories` | G5     | US-06-01 AC-2, AC-3, AC-9, AC-18, AC-21→AC-24, AC-28 (partial); US-06-12 AC-1, AC-4, AC-5, AC-8, AC-9, AC-11, AC-14, AC-20, AC-23, AC-25→AC-28 (partial); US-06-16 AC-1→AC-6, AC-8, AC-9 (partial) |
| `qd103-commitment-current-year`          | `grouped-stories` | G5     | US-05-23 AC-5, AC-8 (partial); US-06-04 AC-1, AC-3, AC-7, AC-10, AC-17→AC-19 (partial); US-06-17 AC-3 (partial)                                                                                    |
| `qd103-new-year-auto-commitments`        | `single-story`    | G5     | US-06-18 AC-1→AC-9 (partial)                                                                                                                                                                       |
| `qd103-request-single-step-routing`      | `grouped-stories` | G5     | US-05-03 AC-2, AC-4, AC-9, AC-13, AC-16, AC-18, AC-19 (partial); US-05-24 AC-1→AC-3, AC-5, AC-6 (partial); US-06-17 AC-1→AC-13 (partial)                                                           |
| `qd103-request-limits-gh`                | `grouped-stories` | G5     | US-05-02 AC-19 (partial); US-05-03 AC-8, AC-17 (partial); US-05-22 AC-1→AC-4, AC-6→AC-11 (partial)                                                                                                 |
| `qd103-renewal-request-window`           | `grouped-stories` | G5     | US-05-14 AC-1, AC-2, AC-4, AC-5, AC-7→AC-10, AC-12, AC-13, AC-16 (partial); US-05-23 AC-6 (partial)                                                                                                |
| `qd103-grant-from-shared-pool`           | `grouped-stories` | G3, G4 | US-04-14 AC-2, AC-3 (partial); US-07-01 AC-1, AC-2 (partial); US-07-13 AC-1→AC-4, AC-6, AC-8 (partial)                                                                                             |
| `qd103-commitment-release-on-revocation` | `grouped-stories` | G6, G7 | US-07-05 AC-21 (partial); US-10-07 AC-19, AC-20 (partial)                                                                                                                                          |
| `qd103-k4-key-pool`                      | `grouped-stories` | G4, G6 | US-07-01 AC-2, AC-10 (partial); US-07-05 AC-6, AC-7 (partial); US-07-13 AC-6 (partial)                                                                                                             |
| `qd103-request-history-by-role`          | `grouped-stories` | G5     | US-05-15 AC-9 (partial); US-05-24 AC-1, AC-4 (partial); US-06-09 AC-2 (partial)                                                                                                                    |
| `qd103-revocation-grace-notice`          | `grouped-stories` | G6, G7 | US-07-05 AC-10, AC-22 (partial); US-10-06 AC-2, AC-10→AC-12 (partial); US-10-07 AC-18, AC-19 (partial)                                                                                             |
| `qd103-vendor-usage-import`              | `grouped-stories` | G7     | US-08-02 AC-1, AC-3 (partial); US-08-04 AC-1, AC-2, AC-4, AC-7 (partial); US-08-05 AC-1→AC-4 (partial)                                                                                             |
| `qd103-ghost-seat-g1-g2`                 | `grouped-stories` | G7     | US-10-01 AC-1→AC-10 (full); US-10-05 AC-1, AC-2, AC-5, AC-7, AC-8 (partial); US-10-07 AC-4, AC-13, AC-18, AC-20 (partial)                                                                          |
| `qd103-ghost-seat-g3-g4`                 | `grouped-stories` | G7     | US-10-02 AC-1→AC-9, AC-11→AC-14 (full); US-10-03 AC-1→AC-13 (full); US-10-04 AC-1→AC-7, AC-9 (partial)                                                                                             |
| `qd103-ghost-seat-manager-decision`      | `grouped-stories` | G7     | US-10-06 AC-1→AC-20 (partial); US-10-07 AC-1→AC-3, AC-5→AC-7, AC-12, AC-13, AC-18, AC-19 (partial); US-10-08 AC-1, AC-4, AC-6, AC-7 (partial)                                                      |

Khóa ở _Supporting references_ nhưng ngoài ba Story chính (không claim, giữ chủ cũ hoặc `deferred` tới chính hạng mục): ví dụ
`qd103-budget-check-three-outcomes` → `US-06-14` AC-9, AC-12, AC-13; `qd103-request-amount-and-term` → `US-06-12` AC-11, AC-27,
`US-06-14` AC-13, `US-05-14` AC-3; `qd103-request-single-step-routing` → `US-05-02` AC-18, `US-06-12` AC-30, AC-31, `US-06-14`
AC-8, AC-18, AC-20, `US-06-16` AC-7, AC-10, `US-05-14` AC-16; `qd103-vendor-usage-import` → `US-08-01`, `US-08-07`, `US-10-02`→`US-10-04`;
`qd103-ghost-seat-*`, `qd103-revocation-grace-notice` → `US-12-15`, `US-07-05`.

## 4. Spec khác đã sửa (22 file, chỉ bảng Primary, `Mode` và ghi chú)

**Bỏ dòng Story `RETIRED` (15 spec):**

| Hạng mục                                    | Story bỏ khỏi bảng Primary | `Mode`              |
| ------------------------------------------- | -------------------------- | ------------------- |
| `a06-renewal-execution-chain`               | `US-11-05`                 | `single-story`      |
| `a06-renewal-milestone-alerts`              | `US-11-01`                 | `technical-enabler` |
| `a06-renewal-proposal-decision`             | `US-11-02`, `US-11-05`     | `technical-enabler` |
| `g5-budget-check-and-finance-review`        | `US-06-13`                 | giữ                 |
| `g5-budget-version-decision`                | `US-06-07`                 | giữ                 |
| `g5-commitment-creation`                    | `US-06-07`                 | giữ                 |
| `g5-delegated-requests`                     | `US-03-02`                 | giữ                 |
| `g5-finance-information-request`            | `US-06-02`, `US-06-03`     | `single-story`      |
| `g5-step-sla-and-alerts`                    | `US-06-02`                 | giữ                 |
| `g6-downstream-integration`                 | `US-03-07`                 | giữ                 |
| `g6-transfer-tool-review`                   | `US-03-07`                 | `single-story`      |
| `qd93-remove-fallback-substitute-approvers` | `US-03-02`, `US-11-02`     | giữ                 |
| `qd93-unplaced-employee-first-placement`    | `US-03-02`                 | giữ                 |
| `qd96-100-subscription-owner-confirmation`  | `US-11-06`, `US-11-05`     | `technical-enabler` |
| `qd96-100-transfer-review-defaults`         | `US-03-07`, `US-03-12`     | `technical-enabler` |

Bốn spec không còn Story nào đổi `technical-enabler` với một dòng `n/a` nêu hạng mục thay thế (`qd103-subscription-alerts-incidents`,
`qd103-subscription-adjustment-point`; `qd96-100-transfer-review-defaults` nêu `US-03-13` chưa có hạng mục và
`g6-transfer-tool-review`) — chỉ để spec lịch sử không còn claim Story `RETIRED`; code đã merge của chúng vẫn chạy.

**`full` → `partial` (9 dòng, 7 spec):**

| Hạng mục                          | Story      | Phần còn lại ghi ở spec                                                                                                          |
| --------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `finance-screens-api`             | `US-12-01` | AC-2→AC-5, AC-7→AC-9, AC-12, AC-14, AC-17: `qd103-budget-vs-actual-report` (`deferred`); AC-11, AC-16: `qd103-budget-views`      |
| `finance-screens-api`             | `US-12-02` | AC-1, AC-2, AC-7, AC-13, AC-14: `qd103-purchase-invoice-sbf19` (`deferred`)                                                      |
| `g3-business-owner-replacement`   | `US-04-06` | AC-7, AC-8: `g3-business-owner-replacement` (`deferred`)                                                                         |
| `g5-commitment-creation`          | `US-06-04` | AC-1, AC-3, AC-7, AC-10, AC-17→AC-19: `qd103-commitment-current-year`; AC-14: `qd103-subscription-adjustment-point` (`deferred`) |
| `g5-request-status-notifications` | `US-05-15` | AC-9: `qd103-request-history-by-role`; AC-14: `qd103-request-single-step-routing` (`deferred`)                                   |
| `g6-handover-confirmation`        | `US-03-09` | AC-11: `g6-handover-confirmation` (`deferred`)                                                                                   |
| `g6-saas-error-report`            | `US-07-10` | AC-11: `g6-saas-error-report` (`deferred`)                                                                                       |
| `g6-saas-error-report`            | `US-07-11` | AC-10, AC-11: `g6-saas-error-report` (`deferred`)                                                                                |
| `g6-service-account-handover`     | `US-03-08` | AC-11: `g6-service-account-handover` (`deferred`)                                                                                |

## 5. Thư mục đã xóa (Lô 2c, `git rm -r -f`, đã vào index)

| Thư mục (`docs/workspace/items/`)           | File · dòng | Thay bởi (A5 §3.7)                    |
| ------------------------------------------- | ----------- | ------------------------------------- |
| `a05-k4-key-grant-by-device`                | 2 · 139     | `qd103-k4-key-pool`                   |
| `a06-renewal-open-inputs`                   | 2 · 131     | `qd103-subscription-*`                |
| `a06-renewal-usage-evidence`                | 2 · 108     | `qd103-subscription-adjustment-point` |
| `qd96-100-budget-check-three-outcomes`      | 2 · 313     | `qd103-budget-check-three-outcomes`   |
| `qd96-100-budget-visibility-qd100p`         | 2 · 196     | `qd103-budget-views`                  |
| `qd96-100-head-group-request-queue`         | 2 · 218     | `qd103-request-single-step-routing`   |
| `qd96-100-reserve-confirmation`             | 2 · 255     | `qd103-budget-check-three-outcomes`   |
| `qd96-100-revocation-deadline-and-withdraw` | 2 · 199     | `qd103-revocation-grace-notice`       |
| `qd96-100-sla-reminder-recipients`          | 2 · 201     | `qd103-request-single-step-routing`   |

Tổng 18 file · 1 760 dòng (khớp ước tính A5). `-f` vì năm spec có sửa link chưa commit của lượt C2. Trước khi xóa: grep tên 9
thư mục trong `src`, `test`, `scripts`, `prisma`, `.github`, `package.json`, `rules-check.config.json` — chỉ comment
`device-binding.policy.spec.ts:16`; link Markdown trỏ vào chỉ ở `docs/workspace/items/README.md` và bảng _Hạng mục_.

Đã sửa kèm: bỏ 9 dòng index `docs/workspace/items/README.md`, 9 dòng bảng _Hạng mục_; comment
`src/modules/licensing/device-binding/device-binding.policy.spec.ts:16-18` (chỉ comment: `a05-k4-key-grant-by-device` ghi là đã xóa
11/11/2026). Không còn link Markdown nào trỏ vào 9 thư mục (checker kiểm link); tên trong backtick ở spec/review lịch sử và cột
`Reason` của map giữ làm tên lịch sử (kèm _đã xóa 11/11/2026 — xem git history_).

## 6. Bảng _Hạng mục_ — trạng thái đã sửa

Sửa cột _Triển khai_ thành `merged-dev` cho 54 dòng (A5 §8), cột _PR / bằng chứng_ thêm câu `_11/11/2026 (C3):_ …` trước ghi cũ và
giữ trạng thái cũ trong ngoặc. Không dòng nào ghi `accepted` hay `owner-review`.

| Nhóm (số dòng)                                                                                                                      | Bằng chứng (git `origin/dev`, chỉ đọc)                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A/B (20): `a01`→`a04`, `a05-k4-device-registry-contract`, `a06-renewal-*` ×4, `a07`→`a09`, `a10-*` ×4 (trừ jobs board), `b01`→`b04` | spec + code ở commit `e9530c9a` _A1-A10_, vào `dev` qua PR #19 `913575c2` (31/10/2026)                                            |
| `qd93-*` (9)                                                                                                                        | PR #22 `653a2a8a` (`fix/qd93-final`), việc còn lại PR #23 `30d14ac4`, PR #25 `d7b8fe8d` (03/11/2026); hai mục bản tối giản ghi rõ |
| `employee-directory-read`, `dashboard-request-queues-wiring` (2)                                                                    | PR #23 (commit `0c84a9bc`), PR #25 (commit `6f6058aa`)                                                                            |
| `qd95-*` ×2, `unified-seed-reset`, `ci-integration-shards` (4)                                                                      | PR #27 `db9e098f` (04/11/2026; commit theo slug `0c9d21ea`, `3b3829ab`, `2e46c71c`, `e2331f6e`)                                   |
| `qd96-100-*` Đợt 1 (15), `g7-device-*` ×2, `g7-ai-usage-intake`, `e2e-main-flows-suite` (19)                                        | PR #31 `446d6fd2` (commit `aeb00f17`, format `3cdbf622`, 06/11/2026); ghi phần đã bị `qd103-*` thay                               |

Thêm 41 dòng `qd103-*` cuối bảng: 26 `merged-dev` + `qd103-api-docs-regression` `merged-dev` (ghi _dùng một phần, chưa xác minh đủ
plan_) — bằng chứng commit theo A5 §3.2, vào `dev` qua PR #36 `11051f28` (10/11/2026); 9 `not-started`, 1 `in-progress`
(`qd103-remove-business-owner`: mới P2-05 + `de7bd810`), 4 `blocked` (W8b, Q-160). Cột _US/AC_ của 23 hạng mục claim ghi đúng
claim mới.

## 7. Tài liệu khác

- [`docs/workspace/sources.md`](../../workspace/sources.md): mục _Commit Docs `5bb2e6a`_ (định dạng như mục `72e1480`: full SHA,
  `git log -S"QĐ-109a"`, số đếm, 24 hash SHA-256 LF không BOM của sổ quyết định, BRD, Phạm vi, US và `src/EP-*.md`); bảng đầu
  thêm revision `5bb2e6a`; tiêu đề mục `72e1480` đổi _pin hạng mục mới tới 22/10/2026_.
- `docs/roadmap.md`: thêm câu vào đoạn _Cập nhật 10/11/2026_ (re-pin, 9 mục Lô 2c, 54 + 41 dòng bảng _Hạng mục_, link log này);
  sửa câu _Re-pin … chờ Owner_ ở _Ghi chú 10/11/2026_ trên các map.

## 8. Kiểu xuống dòng

`docs/roadmap.md`, `sources.md`, `items/README.md`, mọi spec đã sửa và file `src/` giữ CRLF (script đọc/ghi theo kiểu của từng
file; `git diff --stat` kiểm ở §9). File này viết LF như `C1-CLEANUP-LOG.md`.

## 9. Kiểm (chạy thật, 11/11/2026)

| Lệnh                                       | Kết quả                                                                                                                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/check-rules.mjs` (trước sửa) | `BE: 575 files, 3984 links, 0 errors` theo C2; lượt này chạy sau từng lát: 72 lỗi (owner spec claim `full`, spec Lô 2c còn claim) → 63 (chỉ còn 9 thư mục Lô 2c) → 0 sau khi xóa                                 |
| `pnpm rules:check`                         | `BE: 557 files, 4172 links, 0 errors`, exit 0 (575 − 18 file Lô 2c = 557)                                                                                                                                        |
| `pnpm rules:format`                        | lần đầu (trước `prettier --write`) 40 file lệch do bảng; sau `pnpm exec prettier --write` 47 file đã sửa + file này: `All matched files use Prettier code style!` (cả hai lệnh con), exit 0                      |
| `pnpm test:gates`                          | `Test Suites: 16 passed, 16 total` · `Tests: 331 passed, 331 total` · 11.7 s, exit 0 (lần chạy trước khi rút gọn một ô bảng _Hạng mục_: cùng 16/331, 48.9 s)                                                     |
| Kiểu xuống dòng                            | 47 file đã sửa đều CRLF trước và sau (so byte với bản sao lưu); `device-binding.policy.spec.ts` CRLF, `git diff --stat` 3+/2−                                                                                    |
| `docs/roadmap.md` so với bản sao lưu       | 1 073 dòng khác, 659 khi bỏ khác biệt khoảng trắng — phần còn lại là prettier căn lại các bảng scope map có cột rộng ra; bảng _Hạng mục_ giữ độ rộng cột (ô mới không dài hơn ô cũ) nên không bị căn lại cả bảng |

Không chạy test nào khác.

## 10. Điểm còn để ngỏ

1. **Giới hạn ba Story mỗi spec:** 12 hạng mục `qd103-*` có khóa ở _Supporting references_ ngoài ba Story chính (mục 3) — đang là
   chủ cũ hoặc `deferred` tới chính hạng mục. Muốn claim đủ cần Owner chấp nhận `## Size exception` (trường `Accepted by`) cho từng
   spec, hoặc tách hạng mục.
2. **Claim theo spec, chưa theo code:** AC claim lấy từ _Supporting references_ + commit đã merge; chưa đối chiếu từng AC trên code
   hay test. `US-03-15` không map vì spec `qd103-department-effective-year` chỉ ghi `US-06-15` AC-16 (A6 ghi Story `merged-dev`);
   `US-04-14`, `US-07-13`, `US-06-18` AC-10, `US-05-22` AC-5/AC-12, `US-05-23` AC-11 là `deferred` tới hạng mục đã code vì spec
   không ghi AC đó.
3. **Khóa lịch sử:** 46 khóa AC `(bỏ)` giữ trong map vì spec đã merge còn claim; Story `RETIRED` giữ `not affected`. `Active` đếm
   cả hai (số AC đang dùng thật ghi ở dòng _11/11/2026_ của từng map). Bỏ hẳn cần sửa bảng Primary của các spec đó.
4. **Đích `deferred` của AC mới** là lựa chọn của lượt này (bảng A6 + _Supporting references_), chưa ai review; với Story `MF-2`/`MF-3`
   đích là chủ Story G6 hiện có — đợt `MF-2`/`MF-3` sẽ tạo hạng mục thật và chuyển chủ.
5. **Không có map G9**; Story `EP-13`, `US-14-01`/`-02`/`-06` và phần lớn `EP-12` chưa có hạng mục nên chưa map.
6. **`plan.md` của `qd103-*`** vẫn ghi `Triển khai: not-started`/`in-progress`/`verified` (cũ so với merge PR #36) — không sửa ở lượt
   này (ngoài phạm vi); bảng _Hạng mục_ ghi rõ điều này.
7. **Ngoài A5 §8, chưa sửa:** `be-architecture-boundaries-restructure`, `be-test-architecture-redesign`,
   `be-architecture-readability-hardening`, `be-readability-debuggability-followup`, `shared-demo-dataset`,
   `g0-g6-final-business-baseline-remediation`, `baseline-impact-and-remediation-2026-10-17`, `foundation-remediation-handoff-2026-10-18`
   vẫn ghi `implemented-local`/`verified`/`not-started`/`in-progress`; thư mục của vài mục vào `dev` qua PR #19/#20 nhưng **chưa xác
   minh** code từng task — để Owner chỉ định.
8. Owner chưa review lượt này; `rules:check` chỉ chứng minh cấu trúc (đăng ký, link, map khớp spec), không chứng minh nghiệp vụ đúng.

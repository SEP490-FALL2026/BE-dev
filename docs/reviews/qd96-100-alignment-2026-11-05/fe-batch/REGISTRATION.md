# Đăng ký hạng mục + scope map (điều phối viên, 05/11/2026)

Skill đã đọc/dùng: `agent-skills:planning-and-task-breakdown` (process — đối chiếu phân rã/AC owner), domain
`docs/rules/work-item-sizing.md` + `scripts/check-rules.mjs` (luật scope map), `superpowers:verification-before-completion`
(chạy `pnpm rules:check` trước/sau, đọc đủ output). Chỉ sửa `docs/roadmap.md`, `docs/workspace/items/README.md` và file
này; không sửa spec/plan, source, test; không git thay đổi trạng thái.

Nguồn US: Docs `5dad7b6` (= `3d73a7f` + `QĐ-101`, đã commit 05/11 11:31 — thay đổi "chưa commit" mà spec ghi nay nằm ở
commit này), `BE-UserStory/src/EP-xx.md`. BE `3e4553b9` (cây làm việc `feat/qd96-100-alignment` @ `808318a4`).

## Đã thêm

- **Items index + bảng "Hạng mục" của roadmap:** 36 hạng mục — 29 `qd96-100-*` (gồm `subscription-owner-confirmation`),
  `e2e-main-flows-suite`, `c1-contract-list-and-fields`, 5 `g7-*`. `g7-vendor-usage-import-identity` và
  `g7-g1-g2-recommendations` chỉ có link spec (chưa có `plan.md`).
- **Scope map (re-pin một phần, ghi chú có ngày ở từng map):** G1 75→76 AC; G3 12→13 Story, 115→130 AC (Story mới
  `US-04-13`); G5 33→34 Story, 394→420 AC (Story mới `US-06-16`); G6 13→14 Story, 182→199 AC (Story mới `US-03-12`); G8
  6→7 Story, 93→111 AC (Story mới `US-11-06`). AC mà `qd96-100-*` sửa lại hành vi cũ: chủ cũ giữ `Owner`, hạng mục mới ở
  `Remaining owner` (`partial`); AC mới chỉ một hạng mục claim là `full`.
- **Mới `### Work-item decomposition: G7`:** 16 Story, 131 AC — chỉ Story mà 5 spec G7 chạm; AC không ai claim →
  `deferred` tới lát DESIGN §12 hoặc hạng mục mà spec khác giao; `US-09-03` AC-6, `US-09-09` AC-4, AC-6 `not affected`
  (ngoài BE). Story G7 chưa map liệt kê ở ghi chú của map.

## Kết quả `pnpm rules:check`

Trước: **247 lỗi**. Sau: **45 lỗi** — không còn lỗi đăng ký/thiếu map/link của lượt này; tất cả thuộc bảng dưới (xung đột
quy tắc 6, spec CONTENT, hai spec G7 chưa có `plan.md`). `pnpm rules:format`: `docs/roadmap.md` và items index sạch; 34
file chưa đúng Prettier đều là spec/plan/test-plan của các hạng mục mới (chủ: agent viết spec).

## Lỗi còn lại và chủ

| Lỗi                                                                                                                                                                                                                                                                                           | Chủ / cách gỡ                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Xung đột quy tắc 6: chủ `deferred` phải là hạng mục đã có spec/plan — `qd96-100-transfer-labels-and-overlap` (G6), `qd96-100-renewal-milestones-and-recipients`, `qd96-100-subscription-lifecycle` (G8), `g7-browser-usage-intake`, `g7-vendor-usage-csv-template`, `g7-g3-g4-decisions` (G7) | Coordinator/Owner: tạo spec/plan khung cho 6 tên này rồi đăng ký (hoặc chọn chủ khác). Mỗi tên 1 lỗi.                                                         |
| `g7-g1-g2-recommendations`, `g7-vendor-usage-import-identity`: thiếu `plan.md` (+ link `plan.md`/`test-plan.md` gãy) ⟹ map G7 báo "owner not registered"                                                                                                                                      | Agent đang viết hai spec đó; khi có `plan.md` thêm link `plan` ở index/roadmap.                                                                               |
| `qd96-100-subscription-owner-confirmation`: 18 khóa "not mapped … in the G5 scope map"                                                                                                                                                                                                        | Spec CONTENT: EP-11 thuộc **G8** (khóa `US-11-05` AC-11→AC-14 đã ở map G8) — đổi `- Container:` sang G8 và `- Scope map:` link `#work-item-decomposition-g8`. |
| `qd96-100-request-term-limit` (US-05-02, US-06-12), `qd96-100-request-sender-rules` (US-05-02), `qd96-100-sla-reminder-recipients` (US-05-09): "claims … as full but the map shares"                                                                                                          | Spec CONTENT: Story có chủ khác ⟹ dòng Primary phải là `partial` + nêu chủ phần còn lại.                                                                      |
| `g5-budget-check-and-finance-review` claims `US-06-12` full                                                                                                                                                                                                                                   | Spec cũ (không thuộc lượt này): đổi dòng `US-06-12` sang `partial` (AC-1→AC-19 nay chia với `qd96-100-*`). Coordinator quyết.                                 |
| `qd96-100-account-org-api-fields`, `qd96-100-seed-demo-v3`: enabler thiếu tên hạng mục phía sau ở cột cuối; `qd96-100-seed-demo-v3/plan.md` không có `### Task`; `qd96-100-revocation-deadline-and-withdraw` dòng `US-07-05` partial thiếu tên chủ phần còn lại                               | Spec CONTENT (agent sửa spec).                                                                                                                                |

## Ngoài checker (cho lượt re-baseline map)

- Story `RETIRED` ở `5dad7b6` nhưng map còn dòng sống: `US-03-02`, `US-06-02`, `US-06-03`, `US-06-13` (G5), `US-11-02`
  (G8). Chưa đổi — cần quyết chủ hồi quy/gỡ.
- AC đang dùng ở `5dad7b6` chưa có dòng (không spec nào claim): `US-01-02` AC-11; `US-01-03` AC-14, AC-15; `US-01-04`
  AC-16, AC-17; `US-01-05` AC-17; `US-02-02` AC-27; `US-02-04` AC-7; `US-02-05` AC-17; `US-03-04` AC-34; `US-03-05`
  AC-12; `US-03-07` AC-16→AC-18; `US-04-03` AC-14; `US-04-04` AC-12; `US-04-06` AC-7, AC-8; `US-05-02` AC-15, AC-16;
  `US-05-04` AC-17, AC-18; `US-05-13` AC-12; `US-05-14` AC-9, AC-10, AC-14, AC-16, AC-17; `US-05-17` AC-19, AC-20;
  `US-06-04` AC-14→AC-16; `US-06-06` AC-13→AC-17; `US-06-07` AC-8→AC-12; `US-06-09` AC-27→AC-29; `US-06-10`
  AC-17→AC-20; `US-06-11` AC-13, AC-14, AC-16; `US-06-12` AC-21, AC-22; `US-06-14` AC-17, AC-18; `US-07-01` AC-19, AC-20;
  `US-07-05` AC-20, AC-21; `US-11-01` AC-15, AC-16; `US-11-03` AC-22→AC-24; `US-11-04` AC-14→AC-18; `US-11-05` AC-19→AC-22,
  AC-24→AC-29; `US-12-15` (map G8 chỉ phủ một phần theo thiết kế) 22 AC; `US-16-03` AC-10→AC-12.
- Chủ giao chéo chưa claim (ghi ở cột `Reason` của map G7): `US-09-07` AC-4 và `US-09-05` AC-11 (vế cảnh báo) → registry;
  `US-09-05` AC-2 (intake ↔ credential giao cho nhau); `US-08-01` AC-9 → intake; `US-09-05` AC-6 (vế hàng đợi) → vendor.

## Lượt gỡ 45 lỗi `rules:check` (05/11/2026, tối)

Skill đã đọc/dùng: `agent-skills:planning-and-task-breakdown` (process — task khung, chia Đợt của #14), domain
`docs/rules/work-item-sizing.md` + `scripts/check-rules.mjs` (quy tắc 6, `partial`/`deferred`, Size exception),
`superpowers:verification-before-completion` (chạy `pnpm rules:check` trước/sau, `prettier --check`). Chỉ sửa spec/plan, roadmap,
items index, `DELTAS-APPLIED.md` và file này; không source/test/Docs, không git. Không đụng ba hạng mục `g7-device-*`/`g7-ai-usage-intake`.

- **Khung mới (spec + plan, `draft`, Behavior "Chưa thiết kế chi tiết — Đợt sau", plan một task thiết kế chi tiết), đã đăng ký
  index + roadmap:** `qd96-100-transfer-labels-and-overlap` (G6, `US-03-12` partial), `qd96-100-renewal-milestones-and-recipients`,
  `qd96-100-subscription-lifecycle` (G8, `US-11-06` partial; lifecycle ghi phải tách ≥ 4 hạng mục), `g7-browser-usage-intake`,
  `g7-vendor-usage-csv-template`, `g7-g3-g4-decisions` (G7, theo DESIGN §12; S4b có Size exception 6 Story — **chờ Owner**).
  Khóa claim đều `partial`, khớp dòng `deferred`/`partial` của map. Cột `Reason` "chưa có thư mục" của map đổi thành khung.
- `g7-vendor-usage-import-identity`, `g7-g1-g2-recommendations`: thêm `plan.md` khung (Task "hoàn tất spec + plan — Đợt sau") và
  `test-plan.md` khung (link spec không gãy); header spec `ready` → `draft` + "spec dang dở, chưa review"; nội dung giữ nguyên.
- `qd96-100-subscription-owner-confirmation`: `Container`/`Scope map` G5 → **G8** (dòng map G8 đã đúng; cột cuối `US-11-05` nêu `a06-*`).
- `full` → `partial`: `request-term-limit` (`US-05-02` AC-4, `US-06-12` AC-18), `request-sender-rules` (`US-05-02` AC-5),
  `sla-reminder-recipients` (`US-05-09` AC-1, AC-4), `g5-budget-check-and-finance-review` (`US-06-12` AC-1→AC-19, chủ phần còn lại
  chính `qd96-100-budget-check-three-outcomes`; ghi ở Changes).
- Cấu trúc: `account-org-api-fields` n/a → `qd96-100-manager-employee-detail`; `seed-demo-v3` n/a → `e2e-main-flows-suite`, plan
  `#### Task` → `### Task`; `revocation-deadline-and-withdraw` `US-07-05` nêu tên chủ G6.
- **#14 `annual-budget-reserve-and-floor`:** vế DTO kéo lên **Đợt 1** (làn R, R8): Task 1 (M15a chỉ thêm — cần để lưu
  `reserveReason`/tỷ lệ chụp), 2a, 3, 5; Task 4 (409 sàn) Đợt 3; 2b, 6 phần B. Ghi ở spec, plan, `DELTAS-APPLIED` §3; plan #13 bỏ
  câu "tới #14 (Đợt 3)". Lưu ý: `fe-batch/README.md` R8 ghi Migration "—" — thực tế cần M15a (chỉ thêm cột).

Kết quả: `pnpm rules:check` trước **47 lỗi** (45 + 2 link `ALIGNMENT-2026-11-05.md` của agent G7 khác, đã tự hết), sau **0 lỗi**
(`BE: 515 files, 3936 links, 0 errors`). `pnpm exec prettier --check` trên 33 file đã chạm: sạch (sau `--write`).

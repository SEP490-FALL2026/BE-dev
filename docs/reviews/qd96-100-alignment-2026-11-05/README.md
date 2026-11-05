# BE alignment với QĐ-96 → QĐ-100ai — tracker

> Mục tiêu (Owner, 05/11/2026): (1) audit BE so với tài liệu mới — danh sách lệch theo main flow/epic (đúng · sai · thừa · thiếu), mỗi mục có căn cứ QĐ/FR/US và `file:dòng`; (2) dọn API/DTO có trường không còn đúng nghiệp vụ (giữ · bỏ · đổi, có căn cứ). Sau đó viết spec + plan + test trước, rồi mới sửa code. Kết thúc không còn câu hỏi mở; Owner review rồi push.
>
> **Pin:** Docs `3d73a7f` (tài liệu đã đồng bộ theo QĐ-96 → QĐ-100ai, tracker `Docs/Reviews/doc-sync-2026-11-05/TRACKER.md`). BE `3e4553b9` (`origin/dev`), branch làm việc `feat/qd96-100-alignment`.
> **Điểm mở duy nhất:** `QĐ-100l` + `QĐ-100ah` (trưởng phòng không tự gửi Request cá nhân cho chính mình) chờ mentor — **không** code phần đó; chỉ ghi nhận hiện trạng.

## Quy tắc chung cho mọi agent (shared instructions)

1. **Skill Preflight** (workspace `CLAUDE.md`): mở đầu mỗi agent kiểm inventory skill, chọn tối thiểu **một process skill**, các **domain/review skill** cần thiết và **một verification skill**, đọc đủ `SKILL.md` trước khi làm; đầu báo cáo liệt kê skill đã đọc/dùng và mục đích. Thiếu skill đúng tên ⟹ dùng equivalent gần nhất và ghi mapping. Skill không mở rộng scope, không cho phép commit/push.
2. **Trả lời bằng tiếng Việt**; giữ tiếng Anh cho tên file, hàm, API, lệnh, code.
3. Đọc trước: BE `AGENTS.md`, `ARCHITECTURE.md`, README của module mình phụ trách. Nguồn sự thật (thứ tự): sổ hiệu lực `Docs/Decisions/project-decisions.md` → BRD 4.0 → *Định nghĩa phạm vi* 2.0 → `Docs/Requiments/Quy trình và chính sách theo main flow.md` → `Docs/BE-UserStory/user-stories-and-epics.md` → sơ đồ `Docs/Diagrams/main-workflows-activity-diagram/MF-1..MF-5*.md`, `Docs/Diagrams/supporting-business-flows/index.md`. Mã main flow dùng **mã mới** (`QĐ-96a`): MF-1 cấp phát · MF-2 nghỉ việc · MF-3 điều chuyển · MF-4 ngân sách năm · MF-5 usage → thu hồi → giảm gói. Code/README BE có thể còn dùng **mã cũ** (MF-2 cũ = cấp phát…) — đối chiếu theo nội dung, không theo số.
4. **Read-only với code và tài liệu**: chỉ ghi đúng file báo cáo của mình trong `audit/`. Không chạy `pnpm test*`, không chạy bộ test; được dùng grep/đọc file, `pnpm openapi:export` **không** cần. Không `git` thay đổi trạng thái (không commit, checkout, stash, reset).
5. Đọc có chọn lọc (grep trước, mở đoạn cần) — module lớn, đừng nạp nguyên file dài.

## Định dạng báo cáo `audit/<id>.md`

1. Skill đã dùng + mục đích; phạm vi đã đọc (file/thư mục) và phần **chưa** đọc.
2. **Bảng lệch** — mỗi dòng một mục:
   `ID` (vd `A1-07`) · main flow/epic · **Kết luận** (`ĐÚNG` / `SAI` / `THỪA` / `THIẾU`) · căn cứ (`QĐ-…`, `FR-…`, `US-…` kèm file tài liệu:dòng) · bằng chứng code (`file:dòng`) · tác động (nghiệp vụ/demo/bảo mật) · đề xuất sửa **tối thiểu** · cỡ (S ≤ 1h · M ≤ ½ ngày · L > ½ ngày) · cần migration? · phụ thuộc mục khác.
   Mục `ĐÚNG` chỉ cần ghi gọn các quy tắc lớn đã khớp (để biết đã kiểm).
3. **Bảng trường API/DTO** (Việc 2) cho các endpoint ghi (POST/PUT/PATCH) và response chính trong phạm vi: `operationId` · DTO class `file:dòng` · trường · ý nghĩa hiện tại · **giữ/bỏ/đổi** · căn cứ · ảnh hưởng FE (tham khảo `Docs/Figma UI-UX/API-Integration/`).
4. **Câu hỏi cho Owner** — chỉ khi không suy ra được từ QĐ/BRD/US: bối cảnh + ví dụ cụ thể, thực tế bên ngoài (có nguồn nếu có), 2–4 phương án kèm hệ quả, **khuyến nghị**. Không tự đoán; ghi rõ mục nào phụ thuộc câu hỏi.
5. Rủi ro/ghi chú cho pha spec (migration, dữ liệu demo/seed, tương thích FE, test bị ảnh hưởng).

Trả về cho điều phối viên **tóm tắt ≤ 200 từ** (số mục theo kết luận, top lệch lớn, số câu hỏi).

## Kế hoạch

| Pha | Id | Việc | Model | Trạng thái |
| --- | --- | --- | --- | --- |
| A | A1-BUDGET | Ngân sách & kiểm soát chi: `budgets`, `finance`, `operating-parameters` (tham số dự phòng), `requests/{budget-information, budget-questions, finance-review, spend*, plan-line, proposal-review}` — QĐ-97/98/99/100, MF-4 | opus | xong — 48 mục (Đ14·S11·T9·Th14), 5 câu hỏi |
| A | A2-REQUEST | Loại Request, intake, quyết định nhu cầu, định tuyến bước — phần còn lại của `requests` — MF-1; Việc 2 cho mọi DTO Request (gồm form Request nhóm) | opus | xong — Đ17·S8·T2·Th10 + 1 chờ mentor, 5 câu hỏi |
| A | A3-LICENSING | `licensing` + thuê bao trong `catalog` — MF-5, SBF-18 thu hồi dùng chung, thuê bao hết hạn chưa gia hạn, chuyển seat kèm chi phí, QĐ-100o/100y | opus | xong — 32 mục (Đ4·S10·T2·Th16), 5 câu hỏi |
| A | A4-WORKFORCE | `personnel`, `organization`, `identity-access`, `onboarding`, `data-import` — MF-2 nghỉ việc hai nhịp, MF-3 điều chuyển, QĐ-100ag/100q/100x/100z/100af | opus | xong — 23 lệch (S12·T1·Th10) + 17 nhóm đúng, 4 câu hỏi |
| A | A5-CROSS | `notifications`, `dashboards`, `audit`, `installation`, seed/demo dataset — thông báo Người duyệt chi, SLA (`QĐ-100j`), dashboard theo vai, dữ liệu demo còn trạng thái đã bỏ | sonnet | xong — 37 mục (Đ7·S7·T6·Th16), 7 câu hỏi |
| A | V1-REQ-API | Việc 2 — trường API: `access-requests`, `group-requests`, `delegated-requests`, `return-requests`, `need-decisions`, `controlled-waits`, `step-congestion`, `requestable-software`, `service-account-duties` | opus | xong — 48 op, G73·B21·Đ7·ST2·CB1 (+~12 trường response), 4 câu hỏi |
| A | V2-SPEND-API | Việc 2 — trường API: `finance-reviews`, `spend-submission`, `spend-approvals`, `budget-*`, `budgets`, `operating-parameters`, `exchange-rates`, `currencies` | opus | xong — 70 op, 114 trường (G76·B27·ST6·Đ4·CB1), bỏ 5 op, 6 câu hỏi |
| A | V3-CATALOG-API | Việc 2 — trường API: catalog (`vendor*`, `applications`, `functional-groups`, `plans`, `plan-terms`, `subscriptions`, `contracts`, `documents`) + licensing (`license-*`, `seat-baseline*`, `provisioning-tasks`, `handover-duties`, `assignment-expiry`, `saas-issues`, `subscription-renewals`) | opus | xong — 95 op, 181 trường (G154·Đ20·ST5·B1·CB1·Th6), 10 câu hỏi |
| A | V4-PEOPLE-API | Việc 2 — trường API: `employees`, `cost-centers`, `departments`, `department-transfers`, `transfer-reviews`, `long-leaves`, `offboarding-cases`, `personnel-notices`, `employee-imports`, `me`, `auth`, `app-users`, `onboarding`, `notifications`, `dashboards`, `audit`, `super-admin-watch` | opus | xong — 96 op, G78·Đ22·ST6·B2·CB1·Th5, 6 response lộ, 6 câu hỏi |
| B | B-LEDGER | Điều phối viên gộp ledger, hỏi Owner, chốt danh sách hạng mục | — | |
| C | C-SPEC | Spec + plan + test matrix theo hạng mục (`docs/workspace/items/qd96-100-*`) | opus | |
| D | D-IMPL | Implement theo plan; review độc lập; quick gates + test theo file | — | |

## Nhật ký

- 05/11: tracker tạo; `dev` fast-forward lên `3e4553b9`; branch `feat/qd96-100-alignment`. Dispatch pha A (A1–A5 song song).
- 05/11: Owner làm rõ Việc 2 — rà **toàn bộ** API (311 operation, 165 ghi) theo từng flow và từng vai: vai đó ở bước đó cần gửi gì; trường lạ/không cần/không rõ/dữ liệu cá nhân hay nhạy cảm; logic xử lý trường có sai không (ví dụ Employee gửi "Ngày dự kiến phát sinh chi", "Ngày kết thúc quyền"; trưởng phòng duyệt nhu cầu cũng gửi trường lạ). Tách Việc 2 thành V1–V4 riêng (theo tag API); A1–A5 bỏ bảng trường, tập trung lệch nghiệp vụ. Inventory sinh tự động: [api-fields/inventory.md](api-fields/inventory.md) (script ở scratchpad, từ `openapi.json` + `docs/generated/routes.md`).

## Định dạng báo cáo Việc 2 `api-fields/<id>.md`

1. Skill đã dùng; danh sách operation đã rà (đủ mọi operation ghi của các tag được giao + GET có query/response đáng chú ý).
2. Theo từng operation ghi: `operationId` · vai được gọi (theo QĐ, so với guard thật) · flow/bước (MF-x/SBF-x, bước nào) · rồi **bảng trường**: trường (body/query/path) · vai đó có biết/có trách nhiệm cung cấp giá trị này không theo nghiệp vụ · logic dùng ở đâu (`file:dòng`: lưu, dùng trong luật, chỉ echo, không dùng) · server tự suy ra được không · nhạy cảm/dữ liệu cá nhân · **Kết luận**: `GIỮ` / `BỎ` / `ĐỔI` (đổi tên/kiểu/bắt buộc) / `SERVER TÍNH` (bỏ khỏi input, server suy ra) / `CHUYỂN BƯỚC` (đúng trường nhưng sai vai/bước) · căn cứ (QĐ/FR/US + file:dòng) · ảnh hưởng FE (form/label nào ở `Code/FE-web`).
3. **Nghi vấn logic**: trường client gửi mà server tin (giá, số tiền, ngân sách, ngày hiệu lực, vai, phòng ban…), validate thiếu/sai, vai không đúng, trường bị bỏ qua lặng lẽ.
4. Response lộ dữ liệu vượt phạm vi vai (chỉ ghi khi thấy rõ).
5. **Câu hỏi cho Owner** — như định dạng audit (bối cảnh + ví dụ, thực tế bên ngoài có nguồn, 2–4 phương án, khuyến nghị).

## Pha B — kết quả (05/11/2026)

- 9 báo cáo xong; B-LEDGER gộp: [LEDGER.md](LEDGER.md) (150 dòng `L-`), [QUESTIONS.md](QUESTIONS.md) (52 câu gốc → 24 tự giải + 10 câu hỏi Owner), [ITEMS.md](ITEMS.md) (28 hạng mục + 8 hoãn).
- Owner trả lời đủ (QUESTIONS.md mục D): phạm vi B **bỏ MF-5** (chat khác làm; ranh giới: chat MF-5 sở hữu `licensing/subscription-renewal`, usage, mốc ND), MF-4 chỉ dọn + dự phòng 10 %; Q-02 B + `shared-demo-v3`; Q-03 a1+b1+c1+d1; Q-04 B; Q-06 A; Q-08 C; Q-10 1a/2a/3a; thêm API chi tiết nhân viên cho trưởng phòng (#29). Phạm vi cuối 27 hạng mục ≈ 300h (ITEMS.md mục 6). **Không còn câu hỏi mở** trước pha spec.

## Điểm dừng (05/11/2026, Owner tạm dừng để đổi tài khoản)

- **Xong:** pha A (9 báo cáo), pha B (LEDGER/QUESTIONS/ITEMS, Owner trả lời đủ — QUESTIONS.md mục D), pha C viết spec/plan 28 thư mục `docs/workspace/items/qd96-100-*` (#27 tách `catalog-api-fields` + `licensing-api-fields`; #28 `seed-demo-v3`), rà chéo độc lập [C-REVIEW.md](C-REVIEW.md) (30 phát hiện: 8 Critical, 13 Required, 9 Optional; thứ tự build + 25 migration toàn cục ở mục 3).
- **Đang dở (đã dừng giữa chừng):** 5 agent sửa spec/plan theo C-REVIEW — Track B (#6 #7 #8 #11 #12 #13 #14 #16 #22), Track R (#4 #5 #15 #19 #20 #21), Track P (#1 #2 #3 #24 #25 #26 #29), Track T/L (#17 #18 #23 catalog/licensing-api-fields), #28 seed (OQ-28-1 demo tay; Q-R1 #11 đổi tên fixture v2 → v3). Một số file có thể đã sửa một phần.
- **Làm tiếp:** (1) mỗi track: đọc C-REVIEW.md + QUESTIONS.md mục D, sửa mọi Critical + Required chạm hạng mục của mình, Optional theo đề xuất review (R-22 hằng `DECIDED_ROLE_SYSTEM_*`, R-23 `dueOn`, R-24 bỏ boolean `*_by_system`, R-25, R-26 chấp nhận, R-27, R-28), đánh số migration theo danh sách phẳng Mxx (timestamp đặt lúc merge, R-19), ghi thứ tự rebase file nóng (R-21); prettier chỉ trên file đã sửa. (2) Điều phối viên đăng ký 28 hạng mục vào `docs/workspace/items/README.md` + `docs/roadmap.md` + scope map G2/G5/G6/G8 (re-pin Docs `3d73a7f`), chạy `pnpm rules:check`. (3) Báo Owner kế hoạch implement (một hàng đợi merge theo C-REVIEW mục 3; quick gates + test theo file; review độc lập code AI; không commit/push khi chưa được phép).

## Pha C — quy tắc cho agent viết spec

1. Skill Preflight như trên. Đọc `docs/workspace/README.md`, `docs/workspace/_template/{spec,plan}.md`, `docs/rules/work-item-sizing.md` (chỉ phần cần), `docs/rules/api-contract.md`, `docs/rules/database-business.md`, `docs/rules/module-structure.md` khi chạm phần đó.
2. Mỗi hạng mục một thư mục `docs/workspace/items/qd96-100-<slug>/` với `spec.md` + `plan.md` theo template (giữ đúng tên mục bắt buộc). **Viết gọn** (Owner, bài học `QĐ-93`): spec ≈ ≤ 150 dòng, plan ≈ ≤ 80 dòng; không viết luận; test matrix là bảng trong spec. Thiết kế `draft`; Phụ trách: AI theo giao việc Owner (05/11/2026); Nguồn: Docs `3d73a7f`, BE `3e4553b9`; Container: bó finding `qd96-100-alignment` (ghi `Scope map: n/a — bó finding ngoài nhóm G` nếu không thuộc G).
3. **Kiểm lại code** (`file:dòng`) trước khi viết — ledger/báo cáo có thể sai. Thiết kế tối thiểu đáp ứng QĐ và câu trả lời Owner; phần mở rộng ghi *tùy chọn* ở out of scope.
4. Contract chung giữa hạng mục: hạng mục được ghi là chủ (vd #6 sở hữu hàm kiểm tra ngân sách) định nghĩa; hạng mục khác chỉ tham chiếu.
5. **Không** sửa `docs/workspace/items/README.md` và `docs/roadmap.md` (điều phối viên đăng ký một lần); không sửa code; không chạy test; không git thay đổi trạng thái.
6. Câu hỏi mới phát sinh: ghi mục `## Open questions` trong spec kèm phương án + khuyến nghị và báo trong tóm tắt; không tự đoán ở chỗ đổi nghiệp vụ.
7. Trả về tóm tắt ≤ 150 từ: hạng mục đã viết, cỡ ước lại, migration, câu hỏi mới.

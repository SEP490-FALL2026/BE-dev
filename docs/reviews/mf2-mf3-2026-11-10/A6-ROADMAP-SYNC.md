# A6 — Đồng bộ roadmap BE với User Stories hiện hành (10/11/2026)

**Skill đã đọc/dùng:** `andrej-karpathy-skills:karpathy-guidelines` (process: sửa tối thiểu, chỉ chạm dòng truy được về
yêu cầu, tiêu chí kiểm được) · `documentation-and-adrs` (domain: mỗi sự thật một nguồn chính, giữ caveat, không viết
lại lịch sử; không có skill riêng cho đồng bộ roadmap nên dùng skill tài liệu gần nhất) ·
`superpowers:verification-before-completion` (verification: chạy `rules:check`, prettier và script đếm trước khi báo).

**Phạm vi:** chỉ sửa [roadmap](../../roadmap.md) và tạo file này. Không sửa repo Docs, không sửa code, không `git
add/commit/stash/checkout`, không chạy test ngoài hai lệnh kiểm tài liệu. Không có trạng thái `accepted` nào được ghi.

## 1. Nguồn đã dùng

| Nguồn                    | Revision / nội dung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs (pin nghiệp vụ)     | `5bb2e6a` — `QĐ-109`, BRD v4.11. `main` hiện ở `3c5a0bc` (chỉ thêm commit tài liệu API); `git diff 5bb2e6a HEAD -- BE-UserStory Decisions Requiments` rỗng, cây làm việc `BE-UserStory/` sạch                                                                                                                                                                                                                                                                                                                                                      |
| User Stories             | v0.15, baseline cập nhật tới 09/11/2026 (`QĐ-01` → `QĐ-109`). Bảng sinh _Số đếm hiện hành_ của `BE-UserStory/user-stories-and-epics.md`: 146 `BASELINED` · 0 `OWNER-PROVISIONAL` · 3 `RESEARCH-DEPENDENT` · 5 `DEFERRED` · 29 `RETIRED` = **183** mã (154 đang dùng), 1 864 AC đang dùng, 130 AC đã bỏ                                                                                                                                                                                                                                             |
| Kiểm lại số đếm          | `python -I -B BE-UserStory/tools/us_tools.py stats BE-UserStory/src/EP-*.md` (chỉ đọc, không chạy `build_us.py`): 183 dòng, cùng phân bố. Main flow → Story lấy từ bảng `G.1.2`; lý do `RETIRED` lấy từ dòng _Đã thay bởi … Lý do_ của từng Story trong `src/EP-*.md`                                                                                                                                                                                                                                                                              |
| BE                       | Nhánh `feat/mf2-mf3` = `origin/dev` = `a2dad526` (merge PR #41); PR #36 `fix/review-mf145` (merge `11051f28`), PR #37 `fix/ci-e2e-head-own`                                                                                                                                                                                                                                                                                                                                                                                                        |
| Bằng chứng trạng thái BE | [tracker QĐ-103 → QĐ-108](../qd103-108-alignment-2026-11-08/README.md) (§5 đợt W0–W9, §7 spec cũ chồng phạm vi); [SPEC](../mf1-mf4-reaudit-2026-11-09/SPEC.md), [PLAN](../mf1-mf4-reaudit-2026-11-09/PLAN.md), [PROGRESS](../mf1-mf4-reaudit-2026-11-09/PROGRESS.md) MF-1/MF-4; dòng `Thiết kế:` của 41 spec `docs/workspace/items/qd103-*`                                                                                                                                                                                                        |
| Báo cáo ngoài repo       | Thư mục bàn giao `mf1-mf4-handoff/` cạnh repo BE: `AUDIT-FINAL.md` (trên `e962019e`, bảng bước × vai, AF-01 … AF-18), `INTEGRATION-REPORT.md` (gộp 6 nhánh G9-02, K4, MF-5 chạy tay, MF-4 baseline, lịch sử theo vai, GH + Request tiếp tục), `DEPLOY-READY.md` (phần còn lại không chặn deploy)                                                                                                                                                                                                                                                   |
| Grep `src/`, `prisma/`   | Xác nhận các AF đã sửa: `revocation.policy.ts` chỉ còn chặn `K3`; `ownerDepartmentId` tùy chọn; `GET access-request-audit-flags`; `RENEWAL_WINDOW_DAYS` + `RENEWAL_WINDOW_OPENED`; release `REVOKED`/`LATE_GRANT`/`GRANTED_FROM_POOL`; `POST /ghost-seat-rule-runs`; `department-creation-window.listener.ts`. Xác nhận còn thiếu: không có `purchase-invoice`, `role-based`/birthright, `KPI_4`; `subscription-renewal` còn route `decision` cũ; model `Contract` chỉ có tên; không có model sao kê/bản ghi phát hiện hay `data_subject_requests` |

`PROGRESS.md` của `mf1-mf4-reaudit-2026-11-09` chỉ ghi tình trạng chat B ngày 09/11 (gói 5, 6 `BLOCKED`), cũ hơn lần
merge PR #36; trạng thái trong roadmap dựa vào `AUDIT-FINAL` + `INTEGRATION-REPORT` + grep, không dựa vào file này.

## 2. Chênh lệch tìm thấy

Roadmap trước khi sửa (HEAD `a2dad526`) nhắc 163 mã Story khác nhau. 162 mã có trong Docs; `US-15-08` chỉ xuất hiện
trong câu _không có `US-15-08`_ (`QĐ-78`) — đúng nghĩa, không sửa. 21 mã của Docs chưa từng được nhắc (20 đang dùng và
`US-07-12`). _Bảng phủ 157 mã Story_ (cập nhật cuối 01/11/2026, Docs `69e8a3d`) thiếu 26 mã của Docs.

### 2.1 Story mới chưa có trong roadmap

| Story      | Tạo bởi                 | MF         | Trạng thái BE gán | Ghi chú                                        |
| ---------- | ----------------------- | ---------- | ----------------- | ---------------------------------------------- |
| `US-03-13` | `QĐ-103h`               | MF-3       | `đợt MF-2/3`      | Thay `US-03-07`, `US-03-12`                    |
| `US-03-14` | `QĐ-103g`               | MF-2, MF-3 | `đợt MF-2/3`      |                                                |
| `US-03-15` | `QĐ-104e`               | MF-4       | `merged-dev`      | `department-creation-window`                   |
| `US-04-13` | `QĐ-101k`               | —          | `chưa làm`        | Có nhắc ở dòng `c1-contract-list-and-fields`   |
| `US-04-14` | `QĐ-103d`, `QĐ-103v`    | MF-1       | `merged-dev`      |                                                |
| `US-05-22` | `QĐ-103c`, `QĐ-104b`    | MF-1       | `merged-dev`      | GH chỉ có sau `feat/mf1-rules` (AF-03 đã sửa)  |
| `US-05-23` | `QĐ-103f`, `QĐ-104a`    | MF-1, MF-4 | `merged-dev`      |                                                |
| `US-05-24` | `QĐ-103p`               | MF-1       | `merged-dev`      | Cờ Super Admin (AF-15 đã sửa)                  |
| `US-06-15` | `QĐ-94g`, `QĐ-103i`     | MF-1, MF-4 | `merged-dev`      | AF-05, AF-08 đã sửa ở `feat/mf4-baseline`      |
| `US-06-16` | `QĐ-97c`                | MF-1       | `merged-dev`      | Có nhắc ở dòng `qd96-100-reserve-confirmation` |
| `US-06-17` | `QĐ-103b`, `QĐ-103o`    | MF-1       | `merged-dev`      |                                                |
| `US-06-18` | `QĐ-104a`, `QĐ-104e`(2) | MF-1, MF-4 | `merged-dev`      |                                                |
| `US-06-19` | `QĐ-104f`               | MF-4       | `merged-dev`      |                                                |
| `US-07-13` | `QĐ-103f`               | MF-1       | `một phần`        | Thiếu `SBF-19`, API đọc chi phí tránh được     |
| `US-07-14` | `QĐ-104g`               | —          | `chưa làm`        | Gói 14 của PLAN chưa code                      |
| `US-11-08` | `QĐ-103e`, `QĐ-104d`    | MF-5       | `để sau`          |                                                |
| `US-11-09` | `QĐ-103e`, `QĐ-104a`    | —          | `để sau`          |                                                |
| `US-12-16` | `QĐ-103l`               | MF-1       | `để sau`          | AF-09                                          |
| `US-12-17` | `QĐ-103l`               | —          | `để sau`          | AF-09                                          |
| `US-12-18` | `QĐ-103k`, `QĐ-103r`    | MF-3       | `để sau`          | AF-11                                          |
| `US-12-19` | `QĐ-103n`               | —          | `để sau`          |                                                |
| `US-12-20` | `QĐ-104c`, `QĐ-104i`    | —          | `để sau`          | AF-11                                          |
| `US-03-12` | `QĐ-94f` → `RETIRED`    | —          | `RETIRED`         | `QĐ-103h`                                      |
| `US-07-12` | `QĐ-94e` → `RETIRED`    | —          | `RETIRED`         | `QĐ-103f`                                      |
| `US-11-06` | `QĐ-94d` → `RETIRED`    | —          | `RETIRED`         | `QĐ-103e`                                      |
| `US-11-07` | `QĐ-94c` → `RETIRED`    | —          | `RETIRED`         | `QĐ-103e`                                      |

### 2.2 Story `RETIRED` mà roadmap còn ghi như việc phải làm

| Story      | `RETIRED` theo       | Nơi roadmap còn ghi (trước khi sửa)                                                                                                            |
| ---------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `US-03-02` | `QĐ-100t`            | Bảng phủ G5; scope map G5 (`full`/`partial`); dòng `g5-delegated-requests`, `qd93-*`                                                           |
| `US-03-07` | `QĐ-103h`            | Bảng phủ G6; cột _US trọng tâm_ G6; scope map G6; dòng `g6-transfer-tool-review`, `qd96-100-transfer-*`                                        |
| `US-03-12` | `QĐ-103h`            | Scope map G6; dòng `qd96-100-transfer-review-defaults`, `qd96-100-transfer-labels-and-overlap`                                                 |
| `US-06-02` | `QĐ-29b`, `QĐ-97c`   | Bảng phủ G5; scope map G5; dòng `g5-finance-information-request`, `g5-step-sla-and-alerts`                                                     |
| `US-06-03` | `QĐ-29b`, `QĐ-97c`   | Bảng phủ G5; scope map G5; dòng `g5-finance-information-request`                                                                               |
| `US-06-07` | `QĐ-103f`            | Bảng phủ G5; scope map G5; dòng `g5-commitment-creation`, `g5-budget-version-decision`                                                         |
| `US-06-13` | `QĐ-97c`             | Bảng phủ G5; scope map G5; dòng `g5-budget-check-and-finance-review`                                                                           |
| `US-11-01` | `QĐ-103e`            | Bảng phủ G8; scope map G8; dòng `a06-renewal-milestone-alerts`, `a06-renewal-usage-evidence`                                                   |
| `US-11-02` | `QĐ-94c`(1)          | Bảng phủ G8; scope map G8; dòng `a06-renewal-proposal-decision`, `a06-renewal-usage-evidence`, `qd93-*`                                        |
| `US-11-05` | `QĐ-103e`, `QĐ-103q` | Bảng phủ G8; scope map G8; dòng `a06-renewal-*`, `qd96-100-subscription-owner-confirmation`                                                    |
| `US-11-06` | `QĐ-103e`            | Scope map G8; dòng `qd96-100-subscription-owner-confirmation`, `qd96-100-renewal-milestones-and-recipients`, `qd96-100-subscription-lifecycle` |
| `US-11-07` | `QĐ-103e`            | Chỉ trong ghi chú của scope map G10 (không phải dòng việc)                                                                                     |
| `US-12-13` | `QĐ-103k`            | Bảng phủ G8; ghi chú scope map G6                                                                                                              |
| `US-13-06` | `QĐ-103m`            | Bảng phủ G9; dòng G9 của bảng _Nhóm triển khai_ (endpoint hợp thức hóa)                                                                        |

`US-02-07`, `US-04-08`, `US-04-10`, `US-06-08` còn ở dòng hạng mục cũ đã `merged-dev`, nhưng scope map G2/G3/G5 đã ghi
chúng `not affected`; các mã `RETIRED` khác đã có trong danh sách _Retired_ của bảng phủ.

### 2.3 Story đổi phạm vi lớn (đánh dấu _viết lại_ trong tiêu đề, từ `QĐ-94`)

| Story      | Quyết định                                  | Thay đổi                                                                                                          |
| ---------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `US-04-06` | `QĐ-104l`                                   | Từ _Business Owner thay thế_ thành _chuyển IT Admin phụ trách_; lát `g3-business-owner-replacement` theo Story cũ |
| `US-05-14` | `QĐ-94c`, `QĐ-96b`, `QĐ-98a/i`, `QĐ-104a/b` | Chỉ quyền có thời hạn, cửa sổ 30 ngày, cùng gói                                                                   |
| `US-05-23` | `QĐ-104a`, `QĐ-104k`                        | Viết lại toàn bộ: quyền mặc định không ngày kết thúc, số tiền theo tháng còn lại                                  |
| `US-06-15` | `QĐ-103i`                                   | Từ _phong bì/chỉ tiêu (B0 → B3)_ thành _Trần năm, Trần phòng (B1 → B2)_                                           |
| `US-11-03` | `QĐ-103e`                                   | Hệ quả của kết quả điều chỉnh (bỏ phần vượt, cờ thực hiện)                                                        |
| `US-11-04` | `QĐ-103e`, `QĐ-103n`                        | Gia hạn ngoài ý muốn là sự cố; _hết hạn chưa gia hạn_ / _Đóng thuê bao_                                           |
| `US-11-08` | `QĐ-103e`, `QĐ-103q`, `QĐ-104d`             | Hệ thống tính số seat cần, IT gia hạn đúng số                                                                     |
| `US-11-09` | `QĐ-104a`, `QĐ-104d`(3)                     | Nhắc duy trì từng kỳ thanh toán, nộp hóa đơn từng kỳ                                                              |
| `US-12-02` | `QĐ-103l`                                   | Từ _Finance import hóa đơn_ thành đối soát hóa đơn mua hàng đã xác nhận                                           |
| `US-12-04` | `QĐ-94h`                                    | Ba con số tiết kiệm: tiềm năng, tránh được, thực                                                                  |
| `US-10-04` | `QĐ-94h`                                    | Phần tiết kiệm của khuyến nghị                                                                                    |
| `US-13-05` | `QĐ-96e`, `QĐ-100s`                         | Hồ sơ ngoài quy trình, `BM-07` kèm đánh giá kỹ thuật                                                              |

Phụ lục 3 của US còn ghi `QĐ-103` viết lại tại chỗ các Story bị chạm ở `EP-01` → `EP-07`, `EP-10` → `EP-13`, `EP-15`,
`EP-16`, và `QĐ-109` sửa AC của `US-05-01`, `US-05-02`, `US-05-04`, `US-05-14`, `US-05-22`, `US-05-23`, `US-06-09`,
`US-06-10`, `US-06-11`, `US-06-14`, `US-06-15`, `US-06-18`, `US-06-19`, `US-12-15` — không đổi mã nên chỉ phản ánh qua
trạng thái BE.

### 2.4 Lệch khác

- `US-09-05`, `US-09-09` nay `BASELINED` (_Phạm vi hiện thực_: _Chỉ đặc tả_); bảng phủ cũ xếp ở cột _có điều kiện_.
  `RESEARCH-DEPENDENT` hiện chỉ còn `US-07-03`, `US-08-06`, `US-09-06`.
- Dòng 10 của roadmap ghi baseline hiện hành là Docs `72e1480`.
- 41 hạng mục `qd103-*` không có dòng trong bảng _Hạng mục_; scope map G1–G10 pin Docs `69e8a3d`, `e0cb5a0`, `5dad7b6`,
  `d6d868c` (đều trước `QĐ-103`).
- Bảng _Hạng mục_ ghi `g7-device-*`, `g7-ai-usage-intake` là `not-started` trong khi `src/modules/devices` và
  `src/modules/usage/ai-usage` đã có code; nhiều dòng `qd93-*` ghi `not-started` dù bản giao đã merge (đã ghi ở đoạn
  03/11/2026 của roadmap).
- `docs/workspace/sources.md` chưa có snapshot nào cho Docs `5bb2e6a` (cũng không có `9c7f386`, `69e8a3d`).
- Code của Story `RETIRED` còn trên `dev`: model `TransferReview` (`US-03-07`), route
  `POST /subscription-renewals/{id}/decision` theo mô hình trưởng phòng sở hữu xác nhận (`US-11-02`, `US-11-05`,
  `US-11-06`), route Finance `POST /budget-commitments/{id}/invoices` (luật hóa đơn cũ).

## 3. Thay đổi đã áp vào roadmap

Dòng tính trên file sau `prettier --write`. `git diff --stat -- docs/roadmap.md`: 205 dòng thêm, 1 dòng sửa (dòng 10).
Không sửa đoạn lịch sử, dòng của bảng _Hạng mục_, scope map hay bảng phủ cũ.

| Dòng      | Thay đổi                                                                                                                                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10        | Câu _Baseline nghiệp vụ hiện hành_ đổi thành Docs `5bb2e6a`; `72e1480` ghi là baseline của các lát tới 22/10/2026                                                                                                                             |
| 137–152   | Đoạn **Cập nhật 10/11/2026 (đồng bộ US theo `QĐ-103` → `QĐ-109`)** sau đoạn 01/11/2026 (thứ tự thời gian): pin, số Story, BE `a2dad526`, đường chính MF-1/4/5 + kho đã merge, luồng phụ để sau, MF-2/MF-3 đợt kế tiếp, các phần cũ là lịch sử |
| 369–376   | Ghi chú sau bảng _Hạng mục_: 41 hạng mục `qd103-*` không có dòng, nguồn là tracker/PLAN; các dòng còn ghi Story `RETIRED` là lịch sử; danh sách thay thế ở tracker §7                                                                         |
| 488–493   | Ghi chú trước scope map G1: pin cũ; dòng scope map của Story `RETIRED` (G5, G6, G8) không còn là việc; 22 Story mới chưa có nhóm G; re-pin chờ Owner                                                                                          |
| 996–1160  | Mục mới **Story hiện hành và trạng thái BE (10/11/2026)**: nguồn, nghĩa nhãn, bảng MF-1/MF-4/MF-5 + kho + Story mới, bảng MF-2/MF-3, bảng Story còn lại gộp theo Epic, bảng 29 Story `RETIRED` (QĐ, thay bởi)                                 |
| 1164–1167 | Ghi chú đầu _Bảng phủ 157 mã Story_: lịch sử tới 01/11/2026, trỏ sang mục mới, liệt kê 11 mã nay `RETIRED` còn ở cột backlog                                                                                                                  |

Mỗi mã của Docs xuất hiện đúng một lần trong mục mới (script đọc bảng, mở rộng dải `→`: 183/183, không trùng, không
thừa; lớp `RETIRED`/`DEFERRED` khớp Docs). Phân bố: `merged-dev` 30 · `một phần` 13 · `để sau` 13 · `đợt MF-2/3` 20 ·
`chưa làm` 9 · `chưa xác minh` 64 · `DEFERRED` 5 · `RETIRED` 29.

Link mới chỉ tới: `reviews/qd103-108-alignment-2026-11-08/README.md` (kể cả anchor §7),
`reviews/mf1-mf4-reaudit-2026-11-09/SPEC.md`, `PLAN.md`, file này và anchor nội bộ của roadmap. Tên hạng mục khác
(`g5-*`, `g6-*`, `a0*-*`, `c1-*`, `qd103-*`) ghi dạng code, không thêm link vào `docs/workspace/items/`. Docs được nhắc
bằng đường dẫn dạng code như roadmap đang làm.

## 4. Còn để ngỏ / cần Owner quyết

1. **Luồng phụ thuộc đợt nào.** `DEPLOY-READY.md` ghi _hóa đơn `SBF-19`, chi phí seat-tháng, nhắc việc, thiết bị khóa
   `K4`, điều chỉnh thuê bao_ là việc _để đợt MF-2/MF-3_; brief của lượt này nói _để đợt sau_. Roadmap ghi `để sau`, chưa
   gán đợt. Owner chọn: gộp vào đợt MF-2/MF-3 hay đợt riêng sau đó.
2. **`US-07-14` (quyền theo vai) và `US-04-13` (hợp đồng nhà cung cấp)** — đều `chưa làm`, có spec (`qd103-role-based-access`
   `ready`; `c1-contract-list-and-fields` `ready`). Làm ở đợt nào?
3. **Re-pin scope map G1–G10 và bảng _Hạng mục_.** Scope map còn pin trước `QĐ-103`, 41 hạng mục `qd103-*` chưa có dòng.
   Owner chọn: re-pin + thêm dòng sau khi agent dọn spec cũ xong, hay giữ tracker `qd103-108-alignment` làm nguồn tiến
   độ của đợt (khi đó cần ghi rõ ở roadmap là nguồn chính).
4. **Snapshot nguồn.** Thêm Docs `5bb2e6a` vào `docs/workspace/sources.md` (ngoài phạm vi sửa của lượt này).
5. **Gói W8b `blocked` (Q-160):** `qd103-savings-report` (`US-12-04`), `qd103-role-dashboards-digest` (`US-12-15`),
   `qd103-period-cost-close`, `qd103-budget-vs-actual-report` — vẫn chờ Owner.
6. **Job 01/01 khi chưa có tỷ giá ngày 01/01** (`US-06-18`) — hạn trước 15/12/2026 theo `DEPLOY-READY.md`.

Chưa xác minh trong lượt này: 64 Story gắn `chưa xác minh` (lát cũ chưa đối chiếu Docs `5bb2e6a`); kết quả CI GitHub
trên `a2dad526`; các rủi ro mở của `INTEGRATION-REPORT.md` §7 (rút Request tiếp tục khi chờ `EXTEND`, thông báo
`NEED_APPROVED`, Request nhóm có trưởng phòng).

## 5. Kết quả lệnh kiểm

Chạy trong repo BE trên cây làm việc của lượt này:

| Lệnh                                                                        | Kết quả                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm rules:check` (trước khi sửa)                                          | `BE: 606 files, 4200 links, 0 errors`                                   |
| `pnpm exec prettier --check docs/roadmap.md` (lần 1, sau khi thêm nội dung) | Báo lỗi format (bảng mới chưa căn cột)                                  |
| `pnpm exec prettier --write docs/roadmap.md`                                | Chỉ căn lại phần vừa thêm; `git diff --stat`: 205 dòng thêm, 1 dòng sửa |
| `pnpm exec prettier --check docs/roadmap.md` (lần 2)                        | `All matched files use Prettier code style!`                            |
| `pnpm rules:check` (sau khi sửa, có file này)                               | `BE: 606 files, 4215 links, 0 errors` (link và anchor mới đều tới được) |

Không chạy `pnpm rules:format`, test, build hay lệnh nào ghi vào repo Docs. `git status` của repo BE chỉ có
`docs/roadmap.md` (sửa) và thư mục `docs/reviews/mf2-mf3-2026-11-10/` (mới) do lượt này; ba dòng xóa
`.claude/worktrees/agent-*` đã có từ trước, không thuộc lượt này.

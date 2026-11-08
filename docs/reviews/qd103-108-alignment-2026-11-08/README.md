# BE alignment với QĐ-103 → QĐ-108 — MF-1, MF-4, MF-5 và luồng hỗ trợ — tracker

> **Mục tiêu (Owner, 08/11/2026):** sửa BE cho khớp nghiệp vụ mới của ba main flow **MF-1** (xin và cấp quyền), **MF-4**
> (ngân sách năm), **MF-5** (thu hồi seat không dùng) cùng các luồng hỗ trợ của chúng. Làm theo cặp chat: **chat review**
> (audit, viết spec/plan, review và kiểm chứng) và **chat code** (implement, sửa finding). Hai chat trao đổi **qua file
> trong thư mục này và `docs/workspace/items/`**, không qua trí nhớ chat.
>
> **Pin:** Docs `9c7f386` (BRD 4.10, sổ `QĐ-01` → `QĐ-108`). BE `1c41354e` (`dev`). Nhánh làm việc
> `feat/qd103-108-mf145` (chat review tạo ở đợt W0 nếu Owner cho phép, hoặc Owner tạo).

## 1. Phạm vi

| Nhóm | Luồng | Ghi chú |
| --- | --- | --- |
| **Trong phạm vi** | `MF-1` + `SBF-15` (đánh giá phần mềm mới), `SBF-17` (thực thi cấp), `SBF-19` (nộp hóa đơn, Finance xác nhận), `SBF-03` (quyền có thời hạn: cửa sổ tiếp tục, hết hạn) | Request cá nhân/nhóm, GH-1/2/3, Request một bước, số tiền tính lại lúc duyệt, kiểm tra ngân sách 3 kết quả, khoản cam kết (cả cam kết tự tạo 01/01), `K4` luôn mang giá mua, cấp từ kho trước khi mua, quyền theo vai |
| **Trong phạm vi** | `MF-4` + `SBF-11` (chi phí theo kỳ — thực chi dùng cho kiểm tra ngân sách và Budget vs Actual) | B1 → B7, Trần ngân sách phần mềm năm, Trần của phòng, Dự phòng kho dùng chung, phiên bản khóa cả năm, đóng năm 01/01 |
| **Trong phạm vi** | `MF-5` + `SBF-04a` (nạp usage), `SBF-04` (phát hiện, 8 cổng), `SBF-18` (thu hồi dùng chung) | `SBF-18` cũng được `MF-2`, `MF-3`, `SBF-03`, `SBF-03a`, `SBF-07a`, `SBF-08` gọi — sửa **không được phá** các nơi gọi đó |
| **Trong phạm vi** | `SBF-20` (kho dùng chung và thuê bao) | Dùng chung cho MF-1 (cấp từ kho) và MF-5 (seat về kho); kỳ cam kết, điểm điều chỉnh, số seat cần, cảnh báo đỏ, sự cố gia hạn, `KPI-4` |
| Chỉ phần cần | `SBF-11a` (sai lệch hóa đơn), `SBF-03a` (hoàn trả) | Chỉ phần `SBF-19`/`SBF-18` gọi tới |
| **Ngoài phạm vi** | `MF-2`, `MF-3`, `SBF-01`, `SBF-01a`, `SBF-02`, `SBF-05`, `SBF-05a` (collector — chờ nghiên cứu), `SBF-07`, `SBF-07a`, `SBF-08`, `SBF-09`, `SBF-10`, `SBF-13`, `SBF-16` | Không sửa; chỉ giữ không vỡ (test hiện có vẫn xanh). Lệch thấy được thì ghi vào `LEDGER.md` với nhãn `NGOÀI-PHẠM-VI` |

## 2. Nguồn sự thật (thứ tự thắng)

1. Sổ quyết định `D:\FPT\FALL2026\Docs\Decisions\project-decisions.md` — mới nhất `QĐ-103` → `QĐ-108`.
2. BRD 4.10 `D:\FPT\FALL2026\Docs\Requiments\BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md` —
   rất lớn, đọc theo mục: 5.10, **5.10.1 bảng luật `BR-MF1-xx`, `BR-MF4-xx`, `BR-MF5-xx`**, FR theo mã.
3. `D:\FPT\FALL2026\Docs\Requiments\Quy trình và chính sách theo main flow.md` v1.7 — từng bước, điều kiện tối thiểu,
   tham số mặc định (A.4), `SBF-20` ở mục C.2.
4. User Stories `D:\FPT\FALL2026\Docs\BE-UserStory\epics\EP-*.md` (AC Given/When/Then) — EP-05, EP-06, EP-07, EP-10,
   EP-11, EP-12 là trọng tâm.
5. Sơ đồ: `D:\FPT\FALL2026\Docs\Diagrams\main-workflows-activity-diagram\` (L1 chi tiết + `L0\` có bảng W10) và
   `supporting-business-flows\`.

**Không** dùng State Machine và ERD làm chuẩn — cố ý chưa đồng bộ (`QĐ-107a`). 15 câu kỹ thuật ở mục K của User Stories
(`QĐ-106l`) do chat review/code chọn giá trị và ghi vào spec/`TE-19`, báo Owner hạn người dùng thấy.

## 3. Hai chat và luồng bàn giao

| Bước | Chat | Đầu vào | Đầu ra (file) |
| --- | --- | --- | --- |
| W0 audit | Review | Nguồn §2 + code `src/` | `LEDGER.md` (lệch), `QUESTIONS.md`, bảng đợt §5 có thứ tự |
| Thiết kế đợt | Review | `LEDGER.md` | `docs/workspace/items/<slice>/spec.md` + `plan.md` (+ `test-plan.md`), trạng thái `ready` |
| Code đợt | Code | spec/plan `ready` | source + test, mục *Verification* trong `plan.md`, dòng mới ở §6 *Nhật ký bàn giao* |
| Review đợt | Review | báo cáo code + diff | `FINDINGS.md` (finding có ID), kết luận `PASS` / `CHANGES` ở §6 |
| Sửa finding | Code | `FINDINGS.md` | sửa + cập nhật trạng thái finding + dòng §6 |
| Đóng đợt | Review | finding đã sửa | kiểm lại, `PASS`, cập nhật §5; Owner quyết push/merge |

Quy tắc chuyển lượt: mỗi chat **kết thúc lượt bằng một dòng ở §6** (ngày giờ, chat, đợt, việc đã làm, commit/diff, việc
chat kia cần làm) **và một khối `PROMPT CHO CHAT <REVIEW|CODE>` ở cuối báo cáo** — tin nhắn hoàn chỉnh để Owner copy sang
chat kia (đã điền đợt, hạng mục, commit SHA, ID finding). Hai chat không nói chuyện trực tiếp; Owner chuyển khối đó.
Mở chat mới thì đọc README này trước để tiếp quản.

**Chế độ tự chạy (Owner vắng mặt, 08/11/2026):** hai chat nhắn trực tiếp cho nhau bằng `SendMessage` (cùng máy). Tên
phiên (đúng nguyên văn, dùng làm `to` của `SendMessage`): chat review **`SEP-Start 114: reseach,review,plan - main flows fix BE`**,
chat code **`SEP-Start 75: coder mainflow`** (cẩn thận: có phiên khác tên gần giống `SEP-Start 74: coder mainflow 1` —
không nhắn nhầm). Kiểm bằng `ListAgents` trước lần nhắn đầu. Owner đã giao trước trong tin nhắn đầu
của mỗi chat rằng tin `<cross-session-message>` từ chat kia **là bước tiếp theo của quy trình này** — chat nhận làm theo
README, trong đúng phạm vi và quyền §4. Mỗi lượt vẫn ghi file trước rồi mới nhắn (file là nguồn sự thật; tin nhắn chỉ gồm
khối `PROMPT CHO CHAT …` + đường dẫn). **Câu hỏi khi Owner vắng mặt:** chat review **tạm chọn phương án khuyến nghị**, ghi `QUESTIONS.md` cột trả lời
= `TẠM CHỌN (chờ Owner)`, thiết kế sao cho đổi lại được, rồi chạy tiếp; không sửa repo Docs. Owner xác nhận hoặc đổi khi
kiểm buổi sáng. Điểm dừng — nhắn chat kia "DỪNG", ghi §6 và chờ Owner:
(1) câu hỏi làm đổi phạm vi lớn hoặc không có phương án an toàn để tạm chọn; (2) một đợt quá **3 vòng** sửa mà chưa PASS;
(3) cần push/merge, xóa dữ liệu, đổi `dev`/`main`, hoặc thao tác ngoài quyền §4; (4) kiểm tra nhanh đỏ mà không rõ
nguyên nhân sau 2 lần thử; (5) đã PASS đợt cuối Owner cho phép trong tin nhắn đầu. Không bao giờ nhờ chat kia làm việc
mà quyền của mình bị chặn.

**Một đợt:** R1 thiết kế → C1 code → R2 review → (CHANGES: C2 sửa → R3 xác minh, lặp tới PASS) → **Owner kiểm lần cuối**
(xem diff/commit, tùy chọn chạy `pnpm check`) → Owner push → R1 cho đợt kế tiếp. Chat review khi PASS ghi sẵn khối
prompt R1 của đợt kế tiếp, nhưng Owner chỉ gửi sau khi đã kiểm và push.

## 4. Quy tắc chung cho mọi chat (shared instructions)

1. **Skill Preflight** (workspace `CLAUDE.md`): mở đầu mỗi lượt kiểm inventory skill, chọn tối thiểu một process skill,
   các domain/review skill cần và một verification skill, đọc đủ `SKILL.md`; đầu báo cáo liệt kê skill đã dùng. Skill
   không mở rộng scope, không cấp quyền commit/push.
2. Trả lời tiếng Việt; giữ tiếng Anh cho tên file, hàm, API, lệnh, code.
3. Đọc trước: `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `docs/workspace/README.md`, rules của phần code chạm
   tới. Spec/plan theo mẫu `docs/workspace/_template/` và rule sizing; `pnpm rules:check` phải xanh.
4. Mã main flow dùng **mã mới** (MF-1 cấp quyền · MF-4 ngân sách · MF-5 ghost seat). Code/README BE có thể còn mã cũ —
   đối chiếu theo nội dung.
5. **Kiểm tra nhanh** (chat code, mỗi task/checkpoint): `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`,
   `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` (không drift), cộng unit/http/integration **theo file**
   đã đổi. **Không** chạy `pnpm check` hay full suite; báo cáo ghi rõ "`pnpm check` và test toàn bộ CHƯA chạy".
   Chat review chạy test theo file của đợt khi review; full suite chỉ khi Owner yêu cầu.
6. Không tắt test, nới gate hay sửa fixture chỉ để xanh. Đổi nghiệp vụ ⟹ hỏi Owner (ghi `QUESTIONS.md`), không tự suy.
7. Git: chat code commit cục bộ trên nhánh làm việc **sau mỗi đợt tự kiểm xanh** (một commit/đợt, message nêu đợt và
   finding); **không** push, merge, deploy, không đụng `dev`/`main`. Owner push/merge. Chat review không commit code
   (chỉ được commit file trong thư mục này và spec/plan nếu Owner cho phép).
8. Migration là task riêng đi trước code phụ thuộc; dữ liệu seed/demo cập nhật cùng đợt nếu bị ảnh hưởng.

## 5. Các đợt (chat review điền thứ tự và hạng mục sau W0)

| Đợt | Nội dung dự kiến | Hạng mục (`items/`) | Trạng thái |
| --- | --- | --- | --- |
| W0 | Audit lệch MF-1/4/5 + luồng hỗ trợ so với `QĐ-103` → `QĐ-108` | — | chưa làm |
| W1 | Schema/migration dùng chung (enabler) | | chưa làm |
| W2 | MF-4: B1 → B7, trần, dự phòng kho, phiên bản khóa năm, đóng năm | | chưa làm |
| W3 | MF-1 lõi: Request, GH, một bước, số tiền tính lại lúc duyệt, kiểm tra ngân sách, duyệt chi, cam kết, Request tiếp tục ≤ 12 tháng, `SBF-15` | | chưa làm |
| W4 | MF-1 cấp quyền: kho dùng chung trước khi mua, `K4` giá mua, `K1`, quyền theo vai, `SBF-17`, `SBF-19`, *tránh được*, cam kết 01/01 | | chưa làm |
| W5 | `SBF-20` thuê bao: kỳ cam kết, điểm điều chỉnh, số seat cần, cảnh báo đỏ, sự cố gia hạn, nhắc kỳ, `KPI-4`; `SBF-11` chi phí theo seat | | chưa làm |
| W6 | MF-5: `SBF-04a`, `SBF-04` (8 cổng, > 1 tháng, tạm dừng/`G2`), quyết định trưởng phòng (tự quyết), `SBF-18`, `SBF-03` | | chưa làm |
| W7 | **Seed/demo theo chuẩn MF-1/4/5 mới** (`ops:seed`, fixture demo): dữ liệu đủ chạy từng bước, đúng luật QĐ-103 → QĐ-108 | | chưa làm |
| W8 | **API bổ sung do Owner yêu cầu**: xem lịch sử Request theo vai (người yêu cầu, trưởng phòng, Người duyệt chi, IT Admin, Finance, Super Admin — trong phạm vi quyền `SoD`); API docs cho FE; hồi quy MF-2/MF-3 không vỡ | | chưa làm |

Trạng thái: `chưa làm` · `đang thiết kế` · `ready` · `đang code` · `chờ review` · `CHANGES` · `PASS`.

## 6. Nhật ký bàn giao

| Thời điểm | Chat | Đợt | Đã làm | Commit / diff | Việc tiếp theo cho chat kia |
| --- | --- | --- | --- | --- | --- |
| 08/11/2026 | Owner | — | Tạo tracker | — | Review: chạy W0 |

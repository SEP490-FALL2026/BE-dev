# Bàn giao chat điều phối (Opus) — 13/11/2026

> File này dành cho chat điều phối **mới**, để làm tiếp từ chat cũ (chat cũ đã bị nén ngữ cảnh nhiều lần). Đọc hết file trước khi
> làm gì. Mọi nguồn thật nằm trong các file được dẫn; file này chỉ là bản đồ và trạng thái.

## 1. Luật làm việc của Owner (bắt buộc)

- **Luôn trả lời tiếng Việt.** Giữ tiếng Anh cho tên file, đường dẫn, code, lệnh.
- **Skill Preflight** mỗi lượt: chọn process skill + domain/review skill + verification skill, đọc `SKILL.md`, liệt kê skill đã dùng ở
  đầu báo cáo (`D:\FPT\FALL2026\CLAUDE.md`).
- Quyết định nghiệp vụ chưa có nguồn: **hỏi Owner từng điểm, có phương án + khuyến nghị**. Owner thích tự chọn phương án.
- **Repo BE:** không commit, không push, không chạy full test local (chỉ quick check: typecheck/lint/arch/rules/gates/openapi + test
  file liên quan). Owner tự commit.
- **Repo Docs:** việc xong thì tự commit vào `main`; **không push** trừ khi Owner bảo. Chỉ sửa Docs khi Owner nói "đồng bộ".
- **Đợt này không làm** Use Case, FDD, ERD, State Machine, Context (để sau).
- Quy trình code: **một chat Sonnet** làm tuần tự từng task → quick test → cuối cùng full test + seed → chat Opus review.
- Không lộ email/thông tin cá nhân của Owner ra dịch vụ ngoài.

## 2. Đường dẫn

| Thứ                 | Nơi                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Repo BE             | `D:\FPT\FALL2026\Code\BE-dev-software-license-management`, nhánh `feat/mf2-mf3` (HEAD `b71ed330`)  |
| Repo Docs           | `D:\FPT\FALL2026\Docs`, `main @ 373bb6b` (đã commit, **chưa push**)                                |
| Tài liệu API cho FE | `D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\`                                                |
| Memory dự án        | `C:\Users\Asus\.claude\projects\d--FPT-FALL2026\memory\` (đọc `project_fe_feedback_2026_11_11.md`) |

Thư mục kế hoạch trong repo BE (tất cả **chưa commit**, Owner sẽ commit):

| Thư mục `docs/reviews/…`  | Nội dung chính                                                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `be-bugfix-2026-11-12/`   | `SPEC.md` v1.2, `PLAN.md`, `HANDOFF-CODE.md` — sửa bug B1–B5, B7 + gỡ Business Owner                                                                                                                                                                                       |
| `mf2-mf3-2026-11-10/`     | `SPEC.md` v2.3 (S1–S17), `PLAN.md` v2.3, `QD-110-DRAFT.md` (QĐ-110a…v), `HANDOFF-CODE.md`                                                                                                                                                                                  |
| `fe-feedback-2026-11-11/` | `SPEC.md`/`PLAN.md` v2.1, `QD-111-DRAFT.md` (QĐ-111a…bi, R-1…R-23), `DECISIONS.md`, `SYNC-BRIEF.md`, `OWNER-REVIEW.md`, `POLICY-SEED-DRAFT.md`, `SONNET-PROMPTS.md`, research `R8`…`R15`, audit `AUDIT-DOCS-A/B/C.md`, review `REVIEW-SPEC-ARCH/BIZ.md`, `HANDOFF-CODE.md` |

## 3. Đã xong

1. Toàn bộ câu hỏi nghiệp vụ MF-2/MF-3, feedback FE IT Admin, ngân sách/thanh toán/gia hạn đã có QĐ (`QĐ-110`, `QĐ-111`).
2. **Docs đồng bộ và commit `373bb6b`:** sổ QĐ, BRD 4.12, Scope 2.10, QT "Quy trình và chính sách theo main flow" 1.9,
   `rules/domain-guardrails.md`, US 0.16, sơ đồ MF-1…MF-5 + SBF (bỏ SBF-07, catalog 22 SBF, MF-4 gọi SBF-11). Ba audit độc lập, 18
   Major đã sửa; mọi check (build_us, check-refs, check_links, flowkit, build_index) đạt.
3. **Ba SPEC/PLAN** đã qua review kiến trúc + nghiệp vụ (5 Blocker đã sửa), cùng ghim Docs `373bb6b`.
4. **Prompt cho Sonnet:** `fe-feedback-2026-11-11/SONNET-PROMPTS.md` — 4 prompt tuần tự: sửa bug → MF-2/MF-3 → feedback FE → pha
   cuối (full test, API thật, seed, viết `HANDOFF-REVIEW.md`).
5. Đã giải thích cho Owner: SPEC bug làm gì, MF-2/MF-3 chạy thế nào (xem `mf2-mf3-2026-11-10/SPEC.md` §1).

## 4. Đang chờ Owner — việc đầu tiên của chat mới

> **12/11: Owner trả lời "giữ A hết"** — đã ghi vào `OWNER-REVIEW.md` và `POLICY-SEED-DRAFT.md`, không đổi QĐ-draft/SPEC/PLAN. Còn treo: CS-3 (Docs, chờ "đồng bộ"); Owner commit `docs/reviews/**` rồi mở chat Sonnet.

Owner đang duyệt **`OWNER-REVIEW.md`** (điểm điều phối tự chốt khi Owner ngủ) và **`POLICY-SEED-DRAFT.md`** (8 chính sách khởi tạo).
Chat cũ đã trình bày cho Owner bảng phương án dưới đây (A = đang chọn). Owner sẽ trả lời kiểu `R-37 B, CS-4 B`; mục không nhắc = giữ A.

**Khi nhận câu trả lời, chat mới làm:**

1. Ghi kết quả vào cột _Owner_ của `OWNER-REVIEW.md` (✔ hoặc "Đổi → B …"); ghi mục E đã duyệt chính sách (hoặc điểm đổi).
2. Với mỗi mục **đổi**: sửa `QD-111-DRAFT.md`/`QD-110-DRAFT.md`, SPEC/PLAN liên quan (tìm theo mã R-xx/B-x/S-x/C-x bằng Grep), và
   `POLICY-SEED-DRAFT.md` nếu là CS-x. Nếu chạm Docs đã commit thì **hỏi Owner "đồng bộ" chưa** rồi mới sửa Docs + commit `main`.
3. CS-3 (A): sửa câu "mỗi chính sách gắn một bước quyết định" ở `FR-8.12`/QT A.7/R-42 thành "bộ chính sách gắn các bước có
   checklist" — việc Docs, cần lệnh "đồng bộ".
4. Chạy `pnpm rules:check` (repo BE) sau khi sửa file `docs/reviews/**`.
5. Nhắc Owner commit `docs/reviews/**` trên `feat/mf2-mf3`, rồi mở chat Sonnet dán prompt 1.

### 4.1 Bảng phương án `OWNER-REVIEW.md` (⚠ = ảnh hưởng nghiệp vụ nhiều)

**Request và cấp phát**

| #      | Câu hỏi                                | A — đang chọn                                                              | Phương án khác                                       |
| ------ | -------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| R-24   | Request bị _Trả về_ đi đâu             | Về người yêu cầu bổ sung rồi gửi lại; ghost seat không có _Trả về_         | B về người duyệt bước trước · C bỏ _Trả về_          |
| R-25   | Case B trùng mục đã có khi IT tạo      | Gắn vào mục đã có, đi tiếp như case A                                      | B từ chối, người xin gửi lại                         |
| R-27   | Có Request tiếp tục mà vẫn nhắc 7 ngày | Nhắc theo ngày hết hiện tại; duyệt tiếp tục thì dời ngày + lịch nhắc       | B có Request tiếp tục đang chờ thì ngừng nhắc        |
| ⚠ R-38 | _Thời gian dùng_ vượt hợp đồng         | Tự cắt tại ngày hết hợp đồng                                               | B chặn khi gửi · C cho vượt, cảnh báo                |
| R-39   | Cắt lẻ tháng (10/11 → 31/01)           | Tháng đã bắt đầu tính 1 tháng → 3                                          | B theo ngày (≈2,7) · C làm tròn xuống (2)            |
| ⚠ R-43 | Case B ở phòng chưa có trưởng phòng    | Đứng chờ; chỉ cấp thẳng phần mềm nội bộ miễn phí đã có trong danh mục      | B IT đánh giá trước, "nội bộ miễn phí" thì cấp thẳng |
| ⚠ R-46 | "Phần năm sau" của _Dùng lâu dài_      | Lưu 12 × giá lúc duyệt (cảnh báo mềm); 01/01 cam kết theo giá hiện hành    | B không lưu · C 01/01 dùng luôn số đã lưu            |
| R-50   | Nhãn hóa đơn kỳ sau của _Dùng lâu dài_ | "Kỳ k"                                                                     | B theo tháng dịch vụ (T03/2027)                      |
| ⚠ S-3  | Ai xem ngân sách năm sau còn lại       | Chỉ Người duyệt chi + Finance; người gửi/TP thấy "Từ 01/01: X đ (dự kiến)" | B TP thấy phòng mình · C ai cũng thấy                |
| B-5    | Mô hình giá                            | Suy từ kiểu cấp (K1/K2 seat, K4 một lần, K5 miễn phí)                      | B IT chọn từng gói                                   |
| R-53   | Luật ≥2 admin cho K4 nào               | K4 có tick _có trang quản trị_                                             | B mọi K4 · C không áp K4                             |
| S-4    | Cấp K1 có báo tăng seat                | Không, chỉ K2/K4                                                           | B báo cả K1                                          |

**Nghỉ việc / chuyển phòng**

| #      | Câu hỏi                                  | A — đang chọn                                                 | Phương án khác                                   |
| ------ | ---------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| R-26   | IT Admin nghỉ chưa chuyển thuê bao       | Hàng việc IT chung, không chặn đóng hồ sơ                     | B tự giao IT khác · C chặn đóng hồ sơ            |
| R-32   | Quay lại đúng ngày: căn cứ               | Điền sẵn căn cứ đợt nghỉ dài, sửa được                        | B bắt nhập mới · C bỏ bắt buộc                   |
| R-35   | Checklist K1 khi người vẫn làm việc      | Chỉ tắt gia hạn + bằng chứng                                  | B checklist đầy đủ như nghỉ việc (không khả thi) |
| ⚠ R-41 | Hủy nghỉ việc sau _đã nghỉ việc_         | Không cho; đi luồng quay lại làm                              | B cho hủy trong N ngày                           |
| R-49   | Ân hạn, xin lại đúng thuê bao đang giữ   | Quyền cũ kết thúc ngay lúc cấp, không tác vụ thu hồi quyền đó | B thu hồi rồi cấp lại · C sửa dòng cũ (DB cấm)   |
| R-51   | Hóa đơn K1 sau ngày chuyển phòng         | Phòng mới                                                     | B phòng cũ                                       |
| B-1    | Khóa hẳn hộp thư (không có K1) ghi ở đâu | Mục khóa tài khoản công ty của BM-08                          | B tác vụ riêng                                   |

**Ngân sách**

| #      | Câu hỏi                                | A — đang chọn                                                                                | Phương án khác                              |
| ------ | -------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------- |
| ⚠ R-37 | Công thức dự kiến cuối năm             | Thực chi + (cam kết + chờ duyệt) × (1 + hệ số) + tăng giá (vd 60 + 30 × 1,05 = 91,5)         | B nhân cả thực chi (94,5) · C bỏ hệ số (90) |
| ⚠ R-40 | Sàn khi _Trả lại_/_Chuyển_             | Sàn = dự kiến cuối năm; đổi Cost Center miễn                                                 | B sàn = thực chi + cam kết                  |
| R-52   | Tăng giá đã biết có trừ giảm giá       | Chỉ cộng tăng                                                                                | B tính cả giảm                              |
| R-28   | Cảnh báo 80/100 %                      | Báo mỗi lần vượt; vượt lại sau điều chỉnh thì báo lại                                        | B mỗi ngưỡng 1 lần/năm · C nhắc hằng tuần   |
| R-33   | CC mới chỉ có _Chuyển_                 | Có ngân sách (phiên bản + điều chỉnh đã duyệt)                                               | B bắt lập phiên bản riêng                   |
| R-48   | CC chưa có phiên bản nhận điều chỉnh   | Tự tạo bản ghi ngân sách (cơ sở = điều chỉnh, dự phòng 0)                                    | B chặn                                      |
| R-36   | Lãnh đạo lấy bớt tiền                  | _Giảm Trần năm_ trong phần chưa chia, Người duyệt chi duyệt; thiếu thì phòng _Trả lại_ trước | B sửa thẳng Trần · C cấm giảm sau khóa kỳ   |
| C-1    | _Giảm Trần năm_ ở đâu                  | Loại điều chỉnh thứ 4                                                                        | B thao tác riêng                            |
| B-4    | Nhắc thiếu ngân sách năm sau           | 01/12 rồi mỗi Thứ Hai                                                                        | B hằng ngày từ 15/12 · C một lần            |
| B-7    | Nhắc giải trình quý quá hạn            | Ngày hạn rồi mỗi Thứ Hai                                                                     | B mỗi ngày làm việc                         |
| R-47   | Ngày chốt / hạn giải trình là tham số? | Cố định                                                                                      | B màn cấu hình                              |
| ⚠ B-2  | Seat-tháng K2 (`SM-1`) làm đợt này     | Có, trước `RV-1`                                                                             | B để sau                                    |

**Hóa đơn / chính sách / kỹ thuật**

| #          | Câu hỏi                              | A — đang chọn                                       | Phương án khác                        |
| ---------- | ------------------------------------ | --------------------------------------------------- | ------------------------------------- |
| R-29       | Hóa đơn lệch nghi TK ngoài quy trình | Finance đóng kèm lý do, chuyển SBF-08               | B giữ mở                              |
| R-30 + C-2 | Mốc "chưa có hóa đơn"                | 5 ngày làm việc sau ngày thanh toán, cố định        | B cuối tháng · C tham số              |
| ⚠ R-44     | Gói USD: khi nào mở hồ sơ lệch       | Lệch số lượng / đơn giá USD; chênh VND vào thực chi | B dung sai ±5 % VND · C mọi chênh VND |
| R-45       | Chi ngoài quy trình không chứng từ   | Chỉ ghi khi có chứng từ                             | B nhập số ước tính                    |
| R-34       | Bản chính sách mới bắt xác nhận lại  | Ô tick, mặc định bật                                | B luôn bắt · C chỉ bản đầu            |
| R-42       | Super Admin tạo chính sách mới       | Không, bộ 8 cố định                                 | B được tạo loại chỉ đọc               |
| R-31       | MF-4 gọi SBF-11                      | ✔ Owner đã chọn                                     | —                                     |
| B-3 = S-2  | Module `policies` tầng T3            | Đồng ý                                              | B nhét module có sẵn                  |
| B-6        | Route cũ BM-10/quý/Trần phòng        | Xóa + changelog                                     | B trả 410 một thời gian               |
| C-3        | Vẽ nhánh _Trả về_ MF-1/SBF-15        | Không vẽ                                            | B vẽ                                  |
| C-4        | Chữ "sao kê" sót, tên US-13-04       | Sửa                                                 | B giữ                                 |
| S-1        | Bỏ tỷ giá nhưng DB đòi snapshot      | Tỷ giá 1 cho VND, ghi bổ sung ADR-0007              | B nới ràng buộc DB                    |
| S-5        | Gates + rules:check cuối mỗi gói     | Có                                                  | B chỉ pha cuối                        |

### 4.2 Bảng phương án chính sách (`POLICY-SEED-DRAFT.md` — mục "Điểm Owner cần xem")

| #      | Câu hỏi                          | A — đang chọn                                                   | Phương án khác                             |
| ------ | -------------------------------- | --------------------------------------------------------------- | ------------------------------------------ |
| CS-1   | Mã/cách chia 8 chính sách        | `POL-GEN`, `POL-MF1`…`MF5`, `POL-USAGE`, `POL-SAAS`             | B `POL-01`…`08` / theo chủ đề              |
| CS-2   | Checklist 1.3 ở đâu              | `POL-SAAS`                                                      | B `POL-MF1`                                |
| CS-3   | GEN/MF2/MF3 không có checklist   | Sửa câu Docs thành "bộ chính sách gắn các bước có checklist"    | B viết thêm checklist thu hồi MF-2/MF-3    |
| ⚠ CS-4 | K1 "chỉ" hay "ưu tiên" gói tháng | Chỉ gói tháng, ≤ 9 tháng                                        | B cho gói năm K1 có lý do (sửa QĐ-103d)    |
| ⚠ CS-5 | Mục _(đề xuất)_ chưa có QĐ       | Giữ trong văn bản, hệ thống không ép                            | B bỏ · C ra QĐ thành luật                  |
| CS-6   | Căn cứ ban hành bản 1            | Demo QĐ giả định 01/2026/QĐ-GĐ; cài thật ghi "Bộ mẫu v1.9"      | B để trống (không nên — checklist bị khóa) |
| CS-7   | Vai phải xác nhận                | GEN gồm Người duyệt chi; Super Admin không xác nhận             | B Super Admin xác nhận GEN                 |
| CS-8   | Câu ✅ mà code chưa kiểm         | Lúc seed đối chiếu, không có guard thì đổi thành câu người tick | B giữ ✅ và viết thêm guard                |

## 5. Sau khi Owner duyệt — các bước tiếp

1. Owner commit `docs/reviews/**` trên `feat/mf2-mf3` (chat không commit repo BE).
2. Owner mở chat Sonnet, dán lần lượt prompt 1 → 4 trong `SONNET-PROMPTS.md`; mỗi prompt xong Sonnet dừng chờ prompt sau.
3. Khi Sonnet xong prompt 4 (có `HANDOFF-REVIEW.md`): chat Opus review/verify theo ba SPEC, đọc kỹ SQL/migration/authz/test đổi,
   kiểm số liệu §8 SPEC FE; báo Owner. Không push/merge.
4. Việc để sau: Use Case, FDD, ERD (Conceptual/Logical), State Machine, Context cho QĐ-110/111; vài link chết tới SBF-07 trong Use Case.

## 6. Bối cảnh nghiệp vụ tóm tắt (để hiểu nhanh)

- Kiểu cấp: `K1` gói cá nhân tháng trên email công ty (≤ 9 tháng/lần, checklist cấp/thu hồi); `K2` seat trong kho dùng chung có trang
  quản trị; `K4` khóa vĩnh viễn; `K5` phần mềm nội bộ miễn phí.
- MF-1 Request: case A (gói đã có) / case B (mới, TP → IT đánh giá → ngân sách → Người duyệt chi); _Thời gian dùng_ theo tháng;
  thanh toán: IT mua bằng Thẻ công ty hoặc IT ứng tiền trước, nộp hóa đơn 5 ngày, Finance ký xác nhận xuất tiền.
- MF-2 nghỉ việc / MF-3 chuyển phòng: xem `mf2-mf3-2026-11-10/SPEC.md` §1 (ân hạn 5 ngày làm việc, giải phóng cam kết đúng một lần,
  R-49, tự đóng hồ sơ).
- MF-4 ngân sách năm: Trần năm, BM-10, số cơ sở + dự phòng 10 %, bất biến cả năm; SBF-11: chốt tháng, rà soát quý, điều chỉnh 4 loại;
  bỏ quý/Trần phòng/bảng tỷ giá; qua năm cam kết 01/01.
- Chính sách: thư viện 8 chính sách có phiên bản, xác nhận đã đọc, 7 checklist Có/Không gắn bước duyệt.

## 7. Việc đang chạy dở: đối chiếu bộ chính sách với nguồn thực tế (13/11)

**Lý do:** Owner hỏi 8 chính sách và 46 câu checklist trong `POLICY-SEED-DRAFT.md` có theo chuẩn doanh nghiệp/hệ thống thật không, hay do
AI nghĩ ra. Câu trả lời trung thực đã báo Owner: khung thư viện chính sách có nguồn (R10: Vanta, Drata, Secureframe, Entra, ServiceNow,
ISO 27001 5.1/7.5 qua bản tóm tắt); quy định phần lớn từ QĐ dự án; con số là luật nội bộ; **46 câu checklist do AI soạn**, chưa đối
chiếu. Owner đồng ý chạy bước đối chiếu để sau này giải thích được.

**Đã chạy** (skill `anthropic-skills:deep-research`, chat cũ là điều phối): 3 agent research song song, mỗi agent ghi một file notes vào
`D:/FPT/FALL2026/research_notes/Đối chiếu chính sách SaaS Sentry/`:

| File notes                          | Phạm vi                                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access_procurement_checklists.md`  | Checklist `1.2`, `1.6`, `1.7` (`POL-MF1`) và `1.3` (`POL-SAAS`) — ISO 27001, NIST 800-53, CIS, SOC 2, ServiceNow/Zluri/Torii, checklist đánh giá SaaS |
| `budget_usage_reclaim.md`           | `POL-MF4` (`4.7`), `POL-MF5` (`5.4`), `POL-USAGE` (`5.3`) + các con số (30/60/90, 14 ngày, 10 %, 80/100 %…) — FinOps, SAM, COSO, luật giám sát        |
| `general_offboarding_purchasing.md` | `POL-GEN`, `POL-MF2`, `POL-MF3`, `POL-SAAS` quy định 5–14, cơ chế thư viện — NIST PS-4/PS-5, ISO A.5.11/A.6.5, SANS, Google/M365, luật VN             |

Mỗi mục được gắn nhãn: **Khớp chuẩn** / **Tương tự thực tế** / **Nội bộ** / **Nên sửa**, kèm trích dẫn + URL.

**Cập nhật 13/11:** cả 3 file notes đã xong; chat cũ **đã viết xong báo cáo** (bước 2 dưới đây; 137 mục: 33 khớp chuẩn, 56 tương tự thực tế, 48 nội bộ, 20 nên sửa) vào `D:/FPT/FALL2026/reports/Đối chiếu chính sách SaaS Sentry.md`. Chat mới **không** chạy lại bước 1–2: đọc báo cáo (mục "Đề xuất sửa") rồi làm từ bước 3.

**Chat mới làm tiếp:**

1. Kiểm cả 3 file notes đã có và trọn vẹn (agent của chat cũ có thể còn đang chạy — nếu thiếu file thì chờ hoặc hỏi Owner; nếu chat cũ
   đã đóng và file vẫn thiếu thì chạy lại riêng agent đó với phạm vi ở bảng trên).
2. Gọi một agent viết báo cáo (theo bước 6 của skill `anthropic-skills:deep-research`): đọc 3 notes, ghi
   `D:/FPT/FALL2026/reports/Đối chiếu chính sách SaaS Sentry.md` — bảng từng câu/quy định → nhãn → nguồn; danh sách "Nên sửa" kèm câu
   chữ đề xuất; danh sách mục thực tế có mà mình thiếu (chỉ đề xuất cái đáng thêm, Owner ghét làm phức tạp); kiểm số hiệu luật/nghị
   định VN trong bản nháp.
3. Báo Owner ngắn gọn (tiếng Việt): bao nhiêu mục có nguồn, bao nhiêu nội bộ, mục nào nên sửa — **hỏi Owner từng điểm sửa kèm phương án**,
   không tự sửa `POLICY-SEED-DRAFT.md` trước khi Owner duyệt.
4. Owner duyệt xong: sửa `POLICY-SEED-DRAFT.md`, thêm cột **Nguồn** cho từng câu checklist/quy định; chép báo cáo vào thư mục này thành
   `R16-POLICY-SOURCES.md`; chạy `pnpm rules:check`.
5. Đề xuất đã báo Owner: khi Owner nói "đồng bộ", chuyển bộ chính sách sang Docs thành file chính thức (vd.
   `Docs/Requiments/Bộ chính sách khởi tạo.md`, có cột nguồn) và commit `main`. Phân vai: _Quy trình và chính sách theo main flow.md_ =
   nguồn nghiệp vụ (bước, vai, hạn); _Bộ chính sách khởi tạo_ = văn bản 8 chính sách + checklist hệ thống nạp; bản trong repo BE chỉ
   để Sonnet seed (`PL-1.5`).

**Không chặn gói sửa bug:** SPEC sửa bug (`be-bugfix-2026-11-12`) không đụng chính sách; chỉ dựa trên S-5 và R-26 trong
`OWNER-REVIEW.md`. Owner có thể cho Sonnet chạy prompt 1 song song. Gói `PL-1`/`PL-2` (prompt 3) mới cần chính sách đã duyệt.

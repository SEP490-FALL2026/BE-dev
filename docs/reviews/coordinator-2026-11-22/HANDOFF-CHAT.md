# HANDOFF — chat điều phối 20–22/11/2026 → chat điều phối mới

> Đọc file này trước. Sau đó: memory `MEMORY.md` (đặc biệt `project_redesign_2026_11_21.md`, `feedback_model_roles.md`, `feedback_verify_before_approval.md` và mọi `feedback_*`), `DECISIONS.md` cùng thư mục (sổ quyết định phiên, lịch sử từng câu Owner trả lời).
> Handoff trước: `Code/BE-dev-software-license-management/docs/reviews/coordinator-2026-11-20/HANDOFF-CHAT.md` (untracked). `NOTE MD/QD-cho-duyet-truoc-prompt4.md` đã giải quyết hết (QĐ-114/115) — Owner có thể đã xóa.

## 0. Bối cảnh

- **Chỉ làm đồ án SEP**: BE `D:\FPT\FALL2026\Code\BE-dev-software-license-management` (origin `SEP490-FALL2026/BE-dev`), Docs `D:\FPT\FALL2026\Docs`. WDP đã xong. **FE web + Mobile không phải việc của mình**: khi BE xong, mình bàn giao **API description** (flows, tài liệu theo màn × kiểu cấp) trong `Docs/Figma UI-UX/API-Integration/` cho đội FE/Mobile tự nối và lên demo. Lỗi FE chỉ ghi danh sách.
- 21/11: giảng viên (WDP) phản hồi nghiệp vụ "rất nát" ⟹ **đợt thiết kế lại** (hạn 2–3 tuần, Owner chọn mức "thiết kế lại đúng chuẩn"): kho/gói/thuê bao/workspace, license key + máy, Request nhiều gói, AI có tác dụng trong duyệt, tách API, nâng/giảm seat, mã tài sản/vòng đời máy.

## 1. Trạng thái đã kiểm (git, 22/11 ~11:00)

| Repo                | Trạng thái                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BE SEP              | `origin/dev` `0216cb76` (5 nhánh 20/11 đã merge: PR #63–#66, #69), `origin/main` `00a1f2bd`. Checkout máy: `dev`. **Chưa có dòng code nào của đợt thiết kế lại.** |
| Docs `main`         | `8a50d41`, **chưa push 4 commit** (Owner tự push: `git -C D:\FPT\FALL2026\Docs push origin main`). Có thư mục rác `콈�ƥ` (không phải của mình)                    |
| NOTE MD (ngoài git) | `mainflows.md` (đang cập nhật — mục 2), `giai-thich-kho-gia-han-chi-phi-ngan-sach.md` (đang viết — mục 2), bản sao `mainflows.bak-2026-11-18.md`                  |

## 2. Đã làm 21–22/11

| Việc                                                                                                                                                                                                                        | Kết quả                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Research Fable W1–W5 + W1b/W2b/W4b, verify Fable V1/V2/V3/V5/V6, bản luật cuối W1c (KHO-01…28), W2c (MAY-_, KHOA-_), W4c (AI), V5 (tách API theo SOLID), O1 (Config/Audit Super Admin), O2 (mail + Redis), O3 (transaction) | `Docs/Research-AI/redesign-2026-11-21/`                                                                                                                                                                                                                                                                                                                |
| Duyệt hàng QĐ cũ (Fable phân loại OLD-QD-A/B)                                                                                                                                                                               | ghi **QĐ-114a…ar**                                                                                                                                                                                                                                                                                                                                     |
| Duyệt đợt thiết kế lại                                                                                                                                                                                                      | ghi **QĐ-115a…au**                                                                                                                                                                                                                                                                                                                                     |
| Deep audit tài liệu (Fable AUDIT-A tiền/kho/ngân sách, AUDIT-B request/duyệt/AI/quyền, AUDIT-C nhân sự/máy/khóa/luồng phụ — 98 phát hiện) + Owner trả lời                                                                   | ghi **QĐ-116a…bg** (59 mã)                                                                                                                                                                                                                                                                                                                             |
| BRD                                                                                                                                                                                                                         | **4.16**                                                                                                                                                                                                                                                                                                                                               |
| Tài liệu dẫn xuất                                                                                                                                                                                                           | Định nghĩa phạm vi **2.12**, Quy trình **1.12**, Bộ chính sách khởi tạo **1.1** (`Docs/Decisions/` — **Owner phải duyệt câu chữ trước khi seed**, `QĐ-112b`), User Stories **0.18** (≈197 Story), Use Case **8.1** (56 UC/77 assoc), Context **v8.0**, FDD **v8.0** (đánh số lại liền mạch + `fdd-code-map-v8.json`), MF-1…5 + L0, SBF-*, catalog 3.11 |
| Checker cuối (`docs-sync-check`)                                                                                                                                                                                            | flowkit 32/0, links 0 gãy, US parity OK + check-refs 0, uc_check 123/0, build_index ok, check-rules 0. **ERD vẫn FAIL** (có từ trước — Owner loại ERD/State Machine khỏi đợt này)                                                                                                                                                                      |

**Đã xong 22/11 (agent Opus):** (a) cập nhật `NOTE MD/mainflows.md` lên QĐ-116/BRD 4.16; (b) viết `NOTE MD/giai-thich-kho-gia-han-chi-phi-ngan-sach.md` (giải thích kỹ kho, gia hạn, tính tiền phòng ban, tối ưu chi phí, MF-5 IT đề xuất → trưởng phòng quyết, ngân sách; ví dụ số; câu hội đồng hay hỏi). Nếu chat mới không nhận được thông báo của hai agent này: kiểm hai file; chưa xong thì giao lại (Opus) theo đúng mô tả trên.

## 3. Việc còn lại (theo thứ tự Owner chốt)

1. Hai file NOTE MD ở mục 2 **đã xong** (22/11 ~12:00): `mainflows.md` 2098 → 2537 dòng, đồng bộ `QĐ-116bg`/BRD 4.16/Quy trình 1.12 — cần rà (Opus): phần SBF A/B và C/E/F do subagent viết chưa rà từng dòng; ví dụ ngân sách 2027 ở MF-4 lệch Quy trình 4.12 (176 vs 168, hệ số chênh 10 % vs 5 %); **9 điểm nguồn chưa rõ ở mục 5.4 (M1–M9)** (quyền theo vai khi kho hết, tỷ giá `QĐ-111an` vs `QĐ-116ak`, chữ _tiềm năng_ `QĐ-116as`, KPI-5 với ca G2 thay thế…) — gộp với 5 điểm bên dưới để Fable kiểm rồi hỏi Owner. Nhắc Owner duyệt _Bộ chính sách khởi tạo_ 1.1. File giải thích đã xong (683 dòng); mục 9 của nó nêu **luật còn mơ hồ — cho Fable kiểm rồi hỏi Owner trước khi viết spec đợt kho/ngân sách**: (1) công thức _tiết kiệm tiềm năng_ — `QĐ-116as` "số tháng tới ngày sớm nhất giảm được" vs ví dụ `FR-4.14` ngầm 12 tháng; (2) _tiết kiệm thực_ so với mốc nào khi kỳ cũ có lần nâng giữa kỳ (6 tr hay 1,33 tr); (3) `QĐ-116ah` với Request _Dùng lâu dài_ duyệt tháng 12, cấp tháng 1: phần năm sau tính thế nào; (4) "số tháng còn lại của năm" trong chi phí đang chạy không cam kết có tính tháng đang chạy không; license `K4` dư ghi một lần ở tháng hóa đơn hay rải theo tháng; phiếu nhiều mục kiểm theo thứ tự thì mục trước có trừ vào _còn lại_ khi kiểm mục sau không; (5) việc tài liệu: chữ cũ "ba dòng con" còn ở `MF-4.md`, `MF-5.md` §5.2, bảng Căn cứ `SBF-11.md`, `SBF-20.md` (phải là bốn — `QĐ-116aj`/`QĐ-116bf`) — sửa qua spec JSON + flowkit.
2. **Spec/plan để implement** (Opus viết, Sonnet code, Opus review, CI GitHub) — theo đợt, mỗi đợt tự đứng được:
   1. Sửa lỗi ưu tiên cao: thu hồi nghỉ việc H-6 (`offboarding.policy.ts:336,358`, `QĐ-114aj`); 6 lỗi transaction mức Trung bình (O3 M1–M6) + thứ tự khóa chuẩn; các chỗ code đang trái luật đã chốt (khoản 01/01 giá lúc duyệt `QĐ-114w`; ghi kết quả gia hạn chỉ IT phụ trách `QĐ-114af`; đẩy sớm chỉ IT phụ trách; `PATCH purchasedQuantity` chặn giảm + bắt lý do; giờ UTC trong mail; lô duyệt chi `RETRYABLE`; `QĐ-114r` mở rộng…).
   2. Sổ máy + mã tài sản + vòng đời + việc thu máy + khóa theo máy (W2c) — độc lập, làm sớm được.
   3. Kho **B1** (từ vựng, giá seat-tháng, dòng kho seat-ngày 4 dòng con, tự giải phóng cam kết cuối tháng) → **B2** Workspace thuộc nhà cung cấp → **B3** thuê bao nhiều dòng + sổ số seat + K1 không thuê bao (gồm K1 năm) + K4 lô khóa + hợp đồng tùy chọn (cảnh báo `addSeat` còn phục vụ K1 — tách K1 trước).
   4. Phiếu nhiều mục (B-gọn, "mục", checklist theo lần quyết các mục được chọn, trần 6 mục).
   5. AI bản đầy đủ W4c (phân tích hàng đợi + đối chiếu chính sách + xác nhận lần hai + thẻ đánh giá + phân tích phiếu; F4 đọc hóa đơn PDF ở AI service; F5 phiếu đối chiếu; eval 90 ca + ablation) + **Redis/BullMQ qua outbox relay** (cần **ADR mới bên BE** thay ADR-0012/0018) + rate-limit Redis.
   6. Tách API theo V5 (6 operation PHẢI TÁCH + điểm điều chỉnh theo dòng; route cũ `deprecated`; `expectedUpdatedAt` bắt buộc ở route mới) + Config/Audit Super Admin (O1) + tải chính sách Markdown/HTML + các mục còn lại của QĐ-114/116.
   7. **Code nốt luồng phụ** — danh sách 42 mục + cỡ S/M/L ở `AUDIT-C-…md` mục 5 (SBF-10 toàn bộ, SBF-08 cửa nhập tay + ô số tài khoản ở hãng + lọc phòng, Request tiếp tục nhóm, import hồ sơ đã nghỉ việc lịch sử, `documentIds` bằng chứng thu hồi…).
3. **Seed**: lịch sử 12–18 tháng ghi thẳng DB (lệnh riêng, chỉ môi trường demo + `--confirm-reset`, kiểm bất biến sau seed) + trạng thái đang chạy qua nghiệp vụ (`QĐ-115as`).
4. **Prompt 4** (đã gộp phần còn lại của Prompt 6): 4a rà nghiệp vụ trên tài liệu + audit code toàn bộ; 4b FIX + DEMO + CI đủ bộ.
5. **API description** cho FE/Mobile (đổi tên/route mới, flows theo màn × kiểu cấp; tên mới _Chi phí seat/khóa Trống_ chưa áp ở `Figma UI-UX/API-Integration/`).
6. Còn sót nhỏ để Prompt 4a bắt: `US-15-05`, `US-04-03`, `US-04-14`, `US-12-19/20` giữ tiêu đề cũ (để không gãy neo UC); `US-04-02` còn chữ `per_seat`; UC96 tải chính sách chưa có Story riêng; MF-1 nguồn `QĐ-103c` còn "GH-2 tối đa 3"; nhiều AC mới chưa có dòng TS; 7 mục G-* của OLD-QD-B chưa mở lại code.

## 3a. Điểm còn mở cần QĐ (việc đầu tiên của chat mới — ghi thành `QĐ-117`)

Quy trình: Fable kiểm từng điểm (đối chiếu sổ QĐ, BRD 4.16, W1c/W2c, code nếu cần) và đề xuất 2–4 lựa chọn + khuyến nghị ⟹ hỏi Owner từng câu (AskUserQuestion) ⟹ ghi `DECISIONS.md` ⟹ ghi `QĐ-117` + sửa BRD/Quy trình/US/sơ đồ/`NOTE MD/mainflows.md`/file giải thích ⟹ `docs-sync-check` ⟹ commit Docs.

**Từ file giải thích (`NOTE MD/giai-thich-kho-gia-han-chi-phi-ngan-sach.md` mục 9):**

- E1. Công thức tiết kiệm _tiềm năng_: tới ngày sớm nhất giảm được seat (chữ `QĐ-116as`) hay 12 tháng sau điểm điều chỉnh (ví dụ `FR-4.14`).
- E2. Tiết kiệm _thực_ so với mốc nào khi kỳ cũ có mua thêm seat giữa kỳ (hai cách ra 6 tr hoặc 1,33 tr).
- E3. Request _Dùng lâu dài_ duyệt tháng 12, cấp tháng 1: phần năm sau tính thế nào (`QĐ-116ah`).
- E4. (a) "số tháng còn lại của năm" trong chi phí đang chạy không cam kết có tính tháng đang chạy không; (b) license `K4` dư ghi một lần ở tháng hóa đơn hay rải theo tháng; (c) phiếu nhiều mục kiểm theo thứ tự: mục trước có trừ vào _còn lại_ khi kiểm mục sau không.
- E5. (việc tài liệu, không cần QĐ) chữ cũ "ba dòng con" ở `MF-4.md`, `MF-5.md` §5.2, bảng Căn cứ `SBF-11.md`, `SBF-20.md` ⟹ bốn dòng con (`QĐ-116aj`/`QĐ-116bf`), sửa qua spec JSON + flowkit.

**Từ `NOTE MD/mainflows.md` mục 5.4:**

- M1. Quyền theo vai khi kho `K2` hết: `QĐ-106f` cho IT mua thêm không qua Request, nhưng `KHO-06` chỉ nâng seat cho Request đã duyệt và `KHO-12` coi nâng không Request là ngoài quy trình — ghi qua cửa nào của sổ số seat, có cờ không.
- M2. `QĐ-111an`/R-44 (chênh tỷ giá không mở `SBF-11a`) so với `QĐ-116ak` (lệch số kỳ vọng > 5 % mở `SBF-11a`).
- M3. Chữ _tiềm năng_ của `QĐ-116as` (trùng E1 — chốt chung).
- M4. `KPI-5`: khuyến nghị tạm dừng bị `G2` thay thế (`QĐ-108i`) có tính _bị dữ liệu mới phủ định_ không.
- M5. `K1` năm xin lại đúng nguồn quyền khi điều chuyển: phần đã phân bổ theo tháng của kỳ đang chạy có chuyển sang phòng mới không.
- M6. _x/y câu chính sách đạt_ có đếm câu chặn cứng (hệ thống tự kiểm, hiện sẵn _Có_) không.
- M7. Hạn nộp hóa đơn lần nâng khi thuê bao không bật _Hãng xuất hóa đơn sau_: 5 ngày làm việc mới chỉ ở `KHO-11` (W1c), chưa có QĐ.
- M8. Cấp `K4` từ tồn kho: cam kết của Request giải phóng lúc cấp xong (`QĐ-106d`) — xác nhận lại sau `QĐ-116am`/`QĐ-116as`.
- M9. Cổng ≥ 2 admin: sơ đồ `SBF-20` ghi _chặn khai_, Quy trình C.2 ghi thuê bao cũ chỉ cờ (đề xuất: khai mới chặn, gia hạn/dữ liệu cũ chỉ cờ — `QĐ-114ae`).

**Rà lại (Opus, không cần QĐ trừ khi phát hiện lệch luật):**

- R1. `NOTE MD/mainflows.md`: phần SBF A/B và C/E/F do subagent viết chưa rà từng dòng; các ví dụ số tự suy ở MF-1, MF-4, MF-5, SBF-20.
- R2. Ví dụ ngân sách 2027 ở MF-4 của sổ tay lệch Quy trình 4.12 (176 vs 168; hệ số chênh 10 % vs 5 %) — thống nhất theo Quy trình/BRD.
- R3. Owner duyệt câu chữ _Bộ chính sách khởi tạo_ 1.1 (`Docs/Decisions/`) trước khi seed (`QĐ-112b`).

## 4. Quy ước (Owner)

- Trả lời **tiếng Việt**; **Skill Preflight** đầu mỗi prompt (liệt kê skill đã đọc).
- **Model theo việc** (21/11): **Fable** = research, review/verify sâu, phân tích, xây nghiệp vụ thực tế, chốt luật, phản biện thiết kế; **Opus** = viết tài liệu/docs, spec/plan, review/verify thường; **Sonnet** = code/implement/fix. Fable/Opus có thể chạm giới hạn 5 giờ — Owner đổi tài khoản; agent bị ngắt thì resume bằng SendMessage.
- **Duyệt khuyến nghị**: Owner chỉ duyệt khi đã có reviewer Fable độc lập kiểm (trang chính thức của hãng + đối chiếu code). Hỏi từng câu bằng AskUserQuestion, có khuyến nghị, giải thích bằng ví dụ khi Owner hỏi "chưa hiểu". Ghi câu trả lời vào `DECISIONS.md` ngay rồi mới ghi sổ QĐ.
- **Không ghi là GVHD/mentor xác nhận**; QĐ-82 → QĐ-116 là quyết định Owner.
- Docs: commit thẳng `main` (chỉ file của mình; không đụng file `D`/`??` của người khác), **không push**. Sau mọi lần sửa BRD/QĐ/US/sơ đồ chạy `docs-sync-check` (skill ở `Docs/.claude/skills/docs-sync-check/SKILL.md`): flowkit, check_links, ERD, check-rules, đối chiếu phiên bản/số đếm. Chạy script Diagrams/ERD bằng `python -B`; sổ QĐ là **CRLF**.
- BE: code = subagent Sonnet (brief tự chứa, stop clause, không build/seed/DB/Docker, không chạy http/integration/e2e — CI GitHub chạy), commit bằng git identity sẵn có (Chill), **không co-author**, không push trừ nhánh feature khi Owner cho; merge `dev`/`main`, deploy chỉ khi Owner bảo **trong chính tin nhắn đó**. Máy chỉ chạy bộ kiểm nhanh (skill `be-quick-check`); full test chạy CI (`gh workflow run ci.yml --ref <nhánh>`) — hỏi Owner trước khi chạy CI.
- Mô tả OpenAPI không chứa mã nội bộ (`QĐ-`, `FR-`, `US-`).
